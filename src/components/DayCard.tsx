'use client';

import { formatDuration, formatShortDayDate } from '@/lib/dates';
import { getZoneMeta, type Workout, type WorkoutEnvironment } from '@/types/training';
import { WorkoutItem } from './WorkoutItem';

interface DayCardProps {
  shortName: string;
  fullName: string;
  dateStr: string;
  isToday: boolean;
  workouts: Workout[];
  ftpWatts: number;
  weekEnvironment?: WorkoutEnvironment;
}

/** Map a workout's primary zone to a 3px left-accent color */
function zoneAccentColor(zone: string): string {
  const z = zone.trim().toLowerCase();
  if (z.includes('anaerobic') || z.includes('z6')) return '#B84A32'; // burnt orange-red
  if (z.includes('vo2') || z.includes('z5')) return '#C46A28';       // burnt amber
  if (z.includes('threshold') || z.includes('z4')) return '#B8882A'; // warm ochre
  if (z.includes('tempo') || z.includes('z3')) return '#7A9AB5';     // muted steel blue
  if (z.includes('z2') || z.includes('endurance')) return '#5A8299'; // cool steel
  return '#A8BAC9'; // recovery / rest — pale slate
}

/** Primary zone of a day: highest intensity workout wins */
function primaryZoneForDay(workouts: Workout[]): string {
  const order = ['Anaerobic', 'VO2max', 'Threshold', 'Tempo', 'Z2', 'Recovery', 'Rest'];
  for (const z of order) {
    if (workouts.some((w) => getZoneMeta(w.zone).value === z)) return z;
  }
  return workouts[0]?.zone ?? 'Rest';
}

export function DayCard({
  shortName,
  fullName,
  dateStr,
  isToday,
  workouts,
  ftpWatts,
  weekEnvironment = 'outdoor',
}: DayCardProps) {
  const totalMinutes = workouts.reduce(
    (sum, item) => sum + (item.duration_minutes || 0),
    0
  );

  const hasWorkouts = workouts.length > 0 && workouts.some((w) => w.duration_minutes > 0);
  const accentColor = hasWorkouts ? zoneAccentColor(primaryZoneForDay(workouts)) : '#D4D4CE';

  return (
    <section
      aria-label={`${fullName} ${dateStr}`}
      className={`flex overflow-hidden rounded-sm shadow-[0_1px_3px_0_rgba(0,0,0,0.07)] ${
        isToday ? 'ring-1 ring-[#3B5B7A]' : ''
      }`}
      style={{ background: '#fff' }}
    >
      {/* 3px vertical zone accent bar */}
      <div
        className="shrink-0"
        style={{ width: 3, background: accentColor }}
        aria-hidden="true"
      />

      {/* Card body */}
      <div className="min-w-0 flex-1 border border-l-0 border-[#D4D4CE]"
           style={isToday ? { borderColor: '#3B5B7A' } : undefined}>
        {/* Header strip */}
        <div
          className={`flex items-center justify-between gap-2 border-b px-4 py-2.5 ${
            isToday
              ? 'border-[#2A2A28] bg-[#181818] text-[#F7F7F5]'
              : 'border-[#D4D4CE] bg-[#EFEFEC] text-[#181818]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <h2 className="text-xs font-semibold tracking-[0.08em] uppercase">
              {shortName}
            </h2>
            <span
              className={`font-mono text-[11px] font-normal uppercase ${
                isToday ? 'text-[#B5B5B0]' : 'text-[#6B6B68]'
              }`}
            >
              {formatShortDayDate(dateStr)}
            </span>
            {isToday ? (
              <span className="border border-[#3B5B7A] bg-[#3B5B7A] px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-widest text-[#F7F7F5] uppercase">
                TODAY
              </span>
            ) : null}
          </div>

          {totalMinutes > 0 ? (
            <span
              className={`font-mono text-xs font-medium tabular-nums ${
                isToday ? 'text-[#F7F7F5]' : 'text-[#181818]'
              }`}
            >
              {formatDuration(totalMinutes)}
            </span>
          ) : null}
        </div>

        {/* Sessions — no inner border boxes, just spacing */}
        <div className="space-y-4 p-4">
          {workouts.length === 0 ? (
            <div className="border border-dashed border-[#D4D4CE] bg-[#F7F7F5] px-4 py-5 text-center font-mono text-[11px] font-medium tracking-wide text-[#6B6B68] uppercase">
              No session scheduled
            </div>
          ) : (
            workouts.map((workout) => (
              <WorkoutItem
                key={workout.id}
                workout={workout}
                dateStr={dateStr}
                ftpWatts={ftpWatts}
                weekEnvironment={weekEnvironment}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}
