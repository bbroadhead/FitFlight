import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ChevronDown, Save } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { cn } from '@/lib/cn';
import { canManagePFRARecords, getDisplayName, type Flight, type PFRAAccountabilityStatus, type PFRARecordType, useAuthStore, useMemberStore } from '@/lib/store';
import { bulkSavePFRAResults, fetchAttendanceSessions, fetchPFRABatchById, fetchPFRABatchMembers, fetchPFRARecords } from '@/lib/supabaseData';
import { buildBulkAssessment, createEmptyBulkPFRARow, scoreBulkPFRARow, type BulkPFRARowDraft } from '@/lib/pfraBulk';

const FLIGHTS: Flight[] = ['Apex', 'Bomber', 'Cryptid', 'Doom', 'Ewok', 'Foxhound', 'ADF', 'DET'];
const RECORD_TYPES: Array<{ value: Exclude<PFRARecordType, 'self'>; label: string }> = [
  { value: 'mock', label: 'Mock' },
  { value: 'diagnostic', label: 'Diagnostic' },
  { value: 'official', label: 'Official' },
];
const ACCOUNTABILITY_OPTIONS: PFRAAccountabilityStatus[] = ['completed', 'pending', 'absent', 'excused', 'postponed'];
const CELL_WIDTHS = { member: 188, status: 132, age: 64, gender: 84, body: 132, strength: 140, core: 140, cardio: 148, total: 84, result: 84 };

function ToggleChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className={cn('rounded-full border px-3 py-1.5', active ? 'border-af-accent bg-af-accent/20' : 'border-white/10 bg-white/5')}>
      <Text className={cn('text-xs font-semibold', active ? 'text-white' : 'text-af-silver')}>{label}</Text>
    </Pressable>
  );
}

function SmallInput({
  value,
  onChangeText,
  placeholder,
  editable = true,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  editable?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      editable={editable}
      placeholder={placeholder}
      placeholderTextColor="rgba(255,255,255,0.28)"
      keyboardType="numbers-and-punctuation"
      className={cn('rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-white', !editable && 'opacity-40')}
    />
  );
}

function isGreyedOut(status: PFRAAccountabilityStatus) {
  return status === 'absent' || status === 'excused' || status === 'postponed';
}

