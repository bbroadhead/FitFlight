import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import { useAuthStore } from '@/lib/store';

export type AppThemeName = 'default' | 'dark' | 'pixel' | 'cyber' | 'space' | 'flowery';

export type AppThemePalette = {
  id: AppThemeName;
  label: string;
  gradient: [string, string, string];
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceFeature: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentSoft: string;
  accentAlt: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  iconWell: string;
  inputBackground: string;
  inputBorder: string;
  tabBar: string;
  tabBarBorder: string;
  indicator: string;
  indicatorGlow: string;
  cardRadius: number;
  controlRadius: number;
  cardShadow: string;
  headingFontFamily?: string;
  bodyFontFamily?: string;
  headingLetterSpacing: number;
  bodyLetterSpacing: number;
  buttonLetterSpacing: number;
  statusBar: 'light' | 'dark';
};

const pixelFontFamily = Platform.select({
  ios: 'Courier',
  android: 'monospace',
  web: '"Silkscreen", "VT323", "Courier New", monospace',
});

const cyberFontFamily = Platform.select({
  ios: 'Courier',
  android: 'monospace',
  web: '"Courier New", monospace',
});

const spaceHeadingFamily = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  web: 'Georgia, serif',
});

const floweryHeadingFamily = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  web: 'Georgia, serif',
});

