// @ts-nocheck
import { corsHeaders, getSupabaseAdmin, json } from '../_shared/strava.ts';

const ALLOWED_RESET_ROLES = new Set(['fitflight_creator', 'ufpm', 'demo']);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
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
      data: { user: requester },
      error: requesterError,
    } = await supabase.auth.getUser(token);

    if (requesterError || !requester?.email) {
      return json({ error: 'Unable to verify the requesting user.' }, { status: 401 });
    }

    const requesterEmail = requester.email.toLowerCase();
    const { data: roleRows, error: roleError } = await supabase
      .from('member_roles')
      .select('app_role')
      .eq('email', requesterEmail)
      .limit(1);

    if (roleError) {
      return json({ error: 'Unable to verify requester permissions.' }, { status: 500 });
    }

    const requesterRole = roleRows?.[0]?.app_role;
    if (!ALLOWED_RESET_ROLES.has(requesterRole)) {
      return json({ error: 'You do not have permission to reset user passwords.' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const targetEmail =
      typeof body?.targetEmail === 'string' ? body.targetEmail.trim().toLowerCase() : '';
    const newPassword =
      typeof body?.newPassword === 'string' ? body.newPassword.trim() : '';

    if (!targetEmail) {
      return json({ error: 'Target email is required.' }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return json({ error: 'New password must be at least 8 characters long.' }, { status: 400 });
    }

    const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (usersError) {
      return json({ error: 'Unable to load Supabase users.' }, { status: 500 });
    }

    const targetUser = usersData?.users?.find((candidate) => candidate.email?.toLowerCase() === targetEmail);
    if (!targetUser) {
      return json({ error: 'No Supabase Auth user exists for that email.' }, { status: 404 });
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(targetUser.id, {
      password: newPassword,
    });

    if (updateError) {
      return json({ error: updateError.message || 'Unable to reset the user password.' }, { status: 500 });
    }

    return json({ success: true });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Unable to reset the user password.' },
      { status: 500 }
    );
  }
});
