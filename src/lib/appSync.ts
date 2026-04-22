import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type {
  AttendanceSource,
  FitnessAssessment,
  Flight,
  Member,
  SharedWorkout,
  Squadron,
} from '@/lib/store';
import {
  assignUFPMRole,
  createRosterMember,
  createSharedWorkout,
  deleteRosterMember,
  deleteSharedWorkoutFromSupabase,
  savePFRARecord,
  sendAppNotification,
  sendSupportMessage,
  setAttendanceStatus,
  setWeeklyAttendanceExcusal,
  updateMemberRole,
  updateRosterMember,
  updateSharedWorkout,
} from '@/lib/supabaseData';

type SyncIndicator = 'idle' | 'syncing' | 'success';

type AttendanceQueueItem = {
  id: string;
  type: 'attendance_status';
  payload: {
    date: string;
    flight: Flight;
    squadron: Squadron;
    memberId: string;
    createdBy: string;
    isAttending: boolean;
    source?: AttendanceSource;
  };
  createdAt: string;
};

type WeeklyExcusalQueueItem = {
  id: string;
  type: 'weekly_excusal';
  payload: {
    weekStart: string;
    squadron: Squadron;
    memberId: string;
    excusedByMemberId: string;
    isExcused: boolean;
  };
  createdAt: string;
};

type SavePFRAQueueItem = {
  id: string;
  type: 'save_pfra_record';
  payload: {
    memberId: string;
    memberEmail: string;
    squadron: Squadron;
    assessment: FitnessAssessment;
    recordedByMemberId?: string;
    recordedByName?: string;
  };
  createdAt: string;
};

type SharedWorkoutQueueItem = {
  id: string;
  type: 'create_shared_workout' | 'update_shared_workout';
  payload: {
    workout: SharedWorkout;
  };
  createdAt: string;
};

type DeleteSharedWorkoutQueueItem = {
  id: string;
  type: 'delete_shared_workout';
  payload: {
    workoutId: string;
  };
  createdAt: string;
};

type SupportMessageQueueItem = {
  id: string;
  type: 'send_support_message';
  payload: Parameters<typeof sendSupportMessage>[0];
  createdAt: string;
};

type AppNotificationQueueItem = {
  id: string;
  type: 'send_app_notification';
  payload: Parameters<typeof sendAppNotification>[0];
  createdAt: string;
};

type CreateRosterMemberQueueItem = {
  id: string;
  type: 'create_roster_member';
  payload: {
    member: Member;
  };
  createdAt: string;
};

type UpdateRosterMemberQueueItem = {
  id: string;
  type: 'update_roster_member';
  payload: {
    previousMember: Member;
    nextMember: Member;
  };
  createdAt: string;
};

type DeleteRosterMemberQueueItem = {
  id: string;
  type: 'delete_roster_member';
  payload: {
    member: Member;
  };
  createdAt: string;
};

type UpdateMemberRoleQueueItem = {
  id: string;
  type: 'update_member_role';
  payload: {
    email: string;
    role: Member['accountType'];
  };
  createdAt: string;
};

type AssignUFPMRoleQueueItem = {
  id: string;
  type: 'assign_ufpm_role';
  payload: {
    email: string;
  };
  createdAt: string;
};

export type OfflineQueueItem =
  | AttendanceQueueItem
  | WeeklyExcusalQueueItem
  | SavePFRAQueueItem
  | SharedWorkoutQueueItem
  | DeleteSharedWorkoutQueueItem
  | SupportMessageQueueItem
  | AppNotificationQueueItem
  | CreateRosterMemberQueueItem
  | UpdateRosterMemberQueueItem
  | DeleteRosterMemberQueueItem
  | UpdateMemberRoleQueueItem
  | AssignUFPMRoleQueueItem;

type AppSyncState = {
  isOnline: boolean;
  syncIndicator: SyncIndicator;
  lastSyncedAt: string | null;
  queuedActions: OfflineQueueItem[];
  setOnlineStatus: (isOnline: boolean) => void;
  setSyncIndicator: (indicator: SyncIndicator) => void;
  setLastSyncedAt: (iso: string | null) => void;
  enqueueAction: (item: OfflineQueueItem) => void;
  removeQueuedAction: (id: string) => void;
  clearQueuedActions: () => void;
};

let netInfoUnsubscribe: null | (() => void) = null;
let activeSyncCount = 0;
let successIndicatorTimeout: ReturnType<typeof setTimeout> | null = null;
let isFlushingQueue = false;
const syncHandlers = new Map<string, () => Promise<void>>();

export const useAppSyncStore = create<AppSyncState>()(
  persist(
    (set) => ({
      isOnline: true,
      syncIndicator: 'idle',
      lastSyncedAt: null,
      queuedActions: [],
      setOnlineStatus: (isOnline) => set({ isOnline }),
      setSyncIndicator: (syncIndicator) => set({ syncIndicator }),
      setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
      enqueueAction: (item) =>
        set((state) => ({
          queuedActions: [...state.queuedActions.filter((candidate) => candidate.id !== item.id), item],
        })),
      removeQueuedAction: (id) =>
        set((state) => ({
          queuedActions: state.queuedActions.filter((item) => item.id !== id),
        })),
      clearQueuedActions: () => set({ queuedActions: [] }),
    }),
    {
      name: 'fitflight-app-sync',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        isOnline: state.isOnline,
        lastSyncedAt: state.lastSyncedAt,
        queuedActions: state.queuedActions,
      }),
    }
  )
);

