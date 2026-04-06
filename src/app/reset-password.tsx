import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Lock, CheckCircle2, AlertCircle } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { clearUrlHashSession, readSessionFromUrlHash, updatePassword } from '@/lib/supabaseAuth';
import { useAuthStore, useMemberStore } from '@/lib/store';
import { updateRosterPasswordStatus } from '@/lib/supabaseData';

export default function ResetPasswordScreen() {
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
          accessToken
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
    <View className="flex-1">
      <LinearGradient
        colors={['#0A1628', '#00308F', '#1E4FAD']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

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
              <Text className="text-3xl font-bold text-white">Reset Password</Text>
              <Text className="text-af-silver text-base mt-2 text-center">
                Set a new password for your FitFlight account.
              </Text>
            </Animated.View>

            <Animated.View
              entering={FadeInUp.delay(200).springify()}
              className="bg-white/10 rounded-3xl p-6 border border-white/20"
            >
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
                <Text className="text-white/60 text-sm mb-2 ml-1">New Password</Text>
                <View className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10">
                  <Lock size={20} color="#C0C0C0" />
                  <TextInput
                    placeholder="Enter new password"
                    placeholderTextColor="#ffffff40"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    className="flex-1 ml-3 text-white text-base"
                  />
                </View>
              </View>

              <View className="mb-6">
                <Text className="text-white/60 text-sm mb-2 ml-1">Confirm Password</Text>
                <View className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10">
                  <Lock size={20} color="#C0C0C0" />
                  <TextInput
                    placeholder="Confirm new password"
                    placeholderTextColor="#ffffff40"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    className="flex-1 ml-3 text-white text-base"
                  />
                </View>
              </View>

              <Pressable
                onPress={handleUpdatePassword}
                className="bg-af-accent py-4 rounded-xl items-center justify-center active:opacity-80 mb-3"
              >
                <Text className="text-white font-bold text-lg">Update Password</Text>
              </Pressable>

              {isFirstLoginPasswordChange ? (
                <Pressable
                  onPress={() => router.replace(authUser?.hasLoggedIntoApp ? '/(tabs)' : '/welcome')}
                  className="bg-white/10 py-4 rounded-xl items-center justify-center active:opacity-80"
                >
                  <Text className="text-white font-semibold">Continue to FitFlight</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => router.replace('/login')}
                  className="bg-white/10 py-4 rounded-xl items-center justify-center active:opacity-80"
                >
                  <Text className="text-white font-semibold">Back to Sign In</Text>
                </Pressable>
              )}
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
