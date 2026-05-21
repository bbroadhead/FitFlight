import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Activity, Calendar, Dumbbell, TrendingUp } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { useAuthStore, useMemberStore, getDisplayName, type Workout, type WorkoutType } from '@/lib/store';
import { formatMonthLabel, getAvailableMonthKeys, getMemberMonthSummary, getMonthKey } from '@/lib/monthlyStats';
import { getWorkoutScoreHistory, type ScoredWorkoutEntry } from '@/lib/workoutScoreEngine';
import { useAppTheme } from '@/lib/theme';
import { PageContainer } from '@/components/PageContainer';
import { ThemeBackdrop } from '@/components/ThemeBackdrop';

const WORKOUT_TYPE_COLORS: Record<WorkoutType, string> = {
  Running: '#22C55E',
  Walking: '#84CC16',
  Hiking: '#65A30D',
  Rucking: '#B45309',
  Cycling: '#06B6D4',
  Swimming: '#3B82F6',
  Weightlifting: '#F59E0B',
  Strength: '#F59E0B',
  HIIT: '#EF4444',
  Sports: '#8B5CF6',
  Cardio: '#EC4899',
  Flexibility: '#14B8A6',
  Climbing: '#F97316',
  Surfing: '#0EA5E9',
  Diving: '#2563EB',
  Combatives: '#DC2626',
  Other: '#6B7280',
};

type SummaryTile = {
  label: string;
  value: string;
};

type MetricPoint = {
  label: string;
  value: number;
  displayValue: string;
};

type WorkoutTypeAnalyticsCard = {
  key: string;
  type: WorkoutType;
  title: string;
  subtitle: string;
  chartLabel: string;
  color: string;
  points: MetricPoint[];
  tiles: SummaryTile[];
  lowerIsBetter?: boolean;
  helperText?: string;
  scoreEntries: Array<{
    id: string;
    dateLabel: string;
    points: number;
    explanation: string;
  }>;
};

const ALL_TIME_KEY = 'all-time';

function normalizeWorkoutType(type: WorkoutType): WorkoutType {
  return type === 'Strength' ? 'Weightlifting' : type;
}

function formatMetricValue(value: number, suffix = '') {
  if (!Number.isFinite(value)) {
    return '--';
  }

  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return suffix ? `${formatted} ${suffix}` : formatted;
}

function getWorkoutTypeLabel(type: WorkoutType) {
  return normalizeWorkoutType(type);
}

