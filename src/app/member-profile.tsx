import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Image, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Timer, MapPin, Trophy, Lock, Unlock, TrendingUp, Shield, Camera, Dumbbell, Activity, Image as ImageIcon, BarChart3, User, X, FileText } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withSpring, withDelay } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useMemberStore, useAuthStore, getDisplayName, ALL_ACHIEVEMENTS, canManagePTPrograms, type AccountType, type WorkoutType, WORKOUT_TYPES } from '@/lib/store';
import { cn } from '@/lib/cn';
import { TrophyCase, CompactTrophyBadges } from '@/components/TrophyCase';
import { buildTrophyStats, getRarestEarnedTrophies } from '@/lib/trophies';
import { formatMonthLabel, getAvailableMonthKeys, getMemberEffectiveWorkouts, getMemberMonthSummary, getMonthKey } from '@/lib/monthlyStats';

function getWorkoutDisplayTitle(type: WorkoutType) {
  switch (type) {
    case 'Running':
      return 'Run';
    case 'Walking':
      return 'Walk';
    case 'Cycling':
      return 'Ride';
    case 'Swimming':
      return 'Swim';
    default:
      return type;
  }
}

// Workout type colors
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

function WorkoutTypeBar({
  type,
  count,
  percentage,
  maxPercentage,
  delay = 0,
}: {
  type: string;
  count: number;
  percentage: number;
  maxPercentage: number;
  delay?: number;
}) {
  const barWidth = useSharedValue(0);
  const normalizedWidth = maxPercentage > 0 ? (percentage / maxPercentage) * 100 : 0;

  useEffect(() => {
    barWidth.value = withDelay(delay, withSpring(normalizedWidth, { damping: 15, stiffness: 100 }));
  }, [percentage, maxPercentage]);

  const animatedBarStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value}%`,
  }));

  const color = type === 'Attendance' ? '#FACC15' : (WORKOUT_TYPE_COLORS[type as WorkoutType] ?? '#6B7280');

  return (
    <View className="mb-3">
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-white text-sm">{type}</Text>
        <Text className="text-af-silver text-xs">{count} ({percentage.toFixed(0)}%)</Text>
      </View>
      <View className="h-3 bg-white/10 rounded-full overflow-hidden">
        <Animated.View
          style={[animatedBarStyle, { backgroundColor: color }]}
          className="h-full rounded-full"
        />
      </View>
    </View>
  );
}

function getCompetitionPosition(scores: number[], index: number): number {
  if (index <= 0) {
    return 1;
  }

  return scores[index] === scores[index - 1] ? getCompetitionPosition(scores, index - 1) : index + 1;
}

export default function MemberProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const members = useMemberStore(s => s.members);
  const ptSessions = useMemberStore(s => s.ptSessions);
  const currentUser = useAuthStore(s => s.user);
  const currentUserSquadron = currentUser?.squadron ?? 'Hawks';

  const [showTrophyCase, setShowTrophyCase] = useState(false);
  const [selectedSummaryMonth, setSelectedSummaryMonth] = useState(getMonthKey());
  const [showWorkoutHistoryModal, setShowWorkoutHistoryModal] = useState(false);
  const [showPFRAHistoryModal, setShowPFRAHistoryModal] = useState(false);
  const [showLeaderboardHistoryModal, setShowLeaderboardHistoryModal] = useState(false);
  const [expandedWorkoutImageUri, setExpandedWorkoutImageUri] = useState<string | null>(null);

  const member = useMemo(() => {
    const rawId = Array.isArray(id) ? id[0] : id;
    const normalizedId = rawId?.trim();
    const normalizedLowerId = normalizedId?.toLowerCase();
    return members.find((candidate) =>
      candidate.id === normalizedId ||
      candidate.email.trim().toLowerCase() === normalizedLowerId
    );
  }, [members, id]);
  const canViewMember =
    !!member &&
    (!!currentUser && (member.id === currentUser.id || member.squadron === currentUserSquadron || currentUser.accountType === 'fitflight_creator'));

  // All hooks must be called before early returns
  const isOwnProfile = currentUser?.id === member?.id;
  const canViewAllWorkouts = isOwnProfile || canManagePTPrograms(currentUser?.accountType ?? 'standard');
  const canViewWorkoutHistorySection = isOwnProfile || (member?.showWorkoutHistoryOnProfile ?? true);
  const canViewWorkoutUploadsSection = isOwnProfile || (member?.showWorkoutUploadsOnProfile ?? true);
  const canViewPFRASection = isOwnProfile || (member?.showPFRARecordsOnProfile ?? true);

  const allEffectiveWorkouts = useMemo(() => {
    if (!member) return [];
    return getMemberEffectiveWorkouts(member, ptSessions);
  }, [member, ptSessions]);

  const visibleWorkouts = useMemo(() => {
    if (!member) return [];
    if (canViewAllWorkouts) {
      return allEffectiveWorkouts;
    }
    return allEffectiveWorkouts.filter((workout) => !workout.isPrivate);
  }, [allEffectiveWorkouts, canViewAllWorkouts, member]);
  const uploadedVisibleWorkouts = useMemo(
    () => visibleWorkouts.filter((workout) => ['manual', 'screenshot', 'strava'].includes(workout.source)),
    [visibleWorkouts]
  );

  // Calculate leaderboard position
  const sortedMembers = useMemo(() => {
    const currentMonthKey = getMonthKey();
    return members
      .filter((candidate) => candidate.squadron === (member?.squadron ?? currentUserSquadron))
      .sort((a, b) => {
      const scoreA = getMemberMonthSummary(a, currentMonthKey, ptSessions).score;
      const scoreB = getMemberMonthSummary(b, currentMonthKey, ptSessions).score;
      return scoreB - scoreA;
    });
  }, [currentUserSquadron, member?.squadron, members, ptSessions]);

  const leaderboardPosition = useMemo(() => {
    if (!member) {
      return 0;
    }

    const index = sortedMembers.findIndex(m => m.id === member.id);
    if (index < 0) {
      return 0;
    }

    const scores = sortedMembers.map((candidate) => getMemberMonthSummary(candidate, getMonthKey(), ptSessions).score);
    return getCompetitionPosition(scores, index);
  }, [member, ptSessions, sortedMembers]);

  if (!member || !canViewMember) {
    return (
      <View className="flex-1 bg-af-navy items-center justify-center">
        <Text className="text-white">{member ? 'You do not have access to this member profile' : 'Member not found'}</Text>
      </View>
    );
  }

  const displayName = getDisplayName(member);
  const availableSummaryMonths = useMemo(
    () => getAvailableMonthKeys([member], ptSessions),
    [member, ptSessions]
  );
  const summaryMonth = availableSummaryMonths.includes(selectedSummaryMonth)
    ? selectedSummaryMonth
    : availableSummaryMonths[0] ?? getMonthKey();
  const monthlySummary = getMemberMonthSummary(member, summaryMonth, ptSessions);
  const totalScore = monthlySummary.score;
  const monthVisibleWorkouts = useMemo(
    () => visibleWorkouts.filter((workout) => workout.date.startsWith(summaryMonth)),
    [summaryMonth, visibleWorkouts]
  );
  const workoutTypeBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    WORKOUT_TYPES.forEach((type) => counts.set(type, 0));
    counts.set('Attendance', 0);

    monthVisibleWorkouts.forEach((workout) => {
      const label = workout.source === 'attendance' ? 'Attendance' : workout.type;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });

    const total = monthVisibleWorkouts.length;
    return Array.from(counts.entries())
      .map(([type, count]) => ({
        type,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [monthVisibleWorkouts]);

  // Get fitness assessments (check privacy)
  const canViewFitnessAssessments = isOwnProfile ||
    !member.fitnessAssessments.some(fa => fa.isPrivate) ||
    currentUser?.accountType === 'fitflight_creator' ||
    currentUser?.accountType === 'ufpm' ||
    currentUser?.accountType === 'demo' ||
    currentUser?.accountType === 'squadron_leadership';
  const pfraHistory = useMemo(
    () => [...member.fitnessAssessments].sort((a, b) => b.date.localeCompare(a.date)),
    [member]
  );
  const monthlyPFRAEntries = useMemo(
    () => pfraHistory.filter((assessment) => assessment.date.startsWith(summaryMonth)),
    [pfraHistory, summaryMonth]
  );
  const latestAssessment = pfraHistory[0];
  const latestMonthlyPFRA = monthlyPFRAEntries[0] ?? null;
  const leaderboardHistory = useMemo(
    () => [...member.leaderboardHistory].sort((a, b) => b.month.localeCompare(a.month)),
    [member]
  );

  const getAccountTypeLabel = (accountType: AccountType) => {
    switch (accountType) {
      case 'fitflight_creator': return 'FitFlight Creator';
      case 'ufpm': return 'UFPM';
      case 'demo': return 'Demo Role';
      case 'squadron_leadership': return 'Squadron Leadership';
      case 'ptl': return 'PFL';
      default: return 'Member';
    }
  };

  const getAccountTypeColor = (accountType: AccountType) => {
    switch (accountType) {
      case 'fitflight_creator': return { bg: 'bg-purple-500/20', text: 'text-purple-400' };
      case 'ufpm': return { bg: 'bg-af-gold/20', text: 'text-af-gold' };
      case 'demo': return { bg: 'bg-emerald-500/20', text: 'text-emerald-300' };
      case 'squadron_leadership': return { bg: 'bg-sky-500/20', text: 'text-sky-300' };
      case 'ptl': return { bg: 'bg-af-accent/20', text: 'text-af-accent' };
      default: return { bg: 'bg-white/10', text: 'text-af-silver' };
    }
  };

  const accountColors = getAccountTypeColor(member.accountType);

  const trophyStats = buildTrophyStats(ALL_ACHIEVEMENTS, members, member);
  const earnedTrophies = trophyStats.filter((trophy) => trophy.isEarned);
  const rarestTrophies = getRarestEarnedTrophies(ALL_ACHIEVEMENTS, members, member, 3);
  const trophyOverflowCount = Math.max(earnedTrophies.length - rarestTrophies.length, 0);

  const getWorkoutIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'running':
      case 'run':
        return MapPin;
      case 'strength':
      case 'weights':
      case 'lifting':
        return Dumbbell;
      default:
        return Activity;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'attendance': return 'Attendance';
      case 'screenshot': return 'Screenshot';
      // Future integration placeholder kept intentionally disabled.
      // case 'apple_health': return 'Apple Health';
      case 'strava': return 'Strava';
      // Future integration placeholder kept intentionally disabled.
      // case 'garmin': return 'Garmin';
      default: return 'Manual';
    }
  };

  return (
    <View className="flex-1">
      <LinearGradient
        colors={['#0A1628', '#001F5C', '#0A1628']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView edges={['top']} className="flex-1">
        {/* Header */}
        <Animated.View
          entering={FadeInDown.delay(100).springify()}
          className="px-6 pt-4 pb-2 flex-row items-center"
        >
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            className="w-10 h-10 bg-white/10 rounded-full items-center justify-center mr-4"
          >
            <ChevronLeft size={24} color="#C0C0C0" />
          </Pressable>
          <Text className="text-white text-xl font-bold">Profile</Text>
        </Animated.View>

        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Profile Card */}
          <Animated.View
            entering={FadeInDown.delay(150).springify()}
            className="mt-4 p-6 bg-white/10 rounded-3xl border border-white/20"
          >
            <View className="items-center">
              {/* Profile Picture with gold border for completionist */}
              <View className="relative">
                {(member.profilePicture || (isOwnProfile ? currentUser?.profilePicture : undefined)) ? (
                  <Image
                    source={{ uri: member.profilePicture || currentUser?.profilePicture }}
                    className={cn(
                      "w-20 h-20 rounded-full mb-4",
                      member.achievements.includes('completionist') && "border-4 border-af-gold"
                    )}
                  />
                ) : (
                  <View className={cn(
                    "w-20 h-20 rounded-full items-center justify-center mb-4",
                    member.achievements.includes('completionist')
                      ? "bg-af-gold/30 border-4 border-af-gold"
                      : "bg-af-accent/30"
                  )}>
                    <Text className="text-white text-3xl font-bold">
                      {member.firstName[0]}{member.lastName[0]}
                    </Text>
                  </View>
                )}
                {/* Trophy indicator for users who have placed top 3 */}
                {member.trophyCount > 0 && (
                  <View className="absolute -bottom-1 -right-1 bg-af-gold rounded-full p-1 border-2 border-af-navy">
                    <Trophy size={14} color="#0A1628" />
                  </View>
                )}
              </View>
              <Text className="text-white text-2xl font-bold text-center">{displayName}</Text>
              <View className="mt-2 items-center">
                <CompactTrophyBadges trophies={rarestTrophies} overflowCount={trophyOverflowCount} />
              </View>
              <LinearGradient
                colors={['rgba(255,215,0,0)', 'rgba(255,215,0,0.75)', 'rgba(255,215,0,0)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{ marginTop: 12, height: 2, width: 144, borderRadius: 999 }}
              />
              <Text className="mt-2 text-af-silver">{member.flight} Flight</Text>
              <View className="flex-row items-center mt-2">
                <View className={cn("px-3 py-1 rounded-full", accountColors.bg)}>
                  <Text className={cn("text-sm font-semibold", accountColors.text)}>
                    {getAccountTypeLabel(member.accountType)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Trophy Count if any */}
            {member.trophyCount > 0 && (
              <View className="flex-row items-center justify-center mt-3 bg-af-gold/20 rounded-xl p-2">
                <Trophy size={16} color="#FFD700" />
                <Text className="text-af-gold font-semibold ml-2">
                  {member.trophyCount}x Monthly Top 3
                </Text>
              </View>
            )}

            <TrophyCase
              expanded={showTrophyCase}
              onToggle={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowTrophyCase((current) => !current);
              }}
              trophies={trophyStats}
            />

            {/* Leaderboard Position */}
            <View className="flex-row items-center justify-center mt-4 bg-af-gold/10 rounded-xl p-3">
              <Trophy size={20} color="#FFD700" />
              <Text className="text-af-gold font-bold ml-2">#{leaderboardPosition} on Leaderboard</Text>
              <Text className="text-af-silver ml-2">({totalScore.toLocaleString()} pts)</Text>
            </View>
          </Animated.View>

          {/* Stats Card */}
          <Animated.View
            entering={FadeInDown.delay(200).springify()}
            className="mt-4 p-4 bg-white/5 rounded-2xl border border-white/10"
          >
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-white/60 text-xs uppercase tracking-wider">Monthly Summary</Text>
              <Text className="text-af-silver text-xs">{formatMonthLabel(summaryMonth)}</Text>
            </View>
            {availableSummaryMonths.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mb-3"
                contentContainerStyle={{ paddingRight: 12 }}
              >
                {availableSummaryMonths.map((monthKey) => (
                  <Pressable
                    key={monthKey}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedSummaryMonth(monthKey);
                    }}
                    className={cn(
                      'mr-2 rounded-full border px-3 py-1.5',
                      summaryMonth === monthKey ? 'border-af-accent bg-af-accent/20' : 'border-white/10 bg-white/5'
                    )}
                  >
                    <Text className={cn('text-xs font-semibold', summaryMonth === monthKey ? 'text-af-accent' : 'text-af-silver')}>
                      {formatMonthLabel(monthKey)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <View className="flex-row justify-between">
              <View className="items-center flex-1">
                <Timer size={24} color="#4A90D9" />
                <Text className="text-white font-bold text-xl mt-1">
                  {monthlySummary.minutes}
                </Text>
                <Text className="text-af-silver text-xs">Minutes</Text>
              </View>
              <View className="w-px bg-white/10" />
              <View className="items-center flex-1">
                <MapPin size={24} color="#22C55E" />
                <Text className="text-white font-bold text-xl mt-1">
                  {monthlySummary.miles.toFixed(2)}
                </Text>
                <Text className="text-af-silver text-xs">Miles</Text>
              </View>
              <View className="w-px bg-white/10" />
              <View className="items-center flex-1">
                <Dumbbell size={24} color="#A855F7" />
                <Text className="text-white font-bold text-xl mt-1">
                  {monthlySummary.workoutCount}
                </Text>
                <Text className="text-af-silver text-xs">Workouts</Text>
              </View>
            </View>
            <View className="mt-3 pt-3 border-t border-white/10 flex-row justify-between">
              <View>
                <Text className="text-white/50 text-xs uppercase tracking-wider">Monthly Score</Text>
                <Text className="text-white font-semibold mt-1">{monthlySummary.score.toLocaleString()}</Text>
              </View>
              <View className="items-end">
                <Text className="text-white/50 text-xs uppercase tracking-wider">Latest PFRA</Text>
                <Text className="text-white font-semibold mt-1">{latestMonthlyPFRA?.overallScore ?? 'N/A'}</Text>
              </View>
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(212).springify()}
            className="mt-4 p-4 bg-white/5 rounded-2xl border border-white/10"
          >
            <Text className="text-white/60 text-xs uppercase tracking-wider mb-3">History</Text>
            <View className="flex-row flex-wrap" style={{ gap: 12 }}>
              {canViewWorkoutHistorySection ? (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowWorkoutHistoryModal(true);
                  }}
                  className="min-w-[30%] flex-1 rounded-2xl border border-white/10 bg-black/10 p-4 min-h-[76px] items-center justify-center"
                >
                  <View className="items-center justify-center">
                    <Activity size={18} color="#A855F7" />
                    <Text className="mt-2 text-white font-semibold text-center text-sm leading-5">Workout History</Text>
                  </View>
                </Pressable>
              ) : null}
              {canViewPFRASection ? (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowPFRAHistoryModal(true);
                  }}
                  className="min-w-[30%] flex-1 rounded-2xl border border-white/10 bg-black/10 p-4 min-h-[76px] items-center justify-center"
                >
                  <View className="items-center justify-center">
                    <FileText size={18} color="#4A90D9" />
                    <Text className="mt-2 text-white font-semibold text-center text-sm leading-5">PFRA History</Text>
                  </View>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowLeaderboardHistoryModal(true);
                }}
                className="min-w-[30%] flex-1 rounded-2xl border border-white/10 bg-black/10 p-4 min-h-[76px] items-center justify-center"
              >
                <View className="items-center justify-center">
                  <Trophy size={18} color="#FFD700" />
                  <Text className="mt-2 text-white font-semibold text-center text-sm leading-5">Leaderboard History</Text>
                </View>
              </Pressable>
            </View>
          </Animated.View>

          {/* Workout Type Breakdown */}
          {workoutTypeBreakdown.length > 0 && (
            <Animated.View
              entering={FadeInDown.delay(225).springify()}
              className="mt-4 p-4 bg-white/5 rounded-2xl border border-white/10"
            >
              <View className="flex-row items-center mb-3">
                <BarChart3 size={18} color="#4A90D9" />
                <Text className="text-white/60 text-xs uppercase tracking-wider ml-2">Workout Breakdown</Text>
              </View>
              {workoutTypeBreakdown.map((item, index) => (
                <WorkoutTypeBar
                  key={item.type}
                  type={item.type}
                  count={item.count}
                  percentage={item.percentage}
                  maxPercentage={workoutTypeBreakdown[0]?.percentage ?? 100}
                  delay={225 + index * 50}
                />
              ))}
            </Animated.View>
          )}

          {/* PFRA Section */}
          {canViewPFRASection ? (
          <Animated.View
            entering={FadeInDown.delay(250).springify()}
            className="mt-4"
          >
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-white font-semibold text-lg">PFRA</Text>
              {member.fitnessAssessments.some(fa => fa.isPrivate) && !isOwnProfile && (
                <View className="flex-row items-center">
                  <Lock size={14} color="#C0C0C0" />
                  <Text className="text-af-silver text-xs ml-1">Private</Text>
                </View>
              )}
            </View>

            {canViewFitnessAssessments && latestAssessment ? (
              <View className="bg-white/5 rounded-2xl border border-white/10 p-4">
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="text-af-silver text-sm">Latest Assessment</Text>
                  <Text className="text-af-silver text-sm">{latestAssessment.date}</Text>
                </View>

                {/* Overall Score */}
                <View className="items-center mb-4">
                  <View className={cn(
                    "w-24 h-24 rounded-full items-center justify-center border-4",
                    latestAssessment.overallScore >= 90 ? "border-af-success bg-af-success/20" :
                    latestAssessment.overallScore >= 75 ? "border-af-accent bg-af-accent/20" :
                    "border-af-warning bg-af-warning/20"
                  )}>
                    <Text className={cn(
                      "text-3xl font-bold",
                      latestAssessment.overallScore >= 90 ? "text-af-success" :
                      latestAssessment.overallScore >= 75 ? "text-af-accent" :
                      "text-af-warning"
                    )}>
                      {latestAssessment.overallScore}
                    </Text>
                  </View>
                  <Text className="text-white font-semibold mt-2">Overall Score</Text>
                </View>

                {/* Component Breakdown */}
                <View className="space-y-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-af-silver">Cardio</Text>
                    <Text className="text-white font-semibold">
                      {latestAssessment.components.cardio.exempt
                        ? 'Exempt'
                        : `${latestAssessment.components.cardio.score} pts`}
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-af-silver">{latestAssessment.components.pushups.test ?? 'Strength'}</Text>
                    <Text className="text-white font-semibold">
                      {latestAssessment.components.pushups.exempt
                        ? 'Exempt'
                        : `${latestAssessment.components.pushups.score} pts (${latestAssessment.components.pushups.reps} reps)`}
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-af-silver">{latestAssessment.components.situps.test ?? 'Core'}</Text>
                    <Text className="text-white font-semibold">
                      {latestAssessment.components.situps.exempt
                        ? 'Exempt'
                        : `${latestAssessment.components.situps.score} pts (${latestAssessment.components.situps.time ?? `${latestAssessment.components.situps.reps} reps`})`}
                    </Text>
                  </View>
                  {latestAssessment.components.waist && (
                    <View className="flex-row items-center justify-between">
                      <Text className="text-af-silver">Waist</Text>
                      <Text className="text-white font-semibold">
                        {latestAssessment.components.waist.exempt
                          ? 'Exempt'
                          : `${latestAssessment.components.waist.score} pts (${latestAssessment.components.waist.inches}")`}
                      </Text>
                    </View>
                  )}
                </View>

                {/* PT Requirement */}
                <View className="mt-4 pt-4 border-t border-white/10">
                  <Text className="text-af-silver text-sm">Required PT Sessions/Week</Text>
                  <Text className="text-white font-bold text-lg">{member.requiredPTSessionsPerWeek} sessions</Text>
                </View>
              </View>
            ) : canViewFitnessAssessments ? (
              <View className="bg-white/5 rounded-2xl border border-white/10 p-6 items-center">
                <FileText size={32} color="#C0C0C0" />
                <Text className="text-af-silver mt-2">No PFRA records uploaded</Text>
              </View>
            ) : (
              <View className="bg-white/5 rounded-2xl border border-white/10 p-6 items-center">
                <Lock size={32} color="#C0C0C0" />
                <Text className="text-af-silver mt-2">PFRA records are private</Text>
              </View>
            )}
          </Animated.View>
          ) : null}

          {/* Workout Uploads Section */}
          {canViewWorkoutUploadsSection ? (
          <Animated.View
            entering={FadeInDown.delay(275).springify()}
            className="mt-4"
          >
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-white font-semibold text-lg">Workout Uploads</Text>
              {member.workouts.some(w => w.isPrivate) && canViewAllWorkouts && !isOwnProfile && (
                <View className="flex-row items-center bg-af-accent/20 px-2 py-1 rounded-full">
                  <Shield size={12} color="#4A90D9" />
                  <Text className="text-af-accent text-xs ml-1">Admin View</Text>
                </View>
              )}
            </View>

            {uploadedVisibleWorkouts.length > 0 ? (
              <View className="space-y-3">
                {uploadedVisibleWorkouts.slice(0, 5).map((workout) => {
                  const WorkoutIcon = getWorkoutIcon(workout.type);
                  return (
                    <View
                      key={workout.id}
                      className="bg-white/5 rounded-2xl border border-white/10 p-4"
                    >
                      <View className="flex-row items-start justify-between">
                        <View className="flex-row items-center flex-1">
                          <View className="w-10 h-10 bg-af-accent/20 rounded-full items-center justify-center mr-3">
                            <WorkoutIcon size={20} color="#4A90D9" />
                          </View>
                          <View className="flex-1">
                            <View className="flex-row items-center">
                              <Text className="text-white font-semibold">{workout.type}</Text>
                              {workout.isPrivate && (
                                <View className="ml-2 flex-row items-center">
                                  <Lock size={12} color="#C0C0C0" />
                                </View>
                              )}
                            </View>
                            <Text className="text-af-silver text-sm">{workout.date}</Text>
                          </View>
                        </View>
                        <View className="items-end">
                          <View className="flex-row items-center">
                            <Timer size={14} color="#C0C0C0" />
                            <Text className="text-white font-semibold ml-1">{workout.duration} min</Text>
                          </View>
                          <Text className="text-af-silver text-xs">{getSourceLabel(workout.source)}</Text>
                        </View>
                      </View>

                      {/* Additional stats row */}
                      <View className="flex-row items-center mt-3 pt-3 border-t border-white/10">
                        {workout.distance !== undefined && workout.distance > 0 && (
                          <View className="flex-row items-center mr-4">
                            <MapPin size={14} color="#22C55E" />
                            <Text className="text-af-silver text-sm ml-1">{workout.distance.toFixed(2)} mi</Text>
                          </View>
                        )}
                        {workout.screenshotUri && (
                          <View className="flex-row items-center">
                            <ImageIcon size={14} color="#A855F7" />
                            <Text className="text-purple-400 text-sm ml-1">Has image</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
                {uploadedVisibleWorkouts.length > 5 && (
                  <View className="items-center py-2">
                    <Text className="text-af-silver text-sm">+{uploadedVisibleWorkouts.length - 5} more workouts</Text>
                  </View>
                )}
              </View>
            ) : (
              <View className="bg-white/5 rounded-2xl border border-white/10 p-6 items-center">
                <Activity size={32} color="#C0C0C0" />
                <Text className="text-af-silver mt-2">
                  {visibleWorkouts.length > 0 && !canViewAllWorkouts
                    ? 'No public uploaded workouts'
                    : 'No uploaded workouts recorded'}
                </Text>
              </View>
            )}
          </Animated.View>
          ) : null}

        </ScrollView>

        <Modal visible={showWorkoutHistoryModal} transparent animationType="none">
          <Animated.View entering={FadeInDown.duration(180)} className="flex-1 bg-black/80 justify-end">
            <Animated.View entering={FadeInUp.duration(260)} className="bg-af-navy rounded-t-3xl p-6 pb-12 max-h-[85%]">
              <View className="flex-row items-center justify-between mb-6">
                <Text className="text-white text-xl font-bold">Workout History</Text>
                <Pressable
                  onPress={() => setShowWorkoutHistoryModal(false)}
                  className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
                >
                  <X size={20} color="#C0C0C0" />
                </Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                {visibleWorkouts.length === 0 ? (
                  <Text className="text-white/40 text-center py-8">No workouts recorded yet.</Text>
                ) : (
                  [...visibleWorkouts]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((workout) => (
                      <View key={workout.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-4">
                        <View className="flex-row items-start justify-between">
                          <View className="flex-1">
                            <Text className="text-white font-semibold">{workout.source === 'attendance' ? 'Attendance' : getWorkoutDisplayTitle(workout.type)}</Text>
                            <Text className="text-af-silver text-xs mt-1">{workout.date}</Text>
                          </View>
                          <View className="rounded-full bg-white/10 px-3 py-1">
                            <Text className="text-af-silver text-xs">
                              {workout.source === 'manual'
                                ? 'Manual'
                                : workout.source === 'attendance'
                                  ? 'Attendance'
                                  : workout.source === 'strava'
                                    ? 'Strava'
                                    : 'Screenshot'}
                            </Text>
                          </View>
                        </View>
                        <View className="mt-3 pt-3 border-t border-white/10">
                          {workout.source === 'attendance' ? (
                            <Text className="text-af-silver text-sm">Logged by PFL/UFPM</Text>
                          ) : (
                            <>
                                <Text className="text-af-silver text-sm">Duration: {workout.duration} min</Text>
                            <Text className="text-af-silver text-sm mt-1">Distance: {workout.distance ? `${workout.distance.toFixed(2)} mi` : 'N/A'}</Text>
                                <Text className="text-af-silver text-sm mt-1">Visibility: {workout.isPrivate ? 'Private' : 'Visible to squadron'}</Text>
                              </>
                            )}
                          </View>
                          {workout.screenshotUri ? (
                            <Pressable onPress={() => setExpandedWorkoutImageUri(workout.screenshotUri!)} className="mt-4">
                              <Image
                                source={{ uri: workout.screenshotUri }}
                                className="w-full h-40 rounded-xl"
                                resizeMode="cover"
                              />
                            </Pressable>
                          ) : null}
                        </View>
                      ))
                )}
              </ScrollView>
            </Animated.View>
          </Animated.View>
        </Modal>

        <Modal visible={showPFRAHistoryModal} transparent animationType="none">
          <Animated.View entering={FadeInDown.duration(180)} className="flex-1 bg-black/80 justify-end">
            <Animated.View entering={FadeInUp.duration(260)} className="bg-af-navy rounded-t-3xl p-6 pb-12 max-h-[85%]">
              <View className="flex-row items-center justify-between mb-6">
                <Text className="text-white text-xl font-bold">PFRA History</Text>
                <Pressable
                  onPress={() => setShowPFRAHistoryModal(false)}
                  className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
                >
                  <X size={20} color="#C0C0C0" />
                </Pressable>
              </View>
              {!canViewFitnessAssessments ? (
                <Text className="text-white/40 text-center py-8">PFRA records are private.</Text>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {pfraHistory.length === 0 ? (
                    <Text className="text-white/40 text-center py-8">No PFRA records uploaded.</Text>
                  ) : (
                    pfraHistory.map((assessment) => (
                      <View key={assessment.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-4">
                        <View className="flex-row items-center justify-between">
                          <Text className="text-white font-semibold">{assessment.date}</Text>
                          <Text className="text-af-gold font-bold">{assessment.overallScore.toFixed(1)}</Text>
                        </View>
                        <View className="mt-4">
                          <View className="flex-row justify-between mb-2">
                            <Text className="text-af-silver text-sm">Cardio</Text>
                            <Text className="text-white text-sm">
                              {assessment.components.cardio.exempt ? 'Exempt' : `${assessment.components.cardio.score} pts`}
                            </Text>
                          </View>
                          <View className="flex-row justify-between mb-2">
                            <Text className="text-af-silver text-sm">{assessment.components.pushups.test ?? 'Strength'}</Text>
                            <Text className="text-white text-sm">
                              {assessment.components.pushups.exempt ? 'Exempt' : `${assessment.components.pushups.score} pts (${assessment.components.pushups.reps} reps)`}
                            </Text>
                          </View>
                          <View className="flex-row justify-between mb-2">
                            <Text className="text-af-silver text-sm">{assessment.components.situps.test ?? 'Core'}</Text>
                            <Text className="text-white text-sm">
                              {assessment.components.situps.exempt ? 'Exempt' : `${assessment.components.situps.score} pts (${assessment.components.situps.time ?? `${assessment.components.situps.reps} reps`})`}
                            </Text>
                          </View>
                          {assessment.components.waist ? (
                            <View className="flex-row justify-between">
                              <Text className="text-af-silver text-sm">Waist</Text>
                              <Text className="text-white text-sm">
                                {assessment.components.waist.exempt ? 'Exempt' : `${assessment.components.waist.score} pts (${assessment.components.waist.inches}")`}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>
              )}
            </Animated.View>
          </Animated.View>
        </Modal>

        <Modal visible={showLeaderboardHistoryModal} transparent animationType="none">
          <Animated.View entering={FadeInDown.duration(180)} className="flex-1 bg-black/80 justify-end">
            <Animated.View entering={FadeInUp.duration(260)} className="bg-af-navy rounded-t-3xl p-6 pb-12 max-h-[80%]">
              <View className="flex-row items-center justify-between mb-6">
                <Text className="text-white text-xl font-bold">Leaderboard History</Text>
                <Pressable
                  onPress={() => setShowLeaderboardHistoryModal(false)}
                  className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
                >
                  <X size={20} color="#C0C0C0" />
                </Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                {leaderboardHistory.length === 0 ? (
                  <Text className="text-white/40 text-center py-8">No leaderboard placements recorded yet.</Text>
                ) : (
                  leaderboardHistory.map((entry) => (
                    <View key={`${entry.month}-${entry.position}-${entry.score}`} className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-3">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-white font-semibold">{formatMonthLabel(entry.month)}</Text>
                        <Text className="text-af-gold font-semibold">#{entry.position}</Text>
                      </View>
                      <Text className="text-af-silver text-sm mt-1">{entry.score.toLocaleString()} pts</Text>
                    </View>
                  ))
                )}
              </ScrollView>
            </Animated.View>
          </Animated.View>
        </Modal>

        <Modal visible={!!expandedWorkoutImageUri} transparent animationType="fade">
          <View className="flex-1 bg-black/90 items-center justify-center p-6">
            <Pressable
              onPress={() => setExpandedWorkoutImageUri(null)}
              className="absolute top-14 right-6 z-10 w-10 h-10 rounded-full bg-white/10 items-center justify-center"
            >
              <X size={22} color="#C0C0C0" />
            </Pressable>
            {expandedWorkoutImageUri ? (
              <View style={{ width: '100%', maxWidth: 520, height: '70%' }}>
                <Image source={{ uri: expandedWorkoutImageUri }} style={{ width: '100%', height: '100%', borderRadius: 16 }} resizeMode="contain" />
              </View>
            ) : null}
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

