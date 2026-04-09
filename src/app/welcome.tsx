import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import { useTutorialTour } from '@/contexts/TutorialTourContext';

export default function WelcomeScreen() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasCheckedAuth = useAuthStore((state) => state.hasCheckedAuth);
  const { startTutorial } = useTutorialTour();
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (isAuthenticated && user && !hasStartedRef.current) {
      hasStartedRef.current = true;
      startTutorial();
    }
  }, [isAuthenticated, startTutorial, user]);

  if (hasCheckedAuth && !isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return (
    <View className="flex-1">
      <LinearGradient
        colors={['#0A1628', '#001F5C', '#0A1628']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView className="flex-1 items-center justify-center px-8">
        <ActivityIndicator size="large" color="#4A90D9" />
        <Text className="text-white text-2xl font-bold mt-6 text-center">Starting Your Guided Tour</Text>
        <Text className="text-af-silver text-center mt-3 leading-6">
          FitFlight is loading the live walkthrough and moving you to each feature as it is highlighted.
        </Text>
      </SafeAreaView>
    </View>
  );
}
