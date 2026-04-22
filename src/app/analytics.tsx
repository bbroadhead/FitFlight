import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert, Platform, Modal, ActivityIndicator, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, FileSpreadsheet, FileText, Users, Activity, TrendingUp, Calendar, BarChart3, Dumbbell, X } from 'lucide-react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring, withDelay } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import Svg, { Circle } from 'react-native-svg';
import { format, startOfWeek, addDays } from 'date-fns';
import { useMemberStore, useAuthStore, formatFlightDisplay, getDisplayName, type Flight, type WorkoutType, WORKOUT_TYPES } from '@/lib/store';
import { cn } from '@/lib/cn';
import { trackAnalyticsEvent } from '@/lib/googleAnalytics';
import { fetchPFRABatchMembers, fetchPFRABatches, fetchWeeklyAttendanceExcusals, type PFRABatchMemberEntry, type PFRABatchSummary } from '@/lib/supabaseData';
import ExcelJS from 'exceljs';
import { formatMonthLabel, getAvailableMonthKeys, getMemberMonthSummary, getMonthKey, getMonthSessions } from '@/lib/monthlyStats';
import { useAppTheme } from '@/lib/theme';
import { PageContainer } from '@/components/PageContainer';
import { ThemeBackdrop } from '@/components/ThemeBackdrop';
import { ThemeChrome } from '@/components/ThemeChrome';
import { getThemeBodyStyle, getThemeControlStyle, getThemeHeadingStyle } from '@/lib/theme';

const FLIGHTS: Flight[] = ['Apex', 'Bomber', 'Cryptid', 'Doom', 'Ewok', 'Foxhound', 'ADF', 'DET'];
const WEEKLY_ATTENDANCE_TARGET = 5;

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

function RunningIcon({ size, color }: { size: number; color: string }) {
  return <MaterialCommunityIcons name="run-fast" size={size} color={color} />;
}

