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
import { addDays } from '@/lib/dates';
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
import type { EstimatedPowerCurve, TrainingBlock } from '@/types/training';

export const maxDuration = 60;

const NEXT_WEEK_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    estimated_ftp_watts: {
      type: Type.INTEGER,
      description: 'Updated AI-estimated FTP in Watts.',
    },
    ftp_rationale: {
      type: Type.STRING,
      description: 'Short 1-sentence rationale for the updated FTP estimate.',
    },
    estimated_power_curve: ESTIMATED_POWER_CURVE_SCHEMA,
    adapted_focus: {
      type: Type.STRING,
      description: 'Concise 1-line focus describing how this week adapts to the previous week.',
    },
    days: {
      type: Type.ARRAY,
      description: 'Exactly 7 daily workouts (Monday=1 through Sunday=7).',
      items: DAY_ITEM_SCHEMA,
    },
  },
  required: [
    'estimated_ftp_watts',
    'ftp_rationale',
    'estimated_power_curve',
    'adapted_focus',
    'days',
  ],
};

interface NextWeekBody {
  blockId?: string;
  availableHours?: number;
  unavailableDays?: number[];
  checkInNotes?: string;
  environment?: 'indoor' | 'outdoor';
}

interface NextWeekResponse {
  estimated_ftp_watts: number;
  ftp_rationale: string;
  estimated_power_curve: Partial<EstimatedPowerCurve>;
  adapted_focus: string;
  days: GeneratedDayItem[];
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

    const body = (await request.json()) as NextWeekBody;
    let blockQuery = supabase
      .from('training_blocks')
      .select('*')
      .eq('user_id', user.id);

