import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildLeaderboardHistory, getMonthKey } from '@/lib/monthlyStats';

// Types
// Squadrons may use their own office or flight designators. Keep the known
// labels for UI defaults while preserving roster-provided values verbatim.
export type Flight = string;
export type AccountType = 'fitflight_creator' | 'ufpm' | 'demo' | 'squadron_leadership' | 'group_personnel' | 'pfl' | 'ptl' | 'standard';
export type Squadron = 'Knights' | 'Hawks' | 'Tigers' | 'Krakens' | 'Warriors';
export type WorkoutType =
  | 'Running'
  | 'Walking'
  | 'Hiking'
  | 'Rucking'
  | 'Cycling'
  | 'Swimming'
  | 'Weightlifting'
  | 'Strength'
  | 'HIIT'
  | 'Sports'
  | 'Cardio'
  | 'Flexibility'
  | 'Climbing'
  | 'Surfing'
  | 'Diving'
  | 'Combatives'
  | 'Other';
export type WorkoutIntent =
  | 'Endurance'
  | 'Tempo'
  | 'Intervals'
  | 'Recovery'
  | 'Strength'
  | 'Hypertrophy'
  | 'Power'
  | 'Conditioning'
  | 'Skills'
  | 'Competition'
  | 'Other';
export type IntegrationService = 'apple_health' | 'strava' | 'garmin';
export type ScheduledPTScope = 'squadron' | 'flight' | 'personal';
export type ScheduledPTKind = 'pt' | 'pfra_mock' | 'pfra_diagnostic' | 'pfra_official';
export type PFRARecordType = 'self' | 'mock' | 'diagnostic' | 'official';
export type PFRAAccountabilityStatus = 'completed' | 'pending' | 'absent' | 'excused' | 'postponed';
export type AttendanceSource = 'manual' | 'workout' | 'strava' | 'pfra' | 'excused';
export type AppTheme = 'default' | 'dark' | 'pixel' | 'cyber' | 'space' | 'flowery';

export const GROUP_SQUADRON: Squadron = 'Knights';
export const CHILD_SQUADRONS: Squadron[] = ['Hawks', 'Tigers', 'Krakens', 'Warriors'];
export const SQUADRONS: Squadron[] = [GROUP_SQUADRON, ...CHILD_SQUADRONS];
export const DEFAULT_SQUADRON: Squadron = 'Hawks';
export const GROUP_PERSONNEL_FLIGHT: Flight = 'Group';
export const PCS_OUTPRO_FLIGHT: Flight = 'PCS/Outpro';
export const FLIGHTS: Flight[] = ['Apex', 'Bomber', 'Cryptid', 'Doom', 'Ewok', 'Foxhound', 'DO', 'ADF', 'DET', PCS_OUTPRO_FLIGHT];
export const ACTIVE_SQUADRON_FLIGHTS: Flight[] = FLIGHTS.filter((flight) => flight !== PCS_OUTPRO_FLIGHT) as Flight[];

export function isGroupSquadron(value: Squadron | string | null | undefined): value is Squadron {
  return value === GROUP_SQUADRON;
}

export function isSquadron(value: string): value is Squadron {
  return SQUADRONS.includes(value as Squadron);
}

export function normalizeSquadron(value?: string | null, fallback: Squadron = DEFAULT_SQUADRON): Squadron {
  return value && isSquadron(value) ? value : fallback;
}

export function getScopedSquadronLabel(squadron?: Squadron | string | null) {
  return isGroupSquadron(squadron) ? 'Group' : 'Squadron';
}

export function getSquadronDisplayName(squadron?: Squadron | string | null) {
  const normalized = normalizeSquadron(squadron, DEFAULT_SQUADRON);
  return isGroupSquadron(normalized) ? 'Knights Group' : normalized;
}

export function getGroupChildSquadrons(squadron?: Squadron | string | null): Squadron[] {
  return isGroupSquadron(squadron) ? [...CHILD_SQUADRONS] : [];
}

export function getAccessibleSquadrons(squadron?: Squadron | string | null): Squadron[] {
  const normalized = normalizeSquadron(squadron, DEFAULT_SQUADRON);
  return isGroupSquadron(normalized) ? [normalized, ...CHILD_SQUADRONS] : [normalized];
}

export function squadronUsesFlights(squadron?: Squadron | string | null) {
  return !isGroupSquadron(squadron);
}
export const WORKOUT_TYPES: WorkoutType[] = [
  'Running',
  'Walking',
  'Hiking',
  'Rucking',
  'Cycling',
  'Swimming',
  'Weightlifting',
  'HIIT',
  'Sports',
  'Cardio',
  'Flexibility',
  'Climbing',
  'Surfing',
  'Diving',
  'Combatives',
  'Other',
];
export const CARDIO_WORKOUT_INTENTS: WorkoutIntent[] = ['Endurance', 'Tempo', 'Intervals', 'Recovery', 'Other'];
export const STRENGTH_WORKOUT_INTENTS: WorkoutIntent[] = ['Strength', 'Hypertrophy', 'Power', 'Recovery', 'Other'];
export const SESSION_WORKOUT_INTENTS: WorkoutIntent[] = ['Conditioning', 'Skills', 'Competition', 'Recovery', 'Other'];
export const GENERAL_WORKOUT_INTENTS: WorkoutIntent[] = ['Recovery', 'Other'];
export const WORKOUT_INTENT_OPTIONS_BY_TYPE: Record<WorkoutType, WorkoutIntent[]> = {
  Running: CARDIO_WORKOUT_INTENTS,
  Walking: CARDIO_WORKOUT_INTENTS,
  Hiking: CARDIO_WORKOUT_INTENTS,
  Rucking: CARDIO_WORKOUT_INTENTS,
  Cycling: CARDIO_WORKOUT_INTENTS,
  Swimming: CARDIO_WORKOUT_INTENTS,
  Weightlifting: STRENGTH_WORKOUT_INTENTS,
  Strength: STRENGTH_WORKOUT_INTENTS,
  HIIT: SESSION_WORKOUT_INTENTS,
  Sports: SESSION_WORKOUT_INTENTS,
  Cardio: CARDIO_WORKOUT_INTENTS,
  Flexibility: GENERAL_WORKOUT_INTENTS,
  Climbing: SESSION_WORKOUT_INTENTS,
  Surfing: CARDIO_WORKOUT_INTENTS,
  Diving: SESSION_WORKOUT_INTENTS,
  Combatives: SESSION_WORKOUT_INTENTS,
  Other: ['Other'],
};

export interface WorkoutSegment {
  id?: string;
  type: WorkoutType;
  subtype?: string;
  intent?: WorkoutIntent;
  duration: number;
  durationSeconds?: number;
  distance?: number;
  weight?: number;
  reps?: number;
  sets?: number;
  rounds?: number;
  elevationGain?: number;
  depth?: number;
  steps?: number;
  averageHeartRate?: number;
  caloriesBurned?: number;
  waveConditions?: string;
  pfraScore?: number;
  pfraRecordType?: PFRARecordType;
  cardioTest?: string;
  cardioTime?: string;
  cardioLaps?: number;
  additionalInfo?: string;
}
export const ENLISTED_RANKS = ['AB', 'Amn', 'A1C', 'SrA', 'SSgt', 'TSgt', 'MSgt', 'SMSgt', 'CMSgt'] as const;
export const OFFICER_RANKS = ['2nd Lt.', '1st Lt.', 'Capt.', 'Maj.', 'Lt. Col.', 'Col.'] as const;
export const ALL_RANKS = [...ENLISTED_RANKS, ...OFFICER_RANKS] as const;
export const RANK_GROUPS = [
  { label: 'Enlisted', ranks: [...ENLISTED_RANKS] },
  { label: 'Officer', ranks: [...OFFICER_RANKS] },
] as const;