async function downloadWebFile(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

type OverviewCardKey = 'members' | 'workouts' | 'sessions' | 'pfra';
type PFRALeadershipFilter = 'all' | 'mock' | 'diagnostic' | 'official';

function formatPFRALabel(value: PFRALeadershipFilter) {
  return value === 'all' ? 'All' : value.charAt(0).toUpperCase() + value.slice(1);
}

function getPFRALeadershipFilters() {
  return ['all', 'mock', 'diagnostic', 'official'] as const;
}

function didPassAssessment(assessment: { overallScore: number; components: {
  cardio: { score: number; exempt?: boolean };
  pushups: { score: number; exempt?: boolean };
  situps: { score: number; exempt?: boolean };
  waist?: { score: number; exempt?: boolean };
} }) {
  return (
    assessment.overallScore >= 75 &&
    (assessment.components.cardio.exempt || assessment.components.cardio.score >= 20) &&
    (assessment.components.pushups.exempt || assessment.components.pushups.score >= 20) &&
    (assessment.components.situps.exempt || assessment.components.situps.score >= 20) &&
    (assessment.components.waist?.exempt || (assessment.components.waist?.score ?? 20) >= 20)
  );
}

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

  React.useEffect(() => {
    barWidth.value = withDelay(delay, withSpring(normalizedWidth, { damping: 15, stiffness: 100 }));
  }, [percentage, maxPercentage]);

  const animatedBarStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value}%`,
  }));

  const color = type === 'Attendance' ? '#4A90D9' : WORKOUT_TYPE_COLORS[type as WorkoutType];

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
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const allMembers = useMemberStore(s => s.members);
  const allPtSessions = useMemberStore(s => s.ptSessions);
  const user = useAuthStore(s => s.user);
  const accessToken = useAuthStore(s => s.accessToken);
  const [isExporting, setIsExporting] = useState(false);
  const [expandedOverviewCard, setExpandedOverviewCard] = useState<OverviewCardKey | null>(null);
  const [selectedMonthKey, setSelectedMonthKey] = useState(getMonthKey());
  const [selectedPFRARecordType, setSelectedPFRARecordType] = useState<PFRALeadershipFilter>('all');
  const [pfraBatches, setPfraBatches] = useState<PFRABatchSummary[]>([]);
  const [weeklyExcusedMemberIds, setWeeklyExcusedMemberIds] = useState<string[]>([]);
  const [showPFRADetailModal, setShowPFRADetailModal] = useState(false);
  const [selectedPFRABatch, setSelectedPFRABatch] = useState<PFRABatchSummary | null>(null);
  const [selectedPFRABatchMembers, setSelectedPFRABatchMembers] = useState<PFRABatchMemberEntry[]>([]);
  const [isLoadingBatchMembers, setIsLoadingBatchMembers] = useState(false);
  const contentMaxWidth = width >= 1440 ? 1320 : width >= 1180 ? 1180 : 1040;
  const userSquadron = user?.squadron ?? 'Hawks';
  const members = useMemo(
    () => allMembers.filter((member) => member.squadron === userSquadron),
    [allMembers, userSquadron]
  );
  const ptSessions = useMemo(
    () => allPtSessions.filter((session) => (session.squadron ?? 'Hawks') === userSquadron),
    [allPtSessions, userSquadron]
  );
  const availableMonthKeys = useMemo(
    () => getAvailableMonthKeys(members, ptSessions),
    [members, ptSessions]
  );
  const activeMonthKey = availableMonthKeys.includes(selectedMonthKey)
    ? selectedMonthKey
    : availableMonthKeys[0] ?? getMonthKey();

  useEffect(() => {
    trackAnalyticsEvent('view_analytics_dashboard', {
      squadron: userSquadron,
    });
  }, [userSquadron]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let isCancelled = false;
    void fetchPFRABatches(accessToken, userSquadron)
      .then((batches) => {
        if (!isCancelled) {
          setPfraBatches(batches);
        }
      })
      .catch(() => undefined);

    return () => {
      isCancelled = true;
    };
  }, [accessToken, userSquadron]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    let isCancelled = false;
    void fetchWeeklyAttendanceExcusals({
      weekStart,
      squadron: userSquadron,
      accessToken,
    }).then((entries) => {
      if (!isCancelled) {
        setWeeklyExcusedMemberIds(entries.map((entry) => entry.memberId));
      }
    }).catch(() => undefined);

    return () => {
      isCancelled = true;
    };
  }, [accessToken, userSquadron]);

  // Calculate analytics
  const analytics = useMemo(() => {
    const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const currentWeekDates = new Set(
      Array.from({ length: 7 }, (_, index) => format(addDays(currentWeekStart, index), 'yyyy-MM-dd'))
    );
    const totalMembers = members.length;
    const totalPFLs = members.filter(m => m.accountType === 'ptl').length;
    const monthSessions = getMonthSessions(ptSessions, activeMonthKey);
    const totalSessions = monthSessions.length;
    const totalMinutes = members.reduce((acc, m) => acc + getMemberMonthSummary(m, activeMonthKey).minutes, 0);
    const totalMiles = members.reduce((acc, m) => acc + getMemberMonthSummary(m, activeMonthKey).miles, 0);
    const currentWeekSessions = ptSessions.filter((session) => currentWeekDates.has(session.date));
    const totalAttendanceMarksThisWeek = currentWeekSessions.reduce((acc, session) => acc + session.attendees.length, 0);
    const excusedThisWeekCount = members.filter((member) => weeklyExcusedMemberIds.includes(member.id)).length;
    const weeklyComplianceEligibleMembers = Math.max(totalMembers - excusedThisWeekCount, 0);
    const membersMeetingWeeklyTarget = members.filter((member) => {
      if (weeklyExcusedMemberIds.includes(member.id)) {
        return true;
      }
      const weeklyAttendance = currentWeekSessions.reduce((count, session) => {
        return session.attendees.includes(member.id) ? count + 1 : count;
      }, 0);

      return weeklyAttendance >= WEEKLY_ATTENDANCE_TARGET;
    }).length;
    const weeklyCompliancePercent = weeklyComplianceEligibleMembers > 0
      ? Math.round(((membersMeetingWeeklyTarget - excusedThisWeekCount) / weeklyComplianceEligibleMembers) * 100)
      : 0;
    const averageWeeklyAttendance = totalMembers > 0
      ? totalAttendanceMarksThisWeek / totalMembers
      : 0;

    // Flight breakdown
    const flightStats = FLIGHTS.map(flight => {
      const flightMembers = members.filter(m => m.flight === flight);
      const flightSessions = monthSessions.filter(s => s.flight === flight);
      const avgAttendance = flightSessions.length > 0
        ? flightSessions.reduce((acc, s) => acc + s.attendees.length, 0) / flightSessions.length
        : 0;

      return {
        flight,
        memberCount: flightMembers.length,
        totalMinutes: flightMembers.reduce((acc, m) => acc + getMemberMonthSummary(m, activeMonthKey).minutes, 0),
        totalMiles: flightMembers.reduce((acc, m) => acc + getMemberMonthSummary(m, activeMonthKey).miles, 0),
        avgAttendance: Math.round(avgAttendance * 10) / 10,
        sessions: flightSessions.length,
      };
    });

    const pfraEntries = members.flatMap((member) =>
      member.fitnessAssessments.map((assessment) => ({
        id: assessment.id,
        memberId: member.id,
        memberName: getDisplayName(member),
        flight: member.flight,
        assessment,
      }))
    );
    const filteredPFRAEntries = pfraEntries.filter((entry) => {
      const recordType = entry.assessment.recordType ?? 'self';
      if (selectedPFRARecordType === 'all') {
        return recordType === 'mock' || recordType === 'diagnostic' || recordType === 'official';
      }

      return recordType === selectedPFRARecordType;
    });
    const membersWithFA = new Set(filteredPFRAEntries.map((entry) => entry.memberId));
    const avgPFRAScore = filteredPFRAEntries.length > 0
      ? filteredPFRAEntries.reduce((sum, entry) => sum + entry.assessment.overallScore, 0) / filteredPFRAEntries.length
      : 0;

    // Workout type breakdown
    const workoutTypeCounts = new Map<string, number>();
    WORKOUT_TYPES.forEach(type => { workoutTypeCounts.set(type, 0); });
    workoutTypeCounts.set('Attendance', 0);

    let totalWorkouts = 0;
    members.forEach(member => {
      getMemberMonthSummary(member, activeMonthKey).workouts.forEach(workout => {
        const label = workout.source === 'attendance' ? 'Attendance' : workout.type;
        workoutTypeCounts.set(label, (workoutTypeCounts.get(label) ?? 0) + 1);
        totalWorkouts++;
      });
    });

    const workoutTypeBreakdown = Array.from(workoutTypeCounts.entries())
      .map(([type, count]) => ({
        type,
        count,
        percentage: totalWorkouts > 0 ? (count / totalWorkouts) * 100 : 0,
      }))
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count);

    const memberWeeklySummaries = members
      .map((member) => {
        const weeklyAttendance = currentWeekSessions.reduce((count, session) => (
          session.attendees.includes(member.id) ? count + 1 : count
        ), 0);
        const weeklyWorkouts = member.workouts.filter((workout) => currentWeekDates.has(workout.date));
        const weeklyMinutes = weeklyWorkouts.reduce((count, workout) => count + workout.duration, 0);
        const weeklyMiles = weeklyWorkouts.reduce((count, workout) => count + (workout.distance ?? 0), 0);

        return {
          id: member.id,
          displayName: getDisplayName(member),
          firstName: member.firstName,
          lastName: member.lastName,
          flight: member.flight,
          attendance: weeklyAttendance,
          isExcused: weeklyExcusedMemberIds.includes(member.id),
          workouts: weeklyWorkouts.length,
          minutes: weeklyMinutes,
        miles: Number(weeklyMiles.toFixed(2)),
        };
      })
      .sort((left, right) =>
        left.lastName.localeCompare(right.lastName) ||
        left.firstName.localeCompare(right.firstName)
      );

    const workoutsByType = WORKOUT_TYPES
      .map((type) => ({
        type,
        count: workoutTypeCounts.get(type) ?? 0,
      }))
      .filter((item) => item.count > 0)
      .sort((left, right) => right.count - left.count);

    const longestWorkout = members
      .flatMap((member) => getMemberMonthSummary(member, activeMonthKey).workouts.map((workout) => ({ member, workout })))
      .sort((left, right) => right.workout.duration - left.workout.duration)[0] ?? null;

    const pfraTimeline = Array.from({ length: 3 }, (_, index) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (2 - index));
      const year = date.getFullYear();
      const month = date.getMonth();
      const monthLabel = date.toLocaleString('en-US', { month: 'short' });

      const monthScores = filteredPFRAEntries
        .filter(({ assessment }) => {
          const assessmentDate = new Date(assessment.date);
          return assessmentDate.getFullYear() === year && assessmentDate.getMonth() === month;
        })
        .map(({ assessment }) => assessment.overallScore);

      const average = monthScores.length > 0
        ? monthScores.reduce((sum, score) => sum + score, 0) / monthScores.length
        : 0;

      return {
        label: monthLabel,
        average: Math.round(average * 10) / 10,
        count: monthScores.length,
      };
    });

    const maxPFRAAverage = Math.max(...pfraTimeline.map((entry) => entry.average), 100);
    const recentPFRARecords = filteredPFRAEntries
      .map(({ assessment, memberName }) => ({
        id: assessment.id,
        memberName,
        score: assessment.overallScore,
        date: assessment.date,
        recordType: assessment.recordType ?? 'self',
        loggedByName: assessment.loggedByName ?? memberName,
      }))
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, 6);

    const latestMockBatch = pfraBatches
      .filter((batch) => batch.recordType === 'mock')
      .sort((left, right) => right.assessmentDate.localeCompare(left.assessmentDate))[0] ?? null;

    const componentAverages = filteredPFRAEntries.length > 0
      ? {
          waist: filteredPFRAEntries.reduce((sum, entry) => sum + (entry.assessment.components.waist?.score ?? 0), 0) / filteredPFRAEntries.length,
          strength: filteredPFRAEntries.reduce((sum, entry) => sum + entry.assessment.components.pushups.score, 0) / filteredPFRAEntries.length,
          core: filteredPFRAEntries.reduce((sum, entry) => sum + entry.assessment.components.situps.score, 0) / filteredPFRAEntries.length,
          cardio: filteredPFRAEntries.reduce((sum, entry) => sum + entry.assessment.components.cardio.score, 0) / filteredPFRAEntries.length,
        }
      : { waist: 0, strength: 0, core: 0, cardio: 0 };

    const passedEntries = filteredPFRAEntries.filter((entry) => didPassAssessment(entry.assessment));
    const overallPassRate = filteredPFRAEntries.length > 0
      ? passedEntries.length / filteredPFRAEntries.length
      : 0;
    const componentPassRates = filteredPFRAEntries.length > 0
      ? {
          waist: filteredPFRAEntries.filter((entry) => (entry.assessment.components.waist?.score ?? 0) >= 20 || entry.assessment.components.waist?.exempt).length / filteredPFRAEntries.length,
          strength: filteredPFRAEntries.filter((entry) => entry.assessment.components.pushups.score >= 20 || entry.assessment.components.pushups.exempt).length / filteredPFRAEntries.length,
          core: filteredPFRAEntries.filter((entry) => entry.assessment.components.situps.score >= 20 || entry.assessment.components.situps.exempt).length / filteredPFRAEntries.length,
          cardio: filteredPFRAEntries.filter((entry) => entry.assessment.components.cardio.score >= 20 || entry.assessment.components.cardio.exempt).length / filteredPFRAEntries.length,
        }
      : { waist: 0, strength: 0, core: 0, cardio: 0 };
    const pfraBatchesForFilter = pfraBatches.filter((batch) => (
      selectedPFRARecordType === 'all' ? true : batch.recordType === selectedPFRARecordType
    ));
    const latestSelectedBatch = pfraBatchesForFilter
      .sort((left, right) => right.assessmentDate.localeCompare(left.assessmentDate))[0] ?? null;

    return {
      totalMembers,
      totalPFLs,
      totalSessions,
      totalMinutes,
      totalMiles,
      totalAttendanceMarksThisWeek,
      excusedThisWeekCount,
      weeklyComplianceEligibleMembers,
      membersMeetingWeeklyTarget,
      weeklyCompliancePercent,
      averageWeeklyAttendance: Math.round(averageWeeklyAttendance * 10) / 10,
      memberWeeklySummaries,
      workoutsByType,
      longestWorkout,
      pfraTimeline,
      maxPFRAAverage,
      recentPFRARecords,
      latestMockBatch,
      pfraTotalCount: filteredPFRAEntries.length,
      componentAverages,
      componentPassRates,
      overallPassRate,
      recentPFRABatches: pfraBatchesForFilter.slice(0, 5),
      latestSelectedBatch,
      flightStats,
      avgPFRAScore: Math.round(avgPFRAScore * 10) / 10,
      membersWithFA: membersWithFA.size,
      workoutTypeBreakdown,
      totalWorkouts,
      activeMonthKey,
    };
  }, [activeMonthKey, members, pfraBatches, ptSessions, selectedPFRARecordType, weeklyExcusedMemberIds]);

  const buildPdfHtml = () => {
    const generatedAt = new Date().toLocaleString();
    const flightRows = analytics.flightStats.map((flight) => `
      <tr>
        <td>${flight.flight}</td>
        <td>${flight.memberCount}</td>
        <td>${flight.sessions}</td>
        <td>${flight.avgAttendance}</td>
        <td>${flight.totalMinutes}</td>
        <td>${flight.totalMiles.toFixed(2)}</td>
      </tr>
    `).join('');

    return `
      <html>
        <head>
          <style>
            @page { size: letter; margin: 0.5in; }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body { font-family: Arial, sans-serif; background: #0A1628; color: #fff; padding: 24px; }
            h1, h2 { margin: 0 0 12px; }
            .subtitle { color: #c0c0c0; margin-bottom: 24px; }
            .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 24px; }
            .card { background: #12243f; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px; }
            .label { color: #c0c0c0; font-size: 12px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.08em; }
            .value { font-size: 28px; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.08); }
            th { color: #9fb3d1; font-size: 12px; text-transform: uppercase; }
            .section { margin-top: 24px; }
            .shell {
              background: linear-gradient(135deg, #0A1628 0%, #001F5C 50%, #0A1628 100%);
              border-radius: 24px;
              padding: 24px;
            }
          </style>
        </head>
        <body>
          <div class="shell">
            <h1>${userSquadron} Squadron Analytics</h1>
            <div class="subtitle">Generated ${generatedAt}${user ? ` by ${getDisplayName(user)}` : ''} for ${formatMonthLabel(activeMonthKey)}</div>
            <div class="grid">
              <div class="card"><div class="label">Members</div><div class="value">${analytics.totalMembers}</div></div>
              <div class="card"><div class="label">Workouts</div><div class="value">${analytics.totalWorkouts}</div></div>
              <div class="card"><div class="label">PT Sessions</div><div class="value">${analytics.totalSessions}</div></div>
              <div class="card"><div class="label">Avg PFRA</div><div class="value">${analytics.avgPFRAScore}</div></div>
              <div class="card"><div class="label">Logged PFRAs</div><div class="value">${analytics.pfraTotalCount}</div></div>
              <div class="card"><div class="label">Attendance This Week</div><div class="value">${analytics.totalAttendanceMarksThisWeek}</div></div>
              <div class="card"><div class="label">Members at 5/5</div><div class="value">${analytics.membersMeetingWeeklyTarget}/${analytics.totalMembers} (${analytics.weeklyCompliancePercent}%)</div></div>
            </div>
            <div class="section">
              <h2>Flight Breakdown</h2>
              <table>
                <thead>
                  <tr><th>Flight</th><th>Members</th><th>Sessions</th><th>Avg Attend</th><th>Minutes</th><th>Miles</th></tr>
                </thead>
                <tbody>${flightRows}</tbody>
              </table>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const buildWorkbook = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FitFlight';
    workbook.created = new Date();

    const overviewSheet = workbook.addWorksheet('Overview');
    overviewSheet.columns = [
      { header: 'Metric', key: 'metric', width: 32 },
      { header: 'Value', key: 'value', width: 22 },
    ];
    overviewSheet.addRows([
      { metric: 'Squadron', value: userSquadron },
      { metric: 'Total Members', value: analytics.totalMembers },
      { metric: 'Total PFLs', value: analytics.totalPFLs },
      { metric: 'Report Month', value: formatMonthLabel(activeMonthKey) },
      { metric: 'Total Workouts', value: analytics.totalWorkouts },
      { metric: 'Total PT Sessions', value: analytics.totalSessions },
      { metric: 'Total Minutes', value: analytics.totalMinutes },
      { metric: 'Total Miles', value: analytics.totalMiles },
      { metric: 'Attendance Marks This Week', value: analytics.totalAttendanceMarksThisWeek },
      { metric: 'Members at 5/5 This Week', value: `${analytics.membersMeetingWeeklyTarget}/${analytics.totalMembers}` },
      { metric: 'Weekly Compliance %', value: analytics.weeklyCompliancePercent },
      { metric: 'Average PFRA', value: analytics.avgPFRAScore },
      { metric: 'Members With PFRA', value: analytics.membersWithFA },
      { metric: 'Logged PFRA Count', value: analytics.pfraTotalCount },
      { metric: 'Latest Mock Completion %', value: analytics.latestMockBatch ? Math.round(analytics.latestMockBatch.completionRate * 100) : '' },
    ]);

    const membersSheet = workbook.addWorksheet('Members');
    membersSheet.columns = [
      { header: 'Rank', key: 'rank', width: 12 },
      { header: 'First Name', key: 'firstName', width: 18 },
      { header: 'Last Name', key: 'lastName', width: 22 },
      { header: 'Flight', key: 'flight', width: 12 },
      { header: 'Role', key: 'role', width: 18 },
      { header: 'Minutes', key: 'minutes', width: 12 },
      { header: 'Miles', key: 'miles', width: 12 },
      { header: 'Workouts', key: 'workouts', width: 12 },
      { header: 'Attendance This Week', key: 'attendance', width: 18 },
      { header: 'Latest PFRA', key: 'pfra', width: 14 },
    ];
    members.forEach((member) => {
      const latestPFRA = member.fitnessAssessments[member.fitnessAssessments.length - 1];
      const weeklySummary = analytics.memberWeeklySummaries.find((item) => item.id === member.id);
      membersSheet.addRow({
        rank: member.rank,
        firstName: member.firstName,
        lastName: member.lastName,
        flight: member.flight,
        role:
          member.accountType === 'ptl'
            ? 'PFL'
            : member.accountType === 'squadron_leadership'
              ? 'Squadron Leadership'
              : member.accountType === 'demo'
                ? 'Demo Role'
                : member.accountType === 'ufpm'
                ? 'UFPM'
                : member.accountType,
        minutes: member.exerciseMinutes,
        miles: member.distanceRun,
        workouts: member.workouts.length,
        attendance: weeklySummary?.attendance ?? 0,
        pfra: latestPFRA?.overallScore ?? '',
      });
    });

    const flightsSheet = workbook.addWorksheet('Flights');
    flightsSheet.columns = [
      { header: 'Flight', key: 'flight', width: 12 },
      { header: 'Members', key: 'memberCount', width: 12 },
      { header: 'Sessions', key: 'sessions', width: 12 },
      { header: 'Avg Attendance', key: 'avgAttendance', width: 16 },
      { header: 'Minutes', key: 'totalMinutes', width: 12 },
      { header: 'Miles', key: 'totalMiles', width: 12 },
    ];
    analytics.flightStats.forEach((flight) => flightsSheet.addRow(flight));

    const workoutsSheet = workbook.addWorksheet('Workout Details');
    workoutsSheet.columns = [
      { header: 'Workout Type', key: 'type', width: 18 },
      { header: 'Count', key: 'count', width: 12 },
      { header: 'Share %', key: 'share', width: 12 },
    ];
    analytics.workoutTypeBreakdown.forEach((item) => {
      workoutsSheet.addRow({
        type: item.type,
        count: item.count,
        share: Number(item.percentage.toFixed(1)),
      });
    });

    const pfraSheet = workbook.addWorksheet('PFRA Trend');
    pfraSheet.columns = [
      { header: 'Month', key: 'label', width: 12 },
      { header: 'Avg PFRA', key: 'average', width: 14 },
      { header: 'Entries', key: 'count', width: 10 },
    ];
    analytics.pfraTimeline.forEach((entry) => pfraSheet.addRow(entry));

    const pfraBatchSheet = workbook.addWorksheet('PFRA Batches');
    pfraBatchSheet.columns = [
      { header: 'Date', key: 'assessmentDate', width: 14 },
      { header: 'Type', key: 'recordType', width: 14 },
      { header: 'Flights', key: 'flights', width: 24 },
      { header: 'Completed', key: 'completedCount', width: 12 },
      { header: 'Expected', key: 'expectedCount', width: 12 },
      { header: 'Completion %', key: 'completionRate', width: 14 },
      { header: 'Created By', key: 'createdByName', width: 24 },
    ];
    analytics.recentPFRABatches.forEach((batch) => {
      pfraBatchSheet.addRow({
        assessmentDate: batch.assessmentDate,
        recordType: batch.recordType,
        flights: batch.selectedFlights.join(', '),
        completedCount: batch.completedCount,
        expectedCount: batch.expectedCount,
        completionRate: Math.round(batch.completionRate * 100),
        createdByName: batch.createdByName,
      });
    });

    [overviewSheet, membersSheet, flightsSheet, workoutsSheet, pfraSheet, pfraBatchSheet].forEach((sheet) => {
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    });

    return workbook.xlsx.writeBuffer();
  };

  const buildPFRASummariesForExport = () => {
    const recordTypes = getPFRALeadershipFilters();
    return recordTypes.map((recordType) => {
      const entries = members.flatMap((member) =>
        member.fitnessAssessments
          .filter((assessment) => {
            const type = assessment.recordType ?? 'self';
            if (recordType === 'all') {
              return type === 'mock' || type === 'diagnostic' || type === 'official';
            }

            return type === recordType;
          })
          .map((assessment) => ({
            memberName: getDisplayName(member),
            flight: member.flight,
            assessment,
          }))
      );
      const batches = pfraBatches.filter((batch) => recordType === 'all' ? true : batch.recordType === recordType);
      const avgScore = entries.length > 0
        ? entries.reduce((sum, entry) => sum + entry.assessment.overallScore, 0) / entries.length
        : 0;

      return {
        recordType,
        label: formatPFRALabel(recordType),
        avgScore: Number(avgScore.toFixed(1)),
        count: entries.length,
        completionRate: batches.length > 0
          ? Number(((batches.reduce((sum, batch) => sum + batch.completionRate, 0) / batches.length) * 100).toFixed(1))
          : 0,
        entries,
        batches,
      };
    });
  };

  const buildPFRAPdfHtml = () => {
    const sections = buildPFRASummariesForExport().map((section) => {
      const entryRows = section.entries.slice(0, 10).map((entry) => `
        <tr>
          <td>${entry.memberName}</td>
          <td>${entry.flight}</td>
          <td>${entry.assessment.date}</td>
          <td>${entry.assessment.overallScore.toFixed(1)}</td>
          <td>${didPassAssessment(entry.assessment) ? 'Pass' : 'Needs Improvement'}</td>
        </tr>
      `).join('');

      return `
        <div class="section">
          <h2>${section.label}</h2>
          <div class="grid">
            <div class="card"><div class="label">Logged PFRAs</div><div class="value">${section.count}</div></div>
            <div class="card"><div class="label">Average Score</div><div class="value">${section.avgScore}</div></div>
            <div class="card"><div class="label">Batch Completion Rate</div><div class="value">${section.completionRate}%</div></div>
          </div>
          <table>
            <thead>
              <tr><th>Member</th><th>Flight</th><th>Date</th><th>Score</th><th>Status</th></tr>
            </thead>
            <tbody>${entryRows || '<tr><td colspan="5">No PFRA records</td></tr>'}</tbody>
          </table>
        </div>
      `;
    }).join('');

    return `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background: #0A1628; color: #fff; padding: 24px; }
            h1, h2 { margin: 0 0 12px; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
            .card { background: #12243f; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px; }
            .label { color: #c0c0c0; font-size: 12px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.08em; }
            .value { font-size: 24px; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.08); }
            th { color: #9fb3d1; font-size: 12px; text-transform: uppercase; }
            .section { margin-top: 24px; }
          </style>
        </head>
        <body>
          <h1>${userSquadron} PFRA Leadership Summary</h1>
          <p>Generated ${new Date().toLocaleString()}</p>
          ${sections}
        </body>
      </html>
    `;
  };

  const buildPFRAWorkbook = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FitFlight';
    workbook.created = new Date();

    buildPFRASummariesForExport().forEach((section) => {
      const summarySheet = workbook.addWorksheet(`${section.label} PFRA`);
      summarySheet.columns = [
        { header: 'Metric', key: 'metric', width: 28 },
        { header: 'Value', key: 'value', width: 18 },
      ];
      summarySheet.addRows([
        { metric: 'Record Type', value: section.label },
        { metric: 'Logged PFRAs', value: section.count },
        { metric: 'Average Score', value: section.avgScore },
        { metric: 'Batch Completion Rate %', value: section.completionRate },
      ]);

      const detailSheet = workbook.addWorksheet(`${section.label} Entries`);
      detailSheet.columns = [
        { header: 'Member', key: 'member', width: 28 },
        { header: 'Flight', key: 'flight', width: 12 },
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Score', key: 'score', width: 12 },
        { header: 'Pass', key: 'pass', width: 12 },
      ];
      section.entries.forEach((entry) => {
        detailSheet.addRow({
          member: entry.memberName,
          flight: entry.flight,
          date: entry.assessment.date,
          score: entry.assessment.overallScore,
          pass: didPassAssessment(entry.assessment) ? 'Pass' : 'Needs Improvement',
        });
      });

      [summarySheet, detailSheet].forEach((sheet) => {
        sheet.getRow(1).font = { bold: true };
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
      });
    });

    return workbook.xlsx.writeBuffer();
  };

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const buffer = await buildWorkbook();
      const filename = `squadron_analytics_${new Date().toISOString().split('T')[0]}.xlsx`;

      if (Platform.OS === 'web') {
        await downloadWebFile(
          filename,
          new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          })
        );
      } else {
        const base64 = Buffer.from(buffer).toString('base64');
        const filePath = `${FileSystem.documentDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(filePath, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(filePath, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Export Squadron Analytics Excel',
          });
        }
      }
      trackAnalyticsEvent('export_analytics_report', {
        format: 'excel',
        squadron: userSquadron,
      });
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPFRAExcel = async () => {
    try {
      setIsExporting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const buffer = await buildPFRAWorkbook();
      const filename = `pfra_leadership_summary_${new Date().toISOString().split('T')[0]}.xlsx`;

      if (Platform.OS === 'web') {
        await downloadWebFile(
          filename,
          new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          })
        );
      } else {
        const base64 = Buffer.from(buffer).toString('base64');
        const filePath = `${FileSystem.documentDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(filePath, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(filePath, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Export PFRA Leadership Summary Excel',
          });
        }
      }
    } catch (error) {
      console.error('PFRA export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      setIsExporting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const html = buildPdfHtml();
      const filename = `squadron_analytics_${new Date().toISOString().split('T')[0]}.pdf`;

      if (Platform.OS === 'web') {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => printWindow.print(), 300);
        }
      } else {
        const file = await Print.printToFileAsync({ html, base64: false });
        const targetPath = `${FileSystem.documentDirectory}${filename}`;
        await FileSystem.copyAsync({
          from: file.uri,
          to: targetPath,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(targetPath, {
            mimeType: 'application/pdf',
            dialogTitle: 'Export Squadron Analytics PDF',
          });
        }
      }
      trackAnalyticsEvent('export_analytics_report', {
        format: 'pdf',
        squadron: userSquadron,
      });
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPFRAPDF = async () => {
    try {
      setIsExporting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const html = buildPFRAPdfHtml();
      const filename = `pfra_leadership_summary_${new Date().toISOString().split('T')[0]}.pdf`;

      if (Platform.OS === 'web') {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => printWindow.print(), 300);
        }
      } else {
        const file = await Print.printToFileAsync({ html, base64: false });
        const targetPath = `${FileSystem.documentDirectory}${filename}`;
        await FileSystem.copyAsync({ from: file.uri, to: targetPath });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(targetPath, {
            mimeType: 'application/pdf',
            dialogTitle: 'Export PFRA Leadership Summary PDF',
          });
        }
      }
    } catch (error) {
      console.error('PFRA export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenPFRABatchDetails = async (batch: PFRABatchSummary) => {
    if (!accessToken) {
      return;
    }

    setSelectedPFRABatch(batch);
    setShowPFRADetailModal(true);
    setIsLoadingBatchMembers(true);
    try {
      const members = await fetchPFRABatchMembers(batch.id, accessToken);
      setSelectedPFRABatchMembers(members);
    } catch (error) {
      console.error('Unable to load PFRA batch members', error);
      setSelectedPFRABatchMembers([]);
    } finally {
      setIsLoadingBatchMembers(false);
    }
  };

  const toggleOverviewCard = (card: OverviewCardKey) => {
    Haptics.selectionAsync();
    setExpandedOverviewCard((current) => (current === card ? null : card));
  };

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
        </PageContainer>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40, alignItems: 'center' }}
          showsVerticalScrollIndicator={false}
        >
          <PageContainer maxWidth={contentMaxWidth} className="px-6">
          <Animated.View
            entering={FadeInDown.delay(125).springify()}
            className="mt-4"
          >
            <Text className="text-white/60 text-xs uppercase tracking-wider mb-2">Report Month</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 12 }}>
              {availableMonthKeys.map((monthKey) => (
                <Pressable
                  key={monthKey}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedMonthKey(monthKey);
                  }}
                  className={cn(
                    "px-3 py-2 rounded-full mr-2 border",
                    activeMonthKey === monthKey ? "bg-af-accent border-af-accent" : "bg-white/5 border-white/10"
                  )}
                >
                  <Text className={cn(
                    "text-xs",
                    activeMonthKey === monthKey ? "text-white font-semibold" : "text-af-silver"
                  )}>
                    {formatMonthLabel(monthKey)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>

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
              <View className="ml-2">
                <Text className="text-purple-400 font-semibold">Export PDF</Text>
                <Text className="text-purple-300/80 text-[11px]">Summaries</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={handleExportExcel}
              disabled={isExporting}
              className={cn(
                "flex-1 flex-row items-center justify-center bg-af-accent/20 border border-af-accent/50 rounded-xl p-4 ml-2",
                isExporting && "opacity-50"
              )}
            >
              <FileSpreadsheet size={20} color="#4A90D9" />
              <View className="ml-2">
                <Text className="text-af-accent font-semibold">Export Excel</Text>
                <Text className="text-af-accent/80 text-[11px]">Detailed Report</Text>
              </View>
            </Pressable>
          </Animated.View>

          {/* Overview Stats */}
          <Animated.View
            entering={FadeInDown.delay(200).springify()}
            className="mt-4 p-4 bg-white/5 rounded-2xl border border-white/10"
          >
            <Text className="text-white font-semibold text-lg mb-1">Squadron Overview</Text>
            <Text className="text-af-silver text-xs mb-3">{formatMonthLabel(activeMonthKey)}</Text>
            <Text className="text-af-silver text-xs mb-3">Tap to expand for additional details</Text>
            <View className="flex-row flex-wrap">
              <View className="w-1/2 p-2">
                <Pressable onPress={() => toggleOverviewCard('members')} className="bg-white/5 rounded-xl p-3 border border-transparent active:border-white/10">
                  <Users size={20} color="#4A90D9" />
                  <Text className="text-white font-bold text-2xl mt-2">{analytics.totalMembers}</Text>
                  <Text className="text-af-silver text-xs">Total Members</Text>
                </Pressable>
              </View>
              <View className="w-1/2 p-2">
                <Pressable onPress={() => toggleOverviewCard('workouts')} className="bg-white/5 rounded-xl p-3 border border-transparent active:border-white/10">
                  <Dumbbell size={20} color="#A855F7" />
                  <Text className="text-white font-bold text-2xl mt-2">{analytics.totalWorkouts}</Text>
                  <Text className="text-af-silver text-xs">Total Workouts</Text>
                </Pressable>
              </View>
              <View className="w-1/2 p-2">
                <Pressable onPress={() => toggleOverviewCard('sessions')} className="bg-white/5 rounded-xl p-3 border border-transparent active:border-white/10">
                  <Calendar size={20} color="#22C55E" />
                  <Text className="text-white font-bold text-2xl mt-2">{analytics.totalSessions}</Text>
                  <Text className="text-af-silver text-xs">PT Sessions</Text>
                </Pressable>
              </View>
              <View className="w-1/2 p-2">
                <Pressable onPress={() => toggleOverviewCard('pfra')} className="bg-white/5 rounded-xl p-3 border border-transparent active:border-white/10">
                  <TrendingUp size={20} color="#F59E0B" />
                  <Text className="text-white font-bold text-2xl mt-2">{analytics.avgPFRAScore}</Text>
                  <Text className="text-af-silver text-xs">Avg PFRA Score</Text>
                </Pressable>
              </View>
            </View>
            <View className="mt-3 pt-3 border-t border-white/10 flex-row items-center justify-between">
              <Text className="text-af-silver text-xs">Attendance this week</Text>
              <Text className="text-white font-semibold text-sm">
                {analytics.totalAttendanceMarksThisWeek} check-ins
              </Text>
            </View>
            <View className="mt-2 flex-row items-center justify-between">
              <Text className="text-af-silver text-xs">Members at 5/5</Text>
                <Text className="text-white font-semibold text-sm">
                  {analytics.membersMeetingWeeklyTarget - analytics.excusedThisWeekCount}/{analytics.weeklyComplianceEligibleMembers} ({analytics.weeklyCompliancePercent}%)
                </Text>
            </View>
            {analytics.excusedThisWeekCount > 0 ? (
              <View className="mt-2 flex-row items-center justify-between">
                <Text className="text-af-silver text-xs">Excused this week</Text>
                <Text className="text-white font-semibold text-sm">{analytics.excusedThisWeekCount}</Text>
              </View>
            ) : null}
            {expandedOverviewCard === 'members' && (
              <View className="mt-4 pt-4 border-t border-white/10">
                <Text className="text-white font-semibold mb-3">Squadron Members This Week</Text>
                {analytics.memberWeeklySummaries.map((member) => (
                  <View key={member.id} className="flex-row items-center justify-between py-2 border-b border-white/5">
                    <View className="flex-1 pr-3">
                      <Text className="text-white font-medium">{member.displayName}</Text>
                      <Text className="text-af-silver text-xs">{formatFlightDisplay(member.flight)}</Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-white text-sm">{member.isExcused ? 'Excused this week' : `${member.attendance}/5 attendance`}</Text>
                      <Text className="text-af-silver text-xs">
                    {member.workouts} workouts, {member.minutes} min, {member.miles.toFixed(2)} mi
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
            {expandedOverviewCard === 'workouts' && (
              <View className="mt-4 pt-4 border-t border-white/10">
                <Text className="text-white font-semibold mb-3">Workout Details</Text>
                <View className="flex-row justify-between mb-3">
                  <View>
                    <Text className="text-af-silver text-xs">Workout Types Tracked</Text>
                    <Text className="text-white font-semibold">{analytics.workoutsByType.length}</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-af-silver text-xs">Longest Logged Workout</Text>
                      <Text className="text-white font-semibold">
                        {analytics.longestWorkout ? `${analytics.longestWorkout.workout.duration} min` : 'None yet'}
                      </Text>
                  </View>
                </View>
                {analytics.workoutsByType.map((item) => (
                  <View key={item.type} className="flex-row items-center justify-between py-2 border-b border-white/5">
                    <Text className="text-white">{item.type}</Text>
                    <Text className="text-af-silver">{item.count}</Text>
                  </View>
                ))}
              </View>
            )}
            {expandedOverviewCard === 'sessions' && (
              <View className="mt-4 pt-4 border-t border-white/10">
                <Text className="text-white font-semibold mb-3">PT Session Details</Text>
                <View className="flex-row justify-between mb-3">
                  <View>
                    <Text className="text-af-silver text-xs">Attendance Marks This Week</Text>
                    <Text className="text-white font-semibold">{analytics.totalAttendanceMarksThisWeek}</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-af-silver text-xs">Avg Attendance Per Session</Text>
                    <Text className="text-white font-semibold">
                      {analytics.totalSessions > 0 ? (analytics.totalAttendanceMarksThisWeek / Math.max(analytics.totalSessions, 1)).toFixed(1) : '0.0'}
                    </Text>
                  </View>
                </View>
                {analytics.flightStats.map((flight) => (
                  <View key={flight.flight} className="flex-row items-center justify-between py-2 border-b border-white/5">
                    <View>
                      <Text className="text-white">{flight.flight}</Text>
                      <Text className="text-af-silver text-xs">{flight.sessions} sessions</Text>
                    </View>
                    <Text className="text-white font-semibold">{flight.avgAttendance} avg attend</Text>
                  </View>
                ))}
              </View>
            )}
            {expandedOverviewCard === 'pfra' && (
              <View className="mt-4 pt-4 border-t border-white/10">
                <Text className="text-white font-semibold mb-3">PFRA Trend: Last 3 Months</Text>
                <View className="flex-row items-end justify-between h-36">
                  {analytics.pfraTimeline.map((entry) => {
                    const heightPercent = analytics.maxPFRAAverage > 0 ? (entry.average / analytics.maxPFRAAverage) * 100 : 0;
                    return (
                      <View key={entry.label} className="flex-1 items-center">
                        <Text className="text-af-silver text-[11px] mb-2">{entry.average ? entry.average.toFixed(2) : '--'}</Text>
                        <View className="h-24 w-12 justify-end">
                          <View
                            className="w-12 rounded-t-xl bg-af-accent/80 border border-af-accent/30"
                            style={{ height: `${Math.max(heightPercent, entry.count > 0 ? 12 : 0)}%` }}
                          />
                        </View>
                        <Text className="text-white text-xs font-medium mt-2">{entry.label}</Text>
                        <Text className="text-af-silver text-[11px]">{entry.count} entries</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
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
                  {(analytics.totalMinutes / 60).toFixed(2)}
                </Text>
                <Text className="text-af-silver text-xs">Hours</Text>
              </View>
              <View className="w-px bg-white/10" />
              <View className="items-center flex-1">
                <RunningIcon size={20} color="#22C55E" />
                <Text className="text-white font-bold text-xl mt-1">
                  {analytics.totalMiles.toFixed(2)}
                </Text>
                <Text className="text-af-silver text-xs">Miles</Text>
              </View>
              <View className="w-px bg-white/10" />
              <View className="items-center flex-1">
                {(() => {
                  const circleSize = 54;
                  const strokeWidth = 6;
                  const radius = (circleSize - strokeWidth) / 2;
                  const circumference = 2 * Math.PI * radius;
                  const progress = analytics.weeklyCompliancePercent / 100;
                  const dashOffset = circumference * (1 - progress);

                  return (
                    <View className="items-center -mt-2">
                      <View style={{ width: circleSize, height: circleSize }} className="items-center justify-center">
                        <Svg width={circleSize} height={circleSize} style={{ position: 'absolute' }}>
                          <Circle
                            cx={circleSize / 2}
                            cy={circleSize / 2}
                            r={radius}
                            stroke="rgba(255,255,255,0.12)"
                            strokeWidth={strokeWidth}
                            fill="none"
                          />
                          <Circle
                            cx={circleSize / 2}
                            cy={circleSize / 2}
                            r={radius}
                            stroke={analytics.weeklyCompliancePercent >= 50 ? '#22C55E' : '#4A90D9'}
                            strokeWidth={strokeWidth}
                            fill="none"
                            strokeDasharray={`${circumference} ${circumference}`}
                            strokeDashoffset={dashOffset}
                            strokeLinecap="round"
                            rotation={-90}
                            originX={circleSize / 2}
                            originY={circleSize / 2}
                          />
                        </Svg>
                        <Text className="text-white font-bold text-[11px]">
                          {analytics.weeklyCompliancePercent}%
                        </Text>
                      </View>
                      <Text className="text-af-silver text-xs mt-1 text-center">At 5/5</Text>
                    </View>
                  );
                })()}
              </View>
            </View>
            <View className="mt-3 pt-3 border-t border-white/10 flex-row items-center justify-between">
              <Text className="text-af-silver text-xs">Avg attendance per member this week</Text>
              <Text className="text-white font-semibold text-sm">
                {analytics.averageWeeklyAttendance}/{WEEKLY_ATTENDANCE_TARGET}
              </Text>
            </View>
          </Animated.View>

          {analytics.recentPFRARecords.length > 0 && (
            <Animated.View
              entering={FadeInDown.delay(262).springify()}
              className="mt-4 p-4 bg-white/5 rounded-2xl border border-white/10"
            >
              <View className="flex-row items-center mb-4">
                <TrendingUp size={20} color="#F59E0B" />
                <Text className="text-white font-semibold text-lg ml-2">Recent PFRA Entries</Text>
              </View>
              {analytics.recentPFRARecords.map((record) => (
                <View key={record.id} className="mb-3 rounded-xl border border-white/10 bg-black/10 p-3 last:mb-0">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-white font-semibold flex-1 pr-3">{record.memberName}</Text>
                    <Text className="text-af-gold font-bold">{record.score.toFixed(1)}</Text>
                  </View>
                  <View className="mt-2 flex-row items-center justify-between">
                    <Text className="text-af-silver text-xs">{record.date} • {(record.recordType ?? 'self').toUpperCase()}</Text>
                    <Text className="text-af-silver text-xs">Logged by {record.loggedByName}</Text>
                  </View>
                </View>
              ))}
            </Animated.View>
          )}

          <Animated.View entering={FadeInDown.delay(268).springify()}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setShowPFRADetailModal(true);
              }}
              className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4"
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-white font-semibold text-lg">PFRA Leadership Summary</Text>
                <Text className="text-af-accent text-xs font-semibold">Open</Text>
              </View>
              <Text className="mt-1 text-af-silver text-xs">Use these filters for PFRA analytics only.</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingTop: 12, paddingRight: 8 }}>
                {getPFRALeadershipFilters().map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedPFRARecordType(value);
                    }}
                    className={cn(
                      'mr-2 rounded-full border px-3 py-2',
                      selectedPFRARecordType === value ? 'border-af-accent bg-af-accent/20' : 'border-white/10 bg-white/5'
                    )}
                  >
                    <Text className={cn('text-xs', selectedPFRARecordType === value ? 'font-semibold text-white' : 'text-af-silver')}>
                      {formatPFRALabel(value)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View className="mt-4 flex-row justify-between">
                <View className="items-center flex-1">
                  <Text className="text-white font-bold text-xl">{analytics.pfraTotalCount}</Text>
                  <Text className="text-af-silver text-xs">Logged PFRAs</Text>
                </View>
                <View className="w-px bg-white/10" />
                <View className="items-center flex-1">
                  <Text className="text-white font-bold text-xl">{analytics.membersWithFA}</Text>
                  <Text className="text-af-silver text-xs">Members Logged</Text>
                </View>
                <View className="w-px bg-white/10" />
                <View className="items-center flex-1">
                  <Text className="text-white font-bold text-xl">
                    {analytics.latestSelectedBatch ? `${Math.round(analytics.latestSelectedBatch.completionRate * 100)}%` : '--'}
                  </Text>
                  <Text className="text-af-silver text-xs">Latest Completion</Text>
                </View>
              </View>
              <View className="mt-4 border-t border-white/10 pt-4">
                <View className="flex-row justify-between">
                  <View className="items-center flex-1">
                    <Text className="text-white font-semibold">{analytics.componentAverages.waist.toFixed(1)}</Text>
                    <Text className="text-af-silver text-xs">Waist Avg</Text>
                  </View>
                  <View className="items-center flex-1">
                    <Text className="text-white font-semibold">{analytics.componentAverages.strength.toFixed(1)}</Text>
                    <Text className="text-af-silver text-xs">Strength Avg</Text>
                  </View>
                  <View className="items-center flex-1">
                    <Text className="text-white font-semibold">{analytics.componentAverages.core.toFixed(1)}</Text>
                    <Text className="text-af-silver text-xs">Core Avg</Text>
                  </View>
                  <View className="items-center flex-1">
                    <Text className="text-white font-semibold">{analytics.componentAverages.cardio.toFixed(1)}</Text>
                    <Text className="text-af-silver text-xs">Cardio Avg</Text>
                  </View>
                </View>
              </View>
            </Pressable>
          </Animated.View>

          {analytics.recentPFRABatches.length > 0 ? (
            <Animated.View entering={FadeInDown.delay(272).springify()} className="mt-4 p-4 bg-white/5 rounded-2xl border border-white/10">
              <Text className="text-white font-semibold text-lg mb-3">Recent PFRA Batches</Text>
              {analytics.recentPFRABatches.map((batch) => (
                <Pressable
                  key={batch.id}
                  onPress={() => void handleOpenPFRABatchDetails(batch)}
                  className="mb-3 rounded-xl border border-white/10 bg-black/10 p-3 last:mb-0"
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-white font-semibold">{batch.assessmentDate} • {batch.recordType.toUpperCase()}</Text>
                    <Text className="text-af-accent text-sm">Details</Text>
                  </View>
                  <View className="mt-2 flex-row items-center justify-between">
                    <Text className="text-af-silver text-xs">{batch.selectedFlights.join(', ')}</Text>
                    <Text className="text-af-silver text-xs">{batch.completedCount}/{batch.expectedCount} completed</Text>
                  </View>
                </Pressable>
              ))}
            </Animated.View>
          ) : null}

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
                    <Text className="text-white font-semibold">{flight.totalMiles.toFixed(2)}</Text>
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
          </PageContainer>
        </ScrollView>

        <Modal visible={showPFRADetailModal} transparent animationType="slide" onRequestClose={() => setShowPFRADetailModal(false)}>
          <View className="flex-1 justify-end bg-black/80">
            <ThemeChrome theme={theme} variant="feature" style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%' }}>
            <View className="p-6 pb-10">
              <View className="mb-4 flex-row items-start justify-between">
                <View className="flex-1 pr-4">
                  <Text style={getThemeHeadingStyle(theme, 22)}>PFRA Leadership Summary</Text>
                  <Text style={[getThemeBodyStyle(theme, 14, theme.textSecondary), { marginTop: 4 }]}>Detailed PFRA trends, accountability, and exports.</Text>
                </View>
                <Pressable onPress={() => setShowPFRADetailModal(false)} className="h-8 w-8 items-center justify-center rounded-full" style={getThemeControlStyle(theme)}>
                  <X size={18} color={theme.textSecondary} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
                  {getPFRALeadershipFilters().map((value) => (
                    <Pressable
                      key={value}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setSelectedPFRARecordType(value);
                      }}
                      className='mr-2 rounded-full border px-3 py-2'
                      style={selectedPFRARecordType === value ? { borderColor: theme.accent, backgroundColor: theme.accentSoft } : getThemeControlStyle(theme)}
                    >
                      <Text style={[getThemeBodyStyle(theme, 12, selectedPFRARecordType === value ? theme.textPrimary : theme.textSecondary), { fontWeight: selectedPFRARecordType === value ? '600' : '400' }]}>
                        {formatPFRALabel(value)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <View className="mt-4 flex-row">
                  <Pressable
                    onPress={handleExportPFRAPDF}
                    disabled={isExporting}
                    className={cn('mr-2 flex-1 flex-row items-center justify-center rounded-xl border p-4', isExporting && 'opacity-50')}
                    style={{ borderColor: '#A855F788', backgroundColor: 'rgba(168,85,247,0.18)' }}
                  >
                    <FileText size={18} color="#A855F7" />
                    <Text className="ml-2 font-semibold text-purple-300">Save PFRA PDF</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleExportPFRAExcel}
                    disabled={isExporting}
                    className={cn('ml-2 flex-1 flex-row items-center justify-center rounded-xl border p-4', isExporting && 'opacity-50')}
                    style={{ borderColor: `${theme.accent}66`, backgroundColor: theme.accentSoft }}
                  >
                    <FileSpreadsheet size={18} color={theme.accent} />
                    <Text className="ml-2 font-semibold" style={{ color: theme.accent }}>Save PFRA Excel</Text>
                  </Pressable>
                </View>

                <ThemeChrome theme={theme}>
                <View className="mt-4 p-4">
                  <Text className="text-white font-semibold">Current PFRA Snapshot</Text>
                  <View className="mt-4 flex-row justify-between">
                    <View className="items-center flex-1">
                      <Text className="text-xl font-bold text-white">{analytics.pfraTotalCount}</Text>
                      <Text className="text-xs text-af-silver">Logged</Text>
                    </View>
                    <View className="items-center flex-1">
                      <Text className="text-xl font-bold text-white">{analytics.avgPFRAScore}</Text>
                      <Text className="text-xs text-af-silver">Avg Score</Text>
                    </View>
                    <View className="items-center flex-1">
                      <Text className="text-xl font-bold text-white">{Math.round(analytics.overallPassRate * 100)}%</Text>
                      <Text className="text-xs text-af-silver">Overall Pass</Text>
                    </View>
                  </View>
                </View>
                </ThemeChrome>

                <ThemeChrome theme={theme}>
                <View className="mt-4 p-4">
                  <Text className="text-white font-semibold mb-3">Trend Over Time</Text>
                  <View className="flex-row items-end justify-between h-36">
                    {analytics.pfraTimeline.map((entry) => {
                      const heightPercent = analytics.maxPFRAAverage > 0 ? (entry.average / analytics.maxPFRAAverage) * 100 : 0;
                      return (
                        <View key={entry.label} className="flex-1 items-center">
                          <Text className="mb-2 text-[11px] text-af-silver">{entry.average ? entry.average.toFixed(1) : '--'}</Text>
                          <View className="h-24 w-12 justify-end">
                            <View
                              className="w-12 rounded-t-xl border border-af-accent/30 bg-af-accent/80"
                              style={{ height: `${Math.max(heightPercent, entry.count > 0 ? 12 : 0)}%` }}
                            />
                          </View>
                          <Text className="mt-2 text-xs font-medium text-white">{entry.label}</Text>
                          <Text className="text-[11px] text-af-silver">{entry.count} entries</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
                </ThemeChrome>

                <ThemeChrome theme={theme}>
                <View className="mt-4 p-4">
                  <Text className="text-white font-semibold mb-3">Pass Rates by Component</Text>
                  {([
                    ['Waist', analytics.componentPassRates.waist],
                    ['Strength', analytics.componentPassRates.strength],
                    ['Core', analytics.componentPassRates.core],
                    ['Cardio', analytics.componentPassRates.cardio],
                  ] as const).map(([label, rate]) => (
                    <View key={label} className="mb-3 last:mb-0">
                      <View className="mb-1 flex-row items-center justify-between">
                        <Text className="text-sm text-white">{label}</Text>
                        <Text className="text-xs text-af-silver">{Math.round(rate * 100)}%</Text>
                      </View>
                      <View className="h-3 overflow-hidden rounded-full bg-white/10">
                        <View className="h-full rounded-full bg-af-accent" style={{ width: `${Math.round(rate * 100)}%` }} />
                      </View>
                    </View>
                  ))}
                </View>
                </ThemeChrome>

                <ThemeChrome theme={theme}>
                <View className="mt-4 p-4">
                  <Text className="text-white font-semibold mb-3">Recent PFRA Batches</Text>
                  {analytics.recentPFRABatches.length === 0 ? (
                    <Text className="text-sm text-af-silver">No PFRA batches found for this filter yet.</Text>
                  ) : (
                    analytics.recentPFRABatches.map((batch) => (
                      <Pressable
                        key={batch.id}
                        onPress={() => void handleOpenPFRABatchDetails(batch)}
                        className={cn('mb-3 rounded-xl border p-3 last:mb-0', selectedPFRABatch?.id === batch.id ? 'border-af-accent bg-af-accent/10' : 'border-white/10 bg-black/10')}
                      >
                        <View className="flex-row items-center justify-between">
                          <Text className="font-semibold text-white">{batch.assessmentDate} - {batch.recordType.toUpperCase()}</Text>
                          <Text className="text-xs text-af-accent">{batch.completedCount}/{batch.expectedCount}</Text>
                        </View>
                        <Text className="mt-2 text-xs text-af-silver">{batch.selectedFlights.join(', ')} • Saved by {batch.createdByName}</Text>
                      </Pressable>
                    ))
                  )}
                </View>
                </ThemeChrome>

                <ThemeChrome theme={theme} variant="feature">
                <View className="mt-4 p-4">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-white font-semibold">PFRA Batch Detail</Text>
                    {selectedPFRABatch ? (
                      <Pressable onPress={() => router.push(`/bulk-pfra-entry?batchId=${encodeURIComponent(selectedPFRABatch.id)}`)}>
                        <Text className="text-xs font-semibold text-af-accent">Edit Batch</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {!selectedPFRABatch ? (
                    <Text className="mt-3 text-sm text-af-silver">Select a recent PFRA batch to view accountability details.</Text>
                  ) : isLoadingBatchMembers ? (
                    <View className="mt-4 items-center py-6">
                      <ActivityIndicator color="#4A90D9" />
                    </View>
                  ) : (
                    <>
                      <Text className="mt-2 text-sm text-af-silver">
                        {selectedPFRABatch.assessmentDate} • {selectedPFRABatch.recordType.toUpperCase()} • {selectedPFRABatch.selectedFlights.join(', ')}
                      </Text>
                      <View className="mt-4 flex-row flex-wrap">
                        {([
                          ['Completed', selectedPFRABatch.counts.completed],
                          ['Pending', selectedPFRABatch.counts.pending],
                          ['Absent', selectedPFRABatch.counts.absent],
                          ['Excused', selectedPFRABatch.counts.excused],
                          ['Postponed', selectedPFRABatch.counts.postponed],
                        ] as const).map(([label, count]) => (
                          <View key={label} className="mb-2 mr-2 rounded-full border border-white/10 bg-white/5 px-3 py-2">
                            <Text className="text-xs text-white">{label}: <Text className="font-semibold">{count}</Text></Text>
                          </View>
                        ))}
                      </View>
                      <View className="mt-4">
                        {selectedPFRABatchMembers.map((member) => (
                          <View key={member.id} className="mb-2 rounded-xl border border-white/10 bg-black/10 p-3">
                            <View className="flex-row items-center justify-between">
                              <Text className="font-semibold text-white">{member.memberName}</Text>
                              <Text className="text-xs text-af-silver">{member.flight}</Text>
                            </View>
                            <View className="mt-2 flex-row items-center justify-between">
                              <Text className="text-xs text-af-silver">{member.accountabilityStatus.toUpperCase()}</Text>
                              <Text className="text-xs text-white">{member.overallScore !== null ? member.overallScore.toFixed(1) : '--'}</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    </>
                  )}
                </View>
                </ThemeChrome>
              </ScrollView>
            </View>
            </ThemeChrome>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}
