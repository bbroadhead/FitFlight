import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal, Image, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Shield, LogOut, LogIn, UserPlus, Trash2, Users, Activity, X, Check, Bell, Crown, Settings, Plus, Camera, FileText, Calendar, Building2, AlertTriangle, Upload, Dumbbell, ImageIcon, HelpCircle, Mail, ChevronDown, ChevronUp, Pencil, Search, Star, MessageSquare } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useAuthStore, useMemberStore, type Flight, type Member, type AccountType, type Squadron, type IntegrationService, getDisplayName, canEditAttendance, canManagePTL, isAdmin, SQUADRONS, ALL_ACHIEVEMENTS } from '@/lib/store';
import { cn } from '@/lib/cn';
import { TrophyCase, CompactTrophyBadges } from '@/components/TrophyCase';
import { canUseStravaSync, disconnectStrava, getStravaSetupError, mapImportedWorkouts, startStravaConnect, syncStravaWorkouts } from '@/lib/strava';
import { signOutFromSupabase } from '@/lib/supabaseAuth';
import { buildTrophyStats, getRarestEarnedTrophies } from '@/lib/trophies';
import { formatMonthLabel, getAvailableMonthKeys, getMemberMonthSummary, getMonthKey } from '@/lib/monthlyStats';
import {
  fetchApprovedManualWorkouts,
  fetchAttendanceSessions,
  fetchManualWorkoutSubmissions,
  assignUFPMRole,
  createRosterMember,
  deleteRosterMember,
  ensureMemberRole,
  markManualWorkoutSubmissionRead,
  fetchSupportMessages,
  fetchSupportThreads,
  markSupportMessagesRead,
  reviewManualWorkoutSubmission,
  sendSupportMessage,
  setAttendanceStatus,
  type ManualWorkoutSubmission,
  type SupportMessage,
  type SupportThreadSummary,
  updateMemberRole,
  updateRosterMember,
} from '@/lib/supabaseData';

const FLIGHTS: Flight[] = ['Apex', 'Bomber', 'Cryptid', 'Doom', 'Ewok', 'Foxhound', 'ADF', 'DET'];
const RANKS = ['AB', 'Amn', 'A1C', 'SrA', 'SSgt', 'TSgt', 'MSgt', 'SMSgt', 'CMSgt'];
const OWNER_EMAIL = 'benjamin.broadhead.2@us.af.mil';
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

function RunningIcon({ size, color }: { size: number; color: string }) {
  return <MaterialCommunityIcons name="run-fast" size={size} color={color} />;
}

