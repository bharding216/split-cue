import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors } from '../src/constants/theme';
import { cleanupStaleLiveActivities } from '../src/hooks/useLiveActivity';
import {
  initInstallTimestamp,
  getUnseenAnnouncement,
  dismissAnnouncement,
} from '../src/announcements/announcementService';
import { track } from '../src/analytics/track';
import { reportDevice } from '../src/analytics/deviceReport';
import { decodeWorkoutLink, resolveShareCode } from '../src/sharing/shareWorkout';
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

function RootLayoutInner() {
  const router = useRouter();
  const pathname = usePathname();
  const updateRequired = useRequiredUpdate();
  const { user, loading: authLoading } = useAuth();
  const { tier, loading: subscriptionLoading } = useSubscription();
  const { planWorkouts } = useTrainingPlan();
  const prevUserIdRef = useRef<string | null>(null);

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

  // Handle incoming deep links for shared workout imports.
  useEffect(() => {
    const handleUrl = async (url: string, { isInitial }: { isInitial?: boolean } = {}) => {
      // Support HTTPS links (splitcue.app/w/<code>), custom-scheme short links
      // (pacecue://w/<code>), and legacy base64 links (pacecue://workout/import?d=...)
      const shortMatch = url.match(/\/w\/([A-Za-z0-9]{4,16})$/);
      const isLegacy = url.includes('workout/import');

      if (!shortMatch && !isLegacy) return;

      // On cold start the URL doesn't match any app route, so Expo Router
      // renders an unmatched/404 screen. Navigate to home first to clear it.
      if (isInitial) {
        router.replace('/');
      }

      const workout = shortMatch
        ? await resolveShareCode(shortMatch[1])
        : decodeWorkoutLink(url);

      if (workout === 'needs-update') {
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

      if (!workout) {
        Alert.alert('Invalid Link', 'Could not read the shared workout.');
        return;
      }

      Alert.alert(
        'Import Workout',
        `Add "${workout.name}" to your workouts?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            onPress: async () => {
              await saveWorkout({ ...workout, origin: 'imported' });
              track('workout_imported', {
                workout_id: workout.id,
                workout_name: workout.name,
              });
              router.push(`/workout/${workout.id}`);
            },
          },
        ],
      );
    };

    // Handle URL that launched the app (cold start)
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url, { isInitial: true });
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
        Alert.alert(
          'Resume Workout?',
          `"${workout.name}" was still in progress when SplitCue closed. Pick up where you left off?`,
          [
            {
              text: 'Discard',
              style: 'destructive',
              onPress: () => {
                clearActiveSession();
                track('workout_resume_declined', { workout_id: workout.id });
              },
            },
            {
              text: 'Resume',
              style: 'default',
              onPress: () => router.push(`/workout/run/${workout.id}?resume=1` as any),
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
      {/* Never interrupt a run in progress; the screen appears once it ends. */}
      {updateRequired && !pathname.startsWith('/workout/run') && <RequiredUpdateScreen />}
    </>
  );
}

export default function RootLayout() {
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
