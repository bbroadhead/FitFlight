import type { AccountType, FitnessAssessment, Flight, Member, PTSession, ScheduledPTKind, ScheduledPTScope, ScheduledPTSession, SharedWorkout, Squadron, WorkoutType } from '@/lib/store';
import { getValidAccessToken } from '@/lib/supabaseAuth';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Buffer } from 'buffer';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '') ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const ROSTER_BACKED_SQUADRON = 'Hawks' as const;
const DEFAULT_ROSTER_TABLE = 'roster';
const STORAGE_BUCKET = 'fitflight-images';
const DEMO_ACCOUNT_EMAIL = 'fitflight@us.af.mil';

type SupabaseRow = Record<string, unknown>;
type RosterColumnName =
  | 'FULL_NAME'
  | 'RANK'
  | 'EMAIL'
  | 'FLT-DET'
  | 'AUTH_USER_ID'
  | 'PROFILE_PICTURE'
  | 'SHOW_WORKOUT_HISTORY_ON_PROFILE'
  | 'SHOW_WORKOUT_UPLOADS_ON_PROFILE'
  | 'SHOW_PFRA_RECORDS_ON_PROFILE'
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
  attendance_source?: 'manual' | 'workout' | null;
};
type ScheduledPTSessionRow = {
  id: string;
  session_date: string;
  session_time: string;
  description: string;
  squadron: Squadron;
  flights: Flight[] | null;
  created_by: string;
  session_scope: ScheduledPTScope;
  session_kind: ScheduledPTKind;
};
type PFRARecordRow = {
  id: string;
  member_id: string;
  member_email: string;
  squadron: Squadron;
  assessment_date: string;
  overall_score: number;
  is_private: boolean;
  cardio_score: number;
  cardio_time: string | null;
  cardio_laps: number | null;
  cardio_test: string | null;
  cardio_exempt: boolean;
  strength_score: number;
  strength_reps: number | null;
  strength_test: string | null;
  strength_exempt: boolean;
  core_score: number;
  core_reps: number | null;
  core_time: string | null;
  core_test: string | null;
  core_exempt: boolean;
  waist_score: number | null;
  waist_inches: number | null;
  waist_exempt: boolean;
  created_at: string;
};
type AppNotificationRow = {
  id: string;
  sender_member_id: string;
  sender_email: string;
  sender_name: string;
  recipient_member_id: string | null;
  recipient_email: string;
  squadron: Squadron;
  type: string;
  title: string;
  message: string;
  action_type: string | null;
  action_target_id: string | null;
  action_payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};
type MemberTrophyRow = {
  id: string;
  member_id: string | null;
  member_email: string;
  squadron: Squadron;
  trophy_id: string;
  earned_at: string;
  awarded_by_member_id: string | null;
  is_active: boolean;
  celebration_shown_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};
type SupportThreadRow = {
  id: string;
  requester_member_id: string;
  requester_email: string;
  requester_name: string;
  requester_squadron: Squadron;
  recipient_member_id: string | null;
  recipient_email: string;
  recipient_name: string;
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
  edited_by?: string | null;
  edited_at?: string | null;
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
  duration_seconds?: number | null;
  distance: number | null;
  is_private: boolean;
  proof_image_data?: string | null;
  status: ManualWorkoutSubmissionStatus;
  reviewer_member_id: string | null;
  reviewer_name: string | null;
  reviewer_note: string | null;
  attendance_marked_by_submission: boolean;
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
  recipientMemberId: string | null;
  recipientEmail: string;
  recipientName: string;
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
  durationSeconds: number;
  distance?: number;
  isPrivate: boolean;
  proofImageData: string;
  status: ManualWorkoutSubmissionStatus;
  reviewerMemberId: string | null;
  reviewerName: string | null;
  reviewerNote: string | null;
  attendanceMarkedBySubmission: boolean;
  requesterRead: boolean;
  reviewerRead: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AppNotification = {
  id: string;
  senderMemberId: string;
  senderEmail: string;
  senderName: string;
  recipientMemberId: string | null;
  recipientEmail: string;
  squadron: Squadron;
  type: string;
  title: string;
  message: string;
  actionType: string | null;
  actionTargetId: string | null;
  actionPayload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export type MemberTrophyRecord = {
  id: string;
  memberId: string | null;
  memberEmail: string;
  squadron: Squadron;
  trophyId: string;
  earnedAt: string;
  awardedByMemberId: string | null;
  isActive: boolean;
  celebrationShownAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function isMissingAttendanceMarkedBySubmissionError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('attendance_marked_by_submission') && normalized.includes('schema cache');
}

function isMissingSupportRecipientColumnError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('support_threads.recipient_email') || (
    normalized.includes('recipient_email') && normalized.includes('support_threads')
  );
}

function isMissingTrophyCelebrationShownColumnError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('celebration_shown_at') && (
    normalized.includes('schema cache') ||
    normalized.includes('member_trophies')
  );
}

function getSupportInboxErrorMessage(payload: unknown, fallbackMessage: string) {
  const rawMessage =
    typeof (payload as { message?: unknown }).message === 'string'
      ? (payload as { message: string }).message
      : fallbackMessage;
  return isMissingSupportRecipientColumnError(rawMessage)
    ? 'FitFlight team messaging needs a Supabase update. Re-run supabase/sql/support_inbox.sql, then try again.'
    : rawMessage;
}

function getManualWorkoutWriteErrorMessage(payload: unknown, fallbackMessage: string) {
  const rawMessage =
    typeof (payload as { message?: unknown }).message === 'string'
      ? (payload as { message: string }).message
      : fallbackMessage;
  return rawMessage.toLowerCase().includes('row-level security')
    ? 'Manual workout submission is blocked by Supabase security rules. Re-run supabase/sql/manual_workout_submissions.sql, then try again.'
    : rawMessage;
}

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

function encodeStoragePath(path: string) {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function inferExtensionFromMimeType(mimeType?: string) {
  const normalized = mimeType?.toLowerCase().trim();
  switch (normalized) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'jpg';
  }
}

function inferMimeTypeFromUri(uri: string) {
  const normalized = uri.toLowerCase();
  if (normalized.endsWith('.png')) {
    return 'image/png';
  }
  if (normalized.endsWith('.webp')) {
    return 'image/webp';
  }
  if (normalized.endsWith('.gif')) {
    return 'image/gif';
  }
  return 'image/jpeg';
}

