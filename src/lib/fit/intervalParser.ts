import type { Workout } from '@/types/training';

export type StepIntensity =
  | 'warmup'
  | 'active'
  | 'recovery'
  | 'rest'
  | 'cooldown'
  | 'interval';

export interface PowerTarget {
  lowWatts: number;
  highWatts: number;
  zone: number;
}

export interface FitStep {
  type: 'step';
  name: string;
  durationSeconds: number;
  intensity: StepIntensity;
  power: PowerTarget;
}

export interface FitRepeatBlock {
  type: 'repeat';
  repeatCount: number;
  items: FitPlanItem[];
}

export type FitPlanItem = FitStep | FitRepeatBlock;

export interface PreviewBlock {
  startSec: number;
  durationSec: number;
  watts: number;
  lowWatts: number;
  highWatts: number;
  intensity: StepIntensity;
  label: string;
}

const ZONE_PCT_BANDS: Record<number, { lowPct: number; highPct: number }> = {
  1: { lowPct: 0.45, highPct: 0.55 },
  2: { lowPct: 0.58, highPct: 0.72 },
  3: { lowPct: 0.78, highPct: 0.89 },
  4: { lowPct: 0.92, highPct: 1.04 },
  5: { lowPct: 1.07, highPct: 1.2 },
  6: { lowPct: 1.25, highPct: 1.5 },
};

export function isExportableWorkout(workout: Workout): boolean {
  return (
    workout.duration_minutes > 0 &&
    workout.zone.trim().toLowerCase() !== 'rest'
  );
}

export function getZoneNumberFromName(zoneName: string): number {
  const lower = zoneName.trim().toLowerCase();
  if (lower.includes('sweet spot') || lower.includes('sst')) return 3;
  if (lower.includes('z1') || lower.includes('recovery')) return 1;
  if (lower.includes('z2') || lower.includes('endurance')) return 2;
  if (lower.includes('z3') || lower.includes('tempo')) return 3;
  if (lower.includes('z4') || lower.includes('threshold') || lower.includes('ftp')) return 4;
  if (lower.includes('z5') || lower.includes('vo2')) return 5;
  if (lower.includes('z6') || lower.includes('anaerobic') || lower.includes('sprint')) return 6;
  return 2;
}

function zoneToWatts(zone: number, ftpWatts: number): PowerTarget {
  const band = ZONE_PCT_BANDS[zone] ?? ZONE_PCT_BANDS[2];
  return {
    zone,
    lowWatts: Math.round(ftpWatts * band.lowPct),
    highWatts: Math.round(ftpWatts * band.highPct),
  };
}

function inferZoneFromWatts(avgWatts: number, ftpWatts: number): number {
  const ratio = avgWatts / Math.max(100, ftpWatts);
  if (ratio <= 0.56) return 1;
  if (ratio <= 0.75) return 2;
  if (ratio <= 0.9) return 3;
  if (ratio <= 1.05) return 4;
  if (ratio <= 1.2) return 5;
  return 6;
}

/**
 * Parses duration expressions into seconds:
 * "3h", "2h30", "2h 30m", "15min", "20'", "2m", "30s", "3m15s".
 */
