// @ts-nocheck
import {
  buildConnectionResponse,
  corsHeaders,
  exchangeCodeForTokens,
  fetchActivities,
  fetchAthlete,
  json,
  normalizeActivities,
  upsertActivities,
  upsertConnection,
} from '../_shared/strava.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { code, redirectUri, userId, email } = await request.json();
    if (!code || !redirectUri || !userId || !email) {
      return json({ error: 'Missing code, redirectUri, userId, or email.' }, { status: 400 });
    }

    const tokens = await exchangeCodeForTokens(String(code), String(redirectUri));
    const athlete = await fetchAthlete(String(tokens.access_token));
    const activities = await fetchActivities(String(tokens.access_token));
    const normalized = normalizeActivities(activities);

    await upsertConnection({
      userId: String(userId),
      email: String(email),
      athlete,
      tokens,
    });
    await upsertActivities(String(userId), activities);

    return json({
      connection: buildConnectionResponse({ athlete }),
      workouts: normalized,
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Unable to finish the Strava connection.' },
      { status: 500 }
    );
  }
});
