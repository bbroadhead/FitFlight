import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useEffect } from 'react';
import { useMemberStore, ALL_ACHIEVEMENTS } from '@/lib/store';
import { AchievementCelebration } from '@/components/AchievementCelebration';

export const unstable_settings = {
  initialRouteName: 'login',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Custom dark theme for Air Force aesthetic
const AirForceDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#0A1628',
    card: '#0A1628',
    border: 'rgba(255, 255, 255, 0.1)',
    primary: '#4A90D9',
  },
};

function RootLayoutNav() {
  const recentAchievementId = useMemberStore((state) => state.recentAchievementId);
  const dismissAchievementCelebration = useMemberStore((state) => state.dismissAchievementCelebration);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  const recentAchievement = recentAchievementId
    ? ALL_ACHIEVEMENTS.find((achievement) => achievement.id === recentAchievementId) ?? null
    : null;

  return (
    <ThemeProvider value={AirForceDarkTheme}>
      <>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="reset-password" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="member-profile" options={{ headerShown: false }} />
          <Stack.Screen name="analytics" options={{ headerShown: false }} />
          <Stack.Screen name="add-workout" options={{ headerShown: false }} />
          <Stack.Screen name="schedule-session" options={{ headerShown: false }} />
          <Stack.Screen name="upload-fitness" options={{ headerShown: false }} />
          <Stack.Screen name="cross-squadron" options={{ headerShown: false }} />
          <Stack.Screen name="import-roster" options={{ headerShown: false }} />
          <Stack.Screen name="resources" options={{ headerShown: false }} />
          <Stack.Screen name="leaderboard" options={{ headerShown: false }} />
          <Stack.Screen name="integrations/strava-callback" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>
        {recentAchievement ? (
          <AchievementCelebration
            achievement={recentAchievement}
            onDismiss={dismissAchievementCelebration}
          />
        ) : null}
      </>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <StatusBar style="light" />
          <RootLayoutNav />
        </KeyboardProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
