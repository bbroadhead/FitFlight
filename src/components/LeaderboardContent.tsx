import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Trophy, Timer, ChevronDown, ChevronUp, Crown, Medal, Search, X, Activity, Award, BarChart3, Dumbbell, ArrowLeft, CircleHelp, Users } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInRight, useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ALL_ACHIEVEMENTS, FLIGHTS, formatFlightDisplay, getClosedMonthPlacements, getEffectiveAchievementIds, getShortDisplayName, type Flight, useAuthStore, useMemberStore, type WorkoutType, WORKOUT_TYPES } from '@/lib/store';
import { cn } from '@/lib/cn';
import { trackAnalyticsEvent } from '@/lib/googleAnalytics';
import { ATTENDANCE_CHECK_IN_POINTS, getMemberMonthSummary, getMonthKey, WORKOUT_POINTS_PER_MILE, WORKOUT_POINTS_PER_MINUTE } from '@/lib/monthlyStats';
import { ThemeBackdrop } from '@/components/ThemeBackdrop';
import { ThemeChrome } from '@/components/ThemeChrome';
import { TopStatusBar } from '@/components/TopStatusBar';
import { requestRegisteredSync } from '@/lib/appSync';
import { useErrorLogScreenContext } from '@/lib/errorLog';
import { getThemeBodyStyle, getThemeControlStyle, getThemeHeadingStyle, useAppTheme } from '@/lib/theme';

const WORKOUT_TYPE_COLORS: Record<WorkoutType, string> = {
  Running: '#22C55E',
  Walking: '#84CC16',
  Cycling: '#06B6D4',
  Strength: '#F59E0B',
  HIIT: '#EF4444',
  Swimming: '#3B82F6',
  Sports: '#8B5CF6',
  Cardio: '#EC4899',
  Flexibility: '#14B8A6',
  Other: '#6B7280',
};

function RunningIcon({ size, color }: { size: number; color: string }) {
  return <MaterialCommunityIcons name="run-fast" size={size} color={color} />;
}

function WorkoutTypeAnalyticsBar({
  label,
  count,
  percentage,
  maxPercentage,
  delay = 0,
}: {
  label: string;
  count: number;
  percentage: number;
  maxPercentage: number;
  delay?: number;
}) {
  const barWidth = useSharedValue(0);
  const normalizedWidth = maxPercentage > 0 ? (percentage / maxPercentage) * 100 : 0;

  React.useEffect(() => {
    barWidth.value = withDelay(delay, withSpring(normalizedWidth, { damping: 15, stiffness: 100 }));
  }, [barWidth, delay, maxPercentage, normalizedWidth]);

  const animatedBarStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value}%`,
  }));

  const color = label === 'Attendance' ? '#4A90D9' : WORKOUT_TYPE_COLORS[label as WorkoutType] ?? '#6B7280';

  return (
    <View className="mb-2">
      <View className="flex-row items-center justify-between mb-1">
        <View className="flex-row items-center">
          <View className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: color }} />
          <Text className="text-white text-xs">{label}</Text>
        </View>
        <Text className="text-af-silver text-xs">{count} ({percentage.toFixed(0)}%)</Text>
      </View>
      <View className="h-2 bg-white/10 rounded-full overflow-hidden">
        <Animated.View
          style={[animatedBarStyle, { backgroundColor: color }]}
          className="h-full rounded-full"
        />
      </View>
    </View>
  );
}

interface LeaderboardMember {
  id: string;
  rank: string;
  firstName: string;
  lastName: string;
  flight: string;
  exerciseMinutes: number;
  distanceRun: number;
  workoutCount: number;
  totalScore: number;
  trophyCount: number;
  monthlyPlacements?: { month: string; position: 1 | 2 | 3 }[];
  hardAchievements: { id: string; name: string }[];
}

function getCompetitionPosition(scores: number[], index: number): number {
  if (index <= 0) {
    return 1;
  }

  return scores[index] === scores[index - 1] ? getCompetitionPosition(scores, index - 1) : index + 1;
}

function MiniBarChart({
  value,
  maxValue,
  color,
  icon: Icon,
  label,
  unit,
  delay = 0,
}: {
  value: number;
  maxValue: number;
  color: string;
  icon: React.ElementType;
  label: string;
  unit: string;
  delay?: number;
}) {
  const barWidth = useSharedValue(0);
  const percentage = Math.min((value / maxValue) * 100, 100);

  React.useEffect(() => {
    barWidth.value = withDelay(delay, withSpring(percentage, { damping: 15, stiffness: 100 }));
  }, [barWidth, delay, maxValue, percentage, value]);

  const animatedBarStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value}%`,
  }));

  return (
    <View className="flex-1">
      <View className="flex-row items-center mb-1">
        <Icon size={12} color={color} />
        <Text className="text-white/60 text-xs ml-1">{label}</Text>
      </View>
      <View className="h-2 bg-white/10 rounded-full overflow-hidden">
        <Animated.View
          style={[animatedBarStyle, { backgroundColor: color }]}
          className="h-full rounded-full"
        />
      </View>
      <Text className="text-white text-xs font-semibold mt-1">
        {value.toLocaleString()}{unit}
      </Text>
    </View>
  );
}