const DISPLAY_RANK_MAP: Record<string, string> = {
  AB: 'AB',
  AMN: 'Amn',
  A1C: 'A1C',
  SRA: 'SrA',
  SSG: 'SSgt',
  SSGT: 'SSgt',
  TSG: 'TSgt',
  TSGT: 'TSgt',
  MSG: 'MSgt',
  MSGT: 'MSgt',
  SMS: 'SMSgt',
  SMSGT: 'SMSgt',
  CMS: 'CMSgt',
  CMSGT: 'CMSgt',
  '2DLT': '2nd Lt.',
  '2D LT': '2nd Lt.',
  '2NDLT': '2nd Lt.',
  '2ND LT': '2nd Lt.',
  '1LT': '1st Lt.',
  '1STLT': '1st Lt.',
  '1ST LT': '1st Lt.',
  CAPT: 'Capt.',
  CPT: 'Capt.',
  MAJ: 'Maj.',
  LTC: 'Lt. Col.',
  LTCOL: 'Lt. Col.',
  LTCOLEL: 'Lt. Col.',
  'LT COL': 'Lt. Col.',
  COL: 'Col.',
  'BRIG GEN': 'Brig. Gen.',
  BRIGGEN: 'Brig. Gen.',
  'MAJ GEN': 'Maj. Gen.',
  MAJGEN: 'Maj. Gen.',
  'LT GEN': 'Lt. Gen.',
  LTGEN: 'Lt. Gen.',
  GEN: 'Gen.',
};

// Shared Workout Submission (community workouts)
export interface SharedWorkout {
  id: string;
  name: string;
  type: WorkoutType;
  duration: number; // minutes
  intensity: number; // 1-10
  description: string;
  isMultiStep: boolean;
  steps: string[];
  createdBy: string; // member id
  createdAt: string; // ISO date
  editedBy?: string;
  editedAt?: string;
  squadron: Squadron;
  thumbsUp: string[]; // member ids who liked
  thumbsDown: string[]; // member ids who disliked
  favoritedBy: string[]; // member ids who favorited
  source?: 'user' | 'playbook';
  sourceLabel?: string;
  detailSections?: Array<{
    title: string;
    items: string[];
  }>;
  searchTerms?: string[];
}

export interface FitnessAssessment {
  id: string;
  date: string; // ISO date string
  overallScore: number;
  recordType?: PFRARecordType;
  batchId?: string;
  accountabilityStatus?: PFRAAccountabilityStatus;
  components: {
    cardio: { score: number; time?: string; laps?: number; test?: string; exempt?: boolean };
    pushups: { score: number; reps: number; test?: string; exempt?: boolean };
    situps: { score: number; reps: number; test?: string; time?: string; exempt?: boolean };
    waist?: { score: number; inches: number; exempt?: boolean };
  };
  isPrivate: boolean;
  loggedByMemberId?: string;
  loggedByName?: string;
}

export interface Workout {
  id: string;
  externalId?: string;
  sessionId?: string;
  date: string;
  type: WorkoutType;
  duration: number; // minutes
  durationSeconds?: number;
  distance?: number; // miles
  proofImageUris?: string[];
  segments?: WorkoutSegment[];
  metrics?: Omit<WorkoutSegment, 'id' | 'type' | 'duration' | 'durationSeconds' | 'distance'> & {
    distance?: number;
  };
  source: 'manual' | 'screenshot' | 'apple_health' | 'strava' | 'garmin' | 'attendance' | 'pfra';
  screenshotUri?: string;
  title?: string;
  isPrivate: boolean;
  attendanceMarkedBySubmission?: boolean;
}

export interface IntegrationConnection {
  connectedAt: string;
  lastSyncedAt?: string;
  externalId?: string;
  displayName?: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedDate?: string;
  category: 'leaderboard' | 'milestone' | 'streak' | 'fitness' | 'special';
  isHard: boolean;
}

export interface MonthlyPlacement {
  month: string; // YYYY-MM format
  position: 1 | 2 | 3;
}

export interface MonthlyLeaderboardEntry {
  month: string;
  position: number;
  score: number;
}

export interface ScheduledPTSession {
  id: string;
  date: string; // ISO date string
  time: string; // Military time format HH:MM
  description: string;
  location?: string;
  flights: Flight[];
  squadron: Squadron;
  createdBy: string;
  scope: ScheduledPTScope;
  kind: ScheduledPTKind;
}

export interface Member {
  id: string;
  rank: string;
  firstName: string;
  lastName: string;
  flight: Flight;
  squadron: Squadron;
  accountType: AccountType;
  email: string;
  profilePicture?: string; // URI to profile picture
  showWorkoutHistoryOnProfile?: boolean;
  showWorkoutUploadsOnProfile?: boolean;
  showPFRARecordsOnProfile?: boolean;
  exerciseMinutes: number;
  distanceRun: number;
  connectedApps: string[];
  fitnessAssessments: FitnessAssessment[];
  workouts: Workout[];
  achievements: string[]; // achievement IDs
  requiredPTSessionsPerWeek: number;
  isVerified: boolean;
  ptlPendingApproval: boolean;
  monthlyPlacements: MonthlyPlacement[]; // Track top 3 placements
  leaderboardHistory: MonthlyLeaderboardEntry[];
  trophyCount: number; // Number of times placed in top 3
  hasSeenTutorial?: boolean;
  mustChangePassword?: boolean;
  hasLoggedIntoApp?: boolean;
  showUpdateNotes?: boolean;
  appTheme?: AppTheme;
}

export interface PTSession {
  id: string;
  date: string;
  flight: Flight;
  squadron: Squadron;
  attendees: string[];
  attendeeSources?: Record<string, AttendanceSource>;
  createdBy: string;
}

export interface User {
  id: string;
  rank: string;
  firstName: string;
  lastName: string;
  flight: Flight;
  squadron: Squadron;
  accountType: AccountType;
  email: string;
  profilePicture?: string; // URI to profile picture
  showWorkoutHistoryOnProfile?: boolean;
  showWorkoutUploadsOnProfile?: boolean;
  showPFRARecordsOnProfile?: boolean;
  isVerified: boolean;
  ptlPendingApproval: boolean;
  fitnessAssessmentsPrivate: boolean;
  hasSeenTutorial?: boolean; // Whether user has completed the onboarding tutorial
  connectedIntegrations?: IntegrationService[]; // Connected fitness app integrations
  integrationConnections?: Partial<Record<IntegrationService, IntegrationConnection>>;
  mustChangePassword?: boolean;
  hasLoggedIntoApp?: boolean;
  keepAwakeEnabled?: boolean;
  appTheme?: AppTheme;
  showUpdateNotes?: boolean;
}

export const formatPersonName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());

// Helper to get display name
export const getDisplayName = (user: { rank: string; firstName: string; lastName: string }) => {
  return `${formatRankDisplay(user.rank)} ${formatPersonName(user.firstName)} ${formatPersonName(user.lastName)}`;
};

export const getShortDisplayName = (user: { rank: string; lastName: string }) => {
  return `${formatRankDisplay(user.rank)} ${formatPersonName(user.lastName)}`;
};

export const formatRankDisplay = (rank: string) => {
  const normalized = rank.trim().replace(/\./g, '').toUpperCase();
  return DISPLAY_RANK_MAP[normalized] ?? rank.trim();
};

export const formatFlightDisplay = (flight: string) => {
  const normalized = flight.trim();
  if (normalized === GROUP_PERSONNEL_FLIGHT) {
    return '';
  }
  return normalized.replace(/\s+flight$/i, '');
};

export const isPCSOutproFlight = (flight: Flight | string | null | undefined) =>
  flight?.trim().toLowerCase() === PCS_OUTPRO_FLIGHT.toLowerCase();

export const isGroupPersonnelFlight = (flight: Flight | string | null | undefined) =>
  flight?.trim().toLowerCase() === GROUP_PERSONNEL_FLIGHT.toLowerCase();

export const shouldIncludeFlightInSquadronRollups = (flight: Flight | string | null | undefined) =>
  !isPCSOutproFlight(flight);

export const normalizeAccountType = (accountType: AccountType | string | null | undefined): AccountType => {
  if (accountType === 'ptl') {
    return 'pfl';
  }
  if (
    accountType === 'fitflight_creator' ||
    accountType === 'ufpm' ||
    accountType === 'demo' ||
    accountType === 'squadron_leadership' ||
    accountType === 'group_personnel' ||
    accountType === 'pfl' ||
    accountType === 'standard'
  ) {
    return accountType;
  }
  return 'standard';
};

export const isPFLAccountType = (accountType: AccountType | string | null | undefined) =>
  normalizeAccountType(accountType) === 'pfl';