function formatSessionLabel(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  return Number.isNaN(date.getTime()) ? dateValue : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getWorkoutMinutes(workout: Workout) {
  return workout.duration + ((workout.durationSeconds ?? 0) / 60);
}

function getMetricNumber(workout: Workout, key: keyof NonNullable<Workout['metrics']>) {
  const value = workout.metrics?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function formatPace(minutesPerMile: number) {
  if (!Number.isFinite(minutesPerMile) || minutesPerMile <= 0) {
    return '--';
  }

  const totalSeconds = Math.round(minutesPerMile * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')} / mi`;
}

function formatSpeed(mph: number) {
  return Number.isFinite(mph) && mph > 0 ? `${formatMetricValue(mph)} mph` : '--';
}

function formatDistance(distance?: number) {
  return typeof distance === 'number' && Number.isFinite(distance) ? `${formatMetricValue(distance)} mi` : '--';
}

function formatSteps(steps: number) {
  return `${formatMetricValue(steps)} steps`;
}

function formatMinutes(value: number) {
  return `${formatMetricValue(value)} min`;
}

function formatWeight(weight: number) {
  return `${formatMetricValue(weight)} lb`;
}

function formatDepth(depth: number) {
  return `${formatMetricValue(depth)} ft`;
}

function formatVertical(vertical: number) {
  return `${formatMetricValue(vertical)} ft`;
}

function buildDurationFallbackCard(type: WorkoutType, workouts: Workout[], timeframeLabel: string): WorkoutTypeAnalyticsCard {
  const sessions = [...workouts].sort((left, right) => left.date.localeCompare(right.date));
  const points = sessions.map((workout) => ({
    label: formatSessionLabel(workout.date),
    value: getWorkoutMinutes(workout),
    displayValue: formatMinutes(getWorkoutMinutes(workout)),
  }));
  const totalMinutes = sessions.reduce((sum, workout) => sum + getWorkoutMinutes(workout), 0);
  const longestSession = Math.max(...sessions.map((workout) => getWorkoutMinutes(workout)), 0);
  const averageMinutes = sessions.length > 0 ? totalMinutes / sessions.length : 0;

  return {
    key: type,
    type,
    title: getWorkoutTypeLabel(type),
    subtitle: `${sessions.length} logged ${sessions.length === 1 ? 'session' : 'sessions'} in ${timeframeLabel}`,
    chartLabel: 'Session duration over time',
    color: WORKOUT_TYPE_COLORS[type],
    points,
    tiles: [
      { label: 'Longest Session', value: formatMinutes(longestSession) },
      { label: 'Total Minutes', value: formatMinutes(totalMinutes) },
      { label: 'Avg Minutes', value: formatMinutes(averageMinutes) },
      { label: 'Sessions', value: String(sessions.length) },
    ],
    scoreEntries: [],
  };
}

function buildWorkoutTypeAnalyticsCard(
  key: string,
  title: string,
  type: WorkoutType,
  workouts: Workout[],
  scoreEntries: ScoredWorkoutEntry[]
): WorkoutTypeAnalyticsCard {
  const sessions = [...workouts].sort((left, right) => left.date.localeCompare(right.date));
  const displayScoreEntries = [...scoreEntries]
    .sort((left, right) => left.workout.date.localeCompare(right.workout.date))
    .map((entry) => ({
      id: entry.workout.id,
      dateLabel: formatSessionLabel(entry.workout.date),
      points: entry.points,
      explanation: entry.breakdown.explanation,
    }));

  if (type === 'Running' || type === 'Walking') {
    const paceSessions = sessions
      .map((workout) => {
        const distance = workout.distance ?? workout.metrics?.distance ?? 0;
        const minutes = getWorkoutMinutes(workout);
        if (!(distance > 0) || !(minutes > 0)) {
          return null;
        }
        const pace = minutes / distance;
        return {
          workout,
          pace,
          distance,
          minutes,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    const totalDistance = paceSessions.reduce((sum, session) => sum + session.distance, 0);
    const totalMinutes = paceSessions.reduce((sum, session) => sum + session.minutes, 0);
    const bestPace = paceSessions.length > 0 ? Math.min(...paceSessions.map((session) => session.pace)) : 0;
    const longestRun = paceSessions.length > 0 ? Math.max(...paceSessions.map((session) => session.distance)) : 0;
    const averagePace = totalDistance > 0 ? totalMinutes / totalDistance : 0;

    return {
      key,
      type,
      title,
      subtitle: 'Track pace progress across each logged session',
      chartLabel: 'Pace per session',
      color: WORKOUT_TYPE_COLORS[type],
      lowerIsBetter: true,
      helperText: 'Lower pace values indicate faster sessions.',
      points: paceSessions.map((session) => ({
        label: formatSessionLabel(session.workout.date),
        value: session.pace,
        displayValue: formatPace(session.pace),
      })),
      tiles: [
        { label: 'Best Pace', value: formatPace(bestPace) },
        { label: type === 'Running' ? 'Longest Run' : 'Longest Walk', value: formatDistance(longestRun) },
        { label: 'Total Distance', value: formatDistance(totalDistance) },
        { label: 'Avg Pace', value: formatPace(averagePace) },
      ],
      scoreEntries: displayScoreEntries,
    };
  }

  if (type === 'Hiking') {
    const hikeSessions = sessions
      .map((workout) => {
        const distance = workout.distance ?? workout.metrics?.distance ?? 0;
        const minutes = getWorkoutMinutes(workout);
        const vertical = getMetricNumber(workout, 'elevationGain') ?? 0;
        const steps = getMetricNumber(workout, 'steps') ?? 0;
        if (!(distance > 0) || !(minutes > 0)) {
          return null;
        }
        return {
          workout,
          pace: minutes / distance,
          distance,
          vertical,
          steps,
          minutes,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    const totalDistance = hikeSessions.reduce((sum, session) => sum + session.distance, 0);
    const totalVertical = hikeSessions.reduce((sum, session) => sum + session.vertical, 0);
    const totalSteps = hikeSessions.reduce((sum, session) => sum + session.steps, 0);
    const bestPace = hikeSessions.length > 0 ? Math.min(...hikeSessions.map((session) => session.pace)) : 0;

    return {
      key,
      type,
      title,
      subtitle: 'See hiking pace trends while tracking elevation and steps',
      chartLabel: 'Pace per hike',
      color: WORKOUT_TYPE_COLORS[type],
      lowerIsBetter: true,
      helperText: 'Lower pace values indicate faster hiking pace.',
      points: hikeSessions.map((session) => ({
        label: formatSessionLabel(session.workout.date),
        value: session.pace,
        displayValue: formatPace(session.pace),
      })),
      tiles: [
        { label: 'Best Pace', value: formatPace(bestPace) },
        { label: 'Total Distance', value: formatDistance(totalDistance) },
        { label: 'Vertical Gain', value: formatVertical(totalVertical) },
        { label: 'Total Steps', value: formatSteps(totalSteps) },
      ],
      scoreEntries: displayScoreEntries,
    };
  }

  if (type === 'Rucking') {
    const ruckSessions = sessions
      .map((workout) => {
        const distance = workout.distance ?? workout.metrics?.distance ?? 0;
        const minutes = getWorkoutMinutes(workout);
        const weight = getMetricNumber(workout, 'weight') ?? 0;
        if (!(distance > 0) || !(minutes > 0) || !(weight > 0)) {
          return null;
        }
        return {
          workout,
          pace: minutes / distance,
          distance,
          weight,
          minutes,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    const totalDistance = ruckSessions.reduce((sum, session) => sum + session.distance, 0);
    const heaviestRuck = ruckSessions.length > 0 ? Math.max(...ruckSessions.map((session) => session.weight)) : 0;
    const bestPace = ruckSessions.length > 0 ? Math.min(...ruckSessions.map((session) => session.pace)) : 0;
    const averagePace = totalDistance > 0
      ? ruckSessions.reduce((sum, session) => sum + session.minutes, 0) / totalDistance
      : 0;

    return {
      key,
      type,
      title,
      subtitle: 'Track ruck pace while comparing carried load across sessions',
      chartLabel: 'Pace per ruck',
      color: WORKOUT_TYPE_COLORS[type],
      lowerIsBetter: true,
      helperText: 'Lower pace values indicate faster rucking pace.',
      points: ruckSessions.map((session) => ({
        label: formatSessionLabel(session.workout.date),
        value: session.pace,
        displayValue: formatPace(session.pace),
      })),
      tiles: [
        { label: 'Best Pace', value: formatPace(bestPace) },
        { label: 'Heaviest Ruck', value: formatWeight(heaviestRuck) },
        { label: 'Total Distance', value: formatDistance(totalDistance) },
        { label: 'Avg Pace', value: formatPace(averagePace) },
      ],
      scoreEntries: displayScoreEntries,
    };
  }

  if (type === 'Cycling') {
    const rideSessions = sessions
      .map((workout) => {
        const distance = workout.distance ?? workout.metrics?.distance ?? 0;
        const hours = getWorkoutMinutes(workout) / 60;
        if (!(distance > 0) || !(hours > 0)) {
          return null;
        }
        const speed = distance / hours;
        return {
          workout,
          distance,
          speed,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    const totalDistance = rideSessions.reduce((sum, session) => sum + session.distance, 0);
    const longestRide = rideSessions.length > 0 ? Math.max(...rideSessions.map((session) => session.distance)) : 0;
    const topSpeed = rideSessions.length > 0 ? Math.max(...rideSessions.map((session) => session.speed)) : 0;
    const averageSpeed = rideSessions.length > 0 ? rideSessions.reduce((sum, session) => sum + session.speed, 0) / rideSessions.length : 0;

    return {
      key,
      type,
      title,
      subtitle: 'Compare average ride speed over time',
      chartLabel: 'Average speed per ride',
      color: WORKOUT_TYPE_COLORS[type],
      points: rideSessions.map((session) => ({
        label: formatSessionLabel(session.workout.date),
        value: session.speed,
        displayValue: formatSpeed(session.speed),
      })),
      tiles: [
        { label: 'Top Speed', value: formatSpeed(topSpeed) },
        { label: 'Longest Ride', value: formatDistance(longestRide) },
        { label: 'Total Distance', value: formatDistance(totalDistance) },
        { label: 'Avg Speed', value: formatSpeed(averageSpeed) },
      ],
      scoreEntries: displayScoreEntries,
    };
  }

  if (type === 'Weightlifting') {
    const liftingSessions = sessions
      .map((workout) => {
        const weight = getMetricNumber(workout, 'weight');
        const reps = getMetricNumber(workout, 'reps');
        const sets = getMetricNumber(workout, 'sets') ?? 1;
        if (!(weight && reps)) {
          return null;
        }
        const estimatedOneRepMax = weight * (1 + (reps / 30));
        const totalVolume = weight * reps * Math.max(1, sets);
        return {
          workout,
          weight,
          reps,
          sets,
          estimatedOneRepMax,
          totalVolume,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (liftingSessions.length === 0) {
      return buildDurationFallbackCard(type, sessions, 'this timeframe');
    }

    const bestSet = [...liftingSessions].sort((left, right) => {
      if (right.weight !== left.weight) {
        return right.weight - left.weight;
      }
      return right.reps - left.reps;
    })[0];
    const bestOneRepMax = Math.max(...liftingSessions.map((session) => session.estimatedOneRepMax), 0);
    const totalVolume = liftingSessions.reduce((sum, session) => sum + session.totalVolume, 0);

    return {
      key,
      type,
      title,
      subtitle: 'See how your projected top-end strength changes over time',
      chartLabel: 'Estimated 1RM per lifting session',
      color: WORKOUT_TYPE_COLORS[type],
      points: liftingSessions.map((session) => ({
        label: formatSessionLabel(session.workout.date),
        value: session.estimatedOneRepMax,
        displayValue: formatWeight(session.estimatedOneRepMax),
      })),
      tiles: [
        { label: 'Best Set', value: `${formatWeight(bestSet.weight)} x ${Math.round(bestSet.reps)}` },
        { label: 'Est. 1RM', value: formatWeight(bestOneRepMax) },
        { label: 'Total Volume', value: `${Math.round(totalVolume).toLocaleString()} lb` },
        { label: 'Sessions', value: String(liftingSessions.length) },
      ],
      scoreEntries: displayScoreEntries,
    };
  }

  if (type === 'Climbing') {
    const climbingSessions = sessions
      .map((workout) => {
        const vertical = getMetricNumber(workout, 'elevationGain');
        return vertical && vertical > 0 ? { workout, vertical } : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (climbingSessions.length === 0) {
      return buildDurationFallbackCard(type, sessions, 'this timeframe');
    }

    const totalVertical = climbingSessions.reduce((sum, session) => sum + session.vertical, 0);
    const bestVertical = Math.max(...climbingSessions.map((session) => session.vertical), 0);
    const longestSession = Math.max(...sessions.map((workout) => getWorkoutMinutes(workout)), 0);

    return {
      key,
      type,
      title,
      subtitle: 'Track vertical progress across climbing sessions',
      chartLabel: 'Vertical gain per session',
      color: WORKOUT_TYPE_COLORS[type],
      points: climbingSessions.map((session) => ({
        label: formatSessionLabel(session.workout.date),
        value: session.vertical,
        displayValue: formatVertical(session.vertical),
      })),
      tiles: [
        { label: 'Best Vertical', value: formatVertical(bestVertical) },
        { label: 'Total Vertical', value: formatVertical(totalVertical) },
        { label: 'Longest Session', value: formatMinutes(longestSession) },
        { label: 'Sessions', value: String(sessions.length) },
      ],
      scoreEntries: displayScoreEntries,
    };
  }

  if (type === 'Diving') {
    const diveSessions = sessions
      .map((workout) => {
        const depth = getMetricNumber(workout, 'depth');
        return depth && depth > 0 ? { workout, depth } : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (diveSessions.length === 0) {
      return buildDurationFallbackCard(type, sessions, 'this timeframe');
    }

    const deepestDive = Math.max(...diveSessions.map((session) => session.depth), 0);
    const averageDepth = diveSessions.reduce((sum, session) => sum + session.depth, 0) / diveSessions.length;
    const totalDiveTime = sessions.reduce((sum, workout) => sum + getWorkoutMinutes(workout), 0);

    return {
      key,
      type,
      title,
      subtitle: 'Track dive depth trends over time',
      chartLabel: 'Depth per dive session',
      color: WORKOUT_TYPE_COLORS[type],
      points: diveSessions.map((session) => ({
        label: formatSessionLabel(session.workout.date),
        value: session.depth,
        displayValue: formatDepth(session.depth),
      })),
      tiles: [
        { label: 'Deepest Dive', value: formatDepth(deepestDive) },
        { label: 'Avg Depth', value: formatDepth(averageDepth) },
        { label: 'Total Dive Time', value: formatMinutes(totalDiveTime) },
        { label: 'Sessions', value: String(sessions.length) },
      ],
      scoreEntries: displayScoreEntries,
    };
  }

  if (type === 'HIIT' || type === 'Combatives') {
    const roundsSessions = sessions
      .map((workout) => {
        const rounds = getMetricNumber(workout, 'rounds');
        return rounds && rounds > 0 ? { workout, rounds } : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (roundsSessions.length === 0) {
      return buildDurationFallbackCard(type, sessions, 'this timeframe');
    }

    const mostRounds = Math.max(...roundsSessions.map((session) => session.rounds), 0);
    const totalRounds = roundsSessions.reduce((sum, session) => sum + session.rounds, 0);
    const totalMinutes = sessions.reduce((sum, workout) => sum + getWorkoutMinutes(workout), 0);

    return {
      key,
      type,
      title,
      subtitle: 'Track round-based progress across sessions',
      chartLabel: 'Rounds completed per session',
      color: WORKOUT_TYPE_COLORS[type],
      points: roundsSessions.map((session) => ({
        label: formatSessionLabel(session.workout.date),
        value: session.rounds,
        displayValue: `${Math.round(session.rounds)} rounds`,
      })),
      tiles: [
        { label: 'Most Rounds', value: `${Math.round(mostRounds)}` },
        { label: 'Total Rounds', value: `${Math.round(totalRounds)}` },
        { label: 'Total Minutes', value: formatMinutes(totalMinutes) },
        { label: 'Sessions', value: String(sessions.length) },
      ],
      scoreEntries: displayScoreEntries,
    };
  }

  if (type === 'Surfing') {
    const totalMinutes = sessions.reduce((sum, workout) => sum + getWorkoutMinutes(workout), 0);
    const longestSession = Math.max(...sessions.map((workout) => getWorkoutMinutes(workout)), 0);
    const averageMinutes = sessions.length > 0 ? totalMinutes / sessions.length : 0;
    const latestConditions = [...sessions]
      .sort((left, right) => right.date.localeCompare(left.date))
      .find((workout) => typeof workout.metrics?.waveConditions === 'string' && workout.metrics.waveConditions.trim().length > 0)
      ?.metrics?.waveConditions;

    return {
      key,
      type,
      title,
      subtitle: 'Track surf session duration over time',
      chartLabel: 'Session duration per surf',
      color: WORKOUT_TYPE_COLORS[type],
      points: sessions.map((workout) => ({
        label: formatSessionLabel(workout.date),
        value: getWorkoutMinutes(workout),
        displayValue: formatMinutes(getWorkoutMinutes(workout)),
      })),
      tiles: [
        { label: 'Longest Session', value: formatMinutes(longestSession) },
        { label: 'Total Minutes', value: formatMinutes(totalMinutes) },
        { label: 'Avg Minutes', value: formatMinutes(averageMinutes) },
        { label: 'Latest Conditions', value: latestConditions || '--' },
      ],
      scoreEntries: displayScoreEntries,
    };
  }

  if (type === 'Swimming') {
    const distanceSessions = sessions.filter((workout) => (workout.distance ?? workout.metrics?.distance ?? 0) > 0);
    const totalDistance = distanceSessions.reduce((sum, workout) => sum + (workout.distance ?? workout.metrics?.distance ?? 0), 0);
    const farthestSession = distanceSessions.length > 0 ? Math.max(...distanceSessions.map((workout) => workout.distance ?? workout.metrics?.distance ?? 0), 0) : 0;
    const longestSession = Math.max(...sessions.map((workout) => getWorkoutMinutes(workout)), 0);

    if (distanceSessions.length === 0) {
      return buildDurationFallbackCard(type, sessions, 'this timeframe');
    }

    return {
      key,
      type,
      title,
      subtitle: 'Track distance trends across sessions',
      chartLabel: 'Distance per session',
      color: WORKOUT_TYPE_COLORS[type],
      points: distanceSessions.map((workout) => ({
        label: formatSessionLabel(workout.date),
        value: workout.distance ?? workout.metrics?.distance ?? 0,
        displayValue: formatDistance(workout.distance ?? workout.metrics?.distance ?? 0),
      })),
      tiles: [
        { label: 'Longest Session', value: formatMinutes(longestSession) },
        { label: 'Farthest Session', value: formatDistance(farthestSession) },
        { label: 'Total Distance', value: formatDistance(totalDistance) },
        { label: 'Sessions', value: String(sessions.length) },
      ],
      scoreEntries: displayScoreEntries,
    };
  }

  return {
    ...buildDurationFallbackCard(type, sessions, 'this timeframe'),
    key,
    title,
    scoreEntries: displayScoreEntries,
  };
}

function ProgressLineChart({
  points,
  color,
  lowerIsBetter = false,
}: {
  points: MetricPoint[];
  color: string;
  lowerIsBetter?: boolean;
}) {
  const chartWidth = 300;
  const chartHeight = 160;
  const chartLeft = 16;
  const chartRight = 284;
  const chartTop = 16;
  const chartBottom = 128;

  if (points.length === 0) {
    return (
      <View className="rounded-2xl border border-white/10 bg-white/5 px-4 py-8 items-center">
        <Text className="text-af-silver text-sm">Not enough workout detail logged yet for a progress chart.</Text>
      </View>
    );
  }

  const values = points.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const denominator = maxValue - minValue;
  const chartPoints = points.map((point, index) => {
    const x = points.length <= 1
      ? (chartLeft + chartRight) / 2
      : chartLeft + ((chartRight - chartLeft) * index) / (points.length - 1);
    let normalized = denominator === 0 ? 0.5 : (point.value - minValue) / denominator;
    if (lowerIsBetter) {
      normalized = 1 - normalized;
    }
    const y = chartBottom - (normalized * (chartBottom - chartTop));
    return { x, y, point };
  });

  return (
    <View className="rounded-2xl border border-white/10 bg-white/5 px-3 py-4">
      <Svg width="100%" height="170" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
        <Line x1={chartLeft} y1={chartBottom} x2={chartRight} y2={chartBottom} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <Line x1={chartLeft} y1={chartTop} x2={chartLeft} y2={chartBottom} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <Polyline
          points={chartPoints.map((entry) => `${entry.x},${entry.y}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {chartPoints.map((entry) => (
          <React.Fragment key={`${entry.point.label}-${entry.point.value}`}>
            <Circle cx={entry.x} cy={entry.y} r="3.5" fill={color} />
            <Circle cx={entry.x} cy={entry.y} r="7" fill="rgba(255,255,255,0.04)" />
          </React.Fragment>
        ))}
      </Svg>
      <View className="flex-row justify-between mt-1 px-1">
        <Text className="text-af-silver text-xs">{chartPoints[0]?.point.label}</Text>
        <Text className="text-af-silver text-xs">{chartPoints[chartPoints.length - 1]?.point.label}</Text>
      </View>
    </View>
  );
}

function SummaryTileGrid({ tiles }: { tiles: SummaryTile[] }) {
  return (
    <View className="flex-row flex-wrap -mx-1 mt-4">
      {tiles.map((tile) => (
        <View key={tile.label} className="w-1/2 px-1 mb-2">
          <View className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 min-h-[88px]">
            <Text className="text-af-silver text-xs uppercase">{tile.label}</Text>
            <Text className="text-white font-semibold text-lg mt-2">{tile.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function PointsBreakdownList({
  entries,
  title,
}: {
  entries: WorkoutTypeAnalyticsCard['scoreEntries'];
  title: string;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <View className="mt-4">
      <Text className="text-white font-semibold text-sm">{title}</Text>
      {entries.map((entry) => (
        <View key={entry.id} className="mt-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-white font-medium">{entry.dateLabel}</Text>
            <Text className="text-af-gold font-semibold">{entry.points} pts</Text>
          </View>
          <Text className="text-af-silver text-xs mt-2">{entry.explanation}</Text>
        </View>
      ))}
    </View>
  );
}

export default function PersonalAnalyticsScreen() {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const members = useMemberStore((state) => state.members);
  const ptSessions = useMemberStore((state) => state.ptSessions);
  const member = useMemo(() => {
    if (!user) {
      return null;
    }

    return members.find(
      (candidate) =>
        candidate.id === user.id ||
        candidate.email.toLowerCase() === user.email.toLowerCase()
    ) ?? null;
  }, [members, user]);
  const availableMonths = useMemo(
    () => (member ? getAvailableMonthKeys([member], ptSessions) : [getMonthKey()]),
    [member, ptSessions]
  );
  const [selectedMonthKey, setSelectedMonthKey] = useState(getMonthKey());
  const scoredWorkoutHistory = useMemo(
    () => (member ? getWorkoutScoreHistory(member, ptSessions).filter((entry) => !['attendance', 'pfra'].includes(entry.workout.source)) : []),
    [member, ptSessions]
  );
  const availableTimeframes = useMemo(() => [ALL_TIME_KEY, ...availableMonths], [availableMonths]);
  const isAllTimeView = selectedMonthKey === ALL_TIME_KEY;
  const activeMonthKey = availableMonths.includes(selectedMonthKey)
    ? selectedMonthKey
    : availableMonths[0] ?? getMonthKey();
  const activeTimeframeLabel = isAllTimeView ? 'all time' : formatMonthLabel(activeMonthKey);
  const pointsBreakdownTitle = isAllTimeView ? 'Points Earned Over Time' : 'Points Earned This Month';
  const contentMaxWidth = width >= 1440 ? 1240 : width >= 1180 ? 1120 : 980;
  const useDesktopGrid = width >= 1180;

  const workoutTypeCards = useMemo(() => {
    if (!member) {
      return [];
    }

    const summary = isAllTimeView ? null : getMemberMonthSummary(member, activeMonthKey, ptSessions);
    const workouts = (isAllTimeView ? member.workouts : summary?.workouts ?? []).filter((workout) => !['attendance', 'pfra'].includes(workout.source));
    const grouped = new Map<string, { type: WorkoutType; title: string; workouts: Workout[]; scoreEntries: ScoredWorkoutEntry[] }>();

    (isAllTimeView ? scoredWorkoutHistory : summary?.scoredWorkouts.filter((entry) => !['attendance', 'pfra'].includes(entry.workout.source)) ?? [])
      .forEach((entry) => {
        const type = normalizeWorkoutType(entry.workout.type);
        const title = entry.breakdown.analyticsLabel;
        const groupKey = entry.breakdown.analyticsKey;
        const current = grouped.get(groupKey) ?? {
          type,
          title,
          workouts: [],
          scoreEntries: [],
        };
        current.workouts.push({
          ...entry.workout,
          type,
        });
        current.scoreEntries.push(entry);
        grouped.set(groupKey, current);
      });

    workouts.forEach((workout) => {
      const type = normalizeWorkoutType(workout.type);
      const fallbackKey = type === 'Weightlifting'
        ? `Weightlifting:${(workout.metrics?.subtype ?? 'general').toLowerCase()}`
        : type;
      if (grouped.has(fallbackKey)) {
        return;
      }
      grouped.set(fallbackKey, {
        type,
        title: workout.metrics?.subtype ? `${type} • ${workout.metrics.subtype}` : getWorkoutTypeLabel(type),
        workouts: [{ ...workout, type }],
        scoreEntries: [],
      });
    });

    return Array.from(grouped.entries())
      .map(([key, group]) => {
        const card = buildWorkoutTypeAnalyticsCard(key, group.title, group.type, group.workouts, group.scoreEntries);
        if (card.subtitle.endsWith('this month')) {
          return {
            ...card,
            subtitle: card.subtitle.replace('this month', activeTimeframeLabel),
          };
        }
        return card;
      })
      .sort((left, right) => left.title.localeCompare(right.title));
  }, [activeMonthKey, activeTimeframeLabel, isAllTimeView, member, ptSessions, scoredWorkoutHistory]);

  if (!user || !member) {
    return (
      <View className="flex-1 items-center justify-center bg-af-navy px-6">
        <Text className="text-white text-lg font-semibold">Unable to load personal analytics.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <LinearGradient
        colors={theme.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />
      <ThemeBackdrop />

      <SafeAreaView edges={['top']} className="flex-1">
        <PageContainer maxWidth={contentMaxWidth}>
          <Animated.View entering={FadeInDown.delay(80).springify()} className="px-6 pt-4 pb-2 flex-row items-center">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              className="w-10 h-10 bg-white/10 rounded-full items-center justify-center mr-4"
            >
              <ChevronLeft size={24} color="#C0C0C0" />
            </Pressable>
            <View className="flex-1">
              <Text className="text-white text-xl font-bold">Personal Analytics</Text>
              <Text className="text-af-silver text-sm">{getDisplayName(user)}</Text>
            </View>
          </Animated.View>
        </PageContainer>

        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40, alignItems: 'center' }} showsVerticalScrollIndicator={false}>
          <PageContainer maxWidth={contentMaxWidth} className="px-6">
            <Animated.View entering={FadeInDown.delay(120).springify()} className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-white/60 text-xs uppercase tracking-wider">Timeframe</Text>
                <Text className="text-af-silver text-xs">{isAllTimeView ? 'All-Time' : formatMonthLabel(activeMonthKey)}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 12 }}>
                {availableTimeframes.map((timeframeKey) => (
                  <Pressable
                    key={timeframeKey}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedMonthKey(timeframeKey);
                    }}
                    className={`mr-2 rounded-full border px-3 py-1.5 ${(isAllTimeView ? ALL_TIME_KEY : activeMonthKey) === timeframeKey ? 'bg-af-accent border-af-accent' : 'bg-white/5 border-white/10'}`}
                  >
                    <Text className={(isAllTimeView ? ALL_TIME_KEY : activeMonthKey) === timeframeKey ? 'text-white font-semibold text-xs' : 'text-af-silver text-xs'}>
                      {timeframeKey === ALL_TIME_KEY ? 'All-Time' : formatMonthLabel(timeframeKey)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(150).springify()} className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <View className="flex-row items-start">
                <Activity size={18} color="#7DD3FC" />
                <View className="ml-3 flex-1">
                  <Text className="text-white font-semibold">Workout-Type Progress</Text>
                  <Text className="text-af-silver text-sm mt-1">
                    Only workout types you have logged for {activeTimeframeLabel} are shown here. Each card highlights the most useful metric trends and summary stats for that workout type.
                  </Text>
                </View>
              </View>
            </Animated.View>

            {workoutTypeCards.length === 0 ? (
              <Animated.View entering={FadeInDown.delay(180).springify()} className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-6 items-center">
                <Calendar size={22} color="#C0C0C0" />
                <Text className="text-white font-semibold text-lg mt-4">
                  {isAllTimeView ? 'No workout analytics yet' : 'No workout analytics yet for this timeframe'}
                </Text>
                <Text className="text-af-silver text-center text-sm mt-2">
                  {isAllTimeView
                    ? 'Log workouts to unlock workout-type progress cards, charts, and trend summaries.'
                    : 'Log workouts in this timeframe to unlock workout-type progress cards, charts, and trend summaries.'}
                </Text>
              </Animated.View>
            ) : (
              <View className={useDesktopGrid ? 'flex-row flex-wrap -mx-2 mt-2' : 'mt-2'}>
                {workoutTypeCards.map((card, index) => (
                  <View key={card.key} className={useDesktopGrid ? 'w-1/2 px-2 mt-4' : 'mt-4'}>
                    <Animated.View entering={FadeInDown.delay(180 + (index * 35)).springify()} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                      <View className="flex-row items-start justify-between">
                        <View className="flex-1 pr-4">
                          <Text className="text-white font-semibold text-xl">{card.title}</Text>
                          <Text className="text-af-silver text-sm mt-1">{card.subtitle}</Text>
                        </View>
                        <View
                          className="w-12 h-12 rounded-2xl items-center justify-center"
                          style={{ backgroundColor: `${card.color}22`, borderWidth: 1, borderColor: `${card.color}55` }}
                        >
                          {card.type === 'Weightlifting' ? <Dumbbell size={20} color={card.color} /> : <TrendingUp size={20} color={card.color} />}
                        </View>
                      </View>

                      <View className="mt-4">
                        <Text className="text-white/70 text-sm font-medium">{card.chartLabel}</Text>
                        {card.helperText ? (
                          <Text className="text-af-silver text-xs mt-1">{card.helperText}</Text>
                        ) : null}
                      </View>

                      <View className="mt-3">
                        <ProgressLineChart points={card.points} color={card.color} lowerIsBetter={card.lowerIsBetter} />
                      </View>

                      <SummaryTileGrid tiles={card.tiles} />
                      <PointsBreakdownList entries={card.scoreEntries} title={pointsBreakdownTitle} />
                    </Animated.View>
                  </View>
                ))}
              </View>
            )}
          </PageContainer>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
