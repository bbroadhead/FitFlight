import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Check, X, TrendingDown, TrendingUp } from 'lucide-react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { cn } from '@/lib/cn';
import { useAuthStore, useMemberStore, type FitnessAssessment } from '@/lib/store';
import { type Gender } from '@/lib/pfraScoring2026';
import { savePFRARecord } from '@/lib/supabaseData';

type CardioTest = 'run_2mile' | 'hamr_20m' | 'walk_2k';
type StrengthTest = 'pushups' | 'hand_release_pushups';
type CoreTest = 'situps' | 'cross_leg_reverse_crunch' | 'plank';

const SEGMENT = "flex-1 rounded-xl px-3 py-3 items-center justify-center";

function ExemptToggle({ checked, onPress }: { checked: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
      <View className="h-4 w-4 items-center justify-center rounded border border-white/40 bg-white/5">
        {checked ? <Check size={12} color="#FFFFFF" /> : null}
      </View>
      <Text className="text-xs font-semibold uppercase tracking-[0.4px] text-white/75">Exempt</Text>
    </Pressable>
  );
}

export default function UploadFitnessTrackerScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const members = useMemberStore((s) => s.members);
  const updateMember = useMemberStore((s) => s.updateMember);
  const awardAchievement = useMemberStore((s) => s.awardAchievement);

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [overallScore, setOverallScore] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [ageYears, setAgeYears] = useState('34');
  const [waistScore, setWaistScore] = useState('');
  const [waistValue, setWaistValue] = useState('');
  const [waistExempt, setWaistExempt] = useState(false);

  const [cardioTest, setCardioTest] = useState<CardioTest>('run_2mile');
  const [cardioScore, setCardioScore] = useState('');
  const [cardioValue, setCardioValue] = useState('');
  const [cardioExempt, setCardioExempt] = useState(false);

  const [strengthTest, setStrengthTest] = useState<StrengthTest>('pushups');
  const [strengthScore, setStrengthScore] = useState('');
  const [strengthValue, setStrengthValue] = useState('');
  const [strengthExempt, setStrengthExempt] = useState(false);

  const [coreTest, setCoreTest] = useState<CoreTest>('situps');
  const [coreScore, setCoreScore] = useState('');
  const [coreValue, setCoreValue] = useState('');
  const [coreExempt, setCoreExempt] = useState(false);

  const currentMember = user ? members.find((m) => m.id === user.id) : null;
  const previousAssessment = currentMember?.fitnessAssessments[currentMember.fitnessAssessments.length - 1];

  const scoreChange = previousAssessment && overallScore
    ? parseInt(overallScore, 10) - previousAssessment.overallScore
    : null;

  const cardioLabel = cardioTest === 'run_2mile' ? 'Time (mm:ss)' : cardioTest === 'hamr_20m' ? 'Shuttles' : 'Walk Time (mm:ss)';
  const strengthLabel = strengthTest === 'pushups' ? 'Reps' : 'Reps';
  const coreLabel = coreTest === 'plank' ? 'Time (mm:ss)' : 'Reps';

  const canSubmit = Boolean(
    overallScore &&
    (cardioExempt || (cardioScore && cardioValue)) &&
    (strengthExempt || (strengthScore && strengthValue)) &&
    (coreExempt || (coreScore && coreValue)) &&
    (waistExempt || (waistScore && waistValue))
  );

  const handleSubmit = () => {
    const run = async () => {
      if (!user || !overallScore || !currentMember) return;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const score = parseFloat(overallScore) || 0;
      const assessment: FitnessAssessment = {
        id: `pfra-${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        overallScore: score,
        components: {
          cardio: cardioTest === 'hamr_20m'
            ? { score: parseFloat(cardioScore) || 0, laps: parseInt(cardioValue, 10) || 0, test: '20m HAMR', exempt: cardioExempt }
            : { score: parseFloat(cardioScore) || 0, time: cardioValue || undefined, test: cardioTest === 'run_2mile' ? '2-mile Run' : '2K Walk', exempt: cardioExempt },
          pushups: {
            score: parseFloat(strengthScore) || 0,
            reps: parseInt(strengthValue, 10) || 0,
            test: strengthTest === 'pushups' ? 'Push-ups' : 'Hand-release Push-ups',
            exempt: strengthExempt,
          },
          situps: {
            score: parseFloat(coreScore) || 0,
            reps: coreTest === 'plank' ? 0 : parseInt(coreValue, 10) || 0,
            time: coreTest === 'plank' ? coreValue || undefined : undefined,
            test: coreTest === 'situps' ? 'Sit-ups' : coreTest === 'cross_leg_reverse_crunch' ? 'Cross-leg Reverse Crunch' : 'Plank',
            exempt: coreExempt,
          },
          waist: {
            score: parseFloat(waistScore) || 0,
            inches: parseFloat(waistValue) || 0,
            exempt: waistExempt,
          },
        },
        isPrivate: false,
      };

      if (accessToken) {
        await savePFRARecord({
          memberId: user.id,
          memberEmail: user.email,
          squadron: user.squadron,
          assessment,
          accessToken,
        });
      }

      updateMember(user.id, {
        fitnessAssessments: [
          ...currentMember.fitnessAssessments,
          assessment,
        ],
      });

      if (score >= 90) {
        awardAchievement(user.id, 'excellent_fa');
      }
      if (score === 100) {
        awardAchievement(user.id, 'perfect_fa');
      }

      router.back();
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
        <Animated.View entering={FadeInDown.delay(100).springify()} className="px-6 pt-4 pb-2 flex-row items-center">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            className="w-10 h-10 bg-white/10 rounded-full items-center justify-center mr-4"
          >
            <ChevronLeft size={24} color="#C0C0C0" />
          </Pressable>
          <Text className="text-white text-xl font-bold">Add Manual PFRA</Text>
        </Animated.View>

        <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {previousAssessment && (
            <Animated.View entering={FadeInDown.delay(125).springify()} className="mt-4 p-4 bg-white/5 rounded-2xl border border-white/10">
              <Text className="text-white/60 text-sm mb-3">Previous PFRA ({previousAssessment.date})</Text>
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
            </Animated.View>
          )}

          <Animated.View entering={FadeInDown.delay(150).springify()} className="mt-4 bg-white/5 rounded-2xl border border-white/10 p-5">
            <Text className="text-white font-semibold text-lg mb-4">Overall</Text>
            <Text className="text-white/60 text-sm mb-2">Overall Score *</Text>
            <View className="flex-row items-center">
              <TextInput
                value={overallScore}
                onChangeText={setOverallScore}
                placeholder="e.g., 87.5"
                placeholderTextColor="#ffffff40"
                keyboardType="decimal-pad"
                className="flex-1 bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10"
              />
              {scoreChange !== null ? (
                <View className={cn(
                  "ml-2 flex-row items-center px-2 py-1 rounded-full",
                  scoreChange >= 0 ? "bg-af-success/20" : "bg-af-danger/20"
                )}>
                  {scoreChange >= 0 ? <TrendingUp size={14} color="#22C55E" /> : <TrendingDown size={14} color="#EF4444" />}
                  <Text className={cn("text-xs font-bold ml-1", scoreChange >= 0 ? "text-af-success" : "text-af-danger")}>
                    {scoreChange >= 0 ? '+' : ''}{scoreChange}
                  </Text>
                </View>
              ) : null}
            </View>
            <View className="mt-4 flex-row" style={{ gap: 12 }}>
              <View className="flex-1">
                <Text className="text-white/60 text-sm mb-2">Age</Text>
                <TextInput
                  value={ageYears}
                  onChangeText={setAgeYears}
                  keyboardType="numeric"
                  className="bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10"
                />
              </View>
              <View className="flex-1">
                <Text className="text-white/60 text-sm mb-2">Gender</Text>
                <View className="rounded-xl bg-white/10 border border-white/10 flex-row p-1">
                  <Pressable onPress={() => setGender('male')} className={cn(SEGMENT, gender === 'male' ? 'bg-af-accent' : '')}>
                    <Text className={cn("font-semibold", gender === 'male' ? 'text-white' : 'text-af-silver')}>Male</Text>
                  </Pressable>
                  <Pressable onPress={() => setGender('female')} className={cn(SEGMENT, gender === 'female' ? 'bg-af-accent' : '')}>
                    <Text className={cn("font-semibold", gender === 'female' ? 'text-white' : 'text-af-silver')}>Female</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(175).springify()} className="mt-4 bg-white/5 rounded-2xl border border-white/10 p-5">
            <View className="mb-4 flex-row items-center justify-between gap-3">
              <Text className="text-white font-semibold text-lg">Body Composition</Text>
              <ExemptToggle checked={waistExempt} onPress={() => setWaistExempt((current) => !current)} />
            </View>
            <View className="flex-row" style={{ gap: 12 }}>
              <View className="flex-1">
                <Text className="text-white/60 text-sm mb-2">Score *</Text>
                <TextInput value={waistScore} onChangeText={setWaistScore} editable={!waistExempt} keyboardType="decimal-pad" placeholder={waistExempt ? 'Exempt' : '0-20'} placeholderTextColor="#ffffff40" className={cn("bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10", waistExempt && "opacity-50")} />
              </View>
              <View className="flex-1">
                <Text className="text-white/60 text-sm mb-2">Waist (inches) *</Text>
                <TextInput value={waistValue} onChangeText={setWaistValue} editable={!waistExempt} keyboardType="decimal-pad" placeholder={waistExempt ? 'Exempt' : '33.0'} placeholderTextColor="#ffffff40" className={cn("bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10", waistExempt && "opacity-50")} />
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).springify()} className="mt-4 bg-white/5 rounded-2xl border border-white/10 p-5">
            <View className="mb-4 flex-row items-center justify-between gap-3">
              <Text className="text-white font-semibold text-lg">Cardio</Text>
              <ExemptToggle checked={cardioExempt} onPress={() => setCardioExempt((current) => !current)} />
            </View>
            <View className="rounded-xl bg-white/10 border border-white/10 flex-row p-1 mb-4">
              <Pressable onPress={() => setCardioTest('run_2mile')} className={cn(SEGMENT, cardioTest === 'run_2mile' ? 'bg-af-accent' : '')}><Text className={cn("text-xs font-semibold", cardioTest === 'run_2mile' ? 'text-white' : 'text-af-silver')}>2-mile Run</Text></Pressable>
              <Pressable onPress={() => setCardioTest('hamr_20m')} className={cn(SEGMENT, cardioTest === 'hamr_20m' ? 'bg-af-accent' : '')}><Text className={cn("text-xs font-semibold", cardioTest === 'hamr_20m' ? 'text-white' : 'text-af-silver')}>HAMR</Text></Pressable>
              <Pressable onPress={() => setCardioTest('walk_2k')} className={cn(SEGMENT, cardioTest === 'walk_2k' ? 'bg-af-accent' : '')}><Text className={cn("text-xs font-semibold", cardioTest === 'walk_2k' ? 'text-white' : 'text-af-silver')}>2km Walk</Text></Pressable>
            </View>
            <View className="flex-row" style={{ gap: 12 }}>
              <View className="flex-1">
                <Text className="text-white/60 text-sm mb-2">Score *</Text>
                <TextInput value={cardioScore} onChangeText={setCardioScore} editable={!cardioExempt} keyboardType="decimal-pad" placeholder={cardioExempt ? 'Exempt' : cardioTest === 'walk_2k' ? '0 or 50' : '0-50'} placeholderTextColor="#ffffff40" className={cn("bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10", cardioExempt && "opacity-50")} />
              </View>
              <View className="flex-1">
                <Text className="text-white/60 text-sm mb-2">{cardioLabel} *</Text>
                <TextInput value={cardioValue} onChangeText={setCardioValue} editable={!cardioExempt} keyboardType={cardioTest === 'hamr_20m' ? 'numeric' : 'numbers-and-punctuation'} placeholder={cardioExempt ? 'Exempt' : cardioTest === 'hamr_20m' ? '58' : '11:30'} placeholderTextColor="#ffffff40" className={cn("bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10", cardioExempt && "opacity-50")} />
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(225).springify()} className="mt-4 bg-white/5 rounded-2xl border border-white/10 p-5">
            <View className="mb-4 flex-row items-center justify-between gap-3">
              <Text className="text-white font-semibold text-lg">Strength</Text>
              <ExemptToggle checked={strengthExempt} onPress={() => setStrengthExempt((current) => !current)} />
            </View>
            <View className="rounded-xl bg-white/10 border border-white/10 flex-row p-1 mb-4">
              <Pressable onPress={() => setStrengthTest('pushups')} className={cn(SEGMENT, strengthTest === 'pushups' ? 'bg-af-accent' : '')}><Text className={cn("text-sm font-semibold", strengthTest === 'pushups' ? 'text-white' : 'text-af-silver')}>Push-ups</Text></Pressable>
              <Pressable onPress={() => setStrengthTest('hand_release_pushups')} className={cn(SEGMENT, strengthTest === 'hand_release_pushups' ? 'bg-af-accent' : '')}><Text className={cn("text-sm font-semibold", strengthTest === 'hand_release_pushups' ? 'text-white' : 'text-af-silver')}>Hand-release</Text></Pressable>
            </View>
            <View className="flex-row" style={{ gap: 12 }}>
              <View className="flex-1">
                <Text className="text-white/60 text-sm mb-2">Score *</Text>
                <TextInput value={strengthScore} onChangeText={setStrengthScore} editable={!strengthExempt} keyboardType="decimal-pad" placeholder={strengthExempt ? 'Exempt' : '0-15'} placeholderTextColor="#ffffff40" className={cn("bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10", strengthExempt && "opacity-50")} />
              </View>
              <View className="flex-1">
                <Text className="text-white/60 text-sm mb-2">{strengthLabel} *</Text>
                <TextInput value={strengthValue} onChangeText={setStrengthValue} editable={!strengthExempt} keyboardType="numeric" placeholder={strengthExempt ? 'Exempt' : '45'} placeholderTextColor="#ffffff40" className={cn("bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10", strengthExempt && "opacity-50")} />
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(250).springify()} className="mt-4 bg-white/5 rounded-2xl border border-white/10 p-5">
            <View className="mb-4 flex-row items-center justify-between gap-3">
              <Text className="text-white font-semibold text-lg">Core</Text>
              <ExemptToggle checked={coreExempt} onPress={() => setCoreExempt((current) => !current)} />
            </View>
            <View className="rounded-xl bg-white/10 border border-white/10 flex-row p-1 mb-4">
              <Pressable onPress={() => setCoreTest('situps')} className={cn(SEGMENT, coreTest === 'situps' ? 'bg-af-accent' : '')}><Text className={cn("text-xs font-semibold", coreTest === 'situps' ? 'text-white' : 'text-af-silver')}>Sit-ups</Text></Pressable>
              <Pressable onPress={() => setCoreTest('cross_leg_reverse_crunch')} className={cn(SEGMENT, coreTest === 'cross_leg_reverse_crunch' ? 'bg-af-accent' : '')}><Text className={cn("text-xs font-semibold", coreTest === 'cross_leg_reverse_crunch' ? 'text-white' : 'text-af-silver')}>Cross-leg</Text></Pressable>
              <Pressable onPress={() => setCoreTest('plank')} className={cn(SEGMENT, coreTest === 'plank' ? 'bg-af-accent' : '')}><Text className={cn("text-xs font-semibold", coreTest === 'plank' ? 'text-white' : 'text-af-silver')}>Plank</Text></Pressable>
            </View>
            <View className="flex-row" style={{ gap: 12 }}>
              <View className="flex-1">
                <Text className="text-white/60 text-sm mb-2">Score *</Text>
                <TextInput value={coreScore} onChangeText={setCoreScore} editable={!coreExempt} keyboardType="decimal-pad" placeholder={coreExempt ? 'Exempt' : '0-15'} placeholderTextColor="#ffffff40" className={cn("bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10", coreExempt && "opacity-50")} />
              </View>
              <View className="flex-1">
                <Text className="text-white/60 text-sm mb-2">{coreLabel} *</Text>
                <TextInput value={coreValue} onChangeText={setCoreValue} editable={!coreExempt} keyboardType={coreTest === 'plank' ? 'numbers-and-punctuation' : 'numeric'} placeholder={coreExempt ? 'Exempt' : coreTest === 'plank' ? '3:30' : '50'} placeholderTextColor="#ffffff40" className={cn("bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10", coreExempt && "opacity-50")} />
              </View>
            </View>
          </Animated.View>

          {overallScore ? (
            <Animated.View entering={FadeInDown.delay(275).springify()} className="mt-4 bg-af-accent/10 border border-af-accent/30 rounded-2xl p-4">
              <Text className="text-af-accent font-semibold">FitFlight Record</Text>
              <Text className="text-af-silver text-sm mt-1">
                This saves the PFRA to your FitFlight account only. It does not change required PT sessions.
              </Text>
            </Animated.View>
          ) : null}

          <Animated.View entering={FadeInDown.delay(300).springify()} className="mt-6">
            <Pressable
              onPress={() => canSubmit && setShowConfirmation(true)}
              disabled={!canSubmit}
              className={cn("py-4 rounded-xl", canSubmit ? "bg-af-accent" : "bg-white/10")}
            >
              <Text className={cn("text-center font-bold", canSubmit ? "text-white" : "text-white/40")}>Review PFRA</Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      <Modal visible={showConfirmation} transparent animationType="fade">
        <View className="flex-1 bg-black/80 justify-center items-center p-6">
          <Animated.View entering={ZoomIn.duration(300)} className="bg-af-navy rounded-3xl p-6 w-full max-w-sm border border-white/20">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-white text-xl font-bold">Confirm PFRA</Text>
              <Pressable onPress={() => setShowConfirmation(false)} className="w-8 h-8 bg-white/10 rounded-full items-center justify-center">
                <X size={20} color="#C0C0C0" />
              </Pressable>
            </View>

            <View className="bg-white/5 rounded-xl p-4">
              <View className="flex-row justify-between mb-2">
                <Text className="text-af-silver">Overall Score</Text>
                <Text className="text-white font-semibold">{overallScore}</Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-af-silver">Cardio</Text>
                <Text className="text-white font-semibold">{cardioScore} · {cardioValue}</Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-af-silver">Strength</Text>
                <Text className="text-white font-semibold">{strengthScore} · {strengthValue}</Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-af-silver">Core</Text>
                <Text className="text-white font-semibold">{coreScore} · {coreValue}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-af-silver">WHtR</Text>
                <Text className="text-white font-semibold">{waistScore} · {waistValue} in</Text>
              </View>
            </View>

            <View className="flex-row mt-4">
              <Pressable onPress={() => setShowConfirmation(false)} className="flex-1 bg-white/10 py-3 rounded-xl mr-2">
                <Text className="text-white text-center font-semibold">Edit</Text>
              </Pressable>
              <Pressable onPress={handleSubmit} className="flex-1 bg-af-accent py-3 rounded-xl ml-2">
                <Text className="text-white text-center font-semibold">Save PFRA</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}