// Legacy helper kept for compatibility. Current policy is a flat 5 sessions/week.
export const calculateRequiredPTSessions = (score: number): number => {
  void score;
  return 5;
};

// All available achievements
export const ALL_ACHIEVEMENTS: Achievement[] = [
  // Leaderboard achievements
  { id: 'top_3_month', name: 'Podium Finish', description: 'Finish in the top 3 on the monthly squadron leaderboard.', icon: 'medal', category: 'leaderboard', isHard: true },

  // Milestone achievements
  { id: 'first_workout', name: 'First Rep', description: 'Log your first workout in FitFlight.', icon: 'footprints', category: 'milestone', isHard: false },
  { id: '10_workouts', name: 'Building Rhythm', description: 'Log 10 workouts.', icon: 'dumbbell', category: 'milestone', isHard: false },
  { id: '25_workouts', name: 'Momentum Builder', description: 'Log 25 workouts.', icon: 'target', category: 'milestone', isHard: false },
  { id: '50_workouts', name: 'Locked In', description: 'Log 50 workouts.', icon: 'trophy', category: 'milestone', isHard: true },
  { id: '100_workouts', name: 'Century Club', description: 'Log 100 workouts.', icon: 'star', category: 'milestone', isHard: true },
  { id: '200_workouts', name: 'Fitness Ironman', description: 'Log 200 workouts.', icon: 'gem', category: 'milestone', isHard: true },
  { id: '100_miles', name: 'Century Runner', description: 'Accumulate 100 miles.', icon: 'map-pin', category: 'milestone', isHard: false },
  { id: '500_miles', name: 'Long Haul', description: 'Accumulate 500 miles.', icon: 'mountain', category: 'milestone', isHard: true },
  { id: '1000_miles', name: 'Distance Dominator', description: 'Accumulate 1000 miles.', icon: 'rocket', category: 'milestone', isHard: true },
  { id: 'variety', name: 'Versatile Athlete', description: 'Log workouts in 5 different workout types.', icon: 'layers', category: 'milestone', isHard: false },

  // Streak achievements
  { id: 'week_streak', name: 'Weekly Warrior', description: 'Log 5 PT sessions in a single week.', icon: 'flame', category: 'streak', isHard: false },
  { id: 'month_streak', name: 'Monthly Machine', description: 'Complete your weekly PT requirement for four straight weeks.', icon: 'zap', category: 'streak', isHard: true },
  { id: 'three_month_streak', name: 'Quarterly Champion', description: 'Complete your weekly PT requirement for 12 straight weeks.', icon: 'shield', category: 'streak', isHard: true },
  { id: 'early_bird', name: 'Show Up Strong', description: 'Attend 10 PT sessions.', icon: 'sunrise', category: 'streak', isHard: false },
  { id: 'iron_will', name: 'Iron Will', description: 'Miss no required PT sessions for an entire month.', icon: 'shield', category: 'streak', isHard: true },

  // Fitness achievements
  { id: 'excellent_fa', name: 'Excellent PFRA', description: 'Score 90 or higher on a PFRA.', icon: 'shield-check', category: 'fitness', isHard: false },
  { id: 'perfect_fa', name: 'Perfect PFRA', description: 'Score a perfect 100 on a PFRA.', icon: 'sparkles', category: 'fitness', isHard: true },
  { id: 'shared_workout_creator', name: 'Squadron Builder', description: 'Create a workout in the Workouts tab for your squadron to use.', icon: 'dumbbell', category: 'special', isHard: false },

  // Special achievements
  { id: 'completionist', name: 'FitFlight Legend', description: 'Earn every other trophy in the app.', icon: 'award', category: 'special', isHard: true },
];

const REMOVED_TROPHY_IDS = new Set([
  'gold_month',
  'silver_month',
  'bronze_month',
  'improvement',
  'top_3_twice',
  'top_3_five',
]);

const TROPHY_IDS = new Set(ALL_ACHIEVEMENTS.map((achievement) => achievement.id));
const RECALCULATED_ACHIEVEMENT_IDS = new Set(['top_3_month', 'week_streak']);
const WEEKLY_WARRIOR_SESSION_TARGET = 5;

export const getEffectiveAchievementIds = (
  member: Pick<Member, 'achievements' | 'trophyCount' | 'monthlyPlacements'>
) => {
  return member.achievements.filter(
    (achievementId) => !REMOVED_TROPHY_IDS.has(achievementId) && TROPHY_IDS.has(achievementId)
  );
};

export const getClosedMonthPlacements = (
  member: Pick<Member, 'monthlyPlacements'> | { monthlyPlacements?: MonthlyPlacement[] },
  currentMonthKey = getMonthKey()
) => (member.monthlyPlacements ?? []).filter((placement) => placement.month < currentMonthKey);

const withCompletionist = (member: Pick<Member, 'achievements' | 'trophyCount' | 'monthlyPlacements'>) => {
  return Array.from(new Set(getEffectiveAchievementIds(member)));
};

const getWeekStartKey = (dateValue: string) => {
  const date = new Date(`${dateValue}T00:00:00`);
  const day = date.getDay();
  const diffToMonday = (day + 6) % 7;
  date.setDate(date.getDate() - diffToMonday);
  return date.toISOString().split('T')[0];
};

