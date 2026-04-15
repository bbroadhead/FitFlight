import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useEffect } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { useAuthStore, useMemberStore, ALL_ACHIEVEMENTS } from '@/lib/store';
import { AchievementCelebration } from '@/components/AchievementCelebration';
import { TutorialTourProvider } from '@/contexts/TutorialTourContext';

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
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const markAchievementCelebrationSeen = useAuthStore((state) => state.markAchievementCelebrationSeen);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    if (!recentAchievementId || !user?.email) {
      return;
    }

    markAchievementCelebrationSeen(user.email, recentAchievementId);
  }, [markAchievementCelebrationSeen, recentAchievementId, user?.email]);

  const recentAchievement = recentAchievementId
    ? ALL_ACHIEVEMENTS.find((achievement) => achievement.id === recentAchievementId) ?? null
    : null;

  return (
    <ThemeProvider value={AirForceDarkTheme}>
      <TutorialTourProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="demo" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="reset-password" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="member-profile" options={{ headerShown: false }} />
          <Stack.Screen name="analytics" options={{ headerShown: false }} />
          <Stack.Screen name="personal-analytics" options={{ headerShown: false }} />
          <Stack.Screen name="app-usage-analytics" options={{ headerShown: false }} />
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
        {isAuthenticated && recentAchievement ? (
          <AchievementCelebration
            achievement={recentAchievement}
            onDismiss={dismissAchievementCelebration}
          />
        ) : null}
      </TutorialTourProvider>
    </ThemeProvider>
  );
}

export function ErrorBoundary({ error }: { error: Error }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#0A1628', paddingHorizontal: 24, paddingVertical: 40, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: '100%', maxWidth: 520, alignItems: 'center' }}>
        <View
          style={{
            width: 96,
            height: 96,
            borderRadius: 28,
            backgroundColor: 'rgba(255,255,255,0.08)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.14)',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            marginBottom: 28,
          }}
        >
          <Image
            source={require('../../assets/images/TotalFlight_Icon_Resized.png')}
            style={{ width: '72%', height: '72%' }}
            resizeMode="contain"
          />
        </View>
        <Text style={{ color: '#FFFFFF', fontSize: 28, fontWeight: '700', textAlign: 'center' }}>
          There was an issue.
        </Text>
        <Text style={{ color: '#C0C0C0', fontSize: 16, lineHeight: 24, textAlign: 'center', marginTop: 14 }}>
          Please report this error message to SSgt Benjamin Broadhead - benjamin.broadhead.2@us.af.mil
        </Text>
        <ScrollView
          style={{
            marginTop: 28,
            width: '100%',
            maxHeight: 220,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.1)',
            backgroundColor: 'rgba(255,255,255,0.04)',
            padding: 16,
          }}
          contentContainerStyle={{ paddingBottom: 4 }}
        >
          <Text style={{ color: '#FCA5A5', fontSize: 13, lineHeight: 20 }}>
            {error?.message || 'Unknown error'}
          </Text>
        </ScrollView>
      </View>
    </View>
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
