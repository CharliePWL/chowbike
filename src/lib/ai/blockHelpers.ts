import fs from 'node:fs/promises';
import path from 'node:path';
import { Type, type Schema } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays } from '@/lib/dates';
import type {
  AthleteProfile,
  EstimatedPowerCurve,
  TrainingWeek,
  TrainingZone,
  Workout,
  WorkoutEnvironment,
} from '@/types/training';

export const ALLOWED_ZONES: TrainingZone[] = [
  'Recovery',
  'Z2',
  'Tempo',
  'Threshold',
  'VO2max',
  'Anaerobic',
  'Rest',
];

export const DAY_ITEM_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    day_of_week: { type: Type.INTEGER },
    title: { type: Type.STRING },
    duration_minutes: { type: Type.INTEGER },
    zone: {
      type: Type.STRING,
      format: 'enum',
      enum: ALLOWED_ZONES,
    },
    coach_description: {
      type: Type.STRING,
      description:
        'Concise coach-style text using ABSOLUTE WATTS derived from estimated_ftp_watts (NEVER %FTP). Examples: "3h with 2x20\' 320-340W, 15min rest", "2 sets of 3x2min at 500-520W with 3min rest", "2h30 endurance ride with 1x8min uphill maximum at 405W". For rest: "Rest day · off the bike".',
    },
  },
  required: [
    'day_of_week',
    'title',
    'duration_minutes',
    'zone',
    'coach_description',
  ],
};

export const ESTIMATED_POWER_CURVE_SCHEMA: Schema = {
  type: Type.OBJECT,
  description:
    'Estimated current peak power curve in integer Watts across 5 durations based on observed efforts and physiological interpolation.',
  properties: {
    watts_5s: {
      type: Type.INTEGER,
      description: 'Estimated current 5-second sprint peak power in Watts.',
    },
    watts_1m: {
      type: Type.INTEGER,
      description: 'Estimated current 1-minute anaerobic capacity peak power in Watts.',
    },
    watts_5m: {
      type: Type.INTEGER,
      description: 'Estimated current 5-minute VO2max peak power in Watts.',
    },
    watts_20m: {
      type: Type.INTEGER,
      description: 'Estimated current 20-minute threshold power in Watts.',
    },
    watts_60m: {
      type: Type.INTEGER,
      description: 'Estimated current 60-minute sustainable power in Watts.',
    },
    notes: {
      type: Type.STRING,
      description:
        'Brief 1-sentence note explaining which durations came from observed rides vs interpolation.',
    },
  },
  required: ['watts_5s', 'watts_1m', 'watts_5m', 'watts_20m', 'watts_60m'],
};

export function normalizeEstimatedPowerCurve(
  raw: Partial<EstimatedPowerCurve> | null | undefined,
  estimatedFtp: number
): EstimatedPowerCurve {
  const safeFtp = Math.max(120, Math.min(600, Math.round(estimatedFtp || 365)));
  const clampWatt = (val: unknown, fallback: number) => {
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 50) return fallback;
    return Math.max(80, Math.min(2500, Math.round(num)));
  };

  // Enforce descending physiological monotonicity from 5s down to 60m
  const watts_60m = clampWatt(raw?.watts_60m, Math.round(safeFtp * 0.96));
  const watts_20m = Math.max(
    watts_60m,
    clampWatt(raw?.watts_20m, Math.round(safeFtp * 1.05))
  );
  const watts_5m = Math.max(
    watts_20m,
    clampWatt(raw?.watts_5m, Math.round(safeFtp * 1.22))
  );
  const watts_1m = Math.max(
    watts_5m,
    clampWatt(raw?.watts_1m, Math.round(safeFtp * 1.65))
  );
  const watts_5s = Math.max(
    watts_1m,
    clampWatt(raw?.watts_5s, Math.round(safeFtp * 3.0))
  );

  return {
    watts_5s,
    watts_1m,
    watts_5m,
    watts_20m,
    watts_60m,
    updated_at: new Date().toISOString(),
    notes: typeof raw?.notes === 'string' && raw.notes.trim() ? raw.notes.trim() : undefined,
  };
}

export function formatEstimatedPowerCurvePromptSection(
  curve: EstimatedPowerCurve | null | undefined,
  ftpWatts: number,
  weightKg?: number | null
): string {
  if (!curve) {
    return 'No AI-estimated power curve saved yet; use Intervals.icu curve peaks or profile power notes.';
  }
  const effWeight =
    weightKg !== null &&
    weightKg !== undefined &&
    Number.isFinite(weightKg) &&
    weightKg > 0
      ? weightKg
      : null;
  const point = (watts: number) => ({
    watts,
    w_per_kg: effWeight ? Math.round((watts / effWeight) * 100) / 100 : null,
  });
  const fracPct =
    curve.watts_5m > 0
      ? Math.round((ftpWatts / curve.watts_5m) * 1000) / 10
      : null;

  return JSON.stringify(
    {
      '5s': point(curve.watts_5s),
      '1m': point(curve.watts_1m),
      '5m': point(curve.watts_5m),
      '20m': point(curve.watts_20m),
      '60m': point(curve.watts_60m),
      fractional_utilization_pct: fracPct !== null ? `${fracPct}%` : null,
      updated_at: curve.updated_at ?? null,
      notes: curve.notes ?? null,
    },
    null,
    2
  );
}