const countMaxConsecutiveWeeks = (weekKeys: string[]) => {
  if (weekKeys.length === 0) {
    return 0;
  }

  const orderedWeeks = [...new Set(weekKeys)].sort((left, right) => left.localeCompare(right));
  let longest = 1;
  let current = 1;

  for (let index = 1; index < orderedWeeks.length; index += 1) {
    const previous = new Date(`${orderedWeeks[index - 1]}T00:00:00`);
    const currentDate = new Date(`${orderedWeeks[index]}T00:00:00`);
    const diffDays = Math.round((currentDate.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 7) {
      current += 1;
    } else {
      current = 1;
    }

    longest = Math.max(longest, current);
  }

  return longest;
};

export const getAutomaticAchievementIds = (
  member: Pick<Member, 'id' | 'workouts' | 'distanceRun' | 'fitnessAssessments' | 'requiredPTSessionsPerWeek' | 'trophyCount' | 'monthlyPlacements' | 'flight' | 'squadron'>,
  ptSessions: PTSession[],
  sharedWorkouts: SharedWorkout[]
) => {
  const automaticAchievements = new Set<string>();
  const currentMonthKey = getMonthKey();
  const workoutCount = member.workouts.length;
  const uniqueWorkoutTypes = new Set(member.workouts.map((workout) => workout.type)).size;

  if (workoutCount >= 1) automaticAchievements.add('first_workout');
  if (workoutCount >= 10) automaticAchievements.add('10_workouts');
  if (workoutCount >= 25) automaticAchievements.add('25_workouts');
  if (workoutCount >= 50) automaticAchievements.add('50_workouts');
  if (workoutCount >= 100) automaticAchievements.add('100_workouts');
  if (workoutCount >= 200) automaticAchievements.add('200_workouts');

  if (member.distanceRun >= 100) automaticAchievements.add('100_miles');
  if (member.distanceRun >= 500) automaticAchievements.add('500_miles');
  if (member.distanceRun >= 1000) automaticAchievements.add('1000_miles');

  if (uniqueWorkoutTypes >= 5) automaticAchievements.add('variety');

  if (member.fitnessAssessments.some((assessment) => assessment.overallScore >= 90)) {
    automaticAchievements.add('excellent_fa');
  }
  if (member.fitnessAssessments.some((assessment) => assessment.overallScore === 100)) {
    automaticAchievements.add('perfect_fa');
  }

  if (sharedWorkouts.some((workout) => workout.createdBy === member.id && workout.squadron === member.squadron)) {
    automaticAchievements.add('shared_workout_creator');
  }

  const attendedSessions = ptSessions.filter((session) => session.attendees.includes(member.id));
  if (attendedSessions.length >= 10) {
    automaticAchievements.add('early_bird');
  }

  const attendanceByWeek = new Map<string, number>();
  attendedSessions.forEach((session) => {
    const weekKey = getWeekStartKey(session.date);
    attendanceByWeek.set(weekKey, (attendanceByWeek.get(weekKey) ?? 0) + 1);
  });

  const completedWeeks = Array.from(attendanceByWeek.entries())
    .filter(([, count]) => count >= WEEKLY_WARRIOR_SESSION_TARGET)
    .map(([weekKey]) => weekKey);
  const weeklyWarriorWeeks = Array.from(attendanceByWeek.entries())
    .filter(([, count]) => count >= WEEKLY_WARRIOR_SESSION_TARGET)
    .map(([weekKey]) => weekKey);
  const longestCompletedWeekStreak = countMaxConsecutiveWeeks(completedWeeks);

  if (weeklyWarriorWeeks.length >= 1) automaticAchievements.add('week_streak');
  if (longestCompletedWeekStreak >= 4) automaticAchievements.add('month_streak');
  if (longestCompletedWeekStreak >= 12) automaticAchievements.add('three_month_streak');

  const getMonthWeekKeys = (monthKey: string) => {
    const [year, month] = monthKey.split('-').map(Number);
    if (!year || !month) {
      return [];
    }

    const monthStart = new Date(year, month - 1, 1);
    const nextMonthStart = new Date(year, month, 1);
    const cursor = new Date(monthStart);
    cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
    const keys: string[] = [];

    while (cursor < nextMonthStart) {
      keys.push(cursor.toISOString().split('T')[0]);
      cursor.setDate(cursor.getDate() + 7);
    }

    return keys;
  };

  const effectiveWorkouts = member.workouts;
  const closedMonthWorkoutCounts = new Map<string, Map<string, number>>();
  effectiveWorkouts
    .filter((workout: Workout) => workout.date.slice(0, 7) < currentMonthKey)
    .forEach((workout: Workout) => {
      const monthKey = workout.date.slice(0, 7);
      const weekKey = getWeekStartKey(workout.date);
      const countsByWeek = closedMonthWorkoutCounts.get(monthKey) ?? new Map<string, number>();
      countsByWeek.set(weekKey, (countsByWeek.get(weekKey) ?? 0) + 1);
      closedMonthWorkoutCounts.set(monthKey, countsByWeek);
    });

  const earnedIronWill = Array.from(closedMonthWorkoutCounts.entries()).some(([monthKey, countsByWeek]) => {
    const monthWeekKeys = getMonthWeekKeys(monthKey);
    return monthWeekKeys.length > 0 && monthWeekKeys.every((weekKey) => (countsByWeek.get(weekKey) ?? 0) >= member.requiredPTSessionsPerWeek);
  });

  if (earnedIronWill) {
    automaticAchievements.add('iron_will');
  }

  return Array.from(automaticAchievements);
};

const buildMemberWithDerivedAchievements = (member: Member, ptSessions: PTSession[], sharedWorkouts: SharedWorkout[]) => {
  return {
    ...member,
    achievements: withCompletionist(member),
  };
};

const recomputeMembersAchievements = (members: Member[], ptSessions: PTSession[], sharedWorkouts: SharedWorkout[]) => (
  members.map((member) => buildMemberWithDerivedAchievements(member, ptSessions, sharedWorkouts))
);

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  hasCheckedAuth: boolean;
  rememberSession: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  keepAwakeEnabled: boolean;
  appTheme: AppTheme;
  showUpdateNotes: boolean;
  seenAchievementCelebrations: Record<string, string[]>;
  login: (user: User, options?: { rememberSession?: boolean }) => void;
  setSessionTokens: (tokens: { accessToken: string | null; refreshToken: string | null }) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  setKeepAwakeEnabled: (enabled: boolean) => void;
  setAppTheme: (theme: AppTheme) => void;
  setShowUpdateNotes: (enabled: boolean) => void;
  setHasCheckedAuth: (checked: boolean) => void;
  markAchievementCelebrationSeen: (userEmail: string, achievementId: string) => void;
}

interface MemberState {
  members: Member[];
  ptSessions: PTSession[];
  scheduledSessions: ScheduledPTSession[];
  sharedWorkouts: SharedWorkout[];
  defaultPTSessionsPerWeek: number;
  ufpmId: string | null;
  recentAchievementId: string | null;

  // Member actions
  addMember: (member: Member) => void;
  syncMembersFromRoster: (rosterMembers: Member[], options?: { squadron?: Squadron }) => void;
  removeMember: (id: string) => void;
  updateMember: (id: string, updates: Partial<Member>) => void;
  getMemberById: (id: string) => Member | undefined;

  // PT Session actions
  addPTSession: (session: PTSession) => void;
  syncPTSessions: (sessions: PTSession[]) => void;
  updatePTSession: (id: string, updates: Partial<PTSession>) => void;
  deletePTSession: (id: string) => void;
  toggleAttendance: (sessionId: string, memberId: string) => void;

  // Scheduled Session actions
  syncScheduledSessions: (sessions: ScheduledPTSession[]) => void;
  addScheduledSession: (session: ScheduledPTSession) => void;
  updateScheduledSession: (id: string, updates: Partial<ScheduledPTSession>) => void;
  deleteScheduledSession: (id: string) => void;

  // PTL approval actions
  approvePTL: (memberId: string) => void;
  rejectPTL: (memberId: string) => void;
  revokePTL: (memberId: string) => void;

  // UFPM actions
  setUFPM: (memberId: string) => void;

  // Settings
  setDefaultPTSessionsPerWeek: (count: number) => void;

  // Fitness Assessment actions
  addFitnessAssessment: (memberId: string, assessment: FitnessAssessment) => void;
  toggleFitnessPrivacy: (memberId: string) => void;

  // Workout actions
  addWorkout: (memberId: string, workout: Workout) => void;
  importWorkouts: (memberId: string, workouts: Workout[]) => void;
  pruneOldWorkoutMedia: (currentMonthKey?: string) => void;
  syncApprovedManualWorkouts: (entries: Array<{ memberId?: string; memberEmail?: string; workouts: Workout[] }>) => void;
  syncFitnessAssessments: (entries: Array<{ memberId?: string; memberEmail?: string; assessments: FitnessAssessment[] }>) => void;
  syncLeaderboardHistory: () => void;
  syncMemberAchievements: (entries: Array<{ memberId?: string; memberEmail?: string; achievements: string[] }>) => void;

  // Achievement actions
  awardAchievement: (memberId: string, achievementId: string) => void;
  dismissAchievementCelebration: () => void;
  previewAchievementCelebration: (achievementId: string) => void;

  // Shared Workout actions
  syncSharedWorkouts: (workouts: SharedWorkout[]) => void;
  addSharedWorkout: (workout: SharedWorkout) => void;
  deleteSharedWorkout: (id: string) => void;
  rateSharedWorkout: (workoutId: string, memberId: string, rating: 'up' | 'down' | 'none') => void;
  toggleFavoriteWorkout: (workoutId: string, memberId: string) => void;
}

// FitFlight Creator account (owner)
const OWNER_ACCOUNT: Member = {
  id: 'owner_001',
  rank: 'SSgt',
  firstName: 'BENJAMIN',
  lastName: 'BROADHEAD',
  flight: 'Doom',
  squadron: 'Hawks',
  accountType: 'fitflight_creator',
  email: 'benjamin.broadhead.2@us.af.mil',
  exerciseMinutes: 0,
  distanceRun: 0,
  connectedApps: [],
  fitnessAssessments: [],
  workouts: [],
  achievements: [],
  requiredPTSessionsPerWeek: 5,
  isVerified: true,
  ptlPendingApproval: false,
  monthlyPlacements: [],
  leaderboardHistory: [],
  trophyCount: 0,
  hasSeenTutorial: false,
  mustChangePassword: false,
  hasLoggedIntoApp: true,
};

const DEMO_ACCOUNT_EMAIL = 'fitflight@us.af.mil';
const DEMO_ACCOUNT: Partial<Member> = {
  rank: 'Lt. Col.',
  firstName: 'Ima',
  lastName: 'Demo',
  accountType: 'demo',
};

