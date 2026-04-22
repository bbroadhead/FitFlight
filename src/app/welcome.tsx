import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import { useTutorialTour } from '@/contexts/TutorialTourContext';
import { ThemeBackdrop } from '@/components/ThemeBackdrop';
import { getThemeBodyStyle, getThemeHeadingStyle, useAppTheme } from '@/lib/theme';

export default function WelcomeScreen() {
  const theme = useAppTheme();
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
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <ThemeBackdrop />

      <SafeAreaView className="flex-1 items-center justify-center px-8">
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={[getThemeHeadingStyle(theme, 28), { marginTop: 24, textAlign: 'center' }]}>Starting Your Guided Tour</Text>
        <Text style={[getThemeBodyStyle(theme, 16), { textAlign: 'center', marginTop: 12, lineHeight: 24 }]}>
          FitFlight is loading the live walkthrough and moving you to each feature as it is highlighted.
        </Text>
      </SafeAreaView>
    </View>
  );
}
