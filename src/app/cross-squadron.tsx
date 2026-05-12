import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Building2, Users, Trophy, Timer, MapPin, Dumbbell, TrendingUp, FileText } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuthStore, useMemberStore, formatFlightDisplay, type Squadron, SQUADRONS, getDisplayName, shouldIncludeFlightInSquadronRollups } from '@/lib/store';
import { cn } from '@/lib/cn';
import { getMemberMonthSummary } from '@/lib/monthlyStats';
import { PageContainer } from '@/components/PageContainer';
import { ThemeBackdrop } from '@/components/ThemeBackdrop';
import { ThemeChrome } from '@/components/ThemeChrome';
import { getThemeBodyStyle, getThemeControlStyle, getThemeHeadingStyle, useAppTheme } from '@/lib/theme';

export default function CrossSquadronScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const user = useAuthStore(s => s.user);
  const members = useMemberStore(s => s.members);
  const ptSessions = useMemberStore(s => s.ptSessions);
  const [selectedSquadron, setSelectedSquadron] = useState<Squadron | null>(null);
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const contentMaxWidth = width >= 1440 ? 1240 : width >= 1180 ? 1100 : 960;

  // Get stats for each squadron - must be before conditional return
  const squadronStats = useMemo(() => {
    return SQUADRONS.map(squadron => {
      const squadronMembers = members.filter(m => m.squadron === squadron && shouldIncludeFlightInSquadronRollups(m.flight));
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
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: theme.background }}>
        <ThemeBackdrop />
        <Text style={getThemeHeadingStyle(theme, 22)}>Access Denied</Text>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <ThemeBackdrop />

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
            className="w-10 h-10 rounded-full items-center justify-center mr-4"
            style={getThemeControlStyle(theme)}
          >
            <ChevronLeft size={24} color={theme.textSecondary} />
          </Pressable>
          <View>
            <Text style={getThemeHeadingStyle(theme, 24)}>Cross-Squadron View</Text>
            <Text style={getThemeBodyStyle(theme, 14)}>FitFlight Creator Access</Text>
          </View>
        </Animated.View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40, alignItems: 'center' }}
          showsVerticalScrollIndicator={false}
        >
          <PageContainer maxWidth={contentMaxWidth} className="px-6">
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
                className="mb-3"
              >
              <ThemeChrome theme={theme} variant={selectedSquadron === stats.squadron ? 'feature' : 'default'}>
              <View className="p-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <Building2
                      size={24}
                      color={selectedSquadron === stats.squadron ? theme.accentAlt : theme.textSecondary}
                    />
                    <View className="ml-3">
                      <Text className={cn(
                        "font-bold text-lg",
                        ""
                      )}>
                        {stats.squadron}
                      </Text>
                      <Text className="text-sm" style={getThemeBodyStyle(theme, 14)}>
                        {stats.memberCount} members
                      </Text>
                    </View>
                  </View>
                  {stats.squadron === user?.squadron && (
                    <View className="px-3 py-1 rounded-full" style={getThemeControlStyle(theme, true)}>
                      <Text className="text-xs font-semibold" style={{ color: theme.accent }}>Your Squadron</Text>
                    </View>
                  )}
                </View>

                {/* Quick Stats */}
                <View className="flex-row mt-3 pt-3 border-t border-white/10">
                  <View className="flex-1 items-center">
                    <Text className="font-bold" style={{ color: theme.textPrimary }}>{(stats.totalMinutes / 60).toFixed(2)}h</Text>
                    <Text className="text-xs" style={getThemeBodyStyle(theme, 12)}>Exercise</Text>
                  </View>
                  <View className="flex-1 items-center">
                    <Text className="font-bold" style={{ color: theme.textPrimary }}>{stats.totalDistance.toFixed(2)}mi</Text>
                    <Text className="text-xs" style={getThemeBodyStyle(theme, 12)}>Distance</Text>
                  </View>
                  <View className="flex-1 items-center">
                    <Text className="font-bold" style={{ color: theme.textPrimary }}>{stats.totalWorkouts}</Text>
                    <Text className="text-xs" style={getThemeBodyStyle(theme, 12)}>Workouts</Text>
                  </View>
                </View>
              </View>
              </ThemeChrome>
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
              <ThemeChrome theme={theme} style={{ marginBottom: 16 }}>
              <View className="p-4">
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
              </ThemeChrome>

              {/* Top Performers */}
              <ThemeChrome theme={theme} style={{ marginBottom: 16 }}>
              <View className="p-4">
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
                      <Text className="text-af-silver text-xs">{formatFlightDisplay(performer.flight)}</Text>
                    </View>
                    <Text className="text-af-accent font-bold">
                      {performer.totalScore.toLocaleString()} pts
                    </Text>
                  </View>
                ))}
              </View>
              </ThemeChrome>

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
          </PageContainer>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
