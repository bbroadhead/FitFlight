import type { AccountType, Flight, Member, PTSession, Squadron } from '@/lib/store';
import { getValidAccessToken } from '@/lib/supabaseAuth';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '') ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const ROSTER_BACKED_SQUADRON = 'Hawks' as const;

type SupabaseRow = Record<string, unknown>;
type RosterColumnName = 'FULL_NAME' | 'RANK' | 'FLT-DET';
type MemberRoleRow = {
  email: string;
  app_role: AccountType;
};
type AttendanceSessionRow = {
  id: string;
  date: string;
  flight: Flight;
  squadron: Squadron;
  created_by: string;
};
type AttendanceAttendeeRow = {
  session_id: string;
  member_id: string;
};

const FLIGHT_MAP: Record<string, Flight> = {
  apex: 'Apex',
  bomber: 'Bomber',
  cryptid: 'Cryptid',
  doom: 'Doom',
  ewok: 'Ewok',
  foxhound: 'Foxhound',
  adf: 'ADF',
  det: 'DET',
  'a flt': 'Apex',
  'b flt': 'Bomber',
  'c flt': 'Cryptid',
  'd flt': 'Doom',
  'e flt': 'Ewok',
  'f flt': 'Foxhound',
  'det 1': 'DET',
};

const RANK_MAP: Record<string, string> = {
  ab: 'AB',
  amn: 'Amn',
  a1c: 'A1C',
  sra: 'SrA',
  ssgt: 'SSgt',
  tsgt: 'TSgt',
  msgt: 'MSgt',
  smsgt: 'SMSgt',
  cmsgt: 'CMSgt',
};

const RANK_TO_ROSTER: Record<string, string> = {
  AB: 'AB',
  Amn: 'AMN',
  A1C: 'A1C',
  SrA: 'SRA',
  SSgt: 'SSG',
  TSgt: 'TSG',
  MSgt: 'MSG',
  SMSgt: 'SMS',
  CMSgt: 'CMS',
};

const FLIGHT_TO_ROSTER: Record<Flight, string> = {
  Apex: 'A FLT',
  Bomber: 'B FLT',
  Cryptid: 'C FLT',
  Doom: 'D FLT',
  Ewok: 'E FLT',
  Foxhound: 'F FLT',
  ADF: 'ADF',
  DET: 'DET 1',
};

