import { Platform } from 'react-native';
import type { IntegrationConnection, Workout, WorkoutType } from '@/lib/store';

const STRAVA_STATE_KEY = 'fitflight.strava.oauth_state';
const STRAVA_PENDING_USER_KEY = 'fitflight.strava.pending_user';
const STRAVA_PENDING_EMAIL_KEY = 'fitflight.strava.pending_email';

export interface StravaImportedWorkout {
  externalId: string;
  title?: string;
  date: string;
  type: WorkoutType;
  duration: number;
  distance?: number;
  isPrivate?: boolean;
}

export interface StravaSyncResult {
  connection: IntegrationConnection;
  workouts: StravaImportedWorkout[];
}

function getStorage() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  return window.sessionStorage;
}

function getAppBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }

  return '';
}

function getFunctionBaseUrl() {
  const explicit = process.env.EXPO_PUBLIC_SUPABASE_FUNCTIONS_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    return '';
  }

  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1`;
}

function getHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (anonKey) {
    headers.apikey = anonKey;
  }

  return headers;
}

export function getStravaRedirectUri() {
  const appBaseUrl = getAppBaseUrl();
  return appBaseUrl ? `${appBaseUrl}/integrations/strava-callback` : '';
}

export function getStravaSetupError() {
  if (Platform.OS !== 'web') {
    return 'Strava sync is currently enabled only for the web app.';
  }

  if (!getFunctionBaseUrl()) {
    return 'Missing Supabase function URL configuration.';
  }

  if (!getStravaRedirectUri()) {
    return 'Missing app URL configuration for the Strava callback.';
  }

  return null;
}

export function canUseStravaSync() {
  return getStravaSetupError() === null;
}

export function startStravaConnect(userId: string, email: string) {
  const setupError = getStravaSetupError();
  if (setupError) {
    throw new Error(setupError);
  }

  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    throw new Error('Strava connect is only available on the web app right now.');
  }

  const state = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storage = getStorage();
  storage?.setItem(STRAVA_STATE_KEY, state);
  storage?.setItem(STRAVA_PENDING_USER_KEY, userId);
  storage?.setItem(STRAVA_PENDING_EMAIL_KEY, email);

  const url = new URL(`${getFunctionBaseUrl()}/strava-connect`);
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', getStravaRedirectUri());
  url.searchParams.set('user_id', userId);
  url.searchParams.set('email', email);

  window.location.assign(url.toString());
}

export function consumePendingStravaOAuth() {
  const storage = getStorage();
  const data = {
    state: storage?.getItem(STRAVA_STATE_KEY) ?? '',
    userId: storage?.getItem(STRAVA_PENDING_USER_KEY) ?? '',
    email: storage?.getItem(STRAVA_PENDING_EMAIL_KEY) ?? '',
  };

  storage?.removeItem(STRAVA_STATE_KEY);
  storage?.removeItem(STRAVA_PENDING_USER_KEY);
  storage?.removeItem(STRAVA_PENDING_EMAIL_KEY);

  return data;
}

async function postToFunction<T>(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${getFunctionBaseUrl()}/${path}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === 'string'
      ? payload.error
      : 'The Strava request failed.';
    throw new Error(message);
  }

  return payload as T;
}

export async function exchangeStravaCode(params: {
  code: string;
  state: string;
  userId: string;
  email: string;
}) {
  return postToFunction<StravaSyncResult>('strava-exchange', {
    ...params,
    redirectUri: getStravaRedirectUri(),
  });
}

export async function syncStravaWorkouts(params: { userId: string; email: string }) {
  return postToFunction<StravaSyncResult>('strava-sync', params);
}

export async function disconnectStrava(params: { userId: string; email: string }) {
  return postToFunction<{ success: true }>('strava-disconnect', params);
}

export function mapImportedWorkouts(workouts: StravaImportedWorkout[]): Workout[] {
  return workouts.map((workout) => ({
    id: `strava-${workout.externalId}`,
    externalId: workout.externalId,
    title: workout.title,
    date: workout.date,
    type: workout.type,
    duration: workout.duration,
    distance: workout.distance,
    source: 'strava',
    isPrivate: workout.isPrivate ?? false,
  }));
}
