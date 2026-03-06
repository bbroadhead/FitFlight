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

        // Smooth swipe + animated transitions (web + native)
        swipeEnabled,
        animationEnabled: true,
        lazy: true,

        tabBarActiveTintColor: "#4A90D9",
        tabBarInactiveTintColor: "#A0A0A0",
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "rgba(10, 22, 40, 0.98)",
          borderTopColor: "rgba(255, 255, 255, 0.10)",
          borderTopWidth: 1,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarItemStyle: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        },
        tabBarContentContainerStyle: {
          justifyContent: "space-around",
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          textTransform: "none",
          marginTop: 2,
        },
        // Hide the usual “top tabs” indicator line
        tabBarIndicatorStyle: { height: 0 },
        tabBarBackground: () => <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(10,22,40,0.98)" }} />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Leaderboard",
          tabBarIcon: ({ color, focused }) => (
            <View style={{ padding: 4, borderRadius: 10, backgroundColor: focused ? "rgba(74, 144, 217, 0.15)" : "transparent" }}>
              <Ionicons name="trophy-outline" size={22} color={color as string} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="workouts"
        options={{
          title: "Workouts",
          tabBarIcon: ({ color, focused }) => (
            <View style={{ padding: 4, borderRadius: 10, backgroundColor: focused ? "rgba(74, 144, 217, 0.15)" : "transparent" }}>
              <Ionicons name="barbell-outline" size={22} color={color as string} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: "Attendance",
          tabBarIcon: ({ color, focused }) => (
            <View style={{ padding: 4, borderRadius: 10, backgroundColor: focused ? "rgba(74, 144, 217, 0.15)" : "transparent" }}>
              <Ionicons name="clipboard-outline" size={22} color={color as string} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="calculator"
        options={{
          title: "Calculator",
          tabBarIcon: ({ color, focused }) => (
            <View style={{ padding: 4, borderRadius: 10, backgroundColor: focused ? "rgba(74, 144, 217, 0.15)" : "transparent" }}>
              <Ionicons name="calculator-outline" size={22} color={color as string} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <View style={{ padding: 4, borderRadius: 10, backgroundColor: focused ? "rgba(74, 144, 217, 0.15)" : "transparent" }}>
              <Ionicons name="settings-outline" size={22} color={color as string} />
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
