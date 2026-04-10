import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, LayoutChangeEvent, Modal, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Check, FileSpreadsheet, FileText, HelpCircle, Trash2, X } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { format, startOfWeek, addDays, subWeeks, addWeeks, isSameDay } from 'date-fns';
import { useMemberStore, useAuthStore, type Flight, type ScheduledPTSession, canEditAttendance, canManagePTPrograms, formatRankDisplay } from '@/lib/store';
import { cn } from '@/lib/cn';
import { useTabSwipe } from '@/contexts/TabSwipeContext';
import { deleteScheduledPTSession as deleteScheduledPTSessionFromSupabase, fetchAttendanceSessions, setAttendanceStatus } from '@/lib/supabaseData';
import ExcelJS from 'exceljs';
import { TutorialTarget } from '@/contexts/TutorialTourContext';

const FLIGHTS: Flight[] = ['Apex', 'Bomber', 'Cryptid', 'Doom', 'Ewok', 'Foxhound', 'ADF', 'DET'];
const WEEKLY_PROGRESS_TARGET = 5;
const NAME_COLUMN_WIDTH = 120;
const PROGRESS_COLUMN_WIDTH = 56;
const DAY_COLUMN_WIDTH = 60;
const HEADER_HEIGHT = 56;
const ROW_HEIGHT = 66;
const ATTENDANCE_FILTER_STORAGE_KEY = 'fitflight-attendance-filter';
const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
const buildLegacyRosterId = (member: { rank: string; firstName: string; lastName: string; flight: Flight }) =>
  `roster-${slugify(`${member.rank}-${member.lastName}-${member.firstName}-${member.flight}`)}`;
const isUpcomingScheduledSession = (date: string, time: string) => new Date(`${date}T${time}:00`).getTime() >= Date.now();
const scheduledSessionScopeLabel = (session: ScheduledPTSession) =>
  session.scope === 'personal' ? 'Personal PT' : session.scope === 'squadron' ? 'Squadron PT' : session.flights.join(', ');
const scheduledSessionKindLabel = (session: ScheduledPTSession) =>
  session.kind === 'pfra_mock'
    ? 'PFRA Mock'
    : session.kind === 'pfra_diagnostic'
      ? 'PFRA Diagnostic'
      : session.kind === 'pfra_official'
        ? 'PFRA Official'
        : 'Normal PT';

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

