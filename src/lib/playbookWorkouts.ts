import type { SharedWorkout } from '@/lib/store';

const PLAYBOOK_CREATED_BY = 'playbook_warfighters_fitness_playbook';
const PLAYBOOK_SOURCE_LABEL = "Warfighter's Fitness Playbook";

const createPlaybookWorkout = (
  id: string,
  name: string,
  type: SharedWorkout['type'],
  duration: number,
  intensity: number,
  description: string,
  detailSections: NonNullable<SharedWorkout['detailSections']>,
  searchTerms: string[] = []
): SharedWorkout => ({
  id,
  name,
  type,
  duration,
  intensity,
  description,
  isMultiStep: false,
  steps: [],
  createdBy: PLAYBOOK_CREATED_BY,
  createdAt: '2026-02-01T00:00:00.000Z',
  squadron: 'Hawks',
  thumbsUp: [],
  thumbsDown: [],
  favoritedBy: [],
  source: 'playbook',
  sourceLabel: PLAYBOOK_SOURCE_LABEL,
  detailSections,
  searchTerms,
});

export const PLAYBOOK_WORKOUT_CREATOR_ID = PLAYBOOK_CREATED_BY;
export const PLAYBOOK_WORKOUT_SOURCE_LABEL = PLAYBOOK_SOURCE_LABEL;

