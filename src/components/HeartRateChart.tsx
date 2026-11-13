/**
 * Heart rate over workout time, rendered with react-native-svg.
 *
 * Styled like the elevation profile: a smoothed line over a filled area,
 * with the fill tinted by interval type so efforts and recoveries read at
 * a glance. Dropouts in the recording show as breaks in the line and fill.
 * Dragging a finger along the chart reads out the heart rate at that moment.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Defs, ClipPath, Rect, G, Line, Circle } from 'react-native-svg';
import { GestureDetector } from 'react-native-gesture-handler';
import { formatTime, type IntervalSplit, type IntervalType } from '../workout/workoutTypes';
import { HR_MAX_GAP_MS, type HrSample } from '../heartRate/hrTypes';
import { splitAtDropouts } from '../heartRate/hrStats';
import { Colors, FontSize, Spacing, MaxFontScale, intervalColor } from '../constants/theme';
import { useChartScrub, nearestIndex } from './useChartScrub';

interface Props {
  samples: HrSample[];
  splits: IntervalSplit[] | undefined;
  avg: number;
  width: number;
  height?: number;
}

const PADDING = { top: 12, bottom: 24, left: 0, right: 0 };
const BPM_STEP = 10;
const TIME_LABEL_WIDTH = 32;
/** Readings on each side averaged into each drawn point; monitors report about once a second. */
const SMOOTH_RADIUS = 2;

const LEGEND: { type: IntervalType; label: string }[] = [
  { type: 'warmup', label: 'Warm-up' },
  { type: 'hard', label: 'Effort' },
  { type: 'easy', label: 'Recovery' },
  { type: 'cooldown', label: 'Cool-down' },
];

function smooth(run: HrSample[]): number[] {
  return run.map((_, i) => {
    const lo = Math.max(0, i - SMOOTH_RADIUS);
    const hi = Math.min(run.length - 1, i + SMOOTH_RADIUS);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += run[j].bpm;
    return sum / (hi - lo + 1);
  });
}

