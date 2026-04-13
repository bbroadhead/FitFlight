import React, { useEffect, useRef } from "react";
import { Redirect, withLayoutContext } from "expo-router";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, AppState, Image, Platform, View } from "react-native";
import { TabSwipeProvider, useTabSwipe } from "@/contexts/TabSwipeContext";
import { ALL_ACHIEVEMENTS, getAutomaticAchievementIds, useAuthStore, useMemberStore } from "@/lib/store";
import {
  awardMemberTrophy,
  fetchApprovedManualWorkouts,
  fetchAttendanceSessions,
  fetchMemberTrophies,
  fetchPFRARecords,
  fetchRosterMembers,
  fetchScheduledPTSessions,
  fetchSharedWorkouts,
  markMemberTrophyCelebrationShown,
} from "@/lib/supabaseData";
import { getMonthKey } from "@/lib/monthlyStats";

const { Navigator } = createMaterialTopTabNavigator();
const Tabs = withLayoutContext(Navigator);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const buildLegacyRosterId = (member: { rank: string; firstName: string; lastName: string; flight: string }) =>
  `roster-${slugify(`${member.rank}-${member.lastName}-${member.firstName}-${member.flight}`)}`;

const LIVE_SYNC_INTERVAL_MS = 2 * 60_000;
const FULL_SYNC_INTERVAL_MS = 10 * 60_000;