export default function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const accessToken = useAuthStore(s => s.accessToken);
  const members = useMemberStore(s => s.members);
  const addMember = useMemberStore(s => s.addMember);
  const removeMember = useMemberStore(s => s.removeMember);
  const importWorkouts = useMemberStore(s => s.importWorkouts);
  const notifications = useMemberStore(s => s.notifications);
  const syncPTSessions = useMemberStore(s => s.syncPTSessions);
  const syncApprovedManualWorkouts = useMemberStore(s => s.syncApprovedManualWorkouts);
  const approvePTL = useMemberStore(s => s.approvePTL);
  const rejectPTL = useMemberStore(s => s.rejectPTL);
  const revokePTL = useMemberStore(s => s.revokePTL);
  const setUFPM = useMemberStore(s => s.setUFPM);
  const markNotificationRead = useMemberStore(s => s.markNotificationRead);

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
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showUFPMModal, setShowUFPMModal] = useState(false);
  const [showUFPMConfirmModal, setShowUFPMConfirmModal] = useState(false);
  const [showTrophyCase, setShowTrophyCase] = useState(false);
  const [showWorkoutReviewModal, setShowWorkoutReviewModal] = useState(false);
  const [showWorkoutHistoryModal, setShowWorkoutHistoryModal] = useState(false);
  const [showPFRAHistoryModal, setShowPFRAHistoryModal] = useState(false);
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

  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const updateUser = useAuthStore(s => s.updateUser);
  const updateMember = useMemberStore(s => s.updateMember);
  const currentMember = user ? members.find((member) => member.id === user.id) : null;

  const userAccountType = user?.accountType ?? 'standard';
  const canManage = canManagePTL(userAccountType);
  const hasAdminAccess = isAdmin(userAccountType);
  const canManageMembers = canEditAttendance(userAccountType);
  const canReviewManualWorkouts = canEditAttendance(userAccountType);
  const isOwnerReviewer = user?.email?.toLowerCase() === OWNER_EMAIL;

  const unreadNotifications = notifications.filter(n => !n.read);
  const ptlRequests = notifications.filter(n => n.type === 'ptl_request' && !n.read);
  const currentUFPM = members.find((member) => member.accountType === 'ufpm') ?? null;
  const normalizedMemberSearch = memberSearchQuery.trim().toLowerCase();
  const normalizedUFPMSearch = ufpmSearchQuery.trim().toLowerCase();
  const memberSquadron = user?.squadron ?? 'Hawks';
  const isWeb = Platform.OS === 'web';
  const isStandalonePwa = isWeb && typeof window !== 'undefined'
    ? window.matchMedia?.('(display-mode: standalone)')?.matches || ((window.navigator as Navigator & { standalone?: boolean }).standalone ?? false)
    : false;
  const userAgent = isWeb && typeof window !== 'undefined' ? window.navigator.userAgent.toLowerCase() : '';
  const isIos = /iphone|ipad|ipod/.test(userAgent);
  const isAndroid = /android/.test(userAgent);
  const isDesktop = isWeb && !isIos && !isAndroid;
  const isSafari = isIos && /safari/.test(userAgent) && !/crios|fxios|edgios/.test(userAgent);
  const supportThread = !isOwnerReviewer
    ? supportThreads.find((thread) => thread.requesterEmail.toLowerCase() === user?.email?.toLowerCase())
    : null;
  const unreadSupportCount = useMemo(
    () => supportThreads.reduce(
      (total, thread) => total + (isOwnerReviewer ? thread.unreadForOwner : thread.unreadForRequester),
      0
    ),
    [isOwnerReviewer, supportThreads]
  );
  const unreadManualWorkoutCount = useMemo(
    () => (
      manualWorkoutSubmissions.filter((submission) => submission.status !== 'pending' && !submission.requesterRead).length +
      manualWorkoutReviewQueue.length
    ),
    [manualWorkoutReviewQueue.length, manualWorkoutSubmissions]
  );
  const totalUnreadCount = unreadNotifications.length + unreadSupportCount + unreadManualWorkoutCount;

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
        isOwner: isOwnerReviewer,
        accessToken,
      });

      setSupportThreads(nextThreads);

      if (!isOwnerReviewer) {
        const ownThread = nextThreads.find((thread) => thread.requesterEmail.toLowerCase() === user.email.toLowerCase()) ?? null;
        setActiveSupportThreadId((current) => current ?? ownThread?.id ?? null);
        if (ownThread && !supportSubject.trim()) {
          setSupportSubject(ownThread.subject);
        }
      } else if (nextThreads.length > 0) {
        setActiveSupportThreadId((current) => current ?? nextThreads[0].id);
      }
    } catch (error) {
      setSupportError(error instanceof Error ? error.message : 'Unable to load developer messages.');
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
          viewer: isOwnerReviewer ? 'owner' : 'requester',
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
              unreadForOwner: isOwnerReviewer ? 0 : thread.unreadForOwner,
              unreadForRequester: isOwnerReviewer ? thread.unreadForRequester : 0,
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
  }, [accessToken, isOwnerReviewer, user?.email]);

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
        linkedAttendanceId: previousMember?.linkedAttendanceId,
        monthlyPlacements: previousMember?.monthlyPlacements ?? [],
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
    Haptics.notificationAsync(
      approve
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning
    );

    if (approve) {
      approvePTL(memberId);
    } else {
      rejectPTL(memberId);
    }
    setShowPTLRequestModal(false);
    setSelectedPTLRequest(null);
  };

  const handleRevokePTL = (memberId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    revokePTL(memberId);
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

    const updatedMember: Member = {
      ...currentMember,
      profilePicture,
    };

    if (accessToken) {
      await updateRosterMember(currentMember, updatedMember, accessToken);
    }

    updateMember(user.id, { profilePicture });
    updateUser({ profilePicture });
  };

  const pickProfilePicture = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0] && user) {
        const asset = result.assets[0];
        const imageUri = asset.base64
          ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`
          : asset.uri;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await persistProfilePicture(imageUri);

        setShowProfilePictureModal(false);
      }
    } catch (error) {
      setMemberActionError(error instanceof Error ? error.message : 'Unable to update profile picture.');
    }
  };

  const takeProfilePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0] && user) {
        const asset = result.assets[0];
        const imageUri = asset.base64
          ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`
          : asset.uri;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await persistProfilePicture(imageUri);

        setShowProfilePictureModal(false);
      }
    } catch (error) {
      setMemberActionError(error instanceof Error ? error.message : 'Unable to update profile picture.');
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
        setMemberActionError(error instanceof Error ? error.message : 'Unable to remove profile picture.');
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

      importWorkouts(user.id, mapImportedWorkouts(result.workouts));
      setIntegrationConnection('strava', true, result.connection);

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
      case 'apple_health': return 'Apple Health';
      case 'strava': return 'Strava';
      case 'garmin': return 'Garmin';
      default: return service;
    }
  };

  const handleViewTutorial = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateUser({ hasSeenTutorial: false });
    router.push('/welcome');
  };

  const handleToggleDeveloperContact = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowDeveloperContact(current => !current);
  };

  const handleOpenDeveloperMessages = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSupportError(null);
    if (supportThread?.subject && !supportSubject.trim()) {
      setSupportSubject(supportThread.subject);
    }
    if (supportThread?.id) {
      void loadSupportConversation(supportThread.id, { markRead: true });
    } else {
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
    }
    void loadSupportConversation(threadId, { markRead: true });
  };

  const handleOpenSupportNotification = (threadId: string) => {
    const nextThread = supportThreads.find((thread) => thread.id === threadId);
    if (nextThread) {
      setSupportSubject(nextThread.subject);
    }

    if (isOwnerReviewer) {
      setShowNotificationsModal(false);
      setShowSupportInboxModal(true);
      void loadSupportConversation(threadId, { markRead: true });
      return;
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
        const updatedSubmission = await reviewManualWorkoutSubmission({
          submissionId: activeWorkoutSubmission.id,
          reviewerMemberId: user.id,
          reviewerName: getDisplayName(user),
          approved,
          note: manualWorkoutReviewNote,
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
        setSupportError('You must be signed in to message the developer.');
        return;
      }

      if (!supportSubject.trim() || !supportBody.trim()) {
        setSupportError('Please add both a subject line and message.');
        return;
      }

      setSupportSending(true);
      setSupportError(null);

      const threadOwner = isOwnerReviewer
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
        senderMemberId: user.id,
        senderEmail: user.email,
        senderName: getDisplayName(user),
        subject: supportSubject.trim(),
        body: supportBody.trim(),
        isFromOwner: isOwnerReviewer,
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
    ? members.find(m => m.id === user.id) || {
        exerciseMinutes: 0,
        distanceRun: 0,
        connectedApps: [],
        workouts: [],
        achievements: [],
      }
    : null;
  const availableSummaryMonths = useMemo(
    () => getAvailableMonthKeys(userStats && 'workouts' in userStats && 'fitnessAssessments' in userStats ? [userStats as Member] : [], []),
    [userStats]
  );
  const summaryMonth = availableSummaryMonths.includes(selectedSummaryMonth)
    ? selectedSummaryMonth
    : availableSummaryMonths[0] ?? getMonthKey();
  const monthlyUserSummary = userStats && 'workouts' in userStats
    ? getMemberMonthSummary(userStats as Member, summaryMonth)
    : { workoutCount: 0, minutes: 0, miles: 0, score: 0 };
  const monthlyPFRAEntries = userStats && 'fitnessAssessments' in userStats
    ? (userStats as Member).fitnessAssessments.filter((assessment) => assessment.date.startsWith(summaryMonth))
    : [];
  const latestMonthlyPFRA = monthlyPFRAEntries[monthlyPFRAEntries.length - 1] ?? null;
  const trophyStats = useMemo(
    () => buildTrophyStats(
      ALL_ACHIEVEMENTS,
      members,
      {
        achievements: userStats?.achievements ?? [],
        trophyCount: 'trophyCount' in (userStats ?? {}) ? (userStats as Member).trophyCount ?? 0 : 0,
        monthlyPlacements: 'monthlyPlacements' in (userStats ?? {}) ? (userStats as Member).monthlyPlacements ?? [] : [],
      }
    ),
    [members, userStats]
  );
  const workoutHistory = useMemo(
    () => (userStats && 'workouts' in userStats ? [...(userStats as Member).workouts].sort((a, b) => b.date.localeCompare(a.date)) : []),
    [userStats]
  );
  const pfraHistory = useMemo(
    () => (userStats && 'fitnessAssessments' in userStats ? [...(userStats as Member).fitnessAssessments].sort((a, b) => b.date.localeCompare(a.date)) : []),
    [userStats]
  );
  const rarestTrophies = useMemo(
    () => getRarestEarnedTrophies(
      ALL_ACHIEVEMENTS,
      members,
      {
        achievements: userStats?.achievements ?? [],
        trophyCount: 'trophyCount' in (userStats ?? {}) ? (userStats as Member).trophyCount ?? 0 : 0,
        monthlyPlacements: 'monthlyPlacements' in (userStats ?? {}) ? (userStats as Member).monthlyPlacements ?? [] : [],
      },
      3
    ),
    [members, userStats]
  );
  const earnedTrophyCount = trophyStats.filter((trophy) => trophy.isEarned).length;
  const trophyOverflowCount = Math.max(earnedTrophyCount - rarestTrophies.length, 0);

  const getAccountTypeLabel = (accountType: AccountType) => {
    switch (accountType) {
      case 'fitflight_creator': return 'FitFlight Creator';
      case 'ufpm': return 'UFPM';
      case 'squadron_leadership': return 'Squadron Leadership';
      case 'ptl': return 'PFL';
      default: return 'Member';
    }
  };

  const handleOpenInstallHelp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

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
      case 'squadron_leadership': return { bg: 'bg-sky-500/20', text: 'text-sky-300', border: 'border-sky-400/40' };
      case 'ptl': return { bg: 'bg-af-accent/20', text: 'text-af-accent', border: 'border-af-accent/50' };
      default: return { bg: 'bg-white/10', text: 'text-af-silver', border: 'border-white/20' };
    }
  };

  const supportNotifications = useMemo<SupportNotificationItem[]>(
    () => supportThreads
      .filter((thread) => (isOwnerReviewer ? thread.unreadForOwner : thread.unreadForRequester) > 0)
      .map((thread) => ({
        id: `support-${thread.id}`,
        title: isOwnerReviewer
          ? `New message from ${thread.requesterName}`
          : 'Developer replied to your message',
        message: thread.subject,
        unread: true,
        threadId: thread.id,
        kind: 'support',
      })),
    [isOwnerReviewer, supportThreads]
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
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
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
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowNotificationsModal(true);
                }}
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
              <View className="flex-1">
                <Text className="text-white text-xl font-bold">{userDisplayName}</Text>
                <CompactTrophyBadges trophies={rarestTrophies} overflowCount={trophyOverflowCount} />
                <Text className="text-af-silver">{user?.email}</Text>
                <View className="flex-row items-center mt-1">
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
          </Animated.View>

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

          <Animated.View
            entering={FadeInDown.delay(210).springify()}
            className="mx-6 mt-4"
          >
            <View className="flex-row" style={{ gap: 12 }}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowWorkoutHistoryModal(true);
                }}
                className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <Text className="text-white font-semibold">Workout History</Text>
                <Text className="text-af-silver text-xs mt-1">View all logged workouts and details</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowPFRAHistoryModal(true);
                }}
                className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <Text className="text-white font-semibold">PFRA History</Text>
                <Text className="text-af-silver text-xs mt-1">Review previous PFRA records and scores</Text>
              </Pressable>
            </View>
          </Animated.View>

          {/* Quick Actions */}
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
                className="flex-1 bg-af-accent/20 border border-af-accent/50 rounded-xl px-3 py-4 mr-2 min-h-[112px]"
              >
                <View className="flex-1 items-center justify-center">
                  <Plus size={24} color="#4A90D9" />
                  <Text className="text-white font-semibold mt-2 text-sm text-center leading-5">Add Manual Workout</Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/upload-fitness');
                }}
                className="flex-1 bg-af-success/20 border border-af-success/50 rounded-xl px-3 py-4 mx-1 min-h-[112px]"
              >
                <View className="flex-1 items-center justify-center">
                  <FileText size={24} color="#22C55E" />
                  <Text className="text-white font-semibold mt-2 text-sm text-center leading-5">Add Manual PFRA</Text>
                </View>
              </Pressable>
              {canEditAttendance(userAccountType) && (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push('/schedule-session');
                  }}
                  className="flex-1 bg-af-gold/20 border border-af-gold/50 rounded-xl px-3 py-4 ml-2 min-h-[112px]"
                >
                  <View className="flex-1 items-center justify-center">
                    <Calendar size={24} color="#FFD700" />
                    <Text className="text-white font-semibold mt-2 text-sm text-center leading-5">Schedule PT Session</Text>
                  </View>
                </Pressable>
              )}
            </View>
          </Animated.View>

          {/* Connected Apps */}
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

          {/* Admin Actions */}
          {hasAdminAccess && (
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

              {userAccountType === 'fitflight_creator' && (
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
          )}

          {/* PFL Actions (for PFLs only, not admins) */}
          {canEditAttendance(userAccountType) && !hasAdminAccess && (
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
          )}

          {/* Help & Tutorial */}
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

            {isOwnerReviewer ? (
              <Pressable
                onPress={handleOpenSupportInbox}
                className="flex-row items-center bg-af-accent/10 border border-af-accent/30 rounded-xl p-4 mb-3"
              >
                <Mail size={24} color="#4A90D9" />
                <View className="ml-3 flex-1">
                  <Text className="text-white font-semibold">Support Inbox</Text>
                  <Text className="text-af-silver text-xs">Review and reply to member messages</Text>
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
                  <Text className="text-white font-semibold">Contact the Developer</Text>
                  <Text className="text-af-silver text-xs">View support contact information</Text>
                </View>
                {showDeveloperContact ? (
                  <ChevronUp size={20} color="#C0C0C0" />
                ) : (
                  <ChevronDown size={20} color="#C0C0C0" />
                )}
              </View>

              {showDeveloperContact && (
                <View className="mt-4 pt-4 border-t border-white/10">
                  <Text className="text-white font-semibold">SSgt Benjamin Broadhead</Text>
                  <Text className="text-af-silver mt-1">benjamin.broadhead.2@us.af.mil</Text>
                  <Pressable
                    onPress={handleOpenDeveloperMessages}
                    className="flex-row items-center bg-af-accent/10 border border-af-accent/30 rounded-xl p-4 mt-4"
                  >
                    <MessageSquare size={22} color="#4A90D9" />
                    <View className="ml-3 flex-1">
                      <Text className="text-white font-semibold">Send a Message to the Developer</Text>
                      <Text className="text-af-silver text-xs">Ask a question or report an issue in-app</Text>
                    </View>
                    {supportThread && supportThread.unreadForRequester > 0 ? (
                      <View className="bg-af-danger rounded-full px-2 py-1">
                        <Text className="text-white text-xs font-bold">{supportThread.unreadForRequester}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                </View>
              )}
            </Pressable>
          </Animated.View>

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
                            onPress={() => handleRemoveMember(member.id)}
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
                <Text className="text-white text-xl font-bold">Message the Developer</Text>
                <Text className="text-af-silver text-sm mt-1">Send a support message without leaving the app</Text>
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
                      Your message will start a private conversation with the developer.
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
                            {message.isFromOwner ? 'Developer' : 'You'}
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
                <Text className="text-af-silver text-sm mt-1">Owner-only message center</Text>
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
      <Modal visible={showNotificationsModal} transparent animationType="slide">
        <View className="flex-1 bg-black/80 justify-end">
          <View className="bg-af-navy rounded-t-3xl p-6 pb-12 max-h-[80%]">
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
              {notifications.length === 0 && supportNotifications.length === 0 && manualWorkoutNotifications.length === 0 ? (
                <Text className="text-white/40 text-center py-8">No notifications</Text>
              ) : (
                <>
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
                        Tap to open {isOwnerReviewer ? 'the support inbox' : 'your conversation'}
                      </Text>
                    </Pressable>
                  ))}

                  {notifications.map((notification) => {
                    const isPTLRequest = notification.type === 'ptl_request';
                    return (
                      <Pressable
                        key={notification.id}
                        onPress={() => {
                          if (isPTLRequest && notification.data?.memberId) {
                            setSelectedPTLRequest(notification.data.memberId as string);
                            setShowPTLRequestModal(true);
                            setShowNotificationsModal(false);
                          }
                          markNotificationRead(notification.id);
                        }}
                        className={cn(
                          "p-4 rounded-xl mb-3 border",
                          notification.read ? "bg-white/5 border-white/10" : "bg-af-accent/10 border-af-accent/30"
                        )}
                      >
                        <Text className="text-white font-semibold">{notification.title}</Text>
                        <Text className="text-af-silver text-sm mt-1">{notification.message}</Text>
                        {isPTLRequest && !notification.read && (
                          <Text className="text-af-accent text-xs mt-2">Tap to review</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </>
              )}
            </ScrollView>
          </View>
        </View>
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

            {/* Action Buttons */}
            <Pressable
              onPress={takeProfilePhoto}
              className="flex-row items-center bg-af-accent/20 border border-af-accent/50 rounded-xl p-4 mb-3"
            >
              <Camera size={24} color="#4A90D9" />
              <Text className="text-white font-semibold ml-3">Take Photo</Text>
            </Pressable>

            <Pressable
              onPress={pickProfilePicture}
              className="flex-row items-center bg-white/5 border border-white/10 rounded-xl p-4 mb-3"
            >
              <ImageIcon size={24} color="#C0C0C0" />
              <Text className="text-white font-semibold ml-3">Choose from Gallery</Text>
            </Pressable>

            {user?.profilePicture && (
              <Pressable
                onPress={removeProfilePicture}
                className="flex-row items-center bg-af-danger/20 border border-af-danger/50 rounded-xl p-4"
              >
                <Trash2 size={24} color="#EF4444" />
                <Text className="text-af-danger font-semibold ml-3">Remove Photo</Text>
              </Pressable>
            )}
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

      <Modal visible={showWorkoutHistoryModal} transparent animationType="slide">
        <View className="flex-1 bg-black/80 justify-end">
          <View className="bg-af-navy rounded-t-3xl p-6 pb-12 max-h-[85%]">
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
                        <Text className="text-white font-semibold">{workout.title ?? workout.type}</Text>
                        <Text className="text-af-silver text-xs mt-1">{workout.date}</Text>
                      </View>
                      <View className="rounded-full bg-white/10 px-3 py-1">
                        <Text className="text-af-silver text-xs">{workout.source === 'manual' ? 'Manual' : workout.source}</Text>
                      </View>
                    </View>
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
                    {workout.screenshotUri ? (
                      <Image
                        source={{ uri: workout.screenshotUri }}
                        className="w-full h-40 rounded-xl mt-4"
                        resizeMode="cover"
                      />
                    ) : (
                      <View className="mt-4 rounded-xl border border-white/10 bg-black/10 p-4 items-center">
                        <Text className="text-af-silver text-xs">No image available for this workout.</Text>
                      </View>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showPFRAHistoryModal} transparent animationType="slide">
        <View className="flex-1 bg-black/80 justify-end">
          <View className="bg-af-navy rounded-t-3xl p-6 pb-12 max-h-[85%]">
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
          </View>
        </View>
      </Modal>

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


