import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, Modal, Image } from 'react-native';
import Checkbox from 'expo-checkbox';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Redirect } from 'expo-router';
import { Shield, User, Mail, Lock, ChevronRight, Users, AlertCircle, Building2 } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuthStore, useMemberStore, type AccountType, type Flight, type Member, type Squadron, type User as UserType, getDisplayName, SQUADRONS } from '@/lib/store';
import { cn } from '@/lib/cn';
import { clearUrlHashSession, getUserForAccessToken, readSessionFromUrlHash, requestPasswordReset, signInWithPassword, signUpWithPassword } from '@/lib/supabaseAuth';
import { createRosterMember, ensureMemberRole, fetchRoleForEmail, fetchRosterMembers, sendAppNotification, updateRosterMember } from '@/lib/supabaseData';

const FLIGHTS: Flight[] = ['Apex', 'Bomber', 'Cryptid', 'Doom', 'Ewok', 'Foxhound', 'ADF', 'DET'];
const RANKS = ['AB', 'Amn', 'A1C', 'SrA', 'SSgt', 'TSgt', 'MSgt', 'SMSgt', 'CMSgt'];
const EMAIL_RATE_LIMIT_MESSAGE = "The server's hourly email limit has been reached. Please try again in 1 hour.";

function normalizeSpecialMemberName(firstName: string, lastName: string) {
  const normalizedFirstName = firstName.trim().toLowerCase();
  const normalizedLastName = lastName.trim().toLowerCase();

  if (normalizedFirstName === 'benjamin' && normalizedLastName === 'broadhead') {
    return {
      firstName: 'BENJAMIN',
      lastName: 'BROADHEAD',
    };
  }

  return {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
  };
}

function getInitialAccountType(firstName: string, lastName: string): AccountType {
  const normalizedFirstName = firstName.trim().toLowerCase();
  const normalizedLastName = lastName.trim().toLowerCase();

  if (normalizedFirstName === 'jacob' && normalizedLastName === 'de la rosa') {
    return 'ufpm';
  }

  if (
    (normalizedFirstName === 'benjamin' && normalizedLastName === 'isenberg') ||
    (normalizedFirstName === 'jessica' && normalizedLastName === 'kick') ||
    (normalizedFirstName === 'nicky' && normalizedLastName === 'spader')
  ) {
    return 'squadron_leadership';
  }

  return 'standard';
}

function findMatchingMember<T extends Pick<Member, 'id' | 'email' | 'firstName' | 'lastName'>>(
  members: T[],
  options: { email?: string; firstName?: string; lastName?: string }
): T | null {
  const normalizedEmail = options.email?.trim().toLowerCase();
  if (normalizedEmail) {
    const emailMatch = members.find((member) => member.email.trim().toLowerCase() === normalizedEmail);
    if (emailMatch) {
      return emailMatch;
    }
  }

  const normalizedFirstName = options.firstName?.trim().toLowerCase();
  const normalizedLastName = options.lastName?.trim().toLowerCase();
  if (!normalizedFirstName || !normalizedLastName) {
    return null;
  }

  return members.find((member) =>
    member.firstName.trim().toLowerCase() === normalizedFirstName &&
    member.lastName.trim().toLowerCase() === normalizedLastName
  ) ?? null;
}

function getPostLoginRoute(member: Pick<Member, 'mustChangePassword' | 'hasLoggedIntoApp'>) {
  if (member.mustChangePassword && !member.hasLoggedIntoApp) {
    return '/reset-password?mode=first-login';
  }

  return member.hasLoggedIntoApp ? '/' : '/welcome';
}

function getFriendlyEmailSendError(error: unknown, fallbackMessage: string) {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes('rate limit') ||
    normalizedMessage.includes('email rate') ||
    normalizedMessage.includes('security purposes') ||
    normalizedMessage.includes('try again later') ||
    normalizedMessage.includes('only request this after')
  ) {
    return EMAIL_RATE_LIMIT_MESSAGE;
  }

  return message;
}

async function syncRosterMemberAfterRegistration(
  nextMember: Member,
  accessToken?: string,
  previousMember?: Member | null
) {
  if (!accessToken) {
    return;
  }

  if (previousMember) {
    try {
      await updateRosterMember(previousMember, nextMember, accessToken);
      return;
    } catch {
      // Fall back to create in case this member exists only locally or the old match shape changed.
    }
  }

  await createRosterMember(nextMember, accessToken).catch(() => undefined);
}

