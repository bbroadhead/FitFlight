import type { Member, PTSession, Workout, WorkoutIntent, WorkoutType } from '@/lib/store';
import { getMemberEffectiveWorkouts } from '@/lib/effectiveWorkouts';

export const WORKOUT_SCORE_ENGINE_NAME = 'Leaderboard Score Engine';
export const WORKOUT_SCORE_ENGINE_ROLLOUT_DATE = '2026-05-11';
export const ATTENDANCE_CHECK_IN_POINTS = 10;

const FIRST_WORKOUT_POINTS = 30;
const MAX_FINAL_POINTS = 115;
const MAX_CONSISTENCY_BONUS = 10;
const MAX_IMPROVEMENT_BONUS = 15;

type MetricDirection = 'higher' | 'lower';
type BenchmarkGroup = 'cardio' | 'strength' | 'session' | 'general';

type MetricDescriptor = {
  key: string;
  label: string;
  weight: number;
  direction: MetricDirection;
  getValue: (workout: Workout) => number | undefined;
  formatValue?: (value: number) => string;
};

type EffortMetricDescriptor = MetricDescriptor & {
  benchmarkGroup: BenchmarkGroup;
  benchmarkBaseValue: number;
};

type WorkoutScoreKeyInfo = {
  type: WorkoutType;
  subtype?: string;
  intent: WorkoutIntent;
  key: string;
  label: string;
  analyticsKey: string;
  analyticsLabel: string;
};

type BaselineContext = {
  workouts: Workout[];
  bucket: 'exact_intent' | 'type_fallback' | 'none';
  label: string;
};

export type WorkoutScoreMetricDetail = {
  key: string;
  label: string;
  weight: number;
  direction: MetricDirection;
  currentValue: number;
  baselineValue: number;
  ratio: number;
  currentDisplay: string;
  baselineDisplay: string;
};

export type WorkoutScoreBreakdown = {
  engine: 'legacy' | 'leaderboard_score_engine';
  type: WorkoutType;
  subtype?: string;
  intent?: WorkoutIntent;
  typeLabel: string;
  analyticsKey: string;
  analyticsLabel: string;
  finalPoints: number;
  preciseFinalPoints: number;
  workoutPoints: number;
  effortScore: number;
  intentMatchScore: number;
  consistencyBonus: number;
  improvementBonus: number;
  weeklySessionCount: number;
  metricScore: number;
  baselineSampleSize: number;
  baselineLabel: string;
  comparedToLabel: string;
  metrics: WorkoutScoreMetricDetail[];
  effortMetrics: WorkoutScoreMetricDetail[];
  explanation: string;
};

export type ScoredWorkoutEntry = {
  workout: Workout;
  scoreKey: string;
  scoreLabel: string;
  points: number;
  breakdown: WorkoutScoreBreakdown;
};

export type WorkoutSessionScorePreview = {
  totalPoints: number;
  maxPoints: number;
  breakdown: {
    effortScore: number;
    intentMatchScore: number;
    consistencyBonus: number;
    improvementBonus: number;
  };
  comparedToLabel: string;
  comparisonDetail: string;
  tip: string;
  entries: ScoredWorkoutEntry[];
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const buildLegacyRosterId = (
  member: Pick<Member, 'rank' | 'firstName' | 'lastName' | 'flight'> & Partial<Pick<Member, 'squadron'>>,
  includeSquadron = false
) =>
  `roster-${slugify(
    includeSquadron && member.squadron
      ? `${member.squadron}-${member.rank}-${member.lastName}-${member.firstName}-${member.flight}`
      : `${member.rank}-${member.lastName}-${member.firstName}-${member.flight}`
  )}`;

const getAttendanceAliases = (
  member: Pick<Member, 'id' | 'rank' | 'firstName' | 'lastName' | 'flight'> & Partial<Pick<Member, 'squadron'>>
) => {
  const aliases = new Set<string>([member.id]);
  aliases.add(buildLegacyRosterId(member));
  aliases.add(buildLegacyRosterId(member, true));
  return aliases;
};

const formatNumber = (value: number, maximumFractionDigits = 2) =>
  value.toLocaleString('en-US', {
    maximumFractionDigits,
    minimumFractionDigits: value % 1 === 0 ? 0 : Math.min(1, maximumFractionDigits),
  });

const formatDistance = (value: number) => `${formatNumber(value)} mi`;
const formatMinutes = (value: number) => `${formatNumber(value)} min`;
const formatWeight = (value: number) => `${formatNumber(value)} lb`;
const formatReps = (value: number) => `${Math.round(value)} reps`;
const formatSets = (value: number) => `${Math.round(value)} sets`;
const formatRounds = (value: number) => `${Math.round(value)} rounds`;
const formatFeet = (value: number) => `${formatNumber(value)} ft`;
const formatSteps = (value: number) => `${Math.round(value).toLocaleString()} steps`;
const formatPace = (value: number) => `${formatNumber(value)} min/mi`;
const formatSpeed = (value: number) => `${formatNumber(value)} mph`;
const formatHeartRate = (value: number) => `${formatNumber(value)} bpm`;
const formatCalories = (value: number) => `${formatNumber(value)} cal`;

const normalizeWorkoutType = (type: WorkoutType): WorkoutType => (type === 'Strength' ? 'Weightlifting' : type);
const getWorkoutSubtype = (workout: Workout) => workout.metrics?.subtype?.trim() || undefined;
const getWorkoutIntent = (workout: Workout): WorkoutIntent => (workout.metrics?.intent as WorkoutIntent | undefined) ?? 'Other';

const getWorkoutTypeLabel = (type: WorkoutType, subtype?: string) => {
  const normalizedType = normalizeWorkoutType(type);
  if (normalizedType === 'Weightlifting' && subtype) {
    return `${normalizedType} • ${subtype}`;
  }
  return normalizedType;
};

const getIntentBucketLabel = (typeLabel: string, intent: WorkoutIntent) => (
  intent === 'Other' ? `${typeLabel}` : `${intent} ${typeLabel}`
);

const getWorkoutMinutes = (workout: Workout) => workout.duration + ((workout.durationSeconds ?? 0) / 60);
const getWorkoutDistance = (workout: Workout) => workout.distance ?? workout.metrics?.distance;

const getWorkoutPace = (workout: Workout) => {
  const distance = getWorkoutDistance(workout);
  const minutes = getWorkoutMinutes(workout);
  if (!(typeof distance === 'number' && distance > 0) || !(minutes > 0)) {
    return undefined;
  }
  return minutes / distance;
};

const getWorkoutSpeed = (workout: Workout) => {
  const distance = getWorkoutDistance(workout);
  const hours = getWorkoutMinutes(workout) / 60;
  if (!(typeof distance === 'number' && distance > 0) || !(hours > 0)) {
    return undefined;
  }
  return distance / hours;
};

const getWeightliftingVolume = (workout: Workout) => {
  const weight = workout.metrics?.weight ?? 0;
  const reps = workout.metrics?.reps ?? 0;
  const sets = workout.metrics?.sets ?? 1;
  return weight > 0 && reps > 0 ? weight * reps * Math.max(1, sets) : undefined;
};

const isPFRAWorkout = (workout: Workout) =>
  workout.source === 'pfra' && typeof workout.metrics?.pfraScore === 'number' && Number.isFinite(workout.metrics.pfraScore);

const getWorkoutSessionKey = (workout: Workout) =>
  workout.sessionId ||
  workout.externalId ||
  `${workout.date}:${normalizeWorkoutType(workout.type)}:${getWorkoutSubtype(workout) ?? workout.id}`;

const getWeekKey = (dateValue: string) => {
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }
  const weekStart = new Date(date);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  return weekStart.toISOString().slice(0, 10);
};

