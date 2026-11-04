/**
 * RacePredictionCard — Premium race prediction visualization.
 *
 * Shows predicted race times with a trend graph over the training period.
 * Displays predictions for 5K, 10K, Half Marathon, and Marathon.
 * Premium-gated: shows blurred teaser for free users.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../constants/theme';
import type { RacePrediction } from '../ai/racePredictions';
import { useUnits } from '../hooks/useUnits';
import { useLargeText } from '../hooks/useLargeText';
import { formatPace, paceSuffix } from '../units/format';

// ── Types ──────────────────────────────────────────────────

interface PredictionDataPoint {
  date: string;
  predictions: RacePrediction[];
}

interface Props {
  /** Current predictions based on latest data */
  currentPredictions: RacePrediction[];
  /** Historical prediction snapshots (for the trend graph) */
  historicalPredictions?: PredictionDataPoint[];
  /** The race the user is training for */
  targetRace?: string;
  /** Whether user has Pro access */
  isPro: boolean;
  /** Callback when tapped while locked */
  onUpgrade?: () => void;
}

// ── Confidence badge colors ────────────────────────────────

const CONFIDENCE_COLORS = {
  high: Colors.primary,
  moderate: Colors.warning,
  low: Colors.textMuted,
};

// ── Component ──────────────────────────────────────────────

