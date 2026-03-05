import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Check, X, Plus, Calendar, Clock } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { format, startOfWeek, addDays, subWeeks, addWeeks, isSameDay } from 'date-fns';
import { useMemberStore, useAuthStore, type Flight, canEditAttendance, getDisplayName } from '@/lib/store';
import { cn } from '@/lib/cn';
import { SwipeableTabView } from '@/components/SwipeableTabView';

const FLIGHTS: Flight[] = ['Avatar', 'Bomber', 'Cryptid', 'Doom', 'Ewok', 'Foxhound', 'ADF', 'DET'];
const PT_DAYS = [1, 3, 5]; // Monday, Wednesday, Friday

export default function AttendanceScreen() {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedFlight, setSelectedFlight] = useState<Flight>('Avatar');

  const members = useMemberStore(s => s.members);
  const ptSessions = useMemberStore(s => s.ptSessions);
  const toggleAttendance = useMemberStore(s => s.toggleAttendance);
  const addPTSession = useMemberStore(s => s.addPTSession);
  const user = useAuthStore(s => s.user);
  const defaultPTSessionsPerWeek = useMemberStore(s => s.defaultPTSessionsPerWeek);

  const canEdit = user ? canEditAttendance(user.accountType) : false;

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  }, [currentWeekStart]);

  const ptDays = useMemo(() => {
    return weekDays.filter((_, i) => PT_DAYS.includes(i));
  }, [weekDays]);

  const flightMembers = useMemo(() => {
    return members.filter(m => m.flight === selectedFlight);
  }, [members, selectedFlight]);

  const getSession = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return ptSessions.find(s => s.date === dateStr && s.flight === selectedFlight);
  };

  const isAttending = (date: Date, memberId: string) => {
    const session = getSession(date);
    return session?.attendees.includes(memberId) ?? false;
  };

  const handleToggleAttendance = (date: Date, memberId: string) => {
    if (!canEdit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const dateStr = format(date, 'yyyy-MM-dd');
    let session = getSession(date);

    if (!session) {
      // Create session if it doesn't exist
      const newSession = {
        id: `session-${selectedFlight}-${dateStr}`,
        date: dateStr,
        flight: selectedFlight,
        attendees: [memberId],
        createdBy: user?.id ?? '',
      };
      addPTSession(newSession);
    } else {
      toggleAttendance(session.id, memberId);
    }
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    Haptics.selectionAsync();
    setCurrentWeekStart(prev =>
      direction === 'prev' ? subWeeks(prev, 1) : addWeeks(prev, 1)
    );
  };

  const getAttendanceRate = (memberId: string) => {
    const memberSessions = ptSessions.filter(
      s => s.flight === selectedFlight && s.attendees.includes(memberId)
    );
    const totalSessions = ptSessions.filter(s => s.flight === selectedFlight).length;
    if (totalSessions === 0) return 0;
    return Math.round((memberSessions.length / totalSessions) * 100);
  };

  // Get member's required sessions (based on fitness score or default)
  const getMemberRequiredSessions = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    return member?.requiredPTSessionsPerWeek ?? defaultPTSessionsPerWeek;
  };

  // Calculate weekly attendance for progress bar
  const getWeeklyAttendance = (memberId: string) => {
    let count = 0;
    ptDays.forEach(day => {
      if (isAttending(day, memberId)) count++;
    });
    return count;
  };

  return (
    <SwipeableTabView>
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
          className="px-6 pt-4 pb-2"
        >
          <Text className="text-white text-2xl font-bold">PT Attendance</Text>
          <Text className="text-af-silver text-sm mt-1">Track squadron fitness participation</Text>
        </Animated.View>

        {/* Week Navigation */}
        <Animated.View
          entering={FadeInDown.delay(150).springify()}
          className="flex-row items-center justify-between px-6 py-4"
        >
          <Pressable
            onPress={() => navigateWeek('prev')}
            className="w-10 h-10 bg-white/10 rounded-full items-center justify-center"
          >
            <ChevronLeft size={24} color="#C0C0C0" />
          </Pressable>

          <View className="items-center">
            <Text className="text-white font-semibold text-lg">
              {format(currentWeekStart, 'MMM d')} - {format(addDays(currentWeekStart, 6), 'MMM d, yyyy')}
            </Text>
            <Text className="text-af-silver text-xs mt-1">
              {isSameDay(currentWeekStart, startOfWeek(new Date(), { weekStartsOn: 1 })) ? 'Current Week' : ''}
            </Text>
          </View>

          <Pressable
            onPress={() => navigateWeek('next')}
            className="w-10 h-10 bg-white/10 rounded-full items-center justify-center"
          >
            <ChevronRight size={24} color="#C0C0C0" />
          </Pressable>
        </Animated.View>

        {/* Flight Selection */}
        <Animated.View
          entering={FadeInDown.delay(200).springify()}
          className="px-6 mb-4"
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
          >
            <View className="flex-row">
              {FLIGHTS.map((flight) => (
                <Pressable
                  key={flight}
                  onPress={() => {
                    setSelectedFlight(flight);
                    Haptics.selectionAsync();
                  }}
                  className={cn(
                    "px-4 py-2 rounded-full mr-2 border",
                    selectedFlight === flight
                      ? "bg-af-accent border-af-accent"
                      : "bg-white/5 border-white/10"
                  )}
                >
                  <Text className={cn(
                    "font-medium",
                    selectedFlight === flight ? "text-white" : "text-white/60"
                  )}>{flight}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </Animated.View>

        {/* PT Days Header */}
        <View className="flex-row px-6 mb-2">
          <View className="flex-1" />
          {ptDays.map((day) => (
            <View key={day.toISOString()} className="w-16 items-center">
              <Text className="text-af-silver text-xs">{format(day, 'EEE')}</Text>
              <Text className="text-white font-bold">{format(day, 'd')}</Text>
            </View>
          ))}
          <View className="w-14 items-center">
            <Text className="text-af-silver text-xs">Progress</Text>
          </View>
        </View>

        {/* Members List with Attendance */}
        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          {flightMembers.map((member, index) => {
            const weeklyAttendance = getWeeklyAttendance(member.id);
            const requiredSessions = getMemberRequiredSessions(member.id);
            const progressPercent = Math.min((weeklyAttendance / requiredSessions) * 100, 100);
            const displayName = getDisplayName(member);

            return (
              <Animated.View
                key={member.id}
                entering={FadeInUp.delay(250 + index * 50).springify()}
                className="flex-row items-center py-3 border-b border-white/5"
              >
                <View className="flex-1">
                  <Text className="text-white font-medium">{displayName}</Text>
                  <Text className="text-af-silver text-xs">{weeklyAttendance}/{requiredSessions} sessions</Text>
                </View>

                {ptDays.map((day) => {
                  const attending = isAttending(day, member.id);
                  return (
                    <Pressable
                      key={day.toISOString()}
                      onPress={() => handleToggleAttendance(day, member.id)}
                      disabled={!canEdit}
                      className="w-16 items-center"
                    >
                      <View className={cn(
                        "w-10 h-10 rounded-full items-center justify-center border",
                        attending
                          ? "bg-af-success/20 border-af-success"
                          : "bg-white/5 border-white/10"
                      )}>
                        {attending ? (
                          <Check size={20} color="#22C55E" />
                        ) : (
                          <X size={20} color="#ffffff30" />
                        )}
                      </View>
                    </Pressable>
                  );
                })}

                <View className="w-14 items-center">
                  {/* Progress bar */}
                  <View className="w-10 h-10 items-center justify-center">
                    <View className="w-8 h-8 rounded-full border-2 border-white/20 items-center justify-center overflow-hidden">
                      <View
                        className={cn(
                          "absolute bottom-0 left-0 right-0",
                          progressPercent >= 100 ? "bg-af-success" : "bg-af-accent"
                        )}
                        style={{ height: `${progressPercent}%` }}
                      />
                      <Text className="text-white text-xs font-bold z-10">
                        {weeklyAttendance}
                      </Text>
                    </View>
                  </View>
                </View>
              </Animated.View>
            );
          })}

          {flightMembers.length === 0 && (
            <View className="items-center py-12">
              <Text className="text-white/40 text-base">No members in this flight</Text>
            </View>
          )}
        </ScrollView>

        {/* Edit Notice */}
        {!canEdit && (
          <View className="px-6 pb-4">
            <View className="bg-af-warning/10 border border-af-warning/30 rounded-xl p-4">
              <Text className="text-af-warning text-sm text-center">
                Only PTLs, UFPM, and Owner can modify attendance records
              </Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    </View>
    </SwipeableTabView>
  );
}
