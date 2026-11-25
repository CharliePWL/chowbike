import { Type, type Schema } from '@google/genai';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import {
  DAY_ITEM_SCHEMA,
  ESTIMATED_POWER_CURVE_SCHEMA,
  formatEstimatedPowerCurvePromptSection,
  formatUnavailableDays,
  loadCoachContext,
  persistGeneratedWeek,
  updateEstimatedFtp,
  type GeneratedDayItem,
} from '@/lib/ai/blockHelpers';
import { formatGeminiError, generateStructuredJson } from '@/lib/ai/gemini';
import { getMondayOfWeek } from '@/lib/dates';
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
import type {
  BlockPhaseStep,
  EstimatedPowerCurve,
  TrainingBlock,
} from '@/types/training';

export const maxDuration = 60;

const START_BLOCK_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    estimated_ftp_watts: {
      type: Type.INTEGER,
      description: 'Updated AI-estimated FTP in Watts.',
    },
    ftp_rationale: {
      type: Type.STRING,
      description: 'Short 1-sentence rationale for the estimated FTP in Watts.',
    },
    estimated_power_curve: ESTIMATED_POWER_CURVE_SCHEMA,
    block_name: {
      type: Type.STRING,
      description: 'Short descriptive block name, e.g. "Build Block" or "Peak Block".',
    },
    phase_outline: {
      type: Type.ARRAY,
      description: 'High-level phase outline for each week in the block.',
      items: {
        type: Type.OBJECT,
        properties: {
          week: { type: Type.INTEGER },
          phase: {
            type: Type.STRING,
            description: 'Single-word phase label: Base, Build, Overload, Peak, Taper, or Recovery.',
          },
          focus: {
            type: Type.STRING,
            description: 'Brief 1-line focus for this week.',
          },
        },
        required: ['week', 'phase', 'focus'],
      },
    },
    week_1_days: {
      type: Type.ARRAY,
      description: 'Exactly 7 daily workouts for Week 1 (Monday=1 through Sunday=7).',
      items: DAY_ITEM_SCHEMA,
    },
  },
  required: [
    'estimated_ftp_watts',
    'ftp_rationale',
    'estimated_power_curve',
    'block_name',
    'phase_outline',
    'week_1_days',
  ],
};

interface StartBlockBody {
  startWeek?: string;
  totalWeeks?: number;
  availableHours?: number;
  unavailableDays?: number[];
  blockGoal?: string;
  environment?: 'indoor' | 'outdoor';
}

interface StartBlockResponse {
  estimated_ftp_watts: number;
  ftp_rationale: string;
  estimated_power_curve: Partial<EstimatedPowerCurve>;
  block_name: string;
  phase_outline: BlockPhaseStep[];
  week_1_days: GeneratedDayItem[];
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

    const body = (await request.json()) as StartBlockBody;
    const startWeek = getMondayOfWeek(body.startWeek);
    const totalWeeks = Math.max(
      2,
      Math.min(8, Math.round(Number(body.totalWeeks) || 4))
    );
    const availableHours = Math.max(
      2,
      Math.min(35, Number(body.availableHours) || 16)
    );
    const unavailableArr = [
      ...new Set(
        (Array.isArray(body.unavailableDays) ? body.unavailableDays : [])
          .map((d) => Number(d))
          .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
      ),
    ].sort((a, b) => a - b);
    const unavailableSet = new Set(unavailableArr);
    const blockGoal = (body.blockGoal ?? '').trim();
    const environment = body.environment === 'indoor' ? 'indoor' : 'outdoor';

    const [ctx, intervalsResult, wellnessResult, powerCurvesResult] =
      await Promise.all([
        loadCoachContext(supabase, user.id, startWeek),
        fetchRecentIntervalsRides(14),
        fetchRecentIntervalsWellness(14),
        fetchIntervalsPowerCurves(),
      ]);

