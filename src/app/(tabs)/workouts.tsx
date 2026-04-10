import React, { useEffect, useState, useMemo } from 'react';
import { Alert, View, Text, Pressable, ScrollView, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Search, X, ThumbsUp, ThumbsDown, Star, Trash2, Clock, Flame, ChevronDown, Check, ListOrdered, Filter, Pencil } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import SmartSlider from "../../components/SmartSlider";
import { useMemberStore, useAuthStore, getDisplayName, type WorkoutType, type SharedWorkout, type Squadron, WORKOUT_TYPES, isAdmin, canEditAttendance } from '@/lib/store';
import { cn } from '@/lib/cn';
import { createSharedWorkout, deleteSharedWorkoutFromSupabase, fetchSharedWorkouts, updateSharedWorkout } from '@/lib/supabaseData';
import { TutorialTarget } from '@/contexts/TutorialTourContext';

type FilterType = 'all' | 'favorites' | 'mine';
type SortType = 'newest' | 'popular' | 'duration';

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
}) {
  const [expanded, setExpanded] = useState(false);

  const userRating = workout.thumbsUp.includes(currentUserId)
    ? 'up'
    : workout.thumbsDown.includes(currentUserId)
    ? 'down'
    : 'none';

  const isFavorited = workout.favoritedBy.includes(currentUserId);

  const handleThumbsUp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRate(userRating === 'up' ? 'none' : 'up');
  };

  const handleThumbsDown = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRate(userRating === 'down' ? 'none' : 'down');
  };

  const handleFavorite = () => {
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
    <Animated.View
      entering={FadeInRight.springify()}
      className="bg-white/5 rounded-2xl border border-white/10 mb-3 overflow-hidden"
    >
      <Pressable
        onPress={() => setExpanded(!expanded)}
        className="p-4"
      >
        {/* Header */}
        <View className="flex-row items-start justify-between">
            <View className="flex-1">
              <Text className="text-white font-bold text-lg">{workout.name}</Text>
              <Text className="text-af-silver text-sm">by {creatorName}</Text>
              {editorName && workout.editedBy !== workout.createdBy ? (
                <Text className="text-af-silver/80 text-xs mt-1">edited by {editorName}</Text>
              ) : null}
            </View>
          <View className="flex-row items-center">
            <Pressable
              onPress={handleFavorite}
              className="w-9 h-9 items-center justify-center"
            >
              <Star
                size={20}
                color={isFavorited ? '#FFD700' : '#6B7280'}
                fill={isFavorited ? '#FFD700' : 'transparent'}
              />
            </Pressable>
            {canEdit && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onEdit();
                }}
                className="w-9 h-9 items-center justify-center"
              >
                <Pencil size={17} color="#4A90D9" />
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
        </View>

        {/* Tags */}
        <View className="flex-row flex-wrap mt-2 gap-2">
          <View className="bg-af-accent/20 px-2 py-1 rounded-full">
            <Text className="text-af-accent text-xs">{workout.type}</Text>
          </View>
          <View className="flex-row items-center bg-white/10 px-2 py-1 rounded-full">
            <Clock size={12} color="#C0C0C0" />
            <Text className="text-af-silver text-xs ml-1">{workout.duration} min</Text>
          </View>
          <View className="flex-row items-center px-2 py-1 rounded-full" style={{ backgroundColor: `${getIntensityColor(workout.intensity)}20` }}>
            <Flame size={12} color={getIntensityColor(workout.intensity)} />
            <Text className="text-xs ml-1" style={{ color: getIntensityColor(workout.intensity) }}>
              {getIntensityLabel(workout.intensity)}
            </Text>
          </View>
          {workout.isMultiStep && (
            <View className="flex-row items-center bg-purple-500/20 px-2 py-1 rounded-full">
              <ListOrdered size={12} color="#A855F7" />
              <Text className="text-purple-400 text-xs ml-1">{workout.steps.length} steps</Text>
            </View>
          )}
        </View>

        {/* Rating Section */}
        <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-white/10">
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
                color={userRating === 'up' ? '#22C55E' : '#6B7280'}
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
                color={userRating === 'down' ? '#EF4444' : '#6B7280'}
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
          <ChevronDown
            size={20}
            color="#C0C0C0"
            style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
          />
        </View>
      </Pressable>

      {/* Expanded Content */}
      {expanded && (
        <View className="px-4 pb-4 border-t border-white/10">
          {workout.description && (
            <View className="mt-3">
              <Text className="text-white/60 text-xs uppercase mb-1">Description</Text>
              <Text className="text-white">{workout.description}</Text>
            </View>
          )}

          {workout.isMultiStep && workout.steps.length > 0 && (
            <View className="mt-3">
              <Text className="text-white/60 text-xs uppercase mb-2">Steps</Text>
              {workout.steps.map((step, index) => (
                <View key={index} className="flex-row mb-2">
                  <View className="w-6 h-6 bg-af-accent/30 rounded-full items-center justify-center mr-3">
                    <Text className="text-af-accent text-xs font-bold">{index + 1}</Text>
                  </View>
                  <Text className="text-white flex-1">{step}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </Animated.View>
  );
}

export default function WorkoutsScreen() {
  const user = useAuthStore(s => s.user);
  const accessToken = useAuthStore(s => s.accessToken);
  const members = useMemberStore(s => s.members);
  const sharedWorkouts = useMemberStore(s => s.sharedWorkouts);
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
  const canManageSharedWorkouts = canEditAttendance(userAccountType);

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

  const getMemberName = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    return member ? getDisplayName(member) : 'Unknown';
  };

  // Filter and sort workouts
  const filteredWorkouts = useMemo(() => {
    let filtered = sharedWorkouts.filter(w => w.squadron === userSquadron);

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(w =>
        w.name.toLowerCase().includes(query) ||
        w.description.toLowerCase().includes(query) ||
        w.type.toLowerCase().includes(query)
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
      filtered = filtered.filter(w => w.createdBy === currentUserId);
    }

    // Sort
    if (sortType === 'newest') {
      filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortType === 'popular') {
      filtered.sort((a, b) => (b.thumbsUp.length - b.thumbsDown.length) - (a.thumbsUp.length - a.thumbsDown.length));
    } else if (sortType === 'duration') {
      filtered.sort((a, b) => a.duration - b.duration);
    }

    return filtered;
  }, [sharedWorkouts, userSquadron, searchQuery, selectedWorkoutType, filterType, sortType, currentUserId]);

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
      if (!newName.trim() || !user || !accessToken) {
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

          const updatedWorkout = await updateSharedWorkout({
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
          }, accessToken);

          syncSharedWorkouts(
            sharedWorkouts.map((candidate) => candidate.id === updatedWorkout.id ? updatedWorkout : candidate)
          );
        } else {
          const newWorkout: SharedWorkout = {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
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

          const createdWorkout = await createSharedWorkout(newWorkout, accessToken);
          const alreadyHadCreatorTrophy = members.find((member) => member.id === user.id)?.achievements.includes('shared_workout_creator') ?? false;
          addSharedWorkout(createdWorkout);
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
      if (!accessToken) {
        return;
      }
      try {
        await deleteSharedWorkoutFromSupabase(workoutId, accessToken);
        deleteSharedWorkout(workoutId);
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

  const canSubmit = newName.trim().length > 0 && (!isMultiStep || steps.some(s => s.trim()));

  return (
    <View className="flex-1">
      <LinearGradient
        colors={['#0A1628', '#001F5C', '#0A1628']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView edges={['top']} className="flex-1">
        {/* Header */}
        <Animated.View
          entering={FadeInDown.delay(100).springify()}
          className="px-6 pt-4 pb-2"
        >
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-white text-2xl font-bold">Workouts</Text>
              <Text className="text-af-silver text-sm">{filteredWorkouts.length} workouts available</Text>
            </View>
            <TutorialTarget id="workouts-new">
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    openCreateModal();
                  }}
                  className="bg-af-accent px-4 py-2 rounded-xl flex-row items-center"
                >
                <Plus size={18} color="white" />
                <Text className="text-white font-semibold ml-1">New</Text>
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
            <View className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10">
            <Search size={20} color="#C0C0C0" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search workouts..."
              placeholderTextColor="#ffffff40"
              className="flex-1 ml-3 text-white text-base"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <X size={18} color="#C0C0C0" />
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
          >
            <Pressable
              onPress={() => setShowFilterModal(true)}
              className="flex-row items-center bg-white/10 px-3 py-2 rounded-full mr-2"
            >
              <Filter size={14} color="#C0C0C0" />
              <Text className="text-af-silver text-sm ml-1">Filters</Text>
            </Pressable>

            {(['all', 'favorites', 'mine'] as FilterType[]).map((type) => (
              <Pressable
                key={type}
                onPress={() => {
                  Haptics.selectionAsync();
                  setFilterType(type);
                }}
                className={cn(
                  "px-4 py-2 rounded-full mr-2",
                  filterType === type ? "bg-af-accent" : "bg-white/10"
                )}
              >
                <Text className={cn(
                  "text-sm",
                  filterType === type ? "text-white font-semibold" : "text-af-silver"
                )}>
                  {type === 'all' ? 'All' : type === 'favorites' ? 'Favorites' : 'My Workouts'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          </Animated.View>
        </TutorialTarget>

        {/* Workouts List */}
        <ScrollView
          className="flex-1 px-6 mt-4"
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          {filteredWorkouts.length === 0 ? (
            <View className="items-center justify-center py-12">
              <Text className="text-white/40 text-lg">No workouts found</Text>
              <Text className="text-white/30 text-sm mt-1">
                {filterType === 'all' ? 'Be the first to share a workout!' : 'Try adjusting your filters'}
              </Text>
            </View>
          ) : (
            filteredWorkouts.map((workout) => (
              <WorkoutCard
                key={workout.id}
                  workout={workout}
                  currentUserId={currentUserId}
                  creatorName={getMemberName(workout.createdBy)}
                  editorName={workout.editedBy ? getMemberName(workout.editedBy) : null}
                  onRate={(rating) => handleRateWorkout(workout, rating)}
                onToggleFavorite={() => handleToggleFavorite(workout)}
                onEdit={() => openEditModal(workout)}
                onDelete={() => handleDeleteWorkout(workout.id)}
                canEdit={workout.createdBy === currentUserId || canManageSharedWorkouts}
                canDelete={workout.createdBy === currentUserId || isAdmin(userAccountType)}
              />
            ))
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Create/Edit Workout Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <View className="flex-1 bg-black/80 justify-end">
            <View className="bg-af-navy rounded-t-3xl p-6 pb-12 max-h-[90%]">
                <View className="flex-row items-center justify-between mb-6">
                <Text className="text-white text-xl font-bold">{editingWorkoutId ? 'Edit Workout' : 'Create Workout'}</Text>
                <Pressable
                  onPress={() => {
                    setShowCreateModal(false);
                    resetCreateForm();
                  }}
                  className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
                >
                  <X size={20} color="#C0C0C0" />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Name */}
                <View className="mb-4">
                  <Text className="text-white/60 text-sm mb-2">Workout Name *</Text>
                  <TextInput
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="e.g., Morning HIIT Circuit"
                    placeholderTextColor="#ffffff40"
                    className="bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10"
                  />
                </View>

                {/* Type */}
                <View className="mb-4">
                  <Text className="text-white/60 text-sm mb-2">Workout Type</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                    <View className="flex-row">
                      {WORKOUT_TYPES.map((type) => (
                        <Pressable
                          key={type}
                          onPress={() => setNewType(type)}
                          className={cn(
                            "px-4 py-2 rounded-lg mr-2 border",
                            newType === type
                              ? "bg-af-accent border-af-accent"
                              : "bg-white/5 border-white/10"
                          )}
                        >
                          <Text className={cn(
                            "text-sm",
                            newType === type ? "text-white" : "text-white/60"
                          )}>{type}</Text>
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
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Filter Modal */}
      <Modal visible={showFilterModal} transparent animationType="slide">
        <View className="flex-1 bg-black/80 justify-end">
          <View className="bg-af-navy rounded-t-3xl p-6 pb-12">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-white text-xl font-bold">Filter & Sort</Text>
              <Pressable
                onPress={() => setShowFilterModal(false)}
                className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
              >
                <X size={20} color="#C0C0C0" />
              </Pressable>
            </View>

            {/* Workout Type Filter */}
            <View className="mb-4">
              <Text className="text-white/60 text-sm mb-2">Workout Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                <View className="flex-row">
                  <Pressable
                    onPress={() => setSelectedWorkoutType('all')}
                    className={cn(
                      "px-4 py-2 rounded-lg mr-2 border",
                      selectedWorkoutType === 'all'
                        ? "bg-af-accent border-af-accent"
                        : "bg-white/5 border-white/10"
                    )}
                  >
                    <Text className={cn(
                      "text-sm",
                      selectedWorkoutType === 'all' ? "text-white" : "text-white/60"
                    )}>All Types</Text>
                  </Pressable>
                  {WORKOUT_TYPES.map((type) => (
                    <Pressable
                      key={type}
                      onPress={() => setSelectedWorkoutType(type)}
                      className={cn(
                        "px-4 py-2 rounded-lg mr-2 border",
                        selectedWorkoutType === type
                          ? "bg-af-accent border-af-accent"
                          : "bg-white/5 border-white/10"
                      )}
                    >
                      <Text className={cn(
                        "text-sm",
                        selectedWorkoutType === type ? "text-white" : "text-white/60"
                      )}>{type}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Sort Options */}
            <View className="mb-4">
              <Text className="text-white/60 text-sm mb-2">Sort By</Text>
              {(['newest', 'popular', 'duration'] as SortType[]).map((sort) => (
                <Pressable
                  key={sort}
                  onPress={() => {
                    setSortType(sort);
                    Haptics.selectionAsync();
                  }}
                  className={cn(
                    "flex-row items-center justify-between p-4 rounded-xl mb-2 border",
                    sortType === sort
                      ? "bg-af-accent/20 border-af-accent"
                      : "bg-white/5 border-white/10"
                  )}
                >
                  <Text className={cn(
                    "font-medium",
                    sortType === sort ? "text-white" : "text-af-silver"
                  )}>
                    {sort === 'newest' ? 'Newest First' :
                     sort === 'popular' ? 'Most Popular' : 'Shortest Duration'}
                  </Text>
                  {sortType === sort && (
                    <Check size={18} color="#4A90D9" />
                  )}
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={() => setShowFilterModal(false)}
              className="bg-af-accent py-4 rounded-xl"
            >
              <Text className="text-white font-bold text-center">Apply Filters</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
