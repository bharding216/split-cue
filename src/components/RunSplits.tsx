/**
 * RunSplits — Run Details splits section. Switches between the workout's
 * intervals and fixed-distance splits (1, ½, or ¼ mile / km) from the route.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { formatTime, type IntervalSplit, type RoutePoint } from '../workout/workoutTypes';
import type { PaceUnit, SplitDistancePreset } from '../pace/paceTypes';
import { computeDistanceSplits, type DistanceSplit } from '../pace/distanceSplits';
import { cueDistanceLabel, cueDistanceMeters } from '../audio/cueSchedule';
import { SplitsTable } from './SplitsTable';
import { distanceUnitLabel, formatPaceValue, toDisplayDistance } from '../units/format';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../constants/theme';
import { useLargeText } from '../hooks/useLargeText';
import { hapticTap } from '../audio/haptics';

type SplitMode = 'intervals' | SplitDistancePreset;

const DISTANCE_MODES: SplitDistancePreset[] = ['full', 'half', 'quarter'];
const CELL_FONT_SCALE = MaxFontScale.display;
/** Decimals for a completed split's end marker: "3", "1.5", "0.75". */
const MARKER_DECIMALS: Record<SplitDistancePreset, number> = { full: 0, half: 1, quarter: 2 };

interface Props {
  intervalSplits: IntervalSplit[] | undefined;
  route: RoutePoint[] | undefined;
  paceUnit: PaceUnit;
  splitDistance: SplitDistancePreset;
  onSplitDistanceChange: (preset: SplitDistancePreset) => void;
}