async function getHeaders(accessToken?: string) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase data is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }

  const resolvedAccessToken = await getValidAccessToken(accessToken ?? null);

  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${resolvedAccessToken ?? SUPABASE_ANON_KEY}`,
  };
}

function parseResponse<T>(payload: unknown): T {
  return payload as T;
}

function getStringValue(row: SupabaseRow, candidates: string[]) {
  for (const candidate of candidates) {
    const direct = row[candidate];
    if (typeof direct === 'string' && direct.trim()) {
      return direct.trim();
    }

    const normalizedCandidate = candidate.replace(/[^a-z0-9]/gi, '').toLowerCase();
    const matchedKey = Object.keys(row).find((key) => key.replace(/[^a-z0-9]/gi, '').toLowerCase() === normalizedCandidate);
    const value = matchedKey ? row[matchedKey] : undefined;
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function normalizeFlight(value: string): Flight | null {
  const normalized = value.trim().toLowerCase();
  return FLIGHT_MAP[normalized] ?? null;
}

function normalizeRank(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\./g, '');
  return RANK_MAP[normalized] ?? value.trim();
}

function parseName(value: string) {
  if (!value.trim()) {
    return null;
  }

  if (value.includes(',')) {
    const [lastPart, firstPart = ''] = value.split(',', 2);
    const firstName = firstPart.trim().split(/\s+/)[0] ?? '';
    const lastName = lastPart.trim();
    if (!firstName || !lastName) {
      return null;
    }

    return { firstName, lastName };
  }

  const parts = value.trim().split(/\s+/);
  if (parts.length < 2) {
    return null;
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getAccountType(firstName: string, lastName: string): AccountType {
  const normalizedFirstName = firstName.trim().toLowerCase();
  const normalizedLastName = lastName.trim().toLowerCase();

  if (normalizedFirstName === 'benjamin' && normalizedLastName === 'broadhead') {
    return 'fitflight_creator';
  }

  if (normalizedFirstName === 'jacob' && normalizedLastName === 'de la rosa') {
    return 'ufpm';
  }

  return 'standard';
}

function buildEmail(row: SupabaseRow, firstName: string, lastName: string) {
  const explicitEmail = getStringValue(row, ['email', 'email_address', 'mail']);
  if (explicitEmail) {
    return explicitEmail.toLowerCase();
  }

  return `${slugify(firstName)}.${slugify(lastName).replace(/-/g, '.')}`.replace(/\.\./g, '.') + '@us.af.mil';
}

async function getRosterHeaders(accessToken?: string) {
  return {
    ...(await getHeaders(accessToken)),
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };
}

function getRosterFullName(member: Pick<Member, 'firstName' | 'lastName'>) {
  return `${member.lastName.toUpperCase()}, ${member.firstName.toUpperCase()}`;
}

function getRosterFlight(member: Pick<Member, 'flight'>) {
  return FLIGHT_TO_ROSTER[member.flight];
}

function getRosterPayload(member: Member): Record<RosterColumnName, string> {
  return {
    FULL_NAME: getRosterFullName(member),
    RANK: RANK_TO_ROSTER[member.rank] ?? member.rank.toUpperCase(),
    'FLT-DET': getRosterFlight(member),
  };
}

function buildRosterFilter(member: Pick<Member, 'firstName' | 'lastName' | 'rank' | 'flight'>) {
  const params = new URLSearchParams();
  params.set('FULL_NAME', `eq.${getRosterFullName(member)}`);
  params.set('RANK', `eq.${RANK_TO_ROSTER[member.rank] ?? member.rank.toUpperCase()}`);
  params.set('FLT-DET', `eq.${getRosterFlight(member)}`);
  return params.toString();
}

async function getMemberRoleHeaders(accessToken?: string) {
  return {
    ...(await getHeaders(accessToken)),
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

function normalizeRosterRow(row: SupabaseRow): Member | null {
  const nameValue = getStringValue(row, ['name', 'full_name', 'member_name', 'FULL_NAME']);
  const firstNameValue = getStringValue(row, ['first_name', 'firstname', 'first']);
  const lastNameValue = getStringValue(row, ['last_name', 'lastname', 'last']);
  const parsedName = nameValue ? parseName(nameValue) : null;
  const firstName = firstNameValue || parsedName?.firstName || '';
  const lastName = lastNameValue || parsedName?.lastName || '';
  const rank = normalizeRank(getStringValue(row, ['rank', 'grade', 'RANK']));
  const flight = normalizeFlight(getStringValue(row, ['flight', 'flt', 'section', 'FLT-DET']));

  if (!firstName || !lastName || !rank || !flight) {
    return null;
  }

  if (firstName.toLowerCase() === 'benjamin' && lastName.toLowerCase() === 'broadhead') {
    return null;
  }

  const squadron = 'Hawks' as Squadron;
  const email = buildEmail(row, firstName, lastName);
  const stableId = getStringValue(row, ['id', 'member_id']) || `roster-${slugify(`${rank}-${lastName}-${firstName}-${flight}`)}`;

  return {
    id: stableId,
    rank,
    firstName,
    lastName,
    flight,
    squadron,
    accountType: getAccountType(firstName, lastName),
    email,
    exerciseMinutes: 0,
    distanceRun: 0,
    connectedApps: [],
    fitnessAssessments: [],
    workouts: [],
    achievements: [],
    requiredPTSessionsPerWeek: 3,
    isVerified: false,
    ptlPendingApproval: false,
    monthlyPlacements: [],
    trophyCount: 0,
    hasSeenTutorial: false,
  };
}

export async function fetchRosterMembers(accessToken?: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/roster?select=*`, {
    method: 'GET',
    headers: await getHeaders(accessToken),
  });

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to load roster from Supabase.';
    throw new Error(message);
  }

  const rows = parseResponse<SupabaseRow[]>(payload);
  return rows
    .map(normalizeRosterRow)
    .filter((member): member is Member => Boolean(member));
}

