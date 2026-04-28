import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Activity, Calendar, PieChart, TrendingUp } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';
import { useAuthStore, useMemberStore, getDisplayName } from '@/lib/store';
import { formatMonthLabel, getAvailableMonthKeys, getMemberAttendanceRecords, getMemberMonthSummary, getMonthKey } from '@/lib/monthlyStats';
import { useAppTheme } from '@/lib/theme';
import { PageContainer } from '@/components/PageContainer';
import { ThemeBackdrop } from '@/components/ThemeBackdrop';

const CHART_COLORS = ['#4A90D9', '#22C55E', '#A855F7', '#F59E0B', '#EF4444', '#14B8A6', '#EC4899', '#C084FC'];

function formatWeeklyRangeLabel(weekKey: string) {
  const [yearValue, monthValue, weekValue] = weekKey.split('-').map(Number);
  const year = Number.isFinite(yearValue) ? yearValue : new Date().getFullYear();
  const month = Number.isFinite(monthValue) ? monthValue : new Date().getMonth() + 1;
  const week = Number.isFinite(weekValue) ? weekValue : 1;
  const startDay = ((week - 1) * 7) + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const endDay = Math.min(startDay + 6, daysInMonth);
  const monthLabel = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'short' });
  return `${monthLabel} ${startDay}-${endDay}, ${year}`;
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDegrees: number) {
  const angleRadians = ((angleDegrees - 90) * Math.PI) / 180.0;
  return {
    x: cx + radius * Math.cos(angleRadians),
    y: cy + radius * Math.sin(angleRadians),
  };
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
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
  const activeMonthKey = availableMonths.includes(selectedMonthKey)
    ? selectedMonthKey
    : availableMonths[0] ?? getMonthKey();
  const contentMaxWidth = width >= 1440 ? 1240 : width >= 1180 ? 1120 : 980;

  const analytics = useMemo(() => {
    if (!member) {
      return null;
    }

    const summary = getMemberMonthSummary(member, activeMonthKey, ptSessions);
    const workouts = summary.workouts;
    const workoutTypeCounts = new Map<string, number>();
    const dailyCounts = new Map<string, number>();
    const dailyExcusedCounts = new Map<string, number>();
    const weeklyMinutes = new Map<string, number>();
    const weeklyExcusals = new Map<string, number>();

    const excusedRecords = getMemberAttendanceRecords(member, ptSessions).filter(
      (record) => record.source === 'excused' && record.date.startsWith(activeMonthKey)
    );

    workouts.forEach((workout) => {
      const label = workout.source === 'attendance' ? 'Attendance' : workout.type;
      workoutTypeCounts.set(label, (workoutTypeCounts.get(label) ?? 0) + 1);
      dailyCounts.set(workout.date, (dailyCounts.get(workout.date) ?? 0) + 1);

      const workoutDate = new Date(`${workout.date}T00:00:00`);
      const weekKey = `${workoutDate.getFullYear()}-${workoutDate.getMonth() + 1}-${Math.floor((workoutDate.getDate() - 1) / 7) + 1}`;
      weeklyMinutes.set(weekKey, (weeklyMinutes.get(weekKey) ?? 0) + workout.duration);
    });

    excusedRecords.forEach((record) => {
      workoutTypeCounts.set('Excused', (workoutTypeCounts.get('Excused') ?? 0) + 1);
      dailyExcusedCounts.set(record.date, (dailyExcusedCounts.get(record.date) ?? 0) + 1);

      const excusedDate = new Date(`${record.date}T00:00:00`);
      const weekKey = `${excusedDate.getFullYear()}-${excusedDate.getMonth() + 1}-${Math.floor((excusedDate.getDate() - 1) / 7) + 1}`;
      weeklyExcusals.set(weekKey, (weeklyExcusals.get(weekKey) ?? 0) + 1);
    });

    const workoutTypeBreakdown = Array.from(workoutTypeCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([type, count], index) => ({
        type,
        count,
        color: type === 'Excused' ? '#94A3B8' : CHART_COLORS[index % CHART_COLORS.length],
      }));

    const [year, month] = activeMonthKey.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const dailySeries = Array.from({ length: daysInMonth }, (_, index) => {
      const day = String(index + 1).padStart(2, '0');
      const dateKey = `${activeMonthKey}-${day}`;
      return {
        label: day,
        count: dailyCounts.get(dateKey) ?? 0,
        excusedCount: dailyExcusedCounts.get(dateKey) ?? 0,
      };
    });

    const weeklyKeys = Array.from(new Set([...weeklyMinutes.keys(), ...weeklyExcusals.keys()]))
      .sort((left, right) => left.localeCompare(right));
    const weeklyMinutesSeries = weeklyKeys.map((weekKey) => ({
      label: formatWeeklyRangeLabel(weekKey),
      minutes: weeklyMinutes.get(weekKey) ?? 0,
      excusedCount: weeklyExcusals.get(weekKey) ?? 0,
    }));

    const activityDays = new Set([
      ...dailyCounts.keys(),
      ...dailyExcusedCounts.keys(),
    ]);

    return {
      summary,
      workoutTypeBreakdown,
      dailySeries,
      weeklyMinutesSeries,
      excusedCount: excusedRecords.length,
      daysActive: activityDays.size,
      averageWorkoutMinutes: workouts.length > 0 ? summary.minutes / workouts.length : 0,
    };
  }, [activeMonthKey, member, ptSessions]);

  if (!user || !member || !analytics) {
    return (
      <View className="flex-1 items-center justify-center bg-af-navy px-6">
        <Text className="text-white text-lg font-semibold">Unable to load personal analytics.</Text>
      </View>
    );
  }

  const pieTotal = analytics.workoutTypeBreakdown.reduce((sum, item) => sum + item.count, 0);
  let currentAngle = 0;
  const pieArcs = analytics.workoutTypeBreakdown.map((item) => {
    const sweep = pieTotal > 0 ? (item.count / pieTotal) * 360 : 0;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sweep;
    currentAngle = endAngle;
    return {
      ...item,
      path: describeArc(64, 64, 48, startAngle, endAngle),
    };
  });

  const maxDailyCount = Math.max(...analytics.dailySeries.map((point) => point.count), 1);
  const linePoints = analytics.dailySeries.map((point, index) => {
    const x = analytics.dailySeries.length <= 1 ? 12 : 12 + (index / (analytics.dailySeries.length - 1)) * 256;
    const y = 108 - (point.count / maxDailyCount) * 88;
    return `${x},${y}`;
  }).join(' ');
  const maxWeeklyMinutes = Math.max(...analytics.weeklyMinutesSeries.map((point) => point.minutes), 1);

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
              <Text className="text-white/60 text-xs uppercase tracking-wider">Month</Text>
              <Text className="text-af-silver text-xs">{formatMonthLabel(activeMonthKey)}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 12 }}>
              {availableMonths.map((monthKey) => (
                <Pressable
                  key={monthKey}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedMonthKey(monthKey);
                  }}
                  className={`mr-2 rounded-full border px-3 py-1.5 ${activeMonthKey === monthKey ? 'bg-af-accent border-af-accent' : 'bg-white/5 border-white/10'}`}
                >
                  <Text className={activeMonthKey === monthKey ? 'text-white font-semibold text-xs' : 'text-af-silver text-xs'}>
                    {formatMonthLabel(monthKey)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(160).springify()} className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <Text className="text-white/60 text-xs uppercase tracking-wider mb-3">Snapshot</Text>
            <View className="flex-row justify-between">
              <View className="items-center flex-1">
                <Activity size={20} color="#A855F7" />
                <Text className="text-white font-bold text-lg mt-1">{analytics.summary.workoutCount}</Text>
                <Text className="text-af-silver text-xs">Workouts</Text>
              </View>
              <View className="w-px bg-white/10" />
              <View className="items-center flex-1">
                <Calendar size={20} color="#4A90D9" />
                <Text className="text-white font-bold text-lg mt-1">{analytics.daysActive}</Text>
                <Text className="text-af-silver text-xs">Logged Days</Text>
              </View>
              <View className="w-px bg-white/10" />
              <View className="items-center flex-1">
                <TrendingUp size={20} color="#22C55E" />
                <Text className="text-white font-bold text-lg mt-1">{analytics.averageWorkoutMinutes.toFixed(1)}</Text>
                <Text className="text-af-silver text-xs">Avg. Min/Day</Text>
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).springify()} className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <View className="flex-row items-center mb-3">
              <PieChart size={18} color="#FFD700" />
              <Text className="text-white font-semibold ml-2">Activity Types</Text>
            </View>
            <View className="items-center">
              <Svg width={160} height={160}>
                <Circle cx="64" cy="64" r="48" stroke="rgba(255,255,255,0.08)" strokeWidth="12" fill="none" />
                {pieArcs.map((arc) => (
                  <Path key={arc.type} d={arc.path} stroke={arc.color} strokeWidth="12" fill="none" strokeLinecap="round" />
                ))}
              </Svg>
            </View>
            <View className="mt-0">
              {analytics.workoutTypeBreakdown.map((item) => (
                <View key={item.type} className="flex-row items-center justify-between py-1.5">
                  <View className="flex-row items-center flex-1 pr-3">
                    <View className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: item.color }} />
                    <Text className="text-white">{item.type}</Text>
                  </View>
                  <Text className="text-af-silver text-sm">{item.count}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(240).springify()} className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <Text className="text-white font-semibold mb-1">Activity This Month</Text>
            <Text className="text-af-silver text-xs mb-3">Blue line shows workouts. Grey markers show excused sessions.</Text>
            <Svg width="100%" height="130" viewBox="0 0 280 120">
              <Line x1="12" y1="108" x2="268" y2="108" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <Line x1="12" y1="20" x2="12" y2="108" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <Polyline points={linePoints} fill="none" stroke="#4A90D9" strokeWidth="3" />
              {analytics.dailySeries.map((point, index) => {
                const x = analytics.dailySeries.length <= 1 ? 12 : 12 + (index / (analytics.dailySeries.length - 1)) * 256;
                const y = 108 - (point.count / maxDailyCount) * 88;
                return (
                  <React.Fragment key={point.label}>
                    <Circle cx={x} cy={y} r="2.5" fill="#7DD3FC" />
                    {point.excusedCount > 0 ? (
                      <Circle
                        cx={x}
                        cy={point.count > 0 ? Math.max(y - 10, 16) : 100}
                        r={3.5}
                        fill="none"
                        stroke="#94A3B8"
                        strokeWidth="2"
                      />
                    ) : null}
                  </React.Fragment>
                );
              })}
            </Svg>
            <View className="flex-row justify-between mt-1">
              <Text className="text-af-silver text-xs">Day 1</Text>
              <Text className="text-af-silver text-xs">Day {analytics.dailySeries.length}</Text>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(280).springify()} className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <Text className="text-white font-semibold mb-3">Weekly Minutes & Excusals</Text>
            {analytics.weeklyMinutesSeries.length === 0 ? (
              <Text className="text-af-silver text-sm">No workout minutes or excused sessions logged this month yet.</Text>
            ) : (
              analytics.weeklyMinutesSeries.map((item) => (
                <View key={item.label} className="mb-3">
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-white text-sm">{item.label}</Text>
                    <View className="flex-row items-center">
                      {item.excusedCount > 0 ? (
                        <View className="mr-2 rounded-full border border-slate-400/40 bg-slate-400/15 px-2 py-0.5">
                          <Text className="text-[11px] text-slate-300">{item.excusedCount} excused</Text>
                        </View>
                      ) : null}
                      <Text className="text-af-silver text-xs">{item.minutes} min</Text>
                    </View>
                  </View>
                  <View className="h-3 overflow-hidden rounded-full bg-white/10">
                    <View className="h-full rounded-full bg-af-accent" style={{ width: `${(item.minutes / maxWeeklyMinutes) * 100}%` }} />
                  </View>
                </View>
              ))
            )}
          </Animated.View>
          </PageContainer>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
