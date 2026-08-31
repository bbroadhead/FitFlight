import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Lock, CheckCircle2, AlertCircle } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ThemeBackdrop } from '@/components/ThemeBackdrop';
import { ThemeChrome } from '@/components/ThemeChrome';
import { clearUrlHashSession, readSessionFromUrlHash, updatePassword } from '@/lib/supabaseAuth';
import { useAuthStore, useMemberStore } from '@/lib/store';
import { updateRosterPasswordStatus } from '@/lib/supabaseData';
import { getThemeBodyStyle, getThemeButtonStyle, getThemeButtonTextStyle, getThemeControlStyle, getThemeHeadingStyle, useAppTheme } from '@/lib/theme';

const DEMO_ACCOUNT_EMAIL = 'fitflight@us.af.mil';

export default function ResetPasswordScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const authUser = useAuthStore((state) => state.user);
  const storedAccessToken = useAuthStore((state) => state.accessToken);
  const updateUser = useAuthStore((state) => state.updateUser);
  const updateMember = useMemberStore((state) => state.updateMember);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const isFirstLoginPasswordChange = useMemo(() => params.mode === 'first-login', [params.mode]);
  const isDemoAccount = authUser?.accountType === 'demo' || authUser?.email?.trim().toLowerCase() === DEMO_ACCOUNT_EMAIL;

  useEffect(() => {
    if (!isFirstLoginPasswordChange || !isDemoAccount) {
      return;
    }

    router.replace('/');
  }, [isDemoAccount, isFirstLoginPasswordChange, router]);

  useEffect(() => {
    const sessionFromHash = readSessionFromUrlHash();
    if (sessionFromHash?.accessToken) {
      setAccessToken(sessionFromHash.accessToken);
      clearUrlHashSession();
      return;
    }

    if (isFirstLoginPasswordChange && storedAccessToken) {
      setAccessToken(storedAccessToken);
      return;
    }

    if (!sessionFromHash?.accessToken) {
      setError('This password reset link is invalid or expired. Request a new reset email from the sign-in screen.');
      return;
    }
  }, [isFirstLoginPasswordChange, storedAccessToken]);

  const handleContinueToFitFlight = () => {
    const run = async () => {
      if (!isFirstLoginPasswordChange || !authUser?.email || !accessToken) {
        router.replace(authUser?.hasLoggedIntoApp ? '/' : '/welcome');
        return;
      }

      await updateRosterPasswordStatus(
        authUser.email,
        {
          mustChangePassword: false,
        },
        accessToken,
        authUser.squadron
      ).catch(() => undefined);

      updateUser({
        mustChangePassword: false,
      });
      updateMember(authUser.id, {
        mustChangePassword: false,
      });

      router.replace(authUser.hasLoggedIntoApp ? '/' : '/welcome');
    };

    run().catch(() => {
      router.replace(authUser?.hasLoggedIntoApp ? '/' : '/welcome');
    });
  };

  const handleUpdatePassword = () => {
    const run = async () => {
      setError('');
      setSuccess('');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (!accessToken) {
        setError('This password reset session is no longer available. Request a new reset email.');
        return;
      }

      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }

      await updatePassword(accessToken, password);
      if (isFirstLoginPasswordChange && authUser?.email) {
        await updateRosterPasswordStatus(
          authUser.email,
          {
            mustChangePassword: false,
          },
          accessToken,
          authUser.squadron
        ).catch(() => undefined);

        updateUser({
          mustChangePassword: false,
        });
        updateMember(authUser.id, {
          mustChangePassword: false,
        });
        setSuccess('Your password has been updated. Welcome to FitFlight.');
      } else {
        setSuccess('Your password has been updated. You can sign in now.');
      }

      setPassword('');
      setConfirmPassword('');
    };

    run().catch((updateError) => {
      setError(
        updateError instanceof Error
          ? updateError.message
          : 'Unable to update password.'
      );
    });
  };

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <ThemeBackdrop />

      <SafeAreaView className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View entering={FadeInDown.delay(100).springify()} className="items-center mb-8">
              <Text style={getThemeHeadingStyle(theme, 30)}>Reset Password</Text>
              <Text style={[getThemeBodyStyle(theme, 16), { marginTop: 8, textAlign: 'center' }]}>
                Set a new password for your FitFlight account.
              </Text>
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(200).springify()}>
            <ThemeChrome theme={theme} variant="feature">
            <View className="p-6">
              {error ? (
                <View className="flex-row items-center bg-red-500/20 border border-red-500/50 rounded-xl px-4 py-3 mb-4">
                  <AlertCircle size={18} color="#EF4444" />
                  <Text className="text-red-400 ml-2 flex-1">{error}</Text>
                </View>
              ) : null}

              {success ? (
                <View className="flex-row items-center bg-emerald-500/20 border border-emerald-400/40 rounded-xl px-4 py-3 mb-4">
                  <CheckCircle2 size={18} color="#34D399" />
                  <Text className="text-emerald-200 ml-2 flex-1">{success}</Text>
                </View>
              ) : null}

              <View className="mb-4">
                <Text style={[getThemeBodyStyle(theme, 14, theme.textMuted), { marginBottom: 8, marginLeft: 4 }]}>New Password</Text>
                <View className="flex-row items-center px-4 py-3" style={getThemeControlStyle(theme)}>
                  <Lock size={20} color={theme.textSecondary} />
                  <TextInput
                    placeholder="Enter new password"
                    placeholderTextColor={theme.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    className="flex-1 ml-3 text-base"
                    style={{ color: theme.textPrimary }}
                  />
                </View>
              </View>

              <View className="mb-6">
                <Text style={[getThemeBodyStyle(theme, 14, theme.textMuted), { marginBottom: 8, marginLeft: 4 }]}>Confirm Password</Text>
                <View className="flex-row items-center px-4 py-3" style={getThemeControlStyle(theme)}>
                  <Lock size={20} color={theme.textSecondary} />
                  <TextInput
                    placeholder="Confirm new password"
                    placeholderTextColor={theme.textMuted}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    className="flex-1 ml-3 text-base"
                    style={{ color: theme.textPrimary }}
                  />
                </View>
              </View>

              <Pressable
                onPress={handleUpdatePassword}
                className="py-4 items-center justify-center active:opacity-80 mb-3"
                style={getThemeButtonStyle(theme, 'accent')}
              >
                <Text style={getThemeButtonTextStyle(theme, 'accent')}>Update Password</Text>
              </Pressable>

              {isFirstLoginPasswordChange ? (
                <Pressable
                  onPress={handleContinueToFitFlight}
                  className="py-4 items-center justify-center active:opacity-80"
                  style={getThemeButtonStyle(theme, 'secondary')}
                >
                  <Text style={getThemeButtonTextStyle(theme, 'secondary')}>Continue to FitFlight</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => router.replace('/login')}
                  className="py-4 items-center justify-center active:opacity-80"
                  style={getThemeButtonStyle(theme, 'secondary')}
                >
                  <Text style={getThemeButtonTextStyle(theme, 'secondary')}>Back to Sign In</Text>
                </Pressable>
              )}
            </View>
            </ThemeChrome>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
