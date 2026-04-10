import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Trophy, Timer, ChevronDown, ChevronUp, Crown, Medal, Search, Building2, X, Activity, Award, BarChart3, Dumbbell, ArrowLeft, CircleHelp } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInRight, useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ALL_ACHIEVEMENTS, getDisplayName, getEffectiveAchievementIds, type Flight, useAuthStore, useMemberStore, type WorkoutType, WORKOUT_TYPES } from '@/lib/store';
import { cn } from '@/lib/cn';
import { ATTENDANCE_CHECK_IN_POINTS, getMemberMonthSummary, getMonthKey, WORKOUT_POINTS_PER_MILE, WORKOUT_POINTS_PER_MINUTE } from '@/lib/monthlyStats';

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
}: {
  member: LeaderboardMember;
  position: number;
  maxValues: { minutes: number; distance: number; workouts: number };
  delay: number;
  onPress: () => void;
}) {
  const getRankIcon = () => {
    if (position === 1) return <Crown size={20} color="#FFD700" />;
    if (position === 2) return <Medal size={20} color="#C0C0C0" />;
    if (position === 3) return <Medal size={20} color="#CD7F32" />;
    return null;
  };

  const getRankBg = () => {
    if (position === 1) return 'bg-af-gold/20 border-af-gold/50';
    if (position === 2) return 'bg-af-silver/20 border-af-silver/50';
    if (position === 3) return 'bg-amber-900/20 border-amber-700/50';
    return 'bg-white/5 border-white/10';
  };

  const displayName = getDisplayName({ rank: member.rank, firstName: member.firstName, lastName: member.lastName });

  return (
    <Pressable onPress={onPress}>
      <Animated.View
        entering={FadeInRight.delay(delay).springify()}
        className={cn('rounded-2xl p-4 mb-3 border', getRankBg())}
      >
        <View className="flex-row items-center mb-3">
          <View className="w-8 h-8 bg-af-blue/30 rounded-full items-center justify-center mr-3">
            {getRankIcon() || <Text className="text-white font-bold text-sm">{position}</Text>}
          </View>
          <View className="flex-1">
            <View className="flex-row items-center flex-wrap">
              <Text className="text-white font-semibold text-base">{displayName}</Text>
              {member.trophyCount > 0 && (
                <View className="ml-2 flex-row items-center bg-af-gold/20 px-1.5 py-0.5 rounded">
                  <Trophy size={10} color="#FFD700" />
                  <Text className="text-af-gold text-xs font-bold ml-0.5">{member.trophyCount}</Text>
                </View>
              )}
            </View>
            <View className="flex-row items-center">
              <Text className="text-af-silver text-xs">{member.flight} Flight</Text>
              {member.hardAchievements.slice(0, 2).map((achievement) => (
                <View
                  key={achievement.id}
                  className="ml-1.5 flex-row items-center bg-af-gold/20 px-1.5 py-0.5 rounded border border-af-gold/30"
                >
                  <Award size={10} color="#FFD700" />
                  <Text className="text-af-gold text-xs font-semibold ml-0.5">
                    {achievement.name.split(' ')[0]}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          <View className="items-end">
            <View className="bg-af-accent/20 px-3 py-1 rounded-full">
              <Text className="text-af-accent font-bold text-sm">{member.totalScore.toLocaleString()}</Text>
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
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showScoringHelp, setShowScoringHelp] = useState(false);
  const [selectedFlight] = useState<Flight | 'all'>('all');
  const members = useMemberStore(s => s.members);
  const ptSessions = useMemberStore(s => s.ptSessions);
  const user = useAuthStore(s => s.user);

  const userName = user ? getDisplayName(user) : 'Airman';
  const userSquadron = user?.squadron ?? 'Hawks';

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

  const sortedMembers = useMemo<LeaderboardMember[]>(() => {
    let filtered = squadronMembers;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(m =>
        m.firstName.toLowerCase().includes(query) ||
        m.lastName.toLowerCase().includes(query) ||
        m.flight.toLowerCase().includes(query) ||
        `${m.rank} ${m.firstName} ${m.lastName}`.toLowerCase().includes(query)
      );
    }

    if (selectedFlight !== 'all') {
      filtered = filtered.filter(m => m.flight === selectedFlight);
    }

    return filtered
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
        hardAchievements: ALL_ACHIEVEMENTS
          .filter(a => a.isHard && getEffectiveAchievementIds(m).includes(a.id))
          .map(a => ({ id: a.id, name: a.name })),
        };
      })
      .sort((a, b) => b.totalScore - a.totalScore);
  }, [currentMonthKey, currentMonthSummaries, ptSessions, searchQuery, selectedFlight, squadronMembers]);

  const maxValues = useMemo(() => ({
    minutes: Math.max(...squadronMembers.map(m => currentMonthSummaries.get(m.id)?.minutes ?? 0), 1),
    distance: Math.max(...squadronMembers.map(m => currentMonthSummaries.get(m.id)?.miles ?? 0), 1),
    workouts: Math.max(...squadronMembers.map(m => currentMonthSummaries.get(m.id)?.workoutCount ?? 0), 1),
  }), [currentMonthSummaries, squadronMembers]);

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

  const displayedMembers = isExpanded ? sortedMembers : sortedMembers.slice(0, 10);
  const displayedPositions = useMemo(() => {
    const scores = displayedMembers.map((member) => member.totalScore);
    return scores.map((_, index) => getCompetitionPosition(scores, index));
  }, [displayedMembers]);

  const toggleExpand = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsExpanded(!isExpanded);
  };

  const handleMemberPress = (memberId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/member-profile?id=${memberId}`);
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
        <View className="bg-white/5 border-b border-white/10 px-6 py-2">
          <View className="flex-row items-center justify-center">
            <Building2 size={14} color="#4A90D9" />
            <Text className="text-af-accent font-semibold text-sm ml-2">{userSquadron}</Text>
          </View>
        </View>

        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.delay(100).springify()} className="px-6 pt-4 pb-2">
            <View className="flex-row items-center justify-between mb-4">
              {showBackButton ? (
                <Pressable
                  onPress={onBack}
                  className="flex-row items-center self-start"
                >
                  <ArrowLeft size={18} color="#C0C0C0" />
                  <Text className="text-af-silver font-medium ml-2">Back to Home</Text>
                </Pressable>
              ) : (
                <View />
              )}
            </View>

            <View className="flex-row items-center justify-between">
            <View className="flex-1 mr-3">
              <Text className="text-white text-xl font-bold" numberOfLines={1}>{userName}</Text>
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
                <CircleHelp size={14} color="#C0C0C0" />
              </Pressable>
              <View className="flex-row items-center bg-af-gold/20 px-3 py-2 rounded-full">
                <Trophy size={16} color="#FFD700" />
                <Text className="text-af-gold font-bold text-sm ml-1">Leaderboard</Text>
              </View>
            </View>
          </View>
        </Animated.View>

          <Animated.View entering={FadeInDown.delay(150).springify()} className="mx-6 mt-2">
            <View className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10">
              <Search size={20} color="#C0C0C0" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search by name or flight..."
                placeholderTextColor="#ffffff40"
                className="flex-1 ml-3 text-white text-base"
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')}>
                  <X size={18} color="#C0C0C0" />
                </Pressable>
              )}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).springify()} className="mx-6 mt-4 px-4 py-3 bg-white/5 rounded-2xl border border-white/10">
            <Text className="text-white/60 text-xs uppercase tracking-wider mb-2">Squadron Totals This Month</Text>
            <View className="flex-row justify-between">
              <View className="items-center flex-1">
                <Timer size={20} color="#4A90D9" />
                <Text className="text-white font-bold text-lg mt-1">{(squadronMembers.reduce((acc, m) => acc + (currentMonthSummaries.get(m.id)?.minutes ?? 0), 0) / 60).toFixed(2)}</Text>
                <Text className="text-af-silver text-xs">Hours</Text>
              </View>
              <View className="w-px bg-white/10" />
              <View className="items-center flex-1">
                <RunningIcon size={20} color="#22C55E" />
                <Text className="text-white font-bold text-lg mt-1">{squadronMembers.reduce((acc, m) => acc + (currentMonthSummaries.get(m.id)?.miles ?? 0), 0).toFixed(2)}</Text>
                <Text className="text-af-silver text-xs">Miles</Text>
              </View>
              <View className="w-px bg-white/10" />
              <View className="items-center flex-1">
                <Dumbbell size={20} color="#A855F7" />
                <Text className="text-white font-bold text-lg mt-1">{squadronMembers.reduce((acc, m) => acc + (currentMonthSummaries.get(m.id)?.workoutCount ?? 0), 0)}</Text>
                <Text className="text-af-silver text-xs">Workouts</Text>
              </View>
            </View>
          </Animated.View>

          {squadronWorkoutBreakdown.totalWorkouts > 0 && (
            <Animated.View entering={FadeInDown.delay(250).springify()} className="mx-6 mt-4 p-4 bg-white/5 rounded-2xl border border-white/10">
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center">
                  <BarChart3 size={16} color="#A855F7" />
                  <Text className="text-white/60 text-xs uppercase tracking-wider ml-2">Workout Types</Text>
                </View>
                <Text className="text-af-silver text-xs text-right">
                  {squadronWorkoutBreakdown.breakdown.length} {squadronWorkoutBreakdown.breakdown.length === 1 ? 'type' : 'types'} | {squadronWorkoutBreakdown.totalWorkouts} total {squadronWorkoutBreakdown.totalWorkouts === 1 ? 'workout' : 'workouts'}
                </Text>
              </View>
              {squadronWorkoutBreakdown.breakdown.slice(0, 5).map((item, index) => (
                <WorkoutTypeAnalyticsBar
                  key={item.label}
                  label={item.label}
                  count={item.count}
                  percentage={item.percentage}
                  maxPercentage={squadronWorkoutBreakdown.breakdown[0]?.percentage ?? 100}
                  delay={250 + index * 50}
                />
              ))}
              {squadronWorkoutBreakdown.breakdown.length > 5 && (
                <Text className="text-white/40 text-xs text-center mt-2">
                  +{squadronWorkoutBreakdown.breakdown.length - 5} more {(squadronWorkoutBreakdown.breakdown.length - 5) === 1 ? 'type' : 'types'}
                </Text>
              )}
            </Animated.View>
          )}

          <View className="flex-row items-center justify-between px-6 mt-6 mb-3">
            <Text className="text-white font-semibold text-lg">{isExpanded ? 'All Members' : 'Top 10 Performers'}</Text>
            <Pressable onPress={toggleExpand} className="flex-row items-center bg-white/10 px-3 py-1.5 rounded-full">
              <Text className="text-af-silver text-sm mr-1">{isExpanded ? 'Show Less' : 'Show All'}</Text>
              {isExpanded ? <ChevronUp size={16} color="#C0C0C0" /> : <ChevronDown size={16} color="#C0C0C0" />}
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
            <View className="rounded-3xl border border-white/10 bg-af-navy p-6">
              <View className="flex-row items-center justify-between">
                <Text className="text-white text-xl font-bold">How Points Work</Text>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    setShowScoringHelp(false);
                  }}
                  className="w-9 h-9 rounded-full bg-white/5 border border-white/10 items-center justify-center"
                >
                  <X size={18} color="#C0C0C0" />
                </Pressable>
              </View>

              <Text className="text-af-silver text-sm mt-4">
                The leaderboard uses monthly points. Attendance is worth the fewest points, and workouts earn points based on whichever is stronger: time or distance.
              </Text>

              <View className="mt-5 space-y-3">
                <View className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <Text className="text-white font-semibold">Attendance</Text>
                  <Text className="text-af-silver text-sm mt-1">
                    Marked attendance on the Attendance tab earns {ATTENDANCE_CHECK_IN_POINTS} points per check-in.
                  </Text>
                </View>

                <View className="rounded-2xl border border-white/10 bg-white/5 p-4 mt-3">
                  <Text className="text-white font-semibold">Workout Points</Text>
                  <Text className="text-af-silver text-sm mt-1">
                    Each workout earns the higher of:
                  </Text>
                  <Text className="text-white text-sm mt-2">{WORKOUT_POINTS_PER_MINUTE} point per minute</Text>
                  <Text className="text-white text-sm mt-1">{WORKOUT_POINTS_PER_MILE} points per mile</Text>
                </View>

                <View className="rounded-2xl border border-af-accent/20 bg-af-accent/10 p-4 mt-3">
                  <Text className="text-white font-semibold">Examples</Text>
                  <Text className="text-af-silver text-sm mt-1">30-minute strength workout = 30 points</Text>
                  <Text className="text-af-silver text-sm mt-1">2-mile run = 30 points</Text>
                  <Text className="text-af-silver text-sm mt-1">45-minute workout = 45 points</Text>
                  <Text className="text-af-silver text-sm mt-1">3-mile run = 45 points</Text>
                </View>
              </View>

              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowScoringHelp(false);
                }}
                className="mt-6 self-end rounded-full border border-af-accent/40 bg-af-accent/20 px-4 py-2"
              >
                <Text className="text-white font-semibold">Got it</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}


