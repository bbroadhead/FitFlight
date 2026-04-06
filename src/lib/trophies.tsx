import type { ElementType } from 'react';
import {
  Anchor,
  Award,
  Crown,
  Dumbbell,
  Flame,
  Footprints,
  Gem,
  Layers,
  MapPin,
  Mountain,
  Rocket,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Sunrise,
  Target,
  Trophy,
  Zap,
} from 'lucide-react-native';
import type { Achievement, Member } from '@/lib/store';
import { getEffectiveAchievementIds } from '@/lib/store';

type TrophyVisual = {
  Icon: ElementType;
  iconColor: string;
  iconBg: string;
  borderColor: string;
  textColor: string;
};

export type TrophyWithStats = Achievement & TrophyVisual & {
  earnCount: number;
  earnRate: number;
  isEarned: boolean;
};

const TROPHY_VISUALS: Record<string, TrophyVisual> = {
  top_3_month: { Icon: Trophy, iconColor: '#FFD700', iconBg: '#4A3A00', borderColor: '#FFD700', textColor: '#FFD700' },
  first_workout: { Icon: Footprints, iconColor: '#60A5FA', iconBg: '#10233A', borderColor: '#60A5FA', textColor: '#BFDBFE' },
  '10_workouts': { Icon: Dumbbell, iconColor: '#A78BFA', iconBg: '#26153A', borderColor: '#A78BFA', textColor: '#DDD6FE' },
  '25_workouts': { Icon: Target, iconColor: '#38BDF8', iconBg: '#082F49', borderColor: '#38BDF8', textColor: '#BAE6FD' },
  '50_workouts': { Icon: Star, iconColor: '#F59E0B', iconBg: '#3A2508', borderColor: '#F59E0B', textColor: '#FDE68A' },
  '100_workouts': { Icon: Gem, iconColor: '#F472B6', iconBg: '#3D1230', borderColor: '#F472B6', textColor: '#FBCFE8' },
  '200_workouts': { Icon: Rocket, iconColor: '#FB7185', iconBg: '#3A101D', borderColor: '#FB7185', textColor: '#FFE4E6' },
  '100_miles': { Icon: MapPin, iconColor: '#4ADE80', iconBg: '#0F2E1D', borderColor: '#4ADE80', textColor: '#DCFCE7' },
  '500_miles': { Icon: Mountain, iconColor: '#22C55E', iconBg: '#132A17', borderColor: '#22C55E', textColor: '#BBF7D0' },
  '1000_miles': { Icon: Crown, iconColor: '#EAB308', iconBg: '#3A2E08', borderColor: '#EAB308', textColor: '#FEF08A' },
  variety: { Icon: Layers, iconColor: '#2DD4BF', iconBg: '#072F2A', borderColor: '#2DD4BF', textColor: '#CCFBF1' },
  week_streak: { Icon: Flame, iconColor: '#F97316', iconBg: '#3A1A08', borderColor: '#F97316', textColor: '#FED7AA' },
  month_streak: { Icon: Zap, iconColor: '#FACC15', iconBg: '#3A3108', borderColor: '#FACC15', textColor: '#FEF9C3' },
  three_month_streak: { Icon: Shield, iconColor: '#4ADE80', iconBg: '#12301D', borderColor: '#4ADE80', textColor: '#DCFCE7' },
  early_bird: { Icon: Sunrise, iconColor: '#FB923C', iconBg: '#3B210C', borderColor: '#FB923C', textColor: '#FFEDD5' },
  iron_will: { Icon: Shield, iconColor: '#93C5FD', iconBg: '#0C223A', borderColor: '#93C5FD', textColor: '#DBEAFE' },
  excellent_fa: { Icon: ShieldCheck, iconColor: '#22C55E', iconBg: '#0E2C18', borderColor: '#22C55E', textColor: '#DCFCE7' },
  perfect_fa: { Icon: Sparkles, iconColor: '#FDE047', iconBg: '#3D3408', borderColor: '#FDE047', textColor: '#FEF9C3' },
  shared_workout_creator: { Icon: Dumbbell, iconColor: '#60A5FA', iconBg: '#10233A', borderColor: '#60A5FA', textColor: '#DBEAFE' },
  completionist: { Icon: Crown, iconColor: '#FFD700', iconBg: '#4A3A00', borderColor: '#FFD700', textColor: '#FFF3B0' },
};

const DEFAULT_VISUAL: TrophyVisual = {
  Icon: Award,
  iconColor: '#FFD700',
  iconBg: '#3A2D08',
  borderColor: '#FFD700',
  textColor: '#FFE082',
};

export function getTrophyVisual(achievementId: string): TrophyVisual {
  return TROPHY_VISUALS[achievementId] ?? DEFAULT_VISUAL;
}

export function buildTrophyStats(
  achievements: Achievement[],
  members: Member[],
  member: Pick<Member, 'achievements' | 'trophyCount' | 'monthlyPlacements'>
): TrophyWithStats[] {
  const totalMembers = Math.max(members.length, 1);

  return achievements.map((achievement) => {
    const earnCount = members.filter((member) => {
      if (achievement.id === 'top_3_month') {
        return member.trophyCount > 0 || member.monthlyPlacements.length > 0;
      }

      return getEffectiveAchievementIds(member).includes(achievement.id);
    }).length;
    const earnRate = (earnCount / totalMembers) * 100;
    const isEarned = getEffectiveAchievementIds(member).includes(achievement.id);

    return {
      ...achievement,
      ...getTrophyVisual(achievement.id),
      earnCount,
      earnRate,
      isEarned,
    };
  });
}

export function getRarestEarnedTrophies(
  achievements: Achievement[],
  members: Member[],
  member: Pick<Member, 'achievements' | 'trophyCount' | 'monthlyPlacements'>,
  limit = 3
) {
  return buildTrophyStats(achievements, members, member)
    .filter((achievement) => achievement.isEarned)
    .sort((left, right) => {
      if (left.earnRate !== right.earnRate) {
        return left.earnRate - right.earnRate;
      }
      if (left.isHard !== right.isHard) {
        return left.isHard ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    })
    .slice(0, limit);
}
