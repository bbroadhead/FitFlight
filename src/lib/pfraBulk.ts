import type { FitnessAssessment, Flight, PFRAAccountabilityStatus, PFRARecordType } from '@/lib/store';
import {
  meetsPFRAComponentMinimumsWithExemptions,
  passesWalk2k,
  scoreCardio,
  scoreCore,
  scoreStrength,
  scoreWHtR,
  scoreWithExemptions,
  type Gender,
} from '@/lib/pfraScoring2026';

export type BulkCardioTest = 'run_2mile' | 'hamr_20m' | 'walk_2k';
export type BulkStrengthTest = 'pushups' | 'hand_release_pushups';
export type BulkCoreTest = 'situps' | 'cross_leg_reverse_crunch' | 'plank';

export type BulkPFRARowDraft = {
  memberId: string;
  memberEmail: string;
  memberName: string;
  flight: Flight;
  accountabilityStatus: PFRAAccountabilityStatus;
  ageYears: string;
  gender: Gender;
  heightIn: string;
  waistIn: string;
  strengthTest: BulkStrengthTest;
  strengthValue: string;
  coreTest: BulkCoreTest;
  coreValue: string;
  cardioTest: BulkCardioTest;
  cardioValue: string;
  exemptions: {
    waist: boolean;
    strength: boolean;
    core: boolean;
    cardio: boolean;
  };
};

export type BulkPFRAScoredRow = {
  waistScore: number;
  strengthScore: number;
  coreScore: number;
  cardioScore: number;
  overallScore: number | null;
  walkPass: boolean;
  meetsMinimums: boolean;
  passLabel: 'Pass' | 'Fail' | 'N/A';
};

export function createEmptyBulkPFRARow(member: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  flight: Flight;
}): BulkPFRARowDraft {
  return {
    memberId: member.id,
    memberEmail: member.email,
    memberName: `${member.lastName}, ${member.firstName}`,
    flight: member.flight,
    accountabilityStatus: 'pending',
    ageYears: '',
    gender: 'male',
    heightIn: '',
    waistIn: '',
    strengthTest: 'pushups',
    strengthValue: '',
    coreTest: 'situps',
    coreValue: '',
    cardioTest: 'run_2mile',
    cardioValue: '',
    exemptions: {
      waist: false,
      strength: false,
      core: false,
      cardio: false,
    },
  };
}

function parseClockToSeconds(value: string) {
  const cleaned = value.trim();
  if (!cleaned) {
    return 0;
  }

  if (!cleaned.includes(':')) {
    const numeric = Number(cleaned);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  const [minutes, seconds = '0'] = cleaned.split(':');
  const minuteValue = Number(minutes);
  const secondValue = Number(seconds);
  if (!Number.isFinite(minuteValue) || !Number.isFinite(secondValue)) {
    return 0;
  }

  return minuteValue * 60 + secondValue;
}

export function scoreBulkPFRARow(row: BulkPFRARowDraft): BulkPFRAScoredRow {
  if (row.accountabilityStatus !== 'completed') {
    return {
      waistScore: 0,
      strengthScore: 0,
      coreScore: 0,
      cardioScore: 0,
      overallScore: null,
      walkPass: false,
      meetsMinimums: false,
      passLabel: 'N/A',
    };
  }

  const ageYears = Number(row.ageYears);
  const waistIn = Number(row.waistIn);
  const heightIn = Number(row.heightIn);
  const strengthValue = Number(row.strengthValue);
  const coreValue = row.coreTest === 'plank' ? parseClockToSeconds(row.coreValue) : Number(row.coreValue);
  const cardioValue =
    row.cardioTest === 'hamr_20m'
      ? Number(row.cardioValue)
      : parseClockToSeconds(row.cardioValue);

  const waistScore = row.exemptions.waist ? 0 : scoreWHtR(waistIn, heightIn);
  const strengthScore = row.exemptions.strength ? 0 : scoreStrength(ageYears, row.gender, row.strengthTest, strengthValue);
  const coreScore = row.exemptions.core ? 0 : scoreCore(ageYears, row.gender, row.coreTest, coreValue);
  const cardioScore = row.exemptions.cardio ? 0 : scoreCardio(ageYears, row.gender, row.cardioTest, cardioValue);
  const walkPass = row.cardioTest === 'walk_2k' && !row.exemptions.cardio ? passesWalk2k(ageYears, row.gender, cardioValue) : false;

  const exemptionAwareSummary = scoreWithExemptions(
    {
      waist: waistScore,
      strength: strengthScore,
      core: coreScore,
      cardio: cardioScore,
    },
    row.exemptions
  );

  const meetsMinimums = row.cardioTest === 'walk_2k'
    ? walkPass && meetsPFRAComponentMinimumsWithExemptions(
      {
        waist: waistScore,
        strength: strengthScore,
        core: coreScore,
        cardio: 35,
      },
      row.exemptions
    )
    : meetsPFRAComponentMinimumsWithExemptions(
      {
        waist: waistScore,
        strength: strengthScore,
        core: coreScore,
        cardio: cardioScore,
      },
      row.exemptions
    );

  const overallScore = exemptionAwareSummary.normalizedTotal === null
    ? null
    : Number(exemptionAwareSummary.normalizedTotal.toFixed(1));

  const passLabel = overallScore === null
    ? 'N/A'
    : (meetsMinimums && overallScore >= 75 ? 'Pass' : 'Fail');

  return {
    waistScore,
    strengthScore,
    coreScore,
    cardioScore: row.cardioTest === 'walk_2k' ? (walkPass ? 50 : 0) : cardioScore,
    overallScore,
    walkPass,
    meetsMinimums,
    passLabel,
  };
}

export function buildBulkAssessment(params: {
  recordId: string;
  date: string;
  recordType: PFRARecordType;
  batchId?: string;
  row: BulkPFRARowDraft;
  scored: BulkPFRAScoredRow;
}): FitnessAssessment {
  return {
    id: params.recordId,
    date: params.date,
    overallScore: params.scored.overallScore ?? 0,
    recordType: params.recordType,
    batchId: params.batchId,
    accountabilityStatus: params.row.accountabilityStatus,
    isPrivate: false,
    components: {
      cardio: params.row.cardioTest === 'hamr_20m'
        ? {
            score: params.scored.cardioScore,
            laps: Number(params.row.cardioValue || 0),
            test: params.row.cardioTest,
            exempt: params.row.exemptions.cardio,
          }
        : {
            score: params.scored.cardioScore,
            time: params.row.cardioValue || undefined,
            test: params.row.cardioTest,
            exempt: params.row.exemptions.cardio,
          },
      pushups: {
        score: params.scored.strengthScore,
        reps: Number(params.row.strengthValue || 0),
        test: params.row.strengthTest,
        exempt: params.row.exemptions.strength,
      },
      situps: {
        score: params.scored.coreScore,
        reps: params.row.coreTest === 'plank' ? 0 : Number(params.row.coreValue || 0),
        time: params.row.coreTest === 'plank' ? params.row.coreValue || undefined : undefined,
        test: params.row.coreTest,
        exempt: params.row.exemptions.core,
      },
      waist: {
        score: params.scored.waistScore,
        inches: Number(params.row.waistIn || 0),
        exempt: params.row.exemptions.waist,
      },
    },
  };
}