const getWorkoutScoreKeyInfo = (workout: Workout): WorkoutScoreKeyInfo => {
  const type = normalizeWorkoutType(workout.type);
  const subtype = type === 'Weightlifting' ? getWorkoutSubtype(workout) ?? 'General' : undefined;
  const intent = getWorkoutIntent(workout);
  const analyticsLabel = getWorkoutTypeLabel(type, subtype);
  const analyticsKey = subtype ? `${type}:${slugify(subtype)}` : type;
  const bucketLabel = getIntentBucketLabel(analyticsLabel, intent);
  return {
    type,
    subtype,
    intent,
    key: subtype ? `${type}:${slugify(subtype)}:${slugify(intent)}` : `${type}:${slugify(intent)}`,
    label: bucketLabel,
    analyticsKey,
    analyticsLabel,
  };
};

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

const getBaselineWorkouts = (relevantHistory: Workout[]) => {
  if (relevantHistory.length === 0) return [];
  if (relevantHistory.length <= 2) return relevantHistory.slice(-relevantHistory.length);
  return relevantHistory.slice(-Math.min(5, relevantHistory.length));
};

const getIntentEffortMultiplier = (group: BenchmarkGroup, intent: WorkoutIntent) => {
  switch (group) {
    case 'cardio':
      switch (intent) {
        case 'Recovery':
          return 0.7;
        case 'Tempo':
          return 0.85;
        case 'Intervals':
          return 0.75;
        case 'Endurance':
          return 1;
        default:
          return 0.9;
      }
    case 'strength':
      switch (intent) {
        case 'Recovery':
          return 0.6;
        case 'Power':
          return 0.75;
        case 'Strength':
          return 0.95;
        case 'Hypertrophy':
          return 1;
        default:
          return 0.9;
      }
    case 'session':
      switch (intent) {
        case 'Recovery':
          return 0.7;
        case 'Skills':
          return 0.8;
        case 'Competition':
          return 1.1;
        case 'Conditioning':
          return 1;
        default:
          return 0.9;
      }
    case 'general':
    default:
      switch (intent) {
        case 'Recovery':
          return 1;
        default:
          return 0.9;
      }
  }
};

const numericMetric = (
  key: string,
  label: string,
  weight: number,
  direction: MetricDirection,
  getter: (workout: Workout) => number | undefined,
  formatValue?: (value: number) => string
): MetricDescriptor => ({
  key,
  label,
  weight,
  direction,
  getValue: getter,
  formatValue,
});

const effortMetric = (
  key: string,
  label: string,
  weight: number,
  direction: MetricDirection,
  benchmarkGroup: BenchmarkGroup,
  benchmarkBaseValue: number,
  getter: (workout: Workout) => number | undefined,
  formatValue?: (value: number) => string
): EffortMetricDescriptor => ({
  key,
  label,
  weight,
  direction,
  benchmarkGroup,
  benchmarkBaseValue,
  getValue: getter,
  formatValue,
});

