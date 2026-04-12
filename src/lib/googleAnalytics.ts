import { Platform } from 'react-native';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const measurementId = process.env.EXPO_PUBLIC_GA_MEASUREMENT_ID?.trim() || 'G-9BC4BSPGG2';

type AnalyticsValue = string | number | boolean | null | undefined;

function normalizeParams(params?: Record<string, AnalyticsValue>) {
  if (!params) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null)
  );
}

export function isGoogleAnalyticsEnabled() {
  return Platform.OS === 'web' && measurementId.length > 0 && typeof window !== 'undefined' && typeof window.gtag === 'function';
}

export function trackAnalyticsEvent(name: string, params?: Record<string, AnalyticsValue>) {
  if (!isGoogleAnalyticsEnabled()) {
    return;
  }

  window.gtag?.('event', name, normalizeParams(params));
}
