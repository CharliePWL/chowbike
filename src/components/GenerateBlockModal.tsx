'use client';

import { useState } from 'react';
import { Calendar, Layers, Loader2, Sparkles, X } from 'lucide-react';
import { addDays, formatWeekRange } from '@/lib/dates';
import { DAYS_OF_WEEK, type TrainingBlock } from '@/types/training';

interface GenerateBlockModalProps {
  mode: 'start' | 'next-week';
  currentWeekStart: string;
  activeBlock: TrainingBlock | null;
  onGenerated: (targetWeekStart: string) => void;
  onClose: () => void;
}

const BLOCK_LENGTH_OPTIONS = [
  { weeks: 3, label: '3 Weeks', sub: '2 Load + 1 Recovery' },
  { weeks: 4, label: '4 Weeks', sub: '3 Load + 1 Recovery' },
];

const HOUR_PRESETS = [10, 14, 16, 20, 22];

export function GenerateBlockModal({
  mode,
  currentWeekStart,
  activeBlock,
  onGenerated,
  onClose,
}: GenerateBlockModalProps) {
  const isNextWeek = mode === 'next-week' && activeBlock !== null;
  const nextWeekNumber = isNextWeek ? activeBlock.current_week + 1 : 1;
  const nextOutlineStep = isNextWeek
    ? activeBlock.phase_outline?.find((p) => p.week === nextWeekNumber) ??
      activeBlock.phase_outline?.[nextWeekNumber - 1]
    : null;

  const [startWeek, setStartWeek] = useState<string>(currentWeekStart);
  const [totalWeeks, setTotalWeeks] = useState<number>(4);
  const [availableHours, setAvailableHours] = useState<string>(
    String(isNextWeek ? activeBlock.default_hours ?? 16 : 16)
  );
  const [unavailableDays, setUnavailableDays] = useState<number[]>(
    isNextWeek ? activeBlock.unavailable_days ?? [] : []
  );
  const [environment, setEnvironment] = useState<'outdoor' | 'indoor'>(
    'outdoor'
  );
  const [notesOrGoal, setNotesOrGoal] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextStartOption = addDays(currentWeekStart, 7);

  function toggleUnavailableDay(day: number) {
    setUnavailableDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedHours = Number(availableHours);
    if (!Number.isFinite(parsedHours) || parsedHours < 2 || parsedHours > 35) {
      setError('Please enter weekly hours between 2 and 35.');
      return;
    }

    setIsGenerating(true);
    try {
      const endpoint = isNextWeek
        ? '/api/blocks/next-week'
        : '/api/blocks/start';
      const bodyPayload = isNextWeek
        ? {
            blockId: activeBlock.id,
            availableHours: parsedHours,
            unavailableDays,
            environment,
            checkInNotes: notesOrGoal,
          }
        : {
            startWeek,
            totalWeeks,
            availableHours: parsedHours,
            unavailableDays,
            environment,
            blockGoal: notesOrGoal,
          };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      const payload = (await res.json()) as {
        weekStart?: string;
        startWeek?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to generate workouts.');
      }

      onGenerated(
        payload.weekStart ?? payload.startWeek ?? currentWeekStart
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to generate workouts.'
      );
      setIsGenerating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={
        isNextWeek
          ? `Generate Week ${nextWeekNumber} of ${activeBlock.total_weeks}`
          : 'Start Training Block'
      }
    >
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-none border border-[#2A2A28] bg-[#F7F7F5] p-6">
        <div className="mb-5 flex items-center justify-between border-b border-[#D4D4CE] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-none border border-[#2A2A28] bg-[#181818] text-[#F7F7F5]">
              <Layers className="h-4 w-4 stroke-[1.75]" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-[#181818]">
                {isNextWeek
                  ? `Generate Week ${nextWeekNumber} of ${activeBlock.total_weeks}`
                  : 'Start Training Block'}
              </h2>
              <p className="font-mono text-[11px] text-[#6B6B68]">
                {isNextWeek
                  ? `${activeBlock.name} · ${nextOutlineStep?.phase ?? 'Next Phase'} (adapts to last week)`
                  : 'Saves block blueprint & generates Week 1 in Watts'}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isGenerating}
            onClick={onClose}
            aria-label="Close modal"
            className="flex h-8 w-8 items-center justify-center rounded-none border border-[#D4D4CE] bg-white text-[#6B6B68] transition hover:border-[#2A2A28] hover:text-[#181818] disabled:opacity-50"
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

          {isNextWeek && nextOutlineStep ? (
            <div className="rounded-none border border-[#2A2A28] bg-[#181818] px-3.5 py-2.5 text-xs text-[#F7F7F5]">
              <span className="font-mono font-medium text-[#A8C1D8] uppercase">
                Planned Week {nextWeekNumber}: {nextOutlineStep.phase}
              </span>
              <span className="text-[#B5B5B0]"> — {nextOutlineStep.focus}</span>
            </div>
          ) : null}

          {!isNextWeek ? (
            <>
              <div>
                <span className="mb-1.5 block font-mono text-[11px] font-medium tracking-wider text-[#6B6B68] uppercase">
                  Week 1 Starts
                </span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    { label: 'This Viewed Week', value: currentWeekStart },
                    { label: 'Next Week', value: nextStartOption },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={isGenerating}
                      onClick={() => setStartWeek(option.value)}
                      className={`flex items-center gap-2 rounded-none border px-3 py-2.5 text-left transition ${
                        startWeek === option.value
                          ? 'border-[#3B5B7A] bg-[#3B5B7A] text-[#F7F7F5]'
                          : 'border-[#D4D4CE] bg-white text-[#181818] hover:border-[#2A2A28] hover:bg-[#EFEFEC]'
                      }`}
                    >
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <div className="min-w-0">
                        <span className="block text-xs font-medium uppercase">
                          {option.label}
                        </span>
                        <span className="block truncate font-mono text-[11px] opacity-80">
                          {formatWeekRange(option.value)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="mb-1.5 block font-mono text-[11px] font-medium tracking-wider text-[#6B6B68] uppercase">
                  Block Length
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {BLOCK_LENGTH_OPTIONS.map((opt) => (
                    <button
                      key={opt.weeks}
                      type="button"
                      disabled={isGenerating}
                      onClick={() => setTotalWeeks(opt.weeks)}
                      className={`rounded-none border px-3 py-2.5 text-left transition ${
                        totalWeeks === opt.weeks
                          ? 'border-[#3B5B7A] bg-[#3B5B7A] text-[#F7F7F5]'
                          : 'border-[#D4D4CE] bg-white text-[#181818] hover:border-[#2A2A28] hover:bg-[#EFEFEC]'
                      }`}
                    >
                      <span className="block text-xs font-medium uppercase">
                        {opt.label}
                      </span>
                      <span className="block font-mono text-[11px] opacity-80">
                        {opt.sub}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {/* Available Hours */}
          <div>
            <label
              htmlFor="block-hours"
              className="mb-1.5 block font-mono text-[11px] font-medium tracking-wider text-[#6B6B68] uppercase"
            >
              {isNextWeek ? 'Available Hours This Week' : 'Target Weekly Hours'}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="block-hours"
                type="number"
                min={2}
                max={35}
                step={0.5}
                required
                disabled={isGenerating}
                value={availableHours}
                onChange={(e) => setAvailableHours(e.target.value)}
                className="w-24 rounded-none border border-[#D4D4CE] bg-white px-3 py-2 font-mono text-sm font-medium text-[#181818] focus:border-[#3B5B7A] focus:outline-none"
              />
              <div className="flex flex-wrap gap-1.5">
                {HOUR_PRESETS.map((hrs) => (
                  <button
                    key={hrs}
                    type="button"
                    disabled={isGenerating}
                    onClick={() => setAvailableHours(String(hrs))}
                    className={`rounded-none border px-2.5 py-1 font-mono text-xs font-medium transition ${
                      Number(availableHours) === hrs
                        ? 'border-[#3B5B7A] bg-[#3B5B7A] text-[#F7F7F5]'
                        : 'border-[#D4D4CE] bg-white text-[#181818] hover:border-[#2A2A28] hover:bg-[#EFEFEC]'
                    }`}
                  >
                    {hrs}h
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Ride Environment Default: Outdoor vs Indoor ERG */}
          <div>
            <span className="mb-1.5 block font-mono text-[11px] font-medium tracking-wider text-[#6B6B68] uppercase">
              Environment Default
            </span>
            <div className="grid grid-cols-2 border border-[#D4D4CE] bg-white">
              {(['outdoor', 'indoor'] as const).map((env, idx) => (
                <button
                  key={env}
                  type="button"
                  disabled={isGenerating}
                  onClick={() => setEnvironment(env)}
                  className={`py-2 font-mono text-xs font-medium uppercase transition ${
                    idx === 0 ? 'border-r border-[#D4D4CE]' : ''
                  } ${
                    environment === env
                      ? 'bg-[#181818] text-[#F7F7F5]'
                      : 'bg-white text-[#6B6B68] hover:bg-[#EFEFEC] hover:text-[#181818]'
                  }`}
                >
                  {env === 'outdoor' ? 'OUTDOOR ROAD' : 'INDOOR ERG'}
                </button>
              ))}
            </div>
          </div>

          {/* Unavailable Days */}
          <div>
            <span className="mb-1.5 block font-mono text-[11px] font-medium tracking-wider text-[#6B6B68] uppercase">
              Days Off / Can&apos;t Ride
            </span>
            <div className="grid grid-cols-7 gap-1">
              {DAYS_OF_WEEK.map((d) => {
                const blocked = unavailableDays.includes(d.day);
                return (
                  <button
                    key={d.day}
                    type="button"
                    disabled={isGenerating}
                    onClick={() => toggleUnavailableDay(d.day)}
                    className={`rounded-none border py-1.5 font-mono text-xs font-medium uppercase transition ${
                      blocked
                        ? 'border-[#991B1B] bg-[#FEF2F2] text-[#991B1B] line-through'
                        : 'border-[#D4D4CE] bg-white text-[#181818] hover:border-[#2A2A28] hover:bg-[#EFEFEC]'
                    }`}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Goal or Check-in Notes */}
          <div>
            <label
              htmlFor="block-notes"
              className="mb-1.5 block font-mono text-[11px] font-medium tracking-wider text-[#6B6B68] uppercase"
            >
              {isNextWeek
                ? 'Check-in Notes for This Week (optional)'
                : 'Block Goal (optional)'}
            </label>
            <input
              id="block-notes"
              type="text"
              disabled={isGenerating}
              value={notesOrGoal}
              onChange={(e) => setNotesOrGoal(e.target.value)}
              placeholder={
                isNextWeek
                  ? 'e.g., Legs felt heavy on Thursday, Saturday group ride 4h'
                  : 'e.g., Spring Kermesse buildup — Sweet Spot & VO2 durability'
              }
              className="w-full rounded-none border border-[#D4D4CE] bg-white px-3.5 py-2.5 text-sm font-normal text-[#181818] placeholder:text-[#9A9A95] focus:border-[#3B5B7A] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[#D4D4CE] pt-4">
            <button
              type="button"
              disabled={isGenerating}
              onClick={onClose}
              className="rounded-none border border-[#D4D4CE] bg-white px-4 py-2 font-mono text-[11px] font-medium text-[#181818] uppercase transition hover:border-[#2A2A28] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isGenerating}
              className="inline-flex items-center gap-1.5 rounded-none border border-[#2A2A28] bg-[#181818] px-4 py-2 font-mono text-[11px] font-medium text-[#F7F7F5] uppercase transition hover:border-[#3B5B7A] hover:bg-[#3B5B7A] disabled:opacity-60"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {isNextWeek
                    ? `Adapting Week ${nextWeekNumber}…`
                    : 'Generating Week 1…'}
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 text-[#A8C1D8]" />
                  {isNextWeek
                    ? `Generate Week ${nextWeekNumber} of ${activeBlock.total_weeks}`
                    : 'Start Block & Generate Week 1'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