export function RunSplits({
  intervalSplits,
  route,
  paceUnit,
  splitDistance,
  onSplitDistanceChange,
}: Props) {
  // A single-interval run's only split is the whole run, so it isn't worth a tab
  const hasIntervals = (intervalSplits?.length ?? 0) > 1;
  const hasRoute = route != null && route.length >= 2 && route[route.length - 1].dist > 0;
  const [mode, setMode] = useState<SplitMode>(hasIntervals ? 'intervals' : splitDistance);

  const preset: SplitDistancePreset = mode === 'intervals' ? splitDistance : mode;
  const distanceSplits = useMemo(
    () => (route && hasRoute ? computeDistanceSplits(route, cueDistanceMeters(preset, paceUnit)) : []),
    [hasRoute, route, preset, paceUnit],
  );

  const showIntervals = mode === 'intervals' || !hasRoute;
  if (showIntervals && !intervalSplits?.length) return null;
  if (!showIntervals && distanceSplits.length === 0) return null;

  const modes: SplitMode[] = [
    ...(hasIntervals ? ['intervals' as const] : []),
    ...(hasRoute ? DISTANCE_MODES : []),
  ];

  return (
    <View>
      <Text style={styles.title}>Splits</Text>
      {modes.length > 1 && (
        <View style={styles.chipRow} accessibilityRole="tablist">
          {modes.map((m) => {
            const active = m === mode;
            return (
              <TouchableOpacity
                key={m}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => {
                  if (active) return;
                  hapticTap();
                  setMode(m);
                  if (m !== 'intervals') onSplitDistanceChange(m);
                }}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {m === 'intervals' ? 'Intervals' : cueDistanceLabel(m, paceUnit)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      {showIntervals ? (
        <SplitsTable splits={intervalSplits!} paceUnit={paceUnit} hideTitle />
      ) : (
        <DistanceSplitsTable splits={distanceSplits} preset={preset} paceUnit={paceUnit} />
      )}
    </View>
  );
}

const MIN_BAR = 0.25;

/** Bar fill (0..1): MIN_BAR for the slowest split, full for the fastest. */
function barWidth(pace: number | null, fastest: number | null, slowest: number | null): number {
  if (pace == null || fastest == null || slowest == null) return 0;
  if (slowest - fastest < 1e-6) return 1;
  const t = (slowest - pace) / (slowest - fastest);
  return Math.max(MIN_BAR / 2, Math.min(1, MIN_BAR + (1 - MIN_BAR) * t));
}

function DistanceSplitsTable({
  splits,
  preset,
  paceUnit,
}: {
  splits: DistanceSplit[];
  preset: SplitDistancePreset;
  paceUnit: PaceUnit;
}) {
  const large = useLargeText();
  const unitLabel = distanceUnitLabel(paceUnit);

  // Bars span slowest to fastest split so small pace differences stay visible
  const paces = splits
    .filter((s) => s.complete && s.paceMinPerMile != null)
    .map((s) => s.paceMinPerMile!);
  const fastest = paces.length > 0 ? Math.min(...paces) : null;
  const slowest = paces.length > 0 ? Math.max(...paces) : null;

  return (
    <View style={styles.table}>
      {!large && (
        <View style={styles.headerRow}>
          <Text style={[styles.headerCell, styles.markerCol]} maxFontSizeMultiplier={CELL_FONT_SCALE}>
            {unitLabel}
          </Text>
          <View style={styles.barCol} />
          <Text style={[styles.headerCell, styles.valueCol]} maxFontSizeMultiplier={CELL_FONT_SCALE}>
            Time
          </Text>
          <Text style={[styles.headerCell, styles.valueCol]} maxFontSizeMultiplier={CELL_FONT_SCALE}>
            Pace
          </Text>
        </View>
      )}

      {splits.map((split, i) => {
        const marker = toDisplayDistance(split.endMeters, paceUnit).toFixed(
          split.complete ? MARKER_DECIMALS[preset] : 2,
        );
        const time = formatTime(Math.round(split.durationMs / 1000));
        const pace = formatPaceValue(split.paceMinPerMile, paceUnit);
        // Highlight only when splits actually differ
        const isFastest =
          split.complete && paces.length > 1 && fastest !== slowest && split.paceMinPerMile === fastest;
        const paceColor = isFastest ? Colors.accent : Colors.textSecondary;
        const barRatio = barWidth(split.paceMinPerMile, fastest, slowest);

        if (large) {
          return (
            <View key={i} style={[styles.rowLarge, i % 2 === 0 && styles.rowAlt]}>
              <Text style={styles.cell} maxFontSizeMultiplier={CELL_FONT_SCALE}>
                {marker} {unitLabel}
              </Text>
              <View style={styles.valueBlocks}>
                <View>
                  <Text style={styles.headerCell} maxFontSizeMultiplier={CELL_FONT_SCALE}>Time</Text>
                  <Text style={[styles.cell, styles.num]} maxFontSizeMultiplier={CELL_FONT_SCALE}>
                    {time}
                  </Text>
                </View>
                <View>
                  <Text style={styles.headerCell} maxFontSizeMultiplier={CELL_FONT_SCALE}>Pace</Text>
                  <Text
                    style={[styles.cell, styles.num, { color: paceColor }]}
                    maxFontSizeMultiplier={CELL_FONT_SCALE}
                  >
                    {pace}
                  </Text>
                </View>
              </View>
            </View>
          );
        }

        return (
          <View
            key={i}
            style={[styles.row, i % 2 === 0 && styles.rowAlt]}
            accessible
            accessibilityLabel={`${marker} ${unitLabel}: time ${time}, pace ${pace}${isFastest ? ', fastest' : ''}`}
          >
            <Text
              style={[styles.cell, styles.markerCol, styles.num, !split.complete && { color: Colors.textMuted }]}
              maxFontSizeMultiplier={CELL_FONT_SCALE}
            >
              {marker}
            </Text>
            <View style={styles.barCol}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    { width: `${barRatio * 100}%` },
                    isFastest && { backgroundColor: Colors.accent },
                  ]}
                />
              </View>
            </View>
            <Text style={[styles.cell, styles.valueCol, styles.num]} maxFontSizeMultiplier={CELL_FONT_SCALE}>
              {time}
            </Text>
            <Text
              style={[styles.cell, styles.valueCol, styles.num, { color: paceColor }]}
              maxFontSizeMultiplier={CELL_FONT_SCALE}
            >
              {pace}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  chip: {
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
  },
  chipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '18',
  },
  chipLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  chipLabelActive: { color: Colors.primary },
  table: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  valueBlocks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.md,
    rowGap: Spacing.xs,
  },
  cell: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  num: {
    fontVariant: ['tabular-nums'],
  },
  markerCol: {
    minWidth: 44,
  },
  barCol: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceLight,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  valueCol: {
    minWidth: 56,
    textAlign: 'right',
  },
});