const INITIAL_MEMBERS: Member[] = [];
const ROSTER_BACKED_SQUADRON: Squadron = 'Hawks';
const AUTH_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeSpecialAccountMember = (member: Member): Member => {
  if (member.email.toLowerCase() !== OWNER_ACCOUNT.email.toLowerCase()) {
    if (member.email.toLowerCase() !== DEMO_ACCOUNT_EMAIL) {
      return member;
    }

    return {
      ...member,
      rank: DEMO_ACCOUNT.rank ?? member.rank,
      firstName: DEMO_ACCOUNT.firstName ?? member.firstName,
      lastName: DEMO_ACCOUNT.lastName ?? member.lastName,
      accountType: DEMO_ACCOUNT.accountType ?? member.accountType,
      mustChangePassword: false,
      hasLoggedIntoApp: true,
    };
  }

  return {
    ...member,
    rank: OWNER_ACCOUNT.rank,
    firstName: OWNER_ACCOUNT.firstName,
    lastName: OWNER_ACCOUNT.lastName,
    accountType: OWNER_ACCOUNT.accountType,
  };
};

const isSameMember = (left: Member, right: Member) => {
  if (left.email && right.email && left.email.toLowerCase() === right.email.toLowerCase()) {
    return true;
  }

  return (
    left.firstName.trim().toLowerCase() === right.firstName.trim().toLowerCase() &&
    left.lastName.trim().toLowerCase() === right.lastName.trim().toLowerCase()
  );
};

const resolveMappedMemberId = (memberIdMap: Map<string, string>, memberId: string) => {
  let currentId = memberId;
  const visited = new Set<string>();

  while (!visited.has(currentId)) {
    visited.add(currentId);
    const nextId = memberIdMap.get(currentId);
    if (!nextId || nextId === currentId) {
      break;
    }
    currentId = nextId;
  }

  return currentId;
};

const getPTSessionSyncKey = (sessions: PTSession[]) => JSON.stringify(
  sessions
    .map((session) => ({
      id: session.id,
      date: session.date,
      flight: session.flight,
      squadron: session.squadron ?? DEFAULT_SQUADRON,
      createdBy: session.createdBy,
      attendees: [...session.attendees].sort(),
      attendeeSources: Object.entries(session.attendeeSources ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
);

const mergeMember = (base: Member, existing?: Member): Member => {
  if (!existing) {
    return {
      ...normalizeSpecialAccountMember(base),
      achievements: withCompletionist(normalizeSpecialAccountMember(base)),
    };
  }

  const mergedMember = {
    ...base,
    id: AUTH_ID_PATTERN.test(base.id)
      ? base.id
      : AUTH_ID_PATTERN.test(existing.id)
        ? existing.id
        : (existing.id || base.id),
    email: existing.email || base.email,
      // Roster sync should respect the latest server-derived role so role changes
      // made in Supabase or through admin workflows propagate everywhere in-app.
      accountType: normalizeAccountType(base.accountType),
    profilePicture: existing.profilePicture ?? base.profilePicture,
    showWorkoutHistoryOnProfile: base.showWorkoutHistoryOnProfile ?? existing.showWorkoutHistoryOnProfile ?? true,
    showWorkoutUploadsOnProfile: base.showWorkoutUploadsOnProfile ?? existing.showWorkoutUploadsOnProfile ?? true,
    showPFRARecordsOnProfile: base.showPFRARecordsOnProfile ?? existing.showPFRARecordsOnProfile ?? true,
    showUpdateNotes: base.showUpdateNotes ?? existing.showUpdateNotes ?? true,
    appTheme: base.appTheme ?? existing.appTheme ?? 'default',
    exerciseMinutes: existing.exerciseMinutes,
    distanceRun: existing.distanceRun,
    connectedApps: existing.connectedApps,
    fitnessAssessments: existing.fitnessAssessments,
    workouts: existing.workouts,
    achievements: base.achievements,
    requiredPTSessionsPerWeek: existing.requiredPTSessionsPerWeek,
    isVerified: existing.isVerified,
    ptlPendingApproval: existing.ptlPendingApproval,
    monthlyPlacements: existing.monthlyPlacements,
    leaderboardHistory: existing.leaderboardHistory,
    trophyCount: existing.trophyCount,
    hasSeenTutorial: existing.hasSeenTutorial ?? base.hasSeenTutorial,
    mustChangePassword: existing.mustChangePassword ?? base.mustChangePassword,
    hasLoggedIntoApp: existing.hasLoggedIntoApp ?? base.hasLoggedIntoApp,
  };

  const normalizedMergedMember = normalizeSpecialAccountMember(mergedMember);

  return {
    ...normalizedMergedMember,
    achievements: withCompletionist(normalizedMergedMember),
  };
};

const getWorkoutDedupKey = (workout: Workout) => {
  if (workout.externalId) {
    return `${workout.source}:${workout.externalId}`;
  }

  return `${workout.source}:${workout.date}:${workout.type}:${workout.duration}:${workout.distance ?? 0}`;
};

const mergeWorkouts = (existing: Workout[], incoming: Workout[]) => {
  const merged = [...existing];
  const keys = new Set(existing.map(getWorkoutDedupKey));

  incoming.forEach((workout) => {
    const key = getWorkoutDedupKey(workout);
    if (keys.has(key)) {
      return;
    }

    keys.add(key);
    merged.push(workout);
  });

  return merged.sort((a, b) => b.date.localeCompare(a.date));
};

const summarizeWorkouts = (workouts: Workout[]) => ({
  exerciseMinutes: workouts.reduce((total, workout) => total + workout.duration, 0),
  distanceRun: Number(
    workouts
      .reduce((total, workout) => total + (workout.distance ?? 0), 0)
      .toFixed(2)
  ),
});

const normalizeScheduledSession = (session: ScheduledPTSession): ScheduledPTSession => ({
  ...session,
  flights: session.flights?.length ? [...new Set(session.flights)] : [],
  scope: session.scope ?? 'flight',
  kind: session.kind ?? 'pt',
});

const applyLeaderboardHistory = (members: Member[], ptSessions: PTSession[]) => {
  const historyByMember = buildLeaderboardHistory(members, ptSessions);

  return members.map((member) => {
    const leaderboardHistory = historyByMember.get(member.id) ?? [];
    const monthlyPlacements = leaderboardHistory
      .filter((entry) => entry.position >= 1 && entry.position <= 3)
      .map((entry) => ({
        month: entry.month,
        position: entry.position as 1 | 2 | 3,
      }));

    return {
      ...member,
      leaderboardHistory,
      monthlyPlacements,
      trophyCount: monthlyPlacements.length,
    };
  });
};

const findNewlyEarnedAchievementId = (previousMembers: Member[], nextMembers: Member[]) => {
  const authUser = useAuthStore.getState().user;
  const normalizedAuthEmail = authUser?.email?.trim().toLowerCase();

  for (const nextMember of nextMembers) {
    const isCurrentUser =
      (authUser && nextMember.id === authUser.id) ||
      (normalizedAuthEmail && nextMember.email.trim().toLowerCase() === normalizedAuthEmail);

    if (!isCurrentUser) {
      continue;
    }

    const previousMember = previousMembers.find((member) => member.id === nextMember.id);
    const previousMemberByEmail =
      normalizedAuthEmail
        ? previousMembers.find((member) => member.email.trim().toLowerCase() === normalizedAuthEmail)
        : undefined;
    const resolvedPreviousMember = previousMember ?? previousMemberByEmail;

    if (!resolvedPreviousMember) {
      continue;
    }

    const previousAchievements = new Set(getEffectiveAchievementIds(resolvedPreviousMember));
    const nextAchievements = getEffectiveAchievementIds(nextMember);
    const newlyEarnedId = nextAchievements.find((achievementId) => !previousAchievements.has(achievementId));

    if (newlyEarnedId) {
      return newlyEarnedId;
    }
  }

  return null;
};

const hydrateDerivedMemberState = (members: Member[], ptSessions: PTSession[], sharedWorkouts: SharedWorkout[]) => (
  recomputeMembersAchievements(applyLeaderboardHistory(members, ptSessions), ptSessions, sharedWorkouts)
);

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      hasCheckedAuth: false,
        rememberSession: false,
        accessToken: null,
        refreshToken: null,
        keepAwakeEnabled: true,
        appTheme: 'default',
        showUpdateNotes: true,
        seenAchievementCelebrations: {},
        login: (user, options) => set({
          user,
          isAuthenticated: true,
          hasCheckedAuth: true,
          rememberSession: options?.rememberSession ?? false,
          keepAwakeEnabled: user.keepAwakeEnabled ?? true,
          appTheme: user.appTheme ?? 'default',
          showUpdateNotes: user.showUpdateNotes ?? true,
        }),
      setSessionTokens: (tokens) => set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      }),
      logout: () => set({
        user: null,
        isAuthenticated: false,
        rememberSession: false,
        accessToken: null,
        refreshToken: null,
      }),
        updateUser: (updates) => set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
          keepAwakeEnabled:
            typeof updates.keepAwakeEnabled === 'boolean' ? updates.keepAwakeEnabled : state.keepAwakeEnabled,
          appTheme: updates.appTheme ?? state.appTheme,
          showUpdateNotes:
            typeof updates.showUpdateNotes === 'boolean' ? updates.showUpdateNotes : state.showUpdateNotes,
        })),
        setKeepAwakeEnabled: (enabled) => set((state) => ({
          keepAwakeEnabled: enabled,
          user: state.user ? { ...state.user, keepAwakeEnabled: enabled } : state.user,
        })),
        setAppTheme: (theme) => set((state) => ({
          appTheme: theme,
          user: state.user ? { ...state.user, appTheme: theme } : state.user,
        })),
        setShowUpdateNotes: (enabled) => set((state) => ({
          showUpdateNotes: enabled,
          user: state.user ? { ...state.user, showUpdateNotes: enabled } : state.user,
        })),
        setHasCheckedAuth: (checked) => set({ hasCheckedAuth: checked }),
      markAchievementCelebrationSeen: (userEmail, achievementId) =>
        set((state) => {
          const normalizedEmail = userEmail.trim().toLowerCase();
          const existing = state.seenAchievementCelebrations[normalizedEmail] ?? [];
          if (existing.includes(achievementId)) {
            return state;
          }

          return {
            seenAchievementCelebrations: {
              ...state.seenAchievementCelebrations,
              [normalizedEmail]: [...existing, achievementId],
            },
          };
        }),
    }),
    {
        name: 'flighttrack-auth',
        version: 6,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persistedState: unknown, version) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return persistedState as AuthState;
        }

        const state = persistedState as Partial<AuthState>;
        if (version < 2 && state.isAuthenticated && !state.accessToken) {
          return {
            ...state,
            user: null,
            isAuthenticated: false,
            rememberSession: false,
            accessToken: null,
            refreshToken: null,
            keepAwakeEnabled: true,
          } as AuthState;
        }

        if (version < 3) {
          return {
            ...state,
            keepAwakeEnabled:
              typeof state.user?.keepAwakeEnabled === 'boolean'
                ? state.user.keepAwakeEnabled
                : (state as Partial<AuthState>).keepAwakeEnabled ?? true,
            seenAchievementCelebrations: (state as Partial<AuthState>).seenAchievementCelebrations ?? {},
          } as AuthState;
        }

        if (version < 4) {
          return {
            ...state,
            seenAchievementCelebrations: (state as Partial<AuthState>).seenAchievementCelebrations ?? {},
          } as AuthState;
        }

        if (version < 5) {
          return {
            ...state,
            appTheme: (state as Partial<AuthState>).appTheme ?? 'default',
          } as AuthState;
        }

        if (version < 6) {
          return {
            ...state,
            showUpdateNotes:
              typeof state.user?.showUpdateNotes === 'boolean'
                ? state.user.showUpdateNotes
                : (state as Partial<AuthState>).showUpdateNotes ?? true,
          } as AuthState;
        }

        return persistedState as AuthState;
      },
      partialize: (state) => ({
        user: state.rememberSession ? state.user : null,
        isAuthenticated: state.rememberSession ? state.isAuthenticated : false,
        hasCheckedAuth: state.hasCheckedAuth,
        rememberSession: state.rememberSession,
        accessToken: state.rememberSession ? state.accessToken : null,
        refreshToken: state.rememberSession ? state.refreshToken : null,
        keepAwakeEnabled: state.keepAwakeEnabled,
        appTheme: state.appTheme,
        showUpdateNotes: state.showUpdateNotes,
        seenAchievementCelebrations: state.seenAchievementCelebrations,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHasCheckedAuth(true);
        }
      },
    }
  )
);

