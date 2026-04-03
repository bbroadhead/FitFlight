import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Activity, CheckCircle2, CircleAlert } from 'lucide-react-native';
import { type IntegrationService, useAuthStore, useMemberStore } from '@/lib/store';
import { consumePendingStravaOAuth, exchangeStravaCode, mapImportedWorkouts } from '@/lib/strava';

export default function StravaCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const members = useMemberStore((state) => state.members);
  const updateMember = useMemberStore((state) => state.updateMember);
  const importWorkouts = useMemberStore((state) => state.importWorkouts);

  const [status, setStatus] = useState<'working' | 'success' | 'error'>('working');
  const [message, setMessage] = useState('Connecting your Strava account...');

  useEffect(() => {
    let isMounted = true;

    const completeStravaConnection = async () => {
      try {
        if (!user) {
          throw new Error('Please sign in to FitFlight before completing the Strava connection.');
        }

        if (params.error) {
          throw new Error('Strava authorization was cancelled or denied.');
        }

        if (!params.code || !params.state) {
          throw new Error('The Strava callback is missing the required authorization details.');
        }

        const pending = consumePendingStravaOAuth();
        if (!pending.state || pending.state !== params.state) {
          throw new Error('The Strava callback state did not match. Please try connecting again.');
        }

        const result = await exchangeStravaCode({
          code: params.code,
          state: params.state,
          userId: pending.userId || user.id,
          email: pending.email || user.email,
        });

        importWorkouts(user.id, mapImportedWorkouts(result.workouts));

        const currentIntegrations: IntegrationService[] = user.connectedIntegrations ?? [];
        const nextIntegrations: IntegrationService[] = currentIntegrations.includes('strava')
          ? currentIntegrations
          : [...currentIntegrations, 'strava'];

        updateUser({
          connectedIntegrations: nextIntegrations,
          integrationConnections: {
            ...(user.integrationConnections ?? {}),
            strava: result.connection,
          },
        });

        const currentMember = members.find((member) => member.id === user.id);
        updateMember(user.id, {
          connectedApps: currentMember?.connectedApps?.includes('strava')
            ? (currentMember.connectedApps ?? [])
            : [...(currentMember?.connectedApps ?? []), 'strava'],
        });

        if (!isMounted) {
          return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setStatus('success');
        setMessage(
          result.workouts.length > 0
            ? `Strava connected. Imported ${result.workouts.length} workout${result.workouts.length === 1 ? '' : 's'}.`
            : 'Strava connected successfully.'
        );

        window.setTimeout(() => {
          router.replace('/(tabs)/profile');
        }, 1200);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Unable to finish the Strava connection.');
      }
    };

    completeStravaConnection();

    return () => {
      isMounted = false;
    };
  }, [importWorkouts, members, params.code, params.error, params.state, router, updateMember, updateUser, user]);

  return (
    <View className="flex-1">
      <LinearGradient
        colors={['#0A1628', '#001F5C', '#0A1628']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView className="flex-1 px-6">
        <View className="flex-1 items-center justify-center">
          <View className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 items-center">
            {status === 'working' && <Activity size={36} color="#F97316" />}
            {status === 'success' && <CheckCircle2 size={36} color="#22C55E" />}
            {status === 'error' && <CircleAlert size={36} color="#EF4444" />}

            <Text className="mt-5 text-white text-2xl font-bold">
              {status === 'working' ? 'Connecting Strava' : status === 'success' ? 'Strava Connected' : 'Connection Failed'}
            </Text>
            <Text className="mt-3 text-af-silver text-center">{message}</Text>

            {status !== 'working' && (
              <Pressable
                onPress={() => router.replace('/(tabs)/profile')}
                className="mt-6 rounded-xl bg-white/10 px-5 py-3"
              >
                <Text className="text-white font-semibold">Back to Profile</Text>
              </Pressable>
            )}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
