import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Types
export type Flight = 'Apex' | 'Bomber' | 'Cryptid' | 'Doom' | 'Ewok' | 'Foxhound' | 'ADF' | 'DET';
export type AccountType = 'fitflight_creator' | 'ufpm' | 'ptl' | 'standard';
export type Squadron = 'Hawks' | 'Tigers';
export type WorkoutType = 'Running' | 'Walking' | 'Cycling' | 'Strength' | 'HIIT' | 'Swimming' | 'Sports' | 'Cardio' | 'Flexibility' | 'Other';
export type IntegrationService = 'apple_health' | 'strava' | 'garmin';

export const SQUADRONS: Squadron[] = ['Hawks', 'Tigers'];
export const WORKOUT_TYPES: WorkoutType[] = ['Running', 'Walking', 'Cycling', 'Strength', 'HIIT', 'Swimming', 'Sports', 'Cardio', 'Flexibility', 'Other'];

const DISPLAY_RANK_MAP: Record<string, string> = {
  AB: 'AB',
  AMN: 'Amn',
  A1C: 'A1C',
  SRA: 'SrA',
  SSG: 'SSgt',
  SSGT: 'SSgt',
  TSG: 'TSgt',
  TSGT: 'TSgt',
  MSG: 'MSgt',
  MSGT: 'MSgt',
  SMS: 'SMSgt',
  SMSGT: 'SMSgt',
  CMS: 'CMSgt',
  CMSGT: 'CMSgt',
};

// Shared Workout Submission (community workouts)
export interface SharedWorkout {
  id: string;
  name: string;
  type: WorkoutType;
  duration: number; // minutes
  intensity: number; // 1-10
  description: string;
  isMultiStep: boolean;
  steps: string[];
  createdBy: string; // member id
  createdAt: string; // ISO date
  squadron: Squadron;
  thumbsUp: string[]; // member ids who liked
  thumbsDown: string[]; // member ids who disliked
  favoritedBy: string[]; // member ids who favorited
}

export interface FitnessAssessment {
  id: string;
  date: string; // ISO date string
  overallScore: number;
  components: {
    cardio: { score: number; time?: string; laps?: number };
    pushups: { score: number; reps: number };
    situps: { score: number; reps: number };
    waist?: { score: number; inches: number };
  };
  isPrivate: boolean;
}

export interface Workout {
  id: string;
  externalId?: string;
  date: string;
  type: WorkoutType;
  duration: number; // minutes
  distance?: number; // miles
  source: 'manual' | 'screenshot' | 'apple_health' | 'strava' | 'garmin';
  screenshotUri?: string;
  title?: string;
  isPrivate: boolean;
}

export interface IntegrationConnection {
  connectedAt: string;
  lastSyncedAt?: string;
  externalId?: string;
  displayName?: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedDate?: string;
  category: 'leaderboard' | 'milestone' | 'streak' | 'fitness' | 'special';
  isHard: boolean; // Hard achievements get gold border and badge
}

export interface MonthlyPlacement {
  month: string; // YYYY-MM format
  position: 1 | 2 | 3;
}

export interface ScheduledPTSession {
  id: string;
  date: string; // ISO date string
  time: string; // Military time format HH:MM
  description: string;
  flight: Flight;
  squadron: Squadron;
  createdBy: string;
  attendees: string[];
}

export interface Member {
  id: string;
  rank: string;
  firstName: string;
  lastName: string;
  flight: Flight;
  squadron: Squadron;
  accountType: AccountType;
  email: string;
  profilePicture?: string; // URI to profile picture
  exerciseMinutes: number;
  distanceRun: number;
  connectedApps: string[];
  fitnessAssessments: FitnessAssessment[];
  workouts: Workout[];
  achievements: string[]; // achievement IDs
  requiredPTSessionsPerWeek: number;
  isVerified: boolean;
  ptlPendingApproval: boolean;
  linkedAttendanceId?: string; // Links to attendance record created before account
  monthlyPlacements: MonthlyPlacement[]; // Track top 3 placements
  trophyCount: number; // Number of times placed in top 3
  hasSeenTutorial?: boolean;
}

