'use server';

import { revalidatePath } from 'next/cache';
import { addDays } from '@/lib/dates';
import { requireAllowedUser } from '@/lib/supabase/auth';
import type { TrainingWeek, Workout } from '@/types/training';

async function ensureWeekRecord(
  weekStart: string,
  defaults?: { title?: string; focus?: string | null }
): Promise<TrainingWeek> {
  const { supabase } = await requireAllowedUser();

  const { data: existing, error: fetchError } = await supabase
    .from('training_weeks')
    .select('*')
    .eq('week_start', weekStart)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (existing) {
    return existing as TrainingWeek;
  }

  const { data: created, error: insertError } = await supabase
    .from('training_weeks')
    .insert({
      week_start: weekStart,
      title: defaults?.title?.trim() || 'Training Week',
      focus: defaults?.focus?.trim() || null,
    })
    .select('*')
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return created as TrainingWeek;
}

export async function createWeekAction(input: {
  weekStart: string;
  title?: string;
  focus?: string | null;
  copyFromPrevious?: boolean;
}) {
  const { supabase } = await requireAllowedUser();
  const week = await ensureWeekRecord(input.weekStart, {
    title: input.title,
    focus: input.focus,
  });

  if (input.copyFromPrevious) {
    const prevStart = addDays(input.weekStart, -7);
    const { data: prevWeek } = await supabase
      .from('training_weeks')
      .select('id, title, focus')
      .eq('week_start', prevStart)
      .maybeSingle();

    if (prevWeek) {
      const { data: prevWorkouts, error: prevErr } = await supabase
        .from('workouts')
        .select('day_of_week, sort_order, title, duration_minutes, zone, intervals')
        .eq('week_id', prevWeek.id)
        .order('day_of_week', { ascending: true })
        .order('sort_order', { ascending: true });

      if (prevErr) {
        throw new Error(prevErr.message);
      }

      if (prevWorkouts && prevWorkouts.length > 0) {
        const clonedRows = prevWorkouts.map((w) => ({
          week_id: week.id,
          day_of_week: w.day_of_week,
          sort_order: w.sort_order,
          title: w.title,
          duration_minutes: w.duration_minutes,
          zone: w.zone,
          intervals: w.intervals,
          completed: false,
          notes: null,
          completed_at: null,
        }));

        const { error: cloneErr } = await supabase
          .from('workouts')
          .insert(clonedRows);

        if (cloneErr) {
          throw new Error(cloneErr.message);
        }
      }
    }
  }

  revalidatePath('/');
  return week;
}

export async function updateWeekMetaAction(input: {
  weekId: string;
  title: string;
  focus: string | null;
}) {
  const { supabase } = await requireAllowedUser();

  const { error } = await supabase
    .from('training_weeks')
    .update({
      title: input.title.trim() || 'Training Week',
      focus: input.focus?.trim() || null,
    })
    .eq('id', input.weekId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/');
}

export async function upsertWorkoutAction(input: {
  id?: string;
  weekId?: string | null;
  weekStart: string;
  dayOfWeek: number;
  title: string;
  durationMinutes: number;
  zone: string;
  intervals: string | null;
  notes: string | null;
}): Promise<Workout> {
  const { supabase } = await requireAllowedUser();

  const weekId =
    input.weekId ?? (await ensureWeekRecord(input.weekStart)).id;

  const cleanTitle = input.title.trim();
  if (!cleanTitle) {
    throw new Error('Workout title is required.');
  }

  const durationMinutes = Math.max(0, Math.round(Number(input.durationMinutes) || 0));
  const cleanZone = input.zone.trim() || 'Z2';
  const cleanIntervals = input.intervals?.trim() || null;
  const cleanNotes = input.notes?.trim() || null;

  if (input.id) {
    const { data, error } = await supabase
      .from('workouts')
      .update({
        day_of_week: input.dayOfWeek,
        title: cleanTitle,
        duration_minutes: durationMinutes,
        zone: cleanZone,
        intervals: cleanIntervals,
        notes: cleanNotes,
      })
      .eq('id', input.id)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath('/');
    return data as Workout;
  }

  const { data: existingForDay } = await supabase
    .from('workouts')
    .select('sort_order')
    .eq('week_id', weekId)
    .eq('day_of_week', input.dayOfWeek)
    .order('sort_order', { ascending: false })
    .limit(1);

  const nextOrder =
    existingForDay && existingForDay.length > 0
      ? existingForDay[0].sort_order + 1
      : 0;

  const { data, error } = await supabase
    .from('workouts')
    .insert({
      week_id: weekId,
      day_of_week: input.dayOfWeek,
      sort_order: nextOrder,
      title: cleanTitle,
      duration_minutes: durationMinutes,
      zone: cleanZone,
      intervals: cleanIntervals,
      notes: cleanNotes,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/');
  return data as Workout;
}

export async function toggleWorkoutCompletedAction(input: {
  workoutId: string;
  completed: boolean;
}) {
  const { supabase } = await requireAllowedUser();

  const { error } = await supabase
    .from('workouts')
    .update({
      completed: input.completed,
      completed_at: input.completed ? new Date().toISOString() : null,
    })
    .eq('id', input.workoutId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/');
}

export async function updateWorkoutNotesAction(input: {
  workoutId: string;
  notes: string;
}) {
  const { supabase } = await requireAllowedUser();

  const { error } = await supabase
    .from('workouts')
    .update({
      notes: input.notes.trim() || null,
    })
    .eq('id', input.workoutId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/');
}

export async function updateWorkoutDetailsAction(input: {
  workoutId: string;
  durationMinutes: number;
  intervals: string | null;
  notes: string | null;
}): Promise<Workout> {
  const { supabase } = await requireAllowedUser();

  const durationMinutes = Math.max(
    0,
    Math.min(720, Math.round(Number(input.durationMinutes) || 0))
  );
  const cleanIntervals = input.intervals?.trim() || null;
  const cleanNotes = input.notes?.trim() || null;

  const { data, error } = await supabase
    .from('workouts')
    .update({
      duration_minutes: durationMinutes,
      intervals: cleanIntervals,
      notes: cleanNotes,
      ...(durationMinutes === 0 ? { zone: 'Rest' } : {}),
    })
    .eq('id', input.workoutId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/');
  return data as Workout;
}

export async function deleteWorkoutAction(workoutId: string) {
  const { supabase } = await requireAllowedUser();

  const { error } = await supabase
    .from('workouts')
    .delete()
    .eq('id', workoutId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/');
}

export async function clearAllWorkoutsAction() {
  const { supabase, user } = await requireAllowedUser();

  const { error: workoutsErr } = await supabase
    .from('workouts')
    .delete()
    .not('id', 'is', null);

  if (workoutsErr) {
    throw new Error(workoutsErr.message);
  }

  const { error: weeksErr } = await supabase
    .from('training_weeks')
    .delete()
    .not('id', 'is', null);

  if (weeksErr) {
    throw new Error(weeksErr.message);
  }

  const { error: blocksErr } = await supabase
    .from('training_blocks')
    .delete()
    .eq('user_id', user.id);

  if (blocksErr) {
    throw new Error(blocksErr.message);
  }

  revalidatePath('/');
}
