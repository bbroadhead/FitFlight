import React, { useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal, Image, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Camera, Upload, X, Check, Clock, MapPin, Lock, Unlock, AlertCircle } from 'lucide-react-native';
import Animated, { FadeInDown, FadeIn, ZoomIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useMemberStore, useAuthStore, getDisplayName, type WorkoutType, WORKOUT_TYPES } from '@/lib/store';
import { cn } from '@/lib/cn';
import { createManualWorkoutSubmission } from '@/lib/supabaseData';

export default function AddWorkoutScreen() {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const accessToken = useAuthStore(s => s.accessToken);
  const members = useMemberStore(s => s.members);

  const [screenshotUri, setScreenshotUri] = useState<string | null>(null);
  const [workoutType, setWorkoutType] = useState<WorkoutType>('Running');
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const workoutTypeScrollRef = useRef<ScrollView>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canSubmit = duration && screenshotUri;
  const webWorkoutTypeScrollProps = Platform.OS === 'web'
    ? ({
        onWheel: (event: any) => {
          const delta = typeof event?.nativeEvent?.deltaY === 'number'
            ? event.nativeEvent.deltaY
            : event?.deltaY ?? 0;
          if (delta && workoutTypeScrollRef.current) {
            const currentX = event?.currentTarget?.scrollLeft ?? 0;
            workoutTypeScrollRef.current.scrollTo({ x: currentX + delta, animated: false });
          }
        },
      } as any)
    : {};

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setScreenshotUri(result.assets[0].uri);
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
      setScreenshotUri(result.assets[0].uri);
    }
  };

  const convertImageToDataUrl = async (uri: string) => {
    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      const blob = await response.blob();
      const mimeType = blob.type || 'image/jpeg';
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result;
          if (typeof result === 'string') {
            resolve(result.split(',')[1] ?? '');
            return;
          }
          reject(new Error('Unable to read image proof.'));
        };
        reader.onerror = () => reject(new Error('Unable to read image proof.'));
        reader.readAsDataURL(blob);
      });
      return `data:${mimeType};base64,${base64}`;
    }

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:image/jpeg;base64,${base64}`;
  };

  const handleSubmit = () => {
    const run = async () => {
      if (!user || !duration || !screenshotUri || !accessToken) return;

      setSubmitError(null);
      setIsSubmitting(true);

      try {
        const proofImageData = await convertImageToDataUrl(screenshotUri);
        await createManualWorkoutSubmission({
          memberId: user.id,
          memberEmail: user.email,
          memberName: getDisplayName(user),
          memberRank: user.rank,
          memberFlight: user.flight,
          squadron: user.squadron,
          workoutDate: new Date().toISOString().split('T')[0],
          workoutType,
          duration: parseInt(duration, 10) || 0,
          distance: distance ? parseFloat(distance) : undefined,
          isPrivate,
          proofImageData,
          accessToken,
        });

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
          className="px-6 pt-4 pb-2 flex-row items-center"
        >
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            className="w-10 h-10 bg-white/10 rounded-full items-center justify-center mr-4"
          >
            <ChevronLeft size={24} color="#C0C0C0" />
          </Pressable>
          <Text className="text-white text-xl font-bold">Add Manual Workout</Text>
        </Animated.View>

        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Screenshot Upload - Required */}
          <Animated.View
            entering={FadeInDown.delay(150).springify()}
            className="mt-4"
          >
            <View className="flex-row items-center mb-2">
              <Text className="text-white/60 text-sm">Workout Proof Image *</Text>
              <View className="ml-2 flex-row items-center bg-af-warning/20 px-2 py-1 rounded">
                <AlertCircle size={12} color="#F59E0B" />
                <Text className="text-af-warning text-xs ml-1">Required</Text>
              </View>
            </View>
              {!screenshotUri ? (
                <View className="bg-white/5 rounded-2xl border border-white/10 border-dashed p-8">
                  <Text className="text-white font-semibold text-center mb-4">
                    Upload workout proof
                  </Text>
                  <Text className="text-af-silver text-center text-sm mb-6">
                    Take a photo or select an image proving you completed the workout. It will be reviewed before it is counted.
                  </Text>
                  <View className="flex-row justify-center">
                    <Pressable
                      onPress={takePhoto}
                      className="flex-row items-center bg-af-accent px-6 py-3 rounded-xl mr-2"
                    >
                      <Camera size={20} color="white" />
                      <Text className="text-white font-semibold ml-2">Camera</Text>
                    </Pressable>
                    <Pressable
                      onPress={pickImage}
                      className="flex-row items-center bg-white/10 px-6 py-3 rounded-xl ml-2"
                    >
                      <Upload size={20} color="#C0C0C0" />
                      <Text className="text-white font-semibold ml-2">Gallery</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View className="relative">
                  <Image
                    source={{ uri: screenshotUri }}
                    className="w-full h-48 rounded-2xl"
                    resizeMode="cover"
                  />
                  <Pressable
                    onPress={() => setScreenshotUri(null)}
                    className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full items-center justify-center"
                  >
                    <X size={18} color="white" />
                  </Pressable>
                </View>
              )}
            </Animated.View>

          {/* Workout Type */}
          <Animated.View
            entering={FadeInDown.delay(250).springify()}
            className="mt-4"
          >
            <Text className="text-white/60 text-sm mb-2">Workout Type</Text>
            <ScrollView
              ref={workoutTypeScrollRef}
              horizontal
              showsHorizontalScrollIndicator={Platform.OS === 'web'}
              style={{ flexGrow: 0 }}
              {...webWorkoutTypeScrollProps}
            >
              <View className="flex-row">
                {WORKOUT_TYPES.map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => { setWorkoutType(type); Haptics.selectionAsync(); }}
                    className={cn(
                      "px-4 py-2 rounded-xl mr-2 border",
                      workoutType === type
                        ? "bg-af-accent border-af-accent"
                        : "bg-white/5 border-white/10"
                    )}
                  >
                    <Text className={cn(
                      "font-medium",
                      workoutType === type ? "text-white" : "text-white/60"
                    )}>{type}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </Animated.View>

          {/* Duration */}
          <Animated.View
            entering={FadeInDown.delay(300).springify()}
            className="mt-4"
          >
            <Text className="text-white/60 text-sm mb-2">Duration (minutes) *</Text>
            <View className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10">
              <Clock size={20} color="#C0C0C0" />
              <TextInput
                value={duration}
                onChangeText={setDuration}
                placeholder="30"
                placeholderTextColor="#ffffff40"
                keyboardType="numeric"
                className="flex-1 ml-3 text-white text-base"
              />
              <Text className="text-af-silver">min</Text>
            </View>
          </Animated.View>

          {/* Distance */}
          <Animated.View
            entering={FadeInDown.delay(350).springify()}
            className="mt-4"
          >
            <Text className="text-white/60 text-sm mb-2">Distance (optional)</Text>
            <View className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10">
              <MapPin size={20} color="#C0C0C0" />
              <TextInput
                value={distance}
                onChangeText={setDistance}
                placeholder="3.1"
                placeholderTextColor="#ffffff40"
                keyboardType="decimal-pad"
                className="flex-1 ml-3 text-white text-base"
              />
              <Text className="text-af-silver">miles</Text>
            </View>
          </Animated.View>

          {/* Privacy Toggle */}
          <Animated.View
            entering={FadeInDown.delay(400).springify()}
            className="mt-4"
          >
            <Pressable
              onPress={() => { setIsPrivate(!isPrivate); Haptics.selectionAsync(); }}
              className={cn(
                "flex-row items-center justify-between p-4 rounded-xl border",
                isPrivate ? "bg-af-accent/20 border-af-accent/50" : "bg-white/5 border-white/10"
              )}
            >
              <View className="flex-row items-center flex-1">
                {isPrivate ? (
                  <Lock size={20} color="#4A90D9" />
                ) : (
                  <Unlock size={20} color="#C0C0C0" />
                )}
                <View className="ml-3 flex-1">
                  <Text className={cn(
                    "font-medium",
                    isPrivate ? "text-af-accent" : "text-white/70"
                  )}>
                    {isPrivate ? 'Private Workout' : 'Public Workout'}
                  </Text>
                  <Text className="text-white/40 text-xs">
                    {isPrivate
                      ? 'Only visible to PFLs, UFPM, and Owner'
                      : 'Visible to all squadron members'}
                  </Text>
                </View>
              </View>
              <View className={cn(
                "w-6 h-6 rounded-full border-2",
                isPrivate ? "bg-af-accent border-af-accent" : "border-white/30"
              )}>
                {isPrivate && <View className="flex-1 items-center justify-center">
                  <View className="w-2 h-2 bg-white rounded-full" />
                </View>}
              </View>
            </Pressable>
          </Animated.View>

          {/* Submit Button */}
          <Animated.View
            entering={FadeInDown.delay(450).springify()}
            className="mt-6"
          >
            {submitError ? (
              <View className="flex-row items-center justify-center mb-3 bg-af-danger/10 p-3 rounded-xl">
                <AlertCircle size={16} color="#EF4444" />
                <Text className="text-af-danger text-sm ml-2">{submitError}</Text>
              </View>
            ) : null}
            {!screenshotUri && (
              <View className="flex-row items-center justify-center mb-3 bg-af-warning/10 p-3 rounded-xl">
                <AlertCircle size={16} color="#F59E0B" />
                <Text className="text-af-warning text-sm ml-2">Screenshot/image proof is required to add workout</Text>
              </View>
            )}
            <Pressable
              onPress={() => {
                if (canSubmit && !isSubmitting) {
                  setShowConfirmation(true);
                }
              }}
              disabled={!canSubmit || isSubmitting}
              className={cn(
                "py-4 rounded-xl flex-row items-center justify-center",
                canSubmit && !isSubmitting ? "bg-af-accent" : "bg-white/10"
              )}
            >
              <Check size={20} color={canSubmit && !isSubmitting ? "white" : "#666666"} />
              <Text className={cn(
                "font-bold text-lg ml-2",
                canSubmit && !isSubmitting ? "text-white" : "text-white/40"
              )}>
                {isSubmitting ? 'Submitting...' : 'Submit for Approval'}
              </Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      {/* Confirmation Modal for Screenshot Uploads */}
      <Modal visible={showConfirmation} transparent animationType="fade">
        <View className="flex-1 bg-black/80 items-center justify-center p-6">
          <Animated.View
            entering={ZoomIn.duration(300)}
            className="bg-af-navy rounded-3xl p-6 w-full max-w-sm border border-white/20"
          >
            <Text className="text-white text-xl font-bold mb-4">Submit Manual Workout</Text>

            {screenshotUri && (
              <Image
                source={{ uri: screenshotUri }}
                className="w-full h-32 rounded-xl mb-4"
                resizeMode="cover"
              />
            )}

            <View className="bg-white/5 rounded-xl p-4 mb-4">
              <View className="flex-row justify-between mb-2">
                <Text className="text-af-silver">Type</Text>
                <Text className="text-white font-semibold">{workoutType}</Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-af-silver">Duration</Text>
                <Text className="text-white font-semibold">{duration} min</Text>
              </View>
              {distance && (
                <View className="flex-row justify-between mb-2">
                  <Text className="text-af-silver">Distance</Text>
                  <Text className="text-white font-semibold">{distance} mi</Text>
                </View>
              )}
              <View className="flex-row justify-between">
                <Text className="text-af-silver">Privacy</Text>
                <Text className={cn(
                  "font-semibold",
                  isPrivate ? "text-af-accent" : "text-white"
                )}>
                  {isPrivate ? 'Private' : 'Public'}
                </Text>
              </View>
            </View>

            <View className="bg-af-accent/10 border border-af-accent/20 rounded-xl p-4 mb-4">
              <Text className="text-white text-sm leading-5">
                This workout will be sent to your squadron's PFLs, UFPM, and Owner for approval. It will only count toward your attendance and account after approval.
              </Text>
            </View>

            <View className="flex-row">
              <Pressable
                onPress={() => setShowConfirmation(false)}
                className="flex-1 bg-white/10 py-3 rounded-xl mr-2"
              >
                <Text className="text-white text-center font-semibold">Edit</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setShowConfirmation(false);
                  handleSubmit();
                }}
                className="flex-1 bg-af-accent py-3 rounded-xl ml-2"
              >
                <Text className="text-white text-center font-semibold">Send for Review</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}
