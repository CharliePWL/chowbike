'use client';

import { ArrowRight, Flag, Trophy } from 'lucide-react';
import {
  diffCalendarDays,
  formatCountdownLabel,
  formatFullDate,
  getTrainingPhaseLabel,
} from '@/lib/dates';
import { getEventPriorityMeta, type TargetEvent } from '@/types/training';

interface EventCountdownBannerProps {
  events: TargetEvent[];
  todayStr: string | null;
  onOpenEvents: () => void;
}

export function EventCountdownBanner({
  events,
  todayStr,
  onOpenEvents,
}: EventCountdownBannerProps) {
  if (!todayStr) {
    return (
      <div
        aria-hidden="true"
        className="mb-6 h-[62px] border border-[#D4D4CE] bg-white"
      />
    );
  }

  const referenceDate = todayStr;
  const upcoming = [...events]
    .filter((ev) => ev.event_date >= referenceDate)
    .sort((a, b) => a.event_date.localeCompare(b.event_date));

  const nextA = upcoming.find((ev) => ev.priority === 'A') ?? null;
  const nextB = upcoming.find((ev) => ev.priority === 'B') ?? null;
  const primary = nextA ?? nextB ?? upcoming[0] ?? null;

  if (!primary) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-none border border-[#D4D4CE] bg-[#EFEFEC] px-5 py-3.5">
        <div className="flex items-center gap-2.5 text-xs font-medium text-[#6B6B68]">
          <Flag className="h-4 w-4 shrink-0 text-[#3B5B7A] stroke-[1.75]" />
          <span>
            No target races scheduled — add A/B events for AI periodization.
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenEvents}
          className="inline-flex items-center gap-1.5 rounded-none border border-[#2A2A28] bg-[#181818] px-3 py-1.5 font-mono text-[11px] font-medium text-[#F7F7F5] uppercase transition hover:border-[#3B5B7A] hover:bg-[#3B5B7A]"
        >
          Events Calendar
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    );
  }

  const primaryDays = diffCalendarDays(referenceDate, primary.event_date);
  const primaryCountdown = formatCountdownLabel(primaryDays);
  const primaryPhase = getTrainingPhaseLabel(primaryDays);
  const primaryMeta = getEventPriorityMeta(primary.priority);

  const secondaryB = nextB && nextB.id !== primary.id ? nextB : null;
  const secondaryBDays = secondaryB
    ? diffCalendarDays(referenceDate, secondaryB.event_date)
    : null;

  return (
    <section
      aria-label="Upcoming target race countdown"
      className="mb-6 rounded-none border border-[#2A2A28] bg-[#181818] px-5 py-4 text-[#F7F7F5]"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3.5 sm:items-center">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-[#3B5B7A] bg-[#3B5B7A] text-[#F7F7F5] sm:mt-0">
            <Trophy className="h-4 w-4 stroke-[1.75]" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-medium tracking-tight">
              <span className="font-mono text-[#A8C1D8] uppercase">
                {primaryCountdown}
              </span>
              <span>
                from {primary.name} ({primaryMeta.shortLabel})
              </span>
              <span className="border border-[#2A2A28] bg-[#F7F7F5] px-2 py-0.5 font-mono text-[10px] font-medium text-[#181818] uppercase">
                {primaryPhase}
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-[#B5B5B0] uppercase">
              {primary.event_type} · {formatFullDate(primary.event_date)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {secondaryB && secondaryBDays !== null ? (
            <span className="inline-flex items-center gap-1.5 rounded-none border border-[#3A3A38] bg-[#242422] px-2.5 py-1 font-mono text-[11px] font-medium text-[#D4D4CE] uppercase">
              B-RACE: {secondaryB.name} · {formatCountdownLabel(secondaryBDays)}
            </span>
          ) : null}

          <button
            type="button"
            onClick={onOpenEvents}
            className="inline-flex items-center gap-1.5 rounded-none border border-[#D4D4CE] bg-[#F7F7F5] px-3 py-1 font-mono text-[11px] font-medium text-[#181818] uppercase transition hover:bg-white"
          >
            Calendar
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </section>
  );
}