export const useMemberStore = create<MemberState>()(
  persist(
    (set, get) => ({
      members: INITIAL_MEMBERS,
      ptSessions: [],
      scheduledSessions: [],
      sharedWorkouts: [],
      defaultPTSessionsPerWeek: 5,
      ufpmId: null,
      recentAchievementId: null,

      // Member actions
      addMember: (member) => set((state) => ({
        members: hydrateDerivedMemberState(
          [...state.members, normalizeSpecialAccountMember({ ...member, achievements: withCompletionist(member) })],
          state.ptSessions,
          state.sharedWorkouts
        )
      })),

      syncMembersFromRoster: (rosterMembers, options) => set((state) => {
        const syncedSquadrons = options?.squadron
          ? new Set<Squadron>([options.squadron])
          : new Set(rosterMembers.map((member) => member.squadron));
        const untouchedMembers = state.members.filter((member) => !syncedSquadrons.has(member.squadron));
        const mergedRosterMembers = rosterMembers.map((rosterMember) => {
          const existing = state.members.find((member) => member.squadron === rosterMember.squadron && isSameMember(member, rosterMember));
          return normalizeSpecialAccountMember(mergeMember(rosterMember, existing));
        });
        const nextMembers = [...untouchedMembers, ...mergedRosterMembers];
        const validMemberIds = new Set(nextMembers.map((member) => member.id));
        const memberIdMap = new Map<string, string>();

        state.members.forEach((existingMember) => {
          const matchingMember = mergedRosterMembers.find((member) => member.squadron === existingMember.squadron && isSameMember(existingMember, member));
          if (matchingMember) {
            memberIdMap.set(existingMember.id, matchingMember.id);
          }
        });

        const mapMemberId = (memberId: string) => resolveMappedMemberId(memberIdMap, memberId);
        const fallbackCreatorId =
          nextMembers.find((member) => member.accountType === 'fitflight_creator')?.id ??
          nextMembers[0]?.id ??
          null;
        const nextPtSessions = state.ptSessions.map((session) => ({
            ...session,
            squadron: session.squadron ?? DEFAULT_SQUADRON,
            attendees: [...new Set(session.attendees.map(mapMemberId).filter((memberId) => validMemberIds.has(memberId)))],
            attendeeSources: Object.fromEntries(
              Object.entries(session.attendeeSources ?? {})
                .map(([memberId, source]) => [mapMemberId(memberId), source] as const)
                .filter(([memberId]) => validMemberIds.has(memberId))
            ),
            createdBy:
              validMemberIds.has(mapMemberId(session.createdBy))
                ? mapMemberId(session.createdBy)
              : fallbackCreatorId ?? session.createdBy,
        }));
        const nextScheduledSessions = state.scheduledSessions.map((session) => normalizeScheduledSession({
          ...session,
          squadron: session.squadron ?? DEFAULT_SQUADRON,
          createdBy:
            validMemberIds.has(mapMemberId(session.createdBy))
              ? mapMemberId(session.createdBy)
              : fallbackCreatorId ?? session.createdBy,
        }));
        const nextSharedWorkouts = state.sharedWorkouts.map((workout) => ({
          ...workout,
          createdBy:
            validMemberIds.has(mapMemberId(workout.createdBy))
              ? mapMemberId(workout.createdBy)
              : fallbackCreatorId ?? workout.createdBy,
          thumbsUp: [...new Set(workout.thumbsUp.map(mapMemberId).filter((memberId) => validMemberIds.has(memberId)))],
          thumbsDown: [...new Set(workout.thumbsDown.map(mapMemberId).filter((memberId) => validMemberIds.has(memberId)))],
          favoritedBy: [...new Set(workout.favoritedBy.map(mapMemberId).filter((memberId) => validMemberIds.has(memberId)))],
        }));

        return {
          members: hydrateDerivedMemberState(nextMembers, nextPtSessions, nextSharedWorkouts),
          ptSessions: nextPtSessions,
          scheduledSessions: nextScheduledSessions,
          sharedWorkouts: nextSharedWorkouts,
          recentAchievementId: state.recentAchievementId,
          ufpmId:
            state.ufpmId && validMemberIds.has(mapMemberId(state.ufpmId))
              ? mapMemberId(state.ufpmId)
              : nextMembers.find((member) => member.accountType === 'ufpm')?.id ?? null,
        };
      }),

      removeMember: (id) => set((state) => ({
        members: state.members.filter(m => m.id !== id)
      })),

      updateMember: (id, updates) => set((state) => ({
        members: hydrateDerivedMemberState(state.members.map(m => {
          if (m.id !== id) return m;
          const nextMember = normalizeSpecialAccountMember({ ...m, ...updates });
          return {
            ...nextMember,
            achievements: withCompletionist(nextMember),
          };
        }), state.ptSessions, state.sharedWorkouts)
      })),

      getMemberById: (id) => get().members.find(m => m.id === id),

      // PT Session actions
      addPTSession: (session) => set((state) => ({
        ptSessions: [...state.ptSessions, session],
        members: (() => {
          const nextMembers = hydrateDerivedMemberState(state.members, [...state.ptSessions, session], state.sharedWorkouts);
          return nextMembers;
        })(),
        recentAchievementId: (() => {
          const nextMembers = hydrateDerivedMemberState(state.members, [...state.ptSessions, session], state.sharedWorkouts);
          return findNewlyEarnedAchievementId(state.members, nextMembers) ?? state.recentAchievementId;
        })(),
      })), 

        syncPTSessions: (sessions) => set((state) => {
          const normalizedSessions = sessions.map((session) => ({
            ...session,
            squadron: session.squadron ?? DEFAULT_SQUADRON,
            attendees: [...new Set(session.attendees)],
            attendeeSources: session.attendeeSources ?? {},
          }));
          const syncedSquadrons = new Set(normalizedSessions.map((session) => session.squadron));
          const preservedSessions = state.ptSessions.filter((session) => !syncedSquadrons.has(session.squadron ?? DEFAULT_SQUADRON));
          const nextSessions = [...preservedSessions, ...normalizedSessions];

          // Background refreshes frequently return the same attendance data.
          // Avoid recalculating every member's derived analytics in that case.
          if (getPTSessionSyncKey(state.ptSessions) === getPTSessionSyncKey(nextSessions)) {
            return state;
          }
          const nextMembers = hydrateDerivedMemberState(state.members, nextSessions, state.sharedWorkouts);

        return {
          ptSessions: nextSessions,
          members: nextMembers,
          recentAchievementId: state.recentAchievementId,
        };
      }),

      updatePTSession: (id, updates) => set((state) => {
        const nextSessions = state.ptSessions.map(s => s.id === id ? { ...s, ...updates } : s);
        const nextMembers = hydrateDerivedMemberState(state.members, nextSessions, state.sharedWorkouts);

        return {
          ptSessions: nextSessions,
          members: nextMembers,
          recentAchievementId: findNewlyEarnedAchievementId(state.members, nextMembers) ?? state.recentAchievementId,
        };
      }),

      deletePTSession: (id) => set((state) => ({
        ptSessions: state.ptSessions.filter(s => s.id !== id),
        members: hydrateDerivedMemberState(state.members, state.ptSessions.filter(s => s.id !== id), state.sharedWorkouts),
      })),

      toggleAttendance: (sessionId, memberId) => set((state) => {
        const nextSessions = state.ptSessions.map(s => {
          if (s.id !== sessionId) return s;
          const isPresent = s.attendees.includes(memberId);
          return {
            ...s,
            attendees: isPresent
              ? s.attendees.filter(id => id !== memberId)
              : [...s.attendees, memberId]
          };
        });
        const nextMembers = hydrateDerivedMemberState(state.members, nextSessions, state.sharedWorkouts);

        return {
          ptSessions: nextSessions,
          members: nextMembers,
          recentAchievementId: findNewlyEarnedAchievementId(state.members, nextMembers) ?? state.recentAchievementId,
        };
      }),

      // Scheduled Session actions
      syncScheduledSessions: (sessions) => set((state) => {
        const normalizedSessions = sessions.map(normalizeScheduledSession);
        const syncedSquadrons = new Set(normalizedSessions.map((session) => session.squadron ?? DEFAULT_SQUADRON));
        const preservedSessions = state.scheduledSessions.filter((session) => !syncedSquadrons.has(session.squadron ?? DEFAULT_SQUADRON));
        return {
          scheduledSessions: [...preservedSessions, ...normalizedSessions],
        };
      }),

      addScheduledSession: (session) => set((state) => ({
        scheduledSessions: [...state.scheduledSessions, normalizeScheduledSession(session)]
      })),

      updateScheduledSession: (id, updates) => set((state) => ({
        scheduledSessions: state.scheduledSessions.map(s =>
          s.id === id ? normalizeScheduledSession({ ...s, ...updates }) : s
        )
      })),

      deleteScheduledSession: (id) => set((state) => ({
        scheduledSessions: state.scheduledSessions.filter(s => s.id !== id)
      })),

      // PTL approval actions
      approvePTL: (memberId) => set((state) => ({
        members: state.members.map(m =>
          m.id === memberId
            ? { ...m, accountType: 'pfl' as AccountType, ptlPendingApproval: false }
            : m
        ),
      })),

      rejectPTL: (memberId) => set((state) => ({
        members: state.members.map(m =>
          m.id === memberId
            ? { ...m, accountType: 'standard' as AccountType, ptlPendingApproval: false }
            : m
        ),
      })),

      revokePTL: (memberId) => set((state) => ({
        members: state.members.map(m =>
          m.id === memberId
            ? { ...m, accountType: 'standard' as AccountType }
            : m
        ),
      })),

      // UFPM actions
      setUFPM: (memberId) => set((state) => ({
        ufpmId: memberId,
        members: state.members.map(m => ({
          ...m,
          accountType: m.id === memberId
            ? 'ufpm' as AccountType
            : m.accountType === 'ufpm'
              ? 'pfl' as AccountType
              : m.accountType,
        })),
      })),

      // Settings
      setDefaultPTSessionsPerWeek: (count) => set({ defaultPTSessionsPerWeek: count }),

      // Fitness Assessment actions
      addFitnessAssessment: (memberId, assessment) => set((state) => {
        const nextMembers = state.members.map(m =>
          m.id === memberId
            ? {
                ...m,
                fitnessAssessments: [...m.fitnessAssessments, assessment],
                requiredPTSessionsPerWeek: 5,
              }
            : m
        );
        return {
          members: hydrateDerivedMemberState(nextMembers, state.ptSessions, state.sharedWorkouts),
        };
      }),

      toggleFitnessPrivacy: (memberId) => set((state) => ({
        members: state.members.map(m =>
          m.id === memberId
            ? {
                ...m,
                fitnessAssessments: m.fitnessAssessments.map(fa => ({
                  ...fa,
                  isPrivate: !fa.isPrivate,
                })),
              }
            : m
        ),
      })),

      // Workout actions
      addWorkout: (memberId, workout) => set((state) => {
        const nextMembers = hydrateDerivedMemberState(state.members.map(m =>
          m.id === memberId
            ? {
                ...m,
                workouts: [...m.workouts, workout],
                exerciseMinutes: m.exerciseMinutes + workout.duration,
                distanceRun: m.distanceRun + (workout.distance ?? 0),
              }
            : m
        ), state.ptSessions, state.sharedWorkouts);

        return {
          members: nextMembers,
          recentAchievementId: findNewlyEarnedAchievementId(state.members, nextMembers) ?? state.recentAchievementId,
        };
      }),

      importWorkouts: (memberId, workouts) => set((state) => {
        const nextMembers = hydrateDerivedMemberState(state.members.map((member) => {
          if (member.id !== memberId) {
            return member;
          }

          const mergedWorkouts = mergeWorkouts(member.workouts, workouts);
          const summary = summarizeWorkouts(mergedWorkouts);

          return {
            ...member,
            workouts: mergedWorkouts,
            exerciseMinutes: summary.exerciseMinutes,
            distanceRun: summary.distanceRun,
          };
        }), state.ptSessions, state.sharedWorkouts);

        return {
          members: nextMembers,
          recentAchievementId: findNewlyEarnedAchievementId(state.members, nextMembers) ?? state.recentAchievementId,
        };
      }),

      pruneOldWorkoutMedia: (currentMonthKey = new Date().toISOString().slice(0, 7)) => set((state) => ({
        members: state.members.map((member) => ({
          ...member,
          workouts: member.workouts.map((workout) => (
            workout.screenshotUri && !workout.date.startsWith(currentMonthKey)
              ? { ...workout, screenshotUri: undefined }
              : workout
          )),
        })),
      })),

        syncApprovedManualWorkouts: (entries) => set((state) => {
          const nextMembers = state.members.map((member) => {
            const matchingEntry = entries.find((entry) =>
              (entry.memberId && entry.memberId === member.id) ||
              (entry.memberEmail && entry.memberEmail.toLowerCase() === member.email.toLowerCase())
            );

            if (!matchingEntry) {
              return member;
            }
            const approvedManualWorkouts = matchingEntry.workouts ?? [];

            const preservedWorkouts = member.workouts.filter(
              (workout) => !(workout.source === 'manual' && Boolean(workout.externalId))
            );
          const mergedWorkouts = mergeWorkouts(preservedWorkouts, approvedManualWorkouts);
          const summary = summarizeWorkouts(mergedWorkouts);

          return {
            ...member,
            workouts: mergedWorkouts,
            exerciseMinutes: summary.exerciseMinutes,
            distanceRun: summary.distanceRun,
          };
        });

        const hydratedMembers = hydrateDerivedMemberState(nextMembers, state.ptSessions, state.sharedWorkouts);
        return {
          members: hydratedMembers,
          recentAchievementId: state.recentAchievementId,
        };
      }),

      syncFitnessAssessments: (entries) => set((state) => {
        const nextMembers = state.members.map((member) => {
          const match = entries.find((entry) =>
            (entry.memberId && entry.memberId === member.id) ||
            (entry.memberEmail && entry.memberEmail.toLowerCase() === member.email.toLowerCase())
          );

          if (!match) {
            return member;
          }

          return {
            ...member,
            fitnessAssessments: [...match.assessments].sort((left, right) => left.date.localeCompare(right.date)),
          };
        });

        const hydratedMembers = hydrateDerivedMemberState(nextMembers, state.ptSessions, state.sharedWorkouts);
        return {
          members: hydratedMembers,
          recentAchievementId: state.recentAchievementId,
        };
      }),

      syncLeaderboardHistory: () => set((state) => ({
        members: hydrateDerivedMemberState(state.members, state.ptSessions, state.sharedWorkouts),
      })),

      syncMemberAchievements: (entries) => set((state) => {
        const nextMembers = state.members.map((member) => {
          const match = entries.find((entry) =>
            (entry.memberId && entry.memberId === member.id) ||
            (entry.memberEmail && entry.memberEmail.trim().toLowerCase() === member.email.trim().toLowerCase())
          );

          if (!match) {
            return member;
          }

          return {
            ...member,
            achievements: withCompletionist({
              ...member,
              achievements: match.achievements,
            }),
          };
        });

        return {
          members: nextMembers,
          recentAchievementId: state.recentAchievementId,
        };
      }),

      // Achievement actions
      awardAchievement: (memberId, achievementId) => set((state) => ({
        members: state.members.map((member) => {
          const currentAchievements = new Set(getEffectiveAchievementIds(member));
          if (member.id !== memberId || currentAchievements.has(achievementId)) {
            return member;
          }

          const nextAchievements = withCompletionist({
            ...member,
            achievements: [...currentAchievements, achievementId],
          });

          return {
            ...member,
            achievements: nextAchievements,
          };
        }),
        recentAchievementId: state.members.some((member) => {
          if (member.id !== memberId) {
            return false;
          }

          return !new Set(getEffectiveAchievementIds(member)).has(achievementId);
        })
          ? (() => {
              const targetMember = state.members.find((member) => member.id === memberId);
              if (!targetMember) {
                return state.recentAchievementId;
              }

              const nextAchievements = withCompletionist({
                ...targetMember,
                achievements: [...getEffectiveAchievementIds(targetMember), achievementId],
              });

              return nextAchievements.includes('completionist') && !targetMember.achievements.includes('completionist')
                ? 'completionist'
                : achievementId;
            })()
          : state.recentAchievementId,
      })),

      dismissAchievementCelebration: () => set({ recentAchievementId: null }),

      previewAchievementCelebration: (achievementId) => set({ recentAchievementId: achievementId }),

      // Shared Workout actions
      syncSharedWorkouts: (workouts) => set((state) => {
        const syncedSquadrons = new Set(workouts.map((workout) => workout.squadron));
        const preservedWorkouts = state.sharedWorkouts.filter((workout) => !syncedSquadrons.has(workout.squadron));
        const nextSharedWorkouts = [...preservedWorkouts, ...workouts];
        const nextMembers = hydrateDerivedMemberState(state.members, state.ptSessions, nextSharedWorkouts);
        return {
          sharedWorkouts: nextSharedWorkouts,
          members: nextMembers,
          recentAchievementId: state.recentAchievementId,
        };
      }),

      addSharedWorkout: (workout) => set((state) => {
        const nextSharedWorkouts = [workout, ...state.sharedWorkouts];
        return {
          sharedWorkouts: nextSharedWorkouts,
          members: hydrateDerivedMemberState(state.members, state.ptSessions, nextSharedWorkouts),
        };
      }),

      deleteSharedWorkout: (id) => set((state) => {
        const nextSharedWorkouts = state.sharedWorkouts.filter(w => w.id !== id);
        return {
          sharedWorkouts: nextSharedWorkouts,
          members: hydrateDerivedMemberState(state.members, state.ptSessions, nextSharedWorkouts),
        };
      }),

      rateSharedWorkout: (workoutId, memberId, rating) => set((state) => {
        const nextSharedWorkouts = state.sharedWorkouts.map(w => {
          if (w.id !== workoutId) return w;
          // Remove from both arrays first
          const newThumbsUp = w.thumbsUp.filter(id => id !== memberId);
          const newThumbsDown = w.thumbsDown.filter(id => id !== memberId);
          // Add to appropriate array based on rating
          if (rating === 'up') {
            newThumbsUp.push(memberId);
          } else if (rating === 'down') {
            newThumbsDown.push(memberId);
          }
          return { ...w, thumbsUp: newThumbsUp, thumbsDown: newThumbsDown };
        });
        return {
          sharedWorkouts: nextSharedWorkouts,
          members: hydrateDerivedMemberState(state.members, state.ptSessions, nextSharedWorkouts),
        };
      }),

      toggleFavoriteWorkout: (workoutId, memberId) => set((state) => {
        const nextSharedWorkouts = state.sharedWorkouts.map(w => {
          if (w.id !== workoutId) return w;
          const isFavorited = w.favoritedBy.includes(memberId);
          return {
            ...w,
            favoritedBy: isFavorited
              ? w.favoritedBy.filter(id => id !== memberId)
              : [...w.favoritedBy, memberId],
          };
        });
        return {
          sharedWorkouts: nextSharedWorkouts,
          members: hydrateDerivedMemberState(state.members, state.ptSessions, nextSharedWorkouts),
        };
      }),
    }),
    {
      name: 'flighttrack-members',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => {
        const { recentAchievementId, ...persistedState } = state;
        return persistedState;
      },
    }
  )
);