export const APP_THEMES: Record<AppThemeName, AppThemePalette> = {
  default: {
    id: 'default',
    label: 'Default',
    gradient: ['#0A1628', '#001F5C', '#0A1628'],
    background: '#0A1628',
    surface: 'rgba(255,255,255,0.05)',
    surfaceAlt: 'rgba(255,255,255,0.08)',
    surfaceFeature: 'rgba(74,144,217,0.12)',
    border: 'rgba(255,255,255,0.10)',
    borderStrong: 'rgba(74,144,217,0.26)',
    accent: '#4A90D9',
    accentSoft: 'rgba(74,144,217,0.16)',
    accentAlt: '#FACC15',
    textPrimary: '#FFFFFF',
    textSecondary: '#C0CDE0',
    textMuted: '#93A4B8',
    iconWell: 'rgba(255,255,255,0.10)',
    inputBackground: 'rgba(255,255,255,0.08)',
    inputBorder: 'rgba(255,255,255,0.12)',
    tabBar: 'rgba(10,22,40,0.88)',
    tabBarBorder: 'rgba(255,255,255,0.10)',
    indicator: '#4A90D9',
    indicatorGlow: 'rgba(74,144,217,0.34)',
    cardRadius: 24,
    controlRadius: 16,
    cardShadow: '0px 18px 36px rgba(0,0,0,0.22)',
    headingLetterSpacing: 0,
    bodyLetterSpacing: 0,
    buttonLetterSpacing: 0.1,
    statusBar: 'light',
  },
  dark: {
    id: 'dark',
    label: 'Dark',
    gradient: ['#040507', '#0B1017', '#040507'],
    background: '#05070B',
    surface: 'rgba(12,16,23,0.76)',
    surfaceAlt: 'rgba(17,23,33,0.70)',
    surfaceFeature: 'rgba(8,11,17,0.82)',
    border: 'rgba(255,255,255,0.14)',
    borderStrong: 'rgba(125,211,252,0.26)',
    accent: '#7DD3FC',
    accentSoft: 'rgba(125,211,252,0.12)',
    accentAlt: '#CBD5E1',
    textPrimary: '#F8FAFC',
    textSecondary: '#CBD5E1',
    textMuted: '#94A3B8',
    iconWell: 'rgba(255,255,255,0.08)',
    inputBackground: 'rgba(8,11,17,0.62)',
    inputBorder: 'rgba(255,255,255,0.12)',
    tabBar: 'rgba(5,7,11,0.86)',
    tabBarBorder: 'rgba(255,255,255,0.10)',
    indicator: '#7DD3FC',
    indicatorGlow: 'rgba(125,211,252,0.25)',
    cardRadius: 22,
    controlRadius: 14,
    cardShadow: '0px 22px 44px rgba(0,0,0,0.42)',
    headingLetterSpacing: 0,
    bodyLetterSpacing: 0,
    buttonLetterSpacing: 0.15,
    statusBar: 'light',
  },
  pixel: {
    id: 'pixel',
    label: 'Pixel',
    gradient: ['#0D1510', '#213128', '#101913'],
    background: '#101812',
    surface: 'rgba(34, 47, 40, 0.54)',
    surfaceAlt: 'rgba(45, 61, 52, 0.50)',
    surfaceFeature: 'rgba(25, 37, 31, 0.62)',
    border: '#6A7D70',
    borderStrong: '#9BB4A5',
    accent: '#77E6E1',
    accentSoft: 'rgba(119,230,225,0.16)',
    accentAlt: '#BCD0C5',
    textPrimary: '#EEF7F1',
    textSecondary: '#C9D8CF',
    textMuted: '#8FA59A',
    iconWell: 'rgba(96, 116, 106, 0.26)',
    inputBackground: 'rgba(17, 25, 20, 0.54)',
    inputBorder: '#6F897A',
    tabBar: 'rgba(15, 23, 18, 0.82)',
    tabBarBorder: 'rgba(155,180,165,0.20)',
    indicator: '#77E6E1',
    indicatorGlow: 'rgba(119,230,225,0.22)',
    cardRadius: 2,
    controlRadius: 2,
    cardShadow: '0px 0px 0px rgba(0,0,0,0)',
    headingFontFamily: pixelFontFamily,
    bodyFontFamily: pixelFontFamily,
    headingLetterSpacing: 0.35,
    bodyLetterSpacing: 0.08,
    buttonLetterSpacing: 0.2,
    statusBar: 'light',
  },
  cyber: {
    id: 'cyber',
    label: 'Cyber',
    gradient: ['#020B10', '#06202A', '#01070A'],
    background: '#02080D',
    surface: 'rgba(3,15,20,0.985)',
    surfaceAlt: 'rgba(6,24,30,0.98)',
    surfaceFeature: 'rgba(2,11,15,0.992)',
    border: 'rgba(34,211,238,0.32)',
    borderStrong: 'rgba(56,189,248,0.62)',
    accent: '#22D3EE',
    accentSoft: 'rgba(34,211,238,0.16)',
    accentAlt: '#34D399',
    textPrimary: '#D9FFF9',
    textSecondary: '#8CE8E8',
    textMuted: '#61B7BC',
    iconWell: 'rgba(34,211,238,0.10)',
    inputBackground: 'rgba(0,0,0,0.26)',
    inputBorder: 'rgba(34,211,238,0.26)',
    tabBar: 'rgba(2,8,13,0.99)',
    tabBarBorder: 'rgba(34,211,238,0.18)',
    indicator: '#22D3EE',
    indicatorGlow: 'rgba(34,211,238,0.42)',
    cardRadius: 12,
    controlRadius: 10,
    cardShadow: '0px 0px 24px rgba(34,211,238,0.16)',
    headingFontFamily: cyberFontFamily,
    bodyFontFamily: cyberFontFamily,
    headingLetterSpacing: 0.5,
    bodyLetterSpacing: 0.18,
    buttonLetterSpacing: 0.35,
    statusBar: 'light',
  },
  space: {
    id: 'space',
    label: 'Space',
    gradient: ['#050814', '#171D45', '#040611'],
    background: '#050814',
    surface: 'rgba(12,16,34,0.975)',
    surfaceAlt: 'rgba(18,24,52,0.965)',
    surfaceFeature: 'rgba(8,11,25,0.988)',
    border: 'rgba(167,139,250,0.22)',
    borderStrong: 'rgba(125,211,252,0.32)',
    accent: '#A78BFA',
    accentSoft: 'rgba(167,139,250,0.18)',
    accentAlt: '#7DD3FC',
    textPrimary: '#F8FAFF',
    textSecondary: '#D7DEFF',
    textMuted: '#9EABD5',
    iconWell: 'rgba(167,139,250,0.10)',
    inputBackground: 'rgba(10,13,29,0.56)',
    inputBorder: 'rgba(167,139,250,0.18)',
    tabBar: 'rgba(5,8,20,0.98)',
    tabBarBorder: 'rgba(167,139,250,0.14)',
    indicator: '#A78BFA',
    indicatorGlow: 'rgba(167,139,250,0.32)',
    cardRadius: 26,
    controlRadius: 18,
    cardShadow: '0px 24px 44px rgba(5,8,20,0.42)',
    headingFontFamily: spaceHeadingFamily,
    headingLetterSpacing: 0.25,
    bodyLetterSpacing: 0.1,
    buttonLetterSpacing: 0.3,
    statusBar: 'light',
  },
  flowery: {
    id: 'flowery',
    label: 'Flowery',
    gradient: ['#2D1434', '#6F325F', '#1C3E54'],
    background: '#24102B',
    surface: 'rgba(63,28,63,0.72)',
    surfaceAlt: 'rgba(87,40,74,0.66)',
    surfaceFeature: 'rgba(52,24,57,0.78)',
    border: 'rgba(255,214,235,0.26)',
    borderStrong: 'rgba(250,168,212,0.42)',
    accent: '#F472B6',
    accentSoft: 'rgba(244,114,182,0.16)',
    accentAlt: '#F9A8D4',
    textPrimary: '#FFF7FB',
    textSecondary: '#F6D2E6',
    textMuted: '#D8AFC6',
    iconWell: 'rgba(255,214,235,0.14)',
    inputBackground: 'rgba(43,19,49,0.56)',
    inputBorder: 'rgba(255,214,235,0.18)',
    tabBar: 'rgba(36,16,43,0.86)',
    tabBarBorder: 'rgba(255,214,235,0.12)',
    indicator: '#F472B6',
    indicatorGlow: 'rgba(244,114,182,0.30)',
    cardRadius: 24,
    controlRadius: 18,
    cardShadow: '0px 22px 44px rgba(45,20,52,0.28)',
    headingFontFamily: floweryHeadingFamily,
    headingLetterSpacing: 0.25,
    bodyLetterSpacing: 0.05,
    buttonLetterSpacing: 0.25,
    statusBar: 'light',
  },
};

