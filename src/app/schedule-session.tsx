import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Calendar, Clock, FileText, Check, X, Edit3, Trash2 } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { useMemberStore, useAuthStore, type Flight, type ScheduledPTSession, canEditAttendance, getDisplayName } from '@/lib/store';
import { cn } from '@/lib/cn';

const FLIGHTS: Flight[] = ['Apex', 'Bomber', 'Cryptid', 'Doom', 'Ewok', 'Foxhound', 'ADF', 'DET'];

export default function ScheduleSessionScreen() {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const addScheduledSession = useMemberStore(s => s.addScheduledSession);
  const updateScheduledSession = useMemberStore(s => s.updateScheduledSession);
  const deleteScheduledSession = useMemberStore(s => s.deleteScheduledSession);
  const scheduledSessions = useMemberStore(s => s.scheduledSessions);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [selectedFlight, setSelectedFlight] = useState<Flight>(user?.flight ?? 'Apex');
  const [description, setDescription] = useState('');
  const [editingSession, setEditingSession] = useState<ScheduledPTSession | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const canEdit = user ? canEditAttendance(user.accountType) : false;
  const userSquadron = user?.squadron ?? 'Hawks';

  // Get upcoming sessions for user's flight
  const upcomingSessions = scheduledSessions
    .filter(s => {
      const sessionDate = new Date(s.date);
      return sessionDate >= new Date() && (s.squadron ?? 'Hawks') === userSquadron && (s.flight === user?.flight || canEdit);
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const handleDateChange = (event: any, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
    }
  };

  const handleTimeChange = (event: any, time?: Date) => {
    setShowTimePicker(false);
    if (time) {
      setSelectedTime(time);
    }
  };

  const handleCreateSession = () => {
    if (!user || !description.trim()) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const timeStr = format(selectedTime, 'HH:mm');

    const newSession: ScheduledPTSession = {
      id: Date.now().toString(),
      date: selectedDate.toISOString().split('T')[0],
      time: timeStr,
      description: description.trim(),
      flight: selectedFlight,
      squadron: userSquadron,
      createdBy: user.id,
      attendees: [],
    };

    addScheduledSession(newSession);
    setDescription('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleEditSession = () => {
    if (!editingSession) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    updateScheduledSession(editingSession.id, {
      date: selectedDate.toISOString().split('T')[0],
      time: format(selectedTime, 'HH:mm'),
      description: description.trim(),
      flight: selectedFlight,
      squadron: userSquadron,
    });

    setShowEditModal(false);
    setEditingSession(null);
    setDescription('');
  };

  const handleDeleteSession = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    deleteScheduledSession(id);
  };

  const openEditModal = (session: ScheduledPTSession) => {
    setEditingSession(session);
    setSelectedDate(new Date(session.date));
    const [hours, minutes] = session.time.split(':');
    const time = new Date();
    time.setHours(parseInt(hours), parseInt(minutes));
    setSelectedTime(time);
    setSelectedFlight(session.flight);
    setDescription(session.description);
    setShowEditModal(true);
  };

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
            <Pressable
              onPress={() => router.back()}
              className="w-10 h-10 bg-white/10 rounded-full items-center justify-center mr-4"
            >
              <ChevronLeft size={24} color="#C0C0C0" />
            </Pressable>
            <Text className="text-white text-xl font-bold">PT Sessions</Text>
          </View>
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-af-silver text-center">
              Only PFLs, UFPM, and FitFlight Creator can schedule PT sessions.
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
        {/* Header */}
        <Animated.View
          entering={FadeInDown.delay(100).springify()}
          className="px-6 pt-4 pb-2 flex-row items-center"
        >
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

        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Create New Session */}
          <Animated.View
            entering={FadeInDown.delay(150).springify()}
            className="mt-4 p-4 bg-white/5 rounded-2xl border border-white/10"
          >
            <Text className="text-white font-semibold text-lg mb-4">New Session</Text>

            {/* Date Selection */}
            <Pressable
              onPress={() => setShowDatePicker(true)}
              className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10 mb-4"
            >
              <Calendar size={20} color="#C0C0C0" />
              <Text className="flex-1 ml-3 text-white">
                {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </Text>
            </Pressable>

            {/* Time Selection */}
            <Pressable
              onPress={() => setShowTimePicker(true)}
              className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10 mb-4"
            >
              <Clock size={20} color="#C0C0C0" />
              <Text className="flex-1 ml-3 text-white">
                {format(selectedTime, 'HH:mm')} (Military Time)
              </Text>
            </Pressable>

            {/* Flight Selection */}
            <View className="mb-4">
              <Text className="text-white/60 text-sm mb-2">Flight</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flexGrow: 0 }}
              >
                <View className="flex-row">
                  {FLIGHTS.map((flight) => (
                    <Pressable
                      key={flight}
                      onPress={() => { setSelectedFlight(flight); Haptics.selectionAsync(); }}
                      className={cn(
                        "px-4 py-2 rounded-xl mr-2 border",
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
            </View>

            {/* Description */}
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

            {/* Create Button */}
            <Pressable
              onPress={handleCreateSession}
              disabled={!description.trim()}
              className={cn(
                "py-4 rounded-xl flex-row items-center justify-center",
                description.trim() ? "bg-af-accent" : "bg-white/10"
              )}
            >
              <Check size={20} color={description.trim() ? "white" : "#666666"} />
              <Text className={cn(
                "font-bold ml-2",
                description.trim() ? "text-white" : "text-white/40"
              )}>
                Create Session
              </Text>
            </Pressable>
          </Animated.View>

          {/* Upcoming Sessions */}
          <Animated.View
            entering={FadeInDown.delay(200).springify()}
            className="mt-6"
          >
            <Text className="text-white font-semibold text-lg mb-3">Upcoming Sessions</Text>

            {upcomingSessions.length === 0 ? (
              <View className="bg-white/5 rounded-2xl border border-white/10 p-6 items-center">
                <Calendar size={32} color="#C0C0C0" />
                <Text className="text-af-silver mt-2">No upcoming sessions scheduled</Text>
              </View>
            ) : (
              upcomingSessions.map((session) => (
                <View
                  key={session.id}
                  className="bg-white/5 rounded-xl p-4 mb-3 border border-white/10"
                >
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1">
                      <Text className="text-white font-semibold">{session.description}</Text>
                      <Text className="text-af-silver text-sm mt-1">
                        {format(new Date(session.date), 'EEE, MMM d')} at {session.time}
                      </Text>
                      <View className="flex-row items-center mt-2">
                        <View className="bg-af-accent/20 px-2 py-1 rounded-full">
                          <Text className="text-af-accent text-xs">{session.flight}</Text>
                        </View>
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

      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="spinner"
          onChange={handleDateChange}
          minimumDate={new Date()}
          themeVariant="dark"
        />
      )}

      {/* Time Picker */}
      {showTimePicker && (
        <DateTimePicker
          value={selectedTime}
          mode="time"
          display="spinner"
          onChange={handleTimeChange}
          is24Hour={true}
          themeVariant="dark"
        />
      )}

      {/* Edit Modal */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View className="flex-1 bg-black/80 justify-end">
          <View className="bg-af-navy rounded-t-3xl p-6 pb-12">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-white text-xl font-bold">Edit Session</Text>
              <Pressable
                onPress={() => {
                  setShowEditModal(false);
                  setEditingSession(null);
                  setDescription('');
                }}
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
              <Text className="flex-1 ml-3 text-white">
                {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setShowTimePicker(true)}
              className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10 mb-4"
            >
              <Clock size={20} color="#C0C0C0" />
              <Text className="flex-1 ml-3 text-white">
                {format(selectedTime, 'HH:mm')}
              </Text>
            </Pressable>

            <View className="mb-4">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flexGrow: 0 }}
              >
                <View className="flex-row">
                  {FLIGHTS.map((flight) => (
                    <Pressable
                      key={flight}
                      onPress={() => setSelectedFlight(flight)}
                      className={cn(
                        "px-4 py-2 rounded-xl mr-2 border",
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
            </View>

            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Description"
              placeholderTextColor="#ffffff40"
              multiline
              className="bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10 mb-4"
              style={{ minHeight: 60 }}
            />

            <Pressable
              onPress={handleEditSession}
              className="bg-af-accent py-4 rounded-xl"
            >
              <Text className="text-white font-bold text-center">Save Changes</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
