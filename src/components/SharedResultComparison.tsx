/**
 * SharedResultComparison — "You vs Alex" on the workout-complete screen when
 * the workout came from a friend's share link with their result.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { hapticTap } from '../audio/haptics';
import type { SharedFrom, SharedResult } from '../workout/workoutTypes';
import type { PaceUnit } from '../pace/paceTypes';
import { compareResults, formatResultMark } from '../sharing/shareText';

interface Props {
  sharedFrom: SharedFrom & { result: SharedResult };
  mine: SharedResult;
  paceUnit: PaceUnit;
  onReply: () => void;
}

export function SharedResultComparison({ sharedFrom, mine, paceUnit, onReply }: Props) {
  const name = sharedFrom.senderName || 'Your friend';
  const comparison = compareResults(mine, sharedFrom.result, paceUnit);
  const amount = comparison?.label.replace(/ (faster|slower)$/, '');

  const headline = !comparison
    ? `How you stack up against ${name}`
    : comparison.deltaSeconds === 0
      ? `Dead even with ${name}`
      : comparison.deltaSeconds > 0
        ? `You beat ${name} by ${amount}`
        : `${name} wins by ${amount}`;
  const won = (comparison?.deltaSeconds ?? 0) > 0;

  return (
    <View style={styles.card}>
      <View style={styles.headlineRow}>
        <Ionicons name={won ? 'trophy' : 'flag-outline'} size={20} color={won ? Colors.warning : Colors.primary} />
        <Text style={styles.headline}>{headline}</Text>
      </View>
      {comparison && (
        <Text style={styles.basis}>{comparison.basis === 'pace' ? 'By average pace' : 'By total time'}</Text>
      )}

      <View style={styles.marks}>
        <View style={styles.markCol}>
          <Text style={styles.markLabel}>You</Text>
          <Text style={styles.markValue}>{formatResultMark(mine, paceUnit) ?? '--'}</Text>
        </View>
        <View style={styles.markCol}>
          <Text style={styles.markLabel}>{name}</Text>
          <Text style={styles.markValue}>{formatResultMark(sharedFrom.result, paceUnit) ?? '--'}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          hapticTap();
          onReply();
        }}
        activeOpacity={0.8}
        accessibilityRole="button"
      >
        <Ionicons name="paper-plane" size={16} color={Colors.black} />
        <Text style={styles.buttonText}>
          {sharedFrom.senderName ? `Tell ${sharedFrom.senderName}` : 'Send my result'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.warning + '55',
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headline: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  basis: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
    marginLeft: 28,
  },
  marks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginVertical: Spacing.md,
  },
  markCol: {
    flexGrow: 1,
    flexBasis: 120,
  },
  markLabel: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  markValue: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2,
    minHeight: 40,
  },
  buttonText: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.black,
  },
});