// Helper to check if user can manage PTL status
export const canManagePTL = (accountType: AccountType): boolean => {
  return accountType === 'fitflight_creator' || accountType === 'ufpm' || accountType === 'demo' || accountType === 'squadron_leadership' || accountType === 'group_personnel';
};

// Helper to check if user can edit PT attendance
export const canEditAttendance = (accountType: AccountType): boolean => {
  return accountType === 'fitflight_creator' || accountType === 'ufpm' || accountType === 'squadron_leadership' || accountType === 'group_personnel' || isPFLAccountType(accountType);
};

// Helper for UFPM-like or PT-program features that Demo can still access
export const canManagePTPrograms = (accountType: AccountType): boolean => {
  return canEditAttendance(accountType) || accountType === 'demo';
};

export const canManagePFRARecords = (accountType: AccountType): boolean => {
  return accountType === 'fitflight_creator' || accountType === 'ufpm' || accountType === 'squadron_leadership' || accountType === 'group_personnel' || isPFLAccountType(accountType);
};

// Helper to check if user has admin access
export const isAdmin = (accountType: AccountType): boolean => {
  return accountType === 'fitflight_creator' || accountType === 'ufpm' || accountType === 'demo' || accountType === 'squadron_leadership' || accountType === 'group_personnel';
};
