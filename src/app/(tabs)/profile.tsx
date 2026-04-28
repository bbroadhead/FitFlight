import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View, Text, Pressable, RefreshControl, ScrollView, TextInput, Modal, Image, Platform, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { User, Shield, LogOut, LogIn, UserPlus, Trash2, Users, Activity, X, Check, Bell, Crown, Settings, Plus, FileText, Calendar, Building2, AlertTriangle, Upload, Dumbbell, HelpCircle, Mail, ChevronDown, ChevronUp, Pencil, Search, Star, MessageSquare, Trophy, UserCheck } from 'lucide-react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, SlideInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import SmartSlider from '@/components/SmartSlider';
import { useAuthStore, useMemberStore, formatFlightDisplay, type Flight, type Member, type AccountType, type Squadron, type IntegrationService, type WorkoutType, RANK_GROUPS, getDisplayName, canEditAttendance, canManagePTL, canManagePTPrograms, isAdmin, SQUADRONS, ALL_ACHIEVEMENTS, isPFLAccountType, normalizeAccountType } from '@/lib/store';
import { cn } from '@/lib/cn';
import { trackAnalyticsEvent } from '@/lib/googleAnalytics';
import { AchievementCelebration } from '@/components/AchievementCelebration';
import { TrophyCase, CompactTrophyBadges } from '@/components/TrophyCase';
import { PageContainer } from '@/components/PageContainer';
import { ThemeBackdrop } from '@/components/ThemeBackdrop';
import { ThemeChrome } from '@/components/ThemeChrome';
import { TopStatusBar } from '@/components/TopStatusBar';
import { TutorialTarget, useTutorialTour } from '@/contexts/TutorialTourContext';
import { useErrorLogScreenContext } from '@/lib/errorLog';
import { canUseStravaSync, disconnectStrava, getStravaSetupError, mapImportedWorkouts, startStravaConnect, syncStravaWorkouts } from '@/lib/strava';
import { signOutFromSupabase } from '@/lib/supabaseAuth';
import { buildTrophyStats, getRarestEarnedTrophies } from '@/lib/trophies';
import { formatMonthLabel, getAvailableMonthKeys, getMemberEffectiveWorkouts, getMemberMonthSummary, getMonthKey } from '@/lib/monthlyStats';
import { APP_THEMES, useAppTheme } from '@/lib/theme';
import { getThemeBodyStyle, getThemeCardStyle, getThemeControlStyle, getThemeHeadingStyle } from '@/lib/theme';
import {
  fetchAppNotifications,
  fetchApprovedManualWorkouts,
  fetchAttendanceSessions,
  fetchManualWorkoutProofImageMap,
  fetchManualWorkoutSubmissions,
  fetchAdminAuditTrail,
  markAppNotificationRead,
  assignUFPMRole,
  createRosterMember,
  deleteRosterMember,
  ensureMemberRole,
  markManualWorkoutSubmissionRead,
  fetchSupportMessages,
  fetchSupportThreads,
  fetchWeeklyAttendanceExcusals,
  deleteSupportThread,
  markSupportMessagesRead,
  reviewManualWorkoutSubmission,
    resetUserPasswordAsAdmin,
    sendSupportMessage,
  sendAppNotification,
  logAdminAuditAction,
  setAttendanceStatus,
  type AdminAuditAction,
  type AppNotification,
  type ManualWorkoutSubmission,
  type SupportMessage,
  type SupportThreadSummary,
  updateMemberRole,
  updateRosterProfileVisibility,
  updateRosterMember,
} from '@/lib/supabaseData';
import { createOfflineActionId, requestRegisteredSync, runOrQueueOfflineMutation } from '@/lib/appSync';

const FLIGHTS: Flight[] = ['Apex', 'Bomber', 'Cryptid', 'Doom', 'Ewok', 'Foxhound', 'DO', 'ADF', 'DET'];
const OWNER_EMAIL = 'benjamin.broadhead.2@us.af.mil';
const PROJECT_COORDINATOR_EMAIL = 'jacob.de_la_rosa@us.af.mil';
const FITFLIGHT_VERSION = 'v1.0.8';
const DEVELOPER_NAME = 'SSgt Benjamin Broadhead';
const DEVELOPER_TITLE = 'Developer';
const PROJECT_COORDINATOR_NAME = 'SSgt Jacob De La Rosa';
const PROJECT_COORDINATOR_TITLE = 'Project Coordinator';
const DEMO_TROPHY_ID = 'top_3_month';

type SupportContact = {
  key: 'developer' | 'project_coordinator';
  name: string;
  title: string;
  email: string;
  memberId: string | null;
};

function supportContactMatchesThread(
  contact: SupportContact | null | undefined,
  thread: Pick<SupportThreadSummary, 'recipientEmail' | 'recipientName'>
) {
  if (!contact) {
    return false;
  }

  const contactEmail = contact.email.trim().toLowerCase();
  const threadEmail = thread.recipientEmail.trim().toLowerCase();
  const contactName = contact.name.trim().toLowerCase();
  const threadName = thread.recipientName.trim().toLowerCase();

  if (contactEmail && threadEmail && contactEmail !== threadEmail) {
    return false;
  }

  if (contactName && threadName) {
    return contactName === threadName;
  }

  return contactEmail === threadEmail;
}

function getSupportContactKeyForThread(
  thread: Pick<SupportThreadSummary, 'recipientEmail' | 'recipientName'>,
  contacts: SupportContact[]
): SupportContact['key'] {
  return contacts.find((contact) => supportContactMatchesThread(contact, thread))?.key ?? 'developer';
}

