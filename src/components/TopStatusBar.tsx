import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { AlertTriangle, Building2, Check, WifiOff, X } from 'lucide-react-native';

import { formatMilitarySyncTime, useAppSyncStore } from '@/lib/appSync';
import { useAuthStore } from '@/lib/store';
import { useErrorLogStore } from '@/lib/errorLog';
import { ThemeChrome } from '@/components/ThemeChrome';
import { getThemeBodyStyle, getThemeHeadingStyle, useAppTheme } from '@/lib/theme';

export function TopStatusBar({
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  const theme = useAppTheme();
  const user = useAuthStore((state) => state.user);
  const isOnline = useAppSyncStore((state) => state.isOnline);
  const syncIndicator = useAppSyncStore((state) => state.syncIndicator);
  const lastSyncedAt = useAppSyncStore((state) => state.lastSyncedAt);
  const queuedActions = useAppSyncStore((state) => state.queuedActions);
  const errorEntries = useErrorLogStore((state) => state.entries);
  const clearEntries = useErrorLogStore((state) => state.clearEntries);
  const [showErrorLog, setShowErrorLog] = useState(false);
  const squadronLabel = (subtitle ?? 'FitFlight').replace(/\s+Squadron$/i, '');
  const canViewErrorLog = user?.accountType === 'fitflight_creator' || user?.accountType === 'ufpm';
  const reversedErrorEntries = useMemo(() => [...errorEntries].reverse(), [errorEntries]);

  const statusContent = (() => {
    if (!isOnline) {
      return (
        <View className="flex-row items-center">
          <WifiOff size={12} color={theme.textSecondary} />
          <Text style={[getThemeBodyStyle(theme, 11, theme.textSecondary), { marginLeft: 5 }]}>
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
        <Text style={getThemeBodyStyle(theme, 11, theme.textMuted)}>Last synced at: </Text>
        <Text style={[getThemeBodyStyle(theme, 11, theme.textPrimary), { fontWeight: '600' }]}>
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
          <View className="flex-1 flex-row items-center">
            <Building2 size={12} color={theme.textSecondary} />
            <Text style={[getThemeBodyStyle(theme, 11, theme.textSecondary), { marginLeft: 6, fontWeight: '600' }]}>
              {squadronLabel}
            </Text>
          </View>
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