const getEffortMetricDescriptors = (workout: Workout): EffortMetricDescriptor[] => {
  const type = normalizeWorkoutType(workout.type);
  switch (type) {
    case 'Running':
      return [
        effortMetric('distance', 'Distance', 0.6, 'higher', 'cardio', 3, (candidate) => getWorkoutDistance(candidate), formatDistance),
        effortMetric('duration', 'Duration', 0.4, 'higher', 'cardio', 30, getWorkoutMinutes, formatMinutes),
      ];
    case 'Walking':
      return [
        effortMetric('distance', 'Distance', 0.6, 'higher', 'cardio', 1.8, (candidate) => getWorkoutDistance(candidate), formatDistance),
        effortMetric('duration', 'Duration', 0.4, 'higher', 'cardio', 35, getWorkoutMinutes, formatMinutes),
      ];
    case 'Hiking':
      return [
        effortMetric('distance', 'Distance', 0.4, 'higher', 'cardio', 3, (candidate) => getWorkoutDistance(candidate), formatDistance),
        effortMetric('duration', 'Duration', 0.2, 'higher', 'cardio', 60, getWorkoutMinutes, formatMinutes),
        effortMetric('elevationGain', 'Vertical Gain', 0.25, 'higher', 'cardio', 500, (candidate) => candidate.metrics?.elevationGain, formatFeet),
        effortMetric('steps', 'Steps', 0.15, 'higher', 'cardio', 6500, (candidate) => candidate.metrics?.steps, formatSteps),
      ];
    case 'Rucking':
      return [
        effortMetric('distance', 'Distance', 0.35, 'higher', 'cardio', 3, (candidate) => getWorkoutDistance(candidate), formatDistance),
        effortMetric('duration', 'Duration', 0.2, 'higher', 'cardio', 45, getWorkoutMinutes, formatMinutes),
        effortMetric('weight', 'Ruck Weight', 0.45, 'higher', 'cardio', 35, (candidate) => candidate.metrics?.weight, formatWeight),
      ];
    case 'Cycling':
      return [
        effortMetric('distance', 'Distance', 0.6, 'higher', 'cardio', 10, (candidate) => getWorkoutDistance(candidate), formatDistance),
        effortMetric('duration', 'Duration', 0.4, 'higher', 'cardio', 30, getWorkoutMinutes, formatMinutes),
      ];
    case 'Swimming':
      return [
        effortMetric('distance', 'Distance', 0.65, 'higher', 'cardio', 0.5, (candidate) => getWorkoutDistance(candidate), formatDistance),
        effortMetric('duration', 'Duration', 0.35, 'higher', 'cardio', 30, getWorkoutMinutes, formatMinutes),
      ];
    case 'Weightlifting':
      return [
        effortMetric('volume', 'Volume', 0.5, 'higher', 'strength', 1500, getWeightliftingVolume, formatWeight),
        effortMetric('weight', 'Weight', 0.3, 'higher', 'strength', 135, (candidate) => candidate.metrics?.weight, formatWeight),
        effortMetric('sets', 'Sets', 0.2, 'higher', 'strength', 4, (candidate) => candidate.metrics?.sets, formatSets),
      ];
    case 'HIIT':
      return [
        effortMetric('duration', 'Duration', 0.5, 'higher', 'session', 25, getWorkoutMinutes, formatMinutes),
        effortMetric('rounds', 'Rounds', 0.5, 'higher', 'session', 6, (candidate) => candidate.metrics?.rounds, formatRounds),
      ];
    case 'Sports':
      return [
        effortMetric('duration', 'Duration', 0.7, 'higher', 'session', 45, getWorkoutMinutes, formatMinutes),
        effortMetric('distance', 'Distance', 0.3, 'higher', 'session', 2, (candidate) => getWorkoutDistance(candidate), formatDistance),
      ];
    case 'Cardio':
      return [
        effortMetric('duration', 'Duration', 0.7, 'higher', 'cardio', 30, getWorkoutMinutes, formatMinutes),
        effortMetric('distance', 'Distance', 0.3, 'higher', 'cardio', 2, (candidate) => getWorkoutDistance(candidate), formatDistance),
      ];
    case 'Flexibility':
      return [
        effortMetric('duration', 'Duration', 1, 'higher', 'general', 30, getWorkoutMinutes, formatMinutes),
      ];
    case 'Climbing':
      return [
        effortMetric('verticalGain', 'Vertical Gain', 0.7, 'higher', 'session', 800, (candidate) => candidate.metrics?.elevationGain, formatFeet),
        effortMetric('duration', 'Duration', 0.3, 'higher', 'session', 45, getWorkoutMinutes, formatMinutes),
      ];
    case 'Surfing':
      return [
        effortMetric('duration', 'Duration', 1, 'higher', 'cardio', 45, getWorkoutMinutes, formatMinutes),
      ];
    case 'Diving':
      return [
        effortMetric('depth', 'Depth', 0.5, 'higher', 'session', 40, (candidate) => candidate.metrics?.depth, formatFeet),
        effortMetric('duration', 'Duration', 0.5, 'higher', 'session', 35, getWorkoutMinutes, formatMinutes),
      ];
    case 'Combatives':
      return [
        effortMetric('duration', 'Duration', 0.5, 'higher', 'session', 45, getWorkoutMinutes, formatMinutes),
        effortMetric('rounds', 'Rounds', 0.5, 'higher', 'session', 6, (candidate) => candidate.metrics?.rounds, formatRounds),
      ];
    case 'Other':
    default:
      return [
        effortMetric('duration', 'Duration', 0.35, 'higher', 'general', 30, getWorkoutMinutes, formatMinutes),
        effortMetric('distance', 'Distance', 0.2, 'higher', 'general', 2, (candidate) => getWorkoutDistance(candidate), formatDistance),
        effortMetric('steps', 'Steps', 0.15, 'higher', 'general', 5000, (candidate) => candidate.metrics?.steps, formatSteps),
        effortMetric('averageHeartRate', 'Avg Heart Rate', 0.1, 'higher', 'general', 130, (candidate) => candidate.metrics?.averageHeartRate, formatHeartRate),
        effortMetric('caloriesBurned', 'Calories Burned', 0.1, 'higher', 'general', 300, (candidate) => candidate.metrics?.caloriesBurned, formatCalories),
        effortMetric('elevationGain', 'Elevation Gain', 0.1, 'higher', 'general', 200, (candidate) => candidate.metrics?.elevationGain, formatFeet),
      ];
  }
};