export function getAppThemePalette(theme: AppThemeName | undefined | null) {
  return APP_THEMES[theme ?? 'default'] ?? APP_THEMES.default;
}

export function getThemeHeadingStyle(theme: AppThemePalette, size: number): TextStyle {
  const adjustedSize =
    theme.id === 'pixel'
      ? Math.max(size - 4, 9)
      : theme.id === 'cyber'
        ? Math.max(size - 1, 10)
        : size;
  return {
    color: theme.textPrimary,
    fontSize: adjustedSize,
    fontWeight: theme.id === 'pixel' ? '700' : '700',
    fontFamily: theme.headingFontFamily,
    letterSpacing: theme.headingLetterSpacing,
    ...(Platform.OS === 'web'
      ? ({
          wordBreak: 'keep-all',
          overflowWrap: 'normal',
        } as TextStyle)
      : {}),
  };
}

export function getThemeBodyStyle(theme: AppThemePalette, size = 14, color?: string): TextStyle {
  const adjustedSize =
    theme.id === 'pixel'
      ? Math.max(size - 3, 9)
      : theme.id === 'cyber'
        ? Math.max(size - 1, 10)
        : size;
  return {
    color: color ?? theme.textSecondary,
    fontSize: adjustedSize,
    fontFamily: theme.bodyFontFamily,
    letterSpacing: theme.bodyLetterSpacing,
    ...(Platform.OS === 'web'
      ? ({
          wordBreak: 'keep-all',
          overflowWrap: 'normal',
        } as TextStyle)
      : {}),
  };
}

export function getThemeLabelStyle(theme: AppThemePalette): TextStyle {
  return {
    color: theme.textMuted,
    fontSize: theme.id === 'pixel' ? 10 : theme.id === 'cyber' ? 10.5 : 11,
    fontWeight: '600',
    fontFamily: theme.bodyFontFamily,
    letterSpacing: theme.id === 'pixel' ? 0.3 : theme.id === 'cyber' ? 0.4 : Math.max(theme.bodyLetterSpacing + 0.45, 0.45),
    textTransform: 'uppercase',
    ...(Platform.OS === 'web'
      ? ({
          wordBreak: 'keep-all',
          overflowWrap: 'normal',
        } as TextStyle)
      : {}),
  };
}

export function getThemeCardStyle(theme: AppThemePalette, variant: 'default' | 'alt' | 'feature' = 'default'): ViewStyle {
  const backgroundColor =
    variant === 'alt' ? theme.surfaceAlt : variant === 'feature' ? theme.surfaceFeature : theme.surface;

  return {
    backgroundColor,
    borderColor: variant === 'feature' ? theme.borderStrong : theme.border,
    borderWidth: theme.id === 'pixel' ? 3 : theme.id === 'cyber' ? 1.25 : 1,
    borderRadius: theme.cardRadius,
    shadowColor: theme.id === 'cyber' ? theme.accent : '#000000',
    shadowOpacity: theme.id === 'pixel' ? 0 : theme.id === 'space' ? 0.22 : 0.18,
    shadowRadius: theme.id === 'space' ? 24 : theme.id === 'cyber' ? 18 : 14,
    shadowOffset: { width: 0, height: theme.id === 'pixel' ? 0 : 10 },
  };
}

export function getThemeControlStyle(theme: AppThemePalette, active = false): ViewStyle {
  return {
    backgroundColor: active ? theme.accentSoft : theme.inputBackground,
    borderColor: active ? theme.borderStrong : theme.inputBorder,
    borderWidth: theme.id === 'pixel' ? 2 : theme.id === 'cyber' ? 1.25 : 1,
    borderRadius: theme.controlRadius,
  };
}