export function parseDurationSeconds(text: string): number | null {
  const normalized = text
    .replace(/–|—/g, '-')
    .replace(/(\d+)\s*'/g, '$1m')
    .replace(/(\d+)\s*"/g, '$1s')
    .toLowerCase();

  const hmMatch = normalized.match(
    /\b(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?\b/
  );
  if (hmMatch) {
    const hours = Number(hmMatch[1]);
    const mins = hmMatch[2] ? Number(hmMatch[2]) : 0;
    const total = Math.round(hours * 3600 + mins * 60);
    if (total > 0) return total;
  }

  const msMatch = normalized.match(
    /\b(\d+)\s*m(?:in(?:ute)?s?)?\s+(\d+)\s*s(?:ec(?:ond)?s?)?\b/
  );
  if (msMatch) {
    const total = Number(msMatch[1]) * 60 + Number(msMatch[2]);
    if (total > 0) return total;
  }

  const minRangeMatch = normalized.match(
    /\b(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?\b/
  );
  if (minRangeMatch) {
    const avg = (Number(minRangeMatch[1]) + Number(minRangeMatch[2])) / 2;
    const total = Math.round(avg * 60);
    if (total > 0) return total;
  }

  const minMatch = normalized.match(/\b(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?\b/);
  if (minMatch) {
    const total = Math.round(Number(minMatch[1]) * 60);
    if (total > 0) return total;
  }

  const secRangeMatch = normalized.match(
    /\b(\d+)\s*-\s*(\d+)\s*s(?:ec(?:ond)?s?)?\b/
  );
  if (secRangeMatch) {
    const total = Math.round(
      (Number(secRangeMatch[1]) + Number(secRangeMatch[2])) / 2
    );
    if (total > 0) return total;
  }

  const secMatch = normalized.match(/\b(\d+)\s*s(?:ec(?:ond)?s?)?\b/);
  if (secMatch) {
    const total = Math.round(Number(secMatch[1]));
    if (total > 0) return total;
  }

  return null;
}

/**
 * Resolves absolute Watt power targets from text (watts, % FTP, or zone cues).
 */
export function parsePowerWatts(
  text: string,
  fallbackZone: string,
  ftpWatts: number
): PowerTarget {
  const normalized = text.replace(/–|—/g, '-');

  // 1. Absolute watt range: "320-340W" or "320-340 W"
  const wattRangeMatch = normalized.match(/(\d{2,4})\s*-\s*(\d{2,4})\s*w\b/i);
  if (wattRangeMatch) {
    const low = Math.round(Number(wattRangeMatch[1]));
    const high = Math.round(Number(wattRangeMatch[2]));
    const minW = Math.min(low, high);
    const maxW = Math.max(low, high);
    return {
      lowWatts: minW,
      highWatts: maxW,
      zone: inferZoneFromWatts((minW + maxW) / 2, ftpWatts),
    };
  }

  // 2. Less-than watts: "<200W"
  const ltWattMatch = normalized.match(/<\s*(\d{2,4})\s*w\b/i);
  if (ltWattMatch) {
    const high = Math.round(Number(ltWattMatch[1]));
    const low = Math.max(100, Math.round(high * 0.78));
    return {
      lowWatts: low,
      highWatts: high,
      zone: inferZoneFromWatts((low + high) / 2, ftpWatts),
    };
  }

  // 3. Single watts: "320W" or "500 W"
  const singleWattMatch = normalized.match(/(\d{2,4})\s*w\b/i);
  if (singleWattMatch) {
    const w = Math.round(Number(singleWattMatch[1]));
    return {
      lowWatts: w,
      highWatts: w,
      zone: inferZoneFromWatts(w, ftpWatts),
    };
  }

  // 4. Legacy % FTP ranges if present
  const pctRangeMatch = normalized.match(/(\d{2,3})\s*-\s*(\d{2,3})\s*%/);
  if (pctRangeMatch) {
    const low = Math.round((Number(pctRangeMatch[1]) / 100) * ftpWatts);
    const high = Math.round((Number(pctRangeMatch[2]) / 100) * ftpWatts);
    return {
      lowWatts: Math.min(low, high),
      highWatts: Math.max(low, high),
      zone: inferZoneFromWatts((low + high) / 2, ftpWatts),
    };
  }

  const singlePctMatch = normalized.match(/(\d{2,3})\s*%/);
  if (singlePctMatch) {
    const w = Math.round((Number(singlePctMatch[1]) / 100) * ftpWatts);
    return {
      lowWatts: w,
      highWatts: w,
      zone: inferZoneFromWatts(w, ftpWatts),
    };
  }

  // 5. Zone references ("Z1", "Z2", "Z4", "maximum")
  const zoneMatch = normalized.match(/\b(?:z|zone\s*)([1-6])\b/i);
  if (zoneMatch) {
    return zoneToWatts(Number(zoneMatch[1]), ftpWatts);
  }

  const lower = normalized.toLowerCase();
  if (/\b(max|maximum|all[\s-]?out|full gas|sprint)\b/.test(lower)) {
    return zoneToWatts(5, ftpWatts);
  }
  if (/\b(easy|recovery|rest|rbi|off|spin)\b/.test(lower)) {
    return zoneToWatts(1, ftpWatts);
  }
  if (/\b(endurance|z2|steady|base|warmup|warm-up|cooldown|cool-down)\b/.test(lower)) {
    return zoneToWatts(2, ftpWatts);
  }
  if (/\b(sweet spot|sst)\b/.test(lower)) {
    return {
      zone: 3,
      lowWatts: Math.round(ftpWatts * 0.88),
      highWatts: Math.round(ftpWatts * 0.94),
    };
  }

  return zoneToWatts(getZoneNumberFromName(fallbackZone), ftpWatts);
}

function inferIntensity(text: string, fallback: StepIntensity): StepIntensity {
  const lower = text.toLowerCase();
  if (/\b(warmup|warm-up|warm up|wu)\b/.test(lower)) return 'warmup';
  if (/\b(cooldown|cool-down|cool down|cd)\b/.test(lower)) return 'cooldown';
  if (/\b(recovery|rest|rbi|easy|off)\b/.test(lower)) return 'recovery';
  return fallback;
}

function getRepeatDurationSeconds(item: FitPlanItem): number {
  if (item.type === 'step') return item.durationSeconds;
  const inner = item.items.reduce((s, c) => s + getRepeatDurationSeconds(c), 0);
  return inner * item.repeatCount;
}

/**
 * Parses natural coach-style single-line descriptions like:
 * - "3h with 2x20' 320-340W, 15min rest"
 * - "2 sets of 3x2min at 500-520W with 3min rest"
 * - "2h30 endurance ride with 1x8min uphill maximum"
 */
function parseCoachStyleSentence(
  text: string,
  workout: Workout,
  ftpWatts: number
): FitPlanItem[] | null {
  const cleaned = text.replace(/–|—/g, '-').trim();

  // Check for "with <main interval>" or "sets of <reps>" patterns
  // Pattern A: "N sets of RxD at W [with R rest]"
  const setsOfMatch = cleaned.match(
    /(\d+)\s*sets?\s+of\s+(\d+)\s*[x×]\s*([^,]+?)(?:\s+(?:with|,)\s+([^,;]+?)\s*(?:rest|rec|recovery|easy))?$/i
  );
  if (setsOfMatch) {
    const sets = Number(setsOfMatch[1]);
    const reps = Number(setsOfMatch[2]);
    const workChunk = setsOfMatch[3];
    const recChunk = setsOfMatch[4] ?? '';

    const workSec = parseDurationSeconds(workChunk);
    if (sets > 0 && reps > 0 && workSec && workSec > 0) {
      const workPower = parsePowerWatts(workChunk, workout.zone, ftpWatts);
      const recSec = parseDurationSeconds(recChunk) ?? Math.min(300, workSec);
      const recPower = parsePowerWatts(recChunk || 'easy', 'Recovery', ftpWatts);

      const repBlock: FitRepeatBlock = {
        type: 'repeat',
        repeatCount: reps,
        items: [
          {
            type: 'step',
            name: 'Work',
            durationSeconds: workSec,
            intensity: 'active',
            power: workPower,
          },
          {
            type: 'step',
            name: 'Recovery',
            durationSeconds: recSec,
            intensity: 'recovery',
            power: recPower,
          },
        ],
      };

      const mainItems: FitPlanItem[] =
        sets > 1
          ? [
              {
                type: 'repeat',
                repeatCount: sets,
                items: [
                  repBlock,
                  {
                    type: 'step',
                    name: 'Set Rest',
                    durationSeconds: 600,
                    intensity: 'recovery',
                    power: zoneToWatts(2, ftpWatts),
                  },
                ],
              },
            ]
          : [repBlock];

      return wrapWithEnduranceFill(mainItems, workout, ftpWatts);
    }
  }

  // Pattern B: "... with/do NxD ... [, R rest/recovery/easy]"
  const withRepeatMatch = cleaned.match(
    /\b(?:with|do)\s+(\d+)\s*[x×]\s*([^,;]+?)(?:(?:[,;]|\s+with)\s+(.+))?$/i
  );
  if (withRepeatMatch) {
    const reps = Number(withRepeatMatch[1]);
    const workChunk = withRepeatMatch[2];
    const trailing = withRepeatMatch[3] ?? '';
    const workSec = parseDurationSeconds(workChunk);

    if (reps > 0 && workSec && workSec > 0) {
      const workPower = parsePowerWatts(workChunk, workout.zone, ftpWatts);
      const recSec = parseDurationSeconds(trailing);
      const steps: FitStep[] = [
        {
          type: 'step',
          name: 'Work',
          durationSeconds: workSec,
          intensity: 'active',
          power: workPower,
        },
      ];

      if (reps > 1) {
        steps.push({
          type: 'step',
          name: 'Recovery',
          durationSeconds: recSec ?? Math.min(300, Math.round(workSec * 0.5)),
          intensity: 'recovery',
          power: parsePowerWatts(trailing || 'easy', 'Recovery', ftpWatts),
        });
      }

      const mainItems: FitPlanItem[] =
        reps === 1
          ? steps
          : [{ type: 'repeat', repeatCount: reps, items: steps }];

      const isLateKjEffort = /\bkj\b/i.test(cleaned);
      return wrapWithEnduranceFill(mainItems, workout, ftpWatts, isLateKjEffort);
    }
  }

  return null;
}

/**
 * Pads a main interval set with Z2 warmup/endurance and cooldown to match workout.duration_minutes.
 */
function wrapWithEnduranceFill(
  mainItems: FitPlanItem[],
  workout: Workout,
  ftpWatts: number,
  lateSessionPlacement = false
): FitPlanItem[] {
  const totalSec = Math.max(0, Math.round((workout.duration_minutes || 0) * 60));
  const mainSec = mainItems.reduce((s, i) => s + getRepeatDurationSeconds(i), 0);
  const remaining = totalSec - mainSec;

  if (remaining < 10 * 60) {
    return mainItems;
  }

  const warmupRatio = lateSessionPlacement ? 0.8 : 0.45;
  const warmupSec = Math.round(remaining * warmupRatio);
  const cooldownSec = remaining - warmupSec;

  return [
    {
      type: 'step',
      name: 'Endurance / Warmup',
      durationSeconds: warmupSec,
      intensity: 'warmup',
      power: zoneToWatts(2, ftpWatts),
    },
    ...mainItems,
    {
      type: 'step',
      name: 'Endurance / Cooldown',
      durationSeconds: cooldownSec,
      intensity: 'cooldown',
      power: zoneToWatts(2, ftpWatts),
    },
  ];
}

function parseLine(
  rawLine: string,
  fallbackZone: string,
  ftpWatts: number
): FitPlanItem[] {
  const line = rawLine.trim().replace(/^[•\-*]\s*/, '');
  if (!line) return [];

  const lower = line.toLowerCase();

  // Warmup / Cooldown
  if (/\b(warmup|warm-up|warm up|cooldown|cool-down|cool down)\b/i.test(lower)) {
    const idx = line.search(/\b(with|including)\b/i);
    const clean = idx > 0 ? line.slice(0, idx).trim() : line;
    const duration = parseDurationSeconds(clean) ?? parseDurationSeconds(line);
    if (duration && duration > 0) {
      const intensity: StepIntensity = /\b(cooldown|cool-down|cool down)\b/i.test(lower)
        ? 'cooldown'
        : 'warmup';
      return [
        {
          type: 'step',
          name: intensity === 'cooldown' ? 'Cooldown' : 'Warmup',
          durationSeconds: duration,
          intensity,
          power: parsePowerWatts(
            clean,
            intensity === 'warmup' ? 'Z2' : 'Recovery',
            ftpWatts
          ),
        },
      ];
    }
  }

  // Nested sets: "3x13x(30s @ 430-470W / 15s @ 185W) 4m @ 200W"
  const nestedMatch = line.match(
    /^(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*\(([^)]+)\)(.*)$/i
  );
  if (nestedMatch) {
    const sets = Number(nestedMatch[1]);
    const reps = Number(nestedMatch[2]);
    const innerBody = nestedMatch[3];
    const trailing = nestedMatch[4] ?? '';
    const innerParts = innerBody.split(/\s*(?:\/|\+|into)\s*/i);
    const repSteps: FitStep[] = [];

    innerParts.forEach((part, idx) => {
      const sec = parseDurationSeconds(part);
      if (sec && sec > 0) {
        const intensity: StepIntensity = idx === 0 ? 'active' : 'recovery';
        repSteps.push({
          type: 'step',
          name: intensity === 'active' ? 'Work' : 'Recovery',
          durationSeconds: sec,
          intensity,
          power: parsePowerWatts(
            part,
            idx === 0 ? fallbackZone : 'Recovery',
            ftpWatts
          ),
        });
      }
    });

    if (sets > 0 && reps > 0 && repSteps.length > 0) {
      const innerRepeat: FitRepeatBlock = {
        type: 'repeat',
        repeatCount: reps,
        items: repSteps,
      };
      const setItems: FitPlanItem[] = [innerRepeat];
      const betweenSec = parseDurationSeconds(trailing);
      if (betweenSec && betweenSec > 0) {
        setItems.push({
          type: 'step',
          name: 'Set Recovery',
          durationSeconds: betweenSec,
          intensity: 'recovery',
          power: parsePowerWatts(trailing, 'Recovery', ftpWatts),
        });
      }
      return sets === 1
        ? setItems
        : [{ type: 'repeat', repeatCount: sets, items: setItems }];
    }
  }

  // Standard repeat: "2x20' 320-340W (15m rest)"
  const repeatMatch = line.match(/^(\d+)\s*[x×]\s*(.+)$/i);
  if (repeatMatch) {
    const repeatCount = Number(repeatMatch[1]);
    const body = repeatMatch[2].trim();
    if (repeatCount > 0) {
      let mainText = body;
      let recoveryText: string | null = null;

      const parenMatches = [...body.matchAll(/\(([^)]+)\)/g)];
      for (let i = parenMatches.length - 1; i >= 0; i--) {
        const candidate = parenMatches[i][1];
        if (parseDurationSeconds(candidate)) {
          recoveryText = candidate;
          const idx = parenMatches[i].index ?? body.length;
          mainText = (
            body.slice(0, idx) + body.slice(idx + parenMatches[i][0].length)
          ).trim();
          break;
        }
      }

      if (!recoveryText && /,/.test(mainText)) {
        const [workPart, recPart] = mainText.split(/,/, 2);
        if (parseDurationSeconds(workPart) && parseDurationSeconds(recPart)) {
          mainText = workPart.trim();
          recoveryText = recPart.trim();
        }
      }

      if (!recoveryText && /\s\/\s/.test(mainText)) {
        const [workPart, recPart] = mainText.split(/\s+\/\s+/, 2);
        if (parseDurationSeconds(workPart) && parseDurationSeconds(recPart)) {
          mainText = workPart.trim();
          recoveryText = recPart.trim();
        }
      }

      const workSec = parseDurationSeconds(mainText);
      const stepList: FitStep[] = [];
      if (workSec && workSec > 0) {
        stepList.push({
          type: 'step',
          name: 'Work',
          durationSeconds: workSec,
          intensity: 'active',
          power: parsePowerWatts(mainText, fallbackZone, ftpWatts),
        });
      }
      if (recoveryText) {
        const recSec = parseDurationSeconds(recoveryText);
        if (recSec && recSec > 0) {
          stepList.push({
            type: 'step',
            name: 'Recovery',
            durationSeconds: recSec,
            intensity: 'recovery',
            power: parsePowerWatts(recoveryText, 'Recovery', ftpWatts),
          });
        }
      }

      if (stepList.length > 0) {
        return repeatCount === 1
          ? stepList
          : [{ type: 'repeat', repeatCount, items: stepList }];
      }
    }
  }

  // Single steady step
  const singleSec = parseDurationSeconds(line);
  if (singleSec && singleSec > 0) {
    const intensity = inferIntensity(line, 'active');
    return [
      {
        type: 'step',
        name:
          intensity === 'warmup'
            ? 'Warmup'
            : intensity === 'cooldown'
              ? 'Cooldown'
              : intensity === 'recovery'
                ? 'Recovery'
                : 'Ride',
        durationSeconds: singleSec,
        intensity,
        power: parsePowerWatts(line, fallbackZone, ftpWatts),
      },
    ];
  }

  return [];
}

/**
 * Converts a Workout into structured FIT steps & repeat blocks using absolute Watts.
 */
export function parseWorkoutToFitPlan(
  workout: Workout,
  ftpWatts = 365
): FitPlanItem[] {
  const rawText = (workout.intervals ?? '').trim();

  if (rawText.length > 0) {
    const lines = rawText
      .split(/\r?\n|;/)
      .map((l) => l.trim())
      .filter(Boolean);

    // Try single-line coach-style sentence parsing first (including single-line kJ durability prescriptions with semicolons)
    if (lines.length === 1 || (!rawText.includes('\n') && /\bkj\b/i.test(rawText))) {
      const coachTarget = lines.length === 1 ? lines[0] : rawText;
      const coachItems = parseCoachStyleSentence(coachTarget, workout, ftpWatts);
      if (coachItems && coachItems.length > 0) {
        return coachItems;
      }
    }

    const items: FitPlanItem[] = [];
    for (const line of lines) {
      items.push(...parseLine(line, workout.zone, ftpWatts));
    }

    if (items.length > 0) {
      const parsedDuration = items.reduce(
        (s, item) => s + getRepeatDurationSeconds(item),
        0
      );
      const targetDuration = (workout.duration_minutes || 0) * 60;
      // If parsed intervals represent only the main set (much shorter than total ride), pad with Z2
      if (targetDuration > 0 && parsedDuration < targetDuration * 0.65) {
        return wrapWithEnduranceFill(items, workout, ftpWatts);
      }
      return items;
    }
  }

  // Fallback synthesis from duration_minutes and zone
  const totalSeconds = Math.max(
    60,
    Math.round((workout.duration_minutes || 60) * 60)
  );
  const zoneNum = getZoneNumberFromName(workout.zone);

  if (zoneNum <= 2 || totalSeconds < 30 * 60) {
    return [
      {
        type: 'step',
        name: workout.title.slice(0, 24) || 'Endurance',
        durationSeconds: totalSeconds,
        intensity: 'active',
        power: zoneToWatts(zoneNum, ftpWatts),
      },
    ];
  }

  const warmupSec = Math.min(15 * 60, Math.round(totalSeconds * 0.2));
  const cooldownSec = Math.min(10 * 60, Math.round(totalSeconds * 0.15));
  const mainSec = Math.max(60, totalSeconds - warmupSec - cooldownSec);

  return [
    {
      type: 'step',
      name: 'Warmup',
      durationSeconds: warmupSec,
      intensity: 'warmup',
      power: zoneToWatts(2, ftpWatts),
    },
    {
      type: 'step',
      name: 'Main Set',
      durationSeconds: mainSec,
      intensity: 'active',
      power: zoneToWatts(zoneNum, ftpWatts),
    },
    {
      type: 'step',
      name: 'Cooldown',
      durationSeconds: cooldownSec,
      intensity: 'cooldown',
      power: zoneToWatts(1, ftpWatts),
    },
  ];
}

/**
 * Expands FitPlanItem repeats into a flat timeline of power blocks for the mini preview chart.
 */
export function buildPowerPreviewBlocks(
  workout: Workout,
  ftpWatts = 365
): PreviewBlock[] {
  if (!isExportableWorkout(workout)) return [];

  const plan = parseWorkoutToFitPlan(workout, ftpWatts);
  const blocks: PreviewBlock[] = [];
  let cursor = 0;

  function expand(items: FitPlanItem[]) {
    for (const item of items) {
      if (item.type === 'step') {
        const avgWatts = Math.round(
          (item.power.lowWatts + item.power.highWatts) / 2
        );
        blocks.push({
          startSec: cursor,
          durationSec: item.durationSeconds,
          watts: avgWatts,
          lowWatts: item.power.lowWatts,
          highWatts: item.power.highWatts,
          intensity: item.intensity,
          label: item.name,
        });
        cursor += item.durationSeconds;
      } else {
        for (let r = 0; r < item.repeatCount; r++) {
          expand(item.items);
        }
      }
    }
  }

  expand(plan);
  return blocks;
}

export interface WeeklyZoneSplit {
  lowPct: number;
  moderatePct: number;
  highPct: number;
  totalMinutes: number;
}

/**
 * Computes the 3-zone pyramidal distribution (Z1-Z2 | Z3-Z4 | Z5+) from a week's workouts.
 */
export function computeWeeklyZoneSplit(
  workouts: Workout[],
  ftpWatts = 365
): WeeklyZoneSplit | null {
  let lowSec = 0;
  let modSec = 0;
  let highSec = 0;

  for (const w of workouts) {
    if (!isExportableWorkout(w)) continue;
    const blocks = buildPowerPreviewBlocks(w, ftpWatts);
    for (const b of blocks) {
      if (b.watts <= ftpWatts * 0.75) {
        lowSec += b.durationSec;
      } else if (b.watts <= ftpWatts * 1.05) {
        modSec += b.durationSec;
      } else {
        highSec += b.durationSec;
      }
    }
  }

  const totalSec = lowSec + modSec + highSec;
  if (totalSec <= 0) return null;

  const lowPct = Math.round((lowSec / totalSec) * 100);
  const moderatePct = Math.round((modSec / totalSec) * 100);
  const highPct = Math.max(0, 100 - lowPct - moderatePct);

  return {
    lowPct,
    moderatePct,
    highPct,
    totalMinutes: Math.round(totalSec / 60),
  };
}
