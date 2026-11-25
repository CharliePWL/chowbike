import fs from 'node:fs/promises';
import path from 'node:path';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import {
  DAY_ITEM_SCHEMA,
  formatEstimatedPowerCurvePromptSection,
  normalizeZone,
  type GeneratedDayItem,
} from '@/lib/ai/blockHelpers';
import { formatGeminiError, generateStructuredJson } from '@/lib/ai/gemini';
import {
  fetchIntervalsPowerCurves,
  formatIntervalsPowerCurveSection,
} from '@/lib/intervals/client';
import { isAllowedEmail } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { DAYS_OF_WEEK, type Workout } from '@/types/training';

export const maxDuration = 60;

interface AdjustWorkoutBody {
  workoutId?: string;
  instruction?: string;
  environment?: 'indoor' | 'outdoor';
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

    const body = (await request.json()) as AdjustWorkoutBody;
    const workoutId = body.workoutId?.trim();
    const environment = body.environment === 'indoor' ? 'indoor' : 'outdoor';
    const rawInstruction = body.instruction?.trim() ?? '';
    const instruction =
      rawInstruction ||
      (environment === 'indoor'
        ? 'Convert this session to an indoor ERG trainer workout.'
        : '');

    if (!workoutId) {
      return NextResponse.json(
        { error: 'workoutId is required.' },
        { status: 400 }
      );
    }
    if (!instruction) {
      return NextResponse.json(
        { error: 'Please enter how you want to adjust this workout.' },
        { status: 400 }
      );
    }

    // Load target workout
    const { data: targetData, error: targetErr } = await supabase
      .from('workouts')
      .select('*')
      .eq('id', workoutId)
      .single();

    if (targetErr || !targetData) {
      return NextResponse.json(
        { error: 'Workout not found.' },
        { status: 404 }
      );
    }
    const targetWorkout = targetData as Workout;

    // Load week metadata, full week workouts, profile, Intervals PDC, and coach philosophy
    const [
      { data: weekData },
      { data: weekWorkouts },
      { data: profileData },
      coachProfile,
      trainingRules,
      powerCurvesResult,
    ] = await Promise.all([
      supabase
        .from('training_weeks')
        .select('*')
        .eq('id', targetWorkout.week_id)
        .maybeSingle(),
      supabase
        .from('workouts')
        .select('*')
        .eq('week_id', targetWorkout.week_id)
        .order('day_of_week', { ascending: true })
        .order('sort_order', { ascending: true }),
      supabase
        .from('athlete_profile')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(),
      fs.readFile(path.join(process.cwd(), 'coach_profile.md'), 'utf8'),
      fs.readFile(path.join(process.cwd(), 'training_rules.md'), 'utf8'),
      fetchIntervalsPowerCurves(),
    ]);

    const ftpWatts = profileData?.ai_estimated_ftp ?? 365;
    const targetDayMeta = DAYS_OF_WEEK.find(
      (d) => d.day === targetWorkout.day_of_week
    );

    const weekContext = ((weekWorkouts as Workout[] | null) ?? []).map((w) => {
      const dayLabel =
        DAYS_OF_WEEK.find((d) => d.day === w.day_of_week)?.short ??
        `Day ${w.day_of_week}`;
      return {
        is_target_day: w.id === targetWorkout.id,
        day: `${dayLabel} (${w.day_of_week})`,
        title: w.title,
        duration_minutes: w.duration_minutes,
        zone: w.zone,
        description: w.intervals,
        completed: w.completed,
        notes: w.notes,
      };
    });

