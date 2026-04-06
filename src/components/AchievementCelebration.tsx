import React, { useEffect, useMemo } from 'react';
import { View, Text, Pressable, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withDelay,
  FadeIn,
  FadeOut,
  ZoomIn,
  Easing,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { type Achievement } from '@/lib/store';
import { getTrophyVisual } from '@/lib/trophies';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface AchievementCelebrationProps {
  achievement: Achievement;
  onDismiss: () => void;
}

const CONFETTI_COLORS = ['#FFD700', '#4A90D9', '#22C55E', '#A855F7', '#F97316', '#FFFFFF'];

function ConfettiPiece({ index }: { index: number }) {
  const startLeft = (index * 47) % Math.max(SCREEN_WIDTH - 20, 1);
  const drift = ((index % 6) - 2.5) * 18;
  const translateY = useSharedValue(-120 - (index % 6) * 36);
  const translateX = useSharedValue(0);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(0);
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];

  useEffect(() => {
    opacity.value = withSequence(
      withTiming(1, { duration: 250 }),
      withDelay(1800, withTiming(0, { duration: 400 }))
    );
    translateY.value = withDelay(
      (index % 8) * 80,
      withTiming(SCREEN_HEIGHT + 120, {
        duration: 2400 + (index % 6) * 180,
        easing: Easing.out(Easing.quad),
      })
    );
    translateX.value = withDelay(
      (index % 7) * 60,
      withTiming(drift, {
        duration: 2000 + (index % 5) * 120,
        easing: Easing.inOut(Easing.sin),
      })
    );
    rotate.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), 4, false);
  }, [index, opacity, rotate, translateX, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        animatedStyle,
        {
          position: 'absolute',
          top: 0,
          left: startLeft,
          width: index % 2 === 0 ? 10 : 14,
          height: index % 3 === 0 ? 16 : 10,
          borderRadius: 3,
          backgroundColor: color,
        },
      ]}
    />
  );
}

export function AchievementCelebration({ achievement, onDismiss }: AchievementCelebrationProps) {
  const scale = useSharedValue(0);
  const rotation = useSharedValue(0);
  const trophyLift = useSharedValue(24);
  const { Icon, iconColor, iconBg, borderColor } = getTrophyVisual(achievement.id);

  const confettiPieces = useMemo(() => Array.from({ length: 42 }, (_, index) => index), []);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    scale.value = withSequence(
      withSpring(1.2, { damping: 8, stiffness: 100 }),
      withSpring(1, { damping: 12, stiffness: 100 })
    );

    rotation.value = withSequence(
      withSpring(-5, { damping: 8 }),
      withSpring(5, { damping: 8 }),
      withSpring(0, { damping: 12 })
    );

    trophyLift.value = withDelay(120, withSpring(0, { damping: 12, stiffness: 110 }));
  }, []);

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  const trophyAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: trophyLift.value }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(300)}
      className="absolute inset-0 items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
    >
      <Pressable
        onPress={onDismiss}
        className="absolute inset-0"
      />

      {confettiPieces.map((piece) => (
        <ConfettiPiece key={piece} index={piece} />
      ))}

      <Animated.View
        entering={ZoomIn.delay(100).duration(400)}
        className="items-center px-8 w-full"
      >
        <Animated.View
          style={[trophyAnimatedStyle, iconAnimatedStyle, { zIndex: 2 }]}
          className="mb-8"
        >
          <View
            className="w-28 h-28 rounded-full items-center justify-center"
            style={{
              backgroundColor: iconBg,
              borderWidth: 2,
              borderColor,
            }}
          >
            <Icon size={52} color={iconColor} />
          </View>
        </Animated.View>

        <Text className="text-af-gold text-sm uppercase tracking-widest mb-2" style={{ zIndex: 2 }}>
          Trophy Unlocked
        </Text>

        <Text className="text-white text-4xl font-bold text-center mb-3" style={{ zIndex: 2 }}>
          {achievement.name}
        </Text>

        <Text className="text-af-silver text-center text-lg mb-8 max-w-xl" style={{ zIndex: 2 }}>
          {achievement.description}
        </Text>

        <Pressable
          onPress={onDismiss}
          className="bg-af-gold/20 border border-af-gold/50 px-8 py-4 rounded-full"
          style={{ zIndex: 2 }}
        >
          <Text className="text-af-gold font-semibold text-base">Awesome!</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}