export function getThemeInputContainerStyle(theme: AppThemePalette, active = false): ViewStyle {
  return {
    backgroundColor: active ? theme.accentSoft : theme.inputBackground,
    borderColor: active ? theme.borderStrong : theme.inputBorder,
    borderWidth: theme.id === 'pixel' ? 2 : theme.id === 'cyber' ? 1.25 : 1,
    borderRadius: theme.controlRadius,
    shadowColor: theme.id === 'cyber' ? theme.accent : '#000000',
    shadowOpacity: active && theme.id !== 'pixel' ? 0.18 : 0,
    shadowRadius: active ? 12 : 0,
    shadowOffset: { width: 0, height: 0 },
  };
}

export function getThemeButtonStyle(
  theme: AppThemePalette,
  variant: 'accent' | 'secondary' | 'ghost' = 'accent'
): ViewStyle {
  if (variant === 'secondary') {
    return {
      backgroundColor: theme.surfaceAlt,
      borderColor: theme.borderStrong,
      borderWidth: theme.id === 'pixel' ? 2 : theme.id === 'cyber' ? 1.25 : 1,
      borderRadius: theme.controlRadius,
    };
  }

  if (variant === 'ghost') {
    return {
      backgroundColor: theme.accentSoft,
      borderColor: theme.border,
      borderWidth: theme.id === 'pixel' ? 2 : theme.id === 'cyber' ? 1.25 : 1,
      borderRadius: theme.controlRadius,
    };
  }

  return {
    backgroundColor: theme.accent,
    borderColor: theme.id === 'pixel' ? theme.accentAlt : theme.borderStrong,
    borderWidth: theme.id === 'pixel' ? 2 : theme.id === 'cyber' ? 1.25 : 1,
    borderRadius: theme.controlRadius,
    shadowColor: theme.accent,
    shadowOpacity: theme.id === 'pixel' ? 0 : 0.22,
    shadowRadius: theme.id === 'cyber' ? 18 : 12,
    shadowOffset: { width: 0, height: 6 },
  };
}

export function getThemeButtonTextStyle(theme: AppThemePalette, variant: 'accent' | 'secondary' | 'ghost' = 'accent'): TextStyle {
  return {
    color: variant === 'accent' ? (theme.id === 'pixel' ? '#0F181D' : '#08111B') : theme.textPrimary,
    fontSize: theme.id === 'pixel' ? 13 : 15,
    fontWeight: '700',
    fontFamily: theme.bodyFontFamily,
    letterSpacing: theme.buttonLetterSpacing,
  };
}

export function getThemeIconWellStyle(theme: AppThemePalette): ViewStyle {
  return {
    backgroundColor: theme.iconWell,
    borderColor: theme.id === 'pixel' || theme.id === 'cyber' ? theme.border : 'transparent',
    borderWidth: theme.id === 'pixel' || theme.id === 'cyber' ? 1 : 0,
    borderRadius: theme.id === 'pixel' ? 10 : 18,
  };
}

export function getThemeChromeStyle(theme: AppThemePalette, variant: 'default' | 'alt' | 'feature' = 'default'): ViewStyle {
  if (theme.id === 'pixel') {
    return {
      backgroundColor: variant === 'feature' ? 'rgba(119,230,225,0.06)' : 'rgba(84,96,110,0.08)',
      borderColor: variant === 'feature' ? theme.borderStrong : theme.border,
      borderWidth: 2,
      borderRadius: 0,
      padding: 5,
    };
  }

  if (theme.id === 'cyber') {
    return {
      backgroundColor: 'rgba(34,211,238,0.04)',
      borderColor: variant === 'feature' ? theme.borderStrong : theme.border,
      borderWidth: 1,
      borderRadius: 14,
      padding: 2,
      shadowColor: theme.accent,
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 0 },
    };
  }

  if (theme.id === 'space') {
    return {
      backgroundColor: 'rgba(167,139,250,0.06)',
      borderColor: variant === 'feature' ? theme.borderStrong : theme.border,
      borderWidth: 1,
      borderRadius: theme.cardRadius + 4,
      padding: 2,
    };
  }

  if (theme.id === 'flowery') {
    return {
      backgroundColor: 'rgba(249,168,212,0.07)',
      borderColor: variant === 'feature' ? theme.borderStrong : theme.border,
      borderWidth: 1,
      borderRadius: theme.cardRadius + 2,
      padding: 2,
    };
  }

  return {
    backgroundColor: 'transparent',
    borderRadius: theme.cardRadius,
    padding: 0,
  };
}

export function useAppTheme() {
  const appTheme = useAuthStore((state) => state.appTheme);
  return getAppThemePalette(appTheme);
}
