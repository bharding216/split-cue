/**
 * SplitsTable — per-interval time, target, pace, and distance for a finished run.
 */

import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { formatTime, type IntervalSplit } from '../workout/workoutTypes';
import type { PaceUnit } from '../pace/paceTypes';
import { Colors, Spacing, FontSize, BorderRadius, intervalColor } from '../constants/theme';
import { distanceUnitLabel, formatPaceValue, metersPerUnit } from '../units/format';

interface Props {
  splits: IntervalSplit[];
  paceUnit: PaceUnit;
  style?: StyleProp<ViewStyle>;
}

function formatSplitDistance(meters: number, unit: PaceUnit): string {
  const value = meters / metersPerUnit(unit);
  return value >= 0.1 ? value.toFixed(2) : `${Math.round(meters)}m`;
}

export function SplitsTable({ splits, paceUnit, style }: Props) {
  const hasPace = splits.some((s) => s.avgPaceMinPerMile != null);
  const hasDist = splits.some((s) => s.distanceMeters != null);
  const hasTarget = splits.some((s) => s.targetPace != null);

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>Splits</Text>

      <View style={styles.headerRow}>
        <Text style={[styles.headerCell, styles.labelCol]}>#</Text>
        <Text style={[styles.headerCell, styles.labelCol, { flex: 1 }]}>Interval</Text>
        <Text style={[styles.headerCell, styles.valueCol]}>Time</Text>
        {hasTarget && <Text style={[styles.headerCell, styles.valueCol]}>Target</Text>}
        {hasPace && <Text style={[styles.headerCell, styles.valueCol]}>Pace</Text>}
        {hasDist && (
          <Text style={[styles.headerCell, styles.valueCol]}>{distanceUnitLabel(paceUnit)}</Text>
        )}
      </View>

      {splits.map((split, i) => {
        const actualSec = Math.floor(split.actualDurationMs / 1000);
        const paceStr = formatPaceValue(split.avgPaceMinPerMile, paceUnit);
        const distStr =
          split.distanceMeters != null ? formatSplitDistance(split.distanceMeters, paceUnit) : '—';

        // Compared in min/mile, the unit both values are stored in
        let paceColor: string = Colors.textSecondary;
        if (
          split.targetPace != null &&
          split.avgPaceMinPerMile != null &&
          isFinite(split.avgPaceMinPerMile)
        ) {
          const diff = split.avgPaceMinPerMile - split.targetPace;
          if (Math.abs(diff) < 0.15) paceColor = Colors.primary;
          else if (diff > 0) paceColor = Colors.danger;
          else paceColor = Colors.accent;
        }

        return (
          <View key={i} style={[styles.row, i % 2 === 0 && styles.rowAlt]}>
            <Text style={[styles.cell, styles.labelCol, { color: Colors.textMuted }]}>{i + 1}</Text>
            <View style={[styles.labelCol, { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
              <View style={[styles.typeDot, { backgroundColor: intervalColor(split.type) }]} />
              <Text style={styles.cell} numberOfLines={1}>{split.label}</Text>
            </View>
            <Text style={[styles.cell, styles.valueCol, { fontVariant: ['tabular-nums'] }]}>
              {formatTime(actualSec)}
            </Text>
            {hasTarget && (
              <Text style={[styles.cell, styles.valueCol, { color: Colors.textMuted, fontVariant: ['tabular-nums'] }]}>
                {split.targetPace != null ? formatPaceValue(split.targetPace, paceUnit) : '—'}
              </Text>
            )}
            {hasPace && (
              <Text style={[styles.cell, styles.valueCol, { color: paceColor, fontVariant: ['tabular-nums'] }]}>
                {paceStr}
              </Text>
            )}
            {hasDist && (
              <Text style={[styles.cell, styles.valueCol, { fontVariant: ['tabular-nums'] }]}>
                {distStr}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceLight,
  },
  headerCell: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  rowAlt: {
    backgroundColor: Colors.surfaceLight + '44',
  },
  cell: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  labelCol: {
    minWidth: 24,
  },
  valueCol: {
    minWidth: 48,
    textAlign: 'right',
  },
  typeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
