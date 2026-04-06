import type { AccountType, Flight, Member, PTSession, SharedWorkout, Squadron, WorkoutType } from '@/lib/store';
import { getValidAccessToken } from '@/lib/supabaseAuth';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '') ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const ROSTER_BACKED_SQUADRON = 'Hawks' as const;
const DEFAULT_ROSTER_TABLE = 'roster';

type SupabaseRow = Record<string, unknown>;
type RosterColumnName =
  | 'FULL_NAME'
  | 'RANK'
  | 'EMAIL'
  | 'FLT-DET'
  | 'PROFILE_PICTURE'
  | 'MUST_CHANGE_PASSWORD'
  | 'HAS_LOGGED_INTO_APP';
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
type SupportThreadRow = {
  id: string;
  requester_member_id: string;
  requester_email: string;
  requester_name: string;
  requester_squadron: Squadron;
  subject: string;
  created_at: string;
  updated_at: string;
};
type SupportMessageRow = {
  id: string;
  thread_id: string;
  sender_member_id: string;
  sender_email: string;
  sender_name: string;
  subject: string | null;
  body: string;
  is_from_owner: boolean;
  created_at: string;
  read_by_owner: boolean;
  read_by_requester: boolean;
};

type SharedWorkoutRow = {
  id: string;
  name: string;
  type: WorkoutType;
  duration: number;
  intensity: number;
  description: string | null;
  is_multi_step: boolean;
  steps: string[] | null;
  created_by: string;
  created_at: string;
  squadron: Squadron;
  thumbs_up: string[] | null;
  thumbs_down: string[] | null;
  favorited_by: string[] | null;
};

type ManualWorkoutSubmissionStatus = 'pending' | 'approved' | 'denied';

type ManualWorkoutSubmissionRow = {
  id: string;
  member_id: string;
  member_email: string;
  member_name: string;
  member_rank: string;
  member_flight: Flight;
  squadron: Squadron;
  workout_date: string;
  workout_type: WorkoutType;
  duration: number;
  distance: number | null;
  is_private: boolean;
  proof_image_data: string;
  status: ManualWorkoutSubmissionStatus;
  reviewer_member_id: string | null;
  reviewer_name: string | null;
  reviewer_note: string | null;
  requester_read: boolean;
  reviewer_read: boolean;
  created_at: string;
  updated_at: string;
};

export type SupportMessage = {
  id: string;
  threadId: string;
  senderMemberId: string;
  senderEmail: string;
  senderName: string;
  subject: string | null;
  body: string;
  isFromOwner: boolean;
  createdAt: string;
  readByOwner: boolean;
  readByRequester: boolean;
};

export type SupportThreadSummary = {
  id: string;
  requesterMemberId: string;
  requesterEmail: string;
  requesterName: string;
  requesterSquadron: Squadron;
  subject: string;
  createdAt: string;
  updatedAt: string;
  latestMessagePreview: string;
  messageCount: number;
  unreadForOwner: number;
  unreadForRequester: number;
};

export type ManualWorkoutSubmission = {
  id: string;
  memberId: string;
  memberEmail: string;
  memberName: string;
  memberRank: string;
  memberFlight: Flight;
  squadron: Squadron;
  workoutDate: string;
  workoutType: WorkoutType;
  duration: number;
  distance?: number;
  isPrivate: boolean;
  proofImageData: string;
  status: ManualWorkoutSubmissionStatus;
  reviewerMemberId: string | null;
  reviewerName: string | null;
  reviewerNote: string | null;
  requesterRead: boolean;
  reviewerRead: boolean;
  createdAt: string;
  updatedAt: string;
};

type RosterPasswordStatus = {
  mustChangePassword: boolean;
  hasLoggedIntoApp: boolean;
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

function createSupportId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeSharedWorkoutRow(row: SharedWorkoutRow): SharedWorkout {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    duration: row.duration,
    intensity: row.intensity,
    description: row.description ?? '',
    isMultiStep: row.is_multi_step,
    steps: row.steps ?? [],
    createdBy: row.created_by,
    createdAt: row.created_at,
    squadron: row.squadron,
    thumbsUp: row.thumbs_up ?? [],
    thumbsDown: row.thumbs_down ?? [],
    favoritedBy: row.favorited_by ?? [],
  };
}