export default function BulkPFRAEntryScreen() {
  const router = useRouter();
  const { batchId: batchIdParam } = useLocalSearchParams<{ batchId?: string }>();
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const members = useMemberStore((state) => state.members);
  const syncFitnessAssessments = useMemberStore((state) => state.syncFitnessAssessments);
  const syncPTSessions = useMemberStore((state) => state.syncPTSessions);

  const resolvedBatchId = Array.isArray(batchIdParam) ? batchIdParam[0] : batchIdParam;
  const canManage = user ? canManagePFRARecords(user.accountType) : false;
  const [recordType, setRecordType] = useState<Exclude<PFRARecordType, 'self'>>('mock');
  const [assessmentDate, setAssessmentDate] = useState(new Date());
  const [selectedFlights, setSelectedFlights] = useState<Flight[]>([]);
  const [rowsByMemberId, setRowsByMemberId] = useState<Record<string, BulkPFRARowDraft>>({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingExistingBatch, setIsLoadingExistingBatch] = useState(false);
  const [hasHydratedDraft, setHasHydratedDraft] = useState(false);
  const [hasLocalDraft, setHasLocalDraft] = useState(false);

  const squadron = user?.squadron ?? 'Hawks';
  const draftKey = `fitflight-bulk-pfra:${user?.id ?? 'anon'}:${resolvedBatchId ?? 'new'}`;

  const availableMembers = useMemo(() => {
    if (selectedFlights.length === 0) {
      return [];
    }
    return members
      .filter((member) => member.squadron === squadron && selectedFlights.includes(member.flight))
      .sort((left, right) => left.lastName.localeCompare(right.lastName) || left.firstName.localeCompare(right.firstName));
  }, [members, selectedFlights, squadron]);

  useEffect(() => {
    if (!canManage) {
      return;
    }
    void AsyncStorage.getItem(draftKey)
      .then((stored) => {
        if (!stored) {
          setHasLocalDraft(false);
          return;
        }
        const parsed = JSON.parse(stored) as {
          recordType: Exclude<PFRARecordType, 'self'>;
          assessmentDate: string;
          selectedFlights: Flight[];
          rowsByMemberId: Record<string, BulkPFRARowDraft>;
        };
        setRecordType(parsed.recordType);
        setAssessmentDate(new Date(`${parsed.assessmentDate}T00:00:00`));
        setSelectedFlights(parsed.selectedFlights ?? []);
        setRowsByMemberId(parsed.rowsByMemberId ?? {});
        setHasLocalDraft(true);
      })
      .catch(() => {
        setHasLocalDraft(false);
      })
      .finally(() => {
        setHasHydratedDraft(true);
      });
  }, [canManage, draftKey]);

  useEffect(() => {
    if (!canManage || !resolvedBatchId || !accessToken || !user || !hasHydratedDraft || hasLocalDraft) {
      return;
    }

    let isCancelled = false;
    setIsLoadingExistingBatch(true);

    void Promise.all([
      fetchPFRABatchById(resolvedBatchId, accessToken),
      fetchPFRABatchMembers(resolvedBatchId, accessToken),
    ])
      .then(([batch, batchMembers]) => {
        if (isCancelled || !batch) {
          return;
        }

        setRecordType(batch.recordType);
        setAssessmentDate(new Date(`${batch.assessmentDate}T00:00:00`));
        setSelectedFlights(batch.selectedFlights);

        const nextRows: Record<string, BulkPFRARowDraft> = {};
        const selectedMembers = members
          .filter((member) => member.squadron === squadron && batch.selectedFlights.includes(member.flight))
          .sort((left, right) => left.lastName.localeCompare(right.lastName) || left.firstName.localeCompare(right.firstName));

        selectedMembers.forEach((member) => {
          nextRows[member.id] = createEmptyBulkPFRARow({
            id: member.id,
            email: member.email,
            firstName: member.firstName,
            lastName: member.lastName,
            flight: member.flight,
          });
        });

        batchMembers.forEach((batchMember) => {
          if (nextRows[batchMember.memberId]) {
            nextRows[batchMember.memberId] = {
              ...nextRows[batchMember.memberId],
              accountabilityStatus: batchMember.accountabilityStatus,
              ageYears: batchMember.ageYears != null ? `${batchMember.ageYears}` : nextRows[batchMember.memberId].ageYears,
              gender: batchMember.gender ?? nextRows[batchMember.memberId].gender,
              heightIn: batchMember.heightInches != null ? `${batchMember.heightInches}` : nextRows[batchMember.memberId].heightIn,
            };
          }
        });

        for (const member of members) {
          if (!nextRows[member.id]) {
            continue;
          }

          const matchingAssessment = member.fitnessAssessments.find((assessment) => assessment.batchId === batch.id);
          if (matchingAssessment) {
            nextRows[member.id] = {
              ...nextRows[member.id],
              accountabilityStatus: 'completed',
              waistIn: `${matchingAssessment.components.waist?.inches ?? ''}`,
              strengthTest: matchingAssessment.components.pushups.test === 'hand_release_pushups' ? 'hand_release_pushups' : 'pushups',
              strengthValue: `${matchingAssessment.components.pushups.reps ?? ''}`,
              coreTest:
                matchingAssessment.components.situps.test === 'plank'
                  ? 'plank'
                  : matchingAssessment.components.situps.test === 'cross_leg_reverse_crunch'
                    ? 'cross_leg_reverse_crunch'
                    : 'situps',
              coreValue: matchingAssessment.components.situps.time ?? `${matchingAssessment.components.situps.reps ?? ''}`,
              cardioTest:
                matchingAssessment.components.cardio.test === 'walk_2k'
                  ? 'walk_2k'
                  : matchingAssessment.components.cardio.laps != null
                    ? 'hamr_20m'
                    : 'run_2mile',
              cardioValue: matchingAssessment.components.cardio.time ?? `${matchingAssessment.components.cardio.laps ?? ''}`,
              exemptions: {
                waist: matchingAssessment.components.waist?.exempt ?? false,
                strength: matchingAssessment.components.pushups.exempt ?? false,
                core: matchingAssessment.components.situps.exempt ?? false,
                cardio: matchingAssessment.components.cardio.exempt ?? false,
              },
            };
          }
        }

        setRowsByMemberId(nextRows);
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingExistingBatch(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [accessToken, canManage, hasHydratedDraft, hasLocalDraft, members, resolvedBatchId, squadron, user]);

  useEffect(() => {
    if (!canManage || !hasHydratedDraft) {
      return;
    }
    void AsyncStorage.setItem(
      draftKey,
      JSON.stringify({
        recordType,
        assessmentDate: assessmentDate.toISOString().split('T')[0],
        selectedFlights,
        rowsByMemberId,
      })
    ).catch(() => undefined);
  }, [assessmentDate, canManage, draftKey, hasHydratedDraft, recordType, rowsByMemberId, selectedFlights]);

  useEffect(() => {
    if (!canManage || selectedFlights.length === 0) {
      return;
    }
    setRowsByMemberId((current) => {
      const next = { ...current };
      availableMembers.forEach((member) => {
        next[member.id] = next[member.id] ?? createEmptyBulkPFRARow({
          id: member.id,
          email: member.email,
          firstName: member.firstName,
          lastName: member.lastName,
          flight: member.flight,
        });
      });
      Object.keys(next).forEach((memberId) => {
        const member = members.find((entry) => entry.id === memberId);
        if (!member || member.squadron !== squadron || !selectedFlights.includes(member.flight)) {
          delete next[memberId];
        }
      });
      return next;
    });
  }, [availableMembers, canManage, members, selectedFlights, squadron]);

  const orderedRows = useMemo(() => availableMembers.map((member) => rowsByMemberId[member.id]).filter(Boolean), [availableMembers, rowsByMemberId]);
  const completedRows = useMemo(() => orderedRows.filter((row) => row.accountabilityStatus === 'completed'), [orderedRows]);

  const updateRow = (memberId: string, updater: (row: BulkPFRARowDraft) => BulkPFRARowDraft) => {
    setRowsByMemberId((current) => current[memberId] ? { ...current, [memberId]: updater(current[memberId]) } : current);
  };

  const handleToggleFlight = (flight: Flight) => {
    Haptics.selectionAsync();
    setSelectedFlights((current) => current.includes(flight) ? current.filter((value) => value !== flight) : [...current, flight]);
  };

  const handleSave = () => {
    const run = async () => {
      if (!user || !accessToken) {
        return;
      }
      if (selectedFlights.length === 0) {
        Alert.alert('Select flights', 'Choose at least one flight before saving the batch.');
        return;
      }
      if (completedRows.length === 0) {
        Alert.alert('No completed rows', 'Mark at least one member as completed before saving.');
        return;
      }

      const batchId = resolvedBatchId ?? `pfra-batch-${Date.now()}`;
      const date = assessmentDate.toISOString().split('T')[0];
      const rows = orderedRows.map((row) => {
        const scored = scoreBulkPFRARow(row);
        const assessment = buildBulkAssessment({
          recordId: `${batchId}-${row.memberId}`,
          date,
          recordType,
          batchId,
          row,
          scored,
        });
        return {
          recordId: `${batchId}-${row.memberId}`,
          memberId: row.memberId,
          memberEmail: row.memberEmail,
          memberName: row.memberName,
          flight: row.flight,
          accountabilityStatus: row.accountabilityStatus,
          ageYears: row.ageYears ? Number(row.ageYears) : undefined,
          gender: row.gender,
          heightInches: row.heightIn ? Number(row.heightIn) : undefined,
          overallScore: scored.overallScore ?? 0,
          components: assessment.components,
        };
      });

      setIsSaving(true);
      try {
        await bulkSavePFRAResults({
          batchId,
          squadron: user.squadron,
          recordType,
          assessmentDate: date,
          selectedFlights,
          createdByMemberId: user.id,
          createdByName: getDisplayName(user),
          rows,
          accessToken,
        });
        const [pfraEntries, sessions] = await Promise.all([
          fetchPFRARecords(accessToken, user.squadron),
          fetchAttendanceSessions(accessToken).catch(() => []),
        ]);
        syncFitnessAssessments(pfraEntries);
        syncPTSessions(sessions);
        await AsyncStorage.removeItem(draftKey).catch(() => undefined);
        Alert.alert('PFRA batch saved', `${completedRows.length} result${completedRows.length === 1 ? '' : 's'} saved successfully.`);
        router.back();
      } catch (error) {
        Alert.alert('Unable to save PFRA batch', error instanceof Error ? error.message : 'Please try again.');
      } finally {
        setIsSaving(false);
      }
    };
    void run();
  };

  if (!canManage) {
    return (
      <View className="flex-1 bg-af-navy items-center justify-center px-6">
        <Text className="text-white text-center">Only PFL, UFPM, Owner, and Squadron Leadership roles can use bulk PFRA entry.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <LinearGradient colors={['#0A1628', '#001F5C', '#0A1628']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      <SafeAreaView edges={['top']} className="flex-1">
        <View className="px-6 pt-4 pb-2 flex-row items-center justify-between">
          <View className="flex-row items-center flex-1">
            <Pressable onPress={() => router.back()} className="w-10 h-10 bg-white/10 rounded-full items-center justify-center mr-4">
              <ChevronLeft size={24} color="#C0C0C0" />
            </Pressable>
            <View className="flex-1">
              <Text className="text-white text-xl font-bold">{resolvedBatchId ? 'Edit Bulk PFRA Entry' : 'Bulk PFRA Entry'}</Text>
              <Text className="text-af-silver text-sm mt-1">Fast roster-grid entry for mock, diagnostic, and official PFRA events.</Text>
            </View>
          </View>
          <Pressable onPress={handleSave} disabled={isSaving || isLoadingExistingBatch} className={cn('rounded-xl border border-af-accent/40 bg-af-accent/15 px-4 py-3', (isSaving || isLoadingExistingBatch) && 'opacity-50')}>
            <View className="flex-row items-center">
              <Save size={16} color="#4A90D9" />
              <Text className="ml-2 font-semibold text-af-accent">{isSaving ? 'Saving...' : isLoadingExistingBatch ? 'Loading...' : 'Save All'}</Text>
            </View>
          </Pressable>
        </View>
        <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <Text className="text-white font-semibold text-lg">PFRA Event Setup</Text>
            <Text className="mt-2 text-af-silver text-sm">Bulk entry uses the current FitFlight PFRA scoring logic. Because roster profiles do not store age, gender, or height yet, those values are captured in this grid for completed rows.</Text>

            <View className="mt-4 flex-row flex-wrap">
              {RECORD_TYPES.map((option) => (
                <View key={option.value} className="mr-2 mb-2">
                  <ToggleChip active={recordType === option.value} label={option.label} onPress={() => setRecordType(option.value)} />
                </View>
              ))}
            </View>

            <View className="mt-4">
              <Text className="text-af-silver text-xs uppercase tracking-[0.4px] mb-2">Assessment Date</Text>
              {Platform.OS === 'web' ? (
                React.createElement('input', {
                  type: 'date',
                  value: assessmentDate.toISOString().split('T')[0],
                  onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                    const nextDate = new Date(`${event.target.value}T00:00:00`);
                    if (!Number.isNaN(nextDate.getTime())) {
                      setAssessmentDate(nextDate);
                    }
                  },
                  style: {
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.12)',
                    backgroundColor: 'rgba(0,0,0,0.18)',
                    color: '#FFFFFF',
                    padding: '12px 14px',
                  },
                })
              ) : (
                <>
                  <Pressable onPress={() => setShowDatePicker(true)} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 flex-row items-center justify-between">
                    <Text className="text-white">{assessmentDate.toISOString().split('T')[0]}</Text>
                    <ChevronDown size={16} color="#C0C0C0" />
                  </Pressable>
                  {showDatePicker ? (
                    <DateTimePicker
                      value={assessmentDate}
                      mode="date"
                      display="default"
                      onChange={(_, value) => {
                        setShowDatePicker(false);
                        if (value) {
                          setAssessmentDate(value);
                        }
                      }}
                    />
                  ) : null}
                </>
              )}
            </View>

            <View className="mt-4">
              <Text className="text-af-silver text-xs uppercase tracking-[0.4px] mb-2">Flights</Text>
              <View className="flex-row flex-wrap">
                {FLIGHTS.map((flight) => (
                  <View key={flight} className="mr-2 mb-2">
                    <ToggleChip active={selectedFlights.includes(flight)} label={flight} onPress={() => handleToggleFlight(flight)} />
                  </View>
                ))}
              </View>
            </View>

            <View className="mt-4 rounded-xl border border-white/10 bg-black/15 px-4 py-3">
              <Text className="text-af-silver text-sm">
                {selectedFlights.length === 0
                  ? 'Select one or more flights to load the roster.'
                  : `${availableMembers.length} member${availableMembers.length === 1 ? '' : 's'} loaded.`}
              </Text>
            </View>
          </View>

          <View className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-white font-semibold text-lg">Bulk Entry Grid</Text>
              <Text className="text-af-silver text-sm">{completedRows.length} completed</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-4">
              <View>
                <View className="flex-row rounded-t-2xl border border-white/10 bg-black/20">
                  {[
                    ['Member', CELL_WIDTHS.member],
                    ['Status', CELL_WIDTHS.status],
                    ['Age', CELL_WIDTHS.age],
                    ['Gender', CELL_WIDTHS.gender],
                    ['Body Comp', CELL_WIDTHS.body],
                    ['Strength', CELL_WIDTHS.strength],
                    ['Core', CELL_WIDTHS.core],
                    ['Cardio', CELL_WIDTHS.cardio],
                    ['Total', CELL_WIDTHS.total],
                    ['Result', CELL_WIDTHS.result],
                  ].map(([label, width]) => (
                    <View key={label} style={{ width: Number(width) }} className="px-3 py-3 border-r border-white/10">
                      <Text className="text-af-silver text-xs uppercase tracking-[0.4px]">{label}</Text>
                    </View>
                  ))}
                </View>
                {orderedRows.map((row) => {
                  const greyedOut = isGreyedOut(row.accountabilityStatus);
                  const scored = scoreBulkPFRARow(row);
                  return (
                    <View key={row.memberId} className={cn('flex-row border-x border-b border-white/10 bg-white/5', greyedOut && 'opacity-45')}>
                      <View style={{ width: CELL_WIDTHS.member }} className="px-3 py-3 border-r border-white/10 justify-center">
                        <Text className="text-white font-semibold">{row.memberName}</Text>
                        <Text className="text-af-silver text-xs mt-1">{row.flight}</Text>
                      </View>
                      <View style={{ width: CELL_WIDTHS.status }} className="px-2 py-3 border-r border-white/10">
                        {ACCOUNTABILITY_OPTIONS.map((status) => (
                          <View key={status} className="mb-2 last:mb-0">
                            <ToggleChip active={row.accountabilityStatus === status} label={status} onPress={() => updateRow(row.memberId, (current) => ({ ...current, accountabilityStatus: status }))} />
                          </View>
                        ))}
                      </View>
                      <View style={{ width: CELL_WIDTHS.age }} className="px-2 py-3 border-r border-white/10">
                        <SmallInput value={row.ageYears} onChangeText={(value) => updateRow(row.memberId, (current) => ({ ...current, ageYears: value }))} placeholder="34" editable={!greyedOut} />
                      </View>
                      <View style={{ width: CELL_WIDTHS.gender }} className="px-2 py-3 border-r border-white/10">
                        <ToggleChip active={row.gender === 'male'} label="Male" onPress={() => updateRow(row.memberId, (current) => ({ ...current, gender: 'male' }))} />
                        <View className="mt-2">
                          <ToggleChip active={row.gender === 'female'} label="Female" onPress={() => updateRow(row.memberId, (current) => ({ ...current, gender: 'female' }))} />
                        </View>
                      </View>
                      <View style={{ width: CELL_WIDTHS.body }} className="px-2 py-3 border-r border-white/10">
                        <SmallInput value={row.heightIn} onChangeText={(value) => updateRow(row.memberId, (current) => ({ ...current, heightIn: value }))} placeholder="Height" editable={!greyedOut && !row.exemptions.waist} />
                        <View className="mt-2">
                          <SmallInput value={row.waistIn} onChangeText={(value) => updateRow(row.memberId, (current) => ({ ...current, waistIn: value }))} placeholder="Waist" editable={!greyedOut && !row.exemptions.waist} />
                        </View>
                        <View className="mt-2">
                          <ToggleChip active={row.exemptions.waist} label={`Exempt ${scored.waistScore.toFixed(1)}`} onPress={() => updateRow(row.memberId, (current) => ({ ...current, exemptions: { ...current.exemptions, waist: !current.exemptions.waist } }))} />
                        </View>
                      </View>
                      <View style={{ width: CELL_WIDTHS.strength }} className="px-2 py-3 border-r border-white/10">
                        <ToggleChip active={row.strengthTest === 'pushups'} label="Push-ups" onPress={() => updateRow(row.memberId, (current) => ({ ...current, strengthTest: 'pushups' }))} />
                        <View className="mt-2">
                          <ToggleChip active={row.strengthTest === 'hand_release_pushups'} label="HR Push-ups" onPress={() => updateRow(row.memberId, (current) => ({ ...current, strengthTest: 'hand_release_pushups' }))} />
                        </View>
                        <View className="mt-2">
                          <SmallInput value={row.strengthValue} onChangeText={(value) => updateRow(row.memberId, (current) => ({ ...current, strengthValue: value }))} placeholder="Reps" editable={!greyedOut && !row.exemptions.strength} />
                        </View>
                        <View className="mt-2">
                          <ToggleChip active={row.exemptions.strength} label={`Exempt ${scored.strengthScore.toFixed(1)}`} onPress={() => updateRow(row.memberId, (current) => ({ ...current, exemptions: { ...current.exemptions, strength: !current.exemptions.strength } }))} />
                        </View>
                      </View>
                      <View style={{ width: CELL_WIDTHS.core }} className="px-2 py-3 border-r border-white/10">
                        <ToggleChip active={row.coreTest === 'situps'} label="Sit-ups" onPress={() => updateRow(row.memberId, (current) => ({ ...current, coreTest: 'situps' }))} />
                        <View className="mt-2">
                          <ToggleChip active={row.coreTest === 'cross_leg_reverse_crunch'} label="CLRC" onPress={() => updateRow(row.memberId, (current) => ({ ...current, coreTest: 'cross_leg_reverse_crunch' }))} />
                        </View>
                        <View className="mt-2">
                          <ToggleChip active={row.coreTest === 'plank'} label="Plank" onPress={() => updateRow(row.memberId, (current) => ({ ...current, coreTest: 'plank' }))} />
                        </View>
                        <View className="mt-2">
                          <SmallInput value={row.coreValue} onChangeText={(value) => updateRow(row.memberId, (current) => ({ ...current, coreValue: value }))} placeholder={row.coreTest === 'plank' ? 'mm:ss' : 'Reps'} editable={!greyedOut && !row.exemptions.core} />
                        </View>
                        <View className="mt-2">
                          <ToggleChip active={row.exemptions.core} label={`Exempt ${scored.coreScore.toFixed(1)}`} onPress={() => updateRow(row.memberId, (current) => ({ ...current, exemptions: { ...current.exemptions, core: !current.exemptions.core } }))} />
                        </View>
                      </View>
                      <View style={{ width: CELL_WIDTHS.cardio }} className="px-2 py-3 border-r border-white/10">
                        <ToggleChip active={row.cardioTest === 'run_2mile'} label="Run" onPress={() => updateRow(row.memberId, (current) => ({ ...current, cardioTest: 'run_2mile' }))} />
                        <View className="mt-2">
                          <ToggleChip active={row.cardioTest === 'hamr_20m'} label="HAMR" onPress={() => updateRow(row.memberId, (current) => ({ ...current, cardioTest: 'hamr_20m' }))} />
                        </View>
                        <View className="mt-2">
                          <ToggleChip active={row.cardioTest === 'walk_2k'} label="2K Walk" onPress={() => updateRow(row.memberId, (current) => ({ ...current, cardioTest: 'walk_2k' }))} />
                        </View>
                        <View className="mt-2">
                          <SmallInput value={row.cardioValue} onChangeText={(value) => updateRow(row.memberId, (current) => ({ ...current, cardioValue: value }))} placeholder={row.cardioTest === 'hamr_20m' ? 'Shuttles' : 'mm:ss'} editable={!greyedOut && !row.exemptions.cardio} />
                        </View>
                        <View className="mt-2">
                          <ToggleChip active={row.exemptions.cardio} label={row.cardioTest === 'walk_2k' ? (scored.walkPass ? 'Walk Pass' : 'Walk Fail') : `Exempt ${scored.cardioScore.toFixed(1)}`} onPress={() => updateRow(row.memberId, (current) => ({ ...current, exemptions: { ...current.exemptions, cardio: !current.exemptions.cardio } }))} />
                        </View>
                      </View>
                      <View style={{ width: CELL_WIDTHS.total }} className="px-3 py-3 border-r border-white/10 items-center justify-center">
                        <Text className="text-white font-bold text-lg">{scored.overallScore?.toFixed(1) ?? '--'}</Text>
                      </View>
                      <View style={{ width: CELL_WIDTHS.result }} className="px-3 py-3 items-center justify-center">
                        <Text className={cn('font-semibold', scored.passLabel === 'Pass' ? 'text-af-success' : scored.passLabel === 'Fail' ? 'text-af-danger' : 'text-af-silver')}>{scored.passLabel}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
