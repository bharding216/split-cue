/**
 * Training Plan context — manages the active plan, workouts by date,
 * and merges plan workouts with completed run history for unified
 * calendar/list views.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import type { TrainingPlan, PlanWorkout } from '../types/database';
import type { CompletedWorkout, WorkoutDefinition } from '../workout/workoutTypes';
import {
  loadActivePlans,
  loadArchivedPlans,
  loadDeletedPlans,
  loadPlanWorkouts,
  loadUserPlanWorkouts,
  ensureCustomPlan,
  removePlanWorkout as removePlanWorkoutApi,
  movePlanWorkout as movePlanWorkoutApi,
  completePlanWorkout as completePlanWorkoutApi,
  updatePlanWorkoutData as updatePlanWorkoutDataApi,
  archivePlan as archivePlanApi,
  restorePlan as restorePlanApi,
  deletePlan as deletePlanApi,
  restoreDeletedPlan as restoreDeletedPlanApi,
  updateTrainingPlan as updateTrainingPlanApi,
  ensureUpcomingWorkoutsDetailed,
  loadCoachContext,
  reviewCompletedRun,
  applyPlanModifications,
  type WorkoutAnalysis,
  type PlanModification,
} from '../ai/planService';
import { loadHistory } from '../workout/workoutStorage';

// ── Types ────────────────────────────────────────────────────

/** A unified entry for a single day, containing both plan and history data. */
export interface DayEntry {
  date: string; // YYYY-MM-DD
  planWorkouts: PlanWorkout[];
  completedRuns: CompletedWorkout[];
}

/** AI coach review of the most recently finished plan run. */
export interface RunReview {
  planId: string;
  planWorkoutId: string;
  status: 'loading' | 'ready' | 'error';
  analysis: WorkoutAnalysis | null;
  adjustments: PlanModification[];
  /** The runner's response to the proposed changes; null when none were proposed. */
  decision: 'pending' | 'applied' | 'declined' | null;
}

interface TrainingPlanContextType {
  /** All active plans */
  plans: TrainingPlan[];
  /** Archived plans */
  archivedPlans: TrainingPlan[];
  /** Deleted plans still inside the recovery window */
  deletedPlans: TrainingPlan[];
  /** Primary active plan (first non-custom, for backward compat) */
  plan: TrainingPlan | null;
  planWorkouts: PlanWorkout[];
  history: CompletedWorkout[];
  /** Map of YYYY-MM-DD → DayEntry for calendar rendering */
  dayEntries: Record<string, DayEntry>;
  loading: boolean;
  /** Reload plan + history data */
  refresh: () => Promise<void>;
  /** Ensure a custom plan exists (for manual workout additions), then refresh. */
  ensurePlan: () => Promise<TrainingPlan>;
  /** Remove a planned workout from the calendar entirely */
  removeWorkout: (workoutId: string) => Promise<void>;
  /** Move a planned workout to a different date */
  moveWorkout: (workoutId: string, newDate: string) => Promise<void>;
  /**
   * Mark a planned workout as completed. When the finished run is provided and the
   * workout belongs to an AI training plan, the coach reviews it in the background.
   */
  completeWorkout: (workoutId: string, completedWorkoutId: string, completedRun?: CompletedWorkout) => Promise<void>;
  runReview: RunReview | null;
  /** Apply the selected proposed changes from the run review. */
  applyRunReviewChanges: (modifications: PlanModification[]) => Promise<void>;
  /** Decline the proposed changes from the run review. */
  dismissRunReview: () => void;
  /** Replace the intervals/details of a planned workout */
  updateWorkoutData: (workoutId: string, workout: WorkoutDefinition) => Promise<void>;
  /** Archive a specific plan */
  archivePlan: (planId?: string) => Promise<void>;
  /** Restore an archived plan back to active */
  restorePlan: (planId: string) => Promise<void>;
  /** Move an archived plan to Recently Deleted */
  deletePlan: (planId: string) => Promise<void>;
  /** Recover a deleted plan back to the archived list */
  restoreDeletedPlan: (planId: string) => Promise<void>;
  /** Update mutable plan fields (race_date, days_per_week, etc.) */
  updatePlan: (planId: string, fields: Partial<Pick<import('../types/database').TrainingPlan, 'race_date' | 'days_per_week' | 'title' | 'goal_time_minutes' | 'goal_pace'>>) => Promise<void>;
}

