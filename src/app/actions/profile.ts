'use server';

import { revalidatePath } from 'next/cache';
import { requireAllowedUser } from '@/lib/supabase/auth';
import type { AthleteProfile } from '@/types/training';

export async function saveAthleteProfileAction(input: {
  age: number | null;
  weightKg: number | null;
  currentPowerData: string | null;
  aiEstimatedFtp?: number;
}): Promise<AthleteProfile> {
  const { supabase, user } = await requireAllowedUser();

  const cleanAge =
    input.age !== null && Number.isFinite(input.age) && input.age > 0
      ? Math.round(input.age)
      : null;
  const cleanWeight =
    input.weightKg !== null && Number.isFinite(input.weightKg) && input.weightKg > 0
      ? Math.round(input.weightKg * 10) / 10
      : null;
  const cleanPowerData = input.currentPowerData?.trim() || null;

  const payload: Record<string, unknown> = {
    user_id: user.id,
    age: cleanAge,
    weight_kg: cleanWeight,
    current_power_data: cleanPowerData,
  };

  if (
    input.aiEstimatedFtp !== undefined &&
    Number.isFinite(input.aiEstimatedFtp) &&
    input.aiEstimatedFtp >= 100
  ) {
    payload.ai_estimated_ftp = Math.round(input.aiEstimatedFtp);
  }

  const { data, error } = await supabase
    .from('athlete_profile')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/');
  return data as AthleteProfile;
}