function getStoragePublicBaseUrl() {
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/`;
}

function extractStoragePath(value?: string) {
  if (!value?.trim()) {
    return null;
  }

  const trimmed = value.trim();
  const publicBaseUrl = getStoragePublicBaseUrl();
  if (trimmed.startsWith(publicBaseUrl)) {
    return decodeURIComponent(trimmed.slice(publicBaseUrl.length));
  }

  if (/^(data:|https?:|blob:|file:|content:)/i.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function serializeImageReference(value?: string) {
  const storagePath = extractStoragePath(value);
  return storagePath ?? value?.trim() ?? '';
}

export function getDisplayImageUri(value?: string) {
  if (!value?.trim()) {
    return undefined;
  }

  const storagePath = extractStoragePath(value);
  if (!storagePath) {
    return value.trim();
  }

  return `${getStoragePublicBaseUrl()}${encodeStoragePath(storagePath)}`;
}

export async function deleteStoredImage(params: {
  imageReference?: string;
  accessToken?: string;
}) {
  const storagePath = extractStoragePath(params.imageReference);
  if (!storagePath) {
    return;
  }

  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${encodeStoragePath(storagePath)}`,
    {
      method: 'DELETE',
      headers: await getHeaders(params.accessToken),
    }
  );

  if (!response.ok && response.status !== 404) {
    const payload = await response.json().catch(() => ({}));
    const message =
      typeof (payload as { error?: unknown; message?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : typeof (payload as { error?: unknown; message?: unknown }).message === 'string'
          ? (payload as { message: string }).message
          : 'Unable to delete the previous image from storage.';
    throw new Error(message);
  }
}

async function uploadImageToStorage(params: {
  localUri: string;
  storagePath: string;
  mimeType?: string;
  accessToken?: string;
}) {
  const headers = await getHeaders(params.accessToken);
  let body: Blob | Buffer;
  let contentType = params.mimeType || inferMimeTypeFromUri(params.localUri);

  if (params.localUri.startsWith('data:')) {
    const match = params.localUri.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error('Unable to read image data for upload.');
    }

    contentType = match[1] || contentType;
    body = Buffer.from(match[2], 'base64');
  } else if (Platform.OS === 'web') {
    const sourceResponse = await fetch(params.localUri);
    if (!sourceResponse.ok) {
      throw new Error('Unable to read image for upload.');
    }

    const blob = await sourceResponse.blob();
    contentType = blob.type || contentType;
    body = blob;
  } else {
    const base64 = await FileSystem.readAsStringAsync(params.localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    body = Buffer.from(base64, 'base64');
  }

  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${encodeStoragePath(params.storagePath)}`,
    {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body,
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const rawMessage =
      typeof (payload as { message?: unknown; error?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : typeof (payload as { message?: unknown; error?: unknown }).error === 'string'
          ? (payload as { error: string }).error
          : 'Unable to upload image to Supabase storage.';
    const message = rawMessage.toLowerCase().includes('row-level security')
      ? 'Image upload is blocked by Supabase storage security rules. Re-run supabase/sql/storage_fitflight_images.sql, then try again.'
      : rawMessage;
    throw new Error(message);
  }

  return getDisplayImageUri(params.storagePath) ?? params.storagePath;
}

export async function uploadProfileImage(params: {
  memberId: string;
  localUri: string;
  mimeType?: string;
  accessToken?: string;
}) {
  const extension = inferExtensionFromMimeType(params.mimeType);
  const storagePath = `avatars/${slugify(params.memberId)}-${Date.now()}.${extension}`;
  return uploadImageToStorage({
    localUri: params.localUri,
    storagePath,
    mimeType: params.mimeType,
    accessToken: params.accessToken,
  });
}

export async function uploadWorkoutProofImage(params: {
  memberId: string;
  submissionId: string;
  localUri: string;
  mimeType?: string;
  accessToken?: string;
}) {
  const extension = inferExtensionFromMimeType(params.mimeType);
  const storagePath = `workout-proofs/${slugify(params.memberId)}/${slugify(params.submissionId)}.${extension}`;
  return uploadImageToStorage({
    localUri: params.localUri,
    storagePath,
    mimeType: params.mimeType,
    accessToken: params.accessToken,
  });
}

export async function resetUserPasswordAsAdmin(params: {
  targetEmail: string;
  newPassword: string;
  accessToken?: string;
}) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/reset-user-password`, {
    method: 'POST',
    headers: {
      ...(await getHeaders(params.accessToken)),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      targetEmail: params.targetEmail.trim().toLowerCase(),
      newPassword: params.newPassword,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof (payload as { error?: unknown; message?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : typeof (payload as { error?: unknown; message?: unknown }).message === 'string'
          ? (payload as { message: string }).message
          : 'Unable to reset that user password.';
    throw new Error(message);
  }

  return payload as { success: true };
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
    editedBy: row.edited_by ?? undefined,
    editedAt: row.edited_at ?? undefined,
    squadron: row.squadron,
    thumbsUp: row.thumbs_up ?? [],
    thumbsDown: row.thumbs_down ?? [],
    favoritedBy: row.favorited_by ?? [],
  };
}

function isMissingSharedWorkoutEditColumnsError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('edited_by') || normalized.includes('edited_at');
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
    durationSeconds: typeof row.duration_seconds === 'number' ? row.duration_seconds : 0,
    distance: typeof row.distance === 'number' ? row.distance : undefined,
    isPrivate: row.is_private,
    proofImageData: getDisplayImageUri(row.proof_image_data ?? undefined) ?? row.proof_image_data ?? '',
    status: row.status,
    reviewerMemberId: row.reviewer_member_id,
    reviewerName: row.reviewer_name,
    reviewerNote: row.reviewer_note,
    attendanceMarkedBySubmission: row.attendance_marked_by_submission,
    requesterRead: row.requester_read,
    reviewerRead: row.reviewer_read,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeScheduledPTSessionRow(row: ScheduledPTSessionRow): ScheduledPTSession {
  return {
    id: row.id,
    date: row.session_date,
    time: row.session_time,
    description: row.description,
    squadron: row.squadron,
    flights: row.flights ?? [],
    createdBy: row.created_by,
    scope: row.session_scope ?? 'flight',
    kind: row.session_kind ?? 'pt',
  };
}

function normalizePFRARecordRow(row: PFRARecordRow): FitnessAssessment {
  return {
    id: row.id,
    date: row.assessment_date,
    overallScore: row.overall_score,
    isPrivate: row.is_private,
    components: {
      cardio: row.cardio_laps !== null
        ? {
            score: row.cardio_score,
            laps: row.cardio_laps,
            test: row.cardio_test ?? undefined,
            exempt: row.cardio_exempt,
          }
        : {
            score: row.cardio_score,
            time: row.cardio_time ?? undefined,
            test: row.cardio_test ?? undefined,
            exempt: row.cardio_exempt,
          },
      pushups: {
        score: row.strength_score,
        reps: row.strength_reps ?? 0,
        test: row.strength_test ?? undefined,
        exempt: row.strength_exempt,
      },
      situps: {
        score: row.core_score,
        reps: row.core_reps ?? 0,
        time: row.core_time ?? undefined,
        test: row.core_test ?? undefined,
        exempt: row.core_exempt,
      },
      waist: row.waist_score !== null || row.waist_inches !== null || row.waist_exempt
        ? {
            score: row.waist_score ?? 0,
            inches: row.waist_inches ?? 0,
            exempt: row.waist_exempt,
          }
        : undefined,
    },
  };
}

function normalizeAppNotificationRow(row: AppNotificationRow): AppNotification {
  return {
    id: row.id,
    senderMemberId: row.sender_member_id,
    senderEmail: row.sender_email,
    senderName: row.sender_name,
    recipientMemberId: row.recipient_member_id,
    recipientEmail: row.recipient_email,
    squadron: row.squadron,
    type: row.type,
    title: row.title,
    message: row.message,
    actionType: row.action_type,
    actionTargetId: row.action_target_id,
    actionPayload: row.action_payload ?? {},
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

function normalizeMemberTrophyRow(row: MemberTrophyRow): MemberTrophyRecord {
  return {
    id: row.id,
    memberId: row.member_id,
    memberEmail: row.member_email.toLowerCase(),
    squadron: row.squadron,
    trophyId: row.trophy_id,
    earnedAt: row.earned_at,
    awardedByMemberId: row.awarded_by_member_id,
    isActive: row.is_active,
    celebrationShownAt: row.celebration_shown_at,
    revokedAt: row.revoked_at,
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

function getAccountType(firstName: string, lastName: string, email?: string): AccountType {
  const normalizedFirstName = firstName.trim().toLowerCase();
  const normalizedLastName = lastName.trim().toLowerCase();
  const normalizedEmail = email?.trim().toLowerCase();

  if (normalizedEmail === 'fitflight@us.af.mil') {
    return 'demo';
  }

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
  const authUserId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(member.id)
    ? member.id
    : '';

  return {
    FULL_NAME: getRosterFullName(member),
    RANK: RANK_TO_ROSTER[member.rank] ?? member.rank.toUpperCase(),
    EMAIL: member.email.toLowerCase(),
    'FLT-DET': getRosterFlight(member),
    AUTH_USER_ID: authUserId,
    PROFILE_PICTURE: serializeImageReference(member.profilePicture),
    SHOW_WORKOUT_HISTORY_ON_PROFILE: member.showWorkoutHistoryOnProfile ?? true,
    SHOW_WORKOUT_UPLOADS_ON_PROFILE: member.showWorkoutUploadsOnProfile ?? true,
    SHOW_PFRA_RECORDS_ON_PROFILE: member.showPFRARecordsOnProfile ?? true,
    MUST_CHANGE_PASSWORD: member.mustChangePassword ?? false,
    HAS_LOGGED_INTO_APP: member.hasLoggedIntoApp ?? false,
  };
}

function buildRosterFilter(member: Pick<Member, 'firstName' | 'lastName' | 'rank' | 'flight' | 'email'>) {
  const params = new URLSearchParams();
  if (member.email?.trim()) {
    params.set('EMAIL', `eq.${member.email.toLowerCase()}`);
    return params.toString();
  }

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

  const squadron = 'Hawks' as Squadron;
  const email = buildEmail(row, firstName, lastName);
  const normalizedEmail = email.toLowerCase();
  if (normalizedEmail === DEMO_ACCOUNT_EMAIL) {
    return null;
  }
  const normalizedFirstName = normalizedEmail === 'fitflight@us.af.mil' ? 'Ima' : firstName;
  const normalizedLastName = normalizedEmail === 'fitflight@us.af.mil' ? 'Demo' : lastName;
  const normalizedRank = normalizedEmail === 'fitflight@us.af.mil' ? 'Lt. Col.' : rank;
  const stableId =
    getStringValue(row, ['auth_user_id', 'AUTH_USER_ID', 'id', 'member_id']) ||
    `roster-${slugify(`${normalizedRank}-${normalizedLastName}-${normalizedFirstName}-${flight}`)}`;
  const mustChangePassword = getBooleanValue(row, ['must_change_password', 'MUST_CHANGE_PASSWORD']) ?? false;
  const hasLoggedIntoApp = getBooleanValue(row, ['has_logged_into_app', 'HAS_LOGGED_INTO_APP', 'has_logged_in', 'HAS_LOGGED_IN']) ?? false;
  const profilePicture = getDisplayImageUri(getStringValue(row, ['profile_picture', 'PROFILE_PICTURE'])) || undefined;
  const showWorkoutHistoryOnProfile = getBooleanValue(row, [
    'show_workout_history_on_profile',
    'SHOW_WORKOUT_HISTORY_ON_PROFILE',
  ]) ?? true;
  const showWorkoutUploadsOnProfile = getBooleanValue(row, [
    'show_workout_uploads_on_profile',
    'SHOW_WORKOUT_UPLOADS_ON_PROFILE',
  ]) ?? true;
  const showPFRARecordsOnProfile = getBooleanValue(row, [
    'show_pfra_records_on_profile',
    'SHOW_PFRA_RECORDS_ON_PROFILE',
  ]) ?? true;

  return {
    id: stableId,
    rank: normalizedRank,
    firstName: normalizedFirstName,
    lastName: normalizedLastName,
    flight,
    squadron,
    accountType: getAccountType(normalizedFirstName, normalizedLastName, normalizedEmail),
    email: normalizedEmail,
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
    leaderboardHistory: [],
    trophyCount: 0,
    hasSeenTutorial: false,
    mustChangePassword,
    hasLoggedIntoApp,
    profilePicture,
    showWorkoutHistoryOnProfile,
    showWorkoutUploadsOnProfile,
    showPFRARecordsOnProfile,
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

export async function fetchMemberTrophies(
  accessToken?: string,
  squadron?: Squadron,
  includeInactive = false,
  options?: { updatedAfter?: string }
) {
  const buildQuery = (includeCelebrationShownAt: boolean) => {
    const query = new URLSearchParams();
    query.set(
      'select',
      includeCelebrationShownAt
        ? 'id,member_id,member_email,squadron,trophy_id,earned_at,awarded_by_member_id,is_active,celebration_shown_at,revoked_at,created_at,updated_at'
        : 'id,member_id,member_email,squadron,trophy_id,earned_at,awarded_by_member_id,is_active,revoked_at,created_at,updated_at'
    );
    query.set('order', 'earned_at.asc');
    if (squadron) {
      query.set('squadron', `eq.${squadron}`);
    }
    if (!includeInactive) {
      query.set('is_active', 'eq.true');
    }
    if (options?.updatedAfter) {
      query.set('updated_at', `gt.${options.updatedAfter}`);
    }
    return query;
  };

  const requestTrophies = async (includeCelebrationShownAt: boolean) => {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/member_trophies?${buildQuery(includeCelebrationShownAt).toString()}`, {
      method: 'GET',
      headers: await getHeaders(accessToken),
    });

    const payload = await response.json().catch(() => []);
    return { response, payload };
  };

  let { response, payload } = await requestTrophies(true);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to load member trophies from Supabase.';

    if (isMissingTrophyCelebrationShownColumnError(message)) {
      ({ response, payload } = await requestTrophies(false));
    }

    if (!response.ok) {
      const fallbackMessage =
        typeof (payload as { message?: unknown }).message === 'string'
          ? (payload as { message: string }).message
          : message;
      throw new Error(fallbackMessage);
    }
  }

  return (payload as MemberTrophyRow[]).map(normalizeMemberTrophyRow);
}

export async function awardMemberTrophy(params: {
  memberId?: string | null;
  memberEmail: string;
  squadron: Squadron;
  trophyId: string;
  awardedByMemberId?: string | null;
  earnedAt?: string;
  accessToken?: string;
}) {
  const now = params.earnedAt ?? new Date().toISOString();
  const buildPayload = (includeCelebrationShownAt: boolean) => ({
    id: createSupportId('member-trophy'),
    member_id: params.memberId ?? null,
    member_email: params.memberEmail.trim().toLowerCase(),
    squadron: params.squadron,
    trophy_id: params.trophyId,
    earned_at: now,
    awarded_by_member_id: params.awardedByMemberId ?? null,
    is_active: true,
    ...(includeCelebrationShownAt ? { celebration_shown_at: null } : {}),
    revoked_at: null,
    created_at: now,
    updated_at: now,
  });

  const requestAward = async (includeCelebrationShownAt: boolean) => {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/member_trophies?on_conflict=member_email,trophy_id`,
      {
        method: 'POST',
        headers: {
          ...(await getHeaders(params.accessToken)),
          'Content-Type': 'application/json',
          Prefer: 'resolution=ignore-duplicates,return=representation',
        },
        body: JSON.stringify(buildPayload(includeCelebrationShownAt)),
      }
    );

    const payload = await response.json().catch(() => []);
    return { response, payload };
  };

  let { response, payload } = await requestAward(true);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to award trophy in Supabase.';

    if (isMissingTrophyCelebrationShownColumnError(message)) {
      ({ response, payload } = await requestAward(false));
    }

    if (!response.ok) {
      const fallbackMessage =
        typeof (payload as { message?: unknown }).message === 'string'
          ? (payload as { message: string }).message
          : message;
      throw new Error(fallbackMessage);
    }
  }

  const awardedRow = Array.isArray(payload) ? (payload as MemberTrophyRow[])[0] : null;
  return awardedRow ? normalizeMemberTrophyRow(awardedRow) : null;
}

export async function markMemberTrophyCelebrationShown(id: string, accessToken?: string) {
  const timestamp = new Date().toISOString();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/member_trophies?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      ...(await getHeaders(accessToken)),
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      celebration_shown_at: timestamp,
      updated_at: timestamp,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to mark trophy celebration as shown.';
    if (isMissingTrophyCelebrationShownColumnError(message)) {
      return;
    }
    throw new Error(message);
  }
}

export async function fetchAttendanceSessions(accessToken?: string) {
  const [sessionsResponse, attendeesResponse] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/pt_sessions?select=id,date,flight,squadron,created_by`, {
      method: 'GET',
      headers: await getHeaders(accessToken),
    }),
      fetch(`${SUPABASE_URL}/rest/v1/pt_session_attendees?select=session_id,member_id,attendance_source`, {
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
    const attendeeSourceMap = new Map<string, Record<string, 'manual' | 'workout'>>();
    (attendeesPayload as AttendanceAttendeeRow[]).forEach((attendee) => {
      const current = attendeeMap.get(attendee.session_id) ?? [];
      current.push(attendee.member_id);
      attendeeMap.set(attendee.session_id, current);

      const currentSources = attendeeSourceMap.get(attendee.session_id) ?? {};
      currentSources[attendee.member_id] = attendee.attendance_source === 'workout' ? 'workout' : 'manual';
      attendeeSourceMap.set(attendee.session_id, currentSources);
    });

  return (sessionsPayload as AttendanceSessionRow[]).map((session) => ({
    id: session.id,
    date: session.date,
    flight: session.flight,
      squadron: session.squadron,
      createdBy: session.created_by,
      attendees: attendeeMap.get(session.id) ?? [],
      attendeeSources: attendeeSourceMap.get(session.id) ?? {},
    })).filter((session) => session.attendees.length > 0) as PTSession[];
}

export async function fetchScheduledPTSessions(
  accessToken?: string,
  squadron?: Squadron,
  options?: { updatedAfter?: string }
) {
  const query = new URLSearchParams();
  query.set('select', 'id,session_date,session_time,description,squadron,flights,created_by,session_scope,session_kind,created_at,updated_at');
  query.set('order', 'session_date.asc,session_time.asc');
  if (squadron) {
    query.set('squadron', `eq.${squadron}`);
  }
  if (options?.updatedAfter) {
    query.set('updated_at', `gt.${options.updatedAfter}`);
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/scheduled_pt_sessions?${query.toString()}`, {
    method: 'GET',
    headers: await getHeaders(accessToken),
  });

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to load scheduled PT sessions from Supabase.';
    throw new Error(message);
  }

  return (payload as ScheduledPTSessionRow[]).map(normalizeScheduledPTSessionRow);
}

export async function createScheduledPTSession(session: ScheduledPTSession, accessToken?: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/scheduled_pt_sessions`, {
    method: 'POST',
    headers: {
      ...(await getHeaders(accessToken)),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
      body: JSON.stringify({
        id: session.id,
        session_date: session.date,
        session_time: session.time,
        description: session.description,
        squadron: session.squadron,
        flights: session.flights,
        created_by: session.createdBy,
        session_scope: session.scope,
        session_kind: session.kind,
      }),
  });

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to create scheduled PT session.';
    throw new Error(message);
  }

  return normalizeScheduledPTSessionRow((payload as ScheduledPTSessionRow[])[0]);
}

export async function updateScheduledPTSession(session: ScheduledPTSession, accessToken?: string) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/scheduled_pt_sessions?id=eq.${encodeURIComponent(session.id)}`,
    {
      method: 'PATCH',
      headers: {
        ...(await getHeaders(accessToken)),
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
        body: JSON.stringify({
          session_date: session.date,
          session_time: session.time,
          description: session.description,
          squadron: session.squadron,
          flights: session.flights,
          session_scope: session.scope,
          session_kind: session.kind,
        }),
    }
  );

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to update scheduled PT session.';
    throw new Error(message);
  }

  return normalizeScheduledPTSessionRow((payload as ScheduledPTSessionRow[])[0]);
}

export async function deleteScheduledPTSession(id: string, accessToken?: string) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/scheduled_pt_sessions?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: await getHeaders(accessToken),
    }
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to delete scheduled PT session.';
    throw new Error(message);
  }
}

