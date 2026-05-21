import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { AlertTriangle, Check, ChevronRight, Users, WifiOff, X } from 'lucide-react-native';

import { formatMilitarySyncTime, useAppSyncStore } from '@/lib/appSync';
import { DEFAULT_SQUADRON, GROUP_SQUADRON, type Squadron, normalizeSquadron, shouldIncludeFlightInSquadronRollups, useAuthStore, useMemberStore } from '@/lib/store';
import { useErrorLogStore } from '@/lib/errorLog';
import { ThemeChrome } from '@/components/ThemeChrome';
import { getThemeBodyStyle, getThemeHeadingStyle, useAppTheme } from '@/lib/theme';
import { getMemberMonthSummary, getMonthKey } from '@/lib/monthlyStats';
import { canAccessOrganizationActivity, getOrganizationChartNodes, getOrganizationContextLabel, getOrganizationMeta, getStatusBarOrganizationLabel } from '@/lib/organization';

export function TopStatusBar({
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  const theme = useAppTheme();
  const user = useAuthStore((state) => state.user);
  const members = useMemberStore((state) => state.members);
  const ptSessions = useMemberStore((state) => state.ptSessions);
  const isOnline = useAppSyncStore((state) => state.isOnline);
  const syncIndicator = useAppSyncStore((state) => state.syncIndicator);
  const lastSyncedAt = useAppSyncStore((state) => state.lastSyncedAt);
  const queuedActions = useAppSyncStore((state) => state.queuedActions);
  const errorEntries = useErrorLogStore((state) => state.entries);
  const clearEntries = useErrorLogStore((state) => state.clearEntries);
  const [showErrorLog, setShowErrorLog] = useState(false);
  const [showOrganizationPanel, setShowOrganizationPanel] = useState(false);
  const subtitleSquadron = normalizeSquadron((subtitle ?? '').replace(/\s+(Squadron|Group)$/i, ''), normalizeSquadron(user?.squadron, DEFAULT_SQUADRON));
  const currentOrganization = subtitle ? subtitleSquadron : normalizeSquadron(user?.squadron, DEFAULT_SQUADRON);
  const [selectedOrganization, setSelectedOrganization] = useState<Squadron>(currentOrganization);
  const squadronLabel = getStatusBarOrganizationLabel(currentOrganization);
  const currentOrganizationMeta = getOrganizationMeta(currentOrganization);
  const normalizedUserSquadron = normalizeSquadron(user?.squadron, DEFAULT_SQUADRON);
  const canViewErrorLog = user?.accountType === 'fitflight_creator' || user?.accountType === 'ufpm';
  const canViewAllOrganizationActivity = user?.accountType === 'fitflight_creator' || normalizedUserSquadron === GROUP_SQUADRON;
  const reversedErrorEntries = useMemo(() => [...errorEntries].reverse(), [errorEntries]);
  const isDefaultTheme = theme.id === 'default';
  const statusSecondaryColor = isDefaultTheme ? theme.accent : theme.textSecondary;
  const statusPrimaryColor = isDefaultTheme ? theme.textSecondary : theme.textPrimary;
  const statusMutedColor = isDefaultTheme ? theme.accent : theme.textMuted;
  const organizationChart = useMemo(() => getOrganizationChartNodes(), []);
  const currentMonthKey = getMonthKey();

  const organizationOverview = useMemo(() => {
    const buildSummary = (targetSquadron: Squadron) => {
      const isGroup = targetSquadron === GROUP_SQUADRON;
      const allowed = canAccessOrganizationActivity(normalizedUserSquadron, targetSquadron, user?.accountType);
      const scopedSquadrons = [targetSquadron];
      const scopedMembers = members.filter((member) =>
        scopedSquadrons.includes(member.squadron) &&
        shouldIncludeFlightInSquadronRollups(member.flight)
      );
      const scopedSessions = ptSessions.filter((session) => scopedSquadrons.includes(session.squadron ?? DEFAULT_SQUADRON));
      const totals = scopedMembers.reduce(
        (acc, member) => {
          const summary = getMemberMonthSummary(member, currentMonthKey, scopedSessions);
          acc.members += 1;
          acc.workouts += summary.workoutCount;
          acc.minutes += summary.minutes;
          acc.miles += summary.miles;
          return acc;
        },
        { members: 0, workouts: 0, minutes: 0, miles: 0 }
      );
      const childBreakdown = isGroup
        ? organizationChart.children.map((child) => {
            const childMembers = members.filter((member) => member.squadron === child.id && shouldIncludeFlightInSquadronRollups(member.flight));
            const childSessions = ptSessions.filter((session) => (session.squadron ?? DEFAULT_SQUADRON) === child.id);
            const childTotals = childMembers.reduce(
              (acc, member) => {
                const summary = getMemberMonthSummary(member, currentMonthKey, childSessions);
                acc.members += 1;
                acc.workouts += summary.workoutCount;
                acc.minutes += summary.minutes;
                acc.miles += summary.miles;
                return acc;
              },
              { members: 0, workouts: 0, minutes: 0, miles: 0 }
            );
            return {
              id: child.id,
              label: child.shortLabel,
              ...childTotals,
            };
          })
        : [];

      return {
        id: targetSquadron,
        allowed,
        label: getOrganizationContextLabel(targetSquadron),
        totals,
        childBreakdown,
      };
    };

    return {
      current: buildSummary(selectedOrganization),
      bySquadron: Object.fromEntries(
        [organizationChart.root.id, ...organizationChart.children.map((child) => child.id)].map((squadron) => [squadron, buildSummary(squadron)])
      ) as Record<Squadron, ReturnType<typeof buildSummary>>,
    };
  }, [currentMonthKey, members, normalizedUserSquadron, organizationChart, ptSessions, selectedOrganization, user?.accountType]);

  useEffect(() => {
    setSelectedOrganization(currentOrganization);
  }, [currentOrganization]);

  const statusContent = (() => {
    if (!isOnline) {
      return (
        <View className="flex-row items-center">
          <WifiOff size={12} color={statusSecondaryColor} />
          <Text style={[getThemeBodyStyle(theme, 11, statusSecondaryColor), { marginLeft: 5 }]}>
            {queuedActions.length > 0 ? `Offline · ${queuedActions.length} queued` : 'Offline'}
          </Text>
        </View>
      );
    }

    if (syncIndicator === 'syncing') {
      return (
        <View className="flex-row items-center">
          <View style={{ width: 12, height: 12, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="small" color={theme.accent} style={{ transform: [{ scale: 0.65 }] }} />
          </View>
          <Text style={[getThemeBodyStyle(theme, 11, theme.accent), { marginLeft: 6, fontWeight: '600' }]}>Syncing</Text>
        </View>
      );
    }

    if (syncIndicator === 'success') {
      return (
        <View className="flex-row items-center">
          <Check size={12} color="#22C55E" />
          <Text style={[getThemeBodyStyle(theme, 11, '#22C55E'), { marginLeft: 5, fontWeight: '600' }]}>Synced</Text>
        </View>
      );
    }

    return (
      <View className="flex-row items-center">
        <Text style={getThemeBodyStyle(theme, 11, statusMutedColor)}>Last synced at: </Text>
        <Text style={[getThemeBodyStyle(theme, 11, statusPrimaryColor), { fontWeight: '600' }]}>
          {formatMilitarySyncTime(lastSyncedAt)}
        </Text>
      </View>
    );
  })();

  return (
    <>
      <View
        className="px-6 py-1.5"
        style={{
          backgroundColor: theme.surfaceAlt,
          borderTopWidth: 1,
          borderTopColor: theme.border,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
          position: 'relative',
        }}
      >
        <View className="flex-row items-center justify-between" style={{ gap: 12 }}>
          <Pressable
            onPress={() => {
              setSelectedOrganization(currentOrganization);
              setShowOrganizationPanel(true);
            }}
            className="flex-1 flex-row items-center"
            hitSlop={8}
          >
            <Image
              source={currentOrganizationMeta.logo}
              style={{ width: 14, height: 14, borderRadius: 999 }}
              resizeMode="contain"
            />
            <Text style={[getThemeBodyStyle(theme, 11, statusSecondaryColor), { marginLeft: 6, fontWeight: '600' }]}>
              {squadronLabel}
            </Text>
            <ChevronRight size={12} color={statusSecondaryColor} style={{ marginLeft: 4 }} />
          </Pressable>
          {statusContent}
        </View>

        {canViewErrorLog ? (
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Pressable onPress={() => setShowErrorLog(true)} style={{ paddingHorizontal: 8, paddingVertical: 2 }}>
              <View className="flex-row items-center">
                <Text style={[getThemeBodyStyle(theme, 11, theme.accent), { fontWeight: '700' }]}>Error Log</Text>
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    marginLeft: 6,
                    backgroundColor: errorEntries.length > 0 ? '#EF4444' : '#22C55E',
                    shadowColor: errorEntries.length > 0 ? '#EF4444' : '#22C55E',
                    shadowOpacity: 0.4,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 0 },
                  }}
                />
              </View>
            </Pressable>
          </View>
        ) : null}
      </View>

      <Modal
        visible={showOrganizationPanel}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOrganizationPanel(false)}
      >
        <View className="flex-1 justify-center px-5" style={{ backgroundColor: 'rgba(0, 0, 0, 0.72)' }}>
          <ThemeChrome
            theme={theme}
            variant="feature"
            fill
            blurIntensity={30}
            style={{ maxHeight: '88%', borderRadius: 24 }}
          >
            <View className="flex-1 p-5">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-4">
                  <Text style={getThemeHeadingStyle(theme, 22)}>Organization Overview</Text>
                  <Text style={[getThemeBodyStyle(theme, 13, theme.textSecondary), { marginTop: 4 }]}>
                    Select an item to view additional details.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setShowOrganizationPanel(false)}
                  className="h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: theme.border }}
                >
                  <X size={18} color={theme.textSecondary} />
                </Pressable>
              </View>

              <ScrollView className="mt-4 flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
                <View className="items-center">
                  <Pressable
                    onPress={() => setSelectedOrganization(organizationChart.root.id)}
                    className="rounded-3xl border px-5 py-4"
                    style={{
                      backgroundColor: selectedOrganization === organizationChart.root.id ? theme.accentSoft : theme.surfaceAlt,
                      borderColor: selectedOrganization === organizationChart.root.id ? theme.accent : theme.border,
                    }}
                  >
                    <View className="items-center">
                      <Image source={organizationChart.root.logo} style={{ width: 56, height: 56 }} resizeMode="contain" />
                      <Text style={[getThemeBodyStyle(theme, 14, theme.textPrimary), { marginTop: 8, fontWeight: '700' }]}>
                        {organizationChart.root.shortLabel}
                      </Text>
                    </View>
                  </Pressable>
                  <View style={{ width: 2, height: 18, backgroundColor: theme.borderStrong }} />
                  <View style={{ width: '82%', height: 2, backgroundColor: theme.borderStrong }} />
                </View>

                <View className="mt-2 flex-row flex-wrap justify-between">
                  {organizationChart.children.map((child) => {
                    const canAccess = canViewAllOrganizationActivity || normalizedUserSquadron === child.id;
                    return (
                      <View key={child.id} style={{ width: '48%', marginBottom: 12 }} className="items-center">
                        <View style={{ width: 2, height: 14, backgroundColor: theme.borderStrong }} />
                        <Pressable
                          onPress={() => setSelectedOrganization(child.id)}
                          className="w-full rounded-3xl border px-4 py-4"
                          style={{
                            backgroundColor: selectedOrganization === child.id ? theme.accentSoft : theme.surfaceAlt,
                            borderColor: selectedOrganization === child.id ? theme.accent : theme.border,
                            opacity: canAccess ? 1 : 0.86,
                          }}
                        >
                          <View className="items-center">
                            <Image source={child.logo} style={{ width: 48, height: 48 }} resizeMode="contain" />
                            <Text style={[getThemeBodyStyle(theme, 13, theme.textPrimary), { marginTop: 8, fontWeight: '700' }]}>
                              {child.shortLabel}
                            </Text>
                          </View>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>

                <ThemeChrome theme={theme} variant="feature" style={{ marginTop: 8 }}>
                  <View className="p-4">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center flex-1 pr-3">
                        <Image source={getOrganizationMeta(selectedOrganization).logo} style={{ width: 38, height: 38 }} resizeMode="contain" />
                        <View className="ml-3 flex-1">
                          <Text style={[getThemeBodyStyle(theme, 15, theme.textPrimary), { fontWeight: '700' }]}>
                            {organizationOverview.current.label}
                          </Text>
                          <Text style={getThemeBodyStyle(theme, 12, theme.textSecondary)}>
                            Current month activity overview
                          </Text>
                        </View>
                      </View>
                      {!organizationOverview.current.allowed ? (
                        <View className="rounded-full px-3 py-1" style={{ backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: theme.border }}>
                          <Text style={getThemeBodyStyle(theme, 11, theme.textSecondary)}>Scoped</Text>
                        </View>
                      ) : null}
                    </View>

                    {organizationOverview.current.allowed ? (
                      <>
                        <View className="mt-4 flex-row flex-wrap" style={{ gap: 12 }}>
                          {[
                            ['Members', organizationOverview.current.totals.members],
                            ['Workouts', organizationOverview.current.totals.workouts],
                            ['Hours', Number((organizationOverview.current.totals.minutes / 60).toFixed(2))],
                            ['Miles', Number(organizationOverview.current.totals.miles.toFixed(2))],
                          ].map(([label, value]) => (
                            <View
                              key={String(label)}
                              className="rounded-2xl px-3 py-3"
                              style={{ width: '47%', backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: theme.border }}
                            >
                              <Text style={getThemeBodyStyle(theme, 11, theme.textSecondary)}>{label}</Text>
                              <Text style={[getThemeBodyStyle(theme, 18, theme.textPrimary), { marginTop: 6, fontWeight: '700' }]}>
                                {String(value)}
                              </Text>
                            </View>
                          ))}
                        </View>

                        {selectedOrganization === GROUP_SQUADRON ? (
                          <View className="mt-4">
                            <View className="flex-row items-center mb-2">
                              <Users size={16} color={theme.accent} />
                              <Text style={[getThemeBodyStyle(theme, 13, theme.textPrimary), { marginLeft: 8, fontWeight: '700' }]}>
                                Squadron Activity in the Group
                              </Text>
                            </View>
                            {organizationOverview.current.childBreakdown.map((child) => (
                              <View key={child.id} className="flex-row items-center justify-between py-2 border-b border-white/5 last:border-b-0">
                                <Text style={getThemeBodyStyle(theme, 13, theme.textPrimary)}>{child.label}</Text>
                                <Text style={getThemeBodyStyle(theme, 12, theme.textSecondary)}>
                                  {child.members} members · {child.workouts} workouts · {(child.minutes / 60).toFixed(2)}h
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </>
                    ) : (
                      <Text style={[getThemeBodyStyle(theme, 13, theme.textSecondary), { marginTop: 14 }]}>
                        Activity for other squadrons stays scoped. Group-level and owner accounts can open full overviews across the organization.
                      </Text>
                    )}
                  </View>
                </ThemeChrome>
              </ScrollView>
            </View>
          </ThemeChrome>
        </View>
      </Modal>

      <Modal
        visible={showErrorLog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowErrorLog(false)}
      >
        <View className="flex-1 justify-center px-5" style={{ backgroundColor: 'rgba(0, 0, 0, 0.72)' }}>
          <ThemeChrome
            theme={theme}
            variant="feature"
            fill
            blurIntensity={30}
            style={{ maxHeight: '82%', borderRadius: 22 }}
          >
            <View className="flex-1 p-5">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-4">
                  <Text style={getThemeHeadingStyle(theme, 22)}>Error Log</Text>
                  <Text style={[getThemeBodyStyle(theme, 13, theme.textSecondary), { marginTop: 4 }]}>
                    Current-session app errors for local debugging.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setShowErrorLog(false)}
                  className="h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: theme.border }}
                >
                  <X size={18} color={theme.textSecondary} />
                </Pressable>
              </View>

              <View className="mt-4 flex-row items-center justify-between">
                <Text style={getThemeBodyStyle(theme, 12, theme.textMuted)}>
                  {errorEntries.length} {errorEntries.length === 1 ? 'entry' : 'entries'}
                </Text>
                <Pressable onPress={clearEntries}>
                  <Text style={[getThemeBodyStyle(theme, 12, theme.accent), { fontWeight: '700' }]}>Clear</Text>
                </Pressable>
              </View>

              <ScrollView className="mt-4 flex-1" showsVerticalScrollIndicator={false}>
                {reversedErrorEntries.length === 0 ? (
                  <ThemeChrome theme={theme} variant="feature">
                    <View className="p-4">
                      <Text style={getThemeBodyStyle(theme, 14, theme.textSecondary)}>
                        No errors logged this session.
                      </Text>
                    </View>
                  </ThemeChrome>
                ) : (
                  reversedErrorEntries.map((entry) => (
                    <ThemeChrome key={entry.id} theme={theme} variant="feature" style={{ marginBottom: 12 }}>
                      <View className="p-4">
                        <View className="flex-row items-start justify-between">
                          <View className="flex-1 pr-3">
                            <View className="flex-row items-center">
                              <AlertTriangle size={14} color="#F59E0B" />
                              <Text style={[getThemeBodyStyle(theme, 12, theme.textPrimary), { marginLeft: 6, fontWeight: '700' }]}>
                                {entry.source.toUpperCase()}
                              </Text>
                            </View>
                            <Text style={[getThemeBodyStyle(theme, 13, theme.textSecondary), { marginTop: 3 }]}>
                              {formatMilitarySyncTime(entry.timestamp)}
                            </Text>
                            <Text style={[getThemeBodyStyle(theme, 12, theme.accent), { marginTop: 5, fontWeight: '600' }]}>
                              {entry.location}
                            </Text>
                          </View>
                        </View>
                        <Text style={[getThemeBodyStyle(theme, 13, theme.textPrimary), { marginTop: 10 }]}>
                          {entry.message}
                        </Text>
                        {entry.stack ? (
                          <Text style={[getThemeBodyStyle(theme, 11, theme.textMuted), { marginTop: 10 }]}>
                            {entry.stack}
                          </Text>
                        ) : null}
                      </View>
                    </ThemeChrome>
                  ))
                )}
              </ScrollView>
            </View>
          </ThemeChrome>
        </View>
      </Modal>
    </>
  );
}