function formatAuditActionLabel(actionType: string) {
  return actionType
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatAuditDetailsPreview(details: Record<string, unknown>) {
  const entries = Object.entries(details).filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (entries.length === 0) {
    return '';
  }

  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${String(value)}`)
    .join(' · ');
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
const buildLegacyRosterId = (member: { rank: string; firstName: string; lastName: string; flight: Flight }) =>
  `roster-${slugify(`${member.rank}-${member.lastName}-${member.firstName}-${member.flight}`)}`;
type SupportNotificationItem = {
  id: string;
  title: string;
  message: string;
  unread: boolean;
  threadId: string;
  kind: 'support';
};

function SettingsToggle({
  value,
  disabled,
  onPress,
}: {
  value: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        width: 44,
        height: 26,
        borderRadius: 999,
        backgroundColor: value ? '#4A90D9' : '#334155',
        paddingHorizontal: 3,
        justifyContent: 'center',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          backgroundColor: '#FFFFFF',
          alignSelf: value ? 'flex-end' : 'flex-start',
        }}
      />
    </Pressable>
  );
}

type ManualWorkoutNotificationItem = {
  id: string;
  title: string;
  message: string;
  unread: boolean;
  submissionId: string;
  kind: 'manual_workout';
  isReview: boolean;
};

type BackendNotificationItem = AppNotification & {
  unread: boolean;
};

function RunningIcon({ size, color }: { size: number; color: string }) {
  return <MaterialCommunityIcons name="run-fast" size={size} color={color} />;
}

function getScheduledSessionKindLabel(kind: 'pt' | 'pfra_mock' | 'pfra_diagnostic' | 'pfra_official') {
  switch (kind) {
    case 'pfra_mock':
      return 'PFRA Mock';
    case 'pfra_diagnostic':
      return 'PFRA Diagnostic';
    case 'pfra_official':
      return 'PFRA Official';
    default:
      return 'Normal PT';
  }
}

function getScheduledSessionScopeLabel(session: { scope: 'squadron' | 'flight' | 'personal'; flights: Flight[] }) {
  if (session.scope === 'personal') {
    return 'Personal';
  }
  if (session.scope === 'squadron') {
    return 'Squadron PT';
  }
  return session.flights.join(', ');
}

function isVisibleScheduledSession(date: string, time: string) {
  const startTime = new Date(`${date}T${time}:00`).getTime();
  return startTime + 60 * 60 * 1000 >= Date.now();
}

const getWebSafeFadeInDown = (delay: number) =>
  Platform.OS === 'web' ? undefined : FadeInDown.delay(delay).springify();

const getWebSafeFadeIn = (duration: number) =>
  Platform.OS === 'web' ? undefined : FadeIn.duration(duration);

const getWebSafeSlideInDown = (duration: number) =>
  Platform.OS === 'web' ? undefined : SlideInDown.duration(duration);

function getWorkoutDisplayTitle(type: WorkoutType) {
  switch (type) {
    case 'Running':
      return 'Run';
    case 'Walking':
      return 'Walk';
    case 'Cycling':
      return 'Ride';
    case 'Swimming':
      return 'Swim';
    default:
      return type;
  }
}

export default function ProfileScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { currentTargetId, refreshCurrentTarget } = useTutorialTour();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const tutorialTargetYRef = useRef<Record<string, number>>({});
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const accessToken = useAuthStore(s => s.accessToken);
  const appTheme = useAuthStore(s => s.appTheme);
  const setAppTheme = useAuthStore(s => s.setAppTheme);
  const members = useMemberStore(s => s.members);
  const addMember = useMemberStore(s => s.addMember);
  const removeMember = useMemberStore(s => s.removeMember);
  const importWorkouts = useMemberStore(s => s.importWorkouts);
  const syncPTSessions = useMemberStore(s => s.syncPTSessions);
  const ptSessions = useMemberStore(s => s.ptSessions);
  const scheduledSessions = useMemberStore(s => s.scheduledSessions);
  const syncApprovedManualWorkouts = useMemberStore(s => s.syncApprovedManualWorkouts);
  const approvePTL = useMemberStore(s => s.approvePTL);
  const rejectPTL = useMemberStore(s => s.rejectPTL);
  const revokePTL = useMemberStore(s => s.revokePTL);
  const setUFPM = useMemberStore(s => s.setUFPM);
  const themePalette = useAppTheme();
  const modalBlurIntensity = 30;
  const { width } = useWindowDimensions();
  const contentMaxWidth = width >= 1440 ? 1280 : width >= 1180 ? 1180 : 1024;

  const [showAddModal, setShowAddModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAuditTrailModal, setShowAuditTrailModal] = useState(false);
  const [showChangeRankModal, setShowChangeRankModal] = useState(false);
  const [showPTLRequestModal, setShowPTLRequestModal] = useState(false);
  const [showChangeSquadronModal, setShowChangeSquadronModal] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [showDeveloperContact, setShowDeveloperContact] = useState(false);
  const [showDeveloperMessageModal, setShowDeveloperMessageModal] = useState(false);
  const [showSupportInboxModal, setShowSupportInboxModal] = useState(false);
  const [activeSupportContactKey, setActiveSupportContactKey] = useState<SupportContact['key']>('developer');
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showUFPMModal, setShowUFPMModal] = useState(false);
  const [memberPendingDeleteId, setMemberPendingDeleteId] = useState<string | null>(null);
  const [showUFPMConfirmModal, setShowUFPMConfirmModal] = useState(false);
  const [showResetUserPasswordModal, setShowResetUserPasswordModal] = useState(false);
  const [showTrophyCase, setShowTrophyCase] = useState(false);
  const [showWorkoutReviewModal, setShowWorkoutReviewModal] = useState(false);
  const [showWorkoutHistoryModal, setShowWorkoutHistoryModal] = useState(false);
  const [showPFRAHistoryModal, setShowPFRAHistoryModal] = useState(false);
  const [showUpcomingPTSessionsModal, setShowUpcomingPTSessionsModal] = useState(false);
  const [expandedWorkoutImageUri, setExpandedWorkoutImageUri] = useState<string | null>(null);
  const [manualWorkoutProofMap, setManualWorkoutProofMap] = useState<Record<string, string>>({});
  const [selectedSummaryMonth, setSelectedSummaryMonth] = useState(getMonthKey());
  const [isExcusedThisWeek, setIsExcusedThisWeek] = useState(false);
  const [integrationToDisconnect, setIntegrationToDisconnect] = useState<IntegrationService | null>(null);
  const [stravaBusyAction, setStravaBusyAction] = useState<'connect' | 'sync' | 'disconnect' | null>(null);
  const [stravaMessage, setStravaMessage] = useState<string | null>(null);
  const [selectedSquadron, setSelectedSquadron] = useState<Squadron | null>(null);
  const [selectedRank, setSelectedRank] = useState(user?.rank ?? 'SSgt');
  const [selectedPTLRequest, setSelectedPTLRequest] = useState<string | null>(null);
  const [newMemberFirstName, setNewMemberFirstName] = useState('');
  const [newMemberLastName, setNewMemberLastName] = useState('');
  const [newMemberRank, setNewMemberRank] = useState('A1C');
  const [newMemberFlight, setNewMemberFlight] = useState<Flight>('Apex');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberSquadronLeadership, setNewMemberSquadronLeadership] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberActionError, setMemberActionError] = useState('');
  const [pflActionState, setPflActionState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const pflActionResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [ufpmSearchQuery, setUFPMSearchQuery] = useState('');
  const [selectedUFPMMemberId, setSelectedUFPMMemberId] = useState<string | null>(null);
  const [resetPasswordSearchQuery, setResetPasswordSearchQuery] = useState('');
  const [selectedResetPasswordMemberId, setSelectedResetPasswordMemberId] = useState<string | null>(null);
  const [adminResetPasswordValue, setAdminResetPasswordValue] = useState('');
  const [adminResetPasswordConfirm, setAdminResetPasswordConfirm] = useState('');
  const [adminResetPasswordError, setAdminResetPasswordError] = useState('');
  const [isAdminResettingPassword, setIsAdminResettingPassword] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);
  const [supportThreads, setSupportThreads] = useState<SupportThreadSummary[]>([]);
  const [activeSupportThreadId, setActiveSupportThreadId] = useState<string | null>(null);
  const [activeSupportMessages, setActiveSupportMessages] = useState<SupportMessage[]>([]);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportBody, setSupportBody] = useState('');
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportMessagesLoading, setSupportMessagesLoading] = useState(false);
  const [supportSending, setSupportSending] = useState(false);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [manualWorkoutSubmissions, setManualWorkoutSubmissions] = useState<ManualWorkoutSubmission[]>([]);
  const [manualWorkoutReviewQueue, setManualWorkoutReviewQueue] = useState<ManualWorkoutSubmission[]>([]);
  const [activeWorkoutSubmission, setActiveWorkoutSubmission] = useState<ManualWorkoutSubmission | null>(null);
  const [manualWorkoutReviewNote, setManualWorkoutReviewNote] = useState('');
  const [manualWorkoutError, setManualWorkoutError] = useState<string | null>(null);
  const [manualWorkoutLoading, setManualWorkoutLoading] = useState(false);
  const [manualWorkoutSubmitting, setManualWorkoutSubmitting] = useState(false);
  const [appNotifications, setAppNotifications] = useState<BackendNotificationItem[]>([]);
  const [appNotificationsLoading, setAppNotificationsLoading] = useState(false);
  const [dismissedNotificationKeys, setDismissedNotificationKeys] = useState<string[]>([]);
  const [showLeaderboardHistoryModal, setShowLeaderboardHistoryModal] = useState(false);
  const [expandedUpcomingSessionIds, setExpandedUpcomingSessionIds] = useState<string[]>([]);
  const [demoTrophyEarnedPreview, setDemoTrophyEarnedPreview] = useState(false);
  const [showDemoTrophyCelebration, setShowDemoTrophyCelebration] = useState(false);
  const [isUpdatingProfileSettings, setIsUpdatingProfileSettings] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [auditTrailEntries, setAuditTrailEntries] = useState<AdminAuditAction[]>([]);
  const [auditTrailLoading, setAuditTrailLoading] = useState(false);
  const [auditTrailError, setAuditTrailError] = useState<string | null>(null);
  const profileOverlayLabel = useMemo(() => {
    if (showSettingsModal) return 'Settings';
    if (showNotificationsModal) return 'Notifications';
    if (showManageModal) return 'Manage Members';
    if (showAddModal) return 'Add Member';
    if (showUFPMModal) return 'Select UFPM';
    if (showSupportInboxModal) return 'Support Inbox';
    if (showDeveloperMessageModal || showDeveloperContact) return 'Message the FitFlight Team';
    if (showWorkoutReviewModal) return 'Manual Workout Review';
    if (showWorkoutHistoryModal) return 'Workout History';
    if (showPFRAHistoryModal) return 'PFRA History';
    if (showUpcomingPTSessionsModal) return 'Upcoming PT Sessions';
    if (showLeaderboardHistoryModal) return 'Leaderboard History';
    if (showAuditTrailModal) return 'Admin Audit Trail';
    if (showResetUserPasswordModal) return 'Reset User Password';
    if (showChangeRankModal) return 'Change My Rank';
    if (showChangeSquadronModal) return 'Change My Squadron';
    if (showPTLRequestModal) return 'Request PFL';
    if (showInstallModal) return 'Install to Home Screen';
    if (showUFPMConfirmModal) return 'Confirm UFPM Change';
    if (showDisconnectModal) return 'Disconnect App';
    return null;
  }, [
    showAddModal,
    showAuditTrailModal,
    showChangeRankModal,
    showChangeSquadronModal,
    showDeveloperContact,
    showDeveloperMessageModal,
    showDisconnectModal,
    showInstallModal,
    showLeaderboardHistoryModal,
    showManageModal,
    showNotificationsModal,
    showPFRAHistoryModal,
    showPTLRequestModal,
    showResetUserPasswordModal,
    showSettingsModal,
    showSupportInboxModal,
    showUFPMConfirmModal,
    showUFPMModal,
    showUpcomingPTSessionsModal,
    showWorkoutHistoryModal,
    showWorkoutReviewModal,
  ]);
  useErrorLogScreenContext('Account', profileOverlayLabel);

  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const updateUser = useAuthStore(s => s.updateUser);
  const updateMember = useMemberStore(s => s.updateMember);
  const resolveMemberForUser = (memberUser: typeof user) => {
    if (!memberUser) {
      return null;
    }

    const normalizedEmail = memberUser.email?.trim().toLowerCase() ?? '';
    const normalizedFirstName = memberUser.firstName.trim().toLowerCase();
    const normalizedLastName = memberUser.lastName.trim().toLowerCase();

    return (
      members.find((member) => member.id === memberUser.id) ??
      members.find(
        (member) =>
          normalizedEmail.length > 0 &&
          member.email?.trim().toLowerCase() === normalizedEmail
      ) ??
      members.find(
        (member) =>
          member.firstName.trim().toLowerCase() === normalizedFirstName &&
          member.lastName.trim().toLowerCase() === normalizedLastName
      ) ??
      null
    );
  };
  const currentMember = resolveMemberForUser(user);
  const profileVisibilitySettings = {
    workoutHistory: currentMember?.showWorkoutHistoryOnProfile ?? user?.showWorkoutHistoryOnProfile ?? true,
    workoutUploads: currentMember?.showWorkoutUploadsOnProfile ?? user?.showWorkoutUploadsOnProfile ?? true,
    pfraRecords: currentMember?.showPFRARecordsOnProfile ?? user?.showPFRARecordsOnProfile ?? true,
  };
  const projectCoordinatorMember = members.find(
    (member) =>
      member.firstName.trim().toLowerCase() === 'jacob' &&
      member.lastName.trim().toLowerCase() === 'de la rosa'
  ) ?? null;
  const projectCoordinatorEmail =
    projectCoordinatorMember?.email ??
    (user?.firstName.trim().toLowerCase() === 'jacob' && user?.lastName.trim().toLowerCase() === 'de la rosa'
      ? user.email
      : PROJECT_COORDINATOR_EMAIL);
  const supportContacts = useMemo<SupportContact[]>(
    () => [
      {
        key: 'developer' as const,
        name: DEVELOPER_NAME,
        title: DEVELOPER_TITLE,
        email: OWNER_EMAIL,
        memberId: members.find((member) => member.email.trim().toLowerCase() === OWNER_EMAIL)?.id ?? null,
      },
      {
        key: 'project_coordinator' as const,
        name: PROJECT_COORDINATOR_NAME,
        title: PROJECT_COORDINATOR_TITLE,
        email: projectCoordinatorEmail,
        memberId: projectCoordinatorMember?.id ?? null,
      },
    ].filter((contact) => Boolean(contact.email.trim())),
    [members, projectCoordinatorEmail, projectCoordinatorMember?.id]
  );

  const userAccountType = user?.accountType ?? 'standard';
  const canManage = canManagePTL(userAccountType);
  const hasAdminAccess = isAdmin(userAccountType);
  const canViewAppUsageAnalytics =
    userAccountType === 'fitflight_creator' ||
    userAccountType === 'ufpm' ||
    userAccountType === 'demo' ||
    userAccountType === 'squadron_leadership';
  const canManageMembers = canManagePTPrograms(userAccountType);
  const canReviewManualWorkouts = canManagePTPrograms(userAccountType);
  const canResetUserPasswords = userAccountType === 'fitflight_creator' || userAccountType === 'ufpm' || userAccountType === 'demo';
  const isOwnerUser = userAccountType === 'fitflight_creator' || user?.email?.toLowerCase() === OWNER_EMAIL;
  const canViewAdminAuditTrail = isOwnerUser || userAccountType === 'ufpm';
  const isOwnerReviewer = user?.email?.toLowerCase() === OWNER_EMAIL;
  const canViewSupportInbox = user?.email
    ? supportContacts.some((contact) => contact.email.toLowerCase() === user.email.toLowerCase())
    : false;

  useEffect(() => {
    return () => {
      if (pflActionResetRef.current) {
        clearTimeout(pflActionResetRef.current);
      }
    };
  }, []);

  const setTransientPflActionState = useCallback((state: 'saved' | 'error') => {
    if (pflActionResetRef.current) {
      clearTimeout(pflActionResetRef.current);
    }
    setPflActionState(state);
    pflActionResetRef.current = setTimeout(() => {
      setPflActionState('idle');
      pflActionResetRef.current = null;
    }, 2200);
  }, []);

  const unreadNotifications = appNotifications.filter(
    (notification) =>
      !notification.readAt && !dismissedNotificationKeys.includes(`backend-${notification.id}`)
  );
  const ptlRequests = appNotifications.filter((notification) => notification.type === 'ptl_request' && !notification.readAt);
  const currentUFPM = members.find((member) => member.accountType === 'ufpm') ?? null;
  const normalizedMemberSearch = memberSearchQuery.trim().toLowerCase();
  const normalizedUFPMSearch = ufpmSearchQuery.trim().toLowerCase();
  const normalizedResetPasswordSearch = resetPasswordSearchQuery.trim().toLowerCase();
  const memberSquadron = user?.squadron ?? 'Hawks';
  const logAdminAction = async (params: {
    actionType: string;
    targetMember?: Member | null;
    details?: Record<string, unknown>;
  }) => {
    if (!user || !accessToken || !hasAdminAccess) {
      return;
    }

    await logAdminAuditAction({
      actorMemberId: user.id,
      actorEmail: user.email,
      actorName: getDisplayName(user),
      actorRole: user.accountType,
      actionType: params.actionType,
      targetMemberId: params.targetMember?.id ?? null,
      targetEmail: params.targetMember?.email ?? null,
      targetName: params.targetMember ? getDisplayName(params.targetMember) : null,
      squadron: params.targetMember?.squadron ?? user.squadron,
      details: params.details,
      accessToken,
    }).catch(() => undefined);
  };
  const getAttendanceAliases = (memberId: string) => {
    const member = members.find((entry) => entry.id === memberId);
    if (!member) {
      return new Set([memberId]);
    }

    return new Set<string>([member.id, buildLegacyRosterId(member)]);
  };

  useEffect(() => {
    if (!currentTargetId || !currentTargetId.startsWith('account-')) {
      return;
    }

    const scrollAnchorId =
      currentTargetId === 'account-password-reset' || currentTargetId === 'account-analytics'
        ? 'account-admin'
        : currentTargetId;
    const targetY = tutorialTargetYRef.current[scrollAnchorId];
    if (typeof targetY !== 'number') {
      return;
    }

    const timeoutId = setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: Math.max(targetY - 120, 0), animated: true });
      setTimeout(() => refreshCurrentTarget(), 220);
    }, 180);

    return () => clearTimeout(timeoutId);
  }, [currentTargetId, refreshCurrentTarget]);
  const isWeb = Platform.OS === 'web';
  const isStandalonePwa = isWeb && typeof window !== 'undefined'
    ? window.matchMedia?.('(display-mode: standalone)')?.matches || ((window.navigator as Navigator & { standalone?: boolean }).standalone ?? false)
    : false;
  const userAgent = isWeb && typeof window !== 'undefined' ? window.navigator.userAgent.toLowerCase() : '';
  const isIos = /iphone|ipad|ipod/.test(userAgent);
  const isAndroid = /android/.test(userAgent);
  const isDesktop = isWeb && !isIos && !isAndroid;
  const isSafari = isIos && /safari/.test(userAgent) && !/crios|fxios|edgios/.test(userAgent);
  const activeSupportContact =
    supportContacts.find((contact) => contact.key === activeSupportContactKey) ??
    supportContacts[0] ??
    null;
  const supportThread = !canViewSupportInbox
      ? supportThreads.find(
          (thread) =>
            thread.requesterEmail.toLowerCase() === user?.email?.toLowerCase() &&
            supportContactMatchesThread(activeSupportContact, thread)
        )
      : null;
  const developerSupportThread = supportThreads.find(
      (thread) =>
        thread.requesterEmail.toLowerCase() === user?.email?.toLowerCase() &&
        supportContactMatchesThread(supportContacts.find((contact) => contact.key === 'developer') ?? null, thread)
    ) ?? null;
  const coordinatorSupportThread =
    projectCoordinatorEmail
        ? supportThreads.find(
            (thread) =>
              thread.requesterEmail.toLowerCase() === user?.email?.toLowerCase() &&
              supportContactMatchesThread(supportContacts.find((contact) => contact.key === 'project_coordinator') ?? null, thread)
          ) ?? null
        : null;
  const unreadSupportCount = useMemo(
    () => supportThreads.reduce(
      (total, thread) => total + (canViewSupportInbox ? thread.unreadForOwner : thread.unreadForRequester),
      0
    ),
    [canViewSupportInbox, supportThreads]
  );
  const unreadManualWorkoutCount = useMemo(
    () => (
      manualWorkoutSubmissions.filter((submission) => submission.status !== 'pending' && !submission.requesterRead).length +
      manualWorkoutReviewQueue.length
    ),
    [manualWorkoutReviewQueue.length, manualWorkoutSubmissions]
  );
  const upcomingPTSessions = useMemo(() => {
    if (!user) {
      return [];
    }

    return scheduledSessions
      .filter((session) => {
        if ((session.squadron ?? 'Hawks') !== memberSquadron) {
          return false;
        }

        if (!isVisibleScheduledSession(session.date, session.time)) {
          return false;
        }

        if (session.scope === 'personal') {
          return session.createdBy === user.id;
        }

        if (session.scope === 'squadron') {
          return true;
        }

        return session.flights.includes(user.flight);
      })
      .sort((left, right) => `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`));
  }, [memberSquadron, scheduledSessions, user]);
  const filteredMembers = useMemo(() => {
    const sortedMembers = members
      .filter((member) => member.squadron === memberSquadron)
      .sort((left, right) => {
      const leftName = `${left.lastName} ${left.firstName}`;
      const rightName = `${right.lastName} ${right.firstName}`;
      return leftName.localeCompare(rightName);
    });

    if (!normalizedMemberSearch) {
      return sortedMembers;
    }

    return sortedMembers.filter((member) => {
      const haystack = `${member.rank} ${member.firstName} ${member.lastName} ${member.flight} ${member.email}`.toLowerCase();
      return haystack.includes(normalizedMemberSearch);
    });
  }, [memberSquadron, members, normalizedMemberSearch]);

  const memberPendingDelete = useMemo(
    () => members.find((member) => member.id === memberPendingDeleteId) ?? null,
    [memberPendingDeleteId, members]
  );
  const editingMember = useMemo(
    () => members.find((member) => member.id === editingMemberId) ?? null,
    [editingMemberId, members]
  );
  const resetPasswordCandidates = useMemo(() => {
    const inSquadron = members
      .filter((member) => member.squadron === memberSquadron)
      .sort((left, right) => `${left.lastName} ${left.firstName}`.localeCompare(`${right.lastName} ${right.firstName}`));

    if (!normalizedResetPasswordSearch) {
      return inSquadron;
    }

    return inSquadron.filter((member) => {
      const haystack = `${member.rank} ${member.firstName} ${member.lastName} ${member.email}`.toLowerCase();
      return haystack.includes(normalizedResetPasswordSearch);
    });
  }, [memberSquadron, members, normalizedResetPasswordSearch]);

  const selectedResetPasswordMember = useMemo(
    () => members.find((member) => member.id === selectedResetPasswordMemberId) ?? null,
    [members, selectedResetPasswordMemberId]
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const loadSupportThreads = async () => {
    if (!user?.email || !accessToken) {
      setSupportThreads([]);
      return;
    }

    setSupportLoading(true);
    try {
      const nextThreads = await fetchSupportThreads({
        email: user.email,
        isStaff: canViewSupportInbox,
        accessToken,
      });

      setSupportThreads(nextThreads);

      if (!canViewSupportInbox) {
          const ownThread =
            nextThreads.find(
              (thread) =>
                thread.requesterEmail.toLowerCase() === user.email.toLowerCase() &&
                supportContactMatchesThread(activeSupportContact, thread)
            ) ?? null;
        setActiveSupportThreadId(ownThread?.id ?? null);
        if (ownThread && !supportSubject.trim()) {
          setSupportSubject(ownThread.subject);
        } else if (!ownThread) {
          setActiveSupportMessages([]);
        }
      } else if (nextThreads.length > 0) {
        setActiveSupportThreadId((current) => current ?? nextThreads[0].id);
      }
    } catch (error) {
      setSupportError(error instanceof Error ? error.message : 'Unable to load FitFlight team messages.');
    } finally {
      setSupportLoading(false);
    }
  };

  const loadSupportConversation = async (threadId: string, options?: { markRead?: boolean }) => {
    if (!accessToken || !threadId) {
      return;
    }

    setSupportMessagesLoading(true);
    setSupportError(null);

    try {
      if (options?.markRead) {
        await markSupportMessagesRead({
          threadId,
          viewer: canViewSupportInbox ? 'owner' : 'requester',
          accessToken,
        });
      }

      const messages = await fetchSupportMessages(threadId, accessToken);
      setActiveSupportThreadId(threadId);
      setActiveSupportMessages(messages);
      setSupportThreads((currentThreads) => currentThreads.map((thread) => (
        thread.id === threadId
          ? {
              ...thread,
              unreadForOwner: canViewSupportInbox ? 0 : thread.unreadForOwner,
              unreadForRequester: canViewSupportInbox ? thread.unreadForRequester : 0,
            }
          : thread
      )));
    } catch (error) {
      setSupportError(error instanceof Error ? error.message : 'Unable to load this conversation.');
    } finally {
      setSupportMessagesLoading(false);
    }
  };

  const loadManualWorkoutSubmissions = async () => {
    if (!user?.id || !accessToken) {
      setManualWorkoutSubmissions([]);
      setManualWorkoutReviewQueue([]);
      return;
    }

    setManualWorkoutLoading(true);
    try {
      const nextData = await fetchManualWorkoutSubmissions({
        memberId: user.id,
        memberEmail: user.email,
        squadron: memberSquadron,
        canReview: canReviewManualWorkouts,
        accessToken,
      });
      setManualWorkoutSubmissions(nextData.mine);
      setManualWorkoutReviewQueue(nextData.reviewQueue);
    } catch (error) {
      setManualWorkoutError(error instanceof Error ? error.message : 'Unable to load manual workout approvals.');
    } finally {
      setManualWorkoutLoading(false);
    }
  };

  const loadAppNotifications = async () => {
    if (!user?.email || !accessToken) {
      setAppNotifications([]);
      return;
    }

    setAppNotificationsLoading(true);
    try {
      const nextNotifications = await fetchAppNotifications({
        recipientEmail: user.email,
        accessToken,
      });
      setAppNotifications(
        nextNotifications.map((notification) => ({
          ...notification,
          unread: !notification.readAt,
        }))
      );
    } catch {
      setAppNotifications([]);
    } finally {
      setAppNotificationsLoading(false);
    }
  };

  const loadAuditTrail = async () => {
    if (!canViewAdminAuditTrail || !accessToken) {
      setAuditTrailEntries([]);
      return;
    }

    setAuditTrailLoading(true);
    setAuditTrailError(null);
    try {
      const entries = await fetchAdminAuditTrail(accessToken, { limit: 200 });
      setAuditTrailEntries(entries);
    } catch (error) {
      setAuditTrailError(error instanceof Error ? error.message : 'Unable to load the admin audit trail.');
    } finally {
      setAuditTrailLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await requestRegisteredSync('global');
      const refreshTasks: Promise<unknown>[] = [
        loadSupportThreads(),
        loadManualWorkoutSubmissions(),
        loadAppNotifications(),
      ];
      if (showAuditTrailModal && canViewAdminAuditTrail) {
        refreshTasks.push(loadAuditTrail());
      }
      await Promise.all(refreshTasks);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!user?.email || !accessToken) {
      setSupportThreads([]);
      setActiveSupportMessages([]);
      setActiveSupportThreadId(null);
      return;
    }

    if (!isFocused) {
      return;
    }

    void loadSupportThreads();

    const pollId = setInterval(() => {
      void loadSupportThreads();
    }, 90000);

    return () => clearInterval(pollId);
  }, [accessToken, activeSupportContact, canViewSupportInbox, isFocused, user?.email]);

  useEffect(() => {
    if (!user?.id || !accessToken) {
      setManualWorkoutSubmissions([]);
      setManualWorkoutReviewQueue([]);
      return;
    }

    if (!isFocused) {
      return;
    }

    void loadManualWorkoutSubmissions();

    const pollId = setInterval(() => {
      void loadManualWorkoutSubmissions();
    }, 60000);

    return () => clearInterval(pollId);
  }, [accessToken, canReviewManualWorkouts, isFocused, memberSquadron, user?.id]);

  useEffect(() => {
    if (!user?.email || !accessToken) {
      setAppNotifications([]);
      return;
    }

    if (!isFocused) {
      return;
    }

    void loadAppNotifications();

    const pollId = setInterval(() => {
      void loadAppNotifications();
    }, 60000);

    return () => clearInterval(pollId);
  }, [accessToken, isFocused, user?.email]);

  useEffect(() => {
    if (!showAuditTrailModal || !canViewAdminAuditTrail || !accessToken) {
      return;
    }

    void loadAuditTrail();
  }, [accessToken, canViewAdminAuditTrail, showAuditTrailModal]);

  useEffect(() => {
    if (!activeSupportThreadId || !showDeveloperMessageModal && !showSupportInboxModal) {
      return;
    }

    void loadSupportConversation(activeSupportThreadId, { markRead: true });
  }, [activeSupportThreadId, showDeveloperMessageModal, showSupportInboxModal]);

  const ufpmCandidates = useMemo(() => {
    const candidates = members
      .filter((member) => member.squadron === memberSquadron && member.accountType !== 'fitflight_creator')
      .sort((left, right) => `${left.lastName} ${left.firstName}`.localeCompare(`${right.lastName} ${right.firstName}`));

    if (!normalizedUFPMSearch) {
      return candidates;
    }

    return candidates.filter((member) => {
      const haystack = `${member.rank} ${member.firstName} ${member.lastName} ${member.flight} ${member.email}`.toLowerCase();
      return haystack.includes(normalizedUFPMSearch);
    });
  }, [memberSquadron, members, normalizedUFPMSearch]);

  const handleLogout = () => {
    const run = async () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (accessToken) {
        try {
          await signOutFromSupabase(accessToken);
        } catch {
          // Continue clearing local session even if remote logout fails.
        }
      }
      logout();
      router.replace('/login');
    };

    void run();
  };

  const handleSaveMember = () => {
    const run = async () => {
      if (!newMemberFirstName.trim() || !newMemberLastName.trim()) return;
      setMemberActionError('');

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const previousMember = editingMemberId
        ? members.find((member) => member.id === editingMemberId)
        : null;

      if (!accessToken) {
        setMemberActionError('You must be signed in to sync roster changes to Supabase.');
        return;
      }

      const newMember: Member = {
        id: editingMemberId ?? Date.now().toString(),
        rank: newMemberRank,
        firstName: newMemberFirstName.trim(),
        lastName: newMemberLastName.trim(),
        flight: newMemberFlight,
        squadron: previousMember?.squadron ?? 'Hawks',
        accountType:
          previousMember?.accountType === 'fitflight_creator'
            ? 'fitflight_creator'
            : previousMember?.accountType === 'ufpm'
              ? 'ufpm'
              : newMemberFlight === 'DO'
                ? 'squadron_leadership'
              : newMemberSquadronLeadership
                ? 'squadron_leadership'
                : previousMember?.accountType === 'squadron_leadership'
                  ? 'standard'
                  : normalizeAccountType(previousMember?.accountType ?? 'standard'),
        email: (newMemberEmail || `${newMemberLastName.toLowerCase()}.${newMemberFirstName.toLowerCase()}@us.af.mil`).toLowerCase(),
        exerciseMinutes: previousMember?.exerciseMinutes ?? 0,
        distanceRun: previousMember?.distanceRun ?? 0,
        connectedApps: previousMember?.connectedApps ?? [],
        fitnessAssessments: previousMember?.fitnessAssessments ?? [],
        workouts: previousMember?.workouts ?? [],
        achievements: previousMember?.achievements ?? [],
        requiredPTSessionsPerWeek: previousMember?.requiredPTSessionsPerWeek ?? 5,
        isVerified: previousMember?.isVerified ?? false,
        ptlPendingApproval: previousMember?.ptlPendingApproval ?? false,
        monthlyPlacements: previousMember?.monthlyPlacements ?? [],
        leaderboardHistory: previousMember?.leaderboardHistory ?? [],
        trophyCount: previousMember?.trophyCount ?? 0,
        hasSeenTutorial: previousMember?.hasSeenTutorial ?? false,
        profilePicture: previousMember?.profilePicture,
      };

      if (editingMemberId) {
        if (!previousMember) {
          setMemberActionError('Unable to find that member to update.');
          return;
        }

        await updateRosterMember(previousMember, newMember, accessToken);
        if (previousMember.email.toLowerCase() !== newMember.email.toLowerCase()) {
          await ensureMemberRole(newMember.email, newMember.accountType, accessToken).catch(() => undefined);
        }
        await updateMemberRole(newMember.email, newMember.accountType, accessToken).catch(() => undefined);

        updateMember(editingMemberId, newMember);
        await logAdminAction({
          actionType: 'update_member',
          targetMember: newMember,
          details: {
              previousEmail: previousMember.email,
              nextEmail: newMember.email,
              flight: newMember.flight,
              accountType: newMember.accountType,
          },
        });
      } else {
        await createRosterMember(newMember, accessToken);
        await ensureMemberRole(newMember.email, newMember.accountType, accessToken).catch(() => undefined);
        await updateMemberRole(newMember.email, newMember.accountType, accessToken).catch(() => undefined);

        addMember(newMember);
        await logAdminAction({
          actionType: 'create_member',
          targetMember: newMember,
          details: {
            flight: newMember.flight,
            accountType: newMember.accountType,
          },
        });
      }

      setShowAddModal(false);
      resetForm();
    };

    run().catch((error) => {
      setMemberActionError(error instanceof Error ? error.message : 'Unable to save member.');
    });
  };

  const handleRemoveMember = (id: string) => {
    const run = async () => {
      const memberToRemove = members.find((member) => member.id === id);
      if (!memberToRemove) {
        return;
      }

      if (!accessToken) {
        setMemberActionError('You must be signed in to sync roster changes to Supabase.');
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setMemberActionError('');

      await deleteRosterMember(memberToRemove, accessToken);

      removeMember(id);
      await logAdminAction({
        actionType: 'delete_member',
        targetMember: memberToRemove,
      });
    };

    run().catch((error) => {
      setMemberActionError(error instanceof Error ? error.message : 'Unable to remove member.');
    });
  };

  const confirmRemoveMember = (memberId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMemberPendingDeleteId(memberId);
  };

  const closeRemoveMemberConfirmation = () => {
    setMemberPendingDeleteId(null);
  };

  const openResetUserPasswordModal = () => {
    setResetPasswordSearchQuery('');
    setSelectedResetPasswordMemberId(null);
    setAdminResetPasswordValue('');
    setAdminResetPasswordConfirm('');
    setAdminResetPasswordError('');
    setShowResetUserPasswordModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const closeResetUserPasswordModal = () => {
    setShowResetUserPasswordModal(false);
    setAdminResetPasswordError('');
    setAdminResetPasswordValue('');
    setAdminResetPasswordConfirm('');
    setSelectedResetPasswordMemberId(null);
    setResetPasswordSearchQuery('');
  };

  const handleAdminResetUserPassword = () => {
    const run = async () => {
      if (!canResetUserPasswords) {
        setAdminResetPasswordError('Only Owner, UFPM, and Demo can reset user passwords.');
        return;
      }

      if (!accessToken) {
        setAdminResetPasswordError('You must be signed in to reset a user password.');
        return;
      }

      if (!selectedResetPasswordMember) {
        setAdminResetPasswordError('Select a member first.');
        return;
      }

      if (adminResetPasswordValue.length < 8) {
        setAdminResetPasswordError('New password must be at least 8 characters long.');
        return;
      }

      if (adminResetPasswordValue !== adminResetPasswordConfirm) {
        setAdminResetPasswordError('Passwords do not match.');
        return;
      }

      setIsAdminResettingPassword(true);
      setAdminResetPasswordError('');

      try {
        await resetUserPasswordAsAdmin({
          targetEmail: selectedResetPasswordMember.email,
          newPassword: adminResetPasswordValue,
          accessToken,
        });

        await logAdminAction({
          actionType: 'reset_user_password',
          targetMember: selectedResetPasswordMember,
        });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        closeResetUserPasswordModal();
      } catch (error) {
        setAdminResetPasswordError(error instanceof Error ? error.message : 'Unable to reset user password.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setIsAdminResettingPassword(false);
      }
    };

    void run();
  };

  const resetForm = () => {
    if (pflActionResetRef.current) {
      clearTimeout(pflActionResetRef.current);
      pflActionResetRef.current = null;
    }
    setNewMemberFirstName('');
    setNewMemberLastName('');
    setNewMemberRank('A1C');
    setNewMemberFlight('Apex');
    setNewMemberEmail('');
    setNewMemberSquadronLeadership(false);
    setEditingMemberId(null);
    setMemberActionError('');
    setPflActionState('idle');
  };

  const openAddMemberModal = () => {
    resetForm();
    setShowManageModal(false);
    setShowAddModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openEditMemberModal = (member: Member) => {
    if (pflActionResetRef.current) {
      clearTimeout(pflActionResetRef.current);
      pflActionResetRef.current = null;
    }
    setShowManageModal(false);
    setEditingMemberId(member.id);
    setNewMemberFirstName(member.firstName);
    setNewMemberLastName(member.lastName);
    setNewMemberRank(member.rank);
    setNewMemberFlight(member.flight);
    setNewMemberEmail(member.email);
    setNewMemberSquadronLeadership(member.accountType === 'squadron_leadership');
    setMemberActionError('');
    setPflActionState('idle');
    setShowAddModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openUFPMPicker = () => {
    setUFPMSearchQuery('');
    setSelectedUFPMMemberId(null);
    setShowManageModal(false);
    setShowUFPMModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleConfirmUFPM = () => {
    const run = async () => {
      if (!selectedUFPMMemberId) {
        return;
      }

      if (!accessToken) {
        setMemberActionError('You must be signed in to change the UFPM role.');
        return;
      }

      const selectedMember = members.find((member) => member.id === selectedUFPMMemberId);
      if (!selectedMember) {
        setMemberActionError('Unable to find the selected member.');
        return;
      }

      const outgoingUFPMId = currentUFPM?.id ?? null;
      const isCurrentUserLosingUFPM = outgoingUFPMId === user?.id && selectedUFPMMemberId !== user?.id;
      const isCurrentUserGainingUFPM = selectedUFPMMemberId === user?.id;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await ensureMemberRole(selectedMember.email, selectedMember.accountType, accessToken).catch(() => undefined);
      await assignUFPMRole(selectedMember.email, accessToken);
      setUFPM(selectedUFPMMemberId);
      await logAdminAction({
        actionType: 'assign_ufpm',
        targetMember: selectedMember,
      });

      if (isCurrentUserGainingUFPM) {
        updateUser({ accountType: 'ufpm' });
      }

      setShowUFPMConfirmModal(false);
      setShowUFPMModal(false);
      setSelectedUFPMMemberId(null);

      if (isCurrentUserLosingUFPM) {
        if (accessToken) {
          try {
            await signOutFromSupabase(accessToken);
          } catch {
            // Still clear the local session below.
          }
        }

        logout();
        router.replace('/login');
      }
    };

    void run();
  };

  const handlePTLRequest = (memberId: string, approve: boolean) => {
    const run = async () => {
      const member = members.find((candidate) => candidate.id === memberId);
      if (!member || !user || !accessToken) {
        return;
      }

      Haptics.notificationAsync(
        approve
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      );

        await updateMemberRole(member.email, approve ? 'pfl' : 'standard', accessToken).catch(() => undefined);

      if (approve) {
        approvePTL(memberId);
      } else {
        rejectPTL(memberId);
      }

      await logAdminAction({
        actionType: approve ? 'approve_pfl' : 'reject_pfl',
        targetMember: member,
      });

      const pendingRequest = appNotifications.find(
        (notification) =>
          notification.type === 'ptl_request' &&
          ((notification.actionTargetId === memberId) ||
            (typeof notification.actionPayload?.memberId === 'string' && notification.actionPayload.memberId === memberId))
      );

      if (pendingRequest) {
        await markAppNotificationRead(pendingRequest.id, accessToken).catch(() => undefined);
        setAppNotifications((current) =>
          current.map((notification) =>
            notification.id === pendingRequest.id
              ? { ...notification, readAt: new Date().toISOString(), unread: false }
              : notification
          )
        );
      }

      await sendAppNotification({
        senderMemberId: user.id,
        senderEmail: user.email,
        senderName: getDisplayName(user),
        recipientEmail: member.email,
        recipientMemberId: member.id,
        squadron: member.squadron,
        type: 'ptl_request_result',
        title: approve ? 'PFL access approved' : 'PFL access denied',
        message: approve
          ? 'Your PFL request was approved.'
          : 'Your PFL request was denied.',
        actionType: 'open_account',
        actionTargetId: member.id,
        actionPayload: {
          approved: approve,
        },
        accessToken,
      }).catch(() => undefined);

      setShowPTLRequestModal(false);
      setSelectedPTLRequest(null);
      void loadAppNotifications();
    };

    void run();
  };

  const handleRevokePTL = async (memberId: string) => {
    const member = members.find((candidate) => candidate.id === memberId);
    if (!member || !user || !accessToken) {
      return false;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      await updateMemberRole(member.email, 'standard', accessToken);
      revokePTL(memberId);
      await logAdminAction({
        actionType: 'revoke_pfl',
        targetMember: member,
      });
      await sendAppNotification({
        senderMemberId: user.id,
        senderEmail: user.email,
        senderName: getDisplayName(user),
        recipientEmail: member.email,
        recipientMemberId: member.id,
        squadron: member.squadron,
        type: 'ptl_revoked',
        title: 'PFL access removed',
        message: 'Your PFL access was removed.',
        actionType: 'open_account',
        actionTargetId: member.id,
        accessToken,
      }).catch(() => undefined);
      return true;
    } catch (error) {
      setMemberActionError(error instanceof Error ? error.message : 'Unable to revoke PFL access right now.');
      return false;
    }
  };

  const handleAssignPTL = async (memberId: string) => {
    const member = members.find((candidate) => candidate.id === memberId);
    if (!member || !user || !accessToken) {
      return false;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await updateMemberRole(member.email, 'pfl', accessToken);
      approvePTL(memberId);
      await logAdminAction({
        actionType: 'assign_pfl',
        targetMember: member,
      });
      await sendAppNotification({
        senderMemberId: user.id,
        senderEmail: user.email,
        senderName: getDisplayName(user),
        recipientEmail: member.email,
        recipientMemberId: member.id,
        squadron: member.squadron,
        type: 'ptl_request_result',
        title: 'PFL access assigned',
        message: 'You were assigned PFL access in FitFlight.',
        actionType: 'open_account',
        actionTargetId: member.id,
        actionPayload: {
          approved: true,
          assignedDirectly: true,
        },
        accessToken,
      }).catch(() => undefined);
      return true;
    } catch (error) {
      setMemberActionError(error instanceof Error ? error.message : 'Unable to assign PFL access right now.');
      return false;
    }
  };

  const handleSetUFPM = (memberId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setUFPM(memberId);
  };

  const handlePflRoleAction = useCallback(async (memberId: string, action: 'assign' | 'revoke') => {
    setMemberActionError('');
    if (pflActionResetRef.current) {
      clearTimeout(pflActionResetRef.current);
      pflActionResetRef.current = null;
    }
    setPflActionState('saving');
    const succeeded = action === 'assign'
      ? await handleAssignPTL(memberId)
      : await handleRevokePTL(memberId);
    setTransientPflActionState(succeeded ? 'saved' : 'error');
  }, [setTransientPflActionState, handleAssignPTL, handleRevokePTL]);

  const closeAddMemberModalToManage = () => {
    setShowAddModal(false);
    resetForm();
    setShowManageModal(true);
  };

  const closeUFPMPickerToManage = () => {
    setShowUFPMModal(false);
    setUFPMSearchQuery('');
    setSelectedUFPMMemberId(null);
    setShowManageModal(true);
  };

  const handleChangeSquadron = () => {
    if (!user || !selectedSquadron || selectedSquadron === user.squadron) {
      setShowChangeSquadronModal(false);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    // If user is PTL and changing squadrons, remove PTL status
    const isPTL = isPFLAccountType(user.accountType);
    const newAccountType = isPTL ? 'standard' : user.accountType;

    // Update member in store
    updateMember(user.id, {
      squadron: selectedSquadron,
      accountType: newAccountType,
      ptlPendingApproval: false,
    });

    // Update user in auth store
    updateUser({
      squadron: selectedSquadron,
      accountType: newAccountType,
      ptlPendingApproval: false,
    });

    setShowChangeSquadronModal(false);
  };

  const persistProfileVisibilitySettings = async (
    updates: Pick<Member, 'showWorkoutHistoryOnProfile' | 'showWorkoutUploadsOnProfile' | 'showPFRARecordsOnProfile'>
  ) => {
    if (!user) {
      return;
    }

    const resolvedMember = resolveMemberForUser(user);
    if (!resolvedMember) {
      updateUser(updates);
      return;
    }

    const updatedMember: Member = {
      ...resolvedMember,
      ...updates,
    };

    try {
      setIsUpdatingProfileSettings(true);
      if (accessToken) {
        await updateRosterProfileVisibility(resolvedMember, {
          showWorkoutHistoryOnProfile: updatedMember.showWorkoutHistoryOnProfile,
          showWorkoutUploadsOnProfile: updatedMember.showWorkoutUploadsOnProfile,
          showPFRARecordsOnProfile: updatedMember.showPFRARecordsOnProfile,
        }, accessToken);
      }

      updateMember(resolvedMember.id, updates);
      updateUser(updates);
    } finally {
      setIsUpdatingProfileSettings(false);
    }
  };

  const persistOwnRank = async (nextRank: string) => {
    if (!user) {
      return;
    }

    const resolvedMember = resolveMemberForUser(user);
    if (!resolvedMember) {
      updateUser({ rank: nextRank });
      return;
    }

    const updatedMember: Member = {
      ...resolvedMember,
      rank: nextRank,
    };

    try {
      setIsUpdatingProfileSettings(true);
      if (accessToken) {
        await updateRosterMember(resolvedMember, updatedMember, accessToken);
      }

      updateMember(resolvedMember.id, { rank: nextRank });
      updateUser({ rank: nextRank });
      setSelectedRank(nextRank);
      setShowChangeRankModal(false);
      setShowSettingsModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update your rank.';
      setMemberActionError(message);
      Alert.alert('Unable to update rank', message);
    } finally {
      setIsUpdatingProfileSettings(false);
    }
  };

  // Connected integrations
  const connectedIntegrations = user?.connectedIntegrations ?? [];
  const integrationConnections = user?.integrationConnections ?? {};
  const stravaConnection = integrationConnections.strava;

  const setIntegrationConnection = (
    service: IntegrationService,
    connected: boolean,
    connection = user?.integrationConnections?.[service]
  ) => {
    if (!user) return;

    const nextIntegrations = connected
      ? Array.from(new Set([...(user.connectedIntegrations ?? []), service]))
      : (user.connectedIntegrations ?? []).filter((item) => item !== service);

    const nextConnections = { ...(user.integrationConnections ?? {}) };
    if (connected && connection) {
      nextConnections[service] = connection;
    } else {
      delete nextConnections[service];
    }

    updateUser({
      connectedIntegrations: nextIntegrations,
      integrationConnections: nextConnections,
    });

    if (currentMember) {
      const nextConnectedApps = connected
        ? Array.from(new Set([...(currentMember.connectedApps ?? []), service]))
        : (currentMember.connectedApps ?? []).filter((item) => item !== service);

      updateMember(user.id, { connectedApps: nextConnectedApps });
    }
  };

  const handleStravaConnect = async () => {
    if (!user) return;

    const setupError = getStravaSetupError();
    if (setupError) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setStravaMessage(setupError);
      return;
    }

    try {
      setStravaBusyAction('connect');
      setStravaMessage(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      startStravaConnect(user.id, user.email);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setStravaMessage(error instanceof Error ? error.message : 'Unable to start the Strava connection.');
      setStravaBusyAction(null);
    }
  };

  const handleStravaSync = async () => {
    if (!user) return;

    try {
      setStravaBusyAction('sync');
      setStravaMessage(null);
      const result = await syncStravaWorkouts({ userId: user.id, email: user.email });

      const importedWorkouts = mapImportedWorkouts(result.workouts);
      importWorkouts(user.id, importedWorkouts);

      if (result.workouts.length > 0) {
        const uniqueWorkoutDates = Array.from(new Set(result.workouts.map((workout) => workout.date)));
        await Promise.all(
            uniqueWorkoutDates.map((date) =>
              setAttendanceStatus({
                date,
                flight: user.flight,
                squadron: user.squadron,
                memberId: user.id,
                createdBy: user.id,
                isAttending: true,
                source: 'strava',
                accessToken: accessToken ?? undefined,
              }).catch(() => undefined)
            )
        );

        const nextSessions = await fetchAttendanceSessions(accessToken ?? undefined).catch(() => []);
        syncPTSessions(nextSessions);
      }

      setIntegrationConnection('strava', true, result.connection ?? undefined);
      trackAnalyticsEvent('sync_strava', {
        imported_workouts: result.workouts.length,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStravaMessage(
        result.workouts.length > 0
          ? `Imported ${result.workouts.length} new Strava workout${result.workouts.length === 1 ? '' : 's'}.`
          : 'Strava sync is already up to date.'
      );
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setStravaMessage(error instanceof Error ? error.message : 'Unable to sync Strava workouts.');
    } finally {
      setStravaBusyAction(null);
    }
  };

  const handleDisconnectIntegration = () => {
    if (!user || !integrationToDisconnect) return;
    const service = integrationToDisconnect;

    const finishDisconnect = () => {
      setIntegrationConnection(service, false);
      setShowDisconnectModal(false);
      setIntegrationToDisconnect(null);
      setStravaBusyAction(null);
    };

    const disconnect = async () => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        if (service === 'strava') {
          setStravaBusyAction('disconnect');
          await disconnectStrava({ userId: user.id, email: user.email });
          setStravaMessage('Strava disconnected.');
        }

        finishDisconnect();
      } catch (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setStravaMessage(error instanceof Error ? error.message : 'Unable to disconnect this integration.');
        setShowDisconnectModal(false);
        setIntegrationToDisconnect(null);
        setStravaBusyAction(null);
      }
    };

    void disconnect();
  };

  const getIntegrationLabel = (service: IntegrationService) => {
    switch (service) {
      // Future integration placeholder kept intentionally disabled.
      // case 'apple_health': return 'Apple Health';
      case 'strava': return 'Strava';
      // Future integration placeholder kept intentionally disabled.
      // case 'garmin': return 'Garmin';
      default: return service;
    }
  };

  const handleViewTutorial = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/welcome');
  };

  const handleToggleDeveloperContact = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowDeveloperContact(current => !current);
  };

  const handleOpenSupportMessages = (contactKey: SupportContact['key']) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSupportError(null);
    const contact = supportContacts.find((entry) => entry.key === contactKey) ?? null;
    if (!contact) {
      return;
    }
    setDismissedNotificationKeys((current) => {
      const next = new Set(current);
      supportNotifications
        .filter((notification) => {
          const thread = supportThreads.find((entry) => entry.id === notification.threadId);
          return thread ? supportContactMatchesThread(contact, thread) : false;
        })
        .forEach((notification) => next.add(notification.id));
      return Array.from(next);
    });
    setActiveSupportContactKey(contact.key);
    const nextThread =
      supportThreads.find(
        (thread) =>
          thread.requesterEmail.toLowerCase() === user?.email?.toLowerCase() &&
          supportContactMatchesThread(contact, thread)
      ) ?? null;
    setSupportSubject('');
    setSupportBody('');
    setActiveSupportThreadId(nextThread?.id ?? null);
    if (nextThread?.id) {
      void loadSupportConversation(nextThread.id, { markRead: true });
    } else {
      setActiveSupportThreadId(null);
      setActiveSupportMessages([]);
    }
    setShowDeveloperMessageModal(true);
  };

  const handleOpenSupportInbox = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSupportError(null);
    const nextThreadId = activeSupportThreadId ?? supportThreads[0]?.id ?? null;
    if (nextThreadId) {
      const nextThread = supportThreads.find((thread) => thread.id === nextThreadId);
      if (nextThread) {
        setSupportSubject(nextThread.subject);
        setActiveSupportContactKey(getSupportContactKeyForThread(nextThread, supportContacts));
      }
      setSupportBody('');
      void loadSupportConversation(nextThreadId, { markRead: true });
    }
    setShowSupportInboxModal(true);
  };

  const handleSelectSupportThread = (threadId: string) => {
    Haptics.selectionAsync();
    setSupportError(null);
    const nextThread = supportThreads.find((thread) => thread.id === threadId);
    if (nextThread) {
      setSupportSubject(nextThread.subject);
      setActiveSupportContactKey(getSupportContactKeyForThread(nextThread, supportContacts));
    }
    setSupportBody('');
    void loadSupportConversation(threadId, { markRead: true });
  };

  const handleDeleteSupportThread = (threadId: string) => {
    if (!accessToken) {
      return;
    }

    const thread = supportThreads.find((entry) => entry.id === threadId);
    if (!thread) {
      return;
    }

    const canDeleteThread = canViewSupportInbox || thread.requesterEmail.toLowerCase() === user?.email?.toLowerCase();
    if (!canDeleteThread) {
      return;
    }

    const runDelete = async () => {
      try {
        await deleteSupportThread({ threadId, accessToken });
        setSupportThreads((current) => current.filter((entry) => entry.id !== threadId));
        if (activeSupportThreadId === threadId) {
          const fallbackThread = supportThreads.find((entry) => entry.id !== threadId) ?? null;
          setActiveSupportThreadId(fallbackThread?.id ?? null);
          setActiveSupportMessages([]);
          setSupportBody('');
          setSupportSubject(fallbackThread?.subject ?? '');
          if (fallbackThread) {
            setActiveSupportContactKey(getSupportContactKeyForThread(fallbackThread, supportContacts));
          }
        }
        setSupportError(null);
        Alert.alert('Conversation deleted', 'This support conversation was removed from FitFlight.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to delete this conversation.';
        setSupportError(message);
        Alert.alert('Unable to delete conversation', message);
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Delete this conversation and all of its messages from FitFlight?')) {
        void runDelete();
      }
      return;
    }

    Alert.alert(
      'Delete conversation?',
      'This will permanently remove the conversation and its messages from FitFlight.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void runDelete();
          },
        },
      ]
    );
  };

  const handleOpenSupportNotification = (threadId: string) => {
    const nextThread = supportThreads.find((thread) => thread.id === threadId);
    if (nextThread) {
      setSupportSubject(nextThread.subject);
    }

    if (canViewSupportInbox) {
      setShowNotificationsModal(false);
      setShowSupportInboxModal(true);
      void loadSupportConversation(threadId, { markRead: true });
      return;
    }

    if (nextThread) {
      setActiveSupportContactKey(getSupportContactKeyForThread(nextThread, supportContacts));
    }
    setShowNotificationsModal(false);
    setShowDeveloperMessageModal(true);
    void loadSupportConversation(threadId, { markRead: true });
  };

  const handleOpenManualWorkoutNotification = (submissionId: string, isReview: boolean) => {
    const source = isReview ? manualWorkoutReviewQueue : manualWorkoutSubmissions;
    const submission = source.find((item) => item.id === submissionId) ?? null;
    if (!submission) {
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setManualWorkoutError(null);
    setManualWorkoutReviewNote(submission.reviewerNote ?? '');
    setActiveWorkoutSubmission(submission);
    setShowNotificationsModal(false);
    setShowWorkoutReviewModal(true);

    if (!isReview && accessToken) {
      void markManualWorkoutSubmissionRead({
        submissionId,
        viewer: 'requester',
        accessToken,
      }).then(() => {
        setManualWorkoutSubmissions((current) => current.map((item) => (
          item.id === submissionId ? { ...item, requesterRead: true } : item
        )));
      }).catch(() => undefined);
    }
  };

  const handleOpenAppNotification = (notification: BackendNotificationItem) => {
    const run = async () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (!notification.readAt && accessToken) {
        await markAppNotificationRead(notification.id, accessToken).catch(() => undefined);
        setAppNotifications((current) =>
          current.map((entry) =>
            entry.id === notification.id
              ? { ...entry, readAt: new Date().toISOString(), unread: false }
              : entry
          )
        );
      }

      if (notification.type === 'ptl_request') {
        const memberId =
          typeof notification.actionPayload?.memberId === 'string'
            ? notification.actionPayload.memberId
            : notification.actionTargetId;

        if (memberId) {
          setSelectedPTLRequest(memberId);
          setShowPTLRequestModal(true);
          setShowNotificationsModal(false);
          return;
        }
      }

      setShowNotificationsModal(false);
    };

    void run();
  };

  const handleReviewManualWorkout = (approved: boolean) => {
    const run = async () => {
      if (!activeWorkoutSubmission || !user || !accessToken) {
        return;
      }

      if (!approved && !manualWorkoutReviewNote.trim()) {
        setManualWorkoutError('Please add a note explaining why the workout was denied.');
        return;
      }

        setManualWorkoutSubmitting(true);
        setManualWorkoutError(null);

        try {
          const attendanceAliases = getAttendanceAliases(activeWorkoutSubmission.memberId);
          const hadAttendanceBeforeApproval = ptSessions.some(
            (session) =>
              session.date === activeWorkoutSubmission.workoutDate &&
              session.flight === activeWorkoutSubmission.memberFlight &&
              (session.squadron ?? 'Hawks') === activeWorkoutSubmission.squadron &&
              session.attendees.some((attendeeId) => attendanceAliases.has(attendeeId))
          );

          const updatedSubmission = await reviewManualWorkoutSubmission({
            submissionId: activeWorkoutSubmission.id,
            reviewerMemberId: user.id,
            reviewerName: getDisplayName(user),
            approved,
            note: manualWorkoutReviewNote,
            attendanceMarkedBySubmission: approved ? !hadAttendanceBeforeApproval : false,
            accessToken,
          });

            if (approved) {
              await setAttendanceStatus({
                date: updatedSubmission.workoutDate,
                flight: updatedSubmission.memberFlight,
                squadron: updatedSubmission.squadron,
                memberId: updatedSubmission.memberId,
                createdBy: user.id,
                isAttending: true,
                source: 'workout',
                accessToken,
              });

              const [nextSessions, approvedManualWorkouts] = await Promise.all([
              fetchAttendanceSessions(accessToken).catch(() => []),
            fetchApprovedManualWorkouts(accessToken, updatedSubmission.squadron).catch(() => []),
          ]);
          syncPTSessions(nextSessions);
          syncApprovedManualWorkouts(approvedManualWorkouts);
        }

        setManualWorkoutReviewQueue((current) => current.filter((item) => item.id !== updatedSubmission.id));
        setManualWorkoutSubmissions((current) => {
          const existingIndex = current.findIndex((item) => item.id === updatedSubmission.id);
          if (existingIndex >= 0) {
            return current.map((item) => item.id === updatedSubmission.id ? updatedSubmission : item);
          }
          return [updatedSubmission, ...current];
        });

        setShowWorkoutReviewModal(false);
        setActiveWorkoutSubmission(null);
        setManualWorkoutReviewNote('');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        setManualWorkoutError(error instanceof Error ? error.message : 'Unable to review this workout.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setManualWorkoutSubmitting(false);
      }
    };

    void run();
  };

  const handleSendSupportMessage = () => {
    const run = async () => {
      if (!user) {
        setSupportError('You must be signed in to message the FitFlight team.');
        return;
      }

      const threadOwner = canViewSupportInbox
        ? supportThreads.find((thread) => thread.id === activeSupportThreadId)
        : supportThread;
      const inheritedSubject = threadOwner?.subject?.trim() ?? '';
      const trimmedSubject = supportSubject.trim() || inheritedSubject;
      const trimmedBody = supportBody.trim();

      if (!trimmedSubject || !trimmedBody) {
        setSupportError('Please add both a subject line and message.');
        return;
      }

      setSupportSending(true);
      setSupportError(null);

      const requesterMemberId = threadOwner?.requesterMemberId ?? user.id;
      const requesterEmail = threadOwner?.requesterEmail ?? user.email;
      const requesterName = threadOwner?.requesterName ?? getDisplayName(user);
      const requesterSquadron = threadOwner?.requesterSquadron ?? user.squadron;
      const optimisticThreadId = threadOwner?.id ?? createOfflineActionId('support-thread');
      const optimisticMessage: SupportMessage = {
        id: createOfflineActionId('support-message'),
        threadId: optimisticThreadId,
        senderMemberId: user.id,
        senderEmail: user.email,
        senderName: getDisplayName(user),
        subject: trimmedSubject,
        body: trimmedBody,
        isFromOwner: canViewSupportInbox,
        createdAt: new Date().toISOString(),
        readByOwner: canViewSupportInbox,
        readByRequester: !canViewSupportInbox,
      };
      const optimisticThread: SupportThreadSummary = threadOwner ?? {
        id: optimisticThreadId,
        requesterMemberId,
        requesterEmail,
        requesterName,
        requesterSquadron,
        recipientMemberId: activeSupportContact?.memberId ?? null,
        recipientEmail: activeSupportContact?.email ?? OWNER_EMAIL,
        recipientName: activeSupportContact?.name ?? DEVELOPER_NAME,
        subject: trimmedSubject,
        createdAt: optimisticMessage.createdAt,
        updatedAt: optimisticMessage.createdAt,
        latestMessagePreview: trimmedBody,
        messageCount: 0,
        unreadForOwner: 0,
        unreadForRequester: 0,
      };

      const result = await runOrQueueOfflineMutation({
        action: {
          id: createOfflineActionId('support-message'),
          type: 'send_support_message',
          createdAt: optimisticMessage.createdAt,
          payload: {
            requesterMemberId,
            requesterEmail,
            requesterName,
            requesterSquadron,
            recipientMemberId: threadOwner?.recipientMemberId ?? activeSupportContact?.memberId ?? null,
            recipientEmail: threadOwner?.recipientEmail ?? activeSupportContact?.email ?? OWNER_EMAIL,
            recipientName: threadOwner?.recipientName ?? activeSupportContact?.name ?? DEVELOPER_NAME,
            senderMemberId: user.id,
            senderEmail: user.email,
            senderName: getDisplayName(user),
            subject: trimmedSubject,
            body: trimmedBody,
            isFromOwner: canViewSupportInbox,
          },
        },
        execute: async () => {
          if (!accessToken) {
            throw new Error('You must be signed in to message the FitFlight team.');
          }
          return sendSupportMessage({
            requesterMemberId,
            requesterEmail,
            requesterName,
            requesterSquadron,
            recipientMemberId: threadOwner?.recipientMemberId ?? activeSupportContact?.memberId ?? null,
            recipientEmail: threadOwner?.recipientEmail ?? activeSupportContact?.email ?? OWNER_EMAIL,
            recipientName: threadOwner?.recipientName ?? activeSupportContact?.name ?? DEVELOPER_NAME,
            senderMemberId: user.id,
            senderEmail: user.email,
            senderName: getDisplayName(user),
            subject: trimmedSubject,
            body: trimmedBody,
            isFromOwner: canViewSupportInbox,
            accessToken,
          });
        },
        onQueued: () => {
          setSupportThreads((current) => {
            const exists = current.some((thread) => thread.id === optimisticThread.id);
            const nextThread = {
              ...optimisticThread,
              messageCount: (threadOwner?.messageCount ?? 0) + 1,
              updatedAt: optimisticMessage.createdAt,
              latestMessagePreview: trimmedBody,
            };
            return exists
              ? current.map((thread) => (thread.id === optimisticThread.id ? nextThread : thread))
              : [nextThread, ...current];
          });
          setActiveSupportThreadId(optimisticThread.id);
          setActiveSupportMessages((current) => [...current, optimisticMessage]);
        },
      });

      setSupportBody('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (result.queued) {
        Alert.alert('Saved offline', 'Your message will send when FitFlight reconnects.');
      } else if (result.result) {
        await loadSupportThreads();
        await loadSupportConversation(result.result.threadId, { markRead: true });
      }
    };

    run().catch((error) => {
      setSupportError(error instanceof Error ? error.message : 'Unable to send your message.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }).finally(() => {
      setSupportSending(false);
    });
  };

  const handleOpenResources = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/resources');
  };

  const userStats: { exerciseMinutes: number; distanceRun: number; connectedApps: string[]; workouts: unknown[]; achievements: string[] } | Member | null = user
    ? resolveMemberForUser(user) || {
        exerciseMinutes: 0,
        distanceRun: 0,
        connectedApps: [],
        workouts: [],
        achievements: [],
      }
    : null;
  const isDemoAccount = userAccountType === 'demo' || user?.email?.trim().toLowerCase() === 'fitflight@us.af.mil';
  const displayAchievementIds = useMemo(() => {
    const achievements = [...(userStats?.achievements ?? [])];
    if (isDemoAccount && demoTrophyEarnedPreview && !achievements.includes(DEMO_TROPHY_ID)) {
      achievements.push(DEMO_TROPHY_ID);
    }
    return achievements;
  }, [demoTrophyEarnedPreview, isDemoAccount, userStats]);
  const displayTrophyMember = useMemo(
    () => ({
      achievements: displayAchievementIds,
      trophyCount: 'trophyCount' in (userStats ?? {}) ? (userStats as Member).trophyCount ?? 0 : 0,
      monthlyPlacements: 'monthlyPlacements' in (userStats ?? {}) ? (userStats as Member).monthlyPlacements ?? [] : [],
    }),
    [displayAchievementIds, userStats]
  );
  const availableSummaryMonths = useMemo(
    () => getAvailableMonthKeys(userStats && 'workouts' in userStats && 'fitnessAssessments' in userStats ? [userStats as Member] : [], []),
    [userStats]
  );
  const summaryMonth = availableSummaryMonths.includes(selectedSummaryMonth)
    ? selectedSummaryMonth
    : availableSummaryMonths[0] ?? getMonthKey();
  const monthlyUserSummary = userStats && 'workouts' in userStats
    ? getMemberMonthSummary(userStats as Member, summaryMonth, ptSessions)
    : { workouts: [], workoutCount: 0, minutes: 0, miles: 0, score: 0 };
  const monthlyPFRAEntries = userStats && 'fitnessAssessments' in userStats
    ? (userStats as Member).fitnessAssessments.filter((assessment) => assessment.date.startsWith(summaryMonth))
    : [];
  const latestMonthlyPFRA = monthlyPFRAEntries[monthlyPFRAEntries.length - 1] ?? null;
  const personalAnalyticsSummary = useMemo(() => {
    const typeCounts = new Map<string, number>();
    const dayKeys = new Set<string>();

    monthlyUserSummary.workouts.forEach((workout) => {
      const label = workout.source === 'attendance' ? 'Attendance' : workout.type;
      typeCounts.set(label, (typeCounts.get(label) ?? 0) + 1);
      dayKeys.add(workout.date);
    });

    const topTypeEntry = Array.from(typeCounts.entries()).sort((left, right) => right[1] - left[1])[0];
    return {
      topType: topTypeEntry?.[0] ?? 'No workouts yet',
      topTypeCount: topTypeEntry?.[1] ?? 0,
      activeDays: dayKeys.size,
      averageMinutes: monthlyUserSummary.workoutCount > 0
        ? monthlyUserSummary.minutes / monthlyUserSummary.workoutCount
        : 0,
    };
  }, [monthlyUserSummary]);

  useEffect(() => {
    if (!accessToken || !user?.id || !user?.squadron) {
      setIsExcusedThisWeek(false);
      return;
    }

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const weekKey = weekStart.toISOString().split('T')[0];
    let isCancelled = false;

    void fetchWeeklyAttendanceExcusals({
      weekStart: weekKey,
      squadron: user.squadron,
      accessToken,
    }).then((entries) => {
      if (!isCancelled) {
        setIsExcusedThisWeek(entries.some((entry) => entry.memberId === user.id));
      }
    }).catch(() => {
      if (!isCancelled) {
        setIsExcusedThisWeek(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [accessToken, user?.id, user?.squadron]);
  const trophyStats = useMemo(
    () => buildTrophyStats(
      ALL_ACHIEVEMENTS,
      members,
      displayTrophyMember
    ),
    [displayTrophyMember, members]
  );
  const workoutHistory = useMemo(
    () => {
      if (!(userStats && 'workouts' in userStats)) {
        return [];
      }

      return getMemberEffectiveWorkouts(userStats as Member, ptSessions)
        .sort((a, b) => b.date.localeCompare(a.date));
    },
    [ptSessions, userStats]
  );
  const workoutHistoryWithProof = useMemo(
    () =>
      workoutHistory.map((workout) => ({
        ...workout,
        screenshotUri:
          workout.source === 'manual' && workout.externalId
            ? manualWorkoutProofMap[workout.externalId] ?? workout.screenshotUri
            : workout.screenshotUri,
      })),
    [manualWorkoutProofMap, workoutHistory]
  );
  const pfraHistory = useMemo(
    () => (userStats && 'fitnessAssessments' in userStats ? [...(userStats as Member).fitnessAssessments].sort((a, b) => b.date.localeCompare(a.date)) : []),
    [userStats]
  );
  const leaderboardHistory = useMemo(
    () => (userStats && 'leaderboardHistory' in userStats ? [...(userStats as Member).leaderboardHistory].sort((a, b) => b.month.localeCompare(a.month)) : []),
    [userStats]
  );
  const rarestTrophies = useMemo(
    () => getRarestEarnedTrophies(
      ALL_ACHIEVEMENTS,
      members,
      displayTrophyMember,
      3
    ),
    [displayTrophyMember, members]
  );
  const earnedTrophyCount = trophyStats.filter((trophy) => trophy.isEarned).length;
  const trophyOverflowCount = Math.max(earnedTrophyCount - rarestTrophies.length, 0);
  const demoAchievement = ALL_ACHIEVEMENTS.find((achievement) => achievement.id === DEMO_TROPHY_ID) ?? null;

  useEffect(() => {
    if (isFocused) {
      return;
    }

    setDemoTrophyEarnedPreview(false);
    setShowDemoTrophyCelebration(false);
  }, [isFocused]);

  const getAccountTypeLabel = (accountType: AccountType) => {
    switch (accountType) {
      case 'fitflight_creator': return 'FitFlight Creator';
      case 'ufpm': return 'UFPM';
      case 'demo': return 'Demo Role';
      case 'squadron_leadership': return 'Squadron Leadership';
      case 'pfl':
      case 'ptl': return 'PFL';
      default: return 'Member';
    }
  };

  const handleOpenInstallHelp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (Platform.OS === 'web' && typeof window !== 'undefined' && isIos && !isStandalonePwa) {
      window.sessionStorage.setItem('fitflight_show_install_help', '1');
      window.location.assign('/');
      return;
    }

    if (installPromptEvent && !isIos) {
      void handleInstallToHomeScreen();
      return;
    }

    setShowInstallModal(true);
  };

  const handleInstallToHomeScreen = async () => {
    if (!installPromptEvent) {
      setShowInstallModal(true);
      return;
    }

    const promptEvent = installPromptEvent as {
      prompt: () => Promise<void>;
      userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }>;
    };

    await promptEvent.prompt();
    await promptEvent.userChoice?.catch(() => undefined);
    setInstallPromptEvent(null);
    setShowInstallModal(false);
  };

  const getAccountTypeColor = (accountType: AccountType) => {
    switch (accountType) {
      case 'fitflight_creator': return { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/50' };
      case 'ufpm': return { bg: 'bg-af-gold/20', text: 'text-af-gold', border: 'border-af-gold/50' };
      case 'demo': return { bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-400/40' };
      case 'squadron_leadership': return { bg: 'bg-sky-500/20', text: 'text-sky-300', border: 'border-sky-400/40' };
      case 'pfl':
      case 'ptl': return { bg: 'bg-af-accent/20', text: 'text-af-accent', border: 'border-af-accent/50' };
      default: return { bg: 'bg-white/10', text: 'text-af-silver', border: 'border-white/20' };
    }
  };

  const supportNotifications = useMemo<SupportNotificationItem[]>(
    () => supportThreads
      .filter((thread) => (canViewSupportInbox ? thread.unreadForOwner : thread.unreadForRequester) > 0)
      .map((thread) => ({
        id: `support-${thread.id}`,
        title: canViewSupportInbox
          ? `New message from ${thread.requesterName}`
          : `${thread.recipientName} replied to your message`,
        message: thread.subject,
        unread: true,
        threadId: thread.id,
        kind: 'support',
      })),
    [canViewSupportInbox, supportThreads]
  );

  const manualWorkoutNotifications = useMemo<ManualWorkoutNotificationItem[]>(
    () => [
      ...manualWorkoutReviewQueue.map((submission) => ({
        id: `manual-review-${submission.id}`,
        title: `${submission.memberName} submitted a manual workout`,
        message: `${submission.workoutType} · ${submission.duration} min`,
        unread: true,
        submissionId: submission.id,
        kind: 'manual_workout' as const,
        isReview: true,
      })),
      ...manualWorkoutSubmissions
        .filter((submission) => submission.status !== 'pending' && !submission.requesterRead)
        .map((submission) => ({
          id: `manual-update-${submission.id}`,
          title: submission.status === 'approved' ? 'Manual workout approved' : 'Manual workout denied',
          message:
            submission.status === 'approved'
              ? `${submission.workoutType} was approved and added to your account.`
              : submission.reviewerNote || `${submission.workoutType} was denied.`,
          unread: true,
          submissionId: submission.id,
          kind: 'manual_workout' as const,
          isReview: false,
        })),
    ],
    [manualWorkoutReviewQueue, manualWorkoutSubmissions]
  );
  const backendNotifications = useMemo<BackendNotificationItem[]>(
    () => appNotifications,
    [appNotifications]
  );
  const visibleUnreadSupportCount = supportNotifications.filter(
    (notification) => !dismissedNotificationKeys.includes(notification.id)
  ).length;
  const visibleUnreadManualWorkoutCount = manualWorkoutNotifications.filter(
    (notification) => !dismissedNotificationKeys.includes(notification.id)
  ).length;
  const totalUnreadCount = unreadNotifications.length + visibleUnreadSupportCount + visibleUnreadManualWorkoutCount;
  const handleOpenNotificationsModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDismissedNotificationKeys((current) => {
      const next = new Set(current);
      appNotifications.forEach((notification) => {
        if (!notification.readAt) {
          next.add(`backend-${notification.id}`);
        }
      });
      supportNotifications.forEach((notification) => next.add(notification.id));
      manualWorkoutNotifications.forEach((notification) => next.add(notification.id));
      return Array.from(next);
    });
    setShowNotificationsModal(true);
  };

  const userDisplayName = user ? getDisplayName(user) : 'Unknown';
  const accountColors = getAccountTypeColor(userAccountType);

  useEffect(() => {
    setSelectedRank(user?.rank ?? 'SSgt');
  }, [user?.rank]);

  useEffect(() => {
    if (!showWorkoutHistoryModal || !accessToken) {
      return;
    }

    const manualSubmissionIds = workoutHistory
      .filter((workout) => workout.source === 'manual' && workout.externalId && !workout.screenshotUri)
      .map((workout) => workout.externalId as string);

    if (manualSubmissionIds.length === 0) {
      return;
    }

    let isCancelled = false;

    void fetchManualWorkoutProofImageMap(manualSubmissionIds, accessToken)
      .then((proofMap) => {
        if (isCancelled || Object.keys(proofMap).length === 0) {
          return;
        }

        setManualWorkoutProofMap((current) => ({ ...current, ...proofMap }));
      })
      .catch(() => undefined);

    return () => {
      isCancelled = true;
    };
  }, [accessToken, showWorkoutHistoryModal, workoutHistory]);

  return (
    <View className="flex-1">
      <LinearGradient
        colors={themePalette.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />
      <ThemeBackdrop />

      <SafeAreaView edges={['top']} className="flex-1">
        <TopStatusBar title="Account" subtitle={`${user?.squadron ?? 'Hawks'} Squadron`} />
        <ScrollView
          ref={scrollViewRef}
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 120, alignItems: 'center' }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={themePalette.accent} />
          }
          scrollEventThrottle={16}
          onScroll={() => {
            if (currentTargetId?.startsWith('account-')) {
              refreshCurrentTarget();
            }
          }}
        >
          <PageContainer maxWidth={contentMaxWidth}>
          {/* Header */}
          <Animated.View
            entering={getWebSafeFadeInDown(100)}
            className="px-6 pt-4 pb-2 flex-row items-center justify-between"
          >
            <View>
              <Text style={getThemeHeadingStyle(themePalette, 28)}>Account</Text>
              <Text style={[getThemeBodyStyle(themePalette, 14), { marginTop: 4 }]}>Manage your account</Text>
            </View>

            {isAuthenticated && (
              <View className="flex-row items-center">
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowSettingsModal(true);
                  }}
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={getThemeControlStyle(themePalette)}
                >
                  <Settings size={20} color={themePalette.textSecondary} />
                </Pressable>
                <Pressable
                  onPress={handleOpenNotificationsModal}
                  className="relative w-10 h-10 rounded-full items-center justify-center"
                  style={getThemeControlStyle(themePalette)}
                >
                  <Bell size={20} color={themePalette.textSecondary} />
                  {totalUnreadCount > 0 && (
                    <View className="absolute -top-1 -right-1 w-5 h-5 bg-af-danger rounded-full items-center justify-center">
                      <Text className="text-white text-xs font-bold">{totalUnreadCount}</Text>
                    </View>
                  )}
                </Pressable>
              </View>
            )}
          </Animated.View>

          {/* User Card */}
          <TutorialTarget
            id="account-summary"
            onLayout={(event) => {
              tutorialTargetYRef.current['account-summary'] = event.nativeEvent.layout.y;
            }}
          >
            <Animated.View
              entering={getWebSafeFadeInDown(150)}
              className="mx-6 mt-4"
            >
            <ThemeChrome theme={themePalette} variant="feature">
            <View className="p-6">
            <View className="flex-row items-center">
              <View className="w-16 h-16 bg-af-accent/30 rounded-full items-center justify-center mr-4">
                {userAccountType === 'fitflight_creator' ? (
                  <Crown size={32} color="#A855F7" />
                ) : (
                  <User size={32} color="#4A90D9" />
                )}
              </View>
              <View className="flex-1 items-center">
                    <Text className="text-white text-xl font-bold text-center">{userDisplayName}</Text>
                  <View className="mt-2 items-center">
                    <CompactTrophyBadges trophies={rarestTrophies} overflowCount={trophyOverflowCount} />
                  </View>
                  <View className="items-center">
                    <LinearGradient
                      colors={['rgba(74,144,217,0)', 'rgba(74,144,217,0.8)', 'rgba(74,144,217,0)']}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={{ marginTop: 12, height: 2, width: 144, borderRadius: 999 }}
                    />
                  </View>
                  <Text className="mt-2 text-af-silver text-center">{user?.email}</Text>
                  <View className="flex-row items-center justify-center mt-1">
                    <View className={cn(
                      "px-2 py-0.5 rounded-full mr-2",
                      accountColors.bg
                    )}>
                    <Text className={cn(
                      "text-xs font-semibold",
                      accountColors.text
                    )}>
                      {getAccountTypeLabel(userAccountType)}
                    </Text>
                  </View>
          <Text className="text-af-silver text-sm">{user?.flight ? formatFlightDisplay(user.flight) : ''}</Text>
                  </View>
                </View>
            </View>

            <TrophyCase
              expanded={showTrophyCase}
              onToggle={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowTrophyCase((current) => !current);
              }}
              trophies={trophyStats}
            />
            {isDemoAccount ? (
              <Pressable
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setDemoTrophyEarnedPreview(true);
                  setShowDemoTrophyCelebration(true);
                }}
                className="mt-3 rounded-2xl border border-af-gold/35 bg-af-gold/10 px-4 py-3"
              >
                <View className="flex-row items-center justify-center">
                  <Trophy size={18} color="#FFD700" />
                  <Text className="ml-2 text-af-gold font-semibold">Demo Trophy Celebration</Text>
                </View>
              </Pressable>
            ) : null}
            </View>
            </ThemeChrome>
            </Animated.View>
          </TutorialTarget>

          {/* Stats Card */}
          {isExcusedThisWeek ? (
            <Animated.View
              entering={getWebSafeFadeInDown(185)}
              className="mx-6 mt-4"
            >
              <ThemeChrome theme={themePalette}>
              <View className="p-4">
              <Text className="text-sm font-semibold text-white">Weekly workout requirement excused</Text>
              <Text className="mt-1 text-xs text-af-silver">You are excused from the 5 workouts this week requirement for the current attendance week.</Text>
              </View>
              </ThemeChrome>
            </Animated.View>
          ) : null}

          <Animated.View
            entering={getWebSafeFadeInDown(200)}
            className="mx-6 mt-4"
          >
            <ThemeChrome theme={themePalette}>
            <View className="p-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-white/60 text-xs uppercase tracking-wider">Your Monthly Summary</Text>
              <Text className="text-af-silver text-xs">{formatMonthLabel(summaryMonth)}</Text>
            </View>
            {availableSummaryMonths.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mb-3"
                contentContainerStyle={{ paddingRight: 12 }}
              >
                {availableSummaryMonths.map((monthKey) => (
                  <Pressable
                    key={monthKey}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedSummaryMonth(monthKey);
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-full mr-2 border",
                      summaryMonth === monthKey ? "bg-af-accent border-af-accent" : "bg-white/5 border-white/10"
                    )}
                  >
                    <Text className={cn(
                      "text-xs",
                      summaryMonth === monthKey ? "text-white font-semibold" : "text-af-silver"
                    )}>
                      {formatMonthLabel(monthKey)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <View className="flex-row justify-between">
              <View className="items-center flex-1">
                <Dumbbell size={20} color="#A855F7" />
                <Text className="text-white font-bold text-lg mt-1">
                  {monthlyUserSummary.workoutCount}
                </Text>
                <Text className="text-af-silver text-xs">Workouts</Text>
              </View>
              <View className="w-px bg-white/10" />
              <View className="items-center flex-1">
                <Activity size={20} color="#4A90D9" />
                <Text className="text-white font-bold text-lg mt-1">
                  {monthlyUserSummary.minutes}
                </Text>
                <Text className="text-af-silver text-xs">Minutes</Text>
              </View>
              <View className="w-px bg-white/10" />
              <View className="items-center flex-1">
                  <RunningIcon size={20} color="#22C55E" />
                <Text className="text-white font-bold text-lg mt-1">
                  {monthlyUserSummary.miles.toFixed(2)}
                </Text>
                <Text className="text-af-silver text-xs">Miles</Text>
              </View>
            </View>
            <View className="mt-3 pt-3 border-t border-white/10 flex-row justify-between">
              <View>
                <Text className="text-white/50 text-xs uppercase tracking-wider">Monthly Score</Text>
                <Text className="text-white font-semibold mt-1">{monthlyUserSummary.score.toLocaleString()}</Text>
              </View>
              <View className="items-end">
                <Text className="text-white/50 text-xs uppercase tracking-wider">Latest PFRA</Text>
                <Text className="text-white font-semibold mt-1">{latestMonthlyPFRA?.overallScore ?? 'N/A'}</Text>
              </View>
            </View>
            </View>
            </ThemeChrome>
          </Animated.View>

          <Animated.View
            entering={getWebSafeFadeInDown(205)}
            className="mx-6 mt-4"
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/personal-analytics');
              }}
            >
              <ThemeChrome theme={themePalette}>
              <View className="p-4">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-white/60 text-xs uppercase tracking-wider">Personal Analytics</Text>
                <Text className="text-af-silver text-xs">Open</Text>
              </View>
              <View className="flex-row justify-between">
                <View className="items-center flex-1">
                  <Activity size={20} color="#A855F7" />
                  <Text className="text-white font-bold text-lg mt-1">{personalAnalyticsSummary.topTypeCount}</Text>
                  <Text className="text-af-silver text-xs text-center">{personalAnalyticsSummary.topType}</Text>
                </View>
                <View className="w-px bg-white/10" />
                <View className="items-center flex-1">
                  <Calendar size={20} color="#4A90D9" />
                  <Text className="text-white font-bold text-lg mt-1">{personalAnalyticsSummary.activeDays}</Text>
                  <Text className="text-af-silver text-xs">Active Days</Text>
                </View>
                <View className="w-px bg-white/10" />
                <View className="items-center flex-1">
                  <Dumbbell size={20} color="#22C55E" />
                  <Text className="text-white font-bold text-lg mt-1">{personalAnalyticsSummary.averageMinutes.toFixed(1)}</Text>
                  <Text className="text-af-silver text-xs">Avg Min</Text>
                </View>
              </View>
              </View>
              </ThemeChrome>
            </Pressable>
          </Animated.View>

          <TutorialTarget
            id="account-history"
            onLayout={(event) => {
              tutorialTargetYRef.current['account-history'] = event.nativeEvent.layout.y;
            }}
          >
            <Animated.View
              entering={getWebSafeFadeInDown(210)}
              className="mx-6 mt-4"
            >
              <ThemeChrome theme={themePalette}>
              <View className="p-4">
                <Text className="text-white/60 text-xs uppercase tracking-wider mb-3">History</Text>
                <View className="flex-row flex-wrap" style={{ gap: 12 }}>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShowWorkoutHistoryModal(true);
                      }}
                      className="min-w-[30%] flex-1 rounded-2xl border border-white/10 bg-black/10 p-4 min-h-[76px] items-center justify-center"
                    >
                      <View className="items-center justify-center">
                        <Activity size={18} color="#A855F7" />
                        <Text className="mt-2 text-white font-semibold text-center text-sm leading-5">Workout History</Text>
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShowPFRAHistoryModal(true);
                      }}
                      className="min-w-[30%] flex-1 rounded-2xl border border-white/10 bg-black/10 p-4 min-h-[76px] items-center justify-center"
                    >
                      <View className="items-center justify-center">
                        <FileText size={18} color="#4A90D9" />
                        <Text className="mt-2 text-white font-semibold text-center text-sm leading-5">PFRA History</Text>
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShowLeaderboardHistoryModal(true);
                      }}
                      className="min-w-[30%] flex-1 rounded-2xl border border-white/10 bg-black/10 p-4 min-h-[76px] items-center justify-center"
                    >
                      <View className="items-center justify-center">
                        <Trophy size={18} color="#FFD700" />
                        <Text className="mt-2 text-white font-semibold text-center text-sm leading-5">Leaderboard History</Text>
                      </View>
                    </Pressable>
                  </View>
                </View>
              </ThemeChrome>
            </Animated.View>
          </TutorialTarget>

          {/* Quick Actions */}
          <TutorialTarget
            id="account-quick-actions"
            onLayout={(event) => {
              tutorialTargetYRef.current['account-quick-actions'] = event.nativeEvent.layout.y;
            }}
          >
            <Animated.View
              entering={getWebSafeFadeInDown(225)}
              className="mx-6 mt-4"
            >
            <Text className="text-white font-semibold text-lg mb-3">Quick Actions</Text>
              <View className="flex-row">
                <Pressable
                  onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/add-workout');
                }}
                className="flex-1 bg-af-accent/20 border border-af-accent/50 rounded-xl px-3 py-3 mr-2 min-h-[96px]"
                >
                  <View className="flex-1 items-center justify-center">
                    <Plus size={24} color="#4A90D9" />
                    <Text className="text-white font-semibold mt-1.5 text-sm text-center leading-5">Add Manual Workout</Text>
                  </View>
                </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/upload-fitness');
                }}
                  className="flex-1 bg-af-success/20 border border-af-success/50 rounded-xl px-3 py-3 mx-1 min-h-[96px]"
                >
                  <View className="flex-1 items-center justify-center">
                    <FileText size={24} color="#22C55E" />
                    <Text className="text-white font-semibold mt-1.5 text-sm text-center leading-5">Add Manual PFRA</Text>
                  </View>
                </Pressable>
                {canManagePTPrograms(userAccountType) && (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push('/schedule-session');
                    }}
                      className="flex-1 bg-af-gold/20 border border-af-gold/50 rounded-xl px-3 py-3 ml-2 min-h-[96px]"
                    >
                      <View className="flex-1 items-center justify-center">
                        <Calendar size={24} color="#FFD700" />
                        <Text className="text-white font-semibold mt-1.5 text-sm text-center leading-5">Schedule PT Session</Text>
                      </View>
                    </Pressable>
                )}
                {!canManagePTPrograms(userAccountType) && (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push('/schedule-session');
                    }}
                      className="flex-1 bg-af-gold/20 border border-af-gold/50 rounded-xl px-3 py-3 ml-2 min-h-[96px]"
                    >
                      <View className="flex-1 items-center justify-center">
                        <Calendar size={24} color="#FFD700" />
                        <Text className="text-white font-semibold mt-1.5 text-sm text-center leading-5">Schedule Personal PT</Text>
                      </View>
                    </Pressable>
                )}
              </View>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowUpcomingPTSessionsModal(true);
                }}
                className="mt-3 flex-row items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-4"
              >
                <Calendar size={20} color="#FFD700" />
                <Text className="ml-3 text-white font-semibold text-base">Upcoming PT Sessions</Text>
              </Pressable>
              </Animated.View>
            </TutorialTarget>

          {/* Connected Apps */}
          <TutorialTarget
            id="account-connected-apps"
            onLayout={(event) => {
              tutorialTargetYRef.current['account-connected-apps'] = event.nativeEvent.layout.y;
            }}
          >
            <Animated.View
              entering={getWebSafeFadeInDown(250)}
              className="mx-6 mt-4"
            >
            <Text className="text-white font-semibold text-lg mb-3">Connected Apps</Text>
            <View className="bg-white/5 rounded-2xl border border-white/10 p-4">
              {stravaMessage && (
                <View className="mb-4 rounded-xl border border-af-accent/30 bg-af-accent/10 px-4 py-3">
                  <Text className="text-af-silver text-sm">{stravaMessage}</Text>
                </View>
              )}

              {/* Strava */}
              <View className="flex-row items-center justify-between py-3">
                <View className="flex-row items-center flex-1">
                  <Activity size={20} color="#F97316" />
                  <View className="ml-3 flex-1">
                    <Text className="text-white">Strava</Text>
                    <Text className="text-af-silver text-xs">
                      {stravaConnection?.lastSyncedAt
                        ? `Last synced ${new Date(stravaConnection.lastSyncedAt).toLocaleString()}`
                        : 'Sync running and cycling workouts from Strava'}
                    </Text>
                  </View>
                </View>
                {connectedIntegrations.includes('strava') ? (
                  <View className="items-end">
                    <View className="flex-row items-center">
                      <View className="bg-af-success/20 px-2 py-1 rounded-full mr-2">
                        <Text className="text-af-success text-xs">Connected</Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          void handleStravaSync();
                        }}
                        disabled={stravaBusyAction !== null}
                        className={cn(
                          "rounded-full px-3 py-1 mr-2",
                          stravaBusyAction !== null ? "bg-white/5" : "bg-white/10"
                        )}
                      >
                        <Text className="text-af-silver text-xs">
                          {stravaBusyAction === 'sync' ? 'Syncing...' : 'Sync now'}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setIntegrationToDisconnect('strava');
                          setShowDisconnectModal(true);
                        }}
                        disabled={stravaBusyAction !== null}
                        className="w-8 h-8 bg-af-danger/20 rounded-full items-center justify-center"
                      >
                        <Trash2 size={16} color="#EF4444" />
                      </Pressable>
                    </View>
                    {stravaConnection?.displayName && (
                      <Text className="text-af-silver text-xs mt-2">
                        Connected as {stravaConnection.displayName}
                      </Text>
                    )}
                  </View>
                ) : (
                  <Pressable
                    onPress={() => {
                      void handleStravaConnect();
                    }}
                    disabled={!isOwnerReviewer || !canUseStravaSync() || stravaBusyAction !== null}
                    className={cn(
                      "px-3 py-1 rounded-full",
                      !isOwnerReviewer || !canUseStravaSync() || stravaBusyAction !== null ? "bg-white/5" : "bg-white/10"
                    )}
                  >
                    <Text className="text-af-silver text-xs">
                      {isOwnerReviewer
                        ? (stravaBusyAction === 'connect' ? 'Connecting...' : 'Connect')
                        : 'App Under Review by Strava'}
                    </Text>
                  </Pressable>
                )}
              </View>

            </View>
            {Platform.OS === 'web' && !canUseStravaSync() && (
              <Text className="text-af-silver text-xs mt-3">
                Configure `EXPO_PUBLIC_APP_URL`, `EXPO_PUBLIC_SUPABASE_URL`, and your Supabase Strava Edge Functions to enable Strava sync.
              </Text>
            )}
            </Animated.View>
          </TutorialTarget>

          {/* Admin Actions */}
          {hasAdminAccess && (
            <TutorialTarget
              id="account-admin"
              onLayout={(event) => {
                tutorialTargetYRef.current['account-admin'] = event.nativeEvent.layout.y;
              }}
            >
              <Animated.View
                entering={getWebSafeFadeInDown(300)}
                className="mx-6 mt-6"
              >
              <Text className="text-white font-semibold text-lg mb-3">Admin Actions</Text>

              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/import-roster');
                }}
                className="flex-row items-center bg-af-success/20 border border-af-success/50 rounded-xl p-4 mb-3"
              >
                <Upload size={24} color="#22C55E" />
                <View className="ml-3 flex-1">
                  <Text className="text-white font-semibold">Import Roster</Text>
                  <Text className="text-af-silver text-xs">Bulk import from CSV or Excel</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => { setShowManageModal(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                className="flex-row items-center bg-white/5 border border-white/10 rounded-xl p-4 mb-3"
              >
                <Users size={24} color="#C0C0C0" />
                <View className="ml-3 flex-1">
                  <Text className="text-white font-semibold">Manage Members</Text>
                  <Text className="text-af-silver text-xs">{members.length} members in squadron</Text>
                </View>
              </Pressable>

              {canResetUserPasswords && (
                <TutorialTarget
                  id="account-password-reset"
                  onLayout={(event) => {
                    tutorialTargetYRef.current['account-password-reset'] = event.nativeEvent.layout.y;
                  }}
                >
                  <Pressable
                    onPress={openResetUserPasswordModal}
                    className="flex-row items-center bg-af-warning/20 border border-af-warning/40 rounded-xl p-4 mb-3"
                  >
                    <Shield size={24} color="#F59E0B" />
                    <View className="ml-3 flex-1">
                      <Text className="text-white font-semibold">Reset User Password</Text>
                      <Text className="text-af-silver text-xs">Owner, UFPM, and Demo can set a new password for a member</Text>
                    </View>
                  </Pressable>
                </TutorialTarget>
              )}

              {userAccountType === 'fitflight_creator' && (
                <TutorialTarget
                  id="account-analytics"
                  onLayout={(event) => {
                    tutorialTargetYRef.current['account-analytics'] = event.nativeEvent.layout.y;
                  }}
                >
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push('/analytics');
                    }}
                    className="flex-row items-center bg-purple-500/20 border border-purple-500/50 rounded-xl p-4 mb-3"
                  >
                    <Settings size={24} color="#A855F7" />
                    <View className="ml-3 flex-1">
                      <Text className="text-white font-semibold">Squadron Analytics</Text>
                      <Text className="text-af-silver text-xs">View detailed reports & export data</Text>
                    </View>
                  </Pressable>
                </TutorialTarget>
              )}

              {canViewAppUsageAnalytics && (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push('/app-usage-analytics');
                  }}
                  className="flex-row items-center bg-sky-500/20 border border-sky-400/50 rounded-xl p-4 mb-3"
                >
                  <Activity size={24} color="#7DD3FC" />
                  <View className="ml-3 flex-1">
                    <Text className="text-white font-semibold">App Usage Analytics</Text>
                    <Text className="text-af-silver text-xs">View Google Analytics traffic and event usage</Text>
                  </View>
                </Pressable>
              )}

              {canViewAdminAuditTrail && (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowAuditTrailModal(true);
                  }}
                  className="flex-row items-center bg-white/5 border border-white/10 rounded-xl p-4 mb-3"
                >
                  <FileText size={24} color="#C0C0C0" />
                  <View className="ml-3 flex-1">
                    <Text className="text-white font-semibold">Admin Action Audit Trail</Text>
                    <Text className="text-af-silver text-xs">Log of member and role management actions</Text>
                  </View>
                </Pressable>
              )}

              {userAccountType === 'fitflight_creator' && (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push('/cross-squadron');
                  }}
                  className="flex-row items-center bg-af-gold/20 border border-af-gold/50 rounded-xl p-4"
                >
                  <Building2 size={24} color="#FFD700" />
                  <View className="ml-3 flex-1">
                    <Text className="text-white font-semibold">View Other Squadrons</Text>
                    <Text className="text-af-silver text-xs">Access all squadron interfaces & analytics</Text>
                  </View>
                </Pressable>
              )}
              </Animated.View>
            </TutorialTarget>
          )}

          {/* PFL Actions (for PFLs only, not admins) */}
          {canEditAttendance(userAccountType) && !hasAdminAccess && (
            <TutorialTarget
              id="account-admin"
              onLayout={(event) => {
                tutorialTargetYRef.current['account-admin'] = event.nativeEvent.layout.y;
              }}
            >
              <Animated.View
                entering={getWebSafeFadeInDown(300)}
                className="mx-6 mt-6"
              >
              <Text className="text-white font-semibold text-lg mb-3">PFL Actions</Text>
              <Pressable
                onPress={() => { setShowManageModal(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                className="flex-row items-center bg-white/5 border border-white/10 rounded-xl p-4"
              >
                <Users size={24} color="#C0C0C0" />
                <View className="ml-3 flex-1">
                  <Text className="text-white font-semibold">Manage Members</Text>
                  <Text className="text-af-silver text-xs">Edit or remove roster members</Text>
                </View>
              </Pressable>
              </Animated.View>
            </TutorialTarget>
          )}

          {/* Help & Tutorial */}
          <TutorialTarget
            id="account-help"
            onLayout={(event) => {
              tutorialTargetYRef.current['account-help'] = event.nativeEvent.layout.y;
            }}
          >
            <Animated.View
              entering={getWebSafeFadeInDown(325)}
              className="mx-6 mt-6"
            >
            <Text className="text-white font-semibold text-lg mb-3">Help</Text>
            <Pressable
              onPress={handleViewTutorial}
              className="flex-row items-center bg-white/5 border border-white/10 rounded-xl p-4 mb-3"
            >
              <HelpCircle size={24} color="#4A90D9" />
              <View className="ml-3 flex-1">
                <Text className="text-white font-semibold">View Tutorial</Text>
                <Text className="text-af-silver text-xs">Learn how to use FitFlight</Text>
              </View>
            </Pressable>

            <Pressable
              onPress={handleOpenResources}
              className="flex-row items-center bg-white/5 border border-white/10 rounded-xl p-4 mb-3"
            >
              <FileText size={24} color="#4A90D9" />
              <View className="ml-3 flex-1">
                <Text className="text-white font-semibold">Official Documents</Text>
                <Text className="text-af-silver text-xs">Read the DAFMAN and fitness playbook</Text>
              </View>
            </Pressable>

            {canViewSupportInbox ? (
              <Pressable
                onPress={handleOpenSupportInbox}
                className="flex-row items-center bg-af-accent/10 border border-af-accent/30 rounded-xl p-4 mb-3"
              >
                <Mail size={24} color="#4A90D9" />
                <View className="ml-3 flex-1">
                  <Text className="text-white font-semibold">Support Inbox</Text>
                  <Text className="text-af-silver text-xs">Review and reply to FitFlight team messages</Text>
                </View>
                {unreadSupportCount > 0 ? (
                  <View className="bg-af-danger rounded-full px-2 py-1">
                    <Text className="text-white text-xs font-bold">{unreadSupportCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            ) : null}

            <Pressable
              onPress={handleToggleDeveloperContact}
              className="bg-white/5 border border-white/10 rounded-xl p-4"
            >
              <View className="flex-row items-center">
                <Mail size={24} color="#4A90D9" />
                <View className="ml-3 flex-1">
                  <Text className="text-white font-semibold">Contact the FitFlight Team</Text>
                  <Text className="text-af-silver text-xs">View support contact information</Text>
                </View>
                {showDeveloperContact ? (
                  <ChevronUp size={20} color="#C0C0C0" />
                ) : (
                  <ChevronDown size={20} color="#C0C0C0" />
                )}
              </View>

              {showDeveloperContact && (
                <View className="mt-4 pt-3 border-t border-white/10">
                   <Text className="text-white font-semibold">{DEVELOPER_NAME}</Text>
                   <Text className="text-af-silver text-sm mt-1 italic">{DEVELOPER_TITLE}</Text>
                  <Text className="text-af-silver mt-1">{OWNER_EMAIL}</Text>
                  <Pressable
                    onPress={() => handleOpenSupportMessages('developer')}
                    className="flex-row items-center bg-af-accent/10 border border-af-accent/30 rounded-xl p-4 mt-4"
                  >
                    <MessageSquare size={22} color="#4A90D9" />
                    <View className="ml-3 flex-1">
                      <Text className="text-white font-semibold">Send a Message to the Developer</Text>
                    </View>
                    {developerSupportThread && developerSupportThread.unreadForRequester > 0 ? (
                      <View className="bg-af-danger rounded-full px-2 py-1">
                        <Text className="text-white text-xs font-bold">{developerSupportThread.unreadForRequester}</Text>
                      </View>
                    ) : null}
                  </Pressable>

                    <View className="mt-5 pt-5 border-t border-white/10">
                      <Text className="text-white font-semibold mt-2">{PROJECT_COORDINATOR_NAME}</Text>
                      <Text className="text-af-silver text-sm mt-1 italic">{PROJECT_COORDINATOR_TITLE}</Text>
                    <Text className="text-af-silver mt-1">{projectCoordinatorEmail || 'Email unavailable'}</Text>
                    <Pressable
                      onPress={() => projectCoordinatorEmail && handleOpenSupportMessages('project_coordinator')}
                      disabled={!projectCoordinatorEmail}
                      className={cn(
                        "flex-row items-center border rounded-xl p-4 mt-4",
                        projectCoordinatorEmail
                          ? "bg-af-accent/10 border-af-accent/30"
                          : "bg-white/5 border-white/10"
                      )}
                    >
                      <MessageSquare size={22} color={projectCoordinatorEmail ? "#4A90D9" : "#64748B"} />
                      <View className="ml-3 flex-1">
                        <Text className={cn("font-semibold", projectCoordinatorEmail ? "text-white" : "text-af-silver")}>
                          Send a Message to the Project Coordinator
                        </Text>
                      </View>
                      {coordinatorSupportThread && coordinatorSupportThread.unreadForRequester > 0 ? (
                        <View className="bg-af-danger rounded-full px-2 py-1">
                          <Text className="text-white text-xs font-bold">{coordinatorSupportThread.unreadForRequester}</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  </View>
                </View>
              )}
            </Pressable>
            </Animated.View>
          </TutorialTarget>

          {/* Logout */}
          <Animated.View
            entering={getWebSafeFadeInDown(350)}
            className="mx-6 mt-6"
          >
            {isAuthenticated ? (
              <>
                <Pressable
                  onPress={handleLogout}
                  className="flex-row items-center justify-center bg-af-danger/20 border border-af-danger/50 rounded-xl p-4"
                >
                  <LogOut size={20} color="#EF4444" />
                  <Text className="text-af-danger font-semibold ml-2">Sign Out</Text>
                </Pressable>
                <Text className="text-center text-af-silver text-xs mt-3 opacity-80">
                  FitFlight {FITFLIGHT_VERSION}
                </Text>
              </>
            ) : (
              <Pressable
                onPress={() => router.replace('/login')}
                className="flex-row items-center justify-center bg-af-accent border border-af-accent rounded-xl p-4"
              >
                <LogIn size={20} color="white" />
                <Text className="text-white font-semibold ml-2">Sign In</Text>
              </Pressable>
            )}
          </Animated.View>
          </PageContainer>
        </ScrollView>
      </SafeAreaView>

      {/* Add Member Modal */}
      <Modal visible={showAddModal} transparent animationType="none">
        <Animated.View entering={getWebSafeFadeIn(180)} className="flex-1 bg-black/80 justify-end">
          <Animated.View entering={getWebSafeSlideInDown(260)}
            style={[
              getThemeCardStyle(themePalette, 'feature'),
              {
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                maxHeight: '84%',
                overflow: 'hidden',
              },
            ]}
          >
            <BlurView intensity={modalBlurIntensity} tint="dark" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
            <View style={{ backgroundColor: 'rgba(8, 14, 24, 0.34)', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 48, flex: 1, minHeight: 0 }}>
            <View className="flex-row items-center justify-between mb-6">
              <Text style={getThemeHeadingStyle(themePalette, 22)}>{editingMemberId ? 'Edit Member' : 'Add Member'}</Text>
              <Pressable
                onPress={closeAddMemberModalToManage}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={getThemeControlStyle(themePalette)}
              >
                <X size={20} color={themePalette.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              style={{ flex: 1, minHeight: 0 }}
              contentContainerStyle={{ paddingBottom: 12 }}
              showsVerticalScrollIndicator={false}
            >
              {/* First Name */}
              <View className="mb-4">
                <Text style={getThemeBodyStyle(themePalette, 13, themePalette.textSecondary)} className="mb-2">First Name</Text>
                <View style={getThemeControlStyle(themePalette)}>
                  <TextInput
                    value={newMemberFirstName}
                    onChangeText={setNewMemberFirstName}
                    placeholder="Enter first name"
                    placeholderTextColor="#ffffff40"
                    className="px-4 py-3"
                    style={{ color: themePalette.textPrimary }}
                  />
                </View>
              </View>

              {/* Last Name */}
              <View className="mb-4">
                <Text style={getThemeBodyStyle(themePalette, 13, themePalette.textSecondary)} className="mb-2">Last Name</Text>
                <View style={getThemeControlStyle(themePalette)}>
                  <TextInput
                    value={newMemberLastName}
                    onChangeText={setNewMemberLastName}
                    placeholder="Enter last name"
                    placeholderTextColor="#ffffff40"
                    className="px-4 py-3"
                    style={{ color: themePalette.textPrimary }}
                  />
                </View>
              </View>

              {/* Rank */}
              <View className="mb-4">
                <Text style={getThemeBodyStyle(themePalette, 13, themePalette.textSecondary)} className="mb-2">Rank</Text>
                <View>
                  {RANK_GROUPS.map((group, groupIndex) => (
                    <View key={group.label} className={groupIndex > 0 ? 'mt-3' : ''}>
                      <Text style={getThemeBodyStyle(themePalette, 12, themePalette.textMuted)} className="uppercase mb-2">{group.label}</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                        <View className="flex-row">
                          {group.ranks.map((rank) => (
                            <Pressable
                              key={rank}
                              onPress={() => setNewMemberRank(rank)}
                              className="px-4 py-2 rounded-lg mr-2 border"
                              style={newMemberRank === rank ? getThemeControlStyle(themePalette, true) : getThemeControlStyle(themePalette)}
                            >
                              <Text style={getThemeBodyStyle(themePalette, 13, newMemberRank === rank ? themePalette.textPrimary : themePalette.textSecondary)}>{rank}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  ))}
                </View>
              </View>

              {/* Flight */}
              <View className="mb-4">
                <Text style={getThemeBodyStyle(themePalette, 13, themePalette.textSecondary)} className="mb-2">Flight</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                  <View className="flex-row">
                    {FLIGHTS.map((flight) => (
                      <Pressable
                        key={flight}
                        onPress={() => setNewMemberFlight(flight)}
                        className="px-4 py-2 rounded-lg mr-2 border"
                        style={newMemberFlight === flight ? getThemeControlStyle(themePalette, true) : getThemeControlStyle(themePalette)}
                      >
                        <Text style={getThemeBodyStyle(themePalette, 13, newMemberFlight === flight ? themePalette.textPrimary : themePalette.textSecondary)}>{flight}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
                {newMemberFlight === 'DO' ? (
                  <Text style={getThemeBodyStyle(themePalette, 12, themePalette.textSecondary)} className="mt-2">
                    Members assigned to DO are automatically given Squadron Leadership access.
                  </Text>
                ) : null}
              </View>

              {/* Email */}
              <View className="mb-4">
                <Text style={getThemeBodyStyle(themePalette, 13, themePalette.textSecondary)} className="mb-2">Email</Text>
                <View style={getThemeControlStyle(themePalette)}>
                  <TextInput
                    value={newMemberEmail}
                    onChangeText={setNewMemberEmail}
                    placeholder="name@us.af.mil"
                    placeholderTextColor="#ffffff40"
                    autoCapitalize="none"
                    className="px-4 py-3"
                    style={{ color: themePalette.textPrimary }}
                  />
                </View>
              </View>

              {isOwnerReviewer && editingMemberId ? (
                <View className="mb-4">
                  <Text className="text-white/60 text-sm mb-2">Special Roles</Text>
                  <Pressable
                    onPress={() => {
                      setNewMemberSquadronLeadership(!newMemberSquadronLeadership);
                      Haptics.selectionAsync();
                    }}
                    className={cn(
                      "flex-row items-center justify-between rounded-xl border px-4 py-4",
                      newMemberSquadronLeadership
                        ? "bg-sky-500/15 border-sky-400/40"
                        : "bg-white/5 border-white/10"
                    )}
                  >
                    <View className="flex-1 pr-3">
                      <Text className={cn(
                        "font-semibold",
                        newMemberSquadronLeadership ? "text-sky-300" : "text-white"
                      )}>
                        Squadron Leadership
                      </Text>
                      <Text className="text-af-silver text-xs mt-1">
                        Grants the same in-app privileges as UFPM. Owner can assign or remove this role here.
                      </Text>
                    </View>
                    <View className={cn(
                      "w-6 h-6 rounded-full border-2 items-center justify-center",
                      newMemberSquadronLeadership ? "bg-sky-400 border-sky-300" : "border-white/30"
                    )}>
                      {newMemberSquadronLeadership ? <Check size={14} color="#071226" /> : null}
                    </View>
                  </Pressable>
                </View>
              ) : null}

              {editingMember && canManage && editingMember.accountType !== 'fitflight_creator' && editingMember.accountType !== 'ufpm' ? (
                <View className="mb-4">
                  <Text style={getThemeBodyStyle(themePalette, 13, themePalette.textSecondary)} className="mb-2">PFL Role</Text>
                  <View style={getThemeControlStyle(themePalette)} className="rounded-2xl p-4">
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 pr-3">
                        <Text style={[getThemeBodyStyle(themePalette, 14, themePalette.textPrimary), { fontWeight: '700' }]}>
                          {isPFLAccountType(editingMember.accountType) ? 'PFL Access' : 'PFL Access Available'}
                        </Text>
                        <Text style={getThemeBodyStyle(themePalette, 12, themePalette.textSecondary)} className="mt-1">
                          {isPFLAccountType(editingMember.accountType)
                            ? 'This member can currently manage PFL workflows in-app.'
                            : 'Grant this member Physical Fitness Leader access from their edit view.'}
                        </Text>
                      </View>
                      <View className="w-10 h-10 rounded-full items-center justify-center" style={getThemeControlStyle(themePalette, !isPFLAccountType(editingMember.accountType))}>
                        <UserCheck size={18} color={isPFLAccountType(editingMember.accountType) ? '#F59E0B' : themePalette.textPrimary} />
                      </View>
                    </View>
                    {isPFLAccountType(editingMember.accountType) ? (
                      <Pressable
                        onPress={() => void handlePflRoleAction(editingMember.id, 'revoke')}
                        disabled={pflActionState === 'saving'}
                        className="self-start mt-4 px-4 py-3 rounded-xl"
                        style={getThemeControlStyle(themePalette)}
                      >
                        <View className="flex-row items-center">
                          {pflActionState === 'saving' ? (
                            <Activity size={14} color="#F59E0B" />
                          ) : pflActionState === 'saved' ? (
                            <Check size={14} color="#22C55E" />
                          ) : pflActionState === 'error' ? (
                            <AlertTriangle size={14} color="#EF4444" />
                          ) : null}
                          <Text style={getThemeBodyStyle(themePalette, 13, pflActionState === 'error' ? '#EF4444' : pflActionState === 'saved' ? '#22C55E' : '#F59E0B')} className={pflActionState !== 'idle' ? 'ml-2' : ''}>
                            {pflActionState === 'saving' ? 'Saving' : pflActionState === 'saved' ? 'Saved' : pflActionState === 'error' ? 'ERROR' : 'Revoke PFL'}
                          </Text>
                        </View>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => void handlePflRoleAction(editingMember.id, 'assign')}
                        disabled={pflActionState === 'saving'}
                        className="self-start mt-4 px-4 py-3 rounded-xl"
                        style={getThemeControlStyle(themePalette, true)}
                      >
                        <View className="flex-row items-center">
                          {pflActionState === 'saving' ? (
                            <Activity size={14} color={themePalette.textPrimary} />
                          ) : pflActionState === 'saved' ? (
                            <Check size={14} color="#22C55E" />
                          ) : pflActionState === 'error' ? (
                            <AlertTriangle size={14} color="#EF4444" />
                          ) : null}
                          <Text style={getThemeBodyStyle(themePalette, 13, pflActionState === 'error' ? '#EF4444' : pflActionState === 'saved' ? '#22C55E' : themePalette.textPrimary)} className={pflActionState !== 'idle' ? 'ml-2' : ''}>
                            {pflActionState === 'saving' ? 'Saving' : pflActionState === 'saved' ? 'Saved' : pflActionState === 'error' ? 'ERROR' : 'Assign PFL'}
                          </Text>
                        </View>
                      </Pressable>
                    )}
                  </View>
                </View>
              ) : null}

              {memberActionError ? (
                <View className="bg-red-500/20 border border-red-500/40 rounded-xl px-4 py-3 mb-4">
                  <Text className="text-red-300">{memberActionError}</Text>
                </View>
              ) : null}

              <Text style={getThemeBodyStyle(themePalette, 12, themePalette.textMuted)} className="mb-4">
                This updates the shared roster used by FitFlight and keeps attendance/account binding aligned.
              </Text>

              {/* Save Button */}
              <Pressable
                onPress={handleSaveMember}
                className="py-4 rounded-xl mt-2"
                style={getThemeControlStyle(themePalette, true)}
              >
                <Text style={[getThemeBodyStyle(themePalette, 15, themePalette.textPrimary), { fontWeight: '700', textAlign: 'center' }]}>{editingMemberId ? 'Save Changes' : 'Add Member'}</Text>
              </Pressable>
            </ScrollView>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Manage Members Modal */}
      <Modal visible={showManageModal} transparent animationType="none">
        <Animated.View entering={getWebSafeFadeIn(180)} className="flex-1 bg-black/80 justify-end">
          <Animated.View
            entering={getWebSafeSlideInDown(260)}
            style={[
              getThemeCardStyle(themePalette, 'feature'),
              {
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                maxHeight: '80%',
                overflow: 'hidden',
              },
            ]}
          >
            <BlurView intensity={modalBlurIntensity} tint="dark" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
            <View style={{ backgroundColor: 'rgba(8, 14, 24, 0.34)', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 48, flex: 1, minHeight: 0 }}>
            <View className="flex-row items-center justify-between mb-6">
              <Text style={getThemeHeadingStyle(themePalette, 22)}>Manage Members</Text>
              <Pressable
                onPress={() => setShowManageModal(false)}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={getThemeControlStyle(themePalette)}
              >
                <X size={20} color={themePalette.textSecondary} />
              </Pressable>
            </View>

            {memberActionError ? (
              <View className="bg-red-500/20 border border-red-500/40 rounded-xl px-4 py-3 mb-4">
                <Text className="text-red-300">{memberActionError}</Text>
              </View>
            ) : null}

            <View className="rounded-2xl p-4 mb-4" style={getThemeControlStyle(themePalette)}>
              <View className="flex-row items-center justify-between">
                <View>
                  <Text style={[getThemeBodyStyle(themePalette, 15, themePalette.textPrimary), { fontWeight: '700' }]}>Roster Controls</Text>
                  <Text style={getThemeBodyStyle(themePalette, 12, themePalette.textSecondary)} className="mt-1">
                    {filteredMembers.length} shown of {members.length} members
                  </Text>
                </View>
              </View>
              <View className="flex-row mt-3" style={{ gap: 10 }}>
                <Pressable
                  onPress={openAddMemberModal}
                  className="flex-1 flex-row items-center justify-center rounded-xl px-4 py-3"
                  style={getThemeControlStyle(themePalette, true)}
                >
                  <UserPlus size={16} color={themePalette.textPrimary} />
                  <Text style={[getThemeBodyStyle(themePalette, 13, themePalette.textPrimary), { fontWeight: '700', marginLeft: 8 }]}>
                    Add Member
                  </Text>
                </Pressable>
                {canManage && (
                  <Pressable
                    onPress={openUFPMPicker}
                    className="flex-1 flex-row items-center justify-center rounded-xl px-4 py-3"
                    style={{
                      ...getThemeControlStyle(themePalette),
                      backgroundColor: 'rgba(245, 158, 11, 0.18)',
                      borderColor: 'rgba(245, 158, 11, 0.42)',
                    }}
                  >
                    <Dumbbell size={16} color="#F59E0B" />
                    <Text style={[getThemeBodyStyle(themePalette, 13, '#FFD700'), { fontWeight: '700', marginLeft: 8 }]}>
                      Change UFPM
                    </Text>
                  </Pressable>
                )}
              </View>
              <View className="flex-row items-center rounded-xl px-4 py-3 mt-4" style={getThemeControlStyle(themePalette)}>
                <Search size={18} color={themePalette.textSecondary} />
                <TextInput
                  value={memberSearchQuery}
                  onChangeText={setMemberSearchQuery}
                  placeholder="Search members"
                  placeholderTextColor="#ffffff40"
                  autoCapitalize="none"
                  className="flex-1 ml-3"
                  style={{ color: themePalette.textPrimary }}
                />
              </View>
            </View>

            <ScrollView
              style={{ flex: 1, minHeight: 0 }}
              contentContainerStyle={{ paddingBottom: 12 }}
              showsVerticalScrollIndicator={false}
            >
              {filteredMembers.map((member) => {
                const memberDisplayName = getDisplayName(member);
                const memberColors = getAccountTypeColor(member.accountType);
                const isPTL = isPFLAccountType(member.accountType);
                const isOwner = member.accountType === 'fitflight_creator';

                return (
                  <View
                    key={member.id}
                    className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-3"
                  >
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 pr-3">
                        <Text className="text-white font-semibold">{memberDisplayName}</Text>
                        <Text className="text-af-silver text-xs mt-1">{member.email}</Text>
                        <View className="flex-row items-center mt-3">
                          <View className="bg-white/10 rounded-full px-2 py-1 mr-2">
                                <Text className="text-af-silver text-xs">{formatFlightDisplay(member.flight)}</Text>
                          </View>
                          <View className={cn("px-2 py-1 rounded-full", memberColors.bg)}>
                            <Text className={cn("text-xs", memberColors.text)}>
                              {getAccountTypeLabel(member.accountType)}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {!isOwner && canManageMembers && (
                        <View className="flex-row items-center">
                          <Pressable
                            onPress={() => openEditMemberModal(member)}
                            className="w-9 h-9 bg-white/10 rounded-full items-center justify-center mr-2"
                          >
                            <Pencil size={15} color="#C0C0C0" />
                          </Pressable>
                          <Pressable
                            onPress={() => confirmRemoveMember(member.id)}
                            className="w-9 h-9 bg-af-danger/20 rounded-full items-center justify-center"
                          >
                            <Trash2 size={16} color="#EF4444" />
                          </Pressable>
                        </View>
                      )}
                    </View>
                    {isPTL && canManage && (
                      <View className="mt-3 pt-3 border-t border-white/10">
                        <Pressable
                          onPress={() => handleRevokePTL(member.id)}
                          className="self-start bg-af-warning/20 px-3 py-2 rounded-full"
                        >
                          <Text className="text-af-warning text-xs font-semibold">Revoke PFL</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })}
              {filteredMembers.length === 0 && (
                <View className="bg-white/5 border border-white/10 rounded-2xl p-6 items-center">
                  <Users size={28} color="#C0C0C0" />
                  <Text className="text-white font-semibold mt-3">No members found</Text>
                  <Text className="text-af-silver text-sm mt-1 text-center">
                    Try a different search term or clear the filter.
                  </Text>
                </View>
              )}
            </ScrollView>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      <Modal visible={Boolean(memberPendingDelete)} transparent animationType="fade">
        <View className="flex-1 bg-black/80 items-center justify-center p-6">
          <View className="bg-af-navy rounded-3xl p-6 w-full max-w-sm border border-white/20">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-white text-xl font-bold">Delete Member</Text>
              <Pressable
                onPress={closeRemoveMemberConfirmation}
                className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
              >
                <X size={20} color="#C0C0C0" />
              </Pressable>
            </View>

            <View className="bg-af-danger/10 border border-af-danger/30 rounded-2xl p-4 mb-4">
              <Text className="text-white font-semibold">
                {memberPendingDelete ? getDisplayName(memberPendingDelete) : 'Selected member'}
              </Text>
              <Text className="text-af-silver text-sm mt-2">
                This will remove the member from the roster and FitFlight tracking.
              </Text>
              <Text className="text-af-danger text-sm font-medium mt-3">
                This action cannot be undone.
              </Text>
            </View>

            <View className="flex-row">
              <Pressable
                onPress={closeRemoveMemberConfirmation}
                className="flex-1 bg-white/10 py-3 rounded-xl mr-2"
              >
                <Text className="text-white text-center font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!memberPendingDeleteId) {
                    return;
                  }
                  closeRemoveMemberConfirmation();
                  handleRemoveMember(memberPendingDeleteId);
                }}
                className="flex-1 bg-af-danger py-3 rounded-xl ml-2"
              >
                <Text className="text-white text-center font-semibold">Delete Member</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showUFPMModal} transparent animationType="none">
        <Animated.View entering={getWebSafeFadeIn(180)} className="flex-1 bg-black/80 justify-end">
          <Animated.View
            entering={getWebSafeSlideInDown(260)}
            style={[
              getThemeCardStyle(themePalette, 'feature'),
              {
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                maxHeight: '82%',
                overflow: 'hidden',
              },
            ]}
          >
            <BlurView intensity={modalBlurIntensity} tint="dark" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
            <View style={{ backgroundColor: 'rgba(8, 14, 24, 0.34)', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 48, flex: 1, minHeight: 0 }}>
            <View className="flex-row items-center justify-between mb-6">
              <View className="flex-1 pr-4">
                <Text style={getThemeHeadingStyle(themePalette, 22)}>Select UFPM</Text>
                {currentUFPM ? (
                  <View className="mt-3 rounded-xl px-3 py-3 border" style={getThemeControlStyle(themePalette)}>
                    <Text style={getThemeBodyStyle(themePalette, 11, '#FFD700')} className="uppercase">Current UFPM</Text>
                    <Text style={[getThemeBodyStyle(themePalette, 15, themePalette.textPrimary), { fontWeight: '700', marginTop: 4 }]}>
                      {getDisplayName(currentUFPM)}
                    </Text>
                  </View>
                ) : (
                  <Text style={[getThemeBodyStyle(themePalette, 14, themePalette.textSecondary), { marginTop: 4 }]}>
                    No UFPM is currently assigned.
                  </Text>
                )}
              </View>
              <Pressable
                onPress={closeUFPMPickerToManage}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={getThemeControlStyle(themePalette)}
              >
                <X size={20} color={themePalette.textSecondary} />
              </Pressable>
            </View>

            <View className="flex-row items-center rounded-xl px-4 py-3 mb-4" style={getThemeControlStyle(themePalette)}>
              <Search size={18} color={themePalette.textSecondary} />
              <TextInput
                value={ufpmSearchQuery}
                onChangeText={setUFPMSearchQuery}
                placeholder="Search members"
                placeholderTextColor="#ffffff40"
                autoCapitalize="none"
                className="flex-1 ml-3"
                style={{ color: themePalette.textPrimary }}
              />
            </View>

            <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
              {ufpmCandidates.map((member) => (
                <Pressable
                  key={member.id}
                  onPress={() => {
                    setSelectedUFPMMemberId(member.id);
                    setShowUFPMConfirmModal(true);
                  }}
                  className="rounded-2xl p-4 mb-3 border"
                  style={getThemeControlStyle(themePalette)}
                >
                  <Text style={[getThemeBodyStyle(themePalette, 15, themePalette.textPrimary), { fontWeight: '700' }]}>{getDisplayName(member)}</Text>
                  <Text style={getThemeBodyStyle(themePalette, 12, themePalette.textSecondary)} className="mt-1">{member.email}</Text>
                  <View className="flex-row items-center mt-3">
                    <View className="rounded-full px-2 py-1 mr-2" style={getThemeControlStyle(themePalette)}>
                      <Text style={getThemeBodyStyle(themePalette, 12, themePalette.textSecondary)}>{formatFlightDisplay(member.flight)}</Text>
                    </View>
                    {member.accountType === 'ufpm' && (
                      <View className="bg-af-gold/20 rounded-full px-2 py-1 border border-af-gold/30">
                        <Text style={getThemeBodyStyle(themePalette, 12, '#FFD700')}>Current UFPM</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      <Modal visible={showResetUserPasswordModal} transparent animationType="slide">
        <Animated.View entering={getWebSafeFadeIn(180)} className="flex-1 bg-black/80 justify-end">
          <Animated.View entering={getWebSafeSlideInDown(260)} className="rounded-t-3xl max-h-[85%]" style={{ overflow: 'hidden' }}>
            <BlurView intensity={modalBlurIntensity} tint="dark" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
            <View className="bg-af-navy/70 rounded-t-3xl p-6 pb-12">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-white text-xl font-bold">Reset User Password</Text>
              <Pressable
                onPress={closeResetUserPasswordModal}
                className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
              >
                <X size={20} color="#C0C0C0" />
              </Pressable>
            </View>

            {adminResetPasswordError ? (
              <View className="bg-red-500/20 border border-red-500/40 rounded-xl px-4 py-3 mb-4">
                <Text className="text-red-300">{adminResetPasswordError}</Text>
              </View>
            ) : null}

            <View className="bg-af-warning/10 border border-af-warning/30 rounded-xl p-4 mb-4">
              <Text className="text-white text-sm leading-5">
                This sets a brand new password for the selected member immediately. Choose a strong password and share it securely.
              </Text>
            </View>

            <View className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10 mb-4">
              <Search size={18} color="#C0C0C0" />
              <TextInput
                value={resetPasswordSearchQuery}
                onChangeText={setResetPasswordSearchQuery}
                placeholder="Search members"
                placeholderTextColor="#ffffff40"
                autoCapitalize="none"
                className="flex-1 ml-3 text-white"
              />
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="mb-4">
                {resetPasswordCandidates.map((member) => {
                  const isSelected = member.id === selectedResetPasswordMemberId;
                  return (
                    <Pressable
                      key={member.id}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setSelectedResetPasswordMemberId(member.id);
                      }}
                      className={cn(
                        "rounded-2xl border p-4 mb-3",
                        isSelected ? "bg-af-accent/20 border-af-accent/50" : "bg-white/5 border-white/10"
                      )}
                    >
                      <Text className="text-white font-semibold">{getDisplayName(member)}</Text>
                      <Text className="text-af-silver text-xs mt-1">{member.email}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {selectedResetPasswordMember ? (
                <View className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <Text className="text-white font-semibold">Selected Member</Text>
                  <Text className="text-af-silver text-sm mt-1">{getDisplayName(selectedResetPasswordMember)}</Text>
                  <Text className="text-af-silver text-xs mt-1">{selectedResetPasswordMember.email}</Text>

                  <Text className="text-white/60 text-sm mt-4 mb-2">New Password</Text>
                  <View className="bg-white/10 rounded-xl px-4 py-3 border border-white/10">
                    <TextInput
                      value={adminResetPasswordValue}
                      onChangeText={setAdminResetPasswordValue}
                      placeholder="Enter new password"
                      placeholderTextColor="#ffffff40"
                      secureTextEntry
                      autoCapitalize="none"
                      className="text-white"
                    />
                  </View>

                  <Text className="text-white/60 text-sm mt-4 mb-2">Confirm New Password</Text>
                  <View className="bg-white/10 rounded-xl px-4 py-3 border border-white/10">
                    <TextInput
                      value={adminResetPasswordConfirm}
                      onChangeText={setAdminResetPasswordConfirm}
                      placeholder="Re-enter new password"
                      placeholderTextColor="#ffffff40"
                      secureTextEntry
                      autoCapitalize="none"
                      className="text-white"
                    />
                  </View>

                  <Pressable
                    onPress={handleAdminResetUserPassword}
                    disabled={isAdminResettingPassword}
                    className={cn(
                      "py-4 rounded-xl mt-5",
                      isAdminResettingPassword ? "bg-white/10" : "bg-af-warning"
                    )}
                  >
                    <Text className="text-white font-bold text-center">
                      {isAdminResettingPassword ? 'Resetting...' : 'Reset Password'}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View className="bg-white/5 border border-white/10 rounded-2xl p-6 items-center">
                  <Shield size={28} color="#C0C0C0" />
                  <Text className="text-white font-semibold mt-3">Select a Member</Text>
                  <Text className="text-af-silver text-sm mt-1 text-center">
                    Choose a member above to set their new password.
                  </Text>
                </View>
              )}
            </ScrollView>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      <Modal visible={showUFPMConfirmModal} transparent animationType="fade">
        <View className="flex-1 bg-black/80 items-center justify-center p-6">
          <View className="bg-af-navy rounded-3xl p-6 w-full max-w-sm border border-white/20">
            <Text className="text-white text-xl font-bold mb-4">Confirm UFPM Change</Text>
            <Text className="text-af-silver mb-3">
              {selectedUFPMMemberId
                ? `Make ${getDisplayName(members.find((member) => member.id === selectedUFPMMemberId) ?? { rank: '', firstName: '', lastName: '' })} the UFPM?`
                : 'Select a member first.'}
            </Text>
            <View className="bg-af-warning/20 border border-af-warning/40 rounded-xl p-4 mb-6">
              <Text className="text-af-warning text-sm">
                This action cannot be undone in the app. You would need to manually assign a different UFPM later if you want to change it.
              </Text>
            </View>
            <View className="flex-row">
              <Pressable
                onPress={() => setShowUFPMConfirmModal(false)}
                className="flex-1 bg-white/10 py-3 rounded-xl mr-2"
              >
                <Text className="text-white text-center font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmUFPM}
                className="flex-1 bg-af-gold py-3 rounded-xl ml-2"
              >
                <Text className="text-af-navy text-center font-semibold">Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showInstallModal} transparent animationType="fade">
        <View className="flex-1 bg-black/80 items-center justify-center p-6">
          <View className="bg-af-navy rounded-3xl p-6 w-full max-w-md border border-white/20">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-white text-xl font-bold">Add to Home Screen</Text>
              <Pressable
                onPress={() => setShowInstallModal(false)}
                className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
              >
                <X size={20} color="#C0C0C0" />
              </Pressable>
            </View>

            {isStandalonePwa ? (
              <View className="bg-emerald-500/20 border border-emerald-400/40 rounded-xl p-4">
                <Text className="text-emerald-200 font-semibold">FitFlight is already installed</Text>
                <Text className="text-emerald-100 text-sm mt-1">
                  You already opened the home-screen version of the app on this device.
                </Text>
              </View>
            ) : (
              <>
                <Text className="text-af-silver mb-4">
                  Use the steps below so FitFlight is added with the proper icon and opens like an app.
                </Text>

                {installPromptEvent && isAndroid ? (
                  <Pressable
                    onPress={() => { void handleInstallToHomeScreen(); }}
                    className="bg-af-accent py-4 rounded-xl items-center justify-center mb-4"
                  >
                    <Text className="text-white font-bold">Install on This Device</Text>
                  </Pressable>
                ) : null}

                {isIos ? (
                  <View className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
                    <Text className="text-white font-semibold">iPhone / iPad</Text>
                    <Text className="text-af-silver text-sm mt-2">1. Open FitFlight in Safari, not Chrome or another browser.</Text>
                    <Text className="text-af-silver text-sm mt-1">2. Tap the Share button at the bottom of Safari.</Text>
                    <Text className="text-af-silver text-sm mt-1">3. Scroll down in the share sheet and tap Add to Home Screen.</Text>
                    <Text className="text-af-silver text-sm mt-1">4. Confirm the name says FitFlight, then tap Add in the top-right corner.</Text>
                    <Text className="text-af-silver text-sm mt-1">5. Launch FitFlight from the new home screen icon for the app-style experience.</Text>
                    {!isSafari ? (
                      <Text className="text-af-warning text-sm mt-3">
                        You are not in Safari right now. On iPhone, Add to Home Screen only works correctly from Safari.
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                {isAndroid ? (
                  <View className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
                    <Text className="text-white font-semibold">Android</Text>
                    <Text className="text-af-silver text-sm mt-2">
                      {installPromptEvent
                        ? 'Tap the install button above. If the prompt does not appear, use your browser menu and choose Add to Home screen or Install app.'
                        : 'Open your browser menu and choose Add to Home screen or Install app.'}
                    </Text>
                  </View>
                ) : null}

                {isDesktop ? (
                  <View className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
                    <Text className="text-white font-semibold">Desktop</Text>
                    <Text className="text-af-silver text-sm mt-2">
                      {installPromptEvent
                        ? 'Your browser supports installing FitFlight as a desktop app. Close this message and use the Add to Home Screen button again to trigger the install prompt.'
                        : 'If your browser supports app install, look for an install icon in the address bar or use the browser menu and choose Install FitFlight or Create shortcut.'}
                    </Text>
                  </View>
                ) : null}

                {!isIos && !isAndroid && !isDesktop ? (
                  <View className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
                    <Text className="text-white font-semibold">Mobile Browser</Text>
                    <Text className="text-af-silver text-sm mt-2">
                      Open FitFlight in your phone browser, then use the browser share or menu options to add it to your home screen.
                    </Text>
                  </View>
                ) : null}
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showDeveloperMessageModal} transparent animationType="none">
        <Animated.View entering={getWebSafeFadeIn(180)} className="flex-1 bg-black/80 justify-end">
          <Animated.View entering={getWebSafeSlideInDown(260)} style={{ height: '82%', overflow: 'hidden' }}>
          <ThemeChrome theme={themePalette} variant="feature" blurIntensity={modalBlurIntensity} fill style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '100%', overflow: 'hidden' }}>
          <View className="flex-1 p-6 pb-6">
            <View className="flex-row items-start justify-between mb-4">
              <View className="flex-1 pr-4">
                <Text style={getThemeHeadingStyle(themePalette, 22)}>Message the FitFlight Team</Text>
                <Text style={[getThemeBodyStyle(themePalette, 14, themePalette.textSecondary), { marginTop: 4 }]}>
                  {activeSupportContact?.key === 'project_coordinator'
                    ? 'Direct message with the Project Coordinator.'
                    : activeSupportContact
                      ? `Direct message with the ${activeSupportContact.title}.`
                      : 'Send a support message without leaving the app.'}
                </Text>
              </View>
              <Pressable
                onPress={() => setShowDeveloperMessageModal(false)}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={getThemeControlStyle(themePalette)}
              >
                <X size={20} color={themePalette.textSecondary} />
              </Pressable>
            </View>

            {activeSupportThreadId ? (
              <View className="mb-4 flex-row justify-end">
                <Pressable
                  onPress={() => handleDeleteSupportThread(activeSupportThreadId)}
                  className="rounded-full border border-af-danger/40 bg-af-danger/10 px-3 py-2"
                >
                  <Text className="text-af-danger text-xs font-semibold">Delete Conversation</Text>
                </Pressable>
              </View>
            ) : null}

            <View className="flex-1 min-h-0 flex-row">
              <View className="w-[38%] pr-4 min-h-0">
                <Text className="text-af-silver text-xs uppercase tracking-wider mb-2">Subject</Text>
                <TextInput
                  value={supportSubject}
                  onChangeText={setSupportSubject}
                  placeholder="e.g. Workout sync"
                  placeholderTextColor="#94A3B8"
                  className="text-white bg-white/5 border border-white/10 rounded-2xl px-4 py-4 mb-4"
                />

                <View className="flex-1 min-h-0">
                  <Text className="text-af-silver text-xs uppercase tracking-wider mb-2">Message</Text>
                  <TextInput
                    value={supportBody}
                    onChangeText={setSupportBody}
                    placeholder="Type your message here"
                    placeholderTextColor="#94A3B8"
                    multiline
                    textAlignVertical="top"
                    className="flex-1 text-white bg-white/5 border border-white/10 rounded-2xl px-4 py-4"
                    style={{ minHeight: 0 }}
                  />
                </View>

                {supportError ? (
                  <Text className="text-af-danger text-sm mt-3">{supportError}</Text>
                ) : null}

                <Pressable
                  onPress={handleSendSupportMessage}
                  disabled={supportSending}
                  className={cn(
                    "mt-4 rounded-xl py-4 items-center justify-center",
                    supportSending ? "opacity-60" : ""
                  )}
                  style={supportSending ? getThemeControlStyle(themePalette) : { backgroundColor: themePalette.accent }}
                >
                  <Text className={cn("font-semibold", supportSending ? "text-white/50" : "text-white")}>
                    {supportSending ? 'Sending...' : 'Send Message'}
                  </Text>
                </Pressable>
              </View>

              <View className="flex-1 min-h-0">
                <Text className="text-af-silver text-xs uppercase tracking-wider mb-2">Conversation</Text>
                <View className="flex-1 min-h-0 bg-white/5 border border-white/10 rounded-2xl p-4">
                  <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
                    {supportMessagesLoading ? (
                      <Text className="text-af-silver text-center py-8">Loading conversation...</Text>
                    ) : activeSupportMessages.length === 0 ? (
                      <Text className="text-af-silver text-center py-8">
                        {activeSupportContact ? `Your message will start a private conversation with the ${activeSupportContact.title.toLowerCase()}.` : 'Your message will start a private conversation with the FitFlight team.'}
                      </Text>
                    ) : (
                      activeSupportMessages.map((message) => (
                        <View
                          key={message.id}
                          className={cn(
                            "rounded-2xl p-4 mb-3 border",
                            message.isFromOwner
                              ? "bg-af-accent/10 border-af-accent/30"
                              : "bg-white/5 border-white/10"
                          )}
                        >
                          <View className="flex-row items-center justify-between mb-1">
                            <Text className="text-white font-semibold">
                              {message.isFromOwner ? message.senderName : 'You'}
                            </Text>
                            <Text className="text-af-silver text-xs">
                              {new Date(message.createdAt).toLocaleString()}
                            </Text>
                          </View>
                          {message.subject ? (
                            <Text className="text-af-silver text-xs mb-2">{message.subject}</Text>
                          ) : null}
                          <Text className="text-white leading-6">{message.body}</Text>
                        </View>
                      ))
                    )}
                  </ScrollView>
                </View>
              </View>
            </View>
          </View>
          </ThemeChrome>
          </Animated.View>
        </Animated.View>
      </Modal>

      <Modal visible={showSupportInboxModal} transparent animationType="none">
        <Animated.View entering={getWebSafeFadeIn(180)} className="flex-1 bg-black/80 justify-end">
          <Animated.View entering={getWebSafeSlideInDown(260)} style={{ height: '84%', overflow: 'hidden' }}>
          <ThemeChrome theme={themePalette} variant="feature" blurIntensity={modalBlurIntensity} fill style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '100%', overflow: 'hidden' }}>
          <View className="flex-1 p-6 pb-6">
            <View className="flex-row items-center justify-between mb-4">
              <View>
                <Text style={getThemeHeadingStyle(themePalette, 22)}>Support Inbox</Text>
                <Text style={[getThemeBodyStyle(themePalette, 14, themePalette.textSecondary), { marginTop: 4 }]}>FitFlight team message center</Text>
              </View>
              <Pressable
                onPress={() => setShowSupportInboxModal(false)}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={getThemeControlStyle(themePalette)}
              >
                <X size={20} color={themePalette.textSecondary} />
              </Pressable>
            </View>

            <View className="flex-1 min-h-0 flex-row">
              <View className="w-[38%] pr-3 min-h-0">
                <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
                  {supportLoading ? (
                    <Text className="text-af-silver text-center py-8">Loading support inbox...</Text>
                  ) : supportThreads.length === 0 ? (
                    <Text className="text-af-silver text-center py-8">No support messages yet</Text>
                  ) : (
                    supportThreads.map((thread) => (
                      <View
                        key={thread.id}
                        className={cn(
                          "rounded-2xl p-4 mb-3 border",
                          thread.id === activeSupportThreadId
                            ? "bg-af-accent/15 border-af-accent/40"
                            : "bg-white/5 border-white/10"
                        )}
                      >
                        <Pressable onPress={() => handleSelectSupportThread(thread.id)}>
                        <View className="flex-row items-start justify-between">
                          <View className="flex-1">
                        <Text className="text-white font-semibold" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{thread.requesterName}</Text>
                        <Text className="text-af-silver text-xs mt-1" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{thread.subject}</Text>
                          </View>
                          {thread.unreadForOwner > 0 ? (
                            <View className="bg-af-danger rounded-full px-2 py-1 ml-2">
                              <Text className="text-white text-xs font-bold">{thread.unreadForOwner}</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text className="text-af-silver text-xs mt-2" numberOfLines={2}>{thread.latestMessagePreview}</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleDeleteSupportThread(thread.id)}
                          className="mt-3 self-start rounded-full border border-af-danger/40 bg-af-danger/10 px-3 py-1.5"
                        >
                          <Text className="text-af-danger text-xs font-semibold">Delete</Text>
                        </Pressable>
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>

              <View className="flex-1 min-h-0">
                {activeSupportThreadId ? (
                  <>
                    <View className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4">
                      {(() => {
                        const activeThread = supportThreads.find((thread) => thread.id === activeSupportThreadId);
                        if (!activeThread) {
                          return <Text className="text-af-silver">Select a message to view details.</Text>;
                        }

                        return (
                          <>
                            <Text className="text-white font-semibold">{activeThread.requesterName}</Text>
                            <Text className="text-af-silver text-sm mt-1">{activeThread.requesterEmail}</Text>
                            <Text className="text-af-silver text-sm">{activeThread.requesterSquadron}</Text>
                            <Text className="text-white mt-3">{activeThread.subject}</Text>
                          </>
                        );
                      })()}
                    </View>

                    <View className="flex-1 min-h-0 bg-white/5 border border-white/10 rounded-2xl p-4">
                      <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
                        {supportMessagesLoading ? (
                          <Text className="text-af-silver text-center py-8">Loading conversation...</Text>
                        ) : (
                          activeSupportMessages.map((message) => (
                            <View
                              key={message.id}
                              className={cn(
                                "rounded-2xl p-4 mb-3 border",
                                message.isFromOwner
                                  ? "bg-af-accent/10 border-af-accent/30"
                                  : "bg-white/5 border-white/10"
                              )}
                            >
                              <View className="flex-row items-center justify-between mb-1">
                                <Text className="text-white font-semibold">
                                  {message.isFromOwner ? 'You' : message.senderName}
                                </Text>
                                <Text className="text-af-silver text-xs">
                                  {new Date(message.createdAt).toLocaleString()}
                                </Text>
                              </View>
                              <Text className="text-white leading-6">{message.body}</Text>
                            </View>
                          ))
                        )}
                      </ScrollView>
                    </View>

                    <View className="mt-4">
                      <Text className="text-af-silver text-xs uppercase tracking-wider mb-2">Reply</Text>
                      <TextInput
                        value={supportBody}
                        onChangeText={setSupportBody}
                        placeholder="Reply to this member"
                        placeholderTextColor="#94A3B8"
                        multiline
                        textAlignVertical="top"
                        className="text-white bg-white/5 border border-white/10 rounded-2xl px-4 py-4"
                        style={{ minHeight: 110, maxHeight: 150 }}
                      />
                    </View>

                    {supportError ? (
                      <Text className="text-af-danger text-sm mt-3">{supportError}</Text>
                    ) : null}

                    <Pressable
                      onPress={handleSendSupportMessage}
                      disabled={supportSending}
                      className={cn(
                        "mt-4 rounded-xl py-4 items-center justify-center",
                        supportSending ? "bg-white/10" : "bg-af-accent"
                      )}
                    >
                      <Text className={cn("font-semibold", supportSending ? "text-white/50" : "text-white")}>
                        {supportSending ? 'Sending...' : 'Send Reply'}
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <View className="flex-1 bg-white/5 border border-white/10 rounded-2xl items-center justify-center p-6">
                    <Text className="text-af-silver text-center">Select a member message to open the conversation.</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
          </ThemeChrome>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Notifications Modal */}
      <Modal visible={showNotificationsModal} transparent animationType="none">
        <Animated.View entering={getWebSafeFadeIn(180)} className="flex-1 bg-black/80 justify-end">
          <Animated.View entering={getWebSafeSlideInDown(260)}>
            <ThemeChrome theme={themePalette} variant="feature" blurIntensity={modalBlurIntensity} style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' }}>
            <View className="p-6 pb-12">
            <View className="flex-row items-center justify-between mb-6">
              <Text style={getThemeHeadingStyle(themePalette, 22)}>Notifications</Text>
              <Pressable
                onPress={() => setShowNotificationsModal(false)}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={getThemeControlStyle(themePalette)}
              >
                <X size={20} color={themePalette.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {backendNotifications.length === 0 && supportNotifications.length === 0 && manualWorkoutNotifications.length === 0 && !appNotificationsLoading ? (
                <Text className="text-white/40 text-center py-8">No notifications</Text>
              ) : (
                <>
                  {appNotificationsLoading && backendNotifications.length === 0 ? (
                    <Text className="text-af-silver text-center py-4">Loading notifications...</Text>
                  ) : null}
                  {manualWorkoutNotifications.map((notification) => (
                    <Pressable
                      key={notification.id}
                      onPress={() => handleOpenManualWorkoutNotification(notification.submissionId, notification.isReview)}
                      className={cn(
                        "p-4 rounded-xl mb-3 border",
                        notification.isReview ? "bg-af-warning/10 border-af-warning/30" : "bg-af-success/10 border-af-success/30"
                      )}
                    >
                      <Text className="text-white font-semibold">{notification.title}</Text>
                      <Text className="text-af-silver text-sm mt-1">{notification.message}</Text>
                      <Text className={cn("text-xs mt-2", notification.isReview ? "text-af-warning" : "text-af-success")}>
                        Tap to {notification.isReview ? 'review this workout proof' : 'view this update'}
                      </Text>
                    </Pressable>
                  ))}
                  {supportNotifications.map((notification) => (
                    <Pressable
                      key={notification.id}
                      onPress={() => handleOpenSupportNotification(notification.threadId)}
                      className="p-4 rounded-xl mb-3 border bg-af-accent/10 border-af-accent/30"
                    >
                      <Text className="text-white font-semibold">{notification.title}</Text>
                      <Text className="text-af-silver text-sm mt-1">{notification.message}</Text>
                      <Text className="text-af-accent text-xs mt-2">
                        Tap to open {canViewSupportInbox ? 'the support inbox' : 'your conversation'}
                      </Text>
                    </Pressable>
                  ))}

                  {backendNotifications.map((notification) => {
                    const isPTLRequest = notification.type === 'ptl_request';
                    return (
                      <Pressable
                        key={notification.id}
                        onPress={() => handleOpenAppNotification(notification)}
                        className={cn(
                          "p-4 rounded-xl mb-3 border",
                          notification.readAt ? "bg-white/5 border-white/10" : "bg-af-accent/10 border-af-accent/30"
                        )}
                      >
                        <Text className="text-white font-semibold">{notification.title}</Text>
                        <Text className="text-af-silver text-sm mt-1">{notification.message}</Text>
                        {isPTLRequest && !notification.readAt && (
                          <Text className="text-af-accent text-xs mt-2">Tap to review</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </>
              )}
            </ScrollView>
            </View>
            </ThemeChrome>
            </Animated.View>
        </Animated.View>
      </Modal>

      {/* PFL Request Review Modal */}
      <Modal visible={showPTLRequestModal} transparent animationType="fade">
        <View className="flex-1 bg-black/80 items-center justify-center p-6">
          <View className="bg-af-navy rounded-3xl p-6 w-full max-w-sm border border-white/20">
            <Text className="text-white text-xl font-bold mb-4">PFL Request</Text>

            {selectedPTLRequest && (() => {
              const requestingMember = members.find(m => m.id === selectedPTLRequest);
              if (!requestingMember) return null;

              const requesterDisplayName = getDisplayName(requestingMember);

              return (
                <>
                  <View className="bg-white/5 rounded-xl p-4 mb-4">
                    <Text className="text-white font-semibold text-lg">{requesterDisplayName}</Text>
                    <Text className="text-af-silver">{formatFlightDisplay(requestingMember.flight)}</Text>
                    <Text className="text-af-silver text-sm">{requestingMember.email}</Text>
                  </View>

                  <Text className="text-af-silver mb-6">
                    This person has requested PFL status. Do you want to authorize them as a Physical Fitness Leader?
                  </Text>

                  <View className="flex-row space-x-3">
                    <Pressable
                      onPress={() => handlePTLRequest(selectedPTLRequest, false)}
                      className="flex-1 bg-af-danger/20 border border-af-danger/50 py-3 rounded-xl mr-2"
                    >
                      <Text className="text-af-danger text-center font-semibold">Reject</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handlePTLRequest(selectedPTLRequest, true)}
                      className="flex-1 bg-af-success/20 border border-af-success/50 py-3 rounded-xl ml-2"
                    >
                      <Text className="text-af-success text-center font-semibold">Authorize</Text>
                    </Pressable>
                  </View>
                </>
              );
            })()}

            <Pressable
              onPress={() => {
                setShowPTLRequestModal(false);
                setSelectedPTLRequest(null);
              }}
              className="mt-4"
            >
              <Text className="text-af-silver text-center">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showAuditTrailModal} transparent animationType="fade">
        <View className="flex-1 bg-black/80 items-center justify-center p-6">
          <ThemeChrome
            theme={themePalette}
            variant="feature"
            blurIntensity={modalBlurIntensity + 8}
            style={{ width: '100%', maxWidth: 760, maxHeight: '86%', borderRadius: 24 }}
            fill
          >
            <View className="p-6 flex-1">
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-1 pr-4">
                  <Text style={getThemeHeadingStyle(themePalette, 22)}>Admin Action Audit Trail</Text>
                  <Text style={[getThemeBodyStyle(themePalette, 14, themePalette.textSecondary), { marginTop: 4 }]}>
                    History of roster, role, and security-related admin changes.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setShowAuditTrailModal(false)}
                  className="w-8 h-8 rounded-full items-center justify-center"
                  style={getThemeControlStyle(themePalette)}
                >
                  <X size={20} color={themePalette.textSecondary} />
                </Pressable>
              </View>

              <ScrollView style={{ flex: 1, minHeight: 0 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
                {auditTrailLoading ? (
                  <Text style={getThemeBodyStyle(themePalette, 14, themePalette.textSecondary)}>Loading audit trail...</Text>
                ) : auditTrailError ? (
                  <Text className="text-af-danger">{auditTrailError}</Text>
                ) : auditTrailEntries.length === 0 ? (
                  <Text style={getThemeBodyStyle(themePalette, 14, themePalette.textSecondary)}>No admin actions logged yet.</Text>
                ) : (
                  auditTrailEntries.map((entry) => (
                    <ThemeChrome key={entry.id} theme={themePalette} variant="alt" style={{ marginBottom: 12 }}>
                      <View className="p-4">
                        <View className="flex-row items-start justify-between">
                          <View className="flex-1 pr-3">
                            <Text style={getThemeHeadingStyle(themePalette, 16)}>{formatAuditActionLabel(entry.actionType)}</Text>
                            <Text style={[getThemeBodyStyle(themePalette, 13, themePalette.textSecondary), { marginTop: 4 }]}>
                              {entry.actorName} · {new Date(entry.createdAt).toLocaleString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false,
                                year: 'numeric',
                                month: 'short',
                                day: '2-digit',
                              })}
                            </Text>
                          </View>
                          <View className="rounded-full border px-3 py-1" style={{ borderColor: `${themePalette.accent}55`, backgroundColor: `${themePalette.accent}18` }}>
                            <Text style={getThemeBodyStyle(themePalette, 11, themePalette.accent)}>{entry.actorRole}</Text>
                          </View>
                        </View>
                        {entry.targetName || entry.targetEmail ? (
                          <Text style={[getThemeBodyStyle(themePalette, 13, themePalette.textPrimary), { marginTop: 10 }]}>
                            Target: {entry.targetName ?? entry.targetEmail}
                          </Text>
                        ) : null}
                        {formatAuditDetailsPreview(entry.details) ? (
                          <Text style={[getThemeBodyStyle(themePalette, 12, themePalette.textSecondary), { marginTop: 8 }]}>
                            {formatAuditDetailsPreview(entry.details)}
                          </Text>
                        ) : null}
                      </View>
                    </ThemeChrome>
                  ))
                )}
              </ScrollView>
            </View>
          </ThemeChrome>
        </View>
      </Modal>

      <Modal visible={showSettingsModal} transparent animationType="fade">
        <View className="flex-1 bg-black/80 items-center justify-center p-6">
          <View
            style={[
              getThemeCardStyle(themePalette, 'feature'),
              {
                width: '100%',
                maxWidth: 384,
                maxHeight: '88%',
                alignSelf: 'center',
                padding: 24,
                overflow: 'hidden',
              },
            ]}
          >
            <BlurView intensity={modalBlurIntensity} tint="dark" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
            <View style={{ backgroundColor: 'rgba(8, 14, 24, 0.28)', position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-1 pr-4">
                <Text style={getThemeHeadingStyle(themePalette, 22)}>Settings</Text>
                <Text style={[getThemeBodyStyle(themePalette, 14, themePalette.textSecondary), { marginTop: 4 }]}>Account and app preferences.</Text>
              </View>
              <Pressable
                onPress={() => setShowSettingsModal(false)}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={getThemeControlStyle(themePalette)}
              >
                <X size={20} color={themePalette.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 16 }}
              style={{ flexGrow: 0 }}
            >
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedRank(user?.rank ?? 'SSgt');
                  setShowSettingsModal(false);
                  setShowChangeRankModal(true);
                }}
                className="flex-row items-center rounded-xl border border-white/20 bg-white/10 p-4 mt-3"
              >
                <User size={20} color="#C0C0C0" />
                <View className="ml-3 flex-1">
                  <Text className="text-white font-semibold">Change My Rank</Text>
                  <Text className="text-af-silver text-xs mt-1">Update how your rank appears on your Account and Profile.</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowSettingsModal(false);
                  setSelectedSquadron(user?.squadron ?? 'Hawks');
                  setShowChangeSquadronModal(true);
                }}
                className="mt-3 flex-row items-center rounded-xl border border-white/20 bg-white/10 p-4"
              >
                <Building2 size={20} color="#C0C0C0" />
                <View className="ml-3 flex-1">
                  <Text className="text-white font-semibold">Change My Squadron</Text>
                  <Text className="text-af-silver text-xs mt-1">Update the squadron tied to this account.</Text>
                </View>
              </Pressable>

              {isWeb ? (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowSettingsModal(false);
                    handleOpenInstallHelp();
                  }}
                  className="flex-row items-center rounded-xl border border-white/20 bg-white/10 p-4 mt-3"
                >
                  <LogIn size={20} color="#4A90D9" />
                  <View className="ml-3 flex-1">
                    <Text className="text-white font-semibold">Add to Home Screen</Text>
                    <Text className="text-af-silver text-xs mt-1">Install FitFlight on your phone or computer.</Text>
                  </View>
                </Pressable>
              ) : null}

              <View className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <Text className="text-white/60 text-xs uppercase tracking-wider mb-3">Profile Visibility</Text>

                <View className="flex-row items-center justify-between py-2">
                  <View className="flex-1 pr-4">
                    <Text className="text-white font-semibold">Show Workout History on Profile</Text>
                    <Text className="text-af-silver text-xs mt-1">Let other users open your Workout History when viewing your Profile.</Text>
                  </View>
                  <SettingsToggle
                    value={profileVisibilitySettings.workoutHistory}
                    disabled={isUpdatingProfileSettings}
                    onPress={() => {
                      Haptics.selectionAsync();
                      void persistProfileVisibilitySettings({ showWorkoutHistoryOnProfile: !profileVisibilitySettings.workoutHistory });
                    }}
                  />
                </View>

                <View className="h-px bg-white/10 my-2" />

                <View className="flex-row items-center justify-between py-2">
                  <View className="flex-1 pr-4">
                    <Text className="text-white font-semibold">Show Workout Uploads on Profile</Text>
                    <Text className="text-af-silver text-xs mt-1">Let other users view your uploaded workout section on your Profile.</Text>
                  </View>
                  <SettingsToggle
                    value={profileVisibilitySettings.workoutUploads}
                    disabled={isUpdatingProfileSettings}
                    onPress={() => {
                      Haptics.selectionAsync();
                      void persistProfileVisibilitySettings({ showWorkoutUploadsOnProfile: !profileVisibilitySettings.workoutUploads });
                    }}
                  />
                </View>

                <View className="h-px bg-white/10 my-2" />

                <View className="flex-row items-center justify-between py-2">
                  <View className="flex-1 pr-4">
                    <Text className="text-white font-semibold">Show PFRA Records on Profile</Text>
                    <Text className="text-af-silver text-xs mt-1">Let other users view your PFRA section and PFRA History on your Profile.</Text>
                  </View>
                  <SettingsToggle
                    value={profileVisibilitySettings.pfraRecords}
                    disabled={isUpdatingProfileSettings}
                    onPress={() => {
                      Haptics.selectionAsync();
                      void persistProfileVisibilitySettings({ showPFRARecordsOnProfile: !profileVisibilitySettings.pfraRecords });
                    }}
                  />
                </View>
              </View>

              <View className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <Text className="text-white/60 text-xs uppercase tracking-wider mb-3">Theme</Text>
                <Text className="text-af-silver text-xs mb-3">Choose how FitFlight looks on this device.</Text>
                <View className="flex-row flex-wrap" style={{ gap: 10 }}>
                  {Object.values(APP_THEMES).map((theme) => {
                    const isSelected = appTheme === theme.id;
                    return (
                      <Pressable
                        key={theme.id}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setAppTheme(theme.id);
                        }}
                        className={cn(
                          "w-[48%] rounded-2xl border p-3",
                          isSelected ? "border-af-accent bg-af-accent/10" : "border-white/10 bg-black/10"
                        )}
                      >
                        <View className="mb-2 flex-row" style={{ gap: 6 }}>
                    {theme.gradient.map((color, index) => (
                      <View key={`${theme.id}-${index}-${color}`} style={{ backgroundColor: color, width: 18, height: 18, borderRadius: 999 }} />
                    ))}
                        </View>
                        <Text className="text-white font-semibold">{theme.label}</Text>
                        <Text className="mt-1 text-xs text-af-silver">
                          {theme.id === 'default'
                            ? 'Current FitFlight look'
                            : theme.id === 'dark'
                              ? 'Low-glare dark shell'
                              : theme.id === 'pixel'
                                ? 'Retro arcade-inspired'
                                : theme.id === 'cyber'
                                  ? 'Neon tactical glow'
                                  : theme.id === 'space'
                                    ? 'Deep-space contrast'
                                    : 'Soft floral glow'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showChangeRankModal} transparent animationType="fade">
        <View className="flex-1 bg-black/80 items-center justify-center p-6">
          <View className="bg-af-navy rounded-3xl p-6 w-full max-w-sm border border-white/20">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-1 pr-4">
                <Text className="text-white text-xl font-bold">Change My Rank</Text>
                <Text className="text-af-silver text-sm mt-1">Choose how your rank should appear in FitFlight.</Text>
              </View>
              <Pressable
                onPress={() => setShowChangeRankModal(false)}
                className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
              >
                <X size={20} color="#C0C0C0" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
              {RANK_GROUPS.map((group, groupIndex) => (
                <View key={group.label} className={groupIndex > 0 ? 'mt-4' : ''}>
                  <Text className="text-af-silver text-xs uppercase tracking-[0.4px] mb-2">{group.label}</Text>
                  <View className="flex-row flex-wrap" style={{ gap: 10 }}>
                    {group.ranks.map((rank) => {
                      const isSelected = selectedRank === rank;
                      return (
                        <Pressable
                          key={rank}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setSelectedRank(rank);
                          }}
                          className={cn(
                            "rounded-full border px-4 py-2",
                            isSelected ? "border-af-accent bg-af-accent/20" : "border-white/10 bg-white/5"
                          )}
                        >
                          <Text className={cn("font-semibold", isSelected ? "text-af-accent" : "text-white")}>
                            {rank}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>

            <View className="flex-row mt-6">
              <Pressable
                onPress={() => setShowChangeRankModal(false)}
                className="flex-1 bg-white/10 py-3 rounded-xl mr-2"
              >
                <Text className="text-white text-center font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void persistOwnRank(selectedRank);
                }}
                disabled={isUpdatingProfileSettings || selectedRank === (user?.rank ?? 'SSgt')}
                className={cn(
                  "flex-1 py-3 rounded-xl ml-2",
                  isUpdatingProfileSettings || selectedRank === (user?.rank ?? 'SSgt') ? "bg-white/10" : "bg-af-accent"
                )}
              >
                <Text className="text-white text-center font-semibold">
                  {isUpdatingProfileSettings ? 'Saving...' : 'Save Rank'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Squadron Modal */}
      <Modal visible={showChangeSquadronModal} transparent animationType="fade">
        <View className="flex-1 bg-black/80 items-center justify-center p-6">
          <View className="bg-af-navy rounded-3xl p-6 w-full max-w-sm border border-white/20">
            <Text className="text-white text-xl font-bold mb-4">Change My Squadron</Text>

            {/* Warning for PFLs */}
              {isPFLAccountType(user?.accountType) && (
              <View className="flex-row items-start bg-af-warning/20 border border-af-warning/50 rounded-xl p-4 mb-4">
                <AlertTriangle size={20} color="#F59E0B" />
                <View className="flex-1 ml-3">
                  <Text className="text-af-warning font-semibold">Warning</Text>
                  <Text className="text-af-warning/80 text-sm">
                    Changing squadrons will remove your PFL status. You'll need to request PFL authorization again in your new squadron.
                  </Text>
                </View>
              </View>
            )}

            <Text className="text-af-silver mb-3">Select your new squadron:</Text>

            <View className="mb-4">
              {SQUADRONS.map((squadron) => (
                <Pressable
                  key={squadron}
                  onPress={() => {
                    setSelectedSquadron(squadron);
                    Haptics.selectionAsync();
                  }}
                  className={cn(
                    "flex-row items-center p-4 rounded-xl mb-2 border",
                    selectedSquadron === squadron
                      ? "bg-af-accent/20 border-af-accent"
                      : "bg-white/5 border-white/10"
                  )}
                >
                  <Building2 size={20} color={selectedSquadron === squadron ? "#4A90D9" : "#C0C0C0"} />
                  <Text className={cn(
                    "ml-3 font-medium",
                    selectedSquadron === squadron ? "text-white" : "text-af-silver"
                  )}>{squadron}</Text>
                  {user?.squadron === squadron && (
                    <Text className="text-af-silver text-xs ml-auto">(Current)</Text>
                  )}
                </Pressable>
              ))}
            </View>

            <View className="flex-row">
              <Pressable
                onPress={() => setShowChangeSquadronModal(false)}
                className="flex-1 bg-white/10 py-3 rounded-xl mr-2"
              >
                <Text className="text-white text-center font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleChangeSquadron}
                disabled={selectedSquadron === user?.squadron}
                className={cn(
                  "flex-1 py-3 rounded-xl ml-2",
                  selectedSquadron === user?.squadron
                    ? "bg-white/10"
                    : "bg-af-accent"
                )}
              >
                <Text className={cn(
                  "text-center font-semibold",
                  selectedSquadron === user?.squadron ? "text-white/40" : "text-white"
                )}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

        <Modal visible={showWorkoutReviewModal} transparent animationType="fade">
        <View className="flex-1 bg-black/80 items-center justify-center p-6">
          <View className="bg-af-navy rounded-3xl p-6 w-full max-w-md border border-white/20">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-white text-xl font-bold">
                {canReviewManualWorkouts && activeWorkoutSubmission?.status === 'pending' ? 'Review Workout Proof' : 'Workout Update'}
              </Text>
              <Pressable
                onPress={() => {
                  setShowWorkoutReviewModal(false);
                  setActiveWorkoutSubmission(null);
                  setManualWorkoutReviewNote('');
                  setManualWorkoutError(null);
                }}
                className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
              >
                <X size={20} color="#C0C0C0" />
              </Pressable>
            </View>

            {activeWorkoutSubmission?.proofImageData ? (
              <Image
                source={{ uri: activeWorkoutSubmission.proofImageData }}
                className="w-full h-48 rounded-2xl mb-4"
                resizeMode="cover"
              />
            ) : null}

            {activeWorkoutSubmission ? (
              <>
                <View className="bg-white/5 rounded-xl p-4 mb-4">
                  <View className="flex-row justify-between mb-2">
                    <Text className="text-af-silver">Member</Text>
                    <Text className="text-white font-semibold">{activeWorkoutSubmission.memberName}</Text>
                  </View>
                  <View className="flex-row justify-between mb-2">
                    <Text className="text-af-silver">Workout</Text>
                    <Text className="text-white font-semibold">{activeWorkoutSubmission.workoutType}</Text>
                  </View>
                  <View className="flex-row justify-between mb-2">
                    <Text className="text-af-silver">Duration</Text>
                    <Text className="text-white font-semibold">{activeWorkoutSubmission.duration} min</Text>
                  </View>
                  <View className="flex-row justify-between mb-2">
                    <Text className="text-af-silver">Distance</Text>
                    <Text className="text-white font-semibold">
                      {typeof activeWorkoutSubmission.distance === 'number' ? `${activeWorkoutSubmission.distance.toFixed(2)} mi` : 'N/A'}
                    </Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-af-silver">Status</Text>
                    <Text className={cn(
                      "font-semibold capitalize",
                      activeWorkoutSubmission.status === 'approved'
                        ? "text-af-success"
                        : activeWorkoutSubmission.status === 'denied'
                          ? "text-af-danger"
                          : "text-af-warning"
                    )}>
                      {activeWorkoutSubmission.status}
                    </Text>
                  </View>
                </View>

                {(activeWorkoutSubmission.status !== 'pending' || canReviewManualWorkouts) ? (
                  <View className="mb-4">
                    <Text className="text-white/60 text-sm mb-2">
                      {activeWorkoutSubmission.status === 'pending' ? 'Reviewer Note' : 'Review Note'}
                    </Text>
                    <TextInput
                      value={manualWorkoutReviewNote}
                      onChangeText={setManualWorkoutReviewNote}
                      editable={canReviewManualWorkouts && activeWorkoutSubmission.status === 'pending'}
                      placeholder={activeWorkoutSubmission.status === 'pending' ? 'Add a note if denying this workout' : 'No review note'}
                      placeholderTextColor="#ffffff40"
                      multiline
                      className="bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10 min-h-[88px]"
                    />
                  </View>
                ) : null}

                {manualWorkoutError ? (
                  <Text className="text-af-danger text-sm mb-4">{manualWorkoutError}</Text>
                ) : null}

                {canReviewManualWorkouts && activeWorkoutSubmission.status === 'pending' ? (
                  <View className="flex-row">
                    <Pressable
                      onPress={() => handleReviewManualWorkout(false)}
                      disabled={manualWorkoutSubmitting}
                      className="flex-1 bg-af-danger/20 border border-af-danger/50 py-3 rounded-xl mr-2"
                    >
                      <Text className="text-af-danger text-center font-semibold">Deny</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleReviewManualWorkout(true)}
                      disabled={manualWorkoutSubmitting}
                      className="flex-1 bg-af-success/20 border border-af-success/50 py-3 rounded-xl ml-2"
                    >
                      <Text className="text-af-success text-center font-semibold">
                        {manualWorkoutSubmitting ? 'Saving...' : 'Approve'}
                      </Text>
                    </Pressable>
                  </View>
                ) : activeWorkoutSubmission && activeWorkoutSubmission.memberId === user?.id ? (
                  <View className="flex-row">
                    <Pressable
                      onPress={() => {
                        setShowWorkoutReviewModal(false);
                        setActiveWorkoutSubmission(null);
                        setManualWorkoutReviewNote('');
                        setManualWorkoutError(null);
                      }}
                      className="flex-1 bg-white/10 py-3 rounded-xl mr-2"
                    >
                      <Text className="text-white text-center font-semibold">Close</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        const submission = activeWorkoutSubmission;
                        setShowWorkoutReviewModal(false);
                        setActiveWorkoutSubmission(null);
                        setManualWorkoutReviewNote('');
                        setManualWorkoutError(null);
                        router.push({
                          pathname: '/add-workout',
                          params: {
                            mode: 'edit',
                            submissionId: submission.id,
                            workoutType: submission.workoutType,
                            duration: String(submission.duration),
                            durationSeconds: String(submission.durationSeconds ?? 0),
                            distance: typeof submission.distance === 'number' ? String(submission.distance) : '',
                            isPrivate: String(submission.isPrivate),
                            screenshotUri: submission.proofImageData,
                            workoutDate: submission.workoutDate,
                            attendanceMarkedBySubmission: String(submission.attendanceMarkedBySubmission),
                          },
                        });
                      }}
                      className="flex-1 bg-af-accent py-3 rounded-xl ml-2"
                    >
                      <Text className="text-white text-center font-semibold">Edit & Resubmit</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => {
                      setShowWorkoutReviewModal(false);
                      setActiveWorkoutSubmission(null);
                      setManualWorkoutReviewNote('');
                      setManualWorkoutError(null);
                    }}
                    className="bg-af-accent py-3 rounded-xl"
                  >
                    <Text className="text-white text-center font-semibold">Close</Text>
                  </Pressable>
                )}
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={showWorkoutHistoryModal} transparent animationType="none">
        <Animated.View entering={getWebSafeFadeIn(180)} className="flex-1 bg-black/80 justify-end">
          <Animated.View entering={getWebSafeSlideInDown(260)} className="bg-af-navy rounded-t-3xl p-6 pb-12 max-h-[85%]">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-white text-xl font-bold">Workout History</Text>
              <Pressable
                onPress={() => setShowWorkoutHistoryModal(false)}
                className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
              >
                <X size={20} color="#C0C0C0" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {workoutHistoryWithProof.length === 0 ? (
                <Text className="text-white/40 text-center py-8">No workouts recorded yet.</Text>
              ) : (
                workoutHistoryWithProof.map((workout) => (
                  <View key={workout.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-4">
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1">
                        <Text className="text-white font-semibold">{workout.source === 'attendance' ? 'Attendance' : getWorkoutDisplayTitle(workout.type)}</Text>
                        <Text className="text-af-silver text-xs mt-1">{workout.date}</Text>
                      </View>
                      <View className="items-end">
                        <View className="rounded-full bg-white/10 px-3 py-1">
                          <Text className="text-af-silver text-xs">
                            {workout.source === 'manual'
                              ? 'Manual'
                              : workout.source === 'attendance'
                                ? 'Attendance'
                                : workout.source}
                          </Text>
                        </View>
                        {workout.source === 'manual' && workout.externalId ? (
                          <Pressable
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setShowWorkoutHistoryModal(false);
                              router.push({
                                pathname: '/add-workout',
                                params: {
                                  mode: 'edit',
                                  submissionId: workout.externalId,
                                  workoutType: workout.type,
                                  duration: String(workout.duration),
                                  durationSeconds: String(workout.durationSeconds ?? 0),
                                  distance: typeof workout.distance === 'number' ? String(workout.distance) : '',
                                  isPrivate: String(workout.isPrivate),
                                  screenshotUri: workout.screenshotUri ?? '',
                                  workoutDate: workout.date,
                                  attendanceMarkedBySubmission: String(workout.attendanceMarkedBySubmission ?? false),
                                },
                              });
                            }}
                            className="mt-2 rounded-full border border-af-accent/40 bg-af-accent/10 px-3 py-1"
                          >
                            <Text className="text-af-accent text-xs font-semibold">Edit</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                    {workout.source === 'attendance' ? (
                      <View className="mt-3 rounded-xl border border-white/10 bg-black/10 px-4 py-3">
                        <Text className="text-white font-medium">Logged by PFL/UFPM</Text>
                      </View>
                    ) : (
                      <>
                        {workout.source === 'strava' ? (
                          <View className="mt-3 rounded-xl border border-orange-400/20 bg-orange-400/10 px-4 py-3">
                            <Text className="text-orange-200 font-medium">Imported from Strava</Text>
                          </View>
                        ) : null}
                        <View className="mt-3 flex-row justify-between">
                          <Text className="text-af-silver text-sm">Duration</Text>
                          <Text className="text-white font-semibold">{workout.duration} min</Text>
                        </View>
                        <View className="mt-2 flex-row justify-between">
                          <Text className="text-af-silver text-sm">Distance</Text>
                          <Text className="text-white font-semibold">{typeof workout.distance === 'number' ? `${workout.distance.toFixed(2)} mi` : 'N/A'}</Text>
                        </View>
                        <View className="mt-2 flex-row justify-between">
                          <Text className="text-af-silver text-sm">Visibility</Text>
                          <Text className="text-white font-semibold">{workout.isPrivate ? 'Private' : 'Public'}</Text>
                        </View>
                      </>
                    )}
                    {workout.screenshotUri ? (
                      <Pressable onPress={() => setExpandedWorkoutImageUri(workout.screenshotUri!)} className="mt-4">
                        <Image
                          source={{ uri: workout.screenshotUri }}
                          className="w-full h-40 rounded-xl"
                          resizeMode="cover"
                        />
                      </Pressable>
                    ) : null}
                  </View>
                ))
              )}
            </ScrollView>
            </Animated.View>
        </Animated.View>
      </Modal>

      <Modal visible={showPFRAHistoryModal} transparent animationType="none">
        <Animated.View entering={getWebSafeFadeIn(180)} className="flex-1 bg-black/80 justify-end">
          <Animated.View entering={getWebSafeSlideInDown(260)} className="bg-af-navy rounded-t-3xl p-6 pb-12 max-h-[85%]">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-white text-xl font-bold">PFRA History</Text>
              <Pressable
                onPress={() => setShowPFRAHistoryModal(false)}
                className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
              >
                <X size={20} color="#C0C0C0" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {pfraHistory.length === 0 ? (
                <Text className="text-white/40 text-center py-8">No PFRA records uploaded.</Text>
              ) : (
                pfraHistory.map((assessment) => (
                  <View key={assessment.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-4">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-white font-semibold">{assessment.date}</Text>
                      <Text className="text-af-gold font-bold">{assessment.overallScore.toFixed(1)}</Text>
                    </View>
                    <View className="mt-4">
                      <View className="flex-row justify-between mb-2">
                        <Text className="text-af-silver text-sm">Cardio</Text>
                        <Text className="text-white text-sm">
                          {assessment.components.cardio.exempt
                            ? `Exempt`
                            : assessment.components.cardio.time
                            ? `${assessment.components.cardio.time} · ${assessment.components.cardio.score.toFixed(1)}`
                            : `${assessment.components.cardio.laps ?? 0} shuttles · ${assessment.components.cardio.score.toFixed(1)}`}
                        </Text>
                      </View>
                      <View className="flex-row justify-between mb-2">
                        <Text className="text-af-silver text-sm">{assessment.components.pushups.test ?? 'Strength'}</Text>
                        <Text className="text-white text-sm">
                          {assessment.components.pushups.exempt
                            ? 'Exempt'
                            : `${assessment.components.pushups.reps} reps · ${assessment.components.pushups.score.toFixed(1)}`}
                        </Text>
                      </View>
                      <View className="flex-row justify-between mb-2">
                        <Text className="text-af-silver text-sm">{assessment.components.situps.test ?? 'Core'}</Text>
                        <Text className="text-white text-sm">
                          {assessment.components.situps.exempt
                            ? 'Exempt'
                            : `${assessment.components.situps.time ?? `${assessment.components.situps.reps} reps`} · ${assessment.components.situps.score.toFixed(1)}`}
                        </Text>
                      </View>
                      {assessment.components.waist ? (
                        <View className="flex-row justify-between">
                          <Text className="text-af-silver text-sm">WHtR</Text>
                          <Text className="text-white text-sm">
                            {assessment.components.waist.exempt
                              ? 'Exempt'
                              : `${assessment.components.waist.inches.toFixed(1)} in · ${assessment.components.waist.score.toFixed(1)}`}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </Animated.View>
        </Animated.View>
      </Modal>

      <Modal visible={showLeaderboardHistoryModal} transparent animationType="none">
        <Animated.View entering={getWebSafeFadeIn(180)} className="flex-1 bg-black/80 justify-end">
          <Animated.View entering={getWebSafeSlideInDown(260)} className="bg-af-navy rounded-t-3xl p-6 pb-12 max-h-[80%]">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-white text-xl font-bold">Leaderboard History</Text>
              <Pressable
                onPress={() => setShowLeaderboardHistoryModal(false)}
                className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
              >
                <X size={20} color="#C0C0C0" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {leaderboardHistory.length === 0 ? (
                <Text className="text-white/40 text-center py-8">No leaderboard placements recorded yet.</Text>
              ) : (
                leaderboardHistory.map((entry) => (
                  <View key={`${entry.month}-${entry.position}`} className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-3">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-white font-semibold">{formatMonthLabel(entry.month)}</Text>
                      <Text className="text-af-gold font-semibold">#{entry.position}</Text>
                    </View>
                    <Text className="text-af-silver text-sm mt-1">{entry.score.toLocaleString()} pts</Text>
                  </View>
                ))
              )}
            </ScrollView>
          </Animated.View>
        </Animated.View>
      </Modal>

      <Modal visible={showUpcomingPTSessionsModal} transparent animationType="none">
        <Animated.View entering={getWebSafeFadeIn(180)} className="flex-1 bg-black/80 justify-end">
          <Animated.View entering={getWebSafeSlideInDown(260)} className="bg-af-navy rounded-t-3xl p-6 pb-12 max-h-[82%]">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-white text-xl font-bold">Upcoming PT Sessions</Text>
              <Pressable
                onPress={() => setShowUpcomingPTSessionsModal(false)}
                className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
              >
                <X size={20} color="#C0C0C0" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {upcomingPTSessions.length === 0 ? (
                <Text className="text-white/40 text-center py-8">No upcoming PT sessions scheduled.</Text>
              ) : (
                upcomingPTSessions.map((session) => {
                  const expanded = expandedUpcomingSessionIds.includes(session.id);
                  return (
                    <Pressable
                      key={session.id}
                      onPress={() => {
                        setExpandedUpcomingSessionIds((current) =>
                          current.includes(session.id)
                            ? current.filter((id) => id !== session.id)
                            : [...current, session.id]
                        );
                      }}
                      className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-4"
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1 pr-3">
                          <Text className="text-white font-semibold">
                            {new Date(`${session.date}T00:00:00`).toLocaleDateString()} at {session.time}
                          </Text>
                          <Text className="text-af-silver text-xs mt-1">
                            {getScheduledSessionScopeLabel(session)}
                            {session.scope !== 'personal' ? ' • ' : ' • Personal PT • '}
                            {getScheduledSessionKindLabel(session.kind)}
                          </Text>
                        </View>
                        {expanded ? <ChevronUp size={18} color="#C0C0C0" /> : <ChevronDown size={18} color="#C0C0C0" />}
                      </View>

                      {expanded ? (
                        <View className="mt-3 border-t border-white/10 pt-3">
                          <Text className="text-white text-sm">{session.description}</Text>
                          <Text className="text-af-silver text-xs mt-2">
                            Scheduled by {members.find((member) => member.id === session.createdBy)?.rank ?? ''} {members.find((member) => member.id === session.createdBy)?.firstName ?? ''} {members.find((member) => member.id === session.createdBy)?.lastName ?? 'Unknown member'}
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
          </Animated.View>
        </Animated.View>
      </Modal>

      <Modal visible={!!expandedWorkoutImageUri} transparent animationType="fade">
        <View className="flex-1 bg-black/90 items-center justify-center p-6">
          <Pressable
            onPress={() => setExpandedWorkoutImageUri(null)}
            className="absolute top-14 right-6 z-10 w-10 h-10 rounded-full bg-white/10 items-center justify-center"
          >
            <X size={22} color="#C0C0C0" />
          </Pressable>
          {expandedWorkoutImageUri ? (
            <View style={{ width: '100%', maxWidth: 520, height: '70%' }}>
              <Image source={{ uri: expandedWorkoutImageUri }} style={{ width: '100%', height: '100%', borderRadius: 16 }} resizeMode="contain" />
            </View>
          ) : null}
        </View>
      </Modal>

      {showDemoTrophyCelebration && demoAchievement ? (
        <AchievementCelebration
          achievement={demoAchievement}
          onDismiss={() => setShowDemoTrophyCelebration(false)}
        />
      ) : null}

      {/* Disconnect Integration Modal */}
      <Modal visible={showDisconnectModal} transparent animationType="fade">
        <View className="flex-1 bg-black/80 items-center justify-center p-6">
          <View className="bg-af-navy rounded-3xl p-6 w-full max-w-sm border border-white/20">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-white text-xl font-bold">Disconnect {integrationToDisconnect ? getIntegrationLabel(integrationToDisconnect) : ''}?</Text>
              <Pressable
                onPress={() => {
                  setShowDisconnectModal(false);
                  setIntegrationToDisconnect(null);
                }}
                className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
              >
                <X size={20} color="#C0C0C0" />
              </Pressable>
            </View>

            <View className="bg-af-warning/20 border border-af-warning/50 rounded-xl p-4 mb-4">
              <View className="flex-row items-start">
                <AlertTriangle size={20} color="#F59E0B" />
                <View className="flex-1 ml-3">
                  <Text className="text-af-warning font-semibold">Note</Text>
                  <Text className="text-af-warning/80 text-sm">
                    Disconnecting will stop syncing new workouts. Your existing workout data will remain in the app.
                  </Text>
                </View>
              </View>
            </View>

            <Text className="text-af-silver mb-6">
              Are you sure you want to disconnect {integrationToDisconnect ? getIntegrationLabel(integrationToDisconnect) : ''}? You can reconnect at any time.
            </Text>

            <View className="flex-row">
              <Pressable
                onPress={() => {
                  setShowDisconnectModal(false);
                  setIntegrationToDisconnect(null);
                }}
                className="flex-1 bg-white/10 py-3 rounded-xl mr-2"
              >
                <Text className="text-white text-center font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleDisconnectIntegration}
                className="flex-1 bg-af-danger py-3 rounded-xl ml-2"
              >
                <Text className="text-white text-center font-semibold">Disconnect</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}


