import {
  Encoder,
  Profile,
  type FileIdMesg,
  type WorkoutMesg,
  type WorkoutStepMesg,
} from '@garmin/fitsdk';
import type { Workout } from '@/types/training';
import {
  parseWorkoutToFitPlan,
  type FitPlanItem,
  type FitStep,
} from './intervalParser';

export interface EncodeWorkoutOptions {
  /** Athlete FTP in watts used to resolve any zone-based warmup/recovery steps into absolute watts. */
  ftpWatts?: number;
}

function sanitizeFitString(input: string, maxLength = 48): string {
  const ascii = input
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
  return (ascii || 'Workout').slice(0, maxLength);
}

function flattenPlanItems(items: FitPlanItem[], out: WorkoutStepMesg[]): void {
  for (const item of items) {
    if (item.type === 'step') {
      const step: FitStep = item;
      out.push({
        messageIndex: out.length,
        wktStepName: sanitizeFitString(step.name, 24),
        durationType: 'time',
        durationValue: Math.max(1000, Math.round(step.durationSeconds * 1000)),
        targetType: 'power',
        targetValue: 0,
        // FIT absolute watts are offset by +1000
        customTargetValueLow: Math.round(1000 + step.power.lowWatts),
        customTargetValueHigh: Math.round(1000 + step.power.highWatts),
        intensity: step.intensity,
      });
    } else {
      const blockStartIndex = out.length;
      flattenPlanItems(item.items, out);
      if (out.length > blockStartIndex) {
        out.push({
          messageIndex: out.length,
          durationType: 'repeatUntilStepsCmplt',
          durationValue: blockStartIndex,
          targetType: 'open',
          targetValue: Math.max(1, Math.round(item.repeatCount)),
        });
      }
    }
  }
}

/**
 * Encodes a Workout into a valid binary FIT Workout file (Uint8Array) using absolute Watts.
 */
export function encodeWorkoutToFit(
  workout: Workout,
  options: EncodeWorkoutOptions = {}
): Uint8Array {
  const ftpWatts = options.ftpWatts ?? 365;
  const plan = parseWorkoutToFitPlan(workout, ftpWatts);
  const steps: WorkoutStepMesg[] = [];
  flattenPlanItems(plan, steps);

  if (steps.length === 0) {
    steps.push({
      messageIndex: 0,
      wktStepName: 'Ride',
      durationType: 'open',
      durationValue: 0,
      targetType: 'open',
      targetValue: 0,
      intensity: 'active',
    });
  }

  const encoder = new Encoder();

  const fileIdMesg: FileIdMesg = {
    type: 'workout',
    manufacturer: 'development',
    product: 1,
    serialNumber: 1,
    timeCreated: new Date(),
  };
  encoder.onMesg(Profile.MesgNum.FILE_ID, fileIdMesg);

  const workoutMesg: WorkoutMesg = {
    wktName: sanitizeFitString(workout.title, 48),
    sport: 'cycling',
    subSport: 'generic',
    numValidSteps: steps.length,
  };
  encoder.onMesg(Profile.MesgNum.WORKOUT, workoutMesg);

  for (const step of steps) {
    encoder.onMesg(Profile.MesgNum.WORKOUT_STEP, step);
  }

  return encoder.close();
}
