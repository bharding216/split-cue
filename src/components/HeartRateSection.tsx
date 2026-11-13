/**
 * HeartRateSection — Run Details heart rate: overall average and max plus
 * the heart rate graph for everyone, and per-interval analysis for Pro.
 *
 * Free runners see a preview of the interval table with the values hidden.
 * Per-interval stats are saved with every run, so upgrading reveals them for
 * past runs too.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { IntervalSplit } from '../workout/workoutTypes';
import type { HrSample, WorkoutHeartRate } from '../heartRate/hrTypes';
import { HeartRateChart } from './HeartRateChart';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale, intervalColor } from '../constants/theme';

interface Props {
  heartRate: WorkoutHeartRate;
  /** Null when the readings aren't stored on this device; the graph is hidden. */
  samples: HrSample[] | null;
  splits: IntervalSplit[] | undefined;
  width: number;
  isPro: boolean;
  onUpgrade: () => void;
}

const HIDDEN = '•••';
const CELL_FONT_SCALE = MaxFontScale.display;

export function HeartRateSection({ heartRate, samples, splits, width, isPro, onUpgrade }: Props) {
  const intervalRows = (splits ?? []).filter((s) => s.avgHr != null);
  const showIntervals = intervalRows.length > 1;

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>Heart Rate</Text>
        {heartRate.deviceName && (
          <Text style={styles.device} numberOfLines={1}>
            {heartRate.deviceName}
          </Text>
        )}
      </View>

      <View style={styles.statsRow}>
        <Stat label="Avg" value={heartRate.avg} />
        <Stat label="Max" value={heartRate.max} />
      </View>

      {samples && <HeartRateChart samples={samples} splits={splits} avg={heartRate.avg} width={width} />}

      {showIntervals && (
        <View style={styles.tableCard}>
          <View style={styles.tableTitleRow}>
            <Text style={styles.tableTitle}>By Interval</Text>
            {!isPro && (
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            )}
          </View>
          <View style={styles.row}>
            <Text style={[styles.headCell, styles.segmentCell]}>Segment</Text>
            <Text style={styles.headCell} maxFontSizeMultiplier={CELL_FONT_SCALE}>Avg</Text>
            <Text style={styles.headCell} maxFontSizeMultiplier={CELL_FONT_SCALE}>Max</Text>
            <Text style={styles.headCell} maxFontSizeMultiplier={CELL_FONT_SCALE}>Drop</Text>
          </View>
          <View style={!isPro && styles.lockedRows}>
            {(isPro ? intervalRows : intervalRows.slice(0, 4)).map((s, i) => (
              <View key={i} style={styles.row}>
                <View style={[styles.segmentCell, styles.segmentLabel]}>
                  <View style={[styles.dot, { backgroundColor: intervalColor(s.type) }]} />
                  <Text style={styles.cellText} numberOfLines={1}>
                    {s.label}
                  </Text>
                </View>
                <Text style={styles.valueCell} maxFontSizeMultiplier={CELL_FONT_SCALE}>
                  {isPro ? s.avgHr : HIDDEN}
                </Text>
                <Text style={styles.valueCell} maxFontSizeMultiplier={CELL_FONT_SCALE}>
                  {isPro ? s.maxHr : HIDDEN}
                </Text>
                <Text style={styles.valueCell} maxFontSizeMultiplier={CELL_FONT_SCALE}>
                  {s.hrRecoveryDrop == null ? '' : isPro ? `−${s.hrRecoveryDrop}` : HIDDEN}
                </Text>
              </View>
            ))}
          </View>
          {isPro ? (
            intervalRows.some((s) => s.hrRecoveryDrop != null) && (
              <Text style={styles.footnote}>
                Drop is how far your heart rate fell during each recovery.
              </Text>
            )
          ) : (
            <View style={styles.upsell}>
              <Text style={styles.upsellTitle}>Unlock detailed interval analysis with SplitCue Pro</Text>
              <Text style={styles.upsellText}>
                See how your heart rate responds to each effort and recovery across your{' '}
                {intervalRows.length} intervals.
              </Text>
              <TouchableOpacity
                style={styles.upsellButton}
                onPress={onUpgrade}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Ionicons name="lock-open-outline" size={16} color={Colors.background} />
                <Text style={styles.upsellButtonText}>See Interval Heart Rate</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} maxFontSizeMultiplier={MaxFontScale.display}>
        {value}
        <Text style={styles.statUnit}> bpm</Text>
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  device: {
    flexShrink: 1,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  stat: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  statValue: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.danger,
    fontVariant: ['tabular-nums'],
  },
  statUnit: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: Colors.textMuted,
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  tableCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  tableTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  tableTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  proBadge: {
    backgroundColor: Colors.accent + '25',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  proBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.accent,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceLight,
  },
  headCell: {
    width: 52,
    textAlign: 'right',
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  segmentCell: {
    flex: 1,
    textAlign: 'left',
    width: undefined,
  },
  segmentLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cellText: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
  },
  valueCell: {
    width: 52,
    textAlign: 'right',
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  lockedRows: {
    opacity: 0.45,
  },
  footnote: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
  },
  upsell: {
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  upsellTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  upsellText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  upsellButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2,
    marginTop: Spacing.sm,
  },
  upsellButtonText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.background,
  },
});
