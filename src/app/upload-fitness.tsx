import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Upload, FileText, Check, X, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import { useMemberStore, useAuthStore, type FitnessAssessment, calculateRequiredPTSessions, getDisplayName } from '@/lib/store';
import { cn } from '@/lib/cn';

export default function UploadFitnessTrackerScreen() {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const members = useMemberStore(s => s.members);
  const addFitnessAssessment = useMemberStore(s => s.addFitnessAssessment);
  const awardAchievement = useMemberStore(s => s.awardAchievement);

  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);

  // Manual entry state
  const [overallScore, setOverallScore] = useState('');
  const [cardioScore, setCardioScore] = useState('');
  const [cardioTime, setCardioTime] = useState('');
  const [pushupScore, setPushupScore] = useState('');
  const [pushupReps, setPushupReps] = useState('');
  const [situpScore, setSitupScore] = useState('');
  const [situpReps, setSitupReps] = useState('');
  const [waistScore, setWaistScore] = useState('');
  const [waistInches, setWaistInches] = useState('');

  const currentMember = user ? members.find(m => m.id === user.id) : null;
  const previousAssessment = currentMember?.fitnessAssessments[currentMember.fitnessAssessments.length - 1];

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      setIsProcessing(true);
      // Simulate PDF processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Mock extracted data - in production, this would parse the PDF
      // For now, show manual entry with some pre-filled values
      setOverallScore('87');
      setCardioScore('45');
      setCardioTime('11:30');
      setPushupScore('18');
      setPushupReps('48');
      setSitupScore('18');
      setSitupReps('52');
      setWaistScore('6');
      setWaistInches('33');

      setIsProcessing(false);
      setShowConfirmation(true);
    } catch (error) {
      console.error('Document picker error:', error);
      setIsProcessing(false);
    }
  };

  const handleSubmit = () => {
    if (!user || !overallScore) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const score = parseInt(overallScore);
    const assessment: FitnessAssessment = {
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      overallScore: score,
      components: {
        cardio: {
          score: parseInt(cardioScore) || 0,
          time: cardioTime || undefined,
        },
        pushups: {
          score: parseInt(pushupScore) || 0,
          reps: parseInt(pushupReps) || 0,
        },
        situps: {
          score: parseInt(situpScore) || 0,
          reps: parseInt(situpReps) || 0,
        },
        waist: waistScore ? {
          score: parseInt(waistScore) || 0,
          inches: parseFloat(waistInches) || 0,
        } : undefined,
      },
      isPrivate: false,
    };

    addFitnessAssessment(user.id, assessment);

    // Check for achievements
    if (score >= 90) {
      awardAchievement(user.id, 'excellent_fa');
    }
    if (score === 100) {
      awardAchievement(user.id, 'perfect_fa');
    }
    if (previousAssessment && score >= previousAssessment.overallScore + 10) {
      awardAchievement(user.id, 'improvement');
    }

    router.back();
  };

  const newRequiredSessions = overallScore ? calculateRequiredPTSessions(parseInt(overallScore)) : 3;
  const scoreChange = previousAssessment && overallScore
    ? parseInt(overallScore) - previousAssessment.overallScore
    : null;

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
          <Text className="text-white text-xl font-bold">Fitness Assessment</Text>
        </Animated.View>

        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Upload Section */}
          <Animated.View
            entering={FadeInDown.delay(150).springify()}
            className="mt-4"
          >
            <View className="bg-white/5 rounded-2xl border border-white/10 border-dashed p-8">
              <View className="items-center">
                <FileText size={48} color="#4A90D9" />
                <Text className="text-white font-semibold text-center mt-4 mb-2">
                  Upload myFSS Fitness Tracker
                </Text>
                <Text className="text-af-silver text-center text-sm mb-6">
                  Upload your official PDF from myFSS and we'll extract your fitness assessment scores.
                </Text>

                <Pressable
                  onPress={pickDocument}
                  disabled={isProcessing}
                  className={cn(
                    "flex-row items-center bg-af-accent px-6 py-3 rounded-xl",
                    isProcessing && "opacity-50"
                  )}
                >
                  <Upload size={20} color="white" />
                  <Text className="text-white font-semibold ml-2">
                    {isProcessing ? 'Processing...' : 'Select PDF'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setShowManualEntry(true)}
                  className="mt-4"
                >
                  <Text className="text-af-silver underline">Enter manually instead</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>

          {/* Previous Assessment */}
          {previousAssessment && (
            <Animated.View
              entering={FadeInDown.delay(200).springify()}
              className="mt-4 p-4 bg-white/5 rounded-2xl border border-white/10"
            >
              <Text className="text-white/60 text-sm mb-3">Previous Assessment ({previousAssessment.date})</Text>
              <View className="flex-row items-center justify-between">
                <Text className="text-white font-semibold">Overall Score</Text>
                <View className={cn(
                  "px-3 py-1 rounded-full",
                  previousAssessment.overallScore >= 90 ? "bg-af-success/20" :
                  previousAssessment.overallScore >= 75 ? "bg-af-accent/20" :
                  "bg-af-warning/20"
                )}>
                  <Text className={cn(
                    "font-bold",
                    previousAssessment.overallScore >= 90 ? "text-af-success" :
                    previousAssessment.overallScore >= 75 ? "text-af-accent" :
                    "text-af-warning"
                  )}>
                    {previousAssessment.overallScore}
                  </Text>
                </View>
              </View>
              <Text className="text-af-silver text-sm mt-2">
                Required PT: {calculateRequiredPTSessions(previousAssessment.overallScore)} sessions/week
              </Text>
            </Animated.View>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Confirmation Modal */}
      <Modal visible={showConfirmation} transparent animationType="fade">
        <View className="flex-1 bg-black/80 justify-center items-center p-6">
          <Animated.View
            entering={ZoomIn.duration(300)}
            className="bg-af-navy rounded-3xl p-6 w-full max-w-sm border border-white/20"
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-white text-xl font-bold">Confirm Data</Text>
              <Pressable
                onPress={() => setShowConfirmation(false)}
                className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
              >
                <X size={20} color="#C0C0C0" />
              </Pressable>
            </View>

            <Text className="text-af-silver mb-4">
              Please verify the extracted data and make any corrections.
            </Text>

            <ScrollView style={{ maxHeight: 400 }}>
              {/* Overall Score */}
              <View className="mb-4">
                <Text className="text-white/60 text-sm mb-2">Overall Score</Text>
                <View className="flex-row items-center">
                  <TextInput
                    value={overallScore}
                    onChangeText={setOverallScore}
                    keyboardType="numeric"
                    className="flex-1 bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10"
                  />
                  {scoreChange !== null && (
                    <View className={cn(
                      "ml-2 flex-row items-center px-2 py-1 rounded-full",
                      scoreChange >= 0 ? "bg-af-success/20" : "bg-af-danger/20"
                    )}>
                      {scoreChange >= 0 ? (
                        <TrendingUp size={14} color="#22C55E" />
                      ) : (
                        <TrendingDown size={14} color="#EF4444" />
                      )}
                      <Text className={cn(
                        "text-xs font-bold ml-1",
                        scoreChange >= 0 ? "text-af-success" : "text-af-danger"
                      )}>
                        {scoreChange >= 0 ? '+' : ''}{scoreChange}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Cardio */}
              <View className="mb-4">
                <Text className="text-white/60 text-sm mb-2">Cardio</Text>
                <View className="flex-row">
                  <TextInput
                    value={cardioScore}
                    onChangeText={setCardioScore}
                    placeholder="Score"
                    placeholderTextColor="#ffffff40"
                    keyboardType="numeric"
                    className="flex-1 bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10 mr-2"
                  />
                  <TextInput
                    value={cardioTime}
                    onChangeText={setCardioTime}
                    placeholder="Time (mm:ss)"
                    placeholderTextColor="#ffffff40"
                    className="flex-1 bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10"
                  />
                </View>
              </View>

              {/* Push-ups */}
              <View className="mb-4">
                <Text className="text-white/60 text-sm mb-2">Push-ups</Text>
                <View className="flex-row">
                  <TextInput
                    value={pushupScore}
                    onChangeText={setPushupScore}
                    placeholder="Score"
                    placeholderTextColor="#ffffff40"
                    keyboardType="numeric"
                    className="flex-1 bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10 mr-2"
                  />
                  <TextInput
                    value={pushupReps}
                    onChangeText={setPushupReps}
                    placeholder="Reps"
                    placeholderTextColor="#ffffff40"
                    keyboardType="numeric"
                    className="flex-1 bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10"
                  />
                </View>
              </View>

              {/* Sit-ups */}
              <View className="mb-4">
                <Text className="text-white/60 text-sm mb-2">Sit-ups</Text>
                <View className="flex-row">
                  <TextInput
                    value={situpScore}
                    onChangeText={setSitupScore}
                    placeholder="Score"
                    placeholderTextColor="#ffffff40"
                    keyboardType="numeric"
                    className="flex-1 bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10 mr-2"
                  />
                  <TextInput
                    value={situpReps}
                    onChangeText={setSitupReps}
                    placeholder="Reps"
                    placeholderTextColor="#ffffff40"
                    keyboardType="numeric"
                    className="flex-1 bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10"
                  />
                </View>
              </View>

              {/* Waist (optional) */}
              <View className="mb-4">
                <Text className="text-white/60 text-sm mb-2">Waist (optional)</Text>
                <View className="flex-row">
                  <TextInput
                    value={waistScore}
                    onChangeText={setWaistScore}
                    placeholder="Score"
                    placeholderTextColor="#ffffff40"
                    keyboardType="numeric"
                    className="flex-1 bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10 mr-2"
                  />
                  <TextInput
                    value={waistInches}
                    onChangeText={setWaistInches}
                    placeholder="Inches"
                    placeholderTextColor="#ffffff40"
                    keyboardType="decimal-pad"
                    className="flex-1 bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10"
                  />
                </View>
              </View>

              {/* PT Requirement Notice */}
              {overallScore && (
                <View className="bg-af-accent/10 border border-af-accent/30 rounded-xl p-4 mb-4">
                  <Text className="text-af-accent font-semibold">PT Requirement Update</Text>
                  <Text className="text-af-silver text-sm mt-1">
                    Based on this score, your required PT sessions will be set to {newRequiredSessions} per week.
                  </Text>
                </View>
              )}
            </ScrollView>

            <View className="flex-row mt-4">
              <Pressable
                onPress={() => setShowConfirmation(false)}
                className="flex-1 bg-white/10 py-3 rounded-xl mr-2"
              >
                <Text className="text-white text-center font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={!overallScore}
                className={cn(
                  "flex-1 py-3 rounded-xl ml-2",
                  overallScore ? "bg-af-accent" : "bg-white/10"
                )}
              >
                <Text className={cn(
                  "text-center font-semibold",
                  overallScore ? "text-white" : "text-white/40"
                )}>Save</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Manual Entry Modal */}
      <Modal visible={showManualEntry} transparent animationType="slide">
        <View className="flex-1 bg-black/80 justify-end">
          <View className="bg-af-navy rounded-t-3xl p-6 pb-12">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-white text-xl font-bold">Manual Entry</Text>
              <Pressable
                onPress={() => setShowManualEntry(false)}
                className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
              >
                <X size={20} color="#C0C0C0" />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              <View className="mb-4">
                <Text className="text-white/60 text-sm mb-2">Overall Score *</Text>
                <TextInput
                  value={overallScore}
                  onChangeText={setOverallScore}
                  placeholder="e.g., 87"
                  placeholderTextColor="#ffffff40"
                  keyboardType="numeric"
                  className="bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10"
                />
              </View>

              <View className="mb-4">
                <Text className="text-white/60 text-sm mb-2">Cardio Score & Time</Text>
                <View className="flex-row">
                  <TextInput
                    value={cardioScore}
                    onChangeText={setCardioScore}
                    placeholder="Score"
                    placeholderTextColor="#ffffff40"
                    keyboardType="numeric"
                    className="flex-1 bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10 mr-2"
                  />
                  <TextInput
                    value={cardioTime}
                    onChangeText={setCardioTime}
                    placeholder="mm:ss"
                    placeholderTextColor="#ffffff40"
                    className="flex-1 bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10"
                  />
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-white/60 text-sm mb-2">Push-ups Score & Reps</Text>
                <View className="flex-row">
                  <TextInput
                    value={pushupScore}
                    onChangeText={setPushupScore}
                    placeholder="Score"
                    placeholderTextColor="#ffffff40"
                    keyboardType="numeric"
                    className="flex-1 bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10 mr-2"
                  />
                  <TextInput
                    value={pushupReps}
                    onChangeText={setPushupReps}
                    placeholder="Reps"
                    placeholderTextColor="#ffffff40"
                    keyboardType="numeric"
                    className="flex-1 bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10"
                  />
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-white/60 text-sm mb-2">Sit-ups Score & Reps</Text>
                <View className="flex-row">
                  <TextInput
                    value={situpScore}
                    onChangeText={setSitupScore}
                    placeholder="Score"
                    placeholderTextColor="#ffffff40"
                    keyboardType="numeric"
                    className="flex-1 bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10 mr-2"
                  />
                  <TextInput
                    value={situpReps}
                    onChangeText={setSitupReps}
                    placeholder="Reps"
                    placeholderTextColor="#ffffff40"
                    keyboardType="numeric"
                    className="flex-1 bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10"
                  />
                </View>
              </View>
            </ScrollView>

            <Pressable
              onPress={() => {
                setShowManualEntry(false);
                setShowConfirmation(true);
              }}
              disabled={!overallScore}
              className={cn(
                "py-4 rounded-xl mt-4",
                overallScore ? "bg-af-accent" : "bg-white/10"
              )}
            >
              <Text className={cn(
                "text-center font-bold",
                overallScore ? "text-white" : "text-white/40"
              )}>Continue</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
