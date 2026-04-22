import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View, Text, Pressable, RefreshControl, ScrollView, TextInput, Modal, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Plus, Search, X, ThumbsUp, ThumbsDown, Star, Trash2, Clock, Flame, ChevronDown, ChevronUp, Check, ListOrdered, Filter, Pencil, CalendarPlus } from 'lucide-react-native';
import Animated, { FadeIn, FadeInDown, FadeInRight, SlideInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import SmartSlider from "../../components/SmartSlider";
import { useMemberStore, useAuthStore, getShortDisplayName, type WorkoutType, type SharedWorkout, type Squadron, WORKOUT_TYPES, isAdmin, canManagePTPrograms } from '@/lib/store';
import { cn } from '@/lib/cn';
import { createSharedWorkout, deleteSharedWorkoutFromSupabase, fetchSharedWorkouts, updateSharedWorkout } from '@/lib/supabaseData';
import { TutorialTarget } from '@/contexts/TutorialTourContext';
import { useTabSwipe } from '@/contexts/TabSwipeContext';
import { PLAYBOOK_WORKOUT_CREATOR_ID, PLAYBOOK_WORKOUT_SOURCE_LABEL, PLAYBOOK_WORKOUTS } from '@/lib/playbookWorkouts';
import { parseScheduledWorkoutLink } from '@/lib/scheduledWorkoutLinks';
import { getThemeBodyStyle, getThemeButtonStyle, getThemeButtonTextStyle, getThemeControlStyle, getThemeHeadingStyle, getThemeIconWellStyle, getThemeInputContainerStyle, getThemeLabelStyle, useAppTheme, type AppThemePalette } from '@/lib/theme';
import { PageContainer } from '@/components/PageContainer';
import { ThemeBackdrop } from '@/components/ThemeBackdrop';
import { ThemeChrome } from '@/components/ThemeChrome';
import { TopStatusBar } from '@/components/TopStatusBar';
import { createOfflineActionId, requestRegisteredSync, runOrQueueOfflineMutation } from '@/lib/appSync';

type FilterType = 'all' | 'favorites' | 'mine' | 'playbook';
type SortType = 'newest' | 'popular' | 'duration';
const PLAYBOOK_FAVORITES_KEY_PREFIX = 'fitflight-playbook-favorites:';

function slugifyMemberKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getLegacyWorkoutMemberId(member: { rank: string; firstName: string; lastName: string; flight: string }) {
  return `roster-${slugifyMemberKey(`${member.rank}-${member.lastName}-${member.firstName}-${member.flight}`)}`;
}

function getWorkoutVoteScore(workout: SharedWorkout) {
  return workout.thumbsUp.length;
}

function getWorkoutNetScore(workout: SharedWorkout) {
  return workout.thumbsUp.length - workout.thumbsDown.length;
}

function getSharedWorkoutErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unable to reach shared workouts right now.';
  if (message.includes('public.shared_workouts') || message.includes('shared_workouts') || message.includes('schema cache')) {
    return 'Shared workouts are not set up in Supabase yet. Run the SQL in supabase/sql/shared_workouts.sql, then try again.';
  }
  return message;
}