export interface PTSession {
  id: string;
  date: string;
  flight: Flight;
  squadron: Squadron;
  attendees: string[];
  createdBy: string;
}

export interface AttendanceRecord {
  id: string;
  rank: string;
  firstName: string;
  lastName: string;
  flight: Flight;
  sessions: string[]; // dates attended
}

export interface Notification {
  id: string;
  type: 'ptl_request' | 'achievement' | 'reminder' | 'general';
  title: string;
  message: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface User {
  id: string;
  rank: string;
  firstName: string;
  lastName: string;
  flight: Flight;
  squadron: Squadron;
  accountType: AccountType;
  email: string;
  profilePicture?: string; // URI to profile picture
  isVerified: boolean;
  ptlPendingApproval: boolean;
  fitnessAssessmentsPrivate: boolean;
  hasSeenTutorial?: boolean; // Whether user has completed the onboarding tutorial
  connectedIntegrations?: IntegrationService[]; // Connected fitness app integrations
  integrationConnections?: Partial<Record<IntegrationService, IntegrationConnection>>;
}

// Helper to get display name
export const getDisplayName = (user: { rank: string; firstName: string; lastName: string }) => {
  return `${formatRankDisplay(user.rank)} ${user.firstName} ${user.lastName}`;
};

export const formatRankDisplay = (rank: string) => {
  const normalized = rank.trim().replace(/\./g, '').toUpperCase();
  return DISPLAY_RANK_MAP[normalized] ?? rank.trim();
};

// Helper to calculate required PT sessions based on fitness score
export const calculateRequiredPTSessions = (score: number): number => {
  if (score >= 90) return 1;
  if (score >= 80) return 2;
  if (score >= 75) return 3;
  return 4; // <75
};

// All available achievements
export const ALL_ACHIEVEMENTS: Achievement[] = [
  // Leaderboard achievements
  { id: 'gold_month', name: 'Gold Champion', description: 'Place 1st on the monthly leaderboard', icon: 'crown', category: 'leaderboard', isHard: true },
  { id: 'silver_month', name: 'Silver Performer', description: 'Place 2nd on the monthly leaderboard', icon: 'medal', category: 'leaderboard', isHard: false },
  { id: 'bronze_month', name: 'Bronze Contender', description: 'Place 3rd on the monthly leaderboard', icon: 'award', category: 'leaderboard', isHard: false },

  // Milestone achievements
  { id: 'first_workout', name: 'First Steps', description: 'Log your first workout', icon: 'footprints', category: 'milestone', isHard: false },
  { id: '10_workouts', name: 'Getting Consistent', description: 'Log 10 workouts', icon: 'dumbbell', category: 'milestone', isHard: false },
  { id: '50_workouts', name: 'Dedicated Athlete', description: 'Log 50 workouts', icon: 'trophy', category: 'milestone', isHard: true },
  { id: '100_workouts', name: 'Century Club', description: 'Log 100 workouts', icon: 'star', category: 'milestone', isHard: true },
  { id: '100_miles', name: 'Century Runner', description: 'Run 100 total miles', icon: 'map-pin', category: 'milestone', isHard: true },
  { id: '500_miles', name: 'Marathon Master', description: 'Run 500 total miles', icon: 'mountain', category: 'milestone', isHard: true },

  // Streak achievements
  { id: 'week_streak', name: 'Week Warrior', description: 'Complete PT for 7 consecutive days', icon: 'flame', category: 'streak', isHard: false },
  { id: 'month_streak', name: 'Monthly Machine', description: 'Complete PT every week for a month', icon: 'zap', category: 'streak', isHard: true },

  // Fitness achievements
  { id: 'excellent_fa', name: 'Excellent Rating', description: 'Score 90+ on a PFRA', icon: 'shield-check', category: 'fitness', isHard: false },
  { id: 'perfect_fa', name: 'Perfect Score', description: 'Score 100 on a PFRA', icon: 'sparkles', category: 'fitness', isHard: true },
  { id: 'improvement', name: 'Self Improvement', description: 'Improve your PFRA score by 10+ points', icon: 'trending-up', category: 'fitness', isHard: false },

  // Additional achievements
  { id: '25_workouts', name: 'Quarter Century', description: 'Log 25 workouts', icon: 'target', category: 'milestone', isHard: false },
  { id: '200_workouts', name: 'Fitness Legend', description: 'Log 200 workouts', icon: 'gem', category: 'milestone', isHard: true },
  { id: '1000_miles', name: 'Ultra Runner', description: 'Run 1000 total miles', icon: 'rocket', category: 'milestone', isHard: true },
  { id: 'variety', name: 'Jack of All Trades', description: 'Log 5 different workout types', icon: 'layers', category: 'milestone', isHard: false },
  { id: 'three_month_streak', name: 'Quarterly Champion', description: 'Complete PT every week for 3 months', icon: 'shield', category: 'streak', isHard: true },
  { id: 'early_bird', name: 'Early Bird', description: 'Attend 10 morning PT sessions', icon: 'sunrise', category: 'streak', isHard: false },
  { id: 'iron_will', name: 'Iron Will', description: 'Never miss a required PT session for a month', icon: 'anchor', category: 'streak', isHard: true },
  { id: 'top_3_twice', name: 'Consistent Performer', description: 'Place top 3 on leaderboard twice', icon: 'repeat', category: 'leaderboard', isHard: true },
  { id: 'top_3_five', name: 'Dominant Force', description: 'Place top 3 on leaderboard five times', icon: 'crown', category: 'leaderboard', isHard: true },

  // Special achievements
  { id: 'completionist', name: 'Completionist', description: 'Earn all other achievements', icon: 'award', category: 'special', isHard: true },
];

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  hasCheckedAuth: boolean;
  rememberSession: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  login: (user: User, options?: { rememberSession?: boolean }) => void;
  setSessionTokens: (tokens: { accessToken: string | null; refreshToken: string | null }) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  setHasCheckedAuth: (checked: boolean) => void;
}