function normalizeManualWorkoutSubmissionRow(row: ManualWorkoutSubmissionRow): ManualWorkoutSubmission {
  return {
    id: row.id,
    memberId: row.member_id,
    memberEmail: row.member_email,
    memberName: row.member_name,
    memberRank: row.member_rank,
    memberFlight: row.member_flight,
    squadron: row.squadron,
    workoutDate: row.workout_date,
    workoutType: row.workout_type,
    duration: row.duration,
    distance: typeof row.distance === 'number' ? row.distance : undefined,
    isPrivate: row.is_private,
    proofImageData: row.proof_image_data,
    status: row.status,
    reviewerMemberId: row.reviewer_member_id,
    reviewerName: row.reviewer_name,
    reviewerNote: row.reviewer_note,
    requesterRead: row.requester_read,
    reviewerRead: row.reviewer_read,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

function getBooleanValue(row: SupabaseRow, candidates: string[]) {
  for (const candidate of candidates) {
    const direct = row[candidate];
    if (typeof direct === 'boolean') {
      return direct;
    }

    if (typeof direct === 'string') {
      const normalized = direct.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }

    const normalizedCandidate = candidate.replace(/[^a-z0-9]/gi, '').toLowerCase();
    const matchedKey = Object.keys(row).find((key) => key.replace(/[^a-z0-9]/gi, '').toLowerCase() === normalizedCandidate);
    const value = matchedKey ? row[matchedKey] : undefined;
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }
  }

  return null;
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

function getRosterTableName(squadron: Squadron = 'Hawks') {
  if (squadron === ROSTER_BACKED_SQUADRON) {
    return DEFAULT_ROSTER_TABLE;
  }

  return `${slugify(squadron).replace(/-/g, '_')}_roster`;
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

  if (
    (normalizedFirstName === 'benjamin' && normalizedLastName === 'isenberg') ||
    (normalizedFirstName === 'jessica' && normalizedLastName === 'kick') ||
    (normalizedFirstName === 'nicky' && normalizedLastName === 'spader')
  ) {
    return 'squadron_leadership';
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

function getRosterPayload(
  member: Member
): Record<RosterColumnName, string | boolean> {
  return {
    FULL_NAME: getRosterFullName(member),
    RANK: RANK_TO_ROSTER[member.rank] ?? member.rank.toUpperCase(),
    EMAIL: member.email.toLowerCase(),
    'FLT-DET': getRosterFlight(member),
    PROFILE_PICTURE: member.profilePicture ?? '',
    MUST_CHANGE_PASSWORD: member.mustChangePassword ?? false,
    HAS_LOGGED_INTO_APP: member.hasLoggedIntoApp ?? false,
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
  const mustChangePassword = getBooleanValue(row, ['must_change_password', 'MUST_CHANGE_PASSWORD']) ?? false;
  const hasLoggedIntoApp = getBooleanValue(row, ['has_logged_into_app', 'HAS_LOGGED_INTO_APP', 'has_logged_in', 'HAS_LOGGED_IN']) ?? false;
  const profilePicture = getStringValue(row, ['profile_picture', 'PROFILE_PICTURE']) || undefined;

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
    mustChangePassword,
    hasLoggedIntoApp,
    profilePicture,
  };
}

export async function fetchRosterMembers(accessToken?: string, squadron: Squadron = 'Hawks') {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${getRosterTableName(squadron)}?select=*`, {
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

export async function fetchSharedWorkouts(accessToken?: string, squadron?: Squadron) {
  const query = new URLSearchParams();
  query.set('select', 'id,name,type,duration,intensity,description,is_multi_step,steps,created_by,created_at,squadron,thumbs_up,thumbs_down,favorited_by');
  query.set('order', 'created_at.desc');
  if (squadron) {
    query.set('squadron', `eq.${squadron}`);
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/shared_workouts?${query.toString()}`, {
    method: 'GET',
    headers: await getHeaders(accessToken),
  });

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to load squadron workouts from Supabase.';
    throw new Error(message);
  }

  return (payload as SharedWorkoutRow[]).map(normalizeSharedWorkoutRow);
}

export async function createSharedWorkout(workout: SharedWorkout, accessToken?: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/shared_workouts`, {
    method: 'POST',
    headers: {
      ...(await getHeaders(accessToken)),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id: workout.id,
      name: workout.name,
      type: workout.type,
      duration: workout.duration,
      intensity: workout.intensity,
      description: workout.description,
      is_multi_step: workout.isMultiStep,
      steps: workout.steps,
      created_by: workout.createdBy,
      created_at: workout.createdAt,
      squadron: workout.squadron,
      thumbs_up: workout.thumbsUp,
      thumbs_down: workout.thumbsDown,
      favorited_by: workout.favoritedBy,
    }),
  });

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to create squadron workout in Supabase.';
    throw new Error(message);
  }

  return normalizeSharedWorkoutRow((payload as SharedWorkoutRow[])[0]);
}

export async function updateSharedWorkout(workout: SharedWorkout, accessToken?: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/shared_workouts?id=eq.${encodeURIComponent(workout.id)}`, {
    method: 'PATCH',
    headers: {
      ...(await getHeaders(accessToken)),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      thumbs_up: workout.thumbsUp,
      thumbs_down: workout.thumbsDown,
      favorited_by: workout.favoritedBy,
      name: workout.name,
      type: workout.type,
      duration: workout.duration,
      intensity: workout.intensity,
      description: workout.description,
      is_multi_step: workout.isMultiStep,
      steps: workout.steps,
    }),
  });

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to update squadron workout in Supabase.';
    throw new Error(message);
  }

  return normalizeSharedWorkoutRow((payload as SharedWorkoutRow[])[0]);
}