const getComparisonMetricDescriptors = (workout: Workout): MetricDescriptor[] => {
  const type = normalizeWorkoutType(workout.type);
  switch (type) {
    case 'Running':
    case 'Walking':
      return [
        numericMetric('distance', 'Distance', 0.45, 'higher', (candidate) => getWorkoutDistance(candidate), formatDistance),
        numericMetric('pace', 'Pace', 0.55, 'lower', getWorkoutPace, formatPace),
      ];
    case 'Hiking':
      return [
        numericMetric('distance', 'Distance', 0.35, 'higher', (candidate) => getWorkoutDistance(candidate), formatDistance),
        numericMetric('pace', 'Pace', 0.35, 'lower', getWorkoutPace, formatPace),
        numericMetric('elevationGain', 'Vertical Gain', 0.2, 'higher', (candidate) => candidate.metrics?.elevationGain, formatFeet),
        numericMetric('steps', 'Steps', 0.1, 'higher', (candidate) => candidate.metrics?.steps, formatSteps),
      ];
    case 'Rucking':
      return [
        numericMetric('distance', 'Distance', 0.25, 'higher', (candidate) => getWorkoutDistance(candidate), formatDistance),
        numericMetric('pace', 'Pace', 0.35, 'lower', getWorkoutPace, formatPace),
        numericMetric('weight', 'Ruck Weight', 0.4, 'higher', (candidate) => candidate.metrics?.weight, formatWeight),
      ];
    case 'Cycling':
      return [
        numericMetric('distance', 'Distance', 0.35, 'higher', (candidate) => getWorkoutDistance(candidate), formatDistance),
        numericMetric('speed', 'Speed', 0.65, 'higher', getWorkoutSpeed, formatSpeed),
      ];
    case 'Swimming':
      return [
        numericMetric('distance', 'Distance', 0.35, 'higher', (candidate) => getWorkoutDistance(candidate), formatDistance),
        numericMetric('pace', 'Pace', 0.65, 'lower', getWorkoutPace, formatPace),
      ];
    case 'Weightlifting':
      return [
        numericMetric('weight', 'Weight', 0.35, 'higher', (candidate) => candidate.metrics?.weight, formatWeight),
        numericMetric('volume', 'Volume', 0.45, 'higher', getWeightliftingVolume, formatWeight),
        numericMetric('sets', 'Sets', 0.2, 'higher', (candidate) => candidate.metrics?.sets, formatSets),
      ];
    case 'HIIT':
    case 'Combatives':
      return [
        numericMetric('duration', 'Duration', 0.35, 'higher', getWorkoutMinutes, formatMinutes),
        numericMetric('rounds', 'Rounds', 0.65, 'higher', (candidate) => candidate.metrics?.rounds, formatRounds),
      ];
    case 'Climbing':
      return [
        numericMetric('elevationGain', 'Vertical Gain', 0.7, 'higher', (candidate) => candidate.metrics?.elevationGain, formatFeet),
        numericMetric('duration', 'Duration', 0.3, 'higher', getWorkoutMinutes, formatMinutes),
      ];
    case 'Diving':
      return [
        numericMetric('depth', 'Depth', 0.6, 'higher', (candidate) => candidate.metrics?.depth, formatFeet),
        numericMetric('duration', 'Duration', 0.4, 'higher', getWorkoutMinutes, formatMinutes),
      ];
    case 'Sports':
    case 'Cardio':
      return [
        numericMetric('duration', 'Duration', 0.6, 'higher', getWorkoutMinutes, formatMinutes),
        numericMetric('distance', 'Distance', 0.4, 'higher', (candidate) => getWorkoutDistance(candidate), formatDistance),
      ];
    case 'Flexibility':
    case 'Other':
      return [
        numericMetric('duration', 'Duration', 0.35, 'higher', getWorkoutMinutes, formatMinutes),
        numericMetric('distance', 'Distance', 0.2, 'higher', (candidate) => getWorkoutDistance(candidate), formatDistance),
        numericMetric('steps', 'Steps', 0.15, 'higher', (candidate) => candidate.metrics?.steps, formatSteps),
        numericMetric('averageHeartRate', 'Avg Heart Rate', 0.1, 'higher', (candidate) => candidate.metrics?.averageHeartRate, formatHeartRate),
        numericMetric('caloriesBurned', 'Calories Burned', 0.1, 'higher', (candidate) => candidate.metrics?.caloriesBurned, formatCalories),
        numericMetric('elevationGain', 'Elevation Gain', 0.1, 'higher', (candidate) => candidate.metrics?.elevationGain, formatFeet),
      ];
    case 'Surfing':
    default:
      return [
        numericMetric('duration', 'Duration', 1, 'higher', getWorkoutMinutes, formatMinutes),
      ];
  }
};

const isWorkoutScoreEngineWorkout = (workout: Workout) =>
  normalizeWorkoutType(workout.type) !== 'Other' &&
  workout.source !== 'attendance' &&
  workout.date >= WORKOUT_SCORE_ENGINE_ROLLOUT_DATE;