export async function fetchAttendanceSessions(accessToken?: string) {
  const [sessionsResponse, attendeesResponse] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/pt_sessions?select=id,date,flight,squadron,created_by`, {
      method: 'GET',
      headers: await getHeaders(accessToken),
    }),
    fetch(`${SUPABASE_URL}/rest/v1/pt_session_attendees?select=session_id,member_id`, {
      method: 'GET',
      headers: await getHeaders(accessToken),
    }),
  ]);

  const sessionsPayload = await sessionsResponse.json().catch(() => []);
  if (!sessionsResponse.ok) {
    const message =
      typeof (sessionsPayload as { message?: unknown }).message === 'string'
        ? (sessionsPayload as { message: string }).message
        : 'Unable to load attendance sessions from Supabase.';
    throw new Error(message);
  }

  const attendeesPayload = await attendeesResponse.json().catch(() => []);
  if (!attendeesResponse.ok) {
    const message =
      typeof (attendeesPayload as { message?: unknown }).message === 'string'
        ? (attendeesPayload as { message: string }).message
        : 'Unable to load attendance attendees from Supabase.';
    throw new Error(message);
  }

  const attendeeMap = new Map<string, string[]>();
  (attendeesPayload as AttendanceAttendeeRow[]).forEach((attendee) => {
    const current = attendeeMap.get(attendee.session_id) ?? [];
    current.push(attendee.member_id);
    attendeeMap.set(attendee.session_id, current);
  });

  return (sessionsPayload as AttendanceSessionRow[]).map((session) => ({
    id: session.id,
    date: session.date,
    flight: session.flight,
    squadron: session.squadron,
    createdBy: session.created_by,
    attendees: attendeeMap.get(session.id) ?? [],
  })).filter((session) => session.attendees.length > 0) as PTSession[];
}

async function ensureAttendanceSession(params: {
  date: string;
  flight: Flight;
  squadron: Squadron;
  createdBy: string;
  accessToken?: string;
}) {
  const query = new URLSearchParams();
  query.set('select', 'id,date,flight,squadron,created_by');
  query.set('date', `eq.${params.date}`);
  query.set('flight', `eq.${params.flight}`);
  query.set('squadron', `eq.${params.squadron}`);

  const existingResponse = await fetch(`${SUPABASE_URL}/rest/v1/pt_sessions?${query.toString()}`, {
    method: 'GET',
    headers: await getHeaders(params.accessToken),
  });

  const existingPayload = await existingResponse.json().catch(() => []);
  if (!existingResponse.ok) {
    const message =
      typeof (existingPayload as { message?: unknown }).message === 'string'
        ? (existingPayload as { message: string }).message
        : 'Unable to look up attendance session in Supabase.';
    throw new Error(message);
  }

  const existing = (existingPayload as AttendanceSessionRow[])[0];
  if (existing) {
    return existing;
  }

  const sessionId = `pt-${params.squadron}-${params.flight}-${params.date}`;
  const createResponse = await fetch(`${SUPABASE_URL}/rest/v1/pt_sessions`, {
    method: 'POST',
    headers: {
      ...(await getHeaders(params.accessToken)),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id: sessionId,
      date: params.date,
      flight: params.flight,
      squadron: params.squadron,
      created_by: params.createdBy,
    }),
  });

  const createPayload = await createResponse.json().catch(() => []);
  if (!createResponse.ok) {
    const message =
      typeof (createPayload as { message?: unknown }).message === 'string'
        ? (createPayload as { message: string }).message
        : 'Unable to create attendance session in Supabase.';
    throw new Error(message);
  }

  return (createPayload as AttendanceSessionRow[])[0] ?? {
    id: sessionId,
    date: params.date,
    flight: params.flight,
    squadron: params.squadron,
    created_by: params.createdBy,
  };
}

export async function setAttendanceStatus(params: {
  date: string;
  flight: Flight;
  squadron: Squadron;
  memberId: string;
  createdBy: string;
  isAttending: boolean;
  accessToken?: string;
}) {
  const session = await ensureAttendanceSession(params);

  if (params.isAttending) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/pt_session_attendees`, {
      method: 'POST',
      headers: {
        ...(await getHeaders(params.accessToken)),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        session_id: session.id,
        member_id: params.memberId,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message =
        typeof (payload as { message?: unknown }).message === 'string'
          ? (payload as { message: string }).message
          : 'Unable to mark attendance in Supabase.';
      throw new Error(message);
    }
  } else {
    const attendeeFilter = new URLSearchParams();
    attendeeFilter.set('session_id', `eq.${session.id}`);
    attendeeFilter.set('member_id', `eq.${params.memberId}`);

    const response = await fetch(`${SUPABASE_URL}/rest/v1/pt_session_attendees?${attendeeFilter.toString()}`, {
      method: 'DELETE',
      headers: await getHeaders(params.accessToken),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message =
        typeof (payload as { message?: unknown }).message === 'string'
          ? (payload as { message: string }).message
          : 'Unable to remove attendance in Supabase.';
      throw new Error(message);
    }

    const remainingAttendeesResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/pt_session_attendees?select=member_id&session_id=eq.${encodeURIComponent(session.id)}`,
      {
        method: 'GET',
        headers: await getHeaders(params.accessToken),
      }
    );

    const remainingAttendeesPayload = await remainingAttendeesResponse.json().catch(() => []);
    if (!remainingAttendeesResponse.ok) {
      const message =
        typeof (remainingAttendeesPayload as { message?: unknown }).message === 'string'
          ? (remainingAttendeesPayload as { message: string }).message
          : 'Unable to verify remaining attendance in Supabase.';
      throw new Error(message);
    }

    if ((remainingAttendeesPayload as AttendanceAttendeeRow[]).length === 0) {
      const deleteSessionResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/pt_sessions?id=eq.${encodeURIComponent(session.id)}`,
        {
          method: 'DELETE',
          headers: await getHeaders(params.accessToken),
        }
      );

      if (!deleteSessionResponse.ok) {
        const payload = await deleteSessionResponse.json().catch(() => ({}));
        const message =
          typeof (payload as { message?: unknown }).message === 'string'
            ? (payload as { message: string }).message
            : 'Unable to clean up empty PT session in Supabase.';
        throw new Error(message);
      }
    }
  }

  return fetchAttendanceSessions(params.accessToken);
}