function LeaderboardCard({
  member,
  position,
  maxValues,
  delay,
  onPress,
  theme,
}: {
  member: LeaderboardMember;
  position: number;
  maxValues: { minutes: number; distance: number; workouts: number };
  delay: number;
  onPress: () => void;
  theme: ReturnType<typeof useAppTheme>;
}) {
  const getRankIcon = () => {
    if (position === 1) return <Crown size={20} color="#FFD700" />;
    if (position === 2) return <Medal size={20} color="#C0C0C0" />;
    if (position === 3) return <Medal size={20} color="#CD7F32" />;
    return null;
  };

  const getRankAccent = () => {
    if (position === 1) return { bg: 'rgba(255,215,0,0.16)', border: 'rgba(255,215,0,0.34)', text: '#FFD700' };
    if (position === 2) return { bg: 'rgba(192,192,192,0.14)', border: 'rgba(192,192,192,0.32)', text: '#E5E7EB' };
    if (position === 3) return { bg: 'rgba(205,127,50,0.14)', border: 'rgba(205,127,50,0.32)', text: '#D6A26A' };
    return { bg: theme.accentSoft, border: `${theme.accent}44`, text: theme.accent };
  };

  const displayName = getShortDisplayName({ rank: member.rank, lastName: member.lastName });
  const rankAccent = getRankAccent();
  const leaderboardAchievementBadges = member.hardAchievements
    .filter((achievement) => achievement.id !== 'top_3_month')
    .slice(0, 2);

  return (
    <Pressable onPress={onPress}>
      <Animated.View
        entering={FadeInRight.delay(delay).springify()}
        className="mb-3"
      >
        <ThemeChrome theme={theme} variant={position <= 3 ? 'feature' : 'default'}>
        <View className="p-4">
        <View className="flex-row items-center mb-3">
          <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: rankAccent.bg, borderWidth: 1, borderColor: rankAccent.border }}>
            {getRankIcon() || <Text className="text-white font-bold text-sm">{position}</Text>}
          </View>
          <View className="flex-1">
            <View className="flex-row items-center flex-wrap">
              <Text style={[getThemeBodyStyle(theme, 16, theme.textPrimary), { fontWeight: '600' }]}>{displayName}</Text>
              {getClosedMonthPlacements(member).length > 0 && (
                <View className="ml-2 flex-row items-center px-1.5 py-0.5 rounded border" style={{ backgroundColor: rankAccent.bg, borderColor: rankAccent.border }}>
                  <Trophy size={10} color={rankAccent.text} />
                  <Text className="text-xs font-bold ml-0.5" style={{ color: rankAccent.text }}>{getClosedMonthPlacements(member).length}</Text>
                </View>
              )}
            </View>
            <View className="flex-row items-center">
              <Text className="text-xs" style={{ color: theme.textSecondary }}>{formatFlightDisplay(member.flight)}</Text>
              {leaderboardAchievementBadges.map((achievement) => (
                <View
                  key={achievement.id}
                  className="ml-1.5 flex-row items-center px-1.5 py-0.5 rounded border"
                  style={{ backgroundColor: rankAccent.bg, borderColor: rankAccent.border }}
                >
                  <Award size={10} color={rankAccent.text} />
                  <Text className="text-xs font-semibold ml-0.5" style={{ color: rankAccent.text }}>
                    {achievement.name.split(' ')[0]}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          <View className="items-end">
            <View className="px-3 py-1 rounded-full border" style={{ backgroundColor: theme.accentSoft, borderColor: `${theme.accent}55` }}>
              <Text className="font-bold text-sm" style={{ color: theme.accent }}>{member.totalScore.toLocaleString()}</Text>
            </View>
          </View>
        </View>

        <View className="flex-row space-x-4">
          <MiniBarChart
            value={member.exerciseMinutes}
            maxValue={maxValues.minutes}
            color="#4A90D9"
            icon={Timer}
            label="Minutes"
            unit="m"
            delay={delay + 100}
          />
          <View className="w-3" />
          <MiniBarChart
            value={member.distanceRun}
            maxValue={maxValues.distance}
            color="#22C55E"
            icon={RunningIcon}
            label="Distance"
            unit="mi"
            delay={delay + 200}
          />
          <View className="w-3" />
          <MiniBarChart
            value={member.workoutCount}
            maxValue={maxValues.workouts}
            color="#A855F7"
            icon={Dumbbell}
            label="Workouts"
            unit=""
            delay={delay + 300}
          />
        </View>
        </View>
        </ThemeChrome>
      </Animated.View>
    </Pressable>
  );
}

export function LeaderboardContent({
  showBackButton = false,
  onBack,
}: {
  showBackButton?: boolean;
  onBack?: () => void;
}) {
  const theme = useAppTheme();
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showScoringHelp, setShowScoringHelp] = useState(false);
  const [showFlightRankings, setShowFlightRankings] = useState(false);
  const [showWorkoutTypesModal, setShowWorkoutTypesModal] = useState(false);
  const leaderboardOverlayLabel = showFlightRankings
    ? 'Flight Rankings'
    : showWorkoutTypesModal
      ? 'Workout Types'
    : showScoringHelp
      ? 'How Points Work'
      : null;
  useErrorLogScreenContext('Leaderboard', leaderboardOverlayLabel);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedFlight] = useState<Flight | 'all'>('all');
  const members = useMemberStore(s => s.members);
  const ptSessions = useMemberStore(s => s.ptSessions);
  const user = useAuthStore(s => s.user);

  const userName = user ? getShortDisplayName(user) : 'Airman';
  const userSquadron = user?.squadron ?? 'Hawks';
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  useEffect(() => {
    trackAnalyticsEvent('open_leaderboard', {
      squadron: userSquadron,
    });
  }, [userSquadron]);

  const squadronMembers = useMemo(() => {
    return members.filter(m => m.squadron === userSquadron);
  }, [members, userSquadron]);

  const currentMonthKey = useMemo(() => getMonthKey(), []);
  const currentMonthSummaries = useMemo(() => {
    return new Map(
      squadronMembers.map((member) => [
        member.id,
        getMemberMonthSummary(member, currentMonthKey, ptSessions),
      ])
    );
  }, [currentMonthKey, ptSessions, squadronMembers]);

  const allRankedMembers = useMemo<LeaderboardMember[]>(() => {
    return squadronMembers
      .map(m => {
        const summary = currentMonthSummaries.get(m.id) ?? getMemberMonthSummary(m, currentMonthKey, ptSessions);
        return {
          id: m.id,
          rank: m.rank,
          firstName: m.firstName,
          lastName: m.lastName,
          flight: m.flight,
          exerciseMinutes: summary.minutes,
          distanceRun: summary.miles,
          workoutCount: summary.workoutCount,
          totalScore: summary.score,
          trophyCount: m.trophyCount,
          monthlyPlacements: m.monthlyPlacements,
          hardAchievements: ALL_ACHIEVEMENTS
            .filter(a => a.isHard && getEffectiveAchievementIds(m).includes(a.id))
            .map(a => ({ id: a.id, name: a.name })),
        };
      })
      .sort((a, b) => b.totalScore - a.totalScore);
  }, [currentMonthKey, currentMonthSummaries, ptSessions, squadronMembers]);

  const isFlightSearch = useMemo(
    () => normalizedSearchQuery.length > 0 && FLIGHTS.some((flight) => flight.toLowerCase() === normalizedSearchQuery),
    [normalizedSearchQuery]
  );

  const sortedMembers = useMemo<LeaderboardMember[]>(() => {
    let filtered = allRankedMembers;

    if (normalizedSearchQuery) {
      filtered = filtered.filter(m =>
        m.firstName.toLowerCase().includes(normalizedSearchQuery) ||
        m.lastName.toLowerCase().includes(normalizedSearchQuery) ||
        m.flight.toLowerCase().includes(normalizedSearchQuery) ||
        `${m.rank} ${m.firstName} ${m.lastName}`.toLowerCase().includes(normalizedSearchQuery)
      );
    }

    if (selectedFlight !== 'all') {
      filtered = filtered.filter(m => m.flight === selectedFlight);
    }

    return filtered;
  }, [allRankedMembers, normalizedSearchQuery, selectedFlight]);

  const overallPositionsByMemberId = useMemo(() => {
    const scores = allRankedMembers.map((member) => member.totalScore);
    return new Map(allRankedMembers.map((member, index) => [member.id, getCompetitionPosition(scores, index)]));
  }, [allRankedMembers]);

  const maxValues = useMemo(() => ({
    minutes: Math.max(...squadronMembers.map(m => currentMonthSummaries.get(m.id)?.minutes ?? 0), 1),
    distance: Math.max(...squadronMembers.map(m => currentMonthSummaries.get(m.id)?.miles ?? 0), 1),
    workouts: Math.max(...squadronMembers.map(m => currentMonthSummaries.get(m.id)?.workoutCount ?? 0), 1),
  }), [currentMonthSummaries, squadronMembers]);

  const squadronTotals = useMemo(() => ({
    hours: (squadronMembers.reduce((acc, member) => acc + (currentMonthSummaries.get(member.id)?.minutes ?? 0), 0) / 60),
    miles: squadronMembers.reduce((acc, member) => acc + (currentMonthSummaries.get(member.id)?.miles ?? 0), 0),
    workouts: squadronMembers.reduce((acc, member) => acc + (currentMonthSummaries.get(member.id)?.workoutCount ?? 0), 0),
  }), [currentMonthSummaries, squadronMembers]);

  const squadronLeaders = useMemo(() => {
    const categories = {
      hours: squadronMembers.map((member) => ({
        member,
        value: (currentMonthSummaries.get(member.id)?.minutes ?? 0) / 60,
      })),
      miles: squadronMembers.map((member) => ({
        member,
        value: currentMonthSummaries.get(member.id)?.miles ?? 0,
      })),
      workouts: squadronMembers.map((member) => ({
        member,
        value: currentMonthSummaries.get(member.id)?.workoutCount ?? 0,
      })),
    } as const;

    const getLeader = (entries: Array<{ member: typeof squadronMembers[number]; value: number }>) => {
      const sorted = [...entries].sort((left, right) => {
        if (right.value !== left.value) {
          return right.value - left.value;
        }
        return `${left.member.lastName} ${left.member.firstName}`.localeCompare(`${right.member.lastName} ${right.member.firstName}`);
      });
      const leader = sorted[0];
      return leader && leader.value > 0
        ? getShortDisplayName({ rank: leader.member.rank, lastName: leader.member.lastName })
        : 'None';
    };

    return {
      hours: getLeader(categories.hours),
      miles: getLeader(categories.miles),
      workouts: getLeader(categories.workouts),
    };
  }, [currentMonthSummaries, squadronMembers]);

  const squadronWorkoutBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    WORKOUT_TYPES.forEach(type => { counts.set(type, 0); });
    counts.set('Attendance', 0);

    let totalWorkouts = 0;
    squadronMembers.forEach(member => {
      const summary = currentMonthSummaries.get(member.id) ?? getMemberMonthSummary(member, currentMonthKey, ptSessions);
      summary.workouts.forEach(workout => {
        const label = workout.source === 'attendance' ? 'Attendance' : workout.type;
        counts.set(label, (counts.get(label) ?? 0) + 1);
        totalWorkouts++;
      });
    });

    const breakdown = Array.from(counts.entries())
      .map(([label, count]) => ({
        label,
        count,
        percentage: totalWorkouts > 0 ? (count / totalWorkouts) * 100 : 0,
      }))
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count);

    return { breakdown, totalWorkouts };
  }, [currentMonthKey, currentMonthSummaries, ptSessions, squadronMembers]);

  const flightPointsRanking = useMemo(() => {
    const pointsByFlight = new Map<Flight, { flight: Flight; totalPoints: number; averagePoints: number; members: number }>();

    squadronMembers.forEach((member) => {
      const summary = currentMonthSummaries.get(member.id) ?? getMemberMonthSummary(member, currentMonthKey, ptSessions);
      const current = pointsByFlight.get(member.flight) ?? { flight: member.flight, totalPoints: 0, averagePoints: 0, members: 0 };
      current.totalPoints += summary.score;
      current.members += 1;
      pointsByFlight.set(member.flight, current);
    });

    return Array.from(pointsByFlight.values())
      .map((entry) => ({
        ...entry,
        averagePoints: entry.members > 0 ? entry.totalPoints / entry.members : 0,
      }))
      .sort((a, b) => {
      if (b.averagePoints !== a.averagePoints) return b.averagePoints - a.averagePoints;
      return a.flight.localeCompare(b.flight);
    });
  }, [currentMonthKey, currentMonthSummaries, ptSessions, squadronMembers]);

  const topFlights = flightPointsRanking.slice(0, 3);
  const flightRankingPositions = useMemo(() => {
    const scores = flightPointsRanking.map((entry) => entry.averagePoints);
    return scores.map((_, index) => getCompetitionPosition(scores, index));
  }, [flightPointsRanking]);

  const displayedMembers = isExpanded ? sortedMembers : sortedMembers.slice(0, 10);
  const displayedPositions = useMemo(() => {
    if (normalizedSearchQuery && !isFlightSearch) {
      return displayedMembers.map((member) => overallPositionsByMemberId.get(member.id) ?? 0);
    }

    const scores = displayedMembers.map((member) => member.totalScore);
    return scores.map((_, index) => getCompetitionPosition(scores, index));
  }, [displayedMembers, isFlightSearch, normalizedSearchQuery, overallPositionsByMemberId]);

  const currentUserRank = useMemo(() => {
    if (!user) {
      return null;
    }
    return overallPositionsByMemberId.get(user.id) ?? null;
  }, [overallPositionsByMemberId, user]);

  const toggleExpand = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsExpanded(!isExpanded);
  };

  const handleMemberPress = (memberId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/member-profile?id=${memberId}`);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await requestRegisteredSync('global');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <LinearGradient colors={theme.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      <ThemeBackdrop />

      <SafeAreaView edges={['top']} className="flex-1">
        <TopStatusBar title="Leaderboard" subtitle={`${userSquadron} Squadron`} />

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={theme.accent} />
          }
        >
          <Animated.View entering={FadeInDown.delay(100).springify()} className="px-6 pt-4 mb-3">
            <View className="flex-row items-center justify-between mb-3">
              {showBackButton ? (
                <Pressable
                  onPress={onBack}
                  className="flex-row items-center self-start"
                >
                  <ArrowLeft size={18} color={theme.textSecondary} />
                  <Text className="font-medium ml-2" style={{ color: theme.textSecondary }}>Back to Home</Text>
                </Pressable>
              ) : (
                <View />
              )}
            </View>

            <View className="flex-row items-center justify-between">
            <View className="flex-1 mr-3">
              <View className="flex-row items-center">
                <Text style={getThemeHeadingStyle(theme, 22)} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{userName}</Text>
                {typeof currentUserRank === 'number' && currentUserRank > 0 ? (
                  <View
                    className="ml-2 px-2.5 py-1 rounded-full border"
                    style={{ backgroundColor: theme.accentSoft, borderColor: `${theme.accent}55` }}
                  >
                    <Text style={[getThemeBodyStyle(theme, 12, theme.accent), { fontWeight: '700' }]}>#{currentUserRank}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View className="flex-row items-center flex-shrink-0">
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowScoringHelp(true);
                }}
                className="mr-2 items-center justify-center"
                hitSlop={8}
              >
                <CircleHelp size={14} color={theme.textSecondary} />
              </Pressable>
              <View className="flex-row items-center px-3 py-2 rounded-full" style={getThemeControlStyle(theme, true)}>
                <Trophy size={16} color="#FFD700" />
                <Text className="font-bold text-sm ml-1" style={{ color: theme.accentAlt }}>Leaderboard</Text>
              </View>
            </View>
          </View>
        </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).springify()} className="mx-6">
            <ThemeChrome theme={theme} variant="feature">
              <View className="px-4 py-3">
                <Text style={[getThemeBodyStyle(theme, 11, theme.textMuted), { textTransform: 'uppercase', marginBottom: 8 }]}>Squadron Totals This Month</Text>
                <View className="flex-row justify-between items-center">
                  <View className="flex-1 flex-row items-center">
                    <Timer size={18} color="#4A90D9" />
                    <Text className="text-white font-bold text-lg ml-2">{squadronTotals.hours.toFixed(2)}</Text>
                    <Text className="text-af-silver text-xs ml-1">Hours</Text>
                  </View>
                  <View className="w-px h-8 bg-white/10 mx-3" />
                  <View className="flex-1 flex-row items-center">
                    <RunningIcon size={18} color="#22C55E" />
                    <Text className="text-white font-bold text-lg ml-2">{squadronTotals.miles.toFixed(2)}</Text>
                    <Text className="text-af-silver text-xs ml-1">Miles</Text>
                  </View>
                  <View className="w-px h-8 bg-white/10 mx-3" />
                  <View className="flex-1 flex-row items-center">
                    <Dumbbell size={18} color="#A855F7" />
                    <Text className="text-white font-bold text-lg ml-2">{squadronTotals.workouts}</Text>
                    <Text className="text-af-silver text-xs ml-1">Workouts</Text>
                  </View>
                </View>
              </View>
            </ThemeChrome>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(225).springify()} className="mx-6 mt-3">
            <ThemeChrome theme={theme} variant="feature">
              <View className="px-4 py-3">
                <Text style={[getThemeBodyStyle(theme, 11, theme.textMuted), { textTransform: 'uppercase', marginBottom: 8 }]}>Current Leaders This Month</Text>
                <View className="flex-row justify-between items-center">
                  <View className="flex-1 flex-row items-center">
                    <Timer size={18} color="#4A90D9" />
                    <Text
                      style={[getThemeBodyStyle(theme, 13, theme.textPrimary), { fontWeight: '700', marginLeft: 8, flexShrink: 1 }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.72}
                    >
                      {squadronLeaders.hours}
                    </Text>
                  </View>
                  <View className="w-px h-8 bg-white/10 mx-3" />
                  <View className="flex-1 flex-row items-center">
                    <RunningIcon size={18} color="#22C55E" />
                    <Text
                      style={[getThemeBodyStyle(theme, 13, theme.textPrimary), { fontWeight: '700', marginLeft: 8, flexShrink: 1 }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.72}
                    >
                      {squadronLeaders.miles}
                    </Text>
                  </View>
                  <View className="w-px h-8 bg-white/10 mx-3" />
                  <View className="flex-1 flex-row items-center">
                    <Dumbbell size={18} color="#A855F7" />
                    <Text
                      style={[getThemeBodyStyle(theme, 13, theme.textPrimary), { fontWeight: '700', marginLeft: 8, flexShrink: 1 }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.72}
                    >
                      {squadronLeaders.workouts}
                    </Text>
                  </View>
                </View>
              </View>
            </ThemeChrome>
          </Animated.View>

          {(squadronWorkoutBreakdown.totalWorkouts > 0 || flightPointsRanking.length > 0) && (
            <Animated.View entering={FadeInDown.delay(250).springify()} className="mx-6 mt-3">
              <View className="flex-row items-stretch">
                {squadronWorkoutBreakdown.totalWorkouts > 0 ? (
                  <View className="flex-1 mr-2">
                    <Pressable
                      disabled={squadronWorkoutBreakdown.breakdown.length <= 3}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setShowWorkoutTypesModal(true);
                      }}
                    >
                      <ThemeChrome theme={theme} variant="feature">
                        <View className="p-4 justify-between" style={{ height: 194 }}>
                          <View className="mb-3">
                            <View className="flex-row items-center justify-between">
                              <View className="flex-row items-center flex-1 pr-2">
                                <BarChart3 size={16} color={theme.accent} />
                                <Text style={[getThemeBodyStyle(theme, 11, theme.textMuted), { textTransform: 'uppercase', marginLeft: 8 }]}>Workout Types</Text>
                              </View>
                              {squadronWorkoutBreakdown.breakdown.length > 3 ? (
                                <Text style={getThemeBodyStyle(theme, 11, theme.accent)}>Open</Text>
                              ) : null}
                            </View>
                            <Text
                              style={[getThemeBodyStyle(theme, 12), { marginTop: 8, textAlign: 'left', flexShrink: 1 }]}
                              numberOfLines={2}
                              adjustsFontSizeToFit
                              minimumFontScale={0.68}
                            >
                              {squadronWorkoutBreakdown.breakdown.length} {squadronWorkoutBreakdown.breakdown.length === 1 ? 'type' : 'types'} | {squadronWorkoutBreakdown.totalWorkouts} total {squadronWorkoutBreakdown.totalWorkouts === 1 ? 'workout' : 'workouts'}
                            </Text>
                          </View>
                          {squadronWorkoutBreakdown.breakdown.slice(0, 3).map((item, index) => (
                            <WorkoutTypeAnalyticsBar
                              key={item.label}
                              label={item.label}
                              count={item.count}
                              percentage={item.percentage}
                              maxPercentage={squadronWorkoutBreakdown.breakdown[0]?.percentage ?? 100}
                              delay={250 + index * 50}
                            />
                          ))}
                          <View style={{ minHeight: 22, justifyContent: 'flex-end', paddingTop: 8 }}>
                            {squadronWorkoutBreakdown.breakdown.length > 3 ? (
                              <Text
                                style={getThemeBodyStyle(theme, 11, theme.textSecondary)}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.75}
                              >
                                Tap to view all {squadronWorkoutBreakdown.breakdown.length} types
                              </Text>
                            ) : (
                              <Text style={getThemeBodyStyle(theme, 11, 'transparent')}>
                                Tap to view all 000 types
                              </Text>
                            )}
                          </View>
                        </View>
                      </ThemeChrome>
                    </Pressable>
                  </View>
                ) : null}

                {flightPointsRanking.length > 0 ? (
                  <View className={squadronWorkoutBreakdown.totalWorkouts > 0 ? "flex-1 ml-2" : "flex-1"}>
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync();
                        setShowFlightRankings(true);
                      }}
                    >
                      <ThemeChrome theme={theme} variant="feature">
                        <View className="p-4 justify-between" style={{ height: 194 }}>
                          <View className="mb-3">
                            <View className="flex-row items-center justify-between">
                              <View className="flex-row items-center">
                                <Users size={16} color={theme.accent} />
                                <Text style={[getThemeBodyStyle(theme, 11, theme.textMuted), { textTransform: 'uppercase', marginLeft: 8 }]}>Flight Rankings</Text>
                              </View>
                              <Text style={getThemeBodyStyle(theme, 11, theme.accent)}>Open</Text>
                            </View>
                          </View>

                          {topFlights.map((entry, index) => (
                            <View
                              key={entry.flight}
                              className={index === topFlights.length - 1 ? 'flex-row items-center justify-between' : 'flex-row items-center justify-between mb-3'}
                            >
                              <View className="flex-row items-center flex-1 pr-2">
                                {flightRankingPositions[index] === 1 ? (
                                  <Crown size={14} color="#FFD700" />
                                ) : flightRankingPositions[index] === 2 ? (
                                  <Medal size={14} color="#C0C0C0" />
                                ) : flightRankingPositions[index] === 3 ? (
                                  <Medal size={14} color="#CD7F32" />
                                ) : (
                                  <Text style={[getThemeBodyStyle(theme, 12, theme.textPrimary), { fontWeight: '700' }]}>
                                    {flightRankingPositions[index]}
                                  </Text>
                                )}
                                <Text
                                  style={[getThemeBodyStyle(theme, 12, theme.textPrimary), { fontWeight: '600', marginLeft: 6 }]}
                                  numberOfLines={1}
                                  adjustsFontSizeToFit
                                  minimumFontScale={0.72}
                                >
                                  {entry.flight}
                                </Text>
                              </View>
                              <View className="items-end">
                                <Text style={getThemeHeadingStyle(theme, 15)}>{entry.averagePoints.toFixed(1)}</Text>
                                <Text style={getThemeBodyStyle(theme, 10, theme.textMuted)}>avg</Text>
                              </View>
                            </View>
                          ))}

                          <View style={{ minHeight: 22, justifyContent: 'flex-end', paddingTop: 8 }}>
                            {flightPointsRanking.length > 2 ? (
                              <Text style={getThemeBodyStyle(theme, 11, theme.textSecondary)}>
                                Tap to view all {flightPointsRanking.length} flights
                              </Text>
                            ) : (
                              <Text style={getThemeBodyStyle(theme, 11, 'transparent')}>
                                Tap to view all 000 flights
                              </Text>
                            )}
                          </View>
                        </View>
                      </ThemeChrome>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </Animated.View>
          )}

          <Animated.View entering={FadeInDown.delay(275).springify()} className="mx-6 mt-3">
            <View className="flex-row items-center rounded-xl px-4 py-3" style={getThemeControlStyle(theme)}>
              <Search size={20} color={theme.textSecondary} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search by name or flight..."
                placeholderTextColor={theme.textMuted}
                className="flex-1 ml-3 text-base"
                style={{ color: theme.textPrimary }}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')}>
                  <X size={18} color={theme.textSecondary} />
                </Pressable>
              )}
            </View>
          </Animated.View>

          <View className="flex-row items-center justify-between px-6 mt-3 mb-3">
            <Text style={getThemeHeadingStyle(theme, 20)}>{isExpanded ? 'All Members' : 'Top 10 Performers'}</Text>
            <Pressable onPress={toggleExpand} className="flex-row items-center px-3 py-1.5 rounded-full" style={getThemeControlStyle(theme)}>
              <Text className="text-sm mr-1" style={{ color: theme.textSecondary }}>{isExpanded ? 'Show Less' : 'Show All'}</Text>
              {isExpanded ? <ChevronUp size={16} color={theme.textSecondary} /> : <ChevronDown size={16} color={theme.textSecondary} />}
            </Pressable>
          </View>

          <View className="px-6">
            {displayedMembers.map((member, index) => (
            <LeaderboardCard
              key={member.id}
              member={member}
              position={displayedPositions[index] ?? index + 1}
              maxValues={maxValues}
              delay={300 + index * 50}
              onPress={() => handleMemberPress(member.id)}
              theme={theme}
            />
            ))}
          </View>
        </ScrollView>

        <Modal
          visible={showScoringHelp}
          transparent
          animationType="fade"
          onRequestClose={() => setShowScoringHelp(false)}
        >
          <View className="flex-1 bg-black/75 justify-center px-6">
            <ThemeChrome theme={theme} variant="feature">
            <View className="p-6">
              <View className="flex-row items-center justify-between">
                <Text style={getThemeHeadingStyle(theme, 20)}>How Points Work</Text>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    setShowScoringHelp(false);
                  }}
                  className="w-9 h-9 rounded-full items-center justify-center"
                  style={getThemeControlStyle(theme)}
                >
                  <X size={18} color={theme.textSecondary} />
                </Pressable>
              </View>

              <Text style={[getThemeBodyStyle(theme, 14, theme.textSecondary), { marginTop: 16 }]}>
                The leaderboard uses monthly points. Attendance is worth the fewest points, and workouts earn points based on whichever is stronger: time or distance.
              </Text>

              <View className="mt-5 space-y-3">
                <ThemeChrome theme={theme}>
                <View className="p-4">
                  <Text style={[getThemeBodyStyle(theme, 15, theme.textPrimary), { fontWeight: '600' }]}>Attendance</Text>
                  <Text style={[getThemeBodyStyle(theme, 14, theme.textSecondary), { marginTop: 4 }]}>
                    Marked attendance on the Attendance tab earns {ATTENDANCE_CHECK_IN_POINTS} points per check-in.
                  </Text>
                </View>
                </ThemeChrome>

                <ThemeChrome theme={theme}>
                <View className="mt-3 p-4">
                  <Text style={[getThemeBodyStyle(theme, 15, theme.textPrimary), { fontWeight: '600' }]}>Workout Points</Text>
                  <Text style={[getThemeBodyStyle(theme, 14, theme.textSecondary), { marginTop: 4 }]}>
                    Each workout earns the higher of:
                  </Text>
                  <Text style={[getThemeBodyStyle(theme, 14), { marginTop: 8 }]}>{WORKOUT_POINTS_PER_MINUTE} point per minute</Text>
                  <Text style={[getThemeBodyStyle(theme, 14), { marginTop: 4 }]}>{WORKOUT_POINTS_PER_MILE} points per mile</Text>
                </View>
                </ThemeChrome>

                <ThemeChrome theme={theme} variant="feature">
                <View className="mt-3 p-4">
                  <Text style={[getThemeBodyStyle(theme, 15, theme.textPrimary), { fontWeight: '600' }]}>Examples</Text>
                  <Text style={[getThemeBodyStyle(theme, 14, theme.textSecondary), { marginTop: 4 }]}>30-minute strength workout = 30 points</Text>
                  <Text style={[getThemeBodyStyle(theme, 14, theme.textSecondary), { marginTop: 4 }]}>2-mile run = 30 points</Text>
                  <Text style={[getThemeBodyStyle(theme, 14, theme.textSecondary), { marginTop: 4 }]}>45-minute workout = 45 points</Text>
                  <Text style={[getThemeBodyStyle(theme, 14, theme.textSecondary), { marginTop: 4 }]}>3-mile run = 45 points</Text>
                </View>
                </ThemeChrome>
              </View>

              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowScoringHelp(false);
                }}
                className="mt-6 self-end rounded-full border px-4 py-2"
                style={{ borderColor: `${theme.accent}66`, backgroundColor: theme.accentSoft }}
              >
                <Text style={[getThemeBodyStyle(theme, 14, theme.textPrimary), { fontWeight: '600' }]}>Got it</Text>
              </Pressable>
            </View>
            </ThemeChrome>
          </View>
        </Modal>

        <Modal
          visible={showWorkoutTypesModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowWorkoutTypesModal(false)}
        >
          <View className="flex-1 bg-black/75 justify-center items-center px-5">
            <View style={{ width: '100%', maxWidth: 460, height: '78%' }}>
              <ThemeChrome theme={theme} variant="feature" blurIntensity={40} style={{ width: '100%', height: '100%' }} fill>
                <View style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  <View className="flex-row items-center justify-between p-6 pb-0">
                    <Text style={getThemeHeadingStyle(theme, 20)}>Workout Types</Text>
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync();
                        setShowWorkoutTypesModal(false);
                      }}
                      className="w-9 h-9 rounded-full items-center justify-center"
                      style={getThemeControlStyle(theme)}
                    >
                      <X size={18} color={theme.textSecondary} />
                    </Pressable>
                  </View>

                  <Text style={[getThemeBodyStyle(theme, 14, theme.textSecondary), { marginTop: 14, paddingHorizontal: 24 }]}>
                    Full monthly workout-type breakdown.
                  </Text>

                  <ScrollView
                    className="mt-5"
                    style={{ flex: 1, minHeight: 0 }}
                    contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
                    showsVerticalScrollIndicator={false}
                  >
                    {squadronWorkoutBreakdown.breakdown.map((item, index) => (
                      <ThemeChrome key={item.label} theme={theme} variant={index < 3 ? 'feature' : 'default'}>
                        <View className={index === squadronWorkoutBreakdown.breakdown.length - 1 ? 'p-4' : 'p-4 mb-3'}>
                          <WorkoutTypeAnalyticsBar
                            label={item.label}
                            count={item.count}
                            percentage={item.percentage}
                            maxPercentage={squadronWorkoutBreakdown.breakdown[0]?.percentage ?? 100}
                            delay={index * 40}
                          />
                        </View>
                      </ThemeChrome>
                    ))}
                  </ScrollView>
                </View>
              </ThemeChrome>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showFlightRankings}
          transparent
          animationType="fade"
          onRequestClose={() => setShowFlightRankings(false)}
        >
          <View className="flex-1 bg-black/75 justify-center items-center px-5">
            <View style={{ width: '100%', maxWidth: 460, height: '80%' }}>
            <ThemeChrome theme={theme} variant="feature" blurIntensity={40} style={{ width: '100%', height: '100%' }} fill>
              <View style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <View className="flex-row items-center justify-between p-6 pb-0">
                  <Text style={getThemeHeadingStyle(theme, 20)}>Flight Rankings</Text>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setShowFlightRankings(false);
                    }}
                    className="w-9 h-9 rounded-full items-center justify-center"
                    style={getThemeControlStyle(theme)}
                  >
                    <X size={18} color={theme.textSecondary} />
                  </Pressable>
                </View>

                <Text style={[getThemeBodyStyle(theme, 14, theme.textSecondary), { marginTop: 14, paddingHorizontal: 24 }]}>
                  Flight score is the average monthly leaderboard points across members in each flight.
                </Text>

                  <ScrollView
                    className="mt-5"
                    style={{ flex: 1, minHeight: 0 }}
                    contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
                    showsVerticalScrollIndicator={false}
                  >
                    {flightPointsRanking.map((entry, index) => (
                    <ThemeChrome key={entry.flight} theme={theme} variant={(flightRankingPositions[index] ?? 99) <= 3 ? 'feature' : 'default'}>
                      <View className={index === flightPointsRanking.length - 1 ? 'p-4' : 'p-4 mb-3'}>
                        <View className="flex-row items-center justify-between">
                          <View className="flex-row items-center flex-1 pr-3">
                            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: (flightRankingPositions[index] ?? 99) === 1 ? 'rgba(255,215,0,0.18)' : (flightRankingPositions[index] ?? 99) === 2 ? 'rgba(192,192,192,0.16)' : (flightRankingPositions[index] ?? 99) === 3 ? 'rgba(205,127,50,0.16)' : theme.surfaceAlt }}>
                              {(flightRankingPositions[index] ?? 99) === 1 ? (
                                <Crown size={15} color="#FFD700" />
                              ) : (flightRankingPositions[index] ?? 99) === 2 ? (
                                <Medal size={15} color="#C0C0C0" />
                              ) : (flightRankingPositions[index] ?? 99) === 3 ? (
                                <Medal size={15} color="#CD7F32" />
                              ) : (
                                <Text style={[getThemeBodyStyle(theme, 13, theme.textPrimary), { fontWeight: '700' }]}>{flightRankingPositions[index] ?? index + 1}</Text>
                              )}
                            </View>
                            <View className="flex-1">
                              <Text style={[getThemeBodyStyle(theme, 15, theme.textPrimary), { fontWeight: '600' }]}>{formatFlightDisplay(entry.flight)}</Text>
                              <Text style={[getThemeBodyStyle(theme, 12, theme.textSecondary), { marginTop: 4 }]}>
                                {entry.members} member{entry.members === 1 ? '' : 's'}
                              </Text>
                            </View>
                          </View>
                          <View className="items-end">
                            <Text style={getThemeHeadingStyle(theme, 20)}>{entry.averagePoints.toFixed(1)}</Text>
                            <Text style={getThemeBodyStyle(theme, 10, theme.textMuted)}>avg</Text>
                          </View>
                        </View>
                      </View>
                    </ThemeChrome>
                  ))}
                </ScrollView>
              </View>
            </ThemeChrome>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}


