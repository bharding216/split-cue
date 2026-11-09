/**
 * FirstRunCard — home screen card for someone who hasn't finished a run yet.
 * One button starts a short, easy run so there's nothing to set up first.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { type WorkoutDefinition, totalWorkoutSeconds } from '../workout/workoutTypes';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../constants/theme';

interface FirstRunCardProps {
  workout: WorkoutDefinition;
  onStart: () => void;
}

export function FirstRunCard({ workout, onStart }: FirstRunCardProps) {
  const minutes = Math.round(totalWorkoutSeconds(workout) / 60);

  return (
    <View style={styles.card}>
      <Text style={styles.labelBadge}>NEW HERE?</Text>
      <Text style={styles.title} maxFontSizeMultiplier={MaxFontScale.display}>
        Start with an easy {minutes}-minute run
      </Text>
      <Text style={styles.body}>
        Go at a pace where you could still hold a conversation. SplitCue counts down
        and tells you when you're done, so you don't need to watch the screen.
      </Text>

      <TouchableOpacity
        style={styles.startBtn}
        onPress={onStart}
        activeOpacity={0.8}
        accessibilityRole="button"
      >
        <Ionicons name="play" size={18} color={Colors.black} />
        <Text style={styles.startBtnText} maxFontSizeMultiplier={MaxFontScale.display}>
          Start your first run
        </Text>
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
  labelBadge: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  body: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 4,
    gap: Spacing.xs,
  },
  startBtnText: {
    color: Colors.black,
    fontSize: FontSize.md,
    fontWeight: '800',
  },
});