export async function deleteSharedWorkoutFromSupabase(id: string, accessToken?: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/shared_workouts?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await getHeaders(accessToken),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to delete squadron workout from Supabase.';
    throw new Error(message);
  }
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
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${getRosterTableName(member.squadron)}`, {
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
  const previousRosterTable = getRosterTableName(previousMember.squadron);
  const nextRosterTable = getRosterTableName(nextMember.squadron);

  if (previousRosterTable !== nextRosterTable) {
    await createRosterMember(nextMember, accessToken);
    await deleteRosterMember(previousMember, accessToken);
    return;
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${previousRosterTable}?${buildRosterFilter(previousMember)}`, {
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
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${getRosterTableName(member.squadron)}?${buildRosterFilter(member)}`, {
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

export async function updateRosterPasswordStatus(
  email: string,
  status: Partial<RosterPasswordStatus>,
  accessToken?: string
) {
  const params = new URLSearchParams();
  params.set('EMAIL', `eq.${email.toLowerCase()}`);

  const response = await fetch(`${SUPABASE_URL}/rest/v1/roster?${params.toString()}`, {
    method: 'PATCH',
    headers: await getRosterHeaders(accessToken),
    body: JSON.stringify({
      ...(typeof status.mustChangePassword === 'boolean'
        ? { MUST_CHANGE_PASSWORD: status.mustChangePassword }
        : {}),
      ...(typeof status.hasLoggedIntoApp === 'boolean'
        ? { HAS_LOGGED_INTO_APP: status.hasLoggedIntoApp }
        : {}),
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to update roster password status.';
    throw new Error(message);
  }
}

function normalizeSupportMessage(row: SupportMessageRow): SupportMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderMemberId: row.sender_member_id,
    senderEmail: row.sender_email,
    senderName: row.sender_name,
    subject: row.subject,
    body: row.body,
    isFromOwner: row.is_from_owner,
    createdAt: row.created_at,
    readByOwner: row.read_by_owner,
    readByRequester: row.read_by_requester,
  };
}

function buildSupportThreadSummary(thread: SupportThreadRow, messages: SupportMessage[]) {
  const sortedMessages = [...messages].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const latestMessage = sortedMessages[sortedMessages.length - 1];

  return {
    id: thread.id,
    requesterMemberId: thread.requester_member_id,
    requesterEmail: thread.requester_email,
    requesterName: thread.requester_name,
    requesterSquadron: thread.requester_squadron,
    subject: thread.subject,
    createdAt: thread.created_at,
    updatedAt: thread.updated_at,
    latestMessagePreview: latestMessage?.body ?? '',
    messageCount: sortedMessages.length,
    unreadForOwner: sortedMessages.filter((message) => !message.readByOwner && !message.isFromOwner).length,
    unreadForRequester: sortedMessages.filter((message) => !message.readByRequester && message.isFromOwner).length,
  } satisfies SupportThreadSummary;
}

export async function fetchSupportThreads(params: {
  email: string;
  isOwner: boolean;
  accessToken?: string;
}) {
  const query = new URLSearchParams();
  query.set('select', '*');
  query.set('order', 'updated_at.desc');

  if (!params.isOwner) {
    query.set('requester_email', `eq.${params.email.toLowerCase()}`);
  }

  const threadsResponse = await fetch(`${SUPABASE_URL}/rest/v1/support_threads?${query.toString()}`, {
    method: 'GET',
    headers: await getHeaders(params.accessToken),
  });

  const threadsPayload = await threadsResponse.json().catch(() => []);
  if (!threadsResponse.ok) {
    const message =
      typeof (threadsPayload as { message?: unknown }).message === 'string'
        ? (threadsPayload as { message: string }).message
        : 'Unable to load support threads from Supabase.';
    throw new Error(message);
  }

  const threads = threadsPayload as SupportThreadRow[];
  if (threads.length === 0) {
    return [] as SupportThreadSummary[];
  }

  const threadIds = threads.map((thread) => thread.id);
  const messagesQuery = new URLSearchParams();
  messagesQuery.set('select', '*');
  messagesQuery.set('order', 'created_at.asc');
  messagesQuery.set('thread_id', `in.(${threadIds.map((id) => `"${id}"`).join(',')})`);

  const messagesResponse = await fetch(`${SUPABASE_URL}/rest/v1/support_messages?${messagesQuery.toString()}`, {
    method: 'GET',
    headers: await getHeaders(params.accessToken),
  });

  const messagesPayload = await messagesResponse.json().catch(() => []);
  if (!messagesResponse.ok) {
    const message =
      typeof (messagesPayload as { message?: unknown }).message === 'string'
        ? (messagesPayload as { message: string }).message
        : 'Unable to load support messages from Supabase.';
    throw new Error(message);
  }

  const messagesByThread = new Map<string, SupportMessage[]>();
  (messagesPayload as SupportMessageRow[]).forEach((row) => {
    const message = normalizeSupportMessage(row);
    const current = messagesByThread.get(message.threadId) ?? [];
    current.push(message);
    messagesByThread.set(message.threadId, current);
  });

  return threads.map((thread) => buildSupportThreadSummary(thread, messagesByThread.get(thread.id) ?? []));
}

export async function fetchSupportMessages(threadId: string, accessToken?: string) {
  const query = new URLSearchParams();
  query.set('select', '*');
  query.set('thread_id', `eq.${threadId}`);
  query.set('order', 'created_at.asc');

  const response = await fetch(`${SUPABASE_URL}/rest/v1/support_messages?${query.toString()}`, {
    method: 'GET',
    headers: await getHeaders(accessToken),
  });

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to load support conversation.';
    throw new Error(message);
  }

  return (payload as SupportMessageRow[]).map(normalizeSupportMessage);
}

async function upsertSupportThread(params: {
  requesterMemberId: string;
  requesterEmail: string;
  requesterName: string;
  requesterSquadron: Squadron;
  subject: string;
  accessToken?: string;
}) {
  const encodedEmail = encodeURIComponent(params.requesterEmail.toLowerCase());
  const lookupResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/support_threads?select=*&requester_email=eq.${encodedEmail}`,
    {
      method: 'GET',
      headers: await getHeaders(params.accessToken),
    }
  );

  const lookupPayload = await lookupResponse.json().catch(() => []);
  if (!lookupResponse.ok) {
    const message =
      typeof (lookupPayload as { message?: unknown }).message === 'string'
        ? (lookupPayload as { message: string }).message
        : 'Unable to look up developer support thread.';
    throw new Error(message);
  }

  const existing = (lookupPayload as SupportThreadRow[])[0];
  const payload = {
    requester_member_id: params.requesterMemberId,
    requester_email: params.requesterEmail.toLowerCase(),
    requester_name: params.requesterName,
    requester_squadron: params.requesterSquadron,
    subject: params.subject,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/support_threads?id=eq.${existing.id}`, {
      method: 'PATCH',
      headers: {
        ...(await getHeaders(params.accessToken)),
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });

    const updatePayload = await updateResponse.json().catch(() => []);
    if (!updateResponse.ok) {
      const message =
        typeof (updatePayload as { message?: unknown }).message === 'string'
          ? (updatePayload as { message: string }).message
          : 'Unable to update developer support thread.';
      throw new Error(message);
    }

    return (updatePayload as SupportThreadRow[])[0] ?? existing;
  }

  const threadId = createSupportId('support-thread');
  const createResponse = await fetch(`${SUPABASE_URL}/rest/v1/support_threads`, {
    method: 'POST',
    headers: {
      ...(await getHeaders(params.accessToken)),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id: threadId,
      ...payload,
    }),
  });

  const createPayload = await createResponse.json().catch(() => []);
  if (!createResponse.ok) {
    const message =
      typeof (createPayload as { message?: unknown }).message === 'string'
        ? (createPayload as { message: string }).message
        : 'Unable to create developer support thread.';
    throw new Error(message);
  }

  return (createPayload as SupportThreadRow[])[0] ?? {
    id: threadId,
    ...payload,
    created_at: new Date().toISOString(),
  };
}

export async function sendSupportMessage(params: {
  requesterMemberId: string;
  requesterEmail: string;
  requesterName: string;
  requesterSquadron: Squadron;
  senderMemberId: string;
  senderEmail: string;
  senderName: string;
  subject: string;
  body: string;
  isFromOwner: boolean;
  accessToken?: string;
}) {
  const thread = await upsertSupportThread({
    requesterMemberId: params.requesterMemberId,
    requesterEmail: params.requesterEmail,
    requesterName: params.requesterName,
    requesterSquadron: params.requesterSquadron,
    subject: params.subject,
    accessToken: params.accessToken,
  });

  const createdAt = new Date().toISOString();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/support_messages`, {
    method: 'POST',
    headers: {
      ...(await getHeaders(params.accessToken)),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id: createSupportId('support-message'),
      thread_id: thread.id,
      sender_member_id: params.senderMemberId,
      sender_email: params.senderEmail.toLowerCase(),
      sender_name: params.senderName,
      subject: params.subject,
      body: params.body,
      is_from_owner: params.isFromOwner,
      created_at: createdAt,
      read_by_owner: params.isFromOwner,
      read_by_requester: !params.isFromOwner,
    }),
  });

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to send support message.';
    throw new Error(message);
  }

  await fetch(`${SUPABASE_URL}/rest/v1/support_threads?id=eq.${thread.id}`, {
    method: 'PATCH',
    headers: {
      ...(await getHeaders(params.accessToken)),
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      subject: params.subject,
      updated_at: createdAt,
    }),
  }).catch(() => undefined);

  const messageRow = (payload as SupportMessageRow[])[0];
  return {
    threadId: thread.id,
    message: messageRow ? normalizeSupportMessage(messageRow) : null,
  };
}