    const prompt = `You are this cyclist's head coach. Plan a ${totalWeeks}-week training block blueprint starting Monday ${startWeek}, and generate ONLY Week 1's 7 daily workouts right now (Weeks 2-${totalWeeks} will be adapted week-by-week later based on actual adherence).

=== TRAINING_LOGIC_AND_PERIODIZATION_RULES ===
${ctx.trainingRules}

=== COACH_PROFILE (2-SEASON HISTORICAL VOCABULARY) ===
${ctx.coachProfile}

=== STAPLE_WORKOUTS_REFERENCE ===
${ctx.stapleWorkoutsRaw}

=== ATHLETE_PROFILE ===
- Age: ${ctx.profileRow?.age ?? 'Not specified'}
- Weight: ${ctx.profileRow?.weight_kg ? `${ctx.profileRow.weight_kg} kg` : 'Not specified'}
- Current Power Data: ${ctx.profileRow?.current_power_data || 'Use baseline FTP and recent sessions'}
- Previous AI-Estimated FTP: ${ctx.currentFtp} W

=== STORED_AI_ESTIMATED_POWER_CURVE ===
${formatEstimatedPowerCurvePromptSection(ctx.profileRow?.estimated_power_curve, ctx.currentFtp, ctx.profileRow?.weight_kg)}

=== RECENT_COMPLETED_WORKOUTS_LAST_4_WEEKS ===
${ctx.completedHistory.length > 0 ? JSON.stringify(ctx.completedHistory, null, 2) : 'No completed workouts logged recently.'}

=== INTERVALS_ICU_ACTUAL_RIDES_LAST_14_DAYS ===
${formatIntervalsPromptSection(intervalsResult)}

=== INTERVALS_ICU_WELLNESS_METRICS (CTL / ATL / TSB / RAMP_RATE) ===
${formatIntervalsWellnessSection(wellnessResult)}

=== INTERVALS_ICU_POWER_CURVE_AND_FRACTIONAL_UTILIZATION ===
${formatIntervalsPowerCurveSection(powerCurvesResult, ctx.currentFtp, ctx.profileRow?.weight_kg)}

=== TARGET_RACE_CALENDAR ===
${ctx.upcomingEvents.length > 0 ? JSON.stringify(ctx.upcomingEvents, null, 2) : 'No target races scheduled yet.'}

=== NEW_BLOCK_SETUP ===
- Start Monday: ${startWeek}
- Total Weeks in Block: ${totalWeeks}
- Ride Environment Default: ${environment.toUpperCase()}
- Target Weekly Hours (loading weeks): ${availableHours}h (~${Math.round(availableHours * 60)} min)
- Days Athlete CANNOT Ride (MUST be Rest with duration_minutes=0, zone="Rest"): ${formatUnavailableDays(unavailableSet)}
- Block Goal: ${blockGoal || 'Periodize optimally toward upcoming A/B target events'}

=== STRICT RULES ===
1. Compute "estimated_ftp_watts" (integer Watts) AND update "estimated_power_curve" (5s, 1m, 5m, 20m, 60m in integer Watts—using observed peaks where recent max efforts exist and smartly interpolating unmaxed durations) while calibrating Week 1 load against Fitness (CTL), Fatigue (ATL), Form (TSB), and Ramp Rate.
2. POWER CURVE & FRACTIONAL UTILIZATION RULES:
   - If Fractional Utilization (FTP / 5-minute peak power) is high (e.g., >= 80-82%), prioritize VO2max / aerobic ceiling work to raise the roof before prescribing more threshold/sweet spot.
   - If Fractional Utilization is lower (e.g., < 78%), prioritize Threshold / Sweet Spot / tempo durability to push FTP up closer to the VO2max ceiling.
   - Anchor short-interval (5s, 1m), VO2max (5m), and threshold (20m, 60m) watt targets directly to the athlete's estimated/Intervals.icu power curve instead of guessing from %FTP.
3. Create "phase_outline" with ${totalWeeks} entries (week 1..${totalWeeks}), aligned with the seasonal phase and upcoming A/B/C target race dates (4-6w out race-specific Build, 7-14d out 30-50% Taper, 1-2d out openers).
4. Apply the Hybrid Workout Library & Pyramidal Time-in-Zone Budget: prioritize exact coach historical workouts verbatim where appropriate, fill gaps with coach-style variations, protect Z1-Z2 easy days strictly, and scale Z3-Z4 to 20-25% only if weekly volume is low (8-12h).
5. Before finalizing "week_1_days", run the Section 5 Validation Check (projected Z1-Z2, Z3-Z4, Z5-Z7 % of total weekly hours) and rebalance if any zone falls outside the phase target range.
6. Generate ONLY "week_1_days" (7 items, day_of_week 1..7).
7. ${environment === 'indoor' ? 'INDOOR ERG MODE OVERRIDE: Scale down total session durations appropriately for indoor trainer riding (typically 45-90m per ride), remove all outdoor/uphill/terrain cues, and format intervals cleanly for ERG mode.' : 'OUTDOOR DURABILITY & kJ EFFORTS: During Build, Overload, or Peak phases on longer endurance sessions (>= 2h30), occasionally prescribe fatigued/durability efforts based on kilojoules burned (e.g., "3h30 endurance at 230-255W, after 2,000 kJ do 2x15\' at 330-350W with 5min rest") rather than only fresh intervals.'}
8. NEVER write "%FTP" or "% FTP" anywhere. Use ABSOLUTE WATTS derived from "estimated_ftp_watts" and actual 5s/1m/5m PDC peaks in clean coach-style text (e.g., "3h with 2x20' 320-340W, 15min rest", "2 sets of 3x2min at 500-520W with 3min rest", "3h30 endurance, after 2,000 kJ do 2x15' at 330-350W").`;

