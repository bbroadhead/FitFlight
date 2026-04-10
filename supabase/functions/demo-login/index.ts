// @ts-nocheck
import { corsHeaders, json } from '../_shared/strava.ts';

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

function matchesAllowedKey(candidateKey: string) {
  const allowedKeys = (Deno.env.get('DEMO_LOGIN_KEYS') ?? Deno.env.get('DEMO_LOGIN_KEY') ?? '392demo')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return allowedKeys.includes(candidateKey);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed.' }, { status: 405 });
  }

  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key')?.trim() ?? '';

    if (!key || !matchesAllowedKey(key)) {
      return json({ error: 'Invalid demo access key.' }, { status: 403 });
    }

    const supabaseUrl = env('SUPABASE_URL', 'BACKEND_URL').replace(/\/+$/, '');
    const supabaseKey =
      Deno.env.get('SUPABASE_ANON_KEY') ??
      Deno.env.get('EXPO_PUBLIC_SUPABASE_ANON_KEY') ??
      env('SUPABASE_SERVICE_ROLE_KEY', 'BACKEND_SERVICE_ROLE_KEY');
    const email = Deno.env.get('DEMO_LOGIN_EMAIL')?.trim().toLowerCase() || 'fitflight@us.af.mil';
    const password = env('DEMO_LOGIN_PASSWORD');

    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json(
        {
          error:
            payload?.error_description ||
            payload?.msg ||
            payload?.error ||
            'Unable to create a demo session.',
        },
        { status: response.status }
      );
    }

    return json({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      user: payload.user,
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Unable to create a demo session.' },
      { status: 500 }
    );
  }
});
