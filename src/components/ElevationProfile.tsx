/**
 * Elevation profile chart rendered with react-native-svg.
 *
 * Displays smoothed altitude vs cumulative distance, with the area
 * fill color-coded by terrain segment (uphill / flat / downhill).
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Defs, ClipPath, Rect, G } from 'react-native-svg';
import type { RoutePoint } from '../workout/workoutTypes';
import type { ElevationSummary } from '../pace/elevationAnalysis';
import { Colors, FontSize, Spacing, BorderRadius, MaxFontScale } from '../constants/theme';
import type { PaceUnit } from '../pace/paceTypes';

interface Props {
  route: RoutePoint[];
  summary: ElevationSummary;
  paceUnit: PaceUnit;
  width: number;
  height?: number;
}

const TERRAIN_COLORS = {
  uphill: '#F87171', // red tint
  flat: '#60A5FA', // blue tint
  downhill: '#4ADE80', // green tint
} as const;

const PADDING = { top: 12, bottom: 24, left: 0, right: 0 };

/** Centered slot for each axis label; wide enough for "12.5" at the capped font size. */
const DIST_LABEL_WIDTH = 32;

export function ElevationProfile({
  route,
  summary,
  paceUnit,
  width,
  height = 140,
}: Props) {
  const chart = useMemo(() => {
    if (route.length < 2) return null;

    const drawW = width - PADDING.left - PADDING.right;
    const drawH = height - PADDING.top - PADDING.bottom;

    const totalDist = route[route.length - 1].dist;
    if (totalDist < 1) return null;

    const alts = summary.smoothedAltitudes;
    const minAlt = Math.min(...alts);
    const maxAlt = Math.max(...alts);
    const altRange = maxAlt - minAlt || 1;

    const xScale = (d: number) =>
      PADDING.left + (d / totalDist) * drawW;
    const yScale = (a: number) =>
      PADDING.top + drawH - ((a - minAlt) / altRange) * drawH;

    // Build the main line path
    let linePath = `M ${xScale(route[0].dist)} ${yScale(alts[0])}`;
    for (let i = 1; i < route.length; i++) {
      linePath += ` L ${xScale(route[i].dist)} ${yScale(alts[i])}`;
    }

    // Build a closed area path for the fill (line + bottom edge)
    const areaPath =
      linePath +
      ` L ${xScale(route[route.length - 1].dist)} ${PADDING.top + drawH}` +
      ` L ${xScale(route[0].dist)} ${PADDING.top + drawH} Z`;

    // Build segment clip rects for color-coded fill
    const segmentRects = summary.segments.map((seg, idx) => {
      const x1 = xScale(route[seg.startIndex].dist);
      const x2 = xScale(route[seg.endIndex].dist);
      return {
        key: idx,
        x: x1,
        width: Math.max(x2 - x1, 0.5),
        color: TERRAIN_COLORS[seg.type],
      };
    });

    // Distance labels along the bottom
    const distLabels: { x: number; label: string }[] = [];
    const isMiles = paceUnit === 'minPerMile';
    const divisor = isMiles ? 1609.344 : 1000;
    const unit = isMiles ? 'mi' : 'km';
    const totalUnits = totalDist / divisor;

    // Aim for ~4 labels
    let step = 1;
    if (totalUnits < 2) step = 0.5;
    if (totalUnits > 8) step = 2;
    if (totalUnits > 16) step = 5;

    for (let d = step; d * divisor < totalDist; d += step) {
      distLabels.push({
        x: xScale(d * divisor),
        label: `${d}`,
      });
    }

    return { linePath, areaPath, segmentRects, distLabels, unit };
  }, [route, summary, paceUnit, width, height]);

  if (!chart) return null;

  const metersToFeet = (m: number) => Math.round(m * 3.28084);
  const isMiles = paceUnit === 'minPerMile';
  const gainDisplay = isMiles
    ? `${metersToFeet(summary.totalElevationGainMeters)} ft`
    : `${summary.totalElevationGainMeters} m`;
  const lossDisplay = isMiles
    ? `${metersToFeet(summary.totalElevationLossMeters)} ft`
    : `${summary.totalElevationLossMeters} m`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Elevation Profile</Text>
        <View style={styles.gainLoss}>
          <Text style={styles.gainText}>
            {'↑ '}
            {gainDisplay}
          </Text>
          <Text style={styles.lossText}>
            {'↓ '}
            {lossDisplay}
          </Text>
        </View>
      </View>

      <Svg width={width} height={height}>
        <Defs>
          <ClipPath id="areaClip">
            <Path d={chart.areaPath} />
          </ClipPath>
        </Defs>

        {/* Color-coded fill by terrain segment */}
        <G clipPath="url(#areaClip)">
          {chart.segmentRects.map((r) => (
            <Rect
              key={r.key}
              x={r.x}
              y={0}
              width={r.width}
              height={height}
              fill={r.color}
              opacity={0.25}
            />
          ))}
        </G>

        {/* Elevation line */}
        <Path
          d={chart.linePath}
          fill="none"
          stroke={Colors.textSecondary}
          strokeWidth={1.5}
        />

        {/* Distance axis labels */}
        {chart.distLabels.map((lbl) => (
          <React.Fragment key={lbl.label}>
            <Rect
              x={lbl.x}
              y={height - PADDING.bottom}
              width={0.5}
              height={4}
              fill={Colors.textMuted}
            />
          </React.Fragment>
        ))}
      </Svg>

      {/* Distance text labels (rendered as RN Text for crisp rendering) */}
      <View style={[styles.distLabels, { width }]}>
        {chart.distLabels.map((lbl) => (
          <Text
            key={lbl.label}
            style={[
              styles.distLabel,
              { left: lbl.x - DIST_LABEL_WIDTH / 2 },
            ]}
            numberOfLines={1}
            maxFontSizeMultiplier={MaxFontScale.display}
          >
            {lbl.label}
          </Text>
        ))}
        <Text
          style={[styles.distUnit, { right: PADDING.right + 2 }]}
          maxFontSizeMultiplier={MaxFontScale.display}
        >
          {chart.unit}
        </Text>
      </View>

      {/* Terrain legend */}
      <View style={styles.legend}>
        <LegendItem color={TERRAIN_COLORS.uphill} label="Uphill" />
        <LegendItem color={TERRAIN_COLORS.flat} label="Flat" />
        <LegendItem color={TERRAIN_COLORS.downhill} label="Downhill" />
      </View>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    columnGap: Spacing.sm,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  title: {
    flexShrink: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  gainLoss: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  gainText: {
    color: TERRAIN_COLORS.uphill,
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  lossText: {
    color: TERRAIN_COLORS.downhill,
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  distLabels: {
    position: 'relative',
    height: 16,
    marginTop: -20,
  },
  distLabel: {
    position: 'absolute',
    color: Colors.textMuted,
    fontSize: 10,
    textAlign: 'center',
    width: DIST_LABEL_WIDTH,
  },
  distUnit: {
    position: 'absolute',
    color: Colors.textMuted,
    fontSize: 10,
    bottom: 0,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: Spacing.md,
    rowGap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
  },
});