export async function fetchPFRARecords(accessToken?: string, squadron?: Squadron) {
  const query = new URLSearchParams();
  query.set(
    'select',
    'id,member_id,member_email,squadron,assessment_date,overall_score,is_private,cardio_score,cardio_time,cardio_laps,cardio_test,cardio_exempt,strength_score,strength_reps,strength_test,strength_exempt,core_score,core_reps,core_time,core_test,core_exempt,waist_score,waist_inches,waist_exempt,created_at'
  );
  query.set('order', 'assessment_date.desc,created_at.desc');
  if (squadron) {
    query.set('squadron', `eq.${squadron}`);
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/pfra_records?${query.toString()}`, {
    method: 'GET',
    headers: await getHeaders(accessToken),
  });

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to load PFRA records from Supabase.';
    throw new Error(message);
  }

  const grouped = new Map<string, { memberId?: string; memberEmail?: string; assessments: FitnessAssessment[] }>();
  (payload as PFRARecordRow[]).forEach((row) => {
    const assessment = normalizePFRARecordRow(row);
    const key = row.member_id || row.member_email.toLowerCase();
    const current = grouped.get(key) ?? {
      memberId: row.member_id,
      memberEmail: row.member_email.toLowerCase(),
      assessments: [],
    };
    current.assessments.push(assessment);
    grouped.set(key, current);
  });

  return Array.from(grouped.values()).map((entry) => ({
    ...entry,
    assessments: entry.assessments.sort((left, right) => left.date.localeCompare(right.date)),
  }));
}

export async function savePFRARecord(params: {
  memberId: string;
  memberEmail: string;
  squadron: Squadron;
  assessment: FitnessAssessment;
  accessToken?: string;
}) {
  const waist = params.assessment.components.waist;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/pfra_records`, {
    method: 'POST',
    headers: {
      ...(await getHeaders(params.accessToken)),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id: params.assessment.id,
      member_id: params.memberId,
      member_email: params.memberEmail.toLowerCase(),
      squadron: params.squadron,
      assessment_date: params.assessment.date,
      overall_score: params.assessment.overallScore,
      is_private: params.assessment.isPrivate,
      cardio_score: params.assessment.components.cardio.score,
      cardio_time: params.assessment.components.cardio.time ?? null,
      cardio_laps: params.assessment.components.cardio.laps ?? null,
      cardio_test: params.assessment.components.cardio.test ?? null,
      cardio_exempt: params.assessment.components.cardio.exempt ?? false,
      strength_score: params.assessment.components.pushups.score,
      strength_reps: params.assessment.components.pushups.reps,
      strength_test: params.assessment.components.pushups.test ?? null,
      strength_exempt: params.assessment.components.pushups.exempt ?? false,
      core_score: params.assessment.components.situps.score,
      core_reps: params.assessment.components.situps.reps,
      core_time: params.assessment.components.situps.time ?? null,
      core_test: params.assessment.components.situps.test ?? null,
      core_exempt: params.assessment.components.situps.exempt ?? false,
      waist_score: waist?.score ?? null,
      waist_inches: waist?.inches ?? null,
      waist_exempt: waist?.exempt ?? false,
    }),
  });

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to save PFRA record.';
    throw new Error(message);
  }

  return normalizePFRARecordRow((payload as PFRARecordRow[])[0]);
}

