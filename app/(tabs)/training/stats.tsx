import React, { useMemo, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTrainingPlan } from '../../../src/contexts/TrainingPlanContext';
import { computeStats } from '../../../src/stats/personalRecords';
import type { StatsSnapshot } from '../../../src/stats/personalRecords';
import { RecordsGrid, AwardsList, LifetimeStats } from '../../../src/components/PersonalBests';
import { ProgressChart } from '../../../src/components/ProgressChart';
import { Colors, Spacing, FontSize, MaxFontScale } from '../../../src/constants/theme';
import { useUnits } from '../../../src/hooks/useUnits';
import { METERS_PER_MILE } from '../../../src/workout/workoutTypes';
import {
  distanceUnitLabel,
  distanceUnitName,
  formatPaceValue,
  paceUnitLabel,
  toDisplayDistance,
} from '../../../src/units/format';

export default function StatsScreen() {
  const { history } = useTrainingPlan();
  const paceUnit = useUnits();
  const { width: screenWidth } = useWindowDimensions();

  const stats = useMemo<StatsSnapshot | null>(() => {
    if (history.length === 0) return null;
    return computeStats(history, paceUnit);
  }, [history, paceUnit]);

  const chartWidth = Math.min(320, screenWidth - Spacing.md * 2);

  const formatPaceForChart = useCallback((v: number) => formatPaceValue(v, paceUnit), [paceUnit]);
  const formatDistForChart = useCallback(
    (miles: number) =>
      `${toDisplayDistance(miles * METERS_PER_MILE, paceUnit).toFixed(1)} ${distanceUnitLabel(paceUnit)}`,
    [paceUnit],
  );
  const formatDurForChart = useCallback((v: number) => `${Math.round(v)} min`, []);

  if (!stats) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.emptyContainer}
      >
        <Ionicons name="stats-chart-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.emptyTitle} maxFontSizeMultiplier={MaxFontScale.display}>
          No stats yet
        </Text>
        <Text style={styles.emptyText}>
          Complete some workouts to see your stats and progress.
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <LifetimeStats
        totalWorkouts={stats.totalWorkouts}
        totalDistanceMeters={stats.totalDistanceMeters}
        totalDurationMs={stats.totalDurationMs}
      />
      <RecordsGrid records={stats.records} />
      <AwardsList awards={stats.awards} />
      <View style={styles.chartsSection}>
        <Text style={styles.chartsSectionTitle}>Progress Over Time</Text>
        <ProgressChart
          data={stats.paceTrend}
          title={`Pace (${paceUnitLabel(paceUnit)})`}
          formatValue={formatPaceForChart}
          lowerIsBetter
          width={chartWidth}
          color={Colors.primary}
        />
        <ProgressChart
          data={stats.distanceTrend}
          title={`Distance (${distanceUnitName(paceUnit).toLowerCase()})`}
          formatValue={formatDistForChart}
          width={chartWidth}
          color={Colors.accent}
        />
        <ProgressChart
          data={stats.durationTrend}
          title="Duration (minutes)"
          formatValue={formatDurForChart}
          width={chartWidth}
          color={Colors.warning}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl * 2,
  },
  chartsSection: {
    marginTop: Spacing.md,
  },
  chartsSectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  emptyContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
  },
  emptyTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
});
