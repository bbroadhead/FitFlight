// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function getRequiredEnv(name: string, fallbackName?: string) {
  const value = Deno.env.get(name) ?? (fallbackName ? Deno.env.get(fallbackName) : undefined);
  if (!value) {
    throw new Error(fallbackName ? `Missing ${name} or ${fallbackName}.` : `Missing ${name}.`);
  }
  return value;
}

function getSupabaseAdmin() {
  return createClient(
    getRequiredEnv('SUPABASE_URL', 'BACKEND_URL'),
    getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'BACKEND_SERVICE_ROLE_KEY')
  );
}

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

const ALLOWED_ROLES = new Set([
  'fitflight_creator',
  'ufpm',
  'squadron_leadership',
  'group_personnel',
  'pfl',
  'ptl',
]);

const ROSTER_TABLES = {
  Hawks: 'roster',
  Tigers: 'tigers_roster',
  Krakens: 'krakens_roster',
  Warriors: 'warriors_roster',
  Knights: 'knights_roster',
};

const PASSWORD_SUFFIXES = {
  Hawks: '392',
  Krakens: '8',
  Tigers: '324',
  Warriors: '792',
  Knights: '692',
};

function lettersOnly(value: string) {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

function buildTemporaryPassword(member: { firstName: string; middleInitial?: string; lastName: string }, suffix: string) {
  const firstInitial = lettersOnly(member.firstName).slice(0, 1);
  const middleInitial = lettersOnly(member.middleInitial ?? '').slice(0, 1);
  const lastNameRoot = lettersOnly(member.lastName).slice(0, 5);
  return `${firstInitial}${middleInitial}${lastNameRoot}${suffix}`;
}

function isDuplicateAuthUserError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.toLowerCase().includes('already been registered');
}

async function linkRosterMember(supabase, table: string, email: string, authUserId: string) {
  const { data: rosterRows, error: rosterError } = await supabase
    .from(table)
    .update({
      AUTH_USER_ID: authUserId,
      MUST_CHANGE_PASSWORD: true,
      HAS_LOGGED_INTO_APP: false,
    })
    .eq('EMAIL', email)
    .select('EMAIL');

  if (rosterError || !rosterRows?.length) {
    throw new Error(rosterError?.message || 'The imported roster record could not be confirmed.');
  }
}

async function provisionMember(supabase, table: string, suffix: string, member, existingAuthUserId?: string) {
  if (existingAuthUserId) {
    try {
      await linkRosterMember(supabase, table, member.email, existingAuthUserId);
      return { email: member.email, status: 'existing' };
    } catch (error) {
      return { email: member.email, status: 'failed', error: error.message || 'Unable to link the existing account.' };
    }
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: member.email,
    password: buildTemporaryPassword(member, suffix),
    email_confirm: true,
    user_metadata: {
      firstName: member.firstName,
      lastName: member.lastName,
      provisionedByRoster: true,
      mustChangePassword: true,
    },
  });

  if (error) {
    if (isDuplicateAuthUserError(error)) {
      return { email: member.email, status: 'existing' };
    }
    return { email: member.email, status: 'failed', error: error.message || 'Unable to create the account.' };
  }

  if (!data.user?.id) {
    return { email: member.email, status: 'failed', error: 'Supabase did not return the created account ID.' };
  }

  try {
    await linkRosterMember(supabase, table, member.email, data.user.id);
  } catch (rosterError) {
    // Do not leave an orphaned account with a password the app cannot track.
    await supabase.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    return {
      email: member.email,
      status: 'failed',
      error: rosterError instanceof Error ? rosterError.message : 'The imported roster record could not be confirmed.',
    };
  }

  return { email: member.email, status: 'created' };
}

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
    const { data: requesterData, error: requesterError } = await supabase.auth.getUser(token);
    const requester = requesterData.user;
    if (requesterError || !requester?.email) {
      return json({ error: 'Unable to verify the requesting user.' }, { status: 401 });
    }

    const requesterEmail = requester.email.toLowerCase();
    const { data: roleRows, error: roleError } = await supabase
      .from('member_roles')
      .select('app_role')
      .eq('email', requesterEmail)
      .limit(1);
    const requesterRole = roleRows?.[0]?.app_role;
    if (roleError || !ALLOWED_ROLES.has(requesterRole)) {
      return json({ error: 'You do not have permission to provision roster accounts.' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const squadron = typeof body?.squadron === 'string' ? body.squadron.trim() : '';
    const table = ROSTER_TABLES[squadron];
    const suffix = PASSWORD_SUFFIXES[squadron];
    const requestedMembers = Array.isArray(body?.members) ? body.members : [];
    if (!table || !suffix) {
      return json({ error: 'Unsupported squadron.' }, { status: 400 });
    }
    if (requestedMembers.length === 0 || requestedMembers.length > 500) {
      return json({ error: 'Provide between 1 and 500 roster members.' }, { status: 400 });
    }

    // Only the FitFlight creator may provision accounts into another squadron.
    if (requesterRole !== 'fitflight_creator') {
      const { data: requesterRosterRows, error: requesterRosterError } = await supabase
        .from(table)
        .select('EMAIL')
        .eq('EMAIL', requesterEmail)
        .limit(1);
      if (requesterRosterError || !requesterRosterRows?.length) {
        return json({ error: 'You can only provision accounts for your own squadron.' }, { status: 403 });
      }
    }

    const seenEmails = new Set<string>();
    const members = requestedMembers
      .map((member) => ({
        email: typeof member?.email === 'string' ? member.email.trim().toLowerCase() : '',
        firstName: typeof member?.firstName === 'string' ? member.firstName.trim() : '',
        middleInitial: typeof member?.middleInitial === 'string' ? member.middleInitial.trim() : '',
        lastName: typeof member?.lastName === 'string' ? member.lastName.trim() : '',
      }))
      .filter((member) => {
        if (!member.email || !member.firstName || !member.lastName || seenEmails.has(member.email)) {
          return false;
        }
        seenEmails.add(member.email);
        return true;
      });

    if (members.length === 0) {
      return json({ error: 'No valid roster members were supplied.' }, { status: 400 });
    }

    const { data: authUsers, error: authUsersError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (authUsersError) {
      return json({ error: 'Unable to inspect existing Supabase Auth accounts.' }, { status: 500 });
    }
    const authUsersByEmail = new Map(
      (authUsers.users ?? [])
        .filter((user) => user.email)
        .map((user) => [user.email.toLowerCase(), user.id])
    );

    const results = [];
    // A small concurrency limit avoids overwhelming the Auth API on large rosters.
    for (let index = 0; index < members.length; index += 10) {
      const batch = await Promise.all(
        members.slice(index, index + 10).map((member) =>
          provisionMember(supabase, table, suffix, member, authUsersByEmail.get(member.email))
        )
      );
      results.push(...batch);
    }

    const created = results.filter((result) => result.status === 'created').length;
    const existing = results.filter((result) => result.status === 'existing').length;
    const failed = results.filter((result) => result.status === 'failed');
    return json({
      created,
      existing,
      failed: failed.length,
      failures: failed.slice(0, 20),
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Unable to provision roster accounts.' },
      { status: 500 }
    );
  }
});
