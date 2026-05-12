import type { Member, PTSession, Workout, WorkoutSegment, WorkoutType } from '@/lib/store';

export const WORKOUT_SCORE_ENGINE_NAME = 'Workout Score Engine';
export const WORKOUT_SCORE_ENGINE_ROLLOUT_DATE = '2026-05-11';
export const ATTENDANCE_CHECK_IN_POINTS = 10;

type MetricDirection = 'higher' | 'lower';

type MetricDescriptor = {
  key: string;
  label: string;
  weight: number;
  direction: MetricDirection;
  getValue: (workout: Workout) => number | undefined;
  formatValue?: (value: number) => string;
};

type WorkoutScoreKeyInfo = {
  type: WorkoutType;
  subtype?: string;
  key: string;
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
  engine: 'legacy' | 'workout_score_engine';
  type: WorkoutType;
  subtype?: string;
  typeLabel: string;
  finalPoints: number;
  workoutPoints: number;
  participationBonus: number;
  streakBonus: number;
  weeklySessionCount: number;
  metricScore: number;
  baselineSampleSize: number;
  baselineLabel: string;
  metrics: WorkoutScoreMetricDetail[];
  explanation: string;
};

export type ScoredWorkoutEntry = {
  workout: Workout;
  scoreKey: string;
  scoreLabel: string;
  points: number;
  breakdown: WorkoutScoreBreakdown;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const buildLegacyRosterId = (member: Pick<Member, 'rank' | 'firstName' | 'lastName' | 'flight'>) =>
  `roster-${slugify(`${member.rank}-${member.lastName}-${member.firstName}-${member.flight}`)}`;

const getAttendanceAliases = (member: Pick<Member, 'id' | 'rank' | 'firstName' | 'lastName' | 'flight'>) => {
  const aliases = new Set<string>([member.id]);
  aliases.add(buildLegacyRosterId(member));
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

const normalizeWorkoutType = (type: WorkoutType): WorkoutType => (type === 'Strength' ? 'Weightlifting' : type);

const getWorkoutSubtype = (workout: Workout) => workout.metrics?.subtype?.trim() || undefined;

const getWorkoutTypeLabel = (type: WorkoutType, subtype?: string) => {
  const normalizedType = normalizeWorkoutType(type);
  if (normalizedType === 'Weightlifting' && subtype) {
    return `${normalizedType} • ${subtype}`;
  }
  return normalizedType;
};

const getWorkoutMinutes = (workout: Workout) => workout.duration + ((workout.durationSeconds ?? 0) / 60);

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
  return {
    type,
    subtype,
    key: subtype ? `${type}:${slugify(subtype)}` : type,
    label: getWorkoutTypeLabel(type, subtype),
  };
};

const getWeightliftingGeneralKey = () => `${'Weightlifting'}:${slugify('General')}`;

const numericMetric =
  (
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

const getMetricDescriptors = (workout: Workout): MetricDescriptor[] => {
  const type = normalizeWorkoutType(workout.type);

  switch (type) {
    case 'Running':
    case 'Walking':
      return [
        numericMetric('distance', 'Distance', 0.55, 'higher', (candidate) => candidate.distance ?? candidate.metrics?.distance, formatDistance),
        numericMetric('duration', 'Duration', 0.45, 'higher', getWorkoutMinutes, formatMinutes),
      ];
    case 'Hiking':
      return [
        numericMetric('distance', 'Distance', 0.45, 'higher', (candidate) => candidate.distance ?? candidate.metrics?.distance, formatDistance),
        numericMetric('duration', 'Duration', 0.25, 'higher', getWorkoutMinutes, formatMinutes),
        numericMetric('elevationGain', 'Vertical Gain', 0.2, 'higher', (candidate) => candidate.metrics?.elevationGain, formatFeet),
        numericMetric('steps', 'Steps', 0.1, 'higher', (candidate) => candidate.metrics?.steps, formatSteps),
      ];
    case 'Rucking':
      return [
        numericMetric('distance', 'Distance', 0.4, 'higher', (candidate) => candidate.distance ?? candidate.metrics?.distance, formatDistance),
        numericMetric('duration', 'Duration', 0.25, 'higher', getWorkoutMinutes, formatMinutes),
        numericMetric('weight', 'Ruck Weight', 0.35, 'higher', (candidate) => candidate.metrics?.weight, formatWeight),
      ];
    case 'Cycling':
      return [
        numericMetric('distance', 'Distance', 0.6, 'higher', (candidate) => candidate.distance ?? candidate.metrics?.distance, formatDistance),
        numericMetric('duration', 'Duration', 0.4, 'higher', getWorkoutMinutes, formatMinutes),
      ];
    case 'Swimming':
      return [
        numericMetric('distance', 'Distance', 0.6, 'higher', (candidate) => candidate.distance ?? candidate.metrics?.distance, formatDistance),
        numericMetric('duration', 'Duration', 0.4, 'higher', getWorkoutMinutes, formatMinutes),
      ];
    case 'Weightlifting':
      return [
        numericMetric('weight', 'Weight', 0.45, 'higher', (candidate) => candidate.metrics?.weight, formatWeight),
        numericMetric(
          'volume',
          'Volume',
          0.4,
          'higher',
          (candidate) => {
            const weight = candidate.metrics?.weight ?? 0;
            const reps = candidate.metrics?.reps ?? 0;
            const sets = candidate.metrics?.sets ?? 1;
            return weight > 0 && reps > 0 ? weight * reps * Math.max(1, sets) : undefined;
          },
          formatWeight
        ),
        numericMetric('sets', 'Sets', 0.15, 'higher', (candidate) => candidate.metrics?.sets, formatSets),
      ];
    case 'HIIT':
    case 'Combatives':
      return [
        numericMetric('duration', 'Duration', 0.55, 'higher', getWorkoutMinutes, formatMinutes),
        numericMetric('rounds', 'Rounds', 0.45, 'higher', (candidate) => candidate.metrics?.rounds, formatRounds),
      ];
    case 'Climbing':
      return [
        numericMetric('elevationGain', 'Vertical Gain', 0.65, 'higher', (candidate) => candidate.metrics?.elevationGain, formatFeet),
        numericMetric('duration', 'Duration', 0.35, 'higher', getWorkoutMinutes, formatMinutes),
      ];
    case 'Diving':
      return [
        numericMetric('depth', 'Depth', 0.55, 'higher', (candidate) => candidate.metrics?.depth, formatFeet),
        numericMetric('duration', 'Duration', 0.45, 'higher', getWorkoutMinutes, formatMinutes),
      ];
    case 'Sports':
    case 'Cardio':
      return [
        numericMetric('duration', 'Duration', 0.7, 'higher', getWorkoutMinutes, formatMinutes),
        numericMetric('distance', 'Distance', 0.3, 'higher', (candidate) => candidate.distance ?? candidate.metrics?.distance, formatDistance),
      ];
    case 'Flexibility':
    case 'Surfing':
    case 'Other':
    default:
      return [
        numericMetric('duration', 'Duration', 1, 'higher', getWorkoutMinutes, formatMinutes),
      ];
  }
};

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

const getBaselineWorkouts = (relevantHistory: Workout[]) => {
  if (relevantHistory.length === 0) {
    return [];
  }

  if (relevantHistory.length === 1) {
    return relevantHistory.slice(-1);
  }

  if (relevantHistory.length === 2) {
    return relevantHistory.slice(-2);
  }

  return relevantHistory.slice(-Math.min(5, relevantHistory.length));
};

const isWorkoutScoreEngineWorkout = (workout: Workout) =>
  normalizeWorkoutType(workout.type) !== 'Other' &&
  workout.source !== 'attendance' &&
  workout.date >= WORKOUT_SCORE_ENGINE_ROLLOUT_DATE;

const getLegacyWorkoutPoints = (workout: Workout) => {
  if (workout.source === 'attendance') {
    return ATTENDANCE_CHECK_IN_POINTS;
  }

  const durationPoints = Math.max(0, Math.round(workout.duration));
  const distancePoints = Math.max(0, Math.round((workout.distance ?? 0) * 15));
  return Math.max(durationPoints, distancePoints);
};

const buildLegacyBreakdown = (workout: Workout): WorkoutScoreBreakdown => ({
  engine: 'legacy',
  type: normalizeWorkoutType(workout.type),
  subtype: getWorkoutSubtype(workout),
  typeLabel: getWorkoutTypeLabel(workout.type, getWorkoutSubtype(workout)),
  finalPoints: getLegacyWorkoutPoints(workout),
  workoutPoints: getLegacyWorkoutPoints(workout),
  participationBonus: 0,
  streakBonus: 0,
  weeklySessionCount: 0,
  metricScore: 0,
  baselineSampleSize: 0,
  baselineLabel: 'Legacy scoring',
  metrics: [],
  explanation: workout.source === 'attendance'
    ? `Attendance check-in earned ${ATTENDANCE_CHECK_IN_POINTS} points before ${WORKOUT_SCORE_ENGINE_NAME} launched.`
    : `Legacy workout score used the higher of minutes or distance before ${WORKOUT_SCORE_ENGINE_NAME} launched.`,
});

const formatMetricRatio = (ratio: number) => `${ratio.toFixed(2)}x`;

const buildScoreExplanation = (breakdown: WorkoutScoreBreakdown) => {
  if (breakdown.engine === 'legacy') {
    return breakdown.explanation;
  }

  if (breakdown.baselineSampleSize === 0) {
    return `First logged ${breakdown.typeLabel} workout. Baseline starts at 30 points.`;
  }

  const metricSummary = breakdown.metrics
    .map((metric) => `${metric.label} ${formatMetricRatio(metric.ratio)}`)
    .join(' • ');

  const bonusParts = [
    `+${formatNumber(breakdown.participationBonus)} participation`,
    `+${formatNumber(breakdown.streakBonus)} streak`,
  ];

  return `${breakdown.baselineLabel}. ${metricSummary}. ${bonusParts.join(' • ')}.`;
};

export function getWorkoutScoreHistory(
  member: Pick<Member, 'id' | 'rank' | 'firstName' | 'lastName' | 'flight' | 'workouts'>,
  ptSessions: Array<Pick<PTSession, 'id' | 'date' | 'flight' | 'attendees'> & { attendeeSources?: PTSession['attendeeSources'] }> = []
): ScoredWorkoutEntry[] {
  const effectiveWorkouts = [...member.workouts];
  const attendanceAliases = getAttendanceAliases(member);
  const datesWithRealWorkouts = new Set(
    member.workouts.filter((workout) => workout.source !== 'attendance').map((workout) => workout.date)
  );

  ptSessions.forEach((session) => {
    const matchedAttendeeId = session.attendees.find((attendeeId) => attendanceAliases.has(attendeeId));
    if (!matchedAttendeeId) {
      return;
    }

    const source = session.attendeeSources?.[matchedAttendeeId] ?? 'manual';
    if (source === 'excused' || datesWithRealWorkouts.has(session.date)) {
      return;
    }

    effectiveWorkouts.push({
      id: `attendance-${session.id}-${member.id}`,
      externalId: session.id,
      date: session.date,
      type: 'Other',
      duration: 0,
      distance: 0,
      source: 'attendance',
      title: `Attendance - ${session.flight}`,
      isPrivate: false,
    });
  });

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
  const priorByScoreKey = new Map<string, Workout[]>();
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
      if (!isWorkoutScoreEngineWorkout(workout)) {
        const scoreInfo = getWorkoutScoreKeyInfo(workout);
        return {
          workout,
          scoreKey: scoreInfo.key,
          scoreLabel: scoreInfo.label,
          points: getLegacyWorkoutPoints(workout),
          breakdown: buildLegacyBreakdown(workout),
          hasHistoricalBaseline: false,
        };
      }

      const scoreInfo = getWorkoutScoreKeyInfo(workout);
      const relevantHistory = scoreInfo.type === 'Weightlifting' && scoreInfo.subtype && scoreInfo.subtype !== 'General'
        ? [
            ...(priorByScoreKey.get(scoreInfo.key) ?? []),
            ...(priorByScoreKey.get(getWeightliftingGeneralKey()) ?? []),
          ]
        : (priorByScoreKey.get(scoreInfo.key) ?? []);
      const baselineWorkouts = getBaselineWorkouts(relevantHistory);

      if (baselineWorkouts.length === 0) {
        const breakdown: WorkoutScoreBreakdown = {
          engine: 'workout_score_engine',
          type: scoreInfo.type,
          subtype: scoreInfo.subtype,
          typeLabel: scoreInfo.label,
          finalPoints: 30,
          workoutPoints: 30,
          participationBonus: 0,
          streakBonus: 0,
          weeklySessionCount: 1,
          metricScore: 1,
          baselineSampleSize: 0,
          baselineLabel: 'First workout of this type',
          metrics: [],
          explanation: '',
        };
        breakdown.explanation = buildScoreExplanation(breakdown);

        return {
          workout,
          scoreKey: scoreInfo.key,
          scoreLabel: scoreInfo.label,
          points: breakdown.finalPoints,
          breakdown,
          hasHistoricalBaseline: false,
        };
      }

      const metricDescriptors = getMetricDescriptors(workout);
      const usableMetrics = metricDescriptors
        .map((descriptor) => {
          const currentValue = descriptor.getValue(workout);
          const baselineValues = baselineWorkouts
            .map((baselineWorkout) => descriptor.getValue(baselineWorkout))
            .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
          const baselineValue = baselineValues.length > 0 ? average(baselineValues) : undefined;

          if (!(typeof currentValue === 'number' && Number.isFinite(currentValue) && currentValue > 0) || !(baselineValue && baselineValue > 0)) {
            return null;
          }

          const rawRatio = descriptor.direction === 'higher'
            ? currentValue / baselineValue
            : baselineValue / currentValue;

          return {
            descriptor,
            currentValue,
            baselineValue,
            ratio: rawRatio,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      const totalWeight = usableMetrics.reduce((sum, item) => sum + item.descriptor.weight, 0) || 1;
      const normalizedMetrics = usableMetrics.map((item) => ({
        ...item,
        normalizedWeight: item.descriptor.weight / totalWeight,
      }));
      const metricScore = normalizedMetrics.reduce((sum, item) => sum + (item.normalizedWeight * item.ratio), 0);
      const workoutPoints = clamp(30 * metricScore, 25, 100);
      const breakdown: WorkoutScoreBreakdown = {
        engine: 'workout_score_engine',
        type: scoreInfo.type,
        subtype: scoreInfo.subtype,
        typeLabel: scoreInfo.label,
        finalPoints: workoutPoints,
        workoutPoints,
        participationBonus: 0,
        streakBonus: 0,
        weeklySessionCount: currentWeeklySessionCount,
        metricScore,
        baselineSampleSize: baselineWorkouts.length,
        baselineLabel: `Baseline = average of previous ${baselineWorkouts.length} ${scoreInfo.label} ${baselineWorkouts.length === 1 ? 'session' : 'sessions'}`,
        metrics: normalizedMetrics.map((item) => ({
          key: item.descriptor.key,
          label: item.descriptor.label,
          weight: item.normalizedWeight,
          direction: item.descriptor.direction,
          currentValue: item.currentValue,
          baselineValue: item.baselineValue,
          ratio: item.ratio,
          currentDisplay: item.descriptor.formatValue?.(item.currentValue) ?? formatNumber(item.currentValue),
          baselineDisplay: item.descriptor.formatValue?.(item.baselineValue) ?? formatNumber(item.baselineValue),
        })),
        explanation: '',
      };
      breakdown.explanation = buildScoreExplanation(breakdown);

      return {
        workout,
        scoreKey: scoreInfo.key,
        scoreLabel: scoreInfo.label,
        points: workoutPoints,
        breakdown,
        hasHistoricalBaseline: true,
      };
    });

    const eligibleBonusCandidates = scoredSessionCandidates.filter(
      (candidate) => candidate.breakdown.engine === 'workout_score_engine' && candidate.hasHistoricalBaseline
    );

    if (eligibleBonusCandidates.length > 0) {
      const participationBonusShare = 5 / eligibleBonusCandidates.length;
      const streakBonusShare = Math.min(currentWeeklySessionCount * 2, 10) / eligibleBonusCandidates.length;

      eligibleBonusCandidates.forEach((candidate) => {
        candidate.breakdown.participationBonus = participationBonusShare;
        candidate.breakdown.streakBonus = streakBonusShare;
        candidate.breakdown.finalPoints = clamp(
          candidate.breakdown.workoutPoints + participationBonusShare + streakBonusShare,
          30,
          115
        );
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

      const nextHistory = priorByScoreKey.get(candidate.scoreKey) ?? [];
      nextHistory.push(candidate.workout);
      priorByScoreKey.set(candidate.scoreKey, nextHistory);
    });

    if (isWorkoutSession) {
      weeklySessions.add(sessionKey);
      seenWeeklySessions.set(weekKey, weeklySessions);
    }
  });

  return scoredEntries;
}
