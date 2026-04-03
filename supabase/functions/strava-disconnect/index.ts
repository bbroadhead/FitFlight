// @ts-nocheck
import { corsHeaders, getSupabaseAdmin, json } from '../_shared/strava.ts';

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
    await supabase.from('strava_connections').delete().eq('user_id', String(userId));

    return json({ success: true });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Unable to disconnect Strava.' },
      { status: 500 }
    );
  }
});
