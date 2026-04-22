import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Building2, Check, WifiOff } from 'lucide-react-native';

import { formatMilitarySyncTime, useAppSyncStore } from '@/lib/appSync';
import { getThemeBodyStyle, getThemeLabelStyle, useAppTheme } from '@/lib/theme';

export function TopStatusBar({
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  const theme = useAppTheme();
  const isOnline = useAppSyncStore((state) => state.isOnline);
  const syncIndicator = useAppSyncStore((state) => state.syncIndicator);
  const lastSyncedAt = useAppSyncStore((state) => state.lastSyncedAt);
  const queuedActions = useAppSyncStore((state) => state.queuedActions);
  const squadronLabel = (subtitle ?? 'FitFlight').replace(/\s+Squadron$/i, '');

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
    <View
      className="px-6 py-1.5"
      style={{
        backgroundColor: theme.surfaceAlt,
        borderTopWidth: 1,
        borderTopColor: theme.border,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
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
    </View>
  );
}
