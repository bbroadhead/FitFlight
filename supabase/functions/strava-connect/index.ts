// @ts-nocheck
import { corsHeaders, createAuthRedirect, json } from '../_shared/strava.ts';

Deno.serve((request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);
    const state = url.searchParams.get('state');
    const redirectUri = url.searchParams.get('redirect_uri');

    if (!state || !redirectUri) {
      return json({ error: 'Missing state or redirect_uri.' }, { status: 400 });
    }

    return Response.redirect(createAuthRedirect(state, redirectUri), 302);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Unable to start the Strava connection.' },
      { status: 500 }
    );
  }
});
