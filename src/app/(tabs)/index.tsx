import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, Dimensions, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, Filter, Trophy, Medal, Star, TrendingUp, Users } from 'lucide-react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { cn } from '@/lib/cn';
import { useData } from '@/contexts/DataContext';

const { width } = Dimensions.get('window');

type SortOption = 'score' | 'name' | 'improvement';

export default function LeaderboardScreen() {
  const { members, scores, currentUser } = useData();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('score');
  const [showFilters, setShowFilters] = useState(false);

  const filterHeight = useSharedValue(0);
  const filterOpacity = useSharedValue(0);

  const toggleFilters = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (showFilters) {
      filterHeight.value = withSpring(0);
      filterOpacity.value = withSpring(0);
      setShowFilters(false);
    } else {
      filterHeight.value = withSpring(120);
      filterOpacity.value = withSpring(1);
      setShowFilters(true);
    }
  };

  const filterAnimatedStyle = useAnimatedStyle(() => ({
    height: filterHeight.value,
    opacity: filterOpacity.value,
    overflow: 'hidden',
  }));

  const filteredAndSortedMembers = useMemo(() => {
    let filtered = members.filter(member =>
      member.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return filtered.sort((a, b) => {
      const scoreA = scores[a.id]?.total || 0;
      const scoreB = scores[b.id]?.total || 0;

      switch (sortOption) {
        case 'score':
          return scoreB - scoreA;
        case 'name':
          return a.name.localeCompare(b.name);
        case 'improvement':
          const improvementA = scores[a.id]?.improvement || 0;
          const improvementB = scores[b.id]?.improvement || 0;
          return improvementB - improvementA;
        default:
          return scoreB - scoreA;
      }
    });
  }, [members, scores, searchQuery, sortOption]);

  const topThree = filteredAndSortedMembers.slice(0, 3);

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy size={24} color="#FFD700" />;
      case 2:
        return <Medal size={24} color="#C0C0C0" />;
      case 3:
        return <Star size={24} color="#CD7F32" />;
      default:
        return null;
    }
  };

  return (
    <View className="flex-1">
      <LinearGradient
        colors={['#0A1628', '#001F5C', '#0A1628']}
        className="flex-1"
      >
        <SafeAreaView className="flex-1">
          <View className="px-6 py-4">
            <Text className="text-2xl font-bold text-white mb-2">Leaderboard</Text>
            <Text className="text-white/70">Track squadron fitness progress</Text>
          </View>

          <View className="px-6 mb-4">
            <View className="flex-row items-center bg-white/10 rounded-2xl px-4 py-3 border border-white/20">
              <Search size={20} color="#A0A0A0" />
              <TextInput
                className="flex-1 text-white ml-3 text-base"
                placeholder="Search members..."
                placeholderTextColor="#A0A0A0"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              <Pressable onPress={toggleFilters} className="ml-3">
                <Filter size={20} color={showFilters ? '#4A90D9' : '#A0A0A0'} />
              </Pressable>
            </View>
          </View>

          <Animated.View style={filterAnimatedStyle} className="px-6 mb-4">
            <View className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <Text className="text-white font-semibold mb-3">Sort By</Text>
              <View className="flex-row gap-2">
                {[
                  { key: 'score', label: 'Score', icon: TrendingUp },
                  { key: 'name', label: 'Name', icon: Users },
                  { key: 'improvement', label: 'Improvement', icon: TrendingUp },
                ].map(option => (
                  <Pressable
                    key={option.key}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSortOption(option.key as SortOption);
                    }}
                    className={cn(
                      "flex-1 flex-row items-center justify-center py-2 rounded-xl border",
                      sortOption === option.key
                        ? "bg-af-accent/20 border-af-accent"
                        : "bg-white/5 border-white/20"
                    )}
                  >
                    <option.icon size={16} color={sortOption === option.key ? '#4A90D9' : '#A0A0A0'} />
                    <Text className={cn(
                      "ml-2 text-sm font-medium",
                      sortOption === option.key ? "text-af-accent" : "text-white/70"
                    )}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </Animated.View>

          <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
            {topThree.length > 0 && (
              <View className="mb-6">
                <Text className="text-lg font-semibold text-white mb-4">Top Performers</Text>
                <View className="flex-row gap-3">
                  {topThree.map((member, index) => {
                    const rank = index + 1;
                    const score = scores[member.id]?.total || 0;
                    return (
                      <Animated.View
                        key={member.id}
                        entering={FadeInDown.delay(index * 100).springify()}
                        className="flex-1 bg-white/10 rounded-2xl p-4 border border-white/20"
                      >
                        <View className="items-center">
                          {getRankIcon(rank)}
                          <Text className="text-white font-semibold mt-2 text-center">{member.name}</Text>
                          <Text className="text-af-accent font-bold text-xl mt-1">{score}</Text>
                          <Text className="text-white/50 text-xs">points</Text>
                        </View>
                      </Animated.View>
                    );
                  })}
                </View>
              </View>
            )}

            <View className="mb-6">
              <Text className="text-lg font-semibold text-white mb-4">All Members</Text>
              {filteredAndSortedMembers.map((member, index) => {
                const score = scores[member.id]?.total || 0;
                const rank = index + 1;
                const isCurrentUser = member.id === currentUser?.id;

                return (
                  <Animated.View
                    key={member.id}
                    entering={FadeInDown.delay(index * 50).springify()}
                    className={cn(
                      "bg-white/10 rounded-2xl p-4 mb-3 border",
                      isCurrentUser ? "border-af-accent bg-af-accent/10" : "border-white/20"
                    )}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center flex-1">
                        <View className={cn(
                          "w-10 h-10 rounded-xl items-center justify-center mr-3",
                          rank <= 3 ? "bg-af-accent/20" : "bg-white/10"
                        )}>
                          <Text className={cn(
                            "font-bold",
                            rank <= 3 ? "text-af-accent" : "text-white/70"
                          )}>
                            {rank}
                          </Text>
                        </View>
                        <View className="flex-1">
                          <Text className={cn(
                            "font-semibold",
                            isCurrentUser ? "text-af-accent" : "text-white"
                          )}>
                            {member.name}
                          </Text>
                          <Text className="text-white/50 text-sm">{member.flight}</Text>
                        </View>
                      </View>
                      <View className="items-end">
                        <Text className="text-white font-bold text-lg">{score}</Text>
                        <Text className="text-white/50 text-xs">points</Text>
                      </View>
                    </View>
                  </Animated.View>
                );
              })}
            </View>

            <View className="h-24" />
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}