export async function createRosterMember(member: Member, accessToken?: string) {
  if (member.squadron !== ROSTER_BACKED_SQUADRON) {
    return;
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/roster`, {
    method: 'POST',
    headers: await getRosterHeaders(accessToken),
    body: JSON.stringify(getRosterPayload(member)),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to add member to Supabase roster.';
    throw new Error(message);
  }
}

export async function updateRosterMember(previousMember: Member, nextMember: Member, accessToken?: string) {
  if (previousMember.squadron !== ROSTER_BACKED_SQUADRON && nextMember.squadron !== ROSTER_BACKED_SQUADRON) {
    return;
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/roster?${buildRosterFilter(previousMember)}`, {
    method: 'PATCH',
    headers: await getRosterHeaders(accessToken),
    body: JSON.stringify(getRosterPayload(nextMember)),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to update member in Supabase roster.';
    throw new Error(message);
  }
}

export async function deleteRosterMember(member: Member, accessToken?: string) {
  if (member.squadron !== ROSTER_BACKED_SQUADRON) {
    return;
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/roster?${buildRosterFilter(member)}`, {
    method: 'DELETE',
    headers: await getRosterHeaders(accessToken),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to delete member from Supabase roster.';
    throw new Error(message);
  }
}

export async function fetchRoleForEmail(email: string, accessToken?: string) {
  const encodedEmail = encodeURIComponent(email.toLowerCase());
  const response = await fetch(`${SUPABASE_URL}/rest/v1/member_roles?select=email,app_role&email=eq.${encodedEmail}`, {
    method: 'GET',
    headers: await getHeaders(accessToken),
  });

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to load member role from Supabase.';
    throw new Error(message);
  }

  const rows = payload as MemberRoleRow[];
  return rows[0] ?? null;
}

export async function ensureMemberRole(email: string, role: AccountType, accessToken?: string) {
  const existing = await fetchRoleForEmail(email, accessToken).catch(() => null);
  if (existing) {
    return existing;
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/member_roles`, {
    method: 'POST',
    headers: await getMemberRoleHeaders(accessToken),
    body: JSON.stringify({
      email: email.toLowerCase(),
      app_role: role,
    }),
  });

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to create member role.';
    throw new Error(message);
  }

  const rows = payload as MemberRoleRow[];
  return rows[0] ?? { email: email.toLowerCase(), app_role: role };
}

export async function updateMemberRole(email: string, role: AccountType, accessToken?: string) {
  const encodedEmail = encodeURIComponent(email.toLowerCase());
  const response = await fetch(`${SUPABASE_URL}/rest/v1/member_roles?email=eq.${encodedEmail}`, {
    method: 'PATCH',
    headers: await getMemberRoleHeaders(accessToken),
    body: JSON.stringify({
      app_role: role,
    }),
  });

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to update member role.';
    throw new Error(message);
  }

  const rows = payload as MemberRoleRow[];
  return rows[0] ?? { email: email.toLowerCase(), app_role: role };
}

export async function assignUFPMRole(nextEmail: string, accessToken?: string) {
  const currentUFPMResponse = await fetch(`${SUPABASE_URL}/rest/v1/member_roles?select=email,app_role&app_role=eq.ufpm`, {
    method: 'GET',
    headers: await getHeaders(accessToken),
  });

  const currentUFPMPayload = await currentUFPMResponse.json().catch(() => []);
  if (!currentUFPMResponse.ok) {
    const message =
      typeof (currentUFPMPayload as { message?: unknown }).message === 'string'
        ? (currentUFPMPayload as { message: string }).message
        : 'Unable to load the current UFPM role.';
    throw new Error(message);
  }

  const currentUFPM = (currentUFPMPayload as MemberRoleRow[])[0] ?? null;

  if (currentUFPM && currentUFPM.email.toLowerCase() !== nextEmail.toLowerCase()) {
    await updateMemberRole(currentUFPM.email, 'ptl', accessToken);
  }

  const existingNextRole = await fetchRoleForEmail(nextEmail, accessToken).catch(() => null);
  if (existingNextRole) {
    await updateMemberRole(nextEmail, 'ufpm', accessToken);
  } else {
    await ensureMemberRole(nextEmail, 'ufpm', accessToken);
  }

  return {
    previousUFPMEmail: currentUFPM?.email ?? null,
    nextUFPMEmail: nextEmail.toLowerCase(),
  };
}
