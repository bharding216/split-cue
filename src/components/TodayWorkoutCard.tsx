/**
 * TodayWorkoutCard — prominent card shown on Training Home when
 * the user has a planned workout for today.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { PlanWorkout } from '../types/database';
import type { WorkoutDefinition } from '../workout/workoutTypes';
import { totalWorkoutSeconds, formatTime } from '../workout/workoutTypes';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

interface TodayWorkoutCardProps {
  planWorkout: PlanWorkout;
  onView: () => void;
}

function estimateDuration(pw: PlanWorkout): string | null {
  const wd = pw.workout_data as WorkoutDefinition | null;
  if (!wd) return null;
  const secs = totalWorkoutSeconds(wd);
  if (secs <= 0) return null;
  const mins = Math.round(secs / 60);
  return `${mins} min`;
}

function getIntensityTag(label: string | null): { text: string; color: string } | null {
  if (!label) return null;
  const lower = label.toLowerCase();
  if (lower.includes('easy') || lower.includes('recovery')) return { text: 'Easy', color: Colors.easy };
  if (lower.includes('tempo') || lower.includes('threshold')) return { text: 'Moderate', color: Colors.warning };
  if (lower.includes('interval') || lower.includes('speed') || lower.includes('hard')) return { text: 'Hard', color: Colors.hard };
  if (lower.includes('long')) return { text: 'Long', color: Colors.accent };
  if (lower.includes('rest')) return { text: 'Rest', color: Colors.textMuted };
  return null;
}

export function TodayWorkoutCard({ planWorkout, onView }: TodayWorkoutCardProps) {
  const isRest = planWorkout.day_label?.toLowerCase().includes('rest');
  const isCompleted = planWorkout.status === 'completed';
  const workoutData = planWorkout.workout_data as WorkoutDefinition | null;
  const duration = estimateDuration(planWorkout);
  const intensity = getIntensityTag(planWorkout.day_label);

  if (isRest) {
    return (
      <View style={styles.card}>
        <View style={styles.labelRow}>
          <Text style={styles.labelBadge}>TODAY'S WORKOUT</Text>
          <Text style={[styles.statusBadge, { color: Colors.easy }]}>Rest Day</Text>
        </View>
        <Text style={styles.title}>Recovery Day</Text>
        <Text style={styles.description}>
          {planWorkout.description || 'Take it easy today. Your body needs recovery to get stronger.'}
        </Text>
      </View>
    );
  }

  if (isCompleted) {
    return (
      <View style={styles.card}>
        <View style={styles.labelRow}>
          <Text style={styles.labelBadge}>TODAY'S WORKOUT</Text>
          <Text style={[styles.statusBadge, { color: Colors.primary }]}>Completed</Text>
        </View>
        <Text style={styles.title}>{planWorkout.day_label || 'Workout'}</Text>
        <Text style={styles.description}>Great work! You crushed today's session.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.labelRow}>
        <Text style={styles.labelBadge}>TODAY'S WORKOUT</Text>
        <Text style={[styles.statusBadge, { color: Colors.primary }]}>Ready</Text>
      </View>

      <Text style={styles.title}>{planWorkout.day_label || 'Training'}</Text>

      <View style={styles.metaRow}>
        {duration && (
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.metaText}>{duration}</Text>
          </View>
        )}
        {intensity && (
          <View style={styles.metaItem}>
            <Ionicons name="flame-outline" size={14} color={intensity.color} />
            <Text style={[styles.metaText, { color: intensity.color }]}>{intensity.text}</Text>
          </View>
        )}
      </View>

      {planWorkout.description && (
        <Text style={styles.description} numberOfLines={2}>{planWorkout.description}</Text>
      )}

      {!workoutData && (
        <View style={styles.pendingRow}>
          <Ionicons name="sparkles-outline" size={14} color={Colors.accent} />
          <Text style={styles.pendingText}>
            Your AI coach is preparing today's workout details…
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.viewBtn}
        onPress={onView}
        activeOpacity={0.8}
      >
        <Text style={styles.viewBtnText}>View Workout</Text>
        <Ionicons name="chevron-forward" size={18} color={Colors.black} />
      </TouchableOpacity>
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
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  labelBadge: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  statusBadge: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
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
  description: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 4,
    gap: Spacing.xs,
  },
  viewBtnText: {
    color: Colors.black,
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  pendingText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
});
