export const SCHEDULED_WORKOUT_TOKEN_PREFIX = '[FitFlightWorkout:';

export function buildScheduledWorkoutToken(workoutId: string, workoutName: string) {
  return `${SCHEDULED_WORKOUT_TOKEN_PREFIX}${encodeURIComponent(workoutId)}|${encodeURIComponent(workoutName)}]`;
}

export function parseScheduledWorkoutLink(description: string) {
  const match = description.match(/\[FitFlightWorkout:([^|\]]+)\|([^\]]+)\]$/);
  if (!match) {
    return null;
  }

  try {
    return {
      workoutId: decodeURIComponent(match[1]),
      workoutName: decodeURIComponent(match[2]),
    };
  } catch {
    return null;
  }
}

export function stripScheduledWorkoutToken(description: string) {
  return description.replace(/\n?\n?\[FitFlightWorkout:[^|\]]+\|[^\]]+\]$/, '').trim();
}
