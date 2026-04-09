import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronUp, ChevronDown, Calendar, Clock, FileText, Check, X, Edit3, Trash2 } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { addDays, format, startOfWeek } from 'date-fns';
import { useMemberStore, useAuthStore, type Flight, type ScheduledPTSession, canEditAttendance } from '@/lib/store';
import { cn } from '@/lib/cn';
import {
  createScheduledPTSession,
  deleteScheduledPTSession as deleteScheduledPTSessionFromSupabase,
  updateScheduledPTSession as updateScheduledPTSessionInSupabase,
} from '@/lib/supabaseData';

const FLIGHTS: Flight[] = ['Apex', 'Bomber', 'Cryptid', 'Doom', 'Ewok', 'Foxhound', 'ADF', 'DET'];
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hours) => hours.toString().padStart(2, '0'));
const MINUTE_OPTIONS = ['00', '15', '30', '45'];

export default function ScheduleSessionScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const addScheduledSession = useMemberStore((s) => s.addScheduledSession);
  const updateScheduledSession = useMemberStore((s) => s.updateScheduledSession);
  const deleteScheduledSession = useMemberStore((s) => s.deleteScheduledSession);
  const scheduledSessions = useMemberStore((s) => s.scheduledSessions);
  const members = useMemberStore((s) => s.members);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [selectedFlights, setSelectedFlights] = useState<Flight[]>(user?.flight ? [user.flight] : ['Apex']);
  const [description, setDescription] = useState('');
  const [editingSession, setEditingSession] = useState<ScheduledPTSession | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [isSavingSession, setIsSavingSession] = useState(false);

  const canEdit = user ? canEditAttendance(user.accountType) : false;
  const userSquadron = user?.squadron ?? 'Hawks';
  const currentWeekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const currentWeekStartKey = format(currentWeekStart, 'yyyy-MM-dd');
  const currentWeekEndKey = format(addDays(currentWeekStart, 6), 'yyyy-MM-dd');
  const creatorNameById = useMemo(
    () =>
      new Map(
        members.map((member) => [
          member.id,
          `${member.rank} ${member.firstName} ${member.lastName}`,
        ])
      ),
    [members]
  );

  const upcomingSessions = useMemo(
    () =>
      scheduledSessions
        .filter((session) => {
          return (
            (session.squadron ?? 'Hawks') === userSquadron &&
            session.date >= currentWeekStartKey &&
            session.date <= currentWeekEndKey
          );
        })
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
    [currentWeekEndKey, currentWeekStartKey, scheduledSessions, userSquadron]
  );

  const toggleFlightSelection = (flight: Flight) => {
    setSelectedFlights((current) => {
      if (current.includes(flight)) {
        if (current.length === 1) {
          return current;
        }
        return current.filter((entry) => entry !== flight);
      }

      return [...current, flight];
    });
    Haptics.selectionAsync();
  };

  const resetForm = () => {
    setDescription('');
    setSelectedFlights(user?.flight ? [user.flight] : ['Apex']);
    setEditingSession(null);
    setShowEditModal(false);
    setSessionError('');
  };

  const handleDateChange = (_event: unknown, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
    }
  };

  const handleTimeChange = (_event: unknown, time?: Date) => {
    setShowTimePicker(false);
    if (time) {
      setSelectedTime(time);
    }
  };

  const handleWebDateChange = (value: string) => {
    if (!value) {
      return;
    }

    const nextDate = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(nextDate.getTime())) {
      setSelectedDate(nextDate);
    }
  };

  const handleWebTimeChange = (value: string) => {
    const [hours, minutes] = value.split(':');
    if (!hours || !minutes) {
      return;
    }

    const nextTime = new Date(selectedTime);
    nextTime.setHours(Number(hours), Number(minutes), 0, 0);
    setSelectedTime(nextTime);
  };

  const handleWebHourChange = (value: string) => {
    const nextTime = new Date(selectedTime);
    nextTime.setHours(Number(value), nextTime.getMinutes(), 0, 0);
    setSelectedTime(nextTime);
  };

  const handleWebMinuteChange = (value: string) => {
    const nextTime = new Date(selectedTime);
    nextTime.setMinutes(Number(value), 0, 0);
    setSelectedTime(nextTime);
  };

  const stepHour = (direction: 1 | -1) => {
    const currentIndex = HOUR_OPTIONS.indexOf(format(selectedTime, 'HH'));
    const nextIndex = (currentIndex + direction + HOUR_OPTIONS.length) % HOUR_OPTIONS.length;
    handleWebHourChange(HOUR_OPTIONS[nextIndex]);
  };

  const stepMinute = (direction: 1 | -1) => {
    const currentIndex = MINUTE_OPTIONS.indexOf(format(selectedTime, 'mm'));
    const nextIndex = (currentIndex + direction + MINUTE_OPTIONS.length) % MINUTE_OPTIONS.length;
    handleWebMinuteChange(MINUTE_OPTIONS[nextIndex]);
  };

  const handleCreateSession = () => {
    const run = async () => {
      if (!user || !accessToken || !description.trim() || selectedFlights.length === 0) {
        return;
      }

      setIsSavingSession(true);
      setSessionError('');

      const newSession: ScheduledPTSession = {
        id: Date.now().toString(),
        date: format(selectedDate, 'yyyy-MM-dd'),
        time: format(selectedTime, 'HH:mm'),
        description: description.trim(),
        flights: selectedFlights,
        squadron: userSquadron,
        createdBy: user.id,
      };

      const savedSession = await createScheduledPTSession(newSession, accessToken);
      addScheduledSession(savedSession);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    void run()
      .catch((error) => {
        setSessionError(error instanceof Error ? error.message : 'Unable to create PT session.');
      })
      .finally(() => {
        setIsSavingSession(false);
      });
  };

  const handleEditSession = () => {
    const run = async () => {
      if (!editingSession || !accessToken || !description.trim() || selectedFlights.length === 0) {
        return;
      }

      setIsSavingSession(true);
      setSessionError('');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const nextSession: ScheduledPTSession = {
        ...editingSession,
        date: format(selectedDate, 'yyyy-MM-dd'),
        time: format(selectedTime, 'HH:mm'),
        description: description.trim(),
        flights: selectedFlights,
        squadron: userSquadron,
      };

      const savedSession = await updateScheduledPTSessionInSupabase(nextSession, accessToken);
      updateScheduledSession(editingSession.id, savedSession);
      resetForm();
    };

    void run()
      .catch((error) => {
        setSessionError(error instanceof Error ? error.message : 'Unable to update PT session.');
      })
      .finally(() => {
        setIsSavingSession(false);
      });
  };

  const handleDeleteSession = (id: string) => {
    const run = async () => {
      if (!accessToken) {
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await deleteScheduledPTSessionFromSupabase(id, accessToken);
      deleteScheduledSession(id);
    };

    void run().catch((error) => {
      setSessionError(error instanceof Error ? error.message : 'Unable to delete PT session.');
    });
  };

  const openEditModal = (session: ScheduledPTSession) => {
    setEditingSession(session);
    setSelectedDate(new Date(`${session.date}T00:00:00`));
    const [hours, minutes] = session.time.split(':');
    const time = new Date();
    time.setHours(parseInt(hours, 10), parseInt(minutes, 10));
    setSelectedTime(time);
    setSelectedFlights(session.flights);
    setDescription(session.description);
    setSessionError('');
    setShowEditModal(true);
  };

  const renderFlightSelector = () => (
    <View className="mb-4">
      <Text className="text-white/60 text-sm mb-2">Flights</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingRight: 8 }}
        nestedScrollEnabled
      >
        <View className="flex-row">
          {FLIGHTS.map((flight) => (
            <Pressable
              key={flight}
              onPress={() => toggleFlightSelection(flight)}
              className={cn(
                'px-4 py-2 rounded-xl mr-2 border',
                selectedFlights.includes(flight)
                  ? 'bg-af-accent border-af-accent'
                  : 'bg-white/5 border-white/10'
              )}
            >
              <Text className={cn('font-medium', selectedFlights.includes(flight) ? 'text-white' : 'text-white/60')}>
                {flight}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <Text className="text-white/40 text-xs mt-2">Selected: {selectedFlights.join(', ')}</Text>
    </View>
  );

  if (!canEdit) {
    return (
      <View className="flex-1">
        <LinearGradient
          colors={['#0A1628', '#001F5C', '#0A1628']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
        <SafeAreaView edges={['top']} className="flex-1">
          <View className="px-6 pt-4 pb-2 flex-row items-center">
            <Pressable onPress={() => router.back()} className="w-10 h-10 bg-white/10 rounded-full items-center justify-center mr-4">
              <ChevronLeft size={24} color="#C0C0C0" />
            </Pressable>
            <Text className="text-white text-xl font-bold">PT Sessions</Text>
          </View>
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-af-silver text-center">
              Only PFLs, UFPM, Squadron Leadership, and Owner can schedule PT sessions.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <LinearGradient
        colors={['#0A1628', '#001F5C', '#0A1628']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView edges={['top']} className="flex-1">
        <Animated.View entering={FadeInDown.delay(100).springify()} className="px-6 pt-4 pb-2 flex-row items-center">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            className="w-10 h-10 bg-white/10 rounded-full items-center justify-center mr-4"
          >
            <ChevronLeft size={24} color="#C0C0C0" />
          </Pressable>
          <Text className="text-white text-xl font-bold">Schedule PT Session</Text>
        </Animated.View>

        <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.delay(150).springify()} className="mt-4 p-4 bg-white/5 rounded-2xl border border-white/10">
            <Text className="text-white font-semibold text-lg mb-4">New Session</Text>

            {Platform.OS === 'web' ? (
              <View className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10 mb-4">
                <Calendar size={20} color="#C0C0C0" />
                <View className="flex-1 ml-3">
                  <Text className="text-white/60 text-xs mb-1">Date</Text>
                  <input
                    type="date"
                    value={format(selectedDate, 'yyyy-MM-dd')}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    onChange={(event) => handleWebDateChange(event.target.value)}
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      color: 'white',
                      outline: 'none',
                      fontSize: 16,
                    }}
                  />
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setShowDatePicker(true)}
                className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10 mb-4"
              >
                <Calendar size={20} color="#C0C0C0" />
                <Text className="flex-1 ml-3 text-white">{format(selectedDate, 'EEEE, MMMM d, yyyy')}</Text>
              </Pressable>
            )}

            {Platform.OS === 'web' ? (
              <View className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10 mb-4">
                <Clock size={20} color="#C0C0C0" />
                <View className="flex-1 ml-3">
                  <Text className="text-white/60 text-xs mb-1">Time</Text>
                  <div style={{ display: 'flex', flexDirection: 'row', gap: 12, userSelect: 'none' }}>
                    <View className="flex-1 rounded-xl border border-white/10 bg-black/10 overflow-hidden">
                      <View className="items-center py-2 border-b border-white/5">
                        <Text className="text-white/60 text-[11px] uppercase tracking-[0.4px]">Hour</Text>
                      </View>
                      <View style={{ height: 120 }} className="flex-row items-center px-3 py-2">
                        <View className="mr-3 items-center justify-center">
                          <Pressable onPress={() => stepHour(-1)} className="w-9 h-8 items-center justify-center">
                            <ChevronUp size={18} color="#C0C0C0" />
                          </Pressable>
                          <Pressable onPress={() => stepHour(1)} className="w-9 h-8 items-center justify-center mt-2">
                            <ChevronDown size={18} color="#C0C0C0" />
                          </Pressable>
                        </View>
                        <View
                          className="flex-1 rounded-xl border px-2 py-2"
                          style={{
                            borderColor: 'rgba(125, 211, 252, 0.55)',
                            backgroundColor: 'rgba(74, 144, 217, 0.18)',
                          }}
                        >
                          {[-1, 0, 1].map((offset) => {
                            const currentIndex = HOUR_OPTIONS.indexOf(format(selectedTime, 'HH'));
                            const option = HOUR_OPTIONS[(currentIndex + offset + HOUR_OPTIONS.length) % HOUR_OPTIONS.length];
                            const isActive = offset === 0;
                            return (
                              <Pressable
                                key={`hour-${offset}-${option}`}
                                onPress={() => handleWebHourChange(option)}
                                className="items-center justify-center rounded-lg"
                                style={{
                                  height: 30,
                                  backgroundColor: isActive ? 'rgba(74,144,217,0.18)' : 'transparent',
                                }}
                              >
                                <Text
                                  className={cn('font-semibold', isActive ? 'text-white text-lg' : 'text-af-silver')}
                                  style={{ userSelect: 'none' }}
                                >
                                  {option}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    </View>

                    <View className="flex-1 rounded-xl border border-white/10 bg-black/10 overflow-hidden">
                      <View className="items-center py-2 border-b border-white/5">
                        <Text className="text-white/60 text-[11px] uppercase tracking-[0.4px]">Minute</Text>
                      </View>
                      <View style={{ height: 120 }} className="flex-row items-center px-3 py-2">
                        <View className="mr-3 items-center justify-center">
                          <Pressable onPress={() => stepMinute(-1)} className="w-9 h-8 items-center justify-center">
                            <ChevronUp size={18} color="#C0C0C0" />
                          </Pressable>
                          <Pressable onPress={() => stepMinute(1)} className="w-9 h-8 items-center justify-center mt-2">
                            <ChevronDown size={18} color="#C0C0C0" />
                          </Pressable>
                        </View>
                        <View
                          className="flex-1 rounded-xl border px-2 py-2"
                          style={{
                            borderColor: 'rgba(125, 211, 252, 0.55)',
                            backgroundColor: 'rgba(74, 144, 217, 0.18)',
                          }}
                        >
                          {[-1, 0, 1].map((offset) => {
                            const currentIndex = MINUTE_OPTIONS.indexOf(format(selectedTime, 'mm'));
                            const option = MINUTE_OPTIONS[(currentIndex + offset + MINUTE_OPTIONS.length) % MINUTE_OPTIONS.length];
                            const isActive = offset === 0;
                            return (
                              <Pressable
                                key={`minute-${offset}-${option}`}
                                onPress={() => handleWebMinuteChange(option)}
                                className="items-center justify-center rounded-lg"
                                style={{
                                  height: 30,
                                  backgroundColor: isActive ? 'rgba(74,144,217,0.18)' : 'transparent',
                                }}
                              >
                                <Text
                                  className={cn('font-semibold', isActive ? 'text-white text-lg' : 'text-af-silver')}
                                  style={{ userSelect: 'none' }}
                                >
                                  {option}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    </View>
                  </div>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setShowTimePicker(true)}
                className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10 mb-4"
              >
                <Clock size={20} color="#C0C0C0" />
                <Text className="flex-1 ml-3 text-white">{format(selectedTime, 'HH:mm')} (Military Time)</Text>
              </Pressable>
            )}

            {renderFlightSelector()}

            <View className="mb-4">
              <Text className="text-white/60 text-sm mb-2">Description</Text>
              <View className="flex-row items-start bg-white/10 rounded-xl px-4 py-3 border border-white/10">
                <FileText size={20} color="#C0C0C0" />
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="e.g., Group run at track, HIIT session..."
                  placeholderTextColor="#ffffff40"
                  multiline
                  className="flex-1 ml-3 text-white text-base"
                  style={{ minHeight: 60 }}
                />
              </View>
            </View>

            {sessionError ? <Text className="text-af-danger text-sm mb-4">{sessionError}</Text> : null}

            <Pressable
              onPress={handleCreateSession}
              disabled={!description.trim() || selectedFlights.length === 0 || isSavingSession}
              className={cn(
                'py-4 rounded-xl flex-row items-center justify-center',
                description.trim() && selectedFlights.length > 0 && !isSavingSession ? 'bg-af-accent' : 'bg-white/10'
              )}
            >
              <Check
                size={20}
                color={description.trim() && selectedFlights.length > 0 && !isSavingSession ? 'white' : '#666666'}
              />
              <Text
                className={cn(
                  'font-bold ml-2',
                  description.trim() && selectedFlights.length > 0 && !isSavingSession ? 'text-white' : 'text-white/40'
                )}
              >
                {isSavingSession ? 'Saving...' : 'Create Session'}
              </Text>
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).springify()} className="mt-6">
            <Text className="text-white font-semibold text-lg mb-1">Scheduled PT Sessions</Text>
            <Text className="text-af-silver text-xs mb-3">
              {format(currentWeekStart, 'MMM d')} - {format(addDays(currentWeekStart, 6), 'MMM d, yyyy')} · {userSquadron}
            </Text>

            {upcomingSessions.length === 0 ? (
              <View className="bg-white/5 rounded-2xl border border-white/10 p-6 items-center">
                <Calendar size={32} color="#C0C0C0" />
                <Text className="text-af-silver mt-2">No PT sessions scheduled for this week</Text>
              </View>
            ) : (
              upcomingSessions.map((session) => (
                <View key={session.id} className="bg-white/5 rounded-xl p-4 mb-3 border border-white/10">
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1">
                      <Text className="text-white font-semibold">{session.description}</Text>
                      <Text className="text-af-silver text-sm mt-1">
                        {format(new Date(session.date), 'EEE, MMM d')} at {session.time}
                      </Text>
                      <Text className="text-af-silver text-xs mt-1">
                        Flights: {session.flights.join(', ')}
                      </Text>
                      <Text className="text-af-silver text-xs mt-1">
                        Scheduled by {creatorNameById.get(session.createdBy) ?? 'Unknown member'}
                      </Text>
                      <View className="flex-row flex-wrap items-center mt-2">
                        {session.flights.map((flight) => (
                          <View key={`${session.id}-${flight}`} className="bg-af-accent/20 px-2 py-1 rounded-full mr-2 mb-2">
                            <Text className="text-af-accent text-xs">{flight}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                    <View className="flex-row">
                      <Pressable
                        onPress={() => openEditModal(session)}
                        className="w-8 h-8 bg-white/10 rounded-full items-center justify-center mr-2"
                      >
                        <Edit3 size={16} color="#C0C0C0" />
                      </Pressable>
                      <Pressable
                        onPress={() => handleDeleteSession(session.id)}
                        className="w-8 h-8 bg-af-danger/20 rounded-full items-center justify-center"
                      >
                        <Trash2 size={16} color="#EF4444" />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))
            )}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      {showDatePicker ? (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="spinner"
          onChange={handleDateChange}
          minimumDate={new Date()}
          themeVariant="dark"
        />
      ) : null}

      {showTimePicker ? (
        <DateTimePicker
          value={selectedTime}
          mode="time"
          display="spinner"
          onChange={handleTimeChange}
          is24Hour
          themeVariant="dark"
        />
      ) : null}

      <Modal visible={showEditModal} transparent animationType="slide">
        <View className="flex-1 bg-black/80 justify-end">
          <View className="bg-af-navy rounded-t-3xl p-6 pb-12">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-white text-xl font-bold">Edit Session</Text>
              <Pressable
                onPress={resetForm}
                className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
              >
                <X size={20} color="#C0C0C0" />
              </Pressable>
            </View>

            <Pressable
              onPress={() => setShowDatePicker(true)}
              className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10 mb-4"
            >
              <Calendar size={20} color="#C0C0C0" />
              <Text className="flex-1 ml-3 text-white">{format(selectedDate, 'EEEE, MMMM d, yyyy')}</Text>
            </Pressable>

            <Pressable
              onPress={() => setShowTimePicker(true)}
              className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10 mb-4"
            >
              <Clock size={20} color="#C0C0C0" />
              <Text className="flex-1 ml-3 text-white">{format(selectedTime, 'HH:mm')}</Text>
            </Pressable>

            {renderFlightSelector()}

            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Description"
              placeholderTextColor="#ffffff40"
              multiline
              className="bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10 mb-4"
              style={{ minHeight: 60 }}
            />

            {sessionError ? <Text className="text-af-danger text-sm mb-4">{sessionError}</Text> : null}

            <Pressable
              onPress={handleEditSession}
              disabled={!description.trim() || selectedFlights.length === 0 || isSavingSession}
              className={cn(
                'py-4 rounded-xl',
                description.trim() && selectedFlights.length > 0 && !isSavingSession ? 'bg-af-accent' : 'bg-white/10'
              )}
            >
              <Text
                className={cn(
                  'font-bold text-center',
                  description.trim() && selectedFlights.length > 0 && !isSavingSession ? 'text-white' : 'text-white/40'
                )}
              >
                {isSavingSession ? 'Saving...' : 'Save Changes'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
