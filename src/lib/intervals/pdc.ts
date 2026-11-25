export interface IntervalsPowerCurvePeak {
  watts: number | null;
  wPerKg: number | null;
}

export interface IntervalsPowerCurveWindow {
  curveId: '42d' | 's0';
  label: string;
  weightKg: number | null;
  peak5s: IntervalsPowerCurvePeak;
  peak1m: IntervalsPowerCurvePeak;
  peak5m: IntervalsPowerCurvePeak;
  peak20m: IntervalsPowerCurvePeak;
}

export interface IntervalsPowerCurveResult {
  configured: boolean;
  last42Days: IntervalsPowerCurveWindow | null;
  currentSeason: IntervalsPowerCurveWindow | null;
  error: string | null;
}

export interface FractionalUtilizationMetrics {
  ftpWatts: number;
  peak5mWatts: number;
  ratio: number;
  percentage: number;
  sourceCurve: '42d' | 's0';
  directive: 'raise_ceiling_vo2max' | 'balanced' | 'raise_ftp_threshold';
}

export function selectReferencePeak5m(
  pdc: IntervalsPowerCurveResult | null | undefined
): { watts: number; sourceCurve: '42d' | 's0' } | null {
  const watts42d = pdc?.last42Days?.peak5m.watts ?? null;
  if (watts42d !== null && watts42d > 0) {
    return { watts: watts42d, sourceCurve: '42d' };
  }
  const wattsSeason = pdc?.currentSeason?.peak5m.watts ?? null;
  if (wattsSeason !== null && wattsSeason > 0) {
    return { watts: wattsSeason, sourceCurve: 's0' };
  }
  return null;
}

export function computeFractionalUtilization(
  ftpWatts: number,
  peak5mWatts: number | null | undefined,
  sourceCurve: '42d' | 's0' = '42d'
): FractionalUtilizationMetrics | null {
  if (
    !Number.isFinite(ftpWatts) ||
    ftpWatts <= 0 ||
    peak5mWatts === null ||
    peak5mWatts === undefined ||
    !Number.isFinite(peak5mWatts) ||
    peak5mWatts <= 0
  ) {
    return null;
  }

  const rawRatio = ftpWatts / peak5mWatts;
  const ratio = Math.round(rawRatio * 1000) / 1000;
  const percentage = Math.round(rawRatio * 1000) / 10;

  let directive: FractionalUtilizationMetrics['directive'] = 'balanced';
  if (percentage >= 80) {
    directive = 'raise_ceiling_vo2max';
  } else if (percentage < 78) {
    directive = 'raise_ftp_threshold';
  }

  return {
    ftpWatts: Math.round(ftpWatts),
    peak5mWatts: Math.round(peak5mWatts),
    ratio,
    percentage,
    sourceCurve,
    directive,
  };
}
