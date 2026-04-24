import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useEffect } from 'react';
import { Image, ScrollView, Text, TextInput, View } from 'react-native';
import { useAuthStore, useMemberStore, ALL_ACHIEVEMENTS } from '@/lib/store';
import { formatErrorLogRouteLabel, recordAppError, useErrorLogStore } from '@/lib/errorLog';
import { getAppThemePalette, useAppTheme } from '@/lib/theme';
import { AchievementCelebration } from '@/components/AchievementCelebration';
import { TutorialTourProvider } from '@/contexts/TutorialTourContext';

export const unstable_settings = {
  initialRouteName: 'login',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const recentAchievementId = useMemberStore((state) => state.recentAchievementId);
  const dismissAchievementCelebration = useMemberStore((state) => state.dismissAchievementCelebration);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const theme = useAppTheme();
  const pathname = usePathname();
  const setCurrentRouteLabel = useErrorLogStore((state) => state.setCurrentRouteLabel);

  const navigationTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: theme.background,
      card: theme.background,
      border: theme.border,
      primary: theme.accent,
    },
  };

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    setCurrentRouteLabel(formatErrorLogRouteLabel(pathname));
  }, [pathname, setCurrentRouteLabel]);

  const recentAchievement = recentAchievementId
    ? ALL_ACHIEVEMENTS.find((achievement) => achievement.id === recentAchievementId) ?? null
    : null;

  return (
    <ThemeProvider value={navigationTheme}>
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
          <Stack.Screen name="bulk-pfra-entry" options={{ headerShown: false }} />
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
  const fallbackTheme = getAppThemePalette('default');
  useEffect(() => {
    recordAppError({ source: 'boundary', error });
  }, [error]);
  return (
    <View style={{ flex: 1, backgroundColor: fallbackTheme.background, paddingHorizontal: 24, paddingVertical: 40, alignItems: 'center', justifyContent: 'center' }}>
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
  const theme = useAppTheme();

  useEffect(() => {
    const TextComponent = Text as typeof Text & { defaultProps?: Record<string, unknown> };
    const TextInputComponent = TextInput as typeof TextInput & { defaultProps?: Record<string, unknown> };
    const originalTextDefaultProps = TextComponent.defaultProps ?? {};
    const originalTextInputDefaultProps = TextInputComponent.defaultProps ?? {};

    if (theme.id === 'pixel' && theme.bodyFontFamily) {
      TextComponent.defaultProps = {
        ...originalTextDefaultProps,
        style: [originalTextDefaultProps.style, { fontFamily: theme.bodyFontFamily }],
      };
      TextInputComponent.defaultProps = {
        ...originalTextInputDefaultProps,
        style: [originalTextInputDefaultProps.style, { fontFamily: theme.bodyFontFamily }],
      };
    } else {
      TextComponent.defaultProps = originalTextDefaultProps;
      TextInputComponent.defaultProps = originalTextInputDefaultProps;
    }

    return () => {
      TextComponent.defaultProps = originalTextDefaultProps;
      TextInputComponent.defaultProps = originalTextInputDefaultProps;
    };
  }, [theme.bodyFontFamily, theme.id]);

  useEffect(() => {
    const originalConsoleError = console.error;

    console.error = (...args: unknown[]) => {
      const firstError = args.find((value) => value instanceof Error);
      const message = args
        .map((value) => {
          if (value instanceof Error) {
            return value.message;
          }
          if (typeof value === 'string') {
            return value;
          }

          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        })
        .filter(Boolean)
        .join(' ');

      recordAppError({
        source: 'console',
        error: firstError,
        message,
      });

      originalConsoleError(...args);
    };

    if (typeof window === 'undefined') {
      return () => {
        console.error = originalConsoleError;
      };
    }

    const handleWindowError = (event: ErrorEvent) => {
      recordAppError({
        source: 'window',
        error: event.error,
        message: event.message,
        stack: event.error?.stack,
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      recordAppError({
        source: 'promise',
        error: event.reason,
        message: event.reason instanceof Error ? event.reason.message : 'Unhandled promise rejection',
      });
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      console.error = originalConsoleError;
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <StatusBar style={theme.statusBar} />
          <RootLayoutNav />
        </KeyboardProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