export async function fetchAppNotifications(params: {
  recipientEmail: string;
  accessToken?: string;
}) {
  const query = new URLSearchParams();
  query.set(
    'select',
    'id,sender_member_id,sender_email,sender_name,recipient_member_id,recipient_email,squadron,type,title,message,action_type,action_target_id,action_payload,read_at,created_at'
  );
  query.set('recipient_email', `eq.${params.recipientEmail.toLowerCase()}`);
  query.set('order', 'created_at.desc');

  const response = await fetch(`${SUPABASE_URL}/rest/v1/app_notifications?${query.toString()}`, {
    method: 'GET',
    headers: await getHeaders(params.accessToken),
  });

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to load app notifications.';
    throw new Error(message);
  }

  return (payload as AppNotificationRow[]).map(normalizeAppNotificationRow);
}

export async function sendAppNotification(params: {
  senderMemberId: string;
  senderEmail: string;
  senderName: string;
  recipientEmail: string;
  recipientMemberId?: string | null;
  squadron: Squadron;
  type: string;
  title: string;
  message: string;
  actionType?: string | null;
  actionTargetId?: string | null;
  actionPayload?: Record<string, unknown>;
  accessToken?: string;
}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/app_notifications`, {
    method: 'POST',
    headers: {
      ...(await getHeaders(params.accessToken)),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id: createSupportId('app-notification'),
      sender_member_id: params.senderMemberId,
      sender_email: params.senderEmail.toLowerCase(),
      sender_name: params.senderName,
      recipient_member_id: params.recipientMemberId ?? null,
      recipient_email: params.recipientEmail.toLowerCase(),
      squadron: params.squadron,
      type: params.type,
      title: params.title,
      message: params.message,
      action_type: params.actionType ?? null,
      action_target_id: params.actionTargetId ?? null,
      action_payload: params.actionPayload ?? {},
    }),
  });

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to send app notification.';
    throw new Error(message);
  }

  return normalizeAppNotificationRow((payload as AppNotificationRow[])[0]);
}

export async function markAppNotificationRead(id: string, accessToken?: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/app_notifications?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      ...(await getHeaders(accessToken)),
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      read_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to mark app notification as read.';
    throw new Error(message);
  }
}

export async function fetchSharedWorkouts(
  accessToken?: string,
  squadron?: Squadron,
  options?: { updatedAfter?: string }
) {
  const query = new URLSearchParams();
  query.set('select', 'id,name,type,duration,intensity,description,is_multi_step,steps,created_by,created_at,edited_by,edited_at,squadron,thumbs_up,thumbs_down,favorited_by');
  query.set('order', 'created_at.desc');
  if (squadron) {
    query.set('squadron', `eq.${squadron}`);
  }
  if (options?.updatedAfter) {
    query.set('or', `(created_at.gt.${options.updatedAfter},edited_at.gt.${options.updatedAfter})`);
  }

  let response = await fetch(`${SUPABASE_URL}/rest/v1/shared_workouts?${query.toString()}`, {
    method: 'GET',
    headers: await getHeaders(accessToken),
  });

  let payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
          : 'Unable to load squadron workouts from Supabase.';
    if (isMissingSharedWorkoutEditColumnsError(message)) {
      const fallbackQuery = new URLSearchParams(query);
      fallbackQuery.set('select', 'id,name,type,duration,intensity,description,is_multi_step,steps,created_by,created_at,squadron,thumbs_up,thumbs_down,favorited_by');
      response = await fetch(`${SUPABASE_URL}/rest/v1/shared_workouts?${fallbackQuery.toString()}`, {
        method: 'GET',
        headers: await getHeaders(accessToken),
      });
      payload = await response.json().catch(() => []);
      if (response.ok) {
        return (payload as SharedWorkoutRow[]).map(normalizeSharedWorkoutRow);
      }
    }
    throw new Error(message);
  }

  return (payload as SharedWorkoutRow[]).map(normalizeSharedWorkoutRow);
}

export async function createSharedWorkout(workout: SharedWorkout, accessToken?: string) {
  const basePayload = {
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
    edited_by: workout.editedBy ?? null,
    edited_at: workout.editedAt ?? null,
    squadron: workout.squadron,
    thumbs_up: workout.thumbsUp,
    thumbs_down: workout.thumbsDown,
    favorited_by: workout.favoritedBy,
  };
  let response = await fetch(`${SUPABASE_URL}/rest/v1/shared_workouts`, {
    method: 'POST',
    headers: {
      ...(await getHeaders(accessToken)),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(basePayload),
  });

  let payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
          : 'Unable to create squadron workout in Supabase.';
    if (isMissingSharedWorkoutEditColumnsError(message)) {
      response = await fetch(`${SUPABASE_URL}/rest/v1/shared_workouts`, {
        method: 'POST',
        headers: {
          ...(await getHeaders(accessToken)),
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          ...basePayload,
          edited_by: undefined,
          edited_at: undefined,
        }),
      });
      payload = await response.json().catch(() => []);
      if (response.ok) {
        return normalizeSharedWorkoutRow((payload as SharedWorkoutRow[])[0]);
      }
    }
    throw new Error(message);
  }

  return normalizeSharedWorkoutRow((payload as SharedWorkoutRow[])[0]);
}

export async function updateSharedWorkout(workout: SharedWorkout, accessToken?: string) {
  const basePayload = {
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
    edited_by: workout.editedBy ?? null,
    edited_at: workout.editedAt ?? null,
  };
  let response = await fetch(`${SUPABASE_URL}/rest/v1/shared_workouts?id=eq.${encodeURIComponent(workout.id)}`, {
    method: 'PATCH',
    headers: {
      ...(await getHeaders(accessToken)),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(basePayload),
  });

  let payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
          : 'Unable to update squadron workout in Supabase.';
    if (isMissingSharedWorkoutEditColumnsError(message)) {
      response = await fetch(`${SUPABASE_URL}/rest/v1/shared_workouts?id=eq.${encodeURIComponent(workout.id)}`, {
        method: 'PATCH',
        headers: {
          ...(await getHeaders(accessToken)),
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          ...basePayload,
          edited_by: undefined,
          edited_at: undefined,
        }),
      });
      payload = await response.json().catch(() => []);
      if (response.ok) {
        return normalizeSharedWorkoutRow((payload as SharedWorkoutRow[])[0]);
      }
    }
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
  source?: 'manual' | 'workout';
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
          attendance_source: params.source === 'workout' ? 'workout' : 'manual',
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
    recipientMemberId: thread.recipient_member_id,
    recipientEmail: thread.recipient_email,
    recipientName: thread.recipient_name,
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
  isStaff: boolean;
  accessToken?: string;
}) {
  const query = new URLSearchParams();
  query.set(
    'select',
    'id,requester_member_id,requester_email,requester_name,requester_squadron,recipient_member_id,recipient_email,recipient_name,subject,created_at,updated_at'
  );
  query.set('order', 'updated_at.desc');

  if (!params.isStaff) {
    query.set('requester_email', `eq.${params.email.toLowerCase()}`);
  } else {
    query.set('recipient_email', `eq.${params.email.toLowerCase()}`);
  }

  const threadsResponse = await fetch(`${SUPABASE_URL}/rest/v1/support_threads?${query.toString()}`, {
    method: 'GET',
    headers: await getHeaders(params.accessToken),
  });

  const threadsPayload = await threadsResponse.json().catch(() => []);
  if (!threadsResponse.ok) {
    throw new Error(getSupportInboxErrorMessage(threadsPayload, 'Unable to load support threads from Supabase.'));
  }

  const threads = threadsPayload as SupportThreadRow[];
  if (threads.length === 0) {
    return [] as SupportThreadSummary[];
  }

  const threadIds = threads.map((thread) => thread.id);
  const messagesQuery = new URLSearchParams();
  messagesQuery.set(
    'select',
    'id,thread_id,sender_member_id,sender_email,sender_name,subject,body,is_from_owner,created_at,read_by_owner,read_by_requester'
  );
  messagesQuery.set('order', 'created_at.asc');
  messagesQuery.set('thread_id', `in.(${threadIds.map((id) => `"${id}"`).join(',')})`);

  const messagesResponse = await fetch(`${SUPABASE_URL}/rest/v1/support_messages?${messagesQuery.toString()}`, {
    method: 'GET',
    headers: await getHeaders(params.accessToken),
  });

  const messagesPayload = await messagesResponse.json().catch(() => []);
  if (!messagesResponse.ok) {
    throw new Error(getSupportInboxErrorMessage(messagesPayload, 'Unable to load support messages from Supabase.'));
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
  query.set(
    'select',
    'id,thread_id,sender_member_id,sender_email,sender_name,subject,body,is_from_owner,created_at,read_by_owner,read_by_requester'
  );
  query.set('thread_id', `eq.${threadId}`);
  query.set('order', 'created_at.asc');

  const response = await fetch(`${SUPABASE_URL}/rest/v1/support_messages?${query.toString()}`, {
    method: 'GET',
    headers: await getHeaders(accessToken),
  });

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(getSupportInboxErrorMessage(payload, 'Unable to load support conversation.'));
  }

  return (payload as SupportMessageRow[]).map(normalizeSupportMessage);
}

async function upsertSupportThread(params: {
  requesterMemberId: string;
  requesterEmail: string;
  requesterName: string;
  requesterSquadron: Squadron;
  recipientMemberId?: string | null;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  accessToken?: string;
}) {
  const encodedEmail = encodeURIComponent(params.requesterEmail.toLowerCase());
  const encodedRecipientEmail = encodeURIComponent(params.recipientEmail.toLowerCase());
  const lookupResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/support_threads?select=*&requester_email=eq.${encodedEmail}&recipient_email=eq.${encodedRecipientEmail}`,
    {
      method: 'GET',
      headers: await getHeaders(params.accessToken),
    }
  );

  const lookupPayload = await lookupResponse.json().catch(() => []);
  if (!lookupResponse.ok) {
    throw new Error(getSupportInboxErrorMessage(lookupPayload, 'Unable to look up FitFlight team support thread.'));
  }

  const existing = (lookupPayload as SupportThreadRow[])[0];
  const payload = {
    requester_member_id: params.requesterMemberId,
    requester_email: params.requesterEmail.toLowerCase(),
    requester_name: params.requesterName,
    requester_squadron: params.requesterSquadron,
    recipient_member_id: params.recipientMemberId ?? null,
    recipient_email: params.recipientEmail.toLowerCase(),
    recipient_name: params.recipientName,
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
      throw new Error(getSupportInboxErrorMessage(updatePayload, 'Unable to update FitFlight team support thread.'));
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
    throw new Error(getSupportInboxErrorMessage(createPayload, 'Unable to create FitFlight team support thread.'));
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
  recipientMemberId?: string | null;
  recipientEmail: string;
  recipientName: string;
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
    recipientMemberId: params.recipientMemberId,
    recipientEmail: params.recipientEmail,
    recipientName: params.recipientName,
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
    throw new Error(getSupportInboxErrorMessage(payload, 'Unable to send support message.'));
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
  memberEmail?: string;
  squadron: Squadron;
  canReview: boolean;
  accessToken?: string;
}) {
  const mineQuery = new URLSearchParams();
  mineQuery.set(
    'select',
    'id,member_id,member_email,member_name,member_rank,member_flight,squadron,workout_date,workout_type,duration,duration_seconds,distance,is_private,proof_image_data,status,reviewer_member_id,reviewer_name,reviewer_note,attendance_marked_by_submission,requester_read,reviewer_read,created_at,updated_at'
  );
  mineQuery.set('order', 'updated_at.desc');
  if (params.memberEmail?.trim()) {
    mineQuery.set(
      'or',
      `(member_id.eq.${params.memberId},member_email.eq.${params.memberEmail.trim().toLowerCase()})`
    );
  } else {
    mineQuery.set('member_id', `eq.${params.memberId}`);
  }

  const requests: Promise<Response>[] = [
    fetch(
      `${SUPABASE_URL}/rest/v1/manual_workout_submissions?${mineQuery.toString()}`,
      {
        method: 'GET',
        headers: await getHeaders(params.accessToken),
      }
    ),
  ];

  if (params.canReview) {
    requests.push(
      fetch(
        `${SUPABASE_URL}/rest/v1/manual_workout_submissions?select=id,member_id,member_email,member_name,member_rank,member_flight,squadron,workout_date,workout_type,duration,duration_seconds,distance,is_private,proof_image_data,status,reviewer_member_id,reviewer_name,reviewer_note,attendance_marked_by_submission,requester_read,reviewer_read,created_at,updated_at&squadron=eq.${encodeURIComponent(params.squadron)}&status=eq.pending&order=created_at.asc`,
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
  durationSeconds?: number;
  distance?: number;
  isPrivate: boolean;
  proofImageData: string;
  submissionId?: string;
  accessToken?: string;
}) {
  const now = new Date().toISOString();
  const id = params.submissionId ?? createSupportId('manual-workout');
  const basePayload = {
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
    duration_seconds: params.durationSeconds ?? 0,
    distance: params.distance ?? null,
    is_private: params.isPrivate,
    proof_image_data: serializeImageReference(params.proofImageData),
    status: 'pending',
    reviewer_member_id: null,
    reviewer_name: null,
    reviewer_note: null,
    requester_read: true,
    reviewer_read: false,
    created_at: now,
    updated_at: now,
  };
  const headers = {
    ...(await getHeaders(params.accessToken)),
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  let response = await fetch(`${SUPABASE_URL}/rest/v1/manual_workout_submissions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...basePayload,
      attendance_marked_by_submission: false,
    }),
  });

  let payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message = getManualWorkoutWriteErrorMessage(payload, 'Unable to submit manual workout proof.');
    if (isMissingAttendanceMarkedBySubmissionError(message)) {
      response = await fetch(`${SUPABASE_URL}/rest/v1/manual_workout_submissions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(basePayload),
      });
      payload = await response.json().catch(() => []);
    } else {
      throw new Error(message);
    }
  }

  if (!response.ok) {
    throw new Error(getManualWorkoutWriteErrorMessage(payload, 'Unable to submit manual workout proof.'));
  }

  return normalizeManualWorkoutSubmissionRow((payload as ManualWorkoutSubmissionRow[])[0]);
}

