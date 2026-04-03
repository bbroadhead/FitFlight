import React, { useEffect } from 'react';
import { View, Text, Pressable, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withDelay,
  FadeIn,
  FadeOut,
  ZoomIn
} from 'react-native-reanimated';
import { Crown, Medal, Award, Star, Flame, Zap, TrendingUp, ShieldCheck, Sparkles, Trophy, MapPin, Footprints, Dumbbell, Mountain } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { type Achievement } from '@/lib/store';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface AchievementCelebrationProps {
  achievement: Achievement;
  onDismiss: () => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
  crown: Crown,
  medal: Medal,
  award: Award,
  star: Star,
  flame: Flame,
  zap: Zap,
  'trending-up': TrendingUp,
  'shield-check': ShieldCheck,
  sparkles: Sparkles,
  trophy: Trophy,
  'map-pin': MapPin,
  footprints: Footprints,
  dumbbell: Dumbbell,
  mountain: Mountain,
};

export function AchievementCelebration({ achievement, onDismiss }: AchievementCelebrationProps) {
  const scale = useSharedValue(0);
  const rotation = useSharedValue(0);
  const glowOpacity = useSharedValue(0);

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

    glowOpacity.value = withDelay(
      200,
      withSequence(
        withSpring(1, { damping: 10 }),
        withDelay(1000, withSpring(0.5, { damping: 10 }))
      )
    );
  }, []);

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const IconComponent = ICON_MAP[achievement.icon] || Award;

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

      <Animated.View
        entering={ZoomIn.delay(100).duration(400)}
        className="items-center px-8"
      >
        {/* Glow Effect */}
        <Animated.View
          style={[
            glowAnimatedStyle,
            {
              position: 'absolute',
              width: 200,
              height: 200,
              borderRadius: 100,
              backgroundColor: '#FFD700',
              opacity: 0.3,
              shadowColor: '#FFD700',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 1,
              shadowRadius: 50,
            },
          ]}
        />

        {/* Achievement Icon */}
        <Animated.View
          style={iconAnimatedStyle}
          className="w-32 h-32 bg-af-gold/30 rounded-full items-center justify-center border-4 border-af-gold mb-6"
        >
          <IconComponent size={64} color="#FFD700" />
        </Animated.View>

        {/* Title */}
        <Text className="text-af-gold text-sm uppercase tracking-widest mb-2">
          Achievement Unlocked
        </Text>

        <Text className="text-white text-3xl font-bold text-center mb-2">
          {achievement.name}
        </Text>

        <Text className="text-af-silver text-center text-lg mb-8">
          {achievement.description}
        </Text>

        {/* Dismiss Button */}
        <Pressable
          onPress={onDismiss}
          className="bg-af-gold/20 border border-af-gold/50 px-8 py-3 rounded-full"
        >
          <Text className="text-af-gold font-semibold">Awesome!</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}
