import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Check, X } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, startOfWeek, addDays, subWeeks, addWeeks, isSameDay } from 'date-fns';
import { useMemberStore, useAuthStore, type Flight, canEditAttendance, getDisplayName } from '@/lib/store';
import { cn } from '@/lib/cn';
import { useTabSwipe } from '@/contexts/TabSwipeContext';

const FLIGHTS: Flight[] = ['Apex', 'Bomber', 'Cryptid', 'Doom', 'Ewok', 'Foxhound', 'ADF', 'DET'];
const WEEKLY_PROGRESS_TARGET = 5;
const NAME_COLUMN_WIDTH = 148;
const PROGRESS_COLUMN_WIDTH = 64;
const DAY_COLUMN_WIDTH = 64;
const ATTENDANCE_FILTER_STORAGE_KEY = 'fitflight-attendance-filter';

export default function AttendanceScreen() {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedFlight, setSelectedFlight] = useState<Flight | 'all'>('all');
  const [currentScrollX, setCurrentScrollX] = useState(0);
  const { setSwipeEnabled } = useTabSwipe();
  const headerScrollRef = useRef<ScrollView | null>(null);
  const rowScrollRefs = useRef<Record<string, ScrollView | null>>({});
  const syncingSourceRef = useRef<string | null>(null);
  const currentScrollXRef = useRef(0);
  const dragStartScrollXRef = useRef(0);
  const [tableViewportWidth, setTableViewportWidth] = useState(0);

  const members = useMemberStore(s => s.members);
  const ptSessions = useMemberStore(s => s.ptSessions);
  const toggleAttendance = useMemberStore(s => s.toggleAttendance);
  const addPTSession = useMemberStore(s => s.addPTSession);
  const user = useAuthStore(s => s.user);

  const canEdit = user ? canEditAttendance(user.accountType) : false;

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  }, [currentWeekStart]);
  const dayColumnsWidth = weekDays.length * DAY_COLUMN_WIDTH;
  const horizontalOverflow = Math.max(dayColumnsWidth - tableViewportWidth, 0);
  const edgeThreshold = 2;
  const showLeftIndicator = horizontalOverflow > 0 && currentScrollX > edgeThreshold;
  const showRightIndicator = horizontalOverflow > 0 && currentScrollX < horizontalOverflow - edgeThreshold;

  const flightMembers = useMemo(() => {
    const filteredMembers = selectedFlight === 'all'
      ? [...members]
      : members.filter(m => m.flight === selectedFlight);

    return filteredMembers.sort((a, b) => {
      const lastNameCompare = a.lastName.localeCompare(b.lastName);
      if (lastNameCompare !== 0) {
        return lastNameCompare;
      }

      return a.firstName.localeCompare(b.firstName);
    });
  }, [members, selectedFlight]);

  const getAttendanceDisplayName = useCallback((memberId: string) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return '';

    const firstInitial = member.firstName.trim().charAt(0);
    return `${member.rank} ${member.lastName}, ${firstInitial}`;
  }, [members]);

  const getSession = (date: Date, flight: Flight) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return ptSessions.find(s => s.date === dateStr && s.flight === flight);
  };

  const isAttending = (date: Date, memberId: string, flight: Flight) => {
    const session = getSession(date, flight);
    return session?.attendees.includes(memberId) ?? false;
  };

  const handleToggleAttendance = (date: Date, memberId: string, flight: Flight) => {
    if (!canEdit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const dateStr = format(date, 'yyyy-MM-dd');
    let session = getSession(date, flight);

    if (!session) {
      // Create session if it doesn't exist
      const newSession = {
        id: `session-${flight}-${dateStr}`,
        date: dateStr,
        flight,
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
    if (selectedFlight === 'all') return 0;

    const memberSessions = ptSessions.filter(
      s => s.flight === selectedFlight && s.attendees.includes(memberId)
    );
    const totalSessions = ptSessions.filter(s => s.flight === selectedFlight).length;
    if (totalSessions === 0) return 0;
    return Math.round((memberSessions.length / totalSessions) * 100);
  };

  // Calculate weekly attendance for progress bar
  const getWeeklyAttendance = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return 0;

    let count = 0;
    weekDays.forEach(day => {
      if (isAttending(day, memberId, member.flight)) count++;
    });
    return count;
  };

  useEffect(() => {
    return () => {
      setSwipeEnabled(true);
    };
  }, [setSwipeEnabled]);

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

    loadSavedFilter();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(ATTENDANCE_FILTER_STORAGE_KEY, selectedFlight);
  }, [selectedFlight]);

  const updateSwipeState = useCallback((x: number) => {
    const epsilon = 2;
    const atBoundary = horizontalOverflow <= 0 || x <= epsilon || x >= horizontalOverflow - epsilon;
    setSwipeEnabled(atBoundary);
  }, [horizontalOverflow, setSwipeEnabled]);

  const syncHorizontalScroll = useCallback((x: number, source: string) => {
    currentScrollXRef.current = x;
    setCurrentScrollX(x);

    if (syncingSourceRef.current === source) {
      return;
    }

    syncingSourceRef.current = source;

    if (source !== 'header') {
      headerScrollRef.current?.scrollTo({ x, animated: false });
    }

    Object.entries(rowScrollRefs.current).forEach(([key, ref]) => {
      if (key !== source) {
        ref?.scrollTo({ x, animated: false });
      }
    });

    requestAnimationFrame(() => {
      syncingSourceRef.current = null;
    });
  }, []);

  const handleHorizontalScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>, source: string) => {
    const x = event.nativeEvent.contentOffset.x;
    syncHorizontalScroll(x, source);
    updateSwipeState(x);
  }, [syncHorizontalScroll, updateSwipeState]);

  const handleTableLayout = useCallback((event: LayoutChangeEvent) => {
    const width = Math.max(event.nativeEvent.layout.width - NAME_COLUMN_WIDTH - PROGRESS_COLUMN_WIDTH, 0);
    setTableViewportWidth(width);
  }, []);

  const registerRowScrollRef = useCallback((memberId: string, ref: ScrollView | null) => {
    rowScrollRefs.current[memberId] = ref;
    if (ref && currentScrollXRef.current > 0) {
      ref.scrollTo({ x: currentScrollXRef.current, animated: false });
    }
  }, []);

  const canCaptureHorizontalDrag = useCallback((dx: number, dy: number) => {
    if (horizontalOverflow <= 0) {
      return false;
    }

    if (Math.abs(dx) < 6 || Math.abs(dx) <= Math.abs(dy)) {
      return false;
    }

    const movingTowardLeft = dx > 0;
    const movingTowardRight = dx < 0;
    const canScrollLeft = currentScrollXRef.current > edgeThreshold;
    const canScrollRight = currentScrollXRef.current < horizontalOverflow - edgeThreshold;

    return (movingTowardLeft && canScrollLeft) || (movingTowardRight && canScrollRight);
  }, [edgeThreshold, horizontalOverflow]);

  const attendancePanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gestureState) => canCaptureHorizontalDrag(gestureState.dx, gestureState.dy),
    onPanResponderGrant: () => {
      dragStartScrollXRef.current = currentScrollXRef.current;
      updateSwipeState(currentScrollXRef.current);
    },
    onPanResponderMove: (_, gestureState) => {
      const nextX = Math.max(
        0,
        Math.min(dragStartScrollXRef.current - gestureState.dx, horizontalOverflow)
      );
      syncHorizontalScroll(nextX, 'drag');
      updateSwipeState(nextX);
    },
    onPanResponderRelease: () => {
      updateSwipeState(currentScrollXRef.current);
    },
    onPanResponderTerminate: () => {
      updateSwipeState(currentScrollXRef.current);
    },
  }), [canCaptureHorizontalDrag, horizontalOverflow, syncHorizontalScroll, updateSwipeState]);

  return (
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
              <Pressable
                onPress={() => {
                  setSelectedFlight('all');
                  Haptics.selectionAsync();
                }}
                className={cn(
                  "px-4 py-2 rounded-full mr-2 border",
                  selectedFlight === 'all'
                    ? "bg-af-accent border-af-accent"
                    : "bg-white/5 border-white/10"
                )}
              >
                <Text className={cn(
                  "font-medium",
                  selectedFlight === 'all' ? "text-white" : "text-white/60"
                )}>All</Text>
              </Pressable>

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

        {/* Attendance Table Header */}
        <View className="px-6 mb-2" onLayout={handleTableLayout}>
          <View className="flex-row items-center">
            <View style={{ width: NAME_COLUMN_WIDTH }}>
              <Text className="text-af-silver text-xs">Member</Text>
            </View>
            <View className="flex-1 relative" {...attendancePanResponder.panHandlers}>
              <ScrollView
                ref={headerScrollRef}
                horizontal
                bounces={false}
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={(event) => handleHorizontalScroll(event, 'header')}
                onTouchStart={() => updateSwipeState(currentScrollXRef.current)}
                onScrollEndDrag={(event) => updateSwipeState(event.nativeEvent.contentOffset.x)}
                onMomentumScrollEnd={(event) => updateSwipeState(event.nativeEvent.contentOffset.x)}
              >
                <View className="flex-row" style={{ width: dayColumnsWidth }}>
                  {weekDays.map((day) => (
                    <View key={day.toISOString()} style={{ width: DAY_COLUMN_WIDTH }} className="items-center">
                      <Text className="text-af-silver text-xs">{format(day, 'EEE')}</Text>
                      <Text className="text-white font-bold">{format(day, 'd')}</Text>
                    </View>
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
            <View style={{ width: PROGRESS_COLUMN_WIDTH }} className="items-center">
              <Text className="text-af-silver text-xs">Progress</Text>
            </View>
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
            const progressPercent = Math.min((weeklyAttendance / WEEKLY_PROGRESS_TARGET) * 100, 100);
            const displayName = getAttendanceDisplayName(member.id);

            return (
              <Animated.View
                key={member.id}
                entering={FadeInUp.delay(250 + index * 50).springify()}
                className="py-3 border-b border-white/5"
              >
                <View className="flex-row items-center">
                  <View style={{ width: NAME_COLUMN_WIDTH, paddingRight: 8 }}>
                    <Text className="text-white font-medium">{displayName}</Text>
                    <Text className="text-af-silver text-xs">{weeklyAttendance}/{WEEKLY_PROGRESS_TARGET} sessions</Text>
                  </View>

                  <View className="flex-1 relative" {...attendancePanResponder.panHandlers}>
                    <ScrollView
                      ref={(ref) => registerRowScrollRef(member.id, ref)}
                      horizontal
                      bounces={false}
                      showsHorizontalScrollIndicator={false}
                      scrollEventThrottle={16}
                      onScroll={(event) => handleHorizontalScroll(event, member.id)}
                      onTouchStart={() => updateSwipeState(currentScrollXRef.current)}
                      onScrollEndDrag={(event) => updateSwipeState(event.nativeEvent.contentOffset.x)}
                      onMomentumScrollEnd={(event) => updateSwipeState(event.nativeEvent.contentOffset.x)}
                    >
                      <View className="flex-row" style={{ width: dayColumnsWidth }}>
                        {weekDays.map((day) => {
                          const attending = isAttending(day, member.id, member.flight);
                          return (
                            <Pressable
                              key={day.toISOString()}
                              onPress={() => handleToggleAttendance(day, member.id, member.flight)}
                              disabled={!canEdit}
                              style={{ width: DAY_COLUMN_WIDTH }}
                              className="items-center"
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
                      </View>
                    </ScrollView>
                    {showLeftIndicator && (
                      <View pointerEvents="none" className="absolute left-0 top-0 bottom-0 w-8 justify-center items-start">
                        <LinearGradient
                          colors={['rgba(10,22,40,0.92)', 'rgba(10,22,40,0)']}
                          start={{ x: 0, y: 0.5 }}
                          end={{ x: 1, y: 0.5 }}
                          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
                        />
                        <ChevronLeft size={14} color="#C0C0C0" />
                      </View>
                    )}
                    {showRightIndicator && (
                      <View pointerEvents="none" className="absolute right-0 top-0 bottom-0 w-8 justify-center items-end">
                        <LinearGradient
                          colors={['rgba(10,22,40,0)', 'rgba(10,22,40,0.92)']}
                          start={{ x: 0, y: 0.5 }}
                          end={{ x: 1, y: 0.5 }}
                          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
                        />
                        <ChevronRight size={14} color="#C0C0C0" />
                      </View>
                    )}
                  </View>

                  <View style={{ width: PROGRESS_COLUMN_WIDTH }} className="items-center">
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
  );
}
