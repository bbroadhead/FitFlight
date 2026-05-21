import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, BarChart3, RefreshCw, Users, MonitorPlay, MousePointerClick, TimerReset } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/lib/store';
import { fetchGoogleAnalyticsUsage, type GoogleAnalyticsUsageReport } from '@/lib/supabaseData';
import { PageContainer } from '@/components/PageContainer';
import { ThemeBackdrop } from '@/components/ThemeBackdrop';
import { ThemeChrome } from '@/components/ThemeChrome';
import { getThemeBodyStyle, getThemeControlStyle, getThemeHeadingStyle, useAppTheme } from '@/lib/theme';

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

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

export default function AppUsageAnalyticsScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);

  const [report, setReport] = useState<GoogleAnalyticsUsageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const contentMaxWidth = width >= 1440 ? 1240 : width >= 1180 ? 1100 : 960;

  const canView = !!user && (
    user.accountType === 'fitflight_creator' ||
    user.accountType === 'ufpm' ||
    user.accountType === 'demo' ||
    user.accountType === 'squadron_leadership' ||
    user.accountType === 'group_personnel'
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

      const nextReport = await fetchGoogleAnalyticsUsage(accessToken ?? undefined, user?.squadron);
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
  const loginPercent = clampPercent(report?.rosterSummary.loggedInPercentage ?? 0);
  const loginProgress = `${loginPercent}%`;

  if (!canView) {
    return (
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: theme.background }}>
        <ThemeBackdrop />
        <Text style={[getThemeHeadingStyle(theme, 24), { textAlign: 'center' }]}>Admin access required</Text>
        <Text style={[getThemeBodyStyle(theme, 15), { textAlign: 'center', marginTop: 12 }]}>
          Only Owner, UFPM, Demo Role, Squadron Leadership, and Group Personnel can view app usage analytics.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <ThemeBackdrop />

      <SafeAreaView edges={['top']} className="flex-1">
        <View className="px-6 pt-4 pb-2 flex-row items-center justify-between">
          <View className="flex-row items-center flex-1 pr-4">
            <Pressable
              onPress={() => router.back()}
              className="w-10 h-10 rounded-full items-center justify-center mr-4"
              style={getThemeControlStyle(theme)}
            >
              <ArrowLeft size={20} color={theme.textSecondary} />
            </Pressable>
            <View className="flex-1">
              <Text style={getThemeHeadingStyle(theme, 26)}>App Usage Analytics</Text>
              <Text style={[getThemeBodyStyle(theme, 14), { marginTop: 4 }]}>
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
            className="w-10 h-10 rounded-full items-center justify-center"
            style={getThemeControlStyle(theme)}
          >
            <RefreshCw size={18} color={refreshing ? theme.textMuted : theme.accent} />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40, alignItems: 'center' }}
          showsVerticalScrollIndicator={false}
        >
          <PageContainer maxWidth={contentMaxWidth} className="px-6">
          {loading && !report ? (
            <View className="mt-10 items-center justify-center">
              <ActivityIndicator color={theme.accent} />
              <Text style={[getThemeBodyStyle(theme, 14), { marginTop: 12 }]}>Loading Google Analytics data...</Text>
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
              <ThemeChrome theme={theme} variant="feature" style={{ marginTop: 16 }}>
              <View className="p-4">
                <Text className="text-white font-semibold text-lg">Login Adoption</Text>
                <Text className="text-af-silver text-xs mt-1">
                  Supabase roster status for {report.rosterSummary.squadron}.
                </Text>

                <View className={width >= 1180 ? 'mt-4 flex-row items-center' : 'mt-4'}>
                  <View className={width >= 1180 ? 'pr-4' : ''} style={width >= 1180 ? { width: 220 } : { alignItems: 'center' }}>
                    <View
                      className="items-center justify-center rounded-full border-4"
                      style={{
                        width: 140,
                        height: 140,
                        borderColor: `${theme.accent}AA`,
                        backgroundColor: 'rgba(255,255,255,0.04)',
                      }}
                    >
                      <Text style={getThemeHeadingStyle(theme, 30)}>{loginPercent}%</Text>
                    </View>
                    <Text style={[getThemeBodyStyle(theme, 13, theme.textSecondary), { marginTop: 14, textAlign: 'center' }]}>
                      Members logged in at least once:
                    </Text>
                    <Text style={[getThemeHeadingStyle(theme, 18), { marginTop: 4, textAlign: 'center' }]}>
                      {report.rosterSummary.loggedInMembers} / {report.rosterSummary.totalMembers}
                    </Text>
                  </View>

                  <View className={width >= 1180 ? 'flex-1 flex-row flex-wrap' : 'mt-5 flex-row flex-wrap'} style={{ rowGap: 12 }}>
                    <View className="w-1/2 pr-2">
                      <View className="rounded-xl border border-white/10 bg-black/10 p-4">
                        <Text className="text-af-silver text-xs">Never Logged In</Text>
                        <Text className="text-white text-2xl font-bold mt-2">{report.rosterSummary.neverLoggedInMembers}</Text>
                      </View>
                    </View>
                    <View className="w-1/2 pl-2">
                      <View className="rounded-xl border border-white/10 bg-black/10 p-4">
                        <Text className="text-af-silver text-xs">Linked Accounts</Text>
                        <Text className="text-white text-2xl font-bold mt-2">{report.rosterSummary.linkedAuthMembers}</Text>
                      </View>
                    </View>
                    <View className="w-1/2 pr-2">
                      <View className="rounded-xl border border-white/10 bg-black/10 p-4">
                        <Text className="text-af-silver text-xs">Strava Connected</Text>
                        <Text className="text-white text-2xl font-bold mt-2">{report.rosterSummary.stravaConnectedMembers}</Text>
                      </View>
                    </View>
                    <View className="w-1/2 pl-2">
                      <View className="rounded-xl border border-white/10 bg-black/10 p-4">
                        <Text className="text-af-silver text-xs">GA Active Users</Text>
                        <Text className="text-white text-2xl font-bold mt-2">{report.summary.activeUsers}</Text>
                        <Text className="text-af-silver text-[11px] mt-1">{report.rangeLabel}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
              </ThemeChrome>

              <ThemeChrome theme={theme} variant="feature" style={{ marginTop: 16 }}>
              <View className="p-4">
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
                      <Text className="text-white text-2xl font-bold mt-2">{report.summary.eventCount}</Text>
                      <Text className="text-af-silver text-xs mt-1">Event Count</Text>
                    </View>
                  </View>
                </View>

                <View className="flex-row rounded-xl border border-white/10 bg-black/10 p-4 mt-1">
                  <View className="flex-1">
                    <Text className="text-af-silver text-xs">Page Views</Text>
                    <Text className="text-white font-semibold text-lg mt-1">{report.summary.screenPageViews}</Text>
                  </View>
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
              </ThemeChrome>

              <ThemeChrome theme={theme} style={{ marginTop: 24 }}>
              <View className="p-4">
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
              </ThemeChrome>

              <ThemeChrome theme={theme} style={{ marginTop: 24 }}>
              <View className="p-4">
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
              </ThemeChrome>
            </>
          ) : null}
          </PageContainer>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
