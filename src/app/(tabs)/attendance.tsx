import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Check, X } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, startOfWeek, addDays, subWeeks, addWeeks, isSameDay } from 'date-fns';
import { useMemberStore, useAuthStore, type Flight, canEditAttendance, formatRankDisplay } from '@/lib/store';
import { cn } from '@/lib/cn';
import { useTabSwipe } from '@/contexts/TabSwipeContext';
import { fetchAttendanceSessions, setAttendanceStatus } from '@/lib/supabaseData';

const FLIGHTS: Flight[] = ['Apex', 'Bomber', 'Cryptid', 'Doom', 'Ewok', 'Foxhound', 'ADF', 'DET'];
const WEEKLY_PROGRESS_TARGET = 5;
const NAME_COLUMN_WIDTH = 120;
const PROGRESS_COLUMN_WIDTH = 56;
const DAY_COLUMN_WIDTH = 60;
const HEADER_HEIGHT = 56;
const ROW_HEIGHT = 66;
const ATTENDANCE_FILTER_STORAGE_KEY = 'fitflight-attendance-filter';

export default function AttendanceScreen() {
  const router = useRouter();
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedFlight, setSelectedFlight] = useState<Flight | 'all'>('all');
  const [currentScrollX, setCurrentScrollX] = useState(0);
  const [tableViewportWidth, setTableViewportWidth] = useState(0);
  const [flightViewportWidth, setFlightViewportWidth] = useState(0);
  const { setSwipeEnabled } = useTabSwipe();
  const flightScrollRef = useRef<ScrollView | null>(null);
  const flightScrollXRef = useRef(0);
  const attendanceInteractionRef = useRef(false);
  const attendanceInteractionResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const weekTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const weekDragActivatedRef = useRef(false);

  const members = useMemberStore((state) => state.members);
  const ptSessions = useMemberStore((state) => state.ptSessions);
  const syncPTSessions = useMemberStore((state) => state.syncPTSessions);
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);

  const canEdit = user ? canEditAttendance(user.accountType) : false;
  const userSquadron = user?.squadron ?? 'Hawks';

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(currentWeekStart, index)),
    [currentWeekStart]
  );

  const flightStripWidth = useMemo(() => {
    const allWidth = 68;
    const flightWidth = 94;
    return allWidth + FLIGHTS.length * flightWidth;
  }, []);

  const dayColumnsWidth = weekDays.length * DAY_COLUMN_WIDTH;
  const horizontalOverflow = Math.max(dayColumnsWidth - tableViewportWidth, 0);
  const flightHorizontalOverflow = Math.max(flightStripWidth - flightViewportWidth, 0);
  const edgeThreshold = 2;
  const showLeftIndicator = horizontalOverflow > 0 && currentScrollX > edgeThreshold;
  const showRightIndicator = horizontalOverflow > 0 && currentScrollX < horizontalOverflow - edgeThreshold;

  const flightMembers = useMemo(() => {
    const squadronMembers = members.filter((member) => member.squadron === userSquadron);
    const filteredMembers = selectedFlight === 'all'
      ? [...squadronMembers]
      : squadronMembers.filter((member) => member.flight === selectedFlight);

    return filteredMembers.sort((left, right) => {
      const lastNameCompare = left.lastName.localeCompare(right.lastName);
      if (lastNameCompare !== 0) {
        return lastNameCompare;
      }

      return left.firstName.localeCompare(right.firstName);
    });
  }, [members, selectedFlight, userSquadron]);

  const getAttendanceDisplayName = useCallback((memberId: string) => {
    const member = members.find((entry) => entry.id === memberId);
    if (!member) {
      return { rank: '', name: '' };
    }

    const firstInitial = member.firstName.trim().charAt(0);
    return {
      rank: formatRankDisplay(member.rank),
      name: `${member.lastName.toUpperCase()}, ${firstInitial.toUpperCase()}`,
    };
  }, [members]);

  const getSession = useCallback((date: Date, flight: Flight, squadron: typeof userSquadron = userSquadron) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return ptSessions.find((session) => session.date === dateStr && session.flight === flight && (session.squadron ?? 'Hawks') === squadron);
  }, [ptSessions, userSquadron]);

  const isAttending = useCallback((date: Date, memberId: string, flight: Flight, squadron: typeof userSquadron = userSquadron) => {
    const session = getSession(date, flight, squadron);
    return session?.attendees.includes(memberId) ?? false;
  }, [getSession, userSquadron]);

  const getWeeklyAttendance = useCallback((memberId: string) => {
    const member = members.find((entry) => entry.id === memberId);
    if (!member) return 0;

    let count = 0;
    weekDays.forEach((day) => {
      if (isAttending(day, memberId, member.flight, member.squadron)) {
        count++;
      }
    });
    return count;
  }, [isAttending, members, weekDays]);

  const totalWeeklyCheckIns = useMemo(
    () => flightMembers.reduce((sum, member) => sum + getWeeklyAttendance(member.id), 0),
    [flightMembers, getWeeklyAttendance]
  );
  const averageWeeklyCheckIns = flightMembers.length > 0 ? totalWeeklyCheckIns / flightMembers.length : 0;
  const membersOnTarget = useMemo(
    () => flightMembers.filter((member) => getWeeklyAttendance(member.id) >= WEEKLY_PROGRESS_TARGET).length,
    [flightMembers, getWeeklyAttendance]
  );

  const markAttendanceInteraction = useCallback((active: boolean) => {
    if (attendanceInteractionResetRef.current) {
      clearTimeout(attendanceInteractionResetRef.current);
      attendanceInteractionResetRef.current = null;
    }

    if (active) {
      attendanceInteractionRef.current = true;
      return;
    }

    attendanceInteractionResetRef.current = setTimeout(() => {
      attendanceInteractionRef.current = false;
      attendanceInteractionResetRef.current = null;
    }, 40);
  }, []);

  const loadAttendanceFromBackend = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const sessions = await fetchAttendanceSessions(accessToken);
    syncPTSessions(sessions);
  }, [accessToken, syncPTSessions]);

  const handleToggleAttendance = async (date: Date, memberId: string, flight: Flight, squadron: typeof userSquadron = userSquadron) => {
    if (!canEdit || attendanceInteractionRef.current || !accessToken || !user) {
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const updatedSessions = await setAttendanceStatus({
        date: format(date, 'yyyy-MM-dd'),
        flight,
        squadron,
        memberId,
        createdBy: user.id,
        isAttending: !isAttending(date, memberId, flight, squadron),
        accessToken,
      });

      syncPTSessions(updatedSessions);
    } catch (error) {
      console.error('Unable to update attendance in Supabase.', error);
    }
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    Haptics.selectionAsync();
    setCurrentWeekStart((previous) => (direction === 'prev' ? subWeeks(previous, 1) : addWeeks(previous, 1)));
  };

  useEffect(() => {
    return () => {
      if (attendanceInteractionResetRef.current) {
        clearTimeout(attendanceInteractionResetRef.current);
      }
      setSwipeEnabled(true);
    };
  }, [setSwipeEnabled]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    void loadAttendanceFromBackend();
    const interval = setInterval(() => {
      void loadAttendanceFromBackend();
    }, 15000);

    return () => clearInterval(interval);
  }, [accessToken, loadAttendanceFromBackend]);

  useEffect(() => {
    let isMounted = true;

    const loadSavedFilter = async () => {
      const storedFilter = await AsyncStorage.getItem(ATTENDANCE_FILTER_STORAGE_KEY);
      if (!isMounted || !storedFilter) {
        return;
      }

      if (storedFilter === 'all' || FLIGHTS.includes(storedFilter as Flight)) {
        setSelectedFlight(storedFilter as Flight | 'all');
      }
    };

    void loadSavedFilter();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    void AsyncStorage.setItem(ATTENDANCE_FILTER_STORAGE_KEY, selectedFlight);
  }, [selectedFlight]);

  const handleTableLayout = useCallback((event: LayoutChangeEvent) => {
    const width = Math.max(event.nativeEvent.layout.width - NAME_COLUMN_WIDTH - PROGRESS_COLUMN_WIDTH, 0);
    setTableViewportWidth(width);
  }, []);

  const handleFlightStripLayout = useCallback((event: LayoutChangeEvent) => {
    setFlightViewportWidth(event.nativeEvent.layout.width);
  }, []);

  const handleAttendanceScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;
    setCurrentScrollX(x);
  }, []);

  return (
    <View className="flex-1">
      <LinearGradient
        colors={['#0A1628', '#001F5C', '#0A1628']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView edges={['top']} className="flex-1">
        <Animated.View entering={FadeInDown.delay(100).springify()} className="px-6 pt-4 pb-2">
          <Text className="text-white text-2xl font-bold">PT Attendance</Text>
          <Text className="text-af-silver text-sm mt-1">Track squadron fitness participation</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).springify()} className="flex-row items-center justify-between px-6 py-4">
          <Pressable onPress={() => navigateWeek('prev')} className="w-10 h-10 bg-white/10 rounded-full items-center justify-center">
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

          <Pressable onPress={() => navigateWeek('next')} className="w-10 h-10 bg-white/10 rounded-full items-center justify-center">
            <ChevronRight size={24} color="#C0C0C0" />
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).springify()} className="px-6 mb-4">
          <View className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <View onLayout={handleFlightStripLayout}>
              <ScrollView
                ref={flightScrollRef}
                horizontal
                bounces={false}
                scrollEnabled={flightHorizontalOverflow > 0}
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={(event) => {
                  const x = event.nativeEvent.contentOffset.x;
                  flightScrollXRef.current = x;
                }}
                onTouchStart={() => setSwipeEnabled(false)}
                onTouchEnd={() => setSwipeEnabled(true)}
                onTouchCancel={() => setSwipeEnabled(true)}
                onScrollBeginDrag={() => setSwipeEnabled(false)}
                onScrollEndDrag={() => setSwipeEnabled(true)}
                onMomentumScrollEnd={() => setSwipeEnabled(true)}
                style={{ flexGrow: 0 }}
              >
                <View className="flex-row">
                  <Pressable
                    onPress={() => {
                      setSelectedFlight('all');
                      Haptics.selectionAsync();
                    }}
                    className={cn(
                      'px-4 py-2 rounded-full mr-2 border',
                      selectedFlight === 'all' ? 'bg-af-accent border-af-accent' : 'bg-white/5 border-white/10'
                    )}
                  >
                    <Text className={cn('font-medium', selectedFlight === 'all' ? 'text-white' : 'text-white/60')}>All</Text>
                  </Pressable>

                  {FLIGHTS.map((flight) => (
                    <Pressable
                      key={flight}
                      onPress={() => {
                        setSelectedFlight(flight);
                        Haptics.selectionAsync();
                      }}
                      className={cn(
                        'px-4 py-2 rounded-full mr-2 border',
                        selectedFlight === flight ? 'bg-af-accent border-af-accent' : 'bg-white/5 border-white/10'
                      )}
                    >
                      <Text className={cn('font-medium', selectedFlight === flight ? 'text-white' : 'text-white/60')}>{flight}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        </Animated.View>

        <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.delay(125).springify()} className="mb-4">
            <View className="rounded-2xl border border-white/10 bg-white/6 overflow-hidden">
              <LinearGradient
                colors={['rgba(74,144,217,0.16)', 'rgba(20,184,166,0.07)', 'rgba(255,255,255,0.02)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ padding: 14 }}
              >
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-white font-semibold text-base">
                      {selectedFlight === 'all' ? `${userSquadron} Attendance` : `${selectedFlight} Flight`}
                    </Text>
                    <Text className="text-af-silver text-xs mt-1">
                      Tap a member for profile. Tap attendance markers to update.
                    </Text>
                  </View>
                  <View className="rounded-xl border border-white/10 bg-black/15 px-3 py-2 items-center min-w-[70px]">
                    <Text className="text-af-silver text-[10px] uppercase tracking-[0.4px]">At 5/5</Text>
                    <Text className="text-white text-lg font-bold mt-0.5">{membersOnTarget}</Text>
                  </View>
                </View>

                <View className="mt-3 flex-row" style={{ gap: 8 }}>
                  <View className="flex-1 rounded-xl border border-white/10 bg-black/10 px-3 py-2.5">
                    <Text className="text-af-silver text-[10px] uppercase tracking-[0.4px]">Members</Text>
                    <Text className="text-white text-lg font-bold mt-0.5">{flightMembers.length}</Text>
                  </View>
                  <View className="flex-1 rounded-xl border border-white/10 bg-black/10 px-3 py-2.5">
                    <Text className="text-af-silver text-[10px] uppercase tracking-[0.4px]">Week</Text>
                    <Text className="text-white text-lg font-bold mt-0.5">{totalWeeklyCheckIns}</Text>
                  </View>
                  <View className="flex-1 rounded-xl border border-white/10 bg-black/10 px-3 py-2.5">
                    <Text className="text-af-silver text-[10px] uppercase tracking-[0.4px]">Avg</Text>
                    <Text className="text-white text-lg font-bold mt-0.5">{averageWeeklyCheckIns.toFixed(1)}</Text>
                  </View>
                </View>
              </LinearGradient>
            </View>
          </Animated.View>

          <View onLayout={handleTableLayout}>
            <View className="flex-row rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
              <View style={{ width: NAME_COLUMN_WIDTH }} className="border-r border-white/10">
                <View className="flex-row items-center px-3" style={{ height: HEADER_HEIGHT }}>
                  <View style={{ width: NAME_COLUMN_WIDTH - 24 }}>
                    <Text className="text-af-silver text-xs uppercase tracking-[0.4px]">Member</Text>
                  </View>
                </View>

                {flightMembers.map((member, index) => {
                  const weeklyAttendance = getWeeklyAttendance(member.id);
                  const displayName = getAttendanceDisplayName(member.id);

                  return (
                    <Animated.View
                      key={`fixed-${member.id}`}
                      entering={FadeInUp.delay(250 + index * 50).springify()}
                      className="flex-row items-center px-3 border-t border-white/5"
                      style={{ height: ROW_HEIGHT }}
                    >
                      <Pressable
                        onPress={() => {
                          Haptics.selectionAsync();
                          router.push({ pathname: '/member-profile', params: { id: member.id } });
                        }}
                        style={{ width: NAME_COLUMN_WIDTH, paddingRight: 8 }}
                      >
                        <Text className="text-af-silver text-[11px]" numberOfLines={1}>{displayName.rank}</Text>
                        <Text className="text-white font-medium mt-0.5" numberOfLines={1}>{displayName.name}</Text>
                          <Text className="text-af-silver text-xs mt-1">{weeklyAttendance}/{WEEKLY_PROGRESS_TARGET} sessions</Text>
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </View>

              <View className="flex-1 relative">
                <ScrollView
                  horizontal
                  bounces={false}
                  scrollEnabled={horizontalOverflow > 0}
                  showsHorizontalScrollIndicator={false}
                  scrollEventThrottle={16}
                  onScroll={handleAttendanceScroll}
                  onTouchStart={(event) => {
                    weekTouchStartRef.current = {
                      x: event.nativeEvent.pageX,
                      y: event.nativeEvent.pageY,
                    };
                    weekDragActivatedRef.current = false;
                    setSwipeEnabled(false);
                  }}
                  onTouchMove={(event) => {
                    const start = weekTouchStartRef.current;
                    if (!start || weekDragActivatedRef.current) {
                      return;
                    }

                    const dx = Math.abs(event.nativeEvent.pageX - start.x);
                    const dy = Math.abs(event.nativeEvent.pageY - start.y);
                    if (dx > 6 || dy > 6) {
                      weekDragActivatedRef.current = true;
                      markAttendanceInteraction(true);
                    }
                  }}
                  onTouchEnd={() => {
                    weekTouchStartRef.current = null;
                    setSwipeEnabled(true);
                    if (weekDragActivatedRef.current) {
                      weekDragActivatedRef.current = false;
                      markAttendanceInteraction(false);
                    }
                  }}
                  onTouchCancel={() => {
                    weekTouchStartRef.current = null;
                    setSwipeEnabled(true);
                    if (weekDragActivatedRef.current) {
                      weekDragActivatedRef.current = false;
                      markAttendanceInteraction(false);
                    }
                  }}
                  onScrollBeginDrag={() => {
                    markAttendanceInteraction(true);
                    setSwipeEnabled(false);
                  }}
                  onScrollEndDrag={() => {
                    markAttendanceInteraction(false);
                    setSwipeEnabled(true);
                    weekDragActivatedRef.current = false;
                  }}
                  onMomentumScrollEnd={() => {
                    markAttendanceInteraction(false);
                    setSwipeEnabled(true);
                    weekDragActivatedRef.current = false;
                  }}
                >
                  <View style={{ width: dayColumnsWidth }}>
                    <View className="flex-row items-center" style={{ height: HEADER_HEIGHT }}>
                      {weekDays.map((day) => (
                        <View key={`header-${day.toISOString()}`} style={{ width: DAY_COLUMN_WIDTH }} className="items-center justify-center">
                          <Text className="text-af-silver text-xs uppercase tracking-[0.4px]">{format(day, 'EEE')}</Text>
                          <Text className="text-white font-bold">{format(day, 'd')}</Text>
                        </View>
                      ))}
                    </View>

                    {flightMembers.map((member, index) => (
                      <Animated.View
                        key={`days-${member.id}`}
                        entering={FadeInUp.delay(250 + index * 50).springify()}
                        className="flex-row items-center border-t border-white/5"
                        style={{ height: ROW_HEIGHT }}
                      >
                        {weekDays.map((day) => {
                          const attending = isAttending(day, member.id, member.flight, member.squadron);
                          return (
                            <Pressable
                              key={`${member.id}-${day.toISOString()}`}
                              onPress={() => handleToggleAttendance(day, member.id, member.flight, member.squadron)}
                              disabled={!canEdit}
                              style={{ width: DAY_COLUMN_WIDTH }}
                              className="items-center"
                            >
                              <View
                                className={cn(
                                  'w-10 h-10 rounded-full items-center justify-center border shadow-sm',
                                  attending ? 'bg-af-success/20 border-af-success' : 'bg-black/10 border-white/10'
                                )}
                              >
                                {attending ? <Check size={20} color="#22C55E" /> : <X size={20} color="#ffffff30" />}
                              </View>
                            </Pressable>
                          );
                        })}
                      </Animated.View>
                    ))}
                  </View>
                </ScrollView>

                {showLeftIndicator && (
                  <View pointerEvents="none" className="absolute left-0 top-0 bottom-0 w-8 justify-center items-start">
                    <LinearGradient
                      colors={['rgba(10,22,40,0.95)', 'rgba(10,22,40,0)']}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
                    />
                    <ChevronLeft size={16} color="#C0C0C0" />
                  </View>
                )}

                {showRightIndicator && (
                  <View pointerEvents="none" className="absolute right-0 top-0 bottom-0 w-8 justify-center items-end">
                    <LinearGradient
                      colors={['rgba(10,22,40,0)', 'rgba(10,22,40,0.95)']}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
                    />
                    <ChevronRight size={16} color="#C0C0C0" />
                  </View>
                )}
              </View>

              <View style={{ width: PROGRESS_COLUMN_WIDTH }} className="border-l border-white/10">
                <View className="items-center justify-center px-1" style={{ height: HEADER_HEIGHT }}>
                  <Text className="text-af-silver text-xs uppercase tracking-[0.4px] text-center">Progress</Text>
                </View>

                {flightMembers.map((member, index) => {
                  const weeklyAttendance = getWeeklyAttendance(member.id);
                  const progressPercent = Math.min((weeklyAttendance / WEEKLY_PROGRESS_TARGET) * 100, 100);

                  return (
                    <Animated.View
                      key={`progress-${member.id}`}
                      entering={FadeInUp.delay(250 + index * 50).springify()}
                      className="items-center justify-center border-t border-white/5"
                      style={{ height: ROW_HEIGHT }}
                    >
                      <View className="w-10 h-10 items-center justify-center">
                        <View className="w-8 h-8 rounded-full border-2 border-white/20 items-center justify-center overflow-hidden bg-black/10">
                          <View
                            className={cn(
                              'absolute bottom-0 left-0 right-0',
                              progressPercent >= 100 ? 'bg-af-success' : 'bg-af-accent'
                            )}
                            style={{ height: `${progressPercent}%` }}
                          />
                          <Text className="text-white text-xs font-bold z-10">{weeklyAttendance}</Text>
                        </View>
                      </View>
                    </Animated.View>
                  );
                })}
              </View>
            </View>
          </View>

          {flightMembers.length === 0 ? (
            <View className="items-center py-12">
              <Text className="text-white/40 text-base">No members in this flight</Text>
            </View>
          ) : null}
        </ScrollView>

        {!canEdit && (
          <View className="px-6 pb-4">
            <View className="bg-af-warning/10 border border-af-warning/30 rounded-xl p-4">
              <Text className="text-af-warning text-sm text-center">
                Only PFLs, UFPM, and Owner can modify attendance records
              </Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}