export function createOfflineActionId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function registerSyncHandler(scope: string, handler: () => Promise<void>) {
  syncHandlers.set(scope, handler);
  return () => {
    if (syncHandlers.get(scope) === handler) {
      syncHandlers.delete(scope);
    }
  };
}

export function initializeAppSyncNetworkMonitor() {
  if (netInfoUnsubscribe) {
    return netInfoUnsubscribe;
  }

  netInfoUnsubscribe = NetInfo.addEventListener((state) => {
    const nextOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
    useAppSyncStore.getState().setOnlineStatus(nextOnline);
  });

  return () => {
    netInfoUnsubscribe?.();
    netInfoUnsubscribe = null;
  };
}

function beginTrackedSync() {
  activeSyncCount += 1;
  if (successIndicatorTimeout) {
    clearTimeout(successIndicatorTimeout);
    successIndicatorTimeout = null;
  }
  useAppSyncStore.getState().setSyncIndicator('syncing');
}

function finishTrackedSyncSuccess() {
  activeSyncCount = Math.max(0, activeSyncCount - 1);
  if (activeSyncCount > 0) {
    return;
  }

  const now = new Date().toISOString();
  useAppSyncStore.getState().setLastSyncedAt(now);
  useAppSyncStore.getState().setSyncIndicator('success');
  successIndicatorTimeout = setTimeout(() => {
    useAppSyncStore.getState().setSyncIndicator('idle');
    successIndicatorTimeout = null;
  }, 2200);
}

function finishTrackedSyncFailure() {
  activeSyncCount = Math.max(0, activeSyncCount - 1);
  if (activeSyncCount === 0) {
    useAppSyncStore.getState().setSyncIndicator('idle');
  }
}

export async function runTrackedSync<T>(task: () => Promise<T>) {
  beginTrackedSync();
  try {
    const result = await task();
    finishTrackedSyncSuccess();
    return result;
  } catch (error) {
    finishTrackedSyncFailure();
    throw error;
  }
}

export async function requestRegisteredSync(scope: string) {
  const handler = syncHandlers.get(scope) ?? syncHandlers.get('global');
  if (!handler) {
    return;
  }

  await runTrackedSync(async () => {
    await handler();
  });
}

export function formatMilitarySyncTime(value: string | Date | null | undefined) {
  if (!value) {
    return '--:--';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }

  return new Intl.DateTimeFormat([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).format(date);
}

function isOfflineLikeError(error: unknown) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('offline')
  );
}

async function processQueuedAction(item: OfflineQueueItem, accessToken?: string) {
  switch (item.type) {
    case 'attendance_status':
      await setAttendanceStatus({ ...item.payload, accessToken });
      return;
    case 'weekly_excusal':
      await setWeeklyAttendanceExcusal({ ...item.payload, accessToken });
      return;
    case 'save_pfra_record':
      await savePFRARecord({ ...item.payload, accessToken });
      return;
    case 'create_shared_workout':
      await createSharedWorkout(item.payload.workout, accessToken);
      return;
    case 'update_shared_workout':
      await updateSharedWorkout(item.payload.workout, accessToken);
      return;
    case 'delete_shared_workout':
      await deleteSharedWorkoutFromSupabase(item.payload.workoutId, accessToken);
      return;
    case 'send_support_message':
      await sendSupportMessage({ ...item.payload, accessToken });
      return;
    case 'send_app_notification':
      await sendAppNotification({ ...item.payload, accessToken });
      return;
    case 'create_roster_member':
      await createRosterMember(item.payload.member, accessToken);
      return;
    case 'update_roster_member':
      await updateRosterMember(item.payload.previousMember, item.payload.nextMember, accessToken);
      return;
    case 'delete_roster_member':
      await deleteRosterMember(item.payload.member, accessToken);
      return;
    case 'update_member_role':
      await updateMemberRole(item.payload.email, item.payload.role, accessToken);
      return;
    case 'assign_ufpm_role':
      await assignUFPMRole(item.payload.email, accessToken);
      return;
  }
}

export async function flushOfflineQueue(accessToken?: string) {
  const { isOnline, queuedActions, removeQueuedAction } = useAppSyncStore.getState();
  if (!isOnline || queuedActions.length === 0 || isFlushingQueue) {
    return;
  }

  isFlushingQueue = true;
  try {
    for (const item of [...queuedActions]) {
      try {
        await processQueuedAction(item, accessToken);
        removeQueuedAction(item.id);
      } catch (error) {
        if (isOfflineLikeError(error)) {
          break;
        }
        console.error(`Unable to replay offline action ${item.type}.`, error);
      }
    }
  } finally {
    isFlushingQueue = false;
  }
}

export async function runOrQueueOfflineMutation<T>(params: {
  action: OfflineQueueItem;
  execute: () => Promise<T>;
  onQueued?: () => void;
}) {
  const { isOnline, enqueueAction } = useAppSyncStore.getState();

  if (!isOnline) {
    enqueueAction(params.action);
    params.onQueued?.();
    return { queued: true as const, result: null as T | null };
  }

  try {
    const result = await params.execute();
    return { queued: false as const, result };
  } catch (error) {
    if (isOfflineLikeError(error)) {
      enqueueAction(params.action);
      params.onQueued?.();
      return { queued: true as const, result: null as T | null };
    }
    throw error;
  }
}
