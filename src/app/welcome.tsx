import React, { ReactNode, useState, useRef } from 'react';
import { View, Text, Pressable, Dimensions, FlatList, ViewToken, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Shield, Trophy, Activity, Calendar, Target, ChevronRight, ChevronLeft, Check, Users, BarChart3 } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withSpring, interpolate } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuthStore, useMemberStore } from '@/lib/store';
import { cn } from '@/lib/cn';
import { Image } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface TutorialSlide {
  id: string;
  title: string;
  description: string;
  features: string[];
  icon?: React.ElementType;
  iconColor?: string;
  iconBg?: string;
  image?: ReactNode;
}

const TUTORIAL_SLIDES: TutorialSlide[] = [
  {
    id: 'welcome',
    image: (
      <Image
        source={require('../../assets/images/logo192.png')}
        style={{ width: 90, height: 90, resizeMode: 'contain' }}
      />
    ),
    title: 'Welcome to FitFlight',
    description: 'Your squadron\'s all-in-one PT and fitness solution.',
    features: [
      'Track personal fitness progress',
      'Log workouts and PT sessions',
      'Compete on the squadron leaderboard',
    ],
  },
  {
    id: 'leaderboard',
    icon: Trophy,
    iconColor: '#FFD700',
    iconBg: 'bg-af-gold/30',
    title: 'Squadron Leaderboard',
    description: 'See how you stack up against fellow Airmen. Earn achievements and climb the ranks.',
    features: [
      'Real-time squadron rankings',
      'Track exercise minutes, distance & workouts',
      'Earn badges for milestones',
    ],
  },
  {
    id: 'workouts',
    icon: Activity,
    iconColor: '#22C55E',
    iconBg: 'bg-af-success/30',
    title: 'Log Your Workouts',
    description: 'Record every workout with screenshots. Connect to Apple Health for automatic syncing.',
    features: [
      'Multiple workout types supported',
      'Screenshot verification system',
      'Sync with Apple Health',
    ],
  },
  {
    id: 'attendance',
    icon: Calendar,
    iconColor: '#A855F7',
    iconBg: 'bg-purple-500/30',
    title: 'PT Attendance',
    description: 'PFLs can track attendance for scheduled PT sessions. Never miss a session again.',
    features: [
      'Schedule PT sessions',
      'Mark attendance with one tap',
      'View attendance history',
    ],
  },
  {
    id: 'calculator',
    icon: Target,
    iconColor: '#F59E0B',
    iconBg: 'bg-af-warning/30',
    title: 'PFRA Calculator',
    description: 'Calculate your PFRA score. Upload official PFRA results to track progress.',
    features: [
      'Score calculation for all components',
      'Track PFRA history over time',
      'Privacy controls for your scores',
    ],
  },
  {
    id: 'ready',
    icon: Check,
    iconColor: '#22C55E',
    iconBg: 'bg-af-success/30',
    title: 'You\'re Ready!',
    description: 'Start tracking your fitness journey with your squadron. Let\'s get after it!',
    features: [
      'View the tutorial anytime in Settings',
      'Connect fitness apps in Profile',
      'Contact your PFL for questions',
    ],
  },
];

