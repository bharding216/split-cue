/**
 * Training tab — main view redesigned around "What should I run today?"
 *
 * Two states:
 *   A) No plan  → CTA to create plan + manual calendar + "Or keep planning manually"
 *   B) Active plan → Plan header, today's workout card, calendar, day detail, upcoming list
 *
 * Stats accessible via a dedicated button on the page.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect, useLocalSearchParams, type ErrorBoundaryProps } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTrainingPlan } from '../../../src/contexts/TrainingPlanContext';
import { useAuth } from '../../../src/contexts/AuthContext';
import { TrainingCalendar, CalendarViewMode } from '../../../src/components/TrainingCalendar';
import { MoveWorkoutModal } from '../../../src/components/MoveWorkoutModal';
import { DayDetail } from '../../../src/components/DayDetail';
import { NewlyPlannedHint } from '../../../src/components/NewlyPlannedHint';
import { RunReviewCard } from '../../../src/components/RunReviewCard';
import { resolvePhases } from '../../../src/components/TrainingPhases';
import { WorkoutDefinition, generateId } from '../../../src/workout/workoutTypes';
import { loadHistory } from '../../../src/workout/workoutStorage';
import { setTempWorkout } from '../../../src/workout/tempWorkoutCache';
import { planWorkoutSource } from '../../../src/analytics/workoutContext';
import { track } from '../../../src/analytics/track';
import { consumeCalendarRequest, type CalendarHighlightSource } from '../../../src/navigation/calendarFocus';
import { WorkoutPickerModal } from '../../../src/components/WorkoutPickerModal';
import { VoiceWorkoutSheet } from '../../../src/components/VoiceWorkoutSheet';
import { addWorkoutToCalendar } from '../../../src/ai/planService';
import { useStartPlanCreation } from '../../../src/hooks/useStartPlanCreation';
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
  const startPlanCreation = useStartPlanCreation();
  const large = useLargeText();
  const { user } = useAuth();
  const { plans, archivedPlans, plan, planWorkouts, dayEntries, loading, refresh, ensurePlan, removeWorkout, moveWorkout } = useTrainingPlan();

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
  const [heroCollapsed, setHeroCollapsed] = useState(false);
  const [coachCollapsed, setCoachCollapsed] = useState(false);
  const returnToPickerDate = useRef<string | null>(null);

  // Arriving from the post-run suggestion or a run reminder: jump to the day
  // and call out the workout.
  const params = useLocalSearchParams<{ date?: string; highlight?: string; from?: string; kind?: string }>();
  const [highlight, setHighlight] = useState<{ id: string; from: CalendarHighlightSource } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const dayDetailY = useRef(0);

  const focusDay = useCallback((date: string | undefined, highlightId: string | undefined, source: CalendarHighlightSource) => {
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) setSelectedDate(date);
    setHighlight(highlightId ? { id: highlightId, from: source } : null);
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


  const HERO_COLLAPSED_KEY = 'training_hero_collapsed';
  const COACH_COLLAPSED_KEY = 'training_coach_collapsed';

  useEffect(() => {
    AsyncStorage.getItem(HERO_COLLAPSED_KEY).then((val) => {
      if (val === 'true') setHeroCollapsed(true);
    });
    AsyncStorage.getItem(COACH_COLLAPSED_KEY).then((val) => {
      if (val === 'true') setCoachCollapsed(true);
    });
  }, []);

  const toggleHeroCollapsed = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHeroCollapsed((prev) => {
      const next = !prev;
      AsyncStorage.setItem(HERO_COLLAPSED_KEY, String(next));
      return next;
    });
  }, []);

  const toggleCoachCollapsed = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCoachCollapsed((prev) => {
      const next = !prev;
      AsyncStorage.setItem(COACH_COLLAPSED_KEY, String(next));
      return next;
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      if (returnToPickerDate.current) {
        setPickerDate(returnToPickerDate.current);
        returnToPickerDate.current = null;
      }
      const request = consumeCalendarRequest();
      if (request) focusDay(request.date, request.highlightId, request.from ?? 'home');
    }, [refresh, focusDay])
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
  }, []);

  const goToPrevDay = useCallback(() => {
    setSelectedDate((prev) => shiftDateKey(prev, -1));
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
    setTempWorkout(workout, { source: fromReminder ? 'reminder' : planWorkoutSource(ownerPlan), planWorkoutId });
    if (planWorkoutId && highlight?.id === planWorkoutId) setHighlight(null);
    router.push(`/workout/run/${workout.id}`);
  }, [router, planWorkouts, plans, highlight]);

  const handleRemoveWorkout = useCallback(async (workoutId: string) => {
    await removeWorkout(workoutId);
  }, [removeWorkout]);

  const handleMoveWorkout = useCallback(async (newDate: string) => {
    if (!moveTarget) return;
    setMoveTarget(null);
    await moveWorkout(moveTarget.id, newDate);
  }, [moveTarget, moveWorkout]);

  const handleEditWorkout = useCallback((workoutData: WorkoutDefinition, planWorkoutId?: string) => {
    const workout: WorkoutDefinition = {
      ...workoutData,
      id: workoutData.id || generateId(),
      updatedAt: Date.now(),
    };
    setTempWorkout(workout, { planWorkoutId });
    router.push(`/workout/${workout.id}`);
  }, [router]);

  const handleViewRun = useCallback((historyEntryId: string) => {
    router.push(`/run/${historyEntryId}` as any);
  }, [router]);

  const handleRunAgain = useCallback(async (run: import('../../../src/workout/workoutTypes').CompletedWorkout) => {
    if (run.configuration) {
      const draft = { ...run.configuration, id: generateId(), updatedAt: Date.now() };
      setTempWorkout(draft, { source: 'history_repeat', templateId: run.templateId });
      router.push(`/workout/run/${draft.id}`);
    } else {
      router.push(`/workout/run/${run.workoutId}`);
    }
  }, [router]);

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
    setPickerDate(date);
  }, []);

  const handleOpenVoiceBuilder = useCallback(() => {
    const date = pickerDate ?? selectedDate;
    setPickerDate(null);
    setVoiceDate(date);
    loadAiContext();
  }, [pickerDate, selectedDate, loadAiContext]);

  const handleVoiceClose = useCallback(() => {
    const date = voiceDate;
    setVoiceDate(null);
    setPickerDate(date);
  }, [voiceDate]);

  const handleVoiceWorkoutAccepted = useCallback(async (workout: WorkoutDefinition) => {
    if (!user || !voiceDate) return;
    setVoiceDate(null);
    const activePlan = await ensurePlan();
    await addWorkoutToCalendar(activePlan.id, user.id, voiceDate, workout, activePlan.start_date);
    await refresh();
  }, [user, voiceDate, ensurePlan, refresh]);

  const handleCreateNewForPlan = useCallback(() => {
    returnToPickerDate.current = pickerDate;
    setPickerDate(null);
    router.push(`/workout/new?addToDate=${returnToPickerDate.current}` as any);
  }, [pickerDate, router]);

  const handleWorkoutPicked = useCallback(async (workout: WorkoutDefinition) => {
    if (!user || !pickerDate) return;
    setPickerDate(null);
    const activePlan = await ensurePlan();
    await addWorkoutToCalendar(activePlan.id, user.id, pickerDate, workout, activePlan.start_date);
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
          {/* ─── State A: No active plan ─── */}
          {!hasPlan && !user && (
            coachCollapsed ? (
              <TouchableOpacity
                style={styles.coachCollapsedBar}
                onPress={toggleCoachCollapsed}
                activeOpacity={0.7}
              >
                <View style={styles.coachCollapsedLeft}>
                  <Ionicons name="sparkles" size={18} color={Colors.accent} />
                  <Text style={styles.coachCollapsedText}>Meet Your AI Running Coach</Text>
                </View>
                <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            ) : (
              <View style={styles.coachCard}>
                <View style={styles.coachIconRow}>
                  <View style={styles.coachIconBg}>
                    <Ionicons name="sparkles" size={22} color={Colors.accent} />
                  </View>
                  <Text style={styles.coachBadge}>AI-Powered</Text>
                </View>
                <Text style={styles.coachTitle}>Meet Your AI Running Coach</Text>
                <Text style={styles.coachDesc}>
                  Chat with our AI coach to set your goals, dial in your preferences, and get a personalized training plan built just for you.
                </Text>
                <View style={styles.coachFeatures}>
                  {[
                    { icon: 'chatbubbles-outline' as const, text: 'Chat naturally about your goals' },
                    { icon: 'body-outline' as const, text: 'Personalized to your fitness level' },
                    { icon: 'calendar-outline' as const, text: 'Full training plans for any race' },
                    { icon: 'refresh-outline' as const, text: 'Adjust your plan anytime via chat' },
                  ].map((f) => (
                    <View key={f.text} style={styles.coachFeatureRow}>
                      <Ionicons name={f.icon} size={16} color={Colors.primary} />
                      <Text style={styles.coachFeatureText}>{f.text}</Text>
                    </View>
                  ))}
                </View>
                <View style={[styles.coachActions, large && styles.wrapRow]}>
                  <TouchableOpacity
                    style={[styles.coachCta, large && styles.fullRowBtn]}
                    onPress={() => router.push('/login' as any)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="sparkles" size={18} color={Colors.black} />
                    <Text style={styles.coachCtaText}>Get My Plan</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.coachLaterBtn, large && styles.fullRowBtn]}
                    onPress={toggleCoachCollapsed}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.coachLaterText}>Maybe Later</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )
          )}

          {!hasPlan && user && (
            heroCollapsed ? (
              <TouchableOpacity
                style={styles.heroCollapsedBar}
                onPress={toggleHeroCollapsed}
                activeOpacity={0.7}
              >
                <View style={styles.heroCollapsedLeft}>
                  <Ionicons name="fitness-outline" size={18} color={Colors.primary} />
                  <Text style={styles.heroCollapsedText}>Create a Training Plan</Text>
                </View>
                <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            ) : (
              <View style={styles.noPlanHero}>
                <View style={styles.noPlanIconBg}>
                  <Ionicons name="fitness-outline" size={36} color={Colors.primary} />
                </View>
                <Text style={styles.noPlanTitle}>Train toward something great.</Text>
                <Text style={styles.noPlanDesc}>
                  Whether you're running your first 5K or chasing a new PR, SplitCue can build a training plan around your goals and schedule.
                </Text>
                <TouchableOpacity
                  style={styles.createPlanBtn}
                  onPress={startPlanCreation}
                  activeOpacity={0.8}
                >
                  <Ionicons name="sparkles" size={18} color={Colors.black} />
                  <Text style={styles.createPlanBtnText}>Create Training Plan</Text>
                </TouchableOpacity>

                {archivedPlans.length > 0 && (
                  <TouchableOpacity
                    style={styles.archivedLink}
                    onPress={() => router.push('/(tabs)/training/overview' as any)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="archive-outline" size={16} color={Colors.textMuted} />
                    <Text style={styles.archivedLinkText}>
                      {archivedPlans.filter((p) => p.race_type !== 'custom' || (p.outline && p.outline.length > 0)).length} archived plan{archivedPlans.filter((p) => p.race_type !== 'custom' || (p.outline && p.outline.length > 0)).length !== 1 ? 's' : ''} — Restore
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.heroDismissBtn}
                  onPress={toggleHeroCollapsed}
                  activeOpacity={0.7}
                >
                  <Text style={styles.heroDismissText}>Hide</Text>
                  <Ionicons name="chevron-up" size={14} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            )
          )}

          {/* ─── State B: Active plan ─── */}
          {hasPlan && primaryPlan && (
            <>
              {/* Plan header — tappable to view full plan */}
              <TouchableOpacity
                style={styles.planHeader}
                onPress={() => router.push('/(tabs)/training/overview' as any)}
                activeOpacity={0.7}
              >
                <View style={styles.planHeaderTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planName} numberOfLines={large ? 3 : 1}>
                      {primaryPlan.title || formatRaceLabel(primaryPlan.race_type)}
                    </Text>
                  </View>
                  <View style={styles.weekBadge}>
                    <Text style={styles.weekBadgeText}>Wk {currentWeekNumber}/{totalWeeks}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </View>

                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.min(100, (currentWeekNumber / totalWeeks) * 100)}%` }]} />
                </View>

                <View style={styles.planMeta}>
                  {currentPhase && (
                    <>
                      <Ionicons name="flag-outline" size={12} color={Colors.primary} />
                      <Text style={styles.phaseLabel}>{currentPhase.name}</Text>
                      <Text style={styles.planMetaDot}>·</Text>
                    </>
                  )}
                  <Text style={styles.planMetaText}>
                    {new Date(primaryPlan.race_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </Text>
                  <Text style={styles.planMetaDot}>·</Text>
                  <Text style={styles.planMetaText}>
                    {daysUntil(primaryPlan.race_date)}d left
                  </Text>
                </View>
              </TouchableOpacity>

              <RunReviewCard placement="training" />
            </>
          )}

          {/* Action row */}
          <View style={[styles.actionRow, large && styles.wrapRow]}>
            <TouchableOpacity
              style={[styles.addWorkoutBtn, large && styles.fullRowBtn]}
              onPress={() => handleAddWorkout(selectedDate)}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={18} color={Colors.black} />
              <Text style={styles.addWorkoutBtnText} numberOfLines={large ? undefined : 1}>Add Workout</Text>
            </TouchableOpacity>
            {hasPlan && user && (
              <TouchableOpacity
                style={[styles.addPlanBanner, large && styles.addPlanBannerGrow]}
                onPress={startPlanCreation}
                activeOpacity={0.8}
              >
                <Ionicons name="add-circle-outline" size={18} color={Colors.accent} />
                <Text style={styles.addPlanBannerText} numberOfLines={large ? undefined : 1}>Add Plan</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.statsBtn, large && styles.statsBtnLarge]}
              onPress={() => router.push('/(tabs)/training/history' as any)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="History"
            >
              <Ionicons name="time" size={18} color={Colors.primary} />
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
            onSelectDate={setSelectedDate}
            viewMode={calendarViewMode}
            onChangeViewMode={setCalendarViewMode}
            raceDates={raceDates}
            goalDates={goalDates}
            showAIWindow={hasPlan}
          />

          {/* ─── Selected day detail ─── */}
          <GestureDetector gesture={daySwipeGesture}>
            <Animated.View
              style={[styles.dayDetailSection, dayDetailAnimatedStyle]}
              onLayout={(e) => {
                dayDetailY.current = e.nativeEvent.layout.y;
              }}
            >
              <DayDetail
                entry={selectedDayEntry}
                selectedDate={selectedDate}
                onStartWorkout={handleStartWorkout}
                onRemoveWorkout={handleRemoveWorkout}
                onMoveWorkout={handleMoveWorkoutFromDay}
                onEditWorkout={handleEditWorkout}
                onViewRun={handleViewRun}
                onRunAgain={handleRunAgain}
                onAddWorkout={handleAddWorkout}
                highlightWorkoutId={highlight?.id}
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

  // ─── No-plan hero ───
  heroCollapsedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  heroCollapsedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 1,
  },
  heroCollapsedText: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  heroDismissBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm + 2,
    marginTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight,
  },
  heroDismissText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  noPlanHero: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    marginBottom: Spacing.md,
  },
  noPlanIconBg: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  noPlanTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  noPlanDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  createPlanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    alignSelf: 'stretch',
  },
  createPlanBtnText: {
    flexShrink: 1,
    textAlign: 'center',
    color: Colors.black,
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  archivedLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  archivedLinkText: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: '600',
  },

  // ─── Plan header ───
  planHeader: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  planHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  planName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  weekBadge: {
    backgroundColor: Colors.primary + '18',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 3,
  },
  weekBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
  },
  progressTrack: {
    height: 3,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 2,
    overflow: 'hidden' as const,
    marginBottom: Spacing.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  phaseLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.primary,
  },
  planMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  planMetaDot: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  planMetaText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },

  // ─── Add plan banner ───
  addPlanBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md - 2,
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  addPlanBannerGrow: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  addPlanBannerText: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },

  // ─── Day detail section ───
  dayDetailSection: {
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },

  // ─── AI Coach promo card (unauthenticated) ───
  coachCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.accent + '30',
  },
  coachIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  coachIconBg: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.accent + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachBadge: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.accent,
    backgroundColor: Colors.accent + '15',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  coachTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  coachDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  coachFeatures: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  coachFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  coachFeatureText: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
  },
  coachActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  coachCta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.xs,
  },
  coachCtaText: {
    color: Colors.black,
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  coachLaterBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 4,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  coachLaterText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  coachCollapsedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.accent + '30',
  },
  coachCollapsedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 1,
  },
  coachCollapsedText: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
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
