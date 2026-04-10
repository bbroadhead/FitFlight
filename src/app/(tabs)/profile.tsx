import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View, Text, Pressable, ScrollView, TextInput, Modal, Image, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { User, Shield, LogOut, LogIn, UserPlus, Trash2, Users, Activity, X, Check, Bell, Crown, Settings, Plus, Camera, FileText, Calendar, Building2, AlertTriangle, Upload, Dumbbell, ImageIcon, HelpCircle, Mail, ChevronDown, ChevronUp, Pencil, Search, Star, MessageSquare, Trophy } from 'lucide-react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, SlideInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useRouter } from 'expo-router';
import SmartSlider from '@/components/SmartSlider';
import { useAuthStore, useMemberStore, type Flight, type Member, type AccountType, type Squadron, type IntegrationService, type WorkoutType, getDisplayName, canEditAttendance, canManagePTL, canManagePTPrograms, isAdmin, SQUADRONS, ALL_ACHIEVEMENTS } from '@/lib/store';
import { cn } from '@/lib/cn';
import { AchievementCelebration } from '@/components/AchievementCelebration';
import { TrophyCase, CompactTrophyBadges } from '@/components/TrophyCase';
import { TutorialTarget, useTutorialTour } from '@/contexts/TutorialTourContext';
import { canUseStravaSync, disconnectStrava, getStravaSetupError, mapImportedWorkouts, startStravaConnect, syncStravaWorkouts } from '@/lib/strava';
import { signOutFromSupabase } from '@/lib/supabaseAuth';
import { buildTrophyStats, getRarestEarnedTrophies } from '@/lib/trophies';
import { formatMonthLabel, getAvailableMonthKeys, getMemberEffectiveWorkouts, getMemberMonthSummary, getMonthKey } from '@/lib/monthlyStats';
import {
  fetchAppNotifications,
  fetchApprovedManualWorkouts,
  fetchAttendanceSessions,
  fetchManualWorkoutSubmissions,
  markAppNotificationRead,
  assignUFPMRole,
  deleteStoredImage,
  createRosterMember,
  deleteRosterMember,
  ensureMemberRole,
  markManualWorkoutSubmissionRead,
  fetchSupportMessages,
  fetchSupportThreads,
  markSupportMessagesRead,
    reviewManualWorkoutSubmission,
    resetUserPasswordAsAdmin,
    sendSupportMessage,
    sendAppNotification,
    setAttendanceStatus,
    type AppNotification,
  type ManualWorkoutSubmission,
  type SupportMessage,
  type SupportThreadSummary,
  updateMemberRole,
  updateRosterMember,
  uploadProfileImage,
} from '@/lib/supabaseData';

const FLIGHTS: Flight[] = ['Apex', 'Bomber', 'Cryptid', 'Doom', 'Ewok', 'Foxhound', 'ADF', 'DET'];
const RANKS = ['AB', 'Amn', 'A1C', 'SrA', 'SSgt', 'TSgt', 'MSgt', 'SMSgt', 'CMSgt'];
const OWNER_EMAIL = 'benjamin.broadhead.2@us.af.mil';
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