function SlideItem({ item, slideWidth }: { item: TutorialSlide; slideWidth: number }) {
  const Icon = item.icon;
  const iconBgClass = item.iconBg ?? 'bg-white/10';

  return (
    <View style={{ width: slideWidth }} className="px-8 items-center justify-center">
      <Animated.View
        entering={FadeInUp.delay(200).springify()}
        className={cn(
          "w-28 h-28 rounded-full items-center justify-center mb-8",
          iconBgClass
        )}
      >
        {item.image ? item.image : Icon ? <Icon size={56} color={item.iconColor ?? '#FFFFFF'} /> : null}
      </Animated.View>

      <Animated.Text
        entering={FadeInDown.delay(300).springify()}
        className="text-white text-2xl font-bold text-center mb-4"
      >
        {item.title}
      </Animated.Text>

      <Animated.Text
        entering={FadeInDown.delay(400).springify()}
        className="text-af-silver text-center text-base mb-8 px-4"
      >
        {item.description}
      </Animated.Text>

      <Animated.View
        entering={FadeInDown.delay(500).springify()}
        className="w-full"
      >
        {item.features.map((feature, idx) => (
          <View key={idx} className="flex-row items-center bg-white/5 rounded-xl px-4 py-3 mb-2">
            <View className="w-6 h-6 bg-af-success/30 rounded-full items-center justify-center mr-3">
              <Check size={14} color="#22C55E" />
            </View>
            <Text className="text-white flex-1">{feature}</Text>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const updateUser = useAuthStore(s => s.updateUser);
  const user = useAuthStore(s => s.user);
  const updateMember = useMemberStore(s => s.updateMember);
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  const slideWidth = windowWidth || SCREEN_WIDTH;

  const handleViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems[0]) {
        setCurrentIndex(viewableItems[0].index ?? 0);
      }
    }
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const scrollToSlide = (index: number) => {
    setCurrentIndex(index);
    flatListRef.current?.scrollToOffset({
      offset: index * slideWidth,
      animated: true,
    });
  };

  const goToNextSlide = () => {
    if (currentIndex < TUTORIAL_SLIDES.length - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      scrollToSlide(currentIndex + 1);
    }
  };

  const goToPrevSlide = () => {
    if (currentIndex > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      scrollToSlide(currentIndex - 1);
    }
  };

  const handleComplete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateUser({ hasSeenTutorial: true });
    if (user) {
      updateMember(user.id, { hasSeenTutorial: true });
    }
    router.replace('/(tabs)');
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateUser({ hasSeenTutorial: true });
    if (user) {
      updateMember(user.id, { hasSeenTutorial: true });
    }
    router.replace('/(tabs)');
  };

  const isLastSlide = currentIndex === TUTORIAL_SLIDES.length - 1;

  return (
    <View className="flex-1">
      <LinearGradient
        colors={['#0A1628', '#001F5C', '#0A1628']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView className="flex-1">
        {/* Skip Button */}
        <View className="flex-row justify-end px-6 pt-4">
          {!isLastSlide && (
            <Pressable
              onPress={handleSkip}
              className="px-4 py-2"
            >
              <Text className="text-af-silver font-medium">Skip</Text>
            </Pressable>
          )}
        </View>

        {/* Slides */}
        <View className="flex-1 justify-center">
          <FlatList
            ref={flatListRef}
            data={TUTORIAL_SLIDES}
            renderItem={({ item, index }) => (
              <SlideItem item={item} slideWidth={slideWidth} />
            )}
            keyExtractor={(item) => item.id}
            getItemLayout={(_, index) => ({
              length: slideWidth,
              offset: slideWidth * index,
              index,
            })}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onViewableItemsChanged={handleViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            extraData={slideWidth}
            bounces={false}
          />
        </View>

        {/* Pagination Dots */}
        <View className="flex-row justify-center mb-6">
          {TUTORIAL_SLIDES.map((_, index) => (
            <Pressable
              key={index}
              onPress={() => {
                Haptics.selectionAsync();
                scrollToSlide(index);
              }}
            >
              <View
                className={cn(
                  "w-2 h-2 rounded-full mx-1.5",
                  index === currentIndex ? "bg-af-accent w-6" : "bg-white/30"
                )}
              />
            </Pressable>
          ))}
        </View>

        {/* Navigation Buttons */}
        <View className="flex-row items-center justify-between px-6 pb-8">
          {currentIndex > 0 ? (
            <Pressable
              onPress={goToPrevSlide}
              className="flex-row items-center bg-white/10 px-6 py-3 rounded-xl"
            >
              <ChevronLeft size={20} color="#C0C0C0" />
              <Text className="text-white font-semibold ml-1">Back</Text>
            </Pressable>
          ) : (
            <View style={{ width: 100 }} />
          )}

          {isLastSlide ? (
            <Pressable
              onPress={handleComplete}
              className="flex-row items-center bg-af-accent px-8 py-4 rounded-xl"
            >
              <Text className="text-white font-bold text-lg mr-2">Get Started</Text>
              <ChevronRight size={20} color="white" />
            </Pressable>
          ) : (
            <Pressable
              onPress={goToNextSlide}
              className="flex-row items-center bg-af-accent px-6 py-3 rounded-xl"
            >
              <Text className="text-white font-semibold mr-1">Next</Text>
              <ChevronRight size={20} color="white" />
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