async function sendPtlRequestNotifications(params: {
  requester: Member;
  accessToken?: string;
}) {
  if (!params.accessToken || !params.requester.ptlPendingApproval) {
    return;
  }

  const rosterMembers = await fetchRosterMembers(params.accessToken, params.requester.squadron).catch(() => []);
  const recipients = rosterMembers.filter((member) =>
    member.email.toLowerCase() !== params.requester.email.toLowerCase() &&
    ['fitflight_creator', 'ufpm', 'squadron_leadership'].includes(member.accountType)
  );

  await Promise.all(
    recipients.map((recipient) =>
      sendAppNotification({
        senderMemberId: params.requester.id,
        senderEmail: params.requester.email,
        senderName: getDisplayName(params.requester),
        recipientEmail: recipient.email,
        recipientMemberId: recipient.id,
        squadron: params.requester.squadron,
        type: 'ptl_request',
        title: 'PFL Request',
        message: `${getDisplayName(params.requester)} requested PFL access.`,
        actionType: 'review_ptl_request',
        actionTargetId: params.requester.id,
        actionPayload: {
          memberId: params.requester.id,
        },
        accessToken: params.accessToken,
      }).catch(() => undefined)
    )
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore(s => s.login);
  const setSessionTokens = useAuthStore(s => s.setSessionTokens);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const hasCheckedAuth = useAuthStore(s => s.hasCheckedAuth);
  const members = useMemberStore(s => s.members);
  const addMember = useMemberStore(s => s.addMember);
  const updateMember = useMemberStore(s => s.updateMember);
  const syncMembersFromRoster = useMemberStore(s => s.syncMembersFromRoster);

  const [isSignUp, setIsSignUp] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedFlight, setSelectedFlight] = useState<Flight>('Apex');
  const [selectedSquadron, setSelectedSquadron] = useState<Squadron>('Hawks');
  const [selectedRank, setSelectedRank] = useState('A1C');
  const [wantsPTL, setWantsPTL] = useState(false);
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [error, setError] = useState('');
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState('');

  const validateEmail = (emailToValidate: string): boolean => {
    return emailToValidate.toLowerCase().endsWith('@us.af.mil');
  };

  useEffect(() => {
    const sessionFromHash = readSessionFromUrlHash();
    if (!sessionFromHash) {
      return;
    }

    if (sessionFromHash.type === 'recovery') {
      if (typeof window !== 'undefined') {
        const appUrl = process.env.EXPO_PUBLIC_APP_URL?.replace(/\/+$/, '') ?? '';
        const fallbackBase = `${window.location.origin}${window.location.pathname.replace(/\/login$/, '').replace(/\/$/, '')}`;
        const baseUrl = appUrl || fallbackBase;
        window.location.replace(`${baseUrl}/reset-password${window.location.hash}`);
        return;
      }

      router.replace('/reset-password');
      return;
    }

    const finalizeEmailConfirmation = async () => {
      try {
        const authUser = await getUserForAccessToken(sessionFromHash.accessToken);
        const metadata = authUser.user_metadata ?? {};
        const normalizedEmail = (authUser.email ?? email).toLowerCase();
        const roleRecord = await fetchRoleForEmail(normalizedEmail, sessionFromHash.accessToken).catch(() => null);
        const resolvedSquadron = (typeof metadata.squadron === 'string' ? metadata.squadron : 'Hawks') as Squadron;
        const rosterMembers = await fetchRosterMembers(sessionFromHash.accessToken, resolvedSquadron).catch(() => []);
        const localExistingMember = findMatchingMember(members, {
          email: normalizedEmail,
          firstName: typeof metadata.firstName === 'string' ? metadata.firstName : '',
          lastName: typeof metadata.lastName === 'string' ? metadata.lastName : '',
        });
        const rosterExistingMember = findMatchingMember(rosterMembers, {
          email: normalizedEmail,
          firstName: typeof metadata.firstName === 'string' ? metadata.firstName : '',
          lastName: typeof metadata.lastName === 'string' ? metadata.lastName : '',
        });
        const existingMember = localExistingMember ?? rosterExistingMember;
        const normalizedSpecialName = normalizeSpecialMemberName(
          typeof metadata.firstName === 'string' ? metadata.firstName : existingMember?.firstName ?? 'Airman',
          typeof metadata.lastName === 'string' ? metadata.lastName : existingMember?.lastName ?? 'Member'
        );

        const member = existingMember
          ? {
              ...existingMember,
              id: authUser.id,
              firstName: normalizedSpecialName.firstName,
              lastName: normalizedSpecialName.lastName,
              email: normalizedEmail,
              isVerified: true,
            }
          : {
              id: authUser.id,
              rank: typeof metadata.rank === 'string' ? metadata.rank : 'A1C',
              firstName: normalizedSpecialName.firstName,
              lastName: normalizedSpecialName.lastName,
              flight: (typeof metadata.flight === 'string' ? metadata.flight : 'Apex') as Flight,
              squadron: (typeof metadata.squadron === 'string' ? metadata.squadron : 'Hawks') as Squadron,
              accountType: roleRecord?.app_role ?? getInitialAccountType(
                typeof metadata.firstName === 'string' ? metadata.firstName : 'Airman',
                typeof metadata.lastName === 'string' ? metadata.lastName : 'Member'
              ),
              email: normalizedEmail,
              exerciseMinutes: 0,
              distanceRun: 0,
              connectedApps: [] as string[],
              fitnessAssessments: [],
              workouts: [],
              achievements: [] as string[],
              requiredPTSessionsPerWeek: 3,
              isVerified: true,
              ptlPendingApproval: Boolean(metadata.wantsPTL),
              monthlyPlacements: [],
              leaderboardHistory: [],
              trophyCount: 0,
              hasSeenTutorial: false,
              mustChangePassword: false,
              hasLoggedIntoApp: false,
            };

        const normalizedRosterMembers = rosterMembers.map((rosterMember) => {
          const matchesCurrentUser =
            (rosterMember.email && rosterMember.email.toLowerCase() === normalizedEmail) ||
            (
              rosterMember.firstName.trim().toLowerCase() === member.firstName.trim().toLowerCase() &&
              rosterMember.lastName.trim().toLowerCase() === member.lastName.trim().toLowerCase()
            );

          return matchesCurrentUser ? { ...rosterMember, id: authUser.id, email: normalizedEmail } : rosterMember;
        });

        syncMembersFromRoster(normalizedRosterMembers);

        if (!existingMember) {
          addMember(member);
          await createRosterMember(member, sessionFromHash.accessToken).catch(() => undefined);
        } else if (!localExistingMember) {
          addMember({
            ...existingMember,
            id: authUser.id,
            email: normalizedEmail,
            isVerified: true,
          });
        } else {
          updateMember(existingMember.id, {
            email: normalizedEmail,
            rank: member.rank,
            firstName: member.firstName,
            lastName: member.lastName,
            flight: member.flight,
            squadron: member.squadron,
            accountType: member.accountType,
            isVerified: true,
            ptlPendingApproval: member.ptlPendingApproval,
            profilePicture: member.profilePicture,
          });
        }

        await syncRosterMemberAfterRegistration(member, sessionFromHash.accessToken, rosterExistingMember ?? existingMember);
        await sendPtlRequestNotifications({
          requester: member,
          accessToken: sessionFromHash.accessToken,
        }).catch(() => undefined);

        await ensureMemberRole(normalizedEmail, member.accountType, sessionFromHash.accessToken).catch(() => undefined);

        setSessionTokens({
          accessToken: sessionFromHash.accessToken,
          refreshToken: sessionFromHash.refreshToken ?? null,
        });

        login({
          id: member.id,
          rank: member.rank,
          firstName: member.firstName,
          lastName: member.lastName,
          flight: member.flight,
          squadron: member.squadron,
          accountType: member.accountType,
          email: member.email,
          profilePicture: member.profilePicture,
          isVerified: true,
          ptlPendingApproval: member.ptlPendingApproval,
          fitnessAssessmentsPrivate: false,
          hasSeenTutorial: member.hasSeenTutorial ?? false,
          mustChangePassword: member.mustChangePassword ?? false,
          hasLoggedIntoApp: member.hasLoggedIntoApp ?? false,
        }, { rememberSession: true });

        clearUrlHashSession();
        router.replace(getPostLoginRoute(member));
      } catch (confirmationError) {
        clearUrlHashSession();
        setError(
          confirmationError instanceof Error
            ? confirmationError.message
            : 'Unable to complete email verification.'
        );
      }
    };

    void finalizeEmailConfirmation();
  }, [addMember, email, login, members, router, setSessionTokens, syncMembersFromRoster, updateMember]);

  const handleSignIn = () => {
    const run = async () => {
      setError('');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (!email || !password) {
        setError('Please enter email and password');
        return;
      }

      const response = await signInWithPassword(email.toLowerCase(), password);
      const metadata = response.user.user_metadata ?? {};
      const normalizedEmail = email.toLowerCase();
      const roleRecord = await fetchRoleForEmail(normalizedEmail, response.access_token).catch(() => null);
      const resolvedSquadron = (typeof metadata.squadron === 'string' ? metadata.squadron : selectedSquadron) as Squadron;
      const rosterMembers = await fetchRosterMembers(response.access_token, resolvedSquadron).catch(() => []);
      const localExistingMember = findMatchingMember(members, {
        email: normalizedEmail,
        firstName: typeof metadata.firstName === 'string' ? metadata.firstName : '',
        lastName: typeof metadata.lastName === 'string' ? metadata.lastName : '',
      });
      const rosterExistingMember = findMatchingMember(rosterMembers, {
        email: normalizedEmail,
        firstName: typeof metadata.firstName === 'string' ? metadata.firstName : '',
        lastName: typeof metadata.lastName === 'string' ? metadata.lastName : '',
      });
      const existingMember = localExistingMember ?? rosterExistingMember;
      const normalizedSpecialName = normalizeSpecialMemberName(
        typeof metadata.firstName === 'string' ? metadata.firstName : existingMember?.firstName ?? 'Airman',
        typeof metadata.lastName === 'string' ? metadata.lastName : existingMember?.lastName ?? 'Member'
      );

      const member = existingMember
        ? {
            ...existingMember,
            id: response.user.id,
            firstName: normalizedSpecialName.firstName,
            lastName: normalizedSpecialName.lastName,
            email: normalizedEmail,
            accountType: roleRecord?.app_role ?? existingMember.accountType,
            isVerified: true,
          }
        : {
            id: response.user.id,
            rank: typeof metadata.rank === 'string' ? metadata.rank : selectedRank,
            firstName: normalizedSpecialName.firstName,
            lastName: normalizedSpecialName.lastName,
            flight: (typeof metadata.flight === 'string' ? metadata.flight : selectedFlight) as Flight,
        squadron: (typeof metadata.squadron === 'string' ? metadata.squadron : selectedSquadron) as Squadron,
            accountType: roleRecord?.app_role ?? getInitialAccountType(
              typeof metadata.firstName === 'string' ? metadata.firstName : 'Airman',
              typeof metadata.lastName === 'string' ? metadata.lastName : 'Member'
            ),
            email: normalizedEmail,
            exerciseMinutes: 0,
            distanceRun: 0,
            connectedApps: [] as string[],
            fitnessAssessments: [],
            workouts: [],
            achievements: [] as string[],
            requiredPTSessionsPerWeek: 3,
            isVerified: true,
            ptlPendingApproval: false,
            monthlyPlacements: [],
            leaderboardHistory: [],
            trophyCount: 0,
            hasSeenTutorial: false,
            mustChangePassword: false,
            hasLoggedIntoApp: false,
          };

      const normalizedRosterMembers = rosterMembers.map((rosterMember) => {
        const matchesCurrentUser =
          (rosterMember.email && rosterMember.email.toLowerCase() === normalizedEmail) ||
          (
            rosterMember.firstName.trim().toLowerCase() === member.firstName.trim().toLowerCase() &&
            rosterMember.lastName.trim().toLowerCase() === member.lastName.trim().toLowerCase()
          );

        return matchesCurrentUser ? { ...rosterMember, id: response.user.id, email: normalizedEmail } : rosterMember;
      });

      syncMembersFromRoster(normalizedRosterMembers);

      if (!existingMember) {
        addMember(member);
        await createRosterMember(member, response.access_token).catch(() => undefined);
      } else if (!localExistingMember) {
        addMember({
          ...existingMember,
          id: response.user.id,
          email: member.email,
          isVerified: true,
        });
      } else {
        updateMember(existingMember.id, {
          email: member.email,
          rank: member.rank,
          firstName: member.firstName,
          lastName: member.lastName,
          flight: member.flight,
          squadron: member.squadron,
          accountType: member.accountType,
          isVerified: true,
          ptlPendingApproval: member.ptlPendingApproval,
          profilePicture: member.profilePicture,
        });
      }

      await syncRosterMemberAfterRegistration(member, response.access_token, rosterExistingMember ?? existingMember);

      await ensureMemberRole(normalizedEmail, member.accountType, response.access_token).catch(() => undefined);

      const user: UserType = {
        id: member.id,
        rank: member.rank,
        firstName: member.firstName,
        lastName: member.lastName,
        flight: member.flight,
        squadron: member.squadron,
        accountType: member.accountType,
        email: member.email,
        profilePicture: member.profilePicture,
        isVerified: member.isVerified,
        ptlPendingApproval: member.ptlPendingApproval,
        fitnessAssessmentsPrivate: false,
        hasSeenTutorial: member.hasSeenTutorial ?? false,
        mustChangePassword: member.mustChangePassword ?? false,
        hasLoggedIntoApp: member.hasLoggedIntoApp ?? false,
      };

      setSessionTokens({
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
      });
      login(user, { rememberSession: stayLoggedIn });
      router.replace(getPostLoginRoute(member));
    };

    run().catch((error) => {
      setError(error instanceof Error ? error.message : 'Unable to sign in.');
    });
  };

  const completeSignUp = async (existingMemberOverride: typeof members[number] | null) => {
    let result;
    try {
      result = await signUpWithPassword({
        email: email.toLowerCase(),
        password,
        metadata: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          rank: selectedRank,
          flight: selectedFlight,
          squadron: selectedSquadron,
          wantsPTL,
        },
      });
    } catch (error) {
      throw new Error(getFriendlyEmailSendError(error, 'Unable to create account.'));
    }

    if (!result.session) {
      setShowVerificationModal(true);
      return;
    }

    createAccount(
      existingMemberOverride,
      result.session.access_token,
      result.session.refresh_token,
      result.user?.id ?? result.session.user.id
    );
  };

  const handleSignUp = () => {
    setError('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter your full name');
      return;
    }

    if (!validateEmail(email)) {
      setError('Email must end with @us.af.mil');
      return;
    }

    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    const existingMember = findMatchingMember(members, {
      email: email.toLowerCase(),
      firstName,
      lastName,
    });

    completeSignUp(existingMember).catch((error) => {
      setError(getFriendlyEmailSendError(error, 'Unable to create account.'));
    });
  };

  const createAccount = (
    existingMemberOverride: typeof members[number] | null,
    accessToken?: string,
    refreshToken?: string,
    authUserId?: string
  ) => {
    const newMemberId = authUserId ?? existingMemberOverride?.id ?? Date.now().toString();
    const accountType = getInitialAccountType(firstName, lastName);
    const normalizedSpecialName = normalizeSpecialMemberName(firstName, lastName);

    // Create the member
    const newMember = {
      id: newMemberId,
      rank: selectedRank,
      firstName: normalizedSpecialName.firstName,
      lastName: normalizedSpecialName.lastName,
      flight: selectedFlight,
      squadron: selectedSquadron,
      accountType,
      email: email.toLowerCase(),
      exerciseMinutes: 0,
      distanceRun: 0,
      connectedApps: [] as string[],
      fitnessAssessments: [],
      workouts: [],
      achievements: [] as string[],
      requiredPTSessionsPerWeek: 3,
      isVerified: true, // For now, auto-verify (no email service)
      ptlPendingApproval: wantsPTL,
      monthlyPlacements: [],
      leaderboardHistory: [],
      trophyCount: 0,
      hasSeenTutorial: false,
      mustChangePassword: false,
      hasLoggedIntoApp: false,
      profilePicture: existingMemberOverride?.profilePicture,
    };

    if (existingMemberOverride) {
      updateMember(existingMemberOverride.id, {
        rank: newMember.rank,
        firstName: newMember.firstName,
        lastName: newMember.lastName,
        flight: newMember.flight,
        squadron: newMember.squadron,
        accountType: accountType === 'standard' ? existingMemberOverride.accountType : accountType,
        email: newMember.email,
        isVerified: true,
        ptlPendingApproval: wantsPTL,
      });
    } else {
      addMember(newMember);
    }

    void syncRosterMemberAfterRegistration(newMember, accessToken, existingMemberOverride);

    void sendPtlRequestNotifications({
      requester: newMember,
      accessToken,
    });

    // Log in the new user
    const user: UserType = {
      id: newMemberId,
      rank: selectedRank,
      firstName: normalizedSpecialName.firstName,
      lastName: normalizedSpecialName.lastName,
      flight: selectedFlight,
      squadron: selectedSquadron,
      accountType,
      email: email.toLowerCase(),
      profilePicture: newMember.profilePicture,
      isVerified: true,
      ptlPendingApproval: wantsPTL,
      fitnessAssessmentsPrivate: false,
      hasSeenTutorial: false, // New users haven't seen tutorial
      mustChangePassword: false,
      hasLoggedIntoApp: false,
    };

    setSessionTokens({
      accessToken: accessToken ?? null,
      refreshToken: refreshToken ?? null,
    });
    login(user, { rememberSession: stayLoggedIn });
    router.replace('/welcome'); // Redirect to tutorial for new users
  };

  const handleSubmit = () => {
    if (isSignUp) {
      handleSignUp();
    } else {
      handleSignIn();
    }
  };

  const handleForgotPassword = () => {
    const run = async () => {
      setError('');
      setResetMessage('');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const normalizedEmail = resetEmail.trim().toLowerCase();
      if (!normalizedEmail) {
        setError('Please enter your email address.');
        return;
      }

      if (!validateEmail(normalizedEmail)) {
        setError('Password reset is only available for @us.af.mil email addresses.');
        return;
      }

      await requestPasswordReset(normalizedEmail);
      setResetMessage(`We sent a password reset link to ${normalizedEmail}.`);
    };

    run().catch((forgotPasswordError) => {
      setError(getFriendlyEmailSendError(forgotPasswordError, 'Unable to send password reset email.'));
    });
  };

  // Redirect if already authenticated
  if (isAuthenticated && hasCheckedAuth) {
    return <Redirect href="/" />;
  }

  // Show loading while checking auth
  if (!hasCheckedAuth) {
    return (
      <View className="flex-1 bg-af-navy items-center justify-center">
        <Shield size={48} color="#4A90D9" />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <LinearGradient
        colors={['#0A1628', '#00308F', '#1E4FAD']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Logo Section */}
            <Animated.View
              entering={FadeInDown.delay(100).springify()}
              className="items-center mb-8"
            >
              <View className="w-20 h-20 bg-white/10 rounded-full items-center justify-center mb-4 border border-white/20 overflow-hidden">
                <Image
                  source={require('../../assets/images/TotalFlight_Icon_Resized.png')}
                  style={{ width: '74%', height: '74%' }}
                  resizeMode="contain"
                />
              </View>
              <Text className="text-3xl font-bold text-white">FitFlight</Text>
              <Text className="text-af-silver text-base mt-1">Squadron PT Tracker and Fitness Tool</Text>
            </Animated.View>

            {/* Form Card */}
            <Animated.View
              entering={FadeInUp.delay(200).springify()}
              className="bg-white/10 rounded-3xl p-6 border border-white/20"
            >
              {/* Toggle Login/Sign Up */}
              <View className="flex-row bg-white/10 rounded-2xl p-1 mb-6">
                <Pressable
                  onPress={() => { setIsSignUp(false); setError(''); Haptics.selectionAsync(); }}
                  className={cn(
                    "flex-1 py-3 rounded-xl",
                    !isSignUp && "bg-af-blue"
                  )}
                >
                  <Text className={cn(
                    "text-center font-semibold",
                    !isSignUp ? "text-white" : "text-white/60"
                  )}>Sign In</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setIsSignUp(true); setError(''); Haptics.selectionAsync(); }}
                  className={cn(
                    "flex-1 py-3 rounded-xl",
                    isSignUp && "bg-af-blue"
                  )}
                >
                  <Text className={cn(
                    "text-center font-semibold",
                    isSignUp ? "text-white" : "text-white/60"
                  )}>Sign Up</Text>
                </Pressable>
              </View>

              {/* Error Message */}
              {error ? (
                <View className="flex-row items-center bg-red-500/20 border border-red-500/50 rounded-xl px-4 py-3 mb-4">
                  <AlertCircle size={18} color="#EF4444" />
                  <Text className="text-red-400 ml-2 flex-1">{error}</Text>
                </View>
              ) : null}

              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-row items-center">
                  <Checkbox
                    value={stayLoggedIn}
                    onValueChange={(value) => {
                      setStayLoggedIn(value);
                      Haptics.selectionAsync();
                    }}
                    color={stayLoggedIn ? '#4A90D9' : undefined}
                  />
                  <Text className="text-white/80 ml-3">Stay logged in</Text>
                </View>
              </View>

              {isSignUp && (
                <>
                  {/* First Name Input */}
                  <View className="mb-4">
                    <Text className="text-white/60 text-sm mb-2 ml-1">First Name</Text>
                    <View className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10">
                      <User size={20} color="#C0C0C0" />
                      <TextInput
                        placeholder="First Name"
                        placeholderTextColor="#ffffff40"
                        value={firstName}
                        onChangeText={setFirstName}
                        className="flex-1 ml-3 text-white text-base"
                      />
                    </View>
                  </View>

                  {/* Last Name Input */}
                  <View className="mb-4">
                    <Text className="text-white/60 text-sm mb-2 ml-1">Last Name</Text>
                    <View className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10">
                      <User size={20} color="#C0C0C0" />
                      <TextInput
                        placeholder="Last Name"
                        placeholderTextColor="#ffffff40"
                        value={lastName}
                        onChangeText={setLastName}
                        className="flex-1 ml-3 text-white text-base"
                      />
                    </View>
                  </View>

                  {/* Rank Selection */}
                  <View className="mb-4">
                    <Text className="text-white/60 text-sm mb-2 ml-1">Rank</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={{ flexGrow: 0 }}
                    >
                      <View className="flex-row space-x-2">
                        {RANKS.map((rank) => (
                          <Pressable
                            key={rank}
                            onPress={() => { setSelectedRank(rank); Haptics.selectionAsync(); }}
                            className={cn(
                              "px-4 py-2 rounded-lg border mr-2",
                              selectedRank === rank
                                ? "bg-af-accent border-af-accent"
                                : "bg-white/5 border-white/10"
                            )}
                          >
                            <Text className={cn(
                              "text-sm font-medium",
                              selectedRank === rank ? "text-white" : "text-white/70"
                            )}>{rank}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </ScrollView>
                  </View>

                  {/* Flight Selection */}
                  <View className="mb-4">
                    <Text className="text-white/60 text-sm mb-2 ml-1">Flight</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={{ flexGrow: 0 }}
                    >
                      <View className="flex-row">
                        {FLIGHTS.map((flight) => (
                          <Pressable
                            key={flight}
                            onPress={() => { setSelectedFlight(flight); Haptics.selectionAsync(); }}
                            className={cn(
                              "px-4 py-2 rounded-lg border mr-2",
                              selectedFlight === flight
                                ? "bg-af-accent border-af-accent"
                                : "bg-white/5 border-white/10"
                            )}
                          >
                            <Text className={cn(
                              "text-sm font-medium",
                              selectedFlight === flight ? "text-white" : "text-white/70"
                            )}>{flight}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </ScrollView>
                  </View>

                  {/* Squadron Selection */}
                  <View className="mb-4">
                    <Text className="text-white/60 text-sm mb-2 ml-1">Squadron</Text>
                    <View className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10">
                      <Building2 size={20} color="#C0C0C0" />
                      <View className="flex-1 ml-3">
                        {SQUADRONS.map((squadron) => (
                          <Pressable
                            key={squadron}
                            onPress={() => { setSelectedSquadron(squadron); Haptics.selectionAsync(); }}
                            className={cn(
                              "py-2",
                              selectedSquadron === squadron && "bg-af-accent/20 rounded-lg px-2 -mx-2"
                            )}
                          >
                            <Text className={cn(
                              "font-medium",
                              selectedSquadron === squadron ? "text-white" : "text-white/70"
                            )}>{squadron}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  </View>

                  {/* PFL Toggle */}
                  <Pressable
                    onPress={() => { setWantsPTL(!wantsPTL); Haptics.selectionAsync(); }}
                    className={cn(
                      "flex-row items-center justify-between p-4 rounded-xl mb-4 border",
                      wantsPTL ? "bg-af-gold/20 border-af-gold/50" : "bg-white/5 border-white/10"
                    )}
                  >
                    <View className="flex-row items-center flex-1">
                      <Users size={20} color={wantsPTL ? "#FFD700" : "#C0C0C0"} />
                      <View className="ml-3 flex-1">
                        <Text className={cn(
                          "font-medium",
                          wantsPTL ? "text-af-gold" : "text-white/70"
                        )}>Request PFL Status</Text>
                        <Text className="text-white/40 text-xs">Requires approval from Owner/UFPM</Text>
                      </View>
                    </View>
                    <View className={cn(
                      "w-6 h-6 rounded-full border-2",
                      wantsPTL ? "bg-af-gold border-af-gold" : "border-white/30"
                    )}>
                      {wantsPTL && <View className="flex-1 items-center justify-center">
                        <View className="w-2 h-2 bg-af-navy rounded-full" />
                      </View>}
                    </View>
                  </Pressable>
                </>
              )}

              {/* Email Input */}
              <View className="mb-4">
                <Text className="text-white/60 text-sm mb-2 ml-1">Email</Text>
                <View className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10">
                  <Mail size={20} color="#C0C0C0" />
                  <TextInput
                    placeholder="you@us.af.mil"
                    placeholderTextColor="#ffffff40"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    className="flex-1 ml-3 text-white text-base"
                  />
                </View>
                {isSignUp && (
                  <Text className="text-white/40 text-xs mt-1 ml-1">Must be a @us.af.mil email</Text>
                )}
              </View>

              {/* Password Input */}
              <View className="mb-6">
                <Text className="text-white/60 text-sm mb-2 ml-1">Password</Text>
                <View className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10">
                  <Lock size={20} color="#C0C0C0" />
                  <TextInput
                    placeholder="••••••••"
                    placeholderTextColor="#ffffff40"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    className="flex-1 ml-3 text-white text-base"
                  />
                </View>
              </View>

              {/* Submit Button */}
              <Pressable
                onPress={handleSubmit}
                className="bg-af-accent py-4 rounded-xl flex-row items-center justify-center active:opacity-80"
              >
                <Text className="text-white font-bold text-lg mr-2">
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </Text>
                <ChevronRight size={20} color="white" />
              </Pressable>

              {!isSignUp ? (
                <Pressable
                  onPress={() => {
                    setResetEmail(email.trim().toLowerCase());
                    setResetMessage('');
                    setError('');
                    setShowForgotPasswordModal(true);
                    Haptics.selectionAsync();
                  }}
                  className="mt-4 self-center"
                >
                  <Text className="text-af-silver font-medium">Forgot Password?</Text>
                </Pressable>
              ) : null}
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal visible={showVerificationModal} transparent animationType="fade">
        <View className="flex-1 bg-black/80 items-center justify-center p-6">
          <View className="bg-af-navy rounded-3xl p-6 w-full max-w-sm border border-white/20">
            <Text className="text-white text-xl font-bold mb-4">Verification Email Sent</Text>
            <Text className="text-af-silver mb-6">
              We sent a verification email to {email.toLowerCase()}. Open that email, use the confirmation link, and you will be returned to FitFlight with access to the app.
            </Text>
            <Pressable
              onPress={() => setShowVerificationModal(false)}
              className="bg-af-accent py-3 rounded-xl"
            >
              <Text className="text-white text-center font-semibold">OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showForgotPasswordModal} transparent animationType="fade">
        <View className="flex-1 bg-black/80 items-center justify-center p-6">
          <View className="bg-af-navy rounded-3xl p-6 w-full max-w-sm border border-white/20">
            <Text className="text-white text-xl font-bold mb-4">Reset Password</Text>
            <Text className="text-af-silver mb-4">
              Enter your email address and we will send you a link to reset your password.
            </Text>
            <View className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10 mb-4">
              <Mail size={20} color="#C0C0C0" />
              <TextInput
                placeholder="you@us.af.mil"
                placeholderTextColor="#ffffff40"
                value={resetEmail}
                onChangeText={setResetEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                className="flex-1 ml-3 text-white text-base"
              />
            </View>
            {resetMessage ? (
              <View className="bg-emerald-500/20 border border-emerald-400/40 rounded-xl px-4 py-3 mb-4">
                <Text className="text-emerald-200">{resetMessage}</Text>
              </View>
            ) : null}
            <View className="flex-row">
              <Pressable
                onPress={() => {
                  setShowForgotPasswordModal(false);
                  setResetMessage('');
                  setError('');
                }}
                className="flex-1 bg-white/10 py-3 rounded-xl mr-2"
              >
                <Text className="text-white text-center font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleForgotPassword}
                className="flex-1 bg-af-accent py-3 rounded-xl ml-2"
              >
                <Text className="text-white text-center font-semibold">Send Link</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