const getLegacyWorkoutPoints = (workout: Workout) => {
  if (isPFRAWorkout(workout)) {
    return Math.max(0, workout.metrics?.pfraScore ?? 0);
  }

  if (workout.source === 'attendance') {
    return ATTENDANCE_CHECK_IN_POINTS;
  }

  const durationPoints = Math.max(0, Math.round(workout.duration));
  const distancePoints = Math.max(0, Math.round((workout.distance ?? 0) * 15));
  return Math.max(durationPoints, distancePoints);
};

const buildLegacyBreakdown = (workout: Workout): WorkoutScoreBreakdown => {
  const typeLabel = getWorkoutTypeLabel(workout.type, getWorkoutSubtype(workout));
  const pfraScore = workout.metrics?.pfraScore ?? 0;
  const precisePFRA = formatNumber(pfraScore);
  const roundedPFRA = Math.round(pfraScore);
  return {
    engine: 'legacy',
    type: normalizeWorkoutType(workout.type),
    subtype: getWorkoutSubtype(workout),
    intent: getWorkoutIntent(workout),
    typeLabel,
    analyticsKey: typeLabel,
    analyticsLabel: typeLabel,
    finalPoints: isPFRAWorkout(workout) ? roundedPFRA : getLegacyWorkoutPoints(workout),
    preciseFinalPoints: isPFRAWorkout(workout) ? pfraScore : getLegacyWorkoutPoints(workout),
    workoutPoints: isPFRAWorkout(workout) ? pfraScore : getLegacyWorkoutPoints(workout),
    effortScore: isPFRAWorkout(workout) ? pfraScore : getLegacyWorkoutPoints(workout),
    intentMatchScore: 0,
    consistencyBonus: 0,
    improvementBonus: 0,
    weeklySessionCount: 0,
    metricScore: 0,
    baselineSampleSize: 0,
    baselineLabel: isPFRAWorkout(workout) ? 'Recorded PFRA assessment' : 'Legacy scoring',
    comparedToLabel: isPFRAWorkout(workout) ? 'PFRA assessment score' : 'Legacy points model',
    metrics: [],
    effortMetrics: [],
    explanation: isPFRAWorkout(workout)
      ? `Latest session: ${precisePFRA} pts = PFRA overall score ${precisePFRA} → leaderboard points ${roundedPFRA}`
      : workout.source === 'attendance'
      ? `Latest session: ${ATTENDANCE_CHECK_IN_POINTS} pts = attendance check-in`
      : `Latest session: ${getLegacyWorkoutPoints(workout)} pts = max(duration ${Math.round(workout.duration)} min → ${Math.max(0, Math.round(workout.duration))} pts, distance ${(workout.distance ?? 0).toFixed(2)} mi × 15 = ${Math.max(0, Math.round((workout.distance ?? 0) * 15))} pts)`,
  };
};

const formatMetricRatio = (ratio: number) => `${ratio.toFixed(2)}x`;

const createMetricDetail = (
  descriptor: MetricDescriptor,
  currentValue: number,
  baselineValue: number,
  ratio: number,
  normalizedWeight: number
): WorkoutScoreMetricDetail => ({
  key: descriptor.key,
  label: descriptor.label,
  weight: normalizedWeight,
  direction: descriptor.direction,
  currentValue,
  baselineValue,
  ratio,
  currentDisplay: descriptor.formatValue?.(currentValue) ?? formatNumber(currentValue),
  baselineDisplay: descriptor.formatValue?.(baselineValue) ?? formatNumber(baselineValue),
});

