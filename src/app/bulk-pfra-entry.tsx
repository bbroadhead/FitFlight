import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ChevronDown, Save, History, ArrowUpDown, Check, AlertTriangle } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ThemeBackdrop } from '@/components/ThemeBackdrop';
import { ThemeChrome } from '@/components/ThemeChrome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { cn } from '@/lib/cn';
import { canManagePFRARecords, formatFlightDisplay, getDisplayName, type Flight, type PFRAAccountabilityStatus, type PFRARecordType, useAuthStore, useMemberStore } from '@/lib/store';
import { bulkSavePFRAResults, deletePFRABatch, fetchAttendanceSessions, fetchPFRABatchById, fetchPFRABatchMembers, fetchPFRABatches, fetchPFRARecords, type PFRABatchSummary } from '@/lib/supabaseData';
import { buildBulkAssessment, createEmptyBulkPFRARow, scoreBulkPFRARow, type BulkPFRARowDraft } from '@/lib/pfraBulk';
import { getThemeBodyStyle, getThemeControlStyle, getThemeHeadingStyle, useAppTheme } from '@/lib/theme';

const FLIGHTS: Flight[] = ['Apex', 'Bomber', 'Cryptid', 'Doom', 'Ewok', 'Foxhound', 'DO', 'ADF', 'DET'];
const RECORD_TYPES: Array<{ value: Exclude<PFRARecordType, 'self'>; label: string }> = [
  { value: 'mock', label: 'Mock' },
  { value: 'diagnostic', label: 'Diagnostic' },
  { value: 'official', label: 'Official' },
];
const ACCOUNTABILITY_OPTIONS: PFRAAccountabilityStatus[] = ['completed', 'pending', 'absent', 'excused', 'postponed'];
const CELL_WIDTHS = { member: 188, status: 132, age: 64, gender: 84, body: 132, strength: 140, core: 140, cardio: 148, total: 84, result: 84 };
type BulkSortType = 'last_name' | 'flight' | 'status';
type ConfirmDialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
};

const STATUS_SORT_ORDER: Record<PFRAAccountabilityStatus, number> = {
  completed: 0,
  pending: 1,
  absent: 3,
  excused: 4,
  postponed: 5,
};

