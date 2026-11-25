import { Suspense } from 'react';
import { Bike } from 'lucide-react';
import { LoginForm } from './LoginForm';

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

async function LoginCard({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const initialError =
    params.error === 'unauthorized'
      ? 'This workspace is locked to a single owner account.'
      : null;

  return <LoginForm initialError={initialError} />;
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm rounded-none border border-[#D4D4CE] bg-white p-7">
        <div className="mb-6 flex items-center gap-3.5 border-b border-[#D4D4CE] pb-5">
          <div className="flex h-10 w-10 items-center justify-center border border-[#2A2A28] bg-[#181818] text-[#F7F7F5]">
            <Bike className="h-4 w-4 stroke-[1.75]" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-[#181818]">
              Chow Training
            </h1>
            <p className="font-mono text-[11px] font-medium tracking-wider text-[#6B6B68] uppercase">
              Private Cycling System
            </p>
          </div>
        </div>

        <Suspense
          fallback={
            <div className="h-44 animate-pulse border border-[#D4D4CE] bg-[#EFEFEC]" />
          }
        >
          <LoginCard searchParams={searchParams} />
        </Suspense>

        <p className="mt-6 border-t border-[#D4D4CE] pt-4 text-center font-mono text-[10px] tracking-widest text-[#6B6B68] uppercase">
          Single-user access · Supabase Auth &amp; RLS
        </p>
      </div>
    </main>
  );
}