interface MemberState {
  members: Member[];
  ptSessions: PTSession[];
  scheduledSessions: ScheduledPTSession[];
  attendanceRecords: AttendanceRecord[];
  notifications: Notification[];
  sharedWorkouts: SharedWorkout[];
  defaultPTSessionsPerWeek: number;
  ufpmId: string | null;

  // Member actions
  addMember: (member: Member) => void;
  syncMembersFromRoster: (rosterMembers: Member[]) => void;
  removeMember: (id: string) => void;
  updateMember: (id: string, updates: Partial<Member>) => void;
  getMemberById: (id: string) => Member | undefined;

  // PT Session actions
  addPTSession: (session: PTSession) => void;
  syncPTSessions: (sessions: PTSession[]) => void;
  updatePTSession: (id: string, updates: Partial<PTSession>) => void;
  deletePTSession: (id: string) => void;
  toggleAttendance: (sessionId: string, memberId: string) => void;

  // Scheduled Session actions
  addScheduledSession: (session: ScheduledPTSession) => void;
  updateScheduledSession: (id: string, updates: Partial<ScheduledPTSession>) => void;
  deleteScheduledSession: (id: string) => void;

  // Attendance Record actions (for non-account members)
  addAttendanceRecord: (record: AttendanceRecord) => void;
  updateAttendanceRecord: (id: string, updates: Partial<AttendanceRecord>) => void;
  linkAttendanceToMember: (attendanceId: string, memberId: string) => void;

  // Notification actions
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt' | 'read'>) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;

  // PTL approval actions
  approvePTL: (memberId: string) => void;
  rejectPTL: (memberId: string) => void;
  revokePTL: (memberId: string) => void;

  // UFPM actions
  setUFPM: (memberId: string) => void;

  // Settings
  setDefaultPTSessionsPerWeek: (count: number) => void;

  // Fitness Assessment actions
  addFitnessAssessment: (memberId: string, assessment: FitnessAssessment) => void;
  toggleFitnessPrivacy: (memberId: string) => void;

  // Workout actions
  addWorkout: (memberId: string, workout: Workout) => void;
  importWorkouts: (memberId: string, workouts: Workout[]) => void;

  // Achievement actions
  awardAchievement: (memberId: string, achievementId: string) => void;

