const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '') ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

interface SupabaseUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  user: SupabaseUser;
}

function getHeaders(extra: Record<string, string> = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase auth is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }

  return {
    apikey: SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof (payload as { msg?: unknown }).msg === 'string'
        ? (payload as { msg: string }).msg
        : typeof (payload as { error_description?: unknown }).error_description === 'string'
          ? (payload as { error_description: string }).error_description
          : typeof (payload as { error?: unknown }).error === 'string'
            ? (payload as { error: string }).error
            : 'Supabase auth request failed.';
    throw new Error(message);
  }

  return payload as T;
}

export async function signInWithPassword(email: string, password: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ email, password }),
  });

  return parseResponse<SupabaseSession>(response);
}

export async function signUpWithPassword(params: {
  email: string;
  password: string;
  metadata: Record<string, unknown>;
}) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      email: params.email,
      password: params.password,
      data: params.metadata,
    }),
  });

  return parseResponse<{ user: SupabaseUser | null; session: SupabaseSession | null }>(response);
}

export async function signOutFromSupabase(accessToken: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
    method: 'POST',
    headers: getHeaders({
      Authorization: `Bearer ${accessToken}`,
    }),
  });

  if (!response.ok) {
    throw new Error('Unable to sign out from Supabase.');
  }
}

export async function getUserForAccessToken(accessToken: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'GET',
    headers: getHeaders({
      Authorization: `Bearer ${accessToken}`,
    }),
  });

  return parseResponse<SupabaseUser>(response);
}

export function readSessionFromUrlHash() {
  if (typeof window === 'undefined') {
    return null;
  }

  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;

  if (!hash) {
    return null;
  }

  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (!accessToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
    type: params.get('type'),
  };
}

export function clearUrlHashSession() {
  if (typeof window === 'undefined') {
    return;
  }

  const url = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState({}, document.title, url);
}
