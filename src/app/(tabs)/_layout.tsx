import React from 'react';
import { View, Text } from 'react-native';
import { withLayoutContext } from 'expo-router';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { Ionicons } from '@expo/vector-icons';

const { Navigator } = createMaterialTopTabNavigator();
const Tabs = withLayoutContext(Navigator);

function TabIcon({
  name,
  color,
  focused,
}: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  focused: boolean;
}) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View style={focused ? { backgroundColor: 'rgba(74, 144, 217, 0.18)', padding: 8, borderRadius: 12 } : { padding: 8 }}>
        <Ionicons name={name} size={22} color={color} />
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBarPosition="bottom"
      screenOptions={{
        headerShown: false,

        // Smooth swipe + animated transitions (web + native)
        swipeEnabled: true,
        animationEnabled: true,
        lazy: true,

        tabBarShowIcon: true,
        tabBarShowLabel: true,

        tabBarActiveTintColor: '#4A90D9',
        tabBarInactiveTintColor: '#A0A0A0',

        // Make it look/behave like a bottom tab bar
        tabBarStyle: {
          backgroundColor: 'rgba(10, 22, 40, 0.96)',
          borderTopColor: 'rgba(255, 255, 255, 0.12)',
          borderTopWidth: 1,
          height: 82,
          paddingTop: 8,
          paddingBottom: 20,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          textTransform: 'none',
          marginTop: -4,
        },
        tabBarIndicatorStyle: {
          // Hide the usual “top tabs” indicator line
          height: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Leaderboard',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="trophy-outline" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="workouts"
        options={{
          title: 'Workouts',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="barbell-outline" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Attendance',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="clipboard-outline" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="calculator"
        options={{
          title: 'Calculator',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="calculator-outline" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="settings-outline" color={color} focused={focused} />
          ),
        }}
      />

      {/* Hidden route used elsewhere in the app */}
      <Tabs.Screen name="two" options={{ href: null }} />
    </Tabs>
  );
}
