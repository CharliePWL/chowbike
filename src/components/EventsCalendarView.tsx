'use client';

import { useState, useTransition } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Flag,
  Pencil,
  Plus,
  Trash2,
  Trophy,
} from 'lucide-react';
import { deleteTargetEventAction } from '@/app/actions/events';
import {
  diffCalendarDays,
  formatCountdownLabel,
  formatFullDate,
  formatMonthYear,
  getTrainingPhaseLabel,
} from '@/lib/dates';
import { getEventPriorityMeta, type TargetEvent } from '@/types/training';

interface EventsCalendarViewProps {
  events: TargetEvent[];
  todayStr: string | null;
  onAddEvent: () => void;
  onEditEvent: (event: TargetEvent) => void;
}

export function EventsCalendarView({
  events,
  todayStr,
  onAddEvent,
  onEditEvent,
}: EventsCalendarViewProps) {
  const [showPast, setShowPast] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  if (!todayStr) {
    return null;
  }

  const referenceDate = todayStr;
  const sorted = [...events].sort((a, b) =>
    a.event_date.localeCompare(b.event_date)
  );

  const upcoming = sorted.filter((ev) => ev.event_date >= referenceDate);
  const past = sorted
    .filter((ev) => ev.event_date < referenceDate)
    .reverse();

  const aCount = upcoming.filter((e) => e.priority === 'A').length;
  const bCount = upcoming.filter((e) => e.priority === 'B').length;
  const cCount = upcoming.filter((e) => e.priority === 'C').length;

  const groupedByMonth: Array<{ monthLabel: string; items: TargetEvent[] }> = [];
  for (const ev of upcoming) {
    const label = formatMonthYear(ev.event_date);
    const existing = groupedByMonth.find((g) => g.monthLabel === label);
    if (existing) {
      existing.items.push(ev);
    } else {
      groupedByMonth.push({ monthLabel: label, items: [ev] });
    }
  }

  function handleQuickDelete(eventId: string) {
    setDeletingId(eventId);
    startDeleteTransition(async () => {
      try {
        await deleteTargetEventAction(eventId);
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Season Summary Header */}
      <section className="rounded-none border border-[#D4D4CE] bg-white p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 font-mono text-[11px] font-medium tracking-wider text-[#3B5B7A] uppercase">
              <Trophy className="h-3.5 w-3.5 stroke-[1.75]" />
              Season Targets &amp; Periodization
            </div>
            <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-[#181818]">
              Events &amp; Races Calendar
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-[#6B6B68]">
              Add A, B, and C priority races so the AI coach times your build,
              overload, peak, and recovery blocks.
            </p>
          </div>

          <button
            type="button"
            onClick={onAddEvent}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-none border border-[#2A2A28] bg-[#181818] px-4 font-mono text-[11px] font-medium text-[#F7F7F5] uppercase transition hover:border-[#3B5B7A] hover:bg-[#3B5B7A]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Race / Event
          </button>
        </div>

        {/* Priority Counts */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#D4D4CE] pt-4 font-mono text-[11px] font-medium uppercase">
          <span className="inline-flex items-center gap-1.5 border border-[#2A2A28] bg-[#181818] px-2.5 py-1 text-[#F7F7F5]">
            {aCount} Peak A-Race{aCount === 1 ? '' : 's'}
          </span>
          <span className="inline-flex items-center gap-1.5 border border-[#3B5B7A] bg-[#3B5B7A] px-2.5 py-1 text-[#F7F7F5]">
            {bCount} Prep B-Race{bCount === 1 ? '' : 's'}
          </span>
          <span className="inline-flex items-center gap-1.5 border border-[#D4D4CE] bg-[#EFEFEC] px-2.5 py-1 text-[#181818]">
            {cCount} Training C-Race{cCount === 1 ? '' : 's'}
          </span>
        </div>
      </section>

      {/* Upcoming Season Timeline */}
      {upcoming.length === 0 ? (
        <section className="flex flex-col items-center justify-center rounded-none border border-dashed border-[#D4D4CE] bg-white px-6 py-14 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-none border border-[#D4D4CE] bg-[#EFEFEC] text-[#181818]">
            <Flag className="h-4 w-4 stroke-[1.75]" />
          </div>
          <h2 className="mt-3 text-sm font-semibold tracking-tight text-[#181818]">
            No upcoming races scheduled
          </h2>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-[#6B6B68]">
            Add your target A-race and key B/C prep races to unlock live phase
            countdowns and race-timed adaptive blocks.
          </p>
          <button
            type="button"
            onClick={onAddEvent}
            className="mt-5 inline-flex items-center gap-1.5 rounded-none border border-[#2A2A28] bg-[#181818] px-4 py-2 font-mono text-[11px] font-medium text-[#F7F7F5] uppercase transition hover:border-[#3B5B7A] hover:bg-[#3B5B7A]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add First Target Event
          </button>
        </section>
      ) : (
        <div className="space-y-6">
          {groupedByMonth.map((group) => (
            <section key={group.monthLabel} className="space-y-3.5">
              <div className="flex items-center gap-2.5">
                <Calendar className="h-3.5 w-3.5 text-[#6B6B68] stroke-[1.75]" />
                <h2 className="font-mono text-xs font-medium tracking-wider text-[#181818] uppercase">
                  {group.monthLabel}
                </h2>
                <div className="h-px flex-1 bg-[#D4D4CE]" />
              </div>

              <div className="relative space-y-3.5 pl-5 before:absolute before:top-2 before:bottom-2 before:left-1.5 before:w-px before:bg-[#D4D4CE]">
                {group.items.map((ev) => {
                  const priorityMeta = getEventPriorityMeta(ev.priority);
                  const daysOut = diffCalendarDays(referenceDate, ev.event_date);
                  const countdown = formatCountdownLabel(daysOut);
                  const phase =
                    ev.priority === 'A' ? getTrainingPhaseLabel(daysOut) : null;
                  const busy = isDeleting && deletingId === ev.id;

                  return (
                    <article
                      key={ev.id}
                      className="relative rounded-none border border-[#D4D4CE] bg-white p-5"
                    >
                      {/* Square hairline timeline marker */}
                      <span
                        className={`absolute top-6 -left-[19px] h-2.5 w-2.5 rounded-none border border-[#F7F7F5] ${priorityMeta.dotClass}`}
                      />

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] font-medium uppercase">
                            <span
                              className={`inline-flex items-center border px-2 py-0.5 ${priorityMeta.badgeClass}`}
                            >
                              {priorityMeta.shortLabel}
                            </span>

                            <span className="border border-[#D4D4CE] bg-[#EFEFEC] px-2 py-0.5 text-[#181818]">
                              {ev.event_type}
                            </span>

                            <span className="border border-[#3B5B7A] bg-[#F7F7F5] px-2 py-0.5 text-[#3B5B7A] tabular-nums">
                              {countdown}
                            </span>

                            {phase ? (
                              <span className="text-[#6B6B68]">· {phase}</span>
                            ) : null}
                          </div>

                          <h3 className="mt-2.5 text-base font-semibold tracking-tight text-[#181818]">
                            {ev.name}
                          </h3>

                          <p className="mt-0.5 font-mono text-xs font-normal text-[#6B6B68] uppercase">
                            {formatFullDate(ev.event_date)}
                          </p>

                          {ev.notes ? (
                            <p className="mt-3 border border-[#D4D4CE] bg-[#F7F7F5] px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap text-[#181818]">
                              {ev.notes}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onEditEvent(ev)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-none border border-[#D4D4CE] bg-[#F7F7F5] px-3 font-mono text-[11px] font-medium text-[#181818] uppercase transition hover:border-[#2A2A28] hover:bg-white"
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleQuickDelete(ev.id)}
                            aria-label={`Delete ${ev.name}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-none border border-[#D4D4CE] bg-white text-[#6B6B68] transition hover:border-[#991B1B] hover:bg-[#FEF2F2] hover:text-[#991B1B] disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Past Events */}
      {past.length > 0 ? (
        <section className="rounded-none border border-[#D4D4CE] bg-[#EFEFEC] p-4">
          <button
            type="button"
            onClick={() => setShowPast((prev) => !prev)}
            className="flex w-full items-center justify-between text-left font-mono text-xs font-medium text-[#181818] uppercase"
          >
            <span>Past Events ({past.length})</span>
            {showPast ? (
              <ChevronUp className="h-4 w-4 text-[#6B6B68]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#6B6B68]" />
            )}
          </button>

          {showPast ? (
            <div className="mt-3 space-y-2">
              {past.map((ev) => {
                const priorityMeta = getEventPriorityMeta(ev.priority);
                const daysOut = diffCalendarDays(referenceDate, ev.event_date);
                return (
                  <div
                    key={ev.id}
                    className="flex flex-wrap items-center justify-between gap-2 border border-[#D4D4CE] bg-white px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase ${priorityMeta.badgeClass}`}
                        >
                          {priorityMeta.shortLabel}
                        </span>
                        <span className="text-xs font-medium text-[#181818]">
                          {ev.name}
                        </span>
                        <span className="font-mono text-[11px] text-[#6B6B68]">
                          · {ev.event_type} · {formatFullDate(ev.event_date)} (
                          {formatCountdownLabel(daysOut)})
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onEditEvent(ev)}
                      className="border border-[#D4D4CE] bg-[#F7F7F5] px-2.5 py-1 font-mono text-[11px] font-medium text-[#181818] uppercase hover:border-[#2A2A28] hover:bg-white"
                    >
                      Edit
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
