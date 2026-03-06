import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Types
export type Flight = 'Avatar' | 'Bomber' | 'Cryptid' | 'Doom' | 'Ewok' | 'Foxhound' | 'ADF' | 'DET';
export type AccountType = 'fitflight_creator' | 'ufpm' | 'ptl' | 'standard';
export type Squadron = '392 IS';
export type WorkoutType = 'Running' | 'Walking' | 'Cycling' | 'Strength' | 'HIIT' | 'Swimming' | 'Sports' | 'Cardio' | 'Flexibility' | 'Other';
export type IntegrationService = 'apple_health' | 'strava' | 'garmin';

export const SQUADRONS: Squadron[] = ['392 IS'];
export const WORKOUT_TYPES: WorkoutType[] = ['Running', 'Walking', 'Cycling', 'Strength', 'HIIT', 'Swimming', 'Sports', 'Cardio', 'Flexibility', 'Other'];

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
  date: string;
  type: WorkoutType;
  duration: number; // minutes
  distance?: number; // miles
  calories?: number;
  source: 'manual' | 'screenshot' | 'apple_health' | 'strava' | 'garmin';
  screenshotUri: string; // Required - must have screenshot
  isPrivate: boolean;
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
  caloriesBurned: number;
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
}

export interface PTSession {
  id: string;
  date: string;
  flight: Flight;
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
}

// Helper to get display name
export const getDisplayName = (user: { rank: string; firstName: string; lastName: string }) => {
  return `${user.rank} ${user.firstName} ${user.lastName}`;
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
  { id: 'excellent_fa', name: 'Excellent Rating', description: 'Score 90+ on a Fitness Assessment', icon: 'shield-check', category: 'fitness', isHard: false },
  { id: 'perfect_fa', name: 'Perfect Score', description: 'Score 100 on a Fitness Assessment', icon: 'sparkles', category: 'fitness', isHard: true },
  { id: 'improvement', name: 'Self Improvement', description: 'Improve your FA score by 10+ points', icon: 'trending-up', category: 'fitness', isHard: false },

  // Additional achievements
  { id: '25_workouts', name: 'Quarter Century', description: 'Log 25 workouts', icon: 'target', category: 'milestone', isHard: false },
  { id: '200_workouts', name: 'Fitness Legend', description: 'Log 200 workouts', icon: 'gem', category: 'milestone', isHard: true },
  { id: '1000_miles', name: 'Ultra Runner', description: 'Run 1000 total miles', icon: 'rocket', category: 'milestone', isHard: true },
  { id: '10000_calories', name: 'Calorie Crusher', description: 'Burn 10,000 calories', icon: 'flame', category: 'milestone', isHard: false },
  { id: '50000_calories', name: 'Inferno', description: 'Burn 50,000 calories', icon: 'sun', category: 'milestone', isHard: true },
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
  login: (user: User) => void;
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
  removeMember: (id: string) => void;
  updateMember: (id: string, updates: Partial<Member>) => void;
  getMemberById: (id: string) => Member | undefined;

  // PT Session actions
  addPTSession: (session: PTSession) => void;
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
  firstName: 'Benjamin',
  lastName: 'Broadhead',
  flight: 'Doom',
  squadron: '392 IS',
  accountType: 'fitflight_creator',
  email: 'benjamin.broadhead.2@us.af.mil',
  exerciseMinutes: 0,
  distanceRun: 0,
  caloriesBurned: 0,
  connectedApps: [],
  fitnessAssessments: [],
  workouts: [],
  achievements: [],
  requiredPTSessionsPerWeek: 3,
  isVerified: true,
  ptlPendingApproval: false,
  monthlyPlacements: [],
  trophyCount: 0,
};

