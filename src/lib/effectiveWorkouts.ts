import type { AttendanceSource, FitnessAssessment, Member, PTSession, Workout } from '@/lib/store';

export interface MemberAttendanceRecord {
  id: string;
  date: string;
  flight: string;
  source: AttendanceSource;
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const buildLegacyRosterId = (
  member: Pick<Member, 'rank' | 'firstName' | 'lastName' | 'flight'> & Partial<Pick<Member, 'squadron'>>,
  includeSquadron = false
) =>
  `roster-${slugify(
    includeSquadron && member.squadron
      ? `${member.squadron}-${member.rank}-${member.lastName}-${member.firstName}-${member.flight}`
      : `${member.rank}-${member.lastName}-${member.firstName}-${member.flight}`
  )}`;

export const getAttendanceAliases = (
  member: Pick<Member, 'id' | 'rank' | 'firstName' | 'lastName' | 'flight'> & Partial<Pick<Member, 'squadron'>>
) => {
  const aliases = new Set<string>([member.id]);
  aliases.add(buildLegacyRosterId(member));
  aliases.add(buildLegacyRosterId(member, true));
  return aliases;
};

const formatAssessmentScore = (score: number) =>
  Number.isInteger(score) ? `${score}` : score.toFixed(2).replace(/\.?0+$/, '');

export function getMemberAttendanceRecords(
  member: Pick<Member, 'id' | 'rank' | 'firstName' | 'lastName' | 'flight'> & Partial<Pick<Member, 'squadron'>>,
  ptSessions: Pick<PTSession, 'id' | 'date' | 'flight' | 'attendees' | 'attendeeSources'>[] = []
): MemberAttendanceRecord[] {
  const attendanceAliases = getAttendanceAliases(member);

  return ptSessions.flatMap((session) => {
    const matchedAttendeeId = session.attendees.find((attendeeId) => attendanceAliases.has(attendeeId));
    if (!matchedAttendeeId) {
      return [];
    }

    return [{
      id: session.id,
      date: session.date,
      flight: session.flight,
      source: session.attendeeSources?.[matchedAttendeeId] ?? 'manual',
    }];
  });
}

function createPFRAWorkout(memberId: string, assessment: FitnessAssessment): Workout {
  const components = assessment.components ?? {
    cardio: { score: 0 },
    pushups: { score: 0, reps: 0 },
    situps: { score: 0, reps: 0 },
  };
  const cardio = components.cardio ?? { score: 0 };

  return {
    id: `pfra-workout-${assessment.id}-${memberId}`,
    externalId: assessment.id,
    sessionId: `pfra-session-${assessment.id}`,
    date: assessment.date,
    type: 'Other',
    duration: 0,
    distance: 0,
    source: 'pfra',
    title: `PFRA ${formatAssessmentScore(assessment.overallScore)}`,
    isPrivate: assessment.isPrivate,
    metrics: {
      pfraScore: assessment.overallScore,
      pfraRecordType: assessment.recordType,
      cardioTest: cardio.test,
      cardioTime: cardio.time,
      cardioLaps: cardio.laps,
    },
  };
}

export function getMemberPFRAWorkouts(
  member: Pick<Member, 'id' | 'fitnessAssessments'>
): Workout[] {
  return (Array.isArray(member.fitnessAssessments) ? member.fitnessAssessments : [])
    .map((assessment) => createPFRAWorkout(member.id, assessment));
}

export function getMemberEffectiveWorkouts(
  member: Pick<Member, 'id' | 'rank' | 'firstName' | 'lastName' | 'flight' | 'workouts' | 'fitnessAssessments'> & Partial<Pick<Member, 'squadron'>>,
  ptSessions: Pick<PTSession, 'id' | 'date' | 'flight' | 'attendees' | 'attendeeSources'>[] = []
) {
  const workouts = Array.isArray(member.workouts) ? member.workouts : [];
  const pfraWorkouts = getMemberPFRAWorkouts(member);
  const datesWithRealWorkouts = new Set(
    [...workouts, ...pfraWorkouts]
      .filter((workout) => workout.source !== 'attendance')
      .map((workout) => workout.date)
  );

  const attendanceWorkouts: Workout[] = getMemberAttendanceRecords(member, ptSessions)
    .filter((record) => record.source !== 'excused' && !datesWithRealWorkouts.has(record.date))
    .map((record) => ({
      id: `attendance-${record.id}-${member.id}`,
      externalId: record.id,
      date: record.date,
      type: 'Other',
      duration: 0,
      distance: 0,
      source: 'attendance',
      title: `Attendance - ${record.flight}`,
      isPrivate: false,
    }));

  return [...workouts, ...pfraWorkouts, ...attendanceWorkouts];
}