export async function reviewManualWorkoutSubmission(params: {
  submissionId: string;
  reviewerMemberId: string;
  reviewerName: string;
  approved: boolean;
  note?: string;
  attendanceMarkedBySubmission?: boolean;
  accessToken?: string;
}) {
  const headers = {
    ...(await getHeaders(params.accessToken)),
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  const basePayload = {
    status: params.approved ? 'approved' : 'denied',
    reviewer_member_id: params.reviewerMemberId,
    reviewer_name: params.reviewerName,
    reviewer_note: params.note?.trim() || null,
    requester_read: false,
    reviewer_read: true,
    updated_at: new Date().toISOString(),
  };
  let response = await fetch(
    `${SUPABASE_URL}/rest/v1/manual_workout_submissions?id=eq.${encodeURIComponent(params.submissionId)}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        ...basePayload,
        attendance_marked_by_submission: params.attendanceMarkedBySubmission ?? false,
      }),
    }
  );

  let payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message = getManualWorkoutWriteErrorMessage(payload, 'Unable to review manual workout submission.');
    if (isMissingAttendanceMarkedBySubmissionError(message)) {
      response = await fetch(
        `${SUPABASE_URL}/rest/v1/manual_workout_submissions?id=eq.${encodeURIComponent(params.submissionId)}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify(basePayload),
        }
      );
      payload = await response.json().catch(() => []);
    } else {
      throw new Error(message);
    }
  }

  if (!response.ok) {
    throw new Error(getManualWorkoutWriteErrorMessage(payload, 'Unable to review manual workout submission.'));
  }

  return normalizeManualWorkoutSubmissionRow((payload as ManualWorkoutSubmissionRow[])[0]);
}

