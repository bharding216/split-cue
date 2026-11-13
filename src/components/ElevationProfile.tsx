/**
 * Elevation profile chart rendered with react-native-svg.
 *
 * Displays smoothed altitude vs cumulative distance, with the area
 * fill color-coded by terrain segment (uphill / flat / downhill).
 * When heart rate readings are given, the runner can toggle a heart rate
 * line over the profile, on its own scale, to see how hills affected effort.
 * Dragging a finger along the chart reads out the values at that point.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path, Defs, ClipPath, Rect, G, Line, Circle } from 'react-native-svg';
import { GestureDetector } from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { RoutePoint } from '../workout/workoutTypes';
import type { ElevationSummary } from '../pace/elevationAnalysis';
import type { HrSample } from '../heartRate/hrTypes';
import { heartRateAtTime } from '../heartRate/hrStats';
import { loadHrOverlayEnabled, saveHrOverlayEnabled } from '../heartRate/hrOverlayPreference';
import { trackHr } from '../analytics/hrEvents';
import { formatDistance } from '../units/format';
import { Colors, FontSize, Spacing, BorderRadius, MaxFontScale } from '../constants/theme';
import type { PaceUnit } from '../pace/paceTypes';
import { useChartScrub, nearestIndex } from './useChartScrub';

interface Props {
  route: RoutePoint[];
  summary: ElevationSummary;
  paceUnit: PaceUnit;
  width: number;
  height?: number;
  /** Readings for the run; the heart rate toggle shows only when they line up with the route. */
  heartRate?: HrSample[] | null;
}

/** A route point only gets a heart rate from a reading this close in time. */
const HR_MATCH_TOLERANCE_MS = 5000;
/** Route points on each side averaged into each drawn heart rate point. */
const HR_SMOOTH_RADIUS = 2;
const BPM_STEP = 10;

const TERRAIN_COLORS = {
  uphill: '#F87171', // red tint
  flat: '#60A5FA', // blue tint
  downhill: '#4ADE80', // green tint
} as const;

const PADDING = { top: 12, bottom: 24, left: 0, right: 0 };

/** Centered slot for each axis label; wide enough for "12.5" at the capped font size. */
const DIST_LABEL_WIDTH = 32;

/**
 * Smoothed heart rate at each route point, or null where no reading is
 * close enough. Smoothing stays within each unbroken stretch of readings.
 */
function heartRateAlongRoute(route: RoutePoint[], samples: HrSample[]): (number | null)[] {
  const raw = route.map((pt) => heartRateAtTime(samples, pt.ts, HR_MATCH_TOLERANCE_MS));
  return raw.map((bpm, i) => {
    if (bpm == null) return null;
    let sum = 0;
    let count = 0;
    for (let j = i - 1; j >= Math.max(0, i - HR_SMOOTH_RADIUS) && raw[j] != null; j--) {
      sum += raw[j]!;
      count++;
    }
    for (let j = i; j <= Math.min(raw.length - 1, i + HR_SMOOTH_RADIUS) && raw[j] != null; j++) {
      sum += raw[j]!;
      count++;
    }
    return sum / count;
  });
}