  // Shared Workout actions
  addSharedWorkout: (workout: SharedWorkout) => void;
  deleteSharedWorkout: (id: string) => void;
  rateSharedWorkout: (workoutId: string, memberId: string, rating: 'up' | 'down' | 'none') => void;
  toggleFavoriteWorkout: (workoutId: string, memberId: string) => void;
}

// FitFlight Creator account (owner)
const OWNER_ACCOUNT: Member = {
  id: 'owner_001',
  rank: 'SSgt',
  firstName: 'BENJAMIN',
  lastName: 'BROADHEAD',
  flight: 'Doom',
  squadron: 'Hawks',
  accountType: 'fitflight_creator',
  email: 'benjamin.broadhead.2@us.af.mil',
  exerciseMinutes: 0,
  distanceRun: 0,
  connectedApps: [],
  fitnessAssessments: [],
  workouts: [],
  achievements: [],
  requiredPTSessionsPerWeek: 3,
  isVerified: true,
  ptlPendingApproval: false,
  monthlyPlacements: [],
  trophyCount: 0,
  hasSeenTutorial: false,
};

const INITIAL_MEMBERS = [OWNER_ACCOUNT];

const normalizeOwnerMember = (member: Member): Member => {
  if (member.email.toLowerCase() !== OWNER_ACCOUNT.email.toLowerCase()) {
    return member;
  }

  return {
    ...member,
    rank: OWNER_ACCOUNT.rank,
    firstName: OWNER_ACCOUNT.firstName,
    lastName: OWNER_ACCOUNT.lastName,
    accountType: OWNER_ACCOUNT.accountType,
  };
};

const isSameMember = (left: Member, right: Member) => {
  if (left.email && right.email && left.email.toLowerCase() === right.email.toLowerCase()) {
    return true;
  }

  return (
    left.firstName.trim().toLowerCase() === right.firstName.trim().toLowerCase() &&
    left.lastName.trim().toLowerCase() === right.lastName.trim().toLowerCase()
  );
};

const hasLocalMemberData = (member: Member) => {
  return (
    member.workouts.length > 0 ||
    member.fitnessAssessments.length > 0 ||
    member.achievements.length > 0 ||
    member.exerciseMinutes > 0 ||
    member.distanceRun > 0 ||
    member.connectedApps.length > 0 ||
    member.monthlyPlacements.length > 0 ||
    member.trophyCount > 0 ||
    Boolean(member.linkedAttendanceId) ||
    Boolean(member.profilePicture) ||
    member.accountType !== 'standard' ||
    member.isVerified ||
    member.hasSeenTutorial
  );
};

const mergeMember = (base: Member, existing?: Member): Member => {
  if (!existing) {
    return base;
  }

  return {
    ...base,
    id: existing.id || base.id,
    email: existing.email || base.email,
    accountType: existing.accountType !== 'standard' ? existing.accountType : base.accountType,
    profilePicture: existing.profilePicture ?? base.profilePicture,
    exerciseMinutes: existing.exerciseMinutes,
    distanceRun: existing.distanceRun,
    connectedApps: existing.connectedApps,
    fitnessAssessments: existing.fitnessAssessments,
    workouts: existing.workouts,
    achievements: existing.achievements,
    requiredPTSessionsPerWeek: existing.requiredPTSessionsPerWeek,
    isVerified: existing.isVerified,
    ptlPendingApproval: existing.ptlPendingApproval,
    linkedAttendanceId: existing.linkedAttendanceId,
    monthlyPlacements: existing.monthlyPlacements,
    trophyCount: existing.trophyCount,
    hasSeenTutorial: existing.hasSeenTutorial ?? base.hasSeenTutorial,
  };
};

const getWorkoutDedupKey = (workout: Workout) => {
  if (workout.externalId) {
    return `${workout.source}:${workout.externalId}`;
  }

  return `${workout.source}:${workout.date}:${workout.type}:${workout.duration}:${workout.distance ?? 0}`;
};

const mergeWorkouts = (existing: Workout[], incoming: Workout[]) => {
  const merged = [...existing];
  const keys = new Set(existing.map(getWorkoutDedupKey));

  incoming.forEach((workout) => {
    const key = getWorkoutDedupKey(workout);
    if (keys.has(key)) {
      return;
    }

    keys.add(key);
    merged.push(workout);
  });

  return merged.sort((a, b) => b.date.localeCompare(a.date));
};

