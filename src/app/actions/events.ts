'use server';

import { revalidatePath } from 'next/cache';
import { requireAllowedUser } from '@/lib/supabase/auth';
import type { EventPriority, TargetEvent } from '@/types/training';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const VALID_PRIORITIES = new Set<EventPriority>(['A', 'B', 'C']);

export async function upsertTargetEventAction(input: {
  id?: string;
  name: string;
  eventDate: string;
  priority: EventPriority;
  eventType: string;
  notes: string | null;
}): Promise<TargetEvent> {
  const { supabase, user } = await requireAllowedUser();

  const cleanName = input.name.trim();
  if (!cleanName) {
    throw new Error('Event name is required.');
  }

  const cleanDate = input.eventDate.trim();
  if (!DATE_REGEX.test(cleanDate)) {
    throw new Error('Please choose a valid event date.');
  }

  const priority = input.priority.trim().toUpperCase() as EventPriority;
  if (!VALID_PRIORITIES.has(priority)) {
    throw new Error('Priority must be A, B, or C.');
  }

  const cleanType = input.eventType.trim() || 'Road Race';
  const cleanNotes = input.notes?.trim() || null;

  if (input.id) {
    const { data, error } = await supabase
      .from('target_events')
      .update({
        name: cleanName,
        event_date: cleanDate,
        priority,
        event_type: cleanType,
        notes: cleanNotes,
      })
      .eq('id', input.id)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath('/');
    return data as TargetEvent;
  }

  const { data, error } = await supabase
    .from('target_events')
    .insert({
      user_id: user.id,
      name: cleanName,
      event_date: cleanDate,
      priority,
      event_type: cleanType,
      notes: cleanNotes,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/');
  return data as TargetEvent;
}

export async function deleteTargetEventAction(eventId: string) {
  const { supabase, user } = await requireAllowedUser();

  const { error } = await supabase
    .from('target_events')
    .delete()
    .eq('id', eventId)
    .eq('user_id', user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/');
}