// Generate mock members with new structure
const generateMockMembers = (): Member[] => {
  const mockData = [
    { rank: 'SSgt', firstName: 'Michael', lastName: 'Johnson', flight: 'Avatar' as Flight, accountType: 'ptl' as AccountType },
    { rank: 'A1C', firstName: 'Carlos', lastName: 'Martinez', flight: 'Avatar' as Flight, accountType: 'standard' as AccountType },
    { rank: 'SrA', firstName: 'James', lastName: 'Williams', flight: 'Bomber' as Flight, accountType: 'standard' as AccountType },
    { rank: 'TSgt', firstName: 'Robert', lastName: 'Brown', flight: 'Bomber' as Flight, accountType: 'ptl' as AccountType },
    { rank: 'A1C', firstName: 'David', lastName: 'Davis', flight: 'Cryptid' as Flight, accountType: 'standard' as AccountType },
    { rank: 'SrA', firstName: 'Maria', lastName: 'Garcia', flight: 'Cryptid' as Flight, accountType: 'standard' as AccountType },
    { rank: 'MSgt', firstName: 'William', lastName: 'Anderson', flight: 'Doom' as Flight, accountType: 'ptl' as AccountType },
    { rank: 'A1C', firstName: 'Christopher', lastName: 'Taylor', flight: 'Doom' as Flight, accountType: 'standard' as AccountType },
    { rank: 'SrA', firstName: 'Daniel', lastName: 'Thomas', flight: 'Ewok' as Flight, accountType: 'standard' as AccountType },
    { rank: 'SSgt', firstName: 'Matthew', lastName: 'Jackson', flight: 'Ewok' as Flight, accountType: 'ptl' as AccountType },
    { rank: 'A1C', firstName: 'Andrew', lastName: 'White', flight: 'Foxhound' as Flight, accountType: 'standard' as AccountType },
    { rank: 'TSgt', firstName: 'Joshua', lastName: 'Harris', flight: 'Foxhound' as Flight, accountType: 'ptl' as AccountType },
    { rank: 'SrA', firstName: 'Ryan', lastName: 'Clark', flight: 'ADF' as Flight, accountType: 'standard' as AccountType },
    { rank: 'A1C', firstName: 'Brandon', lastName: 'Lewis', flight: 'ADF' as Flight, accountType: 'standard' as AccountType },
    { rank: 'SSgt', firstName: 'Kevin', lastName: 'Robinson', flight: 'DET' as Flight, accountType: 'ptl' as AccountType },
    { rank: 'SrA', firstName: 'Justin', lastName: 'Walker', flight: 'DET' as Flight, accountType: 'standard' as AccountType },
  ];

  return mockData.map((data, index) => ({
    id: (index + 1).toString(),
    ...data,
    squadron: '392 IS' as Squadron,
    email: `${data.lastName.toLowerCase()}@us.af.mil`,
    exerciseMinutes: Math.floor(Math.random() * 300) + 200,
    distanceRun: Math.floor(Math.random() * 40) + 10,
    caloriesBurned: Math.floor(Math.random() * 3000) + 2000,
    connectedApps: [] as string[],
    fitnessAssessments: [] as FitnessAssessment[],
    workouts: [] as Workout[],
    achievements: [] as string[],
    requiredPTSessionsPerWeek: 3,
    isVerified: true,
    ptlPendingApproval: false,
    monthlyPlacements: [] as MonthlyPlacement[],
    trophyCount: 0,
  }));
};

// Generate PT sessions
const generateMockSessions = (members: Member[]): PTSession[] => {
  const sessions: PTSession[] = [];
  const today = new Date();
  const flights: Flight[] = ['Avatar', 'Bomber', 'Cryptid', 'Doom', 'Ewok', 'Foxhound', 'ADF', 'DET'];

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - today.getDay() + i + 1);

    if (i === 0 || i === 2 || i === 4) {
      flights.forEach(flight => {
        const flightMembers = members.filter(m => m.flight === flight);
        const attendees = flightMembers
          .filter(() => Math.random() > 0.2)
          .map(m => m.id);

        const ptl = flightMembers.find(m => m.accountType === 'ptl');

        sessions.push({
          id: `session-${flight}-${date.toISOString().split('T')[0]}`,
          date: date.toISOString().split('T')[0],
          flight,
          attendees,
          createdBy: ptl?.id || '1',
        });
      });
    }
  }

  return sessions;
};

const INITIAL_MEMBERS = [OWNER_ACCOUNT, ...generateMockMembers()];

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      hasCheckedAuth: false,
      login: (user) => set({ user, isAuthenticated: true, hasCheckedAuth: true }),
      logout: () => set({ user: null, isAuthenticated: false }),
      updateUser: (updates) => set((state) => ({
        user: state.user ? { ...state.user, ...updates } : null
      })),
      setHasCheckedAuth: (checked) => set({ hasCheckedAuth: checked }),
    }),
    {
      name: 'flighttrack-auth',
      storage: createJSONStorage(() => AsyncStorage),
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
      ptSessions: generateMockSessions(INITIAL_MEMBERS),
      scheduledSessions: [],
      attendanceRecords: [],
      notifications: [],
      sharedWorkouts: [],
      defaultPTSessionsPerWeek: 3,
      ufpmId: null,

      // Member actions
      addMember: (member) => set((state) => ({
        members: [...state.members, member]
      })),

      removeMember: (id) => set((state) => ({
        members: state.members.filter(m => m.id !== id)
      })),

      updateMember: (id, updates) => set((state) => ({
        members: state.members.map(m => m.id === id ? { ...m, ...updates } : m)
      })),

      getMemberById: (id) => get().members.find(m => m.id === id),

      // PT Session actions
      addPTSession: (session) => set((state) => ({
        ptSessions: [...state.ptSessions, session]
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
              ? 'standard' as AccountType
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
                caloriesBurned: m.caloriesBurned + (workout.calories ?? 0),
              }
            : m
        ),
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
