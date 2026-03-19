import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Platform, Linking, LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { Asset } from 'expo-asset';
import * as Sharing from 'expo-sharing';
import Svg, { Circle } from 'react-native-svg';

import SmartSlider from '@/components/SmartSlider';
import {
  HAND_RELEASE_PUSHUP_ROWS,
  HAMR_20M_ROWS,
  PFRA_MINIMUM_COMPONENT_POINTS,
  PLANK_ROWS_SEC,
  PUSHUP_ROWS,
  REVERSE_CRUNCH_ROWS,
  RUN_2MILE_ROWS_SEC,
  SITUP_ROWS,
  WHtR_ROWS,
  WALK_2K_MAX_SEC,
  getPFRAAgeBracket,
  getWalkAgeBracket,
  meetsPFRAComponentMinimums,
  passesWalk2k,
  scoreTotal,
  type Gender,
} from '@/lib/pfraScoring2026';

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

type ComponentTheme = {
  color: string;
  soft: string;
  border: string;
  tint: string;
};

type ThresholdRow = { points: number; thresholds: Record<string, Record<Gender, number>> };
type TargetZone = { start: number; end: number; color: string; label: string };

const ZONE_FAIL = '#EF4444';
const ZONE_SAT = '#4A90D9';
const ZONE_EXCELLENT = '#22C55E';