export interface GeneratedDayItem {
  day_of_week: number;
  title: string;
  duration_minutes: number;
  zone: string;
  coach_description: string;
}

export function normalizeZone(
  rawZone: string,
  durationMinutes: number
): TrainingZone {
  if (durationMinutes <= 0) return 'Rest';
  const match = ALLOWED_ZONES.find(
    (z) => z.toLowerCase() === rawZone.trim().toLowerCase()
  );
  return match ?? 'Z2';
}

export function formatUnavailableDays(days: Set<number>): string {
  if (days.size === 0) return 'None';
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => `${d} (${names[d - 1]})`)
    .join(', ');
}

export async function loadCoachContext(
  supabase: SupabaseClient,
  userId: string,
  referenceWeekStart: string
) {
  const [
    coachProfile,
    trainingRules,
    stapleWorkoutsRaw,
    profileRes,
    eventsRes,
    recentWeeksRes,
  ] = await Promise.all([
    fs.readFile(path.join(process.cwd(), 'coach_profile.md'), 'utf8'),
    fs.readFile(path.join(process.cwd(), 'training_rules.md'), 'utf8'),
    fs.readFile(
      path.join(process.cwd(), 'staple_cycling_workouts.json'),
      'utf8'
    ),
    supabase
      .from('athlete_profile')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('target_events')
      .select('name, event_date, priority, event_type, notes')
      .gte('event_date', referenceWeekStart)
      .order('event_date', { ascending: true })
      .limit(10),
    supabase
      .from('training_weeks')
      .select('id, week_start, title, focus')
      .gte('week_start', addDays(referenceWeekStart, -28))
      .lt('week_start', referenceWeekStart)
      .order('week_start', { ascending: true }),
  ]);

  const profileRow = (profileRes.data as AthleteProfile | null) ?? null;
  const recentWeeks = recentWeeksRes.data ?? [];

  let completedHistory: Array<Record<string, unknown>> = [];
  if (recentWeeks.length > 0) {
    const weekIds = recentWeeks.map((w) => w.id);
    const { data: completedRows } = await supabase
      .from('workouts')
      .select(
        'week_id, day_of_week, title, duration_minutes, zone, intervals, notes, completed_at'
      )
      .in('week_id', weekIds)
      .eq('completed', true)
      .order('day_of_week', { ascending: true });

    const weekMap = new Map(recentWeeks.map((w) => [w.id, w]));
    completedHistory = (completedRows ?? []).map((row) => ({
      week_start: weekMap.get(row.week_id)?.week_start ?? null,
      day_of_week: row.day_of_week,
      title: row.title,
      duration_minutes: row.duration_minutes,
      zone: row.zone,
      description: row.intervals,
      athlete_notes: row.notes,
    }));
  }

  return {
    coachProfile,
    trainingRules,
    stapleWorkoutsRaw,
    profileRow,
    currentFtp: profileRow?.ai_estimated_ftp ?? 365,
    upcomingEvents: eventsRes.data ?? [],
    completedHistory,
  };
}

export async function updateEstimatedFtp(params: {
  supabase: SupabaseClient;
  userId: string;
  profileRow: AthleteProfile | null;
  estimatedFtp: number;
  rationale?: string;
  estimatedPowerCurve?: Partial<EstimatedPowerCurve> | null;
}): Promise<number> {
  const {
    supabase,
    userId,
    profileRow,
    estimatedFtp,
    rationale,
    estimatedPowerCurve,
  } = params;
  const clampedFtp = Math.max(
    120,
    Math.min(600, Math.round(estimatedFtp || profileRow?.ai_estimated_ftp || 365))
  );
  const nextCurve = estimatedPowerCurve
    ? normalizeEstimatedPowerCurve(estimatedPowerCurve, clampedFtp)
    : profileRow?.estimated_power_curve ?? null;

  await supabase.from('athlete_profile').upsert(
    {
      user_id: userId,
      age: profileRow?.age ?? null,
      weight_kg: profileRow?.weight_kg ?? null,
      current_power_data: profileRow?.current_power_data ?? null,
      ai_estimated_ftp: clampedFtp,
      ftp_rationale: rationale?.trim() || profileRow?.ftp_rationale || null,
      ftp_updated_at: new Date().toISOString(),
      estimated_power_curve: nextCurve,
    },
    { onConflict: 'user_id' }
  );

  return clampedFtp;
}