export async function markSupportMessagesRead(params: {
  threadId: string;
  viewer: 'owner' | 'requester';
  accessToken?: string;
}) {
  const query = new URLSearchParams();
  query.set('thread_id', `eq.${params.threadId}`);

  if (params.viewer === 'owner') {
    query.set('read_by_owner', 'eq.false');
    query.set('is_from_owner', 'eq.false');
  } else {
    query.set('read_by_requester', 'eq.false');
    query.set('is_from_owner', 'eq.true');
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/support_messages?${query.toString()}`, {
    method: 'PATCH',
    headers: {
      ...(await getHeaders(params.accessToken)),
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(
      params.viewer === 'owner'
        ? { read_by_owner: true }
        : { read_by_requester: true }
    ),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to mark support messages as read.';
    throw new Error(message);
  }
}

export async function fetchManualWorkoutSubmissions(params: {
  memberId: string;
  squadron: Squadron;
  canReview: boolean;
  accessToken?: string;
}) {
  const requests: Promise<Response>[] = [
    fetch(
      `${SUPABASE_URL}/rest/v1/manual_workout_submissions?select=*&member_id=eq.${encodeURIComponent(params.memberId)}&order=updated_at.desc`,
      {
        method: 'GET',
        headers: await getHeaders(params.accessToken),
      }
    ),
  ];

  if (params.canReview) {
    requests.push(
      fetch(
        `${SUPABASE_URL}/rest/v1/manual_workout_submissions?select=*&squadron=eq.${encodeURIComponent(params.squadron)}&status=eq.pending&order=created_at.asc`,
        {
          method: 'GET',
          headers: await getHeaders(params.accessToken),
        }
      )
    );
  }

  const [mineResponse, reviewResponse] = await Promise.all(requests);
  const minePayload = await mineResponse.json().catch(() => []);
  if (!mineResponse.ok) {
    const message =
      typeof (minePayload as { message?: unknown }).message === 'string'
        ? (minePayload as { message: string }).message
        : 'Unable to load manual workout submissions.';
    throw new Error(message);
  }

  let reviewQueue: ManualWorkoutSubmission[] = [];
  if (reviewResponse) {
    const reviewPayload = await reviewResponse.json().catch(() => []);
    if (!reviewResponse.ok) {
      const message =
        typeof (reviewPayload as { message?: unknown }).message === 'string'
          ? (reviewPayload as { message: string }).message
          : 'Unable to load manual workout review queue.';
      throw new Error(message);
    }
    reviewQueue = (reviewPayload as ManualWorkoutSubmissionRow[]).map(normalizeManualWorkoutSubmissionRow);
  }

  return {
    mine: (minePayload as ManualWorkoutSubmissionRow[]).map(normalizeManualWorkoutSubmissionRow),
    reviewQueue,
  };
}

export async function createManualWorkoutSubmission(params: {
  memberId: string;
  memberEmail: string;
  memberName: string;
  memberRank: string;
  memberFlight: Flight;
  squadron: Squadron;
  workoutDate: string;
  workoutType: WorkoutType;
  duration: number;
  distance?: number;
  isPrivate: boolean;
  proofImageData: string;
  accessToken?: string;
}) {
  const now = new Date().toISOString();
  const id = createSupportId('manual-workout');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/manual_workout_submissions`, {
    method: 'POST',
    headers: {
      ...(await getHeaders(params.accessToken)),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id,
      member_id: params.memberId,
      member_email: params.memberEmail.toLowerCase(),
      member_name: params.memberName,
      member_rank: params.memberRank,
      member_flight: params.memberFlight,
      squadron: params.squadron,
      workout_date: params.workoutDate,
      workout_type: params.workoutType,
      duration: params.duration,
      distance: params.distance ?? null,
      is_private: params.isPrivate,
      proof_image_data: params.proofImageData,
      status: 'pending',
      reviewer_member_id: null,
      reviewer_name: null,
      reviewer_note: null,
      requester_read: true,
      reviewer_read: false,
      created_at: now,
      updated_at: now,
    }),
  });

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to submit manual workout proof.';
    throw new Error(message);
  }

  return normalizeManualWorkoutSubmissionRow((payload as ManualWorkoutSubmissionRow[])[0]);
}

