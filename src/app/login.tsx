import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, Modal, Image } from 'react-native';
import Checkbox from 'expo-checkbox';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Redirect } from 'expo-router';
import { Shield, User, Mail, Lock, ChevronRight, Users, AlertCircle, Building2 } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuthStore, useMemberStore, type AccountType, type Flight, type Squadron, type User as UserType, getDisplayName, SQUADRONS } from '@/lib/store';
import { cn } from '@/lib/cn';
import { clearUrlHashSession, getUserForAccessToken, readSessionFromUrlHash, signInWithPassword, signUpWithPassword } from '@/lib/supabaseAuth';

const FLIGHTS: Flight[] = ['Apex', 'Bomber', 'Cryptid', 'Doom', 'Ewok', 'Foxhound', 'ADF', 'DET'];
const RANKS = ['AB', 'Amn', 'A1C', 'SrA', 'SSgt', 'TSgt', 'MSgt', 'SMSgt', 'CMSgt'];

function getInitialAccountType(firstName: string, lastName: string): AccountType {
  const normalizedFirstName = firstName.trim().toLowerCase();
  const normalizedLastName = lastName.trim().toLowerCase();

  if (normalizedFirstName === 'jacob' && normalizedLastName === 'de la rosa') {
    return 'ufpm';
  }

  return 'standard';
}

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore(s => s.login);
  const setSessionTokens = useAuthStore(s => s.setSessionTokens);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const hasCheckedAuth = useAuthStore(s => s.hasCheckedAuth);
  const members = useMemberStore(s => s.members);
  const addMember = useMemberStore(s => s.addMember);
  const addNotification = useMemberStore(s => s.addNotification);
  const attendanceRecords = useMemberStore(s => s.attendanceRecords);

  const [isSignUp, setIsSignUp] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedFlight, setSelectedFlight] = useState<Flight>('Apex');
  const [selectedSquadron, setSelectedSquadron] = useState<Squadron>('392 IS');
  const [selectedRank, setSelectedRank] = useState('A1C');
  const [wantsPTL, setWantsPTL] = useState(false);
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [error, setError] = useState('');
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [matchingAttendance, setMatchingAttendance] = useState<typeof attendanceRecords[0] | null>(null);

  const validateEmail = (emailToValidate: string): boolean => {
    return emailToValidate.toLowerCase().endsWith('@us.af.mil');
  };

  useEffect(() => {
    const sessionFromHash = readSessionFromUrlHash();
    if (!sessionFromHash) {
      return;
    }

    const finalizeEmailConfirmation = async () => {
      try {
        const authUser = await getUserForAccessToken(sessionFromHash.accessToken);
        const metadata = authUser.user_metadata ?? {};
        const normalizedEmail = (authUser.email ?? email).toLowerCase();
        const existingMember = members.find((member) => member.email.toLowerCase() === normalizedEmail);

        const member = existingMember ?? {
          id: authUser.id,
          rank: typeof metadata.rank === 'string' ? metadata.rank : 'A1C',
          firstName: typeof metadata.firstName === 'string' ? metadata.firstName : 'Airman',
          lastName: typeof metadata.lastName === 'string' ? metadata.lastName : 'Member',
          flight: (typeof metadata.flight === 'string' ? metadata.flight : 'Apex') as Flight,
          squadron: (typeof metadata.squadron === 'string' ? metadata.squadron : '392 IS') as Squadron,
          accountType: getInitialAccountType(
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
          trophyCount: 0,
        };

        if (!existingMember) {
          addMember(member);
        }

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
          isVerified: true,
          ptlPendingApproval: member.ptlPendingApproval,
          fitnessAssessmentsPrivate: false,
          hasSeenTutorial: false,
        }, { rememberSession: true });

        clearUrlHashSession();
        router.replace('/welcome');
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
  }, [addMember, email, login, members, router, setSessionTokens]);

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
      const existingMember = members.find(m => m.email.toLowerCase() === email.toLowerCase());

      const member = existingMember ?? {
        id: response.user.id,
        rank: typeof metadata.rank === 'string' ? metadata.rank : selectedRank,
        firstName: typeof metadata.firstName === 'string' ? metadata.firstName : 'Airman',
        lastName: typeof metadata.lastName === 'string' ? metadata.lastName : 'Member',
        flight: (typeof metadata.flight === 'string' ? metadata.flight : selectedFlight) as Flight,
        squadron: (typeof metadata.squadron === 'string' ? metadata.squadron : selectedSquadron) as Squadron,
        accountType: getInitialAccountType(
          typeof metadata.firstName === 'string' ? metadata.firstName : 'Airman',
          typeof metadata.lastName === 'string' ? metadata.lastName : 'Member'
        ),
        email: email.toLowerCase(),
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
        trophyCount: 0,
      };

      if (!existingMember) {
        addMember(member);
      }

      const user: UserType = {
        id: member.id,
        rank: member.rank,
        firstName: member.firstName,
        lastName: member.lastName,
        flight: member.flight,
        squadron: member.squadron,
        accountType: member.accountType,
        email: member.email,
        isVerified: member.isVerified,
        ptlPendingApproval: member.ptlPendingApproval,
        fitnessAssessmentsPrivate: false,
      };

      setSessionTokens({
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
      });
      login(user, { rememberSession: stayLoggedIn });
      router.replace('/(tabs)');
    };

    run().catch((error) => {
      setError(error instanceof Error ? error.message : 'Unable to sign in.');
    });
  };

  const completeSignUp = async (linkedAttendanceId: string | null) => {
    const result = await signUpWithPassword({
      email: email.toLowerCase(),
      password,
      metadata: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        rank: selectedRank,
        flight: selectedFlight,
        squadron: selectedSquadron,
      },
    });

    if (!result.session) {
      setShowLinkModal(false);
      setShowVerificationModal(true);
      return;
    }

    createAccount(
      linkedAttendanceId,
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

    const matching = attendanceRecords.find(
      r => r.firstName.toLowerCase() === firstName.toLowerCase() &&
           r.lastName.toLowerCase() === lastName.toLowerCase()
    );

    if (matching) {
      setMatchingAttendance(matching);
      setShowLinkModal(true);
      return;
    }

    completeSignUp(null).catch((error) => {
      setError(error instanceof Error ? error.message : 'Unable to create account.');
    });
  };

  const createAccount = (
    linkedAttendanceId: string | null,
    accessToken?: string,
    refreshToken?: string,
    authUserId?: string
  ) => {
    const newMemberId = authUserId ?? Date.now().toString();
    const accountType = getInitialAccountType(firstName, lastName);

    // Create the member
    const newMember = {
      id: newMemberId,
      rank: selectedRank,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
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
      linkedAttendanceId: linkedAttendanceId ?? undefined,
      monthlyPlacements: [],
      trophyCount: 0,
    };

    addMember(newMember);

    // If requesting PTL, notify owner and UFPM
    if (wantsPTL) {
      addNotification({
        type: 'ptl_request',
        title: 'PTL Request',
        message: `${selectedRank} ${firstName} ${lastName} signed up as a PTL. Open the app to authorize or reject.`,
        data: { memberId: newMemberId },
      });
    }

    // Log in the new user
    const user: UserType = {
      id: newMemberId,
      rank: selectedRank,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      flight: selectedFlight,
      squadron: selectedSquadron,
      accountType,
      email: email.toLowerCase(),
      isVerified: true,
      ptlPendingApproval: wantsPTL,
      fitnessAssessmentsPrivate: false,
      hasSeenTutorial: false, // New users haven't seen tutorial
    };

    setSessionTokens({
      accessToken: accessToken ?? null,
      refreshToken: refreshToken ?? null,
    });
    login(user, { rememberSession: stayLoggedIn });
    setShowLinkModal(false);
    router.replace('/welcome'); // Redirect to tutorial for new users
  };

  const handleSubmit = () => {
    if (isSignUp) {
      handleSignUp();
    } else {
      handleSignIn();
    }
  };

  // Redirect if already authenticated
  if (isAuthenticated && hasCheckedAuth) {
    return <Redirect href="/(tabs)" />;
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

                  {/* PTL Toggle */}
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
                        )}>Request PTL Status</Text>
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
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Link Attendance Modal */}
      <Modal visible={showLinkModal} transparent animationType="fade">
        <View className="flex-1 bg-black/80 items-center justify-center p-6">
          <View className="bg-af-navy rounded-3xl p-6 w-full max-w-sm border border-white/20">
            <Text className="text-white text-xl font-bold mb-4">Existing PT Records Found</Text>
            <Text className="text-af-silver mb-6">
              We found PT attendance records for {matchingAttendance?.rank} {matchingAttendance?.firstName} {matchingAttendance?.lastName}.
              Would you like to link these records to your new account?
            </Text>
            <View className="flex-row space-x-3">
              <Pressable
                onPress={() => {
                  completeSignUp(null).catch((error) => {
                    setError(error instanceof Error ? error.message : 'Unable to create account.');
                  });
                }}
                className="flex-1 bg-white/10 py-3 rounded-xl mr-2"
              >
                <Text className="text-white text-center font-semibold">No Thanks</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  completeSignUp(matchingAttendance?.id ?? null).catch((error) => {
                    setError(error instanceof Error ? error.message : 'Unable to create account.');
                  });
                }}
                className="flex-1 bg-af-accent py-3 rounded-xl ml-2"
              >
                <Text className="text-white text-center font-semibold">Link Records</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
    </View>
  );
}
