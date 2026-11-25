'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Bike,
  ChevronLeft,
  ChevronRight,
  FileArchive,
  Flag,
  Layers,
  Loader2,
  LogOut,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  User,
  X,
  Zap,
} from 'lucide-react';
import { clearAllWorkoutsAction } from '@/app/actions/training';
import { signOutAction } from '@/app/login/actions';
import {
  addDays,
  formatDuration,
  formatWeekRange,
  getMondayOfWeek,
  getTodayDateString,
} from '@/lib/dates';
import { downloadWeekFitZip } from '@/lib/fit/exportHelpers';
import { parseApiResponse } from '@/lib/http';
import {
  computeWeeklyZoneSplit,
  isExportableWorkout,
} from '@/lib/fit/intervalParser';
import {
  DAYS_OF_WEEK,
  type AthleteProfile,
  type TargetEvent,
  type TrainingBlock,
  type TrainingWeek,
  type Workout,
} from '@/types/training';
import type { IntervalsPowerCurveResult } from '@/lib/intervals/pdc';
import { DayCard } from './DayCard';
import { EventCountdownBanner } from './EventCountdownBanner';
import { EventModal } from './EventModal';
import { EventsCalendarView } from './EventsCalendarView';
import { GenerateBlockModal } from './GenerateBlockModal';
import { ProfileView } from './ProfileView';

interface WeeklyDashboardProps {
  weekStart: string;
  week: TrainingWeek | null;
  activeBlock: TrainingBlock | null;
  workouts: Workout[];
  events: TargetEvent[];
  profile: AthleteProfile;
  powerCurves: IntervalsPowerCurveResult;
  userEmail: string;
}

const emptySubscribe = () => () => {};

