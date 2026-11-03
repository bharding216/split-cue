/**
 * Plan setup screen — structured form to create a training plan.
 * Race distance, date, goal time, days/week, profile summary.
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useTrainingPlan } from '../../../src/contexts/TrainingPlanContext';
import { useSubscription } from '../../../src/contexts/SubscriptionContext';
import { supabase } from '../../../src/analytics/supabaseClient';
import {
  generatePlanOutline,
  savePlanOutline,
  generateWorkoutDetails,
  type PlanGenerationInput,
  type PlanOutlineResult,
} from '../../../src/ai/planService';
import { PlanProposalReview, type PlanRevisionExchange } from '../../../src/components/PlanProposalReview';
import { track } from '../../../src/analytics/track';
import { loadHistory, loadSettings } from '../../../src/workout/workoutStorage';
import { buildHistorySummary, serializeHistorySummary } from '../../../src/ai/historySummary';
import {
  MILE_ESTIMATE_OPTIONS,
  assessGoalPace,
  estimateCurrentPace,
  formatPace,
  paceFromUnit,
  paceToUnit,
  paceUnitSuffix,
  roundPace,
  splitPace,
  suggestGoalTiers,
  weeksBetween,
  type MileEstimate,
} from '../../../src/workout/goalPaceSuggestions';
import type { CompletedWorkout } from '../../../src/workout/workoutTypes';
import type { PaceUnit } from '../../../src/pace/paceTypes';
import type { RaceType, GoalType, RunningProfile, RunningPreference } from '../../../src/types/database';
import { normalizeDayPreferences } from '../../../src/types/database';
import { Colors, Spacing, FontSize, BorderRadius } from '../../../src/constants/theme';
import { ProfileSheet } from '../../../src/components/ProfileSheet';
import { formatPace as formatUnitPace } from '../../../src/units/format';

const DRAFT_KEY = 'plan-setup-draft';

const RACE_OPTIONS: { value: RaceType; label: string; distance: { mi: string; km: string } | null }[] = [
  { value: '5k', label: '5K', distance: { mi: '3.1 mi', km: '5 km' } },
  { value: '10k', label: '10K', distance: { mi: '6.2 mi', km: '10 km' } },
  { value: 'half_marathon', label: 'Half Marathon', distance: { mi: '13.1 mi', km: '21.1 km' } },
  { value: 'marathon', label: 'Marathon', distance: { mi: '26.2 mi', km: '42.2 km' } },
  { value: 'custom', label: 'Custom', distance: null },
];

const DAYS_PER_WEEK_OPTIONS = [3, 4, 5, 6, 7];

function getNextMonday(): Date {
  const d = new Date();
  const day = d.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type GenPhase = 'idle' | 'analyzing' | 'generating';

const GEN_STEPS: { phase: GenPhase; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { phase: 'analyzing', label: 'Analyzing your profile', icon: 'person-outline' },
  { phase: 'generating', label: 'Drafting your training plan', icon: 'sparkles-outline' },
];

/** Keeps the free plan from turning into unlimited AI calls; finer tweaks happen in Adjust Plan. */
const MAX_PLAN_REVISIONS = 5;

interface PlanProposal {
  input: PlanGenerationInput;
  outline: PlanOutlineResult;
  /** Overlapping plans the runner chose to archive — archived only once they approve. */
  archivePlanIds: string[];
  paceSelection?: string;
}

