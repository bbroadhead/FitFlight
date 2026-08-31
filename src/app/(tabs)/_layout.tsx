import React, { useEffect, useRef, useState } from "react";
import { Redirect, withLayoutContext } from "expo-router";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, AppState, Image, Platform, View } from "react-native";
import { TabSwipeProvider, useTabSwipe } from "@/contexts/TabSwipeContext";
import { ALL_ACHIEVEMENTS, DEFAULT_SQUADRON, getAccessibleSquadrons, getAutomaticAchievementIds, normalizeSquadron, useAuthStore, useMemberStore } from "@/lib/store";
import { getThemeCardStyle, useAppTheme } from "@/lib/theme";
import {
  flushOfflineQueue,
  initializeAppSyncNetworkMonitor,
  registerSyncHandler,
  runTrackedSync,
  useAppSyncStore,
} from '@/lib/appSync';
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

const buildLegacyRosterId = (
  member: { rank: string; firstName: string; lastName: string; flight: string; squadron?: string },
  includeSquadron = false
) =>
  `roster-${slugify(
    includeSquadron && member.squadron
      ? `${member.squadron}-${member.rank}-${member.lastName}-${member.firstName}-${member.flight}`
      : `${member.rank}-${member.lastName}-${member.firstName}-${member.flight}`
  )}`;

const LIVE_SYNC_INTERVAL_MS = 2 * 60_000;
const FULL_SYNC_INTERVAL_MS = 10 * 60_000;


