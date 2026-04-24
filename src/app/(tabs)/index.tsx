import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavigationProp, ParamListBase, useNavigation } from '@react-navigation/native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Activity, ArrowDown, ArrowRight, ArrowUp, Calendar, ChevronDown, ChevronUp, Crown, Lock, LockOpen, Medal, Pencil, Shield, Trophy, Users } from 'lucide-react-native';
import { LeaderboardContent } from '@/components/LeaderboardContent';
import { PageContainer } from '@/components/PageContainer';
import { ThemeBackdrop } from '@/components/ThemeBackdrop';
import { ThemeChrome } from '@/components/ThemeChrome';
import { TopStatusBar } from '@/components/TopStatusBar';
import { TutorialTarget, useTutorialTour } from '@/contexts/TutorialTourContext';
import { requestRegisteredSync } from '@/lib/appSync';
import { useErrorLogScreenContext } from '@/lib/errorLog';
import { getMemberMonthSummary, getMonthKey } from '@/lib/monthlyStats';
import { fetchDashboardLayoutPreference, saveDashboardLayoutPreference } from '@/lib/supabaseData';
import { canManagePFRARecords, canManagePTPrograms, getShortDisplayName, useAuthStore, useMemberStore } from '@/lib/store';
import { getThemeBodyStyle, getThemeCardStyle, getThemeHeadingStyle, getThemeIconWellStyle, getThemeLabelStyle, useAppTheme } from '@/lib/theme';

function getCompetitionPosition(scores: number[], index: number): number {
  if (index <= 0) return 1;
  return scores[index] === scores[index - 1] ? getCompetitionPosition(scores, index - 1) : index + 1;
}