export function HeartRateChart({ samples, splits, avg, width, height = 140 }: Props) {
  const chart = useMemo(() => {
    if (samples.length < 2) return null;
    const drawW = width - PADDING.left - PADDING.right;
    const drawH = height - PADDING.top - PADDING.bottom;
    const bottom = PADDING.top + drawH;

    const lastSplitEnd = splits?.reduce((m, s) => Math.max(m, s.endElapsedMs ?? 0), 0) ?? 0;
    const totalMs = Math.max(samples[samples.length - 1].t, lastSplitEnd);
    if (totalMs <= 0) return null;

    let minBpm = Infinity;
    let maxBpm = 0;
    for (const s of samples) {
      if (s.bpm < minBpm) minBpm = s.bpm;
      if (s.bpm > maxBpm) maxBpm = s.bpm;
    }
    const yMin = Math.floor((minBpm - 5) / BPM_STEP) * BPM_STEP;
    const yMax = Math.ceil((maxBpm + 5) / BPM_STEP) * BPM_STEP;
    const yRange = yMax - yMin || 1;

    const x = (t: number) => PADDING.left + (t / totalMs) * drawW;
    const y = (bpm: number) => PADDING.top + drawH - ((bpm - yMin) / yRange) * drawH;

    const linePaths: string[] = [];
    const areaPaths: string[] = [];
    const points: { t: number; x: number; y: number; bpm: number }[] = [];
    for (const run of splitAtDropouts(samples)) {
      if (run.length < 2) continue;
      const bpms = smooth(run);
      run.forEach((s, i) => points.push({ t: s.t, x: x(s.t), y: y(bpms[i]), bpm: Math.round(bpms[i]) }));
      const line = run
        .map((s, i) => `${i === 0 ? 'M' : 'L'} ${x(s.t).toFixed(1)} ${y(bpms[i]).toFixed(1)}`)
        .join(' ');
      linePaths.push(line);
      areaPaths.push(
        `${line} L ${x(run[run.length - 1].t).toFixed(1)} ${bottom} L ${x(run[0].t).toFixed(1)} ${bottom} Z`,
      );
    }
    if (linePaths.length === 0) return null;

    const bands = (splits ?? [])
      .filter((s) => s.startElapsedMs != null && s.endElapsedMs != null && s.endElapsedMs > s.startElapsedMs)
      .map((s, i) => ({
        key: i,
        type: s.type,
        x: x(s.startElapsedMs!),
        width: Math.max(x(s.endElapsedMs!) - x(s.startElapsedMs!), 0.5),
        color: intervalColor(s.type),
      }));
    const bandTypes = new Set(bands.map((b) => b.type));
    const legend = bandTypes.size > 1 ? LEGEND.filter((l) => bandTypes.has(l.type)) : [];

    // Minute labels, aiming for about four
    const totalMin = totalMs / 60_000;
    const minuteStep = [1, 2, 5, 10, 15, 20, 30, 60].find((m) => totalMin / m <= 5) ?? 120;
    const timeLabels: { x: number; label: string }[] = [];
    for (let m = minuteStep; m * 60_000 < totalMs; m += minuteStep) {
      timeLabels.push({ x: x(m * 60_000), label: `${m}` });
    }

    const toTime = (px: number) => ((px - PADDING.left) / drawW) * totalMs;
    const timedSplits = (splits ?? []).filter((s) => s.startElapsedMs != null && s.endElapsedMs != null);

    return {
      linePaths,
      areaPaths,
      bands,
      legend,
      timeLabels,
      points,
      timedSplits,
      toTime,
      avgY: y(avg),
      minBpm,
      maxBpm,
    };
  }, [samples, splits, avg, width, height]);

  const { gesture, scrubX } = useChartScrub(width);

  const scrub = useMemo(() => {
    if (!chart || scrubX == null) return null;
    const t = chart.toTime(scrubX);
    const p = chart.points[nearestIndex(chart.points, t, (pt) => pt.t)];
    const hasReading = Math.abs(p.t - t) <= HR_MAX_GAP_MS;
    const split = chart.timedSplits.find((s) => t >= s.startElapsedMs! && t < s.endElapsedMs!);
    return {
      x: hasReading ? p.x : scrubX,
      dot: hasReading ? { x: p.x, y: p.y } : null,
      bpm: hasReading ? p.bpm : null,
      time: formatTime(Math.max(0, t) / 1000),
      split,
    };
  }, [chart, scrubX]);

  if (!chart) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {scrub ? (
          <>
            <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={MaxFontScale.display}>
              {scrub.time}
              {scrub.split && <Text style={styles.scrubSplit}>{`  ${scrub.split.label}`}</Text>}
            </Text>
            <Text style={styles.scrubValue} maxFontSizeMultiplier={MaxFontScale.display}>
              {scrub.bpm != null ? `${scrub.bpm} bpm` : 'No reading'}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>Over Time</Text>
            <Text style={styles.range} maxFontSizeMultiplier={MaxFontScale.display}>
              {chart.minBpm}–{chart.maxBpm} bpm
            </Text>
          </>
        )}
      </View>

      <GestureDetector gesture={gesture}>
        <View
          accessible
          accessibilityLabel={`Heart rate graph, ${chart.minBpm} to ${chart.maxBpm} beats per minute, average ${avg}`}
        >
          <Svg width={width} height={height}>
            <Defs>
              <ClipPath id="hrAreaClip">
                {chart.areaPaths.map((d, i) => (
                  <Path key={i} d={d} />
                ))}
              </ClipPath>
            </Defs>

            {/* Fill tinted by interval type, or plain when the run has no intervals */}
            <G clipPath="url(#hrAreaClip)">
              {chart.bands.length > 0 ? (
                chart.bands.map((b) => (
                  <Rect key={b.key} x={b.x} y={0} width={b.width} height={height} fill={b.color} opacity={0.25} />
                ))
              ) : (
                <Rect x={0} y={0} width={width} height={height} fill={Colors.danger} opacity={0.25} />
              )}
            </G>

            {chart.linePaths.map((d, i) => (
              <Path
                key={i}
                d={d}
                fill="none"
                stroke={Colors.textSecondary}
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
            ))}

            <Line
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={chart.avgY}
              y2={chart.avgY}
              stroke={Colors.textMuted}
              strokeWidth={1}
              strokeDasharray="3,4"
            />

            {chart.timeLabels.map((l) => (
              <Rect
                key={l.label}
                x={l.x}
                y={height - PADDING.bottom}
                width={0.5}
                height={4}
                fill={Colors.textMuted}
              />
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
                {scrub.dot && (
                  <Circle cx={scrub.dot.x} cy={scrub.dot.y} r={4} fill={Colors.danger} stroke={Colors.background} strokeWidth={2} />
                )}
              </>
            )}
          </Svg>

          {!scrub && (
            <Text
              style={[styles.avgLabel, { top: chart.avgY - 15, right: PADDING.right + 2 }]}
              maxFontSizeMultiplier={MaxFontScale.display}
            >
              avg {avg}
            </Text>
          )}
        </View>
      </GestureDetector>

      {/* Time labels as RN Text for crisp rendering */}
      <View style={[styles.timeLabels, { width }]}>
        {chart.timeLabels.map((l) => (
          <Text
            key={l.label}
            style={[styles.timeLabel, { left: l.x - TIME_LABEL_WIDTH / 2 }]}
            numberOfLines={1}
            maxFontSizeMultiplier={MaxFontScale.display}
          >
            {l.label}
          </Text>
        ))}
        <Text style={[styles.timeUnit, { right: PADDING.right + 2 }]} maxFontSizeMultiplier={MaxFontScale.display}>
          min
        </Text>
      </View>

      {chart.legend.length > 0 && (
        <View style={styles.legend}>
          {chart.legend.map((l) => (
            <View key={l.type} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: intervalColor(l.type) }]} />
              <Text style={styles.legendText}>{l.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.sm,
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
  range: {
    color: Colors.danger,
    fontSize: FontSize.xs,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  scrubSplit: {
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  scrubValue: {
    color: Colors.danger,
    fontSize: FontSize.sm,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  avgLabel: {
    position: 'absolute',
    color: Colors.textSecondary,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  timeLabels: {
    position: 'relative',
    height: 16,
    marginTop: -20,
  },
  timeLabel: {
    position: 'absolute',
    color: Colors.textMuted,
    fontSize: 10,
    textAlign: 'center',
    width: TIME_LABEL_WIDTH,
  },
  timeUnit: {
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
