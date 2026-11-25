import { Type, type Schema } from '@google/genai';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import {
  ESTIMATED_POWER_CURVE_SCHEMA,
  normalizeEstimatedPowerCurve,
} from '@/lib/ai/blockHelpers';
import { formatGeminiError, generateStructuredJson } from '@/lib/ai/gemini';
import {
  fetchIntervalsPowerCurves,
  fetchRecentIntervalsRides,
  fetchRecentIntervalsWellness,
  formatIntervalsPowerCurveSection,
  formatIntervalsPromptSection,
  formatIntervalsWellnessSection,
} from '@/lib/intervals/client';
import { isAllowedEmail } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import type { EstimatedPowerCurve } from '@/types/training';

export const maxDuration = 60;

const FTP_ESTIMATE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    estimated_ftp_watts: {
      type: Type.INTEGER,
      description: 'AI-estimated current Functional Threshold Power in Watts.',
    },
    rationale: {
      type: Type.STRING,
      description:
        'Concise 1-2 sentence explanation of how the FTP estimate was derived from power data and recent completed sessions.',
    },
    estimated_power_curve: ESTIMATED_POWER_CURVE_SCHEMA,
  },
  required: ['estimated_ftp_watts', 'rationale', 'estimated_power_curve'],
};

interface EstimateBody {
  age?: number | null;
  weightKg?: number | null;
  currentPowerData?: string | null;
  baselineFtp?: number | null;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || !isAllowedEmail(user.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is not configured on the server.' },
        { status: 500 }
      );
    }

    const body = (await request.json()) as EstimateBody;
    const baselineFtp =
      body.baselineFtp && body.baselineFtp > 0 ? Math.round(body.baselineFtp) : 365;

    const [
      { data: existingProfile },
      { data: recentCompleted },
      intervalsResult,
      wellnessResult,
      powerCurvesResult,
    ] = await Promise.all([
      supabase
        .from('athlete_profile')
        .select('estimated_power_curve')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('workouts')
        .select('title, duration_minutes, zone, intervals, notes, completed_at')
        .eq('completed', true)
        .order('completed_at', { ascending: false })
        .limit(20),
      fetchRecentIntervalsRides(14),
      fetchRecentIntervalsWellness(14),
      fetchIntervalsPowerCurves(body.weightKg),
    ]);

    const prompt = `You are an elite cycling physiologist. Estimate this rider's current Functional Threshold Power (FTP) in Watts AND update their estimated Power Duration Curve (5s, 1m, 5m, 20m, 60m in integer Watts).

=== ATHLETE BIOMETRICS & POWER DATA ===
- Age: ${body.age ?? 'Not specified'}
- Weight: ${body.weightKg ? `${body.weightKg} kg` : 'Not specified'}
- Baseline / Previous FTP: ${baselineFtp} W
- Previous AI-Estimated Power Curve: ${existingProfile?.estimated_power_curve ? JSON.stringify(existingProfile.estimated_power_curve) : 'None yet'}
- Current Power Data / Field Tests: ${body.currentPowerData?.trim() || 'None provided'}

=== INTERVALS_ICU_ACTUAL_RIDES_LAST_14_DAYS ===
${formatIntervalsPromptSection(intervalsResult)}

=== INTERVALS_ICU_POWER_CURVES (42D & SEASON) ===
${formatIntervalsPowerCurveSection(powerCurvesResult, baselineFtp, body.weightKg)}

=== INTERVALS_ICU_WELLNESS_METRICS (CTL / ATL / TSB / RAMP_RATE) ===
${formatIntervalsWellnessSection(wellnessResult)}

=== RECENT COMPLETED WORKOUTS & NOTES ===
${recentCompleted && recentCompleted.length > 0 ? JSON.stringify(recentCompleted, null, 2) : 'No completed workouts logged yet.'}

=== ESTIMATION RULES ===
1. Return a realistic integer "estimated_ftp_watts" and a brief 1-2 sentence rationale.
2. Also return "estimated_power_curve" across 5s, 1m, 5m, 20m, and 60m:
   - Anchor directly to any genuine maximal efforts from the Intervals.icu 42-day/season power curves, completed workouts, or field test notes.
   - If the rider has NOT performed an all-out test at one or more durations recently (e.g., no recent 5s sprint or 60m TT), smartly interpolate/estimate those durations consistently with their rider phenotype, recent sub-maximal power numbers, and estimated FTP (ensuring watts_5s >= watts_1m >= watts_5m >= watts_20m >= watts_60m).`;

    const result = await generateStructuredJson<{
      estimated_ftp_watts: number;
      rationale: string;
      estimated_power_curve: Partial<EstimatedPowerCurve>;
    }>(apiKey, prompt, FTP_ESTIMATE_SCHEMA, 0.2);

    const estimatedFtp = Math.max(
      120,
      Math.min(600, Math.round(result.estimated_ftp_watts))
    );
    const normalizedCurve = normalizeEstimatedPowerCurve(
      result.estimated_power_curve,
      estimatedFtp
    );
    const nowIso = new Date().toISOString();

    const { data: savedProfile, error: saveErr } = await supabase
      .from('athlete_profile')
      .upsert(
        {
          user_id: user.id,
          age: body.age ?? null,
          weight_kg: body.weightKg ?? null,
          current_power_data: body.currentPowerData?.trim() || null,
          ai_estimated_ftp: estimatedFtp,
          ftp_rationale: result.rationale.trim(),
          ftp_updated_at: nowIso,
          estimated_power_curve: normalizedCurve,
        },
        { onConflict: 'user_id' }
      )
      .select('*')
      .single();

    if (saveErr) {
      throw new Error(saveErr.message);
    }

    revalidatePath('/');
    return NextResponse.json({ profile: savedProfile });
  } catch (err) {
    console.error('Error estimating FTP:', err);
    const formatted = formatGeminiError(err);
    return NextResponse.json(
      { error: formatted.message },
      { status: formatted.status }
    );
  }
}