function getOrdinalLabel(value: number): string {
  const remainderHundred = value % 100;
  if (remainderHundred >= 11 && remainderHundred <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

type DashboardCardId =
  | 'leaderboard'
  | 'today-pt'
  | 'quick-stats'
  | 'upcoming-sessions'
  | 'recent-activity'
  | 'role-dashboard';

const DEFAULT_DASHBOARD_LAYOUT: DashboardCardId[] = [
  'leaderboard',
  'today-pt',
  'quick-stats',
  'upcoming-sessions',
  'recent-activity',
  'role-dashboard',
];

function normalizeDashboardLayout(order: string[] | DashboardCardId[], available: DashboardCardId[]) {
  const availableSet = new Set<DashboardCardId>(available);
  const normalized: DashboardCardId[] = [];
  order.forEach((item) => {
    if (availableSet.has(item as DashboardCardId) && !normalized.includes(item as DashboardCardId)) {
      normalized.push(item as DashboardCardId);
    }
  });
  available.forEach((item) => {
    if (!normalized.includes(item)) normalized.push(item);
  });
  return normalized;
}

function DashboardCard({
  title,
  icon: Icon,
  accent,
  expanded,
  onPress,
  children,
  editControls,
  isEditing = false,
  isLocked = false,
  onToggleLock,
}: {
  title: string;
  icon: React.ElementType;
  accent: string;
  expanded: boolean;
  onPress: () => void;
  children: React.ReactNode;
  editControls?: React.ReactNode;
  isEditing?: boolean;
  isLocked?: boolean;
  onToggleLock?: () => void;
}) {
  const theme = useAppTheme();
  return (
    <ThemeChrome theme={theme} variant="feature">
      <Pressable
        onPress={onPress}
        className={expanded || isEditing ? "relative p-4 active:opacity-90 min-h-[186px] overflow-hidden" : "relative p-4 active:opacity-90 h-[186px] overflow-hidden"}
      >
        <LinearGradient
          pointerEvents="none"
          colors={[`${accent}30`, `${accent}12`, 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        {isEditing ? (
          <View className="flex-1 justify-between">
            <View className="items-end">{editControls}</View>
            <View className="flex-1 items-center justify-center px-3">
              <Text
                style={[getThemeHeadingStyle(theme, 15), { textAlign: 'center' }]}
                numberOfLines={3}
                adjustsFontSizeToFit
                minimumFontScale={0.56}
              >
                {title}
              </Text>
            </View>
          </View>
        ) : (
          <>
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text
                  style={[getThemeHeadingStyle(theme, 15), { flexShrink: 1 }]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.5}
                >
                  {title}
                </Text>
              </View>
              <View className="items-end">
                {editControls}
                <View className="flex-row items-center pt-1">
                  {expanded && onToggleLock ? (
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        onToggleLock();
                      }}
                      className="w-8 h-8 items-center justify-center rounded-full mr-1"
                      style={{ backgroundColor: isLocked ? theme.accentSoft : theme.surfaceAlt }}
                    >
                      {isLocked ? <Lock size={14} color={theme.accent} /> : <LockOpen size={14} color={theme.textSecondary} />}
                    </Pressable>
                  ) : null}
                  {expanded ? <ChevronUp size={18} color={theme.textSecondary} /> : <ChevronDown size={18} color={theme.textSecondary} />}
                </View>
              </View>
            </View>
            <View className="mt-3 flex-row items-center">
              <View className="w-12 h-12 items-center justify-center" style={getThemeIconWellStyle(theme)}>
                <Icon size={22} color={accent} />
              </View>
              <View className="ml-3 flex-1">
                <Text
                  style={[getThemeBodyStyle(theme, 12, theme.textMuted), { flexShrink: 1 }]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.68}
                >
                  Tap to {expanded ? 'collapse' : 'expand'}
                </Text>
              </View>
            </View>
            <View style={{ marginTop: 16 }}>{children}</View>
          </>
        )}
      </Pressable>
    </ThemeChrome>
  );
}

function buildDashboardDisplayItems(
  layout: DashboardCardId[],
  expandedDashboardCardIds: DashboardCardId[],
  columns: number
) {
  const expandedSet = new Set(expandedDashboardCardIds);
  if (expandedSet.size === 0) {
    return layout.map((id) => ({ id, span: 1 as const }));
  }

  if (columns === 2) {
    const displayItems: Array<{ id: DashboardCardId; span: 1 | 2 }> = [];
    for (let rowStart = 0; rowStart < layout.length; rowStart += columns) {
      const rowItems = layout.slice(rowStart, rowStart + columns);
      const expandedInRow = rowItems.filter((item) => expandedSet.has(item));
      if (expandedInRow.length > 0) {
        expandedInRow.forEach((item) => displayItems.push({ id: item, span: 2 }));
        rowItems
          .filter((item) => !expandedSet.has(item))
          .forEach((item) => displayItems.push({ id: item, span: 1 }));
      } else {
        rowItems.forEach((item) => displayItems.push({ id: item, span: 1 }));
      }
    }
    return displayItems;
  }

  return layout.map((id) => ({
    id,
    span: expandedSet.has(id) ? (2 as const) : (1 as const),
  }));
}

function normalizeLockedExpandedCardIds(
  cardIds: string[] | null | undefined,
  available: DashboardCardId[]
) {
  if (!Array.isArray(cardIds)) return [];
  const availableSet = new Set(available);
  const normalized: DashboardCardId[] = [];
  cardIds.forEach((cardId) => {
    if (availableSet.has(cardId as DashboardCardId) && !normalized.includes(cardId as DashboardCardId)) {
      normalized.push(cardId as DashboardCardId);
    }
  });
  return normalized;
}

export default function HomeScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const contentMaxWidth = width >= 1440 ? 1280 : 1120;
  const availableGridWidth = Math.min(width, contentMaxWidth) - 48;
  const collapsedCardTargetWidth = 280;
  const isPhoneLandscape = width > height && width < 1024;
  const dashboardColumns =
    width >= 1024
      ? Math.max(2, Math.floor(availableGridWidth / collapsedCardTargetWidth))
      : isPhoneLandscape
      ? 3
      : 2;
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { currentTargetId, refreshCurrentTarget } = useTutorialTour();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const tutorialTargetYRef = useRef<Record<string, number>>({});
  const layoutHydratedRef = useRef(false);
  const persistedLayoutRef = useRef<{ orderKey: string; lockedExpandedCardIdsKey: string; updatedAt: string | null }>({
    orderKey: '',
    lockedExpandedCardIdsKey: '',
    updatedAt: null,
  });

  const [showingLeaderboard, setShowingLeaderboard] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const homeOverlayLabel = showingLeaderboard
    ? 'Leaderboard'
    : showInstallHelp
      ? 'Install Help'
      : null;
  useErrorLogScreenContext('Home', homeOverlayLabel);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedDashboardCardIds, setExpandedDashboardCardIds] = useState<DashboardCardId[]>([]);
  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const [dashboardLayout, setDashboardLayout] = useState<DashboardCardId[]>(DEFAULT_DASHBOARD_LAYOUT);
  const [dashboardLayoutUpdatedAt, setDashboardLayoutUpdatedAt] = useState<string | null>(null);
  const [lockedExpandedCardIds, setLockedExpandedCardIds] = useState<DashboardCardId[]>([]);

  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const members = useMemberStore((s) => s.members);
  const ptSessions = useMemberStore((s) => s.ptSessions);
  const scheduledSessions = useMemberStore((s) => s.scheduledSessions);

  const userName = user ? getShortDisplayName(user) : 'Airman';
  const userAccountType = user?.accountType ?? 'standard';
  const dashboardLayoutStorageKey = useMemo(
    () => (user?.email ? `fitflight-home-layout:${user.email.toLowerCase()}` : null),
    [user?.email]
  );

  const currentMember = useMemo(
    () => members.find((m) => m.id === user?.id) ?? members.find((m) => m.email.toLowerCase() === user?.email?.toLowerCase()),
    [members, user?.email, user?.id]
  );
  const squadronMembers = useMemo(
    () => members.filter((m) => m.squadron === (user?.squadron ?? 'Hawks')),
    [members, user?.squadron]
  );
  const currentMonthKey = useMemo(() => getMonthKey(), []);
  const currentMonthSummaries = useMemo(
    () => new Map(squadronMembers.map((m) => [m.id, getMemberMonthSummary(m, currentMonthKey, ptSessions)])),
    [currentMonthKey, ptSessions, squadronMembers]
  );
  const rankedMembers = useMemo(
    () =>
      [...squadronMembers]
        .map((m) => ({ id: m.id, name: getShortDisplayName(m), totalScore: currentMonthSummaries.get(m.id)?.score ?? 0 }))
        .sort((a, b) => b.totalScore - a.totalScore),
    [currentMonthSummaries, squadronMembers]
  );
  const leaderboardPlacements = useMemo(() => {
    const scores = rankedMembers.map((m) => m.totalScore);
    const placements = rankedMembers.map((m, index) => ({ ...m, placement: getCompetitionPosition(scores, index) }));
    const groups: Array<{ placement: number; score: number; members: typeof rankedMembers }> = [];
    placements.forEach((entry) => {
      const existing = groups.find((g) => g.placement === entry.placement);
      if (existing) existing.members.push({ id: entry.id, name: entry.name, totalScore: entry.totalScore });
      else groups.push({ placement: entry.placement, score: entry.totalScore, members: [{ id: entry.id, name: entry.name, totalScore: entry.totalScore }] });
    });
    return groups.sort((a, b) => a.placement - b.placement);
  }, [rankedMembers]);
  const leaderGroup = leaderboardPlacements[0];
  const runnerUpGroup = leaderboardPlacements[1];
  const averageScore = rankedMembers.length
    ? Math.round(rankedMembers.reduce((sum, m) => sum + m.totalScore, 0) / rankedMembers.length)
    : 0;
  const currentMemberSummary = useMemo(
    () => (currentMember ? getMemberMonthSummary(currentMember, currentMonthKey, ptSessions) : null),
    [currentMember, currentMonthKey, ptSessions]
  );
  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);
  const todaysSessions = useMemo(
    () =>
      scheduledSessions
        .filter((s) => s.date === todayIso)
        .filter(
          (s) =>
            s.scope === 'squadron' ||
            (s.scope === 'flight' && currentMember && s.flights.includes(currentMember.flight)) ||
            (s.scope === 'personal' && s.createdBy === user?.id)
        )
        .sort((a, b) => a.time.localeCompare(b.time)),
    [currentMember, scheduledSessions, todayIso, user?.id]
  );
  const upcomingSessions = useMemo(
    () =>
      scheduledSessions
        .filter((s) => new Date(`${s.date}T${s.time}:00`).getTime() >= Date.now())
        .filter(
          (s) =>
            s.scope === 'squadron' ||
            (s.scope === 'flight' && currentMember && s.flights.includes(currentMember.flight)) ||
            (s.scope === 'personal' && s.createdBy === user?.id)
        )
        .sort((a, b) => new Date(`${a.date}T${a.time}:00`).getTime() - new Date(`${b.date}T${b.time}:00`).getTime())
        .slice(0, 3),
    [currentMember, scheduledSessions, user?.id]
  );
  const recentActivity = useMemo(() => {
    if (!currentMember) return [];
    const workouts = currentMember.workouts
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3)
      .map((w) => ({ id: w.id, title: w.title || w.type, subtitle: `${w.date} · ${w.duration} min` }));
    const pfra = currentMember.fitnessAssessments
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    if (pfra) {
      workouts.unshift({ id: pfra.id, title: `PFRA ${pfra.overallScore.toFixed(1)}`, subtitle: `${pfra.date} · ${pfra.recordType ?? 'self'}` });
    }
    return workouts.slice(0, 4);
  }, [currentMember]);
  const roleHighlights = useMemo(() => {
    if (!currentMember) return [];
    const belowTargetCount = squadronMembers.filter((member) => (currentMonthSummaries.get(member.id)?.workoutCount ?? 0) < 5).length;
    const cards: Array<{ id: string; title: string; value: string; note: string; icon: React.ElementType; accent: string }> = [];
    if (canManagePTPrograms(userAccountType)) {
      cards.push({
        id: 'sessions',
        title: 'Upcoming PT',
        value: String(scheduledSessions.filter((s) => new Date(`${s.date}T${s.time}:00`).getTime() >= Date.now()).length),
        note: 'Sessions still on the calendar',
        icon: Calendar,
        accent: '#4A90D9',
      });
      cards.push({
        id: 'accountability',
        title: 'Below 5 Workouts',
        value: String(belowTargetCount),
        note: 'Members currently under weekly expectation',
        icon: Users,
        accent: '#F59E0B',
      });
    }
    if (canManagePFRARecords(userAccountType)) {
      cards.push({
        id: 'pfra',
        title: 'Recent PFRAs',
        value: String(squadronMembers.reduce((count, m) => count + m.fitnessAssessments.length, 0)),
        note: 'PFRA records attached to squadron accounts',
        icon: Activity,
        accent: '#A78BFA',
      });
    }
    if (userAccountType === 'fitflight_creator') {
      cards.push({
        id: 'owner',
        title: 'Roster Size',
        value: String(squadronMembers.length),
        note: 'Active members currently synced',
        icon: Shield,
        accent: '#FFD700',
      });
    }
    return cards;
  }, [currentMember, currentMonthSummaries, scheduledSessions, squadronMembers, userAccountType]);
  const roleDashboardTitle = useMemo(() => {
    const labels: Record<string, string> = {
      fitflight_creator: 'Owner Dashboard',
      ufpm: 'UFPM Dashboard',
      ptl: 'PFL Dashboard',
      squadron_leadership: 'Squadron Leadership Dashboard',
      demo: 'Demo Dashboard',
    };
    return labels[userAccountType] ?? 'Dashboard';
  }, [userAccountType]);

  const availableCardIds = useMemo(
    () =>
      roleHighlights.length > 0
        ? DEFAULT_DASHBOARD_LAYOUT
        : DEFAULT_DASHBOARD_LAYOUT.filter((item) => item !== 'role-dashboard'),
    [roleHighlights.length]
  );
  const normalizedDashboardLayout = useMemo(
    () => normalizeDashboardLayout(dashboardLayout, availableCardIds),
    [availableCardIds, dashboardLayout]
  );
  const normalizedLockedExpandedCardIds = useMemo(
    () => normalizeLockedExpandedCardIds(lockedExpandedCardIds, availableCardIds),
    [availableCardIds, lockedExpandedCardIds]
  );
  const dashboardDisplayItems = useMemo(
    () => buildDashboardDisplayItems(normalizedDashboardLayout, expandedDashboardCardIds, dashboardColumns),
    [dashboardColumns, expandedDashboardCardIds, normalizedDashboardLayout]
  );

  const persistDashboardLayoutLocally = useCallback(
    async (order: DashboardCardId[], updatedAt: string | null, nextLockedExpandedCardIds: DashboardCardId[]) => {
      if (!dashboardLayoutStorageKey) return;
      await AsyncStorage.setItem(
        dashboardLayoutStorageKey,
        JSON.stringify({
          order,
          lockedExpandedCardIds: nextLockedExpandedCardIds,
          updatedAt,
        })
      );
    },
    [dashboardLayoutStorageKey]
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await requestRegisteredSync('global');
    } finally {
      setIsRefreshing(false);
    }
  };

  const toggleDashboardCard = (id: string) =>
    setExpandedDashboardCardIds((current) => {
      const currentSet = new Set(current);
      const lockedSet = new Set(normalizedLockedExpandedCardIds);
      if (currentSet.has(id as DashboardCardId)) {
        if (!lockedSet.has(id as DashboardCardId)) {
          currentSet.delete(id as DashboardCardId);
        }
      } else {
        currentSet.add(id as DashboardCardId);
      }
      return normalizedDashboardLayout.filter((item) => currentSet.has(item));
    });

  const toggleLockedExpandedCard = useCallback((id: DashboardCardId) => {
    setLockedExpandedCardIds((current) => {
      const currentSet = new Set(current);
      if (currentSet.has(id)) {
        currentSet.delete(id);
      } else {
        currentSet.add(id);
      }
      const nextLocked = normalizedDashboardLayout.filter((item) => currentSet.has(item));
      setExpandedDashboardCardIds((expandedCurrent) => {
        const expandedSet = new Set(expandedCurrent);
        if (nextLocked.includes(id)) {
          expandedSet.add(id);
        } else {
          expandedSet.delete(id);
        }
        return normalizedDashboardLayout.filter((item) => expandedSet.has(item));
      });
      persistDashboardLayoutLocally(normalizedDashboardLayout, dashboardLayoutUpdatedAt, nextLocked).catch(() => undefined);
      return nextLocked;
    });
  }, [dashboardLayoutUpdatedAt, normalizedDashboardLayout, persistDashboardLayoutLocally]);

  const openLeaderboard = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowingLeaderboard(true);
  };

  const closeLeaderboard = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowingLeaderboard(false);
  };

  const moveDashboardCard = useCallback(
    (id: DashboardCardId, offset: -1 | 1) => {
      setDashboardLayout((current) => {
        const normalized = normalizeDashboardLayout(current, availableCardIds);
        const index = normalized.indexOf(id);
        const nextIndex = index + offset;
        if (index === -1 || nextIndex < 0 || nextIndex >= normalized.length) return normalized;
        const next = [...normalized];
        const [moved] = next.splice(index, 1);
        next.splice(nextIndex, 0, moved);
        persistDashboardLayoutLocally(next, dashboardLayoutUpdatedAt, normalizedLockedExpandedCardIds).catch(() => undefined);
        return next;
      });
    },
    [availableCardIds, dashboardLayoutUpdatedAt, normalizedLockedExpandedCardIds, persistDashboardLayoutLocally]
  );

  useEffect(() => {
    setDashboardLayout((current) => normalizeDashboardLayout(current, availableCardIds));
  }, [availableCardIds]);

  useEffect(() => {
    const normalizedLocked = normalizeLockedExpandedCardIds(lockedExpandedCardIds, availableCardIds);
    if (normalizedLocked.join('|') !== lockedExpandedCardIds.join('|')) {
      setLockedExpandedCardIds(normalizedLocked);
      return;
    }
  }, [availableCardIds, lockedExpandedCardIds]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateDashboardLayout() {
      layoutHydratedRef.current = false;
      const fallbackOrder = normalizeDashboardLayout(DEFAULT_DASHBOARD_LAYOUT, availableCardIds);
      let localOrder = fallbackOrder;
      let localUpdatedAt: string | null = null;
      let localLockedCards: DashboardCardId[] = [];

      if (dashboardLayoutStorageKey) {
        const raw = await AsyncStorage.getItem(dashboardLayoutStorageKey);
        if (raw && !cancelled) {
          try {
            const parsed = JSON.parse(raw) as { order?: string[]; lockedExpandedCardIds?: string[]; updatedAt?: string | null };
            localOrder = normalizeDashboardLayout(parsed.order ?? fallbackOrder, availableCardIds);
            localLockedCards = normalizeLockedExpandedCardIds(parsed.lockedExpandedCardIds, availableCardIds);
            localUpdatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
            if (!cancelled) {
              setLockedExpandedCardIds(localLockedCards);
              setExpandedDashboardCardIds(localLockedCards);
            }
          } catch {
            localOrder = fallbackOrder;
            localUpdatedAt = null;
            if (!cancelled) {
              setLockedExpandedCardIds([]);
              setExpandedDashboardCardIds([]);
            }
          }
        }
      }

      if (!cancelled) {
        setDashboardLayout(localOrder);
        setDashboardLayoutUpdatedAt(localUpdatedAt);
        persistedLayoutRef.current = {
          orderKey: localOrder.join('|'),
          lockedExpandedCardIdsKey: localLockedCards.join('|'),
          updatedAt: localUpdatedAt,
        };
      }

      if (accessToken && user?.email) {
        try {
          const remotePreference = await fetchDashboardLayoutPreference(user.email, accessToken);
          if (!cancelled && remotePreference) {
            const remoteOrder = normalizeDashboardLayout(remotePreference.order, availableCardIds);
            const remoteKey = remoteOrder.join('|');
            const remoteLockedCards = normalizeLockedExpandedCardIds(remotePreference.lockedExpandedCardIds, availableCardIds);
            const localKey = localOrder.join('|');
            const remoteDiffers =
              remotePreference.updatedAt !== localUpdatedAt ||
              remoteKey !== localKey ||
              remoteLockedCards.join('|') !== persistedLayoutRef.current.lockedExpandedCardIdsKey;
            if (remoteDiffers) {
              setDashboardLayout(remoteOrder);
              setDashboardLayoutUpdatedAt(remotePreference.updatedAt);
              setLockedExpandedCardIds(remoteLockedCards);
              setExpandedDashboardCardIds(remoteLockedCards);
              persistedLayoutRef.current = {
                orderKey: remoteKey,
                lockedExpandedCardIdsKey: remoteLockedCards.join('|'),
                updatedAt: remotePreference.updatedAt,
              };
              await persistDashboardLayoutLocally(remoteOrder, remotePreference.updatedAt, remoteLockedCards);
            }
          }
        } catch {
          // Keep the local-first layout if the preference fetch fails.
        }
      }

      layoutHydratedRef.current = true;
    }

    hydrateDashboardLayout().catch(() => {
      layoutHydratedRef.current = true;
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, availableCardIds, dashboardLayoutStorageKey, persistDashboardLayoutLocally, user?.email]);

  useEffect(() => {
    if (!layoutHydratedRef.current || !accessToken || !user?.email) return;
    const currentOrderKey = normalizedDashboardLayout.join('|');
    if (
      currentOrderKey === persistedLayoutRef.current.orderKey &&
      normalizedLockedExpandedCardIds.join('|') === persistedLayoutRef.current.lockedExpandedCardIdsKey
    ) return;

    const timeoutId = setTimeout(() => {
      saveDashboardLayoutPreference({
        email: user.email,
        order: normalizedDashboardLayout,
        lockedExpandedCardIds: normalizedLockedExpandedCardIds,
        accessToken,
      })
        .then((savedPreference) => {
          setDashboardLayoutUpdatedAt(savedPreference.updatedAt);
          const savedLockedCards = normalizeLockedExpandedCardIds(savedPreference.lockedExpandedCardIds, availableCardIds);
          persistedLayoutRef.current = {
            orderKey: normalizeDashboardLayout(savedPreference.order, availableCardIds).join('|'),
            lockedExpandedCardIdsKey: savedLockedCards.join('|'),
            updatedAt: savedPreference.updatedAt,
          };
          setLockedExpandedCardIds(savedLockedCards);
          setExpandedDashboardCardIds(savedLockedCards);
          return persistDashboardLayoutLocally(
            normalizeDashboardLayout(savedPreference.order, availableCardIds),
            savedPreference.updatedAt,
            savedLockedCards
          );
        })
        .catch(() => undefined);
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [accessToken, availableCardIds, normalizedDashboardLayout, normalizedLockedExpandedCardIds, persistDashboardLayoutLocally, user?.email]);

  useEffect(() => {
    const tabNavigation = navigation as NavigationProp<ParamListBase> & {
      addListener?: (event: string, callback: () => void) => (() => void) | void;
    };
    const unsubscribeSelf = tabNavigation.addListener?.('tabPress', () => setShowingLeaderboard(false));
    const unsubscribeBlur = tabNavigation.addListener?.('blur', () => {
      setExpandedDashboardCardIds(normalizedLockedExpandedCardIds);
      setIsEditingLayout(false);
    });
    const parentNavigation = navigation.getParent() as
      | {
          addListener?: (event: string, callback: () => void) => () => void;
        }
      | undefined;
    const unsubscribeParent = parentNavigation?.addListener?.('tabPress', () => setShowingLeaderboard(false));
    return () => {
      unsubscribeSelf?.();
      unsubscribeBlur?.();
      unsubscribeParent?.();
    };
  }, [navigation, normalizedLockedExpandedCardIds]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (window.sessionStorage.getItem('fitflight_show_install_help') === '1') {
      window.sessionStorage.removeItem('fitflight_show_install_help');
      setShowInstallHelp(true);
    }
  }, []);

  useEffect(() => {
    if (!currentTargetId || !currentTargetId.startsWith('home-')) return;
    const targetY = tutorialTargetYRef.current[currentTargetId];
    if (typeof targetY !== 'number') return;
    const timeoutId = setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: Math.max(targetY - 120, 0), animated: true });
      setTimeout(() => refreshCurrentTarget(), 220);
    }, 180);
    return () => clearTimeout(timeoutId);
  }, [currentTargetId, refreshCurrentTarget]);

  const renderEditControls = (id: DashboardCardId) => {
    if (!isEditingLayout) return null;
    const index = normalizedDashboardLayout.indexOf(id);
    const atTop = index <= 0;
    const atBottom = index === normalizedDashboardLayout.length - 1;
    return (
      <View className="flex-row items-center mb-2">
        <Pressable
          onPress={() => moveDashboardCard(id, -1)}
          disabled={atTop}
          className="w-8 h-8 items-center justify-center rounded-full mr-1"
          style={{
            backgroundColor: atTop ? theme.surfaceAlt : theme.accentSoft,
            opacity: atTop ? 0.45 : 1,
          }}
        >
          <ArrowUp size={14} color={atTop ? theme.textMuted : theme.accent} />
        </Pressable>
        <Pressable
          onPress={() => moveDashboardCard(id, 1)}
          disabled={atBottom}
          className="w-8 h-8 items-center justify-center rounded-full"
          style={{
            backgroundColor: atBottom ? theme.surfaceAlt : theme.accentSoft,
            opacity: atBottom ? 0.45 : 1,
          }}
        >
          <ArrowDown size={14} color={atBottom ? theme.textMuted : theme.accent} />
        </Pressable>
      </View>
    );
  };

  const renderLockControl = (id: DashboardCardId) => {
    const isLocked = normalizedLockedExpandedCardIds.includes(id);
    return (
      <Pressable
        onPress={(event) => {
          event.stopPropagation();
          toggleLockedExpandedCard(id);
        }}
        className="w-8 h-8 items-center justify-center rounded-full mr-1"
        style={{ backgroundColor: isLocked ? theme.accentSoft : theme.surfaceAlt }}
      >
        {isLocked ? <Lock size={14} color={theme.accent} /> : <LockOpen size={14} color={theme.textSecondary} />}
      </Pressable>
    );
  };

  const renderLeaderboardSnapshot = () => (
    <ThemeChrome theme={theme} variant="feature">
      <Pressable onPress={openLeaderboard} className="relative p-4 active:opacity-90 min-h-[186px] overflow-hidden">
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(250,204,21,0.24)', 'rgba(74,144,217,0.12)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        {isEditingLayout ? (
          <View className="flex-1 justify-between">
            <View className="items-end">{renderEditControls('leaderboard')}</View>
            <View className="flex-1 items-center justify-center px-3">
              <Text style={[getThemeHeadingStyle(theme, 17), { textAlign: 'center' }]} numberOfLines={3}>
                Leaderboard Snapshot
              </Text>
            </View>
          </View>
        ) : (
          <>
            <View className="mb-2">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                <Text style={getThemeLabelStyle(theme)} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>
                  Leaderboard Snapshot
                </Text>
                </View>
                <View className="items-end justify-start">
                  {renderEditControls('leaderboard')}
                </View>
              </View>
              <View className="flex-row items-center mt-2">
                <View style={{ width: 52 }} />
                <View className="flex-1 items-center">
                  <Crown size={14} color="#FFD700" />
                </View>
                <View className="flex-row items-center justify-end" style={{ width: 52 }}>
                  <Text style={{ ...getThemeBodyStyle(theme, 12, theme.accent), fontWeight: '700', marginRight: 4 }}>Open</Text>
                  <ArrowRight size={14} color={theme.accent} />
                </View>
              </View>
            </View>
            <View className="flex-1 justify-between">
              <View className="flex-1 items-center justify-center py-2">
                <View className="flex-row items-center w-full">
                  <Text style={[getThemeBodyStyle(theme, 11, theme.textSecondary), { flex: 1, textAlign: 'left' }]}>
                    Current Leader
                  </Text>
                  <Text style={[getThemeBodyStyle(theme, 11, theme.textSecondary), { textAlign: 'right' }]}>
                    Score
                  </Text>
                </View>
                <View className="flex-row items-center w-full mt-1">
                  <Text
                    style={[getThemeHeadingStyle(theme, 15), { flex: 1, textAlign: 'left' }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.68}
                  >
                    {leaderGroup
                      ? leaderGroup.members.length > 1
                        ? `${leaderGroup.members.length} members`
                        : leaderGroup.members[0]?.name
                      : 'No data yet'}
                  </Text>
                  <Text style={[getThemeHeadingStyle(theme, 18), { marginLeft: 10, textAlign: 'right' }]}>
                    {leaderGroup?.score ?? 0}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center justify-between mt-3 pt-2 border-t border-white/10">
                <View className="flex-row items-center flex-1 pr-3">
                  <Medal size={13} color="#C0C0C0" />
                  <Text
                    style={[getThemeBodyStyle(theme, 11, theme.textSecondary), { marginLeft: 5, flexShrink: 1 }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.68}
                  >
                    {runnerUpGroup
                      ? runnerUpGroup.members.length > 1
                        ? `${runnerUpGroup.members.length} tied next`
                        : runnerUpGroup.members[0]?.name
                      : 'Runner-up pending'}
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Users size={13} color="#4A90D9" />
                <Text style={[getThemeBodyStyle(theme, 11, theme.textSecondary), { marginLeft: 5 }]}>
                  Avg {averageScore}
                </Text>
              </View>
              </View>
            </View>
          </>
        )}
      </Pressable>
    </ThemeChrome>
  );

  const renderCardContent = (cardId: DashboardCardId) => {
    switch (cardId) {
      case 'leaderboard':
        return renderLeaderboardSnapshot();
      case 'today-pt':
        return (
          <DashboardCard
            title="Today's PT"
            icon={Calendar}
            accent="#F59E0B"
            expanded={expandedDashboardCardIds.includes('today-pt')}
            onPress={() => toggleDashboardCard('today-pt')}
            editControls={renderEditControls('today-pt')}
            isEditing={isEditingLayout}
            isLocked={normalizedLockedExpandedCardIds.includes('today-pt')}
            onToggleLock={() => toggleLockedExpandedCard('today-pt')}
          >
            {expandedDashboardCardIds.includes('today-pt') ? (
              todaysSessions.length === 0 ? (
                <Text style={getThemeBodyStyle(theme, 14)}>No PT sessions scheduled for today.</Text>
              ) : (
                todaysSessions.map((s) => (
                  <View
                    key={s.id}
                    className="flex-row items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                    style={{ marginBottom: 10 }}
                  >
                    <View className="flex-1 pr-3">
                      <Text style={getThemeHeadingStyle(theme, 15)}>{s.time}</Text>
                      <Text style={[getThemeBodyStyle(theme, 13), { marginTop: 4 }]}>{s.description}</Text>
                    </View>
                    <View className="rounded-full px-3 py-1" style={{ backgroundColor: theme.accentSoft }}>
                      <Text style={getThemeBodyStyle(theme, 12, theme.accent)}>
                        {s.scope === 'personal' ? 'Personal' : s.scope === 'squadron' ? 'Squadron' : s.flights.join(', ')}
                      </Text>
                    </View>
                  </View>
                ))
              )
            ) : (
              <Text style={getThemeBodyStyle(theme, 14, theme.textSecondary)}>
                {todaysSessions.length === 0
                  ? 'No PT sessions scheduled for today.'
                  : `${todaysSessions.length} session${todaysSessions.length === 1 ? '' : 's'} scheduled today`}
              </Text>
            )}
          </DashboardCard>
        );
      case 'quick-stats':
        return (
          <DashboardCard
            title="Quick Stats"
            icon={Trophy}
            accent="#22C55E"
            expanded={expandedDashboardCardIds.includes('quick-stats')}
            onPress={() => toggleDashboardCard('quick-stats')}
            editControls={renderEditControls('quick-stats')}
            isEditing={isEditingLayout}
            isLocked={normalizedLockedExpandedCardIds.includes('quick-stats')}
            onToggleLock={() => toggleLockedExpandedCard('quick-stats')}
          >
            <View className="flex-row justify-between">
              <View className="flex-1 items-center">
                <Text style={getThemeHeadingStyle(theme, 22)}>{currentMemberSummary?.score ?? 0}</Text>
                <Text style={getThemeBodyStyle(theme, 12, theme.textMuted)}>Score</Text>
              </View>
              <View className="w-px bg-white/10 mx-3" />
              <View className="flex-1 items-center">
                <Text style={getThemeHeadingStyle(theme, 22)}>{currentMemberSummary?.workoutCount ?? 0}</Text>
                <Text style={getThemeBodyStyle(theme, 12, theme.textMuted)}>Workouts</Text>
              </View>
              <View className="w-px bg-white/10 mx-3" />
              <View className="flex-1 items-center">
                <Text style={getThemeHeadingStyle(theme, 22)}>{(((currentMemberSummary?.minutes ?? 0) / 60) || 0).toFixed(2)}</Text>
                <Text style={getThemeBodyStyle(theme, 12, theme.textMuted)}>Hours</Text>
              </View>
            </View>
            {expandedDashboardCardIds.includes('quick-stats') ? (
              <View className="mt-4 pt-4 border-t border-white/10">
                <Text style={getThemeBodyStyle(theme, 13, theme.textSecondary)}>Current month performance summary.</Text>
                <View className="mt-3 flex-row justify-between">
                  <Text style={getThemeBodyStyle(theme, 13)}>Miles</Text>
                  <Text style={getThemeBodyStyle(theme, 13, theme.textPrimary)}>{(currentMemberSummary?.miles ?? 0).toFixed(2)}</Text>
                </View>
                <View className="mt-2 flex-row justify-between">
                  <Text style={getThemeBodyStyle(theme, 13)}>PFRA records</Text>
                  <Text style={getThemeBodyStyle(theme, 13, theme.textPrimary)}>{currentMember?.fitnessAssessments.length ?? 0}</Text>
                </View>
              </View>
            ) : null}
          </DashboardCard>
        );
      case 'upcoming-sessions':
        return (
          <DashboardCard
            title="Upcoming Sessions"
            icon={Calendar}
            accent="#4A90D9"
            expanded={expandedDashboardCardIds.includes('upcoming-sessions')}
            onPress={() => toggleDashboardCard('upcoming-sessions')}
            editControls={renderEditControls('upcoming-sessions')}
            isEditing={isEditingLayout}
            isLocked={normalizedLockedExpandedCardIds.includes('upcoming-sessions')}
            onToggleLock={() => toggleLockedExpandedCard('upcoming-sessions')}
          >
              {upcomingSessions.length === 0 ? (
                <Text style={getThemeBodyStyle(theme, 14)}>Nothing upcoming yet.</Text>
            ) : expandedDashboardCardIds.includes('upcoming-sessions') ? (
              upcomingSessions.map((s) => (
                <View key={s.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3" style={{ marginBottom: 10 }}>
                  <Text style={getThemeBodyStyle(theme, 12, theme.textMuted)}>
                    {s.date} · {s.time}
                  </Text>
                  <Text style={[getThemeBodyStyle(theme, 14), { fontWeight: '600', marginTop: 4 }]}>{s.description}</Text>
                </View>
              ))
            ) : (
              <Text style={getThemeBodyStyle(theme, 14, theme.textSecondary)}>
                {upcomingSessions[0]?.description ?? `${upcomingSessions.length} upcoming sessions`}
              </Text>
            )}
          </DashboardCard>
        );
      case 'recent-activity':
        return (
          <DashboardCard
            title="Recent Activity"
            icon={Activity}
            accent="#EF4444"
            expanded={expandedDashboardCardIds.includes('recent-activity')}
            onPress={() => toggleDashboardCard('recent-activity')}
            editControls={renderEditControls('recent-activity')}
            isEditing={isEditingLayout}
            isLocked={normalizedLockedExpandedCardIds.includes('recent-activity')}
            onToggleLock={() => toggleLockedExpandedCard('recent-activity')}
          >
              {recentActivity.length === 0 ? (
                <Text style={getThemeBodyStyle(theme, 14)}>No recent activity yet.</Text>
            ) : expandedDashboardCardIds.includes('recent-activity') ? (
              recentActivity.map((item) => (
                <View key={item.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3" style={{ marginBottom: 10 }}>
                  <Text style={[getThemeBodyStyle(theme, 14), { fontWeight: '600' }]}>{item.title}</Text>
                  <Text style={[getThemeBodyStyle(theme, 12, theme.textMuted), { marginTop: 4 }]}>{item.subtitle}</Text>
                </View>
              ))
            ) : (
              <Text style={getThemeBodyStyle(theme, 14, theme.textSecondary)}>
                {recentActivity[0]?.title ?? 'No recent activity yet.'}
              </Text>
            )}
          </DashboardCard>
        );
      case 'role-dashboard':
        return (
          <DashboardCard
            title={roleDashboardTitle}
            icon={Shield}
            accent="#A78BFA"
            expanded={expandedDashboardCardIds.includes('role-dashboard')}
            onPress={() => toggleDashboardCard('role-dashboard')}
            editControls={renderEditControls('role-dashboard')}
            isEditing={isEditingLayout}
            isLocked={normalizedLockedExpandedCardIds.includes('role-dashboard')}
            onToggleLock={() => toggleLockedExpandedCard('role-dashboard')}
          >
            {expandedDashboardCardIds.includes('role-dashboard') ? (
              roleHighlights.map((card) => (
                <View key={card.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3" style={{ marginBottom: 10 }}>
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1 pr-3">
                      <card.icon size={18} color={card.accent} />
                      <Text style={[getThemeBodyStyle(theme, 14), { fontWeight: '600', marginLeft: 10 }]}>{card.title}</Text>
                    </View>
                    <Text style={getThemeHeadingStyle(theme, 18)}>{card.value}</Text>
                  </View>
                  <Text style={[getThemeBodyStyle(theme, 12, theme.textMuted), { marginTop: 6 }]}>{card.note}</Text>
                </View>
              ))
              ) : (
                <Text style={getThemeBodyStyle(theme, 14, theme.textSecondary)}>
                  {roleHighlights[0]?.title
                    ? `${roleDashboardTitle.replace(/\s+Dashboard$/, '')} Overview`
                    : 'Role-specific information available'}
                </Text>
              )}
          </DashboardCard>
        );
      default:
        return null;
    }
  };

  if (showingLeaderboard) return <LeaderboardContent showBackButton onBack={closeLeaderboard} />;

  return (
    <View className="flex-1">
      <LinearGradient colors={theme.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      <ThemeBackdrop />
      <SafeAreaView edges={['top']} className="flex-1">
        <TopStatusBar subtitle={user?.squadron ?? 'Hawks'} />
        <Modal visible={showInstallHelp} transparent animationType="fade" onRequestClose={() => setShowInstallHelp(false)}>
          <View className="flex-1 bg-black/70 justify-center px-6">
            <View className="rounded-3xl border border-white/10 bg-af-navy p-6">
              <Text className="text-white text-xl font-bold">Add to Home Screen</Text>
              <Text className="text-af-silver text-sm mt-3">You are on the correct FitFlight home page now.</Text>
              <Text className="text-af-silver text-sm mt-3">1. Tap Safari&apos;s Share button.</Text>
              <Text className="text-af-silver text-sm mt-1">2. Scroll down and tap Add to Home Screen.</Text>
              <Text className="text-af-silver text-sm mt-1">3. Tap Add.</Text>
              <Text className="text-af-silver text-sm mt-4">
                Adding from this page should create the home screen shortcut with the correct launch path.
              </Text>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowInstallHelp(false);
                }}
                className="mt-5 self-end rounded-full border border-af-accent/40 bg-af-accent/20 px-4 py-2"
              >
                <Text className="text-white font-semibold">Got it</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        <ScrollView
          ref={scrollViewRef}
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={theme.accent} />}
          scrollEventThrottle={16}
          onScroll={() => {
            if (currentTargetId?.startsWith('home-')) refreshCurrentTarget();
          }}
        >
          <PageContainer maxWidth={contentMaxWidth}>
            <Animated.View entering={FadeInDown.delay(100).springify()} className="px-6 pt-4 pb-2">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-4">
                  <Text style={getThemeBodyStyle(theme, 14, theme.textSecondary)}>Welcome back,</Text>
                  <Text style={getThemeHeadingStyle(theme, 30)} className="mt-1">
                    {userName}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setIsEditingLayout((current) => !current)}
                  className="flex-row items-center px-4 py-2 rounded-full"
                  style={getThemeCardStyle(theme, 'alt')}
                >
                  <Pencil size={15} color={theme.textPrimary} />
                  <Text style={[getThemeBodyStyle(theme, 13, theme.textPrimary), { fontWeight: '700', marginLeft: 8 }]}>
                    {isEditingLayout ? 'Done' : 'Edit'}
                  </Text>
                </Pressable>
              </View>
              {isEditingLayout ? (
                <Text style={[getThemeBodyStyle(theme, 12, theme.textSecondary), { marginTop: 10 }]}>
                  Rearrange your dashboard. The updated layout saves locally right away and syncs to FitFlight after you stop moving cards.
                </Text>
              ) : null}
            </Animated.View>

            <TutorialTarget
              id="home-navigation"
              onLayout={(event) => {
                tutorialTargetYRef.current['home-navigation'] = event.nativeEvent.layout.y;
              }}
            >
              <View className="px-6 mt-4">
                <View className="flex-row flex-wrap -mx-1.5">
                  {dashboardDisplayItems.map((item, index) => (
                    <Animated.View
                      key={item.id}
                      entering={FadeInDown.delay(140 + index * 35).springify()}
                      layout={LinearTransition.springify().damping(18).stiffness(180)}
                      className="px-1.5 mb-1.5"
                      style={{
                        width: `${(item.span / dashboardColumns) * 100}%`,
                        minHeight: isEditingLayout ? 172 : 188,
                      }}
                    >
                      {item.id === 'leaderboard' ? (
                        <TutorialTarget
                          id="home-leaderboard"
                          onLayout={(event) => {
                            tutorialTargetYRef.current['home-leaderboard'] = event.nativeEvent.layout.y;
                          }}
                        >
                          {renderCardContent(item.id)}
                        </TutorialTarget>
                      ) : (
                        renderCardContent(item.id)
                      )}
                    </Animated.View>
                  ))}
                </View>
              </View>
            </TutorialTarget>
          </PageContainer>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
