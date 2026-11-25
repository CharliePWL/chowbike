import JSZip from 'jszip';
import { addDays } from '@/lib/dates';
import { DAYS_OF_WEEK, type Workout } from '@/types/training';
import { isExportableWorkout } from './intervalParser';
import { encodeWorkoutToFit } from './workoutEncoder';

function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'workout';
}

export function buildWorkoutFitFilename(
  workout: Workout,
  dateStr?: string,
  orderPrefix?: number
): string {
  const dayMeta = DAYS_OF_WEEK.find((d) => d.day === workout.day_of_week);
  const dayShort = dayMeta ? dayMeta.short.toLowerCase() : `d${workout.day_of_week}`;
  const titleSlug = slugify(workout.title);
  const parts: string[] = [];

  if (orderPrefix !== undefined) {
    parts.push(String(orderPrefix).padStart(2, '0'));
  }
  if (dateStr) {
    parts.push(dateStr);
  }
  parts.push(dayShort, titleSlug);

  return `${parts.join('-')}.fit`;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadWorkoutFit(
  workout: Workout,
  dateStr?: string,
  ftpWatts = 365
): void {
  const bytes = encodeWorkoutToFit(workout, { ftpWatts });
  const blob = new Blob([new Uint8Array(bytes)], {
    type: 'application/octet-stream',
  });
  const filename = buildWorkoutFitFilename(workout, dateStr);
  triggerBlobDownload(blob, filename);
}

export async function downloadWeekFitZip(
  weekStart: string,
  workouts: Workout[],
  ftpWatts = 365
): Promise<number> {
  const exportable = [...workouts]
    .filter(isExportableWorkout)
    .sort((a, b) =>
      a.day_of_week !== b.day_of_week
        ? a.day_of_week - b.day_of_week
        : a.sort_order - b.sort_order
    );

  if (exportable.length === 0) {
    return 0;
  }

  const zip = new JSZip();
  const usedNames = new Map<string, number>();

  exportable.forEach((workout, index) => {
    const dateStr = addDays(weekStart, workout.day_of_week - 1);
    let filename = buildWorkoutFitFilename(workout, dateStr, index + 1);

    const count = usedNames.get(filename) ?? 0;
    usedNames.set(filename, count + 1);
    if (count > 0) {
      filename = filename.replace(/\.fit$/, `-${count + 1}.fit`);
    }

    const bytes = encodeWorkoutToFit(workout, { ftpWatts });
    zip.file(filename, bytes);
  });

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerBlobDownload(zipBlob, `chow-cycling-week-${weekStart}.zip`);
  return exportable.length;
}