export function WeeklyDashboard({
  weekStart,
  week,
  activeBlock,
  workouts,
  events,
  profile,
  powerCurves,
  userEmail,
}: WeeklyDashboardProps) {
  const router = useRouter();
  const todayStr = useSyncExternalStore(
    emptySubscribe,
    getTodayDateString,
    () => null
  );

  const [activeTab, setActiveTab] = useState<'block' | 'events' | 'profile'>(
    'block'
  );
  const [blockModalMode, setBlockModalMode] = useState<
    'start' | 'next-week' | null
  >(null);
  const [eventModalState, setEventModalState] = useState<{
    open: boolean;
    event: TargetEvent | null;
  }>({ open: false, event: null });
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [isPushingIntervals, setIsPushingIntervals] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [pushFeedback, setPushFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const ftpWatts = profile.ai_estimated_ftp || 365;
  const prevWeekStart = addDays(weekStart, -7);
  const nextWeekStart = addDays(weekStart, 7);

  const plannedMinutes = workouts.reduce(
    (sum, item) => sum + (item.duration_minutes || 0),
    0
  );
  const completedMinutes = workouts
    .filter((item) => item.completed)
    .reduce((sum, item) => sum + (item.duration_minutes || 0), 0);
  const exportableCount = workouts.filter(isExportableWorkout).length;
  const zoneSplit = computeWeeklyZoneSplit(workouts, ftpWatts);

  const canGenerateNextWeek =
    activeBlock !== null && activeBlock.current_week < activeBlock.total_weeks;
  const nextWeekNumber = activeBlock ? activeBlock.current_week + 1 : 1;

  const currentPhaseLabel = activeBlock
    ? activeBlock.phase_outline?.find(
        (p) => p.week === (week?.block_week ?? activeBlock.current_week)
      )?.phase ?? week?.block_phase
    : week?.block_phase;

  async function handleExportWeekZip() {
    if (exportableCount === 0 || isExportingZip) return;
    setIsExportingZip(true);
    try {
      await downloadWeekFitZip(weekStart, workouts, ftpWatts);
    } finally {
      setIsExportingZip(false);
    }
  }

  async function handlePushToIntervals() {
    if (exportableCount === 0 || isPushingIntervals) return;
    setIsPushingIntervals(true);
    setPushFeedback(null);
    try {
      const res = await fetch('/api/intervals/push-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart }),
      });
      const payload = await parseApiResponse<{
        pushedCount?: number;
      }>(res, 'Failed to push week to Intervals.icu');
      setPushFeedback({
        type: 'success',
        message: `PUSHED ${payload.pushedCount ?? exportableCount} WORKOUTS TO INTERVALS.ICU`,
      });
    } catch (err) {
      setPushFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Failed to push week to Intervals.icu.',
      });
    } finally {
      setIsPushingIntervals(false);
    }
  }

  async function handleConfirmClearAll() {
    if (isClearingAll) return;
    setClearError(null);
    setIsClearingAll(true);
    try {
      await clearAllWorkoutsAction();
      setConfirmClearOpen(false);
      setPushFeedback(null);
      router.push('/');
      router.refresh();
    } catch (err) {
      setClearError(
        err instanceof Error ? err.message : 'Failed to clear workouts.'
      );
    } finally {
      setIsClearingAll(false);
    }
  }

  return (
    <div className="min-h-dvh text-[#181818]">
      {/* Architectural Minimalist Header */}
      <header className="sticky top-0 z-30 border-b border-[#D4D4CE] bg-[#F7F7F5]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-none border border-[#2A2A28] bg-[#181818] text-[#F7F7F5]">
              <Bike className="h-4 w-4 stroke-[1.75]" />
            </div>
            <span className="hidden text-sm font-semibold tracking-tight text-[#181818] sm:inline">
              Chow Cycling
            </span>
          </div>

          <nav
            aria-label="Primary navigation"
            className="inline-flex items-center border border-[#D4D4CE] bg-[#EFEFEC]"
          >
            <button
              type="button"
              onClick={() => setActiveTab('block')}
              className={`inline-flex h-8 items-center gap-1.5 rounded-none border-r border-[#D4D4CE] px-3.5 text-xs font-medium tracking-wide uppercase transition ${
                activeTab === 'block'
                  ? 'bg-[#3B5B7A] text-[#F7F7F5]'
                  : 'text-[#181818] hover:bg-white'
              }`}
            >
              <Layers className="h-3.5 w-3.5 stroke-[1.75]" />
              <span className="hidden sm:inline">Current Block</span>
              <span className="sm:hidden">Block</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('events')}
              className={`inline-flex h-8 items-center gap-1.5 rounded-none border-r border-[#D4D4CE] px-3.5 text-xs font-medium tracking-wide uppercase transition ${
                activeTab === 'events'
                  ? 'bg-[#3B5B7A] text-[#F7F7F5]'
                  : 'text-[#181818] hover:bg-white'
              }`}
            >
              <Flag className="h-3.5 w-3.5 stroke-[1.75]" />
              Events
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`inline-flex h-8 items-center gap-1.5 rounded-none px-3.5 text-xs font-medium tracking-wide uppercase transition ${
                activeTab === 'profile'
                  ? 'bg-[#3B5B7A] text-[#F7F7F5]'
                  : 'text-[#181818] hover:bg-white'
              }`}
            >
              <User className="h-3.5 w-3.5 stroke-[1.75]" />
              Profile
            </button>
          </nav>

          <form action={signOutAction}>
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className="inline-flex h-8 w-8 items-center justify-center rounded-none border border-[#D4D4CE] bg-white text-[#6B6B68] transition hover:border-[#2A2A28] hover:text-[#181818]"
            >
              <LogOut className="h-3.5 w-3.5 stroke-[1.75]" />
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-9">
        {activeTab === 'profile' ? (
          <ProfileView
            profile={profile}
            powerCurves={powerCurves}
            userEmail={userEmail}
          />
        ) : activeTab === 'events' ? (
          <EventsCalendarView
            events={events}
            todayStr={todayStr}
            onAddEvent={() => setEventModalState({ open: true, event: null })}
            onEditEvent={(selectedEvent) =>
              setEventModalState({ open: true, event: selectedEvent })
            }
          />
        ) : (
          <>
            <EventCountdownBanner
              events={events}
              todayStr={todayStr}
              onOpenEvents={() => setActiveTab('events')}
            />

            {/* Architectural Active Block Header */}
            <section className="mb-6 rounded-none border border-[#D4D4CE] bg-white p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                    <span className="border border-[#2A2A28] bg-[#181818] px-2 py-0.5 font-medium text-[#F7F7F5] uppercase">
                      {formatWeekRange(weekStart)}
                    </span>
                    <span className="inline-flex items-center gap-1 border border-[#D4D4CE] bg-[#F7F7F5] px-2 py-0.5 font-medium text-[#181818] tabular-nums">
                      <Zap className="h-3 w-3 text-[#3B5B7A]" />
                      FTP {ftpWatts}W
                    </span>
                    {plannedMinutes > 0 ? (
                      <span className="border border-[#D4D4CE] bg-[#EFEFEC] px-2 py-0.5 font-medium text-[#181818] tabular-nums">
                        {formatDuration(completedMinutes)} /{' '}
                        {formatDuration(plannedMinutes)}
                      </span>
                    ) : null}
                    {zoneSplit ? (
                      <span
                        title={`Weekly zone split — Z1-Z2: ${zoneSplit.lowPct}% · Z3-Z4: ${zoneSplit.moderatePct}% · Z5+: ${zoneSplit.highPct}%`}
                        className="inline-flex items-center gap-1.5"
                        aria-label={`Zone split: Z1-2 ${zoneSplit.lowPct}%, Z3-4 ${zoneSplit.moderatePct}%, Z5+ ${zoneSplit.highPct}%`}
                      >
                        {/* Segmented horizontal zone bar */}
                        <span className="inline-flex h-[14px] w-[72px] overflow-hidden rounded-sm border border-[#D4D4CE]">
                          <span
                            style={{ width: `${zoneSplit.lowPct}%`, background: '#5A8299' }}
                            className="h-full shrink-0 transition-[width]"
                          />
                          <span
                            style={{ width: `${zoneSplit.moderatePct}%`, background: '#B8882A' }}
                            className="h-full shrink-0 transition-[width]"
                          />
                          <span
                            style={{ width: `${zoneSplit.highPct}%`, background: '#B84A32' }}
                            className="h-full shrink-0 transition-[width]"
                          />
                        </span>
                        <span className="font-mono text-[10px] font-medium text-[#6B6B68] tabular-nums">
                          {zoneSplit.lowPct}
                          <span className="text-[#9A9A95]">/</span>
                          {zoneSplit.moderatePct}
                          <span className="text-[#9A9A95]">/</span>
                          {zoneSplit.highPct}
                          <span className="ml-0.5 text-[#9A9A95]">%</span>
                        </span>
                      </span>
                    ) : null}
                  </div>

                  <h1 className="mt-2.5 text-lg font-semibold leading-snug tracking-tight text-[#181818] sm:text-xl">
                    {activeBlock
                      ? `${activeBlock.name} · Week ${week?.block_week ?? activeBlock.current_week} of ${activeBlock.total_weeks}${currentPhaseLabel ? ` · ${currentPhaseLabel}` : ''}`
                      : week?.title ?? 'No Active Training Block'}
                  </h1>

                  {week?.focus ? (
                    <p className="mt-1 text-xs leading-relaxed text-[#6B6B68]">
                      {week.focus}
                    </p>
                  ) : activeBlock?.goal ? (
                    <p className="mt-1 text-xs leading-relaxed text-[#6B6B68]">
                      {activeBlock.goal}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    const currentWeekStart = todayStr
                      ? getMondayOfWeek(todayStr)
                      : null;
                    const weekOffset = currentWeekStart
                      ? Math.round(
                          (Date.parse(`${weekStart}T00:00:00Z`) -
                            Date.parse(`${currentWeekStart}T00:00:00Z`)) /
                            (7 * 86_400_000)
                        )
                      : 0;

                    const weekLabel =
                      weekOffset === 0
                        ? 'Current'
                        : weekOffset === 1
                          ? 'Next Week'
                          : weekOffset === -1
                            ? 'Last Week'
                            : weekOffset > 1
                              ? `In ${weekOffset} Wks`
                              : `${Math.abs(weekOffset)} Wks Ago`;

                    return (
                      <div className="inline-flex items-center border border-[#D4D4CE] bg-[#F7F7F5]">
                        <Link
                          href={`/?week=${prevWeekStart}`}
                          aria-label="Previous week"
                          className="inline-flex h-8 w-8 items-center justify-center border-r border-[#D4D4CE] text-[#181818] transition hover:bg-white"
                        >
                          <ChevronLeft className="h-4 w-4 stroke-[1.75]" />
                        </Link>
                        {weekOffset === 0 ? (
                          <span className="inline-flex h-8 cursor-default items-center border-r border-[#D4D4CE] bg-[#EFEFEC] px-3 font-mono text-[11px] font-medium text-[#6B6B68] uppercase select-none">
                            {weekLabel}
                          </span>
                        ) : (
                          <Link
                            href="/"
                            title="Return to current week"
                            className="inline-flex h-8 items-center border-r border-[#D4D4CE] px-3 font-mono text-[11px] font-medium text-[#3B5B7A] uppercase transition hover:bg-white"
                          >
                            {weekLabel}
                          </Link>
                        )}
                        <Link
                          href={`/?week=${nextWeekStart}`}
                          aria-label="Next week"
                          className="inline-flex h-8 w-8 items-center justify-center text-[#181818] transition hover:bg-white"
                        >
                          <ChevronRight className="h-4 w-4 stroke-[1.75]" />
                        </Link>
                      </div>
                    );
                  })()}

                  {exportableCount > 0 ? (
                    <>
                      <button
                        type="button"
                        disabled={isPushingIntervals}
                        onClick={handlePushToIntervals}
                        title="Push active week to Intervals.icu calendar"
                        className="inline-flex h-8 items-center gap-1.5 rounded-none border border-[#3B5B7A] bg-[#3B5B7A] px-3 font-mono text-[11px] font-medium text-[#F7F7F5] uppercase transition hover:bg-[#2E4861] disabled:opacity-50"
                      >
                        {isPushingIntervals ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3 w-3 stroke-[1.75]" />
                        )}
                        <span className="hidden md:inline">
                          Push Week to Intervals
                        </span>
                        <span className="md:hidden">Intervals</span>
                      </button>

                      <button
                        type="button"
                        disabled={isExportingZip}
                        onClick={handleExportWeekZip}
                        title="Export Week (.ZIP of .FIT files)"
                        className="inline-flex h-8 items-center gap-1.5 rounded-none border border-[#D4D4CE] bg-[#F7F7F5] px-3 font-mono text-[11px] font-medium text-[#181818] uppercase transition hover:border-[#2A2A28] hover:bg-white disabled:opacity-50"
                      >
                        {isExportingZip ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FileArchive className="h-3.5 w-3.5 text-[#3B5B7A] stroke-[1.75]" />
                        )}
                        <span>.ZIP</span>
                      </button>
                    </>
                  ) : null}

                  {canGenerateNextWeek ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setBlockModalMode('next-week')}
                        className="inline-flex h-8 items-center gap-1.5 rounded-none border border-[#2A2A28] bg-[#181818] px-3.5 font-mono text-[11px] font-medium text-[#F7F7F5] uppercase transition hover:bg-[#3B5B7A] hover:border-[#3B5B7A]"
                      >
                        <Sparkles className="h-3 w-3 text-[#A8C1D8]" />
                        <span>
                          Generate Week {nextWeekNumber} of{' '}
                          {activeBlock.total_weeks}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setBlockModalMode('start')}
                        title="Start a new training block"
                        aria-label="Start new training block"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-none border border-[#D4D4CE] bg-[#F7F7F5] text-[#6B6B68] transition hover:border-[#2A2A28] hover:bg-white hover:text-[#181818]"
                      >
                        <RotateCcw className="h-3.5 w-3.5 stroke-[1.75]" />
                      </button>
                    </>
                  ) : (
                      <button
                        type="button"
                        onClick={() => setBlockModalMode('start')}
                        className="inline-flex h-8 items-center gap-1.5 rounded-none border border-[#2A2A28] bg-[#181818] px-3.5 font-mono text-[11px] font-medium text-[#F7F7F5] uppercase transition hover:bg-[#3B5B7A] hover:border-[#3B5B7A]"
                      >
                        <Sparkles className="h-3 w-3 text-[#A8C1D8]" />
                        <span>Start Training Block</span>
                      </button>
                  )}

                  {workouts.length > 0 || activeBlock !== null ? (
                    <button
                      type="button"
                      onClick={() => {
                        setClearError(null);
                        setConfirmClearOpen(true);
                      }}
                      title="Clear all workouts"
                      aria-label="Clear all workouts"
                      className="inline-flex h-8 items-center gap-1.5 rounded-none border border-[#D4D4CE] bg-[#F7F7F5] px-2.5 font-mono text-[11px] font-medium text-[#6B6B68] uppercase transition hover:border-[#991B1B] hover:bg-[#FEF2F2] hover:text-[#991B1B]"
                    >
                      <Trash2 className="h-3.5 w-3.5 stroke-[1.75]" />
                      <span className="hidden sm:inline">Clear All</span>
                    </button>
                  ) : null}
                </div>
              </div>

              {pushFeedback ? (
                <div
                  className={`mt-4 border px-3.5 py-2 font-mono text-[11px] font-medium uppercase ${
                    pushFeedback.type === 'success'
                      ? 'border-[#3B5B7A] bg-[#F7F7F5] text-[#3B5B7A]'
                      : 'border-[#B91C1C]/40 bg-[#FEF2F2] text-[#991B1B]'
                  }`}
                >
                  {pushFeedback.message}
                </div>
              ) : null}
            </section>

            {/* Clean Daily Timeline Layout (Mon-Sun) */}
            <section
              aria-label="Daily training timeline"
              className="grid grid-cols-1 gap-5 md:grid-cols-2"
            >
              {DAYS_OF_WEEK.map((d) => {
                const dateStr = addDays(weekStart, d.day - 1);
                const dayWorkouts = workouts.filter(
                  (w) => w.day_of_week === d.day
                );
                return (
                  <DayCard
                    key={d.day}
                    shortName={d.short}
                    fullName={d.full}
                    dateStr={dateStr}
                    isToday={todayStr === dateStr}
                    workouts={dayWorkouts}
                    ftpWatts={ftpWatts}
                    weekEnvironment={week?.environment ?? 'outdoor'}
                  />
                );
              })}
            </section>
          </>
        )}
      </main>

      {blockModalMode ? (
        <GenerateBlockModal
          mode={blockModalMode}
          currentWeekStart={weekStart}
          activeBlock={activeBlock}
          onGenerated={(targetWk) => {
            setBlockModalMode(null);
            if (targetWk !== weekStart) {
              router.push(`/?week=${targetWk}`);
            }
            router.refresh();
          }}
          onClose={() => setBlockModalMode(null)}
        />
      ) : null}

      {eventModalState.open ? (
        <EventModal
          event={eventModalState.event}
          onClose={() => setEventModalState({ open: false, event: null })}
        />
      ) : null}

      {confirmClearOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm clear all workouts"
        >
          <div className="w-full max-w-md rounded-none border border-[#2A2A28] bg-[#F7F7F5] p-6">
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-[#D4D4CE] pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-[#991B1B] bg-[#FEF2F2] text-[#991B1B]">
                  <AlertTriangle className="h-4 w-4 stroke-[1.75]" />
                </div>
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-[#181818]">
                    Clear All Workouts?
                  </h2>
                  <p className="font-mono text-[11px] text-[#6B6B68] uppercase">
                    This action cannot be undone
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={isClearingAll}
                onClick={() => setConfirmClearOpen(false)}
                aria-label="Close confirmation dialog"
                className="flex h-8 w-8 items-center justify-center rounded-none border border-[#D4D4CE] bg-white text-[#6B6B68] transition hover:border-[#2A2A28] hover:text-[#181818] disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm leading-relaxed text-[#3A3A38]">
              Are you sure you want to delete all scheduled workouts across every
              week and reset your current training block? Your athlete profile,
              FTP, and target events will stay untouched.
            </p>

            {clearError ? (
              <div className="mt-4 rounded-none border border-[#B91C1C]/40 bg-[#FEF2F2] px-3 py-2 font-mono text-xs font-medium text-[#991B1B]">
                {clearError}
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-[#D4D4CE] pt-4">
              <button
                type="button"
                disabled={isClearingAll}
                onClick={() => setConfirmClearOpen(false)}
                className="rounded-none border border-[#D4D4CE] bg-white px-4 py-2 font-mono text-[11px] font-medium text-[#181818] uppercase transition hover:border-[#2A2A28] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isClearingAll}
                onClick={handleConfirmClearAll}
                className="inline-flex items-center gap-1.5 rounded-none border border-[#991B1B] bg-[#991B1B] px-4 py-2 font-mono text-[11px] font-medium text-[#F7F7F5] uppercase transition hover:bg-[#7F1D1D] disabled:opacity-60"
              >
                {isClearingAll ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Clearing…
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    Yes, Clear All
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