export const PLAYBOOK_WORKOUTS: SharedWorkout[] = [
  createPlaybookWorkout(
    'playbook-adaptive-bodyweight',
    'Adaptive Exercise Program: Bodyweight Day',
    'Strength',
    45,
    5,
    'Adaptive bodyweight strength circuit with progressive conditioning, warm-up, and mobility work.',
    [
      {
        title: 'Dynamic Warm-Up / Movement Prep (10 min)',
        items: [
          '10 total reps or 10 yards each: calf raise / dorsi-flex, arm rotations, 4-way neck series, walk-outs, World’s Greatest Stretch, glute bridge, bird dog, air squats, reverse lunge & twist, single-leg RDL, alternating lateral lunge, jumping jacks, butt kicks, vertical / side hops.',
        ],
      },
      {
        title: 'Bodyweight Strength Circuit',
        items: [
          'Level 1: air squats, glute bridge, push-ups, inverted row, hollow body rock, side planks. Most movements 8-12 reps or :15-:20 holds.',
          'Level 2: increase major lifts to 10-15 reps and holds to :25-:30, plus HR push-ups.',
          'Level 3: push major lifts to 15-20 reps, add split squats, cross-leg reverse crunch, and reverse lunges.',
          'Level 1-2: complete 2-3 rounds at self-paced quality movement. Level 3: complete 3-4 rounds.',
        ],
      },
      {
        title: 'Aerobic Conditioning Progression',
        items: [
          'Weeks 1-2: 7 x 2 min jog / 1 min walk at easy conversation pace.',
          'Weeks 3-4: 5 x 4 min jog / 2 min walk at easy conversation pace.',
          'Weeks 5-6: 5 x 6 min jog / 2 min walk at medium, slightly stressed conversation pace.',
          'Weeks 7-9: 4 x 1:00 medium / 1:00 off, 4 x 1:00 easy / 1:00 off, 4 x 1:00 hard / 1:00 off.',
          'Weeks 10-11: 4 x 1:15 medium / 1:00 off, 4 x 1:15 easy / 1:00 off, 4 x 1:15 hard / 1:00 off.',
          'Week 12: 2 x 1:15 medium, 2 x 1:15 easy, 2 x 1:15 hard with 1:00 off between efforts.',
        ],
      },
      {
        title: 'Cool Down / Recovery',
        items: [
          'Initial cool down: 3-5 minute walk.',
          'Mobility holds for 20-30 sec: hamstring stretch, 90/90 stretch, figure 4 stretch, hip flexor stretch, chest stretch, frog stretch.',
          'Low-impact modification: use low-impact cardio equipment for the same times and intensities.',
        ],
      },
    ],
    ['appendix a', 'adaptive', 'bodyweight', 'movement prep']
  ),
  createPlaybookWorkout(
    'playbook-adaptive-metabolic',
    'Adaptive Exercise Program: Metabolic Interval Day',
    'HIIT',
    40,
    7,
    'Adaptive interval circuit focused on high-quality movement under pace, followed by progressive run conditioning.',
    [
      {
        title: 'Dynamic Warm-Up / Movement Prep (10 min)',
        items: [
          '10 total reps or 10 yards each: calf raise / dorsi-flex, arm rotations, 4-way neck series, walk-outs, World’s Greatest Stretch, glute bridge, bird dog, air squats, reverse lunge & twist, 1-leg RDL, alternating lateral lunge, jumping jacks, butt kicks, vertical / side hops.',
        ],
      },
      {
        title: 'Metabolic Interval Circuit',
        items: [
          'Level 1: 20 sec on / 40 sec off for air squats and similar base movements, 3-4 rounds.',
          'Level 2: 25 sec on / 35 sec off with frog jumps, push-ups, forearm plank, reverse lunges, 4-5 rounds.',
          'Level 3: 30 sec on / 30 sec off with run in place, side hops, HR push-ups, cross-leg reverse crunch, side plank, 4-5 rounds.',
          'Rest 2 minutes between complete rounds. Move at a high pace with good form.',
        ],
      },
      {
        title: 'Aerobic Conditioning Progression',
        items: [
          'Weeks 1-2: 12 x 30 sec run/jog at medium-hard pace / 1:00 walk.',
          'Weeks 3-4: 12 x 45 sec run/jog at medium-hard pace / 1:00 walk.',
          'Weeks 5-6: 4 x 1:00 medium, 4 x 1:00 easy, 4 x 1:00 hard with 1:00 off.',
          'Week 7: 20:00 steady-state run at medium, slightly stressed conversation pace.',
          'Week 8: 24:00 steady-state run.',
          'Week 9: 28:00 steady-state run.',
          'Weeks 10-11: 32:00 steady-state run.',
          'Week 12: 25:00 easy steady-state run.',
        ],
      },
      {
        title: 'Cool Down / Recovery',
        items: [
          'Initial cool down: 3-5 minute walk.',
          'Mobility holds for 20-30 sec: hamstring stretch, 90/90 stretch, figure 4 stretch, hip flexor stretch, chest stretch, frog stretch.',
          'Low-impact modification: use low-impact cardio equipment for the same times and intensities.',
        ],
      },
    ],
    ['appendix a', 'adaptive', 'interval', 'metabolic']
  ),
  createPlaybookWorkout(
    'playbook-adaptive-hybrid',
    'Adaptive Exercise Program: Hybrid Day',
    'Strength',
    50,
    7,
    'Hybrid strength-and-conditioning session that combines loaded strength work with run progressions.',
    [
      {
        title: 'Dynamic Warm-Up / Movement Prep (10 min)',
        items: [
          '10 total reps or 10 yards each: calf raise / dorsi-flex, arm rotations, 4-way neck series, walk-outs, World’s Greatest Stretch, glute bridge, bird dog, air squats, reverse lunge & twist, 1-leg Romanian deadlift, alternating lateral lunge, jumping jacks, butt kicks, vertical / side hops.',
        ],
      },
      {
        title: 'Hybrid Strength Circuit',
        items: [
          'Level 1: push-up pyramid (1-10-1), goblet squat 3x10, RKC forearm plank 3x20 sec, seated DB shoulder press 3x10, DB alternating lunge, cross-leg reverse crunch 3x20, TRX row 3x10, sit-ups 3x20.',
          'Level 2: push-up pyramid (1-12-1), goblet squat 3x12, cross-leg reverse crunch 3x30, DB chest press 3x12, DB walking lunge 3x12 each, forearm plank max hold, pull-ups 3x3-6, sit-ups 3x30.',
          'Level 3: push-up pyramid (1-14-1), goblet squat 3x12, one-arm forearm plank, DB chest press with 3 sec negative 3x12, goblet alternating drop lunge 3x12 each, hollow body rock, pull-ups 3x5-8, sit-ups 3x40.',
          'Levels 1-2: 2-3 rounds. Level 3: 3-4 rounds.',
        ],
      },
      {
        title: 'Aerobic Conditioning Progression',
        items: [
          'Weeks 1-2: 7 x 2 min jog / 1 min walk.',
          'Weeks 3-4: 5 x 4 min jog / 2 min walk.',
          'Weeks 5-6: 5 x 6 min jog / 2 min walk.',
          'Weeks 7-9: 4 x 1:00 medium, 4 x 1:00 easy, 4 x 1:00 hard with 1:00 off.',
          'Weeks 10-11: 4 x 1:15 medium, 4 x 1:15 easy, 4 x 1:15 hard with 1:00 off.',
          'Week 12: mock 2-mile run test or 20m HAMR test.',
        ],
      },
      {
        title: 'Cool Down / Recovery',
        items: [
          'Initial cool down: 3-5 minute walk.',
          'Mobility holds for 20-30 sec: hamstring stretch, 90/90 stretch, figure 4 stretch, hip flexor stretch, chest stretch, frog stretch.',
        ],
      },
    ],
    ['appendix a', 'adaptive', 'hybrid', 'goblet squat']
  ),
  createPlaybookWorkout(
    'playbook-2-mile-program',
    '2-Mile Program (8 Weeks)',
    'Running',
    30,
    5,
    'Progressive eight-week return-to-running plan that rebuilds toward a mock PFRA 2-mile effort.',
    [
      {
        title: 'Level I: Returning After 8+ Weeks Off',
        items: [
          'Week 1: Walk 20, 22, then 24 minutes across Days 1-3.',
          'Week 2: Walk 26, 28, then 30 minutes across Days 1-3.',
          'Once 30 minutes of nonstop walking is comfortable, progress to Level II.',
        ],
      },
      {
        title: 'Level II: Returning After 4+ Weeks Off',
        items: [
          'Week 1: Walk 5 min / run 1 min x5 on all three days.',
          'Week 2: Walk 4 min / run 2 min x5 on all three days.',
          'Week 3: Walk 3 min / run 3 min x5 on all three days.',
          'Week 4: Walk 2 min / run 4 min x5 on all three days.',
          'Week 5: Walk 1 min / run 5 min x5 on all three days.',
          'Week 6: Walk 1 min / run 8 min x3 on all three days.',
          'Week 7: Walk 1 min / run 10 min x2 on all three days.',
          'Week 8: Day 1 walk 1 / run 15 at PFRA pace, Day 2 walk 1 / run 17 light-moderate, Day 3 walk 1 / run mock PFRA 2-mile.',
        ],
      },
      {
        title: 'Program Note',
        items: [
          'After Week 8, transition back into regular strength and conditioning programming as able.',
        ],
      },
    ],
    ['appendix a', '2-mile', 'run program', 'conditioning']
  ),
  createPlaybookWorkout(
    'playbook-couch-to-5k',
    'Couch to 5K Program',
    'Running',
    35,
    5,
    'Ten-week progressive running plan using walk-jog intervals, track repeats, and distance progression.',
    [
      {
        title: 'Weeks 1-2',
        items: [
          'Week 1 uses walk/jog intervals from 100m alternations up through 400m run / 400m walk combinations.',
          'Week 2 builds through 200m and 300m run/walk work, then 800m jog / 400m walk sessions.',
        ],
      },
      {
        title: 'Weeks 3-4',
        items: [
          'Week 3 progresses to 600m, 800m, and 1200m efforts with 2:30 min/lap pacing focus.',
          'Week 4 introduces 800m jog repeats and finishes with a 2-mile jog without walking.',
        ],
      },
      {
        title: 'Weeks 5-10',
        items: [
          'Week 5: 1200m jog / 800m walk plus a full 2-mile jog without walking.',
          'Week 6: 1600m jog / 400m walk plus 2.25-mile jog.',
          'Week 7: 2.5-mile jogs, varying pace as needed.',
          'Week 8: 2.75-mile jogs, varying pace as needed.',
          'Week 9: 3-mile jogs, varying pace as needed.',
          'Week 10: 3.25-mile jogs, varying pace as needed.',
        ],
      },
      {
        title: 'Standard Session Format',
        items: [
          'Each day begins with a 1-lap walk warm-up and ends with a 1-lap walk cool-down.',
        ],
      },
    ],
    ['appendix a', 'couch to 5k', 'run', 'walk jog']
  ),
  createPlaybookWorkout(
    'playbook-workout-1',
    'Workout 1: 2-Mile Endurance Session',
    'Running',
    35,
    8,
    'Track workout built to improve sustained intensity for the 2-mile run with pacing-group guidance.',
    [
      {
        title: 'Warm-Up',
        items: [
          'Walking knee hugs x 10 yds, straight leg kicks x 10 yds, heel-to-toe walks x 10 yds, lateral shuffle x 20 yds.',
          'High knees x 10 yds + jog back, butt kicks x 10 yds + jog back, forward pogo hops x 10 yds + jog back, progressive striders 2 x 40 yds.',
        ],
      },
      {
        title: 'Endurance Set',
        items: [
          '1 x 800m at roughly 10 seconds faster than 2-mile goal pace, 7/10 RPE, 1:2 rest.',
          '2 x 400m at roughly 5-10 seconds faster than 2-mile goal pace, 1:2 rest.',
          '4 x 200m at 5+ seconds faster than 2-mile goal pace, 1:3 rest.',
        ],
      },
      {
        title: 'Coaching Notes',
        items: [
          'Split into pacing groups when possible: e.g. under 16:00, 16:00-18:00, and over 18:00 2-mile goals.',
          'Use goal 2-mile pace to build target lap times. Example: 16:00 2-mile goal means 2:00 per lap and 4:00 per 800m, so this session pushes slightly faster than that.',
          '1:2 rest means the rest period is double the time it took to complete the rep.',
        ],
      },
      {
        title: 'Cooldown / Recovery',
        items: [
          'Walk 1 lap, then quad stretch, standing hamstring stretch, standing calf stretch, and kneeling hip flexor stretch.',
        ],
      },
    ],
    ['appendix a', 'workout 1', 'endurance', '2-mile']
  ),
  createPlaybookWorkout(
    'playbook-workout-2',
    'Workout 2: Full-Body Power Session',
    'Strength',
    45,
    8,
    'Explosive full-body lifting session targeting major muscle groups and power development.',
    [
      {
        title: 'Warm-Up',
        items: [
          'World’s Greatest x 2 x 8 each, inchworms 2 x 8, 90/90 hip switch 2 x 12 total.',
          'Knee hug to lunge, straight leg kicks, quad pulls, high knees, butt kicks, pogo hops, and striders / run work across short yardages.',
        ],
      },
      {
        title: 'Strength / Resistance Training',
        items: [
          'Block A: DB thrusters 3x10, overhead weighted hamstring walk-outs x5 total, rotational MB throws x10 each, suitcase carry x10 yd each.',
          'Block B: KB swings 3x15, DB chest press x10, renegade row x12 total, sled push or plate push x20 yd.',
        ],
      },
      {
        title: 'Coaching Notes',
        items: [
          'Split into two groups. One starts on Block A while the other starts on Block B, then switch.',
          'Within each block, complete one set of each exercise before starting the next set.',
          'If a wall or medicine ball is unavailable for rotational throws, substitute 20 Russian twists.',
        ],
      },
      {
        title: 'Cooldown / Recovery',
        items: [
          'Standing hamstring stretch, standing quad stretch, chest opener stretch, supine piriformis stretch, and child’s pose for about 20 sec each.',
        ],
      },
    ],
    ['appendix a', 'workout 2', 'power', 'full body']
  ),
  createPlaybookWorkout(
    'playbook-workout-3',
    'Workout 3: Full-Body Strength Session',
    'Strength',
    50,
    8,
    'Strength-focused full-body session aimed at building muscle mass and improving overall strength.',
    [
      {
        title: 'Warm-Up',
        items: [
          'Scorpions 2 x 10 total, 90/90 hip switch 2 x 10 total, T-spine book opener 2 x 6 each, inchworms 2 x 8.',
          'Full-range arm circles 2 x 10 forward / 10 reverse, plus leg swings 2 x 10 each.',
        ],
      },
      {
        title: 'Strength / Resistance Training',
        items: [
          'Block A: BB squat (front, back, or box) 3 sets of 10, 8, 8; pull-ups at 60% of max reps; deadbugs 3 x 10 total.',
          'Block B: BB RDL 3 sets of 10, 8, 8; DB half-kneeling shoulder press 3 x 8 each; farmer’s carry 3 x 20 yd.',
          'Block C: DB incline bench press 3 sets of 10, 8, 8; stationary weighted lunges 3 x 8 each; bear stance plank taps 3 x 20 total.',
        ],
      },
      {
        title: 'Intensity Guidance',
        items: [
          'Choose a weight where you could not easily complete 2-3 reps beyond the listed target. Difficulty should feel around 7/10.',
          'Increase weight as reps decrease when appropriate.',
          'Use assisted pull-ups or bands if a bodyweight pull-up is not yet available.',
        ],
      },
      {
        title: 'Cooldown / Recovery',
        items: [
          'Standing hamstring stretch, standing quad stretch, chest opener stretch, supine piriformis stretch, and child’s pose for about 20 sec each.',
        ],
      },
    ],
    ['appendix a', 'workout 3', 'strength', 'barbell']
  ),
  createPlaybookWorkout(
    'playbook-hamr',
    'HAMR Improvement Program (6 Weeks)',
    'Cardio',
    35,
    8,
    'Six-week progression focused on shuttle speed, repeat running ability, and repeated HAMR practice.',
    [
      {
        title: 'Weeks 1-3',
        items: [
          'Day 1 builds from 4x200m + 2x400m + 3x30m sprints up to 5x200m + 3x400m + 3x30m sprints.',
          'Day 2 progresses from 20 minutes sustained run with strides and 2x200m sprints to 25 minutes sustained run with 6x100m strides and 3x200m sprints.',
          'Day 3 repeats a HAMR test each week, followed by 4-5 x 20m sprints with short rest.',
        ],
      },
      {
        title: 'Weeks 4-6',
        items: [
          'Day 1 progresses to 5-6 x 200m, 3-4 x 400m, and 3 x 30m sprints.',
          'Day 2 progresses to 25-30 minute sustained runs, 6-8 x 100m strides, and 3-4 x 200m sprints.',
          'Day 3 continues weekly HAMR tests with 5-6 x 20m sprints afterward.',
        ],
      },
      {
        title: 'Program Intent',
        items: [
          'Use Day 1 for interval development, Day 2 for aerobic support and turnover, and Day 3 for direct HAMR familiarity and speed endurance.',
        ],
      },
    ],
    ['appendix c', 'hamr', 'shuttles', 'improvement program']
  ),
];