const TrainingPlanContext = createContext<TrainingPlanContextType | null>(null);

// ── Helpers ──────────────────────────────────────────────────

const PLAN_CACHE_KEY = '@pacecue/plan_cache';

interface PlanCache {
  userId: string;
  plans: TrainingPlan[];
  archivedPlans: TrainingPlan[];
  /** Absent in caches written before plan deletion existed. */
  deletedPlans?: TrainingPlan[];
  planWorkouts: PlanWorkout[];
}

async function readPlanCache(userId: string): Promise<PlanCache | null> {
  try {
    const raw = await AsyncStorage.getItem(PLAN_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as PlanCache;
    return cache.userId === userId ? cache : null;
  } catch {
    return null;
  }
}

function toDateKey(epoch: number): string {
  const d = new Date(epoch);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildDayEntries(
  planWorkouts: PlanWorkout[],
  history: CompletedWorkout[],
  primaryPlanId: string | null,
): Record<string, DayEntry> {
  const entries: Record<string, DayEntry> = {};

  // Plan workouts — sort so the primary plan's workouts come last (appear first in the array
  // when we unshift), giving them visual priority while keeping all workouts accessible.
  const sorted = [...planWorkouts].sort((a, b) => {
    const aIsPrimary = a.plan_id === primaryPlanId ? 1 : 0;
    const bIsPrimary = b.plan_id === primaryPlanId ? 1 : 0;
    if (aIsPrimary !== bIsPrimary) return aIsPrimary - bIsPrimary;
    return a.date.localeCompare(b.date);
  });

  for (const pw of sorted) {
    if (!entries[pw.date]) {
      entries[pw.date] = { date: pw.date, planWorkouts: [], completedRuns: [] };
    }
    entries[pw.date].planWorkouts.push(pw);
  }

  // Completed runs
  for (const run of history) {
    const key = toDateKey(run.completedAt);
    if (!entries[key]) {
      entries[key] = { date: key, planWorkouts: [], completedRuns: [] };
    }
    entries[key].completedRuns.push(run);
  }

  return entries;
}

// ── Provider ─────────────────────────────────────────────────

export function TrainingPlanProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [archivedPlans, setArchivedPlans] = useState<TrainingPlan[]>([]);
  const [deletedPlans, setDeletedPlans] = useState<TrainingPlan[]>([]);
  const [planWorkouts, setPlanWorkouts] = useState<PlanWorkout[]>([]);
  const [history, setHistory] = useState<CompletedWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [runReview, setRunReview] = useState<RunReview | null>(null);
  const activeReviewId = useRef<string | null>(null);
  const hasLoadedOnce = useRef(false);
  const isGeneratingDetails = useRef(false);
  /** Incremented on each refresh so stale background tasks can detect they're outdated. */
  const refreshEpoch = useRef(0);
  /** User whose plan data is currently in state; only that user's data may be written to the cache. */
  const stateOwnerId = useRef<string | null>(null);
  /** Workouts removed this session; in-flight loads started before the removal must not resurrect them. */
  const removedWorkoutIds = useRef(new Set<string>());

  // Primary plan: first real training plan (non-custom, or custom with outline)
  const plan = plans.find((p) => p.race_type !== 'custom' || !!(p.outline && p.outline.length > 0)) ?? plans[0] ?? null;

  const refresh = useCallback(async () => {
    const epoch = ++refreshEpoch.current;
    if (!hasLoadedOnce.current) setLoading(true);
    try {
      if (!user) {
        stateOwnerId.current = null;
        setHistory(await loadHistory());
        setPlans([]);
        setArchivedPlans([]);
        setDeletedPlans([]);
        setPlanWorkouts([]);
        setLoading(false);
        return;
      }

      const remote = Promise.all([
        loadActivePlans(user.id),
        loadArchivedPlans(user.id),
        loadUserPlanWorkouts(user.id),
        // Recently Deleted is secondary; don't let it block the calendar.
        loadDeletedPlans(user.id).catch((err) => {
          console.warn('Failed to load deleted plans:', err);
          return [] as TrainingPlan[];
        }),
      ]);
      // Superseded refreshes return before awaiting `remote`.
      remote.catch(() => {});

      let historyData: CompletedWorkout[];
      // Show the last-known plan immediately while the network request is in flight.
      if (stateOwnerId.current !== user.id) {
        const [loadedHistory, cached] = await Promise.all([loadHistory(), readPlanCache(user.id)]);
        historyData = loadedHistory;
        if (refreshEpoch.current !== epoch) return;
        setHistory(historyData);
        if (cached) {
          setPlans(cached.plans);
          setArchivedPlans(cached.archivedPlans);
          setDeletedPlans(cached.deletedPlans ?? []);
          setPlanWorkouts(cached.planWorkouts);
          stateOwnerId.current = user.id;
          setLoading(false);
        } else {
          setPlans([]);
          setArchivedPlans([]);
          setDeletedPlans([]);
          setPlanWorkouts([]);
        }
      } else {
        historyData = await loadHistory();
        setHistory(historyData);
      }

      const [activePlans, archived, allWorkouts, deleted] = await remote;
      if (refreshEpoch.current !== epoch) return;
      setPlans(activePlans);
      setArchivedPlans(archived);
      setDeletedPlans(deleted);

      // Keep plan workouts only for active plans
      const activePlanIds = new Set(activePlans.map((p) => p.id));
      const activeWorkouts = allWorkouts.filter(
        (w) => activePlanIds.has(w.plan_id) && !removedWorkoutIds.current.has(w.id),
      );
      setPlanWorkouts(activeWorkouts);
      stateOwnerId.current = user.id;

      // Auto-fill upcoming workout details for each real training plan
      // (non-custom, or custom with outline). Only start if no other generation is in flight.
      const racePlans = activePlans.filter((p) => p.race_type !== 'custom' || !!(p.outline && p.outline.length > 0));
      if (racePlans.length > 0 && !isGeneratingDetails.current) {
        isGeneratingDetails.current = true;
        let coachContext: ReturnType<typeof loadCoachContext> | null = null;
        const getCoachContext = () => (coachContext ??= loadCoachContext(user.id, historyData));
        Promise.all(
          racePlans.map((rp) => {
            const rpWorkouts = allWorkouts.filter((w) => w.plan_id === rp.id);
            return ensureUpcomingWorkoutsDetailed(rp, rpWorkouts, getCoachContext);
          })
        )
          .then((results) => {
            // If a newer refresh happened while we were generating, discard these results
            // to avoid overwriting fresher data with stale data.
            if (refreshEpoch.current !== epoch) {
              console.log('[TrainingPlan] Discarding stale detail generation results (epoch', epoch, 'vs current', refreshEpoch.current, ')');
              return;
            }

            const allUpdated = results.flat().filter((w) => !removedWorkoutIds.current.has(w.id));
            if (allUpdated.length > 0) {
              const updatedIds = new Set(allUpdated.map((w) => w.id));
              setPlanWorkouts((prev) => [
                ...prev.filter((w) => !updatedIds.has(w.id)),
                ...allUpdated,
              ].sort((a, b) => a.date.localeCompare(b.date)));
            }
          })
          .finally(() => {
            isGeneratingDetails.current = false;
          });
      }
    } catch (err) {
      console.warn('Failed to load training data:', err);
    } finally {
      if (refreshEpoch.current === epoch) {
        setLoading(false);
        hasLoadedOnce.current = true;
      }
    }
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user || stateOwnerId.current !== user.id) return;
    const cache: PlanCache = { userId: user.id, plans, archivedPlans, deletedPlans, planWorkouts };
    AsyncStorage.setItem(PLAN_CACHE_KEY, JSON.stringify(cache)).catch(() => {});
  }, [user?.id, plans, archivedPlans, deletedPlans, planWorkouts]);

  const dayEntries = buildDayEntries(planWorkouts, history, plan?.id ?? null);

  const removeWorkout = useCallback(async (workoutId: string) => {
    await removePlanWorkoutApi(workoutId);
    removedWorkoutIds.current.add(workoutId);
    setPlanWorkouts((prev) => prev.filter((w) => w.id !== workoutId));
  }, []);

  const moveWorkout = useCallback(async (workoutId: string, newDate: string) => {
    const workout = planWorkouts.find((w) => w.id === workoutId);
    if (!workout) return;
    const ownerPlan = plans.find((p) => p.id === workout.plan_id);
    const startDate = ownerPlan?.start_date ?? newDate;
    await movePlanWorkoutApi(workoutId, newDate, startDate);
    const start = new Date(startDate);
    const target = new Date(newDate);
    const diffMs = target.getTime() - start.getTime();
    const weekNumber = Math.max(1, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));
    setPlanWorkouts((prev) =>
      prev.map((w) => (w.id === workoutId ? { ...w, date: newDate, week_number: weekNumber } : w))
        .sort((a, b) => a.date.localeCompare(b.date))
    );
  }, [planWorkouts, plans]);

  const startRunReview = useCallback(
    (plannedWorkout: PlanWorkout, completedRun: CompletedWorkout) => {
      if (!user) return;
      const ownerPlan = plans.find((p) => p.id === plannedWorkout.plan_id);
      // Only AI training plans have an outline to coach against; skip the manual-workout plan.
      if (!ownerPlan?.outline?.length) return;

      const reviewId = plannedWorkout.id;
      activeReviewId.current = reviewId;
      setRunReview({
        planId: ownerPlan.id,
        planWorkoutId: reviewId,
        status: 'loading',
        analysis: null,
        adjustments: [],
        decision: null,
      });

      const planOnlyWorkouts = planWorkouts
        .filter((w) => w.plan_id === ownerPlan.id)
        .map((w) => (w.id === reviewId ? { ...w, status: 'completed' as const } : w));
      const runsIncludingThis = [completedRun, ...history.filter((h) => h.id !== completedRun.id)];

      loadCoachContext(user.id, runsIncludingThis)
        .then((context) =>
          reviewCompletedRun({ plannedWorkout, completedRun, planWorkouts: planOnlyWorkouts, context }),
        )
        .then(({ analysis, adjustments }) => {
          if (activeReviewId.current !== reviewId) return;
          setRunReview((prev) =>
            prev && prev.planWorkoutId === reviewId
              ? { ...prev, status: 'ready', analysis, adjustments, decision: adjustments.length > 0 ? 'pending' : null }
              : prev,
          );
        })
        .catch((err) => {
          console.warn('Run review failed:', err);
          if (activeReviewId.current !== reviewId) return;
          setRunReview((prev) =>
            prev && prev.planWorkoutId === reviewId ? { ...prev, status: 'error' } : prev,
          );
        });
    },
    [user, plans, planWorkouts, history],
  );

  const completeWorkout = useCallback(
    async (workoutId: string, completedWorkoutId: string, completedRun?: CompletedWorkout) => {
      const plannedWorkout = planWorkouts.find((w) => w.id === workoutId);
      await completePlanWorkoutApi(workoutId, completedWorkoutId);
      setPlanWorkouts((prev) =>
        prev.map((w) =>
          w.id === workoutId
            ? { ...w, status: 'completed' as const, completed_workout_id: completedWorkoutId }
            : w
        )
      );
      if (plannedWorkout && completedRun) startRunReview(plannedWorkout, completedRun);
    },
    [planWorkouts, startRunReview],
  );

  const applyRunReviewChanges = useCallback(async (modifications: PlanModification[]) => {
    if (!runReview) return;
    await applyPlanModifications(runReview.planId, modifications);
    setRunReview((prev) => (prev ? { ...prev, decision: 'applied' } : prev));
    // Changed days lose their old detail; refresh regenerates them with the latest context.
    await refresh();
  }, [runReview, refresh]);

  const dismissRunReview = useCallback(() => {
    setRunReview((prev) => (prev ? { ...prev, decision: 'declined' } : prev));
  }, []);

  const updateWorkoutData = useCallback(async (workoutId: string, workout: WorkoutDefinition) => {
    const existing = planWorkouts.find((w) => w.id === workoutId);
    const previousName = (existing?.workout_data as WorkoutDefinition | null)?.name;
    // Custom calendar entries use the workout name as their label; keep them in sync on rename
    const dayLabel = existing && existing.day_label === previousName ? workout.name : undefined;
    const workoutData = { ...workout, updatedAt: Date.now() };
    await updatePlanWorkoutDataApi(workoutId, workoutData, dayLabel);
    setPlanWorkouts((prev) =>
      prev.map((w) =>
        w.id === workoutId
          ? { ...w, workout_data: workoutData, ...(dayLabel !== undefined ? { day_label: dayLabel } : {}) }
          : w
      )
    );
  }, [planWorkouts]);

  const archivePlanFn = useCallback(async (planId?: string) => {
    const targetId = planId ?? plan?.id;
    if (!targetId) return;
    await archivePlanApi(targetId);
    const archivedPlan = plans.find((p) => p.id === targetId);
    setPlans((prev) => prev.filter((p) => p.id !== targetId));
    setPlanWorkouts((prev) => prev.filter((w) => w.plan_id !== targetId));
    if (archivedPlan) {
      setArchivedPlans((prev) => [{ ...archivedPlan, status: 'archived' }, ...prev]);
    }
  }, [plan?.id, plans]);

  const restorePlanFn = useCallback(async (planId: string) => {
    await restorePlanApi(planId);
    const restoredPlan = archivedPlans.find((p) => p.id === planId);
    setArchivedPlans((prev) => prev.filter((p) => p.id !== planId));
    if (restoredPlan) {
      setPlans((prev) => [...prev, { ...restoredPlan, status: 'active' }]);
    }
    // Reload workouts to include the restored plan's workouts
    if (user) {
      const allWorkouts = await loadUserPlanWorkouts(user.id);
      setPlanWorkouts(allWorkouts);
    }
  }, [archivedPlans, user]);

  const deletePlanFn = useCallback(async (planId: string) => {
    const deletedAt = await deletePlanApi(planId);
    const deletedPlan = archivedPlans.find((p) => p.id === planId);
    setArchivedPlans((prev) => prev.filter((p) => p.id !== planId));
    if (deletedPlan) {
      setDeletedPlans((prev) => [{ ...deletedPlan, status: 'deleted', deleted_at: deletedAt }, ...prev]);
    }
  }, [archivedPlans]);

  const restoreDeletedPlanFn = useCallback(async (planId: string) => {
    await restoreDeletedPlanApi(planId);
    const recoveredPlan = deletedPlans.find((p) => p.id === planId);
    setDeletedPlans((prev) => prev.filter((p) => p.id !== planId));
    if (recoveredPlan) {
      setArchivedPlans((prev) => [{ ...recoveredPlan, status: 'archived', deleted_at: null }, ...prev]);
    }
  }, [deletedPlans]);

  const ensurePlanFn = useCallback(async (): Promise<TrainingPlan> => {
    // Return existing custom plan, or create one for manual workout additions
    const customPlan = plans.find((p) => p.race_type === 'custom');
    if (customPlan) return customPlan;
    if (!user) throw new Error('Must be signed in');
    const created = await ensureCustomPlan(user.id);
    setPlans((prev) => [...prev, created]);
    return created;
  }, [plans, user]);

  const updatePlanFn = useCallback(async (
    planId: string,
    fields: Partial<Pick<TrainingPlan, 'race_date' | 'days_per_week' | 'title' | 'goal_time_minutes' | 'goal_pace'>>,
  ) => {
    await updateTrainingPlanApi(planId, fields);
    setPlans((prev) =>
      prev.map((p) => (p.id === planId ? { ...p, ...fields, updated_at: new Date().toISOString() } : p)),
    );
  }, []);

  return (
    <TrainingPlanContext.Provider
      value={{
        plans,
        archivedPlans,
        deletedPlans,
        plan,
        planWorkouts,
        history,
        dayEntries,
        loading,
        refresh,
        ensurePlan: ensurePlanFn,
        removeWorkout,
        moveWorkout,
        completeWorkout,
        runReview,
        applyRunReviewChanges,
        dismissRunReview,
        updateWorkoutData,
        archivePlan: archivePlanFn,
        restorePlan: restorePlanFn,
        deletePlan: deletePlanFn,
        restoreDeletedPlan: restoreDeletedPlanFn,
        updatePlan: updatePlanFn,
      }}
    >
      {children}
    </TrainingPlanContext.Provider>
  );
}

export function useTrainingPlan(): TrainingPlanContextType {
  const ctx = useContext(TrainingPlanContext);
  if (!ctx) throw new Error('useTrainingPlan must be used inside TrainingPlanProvider');
  return ctx;
}
