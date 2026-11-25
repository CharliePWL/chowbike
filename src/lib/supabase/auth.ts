import { redirect } from 'next/navigation';
import { createClient } from './server';

export function isAllowedEmail(email?: string | null): boolean {
  const allowed = process.env.ALLOWED_USER_EMAIL?.trim().toLowerCase();
  if (!allowed || !email) return false;
  return email.trim().toLowerCase() === allowed;
}

/**
 * Validates the authenticated Supabase user on the server and ensures their email
 * matches ALLOWED_USER_EMAIL. Redirects to /login otherwise.
 */
export async function requireAllowedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  if (!isAllowedEmail(user.email)) {
    await supabase.auth.signOut();
    redirect('/login?error=unauthorized');
  }

  return { supabase, user };
}
