const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function parseDateParts(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { year: y, month: m, day: d };
}

function toUtcDate(dateStr: string): Date {
  const { year, month, day } = parseDateParts(dateStr);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatUtcDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayDateString(): string {
  const now = new Date();
  if (typeof window === 'undefined') {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Copenhagen',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Normalizes any YYYY-MM-DD date (or today if omitted/invalid) to the Monday of its week.
 */
export function getMondayOfWeek(input?: string): string {
  const baseStr = input && DATE_REGEX.test(input) ? input : getTodayDateString();
  const date = toUtcDate(baseStr);
  const utcDay = date.getUTCDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
  const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay;
  date.setUTCDate(date.getUTCDate() + diffToMonday);
  return formatUtcDate(date);
}

export function addDays(dateStr: string, days: number): string {
  const date = toUtcDate(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDate(date);
}

export function formatShortDayDate(dateStr: string): string {
  const date = toUtcDate(dateStr);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatWeekRange(weekStart: string): string {
  const start = toUtcDate(weekStart);
  const end = toUtcDate(addDays(weekStart, 6));
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();

  const startFormatted = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(start);

  const endFormatted = new Intl.DateTimeFormat('en-US', {
    month: sameMonth ? undefined : 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(end);

  if (!sameYear) {
    const startWithYear = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(start);
    return `${startWithYear} – ${endFormatted}`;
  }

  return `${startFormatted} – ${endFormatted}`;
}

export function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '0m';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

/**
 * Signed whole-day difference (toDateStr - fromDateStr) in UTC calendar days.
 */
export function diffCalendarDays(fromDateStr: string, toDateStr: string): number {
  const from = toUtcDate(fromDateStr);
  const to = toUtcDate(toDateStr);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export function formatMonthYear(dateStr: string): string {
  const date = toUtcDate(dateStr);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatFullDate(dateStr: string): string {
  const date = toUtcDate(dateStr);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatCountdownLabel(daysOut: number): string {
  if (daysOut === 0) return 'Today';
  if (daysOut < 0) {
    const abs = Math.abs(daysOut);
    return abs === 1 ? '1 day ago' : `${abs} days ago`;
  }
  if (daysOut === 1) return '1 day out';
  if (daysOut < 14) return `${daysOut} days out`;
  const weeks = Math.round(daysOut / 7);
  return weeks === 1 ? '1 week out' : `${weeks} weeks out`;
}

export function getTrainingPhaseLabel(daysOut: number): string {
  if (daysOut <= 0) return 'Race Day';
  if (daysOut <= 7) return 'Race Week';
  if (daysOut <= 14) return 'Taper';
  if (daysOut <= 42) return 'Peak / Specialization';
  if (daysOut <= 84) return 'Build Phase';
  return 'Base Phase';
}