function normalizeTimeLikeInput(value: string) {
  const digits = value.replace(/[^0-9]/g, '');
  if (digits.length <= 2) {
    return digits;
  }
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

function ToggleChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      className="rounded-full border px-3 py-1.5"
      style={active ? { borderColor: theme.accent, backgroundColor: theme.accentSoft } : getThemeControlStyle(theme)}
    >
      <Text style={[getThemeBodyStyle(theme, 12, active ? theme.textPrimary : theme.textSecondary), { fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

function ScoreBadge({ label }: { label: string }) {
  const theme = useAppTheme();
  return (
    <View className="rounded-full border px-3 py-1.5" style={{ borderColor: `${theme.accent}55`, backgroundColor: theme.accentSoft }}>
      <Text style={[getThemeBodyStyle(theme, 12, theme.accent), { fontWeight: '600' }]}>{label}</Text>
    </View>
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
  const theme = useAppTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      editable={editable}
      placeholder={placeholder}
      placeholderTextColor={theme.textMuted}
      keyboardType="numbers-and-punctuation"
      className={cn('rounded-lg border px-2 py-2', !editable && 'opacity-40')}
      style={{
        color: theme.textPrimary,
        borderColor: theme.inputBorder,
        backgroundColor: theme.inputBackground,
      }}
    />
  );
}

function isGreyedOut(status: PFRAAccountabilityStatus) {
  return status === 'absent' || status === 'excused' || status === 'postponed';
}

function getRowSortName(row: BulkPFRARowDraft) {
  const [lastName = '', firstName = ''] = row.memberName.split(',').map((value) => value.trim());
  return { lastName, firstName };
}

export default function BulkPFRAEntryScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
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
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);
  const [isLoadingExistingBatch, setIsLoadingExistingBatch] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [hasHydratedDraft, setHasHydratedDraft] = useState(false);
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  const [sortType, setSortType] = useState<BulkSortType>('last_name');
  const [recentBatches, setRecentBatches] = useState<PFRABatchSummary[]>([]);

  const squadron = user?.squadron ?? 'Hawks';
  const isCompactMobile = width < 900;
  const contentMaxWidth = width >= 1280 ? 1240 : width >= 1000 ? 1100 : 720;
  const draftKey = `fitflight-bulk-pfra:${user?.id ?? 'anon'}:${resolvedBatchId ?? 'new'}`;
  const saveStateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (saveStateTimeoutRef.current) {
      clearTimeout(saveStateTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    setHasHydratedDraft(false);
    setHasLocalDraft(false);
    setRowsByMemberId({});
    setSelectedFlights([]);
    setRecordType('mock');
    setAssessmentDate(new Date());
  }, [resolvedBatchId]);

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

  useEffect(() => {
    if (!canManage || !accessToken) {
      return;
    }

    let isCancelled = false;
    void fetchPFRABatches(accessToken, squadron)
      .then((batches) => {
        if (!isCancelled) {
          setRecentBatches(batches);
        }
      })
      .catch(() => undefined);

    return () => {
      isCancelled = true;
    };
  }, [accessToken, canManage, squadron]);

  const orderedRows = useMemo(() => {
    const rows = availableMembers.map((member) => rowsByMemberId[member.id]).filter(Boolean);
    rows.sort((left, right) => {
      const leftName = getRowSortName(left);
      const rightName = getRowSortName(right);
      if (sortType === 'flight') {
        return left.flight.localeCompare(right.flight) || leftName.lastName.localeCompare(rightName.lastName) || leftName.firstName.localeCompare(rightName.firstName);
      }
      if (sortType === 'status') {
        return (STATUS_SORT_ORDER[left.accountabilityStatus] ?? 99) - (STATUS_SORT_ORDER[right.accountabilityStatus] ?? 99)
          || left.flight.localeCompare(right.flight)
          || leftName.lastName.localeCompare(rightName.lastName)
          || leftName.firstName.localeCompare(rightName.firstName);
      }
      return leftName.lastName.localeCompare(rightName.lastName) || leftName.firstName.localeCompare(rightName.firstName) || left.flight.localeCompare(right.flight);
    });
    return rows;
  }, [availableMembers, rowsByMemberId, sortType]);
  const completedRows = useMemo(() => orderedRows.filter((row) => row.accountabilityStatus === 'completed'), [orderedRows]);
  const hasEnteredGridValues = useMemo(
    () =>
      Object.values(rowsByMemberId).some((row) => {
        if (row.accountabilityStatus !== 'pending') {
          return true;
        }
        return Boolean(
          row.ageYears.trim() ||
          row.heightIn.trim() ||
          row.waistIn.trim() ||
          row.strengthValue.trim() ||
          row.coreValue.trim() ||
          row.cardioValue.trim() ||
          row.exemptions.waist ||
          row.exemptions.strength ||
          row.exemptions.core ||
          row.exemptions.cardio
        );
      }),
    [rowsByMemberId]
  );

  const updateRow = (memberId: string, updater: (row: BulkPFRARowDraft) => BulkPFRARowDraft) => {
    setRowsByMemberId((current) => current[memberId] ? { ...current, [memberId]: updater(current[memberId]) } : current);
  };

  const requestConfirmation = (options: ConfirmDialogState) => {
    setConfirmDialog(options);
  };

  const handleConfirmDialog = () => {
    const action = confirmDialog?.onConfirm;
    setConfirmDialog(null);
    action?.();
  };

  const handleOpenSavedBatch = (batchId: string) => {
    const openBatch = () => {
      Haptics.selectionAsync();
      router.replace(`/bulk-pfra-entry?batchId=${encodeURIComponent(batchId)}`);
    };

    if (!hasEnteredGridValues) {
      openBatch();
      return;
    }

    requestConfirmation({
      title: 'Replace current bulk entry values?',
      message: 'Opening a previous bulk save will replace the values currently entered in the Bulk Entry Grid.',
      confirmLabel: 'Replace',
      onConfirm: openBatch,
    });
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

      const invalidCompletedRows = completedRows.filter((row) => {
        const missingAge = !row.ageYears.trim();
        const missingHeight = !row.heightIn.trim() && !row.exemptions.waist;
        const missingWaist = !row.waistIn.trim() && !row.exemptions.waist;
        const missingStrength = !row.strengthValue.trim() && !row.exemptions.strength;
        const missingCore = !row.coreValue.trim() && !row.exemptions.core;
        const missingCardio = !row.cardioValue.trim() && !row.exemptions.cardio;
        return missingAge || missingHeight || missingWaist || missingStrength || missingCore || missingCardio;
      });

      if (invalidCompletedRows.length > 0) {
        const previewNames = invalidCompletedRows.slice(0, 3).map((row) => row.memberName).join(', ');
        Alert.alert(
          'Incomplete completed rows',
          `${previewNames}${invalidCompletedRows.length > 3 ? ', ...' : ''} still have missing PFRA fields. Fill in completed rows or change their accountability status before saving.`
        );
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
      setSaveState('saving');
      try {
        const saveSummary = await bulkSavePFRAResults({
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
        const [savedBatch, savedBatchMembers, pfraEntries, sessions, refreshedBatches] = await Promise.all([
          fetchPFRABatchById(batchId, accessToken),
          fetchPFRABatchMembers(batchId, accessToken),
          fetchPFRARecords(accessToken, user.squadron),
          fetchAttendanceSessions(accessToken).catch(() => []),
          fetchPFRABatches(accessToken, user.squadron).catch(() => recentBatches),
        ]);

        if (!savedBatch) {
          throw new Error('PFRA batch save did not persist correctly. Please rerun pfra_batches.sql and try again.');
        }

        if (savedBatchMembers.length !== rows.length) {
          throw new Error(`PFRA batch save completed incompletely. Expected ${rows.length} accountability rows, but found ${savedBatchMembers.length}.`);
        }

        syncFitnessAssessments(pfraEntries);
        syncPTSessions(sessions);
        setRecentBatches(refreshedBatches);
        await AsyncStorage.removeItem(draftKey).catch(() => undefined);
        setSaveState('saved');
        if (saveStateTimeoutRef.current) {
          clearTimeout(saveStateTimeoutRef.current);
        }
        saveStateTimeoutRef.current = setTimeout(() => {
          setSaveState('idle');
          saveStateTimeoutRef.current = null;
        }, 2200);
        Alert.alert(
          'PFRA batch saved',
          `${saveSummary.completed_count} completed result${saveSummary.completed_count === 1 ? '' : 's'} saved. Accountability rows saved: ${saveSummary.row_count}.`
        );
      } catch (error) {
        setSaveState('error');
        if (saveStateTimeoutRef.current) {
          clearTimeout(saveStateTimeoutRef.current);
        }
        saveStateTimeoutRef.current = setTimeout(() => {
          setSaveState('idle');
          saveStateTimeoutRef.current = null;
        }, 2200);
        Alert.alert('Unable to save PFRA batch', error instanceof Error ? error.message : 'Please try again.');
      } finally {
        setIsSaving(false);
      }
    };
    void run();
  };

  const handleDeleteBatch = (batchIdOverride?: string) => {
    const targetBatchId = batchIdOverride ?? resolvedBatchId;
    if (!targetBatchId) {
      Alert.alert('No saved batch selected', 'Open a previous bulk save first, then you can delete it.');
      return;
    }
    if (!accessToken) {
      Alert.alert('Sign in required', 'You must be signed in to delete a saved bulk PFRA batch.');
      return;
    }

    requestConfirmation({
      title: 'Delete saved batch?',
      message: 'This will permanently remove the saved PFRA batch and its linked entries from Supabase. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => {
        const run = async () => {
          setIsDeletingBatch(true);
          try {
            await deletePFRABatch(targetBatchId, accessToken);
            await AsyncStorage.removeItem(`fitflight-bulk-pfra:${user?.id ?? 'anon'}:${targetBatchId}`).catch(() => undefined);
            const refreshedBatches = await fetchPFRABatches(accessToken, squadron).catch(() => []);
            setRecentBatches(refreshedBatches);
            setRowsByMemberId({});
            setSelectedFlights([]);
            Alert.alert('Batch deleted', 'The saved bulk PFRA batch was removed from Supabase.');
            if (targetBatchId === resolvedBatchId) {
              router.replace('/bulk-pfra-entry');
            }
          } catch (error) {
            Alert.alert('Unable to delete batch', error instanceof Error ? error.message : 'Please try again.');
          } finally {
            setIsDeletingBatch(false);
          }
        };
        void run();
      },
    });
  };

  if (!canManage) {
    return (
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: theme.background }}>
        <ThemeBackdrop />
        <Text style={[getThemeBodyStyle(theme, 16), { textAlign: 'center' }]}>Only PFL, UFPM, Owner, Squadron Leadership, and Group Personnel roles can use bulk PFRA entry.</Text>
      </View>
    );
  }

    return (
      <View className="flex-1">
        <LinearGradient colors={theme.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
        <ThemeBackdrop />
        <SafeAreaView edges={['top']} className="flex-1">
        <View className={cn('px-6 pt-4 pb-2', isCompactMobile ? '' : 'flex-row items-center justify-between')}>
          <View className="flex-row items-center flex-1">
            <Pressable onPress={() => router.back()} className={cn('w-10 h-10 rounded-full items-center justify-center', isCompactMobile ? 'mr-3' : 'mr-4')} style={getThemeControlStyle(theme)}>
              <ChevronLeft size={24} color={theme.textSecondary} />
            </Pressable>
            <View className="flex-1">
              <Text style={getThemeHeadingStyle(theme, 22)}>{resolvedBatchId ? 'Edit Bulk PFRA Entry' : 'Bulk PFRA Entry'}</Text>
              <Text style={[getThemeBodyStyle(theme, 14, theme.textSecondary), { marginTop: 4 }]}>Fast roster entry for mock, diagnostic, and official PFRA events.</Text>
            </View>
          </View>
          <View className={cn('flex-row items-center', isCompactMobile ? 'mt-4 justify-end' : '')} style={{ gap: 10 }}>
            {resolvedBatchId ? (
              <Pressable
                onPress={() => handleDeleteBatch()}
                disabled={isDeletingBatch || isSaving}
                className={cn('rounded-xl border px-4 py-3', (isDeletingBatch || isSaving) && 'opacity-50')}
                style={{ borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.12)' }}
              >
                <View className="flex-row items-center">
                  {isDeletingBatch ? <ActivityIndicator size="small" color="#EF4444" /> : <AlertTriangle size={16} color="#EF4444" />}
                  <Text style={[getThemeBodyStyle(theme, 14, '#EF4444'), { marginLeft: 8, fontWeight: '600' }]}>Delete</Text>
                </View>
              </Pressable>
            ) : null}
            <Pressable
              onPress={handleSave}
              disabled={isSaving || isLoadingExistingBatch || isDeletingBatch}
              className={cn(
                'rounded-xl border px-4 py-3',
                (isSaving || isLoadingExistingBatch || isDeletingBatch) && 'opacity-50'
              )}
              style={{ borderColor: theme.accent, backgroundColor: theme.accentSoft }}
            >
              <View className="flex-row items-center">
                {isLoadingExistingBatch || saveState === 'saving' ? (
                  <ActivityIndicator size="small" color={theme.accent} />
                ) : saveState === 'saved' ? (
                  <Check size={16} color="#22C55E" />
                ) : saveState === 'error' ? (
                  <AlertTriangle size={16} color="#EF4444" />
                ) : (
                  <Save size={16} color={theme.accent} />
                )}
                <Text
                  style={[
                    getThemeBodyStyle(
                      theme,
                      14,
                      saveState === 'saved'
                        ? '#22C55E'
                        : saveState === 'error'
                          ? '#EF4444'
                          : theme.accent
                    ),
                    { marginLeft: 8, fontWeight: '600' },
                  ]}
                >
                  {isLoadingExistingBatch
                    ? 'Loading...'
                    : saveState === 'saving'
                      ? 'Saving'
                      : saveState === 'saved'
                        ? 'Saved'
                        : saveState === 'error'
                          ? 'ERROR'
                          : 'Save All'}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
        <ScrollView className="flex-1 px-4 md:px-6" contentContainerStyle={{ paddingBottom: 40, alignItems: 'center' }} showsVerticalScrollIndicator={false}>
          <View style={{ width: '100%', maxWidth: contentMaxWidth }}>
          <ThemeChrome theme={theme}>
          <View className="mt-4 p-4">
            <Text style={getThemeHeadingStyle(theme, 18)}>PFRA Event Setup</Text>
            <Text style={[getThemeBodyStyle(theme, 14, theme.textSecondary), { marginTop: 8 }]}>Bulk entry uses the current FitFlight PFRA scoring logic. Because roster profiles do not store age, gender, or height yet, those values are captured in this grid for completed rows.</Text>

            <View className="mt-4 flex-row flex-wrap">
              {RECORD_TYPES.map((option) => (
                <View key={option.value} className="mr-2 mb-2">
                  <ToggleChip active={recordType === option.value} label={option.label} onPress={() => setRecordType(option.value)} />
                </View>
              ))}
            </View>

            {recordType === 'official' ? (
              <View className="mt-3 rounded-xl border px-4 py-3" style={{ borderColor: '#F59E0B66', backgroundColor: 'rgba(245,158,11,0.12)' }}>
                <Text style={getThemeBodyStyle(theme, 14, '#FBBF24')}>
                  Official PFRA scores still need to be submitted through the UFPM/FAC. Use this bulk entry for FitFlight planning, accountability, and internal tracking.
                </Text>
              </View>
            ) : null}

            <View className="mt-4">
              <Text style={[getThemeBodyStyle(theme, 12, theme.textMuted), { textTransform: 'uppercase', marginBottom: 8 }]}>Assessment Date</Text>
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
                  <Pressable onPress={() => setShowDatePicker(true)} className="rounded-xl border px-4 py-3 flex-row items-center justify-between" style={{ borderColor: theme.inputBorder, backgroundColor: theme.inputBackground }}>
                    <Text style={getThemeBodyStyle(theme, 14)}>{assessmentDate.toISOString().split('T')[0]}</Text>
                    <ChevronDown size={16} color={theme.textSecondary} />
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
              <Text style={[getThemeBodyStyle(theme, 12, theme.textMuted), { textTransform: 'uppercase', marginBottom: 8 }]}>Flights</Text>
              <View className="flex-row flex-wrap">
                {FLIGHTS.map((flight) => (
                  <View key={flight} className="mr-2 mb-2">
                    <ToggleChip active={selectedFlights.includes(flight)} label={flight} onPress={() => handleToggleFlight(flight)} />
                  </View>
                ))}
              </View>
            </View>

            <View className="mt-4 rounded-xl border px-4 py-3" style={{ borderColor: theme.border, backgroundColor: theme.surfaceAlt }}>
              <Text style={getThemeBodyStyle(theme, 14, theme.textSecondary)}>
                {selectedFlights.length === 0
                  ? 'Select one or more flights to load the roster.'
                  : `${availableMembers.length} member${availableMembers.length === 1 ? '' : 's'} loaded.`}
              </Text>
            </View>
          </View>
          </ThemeChrome>

          <ThemeChrome theme={theme}>
          <View className="mt-4 p-4">
            <View className="flex-row items-center">
              <ArrowUpDown size={18} color={theme.textSecondary} />
              <Text style={[getThemeHeadingStyle(theme, 18), { marginLeft: 8 }]}>Bulk Grid Sorting</Text>
            </View>
            <View className="mt-3 flex-row flex-wrap">
              <View className="mr-2 mb-2">
                <ToggleChip active={sortType === 'last_name'} label="Last Name" onPress={() => setSortType('last_name')} />
              </View>
              <View className="mr-2 mb-2">
                <ToggleChip active={sortType === 'flight'} label="Flight" onPress={() => setSortType('flight')} />
              </View>
              <View className="mr-2 mb-2">
                <ToggleChip active={sortType === 'status'} label="Status" onPress={() => setSortType('status')} />
              </View>
            </View>
            <Text style={[getThemeBodyStyle(theme, 12, theme.textSecondary), { marginTop: 8 }]}>
              Status sorting keeps completed and pending rows near the top and moves absent, excused, and postponed members toward the bottom.
            </Text>
          </View>
          </ThemeChrome>

          <ThemeChrome theme={theme}>
          <View className="mt-4 p-4">
            <View className="flex-row items-center">
              <History size={18} color={theme.textSecondary} />
              <Text style={[getThemeHeadingStyle(theme, 18), { marginLeft: 8 }]}>Previous Bulk Saves</Text>
            </View>
            <Text style={[getThemeBodyStyle(theme, 13, theme.textSecondary), { marginTop: 10 }]}>
              Opening a previous save fills the Bulk Entry Grid with that batch&apos;s saved values.
            </Text>
            {recentBatches.length === 0 ? (
              <Text style={[getThemeBodyStyle(theme, 14, theme.textSecondary), { marginTop: 12 }]}>No saved PFRA batches found for this squadron yet.</Text>
            ) : (
              <View className="mt-3">
                {recentBatches.slice(0, 8).map((batch) => (
                  <Pressable
                    key={batch.id}
                    onPress={() => handleOpenSavedBatch(batch.id)}
                    className="mb-3 rounded-xl border px-4 py-3 last:mb-0"
                    style={{
                      borderColor: resolvedBatchId === batch.id ? theme.accent : theme.border,
                      backgroundColor: resolvedBatchId === batch.id ? theme.accentSoft : theme.surfaceAlt,
                    }}
                  >
                    <View className="flex-row items-center justify-between">
                      <Text style={[getThemeBodyStyle(theme, 14, theme.textPrimary), { fontWeight: '600' }]}>{batch.assessmentDate} • {batch.recordType.toUpperCase()}</Text>
                      <View className="flex-row items-center" style={{ gap: 10 }}>
                        {resolvedBatchId === batch.id ? (
                          <View
                            className="rounded-full border px-2.5 py-1"
                            style={{ borderColor: `${theme.accent}88`, backgroundColor: 'rgba(74,144,217,0.16)' }}
                          >
                            <Text style={[getThemeBodyStyle(theme, 11, theme.accent), { fontWeight: '700' }]}>Opened</Text>
                          </View>
                        ) : null}
                        <Text style={[getThemeBodyStyle(theme, 14, theme.accent), { fontWeight: '600' }]}>
                          {resolvedBatchId === batch.id ? 'Loaded' : 'Open'}
                        </Text>
                      </View>
                    </View>
                    <Text style={[getThemeBodyStyle(theme, 12, theme.textSecondary), { marginTop: 8 }]}>
                      {batch.selectedFlights.join(', ')} • {batch.completedCount}/{batch.expectedCount} completed • Saved by {batch.createdByName}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
          </ThemeChrome>

          <ThemeChrome theme={theme} variant="feature">
          <View className="mt-4 p-4">
            <View className="flex-row items-center justify-between">
              <Text style={getThemeHeadingStyle(theme, 18)}>Bulk Entry Grid</Text>
              <Text className="text-af-silver text-sm">{completedRows.length} completed</Text>
            </View>
            {isCompactMobile ? (
              <View className="mt-4">
                {orderedRows.map((row) => {
                  const greyedOut = isGreyedOut(row.accountabilityStatus);
                  const scored = scoreBulkPFRARow(row);
                  return (
                    <View key={row.memberId} className={cn('mb-5 rounded-2xl border border-white/10 bg-black/15 p-4', greyedOut && 'opacity-50')}>
                      <View className="flex-row items-start justify-between">
                        <View className="flex-1 pr-3">
                          <Text className="text-white font-semibold">{row.memberName}</Text>
                          <Text className="mt-1 text-xs text-af-silver">{formatFlightDisplay(row.flight)}</Text>
                        </View>
                        <View className="items-end">
                          <Text className="text-lg font-bold text-white">{scored.overallScore?.toFixed(1) ?? '--'}</Text>
                          <Text className={cn('text-xs font-semibold', scored.passLabel === 'Pass' ? 'text-af-success' : scored.passLabel === 'Fail' ? 'text-af-danger' : 'text-af-silver')}>
                            {scored.passLabel}
                          </Text>
                        </View>
                      </View>

                      <Text className="mt-4 text-af-silver text-xs uppercase tracking-[0.4px]">Status</Text>
                      <View className="mt-2 flex-row flex-wrap" style={{ gap: 8 }}>
                        {ACCOUNTABILITY_OPTIONS.map((status) => (
                          <ToggleChip key={status} active={row.accountabilityStatus === status} label={status} onPress={() => updateRow(row.memberId, (current) => ({ ...current, accountabilityStatus: status }))} />
                        ))}
                      </View>

                      <View className="mt-4 flex-row" style={{ gap: 12 }}>
                        <View className="flex-1">
                          <Text className="mb-2 text-af-silver text-xs uppercase tracking-[0.4px]">Age</Text>
                          <SmallInput value={row.ageYears} onChangeText={(value) => updateRow(row.memberId, (current) => ({ ...current, ageYears: value.replace(/[^0-9]/g, '') }))} placeholder="#" editable={!greyedOut} />
                        </View>
                        <View className="flex-1">
                          <Text className="mb-2 text-af-silver text-xs uppercase tracking-[0.4px]">Sex</Text>
                          <View className="flex-row" style={{ gap: 8 }}>
                            <View className="flex-1">
                              <ToggleChip active={row.gender === 'male'} label="Male" onPress={() => updateRow(row.memberId, (current) => ({ ...current, gender: 'male' }))} />
                            </View>
                            <View className="flex-1">
                              <ToggleChip active={row.gender === 'female'} label="Female" onPress={() => updateRow(row.memberId, (current) => ({ ...current, gender: 'female' }))} />
                            </View>
                          </View>
                        </View>
                      </View>

                      <View className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                        <Text className="text-white font-semibold">Body Composition</Text>
                        <View className="mt-3 flex-row" style={{ gap: 12 }}>
                          <View className="flex-1">
                            <SmallInput value={row.heightIn} onChangeText={(value) => updateRow(row.memberId, (current) => ({ ...current, heightIn: value.replace(/[^0-9.]/g, '') }))} placeholder="Ht (in)" editable={!greyedOut && !row.exemptions.waist} />
                          </View>
                          <View className="flex-1">
                            <SmallInput value={row.waistIn} onChangeText={(value) => updateRow(row.memberId, (current) => ({ ...current, waistIn: value.replace(/[^0-9.]/g, '') }))} placeholder="Waist (in)" editable={!greyedOut && !row.exemptions.waist} />
                          </View>
                        </View>
                        <View className="mt-3 flex-row items-center self-start" style={{ gap: 8 }}>
                          <ScoreBadge label={`${scored.waistScore.toFixed(1)} pts`} />
                          <ToggleChip active={row.exemptions.waist} label="Exempt" onPress={() => updateRow(row.memberId, (current) => ({ ...current, exemptions: { ...current.exemptions, waist: !current.exemptions.waist } }))} />
                        </View>
                      </View>

                      <View className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                        <Text className="text-white font-semibold">Strength</Text>
                        <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
                          <ToggleChip active={row.strengthTest === 'pushups'} label="Push-ups" onPress={() => updateRow(row.memberId, (current) => ({ ...current, strengthTest: 'pushups' }))} />
                          <ToggleChip active={row.strengthTest === 'hand_release_pushups'} label="HR Push-ups" onPress={() => updateRow(row.memberId, (current) => ({ ...current, strengthTest: 'hand_release_pushups' }))} />
                        </View>
                        <View className="mt-3">
                          <SmallInput value={row.strengthValue} onChangeText={(value) => updateRow(row.memberId, (current) => ({ ...current, strengthValue: value }))} placeholder="Reps" editable={!greyedOut && !row.exemptions.strength} />
                        </View>
                        <View className="mt-3 flex-row items-center self-start" style={{ gap: 8 }}>
                          <ScoreBadge label={`${scored.strengthScore.toFixed(1)} pts`} />
                          <ToggleChip active={row.exemptions.strength} label="Exempt" onPress={() => updateRow(row.memberId, (current) => ({ ...current, exemptions: { ...current.exemptions, strength: !current.exemptions.strength } }))} />
                        </View>
                      </View>

                      <View className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                        <Text className="text-white font-semibold">Core</Text>
                        <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
                          <ToggleChip active={row.coreTest === 'situps'} label="Sit-ups" onPress={() => updateRow(row.memberId, (current) => ({ ...current, coreTest: 'situps' }))} />
                          <ToggleChip active={row.coreTest === 'cross_leg_reverse_crunch'} label="CLRC" onPress={() => updateRow(row.memberId, (current) => ({ ...current, coreTest: 'cross_leg_reverse_crunch' }))} />
                          <ToggleChip active={row.coreTest === 'plank'} label="Plank" onPress={() => updateRow(row.memberId, (current) => ({ ...current, coreTest: 'plank' }))} />
                        </View>
                        <View className="mt-3">
                          <SmallInput value={row.coreValue} onChangeText={(value) => updateRow(row.memberId, (current) => ({ ...current, coreValue: row.coreTest === 'plank' ? normalizeTimeLikeInput(value) : value.replace(/[^0-9]/g, '') }))} placeholder={row.coreTest === 'plank' ? 'mm:ss' : 'Reps'} editable={!greyedOut && !row.exemptions.core} />
                        </View>
                        <View className="mt-3 flex-row items-center self-start" style={{ gap: 8 }}>
                          <ScoreBadge label={`${scored.coreScore.toFixed(1)} pts`} />
                          <ToggleChip active={row.exemptions.core} label="Exempt" onPress={() => updateRow(row.memberId, (current) => ({ ...current, exemptions: { ...current.exemptions, core: !current.exemptions.core } }))} />
                        </View>
                      </View>

                      <View className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                        <Text className="text-white font-semibold">Cardio</Text>
                        <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
                          <ToggleChip active={row.cardioTest === 'run_2mile'} label="Run" onPress={() => updateRow(row.memberId, (current) => ({ ...current, cardioTest: 'run_2mile' }))} />
                          <ToggleChip active={row.cardioTest === 'hamr_20m'} label="HAMR" onPress={() => updateRow(row.memberId, (current) => ({ ...current, cardioTest: 'hamr_20m' }))} />
                          <ToggleChip active={row.cardioTest === 'walk_2k'} label="2K Walk" onPress={() => updateRow(row.memberId, (current) => ({ ...current, cardioTest: 'walk_2k' }))} />
                        </View>
                        <View className="mt-3">
                          <SmallInput value={row.cardioValue} onChangeText={(value) => updateRow(row.memberId, (current) => ({ ...current, cardioValue: row.cardioTest === 'hamr_20m' ? value.replace(/[^0-9]/g, '') : normalizeTimeLikeInput(value) }))} placeholder={row.cardioTest === 'hamr_20m' ? 'Shuttles' : 'mm:ss'} editable={!greyedOut && !row.exemptions.cardio} />
                        </View>
                        <View className="mt-3 flex-row items-center self-start" style={{ gap: 8 }}>
                          <ScoreBadge label={row.cardioTest === 'walk_2k' ? (scored.walkPass ? 'Walk Pass' : 'Walk Fail') : `${scored.cardioScore.toFixed(1)} pts`} />
                          <ToggleChip active={row.exemptions.cardio} label="Exempt" onPress={() => updateRow(row.memberId, (current) => ({ ...current, exemptions: { ...current.exemptions, cardio: !current.exemptions.cardio } }))} />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-4">
              <View>
                <View className="flex-row rounded-t-2xl border border-white/10 bg-black/20">
                  {[
                    ['Member', CELL_WIDTHS.member],
                    ['Status', CELL_WIDTHS.status],
                    ['Age', CELL_WIDTHS.age],
                    ['Sex', CELL_WIDTHS.gender],
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
                        <SmallInput value={row.ageYears} onChangeText={(value) => updateRow(row.memberId, (current) => ({ ...current, ageYears: value.replace(/[^0-9]/g, '') }))} placeholder="#" editable={!greyedOut} />
                      </View>
                      <View style={{ width: CELL_WIDTHS.gender }} className="px-2 py-3 border-r border-white/10">
                        <ToggleChip active={row.gender === 'male'} label="Male" onPress={() => updateRow(row.memberId, (current) => ({ ...current, gender: 'male' }))} />
                        <View className="mt-2">
                          <ToggleChip active={row.gender === 'female'} label="Female" onPress={() => updateRow(row.memberId, (current) => ({ ...current, gender: 'female' }))} />
                        </View>
                      </View>
                      <View style={{ width: CELL_WIDTHS.body }} className="px-2 py-3 border-r border-white/10">
                        <SmallInput value={row.heightIn} onChangeText={(value) => updateRow(row.memberId, (current) => ({ ...current, heightIn: value.replace(/[^0-9.]/g, '') }))} placeholder="Ht (in)" editable={!greyedOut && !row.exemptions.waist} />
                      <View className="mt-2">
                          <SmallInput value={row.waistIn} onChangeText={(value) => updateRow(row.memberId, (current) => ({ ...current, waistIn: value.replace(/[^0-9.]/g, '') }))} placeholder="Waist (in)" editable={!greyedOut && !row.exemptions.waist} />
                        </View>
                        <View className="mt-2 flex-row flex-wrap items-center" style={{ gap: 8 }}>
                          <ScoreBadge label={`${scored.waistScore.toFixed(1)} pts`} />
                          <ToggleChip active={row.exemptions.waist} label="Exempt" onPress={() => updateRow(row.memberId, (current) => ({ ...current, exemptions: { ...current.exemptions, waist: !current.exemptions.waist } }))} />
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
                        <View className="mt-2 flex-row flex-wrap items-center" style={{ gap: 8 }}>
                          <ScoreBadge label={`${scored.strengthScore.toFixed(1)} pts`} />
                          <ToggleChip active={row.exemptions.strength} label="Exempt" onPress={() => updateRow(row.memberId, (current) => ({ ...current, exemptions: { ...current.exemptions, strength: !current.exemptions.strength } }))} />
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
                          <SmallInput value={row.coreValue} onChangeText={(value) => updateRow(row.memberId, (current) => ({ ...current, coreValue: row.coreTest === 'plank' ? normalizeTimeLikeInput(value) : value.replace(/[^0-9]/g, '') }))} placeholder={row.coreTest === 'plank' ? 'mm:ss' : 'Reps'} editable={!greyedOut && !row.exemptions.core} />
                        </View>
                        <View className="mt-2 flex-row flex-wrap items-center" style={{ gap: 8 }}>
                          <ScoreBadge label={`${scored.coreScore.toFixed(1)} pts`} />
                          <ToggleChip active={row.exemptions.core} label="Exempt" onPress={() => updateRow(row.memberId, (current) => ({ ...current, exemptions: { ...current.exemptions, core: !current.exemptions.core } }))} />
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
                          <SmallInput value={row.cardioValue} onChangeText={(value) => updateRow(row.memberId, (current) => ({ ...current, cardioValue: row.cardioTest === 'hamr_20m' ? value.replace(/[^0-9]/g, '') : normalizeTimeLikeInput(value) }))} placeholder={row.cardioTest === 'hamr_20m' ? 'Shuttles' : 'mm:ss'} editable={!greyedOut && !row.exemptions.cardio} />
                        </View>
                        <View className="mt-2 flex-row flex-wrap items-center" style={{ gap: 8 }}>
                          <ScoreBadge label={row.cardioTest === 'walk_2k' ? (scored.walkPass ? 'Walk Pass' : 'Walk Fail') : `${scored.cardioScore.toFixed(1)} pts`} />
                          <ToggleChip active={row.exemptions.cardio} label="Exempt" onPress={() => updateRow(row.memberId, (current) => ({ ...current, exemptions: { ...current.exemptions, cardio: !current.exemptions.cardio } }))} />
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
            )}
          </View>
          </ThemeChrome>
          </View>
        </ScrollView>
        <Modal
          visible={Boolean(confirmDialog)}
          transparent
          animationType="fade"
          onRequestClose={() => setConfirmDialog(null)}
        >
          <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: 'rgba(3, 7, 18, 0.7)' }}>
            <Pressable className="absolute inset-0" onPress={() => setConfirmDialog(null)} />
            <View style={{ width: '100%', maxWidth: 440 }}>
              <ThemeChrome theme={theme} variant="feature" blurIntensity={88} forceBlur>
                <View className="p-5">
                  <Text style={getThemeHeadingStyle(theme, 20)}>{confirmDialog?.title}</Text>
                  <Text
                    style={[
                      getThemeBodyStyle(theme, 14, theme.textSecondary),
                      { marginTop: 12, lineHeight: 22 },
                    ]}
                  >
                    {confirmDialog?.message}
                  </Text>
                  <View className="mt-5 flex-row justify-end" style={{ gap: 10 }}>
                    <Pressable
                      onPress={() => setConfirmDialog(null)}
                      className="rounded-xl border px-4 py-3"
                      style={getThemeControlStyle(theme)}
                    >
                      <Text style={[getThemeBodyStyle(theme, 14, theme.textSecondary), { fontWeight: '600' }]}>
                        Cancel
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handleConfirmDialog}
                      className="rounded-xl border px-4 py-3"
                      style={{
                        borderColor: confirmDialog?.destructive ? '#EF4444' : theme.accent,
                        backgroundColor: confirmDialog?.destructive ? 'rgba(239,68,68,0.14)' : theme.accentSoft,
                      }}
                    >
                      <Text
                        style={[
                          getThemeBodyStyle(theme, 14, confirmDialog?.destructive ? '#EF4444' : theme.accent),
                          { fontWeight: '700' },
                        ]}
                      >
                        {confirmDialog?.confirmLabel ?? 'Confirm'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </ThemeChrome>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}
