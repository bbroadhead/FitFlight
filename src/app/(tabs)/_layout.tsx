import React, { useEffect, useRef } from "react";
import { Redirect, withLayoutContext } from "expo-router";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { Ionicons } from "@expo/vector-icons";
import { TabSwipeProvider, useTabSwipe } from "@/contexts/TabSwipeContext";
import { useAuthStore, useMemberStore } from "@/lib/store";
import {
  fetchApprovedManualWorkouts,
  fetchAttendanceSessions,
  fetchPFRARecords,
  fetchRosterMembers,
  fetchScheduledPTSessions,
  fetchSharedWorkouts,
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

function TabsInner() {
  const { swipeEnabled } = useTabSwipe();
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
        mustChangePassword: member.mustChangePassword ?? false,
        hasLoggedIntoApp: member.hasLoggedIntoApp ?? false,
      }))
    );

  useEffect(() => {
    if (!isAuthenticated || !hasCheckedAuth) {
      return;
    }

    let isCancelled = false;

    const syncRoster = async () => {
      try {
        pruneOldWorkoutMedia(getMonthKey());
        const squadron = user?.squadron ?? 'Hawks';
        const [rosterMembers, attendanceSessions, sharedWorkouts, approvedManualWorkouts, pfraRecords, scheduledSessions] = await Promise.all([
          fetchRosterMembers(accessToken ?? undefined, squadron),
          fetchAttendanceSessions(accessToken ?? undefined).catch(() => []),
          fetchSharedWorkouts(accessToken ?? undefined, squadron).catch(() => []),
          fetchApprovedManualWorkouts(accessToken ?? undefined, squadron).catch(() => []),
          fetchPFRARecords(accessToken ?? undefined, squadron).catch(() => []),
          fetchScheduledPTSessions(accessToken ?? undefined, squadron).catch(() => []),
        ]);
        if (isCancelled) {
          return;
        }

        const normalizedRosterMembers = user
          ? rosterMembers.map((member) => {
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
                };
              }

              return member;
            })
          : rosterMembers;

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
            });
          }
        }
      } catch (error) {
        console.error('Unable to sync roster from Supabase.', error);
      }
    };

    void syncRoster();

    const interval = setInterval(() => {
      void syncRoster();
    }, 30000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [accessToken, hasCheckedAuth, isAuthenticated, pruneOldWorkoutMedia, syncApprovedManualWorkouts, syncFitnessAssessments, syncLeaderboardHistory, syncMembersFromRoster, syncPTSessions, syncScheduledSessions, syncSharedWorkouts, updateUser, user]);

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
          height: 66,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarItemStyle: {
          justifyContent: "center",
          alignItems: "center",
          paddingVertical: 4,
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
