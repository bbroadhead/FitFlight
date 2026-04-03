// @ts-nocheck
import {
  buildConnectionResponse,
  corsHeaders,
  ensureFreshConnection,
  fetchActivities,
  fetchAthlete,
  getSupabaseAdmin,
  json,
  normalizeActivities,
  upsertActivities,
} from '../_shared/strava.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId } = await request.json();
    if (!userId) {
      return json({ error: 'Missing userId.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: connection, error } = await supabase
      .from('strava_connections')
      .select('*')
      .eq('user_id', String(userId))
      .maybeSingle();

    if (error || !connection) {
      return json({ error: 'No Strava connection found for this user.' }, { status: 404 });
    }

    const freshConnection = await ensureFreshConnection(connection);
    const activities = await fetchActivities(freshConnection.access_token, freshConnection.last_synced_at);
    const normalized = normalizeActivities(activities);
    const athlete = await fetchAthlete(freshConnection.access_token);
    const syncedAt = new Date().toISOString();

    await upsertActivities(String(userId), activities);
    await supabase
      .from('strava_connections')
      .update({ last_synced_at: syncedAt })
      .eq('user_id', String(userId));

    return json({
      connection: buildConnectionResponse({ athlete, syncedAt }),
      workouts: normalized,
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Unable to sync Strava workouts.' },
      { status: 500 }
    );
  }
});
