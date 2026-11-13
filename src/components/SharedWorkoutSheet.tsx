/**
 * SharedWorkoutSheet — shown when a friend's workout link opens the app.
 * Says who sent it and their result, previews the workout, and offers to
 * run it now or save it for later.
 */

import React from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import type { WorkoutDefinition } from '../workout/workoutTypes';
import { useUnits } from '../hooks/useUnits';
import { formatPlannedDate, formatResultMark, formatWorkoutSummary } from '../sharing/shareText';
import type { SharedWorkout } from '../sharing/shareWorkout';
import { WorkoutStructure } from './WorkoutStructure';

interface Props {
  shared: SharedWorkout | null;
  onRun: (workout: WorkoutDefinition) => void;
  onSave: (workout: WorkoutDefinition) => void;
  onClose: () => void;
}

export function SharedWorkoutSheet({ shared, onRun, onSave, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const unit = useUnits();
  if (!shared) return null;

  const { workout, plannedDate, kind } = shared;
  const sender = workout.sharedFrom?.senderName;
  const result = workout.sharedFrom?.result;
  const mark = result ? formatResultMark(result, unit) : null;

  const eyebrow = sender ? `From ${sender}` : 'Shared workout';
  const consistencyChallenge =
    kind === 'challenge' && workout.sharedFrom?.challengeType === 'consistency' && result?.consistency != null;
  const intro = consistencyChallenge
    ? `${sender ?? 'Your friend'} scored ${Math.round(result!.consistency!)}/100 for interval consistency. Can you match it?`
    : kind === 'challenge' && mark
      ? `${sender ?? 'Your friend'} ran this in ${mark}. Can you beat it?`
      : mark
        ? `${sender ?? 'Your friend'} finished this: ${mark}.`
        : plannedDate
          ? `Planned for ${formatPlannedDate(plannedDate)}, which has passed. You can still run it.`
          : `${sender ?? 'A friend'} wants you to try this workout.`;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.md }]}>
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.name}>{workout.name}</Text>
            <Text style={styles.summary}>{formatWorkoutSummary(workout)}</Text>
            <View style={[styles.intro, mark ? styles.introChallenge : null]}>
              <Ionicons
                name={mark ? 'flag' : 'people-outline'}
                size={18}
                color={mark ? Colors.warning : Colors.primary}
              />
              <Text style={styles.introText}>{intro}</Text>
            </View>
            <WorkoutStructure workout={workout} />
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => onRun(workout)}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Ionicons name="play" size={18} color={Colors.black} />
              <Text style={styles.primaryBtnText}>Run It Now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => onSave(workout)}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Ionicons name="bookmark-outline" size={16} color={Colors.textPrimary} />
              <Text style={styles.secondaryBtnText}>Save to My Workouts</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '88%',
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  eyebrow: {
    flexShrink: 1,
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.primary,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  name: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: Spacing.xs,
  },
  summary: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary + '33',
  },
  introChallenge: {
    borderColor: Colors.warning + '55',
  },
  introText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  actions: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 6,
    minHeight: 48,
  },
  primaryBtnText: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.black,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 4,
    minHeight: 44,
  },
  secondaryBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
});
