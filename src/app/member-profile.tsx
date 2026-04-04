import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Timer, MapPin, Trophy, Lock, Unlock, TrendingUp, Award, Shield, Camera, Dumbbell, Activity, Image as ImageIcon, BarChart3, X, ChevronDown, User } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withSpring, withDelay } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useMemberStore, useAuthStore, getDisplayName, ALL_ACHIEVEMENTS, canEditAttendance, type AccountType, type WorkoutType, WORKOUT_TYPES } from '@/lib/store';
import { cn } from '@/lib/cn';

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
  type: WorkoutType;
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

  const color = WORKOUT_TYPE_COLORS[type];

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

export default function MemberProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const members = useMemberStore(s => s.members);
  const currentUser = useAuthStore(s => s.user);
  const currentUserSquadron = currentUser?.squadron ?? 'Hawks';

  const [showAchievementsModal, setShowAchievementsModal] = useState(false);
  const [achievementsSummaryExpanded, setAchievementsSummaryExpanded] = useState(false);

  const member = useMemo(() => members.find(m => m.id === id), [members, id]);
  const canViewMember =
    !!member &&
    (!!currentUser && (member.id === currentUser.id || member.squadron === currentUserSquadron || currentUser.accountType === 'fitflight_creator'));

  // All hooks must be called before early returns
  const isOwnProfile = currentUser?.id === member?.id;
  const canViewAllWorkouts = isOwnProfile || canEditAttendance(currentUser?.accountType ?? 'standard');

  // Filter workouts based on privacy - must be before early return
  const visibleWorkouts = useMemo(() => {
    if (!member) return [];
    if (canViewAllWorkouts) {
      return member.workouts;
    }
    return member.workouts.filter(w => !w.isPrivate);
  }, [member?.workouts, canViewAllWorkouts, member]);

  // Calculate leaderboard position
  const sortedMembers = useMemo(() => {
    return members
      .filter((candidate) => candidate.squadron === (member?.squadron ?? currentUserSquadron))
      .sort((a, b) => {
      const scoreA = a.exerciseMinutes + Math.round(a.distanceRun * 10) + a.workouts.length * 25;
      const scoreB = b.exerciseMinutes + Math.round(b.distanceRun * 10) + b.workouts.length * 25;
      return scoreB - scoreA;
    });
  }, [currentUserSquadron, member?.squadron, members]);

  // Calculate workout type breakdown
  const workoutTypeBreakdown = useMemo(() => {
    if (!member) return [];
    const counts: Record<WorkoutType, number> = {} as Record<WorkoutType, number>;
    WORKOUT_TYPES.forEach(type => { counts[type] = 0; });

    member.workouts.forEach(w => {
      counts[w.type] = (counts[w.type] || 0) + 1;
    });

    const total = member.workouts.length;
    const breakdown = WORKOUT_TYPES
      .map(type => ({
        type,
        count: counts[type],
        percentage: total > 0 ? (counts[type] / total) * 100 : 0,
      }))
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count);

    return breakdown;
  }, [member?.workouts, member]);

  if (!member || !canViewMember) {
    return (
      <View className="flex-1 bg-af-navy items-center justify-center">
        <Text className="text-white">{member ? 'You do not have access to this member profile' : 'Member not found'}</Text>
      </View>
    );
  }

  const displayName = getDisplayName(member);
  const leaderboardPosition = sortedMembers.findIndex(m => m.id === member.id) + 1;
  const totalScore = member.exerciseMinutes + Math.round(member.distanceRun * 10) + member.workouts.length * 25;

  // Get fitness assessments (check privacy)
  const canViewFitnessAssessments = isOwnProfile ||
    !member.fitnessAssessments.some(fa => fa.isPrivate) ||
    currentUser?.accountType === 'fitflight_creator' ||
    currentUser?.accountType === 'ufpm';

  const latestAssessment = member.fitnessAssessments[member.fitnessAssessments.length - 1];

  const getAccountTypeLabel = (accountType: AccountType) => {
    switch (accountType) {
      case 'fitflight_creator': return 'FitFlight Creator';
      case 'ufpm': return 'UFPM';
      case 'ptl': return 'PFL';
      default: return 'Member';
    }
  };

  const getAccountTypeColor = (accountType: AccountType) => {
    switch (accountType) {
      case 'fitflight_creator': return { bg: 'bg-purple-500/20', text: 'text-purple-400' };
      case 'ufpm': return { bg: 'bg-af-gold/20', text: 'text-af-gold' };
      case 'ptl': return { bg: 'bg-af-accent/20', text: 'text-af-accent' };
      default: return { bg: 'bg-white/10', text: 'text-af-silver' };
    }
  };

  const accountColors = getAccountTypeColor(member.accountType);

  // Get earned achievements
  const earnedAchievements = ALL_ACHIEVEMENTS.filter(a => member.achievements.includes(a.id));
  const unearnedAchievements = ALL_ACHIEVEMENTS.filter(a => !member.achievements.includes(a.id));

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
      case 'screenshot': return 'Screenshot';
      case 'apple_health': return 'Apple Health';
      case 'strava': return 'Strava';
      case 'garmin': return 'Garmin';
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
                {member.profilePicture ? (
                  <Image
                    source={{ uri: member.profilePicture }}
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
              <Text className="text-white text-2xl font-bold">{displayName}</Text>
              <Text className="text-af-silver">{member.flight} Flight</Text>
              <View className="flex-row items-center mt-2">
                <View className={cn("px-3 py-1 rounded-full", accountColors.bg)}>
                  <Text className={cn("text-sm font-semibold", accountColors.text)}>
                    {getAccountTypeLabel(member.accountType)}
                  </Text>
                </View>
                {/* Hard achievement badges */}
                {earnedAchievements.filter(a => a.isHard).slice(0, 2).map((achievement) => (
                  <View
                    key={achievement.id}
                    className="ml-2 px-2 py-1 bg-af-gold/20 rounded-full border border-af-gold/50"
                  >
                    <Text className="text-af-gold text-xs font-semibold">{achievement.name.split(' ')[0]}</Text>
                  </View>
                ))}
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

            {/* Achievements Summary - Expandable */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setAchievementsSummaryExpanded(!achievementsSummaryExpanded);
              }}
              className="mt-3"
            >
              <View className="flex-row items-center justify-center bg-purple-500/20 rounded-xl p-3">
                <Award size={18} color="#A855F7" />
                <Text className="text-purple-400 font-semibold ml-2">
                  {earnedAchievements.length} Achievements
                </Text>
                <ChevronDown
                  size={18}
                  color="#A855F7"
                  style={{ marginLeft: 4, transform: [{ rotate: achievementsSummaryExpanded ? '180deg' : '0deg' }] }}
                />
              </View>

              {/* Expanded Achievements List */}
              {achievementsSummaryExpanded && earnedAchievements.length > 0 && (
                <ScrollView
                  className="mt-3 max-h-48"
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                >
                  {earnedAchievements.map((achievement) => (
                    <View
                      key={achievement.id}
                      className={cn(
                        "flex-row items-center p-3 rounded-xl mb-2 border",
                        achievement.isHard
                          ? "bg-af-gold/20 border-af-gold/40"
                          : "bg-purple-500/10 border-purple-500/30"
                      )}
                    >
                      <View className={cn(
                        "w-10 h-10 rounded-lg items-center justify-center mr-3",
                        achievement.isHard ? "bg-af-gold/30" : "bg-purple-500/20"
                      )}>
                        <Award size={20} color={achievement.isHard ? "#FFD700" : "#A855F7"} />
                      </View>
                      <View className="flex-1">
                        <Text className={cn(
                          "font-semibold text-sm",
                          achievement.isHard ? "text-af-gold" : "text-white"
                        )}>
                          {achievement.name}
                        </Text>
                        <Text className="text-white/50 text-xs">{achievement.description}</Text>
                      </View>
                      {achievement.isHard && (
                        <View className="bg-af-gold/30 px-1.5 py-0.5 rounded">
                          <Text className="text-af-gold text-xs font-bold">Hard</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </ScrollView>
              )}

              {/* No achievements message */}
              {achievementsSummaryExpanded && earnedAchievements.length === 0 && (
                <View className="mt-3 p-4 bg-white/5 rounded-xl items-center">
                  <Text className="text-white/40 text-sm">No achievements earned yet</Text>
                </View>
              )}
            </Pressable>

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
            <Text className="text-white/60 text-xs uppercase tracking-wider mb-3">Activity Stats</Text>
            <View className="flex-row justify-between">
              <View className="items-center flex-1">
                <Timer size={24} color="#4A90D9" />
                <Text className="text-white font-bold text-xl mt-1">
                  {member.exerciseMinutes}
                </Text>
                <Text className="text-af-silver text-xs">Minutes</Text>
              </View>
              <View className="w-px bg-white/10" />
              <View className="items-center flex-1">
                <MapPin size={24} color="#22C55E" />
                <Text className="text-white font-bold text-xl mt-1">
                  {member.distanceRun.toFixed(1)}
                </Text>
                <Text className="text-af-silver text-xs">Miles</Text>
              </View>
              <View className="w-px bg-white/10" />
              <View className="items-center flex-1">
                <Dumbbell size={24} color="#A855F7" />
                <Text className="text-white font-bold text-xl mt-1">
                  {member.workouts.length}
                </Text>
                <Text className="text-af-silver text-xs">Workouts</Text>
              </View>
            </View>
            {/* Workout count */}
            <View className="mt-3 pt-3 border-t border-white/10 flex-row items-center justify-center">
              <Activity size={18} color="#A855F7" />
              <Text className="text-white font-semibold ml-2">{member.workouts.length} Workouts Logged</Text>
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
                    <Text className="text-white font-semibold">{latestAssessment.components.cardio.score} pts</Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-af-silver">Push-ups</Text>
                    <Text className="text-white font-semibold">{latestAssessment.components.pushups.score} pts ({latestAssessment.components.pushups.reps} reps)</Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-af-silver">Sit-ups</Text>
                    <Text className="text-white font-semibold">{latestAssessment.components.situps.score} pts ({latestAssessment.components.situps.reps} reps)</Text>
                  </View>
                  {latestAssessment.components.waist && (
                    <View className="flex-row items-center justify-between">
                      <Text className="text-af-silver">Waist</Text>
                      <Text className="text-white font-semibold">{latestAssessment.components.waist.score} pts ({latestAssessment.components.waist.inches}")</Text>
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
                <Shield size={32} color="#C0C0C0" />
                <Text className="text-af-silver mt-2">No PFRA records recorded</Text>
              </View>
            ) : (
              <View className="bg-white/5 rounded-2xl border border-white/10 p-6 items-center">
                <Lock size={32} color="#C0C0C0" />
                <Text className="text-af-silver mt-2">PFRA records are private</Text>
              </View>
            )}
          </Animated.View>

          {/* Workout Uploads Section */}
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

            {visibleWorkouts.length > 0 ? (
              <View className="space-y-3">
                {visibleWorkouts.slice(0, 5).map((workout) => {
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
                            <Text className="text-af-silver text-sm ml-1">{workout.distance.toFixed(1)} mi</Text>
                          </View>
                        )}
                        {workout.screenshotUri && (
                          <View className="flex-row items-center">
                            <ImageIcon size={14} color="#A855F7" />
                            <Text className="text-purple-400 text-sm ml-1">Has screenshot</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
                {visibleWorkouts.length > 5 && (
                  <View className="items-center py-2">
                    <Text className="text-af-silver text-sm">+{visibleWorkouts.length - 5} more workouts</Text>
                  </View>
                )}
              </View>
            ) : (
              <View className="bg-white/5 rounded-2xl border border-white/10 p-6 items-center">
                <Activity size={32} color="#C0C0C0" />
                <Text className="text-af-silver mt-2">
                  {member.workouts.length > 0 && !canViewAllWorkouts
                    ? 'No public workouts'
                    : 'No workouts recorded'}
                </Text>
              </View>
            )}
          </Animated.View>

          {/* Achievements Section */}
          <Animated.View
            entering={FadeInDown.delay(300).springify()}
            className="mt-4"
          >
            <Text className="text-white font-semibold text-lg mb-3">Achievements</Text>

            {earnedAchievements.length > 0 && (
              <View className="mb-4">
                <Text className="text-af-silver text-sm mb-2">Earned ({earnedAchievements.length})</Text>
                <View className="flex-row flex-wrap">
                  {earnedAchievements.map((achievement) => (
                    <Pressable
                      key={achievement.id}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShowAchievementsModal(true);
                      }}
                      className={cn(
                        "w-16 h-16 rounded-xl items-center justify-center m-1 border-2",
                        achievement.isHard
                          ? "bg-af-gold/30 border-af-gold"
                          : "bg-af-gold/20 border-af-gold/50"
                      )}
                    >
                      <Award size={24} color={achievement.isHard ? "#FFD700" : "#DAA520"} />
                      <Text className={cn(
                        "text-xs mt-1 text-center",
                        achievement.isHard ? "text-af-gold font-bold" : "text-af-gold"
                      )} numberOfLines={1}>
                        {achievement.name.split(' ')[0]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {unearnedAchievements.length > 0 && (
              <View>
                <Text className="text-af-silver text-sm mb-2">Locked ({unearnedAchievements.length})</Text>
                <View className="space-y-2">
                  {unearnedAchievements.slice(0, 4).map((achievement) => (
                    <Pressable
                      key={achievement.id}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShowAchievementsModal(true);
                      }}
                      className="flex-row items-center bg-white/5 rounded-xl p-3 border border-white/10"
                    >
                      <View className="w-10 h-10 bg-white/10 rounded-lg items-center justify-center mr-3">
                        <Lock size={18} color="#6B7280" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-white/60 font-medium">{achievement.name}</Text>
                        <Text className="text-white/40 text-xs">{achievement.description}</Text>
                      </View>
                      {achievement.isHard && (
                        <View className="bg-af-gold/20 px-2 py-1 rounded">
                          <Text className="text-af-gold text-xs">Hard</Text>
                        </View>
                      )}
                    </Pressable>
                  ))}
                  {unearnedAchievements.length > 4 && (
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShowAchievementsModal(true);
                      }}
                      className="items-center py-2"
                    >
                      <Text className="text-af-accent text-sm">View all {unearnedAchievements.length} locked achievements</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            )}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      {/* Full-Screen Achievements Modal */}
      <Modal visible={showAchievementsModal} animationType="slide">
        <View className="flex-1 bg-af-navy">
          <LinearGradient
            colors={['#0A1628', '#001F5C', '#0A1628']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
          />
          <SafeAreaView edges={['top', 'bottom']} className="flex-1">
            {/* Modal Header - Fixed with proper padding */}
            <View className="flex-row items-center justify-between px-6 pt-4 pb-4 border-b border-white/10">
              <Text className="text-white text-xl font-bold">All Achievements</Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowAchievementsModal(false);
                }}
                className="w-10 h-10 bg-white/10 rounded-full items-center justify-center"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={24} color="#C0C0C0" />
              </Pressable>
            </View>

            {/* Progress Summary */}
            <View className="mx-6 mt-4 p-4 bg-white/5 rounded-2xl border border-white/10">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-white font-semibold text-lg">
                    {earnedAchievements.length} / {ALL_ACHIEVEMENTS.length}
                  </Text>
                  <Text className="text-af-silver text-sm">Achievements Earned</Text>
                </View>
                <View className="flex-row items-center">
                  <Award size={32} color="#FFD700" />
                </View>
              </View>
              {/* Progress Bar */}
              <View className="mt-3 h-2 bg-white/10 rounded-full overflow-hidden">
                <View
                  className="h-full bg-af-gold rounded-full"
                  style={{ width: `${(earnedAchievements.length / ALL_ACHIEVEMENTS.length) * 100}%` }}
                />
              </View>
            </View>

            <ScrollView
              className="flex-1 px-6 mt-4"
              contentContainerStyle={{ paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Earned Achievements */}
              {earnedAchievements.length > 0 && (
                <View className="mb-6">
                  <Text className="text-af-success font-semibold mb-3">
                    Earned ({earnedAchievements.length})
                  </Text>
                  {earnedAchievements.map((achievement) => (
                    <View
                      key={achievement.id}
                      className={cn(
                        "flex-row items-center p-4 rounded-xl mb-2 border",
                        achievement.isHard
                          ? "bg-af-gold/20 border-af-gold/50"
                          : "bg-af-success/10 border-af-success/30"
                      )}
                    >
                      <View className={cn(
                        "w-12 h-12 rounded-xl items-center justify-center mr-3",
                        achievement.isHard ? "bg-af-gold/30" : "bg-af-success/20"
                      )}>
                        <Award size={28} color={achievement.isHard ? "#FFD700" : "#22C55E"} />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center">
                          <Text className={cn(
                            "font-semibold",
                            achievement.isHard ? "text-af-gold" : "text-white"
                          )}>
                            {achievement.name}
                          </Text>
                          {achievement.isHard && (
                            <View className="ml-2 bg-af-gold/30 px-2 py-0.5 rounded">
                              <Text className="text-af-gold text-xs font-bold">Hard</Text>
                            </View>
                          )}
                        </View>
                        <Text className="text-af-silver text-sm">{achievement.description}</Text>
                        <Text className="text-af-success text-xs mt-1">✓ Earned</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Locked Achievements */}
              {unearnedAchievements.length > 0 && (
                <View>
                  <Text className="text-af-silver font-semibold mb-3">
                    Locked ({unearnedAchievements.length})
                  </Text>
                  {unearnedAchievements.map((achievement) => (
                    <View
                      key={achievement.id}
                      className="flex-row items-center bg-white/5 p-4 rounded-xl mb-2 border border-white/10"
                    >
                      <View className="w-12 h-12 bg-white/10 rounded-xl items-center justify-center mr-3">
                        <Lock size={24} color="#6B7280" />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center">
                          <Text className="text-white/60 font-semibold">{achievement.name}</Text>
                          {achievement.isHard && (
                            <View className="ml-2 bg-af-gold/20 px-2 py-0.5 rounded">
                              <Text className="text-af-gold/70 text-xs font-bold">Hard</Text>
                            </View>
                          )}
                        </View>
                        <Text className="text-white/40 text-sm">{achievement.description}</Text>
                        <Text className="text-white/30 text-xs mt-1 italic">
                          Category: {achievement.category.charAt(0).toUpperCase() + achievement.category.slice(1)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}
