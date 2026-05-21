import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal, Image, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Camera, Upload, X, Check, Clock, AlertCircle, Dumbbell, Info, Plus, Pencil, Heart, Bike, Sparkles, TrendingUp } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { useMemberStore, useAuthStore, canManagePTPrograms, getDisplayName, type WorkoutIntent, type WorkoutSegment, type WorkoutType, WORKOUT_INTENT_OPTIONS_BY_TYPE, WORKOUT_TYPES } from '@/lib/store';
import { cn } from '@/lib/cn';
import { createManualWorkoutSubmission, fetchApprovedManualWorkouts, fetchAttendanceSessions, fetchManualWorkoutSubmissions, reviewManualWorkoutSubmission, setAttendanceStatus, updateManualWorkoutSubmission, uploadWorkoutProofImage } from '@/lib/supabaseData';
import { PageContainer } from '@/components/PageContainer';
import { ThemeBackdrop } from '@/components/ThemeBackdrop';
import { ThemeChrome } from '@/components/ThemeChrome';
import { getThemeBodyStyle, getThemeButtonStyle, getThemeButtonTextStyle, getThemeControlStyle, getThemeHeadingStyle, useAppTheme } from '@/lib/theme';
import { estimateWorkoutSessionScore, WORKOUT_SCORE_ENGINE_NAME } from '@/lib/workoutScoreEngine';

type ProofImage = {
  uri: string;
  mimeType?: string;
};

type WorkoutSegmentForm = WorkoutSegment & {
  key: string;
  intent?: WorkoutIntent;
  durationInput: string;
  durationSecondsInput: string;
  distanceInput: string;
  weightInput: string;
  repsInput: string;
  setsInput: string;
  roundsInput: string;
  elevationGainInput: string;
  depthInput: string;
  stepsInput: string;
  averageHeartRateInput: string;
  caloriesBurnedInput: string;
  waveConditionsInput: string;
};

const WEIGHTLIFTING_SUBTYPES = [
  'Bench Press',
  'Squat',
  'Deadlift',
  'Shoulder Press',
  'Bicep Curl',
] as const;

const getLocalDateString = (date: Date) => format(date, 'yyyy-MM-dd');

const getWorkoutDisplayTitle = (type: WorkoutType) => {
  switch (type) {
    case 'Running':
      return 'Run';
    case 'Walking':
      return 'Walk';
    case 'Hiking':
      return 'Hike';
    case 'Rucking':
      return 'Ruck';
    case 'Cycling':
      return 'Ride';
    case 'Swimming':
      return 'Swim';
    case 'Weightlifting':
    case 'Strength':
      return 'Lift';
    default:
      return type;
  }
};

const getWorkoutTypeLabel = (type: WorkoutType) => (
  type === 'Strength' ? 'Weightlifting' : type
);

const getWorkoutTypeDescription = (type: WorkoutType) => {
  switch (type) {
    case 'Running':
      return 'Track time, distance, and running-specific notes.';
    case 'Walking':
      return 'Track time, distance, and walking-specific notes.';
    case 'Hiking':
      return 'Track time, distance, vertical gain, steps, and hiking notes.';
    case 'Rucking':
      return 'Track time, distance, carried ruck weight, and rucking notes.';
    case 'Cycling':
      return 'Track time, distance, and ride-specific notes.';
    case 'Swimming':
      return 'Track time, distance, and pool/open-water notes.';
    case 'Weightlifting':
    case 'Strength':
      return 'Track the lift type, time, weight, reps, sets, and lifting notes.';
    case 'HIIT':
      return 'Track time, rounds, and interval notes.';
    case 'Sports':
      return 'Track session time and sport-specific notes.';
    case 'Cardio':
      return 'Track session time and cardio-specific notes.';
    case 'Flexibility':
      return 'Track time and mobility/flexibility notes.';
    case 'Climbing':
      return 'Track time, vertical gain, and climbing notes.';
    case 'Surfing':
      return 'Track time, wave conditions, and surf notes.';
    case 'Diving':
      return 'Track time, depth, and dive notes.';
    case 'Combatives':
      return 'Track time, rounds, and training notes.';
    default:
      return 'Track time plus any combination of distance, steps, heart rate, calories, elevation gain, and workout notes.';
  }
};

const WORKOUT_TYPE_OPTIONS: WorkoutType[] = WORKOUT_TYPES.map((type) => (type === 'Strength' ? 'Weightlifting' : type)).filter(
  (type, index, array) => array.indexOf(type) === index
) as WorkoutType[];

const getIntentOptionsForType = (type: WorkoutType) => WORKOUT_INTENT_OPTIONS_BY_TYPE[type] ?? ['Other'];

const getIntentHelperText = (intent: WorkoutIntent) => {
  switch (intent) {
    case 'Endurance':
      return 'Longer steady-state work is compared against your recent endurance sessions.';
    case 'Tempo':
      return 'Tempo work favors sustained moderate-hard output compared against similar tempo efforts.';
    case 'Intervals':
      return 'Intervals are compared to prior interval sessions so shorter, harder days stay fair.';
    case 'Recovery':
      return 'Recovery sessions are compared to other recovery sessions so easier days are not punished.';
    case 'Strength':
      return 'Strength sessions emphasize heavier work compared to similar strength-focused lifts.';
    case 'Hypertrophy':
      return 'Hypertrophy sessions compare volume and completed sets against similar lifting sessions.';
    case 'Power':
      return 'Power sessions compare explosive lifting days to similar power-focused work.';
    case 'Conditioning':
      return 'Conditioning sessions are compared to similar conditioning work instead of all sessions of that type.';
    case 'Skills':
      return 'Skill-focused sessions are compared to other skill sessions so practice days stay fair.';
    case 'Competition':
      return 'Competition efforts are compared to other high-demand competition-style sessions.';
    case 'Other':
    default:
      return 'This intent groups workouts into a flexible comparison bucket when none of the other intents fit well.';
  }
};