const THEMES: Record<'whtR' | 'cardio' | 'strength' | 'core', ComponentTheme> = {
  whtR: { color: '#14B8A6', soft: 'rgba(20,184,166,0.14)', border: 'rgba(20,184,166,0.38)', tint: 'rgba(20,184,166,0.22)' },
  cardio: { color: '#EF4444', soft: 'rgba(239,68,68,0.14)', border: 'rgba(239,68,68,0.38)', tint: 'rgba(239,68,68,0.22)' },
  strength: { color: '#F59E0B', soft: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.38)', tint: 'rgba(245,158,11,0.22)' },
  core: { color: '#8B5CF6', soft: 'rgba(139,92,246,0.14)', border: 'rgba(139,92,246,0.38)', tint: 'rgba(139,92,246,0.22)' },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundToStep(value: number, step: number) {
  if (!step || step <= 0) return value;
  const precision = step.toString().includes('.') ? step.toString().split('.')[1].length : 0;
  const rounded = Math.round(value / step) * step;
  return Number(rounded.toFixed(precision));
}

function formatNumber(value: number, decimals = 0) {
  return decimals > 0 ? value.toFixed(decimals) : `${Math.round(value)}`;
}

function formatMMSS(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function parseMMSS(input: string): number | null {
  const cleaned = input.trim();
  if (!cleaned) return null;

  if (cleaned.includes(':')) {
    const [minsRaw, secsRaw = '0'] = cleaned.split(':');
    if (!/^\d+$/.test(minsRaw) || !/^\d+$/.test(secsRaw)) return null;
    const mins = Number(minsRaw);
    const secs = Number(secsRaw);
    if (secs >= 60) return null;
    return mins * 60 + secs;
  }

  if (!/^\d+$/.test(cleaned)) return null;

  if (cleaned.length <= 2) {
    return Number(cleaned) * 60;
  }

  const minsRaw = cleaned.slice(0, -2);
  const secsRaw = cleaned.slice(-2);
  const mins = Number(minsRaw);
  const secs = Number(secsRaw);
  if (secs >= 60) return null;
  return mins * 60 + secs;
}

function scoreStatus(total: number | null, meetsMinimums: boolean, walkPass: boolean) {
  if (total === null) {
    return walkPass
      ? { label: 'Pass', color: '#4A90D9', icon: 'checkmark-circle' as const }
      : { label: 'Fail', color: '#EF4444', icon: 'alert-circle' as const };
  }
  if (!meetsMinimums || total < 75) return { label: 'Fail', color: '#EF4444', icon: 'alert-circle' as const };
  if (total >= 90) return { label: 'Excellent', color: '#22C55E', icon: 'checkmark-circle' as const };
  return { label: 'Satisfactory', color: '#4A90D9', icon: 'checkmark-circle' as const };
}

function getThresholdForPoints(rows: readonly ThresholdRow[], ageBracket: string, gender: Gender, points: number) {
  const row = rows.find((entry) => entry.points === points);
  return row?.thresholds?.[ageBracket]?.[gender] ?? 0;
}

function makeHigherIsBetterZones(minValue: number, maxValue: number, passThreshold: number, excellentThreshold: number): TargetZone[] {
  const safeMin = Math.min(minValue, maxValue);
  const safeMax = Math.max(minValue, maxValue);
  const pass = clamp(passThreshold, safeMin, safeMax);
  const excellent = clamp(excellentThreshold, pass, safeMax);
  return [
    { start: safeMin, end: pass, color: ZONE_FAIL, label: 'Fail' },
    { start: pass, end: excellent, color: ZONE_SAT, label: 'Satisfactory' },
    { start: excellent, end: safeMax, color: ZONE_EXCELLENT, label: 'Excellent' },
  ];
}

function makeLowerIsBetterZones(minValue: number, maxValue: number, excellentThreshold: number, passThreshold: number): TargetZone[] {
  const safeMin = Math.min(minValue, maxValue);
  const safeMax = Math.max(minValue, maxValue);
  const excellent = clamp(excellentThreshold, safeMin, safeMax);
  const pass = clamp(passThreshold, excellent, safeMax);
  return [
    { start: safeMin, end: excellent, color: ZONE_EXCELLENT, label: 'Excellent' },
    { start: excellent, end: pass, color: ZONE_SAT, label: 'Satisfactory' },
    { start: pass, end: safeMax, color: ZONE_FAIL, label: 'Fail' },
  ];
}

function SliderTargetZones({ zones, min, max, currentValue }: { zones: TargetZone[]; min: number; max: number; currentValue: number; }) {
  const range = Math.max(1, max - min);
  const markerLeft = `${clamp(((currentValue - min) / range) * 100, 0, 100)}%`;

  return (
    <View className="mt-2">
      <View className="relative h-2 overflow-hidden rounded-full bg-white/10">
        {zones.map((zone, idx) => {
          const left = `${clamp(((zone.start - min) / range) * 100, 0, 100)}%`;
          const width = `${clamp(((zone.end - zone.start) / range) * 100, 0, 100)}%`;
          return (
            <View
              key={`${zone.label}-${idx}`}
              style={{ left, width, backgroundColor: zone.color, opacity: 0.9, position: 'absolute', top: 0, bottom: 0 }}
            />
          );
        })}
        <View
          style={{ position: 'absolute', left: markerLeft, top: -2, bottom: -2, width: 2, marginLeft: -1, backgroundColor: '#FFFFFF', borderRadius: 999 }}
        />
      </View>
      <View className="mt-1 flex-row items-center justify-between">
        {[...new Set(zones.map((zone) => zone.label).filter(Boolean))].map((label) => {
          const zone = zones.find((entry) => entry.label === label);
          return (
            <Text key={label} className="text-[10px] font-semibold" style={{ color: zone?.color ?? 'rgba(255,255,255,0.55)' }}>
              {label}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="mb-3 flex-row items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <Text className="text-sm text-af-silver">{label}</Text>
      <Text className="text-sm font-semibold text-white">{value}</Text>
    </View>
  );
}

function BoundNumberField({ value, onChange, min, max, step = 1, decimals = 0, className = 'min-w-[74px] px-3' }: { value: number; onChange: (next: number) => void; min: number; max: number; step?: number; decimals?: number; className?: string; }) {
  const [draft, setDraft] = useState(formatNumber(value, decimals));

  useEffect(() => {
    setDraft(formatNumber(value, decimals));
  }, [value, decimals]);

  return (
    <TextInput
      value={draft}
      onChangeText={(text) => {
        setDraft(text);
        const normalized = text.replace(/[^0-9.]/g, '');
        if (!normalized || normalized === '.') return;
        const parsed = Number(normalized);
        if (Number.isNaN(parsed)) return;
        onChange(roundToStep(clamp(parsed, min, max), step));
      }}
      onBlur={() => setDraft(formatNumber(value, decimals))}
      keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
      className={`${className} rounded-xl border border-white/15 bg-white/10 py-2 text-right text-white`}
      placeholderTextColor="rgba(255,255,255,0.45)"
    />
  );
}

function BoundTimeField({ valueSec, onChange, minSec, maxSec }: { valueSec: number; onChange: (next: number) => void; minSec: number; maxSec: number; }) {
  const [draft, setDraft] = useState(formatMMSS(valueSec));

  useEffect(() => {
    setDraft(formatMMSS(valueSec));
  }, [valueSec]);

  return (
    <TextInput
      value={draft}
      onChangeText={(text) => {
        setDraft(text);
        const parsed = parseMMSS(text);
        if (parsed === null) return;
        onChange(clamp(parsed, minSec, maxSec));
      }}
      onBlur={() => setDraft(formatMMSS(valueSec))}
      keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
      className="min-w-[88px] rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-right text-white"
      placeholder="mm:ss"
      placeholderTextColor="rgba(255,255,255,0.45)"
    />
  );
}

function LabeledSlider({ label, valueLabel, theme, children, input, zones, zoneMin, zoneMax, currentValue }: { label: string; valueLabel: string; theme: ComponentTheme; children: React.ReactNode; input: React.ReactNode; zones?: TargetZone[]; zoneMin?: number; zoneMax?: number; currentValue?: number; }) {
  return (
    <View className="mb-5">
      <View className="mb-2 flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text className="text-af-silver text-sm">{label}</Text>
          <Text style={{ color: theme.color }} className="mt-0.5 text-xs font-semibold">{valueLabel}</Text>
        </View>
        {input}
      </View>
      {children}
      {zones && zoneMin !== undefined && zoneMax !== undefined && currentValue !== undefined ? (
        <SliderTargetZones zones={zones} min={zoneMin} max={zoneMax} currentValue={currentValue} />
      ) : null}
    </View>
  );
}

function ComponentScoreBar({ label, value, max, theme, isPassFail = false, onPress }: { label: string; value: number; max: number; theme: ComponentTheme; isPassFail?: boolean; onPress?: () => void; }) {
  const widthPct = max > 0 ? `${Math.min(100, Math.max(0, (value / max) * 100))}%` : '0%';
  const labelText = isPassFail ? (value > 0 ? 'PASS' : 'FAIL') : `${value.toFixed(1)}/${max}`;

  return (
    <Pressable className="mb-2" onPress={onPress} disabled={!onPress}>
      <View pointerEvents="none">
        <Text className="mb-1 text-[11px] font-semibold uppercase tracking-[0.4px] text-white/70">{label}</Text>
        <View className="relative h-6 overflow-hidden rounded-full border border-white/10 bg-white/10">
          <View style={{ width: widthPct, backgroundColor: theme.color }} className="absolute left-0 top-0 h-full rounded-full" />
          <View className="absolute inset-0 items-center justify-center px-2">
            <Text
              className="text-[11px] font-bold text-white"
              style={{ textShadowColor: 'rgba(0,0,0,0.65)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}
            >
              {labelText}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function SegmentedOption({ selected, label, onPress, theme }: { selected: boolean; label: string; onPress: () => void; theme: ComponentTheme; }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 rounded-lg py-3"
      style={{ backgroundColor: selected ? theme.tint : 'transparent' }}
    >
      <Text className="text-center font-semibold" style={{ color: selected ? '#FFFFFF' : 'rgba(255,255,255,0.6)' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function AudioPanel() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const webAudioRef = useRef<any>(null);
  const audioModule = useMemo(() => require('../../../assets/audio/20m HAMR Audio File.m4a'), []);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const [asset] = await Asset.loadAsync(audioModule);
        if (!isMounted) return;
        setAudioUri(asset.localUri ?? asset.uri ?? null);
      } catch {
        try {
          const fallbackAsset = Asset.fromModule(audioModule);
          if (!isMounted) return;
          setAudioUri(fallbackAsset.localUri ?? fallbackAsset.uri ?? null);
        } catch {
          if (!isMounted) return;
          setAudioUri(null);
        }
      }
    })();

    return () => {
      isMounted = false;
      soundRef.current?.unloadAsync().catch(() => undefined);
      const webAudio = webAudioRef.current as HTMLAudioElement | null;
      if (webAudio) {
        webAudio.pause();
        webAudio.src = '';
      }
    };
  }, [audioModule]);

  const progressPct = durationSec > 0 ? `${Math.min(100, Math.max(0, (positionSec / durationSec) * 100))}%` : '0%';

  const handleDownload = async () => {
    try {
      const resolvedUri = audioUri ?? Asset.fromModule(audioModule).uri;
      if (!resolvedUri) return;

      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = resolvedUri;
        link.download = '20m-HAMR-Audio-File.m4a';
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      const isShareAvailable = await Sharing.isAvailableAsync();
      if (isShareAvailable) {
        await Sharing.shareAsync(resolvedUri, {
          dialogTitle: 'Download 20m HAMR Audio',
          mimeType: 'audio/mp4',
          UTI: 'public.mpeg-4-audio',
        });
      } else {
        await Linking.openURL(resolvedUri);
      }
    } catch {
      // no-op
    }
  };

  const togglePlayback = async () => {
    try {
      if (Platform.OS === 'web') {
        const webAudio = webAudioRef.current as HTMLAudioElement | null;
        if (!webAudio) return;
        if (webAudio.paused) {
          await webAudio.play();
          setIsPlaying(true);
        } else {
          webAudio.pause();
          setIsPlaying(false);
        }
        return;
      }

      if (!soundRef.current) {
        const { sound } = await Audio.Sound.createAsync(
          audioUri ? { uri: audioUri } : audioModule,
          { shouldPlay: false, progressUpdateIntervalMillis: 250 },
          (status) => {
            if (!status.isLoaded) return;
            setIsPlaying(status.isPlaying);
            setPositionSec((status.positionMillis ?? 0) / 1000);
            setDurationSec(((status.durationMillis ?? 0) / 1000) || 0);
            if (status.didJustFinish) {
              setIsPlaying(false);
              setPositionSec(0);
            }
          },
        );
        soundRef.current = sound;
      }

      const status = await soundRef.current.getStatusAsync();
      if (!status.isLoaded) return;
      setDurationSec(((status.durationMillis ?? 0) / 1000) || durationSec);
      if (status.isPlaying) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
      } else {
        await soundRef.current.playAsync();
        setIsPlaying(true);
      }
    } catch {
      setIsPlaying(false);
    }
  };

  return (
    <View className="mx-6 mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
      <Text className="mb-3 text-lg font-semibold text-white">20m HAMR Audio</Text>

      {Platform.OS === 'web' ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio
          ref={webAudioRef}
          preload="metadata"
          src={audioUri ?? undefined}
          onLoadedMetadata={(event) => {
            const audio = event.currentTarget;
            setDurationSec(Number.isFinite(audio.duration) ? audio.duration : 0);
          }}
          onTimeUpdate={(event) => {
            setPositionSec(event.currentTarget.currentTime ?? 0);
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setPositionSec(0);
          }}
          style={{ display: 'none' }}
        />
      ) : null}

      <View className="flex-row items-center gap-3">
        <Pressable onPress={togglePlayback} className="h-10 w-10 items-center justify-center rounded-full bg-white/10">
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color="#FFFFFF" />
        </Pressable>

        <View className="flex-1">
          <View className="mb-1 h-3 overflow-hidden rounded-full bg-white/10">
            <View style={{ width: progressPct }} className="h-full rounded-full bg-af-primary" />
          </View>
          <View className="flex-row items-center justify-end">
            <Text className="text-sm font-semibold text-white/90">{formatMMSS(positionSec)}/{formatMMSS(durationSec)}</Text>
          </View>
        </View>

        <Pressable onPress={handleDownload} className="h-10 w-10 items-center justify-center rounded-full bg-white/10">
          <Ionicons name="download-outline" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

export default function CalculatorScreen() {
  const scrollRef = useRef<ScrollView | null>(null);
  const sectionYRef = useRef<Record<'metrics' | 'bodycomp' | 'strength' | 'core' | 'cardio', number>>({ metrics: 0, bodycomp: 0, strength: 0, core: 0, cardio: 0 });
  const STICKY_TOTAL_OFFSET = 168;

  const setSectionY = (key: 'metrics' | 'bodycomp' | 'strength' | 'core' | 'cardio') => (event: LayoutChangeEvent) => {
    sectionYRef.current[key] = event.nativeEvent.layout.y;
  };

  const scrollToSection = (key: 'metrics' | 'bodycomp' | 'strength' | 'core' | 'cardio') => {
    const targetY = Math.max(0, (sectionYRef.current[key] ?? 0) - STICKY_TOTAL_OFFSET);
    scrollRef.current?.scrollTo({ y: targetY, animated: true });
  };

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

  const walkPass = cardioTest === 'walk_2k' ? passesWalk2k(ageYears, gender, walkSec) : false;
  const meetsMinimums = cardioTest === 'walk_2k' ? walkPass : meetsPFRAComponentMinimums(scores);
  const officialTotal = cardioTest === 'walk_2k' ? null : scores.total;
  const status = scoreStatus(officialTotal, meetsMinimums, walkPass);

  const whtrValue = heightIn > 0 ? waistIn / heightIn : 0;
  const ageBracket = getPFRAAgeBracket(ageYears);
  const walkAgeBracket = getWalkAgeBracket(ageYears);

  const waistZones = useMemo(() => makeLowerIsBetterZones(20, 60, heightIn * WHtR_ROWS[0].ratio, heightIn * WHtR_ROWS[WHtR_ROWS.length - 2].ratio), [heightIn]);

  const strengthRows = strengthTest === 'pushups' ? PUSHUP_ROWS : HAND_RELEASE_PUSHUP_ROWS;
  const strengthZones = useMemo(() => makeHigherIsBetterZones(0, 100, getThresholdForPoints(strengthRows as readonly ThresholdRow[], ageBracket, gender, PFRA_MINIMUM_COMPONENT_POINTS.strength), getThresholdForPoints(strengthRows as readonly ThresholdRow[], ageBracket, gender, 15)), [strengthRows, ageBracket, gender]);

  const coreRows = coreTest === 'situps' ? SITUP_ROWS : coreTest === 'cross_leg_reverse_crunch' ? REVERSE_CRUNCH_ROWS : PLANK_ROWS_SEC;
  const coreMax = coreTest === 'plank' ? 300 : 100;
  const coreZones = useMemo(() => makeHigherIsBetterZones(0, coreMax, getThresholdForPoints(coreRows as readonly ThresholdRow[], ageBracket, gender, PFRA_MINIMUM_COMPONENT_POINTS.core), getThresholdForPoints(coreRows as readonly ThresholdRow[], ageBracket, gender, 15)), [coreRows, coreMax, ageBracket, gender]);

  const runZones = useMemo(() => makeLowerIsBetterZones(8 * 60, 30 * 60, getThresholdForPoints(RUN_2MILE_ROWS_SEC as readonly ThresholdRow[], ageBracket, gender, 50), getThresholdForPoints(RUN_2MILE_ROWS_SEC as readonly ThresholdRow[], ageBracket, gender, PFRA_MINIMUM_COMPONENT_POINTS.cardio)), [ageBracket, gender]);
  const hamrZones = useMemo(() => makeHigherIsBetterZones(0, 120, getThresholdForPoints(HAMR_20M_ROWS as readonly ThresholdRow[], ageBracket, gender, PFRA_MINIMUM_COMPONENT_POINTS.cardio), getThresholdForPoints(HAMR_20M_ROWS as readonly ThresholdRow[], ageBracket, gender, 50)), [ageBracket, gender]);
  const walkPassThreshold = useMemo(() => {
    const row = WALK_2K_MAX_SEC.find((entry) => entry.bracket === walkAgeBracket);
    return gender === 'male' ? (row?.male_max ?? 0) : (row?.female_max ?? 0);
  }, [walkAgeBracket, gender]);
  const walkZones = useMemo(() => [
    { start: 10 * 60, end: walkPassThreshold, color: ZONE_SAT, label: 'Pass' },
    { start: walkPassThreshold, end: 30 * 60, color: ZONE_FAIL, label: 'Fail' },
  ] as TargetZone[], [walkPassThreshold]);

  const circleSize = 110;
  const strokeWidth = 9;
  const radius = (circleSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = officialTotal === null ? 0 : clamp(officialTotal / 100, 0, 1);
  const dashOffset = circumference * (1 - progress);

  return (
    <View className="flex-1">
      <LinearGradient
        colors={['#0A1628', '#001F5C', '#0A1628']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView edges={['top']} className="flex-1">
        <ScrollView ref={scrollRef} className="flex-1" contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]}>
          <View className="px-6 pt-4 pb-2">
            <Text className="text-2xl font-bold text-white">PFRA Calculator</Text>
            <Text className="mt-1 text-sm text-af-silver">Based on PFRA Scoring Charts released on 1 MAR 2026</Text>
          </View>

          <View className="px-6 pt-2 pb-2">
            <View className="rounded-2xl border border-white/10 bg-[#10233E]/95 px-4 py-4">
              <View className="flex-row items-center gap-4">
                <View className="w-[126px] items-center justify-center">
                  <View style={{ width: circleSize, height: circleSize }} className="items-center justify-center">
                    <Svg width={circleSize} height={circleSize} style={{ position: 'absolute' }}>
                      <Circle cx={circleSize / 2} cy={circleSize / 2} r={radius} stroke="rgba(255,255,255,0.12)" strokeWidth={strokeWidth} fill="none" />
                      <Circle
                        cx={circleSize / 2}
                        cy={circleSize / 2}
                        r={radius}
                        stroke={status.color}
                        strokeWidth={strokeWidth}
                        fill="none"
                        strokeDasharray={`${circumference} ${circumference}`}
                        strokeDashoffset={dashOffset}
                        strokeLinecap="round"
                        originX={circleSize / 2}
                        originY={circleSize / 2}
                        rotation={-90}
                      />
                    </Svg>
                    <View className="items-center justify-center rounded-full px-3 py-2" style={{ minWidth: 74, backgroundColor: 'rgba(10,22,40,0.72)' }}>
                      <Text className="text-3xl font-bold" style={{ color: officialTotal === null ? '#FFFFFF' : status.color }}>
                        {officialTotal === null ? '--' : officialTotal.toFixed(1)}
                      </Text>
                      <Text className="text-xs text-af-silver">{officialTotal === null ? (walkPass ? 'Walk pass' : 'Walk fail') : '/ 100'}</Text>
                    </View>
                  </View>
                  <View className="mt-2 flex-row items-center rounded-full px-3 py-1.5" style={{ backgroundColor: `${status.color}20` }}>
                    <Ionicons name={status.icon} size={15} color={status.color} />
                    <Text style={{ color: status.color }} className="ml-2 text-xs font-bold">{status.label}</Text>
                  </View>
                </View>

                <View className="flex-1">
                  <ComponentScoreBar label="WHtR" value={scores.waist} max={20} theme={THEMES.whtR} onPress={() => scrollToSection('bodycomp')} />
                  <ComponentScoreBar label="Strength" value={scores.strength} max={15} theme={THEMES.strength} onPress={() => scrollToSection('strength')} />
                  <ComponentScoreBar label="Core" value={scores.core} max={15} theme={THEMES.core} onPress={() => scrollToSection('core')} />
                  <ComponentScoreBar label="Cardio" value={cardioTest === 'walk_2k' ? (walkPass ? 50 : 0) : scores.cardio} max={50} theme={THEMES.cardio} isPassFail={cardioTest === 'walk_2k'} onPress={() => scrollToSection('cardio')} />
                </View>
              </View>
            </View>
          </View>

          <AudioPanel />

          <View onLayout={setSectionY('metrics')} className="mx-6 mt-6 rounded-2xl border p-5" style={{ backgroundColor: THEMES.whtR.soft, borderColor: THEMES.whtR.border }}>
            <Text className="mb-4 text-lg font-semibold text-white">Metrics</Text>

            <LabeledSlider label="Age" valueLabel={`${ageYears} years`} theme={THEMES.whtR} input={<BoundNumberField value={ageYears} onChange={(v) => setAgeYears(Math.round(v))} min={17} max={65} step={1} />}>
              <SmartSlider onSlidingStart={disableSwipe} onSlidingComplete={enableSwipe} value={ageYears} onValueChange={(v) => setAgeYears(Math.round(v as number))} minimumValue={17} maximumValue={65} step={1} />
            </LabeledSlider>

            <View className="rounded-lg bg-white/10 p-1 flex-row">
              <SegmentedOption selected={gender === 'male'} label="Male" onPress={() => setGender('male')} theme={THEMES.whtR} />
              <SegmentedOption selected={gender === 'female'} label="Female" onPress={() => setGender('female')} theme={THEMES.whtR} />
            </View>
          </View>

          <View onLayout={setSectionY('bodycomp')} className="mx-6 mt-6 rounded-2xl border p-5" style={{ backgroundColor: THEMES.whtR.soft, borderColor: THEMES.whtR.border }}>
            <View className="mb-4 flex-row items-center justify-between">
              <View>
                <Text className="text-lg font-semibold text-white">Body Composition</Text>
                <Text className="mt-1 text-xs text-white/60">Waist, height, and WHtR update together in real time.</Text>
              </View>
              <View className="rounded-full px-3 py-1" style={{ backgroundColor: THEMES.whtR.tint }}>
                <Text className="text-[11px] font-bold uppercase tracking-[0.4px]" style={{ color: THEMES.whtR.color }}>WHtR Focus</Text>
              </View>
            </View>

            <MetricRow label="WHtR" value={whtrValue.toFixed(2)} />

            <LabeledSlider label="Waist" valueLabel={`${waistIn.toFixed(1)} in • score ${scores.waist.toFixed(1)}/20`} theme={THEMES.whtR} input={<BoundNumberField value={waistIn} onChange={setWaistIn} min={20} max={60} step={0.5} decimals={1} className="min-w-[64px] px-2.5" />} zones={waistZones} zoneMin={20} zoneMax={60} currentValue={waistIn}>
              <SmartSlider onSlidingStart={disableSwipe} onSlidingComplete={enableSwipe} value={waistIn} onValueChange={(v) => setWaistIn(Number(v))} minimumValue={20} maximumValue={60} step={0.5} />
            </LabeledSlider>

            <LabeledSlider label="Height" valueLabel={`${heightIn.toFixed(1)} in`} theme={THEMES.whtR} input={<BoundNumberField value={heightIn} onChange={setHeightIn} min={48} max={84} step={0.5} decimals={1} className="min-w-[68px] px-2.5" />}>
              <SmartSlider onSlidingStart={disableSwipe} onSlidingComplete={enableSwipe} value={heightIn} onValueChange={(v) => setHeightIn(Number(v))} minimumValue={48} maximumValue={84} step={0.5} />
            </LabeledSlider>
          </View>

          <View onLayout={setSectionY('strength')} className="mx-6 mt-6 rounded-2xl border p-5" style={{ backgroundColor: THEMES.strength.soft, borderColor: THEMES.strength.border }}>
            <Text className="mb-4 text-lg font-semibold text-white">Strength</Text>

            <View className="mb-5 rounded-lg bg-white/10 p-1 flex-row">
              <SegmentedOption selected={strengthTest === 'pushups'} label="Push-ups" onPress={() => setStrengthTest('pushups')} theme={THEMES.strength} />
              <SegmentedOption selected={strengthTest === 'hand_release_pushups'} label="Hand-release" onPress={() => setStrengthTest('hand_release_pushups')} theme={THEMES.strength} />
            </View>

            <LabeledSlider label="Reps" valueLabel={`${pushupReps} reps`} theme={THEMES.strength} input={<BoundNumberField value={pushupReps} onChange={(v) => setPushupReps(Math.round(v))} min={0} max={100} step={1} />} zones={strengthZones} zoneMin={0} zoneMax={100} currentValue={pushupReps}>
              <SmartSlider onSlidingStart={disableSwipe} onSlidingComplete={enableSwipe} value={pushupReps} onValueChange={(v) => setPushupReps(Math.round(v as number))} minimumValue={0} maximumValue={100} step={1} />
            </LabeledSlider>
          </View>

          <View onLayout={setSectionY('core')} className="mx-6 mt-6 rounded-2xl border p-5" style={{ backgroundColor: THEMES.core.soft, borderColor: THEMES.core.border }}>
            <Text className="mb-4 text-lg font-semibold text-white">Core</Text>

            <View className="mb-5 rounded-lg bg-white/10 p-1 flex-row">
              <SegmentedOption selected={coreTest === 'situps'} label="Sit-ups" onPress={() => setCoreTest('situps')} theme={THEMES.core} />
              <SegmentedOption selected={coreTest === 'cross_leg_reverse_crunch'} label="Cross-leg" onPress={() => setCoreTest('cross_leg_reverse_crunch')} theme={THEMES.core} />
              <SegmentedOption selected={coreTest === 'plank'} label="Plank" onPress={() => setCoreTest('plank')} theme={THEMES.core} />
            </View>

            {coreTest === 'plank' ? (
              <LabeledSlider label="Time" valueLabel={formatMMSS(plankSec)} theme={THEMES.core} input={<BoundTimeField valueSec={plankSec} onChange={setPlankSec} minSec={0} maxSec={300} />} zones={coreZones} zoneMin={0} zoneMax={300} currentValue={plankSec}>
                <SmartSlider onSlidingStart={disableSwipe} onSlidingComplete={enableSwipe} value={plankSec} onValueChange={(v) => setPlankSec(Math.round(v as number))} minimumValue={0} maximumValue={300} step={1} />
              </LabeledSlider>
            ) : (
              <LabeledSlider label="Reps" valueLabel={`${coreReps} reps`} theme={THEMES.core} input={<BoundNumberField value={coreReps} onChange={(v) => setCoreReps(Math.round(v))} min={0} max={100} step={1} />} zones={coreZones} zoneMin={0} zoneMax={100} currentValue={coreReps}>
                <SmartSlider onSlidingStart={disableSwipe} onSlidingComplete={enableSwipe} value={coreReps} onValueChange={(v) => setCoreReps(Math.round(v as number))} minimumValue={0} maximumValue={100} step={1} />
              </LabeledSlider>
            )}
          </View>

          <View onLayout={setSectionY('cardio')} className="mx-6 mt-6 rounded-2xl border p-5" style={{ backgroundColor: THEMES.cardio.soft, borderColor: THEMES.cardio.border }}>
            <Text className="mb-4 text-lg font-semibold text-white">Cardio</Text>

            <View className="mb-5 rounded-lg bg-white/10 p-1 flex-row">
              <SegmentedOption selected={cardioTest === 'run_2mile'} label="2-mile Run" onPress={() => setCardioTest('run_2mile')} theme={THEMES.cardio} />
              <SegmentedOption selected={cardioTest === 'hamr_20m'} label="HAMR" onPress={() => setCardioTest('hamr_20m')} theme={THEMES.cardio} />
              <SegmentedOption selected={cardioTest === 'walk_2k'} label="2km Walk" onPress={() => setCardioTest('walk_2k')} theme={THEMES.cardio} />
            </View>

            {cardioTest === 'run_2mile' && (
              <LabeledSlider label="2-mile time" valueLabel={formatMMSS(runSec)} theme={THEMES.cardio} input={<BoundTimeField valueSec={runSec} onChange={setRunSec} minSec={8 * 60} maxSec={30 * 60} />} zones={runZones} zoneMin={8 * 60} zoneMax={30 * 60} currentValue={runSec}>
                <SmartSlider onSlidingStart={disableSwipe} onSlidingComplete={enableSwipe} value={runSec} onValueChange={(v) => setRunSec(Math.round(v as number))} minimumValue={8 * 60} maximumValue={30 * 60} step={1} />
              </LabeledSlider>
            )}

            {cardioTest === 'walk_2k' && (
              <LabeledSlider label="2K walk maximum time" valueLabel={`${formatMMSS(walkSec)} • pass/fail only`} theme={THEMES.cardio} input={<BoundTimeField valueSec={walkSec} onChange={setWalkSec} minSec={10 * 60} maxSec={30 * 60} />} zones={walkZones} zoneMin={10 * 60} zoneMax={30 * 60} currentValue={walkSec}>
                <SmartSlider onSlidingStart={disableSwipe} onSlidingComplete={enableSwipe} value={walkSec} onValueChange={(v) => setWalkSec(Math.round(v as number))} minimumValue={10 * 60} maximumValue={30 * 60} step={1} />
              </LabeledSlider>
            )}

            {cardioTest === 'hamr_20m' && (
              <LabeledSlider label="HAMR shuttles" valueLabel={`${hamrShuttles} shuttles`} theme={THEMES.cardio} input={<BoundNumberField value={hamrShuttles} onChange={(v) => setHamrShuttles(Math.round(v))} min={0} max={120} step={1} />} zones={hamrZones} zoneMin={0} zoneMax={120} currentValue={hamrShuttles}>
                <SmartSlider onSlidingStart={disableSwipe} onSlidingComplete={enableSwipe} value={hamrShuttles} onValueChange={(v) => setHamrShuttles(Math.round(v as number))} minimumValue={0} maximumValue={120} step={1} />
              </LabeledSlider>
            )}
          </View>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