type PendingProfileImageCrop = {
  uri: string;
  width: number;
  height: number;
  mimeType?: string;
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

  const [showAddModal, setShowAddModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showPTLRequestModal, setShowPTLRequestModal] = useState(false);
  const [showChangeSquadronModal, setShowChangeSquadronModal] = useState(false);
  const [showProfilePictureModal, setShowProfilePictureModal] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [showDeveloperContact, setShowDeveloperContact] = useState(false);
  const [showDeveloperMessageModal, setShowDeveloperMessageModal] = useState(false);
  const [showSupportInboxModal, setShowSupportInboxModal] = useState(false);
  const [activeSupportRecipientEmail, setActiveSupportRecipientEmail] = useState(OWNER_EMAIL);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [isUpdatingProfilePicture, setIsUpdatingProfilePicture] = useState(false);
  const [pendingProfileImageCrop, setPendingProfileImageCrop] = useState<PendingProfileImageCrop | null>(null);
  const [profileCropZoom, setProfileCropZoom] = useState(1);
  const [profileCropOffsetX, setProfileCropOffsetX] = useState(0);
  const [profileCropOffsetY, setProfileCropOffsetY] = useState(0);
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
  const [selectedSummaryMonth, setSelectedSummaryMonth] = useState(getMonthKey());
  const [integrationToDisconnect, setIntegrationToDisconnect] = useState<IntegrationService | null>(null);
  const [stravaBusyAction, setStravaBusyAction] = useState<'connect' | 'sync' | 'disconnect' | null>(null);
  const [stravaMessage, setStravaMessage] = useState<string | null>(null);
  const [selectedSquadron, setSelectedSquadron] = useState<Squadron | null>(null);
  const [selectedPTLRequest, setSelectedPTLRequest] = useState<string | null>(null);
  const [newMemberFirstName, setNewMemberFirstName] = useState('');
  const [newMemberLastName, setNewMemberLastName] = useState('');
  const [newMemberRank, setNewMemberRank] = useState('A1C');
  const [newMemberFlight, setNewMemberFlight] = useState<Flight>('Apex');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberSquadronLeadership, setNewMemberSquadronLeadership] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberActionError, setMemberActionError] = useState('');
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
  const projectCoordinatorMember = members.find(
    (member) =>
      member.firstName.trim().toLowerCase() === 'jacob' &&
      member.lastName.trim().toLowerCase() === 'de la rosa'
  ) ?? null;
  const projectCoordinatorEmail =
    projectCoordinatorMember?.email ??
    (user?.firstName.trim().toLowerCase() === 'jacob' && user?.lastName.trim().toLowerCase() === 'de la rosa'
      ? user.email
      : '');
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
  const canManageMembers = canManagePTPrograms(userAccountType);
  const canReviewManualWorkouts = canManagePTPrograms(userAccountType);
  const canResetUserPasswords = userAccountType === 'fitflight_creator' || userAccountType === 'ufpm' || userAccountType === 'demo';
  const isOwnerReviewer = user?.email?.toLowerCase() === OWNER_EMAIL;
  const canViewSupportInbox = user?.email
    ? supportContacts.some((contact) => contact.email.toLowerCase() === user.email.toLowerCase())
    : false;

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
    supportContacts.find((contact) => contact.email.toLowerCase() === activeSupportRecipientEmail.toLowerCase()) ??
    supportContacts[0] ??
    null;
  const supportThread = !canViewSupportInbox
    ? supportThreads.find(
        (thread) =>
          thread.requesterEmail.toLowerCase() === user?.email?.toLowerCase() &&
          thread.recipientEmail.toLowerCase() === (activeSupportContact?.email.toLowerCase() ?? '')
      )
    : null;
  const developerSupportThread = supportThreads.find(
    (thread) =>
      thread.requesterEmail.toLowerCase() === user?.email?.toLowerCase() &&
      thread.recipientEmail.toLowerCase() === OWNER_EMAIL
  ) ?? null;
  const coordinatorSupportThread =
    activeSupportContact?.key === 'project_coordinator' || projectCoordinatorEmail
      ? supportThreads.find(
          (thread) =>
            thread.requesterEmail.toLowerCase() === user?.email?.toLowerCase() &&
            thread.recipientEmail.toLowerCase() === projectCoordinatorEmail.toLowerCase()
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

        if (new Date(`${session.date}T${session.time}:00`).getTime() < Date.now()) {
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
  const profileCropPreview = useMemo(() => {
    if (!pendingProfileImageCrop) {
      return null;
    }

    const frameSize = 240;
    const baseScale = Math.max(
      frameSize / pendingProfileImageCrop.width,
      frameSize / pendingProfileImageCrop.height
    );
    const displayWidth = pendingProfileImageCrop.width * baseScale * profileCropZoom;
    const displayHeight = pendingProfileImageCrop.height * baseScale * profileCropZoom;
    const maxTranslateX = Math.max(0, (displayWidth - frameSize) / 2);
    const maxTranslateY = Math.max(0, (displayHeight - frameSize) / 2);

    return {
      frameSize,
      displayWidth,
      displayHeight,
      translateX: -profileCropOffsetX * maxTranslateX,
      translateY: -profileCropOffsetY * maxTranslateY,
    };
  }, [pendingProfileImageCrop, profileCropOffsetX, profileCropOffsetY, profileCropZoom]);

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
              thread.recipientEmail.toLowerCase() === (activeSupportContact?.email.toLowerCase() ?? OWNER_EMAIL)
          ) ?? null;
        setActiveSupportThreadId((current) => current ?? ownThread?.id ?? null);
        if (ownThread && !supportSubject.trim()) {
          setSupportSubject(ownThread.subject);
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

  useEffect(() => {
    if (!user?.email || !accessToken) {
      setSupportThreads([]);
      setActiveSupportMessages([]);
      setActiveSupportThreadId(null);
      return;
    }

    void loadSupportThreads();

    const pollId = setInterval(() => {
      void loadSupportThreads();
    }, 30000);

    return () => clearInterval(pollId);
  }, [accessToken, activeSupportContact?.email, canViewSupportInbox, user?.email]);

  useEffect(() => {
    if (!user?.id || !accessToken) {
      setManualWorkoutSubmissions([]);
      setManualWorkoutReviewQueue([]);
      return;
    }

    void loadManualWorkoutSubmissions();

    const pollId = setInterval(() => {
      void loadManualWorkoutSubmissions();
    }, 15000);

    return () => clearInterval(pollId);
  }, [accessToken, canReviewManualWorkouts, memberSquadron, user?.id]);

  useEffect(() => {
    if (!user?.email || !accessToken) {
      setAppNotifications([]);
      return;
    }

    void loadAppNotifications();

    const pollId = setInterval(() => {
      void loadAppNotifications();
    }, 15000);

    return () => clearInterval(pollId);
  }, [accessToken, user?.email]);

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
              : newMemberSquadronLeadership
                ? 'squadron_leadership'
                : previousMember?.accountType === 'squadron_leadership'
                  ? 'standard'
                  : previousMember?.accountType ?? 'standard',
        email: (newMemberEmail || `${newMemberLastName.toLowerCase()}.${newMemberFirstName.toLowerCase()}@us.af.mil`).toLowerCase(),
        exerciseMinutes: previousMember?.exerciseMinutes ?? 0,
        distanceRun: previousMember?.distanceRun ?? 0,
        connectedApps: previousMember?.connectedApps ?? [],
        fitnessAssessments: previousMember?.fitnessAssessments ?? [],
        workouts: previousMember?.workouts ?? [],
        achievements: previousMember?.achievements ?? [],
        requiredPTSessionsPerWeek: previousMember?.requiredPTSessionsPerWeek ?? 3,
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
      } else {
        await createRosterMember(newMember, accessToken);
        await ensureMemberRole(newMember.email, newMember.accountType, accessToken).catch(() => undefined);
        await updateMemberRole(newMember.email, newMember.accountType, accessToken).catch(() => undefined);

        addMember(newMember);
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
    setNewMemberFirstName('');
    setNewMemberLastName('');
    setNewMemberRank('A1C');
    setNewMemberFlight('Apex');
    setNewMemberEmail('');
    setNewMemberSquadronLeadership(false);
    setEditingMemberId(null);
    setMemberActionError('');
  };

  const openAddMemberModal = () => {
    resetForm();
    setShowAddModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openEditMemberModal = (member: Member) => {
    setShowManageModal(false);
    setEditingMemberId(member.id);
    setNewMemberFirstName(member.firstName);
    setNewMemberLastName(member.lastName);
    setNewMemberRank(member.rank);
    setNewMemberFlight(member.flight);
    setNewMemberEmail(member.email);
    setNewMemberSquadronLeadership(member.accountType === 'squadron_leadership');
    setMemberActionError('');
    setShowAddModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openUFPMPicker = () => {
    setUFPMSearchQuery('');
    setSelectedUFPMMemberId(null);
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

      await updateMemberRole(member.email, approve ? 'ptl' : 'standard', accessToken).catch(() => undefined);

      if (approve) {
        approvePTL(memberId);
      } else {
        rejectPTL(memberId);
      }

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

  const handleRevokePTL = (memberId: string) => {
    const run = async () => {
      const member = members.find((candidate) => candidate.id === memberId);
      if (!member || !user || !accessToken) {
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await updateMemberRole(member.email, 'standard', accessToken).catch(() => undefined);
      revokePTL(memberId);
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
    };

    void run();
  };

  const handleSetUFPM = (memberId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setUFPM(memberId);
  };

  const handleChangeSquadron = () => {
    if (!user || !selectedSquadron || selectedSquadron === user.squadron) {
      setShowChangeSquadronModal(false);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    // If user is PTL and changing squadrons, remove PTL status
    const isPTL = user.accountType === 'ptl';
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

  const persistProfilePicture = async (profilePicture?: string) => {
    if (!user || !currentMember) {
      return;
    }

    const previousProfilePicture = currentMember.profilePicture;

    const updatedMember: Member = {
      ...currentMember,
      profilePicture,
    };

    if (accessToken) {
      await updateRosterMember(currentMember, updatedMember, accessToken);
    }

      updateMember(user.id, { profilePicture });
      updateUser({ profilePicture });

      const nextStorageValue = profilePicture?.trim();
      const previousStorageValue = previousProfilePicture?.trim();
      if (previousStorageValue && previousStorageValue !== nextStorageValue) {
        await deleteStoredImage({
          imageReference: previousProfilePicture,
          accessToken: accessToken ?? undefined,
        }).catch(() => undefined);
      }
    };

  const beginProfileImageCrop = (asset: ImagePicker.ImagePickerAsset) => {
    if (!asset.uri || !asset.width || !asset.height) {
      Alert.alert('Unable to use image', 'This image could not be prepared for cropping.');
      return;
    }

    setPendingProfileImageCrop({
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      mimeType: asset.mimeType ?? undefined,
    });
    setProfileCropZoom(1);
    setProfileCropOffsetX(0);
    setProfileCropOffsetY(0);
    setShowProfilePictureModal(false);
  };

  const cancelProfileImageCrop = () => {
    setPendingProfileImageCrop(null);
    setProfileCropZoom(1);
    setProfileCropOffsetX(0);
    setProfileCropOffsetY(0);
    setShowProfilePictureModal(true);
  };

  const confirmProfileImageCrop = async () => {
    if (!pendingProfileImageCrop || !user) {
      return;
    }

    try {
      setIsUpdatingProfilePicture(true);

      const baseCropSize = Math.min(pendingProfileImageCrop.width, pendingProfileImageCrop.height);
      const cropSize = baseCropSize / profileCropZoom;
      const maxOriginXDelta = Math.max(0, (pendingProfileImageCrop.width - cropSize) / 2);
      const maxOriginYDelta = Math.max(0, (pendingProfileImageCrop.height - cropSize) / 2);
      const originX = Math.max(
        0,
        Math.min(
          pendingProfileImageCrop.width - cropSize,
          (pendingProfileImageCrop.width - cropSize) / 2 + profileCropOffsetX * maxOriginXDelta
        )
      );
      const originY = Math.max(
        0,
        Math.min(
          pendingProfileImageCrop.height - cropSize,
          (pendingProfileImageCrop.height - cropSize) / 2 + profileCropOffsetY * maxOriginYDelta
        )
      );

      const croppedImage = await manipulateAsync(
        pendingProfileImageCrop.uri,
        [
          {
            crop: {
              originX,
              originY,
              width: cropSize,
              height: cropSize,
            },
          },
          { resize: { width: 512, height: 512 } },
        ],
        {
          compress: 0.82,
          format: SaveFormat.JPEG,
        }
      );

      const imageUri = await uploadProfileImage({
        memberId: user.id,
        localUri: croppedImage.uri,
        mimeType: 'image/jpeg',
        accessToken: accessToken ?? undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await persistProfilePicture(imageUri);

      setPendingProfileImageCrop(null);
      setShowProfilePictureModal(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update profile picture.';
      setMemberActionError(message);
      Alert.alert('Unable to update profile picture', message);
    } finally {
      setIsUpdatingProfilePicture(false);
    }
  };

  const pickProfilePicture = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0] && user) {
        beginProfileImageCrop(result.assets[0]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update profile picture.';
      setMemberActionError(message);
      Alert.alert('Unable to update profile picture', message);
    }
  };

  const takeProfilePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0] && user) {
        beginProfileImageCrop(result.assets[0]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update profile picture.';
      setMemberActionError(message);
      Alert.alert('Unable to update profile picture', message);
    }
  };

  const removeProfilePicture = () => {
    if (!user) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const run = async () => {
        try {
          await persistProfilePicture(undefined);
          setShowProfilePictureModal(false);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to remove profile picture.';
          setMemberActionError(message);
          Alert.alert('Unable to remove profile picture', message);
        }
      };
    void run();
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
                source: 'workout',
                accessToken: accessToken ?? undefined,
              }).catch(() => undefined)
            )
        );

        const nextSessions = await fetchAttendanceSessions(accessToken ?? undefined).catch(() => []);
        syncPTSessions(nextSessions);
      }

      setIntegrationConnection('strava', true, result.connection ?? undefined);

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

  const handleOpenSupportMessages = (contactEmail: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSupportError(null);
    setActiveSupportRecipientEmail(contactEmail);
    const nextThread =
      supportThreads.find(
        (thread) =>
          thread.requesterEmail.toLowerCase() === user?.email?.toLowerCase() &&
          thread.recipientEmail.toLowerCase() === contactEmail.toLowerCase()
      ) ?? null;
    if (nextThread?.subject) {
      setSupportSubject(nextThread.subject);
    } else {
      setSupportSubject('');
    }
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
        setActiveSupportRecipientEmail(nextThread.recipientEmail);
      }
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
      setActiveSupportRecipientEmail(nextThread.recipientEmail);
    }
    void loadSupportConversation(threadId, { markRead: true });
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
      setActiveSupportRecipientEmail(nextThread.recipientEmail);
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
      if (!user || !accessToken) {
        setSupportError('You must be signed in to message the FitFlight team.');
        return;
      }

      if (!supportSubject.trim() || !supportBody.trim()) {
        setSupportError('Please add both a subject line and message.');
        return;
      }

      setSupportSending(true);
      setSupportError(null);

      const threadOwner = canViewSupportInbox
        ? supportThreads.find((thread) => thread.id === activeSupportThreadId)
        : supportThread;

      const requesterMemberId = threadOwner?.requesterMemberId ?? user.id;
      const requesterEmail = threadOwner?.requesterEmail ?? user.email;
      const requesterName = threadOwner?.requesterName ?? getDisplayName(user);
      const requesterSquadron = threadOwner?.requesterSquadron ?? user.squadron;

      const result = await sendSupportMessage({
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
        subject: supportSubject.trim(),
        body: supportBody.trim(),
        isFromOwner: canViewSupportInbox,
        accessToken,
      });

      setSupportBody('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadSupportThreads();
      await loadSupportConversation(result.threadId, { markRead: true });
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
    : { workoutCount: 0, minutes: 0, miles: 0, score: 0 };
  const monthlyPFRAEntries = userStats && 'fitnessAssessments' in userStats
    ? (userStats as Member).fitnessAssessments.filter((assessment) => assessment.date.startsWith(summaryMonth))
    : [];
  const latestMonthlyPFRA = monthlyPFRAEntries[monthlyPFRAEntries.length - 1] ?? null;
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
      case 'ptl': return 'PFL';
      default: return 'Member';
    }
  };

  const handleOpenInstallHelp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (Platform.OS === 'web' && typeof window !== 'undefined' && isIos && !isStandalonePwa) {
      window.sessionStorage.setItem('fitflight_show_install_help', '1');
      window.location.assign('/FitFlight/');
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
          ref={scrollViewRef}
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={() => {
            if (currentTargetId?.startsWith('account-')) {
              refreshCurrentTarget();
            }
          }}
        >
          {/* Header */}
          <Animated.View
            entering={FadeInDown.delay(100).springify()}
            className="px-6 pt-4 pb-2 flex-row items-center justify-between"
          >
            <View>
              <Text className="text-white text-2xl font-bold">Account</Text>
              <Text className="text-af-silver text-sm mt-1">Manage your account</Text>
            </View>

            {/* Notifications Bell */}
              {isAuthenticated && (
                <Pressable
                  onPress={handleOpenNotificationsModal}
                  className="relative w-10 h-10 bg-white/10 rounded-full items-center justify-center"
                >
                <Bell size={20} color="#C0C0C0" />
                {totalUnreadCount > 0 && (
                  <View className="absolute -top-1 -right-1 w-5 h-5 bg-af-danger rounded-full items-center justify-center">
                    <Text className="text-white text-xs font-bold">{totalUnreadCount}</Text>
                  </View>
                )}
              </Pressable>
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
              entering={FadeInDown.delay(150).springify()}
              className="mx-6 mt-4 p-6 bg-white/10 rounded-3xl border border-white/20"
            >
            <View className="flex-row items-center">
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowProfilePictureModal(true);
                }}
                className="relative"
              >
                {user?.profilePicture ? (
                  <Image
                    source={{ uri: user.profilePicture }}
                    className="w-16 h-16 rounded-full mr-4"
                  />
                ) : (
                  <View className="w-16 h-16 bg-af-accent/30 rounded-full items-center justify-center mr-4">
                    {userAccountType === 'fitflight_creator' ? (
                      <Crown size={32} color="#A855F7" />
                    ) : (
                      <User size={32} color="#4A90D9" />
                    )}
                  </View>
                )}
                {/* Camera overlay badge */}
                <View className="absolute bottom-0 right-3 w-6 h-6 bg-af-accent rounded-full items-center justify-center border-2 border-af-navy">
                  <Camera size={12} color="white" />
                </View>
              </Pressable>
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
                    <Text className="text-af-silver text-sm">{user?.flight} Flight</Text>
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
            </Animated.View>
          </TutorialTarget>

          {/* Stats Card */}
          <Animated.View
            entering={FadeInDown.delay(200).springify()}
            className="mx-6 mt-4 p-4 bg-white/5 rounded-2xl border border-white/10"
          >
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
                  {monthlyUserSummary.miles.toFixed(1)}
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
          </Animated.View>

          <TutorialTarget
            id="account-history"
            onLayout={(event) => {
              tutorialTargetYRef.current['account-history'] = event.nativeEvent.layout.y;
            }}
          >
            <Animated.View
              entering={FadeInDown.delay(210).springify()}
              className="mx-6 mt-4"
            >
              <View className="rounded-2xl border border-white/10 bg-white/5 p-4">
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
              entering={FadeInDown.delay(225).springify()}
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
              entering={FadeInDown.delay(250).springify()}
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
                entering={FadeInDown.delay(300).springify()}
                className="mx-6 mt-6"
              >
              <Text className="text-white font-semibold text-lg mb-3">Admin Actions</Text>

              <Pressable
                onPress={openAddMemberModal}
                className="flex-row items-center bg-af-accent/20 border border-af-accent/50 rounded-xl p-4 mb-3"
              >
                <UserPlus size={24} color="#4A90D9" />
                <View className="ml-3 flex-1">
                  <Text className="text-white font-semibold">Add New Member</Text>
                  <Text className="text-af-silver text-xs">Add to PT attendance (no account)</Text>
                </View>
              </Pressable>

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
                entering={FadeInDown.delay(300).springify()}
                className="mx-6 mt-6"
              >
              <Text className="text-white font-semibold text-lg mb-3">PFL Actions</Text>
              <Pressable
                onPress={openAddMemberModal}
                className="flex-row items-center bg-af-accent/20 border border-af-accent/50 rounded-xl p-4 mb-3"
              >
                <UserPlus size={24} color="#4A90D9" />
                <View className="ml-3 flex-1">
                  <Text className="text-white font-semibold">Add Member</Text>
                  <Text className="text-af-silver text-xs">Add someone to the roster and attendance</Text>
                </View>
              </Pressable>
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
              entering={FadeInDown.delay(325).springify()}
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

            <Pressable
              onPress={handleOpenInstallHelp}
              className="flex-row items-center bg-white/5 border border-white/10 rounded-xl p-4 mb-3"
            >
              <LogIn size={24} color="#4A90D9" />
              <View className="ml-3 flex-1">
                <Text className="text-white font-semibold">Add to Home Screen</Text>
                <Text className="text-af-silver text-xs">Install FitFlight on your phone or computer</Text>
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
                    onPress={() => handleOpenSupportMessages(OWNER_EMAIL)}
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
                      onPress={() => projectCoordinatorEmail && handleOpenSupportMessages(projectCoordinatorEmail)}
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
            entering={FadeInDown.delay(350).springify()}
            className="mx-6 mt-6"
          >
            {isAuthenticated ? (
              <>
                {/* Change Squadron Button */}
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedSquadron(user?.squadron ?? 'Hawks');
                    setShowChangeSquadronModal(true);
                  }}
                  className="flex-row items-center justify-center bg-white/10 border border-white/20 rounded-xl p-4 mb-3"
                >
                  <Building2 size={20} color="#C0C0C0" />
                  <Text className="text-white font-semibold ml-2">Change My Squadron</Text>
                </Pressable>

                {/* Sign Out Button */}
                <Pressable
                  onPress={handleLogout}
                  className="flex-row items-center justify-center bg-af-danger/20 border border-af-danger/50 rounded-xl p-4"
                >
                  <LogOut size={20} color="#EF4444" />
                  <Text className="text-af-danger font-semibold ml-2">Sign Out</Text>
                </Pressable>
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
        </ScrollView>
      </SafeAreaView>

      {/* Add Member Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View className="flex-1 bg-black/80 justify-end">
          <View className="bg-af-navy rounded-t-3xl p-6 pb-12">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-white text-xl font-bold">{editingMemberId ? 'Edit Member' : 'Add Member'}</Text>
              <Pressable
                onPress={() => { setShowAddModal(false); resetForm(); }}
                className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
              >
                <X size={20} color="#C0C0C0" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* First Name */}
              <View className="mb-4">
                <Text className="text-white/60 text-sm mb-2">First Name</Text>
                <TextInput
                  value={newMemberFirstName}
                  onChangeText={setNewMemberFirstName}
                  placeholder="Enter first name"
                  placeholderTextColor="#ffffff40"
                  className="bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10"
                />
              </View>

              {/* Last Name */}
              <View className="mb-4">
                <Text className="text-white/60 text-sm mb-2">Last Name</Text>
                <TextInput
                  value={newMemberLastName}
                  onChangeText={setNewMemberLastName}
                  placeholder="Enter last name"
                  placeholderTextColor="#ffffff40"
                  className="bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10"
                />
              </View>

              {/* Rank */}
              <View className="mb-4">
                <Text className="text-white/60 text-sm mb-2">Rank</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                  <View className="flex-row">
                    {RANKS.map((rank) => (
                      <Pressable
                        key={rank}
                        onPress={() => setNewMemberRank(rank)}
                        className={cn(
                          "px-4 py-2 rounded-lg mr-2 border",
                          newMemberRank === rank
                            ? "bg-af-accent border-af-accent"
                            : "bg-white/5 border-white/10"
                        )}
                      >
                        <Text className={cn(
                          "text-sm",
                          newMemberRank === rank ? "text-white" : "text-white/60"
                        )}>{rank}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* Flight */}
              <View className="mb-4">
                <Text className="text-white/60 text-sm mb-2">Flight</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                  <View className="flex-row">
                    {FLIGHTS.map((flight) => (
                      <Pressable
                        key={flight}
                        onPress={() => setNewMemberFlight(flight)}
                        className={cn(
                          "px-4 py-2 rounded-lg mr-2 border",
                          newMemberFlight === flight
                            ? "bg-af-accent border-af-accent"
                            : "bg-white/5 border-white/10"
                        )}
                      >
                        <Text className={cn(
                          "text-sm",
                          newMemberFlight === flight ? "text-white" : "text-white/60"
                        )}>{flight}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* Email */}
              <View className="mb-4">
                <Text className="text-white/60 text-sm mb-2">Email</Text>
                <TextInput
                  value={newMemberEmail}
                  onChangeText={setNewMemberEmail}
                  placeholder="name@us.af.mil"
                  placeholderTextColor="#ffffff40"
                  autoCapitalize="none"
                  className="bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10"
                />
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

              {memberActionError ? (
                <View className="bg-red-500/20 border border-red-500/40 rounded-xl px-4 py-3 mb-4">
                  <Text className="text-red-300">{memberActionError}</Text>
                </View>
              ) : null}

              <Text className="text-white/40 text-xs mb-4">
                This updates the shared roster used by FitFlight and keeps attendance/account binding aligned.
              </Text>

              {/* Save Button */}
              <Pressable
                onPress={handleSaveMember}
                className="bg-af-accent py-4 rounded-xl mt-2"
              >
                <Text className="text-white font-bold text-center">{editingMemberId ? 'Save Changes' : 'Add Member'}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Manage Members Modal */}
      <Modal visible={showManageModal} transparent animationType="slide">
        <View className="flex-1 bg-black/80 justify-end">
          <View className="bg-af-navy rounded-t-3xl p-6 pb-12 max-h-[80%]">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-white text-xl font-bold">Manage Members</Text>
              <Pressable
                onPress={() => setShowManageModal(false)}
                className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
              >
                <X size={20} color="#C0C0C0" />
              </Pressable>
            </View>

            {memberActionError ? (
              <View className="bg-red-500/20 border border-red-500/40 rounded-xl px-4 py-3 mb-4">
                <Text className="text-red-300">{memberActionError}</Text>
              </View>
            ) : null}

            <View className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-white font-semibold">Roster Controls</Text>
                  <Text className="text-af-silver text-xs mt-1">
                    {filteredMembers.length} shown of {members.length} members
                  </Text>
                </View>
                {canManage && (
                  <Pressable
                    onPress={openUFPMPicker}
                    className="flex-row items-center bg-af-gold/20 border border-af-gold/40 rounded-full px-3 py-2"
                  >
                    <Star size={14} color="#FFD700" />
                    <Text className="text-af-gold text-xs font-semibold ml-2">Assign UFPM</Text>
                  </Pressable>
                )}
              </View>
              {currentUFPM && (
                <View className="mt-3 bg-af-gold/10 border border-af-gold/30 rounded-xl px-3 py-2">
                  <Text className="text-af-gold text-xs uppercase tracking-wider">Current UFPM</Text>
                  <Text className="text-white font-semibold mt-1">{getDisplayName(currentUFPM)}</Text>
                </View>
              )}
              <View className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10 mt-4">
                <Search size={18} color="#C0C0C0" />
                <TextInput
                  value={memberSearchQuery}
                  onChangeText={setMemberSearchQuery}
                  placeholder="Search members"
                  placeholderTextColor="#ffffff40"
                  autoCapitalize="none"
                  className="flex-1 ml-3 text-white"
                />
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {filteredMembers.map((member) => {
                const memberDisplayName = getDisplayName(member);
                const memberColors = getAccountTypeColor(member.accountType);
                const isPTL = member.accountType === 'ptl';
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
                            <Text className="text-af-silver text-xs">{member.flight} Flight</Text>
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
        </View>
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

      <Modal visible={showUFPMModal} transparent animationType="slide">
        <View className="flex-1 bg-black/80 justify-end">
          <View className="bg-af-navy rounded-t-3xl p-6 pb-12 max-h-[80%]">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-white text-xl font-bold">Select UFPM</Text>
              <Pressable
                onPress={() => {
                  setShowUFPMModal(false);
                  setUFPMSearchQuery('');
                  setSelectedUFPMMemberId(null);
                }}
                className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
              >
                <X size={20} color="#C0C0C0" />
              </Pressable>
            </View>

            <View className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10 mb-4">
              <Search size={18} color="#C0C0C0" />
              <TextInput
                value={ufpmSearchQuery}
                onChangeText={setUFPMSearchQuery}
                placeholder="Search members"
                placeholderTextColor="#ffffff40"
                autoCapitalize="none"
                className="flex-1 ml-3 text-white"
              />
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {ufpmCandidates.map((member) => (
                <Pressable
                  key={member.id}
                  onPress={() => {
                    setSelectedUFPMMemberId(member.id);
                    setShowUFPMConfirmModal(true);
                  }}
                  className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-3"
                >
                  <Text className="text-white font-semibold">{getDisplayName(member)}</Text>
                  <Text className="text-af-silver text-xs mt-1">{member.email}</Text>
                  <View className="flex-row items-center mt-3">
                    <View className="bg-white/10 rounded-full px-2 py-1 mr-2">
                      <Text className="text-af-silver text-xs">{member.flight} Flight</Text>
                    </View>
                    {member.accountType === 'ufpm' && (
                      <View className="bg-af-gold/20 rounded-full px-2 py-1">
                        <Text className="text-af-gold text-xs">Current UFPM</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showResetUserPasswordModal} transparent animationType="slide">
        <View className="flex-1 bg-black/80 justify-end">
          <View className="bg-af-navy rounded-t-3xl p-6 pb-12 max-h-[85%]">
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
        </View>
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

      <Modal visible={showDeveloperMessageModal} transparent animationType="slide">
        <View className="flex-1 bg-black/80 justify-end">
          <View className="bg-af-navy rounded-t-3xl p-6 pb-10 max-h-[88%]">
            <View className="flex-row items-center justify-between mb-4">
              <View>
                <Text className="text-white text-xl font-bold">Message the FitFlight Team</Text>
                <Text className="text-af-silver text-sm mt-1">
                  {activeSupportContact ? `Send a message to ${activeSupportContact.title.toLowerCase()} without leaving the app` : 'Send a support message without leaving the app'}
                </Text>
              </View>
              <Pressable
                onPress={() => setShowDeveloperMessageModal(false)}
                className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
              >
                <X size={20} color="#C0C0C0" />
              </Pressable>
            </View>

            <View className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
              <Text className="text-af-silver text-xs uppercase tracking-wider mb-2">Subject</Text>
              <TextInput
                value={supportSubject}
                onChangeText={setSupportSubject}
                placeholder="Example: Attendance sync issue"
                placeholderTextColor="#94A3B8"
                className="text-white bg-white/5 border border-white/10 rounded-xl px-4 py-3"
              />
            </View>

            <View className="flex-1">
              <Text className="text-af-silver text-xs uppercase tracking-wider mb-2">Conversation</Text>
              <View className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-4">
                <ScrollView showsVerticalScrollIndicator={false}>
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

            <View className="mt-4">
              <Text className="text-af-silver text-xs uppercase tracking-wider mb-2">Message</Text>
              <TextInput
                value={supportBody}
                onChangeText={setSupportBody}
                placeholder="Type your message here"
                placeholderTextColor="#94A3B8"
                multiline
                textAlignVertical="top"
                className="text-white bg-white/5 border border-white/10 rounded-2xl px-4 py-4 min-h-[120px]"
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
                {supportSending ? 'Sending...' : 'Send Message'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showSupportInboxModal} transparent animationType="slide">
        <View className="flex-1 bg-black/80 justify-end">
          <View className="bg-af-navy rounded-t-3xl p-6 pb-10 max-h-[90%]">
            <View className="flex-row items-center justify-between mb-4">
              <View>
                <Text className="text-white text-xl font-bold">Support Inbox</Text>
                <Text className="text-af-silver text-sm mt-1">FitFlight team message center</Text>
              </View>
              <Pressable
                onPress={() => setShowSupportInboxModal(false)}
                className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
              >
                <X size={20} color="#C0C0C0" />
              </Pressable>
            </View>

            <View className="flex-row">
              <View className="w-[38%] pr-3">
                <ScrollView showsVerticalScrollIndicator={false} className="max-h-[460px]">
                  {supportLoading ? (
                    <Text className="text-af-silver text-center py-8">Loading support inbox...</Text>
                  ) : supportThreads.length === 0 ? (
                    <Text className="text-af-silver text-center py-8">No support messages yet</Text>
                  ) : (
                    supportThreads.map((thread) => (
                      <Pressable
                        key={thread.id}
                        onPress={() => handleSelectSupportThread(thread.id)}
                        className={cn(
                          "rounded-2xl p-4 mb-3 border",
                          thread.id === activeSupportThreadId
                            ? "bg-af-accent/15 border-af-accent/40"
                            : "bg-white/5 border-white/10"
                        )}
                      >
                        <View className="flex-row items-start justify-between">
                          <View className="flex-1">
                            <Text className="text-white font-semibold" numberOfLines={1}>{thread.requesterName}</Text>
                            <Text className="text-af-silver text-xs mt-1" numberOfLines={1}>{thread.subject}</Text>
                          </View>
                          {thread.unreadForOwner > 0 ? (
                            <View className="bg-af-danger rounded-full px-2 py-1 ml-2">
                              <Text className="text-white text-xs font-bold">{thread.unreadForOwner}</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text className="text-af-silver text-xs mt-2" numberOfLines={2}>{thread.latestMessagePreview}</Text>
                      </Pressable>
                    ))
                  )}
                </ScrollView>
              </View>

              <View className="flex-1">
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

                    <View className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-4">
                      <ScrollView showsVerticalScrollIndicator={false}>
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
                        className="text-white bg-white/5 border border-white/10 rounded-2xl px-4 py-4 min-h-[110px]"
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
        </View>
      </Modal>

      {/* Notifications Modal */}
      <Modal visible={showNotificationsModal} transparent animationType="none">
        <Animated.View entering={FadeIn.duration(180)} className="flex-1 bg-black/80 justify-end">
          <Animated.View entering={SlideInDown.duration(260)} className="bg-af-navy rounded-t-3xl p-6 pb-12 max-h-[80%]">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-white text-xl font-bold">Notifications</Text>
              <Pressable
                onPress={() => setShowNotificationsModal(false)}
                className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
              >
                <X size={20} color="#C0C0C0" />
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
                    <Text className="text-af-silver">{requestingMember.flight} Flight</Text>
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

      {/* Change Squadron Modal */}
      <Modal visible={showChangeSquadronModal} transparent animationType="fade">
        <View className="flex-1 bg-black/80 items-center justify-center p-6">
          <View className="bg-af-navy rounded-3xl p-6 w-full max-w-sm border border-white/20">
            <Text className="text-white text-xl font-bold mb-4">Change My Squadron</Text>

            {/* Warning for PFLs */}
            {user?.accountType === 'ptl' && (
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

      {/* Profile Picture Modal */}
        <Modal visible={showProfilePictureModal} transparent animationType="fade">
          <View className="flex-1 bg-black/80 items-center justify-center p-6">
            <View className="bg-af-navy rounded-3xl p-6 w-full max-w-sm border border-white/20">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-white text-xl font-bold">Profile Picture</Text>
              <Pressable
                onPress={() => setShowProfilePictureModal(false)}
                className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
              >
                <X size={20} color="#C0C0C0" />
              </Pressable>
            </View>

            {/* Current Profile Picture Preview */}
            <View className="items-center mb-6">
              {user?.profilePicture ? (
                <Image
                  source={{ uri: user.profilePicture }}
                  className="w-32 h-32 rounded-full"
                />
              ) : (
                <View className="w-32 h-32 bg-af-accent/30 rounded-full items-center justify-center">
                  {userAccountType === 'fitflight_creator' ? (
                    <Crown size={64} color="#A855F7" />
                  ) : (
                    <User size={64} color="#4A90D9" />
                  )}
                </View>
              )}
            </View>

            {isUpdatingProfilePicture && (
              <View className="mb-4 rounded-xl border border-af-accent/30 bg-af-accent/10 px-4 py-3">
                <Text className="text-af-silver text-sm">Uploading image...</Text>
              </View>
            )}

            {/* Action Buttons */}
            <Pressable
              onPress={takeProfilePhoto}
              disabled={isUpdatingProfilePicture}
              className={cn(
                "flex-row items-center rounded-xl p-4 mb-3",
                isUpdatingProfilePicture
                  ? "bg-white/5 border border-white/10 opacity-60"
                  : "bg-af-accent/20 border border-af-accent/50"
              )}
            >
              <Camera size={24} color="#4A90D9" />
              <Text className="text-white font-semibold ml-3">Take Photo</Text>
            </Pressable>

            <Pressable
              onPress={pickProfilePicture}
              disabled={isUpdatingProfilePicture}
              className={cn(
                "flex-row items-center rounded-xl p-4 mb-3",
                isUpdatingProfilePicture
                  ? "bg-white/5 border border-white/10 opacity-60"
                  : "bg-white/5 border border-white/10"
              )}
            >
              <ImageIcon size={24} color="#C0C0C0" />
              <Text className="text-white font-semibold ml-3">Choose from Gallery</Text>
            </Pressable>

            {user?.profilePicture && (
              <Pressable
                onPress={removeProfilePicture}
                disabled={isUpdatingProfilePicture}
                className={cn(
                  "flex-row items-center rounded-xl p-4",
                  isUpdatingProfilePicture
                    ? "bg-white/5 border border-white/10 opacity-60"
                    : "bg-af-danger/20 border border-af-danger/50"
                )}
              >
                <Trash2 size={24} color="#EF4444" />
                <Text className="text-af-danger font-semibold ml-3">Remove Photo</Text>
              </Pressable>
            )}
            </View>
          </View>
        </Modal>

        <Modal visible={!!pendingProfileImageCrop} transparent animationType="fade">
          <View className="flex-1 bg-black/85 items-center justify-center p-6">
            <View className="bg-af-navy rounded-3xl p-6 w-full max-w-sm border border-white/20">
              <View className="flex-row items-center justify-between mb-4">
                <View>
                  <Text className="text-white text-xl font-bold">Crop Profile Picture</Text>
                  <Text className="text-af-silver text-sm mt-1">Adjust the image before uploading it to FitFlight.</Text>
                </View>
                <Pressable
                  onPress={cancelProfileImageCrop}
                  disabled={isUpdatingProfilePicture}
                  className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
                >
                  <X size={20} color="#C0C0C0" />
                </Pressable>
              </View>

              {profileCropPreview && pendingProfileImageCrop ? (
                <View className="items-center mb-5">
                  <View
                    style={{
                      width: profileCropPreview.frameSize,
                      height: profileCropPreview.frameSize,
                      borderRadius: 999,
                      overflow: 'hidden',
                      borderWidth: 2,
                      borderColor: '#4A90D9',
                      backgroundColor: 'rgba(255,255,255,0.05)',
                    }}
                  >
                    <Image
                      source={{ uri: pendingProfileImageCrop.uri }}
                      style={{
                        width: profileCropPreview.displayWidth,
                        height: profileCropPreview.displayHeight,
                        transform: [
                          { translateX: profileCropPreview.translateX },
                          { translateY: profileCropPreview.translateY },
                        ],
                      }}
                      resizeMode="cover"
                    />
                  </View>
                </View>
              ) : null}

              <View className="mb-4">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-white font-semibold">Zoom</Text>
                  <Text className="text-af-silver text-xs">{profileCropZoom.toFixed(2)}x</Text>
                </View>
                <SmartSlider
                  value={profileCropZoom}
                  minimumValue={1}
                  maximumValue={3}
                  step={0.01}
                  minimumTrackTintColor="#4A90D9"
                  maximumTrackTintColor="rgba(255,255,255,0.18)"
                  thumbTintColor="#4A90D9"
                  onValueChange={setProfileCropZoom}
                />
              </View>

              <View className="mb-4">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-white font-semibold">Horizontal Position</Text>
                  <Text className="text-af-silver text-xs">
                    {profileCropOffsetX > 0 ? 'Right' : profileCropOffsetX < 0 ? 'Left' : 'Centered'}
                  </Text>
                </View>
                <SmartSlider
                  value={profileCropOffsetX}
                  minimumValue={-1}
                  maximumValue={1}
                  step={0.01}
                  minimumTrackTintColor="#4A90D9"
                  maximumTrackTintColor="rgba(255,255,255,0.18)"
                  thumbTintColor="#4A90D9"
                  onValueChange={setProfileCropOffsetX}
                />
              </View>

              <View className="mb-6">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-white font-semibold">Vertical Position</Text>
                  <Text className="text-af-silver text-xs">
                    {profileCropOffsetY > 0 ? 'Down' : profileCropOffsetY < 0 ? 'Up' : 'Centered'}
                  </Text>
                </View>
                <SmartSlider
                  value={profileCropOffsetY}
                  minimumValue={-1}
                  maximumValue={1}
                  step={0.01}
                  minimumTrackTintColor="#4A90D9"
                  maximumTrackTintColor="rgba(255,255,255,0.18)"
                  thumbTintColor="#4A90D9"
                  onValueChange={setProfileCropOffsetY}
                />
              </View>

              {isUpdatingProfilePicture && (
                <View className="mb-4 rounded-xl border border-af-accent/30 bg-af-accent/10 px-4 py-3">
                  <Text className="text-af-silver text-sm">Uploading cropped image...</Text>
                </View>
              )}

              <View className="flex-row">
                <Pressable
                  onPress={cancelProfileImageCrop}
                  disabled={isUpdatingProfilePicture}
                  className={cn(
                    "flex-1 rounded-xl border px-4 py-3 mr-3 items-center",
                    isUpdatingProfilePicture ? "border-white/10 bg-white/5 opacity-60" : "border-white/10 bg-white/5"
                  )}
                >
                  <Text className="text-white font-semibold">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void confirmProfileImageCrop();
                  }}
                  disabled={isUpdatingProfilePicture}
                  className={cn(
                    "flex-1 rounded-xl px-4 py-3 items-center",
                    isUpdatingProfilePicture ? "bg-af-accent/40 opacity-70" : "bg-af-accent"
                  )}
                >
                  <Text className="text-white font-semibold">Crop & Upload</Text>
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
                      {typeof activeWorkoutSubmission.distance === 'number' ? `${activeWorkoutSubmission.distance} mi` : 'N/A'}
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
        <Animated.View entering={FadeIn.duration(180)} className="flex-1 bg-black/80 justify-end">
          <Animated.View entering={SlideInDown.duration(260)} className="bg-af-navy rounded-t-3xl p-6 pb-12 max-h-[85%]">
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
              {workoutHistory.length === 0 ? (
                <Text className="text-white/40 text-center py-8">No workouts recorded yet.</Text>
              ) : (
                workoutHistory.map((workout) => (
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
                          <Text className="text-white font-semibold">{typeof workout.distance === 'number' ? `${workout.distance} mi` : 'N/A'}</Text>
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
        <Animated.View entering={FadeIn.duration(180)} className="flex-1 bg-black/80 justify-end">
          <Animated.View entering={SlideInDown.duration(260)} className="bg-af-navy rounded-t-3xl p-6 pb-12 max-h-[85%]">
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
        <Animated.View entering={FadeIn.duration(180)} className="flex-1 bg-black/80 justify-end">
          <Animated.View entering={SlideInDown.duration(260)} className="bg-af-navy rounded-t-3xl p-6 pb-12 max-h-[80%]">
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
        <Animated.View entering={FadeIn.duration(180)} className="flex-1 bg-black/80 justify-end">
          <Animated.View entering={SlideInDown.duration(260)} className="bg-af-navy rounded-t-3xl p-6 pb-12 max-h-[82%]">
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


