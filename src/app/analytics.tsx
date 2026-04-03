import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Download, FileSpreadsheet, FileText, Users, Trophy, Activity, TrendingUp, Calendar, BarChart3, Dumbbell } from 'lucide-react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring, withDelay } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useMemberStore, useAuthStore, getDisplayName, type Flight, type WorkoutType, WORKOUT_TYPES } from '@/lib/store';
import { cn } from '@/lib/cn';

const FLIGHTS: Flight[] = ['Apex', 'Bomber', 'Cryptid', 'Doom', 'Ewok', 'Foxhound', 'ADF', 'DET'];

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

  React.useEffect(() => {
    barWidth.value = withDelay(delay, withSpring(normalizedWidth, { damping: 15, stiffness: 100 }));
  }, [percentage, maxPercentage]);

  const animatedBarStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value}%`,
  }));

  const color = WORKOUT_TYPE_COLORS[type];

  return (
    <View className="mb-2">
      <View className="flex-row items-center justify-between mb-1">
        <View className="flex-row items-center">
          <View className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: color }} />
          <Text className="text-white text-sm">{type}</Text>
        </View>
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

export default function AnalyticsScreen() {
  const router = useRouter();
  const members = useMemberStore(s => s.members);
  const ptSessions = useMemberStore(s => s.ptSessions);
  const user = useAuthStore(s => s.user);
  const [isExporting, setIsExporting] = useState(false);

  // Calculate analytics
  const analytics = useMemo(() => {
    const totalMembers = members.length;
    const totalPTLs = members.filter(m => m.accountType === 'ptl').length;
    const totalSessions = ptSessions.length;
    const totalMinutes = members.reduce((acc, m) => acc + m.exerciseMinutes, 0);
    const totalMiles = members.reduce((acc, m) => acc + m.distanceRun, 0);

    // Flight breakdown
    const flightStats = FLIGHTS.map(flight => {
      const flightMembers = members.filter(m => m.flight === flight);
      const flightSessions = ptSessions.filter(s => s.flight === flight);
      const avgAttendance = flightSessions.length > 0
        ? flightSessions.reduce((acc, s) => acc + s.attendees.length, 0) / flightSessions.length
        : 0;

      return {
        flight,
        memberCount: flightMembers.length,
        totalMinutes: flightMembers.reduce((acc, m) => acc + m.exerciseMinutes, 0),
        totalMiles: flightMembers.reduce((acc, m) => acc + m.distanceRun, 0),
        avgAttendance: Math.round(avgAttendance * 10) / 10,
        sessions: flightSessions.length,
      };
    });

    // Top performers
      const topPerformers = [...members]
      .map(m => ({
        ...m,
        score: m.exerciseMinutes + Math.round(m.distanceRun * 10) + m.workouts.length * 25,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // Fitness assessment stats
    const membersWithFA = members.filter(m => m.fitnessAssessments.length > 0);
    const avgFAScore = membersWithFA.length > 0
      ? membersWithFA.reduce((acc, m) => {
          const latest = m.fitnessAssessments[m.fitnessAssessments.length - 1];
          return acc + (latest?.overallScore ?? 0);
        }, 0) / membersWithFA.length
      : 0;

    // Workout type breakdown
    const workoutTypeCounts: Record<WorkoutType, number> = {} as Record<WorkoutType, number>;
    WORKOUT_TYPES.forEach(type => { workoutTypeCounts[type] = 0; });

    let totalWorkouts = 0;
    members.forEach(member => {
      member.workouts.forEach(workout => {
        workoutTypeCounts[workout.type] = (workoutTypeCounts[workout.type] || 0) + 1;
        totalWorkouts++;
      });
    });

    const workoutTypeBreakdown = WORKOUT_TYPES
      .map(type => ({
        type,
        count: workoutTypeCounts[type],
        percentage: totalWorkouts > 0 ? (workoutTypeCounts[type] / totalWorkouts) * 100 : 0,
      }))
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count);

    return {
      totalMembers,
      totalPTLs,
      totalSessions,
      totalMinutes,
      totalMiles,
      flightStats,
      topPerformers,
      avgFAScore: Math.round(avgFAScore * 10) / 10,
      membersWithFA: membersWithFA.length,
      workoutTypeBreakdown,
      totalWorkouts,
    };
  }, [members, ptSessions]);

  const generateCSV = () => {
    let csv = 'Rank,First Name,Last Name,Flight,Account Type,Exercise Minutes,Distance (mi),Workouts,PT Sessions Required,Latest FA Score\n';

    members.forEach(m => {
      const latestFA = m.fitnessAssessments[m.fitnessAssessments.length - 1];
      csv += `${m.rank},${m.firstName},${m.lastName},${m.flight},${m.accountType},${m.exerciseMinutes},${m.distanceRun},${m.workouts.length},${m.requiredPTSessionsPerWeek},${latestFA?.overallScore ?? 'N/A'}\n`;
    });

    return csv;
  };

  const generateReport = () => {
    const date = new Date().toLocaleDateString();
    let report = `SQUADRON PT ANALYTICS REPORT\n`;
    report += `Generated: ${date}\n`;
    report += `Generated by: ${user ? getDisplayName(user) : 'Unknown'}\n\n`;

    report += `=== SQUADRON OVERVIEW ===\n`;
    report += `Total Members: ${analytics.totalMembers}\n`;
    report += `Total PTLs: ${analytics.totalPTLs}\n`;
    report += `Total PT Sessions: ${analytics.totalSessions}\n`;
    report += `Total Exercise Minutes: ${analytics.totalMinutes}\n`;
    report += `Total Miles Run: ${analytics.totalMiles.toFixed(1)}\n`;
    report += `Total Workouts Logged: ${analytics.totalWorkouts}\n`;
    report += `Average FA Score: ${analytics.avgFAScore}\n`;
    report += `Members with FA: ${analytics.membersWithFA}/${analytics.totalMembers}\n\n`;

    report += `=== FLIGHT BREAKDOWN ===\n`;
    analytics.flightStats.forEach(f => {
      report += `\n${f.flight} Flight:\n`;
      report += `  Members: ${f.memberCount}\n`;
      report += `  Total Minutes: ${f.totalMinutes}\n`;
      report += `  Total Miles: ${f.totalMiles.toFixed(1)}\n`;
      report += `  Sessions: ${f.sessions}\n`;
      report += `  Avg Attendance: ${f.avgAttendance}\n`;
    });

    report += `\n=== TOP 5 PERFORMERS ===\n`;
    analytics.topPerformers.forEach((p, i) => {
      report += `${i + 1}. ${getDisplayName(p)} - ${p.score} pts (${p.flight})\n`;
    });

    return report;
  };

  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const csv = generateCSV();
      const filename = `squadron_data_${new Date().toISOString().split('T')[0]}.csv`;
      const filePath = `${FileSystem.documentDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(filePath, csv);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'text/csv',
          dialogTitle: 'Export Squadron Data',
        });
      }
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      setIsExporting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const report = generateReport();
      const filename = `squadron_report_${new Date().toISOString().split('T')[0]}.txt`;
      const filePath = `${FileSystem.documentDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(filePath, report);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'text/plain',
          dialogTitle: 'Export Squadron Report',
        });
      }
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
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
          className="px-6 pt-4 pb-2 flex-row items-center justify-between"
        >
          <View className="flex-row items-center">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              className="w-10 h-10 bg-white/10 rounded-full items-center justify-center mr-4"
            >
              <ChevronLeft size={24} color="#C0C0C0" />
            </Pressable>
            <Text className="text-white text-xl font-bold">Squadron Analytics</Text>
          </View>
        </Animated.View>

        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Export Buttons */}
          <Animated.View
            entering={FadeInDown.delay(150).springify()}
            className="flex-row mt-4"
          >
            <Pressable
              onPress={handleExportPDF}
              disabled={isExporting}
              className={cn(
                "flex-1 flex-row items-center justify-center bg-purple-500/20 border border-purple-500/50 rounded-xl p-4 mr-2",
                isExporting && "opacity-50"
              )}
            >
              <FileText size={20} color="#A855F7" />
              <Text className="text-purple-400 font-semibold ml-2">Export Report</Text>
            </Pressable>
            <Pressable
              onPress={handleExportCSV}
              disabled={isExporting}
              className={cn(
                "flex-1 flex-row items-center justify-center bg-af-accent/20 border border-af-accent/50 rounded-xl p-4 ml-2",
                isExporting && "opacity-50"
              )}
            >
              <FileSpreadsheet size={20} color="#4A90D9" />
              <Text className="text-af-accent font-semibold ml-2">Export CSV</Text>
            </Pressable>
          </Animated.View>

          {/* Overview Stats */}
          <Animated.View
            entering={FadeInDown.delay(200).springify()}
            className="mt-4 p-4 bg-white/5 rounded-2xl border border-white/10"
          >
            <Text className="text-white font-semibold text-lg mb-4">Squadron Overview</Text>
            <View className="flex-row flex-wrap">
              <View className="w-1/2 p-2">
                <View className="bg-white/5 rounded-xl p-3">
                  <Users size={20} color="#4A90D9" />
                  <Text className="text-white font-bold text-2xl mt-2">{analytics.totalMembers}</Text>
                  <Text className="text-af-silver text-xs">Total Members</Text>
                </View>
              </View>
              <View className="w-1/2 p-2">
                <View className="bg-white/5 rounded-xl p-3">
                  <Dumbbell size={20} color="#A855F7" />
                  <Text className="text-white font-bold text-2xl mt-2">{analytics.totalWorkouts}</Text>
                  <Text className="text-af-silver text-xs">Total Workouts</Text>
                </View>
              </View>
              <View className="w-1/2 p-2">
                <View className="bg-white/5 rounded-xl p-3">
                  <Calendar size={20} color="#22C55E" />
                  <Text className="text-white font-bold text-2xl mt-2">{analytics.totalSessions}</Text>
                  <Text className="text-af-silver text-xs">PT Sessions</Text>
                </View>
              </View>
              <View className="w-1/2 p-2">
                <View className="bg-white/5 rounded-xl p-3">
                  <TrendingUp size={20} color="#F59E0B" />
                  <Text className="text-white font-bold text-2xl mt-2">{analytics.avgFAScore}</Text>
                  <Text className="text-af-silver text-xs">Avg FA Score</Text>
                </View>
              </View>
            </View>
          </Animated.View>

          {/* Activity Summary */}
          <Animated.View
            entering={FadeInDown.delay(250).springify()}
            className="mt-4 p-4 bg-white/5 rounded-2xl border border-white/10"
          >
            <Text className="text-white font-semibold text-lg mb-4">Activity Summary</Text>
            <View className="flex-row justify-between">
              <View className="items-center flex-1">
                <Dumbbell size={20} color="#A855F7" />
                <Text className="text-white font-bold text-xl mt-1">
                  {analytics.totalWorkouts}
                </Text>
                <Text className="text-af-silver text-xs">Workouts</Text>
              </View>
              <View className="w-px bg-white/10" />
              <View className="items-center flex-1">
                <Activity size={20} color="#4A90D9" />
                <Text className="text-white font-bold text-xl mt-1">
                  {Math.round(analytics.totalMinutes / 60)}
                </Text>
                <Text className="text-af-silver text-xs">Hours</Text>
              </View>
              <View className="w-px bg-white/10" />
              <View className="items-center flex-1">
                <Text className="text-white font-bold text-xl">
                  {analytics.totalMiles.toFixed(0)}
                </Text>
                <Text className="text-af-silver text-xs">Miles</Text>
              </View>
              <View className="w-px bg-white/10" />
              <View className="items-center flex-1">
                <Text className="text-white font-bold text-xl">
                  {analytics.totalWorkouts}
                </Text>
                <Text className="text-af-silver text-xs">Workouts</Text>
              </View>
            </View>
          </Animated.View>

          {/* Workout Type Breakdown */}
          {analytics.workoutTypeBreakdown.length > 0 && (
            <Animated.View
              entering={FadeInDown.delay(275).springify()}
              className="mt-4 p-4 bg-white/5 rounded-2xl border border-white/10"
            >
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-row items-center">
                  <BarChart3 size={20} color="#A855F7" />
                  <Text className="text-white font-semibold text-lg ml-2">Workout Types</Text>
                </View>
                <Text className="text-af-silver text-sm">{analytics.totalWorkouts} total workouts</Text>
              </View>
              {analytics.workoutTypeBreakdown.map((item, index) => (
                <WorkoutTypeBar
                  key={item.type}
                  type={item.type}
                  count={item.count}
                  percentage={item.percentage}
                  maxPercentage={analytics.workoutTypeBreakdown[0]?.percentage ?? 100}
                  delay={275 + index * 40}
                />
              ))}
            </Animated.View>
          )}

          {/* Flight Breakdown */}
          <Animated.View
            entering={FadeInDown.delay(300).springify()}
            className="mt-4"
          >
            <Text className="text-white font-semibold text-lg mb-3">Flight Breakdown</Text>
            {analytics.flightStats.map((flight) => (
              <View
                key={flight.flight}
                className="bg-white/5 rounded-xl p-4 mb-2 border border-white/10"
              >
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-white font-semibold">{flight.flight}</Text>
                  <Text className="text-af-silver text-sm">{flight.memberCount} members</Text>
                </View>
                <View className="flex-row justify-between">
                  <View>
                    <Text className="text-af-silver text-xs">Minutes</Text>
                    <Text className="text-white font-semibold">{flight.totalMinutes}</Text>
                  </View>
                  <View>
                    <Text className="text-af-silver text-xs">Miles</Text>
                    <Text className="text-white font-semibold">{flight.totalMiles.toFixed(1)}</Text>
                  </View>
                  <View>
                    <Text className="text-af-silver text-xs">Sessions</Text>
                    <Text className="text-white font-semibold">{flight.sessions}</Text>
                  </View>
                  <View>
                    <Text className="text-af-silver text-xs">Avg Attend</Text>
                    <Text className="text-white font-semibold">{flight.avgAttendance}</Text>
                  </View>
                </View>
              </View>
            ))}
          </Animated.View>

          {/* Top Performers */}
          <Animated.View
            entering={FadeInDown.delay(350).springify()}
            className="mt-4"
          >
            <Text className="text-white font-semibold text-lg mb-3">Top 5 Performers</Text>
            {analytics.topPerformers.map((performer, index) => (
              <View
                key={performer.id}
                className={cn(
                  "flex-row items-center p-3 rounded-xl mb-2",
                  index === 0 ? "bg-af-gold/20 border border-af-gold/50" :
                  index === 1 ? "bg-af-silver/20 border border-af-silver/50" :
                  index === 2 ? "bg-amber-900/20 border border-amber-700/50" :
                  "bg-white/5 border border-white/10"
                )}
              >
                <View className="w-8 h-8 bg-white/10 rounded-full items-center justify-center mr-3">
                  <Text className="text-white font-bold">{index + 1}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-white font-semibold">{getDisplayName(performer)}</Text>
                  <Text className="text-af-silver text-xs">{performer.flight} Flight</Text>
                </View>
                <Text className="text-af-accent font-bold">{performer.score.toLocaleString()} pts</Text>
              </View>
            ))}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
