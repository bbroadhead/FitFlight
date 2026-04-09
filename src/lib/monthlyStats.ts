import type { Member, MonthlyLeaderboardEntry, PTSession, Workout } from '@/lib/store';

export const ATTENDANCE_CHECK_IN_POINTS = 10;
export const WORKOUT_POINTS_PER_MINUTE = 1;
export const WORKOUT_POINTS_PER_MILE = 15;

export function getCompetitionPosition(scores: number[], index: number): number {
  if (index <= 0) {
    return 1;
  }

  return scores[index] === scores[index - 1] ? getCompetitionPosition(scores, index - 1) : index + 1;
}

export function getMonthKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
}

export function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) {
    return monthKey;
  }

  return new Date(year, month - 1, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

export function getPreviousMonthKey(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, 1);
  date.setMonth(date.getMonth() - 1);
  return getMonthKey(date);
}

export function monthKeyFromDateString(dateValue: string) {
  return dateValue.slice(0, 7);
}

export function getMemberEffectiveWorkouts(
  member: Pick<Member, 'id' | 'workouts'>,
  ptSessions: Pick<PTSession, 'id' | 'date' | 'flight' | 'attendees'>[] = []
) {
  const datesWithRealWorkouts = new Set(
    member.workouts
      .filter((workout) => workout.source !== 'attendance')
      .map((workout) => workout.date)
  );

  const attendanceWorkouts: Workout[] = ptSessions
    .filter((session) => session.attendees.includes(member.id) && !datesWithRealWorkouts.has(session.date))
    .map((session) => ({
      id: `attendance-${session.id}-${member.id}`,
      externalId: session.id,
      date: session.date,
      type: 'Other',
      duration: 0,
      distance: 0,
      source: 'attendance',
      title: `Attendance - ${session.flight} Flight`,
      isPrivate: false,
    }));

  return [...member.workouts, ...attendanceWorkouts];
}

export function getMemberMonthWorkouts(
  member: Pick<Member, 'id' | 'workouts'>,
  monthKey: string,
  ptSessions: Pick<PTSession, 'id' | 'date' | 'flight' | 'attendees'>[] = []
) {
  return getMemberEffectiveWorkouts(member, ptSessions).filter((workout) => monthKeyFromDateString(workout.date) === monthKey);
}

export function getMemberMonthSummary(
  member: Pick<Member, 'id' | 'workouts'>,
  monthKey: string,
  ptSessions: Pick<PTSession, 'id' | 'date' | 'flight' | 'attendees'>[] = []
) {
  const workouts = getMemberMonthWorkouts(member, monthKey, ptSessions);
  const minutes = workouts.reduce((total, workout) => total + workout.duration, 0);
  const miles = workouts.reduce((total, workout) => total + (workout.distance ?? 0), 0);
  const score = workouts.reduce((total, workout) => {
    if (workout.source === 'attendance') {
      return total + ATTENDANCE_CHECK_IN_POINTS;
    }

    const durationPoints = Math.max(0, Math.round(workout.duration * WORKOUT_POINTS_PER_MINUTE));
    const distancePoints = Math.max(0, Math.round((workout.distance ?? 0) * WORKOUT_POINTS_PER_MILE));
    return total + Math.max(durationPoints, distancePoints);
  }, 0);

  return {
    workouts,
    workoutCount: workouts.length,
    minutes,
    miles: Number(miles.toFixed(2)),
    score,
  };
}

export function getMonthSessions(ptSessions: PTSession[], monthKey: string) {
  return ptSessions.filter((session) => monthKeyFromDateString(session.date) === monthKey);
}

export function getAvailableMonthKeys(
  members: Pick<Member, 'workouts' | 'fitnessAssessments'>[],
  ptSessions: Pick<PTSession, 'date'>[]
) {
  const keys = new Set<string>();

  members.forEach((member) => {
    member.workouts.forEach((workout) => keys.add(monthKeyFromDateString(workout.date)));
    member.fitnessAssessments.forEach((assessment) => keys.add(monthKeyFromDateString(assessment.date)));
  });

  ptSessions.forEach((session) => keys.add(monthKeyFromDateString(session.date)));
  keys.add(getMonthKey());

  return Array.from(keys).sort((left, right) => right.localeCompare(left));
}

export function buildLeaderboardHistory(
  members: Pick<Member, 'id' | 'rank' | 'firstName' | 'lastName' | 'workouts' | 'fitnessAssessments'>[],
  ptSessions: Pick<PTSession, 'id' | 'date' | 'flight' | 'attendees'>[]
) {
  const currentMonthKey = getMonthKey();
  const monthKeys = getAvailableMonthKeys(members, ptSessions).filter((monthKey) => monthKey !== currentMonthKey);
  const historyByMember = new Map<string, MonthlyLeaderboardEntry[]>();

  members.forEach((member) => {
    historyByMember.set(member.id, []);
  });

  monthKeys.forEach((monthKey) => {
    const monthSummaries = members.map((member) => ({
      member,
      summary: getMemberMonthSummary(member, monthKey, ptSessions),
    }));

    if (!monthSummaries.some(({ summary }) => summary.score > 0 || summary.workoutCount > 0)) {
      return;
    }

    const ordered = [...monthSummaries].sort((left, right) => {
      if (right.summary.score !== left.summary.score) {
        return right.summary.score - left.summary.score;
      }

      return `${left.member.lastName} ${left.member.firstName}`.localeCompare(`${right.member.lastName} ${right.member.firstName}`);
    });

    const scores = ordered.map((entry) => entry.summary.score);
    ordered.forEach((entry, index) => {
      const memberHistory = historyByMember.get(entry.member.id) ?? [];
      memberHistory.push({
        month: monthKey,
        position: getCompetitionPosition(scores, index),
        score: entry.summary.score,
      });
      historyByMember.set(entry.member.id, memberHistory);
    });
  });

  return historyByMember;
}
