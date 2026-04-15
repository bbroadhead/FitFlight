import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Building2, Users, Trophy, Timer, MapPin, Dumbbell, TrendingUp, FileText } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuthStore, useMemberStore, type Squadron, SQUADRONS, getDisplayName } from '@/lib/store';
import { cn } from '@/lib/cn';
import { getMemberMonthSummary } from '@/lib/monthlyStats';

export default function CrossSquadronScreen() {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const members = useMemberStore(s => s.members);
  const ptSessions = useMemberStore(s => s.ptSessions);
  const [selectedSquadron, setSelectedSquadron] = useState<Squadron | null>(null);
  const currentMonthKey = new Date().toISOString().slice(0, 7);

  // Get stats for each squadron - must be before conditional return
  const squadronStats = useMemo(() => {
    return SQUADRONS.map(squadron => {
      const squadronMembers = members.filter(m => m.squadron === squadron);
      const squadronSessions = ptSessions.filter(session => session.squadron === squadron);
      const totalMinutes = squadronMembers.reduce((acc, m) => acc + getMemberMonthSummary(m, currentMonthKey, squadronSessions).minutes, 0);
      const totalDistance = squadronMembers.reduce((acc, m) => acc + getMemberMonthSummary(m, currentMonthKey, squadronSessions).miles, 0);
      const totalWorkouts = squadronMembers.reduce((acc, m) => acc + getMemberMonthSummary(m, currentMonthKey, squadronSessions).workoutCount, 0);

      // Get top 3 performers
      const topPerformers = [...squadronMembers]
        .map(m => ({
          ...m,
          totalScore: getMemberMonthSummary(m, currentMonthKey, squadronSessions).score,
        }))
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, 3);

      return {
        squadron,
        memberCount: squadronMembers.length,
        totalMinutes,
        totalDistance,
        totalWorkouts,
        topPerformers,
      };
    });
  }, [currentMonthKey, members, ptSessions]);

  const selectedStats = selectedSquadron
    ? squadronStats.find(s => s.squadron === selectedSquadron)
    : null;

  // Redirect if not fitflight_creator
  if (user?.accountType !== 'fitflight_creator') {
    return (
      <View className="flex-1 bg-af-navy items-center justify-center">
        <Text className="text-white">Access Denied</Text>
      </View>
    );
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
          <View>
            <Text className="text-white text-xl font-bold">Cross-Squadron View</Text>
            <Text className="text-af-silver text-sm">FitFlight Creator Access</Text>
          </View>
        </Animated.View>

        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Squadron Selection */}
          <Animated.View
            entering={FadeInDown.delay(150).springify()}
            className="mt-4"
          >
            <Text className="text-white font-semibold text-lg mb-3">Select Squadron</Text>
            {squadronStats.map((stats, index) => (
              <Pressable
                key={stats.squadron}
                onPress={() => {
                  setSelectedSquadron(stats.squadron);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                className={cn(
                  "mb-3 p-4 rounded-2xl border",
                  selectedSquadron === stats.squadron
                    ? "bg-af-gold/20 border-af-gold/50"
                    : "bg-white/5 border-white/10"
                )}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <Building2
                      size={24}
                      color={selectedSquadron === stats.squadron ? "#FFD700" : "#C0C0C0"}
                    />
                    <View className="ml-3">
                      <Text className={cn(
                        "font-bold text-lg",
                        selectedSquadron === stats.squadron ? "text-af-gold" : "text-white"
                      )}>
                        {stats.squadron}
                      </Text>
                      <Text className="text-af-silver text-sm">
                        {stats.memberCount} members
                      </Text>
                    </View>
                  </View>
                  {stats.squadron === user?.squadron && (
                    <View className="bg-af-accent/20 px-3 py-1 rounded-full">
                      <Text className="text-af-accent text-xs font-semibold">Your Squadron</Text>
                    </View>
                  )}
                </View>

                {/* Quick Stats */}
                <View className="flex-row mt-3 pt-3 border-t border-white/10">
                  <View className="flex-1 items-center">
                    <Text className="text-white font-bold">{(stats.totalMinutes / 60).toFixed(2)}h</Text>
                    <Text className="text-af-silver text-xs">Exercise</Text>
                  </View>
                  <View className="flex-1 items-center">
                    <Text className="text-white font-bold">{stats.totalDistance.toFixed(2)}mi</Text>
                    <Text className="text-af-silver text-xs">Distance</Text>
                  </View>
                  <View className="flex-1 items-center">
                    <Text className="text-white font-bold">{stats.totalWorkouts}</Text>
                    <Text className="text-af-silver text-xs">Workouts</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </Animated.View>

          {/* Selected Squadron Details */}
          {selectedStats && (
            <Animated.View
              entering={FadeInDown.delay(200).springify()}
              className="mt-4"
            >
              <Text className="text-white font-semibold text-lg mb-3">
                {selectedStats.squadron} Details
              </Text>

              {/* Stats Card */}
              <View className="bg-white/5 rounded-2xl border border-white/10 p-4 mb-4">
                <Text className="text-white/60 text-xs uppercase tracking-wider mb-3">
                  Squadron Totals
                </Text>
                <View className="flex-row justify-between">
                  <View className="items-center flex-1">
                    <Timer size={24} color="#4A90D9" />
                    <Text className="text-white font-bold text-xl mt-1">
                      {(selectedStats.totalMinutes / 60).toFixed(2)}
                    </Text>
                    <Text className="text-af-silver text-xs">Hours</Text>
                  </View>
                  <View className="w-px bg-white/10" />
                  <View className="items-center flex-1">
                    <MapPin size={24} color="#22C55E" />
                    <Text className="text-white font-bold text-xl mt-1">
                      {selectedStats.totalDistance.toFixed(2)}
                    </Text>
                    <Text className="text-af-silver text-xs">Miles</Text>
                  </View>
                  <View className="w-px bg-white/10" />
                  <View className="items-center flex-1">
                    <Dumbbell size={24} color="#A855F7" />
                    <Text className="text-white font-bold text-xl mt-1">
                      {selectedStats.totalWorkouts}
                    </Text>
                    <Text className="text-af-silver text-xs">Workouts</Text>
                  </View>
                </View>
              </View>

              {/* Top Performers */}
              <View className="bg-white/5 rounded-2xl border border-white/10 p-4 mb-4">
                <View className="flex-row items-center mb-3">
                  <Trophy size={20} color="#FFD700" />
                  <Text className="text-white font-semibold ml-2">Top Performers</Text>
                </View>
                {selectedStats.topPerformers.map((performer, index) => (
                  <View
                    key={performer.id}
                    className="flex-row items-center py-2 border-b border-white/5 last:border-b-0"
                  >
                    <View className={cn(
                      "w-8 h-8 rounded-full items-center justify-center mr-3",
                      index === 0 ? "bg-af-gold/20" :
                      index === 1 ? "bg-af-silver/20" :
                      "bg-amber-900/20"
                    )}>
                      <Text className={cn(
                        "font-bold",
                        index === 0 ? "text-af-gold" :
                        index === 1 ? "text-af-silver" :
                        "text-amber-600"
                      )}>{index + 1}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-white font-medium">
                        {getDisplayName(performer)}
                      </Text>
                      <Text className="text-af-silver text-xs">{performer.flight} Flight</Text>
                    </View>
                    <Text className="text-af-accent font-bold">
                      {performer.totalScore.toLocaleString()} pts
                    </Text>
                  </View>
                ))}
              </View>

              {/* View Full Analytics Button */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  // Could navigate to analytics with squadron param
                  router.push('/analytics');
                }}
                className="flex-row items-center justify-center bg-af-accent py-4 rounded-xl"
              >
                <FileText size={20} color="white" />
                <Text className="text-white font-bold ml-2">View Full Analytics</Text>
              </Pressable>
            </Animated.View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
