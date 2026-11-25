import { NextResponse } from 'next/server';
import { getMondayOfWeek } from '@/lib/dates';
import { pushWeekToIntervals } from '@/lib/intervals/client';
import { isAllowedEmail } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import type { Workout } from '@/types/training';

interface PushWeekBody {
  weekStart?: string;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || !isAllowedEmail(user.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as PushWeekBody;
    const weekStart = getMondayOfWeek(body.weekStart);

    const [{ data: weekData, error: weekErr }, { data: profileData }] =
      await Promise.all([
        supabase
          .from('training_weeks')
          .select('id')
          .eq('week_start', weekStart)
          .maybeSingle(),
        supabase
          .from('athlete_profile')
          .select('ai_estimated_ftp')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

    if (weekErr) throw new Error(weekErr.message);
    if (!weekData) {
      return NextResponse.json(
        { error: 'No training week found for this date.' },
        { status: 404 }
      );
    }

    const { data: workoutRows, error: workoutsErr } = await supabase
      .from('workouts')
      .select('*')
      .eq('week_id', weekData.id)
      .order('day_of_week', { ascending: true })
      .order('sort_order', { ascending: true });

    if (workoutsErr) throw new Error(workoutsErr.message);

    const ftpWatts = profileData?.ai_estimated_ftp ?? 365;
    const { pushedCount } = await pushWeekToIntervals({
      weekStart,
      workouts: (workoutRows as Workout[] | null) ?? [],
      ftpWatts,
    });

    return NextResponse.json({ pushedCount, weekStart });
  } catch (err) {
    console.error('Error pushing week to Intervals.icu:', err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to push week to Intervals.icu.',
      },
      { status: 500 }
    );
  }
}