export async function reviewManualWorkoutSubmission(params: {
  submissionId: string;
  reviewerMemberId: string;
  reviewerName: string;
  approved: boolean;
  note?: string;
  accessToken?: string;
}) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/manual_workout_submissions?id=eq.${encodeURIComponent(params.submissionId)}`,
    {
      method: 'PATCH',
      headers: {
        ...(await getHeaders(params.accessToken)),
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        status: params.approved ? 'approved' : 'denied',
        reviewer_member_id: params.reviewerMemberId,
        reviewer_name: params.reviewerName,
        reviewer_note: params.note?.trim() || null,
        requester_read: false,
        reviewer_read: true,
        updated_at: new Date().toISOString(),
      }),
    }
  );

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to review manual workout submission.';
    throw new Error(message);
  }

  return normalizeManualWorkoutSubmissionRow((payload as ManualWorkoutSubmissionRow[])[0]);
}

export async function markManualWorkoutSubmissionRead(params: {
  submissionId: string;
  viewer: 'requester' | 'reviewer';
  accessToken?: string;
}) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/manual_workout_submissions?id=eq.${encodeURIComponent(params.submissionId)}`,
    {
      method: 'PATCH',
      headers: {
        ...(await getHeaders(params.accessToken)),
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(
        params.viewer === 'requester'
          ? { requester_read: true }
          : { reviewer_read: true }
      ),
    }
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to mark workout submission notification as read.';
    throw new Error(message);
  }
}

