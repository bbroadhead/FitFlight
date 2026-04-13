import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, BarChart3, RefreshCw, Users, MonitorPlay, MousePointerClick, TimerReset } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/lib/store';
import { fetchGoogleAnalyticsUsage, type GoogleAnalyticsUsageReport } from '@/lib/supabaseData';

function formatDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  return `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`;
}

function formatReportDate(dateKey: string) {
  if (dateKey.length !== 8) {
    return dateKey;
  }

  return `${dateKey.slice(4, 6)}/${dateKey.slice(6, 8)}`;
}

export default function AppUsageAnalyticsScreen() {
  const router = useRouter();
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);

  const [report, setReport] = useState<GoogleAnalyticsUsageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const canView = !!user && (
    user.accountType === 'fitflight_creator' ||
    user.accountType === 'ufpm' ||
    user.accountType === 'demo' ||
    user.accountType === 'squadron_leadership'
  );

  const loadReport = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
        setWarning(null);
      } else {
        setLoading(true);
        setError(null);
        setWarning(null);
      }

      const nextReport = await fetchGoogleAnalyticsUsage(accessToken ?? undefined);
      setReport(nextReport);
      setError(null);
      setWarning(null);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : 'Unable to load app usage analytics.';

      if (report) {
        setWarning(`${message} Showing last loaded data.`);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!canView) {
      return;
    }

    void loadReport();
  }, [canView]);

  const topEvents = useMemo(() => report?.events ?? [], [report]);
  const dailyPoints = useMemo(() => report?.daily ?? [], [report]);

  if (!canView) {
    return (
      <View className="flex-1 bg-af-navy items-center justify-center px-6">
        <Text className="text-white text-xl font-bold text-center">Admin access required</Text>
        <Text className="text-af-silver text-center mt-3">
          Only Owner, UFPM, Demo Role, and Squadron Leadership can view app usage analytics.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <LinearGradient
        colors={['#0A1628', '#001F5C', '#0A1628']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView edges={['top']} className="flex-1">
        <View className="px-6 pt-4 pb-2 flex-row items-center justify-between">
          <View className="flex-row items-center flex-1 pr-4">
            <Pressable
              onPress={() => router.back()}
              className="w-10 h-10 bg-white/10 rounded-full items-center justify-center mr-4"
            >
              <ArrowLeft size={20} color="#C0C0C0" />
            </Pressable>
            <View className="flex-1">
              <Text className="text-white text-2xl font-bold">App Usage Analytics</Text>
              <Text className="text-af-silver text-sm mt-1">
                {report?.rangeLabel ?? 'Google Analytics overview'}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              void loadReport(true);
            }}
            disabled={refreshing}
            className="w-10 h-10 bg-white/10 rounded-full items-center justify-center"
          >
            <RefreshCw size={18} color={refreshing ? '#6B7280' : '#4A90D9'} />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {loading && !report ? (
            <View className="mt-10 items-center justify-center">
              <ActivityIndicator color="#4A90D9" />
              <Text className="text-af-silver mt-3">Loading Google Analytics data...</Text>
            </View>
          ) : null}

          {error && !report ? (
            <View className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 p-5">
              <Text className="text-red-200 font-semibold">Unable to load analytics</Text>
              <Text className="text-red-100/90 text-sm mt-2">{error}</Text>
            </View>
          ) : null}

          {warning ? (
            <View className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5">
              <Text className="text-amber-100 font-semibold">Refresh issue</Text>
              <Text className="text-amber-50/90 text-sm mt-2">{warning}</Text>
            </View>
          ) : null}

          {report ? (
            <>
              <View className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <Text className="text-white font-semibold text-lg">Overview</Text>
                <Text className="text-af-silver text-xs mt-1">
                  Property {report.propertyId}{report.measurementId ? ` | ${report.measurementId}` : ''}
                </Text>

                <View className="flex-row flex-wrap mt-3">
                  <View className="w-1/2 pr-2 mb-3">
                    <View className="rounded-xl border border-white/10 bg-black/10 p-4">
                      <Users size={18} color="#4A90D9" />
                      <Text className="text-white text-2xl font-bold mt-2">{report.summary.activeUsers}</Text>
                      <Text className="text-af-silver text-xs mt-1">Active Users</Text>
                    </View>
                  </View>
                  <View className="w-1/2 pl-2 mb-3">
                    <View className="rounded-xl border border-white/10 bg-black/10 p-4">
                      <BarChart3 size={18} color="#22C55E" />
                      <Text className="text-white text-2xl font-bold mt-2">{report.summary.newUsers}</Text>
                      <Text className="text-af-silver text-xs mt-1">New Users</Text>
                    </View>
                  </View>
                  <View className="w-1/2 pr-2 mb-3">
                    <View className="rounded-xl border border-white/10 bg-black/10 p-4">
                      <MonitorPlay size={18} color="#A855F7" />
                      <Text className="text-white text-2xl font-bold mt-2">{report.summary.sessions}</Text>
                      <Text className="text-af-silver text-xs mt-1">Sessions</Text>
                    </View>
                  </View>
                  <View className="w-1/2 pl-2 mb-3">
                    <View className="rounded-xl border border-white/10 bg-black/10 p-4">
                      <MousePointerClick size={18} color="#F59E0B" />
                      <Text className="text-white text-2xl font-bold mt-2">{report.summary.screenPageViews}</Text>
                      <Text className="text-af-silver text-xs mt-1">Page Views</Text>
                    </View>
                  </View>
                </View>

                <View className="flex-row rounded-xl border border-white/10 bg-black/10 p-4 mt-1">
                  <View className="flex-1">
                    <Text className="text-af-silver text-xs">Engaged Sessions</Text>
                    <Text className="text-white font-semibold text-lg mt-1">{report.summary.engagedSessions}</Text>
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center">
                      <TimerReset size={16} color="#C0C0C0" />
                      <Text className="text-af-silver text-xs ml-2">Avg Session Duration</Text>
                    </View>
                    <Text className="text-white font-semibold text-lg mt-1">
                      {formatDuration(report.summary.averageSessionDuration)}
                    </Text>
                  </View>
                </View>
              </View>

              <View className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
                <Text className="text-white font-semibold text-lg">Tracked Events</Text>
                <Text className="text-af-silver text-xs mt-1">
                  Counts for the custom FitFlight events tracked in GA4.
                </Text>
                {topEvents.length === 0 ? (
                  <Text className="text-white/50 text-sm mt-4">No tracked events have been recorded yet.</Text>
                ) : (
                  topEvents.map((event) => (
                    <View key={event.eventName} className="mt-3 rounded-xl border border-white/10 bg-black/10 px-4 py-3">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-white font-semibold">{event.eventName}</Text>
                        <Text className="text-af-accent font-bold">{event.eventCount}</Text>
                      </View>
                      <Text className="text-af-silver text-xs mt-1">
                        {event.totalUsers} users triggered this event
                      </Text>
                    </View>
                  ))
                )}
              </View>

              <View className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
                <Text className="text-white font-semibold text-lg">Daily Activity</Text>
                <Text className="text-af-silver text-xs mt-1">
                  Last 30 days of app traffic from Google Analytics.
                </Text>
                {dailyPoints.length === 0 ? (
                  <Text className="text-white/50 text-sm mt-4">No daily activity data available yet.</Text>
                ) : (
                  dailyPoints.map((day) => (
                    <View
                      key={day.date}
                      className="mt-3 flex-row items-center justify-between rounded-xl border border-white/10 bg-black/10 px-4 py-3"
                    >
                      <Text className="text-white font-medium">{formatReportDate(day.date)}</Text>
                      <View className="items-end">
                        <Text className="text-af-accent text-sm font-semibold">{day.sessions} sessions</Text>
                        <Text className="text-af-silver text-xs">{day.activeUsers} active users</Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
