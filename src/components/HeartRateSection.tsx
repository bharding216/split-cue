/**
 * HeartRateSection — Run Details heart rate: overall average and max plus
 * the heart rate graph for everyone, and per-interval analysis for Pro.
 *
 * Free runners see a preview of the interval table with the values hidden.
 * Per-interval stats are saved with every run, so upgrading reveals them for
 * past runs too.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
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
  const [dropInfoVisible, setDropInfoVisible] = useState(false);

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
            <TouchableOpacity
              style={styles.dropHeader}
              onPress={() => setDropInfoVisible(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="What is Drop?"
            >
              <Text style={styles.dropHeaderText} maxFontSizeMultiplier={CELL_FONT_SCALE}>Drop</Text>
              <Ionicons name="information-circle-outline" size={13} color={Colors.textMuted} />
            </TouchableOpacity>
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
          {isPro ? null : (
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

      <Modal visible={dropInfoVisible} animationType="slide" transparent onRequestClose={() => setDropInfoVisible(false)}>
        <View style={styles.infoOverlay}>
          <TouchableOpacity style={styles.infoBackdrop} onPress={() => setDropInfoVisible(false)} activeOpacity={1} />
          <View style={styles.infoSheet}>
            <View style={styles.infoHandleRow}>
              <View style={styles.infoHandle} />
            </View>
            <View style={styles.infoHeader}>
              <Text style={styles.infoTitle}>How is Drop calculated?</Text>
              <TouchableOpacity
                onPress={() => setDropInfoVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.infoBody}>
              <Text style={styles.infoText}>
                Drop measures how far your heart rate fell during a recovery interval. It only appears on recovery and rest segments.
              </Text>
              <View style={styles.infoCard}>
                <View style={styles.infoStep}>
                  <View style={[styles.infoStepDot, { backgroundColor: Colors.danger }]} />
                  <View style={styles.infoStepContent}>
                    <Text style={styles.infoStepLabel}>Peak</Text>
                    <Text style={styles.infoStepDesc}>
                      Your highest heart rate in the first 15 seconds of the recovery. Heart rate keeps climbing briefly after an effort ends, so this captures the true peak.
                    </Text>
                  </View>
                </View>
                <View style={styles.infoStep}>
                  <View style={[styles.infoStepDot, { backgroundColor: Colors.primary }]} />
                  <View style={styles.infoStepContent}>
                    <Text style={styles.infoStepLabel}>End</Text>
                    <Text style={styles.infoStepDesc}>
                      Your average heart rate over the last 5 seconds of the recovery, smoothed to reduce single-beat noise.
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.infoFormulaRow}>
                <Text style={styles.infoFormula}>Drop = Peak − End</Text>
              </View>
              <Text style={styles.infoNote}>
                Recoveries shorter than 20 seconds won't show a Drop value — there isn't enough time for a meaningful measurement.
              </Text>
              <Text style={styles.infoNote}>
                A larger drop means your heart rate recovered more quickly, which is generally a sign of good cardiovascular fitness.
              </Text>
            </View>
          </View>
        </View>
      </Modal>
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
  dropHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 52,
    gap: 2,
  },
  dropHeaderText: {
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

  // Drop info sheet
  infoOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  infoBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  infoSheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight,
    paddingBottom: Spacing.xl,
  },
  infoHandleRow: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
  },
  infoHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  infoTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  infoBody: {
    paddingHorizontal: Spacing.lg,
  },
  infoText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 21,
    marginBottom: Spacing.md,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  infoStep: {
    flexDirection: 'row',
    gap: Spacing.sm + 2,
  },
  infoStepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  infoStepContent: {
    flex: 1,
  },
  infoStepLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  infoStepDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  infoFormulaRow: {
    alignItems: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 4,
  },
  infoFormula: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  infoNote: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
});
