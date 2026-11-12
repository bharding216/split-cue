/**
 * Home screen — categorized workout list with collapsible sections.
 * Categories: Easy/Recovery, Tempo, Intervals, Long Runs, Race/Time Trial.
 * Users can long-press and drag to reorder workouts within a category.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
  Dimensions,
} from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  WorkoutDefinition,
  CompletedWorkout,
  categorizeWorkout,
  WorkoutCategory,
  generateId,
  totalWorkoutSeconds,
  formatTime,
  type QuickStartType,
} from '../../src/workout/workoutTypes';
import { loadWorkouts, loadHistory, deleteWorkout, saveWorkouts } from '../../src/workout/workoutStorage';
import { setTempWorkout, type WorkoutSource } from '../../src/workout/tempWorkoutCache';
import { WorkoutCard } from '../../src/components/WorkoutCard';
import { useShareSheet } from '../../src/components/ShareSheet';
import { QUICK_START_TILES, quickStartFactory, firstRunWorkout } from '../../src/workout/quickStartDefaults';
import { FirstRunCard } from '../../src/components/FirstRunCard';
import { hapticTap } from '../../src/audio/haptics';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTrainingPlan } from '../../src/contexts/TrainingPlanContext';
import { TodayWorkoutCard } from '../../src/components/TodayWorkoutCard';
import { NextRunCard } from '../../src/components/NextRunCard';
import { LapsedSurveySheet } from '../../src/components/LapsedSurveySheet';
import { historyEntryQualifies } from '../../src/analytics/workoutContext';
import { track } from '../../src/analytics/track';
import { requestCalendarDate } from '../../src/navigation/calendarFocus';
import type { PlanWorkout } from '../../src/types/database';
import { RecentRunsSheet, formatRelativeDate } from '../../src/components/RecentRunsSheet';
import { Running101Sheet } from '../../src/components/Running101Sheet';
import { onSyncStatusChange } from '../../src/sync/cloudSync';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../../src/constants/theme';
import { useLargeText } from '../../src/hooks/useLargeText';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface CategoryConfig {
  key: WorkoutCategory;
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  description: string;
  color: string;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DRAG_EDGE = 88;

function stackOffset(id: string, order: readonly string[], heights: Record<string, number>): number {
  'worklet';
  let y = 0;
  for (let i = 0; i < order.length; i++) {
    if (order[i] === id) return y;
    y += heights[order[i]] ?? 0;
  }
  return y;
}

function buildTops(
  resting: readonly string[],
  display: readonly string[],
  heights: Record<string, number>,
  activeId: string | null,
  dragOffset: number,
): Record<string, number> {
  const tops: Record<string, number> = {};
  for (let i = 0; i < resting.length; i++) {
    const id = resting[i];
    tops[id] = id === activeId
      ? stackOffset(id, resting, heights) + dragOffset
      : stackOffset(id, activeId ? display : resting, heights);
  }
  return tops;
}

function moveId(order: readonly string[], id: string, to: number): string[] {
  const from = order.indexOf(id);
  if (from < 0 || from === to) return order.slice();
  const next = order.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function slotFromTranslation(from: number, translation: number, heights: readonly number[]): number {
  let slot = from;
  let consumed = 0;
  if (translation > 0) {
    while (slot < heights.length - 1) {
      const step = heights[slot + 1] || 1;
      if (translation - consumed > step * 0.5) {
        consumed += step;
        slot += 1;
      } else {
        break;
      }
    }
  } else {
    while (slot > 0) {
      const step = heights[slot - 1] || 1;
      if (consumed - translation > step * 0.5) {
        consumed += step;
        slot -= 1;
      } else {
        break;
      }
    }
  }
  return slot;
}

function CategoryWorkoutList({
  items,
  scrollRef,
  scrollY,
  onReorder,
  onStart,
  onEdit,
  onDelete,
  onShare,
}: {
  items: WorkoutDefinition[];
  scrollRef: React.RefObject<ScrollView | null>;
  scrollY: React.MutableRefObject<number>;
  onReorder: (ordered: WorkoutDefinition[]) => void;
  onStart: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onShare: (workout: WorkoutDefinition) => void;
}) {
  const [data, setData] = useState(items);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [positioned, setPositioned] = useState(false);
  const [listHeight, setListHeight] = useState(0);
  const dataRef = useRef(items);
  const dragging = useRef(false);
  const heightMap = useRef<Record<string, number>>({});
  const scrollDir = useRef(0);
  const scrollBoost = useRef(0);
  const fingerY = useRef(0);
  const suppressEdit = useRef(false);
  const activeDragId = useRef<string | null>(null);
  const layoutLocked = useRef(false);
  const restingOrder = useSharedValue<string[]>(items.map((item) => item.id));
  const displayOrder = useSharedValue<string[]>(items.map((item) => item.id));
  const [baseline, setBaseline] = useState<Record<string, number>>({});
  const tops = useSharedValue<Record<string, number>>({});
  const baselineSV = useSharedValue<Record<string, number>>({});
  const activeIdSV = useSharedValue<string | null>(null);
  const positionedSV = useSharedValue(false);

  useLayoutEffect(() => {
    if (!positioned) {
      positionedSV.value = false;
      return;
    }
    // Apply the locked offsets and the absolute-position flag together, after
    // React has committed `top`, so the first painted frame is already correct.
    baselineSV.value = baseline;
    if (!dragging.current && activeIdSV.value == null) {
      tops.value = baseline;
      const ids = dataRef.current.map((workout) => workout.id);
      restingOrder.value = ids;
      displayOrder.value = ids;
    }
    positionedSV.value = true;
  }, [activeIdSV, baseline, baselineSV, displayOrder, positioned, positionedSV, restingOrder, tops]);

  const syncIdleLayout = useCallback((ids: string[]) => {
    const nextTops = buildTops(ids, ids, heightMap.current, null, 0);
    const total = ids.reduce((sum, id) => sum + (heightMap.current[id] ?? 0), 0);
    restingOrder.value = ids;
    displayOrder.value = ids;
    setListHeight(total);
    if (layoutLocked.current) {
      tops.value = nextTops;
      return;
    }
    layoutLocked.current = true;
    setBaseline(nextTops);
    setPositioned(true);
  }, [displayOrder, restingOrder, tops]);

  useEffect(() => {
    if (dragging.current) return;
    dataRef.current = items;
    setData(items);
    const ids = items.map((workout) => workout.id);
    const live = new Set(ids);
    for (const id of Object.keys(heightMap.current)) {
      if (!live.has(id)) delete heightMap.current[id];
    }
    // Remaining rows keep their measured heights, so onLayout won't fire to reposition them.
    if (ids.length > 0 && ids.every((id) => (heightMap.current[id] ?? 0) > 0)) {
      syncIdleLayout(ids);
    }
  }, [items, syncIdleLayout]);

  const applyShift = useCallback((effective: number) => {
    const id = activeDragId.current;
    const resting = restingOrder.value;
    if (!id || resting.length === 0) return;
    const from = resting.indexOf(id);
    if (from < 0) return;
    const orderedHeights = resting.map((itemId) => heightMap.current[itemId] ?? 0);
    const to = slotFromTranslation(from, effective, orderedHeights);
    const display = moveId(resting, id, to);
    displayOrder.value = display;
    tops.value = buildTops(resting, display, heightMap.current, id, effective);
  }, [displayOrder, restingOrder, tops]);

  useEffect(() => {
    if (!activeId) return;
    const timer = setInterval(() => {
      if (scrollDir.current === 0) return;
      const next = Math.max(0, scrollY.current + scrollDir.current);
      const moved = next - scrollY.current;
      if (moved === 0) return;
      scrollRef.current?.scrollTo({ y: next, animated: false });
      scrollY.current = next;
      scrollBoost.current += moved;
      applyShift(fingerY.current + scrollBoost.current);
    }, 16);
    return () => clearInterval(timer);
  }, [activeId, applyShift, scrollRef, scrollY]);

  const beginDrag = useCallback((id: string) => {
    if (dragging.current) return;
    const order = dataRef.current.map((workout) => workout.id);
    if (!order.includes(id)) return;
    dragging.current = true;
    suppressEdit.current = true;
    scrollBoost.current = 0;
    scrollDir.current = 0;
    fingerY.current = 0;
    restingOrder.value = order;
    displayOrder.value = order;
    activeDragId.current = id;
    activeIdSV.value = id;
    applyShift(0);
    setActiveId(id);
    hapticTap();
  }, [applyShift]);

  const updateDrag = useCallback((translationY: number, absoluteY: number) => {
    if (!dragging.current) return;
    fingerY.current = translationY;
    if (absoluteY > SCREEN_HEIGHT - DRAG_EDGE) scrollDir.current = 18;
    else if (absoluteY < DRAG_EDGE) scrollDir.current = -18;
    else scrollDir.current = 0;
    applyShift(translationY + scrollBoost.current);
  }, [applyShift]);

  const endDrag = useCallback(() => {
    if (!dragging.current) return;
    const finalOrder = displayOrder.value.slice();
    const currentIds = dataRef.current.map((workout) => workout.id);
    dragging.current = false;
    scrollDir.current = 0;
    scrollBoost.current = 0;
    activeDragId.current = null;
    activeIdSV.value = null;
    restingOrder.value = finalOrder;
    displayOrder.value = finalOrder;
    tops.value = buildTops(finalOrder, finalOrder, heightMap.current, null, 0);
    setActiveId(null);
    if (finalOrder.some((id, index) => id !== currentIds[index])) {
      const byId = new Map(dataRef.current.map((workout) => [workout.id, workout]));
      const next = finalOrder
        .map((id) => byId.get(id))
        .filter((workout): workout is WorkoutDefinition => !!workout);
      dataRef.current = next;
      setData(next);
      onReorder(next);
    }
    setTimeout(() => {
      suppressEdit.current = false;
    }, 350);
  }, [activeIdSV, displayOrder, onReorder, restingOrder, tops]);

  return (
    <View style={positioned ? [styles.dragList, { height: listHeight }] : undefined}>
      {data.map((item) => (
        <DragRow
          key={item.id}
          id={item.id}
          active={item.id === activeId}
          positioned={positioned}
          topOffset={baseline[item.id] ?? 0}
          tops={tops}
          baselineSV={baselineSV}
          activeIdSV={activeIdSV}
          positionedSV={positionedSV}
          onHeight={(height) => {
            if (Math.abs((heightMap.current[item.id] ?? 0) - height) < 1) return;
            heightMap.current[item.id] = height;
            const ids = dataRef.current.map((workout) => workout.id);
            if (dragging.current || !ids.every((id) => (heightMap.current[id] ?? 0) > 0)) return;
            syncIdleLayout(ids);
          }}
          onDragStart={() => beginDrag(item.id)}
          onDragMove={updateDrag}
          onDragEnd={endDrag}
        >
          <WorkoutCard
            workout={item}
            onStart={() => onStart(item.id)}
            onEdit={() => {
              if (suppressEdit.current) return;
              onEdit(item.id);
            }}
            onDelete={() => onDelete(item.id)}
            onShare={() => onShare(item)}
            drag={() => {}}
            isActive={item.id === activeId}
          />
        </DragRow>
      ))}
    </View>
  );
}

function DragRow({
  id,
  active,
  positioned,
  topOffset,
  tops,
  baselineSV,
  activeIdSV,
  positionedSV,
  onHeight,
  onDragStart,
  onDragMove,
  onDragEnd,
  children,
}: {
  id: string;
  active: boolean;
  positioned: boolean;
  topOffset: number;
  tops: SharedValue<Record<string, number>>;
  baselineSV: SharedValue<Record<string, number>>;
  activeIdSV: SharedValue<string | null>;
  positionedSV: SharedValue<boolean>;
  onHeight: (height: number) => void;
  onDragStart: () => void;
  onDragMove: (translationY: number, absoluteY: number) => void;
  onDragEnd: () => void;
  children: React.ReactNode;
}) {
  const startRef = useRef(onDragStart);
  const moveRef = useRef(onDragMove);
  const endRef = useRef(onDragEnd);
  startRef.current = onDragStart;
  moveRef.current = onDragMove;
  endRef.current = onDragEnd;

  const start = useCallback(() => {
    startRef.current();
  }, []);
  const move = useCallback((translationY: number, absoluteY: number) => {
    moveRef.current(translationY, absoluteY);
  }, []);
  const end = useCallback(() => {
    endRef.current();
  }, []);

  const pan = useMemo(
    () =>
      Gesture.Simultaneous(
        Gesture.Pan()
          .activateAfterLongPress(220)
          .onStart(() => {
            runOnJS(start)();
          })
          .onUpdate((event) => {
            runOnJS(move)(event.translationY, event.absoluteY);
          })
          .onFinalize(() => {
            runOnJS(end)();
          }),
        Gesture.Native()
      ),
    [end, move, start]
  );

  const y = useSharedValue(0);

  useAnimatedReaction(
    () => tops.value[id] ?? 0,
    (next, prev) => {
      if (prev == null || activeIdSV.value == null || activeIdSV.value === id) {
        y.value = next;
      } else {
        y.value = withTiming(next, { duration: 180 });
      }
    },
  );

  const animatedStyle = useAnimatedStyle(() => {
    const active = activeIdSV.value;
    const base = baselineSV.value[id] ?? 0;
    const target = tops.value[id] ?? base;
    const visual = !positionedSV.value ? base : !active || active === id ? target : y.value;
    return {
      zIndex: active === id ? 30 : 0,
      elevation: active === id ? 12 : 0,
      transform: [
        { translateY: visual - base },
        { scale: active === id ? 1.02 : 1 },
      ],
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        collapsable={false}
        style={[
          positioned && styles.absoluteRow,
          positioned && { top: topOffset },
          animatedStyle,
          active && styles.dragLift,
        ]}
        onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

/** Grows from zero height and fades in when `animate` is true at mount; otherwise renders children as-is. */
function RevealOnMount({ animate, children }: { animate: boolean; children: React.ReactNode }) {
  const [shouldAnimate] = useState(animate);
  const height = useSharedValue(0);
  const opacity = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({ height: height.value, opacity: opacity.value }));

  if (!shouldAnimate) return <>{children}</>;

  return (
    <Animated.View style={[styles.reveal, animatedStyle]}>
      <View
        style={styles.revealContent}
        onLayout={(event) => {
          height.value = withTiming(event.nativeEvent.layout.height, {
            duration: 300,
            easing: Easing.out(Easing.cubic),
          });
          opacity.value = withTiming(1, { duration: 300 });
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

const CATEGORIES: CategoryConfig[] = [
  {
    key: 'easy',
    title: 'Easy / Recovery',
    icon: 'leaf-outline',
    description: 'Conversational effort that builds your aerobic base',
    color: Colors.easy,
  },
  {
    key: 'tempo',
    title: 'Tempo',
    icon: 'speedometer-outline',
    description: 'Comfortably hard, sustained effort',
    color: Colors.warning,
  },
  {
    key: 'intervals',
    title: 'Intervals',
    icon: 'repeat',
    description: 'Hard efforts repeated with recovery between',
    color: Colors.danger,
  },
  {
    key: 'long_run',
    title: 'Long Runs',
    icon: 'trail-sign-outline',
    description: 'Your longest run of the week, mostly easy',
    color: Colors.accent,
  },
  {
    key: 'race',
    title: 'Race / Time Trial',
    icon: 'trophy-outline',
    description: 'Race-effort runs over a set distance or time',
    color: Colors.primary,
  },
  {
    key: 'other',
    title: 'Other',
    icon: 'ellipsis-horizontal-circle-outline',
    description: 'No clear type yet. Edit one to choose a category',
    color: Colors.textSecondary,
  },
];

const RECENT_INLINE_LIMIT = 5;
const RECENT_SHEET_LIMIT = 50;

/** Build a structural fingerprint for deduplication — ignores name, id, timestamps. */
function structureKey(w: WorkoutDefinition): string {
  const stripBlock = (b: import('../../src/workout/workoutTypes').WorkoutBlock): any => {
    if (b.blockType === 'segment') {
      return { t: b.segmentType, tgt: b.target, i: b.intensity };
    }
    return { r: b.repetitions, b: b.blocks.map(stripBlock) };
  };
  return JSON.stringify({
    blocks: w.blocks.map(stripBlock),
    target: w.targetDistanceMeters ?? 0,
    category: w.category ?? '',
  });
}

/** Return up to `limit` unique recent configurations from history. */
function getRecentWorkouts(history: CompletedWorkout[], limit: number): CompletedWorkout[] {
  const seen = new Set<string>();
  const result: CompletedWorkout[] = [];
  for (const run of history) {
    if (!run.configuration) continue;
    const key = structureKey(run.configuration);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(run);
    if (result.length >= limit) break;
  }
  return result;
}

function todayDateKey(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The soonest planned calendar workout after today, within a week. */
function nextUpcomingWorkout(planWorkouts: PlanWorkout[]): PlanWorkout | null {
  const today = todayDateKey();
  const weekOut = todayDateKey(7);
  return (
    planWorkouts
      .filter(
        (pw) =>
          pw.status === 'planned' &&
          pw.date > today &&
          pw.date <= weekOut &&
          !pw.day_label?.toLowerCase().includes('rest'),
      )
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
  );
}

/** Whole days from today to a YYYY-MM-DD date. */
function dayDiff(dateKey: string): number {
  const target = new Date(dateKey + 'T12:00:00');
  const today = new Date(todayDateKey() + 'T12:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Runs whose next-run card was already reported this session. */
const nextRunCardTracked = new Set<string>();
/** Whether the first-run card was already reported this session. */
let firstRunCardTracked = false;

export default function HomeScreen() {
  const router = useRouter();
  const large = useLargeText();
  const { user } = useAuth();
  const { dayEntries, planWorkouts } = useTrainingPlan();
  const [workouts, setWorkouts] = useState<WorkoutDefinition[]>([]);
  const [recentRuns, setRecentRuns] = useState<CompletedWorkout[]>([]);
  const [lastRun, setLastRun] = useState<CompletedWorkout | null>(null);
  const [isNewRunner, setIsNewRunner] = useState(false);
  const [showRecentSheet, setShowRecentSheet] = useState(false);
  const [showRunning101, setShowRunning101] = useState(false);
  const openRunning101 = (source: 'section_header' | 'empty_state') => {
    track('running101_opened', { source });
    setShowRunning101(true);
  };
  const [loading, setLoading] = useState(true);
  // Cards that mount after the screen's first paint animate in instead of popping.
  const [revealTodayCard, setRevealTodayCard] = useState(false);

  useEffect(() => {
    if (!loading) setRevealTodayCard(true);
  }, [loading]);

  const todayEntry = dayEntries[todayDateKey()];
  const todayPlanWorkoutRaw = todayEntry?.planWorkouts?.find((pw) => pw.status !== 'skipped') ?? null;
  // Hide the "Today's Workout" card when:
  // 1. Every plan workout today was skipped (the training calendar hides skipped days)
  // 2. The plan workout is already completed (it's in "Recently Used")
  // 3. It's a rest day but the user already ran today (calendar shows completed)
  const todayPlanWorkout = (() => {
    if (!todayPlanWorkoutRaw) return null;
    if (todayPlanWorkoutRaw.status === 'completed') return null;
    const isRest = todayPlanWorkoutRaw.day_label?.toLowerCase().includes('rest');
    if (isRest && (todayEntry?.completedRuns?.length ?? 0) > 0) return null;
    return todayPlanWorkoutRaw;
  })();
  const [expanded, setExpanded] = useState<Set<WorkoutCategory>>(new Set());
  const { openShare, shareSheet } = useShareSheet();
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);

  const reload = useCallback(async () => {
    const [data, history] = await Promise.all([loadWorkouts(), loadHistory()]);
    setWorkouts(data);
    setRecentRuns(getRecentWorkouts(history, RECENT_SHEET_LIMIT));
    setLastRun(history.find((r) => r.configuration && historyEntryQualifies(r)) ?? null);
    setIsNewRunner(!history.some(historyEntryQualifies));
    setLoading(false);
  }, []);

  const upcomingWorkout = useMemo(() => nextUpcomingWorkout(planWorkouts), [planWorkouts]);
  const showNextRunCard = !todayPlanWorkout && !!lastRun;
  const showFirstRunCard = !todayPlanWorkout && isNewRunner;
  const firstRun = useMemo(() => firstRunWorkout(), []);

  useEffect(() => {
    if (!showFirstRunCard || firstRunCardTracked) return;
    firstRunCardTracked = true;
    track('first_run_card_shown', { history_runs: recentRuns.length });
  }, [showFirstRunCard, recentRuns.length]);

  const startFirstRun = () => {
    hapticTap();
    track('first_run_card_tapped');
    const draft = { ...firstRun, id: generateId(), createdAt: Date.now(), updatedAt: Date.now() };
    setTempWorkout(draft, { source: 'first_run_card', quickStartType: 'easy_run' });
    router.push(`/workout/run/${draft.id}`);
  };
  const lastRunKey = lastRun?.configuration ? structureKey(lastRun.configuration) : null;
  const inlineRecentRuns = (
    showNextRunCard ? recentRuns.filter((r) => structureKey(r.configuration!) !== lastRunKey) : recentRuns
  ).slice(0, RECENT_INLINE_LIMIT);

  useEffect(() => {
    if (!showNextRunCard || !lastRun || nextRunCardTracked.has(lastRun.id)) return;
    nextRunCardTracked.add(lastRun.id);
    track('home_next_run_card_shown', {
      days_since_last_run: Math.round(((Date.now() - lastRun.completedAt) / 86_400_000) * 10) / 10,
      has_upcoming: !!upcomingWorkout,
    });
  }, [showNextRunCard, lastRun, upcomingWorkout]);

  const openUpcoming = (pw: PlanWorkout) => {
    track('home_next_run_card_tapped', { action: 'upcoming', days_out: dayDiff(pw.date) });
    requestCalendarDate(pw.date, pw.id, 'home');
    router.navigate('/(tabs)/training' as any);
  };

  const openRecentRun = (run: CompletedWorkout) => {
    const draft = { ...run.configuration!, id: generateId(), updatedAt: Date.now() };
    setTempWorkout(draft, { source: 'recent_edit', templateId: run.templateId });
    router.push({ pathname: '/workout/configure' as any, params: { id: draft.id } });
  };

  const repeatRecentRun = (run: CompletedWorkout, source: WorkoutSource = 'recent_repeat') => {
    const draft = { ...run.configuration!, id: generateId(), updatedAt: Date.now() };
    setTempWorkout(draft, { source, templateId: run.templateId });
    router.push(`/workout/run/${draft.id}`);
  };

  const openQuickStart = (type: QuickStartType) => {
    if (type === 'free_run') {
      const draft = quickStartFactory(type);
      setTempWorkout(draft, { source: 'quick_start', quickStartType: type });
      router.push(`/workout/run/${draft.id}`);
      return;
    }
    router.push({ pathname: '/workout/configure' as any, params: { quickStart: type } });
  };

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [user?.id, reload])
  );

  useEffect(() => {
    return onSyncStatusChange((status) => {
      if (status === 'success') reload();
    });
  }, [reload]);

  const handleDelete = async (id: string) => {
    await deleteWorkout(id);
    setWorkouts((prev) => prev.filter((w) => w.id !== id));
  };

  const toggleCategory = (cat: WorkoutCategory) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  // Group workouts by category, preserving saved order
  const grouped = workouts.reduce<Record<WorkoutCategory, WorkoutDefinition[]>>(
    (acc, w) => {
      const cat = categorizeWorkout(w);
      acc[cat].push(w);
      return acc;
    },
    { easy: [], tempo: [], intervals: [], long_run: [], race: [], other: [] }
  );

  /** Persist reordered workouts within one category back into the flat list. */
  const handleReorder = async (category: WorkoutCategory, reordered: WorkoutDefinition[]) => {
    const reorderedIds = new Set(reordered.map((w) => w.id));
    const result: WorkoutDefinition[] = [];
    let inserted = false;

    for (const w of workouts) {
      if (categorizeWorkout(w) === category && reorderedIds.has(w.id)) {
        if (!inserted) {
          result.push(...reordered);
          inserted = true;
        }
      } else {
        result.push(w);
      }
    }

    setWorkouts(result);
    await saveWorkouts(result);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(event) => {
          scrollY.current = event.nativeEvent.contentOffset.y;
        }}
      >
        {/* Compact hero */}
        <View style={styles.hero}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.heroLogo}
          />
          <View style={styles.heroText}>
            <Text style={styles.heroTitle} maxFontSizeMultiplier={MaxFontScale.display}>SplitCue</Text>
            <Text style={styles.heroSub}>Run hard. We'll call the splits.</Text>
          </View>
        </View>

        {/* Today's Planned Workout */}
        {todayPlanWorkout && (
          <RevealOnMount animate={revealTodayCard}>
            <TodayWorkoutCard
              planWorkout={todayPlanWorkout}
              onView={() => {
                router.push(
                  {
                    pathname: '/(tabs)/training/workout-detail' as any,
                    params: { workoutId: todayPlanWorkout.id },
                  },
                  { withAnchor: true },
                );
              }}
            />
          </RevealOnMount>
        )}

        {/* Next run: repeat the last one, or jump to the next calendar workout */}
        {showNextRunCard && lastRun && (
          <NextRunCard
            lastRun={lastRun}
            upcoming={upcomingWorkout}
            onRepeat={() => {
              hapticTap();
              track('home_next_run_card_tapped', { action: 'repeat' });
              repeatRecentRun(lastRun, 'home_next_run');
            }}
            onOpenUpcoming={() => upcomingWorkout && openUpcoming(upcomingWorkout)}
          />
        )}

        {showFirstRunCard && <FirstRunCard workout={firstRun} onStart={startFirstRun} />}

        {/* Quick Start */}
        <View style={styles.quickStartSection}>
          <Text style={styles.sectionLabel}>QUICK START</Text>
          <Text style={styles.sectionSubtext}>
            {showFirstRunCard ? 'Or pick another kind of run' : 'What kind of run are you doing today?'}
          </Text>
          <View style={styles.quickStartGrid}>
            {QUICK_START_TILES.map((tile) => (
              <TouchableOpacity
                key={tile.type}
                style={[styles.quickStartTile, large && styles.quickStartTileLarge]}
                onPress={() => openQuickStart(tile.type)}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <View style={[styles.quickStartIcon, { backgroundColor: tile.color + '22' }]}>
                  <Ionicons name={tile.icon as any} size={22} color={tile.color} />
                </View>
                <Text style={styles.quickStartLabel}>{tile.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Recently Used */}
        {inlineRecentRuns.length > 0 && (
          <View style={styles.recentSection}>
            <View style={styles.recentHeader}>
              <Text style={[styles.sectionLabel, styles.recentHeaderLabel]}>RECENTLY USED</Text>
              {recentRuns.length > inlineRecentRuns.length && (
                <TouchableOpacity
                  onPress={() => setShowRecentSheet(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.seeMoreText}>See more</Text>
                </TouchableOpacity>
              )}
            </View>
            {inlineRecentRuns.map((run) => {
              const config = run.configuration!;
              const secs = totalWorkoutSeconds(config);
              const ago = formatRelativeDate(run.completedAt);
              return (
                <TouchableOpacity
                  key={run.id}
                  style={[styles.recentCard, large && styles.recentCardLarge]}
                  onPress={() => openRecentRun(run)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.recentCardMain, large && styles.recentCardMainLarge]}>
                    <Text style={styles.recentName} numberOfLines={large ? 3 : 1}>
                      {config.name || run.workoutName}
                    </Text>
                    <Text style={styles.recentMeta}>
                      {secs > 0 ? formatTime(secs) : ''}{' '}
                      {ago}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.recentRepeatBtn, large && styles.recentRepeatBtnLarge]}
                    accessibilityRole="button"
                    accessibilityLabel={`Repeat ${config.name || run.workoutName}`}
                    onPress={() => repeatRecentRun(run)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="play" size={14} color={Colors.black} />
                    <Text style={styles.recentRepeatText}>Repeat</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Your Workouts */}
        {workouts.length > 0 && (
          <View style={[styles.recentHeader, { marginTop: Spacing.lg }]}>
            <Text style={[styles.sectionLabel, styles.recentHeaderLabel]}>YOUR WORKOUTS</Text>
            <TouchableOpacity
              style={styles.running101Btn}
              onPress={() => openRunning101('section_header')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Running 101: learn about workout types"
            >
              <Ionicons name="information-circle-outline" size={16} color={Colors.primary} />
              <Text style={styles.seeMoreText}>Running 101</Text>
            </TouchableOpacity>
          </View>
        )}
        {CATEGORIES.map((cat) => {
          const items = grouped[cat.key];
          if (cat.key === 'other' && items.length === 0) return null;
          const isExpanded = expanded.has(cat.key);
          return (
            <View key={cat.key} style={styles.categorySection}>
              <TouchableOpacity
                style={styles.categoryHeader}
                onPress={() => toggleCategory(cat.key)}
                activeOpacity={0.7}
              >
                <View style={[styles.categoryIcon, { backgroundColor: cat.color + '22' }]}>
                  <Ionicons name={cat.icon} size={20} color={cat.color} />
                </View>
                <View style={styles.categoryInfo}>
                  <Text style={styles.categoryTitle}>{cat.title}</Text>
                  <Text style={styles.categoryDesc}>{cat.description}</Text>
                </View>
                <View style={styles.categoryRight}>
                  <View style={[styles.countBadge, { backgroundColor: cat.color + '22' }]}>
                    <Text style={[styles.countText, { color: cat.color }]}>{items.length}</Text>
                  </View>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={Colors.textMuted}
                  />
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.categoryBody}>
                  {items.length === 0 ? (
                    <Text style={styles.emptyCategory}>
                      No workouts in this category yet
                    </Text>
                  ) : (
                    <CategoryWorkoutList
                      items={items}
                      scrollRef={scrollRef}
                      scrollY={scrollY}
                      onReorder={(ordered) => handleReorder(cat.key, ordered)}
                      onStart={(id) => router.push(`/workout/run/${id}`)}
                      onEdit={(id) => router.push({ pathname: '/workout/configure' as any, params: { id } })}
                      onDelete={handleDelete}
                      onShare={(workout) =>
                        openShare({ kind: 'structure', workout, workoutName: workout.name, surface: 'home' })
                      }
                    />
                  )}
                </View>
              )}
            </View>
          );
        })}

        {workouts.length === 0 && (
          <>
            <Text style={styles.emptyText}>
              No saved workouts yet. Tap Quick Start above to begin, or tap Save to My Workouts on any workout you want to keep.
            </Text>
            <TouchableOpacity
              style={styles.running101EmptyBtn}
              onPress={() => openRunning101('empty_state')}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Ionicons name="information-circle-outline" size={16} color={Colors.primary} />
              <Text style={styles.seeMoreText}>New to tempo and intervals? Read Running 101</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {shareSheet}
      <LapsedSurveySheet />

      <RecentRunsSheet
        visible={showRecentSheet}
        runs={recentRuns}
        onOpen={(run) => {
          setShowRecentSheet(false);
          openRecentRun(run);
        }}
        onRepeat={(run) => {
          setShowRecentSheet(false);
          repeatRecentRun(run);
        }}
        onClose={() => setShowRecentSheet(false)}
      />

      <Running101Sheet visible={showRunning101} onClose={() => setShowRunning101(false)} />
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
  list: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
    paddingTop: Spacing.sm,
  },
  heroLogo: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  heroText: {
    flex: 1,
  },
  heroTitle: {
    fontSize: FontSize.xl,
    fontWeight: '900',
    color: Colors.primary,
    letterSpacing: 1,
  },
  heroSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  reveal: {
    overflow: 'hidden',
  },
  revealContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  // ── Quick Start ──
  quickStartSection: {
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  sectionSubtext: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  quickStartGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  quickStartTile: {
    flexBasis: '31%',
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    paddingHorizontal: Spacing.xs,
  },
  quickStartTileLarge: {
    flexBasis: '45%',
  },
  quickStartIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  quickStartLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },

  // ── Recent section ──
  recentSection: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  recentHeaderLabel: {
    marginBottom: 0,
  },
  running101Btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  running101EmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: Spacing.md,
  },
  seeMoreText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
  },
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm + 2,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  recentCardLarge: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  recentCardMain: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  recentCardMainLarge: {
    flex: 0,
    marginRight: 0,
    marginBottom: Spacing.sm,
  },
  recentName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  recentMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  recentRepeatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    gap: 4,
  },
  recentRepeatBtnLarge: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  recentRepeatText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.black,
  },

  // ── Category sections ──
  categorySection: {
    marginBottom: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    overflow: 'visible',
  },
  dragList: {
    position: 'relative',
  },
  absoluteRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  dragLift: {
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryInfo: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  categoryDesc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  countBadge: {
    minWidth: 28,
    minHeight: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  countText: {
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
  categoryBody: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  emptyCategory: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    textAlign: 'center',
    marginTop: Spacing.xxl,
  },
});