const summarizeWorkouts = (workouts: Workout[]) => ({
  exerciseMinutes: workouts.reduce((total, workout) => total + workout.duration, 0),
  distanceRun: Number(
    workouts
      .reduce((total, workout) => total + (workout.distance ?? 0), 0)
      .toFixed(2)
  ),
});

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      hasCheckedAuth: false,
      rememberSession: false,
      accessToken: null,
      refreshToken: null,
      login: (user, options) => set({
        user,
        isAuthenticated: true,
        hasCheckedAuth: true,
        rememberSession: options?.rememberSession ?? false,
      }),
      setSessionTokens: (tokens) => set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      }),
      logout: () => set({
        user: null,
        isAuthenticated: false,
        rememberSession: false,
        accessToken: null,
        refreshToken: null,
      }),
      updateUser: (updates) => set((state) => ({
        user: state.user ? { ...state.user, ...updates } : null
      })),
      setHasCheckedAuth: (checked) => set({ hasCheckedAuth: checked }),
    }),
    {
      name: 'flighttrack-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.rememberSession ? state.user : null,
        isAuthenticated: state.rememberSession ? state.isAuthenticated : false,
        hasCheckedAuth: state.hasCheckedAuth,
        rememberSession: state.rememberSession,
        accessToken: state.rememberSession ? state.accessToken : null,
        refreshToken: state.rememberSession ? state.refreshToken : null,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHasCheckedAuth(true);
        }
      },
    }
  )
);

