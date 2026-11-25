'use client';

import { useState, useTransition } from 'react';
import { Calendar, Flag, Loader2, Trash2, X } from 'lucide-react';
import {
  deleteTargetEventAction,
  upsertTargetEventAction,
} from '@/app/actions/events';
import { getTodayDateString } from '@/lib/dates';
import {
  EVENT_PRIORITIES,
  EVENT_TYPES,
  type EventPriority,
  type TargetEvent,
} from '@/types/training';

interface EventModalProps {
  event: TargetEvent | null;
  onClose: () => void;
}

export function EventModal({ event, onClose }: EventModalProps) {
  const [name, setName] = useState(event?.name ?? '');
  const [eventDate, setEventDate] = useState(
    event?.event_date ?? getTodayDateString()
  );
  const [priority, setPriority] = useState<EventPriority>(
    event?.priority ?? 'A'
  );
  const [eventType, setEventType] = useState(
    event?.event_type ?? 'Road Race'
  );
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please enter a race or event name.');
      return;
    }
    if (!eventDate) {
      setError('Please select an event date.');
      return;
    }

    startTransition(async () => {
      try {
        await upsertTargetEventAction({
          id: event?.id,
          name,
          eventDate,
          priority,
          eventType,
          notes: notes || null,
        });
        onClose();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Unable to save event.'
        );
      }
    });
  }

  function handleDelete() {
    if (!event) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteTargetEventAction(event.id);
        onClose();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Unable to delete event.'
        );
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={event ? 'Edit race or event' : 'Add race or event'}
    >
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-none border border-[#2A2A28] bg-[#F7F7F5] p-6">
        <div className="mb-5 flex items-center justify-between border-b border-[#D4D4CE] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-none border border-[#2A2A28] bg-[#181818] text-[#F7F7F5]">
              <Flag className="h-4 w-4 stroke-[1.75]" />
            </div>
            <h2 className="text-base font-semibold tracking-tight text-[#181818]">
              {event ? 'Edit Target Event' : 'Add Target Race / Event'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="flex h-8 w-8 items-center justify-center rounded-none border border-[#D4D4CE] bg-white text-[#6B6B68] transition hover:border-[#2A2A28] hover:text-[#181818]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? (
            <div className="rounded-none border border-[#B91C1C]/40 bg-[#FEF2F2] px-3.5 py-2 font-mono text-xs font-medium text-[#991B1B]">
              {error}
            </div>
          ) : null}

          <div>
            <label
              htmlFor="event-name"
              className="mb-1.5 block font-mono text-[11px] font-medium tracking-wider text-[#6B6B68] uppercase"
            >
              Event Name
            </label>
            <input
              id="event-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Spring Kermesse or Target Road Race"
              className="w-full rounded-none border border-[#D4D4CE] bg-white px-3.5 py-2.5 text-sm font-normal text-[#181818] placeholder:text-[#9A9A95] focus:border-[#3B5B7A] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="event-date"
              className="mb-1.5 block font-mono text-[11px] font-medium tracking-wider text-[#6B6B68] uppercase"
            >
              Event Date
            </label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#6B6B68]" />
              <input
                id="event-date"
                type="date"
                required
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full rounded-none border border-[#D4D4CE] bg-white py-2.5 pr-3.5 pl-10 font-mono text-sm font-medium text-[#181818] focus:border-[#3B5B7A] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <span className="mb-1.5 block font-mono text-[11px] font-medium tracking-wider text-[#6B6B68] uppercase">
              Priority
            </span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {EVENT_PRIORITIES.map((p) => {
                const active = priority === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className={`rounded-none border p-3 text-left transition ${
                      active
                        ? 'border-[#3B5B7A] bg-[#3B5B7A] text-[#F7F7F5]'
                        : 'border-[#D4D4CE] bg-white text-[#181818] hover:border-[#2A2A28] hover:bg-[#EFEFEC]'
                    }`}
                  >
                    <div className="font-mono text-xs font-semibold uppercase">
                      {p.shortLabel}
                    </div>
                    <p className="mt-1 text-[11px] opacity-85">
                      {p.value === 'A'
                        ? 'Peak goal race'
                        : p.value === 'B'
                          ? 'Important prep'
                          : 'Training / low'}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block font-mono text-[11px] font-medium tracking-wider text-[#6B6B68] uppercase">
              Event Type
            </span>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_TYPES.map((typeOption) => {
                const active =
                  eventType.toLowerCase() === typeOption.toLowerCase();
                return (
                  <button
                    key={typeOption}
                    type="button"
                    onClick={() => setEventType(typeOption)}
                    className={`rounded-none border px-2.5 py-1.5 font-mono text-[11px] font-medium uppercase transition ${
                      active
                        ? 'border-[#3B5B7A] bg-[#3B5B7A] text-[#F7F7F5]'
                        : 'border-[#D4D4CE] bg-white text-[#181818] hover:border-[#2A2A28] hover:bg-[#EFEFEC]'
                    }`}
                  >
                    {typeOption}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor="event-notes"
              className="mb-1.5 block font-mono text-[11px] font-medium tracking-wider text-[#6B6B68] uppercase"
            >
              Course &amp; Goal Notes (optional)
            </label>
            <textarea
              id="event-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Distance, elevation, cobbles/kermesse surges, target result…"
              className="w-full rounded-none border border-[#D4D4CE] bg-white px-3.5 py-2 text-xs leading-relaxed text-[#181818] placeholder:text-[#9A9A95] focus:border-[#3B5B7A] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#D4D4CE] pt-4">
            {event ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleDelete}
                    className="rounded-none border border-[#991B1B] bg-[#991B1B] px-3 py-2 font-mono text-[11px] font-medium text-white uppercase hover:bg-[#7F1D1D] disabled:opacity-50"
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-none border border-[#D4D4CE] bg-white px-3 py-2 font-mono text-[11px] font-medium text-[#181818] uppercase hover:border-[#2A2A28]"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 rounded-none border border-[#D4D4CE] bg-white px-3 py-2 font-mono text-[11px] font-medium text-[#991B1B] uppercase transition hover:border-[#991B1B] hover:bg-[#FEF2F2]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              )
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-none border border-[#D4D4CE] bg-white px-4 py-2 font-mono text-[11px] font-medium text-[#181818] uppercase transition hover:border-[#2A2A28]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-none border border-[#2A2A28] bg-[#181818] px-4 py-2 font-mono text-[11px] font-medium text-[#F7F7F5] uppercase transition hover:border-[#3B5B7A] hover:bg-[#3B5B7A] disabled:opacity-60"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving…
                  </>
                ) : event ? (
                  'Save Event'
                ) : (
                  'Add Event'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