function TabsInner() {
  const { swipeEnabled } = useTabSwipe();
  const theme = useAppTheme();
  const isStandaloneWeb =
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)')?.matches ||
      ((window.navigator as Navigator & { standalone?: boolean }).standalone ?? false));
  const tabBarBottomInset = Platform.OS === 'web' ? ('env(safe-area-inset-bottom)' as unknown as number) : 0;
  const tabBarHeight = 66;
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasCheckedAuth = useAuthStore((state) => state.hasCheckedAuth);
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const isOnline = useAppSyncStore((state) => state.isOnline);
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
  const recentAchievementId = useMemberStore((state) => state.recentAchievementId);
  const pruneOldWorkoutMedia = useMemberStore((state) => state.pruneOldWorkoutMedia);
  const [isInitialSyncing, setIsInitialSyncing] = useState(true);
  const lastRosterSyncKeyRef = useRef<string | null>(null);
  const lastAttendanceSyncKeyRef = useRef<string | null>(null);
  const lastScheduledSyncKeyRef = useRef<string | null>(null);
  const lastSharedWorkoutsSyncKeyRef = useRef<string | null>(null);
  const lastManualWorkoutSyncKeyRef = useRef<string | null>(null);
  const lastPfraSyncKeyRef = useRef<string | null>(null);
  const handledCelebrationTrophyIdsRef = useRef<Set<string>>(new Set());
  const handledCelebrationRowIdsRef = useRef<Set<string>>(new Set());
  const markingCelebrationTrophyIdsRef = useRef<Set<string>>(new Set());
  const queuedCelebrationRowsRef = useRef<Array<{ id: string; trophyId: string }>>([]);
  const activeCelebrationRef = useRef<{ id: string; trophyId: string } | null>(null);
  const previousRecentAchievementIdRef = useRef<string | null>(null);
  const userId = user?.id ?? null;
  const userEmail = user?.email?.trim().toLowerCase() ?? null;
  const userSquadron = normalizeSquadron(user?.squadron, DEFAULT_SQUADRON);
  const userFirstName = user?.firstName?.trim().toLowerCase() ?? '';
  const userLastName = user?.lastName?.trim().toLowerCase() ?? '';
  const hasUser = Boolean(user);

  useEffect(() => initializeAppSyncNetworkMonitor(), []);

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
      const scopedLegacyRosterId = buildLegacyRosterId(member, true);
      if (legacyRosterId !== member.id) {
        idMap.set(legacyRosterId, member.id);
      }
      if (scopedLegacyRosterId !== member.id) {
        idMap.set(scopedLegacyRosterId, member.id);
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
      mapMemberId: (memberId: string) => {
        let nextId = memberId;
        const visited = new Set<string>();

        while (idMap.has(nextId) && !visited.has(nextId)) {
          visited.add(nextId);
          nextId = idMap.get(nextId) ?? nextId;
        }

        return nextId;
      },
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
        appTheme: member.appTheme ?? 'default',
        showUpdateNotes: member.showUpdateNotes ?? true,
        achievements: [...member.achievements].sort(),
        mustChangePassword: member.mustChangePassword ?? false,
        hasLoggedIntoApp: member.hasLoggedIntoApp ?? false,
      }))
    );

  useEffect(() => {
    if (recentAchievementId) {
      handledCelebrationTrophyIdsRef.current.add(recentAchievementId);
    }
  }, [recentAchievementId]);

  useEffect(() => {
    handledCelebrationTrophyIdsRef.current.clear();
    handledCelebrationRowIdsRef.current.clear();
    markingCelebrationTrophyIdsRef.current.clear();
    queuedCelebrationRowsRef.current = [];
    activeCelebrationRef.current = null;
    previousRecentAchievementIdRef.current = null;
  }, [userEmail, userId]);

  useEffect(() => {
    if (isAuthenticated) {
      return;
    }

    handledCelebrationTrophyIdsRef.current.clear();
    handledCelebrationRowIdsRef.current.clear();
    markingCelebrationTrophyIdsRef.current.clear();
    queuedCelebrationRowsRef.current = [];
    activeCelebrationRef.current = null;
    previousRecentAchievementIdRef.current = null;
  }, [isAuthenticated]);

  useEffect(() => {
    if (recentAchievementId) {
      previousRecentAchievementIdRef.current = recentAchievementId;
      return;
    }

    const previousAchievementId = previousRecentAchievementIdRef.current;
    previousRecentAchievementIdRef.current = null;

    if (previousAchievementId && activeCelebrationRef.current) {
      const completedCelebration = activeCelebrationRef.current;
      activeCelebrationRef.current = null;
      handledCelebrationRowIdsRef.current.add(completedCelebration.id);
      handledCelebrationTrophyIdsRef.current.add(completedCelebration.trophyId);
      void markMemberTrophyCelebrationShown(completedCelebration.id, accessToken ?? undefined)
        .catch((error) => {
          console.error(`Unable to mark trophy celebration ${completedCelebration.trophyId} as shown.`, error);
        })
        .finally(() => {
          markingCelebrationTrophyIdsRef.current.delete(completedCelebration.trophyId);
          const nextCelebration = queuedCelebrationRowsRef.current.shift() ?? null;
          if (nextCelebration) {
            activeCelebrationRef.current = nextCelebration;
            previewAchievementCelebration(nextCelebration.trophyId);
          }
        });
      return;
    }

    if (activeCelebrationRef.current || isInitialSyncing) {
      return;
    }

    const nextCelebration = queuedCelebrationRowsRef.current.shift() ?? null;
    if (nextCelebration) {
      activeCelebrationRef.current = nextCelebration;
      previewAchievementCelebration(nextCelebration.trophyId);
    }
  }, [accessToken, isInitialSyncing, previewAchievementCelebration, recentAchievementId]);

  useEffect(() => {
    if (!isAuthenticated || !hasCheckedAuth) {
      return;
    }

    setIsInitialSyncing(true);

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

    const performSyncRoster = async (includeStaticData: boolean) => {
      if (isSyncing) {
        return;
      }

      isSyncing = true;
      try {
        pruneOldWorkoutMedia(getMonthKey());
        const squadron = userSquadron;
        const syncSquadrons = getAccessibleSquadrons(squadron);
        const localStore = useMemberStore.getState();
        const squadronPayloads = await Promise.all(
          syncSquadrons.map(async (syncSquadron) => ({
            squadron: syncSquadron,
            rosterMembers: includeStaticData
              ? await fetchRosterMembers(accessToken ?? undefined, syncSquadron).catch(() => [])
              : localStore.members.filter((member) => member.squadron === syncSquadron),
            approvedManualWorkouts: includeStaticData
              ? await fetchApprovedManualWorkouts(accessToken ?? undefined, syncSquadron, { includeProofImage: false }).catch(() => [])
              : localStore.members
                  .filter((member) => member.squadron === syncSquadron)
                  .map((member) => ({
                    memberId: member.id,
                    memberEmail: member.email,
                    workouts: member.workouts.filter((workout) => workout.source === 'manual' && Boolean(workout.externalId)),
                  })),
            pfraRecords: includeStaticData
              ? await fetchPFRARecords(accessToken ?? undefined, syncSquadron).catch(() => [])
              : localStore.members
                  .filter((member) => member.squadron === syncSquadron)
                  .map((member) => ({
                    memberId: member.id,
                    memberEmail: member.email,
                    assessments: member.fitnessAssessments,
                  })),
            attendanceSessions: await fetchAttendanceSessions(accessToken ?? undefined, syncSquadron).catch(() => []),
            sharedWorkouts: await fetchSharedWorkouts(accessToken ?? undefined, syncSquadron).catch(() => []),
            scheduledSessions: await fetchScheduledPTSessions(accessToken ?? undefined, syncSquadron).catch(() => []),
            trophyRows: await fetchMemberTrophies(accessToken ?? undefined, syncSquadron, true).catch(() => []),
          }))
        );
        const rosterMembers = squadronPayloads.flatMap((payload) => payload.rosterMembers);
        const approvedManualWorkouts = squadronPayloads.flatMap((payload) => payload.approvedManualWorkouts);
        const pfraRecords = squadronPayloads.flatMap((payload) => payload.pfraRecords);
        const attendanceSessions = squadronPayloads.flatMap((payload) => payload.attendanceSessions);
        const sharedWorkouts = squadronPayloads.flatMap((payload) => payload.sharedWorkouts);
        const scheduledSessions = squadronPayloads.flatMap((payload) => payload.scheduledSessions);
        const trophyRows = squadronPayloads.flatMap((payload) => payload.trophyRows);
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

          if (row.celebrationStatusKnown && !row.celebrationShownAt) {
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
        const normalizedRosterMembers = hasUser
          ? sourceRosterMembers.map((member) => {
              const isMatchByEmail =
                !!member.email &&
                !!userEmail &&
                member.email.toLowerCase() === userEmail;
              const isMatchByName =
                member.firstName.trim().toLowerCase() === userFirstName &&
                member.lastName.trim().toLowerCase() === userLastName;

              if (isMatchByEmail || isMatchByName) {
                return {
                  ...member,
                  id: userId ?? member.id,
                  achievements: Array.from(
                    activeTrophiesByMember.get(userEmail ?? '') ??
                    activeTrophiesByMember.get(userId ?? '') ??
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
          syncSquadrons.forEach((syncSquadron) => {
            syncMembersFromRoster(
              normalizedRosterMembers.filter((member) => member.squadron === syncSquadron),
              { squadron: syncSquadron }
            );
          });
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

        syncLeaderboardHistory();

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
                awardedByMemberId: userId ?? null,
                accessToken: accessToken ?? undefined,
              }).catch((error) => {
                console.error(`Unable to persist trophy ${trophyId} for ${entry.memberEmail}.`, error);
                return null;
              })
            )
          )
        );

        if (hasUser) {
          const currentUserKeys = new Set([
            userId ?? '',
            userEmail ?? '',
          ]);
          const pendingCelebrationRows = Array.from(
            new Map(
              [
                ...(Array.from(currentUserKeys).flatMap((key) => pendingCelebrationRowsByMember.get(key) ?? [])),
                  ...awardedRows
                    .filter((row): row is NonNullable<typeof row> => Boolean(row))
                    .filter((row) => row.celebrationStatusKnown)
                    .filter(
                    (row) =>
                      row.memberEmail.trim().toLowerCase() === userEmail ||
                      row.memberId === userId
                  ),
                ].map((row) => [row.id, row] as const)
              ).values()
            ).sort((left, right) => left.earnedAt.localeCompare(right.earnedAt));

          const nextCelebrations = pendingCelebrationRows.filter((row) =>
            ALL_ACHIEVEMENTS.some((achievement) => achievement.id === row.trophyId) &&
            !handledCelebrationRowIdsRef.current.has(row.id) &&
            !handledCelebrationTrophyIdsRef.current.has(row.trophyId) &&
            !markingCelebrationTrophyIdsRef.current.has(row.trophyId)
          );

          if (nextCelebrations.length > 0) {
            const queuedIds = new Set(queuedCelebrationRowsRef.current.map((row) => row.id));
            nextCelebrations.forEach((row) => {
              if (activeCelebrationRef.current?.id === row.id || queuedIds.has(row.id)) {
                return;
              }
              markingCelebrationTrophyIdsRef.current.add(row.trophyId);
              queuedCelebrationRowsRef.current.push({
                id: row.id,
                trophyId: row.trophyId,
              });
            });
          }
        }

        if (hasUser) {
          const matchingMember = normalizedRosterMembers.find((member) => {
            if (member.email && userEmail && member.email.toLowerCase() === userEmail) {
              return true;
            }

            return (
              member.firstName.trim().toLowerCase() === userFirstName &&
              member.lastName.trim().toLowerCase() === userLastName
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
              appTheme: matchingMember.appTheme,
              showWorkoutHistoryOnProfile: matchingMember.showWorkoutHistoryOnProfile,
              showWorkoutUploadsOnProfile: matchingMember.showWorkoutUploadsOnProfile,
              showPFRARecordsOnProfile: matchingMember.showPFRARecordsOnProfile,
              showUpdateNotes: matchingMember.showUpdateNotes,
            });
          }
        }
      } catch (error) {
        console.error('Unable to sync roster from Supabase.', error);
      } finally {
        if (includeStaticData && !isCancelled) {
          setIsInitialSyncing(false);
        }
        isSyncing = false;
      }
    };

    const syncRoster = async (includeStaticData: boolean) =>
      runTrackedSync(async () => {
        await flushOfflineQueue(accessToken ?? undefined);
        await performSyncRoster(includeStaticData);
      });

    void syncRoster(true);

    const unregisterGlobalSync = registerSyncHandler('global', async () => {
      await flushOfflineQueue(accessToken ?? undefined);
      await performSyncRoster(true);
    });

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
      unregisterGlobalSync();
      appStateSubscription.remove();
      clearInterval(liveInterval);
      clearInterval(fullInterval);
    };
  }, [accessToken, hasCheckedAuth, hasUser, isAuthenticated, pruneOldWorkoutMedia, syncApprovedManualWorkouts, syncFitnessAssessments, syncLeaderboardHistory, syncMemberAchievements, syncMembersFromRoster, syncPTSessions, syncScheduledSessions, syncSharedWorkouts, updateUser, userEmail, userFirstName, userId, userLastName, userSquadron]);

  useEffect(() => {
    if (!isOnline || !accessToken || !isAuthenticated) {
      return;
    }

    void runTrackedSync(async () => {
      await flushOfflineQueue(accessToken);
    });
  }, [accessToken, isAuthenticated, isOnline]);

  if (!hasCheckedAuth) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View
          style={{
            ...getThemeCardStyle(theme, 'feature'),
            width: 84,
            height: 84,
            borderRadius: theme.id === 'pixel' ? 12 : 24,
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
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (hasCheckedAuth && !isAuthenticated) {
    return <Redirect href="/login" />;
  }

  if (isInitialSyncing) {
    return (
        <View style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View
          style={{
            ...getThemeCardStyle(theme, 'feature'),
            width: 84,
            height: 84,
            borderRadius: theme.id === 'pixel' ? 12 : 24,
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
          <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
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
          tabBarActiveTintColor: theme.indicator,
        tabBarInactiveTintColor: "rgba(255,255,255,0.6)",
        tabBarStyle: {
            backgroundColor: theme.tabBar,
            borderTopWidth: 1,
            borderTopColor: theme.tabBarBorder,
          height: Platform.OS === 'web' ? undefined : tabBarHeight,
          minHeight: tabBarHeight,
          paddingBottom: tabBarBottomInset,
          paddingTop: 3,
          position: Platform.OS === 'web' ? ("fixed" as const) : "absolute",
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
          fontSize: theme.id === 'pixel' ? 9 : theme.id === 'cyber' ? 11 : 12,
          fontWeight: "600",
          fontFamily: theme.bodyFontFamily,
          letterSpacing: theme.id === 'pixel' ? 0.05 : theme.buttonLetterSpacing,
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
          tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
            <View
                style={focused ? {
                  borderRadius: 16,
                  backgroundColor: theme.indicatorGlow,
                  borderWidth: 1,
                  borderColor: theme.indicator,
                  shadowColor: theme.indicator,
                  shadowOpacity: 0.45,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 0 },
                } : undefined}
            >
              <Ionicons name="home-outline" size={24} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: "Attendance",
          tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
            <View
                style={focused ? {
                  borderRadius: 16,
                  backgroundColor: theme.indicatorGlow,
                  borderWidth: 1,
                  borderColor: theme.indicator,
                  shadowColor: theme.indicator,
                  shadowOpacity: 0.45,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 0 },
                } : undefined}
            >
              <Ionicons name="checkbox-outline" size={24} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="workouts"
        options={{
          title: "Workouts",
          tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
            <View
                style={focused ? {
                  borderRadius: 16,
                  backgroundColor: theme.indicatorGlow,
                  borderWidth: 1,
                  borderColor: theme.indicator,
                  shadowColor: theme.indicator,
                  shadowOpacity: 0.45,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 0 },
                } : undefined}
            >
              <Ionicons name="barbell-outline" size={24} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="calculator"
        options={{
          title: "Calculator",
          tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
            <View
                style={focused ? {
                  borderRadius: 16,
                  backgroundColor: theme.indicatorGlow,
                  borderWidth: 1,
                  borderColor: theme.indicator,
                  shadowColor: theme.indicator,
                  shadowOpacity: 0.45,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 0 },
                } : undefined}
            >
              <Ionicons name="calculator-outline" size={24} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Account",
          tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
            <View
                style={focused ? {
                  borderRadius: 16,
                  backgroundColor: theme.indicatorGlow,
                  borderWidth: 1,
                  borderColor: theme.indicator,
                  shadowColor: theme.indicator,
                  shadowOpacity: 0.45,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 0 },
                } : undefined}
            >
              <Ionicons name="person-outline" size={24} color={color} />
            </View>
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
