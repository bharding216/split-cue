/**
 * History screen — shows completed workouts.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
  useWindowDimensions,
} from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { CompletedWorkout, WorkoutDefinition, formatTime, generateId, METERS_PER_MILE } from '../../../src/workout/workoutTypes';
import { loadHistory, clearHistory, deleteHistoryEntry, updateHistoryEntry, loadWorkouts, loadSettings } from '../../../src/workout/workoutStorage';
import { setTempWorkout } from '../../../src/workout/tempWorkoutCache';
import { TagBadges, TagPicker } from '../../../src/components/TagPicker';
import { useShareSheet } from '../../../src/components/ShareSheet';
import { useAuth } from '../../../src/contexts/AuthContext';
import { onSyncStatusChange } from '../../../src/sync/cloudSync';
import { analyzeElevation, aggregateByTerrain } from '../../../src/pace/elevationAnalysis';
import { ElevationProfile } from '../../../src/components/ElevationProfile';
import { TerrainSummary } from '../../../src/components/TerrainSummary';
import { RouteMap } from '../../../src/components/RouteMap';
import { StravaPushButton } from '../../../src/strava/StravaPushButton';
import { onStravaUploaded } from '../../../src/strava/stravaService';
import { DEFAULT_SETTINGS } from '../../../src/workout/workoutTypes';
import type { PaceUnit } from '../../../src/pace/paceTypes';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../../../src/constants/theme';
import { useLargeText } from '../../../src/hooks/useLargeText';
import { SplitsTable } from '../../../src/components/SplitsTable';
import {
  distanceUnitLabel,
  distanceUnitName,
  formatDistance,
  formatPaceValue,
  paceUnitLabel,
  toDisplayDistance,
} from '../../../src/units/format';
import { computeStats } from '../../../src/stats/personalRecords';
import type { StatsSnapshot } from '../../../src/stats/personalRecords';
import { RecordsGrid, AwardsList, LifetimeStats } from '../../../src/components/PersonalBests';
import { ProgressChart } from '../../../src/components/ProgressChart';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function DeleteAction({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={styles.deleteAction}
      accessibilityRole="button"
      accessibilityLabel="Delete workout"
    >
      <Ionicons name="trash-outline" size={24} color={Colors.white} />
    </TouchableOpacity>
  );
}

const STRAVA_ORANGE = '#FC5200';

function ElevationSection({
  item,
  paceUnit,
  chartWidth,
}: {
  item: CompletedWorkout;
  paceUnit: PaceUnit;
  chartWidth: number;
}) {
  const analysis = useMemo(() => {
    if (!item.route || item.route.length < 2) return null;
    return analyzeElevation(item.route);
  }, [item.route]);

  const aggregates = useMemo(() => {
    if (!analysis) return [];
    return aggregateByTerrain(analysis.segments);
  }, [analysis]);

  if (!analysis || aggregates.length === 0) return null;

  return (
    <View>
      <ElevationProfile
        route={item.route!}
        summary={analysis}
        paceUnit={paceUnit}
        width={chartWidth}
      />
      <TerrainSummary aggregates={aggregates} paceUnit={paceUnit} />
    </View>
  );
}

type HistoryTab = 'workouts' | 'stats';

export default function HistoryScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const large = useLargeText();
  const [history, setHistory] = useState<CompletedWorkout[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [paceUnit, setPaceUnit] = useState<PaceUnit>(DEFAULT_SETTINGS.paceUnit);
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<HistoryTab>('workouts');
  const swipeableRefs = useRef<Map<string, SwipeableMethods>>(new Map());
  const workoutsRef = useRef<WorkoutDefinition[]>([]);

  // Chart width = screen width minus container padding, card padding, and accent bar
  const chartWidth = screenWidth - Spacing.md * 2 - Spacing.md * 2 - 4;

  const stats = useMemo<StatsSnapshot | null>(() => {
    if (history.length === 0) return null;
    return computeStats(history, paceUnit);
  }, [history, paceUnit]);

  const { user } = useAuth();

  const reload = useCallback(() => {
    loadHistory().then(setHistory);
    loadWorkouts().then((w) => { workoutsRef.current = w; });
    loadSettings().then((s) => setPaceUnit(s.paceUnit));
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [user?.id, reload])
  );

  useEffect(() => {
    return onStravaUploaded((entryId, activityId) => {
      setHistory((prev) =>
        prev.map((h) => (h.id === entryId ? { ...h, stravaActivityId: activityId } : h)),
      );
    });
  }, []);

  // Reload after cloud sync finishes so new-user data appears immediately
  useEffect(() => {
    return onSyncStatusChange((status) => {
      if (status === 'success') reload();
    });
  }, [reload]);

  const handleRunAgain = useCallback((item: CompletedWorkout) => {
    if (item.configuration) {
      const draft = { ...item.configuration, id: generateId(), updatedAt: Date.now() };
      setTempWorkout(draft, { source: 'history_repeat', templateId: item.templateId });
      router.push(`/workout/run/${draft.id}`);
    } else {
      router.push(`/workout/run/${item.workoutId}`);
    }
  }, [router]);

  const { openShare, shareSheet } = useShareSheet();

  const handleShare = (item: CompletedWorkout) => {
    const def = item.configuration ?? workoutsRef.current.find((w) => w.id === item.workoutId) ?? null;
    openShare({
      kind: 'results',
      workout: def,
      workoutName: item.workoutName,
      run: item,
      surface: 'history',
    });
  };

  const handleClear = () => {
    Alert.alert(
      'Clear History',
      'Delete all workout history? This can\'t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearHistory();
            setHistory([]);
          },
        },
      ]
    );
  };

  const handleDelete = (item: CompletedWorkout) => {
    Alert.alert(
      'Delete Workout',
      `Remove "${item.workoutName}" from your history?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => swipeableRefs.current.get(item.id)?.close(),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            const updated = await deleteHistoryEntry(item.id);
            setHistory(updated);
          },
        },
      ],
      { cancelable: true, onDismiss: () => swipeableRefs.current.get(item.id)?.close() },
    );
  };

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((prev) => (prev === id ? null : id));
    if (editingTagsId && editingTagsId !== id) setEditingTagsId(null);
  };

  const handleTagsChange = async (itemId: string, tags: string[]) => {
    const updated = await updateHistoryEntry(itemId, (entry) => ({
      ...entry,
      tags: tags.length > 0 ? tags : undefined,
    }));
    setHistory(updated);
  };

  const formatDate = (epoch: number) => {
    const d = new Date(epoch);
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTimeOfDay = (epoch: number) => {
    const d = new Date(epoch);
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatDuration = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    return formatTime(totalSec);
  };

  const formatPaceForChart = useCallback((v: number) => formatPaceValue(v, paceUnit), [paceUnit]);
  const formatDistForChart = useCallback(
    (miles: number) =>
      `${toDisplayDistance(miles * METERS_PER_MILE, paceUnit).toFixed(1)} ${distanceUnitLabel(paceUnit)}`,
    [paceUnit],
  );
  const formatDurForChart = useCallback((v: number) => `${Math.round(v)} min`, []);

  return (
    <View style={styles.container}>
      {/* Tab switcher — only show when there's history */}
      {history.length > 0 && (
        <View style={[styles.tabRow, large && styles.tabRowLarge]}>
          <TouchableOpacity
            style={[styles.tab, large && styles.tabLarge, activeTab === 'workouts' && styles.tabActive]}
            onPress={() => setActiveTab('workouts')}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'workouts' }}
          >
            <Ionicons
              name="time-outline"
              size={14}
              color={activeTab === 'workouts' ? Colors.primary : Colors.textMuted}
            />
            <Text style={[styles.tabLabel, activeTab === 'workouts' && styles.tabLabelActive]}>
              History
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, large && styles.tabLarge, activeTab === 'stats' && styles.tabActive]}
            onPress={() => setActiveTab('stats')}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'stats' }}
          >
            <Ionicons
              name="stats-chart-outline"
              size={14}
              color={activeTab === 'stats' ? Colors.primary : Colors.textMuted}
            />
            <Text style={[styles.tabLabel, activeTab === 'stats' && styles.tabLabelActive]}>
              Stats
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Stats tab ── */}
      {activeTab === 'stats' && stats && (
        <FlatList
          data={[1]}
          keyExtractor={() => 'stats'}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={() => (
            <View>
              <LifetimeStats
                totalWorkouts={stats.totalWorkouts}
                totalDistanceMeters={stats.totalDistanceMeters}
                totalDurationMs={stats.totalDurationMs}
              />

              <RecordsGrid records={stats.records} />

              <AwardsList awards={stats.awards} />

              {/* Progress charts */}
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
            </View>
          )}
        />
      )}

      {/* ── Workouts tab ── */}
      {activeTab === 'workouts' && (
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {user ? (
              <View style={styles.syncBanner}>
                <Ionicons name="cloud-done-outline" size={16} color={Colors.primary} />
                <Text style={styles.syncBannerText}>Your data is synced to your account</Text>
              </View>
            ) : null}

            {history.length > 0 ? (
              <View style={styles.header}>
                <Text style={styles.count}>
                  {history.length} workout{history.length !== 1 ? 's' : ''} completed
                </Text>
                <TouchableOpacity onPress={handleClear} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.clearText}>Clear All</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const isExpanded = expandedId === item.id;
          return (
            <ReanimatedSwipeable
              ref={(ref) => {
                if (ref) swipeableRefs.current.set(item.id, ref);
                else swipeableRefs.current.delete(item.id);
              }}
              friction={2}
              rightThreshold={40}
              renderRightActions={() => (
                <DeleteAction onPress={() => handleDelete(item)} />
              )}
              overshootRight={false}
              containerStyle={styles.swipeableContainer}
            >
              <View style={[styles.card, isExpanded && styles.cardExpanded]}>
                <View style={styles.cardAccent} />
                <View style={styles.cardContent}>
                  <TouchableOpacity
                    style={styles.cardHeader}
                    onPress={() => toggleExpand(item.id)}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isExpanded }}
                  >
                  <View style={styles.cardRow}>
                    <View style={styles.cardTitle}>
                      <Text style={styles.workoutName}>{item.workoutName}</Text>
                      {large && <Text style={styles.date}>{formatDate(item.completedAt)}</Text>}
                    </View>
                    {!large && <Text style={styles.date}>{formatDate(item.completedAt)}</Text>}
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-forward'}
                      size={16}
                      color={Colors.textMuted}
                      style={styles.chevron}
                    />
                  </View>
                  <View style={styles.cardMetaRow}>
                    <Text style={styles.durationText}>
                      {formatDuration(item.totalDurationMs)}
                    </Text>
                    {item.stravaActivityId != null && (
                      <View
                        style={styles.stravaBadge}
                        accessibilityLabel="Uploaded to Strava"
                      >
                        <Ionicons name="checkmark" size={12} color={STRAVA_ORANGE} />
                        <Text style={styles.stravaBadgeText}>Strava</Text>
                      </View>
                    )}
                  </View>
                  </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.expandedSection}>
                    <Text style={styles.timeOfDay}>
                      Completed at {formatTimeOfDay(item.completedAt)}
                    </Text>

                    {item.totalDistanceMeters != null && item.totalDistanceMeters > 0 && (
                      <Text style={styles.totalDistance}>
                        {formatDistance(item.totalDistanceMeters, paceUnit)}
                      </Text>
                    )}

                    {/* Tags — read-only badges or inline editor */}
                    {editingTagsId === item.id ? (
                      <View style={styles.tagEditSection}>
                        <View style={styles.tagEditHeader}>
                          <Text style={styles.tagEditTitle}>Edit Tags</Text>
                          <TouchableOpacity
                            onPress={() => setEditingTagsId(null)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel="Done editing tags"
                          >
                            <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
                          </TouchableOpacity>
                        </View>
                        <TagPicker
                          selected={item.tags ?? []}
                          onChange={(tags) => handleTagsChange(item.id, tags)}
                        />
                      </View>
                    ) : (
                      <View style={styles.tagDisplayRow}>
                        {item.tags && item.tags.length > 0 ? (
                          <TagBadges tags={item.tags} />
                        ) : null}
                        {item.notes ? (
                          <Text style={styles.notesText} numberOfLines={large ? undefined : 4}>
                            {item.notes}
                          </Text>
                        ) : null}
                        <TouchableOpacity
                          style={styles.tagEditBtn}
                          onPress={() => setEditingTagsId(item.id)}
                          activeOpacity={0.7}
                          hitSlop={8}
                        >
                          <Ionicons
                            name={item.tags?.length ? 'pricetag-outline' : 'add-circle-outline'}
                            size={14}
                            color={Colors.textMuted}
                          />
                          <Text style={styles.tagEditBtnText}>
                            {item.tags?.length ? 'Edit Tags' : 'Add Tags'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {item.splits && item.splits.length > 0 && (
                      <SplitsTable splits={item.splits} paceUnit={paceUnit} style={{ marginBottom: Spacing.md }} />
                    )}

                    {item.route && item.route.length >= 2 && (
                      <RouteMap
                        route={item.route}
                        splits={item.splits}
                        paceUnit={paceUnit}
                        height={220}
                        records={stats?.records}
                      />
                    )}

                    {item.route && item.route.length >= 2 && (
                      <ElevationSection
                        item={item}
                        paceUnit={paceUnit}
                        chartWidth={chartWidth}
                      />
                    )}

                    <View style={[styles.expandedActions, large && styles.expandedActionsLarge]}>
                      <TouchableOpacity
                        style={[styles.actionBtn, large && styles.actionBtnLarge]}
                        onPress={() => handleRunAgain(item)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="play" size={14} color={Colors.black} />
                        <Text style={styles.actionBtnLabel}>Repeat</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionBtn, large && styles.actionBtnLarge, styles.actionBtnSecondary]}
                        onPress={() => handleShare(item)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="share-outline" size={14} color={Colors.textPrimary} />
                        <Text style={styles.actionBtnLabelSecondary}>Share</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionBtn, large && styles.actionBtnLarge, styles.actionBtnSecondary]}
                        onPress={() => router.push(`/workout/${item.workoutId}`)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="create-outline" size={14} color={Colors.textPrimary} />
                        <Text style={styles.actionBtnLabelSecondary}>Edit</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.stravaRow}>
                      <StravaPushButton
                        completedEntryId={item.id}
                        workoutName={item.workoutName}
                        workoutId={item.workoutId}
                        completedAt={item.completedAt}
                        totalDurationMs={item.totalDurationMs}
                        totalDistanceMeters={item.totalDistanceMeters}
                        route={item.route}
                        splits={item.splits}
                        heartRate={item.heartRate}
                        configuration={item.configuration}
                        tags={item.tags}
                        notes={item.notes}
                        stravaActivityId={item.stravaActivityId}
                      />
                    </View>
                    </View>
                )}
                </View>
              </View>
            </ReanimatedSwipeable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="bar-chart-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle} maxFontSizeMultiplier={MaxFontScale.display}>
              No history yet
            </Text>
            <Text style={styles.emptyText}>
              Complete a workout and it'll show up here.
            </Text>
          </View>
        }
      />
      )}
      {shareSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: 3,
    gap: 3,
  },
  tabRowLarge: {
    flexDirection: 'column',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md - 2,
    gap: Spacing.xs,
  },
  tabLarge: {
    flexGrow: 0,
    flexBasis: 'auto',
  },
  tabActive: {
    backgroundColor: Colors.surfaceLight,
  },
  tabLabel: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  tabLabelActive: {
    color: Colors.primary,
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
  list: {
    padding: Spacing.md,
  },
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primary + '14',
    borderRadius: BorderRadius.md,
  },
  syncBannerText: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  count: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  clearText: {
    fontSize: FontSize.sm,
    color: Colors.danger,
    fontWeight: '600',
  },
  swipeableContainer: {
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  deleteAction: {
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.danger,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  cardExpanded: {
    borderColor: Colors.primary + '44',
  },
  cardAccent: {
    width: 4,
    backgroundColor: Colors.primary,
  },
  cardContent: {
    flex: 1,
  },
  cardHeader: {
    padding: Spacing.md,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    flex: 1,
  },
  chevron: {
    marginLeft: Spacing.sm,
  },
  workoutName: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  date: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  cardMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  durationText: {
    fontSize: FontSize.lg,
    color: Colors.accent,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  stravaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 2,
    paddingHorizontal: Spacing.xs + 2,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: STRAVA_ORANGE + '55',
    backgroundColor: STRAVA_ORANGE + '14',
  },
  stravaBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: STRAVA_ORANGE,
  },
  expandedSection: {
    marginHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight,
  },
  timeOfDay: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  totalDistance: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.accent,
    fontVariant: ['tabular-nums'],
    marginBottom: Spacing.md,
  },
  tagDisplayRow: {
    marginBottom: Spacing.md,
  },
  notesText: {
    marginTop: Spacing.xs,
    fontSize: FontSize.sm,
    lineHeight: 20,
    color: Colors.textSecondary,
  },
  tagEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  tagEditBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tagEditSection: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
  },
  tagEditHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  tagEditTitle: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  expandedActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  expandedActionsLarge: {
    flexDirection: 'column',
  },
  stravaRow: {
    marginTop: Spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  actionBtnLarge: {
    flexGrow: 0,
    flexBasis: 'auto',
    paddingHorizontal: Spacing.md,
  },
  actionBtnLabel: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.black,
  },
  actionBtnSecondary: {
    backgroundColor: Colors.surfaceLight,
  },
  actionBtnLabelSecondary: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: Spacing.xxl * 2,
  },
  emptyTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