    const generated = await generateStructuredJson<StartBlockResponse>(
      apiKey,
      prompt,
      START_BLOCK_SCHEMA,
      0.35
    );

    await updateEstimatedFtp({
      supabase,
      userId: user.id,
      profileRow: ctx.profileRow,
      estimatedFtp: generated.estimated_ftp_watts,
      rationale: generated.ftp_rationale,
      estimatedPowerCurve: generated.estimated_power_curve,
    });

    const blockName = generated.block_name?.trim() || 'Training Block';
    const outline: BlockPhaseStep[] = Array.from(
      { length: totalWeeks },
      (_, idx) => {
        const wkNum = idx + 1;
        const found = generated.phase_outline?.find((p) => p.week === wkNum) ??
          generated.phase_outline?.[idx];
        return {
          week: wkNum,
          phase:
            found?.phase?.trim() ||
            (wkNum === totalWeeks ? 'Recovery' : wkNum === 1 ? 'Build' : 'Overload'),
          focus: found?.focus?.trim() || blockGoal || 'Progressive aerobic & threshold development',
        };
      }
    );

    // Mark any prior active block as completed
    await supabase
      .from('training_blocks')
      .update({ status: 'completed' })
      .eq('user_id', user.id)
      .eq('status', 'active');

    const { data: createdBlock, error: blockErr } = await supabase
      .from('training_blocks')
      .insert({
        user_id: user.id,
        name: blockName,
        goal: blockGoal || outline[0]?.focus || null,
        start_week: startWeek,
        total_weeks: totalWeeks,
        current_week: 1,
        phase_outline: outline,
        default_hours: availableHours,
        unavailable_days: unavailableArr,
        status: 'active',
      })
      .select('*')
      .single();

    if (blockErr) {
      throw new Error(blockErr.message);
    }

    const block = createdBlock as TrainingBlock;
    const wk1Phase = outline[0]?.phase || 'Build';
    const wk1Focus = outline[0]?.focus || blockGoal || wk1Phase;

    const { week, workouts } = await persistGeneratedWeek({
      supabase,
      weekStart: startWeek,
      title: `${blockName} · Week 1 of ${totalWeeks} (${wk1Phase})`,
      focus: wk1Focus,
      blockId: block.id,
      blockName,
      blockWeek: 1,
      blockTotalWeeks: totalWeeks,
      blockPhase: wk1Phase,
      days: generated.week_1_days ?? [],
      unavailableSet,
    });

    revalidatePath('/');
    return NextResponse.json({
      block,
      week,
      workouts,
      startWeek,
    });
  } catch (err) {
    console.error('Error starting training block:', err);
    const formatted = formatGeminiError(err);
    return NextResponse.json(
      { error: formatted.message },
      { status: formatted.status }
    );
  }
}