const getWeightedMetricAverages = (
  workout: Workout,
  baselineWorkouts: Workout[],
  descriptors: MetricDescriptor[]
) => {
  const usable = descriptors
    .map((descriptor) => {
      const currentValue = descriptor.getValue(workout);
      const baselineValues = baselineWorkouts
        .map((item) => descriptor.getValue(item))
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
      const baselineValue = baselineValues.length > 0 ? average(baselineValues) : undefined;
      if (!(typeof currentValue === 'number' && Number.isFinite(currentValue) && currentValue > 0) || !(baselineValue && baselineValue > 0)) {
        return null;
      }
      return {
        descriptor,
        currentValue,
        baselineValue,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const totalWeight = usable.reduce((sum, item) => sum + item.descriptor.weight, 0) || 1;

  return usable.map((item) => ({
    ...item,
    normalizedWeight: item.descriptor.weight / totalWeight,
  }));
};

const getEffortScoreMetrics = (workout: Workout, intent: WorkoutIntent) => {
  const descriptors = getEffortMetricDescriptors(workout);
  const usable = descriptors
    .map((descriptor) => {
      const currentValue = descriptor.getValue(workout);
      const benchmarkValue = descriptor.benchmarkBaseValue * getIntentEffortMultiplier(descriptor.benchmarkGroup, intent);
      if (!(typeof currentValue === 'number' && Number.isFinite(currentValue) && currentValue > 0) || !(benchmarkValue > 0)) {
        return null;
      }
      const rawRatio = descriptor.direction === 'higher'
        ? currentValue / benchmarkValue
        : benchmarkValue / currentValue;
      const ratio = clamp(rawRatio, 0.6, 1.4);
      return {
        descriptor,
        currentValue,
        baselineValue: benchmarkValue,
        ratio,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const totalWeight = usable.reduce((sum, item) => sum + item.descriptor.weight, 0) || 1;
  const normalized = usable.map((item) => ({
    ...item,
    normalizedWeight: item.descriptor.weight / totalWeight,
  }));
  const effortIndex = normalized.reduce((sum, item) => sum + (item.normalizedWeight * item.ratio), 0);
  const effortScore = clamp(22 + ((effortIndex - 1) * 35), 12, 60);

  return {
    effortIndex,
    effortScore,
    metrics: normalized.map((item) => createMetricDetail(item.descriptor, item.currentValue, item.baselineValue, item.ratio, item.normalizedWeight)),
  };
};

const getLog2 = (value: number) => Math.log(value) / Math.log(2);

const buildIntentAndImprovement = (workout: Workout, baselineContext: BaselineContext) => {
  const metrics = getWeightedMetricAverages(workout, baselineContext.workouts, getComparisonMetricDescriptors(workout));
  if (metrics.length === 0) {
    return {
      similarity: 0,
      intentMatchScore: baselineContext.bucket === 'exact_intent' ? 5 : 4,
      improvementRatio: 1,
      improvementBonus: 0,
      metrics: [] as WorkoutScoreMetricDetail[],
    };
  }

  const similarity = metrics.reduce((sum, item) => {
    const closeness = clamp(1 - Math.abs(getLog2(item.currentValue / item.baselineValue)), 0, 1);
    return sum + (item.normalizedWeight * closeness);
  }, 0);

  const directionAwareRatio = metrics.reduce((sum, item) => {
    const ratio = item.descriptor.direction === 'higher'
      ? item.currentValue / item.baselineValue
      : item.baselineValue / item.currentValue;
    return sum + (item.normalizedWeight * clamp(ratio, 0.75, 1.35));
  }, 0);

  const intentMatchScore = baselineContext.bucket === 'exact_intent'
    ? clamp(5 + (10 * similarity), 0, 15)
    : clamp(4 + (6 * similarity), 0, 10);
  const improvementBonus = clamp((directionAwareRatio - 1) * 40, 0, MAX_IMPROVEMENT_BONUS);

  return {
    similarity,
    intentMatchScore,
    improvementRatio: directionAwareRatio,
    improvementBonus,
    metrics: metrics.map((item) => {
      const ratio = item.descriptor.direction === 'higher'
        ? item.currentValue / item.baselineValue
        : item.baselineValue / item.currentValue;
      return createMetricDetail(item.descriptor, item.currentValue, item.baselineValue, ratio, item.normalizedWeight);
    }),
  };
};

const buildScoreExplanation = (breakdown: WorkoutScoreBreakdown) => {
  const precisePointsLabel = breakdown.preciseFinalPoints.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (breakdown.engine === 'legacy') {
    return breakdown.explanation;
  }

  if (breakdown.baselineSampleSize === 0) {
    return `Latest session: ${precisePointsLabel} pts = first logged ${breakdown.comparedToLabel} workout bucket starts at ${FIRST_WORKOUT_POINTS} pts`;
  }

  const effortBreakdown = breakdown.effortMetrics
    .map((metric) =>
      `${metric.label} (${Math.round(metric.weight * 100)}% × ${formatMetricRatio(metric.ratio)} from ${metric.currentDisplay} vs ${metric.baselineDisplay})`
    )
    .join(' • ');

  return `Latest session: ${precisePointsLabel} pts = ${breakdown.effortScore.toLocaleString('en-US', { maximumFractionDigits: 1 })} effort from ${effortBreakdown} + ${breakdown.intentMatchScore.toLocaleString('en-US', { maximumFractionDigits: 1 })} intensity match + ${breakdown.consistencyBonus.toLocaleString('en-US', { maximumFractionDigits: 1 })} consistency + ${breakdown.improvementBonus.toLocaleString('en-US', { maximumFractionDigits: 1 })} improvement`;
};

const matchesWeightliftingSubtype = (targetSubtype: string | undefined, candidateSubtype: string | undefined) => {
  if (!targetSubtype) {
    return true;
  }
  if (targetSubtype === 'General') {
    return (candidateSubtype ?? 'General') === 'General';
  }
  return candidateSubtype === targetSubtype || (candidateSubtype ?? 'General') === 'General';
};

const getBaselineContext = (priorWorkouts: Workout[], scoreInfo: WorkoutScoreKeyInfo): BaselineContext => {
  const normalizedPrior = priorWorkouts.filter((workout) => normalizeWorkoutType(workout.type) === scoreInfo.type);
  const subtypeMatched = normalizedPrior.filter((workout) => matchesWeightliftingSubtype(scoreInfo.subtype, getWorkoutSubtype(workout)));
  const exactIntent = subtypeMatched.filter((workout) => getWorkoutIntent(workout) === scoreInfo.intent);

  const exactBaseline = getBaselineWorkouts(exactIntent);
  if (exactBaseline.length > 0) {
    return {
      workouts: exactBaseline,
      bucket: 'exact_intent',
      label: `Last ${exactBaseline.length} similar ${getIntentBucketLabel(scoreInfo.analyticsLabel, scoreInfo.intent)} ${exactBaseline.length === 1 ? 'workout' : 'workouts'}`,
    };
  }

  const fallbackBaseline = getBaselineWorkouts(subtypeMatched);
  if (fallbackBaseline.length > 0) {
    return {
      workouts: fallbackBaseline,
      bucket: 'type_fallback',
      label: `Last ${fallbackBaseline.length} ${scoreInfo.analyticsLabel} ${fallbackBaseline.length === 1 ? 'workout' : 'workouts'} (all intents)`,
    };
  }

  return {
    workouts: [],
    bucket: 'none',
    label: `First ${scoreInfo.analyticsLabel} workout`,
  };
};

function buildScoredWorkoutEntries(
  member: Pick<Member, 'id' | 'rank' | 'firstName' | 'lastName' | 'flight' | 'workouts' | 'fitnessAssessments'>,
  ptSessions: Array<Pick<PTSession, 'id' | 'date' | 'flight' | 'attendees'> & { attendeeSources?: PTSession['attendeeSources'] }> = [],
  previewWorkouts: Workout[] = []
): ScoredWorkoutEntry[] {
  const previewRealWorkoutDates = new Set(
    previewWorkouts.filter((workout) => workout.source !== 'attendance').map((workout) => workout.date)
  );
  const effectiveWorkouts = [
    ...getMemberEffectiveWorkouts(member, ptSessions).filter(
      (workout) => !(workout.source === 'attendance' && previewRealWorkoutDates.has(workout.date))
    ),
    ...previewWorkouts,
  ];

  const sessionGroups = new Map<string, Workout[]>();
  effectiveWorkouts
    .sort((left, right) => {
      if (left.date !== right.date) {
        return left.date.localeCompare(right.date);
      }
      return getWorkoutSessionKey(left).localeCompare(getWorkoutSessionKey(right));
    })
    .forEach((workout) => {
      const sessionKey = `${workout.date}:${getWorkoutSessionKey(workout)}`;
      const current = sessionGroups.get(sessionKey) ?? [];
      current.push(workout);
      sessionGroups.set(sessionKey, current);
    });

  const scoredEntries: ScoredWorkoutEntry[] = [];
  const priorHistory: Workout[] = [];
  const seenWeeklySessions = new Map<string, Set<string>>();

  Array.from(sessionGroups.entries()).forEach(([sessionGroupKey, sessionWorkouts]) => {
    const sessionKey = sessionGroupKey.split(':').slice(1).join(':');
    const weekKey = getWeekKey(sessionWorkouts[0]?.date ?? '');
    const weeklySessions = seenWeeklySessions.get(weekKey) ?? new Set<string>();
    const isWorkoutSession = sessionWorkouts.some((workout) => workout.source !== 'attendance');
    const currentWeeklySessionCount = isWorkoutSession
      ? (weeklySessions.has(sessionKey) ? weeklySessions.size : weeklySessions.size + 1)
      : weeklySessions.size;

    const scoredSessionCandidates = sessionWorkouts.map((workout) => {
      const scoreInfo = getWorkoutScoreKeyInfo(workout);

      if (isPFRAWorkout(workout) || !isWorkoutScoreEngineWorkout(workout)) {
        return {
          workout,
          scoreKey: scoreInfo.key,
          scoreLabel: scoreInfo.analyticsLabel,
          points: getLegacyWorkoutPoints(workout),
          breakdown: buildLegacyBreakdown(workout),
          hasHistoricalBaseline: false,
        };
      }

      const baselineContext = getBaselineContext(
        priorHistory.filter((item) => item.source !== 'attendance' && item.source !== 'pfra'),
        scoreInfo
      );
      if (baselineContext.bucket === 'none' || baselineContext.workouts.length === 0) {
        const breakdown: WorkoutScoreBreakdown = {
          engine: 'leaderboard_score_engine',
          type: scoreInfo.type,
          subtype: scoreInfo.subtype,
          intent: scoreInfo.intent,
          typeLabel: scoreInfo.analyticsLabel,
          analyticsKey: scoreInfo.analyticsKey,
          analyticsLabel: scoreInfo.analyticsLabel,
          finalPoints: FIRST_WORKOUT_POINTS,
          preciseFinalPoints: FIRST_WORKOUT_POINTS,
          workoutPoints: FIRST_WORKOUT_POINTS,
          effortScore: FIRST_WORKOUT_POINTS,
          intentMatchScore: 0,
          consistencyBonus: 0,
          improvementBonus: 0,
          weeklySessionCount: 1,
          metricScore: 1,
          baselineSampleSize: 0,
          baselineLabel: 'First workout of this type and intent',
          comparedToLabel: getIntentBucketLabel(scoreInfo.analyticsLabel, scoreInfo.intent),
          metrics: [],
          effortMetrics: [],
          explanation: '',
        };
        breakdown.explanation = buildScoreExplanation(breakdown);
        return {
          workout,
          scoreKey: scoreInfo.key,
          scoreLabel: scoreInfo.analyticsLabel,
          points: breakdown.finalPoints,
          breakdown,
          hasHistoricalBaseline: false,
        };
      }

      const effort = getEffortScoreMetrics(workout, scoreInfo.intent);
      const comparison = buildIntentAndImprovement(workout, baselineContext);
      const workoutPoints = effort.effortScore + comparison.intentMatchScore + comparison.improvementBonus;

      const breakdown: WorkoutScoreBreakdown = {
        engine: 'leaderboard_score_engine',
        type: scoreInfo.type,
        subtype: scoreInfo.subtype,
        intent: scoreInfo.intent,
        typeLabel: scoreInfo.analyticsLabel,
        analyticsKey: scoreInfo.analyticsKey,
        analyticsLabel: scoreInfo.analyticsLabel,
        finalPoints: workoutPoints,
        preciseFinalPoints: workoutPoints,
        workoutPoints,
        effortScore: effort.effortScore,
        intentMatchScore: comparison.intentMatchScore,
        consistencyBonus: 0,
        improvementBonus: comparison.improvementBonus,
        weeklySessionCount: currentWeeklySessionCount,
        metricScore: effort.effortIndex,
        baselineSampleSize: baselineContext.workouts.length,
        baselineLabel: baselineContext.label,
        comparedToLabel: getIntentBucketLabel(scoreInfo.analyticsLabel, scoreInfo.intent),
        metrics: comparison.metrics,
        effortMetrics: effort.metrics,
        explanation: '',
      };
      breakdown.explanation = buildScoreExplanation(breakdown);

      return {
        workout,
        scoreKey: scoreInfo.key,
        scoreLabel: scoreInfo.analyticsLabel,
        points: workoutPoints,
        breakdown,
        hasHistoricalBaseline: true,
      };
    });

    const eligibleConsistencyCandidates = scoredSessionCandidates.filter(
      (candidate) => candidate.breakdown.engine === 'leaderboard_score_engine' && candidate.hasHistoricalBaseline
    );

    if (eligibleConsistencyCandidates.length > 0) {
      const consistencyShare = Math.min(currentWeeklySessionCount * 2, MAX_CONSISTENCY_BONUS) / eligibleConsistencyCandidates.length;
      eligibleConsistencyCandidates.forEach((candidate) => {
        candidate.breakdown.consistencyBonus = consistencyShare;
        candidate.breakdown.preciseFinalPoints = clamp(
          candidate.breakdown.workoutPoints + consistencyShare,
          FIRST_WORKOUT_POINTS,
          MAX_FINAL_POINTS
        );
        candidate.breakdown.finalPoints = candidate.breakdown.preciseFinalPoints;
        candidate.breakdown.explanation = buildScoreExplanation(candidate.breakdown);
        candidate.points = candidate.breakdown.finalPoints;
      });
    }

    scoredSessionCandidates.forEach((candidate) => {
      const roundedPoints = Math.round(candidate.points);
      candidate.breakdown.finalPoints = roundedPoints;
      scoredEntries.push({
        workout: candidate.workout,
        scoreKey: candidate.scoreKey,
        scoreLabel: candidate.scoreLabel,
        points: roundedPoints,
        breakdown: {
          ...candidate.breakdown,
          finalPoints: roundedPoints,
        },
      });
      priorHistory.push(candidate.workout);
    });

    if (isWorkoutSession) {
      weeklySessions.add(sessionKey);
      seenWeeklySessions.set(weekKey, weeklySessions);
    }
  });

  return scoredEntries;
}

export function getWorkoutScoreHistory(
  member: Pick<Member, 'id' | 'rank' | 'firstName' | 'lastName' | 'flight' | 'workouts' | 'fitnessAssessments'>,
  ptSessions: Array<Pick<PTSession, 'id' | 'date' | 'flight' | 'attendees'> & { attendeeSources?: PTSession['attendeeSources'] }> = []
): ScoredWorkoutEntry[] {
  return buildScoredWorkoutEntries(member, ptSessions);
}

export function estimateWorkoutSessionScore(params: {
  member: Pick<Member, 'id' | 'rank' | 'firstName' | 'lastName' | 'flight' | 'workouts' | 'fitnessAssessments'>;
  ptSessions?: Array<Pick<PTSession, 'id' | 'date' | 'flight' | 'attendees'> & { attendeeSources?: PTSession['attendeeSources'] }>;
  previewWorkouts: Workout[];
}) {
  if (params.previewWorkouts.length === 0) {
    return null;
  }

  const scoredEntries = buildScoredWorkoutEntries(params.member, params.ptSessions ?? [], params.previewWorkouts);
  const previewIds = new Set(params.previewWorkouts.map((workout) => workout.id));
  const previewEntries = scoredEntries.filter((entry) => previewIds.has(entry.workout.id));
  if (previewEntries.length === 0) {
    return null;
  }

  const breakdown = previewEntries.reduce(
    (summary, entry) => ({
      effortScore: summary.effortScore + entry.breakdown.effortScore,
      intentMatchScore: summary.intentMatchScore + entry.breakdown.intentMatchScore,
      consistencyBonus: summary.consistencyBonus + entry.breakdown.consistencyBonus,
      improvementBonus: summary.improvementBonus + entry.breakdown.improvementBonus,
    }),
    { effortScore: 0, intentMatchScore: 0, consistencyBonus: 0, improvementBonus: 0 }
  );
  const primaryEntry = previewEntries[0];
  const comparedToLabel = previewEntries.length === 1
    ? primaryEntry.breakdown.comparedToLabel
    : 'Mixed workout session';
  const comparisonDetail = previewEntries.length === 1
    ? primaryEntry.breakdown.baselineLabel
    : 'Each selected workout type is compared to the last up to 5 similar workouts for that type, subtype, and intent.';
  const tipMetric = primaryEntry.breakdown.effortMetrics[0];
  const tip = tipMetric
    ? `Next time: More ${tipMetric.label.toLowerCase()} or stronger ${primaryEntry.breakdown.intent?.toLowerCase() ?? 'similar'} output can increase your score.`
    : 'Next time: More output or stronger execution in this workout intent can increase your score.';

  return {
    totalPoints: previewEntries.reduce((sum, entry) => sum + entry.points, 0),
    maxPoints: MAX_FINAL_POINTS * previewEntries.length,
    breakdown: {
      effortScore: Number(breakdown.effortScore.toFixed(1)),
      intentMatchScore: Number(breakdown.intentMatchScore.toFixed(1)),
      consistencyBonus: Number(breakdown.consistencyBonus.toFixed(1)),
      improvementBonus: Number(breakdown.improvementBonus.toFixed(1)),
    },
    comparedToLabel,
    comparisonDetail,
    tip,
    entries: previewEntries,
  } as WorkoutSessionScorePreview;
}
