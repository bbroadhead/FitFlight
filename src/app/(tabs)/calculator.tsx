import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Platform, Linking, LayoutChangeEvent, useWindowDimensions, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Audio } from 'expo-av';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import Svg, { Circle } from 'react-native-svg';
import { Buffer } from 'buffer';

import SmartSlider from '@/components/SmartSlider';
import { useAuthStore, useMemberStore } from '@/lib/store';
import {
  HAND_RELEASE_PUSHUP_ROWS,
  HAMR_20M_ROWS,
  PFRA_COMPONENT_MAX_POINTS,
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
  meetsPFRAComponentMinimumsWithExemptions,
  passesWalk2k,
  scoreWithExemptions,
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
type SliderMarker = { value: number; label: string; color?: string };
type HamrStageInfo = {
  level: number;
  shuttleInLevel: number;
  shuttlesInLevel: number;
  totalShuttles: number;
  startSec: number;
  endSec: number;
};

const THEMES: Record<'whtR' | 'cardio' | 'strength' | 'core', ComponentTheme> = {
  whtR: { color: '#14B8A6', soft: 'rgba(20,184,166,0.14)', border: 'rgba(20,184,166,0.38)', tint: 'rgba(20,184,166,0.22)' },
  cardio: { color: '#EF4444', soft: 'rgba(239,68,68,0.14)', border: 'rgba(239,68,68,0.38)', tint: 'rgba(239,68,68,0.22)' },
  strength: { color: '#F59E0B', soft: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.38)', tint: 'rgba(245,158,11,0.22)' },
  core: { color: '#8B5CF6', soft: 'rgba(139,92,246,0.14)', border: 'rgba(139,92,246,0.38)', tint: 'rgba(139,92,246,0.22)' },
};

const HAMR_LEVEL_SHUTTLES = [7, 8, 8, 9, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 13] as const;

async function downloadWebBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

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

function buildHamrTimeline() {
  const stages: HamrStageInfo[] = [];
  let totalShuttles = 0;
  let elapsedSec = 0;

  HAMR_LEVEL_SHUTTLES.forEach((shuttlesInLevel, index) => {
    const level = index + 1;
    const speedKmh = 8 + level * 0.5;
    const shuttleDurationSec = 72 / speedKmh;

    for (let shuttleInLevel = 1; shuttleInLevel <= shuttlesInLevel; shuttleInLevel += 1) {
      const startSec = elapsedSec;
      const endSec = startSec + shuttleDurationSec;
      totalShuttles += 1;
      stages.push({
        level,
        shuttleInLevel,
        shuttlesInLevel,
        totalShuttles,
        startSec,
        endSec,
      });
      elapsedSec = endSec;
    }
  });

  return stages;
}

function getHamrStageForShuttleCount(stages: HamrStageInfo[], shuttleCount: number) {
  if (shuttleCount <= 0) {
    return null;
  }

  return stages.find((stage) => stage.totalShuttles === shuttleCount) ?? stages[stages.length - 1] ?? null;
}

function getHamrStageForPosition(stages: HamrStageInfo[], positionSec: number) {
  if (stages.length === 0) {
    return null;
  }

  const exactStage = stages.find((stage) => positionSec >= stage.startSec && positionSec < stage.endSec);
  if (exactStage) {
    return exactStage;
  }

  if (positionSec >= stages[stages.length - 1].endSec) {
    return stages[stages.length - 1];
  }

  return stages[0];
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

function SliderMarkers({ markers, min, max, theme }: { markers: SliderMarker[]; min: number; max: number; theme: ComponentTheme; }) {
  const range = Math.max(1, max - min);

  return (
    <>
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 6, height: 20, justifyContent: 'center' }}>
        {markers.map((marker) => {
          const left = `${clamp(((marker.value - min) / range) * 100, 0, 100)}%` as const;
          return (
            <View key={`${marker.label}-${marker.value}`} style={{ position: 'absolute', left, top: 1, bottom: 1, marginLeft: -1, width: 2 }}>
              <View style={{ flex: 1, backgroundColor: marker.color ?? theme.color, borderRadius: 999, opacity: 0.98 }} />
            </View>
          );
        })}
      </View>
      <View pointerEvents="none" className="relative mt-2 h-4">
        {markers.map((marker) => {
          const leftPct = clamp(((marker.value - min) / range) * 100, 0, 100);
          const anchorStyle = leftPct <= 12 ? { left: 0 } : leftPct >= 88 ? { right: 0 } : { left: `${leftPct}%` as const, transform: [{ translateX: -24 }] };
          return (
            <Text
              key={`${marker.label}-caption-${marker.value}`}
              className="absolute text-[10px] font-semibold"
              style={{ color: marker.color ?? theme.color, top: 0, ...anchorStyle }}
            >
              {marker.label}
            </Text>
          );
        })}
      </View>
    </>
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

function LabeledSlider({ label, valueLabel, theme, children, input, markers, markerMin, markerMax }: { label: string; valueLabel: string; theme: ComponentTheme; children: React.ReactNode; input: React.ReactNode; markers?: SliderMarker[]; markerMin?: number; markerMax?: number; currentValue?: number; }) {
  return (
    <View className="mb-5">
      <View className="mb-2 flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text className="text-af-silver text-sm">{label}</Text>
          <Text style={{ color: theme.color }} className="mt-0.5 text-xs font-semibold">{valueLabel}</Text>
        </View>
        {input}
      </View>
      <View className="relative justify-center">
        {children}
        {markers && markerMin !== undefined && markerMax !== undefined ? (
          <SliderMarkers markers={markers} min={markerMin} max={markerMax} theme={theme} />
        ) : null}
      </View>
    </View>
  );
}

function ComponentScoreBar({
  label,
  value,
  max,
  theme,
  isPassFail = false,
  onPress,
  detail,
  exempt = false,
}: {
  label: string;
  value: number;
  max: number;
  theme: ComponentTheme;
  isPassFail?: boolean;
  onPress?: () => void;
  detail?: string;
  exempt?: boolean;
}) {
  const widthPct = (
    exempt
      ? '100%'
      : max > 0
        ? `${Math.min(100, Math.max(0, (value / max) * 100))}%`
        : '0%'
  ) as unknown as `${number}%`;
  const labelText = exempt ? 'EXEMPT' : isPassFail ? (value > 0 ? 'PASS' : 'FAIL') : `${value.toFixed(1)}/${max}`;

  return (
    <Pressable className="mb-2" onPress={onPress} disabled={!onPress}>
      <View pointerEvents="none">
        <View className="mb-1 flex-row items-start justify-between gap-3">
          <Text className="text-[11px] font-semibold uppercase tracking-[0.4px] text-white/70">{label}</Text>
          {detail ? <Text className="text-right text-[11px] text-white/75">{detail}</Text> : null}
        </View>
        <View className="relative h-6 overflow-hidden rounded-full border border-white/10 bg-white/10">
          <View style={{ width: widthPct, backgroundColor: exempt ? 'rgba(255,255,255,0.2)' : theme.color }} className="absolute left-0 top-0 h-full rounded-full" />
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

function ExemptToggle({
  checked,
  onPress,
}: {
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
      <View className="h-4 w-4 items-center justify-center rounded border border-white/40 bg-white/5">
        {checked ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : null}
      </View>
      <Text className="text-xs font-semibold uppercase tracking-[0.4px] text-white/75">Exempt</Text>
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

function AudioPanel({
  disableSwipe,
  enableSwipe,
  hamrTimeline = [],
  containerClassName = 'mx-6 mt-6 rounded-2xl border border-white/10 bg-white/5 p-4',
  containerStyle,
  bare = false,
  titleVisible = true,
}: {
  disableSwipe: () => void;
  enableSwipe: () => void;
  hamrTimeline?: HamrStageInfo[];
  containerClassName?: string;
  containerStyle?: any;
  bare?: boolean;
  titleVisible?: boolean;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const webAudioRef = useRef<any>(null);
  const audioModule = useMemo(() => require('../../../assets/audio/20m HAMR Audio File.m4a'), []);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const asset = Asset.fromModule(audioModule);
        if (Platform.OS !== 'web') {
          await asset.downloadAsync();
        }
        if (!isMounted) return;
        setAudioUri(asset.localUri ?? asset.uri ?? null);
      } catch {
        try {
          const asset = Asset.fromModule(audioModule);
          if (!isMounted) return;
          setAudioUri(asset.uri ?? null);
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

  const progressValue = durationSec > 0 ? clamp(positionSec, 0, durationSec) : 0;
  const currentHamrStage = useMemo(() => getHamrStageForPosition(hamrTimeline, positionSec), [hamrTimeline, positionSec]);

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

  const ensureSoundLoaded = async () => {
    if (soundRef.current) return soundRef.current;
    const { sound } = await Audio.Sound.createAsync(
      audioUri ? { uri: audioUri } : audioModule,
      { shouldPlay: false, progressUpdateIntervalMillis: 250 },
      (status) => {
        if (!status.isLoaded) return;
        setIsPlaying(status.isPlaying);
        if (!isSeeking) {
          setPositionSec((status.positionMillis ?? 0) / 1000);
        }
        setDurationSec(((status.durationMillis ?? 0) / 1000) || 0);
        if (status.didJustFinish) {
          setIsPlaying(false);
          setPositionSec(0);
        }
      },
    );
    soundRef.current = sound;
    return sound;
  };

  const seekTo = async (nextSec: number) => {
    const clamped = clamp(nextSec, 0, durationSec || nextSec || 0);
    setPositionSec(clamped);
    try {
      if (Platform.OS === 'web') {
        const webAudio = webAudioRef.current as HTMLAudioElement | null;
        if (!webAudio) return;
        webAudio.currentTime = clamped;
        return;
      }
      const sound = await ensureSoundLoaded();
      await sound.setPositionAsync(Math.round(clamped * 1000));
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

      const sound = await ensureSoundLoaded();
      const status = await sound.getStatusAsync();
      if (!status.isLoaded) return;
      setDurationSec(((status.durationMillis ?? 0) / 1000) || durationSec);
      if (status.isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else {
        await sound.playAsync();
        setIsPlaying(true);
      }
    } catch {
      setIsPlaying(false);
    }
  };

  const controls = (
    <>
      {Platform.OS === 'web' ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio
          ref={webAudioRef}
          preload="metadata"
          src={audioUri ?? Asset.fromModule(audioModule).uri ?? undefined}
          onLoadedMetadata={(event) => {
            const audio = event.currentTarget;
            setDurationSec(Number.isFinite(audio.duration) ? audio.duration : 0);
          }}
          onTimeUpdate={(event) => {
            if (!isSeeking) {
              setPositionSec(event.currentTarget.currentTime ?? 0);
            }
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
        <Pressable onPress={togglePlayback} className="h-9 w-9 items-center justify-center rounded-full bg-white/10">
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={16} color="#FFFFFF" />
        </Pressable>

        <View className="flex-1">
          <SmartSlider
            onSlidingStart={() => {
              disableSwipe();
              setIsSeeking(true);
            }}
            onSlidingComplete={(value) => {
              const nextSec = Number(value) || 0;
              setIsSeeking(false);
              enableSwipe();
              void seekTo(nextSec);
            }}
            onValueChange={(value) => setPositionSec(Number(value) || 0)}
            value={progressValue}
            minimumValue={0}
            maximumValue={Math.max(durationSec, 1)}
            step={0.1}
            minimumTrackTintColor="#4A90D9"
            maximumTrackTintColor="rgba(255,255,255,0.16)"
            webStyle={{ accentColor: '#4A90D9' }}
          />
          <View className="-mt-1 flex-row items-center justify-end">
            <Text className="text-sm font-semibold text-white/90">{formatMMSS(positionSec)}/{formatMMSS(durationSec)}</Text>
          </View>
        </View>

        <Pressable onPress={handleDownload} className="h-9 w-9 items-center justify-center rounded-full bg-white/10">
          <Ionicons name="download-outline" size={16} color="#FFFFFF" />
        </Pressable>
      </View>
      {currentHamrStage ? (
        <View className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <Text className="text-[11px] font-semibold uppercase tracking-[0.4px] text-white/60">Live HAMR Position</Text>
              <Text className="mt-1 text-sm font-semibold text-white">
                Level {currentHamrStage.level} • Shuttle {currentHamrStage.shuttleInLevel} of {currentHamrStage.shuttlesInLevel}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-[11px] font-semibold uppercase tracking-[0.4px] text-white/60">Total Shuttle</Text>
              <Text className="mt-0.5 text-xl font-bold text-white">{currentHamrStage.totalShuttles}</Text>
            </View>
          </View>
        </View>
      ) : null}
    </>
  );

  if (bare) {
    return controls;
  }

  return (
    <View className={containerClassName} style={containerStyle}>
      {titleVisible ? <Text className="mb-3 text-lg font-semibold text-white">20m HAMR Audio</Text> : null}
      {controls}
    </View>
  );
}


export default function CalculatorScreen() {
  const scrollRef = useRef<ScrollView | null>(null);
  const sectionYRef = useRef<Record<'metrics' | 'bodycomp' | 'strength' | 'core' | 'cardio', number>>({ metrics: 0, bodycomp: 0, strength: 0, core: 0, cardio: 0 });
  const [summaryHeight, setSummaryHeight] = useState(0);
  const { width } = useWindowDimensions();
  const isWide = width >= 1280;
  const contentMaxWidth = isWide ? 1460 : undefined;
  const summaryMaxWidth = isWide ? 460 : undefined;
  const jumpOffset = isWide ? 16 : summaryHeight + 16;

  const setSectionY = (key: 'metrics' | 'bodycomp' | 'strength' | 'core' | 'cardio') => (event: LayoutChangeEvent) => {
    sectionYRef.current[key] = event.nativeEvent.layout.y;
  };

  const scrollToSection = (key: 'metrics' | 'bodycomp' | 'strength' | 'core' | 'cardio') => {
    const targetY = Math.max(0, (sectionYRef.current[key] ?? 0) - jumpOffset);
    scrollRef.current?.scrollTo({ y: targetY, animated: true });
  };

  const tabSwipe = useTabSwipeSafe ? useTabSwipeSafe() : null;
  const disableSwipe = () => tabSwipe?.setSwipeEnabled(false);
  const enableSwipe = () => tabSwipe?.setSwipeEnabled(true);

  const [audioCollapsed, setAudioCollapsed] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showOfficialSaveModal, setShowOfficialSaveModal] = useState(false);
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const [isSavingOfficialPfRA, setIsSavingOfficialPfRA] = useState(false);
  const [pdfFileName, setPdfFileName] = useState('name-date-official');
  const updateMember = useMemberStore((s) => s.updateMember);
  const members = useMemberStore((s) => s.members);
  const awardAchievement = useMemberStore((s) => s.awardAchievement);
  const user = useAuthStore((s) => s.user);
  const currentMember = user ? members.find((member) => member.id === user.id) : null;
  const [savePfRADate, setSavePfRADate] = useState(new Date());
  const [showSavePfRADatePicker, setShowSavePfRADatePicker] = useState(false);
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
  const [waistExempt, setWaistExempt] = useState(false);
  const [strengthExempt, setStrengthExempt] = useState(false);
  const [coreExempt, setCoreExempt] = useState(false);
  const [cardioExempt, setCardioExempt] = useState(false);

  const cardioValue = cardioTest === 'run_2mile' ? runSec : cardioTest === 'walk_2k' ? walkSec : hamrShuttles;
  const coreValue = coreTest === 'plank' ? plankSec : coreReps;
  const componentExemptions = useMemo(
    () => ({
      waist: waistExempt,
      strength: strengthExempt,
      core: coreExempt,
      cardio: cardioExempt,
    }),
    [cardioExempt, coreExempt, strengthExempt, waistExempt],
  );

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
  const exemptionAwareScores = useMemo(() => scoreWithExemptions(scores, componentExemptions), [componentExemptions, scores]);
  const minimumCheckExemptions = useMemo(
    () => ((cardioTest === 'walk_2k' && !cardioExempt)
      ? { ...componentExemptions, cardio: true }
      : componentExemptions),
    [cardioExempt, cardioTest, componentExemptions],
  );
  const meetsMinimums = (cardioTest === 'walk_2k' && !cardioExempt)
    ? walkPass && meetsPFRAComponentMinimumsWithExemptions(scores, minimumCheckExemptions)
    : meetsPFRAComponentMinimumsWithExemptions(scores, minimumCheckExemptions);
  const officialTotal = (cardioTest === 'walk_2k' && !cardioExempt) ? null : exemptionAwareScores.normalizedTotal;
  const status = scoreStatus(officialTotal, meetsMinimums, walkPass);

  const whtrValue = heightIn > 0 ? waistIn / heightIn : 0;
  const ageBracket = getPFRAAgeBracket(ageYears);
  const walkAgeBracket = getWalkAgeBracket(ageYears);

  const waistPassValue = useMemo(() => heightIn * WHtR_ROWS[WHtR_ROWS.length - 2].ratio, [heightIn]);
  const waistMaxValue = useMemo(() => heightIn * WHtR_ROWS[0].ratio, [heightIn]);
  const waistMarkers = useMemo<SliderMarker[]>(() => ([
    { value: clamp(waistPassValue, 20, 60), label: `MIN ${clamp(waistPassValue, 20, 60).toFixed(1)}` },
    { value: clamp(waistMaxValue, 20, 60), label: `MAX ${clamp(waistMaxValue, 20, 60).toFixed(1)}` },
  ]), [waistPassValue, waistMaxValue]);

  const strengthRows = strengthTest === 'pushups' ? PUSHUP_ROWS : HAND_RELEASE_PUSHUP_ROWS;
  const strengthPassValue = getThresholdForPoints(strengthRows as readonly ThresholdRow[], ageBracket, gender, PFRA_MINIMUM_COMPONENT_POINTS.strength);
  const strengthMaxValue = getThresholdForPoints(strengthRows as readonly ThresholdRow[], ageBracket, gender, 15);
  const strengthMarkers = useMemo<SliderMarker[]>(() => ([
    { value: clamp(strengthPassValue, 0, 100), label: `MIN ${Math.round(clamp(strengthPassValue, 0, 100))}` },
    { value: clamp(strengthMaxValue, 0, 100), label: `MAX ${Math.round(clamp(strengthMaxValue, 0, 100))}` },
  ]), [strengthPassValue, strengthMaxValue]);

  const coreRows = coreTest === 'situps' ? SITUP_ROWS : coreTest === 'cross_leg_reverse_crunch' ? REVERSE_CRUNCH_ROWS : PLANK_ROWS_SEC;
  const coreMax = coreTest === 'plank' ? 300 : 100;
  const corePassValue = getThresholdForPoints(coreRows as readonly ThresholdRow[], ageBracket, gender, PFRA_MINIMUM_COMPONENT_POINTS.core);
  const coreMaxValue = getThresholdForPoints(coreRows as readonly ThresholdRow[], ageBracket, gender, 15);
  const coreMarkers = useMemo<SliderMarker[]>(() => ([
    { value: clamp(corePassValue, 0, coreMax), label: coreTest === 'plank' ? `MIN ${formatMMSS(clamp(corePassValue, 0, coreMax))}` : `MIN ${Math.round(clamp(corePassValue, 0, coreMax))}` },
    { value: clamp(coreMaxValue, 0, coreMax), label: coreTest === 'plank' ? `MAX ${formatMMSS(clamp(coreMaxValue, 0, coreMax))}` : `MAX ${Math.round(clamp(coreMaxValue, 0, coreMax))}` },
  ]), [corePassValue, coreMaxValue, coreMax, coreTest]);

  const runMaxValue = getThresholdForPoints(RUN_2MILE_ROWS_SEC as readonly ThresholdRow[], ageBracket, gender, 50);
  const runPassValue = getThresholdForPoints(RUN_2MILE_ROWS_SEC as readonly ThresholdRow[], ageBracket, gender, PFRA_MINIMUM_COMPONENT_POINTS.cardio);
  const runMarkers = useMemo<SliderMarker[]>(() => ([
    { value: clamp(runPassValue, 8 * 60, 30 * 60), label: `MIN ${formatMMSS(clamp(runPassValue, 8 * 60, 30 * 60))}` },
    { value: clamp(runMaxValue, 8 * 60, 30 * 60), label: `MAX ${formatMMSS(clamp(runMaxValue, 8 * 60, 30 * 60))}` },
  ]), [runPassValue, runMaxValue]);

  const hamrPassValue = getThresholdForPoints(HAMR_20M_ROWS as readonly ThresholdRow[], ageBracket, gender, PFRA_MINIMUM_COMPONENT_POINTS.cardio);
  const hamrMaxValue = getThresholdForPoints(HAMR_20M_ROWS as readonly ThresholdRow[], ageBracket, gender, 50);
  const hamrMarkers = useMemo<SliderMarker[]>(() => ([
    { value: clamp(hamrPassValue, 0, 120), label: `MIN ${Math.round(clamp(hamrPassValue, 0, 120))}` },
    { value: clamp(hamrMaxValue, 0, 120), label: `MAX ${Math.round(clamp(hamrMaxValue, 0, 120))}` },
  ]), [hamrPassValue, hamrMaxValue]);

  const walkPassThreshold = useMemo(() => {
    const row = WALK_2K_MAX_SEC.find((entry) => entry.bracket === walkAgeBracket);
    return gender === 'male' ? (row?.male_max ?? 0) : (row?.female_max ?? 0);
  }, [walkAgeBracket, gender]);
  const walkMarkers = useMemo<SliderMarker[]>(() => ([
    { value: clamp(walkPassThreshold, 10 * 60, 30 * 60), label: `PASS ${formatMMSS(clamp(walkPassThreshold, 10 * 60, 30 * 60))}` },
  ]), [walkPassThreshold]);
  const hamrTimeline = useMemo(() => buildHamrTimeline(), []);
  const selectedHamrStage = useMemo(() => getHamrStageForShuttleCount(hamrTimeline, hamrShuttles), [hamrShuttles, hamrTimeline]);
  const strengthRawValue = strengthTest === 'pushups' ? `${pushupReps} push-ups` : `${pushupReps} hand-release reps`;
  const coreRawValue = coreTest === 'plank'
    ? `${formatMMSS(plankSec)} plank`
    : `${coreReps} ${coreTest === 'situps' ? 'sit-ups' : 'cross-leg reps'}`;
  const cardioRawValue = cardioTest === 'run_2mile'
    ? formatMMSS(runSec)
    : cardioTest === 'walk_2k'
      ? formatMMSS(walkSec)
      : selectedHamrStage
        ? `${hamrShuttles} shuttles • L${selectedHamrStage.level} S${selectedHamrStage.shuttleInLevel}`
        : `${hamrShuttles} shuttles`;
  const activeScoringSummary = `${exemptionAwareScores.completedScore.toFixed(1)} / ${exemptionAwareScores.completedMax}`;
  const scoreSummaryRows = useMemo(() => ([
    { label: 'WHtR', score: scores.waist, max: 20, theme: THEMES.whtR, detail: `${waistIn.toFixed(1)} in waist • ${heightIn.toFixed(1)} in height` },
    { label: 'Strength', score: scores.strength, max: PFRA_COMPONENT_MAX_POINTS.strength, theme: THEMES.strength, detail: strengthRawValue, exempt: strengthExempt },
    { label: 'Core', score: scores.core, max: 15, theme: THEMES.core, detail: coreRawValue },
    { label: 'Cardio', score: cardioTest === 'walk_2k' ? (walkPass ? 50 : 0) : scores.cardio, max: 50, theme: THEMES.cardio, detail: cardioRawValue, isPassFail: cardioTest === 'walk_2k' },
  ]).map((row) => {
    if (row.label === 'WHtR') {
      return {
        ...row,
        max: PFRA_COMPONENT_MAX_POINTS.waist,
        detail: `${waistIn.toFixed(1)} in waist | ${heightIn.toFixed(1)} in height`,
        exempt: waistExempt,
      };
    }
    if (row.label === 'Strength') {
      return {
        ...row,
        max: PFRA_COMPONENT_MAX_POINTS.strength,
        exempt: strengthExempt,
      };
    }
    if (row.label === 'Core') {
      return {
        ...row,
        max: PFRA_COMPONENT_MAX_POINTS.core,
        exempt: coreExempt,
      };
    }
    return {
      ...row,
      score: cardioTest === 'walk_2k' ? (walkPass ? PFRA_COMPONENT_MAX_POINTS.cardio : 0) : scores.cardio,
      max: PFRA_COMPONENT_MAX_POINTS.cardio,
      exempt: cardioExempt,
    };
  }), [cardioExempt, cardioRawValue, cardioTest, coreExempt, coreRawValue, heightIn, scores.cardio, scores.core, scores.strength, scores.waist, strengthExempt, strengthRawValue, waistExempt, walkPass, waistIn]);

  const circleSize = isWide ? 118 : 110;
  const strokeWidth = 9;
  const radius = (circleSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = officialTotal === null ? 0 : clamp(officialTotal / 100, 0, 1);
  const dashOffset = circumference * (1 - progress);

  const buildCalculatorPdfHtml = () => `
    <html>
      <head>
        <style>
          @page { size: letter landscape; margin: 0.5in; }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-sizing: border-box;
          }
          body {
            margin: 0;
            font-family: Arial, sans-serif;
            background: #0A1628;
            color: #fff;
          }
          .shell {
            background: linear-gradient(135deg, #0A1628 0%, #001F5C 50%, #0A1628 100%);
            min-height: 100vh;
            padding: 24px;
          }
          .title {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            margin-bottom: 16px;
          }
          .headline { font-size: 28px; font-weight: 700; }
          .subtle { color: #c0c0c0; font-size: 12px; }
          .summary {
            display: grid;
            grid-template-columns: 180px 1fr;
            gap: 18px;
            margin-bottom: 18px;
          }
          .scoreCard, .detailCard {
            background: rgba(16, 35, 62, 0.95);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 18px;
            padding: 18px;
          }
          .scoreValue { font-size: 42px; font-weight: 700; margin: 8px 0 4px; }
          .status {
            display: inline-block;
            padding: 6px 10px;
            border-radius: 999px;
            background: rgba(74,144,217,0.18);
            color: ${status.color};
            font-weight: 700;
            font-size: 12px;
            margin-top: 8px;
          }
          .scoreRow {
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            padding: 10px 12px;
            margin-bottom: 10px;
            background: rgba(255,255,255,0.04);
          }
          .scoreRowTop {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            color: #c0c0c0;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            margin-bottom: 6px;
          }
          .scoreRowDetail {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            font-size: 13px;
          }
          .detailsGrid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 14px;
          }
          .detailTitle {
            font-size: 14px;
            font-weight: 700;
            margin-bottom: 8px;
          }
          .detailLine {
            color: #c0c0c0;
            font-size: 12px;
            margin-bottom: 4px;
          }
        </style>
      </head>
      <body>
        <div class="shell">
          <div class="title">
            <div>
              <div class="headline">PFRA Calculator Results</div>
              <div class="subtle">Saved as ${pdfFileName.trim() || 'calculator-results'}.pdf</div>
              <div class="subtle">Age ${ageYears} • ${gender === 'male' ? 'Male' : 'Female'} • ${cardioTest === 'walk_2k' ? '2K Walk' : cardioTest === 'run_2mile' ? '2-mile Run' : '20m HAMR'}</div>
            </div>
            <div class="subtle">FitFlight</div>
          </div>

          <div class="summary">
            <div class="scoreCard">
              <div class="subtle">TOTAL SCORE</div>
              <div class="scoreValue" style="color:${officialTotal === null ? '#FFFFFF' : status.color}">${officialTotal === null ? '--' : officialTotal.toFixed(1)}</div>
              <div class="subtle">${officialTotal === null ? (walkPass ? 'Walk pass' : 'Walk fail') : `Normalized from ${activeScoringSummary}`}</div>
              <div class="status">${status.label}</div>
            </div>

            <div class="detailCard">
              ${scoreSummaryRows.map((row) => `
                <div class="scoreRow">
                  <div class="scoreRowTop">
                    <span>${row.label}</span>
                    <span>${row.exempt ? 'EXEMPT' : row.isPassFail ? (row.score > 0 ? 'PASS' : 'FAIL') : `${row.score.toFixed(1)}/${row.max}`}</span>
                  </div>
                  <div class="scoreRowDetail">
                    <span>${row.exempt ? 'Excluded from denominator' : row.detail ?? ''}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="detailsGrid">
            <div class="detailCard">
              <div class="detailTitle">Body Composition</div>
              <div class="detailLine">Waist: ${waistIn.toFixed(1)} in</div>
              <div class="detailLine">Height: ${heightIn.toFixed(1)} in</div>
              <div class="detailLine">${waistExempt ? 'Exempt from PFRA denominator' : `WHtR: ${whtrValue.toFixed(2)}`}</div>
            </div>
            <div class="detailCard">
              <div class="detailTitle">Strength</div>
              <div class="detailLine">Test: ${strengthTest === 'pushups' ? 'Push-ups' : 'Hand-release Push-ups'}</div>
              <div class="detailLine">Result: ${pushupReps} reps</div>
              <div class="detailLine">${strengthExempt ? 'Exempt from PFRA denominator' : `Score: ${scores.strength.toFixed(1)}`}</div>
            </div>
            <div class="detailCard">
              <div class="detailTitle">Core</div>
              <div class="detailLine">Test: ${coreTest === 'situps' ? 'Sit-ups' : coreTest === 'cross_leg_reverse_crunch' ? 'Cross-leg Reverse Crunch' : 'Plank'}</div>
              <div class="detailLine">Result: ${coreTest === 'plank' ? formatMMSS(plankSec) : `${coreReps} reps`}</div>
              <div class="detailLine">${coreExempt ? 'Exempt from PFRA denominator' : `Score: ${scores.core.toFixed(1)}`}</div>
            </div>
            <div class="detailCard">
              <div class="detailTitle">Cardio</div>
              <div class="detailLine">Test: ${cardioTest === 'run_2mile' ? '2-mile Run' : cardioTest === 'walk_2k' ? '2K Walk' : '20m HAMR'}</div>
              <div class="detailLine">Result: ${cardioRawValue}</div>
              <div class="detailLine">${cardioExempt ? 'Exempt from PFRA denominator' : selectedHamrStage ? `HAMR Level ${selectedHamrStage.level}, Shuttle ${selectedHamrStage.shuttleInLevel} of ${selectedHamrStage.shuttlesInLevel}` : `Score: ${cardioTest === 'walk_2k' ? (walkPass ? 'PASS' : 'FAIL') : scores.cardio.toFixed(1)}`}</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const saveCalculatorPdfOnWeb = async (filename: string) => {
    const { jsPDF } = await import('jspdf/dist/jspdf.es.min.js');
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    pdf.setFillColor(10, 22, 40);
    pdf.rect(0, 0, 792, 612, 'F');
    pdf.setFillColor(16, 35, 62);
    pdf.roundedRect(24, 24, 744, 564, 18, 18, 'F');

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(24);
    pdf.text('PFRA Calculator Results', 40, 56);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(192, 192, 192);
    pdf.text(`Saved as ${filename}`, 40, 74);
    pdf.text(`Age ${ageYears} • ${gender === 'male' ? 'Male' : 'Female'} • ${cardioTest === 'walk_2k' ? '2K Walk' : cardioTest === 'run_2mile' ? '2-mile Run' : '20m HAMR'}`, 40, 88);

    pdf.setFillColor(18, 34, 58);
    pdf.roundedRect(40, 110, 180, 92, 12, 12, 'F');
    pdf.setTextColor(192, 192, 192);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('TOTAL SCORE', 54, 132);
    pdf.setFontSize(32);
    if (officialTotal === null) {
      pdf.setTextColor(255, 255, 255);
    } else if (status.color === '#22C55E') {
      pdf.setTextColor(34, 197, 94);
    } else if (status.color === '#EF4444') {
      pdf.setTextColor(239, 68, 68);
    } else {
      pdf.setTextColor(74, 144, 217);
    }
    pdf.text(officialTotal === null ? '--' : officialTotal.toFixed(1), 54, 170);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(192, 192, 192);
    pdf.text(officialTotal === null ? (walkPass ? 'Walk pass' : 'Walk fail') : `Normalized from ${activeScoringSummary}`, 54, 188);

    scoreSummaryRows.forEach((row, index) => {
      const boxY = 110 + index * 52;
      pdf.setFillColor(18, 34, 58);
      pdf.roundedRect(240, boxY, 510, 40, 10, 10, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(192, 192, 192);
      pdf.text(row.label.toUpperCase(), 252, boxY + 14);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(255, 255, 255);
      pdf.text(row.exempt ? 'Excluded from denominator' : (row.detail ?? ''), 548, boxY + 14, { align: 'right', maxWidth: 190 });
      pdf.setFont('helvetica', 'bold');
      pdf.text(row.exempt ? 'EXEMPT' : row.isPassFail ? (row.score > 0 ? 'PASS' : 'FAIL') : `${row.score.toFixed(1)}/${row.max}`, 252, boxY + 30);
    });

    const detailBlocks = [
      ['Body Composition', [`Waist: ${waistIn.toFixed(1)} in`, `Height: ${heightIn.toFixed(1)} in`, waistExempt ? 'Exempt from PFRA denominator' : `WHtR: ${whtrValue.toFixed(2)}`]],
      ['Strength', [`Test: ${strengthTest === 'pushups' ? 'Push-ups' : 'Hand-release Push-ups'}`, `Result: ${pushupReps} reps`, strengthExempt ? 'Exempt from PFRA denominator' : `Score: ${scores.strength.toFixed(1)}`]],
      ['Core', [`Test: ${coreTest === 'situps' ? 'Sit-ups' : coreTest === 'cross_leg_reverse_crunch' ? 'Cross-leg Reverse Crunch' : 'Plank'}`, `Result: ${coreTest === 'plank' ? formatMMSS(plankSec) : `${coreReps} reps`}`, coreExempt ? 'Exempt from PFRA denominator' : `Score: ${scores.core.toFixed(1)}`]],
      ['Cardio', [`Test: ${cardioTest === 'run_2mile' ? '2-mile Run' : cardioTest === 'walk_2k' ? '2K Walk' : '20m HAMR'}`, `Result: ${cardioRawValue}`, cardioExempt ? 'Exempt from PFRA denominator' : selectedHamrStage ? `Level ${selectedHamrStage.level}, Shuttle ${selectedHamrStage.shuttleInLevel} of ${selectedHamrStage.shuttlesInLevel}` : `Score: ${cardioTest === 'walk_2k' ? (walkPass ? 'PASS' : 'FAIL') : scores.cardio.toFixed(1)}`]],
    ] as const;

    detailBlocks.forEach(([title, lines], index) => {
      const x = 40 + (index % 2) * 360;
      const y = 330 + Math.floor(index / 2) * 108;
      pdf.setFillColor(18, 34, 58);
      pdf.roundedRect(x, y, 320, 90, 10, 10, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(255, 255, 255);
      pdf.text(title, x + 14, y + 18);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(192, 192, 192);
      lines.forEach((line, lineIndex) => {
        pdf.text(line, x + 14, y + 38 + lineIndex * 15, { maxWidth: 292 });
      });
    });

    pdf.save(filename);
  };

  const saveCalculatorResults = async () => {
    try {
      setIsSavingPdf(true);
      const fileStem = (pdfFileName.trim() || 'calculator-results')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
        .replace(/\s+/g, '-');
      const html = buildCalculatorPdfHtml();
      const filename = `${fileStem}.pdf`;

      if (Platform.OS === 'web') {
        await saveCalculatorPdfOnWeb(filename);
      } else {
        const file = await Print.printToFileAsync({ html, base64: false });
        const fileUri = `${FileSystem.documentDirectory}${filename}`;
        await FileSystem.copyAsync({ from: file.uri, to: fileUri });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, { mimeType: 'application/pdf', dialogTitle: 'Save Calculator Results PDF' });
        }
      }

      setShowSaveModal(false);
    } finally {
      setIsSavingPdf(false);
    }
  };

  const savePFRAToAccount = async () => {
    if (!user || !currentMember) {
      return;
    }

    try {
      setIsSavingOfficialPfRA(true);
      const assessmentDate = savePfRADate.toISOString().split('T')[0];
      const cardioComponent =
        cardioTest === 'hamr_20m'
          ? { score: scores.cardio, laps: hamrShuttles, test: '20m HAMR', exempt: cardioExempt }
          : { score: cardioTest === 'walk_2k' ? (walkPass ? 50 : 0) : scores.cardio, time: cardioTest === 'run_2mile' ? formatMMSS(runSec) : formatMMSS(walkSec), test: cardioTest === 'run_2mile' ? '2-mile Run' : '2K Walk', exempt: cardioExempt };

      updateMember(user.id, {
        fitnessAssessments: [
          ...currentMember.fitnessAssessments,
          {
            id: `pfra-${Date.now()}`,
            date: assessmentDate,
            overallScore: officialTotal ?? 0,
            components: {
              cardio: cardioComponent,
              pushups: {
                score: scores.strength,
                reps: pushupReps,
                test: strengthTest === 'pushups' ? 'Push-ups' : 'Hand-release Push-ups',
                exempt: strengthExempt,
              },
              situps: {
                score: scores.core,
                reps: coreTest === 'plank' ? 0 : coreReps,
                time: coreTest === 'plank' ? formatMMSS(plankSec) : undefined,
                test: coreTest === 'situps' ? 'Sit-ups' : coreTest === 'cross_leg_reverse_crunch' ? 'Cross-leg Reverse Crunch' : 'Plank',
                exempt: coreExempt,
              },
              waist: {
                score: scores.waist,
                inches: waistIn,
                exempt: waistExempt,
              },
            },
            isPrivate: false,
          },
        ],
      });

      if ((officialTotal ?? 0) >= 90) {
        awardAchievement(user.id, 'excellent_fa');
      }
      if ((officialTotal ?? 0) === 100) {
        awardAchievement(user.id, 'perfect_fa');
      }

      setShowOfficialSaveModal(false);
    } finally {
      setIsSavingOfficialPfRA(false);
    }
  };

  const renderAudioCard = (className = '', style?: any) => (
    <View className={className} style={style}>
      <View className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <Pressable onPress={() => setAudioCollapsed((prev) => !prev)} className="flex-row items-center justify-between">
          <Text className="text-lg font-semibold text-white">20m HAMR Audio</Text>
          <Ionicons name={audioCollapsed ? 'chevron-down' : 'chevron-up'} size={20} color="#FFFFFF" />
        </Pressable>
        {!audioCollapsed ? <View className="mt-4"><AudioPanel disableSwipe={disableSwipe} enableSwipe={enableSwipe} hamrTimeline={hamrTimeline} bare titleVisible={false} /></View> : null}
      </View>
    </View>
  );

  const metricsCard = (
    <View onLayout={setSectionY('metrics')} className="rounded-2xl border p-5" style={{ backgroundColor: THEMES.whtR.soft, borderColor: THEMES.whtR.border }}>
      <Text className="mb-4 text-lg font-semibold text-white">Metrics</Text>
      <LabeledSlider label="Age" valueLabel={`${ageYears} years`} theme={THEMES.whtR} input={<BoundNumberField value={ageYears} onChange={(v) => setAgeYears(Math.round(v))} min={17} max={65} step={1} />}>
        <SmartSlider onSlidingStart={disableSwipe} onSlidingComplete={enableSwipe} value={ageYears} onValueChange={(v) => setAgeYears(Math.round(v as number))} minimumValue={17} maximumValue={65} step={1} />
      </LabeledSlider>
      <View className="rounded-lg bg-white/10 p-1 flex-row">
        <SegmentedOption selected={gender === 'male'} label="Male" onPress={() => setGender('male')} theme={THEMES.whtR} />
        <SegmentedOption selected={gender === 'female'} label="Female" onPress={() => setGender('female')} theme={THEMES.whtR} />
      </View>
    </View>
  );

  const bodyCompCard = (
      <View onLayout={setSectionY('bodycomp')} className="rounded-2xl border p-5" style={{ backgroundColor: THEMES.whtR.soft, borderColor: THEMES.whtR.border }}>
      <View className="mb-4 flex-row items-center justify-between gap-3">
        <Text className="text-lg font-semibold text-white">Body Composition</Text>
        <ExemptToggle checked={waistExempt} onPress={() => setWaistExempt((current) => !current)} />
      </View>
      <MetricRow label="WHtR" value={whtrValue.toFixed(2)} />
      <LabeledSlider label="Waist" valueLabel={`${waistIn.toFixed(1)} in • score ${scores.waist.toFixed(1)}/20`} theme={THEMES.whtR} input={<BoundNumberField value={waistIn} onChange={setWaistIn} min={20} max={60} step={0.5} decimals={1} className="min-w-[64px] px-2.5" />} markers={waistMarkers} markerMin={20} markerMax={60}>
        <SmartSlider onSlidingStart={disableSwipe} onSlidingComplete={enableSwipe} value={waistIn} onValueChange={(v) => setWaistIn(Number(v))} minimumValue={20} maximumValue={60} step={0.5} />
      </LabeledSlider>
      <LabeledSlider label="Height" valueLabel={`${heightIn.toFixed(1)} in`} theme={THEMES.whtR} input={<BoundNumberField value={heightIn} onChange={setHeightIn} min={48} max={84} step={0.5} decimals={1} className="min-w-[68px] px-2.5" />}>
        <SmartSlider onSlidingStart={disableSwipe} onSlidingComplete={enableSwipe} value={heightIn} onValueChange={(v) => setHeightIn(Number(v))} minimumValue={48} maximumValue={84} step={0.5} />
      </LabeledSlider>
    </View>
  );

  const strengthCard = (
    <View onLayout={setSectionY('strength')} className="rounded-2xl border p-5" style={{ backgroundColor: THEMES.strength.soft, borderColor: THEMES.strength.border }}>
      <View className="mb-4 flex-row items-center justify-between gap-3">
        <Text className="text-lg font-semibold text-white">Strength</Text>
        <ExemptToggle checked={strengthExempt} onPress={() => setStrengthExempt((current) => !current)} />
      </View>
      <View className="mb-5 rounded-lg bg-white/10 p-1 flex-row">
        <SegmentedOption selected={strengthTest === 'pushups'} label="Push-ups" onPress={() => setStrengthTest('pushups')} theme={THEMES.strength} />
        <SegmentedOption selected={strengthTest === 'hand_release_pushups'} label="Hand-release" onPress={() => setStrengthTest('hand_release_pushups')} theme={THEMES.strength} />
      </View>
      <LabeledSlider label="Reps" valueLabel={`${pushupReps} reps`} theme={THEMES.strength} input={<BoundNumberField value={pushupReps} onChange={(v) => setPushupReps(Math.round(v))} min={0} max={100} step={1} />} markers={strengthMarkers} markerMin={0} markerMax={100}>
        <SmartSlider onSlidingStart={disableSwipe} onSlidingComplete={enableSwipe} value={pushupReps} onValueChange={(v) => setPushupReps(Math.round(v as number))} minimumValue={0} maximumValue={100} step={1} />
      </LabeledSlider>
    </View>
  );

  const coreCard = (
    <View onLayout={setSectionY('core')} className="rounded-2xl border p-5" style={{ backgroundColor: THEMES.core.soft, borderColor: THEMES.core.border }}>
      <View className="mb-4 flex-row items-center justify-between gap-3">
        <Text className="text-lg font-semibold text-white">Core</Text>
        <ExemptToggle checked={coreExempt} onPress={() => setCoreExempt((current) => !current)} />
      </View>
      <View className="mb-5 rounded-lg bg-white/10 p-1 flex-row">
        <SegmentedOption selected={coreTest === 'situps'} label="Sit-ups" onPress={() => setCoreTest('situps')} theme={THEMES.core} />
        <SegmentedOption selected={coreTest === 'cross_leg_reverse_crunch'} label="Cross-leg" onPress={() => setCoreTest('cross_leg_reverse_crunch')} theme={THEMES.core} />
        <SegmentedOption selected={coreTest === 'plank'} label="Plank" onPress={() => setCoreTest('plank')} theme={THEMES.core} />
      </View>
      {coreTest === 'plank' ? (
        <LabeledSlider label="Time" valueLabel={formatMMSS(plankSec)} theme={THEMES.core} input={<BoundTimeField valueSec={plankSec} onChange={setPlankSec} minSec={0} maxSec={300} />} markers={coreMarkers} markerMin={0} markerMax={300}>
          <SmartSlider onSlidingStart={disableSwipe} onSlidingComplete={enableSwipe} value={plankSec} onValueChange={(v) => setPlankSec(Math.round(v as number))} minimumValue={0} maximumValue={300} step={1} />
        </LabeledSlider>
      ) : (
        <LabeledSlider label="Reps" valueLabel={`${coreReps} reps`} theme={THEMES.core} input={<BoundNumberField value={coreReps} onChange={(v) => setCoreReps(Math.round(v))} min={0} max={100} step={1} />} markers={coreMarkers} markerMin={0} markerMax={100}>
          <SmartSlider onSlidingStart={disableSwipe} onSlidingComplete={enableSwipe} value={coreReps} onValueChange={(v) => setCoreReps(Math.round(v as number))} minimumValue={0} maximumValue={100} step={1} />
        </LabeledSlider>
      )}
    </View>
  );

  const cardioCard = (
    <View onLayout={setSectionY('cardio')} className="rounded-2xl border p-5" style={{ backgroundColor: THEMES.cardio.soft, borderColor: THEMES.cardio.border }}>
      <View className="mb-4 flex-row items-center justify-between gap-3">
        <Text className="text-lg font-semibold text-white">Cardio</Text>
        <ExemptToggle checked={cardioExempt} onPress={() => setCardioExempt((current) => !current)} />
      </View>
      <View className="mb-5 rounded-lg bg-white/10 p-1 flex-row">
        <SegmentedOption selected={cardioTest === 'run_2mile'} label="2-mile Run" onPress={() => setCardioTest('run_2mile')} theme={THEMES.cardio} />
        <SegmentedOption selected={cardioTest === 'hamr_20m'} label="HAMR" onPress={() => setCardioTest('hamr_20m')} theme={THEMES.cardio} />
        <SegmentedOption selected={cardioTest === 'walk_2k'} label="2km Walk" onPress={() => setCardioTest('walk_2k')} theme={THEMES.cardio} />
      </View>
      {cardioTest === 'run_2mile' && (
        <LabeledSlider label="2-mile time" valueLabel={formatMMSS(runSec)} theme={THEMES.cardio} input={<BoundTimeField valueSec={runSec} onChange={setRunSec} minSec={8 * 60} maxSec={30 * 60} />} markers={runMarkers} markerMin={8 * 60} markerMax={30 * 60}>
          <SmartSlider onSlidingStart={disableSwipe} onSlidingComplete={enableSwipe} value={runSec} onValueChange={(v) => setRunSec(Math.round(v as number))} minimumValue={8 * 60} maximumValue={30 * 60} step={1} />
        </LabeledSlider>
      )}
      {cardioTest === 'walk_2k' && (
        <LabeledSlider label="2K walk maximum time" valueLabel={`${formatMMSS(walkSec)} • pass/fail only`} theme={THEMES.cardio} input={<BoundTimeField valueSec={walkSec} onChange={setWalkSec} minSec={10 * 60} maxSec={30 * 60} />} markers={walkMarkers} markerMin={10 * 60} markerMax={30 * 60}>
          <SmartSlider onSlidingStart={disableSwipe} onSlidingComplete={enableSwipe} value={walkSec} onValueChange={(v) => setWalkSec(Math.round(v as number))} minimumValue={10 * 60} maximumValue={30 * 60} step={1} />
        </LabeledSlider>
      )}
      {cardioTest === 'hamr_20m' && (
        <>
          <LabeledSlider label="HAMR shuttles" valueLabel={`${hamrShuttles} shuttles`} theme={THEMES.cardio} input={<BoundNumberField value={hamrShuttles} onChange={(v) => setHamrShuttles(Math.round(v))} min={0} max={120} step={1} />} markers={hamrMarkers} markerMin={0} markerMax={120}>
            <SmartSlider onSlidingStart={disableSwipe} onSlidingComplete={enableSwipe} value={hamrShuttles} onValueChange={(v) => setHamrShuttles(Math.round(v as number))} minimumValue={0} maximumValue={120} step={1} />
          </LabeledSlider>
          {selectedHamrStage ? (
            <View className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-[11px] font-semibold uppercase tracking-[0.4px] text-white/60">Selected HAMR Mark</Text>
                  <Text className="mt-1 text-sm font-semibold text-white">
                    Level {selectedHamrStage.level} • Shuttle {selectedHamrStage.shuttleInLevel} of {selectedHamrStage.shuttlesInLevel}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-[11px] font-semibold uppercase tracking-[0.4px] text-white/60">Total Shuttle</Text>
                  <Text className="mt-0.5 text-xl font-bold text-white">{selectedHamrStage.totalShuttles}</Text>
                </View>
              </View>
            </View>
          ) : null}
        </>
      )}
    </View>
  );

  return (
    <View className="flex-1">
      <LinearGradient
        colors={['#0A1628', '#001F5C', '#0A1628']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView edges={['top']} className="flex-1">
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={isWide ? undefined : [1]}
        >
          <View style={{ width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center' }} className="px-6 pt-4 pb-2">
            <View className="flex-row items-start justify-between gap-4">
              <View className="flex-1">
                <Text className="text-2xl font-bold text-white">PFRA Calculator</Text>
                <Text className="mt-1 text-sm text-af-silver">Based on PFRA Scoring Charts released on 1 MAR 2026</Text>
              </View>
              <View className="items-end gap-2">
                <Pressable
                  onPress={() => setShowSaveModal(true)}
                  className="rounded-xl border border-af-accent/50 bg-af-accent/15 px-4 py-2.5"
                >
                  <Text className="font-semibold text-af-accent">Export Results</Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowOfficialSaveModal(true)}
                  className="rounded-xl border border-af-gold/50 bg-af-gold/15 px-4 py-2.5"
                >
                  <Text className="font-semibold text-af-gold">Save PFRA to Account</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {isWide ? (
            <View style={{ width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center' }} className="px-6">
              <View className="mt-2 flex-row items-start" style={{ gap: 16 }}>
                <View style={{ flex: 1, maxWidth: summaryMaxWidth }}>
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
                        {scoreSummaryRows.map((row) => (
                          <ComponentScoreBar key={row.label} label={row.label} value={row.score} max={row.max} theme={row.theme} isPassFail={row.isPassFail} detail={row.detail} exempt={row.exempt} onPress={() => scrollToSection(row.label === 'WHtR' ? 'bodycomp' : row.label === 'Strength' ? 'strength' : row.label === 'Core' ? 'core' : 'cardio')} />
                        ))}
                      </View>
                    </View>
                  </View>
                  {renderAudioCard('mt-6')}
                </View>

                <View style={{ flex: 1 }}>{metricsCard}</View>
                <View style={{ flex: 1 }}>{bodyCompCard}</View>
              </View>

              <View className="mt-6 flex-row items-start" style={{ gap: 16 }}>
                <View style={{ flex: 1 }}>{strengthCard}</View>
                <View style={{ flex: 1 }}>{coreCard}</View>
                <View style={{ flex: 1 }}>{cardioCard}</View>
              </View>
            </View>
          ) : (
            [
              <View
                key="mobile-summary"
                onLayout={(event) => setSummaryHeight(event.nativeEvent.layout.height)}
                style={{ width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center' }}
                className="px-6 pt-2 pb-2"
              >
                <View style={{ maxWidth: summaryMaxWidth }} className="rounded-2xl border border-white/10 bg-[#10233E]/95 px-4 py-4">
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
                      {scoreSummaryRows.map((row) => (
                        <ComponentScoreBar key={row.label} label={row.label} value={row.score} max={row.max} theme={row.theme} isPassFail={row.isPassFail} detail={row.detail} exempt={row.exempt} onPress={() => scrollToSection(row.label === 'WHtR' ? 'bodycomp' : row.label === 'Strength' ? 'strength' : row.label === 'Core' ? 'core' : 'cardio')} />
                      ))}
                    </View>
                  </View>
                </View>
              </View>,

              <View key="mobile-content" style={{ width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center' }} className="px-6">
                {renderAudioCard('mt-6')}
                <View className="mt-6">{metricsCard}</View>
                <View className="mt-6">{bodyCompCard}</View>
                <View className="mt-6">{strengthCard}</View>
                <View className="mt-6">{coreCard}</View>
                <View className="mt-6">{cardioCard}</View>
              </View>
            ]
          )}
        </ScrollView>
      </SafeAreaView>

      <Modal visible={showSaveModal} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/75 p-6">
          <View className="w-full max-w-md rounded-3xl border border-white/15 bg-[#0F1F36] p-6">
            <Text className="text-xl font-bold text-white">Export Calculator Results</Text>
            <Text className="mt-2 text-sm text-af-silver">Name your 1-page PDF before it is saved.</Text>
            <Text className="mt-1 text-xs text-white/55">Examples: `name-date-official` or `name-date-goal`</Text>
            <TextInput
              value={pdfFileName}
              onChangeText={setPdfFileName}
              autoCapitalize="none"
              placeholder="name-date-official"
              placeholderTextColor="rgba(255,255,255,0.35)"
              className="mt-4 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white"
            />
            <View className="mt-5 flex-row">
              <Pressable
                onPress={() => !isSavingPdf && setShowSaveModal(false)}
                className="mr-2 flex-1 rounded-xl border border-white/15 bg-white/10 py-3"
              >
                <Text className="text-center font-semibold text-white">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void saveCalculatorResults()}
                className="ml-2 flex-1 rounded-xl bg-af-accent py-3"
                disabled={isSavingPdf}
              >
                <Text className="text-center font-semibold text-white">{isSavingPdf ? 'Exporting...' : 'Export PDF'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showOfficialSaveModal} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/75 p-6">
          <View className="w-full max-w-md rounded-3xl border border-white/15 bg-[#0F1F36] p-6">
            <Text className="text-xl font-bold text-white">Save PFRA to Account</Text>
            <Text className="mt-3 text-sm leading-6 text-af-silver">
              This saves the current calculator state to your FitFlight account as a recorded PFRA result for your own tracking.
            </Text>
            <Text className="mt-2 text-xs text-white/55">
              This is separate from the PFRA your UFPM enters officially. It does not change your required PT sessions.
            </Text>
            <View className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4">
              <View className="flex-row justify-between">
                <Text className="text-af-silver">PFRA Score</Text>
                <Text className="font-semibold text-white">{officialTotal === null ? 'N/A' : officialTotal.toFixed(1)}</Text>
              </View>
              <View className="mt-2">
                <Text className="text-af-silver mb-2">PFRA Date</Text>
                {Platform.OS === 'web' ? (
                  React.createElement('input', {
                    type: 'date',
                    value: savePfRADate.toISOString().split('T')[0],
                    max: new Date().toISOString().split('T')[0],
                    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                      const value = event.target.value;
                      const nextDate = new Date(`${value}T00:00:00`);
                      if (!Number.isNaN(nextDate.getTime()) && nextDate <= new Date()) {
                        setSavePfRADate(nextDate);
                      }
                    },
                    style: {
                      width: '100%',
                      borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.15)',
                      backgroundColor: 'rgba(255,255,255,0.10)',
                      color: '#FFFFFF',
                      padding: '12px 16px',
                      outline: 'none',
                    },
                  })
                ) : (
                  <>
                    <Pressable
                      onPress={() => setShowSavePfRADatePicker(true)}
                      className="rounded-xl border border-white/15 bg-white/10 px-4 py-3"
                    >
                      <Text className="text-white">{savePfRADate.toLocaleDateString()}</Text>
                    </Pressable>
                    {showSavePfRADatePicker ? (
                      <DateTimePicker
                        value={savePfRADate}
                        mode="date"
                        maximumDate={new Date()}
                        onChange={(_, nextDate) => {
                          setShowSavePfRADatePicker(false);
                          if (nextDate && nextDate <= new Date()) {
                            setSavePfRADate(nextDate);
                          }
                        }}
                      />
                    ) : null}
                  </>
                )}
              </View>
              <View className="mt-2 flex-row justify-between">
                <Text className="text-af-silver">Cardio Test</Text>
                <Text className="font-semibold text-white">{cardioTest === 'run_2mile' ? '2-mile Run' : cardioTest === 'walk_2k' ? '2K Walk' : '20m HAMR'}</Text>
              </View>
            </View>
            <View className="mt-5 flex-row">
              <Pressable
                onPress={() => !isSavingOfficialPfRA && setShowOfficialSaveModal(false)}
                className="mr-2 flex-1 rounded-xl border border-white/15 bg-white/10 py-3"
              >
                <Text className="text-center font-semibold text-white">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void savePFRAToAccount()}
                className="ml-2 flex-1 rounded-xl bg-af-gold py-3"
                disabled={isSavingOfficialPfRA}
              >
                <Text className="text-center font-semibold text-[#0A1628]">
                  {isSavingOfficialPfRA ? 'Saving...' : 'Save to Account'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
