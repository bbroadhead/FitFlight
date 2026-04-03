// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export type WorkoutType =
  | 'Running'
  | 'Walking'
  | 'Cycling'
  | 'Strength'
  | 'HIIT'
  | 'Swimming'
  | 'Sports'
  | 'Cardio'
  | 'Flexibility'
  | 'Other';

export interface NormalizedWorkout {
  externalId: string;
  title?: string;
  date: string;
  type: WorkoutType;
  duration: number;
  distance?: number;
  isPrivate?: boolean;
}

export interface StravaConnectionRow {
  user_id: string;
  email: string;
  strava_athlete_id: number;
  athlete_first_name: string | null;
  athlete_last_name: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scopes: string[];
  connected_at: string;
  last_synced_at: string | null;
}

function env(name: string, fallbackName?: string) {
  const value = Deno.env.get(name) ?? (fallbackName ? Deno.env.get(fallbackName) : undefined);
  if (!value) {
    throw new Error(
      fallbackName
        ? `Missing environment variable: ${name} (or fallback ${fallbackName})`
        : `Missing environment variable: ${name}`
    );
  }

  return value;
}

export function getSupabaseAdmin() {
  return createClient(
    env('SUPABASE_URL', 'BACKEND_URL'),
    env('SUPABASE_SERVICE_ROLE_KEY', 'BACKEND_SERVICE_ROLE_KEY')
  );
}

export function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...(init.headers ?? {}),
    },
  });
}

export function createAuthRedirect(state: string, redirectUri: string) {
  const url = new URL('https://www.strava.com/oauth/authorize');
  url.searchParams.set('client_id', env('STRAVA_CLIENT_ID'));
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('approval_prompt', 'auto');
  url.searchParams.set('scope', 'read,activity:read_all');
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env('STRAVA_CLIENT_ID'),
      client_secret: env('STRAVA_CLIENT_SECRET'),
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Strava token exchange failed: ${payload}`);
  }

  return response.json();
}

export async function refreshTokens(refreshToken: string) {
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env('STRAVA_CLIENT_ID'),
      client_secret: env('STRAVA_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Strava token refresh failed: ${payload}`);
  }

  return response.json();
}

export async function ensureFreshConnection(connection: StravaConnectionRow) {
  const expiresAt = new Date(connection.expires_at).getTime();
  const needsRefresh = expiresAt <= Date.now() + 5 * 60 * 1000;

  if (!needsRefresh) {
    return connection;
  }

  const refreshed = await refreshTokens(connection.refresh_token);
  const supabase = getSupabaseAdmin();

  const nextConnection = {
    ...connection,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
  };

  await supabase
    .from('strava_connections')
    .update({
      access_token: nextConnection.access_token,
      refresh_token: nextConnection.refresh_token,
      expires_at: nextConnection.expires_at,
    })
    .eq('user_id', connection.user_id);

  return nextConnection;
}

export async function fetchAthlete(accessToken: string) {
  const response = await fetch('https://www.strava.com/api/v3/athlete', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Unable to load the Strava athlete profile.');
  }

  return response.json();
}

export async function fetchActivities(accessToken: string, after?: string | null) {
  const url = new URL('https://www.strava.com/api/v3/athlete/activities');
  url.searchParams.set('per_page', '50');
  url.searchParams.set('page', '1');
  if (after) {
    url.searchParams.set('after', Math.floor(new Date(after).getTime() / 1000).toString());
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Unable to load recent Strava activities.');
  }

  return response.json();
}

function mapActivityType(activityType: string): WorkoutType {
  switch (activityType) {
    case 'Run':
    case 'TrailRun':
    case 'VirtualRun':
      return 'Running';
    case 'Walk':
    case 'Hike':
      return 'Walking';
    case 'Ride':
    case 'EBikeRide':
    case 'VirtualRide':
    case 'MountainBikeRide':
    case 'GravelRide':
      return 'Cycling';
    case 'Swim':
      return 'Swimming';
    case 'WeightTraining':
      return 'Strength';
    case 'Workout':
      return 'HIIT';
    default:
      return 'Cardio';
  }
}

export function normalizeActivities(activities: Array<Record<string, unknown>>): NormalizedWorkout[] {
  return activities.map((activity) => ({
    externalId: String(activity.id),
    title: typeof activity.name === 'string' ? activity.name : undefined,
    date: String(activity.start_date_local ?? activity.start_date).slice(0, 10),
    type: mapActivityType(String(activity.type ?? 'Workout')),
    duration: Math.max(1, Math.round(Number(activity.moving_time ?? 0) / 60)),
    distance: activity.distance ? Number((Number(activity.distance) / 1609.344).toFixed(2)) : undefined,
    isPrivate: Boolean(activity.private ?? false),
  }));
}

export async function upsertConnection(params: {
  userId: string;
  email: string;
  athlete: Record<string, unknown>;
  tokens: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdmin();

  await supabase.from('strava_connections').upsert({
    user_id: params.userId,
    email: params.email,
    strava_athlete_id: Number(params.athlete.id),
    athlete_first_name: String(params.athlete.firstname ?? ''),
    athlete_last_name: String(params.athlete.lastname ?? ''),
    access_token: String(params.tokens.access_token),
    refresh_token: String(params.tokens.refresh_token),
    expires_at: new Date(Number(params.tokens.expires_at) * 1000).toISOString(),
    scopes: String(params.tokens.scope ?? '')
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean),
    connected_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
  });
}

export async function upsertActivities(userId: string, activities: Array<Record<string, unknown>>) {
  if (activities.length === 0) {
    return;
  }

  const supabase = getSupabaseAdmin();
  const rows = activities.map((activity) => ({
    user_id: userId,
    strava_activity_id: Number(activity.id),
    name: String(activity.name ?? ''),
    activity_type: String(activity.type ?? 'Workout'),
    start_date: String(activity.start_date ?? new Date().toISOString()),
    duration_minutes: Math.max(1, Math.round(Number(activity.moving_time ?? 0) / 60)),
    distance_miles: activity.distance ? Number((Number(activity.distance) / 1609.344).toFixed(2)) : null,
    is_private: Boolean(activity.private ?? false),
    raw: activity,
    imported_at: new Date().toISOString(),
  }));

  await supabase.from('strava_activity_imports').upsert(rows, {
    onConflict: 'strava_activity_id',
    ignoreDuplicates: false,
  });
}

export function buildConnectionResponse(params: {
  athlete: Record<string, unknown>;
  syncedAt?: string;
}) {
  const syncedAt = params.syncedAt ?? new Date().toISOString();
  const firstName = String(params.athlete.firstname ?? '').trim();
  const lastName = String(params.athlete.lastname ?? '').trim();

  return {
    connectedAt: syncedAt,
    lastSyncedAt: syncedAt,
    externalId: String(params.athlete.id),
    displayName: [firstName, lastName].filter(Boolean).join(' ').trim() || undefined,
  };
}