export default function PlanSetupScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { plans, refresh, archivePlan } = useTrainingPlan();
  const { canGeneratePlan, refreshSubscription } = useSubscription();
  const mountedRef = useRef(true);
  const draftLoaded = useRef(false);

  const [step, setStep] = useState(1);
  const totalSteps = 4;

  const [goalType, setGoalType] = useState<GoalType>('race');
  const [raceType, setRaceType] = useState<RaceType>('half_marathon');
  const [customDistance, setCustomDistance] = useState('');
  const [customDistanceUnit, setCustomDistanceUnit] = useState<'mi' | 'km'>('mi');
  const [goalPaceMin, setGoalPaceMin] = useState('');
  const [goalPaceSec, setGoalPaceSec] = useState('');
  const [paceDistanceContext, setPaceDistanceContext] = useState<RaceType | 'any'>('any');
  const [coachPicksPace, setCoachPicksPace] = useState(false);
  const [mileEstimate, setMileEstimate] = useState<MileEstimate | null>(null);
  const [paceUnit, setPaceUnit] = useState<PaceUnit>('minPerMile');
  const [history, setHistory] = useState<CompletedWorkout[]>([]);
  const [raceDate, setRaceDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 4);
    return d;
  });
  const [showRaceDatePicker, setShowRaceDatePicker] = useState(false);
  const [goalTimeHours, setGoalTimeHours] = useState('');
  const [goalTimeMinutes, setGoalTimeMinutes] = useState('');
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set([4]));
  const [startDate, setStartDate] = useState(getNextMonday());
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);

  // Profile data
  const [profile, setProfile] = useState<RunningProfile | null>(null);
  const [goals, setGoals] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [limitations, setLimitations] = useState<string[]>([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSheetVisible, setProfileSheetVisible] = useState(false);

  // Real-time overlap detection for users with active plans
  const activePlans = useMemo(
    () => plans.filter((p) => p.race_type !== 'custom' || !!(p.outline && p.outline.length > 0)),
    [plans],
  );

  const overlapInfo = useMemo(() => {
    if (activePlans.length === 0) return null;
    const newStart = startDate;
    const newEnd = raceDate;
    const overlapping = activePlans.filter((p) => {
      const pStart = new Date(p.start_date);
      const pEnd = new Date(p.race_date);
      return pStart <= newEnd && newStart <= pEnd;
    });
    if (overlapping.length === 0) return null;
    return overlapping.map((p) => p.title || 'Training Plan');
  }, [activePlans, startDate, raceDate]);

  const [genPhase, setGenPhase] = useState<GenPhase>('idle');
  const [genElapsed, setGenElapsed] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const generating = genPhase !== 'idle';

  const [proposal, setProposal] = useState<PlanProposal | null>(null);
  const [exchanges, setExchanges] = useState<PlanRevisionExchange[]>([]);
  const [revising, setRevising] = useState(false);
  const [approving, setApproving] = useState(false);

  // Track mounted state for safe async updates
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Restore draft form values on mount
  useEffect(() => {
    (async () => {
      try {
        const [raw, settings] = await Promise.all([
          AsyncStorage.getItem(DRAFT_KEY),
          loadSettings().catch(() => null),
        ]);
        const unit: PaceUnit = settings?.paceUnit ?? 'minPerMile';
        setPaceUnit(unit);
        setCustomDistanceUnit(unit === 'minPerKm' ? 'km' : 'mi');
        if (!raw) { draftLoaded.current = true; return; }
        const draft = JSON.parse(raw);
        if (draft.goalType) setGoalType(draft.goalType);
        if (draft.raceType) setRaceType(draft.raceType);
        if (draft.customDistance != null) setCustomDistance(draft.customDistance);
        if (draft.customDistanceUnit) setCustomDistanceUnit(draft.customDistanceUnit);
        if (draft.goalPaceMin != null || draft.goalPaceSec != null) {
          const draftUnit: PaceUnit = draft.goalPaceUnit ?? 'minPerMile';
          const min = parseInt(draft.goalPaceMin || '0', 10);
          const sec = parseInt(draft.goalPaceSec || '0', 10);
          if (draftUnit !== unit && min > 0) {
            const converted = splitPace(paceToUnit(paceFromUnit(min + sec / 60, draftUnit), unit));
            setGoalPaceMin(String(converted.min));
            setGoalPaceSec(String(converted.sec).padStart(2, '0'));
          } else {
            setGoalPaceMin(draft.goalPaceMin ?? '');
            setGoalPaceSec(draft.goalPaceSec ?? '');
          }
        }
        if (draft.coachPicksPace != null) setCoachPicksPace(draft.coachPicksPace);
        if (draft.mileEstimate) setMileEstimate(draft.mileEstimate);
        if (draft.paceDistanceContext) setPaceDistanceContext(draft.paceDistanceContext);
        if (draft.raceDate) setRaceDate(new Date(draft.raceDate));
        if (draft.goalTimeHours != null) setGoalTimeHours(draft.goalTimeHours);
        if (draft.goalTimeMinutes != null) setGoalTimeMinutes(draft.goalTimeMinutes);
        if (draft.selectedDays?.length) setSelectedDays(new Set(draft.selectedDays));
        if (draft.startDate) setStartDate(new Date(draft.startDate));
      } catch {}
      draftLoaded.current = true;
    })();
  }, []);

  // Tick elapsed seconds while generating
  useEffect(() => {
    if (!generating) { setGenElapsed(0); return; }
    const interval = setInterval(() => {
      setGenElapsed((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [generating]);

  // Animate progress bar based on generation phase
  useEffect(() => {
    if (genPhase === 'analyzing') {
      progressAnim.setValue(0);
      Animated.timing(progressAnim, {
        toValue: 0.1,
        duration: 400,
        useNativeDriver: false,
      }).start();
    } else if (genPhase === 'generating') {
      Animated.timing(progressAnim, {
        toValue: 0.88,
        duration: 18000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    } else {
      progressAnim.setValue(0);
    }
  }, [genPhase]);

  // Persist draft whenever inputs change (debounced via effect)
  useEffect(() => {
    if (!draftLoaded.current) return;
    const timer = setTimeout(() => {
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({
        goalType,
        raceType,
        customDistance,
        customDistanceUnit,
        goalPaceMin,
        goalPaceSec,
        goalPaceUnit: paceUnit,
        coachPicksPace,
        mileEstimate,
        paceDistanceContext,
        raceDate: raceDate.toISOString(),
        goalTimeHours,
        goalTimeMinutes,
        selectedDays: [...selectedDays],
        startDate: startDate.toISOString(),
      })).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [goalType, raceType, customDistance, customDistanceUnit, goalPaceMin, goalPaceSec, paceUnit, coachPicksPace, mileEstimate, paceDistanceContext, raceDate, goalTimeHours, goalTimeMinutes, selectedDays, startDate]);

  // Load running profile
  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfileLoading(false);
      return;
    }

    const [{ data: profileData }, { data: prefData }] = await Promise.all([
      supabase
        .from('running_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('running_preferences')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at'),
    ]);

    setProfile(profileData);
    setGoals(
      (prefData ?? [])
        .filter((p: RunningPreference) => p.category === 'goal')
        .map((p: RunningPreference) => p.content)
    );
    setPreferences(
      (prefData ?? [])
        .filter((p: RunningPreference) => p.category === 'preference')
        .map((p: RunningPreference) => p.content)
    );
    setLimitations(
      (prefData ?? [])
        .filter((p: RunningPreference) => p.category === 'limitation')
        .map((p: RunningPreference) => p.content)
    );
    setProfileLoading(false);
  }, [user]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  useEffect(() => {
    loadHistory().then((h) => { if (mountedRef.current) setHistory(h); }).catch(() => {});
  }, []);

  // ── Pace goal suggestions ──────────────────────────────────
  const paceSuffix = paceUnitSuffix(paceUnit);
  const toDisplayPace = useCallback((p: number) => roundPace(paceToUnit(p, paceUnit)), [paceUnit]);
  const planWeeks = weeksBetween(startDate, raceDate);

  /** Typed target pace in min/mi, or null if blank. */
  const typedPace = useMemo(() => {
    const m = parseInt(goalPaceMin || '0', 10);
    const s = parseInt(goalPaceSec || '0', 10);
    return m > 0 ? paceFromUnit(m + s / 60, paceUnit) : null;
  }, [goalPaceMin, goalPaceSec, paceUnit]);

  const paceBaseline = useMemo(
    () => estimateCurrentPace(profile, history, paceDistanceContext, mileEstimate),
    [profile, history, paceDistanceContext, mileEstimate],
  );
  const hasDataBaseline = !!paceBaseline && paceBaseline.source !== 'mile_estimate';

  const goalTiers = useMemo(
    () => (paceBaseline ? suggestGoalTiers(paceBaseline, planWeeks, profile?.experience_level) : []),
    [paceBaseline, planWeeks, profile?.experience_level],
  );
  const realisticTier = goalTiers.find((t) => t.id === 'realistic');

  const typedPaceLabel = typedPace != null ? formatPace(roundPace(paceToUnit(typedPace, paceUnit), 1)) : null;
  const selectedTierId = goalTiers.find((t) => formatPace(toDisplayPace(t.pace)) === typedPaceLabel)?.id ?? null;

  const paceAssessment =
    goalType === 'pace_target' && !coachPicksPace && typedPace != null && paceBaseline
      ? assessGoalPace(typedPace, paceBaseline, planWeeks, profile?.experience_level)
      : 'ok';

  const paceDistanceLabel = paceDistanceContext === 'any'
    ? '5K'
    : RACE_OPTIONS.find((o) => o.value === paceDistanceContext)?.label ?? '5K';

  const applyGoalPace = useCallback((paceMinPerMile: number) => {
    const { min, sec } = splitPace(toDisplayPace(paceMinPerMile));
    setGoalPaceMin(String(min));
    setGoalPaceSec(String(sec).padStart(2, '0'));
    setCoachPicksPace(false);
  }, [toDisplayPace]);

  const validatePaceGoal = useCallback((): boolean => {
    if (goalType !== 'pace_target' || coachPicksPace) return true;
    const sec = parseInt(goalPaceSec || '0', 10);
    if (typedPace == null) {
      Alert.alert('Missing Pace', 'Enter a target pace, pick a suggestion, or let your coach choose one for you.');
      return false;
    }
    if (sec >= 60) {
      Alert.alert('Invalid Pace', 'Seconds must be between 00 and 59.');
      return false;
    }
    return true;
  }, [goalType, coachPicksPace, goalPaceSec, typedPace]);

  const handleGenerate = useCallback(async () => {
    if (!user) {
      router.push('/login' as any);
      return;
    }

    if (!canGeneratePlan) {
      router.push('/paywall' as any);
      return;
    }

    if (goalType === 'race' && raceType === 'custom') {
      const dist = parseFloat(customDistance);
      if (!dist || dist <= 0) {
        Alert.alert('Missing Distance', 'Please enter a custom race distance.');
        return;
      }
    }

    if (!validatePaceGoal()) return;

    const goalTimeTotal =
      (parseInt(goalTimeHours || '0', 10) * 60) + parseInt(goalTimeMinutes || '0', 10);

    // Goal pace as decimal min/mile (e.g. 8:30 → 8.5); null lets the coach choose
    const goalPaceDecimal = goalType === 'pace_target' && !coachPicksPace ? typedPace : null;
    const paceSelection = goalType !== 'pace_target'
      ? undefined
      : coachPicksPace ? 'coach' : selectedTierId ? `suggested_${selectedTierId}` : 'typed';
    const paceBaselineNote = goalType === 'pace_target' && paceBaseline
      ? `About ${formatPace(paceBaseline.pace)}/mi for ${paceDistanceLabel} (estimated from ${paceBaseline.detail})`
      : null;

    // For pace goals, use the distance context (or 'custom' for "any distance")
    const effectiveRaceType: RaceType = goalType === 'pace_target'
      ? (paceDistanceContext === 'any' ? 'custom' : paceDistanceContext)
      : raceType;

    const customDistanceMeters = effectiveRaceType === 'custom' && goalType === 'race'
      ? Math.round(parseFloat(customDistance || '0') * (customDistanceUnit === 'km' ? 1000 : 1609.344))
      : undefined;

    const raceDateStr = `${raceDate.getFullYear()}-${String(raceDate.getMonth() + 1).padStart(2, '0')}-${String(raceDate.getDate()).padStart(2, '0')}`;
    const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;

    if (new Date(raceDateStr) <= new Date(startDateStr)) {
      Alert.alert('Invalid Dates', `${goalType === 'pace_target' ? 'Target' : 'Race'} date must be after the start date.`);
      return;
    }

    // Check for overlapping active training plans
    let archivePlanIds: string[] = [];
    const existingRacePlans = plans.filter(
      (p) => p.race_type !== 'custom' || !!(p.outline && p.outline.length > 0),
    );
    if (existingRacePlans.length > 0) {
      const newStart = new Date(startDateStr);
      const newEnd = new Date(raceDateStr);
      const overlapping = existingRacePlans.filter((p) => {
        const pStart = new Date(p.start_date);
        const pEnd = new Date(p.race_date);
        return pStart <= newEnd && newStart <= pEnd;
      });

      if (overlapping.length > 0) {
        const names = overlapping
          .map((p) => `"${p.title || 'Training Plan'}"`)
          .join(' and ');
        const choice = await new Promise<'archive' | 'keep' | 'cancel'>((resolve) => {
          Alert.alert(
            'Overlapping Plan' + (overlapping.length > 1 ? 's' : ''),
            `Your new plan overlaps with ${names}. You'll see stacked workouts on days that overlap.\n\nWould you like to archive the existing plan${overlapping.length > 1 ? 's' : ''} once you approve the new one?`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
              { text: 'Keep Both', onPress: () => resolve('keep') },
              {
                text: `Archive ${overlapping.length > 1 ? 'Old Plans' : 'Old Plan'}`,
                style: 'destructive',
                onPress: () => resolve('archive'),
              },
            ],
            { onDismiss: () => resolve('cancel') },
          );
        });

        if (choice === 'cancel') return;
        if (choice === 'archive') archivePlanIds = overlapping.map((p) => p.id);
      }
    }

    setGenPhase('analyzing');
    try {
      const historyData = await loadHistory();
      const summary = historyData.length > 0
        ? serializeHistorySummary(buildHistorySummary(historyData))
        : null;

      const profilePayload = {
        experience_level: profile?.experience_level,
        typical_run_minutes: profile?.typical_run_minutes ?? undefined,
        typical_run_minutes_max: profile?.typical_run_minutes_max ?? undefined,
        easy_pace: profile?.easy_pace ?? undefined,
        fast_pace: profile?.fast_pace ?? undefined,
        race_times: profile?.race_times ?? undefined,
        weekly_mileage: profile?.weekly_mileage ?? undefined,
        longest_recent_run_minutes: profile?.longest_recent_run_minutes ?? undefined,
        max_workout_minutes: profile?.max_workout_minutes ?? undefined,
        preferred_days: normalizeDayPreferences(profile?.preferred_days),
        cross_training: profile?.cross_training ?? undefined,
      };

      // Detect if user has no pace data — prescribe effort-based workouts
      const hasPaceData = !!(
        profilePayload.easy_pace ||
        profilePayload.fast_pace ||
        (profilePayload.race_times && Object.values(profilePayload.race_times).some(
          (rt: any) => rt?.slow || rt?.avg || rt?.fast
        ))
      );

      const input: PlanGenerationInput = {
        profile: profilePayload,
        goals,
        preferences,
        limitations,
        raceType: effectiveRaceType,
        customDistanceMeters,
        raceDate: raceDateStr,
        goalTimeMinutes: goalType === 'race' && goalTimeTotal > 0 ? goalTimeTotal : null,
        goalType,
        goalPace: goalPaceDecimal,
        paceBaseline: paceBaselineNote,
        startDate: startDateStr,
        daysPerWeek: Math.max(...selectedDays),
        daysPerWeekMin: selectedDays.size > 1 ? Math.min(...selectedDays) : undefined,
        historySummary: summary,
        useEffortBased: !hasPaceData,
      };

      if (!mountedRef.current) return;
      setGenPhase('generating');
      const outline = await generatePlanOutline(input);

      track('plan_proposed', {
        race_type: effectiveRaceType,
        goal_type: goalType,
        weeks: outline.weeks.length,
        days_per_week: input.daysPerWeek,
      });

      if (!mountedRef.current) return;
      setExchanges([]);
      setProposal({ input, outline, archivePlanIds, paceSelection });
      setGenPhase('idle');
    } catch (err: any) {
      track('plan_generation_failed', {
        race_type: effectiveRaceType,
        goal_type: goalType,
        error: String(err?.message ?? err).slice(0, 200),
      });
      if (mountedRef.current) {
        setGenPhase('idle');
        Alert.alert('Error', err.message || 'Failed to generate plan. Please try again.');
      }
    }
  }, [user, canGeneratePlan, plans, goalType, raceType, customDistance, customDistanceUnit, validatePaceGoal, coachPicksPace, typedPace, selectedTierId, paceBaseline, paceDistanceLabel, paceDistanceContext, raceDate, goalTimeHours, goalTimeMinutes, selectedDays, startDate, profile, goals, preferences, limitations, router]);

  const handleRevise = useCallback(async (feedback: string) => {
    if (!proposal || revising) return;
    if (exchanges.length >= MAX_PLAN_REVISIONS) {
      Alert.alert(
        'Revision limit reached',
        'Approve this version to get started. You can keep fine-tuning anytime from Adjust Plan.',
      );
      return;
    }

    const priorFeedback = exchanges.map((e) => e.feedback);
    setExchanges((prev) => [...prev, { feedback, reply: null }]);
    setRevising(true);
    try {
      const outline = await generatePlanOutline(proposal.input, {
        previous: proposal.outline,
        feedback,
        priorFeedback,
      });
      track('plan_revision_requested', {
        revision: priorFeedback.length + 1,
        weeks: outline.weeks.length,
      });
      if (!mountedRef.current) return;
      setProposal((prev) => (prev ? { ...prev, outline } : prev));
      setExchanges((prev) => prev.map((e, i) =>
        i === prev.length - 1 ? { ...e, reply: outline.message || 'Done. Take a look at the updated plan above.' } : e,
      ));
    } catch (err: any) {
      if (!mountedRef.current) return;
      setExchanges((prev) => prev.slice(0, -1));
      Alert.alert('Error', err.message || 'Failed to revise the plan. Please try again.');
    } finally {
      if (mountedRef.current) setRevising(false);
    }
  }, [proposal, revising, exchanges]);

  const handleApprove = useCallback(async () => {
    if (!user || !proposal || approving) return;
    const { input, outline, archivePlanIds, paceSelection } = proposal;
    setApproving(true);
    try {
      for (const id of archivePlanIds) {
        await archivePlan(id);
      }
      const { plan: savedPlan, workouts: savedWorkouts } = await savePlanOutline(user.id, input, outline);

      track('plan_generated', {
        plan_id: savedPlan.id,
        race_type: input.raceType,
        goal_type: input.goalType ?? 'race',
        weeks: outline.weeks.length,
        days_per_week: input.daysPerWeek,
        revisions: exchanges.length,
        ...(paceSelection ? { pace_selection: paceSelection, pace_baseline_source: paceBaseline?.source ?? 'none' } : {}),
      });

      if (!mountedRef.current) return;

      await Promise.all([refresh(), refreshSubscription()]);
      AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});

      // Navigate back to training page so the setup screen auto-closes
      router.back();

      Alert.alert(
        'Your plan is ready',
        `Your ${outline.weeks.length}-week plan is on your calendar.\n\n` +
          'Detailed workouts are being prepared for the next 2 weeks (highlighted on your calendar). ' +
          'Later workouts will be filled in as you go, adjusted based on how your actual runs perform.',
        [{ text: 'Got it' }],
      );

      // Generate details for the first 3 workouts in the background
      const today = new Date().toISOString().split('T')[0];
      const upcoming = savedWorkouts
        .filter((w) => w.date >= today && w.day_label !== 'Rest Day')
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 3);

      if (upcoming.length > 0) {
        generateWorkoutDetails(savedPlan, upcoming, { profile: input.profile, historySummary: input.historySummary })
          .then(() => refresh())
          .catch((err) => console.warn('Background detail generation failed:', err));
      }
    } catch (err: any) {
      track('plan_generation_failed', {
        race_type: input.raceType,
        goal_type: input.goalType ?? 'race',
        error: String(err?.message ?? err).slice(0, 200),
      });
      if (mountedRef.current) {
        setApproving(false);
        Alert.alert('Error', err.message || 'Failed to save plan. Please try again.');
      }
    }
  }, [user, proposal, approving, exchanges.length, archivePlan, paceBaseline, refresh, refreshSubscription, router]);

  const handleDiscardProposal = useCallback(() => {
    Alert.alert(
      'Edit your answers?',
      "This proposal will be discarded and you'll need to generate a new one.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            setProposal(null);
            setExchanges([]);
          },
        },
      ],
    );
  }, []);

  if (!user) {
    return (
      <View style={styles.centered}>
        <Ionicons name="person-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.emptyTitle}>Sign in Required</Text>
        <Text style={styles.emptyText}>Sign in to create a training plan.</Text>
        <TouchableOpacity
          style={styles.signInBtn}
          onPress={() => router.push('/login' as any)}
          activeOpacity={0.8}
        >
          <Text style={styles.signInBtnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (proposal) {
    return (
      <PlanProposalReview
        outline={proposal.outline}
        exchanges={exchanges}
        revising={revising}
        approving={approving}
        onApprove={handleApprove}
        onRevise={handleRevise}
        onBack={handleDiscardProposal}
      />
    );
  }

  // ── Progress overlay while generating ─────────────────────
  if (generating) {
    const currentIdx = GEN_STEPS.findIndex((s) => s.phase === genPhase);

    return (
      <View style={styles.genScreen}>
        <View style={styles.genCard}>
          {/* Header */}
          <View style={styles.genHeader}>
            <View style={styles.genSparkleWrap}>
              <Ionicons name="sparkles" size={32} color={Colors.accent} />
            </View>
            <Text style={styles.genTitle}>Creating Your Plan</Text>
          </View>

          {/* Steps */}
          <View style={styles.genSteps}>
            {GEN_STEPS.map((step, i) => {
              const isDone = currentIdx > i;
              const isActive = currentIdx === i;

              return (
                <View key={step.phase} style={styles.genStepRow}>
                  <View
                    style={[
                      styles.genStepCircle,
                      isDone && styles.genStepCircleDone,
                      isActive && styles.genStepCircleActive,
                    ]}
                  >
                    {isDone ? (
                      <Ionicons name="checkmark-sharp" size={13} color={Colors.black} />
                    ) : isActive ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <Ionicons name={step.icon} size={13} color={Colors.textMuted} />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.genStepLabel,
                      isDone && styles.genStepLabelDone,
                      isActive && styles.genStepLabelActive,
                    ]}
                  >
                    {step.label}
                    {isActive ? '…' : ''}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Progress bar */}
          <View style={styles.genProgressTrack}>
            <Animated.View
              style={[
                styles.genProgressFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>

          {/* Timer / estimate */}
          <Text style={styles.genTimer}>{genElapsed}s · usually 10–15s</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Step progress bar */}
      <View style={styles.wizardHeader}>
        <Text style={styles.wizardTitle}>Create Your Plan</Text>
        <Text style={styles.wizardStep}>Step {step} of {totalSteps}</Text>
      </View>
      <View style={styles.wizardProgressTrack}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.wizardProgressSegment,
              i < step && styles.wizardProgressSegmentActive,
            ]}
          />
        ))}
      </View>

      {/* Step 1: What are you training for? */}
      {step === 1 && (
        <View>
          <Text style={styles.sectionTitle}>What's your goal?</Text>

          {/* Goal type toggle */}
          <View style={styles.goalTypeRow}>
            <TouchableOpacity
              style={[styles.goalTypeCard, goalType === 'race' && styles.goalTypeCardActive]}
              onPress={() => setGoalType('race')}
              activeOpacity={0.7}
            >
              <Ionicons name="flag" size={22} color={goalType === 'race' ? Colors.primary : Colors.textSecondary} />
              <Text style={[styles.goalTypeLabel, goalType === 'race' && styles.goalTypeLabelActive]}>Race</Text>
              <Text style={[styles.goalTypeDesc, goalType === 'race' && styles.goalTypeDescActive]}>Train for an event</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.goalTypeCard, goalType === 'pace_target' && styles.goalTypeCardActive]}
              onPress={() => setGoalType('pace_target')}
              activeOpacity={0.7}
            >
              <Ionicons name="speedometer" size={22} color={goalType === 'pace_target' ? Colors.primary : Colors.textSecondary} />
              <Text style={[styles.goalTypeLabel, goalType === 'pace_target' && styles.goalTypeLabelActive]}>Pace Goal</Text>
              <Text style={[styles.goalTypeDesc, goalType === 'pace_target' && styles.goalTypeDescActive]}>Hit a target pace</Text>
            </TouchableOpacity>
          </View>

          {/* Race distance (shown for race goal type) */}
          {goalType === 'race' && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>Pick your race</Text>
              <View style={styles.chipRow}>
                {RACE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.raceChip, raceType === opt.value && styles.raceChipActive]}
                    onPress={() => setRaceType(opt.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.raceChipLabel, raceType === opt.value && styles.raceChipLabelActive]}>
                      {opt.label}
                    </Text>
                    {opt.distance ? (
                      <Text style={styles.raceChipDistance}>
                        {paceUnit === 'minPerKm' ? opt.distance.km : opt.distance.mi}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>

              {raceType === 'custom' && (
                <View style={styles.customDistanceSection}>
                  <Text style={styles.customDistanceLabel}>Race Distance</Text>
                  <View style={styles.customDistanceRow}>
                    <TextInput
                      style={styles.customDistanceField}
                      value={customDistance}
                      onChangeText={setCustomDistance}
                      placeholder="e.g. 15"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="decimal-pad"
                      maxLength={6}
                    />
                    <View style={styles.unitToggle}>
                      <TouchableOpacity
                        style={[styles.unitBtn, customDistanceUnit === 'mi' && styles.unitBtnActive]}
                        onPress={() => setCustomDistanceUnit('mi')}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.unitBtnText, customDistanceUnit === 'mi' && styles.unitBtnTextActive]}>mi</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.unitBtn, customDistanceUnit === 'km' && styles.unitBtnActive]}
                        onPress={() => setCustomDistanceUnit('km')}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.unitBtnText, customDistanceUnit === 'km' && styles.unitBtnTextActive]}>km</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </>
          )}

          {/* Pace goal inputs (shown for pace_target goal type) */}
          {goalType === 'pace_target' && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>For what distance?</Text>
              <View style={styles.chipRow}>
                {[
                  { value: 'any' as const, label: 'Any' },
                  { value: '5k' as const, label: '5K' },
                  { value: '10k' as const, label: '10K' },
                  { value: 'half_marathon' as const, label: 'Half' },
                  { value: 'marathon' as const, label: 'Marathon' },
                ].map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.raceChip, paceDistanceContext === opt.value && styles.raceChipActive]}
                    onPress={() => setPaceDistanceContext(opt.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.raceChipLabel, paceDistanceContext === opt.value && styles.raceChipLabelActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.sectionTitle, { marginTop: Spacing.lg, marginBottom: 2 }]}>Target pace</Text>
              <Text style={styles.helperText}>
                The pace you'd like to hold comfortably for {paceDistanceContext === 'any' ? 'your runs' : `a ${paceDistanceLabel}`} — not your sprint speed.
              </Text>

              {profileLoading ? (
                <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: Spacing.md }} />
              ) : (
                <>
                  {/* No data: ask a simple question to estimate current pace */}
                  {!hasDataBaseline && (
                    <>
                      <Text style={styles.questionText}>About how long does it take you to run 1 mile?</Text>
                      <View style={styles.chipRow}>
                        {MILE_ESTIMATE_OPTIONS.map((opt) => (
                          <TouchableOpacity
                            key={opt.value}
                            style={[styles.smallChip, mileEstimate === opt.value && styles.raceChipActive]}
                            onPress={() => setMileEstimate(opt.value)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.smallChipLabel, mileEstimate === opt.value && styles.raceChipLabelActive]}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}

                  {mileEstimate === 'cant_yet' && !hasDataBaseline && (
                    <View style={[styles.effortHint, { alignItems: 'flex-start', marginTop: Spacing.md }]}>
                      <Ionicons name="walk-outline" size={18} color={Colors.accent} />
                      <View style={{ flex: 1, gap: Spacing.sm }}>
                        <Text style={styles.effortHintText}>
                          No problem! A pace goal works best once you can run a mile. A beginner 5K plan builds you up with run/walk intervals, or your coach can pick a gentle starting target.
                        </Text>
                        <View style={styles.inlineBtnRow}>
                          <TouchableOpacity
                            style={styles.inlineBtn}
                            onPress={() => { setGoalType('race'); setRaceType('5k'); }}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.inlineBtnText}>Train for a 5K instead</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.inlineBtn}
                            onPress={() => setCoachPicksPace(true)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.inlineBtnText}>Let my coach pick</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Suggested goals */}
                  {paceBaseline && goalTiers.length > 0 && (
                    <>
                      <Text style={styles.suggestionText}>
                        Based on {paceBaseline.detail}, you're at about{' '}
                        <Text style={styles.suggestionPace}>{formatPace(toDisplayPace(paceBaseline.pace))}{paceSuffix}</Text>
                        {' '}for {paceDistanceContext === 'any' ? 'a 5K' : `a ${paceDistanceLabel}`} now. Goals for ~{planWeeks} weeks of training:
                      </Text>
                      <View style={styles.tierRow}>
                        {goalTiers.map((tier) => {
                          const active = !coachPicksPace && selectedTierId === tier.id;
                          return (
                            <TouchableOpacity
                              key={tier.id}
                              style={[styles.tierChip, active && styles.raceChipActive]}
                              onPress={() => applyGoalPace(tier.pace)}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.tierLabel, active && styles.raceChipLabelActive]}>{tier.label}</Text>
                              <Text style={[styles.tierPace, active && styles.raceChipLabelActive]}>
                                {formatPace(toDisplayPace(tier.pace))}
                              </Text>
                              <Text style={styles.tierPct}>
                                {Math.max(1, Math.round(tier.improvementPct * 100))}% faster
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  )}
                </>
              )}

              {/* Manual entry */}
              {!coachPicksPace && (
                <>
                  {goalTiers.length > 0 && <Text style={styles.questionText}>Or enter your own</Text>}
                  <View style={[styles.goalTimeRow, goalTiers.length === 0 && { marginTop: Spacing.md }]}>
                    <View style={styles.goalTimeInput}>
                      <TextInput
                        style={styles.goalTimeField}
                        value={goalPaceMin}
                        onChangeText={setGoalPaceMin}
                        placeholder={realisticTier ? String(splitPace(toDisplayPace(realisticTier.pace)).min) : '--'}
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="number-pad"
                        maxLength={2}
                      />
                      <Text style={styles.goalTimeLabel}>min</Text>
                    </View>
                    <Text style={{ color: Colors.textSecondary, fontSize: FontSize.lg, marginHorizontal: 2 }}>:</Text>
                    <View style={styles.goalTimeInput}>
                      <TextInput
                        style={styles.goalTimeField}
                        value={goalPaceSec}
                        onChangeText={setGoalPaceSec}
                        placeholder={realisticTier ? String(splitPace(toDisplayPace(realisticTier.pace)).sec).padStart(2, '0') : '00'}
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="number-pad"
                        maxLength={2}
                      />
                      <Text style={styles.goalTimeLabel}>{paceSuffix}</Text>
                    </View>
                  </View>
                </>
              )}

              {paceAssessment !== 'ok' && paceBaseline && (
                <PaceGoalWarning
                  assessment={paceAssessment}
                  currentPace={`${formatPace(toDisplayPace(paceBaseline.pace))}${paceSuffix}`}
                  weeks={planWeeks}
                  realisticPace={realisticTier ? `${formatPace(toDisplayPace(realisticTier.pace))}${paceSuffix}` : null}
                  onUseRealistic={realisticTier ? () => applyGoalPace(realisticTier.pace) : undefined}
                />
              )}

              {/* Let the coach decide */}
              <TouchableOpacity
                style={[styles.coachToggle, coachPicksPace && styles.coachToggleActive]}
                onPress={() => setCoachPicksPace((v) => !v)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={coachPicksPace ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={coachPicksPace ? Colors.primary : Colors.textSecondary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.coachToggleTitle, coachPicksPace && { color: Colors.primary }]}>
                    Not sure? Let my coach pick
                  </Text>
                  <Text style={styles.coachToggleDesc}>
                    Week 1 starts with an easy baseline run, and your coach sets a realistic target for you.
                  </Text>
                </View>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={[styles.continueBtn, { marginTop: Spacing.lg }]}
            onPress={() => { if (validatePaceGoal()) setStep(2); }}
            activeOpacity={0.8}
          >
            <Text style={styles.continueBtnText}>Continue</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.black} />
          </TouchableOpacity>
        </View>
      )}

      {/* Step 2: Dates & Goal */}
      {step === 2 && (
        <View>
          {/* Overlap notice — only shown when user has at least one active plan */}
          {activePlans.length > 0 && (
            <View style={styles.overlapNotice}>
              <Ionicons name="information-circle-outline" size={18} color={Colors.accent} />
              <Text style={styles.overlapNoticeText}>
                You have an active plan. New plans can't overlap with existing ones — you'll be asked to archive any conflicts before generating.
              </Text>
            </View>
          )}

          {/* Real-time overlap warning */}
          {overlapInfo && (
            <View style={styles.overlapWarning}>
              <Ionicons name="alert-circle" size={18} color={Colors.warning} />
              <Text style={styles.overlapWarningText}>
                These dates overlap with {overlapInfo.length === 1 ? `"${overlapInfo[0]}"` : overlapInfo.map((n) => `"${n}"`).join(' and ')}. You'll need to archive {overlapInfo.length === 1 ? 'it' : 'them'} or adjust your dates to avoid stacked workouts.
              </Text>
            </View>
          )}

          {/* Target / Race date */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{goalType === 'pace_target' ? 'Target Date' : 'Race Date'}</Text>
              {Platform.OS === 'ios' ? (
                <View style={styles.datePickerRow}>
                  <Ionicons name="calendar-outline" size={18} color={Colors.textSecondary} />
                  <DateTimePicker
                    value={raceDate}
                    mode="date"
                    display="compact"
                    minimumDate={new Date()}
                    onChange={(_, date) => { if (date) setRaceDate(date); }}
                    themeVariant="dark"
                    accentColor={Colors.primary}
                  />
                </View>
              ) : (
                <>
                  <TouchableOpacity style={styles.dateBtn} onPress={() => setShowRaceDatePicker(true)} activeOpacity={0.7}>
                    <Ionicons name="calendar-outline" size={18} color={Colors.textSecondary} />
                    <Text style={styles.dateBtnText}>{formatDateShort(raceDate)}</Text>
                  </TouchableOpacity>
                  {showRaceDatePicker && (
                    <DateTimePicker
                      value={raceDate}
                      mode="date"
                      minimumDate={new Date()}
                      onChange={(_, date) => { setShowRaceDatePicker(false); if (date) setRaceDate(date); }}
                      themeVariant="dark"
                    />
                  )}
                </>
              )}
            </View>

          {/* Start date */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Training Start Date</Text>
            {Platform.OS === 'ios' ? (
              <View style={styles.datePickerRow}>
                <Ionicons name="calendar-outline" size={18} color={Colors.textSecondary} />
                <DateTimePicker
                  value={startDate}
                  mode="date"
                  display="compact"
                  minimumDate={new Date()}
                  onChange={(_, date) => { if (date) setStartDate(date); }}
                  themeVariant="dark"
                  accentColor={Colors.primary}
                />
              </View>
            ) : (
              <>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowStartDatePicker(true)} activeOpacity={0.7}>
                  <Ionicons name="calendar-outline" size={18} color={Colors.textSecondary} />
                  <Text style={styles.dateBtnText}>{formatDateShort(startDate)}</Text>
                </TouchableOpacity>
                {showStartDatePicker && (
                  <DateTimePicker
                    value={startDate}
                    mode="date"
                    minimumDate={new Date()}
                    onChange={(_, date) => { setShowStartDatePicker(false); if (date) setStartDate(date); }}
                    themeVariant="dark"
                  />
                )}
              </>
            )}
          </View>

          {/* Goal time — only for race plans (pace goal is set in step 1) */}
          {goalType === 'race' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Race Goal Time (optional)</Text>
              <View style={styles.goalTimeRow}>
                <View style={styles.goalTimeInput}>
                  <TextInput
                    style={styles.goalTimeField}
                    value={goalTimeHours}
                    onChangeText={setGoalTimeHours}
                    placeholder="0"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                  <Text style={styles.goalTimeLabel}>hours</Text>
                </View>
                <View style={styles.goalTimeInput}>
                  <TextInput
                    style={styles.goalTimeField}
                    value={goalTimeMinutes}
                    onChangeText={setGoalTimeMinutes}
                    placeholder="0"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                  <Text style={styles.goalTimeLabel}>min</Text>
                </View>
              </View>
            </View>
          )}

          <View style={styles.stepNavRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={18} color={Colors.textSecondary} />
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.continueBtn} onPress={() => setStep(3)} activeOpacity={0.8}>
              <Text style={styles.continueBtnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={18} color={Colors.black} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Step 3: Availability */}
      {step === 3 && (
        <View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Training Days per Week</Text>
            <View style={styles.chipRow}>
              {DAYS_PER_WEEK_OPTIONS.map((n) => {
                const isSelected = selectedDays.has(n);
                return (
                  <TouchableOpacity
                    key={n}
                    style={[styles.dayChip, isSelected && styles.dayChipActive]}
                    onPress={() => {
                      const next = new Set(selectedDays);
                      if (next.has(n) && next.size > 1) {
                        next.delete(n);
                      } else {
                        next.add(n);
                      }
                      setSelectedDays(next);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dayChipText, isSelected && styles.dayChipTextActive]}>
                      {n}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.stepNavRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setStep(2)} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={18} color={Colors.textSecondary} />
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.continueBtn} onPress={() => setStep(4)} activeOpacity={0.8}>
              <Text style={styles.continueBtnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={18} color={Colors.black} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Step 4: Review & Generate */}
      {step === 4 && (
        <View>
          <Text style={styles.sectionTitle}>Review & Generate</Text>

          {/* Review summary */}
          <View style={styles.reviewCard}>
            {goalType === 'pace_target' ? (
              <>
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>Goal</Text>
                  <Text style={styles.reviewValue}>Pace Target</Text>
                </View>
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>Target Pace</Text>
                  <Text style={styles.reviewValue}>
                    {coachPicksPace ? 'Coach will choose' : `${typedPaceLabel ?? '--:--'}${paceSuffix}`}
                  </Text>
                </View>
                {paceDistanceContext !== 'any' && (
                  <View style={styles.reviewRow}>
                    <Text style={styles.reviewLabel}>Distance</Text>
                    <Text style={styles.reviewValue}>
                      {RACE_OPTIONS.find((o) => o.value === paceDistanceContext)?.label ?? paceDistanceContext}
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Race</Text>
                <Text style={styles.reviewValue}>
                  {raceType === 'custom' && customDistance
                    ? `${customDistance} ${customDistanceUnit}`
                    : RACE_OPTIONS.find((o) => o.value === raceType)?.label}
                </Text>
              </View>
            )}
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Start Date</Text>
              <Text style={styles.reviewValue}>{formatDateShort(startDate)}</Text>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>{goalType === 'pace_target' ? 'Target Date' : 'Race Date'}</Text>
              <Text style={styles.reviewValue}>{formatDateShort(raceDate)}</Text>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Days / Week</Text>
              <Text style={styles.reviewValue}>
                {[...selectedDays].sort((a, b) => a - b).join(', ')}
              </Text>
            </View>
            {goalType === 'race' && (goalTimeHours || goalTimeMinutes) && (
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Goal Time</Text>
                <Text style={styles.reviewValue}>
                  {goalTimeHours ? `${goalTimeHours}h ` : ''}{goalTimeMinutes || '0'}m
                </Text>
              </View>
            )}
          </View>

          {goalType === 'pace_target' && coachPicksPace && (
            <View style={styles.effortHint}>
              <Ionicons name="analytics-outline" size={18} color={Colors.accent} />
              <Text style={styles.effortHintText}>
                Your plan starts with a baseline run so your coach can set a realistic target pace.
              </Text>
            </View>
          )}

          {paceAssessment !== 'ok' && paceBaseline && (
            <PaceGoalWarning
              assessment={paceAssessment}
              currentPace={`${formatPace(toDisplayPace(paceBaseline.pace))}${paceSuffix}`}
              weeks={planWeeks}
              realisticPace={realisticTier ? `${formatPace(toDisplayPace(realisticTier.pace))}${paceSuffix}` : null}
              onUseRealistic={realisticTier ? () => applyGoalPace(realisticTier.pace) : undefined}
            />
          )}

          {/* Profile summary — opens sheet on tap */}
          <TouchableOpacity
            style={styles.profileCard}
            onPress={() => setProfileSheetVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="person-circle-outline" size={28} color={Colors.textSecondary} />
            <View style={styles.profileInfo}>
              {profileLoading ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : profile ? (
                <>
                  <Text style={styles.profileName}>
                    {profile.experience_level?.charAt(0).toUpperCase()}{profile.experience_level?.slice(1)} runner
                    {profile.typical_run_minutes
                      ? profile.typical_run_minutes_max
                        ? ` \u00B7 ${profile.typical_run_minutes}\u2013${profile.typical_run_minutes_max} min`
                        : ` \u00B7 ${profile.typical_run_minutes} min`
                      : ''}
                  </Text>
                  <Text style={styles.profilePaces}>
                    {profile.easy_pace ? `Easy: ${formatUnitPace(profile.easy_pace, paceUnit)}` : ''}
                    {profile.easy_pace && profile.fast_pace ? ' \u00B7 ' : ''}
                    {profile.fast_pace ? `Fast: ${formatUnitPace(profile.fast_pace, paceUnit)}` : ''}
                  </Text>
                </>
              ) : (
                <Text style={styles.profileEmpty}>Set up your running profile</Text>
              )}
            </View>
            <Text style={styles.profileEdit}>Edit</Text>
          </TouchableOpacity>

          {/* Effort-based hint when no pace data */}
          {!profile?.easy_pace && !profile?.fast_pace && (
            <View style={styles.effortHint}>
              <Ionicons name="information-circle-outline" size={18} color={Colors.accent} />
              <Text style={styles.effortHintText}>
                Don't know your paces yet? No problem — we'll use effort-based targets (easy, moderate, hard) instead.
              </Text>
            </View>
          )}

          {/* Pro gate — value prop */}
          {!canGeneratePlan && (
            <View style={styles.proGateCard}>
              <View style={styles.proGateHeader}>
                <Ionicons name="sparkles" size={20} color={Colors.accent} />
                <Text style={styles.proGateTitle}>Smarter Workouts, Every Week</Text>
              </View>
              <Text style={styles.proGateDesc}>
                Every workout is shaped by your past runs and race goals — so your training always fits where you are today.
              </Text>
              <Text style={styles.proGateFooter}>
                You've used your free plan. Go Pro for unlimited AI plans.
              </Text>
            </View>
          )}

          <View style={styles.stepNavRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setStep(3)} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={18} color={Colors.textSecondary} />
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.generateBtn, !canGeneratePlan && styles.generateBtnPro, { flex: 1 }]}
              onPress={handleGenerate}
              activeOpacity={0.8}
            >
              <Ionicons name={canGeneratePlan ? 'sparkles' : 'lock-closed'} size={18} color={Colors.black} />
              <Text style={styles.generateBtnText}>
                {canGeneratePlan ? 'Generate Plan' : 'Go Pro & Generate'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Profile editing sheet */}
      {user && (
        <ProfileSheet
          visible={profileSheetVisible}
          userId={user.id}
          onClose={() => {
            setProfileSheetVisible(false);
            fetchProfile();
          }}
        />
      )}
    </ScrollView>
  );
}

function PaceGoalWarning({
  assessment,
  currentPace,
  weeks,
  realisticPace,
  onUseRealistic,
}: {
  assessment: 'aggressive' | 'already_there';
  currentPace: string;
  weeks: number;
  realisticPace: string | null;
  onUseRealistic?: () => void;
}) {
  const message = assessment === 'aggressive'
    ? `That's a big jump from your current ~${currentPace} in ${weeks} weeks, which raises injury and burnout risk.`
    : `You may already be at this pace (~${currentPace}). A slightly faster goal will give your training more direction.`;

  return (
    <View style={[styles.overlapWarning, { alignItems: 'flex-start', marginTop: Spacing.md, marginBottom: 0 }]}>
      <Ionicons name="alert-circle" size={18} color={Colors.warning} />
      <View style={{ flex: 1, gap: Spacing.sm }}>
        <Text style={styles.overlapWarningText}>{message}</Text>
        {realisticPace && onUseRealistic && (
          <TouchableOpacity style={styles.inlineBtn} onPress={onUseRealistic} activeOpacity={0.7}>
            <Text style={styles.inlineBtnText}>Use realistic goal ({realisticPace})</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
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
  signInBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.xl * 2,
    marginTop: Spacing.md,
  },
  signInBtnText: {
    color: Colors.black,
    fontSize: FontSize.md,
    fontWeight: '700',
  },

  // Profile card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  profileInfo: { flex: 1 },
  profileName: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  profilePaces: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  profileEmpty: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  profileEdit: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.primary,
  },

  // Sections
  section: { marginBottom: Spacing.lg },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },

  // Race chips
  goalTypeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  goalTypeCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.surfaceLight,
    alignItems: 'center',
    gap: 4,
  },
  goalTypeCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  goalTypeLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  goalTypeLabelActive: {
    color: Colors.primary,
  },
  goalTypeDesc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  goalTypeDescActive: {
    color: Colors.primary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  raceChip: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.surfaceLight,
    alignItems: 'center',
  },
  raceChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  raceChipLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  raceChipLabelActive: {
    color: Colors.primary,
  },
  raceChipDistance: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 1,
  },

  // Pace goal
  helperText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  questionText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  smallChip: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm + 4,
    borderWidth: 2,
    borderColor: Colors.surfaceLight,
  },
  smallChipLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  suggestionText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  suggestionPace: {
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  tierRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  tierChip: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    borderWidth: 2,
    borderColor: Colors.surfaceLight,
    alignItems: 'center',
    gap: 2,
  },
  tierLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  tierPace: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  tierPct: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  coachToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    borderWidth: 2,
    borderColor: Colors.surfaceLight,
  },
  coachToggleActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  coachToggleTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  coachToggleDesc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  inlineBtnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  inlineBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.sm + 2,
  },
  inlineBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  // Custom distance
  customDistanceSection: {
    marginTop: Spacing.md,
  },
  customDistanceLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  customDistanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  customDistanceField: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSize.lg,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    overflow: 'hidden' as const,
  },
  unitBtn: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md + 4,
  },
  unitBtnActive: {
    backgroundColor: Colors.primary + '20',
  },
  unitBtnText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  unitBtnTextActive: {
    color: Colors.primary,
  },

  // Date buttons
  datePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  dateBtnText: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },

  // Goal time
  goalTimeRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  goalTimeInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  goalTimeField: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSize.lg,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
    width: 60,
    textAlign: 'center',
  },
  goalTimeLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },

  // Days per week
  dayChip: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    borderColor: Colors.surfaceLight,
  },
  dayChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '15',
  },
  dayChipText: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  dayChipTextActive: {
    color: Colors.primary,
  },

  // Generate
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    minHeight: 50,
  },
  generateBtnText: {
    color: Colors.black,
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  generateBtnPro: {
    backgroundColor: Colors.accent,
  },
  // Wizard
  wizardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  wizardTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  wizardStep: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  wizardProgressTrack: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: Spacing.xl,
  },
  wizardProgressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceLight,
  },
  wizardProgressSegmentActive: {
    backgroundColor: Colors.primary,
  },
  continueBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  continueBtnText: {
    color: Colors.black,
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  stepNavRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
    minHeight: 50,
  },
  backBtnText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  reviewCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceLight,
  },
  reviewLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  reviewValue: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  effortHint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent + '12',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  effortHintText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.accent,
    lineHeight: 20,
  },
  overlapNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent + '12',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  overlapNoticeText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.accent,
    lineHeight: 20,
  },
  overlapWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warning + '14',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.warning + '30',
  },
  overlapWarningText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.warning,
    lineHeight: 20,
  },
  proGateCard: {
    backgroundColor: Colors.accent + '10',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.accent + '30',
  },
  proGateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  proGateTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.accent,
  },
  proGateDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  proGateFooter: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },

  // Generation progress overlay
  genScreen: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  genCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  genHeader: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  genSparkleWrap: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.accent + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  genTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  genSteps: {
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  genStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
  },
  genStepCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genStepCircleDone: {
    backgroundColor: Colors.primary,
  },
  genStepCircleActive: {
    backgroundColor: Colors.primary + '18',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  genStepLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: '500',
    flex: 1,
  },
  genStepLabelDone: {
    color: Colors.textSecondary,
  },
  genStepLabelActive: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  genProgressTrack: {
    height: 6,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 3,
    overflow: 'hidden' as const,
    marginBottom: Spacing.lg,
  },
  genProgressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  genTimer: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    fontVariant: ['tabular-nums'] as any,
  },
});
