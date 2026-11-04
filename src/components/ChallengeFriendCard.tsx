/**
 * ChallengeFriendCard — post-workout prompt to send the workout to a friend.
 *
 * Shown on the workout-complete screen. Opens the native share sheet with
 * the sender's result and an import link so a friend can run the same workout.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { hapticTap } from '../audio/haptics';
import { useLargeText } from '../hooks/useLargeText';
import type { WorkoutDefinition } from '../workout/workoutTypes';
import type { PaceUnit } from '../pace/paceTypes';
import {
  formatChallengeMark,
  shareWorkoutChallenge,
} from '../sharing/shareWorkout';

interface Props {
  workout: WorkoutDefinition;
  totalDurationMs: number;
  totalDistanceMeters?: number;
  paceUnit: PaceUnit;
}

export function ChallengeFriendCard({
  workout,
  totalDurationMs,
  totalDistanceMeters,
  paceUnit,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const large = useLargeText();

  const mark = formatChallengeMark({
    totalDurationMs,
    totalDistanceMeters,
    paceUnit,
  });

  const handlePress = async () => {
    if (busy) return;
    hapticTap();
    setBusy(true);
    try {
      const shared = await shareWorkoutChallenge(workout, {
        totalDurationMs,
        totalDistanceMeters,
        paceUnit,
      });
      if (shared) setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={[styles.row, large && styles.rowLarge]}>
        <View style={styles.iconCircle}>
          <Ionicons name="people" size={22} color={Colors.primary} />
        </View>
        <View style={[styles.text, large && styles.textLarge]}>
          <Text style={styles.title}>Challenge a friend</Text>
          <Text style={styles.message}>
            {sent
              ? 'Challenge sent. Pass it to someone else and see who comes out ahead.'
              : 'Send this workout and your result. See who runs it better.'}
          </Text>
          {mark ? <Text style={styles.mark}>Your mark · {mark}</Text> : null}
        </View>
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={handlePress}
        activeOpacity={0.8}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={sent ? 'Send challenge to someone else' : 'Send challenge'}
      >
        {busy ? (
          <ActivityIndicator color={Colors.black} />
        ) : (
          <>
            <Ionicons
              name={sent ? 'paper-plane' : 'paper-plane-outline'}
              size={16}
              color={Colors.black}
            />
            <Text style={styles.buttonText}>
              {sent ? 'Send to someone else' : 'Send challenge'}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    marginTop: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  rowLarge: {
    flexDirection: 'column',
    gap: Spacing.sm,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
  textLarge: {
    flexGrow: 0,
    flexBasis: 'auto',
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  message: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  mark: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
    minHeight: 40,
  },
  buttonText: {
    flexShrink: 1,
    textAlign: 'center',
    color: Colors.black,
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
});
