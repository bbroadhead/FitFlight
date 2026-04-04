import React, { useEffect } from "react";
import { Redirect, withLayoutContext } from "expo-router";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { Ionicons } from "@expo/vector-icons";
import { TabSwipeProvider, useTabSwipe } from "@/contexts/TabSwipeContext";
import { useAuthStore, useMemberStore } from "@/lib/store";
import { fetchAttendanceSessions, fetchRosterMembers } from "@/lib/supabaseData";

const { Navigator } = createMaterialTopTabNavigator();
const Tabs = withLayoutContext(Navigator);

function TabsInner() {
  const { swipeEnabled } = useTabSwipe();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasCheckedAuth = useAuthStore((state) => state.hasCheckedAuth);
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const updateUser = useAuthStore((state) => state.updateUser);
  const syncMembersFromRoster = useMemberStore((state) => state.syncMembersFromRoster);
  const syncPTSessions = useMemberStore((state) => state.syncPTSessions);

  useEffect(() => {
    if (!isAuthenticated || !hasCheckedAuth) {
      return;
    }

    let isCancelled = false;

    const syncRoster = async () => {
      try {
        const [rosterMembers, attendanceSessions] = await Promise.all([
          fetchRosterMembers(accessToken ?? undefined),
          fetchAttendanceSessions(accessToken ?? undefined).catch(() => []),
        ]);
        if (isCancelled) {
          return;
        }

        syncMembersFromRoster(rosterMembers);
        syncPTSessions(attendanceSessions);

        if (user) {
          const matchingMember = rosterMembers.find((member) => {
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
            });
          }
        }
      } catch (error) {
        console.error('Unable to sync roster from Supabase.', error);
      }
    };

    void syncRoster();

    return () => {
      isCancelled = true;
    };
  }, [accessToken, hasCheckedAuth, isAuthenticated, syncMembersFromRoster, syncPTSessions, updateUser, user]);

  if (hasCheckedAuth && !isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      tabBarPosition="bottom"
      screenOptions={{
        swipeEnabled,
        lazy: true,
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
        name="workouts"
        options={{
          title: "Workouts",
          tabBarIcon: ({ color }: { color: string }) => (
            <Ionicons name="barbell-outline" size={22} color={color} />
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
          title: "Profile",
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
