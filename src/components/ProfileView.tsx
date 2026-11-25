'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, Sparkles, User, Zap } from 'lucide-react';
import { saveAthleteProfileAction } from '@/app/actions/profile';
import {
  computeFractionalUtilization,
  selectReferencePeak5m,
  type IntervalsPowerCurveResult,
} from '@/lib/intervals/pdc';
import type { AthleteProfile, EstimatedPowerCurve } from '@/types/training';

interface ProfileViewProps {
  profile: AthleteProfile;
  powerCurves: IntervalsPowerCurveResult;
  userEmail: string;
}

export function ProfileView({
  profile,
  powerCurves,
  userEmail,
}: ProfileViewProps) {
  const router = useRouter();
  const [age, setAge] = useState<string>(
    profile.age !== null ? String(profile.age) : ''
  );
  const [weightKg, setWeightKg] = useState<string>(
    profile.weight_kg !== null ? String(profile.weight_kg) : ''
  );
  const [powerData, setPowerData] = useState<string>(
    profile.current_power_data ?? ''
  );
  const [ftp, setFtp] = useState<number>(profile.ai_estimated_ftp || 365);
  const [rationale, setRationale] = useState<string | null>(
    profile.ftp_rationale
  );
  const [estimatedCurve, setEstimatedCurve] =
    useState<EstimatedPowerCurve | null>(profile.estimated_power_curve ?? null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isSaving, startSaveTransition] = useTransition();

  const parsedWeight = Number(weightKg);
  const hasWeight = Number.isFinite(parsedWeight) && parsedWeight > 0;
  const wPerKg = hasWeight ? (ftp / parsedWeight).toFixed(2) : null;

  const pdc42 = powerCurves.last42Days;
  const ref5m = selectReferencePeak5m(powerCurves);
  const peak5sWatts = estimatedCurve?.watts_5s ?? pdc42?.peak5s.watts ?? null;
  const peak1mWatts = estimatedCurve?.watts_1m ?? pdc42?.peak1m.watts ?? null;
  const peak5mWatts = estimatedCurve?.watts_5m ?? ref5m?.watts ?? null;
  const peak20mWatts =
    estimatedCurve?.watts_20m ?? pdc42?.peak20m.watts ?? null;
  const peak60mWatts = estimatedCurve?.watts_60m ?? null;

  const fracUtil = computeFractionalUtilization(
    ftp,
    peak5mWatts,
    ref5m?.sourceCurve ?? '42d'
  );
  const formatPeak = (watts: number | null) =>
    watts !== null ? `${watts}W` : '--';
  const formatPeakWkg = (watts: number | null) =>
    watts !== null && hasWeight ? `${(watts / parsedWeight).toFixed(2)} W/kg` : '-- W/kg';

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setStatusMsg(null);
    setErrorMsg(null);

    startSaveTransition(async () => {
      try {
        const saved = await saveAthleteProfileAction({
          age: age ? Number(age) : null,
          weightKg: weightKg ? Number(weightKg) : null,
          currentPowerData: powerData || null,
          aiEstimatedFtp: ftp,
        });
        setFtp(saved.ai_estimated_ftp);
        setStatusMsg('Profile saved.');
        router.refresh();
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Could not save profile.'
        );
      }
    });
  }

  async function handleRecalculateFtp() {
    setStatusMsg(null);
    setErrorMsg(null);
    setIsEstimating(true);
    try {
      const res = await fetch('/api/estimate-ftp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          age: age ? Number(age) : null,
          weightKg: weightKg ? Number(weightKg) : null,
          currentPowerData: powerData || null,
          baselineFtp: ftp,
        }),
      });
      const payload = (await res.json()) as {
        profile?: AthleteProfile;
        error?: string;
      };
      if (!res.ok || !payload.profile) {
        throw new Error(payload.error || 'Unable to estimate FTP.');
      }
      setFtp(payload.profile.ai_estimated_ftp);
      setRationale(payload.profile.ftp_rationale);
      setEstimatedCurve(payload.profile.estimated_power_curve ?? null);
      setStatusMsg(`AI FTP & Power Curve updated (${payload.profile.ai_estimated_ftp} W).`);
      router.refresh();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to estimate FTP.'
      );
    } finally {
      setIsEstimating(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* AI FTP Hero Block */}
      <section className="rounded-none border border-[#2A2A28] bg-[#181818] p-6 text-[#F7F7F5]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 font-mono text-[11px] font-medium tracking-wider text-[#A8C1D8] uppercase">
              <Zap className="h-3.5 w-3.5" />
              AI-Estimated FTP Engine
            </div>
            <div className="mt-2.5 flex items-baseline gap-3">
              <span className="font-mono text-4xl font-semibold tracking-tight tabular-nums">
                {ftp}W
              </span>
              {wPerKg ? (
                <span className="border border-[#3B5B7A] bg-[#3B5B7A] px-2 py-0.5 font-mono text-[11px] font-medium text-[#F7F7F5] tabular-nums">
                  {wPerKg} W/KG
                </span>
              ) : null}
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-[#B5B5B0]">
              {rationale ||
                'All generated training blocks and .FIT workout targets derive absolute Wattage directly from this FTP.'}
            </p>
          </div>

          <button
            type="button"
            disabled={isEstimating || isSaving}
            onClick={handleRecalculateFtp}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-none border border-[#D4D4CE] bg-[#F7F7F5] px-4 font-mono text-[11px] font-medium text-[#181818] uppercase transition hover:bg-white disabled:opacity-60"
          >
            {isEstimating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Analyzing…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 text-[#3B5B7A]" />
                Recalculate AI FTP
              </>
            )}
          </button>
        </div>
      </section>

      {/* Hairline AI-Estimated Power Curve & Fractional Utilization Strip */}
      <section className="grid grid-cols-2 gap-px border border-[#D4D4CE] bg-[#D4D4CE] font-mono sm:grid-cols-3 lg:grid-cols-6">
        {[
          {
            label: '5S PEAK',
            value: formatPeak(peak5sWatts),
            sub: formatPeakWkg(peak5sWatts),
          },
          {
            label: '1M PEAK',
            value: formatPeak(peak1mWatts),
            sub: formatPeakWkg(peak1mWatts),
          },
          {
            label: '5M PEAK',
            value: formatPeak(peak5mWatts),
            sub: formatPeakWkg(peak5mWatts),
          },
          {
            label: '20M PEAK',
            value: formatPeak(peak20mWatts),
            sub: formatPeakWkg(peak20mWatts),
          },
          {
            label: '60M PEAK',
            value: formatPeak(peak60mWatts),
            sub: formatPeakWkg(peak60mWatts),
          },
          {
            label: 'FRAC UTIL',
            value: fracUtil ? `${fracUtil.percentage}%` : '--',
            sub: peak5mWatts ? `${ftp}/${peak5mWatts}W` : 'FTP ÷ 5M',
          },
        ].map((cell, idx) => (
          <div
            key={cell.label}
            className={`px-3.5 py-3 ${idx === 5 ? 'bg-[#EFEFEC] text-[#181818]' : 'bg-white text-[#181818]'}`}
          >
            <div
              className={`text-[10px] font-medium tracking-wider uppercase ${idx === 5 ? 'text-[#3B5B7A]' : 'text-[#6B6B68]'}`}
            >
              {cell.label}
            </div>
            <div className="mt-1 text-sm font-semibold tabular-nums sm:text-base">
              {cell.value}
            </div>
            <div className="mt-0.5 text-[10px] font-normal text-[#6B6B68] tabular-nums">
              {cell.sub}
            </div>
          </div>
        ))}
      </section>

      {/* Athlete Profile Form */}
      <section className="rounded-none border border-[#D4D4CE] bg-white p-6">
        <div className="mb-6 flex items-center gap-3.5 border-b border-[#D4D4CE] pb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-none border border-[#D4D4CE] bg-[#EFEFEC] text-[#181818]">
            <User className="h-4 w-4 stroke-[1.75]" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-[#181818]">
              Athlete Profile
            </h1>
            <p className="font-mono text-xs text-[#6B6B68]">{userEmail}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          {errorMsg ? (
            <div className="rounded-none border border-[#B91C1C]/40 bg-[#FEF2F2] px-3.5 py-2.5 font-mono text-xs font-medium text-[#991B1B]">
              {errorMsg}
            </div>
          ) : null}
          {statusMsg ? (
            <div className="rounded-none border border-[#3B5B7A] bg-[#F7F7F5] px-3.5 py-2.5 font-mono text-xs font-medium text-[#3B5B7A]">
              {statusMsg}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="profile-age"
                className="mb-1.5 block font-mono text-[11px] font-medium tracking-wider text-[#6B6B68] uppercase"
              >
                Age
              </label>
              <input
                id="profile-age"
                type="number"
                min={14}
                max={95}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="26"
                className="w-full rounded-none border border-[#D4D4CE] bg-[#F7F7F5] px-3.5 py-2.5 font-mono text-sm font-medium text-[#181818] placeholder:text-[#9A9A95] focus:border-[#3B5B7A] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="profile-weight"
                className="mb-1.5 block font-mono text-[11px] font-medium tracking-wider text-[#6B6B68] uppercase"
              >
                Weight (kg)
              </label>
              <input
                id="profile-weight"
                type="number"
                min={40}
                max={140}
                step={0.1}
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="68.0"
                className="w-full rounded-none border border-[#D4D4CE] bg-[#F7F7F5] px-3.5 py-2.5 font-mono text-sm font-medium text-[#181818] placeholder:text-[#9A9A95] focus:border-[#3B5B7A] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="profile-power-data"
              className="mb-1.5 block font-mono text-[11px] font-medium tracking-wider text-[#6B6B68] uppercase"
            >
              Current Power Data &amp; Best Efforts
            </label>
            <textarea
              id="profile-power-data"
              rows={4}
              value={powerData}
              onChange={(e) => setPowerData(e.target.value)}
              placeholder="1m: 620W · 5m: 440W · 8m uphill max: 405W · 20m: 385W · Recent 4x8m avg 390W"
              className="w-full rounded-none border border-[#D4D4CE] bg-[#F7F7F5] px-3.5 py-2.5 font-mono text-xs leading-relaxed text-[#181818] placeholder:text-[#9A9A95] focus:border-[#3B5B7A] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={isSaving || isEstimating}
              className="inline-flex h-9 items-center gap-1.5 rounded-none border border-[#2A2A28] bg-[#181818] px-4 font-mono text-[11px] font-medium text-[#F7F7F5] uppercase transition hover:bg-[#3B5B7A] hover:border-[#3B5B7A] disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  Save Profile
                </>
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