export async function fetchApprovedManualWorkouts(accessToken?: string, squadron?: Squadron) {
  const query = new URLSearchParams();
  query.set('select', '*');
  query.set('status', 'eq.approved');
  query.set('order', 'workout_date.desc');
  if (squadron) {
    query.set('squadron', `eq.${squadron}`);
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/manual_workout_submissions?${query.toString()}`, {
    method: 'GET',
    headers: await getHeaders(accessToken),
  });

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to load approved manual workouts.';
    throw new Error(message);
  }

  const submissions = (payload as ManualWorkoutSubmissionRow[]).map(normalizeManualWorkoutSubmissionRow);
  const grouped = new Map<string, Array<{ memberId: string; workout: Member['workouts'][number] }>>();

  submissions.forEach((submission) => {
    const workout = {
      id: submission.id,
      externalId: submission.id,
      date: submission.workoutDate,
      type: submission.workoutType,
      duration: submission.duration,
      distance: submission.distance,
      source: 'manual' as const,
      screenshotUri: submission.proofImageData,
      title: `${submission.workoutType} proof`,
      isPrivate: submission.isPrivate,
    };
    const current = grouped.get(submission.memberId) ?? [];
    current.push({ memberId: submission.memberId, workout });
    grouped.set(submission.memberId, current);
  });

  return Array.from(grouped.entries()).map(([memberId, items]) => ({
    memberId,
    workouts: items.map((item) => item.workout),
  }));
}