function createSegmentKey(type: WorkoutType) {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultSegment(type: WorkoutType): WorkoutSegmentForm {
  return {
    key: createSegmentKey(type),
    type,
    subtype: undefined,
    intent: type === 'Other' ? 'Other' : undefined,
    duration: 0,
    durationSeconds: 0,
    distance: undefined,
    weight: undefined,
    reps: undefined,
    sets: undefined,
    rounds: undefined,
    elevationGain: undefined,
    depth: undefined,
    steps: undefined,
    averageHeartRate: undefined,
    caloriesBurned: undefined,
    waveConditions: '',
    additionalInfo: '',
    durationInput: '',
    durationSecondsInput: '',
    distanceInput: '',
    weightInput: '',
    repsInput: '',
    setsInput: '',
    roundsInput: '',
    elevationGainInput: '',
    depthInput: '',
    stepsInput: '',
    averageHeartRateInput: '',
    caloriesBurnedInput: '',
    waveConditionsInput: '',
  };
}

function createSegmentFormFromSegment(segment: WorkoutSegment): WorkoutSegmentForm {
  return {
    key: segment.id ?? createSegmentKey(segment.type),
    type: segment.type === 'Strength' ? 'Weightlifting' : segment.type,
    subtype: segment.subtype,
    intent: segment.intent ?? (segment.type === 'Other' ? 'Other' : undefined),
    duration: segment.duration ?? 0,
    durationSeconds: segment.durationSeconds ?? 0,
    distance: segment.distance,
    weight: segment.weight,
    reps: segment.reps,
    sets: segment.sets,
    rounds: segment.rounds,
    elevationGain: segment.elevationGain,
    depth: segment.depth,
    steps: segment.steps,
    averageHeartRate: segment.averageHeartRate,
    caloriesBurned: segment.caloriesBurned,
    waveConditions: segment.waveConditions ?? '',
    additionalInfo: segment.additionalInfo ?? '',
    durationInput: segment.duration ? String(segment.duration) : '',
    durationSecondsInput: segment.durationSeconds ? String(segment.durationSeconds) : '',
    distanceInput: typeof segment.distance === 'number' ? String(segment.distance) : '',
    weightInput: typeof segment.weight === 'number' ? String(segment.weight) : '',
    repsInput: typeof segment.reps === 'number' ? String(segment.reps) : '',
    setsInput: typeof segment.sets === 'number' ? String(segment.sets) : '',
    roundsInput: typeof segment.rounds === 'number' ? String(segment.rounds) : '',
    elevationGainInput: typeof segment.elevationGain === 'number' ? String(segment.elevationGain) : '',
    depthInput: typeof segment.depth === 'number' ? String(segment.depth) : '',
    stepsInput: typeof segment.steps === 'number' ? String(segment.steps) : '',
    averageHeartRateInput: typeof segment.averageHeartRate === 'number' ? String(segment.averageHeartRate) : '',
    caloriesBurnedInput: typeof segment.caloriesBurned === 'number' ? String(segment.caloriesBurned) : '',
    waveConditionsInput: segment.waveConditions ?? '',
  };
}

function getRequiredFieldErrors(segment: WorkoutSegmentForm) {
  const errors: string[] = [];
  const durationValue = parseInt(segment.durationInput || '0', 10) || 0;

  if (!segment.intent?.trim()) {
    errors.push('Workout intent is required.');
  }

  if (durationValue <= 0) {
    errors.push('Duration is required.');
  }

  if (['Running', 'Walking', 'Hiking', 'Rucking', 'Cycling', 'Swimming', 'Diving'].includes(segment.type)) {
    const distanceValue = parseFloat(segment.distanceInput || '0') || 0;
    if (distanceValue <= 0) {
      errors.push('Distance is required.');
    }
  }

  if (segment.type === 'Rucking') {
    const weightValue = parseFloat(segment.weightInput || '0') || 0;
    if (weightValue <= 0) {
      errors.push('Ruck weight is required.');
    }
  }

  if (segment.type === 'Surfing' && !segment.waveConditionsInput.trim()) {
    errors.push('Wave conditions are required.');
  }

  if (segment.type === 'Weightlifting' || segment.type === 'Strength') {
    const weightValue = parseFloat(segment.weightInput || '0') || 0;
    const repsValue = parseInt(segment.repsInput || '0', 10) || 0;
    if (!segment.subtype?.trim()) {
      errors.push('Lift type is required.');
    }
    if (weightValue <= 0) {
      errors.push('Weight is required.');
    }
    if (repsValue <= 0) {
      errors.push('Reps are required.');
    }
  }

  return errors;
}

function normalizeSegment(segment: WorkoutSegmentForm): WorkoutSegment {
  return {
    id: segment.key,
    type: segment.type,
    subtype: segment.subtype?.trim() || undefined,
    intent: segment.intent?.trim() as WorkoutIntent | undefined,
    duration: parseInt(segment.durationInput || '0', 10) || 0,
    durationSeconds: Math.min(59, Math.max(0, parseInt(segment.durationSecondsInput || '0', 10) || 0)),
    distance: segment.distanceInput ? parseFloat(segment.distanceInput) || 0 : undefined,
    weight: segment.weightInput ? parseFloat(segment.weightInput) || 0 : undefined,
    reps: segment.repsInput ? parseInt(segment.repsInput, 10) || 0 : undefined,
    sets: segment.setsInput ? parseInt(segment.setsInput, 10) || 0 : undefined,
    rounds: segment.roundsInput ? parseInt(segment.roundsInput, 10) || 0 : undefined,
    elevationGain: segment.elevationGainInput ? parseFloat(segment.elevationGainInput) || 0 : undefined,
    depth: segment.depthInput ? parseFloat(segment.depthInput) || 0 : undefined,
    steps: segment.stepsInput ? parseInt(segment.stepsInput, 10) || 0 : undefined,
    averageHeartRate: segment.averageHeartRateInput ? parseFloat(segment.averageHeartRateInput) || 0 : undefined,
    caloriesBurned: segment.caloriesBurnedInput ? parseFloat(segment.caloriesBurnedInput) || 0 : undefined,
    waveConditions: segment.waveConditionsInput.trim() || undefined,
    additionalInfo: segment.additionalInfo?.trim() || undefined,
  };
}

function updateSegmentsForSelection(current: WorkoutSegmentForm[], selectedTypes: WorkoutType[]) {
  return selectedTypes.map((type) => {
    const existing = current.find((segment) => segment.type === type);
    return existing ?? createDefaultSegment(type);
  });
}

function NumericField({
  label,
  value,
  onChangeText,
  placeholder,
  widthClassName = 'flex-1',
  decimal = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  widthClassName?: string;
  decimal?: boolean;
}) {
  return (
    <View className={cn(widthClassName)}>
      <Text className="text-white/60 text-sm mb-2">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#ffffff40"
        keyboardType={decimal ? (Platform.OS === 'ios' ? 'decimal-pad' : 'numeric') : 'numeric'}
        className="rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-white"
      />
    </View>
  );
}

function SelectPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'rounded-full border px-3 py-2 mb-2 mr-2',
        selected ? 'bg-af-accent/20 border-af-accent' : 'bg-white/5 border-white/10'
      )}
    >
      <Text className={selected ? 'text-white font-semibold text-sm' : 'text-af-silver text-sm'}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function AddWorkoutScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{
    mode?: string;
    submissionId?: string;
    workoutType?: WorkoutType;
    duration?: string;
    durationSeconds?: string;
    distance?: string;
    isPrivate?: string;
    screenshotUri?: string;
    workoutDate?: string;
    attendanceMarkedBySubmission?: string;
  }>();
  const user = useAuthStore(s => s.user);
  const accessToken = useAuthStore(s => s.accessToken);
  const members = useMemberStore(s => s.members);
  const ptSessions = useMemberStore(s => s.ptSessions);
  const syncApprovedManualWorkouts = useMemberStore(s => s.syncApprovedManualWorkouts);
  const syncPTSessions = useMemberStore(s => s.syncPTSessions);
  const isEditing = params.mode === 'edit' && !!params.submissionId;
  const canAutoApproveOwnWorkout = user ? canManagePTPrograms(user.accountType) : false;
  const contentMaxWidth = width >= 1440 ? 1120 : width >= 1180 ? 980 : 840;

  const [selectedDate, setSelectedDate] = useState(() => {
    const seed = params.workoutDate ? new Date(`${params.workoutDate}T00:00:00`) : new Date();
    return Number.isNaN(seed.getTime()) ? new Date() : seed;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [proofImages, setProofImages] = useState<ProofImage[]>(
    params.screenshotUri ? [{ uri: params.screenshotUri }] : []
  );
  const [selectedWorkoutTypes, setSelectedWorkoutTypes] = useState<WorkoutType[]>(
    params.workoutType ? [params.workoutType === 'Strength' ? 'Weightlifting' : params.workoutType] : []
  );
  const [workoutSegments, setWorkoutSegments] = useState<WorkoutSegmentForm[]>(
    params.workoutType
      ? [{
          ...createDefaultSegment(params.workoutType === 'Strength' ? 'Weightlifting' : params.workoutType),
          durationInput: params.duration ?? '',
          durationSecondsInput: params.durationSeconds ?? '',
          distanceInput: params.distance ?? '',
        }]
      : []
  );
  const [isPrivate, setIsPrivate] = useState(params.isPrivate === 'true');
  const [showWorkoutTypeModal, setShowWorkoutTypeModal] = useState(false);
  const [showScorePreviewInfo, setShowScorePreviewInfo] = useState(false);
  const [draftWorkoutTypes, setDraftWorkoutTypes] = useState<WorkoutType[]>(selectedWorkoutTypes);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const existingProofUri = useMemo(() => params.screenshotUri ?? null, [params.screenshotUri]);
  const attendanceMarkedBySubmission = params.attendanceMarkedBySubmission === 'true';
  const isWeb = Platform.OS === 'web';
  const currentMember = useMemo(
    () => (user ? members.find((member) => member.id === user.id) ?? null : null),
    [members, user]
  );
  const normalizedSegments = useMemo(() => workoutSegments.map(normalizeSegment), [workoutSegments]);

  const segmentValidationErrors = workoutSegments.flatMap((segment) => getRequiredFieldErrors(segment));
  const canSubmit = !!user && proofImages.length > 0 && workoutSegments.length > 0 && segmentValidationErrors.length === 0;
  const scorePreview = useMemo(() => {
    if (!currentMember || normalizedSegments.length === 0 || segmentValidationErrors.length > 0) {
      return null;
    }

    const previewSessionId = `preview-${getLocalDateString(selectedDate)}-${selectedWorkoutTypes.join('-') || 'session'}`;
    const previewWorkouts = normalizedSegments.map((segment, index) => ({
      id: `${previewSessionId}-${index}`,
      sessionId: previewSessionId,
      date: getLocalDateString(selectedDate),
      type: segment.type,
      duration: segment.duration,
      durationSeconds: segment.durationSeconds,
      distance: segment.distance,
      source: 'manual' as const,
      isPrivate,
      title: getWorkoutDisplayTitle(segment.type),
      segments: normalizedSegments,
      metrics: {
        subtype: segment.subtype,
        intent: segment.intent,
        weight: segment.weight,
        reps: segment.reps,
        sets: segment.sets,
        rounds: segment.rounds,
        elevationGain: segment.elevationGain,
        depth: segment.depth,
        steps: segment.steps,
        averageHeartRate: segment.averageHeartRate,
        caloriesBurned: segment.caloriesBurned,
        waveConditions: segment.waveConditions,
        additionalInfo: segment.additionalInfo,
        distance: segment.distance,
      },
    }));

    return estimateWorkoutSessionScore({
      member: currentMember,
      ptSessions,
      previewWorkouts,
    });
  }, [currentMember, normalizedSegments, ptSessions, segmentValidationErrors.length, selectedDate, selectedWorkoutTypes, isPrivate]);

  useEffect(() => {
    if (!isEditing || !params.submissionId || !user || !accessToken) {
      return;
    }

    let cancelled = false;

    const loadSubmission = async () => {
      try {
        const { mine, reviewQueue } = await fetchManualWorkoutSubmissions({
          memberId: user.id,
          memberEmail: user.email,
          squadron: user.squadron,
          canReview: canManagePTPrograms(user.accountType),
          accessToken,
        });
        const submission = [...mine, ...reviewQueue].find((item) => item.id === params.submissionId);
        if (!submission || cancelled) {
          return;
        }

        const nextTypes = (submission.workoutTypes?.length
          ? submission.workoutTypes
          : [submission.workoutType]
        ).map((type) => (type === 'Strength' ? 'Weightlifting' : type));
        const nextSegments = (submission.workoutDetails?.length
          ? submission.workoutDetails
          : [{
              type: submission.workoutType,
              duration: submission.duration,
              durationSeconds: submission.durationSeconds,
              distance: submission.distance,
            }]
        ).map(createSegmentFormFromSegment);
        const nextProofImages = (
          submission.proofImageDataList?.length
            ? submission.proofImageDataList
            : submission.proofImageData
              ? [submission.proofImageData]
              : []
        ).map((uri) => ({ uri }));

        const nextDate = new Date(`${submission.workoutDate}T00:00:00`);
        if (!Number.isNaN(nextDate.getTime())) {
          setSelectedDate(nextDate);
        }
        setProofImages(nextProofImages);
        setSelectedWorkoutTypes(nextTypes);
        setDraftWorkoutTypes(nextTypes);
        setWorkoutSegments(nextSegments);
        setIsPrivate(submission.isPrivate);
      } catch {
        // Keep the route-param fallback if we cannot hydrate the full submission.
      }
    };

    void loadSubmission();

    return () => {
      cancelled = true;
    };
  }, [accessToken, isEditing, params.submissionId, user]);

  const addProofImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 10,
    });

    if (!result.canceled && result.assets.length > 0) {
      setProofImages((current) => [
        ...current,
        ...result.assets.map((asset) => ({ uri: asset.uri, mimeType: asset.mimeType ?? undefined })),
      ]);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setProofImages((current) => [
        ...current,
        { uri: result.assets[0].uri, mimeType: result.assets[0].mimeType ?? undefined },
      ]);
    }
  };

  const handleConfirmWorkoutTypes = () => {
    setSelectedWorkoutTypes(draftWorkoutTypes);
    setWorkoutSegments((current) => updateSegmentsForSelection(current, draftWorkoutTypes));
    setShowWorkoutTypeModal(false);
  };

  const handleSegmentChange = (key: string, updates: Partial<WorkoutSegmentForm>) => {
    setWorkoutSegments((current) => current.map((segment) => (
      segment.key === key ? { ...segment, ...updates } : segment
    )));
  };

  const handleSubmit = () => {
    const run = async () => {
      if (!user || !accessToken || !canSubmit) return;

      setSubmitError(null);
      setIsSubmitting(true);

      try {
        const normalizedSegments = workoutSegments.map(normalizeSegment);
        const primarySegment = normalizedSegments[0];
        const submissionId = params.submissionId ?? `manual-workout-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const proofImageDataList: string[] = [];

        for (let index = 0; index < proofImages.length; index += 1) {
          const proofImage = proofImages[index];
          const uploaded = existingProofUri && proofImage.uri === existingProofUri
            ? proofImage.uri
            : await uploadWorkoutProofImage({
                memberId: user.id,
                submissionId: `${submissionId}-${index}`,
                localUri: proofImage.uri,
                mimeType: proofImage.mimeType,
                accessToken,
              });
          proofImageDataList.push(uploaded);
        }

        if (isEditing) {
          if (attendanceMarkedBySubmission) {
            await setAttendanceStatus({
              date: params.workoutDate ?? getLocalDateString(selectedDate),
              flight: user.flight,
              squadron: user.squadron,
              memberId: user.id,
              createdBy: user.id,
              isAttending: false,
              accessToken,
            }).catch(() => undefined);
          }

          await updateManualWorkoutSubmission({
            submissionId,
            workoutDate: getLocalDateString(selectedDate),
            workoutType: primarySegment.type,
            workoutTypes: normalizedSegments.map((segment) => segment.type),
            workoutDetails: normalizedSegments,
            duration: primarySegment.duration,
            durationSeconds: primarySegment.durationSeconds,
            distance: primarySegment.distance,
            isPrivate,
            proofImageData: proofImageDataList[0] ?? '',
            proofImageDataList,
            accessToken,
          });
        } else {
          const submission = await createManualWorkoutSubmission({
            submissionId,
            memberId: user.id,
            memberEmail: user.email,
            memberName: getDisplayName(user),
            memberRank: user.rank,
            memberFlight: user.flight,
            squadron: user.squadron,
            workoutDate: getLocalDateString(selectedDate),
            workoutType: primarySegment.type,
            workoutTypes: normalizedSegments.map((segment) => segment.type),
            workoutDetails: normalizedSegments,
            duration: primarySegment.duration,
            durationSeconds: primarySegment.durationSeconds,
            distance: primarySegment.distance,
            isPrivate,
            proofImageData: proofImageDataList[0] ?? '',
            proofImageDataList,
            accessToken,
          });

          if (canAutoApproveOwnWorkout) {
            await reviewManualWorkoutSubmission({
              submissionId: submission.id,
              reviewerMemberId: user.id,
              reviewerName: getDisplayName(user),
              approved: true,
              attendanceMarkedBySubmission: true,
              accessToken,
            });

            await setAttendanceStatus({
              date: getLocalDateString(selectedDate),
              flight: user.flight,
              squadron: user.squadron,
              memberId: user.id,
              createdBy: user.id,
              isAttending: true,
              source: 'workout',
              accessToken,
            }).catch(() => undefined);
          }
        }

        const [approvedManualWorkouts, nextSessions] = await Promise.all([
          fetchApprovedManualWorkouts(accessToken, user.squadron).catch(() => []),
          fetchAttendanceSessions(accessToken).catch(() => []),
        ]);
        syncApprovedManualWorkouts(approvedManualWorkouts);
        syncPTSessions(nextSessions);

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : 'Unable to submit workout proof.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setIsSubmitting(false);
      }
    };

    void run();
  };

  const handleDateChange = (_event: unknown, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
    }
  };

  const handleWebDateChange = (value: string) => {
    if (!value) return;
    const nextDate = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(nextDate.getTime())) {
      setSelectedDate(nextDate);
    }
  };

  return (
    <View className="flex-1">
      <ThemeBackdrop />

      <SafeAreaView edges={['top', 'bottom']} className="flex-1">
        <PageContainer maxWidth={contentMaxWidth}>
          <Animated.View entering={FadeInDown.delay(100).springify()} className="px-6 pt-4 pb-2 flex-row items-center">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              className="w-10 h-10 rounded-full items-center justify-center mr-4"
              style={getThemeControlStyle(theme)}
            >
              <ChevronLeft size={24} color={theme.textSecondary} />
            </Pressable>
            <View className="flex-1">
              <Text style={getThemeHeadingStyle(theme, 22)}>{isEditing ? 'Edit Manual Workout' : 'Add Manual Workout'}</Text>
              <Text style={getThemeBodyStyle(theme, 13, theme.textSecondary)} className="mt-1">
                Log one session with one or more workout types and proof images.
              </Text>
            </View>
          </Animated.View>
        </PageContainer>

        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40, alignItems: 'center' }} showsVerticalScrollIndicator={false}>
          <PageContainer maxWidth={contentMaxWidth} className="px-6">
            {isEditing ? (
              <Animated.View entering={FadeInDown.delay(125).springify()} className="mt-4 rounded-2xl border border-af-warning/30 bg-af-warning/10 p-4">
                <Text className="text-af-warning font-semibold">Editing requires re-approval</Text>
                <Text className="text-af-silver text-sm mt-1">
                  Once you resubmit this workout, it will go back to pending review before it counts toward your attendance again.
                </Text>
              </Animated.View>
            ) : null}

            <ThemeChrome theme={theme} variant="feature">
              <View className="p-4">
                <Animated.View entering={FadeInDown.delay(150).springify()}>
                  <View className="flex-row items-center mb-2">
                    <Text className="text-white/60 text-sm">Workout Proof Images *</Text>
                    <View className="ml-2 flex-row items-center bg-af-warning/20 px-2 py-1 rounded">
                      <AlertCircle size={12} color="#F59E0B" />
                      <Text className="text-af-warning text-xs ml-1">Required</Text>
                    </View>
                  </View>
                  {proofImages.length === 0 ? (
                    <View className="bg-white/5 rounded-2xl border border-white/10 border-dashed p-6">
                      <Text className="text-white font-semibold text-center mb-3">Attach one or more proof images</Text>
                      <Text className="text-af-silver text-center text-sm mb-5">
                        Add screenshots or photos that prove the full session. You can attach multiple images if needed.
                      </Text>
                      <View className="flex-row justify-center">
                        <Pressable onPress={takePhoto} className="flex-row items-center bg-af-accent px-5 py-3 rounded-xl mr-2">
                          <Camera size={18} color="white" />
                          <Text className="text-white font-semibold ml-2">Camera</Text>
                        </Pressable>
                        <Pressable onPress={addProofImages} className="flex-row items-center bg-white/10 px-5 py-3 rounded-xl ml-2">
                          <Upload size={18} color="#C0C0C0" />
                          <Text className="text-white font-semibold ml-2">Gallery</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View className="flex-row">
                          {proofImages.map((image, index) => (
                            <View key={`${image.uri}-${index}`} className="mr-3 relative">
                              <Image source={{ uri: image.uri }} className="w-28 h-28 rounded-2xl" resizeMode="cover" />
                              <Pressable
                                onPress={() => setProofImages((current) => current.filter((_, imageIndex) => imageIndex !== index))}
                                className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full items-center justify-center"
                              >
                                <X size={16} color="white" />
                              </Pressable>
                            </View>
                          ))}
                        </View>
                      </ScrollView>
                      <View className="flex-row mt-3">
                        <Pressable onPress={takePhoto} className="flex-row items-center bg-af-accent px-4 py-3 rounded-xl mr-2">
                          <Camera size={18} color="white" />
                          <Text className="text-white font-semibold ml-2">Add Photo</Text>
                        </Pressable>
                        <Pressable onPress={addProofImages} className="flex-row items-center bg-white/10 px-4 py-3 rounded-xl ml-2">
                          <Upload size={18} color="#C0C0C0" />
                          <Text className="text-white font-semibold ml-2">Add Images</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(200).springify()} className="mt-4">
                  <Text className="text-white/60 text-sm mb-2">Workout Types</Text>
                  {selectedWorkoutTypes.length === 0 ? (
                    <View className="rounded-2xl border border-sky-400/30 bg-sky-400/10 p-4 mb-3">
                      <View className="flex-row items-start">
                        <Info size={18} color="#7DD3FC" />
                        <Text className="text-af-silver text-sm ml-3 flex-1">
                          Input boxes will populate once workout types are selected using the Select button below.
                        </Text>
                      </View>
                    </View>
                  ) : null}
                  <Pressable
                    onPress={() => {
                      setDraftWorkoutTypes(selectedWorkoutTypes);
                      setShowWorkoutTypeModal(true);
                      Haptics.selectionAsync();
                    }}
                    className="flex-row items-center justify-between rounded-xl border border-white/10 bg-white/10 px-4 py-3"
                  >
                    <View className="flex-row items-center">
                      {selectedWorkoutTypes.length > 0 ? <Pencil size={18} color="#C0C0C0" /> : <Plus size={18} color="#C0C0C0" />}
                      <Text className="text-white font-semibold ml-3">
                        {selectedWorkoutTypes.length > 0 ? 'Edit Selections' : 'Select'}
                      </Text>
                    </View>
                    <Text className="text-af-silver text-xs">
                      {selectedWorkoutTypes.length > 0 ? `${selectedWorkoutTypes.length} selected` : 'Multiple allowed'}
                    </Text>
                  </Pressable>
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(225).springify()} className="mt-4">
                  <Text className="text-white/60 text-sm mb-2">Workout Date</Text>
                  {isWeb ? (
                    <View className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10">
                      <Clock size={20} color="#C0C0C0" />
                      <View className="flex-1 ml-3">
                        <Text className="text-white/60 text-xs mb-1">Date</Text>
                        <input
                          type="date"
                          value={getLocalDateString(selectedDate)}
                          max={getLocalDateString(new Date())}
                          onChange={(event) => handleWebDateChange(event.target.value)}
                          style={{ width: '100%', background: 'transparent', border: 'none', color: 'white', outline: 'none', fontSize: 16 }}
                        />
                      </View>
                    </View>
                  ) : (
                    <Pressable onPress={() => setShowDatePicker(true)} className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10">
                      <Clock size={20} color="#C0C0C0" />
                      <View className="ml-3">
                        <Text className="text-white/60 text-xs">Date</Text>
                        <Text className="text-white font-semibold mt-1">{format(selectedDate, 'MMMM d, yyyy')}</Text>
                      </View>
                    </Pressable>
                  )}
                </Animated.View>

                {selectedWorkoutTypes.length > 1 ? (
                  <Animated.View entering={FadeInDown.delay(235).springify()} className="mt-4 rounded-2xl border border-af-accent/20 bg-af-accent/10 p-4">
                    <View className="flex-row items-start">
                      <Info size={16} color="#7DD3FC" />
                      <Text className="text-af-silver text-sm ml-3 flex-1">
                        For multi-type sessions, enter the portion of the workout that belongs to each selected type so leaderboard points and analytics stay accurate.
                      </Text>
                    </View>
                  </Animated.View>
                ) : null}

                {workoutSegments.map((segment) => (
                  <Animated.View key={segment.key} entering={FadeInDown.delay(250).springify()} className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <Text className="text-white font-semibold text-lg">{getWorkoutTypeLabel(segment.type)}</Text>
                    <Text className="text-af-silver text-sm mt-1 mb-4">{getWorkoutTypeDescription(segment.type)}</Text>

                    <View className="flex-row" style={{ gap: 12 }}>
                      <NumericField
                        label="Duration (minutes) *"
                        value={segment.durationInput}
                        onChangeText={(value) => handleSegmentChange(segment.key, { durationInput: value })}
                        placeholder="30"
                      />
                      <NumericField
                        label="Seconds"
                        value={segment.durationSecondsInput}
                        onChangeText={(value) => handleSegmentChange(segment.key, { durationSecondsInput: value })}
                        placeholder="00"
                        widthClassName="w-28"
                      />
                    </View>

                    {['Running', 'Walking', 'Hiking', 'Rucking', 'Cycling', 'Swimming', 'Diving'].includes(segment.type) ? (
                      <View className="mt-4">
                        <NumericField
                          label="Distance *"
                          value={segment.distanceInput}
                          onChangeText={(value) => handleSegmentChange(segment.key, { distanceInput: value })}
                          placeholder="Miles"
                          widthClassName="w-full"
                          decimal
                        />
                      </View>
                    ) : null}

                    {segment.type === 'Hiking' ? (
                      <View className="flex-row mt-4" style={{ gap: 12 }}>
                        <NumericField
                          label="Vertical Gain"
                          value={segment.elevationGainInput}
                          onChangeText={(value) => handleSegmentChange(segment.key, { elevationGainInput: value })}
                          placeholder="Feet"
                          decimal
                        />
                        <NumericField
                          label="Steps"
                          value={segment.stepsInput}
                          onChangeText={(value) => handleSegmentChange(segment.key, { stepsInput: value })}
                          placeholder="8000"
                        />
                      </View>
                    ) : null}

                    {segment.type === 'Rucking' ? (
                      <View className="mt-4">
                        <NumericField
                          label="Ruck Weight *"
                          value={segment.weightInput}
                          onChangeText={(value) => handleSegmentChange(segment.key, { weightInput: value })}
                          placeholder="35"
                          widthClassName="w-full"
                          decimal
                        />
                      </View>
                    ) : null}

                    {(segment.type === 'Weightlifting' || segment.type === 'Strength') ? (
                      <>
                        <View className="mt-4">
                          <Text className="text-white/60 text-sm mb-2">Lift Type *</Text>
                          <View className="flex-row flex-wrap">
                            {WEIGHTLIFTING_SUBTYPES.map((subtype) => (
                              <SelectPill
                                key={`${segment.key}-${subtype}`}
                                label={subtype}
                                selected={segment.subtype === subtype}
                                onPress={() => handleSegmentChange(segment.key, { subtype })}
                              />
                            ))}
                          </View>
                        </View>
                        <View className="flex-row mt-4" style={{ gap: 12 }}>
                          <NumericField
                            label="Weight Amount *"
                            value={segment.weightInput}
                            onChangeText={(value) => handleSegmentChange(segment.key, { weightInput: value })}
                            placeholder="185"
                            decimal
                          />
                          <NumericField
                            label="Reps *"
                            value={segment.repsInput}
                            onChangeText={(value) => handleSegmentChange(segment.key, { repsInput: value })}
                            placeholder="5"
                          />
                        </View>
                        <View className="mt-4">
                          <NumericField
                            label="Sets"
                            value={segment.setsInput}
                            onChangeText={(value) => handleSegmentChange(segment.key, { setsInput: value })}
                            placeholder="3"
                            widthClassName="w-full"
                          />
                        </View>
                      </>
                    ) : null}

                    {segment.type === 'HIIT' || segment.type === 'Combatives' ? (
                      <View className="mt-4">
                        <NumericField
                          label="Rounds"
                          value={segment.roundsInput}
                          onChangeText={(value) => handleSegmentChange(segment.key, { roundsInput: value })}
                          placeholder="6"
                          widthClassName="w-full"
                        />
                      </View>
                    ) : null}

                    {segment.type === 'Climbing' ? (
                      <View className="mt-4">
                        <NumericField
                          label="Vertical Gain"
                          value={segment.elevationGainInput}
                          onChangeText={(value) => handleSegmentChange(segment.key, { elevationGainInput: value })}
                          placeholder="Feet"
                          widthClassName="w-full"
                          decimal
                        />
                      </View>
                    ) : null}

                    {segment.type === 'Diving' ? (
                      <View className="mt-4">
                        <NumericField
                          label="Depth"
                          value={segment.depthInput}
                          onChangeText={(value) => handleSegmentChange(segment.key, { depthInput: value })}
                          placeholder="Feet"
                          widthClassName="w-full"
                          decimal
                        />
                      </View>
                    ) : null}

                    {segment.type === 'Other' ? (
                      <>
                        <View className="flex-row mt-4" style={{ gap: 12 }}>
                          <NumericField
                            label="Distance"
                            value={segment.distanceInput}
                            onChangeText={(value) => handleSegmentChange(segment.key, { distanceInput: value })}
                            placeholder="Miles"
                            decimal
                          />
                          <NumericField
                            label="Steps"
                            value={segment.stepsInput}
                            onChangeText={(value) => handleSegmentChange(segment.key, { stepsInput: value })}
                            placeholder="6000"
                          />
                        </View>
                        <View className="flex-row mt-4" style={{ gap: 12 }}>
                          <NumericField
                            label="Avg Heart Rate"
                            value={segment.averageHeartRateInput}
                            onChangeText={(value) => handleSegmentChange(segment.key, { averageHeartRateInput: value })}
                            placeholder="145"
                            decimal
                          />
                          <NumericField
                            label="Calories Burned"
                            value={segment.caloriesBurnedInput}
                            onChangeText={(value) => handleSegmentChange(segment.key, { caloriesBurnedInput: value })}
                            placeholder="420"
                            decimal
                          />
                        </View>
                        <View className="mt-4">
                          <NumericField
                            label="Elevation Gain"
                            value={segment.elevationGainInput}
                            onChangeText={(value) => handleSegmentChange(segment.key, { elevationGainInput: value })}
                            placeholder="Feet"
                            widthClassName="w-full"
                            decimal
                          />
                        </View>
                      </>
                    ) : null}

                    {segment.type === 'Surfing' ? (
                      <View className="mt-4">
                        <Text className="text-white/60 text-sm mb-2">Wave Conditions *</Text>
                        <TextInput
                          value={segment.waveConditionsInput}
                          onChangeText={(value) => handleSegmentChange(segment.key, { waveConditionsInput: value })}
                          placeholder="e.g. clean waist-high sets"
                          placeholderTextColor="#ffffff40"
                          className="rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-white"
                        />
                      </View>
                    ) : null}

                    <View className="mt-4">
                      <View className="flex-row items-center mb-2">
                        <Text className="text-white/60 text-sm">Workout Intent *</Text>
                        <Info size={14} color="#C0C0C0" style={{ marginLeft: 6 }} />
                      </View>
                      <View className="flex-row flex-wrap">
                        {getIntentOptionsForType(segment.type).map((intent) => (
                          <SelectPill
                            key={`${segment.key}-${intent}`}
                            label={intent}
                            selected={segment.intent === intent}
                            onPress={() => handleSegmentChange(segment.key, { intent })}
                          />
                        ))}
                      </View>
                    </View>

                    <View className="mt-4 rounded-2xl border border-sky-400/25 bg-sky-400/10 p-4">
                      <Text className="text-sky-300 font-semibold text-sm">Why this matters</Text>
                      <Text className="text-af-silver text-sm mt-2">
                        Your score is calculated based on the intent of your workout. Different intents are compared to similar past workouts.
                      </Text>
                      {segment.intent ? (
                        <Text className="text-af-silver text-xs mt-2">
                          {getIntentHelperText(segment.intent)}
                        </Text>
                      ) : null}
                    </View>

                    <View className="mt-4">
                      <Text className="text-white/60 text-sm mb-2">Additional Information</Text>
                      <TextInput
                        value={segment.additionalInfo ?? ''}
                        onChangeText={(value) => handleSegmentChange(segment.key, { additionalInfo: value })}
                        placeholder="Add context for this workout type"
                        placeholderTextColor="#ffffff40"
                        multiline
                        textAlignVertical="top"
                        className="rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-white min-h-[96px]"
                      />
                    </View>
                  </Animated.View>
                ))}

                <Animated.View entering={FadeInDown.delay(300).springify()} className="mt-4">
                  <Text className="text-white/60 text-sm mb-2">Privacy</Text>
                  <Pressable
                    onPress={() => {
                      setIsPrivate((current) => !current);
                      Haptics.selectionAsync();
                    }}
                    className="flex-row items-center justify-between rounded-xl border border-white/10 bg-white/10 px-4 py-3"
                  >
                    <View>
                      <Text className="text-white font-semibold">{isPrivate ? 'Private workout' : 'Visible to squadron'}</Text>
                      <Text className="text-af-silver text-xs mt-1">
                        Private workouts still count for you, but details stay hidden from other users.
                      </Text>
                    </View>
                    <View className={cn("w-6 h-6 rounded-full border-2 items-center justify-center", isPrivate ? "bg-af-accent border-af-accent" : "border-white/30")}>
                      {isPrivate ? <Check size={14} color="#fff" /> : null}
                    </View>
                  </Pressable>
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(320).springify()} className="mt-4">
                  <ThemeChrome theme={theme}>
                    <View className="p-4">
                      <View className="flex-row items-start justify-between">
                        <View>
                          <View className="flex-row items-center">
                            <Text className="text-white text-xl font-semibold">Score Preview</Text>
                            <View className="ml-2 rounded-full bg-emerald-500/20 px-2 py-1">
                              <Text className="text-emerald-300 text-[11px] font-semibold">ESTIMATED</Text>
                            </View>
                          </View>
                          <Text className="text-af-silver text-sm mt-2">
                            {scorePreview ? 'Your workout will be rescored with the new Leaderboard Score Engine when saved.' : 'Complete the required workout fields to preview your estimated score.'}
                          </Text>
                        </View>
                        <Pressable onPress={() => setShowScorePreviewInfo(true)} className="flex-row items-center">
                          <Text className="text-af-accent font-medium mr-2">Learn more</Text>
                          <Info size={16} color="#60A5FA" />
                        </Pressable>
                      </View>

                      {scorePreview ? (
                        <>
                          <View className="mt-5 flex-row flex-wrap" style={{ gap: 16 }}>
                            <View className="min-w-[160px] flex-1">
                              <Text className="text-white/60 text-sm">Estimated Points</Text>
                              <View className="flex-row items-end mt-2">
                                <Text className="text-emerald-400 text-5xl font-bold">{scorePreview.totalPoints}</Text>
                                <Text className="text-af-silver text-lg ml-2 mb-1">/ {scorePreview.maxPoints} max</Text>
                              </View>
                              <Text className="text-af-silver text-sm mt-2">Good workout! Keep it up.</Text>
                            </View>

                            <View className="min-w-[220px] flex-1">
                              <Text className="text-white/60 text-sm mb-2">Breakdown</Text>
                              <View className="space-y-2">
                                <View className="flex-row items-center justify-between py-1">
                                  <View className="flex-row items-center flex-1 pr-3">
                                    <Heart size={16} color="#4ADE80" />
                                    <Text className="text-white ml-2">Effort (Volume & Output)</Text>
                                  </View>
                                  <Text className="text-emerald-300 font-semibold">{scorePreview.breakdown.effortScore.toFixed(1)} pts</Text>
                                </View>
                                <View className="flex-row items-center justify-between py-1">
                                  <View className="flex-row items-center flex-1 pr-3">
                                    <Bike size={16} color="#60A5FA" />
                                    <Text className="text-white ml-2">Intensity Match</Text>
                                  </View>
                                  <Text className="text-af-accent font-semibold">{scorePreview.breakdown.intentMatchScore.toFixed(1)} pts</Text>
                                </View>
                                <View className="flex-row items-center justify-between py-1">
                                  <View className="flex-row items-center flex-1 pr-3">
                                    <Sparkles size={16} color="#A78BFA" />
                                    <Text className="text-white ml-2">Consistency Bonus</Text>
                                  </View>
                                  <Text className="text-purple-300 font-semibold">{scorePreview.breakdown.consistencyBonus.toFixed(1)} pts</Text>
                                </View>
                                <View className="flex-row items-center justify-between py-1">
                                  <View className="flex-row items-center flex-1 pr-3">
                                    <TrendingUp size={16} color="#FACC15" />
                                    <Text className="text-white ml-2">Improvement Bonus</Text>
                                  </View>
                                  <Text className="text-yellow-300 font-semibold">{scorePreview.breakdown.improvementBonus.toFixed(1)} pts</Text>
                                </View>
                              </View>
                            </View>

                            <View className="min-w-[200px] flex-1">
                              <Text className="text-white/60 text-sm mb-2">Compared To</Text>
                              <Text className="text-white font-semibold">{scorePreview.comparedToLabel}</Text>
                              <Text className="text-af-silver text-sm mt-2">{scorePreview.comparisonDetail}</Text>
                            </View>
                          </View>

                          <View className="mt-5 border-t border-white/10 pt-4">
                            <Text className="text-af-gold text-sm">{scorePreview.tip}</Text>
                          </View>
                        </>
                      ) : null}
                    </View>
                  </ThemeChrome>
                </Animated.View>

                {submitError ? (
                  <View className="mt-4 rounded-xl border border-af-danger/40 bg-af-danger/10 px-4 py-3">
                    <Text className="text-af-danger">{submitError}</Text>
                  </View>
                ) : null}

                {!canSubmit && selectedWorkoutTypes.length > 0 ? (
                  <View className="mt-4 rounded-xl border border-af-warning/30 bg-af-warning/10 px-4 py-3">
                    <Text className="text-af-warning text-sm">
                      Complete the required fields for each selected workout type and attach at least one proof image before submitting.
                    </Text>
                  </View>
                ) : null}

                <Pressable
                  onPress={handleSubmit}
                  disabled={!canSubmit || isSubmitting}
                  className="mt-6 rounded-xl px-4 py-4"
                  style={!canSubmit || isSubmitting ? getThemeControlStyle(theme) : getThemeButtonStyle(theme, 'accent')}
                >
                  <Text style={!canSubmit || isSubmitting ? getThemeBodyStyle(theme, 15, theme.textMuted) : getThemeButtonTextStyle(theme, 'accent')}>
                    {isSubmitting ? 'Submitting...' : isEditing ? 'Resubmit Workout' : 'Submit Workout'}
                  </Text>
                </Pressable>
              </View>
            </ThemeChrome>
          </PageContainer>
        </ScrollView>

        {showDatePicker && !isWeb ? (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            maximumDate={new Date()}
            onChange={handleDateChange}
          />
        ) : null}

        <Modal visible={showWorkoutTypeModal} transparent animationType="fade">
          <View className="flex-1 bg-black/80 items-center justify-center p-6">
            <View className="w-full max-w-md rounded-3xl border border-white/20 bg-af-navy p-6">
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-1 pr-4">
                  <Text className="text-white text-xl font-bold">Select Workout Types</Text>
                  <Text className="text-af-silver text-sm mt-1">
                    You can select multiple workout types for the same session.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setShowWorkoutTypeModal(false)}
                  className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
                >
                  <X size={20} color="#C0C0C0" />
                </Pressable>
              </View>

              <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 8 }}>
                {WORKOUT_TYPE_OPTIONS.map((type) => {
                  const selected = draftWorkoutTypes.includes(type);
                  return (
                    <Pressable
                      key={type}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setDraftWorkoutTypes((current) => (
                          current.includes(type)
                            ? current.filter((item) => item !== type)
                            : [...current, type]
                        ));
                      }}
                      className={cn(
                        "rounded-xl border px-4 py-4 mb-3",
                        selected ? "bg-af-accent/20 border-af-accent" : "bg-white/5 border-white/10"
                      )}
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1 pr-4">
                          <Text className={selected ? "text-white font-semibold" : "text-white font-medium"}>
                            {getWorkoutTypeLabel(type)}
                          </Text>
                          <Text className="text-af-silver text-xs mt-1">
                            {getWorkoutTypeDescription(type)}
                          </Text>
                        </View>
                        <View className={cn("w-6 h-6 rounded-full border-2 items-center justify-center", selected ? "bg-af-accent border-af-accent" : "border-white/30")}>
                          {selected ? <Check size={14} color="#fff" /> : null}
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Pressable onPress={handleConfirmWorkoutTypes} className="mt-4 rounded-xl bg-af-accent px-4 py-4">
                <Text className="text-white text-center font-semibold">Confirm</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal visible={showScorePreviewInfo} transparent animationType="fade">
          <View className="flex-1 bg-black/80 items-center justify-center p-6">
            <View className="w-full max-w-lg rounded-3xl border border-white/20 bg-af-navy p-6">
              <View className="flex-row items-start justify-between mb-4">
                <View className="flex-1 pr-4">
                  <Text className="text-white text-xl font-bold">{WORKOUT_SCORE_ENGINE_NAME}</Text>
                  <Text className="text-af-silver text-sm mt-1">
                    Scores now prioritize effort and workout intent, with consistency and personal improvement as smaller modifiers.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setShowScorePreviewInfo(false)}
                  className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
                >
                  <X size={20} color="#C0C0C0" />
                </Pressable>
              </View>

              <View className="space-y-3">
                <Text className="text-white/80 text-sm">1. Effort: volume and output are compared against intent-aware benchmarks for that workout type.</Text>
                <Text className="text-white/80 text-sm">2. Intensity Match: your workout is compared to the last up to 5 similar workouts of the same type, subtype, and intent.</Text>
                <Text className="text-white/80 text-sm">3. Consistency: workouts earlier in the same week add a small bonus, capped at 10 points per session.</Text>
                <Text className="text-white/80 text-sm">4. Improvement: beating your recent similar baseline adds a smaller bonus without dominating the score.</Text>
              </View>

              <View className="mt-5 rounded-2xl border border-white/10 bg-black/10 px-4 py-4">
                <Text className="text-white font-semibold">Scoring Formula</Text>
                <Text className="text-af-silver text-sm mt-2">First workout in a new type / subtype / intent bucket = 30 points</Text>
                <Text className="text-af-silver text-sm mt-2">effortScore = clamp(22 + ((effortRatio - 1) × 35), 12, 60)</Text>
                <Text className="text-af-silver text-sm mt-2">intensityMatchScore = similarity bonus based on your last up to 5 similar workouts</Text>
                <Text className="text-af-silver text-sm mt-2">consistencyBonus = min(currentWeeklySessionCount × 2, 10)</Text>
                <Text className="text-af-silver text-sm mt-2">improvementBonus = clamp((improvementRatio - 1) × 40, 0, 15)</Text>
                <Text className="text-af-silver text-sm mt-2">finalPoints = clamp(effortScore + intensityMatchScore + consistencyBonus + improvementBonus, 30, 115)</Text>
              </View>

              <Pressable onPress={() => setShowScorePreviewInfo(false)} className="mt-5 rounded-xl bg-af-accent px-4 py-4">
                <Text className="text-white text-center font-semibold">Got it</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}