function TabsInner() {
  const { swipeEnabled } = useTabSwipe();
  const isStandaloneWeb =
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)')?.matches ||
      ((window.navigator as Navigator & { standalone?: boolean }).standalone ?? false));
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasCheckedAuth = useAuthStore((state) => state.hasCheckedAuth);
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const updateUser = useAuthStore((state) => state.updateUser);
  const syncMembersFromRoster = useMemberStore((state) => state.syncMembersFromRoster);
  const syncPTSessions = useMemberStore((state) => state.syncPTSessions);
  const syncScheduledSessions = useMemberStore((state) => state.syncScheduledSessions);
  const syncSharedWorkouts = useMemberStore((state) => state.syncSharedWorkouts);
  const syncApprovedManualWorkouts = useMemberStore((state) => state.syncApprovedManualWorkouts);
  const syncFitnessAssessments = useMemberStore((state) => state.syncFitnessAssessments);
  const syncLeaderboardHistory = useMemberStore((state) => state.syncLeaderboardHistory);
  const syncMemberAchievements = useMemberStore((state) => state.syncMemberAchievements);
  const previewAchievementCelebration = useMemberStore((state) => state.previewAchievementCelebration);
  const pruneOldWorkoutMedia = useMemberStore((state) => state.pruneOldWorkoutMedia);
  const lastRosterSyncKeyRef = useRef<string | null>(null);
  const lastAttendanceSyncKeyRef = useRef<string | null>(null);
  const lastScheduledSyncKeyRef = useRef<string | null>(null);
  const lastSharedWorkoutsSyncKeyRef = useRef<string | null>(null);
  const lastManualWorkoutSyncKeyRef = useRef<string | null>(null);
  const lastPfraSyncKeyRef = useRef<string | null>(null);

  const buildMemberIdMap = (rosterMembers: ReturnType<typeof useMemberStore.getState>['members']) => {
    const currentMembers = useMemberStore.getState().members;
    const nextIds = new Set(rosterMembers.map((member) => member.id));
    const idMap = new Map<string, string>();

    currentMembers.forEach((existingMember) => {
      const match = rosterMembers.find((member) => {
        if (existingMember.id === member.id) {
          return true;
        }

        if (existingMember.email && member.email && existingMember.email.toLowerCase() === member.email.toLowerCase()) {
          return true;
        }

        return (
          existingMember.firstName.trim().toLowerCase() === member.firstName.trim().toLowerCase() &&
          existingMember.lastName.trim().toLowerCase() === member.lastName.trim().toLowerCase() &&
          existingMember.flight === member.flight &&
          existingMember.squadron === member.squadron
        );
      });

      if (match) {
        idMap.set(existingMember.id, match.id);
      }
    });

    rosterMembers.forEach((member) => {
      const legacyRosterId = buildLegacyRosterId(member);
      if (legacyRosterId !== member.id) {
        idMap.set(legacyRosterId, member.id);
      }
    });

    if (user?.id && !nextIds.has(user.id)) {
      const matchingUserMember = rosterMembers.find((member) =>
        (user.email && member.email && user.email.toLowerCase() === member.email.toLowerCase()) ||
        (
          member.firstName.trim().toLowerCase() === user.firstName.trim().toLowerCase() &&
          member.lastName.trim().toLowerCase() === user.lastName.trim().toLowerCase()
        )
      );

      if (matchingUserMember) {
        idMap.set(matchingUserMember.id, user.id);
      }
    }

    return {
      mapMemberId: (memberId: string) => idMap.get(memberId) ?? memberId,
      hasMemberId: (memberId: string) => nextIds.has(memberId),
    };
  };

  const getRosterSyncKey = (members: ReturnType<typeof useMemberStore.getState>['members']) =>
    JSON.stringify(
      members.map((member) => ({
        id: member.id,
        rank: member.rank,
        firstName: member.firstName,
        lastName: member.lastName,
        flight: member.flight,
        squadron: member.squadron,
        accountType: member.accountType,
        email: member.email,
        profilePicture: member.profilePicture ?? null,
        achievements: [...member.achievements].sort(),
        mustChangePassword: member.mustChangePassword ?? false,
        hasLoggedIntoApp: member.hasLoggedIntoApp ?? false,
      }))
    );

  useEffect(() => {
    if (!isAuthenticated || !hasCheckedAuth) {
      return;
    }

    let isCancelled = false;
    let appState = AppState.currentState;
    let lastFullSyncAt = 0;
    let isSyncing = false;

    const shouldSyncNow = () => {
      if (Platform.OS === 'web' && typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return false;
      }

      return appState === 'active';
    };

    const syncRoster = async (includeStaticData: boolean) => {
      if (isSyncing) {
        return;
      }

      isSyncing = true;
      try {
        pruneOldWorkoutMedia(getMonthKey());
        const squadron = user?.squadron ?? 'Hawks';
        const [
          rosterMembers,
          approvedManualWorkouts,
          pfraRecords,
          attendanceSessions,
          sharedWorkouts,
          scheduledSessions,
          trophyRows,
        ] = await Promise.all([
          includeStaticData
            ? fetchRosterMembers(accessToken ?? undefined, squadron)
            : Promise.resolve(useMemberStore.getState().members),
          includeStaticData
            ? fetchApprovedManualWorkouts(accessToken ?? undefined, squadron, { includeProofImage: false }).catch(() => [])
            : Promise.resolve(
                useMemberStore.getState().members.map((member) => ({
                  memberId: member.id,
                  memberEmail: member.email,
                  workouts: member.workouts.filter((workout) => workout.source === 'manual' && Boolean(workout.externalId)),
                }))
              ),
          includeStaticData
            ? fetchPFRARecords(accessToken ?? undefined, squadron).catch(() => [])
            : Promise.resolve(
                useMemberStore.getState().members.map((member) => ({
                  memberId: member.id,
                  memberEmail: member.email,
                  assessments: member.fitnessAssessments,
                }))
              ),
          fetchAttendanceSessions(accessToken ?? undefined).catch(() => []),
          fetchSharedWorkouts(accessToken ?? undefined, squadron).catch(() => []),
          fetchScheduledPTSessions(accessToken ?? undefined, squadron).catch(() => []),
          fetchMemberTrophies(accessToken ?? undefined, squadron, true).catch(() => []),
        ]);
        if (isCancelled) {
          return;
        }

        const activeTrophiesByMember = new Map<string, Set<string>>();
        const knownTrophiesByMember = new Map<string, Set<string>>();
        const pendingCelebrationRowsByMember = new Map<string, typeof trophyRows>();

        trophyRows.forEach((row) => {
          const emailKey = row.memberEmail.trim().toLowerCase();
          const knownForEmail = knownTrophiesByMember.get(emailKey) ?? new Set<string>();
          knownForEmail.add(row.trophyId);
          knownTrophiesByMember.set(emailKey, knownForEmail);

          if (row.memberId) {
            const knownForId = knownTrophiesByMember.get(row.memberId) ?? new Set<string>();
            knownForId.add(row.trophyId);
            knownTrophiesByMember.set(row.memberId, knownForId);
          }

          if (!row.isActive) {
            return;
          }

          const activeForEmail = activeTrophiesByMember.get(emailKey) ?? new Set<string>();
          activeForEmail.add(row.trophyId);
          activeTrophiesByMember.set(emailKey, activeForEmail);

          if (row.memberId) {
            const activeForId = activeTrophiesByMember.get(row.memberId) ?? new Set<string>();
            activeForId.add(row.trophyId);
            activeTrophiesByMember.set(row.memberId, activeForId);
          }

          if (!row.celebrationShownAt) {
            const pendingForEmail = pendingCelebrationRowsByMember.get(emailKey) ?? [];
            pendingForEmail.push(row);
            pendingCelebrationRowsByMember.set(emailKey, pendingForEmail);

            if (row.memberId) {
              const pendingForId = pendingCelebrationRowsByMember.get(row.memberId) ?? [];
              pendingForId.push(row);
              pendingCelebrationRowsByMember.set(row.memberId, pendingForId);
            }
          }
        });

        const sourceRosterMembers = rosterMembers;
        const normalizedRosterMembers = user
          ? sourceRosterMembers.map((member) => {
              const isMatchByEmail =
                !!member.email &&
                !!user.email &&
                member.email.toLowerCase() === user.email.toLowerCase();
              const isMatchByName =
                member.firstName.trim().toLowerCase() === user.firstName.trim().toLowerCase() &&
                member.lastName.trim().toLowerCase() === user.lastName.trim().toLowerCase();

              if (isMatchByEmail || isMatchByName) {
                return {
                  ...member,
                  id: user.id,
                  achievements: Array.from(
                    activeTrophiesByMember.get(user.email?.toLowerCase() ?? '') ??
                    activeTrophiesByMember.get(user.id) ??
                    []
                  ),
                };
              }

              return {
                ...member,
                achievements: Array.from(
                  activeTrophiesByMember.get(member.email.toLowerCase()) ??
                  activeTrophiesByMember.get(member.id) ??
                  []
                ),
              };
            })
          : sourceRosterMembers.map((member) => ({
              ...member,
              achievements: Array.from(
                activeTrophiesByMember.get(member.email.toLowerCase()) ??
                activeTrophiesByMember.get(member.id) ??
                []
              ),
            }));

        const { mapMemberId, hasMemberId } = buildMemberIdMap(normalizedRosterMembers);
        const remappedAttendanceSessions = attendanceSessions.map((session) => ({
          ...session,
          createdBy: mapMemberId(session.createdBy),
          attendees: [...new Set(session.attendees.map(mapMemberId).filter((memberId) => hasMemberId(memberId)))],
        }));
        const remappedScheduledSessions = scheduledSessions.map((session) => ({
          ...session,
          createdBy: mapMemberId(session.createdBy),
        }));
        const remappedSharedWorkouts = sharedWorkouts.map((workout) => ({
          ...workout,
          createdBy: mapMemberId(workout.createdBy),
          thumbsUp: [...new Set(workout.thumbsUp.map(mapMemberId).filter((memberId) => hasMemberId(memberId)))],
          thumbsDown: [...new Set(workout.thumbsDown.map(mapMemberId).filter((memberId) => hasMemberId(memberId)))],
          favoritedBy: [...new Set(workout.favoritedBy.map(mapMemberId).filter((memberId) => hasMemberId(memberId)))],
        }));
        const remappedApprovedManualWorkouts = approvedManualWorkouts.map((entry) => ({
          ...entry,
          memberId: entry.memberId ? mapMemberId(entry.memberId) : entry.memberId,
        }));
        const remappedPfraRecords = pfraRecords.map((entry) => ({
          ...entry,
          memberId: entry.memberId ? mapMemberId(entry.memberId) : entry.memberId,
        }));

        const rosterSyncKey = getRosterSyncKey(normalizedRosterMembers);
        const attendanceSyncKey = JSON.stringify(remappedAttendanceSessions);
        const scheduledSyncKey = JSON.stringify(remappedScheduledSessions);
        const sharedWorkoutsSyncKey = JSON.stringify(remappedSharedWorkouts);
        const manualWorkoutSyncKey = JSON.stringify(remappedApprovedManualWorkouts);
        const pfraSyncKey = JSON.stringify(remappedPfraRecords);
        let didSyncMemberData = false;

        if (lastRosterSyncKeyRef.current !== rosterSyncKey) {
          syncMembersFromRoster(normalizedRosterMembers);
          lastRosterSyncKeyRef.current = rosterSyncKey;
          didSyncMemberData = true;
        }

        if (lastAttendanceSyncKeyRef.current !== attendanceSyncKey) {
          syncPTSessions(remappedAttendanceSessions);
          lastAttendanceSyncKeyRef.current = attendanceSyncKey;
          didSyncMemberData = true;
        }

        if (lastScheduledSyncKeyRef.current !== scheduledSyncKey) {
          syncScheduledSessions(remappedScheduledSessions);
          lastScheduledSyncKeyRef.current = scheduledSyncKey;
        }

        if (lastSharedWorkoutsSyncKeyRef.current !== sharedWorkoutsSyncKey) {
          syncSharedWorkouts(remappedSharedWorkouts);
          lastSharedWorkoutsSyncKeyRef.current = sharedWorkoutsSyncKey;
          didSyncMemberData = true;
        }

        if (lastManualWorkoutSyncKeyRef.current !== manualWorkoutSyncKey) {
          syncApprovedManualWorkouts(remappedApprovedManualWorkouts);
          lastManualWorkoutSyncKeyRef.current = manualWorkoutSyncKey;
          didSyncMemberData = true;
        }

        if (lastPfraSyncKeyRef.current !== pfraSyncKey) {
          syncFitnessAssessments(remappedPfraRecords);
          lastPfraSyncKeyRef.current = pfraSyncKey;
          didSyncMemberData = true;
        }

        if (didSyncMemberData) {
          syncLeaderboardHistory();
        }

        const postSyncStoreState = useMemberStore.getState();
        const trophySyncEntries = postSyncStoreState.members.map((member) => {
          const emailKey = member.email.trim().toLowerCase();
          const activeAchievements = new Set([
            ...(activeTrophiesByMember.get(emailKey) ?? []),
            ...(activeTrophiesByMember.get(member.id) ?? []),
          ]);
          const knownAchievements = new Set([
            ...(knownTrophiesByMember.get(emailKey) ?? []),
            ...(knownTrophiesByMember.get(member.id) ?? []),
          ]);
          const automaticAchievements = new Set(
            getAutomaticAchievementIds(member, postSyncStoreState.ptSessions, postSyncStoreState.sharedWorkouts)
          );
          const missingAchievements = Array.from(automaticAchievements).filter(
            (achievementId) => !knownAchievements.has(achievementId)
          );
          const desiredAchievements = new Set<string>([
            ...Array.from(activeAchievements),
            ...missingAchievements,
          ]);
          const shouldUnlockCompletionist = ALL_ACHIEVEMENTS
            .filter((achievement) => achievement.id !== "completionist")
            .every((achievement) => desiredAchievements.has(achievement.id));

          if (shouldUnlockCompletionist && !knownAchievements.has("completionist")) {
            missingAchievements.push("completionist");
            desiredAchievements.add("completionist");
          }

          return {
            memberId: member.id,
            memberEmail: member.email,
            squadron: member.squadron,
            achievements: Array.from(desiredAchievements),
            missingAchievements,
          };
        });

        syncMemberAchievements(
          trophySyncEntries.map((entry) => ({
            memberId: entry.memberId,
            memberEmail: entry.memberEmail,
            achievements: entry.achievements,
          }))
        );

        const awardedRows = await Promise.all(
          trophySyncEntries.flatMap((entry) =>
            entry.missingAchievements.map((trophyId) =>
              awardMemberTrophy({
                memberId: entry.memberId,
                memberEmail: entry.memberEmail,
                squadron: entry.squadron,
                trophyId,
                awardedByMemberId: user?.id ?? null,
                accessToken: accessToken ?? undefined,
              }).catch((error) => {
                console.error(`Unable to persist trophy ${trophyId} for ${entry.memberEmail}.`, error);
                return null;
              })
            )
          )
        );

        if (user) {
          const currentUserKeys = new Set([
            user.id,
            user.email.trim().toLowerCase(),
          ]);
          const pendingCelebrationRows = Array.from(
            new Map(
              [
                ...(Array.from(currentUserKeys).flatMap((key) => pendingCelebrationRowsByMember.get(key) ?? [])),
                ...awardedRows.filter((row): row is NonNullable<typeof row> => Boolean(row)).filter(
                  (row) =>
                    row.memberEmail.trim().toLowerCase() === user.email.trim().toLowerCase() ||
                    row.memberId === user.id
                ),
              ].map((row) => [row.id, row] as const)
            ).values()
          ).sort((left, right) => left.earnedAt.localeCompare(right.earnedAt));

          const nextCelebration = pendingCelebrationRows.find((row) =>
            ALL_ACHIEVEMENTS.some((achievement) => achievement.id === row.trophyId)
          );

          if (nextCelebration) {
            previewAchievementCelebration(nextCelebration.trophyId);
            void markMemberTrophyCelebrationShown(nextCelebration.id, accessToken ?? undefined).catch((error) => {
              console.error(`Unable to mark trophy celebration ${nextCelebration.trophyId} as shown.`, error);
            });
          }
        }

        if (user) {
          const matchingMember = normalizedRosterMembers.find((member) => {
            if (member.email && user.email && member.email.toLowerCase() === user.email.toLowerCase()) {
              return true;
            }

            return (
              member.firstName.trim().toLowerCase() === user.firstName.trim().toLowerCase() &&
              member.lastName.trim().toLowerCase() === user.lastName.trim().toLowerCase()
            );
          });

          if (matchingMember) {
            updateUser({
              rank: matchingMember.rank,
              firstName: matchingMember.firstName,
              lastName: matchingMember.lastName,
              flight: matchingMember.flight,
              squadron: matchingMember.squadron,
              accountType: matchingMember.accountType,
              profilePicture: matchingMember.profilePicture,
              showWorkoutHistoryOnProfile: matchingMember.showWorkoutHistoryOnProfile,
              showWorkoutUploadsOnProfile: matchingMember.showWorkoutUploadsOnProfile,
              showPFRARecordsOnProfile: matchingMember.showPFRARecordsOnProfile,
            });
          }
        }
      } catch (error) {
        console.error('Unable to sync roster from Supabase.', error);
      } finally {
        isSyncing = false;
      }
    };

    void syncRoster(true);

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      appState = nextState;
      if (nextState === 'active' && Date.now() - lastFullSyncAt >= LIVE_SYNC_INTERVAL_MS) {
        void syncRoster(true);
        lastFullSyncAt = Date.now();
      }
    });

    const liveInterval = setInterval(() => {
      if (!shouldSyncNow()) {
        return;
      }

      void syncRoster(false);
    }, LIVE_SYNC_INTERVAL_MS);

    const fullInterval = setInterval(() => {
      if (!shouldSyncNow()) {
        return;
      }

      lastFullSyncAt = Date.now();
      void syncRoster(true);
    }, FULL_SYNC_INTERVAL_MS);

    return () => {
      isCancelled = true;
      appStateSubscription.remove();
      clearInterval(liveInterval);
      clearInterval(fullInterval);
    };
  }, [accessToken, hasCheckedAuth, isAuthenticated, pruneOldWorkoutMedia, syncApprovedManualWorkouts, syncFitnessAssessments, syncLeaderboardHistory, syncMemberAchievements, syncMembersFromRoster, syncPTSessions, syncScheduledSessions, syncSharedWorkouts, updateUser, user]);

  if (!hasCheckedAuth) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A1628', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View
          style={{
            width: 84,
            height: 84,
            borderRadius: 24,
            backgroundColor: 'rgba(255,255,255,0.08)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.14)',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            marginBottom: 22,
          }}
        >
          <Image
            source={require('../../../assets/images/TotalFlight_Icon_Resized.png')}
            style={{ width: '72%', height: '72%' }}
            resizeMode="contain"
          />
        </View>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    );
  }

  if (hasCheckedAuth && !isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return (
      <Tabs
        tabBarPosition="bottom"
        screenOptions={{
          swipeEnabled,
          lazy: true,
          lazyPreloadDistance: 1,
          animationEnabled: true,
          tabBarShowIcon: true,
          tabBarActiveTintColor: "#ffffff",
        tabBarInactiveTintColor: "rgba(255,255,255,0.6)",
        tabBarStyle: {
          backgroundColor: "#071226",
          borderTopWidth: 1,
          borderTopColor: "rgba(255,255,255,0.08)",
          height: Platform.OS === 'web' ? 60 : 66,
          paddingBottom: 0,
          paddingTop: 0,
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarItemStyle: {
          justifyContent: "center",
          alignItems: "center",
          paddingVertical: 0,
          height: "100%",
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
          textTransform: "none",
          marginTop: -2,
        },
        tabBarIndicatorStyle: {
          display: "none",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }: { color: string }) => (
            <Ionicons name="home-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: "Attendance",
          tabBarIcon: ({ color }: { color: string }) => (
            <Ionicons name="checkbox-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="workouts"
        options={{
          title: "Workouts",
          tabBarIcon: ({ color }: { color: string }) => (
            <Ionicons name="barbell-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="calculator"
        options={{
          title: "Calculator",
          tabBarIcon: ({ color }: { color: string }) => (
            <Ionicons name="calculator-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Account",
          tabBarIcon: ({ color }: { color: string }) => (
            <Ionicons name="person-outline" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  return (
    <TabSwipeProvider>
      <TabsInner />
    </TabSwipeProvider>
  );
}