    const prompt = `You are this cyclist's head coach. Adjust ONLY ONE day's workout based on the athlete's request while keeping it coherent with the rest of this week's schedule, easy-day discipline, and recovery between hard days (treating time-in-zone ranges as loose directional guidelines without trimming top-end intervals).

=== TRAINING_LOGIC_AND_PERIODIZATION_RULES ===
${trainingRules}

=== COACH_PROFILE ===
${coachProfile}

=== ATHLETE_FTP_&_ESTIMATED_POWER_CURVE ===
- Current AI-Estimated FTP: ${ftpWatts} W
- Weight: ${profileData?.weight_kg ? `${profileData.weight_kg} kg` : 'Not specified'}
- AI-Estimated Power Curve (5s / 1m / 5m / 20m / 60m):
${formatEstimatedPowerCurvePromptSection(profileData?.estimated_power_curve, ftpWatts, profileData?.weight_kg)}

=== INTERVALS_ICU_POWER_CURVE_AND_FRACTIONAL_UTILIZATION ===
${formatIntervalsPowerCurveSection(powerCurvesResult, ftpWatts, profileData?.weight_kg)}

=== THIS_WEEK_CONTEXT ===
- Week Title: ${weekData?.title ?? 'Training Week'}
- Week Focus: ${weekData?.focus ?? 'Not specified'}
- Full Week Schedule:
${JSON.stringify(weekContext, null, 2)}

=== TARGET_DAY_TO_REPLACE ===
- Day: ${targetDayMeta?.full ?? `Day ${targetWorkout.day_of_week}`} (day_of_week = ${targetWorkout.day_of_week})
- Original Title: ${targetWorkout.title}
- Original Duration: ${targetWorkout.duration_minutes} minutes
- Original Zone: ${targetWorkout.zone}
- Original Description: ${targetWorkout.intervals ?? 'None'}

=== ATHLETE_REQUEST ===
- Target Environment: ${environment.toUpperCase()}
- Request: "${instruction}"

=== STRICT OUTPUT RULES ===
1. Return a single JSON object matching the schema for day_of_week = ${targetWorkout.day_of_week}.
2. Follow the athlete's constraint/request strictly (e.g., time cap, fatigue swap to Z2/Recovery, or rest day).
3. ${environment === 'indoor' ? 'INDOOR ERG MODE OVERRIDE: Scale down total duration appropriately for an indoor trainer (typically 45-90m), remove all outdoor/uphill/terrain cues, and format intervals cleanly for ERG mode with steady target Watts and clear recovery blocks.' : 'OUTDOOR MODE: Keep outdoor road/uphill cues appropriate to the request.'}
4. NEVER write "%FTP" or "% FTP" anywhere. Use ABSOLUTE WATTS derived from the athlete's AI-Estimated Power Curve (anchoring short sprint/anaerobic intervals to 5s/1m, VO2max efforts to 5m, and threshold efforts to 20m/60m/FTP) rather than generic %FTP formulas, written in clean coach-style text (e.g., "60m easy Zone 2 @ 205-245W", "60m with 3x8' 345-365W, 4min rest", or "Rest day · off the bike").`;

    const adjusted = await generateStructuredJson<GeneratedDayItem>(
      apiKey,
      prompt,
      DAY_ITEM_SCHEMA,
      0.3
    );

    const durationMinutes = Math.max(
      0,
      Math.min(720, Math.round(Number(adjusted.duration_minutes) || 0))
    );
    const zone = normalizeZone(adjusted.zone ?? 'Z2', durationMinutes);
    const cleanTitle =
      adjusted.title?.trim() ||
      (zone === 'Rest' ? 'Rest Day' : targetWorkout.title);
    const cleanDescription =
      adjusted.coach_description?.trim() ||
      (zone === 'Rest' ? 'Rest day · off the bike' : null);

    const { data: updated, error: updateErr } = await supabase
      .from('workouts')
      .update({
        title: cleanTitle,
        duration_minutes: zone === 'Rest' ? 0 : durationMinutes,
        zone,
        intervals: cleanDescription,
      })
      .eq('id', targetWorkout.id)
      .select('*')
      .single();

    if (updateErr) {
      throw new Error(updateErr.message);
    }

    revalidatePath('/');
    return NextResponse.json({ workout: updated as Workout });
  } catch (err) {
    console.error('Error adjusting workout with AI:', err);
    const formatted = formatGeminiError(err);
    return NextResponse.json(
      { error: formatted.message },
      { status: formatted.status }
    );
  }
}
