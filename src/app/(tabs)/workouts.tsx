import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Search, X, ThumbsUp, ThumbsDown, Star, Trash2, Clock, Flame, ChevronDown, Check, ListOrdered, Filter } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import SmartSlider from "../../components/SmartSlider";
import { useMemberStore, useAuthStore, getDisplayName, type WorkoutType, type SharedWorkout, type Squadron, WORKOUT_TYPES, isAdmin } from '@/lib/store';
import { cn } from '@/lib/cn';
import { SwipeableTabView } from '@/components/SwipeableTabView';

type FilterType = 'all' | 'favorites' | 'mine';
type SortType = 'newest' | 'popular' | 'duration';

function WorkoutCard({
  workout,
  currentUserId,
  onRate,
  onToggleFavorite,
  onDelete,
  canDelete,
  creatorName,
}: {
  workout: SharedWorkout;
  currentUserId: string;
  onRate: (rating: 'up' | 'down' | 'none') => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  canDelete: boolean;
  creatorName: string;
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
  const members = useMemberStore(s => s.members);
  const sharedWorkouts = useMemberStore(s => s.sharedWorkouts);
  const addSharedWorkout = useMemberStore(s => s.addSharedWorkout);
  const deleteSharedWorkout = useMemberStore(s => s.deleteSharedWorkout);
  const rateSharedWorkout = useMemberStore(s => s.rateSharedWorkout);
  const toggleFavoriteWorkout = useMemberStore(s => s.toggleFavoriteWorkout);

  const [showCreateModal, setShowCreateModal] = useState(false);
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

  const currentUserId = user?.id ?? '';
  const userAccountType = user?.accountType ?? 'standard';
  const userSquadron: Squadron = (user?.squadron as Squadron) ?? '392 IS';

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
    setNewName('');
    setNewType('Strength');
    setNewDuration('30');
    setNewIntensity(5);
    setNewDescription('');
    setIsMultiStep(false);
    setSteps(['']);
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
    if (!newName.trim()) {
      console.log('[Workouts] Cannot submit: name is empty');
      return;
    }
    if (!user) {
      console.log('[Workouts] Cannot submit: user is not logged in');
      return;
    }

    const newWorkout: SharedWorkout = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      name: newName.trim(),
      type: newType,
      duration: parseInt(newDuration) || 30,
      intensity: newIntensity,
      description: newDescription.trim(),
      isMultiStep,
      steps: isMultiStep ? steps.filter(s => s.trim()) : [],
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      squadron: userSquadron,
      thumbsUp: [],
      thumbsDown: [],
      favoritedBy: [],
    };

    console.log('[Workouts] Submitting workout:', newWorkout.name);
    addSharedWorkout(newWorkout);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowCreateModal(false);
    resetCreateForm();
  };

  const canSubmit = newName.trim().length > 0 && (!isMultiStep || steps.some(s => s.trim()));

  return (
    <SwipeableTabView>
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
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowCreateModal(true);
              }}
              className="bg-af-accent px-4 py-2 rounded-xl flex-row items-center"
            >
              <Plus size={18} color="white" />
              <Text className="text-white font-semibold ml-1">New</Text>
            </Pressable>
          </View>
        </Animated.View>

        {/* Search & Filter Bar */}
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
                onRate={(rating) => rateSharedWorkout(workout.id, currentUserId, rating)}
                onToggleFavorite={() => toggleFavoriteWorkout(workout.id, currentUserId)}
                onDelete={() => deleteSharedWorkout(workout.id)}
                canDelete={workout.createdBy === currentUserId || isAdmin(userAccountType)}
              />
            ))
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Create Workout Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <View className="flex-1 bg-black/80 justify-end">
            <View className="bg-af-navy rounded-t-3xl p-6 pb-12 max-h-[90%]">
              <View className="flex-row items-center justify-between mb-6">
                <Text className="text-white text-xl font-bold">Create Workout</Text>
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
                    Submit Workout
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
    </SwipeableTabView>
  );
}
