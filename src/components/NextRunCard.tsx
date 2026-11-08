/**
 * NextRunCard — home screen card that makes the next run one tap away:
 * the last run with a big Repeat button, plus the next calendar workout
 * in the coming week if there is one.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { PlanWorkout } from '../types/database';
import {
  type CompletedWorkout,
  type WorkoutDefinition,
  formatTime,
  totalWorkoutSeconds,
  workRepCount,
} from '../workout/workoutTypes';
import { formatRelativeDate } from './RecentRunsSheet';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { useLargeText } from '../hooks/useLargeText';

interface NextRunCardProps {
  lastRun: CompletedWorkout;
  upcoming: PlanWorkout | null;
  onRepeat: () => void;
  onOpenUpcoming: () => void;
}

function dayName(dateKey: string): string {
  const d = new Date(dateKey + 'T12:00:00');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'long' });
}

export function NextRunCard({ lastRun, upcoming, onRepeat, onOpenUpcoming }: NextRunCardProps) {
  const large = useLargeText();
  const config = lastRun.configuration!;
  const secs = totalWorkoutSeconds(config);
  const reps = workRepCount(config);
  const upcomingData = upcoming?.workout_data as WorkoutDefinition | null | undefined;
  const upcomingSecs = upcomingData ? totalWorkoutSeconds(upcomingData) : 0;

  return (
    <View style={styles.card}>
      <Text style={styles.labelBadge}>READY FOR YOUR NEXT RUN?</Text>

      <Text style={styles.caption}>Last run · {formatRelativeDate(lastRun.completedAt)}</Text>
      <Text style={styles.title} numberOfLines={large ? 3 : 2}>
        {config.name || lastRun.workoutName}
      </Text>
      <View style={styles.metaRow}>
        {secs > 0 && (
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.metaText}>{formatTime(secs)}</Text>
          </View>
        )}
        {reps > 1 && (
          <View style={styles.metaItem}>
            <Ionicons name="repeat-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.metaText}>{reps} reps</Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={styles.repeatBtn}
        onPress={onRepeat}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Repeat ${config.name || lastRun.workoutName}`}
      >
        <Ionicons name="play" size={18} color={Colors.black} />
        <Text style={styles.repeatBtnText}>Repeat this run</Text>
      </TouchableOpacity>

      {upcoming && (
        <TouchableOpacity
          style={styles.upcomingRow}
          onPress={onOpenUpcoming}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
          <View style={styles.upcomingText}>
            <Text style={styles.upcomingLabel}>On your calendar · {dayName(upcoming.date)}</Text>
            <Text style={styles.upcomingName} numberOfLines={large ? 3 : 1}>
              {upcoming.day_label || upcomingData?.name || 'Workout'}
              {upcomingSecs > 0 ? ` · ${Math.round(upcomingSecs / 60)} min` : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  labelBadge: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  caption: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.md,
    rowGap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  repeatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 4,
    gap: Spacing.xs,
  },
  repeatBtnText: {
    color: Colors.black,
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight,
  },
  upcomingText: {
    flex: 1,
  },
  upcomingLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  upcomingName: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: '700',
    marginTop: 2,
  },
});
