import React from 'react';
import { View, type ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { getThemeCardStyle, getThemeChromeStyle, type AppThemePalette } from '@/lib/theme';

type ThemeChromeProps = ViewProps & {
  theme: AppThemePalette;
  variant?: 'default' | 'alt' | 'feature';
  blurIntensity?: number;
  forceBlur?: boolean;
  fill?: boolean;
};

export function ThemeChrome({
  theme,
  variant = 'default',
  blurIntensity,
  forceBlur = false,
  fill = false,
  style,
  children,
  ...props
}: ThemeChromeProps) {
  const chromeStyle = getThemeChromeStyle(theme, variant);
  const cardStyle = getThemeCardStyle(theme, variant);
  const isOverlayShell = fill || forceBlur;
  const shouldBlur =
    isOverlayShell ||
    theme.id === 'dark' ||
    theme.id === 'space' ||
    theme.id === 'flowery' ||
    theme.id === 'pixel';
  const blurTint = 'dark';
  const pixelBorderColor = variant === 'feature' ? theme.borderStrong : theme.border;
  const blurOverlayColor =
    isOverlayShell
      ? theme.id === 'dark'
        ? 'rgba(5, 7, 11, 0.34)'
        : theme.id === 'space'
          ? 'rgba(5, 8, 20, 0.30)'
          : theme.id === 'flowery'
            ? 'rgba(36, 16, 43, 0.28)'
            : theme.id === 'pixel'
              ? 'rgba(8, 12, 18, 0.34)'
              : theme.id === 'cyber'
                ? 'rgba(2, 8, 13, 0.34)'
                : 'rgba(10, 22, 40, 0.30)'
      : theme.id === 'dark'
        ? 'rgba(5, 7, 11, 0.18)'
        : theme.id === 'space'
          ? 'rgba(5, 8, 20, 0.16)'
          : theme.id === 'flowery'
            ? 'rgba(36, 16, 43, 0.14)'
            : theme.id === 'pixel'
              ? 'rgba(8, 12, 18, 0.20)'
              : theme.id === 'cyber'
                ? 'rgba(2, 8, 13, 0.18)'
                : 'rgba(10, 22, 40, 0.16)';
  const resolvedBlurIntensity = blurIntensity
    ?? (isOverlayShell
      ? theme.id === 'dark'
        ? 46
        : theme.id === 'pixel'
          ? 36
          : theme.id === 'cyber'
            ? 40
            : 38
      : theme.id === 'dark'
        ? 30
        : theme.id === 'pixel'
          ? 22
          : 24);

  return (
    <View {...props} style={[chromeStyle, style]}>
      {shouldBlur ? (
        <BlurView
          intensity={resolvedBlurIntensity}
          tint={blurTint}
          style={[cardStyle, fill ? { flex: 1 } : null, { overflow: 'hidden' }]}
        >
          <View style={{ backgroundColor: blurOverlayColor, position: 'relative', borderRadius: theme.cardRadius, overflow: 'hidden', flex: fill ? 1 : undefined }}>
            {children}
            {theme.id === 'pixel' ? (
              <>
                <View pointerEvents="none" style={{ position: 'absolute', top: -1, left: -1, width: 8, height: 8, backgroundColor: pixelBorderColor }} />
                <View pointerEvents="none" style={{ position: 'absolute', top: -1, left: 8, width: 4, height: 4, backgroundColor: pixelBorderColor }} />
                <View pointerEvents="none" style={{ position: 'absolute', top: 8, left: -1, width: 4, height: 4, backgroundColor: pixelBorderColor }} />
                <View pointerEvents="none" style={{ position: 'absolute', top: -1, right: -1, width: 8, height: 8, backgroundColor: pixelBorderColor }} />
                <View pointerEvents="none" style={{ position: 'absolute', top: -1, right: 8, width: 4, height: 4, backgroundColor: pixelBorderColor }} />
                <View pointerEvents="none" style={{ position: 'absolute', top: 8, right: -1, width: 4, height: 4, backgroundColor: pixelBorderColor }} />
                <View pointerEvents="none" style={{ position: 'absolute', bottom: -1, left: -1, width: 8, height: 8, backgroundColor: pixelBorderColor }} />
                <View pointerEvents="none" style={{ position: 'absolute', bottom: -1, left: 8, width: 4, height: 4, backgroundColor: pixelBorderColor }} />
                <View pointerEvents="none" style={{ position: 'absolute', bottom: 8, left: -1, width: 4, height: 4, backgroundColor: pixelBorderColor }} />
                <View pointerEvents="none" style={{ position: 'absolute', bottom: -1, right: -1, width: 8, height: 8, backgroundColor: pixelBorderColor }} />
                <View pointerEvents="none" style={{ position: 'absolute', bottom: -1, right: 8, width: 4, height: 4, backgroundColor: pixelBorderColor }} />
                <View pointerEvents="none" style={{ position: 'absolute', bottom: 8, right: -1, width: 4, height: 4, backgroundColor: pixelBorderColor }} />
              </>
            ) : null}
          </View>
        </BlurView>
      ) : (
        <View style={[cardStyle, fill ? { flex: 1 } : null, { position: 'relative', overflow: 'hidden' }]}>
          {children}
          {theme.id === 'pixel' ? (
            <>
              <View pointerEvents="none" style={{ position: 'absolute', inset: 3, borderWidth: 1, borderColor: 'rgba(247,233,191,0.22)' }} />
              <View pointerEvents="none" style={{ position: 'absolute', inset: 6, borderWidth: 1, borderColor: 'rgba(92, 49, 41, 0.92)' }} />
              <View pointerEvents="none" style={{ position: 'absolute', top: -1, left: -1, width: 8, height: 8, backgroundColor: pixelBorderColor }} />
              <View pointerEvents="none" style={{ position: 'absolute', top: -1, left: 8, width: 4, height: 4, backgroundColor: pixelBorderColor }} />
              <View pointerEvents="none" style={{ position: 'absolute', top: 8, left: -1, width: 4, height: 4, backgroundColor: pixelBorderColor }} />
              <View pointerEvents="none" style={{ position: 'absolute', top: -1, right: -1, width: 8, height: 8, backgroundColor: pixelBorderColor }} />
              <View pointerEvents="none" style={{ position: 'absolute', top: -1, right: 8, width: 4, height: 4, backgroundColor: pixelBorderColor }} />
              <View pointerEvents="none" style={{ position: 'absolute', top: 8, right: -1, width: 4, height: 4, backgroundColor: pixelBorderColor }} />
              <View pointerEvents="none" style={{ position: 'absolute', bottom: -1, left: -1, width: 8, height: 8, backgroundColor: pixelBorderColor }} />
              <View pointerEvents="none" style={{ position: 'absolute', bottom: -1, left: 8, width: 4, height: 4, backgroundColor: pixelBorderColor }} />
              <View pointerEvents="none" style={{ position: 'absolute', bottom: 8, left: -1, width: 4, height: 4, backgroundColor: pixelBorderColor }} />
              <View pointerEvents="none" style={{ position: 'absolute', bottom: -1, right: -1, width: 8, height: 8, backgroundColor: pixelBorderColor }} />
              <View pointerEvents="none" style={{ position: 'absolute', bottom: -1, right: 8, width: 4, height: 4, backgroundColor: pixelBorderColor }} />
              <View pointerEvents="none" style={{ position: 'absolute', bottom: 8, right: -1, width: 4, height: 4, backgroundColor: pixelBorderColor }} />
            </>
          ) : null}
        </View>
      )}
    </View>
  );
}
