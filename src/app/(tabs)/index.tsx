import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { NavigationProp, ParamListBase, useNavigation } from '@react-navigation/native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Trophy, Dumbbell, Calendar, Calculator, User, ArrowRight, FileText, Medal, Crown, Users } from 'lucide-react-native';
import { useAuthStore, useMemberStore, getDisplayName } from '@/lib/store';
import { LeaderboardContent } from '@/components/LeaderboardContent';

function NavCard({
  title,
  icon: Icon,
  color,
  bgClass,
  borderClass,
  onPress,
}: {
  title: string;
  icon: React.ElementType;
  color: string;
  bgClass: string;
  borderClass: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className={`flex-1 rounded-2xl border p-4 min-h-[132px] ${bgClass} ${borderClass}`}>
      <View className="flex-1 justify-between">
        <View className="w-12 h-12 rounded-2xl items-center justify-center bg-white/10">
          <Icon size={24} color={color} />
        </View>
        <View className="mt-4">
          <Text className="text-white text-base font-semibold">{title}</Text>
        </View>
        <View className="flex-row justify-end mt-4">
          <ArrowRight size={18} color="#C0C0C0" />
        </View>
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const [showingLeaderboard, setShowingLeaderboard] = useState(false);
  const user = useAuthStore(s => s.user);
  const members = useMemberStore(s => s.members);

  const userName = user ? getDisplayName(user) : 'Airman';
  const squadronMembers = useMemo(
    () => members.filter(member => member.squadron === (user?.squadron ?? 'Hawks')),
    [members, user?.squadron]
  );
  const rankedMembers = useMemo(
    () =>
      [...squadronMembers]
        .map(member => ({
          id: member.id,
          name: getDisplayName(member),
          totalScore:
            member.exerciseMinutes +
            Math.round(member.distanceRun * 10) +
            member.workouts.length * 25,
        }))
        .sort((a, b) => b.totalScore - a.totalScore),
    [squadronMembers]
  );
  const leader = rankedMembers[0];
  const runnerUp = rankedMembers[1];
  const averageScore = rankedMembers.length
    ? Math.round(rankedMembers.reduce((sum, member) => sum + member.totalScore, 0) / rankedMembers.length)
    : 0;

  const navigate = (path: '/(tabs)/workouts' | '/(tabs)/attendance' | '/(tabs)/calculator' | '/(tabs)/profile' | '/resources') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(path);
  };

  const openLeaderboard = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowingLeaderboard(true);
  };

  const closeLeaderboard = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowingLeaderboard(false);
  };

  React.useEffect(() => {
    const parentNavigation = navigation.getParent() as { addListener?: (event: string, callback: () => void) => () => void } | undefined;
    const unsubscribe = parentNavigation?.addListener?.('tabPress', () => {
      setShowingLeaderboard(false);
    });

    return unsubscribe;
  }, [navigation]);

  if (showingLeaderboard) {
    return <LeaderboardContent showBackButton onBack={closeLeaderboard} />;
  }

  return (
    <View className="flex-1">
      <LinearGradient
        colors={['#0A1628', '#001F5C', '#0A1628']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView edges={['top']} className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInDown.delay(100).springify()} className="px-6 pt-4 pb-2">
            <Text className="text-af-silver text-sm">Welcome back,</Text>
            <Text className="text-white text-3xl font-bold mt-1">{userName}</Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(150).springify()}
            className="mx-6 mt-4"
          >
            <Pressable
              onPress={openLeaderboard}
              className="bg-white/5 rounded-3xl border border-white/10 p-4 active:opacity-90"
            >
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-white/60 text-xs uppercase tracking-wider">Leaderboard Snapshot</Text>
                <View className="flex-row items-center">
                  <Text className="text-af-accent text-xs font-semibold mr-1">Open</Text>
                  <ArrowRight size={14} color="#4A90D9" />
                </View>
              </View>

              <View className="bg-af-gold/10 border border-af-gold/20 rounded-2xl p-3">
                <View className="flex-row items-center">
                  <View className="w-9 h-9 rounded-2xl bg-af-gold/20 items-center justify-center">
                    <Crown size={18} color="#FFD700" />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-af-silver text-[11px]">Current Leader</Text>
                    <Text className="text-white text-base font-bold" numberOfLines={1}>
                      {leader?.name ?? 'No leaderboard data yet'}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-af-gold text-[11px] font-semibold">Score</Text>
                    <Text className="text-white text-base font-bold">{leader?.totalScore ?? 0}</Text>
                  </View>
                </View>

                <View className="flex-row mt-3 pt-3 border-t border-white/10">
                  <View className="flex-1">
                    <View className="flex-row items-center">
                      <Medal size={13} color="#C0C0C0" />
                      <Text className="text-af-silver text-[11px] ml-1">Runner-Up</Text>
                    </View>
                    <Text className="text-white font-semibold mt-1.5" numberOfLines={1}>
                      {runnerUp?.name ?? 'N/A'}
                    </Text>
                    <Text className="text-af-silver text-[11px] mt-1">{runnerUp?.totalScore ?? 0} pts</Text>
                  </View>

                  <View className="w-px bg-white/10 mx-4" />

                  <View className="flex-1">
                    <View className="flex-row items-center">
                      <Users size={13} color="#4A90D9" />
                      <Text className="text-af-silver text-[11px] ml-1">Squadron Average</Text>
                    </View>
                    <Text className="text-white font-semibold mt-1.5">{averageScore}</Text>
                    <Text className="text-af-silver text-[11px] mt-1">{rankedMembers.length} ranked members</Text>
                  </View>
                </View>
              </View>
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).springify()} className="mx-6 mt-6">
            <Text className="text-white font-semibold text-lg mb-3">Navigate</Text>
            <View className="flex-row flex-wrap -mx-1.5">
              <View className="w-1/2 px-1.5 mb-3">
                <NavCard
                  title="Leaderboard"
                  icon={Trophy}
                  color="#FFD700"
                  bgClass="bg-af-gold/10"
                  borderClass="border-af-gold/30"
                  onPress={openLeaderboard}
                />
              </View>
              <View className="w-1/2 px-1.5 mb-3">
                <NavCard
                  title="Workouts"
                  icon={Dumbbell}
                  color="#A855F7"
                  bgClass="bg-purple-500/10"
                  borderClass="border-purple-500/30"
                  onPress={() => navigate('/(tabs)/workouts')}
                />
              </View>
              <View className="w-1/2 px-1.5 mb-3">
                <NavCard
                  title="Attendance"
                  icon={Calendar}
                  color="#22C55E"
                  bgClass="bg-af-success/10"
                  borderClass="border-af-success/30"
                  onPress={() => navigate('/(tabs)/attendance')}
                />
              </View>
              <View className="w-1/2 px-1.5 mb-3">
                <NavCard
                  title="Calculator"
                  icon={Calculator}
                  color="#F59E0B"
                  bgClass="bg-af-warning/10"
                  borderClass="border-af-warning/30"
                  onPress={() => navigate('/(tabs)/calculator')}
                />
              </View>
              <View className="w-1/2 px-1.5 mb-3">
                <NavCard
                  title="Resources"
                  icon={FileText}
                  color="#4A90D9"
                  bgClass="bg-af-accent/10"
                  borderClass="border-af-accent/30"
                  onPress={() => navigate('/resources')}
                />
              </View>
              <View className="w-1/2 px-1.5 mb-3">
                <NavCard
                  title="Profile"
                  icon={User}
                  color="#C0C0C0"
                  bgClass="bg-white/5"
                  borderClass="border-white/10"
                  onPress={() => navigate('/(tabs)/profile')}
                />
              </View>
            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
