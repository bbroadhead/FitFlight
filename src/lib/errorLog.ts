import { useEffect } from 'react';
import { create } from 'zustand';

export type AppErrorLogEntry = {
  id: string;
  timestamp: string;
  source: 'console' | 'window' | 'promise' | 'boundary';
  message: string;
  stack?: string;
  location: string;
};

type ErrorLogState = {
  entries: AppErrorLogEntry[];
  currentRouteLabel: string;
  currentOverlayLabel: string | null;
  addEntry: (entry: Omit<AppErrorLogEntry, 'id' | 'timestamp'> & Partial<Pick<AppErrorLogEntry, 'id' | 'timestamp'>>) => void;
  clearEntries: () => void;
  setCurrentRouteLabel: (label: string) => void;
  setCurrentOverlayLabel: (label: string | null) => void;
};

const MAX_ERROR_LOG_ENTRIES = 200;

export const useErrorLogStore = create<ErrorLogState>((set) => ({
  entries: [],
  currentRouteLabel: 'Unknown Screen',
  currentOverlayLabel: null,
  addEntry: (entry) =>
    set((state) => ({
      entries: [
        ...state.entries,
        {
          id: entry.id ?? `error-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: entry.timestamp ?? new Date().toISOString(),
          source: entry.source,
          message: entry.message,
          stack: entry.stack,
          location: entry.location,
        },
      ].slice(-MAX_ERROR_LOG_ENTRIES),
    })),
  clearEntries: () => set({ entries: [] }),
  setCurrentRouteLabel: (currentRouteLabel) => set({ currentRouteLabel }),
  setCurrentOverlayLabel: (currentOverlayLabel) => set({ currentOverlayLabel }),
}));

const IGNORED_ERROR_LOG_MESSAGE_PATTERNS = [
  /invalid dom property/i,
  /transform-origin/i,
  /transformOrigin/i,
];

function stringifyValue(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function recordAppError(params: {
  source: AppErrorLogEntry['source'];
  error?: unknown;
  message?: string;
  stack?: string;
  location?: string;
}) {
  const error =
    params.error instanceof Error
      ? params.error
      : params.error
        ? new Error(stringifyValue(params.error))
        : null;

  const message = params.message ?? error?.message ?? 'Unknown error';
  const normalizedMessage = message.trim();
  const shouldIgnoreTransformOriginWarning =
    IGNORED_ERROR_LOG_MESSAGE_PATTERNS.every((pattern) => pattern.test(normalizedMessage));
  if (shouldIgnoreTransformOriginWarning) {
    return;
  }
  const stack = params.stack ?? error?.stack;
  const state = useErrorLogStore.getState();
  const location = params.location ?? (
    state.currentOverlayLabel
      ? `${state.currentRouteLabel} > ${state.currentOverlayLabel}`
      : state.currentRouteLabel
  );

  useErrorLogStore.getState().addEntry({
    source: params.source,
    message,
    stack,
    location,
  });
}

export function formatErrorLogRouteLabel(pathname: string | null | undefined) {
  if (!pathname || pathname === '/') {
    return 'Home';
  }

  const normalized = pathname
    .replace(/^\//, '')
    .replace(/\?.*$/, '')
    .replace(/^\(tabs\)\//, '')
    .replace(/\//g, ' ')
    .trim();

  switch (normalized) {
    case 'login':
      return 'Login';
    case '(tabs)':
    case '':
    case 'index':
      return 'Home';
    case '(tabs) attendance':
    case 'attendance':
      return 'Attendance';
    case '(tabs) workouts':
    case 'workouts':
      return 'Workouts';
    case '(tabs) calculator':
    case 'calculator':
      return 'Calculator';
    case '(tabs) profile':
    case 'profile':
      return 'Account';
    case 'leaderboard':
      return 'Leaderboard';
    case 'member-profile':
      return 'Profile';
    case 'analytics':
      return 'Squadron Analytics';
    case 'personal-analytics':
      return 'Personal Analytics';
    case 'bulk-pfra-entry':
      return 'Bulk PFRA Entry';
    default:
      return normalized
        .split(' ')
        .filter(Boolean)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');
  }
}

export function useErrorLogScreenContext(routeLabel: string, overlayLabel?: string | null) {
  const setCurrentRouteLabel = useErrorLogStore((state) => state.setCurrentRouteLabel);
  const setCurrentOverlayLabel = useErrorLogStore((state) => state.setCurrentOverlayLabel);

  useEffect(() => {
    setCurrentRouteLabel(routeLabel);
  }, [routeLabel, setCurrentRouteLabel]);

  useEffect(() => {
    setCurrentOverlayLabel(overlayLabel ?? null);
    return () => {
      setCurrentOverlayLabel(null);
    };
  }, [overlayLabel, setCurrentOverlayLabel]);
}
