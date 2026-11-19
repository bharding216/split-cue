/**
 * Calendar tab — the runner's central timeline.
 *
 * Shows completed runs and scheduled workouts on a calendar.
 * Tapping a completed run opens its detail. Tapping a scheduled workout
 * lets the user preview, edit, or start it. Stats & History accessible
 * from action buttons.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Share,
  UIManager,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useRouter, useFocusEffect, useLocalSearchParams, type ErrorBoundaryProps } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTrainingPlan } from '../../../src/contexts/TrainingPlanContext';
import { useAuth } from '../../../src/contexts/AuthContext';
import { TrainingCalendar, CalendarViewMode } from '../../../src/components/TrainingCalendar';
import { MoveWorkoutModal } from '../../../src/components/MoveWorkoutModal';
import { DayDetail } from '../../../src/components/DayDetail';
import { NewlyPlannedHint } from '../../../src/components/NewlyPlannedHint';
import { resolvePhases } from '../../../src/components/TrainingPhases';
import { WorkoutDefinition, generateId } from '../../../src/workout/workoutTypes';
import { loadHistory, loadSettings } from '../../../src/workout/workoutStorage';
import { setTempWorkout } from '../../../src/workout/tempWorkoutCache';
import { planWorkoutSource } from '../../../src/analytics/workoutContext';
import { track } from '../../../src/analytics/track';
import { consumeCalendarRequest, type CalendarHighlightSource } from '../../../src/navigation/calendarFocus';
import { WorkoutPickerModal } from '../../../src/components/WorkoutPickerModal';
import { VoiceWorkoutSheet } from '../../../src/components/VoiceWorkoutSheet';
import { addWorkoutToCalendar } from '../../../src/ai/planService';
import { supabase } from '../../../src/analytics/supabaseClient';
import { buildHistorySummary } from '../../../src/ai/historySummary';
import type { AIContext } from '../../../src/ai/aiWorkoutService';
import { Colors, Spacing, FontSize, BorderRadius } from '../../../src/constants/theme';
import { useLargeText } from '../../../src/hooks/useLargeText';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftDateKey(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DAY_SWIPE_THRESHOLD = 50;

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

function formatRaceLabel(raceType: string): string {
  switch (raceType) {
    case '5k': return '5K';
    case '10k': return '10K';
    case 'half_marathon': return 'Half Marathon';
    case 'marathon': return 'Marathon';
    default: return 'Training';
  }
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    console.warn('Training screen error:', error);
  }, [error]);

  return (
    <View style={styles.centered}>
      <Ionicons name="alert-circle-outline" size={36} color={Colors.textMuted} />
      <Text style={styles.emptyTitle}>Something went wrong</Text>
      <Text style={styles.emptyText}>The training view couldn't load.</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={retry} activeOpacity={0.8}>
        <Text style={styles.retryBtnText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function TrainingScreen() {
  const router = useRouter();
  const large = useLargeText();
  const { user } = useAuth();
  const { plans, archivedPlans, plan, planWorkouts, dayEntries, loading, refreshing, refresh, ensurePlan, removeWorkout, moveWorkout } = useTrainingPlan();

  // Include all "real" training plans: non-custom race plans, plus custom-distance
  // plans created through the setup wizard (which have an outline). Exclude the
  // lightweight utility plan created by ensureCustomPlan for manual workout additions.
  const racePlans = useMemo(
    () => plans.filter((p) => p.race_type !== 'custom' || (p.outline && p.outline.length > 0)),
    [plans],
  );

  const raceDates = useMemo(
    () => racePlans.filter((p) => p.race_date && (p.goal_type ?? 'race') === 'race').map((p) => p.race_date),
    [racePlans],
  );

  const goalDates = useMemo(
    () => racePlans.filter((p) => p.race_date && p.goal_type === 'pace_target').map((p) => p.race_date),
    [racePlans],
  );

  const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>('month');
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [pickerDate, setPickerDate] = useState<string | null>(null);
  const [voiceDate, setVoiceDate] = useState<string | null>(null);
  const [aiContext, setAiContext] = useState<AIContext | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ id: string; date: string; label: string } | null>(null);

  // Arriving from the post-run suggestion or a run reminder: jump to the day
  // and call out the workout.
  const params = useLocalSearchParams<{ date?: string; highlight?: string; from?: string; kind?: string }>();
  const [highlight, setHighlight] = useState<{ id: string; from: CalendarHighlightSource } | null>(null);
  const [highlightRunId, setHighlightRunId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const dayDetailY = useRef(0);

  const focusDay = useCallback((date: string | undefined, highlightId: string | undefined, source: CalendarHighlightSource, runId?: string) => {
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) setSelectedDate(date);
    setHighlight(highlightId ? { id: highlightId, from: source } : null);
    setHighlightRunId(runId ?? null);
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, dayDetailY.current - Spacing.lg), animated: true }), 350);
  }, []);

  useEffect(() => {
    const { date, highlight: highlightId, from, kind } = params;
    if (!date && !highlightId) return;
    const source = from === 'reminder' ? 'reminder' : 'suggestion';
    focusDay(date, highlightId, source);
    if (highlightId && source === 'reminder') track('run_reminder_opened', { kind: kind ?? 'morning' });
    router.setParams({ date: undefined, highlight: undefined, from: undefined, kind: undefined });
  }, [params.date, params.highlight]);


  useFocusEffect(
    useCallback(() => {
      refresh();
      const request = consumeCalendarRequest();
      if (request) {
        focusDay(request.date, request.highlightId, request.from ?? 'home', request.highlightRunId);
      } else {
        track('training_screen_viewed', {
          has_plan: racePlans.length > 0,
          plan_count: racePlans.length,
          signed_in: !!user,
        });
      }
    }, [refresh, focusDay, racePlans.length, user])
  );

  // Primary plan info
  const primaryPlan = racePlans[0] ?? null;
  const currentWeekNumber = useMemo(() => {
    if (!primaryPlan) return 0;
    const today = new Date();
    const start = new Date(primaryPlan.start_date);
    const diffMs = today.getTime() - start.getTime();
    return Math.max(1, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));
  }, [primaryPlan]);

  const totalWeeks = useMemo(() => {
    if (!primaryPlan) return 0;
    const start = new Date(primaryPlan.start_date);
    const end = new Date(primaryPlan.race_date);
    return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  }, [primaryPlan]);

  const currentPhase = useMemo(() => {
    if (!primaryPlan) return null;
    const phases = resolvePhases(primaryPlan.outline, primaryPlan.phases, currentWeekNumber);
    return phases.find((p) => p.status === 'current') ?? null;
  }, [primaryPlan, currentWeekNumber]);

  // Selected day entry
  const selectedDayEntry = dayEntries[selectedDate];
  const highlightedWorkout = highlight ? planWorkouts.find((pw) => pw.id === highlight.id) : undefined;

  // ── Swipe day detail left/right to change the selected day ──
  const { width: screenWidth } = useWindowDimensions();
  const dayTranslateX = useSharedValue(0);

  const goToNextDay = useCallback(() => {
    setSelectedDate((prev) => shiftDateKey(prev, 1));
    setHighlightRunId(null);
  }, []);

  const goToPrevDay = useCallback(() => {
    setSelectedDate((prev) => shiftDateKey(prev, -1));
    setHighlightRunId(null);
  }, []);

  const daySwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])
        .failOffsetY([-15, 15])
        .onUpdate((e) => {
          dayTranslateX.value = e.translationX * 0.4;
        })
        .onEnd((e) => {
          if (e.translationX < -DAY_SWIPE_THRESHOLD) {
            dayTranslateX.value = withTiming(-screenWidth, { duration: 150 }, () => {
              runOnJS(goToNextDay)();
              dayTranslateX.value = screenWidth;
              dayTranslateX.value = withTiming(0, { duration: 200 });
            });
          } else if (e.translationX > DAY_SWIPE_THRESHOLD) {
            dayTranslateX.value = withTiming(screenWidth, { duration: 150 }, () => {
              runOnJS(goToPrevDay)();
              dayTranslateX.value = -screenWidth;
              dayTranslateX.value = withTiming(0, { duration: 200 });
            });
          } else {
            dayTranslateX.value = withTiming(0, { duration: 150 });
          }
        }),
    [dayTranslateX, screenWidth, goToNextDay, goToPrevDay],
  );

  const dayDetailAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dayTranslateX.value }],
  }));


  const handleStartWorkout = useCallback((workoutData: WorkoutDefinition, planWorkoutId?: string) => {
    const workout: WorkoutDefinition = {
      ...workoutData,
      id: workoutData.id || generateId(),
      updatedAt: Date.now(),
    };
    const pw = planWorkoutId ? planWorkouts.find((w) => w.id === planWorkoutId) : undefined;
    const ownerPlan = pw ? plans.find((p) => p.id === pw.plan_id) : undefined;
    const fromReminder = !!planWorkoutId && highlight?.id === planWorkoutId && highlight.from === 'reminder';
    track('training_workout_started', {
      workout_id: workout.id,
      workout_name: workout.name,
      plan_workout_id: planWorkoutId ?? null,
      date: selectedDate,
    });
    setTempWorkout(workout, { source: fromReminder ? 'reminder' : planWorkoutSource(ownerPlan), planWorkoutId });
    if (planWorkoutId && highlight?.id === planWorkoutId) setHighlight(null);
    router.push(`/workout/run/${workout.id}`);
  }, [router, planWorkouts, plans, highlight, selectedDate]);

  const handleRemoveWorkout = useCallback(async (workoutId: string) => {
    track('training_workout_removed', { plan_workout_id: workoutId, date: selectedDate });
    await removeWorkout(workoutId);
  }, [removeWorkout, selectedDate]);

  const handleMoveWorkout = useCallback(async (newDate: string) => {
    if (!moveTarget) return;
    track('training_workout_moved', {
      plan_workout_id: moveTarget.id,
      from_date: moveTarget.date,
      to_date: newDate,
    });
    setMoveTarget(null);
    await moveWorkout(moveTarget.id, newDate);
  }, [moveTarget, moveWorkout]);

  const handleEditWorkout = useCallback((workoutData: WorkoutDefinition, planWorkoutId?: string) => {
    const workout: WorkoutDefinition = {
      ...workoutData,
      id: workoutData.id || generateId(),
      updatedAt: Date.now(),
    };
    track('training_workout_edited', {
      workout_id: workout.id,
      workout_name: workout.name,
      plan_workout_id: planWorkoutId ?? null,
      date: selectedDate,
    });
    setTempWorkout(workout, { planWorkoutId });
    router.push(`/workout/${workout.id}`);
  }, [router, selectedDate]);

  const handleShareWorkout = useCallback(async (workoutData: WorkoutDefinition, plannedDate: string) => {
    const { describeWorkoutBlocks, formatWorkoutSummary, formatPlannedDate } = await import('../../../src/sharing/shareText');
    const settings = await loadSettings().catch(() => ({ paceUnit: 'minPerMile' as const }));
    const name = workoutData.name;
    const lines = [
      `${name} — ${formatPlannedDate(plannedDate)}`,
      formatWorkoutSummary(workoutData),
      ...describeWorkoutBlocks(workoutData, settings.paceUnit),
      '',
      'SplitCue',
    ];
    track('training_workout_shared', { workout_name: name, date: plannedDate });
    Share.share(
      Platform.OS === 'ios'
        ? { message: lines.join('\n') }
        : { message: lines.join('\n'), title: `Share ${name}` },
    );
  }, []);

  const handleViewRun = useCallback((historyEntryId: string) => {
    track('training_run_viewed', { entry_id: historyEntryId, date: selectedDate });
    router.push(`/run/${historyEntryId}` as any);
  }, [router, selectedDate]);

  const handleRunAgain = useCallback(async (run: import('../../../src/workout/workoutTypes').CompletedWorkout) => {
    track('training_run_repeated', {
      entry_id: run.id,
      workout_name: run.workoutName,
      date: selectedDate,
    });
    if (run.configuration) {
      const draft = { ...run.configuration, id: generateId(), updatedAt: Date.now() };
      setTempWorkout(draft, { source: 'history_repeat', templateId: run.templateId });
      router.push(`/workout/run/${draft.id}`);
    } else {
      router.push(`/workout/run/${run.workoutId}`);
    }
  }, [router, selectedDate]);

  const handleMoveWorkoutFromDay = useCallback((workoutId: string) => {
    const pw = planWorkouts.find((w) => w.id === workoutId);
    if (pw) {
      setMoveTarget({ id: pw.id, date: pw.date, label: pw.day_label || 'Training' });
    }
  }, [planWorkouts]);

  // Load AI context for voice builder (lazy — only when needed)
  const loadAiContext = useCallback(async () => {
    if (aiContext || !user) return;
    try {
      const [{ data: profile }, { data: prefs }, history] = await Promise.all([
        supabase.from('running_profiles').select('*').eq('user_id', user.id).single(),
        supabase.from('running_preferences').select('content, category').eq('user_id', user.id),
        loadHistory(),
      ]);
      setAiContext({
        experienceLevel: profile?.experience_level,
        typicalRunMinutes: profile?.typical_run_minutes,
        easyPace: profile?.easy_pace,
        fastPace: profile?.fast_pace,
        goals: (prefs ?? []).filter((p: any) => p.category === 'goal').map((p: any) => p.content),
        preferences: (prefs ?? []).filter((p: any) => p.category === 'preference').map((p: any) => p.content),
        historySummary: buildHistorySummary(history),
      });
    } catch (err) {
      console.warn('Failed to load AI context:', err);
    }
  }, [aiContext, user]);

  const handleAddWorkout = useCallback((date: string) => {
    track('training_add_workout_tapped', { date });
    setPickerDate(date);
  }, []);

  const handleOpenVoiceBuilder = useCallback(() => {
    const date = pickerDate ?? selectedDate;
    setPickerDate(null);
    setVoiceDate(date);
    track('training_voice_builder_opened', { date });
    loadAiContext();
  }, [pickerDate, selectedDate, loadAiContext]);

  const handleVoiceClose = useCallback(() => {
    const date = voiceDate;
    setVoiceDate(null);
    setPickerDate(date);
  }, [voiceDate]);

  const handleVoiceWorkoutAccepted = useCallback(async (workout: WorkoutDefinition) => {
    if (!user || !voiceDate) return;
    const date = voiceDate;
    setVoiceDate(null);
    const activePlan = await ensurePlan();
    await addWorkoutToCalendar(activePlan.id, user.id, date, workout, activePlan.start_date);
    track('training_workout_added', {
      workout_id: workout.id,
      workout_name: workout.name,
      date,
      source: 'voice_builder',
    });
    await refresh();
  }, [user, voiceDate, ensurePlan, refresh]);

  const handleCreateNewForPlan = useCallback(() => {
    track('training_create_new_tapped', { date: pickerDate });
    const date = pickerDate;
    setPickerDate(null);
    router.push(`/workout/new?addToDate=${date}` as any);
  }, [pickerDate, router]);

  const handleWorkoutPicked = useCallback(async (workout: WorkoutDefinition) => {
    if (!user || !pickerDate) return;
    const date = pickerDate;
    setPickerDate(null);
    const activePlan = await ensurePlan();
    await addWorkoutToCalendar(activePlan.id, user.id, date, workout, activePlan.start_date);
    track('training_workout_added', {
      workout_id: workout.id,
      workout_name: workout.name,
      date,
      source: 'picker',
    });
    await refresh();
  }, [user, pickerDate, ensurePlan, refresh]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const hasPlan = racePlans.length > 0;

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
          {/* Compact plan banner for existing plan users */}
          {hasPlan && primaryPlan && !refreshing && (
            <TouchableOpacity
              style={styles.planBanner}
              onPress={() => router.push('/(tabs)/training/overview' as any)}
              activeOpacity={0.7}
            >
              <View style={styles.planBannerLeft}>
                <Ionicons name="fitness-outline" size={16} color={Colors.primary} />
                <Text style={styles.planBannerText} numberOfLines={1}>
                  {primaryPlan.title || formatRaceLabel(primaryPlan.race_type)}
                </Text>
              </View>
              <View style={styles.planBannerRight}>
                <Text style={styles.planBannerMeta}>
                  Wk {currentWeekNumber}/{totalWeeks}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
              </View>
            </TouchableOpacity>
          )}

          {/* Action row */}
          <View style={[styles.actionRow, large && styles.wrapRow]}>
            <TouchableOpacity
              style={[styles.addWorkoutBtn, large && styles.fullRowBtn]}
              onPress={() => handleAddWorkout(selectedDate)}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={18} color={Colors.black} />
              <Text style={styles.addWorkoutBtnText} numberOfLines={large ? undefined : 1}>Schedule Workout</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.statsBtn, large && styles.statsBtnLarge]}
              onPress={() => router.push('/(tabs)/training/history' as any)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="History"
            >
              <MaterialIcons name="history" size={20} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.statsBtn, large && styles.statsBtnLarge]}
              onPress={() => router.push('/(tabs)/training/stats' as any)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Stats"
            >
              <Ionicons name="stats-chart" size={18} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Calendar */}
          <TrainingCalendar
            dayEntries={dayEntries}
            selectedDate={selectedDate}
            onSelectDate={(date) => { setSelectedDate(date); setHighlightRunId(null); }}
            viewMode={calendarViewMode}
            onChangeViewMode={(mode) => { setCalendarViewMode(mode); track('training_view_mode_changed', { mode }); }}
            raceDates={raceDates}
            goalDates={goalDates}
          />

          {/* ─── Selected day detail ─── */}
          <GestureDetector gesture={daySwipeGesture}>
            <Animated.View
              style={[styles.dayDetailSection, dayDetailAnimatedStyle]}
              onLayout={(e) => {
                dayDetailY.current = e.nativeEvent.layout.y;
              }}
            >
              {refreshing && hasPlan ? (
                /* Skeleton for day detail while cached data is being replaced */
                <View style={{ gap: Spacing.sm }}>
                  <SkeletonBlock width="50%" height={18} />
                  <View style={[styles.dayDetailSkeleton]}>
                    <SkeletonBlock width="30%" height={14} />
                    <SkeletonBlock width="70%" height={20} style={{ marginTop: Spacing.xs }} />
                    <SkeletonBlock width="45%" height={12} style={{ marginTop: Spacing.sm }} />
                    <SkeletonBlock width="100%" height={48} style={{ marginTop: Spacing.md }} borderRadius={BorderRadius.md} />
                  </View>
                </View>
              ) : (
                <DayDetail
                  entry={selectedDayEntry}
                  selectedDate={selectedDate}
                  onStartWorkout={handleStartWorkout}
                  onRemoveWorkout={handleRemoveWorkout}
                  onMoveWorkout={handleMoveWorkoutFromDay}
                  onEditWorkout={handleEditWorkout}
                  onShareWorkout={handleShareWorkout}
                  onViewRun={handleViewRun}
                  onRunAgain={handleRunAgain}
                  onAddWorkout={handleAddWorkout}
                  highlightWorkoutId={highlight?.id}
                  highlightRunId={highlightRunId}
                  highlightContent={
                    highlightedWorkout && highlight?.from === 'suggestion' ? (
                      <NewlyPlannedHint
                        planWorkoutId={highlightedWorkout.id}
                        date={highlightedWorkout.date}
                        workoutName={
                          (highlightedWorkout.workout_data as WorkoutDefinition | null)?.name ??
                          highlightedWorkout.day_label ??
                          'Your run'
                        }
                        onDismiss={() => setHighlight(null)}
                      />
                    ) : null
                  }
                />
              )}
            </Animated.View>
          </GestureDetector>


        </ScrollView>

      {/* Workout picker modal */}
      <WorkoutPickerModal
        visible={pickerDate !== null}
        date={pickerDate ?? selectedDate}
        onSelect={handleWorkoutPicked}
        onCreateNew={handleCreateNewForPlan}
        onVoiceBuilder={user ? handleOpenVoiceBuilder : undefined}
        onDateChange={setPickerDate}
        onClose={() => setPickerDate(null)}
      />

      {/* Voice workout builder — mounted only while open so the native recorder isn't created on tab load */}
      {voiceDate !== null && (
        <VoiceWorkoutSheet
          visible
          date={voiceDate}
          aiContext={aiContext}
          onAccept={handleVoiceWorkoutAccepted}
          onClose={handleVoiceClose}
        />
      )}

      {/* Move workout modal */}
      {moveTarget && (
        <MoveWorkoutModal
          visible={!!moveTarget}
          currentDate={moveTarget.date}
          workoutLabel={moveTarget.label}
          dayEntries={dayEntries}
          onMove={handleMoveWorkout}
          onClose={() => setMoveTarget(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  addWorkoutBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  addWorkoutBtnText: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.black,
  },
  statsBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md - 2,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  statsBtnLarge: {
    flexGrow: 1,
    minHeight: 48,
  },
  wrapRow: {
    flexWrap: 'wrap',
  },
  fullRowBtn: {
    flexBasis: '100%',
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl * 2,
  },

  // ─── Compact plan banner ───
  planBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  planBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  planBannerText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
    flex: 1,
  },
  planBannerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  planBannerMeta: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
  },

  // ─── Day detail section ───
  dayDetailSection: {
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  dayDetailSkeleton: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },

  // ─── Empty ───
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
  retryBtn: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.xl,
  },
  retryBtnText: {
    color: Colors.black,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
