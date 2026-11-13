/**
 * Active Workout screen — the heart of SplitCue.
 *
 * Full-screen countdown timer with big type, progress bar,
 * and start/pause/resume/skip controls.
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  Modal,
  ScrollView,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import {
  WorkoutDefinition,
  FlatInterval,
  formatTime,
  AppSettings,
  DEFAULT_SETTINGS,
  AudioCueMode,
  TimeRemainingInterval,
  isDistanceInterval,
  formatDistanceShort,
  hasDistanceFeature,
  WORKOUT_TAG_GROUPS,
  categorizeWorkout,
  estimatedPlannedSeconds,
  type CompletedWorkout,
} from '../../../src/workout/workoutTypes';
import { resolveWorkoutSource, runQualifies, getRunHistoryContext } from '../../../src/analytics/workoutContext';
import { FirstRunCheck } from '../../../src/components/FirstRunCheck';
import { buildCueContext } from '../../../src/audio/cuePhrases';
import { DISCARD_WINDOW_MS } from '../../../src/analytics/falseStarts';
import { suggestNextRun } from '../../../src/workout/nextRunSuggestion';
import { NextRunSuggestionCard, type SuggestionStatus } from '../../../src/components/NextRunSuggestionCard';
import { addWorkoutToCalendar } from '../../../src/ai/planService';
import { useAuth } from '../../../src/contexts/AuthContext';
import type { PaceCueFrequency } from '../../../src/pace/paceTypes';
import { paceCuesEnabled, distanceProgressCuesNeedGps } from '../../../src/audio/cueSchedule';
import {
  CueBasisToggle,
  CueDistanceChips,
  PROGRESS_CUE_BASES,
  AUTO_TIME_STEP_LABEL,
  AUTO_DISTANCE_STEP_LABEL,
} from '../../../src/components/CueScheduleControls';
import { loadWorkouts, loadSettings, saveSettings } from '../../../src/workout/workoutStorage';
import { getTempWorkout, getTempWorkoutMeta, clearTempWorkout } from '../../../src/workout/tempWorkoutCache';
import { loadActiveSession, type ActiveSessionSnapshot } from '../../../src/workout/activeSession';
import { useWorkoutRunner, type SessionMeta } from '../../../src/hooks/useWorkoutRunner';
import { Timer } from '../../../src/components/Timer';
import { IntervalProgress } from '../../../src/components/IntervalProgress';
import { formatPaceDisplay, formatDistance } from '../../../src/pace/paceTracker';
import { paceToUnit } from '../../../src/units/format';
import { currentInterval as getCurrentInterval } from '../../../src/workout/workoutEngine';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Colors,
  Spacing,
  FontSize,
  BorderRadius,
  MaxFontScale,
  intervalColor,
} from '../../../src/constants/theme';
import { useLargeText, useScaledSize } from '../../../src/hooks/useLargeText';
import { hapticTap } from '../../../src/audio/haptics';
import { setDuckingEnabled, setVoiceIdentifier, playCue } from '../../../src/audio/audioManager';
import { prepareWorkoutAudio } from '../../../src/audio/prepareVoice';
import { PreRunSettings } from '../../../src/components/PreRunSettings';
import { HeartRateBadge } from '../../../src/components/HeartRateBadge';
import { PreRunHeartRateCard } from '../../../src/components/PreRunHeartRateCard';
import { PreRunLocationCard, BackgroundLocationCard } from '../../../src/components/LocationPermissionCards';
import { useLocationAccess } from '../../../src/hooks/useLocationAccess';

import { PrimaryAchievement } from '../../../src/components/PersonalBests';
import { StravaPushButton } from '../../../src/strava/StravaPushButton';
import { useStrava } from '../../../src/strava/useStrava';
import { pushWorkoutToStrava } from '../../../src/strava/stravaService';
import { useRunAnnotations } from '../../../src/hooks/useRunAnnotations';
import { track } from '../../../src/analytics/track';
import { requestReviewAfterRun } from '../../../src/review/storeReview';
import { requestCalendarDate } from '../../../src/navigation/calendarFocus';
import { loadHistory } from '../../../src/workout/workoutStorage';
import { useTrainingPlan } from '../../../src/contexts/TrainingPlanContext';
import { RunReviewCard } from '../../../src/components/RunReviewCard';
import { detectNewRecords, detectNewAwards } from '../../../src/stats/personalRecords';
import type { PersonalRecord, AwardBadge } from '../../../src/stats/personalRecords';
import { useShareSheet } from '../../../src/components/ShareSheet';
import { PostRunShareCard } from '../../../src/components/PostRunShareCard';
import { SharedResultComparison } from '../../../src/components/SharedResultComparison';
import { compareResults, resultOf } from '../../../src/sharing/shareText';
import { recordShareEvent } from '../../../src/sharing/shareWorkout';
import { markInvitePromptShown, shouldShowInvitePrompt } from '../../../src/sharing/shareApp';
import { InviteFriendCard } from '../../../src/components/InviteFriendCard';
import { AchievementMomentCard } from '../../../src/components/AchievementMomentCard';
import { pickAchievementMoment } from '../../../src/stats/achievementMoment';
import { computeIntervalConsistency } from '../../../src/stats/intervalConsistency';
import type { AchievementMoment } from '../../../src/sharing/shareText';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const STRAVA_ORANGE = '#FC5200';

const FEEL_EMOJI: Record<string, string> = {
  Strong: '💪',
  Good: '😊',
  OK: '😐',
  Tough: '😫',
};

const FEEL_TAGS: readonly string[] =
  WORKOUT_TAG_GROUPS.find((g) => g.category === 'feel')?.tags ?? [];

const FEEL_OPTIONS = FEEL_TAGS.map((tag) => ({ tag, emoji: FEEL_EMOJI[tag] ?? '•' }));

function localDateKey(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function intervalLengthText(
  interval: FlatInterval,
  paceUnit: import('../../../src/pace/paceTypes').PaceUnit,
): string {
  if (interval.openEnded) return 'Open';
  return isDistanceInterval(interval)
    ? formatDistanceShort(interval.distanceMeters!, paceUnit)
    : formatTime(interval.durationSeconds);
}

export default function ActiveWorkoutScreen() {
  const { id, resume } = useLocalSearchParams<{ id: string; resume?: string }>();
  const router = useRouter();
  const [workout, setWorkout] = useState<WorkoutDefinition | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [sessionMeta, setSessionMeta] = useState<SessionMeta | undefined>();
  const [resumeFrom, setResumeFrom] = useState<ActiveSessionSnapshot | undefined>();

  useEffect(() => {
    const saved = resume === '1' ? loadActiveSession() : null;
    if (saved && saved.workout.id === id) {
      setSessionMeta(saved.sessionMeta);
      setResumeFrom(saved);
      setWorkout(saved.workout);
      loadSettings().then((s) => {
        setSettings(s);
        setSettingsLoaded(true);
      });
      return;
    }


    const trackOpened = (w: WorkoutDefinition, meta?: SessionMeta) =>
      track('run_screen_opened', {
        workout_id: w.id,
        template_id: meta?.templateId,
        plan_workout_id: meta?.planWorkoutId,
        quick_start_type: meta?.quickStartType,
        workout_source: resolveWorkoutSource(meta),
        workout_origin: w.origin ?? 'manual',
        workout_category: categorizeWorkout(w),
      });

    const cached = getTempWorkout(id!);
    if (cached) {
      const meta = getTempWorkoutMeta(id!);
      clearTempWorkout(id!);
      setWorkout(cached);
      setSessionMeta(meta ? { ...meta } : undefined);
      trackOpened(cached, meta);
      loadSettings().then((s) => {
        setSettings(s);
        setSettingsLoaded(true);
      });
    } else {
      Promise.all([loadWorkouts(), loadSettings()]).then(([workouts, s]) => {
        const found = workouts.find((w) => w.id === id);
        if (found) {
          setWorkout(found);
          const meta: SessionMeta = { source: 'saved_template', templateId: found.id };
          setSessionMeta(meta);
          trackOpened(found, meta);
        }
        setSettings(s);
        setSettingsLoaded(true);
      });
    }
  }, [id, resume]);

  // Settings start as defaults until loaded, so only prepare once both are real.
  useEffect(() => {
    if (workout && settingsLoaded) prepareWorkoutAudio(workout, settings);
  }, [workout, settings, settingsLoaded]);

  const updateSettings = useCallback(async (partial: Partial<AppSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    await saveSettings(next);
    if ('duckOtherAudio' in partial) {
      setDuckingEnabled(next.duckOtherAudio);
    }
    if ('voiceIdentifier' in partial) {
      setVoiceIdentifier(next.voiceIdentifier);
    }
  }, [settings]);

  if (!workout) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ActiveWorkoutInner
      workout={workout}
      settings={settings}
      onUpdateSettings={updateSettings}
      sessionMeta={sessionMeta}
      resumeFrom={resumeFrom}
    />
  );
}

function ActiveWorkoutInner({
  workout,
  settings,
  onUpdateSettings,
  sessionMeta,
  resumeFrom,
}: {
  workout: WorkoutDefinition;
  settings: AppSettings;
  onUpdateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  sessionMeta?: SessionMeta;
  resumeFrom?: ActiveSessionSnapshot;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const large = useLargeText();
  const runner = useWorkoutRunner(workout, settings, sessionMeta, resumeFrom);
  const {
    completeWorkout: completePlanWorkout,
    ensurePlan,
    planWorkouts,
    refresh: refreshPlans,
  } = useTrainingPlan();
  const { user } = useAuth();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [newRecords, setNewRecords] = useState<PersonalRecord[]>([]);
  const [newAwards, setNewAwards] = useState<AwardBadge[]>([]);
  const planCompletionDone = useRef(false);
  const annotations = useRunAnnotations(runner.completedEntryId);
  const strava = useStrava();
  const { access: locationAccess, request: requestLocation } = useLocationAccess();
  const locationAsked = useRef(false);

  const { state } = runner;
  const needsGps =
    settings.paceTrackingEnabled ||
    hasDistanceFeature(workout) ||
    distanceProgressCuesNeedGps(settings);

  const handleAllowLocation = useCallback(() => {
    locationAsked.current = true;
    requestLocation().catch(() => {});
  }, [requestLocation]);

  const [isFirstRun, setIsFirstRun] = useState(false);
  useEffect(() => {
    if (resumeFrom) return;
    getRunHistoryContext().then((h) => setIsFirstRun(h.is_first_run));
  }, [resumeFrom]);

  const firstRunCheckTracked = useRef(false);
  useEffect(() => {
    if (!isFirstRun || state.phase !== 'idle' || locationAccess == null || firstRunCheckTracked.current) return;
    firstRunCheckTracked.current = true;
    track('first_run_check_shown', {
      needs_gps: needsGps,
      location_access: locationAccess,
      audio_cue_mode: settings.audioCueMode,
    });
  }, [isFirstRun, state.phase, locationAccess, needsGps, settings.audioCueMode]);

  const handleTurnOnVoice = useCallback(() => {
    hapticTap();
    track('first_run_check_voice_turned_on', { previous_mode: settings.audioCueMode });
    onUpdateSettings({ audioCueMode: settings.audioCueMode === 'beeps' ? 'both' : 'voice' });
  }, [settings.audioCueMode, onUpdateSettings]);

  const handleTestCue = useCallback(() => {
    hapticTap();
    track('first_run_check_test_cue', { audio_cue_mode: settings.audioCueMode });
    const [first, second] = state.intervals;
    if (!first) return;
    playCue('intervalStart', settings.audioCueMode, buildCueContext(first, second ?? null, settings.paceUnit));
  }, [state.intervals, settings.audioCueMode, settings.paceUnit]);

  const handleStart = async () => {
    hapticTap();
    // Ask before the timer starts if the user skipped the pre-run card.
    if (needsGps && locationAccess === 'askable' && !locationAsked.current) {
      locationAsked.current = true;
      await requestLocation().catch(() => {});
    }
    runner.start();
  };

  // Detect new personal records when the workout finishes
  const [showInvite, setShowInvite] = useState(false);
  const [moment, setMoment] = useState<AchievementMoment | null>(null);
  useEffect(() => {
    if (state.phase !== 'finished' || !runner.completedEntryId) return;
    loadHistory().then(async (history) => {
      const records = detectNewRecords(history, runner.completedEntryId!, settings.paceUnit);
      const awards = detectNewAwards(history, runner.completedEntryId!);
      setNewRecords(records);
      setNewAwards(awards);
      const finished = history.find((w) => w.id === runner.completedEntryId);
      const picked = finished
        ? pickAchievementMoment({
            records,
            awards,
            run: finished,
            totals: {
              workouts: history.length,
              distanceMeters: history.reduce((s, w) => s + (w.totalDistanceMeters ?? 0), 0),
            },
            unit: settings.paceUnit,
          })
        : null;
      setMoment(picked);
      if (picked) track('achievement_moment_shown', { achievement_id: picked.id, kicker: picked.kicker });
      if (await shouldShowInvitePrompt(history.length)) {
        markInvitePromptShown();
        track('invite_prompt_shown', { completed_runs: history.length });
        setShowInvite(true);
      }
    }).catch(() => {});
  }, [state.phase, runner.completedEntryId, settings.paceUnit]);

  // Mark the plan workout as completed when a plan run finishes
  useEffect(() => {
    if (
      state.phase !== 'finished' ||
      !runner.completedEntryId ||
      !sessionMeta?.planWorkoutId ||
      planCompletionDone.current
    ) return;
    planCompletionDone.current = true;
    const completedRun = buildCompletedEntry() ?? undefined;
    completePlanWorkout(sessionMeta.planWorkoutId, runner.completedEntryId, completedRun).catch((e) =>
      console.warn('Failed to complete plan workout:', e),
    );
  }, [state.phase, runner.completedEntryId, sessionMeta?.planWorkoutId, completePlanWorkout]);

  const finishedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (state.phase === 'finished' && finishedAtRef.current == null) {
      finishedAtRef.current = Date.now();
    }
  }, [state.phase]);

  const selectedFeel = annotations.tags.find((t) => FEEL_TAGS.includes(t)) ?? null;

  const handleFeelPress = useCallback(
    (tag: string) => {
      hapticTap();
      const others = annotations.tags.filter((t) => !FEEL_TAGS.includes(t));
      const cleared = selectedFeel === tag;
      annotations.setTags(cleared ? others : [...others, tag]);
      if (!cleared) track('post_workout_feel_selected', { tag });
    },
    [annotations, selectedFeel],
  );

  /** The saved history entry as it stands now, for uploading. */
  const buildCompletedEntry = (): CompletedWorkout | null => {
    if (!runner.completedEntryId) return null;
    const distance = runner.paceState.totalDistanceMeters;
    return {
      id: runner.completedEntryId,
      workoutId: workout.id,
      workoutName: workout.name,
      completedAt: finishedAtRef.current ?? Date.now(),
      totalDurationMs: state.totalElapsedMs,
      totalDistanceMeters: distance > 0 ? distance : undefined,
      route: runner.completedRoute ?? undefined,
      splits: runner.completedSplits ?? undefined,
      heartRate: runner.completedHeartRate ?? undefined,
      configuration: workout,
      tags: annotations.tags.length > 0 ? annotations.tags : undefined,
    };
  };

  const autoUploadEnabled = settings.stravaAutoUpload && strava.isConnected;

  // Auto-upload runs once, when the runner leaves this screen, so the
  // feeling they picked is included. The ref keeps the unmount fallback
  // pointed at the latest state.
  const autoUploadStarted = useRef(false);
  const startAutoUploadRef = useRef<() => void>(() => {});
  startAutoUploadRef.current = () => {
    if (autoUploadStarted.current || !autoUploadEnabled) return;
    const entry = buildCompletedEntry();
    if (!entry) return;
    autoUploadStarted.current = true;
    pushWorkoutToStrava(entry, 'auto').catch(() => {});
  };
  useEffect(() => () => startAutoUploadRef.current(), []);

  const leaveFinishedScreen = useCallback(() => {
    annotations.flush();
    startAutoUploadRef.current();
    router.dismissAll();
    requestReviewAfterRun({ completed: runner.runCompleted, feel: selectedFeel });
  }, [annotations, router, runner.runCompleted, selectedFeel]);

  // Keep screen awake during workout
  useEffect(() => {
    if (settings.keepScreenOn) {
      activateKeepAwakeAsync('workout');
    }
    return () => {
      deactivateKeepAwake('workout');
    };
  }, [settings.keepScreenOn]);

  const color = intervalColor(runner.currentType);
  const finishesRun = runner.isOpenEnded && state.currentIndex === state.intervals.length - 1;

  const handleStop = () => {
    if (runner.elapsedSeconds * 1000 < DISCARD_WINDOW_MS) {
      Alert.alert('Discard Run?', "Runs under a minute aren't saved.", [
        { text: 'Keep Going', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => runner.discard() },
      ]);
      return;
    }
    if (finishesRun) {
      Alert.alert('Finish Run', 'Done running?', [
        { text: 'Keep Going', style: 'cancel' },
        { text: 'Finish', onPress: () => runner.skip() },
      ]);
      return;
    }
    Alert.alert('End Workout', 'Are you sure you want to stop?', [
      { text: 'Keep Going', style: 'cancel' },
      {
        text: 'Stop',
        style: 'destructive',
        onPress: () => {
          runner.stop();
        },
      },
    ]);
  };

  const handleFinishedDone = useCallback(() => {
    hapticTap();
    track('post_workout_done', { selected_feel: selectedFeel });
    leaveFinishedScreen();
    router.navigate('/(tabs)' as any);
  }, [leaveFinishedScreen, router, selectedFeel]);

  const handleViewDetails = useCallback(() => {
    const entryId = runner.completedEntryId;
    if (!entryId) return;
    hapticTap();
    track('post_workout_details_opened', { selected_feel: selectedFeel });
    leaveFinishedScreen();
    router.push(`/run/${entryId}` as any);
  }, [leaveFinishedScreen, router, runner.completedEntryId, selectedFeel]);

  // ── Sharing ──
  const { openShare, shareSheet } = useShareSheet();
  const sharedFrom = workout.sharedFrom;

  const handleShareRun = (kind: 'results' | 'challenge' | 'achievement') => {
    const entry = buildCompletedEntry();
    if (!entry) return;
    openShare({
      kind,
      workout,
      workoutName: workout.name,
      run: entry,
      replyTo: kind === 'challenge' ? sharedFrom : undefined,
      achievement: kind === 'achievement' ? moment ?? undefined : undefined,
      surface:
        kind === 'achievement'
          ? 'achievement_moment'
          : sharedFrom && kind === 'challenge'
            ? 'workout_complete_reply'
            : 'workout_complete',
      records: newRecords,
      awards: newAwards,
    });
  };

  // Count a finished run of a friend's shared workout once.
  const shareCompletionTracked = useRef(false);
  useEffect(() => {
    if (state.phase !== 'finished' || !runner.completedEntryId || !sharedFrom) return;
    if (shareCompletionTracked.current) return;
    shareCompletionTracked.current = true;
    recordShareEvent(sharedFrom.code, 'complete');
    const entry = buildCompletedEntry();
    const mine = resultOf({ totalDurationMs: state.totalElapsedMs, totalDistanceMeters: runner.paceState.totalDistanceMeters });
    const consistency = computeIntervalConsistency(entry?.splits);
    if (consistency) mine.consistency = consistency.score;
    const comparison =
      sharedFrom.result && !sharedFrom.modified
        ? compareResults(mine, sharedFrom.result, settings.paceUnit, sharedFrom.challengeType)
        : null;
    track('shared_workout_completed', {
      workout_id: workout.id,
      share_code: sharedFrom.code ?? null,
      has_sender_result: !!sharedFrom.result,
      beat_sender: comparison ? comparison.deltaSeconds > 0 : null,
      comparison_basis: comparison?.basis ?? null,
      challenge_type: sharedFrom.challengeType ?? null,
      modified_workout: !!sharedFrom.modified,
      consistency_score: consistency?.score ?? null,
    });
  }, [state.phase, runner.completedEntryId]);

  // ── Next-run suggestion ──
  // Offered after a run that counts, unless the calendar already has one in the next few days.
  const plannedMs = estimatedPlannedSeconds(state.intervals) * 1000;
  const runCounts =
    runQualifies(state.totalElapsedMs, plannedMs) || runner.paceState.totalDistanceMeters >= 1000;
  const hasUpcomingPlanned = planWorkouts.some(
    (pw) =>
      pw.status === 'planned' &&
      pw.id !== sessionMeta?.planWorkoutId &&
      pw.date >= localDateKey(0) &&
      pw.date <= localDateKey(3) &&
      !pw.day_label?.toLowerCase().includes('rest'),
  );
  const nextRun = useMemo(
    () =>
      state.phase === 'finished' && runner.completedEntryId && runCounts && !hasUpcomingPlanned
        ? suggestNextRun(workout, state.totalElapsedMs, settings)
        : null,
    // Suggest once per finished run; later settings or plan changes shouldn't swap it out.
    [state.phase, runner.completedEntryId],
  );
  const [suggestionStatus, setSuggestionStatus] = useState<SuggestionStatus>('idle');
  const pendingSignInAdd = useRef(false);

  useEffect(() => {
    if (!nextRun) return;
    track('next_run_suggestion_shown', {
      suggested_date: nextRun.dateKey,
      days_out: nextRun.daysOut,
      category: nextRun.workout.category ?? categorizeWorkout(nextRun.workout),
      signed_in: !!user,
      has_tip: !!nextRun.tip,
    });
  }, [nextRun]);

  const addSuggestionToCalendar = useCallback(async () => {
    if (!nextRun || !user) return;
    setSuggestionStatus('adding');
    try {
      const plan = await ensurePlan();
      const added = await addWorkoutToCalendar(plan.id, user.id, nextRun.dateKey, nextRun.workout, plan.start_date);
      track('next_run_suggestion_added', {
        suggested_date: nextRun.dateKey,
        days_out: nextRun.daysOut,
        category: nextRun.workout.category ?? categorizeWorkout(nextRun.workout),
      });
      track('workout_added_to_plan', {
        workout_id: nextRun.workout.id,
        date: nextRun.dateKey,
        source: 'post_run_suggestion',
      });
      await refreshPlans().catch(() => {});
      leaveFinishedScreen();
      requestCalendarDate(nextRun.dateKey, added.id, 'suggestion');
      router.navigate('/(tabs)/training' as any);
      track('calendar_opened_from_suggestion', { suggested_date: nextRun.dateKey });
    } catch (e) {
      console.warn('Failed to add suggested run to calendar:', e);
      setSuggestionStatus('error');
    }
  }, [nextRun, user, ensurePlan, refreshPlans, leaveFinishedScreen, router]);

  const handleAddSuggestion = useCallback(() => {
    hapticTap();
    if (user) {
      addSuggestionToCalendar();
      return;
    }
    track('next_run_suggestion_signin_prompted', { suggested_date: nextRun?.dateKey });
    pendingSignInAdd.current = true;
    setSuggestionStatus('idle');
    router.push('/login' as any);
  }, [user, addSuggestionToCalendar, nextRun, router]);

  // Finish adding once sign-in succeeds; the login modal returns to this screen.
  useEffect(() => {
    if (user && pendingSignInAdd.current) {
      pendingSignInAdd.current = false;
      addSuggestionToCalendar();
    }
  }, [user, addSuggestionToCalendar]);

  // Back from the login modal without signing in. The add stays pending in case
  // the session arrives just after the modal closes.
  useFocusEffect(
    useCallback(() => {
      if (pendingSignInAdd.current && !user) setSuggestionStatus('signin_cancelled');
    }, [user]),
  );

  // ── IDLE state ──
  if (state.phase === 'idle') {
    // Group intervals by blockNumber for section headers
    const sections: {
      blockNumber: number;
      blockName?: string;
      totalSets: number;
      firstType: string;
      intervals: FlatInterval[];
    }[] = [];
    for (const int of state.intervals) {
      const last = sections[sections.length - 1];
      if (!last || last.blockNumber !== int.blockNumber) {
        sections.push({
          blockNumber: int.blockNumber,
          blockName: int.blockName,
          totalSets: int.totalSets,
          firstType: int.type,
          intervals: [int],
        });
      } else {
        last.intervals.push(int);
      }
    }

    const idleHeader = (
      <View style={styles.idleHeader}>
        <Text style={styles.workoutName} maxFontSizeMultiplier={MaxFontScale.display}>
          {workout.name}
        </Text>
        <Text style={styles.intervalCount}>
          {state.intervals.every((i) => i.openEnded)
            ? 'No set time or distance. Finish whenever you like.'
            : `${state.intervals.length} intervals${
                workout.targetDistanceMeters
                  ? ` · ${formatDistanceShort(workout.targetDistanceMeters, settings.paceUnit)} goal`
                  : ` · ${formatTime(state.intervals.reduce((s, i) => s + i.durationSeconds, 0))}`
              }`}
        </Text>
        {hasDistanceFeature(workout) && (
          <Text style={styles.gpsNote}>📍 GPS will auto-enable for distance-based runs</Text>
        )}
      </View>
    );

    const preRunPanel = (
      <View style={[styles.preRunPanel, large && styles.preRunPanelLarge]}>
        {isFirstRun && (
          <FirstRunCheck
            needsGps={needsGps}
            locationAccess={locationAccess}
            audioCueMode={settings.audioCueMode}
            onTurnOnVoice={handleTurnOnVoice}
            onTestCue={handleTestCue}
          />
        )}
        {needsGps && locationAccess && (
          <PreRunLocationCard access={locationAccess} onAllow={handleAllowLocation} />
        )}
        {needsGps && locationAccess === 'granted' && (
          <BackgroundLocationCard placement="preRun" />
        )}
        <PreRunHeartRateCard />
        <PreRunSettings
          settings={settings}
          onUpdate={onUpdateSettings}
          hasDistanceFeature={hasDistanceFeature(workout)}
        />
      </View>
    );

    // With large text the header and settings would leave no room for the
    // preview, so everything but Start/Back scrolls together.
    return (
      <View style={[styles.idleContainer, large && { paddingTop: insets.top + Spacing.md }]}>
        {!large && idleHeader}

        {/* Scrollable workout preview */}
        <ScrollView
          style={styles.idleScroll}
          contentContainerStyle={styles.idleScrollContent}
          showsVerticalScrollIndicator={large}
        >
          {large && idleHeader}
          {sections.map((section) => {
            const sectionColor = intervalColor(section.firstType);
            const sectionLabel =
              section.blockName ||
              section.firstType.charAt(0).toUpperCase() + section.firstType.slice(1);

            return (
              <View key={section.blockNumber} style={styles.sectionBlock}>
                {/* Section header */}
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionAccent, { backgroundColor: sectionColor }]} />
                  <Text style={styles.sectionTitle}>{sectionLabel}</Text>
                  {section.totalSets > 1 && (
                    <View style={styles.sectionRepeatBadge}>
                      <Text style={styles.sectionRepeatText}>×{section.totalSets}</Text>
                    </View>
                  )}
                </View>

                {/* Intervals in this section */}
                {section.intervals.map((int) => (
                  <React.Fragment key={int.index}>
                    {/* Set divider for repeats */}
                    {int.isFirstInSet && int.setNumber > 1 && (
                      <View style={styles.setDivider}>
                        <View style={styles.setDividerLine} />
                        <Text style={styles.setDividerText}>
                          Set {int.setNumber}
                        </Text>
                        <View style={styles.setDividerLine} />
                      </View>
                    )}
                    <View style={styles.previewRow}>
                      <View
                        style={[
                          styles.previewDot,
                          { backgroundColor: intervalColor(int.type) },
                        ]}
                      />
                      <Text style={styles.previewLabel}>{int.label}</Text>
                      <Text style={styles.previewTime}>
                        {intervalLengthText(int, settings.paceUnit)}
                      </Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            );
          })}
          {large && preRunPanel}
        </ScrollView>

        {/* Static footer */}
        <View style={styles.idleFooter}>
          {!large && preRunPanel}
          <TouchableOpacity
            style={[styles.bigStartBtn, large && styles.bigStartBtnLarge]}
            onPress={handleStart}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <View style={styles.bigStartInner}>
              <Ionicons name="play" size={22} color={Colors.black} />
              <Text style={styles.bigStartText} maxFontSizeMultiplier={MaxFontScale.display}>
                START RUN
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            accessibilityRole="button"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="arrow-back" size={16} color={Colors.textMuted} />
              <Text style={styles.backBtnText}>Back</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── FINISHED state ──
  if (state.phase === 'finished') {
    const completedEntry = buildCompletedEntry();
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.finishedContent,
          { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {moment && completedEntry ? (
          <AchievementMomentCard moment={moment} onShare={() => handleShareRun('achievement')} />
        ) : newRecords.length > 0 || newAwards.length > 0 ? (
          <PrimaryAchievement records={newRecords} awards={newAwards} />
        ) : (
          <>
            <Ionicons
              name="checkmark-circle"
              size={44}
              color={Colors.primary}
              style={styles.doneIcon}
            />
            <Text style={styles.doneTitle} maxFontSizeMultiplier={MaxFontScale.display}>
              Workout Complete
            </Text>
          </>
        )}
        <Text style={styles.doneWorkoutName}>{workout.name}</Text>

        <View style={styles.doneStatBlock}>
          <Text style={styles.doneStatLabel}>Total time</Text>
          <Text
            style={styles.doneDuration}
            maxFontSizeMultiplier={MaxFontScale.timer}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatTime(Math.floor(state.totalElapsedMs / 1000))}
          </Text>
        </View>

        {(settings.paceTrackingEnabled ||
          hasDistanceFeature(workout) ||
          distanceProgressCuesNeedGps(settings)) &&
          runner.paceState.totalDistanceMeters > 0 && (
            <View style={styles.doneStatBlock}>
              <Text style={styles.doneStatLabel}>Distance</Text>
              <Text style={styles.doneDistance}>
                {formatDistance(
                  runner.paceState.totalDistanceMeters,
                  settings.paceUnit,
                )}
              </Text>
            </View>
          )}

        <View style={styles.feelSection}>
          <Text style={styles.feelTitle}>How did it feel?</Text>
          <View style={styles.feelRow}>
            {FEEL_OPTIONS.map(({ tag, emoji }) => {
              const active = selectedFeel === tag;
              return (
                <TouchableOpacity
                  key={tag}
                  style={[styles.feelOption, large && styles.feelOptionLarge, active && styles.feelOptionActive]}
                  onPress={() => handleFeelPress(tag)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Felt ${tag}`}
                >
                  <Text style={styles.feelEmoji}>{emoji}</Text>
                  <Text style={[styles.feelLabel, active && styles.feelLabelActive]}>
                    {tag}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {completedEntry && sharedFrom?.result ? (
          <SharedResultComparison
            sharedFrom={{ ...sharedFrom, result: sharedFrom.result }}
            mine={resultOf(completedEntry)}
            mySplits={completedEntry.splits}
            paceUnit={settings.paceUnit}
            onReply={() => handleShareRun('challenge')}
          />
        ) : completedEntry && runCounts ? (
          <PostRunShareCard
            achievement={!moment && (newRecords.length > 0 || newAwards.length > 0)}
            onShare={() => handleShareRun('results')}
            onChallenge={() => handleShareRun('challenge')}
          />
        ) : null}

        {showInvite && <InviteFriendCard />}

        {sessionMeta?.planWorkoutId && (
          <RunReviewCard placement="finished" planWorkoutId={sessionMeta.planWorkoutId} />
        )}

        {nextRun && (
          <NextRunSuggestionCard
            suggestion={nextRun}
            signedIn={!!user}
            status={suggestionStatus}
            onAdd={handleAddSuggestion}
          />
        )}

        {autoUploadEnabled ? (
          <View style={styles.stravaAutoRow}>
            <Ionicons name="sync-outline" size={16} color={STRAVA_ORANGE} />
            <Text style={styles.stravaAutoText}>Uploads to Strava when you're done</Text>
          </View>
        ) : (
          completedEntry && (
            <StravaPushButton
              completedEntryId={completedEntry.id}
              workoutName={completedEntry.workoutName}
              workoutId={completedEntry.workoutId}
              completedAt={completedEntry.completedAt}
              totalDurationMs={completedEntry.totalDurationMs}
              totalDistanceMeters={completedEntry.totalDistanceMeters}
              route={completedEntry.route}
              splits={completedEntry.splits}
              heartRate={completedEntry.heartRate}
              configuration={completedEntry.configuration}
              tags={completedEntry.tags}
            />
          )
        )}

        <TouchableOpacity
          style={styles.doneBtn}
          onPress={handleFinishedDone}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Text style={styles.doneBtnText} maxFontSizeMultiplier={MaxFontScale.display}>Done</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.detailsLink}
          onPress={handleViewDetails}
          activeOpacity={0.7}
          accessibilityRole="link"
        >
          <Text style={styles.detailsLinkText}>View workout details</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
        </TouchableOpacity>
        {shareSheet}
      </ScrollView>
    );
  }

  // ── RUNNING / PAUSED state ──
  return (
    <View style={[styles.container, { borderTopColor: color, borderTopWidth: 4, paddingTop: insets.top + Spacing.md }]}>
      {/* Top info bar */}
      <View style={styles.topBar}>
        <Text style={[styles.topBarText, styles.topBarName]} numberOfLines={large ? 2 : 1}>
          {workout.name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <Text style={styles.topBarText}>{runner.intervalNumber}</Text>
          <TouchableOpacity
            onPress={() => {
              hapticTap();
              runner.noteSettingsOpened();
              setSettingsVisible(true);
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Run settings"
          >
            <Ionicons name="settings-outline" size={large ? 24 : 20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Mid-run settings sheet */}
      <MidRunSettingsSheet
        visible={settingsVisible}
        settings={settings}
        onUpdate={onUpdateSettings}
        onClose={() => setSettingsVisible(false)}
      />

      {/* Fills the screen at default sizes; scrolls when large text needs more room. */}
      <ScrollView
        style={styles.runScroll}
        contentContainerStyle={styles.runScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Main timer — or distance display for distance-based intervals */}
        <View style={[styles.timerArea, large && styles.timerAreaLarge]}>
          {runner.isOpenEnded ? (
            <View style={styles.distanceTimerArea}>
              <Text style={styles.distLabel} maxFontSizeMultiplier={MaxFontScale.display}>
                {runner.currentLabel}
              </Text>
              <Text
                style={[styles.distRemaining, { color }]}
                maxFontSizeMultiplier={MaxFontScale.timer}
                numberOfLines={1}
                adjustsFontSizeToFit
                accessibilityLabel={`${formatTime(runner.intervalElapsedSeconds)} elapsed`}
              >
                {formatTime(runner.intervalElapsedSeconds)}
              </Text>
              <Text style={styles.distSubLabel}>elapsed</Text>
            </View>
          ) : runner.isDistanceInterval ? (
            <View style={styles.distanceTimerArea}>
              <Text style={styles.distLabel} maxFontSizeMultiplier={MaxFontScale.display}>
                {runner.currentLabel}
              </Text>
              <Text
                style={[styles.distRemaining, { color }]}
                maxFontSizeMultiplier={MaxFontScale.timer}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatDistanceShort(runner.intervalDistanceRemaining ?? 0, settings.paceUnit)}
              </Text>
              <Text style={styles.distSubLabel}>remaining</Text>
              <Text
                style={styles.distElapsed}
                maxFontSizeMultiplier={MaxFontScale.display}
                accessibilityLabel={`${formatTime(runner.elapsedSeconds)} elapsed`}
              >
                {formatTime(runner.elapsedSeconds)}
              </Text>
              <Text style={styles.distSubLabel}>elapsed</Text>
            </View>
          ) : (
            <Timer
              remainingSeconds={runner.remaining}
              intervalType={runner.currentType}
              label={runner.currentLabel}
            />
          )}
        </View>

        {/* Progress bar */}
        {!runner.isOpenEnded && (
          <View style={styles.progressArea}>
            <IntervalProgress
              progress={runner.progress}
              intervalType={runner.currentType}
            />
          </View>
        )}

        {/* Workout distance target progress */}
        {runner.workoutDistanceTarget != null && (
          <View style={styles.distTargetBar}>
            <View style={styles.distTargetInfo}>
              <Text style={styles.distTargetLabel}>DISTANCE GOAL</Text>
              <Text style={styles.distTargetValue}>
                {formatDistanceShort(runner.paceState.totalDistanceMeters, settings.paceUnit)}
                {' / '}
                {formatDistanceShort(runner.workoutDistanceTarget, settings.paceUnit)}
              </Text>
            </View>
            {/* The distance and open-ended interval displays already show the clock */}
            {!runner.isDistanceInterval && !runner.isOpenEnded && (
              <View style={styles.distTargetInfo}>
                <Text style={styles.distTargetLabel}>ELAPSED</Text>
                <Text style={styles.distTargetValue}>{formatTime(runner.elapsedSeconds)}</Text>
              </View>
            )}
            <View style={styles.distProgressTrack}>
              <View
                style={[
                  styles.distProgressFill,
                  {
                    width: `${Math.min(100, (runner.paceState.totalDistanceMeters / runner.workoutDistanceTarget) * 100)}%`,
                  },
                ]}
              />
            </View>
          </View>
        )}

        {/* Pace display (when tracking) */}
        {(settings.paceTrackingEnabled ||
          hasDistanceFeature(workout) ||
          distanceProgressCuesNeedGps(settings)) &&
          runner.isPaceTracking && (
          <PaceDisplay
            paceState={runner.paceState}
            paceUnit={settings.paceUnit}
            targetPace={getCurrentInterval(state)?.targetPace}
          />
        )}

        {runner.heartRate && (
          <View style={styles.hrLive}>
            <HeartRateBadge bpm={runner.heartRate.bpm} connection={runner.heartRate.connection} />
          </View>
        )}

        {/* Workout timeline */}
        <WorkoutTimeline
          intervals={state.intervals}
          currentIndex={state.currentIndex}
          paceUnit={settings.paceUnit}
        />

        {/* Total remaining */}
        {runner.workoutDistanceTarget != null && runner.workoutDistanceRemaining != null ? (
          <Text style={styles.totalRemaining}>
            {formatDistanceShort(runner.workoutDistanceRemaining, settings.paceUnit)} to go
          </Text>
        ) : (runner.totalRemaining > 0 || !runner.isOpenEnded) && (
          <Text style={styles.totalRemaining}>
            {formatTime(runner.totalRemaining)} remaining
          </Text>
        )}
      </ScrollView>

      {/* Controls */}
      <View
        style={[
          styles.controls,
          large && { paddingTop: Spacing.sm },
          { paddingBottom: Math.max(large ? Spacing.lg : Spacing.xxl, insets.bottom + Spacing.md) },
        ]}
      >
        {/* Stop */}
        <TouchableOpacity
          style={[styles.controlBtn, styles.stopBtn]}
          onPress={() => {
            hapticTap();
            handleStop();
          }}
          accessibilityRole="button"
          accessibilityLabel="Stop workout"
        >
          <Ionicons name="stop" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>

        {/* Play / Pause */}
        {state.phase === 'running' ? (
          <TouchableOpacity
            style={[styles.controlBtn, styles.mainBtn]}
            onPress={() => {
              hapticTap();
              runner.pause();
            }}
            accessibilityRole="button"
            accessibilityLabel="Pause"
          >
            <Ionicons name="pause" size={32} color={Colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.controlBtn, styles.mainBtn, { backgroundColor: Colors.primary }]}
            onPress={() => {
              hapticTap();
              runner.resume();
            }}
            accessibilityRole="button"
            accessibilityLabel="Resume"
          >
            <Ionicons name="play" size={32} color={Colors.black} />
          </TouchableOpacity>
        )}

        {/* Skip */}
        <TouchableOpacity
          style={[styles.controlBtn, styles.skipBtn]}
          onPress={() => {
            hapticTap();
            runner.skip();
          }}
          accessibilityRole="button"
          accessibilityLabel={finishesRun ? 'Finish run' : 'Skip interval'}
        >
          <Ionicons
            name={finishesRun ? 'flag' : 'play-skip-forward'}
            size={22}
            color={Colors.textPrimary}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Mid-Run Settings Sheet ────────────────────────────────────────────

const AUDIO_MODES: {
  value: AudioCueMode;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { value: 'beeps', label: 'Beeps', icon: 'notifications-outline' },
  { value: 'voice', label: 'Voice', icon: 'volume-high-outline' },
  { value: 'both', label: 'Both', icon: 'volume-medium-outline' },
  { value: 'silent', label: 'Silent', icon: 'volume-mute-outline' },
];

const WARNING_OPTIONS = [3, 5, 10, 15, 30];

const PACE_CUE_OPTIONS: { value: PaceCueFrequency; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
];

const TIME_ANNOUNCE_OPTIONS: { value: TimeRemainingInterval; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
];

function MidRunSettingsSheet({
  visible,
  settings,
  onUpdate,
  onClose,
}: {
  visible: boolean;
  settings: AppSettings;
  onUpdate: (partial: Partial<AppSettings>) => Promise<void>;
  onClose: () => void;
}) {
  const large = useLargeText();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={sheetStyles.overlay}>
        <TouchableOpacity style={sheetStyles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={[sheetStyles.sheet, large && sheetStyles.sheetLarge]}>
          {/* Handle */}
          <View style={sheetStyles.handleRow}>
            <View style={sheetStyles.handle} />
          </View>

          {/* Header */}
          <View style={sheetStyles.header}>
            <Text style={sheetStyles.headerTitle} maxFontSizeMultiplier={MaxFontScale.display}>
              Settings
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
            >
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={sheetStyles.scrollView}
            contentContainerStyle={sheetStyles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Audio Mode */}
            <Text style={sheetStyles.sectionTitle}>Audio Cues</Text>
            <View style={sheetStyles.chipRow}>
              {AUDIO_MODES.map((mode) => (
                <TouchableOpacity
                  key={mode.value}
                  style={[
                    sheetStyles.chip,
                    settings.audioCueMode === mode.value && sheetStyles.chipActive,
                  ]}
                  onPress={() => {
                    hapticTap();
                    onUpdate({ audioCueMode: mode.value });
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={mode.icon}
                    size={14}
                    color={
                      settings.audioCueMode === mode.value
                        ? Colors.primary
                        : Colors.textSecondary
                    }
                  />
                  <Text
                    style={[
                      sheetStyles.chipLabel,
                      settings.audioCueMode === mode.value && sheetStyles.chipLabelActive,
                    ]}
                  >
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Duck other audio */}
            {settings.audioCueMode !== 'silent' && (
              <View style={sheetStyles.toggleRow}>
                <Text style={sheetStyles.toggleLabel}>Lower music during cues</Text>
                <Switch
                  value={settings.duckOtherAudio}
                  onValueChange={(v) => {
                    hapticTap();
                    onUpdate({ duckOtherAudio: v });
                  }}
                  trackColor={{ false: Colors.surfaceLight, true: Colors.primaryDim }}
                  thumbColor={Colors.white}
                />
              </View>
            )}

            {/* Haptic */}
            <View style={sheetStyles.toggleRow}>
              <Text style={sheetStyles.toggleLabel}>Haptic feedback</Text>
              <Switch
                value={settings.hapticEnabled}
                onValueChange={(v) => {
                  if (v) hapticTap();
                  onUpdate({ hapticEnabled: v });
                }}
                trackColor={{ false: Colors.surfaceLight, true: Colors.primaryDim }}
                thumbColor={Colors.white}
              />
            </View>

            {/* Countdown Warnings */}
            <Text style={sheetStyles.sectionTitle}>Countdown Warnings</Text>
            <View style={sheetStyles.chipRow}>
              {WARNING_OPTIONS.map((sec) => {
                const isSelected = settings.countdownWarningSeconds.includes(sec);
                return (
                  <TouchableOpacity
                    key={sec}
                    style={[
                      sheetStyles.chip,
                      isSelected && sheetStyles.chipActive,
                    ]}
                    onPress={() => {
                      hapticTap();
                      let next: number[];
                      if (isSelected) {
                        next = settings.countdownWarningSeconds.filter((s) => s !== sec);
                      } else {
                        next = [...settings.countdownWarningSeconds, sec].sort((a, b) => a - b);
                      }
                      if (next.length === 0) return;
                      onUpdate({ countdownWarningSeconds: next });
                    }}
                    activeOpacity={0.7}
                  >
                    {isSelected && (
                      <Ionicons name="checkmark" size={12} color={Colors.primary} />
                    )}
                    <Text
                      style={[
                        sheetStyles.chipLabel,
                        isSelected && sheetStyles.chipLabelActive,
                      ]}
                    >
                      {sec}s
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Interval Progress */}
            <Text style={sheetStyles.sectionTitle}>Interval Progress</Text>
            <Text style={sheetStyles.sectionSub}>
              {settings.progressCueBasis === 'auto'
                ? 'Elapsed time in timed intervals and Free Runs, distance and time in distance intervals. Pace is set separately below.'
                : settings.progressCueBasis === 'distance'
                  ? 'Announce distance covered during each interval. Pace is set separately below.'
                  : 'Announce elapsed time during intervals. Pace is set separately below.'}
            </Text>
            <CueBasisToggle
              value={settings.progressCueBasis}
              options={PROGRESS_CUE_BASES}
              onChange={(progressCueBasis) => onUpdate({ progressCueBasis })}
            />
            {settings.progressCueBasis === 'auto' && (
              <Text style={sheetStyles.stepLabel}>{AUTO_TIME_STEP_LABEL}</Text>
            )}
            {settings.progressCueBasis !== 'distance' && (
              <View style={sheetStyles.chipRow}>
                {TIME_ANNOUNCE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      sheetStyles.chip,
                      settings.timeRemainingInterval === opt.value && sheetStyles.chipActive,
                    ]}
                    onPress={() => {
                      hapticTap();
                      onUpdate({ timeRemainingInterval: opt.value });
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        sheetStyles.chipLabel,
                        settings.timeRemainingInterval === opt.value && sheetStyles.chipLabelActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {settings.progressCueBasis === 'auto' && (
              <Text style={sheetStyles.stepLabel}>{AUTO_DISTANCE_STEP_LABEL}</Text>
            )}
            {settings.progressCueBasis !== 'time' && (
              <CueDistanceChips
                value={settings.progressCueDistance}
                unit={settings.paceUnit}
                onChange={(progressCueDistance) => onUpdate({ progressCueDistance })}
              />
            )}

            {/* Pace Tracking */}
            <Text style={sheetStyles.sectionTitle}>Pace</Text>
            <View style={sheetStyles.toggleRow}>
              <Text style={sheetStyles.toggleLabel}>GPS pace tracking</Text>
              <Switch
                value={settings.paceTrackingEnabled}
                onValueChange={(v) => {
                  hapticTap();
                  onUpdate({ paceTrackingEnabled: v });
                }}
                trackColor={{ false: Colors.surfaceLight, true: Colors.primaryDim }}
                thumbColor={Colors.white}
              />
            </View>

            {settings.paceTrackingEnabled && (
              <>
                {/* Units */}
                <View style={sheetStyles.chipRow}>
                  <TouchableOpacity
                    style={[
                      sheetStyles.chip,
                      settings.paceUnit === 'minPerMile' && sheetStyles.chipActive,
                    ]}
                    onPress={() => {
                      hapticTap();
                      onUpdate({ paceUnit: 'minPerMile' });
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        sheetStyles.chipLabel,
                        settings.paceUnit === 'minPerMile' && sheetStyles.chipLabelActive,
                      ]}
                    >
                      Miles
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      sheetStyles.chip,
                      settings.paceUnit === 'minPerKm' && sheetStyles.chipActive,
                    ]}
                    onPress={() => {
                      hapticTap();
                      onUpdate({ paceUnit: 'minPerKm' });
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        sheetStyles.chipLabel,
                        settings.paceUnit === 'minPerKm' && sheetStyles.chipLabelActive,
                      ]}
                    >
                      Kilometers
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Pace cue frequency */}
                <Text style={sheetStyles.sectionSub}>
                  {settings.paceCueBasis === 'auto'
                    ? 'Pace by time in timed intervals and Free Runs, by distance in distance intervals. Choose By distance to hear pace every distance on every run.'
                    : settings.paceCueBasis === 'distance'
                      ? 'Announce pace each time you cover this distance, on every run'
                      : 'Announce pace on this timer, on every run'}
                </Text>
                <CueBasisToggle
                  value={settings.paceCueBasis}
                  options={PROGRESS_CUE_BASES}
                  onChange={(paceCueBasis) => onUpdate({ paceCueBasis })}
                />
                {settings.paceCueBasis === 'auto' && (
                  <Text style={sheetStyles.stepLabel}>{AUTO_TIME_STEP_LABEL}</Text>
                )}
                {settings.paceCueBasis !== 'distance' && (
                  <View style={sheetStyles.chipRow}>
                    {PACE_CUE_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          sheetStyles.chip,
                          settings.paceCueFrequency === opt.value && sheetStyles.chipActive,
                        ]}
                        onPress={() => {
                          hapticTap();
                          onUpdate({ paceCueFrequency: opt.value });
                        }}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            sheetStyles.chipLabel,
                            settings.paceCueFrequency === opt.value && sheetStyles.chipLabelActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {settings.paceCueBasis === 'auto' && (
                  <Text style={sheetStyles.stepLabel}>{AUTO_DISTANCE_STEP_LABEL}</Text>
                )}
                {settings.paceCueBasis !== 'time' && (
                  <CueDistanceChips
                    value={settings.paceCueDistance}
                    unit={settings.paceUnit}
                    onChange={(paceCueDistance) => onUpdate({ paceCueDistance })}
                  />
                )}

                {/* Only cue on intervals with target pace */}
                {paceCuesEnabled(settings) && (
                  <View style={sheetStyles.toggleRow}>
                    <Text style={sheetStyles.toggleLabel}>Only with target pace</Text>
                    <Switch
                      value={settings.paceCueOnlyWithTarget}
                      onValueChange={(v) => {
                        hapticTap();
                        onUpdate({ paceCueOnlyWithTarget: v });
                      }}
                      trackColor={{ false: Colors.surfaceLight, true: Colors.primaryDim }}
                      thumbColor={Colors.white}
                    />
                  </View>
                )}
              </>
            )}

            {/* Keep screen on */}
            <Text style={sheetStyles.sectionTitle}>Display</Text>
            <View style={sheetStyles.toggleRow}>
              <Text style={sheetStyles.toggleLabel}>Keep screen on</Text>
              <Switch
                value={settings.keepScreenOn}
                onValueChange={(v) => {
                  hapticTap();
                  onUpdate({ keepScreenOn: v });
                }}
                trackColor={{ false: Colors.surfaceLight, true: Colors.primaryDim }}
                thumbColor={Colors.white}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '75%',
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight,
  },
  sheetLarge: {
    maxHeight: '92%',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  sectionSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  stepLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: Spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
    gap: Spacing.xs,
  },
  chipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '18',
  },
  chipLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  chipLabelActive: {
    color: Colors.primary,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  toggleLabel: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    flex: 1,
    marginRight: Spacing.md,
  },
});

// ── Pace Display ─────────────────────────────────────────────────────

function PaceDisplay({
  paceState,
  paceUnit,
  targetPace,
}: {
  paceState: import('../../../src/pace/paceTypes').PaceState;
  paceUnit: import('../../../src/pace/paceTypes').PaceUnit;
  /** Stored in min/mile. */
  targetPace?: number;
}) {
  const large = useLargeText();
  const target = targetPace != null ? paceToUnit(targetPace, paceUnit) : undefined;
  const currentPace =
    paceUnit === 'minPerMile'
      ? paceState.currentPaceMinPerMile
      : paceState.currentPaceMinPerKm;
  const unitLabel = paceUnit === 'minPerMile' ? '/mi' : '/km';
  const paceStr = formatPaceDisplay(currentPace);
  const distStr = formatDistance(paceState.totalDistanceMeters, paceUnit);

  // Determine pace status relative to target
  let statusColor: string = Colors.textSecondary;
  let statusText = '';
  if (target != null && currentPace != null && isFinite(currentPace)) {
    const diff = currentPace - target;
    if (Math.abs(diff) < 0.15) {
      statusColor = Colors.primary;
      statusText = 'On target';
    } else if (diff > 0) {
      statusColor = Colors.danger;
      statusText = 'Behind target';
    } else {
      statusColor = Colors.accent;
      statusText = 'Ahead of target';
    }
  }

  return (
    <View style={paceStyles.container}>
      <View style={[paceStyles.mainRow, large && paceStyles.mainRowLarge]}>
        <View style={[paceStyles.paceCol, large && paceStyles.colLarge]}>
          <Text style={paceStyles.paceLabel}>PACE</Text>
          <Text style={paceStyles.paceValue} maxFontSizeMultiplier={MaxFontScale.display}>
            {paceStr}
            <Text style={paceStyles.paceUnit}> {unitLabel}</Text>
          </Text>
        </View>
        {target != null && (
          <View style={[paceStyles.targetCol, large && paceStyles.colLarge]}>
            <Text style={paceStyles.paceLabel}>TARGET</Text>
            <Text style={[paceStyles.targetValue]}>
              {formatPaceDisplay(target)}
              <Text style={paceStyles.paceUnit}> {unitLabel}</Text>
            </Text>
          </View>
        )}
        <View style={[paceStyles.distCol, large && paceStyles.colLarge]}>
          <Text style={paceStyles.paceLabel}>DIST</Text>
          <Text style={paceStyles.distValue}>{distStr}</Text>
        </View>
      </View>
      {statusText !== '' && (
        <Text style={[paceStyles.statusText, { color: statusColor }]}>
          {statusText}
        </Text>
      )}
    </View>
  );
}

const paceStyles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  mainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  mainRowLarge: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: Spacing.sm,
  },
  paceCol: {
    flex: 1,
  },
  colLarge: {
    flex: 0,
    alignItems: 'flex-start',
  },
  targetCol: {
    flex: 1,
    alignItems: 'center',
  },
  distCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  paceLabel: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  paceValue: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  targetValue: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  paceUnit: {
    fontSize: FontSize.sm,
    fontWeight: '400',
  },
  distValue: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  statusText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    marginTop: Spacing.xs,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
});

// ── Workout Timeline ─────────────────────────────────────────────────

function WorkoutTimeline({
  intervals,
  currentIndex,
  paceUnit,
}: {
  intervals: FlatInterval[];
  currentIndex: number;
  paceUnit: import('../../../src/pace/paceTypes').PaceUnit;
}) {
  const scrollRef = useRef<ScrollView>(null);
  // Row text is capped at MaxFontScale.display, so rows only need to grow that much.
  const rowHeight = useScaledSize(TIMELINE_ROW_HEIGHT, MaxFontScale.display);
  // Keeps the previous interval in view with the current one about a third of the way down.
  const offsetFor = (index: number) =>
    Math.max(0, (index - 1) * rowHeight - 0.3 * (TIMELINE_VISIBLE_ROWS - 1) * rowHeight);

  useEffect(() => {
    if (currentIndex >= 0 && currentIndex < intervals.length) {
      scrollRef.current?.scrollTo({ y: offsetFor(currentIndex), animated: true });
    }
  }, [currentIndex, intervals.length, rowHeight]);

  const renderItem = useCallback(
    (item: FlatInterval, index: number) => {
      const isCompleted = index < currentIndex;
      const isCurrent = index === currentIndex;

      return (
        <View
          key={item.index}
          style={[
            tlStyles.row,
            { height: rowHeight },
            isCurrent && tlStyles.currentRow,
          ]}
        >
          {/* Status indicator */}
          {isCompleted ? (
            <Ionicons name="checkmark" size={14} color={Colors.primary} style={tlStyles.statusIcon} />
          ) : isCurrent ? (
            <Ionicons name="play" size={12} color={Colors.primary} style={tlStyles.statusIcon} />
          ) : (
            <View
              style={[
                tlStyles.dot,
                { backgroundColor: intervalColor(item.type) + '66' },
              ]}
            />
          )}

          {/* Label with optional block name */}
          <Text
            style={[
              tlStyles.label,
              isCompleted && tlStyles.completedText,
              isCurrent && { color: intervalColor(item.type) },
            ]}
            numberOfLines={1}
            maxFontSizeMultiplier={MaxFontScale.display}
          >
            {item.blockName && item.isFirstInSet
              ? `${item.blockName} · ${item.label}`
              : item.label}
          </Text>

          {/* Set indicator */}
          {item.totalSets > 1 && item.isFirstInSet && (
            <Text
              style={[
                tlStyles.setTag,
                isCompleted && tlStyles.completedText,
                isCurrent && { color: intervalColor(item.type) },
              ]}
              maxFontSizeMultiplier={MaxFontScale.display}
            >
              {item.setNumber}/{item.totalSets}
            </Text>
          )}

          {/* Duration or distance */}
          <Text
            style={[
              tlStyles.time,
              isCompleted && tlStyles.completedText,
              isCurrent && { color: intervalColor(item.type) },
            ]}
            maxFontSizeMultiplier={MaxFontScale.display}
          >
            {intervalLengthText(item, paceUnit)}
          </Text>
        </View>
      );
    },
    [currentIndex, paceUnit, rowHeight],
  );

  return (
    <View style={[tlStyles.container, { maxHeight: TIMELINE_VISIBLE_ROWS * rowHeight }]}>
      <ScrollView
        ref={scrollRef}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        contentOffset={{ x: 0, y: offsetFor(currentIndex) }}
      >
        {intervals.map(renderItem)}
      </ScrollView>
    </View>
  );
}

const TIMELINE_ROW_HEIGHT = 32;
const TIMELINE_VISIBLE_ROWS = 5;

const tlStyles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  currentRow: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusIcon: {
    width: 14,
    textAlign: 'center',
  },
  label: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  setTag: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  time: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'],
    minWidth: 40,
    textAlign: 'right',
  },
  completedText: {
    color: Colors.textMuted,
    opacity: 0.5,
  },
});

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: FontSize.lg,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  // ── Idle ──
  idleContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingTop: 100,
  },
  idleHeader: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  idleScroll: {
    flex: 1,
  },
  idleScrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  idleFooter: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.surfaceLight,
  },
  workoutName: {
    fontSize: FontSize.xxl,
    fontWeight: '900',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  intervalCount: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  gpsNote: {
    fontSize: FontSize.sm,
    color: Colors.accent,
    marginBottom: Spacing.xl,
    fontWeight: '600',
  },
  sectionBlock: {
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceLight,
    gap: Spacing.sm,
  },
  sectionAccent: {
    width: 4,
    height: 18,
    borderRadius: 2,
  },
  sectionTitle: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  sectionRepeatBadge: {
    backgroundColor: Colors.primaryDim,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  sectionRepeatText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.primary,
  },
  setDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  setDividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.textMuted + '44',
  },
  setDividerText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  previewDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  previewLabel: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
  previewTime: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  preRunPanel: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  preRunPanelLarge: {
    alignItems: 'stretch',
    marginTop: Spacing.sm,
  },
  bigStartBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.lg,
  },
  bigStartBtnLarge: {
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
  },
  bigStartInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bigStartText: {
    color: Colors.black,
    fontSize: FontSize.xl,
    fontWeight: '900',
    letterSpacing: 1,
  },
  backBtn: {
    padding: Spacing.md,
  },
  backBtnText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
  },

  // ── Running / Paused ──
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  topBarText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  topBarName: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  runScroll: {
    flex: 1,
  },
  runScrollContent: {
    flexGrow: 1,
  },
  timerArea: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerAreaLarge: {
    paddingVertical: Spacing.lg,
  },
  progressArea: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  totalRemaining: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    fontVariant: ['tabular-nums'],
  },
  hrLive: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  distanceTimerArea: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  distLabel: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  distRemaining: {
    fontSize: FontSize.timer,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
  },
  distSubLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  distElapsed: {
    fontSize: FontSize.xxl,
    fontWeight: '300',
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
    marginTop: Spacing.md,
  },
  distTargetBar: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  distTargetInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  distTargetLabel: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  distTargetValue: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.accent,
    fontVariant: ['tabular-nums'],
  },
  distProgressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceLight,
    overflow: 'hidden',
  },
  distProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  controlBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BorderRadius.full,
  },
  stopBtn: {
    width: 56,
    height: 56,
    backgroundColor: Colors.surface,
  },
  mainBtn: {
    width: 80,
    height: 80,
    backgroundColor: Colors.surface,
  },
  skipBtn: {
    width: 56,
    height: 56,
    backgroundColor: Colors.surface,
  },
  controlBtnText: {
    fontSize: 22,
    color: Colors.textPrimary,
  },
  mainBtnText: {
    fontSize: 28,
    color: Colors.textPrimary,
  },

  // ── Finished ──
  finishedContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  feelSection: {
    width: '100%',
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  feelTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  feelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  feelOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
    backgroundColor: Colors.surface,
    minHeight: 44,
  },
  feelOptionLarge: {
    flexBasis: '45%',
    paddingVertical: Spacing.sm,
  },
  feelOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '22',
  },
  feelEmoji: {
    fontSize: 24,
  },
  feelLabel: {
    marginTop: 2,
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  feelLabelActive: {
    color: Colors.primary,
  },
  stravaAutoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  stravaAutoText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  doneIcon: {
    marginBottom: Spacing.sm,
  },
  doneTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '900',
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  doneWorkoutName: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  doneStatBlock: {
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  doneStatLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  doneDuration: {
    fontSize: FontSize.timer,
    fontWeight: '200',
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  doneDistance: {
    fontSize: FontSize.xl,
    fontWeight: '600',
    color: Colors.accent,
    fontVariant: ['tabular-nums'],
  },
  doneBtn: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.xs,
  },
  doneBtnText: {
    color: Colors.black,
    fontSize: FontSize.lg,
    fontWeight: '800',
  },
  detailsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.md,
    minHeight: 44,
  },
  detailsLinkText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
});
