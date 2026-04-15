import React, { useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { ChevronDown, ChevronUp, X } from 'lucide-react-native';
import { cn } from '@/lib/cn';
import type { TrophyWithStats } from '@/lib/trophies';

interface TrophyCaseProps {
  expanded: boolean;
  onToggle: () => void;
  trophies: TrophyWithStats[];
  title?: string;
  emptyText?: string;
  footer?: React.ReactNode;
}

interface CompactTrophyBadgesProps {
  trophies: TrophyWithStats[];
  overflowCount?: number;
}

export function CompactTrophyBadges({ trophies, overflowCount = 0 }: CompactTrophyBadgesProps) {
  const [selectedTrophy, setSelectedTrophy] = useState<TrophyWithStats | null>(null);

  if (trophies.length === 0 && overflowCount <= 0) {
    return null;
  }

  return (
    <>
      <View className="flex-row items-center flex-wrap mt-1">
        {trophies.map((trophy) => {
          const Icon = trophy.Icon;
          return (
            <Pressable
              key={trophy.id}
              onPress={() => setSelectedTrophy(trophy)}
              className="w-6 h-6 rounded-full items-center justify-center mr-1.5 mb-1 border"
              style={{
                backgroundColor: trophy.iconBg,
                borderColor: trophy.isHard ? '#FFD700' : trophy.borderColor,
              }}
            >
              <Icon size={11} color={trophy.iconColor} />
            </Pressable>
          );
        })}
        {overflowCount > 0 ? (
          <View className="px-2 h-6 rounded-full items-center justify-center border border-white/15 bg-white/5 mb-1">
            <Text className="text-af-silver text-xs font-semibold">+{overflowCount}</Text>
          </View>
        ) : null}
      </View>

      <Modal visible={!!selectedTrophy} transparent animationType="fade">
        <Pressable className="flex-1 bg-black/35" onPress={() => setSelectedTrophy(null)}>
          <View className="flex-1 items-center justify-start px-6 pt-36">
            {selectedTrophy ? (
              <Pressable
                onPress={() => undefined}
                className="w-full max-w-xs rounded-3xl border border-white/15 bg-af-navy/95 px-4 py-4"
              >
                <View
                  style={{
                    position: 'absolute',
                    top: -10,
                    left: '50%',
                    marginLeft: -10,
                    width: 20,
                    height: 20,
                    backgroundColor: 'rgba(10,22,40,0.95)',
                    borderLeftWidth: 1,
                    borderTopWidth: 1,
                    borderColor: 'rgba(255,255,255,0.15)',
                    transform: [{ rotate: '45deg' }],
                  }}
                />
                <Text className="text-white font-semibold text-base">{selectedTrophy.name}</Text>
                <Text className="text-af-silver text-sm mt-2 leading-5">{selectedTrophy.description}</Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export function TrophyCase({
  expanded,
  onToggle,
  trophies,
  title = 'Trophy Case',
  emptyText = 'No trophies earned yet',
  footer,
}: TrophyCaseProps) {
  const earnedTrophies = trophies.filter((trophy) => trophy.isEarned);
  const lockedTrophies = trophies.filter((trophy) => !trophy.isEarned);
  const [selectedTrophy, setSelectedTrophy] = useState<TrophyWithStats | null>(null);

  return (
    <View className="mt-3">
      <Pressable
        onPress={onToggle}
        className="flex-row items-center justify-between bg-white/10 border border-white/10 rounded-xl px-4 py-3"
      >
        <View className="flex-row items-center">
          <Text className="text-white font-semibold">{title}</Text>
          <View className="ml-2 bg-af-gold/15 border border-af-gold/30 rounded-full px-2 py-0.5">
            <Text className="text-af-gold text-xs font-semibold">
              {earnedTrophies.length} / {trophies.length}
            </Text>
          </View>
        </View>
        {expanded ? <ChevronUp size={18} color="#C0C0C0" /> : <ChevronDown size={18} color="#C0C0C0" />}
      </Pressable>

      {expanded ? (
        <View
          className="mt-3 rounded-2xl border overflow-hidden"
          style={{ backgroundColor: '#2A1D12', borderColor: '#6B4E2E' }}
        >
          <View style={{ height: 10, backgroundColor: '#6B4E2E' }} />
          <View
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
          />
          <View className="px-4 py-4">
            {earnedTrophies.length === 0 ? (
              <View className="rounded-xl border border-white/10 bg-black/10 p-4 items-center">
                <Text className="text-af-silver text-sm">{emptyText}</Text>
              </View>
            ) : (
              <View className="flex-row flex-wrap justify-between">
                {earnedTrophies.map((trophy, index) => {
                  const Icon = trophy.Icon;
                  return (
                    <Pressable
                      key={trophy.id}
                      onPress={() => setSelectedTrophy(trophy)}
                      className={cn(
                        "rounded-2xl p-3 mb-4 border",
                        index % 2 === 0 ? "mr-2" : "ml-2",
                        trophy.isHard ? "" : "border-white/10"
                      )}
                      style={{
                        width: '47%',
                        backgroundColor: trophy.isHard ? 'rgba(255, 215, 0, 0.08)' : 'rgba(255, 255, 255, 0.04)',
                        borderColor: trophy.isHard ? '#FFD700' : 'rgba(255,255,255,0.12)',
                      }}
                    >
                      <View
                        className="w-12 h-12 rounded-full items-center justify-center mb-3"
                        style={{ backgroundColor: trophy.iconBg }}
                      >
                        <Icon size={22} color={trophy.iconColor} />
                      </View>
                      <Text
                        className="font-semibold text-sm"
                        style={{ color: trophy.textColor }}
                        numberOfLines={2}
                      >
                        {trophy.name}
                      </Text>
                      <Text className="text-af-silver text-[11px] mt-2" numberOfLines={2}>
                        {trophy.description}
                      </Text>
                      <Text className="text-af-gold text-[11px] mt-3 font-semibold">
                        Earned by {trophy.earnRate.toFixed(0)}% of users
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {lockedTrophies.length > 0 ? (
              <>
                <View
                  className="my-2"
                  style={{ height: 8, backgroundColor: '#6B4E2E', borderRadius: 999 }}
                />
                <Text className="text-af-silver text-xs uppercase tracking-wider mt-3 mb-3">
                  Locked Trophies
                </Text>
                <View className="flex-row flex-wrap justify-between">
                  {lockedTrophies.map((trophy, index) => {
                    const Icon = trophy.Icon;
                    return (
                    <Pressable
                      key={trophy.id}
                      onPress={() => setSelectedTrophy(trophy)}
                      className={cn(
                        "rounded-2xl p-3 mb-4 border border-white/10",
                        index % 2 === 0 ? "mr-2" : "ml-2"
                      )}
                      style={{ width: '47%', backgroundColor: 'rgba(0,0,0,0.12)' }}
                    >
                      <View className="w-12 h-12 rounded-full items-center justify-center mb-3 bg-white/10">
                        <Icon size={22} color="#64748B" />
                      </View>
                        <Text className="text-white/70 font-semibold text-sm" numberOfLines={2}>
                          {trophy.name}
                        </Text>
                        <Text className="text-white/40 text-[11px] mt-2" numberOfLines={2}>
                          {trophy.description}
                        </Text>
                        <Text className="text-white/50 text-[11px] mt-3">
                          Earned by {trophy.earnRate.toFixed(0)}% of users
                        </Text>
                    </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {footer ? <View className="mt-2">{footer}</View> : null}
          </View>
          <View style={{ height: 10, backgroundColor: '#6B4E2E' }} />
        </View>
      ) : null}

      <Modal visible={!!selectedTrophy} transparent animationType="fade">
        <View className="flex-1 bg-black/80 items-center justify-center p-6">
          <View className="w-full max-w-sm rounded-3xl border p-6" style={{ backgroundColor: '#1E160F', borderColor: '#6B4E2E' }}>
            <View className="flex-row items-center justify-between mb-5">
              <Text className="text-white text-xl font-bold">Trophy Details</Text>
              <Pressable
                onPress={() => setSelectedTrophy(null)}
                className="w-8 h-8 rounded-full items-center justify-center bg-white/10"
              >
                <X size={18} color="#C0C0C0" />
              </Pressable>
            </View>

            {selectedTrophy ? (
              <>
                <View
                  className="w-16 h-16 rounded-full items-center justify-center mb-4"
                  style={{ backgroundColor: selectedTrophy.iconBg }}
                >
                  <selectedTrophy.Icon size={28} color={selectedTrophy.iconColor} />
                </View>
                <Text className="text-white text-lg font-semibold">{selectedTrophy.name}</Text>
                <Text className="text-af-silver leading-6 mt-3">{selectedTrophy.description}</Text>
                <Text className="text-af-gold font-semibold mt-4">
                  Earned by {selectedTrophy.earnRate.toFixed(0)}% of users
                </Text>
                <Text className="text-af-silver text-sm mt-2">
                  {selectedTrophy.isEarned ? 'Earned' : 'Not earned yet'}
                </Text>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}