export function RacePredictionCard({
  currentPredictions,
  historicalPredictions,
  targetRace,
  isPro,
  onUpgrade,
}: Props) {
  const unit = useUnits();
  const large = useLargeText();
  const { width: screenWidth } = useWindowDimensions();
  const targetPrediction = useMemo(
    () => currentPredictions.find((p) => p.raceType === targetRace),
    [currentPredictions, targetRace],
  );

  const graphData = useMemo(() => {
    if (!historicalPredictions?.length || !targetRace) return null;

    const points = historicalPredictions
      .map((hp) => {
        const pred = hp.predictions.find((p) => p.raceType === targetRace);
        return pred ? { date: hp.date, time: pred.predictedTimeMinutes } : null;
      })
      .filter(Boolean) as { date: string; time: number }[];

    if (points.length < 2) return null;
    return points;
  }, [historicalPredictions, targetRace]);

  // Graph dimensions
  const graphWidth = screenWidth - Spacing.lg * 2 - Spacing.md * 2;
  const graphHeight = 120;
  const graphPadding = { top: 10, bottom: 20, left: 40, right: 10 };
  const plotWidth = graphWidth - graphPadding.left - graphPadding.right;
  const plotHeight = graphHeight - graphPadding.top - graphPadding.bottom;

  const graphPath = useMemo(() => {
    if (!graphData) return null;

    const times = graphData.map((p) => p.time);
    const minTime = Math.min(...times) * 0.98;
    const maxTime = Math.max(...times) * 1.02;
    const timeRange = maxTime - minTime || 1;

    const points = graphData.map((p, i) => ({
      x: graphPadding.left + (i / (graphData.length - 1)) * plotWidth,
      y: graphPadding.top + (1 - (p.time - minTime) / timeRange) * plotHeight,
    }));

    const path = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ');

    return { path, points, minTime, maxTime };
  }, [graphData, plotWidth, plotHeight, graphPadding]);

  if (currentPredictions.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="trophy-outline" size={20} color={Colors.warning} />
          <Text style={styles.headerTitle}>Race Predictions</Text>
        </View>
        {!isPro && (
          <View style={styles.proBadge}>
            <Ionicons name="lock-closed" size={10} color={Colors.accent} />
            <Text style={styles.proBadgeText}>PRO</Text>
          </View>
        )}
      </View>

      {/* Target race hero prediction */}
      {targetPrediction && (
        <View style={styles.heroPrediction}>
          <Text style={styles.heroLabel}>{targetPrediction.raceLabel}</Text>
          <Text
            style={[styles.heroTime, !isPro && styles.blurred]}
            maxFontSizeMultiplier={MaxFontScale.display}
          >
            {isPro ? targetPrediction.predictedTimeFormatted : '??:??:??'}
          </Text>
          <View style={styles.heroMeta}>
            <Text style={[styles.heroPace, !isPro && styles.blurred]}>
              {isPro ? formatPace(targetPrediction.pacePerMile, unit) : `??:??${paceSuffix(unit)}`}
            </Text>
            <View
              style={[
                styles.confidenceBadge,
                { backgroundColor: CONFIDENCE_COLORS[targetPrediction.confidence] + '20' },
              ]}
            >
              <Text
                style={[
                  styles.confidenceText,
                  { color: CONFIDENCE_COLORS[targetPrediction.confidence] },
                ]}
              >
                {targetPrediction.confidence} confidence
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Trend graph */}
      {isPro && graphPath && (
        <View style={styles.graphContainer}>
          <Text style={styles.graphLabel}>Predicted Time Trend</Text>
          <Svg width={graphWidth} height={graphHeight}>
            {/* Grid lines */}
            <Line
              x1={graphPadding.left}
              y1={graphPadding.top}
              x2={graphPadding.left}
              y2={graphHeight - graphPadding.bottom}
              stroke={Colors.surfaceLight}
              strokeWidth={1}
            />
            <Line
              x1={graphPadding.left}
              y1={graphHeight - graphPadding.bottom}
              x2={graphWidth - graphPadding.right}
              y2={graphHeight - graphPadding.bottom}
              stroke={Colors.surfaceLight}
              strokeWidth={1}
            />

            {/* Y-axis labels */}
            <SvgText
              x={graphPadding.left - 4}
              y={graphPadding.top + 4}
              textAnchor="end"
              fontSize={9}
              fill={Colors.textMuted}
            >
              {formatTimeShort(graphPath.minTime)}
            </SvgText>
            <SvgText
              x={graphPadding.left - 4}
              y={graphHeight - graphPadding.bottom}
              textAnchor="end"
              fontSize={9}
              fill={Colors.textMuted}
            >
              {formatTimeShort(graphPath.maxTime)}
            </SvgText>

            {/* Trend line */}
            <Path
              d={graphPath.path}
              stroke={Colors.primary}
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data points */}
            {graphPath.points.map((p, i) => (
              <Circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={3}
                fill={Colors.primary}
                stroke={Colors.background}
                strokeWidth={1.5}
              />
            ))}
          </Svg>
        </View>
      )}

      {/* All predictions grid */}
      <View style={styles.predictionsGrid}>
        {currentPredictions.map((pred) => (
          <View
            key={pred.raceType}
            style={[
              styles.predictionItem,
              large && styles.predictionItemLarge,
              pred.raceType === targetRace && styles.predictionItemTarget,
            ]}
          >
            <Text style={styles.predictionLabel}>{pred.raceLabel}</Text>
            <Text style={[styles.predictionTime, !isPro && styles.blurred]}>
              {isPro ? pred.predictedTimeFormatted : '??:??'}
            </Text>
            <Text style={[styles.predictionPace, !isPro && styles.blurred]}>
              {isPro ? formatPace(pred.pacePerMile, unit) : `??:??${paceSuffix(unit)}`}
            </Text>
          </View>
        ))}
      </View>

      {/* Pro upgrade CTA */}
      {!isPro && onUpgrade && (
        <TouchableOpacity style={styles.upgradeBtn} onPress={onUpgrade} activeOpacity={0.8}>
          <Ionicons name="sparkles" size={16} color={Colors.black} />
          <Text style={styles.upgradeBtnText}>Unlock Race Predictions</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Helpers ────────────────────────────────────────────────

function formatTimeShort(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m}m`;
}

// ── Styles ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warning + '20',
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    flexShrink: 1,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    flexShrink: 1,
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accent + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  proBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.accent,
  },

  // Hero prediction
  heroPrediction: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceLight,
    marginBottom: Spacing.md,
  },
  heroLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  heroTime: {
    fontSize: FontSize.xxl + 4,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  heroMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: Spacing.md,
    rowGap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  heroPace: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  confidenceBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  confidenceText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
  },

  // Graph
  graphContainer: {
    marginBottom: Spacing.md,
  },
  graphLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Predictions grid
  predictionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  predictionItem: {
    width: '48%' as any,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  predictionItemLarge: {
    width: '100%',
  },
  predictionItemTarget: {
    borderColor: Colors.primary + '40',
    backgroundColor: Colors.primary + '08',
  },
  predictionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  predictionTime: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  predictionPace: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  blurred: {
    opacity: 0.2,
  },

  // Upgrade CTA
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.warning,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  upgradeBtnText: {
    flexShrink: 1,
    textAlign: 'center',
    color: Colors.black,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
});
