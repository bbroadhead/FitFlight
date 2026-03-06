import React from "react";
import { View } from "react-native";
import { withLayoutContext } from "expo-router";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { Ionicons } from "@expo/vector-icons";
import { TabSwipeProvider, useTabSwipe } from "@/contexts/TabSwipeContext";

const { Navigator } = createMaterialTopTabNavigator();
const Tabs = withLayoutContext(Navigator);

function TabsInner() {
  const { swipeEnabled } = useTabSwipe();

  return (
    <Tabs
      tabBarPosition="bottom"
      screenOptions={{
        headerShown: false,
        swipeEnabled,
        animationEnabled: true,
        lazy: true,

        tabBarActiveTintColor: "#4A90D9",
        tabBarInactiveTintColor: "rgba(255,255,255,0.65)",

        // Make it a real bottom bar (not absolute, so it doesn't disappear)
        tabBarStyle: {
          backgroundColor: "rgba(10, 22, 40, 0.98)",
          borderTopColor: "rgba(255, 255, 255, 0.10)",
          borderTopWidth: 1,
          height: 60,
          paddingTop: 2,
          paddingBottom: 6,
          zIndex: 999,
          elevation: 8,
        },
        tabBarItemStyle: {
          flex: 1,
          paddingVertical: 0,
        },
        tabBarContentContainerStyle: {
          justifyContent: "space-evenly",
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          textTransform: "none",
          marginTop: 0,
        },
        tabBarIconStyle: {
          marginBottom: -2,
        },
        tabBarIndicatorStyle: { height: 0 },
        tabBarBackground: () => (
          <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(10, 22, 40, 0.98)" }} />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Leaderboard",
          tabBarIcon: ({ color }) => <Ionicons name="trophy-outline" size={22} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="workouts"
        options={{
          title: "Workouts",
          tabBarIcon: ({ color }) => <Ionicons name="barbell-outline" size={22} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: "Attendance",
          tabBarIcon: ({ color }) => <Ionicons name="clipboard-outline" size={22} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="calculator"
        options={{
          title: "Calculator",
          tabBarIcon: ({ color }) => <Ionicons name="calculator-outline" size={22} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <Ionicons name="settings-outline" size={22} color={color as string} />,
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
