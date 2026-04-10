import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronUp, ChevronDown, Calendar, Clock, FileText, Check, X, Edit3, Trash2, User, Users, Building2 } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { addDays, format, startOfWeek } from 'date-fns';
import { useMemberStore, useAuthStore, type Flight, type ScheduledPTKind, type ScheduledPTScope, type ScheduledPTSession, canManagePTPrograms, formatRankDisplay } from '@/lib/store';
import { cn } from '@/lib/cn';
import { createScheduledPTSession, deleteScheduledPTSession as deleteScheduledPTSessionFromSupabase, updateScheduledPTSession as updateScheduledPTSessionInSupabase } from '@/lib/supabaseData';

const FLIGHTS: Flight[] = ['Apex', 'Bomber', 'Cryptid', 'Doom', 'Ewok', 'Foxhound', 'ADF', 'DET'];
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hours) => hours.toString().padStart(2, '0'));
const MINUTE_OPTIONS = ['00', '15', '30', '45'];

const isWebMobile = () => Platform.OS === 'web' && typeof navigator !== 'undefined' && /iphone|ipad|ipod|android/i.test(navigator.userAgent.toLowerCase());
const isSessionUpcoming = (session: ScheduledPTSession) => new Date(`${session.date}T${session.time}:00`).getTime() >= Date.now();
const sessionKindLabel = (kind: ScheduledPTKind) => kind === 'pfra_mock' ? 'PFRA Mock' : kind === 'pfra_diagnostic' ? 'PFRA Diagnostic' : kind === 'pfra_official' ? 'PFRA Official' : 'Normal PT';
const scopeLabel = (session: ScheduledPTSession) => session.scope === 'personal' ? 'Personal' : session.scope === 'squadron' ? 'Squadron PT' : session.flights.length === 1 ? `${session.flights[0]} Flight` : session.flights.join(', ');

