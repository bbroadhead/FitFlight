import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import SmartSlider from '@/components/SmartSlider';
import { cn } from '@/lib/cn';
import { scoreTotal, type Gender } from '@/lib/pfraScoring2026';

// Optional: this exists in your repo after the swipe/slider fix.
// If it doesn't exist for some reason, the fallback keeps the calculator working.
let useTabSwipeSafe: null | (() => { setSwipeEnabled: (v: boolean) => void }) = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useTabSwipeSafe = require('@/contexts/TabSwipeContext').useTabSwipe;
} catch {
  useTabSwipeSafe = null;
}

type CardioTest = 'run_2mile' | 'hamr_20m' | 'walk_2k';
type StrengthTest = 'pushups' | 'hand_release_pushups';
type CoreTest = 'situps' | 'cross_leg_reverse_crunch' | 'plank';

function formatMMSS(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function scoreStatus(total: number) {
  if (total >= 90) return { label: 'Excellent', color: '#22C55E' };
  if (total >= 75) return { label: 'Satisfactory', color: '#4A90D9' };
  return { label: 'Fail', color: '#EF4444' };
}

export default function CalculatorScreen() {
  const tabSwipe = useTabSwipeSafe ? useTabSwipeSafe() : null;
  const disableSwipe = () => tabSwipe?.setSwipeEnabled(false);
  const enableSwipe = () => tabSwipe?.setSwipeEnabled(true);

  const [ageYears, setAgeYears] = useState(34);
  const [gender, setGender] = useState<Gender>('male');

  const [waistIn, setWaistIn] = useState(34);
  const [heightIn, setHeightIn] = useState(70);

  const [cardioTest, setCardioTest] = useState<CardioTest>('run_2mile');
  const [strengthTest, setStrengthTest] = useState<StrengthTest>('pushups');
  const [coreTest, setCoreTest] = useState<CoreTest>('situps');

  // Component values
  const [runSec, setRunSec] = useState(16 * 60);
  const [walkSec, setWalkSec] = useState(17 * 60);
  const [hamrShuttles, setHamrShuttles] = useState(60);

  const [pushupReps, setPushupReps] = useState(40);
  const [coreReps, setCoreReps] = useState(40);
  const [plankSec, setPlankSec] = useState(120);

  const cardioValue = cardioTest === 'run_2mile' ? runSec : cardioTest === 'walk_2k' ? walkSec : hamrShuttles;
  const coreValue = coreTest === 'plank' ? plankSec : coreReps;

  const scores = useMemo(() => {
    return scoreTotal({
      ageYears,
      gender,
      waistIn,
      heightIn,
      strengthTest,
      strengthReps: pushupReps,
      coreTest,
      coreValue,
      cardioTest,
      cardioValue,
    });
  }, [ageYears, gender, waistIn, heightIn, strengthTest, pushupReps, coreTest, coreValue, cardioTest, cardioValue]);

  const status = scoreStatus(scores.total);

  return (
    <View className="flex-1">
      <LinearGradient
        colors={['#0A1628', '#001F5C', '#0A1628']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView edges={['top']} className="flex-1">
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View className="px-6 pt-4 pb-2">
            <Text className="text-white text-2xl font-bold">FA Calculator</Text>
            <Text className="text-af-silver text-sm mt-1">Air Force Fitness Assessment Score</Text>
          </View>

          {/* Total Score (circle) */}
          <View className="mx-6 mt-4 bg-white/5 rounded-2xl p-5 border border-white/10">
            <View className="items-center">
              <View
                className="w-32 h-32 rounded-full items-center justify-center border-4"
                style={{ borderColor: status.color }}
              >
                <Text className="text-white text-4xl font-bold">{scores.total.toFixed(1)}</Text>
                <Text className="text-af-silver text-sm">/ 100</Text>
              </View>

              <View className="flex-row items-center mt-4 px-4 py-2 rounded-full" style={{ backgroundColor: status.color + '20' }}>
                <Ionicons
                  name={status.label === 'Fail' ? 'alert-circle' : 'checkmark-circle'}
                  size={18}
                  color={status.color}
                />
                <Text style={{ color: status.color }} className="font-bold ml-2">
                  {status.label}
                </Text>
              </View>
            </View>

            <View className="flex-row justify-between mt-5">
              <View className="items-center">
                <Text className="text-af-silver text-xs">WHtR</Text>
                <Text className="text-white font-semibold">{scores.waist.toFixed(1)}/20</Text>
              </View>
              <View className="items-center">
                <Text className="text-af-silver text-xs">Strength</Text>
                <Text className="text-white font-semibold">{scores.strength.toFixed(1)}/15</Text>
              </View>
              <View className="items-center">
                <Text className="text-af-silver text-xs">Core</Text>
                <Text className="text-white font-semibold">{scores.core.toFixed(1)}/15</Text>
              </View>
              <View className="items-center">
                <Text className="text-af-silver text-xs">Cardio</Text>
                <Text className="text-white font-semibold">{scores.cardio.toFixed(1)}/50</Text>
              </View>
            </View>
          </View>

          {/* Profile */}
          <View className="mx-6 mt-6 bg-white/5 rounded-2xl p-5 border border-white/10">
            <Text className="text-white font-semibold text-lg mb-4">Profile</Text>

            <View className="mb-5">
              <Text className="text-af-silver text-sm mb-2">Age: {ageYears}</Text>
              <SmartSlider
                onSlidingStart={disableSwipe}
                onSlidingComplete={enableSwipe}
                value={ageYears}
                onValueChange={(v) => setAgeYears(Math.round(v as number))}
                minimumValue={17}
                maximumValue={65}
                step={1}
              />
            </View>

            <View className="mb-5">
              <Text className="text-af-silver text-sm mb-2">Gender</Text>
              <View className="flex-row bg-white/10 rounded-lg p-1">
                <Pressable onPress={() => setGender('male')} className={cn('flex-1 py-3 rounded-lg', gender === 'male' && 'bg-af-blue')}>
                  <Text className={cn('text-center font-semibold', gender === 'male' ? 'text-white' : 'text-white/60')}>Male</Text>
                </Pressable>
                <Pressable onPress={() => setGender('female')} className={cn('flex-1 py-3 rounded-lg', gender === 'female' && 'bg-af-blue')}>
                  <Text className={cn('text-center font-semibold', gender === 'female' ? 'text-white' : 'text-white/60')}>Female</Text>
                </Pressable>
              </View>
            </View>

            <View className="mb-5">
              <Text className="text-af-silver text-sm mb-2">Waist (in): {waistIn.toFixed(1)}</Text>
              <SmartSlider
                onSlidingStart={disableSwipe}
                onSlidingComplete={enableSwipe}
                value={waistIn}
                onValueChange={(v) => setWaistIn(Number(v))}
                minimumValue={20}
                maximumValue={60}
                step={0.5}
              />
            </View>

            <View>
              <Text className="text-af-silver text-sm mb-2">Height (in): {heightIn.toFixed(1)}</Text>
              <SmartSlider
                onSlidingStart={disableSwipe}
                onSlidingComplete={enableSwipe}
                value={heightIn}
                onValueChange={(v) => setHeightIn(Number(v))}
                minimumValue={48}
                maximumValue={84}
                step={0.5}
              />
            </View>
          </View>

          {/* Cardio */}
          <View className="mx-6 mt-6 bg-white/5 rounded-2xl p-5 border border-white/10">
            <Text className="text-white font-semibold text-lg mb-4">Cardio</Text>

            <View className="flex-row bg-white/10 rounded-lg p-1 mb-5">
              <Pressable onPress={() => setCardioTest('run_2mile')} className={cn('flex-1 py-3 rounded-lg', cardioTest === 'run_2mile' && 'bg-af-blue')}>
                <Text className={cn('text-center font-semibold', cardioTest === 'run_2mile' ? 'text-white' : 'text-white/60')}>2 mi</Text>
              </Pressable>
              <Pressable onPress={() => setCardioTest('hamr_20m')} className={cn('flex-1 py-3 rounded-lg', cardioTest === 'hamr_20m' && 'bg-af-blue')}>
                <Text className={cn('text-center font-semibold', cardioTest === 'hamr_20m' ? 'text-white' : 'text-white/60')}>HAMR</Text>
              </Pressable>
              <Pressable onPress={() => setCardioTest('walk_2k')} className={cn('flex-1 py-3 rounded-lg', cardioTest === 'walk_2k' && 'bg-af-blue')}>
                <Text className={cn('text-center font-semibold', cardioTest === 'walk_2k' ? 'text-white' : 'text-white/60')}>Walk</Text>
              </Pressable>
            </View>

            {cardioTest === 'run_2mile' && (
              <View>
                <Text className="text-af-silver text-sm mb-2">2-mile time: {formatMMSS(runSec)}</Text>
                <SmartSlider
                  onSlidingStart={disableSwipe}
                  onSlidingComplete={enableSwipe}
                  value={runSec}
                  onValueChange={(v) => setRunSec(Math.round(v as number))}
                  minimumValue={8 * 60}
                  maximumValue={30 * 60}
                  step={1}
                />
              </View>
            )}

            {cardioTest === 'walk_2k' && (
              <View>
                <Text className="text-af-silver text-sm mb-2">2K walk time: {formatMMSS(walkSec)}</Text>
                <SmartSlider
                  onSlidingStart={disableSwipe}
                  onSlidingComplete={enableSwipe}
                  value={walkSec}
                  onValueChange={(v) => setWalkSec(Math.round(v as number))}
                  minimumValue={10 * 60}
                  maximumValue={30 * 60}
                  step={1}
                />
              </View>
            )}

            {cardioTest === 'hamr_20m' && (
              <View>
                <Text className="text-af-silver text-sm mb-2">HAMR shuttles: {hamrShuttles}</Text>
                <SmartSlider
                  onSlidingStart={disableSwipe}
                  onSlidingComplete={enableSwipe}
                  value={hamrShuttles}
                  onValueChange={(v) => setHamrShuttles(Math.round(v as number))}
                  minimumValue={0}
                  maximumValue={120}
                  step={1}
                />
              </View>
            )}
          </View>

          {/* Strength */}
          <View className="mx-6 mt-6 bg-white/5 rounded-2xl p-5 border border-white/10">
            <Text className="text-white font-semibold text-lg mb-4">Strength</Text>

            <View className="flex-row bg-white/10 rounded-lg p-1 mb-5">
              <Pressable onPress={() => setStrengthTest('pushups')} className={cn('flex-1 py-3 rounded-lg', strengthTest === 'pushups' && 'bg-af-blue')}>
                <Text className={cn('text-center font-semibold', strengthTest === 'pushups' ? 'text-white' : 'text-white/60')}>Push-ups</Text>
              </Pressable>
              <Pressable onPress={() => setStrengthTest('hand_release_pushups')} className={cn('flex-1 py-3 rounded-lg', strengthTest === 'hand_release_pushups' && 'bg-af-blue')}>
                <Text className={cn('text-center font-semibold', strengthTest === 'hand_release_pushups' ? 'text-white' : 'text-white/60')}>HR Push</Text>
              </Pressable>
            </View>

            <View>
              <Text className="text-af-silver text-sm mb-2">Reps: {pushupReps}</Text>
              <SmartSlider
                onSlidingStart={disableSwipe}
                onSlidingComplete={enableSwipe}
                value={pushupReps}
                onValueChange={(v) => setPushupReps(Math.round(v as number))}
                minimumValue={0}
                maximumValue={100}
                step={1}
              />
            </View>
          </View>

          {/* Core */}
          <View className="mx-6 mt-6 bg-white/5 rounded-2xl p-5 border border-white/10">
            <Text className="text-white font-semibold text-lg mb-4">Core</Text>

            <View className="flex-row bg-white/10 rounded-lg p-1 mb-5">
              <Pressable onPress={() => setCoreTest('situps')} className={cn('flex-1 py-3 rounded-lg', coreTest === 'situps' && 'bg-af-blue')}>
                <Text className={cn('text-center font-semibold', coreTest === 'situps' ? 'text-white' : 'text-white/60')}>Sit-ups</Text>
              </Pressable>
              <Pressable onPress={() => setCoreTest('cross_leg_reverse_crunch')} className={cn('flex-1 py-3 rounded-lg', coreTest === 'cross_leg_reverse_crunch' && 'bg-af-blue')}>
                <Text className={cn('text-center font-semibold', coreTest === 'cross_leg_reverse_crunch' ? 'text-white' : 'text-white/60')}>CLRC</Text>
              </Pressable>
              <Pressable onPress={() => setCoreTest('plank')} className={cn('flex-1 py-3 rounded-lg', coreTest === 'plank' && 'bg-af-blue')}>
                <Text className={cn('text-center font-semibold', coreTest === 'plank' ? 'text-white' : 'text-white/60')}>Plank</Text>
              </Pressable>
            </View>

            {coreTest === 'plank' ? (
              <View>
                <Text className="text-af-silver text-sm mb-2">Time: {formatMMSS(plankSec)}</Text>
                <SmartSlider
                  onSlidingStart={disableSwipe}
                  onSlidingComplete={enableSwipe}
                  value={plankSec}
                  onValueChange={(v) => setPlankSec(Math.round(v as number))}
                  minimumValue={0}
                  maximumValue={300}
                  step={1}
                />
              </View>
            ) : (
              <View>
                <Text className="text-af-silver text-sm mb-2">Reps: {coreReps}</Text>
                <SmartSlider
                  onSlidingStart={disableSwipe}
                  onSlidingComplete={enableSwipe}
                  value={coreReps}
                  onValueChange={(v) => setCoreReps(Math.round(v as number))}
                  minimumValue={0}
                  maximumValue={100}
                  step={1}
                />
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
