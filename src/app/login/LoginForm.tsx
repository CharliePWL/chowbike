'use client';

import { useActionState, useState } from 'react';
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { signInAction, type LoginState } from './actions';

const initialState: LoginState = { error: null };

export function LoginForm({ initialError }: { initialError?: string | null }) {
  const [state, formAction, isPending] = useActionState(
    signInAction,
    initialState
  );
  const [showPassword, setShowPassword] = useState(false);

  const errorMessage = state.error ?? initialError;

  return (
    <form action={formAction} className="space-y-4">
      {errorMessage ? (
        <div
          role="alert"
          className="rounded-none border border-[#B91C1C]/40 bg-[#FEF2F2] px-3.5 py-2.5 text-xs font-medium text-[#991B1B]"
        >
          {errorMessage}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label
          htmlFor="email"
          className="block font-mono text-[11px] font-medium tracking-wider text-[#6B6B68] uppercase"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          className="w-full rounded-none border border-[#D4D4CE] bg-[#F7F7F5] px-3.5 py-2.5 text-sm font-normal text-[#181818] placeholder:text-[#9A9A95] focus:border-[#3B5B7A] focus:bg-white focus:outline-none"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="block font-mono text-[11px] font-medium tracking-wider text-[#6B6B68] uppercase"
        >
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className="w-full rounded-none border border-[#D4D4CE] bg-[#F7F7F5] py-2.5 pr-10 pl-3.5 text-sm font-normal text-[#181818] placeholder:text-[#9A9A95] focus:border-[#3B5B7A] focus:bg-white focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-[#6B6B68] transition hover:text-[#181818]"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-none border border-[#2A2A28] bg-[#181818] px-4 py-2.5 font-mono text-xs font-medium tracking-wider text-[#F7F7F5] uppercase transition hover:bg-[#3B5B7A] hover:border-[#3B5B7A] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Signing in…
          </>
        ) : (
          <>
            <Lock className="h-3.5 w-3.5" />
            Sign In
          </>
        )}
      </button>
    </form>
  );
}
