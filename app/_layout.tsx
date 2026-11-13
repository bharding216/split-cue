import { useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { Observe, ObserveRoot, useObserve } from 'expo-observe';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors } from '../src/constants/theme';
import { cleanupStaleLiveActivities } from '../src/hooks/useLiveActivity';
import {
  initInstallTimestamp,
  getUnseenAnnouncement,
  dismissAnnouncement,
} from '../src/announcements/announcementService';
import { appInfo, flushQueuedEvents, track } from '../src/analytics/track';
import { orphanedSessionProps } from '../src/analytics/workoutContext';
import { reportDevice } from '../src/analytics/deviceReport';
import {
  decodeWorkoutLink,
  formatPlannedDate,
  parseShareCode,
  recordShareEvent,
  resolveShareCode,
  type SharedWorkout,
} from '../src/sharing/shareWorkout';
import { consumeDeferredShareLink } from '../src/sharing/deferredShareLink';
import { SharedWorkoutSheet } from '../src/components/SharedWorkoutSheet';
import { addWorkoutToCalendar } from '../src/ai/planService';
import type { WorkoutDefinition } from '../src/workout/workoutTypes';
import { saveWorkout, clearAllUserData } from '../src/workout/workoutStorage';
import { loadActiveSession, clearActiveSession } from '../src/workout/activeSession';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { SubscriptionProvider, useSubscription } from '../src/contexts/SubscriptionContext';
import { TrainingPlanProvider, useTrainingPlan } from '../src/contexts/TrainingPlanContext';
import { initVoice, prepareUpcomingPlanWorkouts } from '../src/audio/prepareVoice';
import { syncAll } from '../src/sync/cloudSync';
import {
  maybePromptForFeatureUpdates,
  refreshPushToken,
  subscribeToNotificationOpens,
} from '../src/notifications/pushRegistration';
import { openStoreListing, useRequiredUpdate } from '../src/updates/requiredUpdate';
import { RequiredUpdateScreen } from '../src/components/RequiredUpdateScreen';

Observe.configure({ environment: appInfo().environment });

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Share codes that reached the app through an install (deferred link). */
const deferredShareCodes = new Set<string>();

function shareReferrer(code: string | undefined): 'link' | 'deferred' {
  return code && deferredShareCodes.has(code) ? 'deferred' : 'link';
}

function trackSharedImport(workout: WorkoutDefinition, destination: string, extra?: Record<string, unknown>): void {
  const code = workout.sharedFrom?.code;
  recordShareEvent(code, 'import', shareReferrer(code));
  track('workout_imported', {
    workout_id: workout.id,
    workout_name: workout.name,
    destination,
    share_code: workout.sharedFrom?.code ?? null,
    has_sender_name: !!workout.sharedFrom?.senderName,
    has_sender_result: !!workout.sharedFrom?.result,
    ...extra,
  });
}

async function saveImportedWorkout(workout: WorkoutDefinition, destination = 'workouts'): Promise<void> {
  await saveWorkout({ ...workout, origin: 'imported' });
  trackSharedImport(workout, destination);
}

