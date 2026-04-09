import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, Modal, TextInput, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Upload, FileSpreadsheet, FileText, Check, X, AlertTriangle, Users, ChevronDown, Trash2 } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useMemberStore, useAuthStore, type Flight, type Member, type Squadron } from '@/lib/store';
import { cn } from '@/lib/cn';
import { createRosterMember } from '@/lib/supabaseData';

const FLIGHTS: Flight[] = ['Apex', 'Bomber', 'Cryptid', 'Doom', 'Ewok', 'Foxhound', 'ADF', 'DET'];
const RANKS = ['AB', 'Amn', 'A1C', 'SrA', 'SSgt', 'TSgt', 'MSgt', 'SMSgt', 'CMSgt'];

interface ParsedRow {
  rank: string;
  firstName: string;
  lastName: string;
  email: string;
  flight: string;
  isValid: boolean;
  errors: string[];
}

interface ColumnMapping {
  fullName: number;
  rank: number;
  email: number;
  flight: number;
}

// Simple CSV parser
function parseCSV(content: string): string[][] {
  const lines = content.trim().split(/\r?\n/);
  return lines.map(line => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  });
}

// Simple XLSX parser (reads as CSV after conversion - we'll handle the basic case)
// For full XLSX support in production, you'd use a library like xlsx
function parseXLSX(content: string): string[][] {
  // If it's actually a CSV formatted as xlsx, try to parse it
  // Real XLSX files are binary and need special handling
  try {
    return parseCSV(content);
  } catch {
    return [];
  }
}

