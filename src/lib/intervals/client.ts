import { addDays } from '@/lib/dates';
import { buildWorkoutFitFilename } from '@/lib/fit/exportHelpers';
import { isExportableWorkout } from '@/lib/fit/intervalParser';
import { encodeWorkoutToFit } from '@/lib/fit/workoutEncoder';
import {
  computeFractionalUtilization,
  selectReferencePeak5m,
  type IntervalsPowerCurvePeak,
  type IntervalsPowerCurveResult,
  type IntervalsPowerCurveWindow,
} from '@/lib/intervals/pdc';
import type { Workout } from '@/types/training';

export type {
  FractionalUtilizationMetrics,
  IntervalsPowerCurvePeak,
  IntervalsPowerCurveResult,
  IntervalsPowerCurveWindow,
} from '@/lib/intervals/pdc';
export { computeFractionalUtilization, selectReferencePeak5m } from '@/lib/intervals/pdc';

export interface IntervalsRideSummary {
  date: string;
  name: string;
  type: string;
  duration_minutes: number;
  average_power_watts: number | null;
  normalized_power_watts: number | null;
  training_load_tss: number | null;
  average_hr_bpm: number | null;
  ride_notes: string | null;
}

export interface IntervalsFetchResult {
  configured: boolean;
  rides: IntervalsRideSummary[];
  error: string | null;
}

export interface IntervalsWellnessDay {
  date: string;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  rampRate: number | null;
}

export interface IntervalsWellnessResult {
  configured: boolean;
  latest: IntervalsWellnessDay | null;
  history: IntervalsWellnessDay[];
  error: string | null;
}

interface RawIntervalsActivity {
  id?: string;
  name?: string | null;
  type?: string | null;
  start_date_local?: string | null;
  moving_time?: number | null;
  elapsed_time?: number | null;
  icu_average_watts?: number | null;
  average_watts?: number | null;
  icu_weighted_avg_watts?: number | null;
  icu_training_load?: number | null;
  average_heartrate?: number | null;
  description?: string | null;
  notes?: string | null;
}

interface RawIntervalsWellness {
  id?: string;
  ctl?: number | null;
  atl?: number | null;
  rampRate?: number | null;
}

interface RawIntervalsPowerCurve {
  id?: string;
  name?: string | null;
  weight?: number | null;
  secs?: number[] | null;
  values?: Array<number | null> | null;
  watts?: Array<number | null> | null;
  watpkg?: Array<number | null> | null;
  watts_per_kg?: Array<number | null> | null;
}

interface RawIntervalsPowerCurvePayload {
  list?: RawIntervalsPowerCurve[] | null;
}

function getIntervalsCredentials(): {
  apiKey: string;
  athleteId: string;
  authHeader: string;
} | null {
  const apiKey = process.env.INTERVALS_API_KEY?.trim();
  const athleteId = process.env.INTERVALS_ATHLETE_ID?.trim();
  if (!apiKey || !athleteId) return null;
  const authToken = Buffer.from(`API_KEY:${apiKey}`).toString('base64');
  return {
    apiKey,
    athleteId,
    authHeader: `Basic ${authToken}`,
  };
}

function isCyclingActivity(item: RawIntervalsActivity): boolean {
  const type = (item.type ?? '').toLowerCase();
  if (/ride|cycling|bike|velomobile|handcycle/.test(type)) {
    return true;
  }
  return (
    !type &&
    ((item.icu_average_watts ?? 0) > 0 || (item.icu_weighted_avg_watts ?? 0) > 0)
  );
}

function roundOrNull(val: number | null | undefined): number | null {
  if (val === null || val === undefined || !Number.isFinite(val)) return null;
  return Math.round(val);
}

function roundOneDecimalOrNull(val: number | null | undefined): number | null {
  if (val === null || val === undefined || !Number.isFinite(val)) return null;
  return Math.round(val * 10) / 10;
}

/**
 * Fetches completed cycling activities from Intervals.icu over the past `daysBack` days.
 */