function RootLayoutInner() {
  const router = useRouter();
  const pathname = usePathname();
  const updateRequired = useRequiredUpdate();
  const { user, loading: authLoading } = useAuth();
  const { tier, loading: subscriptionLoading } = useSubscription();
  const { planWorkouts, loading: planLoading, ensurePlan, refresh: refreshPlans } = useTrainingPlan();
  const prevUserIdRef = useRef<string | null>(null);
  const [pendingPlannedShare, setPendingPlannedShare] = useState<SharedWorkout | null>(null);
  const [incomingShare, setIncomingShare] = useState<SharedWorkout | null>(null);
  /** Account (or 'guest') the pending planned share was last offered to. */
  const plannedShareOfferedTo = useRef<string | null>(null);
  const { markInteractive } = useObserve();

  useEffect(() => {
    if (!authLoading) markInteractive();
  }, [authLoading, markInteractive]);

  // End any Live Activities orphaned by a force-kill during a workout.
  useEffect(() => {
    cleanupStaleLiveActivities();
  }, []);

  // Activate the AI coach voice and prepare upcoming workouts' cues in the background.
  useEffect(() => {
    initVoice();
  }, []);

  useEffect(() => {
    prepareUpcomingPlanWorkouts(planWorkouts);
  }, [planWorkouts]);

  // Track app open
  useEffect(() => {
    track('app_opened');
  }, []);

  // Resend events queued while offline, e.g. during a run without signal.
  useEffect(() => {
    flushQueuedEvents();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') flushQueuedEvents();
    });
    return () => subscription.remove();
  }, []);

  // Keep the analytics device row current. Foregrounding picks up permission
  // changes made in the system Settings app.
  useEffect(() => {
    if (authLoading || subscriptionLoading) return;
    const userId = user?.id ?? null;
    reportDevice(userId, tier);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') reportDevice(userId, tier);
    });
    return () => subscription.remove();
  }, [authLoading, subscriptionLoading, user?.id, tier]);

  // Open an in-app path when the user taps a push notification.
  useEffect(() => {
    return subscribeToNotificationOpens((url) => {
      router.push(url as any);
    });
  }, [router]);

  // Keep the device token current, and ask about feature updates once.
  useEffect(() => {
    if (authLoading) return;
    refreshPushToken();
    maybePromptForFeatureUpdates();
  }, [authLoading, user?.id]);

  // Cloud sync on foreground + when user changes.
  // Clear local data when switching between accounts so the new user
  // doesn't see stale workouts/history from the previous account.
  useEffect(() => {
    const prevId = prevUserIdRef.current;
    prevUserIdRef.current = user?.id ?? null;

    if (!user) {
      // Signed out — clear local data so it doesn't leak to the next user
      if (prevId) {
        clearAllUserData();
      }
      return;
    }

    const run = async () => {
      // Different user than before — wipe local cache first
      if (prevId && prevId !== user.id) {
        await clearAllUserData();
      }
      syncAll(user.id);
    };
    run();

    // Sync again when app comes back to foreground
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && user) {
        syncAll(user.id);
      }
    });

    return () => subscription.remove();
  }, [user?.id]);

  // Offer a shared planned workout for the same date on the recipient's
  // calendar, once auth and the calendar have loaded.
  useEffect(() => {
    if (!pendingPlannedShare || authLoading || planLoading) return;
    const audience = user?.id ?? 'guest';
    if (plannedShareOfferedTo.current === audience) return;
    plannedShareOfferedTo.current = audience;

    const { workout, plannedDate } = pendingPlannedShare;
    const dateKey = plannedDate!;
    const dateLabel = formatPlannedDate(dateKey);
    const sender = workout.sharedFrom?.senderName;
    const fromSender = sender ? `${sender} wants to run "${workout.name}" with you on ${dateLabel}. ` : '';
    const finish = () => setPendingPlannedShare(null);
    const importToWorkouts = async () => {
      finish();
      await saveImportedWorkout(workout);
      router.push(`/workout/${workout.id}`);
    };

    if (!user) {
      Alert.alert(
        'Add to Your Calendar',
        `${fromSender}Sign in to add "${workout.name}" to your training calendar on ${dateLabel}.`,
        [
          { text: 'Not Now', style: 'cancel', onPress: finish },
          { text: 'Save to Workouts', onPress: importToWorkouts },
          { text: 'Sign In', onPress: () => router.push('/login') },
        ],
      );
      return;
    }

    const existing = planWorkouts.find(
      (pw) =>
        pw.date === dateKey &&
        (pw.workout_data as WorkoutDefinition | null)?.name === workout.name,
    );
    if (existing) {
      finish();
      Alert.alert(
        'Already Planned',
        `"${workout.name}" is already on your calendar for ${dateLabel}.`,
        [
          { text: 'OK', style: 'cancel' },
          {
            text: 'View',
            onPress: () => router.push(`/(tabs)/training/workout-detail?workoutId=${existing.id}` as any),
          },
        ],
      );
      return;
    }

    Alert.alert(
      'Add to Your Calendar',
      `${fromSender}Add "${workout.name}" to your training calendar on ${dateLabel}?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: finish },
        {
          text: 'Add',
          onPress: async () => {
            finish();
            try {
              const plan = await ensurePlan();
              const added = await addWorkoutToCalendar(
                plan.id,
                user.id,
                dateKey,
                { ...workout, origin: 'imported' },
                plan.start_date,
              );
              trackSharedImport(workout, 'calendar', { planned_date: dateKey });
              await refreshPlans().catch(() => {});
              router.push(`/(tabs)/training/workout-detail?workoutId=${added.id}` as any);
            } catch (err) {
              console.warn('Failed to add shared workout to calendar:', err);
              Alert.alert('Could Not Add Workout', 'Check your connection and try opening the link again.');
            }
          },
        },
      ],
    );
  }, [pendingPlannedShare, authLoading, planLoading, user, planWorkouts, ensurePlan, refreshPlans, router]);

  // Handle incoming deep links for shared workout imports.
  useEffect(() => {
    const handleUrl = async (url: string, { isInitial, deferred }: { isInitial?: boolean; deferred?: boolean } = {}) => {
      // Support HTTPS links (splitcue.app/w/<code>), custom-scheme short links
      // (pacecue://w/<code>), and legacy base64 links (pacecue://workout/import?d=...)
      const shortCode = parseShareCode(url);
      const isLegacy = url.includes('workout/import');

      if (!shortCode && !isLegacy) return;

      // On cold start the URL doesn't match any app route, so Expo Router
      // renders an unmatched/404 screen. Navigate to home first to clear it.
      if (isInitial) {
        router.replace('/');
      }

      if (shortCode) {
        if (deferred) deferredShareCodes.add(shortCode);
        recordShareEvent(shortCode, 'app_open', shareReferrer(shortCode));
      }

      const shared = shortCode
        ? await resolveShareCode(shortCode)
        : decodeWorkoutLink(url);

      if (shared === 'removed') {
        Alert.alert('Link Removed', 'This share link is no longer available. Ask your friend to send a new one.');
        return;
      }

      if (shared === 'needs-update') {
        Alert.alert(
          'Update SplitCue',
          'This workout was shared from a newer version of SplitCue. Update the app to import it.',
          [
            { text: 'Not Now', style: 'cancel' },
            {
              text: 'Update',
              onPress: () => openStoreListing(),
            },
          ],
        );
        return;
      }

      if (!shared) {
        Alert.alert('Invalid Link', 'Could not read the shared workout.');
        return;
      }

      if (shared.plannedDate && shared.plannedDate >= todayKey()) {
        plannedShareOfferedTo.current = null;
        setPendingPlannedShare(shared);
        return;
      }

      track('shared_workout_opened', {
        share_code: shared.workout.sharedFrom?.code ?? null,
        share_type: shared.kind,
        has_sender_name: !!shared.workout.sharedFrom?.senderName,
        has_sender_result: !!shared.workout.sharedFrom?.result,
      });
      setIncomingShare(shared);
    };

    // Handle URL that launched the app (cold start). A first launch without
    // one may still have come from a share link opened before install.
    Linking.getInitialURL().then(async (url) => {
      if (url) {
        handleUrl(url, { isInitial: true });
        return;
      }
      const deferredUrl = await consumeDeferredShareLink();
      if (deferredUrl) {
        track('deferred_share_link_opened');
        handleUrl(deferredUrl, { deferred: true });
      }
    });

    // Handle URLs while the app is already open (warm start)
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });

    return () => subscription.remove();
  }, [router]);

  // On app open, offer to resume a workout left unfinished when the app was
  // closed; otherwise show a single "what's new" alert to existing users.
  useEffect(() => {
    (async () => {
      await initInstallTimestamp();
      const unfinished = loadActiveSession();
      if (unfinished) {
        const { workout } = unfinished;
        const sessionProps = orphanedSessionProps(unfinished);
        track('workout_session_orphaned', sessionProps);
        Alert.alert(
          'Resume Workout?',
          `"${workout.name}" was still in progress when SplitCue closed. Pick up where you left off?`,
          [
            {
              text: 'Discard',
              style: 'destructive',
              onPress: () => {
                clearActiveSession();
                track('workout_resume_declined', sessionProps);
              },
            },
            {
              text: 'Resume',
              style: 'default',
              onPress: () => {
                track('workout_resume_accepted', sessionProps);
                router.push(`/workout/run/${workout.id}?resume=1` as any);
              },
            },
          ],
          { cancelable: false },
        );
        return;
      }

      const announcement = await getUnseenAnnouncement();
      if (announcement) {
        Alert.alert(announcement.title, announcement.body, [
          { text: 'Got it', onPress: () => dismissAnnouncement(announcement.id) },
        ]);
      }
    })();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.textPrimary,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: Colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen
          name="(tabs)"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="run/[id]"
          options={{ title: 'Run Details' }}
        />
        <Stack.Screen
          name="workout/[id]"
          options={{ title: 'Edit Workout', presentation: 'modal' }}
        />
        <Stack.Screen
          name="workout/configure"
          options={{ title: 'Configure Run', presentation: 'modal' }}
        />
        <Stack.Screen
          name="workout/new"
          options={{ title: 'New Workout', presentation: 'modal' }}
        />
        <Stack.Screen
          name="workout/run/[id]"
          options={{
            title: '',
            headerShown: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="login"
          options={{
            title: 'Sign In',
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="paywall"
          options={{
            title: 'SplitCue Pro',
            presentation: 'modal',
            headerShown: false,
          }}
        />
      </Stack>
      <SharedWorkoutSheet
        shared={incomingShare}
        onClose={() => setIncomingShare(null)}
        onRun={async (workout) => {
          setIncomingShare(null);
          await saveImportedWorkout(workout, 'run_now');
          router.push(`/workout/run/${workout.id}`);
        }}
        onSave={async (workout) => {
          setIncomingShare(null);
          await saveImportedWorkout(workout);
          router.push(`/workout/${workout.id}`);
        }}
      />
      {/* Never interrupt a run in progress; the screen appears once it ends. */}
      {updateRequired && !pathname.startsWith('/workout/run') && <RequiredUpdateScreen />}
    </>
  );
}

function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0A0A0F' }}>
      <AuthProvider>
        <SubscriptionProvider>
          <TrainingPlanProvider>
            <RootLayoutInner />
          </TrainingPlanProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

export default ObserveRoot.wrap(RootLayout);
