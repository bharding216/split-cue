/**
 * Heart rate over workout time, rendered with react-native-svg.
 *
 * Each interval is a tinted background band in its interval color, so
 * the line can be read against the workout's efforts and recoveries.
 * Dropouts in the recording show as breaks in the line.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Rect, Line } from 'react-native-svg';
import type { IntervalSplit } from '../workout/workoutTypes';
import type { HrSample } from '../heartRate/hrTypes';
import { splitAtDropouts } from '../heartRate/hrStats';
import { Colors, FontSize, Spacing, MaxFontScale, intervalColor } from '../constants/theme';

interface Props {
  samples: HrSample[];
  splits: IntervalSplit[] | undefined;
  width: number;
  height?: number;
}

const PADDING = { top: 8, bottom: 20, left: 0, right: 32 };
const BPM_STEP = 10;
const TIME_LABEL_WIDTH = 36;

export function HeartRateChart({ samples, splits, width, height = 160 }: Props) {
  const chart = useMemo(() => {
    if (samples.length < 2) return null;
    const drawW = width - PADDING.left - PADDING.right;
    const drawH = height - PADDING.top - PADDING.bottom;

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

    const paths = splitAtDropouts(samples).map((run) =>
      run.map((s, i) => `${i === 0 ? 'M' : 'L'} ${x(s.t).toFixed(1)} ${y(s.bpm).toFixed(1)}`).join(' '),
    );

    const bands = (splits ?? [])
      .filter((s) => s.startElapsedMs != null && s.endElapsedMs != null && s.endElapsedMs > s.startElapsedMs)
      .map((s, i) => ({
        key: i,
        x: x(s.startElapsedMs!),
        width: Math.max(x(s.endElapsedMs!) - x(s.startElapsedMs!), 0.5),
        color: intervalColor(s.type),
      }));

    // About three gridlines on round BPM values
    const gridStep = Math.max(BPM_STEP, Math.ceil(yRange / 3 / BPM_STEP) * BPM_STEP);
    const grid: { y: number; label: string }[] = [];
    for (let b = Math.ceil(yMin / gridStep) * gridStep; b <= yMax; b += gridStep) {
      grid.push({ y: y(b), label: `${b}` });
    }

    // Minute labels, aiming for about four
    const totalMin = totalMs / 60_000;
    const minuteStep = [1, 2, 5, 10, 15, 20, 30, 60].find((m) => totalMin / m <= 5) ?? 120;
    const timeLabels: { x: number; label: string }[] = [];
    for (let m = minuteStep; m * 60_000 < totalMs; m += minuteStep) {
      timeLabels.push({ x: x(m * 60_000), label: `${m}` });
    }

    return { paths, bands, grid, timeLabels, drawH };
  }, [samples, splits, width, height]);

  if (!chart) return null;

  return (
    <View>
      <Svg width={width} height={height}>
        {chart.bands.map((b) => (
          <Rect
            key={b.key}
            x={b.x}
            y={PADDING.top}
            width={b.width}
            height={chart.drawH}
            fill={b.color}
            opacity={0.14}
          />
        ))}
        {chart.grid.map((g) => (
          <Line
            key={g.label}
            x1={PADDING.left}
            x2={width - PADDING.right}
            y1={g.y}
            y2={g.y}
            stroke={Colors.surfaceLight}
            strokeWidth={1}
          />
        ))}
        {chart.paths.map((d, i) => (
          <Path key={i} d={d} fill="none" stroke={Colors.danger} strokeWidth={1.75} strokeLinejoin="round" />
        ))}
      </Svg>

      {/* Axis labels as RN Text for crisp rendering */}
      {chart.grid.map((g) => (
        <Text
          key={g.label}
          style={[styles.bpmLabel, { top: g.y - 7, left: width - PADDING.right + 4 }]}
          maxFontSizeMultiplier={MaxFontScale.display}
        >
          {g.label}
        </Text>
      ))}
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
    </View>
  );
}

const styles = StyleSheet.create({
  bpmLabel: {
    position: 'absolute',
    color: Colors.textMuted,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  timeLabels: {
    position: 'relative',
    height: 16,
    marginTop: -PADDING.bottom + 2,
    marginBottom: Spacing.xs,
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
    fontSize: FontSize.xs - 2,
    bottom: 0,
  },
});
