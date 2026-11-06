/**
 * React hook for Strava integration.
 *
 * Wraps the stravaService functions with React state management
 * for loading indicators and connection status.
 */

import { useState, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import {
  getStravaStatus,
  getStravaCapacityAvailable,
  connectStrava,
  disconnectStrava,
  pushWorkoutToStrava,
  setStravaAutoUpload,
  STRAVA_AT_CAPACITY_MESSAGE,
  type StravaConnection,
  type PushResult,
  type PushTrigger,
} from './stravaService';
import type { CompletedWorkout } from '../workout/workoutTypes';

export interface UseStravaReturn {
  /** Whether the user has a connected Strava account. */
  isConnected: boolean;
  /** The connected Strava athlete's display name. */
  athleteName: string | null;
  /** Whether the OAuth flow is in progress. */
  connecting: boolean;
  /** Whether a workout push is in progress. */
  pushing: boolean;
  /** Whether we're still loading the initial connection status. */
  loading: boolean;
  /** Strava's athlete limit is reached, so new connections can't be made. */
  atCapacity: boolean;
  /** Initiate the Strava OAuth connection flow. Resolves true once connected. */
  connect: () => Promise<boolean>;
  /** Disconnect the linked Strava account. */
  disconnect: () => Promise<void>;
  /** Push a completed workout to Strava. */
  pushWorkout: (completed: CompletedWorkout, trigger?: PushTrigger) => Promise<PushResult>;
  /** Re-check connection status (e.g. after navigating back). */
  refresh: () => Promise<void>;
}

export function useStrava(): UseStravaReturn {
  const { user } = useAuth();
  const [status, setStatus] = useState<StravaConnection>({
    connected: false,
    athleteName: null,
    stravaAthleteId: null,
  });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [atCapacity, setAtCapacity] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setStatus({ connected: false, athleteName: null, stravaAthleteId: null });
      setAtCapacity(false);
      setLoading(false);
      return;
    }
    try {
      const s = await getStravaStatus();
      setStatus(s);
      setAtCapacity(s.connected ? false : !(await getStravaCapacityAvailable()));
    } catch {
      // Non-fatal — keep whatever state we had
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Load status on mount and when the user changes
  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  const connect = useCallback(async () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in before connecting Strava.');
      return false;
    }
    if (atCapacity) {
      Alert.alert('Strava Connections Are Full', STRAVA_AT_CAPACITY_MESSAGE);
      return false;
    }
    setConnecting(true);
    try {
      const result = await connectStrava();
      if (result.atCapacity) {
        setAtCapacity(true);
        Alert.alert('Strava Connections Are Full', STRAVA_AT_CAPACITY_MESSAGE);
        return false;
      }
      if (result.success) {
        setStatus({
          connected: true,
          athleteName: result.athleteName ?? null,
          stravaAthleteId: null,
        });
        Alert.alert(
          'Upload Automatically?',
          'Automatically upload completed workouts to Strava? You can still upload runs one at a time, and change this in Settings > Account.',
          [
            {
              text: 'Not Now',
              style: 'cancel',
              onPress: () => setStravaAutoUpload(false, 'connect_prompt').catch(() => {}),
            },
            {
              text: 'Upload Automatically',
              onPress: () => setStravaAutoUpload(true, 'connect_prompt').catch(() => {}),
            },
          ],
        );
        return true;
      }
      if (result.error) {
        Alert.alert('Strava Connection Failed', result.error);
      }
      // If !success and no error, user cancelled — do nothing
      return false;
    } finally {
      setConnecting(false);
    }
  }, [user, atCapacity]);

  const disconnect = useCallback(async () => {
    Alert.alert(
      'Disconnect Strava',
      'Your Strava account will be unlinked. You can reconnect at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            const { error } = await disconnectStrava();
            if (error) {
              Alert.alert('Error', error);
            } else {
              setStatus({
                connected: false,
                athleteName: null,
                stravaAthleteId: null,
              });
            }
          },
        },
      ],
    );
  }, []);

  const pushWorkout = useCallback(
    async (completed: CompletedWorkout, trigger?: PushTrigger): Promise<PushResult> => {
      setPushing(true);
      try {
        return await pushWorkoutToStrava(completed, trigger);
      } finally {
        setPushing(false);
      }
    },
    [],
  );

  return {
    isConnected: status.connected,
    athleteName: status.athleteName,
    connecting,
    pushing,
    loading,
    atCapacity,
    connect,
    disconnect,
    pushWorkout,
    refresh,
  };
}