export async function fetchRecentIntervalsRides(
  daysBack = 14
): Promise<IntervalsFetchResult> {
  const creds = getIntervalsCredentials();
  if (!creds) {
    return {
      configured: false,
      rides: [],
      error: 'INTERVALS_API_KEY or INTERVALS_ATHLETE_ID is not set.',
    };
  }

  const todayUtc = new Date().toISOString().slice(0, 10);
  const oldest = addDays(todayUtc, -Math.max(1, daysBack));
  // Include +1 UTC day so post-midnight local rides in UTC+ timezones aren't clipped
  const newest = addDays(todayUtc, 1);
  const url = new URL(
    `https://intervals.icu/api/v1/athlete/${encodeURIComponent(creds.athleteId)}/activities`
  );
  url.searchParams.set('oldest', oldest);
  url.searchParams.set('newest', newest);

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: creds.authHeader,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        configured: true,
        rides: [],
        error: `Intervals.icu API error (${res.status}): ${errText.slice(0, 180) || res.statusText}`,
      };
    }

    const rawList = (await res.json()) as RawIntervalsActivity[];
    if (!Array.isArray(rawList)) {
      return { configured: true, rides: [], error: null };
    }

    const rides: IntervalsRideSummary[] = rawList
      .filter(isCyclingActivity)
      .map((item) => {
        const seconds = item.moving_time ?? item.elapsed_time ?? 0;
        const durationMinutes = Math.max(0, Math.round(seconds / 60));
        const notes =
          [item.description?.trim(), item.notes?.trim()]
            .filter(Boolean)
            .join(' | ') || null;

        return {
          date: (item.start_date_local ?? '').slice(0, 10),
          name: item.name?.trim() || 'Cycling Ride',
          type: item.type?.trim() || 'Ride',
          duration_minutes: durationMinutes,
          average_power_watts: roundOrNull(
            item.icu_average_watts ?? item.average_watts
          ),
          normalized_power_watts: roundOrNull(item.icu_weighted_avg_watts),
          training_load_tss: roundOrNull(item.icu_training_load),
          average_hr_bpm: roundOrNull(item.average_heartrate),
          ride_notes: notes,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return { configured: true, rides, error: null };
  } catch (err) {
    return {
      configured: true,
      rides: [],
      error:
        err instanceof Error
          ? err.message
          : 'Failed to connect to Intervals.icu.',
    };
  }
}

/**
 * Fetches Fitness (CTL), Fatigue (ATL), Form (TSB), and Ramp Rate from Intervals.icu.
 */
export async function fetchRecentIntervalsWellness(
  daysBack = 14
): Promise<IntervalsWellnessResult> {
  const creds = getIntervalsCredentials();
  if (!creds) {
    return {
      configured: false,
      latest: null,
      history: [],
      error: 'INTERVALS_API_KEY or INTERVALS_ATHLETE_ID is not set.',
    };
  }

  const todayUtc = new Date().toISOString().slice(0, 10);
  const oldest = addDays(todayUtc, -Math.max(1, daysBack));
  const newest = addDays(todayUtc, 1);
  const url = new URL(
    `https://intervals.icu/api/v1/athlete/${encodeURIComponent(creds.athleteId)}/wellness`
  );
  url.searchParams.set('oldest', oldest);
  url.searchParams.set('newest', newest);
  url.searchParams.set('cols', 'id,ctl,atl,rampRate');

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: creds.authHeader,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        configured: true,
        latest: null,
        history: [],
        error: `Intervals.icu wellness error (${res.status}): ${errText.slice(0, 180) || res.statusText}`,
      };
    }

    const rawList = (await res.json()) as RawIntervalsWellness[];
    if (!Array.isArray(rawList)) {
      return { configured: true, latest: null, history: [], error: null };
    }

    const history: IntervalsWellnessDay[] = rawList
      .filter((d) => d.id && (d.ctl !== null || d.atl !== null))
      .map((d) => {
        const ctl = roundOneDecimalOrNull(d.ctl);
        const atl = roundOneDecimalOrNull(d.atl);
        const tsb =
          ctl !== null && atl !== null
            ? Math.round((ctl - atl) * 10) / 10
            : null;
        return {
          date: d.id as string,
          ctl,
          atl,
          tsb,
          rampRate: roundOneDecimalOrNull(d.rampRate),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const latest = history.length > 0 ? history[history.length - 1] : null;
    return { configured: true, latest, history, error: null };
  } catch (err) {
    return {
      configured: true,
      latest: null,
      history: [],
      error:
        err instanceof Error
          ? err.message
          : 'Failed to fetch Intervals.icu wellness.',
    };
  }
}

function roundTwoDecimalsOrNull(val: number | null | undefined): number | null {
  if (val === null || val === undefined || !Number.isFinite(val)) return null;
  return Math.round(val * 100) / 100;
}

function extractCurvePeak(
  curve: RawIntervalsPowerCurve,
  targetSeconds: number,
  toleranceSeconds: number,
  fallbackWeightKg: number | null
): IntervalsPowerCurvePeak {
  const secs = Array.isArray(curve.secs) ? curve.secs : [];
  const powerArr = Array.isArray(curve.values)
    ? curve.values
    : Array.isArray(curve.watts)
      ? curve.watts
      : [];
  const wkgArr = Array.isArray(curve.watpkg)
    ? curve.watpkg
    : Array.isArray(curve.watts_per_kg)
      ? curve.watts_per_kg
      : [];

  if (secs.length === 0 || powerArr.length === 0) {
    return { watts: null, wPerKg: null };
  }

  let matchIdx = secs.indexOf(targetSeconds);
  if (matchIdx === -1) {
    let bestDiff = Infinity;
    for (let i = 0; i < secs.length; i++) {
      const diff = Math.abs(secs[i] - targetSeconds);
      if (diff <= toleranceSeconds && diff < bestDiff) {
        bestDiff = diff;
        matchIdx = i;
      }
    }
  }

  if (matchIdx === -1 || matchIdx >= powerArr.length) {
    return { watts: null, wPerKg: null };
  }

  const rawWatts = powerArr[matchIdx];
  const watts = roundOrNull(rawWatts);
  if (watts === null || watts <= 0) {
    return { watts: null, wPerKg: null };
  }

  const rawWkg = matchIdx < wkgArr.length ? wkgArr[matchIdx] : null;
  const curveWeight =
    curve.weight !== null && curve.weight !== undefined && curve.weight > 0
      ? curve.weight
      : fallbackWeightKg;

  const wPerKg =
    roundTwoDecimalsOrNull(rawWkg) ??
    (curveWeight && curveWeight > 0
      ? roundTwoDecimalsOrNull(watts / curveWeight)
      : null);

  return { watts, wPerKg };
}

function parsePowerCurveWindow(
  curve: RawIntervalsPowerCurve | undefined,
  curveId: '42d' | 's0',
  defaultLabel: string,
  fallbackWeightKg: number | null
): IntervalsPowerCurveWindow | null {
  if (!curve) return null;
  const weightKg =
    roundOneDecimalOrNull(curve.weight) ?? roundOneDecimalOrNull(fallbackWeightKg);

  return {
    curveId,
    label: curve.name?.trim() || defaultLabel,
    weightKg,
    peak5s: extractCurvePeak(curve, 5, 1, weightKg),
    peak1m: extractCurvePeak(curve, 60, 2, weightKg),
    peak5m: extractCurvePeak(curve, 300, 5, weightKg),
    peak20m: extractCurvePeak(curve, 1200, 15, weightKg),
  };
}

/**
 * Fetches 42-day and current-season Ride Power Duration Curves from Intervals.icu.
 */
export async function fetchIntervalsPowerCurves(
  athleteWeightKg?: number | null
): Promise<IntervalsPowerCurveResult> {
  const creds = getIntervalsCredentials();
  if (!creds) {
    return {
      configured: false,
      last42Days: null,
      currentSeason: null,
      error: 'INTERVALS_API_KEY or INTERVALS_ATHLETE_ID is not set.',
    };
  }

  const url = new URL(
    `https://intervals.icu/api/v1/athlete/${encodeURIComponent(creds.athleteId)}/power-curves`
  );
  url.searchParams.set('curves', '42d,s0');
  url.searchParams.set('type', 'Ride');

  const fallbackWeight =
    athleteWeightKg !== null &&
    athleteWeightKg !== undefined &&
    Number.isFinite(athleteWeightKg) &&
    athleteWeightKg > 0
      ? athleteWeightKg
      : null;

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: creds.authHeader,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        configured: true,
        last42Days: null,
        currentSeason: null,
        error: `Intervals.icu power-curves error (${res.status}): ${errText.slice(0, 180) || res.statusText}`,
      };
    }

    const raw = (await res.json()) as
      | RawIntervalsPowerCurve[]
      | RawIntervalsPowerCurvePayload;
    const curves: RawIntervalsPowerCurve[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.list)
        ? raw.list
        : [];

    const curve42d =
      curves.find((c) => c.id === '42d') ?? curves[0];
    const curveSeason =
      curves.find((c) => c.id === 's0') ??
      (curves.length > 1 ? curves[1] : undefined);

    return {
      configured: true,
      last42Days: parsePowerCurveWindow(
        curve42d,
        '42d',
        'Last 42 Days',
        fallbackWeight
      ),
      currentSeason: parsePowerCurveWindow(
        curveSeason,
        's0',
        'Current Season',
        fallbackWeight
      ),
      error: null,
    };
  } catch (err) {
    return {
      configured: true,
      last42Days: null,
      currentSeason: null,
      error:
        err instanceof Error
          ? err.message
          : 'Failed to fetch Intervals.icu power curves.',
    };
  }
}

