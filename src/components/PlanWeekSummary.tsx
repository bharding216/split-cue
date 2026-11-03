/**
 * PlanWeekSummary — shows the current week's theme and progress.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { PlanWorkout, TrainingPlan } from '../types/database';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { useUnits } from '../hooks/useUnits';
import { formatPace } from '../units/format';

interface PlanWeekSummaryProps {
  plan: TrainingPlan;
  weekWorkouts: PlanWorkout[];
  weekNumber: number;
}

export function PlanWeekSummary({ plan, weekWorkouts, weekNumber }: PlanWeekSummaryProps) {
  const unit = useUnits();
  const trainingDays = weekWorkouts.filter((w) => w.day_label !== 'Rest Day');
  const completedCount = trainingDays.filter((w) => w.status === 'completed').length;
  const totalCount = trainingDays.length;
  const progress = totalCount > 0 ? completedCount / totalCount : 0;

  // Calculate total weeks for phase estimation
  const start = new Date(plan.start_date);
  const end = new Date(plan.race_date);
  const totalWeeks = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)));

  const weekPct = weekNumber / totalWeeks;
  let phase: string;
  let phaseIcon: React.ComponentProps<typeof Ionicons>['name'];
  if (weekPct <= 0.3) {
    phase = 'Base Building';
    phaseIcon = 'walk-outline';
  } else if (weekPct <= 0.6) {
    phase = 'Build Phase';
    phaseIcon = 'trending-up-outline';
  } else if (weekPct <= 0.85) {
    phase = 'Peak Phase';
    phaseIcon = 'flash-outline';
  } else {
    phase = 'Taper';
    phaseIcon = 'leaf-outline';
  }

  const isPaceTarget = (plan.goal_type ?? 'race') === 'pace_target';
  const raceLabel = isPaceTarget
    ? 'Pace Goal'
    : plan.race_type === 'custom'
      ? 'Race'
      : plan.race_type.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const paceStr = isPaceTarget && plan.goal_pace ? formatPace(plan.goal_pace, unit) : null;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.weekInfo}>
          <Text style={styles.weekLabel}>Week {weekNumber} of {totalWeeks}</Text>
          <View style={styles.phaseRow}>
            <Ionicons name={phaseIcon} size={14} color={Colors.accent} />
            <Text style={styles.phaseText}>{phase}</Text>
          </View>
        </View>
        <View style={styles.raceInfo}>
          <Text style={styles.raceLabel}>{paceStr ?? raceLabel}</Text>
          <Text style={styles.raceDate}>
            {isPaceTarget ? 'Target: ' : ''}
            {new Date(plan.race_date + 'T12:00:00').toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressRow}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {completedCount}/{totalCount}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  weekInfo: {
    gap: 4,
  },
  weekLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  phaseText: {
    fontSize: FontSize.sm,
    color: Colors.accent,
    fontWeight: '600',
  },
  raceInfo: {
    alignItems: 'flex-end',
  },
  raceLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  raceDate: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  progressText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    minWidth: 30,
    textAlign: 'right',
  },
});
