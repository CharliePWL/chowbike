'use client';

import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Download,
  Loader2,
  Pencil,
  Sparkles,
  X,
} from 'lucide-react';
import {
  toggleWorkoutCompletedAction,
  updateWorkoutDetailsAction,
  updateWorkoutNotesAction,
} from '@/app/actions/training';
import { formatDuration } from '@/lib/dates';
import { downloadWorkoutFit } from '@/lib/fit/exportHelpers';
import { isExportableWorkout } from '@/lib/fit/intervalParser';
import { getZoneMeta, type Workout } from '@/types/training';
import { PowerPreviewChart } from './PowerPreviewChart';

interface WorkoutItemProps {
  workout: Workout;
  dateStr: string;
  ftpWatts: number;
}

export function WorkoutItem({
  workout,
  dateStr,
  ftpWatts,
}: WorkoutItemProps) {
  const router = useRouter();
  const [optimisticCompleted, setOptimisticCompleted] = useOptimistic(
    workout.completed,
    (_current: boolean, next: boolean) => next
  );
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [, startToggleTransition] = useTransition();

  // Manual Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editDuration, setEditDuration] = useState(
    String(workout.duration_minutes)
  );
  const [editIntervals, setEditIntervals] = useState(workout.intervals ?? '');
  const [editNotes, setEditNotes] = useState(workout.notes ?? '');
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, startEditTransition] = useTransition();

  // AI Adjust state
  const [aiPrompt, setAiPrompt] = useState('');
  const [adjustEnvironment, setAdjustEnvironment] = useState<
    'outdoor' | 'indoor'
  >('outdoor');
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const isFocusedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedNotesRef = useRef(workout.notes ?? '');

  useEffect(() => {
    const incoming = workout.notes ?? '';
    lastSavedNotesRef.current = incoming;
    if (!isFocusedRef.current && inputRef.current) {
      inputRef.current.value = incoming;
    }
  }, [workout.notes]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const zoneMeta = getZoneMeta(workout.zone);
  const exportable = isExportableWorkout(workout);

  function handleOpenEdit() {
    setEditDuration(String(workout.duration_minutes));
    setEditIntervals(workout.intervals ?? '');
    setEditNotes(workout.notes ?? '');
    setEditError(null);
    setIsEditing(true);
  }

  function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditError(null);
    const parsedMinutes = Number(editDuration);
    if (!Number.isFinite(parsedMinutes) || parsedMinutes < 0) {
      setEditError('Enter a valid duration in minutes.');
      return;
    }

    startEditTransition(async () => {
      try {
        await updateWorkoutDetailsAction({
          workoutId: workout.id,
          durationMinutes: parsedMinutes,
          intervals: editIntervals || null,
          notes: editNotes || null,
        });
        lastSavedNotesRef.current = editNotes.trim();
        setIsEditing(false);
        router.refresh();
      } catch (err) {
        setEditError(
          err instanceof Error ? err.message : 'Unable to save workout.'
        );
      }
    });
  }

  async function handleAiAdjust(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = aiPrompt.trim();
    if ((!trimmed && adjustEnvironment !== 'indoor') || isAdjusting) return;

    setAdjustError(null);
    setIsAdjusting(true);
    try {
      const res = await fetch('/api/workouts/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workoutId: workout.id,
          instruction: trimmed,
          environment: adjustEnvironment,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to adjust workout.');
      }
      setAiPrompt('');
      router.refresh();
    } catch (err) {
      setAdjustError(
        err instanceof Error ? err.message : 'Failed to adjust workout.'
      );
    } finally {
      setIsAdjusting(false);
    }
  }

  function handleToggleCompleted() {
    const nextValue = !optimisticCompleted;
    startToggleTransition(async () => {
      setOptimisticCompleted(nextValue);
      await toggleWorkoutCompletedAction({
        workoutId: workout.id,
        completed: nextValue,
      });
    });
  }

  async function persistNotes(valueToSave: string) {
    if (valueToSave === lastSavedNotesRef.current) return;

    setSaveState('saving');
    try {
      await updateWorkoutNotesAction({
        workoutId: workout.id,
        notes: valueToSave,
      });
      lastSavedNotesRef.current = valueToSave;
      setSaveState('saved');
      setTimeout(() => {
        setSaveState((prev) => (prev === 'saved' ? 'idle' : prev));
      }, 1500);
    } catch {
      setSaveState('error');
    }
  }

  function handleNotesChange(nextValue: string) {
    if (saveState !== 'idle') setSaveState('idle');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void persistNotes(nextValue);
    }, 800);
  }

  function handleNotesBlur() {
    isFocusedRef.current = false;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (inputRef.current) {
      void persistNotes(inputRef.current.value);
    }
  }

  return (
    <div
      className={`transition ${
        optimisticCompleted ? 'opacity-70' : ''
      }`}
    >
      {/* Top row: Checkbox + Title + Edit + .FIT download — NO inner border box */}
      <div className="flex items-start gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={optimisticCompleted}
          aria-label={`Mark "${workout.title}" as ${optimisticCompleted ? 'incomplete' : 'completed'}`}
          onClick={handleToggleCompleted}
          className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-sm border transition ${
            optimisticCompleted
              ? 'border-[#3B5B7A] bg-[#3B5B7A] text-[#F7F7F5]'
              : 'border-[#B8B8B0] bg-white text-transparent hover:border-[#2A2A28]'
          }`}
        >
          <Check className="h-3 w-3 stroke-[2.5]" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            {/* Zone dot + title (wraps, no truncation) */}
            <div className="flex min-w-0 items-baseline gap-2">
              <span
                className={`mt-[3px] h-2 w-2 shrink-0 rounded-full ${zoneMeta.dotClass}`}
                title={zoneMeta.label}
              />
              <h3
                className={`text-sm font-semibold leading-snug tracking-tight ${
                  optimisticCompleted
                    ? 'text-[#9A9A95] line-through'
                    : 'text-[#181818]'
                }`}
              >
                {workout.title}
              </h3>
            </div>

            {/* Action buttons only — duration is in the DayCard header */}
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  isEditing ? setIsEditing(false) : handleOpenEdit()
                }
                title={isEditing ? 'Cancel edit' : 'Edit duration, intervals, or notes'}
                aria-label={`Edit ${workout.title}`}
                className={`inline-flex h-6 w-6 items-center justify-center rounded-sm border transition ${
                  isEditing
                    ? 'border-[#2A2A28] bg-[#181818] text-[#F7F7F5]'
                    : 'border-[#D4D4CE] bg-white text-[#6B6B68] hover:border-[#2A2A28] hover:text-[#181818]'
                }`}
              >
                {isEditing ? (
                  <X className="h-3 w-3" />
                ) : (
                  <Pencil className="h-3 w-3" />
                )}
              </button>

              {exportable ? (
                <button
                  type="button"
                  onClick={() => downloadWorkoutFit(workout, dateStr, ftpWatts)}
                  title="Download Garmin .FIT"
                  aria-label={`Download ${workout.title} as .FIT`}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-sm border border-[#D4D4CE] bg-white text-[#6B6B68] transition hover:border-[#3B5B7A] hover:bg-[#3B5B7A] hover:text-[#F7F7F5]"
                >
                  <Download className="h-3 w-3" />
                </button>
              ) : null}
            </div>
          </div>

          {/* Zone label — small muted mono tag */}
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-[#6B6B68]">
              {zoneMeta.shortLabel}
            </span>
            <span className="font-mono text-[10px] text-[#9A9A95] tabular-nums">
              {workout.duration_minutes > 0
                ? formatDuration(workout.duration_minutes)
                : 'REST'}
            </span>
          </div>

          {/* Intervals — sans-serif prose for readability, mono only for W/durations */}
          {!isEditing && workout.intervals ? (
            <p className="mt-2 text-xs leading-relaxed text-[#3A3A38]">
              {workout.intervals}
            </p>
          ) : null}
        </div>
      </div>

      {/* Inline Manual Edit Form */}
      {isEditing ? (
        <form
          onSubmit={handleSaveEdit}
          className="mt-3.5 space-y-3 rounded-none border border-[#D4D4CE] bg-white p-3.5"
        >
          {editError ? (
            <p className="border border-[#B91C1C]/40 bg-[#FEF2F2] px-2.5 py-1.5 font-mono text-[11px] font-medium text-[#991B1B]">
              {editError}
            </p>
          ) : null}

          <div>
            <label
              htmlFor={`edit-dur-${workout.id}`}
              className="mb-1 block font-mono text-[10px] font-medium tracking-wider text-[#6B6B68] uppercase"
            >
              Duration (minutes)
            </label>
            <input
              id={`edit-dur-${workout.id}`}
              type="number"
              min={0}
              max={720}
              value={editDuration}
              onChange={(e) => setEditDuration(e.target.value)}
              className="w-28 rounded-none border border-[#D4D4CE] bg-[#F7F7F5] px-2.5 py-1.5 font-mono text-xs font-medium text-[#181818] focus:border-[#3B5B7A] focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor={`edit-int-${workout.id}`}
              className="mb-1 block font-mono text-[10px] font-medium tracking-wider text-[#6B6B68] uppercase"
            >
              Intervals / Description
            </label>
            <textarea
              id={`edit-int-${workout.id}`}
              rows={2}
              value={editIntervals}
              onChange={(e) => setEditIntervals(e.target.value)}
              className="w-full rounded-none border border-[#D4D4CE] bg-[#F7F7F5] px-2.5 py-1.5 font-mono text-xs leading-relaxed text-[#181818] focus:border-[#3B5B7A] focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor={`edit-notes-${workout.id}`}
              className="mb-1 block font-mono text-[10px] font-medium tracking-wider text-[#6B6B68] uppercase"
            >
              Post-ride Notes
            </label>
            <textarea
              id={`edit-notes-${workout.id}`}
              rows={2}
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="RPE, avg watts, how legs felt…"
              className="w-full rounded-none border border-[#D4D4CE] bg-[#F7F7F5] px-2.5 py-1.5 text-xs text-[#181818] placeholder:text-[#9A9A95] focus:border-[#3B5B7A] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={isSavingEdit}
              onClick={() => setIsEditing(false)}
              className="rounded-none border border-[#D4D4CE] bg-[#F7F7F5] px-3 py-1 font-mono text-[11px] font-medium text-[#181818] uppercase hover:border-[#2A2A28] hover:bg-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingEdit}
              className="inline-flex items-center gap-1 rounded-none border border-[#2A2A28] bg-[#181818] px-3 py-1 font-mono text-[11px] font-medium text-[#F7F7F5] uppercase hover:bg-[#3B5B7A] hover:border-[#3B5B7A] disabled:opacity-60"
            >
              {isSavingEdit ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : null}
              Save
            </button>
          </div>
        </form>
      ) : (
        <>
          {/* Visual Interval Power Preview */}
          {exportable ? (
            <PowerPreviewChart workout={workout} ftpWatts={ftpWatts} />
          ) : null}

          {/* Quick Post-ride Log */}
          <div className="mt-3 flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              defaultValue={workout.notes ?? ''}
              onFocus={() => {
                isFocusedRef.current = true;
              }}
              onChange={(e) => handleNotesChange(e.target.value)}
              onBlur={handleNotesBlur}
              placeholder="Log RPE, avg watts, how legs felt…"
              aria-label={`Notes for ${workout.title}`}
              className="w-full rounded-none border border-[#D4D4CE] bg-white px-2.5 py-1.5 text-xs font-normal text-[#181818] placeholder:text-[#9A9A95] focus:border-[#3B5B7A] focus:outline-none"
            />
            {saveState === 'saving' ? (
              <span className="shrink-0 font-mono text-[10px] font-medium text-[#6B6B68] uppercase">
                Saving…
              </span>
            ) : saveState === 'saved' ? (
              <span className="shrink-0 font-mono text-[10px] font-medium text-[#3B5B7A] uppercase">
                Saved
              </span>
            ) : saveState === 'error' ? (
              <span className="shrink-0 font-mono text-[10px] font-medium text-[#991B1B] uppercase">
                Error
              </span>
            ) : null}
          </div>

          {/* Compact AI Adjust Row + INDOOR / OUTDOOR Toggle */}
          <form onSubmit={handleAiAdjust} className="mt-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <div
                role="group"
                aria-label="Workout environment"
                className="inline-flex h-[30px] shrink-0 border border-[#D4D4CE] bg-white"
              >
                {(['outdoor', 'indoor'] as const).map((env, idx) => (
                  <button
                    key={env}
                    type="button"
                    disabled={isAdjusting}
                    onClick={() => setAdjustEnvironment(env)}
                    className={`px-2 font-mono text-[10px] font-medium uppercase transition ${
                      idx === 0 ? 'border-r border-[#D4D4CE]' : ''
                    } ${
                      adjustEnvironment === env
                        ? 'bg-[#181818] text-[#F7F7F5]'
                        : 'bg-white text-[#6B6B68] hover:bg-[#EFEFEC] hover:text-[#181818]'
                    }`}
                  >
                    {env === 'outdoor' ? 'OUT' : 'IN'}
                  </button>
                ))}
              </div>

              <input
                type="text"
                disabled={isAdjusting}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={
                  adjustEnvironment === 'indoor'
                    ? 'Indoor ERG (e.g., 60m max) or leave blank'
                    : 'AI adjust (e.g., Only 60m today / Legs cooked)'
                }
                aria-label={`AI adjust ${workout.title}`}
                className="min-w-0 flex-1 rounded-none border border-[#D4D4CE] bg-white px-2.5 py-1.5 text-xs font-normal text-[#181818] placeholder:text-[#9A9A95] focus:border-[#3B5B7A] focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={
                  isAdjusting ||
                  (!aiPrompt.trim() && adjustEnvironment !== 'indoor')
                }
                title="Adjust this day with AI"
                className="inline-flex h-[30px] shrink-0 items-center gap-1 rounded-none border border-[#3B5B7A] bg-[#3B5B7A] px-2.5 font-mono text-[11px] font-medium text-[#F7F7F5] uppercase transition hover:bg-[#2E4861] disabled:cursor-not-allowed disabled:border-[#D4D4CE] disabled:bg-[#EFEFEC] disabled:text-[#9A9A95]"
              >
                {isAdjusting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                <span>Adjust</span>
              </button>
            </div>
            {adjustError ? (
              <p className="mt-1.5 border border-[#B91C1C]/40 bg-[#FEF2F2] px-2 py-1 font-mono text-[11px] font-medium text-[#991B1B]">
                {adjustError}
              </p>
            ) : null}
          </form>
        </>
      )}
    </div>
  );
}