/**
 * Pushes all non-rest workouts in a week to the Intervals.icu calendar via bulk upsert.
 */
export async function pushWeekToIntervals(params: {
  weekStart: string;
  workouts: Workout[];
  ftpWatts: number;
}): Promise<{ pushedCount: number }> {
  const creds = getIntervalsCredentials();
  if (!creds) {
    throw new Error(
      'INTERVALS_API_KEY or INTERVALS_ATHLETE_ID is not configured on the server.'
    );
  }

  const exportable = [...params.workouts]
    .filter(isExportableWorkout)
    .sort((a, b) =>
      a.day_of_week !== b.day_of_week
        ? a.day_of_week - b.day_of_week
        : a.sort_order - b.sort_order
    );

  if (exportable.length === 0) {
    throw new Error('No exportable workouts in this week to push.');
  }

  const eventsPayload = exportable.map((workout) => {
    const dateStr = addDays(params.weekStart, workout.day_of_week - 1);
    const fitBytes = encodeWorkoutToFit(workout, { ftpWatts: params.ftpWatts });
    const filename = buildWorkoutFitFilename(workout, dateStr);

    return {
      category: 'WORKOUT',
      type: 'Ride',
      start_date_local: `${dateStr}T00:00:00`,
      name: workout.title,
      description: workout.intervals ?? workout.title,
      filename,
      file_contents_base64: Buffer.from(fitBytes).toString('base64'),
      external_id: `chow-${dateStr}-${workout.sort_order}`,
    };
  });

  const url = `https://intervals.icu/api/v1/athlete/${encodeURIComponent(creds.athleteId)}/events/bulk?upsert=true`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: creds.authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(eventsPayload),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(
      `Intervals.icu push failed (${res.status}): ${errText.slice(0, 220) || res.statusText}`
    );
  }

  return { pushedCount: eventsPayload.length };
}