export const useMemberStore = create<MemberState>()(
  persist(
    (set, get) => ({
      members: INITIAL_MEMBERS,
      ptSessions: [],
      scheduledSessions: [],
      attendanceRecords: [],
      notifications: [],
      sharedWorkouts: [],
      defaultPTSessionsPerWeek: 3,
      ufpmId: null,

      // Member actions
      addMember: (member) => set((state) => ({
        members: [...state.members, normalizeOwnerMember(member)]
      })),

      syncMembersFromRoster: (rosterMembers) => set((state) => {
        const owner = normalizeOwnerMember(
          state.members.find((member) => member.accountType === 'fitflight_creator') ?? OWNER_ACCOUNT
        );
        const remainingLocalMembers = state.members.filter((member) => member.id !== owner.id);
        const matchedLocalIds = new Set<string>();

        const mergedRosterMembers = rosterMembers.map((rosterMember) => {
          const existing = remainingLocalMembers.find((member) => isSameMember(member, rosterMember));
          if (existing) {
            matchedLocalIds.add(existing.id);
          }

          return mergeMember(rosterMember, existing);
        });

        const preservedLocalOnlyMembers = remainingLocalMembers.filter((member) => {
          if (matchedLocalIds.has(member.id)) {
            return false;
          }

          return hasLocalMemberData(member);
        });

        const nextMembers = [owner, ...mergedRosterMembers, ...preservedLocalOnlyMembers.map(normalizeOwnerMember)];
        const validMemberIds = new Set(nextMembers.map((member) => member.id));

        return {
          members: nextMembers,
          ptSessions: state.ptSessions.map((session) => ({
            ...session,
            squadron: session.squadron ?? 'Hawks',
            attendees: session.attendees.filter((memberId) => validMemberIds.has(memberId)),
            createdBy: validMemberIds.has(session.createdBy) ? session.createdBy : owner.id,
          })),
          scheduledSessions: state.scheduledSessions.map((session) => ({
            ...session,
            squadron: session.squadron ?? 'Hawks',
            attendees: session.attendees.filter((memberId) => validMemberIds.has(memberId)),
            createdBy: validMemberIds.has(session.createdBy) ? session.createdBy : owner.id,
          })),
          ufpmId:
            state.ufpmId && validMemberIds.has(state.ufpmId)
              ? state.ufpmId
              : nextMembers.find((member) => member.accountType === 'ufpm')?.id ?? null,
        };
      }),

      removeMember: (id) => set((state) => ({
        members: state.members.filter(m => m.id !== id)
      })),

      updateMember: (id, updates) => set((state) => ({
        members: state.members.map(m => m.id === id ? normalizeOwnerMember({ ...m, ...updates }) : m)
      })),

      getMemberById: (id) => get().members.find(m => m.id === id),

      // PT Session actions
      addPTSession: (session) => set((state) => ({
        ptSessions: [...state.ptSessions, session]
      })),

      syncPTSessions: (sessions) => set(() => ({
        ptSessions: sessions.map((session) => ({
          ...session,
          squadron: session.squadron ?? 'Hawks',
          attendees: [...new Set(session.attendees)],
        })),
      })),

      updatePTSession: (id, updates) => set((state) => ({
        ptSessions: state.ptSessions.map(s => s.id === id ? { ...s, ...updates } : s)
      })),

      deletePTSession: (id) => set((state) => ({
        ptSessions: state.ptSessions.filter(s => s.id !== id)
      })),

      toggleAttendance: (sessionId, memberId) => set((state) => ({
        ptSessions: state.ptSessions.map(s => {
          if (s.id !== sessionId) return s;
          const isPresent = s.attendees.includes(memberId);
          return {
            ...s,
            attendees: isPresent
              ? s.attendees.filter(id => id !== memberId)
              : [...s.attendees, memberId]
          };
        })
      })),

      // Scheduled Session actions
      addScheduledSession: (session) => set((state) => ({
        scheduledSessions: [...state.scheduledSessions, session]
      })),

      updateScheduledSession: (id, updates) => set((state) => ({
        scheduledSessions: state.scheduledSessions.map(s =>
          s.id === id ? { ...s, ...updates } : s
        )
      })),

      deleteScheduledSession: (id) => set((state) => ({
        scheduledSessions: state.scheduledSessions.filter(s => s.id !== id)
      })),

      // Attendance Record actions
      addAttendanceRecord: (record) => set((state) => ({
        attendanceRecords: [...state.attendanceRecords, record]
      })),

      updateAttendanceRecord: (id, updates) => set((state) => ({
        attendanceRecords: state.attendanceRecords.map(r =>
          r.id === id ? { ...r, ...updates } : r
        )
      })),

      linkAttendanceToMember: (attendanceId, memberId) => set((state) => {
        const attendance = state.attendanceRecords.find(r => r.id === attendanceId);
        if (!attendance) return state;

        return {
          members: state.members.map(m =>
            m.id === memberId
              ? { ...m, linkedAttendanceId: attendanceId }
              : m
          ),
        };
      }),

      // Notification actions
      addNotification: (notification) => set((state) => ({
        notifications: [
          {
            ...notification,
            id: Date.now().toString(),
            read: false,
            createdAt: new Date().toISOString(),
          },
          ...state.notifications,
        ]
      })),

      markNotificationRead: (id) => set((state) => ({
        notifications: state.notifications.map(n =>
          n.id === id ? { ...n, read: true } : n
        )
      })),

      clearNotifications: () => set({ notifications: [] }),

      // PTL approval actions
      approvePTL: (memberId) => set((state) => ({
        members: state.members.map(m =>
          m.id === memberId
            ? { ...m, accountType: 'ptl' as AccountType, ptlPendingApproval: false }
            : m
        ),
        notifications: state.notifications.filter(n =>
          !(n.type === 'ptl_request' && n.data?.memberId === memberId)
        ),
      })),

      rejectPTL: (memberId) => set((state) => ({
        members: state.members.map(m =>
          m.id === memberId
            ? { ...m, accountType: 'standard' as AccountType, ptlPendingApproval: false }
            : m
        ),
        notifications: state.notifications.filter(n =>
          !(n.type === 'ptl_request' && n.data?.memberId === memberId)
        ),
      })),

      revokePTL: (memberId) => set((state) => ({
        members: state.members.map(m =>
          m.id === memberId
            ? { ...m, accountType: 'standard' as AccountType }
            : m
        ),
      })),

      // UFPM actions
      setUFPM: (memberId) => set((state) => ({
        ufpmId: memberId,
        members: state.members.map(m => ({
          ...m,
          accountType: m.id === memberId
            ? 'ufpm' as AccountType
            : m.accountType === 'ufpm'
              ? 'ptl' as AccountType
              : m.accountType,
        })),
      })),

      // Settings
      setDefaultPTSessionsPerWeek: (count) => set({ defaultPTSessionsPerWeek: count }),

      // Fitness Assessment actions
      addFitnessAssessment: (memberId, assessment) => set((state) => {
        const requiredSessions = calculateRequiredPTSessions(assessment.overallScore);
        return {
          members: state.members.map(m =>
            m.id === memberId
              ? {
                  ...m,
                  fitnessAssessments: [...m.fitnessAssessments, assessment],
                  requiredPTSessionsPerWeek: requiredSessions,
                }
              : m
          ),
        };
      }),

      toggleFitnessPrivacy: (memberId) => set((state) => ({
        members: state.members.map(m =>
          m.id === memberId
            ? {
                ...m,
                fitnessAssessments: m.fitnessAssessments.map(fa => ({
                  ...fa,
                  isPrivate: !fa.isPrivate,
                })),
              }
            : m
        ),
      })),

      // Workout actions
      addWorkout: (memberId, workout) => set((state) => ({
        members: state.members.map(m =>
          m.id === memberId
            ? {
                ...m,
                workouts: [...m.workouts, workout],
                exerciseMinutes: m.exerciseMinutes + workout.duration,
                distanceRun: m.distanceRun + (workout.distance ?? 0),
              }
            : m
        ),
      })),

      importWorkouts: (memberId, workouts) => set((state) => ({
        members: state.members.map((member) => {
          if (member.id !== memberId) {
            return member;
          }

          const mergedWorkouts = mergeWorkouts(member.workouts, workouts);
          const summary = summarizeWorkouts(mergedWorkouts);

          return {
            ...member,
            workouts: mergedWorkouts,
            exerciseMinutes: summary.exerciseMinutes,
            distanceRun: summary.distanceRun,
          };
        }),
      })),

      // Achievement actions
      awardAchievement: (memberId, achievementId) => set((state) => ({
        members: state.members.map(m =>
          m.id === memberId && !m.achievements.includes(achievementId)
            ? { ...m, achievements: [...m.achievements, achievementId] }
            : m
        ),
      })),

      // Shared Workout actions
      addSharedWorkout: (workout) => set((state) => ({
        sharedWorkouts: [workout, ...state.sharedWorkouts],
      })),

      deleteSharedWorkout: (id) => set((state) => ({
        sharedWorkouts: state.sharedWorkouts.filter(w => w.id !== id),
      })),

      rateSharedWorkout: (workoutId, memberId, rating) => set((state) => ({
        sharedWorkouts: state.sharedWorkouts.map(w => {
          if (w.id !== workoutId) return w;
          // Remove from both arrays first
          const newThumbsUp = w.thumbsUp.filter(id => id !== memberId);
          const newThumbsDown = w.thumbsDown.filter(id => id !== memberId);
          // Add to appropriate array based on rating
          if (rating === 'up') {
            newThumbsUp.push(memberId);
          } else if (rating === 'down') {
            newThumbsDown.push(memberId);
          }
          return { ...w, thumbsUp: newThumbsUp, thumbsDown: newThumbsDown };
        }),
      })),

      toggleFavoriteWorkout: (workoutId, memberId) => set((state) => ({
        sharedWorkouts: state.sharedWorkouts.map(w => {
          if (w.id !== workoutId) return w;
          const isFavorited = w.favoritedBy.includes(memberId);
          return {
            ...w,
            favoritedBy: isFavorited
              ? w.favoritedBy.filter(id => id !== memberId)
              : [...w.favoritedBy, memberId],
          };
        }),
      })),
    }),
    {
      name: 'flighttrack-members',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// Helper to check if user can manage PTL status
export const canManagePTL = (accountType: AccountType): boolean => {
  return accountType === 'fitflight_creator' || accountType === 'ufpm';
};

// Helper to check if user can edit PT attendance
export const canEditAttendance = (accountType: AccountType): boolean => {
  return accountType === 'fitflight_creator' || accountType === 'ufpm' || accountType === 'ptl';
};

// Helper to check if user has admin access
export const isAdmin = (accountType: AccountType): boolean => {
  return accountType === 'fitflight_creator' || accountType === 'ufpm';
};
