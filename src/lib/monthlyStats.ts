import type { Member, PTSession } from '@/lib/store';

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

export function getMemberMonthWorkouts(member: Pick<Member, 'workouts'>, monthKey: string) {
  return member.workouts.filter((workout) => monthKeyFromDateString(workout.date) === monthKey);
}

export function getMemberMonthSummary(
  member: Pick<Member, 'workouts'>,
  monthKey: string
) {
  const workouts = getMemberMonthWorkouts(member, monthKey);
  const minutes = workouts.reduce((total, workout) => total + workout.duration, 0);
  const miles = workouts.reduce((total, workout) => total + (workout.distance ?? 0), 0);

  return {
    workouts,
    workoutCount: workouts.length,
    minutes,
    miles: Number(miles.toFixed(2)),
    score: minutes + Math.round(miles * 10) + workouts.length * 25,
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
