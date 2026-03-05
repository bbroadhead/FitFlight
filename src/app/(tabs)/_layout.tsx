import React from 'react';
import { View } from 'react-native';
import { withLayoutContext } from 'expo-router';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { Trophy, ClipboardList, Calculator, Settings, Dumbbell } from 'lucide-react-native';

const { Navigator } = createMaterialTopTabNavigator();
const Tabs = withLayoutContext(Navigator);

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

        tabBarActiveTintColor: '#4A90D9',
        tabBarInactiveTintColor: '#A0A0A0',
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'rgba(10, 22, 40, 0.95)',
          borderTopColor: 'rgba(255, 255, 255, 0.1)',
          borderTopWidth: 1,
          height: 85,
          paddingTop: 10,
          paddingBottom: 25,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          textTransform: 'none',
        },
        tabBarIndicatorStyle: {
          // Hide the usual “top tabs” indicator line
          height: 0,
        },
        tabBarBackground: () => <View className="absolute inset-0 bg-af-navy/95" />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Leaderboard',
          tabBarIcon: ({ color, focused }) => (
            <View className={focused ? 'bg-af-accent/20 p-2 rounded-xl' : 'p-2'}>
              <Trophy size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="workouts"
        options={{
          title: 'Workouts',
          tabBarIcon: ({ color, focused }) => (
            <View className={focused ? 'bg-af-accent/20 p-2 rounded-xl' : 'p-2'}>
              <Dumbbell size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Attendance',
          tabBarIcon: ({ color, focused }) => (
            <View className={focused ? 'bg-af-accent/20 p-2 rounded-xl' : 'p-2'}>
              <ClipboardList size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="calculator"
        options={{
          title: 'Calculator',
          tabBarIcon: ({ color, focused }) => (
            <View className={focused ? 'bg-af-accent/20 p-2 rounded-xl' : 'p-2'}>
              <Calculator size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <View className={focused ? 'bg-af-accent/20 p-2 rounded-xl' : 'p-2'}>
              <Settings size={22} color={color} />
            </View>
          ),
        }}
      />

      {/* Hidden route used elsewhere in the app */}
      <Tabs.Screen name="two" options={{ href: null }} />
    </Tabs>
  );
}