export async function updateManualWorkoutSubmission(params: {
  submissionId: string;
  workoutDate: string;
  workoutType: WorkoutType;
  duration: number;
  durationSeconds?: number;
  distance?: number;
  isPrivate: boolean;
  proofImageData: string;
  accessToken?: string;
}) {
  const headers = {
    ...(await getHeaders(params.accessToken)),
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  const basePayload = {
    workout_date: params.workoutDate,
    workout_type: params.workoutType,
    duration: params.duration,
    duration_seconds: params.durationSeconds ?? 0,
    distance: params.distance ?? null,
    is_private: params.isPrivate,
    proof_image_data: serializeImageReference(params.proofImageData),
    status: 'pending',
    reviewer_member_id: null,
    reviewer_name: null,
    reviewer_note: null,
    requester_read: true,
    reviewer_read: false,
    updated_at: new Date().toISOString(),
  };
  let response = await fetch(
    `${SUPABASE_URL}/rest/v1/manual_workout_submissions?id=eq.${encodeURIComponent(params.submissionId)}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        ...basePayload,
        attendance_marked_by_submission: false,
      }),
    }
  );

  let payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message = getManualWorkoutWriteErrorMessage(payload, 'Unable to update manual workout submission.');
    if (isMissingAttendanceMarkedBySubmissionError(message)) {
      response = await fetch(
        `${SUPABASE_URL}/rest/v1/manual_workout_submissions?id=eq.${encodeURIComponent(params.submissionId)}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify(basePayload),
        }
      );
      payload = await response.json().catch(() => []);
    } else {
      throw new Error(message);
    }
  }

  if (!response.ok) {
    throw new Error(getManualWorkoutWriteErrorMessage(payload, 'Unable to update manual workout submission.'));
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

export async function fetchApprovedManualWorkouts(
  accessToken?: string,
  squadron?: Squadron,
  options?: { includeProofImage?: boolean; updatedAfter?: string }
) {
  const query = new URLSearchParams();
  query.set(
    'select',
    options?.includeProofImage === false
      ? 'id,member_id,member_email,member_name,member_rank,member_flight,squadron,workout_date,workout_type,duration,duration_seconds,distance,is_private,status,reviewer_member_id,reviewer_name,reviewer_note,attendance_marked_by_submission,requester_read,reviewer_read,created_at,updated_at'
      : 'id,member_id,member_email,member_name,member_rank,member_flight,squadron,workout_date,workout_type,duration,duration_seconds,distance,is_private,proof_image_data,status,reviewer_member_id,reviewer_name,reviewer_note,attendance_marked_by_submission,requester_read,reviewer_read,created_at,updated_at'
  );
  query.set('status', 'eq.approved');
  query.set('order', 'workout_date.desc');
  if (squadron) {
    query.set('squadron', `eq.${squadron}`);
  }
  if (options?.updatedAfter) {
    query.set('updated_at', `gt.${options.updatedAfter}`);
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
  const grouped = new Map<string, { memberId?: string; memberEmail?: string; workouts: Member['workouts'][number][] }>();

  submissions.forEach((submission) => {
    const workout = {
      id: submission.id,
      externalId: submission.id,
      date: submission.workoutDate,
      type: submission.workoutType,
      duration: submission.duration,
      durationSeconds: submission.durationSeconds,
      distance: submission.distance,
      source: 'manual' as const,
      screenshotUri: submission.proofImageData || undefined,
      title:
        submission.workoutType === 'Running'
          ? 'Run'
          : submission.workoutType === 'Walking'
            ? 'Walk'
            : submission.workoutType === 'Cycling'
              ? 'Ride'
              : submission.workoutType === 'Swimming'
                ? 'Swim'
                : submission.workoutType,
      isPrivate: submission.isPrivate,
      attendanceMarkedBySubmission: submission.attendanceMarkedBySubmission,
    };
    const key = submission.memberId || submission.memberEmail.toLowerCase();
    const current = grouped.get(key) ?? {
      memberId: submission.memberId,
      memberEmail: submission.memberEmail.toLowerCase(),
      workouts: [],
    };
    current.workouts.push(workout);
    grouped.set(key, current);
  });

  return Array.from(grouped.values()).map((entry) => ({
    memberId: entry.memberId,
    memberEmail: entry.memberEmail,
    workouts: entry.workouts,
  }));
}

export async function fetchManualWorkoutProofImageMap(
  submissionIds: string[],
  accessToken?: string
) {
  const uniqueIds = Array.from(new Set(submissionIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) {
    return {} as Record<string, string>;
  }

  const query = new URLSearchParams();
  query.set('select', 'id,proof_image_data');
  query.set('id', `in.(${uniqueIds.map((id) => `"${id}"`).join(',')})`);

  const response = await fetch(`${SUPABASE_URL}/rest/v1/manual_workout_submissions?${query.toString()}`, {
    method: 'GET',
    headers: await getHeaders(accessToken),
  });

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Unable to load workout proof images.';
    throw new Error(message);
  }

  return (payload as Array<Pick<ManualWorkoutSubmissionRow, 'id' | 'proof_image_data'>>).reduce<Record<string, string>>(
    (accumulator, row) => {
      const uri = getDisplayImageUri(row.proof_image_data ?? undefined) ?? row.proof_image_data ?? '';
      if (uri) {
        accumulator[row.id] = uri;
      }
      return accumulator;
    },
    {}
  );
}

export type GoogleAnalyticsUsageSummary = {
  activeUsers: number;
  newUsers: number;
  sessions: number;
  screenPageViews: number;
  engagedSessions: number;
  averageSessionDuration: number;
};

export type GoogleAnalyticsUsageEvent = {
  eventName: string;
  eventCount: number;
  totalUsers: number;
};

export type GoogleAnalyticsUsageDay = {
  date: string;
  activeUsers: number;
  sessions: number;
};

export type GoogleAnalyticsUsageReport = {
  propertyId: string;
  rangeLabel: string;
  measurementId?: string;
  generatedAt: string;
  summary: GoogleAnalyticsUsageSummary;
  events: GoogleAnalyticsUsageEvent[];
  daily: GoogleAnalyticsUsageDay[];
};

export async function fetchGoogleAnalyticsUsage(accessToken?: string) {
  const resolvedAccessToken = await getValidAccessToken(accessToken ?? null);

  if (!resolvedAccessToken) {
    throw new Error('Your admin session is missing. Please sign in again.');
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/google-analytics-report`, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${resolvedAccessToken}`,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const rawMessage =
      typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : 'Unable to load app usage analytics.';

    const normalized = rawMessage.toLowerCase();

    const message = normalized.includes('missing authorization')
      ? 'Your admin session is missing. Please sign in again.'
      : normalized.includes('verify the requesting user')
        ? 'Your session could not be verified. Please sign in again.'
        : normalized.includes('permission')
          ? 'Your account does not have permission to view App Usage Analytics.'
          : normalized.includes('missing environment variable')
            ? 'App Usage Analytics is missing a Google Analytics secret in Supabase.'
            : normalized.includes('authorize google analytics access')
              ? 'Google Analytics authentication failed. Recheck the GA service-account secrets in Supabase.'
              : normalized.includes('property')
                ? 'Google Analytics could not access the configured property. Recheck the Property ID and service-account access.'
                : rawMessage;

    throw new Error(message);
  }

  return payload as GoogleAnalyticsUsageReport;
}
