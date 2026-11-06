/**
 * Run Details screen — the permanent home for a completed workout:
 * performance (stats, route, elevation, splits), reflection (editable
 * tags and notes), achievements, and sharing (Strava, Challenge a Friend).
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  CompletedWorkout,
  formatTime,
  generateId,
  withResolvedCategory,
  WORKOUT_NOTES_MAX_LENGTH,
} from '../../src/workout/workoutTypes';
import {
  loadHistory,
  loadWorkouts,
  loadSettings,
  saveSettings,
  saveWorkout,
  withHistoryLock,
} from '../../src/workout/workoutStorage';
import { setTempWorkout } from '../../src/workout/tempWorkoutCache';
import { DEFAULT_SETTINGS } from '../../src/workout/workoutTypes';
import type { PaceUnit, SplitDistancePreset } from '../../src/pace/paceTypes';
import { RouteMap } from '../../src/components/RouteMap';
import { ElevationProfile } from '../../src/components/ElevationProfile';
import { TerrainSummary } from '../../src/components/TerrainSummary';
import { TagPicker } from '../../src/components/TagPicker';
import { analyzeElevation, aggregateByTerrain } from '../../src/pace/elevationAnalysis';
import {
  computeStats,
  detectNewRecords,
  detectNewAwards,
  type PersonalRecord,
  type AwardBadge,
} from '../../src/stats/personalRecords';
import { NewRecordsBanner } from '../../src/components/PersonalBests';
import { ChallengeFriendCard } from '../../src/components/ChallengeFriendCard';
import { RunSplits } from '../../src/components/RunSplits';
import { formatDistance } from '../../src/units/format';
import { useRunAnnotations } from '../../src/hooks/useRunAnnotations';
import { StravaPushButton } from '../../src/strava/StravaPushButton';
import { shareWorkoutResults } from '../../src/sharing/shareWorkout';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../../src/constants/theme';
import { useLargeText } from '../../src/hooks/useLargeText';

function formatDateFull(epoch: number): string {
  return new Date(epoch).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTimeOfDay(epoch: number): string {
  return new Date(epoch).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Reflection ───────────────────────────────────────────────

interface Annotations {
  tags: string[];
  notes: string;
}

/** Editable tags and notes. Mounted only once the run is loaded. */
function ReflectionSection({
  run,
  onChange,
}: {
  run: CompletedWorkout;
  onChange: (annotations: Annotations) => void;
}) {
  const { tags, notes, setTags, setNotes, flush } = useRunAnnotations(run.id, {
    tags: run.tags,
    notes: run.notes,
  });

  return (
    <View style={styles.section}>
      <TagPicker
        selected={tags}
        onChange={(next) => {
          setTags(next);
          onChange({ tags: next, notes });
        }}
      />
      <Text style={styles.notesLabel}>Notes</Text>
      <TextInput
        style={styles.notesInput}
        value={notes}
        onChangeText={(text) => {
          setNotes(text);
          onChange({ tags, notes: text });
        }}
        onBlur={flush}
        placeholder="Weather, how your legs felt, shoes, who you ran with…"
        placeholderTextColor={Colors.textMuted}
        multiline
        maxLength={WORKOUT_NOTES_MAX_LENGTH}
        textAlignVertical="top"
        accessibilityLabel="Workout notes"
      />
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────

export default function RunDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const large = useLargeText();
  const [run, setRun] = useState<CompletedWorkout | null>(null);
  const [paceUnit, setPaceUnit] = useState<PaceUnit>(DEFAULT_SETTINGS.paceUnit);
  const [splitDistance, setSplitDistance] = useState<SplitDistancePreset>(DEFAULT_SETTINGS.splitDistance);
  const [loading, setLoading] = useState(true);

  const chartWidth = screenWidth - Spacing.lg * 2;

  const [statsRecords, setStatsRecords] = useState<PersonalRecord[]>([]);
  const [runRecords, setRunRecords] = useState<PersonalRecord[]>([]);
  const [runAwards, setRunAwards] = useState<AwardBadge[]>([]);
  const [annotations, setAnnotations] = useState<Annotations>({ tags: [], notes: '' });

  useEffect(() => {
    // The lock waits for any write still in flight, such as the feeling
    // picked on the workout-complete screen just before opening this page.
    Promise.all([withHistoryLock(loadHistory), loadSettings()]).then(([history, settings]) => {
      const found = history.find((h) => h.id === id) ?? null;
      setRun(found);
      setPaceUnit(settings.paceUnit);
      setSplitDistance(settings.splitDistance);
      if (found) {
        setAnnotations({ tags: found.tags ?? [], notes: found.notes ?? '' });
        setStatsRecords(computeStats(history, settings.paceUnit).records);
        setRunRecords(detectNewRecords(history, found.id, settings.paceUnit));
        setRunAwards(detectNewAwards(history, found.id));
      }
      setLoading(false);
    });
  }, [id]);

  const elevation = useMemo(() => {
    if (!run?.route || run.route.length < 2) return null;
    return analyzeElevation(run.route);
  }, [run?.route]);

  const terrainAggs = useMemo(() => {
    if (!elevation) return [];
    return aggregateByTerrain(elevation.segments);
  }, [elevation]);

  const handleSplitDistanceChange = (preset: SplitDistancePreset) => {
    setSplitDistance(preset);
    loadSettings()
      .then((settings) => saveSettings({ ...settings, splitDistance: preset }))
      .catch(() => {});
  };

  const handleSaveToMyWorkouts = async () => {
    if (!run) return;
    const source = run.configuration
      ?? (await loadWorkouts()).find((w) => w.id === run.workoutId);
    if (source) {
      const newId = generateId();
      const copy = {
        ...withResolvedCategory(source),
        id: newId,
        name: source.name || run.workoutName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveWorkout(copy);
      router.push(`/workout/${newId}`);
    }
  };

  const handleShare = async () => {
    if (!run) return;
    const workouts = await loadWorkouts();
    const def = workouts.find((w) => w.id === run.workoutId) ?? null;
    shareWorkoutResults(def, run);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (!run) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.emptyTitle}>Run Not Found</Text>
        <Text style={styles.emptyText}>This run may have been deleted.</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: run.workoutName,
        }}
      />
      <Stack.Screen.BackButton>Training</Stack.Screen.BackButton>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.dateText}>{formatDateFull(run.completedAt)}</Text>
          <Text style={styles.timeText}>Completed at {formatTimeOfDay(run.completedAt)}</Text>
        </View>

        <Text style={[styles.groupTitle, styles.groupTitleFirst]}>Performance</Text>
        <View style={[styles.statsRow, large && styles.statsRowLarge]}>
          <View style={[styles.statCard, large && styles.statCardLarge]}>
            <Text style={styles.statValue} maxFontSizeMultiplier={MaxFontScale.display}>
              {formatTime(Math.floor(run.totalDurationMs / 1000))}
            </Text>
            <Text style={styles.statLabel}>Duration</Text>
          </View>
          {run.totalDistanceMeters != null && run.totalDistanceMeters > 0 && (
            <View style={[styles.statCard, large && styles.statCardLarge]}>
              <Text
                style={[styles.statValue, { color: Colors.accent }]}
                maxFontSizeMultiplier={MaxFontScale.display}
              >
                {formatDistance(run.totalDistanceMeters, paceUnit)}
              </Text>
              <Text style={styles.statLabel}>Distance</Text>
            </View>
          )}
          {run.splits && run.splits.length > 0 && (
            <View style={[styles.statCard, large && styles.statCardLarge]}>
              <Text style={styles.statValue} maxFontSizeMultiplier={MaxFontScale.display}>
                {run.splits.length}
              </Text>
              <Text style={styles.statLabel}>Splits</Text>
            </View>
          )}
        </View>

        {/* Route map */}
        {run.route && run.route.length >= 2 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Route</Text>
            <RouteMap
              route={run.route}
              splits={run.splits}
              paceUnit={paceUnit}
              height={280}
              records={statsRecords}
            />
          </View>
        )}

        {/* Elevation */}
        {elevation && run.route && (
          <View style={styles.section}>
            <ElevationProfile
              route={run.route}
              summary={elevation}
              paceUnit={paceUnit}
              width={chartWidth}
            />
            {terrainAggs.length > 0 && (
              <TerrainSummary aggregates={terrainAggs} paceUnit={paceUnit} />
            )}
          </View>
        )}

        <View style={styles.section}>
          <RunSplits
            intervalSplits={run.splits}
            route={run.route}
            paceUnit={paceUnit}
            splitDistance={splitDistance}
            onSplitDistanceChange={handleSplitDistanceChange}
          />
        </View>

        <Text style={styles.groupTitle}>Reflection</Text>
        <ReflectionSection run={run} onChange={setAnnotations} />

        {(runRecords.length > 0 || runAwards.length > 0) && (
          <>
            <Text style={styles.groupTitle}>Achievements</Text>
            <NewRecordsBanner records={runRecords} awards={runAwards} />
          </>
        )}

        <Text style={styles.groupTitle}>Sharing</Text>
        <StravaPushButton
          completedEntryId={run.id}
          workoutName={run.workoutName}
          workoutId={run.workoutId}
          completedAt={run.completedAt}
          totalDurationMs={run.totalDurationMs}
          totalDistanceMeters={run.totalDistanceMeters}
          route={run.route}
          splits={run.splits}
          configuration={run.configuration}
          tags={annotations.tags}
          notes={annotations.notes}
          stravaActivityId={run.stravaActivityId}
        />

        {run.configuration && (
          <View style={styles.section}>
            <ChallengeFriendCard
              workout={run.configuration}
              totalDurationMs={run.totalDurationMs}
              totalDistanceMeters={run.totalDistanceMeters}
              paceUnit={paceUnit}
            />
          </View>
        )}

        <View style={[styles.actionRow, large && styles.actionRowLarge]}>
          <TouchableOpacity
            style={[styles.actionBtn, large && styles.actionBtnLarge]}
            onPress={() => {
              if (run.configuration) {
                const draft = { ...run.configuration, id: generateId(), updatedAt: Date.now() };
                setTempWorkout(draft, { templateId: run.templateId });
                router.push(`/workout/run/${draft.id}`);
              } else {
                router.push(`/workout/run/${run.workoutId}`);
              }
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="play" size={16} color={Colors.black} />
            <Text style={styles.actionBtnText}>Repeat Workout</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtnSecondary, large && styles.actionBtnLarge]}
            onPress={handleShare}
            activeOpacity={0.7}
          >
            <Ionicons name="share-outline" size={16} color={Colors.textPrimary} />
            <Text style={styles.actionBtnSecondaryText}>Share</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.templateBtn}
          onPress={handleSaveToMyWorkouts}
          activeOpacity={0.7}
        >
          <Ionicons name="bookmark-outline" size={16} color={Colors.primary} />
          <Text style={styles.templateBtnText}>Save to My Workouts</Text>
        </TouchableOpacity>
      </ScrollView>
    </>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  header: {
    marginBottom: Spacing.lg,
  },
  dateText: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  timeText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statsRowLarge: {
    flexDirection: 'column',
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  statCardLarge: {
    flexGrow: 0,
    flexBasis: 'auto',
  },
  statValue: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  groupTitle: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.textMuted,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  groupTitleFirst: {
    marginTop: 0,
  },
  notesLabel: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  notesInput: {
    minHeight: 88,
    padding: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  actionRowLarge: {
    flexDirection: 'column',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.sm + 4,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  actionBtnLarge: {
    flexGrow: 0,
    flexBasis: 'auto',
    paddingHorizontal: Spacing.md,
  },
  actionBtnText: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.black,
  },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
    paddingVertical: Spacing.sm + 4,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  actionBtnSecondaryText: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  templateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm + 4,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.primary + '44',
    borderStyle: 'dashed',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  templateBtnText: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
  },
});
