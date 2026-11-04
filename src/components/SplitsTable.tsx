/**
 * SplitsTable — per-interval time, target, pace, and distance for a finished run.
 */

import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { formatTime, type IntervalSplit } from '../workout/workoutTypes';
import type { PaceUnit } from '../pace/paceTypes';
import {
  Colors,
  Spacing,
  FontSize,
  BorderRadius,
  MaxFontScale,
  intervalColor,
} from '../constants/theme';
import { distanceUnitLabel, formatPaceValue, metersPerUnit } from '../units/format';
import { useLargeText } from '../hooks/useLargeText';

interface Props {
  splits: IntervalSplit[];
  paceUnit: PaceUnit;
  style?: StyleProp<ViewStyle>;
}

const CELL_FONT_SCALE = MaxFontScale.display;

function formatSplitDistance(meters: number, unit: PaceUnit): string {
  const value = meters / metersPerUnit(unit);
  return value >= 0.1 ? value.toFixed(2) : `${Math.round(meters)}m`;
}

export function SplitsTable({ splits, paceUnit, style }: Props) {
  const large = useLargeText();
  const hasPace = splits.some((s) => s.avgPaceMinPerMile != null);
  const hasDist = splits.some((s) => s.distanceMeters != null);
  const hasTarget = splits.some((s) => s.targetPace != null);
  const distLabel = distanceUnitLabel(paceUnit);

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>Splits</Text>

      {/* With large text the columns can't fit side by side, so each row labels its own values instead */}
      {!large && (
        <View style={styles.headerRow}>
          <Text style={[styles.headerCell, styles.labelCol]} maxFontSizeMultiplier={CELL_FONT_SCALE}>
            #
          </Text>
          <Text
            style={[styles.headerCell, styles.labelCol, { flex: 1 }]}
            maxFontSizeMultiplier={CELL_FONT_SCALE}
          >
            Interval
          </Text>
          <Text style={[styles.headerCell, styles.valueCol]} maxFontSizeMultiplier={CELL_FONT_SCALE}>
            Time
          </Text>
          {hasTarget && (
            <Text style={[styles.headerCell, styles.valueCol]} maxFontSizeMultiplier={CELL_FONT_SCALE}>
              Target
            </Text>
          )}
          {hasPace && (
            <Text style={[styles.headerCell, styles.valueCol]} maxFontSizeMultiplier={CELL_FONT_SCALE}>
              Pace
            </Text>
          )}
          {hasDist && (
            <Text style={[styles.headerCell, styles.valueCol]} maxFontSizeMultiplier={CELL_FONT_SCALE}>
              {distLabel}
            </Text>
          )}
        </View>
      )}

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

        const values: { key: string; label: string; value: string; color: string }[] = [
          { key: 'time', label: 'Time', value: formatTime(actualSec), color: Colors.textSecondary },
        ];
        if (hasTarget) {
          values.push({
            key: 'target',
            label: 'Target',
            value: split.targetPace != null ? formatPaceValue(split.targetPace, paceUnit) : '—',
            color: Colors.textMuted,
          });
        }
        if (hasPace) {
          values.push({ key: 'pace', label: 'Pace', value: paceStr, color: paceColor });
        }
        if (hasDist) {
          values.push({ key: 'dist', label: distLabel, value: distStr, color: Colors.textSecondary });
        }

        if (large) {
          return (
            <View key={i} style={[styles.rowLarge, i % 2 === 0 && styles.rowAlt]}>
              <View style={styles.labelLine}>
                <View style={[styles.typeDot, { backgroundColor: intervalColor(split.type) }]} />
                <Text style={[styles.cell, styles.labelText]} maxFontSizeMultiplier={CELL_FONT_SCALE}>
                  <Text style={{ color: Colors.textMuted }}>{i + 1}. </Text>
                  {split.label}
                </Text>
              </View>
              <View style={styles.valueBlocks}>
                {values.map((v) => (
                  <View key={v.key} style={styles.valueBlock}>
                    <Text style={styles.headerCell} maxFontSizeMultiplier={CELL_FONT_SCALE}>
                      {v.label}
                    </Text>
                    <Text
                      style={[styles.cell, { color: v.color, fontVariant: ['tabular-nums'] }]}
                      maxFontSizeMultiplier={CELL_FONT_SCALE}
                    >
                      {v.value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          );
        }

        return (
          <View key={i} style={[styles.row, i % 2 === 0 && styles.rowAlt]}>
            <Text
              style={[styles.cell, styles.labelCol, { color: Colors.textMuted }]}
              maxFontSizeMultiplier={CELL_FONT_SCALE}
            >
              {i + 1}
            </Text>
            <View style={[styles.labelCol, { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
              <View style={[styles.typeDot, { backgroundColor: intervalColor(split.type) }]} />
              <Text style={styles.cell} numberOfLines={1} maxFontSizeMultiplier={CELL_FONT_SCALE}>
                {split.label}
              </Text>
            </View>
            {values.map((v) => (
              <Text
                key={v.key}
                style={[styles.cell, styles.valueCol, { color: v.color, fontVariant: ['tabular-nums'] }]}
                maxFontSizeMultiplier={CELL_FONT_SCALE}
              >
                {v.value}
              </Text>
            ))}
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
  rowLarge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  rowAlt: {
    backgroundColor: Colors.surfaceLight + '44',
  },
  labelLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  labelText: {
    flexShrink: 1,
  },
  valueBlocks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.md,
    rowGap: Spacing.xs,
  },
  valueBlock: {
    flexShrink: 1,
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
