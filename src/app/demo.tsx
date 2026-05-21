import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ShieldAlert, QrCode, LogIn } from 'lucide-react-native';
import { useAuthStore, useMemberStore, type AccountType, type Flight, type Member, type Squadron, type User as UserType, DEFAULT_SQUADRON, normalizeSquadron } from '@/lib/store';
import { ensureMemberRole, fetchRoleForEmail, fetchRosterMembers } from '@/lib/supabaseData';
import { getUserForAccessToken } from '@/lib/supabaseAuth';
import { ThemeBackdrop } from '@/components/ThemeBackdrop';
import { ThemeChrome } from '@/components/ThemeChrome';
import { getThemeBodyStyle, getThemeButtonStyle, getThemeButtonTextStyle, getThemeHeadingStyle, useAppTheme } from '@/lib/theme';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '') ?? '';
const DEMO_ACCOUNT_EMAIL = 'fitflight@us.af.mil';
const DEMO_ACCOUNT_NAME = { firstName: 'Ima', lastName: 'Demo' };
const DEMO_ACCOUNT_RANK = 'Lt. Col.';

type DemoLoginResponse = {
  access_token?: string;
  refresh_token?: string;
  accessToken?: string;
  refreshToken?: string;
  session?: {
    access_token?: string;
    refresh_token?: string;
    user?: {
      id: string;
      email?: string;
      user_metadata?: Record<string, unknown>;
    };
  };
  user?: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((resolve) => {
        timeoutHandle = setTimeout(() => resolve(fallbackValue), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function findMatchingMember<T extends Pick<Member, 'id' | 'email' | 'firstName' | 'lastName'>>(
  members: T[],
  options: { email?: string; firstName?: string; lastName?: string }
) {
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

  return (
    members.find(
      (member) =>
        member.firstName.trim().toLowerCase() === normalizedFirstName &&
        member.lastName.trim().toLowerCase() === normalizedLastName
    ) ?? null
  );
}

function getNormalizedDemoIdentity(email: string, firstName?: string, lastName?: string, rank?: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail === DEMO_ACCOUNT_EMAIL) {
    return {
      firstName: DEMO_ACCOUNT_NAME.firstName,
      lastName: DEMO_ACCOUNT_NAME.lastName,
      rank: DEMO_ACCOUNT_RANK,
      accountType: 'demo' as AccountType,
    };
  }

  return {
    firstName: firstName?.trim() || 'Airman',
    lastName: lastName?.trim() || 'Member',
    rank: rank?.trim() || 'A1C',
    accountType: 'standard' as AccountType,
  };
}

export default function DemoLoginScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ key?: string }>();
  const login = useAuthStore((state) => state.login);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasCheckedAuth = useAuthStore((state) => state.hasCheckedAuth);
  const setSessionTokens = useAuthStore((state) => state.setSessionTokens);
  const addMember = useMemberStore((state) => state.addMember);
  const removeMember = useMemberStore((state) => state.removeMember);
  const updateMember = useMemberStore((state) => state.updateMember);
  const syncMembersFromRoster = useMemberStore((state) => state.syncMembersFromRoster);
  const members = useMemberStore((state) => state.members);

  const [statusMessage, setStatusMessage] = useState('Loading demo access...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasStartedRef = useRef(false);
  const key = useMemo(() => {
    if (typeof params.key === 'string' && params.key.trim()) {
      return params.key.trim();
    }

    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('key')?.trim() ?? '';
    }

    return '';
  }, [params.key]);

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }

    if (!key) {
      hasStartedRef.current = true;
      if (hasCheckedAuth && isAuthenticated) {
        router.replace('/');
      } else {
        router.replace('/login');
      }
      return;
    }

    hasStartedRef.current = true;
    let isCancelled = false;

    const run = async () => {
      if (!SUPABASE_URL) {
        throw new Error('Supabase is not configured for demo login.');
      }

      setStatusMessage('Checking demo access...');

      const response = await fetch(`${SUPABASE_URL}/functions/v1/demo-login?key=${encodeURIComponent(key)}`);
      const payload = await response.json().catch(() => ({})) as DemoLoginResponse & { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error || payload.message || 'Unable to use the demo login link.');
      }

      const accessToken = payload.access_token ?? payload.accessToken ?? payload.session?.access_token;
      const refreshToken = payload.refresh_token ?? payload.refreshToken ?? payload.session?.refresh_token ?? null;
      if (!accessToken) {
        throw new Error('Demo login did not return an access token.');
      }

      setStatusMessage('Signing you into FitFlight...');
      const authUser =
        payload.user ??
        payload.session?.user ??
        await withTimeout(
          getUserForAccessToken(accessToken),
          5000,
          {
            id: `demo-${Date.now()}`,
            email: DEMO_ACCOUNT_EMAIL,
            user_metadata: {
              firstName: DEMO_ACCOUNT_NAME.firstName,
              lastName: DEMO_ACCOUNT_NAME.lastName,
              rank: DEMO_ACCOUNT_RANK,
              squadron: 'Hawks',
              flight: 'Doom',
            },
          }
        );
      const metadata = authUser.user_metadata ?? {};
      const normalizedEmail = (authUser.email ?? DEMO_ACCOUNT_EMAIL).toLowerCase();
      const resolvedSquadron = normalizeSquadron(typeof metadata.squadron === 'string' ? metadata.squadron : null, DEFAULT_SQUADRON);
      const roleRecord = await withTimeout(fetchRoleForEmail(normalizedEmail, accessToken), 3000, null).catch(() => null);
      const rosterMembers = await withTimeout(fetchRosterMembers(accessToken, resolvedSquadron), 4000, [] as Member[]).catch(() => []);
      const currentMembers = useMemberStore.getState().members;
      const localExistingMember = findMatchingMember(currentMembers, {
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
      const identity = getNormalizedDemoIdentity(
        normalizedEmail,
        typeof metadata.firstName === 'string' ? metadata.firstName : existingMember?.firstName,
        typeof metadata.lastName === 'string' ? metadata.lastName : existingMember?.lastName,
        typeof metadata.rank === 'string' ? metadata.rank : existingMember?.rank
      );

      const member: Member = existingMember
        ? {
            ...existingMember,
            id: authUser.id,
            firstName: identity.firstName,
            lastName: identity.lastName,
            rank: identity.rank,
            email: normalizedEmail,
            accountType: roleRecord?.app_role ?? identity.accountType ?? existingMember.accountType,
            isVerified: true,
            mustChangePassword: false,
            hasLoggedIntoApp: true,
          }
        : {
            id: authUser.id,
            rank: identity.rank,
            firstName: identity.firstName,
            lastName: identity.lastName,
            flight: (typeof metadata.flight === 'string' ? metadata.flight : 'Doom') as Flight,
            squadron: resolvedSquadron,
            accountType: roleRecord?.app_role ?? identity.accountType,
            email: normalizedEmail,
            exerciseMinutes: 0,
            distanceRun: 0,
            connectedApps: [],
            fitnessAssessments: [],
            workouts: [],
            achievements: [],
            requiredPTSessionsPerWeek: 5,
            isVerified: true,
            ptlPendingApproval: false,
            monthlyPlacements: [],
            leaderboardHistory: [],
            trophyCount: 0,
            hasSeenTutorial: true,
            mustChangePassword: false,
            hasLoggedIntoApp: true,
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

      syncMembersFromRoster(normalizedRosterMembers, { squadron: resolvedSquadron });

      const isPresentationDemoUser = normalizedEmail === DEMO_ACCOUNT_EMAIL;

      if (isPresentationDemoUser) {
        if (existingMember) {
          removeMember(existingMember.id);
        }
      } else if (!existingMember) {
        addMember(member);
      } else if (!localExistingMember) {
        addMember(member);
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
          profilePicture: member.profilePicture,
          mustChangePassword: false,
          hasLoggedIntoApp: true,
        });
      }

      const nextUser: UserType = {
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
        ptlPendingApproval: false,
        fitnessAssessmentsPrivate: false,
        hasSeenTutorial: true,
        mustChangePassword: false,
        hasLoggedIntoApp: true,
      };

      if (isCancelled) {
        return;
      }

      setSessionTokens({ accessToken, refreshToken });
      login(nextUser, { rememberSession: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/');

      void withTimeout(ensureMemberRole(normalizedEmail, member.accountType, accessToken), 3000, null).catch(() => undefined);
    };

    void run().catch((error) => {
      if (isCancelled) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : 'Unable to log in with the demo link.');
      setStatusMessage('Demo login unavailable');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    });

    return () => {
      isCancelled = true;
    };
  }, [addMember, hasCheckedAuth, isAuthenticated, key, login, removeMember, router, setSessionTokens, syncMembersFromRoster, updateMember]);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.background }}>
      <ThemeBackdrop />
      <View className="flex-1 items-center justify-center px-6">
        <ThemeChrome theme={theme} variant="feature" style={{ width: '100%', maxWidth: 420 }}>
        <View className="p-8 items-center">
          {errorMessage ? (
            <ShieldAlert size={40} color={theme.accentAlt} />
          ) : (
            <QrCode size={40} color={theme.accent} />
          )}
          <Text style={[getThemeHeadingStyle(theme, 26), { marginTop: 20, textAlign: 'center' }]}>FitFlight Demo Access</Text>
          <Text style={[getThemeBodyStyle(theme, 16), { marginTop: 12, textAlign: 'center', lineHeight: 24 }]}>
            {errorMessage ?? statusMessage}
          </Text>
          {errorMessage ? (
            <Pressable
              onPress={() => router.replace('/login')}
              className="mt-6 flex-row items-center px-5 py-3"
              style={getThemeButtonStyle(theme, 'accent')}
            >
              <LogIn size={18} color="#FFFFFF" />
              <Text style={[getThemeButtonTextStyle(theme, 'accent'), { marginLeft: 8 }]}>Go to Login</Text>
            </Pressable>
          ) : (
            <View className="mt-6">
              <ActivityIndicator size="large" color={theme.accent} />
            </View>
          )}
        </View>
        </ThemeChrome>
      </View>
    </SafeAreaView>
  );
}
