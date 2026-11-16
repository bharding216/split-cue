/**
 * SharedResultComparison — "You vs Alex" on the workout-complete screen when
 * the workout came from a friend's share link with their result.
 *
 * Consistency challenges compare interval consistency scores and show each
 * runner's rep paces. No winner is called when the recipient edited the
 * workout or ran fewer reps than the sender.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { hapticTap } from '../audio/haptics';
import type { IntervalSplit, SharedFrom, SharedResult } from '../workout/workoutTypes';
import type { PaceUnit } from '../pace/paceTypes';
import { compareResults, formatResultMark } from '../sharing/shareText';
import { computeIntervalConsistency } from '../stats/intervalConsistency';

interface Props {
  sharedFrom: SharedFrom & { result: SharedResult };
  mine: SharedResult;
  /** The recipient's splits, for consistency challenges. */
  mySplits?: IntervalSplit[];
  paceUnit: PaceUnit;
  onReply: () => void;
}

const BAR_HEIGHT = 36;

function RepBars({ paces }: { paces: number[] }) {
  if (paces.length === 0) return null;
  const mean = paces.reduce((s, p) => s + p, 0) / paces.length;
  const slowest = Math.max(...paces) + 5;
  const fastest = Math.min(...paces) - 5;
  const heightFor = (pace: number) => BAR_HEIGHT * (0.25 + (0.75 * (slowest - pace)) / (slowest - fastest));
  return (
    <View style={styles.bars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {paces.slice(0, 24).map((pace, i) => {
        const deviation = Math.abs(pace - mean);
        const color = deviation <= 5 ? Colors.primary : deviation <= 15 ? Colors.warning : Colors.danger;
        return <View key={i} style={[styles.bar, { height: heightFor(pace), backgroundColor: color }]} />;
      })}
    </View>
  );
}

export function SharedResultComparison({ sharedFrom, mine, mySplits, paceUnit, onReply }: Props) {
  const name = sharedFrom.senderName || 'Your friend';
  const theirs = sharedFrom.result;
  const isConsistency = sharedFrom.challengeType === 'consistency' && theirs.consistency != null;

  const myConsistency = useMemo(
    () => (isConsistency ? computeIntervalConsistency(mySplits) : null),
    [isConsistency, mySplits],
  );
  const mineScored: SharedResult = myConsistency
    ? { ...mine, consistency: myConsistency.score, repPaces: myConsistency.repPaces }
    : mine;

  const theirReps = theirs.repPaces?.length ?? 0;
  const missingReps = isConsistency && (myConsistency?.repPaces.length ?? 0) < Math.max(theirReps, 3);
  const unscored = sharedFrom.modified || missingReps;
  const comparison = unscored ? null : compareResults(mineScored, theirs, paceUnit, sharedFrom.challengeType);
  const amount = comparison?.label.replace(/ (faster|slower|higher|lower)$/, '');

  const headline = sharedFrom.modified
    ? `You ran a modified version of ${name}'s workout`
    : missingReps
      ? `Finish every rep to take on ${name}`
      : !comparison
        ? `How you stack up against ${name}`
        : comparison.deltaSeconds === 0
          ? `Dead even with ${name}`
          : comparison.deltaSeconds > 0
            ? `You beat ${name} by ${amount}`
            : `${name} wins by ${amount}`;
  const won = (comparison?.deltaSeconds ?? 0) > 0;

  const basisLabel = sharedFrom.modified
    ? 'Edited workouts aren\'t scored head to head'
    : missingReps
      ? `${name} ran ${theirReps || 'more'} reps. Consistency needs the full set.`
      : comparison
        ? comparison.basis === 'consistency'
          ? 'By interval consistency'
          : comparison.basis === 'pace'
            ? 'By average pace'
            : 'By total time'
        : null;

  const markFor = (result: SharedResult) =>
    isConsistency
      ? result.consistency != null
        ? `${Math.round(result.consistency)}/100`
        : '--'
      : formatResultMark(result, paceUnit) ?? '--';

  return (
    <View style={styles.card}>
      <View style={styles.headlineRow}>
        <Ionicons name={won ? 'trophy' : 'flag-outline'} size={20} color={won ? Colors.warning : Colors.primary} />
        <Text style={styles.headline}>{headline}</Text>
      </View>
      {basisLabel && <Text style={styles.basis}>{basisLabel}</Text>}

      <View style={styles.marks}>
        <View style={styles.markCol}>
          <Text style={styles.markLabel}>You</Text>
          <Text style={styles.markValue}>{markFor(mineScored)}</Text>
          {isConsistency && <RepBars paces={mineScored.repPaces ?? []} />}
        </View>
        <View style={styles.markCol}>
          <Text style={styles.markLabel}>{name}</Text>
          <Text style={styles.markValue}>{markFor(theirs)}</Text>
          {isConsistency && <RepBars paces={theirs.repPaces ?? []} />}
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
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: BAR_HEIGHT,
    marginTop: Spacing.xs,
  },
  bar: {
    flex: 1,
    maxWidth: 12,
    borderRadius: 2,
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