export function formatIntervalsPromptSection(
  result: IntervalsFetchResult
): string {
  if (!result.configured) {
    return 'Intervals.icu is not configured.';
  }
  if (result.error) {
    return `Intervals.icu fetch warning: ${result.error}`;
  }
  if (result.rides.length === 0) {
    return 'No cycling activities logged on Intervals.icu in the last 14 days.';
  }

  const totalMinutes = result.rides.reduce(
    (sum, r) => sum + r.duration_minutes,
    0
  );
  const totalTss = result.rides.reduce(
    (sum, r) => sum + (r.training_load_tss ?? 0),
    0
  );

  return JSON.stringify(
    {
      summary: {
        ride_count: result.rides.length,
        total_hours: Number((totalMinutes / 60).toFixed(1)),
        total_tss: totalTss,
      },
      rides: result.rides,
    },
    null,
    2
  );
}

export function formatIntervalsWellnessSection(
  result: IntervalsWellnessResult
): string {
  if (!result.configured) {
    return 'Intervals.icu wellness is not configured.';
  }
  if (result.error) {
    return `Intervals.icu wellness warning: ${result.error}`;
  }
  if (!result.latest) {
    return 'No recent CTL/ATL/TSB wellness metrics available.';
  }

  return JSON.stringify(
    {
      latest_date: result.latest.date,
      fitness_ctl: result.latest.ctl,
      fatigue_atl: result.latest.atl,
      form_tsb: result.latest.tsb,
      ramp_rate: result.latest.rampRate,
      recent_7_days: result.history.slice(-7),
    },
    null,
    2
  );
}

