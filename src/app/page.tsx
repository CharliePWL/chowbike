import { Suspense } from 'react';
import { connection } from 'next/server';
import { WeeklyDashboard } from '@/components/WeeklyDashboard';
import { addDays, getMondayOfWeek } from '@/lib/dates';
import { fetchIntervalsPowerCurves } from '@/lib/intervals/client';
import { requireAllowedUser } from '@/lib/supabase/auth';
import type {
  AthleteProfile,
  TargetEvent,
  TrainingBlock,
  TrainingWeek,
  Workout,
} from '@/types/training';

interface HomePageProps {
  searchParams: Promise<{ week?: string }>;
}

const DEFAULT_PROFILE: AthleteProfile = {
  age: null,
  weight_kg: 68,
  current_power_data: null,
  ai_estimated_ftp: 365,
  ftp_rationale: null,
  ftp_updated_at: null,
  estimated_power_curve: null,
};

async function DashboardLoader({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await connection();
  const { supabase, user } = await requireAllowedUser();
  const params = await searchParams;

  const [
    { data: activeBlockData },
    { data: eventRows },
    { data: profileData },
    powerCurves,
  ] = await Promise.all([
    supabase
      .from('training_blocks')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('target_events')
      .select('*')
      .order('event_date', { ascending: true }),
    supabase
      .from('athlete_profile')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(),
    fetchIntervalsPowerCurves(),
  ]);

  const activeBlock = (activeBlockData as TrainingBlock | null) ?? null;
  const events = (eventRows as TargetEvent[] | null) ?? [];
  const profile = (profileData as AthleteProfile | null) ?? DEFAULT_PROFILE;

  // Default to the active block's current week when ?week= is omitted
  const defaultBlockWeekStart = activeBlock
    ? addDays(activeBlock.start_week, (activeBlock.current_week - 1) * 7)
    : undefined;
  const weekStart = getMondayOfWeek(params.week ?? defaultBlockWeekStart);

  const { data: weekData } = await supabase
    .from('training_weeks')
    .select('*')
    .eq('week_start', weekStart)
    .maybeSingle();

  const week = (weekData as TrainingWeek | null) ?? null;

  let workouts: Workout[] = [];
  if (week) {
    const { data: workoutRows } = await supabase
      .from('workouts')
      .select('*')
      .eq('week_id', week.id)
      .order('day_of_week', { ascending: true })
      .order('sort_order', { ascending: true });

    workouts = (workoutRows as Workout[] | null) ?? [];
  }

  return (
    <WeeklyDashboard
      key={weekStart}
      weekStart={weekStart}
      week={week}
      activeBlock={activeBlock}
      workouts={workouts}
      events={events}
      profile={profile}
      powerCurves={powerCurves}
      userEmail={user.email ?? ''}
    />
  );
}

function DashboardSkeleton() {
  return (
    <div className="min-h-dvh p-5 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="h-14 animate-pulse border border-[#D4D4CE] bg-[#EFEFEC]" />
        <div className="h-24 animate-pulse border border-[#D4D4CE] bg-white" />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-36 animate-pulse border border-[#D4D4CE] bg-white"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HomePage({ searchParams }: HomePageProps) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardLoader searchParams={searchParams} />
    </Suspense>
  );
}
