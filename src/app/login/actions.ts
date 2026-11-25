'use server';

import { redirect } from 'next/navigation';
import { isAllowedEmail } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';

export interface LoginState {
  error: string | null;
}

export async function signInAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Enter both your email and password.' };
  }

  if (!isAllowedEmail(email)) {
    return { error: 'This account is not authorized for this workspace.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  if (!isAllowedEmail(data.user?.email)) {
    await supabase.auth.signOut();
    return { error: 'This account is not authorized for this workspace.' };
  }

  redirect('/');
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