export function ElevationProfile({
  route,
  summary,
  paceUnit,
  width,
  height = 140,
  heartRate,
}: Props) {
  const [hrOn, setHrOn] = useState(false);
  useEffect(() => {
    loadHrOverlayEnabled().then(setHrOn);
  }, []);

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

    return {
      linePath,
      areaPath,
      segmentRects,
      distLabels,
      unit,
      toDist: (px: number) => ((px - PADDING.left) / drawW) * totalDist,
      x: (i: number) => xScale(route[i].dist),
      y: (i: number) => yScale(alts[i]),
      drawH,
    };
  }, [route, summary, paceUnit, width, height]);

  // Heart rate on its own scale, sharing the distance axis
  const hr = useMemo(() => {
    if (!chart || !heartRate || heartRate.length < 2) return null;
    const bpms = heartRateAlongRoute(route, heartRate);
    let minBpm = Infinity;
    let maxBpm = 0;
    let matched = 0;
    for (const b of bpms) {
      if (b == null) continue;
      matched++;
      if (b < minBpm) minBpm = b;
      if (b > maxBpm) maxBpm = b;
    }
    if (matched < 2) return null;

    const yMin = Math.floor((minBpm - 5) / BPM_STEP) * BPM_STEP;
    const yMax = Math.ceil((maxBpm + 5) / BPM_STEP) * BPM_STEP;
    const y = (bpm: number) => PADDING.top + chart.drawH - ((bpm - yMin) / (yMax - yMin)) * chart.drawH;

    let path = '';
    let drawing = false;
    bpms.forEach((b, i) => {
      if (b == null) {
        drawing = false;
        return;
      }
      path += `${drawing ? 'L' : 'M'} ${chart.x(i).toFixed(1)} ${y(b).toFixed(1)} `;
      drawing = true;
    });

    return { path, bpms, y, minBpm: Math.round(minBpm), maxBpm: Math.round(maxBpm) };
  }, [chart, route, heartRate]);

  const shownHr = hrOn ? hr : null;

  const toggleHr = () => {
    const next = !hrOn;
    setHrOn(next);
    saveHrOverlayEnabled(next);
    trackHr('hr_elevation_overlay_toggled', { enabled: next });
  };

  const { gesture, scrubX } = useChartScrub(width);

  const scrub = useMemo(() => {
    if (!chart || scrubX == null) return null;
    const i = nearestIndex(route, chart.toDist(scrubX), (pt) => pt.dist);
    const bpm = shownHr ? shownHr.bpms[i] : null;
    return {
      x: chart.x(i),
      y: chart.y(i),
      alt: summary.smoothedAltitudes[i],
      dist: route[i].dist,
      bpm: bpm != null ? Math.round(bpm) : null,
      hrY: shownHr && bpm != null ? shownHr.y(bpm) : null,
    };
  }, [chart, scrubX, route, summary, shownHr]);

  if (!chart) return null;

  const metersToFeet = (m: number) => Math.round(m * 3.28084);
  const isMiles = paceUnit === 'minPerMile';
  const formatAlt = (m: number) => (isMiles ? `${metersToFeet(m)} ft` : `${Math.round(m)} m`);
  const gainDisplay = isMiles
    ? `${metersToFeet(summary.totalElevationGainMeters)} ft`
    : `${summary.totalElevationGainMeters} m`;
  const lossDisplay = isMiles
    ? `${metersToFeet(summary.totalElevationLossMeters)} ft`
    : `${summary.totalElevationLossMeters} m`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {scrub ? (
          <>
            <Text style={styles.title} maxFontSizeMultiplier={MaxFontScale.display}>
              {formatDistance(scrub.dist, paceUnit)}
            </Text>
            <View style={styles.gainLoss}>
              <Text style={styles.scrubAlt} maxFontSizeMultiplier={MaxFontScale.display}>
                {formatAlt(scrub.alt)}
              </Text>
              {shownHr && (
                <Text style={styles.scrubBpm} maxFontSizeMultiplier={MaxFontScale.display}>
                  {scrub.bpm != null ? `♥ ${scrub.bpm} bpm` : '♥ No reading'}
                </Text>
              )}
            </View>
          </>
        ) : (
          <>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Elevation Profile</Text>
              {hr && (
                <TouchableOpacity
                  style={[styles.hrChip, hrOn && styles.hrChipOn]}
                  onPress={toggleHr}
                  activeOpacity={0.7}
                  hitSlop={8}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: hrOn }}
                  accessibilityLabel="Show heart rate"
                >
                  <Ionicons name={hrOn ? 'heart' : 'heart-outline'} size={12} color={Colors.danger} />
                  <Text style={styles.hrChipText} maxFontSizeMultiplier={MaxFontScale.display}>
                    Heart rate
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.gainLoss}>
              <Text style={styles.gainText}>
                {'↑ '}
                {gainDisplay}
              </Text>
              <Text style={styles.lossText}>
                {'↓ '}
                {lossDisplay}
              </Text>
              {shownHr && (
                <Text style={styles.hrRangeText}>
                  {'♥ '}
                  {shownHr.minBpm}–{shownHr.maxBpm}
                </Text>
              )}
            </View>
          </>
        )}
      </View>

      <GestureDetector gesture={gesture}>
        <View>
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

            {shownHr && (
              <Path
                d={shownHr.path}
                fill="none"
                stroke={Colors.danger}
                strokeWidth={1.75}
                strokeLinejoin="round"
              />
            )}

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

            {scrub && (
              <>
                <Line
                  x1={scrub.x}
                  x2={scrub.x}
                  y1={PADDING.top}
                  y2={height - PADDING.bottom}
                  stroke={Colors.textPrimary}
                  strokeWidth={1}
                  opacity={0.6}
                />
                <Circle cx={scrub.x} cy={scrub.y} r={4} fill={Colors.textPrimary} stroke={Colors.background} strokeWidth={2} />
                {scrub.hrY != null && (
                  <Circle cx={scrub.x} cy={scrub.hrY} r={4} fill={Colors.danger} stroke={Colors.background} strokeWidth={2} />
                )}
              </>
            )}
          </Svg>
        </View>
      </GestureDetector>

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
    minHeight: 24,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: Spacing.sm,
  },
  title: {
    flexShrink: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  hrChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  hrChipOn: {
    borderColor: Colors.danger + '60',
    backgroundColor: Colors.danger + '1A',
  },
  hrChipText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '500',
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
  hrRangeText: {
    color: Colors.danger,
    fontSize: FontSize.xs,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  scrubAlt: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  scrubBpm: {
    color: Colors.danger,
    fontSize: FontSize.sm,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
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