function WorkoutCard({
  workout,
  currentUserId,
  onRate,
  onToggleFavorite,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
  creatorName,
  editorName,
  allowFeedback = true,
  allowFavorite = true,
  usageCount,
  onScheduleSession,
  isExpandedOverride,
  onToggleExpanded,
  theme,
}: {
  workout: SharedWorkout;
  currentUserId: string;
  onRate: (rating: 'up' | 'down' | 'none') => void;
  onToggleFavorite: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
  creatorName: string;
  editorName?: string | null;
  allowFeedback?: boolean;
  allowFavorite?: boolean;
  usageCount: number;
  onScheduleSession: () => void;
  isExpandedOverride?: boolean;
  onToggleExpanded?: (expanded: boolean) => void;
  theme: AppThemePalette;
}) {
  const [expanded, setExpanded] = useState(false);
  const isExpanded = isExpandedOverride ?? expanded;

  const userRating = workout.thumbsUp.includes(currentUserId)
    ? 'up'
    : workout.thumbsDown.includes(currentUserId)
    ? 'down'
    : 'none';

  const isFavorited = workout.favoritedBy.includes(currentUserId);

  const handleThumbsUp = () => {
    if (!allowFeedback) {
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRate(userRating === 'up' ? 'none' : 'up');
  };

  const handleThumbsDown = () => {
    if (!allowFeedback) {
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRate(userRating === 'down' ? 'none' : 'down');
  };

  const handleFavorite = () => {
    if (!allowFeedback) {
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleFavorite();
  };

  const getIntensityColor = (intensity: number) => {
    if (intensity <= 3) return '#22C55E';
    if (intensity <= 6) return '#F59E0B';
    return '#EF4444';
  };

  const getIntensityLabel = (intensity: number) => {
    if (intensity <= 3) return 'Easy';
    if (intensity <= 6) return 'Moderate';
    if (intensity <= 8) return 'Hard';
    return 'Extreme';
  };

  return (
    <Animated.View entering={FadeInRight.springify()} className="mb-3">
      <ThemeChrome theme={theme} variant={workout.source === 'playbook' ? 'feature' : 'default'}>
      <Pressable
        onPress={() => {
          const nextExpanded = !isExpanded;
          setExpanded(nextExpanded);
          onToggleExpanded?.(nextExpanded);
        }}
        className="p-4"
      >
        {/* Header */}
        <View className="flex-row items-start justify-between">
            <View className="flex-1">
              <Text style={getThemeHeadingStyle(theme, 18)}>{workout.name}</Text>
              <Text style={getThemeBodyStyle(theme, 13)}>by {creatorName}</Text>
              {editorName && workout.editedBy !== workout.createdBy ? (
                <Text style={getThemeBodyStyle(theme, 12, theme.textSecondary)} className="mt-1 italic">edited by {editorName}</Text>
              ) : null}
            </View>
          <View className="items-end">
            <View className="flex-row items-center justify-end">
              {allowFavorite ? (
                <Pressable
                  onPress={handleFavorite}
                  className="w-9 h-9 items-center justify-center"
                >
                  <Star
                    size={20}
                    color={isFavorited ? theme.accentAlt : theme.textMuted}
                    fill={isFavorited ? '#FFD700' : 'transparent'}
                  />
                </Pressable>
              ) : null}
              {canEdit && (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onEdit();
                  }}
                  className="w-9 h-9 items-center justify-center"
                >
                  <Pencil size={17} color={theme.accent} />
                </Pressable>
              )}
              {canDelete && (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    onDelete();
                  }}
                  className="w-9 h-9 items-center justify-center"
                >
                  <Trash2 size={18} color="#EF4444" />
                </Pressable>
              )}
            </View>
            <Text style={getThemeBodyStyle(theme, 11, theme.textMuted)} className="mt-1">Used {usageCount}x</Text>
          </View>
        </View>

        {/* Tags */}
        <View className="flex-row flex-wrap mt-2 gap-2">
          {workout.source === 'playbook' ? (
            <View className="px-2 py-1 rounded-full" style={{ ...getThemeControlStyle(theme, true), borderColor: theme.accentAlt }}>
              <Text style={getThemeBodyStyle(theme, 12, theme.accentAlt)}>Playbook</Text>
            </View>
          ) : null}
          <View className="px-2 py-1 rounded-full" style={getThemeControlStyle(theme, true)}>
            <Text style={getThemeBodyStyle(theme, 12, theme.accent)}>{workout.type}</Text>
          </View>
          <View className="flex-row items-center px-2 py-1 rounded-full" style={getThemeControlStyle(theme)}>
            <Clock size={12} color={theme.textSecondary} />
            <Text style={getThemeBodyStyle(theme, 12)} className="ml-1">{workout.duration} min</Text>
          </View>
          <View className="flex-row items-center px-2 py-1 rounded-full" style={{ backgroundColor: `${getIntensityColor(workout.intensity)}20` }}>
            <Flame size={12} color={getIntensityColor(workout.intensity)} />
            <Text className="text-xs ml-1" style={{ color: getIntensityColor(workout.intensity) }}>
              {getIntensityLabel(workout.intensity)}
            </Text>
          </View>
          {workout.isMultiStep && (
            <View className="flex-row items-center px-2 py-1 rounded-full" style={{ ...getThemeControlStyle(theme, true), borderColor: theme.accentAlt }}>
              <ListOrdered size={12} color={theme.accentAlt} />
              <Text style={getThemeBodyStyle(theme, 12, theme.accentAlt)} className="ml-1">{workout.steps.length} steps</Text>
            </View>
          )}
        </View>

        {/* Rating Section */}
        <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-white/10">
          {allowFeedback ? (
            <View className="flex-row items-center">
              <Pressable
                onPress={handleThumbsUp}
                className={cn(
                  "flex-row items-center px-3 py-1.5 rounded-full mr-2",
                  userRating === 'up' ? "bg-af-success/30" : "bg-white/10"
                )}
              >
                <ThumbsUp
                  size={16}
                  color={userRating === 'up' ? '#22C55E' : theme.textMuted}
                  fill={userRating === 'up' ? '#22C55E' : 'transparent'}
                />
                <Text className={cn(
                  "text-sm ml-1 font-medium",
                  userRating === 'up' ? "text-af-success" : "text-af-silver"
                )}>
                  {workout.thumbsUp.length}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleThumbsDown}
                className={cn(
                  "flex-row items-center px-3 py-1.5 rounded-full",
                  userRating === 'down' ? "bg-af-danger/30" : "bg-white/10"
                )}
              >
                <ThumbsDown
                  size={16}
                  color={userRating === 'down' ? '#EF4444' : theme.textMuted}
                  fill={userRating === 'down' ? '#EF4444' : 'transparent'}
                />
                <Text className={cn(
                  "text-sm ml-1 font-medium",
                  userRating === 'down' ? "text-af-danger" : "text-af-silver"
                )}>
                  {workout.thumbsDown.length}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Text style={getThemeBodyStyle(theme, 14)}>Reference workout</Text>
          )}
          {isExpanded ? (
            <ChevronUp size={20} color={theme.textSecondary} />
          ) : (
            <ChevronDown size={20} color={theme.textSecondary} />
          )}
        </View>
      </Pressable>

      {/* Expanded Content */}
      {isExpanded && (
        <View className="px-4 pb-4 border-t border-white/10">
          {workout.description && (
            <View className="mt-3">
              <Text style={getThemeLabelStyle(theme)} className="mb-1">Description</Text>
              <Text style={getThemeBodyStyle(theme, 14, theme.textPrimary)}>{workout.description}</Text>
            </View>
          )}

          {workout.isMultiStep && workout.steps.length > 0 && (
            <View className="mt-3">
              <Text style={getThemeLabelStyle(theme)} className="mb-2">Steps</Text>
              {workout.steps.map((step, index) => (
                <View key={index} className="flex-row mb-2">
                  <View className="w-6 h-6 bg-af-accent/30 rounded-full items-center justify-center mr-3">
                    <Text className="text-af-accent text-xs font-bold">{index + 1}</Text>
                  </View>
                    <Text style={getThemeBodyStyle(theme, 14, theme.textPrimary)} className="flex-1">{step}</Text>
                  </View>
                ))}
              </View>
          )}

          {workout.detailSections?.length ? (
            <View className="mt-3">
              {workout.detailSections.map((section) => (
                <View key={section.title} className="mb-3">
                  <Text style={getThemeLabelStyle(theme)} className="mb-2">{section.title}</Text>
                  {section.items.map((item, index) => (
                    <View key={`${section.title}-${index}`} className="flex-row mb-2">
                      <View className="w-1.5 h-1.5 rounded-full bg-af-accent mt-2 mr-2" />
                      <Text style={getThemeBodyStyle(theme, 14, theme.textPrimary)} className="flex-1 leading-5">{item}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ) : null}

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onScheduleSession();
            }}
            className="mt-4 flex-row items-center justify-center px-4 py-3"
            style={getThemeButtonStyle(theme, 'secondary')}
          >
            <CalendarPlus size={18} color={theme.accent} />
            <Text className="ml-2" style={getThemeButtonTextStyle(theme, 'secondary')}>Schedule a PT session using this workout</Text>
          </Pressable>
        </View>
      )}
      </ThemeChrome>
    </Animated.View>
  );
}

export default function WorkoutsScreen() {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const { setSwipeEnabled } = useTabSwipe();
  const router = useRouter();
  const params = useLocalSearchParams<{ openWorkoutId?: string }>();
  const user = useAuthStore(s => s.user);
  const accessToken = useAuthStore(s => s.accessToken);
  const members = useMemberStore(s => s.members);
  const sharedWorkouts = useMemberStore(s => s.sharedWorkouts);
  const scheduledSessions = useMemberStore(s => s.scheduledSessions);
  const syncSharedWorkouts = useMemberStore(s => s.syncSharedWorkouts);
  const addSharedWorkout = useMemberStore(s => s.addSharedWorkout);
  const deleteSharedWorkout = useMemberStore(s => s.deleteSharedWorkout);
  const rateSharedWorkout = useMemberStore(s => s.rateSharedWorkout);
  const toggleFavoriteWorkout = useMemberStore(s => s.toggleFavoriteWorkout);
  const previewAchievementCelebration = useMemberStore(s => s.previewAchievementCelebration);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortType, setSortType] = useState<SortType>('newest');
  const [selectedWorkoutType, setSelectedWorkoutType] = useState<WorkoutType | 'all'>('all');
  const [playbookFavoriteIds, setPlaybookFavoriteIds] = useState<string[]>([]);
  const [expandedWorkoutId, setExpandedWorkoutId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const filterTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const filterDragActivatedRef = useRef(false);

  // Create modal state
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<WorkoutType>('Strength');
  const [newDuration, setNewDuration] = useState('30');
  const [newIntensity, setNewIntensity] = useState(5);
  const [newDescription, setNewDescription] = useState('');
  const [isMultiStep, setIsMultiStep] = useState(false);
  const [steps, setSteps] = useState<string[]>(['']);
  const [sharedWorkoutError, setSharedWorkoutError] = useState<string | null>(null);

  const currentUserId = user?.id ?? '';
  const userAccountType = user?.accountType ?? 'standard';
  const userSquadron: Squadron = (user?.squadron as Squadron) ?? 'Hawks';
  const canManageSharedWorkouts = canManagePTPrograms(userAccountType);
  const playbookFavoritesStorageKey = `${PLAYBOOK_FAVORITES_KEY_PREFIX}${currentUserId || 'guest'}`;

  useEffect(() => {
    if (!currentUserId) {
      setPlaybookFavoriteIds([]);
      return;
    }

    void AsyncStorage.getItem(playbookFavoritesStorageKey)
      .then((stored) => {
        setPlaybookFavoriteIds(stored ? JSON.parse(stored) : []);
      })
      .catch(() => {
        setPlaybookFavoriteIds([]);
      });
  }, [currentUserId, playbookFavoritesStorageKey]);

  useEffect(() => {
    const openWorkoutId = Array.isArray(params.openWorkoutId) ? params.openWorkoutId[0] : params.openWorkoutId;
    if (openWorkoutId) {
      setExpandedWorkoutId(openWorkoutId);
    }
  }, [params.openWorkoutId]);

  useEffect(() => {
    if (!accessToken || !userSquadron) {
      return;
    }

    let isCancelled = false;

    const syncWorkouts = async () => {
      try {
        const workouts = await fetchSharedWorkouts(accessToken, userSquadron);
        if (!isCancelled) {
          setSharedWorkoutError(null);
          syncSharedWorkouts(workouts);
        }
      } catch (error) {
        if (!isCancelled) {
          setSharedWorkoutError(getSharedWorkoutErrorMessage(error));
        }
        console.error('Unable to sync shared workouts from Supabase.', error);
      }
    };

    void syncWorkouts();
    const intervalId = setInterval(() => {
      void syncWorkouts();
    }, 15000);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, [accessToken, syncSharedWorkouts, userSquadron]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await requestRegisteredSync('global');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleFilterTouchStart = useCallback((event: any) => {
    filterTouchStartRef.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    };
    filterDragActivatedRef.current = false;
    setSwipeEnabled(false);
  }, [setSwipeEnabled]);

  const handleFilterTouchMove = useCallback((event: any) => {
    const start = filterTouchStartRef.current;
    if (!start || filterDragActivatedRef.current) {
      return;
    }

    const dx = Math.abs(event.nativeEvent.pageX - start.x);
    const dy = Math.abs(event.nativeEvent.pageY - start.y);
    if (dx > 6 || dy > 6) {
      filterDragActivatedRef.current = true;
    }
  }, []);

  const releaseFilterSwipeLock = useCallback(() => {
    filterTouchStartRef.current = null;
    filterDragActivatedRef.current = false;
    setSwipeEnabled(true);
  }, [setSwipeEnabled]);

  const getMemberName = (memberId: string, workout?: SharedWorkout) => {
    if (memberId === PLAYBOOK_WORKOUT_CREATOR_ID || workout?.source === 'playbook') {
      return PLAYBOOK_WORKOUT_SOURCE_LABEL;
    }
    const member = members.find(
      (candidate) => candidate.id === memberId || getLegacyWorkoutMemberId(candidate) === memberId
    );
    return member ? getShortDisplayName(member) : 'Unknown';
  };

  // Filter and sort workouts
  const workoutUsageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    scheduledSessions.forEach((session) => {
      const linkedWorkout = parseScheduledWorkoutLink(session.description);
      if (linkedWorkout) {
        counts.set(linkedWorkout.workoutId, (counts.get(linkedWorkout.workoutId) ?? 0) + 1);
      }
    });
    return counts;
  }, [scheduledSessions]);

  const filteredWorkouts = useMemo(() => {
    const workoutsWithFavorites = [
      ...PLAYBOOK_WORKOUTS.map((workout) => ({
        ...workout,
        favoritedBy: playbookFavoriteIds.includes(workout.id) ? [currentUserId] : [],
      })),
      ...sharedWorkouts.filter(w => w.squadron === userSquadron),
    ];
    let filtered = workoutsWithFavorites;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(w =>
        w.name.toLowerCase().includes(query) ||
        w.description.toLowerCase().includes(query) ||
        w.type.toLowerCase().includes(query) ||
        w.detailSections?.some((section) =>
          section.title.toLowerCase().includes(query) ||
          section.items.some((item) => item.toLowerCase().includes(query))
        ) ||
        w.searchTerms?.some((term) => term.toLowerCase().includes(query))
      );
    }

    // Type filter
    if (selectedWorkoutType !== 'all') {
      filtered = filtered.filter(w => w.type === selectedWorkoutType);
    }

    // Filter type
    if (filterType === 'favorites') {
      filtered = filtered.filter(w => w.favoritedBy.includes(currentUserId));
    } else if (filterType === 'mine') {
      filtered = filtered.filter(w => w.createdBy === currentUserId && w.source !== 'playbook');
    } else if (filterType === 'playbook') {
      filtered = filtered.filter((workout) => workout.source === 'playbook');
    }

    filtered.sort((a, b) => {
      const voteDifference = getWorkoutVoteScore(b) - getWorkoutVoteScore(a);
      if (voteDifference !== 0) {
        return voteDifference;
      }

      const netDifference = getWorkoutNetScore(b) - getWorkoutNetScore(a);
      if (netDifference !== 0) {
        return netDifference;
      }

      if (sortType === 'duration') {
        const durationDifference = a.duration - b.duration;
        if (durationDifference !== 0) {
          return durationDifference;
        }
      }

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return filtered;
  }, [sharedWorkouts, userSquadron, searchQuery, selectedWorkoutType, filterType, sortType, currentUserId, playbookFavoriteIds]);

  const resetCreateForm = () => {
    setEditingWorkoutId(null);
    setNewName('');
    setNewType('Strength');
    setNewDuration('30');
    setNewIntensity(5);
    setNewDescription('');
    setIsMultiStep(false);
    setSteps(['']);
  };

  const openCreateModal = () => {
    resetCreateForm();
    setShowCreateModal(true);
  };

  const openEditModal = (workout: SharedWorkout) => {
    setEditingWorkoutId(workout.id);
    setNewName(workout.name);
    setNewType(workout.type);
    setNewDuration(`${workout.duration}`);
    setNewIntensity(workout.intensity);
    setNewDescription(workout.description);
    setIsMultiStep(workout.isMultiStep);
    setSteps(workout.isMultiStep && workout.steps.length > 0 ? [...workout.steps] : ['']);
    setShowCreateModal(true);
  };

  const handleAddStep = () => {
    setSteps([...steps, '']);
  };

  const handleUpdateStep = (index: number, value: string) => {
    const newSteps = [...steps];
    newSteps[index] = value;
    setSteps(newSteps);
  };

  const handleRemoveStep = (index: number) => {
    if (steps.length > 1) {
      setSteps(steps.filter((_, i) => i !== index));
    }
  };

  const handleSubmitWorkout = () => {
    const run = async () => {
      if (!newName.trim() || !user) {
        return;
      }

      try {
        const duration = parseInt(newDuration) || 30;
        const trimmedSteps = isMultiStep ? steps.filter(s => s.trim()) : [];

        if (editingWorkoutId) {
          const existingWorkout = sharedWorkouts.find((workout) => workout.id === editingWorkoutId);
          if (!existingWorkout) {
            throw new Error('Unable to find that workout to edit.');
          }

          const nextWorkout = {
            ...existingWorkout,
            name: newName.trim(),
            type: newType,
            duration,
            intensity: newIntensity,
            description: newDescription.trim(),
            isMultiStep,
            steps: trimmedSteps,
            editedBy: user.id,
            editedAt: new Date().toISOString(),
          };

          syncSharedWorkouts(
            sharedWorkouts.map((candidate) => candidate.id === nextWorkout.id ? nextWorkout : candidate)
          );

          const mutation = await runOrQueueOfflineMutation({
            action: {
              id: createOfflineActionId('shared-workout-update'),
              type: 'update_shared_workout',
              createdAt: new Date().toISOString(),
              payload: { workout: nextWorkout },
            },
            execute: () => updateSharedWorkout(nextWorkout, accessToken ?? undefined),
            onQueued: () => {
              Alert.alert('Saved offline', 'Your workout changes were saved locally and will sync automatically when you reconnect.');
            },
          });

          if (mutation.result) {
            syncSharedWorkouts(
              sharedWorkouts.map((candidate) => candidate.id === mutation.result!.id ? mutation.result! : candidate)
            );
          }
        } else {
          const newWorkout: SharedWorkout = {
            id: createOfflineActionId('shared-workout'),
            name: newName.trim(),
            type: newType,
            duration,
            intensity: newIntensity,
            description: newDescription.trim(),
            isMultiStep,
            steps: trimmedSteps,
            createdBy: user.id,
            createdAt: new Date().toISOString(),
            squadron: userSquadron,
            thumbsUp: [],
            thumbsDown: [],
            favoritedBy: [],
          };

          const alreadyHadCreatorTrophy = members.find((member) => member.id === user.id)?.achievements.includes('shared_workout_creator') ?? false;
          addSharedWorkout(newWorkout);
          const mutation = await runOrQueueOfflineMutation({
            action: {
              id: createOfflineActionId('shared-workout-create'),
              type: 'create_shared_workout',
              createdAt: new Date().toISOString(),
              payload: { workout: newWorkout },
            },
            execute: () => createSharedWorkout(newWorkout, accessToken ?? undefined),
            onQueued: () => {
              Alert.alert('Saved offline', 'Your workout was saved locally and will sync automatically when you reconnect.');
            },
          });
          if (mutation.result) {
            syncSharedWorkouts(
              [...sharedWorkouts.filter((candidate) => candidate.id !== newWorkout.id), mutation.result].sort(
                (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
              )
            );
          }
          if (!alreadyHadCreatorTrophy) {
            previewAchievementCelebration('shared_workout_creator');
          }
        }
        setSharedWorkoutError(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowCreateModal(false);
        resetCreateForm();
      } catch (error) {
        const message = getSharedWorkoutErrorMessage(error);
        setSharedWorkoutError(message);
        Alert.alert(editingWorkoutId ? 'Unable to update workout' : 'Unable to submit workout', message);
      }
    };

    void run();
  };

  const handleDeleteWorkout = (workoutId: string) => {
    const run = async () => {
      try {
        deleteSharedWorkout(workoutId);
        await runOrQueueOfflineMutation({
          action: {
            id: createOfflineActionId('shared-workout-delete'),
            type: 'delete_shared_workout',
            createdAt: new Date().toISOString(),
            payload: { workoutId },
          },
          execute: () => deleteSharedWorkoutFromSupabase(workoutId, accessToken ?? undefined),
          onQueued: () => {
            Alert.alert('Saved offline', 'This workout deletion will sync automatically when you reconnect.');
          },
        });
        setSharedWorkoutError(null);
      } catch (error) {
        const message = getSharedWorkoutErrorMessage(error);
        setSharedWorkoutError(message);
        Alert.alert('Unable to delete workout', message);
      }
    };

    void run();
  };

  const handleRateWorkout = (workout: SharedWorkout, rating: 'up' | 'down' | 'none') => {
    const run = async () => {
      if (!accessToken) {
        return;
      }

      try {
        const newThumbsUp = workout.thumbsUp.filter(id => id !== currentUserId);
        const newThumbsDown = workout.thumbsDown.filter(id => id !== currentUserId);
        if (rating === 'up') {
          newThumbsUp.push(currentUserId);
        } else if (rating === 'down') {
          newThumbsDown.push(currentUserId);
        }

        const updatedWorkout = await updateSharedWorkout({
          ...workout,
          thumbsUp: newThumbsUp,
          thumbsDown: newThumbsDown,
        }, accessToken);

        rateSharedWorkout(workout.id, currentUserId, rating);
        setSharedWorkoutError(null);
        syncSharedWorkouts(
          sharedWorkouts.map((candidate) => candidate.id === workout.id ? updatedWorkout : candidate)
        );
      } catch (error) {
        const message = getSharedWorkoutErrorMessage(error);
        setSharedWorkoutError(message);
        Alert.alert('Unable to update workout rating', message);
      }
    };

    void run();
  };

  const handleToggleFavorite = (workout: SharedWorkout) => {
    const run = async () => {
      if (workout.source === 'playbook') {
        const isFavorited = playbookFavoriteIds.includes(workout.id);
        const nextFavorites = isFavorited
          ? playbookFavoriteIds.filter((id) => id !== workout.id)
          : [...playbookFavoriteIds, workout.id];
        setPlaybookFavoriteIds(nextFavorites);
        await AsyncStorage.setItem(playbookFavoritesStorageKey, JSON.stringify(nextFavorites)).catch(() => undefined);
        return;
      }

      if (!accessToken) {
        return;
      }

      try {
        const isFavorited = workout.favoritedBy.includes(currentUserId);
        const updatedWorkout = await updateSharedWorkout({
          ...workout,
          favoritedBy: isFavorited
            ? workout.favoritedBy.filter(id => id !== currentUserId)
            : [...workout.favoritedBy, currentUserId],
        }, accessToken);

        toggleFavoriteWorkout(workout.id, currentUserId);
        setSharedWorkoutError(null);
        syncSharedWorkouts(
          sharedWorkouts.map((candidate) => candidate.id === workout.id ? updatedWorkout : candidate)
        );
      } catch (error) {
        const message = getSharedWorkoutErrorMessage(error);
        setSharedWorkoutError(message);
        Alert.alert('Unable to update favorites', message);
      }
    };

    void run();
  };

  const shouldShowPlaybookSeparator = filterType === 'all' && filteredWorkouts.some((workout) => workout.source === 'playbook') && filteredWorkouts.some((workout) => workout.source !== 'playbook');
  const contentMaxWidth = width >= 1440 ? 1280 : width >= 1180 ? 1180 : 1024;

  const canSubmit = newName.trim().length > 0 && (!isMultiStep || steps.some(s => s.trim()));

  return (
    <View className="flex-1">
      <LinearGradient
        colors={theme.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />
      <ThemeBackdrop />

      <SafeAreaView edges={['top']} className="flex-1">
        <TopStatusBar title="Workouts" subtitle={`${userSquadron} Squadron`} />
        <PageContainer maxWidth={contentMaxWidth}>
        {/* Header */}
        <Animated.View
          entering={FadeInDown.delay(100).springify()}
          className="px-6 pt-4 pb-2"
        >
          <View className="flex-row items-center justify-between">
            <View>
              <Text style={getThemeHeadingStyle(theme, 28)}>Workouts</Text>
              <Text style={getThemeBodyStyle(theme, 14)}>{filteredWorkouts.length} workouts available</Text>
            </View>
            <TutorialTarget id="workouts-new">
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    openCreateModal();
                  }}
                  className="px-4 py-2 flex-row items-center"
                  style={getThemeButtonStyle(theme, 'accent')}
                >
                <Plus size={18} color={theme.id === 'pixel' ? '#0F181D' : '#08111B'} />
                <Text className="ml-1" style={getThemeButtonTextStyle(theme, 'accent')}>New</Text>
              </Pressable>
            </TutorialTarget>
          </View>
        </Animated.View>

        {sharedWorkoutError ? (
          <View className="px-6 pt-2">
            <View className="rounded-xl border border-af-warning/30 bg-af-warning/10 p-4">
              <Text className="text-af-warning text-sm text-center">{sharedWorkoutError}</Text>
            </View>
          </View>
        ) : null}

        {/* Search & Filter Bar */}
        <TutorialTarget id="workouts-search">
          <Animated.View
            entering={FadeInDown.delay(150).springify()}
            className="px-6 mt-2"
          >
            <View className="flex-row items-center px-4 py-3" style={getThemeInputContainerStyle(theme)}>
            <Search size={20} color={theme.textSecondary} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search workouts..."
              placeholderTextColor="#ffffff40"
              className="flex-1 ml-3 text-white text-base"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <X size={18} color={theme.textSecondary} />
              </Pressable>
            )}
          </View>

          {/* Filter Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mt-3"
            contentContainerStyle={{ paddingRight: 20 }}
            style={{ flexGrow: 0 }}
            onTouchStart={handleFilterTouchStart}
            onTouchMove={handleFilterTouchMove}
            onTouchEnd={releaseFilterSwipeLock}
            onTouchCancel={releaseFilterSwipeLock}
            onScrollBeginDrag={() => setSwipeEnabled(false)}
            onScrollEndDrag={releaseFilterSwipeLock}
            onMomentumScrollEnd={releaseFilterSwipeLock}
          >
            <Pressable
              onPress={() => setShowFilterModal(true)}
              className="flex-row items-center px-3 py-2 rounded-full mr-2"
              style={getThemeControlStyle(theme)}
            >
              <Filter size={14} color={theme.textSecondary} />
              <Text style={getThemeBodyStyle(theme, 13)} className="ml-1">Filters</Text>
            </Pressable>

            {(['all', 'favorites', 'mine', 'playbook'] as FilterType[]).map((type) => (
              <Pressable
                key={type}
                onPress={() => {
                  Haptics.selectionAsync();
                  setFilterType(type);
                }}
                className={cn(
                  "px-4 py-2 rounded-full mr-2",
                  filterType === type ? "" : ""
                )}
                style={filterType === type ? getThemeButtonStyle(theme, 'accent') : getThemeControlStyle(theme)}
              >
                <Text style={filterType === type ? getThemeButtonTextStyle(theme, 'accent') : getThemeBodyStyle(theme, 13, theme.textSecondary)}>
                  {type === 'all' ? 'All' : type === 'favorites' ? 'Favorites' : type === 'mine' ? 'My Workouts' : 'Playbook'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          </Animated.View>
        </TutorialTarget>
        </PageContainer>

        {/* Workouts List */}
        <ScrollView
          className="flex-1 mt-4"
          contentContainerStyle={{ paddingBottom: 120, alignItems: 'center' }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={theme.accent} />
          }
        >
          <PageContainer maxWidth={contentMaxWidth} className="px-6">
          {filteredWorkouts.length === 0 ? (
            <View className="items-center justify-center py-12">
              <Text className="text-white/40 text-lg">No workouts found</Text>
              <Text className="text-white/30 text-sm mt-1">
                {filterType === 'all' ? 'Be the first to share a workout!' : 'Try adjusting your filters'}
              </Text>
            </View>
          ) : (
            filteredWorkouts.map((workout, index) => (
              (() => {
                const isPlaybookWorkout = workout.source === 'playbook';
                const previousWorkout = filteredWorkouts[index - 1];
                const showSeparator = shouldShowPlaybookSeparator && previousWorkout?.source === 'playbook' && workout.source !== 'playbook';
                return (
              <React.Fragment key={workout.id}>
                {showSeparator ? (
                  <View className="mb-3 mt-1 flex-row items-center">
                    <View className="h-px flex-1 bg-white/10" />
                    <Text className="mx-3 text-af-silver text-xs uppercase tracking-[1px]">User Workouts</Text>
                    <View className="h-px flex-1 bg-white/10" />
                  </View>
                ) : null}
              <WorkoutCard
                workout={workout}
                currentUserId={currentUserId}
                creatorName={getMemberName(workout.createdBy, workout)}
                editorName={workout.editedBy ? getMemberName(workout.editedBy) : null}
                onRate={(rating) => handleRateWorkout(workout, rating)}
                onToggleFavorite={() => handleToggleFavorite(workout)}
                onEdit={() => openEditModal(workout)}
                onDelete={() => handleDeleteWorkout(workout.id)}
                canEdit={!isPlaybookWorkout && (workout.createdBy === currentUserId || canManageSharedWorkouts)}
                canDelete={!isPlaybookWorkout && (workout.createdBy === currentUserId || isAdmin(userAccountType))}
                allowFeedback={!isPlaybookWorkout}
                allowFavorite
                usageCount={workoutUsageCounts.get(workout.id) ?? 0}
                onScheduleSession={() => router.push(`/schedule-session?workoutId=${encodeURIComponent(workout.id)}&workoutName=${encodeURIComponent(workout.name)}`)}
                isExpandedOverride={expandedWorkoutId === workout.id}
                onToggleExpanded={(isExpanded) => setExpandedWorkoutId(isExpanded ? workout.id : (expandedWorkoutId === workout.id ? null : expandedWorkoutId))}
                theme={theme}
              />
              </React.Fragment>
                );
              })()
            ))
          )}
          </PageContainer>
        </ScrollView>
      </SafeAreaView>

      {/* Create/Edit Workout Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <View className="flex-1 bg-black/80 justify-end">
            <ThemeChrome theme={theme} variant="feature">
            <View className="p-6 pb-12 max-h-[90%]">
                <View className="flex-row items-center justify-between mb-6">
                <Text style={getThemeHeadingStyle(theme, 22)}>{editingWorkoutId ? 'Edit Workout' : 'Create Workout'}</Text>
                <Pressable
                  onPress={() => {
                    setShowCreateModal(false);
                    resetCreateForm();
                  }}
                  className="w-8 h-8 items-center justify-center"
                  style={getThemeIconWellStyle(theme)}
                >
                  <X size={20} color={theme.textSecondary} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Name */}
                <View className="mb-4">
                  <Text style={getThemeBodyStyle(theme, 13, theme.textSecondary)} className="mb-2">Workout Name *</Text>
                  <View style={getThemeInputContainerStyle(theme)}>
                    <TextInput
                      value={newName}
                      onChangeText={setNewName}
                      placeholder="e.g., Morning HIIT Circuit"
                      placeholderTextColor="#ffffff40"
                      className="px-4 py-3"
                      style={{ color: theme.textPrimary }}
                    />
                  </View>
                </View>

                {/* Type */}
                <View className="mb-4">
                  <Text style={getThemeBodyStyle(theme, 13, theme.textSecondary)} className="mb-2">Workout Type</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                    <View className="flex-row">
                      {WORKOUT_TYPES.map((type) => (
                        <Pressable
                          key={type}
                          onPress={() => setNewType(type)}
                          className={cn(
                            "px-4 py-2 rounded-lg mr-2 border",
                              newType === type ? "" : ""
                            )}
                            style={newType === type ? getThemeButtonStyle(theme, 'accent') : getThemeControlStyle(theme)}
                          >
                            <Text style={newType === type ? getThemeButtonTextStyle(theme, 'accent') : getThemeBodyStyle(theme, 13, theme.textPrimary)}>{type}</Text>
                          </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                {/* Duration */}
                <View className="mb-4">
                  <Text className="text-white/60 text-sm mb-2">Duration (minutes)</Text>
                  <TextInput
                    value={newDuration}
                    onChangeText={setNewDuration}
                    placeholder="30"
                    placeholderTextColor="#ffffff40"
                    keyboardType="number-pad"
                    className="bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10"
                  />
                </View>

                {/* Intensity Slider */}
                <View className="mb-4">
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-white/60 text-sm">Intensity</Text>
                    <Text className="text-white font-semibold">{newIntensity}/10</Text>
                  </View>
                  <SmartSlider
                    style={{ width: '100%', height: 40 }}
                    minimumValue={1}
                    maximumValue={10}
                    step={1}
                    value={newIntensity}
                    onValueChange={setNewIntensity}
                    minimumTrackTintColor="#4A90D9"
                    maximumTrackTintColor="rgba(255,255,255,0.2)"
                    thumbTintColor="#4A90D9"
                  />
                  <View className="flex-row justify-between">
                    <Text className="text-af-success text-xs">Easy</Text>
                    <Text className="text-af-warning text-xs">Moderate</Text>
                    <Text className="text-af-danger text-xs">Extreme</Text>
                  </View>
                </View>

                {/* Description */}
                <View className="mb-4">
                  <Text className="text-white/60 text-sm mb-2">Description</Text>
                  <TextInput
                    value={newDescription}
                    onChangeText={setNewDescription}
                    placeholder="Describe the workout..."
                    placeholderTextColor="#ffffff40"
                    multiline
                    numberOfLines={3}
                    className="bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10 min-h-[80px]"
                    textAlignVertical="top"
                  />
                </View>

                {/* Multi-Step Toggle */}
                <Pressable
                  onPress={() => setIsMultiStep(!isMultiStep)}
                  className="flex-row items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 mb-4"
                >
                  <View className="flex-row items-center">
                    <ListOrdered size={20} color="#A855F7" />
                    <Text className="text-white ml-3">Multi-Step Workout</Text>
                  </View>
                  <View className={cn(
                    "w-12 h-7 rounded-full justify-center px-1",
                    isMultiStep ? "bg-purple-500" : "bg-white/20"
                  )}>
                    <View className={cn(
                      "w-5 h-5 bg-white rounded-full",
                      isMultiStep ? "self-end" : "self-start"
                    )} />
                  </View>
                </Pressable>

                {/* Steps */}
                {isMultiStep && (
                  <View className="mb-4">
                    <Text className="text-white/60 text-sm mb-2">Steps</Text>
                    {steps.map((step, index) => (
                      <View key={index} className="flex-row items-center mb-2">
                        <View className="w-8 h-8 bg-af-accent/30 rounded-full items-center justify-center mr-2">
                          <Text className="text-af-accent font-bold text-sm">{index + 1}</Text>
                        </View>
                        <TextInput
                          value={step}
                          onChangeText={(value) => handleUpdateStep(index, value)}
                          placeholder={`Step ${index + 1}`}
                          placeholderTextColor="#ffffff40"
                          className="flex-1 bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10"
                        />
                        {steps.length > 1 && (
                          <Pressable
                            onPress={() => handleRemoveStep(index)}
                            className="ml-2 w-8 h-8 bg-af-danger/20 rounded-full items-center justify-center"
                          >
                            <X size={16} color="#EF4444" />
                          </Pressable>
                        )}
                      </View>
                    ))}
                    <Pressable
                      onPress={handleAddStep}
                      className="flex-row items-center justify-center bg-white/10 rounded-xl py-3 mt-2"
                    >
                      <Plus size={18} color="#4A90D9" />
                      <Text className="text-af-accent ml-2">Add Step</Text>
                    </Pressable>
                  </View>
                )}

                {/* Submit Button */}
                <Pressable
                  onPress={handleSubmitWorkout}
                  disabled={!canSubmit}
                  className={cn(
                    "py-4 rounded-xl mt-4",
                    canSubmit ? "bg-af-accent" : "bg-white/10"
                  )}
                >
                    <Text className={cn(
                      "font-bold text-center",
                      canSubmit ? "text-white" : "text-white/40"
                    )}>
                    {editingWorkoutId ? 'Save Changes' : 'Submit Workout'}
                    </Text>
                  </Pressable>
              </ScrollView>
            </View>
            </ThemeChrome>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Filter Modal */}
      <Modal visible={showFilterModal} transparent animationType="none">
        <Animated.View entering={FadeIn.duration(180)} className="flex-1 bg-black/80 justify-end">
          <Animated.View entering={SlideInDown.duration(260)}>
          <ThemeChrome theme={theme} variant="feature">
          <View className="p-6 pb-12">
            <View className="flex-row items-center justify-between mb-6">
              <Text style={getThemeHeadingStyle(theme, 22)}>Filter & Sort</Text>
              <Pressable
                onPress={() => setShowFilterModal(false)}
                className="w-8 h-8 items-center justify-center"
                style={getThemeIconWellStyle(theme)}
              >
                <X size={20} color={theme.textSecondary} />
              </Pressable>
            </View>

            {/* Workout Type Filter */}
            <View className="mb-4">
              <Text style={getThemeBodyStyle(theme, 13, theme.textSecondary)} className="mb-2">Workout Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                <View className="flex-row">
                  <Pressable
                    onPress={() => setSelectedWorkoutType('all')}
                    className={cn(
                      "px-4 py-2 rounded-lg mr-2 border",
                      selectedWorkoutType === 'all' ? "" : ""
                    )}
                    style={selectedWorkoutType === 'all' ? getThemeButtonStyle(theme, 'accent') : getThemeControlStyle(theme)}
                  >
                    <Text style={selectedWorkoutType === 'all' ? getThemeButtonTextStyle(theme, 'accent') : getThemeBodyStyle(theme, 13, theme.textPrimary)}>All Types</Text>
                  </Pressable>
                  {WORKOUT_TYPES.map((type) => (
                    <Pressable
                      key={type}
                      onPress={() => setSelectedWorkoutType(type)}
                      className={cn(
                        "px-4 py-2 rounded-lg mr-2 border",
                        selectedWorkoutType === type ? "" : ""
                      )}
                      style={selectedWorkoutType === type ? getThemeButtonStyle(theme, 'accent') : getThemeControlStyle(theme)}
                    >
                      <Text style={selectedWorkoutType === type ? getThemeButtonTextStyle(theme, 'accent') : getThemeBodyStyle(theme, 13, theme.textPrimary)}>{type}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Sort Options */}
            <View className="mb-4">
              <Text style={getThemeBodyStyle(theme, 13, theme.textSecondary)} className="mb-2">Sort By</Text>
              {(['newest', 'popular', 'duration'] as SortType[]).map((sort) => (
                <Pressable
                  key={sort}
                  onPress={() => {
                    setSortType(sort);
                    Haptics.selectionAsync();
                  }}
                  className={cn(
                    "flex-row items-center justify-between p-4 rounded-xl mb-2 border",
                    sortType === sort ? "" : ""
                  )}
                  style={sortType === sort ? getThemeControlStyle(theme, true) : getThemeControlStyle(theme)}
                >
                  <Text style={getThemeBodyStyle(theme, 14, sortType === sort ? theme.textPrimary : theme.textSecondary)}>
                    {sort === 'newest' ? 'Newest First' :
                     sort === 'popular' ? 'Most Popular' : 'Shortest Duration'}
                  </Text>
                  {sortType === sort && (
                    <Check size={18} color={theme.accent} />
                  )}
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={() => setShowFilterModal(false)}
              className="py-4"
              style={getThemeButtonStyle(theme, 'accent')}
            >
              <Text className="text-center" style={getThemeButtonTextStyle(theme, 'accent')}>Apply Filters</Text>
            </Pressable>
          </View>
          </ThemeChrome>
          </Animated.View>
        </Animated.View>
      </Modal>
    </View>
  );
}