export default function ScheduleSessionScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const addScheduledSession = useMemberStore((s) => s.addScheduledSession);
  const updateScheduledSession = useMemberStore((s) => s.updateScheduledSession);
  const deleteScheduledSession = useMemberStore((s) => s.deleteScheduledSession);
  const scheduledSessions = useMemberStore((s) => s.scheduledSessions);
  const members = useMemberStore((s) => s.members);

  const canManageFlightSessions = user ? canManagePTPrograms(user.accountType) : false;
  const mobileWeb = isWebMobile();
  const userSquadron = user?.squadron ?? 'Hawks';
  const defaultScope: ScheduledPTScope = canManageFlightSessions ? 'flight' : 'personal';

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [selectedScope, setSelectedScope] = useState<ScheduledPTScope>(defaultScope);
  const [selectedKind, setSelectedKind] = useState<ScheduledPTKind>('pt');
  const [selectedFlights, setSelectedFlights] = useState<Flight[]>(user?.flight ? [user.flight] : ['Apex']);
  const [description, setDescription] = useState('');
  const [editingSession, setEditingSession] = useState<ScheduledPTSession | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [isSavingSession, setIsSavingSession] = useState(false);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const timeInputRef = useRef<HTMLInputElement | null>(null);

  const currentWeekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const currentWeekStartKey = format(currentWeekStart, 'yyyy-MM-dd');
  const currentWeekEndKey = format(addDays(currentWeekStart, 6), 'yyyy-MM-dd');
  const creatorNameById = useMemo(() => new Map(members.map((member) => [member.id, `${formatRankDisplay(member.rank)} ${member.firstName} ${member.lastName}`])), [members]);

  const visibleUpcomingSessions = useMemo(() => scheduledSessions
    .filter((session) => {
      if ((session.squadron ?? 'Hawks') !== userSquadron || session.date < currentWeekStartKey || session.date > currentWeekEndKey || !isSessionUpcoming(session)) return false;
      if (canManageFlightSessions) return true;
      if (!user) return false;
      if (session.scope === 'personal') return session.createdBy === user.id;
      if (session.scope === 'squadron') return true;
      return session.flights.includes(user.flight);
    })
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)), [canManageFlightSessions, currentWeekEndKey, currentWeekStartKey, scheduledSessions, user, userSquadron]);

  const applyScopeSelection = (scope: ScheduledPTScope) => {
    setSelectedScope(scope);
    setSessionError('');
    if (scope === 'squadron') setSelectedFlights([...FLIGHTS]);
    else if (scope === 'personal') setSelectedFlights([]);
    else setSelectedFlights((current) => current.length ? current : user?.flight ? [user.flight] : ['Apex']);
  };

  const resetForm = () => {
    setDescription('');
    setSelectedKind('pt');
    applyScopeSelection(defaultScope);
    setEditingSession(null);
    setShowEditModal(false);
    setSessionError('');
  };

  const handleDateChange = (_event: unknown, date?: Date) => { setShowDatePicker(false); if (date) setSelectedDate(date); };
  const handleTimeChange = (_event: unknown, time?: Date) => { setShowTimePicker(false); if (time) setSelectedTime(time); };
  const handleWebDateChange = (value: string) => { const next = value ? new Date(`${value}T00:00:00`) : null; if (next && !Number.isNaN(next.getTime())) setSelectedDate(next); };
  const handleWebTimeChange = (value: string) => { const [hours, minutes] = value.split(':'); if (!hours || !minutes) return; const next = new Date(selectedTime); next.setHours(Number(hours), Number(minutes), 0, 0); setSelectedTime(next); };
  const handleWebHourChange = (value: string) => { const next = new Date(selectedTime); next.setHours(Number(value), next.getMinutes(), 0, 0); setSelectedTime(next); };
  const handleWebMinuteChange = (value: string) => { const next = new Date(selectedTime); next.setMinutes(Number(value), 0, 0); setSelectedTime(next); };
  const stepHour = (direction: 1 | -1) => { const currentIndex = HOUR_OPTIONS.indexOf(format(selectedTime, 'HH')); handleWebHourChange(HOUR_OPTIONS[(currentIndex + direction + HOUR_OPTIONS.length) % HOUR_OPTIONS.length]); };
  const stepMinute = (direction: 1 | -1) => { const currentIndex = MINUTE_OPTIONS.indexOf(format(selectedTime, 'mm')); handleWebMinuteChange(MINUTE_OPTIONS[(currentIndex + direction + MINUTE_OPTIONS.length) % MINUTE_OPTIONS.length]); };
  const toggleFlightSelection = (flight: Flight) => setSelectedFlights((current) => current.includes(flight) ? (current.length === 1 ? current : current.filter((entry) => entry !== flight)) : [...current, flight]);
  const buildSessionFlights = () => selectedScope === 'squadron' ? [...FLIGHTS] : selectedScope === 'personal' ? [] : selectedFlights;
  const canModifySession = (session: ScheduledPTSession) => !!user && (canManageFlightSessions || session.createdBy === user.id);

  const saveSession = async (mode: 'create' | 'edit') => {
    if (!user || !accessToken || !description.trim()) return;
    const flights = buildSessionFlights();
    if (selectedScope === 'flight' && flights.length === 0) return;
    setIsSavingSession(true);
    setSessionError('');
    try {
      const base: ScheduledPTSession = {
        id: mode === 'edit' && editingSession ? editingSession.id : Date.now().toString(),
        date: format(selectedDate, 'yyyy-MM-dd'),
        time: format(selectedTime, 'HH:mm'),
        description: description.trim(),
        flights,
        squadron: userSquadron,
        createdBy: mode === 'edit' && editingSession ? editingSession.createdBy : user.id,
        scope: selectedScope,
        kind: selectedKind,
      };
      const saved = mode === 'edit' ? await updateScheduledPTSessionInSupabase(base, accessToken) : await createScheduledPTSession(base, accessToken);
      if (mode === 'edit' && editingSession) updateScheduledSession(editingSession.id, saved);
      else addScheduledSession(saved);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetForm();
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : `Unable to ${mode} PT session.`);
    } finally {
      setIsSavingSession(false);
    }
  };

  const openEditModal = (session: ScheduledPTSession) => {
    setEditingSession(session);
    setSelectedDate(new Date(`${session.date}T00:00:00`));
    const time = new Date(); const [hours, minutes] = session.time.split(':'); time.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    setSelectedTime(time); setSelectedFlights(session.flights); setSelectedScope(session.scope); setSelectedKind(session.kind); setDescription(session.description); setSessionError(''); setShowEditModal(true);
  };

  const handleDeleteSession = (id: string) => {
    void (async () => {
      if (!accessToken) return;
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        await deleteScheduledPTSessionFromSupabase(id, accessToken);
        deleteScheduledSession(id);
      } catch (error) {
        setSessionError(error instanceof Error ? error.message : 'Unable to delete PT session.');
      }
    })();
  };

  const openWebDatePicker = () => {
    const input = dateInputRef.current;
    if (!input) {
      return;
    }

    input.showPicker?.();
    input.focus();
    input.click();
  };

  const openWebTimePicker = () => {
    const input = timeInputRef.current;
    if (!input) {
      return;
    }

    input.showPicker?.();
    input.focus();
    input.click();
  };

  const renderDateCard = () => (
    <View className="mb-4">
      {Platform.OS === 'web' ? (
        <View className="relative">
          <Pressable onPress={openWebDatePicker} className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10">
            <Calendar size={20} color="#C0C0C0" />
            <View className="flex-1 ml-3"><Text className="text-white/60 text-xs mb-1">Date</Text><Text className="text-white text-base">{format(selectedDate, 'EEEE, MMMM d, yyyy')}</Text></View>
          </Pressable>
          <input ref={dateInputRef} type="date" value={format(selectedDate, 'yyyy-MM-dd')} min={format(new Date(), 'yyyy-MM-dd')} onChange={(event) => handleWebDateChange(event.target.value)} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} tabIndex={-1} aria-hidden />
        </View>
      ) : (
        <Pressable onPress={() => setShowDatePicker(true)} className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10">
          <Calendar size={20} color="#C0C0C0" />
          <View className="flex-1 ml-3"><Text className="text-white/60 text-xs mb-1">Date</Text><Text className="text-white text-base">{format(selectedDate, 'EEEE, MMMM d, yyyy')}</Text></View>
        </Pressable>
      )}
    </View>
  );

  const renderTimeCard = () => {
    if (Platform.OS === 'web' && mobileWeb) {
      return <View className="mb-4 relative"><Pressable onPress={openWebTimePicker} className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10"><Clock size={20} color="#C0C0C0" /><View className="flex-1 ml-3"><Text className="text-white/60 text-xs mb-1">Time</Text><Text className="text-white text-base">{format(selectedTime, 'HH:mm')} (Military Time)</Text></View></Pressable><input ref={timeInputRef} type="time" value={format(selectedTime, 'HH:mm')} onChange={(event) => handleWebTimeChange(event.target.value)} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} tabIndex={-1} aria-hidden /></View>;
    }
    if (Platform.OS !== 'web') {
      return <Pressable onPress={() => setShowTimePicker(true)} className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10 mb-4"><Clock size={20} color="#C0C0C0" /><View className="flex-1 ml-3"><Text className="text-white/60 text-xs mb-1">Time</Text><Text className="text-white text-base">{format(selectedTime, 'HH:mm')} (Military Time)</Text></View></Pressable>;
    }
    return (
      <View className="flex-row items-center bg-white/10 rounded-xl px-4 py-3 border border-white/10 mb-4">
        <Clock size={20} color="#C0C0C0" />
        <View className="flex-1 ml-3">
          <Text className="text-white/60 text-xs mb-1">Time</Text>
          <div style={{ display: 'flex', flexDirection: 'row', gap: 12, userSelect: 'none' }}>
            {[{ label: 'Hour', options: HOUR_OPTIONS, value: format(selectedTime, 'HH'), step: stepHour, onPick: handleWebHourChange }, { label: 'Minute', options: MINUTE_OPTIONS, value: format(selectedTime, 'mm'), step: stepMinute, onPick: handleWebMinuteChange }].map((column) => (
              <View key={column.label} className="flex-1 rounded-xl border border-white/10 bg-black/10 overflow-hidden">
                <View className="items-center py-2 border-b border-white/5"><Text className="text-white/60 text-[11px] uppercase tracking-[0.4px]">{column.label}</Text></View>
                <View style={{ height: 120 }} className="flex-row items-center px-3 py-2">
                  <View className="mr-3 items-center justify-center">
                    <Pressable onPress={() => column.step(-1)} className="w-9 h-8 items-center justify-center"><ChevronUp size={18} color="#C0C0C0" /></Pressable>
                    <Pressable onPress={() => column.step(1)} className="w-9 h-8 items-center justify-center mt-2"><ChevronDown size={18} color="#C0C0C0" /></Pressable>
                  </View>
                  <View className="flex-1 rounded-xl border px-2 py-2" style={{ borderColor: 'rgba(125, 211, 252, 0.55)', backgroundColor: 'rgba(74, 144, 217, 0.18)' }}>
                    {[-1, 0, 1].map((offset) => {
                      const currentIndex = column.options.indexOf(column.value);
                      const option = column.options[(currentIndex + offset + column.options.length) % column.options.length];
                      const isActive = offset === 0;
                      return <Pressable key={`${column.label}-${offset}-${option}`} onPress={() => column.onPick(option)} className="items-center justify-center rounded-lg" style={{ height: 30, backgroundColor: isActive ? 'rgba(74,144,217,0.18)' : 'transparent' }}><Text className={cn('font-semibold', isActive ? 'text-white text-lg' : 'text-af-silver')} style={{ userSelect: 'none' }}>{option}</Text></Pressable>;
                    })}
                  </View>
                </View>
              </View>
            ))}
          </div>
        </View>
      </View>
    );
  };

  const renderScopeSelector = () => canManageFlightSessions ? (
    <View className="mb-4">
      <Text className="text-white/60 text-sm mb-2">Session Scope</Text>
      <View className="flex-row">
        {([{ value: 'squadron', label: 'Squadron PT', icon: Building2 }, { value: 'flight', label: 'Flight PT', icon: Users }, { value: 'personal', label: 'Personal PT', icon: User }] as Array<{ value: ScheduledPTScope; label: string; icon: typeof Building2 }>).map((option) => {
          const Icon = option.icon;
          return <Pressable key={option.value} onPress={() => applyScopeSelection(option.value)} className={cn('flex-1 rounded-xl border px-3 py-3 mr-2 last:mr-0', selectedScope === option.value ? 'border-af-accent bg-af-accent/20' : 'border-white/10 bg-white/5')}><View className="items-center"><Icon size={18} color={selectedScope === option.value ? '#4A90D9' : '#C0C0C0'} /><Text className={cn('text-xs font-semibold text-center mt-2', selectedScope === option.value ? 'text-white' : 'text-af-silver')}>{option.label}</Text></View></Pressable>;
        })}
      </View>
    </View>
  ) : null;

  const renderKindSelector = () => (
    <View className="mb-4">
      <Text className="text-white/60 text-sm mb-2">Session Type</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingRight: 8 }}>
        <View className="flex-row">
          {([{ value: 'pt', label: 'Normal PT' }, { value: 'pfra_mock', label: 'PFRA Mock' }, { value: 'pfra_diagnostic', label: 'PFRA Diagnostic' }, { value: 'pfra_official', label: 'PFRA Official' }] as Array<{ value: ScheduledPTKind; label: string }>).map((option) => (
            <Pressable key={option.value} onPress={() => setSelectedKind(option.value)} className={cn('px-4 py-2 rounded-xl mr-2 border', selectedKind === option.value ? 'bg-af-success/20 border-af-success' : 'bg-white/5 border-white/10')}><Text className={cn('font-medium text-sm', selectedKind === option.value ? 'text-white' : 'text-white/60')}>{option.label}</Text></Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );

  const renderFlightSelector = () => selectedScope === 'flight' ? (
    <View className="mb-4">
      <Text className="text-white/60 text-sm mb-2">Flights</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingRight: 8 }} nestedScrollEnabled>
        <View className="flex-row">
          {FLIGHTS.map((flight) => <Pressable key={flight} onPress={() => toggleFlightSelection(flight)} className={cn('px-4 py-2 rounded-xl mr-2 border', selectedFlights.includes(flight) ? 'bg-af-accent border-af-accent' : 'bg-white/5 border-white/10')}><Text className={cn('font-medium', selectedFlights.includes(flight) ? 'text-white' : 'text-white/60')}>{flight}</Text></Pressable>)}
        </View>
      </ScrollView>
      <Text className="text-white/40 text-xs mt-2">Selected: {selectedFlights.join(', ')}</Text>
    </View>
  ) : null;

  if (!user) return null;

  return (
    <View className="flex-1">
      <LinearGradient colors={['#0A1628', '#001F5C', '#0A1628']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      <SafeAreaView edges={['top']} className="flex-1">
        <Animated.View entering={FadeInDown.delay(100).springify()} className="px-6 pt-4 pb-2 flex-row items-center">
          <Pressable onPress={() => router.back()} className="w-10 h-10 bg-white/10 rounded-full items-center justify-center mr-4"><ChevronLeft size={24} color="#C0C0C0" /></Pressable>
          <Text className="text-white text-xl font-bold">{canManageFlightSessions ? 'Schedule PT Session' : 'Schedule Personal PT'}</Text>
        </Animated.View>
        <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.delay(150).springify()} className="mt-4 p-4 bg-white/5 rounded-2xl border border-white/10">
            <Text className="text-white font-semibold text-lg mb-4">{editingSession ? 'Edit Session' : 'New Session'}</Text>
            {renderScopeSelector()}
            {renderKindSelector()}
            {renderDateCard()}
            {renderTimeCard()}
            {renderFlightSelector()}
            <View className="mb-4"><Text className="text-white/60 text-sm mb-2">Details</Text><View className="flex-row items-start bg-white/10 rounded-xl px-4 py-3 border border-white/10"><FileText size={20} color="#C0C0C0" /><TextInput value={description} onChangeText={setDescription} placeholder={selectedKind === 'pt' ? 'e.g., Group run at track, HIIT session...' : 'e.g., PFRA diagnostic at gym track...'} placeholderTextColor="#ffffff40" multiline className="flex-1 ml-3 text-white text-base" style={{ minHeight: 60 }} /></View></View>
            {sessionError ? <Text className="text-af-danger text-sm mb-4">{sessionError}</Text> : null}
            <Pressable onPress={() => void saveSession(editingSession ? 'edit' : 'create')} disabled={!description.trim() || (selectedScope === 'flight' && selectedFlights.length === 0) || isSavingSession} className={cn('py-4 rounded-xl flex-row items-center justify-center', description.trim() && (selectedScope !== 'flight' || selectedFlights.length > 0) && !isSavingSession ? 'bg-af-accent' : 'bg-white/10')}><Check size={20} color={description.trim() && (selectedScope !== 'flight' || selectedFlights.length > 0) && !isSavingSession ? 'white' : '#666666'} /><Text className={cn('font-bold ml-2', description.trim() && (selectedScope !== 'flight' || selectedFlights.length > 0) && !isSavingSession ? 'text-white' : 'text-white/40')}>{isSavingSession ? 'Saving...' : editingSession ? 'Save Changes' : 'Create Session'}</Text></Pressable>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(200).springify()} className="mt-6">
            <Text className="text-white font-semibold text-lg mb-1">Scheduled PT Sessions</Text>
            <Text className="text-af-silver text-xs mb-3">{format(currentWeekStart, 'MMM d')} - {format(addDays(currentWeekStart, 6), 'MMM d, yyyy')} · {userSquadron}</Text>
            {visibleUpcomingSessions.length === 0 ? <View className="bg-white/5 rounded-2xl border border-white/10 p-6 items-center"><Calendar size={32} color="#C0C0C0" /><Text className="text-af-silver mt-2">No PT sessions scheduled for the rest of this week</Text></View> : visibleUpcomingSessions.map((session) => (
              <View key={session.id} className="bg-white/5 rounded-xl p-4 mb-3 border border-white/10">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1">
                    <Text className="text-white font-semibold">{session.description}</Text>
                    <Text className="text-af-silver text-sm mt-1">{format(new Date(`${session.date}T00:00:00`), 'EEE, MMM d')} at {session.time}</Text>
                    <Text className="text-af-silver text-xs mt-1">{sessionKindLabel(session.kind)}</Text>
                    <Text className="text-af-silver text-xs mt-1">{session.scope === 'personal' ? 'Personal PT' : `Flights: ${session.flights.join(', ')}`}</Text>
                    <Text className="text-af-silver text-xs mt-1">Scheduled by {creatorNameById.get(session.createdBy) ?? 'Unknown member'}</Text>
                    <View className="flex-row flex-wrap items-center mt-2">
                      <View className={cn('px-2 py-1 rounded-full mr-2 mb-2', session.scope === 'personal' ? 'bg-af-success/20' : 'bg-af-accent/20')}><Text className={cn('text-xs', session.scope === 'personal' ? 'text-af-success' : 'text-af-accent')}>{scopeLabel(session)}</Text></View>
                      {session.kind !== 'pt' ? <View className="bg-af-gold/15 px-2 py-1 rounded-full mr-2 mb-2"><Text className="text-af-gold text-xs">{sessionKindLabel(session.kind)}</Text></View> : null}
                    </View>
                  </View>
                  {canModifySession(session) ? <View className="flex-row"><Pressable onPress={() => openEditModal(session)} className="w-8 h-8 bg-white/10 rounded-full items-center justify-center mr-2"><Edit3 size={16} color="#C0C0C0" /></Pressable><Pressable onPress={() => handleDeleteSession(session.id)} className="w-8 h-8 bg-af-danger/20 rounded-full items-center justify-center"><Trash2 size={16} color="#EF4444" /></Pressable></View> : null}
                </View>
              </View>
            ))}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
      {showDatePicker ? <DateTimePicker value={selectedDate} mode="date" display="spinner" onChange={handleDateChange} minimumDate={new Date()} themeVariant="dark" /> : null}
      {showTimePicker ? <DateTimePicker value={selectedTime} mode="time" display="spinner" onChange={handleTimeChange} is24Hour themeVariant="dark" /> : null}
      <Modal visible={showEditModal} transparent animationType="slide"><View className="flex-1 bg-black/80 justify-end"><View className="bg-af-navy rounded-t-3xl p-6 pb-12"><View className="flex-row items-center justify-between mb-6"><Text className="text-white text-xl font-bold">Edit Session</Text><Pressable onPress={resetForm} className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"><X size={20} color="#C0C0C0" /></Pressable></View>{renderScopeSelector()}{renderKindSelector()}{renderDateCard()}{renderTimeCard()}{renderFlightSelector()}<TextInput value={description} onChangeText={setDescription} placeholder="Description" placeholderTextColor="#ffffff40" multiline className="bg-white/10 rounded-xl px-4 py-3 text-white border border-white/10 mb-4" style={{ minHeight: 60 }} />{sessionError ? <Text className="text-af-danger text-sm mb-4">{sessionError}</Text> : null}<Pressable onPress={() => void saveSession('edit')} disabled={!description.trim() || (selectedScope === 'flight' && selectedFlights.length === 0) || isSavingSession} className={cn('py-4 rounded-xl', description.trim() && (selectedScope !== 'flight' || selectedFlights.length > 0) && !isSavingSession ? 'bg-af-accent' : 'bg-white/10')}><Text className={cn('font-bold text-center', description.trim() && (selectedScope !== 'flight' || selectedFlights.length > 0) && !isSavingSession ? 'text-white' : 'text-white/40')}>{isSavingSession ? 'Saving...' : 'Save Changes'}</Text></Pressable></View></View></Modal>
    </View>
  );
}