export default function ImportRosterScreen() {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const members = useMemberStore(s => s.members);
  const addMember = useMemberStore(s => s.addMember);

  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'complete'>('upload');
  const [rawData, setRawData] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    fullName: 0,
    rank: 1,
    email: 2,
    flight: 3,
  });
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importedCount, setImportedCount] = useState(0);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState<keyof ColumnMapping | null>(null);
  const [fileName, setFileName] = useState<string>('');

  const userSquadron: Squadron = user?.squadron ?? 'Hawks';

  const parseRosterName = (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }

    if (!trimmed.includes(',')) {
      const parts = trimmed.split(/\s+/).filter(Boolean);
      if (parts.length < 2) {
        return null;
      }

      return {
        firstName: parts[0],
        lastName: parts.slice(1).join(' '),
      };
    }

    const [lastPart, firstPart = ''] = trimmed.split(',', 2);
    const firstName = firstPart.trim().split(/\s+/)[0] ?? '';
    const lastName = lastPart.trim();

    if (!firstName || !lastName) {
      return null;
    }

    return { firstName, lastName };
  };

  // Validate and normalize rank
  const normalizeRank = (input: string): string | null => {
    const normalized = input.trim().toUpperCase();
    const rankMap: Record<string, string> = {
      'AB': 'AB',
      'AMN': 'Amn',
      'A1C': 'A1C',
      'SRA': 'SrA',
      'SSGT': 'SSgt',
      'TSGT': 'TSgt',
      'MSGT': 'MSgt',
      'SMSGT': 'SMSgt',
      'CMSGT': 'CMSgt',
      // Common variations
      'AIRMAN BASIC': 'AB',
      'AIRMAN': 'Amn',
      'AIRMAN FIRST CLASS': 'A1C',
      'SENIOR AIRMAN': 'SrA',
      'STAFF SERGEANT': 'SSgt',
      'TECHNICAL SERGEANT': 'TSgt',
      'MASTER SERGEANT': 'MSgt',
      'SENIOR MASTER SERGEANT': 'SMSgt',
      'CHIEF MASTER SERGEANT': 'CMSgt',
    };
    return rankMap[normalized] || RANKS.find(r => r.toUpperCase() === normalized) || null;
  };

  // Validate and normalize flight
  const normalizeFlight = (input: string): Flight | null => {
    const normalized = input.trim().toLowerCase();
    const flightMap: Record<string, Flight> = {
      'apex': 'Apex',
      'bomber': 'Bomber',
      'cryptid': 'Cryptid',
      'doom': 'Doom',
      'ewok': 'Ewok',
      'foxhound': 'Foxhound',
      'adf': 'ADF',
      'det': 'DET',
      // Common variations
      'a': 'Apex',
      'b': 'Bomber',
      'c': 'Cryptid',
      'd': 'Doom',
      'e': 'Ewok',
      'f': 'Foxhound',
    };
    return flightMap[normalized] || FLIGHTS.find(f => f.toLowerCase() === normalized) || null;
  };

  // Parse and validate rows
  const processData = () => {
    const dataRows = hasHeader ? rawData.slice(1) : rawData;

    const parsed: ParsedRow[] = dataRows.map(row => {
      const errors: string[] = [];

      const rawFullName = row[columnMapping.fullName] || '';
      const parsedName = parseRosterName(rawFullName);
      const rawRank = row[columnMapping.rank] || '';
      const rawEmail = (row[columnMapping.email] || '').trim().toLowerCase();
      const rawFlight = row[columnMapping.flight] || '';

      const normalizedRank = normalizeRank(rawRank);
      const normalizedFlight = normalizeFlight(rawFlight);

      if (!parsedName) errors.push(`Invalid name format: "${rawFullName}"`);
      if (!normalizedRank) errors.push(`Invalid rank: "${rawRank}"`);
      if (!rawEmail) errors.push('Missing email');
      if (!normalizedFlight) errors.push(`Invalid flight: "${rawFlight}"`);

      // Check for duplicates
      const existingMember = members.find(
        m => ((rawEmail && m.email.toLowerCase() === rawEmail) || (
             parsedName &&
             m.firstName.toLowerCase() === parsedName.firstName.toLowerCase() &&
             m.lastName.toLowerCase() === parsedName.lastName.toLowerCase())) &&
             m.squadron === userSquadron
      );
      if (existingMember) {
        errors.push('Already exists in roster');
      }

      return {
        rank: normalizedRank || rawRank,
        firstName: parsedName?.firstName ?? '',
        lastName: parsedName?.lastName ?? '',
        email: rawEmail,
        flight: normalizedFlight || rawFlight,
        isValid: errors.length === 0,
        errors,
      };
    }).filter(row => row.firstName || row.lastName); // Filter out completely empty rows

    setParsedRows(parsed);
    setStep('preview');
  };

  // Handle file selection
  const handleFilePick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/plain',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const file = result.assets[0];
      setFileName(file.name);

      // Read file content
      const content = await FileSystem.readAsStringAsync(file.uri);

      // Parse based on file type
      let data: string[][];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        // For XLSX, we'd need a proper library, but we'll try basic parsing
        data = parseXLSX(content);
        if (data.length === 0) {
          Alert.alert('Error', 'Could not parse XLSX file. Please export as CSV and try again.');
          return;
        }
      } else {
        data = parseCSV(content);
      }

      if (data.length === 0) {
        Alert.alert('Error', 'No data found in file');
        return;
      }

      setRawData(data);

      // Try to auto-detect columns
      const headerRow = data[0];
      const autoMapping: ColumnMapping = { ...columnMapping };

      headerRow.forEach((cell, index) => {
        const lower = cell.toLowerCase();
        if (lower.includes('full_name') || lower.includes('full name') || lower === 'name') {
          autoMapping.fullName = index;
        } else if (lower.includes('rank') || lower === 'grade') {
          autoMapping.rank = index;
        } else if (lower.includes('email') || lower === 'mail') {
          autoMapping.email = index;
        } else if (lower.includes('flight') || lower.includes('flt') || lower === 'section' || lower === 'unit') {
          autoMapping.flight = index;
        }
      });

      setColumnMapping(autoMapping);
      setStep('mapping');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('File pick error:', error);
      Alert.alert('Error', 'Failed to read file. Please try again.');
    }
  };

  // Import valid rows
  const handleImport = () => {
    const run = async () => {
      if (!accessToken) {
        Alert.alert('Sign In Required', 'You must be signed in to import roster members.');
        return;
      }

    const validRows = parsedRows.filter(row => row.isValid);

    for (const row of validRows) {
      const newMember: Member = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        rank: row.rank,
        firstName: row.firstName,
        lastName: row.lastName,
        flight: row.flight as Flight,
        squadron: userSquadron,
        accountType: 'standard',
        email: row.email,
        exerciseMinutes: 0,
        distanceRun: 0,
        connectedApps: [],
        fitnessAssessments: [],
        workouts: [],
        achievements: [],
        requiredPTSessionsPerWeek: 3,
        isVerified: false,
        ptlPendingApproval: false,
        monthlyPlacements: [],
        leaderboardHistory: [],
        trophyCount: 0,
      };
      await createRosterMember(newMember, accessToken);
      addMember(newMember);
    }

    setImportedCount(validRows.length);
    setStep('complete');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    void run().catch((error) => {
      Alert.alert('Import failed', error instanceof Error ? error.message : 'Unable to import this roster.');
    });
  };

  const validCount = parsedRows.filter(r => r.isValid).length;
  const invalidCount = parsedRows.filter(r => !r.isValid).length;

  // Get column headers for mapping display
  const headerRow = hasHeader && rawData.length > 0 ? rawData[0] : [];
  const accessToken = useAuthStore(s => s.accessToken);

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
          <View className="flex-1">
            <Text className="text-white text-xl font-bold">Import Roster</Text>
            <Text className="text-af-silver text-sm">Add members from CSV or Excel</Text>
          </View>
        </Animated.View>

        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <Animated.View entering={FadeInDown.delay(150).springify()}>
              <View className="mt-6 p-6 bg-white/5 rounded-2xl border border-dashed border-white/20">
                <View className="items-center">
                  <View className="w-16 h-16 bg-af-accent/20 rounded-full items-center justify-center mb-4">
                    <Upload size={32} color="#4A90D9" />
                  </View>
                  <Text className="text-white font-semibold text-lg mb-2">Upload Roster File</Text>
                  <Text className="text-af-silver text-center text-sm mb-4">
                    Select a CSV or Excel file containing your roster data
                  </Text>

                  <Pressable
                    onPress={handleFilePick}
                    className="bg-af-accent px-6 py-3 rounded-xl"
                  >
                    <Text className="text-white font-semibold">Choose File</Text>
                  </Pressable>
                </View>
              </View>

              {/* Expected format */}
              <View className="mt-6 p-4 bg-white/5 rounded-2xl border border-white/10">
                <Text className="text-white font-semibold mb-3">Expected Format</Text>
                <Text className="text-af-silver text-sm mb-3">
                  Your file should contain columns for:
                </Text>
                <View className="space-y-2">
                  <View className="flex-row items-center">
                    <View className="w-2 h-2 bg-af-accent rounded-full mr-3" />
                    <Text className="text-white">FULL_NAME (for example, BROADHEAD, BENJAMIN LEWIS)</Text>
                  </View>
                  <View className="flex-row items-center mt-2">
                    <View className="w-2 h-2 bg-af-accent rounded-full mr-3" />
                    <Text className="text-white">RANK (e.g., SSG, A1C)</Text>
                  </View>
                  <View className="flex-row items-center mt-2">
                    <View className="w-2 h-2 bg-af-accent rounded-full mr-3" />
                    <Text className="text-white">EMAIL</Text>
                  </View>
                  <View className="flex-row items-center mt-2">
                    <View className="w-2 h-2 bg-af-accent rounded-full mr-3" />
                    <Text className="text-white">FLT-DET (e.g., A FLT, D FLT, DET 1)</Text>
                  </View>
                </View>

                <View className="mt-4 p-3 bg-white/5 rounded-xl">
                  <Text className="text-af-silver text-xs">Example:</Text>
                  <Text className="text-white/80 font-mono text-xs mt-1">
                    FULL_NAME,RANK,EMAIL,FLT-DET{'\n'}
                    BROADHEAD, BENJAMIN LEWIS,SSG,benjamin.broadhead.2@us.af.mil,D FLT{'\n'}
                    PENA, DANIEL,A1C,daniel.pena.1@us.af.mil,B FLT
                  </Text>
                </View>

                <View className="mt-4 p-3 bg-af-accent/10 rounded-xl border border-af-accent/20">
                  <Text className="text-af-silver text-sm">
                    Imported members are added to the existing roster for your squadron. They do not replace the members already in the app.
                  </Text>
                </View>
              </View>

              {/* Supported formats */}
              <View className="mt-4 flex-row">
                <View className="flex-1 flex-row items-center bg-white/5 rounded-xl p-3 mr-2">
                  <FileText size={20} color="#22C55E" />
                  <Text className="text-white ml-2 text-sm">CSV</Text>
                </View>
                <View className="flex-1 flex-row items-center bg-white/5 rounded-xl p-3 ml-2">
                  <FileSpreadsheet size={20} color="#22C55E" />
                  <Text className="text-white ml-2 text-sm">Excel</Text>
                </View>
              </View>
            </Animated.View>
          )}

          {/* Step 2: Column Mapping */}
          {step === 'mapping' && (
            <Animated.View entering={FadeInDown.delay(150).springify()}>
              <View className="mt-4 p-4 bg-af-success/20 rounded-xl border border-af-success/50 flex-row items-center">
                <Check size={20} color="#22C55E" />
                <Text className="text-af-success ml-2 flex-1">File loaded: {fileName}</Text>
              </View>

              {/* Header row toggle */}
              <View className="mt-4 flex-row items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                <Text className="text-white">First row is header</Text>
                <Pressable
                  onPress={() => setHasHeader(!hasHeader)}
                  className={cn(
                    "w-12 h-7 rounded-full justify-center px-1",
                    hasHeader ? "bg-af-accent" : "bg-white/20"
                  )}
                >
                  <View className={cn(
                    "w-5 h-5 bg-white rounded-full",
                    hasHeader ? "self-end" : "self-start"
                  )} />
                </Pressable>
              </View>

              {/* Column mapping */}
              <View className="mt-4">
                <Text className="text-white font-semibold mb-3">Map Columns</Text>

                {(['fullName', 'rank', 'email', 'flight'] as const).map((field) => (
                  <Pressable
                    key={field}
                    onPress={() => {
                      setSelectedColumn(field);
                      setShowMappingModal(true);
                    }}
                    className="flex-row items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 mb-2"
                  >
                    <View>
                      <Text className="text-white font-medium">
                        {field === 'fullName' ? 'Full Name' :
                         field === 'email' ? 'Email' :
                         field.charAt(0).toUpperCase() + field.slice(1)}
                      </Text>
                      <Text className="text-af-silver text-sm">
                        Column {columnMapping[field] + 1}
                        {hasHeader && headerRow[columnMapping[field]] && ` (${headerRow[columnMapping[field]]})`}
                      </Text>
                    </View>
                    <ChevronDown size={20} color="#C0C0C0" />
                  </Pressable>
                ))}
              </View>

              {/* Preview first row */}
              {rawData.length > (hasHeader ? 1 : 0) && (
                <View className="mt-4 p-4 bg-white/5 rounded-xl border border-white/10">
                  <Text className="text-white/60 text-xs uppercase mb-2">First Data Row Preview</Text>
                  <View className="flex-row flex-wrap">
                    <Text className="text-white mr-2">
                      <Text className="text-af-silver">Name: </Text>
                      {rawData[hasHeader ? 1 : 0]?.[columnMapping.fullName] || '-'}
                    </Text>
                    <Text className="text-white mr-2">
                      <Text className="text-af-silver">Rank: </Text>
                      {rawData[hasHeader ? 1 : 0]?.[columnMapping.rank] || '-'}
                    </Text>
                    <Text className="text-white">
                      <Text className="text-af-silver">Email: </Text>
                      {rawData[hasHeader ? 1 : 0]?.[columnMapping.email] || '-'}
                    </Text>
                    <Text className="text-white">
                      <Text className="text-af-silver">Flight: </Text>
                      {rawData[hasHeader ? 1 : 0]?.[columnMapping.flight] || '-'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Continue button */}
              <Pressable
                onPress={processData}
                className="mt-6 bg-af-accent py-4 rounded-xl"
              >
                <Text className="text-white font-bold text-center">Continue to Preview</Text>
              </Pressable>
            </Animated.View>
          )}

          {/* Step 3: Preview */}
          {step === 'preview' && (
            <Animated.View entering={FadeInDown.delay(150).springify()}>
              {/* Summary */}
              <View className="mt-4 flex-row">
                <View className="flex-1 p-4 bg-af-success/20 rounded-xl border border-af-success/50 mr-2">
                  <Text className="text-af-success text-2xl font-bold">{validCount}</Text>
                  <Text className="text-af-success text-sm">Valid</Text>
                </View>
                <View className="flex-1 p-4 bg-af-danger/20 rounded-xl border border-af-danger/50 ml-2">
                  <Text className="text-af-danger text-2xl font-bold">{invalidCount}</Text>
                  <Text className="text-af-danger text-sm">Invalid</Text>
                </View>
              </View>

              {/* Rows list */}
              <View className="mt-4">
                <Text className="text-white font-semibold mb-3">Preview ({parsedRows.length} rows)</Text>

                {parsedRows.map((row, index) => (
                  <View
                    key={index}
                    className={cn(
                      "p-4 rounded-xl mb-2 border",
                      row.isValid
                        ? "bg-white/5 border-white/10"
                        : "bg-af-danger/10 border-af-danger/30"
                    )}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1">
                        <Text className="text-white font-medium">
                          {row.rank} {row.firstName} {row.lastName}
                        </Text>
                        <Text className="text-af-silver text-sm">{row.email}</Text>
                        <Text className="text-af-silver text-sm">{row.flight} Flight</Text>
                      </View>
                      {row.isValid ? (
                        <View className="w-8 h-8 bg-af-success/20 rounded-full items-center justify-center">
                          <Check size={18} color="#22C55E" />
                        </View>
                      ) : (
                        <View className="w-8 h-8 bg-af-danger/20 rounded-full items-center justify-center">
                          <X size={18} color="#EF4444" />
                        </View>
                      )}
                    </View>
                    {row.errors.length > 0 && (
                      <View className="mt-2 pt-2 border-t border-white/10">
                        {row.errors.map((error, i) => (
                          <View key={i} className="flex-row items-center mt-1">
                            <AlertTriangle size={12} color="#EF4444" />
                            <Text className="text-af-danger text-xs ml-1">{error}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </View>

              {/* Action buttons */}
              <View className="mt-6 flex-row">
                <Pressable
                  onPress={() => setStep('mapping')}
                  className="flex-1 bg-white/10 py-4 rounded-xl mr-2"
                >
                  <Text className="text-white font-bold text-center">Back</Text>
                </Pressable>
                <Pressable
                  onPress={handleImport}
                  disabled={validCount === 0}
                  className={cn(
                    "flex-1 py-4 rounded-xl ml-2",
                    validCount > 0 ? "bg-af-accent" : "bg-white/10"
                  )}
                >
                  <Text className={cn(
                    "font-bold text-center",
                    validCount > 0 ? "text-white" : "text-white/40"
                  )}>
                    Import {validCount} Members
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          )}

          {/* Step 4: Complete */}
          {step === 'complete' && (
            <Animated.View entering={FadeInDown.delay(150).springify()} className="items-center mt-12">
              <View className="w-24 h-24 bg-af-success/20 rounded-full items-center justify-center mb-6">
                <Check size={48} color="#22C55E" />
              </View>
              <Text className="text-white text-2xl font-bold mb-2">Import Complete</Text>
              <Text className="text-af-silver text-center mb-6">
                Successfully added {importedCount} members to the {userSquadron} roster
              </Text>

              <View className="flex-row items-center bg-white/5 rounded-xl p-4 mb-6">
                <Users size={24} color="#4A90D9" />
                <Text className="text-white ml-3">
                  {members.length} total members in {userSquadron}
                </Text>
              </View>

              <Pressable
                onPress={() => router.back()}
                className="bg-af-accent px-8 py-4 rounded-xl"
              >
                <Text className="text-white font-bold">Done</Text>
              </Pressable>
            </Animated.View>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Column Mapping Modal */}
      <Modal visible={showMappingModal} transparent animationType="slide">
        <View className="flex-1 bg-black/80 justify-end">
          <View className="bg-af-navy rounded-t-3xl p-6 pb-12 max-h-[60%]">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-white text-xl font-bold">
                Select Column for {selectedColumn === 'fullName' ? 'Full Name' :
                  selectedColumn === 'email' ? 'Email' :
                  selectedColumn ? selectedColumn.charAt(0).toUpperCase() + selectedColumn.slice(1) : ''}
              </Text>
              <Pressable
                onPress={() => setShowMappingModal(false)}
                className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
              >
                <X size={20} color="#C0C0C0" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {(hasHeader ? headerRow : rawData[0] || []).map((cell, index) => (
                <Pressable
                  key={index}
                  onPress={() => {
                    if (selectedColumn) {
                      setColumnMapping(prev => ({ ...prev, [selectedColumn]: index }));
                    }
                    setShowMappingModal(false);
                    Haptics.selectionAsync();
                  }}
                  className={cn(
                    "flex-row items-center p-4 rounded-xl mb-2 border",
                    selectedColumn && columnMapping[selectedColumn] === index
                      ? "bg-af-accent/20 border-af-accent"
                      : "bg-white/5 border-white/10"
                  )}
                >
                  <View className="w-8 h-8 bg-white/10 rounded-full items-center justify-center mr-3">
                    <Text className="text-white font-bold text-sm">{index + 1}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-medium">
                      {hasHeader ? cell || `Column ${index + 1}` : `Column ${index + 1}`}
                    </Text>
                    {hasHeader && rawData[1] && (
                      <Text className="text-af-silver text-sm">
                        Sample: {rawData[1][index] || '-'}
                      </Text>
                    )}
                  </View>
                  {selectedColumn && columnMapping[selectedColumn] === index && (
                    <Check size={20} color="#4A90D9" />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