function serializeCurvePeaks(
  window: IntervalsPowerCurveWindow | null,
  fallbackWeightKg?: number | null
) {
  if (!window) return null;
  const effWeight =
    window.weightKg && window.weightKg > 0
      ? window.weightKg
      : fallbackWeightKg && fallbackWeightKg > 0
        ? fallbackWeightKg
        : null;
  const fmt = (p: IntervalsPowerCurvePeak) => ({
    watts: p.watts,
    w_per_kg:
      p.wPerKg ??
      (p.watts !== null && effWeight
        ? roundTwoDecimalsOrNull(p.watts / effWeight)
        : null),
  });
  return {
    label: window.label,
    weight_kg: effWeight,
    '5s': fmt(window.peak5s),
    '1m': fmt(window.peak1m),
    '5m': fmt(window.peak5m),
    '20m': fmt(window.peak20m),
  };
}

export function formatIntervalsPowerCurveSection(
  result: IntervalsPowerCurveResult,
  currentFtpWatts: number,
  fallbackWeightKg?: number | null
): string {
  if (!result.configured) {
    return 'Intervals.icu power curve is not configured.';
  }
  if (result.error) {
    return `Intervals.icu power curve warning: ${result.error}`;
  }
  if (!result.last42Days && !result.currentSeason) {
    return 'No power duration curve data available on Intervals.icu.';
  }

  const ref5m = selectReferencePeak5m(result);
  const fracUtil = ref5m
    ? computeFractionalUtilization(
        currentFtpWatts,
        ref5m.watts,
        ref5m.sourceCurve
      )
    : null;

  let coachingGuidance =
    'Insufficient 5m peak power data to compute Fractional Utilization.';
  if (fracUtil) {
    if (fracUtil.directive === 'raise_ceiling_vo2max') {
      coachingGuidance = `HIGH FRACTIONAL UTILIZATION (${fracUtil.percentage}% >= 80%): Athlete is operating close to their VO2max ceiling. Prioritize VO2max / aerobic ceiling sessions (anchored to 5m peak ${fracUtil.peak5mWatts}W) to raise the ceiling before adding more Threshold/Sweet Spot.`;
    } else if (fracUtil.directive === 'raise_ftp_threshold') {
      coachingGuidance = `LOWER FRACTIONAL UTILIZATION (${fracUtil.percentage}% < 78%): Athlete has plenty of aerobic ceiling above FTP. Prioritize Threshold / Sweet Spot / tempo durability work to pull FTP up closer to the 5m VO2max ceiling (${fracUtil.peak5mWatts}W).`;
    } else {
      coachingGuidance = `BALANCED FRACTIONAL UTILIZATION (${fracUtil.percentage}%, between 78% and 80%): Balance ceiling touches and sub-threshold durability according to block phase and target events.`;
    }
  }

  return JSON.stringify(
    {
      last_42_days: serializeCurvePeaks(result.last42Days, fallbackWeightKg),
      current_season: serializeCurvePeaks(result.currentSeason, fallbackWeightKg),
      fractional_utilization: fracUtil
        ? {
            current_ftp_watts: fracUtil.ftpWatts,
            peak_5m_watts: fracUtil.peak5mWatts,
            source_curve: fracUtil.sourceCurve,
            ratio: fracUtil.ratio,
            percentage: `${fracUtil.percentage}%`,
            coaching_directive: coachingGuidance,
          }
        : coachingGuidance,
    },
    null,
    2
  );
}
