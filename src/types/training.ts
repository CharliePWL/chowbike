export type TrainingZone =
  | 'Recovery'
  | 'Z2'
  | 'Tempo'
  | 'Threshold'
  | 'VO2max'
  | 'Anaerobic'
  | 'Rest';

export interface ZoneMeta {
  value: TrainingZone;
  label: string;
  shortLabel: string;
  badgeClass: string;
  dotClass: string;
}

export const TRAINING_ZONES: ZoneMeta[] = [
  {
    value: 'Recovery',
    label: 'Z1 · Recovery',
    shortLabel: 'Z1 Recovery',
    badgeClass: 'bg-[#F7F7F5] text-[#6B6B68] border-[#D4D4CE]',
    dotClass: 'bg-[#A8BAC9]',
  },
  {
    value: 'Z2',
    label: 'Z2 · Endurance',
    shortLabel: 'Z2 Endurance',
    badgeClass: 'bg-[#EFEFEC] text-[#181818] border-[#D4D4CE]',
    dotClass: 'bg-[#6F8CA6]',
  },
  {
    value: 'Tempo',
    label: 'Z3 · Tempo',
    shortLabel: 'Z3 Tempo',
    badgeClass: 'bg-[#EFEFEC] text-[#181818] border-[#D4D4CE]',
    dotClass: 'bg-[#4E708F]',
  },
  {
    value: 'Threshold',
    label: 'Z4 · Threshold',
    shortLabel: 'Z4 Threshold',
    badgeClass: 'bg-[#DCE5EE] text-[#181818] border-[#3B5B7A]',
    dotClass: 'bg-[#3B5B7A]',
  },
  {
    value: 'VO2max',
    label: 'Z5 · VO2max',
    shortLabel: 'Z5 VO2max',
    badgeClass: 'bg-[#3B5B7A] text-[#F7F7F5] border-[#3B5B7A]',
    dotClass: 'bg-[#29435C]',
  },
  {
    value: 'Anaerobic',
    label: 'Z6 · Anaerobic',
    shortLabel: 'Z6 Anaerobic',
    badgeClass: 'bg-[#181818] text-[#F7F7F5] border-[#2A2A28]',
    dotClass: 'bg-[#181818]',
  },
  {
    value: 'Rest',
    label: 'Rest Day',
    shortLabel: 'Rest',
    badgeClass: 'bg-[#F7F7F5] text-[#6B6B68] border-[#D4D4CE]',
    dotClass: 'bg-[#D4D4CE]',
  },
];

export function getZoneMeta(zone: string): ZoneMeta {
  const normalized = zone.trim().toLowerCase();
  const match = TRAINING_ZONES.find(
    (item) =>
      item.value.toLowerCase() === normalized ||
      normalized.includes(item.value.toLowerCase())
  );
  return (
    match ?? {
      value: 'Z2',
      label: zone,
      shortLabel: zone,
      badgeClass: 'bg-[#EFEFEC] text-[#181818] border-[#D4D4CE]',
      dotClass: 'bg-[#6B6B68]',
    }
  );
}

export const DAYS_OF_WEEK = [
  { day: 1, short: 'Mon', full: 'Monday' },
  { day: 2, short: 'Tue', full: 'Tuesday' },
  { day: 3, short: 'Wed', full: 'Wednesday' },
  { day: 4, short: 'Thu', full: 'Thursday' },
  { day: 5, short: 'Fri', full: 'Friday' },
  { day: 6, short: 'Sat', full: 'Saturday' },
  { day: 7, short: 'Sun', full: 'Sunday' },
] as const;

export interface TrainingWeek {
  id: string;
  week_start: string;
  title: string;
  focus: string | null;
  notes: string | null;
  block_id?: string | null;
  block_name?: string | null;
  block_week?: number | null;
  block_total_weeks?: number | null;
  block_phase?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EstimatedPowerCurve {
  watts_5s: number;
  watts_1m: number;
  watts_5m: number;
  watts_20m: number;
  watts_60m: number;
  updated_at?: string;
  notes?: string;
}

export interface AthleteProfile {
  id?: string;
  user_id?: string;
  age: number | null;
  weight_kg: number | null;
  current_power_data: string | null;
  ai_estimated_ftp: number;
  ftp_rationale: string | null;
  ftp_updated_at: string | null;
  estimated_power_curve: EstimatedPowerCurve | null;
}

export interface BlockPhaseStep {
  week: number;
  phase: string;
  focus: string;
}

export interface TrainingBlock {
  id: string;
  user_id: string;
  name: string;
  goal: string | null;
  start_week: string;
  total_weeks: number;
  current_week: number;
  phase_outline: BlockPhaseStep[];
  default_hours: number;
  unavailable_days: number[];
  status: 'active' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface Workout {
  id: string;
  week_id: string;
  day_of_week: number;
  sort_order: number;
  title: string;
  duration_minutes: number;
  zone: string;
  intervals: string | null;
  completed: boolean;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type EventPriority = 'A' | 'B' | 'C';

export interface EventPriorityMeta {
  value: EventPriority;
  label: string;
  shortLabel: string;
  description: string;
  badgeClass: string;
  dotClass: string;
}

export const EVENT_PRIORITIES: EventPriorityMeta[] = [
  {
    value: 'A',
    label: 'A-Race · Peak Goal',
    shortLabel: 'A-RACE',
    description: 'Main season target — full taper & peak',
    badgeClass: 'bg-[#181818] text-[#F7F7F5] border-[#2A2A28]',
    dotClass: 'bg-[#181818]',
  },
  {
    value: 'B',
    label: 'B-Race · Important Prep',
    shortLabel: 'B-RACE',
    description: 'Key buildup race — mini-taper / race sharpen',
    badgeClass: 'bg-[#3B5B7A] text-[#F7F7F5] border-[#3B5B7A]',
    dotClass: 'bg-[#3B5B7A]',
  },
  {
    value: 'C',
    label: 'C-Race · Training / Low',
    shortLabel: 'C-RACE',
    description: 'Train through — low priority / experience',
    badgeClass: 'bg-[#EFEFEC] text-[#181818] border-[#D4D4CE]',
    dotClass: 'bg-[#8E8E89]',
  },
];

export function getEventPriorityMeta(priority: string): EventPriorityMeta {
  const normalized = priority.trim().toUpperCase();
  return (
    EVENT_PRIORITIES.find((p) => p.value === normalized) ?? EVENT_PRIORITIES[2]
  );
}

export const EVENT_TYPES = [
  'Road Race',
  'Criterium',
  'Kermesse',
  'Time Trial',
  'Gravel',
  'Gran Fondo',
  'Stage Race',
  'Other',
] as const;

export interface TargetEvent {
  id: string;
  user_id: string;
  name: string;
  event_date: string;
  priority: EventPriority;
  event_type: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
