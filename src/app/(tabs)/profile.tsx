import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Shield, LogOut, LogIn, UserPlus, Trash2, Users, Activity, Watch, X, Check, Bell, Crown, Settings, Plus, Camera, FileText, Calendar, Building2, AlertTriangle, Upload, Dumbbell, ImageIcon, HelpCircle } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useAuthStore, useMemberStore, type Flight, type Member, type AccountType, type Squadron, type IntegrationService, getDisplayName, canEditAttendance, canManagePTL, isAdmin, SQUADRONS } from '@/lib/store';
import { cn } from '@/lib/cn';
import { SwipeableTabView } from '@/components/SwipeableTabView';

const FLIGHTS: Flight[] = ['Avatar', 'Bomber', 'Cryptid', 'Doom', 'Ewok', 'Foxhound', 'ADF', 'DET'];
const RANKS = ['AB', 'Amn', 'A1C', 'SrA', 'SSgt', 'TSgt', 'MSgt', 'SMSgt', 'CMSgt'];

export default function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const members = useMemberStore(s => s.members);
  const addMember = useMemberStore(s => s.addMember);
  const removeMember = useMemberStore(s => s.removeMember);
  const notifications = useMemberStore(s => s.notifications);
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
  const [integrationToDisconnect, setIntegrationToDisconnect] = useState<IntegrationService | null>(null);
  const [selectedSquadron, setSelectedSquadron] = useState<Squadron | null>(null);
  const [selectedPTLRequest, setSelectedPTLRequest] = useState<string | null>(null);
  const [newMemberFirstName, setNewMemberFirstName] = useState('');
  const [newMemberLastName, setNewMemberLastName] = useState('');
  const [newMemberRank, setNewMemberRank] = useState('A1C');
  const [newMemberFlight, setNewMemberFlight] = useState<Flight>('Avatar');
  const [newMemberEmail, setNewMemberEmail] = useState('');

  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const updateUser = useAuthStore(s => s.updateUser);
  const updateMember = useMemberStore(s => s.updateMember);

  const userAccountType = user?.accountType ?? 'standard';
  const canManage = canManagePTL(userAccountType);
  const hasAdminAccess = isAdmin(userAccountType);

  const unreadNotifications = notifications.filter(n => !n.read);
  const ptlRequests = notifications.filter(n => n.type === 'ptl_request' && !n.read);

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    logout();
    router.replace('/login');
  };

  const handleAddMember = () => {
    if (!newMemberFirstName.trim() || !newMemberLastName.trim()) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const newMember: Member = {
      id: Date.now().toString(),
      rank: newMemberRank,
      firstName: newMemberFirstName.trim(),
      lastName: newMemberLastName.trim(),
      flight: newMemberFlight,
      squadron: '392 IS',
      accountType: 'standard',
      email: newMemberEmail || `${newMemberLastName.toLowerCase()}@us.af.mil`,
      exerciseMinutes: 0,
      distanceRun: 0,
      caloriesBurned: 0,
      connectedApps: [],
      fitnessAssessments: [],
      workouts: [],
      achievements: [],
      requiredPTSessionsPerWeek: 3,
      isVerified: false,
      ptlPendingApproval: false,
      monthlyPlacements: [],
      trophyCount: 0,
    };

    addMember(newMember);
    setShowAddModal(false);
    resetForm();
  };

  const handleRemoveMember = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    removeMember(id);
  };

  const resetForm = () => {
    setNewMemberFirstName('');
    setNewMemberLastName('');
    setNewMemberRank('A1C');
    setNewMemberFlight('Avatar');
    setNewMemberEmail('');
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

  const pickProfilePicture = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0] && user) {
      const imageUri = result.assets[0].uri;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Update member in store
      updateMember(user.id, { profilePicture: imageUri });

      // Update user in auth store
      updateUser({ profilePicture: imageUri });

      setShowProfilePictureModal(false);
    }
  };

  const takeProfilePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0] && user) {
      const imageUri = result.assets[0].uri;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Update member in store
      updateMember(user.id, { profilePicture: imageUri });

      // Update user in auth store
      updateUser({ profilePicture: imageUri });

      setShowProfilePictureModal(false);
    }
  };

  const removeProfilePicture = () => {
    if (!user) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Update member in store
    updateMember(user.id, { profilePicture: undefined });

    // Update user in auth store
    updateUser({ profilePicture: undefined });

    setShowProfilePictureModal(false);
  };

  // Get connected integrations from user
  const connectedIntegrations = user?.connectedIntegrations ?? ['apple_health']; // Default Apple Health as connected for demo

  const handleConnectIntegration = (service: IntegrationService) => {
    if (!user) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const current = user.connectedIntegrations ?? [];
    if (!current.includes(service)) {
      updateUser({ connectedIntegrations: [...current, service] });
    }
  };

  const handleDisconnectIntegration = () => {
    if (!user || !integrationToDisconnect) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const current = user.connectedIntegrations ?? ['apple_health'];
    updateUser({ connectedIntegrations: current.filter(s => s !== integrationToDisconnect) });

    setShowDisconnectModal(false);
    setIntegrationToDisconnect(null);
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

  const userStats = user
    ? members.find(m => m.id === user.id) || {
        exerciseMinutes: 0,
        distanceRun: 0,
        caloriesBurned: 0,
        connectedApps: [],
        workouts: [],
      }
    : null;

  const getAccountTypeLabel = (accountType: AccountType) => {
    switch (accountType) {
      case 'flighttrack_creator': return 'FlightTrack Creator';
      case 'ufpm': return 'UFPM';
      case 'ptl': return 'PT Leader';
      default: return 'Member';
    }
  };

  const getAccountTypeColor = (accountType: AccountType) => {
    switch (accountType) {
      case 'flighttrack_creator': return { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/50' };
      case 'ufpm': return { bg: 'bg-af-gold/20', text: 'text-af-gold', border: 'border-af-gold/50' };
      case 'ptl': return { bg: 'bg-af-accent/20', text: 'text-af-accent', border: 'border-af-accent/50' };
      default: return { bg: 'bg-white/10', text: 'text-af-silver', border: 'border-white/20' };
    }
  };

  const userDisplayName = user ? getDisplayName(user) : 'Unknown';
  const accountColors = getAccountTypeColor(userAccountType);

  return (
    <SwipeableTabView>
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
              <Text className="text-white text-2xl font-bold">Profile</Text>
              <Text className="text-af-silver text-sm mt-1">Manage your account</Text>
            </View>

            {/* Notifications Bell */}
            {canManage && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowNotificationsModal(true);
                }}
                className="relative w-10 h-10 bg-white/10 rounded-full items-center justify-center"
              >
                <Bell size={20} color="#C0C0C0" />
                {unreadNotifications.length > 0 && (
                  <View className="absolute -top-1 -right-1 w-5 h-5 bg-af-danger rounded-full items-center justify-center">
                    <Text className="text-white text-xs font-bold">{unreadNotifications.length}</Text>
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
                    {userAccountType === 'flighttrack_creator' ? (
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
          </Animated.View>

          {/* Stats Card */}
          <Animated.View
            entering={FadeInDown.delay(200).springify()}
            className="mx-6 mt-4 p-4 bg-white/5 rounded-2xl border border-white/10"
          >
            <Text className="text-white/60 text-xs uppercase tracking-wider mb-3">Your Stats This Month</Text>
            <View className="flex-row justify-between">
              <View className="items-center flex-1">
                <Dumbbell size={20} color="#A855F7" />
                <Text className="text-white font-bold text-lg mt-1">
                  {userStats?.workouts?.length ?? 0}
                </Text>
                <Text className="text-af-silver text-xs">Workouts</Text>
              </View>
              <View className="w-px bg-white/10" />
              <View className="items-center flex-1">
                <Activity size={20} color="#4A90D9" />
                <Text className="text-white font-bold text-lg mt-1">
                  {userStats?.exerciseMinutes ?? 0}
                </Text>
                <Text className="text-af-silver text-xs">Minutes</Text>
              </View>
              <View className="w-px bg-white/10" />
              <View className="items-center flex-1">
                <Text className="text-white text-lg">🏃</Text>
                <Text className="text-white font-bold text-lg mt-1">
                  {userStats?.distanceRun?.toFixed(1) ?? 0}
                </Text>
                <Text className="text-af-silver text-xs">Miles</Text>
              </View>
              <View className="w-px bg-white/10" />
              <View className="items-center flex-1">
                <Text className="text-white text-lg">🔥</Text>
                <Text className="text-white font-bold text-lg mt-1">
                  {userStats?.caloriesBurned ?? 0}
                </Text>
                <Text className="text-af-silver text-xs">Calories</Text>
              </View>
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
                className="flex-1 bg-af-accent/20 border border-af-accent/50 rounded-xl p-4 mr-2 items-center"
              >
                <Plus size={24} color="#4A90D9" />
                <Text className="text-white font-semibold mt-2 text-sm">Add Workout</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/upload-fitness');
                }}
                className="flex-1 bg-af-success/20 border border-af-success/50 rounded-xl p-4 mx-1 items-center"
              >
                <FileText size={24} color="#22C55E" />
                <Text className="text-white font-semibold mt-2 text-sm">Upload FA</Text>
              </Pressable>
              {canEditAttendance(userAccountType) && (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push('/schedule-session');
                  }}
                  className="flex-1 bg-af-gold/20 border border-af-gold/50 rounded-xl p-4 ml-2 items-center"
                >
                  <Calendar size={24} color="#FFD700" />
                  <Text className="text-white font-semibold mt-2 text-sm">Schedule PT</Text>
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
              {/* Apple Health - Primary integration for workouts */}
              <View className="flex-row items-center justify-between py-3 border-b border-white/5">
                <View className="flex-row items-center flex-1">
                  <Watch size={20} color="#22C55E" />
                  <View className="ml-3 flex-1">
                    <Text className="text-white">Apple Health</Text>
                    <Text className="text-af-silver text-xs">Syncs workout data</Text>
                  </View>
                </View>
                {connectedIntegrations.includes('apple_health') ? (
                  <View className="flex-row items-center">
                    <View className="bg-af-success/20 px-2 py-1 rounded-full mr-2">
                      <Text className="text-af-success text-xs">Connected</Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setIntegrationToDisconnect('apple_health');
                        setShowDisconnectModal(true);
                      }}
                      className="w-8 h-8 bg-af-danger/20 rounded-full items-center justify-center"
                    >
                      <Trash2 size={16} color="#EF4444" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => handleConnectIntegration('apple_health')}
                    className="bg-white/10 px-3 py-1 rounded-full"
                  >
                    <Text className="text-af-silver text-xs">Connect</Text>
                  </Pressable>
                )}
              </View>

              {/* Strava */}
              <View className="flex-row items-center justify-between py-3 border-b border-white/5">
                <View className="flex-row items-center flex-1">
                  <Activity size={20} color="#F97316" />
                  <View className="ml-3 flex-1">
                    <Text className="text-white">Strava</Text>
                    <Text className="text-af-silver text-xs">Run & cycling tracking</Text>
                  </View>
                </View>
                {connectedIntegrations.includes('strava') ? (
                  <View className="flex-row items-center">
                    <View className="bg-af-success/20 px-2 py-1 rounded-full mr-2">
                      <Text className="text-af-success text-xs">Connected</Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setIntegrationToDisconnect('strava');
                        setShowDisconnectModal(true);
                      }}
                      className="w-8 h-8 bg-af-danger/20 rounded-full items-center justify-center"
                    >
                      <Trash2 size={16} color="#EF4444" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => handleConnectIntegration('strava')}
                    className="bg-white/10 px-3 py-1 rounded-full"
                  >
                    <Text className="text-af-silver text-xs">Connect</Text>
                  </Pressable>
                )}
              </View>

              {/* Garmin */}
              <View className="flex-row items-center justify-between py-3">
                <View className="flex-row items-center flex-1">
                  <Activity size={20} color="#00B4D8" />
                  <View className="ml-3 flex-1">
                    <Text className="text-white">Garmin</Text>
                    <Text className="text-af-silver text-xs">GPS & fitness tracking</Text>
                  </View>
                </View>
                {connectedIntegrations.includes('garmin') ? (
                  <View className="flex-row items-center">
                    <View className="bg-af-success/20 px-2 py-1 rounded-full mr-2">
                      <Text className="text-af-success text-xs">Connected</Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setIntegrationToDisconnect('garmin');
                        setShowDisconnectModal(true);
                      }}
                      className="w-8 h-8 bg-af-danger/20 rounded-full items-center justify-center"
                    >
                      <Trash2 size={16} color="#EF4444" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => handleConnectIntegration('garmin')}
                    className="bg-white/10 px-3 py-1 rounded-full"
                  >
                    <Text className="text-af-silver text-xs">Connect</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </Animated.View>

          {/* Admin Actions */}
          {hasAdminAccess && (
            <Animated.View
              entering={FadeInDown.delay(300).springify()}
              className="mx-6 mt-6"
            >
              <Text className="text-white font-semibold text-lg mb-3">Admin Actions</Text>

              <Pressable
                onPress={() => { setShowAddModal(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
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

              {userAccountType === 'flighttrack_creator' && (
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

              {userAccountType === 'flighttrack_creator' && (
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

          {/* PTL Actions (for PTLs only, not admins) */}
          {canEditAttendance(userAccountType) && !hasAdminAccess && (
            <Animated.View
              entering={FadeInDown.delay(300).springify()}
              className="mx-6 mt-6"
            >
              <Text className="text-white font-semibold text-lg mb-3">PTL Actions</Text>
              <Pressable
                onPress={() => { setShowAddModal(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                className="flex-row items-center bg-af-accent/20 border border-af-accent/50 rounded-xl p-4"
              >
                <UserPlus size={24} color="#4A90D9" />
                <View className="ml-3 flex-1">
                  <Text className="text-white font-semibold">Add to PT Attendance</Text>
                  <Text className="text-af-silver text-xs">Add name for tracking (no account)</Text>
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
              className="flex-row items-center bg-white/5 border border-white/10 rounded-xl p-4"
            >
              <HelpCircle size={24} color="#4A90D9" />
              <View className="ml-3 flex-1">
                <Text className="text-white font-semibold">View Tutorial</Text>
                <Text className="text-af-silver text-xs">Learn how to use FlightTrack</Text>
              </View>
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
                    setSelectedSquadron(user?.squadron ?? '392 IS');
                    setShowChangeSquadronModal(true);
                  }}
                  className="flex-row items-center justify-center bg-white/10 border border-white/20 rounded-xl p-4 mb-3"
                >
                  <Building2 size={20} color="#C0C0C0" />
                  <Text className="text-white font-semibold ml-2">Change Squadron</Text>
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
              <Text className="text-white text-xl font-bold">Add to PT Attendance</Text>
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

              <Text className="text-white/40 text-xs mb-4">
                This adds the person to PT attendance tracking only. They can create an account later and link to these records.
              </Text>

              {/* Add Button */}
              <Pressable
                onPress={handleAddMember}
                className="bg-af-accent py-4 rounded-xl mt-2"
              >
                <Text className="text-white font-bold text-center">Add to Attendance</Text>
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

            <ScrollView showsVerticalScrollIndicator={false}>
              {members.map((member) => {
                const memberDisplayName = getDisplayName(member);
                const memberColors = getAccountTypeColor(member.accountType);
                const isPTL = member.accountType === 'ptl';
                const isOwner = member.accountType === 'flighttrack_creator';

                return (
                  <View
                    key={member.id}
                    className="flex-row items-center justify-between py-3 border-b border-white/5"
                  >
                    <View className="flex-1">
                      <Text className="text-white font-medium">{memberDisplayName}</Text>
                      <Text className="text-af-silver text-xs">{member.flight} Flight</Text>
                    </View>
                    <View className={cn("px-2 py-1 rounded-full mr-3", memberColors.bg)}>
                      <Text className={cn("text-xs", memberColors.text)}>
                        {getAccountTypeLabel(member.accountType)}
                      </Text>
                    </View>

                    {/* Actions based on permissions */}
                    {!isOwner && canManage && (
                      <View className="flex-row items-center">
                        {isPTL && (
                          <Pressable
                            onPress={() => handleRevokePTL(member.id)}
                            className="bg-af-warning/20 px-2 py-1 rounded-full mr-2"
                          >
                            <Text className="text-af-warning text-xs">Revoke PTL</Text>
                          </Pressable>
                        )}
                        {userAccountType === 'flighttrack_creator' && member.accountType !== 'ufpm' && (
                          <Pressable
                            onPress={() => handleSetUFPM(member.id)}
                            className="bg-af-gold/20 px-2 py-1 rounded-full mr-2"
                          >
                            <Text className="text-af-gold text-xs">Make UFPM</Text>
                          </Pressable>
                        )}
                        <Pressable
                          onPress={() => handleRemoveMember(member.id)}
                          className="w-8 h-8 bg-af-danger/20 rounded-full items-center justify-center"
                        >
                          <Trash2 size={16} color="#EF4444" />
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
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
              {notifications.length === 0 ? (
                <Text className="text-white/40 text-center py-8">No notifications</Text>
              ) : (
                notifications.map((notification) => {
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
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* PTL Request Review Modal */}
      <Modal visible={showPTLRequestModal} transparent animationType="fade">
        <View className="flex-1 bg-black/80 items-center justify-center p-6">
          <View className="bg-af-navy rounded-3xl p-6 w-full max-w-sm border border-white/20">
            <Text className="text-white text-xl font-bold mb-4">PTL Request</Text>

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
                    This person has requested PTL status. Do you want to authorize them as a Physical Training Leader?
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
            <Text className="text-white text-xl font-bold mb-4">Change Squadron</Text>

            {/* Warning for PTLs */}
            {user?.accountType === 'ptl' && (
              <View className="flex-row items-start bg-af-warning/20 border border-af-warning/50 rounded-xl p-4 mb-4">
                <AlertTriangle size={20} color="#F59E0B" />
                <View className="flex-1 ml-3">
                  <Text className="text-af-warning font-semibold">Warning</Text>
                  <Text className="text-af-warning/80 text-sm">
                    Changing squadrons will remove your PTL status. You'll need to request PTL authorization again in your new squadron.
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
                  {userAccountType === 'flighttrack_creator' ? (
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
    </SwipeableTabView>
  );
}
