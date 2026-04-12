// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const ALLOWED_ROLES = new Set(['fitflight_creator', 'ufpm', 'demo', 'squadron_leadership']);
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ANALYTICS_DATA_URL = 'https://analyticsdata.googleapis.com/v1beta';
const GOOGLE_ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const TRACKED_EVENT_NAMES = [
  'sign_up',
  'login',
  'view_analytics_dashboard',
  'view_score_calculator',
  'export_calculator_score',
  'create_pt_session',
  'mark_attendance',
  'sync_strava',
  'open_leaderboard',
  'export_analytics_report',
];

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...(init.headers ?? {}),
    },
  });
}

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function getSupabaseAdmin() {
  return createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'));
}

function base64UrlEncode(input: ArrayBuffer | string) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodePkcs8PrivateKey(pem: string) {
  const normalized = pem.replace(/\\n/g, '\n').trim();
  const base64 = normalized
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function createServiceAccountAccessToken() {
  const clientEmail = getEnv('GA_CLIENT_EMAIL');
  const privateKey = decodePkcs8PrivateKey(getEnv('GA_PRIVATE_KEY'));
  const now = Math.floor(Date.now() / 1000);

  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: clientEmail,
      scope: GOOGLE_ANALYTICS_SCOPE,
      aud: GOOGLE_OAUTH_TOKEN_URL,
      exp: now + 3600,
      iat: now,
    })
  );
  const unsignedToken = `${header}.${claimSet}`;

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKey,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const assertion = `${unsignedToken}.${base64UrlEncode(signature)}`;
  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.access_token !== 'string') {
    throw new Error(
      typeof payload.error_description === 'string'
        ? payload.error_description
        : 'Unable to authorize Google Analytics access.'
    );
  }

  return payload.access_token;
}

async function runReport(propertyId: string, accessToken: string, body: Record<string, unknown>) {
  const response = await fetch(`${GOOGLE_ANALYTICS_DATA_URL}/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        payload?.message ||
        'Unable to load Google Analytics data.'
    );
  }

  return payload;
}

function metricValue(row: any, index: number) {
  return Number(row?.metricValues?.[index]?.value ?? 0);
}

function dimensionValue(row: any, index: number) {
  return String(row?.dimensionValues?.[index]?.value ?? '');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed.' }, { status: 405 });
  }

  try {
    const authorization = request.headers.get('Authorization') ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) {
      return json({ error: 'Missing authorization token.' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user?.email) {
      return json({ error: 'Unable to verify the requesting user.' }, { status: 401 });
    }

    const { data: roleRows, error: roleError } = await supabase
      .from('member_roles')
      .select('app_role')
      .eq('email', user.email.toLowerCase())
      .limit(1);

    if (roleError) {
      return json({ error: 'Unable to verify requester permissions.' }, { status: 500 });
    }

    const requesterRole = roleRows?.[0]?.app_role;
    if (!ALLOWED_ROLES.has(requesterRole)) {
      return json({ error: 'You do not have permission to view app usage analytics.' }, { status: 403 });
    }

    const propertyId = getEnv('GA_PROPERTY_ID');
    const measurementId = Deno.env.get('GA_MEASUREMENT_ID') ?? undefined;
    const googleAccessToken = await createServiceAccountAccessToken();

    const [summaryReport, eventsReport, dailyReport] = await Promise.all([
      runReport(propertyId, googleAccessToken, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        metrics: [
          { name: 'activeUsers' },
          { name: 'newUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'engagedSessions' },
          { name: 'averageSessionDuration' },
        ],
      }),
      runReport(propertyId, googleAccessToken, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            inListFilter: {
              values: TRACKED_EVENT_NAMES,
            },
          },
        },
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
        limit: 25,
      }),
      runReport(propertyId, googleAccessToken, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
    ]);

    const summaryRow = summaryReport.rows?.[0];
    const events = (eventsReport.rows ?? []).map((row: any) => ({
      eventName: dimensionValue(row, 0),
      eventCount: metricValue(row, 0),
      totalUsers: metricValue(row, 1),
    }));
    const daily = (dailyReport.rows ?? []).map((row: any) => ({
      date: dimensionValue(row, 0),
      activeUsers: metricValue(row, 0),
      sessions: metricValue(row, 1),
    }));

    return json({
      propertyId,
      measurementId,
      rangeLabel: 'Last 30 days',
      generatedAt: new Date().toISOString(),
      summary: {
        activeUsers: metricValue(summaryRow, 0),
        newUsers: metricValue(summaryRow, 1),
        sessions: metricValue(summaryRow, 2),
        screenPageViews: metricValue(summaryRow, 3),
        engagedSessions: metricValue(summaryRow, 4),
        averageSessionDuration: metricValue(summaryRow, 5),
      },
      events,
      daily,
    });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : 'Unable to load Google Analytics data.',
      },
      { status: 500 }
    );
  }
});