    if (body.blockId) {
      blockQuery = blockQuery.eq('id', body.blockId);
    } else {
      blockQuery = blockQuery
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);
    }

    const { data: blockData, error: blockLookupErr } = await blockQuery.maybeSingle();
    if (blockLookupErr) throw new Error(blockLookupErr.message);
    if (!blockData) {
      return NextResponse.json(
        { error: 'No active training block found. Start a new block first.' },
        { status: 404 }
      );
    }

    const block = blockData as TrainingBlock;
    if (block.current_week >= block.total_weeks) {
      return NextResponse.json(
        { error: 'All weeks in this block have already been generated.' },
        { status: 400 }
      );
    }

    const nextWeekNumber = block.current_week + 1;
    const nextWeekStart = addDays(block.start_week, (nextWeekNumber - 1) * 7);

    const availableHours = Math.max(
      2,
      Math.min(35, Number(body.availableHours ?? block.default_hours) || 16)
    );
    const unavailableArr = (
      Array.isArray(body.unavailableDays)
        ? body.unavailableDays
        : block.unavailable_days ?? []
    )
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
    const unavailableSet = new Set(unavailableArr);
    const checkInNotes = (body.checkInNotes ?? '').trim();
    const environment = body.environment === 'indoor' ? 'indoor' : 'outdoor';

    const [ctx, intervalsResult, wellnessResult, powerCurvesResult] =
      await Promise.all([
        loadCoachContext(supabase, user.id, nextWeekStart),
        fetchRecentIntervalsRides(14),
        fetchRecentIntervalsWellness(14),
        fetchIntervalsPowerCurves(),
      ]);

    // Fetch all prior weeks & BOTH completed and skipped workouts in THIS block
    const { data: blockWeeksRows } = await supabase
      .from('training_weeks')
      .select('id, week_start, title, focus, block_week, block_phase')
      .eq('block_id', block.id)
      .order('week_start', { ascending: true });

    let blockExecutionHistory: Array<Record<string, unknown>> = [];
    if (blockWeeksRows && blockWeeksRows.length > 0) {
      const wkIds = blockWeeksRows.map((w) => w.id);
      const { data: wkWorkouts } = await supabase
        .from('workouts')
        .select(
          'week_id, day_of_week, title, duration_minutes, zone, intervals, completed, notes'
        )
        .in('week_id', wkIds)
        .order('day_of_week', { ascending: true });

      const wkMap = new Map(blockWeeksRows.map((w) => [w.id, w]));
      blockExecutionHistory = (wkWorkouts ?? []).map((w) => {
        const wk = wkMap.get(w.week_id);
        return {
          block_week: wk?.block_week ?? null,
          week_start: wk?.week_start ?? null,
          phase: wk?.block_phase ?? null,
          day_of_week: w.day_of_week,
          title: w.title,
          duration_minutes: w.duration_minutes,
          zone: w.zone,
          description: w.intervals,
          status: w.completed ? 'COMPLETED' : 'SKIPPED_OR_INCOMPLETE',
          athlete_post_ride_notes: w.notes,
        };
      });
    }

    const plannedOutlineStep =
      block.phase_outline?.find((p) => p.week === nextWeekNumber) ??
      block.phase_outline?.[nextWeekNumber - 1];
    const targetPhase =
      plannedOutlineStep?.phase ||
      (nextWeekNumber === block.total_weeks ? 'Recovery' : 'Overload');
    const targetOutlineFocus =
      plannedOutlineStep?.focus || block.goal || targetPhase;

    const prompt = `You are this cyclist's head coach. Adaptively generate Week ${nextWeekNumber} of ${block.total_weeks} (Monday ${nextWeekStart}) for the active training block.

=== TRAINING_LOGIC_AND_PERIODIZATION_RULES ===
${ctx.trainingRules}

=== COACH_PROFILE (2-SEASON HISTORICAL VOCABULARY) ===
${ctx.coachProfile}

=== STAPLE_WORKOUTS_REFERENCE ===
${ctx.stapleWorkoutsRaw}

=== ATHLETE_PROFILE & FTP ===
- Age: ${ctx.profileRow?.age ?? 'Not specified'}
- Weight: ${ctx.profileRow?.weight_kg ? `${ctx.profileRow.weight_kg} kg` : 'Not specified'}
- Current Power Data: ${ctx.profileRow?.current_power_data || 'Use baseline FTP and block execution'}
- Current AI-Estimated FTP: ${ctx.currentFtp} W

=== STORED_AI_ESTIMATED_POWER_CURVE ===
${formatEstimatedPowerCurvePromptSection(ctx.profileRow?.estimated_power_curve, ctx.currentFtp, ctx.profileRow?.weight_kg)}

=== CURRENT_BLOCK_BLUEPRINT ===
- Block Name: ${block.name}
- Block Goal: ${block.goal || 'Not specified'}
- Total Weeks: ${block.total_weeks}
- Entering Week: Week ${nextWeekNumber} of ${block.total_weeks}
- Planned Phase for Week ${nextWeekNumber}: ${targetPhase}
- Planned Focus for Week ${nextWeekNumber}: ${targetOutlineFocus}
- Full Phase Outline: ${JSON.stringify(block.phase_outline)}

=== PREVIOUS_WEEK(S)_EXECUTION_IN_THIS_BLOCK (COMPLETED vs SKIPPED + NOTES) ===
${blockExecutionHistory.length > 0 ? JSON.stringify(blockExecutionHistory, null, 2) : 'No sessions logged yet in this block.'}

=== INTERVALS_ICU_ACTUAL_RIDES_LAST_14_DAYS ===
${formatIntervalsPromptSection(intervalsResult)}

=== INTERVALS_ICU_WELLNESS_METRICS (CTL / ATL / TSB / RAMP_RATE) ===
${formatIntervalsWellnessSection(wellnessResult)}

=== INTERVALS_ICU_POWER_CURVE_AND_FRACTIONAL_UTILIZATION ===
${formatIntervalsPowerCurveSection(powerCurvesResult, ctx.currentFtp, ctx.profileRow?.weight_kg)}

=== UPCOMING_TARGET_EVENTS ===
${ctx.upcomingEvents.length > 0 ? JSON.stringify(ctx.upcomingEvents, null, 2) : 'No target races scheduled yet.'}

=== THIS_WEEK_CHECK_IN ===
- Ride Environment Default: ${environment.toUpperCase()}
- Available Hours This Week: ${availableHours}h (~${Math.round(availableHours * 60)} min) — scale down if target phase is Recovery/Deload or if INDOOR!
- Days Athlete CANNOT Ride (MUST be Rest with duration_minutes=0, zone="Rest"): ${formatUnavailableDays(unavailableSet)}
- Athlete Notes for This Week: ${checkInNotes || 'None'}

=== ADAPTATION & OUTPUT RULES ===
1. Carefully review the actual completed rides from Intervals.icu (duration, average power, normalized power, TSS, average HR, ride notes), the athlete's Wellness metrics (Fitness CTL, Fatigue ATL, Form TSB, Ramp Rate), AND what was completed vs skipped in the previous week(s) of this block. If TSB is deeply negative, Ramp Rate is high, or notes/sessions show heavy strain or missed days, dial back intensity or volume for Week ${nextWeekNumber} to avoid overreaching.
2. POWER CURVE & FRACTIONAL UTILIZATION RULES:
   - If Fractional Utilization (FTP / 5-minute peak power) is high (e.g., >= 80-82%), prioritize VO2max / aerobic ceiling work to raise the roof before prescribing more threshold/sweet spot.
   - If Fractional Utilization is lower (e.g., < 78%), prioritize Threshold / Sweet Spot / tempo durability to push FTP up closer to the VO2max ceiling.
   - Anchor short-interval (5s, 1m), VO2max (5m), and threshold (20m, 60m) watt targets directly to the athlete's estimated/Intervals.icu power curve instead of guessing from %FTP.
3. BLOCK CONSISTENCY & HYBRID LIBRARY: Review the key interval workouts prescribed in earlier weeks of this block above and intentionally repeat core interval workout(s) verbatim or progressively across the block (unless entering Recovery/Taper or event-specific adjustment requires shifting), prioritizing exact historical coach workouts first and protecting easy Z1-Z2 days strictly.
4. EVENT-DRIVEN TAPER & PHASE BUDGET: Apply any A/B/C target race adjustments (4-6w Build, 7-14d Taper 30-50% volume cut, 1-2d Openers, or C-race recovery). Before finalizing "days", run the Section 5 Validation Check (projected Z1-Z2, Z3-Z4, Z5-Z7 % of weekly hours) against the current phase targets (accounting for Volume Scaling if ${availableHours}h is low).
5. ${environment === 'indoor' ? 'INDOOR ERG MODE OVERRIDE: Scale down total session durations appropriately for indoor trainer riding (typically 45-90m per ride instead of 3-5h), remove all outdoor/uphill/terrain cues, and format every workout cleanly with steady target Watts and explicit rest intervals for ERG mode.' : 'OUTDOOR DURABILITY & kJ EFFORTS: During Build, Overload, or Peak phases on longer endurance sessions (>= 2h30), occasionally prescribe fatigued/durability intervals anchored to kilojoules burned (e.g., "3h30 endurance at 230-255W, after 2,000 kJ do 2x15\' at 330-350W with 5min rest") rather than only fresh early-ride intervals.'}
6. Re-evaluate and return "estimated_ftp_watts" (integer Watts) AND update "estimated_power_curve" (5s, 1m, 5m, 20m, 60m in integer Watts—using observed peaks from Intervals.icu/logged rides where available and smartly interpolating unmaxed durations).
7. Return "days" with EXACTLY 7 items (day_of_week 1..7).
8. NEVER write "%FTP" or "% FTP" anywhere. Use ABSOLUTE WATTS derived from "estimated_ftp_watts" and actual 5s/1m/5m PDC peaks in clean coach-style text (e.g., "3h with 2x20' 320-340W, 15min rest", "2 sets of 3x2min at 500-520W with 3min rest", "3h30 endurance, after 2,000 kJ do 2x15' at 330-350W").`;

    const generated = await generateStructuredJson<NextWeekResponse>(
      apiKey,
      prompt,
      NEXT_WEEK_SCHEMA,
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

    const { week, workouts } = await persistGeneratedWeek({
      supabase,
      weekStart: nextWeekStart,
      title: `${block.name} · Week ${nextWeekNumber} of ${block.total_weeks} (${targetPhase})`,
      focus: generated.adapted_focus?.trim() || targetOutlineFocus,
      blockId: block.id,
      blockName: block.name,
      blockWeek: nextWeekNumber,
      blockTotalWeeks: block.total_weeks,
      blockPhase: targetPhase,
      days: generated.days ?? [],
      unavailableSet,
    });

    const { data: updatedBlock, error: updBlockErr } = await supabase
      .from('training_blocks')
      .update({
        current_week: nextWeekNumber,
        default_hours: availableHours,
        unavailable_days: unavailableArr,
      })
      .eq('id', block.id)
      .select('*')
      .single();

    if (updBlockErr) throw new Error(updBlockErr.message);

    revalidatePath('/');
    return NextResponse.json({
      block: updatedBlock,
      week,
      workouts,
      weekStart: nextWeekStart,
      intervalsRidesCount: intervalsResult.rides.length,
    });
  } catch (err) {
    console.error('Error generating next block week:', err);
    const formatted = formatGeminiError(err);
    return NextResponse.json(
      { error: formatted.message },
      { status: formatted.status }
    );
  }
}