export default function AttendanceScreen() {
  const router = useRouter();
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedFlight, setSelectedFlight] = useState<Flight | 'all'>('all');
  const [currentScrollX, setCurrentScrollX] = useState(0);
  const [tableViewportWidth, setTableViewportWidth] = useState(0);
  const [flightViewportWidth, setFlightViewportWidth] = useState(0);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showScheduledSessionsModal, setShowScheduledSessionsModal] = useState(false);
  const [showDayScheduledSessionsModal, setShowDayScheduledSessionsModal] = useState(false);
  const [showAttendanceLegendModal, setShowAttendanceLegendModal] = useState(false);
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [deletingScheduledSessionId, setDeletingScheduledSessionId] = useState<string | null>(null);
  const [selectedScheduledDayKey, setSelectedScheduledDayKey] = useState<string | null>(null);
  const [expandedScheduledSessionIds, setExpandedScheduledSessionIds] = useState<string[]>([]);
  const { setSwipeEnabled } = useTabSwipe();
  const flightScrollRef = useRef<ScrollView | null>(null);
  const flightScrollXRef = useRef(0);
  const attendanceInteractionRef = useRef(false);
  const attendanceInteractionResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const weekTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const weekDragActivatedRef = useRef(false);

  const members = useMemberStore((state) => state.members);
  const ptSessions = useMemberStore((state) => state.ptSessions);
  const scheduledSessions = useMemberStore((state) => state.scheduledSessions);
  const syncPTSessions = useMemberStore((state) => state.syncPTSessions);
  const deleteScheduledSession = useMemberStore((state) => state.deleteScheduledSession);
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);

  const canEdit = user ? canEditAttendance(user.accountType) : false;
  const canManagePrograms = user ? canManagePTPrograms(user.accountType) : false;
  const userSquadron = user?.squadron ?? 'Hawks';

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(currentWeekStart, index)),
    [currentWeekStart]
  );

  const flightStripWidth = useMemo(() => {
    const allWidth = 68;
    const flightWidth = 94;
    return allWidth + FLIGHTS.length * flightWidth;
  }, []);

  const dayColumnsWidth = weekDays.length * DAY_COLUMN_WIDTH;
  const horizontalOverflow = Math.max(dayColumnsWidth - tableViewportWidth, 0);
  const flightHorizontalOverflow = Math.max(flightStripWidth - flightViewportWidth, 0);
  const edgeThreshold = 2;
  const showLeftIndicator = horizontalOverflow > 0 && currentScrollX > edgeThreshold;
  const showRightIndicator = horizontalOverflow > 0 && currentScrollX < horizontalOverflow - edgeThreshold;

  const flightMembers = useMemo(() => {
    const squadronMembers = members.filter((member) => member.squadron === userSquadron);
    const filteredMembers = selectedFlight === 'all'
      ? [...squadronMembers]
      : squadronMembers.filter((member) => member.flight === selectedFlight);

    return filteredMembers.sort((left, right) => {
      const lastNameCompare = left.lastName.localeCompare(right.lastName);
      if (lastNameCompare !== 0) {
        return lastNameCompare;
      }

      return left.firstName.localeCompare(right.firstName);
    });
  }, [members, selectedFlight, userSquadron]);

  const creatorNameById = useMemo(() => {
    const entries = members.map((member) => [
      member.id,
      `${formatRankDisplay(member.rank)} ${member.firstName} ${member.lastName}`,
    ] as const);
    return new Map(entries);
  }, [members]);

  const getAttendanceDisplayName = useCallback((memberId: string) => {
    const member = members.find((entry) => entry.id === memberId);
    if (!member) {
      return { rank: '', name: '' };
    }

    const firstInitial = member.firstName.trim().charAt(0);
    return {
      rank: formatRankDisplay(member.rank),
      name: `${member.lastName.toUpperCase()}, ${firstInitial.toUpperCase()}`,
    };
  }, [members]);

  const getSession = useCallback((date: Date, flight: Flight, squadron: typeof userSquadron = userSquadron) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return ptSessions.find((session) => session.date === dateStr && session.flight === flight && (session.squadron ?? 'Hawks') === squadron);
  }, [ptSessions, userSquadron]);

  const getAttendanceAliases = useCallback((memberId: string) => {
    const member = members.find((entry) => entry.id === memberId);
    if (!member) {
      return new Set([memberId]);
    }

    return new Set<string>([member.id, buildLegacyRosterId(member)]);
  }, [members]);

  const isAttending = useCallback((date: Date, memberId: string, flight: Flight, squadron: typeof userSquadron = userSquadron) => {
    const session = getSession(date, flight, squadron);
    if (!session) {
      return false;
    }

    const aliases = getAttendanceAliases(memberId);
    return session.attendees.some((attendeeId) => aliases.has(attendeeId));
  }, [getAttendanceAliases, getSession, userSquadron]);

  const getAttendanceSource = useCallback((date: Date, memberId: string, flight: Flight, squadron: typeof userSquadron = userSquadron) => {
    const session = getSession(date, flight, squadron);
    if (!session) {
      return null;
    }

    const aliases = getAttendanceAliases(memberId);
    for (const attendeeId of session.attendees) {
      if (aliases.has(attendeeId)) {
        return session.attendeeSources?.[attendeeId] ?? 'manual';
      }
    }

    return null;
  }, [getAttendanceAliases, getSession, userSquadron]);

  const getWeeklyAttendance = useCallback((memberId: string) => {
    const member = members.find((entry) => entry.id === memberId);
    if (!member) return 0;

    let count = 0;
    weekDays.forEach((day) => {
      if (isAttending(day, memberId, member.flight, member.squadron)) {
        count++;
      }
    });
    return count;
  }, [isAttending, members, weekDays]);

  const totalWeeklyCheckIns = useMemo(
    () => flightMembers.reduce((sum, member) => sum + getWeeklyAttendance(member.id), 0),
    [flightMembers, getWeeklyAttendance]
  );
  const averageWeeklyCheckIns = flightMembers.length > 0 ? totalWeeklyCheckIns / flightMembers.length : 0;
  const membersOnTarget = useMemo(
    () => flightMembers.filter((member) => getWeeklyAttendance(member.id) >= WEEKLY_PROGRESS_TARGET).length,
    [flightMembers, getWeeklyAttendance]
  );
  const canViewReport = !!user && canManagePTPrograms(user.accountType);
  const currentWeekLabel = `${format(currentWeekStart, 'MMM d')} - ${format(addDays(currentWeekStart, 6), 'MMM d, yyyy')}`;
  const attendanceReportRows = useMemo(
    () =>
      flightMembers.map((member) => {
        const dayStatuses = weekDays.map((day) => isAttending(day, member.id, member.flight, member.squadron));
        return {
          member,
          dayStatuses,
          weeklyAttendance: dayStatuses.filter(Boolean).length,
        };
      }),
    [flightMembers, isAttending, weekDays]
  );
  const attendanceSummary = useMemo(() => {
    const dailyCounts = weekDays.map((day) =>
      flightMembers.reduce(
        (count, member) => count + (isAttending(day, member.id, member.flight, member.squadron) ? 1 : 0),
        0
      )
    );

    return {
      scope: selectedFlight === 'all' ? `${userSquadron} Squadron` : `${selectedFlight} Flight`,
      totalMembers: flightMembers.length,
      totalCheckIns: totalWeeklyCheckIns,
      averageCheckIns: averageWeeklyCheckIns,
      membersOnTarget,
      dailyCounts,
    };
  }, [averageWeeklyCheckIns, flightMembers, isAttending, membersOnTarget, selectedFlight, totalWeeklyCheckIns, userSquadron, weekDays]);
  const scheduledSessionsThisWeek = useMemo(() => {
    const weekStartKey = format(currentWeekStart, 'yyyy-MM-dd');
    const weekEndKey = format(addDays(currentWeekStart, 6), 'yyyy-MM-dd');

    return scheduledSessions
      .filter((session) => {
        if (session.squadron !== userSquadron) {
          return false;
        }

        if (session.date < weekStartKey || session.date > weekEndKey) {
          return false;
        }

        if (!isUpcomingScheduledSession(session.date, session.time)) {
          return false;
        }

        if (session.scope === 'personal') {
          return session.createdBy === user?.id;
        }

        if (selectedFlight === 'all' || session.scope === 'squadron') {
          return true;
        }

        return session.flights.includes(selectedFlight);
      })
      .sort((left, right) => `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`));
  }, [currentWeekStart, scheduledSessions, selectedFlight, user?.id, userSquadron]);
  const weekScheduledIndicators = useMemo(
    () =>
      weekDays.map((day) => {
        const key = format(day, 'yyyy-MM-dd');
        return {
          hasGroup: scheduledSessionsThisWeek.some((session) => session.date === key && session.scope !== 'personal'),
          hasPersonal: scheduledSessionsThisWeek.some((session) => session.date === key && session.scope === 'personal'),
        };
      }),
    [scheduledSessionsThisWeek, weekDays]
  );
  const selectedDayScheduledSessions = useMemo(() => {
    if (!selectedScheduledDayKey) {
      return [];
    }

    return scheduledSessionsThisWeek.filter((session) => session.date === selectedScheduledDayKey);
  }, [scheduledSessionsThisWeek, selectedScheduledDayKey]);

  const selectedScheduledDayLabel = useMemo(() => {
    if (!selectedScheduledDayKey) {
      return '';
    }

    return format(new Date(`${selectedScheduledDayKey}T00:00:00`), 'EEEE, MMM d, yyyy');
  }, [selectedScheduledDayKey]);

  const markAttendanceInteraction = useCallback((active: boolean) => {
    if (attendanceInteractionResetRef.current) {
      clearTimeout(attendanceInteractionResetRef.current);
      attendanceInteractionResetRef.current = null;
    }

    if (active) {
      attendanceInteractionRef.current = true;
      return;
    }

    attendanceInteractionResetRef.current = setTimeout(() => {
      attendanceInteractionRef.current = false;
      attendanceInteractionResetRef.current = null;
    }, 40);
  }, []);

  const loadAttendanceFromBackend = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const sessions = await fetchAttendanceSessions(accessToken);
    syncPTSessions(sessions);
  }, [accessToken, syncPTSessions]);

  const handleToggleAttendance = async (date: Date, memberId: string, flight: Flight, squadron: typeof userSquadron = userSquadron) => {
    if (!canEdit || attendanceInteractionRef.current || !accessToken || !user) {
      return;
    }

    const attendanceSource = getAttendanceSource(date, memberId, flight, squadron);
    const currentlyAttending = isAttending(date, memberId, flight, squadron);
    if (currentlyAttending && attendanceSource === 'workout') {
      Alert.alert(
        'Workout-backed attendance',
        'This attendance came from an approved or imported workout and cannot be removed here. Remove or edit the workout instead.'
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const updatedSessions = await setAttendanceStatus({
          date: format(date, 'yyyy-MM-dd'),
          flight,
          squadron,
          memberId,
          createdBy: user.id,
          isAttending: !currentlyAttending,
          source: 'manual',
          accessToken,
        });

      syncPTSessions(updatedSessions);
    } catch (error) {
      console.error('Unable to update attendance in Supabase.', error);
    }
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    Haptics.selectionAsync();
    setCurrentWeekStart((previous) => (direction === 'prev' ? subWeeks(previous, 1) : addWeeks(previous, 1)));
  };

  const handleDeleteScheduledSession = (sessionId: string) => {
    const run = async () => {
      if (!accessToken || !canManagePrograms) {
        return;
      }

      setDeletingScheduledSessionId(sessionId);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      try {
        await deleteScheduledPTSessionFromSupabase(sessionId, accessToken);
        deleteScheduledSession(sessionId);
      } finally {
        setDeletingScheduledSessionId(null);
      }
    };

    void run().catch((error) => {
      console.error('Unable to delete scheduled PT session.', error);
      setDeletingScheduledSessionId(null);
    });
  };

  const handleOpenScheduledSessionsForDay = useCallback((day: Date) => {
    const dayKey = format(day, 'yyyy-MM-dd');
    const hasSessions = scheduledSessionsThisWeek.some((session) => session.date === dayKey);
    if (!hasSessions) {
      return;
    }

    Haptics.selectionAsync();
    setSelectedScheduledDayKey(dayKey);
    setExpandedScheduledSessionIds([]);
    setShowDayScheduledSessionsModal(true);
  }, [scheduledSessionsThisWeek]);

  const toggleExpandedScheduledSession = useCallback((sessionId: string) => {
    setExpandedScheduledSessionIds((current) =>
      current.includes(sessionId)
        ? current.filter((id) => id !== sessionId)
        : [...current, sessionId]
    );
  }, []);

  useEffect(() => {
    return () => {
      if (attendanceInteractionResetRef.current) {
        clearTimeout(attendanceInteractionResetRef.current);
      }
      setSwipeEnabled(true);
    };
  }, [setSwipeEnabled]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    void loadAttendanceFromBackend();
    const interval = setInterval(() => {
      void loadAttendanceFromBackend();
    }, 15000);

    return () => clearInterval(interval);
  }, [accessToken, loadAttendanceFromBackend]);

  useEffect(() => {
    let isMounted = true;

    const loadSavedFilter = async () => {
      const storedFilter = await AsyncStorage.getItem(ATTENDANCE_FILTER_STORAGE_KEY);
      if (!isMounted || !storedFilter) {
        return;
      }

      if (storedFilter === 'all' || FLIGHTS.includes(storedFilter as Flight)) {
        setSelectedFlight(storedFilter as Flight | 'all');
      }
    };

    void loadSavedFilter();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    void AsyncStorage.setItem(ATTENDANCE_FILTER_STORAGE_KEY, selectedFlight);
  }, [selectedFlight]);

  const handleTableLayout = useCallback((event: LayoutChangeEvent) => {
    const width = Math.max(event.nativeEvent.layout.width - NAME_COLUMN_WIDTH - PROGRESS_COLUMN_WIDTH, 0);
    setTableViewportWidth(width);
  }, []);

  const handleFlightStripLayout = useCallback((event: LayoutChangeEvent) => {
    setFlightViewportWidth(event.nativeEvent.layout.width);
  }, []);

  const handleAttendanceScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;
    setCurrentScrollX(x);
  }, []);

  const buildAttendancePdfHtml = () => {
    const generatedAt = new Date().toLocaleString();
    const headerCells = weekDays
      .map((day) => `<th>${format(day, 'EEE')}<br />${format(day, 'd')}</th>`)
      .join('');
    const bodyRows = attendanceReportRows
      .map(({ member, dayStatuses, weeklyAttendance }) => `
        <tr>
          <td>${formatRankDisplay(member.rank)}</td>
          <td>${member.lastName.toUpperCase()}, ${member.firstName}</td>
          <td>${member.flight}</td>
          ${dayStatuses.map((status) => `<td>${status ? 'Attended' : '-'}</td>`).join('')}
          <td>${weeklyAttendance}/${WEEKLY_PROGRESS_TARGET}</td>
        </tr>
      `)
      .join('');
    const dailyTotals = attendanceSummary.dailyCounts
      .map((count) => `<td>${count}</td>`)
      .join('');

    return `
      <html>
        <head>
          <style>
            @page { size: letter landscape; margin: 0.5in; }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body { font-family: Arial, sans-serif; background: #0A1628; color: #fff; padding: 24px; }
            h1, h2 { margin: 0 0 12px; }
            .subtitle { color: #c0c0c0; margin-bottom: 24px; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
            .card { background: #12243f; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px; }
            .label { color: #c0c0c0; font-size: 12px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.08em; }
            .value { font-size: 24px; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
            th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid rgba(255,255,255,0.08); }
            th { color: #9fb3d1; font-size: 11px; text-transform: uppercase; }
            .shell { background: linear-gradient(135deg, #0A1628 0%, #001F5C 50%, #0A1628 100%); border-radius: 24px; padding: 24px; }
            .totals td { font-weight: bold; color: #F6C453; }
          </style>
        </head>
        <body>
          <div class="shell">
            <h1>Attendance Report</h1>
            <div class="subtitle">Generated ${generatedAt}${user ? ` by ${user.firstName} ${user.lastName}` : ''} for ${attendanceSummary.scope} · ${currentWeekLabel}</div>
            <div class="grid">
              <div class="card"><div class="label">Scope</div><div class="value">${attendanceSummary.scope}</div></div>
              <div class="card"><div class="label">Members</div><div class="value">${attendanceSummary.totalMembers}</div></div>
              <div class="card"><div class="label">Total Check-Ins</div><div class="value">${attendanceSummary.totalCheckIns}</div></div>
              <div class="card"><div class="label">At 5/5</div><div class="value">${attendanceSummary.membersOnTarget}</div></div>
            </div>
            <h2>Weekly Attendance</h2>
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Member</th>
                  <th>Flight</th>
                  ${headerCells}
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                ${bodyRows}
                <tr class="totals">
                  <td colspan="3">Daily Totals</td>
                  ${dailyTotals}
                  <td>${attendanceSummary.totalCheckIns}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </body>
      </html>
    `;
  };

  const buildAttendanceWorkbook = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FitFlight';
    workbook.created = new Date();

    const overviewSheet = workbook.addWorksheet('Overview');
    overviewSheet.columns = [
      { header: 'Metric', key: 'metric', width: 28 },
      { header: 'Value', key: 'value', width: 28 },
    ];
    overviewSheet.addRows([
      { metric: 'Report Type', value: 'Attendance Report' },
      { metric: 'Scope', value: attendanceSummary.scope },
      { metric: 'Week', value: currentWeekLabel },
      { metric: 'Members', value: attendanceSummary.totalMembers },
      { metric: 'Total Check-Ins', value: attendanceSummary.totalCheckIns },
      { metric: 'Average Check-Ins', value: Number(attendanceSummary.averageCheckIns.toFixed(2)) },
      { metric: 'Members at 5/5', value: attendanceSummary.membersOnTarget },
    ]);

    const attendanceSheet = workbook.addWorksheet('Attendance');
    const dayColumns = weekDays.map((day, index) => ({
      header: `${format(day, 'EEE')} ${format(day, 'd')}`,
      key: `day${index + 1}`,
      width: 14,
    }));
    attendanceSheet.columns = [
      { header: 'Rank', key: 'rank', width: 12 },
      { header: 'First Name', key: 'firstName', width: 18 },
      { header: 'Last Name', key: 'lastName', width: 22 },
      { header: 'Flight', key: 'flight', width: 12 },
      ...dayColumns,
      { header: 'Weekly Attendance', key: 'weeklyAttendance', width: 18 },
    ];

    attendanceReportRows.forEach(({ member, dayStatuses, weeklyAttendance }) => {
      const row: Record<string, string | number> = {
        rank: formatRankDisplay(member.rank),
        firstName: member.firstName,
        lastName: member.lastName,
        flight: member.flight,
        weeklyAttendance,
      };
      dayStatuses.forEach((status, index) => {
        row[`day${index + 1}`] = status ? 'Attended' : '';
      });
      attendanceSheet.addRow(row);
    });

    const totalsRow: Record<string, string | number> = {
      rank: '',
      firstName: '',
      lastName: 'Daily Totals',
      flight: '',
      weeklyAttendance: attendanceSummary.totalCheckIns,
    };
    attendanceSummary.dailyCounts.forEach((count, index) => {
      totalsRow[`day${index + 1}`] = count;
    });
    attendanceSheet.addRow(totalsRow);

    [overviewSheet, attendanceSheet].forEach((sheet) => {
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    });

    return workbook.xlsx.writeBuffer();
  };

  const handleExportAttendanceExcel = async () => {
    try {
      setIsExportingReport(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const buffer = await buildAttendanceWorkbook();
      const filename = `attendance_report_${format(currentWeekStart, 'yyyy-MM-dd')}.xlsx`;

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
            dialogTitle: 'Export Attendance Excel',
          });
        }
      }
      setShowReportModal(false);
    } catch (error) {
      console.error('Attendance export error:', error);
    } finally {
      setIsExportingReport(false);
    }
  };

  const handleExportAttendancePdf = async () => {
    try {
      setIsExportingReport(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const html = buildAttendancePdfHtml();
      const filename = `attendance_report_${format(currentWeekStart, 'yyyy-MM-dd')}.pdf`;

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
            dialogTitle: 'Export Attendance PDF',
          });
        }
      }
      setShowReportModal(false);
    } catch (error) {
      console.error('Attendance export error:', error);
    } finally {
      setIsExportingReport(false);
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
          <Animated.View entering={FadeInDown.delay(100).springify()} className="px-6 pt-4 pb-1 flex-row items-start justify-between">
            <View className="flex-1 pr-4">
              <View className="flex-row items-center">
                <Text className="text-white text-2xl font-bold">PT Attendance</Text>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    setShowAttendanceLegendModal(true);
                  }}
                  className="ml-2 rounded-full border border-white/15 bg-white/8 p-1.5"
                >
                  <HelpCircle size={16} color="#C0C0C0" />
                </Pressable>
              </View>
              <Text className="text-af-silver text-sm mt-1">Track squadron fitness participation</Text>
            </View>
          {canViewReport ? (
            <TutorialTarget id="attendance-report">
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowReportModal(true);
                }}
                className="rounded-xl border border-white/15 bg-white/8 px-3 py-2"
              >
                <Text className="text-white text-xs font-semibold text-center">Export Report</Text>
              </Pressable>
            </TutorialTarget>
          ) : null}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).springify()} className="flex-row items-center justify-between px-6 py-2">
          <Pressable onPress={() => navigateWeek('prev')} className="w-10 h-10 bg-white/10 rounded-full items-center justify-center">
            <ChevronLeft size={24} color="#C0C0C0" />
          </Pressable>

          <View className="items-center">
            <Text className="text-white font-semibold text-lg">
              {format(currentWeekStart, 'MMM d')} - {format(addDays(currentWeekStart, 6), 'MMM d, yyyy')}
            </Text>
            <Text className="text-af-silver text-xs mt-1">
              {isSameDay(currentWeekStart, startOfWeek(new Date(), { weekStartsOn: 1 })) ? 'Current Week' : ''}
            </Text>
          </View>

          <Pressable onPress={() => navigateWeek('next')} className="w-10 h-10 bg-white/10 rounded-full items-center justify-center">
            <ChevronRight size={24} color="#C0C0C0" />
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).springify()} className="px-6 mb-4">
          <View className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <View onLayout={handleFlightStripLayout}>
              <ScrollView
                ref={flightScrollRef}
                horizontal
                bounces={false}
                scrollEnabled={flightHorizontalOverflow > 0}
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={(event) => {
                  const x = event.nativeEvent.contentOffset.x;
                  flightScrollXRef.current = x;
                }}
                onTouchStart={() => setSwipeEnabled(false)}
                onTouchEnd={() => setSwipeEnabled(true)}
                onTouchCancel={() => setSwipeEnabled(true)}
                onScrollBeginDrag={() => setSwipeEnabled(false)}
                onScrollEndDrag={() => setSwipeEnabled(true)}
                onMomentumScrollEnd={() => setSwipeEnabled(true)}
                style={{ flexGrow: 0 }}
              >
                <View className="flex-row">
                  <Pressable
                    onPress={() => {
                      setSelectedFlight('all');
                      Haptics.selectionAsync();
                    }}
                    className={cn(
                      'px-4 py-2 rounded-full mr-2 border',
                      selectedFlight === 'all' ? 'bg-af-accent border-af-accent' : 'bg-white/5 border-white/10'
                    )}
                  >
                    <Text className={cn('font-medium', selectedFlight === 'all' ? 'text-white' : 'text-white/60')}>All</Text>
                  </Pressable>

                  {FLIGHTS.map((flight) => (
                    <Pressable
                      key={flight}
                      onPress={() => {
                        setSelectedFlight(flight);
                        Haptics.selectionAsync();
                      }}
                      className={cn(
                        'px-4 py-2 rounded-full mr-2 border',
                        selectedFlight === flight ? 'bg-af-accent border-af-accent' : 'bg-white/5 border-white/10'
                      )}
                    >
                      <Text className={cn('font-medium', selectedFlight === flight ? 'text-white' : 'text-white/60')}>{flight}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        </Animated.View>

        <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.delay(110).springify()} className="mb-3">
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setShowScheduledSessionsModal(true);
              }}
              className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
            >
              <LinearGradient
                colors={['rgba(34,197,94,0.14)', 'rgba(74,144,217,0.07)', 'rgba(255,255,255,0.02)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ padding: 12 }}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center flex-1 pr-3">
                    <View className="w-9 h-9 rounded-xl bg-white/10 items-center justify-center mr-3">
                      <CalendarDays size={18} color="#22C55E" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-white font-semibold text-base">Scheduled PT This Week</Text>
                      <Text className="text-af-silver text-xs mt-1">
                        {selectedFlight === 'all' ? `${userSquadron} squadron view` : `${selectedFlight} flight view`}
                      </Text>
                    </View>
                  </View>
                  <View className="rounded-xl border border-white/10 bg-black/15 px-3 py-1.5 items-center min-w-[70px]">
                    <Text className="text-af-silver text-[10px] uppercase tracking-[0.4px]">Sessions</Text>
                    <Text className="text-white text-lg font-bold mt-0.5">{scheduledSessionsThisWeek.length}</Text>
                  </View>
                </View>

                {scheduledSessionsThisWeek.length === 0 ? (
                  <Text className="text-af-silver text-xs mt-2">No scheduled PT sessions for this week.</Text>
                ) : (
                  <View className="mt-2" style={{ gap: 6 }}>
                    {scheduledSessionsThisWeek.slice(0, 2).map((session) => (
                      <View key={session.id} className="rounded-xl border border-white/10 bg-black/10 px-3 py-2.5">
                        <View className="flex-row items-center justify-between">
                          <Text className="text-white font-semibold text-sm">
                            {format(new Date(`${session.date}T00:00:00`), 'EEE, MMM d')} at {session.time}
                          </Text>
                          <Text className={cn('text-[11px]', session.scope === 'personal' ? 'text-af-success' : 'text-af-silver')}>
                            {scheduledSessionScopeLabel(session)}
                          </Text>
                        </View>
                        <Text className="text-af-silver text-[11px] mt-1">{scheduledSessionKindLabel(session)}</Text>
                      </View>
                    ))}
                    {scheduledSessionsThisWeek.length > 2 ? (
                      <Text className="text-af-silver text-[11px]">
                        Tap to view {scheduledSessionsThisWeek.length - 2} more scheduled session{scheduledSessionsThisWeek.length - 2 === 1 ? '' : 's'}.
                      </Text>
                    ) : (
                      <Text className="text-af-silver text-[11px]">Tap to view session details.</Text>
                    )}
                  </View>
                )}
              </LinearGradient>
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(125).springify()} className="mb-4">
            <View className="rounded-2xl border border-white/10 bg-white/6 overflow-hidden">
              <LinearGradient
                colors={['rgba(74,144,217,0.16)', 'rgba(20,184,166,0.07)', 'rgba(255,255,255,0.02)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ padding: 12 }}
              >
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-white font-semibold text-base">
                      {selectedFlight === 'all' ? `${userSquadron} Attendance` : `${selectedFlight} Flight`}
                    </Text>
                    <Text className="text-af-silver text-xs mt-1">
                      Tap a member for profile. Tap attendance markers to update.
                    </Text>
                  </View>
                  <View className="rounded-xl border border-white/10 bg-black/15 px-3 py-1.5 items-center min-w-[70px]">
                    <Text className="text-af-silver text-[10px] uppercase tracking-[0.4px]">At 5/5</Text>
                    <Text className="text-white text-lg font-bold mt-0.5">{membersOnTarget}</Text>
                  </View>
                </View>

                <View className="mt-2 flex-row" style={{ gap: 8 }}>
                  <View className="flex-1 rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                    <Text className="text-af-silver text-[10px] uppercase tracking-[0.4px]">Members</Text>
                    <Text className="text-white text-lg font-bold mt-0.5">{flightMembers.length}</Text>
                  </View>
                  <View className="flex-1 rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                    <Text className="text-af-silver text-[10px] uppercase tracking-[0.4px]">Week</Text>
                    <Text className="text-white text-lg font-bold mt-0.5">{totalWeeklyCheckIns}</Text>
                  </View>
                  <View className="flex-1 rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                    <Text className="text-af-silver text-[10px] uppercase tracking-[0.4px]">Avg</Text>
                    <Text className="text-white text-lg font-bold mt-0.5">{averageWeeklyCheckIns.toFixed(1)}</Text>
                  </View>
                </View>
              </LinearGradient>
            </View>
          </Animated.View>

          <TutorialTarget id="attendance-grid">
            <View onLayout={handleTableLayout}>
              <View className="flex-row rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
              <View style={{ width: NAME_COLUMN_WIDTH }} className="border-r border-white/10">
                <View className="flex-row items-center px-3" style={{ height: HEADER_HEIGHT }}>
                  <View style={{ width: NAME_COLUMN_WIDTH - 24 }}>
                    <Text className="text-af-silver text-xs uppercase tracking-[0.4px]">Member</Text>
                  </View>
                </View>

                {flightMembers.map((member, index) => {
                  const weeklyAttendance = getWeeklyAttendance(member.id);
                  const displayName = getAttendanceDisplayName(member.id);

                  return (
                    <Animated.View
                      key={`fixed-${member.id}`}
                      entering={FadeInUp.delay(250 + index * 50).springify()}
                      className="flex-row items-center px-3 border-t border-white/5"
                      style={{ height: ROW_HEIGHT }}
                    >
                      <Pressable
                        onPress={() => {
                          Haptics.selectionAsync();
                          router.push({ pathname: '/member-profile', params: { id: member.id } });
                        }}
                        style={{ width: NAME_COLUMN_WIDTH, paddingRight: 8 }}
                      >
                        <Text className="text-af-silver text-[11px]" numberOfLines={1}>{displayName.rank}</Text>
                        <Text className="text-white font-medium mt-0.5" numberOfLines={1}>{displayName.name}</Text>
                          <Text className="text-af-silver text-xs mt-1">{weeklyAttendance}/{WEEKLY_PROGRESS_TARGET} sessions</Text>
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </View>

              <View className="flex-1 relative">
                <ScrollView
                  horizontal
                  bounces={false}
                  scrollEnabled={horizontalOverflow > 0}
                  showsHorizontalScrollIndicator={false}
                  scrollEventThrottle={16}
                  onScroll={handleAttendanceScroll}
                  onTouchStart={(event) => {
                    weekTouchStartRef.current = {
                      x: event.nativeEvent.pageX,
                      y: event.nativeEvent.pageY,
                    };
                    weekDragActivatedRef.current = false;
                    setSwipeEnabled(false);
                  }}
                  onTouchMove={(event) => {
                    const start = weekTouchStartRef.current;
                    if (!start || weekDragActivatedRef.current) {
                      return;
                    }

                    const dx = Math.abs(event.nativeEvent.pageX - start.x);
                    const dy = Math.abs(event.nativeEvent.pageY - start.y);
                    if (dx > 6 || dy > 6) {
                      weekDragActivatedRef.current = true;
                      markAttendanceInteraction(true);
                    }
                  }}
                  onTouchEnd={() => {
                    weekTouchStartRef.current = null;
                    setSwipeEnabled(true);
                    if (weekDragActivatedRef.current) {
                      weekDragActivatedRef.current = false;
                      markAttendanceInteraction(false);
                    }
                  }}
                  onTouchCancel={() => {
                    weekTouchStartRef.current = null;
                    setSwipeEnabled(true);
                    if (weekDragActivatedRef.current) {
                      weekDragActivatedRef.current = false;
                      markAttendanceInteraction(false);
                    }
                  }}
                  onScrollBeginDrag={() => {
                    markAttendanceInteraction(true);
                    setSwipeEnabled(false);
                  }}
                  onScrollEndDrag={() => {
                    markAttendanceInteraction(false);
                    setSwipeEnabled(true);
                    weekDragActivatedRef.current = false;
                  }}
                  onMomentumScrollEnd={() => {
                    markAttendanceInteraction(false);
                    setSwipeEnabled(true);
                    weekDragActivatedRef.current = false;
                  }}
                >
                  <View style={{ width: dayColumnsWidth }}>
                    <View className="flex-row items-center" style={{ height: HEADER_HEIGHT }}>
                        {weekDays.map((day, index) => (
                          <Pressable
                            key={`header-${day.toISOString()}`}
                            style={{ width: DAY_COLUMN_WIDTH }}
                            className="items-center justify-center"
                            disabled={!weekScheduledIndicators[index].hasGroup && !weekScheduledIndicators[index].hasPersonal}
                            onPress={() => handleOpenScheduledSessionsForDay(day)}
                          >
                            <Text className="text-af-silver text-xs uppercase tracking-[0.4px]">{format(day, 'EEE')}</Text>
                            <View className="relative items-center justify-center mt-0.5" style={{ minWidth: 22 }}>
                              <Text className="text-white font-bold">{format(day, 'd')}</Text>
                              {(weekScheduledIndicators[index].hasGroup || weekScheduledIndicators[index].hasPersonal) ? (
                                <View className="absolute" style={{ right: -8, top: -1, gap: 3 }}>
                                  {weekScheduledIndicators[index].hasGroup ? (
                                    <View
                                      className="rounded-full"
                                      style={{ width: 6, height: 6, backgroundColor: '#FACC15' }}
                                    />
                                  ) : null}
                                  {weekScheduledIndicators[index].hasPersonal ? (
                                    <View
                                      className="rounded-full"
                                      style={{ width: 6, height: 6, backgroundColor: '#22C55E' }}
                                    />
                                  ) : null}
                                </View>
                              ) : null}
                            </View>
                          </Pressable>
                        ))}
                    </View>

                    {flightMembers.map((member, index) => (
                      <Animated.View
                        key={`days-${member.id}`}
                        entering={FadeInUp.delay(250 + index * 50).springify()}
                        className="flex-row items-center border-t border-white/5"
                        style={{ height: ROW_HEIGHT }}
                      >
                          {weekDays.map((day) => {
                            const attending = isAttending(day, member.id, member.flight, member.squadron);
                            const attendanceSource = getAttendanceSource(day, member.id, member.flight, member.squadron);
                            const isWorkoutDerivedAttendance = attendanceSource === 'workout';
                            return (
                              <Pressable
                              key={`${member.id}-${day.toISOString()}`}
                              onPress={() => handleToggleAttendance(day, member.id, member.flight, member.squadron)}
                              disabled={!canEdit}
                              style={{ width: DAY_COLUMN_WIDTH }}
                              className="items-center"
                            >
                                <View
                                  className={cn(
                                    'w-10 h-10 rounded-full items-center justify-center border shadow-sm',
                                    attending
                                      ? isWorkoutDerivedAttendance
                                        ? 'bg-af-accent/20 border-af-accent'
                                        : 'bg-af-success/20 border-af-success'
                                      : 'bg-black/10 border-white/10'
                                  )}
                                >
                                  {attending ? (
                                    <Check size={20} color={isWorkoutDerivedAttendance ? '#4A90D9' : '#22C55E'} />
                                  ) : (
                                    <X size={20} color="#ffffff30" />
                                  )}
                                </View>
                              </Pressable>
                            );
                        })}
                      </Animated.View>
                    ))}
                  </View>
                </ScrollView>

                {showLeftIndicator && (
                  <View pointerEvents="none" className="absolute left-0 top-0 bottom-0 w-8 justify-center items-start">
                    <LinearGradient
                      colors={['rgba(10,22,40,0.95)', 'rgba(10,22,40,0)']}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
                    />
                    <ChevronLeft size={16} color="#C0C0C0" />
                  </View>
                )}

                {showRightIndicator && (
                  <View pointerEvents="none" className="absolute right-0 top-0 bottom-0 w-8 justify-center items-end">
                    <LinearGradient
                      colors={['rgba(10,22,40,0)', 'rgba(10,22,40,0.95)']}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
                    />
                    <ChevronRight size={16} color="#C0C0C0" />
                  </View>
                )}
              </View>

              <View style={{ width: PROGRESS_COLUMN_WIDTH }} className="border-l border-white/10">
                <View className="items-center justify-center px-1.5" style={{ height: HEADER_HEIGHT }}>
                  <Text className="text-af-silver text-[10px] uppercase tracking-[0.25px] text-center">Progress</Text>
                </View>

                {flightMembers.map((member, index) => {
                  const weeklyAttendance = getWeeklyAttendance(member.id);
                  const progressPercent = Math.min((weeklyAttendance / WEEKLY_PROGRESS_TARGET) * 100, 100);

                  return (
                    <Animated.View
                      key={`progress-${member.id}`}
                      entering={FadeInUp.delay(250 + index * 50).springify()}
                      className="items-center justify-center border-t border-white/5"
                      style={{ height: ROW_HEIGHT }}
                    >
                      <View className="w-10 h-10 items-center justify-center">
                        <View className="w-8 h-8 rounded-full border-2 border-white/20 items-center justify-center overflow-hidden bg-black/10">
                          <View
                            className={cn(
                              'absolute bottom-0 left-0 right-0',
                              progressPercent >= 100 ? 'bg-af-success' : 'bg-af-accent'
                            )}
                            style={{ height: `${progressPercent}%` }}
                          />
                          <Text className="text-white text-xs font-bold z-10">{weeklyAttendance}</Text>
                        </View>
                      </View>
                    </Animated.View>
                  );
                })}
              </View>
            </View>
            </View>
          </TutorialTarget>

          {flightMembers.length === 0 ? (
            <View className="items-center py-12">
              <Text className="text-white/40 text-base">No members in this flight</Text>
            </View>
          ) : null}
        </ScrollView>

        {!canEdit && (
          <View className="px-6 pb-4">
            <View className="bg-af-warning/10 border border-af-warning/30 rounded-xl p-4">
              <Text className="text-af-warning text-sm text-center">
                Only PFLs, UFPM, and Owner can modify attendance records
              </Text>
            </View>
          </View>
        )}

        <Modal visible={showReportModal} transparent animationType="fade" onRequestClose={() => setShowReportModal(false)}>
          <View className="flex-1 bg-black/80 items-center justify-center p-6">
            <View className="w-full max-w-sm rounded-3xl border border-white/20 bg-af-navy p-6">
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-1 pr-3">
                  <Text className="text-white text-xl font-bold">Attendance Report</Text>
                  <Text className="text-af-silver text-sm mt-1">{attendanceSummary.scope} · {currentWeekLabel}</Text>
                </View>
                <Pressable
                  onPress={() => setShowReportModal(false)}
                  className="w-8 h-8 rounded-full bg-white/10 items-center justify-center"
                >
                  <X size={18} color="#C0C0C0" />
                </Pressable>
              </View>

              <View className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-4">
                <Text className="text-white font-semibold">Current view summary</Text>
                <Text className="text-af-silver text-sm mt-2">Members: {attendanceSummary.totalMembers}</Text>
                <Text className="text-af-silver text-sm mt-1">Total check-ins: {attendanceSummary.totalCheckIns}</Text>
                <Text className="text-af-silver text-sm mt-1">At 5/5: {attendanceSummary.membersOnTarget}</Text>
              </View>

              <Pressable
                onPress={handleExportAttendancePdf}
                disabled={isExportingReport}
                className={cn(
                  'flex-row items-center rounded-2xl border border-white/15 bg-white/8 p-4',
                  isExportingReport && 'opacity-50'
                )}
              >
                <FileText size={20} color="#C084FC" />
                <Text className="ml-3 text-white font-semibold">Export PDF</Text>
              </Pressable>

              <Pressable
                onPress={handleExportAttendanceExcel}
                disabled={isExportingReport}
                className={cn(
                  'mt-3 flex-row items-center rounded-2xl border border-white/15 bg-white/8 p-4',
                  isExportingReport && 'opacity-50'
                )}
              >
                <FileSpreadsheet size={20} color="#4A90D9" />
                <Text className="ml-3 text-white font-semibold">Export Excel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal visible={showScheduledSessionsModal} transparent animationType="fade" onRequestClose={() => setShowScheduledSessionsModal(false)}>
          <View className="flex-1 bg-black/80 items-center justify-center p-6">
            <View className="w-full max-w-lg rounded-3xl border border-white/20 bg-af-navy p-6 max-h-[80%]">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-1 pr-3">
                <Text className="text-white text-xl font-bold">Scheduled PT Sessions</Text>
                <Text className="text-af-silver text-sm mt-1">{attendanceSummary.scope} · {currentWeekLabel}</Text>
              </View>
                <Pressable
                  onPress={() => setShowScheduledSessionsModal(false)}
                  className="w-8 h-8 rounded-full bg-white/10 items-center justify-center"
                >
                  <X size={18} color="#C0C0C0" />
                </Pressable>
              </View>

              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowScheduledSessionsModal(false);
                  router.push('/schedule-session');
                }}
                className="mb-4 rounded-2xl border border-af-accent/40 bg-af-accent/15 px-4 py-3"
              >
                <Text className="text-white font-semibold text-center">{canManagePrograms ? 'Schedule PT Session' : 'Schedule Personal PT'}</Text>
              </Pressable>

              <ScrollView showsVerticalScrollIndicator={false}>
                {scheduledSessionsThisWeek.length === 0 ? (
                  <Text className="text-white/40 text-center py-8">No upcoming PT sessions for this week.</Text>
                ) : (
                  scheduledSessionsThisWeek.map((session) => (
                    <View key={session.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-3">
                      <View className="flex-row items-start justify-between">
                        <View className="flex-1 pr-3">
                          <Text className="text-white font-semibold">
                            {format(new Date(`${session.date}T00:00:00`), 'EEEE, MMM d')} at {session.time}
                          </Text>
                          <Text className="text-af-silver text-sm mt-2">{session.description}</Text>
                          <Text className="text-af-silver text-xs mt-2">{scheduledSessionKindLabel(session)}</Text>
                          <Text className="text-af-silver text-xs mt-2">
                            Scheduled by {creatorNameById.get(session.createdBy) ?? 'Unknown member'}
                          </Text>
                        </View>
                        <View className="items-end">
                          <View className={cn(
                            'rounded-full px-2.5 py-1 max-w-[170px]',
                            session.scope === 'personal'
                              ? 'border border-af-success/40 bg-af-success/15'
                              : 'border border-af-warning/40 bg-af-warning/15'
                          )}>
                            <Text
                              className={cn('text-[11px] font-semibold', session.scope === 'personal' ? 'text-af-success' : 'text-af-warning')}
                              numberOfLines={1}
                            >
                              {scheduledSessionScopeLabel(session)}
                            </Text>
                          </View>
                          {canManagePrograms ? (
                            <Pressable
                              onPress={() => handleDeleteScheduledSession(session.id)}
                              disabled={deletingScheduledSessionId === session.id}
                              className="mt-3 w-9 h-9 rounded-full border border-af-danger/35 bg-af-danger/10 items-center justify-center"
                            >
                              <Trash2 size={16} color="#EF4444" />
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                      {session.scope !== 'personal' ? (
                        <View className="flex-row flex-wrap mt-3" style={{ gap: 8 }}>
                          {session.flights.map((flight) => (
                            <View key={`${session.id}-${flight}`} className="rounded-full border border-white/10 bg-black/15 px-3 py-1.5">
                              <Text className="text-white text-xs font-medium">{flight}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal visible={showDayScheduledSessionsModal} transparent animationType="fade" onRequestClose={() => setShowDayScheduledSessionsModal(false)}>
            <View className="flex-1 bg-black/80 items-center justify-center p-6">
              <View className="w-full max-w-lg rounded-3xl border border-white/20 bg-af-navy p-6 max-h-[80%]">
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-1 pr-3">
                  <Text className="text-white text-xl font-bold">Scheduled PT Sessions</Text>
                  <Text className="text-af-silver text-sm mt-1">{selectedScheduledDayLabel}</Text>
                </View>
                <Pressable
                  onPress={() => setShowDayScheduledSessionsModal(false)}
                  className="w-8 h-8 rounded-full bg-white/10 items-center justify-center"
                >
                  <X size={18} color="#C0C0C0" />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {selectedDayScheduledSessions.length === 0 ? (
                  <Text className="text-white/40 text-center py-8">No scheduled PT sessions for this day.</Text>
                ) : (
                  selectedDayScheduledSessions.map((session) => {
                    const expanded = expandedScheduledSessionIds.includes(session.id);
                    return (
                      <Pressable
                        key={session.id}
                        onPress={() => toggleExpandedScheduledSession(session.id)}
                        className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-4"
                      >
                        <View className="flex-row items-center justify-between">
                          <View className="flex-1 pr-3">
                            <Text className="text-white font-semibold">
                              {format(new Date(`${session.date}T00:00:00`), 'EEE, MMM d')} at {session.time}
                            </Text>
                            <Text className={cn('text-xs mt-1', session.scope === 'personal' ? 'text-af-success' : 'text-af-warning')}>
                              {scheduledSessionScopeLabel(session)}
                            </Text>
                          </View>
                          {expanded ? <ChevronUp size={18} color="#C0C0C0" /> : <ChevronDown size={18} color="#C0C0C0" />}
                        </View>

                        {expanded ? (
                          <View className="mt-3 border-t border-white/10 pt-3">
                            <Text className="text-white text-sm">{session.description}</Text>
                            <Text className="text-af-silver text-xs mt-2">{scheduledSessionKindLabel(session)}</Text>
                            <Text className="text-af-silver text-xs mt-2">
                              Scheduled by {creatorNameById.get(session.createdBy) ?? 'Unknown member'}
                            </Text>
                            {session.scope !== 'personal' ? (
                              <View className="flex-row flex-wrap mt-3" style={{ gap: 8 }}>
                                {session.flights.map((flight) => (
                                  <View key={`${session.id}-${flight}`} className="rounded-full border border-white/10 bg-black/15 px-3 py-1.5">
                                    <Text className="text-white text-xs font-medium">{flight}</Text>
                                  </View>
                                ))}
                              </View>
                            ) : null}
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
              </View>
            </View>
         </Modal>

         <Modal visible={showAttendanceLegendModal} transparent animationType="fade" onRequestClose={() => setShowAttendanceLegendModal(false)}>
            <View className="flex-1 bg-black/80 items-center justify-center p-6">
              <View className="w-full max-w-sm rounded-3xl border border-white/20 bg-af-navy p-6">
                <View className="flex-row items-center justify-between mb-4">
                  <View className="flex-1 pr-3">
                    <Text className="text-white text-xl font-bold">Attendance Checkmarks</Text>
                    <Text className="text-af-silver text-sm mt-1">Reference for the attendance colors used in FitFlight.</Text>
                  </View>
                  <Pressable
                    onPress={() => setShowAttendanceLegendModal(false)}
                    className="w-8 h-8 rounded-full bg-white/10 items-center justify-center"
                  >
                    <X size={18} color="#C0C0C0" />
                  </Pressable>
                </View>

                <View className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-3">
                  <View className="flex-row items-center">
                    <View className="w-10 h-10 rounded-full items-center justify-center border border-af-success bg-af-success/20">
                      <Check size={20} color="#22C55E" />
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="text-white font-semibold">Green Checkmark</Text>
                      <Text className="text-af-silver text-sm mt-1">Attendance was marked manually by a PFL, UFPM, Owner, or Squadron Leadership.</Text>
                    </View>
                  </View>
                </View>

                <View className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <View className="flex-row items-center">
                    <View className="w-10 h-10 rounded-full items-center justify-center border border-af-accent bg-af-accent/20">
                      <Check size={20} color="#4A90D9" />
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="text-white font-semibold">Blue Checkmark</Text>
                      <Text className="text-af-silver text-sm mt-1">Attendance was added automatically from an approved manual workout or a Strava-imported workout.</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
         </Modal>
        </SafeAreaView>
      </View>
    );
}