export async function persistGeneratedWeek(params: {
  supabase: SupabaseClient;
  weekStart: string;
  title: string;
  focus: string;
  blockId: string;
  blockName: string;
  blockWeek: number;
  blockTotalWeeks: number;
  blockPhase: string;
  environment?: WorkoutEnvironment;
  days: GeneratedDayItem[];
  unavailableSet: Set<number>;
}): Promise<{ week: TrainingWeek; workouts: Workout[] }> {
  const {
    supabase,
    weekStart,
    title,
    focus,
    blockId,
    blockName,
    blockWeek,
    blockTotalWeeks,
    blockPhase,
    environment = 'outdoor',
    days,
    unavailableSet,
  } = params;

  const { data: existingWeek } = await supabase
    .from('training_weeks')
    .select('id')
    .eq('week_start', weekStart)
    .maybeSingle();

  const richFields = {
    title,
    focus,
    environment,
    block_id: blockId,
    block_name: blockName,
    block_week: blockWeek,
    block_total_weeks: blockTotalWeeks,
    block_phase: blockPhase,
  };

  let savedWeek: TrainingWeek;
  if (existingWeek) {
    const { data: updated, error: updErr } = await supabase
      .from('training_weeks')
      .update(richFields)
      .eq('id', existingWeek.id)
      .select('*')
      .single();

    if (updErr) {
      const { data: fb, error: fbErr } = await supabase
        .from('training_weeks')
        .update({ title, focus })
        .eq('id', existingWeek.id)
        .select('*')
        .single();
      if (fbErr) throw new Error(fbErr.message);
      savedWeek = fb as TrainingWeek;
    } else {
      savedWeek = updated as TrainingWeek;
    }

    const { error: delErr } = await supabase
      .from('workouts')
      .delete()
      .eq('week_id', savedWeek.id);
    if (delErr) throw new Error(delErr.message);
  } else {
    const { data: created, error: insErr } = await supabase
      .from('training_weeks')
      .insert({ week_start: weekStart, ...richFields })
      .select('*')
      .single();

    if (insErr) {
      const { data: fb, error: fbErr } = await supabase
        .from('training_weeks')
        .insert({ week_start: weekStart, title, focus })
        .select('*')
        .single();
      if (fbErr) throw new Error(fbErr.message);
      savedWeek = fb as TrainingWeek;
    } else {
      savedWeek = created as TrainingWeek;
    }
  }

  const byDay = new Map<number, GeneratedDayItem>();
  days.forEach((d, idx) => {
    const dayNum =
      Number.isInteger(d.day_of_week) &&
      d.day_of_week >= 1 &&
      d.day_of_week <= 7
        ? d.day_of_week
        : idx + 1;
    if (!byDay.has(dayNum) && dayNum >= 1 && dayNum <= 7) {
      byDay.set(dayNum, d);
    }
  });

  const workoutRows = [1, 2, 3, 4, 5, 6, 7].map((day) => {
    if (unavailableSet.has(day)) {
      return {
        week_id: savedWeek.id,
        day_of_week: day,
        sort_order: 0,
        title: 'Rest Day',
        duration_minutes: 0,
        zone: 'Rest',
        intervals: 'Rest day · off the bike',
        environment,
        completed: false,
        notes: null,
        completed_at: null,
      };
    }

    const raw = byDay.get(day);
    if (!raw) {
      return {
        week_id: savedWeek.id,
        day_of_week: day,
        sort_order: 0,
        title: 'Rest Day',
        duration_minutes: 0,
        zone: 'Rest',
        intervals: 'Rest day · off the bike',
        environment,
        completed: false,
        notes: null,
        completed_at: null,
      };
    }

    const durationMinutes = Math.max(
      0,
      Math.round(Number(raw.duration_minutes) || 0)
    );
    const zone = normalizeZone(raw.zone ?? 'Z2', durationMinutes);

    return {
      week_id: savedWeek.id,
      day_of_week: day,
      sort_order: 0,
      title:
        raw.title?.trim() ||
        (zone === 'Rest' ? 'Rest Day' : 'Endurance Ride'),
      duration_minutes: zone === 'Rest' ? 0 : durationMinutes,
      zone,
      intervals:
        raw.coach_description?.trim() ||
        (zone === 'Rest' ? 'Rest day · off the bike' : null),
      environment,
      completed: false,
      notes: null,
      completed_at: null,
    };
  });

  const { data: insertedWorkouts, error: insWorkoutsErr } = await supabase
    .from('workouts')
    .insert(workoutRows)
    .select('*')
    .order('day_of_week', { ascending: true });

  if (insWorkoutsErr) throw new Error(insWorkoutsErr.message);

  return {
    week: savedWeek,
    workouts: (insertedWorkouts as Workout[]) ?? [],
  };
}
