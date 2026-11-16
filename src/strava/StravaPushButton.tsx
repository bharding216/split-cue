/**
 * Shared "Upload to Strava" button component.
 *
 * Used on both the post-workout finished screen and the run history
 * details screen. Renders only when Strava is connected, unless
 * `allowConnect` is set:
 *   - signed out: a "Sign in to upload to Strava" link to the login screen
 *   - signed in, not connected: the official "Connect with Strava" button,
 *     which connects and then uploads this run
 *
 * Strava's brand guidelines require their unmodified button artwork for
 * the OAuth entry point and #FC5200 for "View on Strava" links.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Image,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { useStrava } from './useStrava';
import {
  getPendingStravaUpload,
  stravaActivityUrl,
  STRAVA_AT_CAPACITY_MESSAGE,
  type PushResult,
} from './stravaService';
import { hapticTap } from '../audio/haptics';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import type {
  CompletedWorkout,
  RoutePoint,
  IntervalSplit,
  WorkoutDefinition,
} from '../workout/workoutTypes';
import type { WorkoutHeartRate } from '../heartRate/hrTypes';

interface StravaPushButtonProps {
  /** The completed workout entry ID (must be set before render). */
  completedEntryId: string | null;
  workoutName: string;
  workoutId: string;
  completedAt: number;
  totalDurationMs: number;
  totalDistanceMeters?: number;
  route?: RoutePoint[];
  splits?: IntervalSplit[];
  heartRate?: WorkoutHeartRate;
  configuration?: WorkoutDefinition;
  tags?: string[];
  notes?: string;
  /** Strava activity this run was already uploaded as, if any. */
  stravaActivityId?: number;
  /** Offer sign-in / "Connect with Strava" when Strava isn't linked yet. */
  allowConnect?: boolean;
}

type PushState = 'idle' | 'connecting' | 'pushing' | 'success' | 'error';

export function StravaPushButton({
  completedEntryId,
  workoutName,
  workoutId,
  completedAt,
  totalDurationMs,
  totalDistanceMeters,
  route,
  splits,
  heartRate,
  configuration,
  tags,
  notes,
  stravaActivityId,
  allowConnect,
}: StravaPushButtonProps) {
  const router = useRouter();
  const { user } = useAuth();
  const strava = useStrava();
  const [pushState, setPushState] = useState<PushState>(
    stravaActivityId ? 'success' : 'idle',
  );
  const [activityUrl, setActivityUrl] = useState<string | null>(
    stravaActivityId ? stravaActivityUrl(stravaActivityId) : null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const applyResult = (result: PushResult) => {
    if (result.success) {
      setPushState('success');
      if (result.activityUrl) setActivityUrl(result.activityUrl);
    } else {
      setPushState('error');
      setErrorMessage(result.error ?? 'Upload failed');
    }
  };

  // An auto-upload started on the completion screen may still be running.
  useEffect(() => {
    if (stravaActivityId) {
      setPushState('success');
      setActivityUrl(stravaActivityUrl(stravaActivityId));
      return;
    }
    if (!completedEntryId) return;
    const pending = getPendingStravaUpload(completedEntryId);
    if (!pending) return;
    let active = true;
    setPushState('pushing');
    pending.then((result) => {
      if (active) applyResult(result);
    });
    return () => {
      active = false;
    };
  }, [completedEntryId, stravaActivityId]);

  // Don't render until the workout is saved and Strava status is known,
  // or when Strava isn't connected and connecting isn't offered here
  if (!completedEntryId) return null;
  if (pushState !== 'success') {
    if (strava.loading) return null;
    if (!strava.isConnected && !allowConnect) return null;
  }

  if (!user && pushState !== 'success') {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.signInLink}
          onPress={() => {
            hapticTap();
            router.push('/login' as any);
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Ionicons name="log-in-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.signInText}>Sign in to upload to Strava</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handlePush = async () => {
    hapticTap();
    setErrorMessage(null);

    if (!strava.isConnected) {
      setPushState('connecting');
      const connected = await strava.connect();
      if (!connected) {
        setPushState('idle');
        return;
      }
    }

    setPushState('pushing');

    const completed: CompletedWorkout = {
      id: completedEntryId,
      workoutId,
      workoutName,
      completedAt,
      totalDurationMs,
      totalDistanceMeters,
      route,
      splits,
      heartRate,
      configuration,
      tags: tags && tags.length > 0 ? tags : undefined,
      notes: notes?.trim() || undefined,
    };

    applyResult(await strava.pushWorkout(completed, 'manual'));
  };

  if (pushState === 'success') {
    return (
      <View style={styles.container}>
        <View style={styles.successRow}>
          <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
          <Text style={styles.successText}>Uploaded to Strava</Text>
        </View>
        {activityUrl && (
          <TouchableOpacity
            onPress={() => Linking.openURL(activityUrl)}
            activeOpacity={0.7}
            accessibilityRole="link"
          >
            <Text style={styles.viewLink}>View on Strava</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (pushState === 'error') {
    return (
      <View style={styles.container}>
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={18} color={Colors.danger} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={handlePush}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Retry Strava upload"
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const busy = pushState === 'connecting' || pushState === 'pushing';

  if (!strava.isConnected && !busy && strava.atCapacity) {
    return (
      <View style={styles.container}>
        <View style={styles.capacityRow}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.textSecondary} />
          <Text style={styles.capacityText}>{STRAVA_AT_CAPACITY_MESSAGE}</Text>
        </View>
      </View>
    );
  }

  if (!strava.isConnected && !busy) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.connectBtn}
          onPress={handlePush}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Connect with Strava"
        >
          <Image
            source={require('../../assets/strava/connect-with-strava.png')}
            style={styles.connectImage}
          />
        </TouchableOpacity>
        <Text style={styles.connectHint}>
          Connect once and this run uploads right away. After that, uploads take one tap.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.pushBtn}
        onPress={handlePush}
        disabled={busy}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Upload to Strava"
      >
        {busy ? (
          <>
            <ActivityIndicator color="#FFFFFF" size="small" />
            <Text style={styles.pushBtnText}>
              {pushState === 'connecting' ? 'Connecting to Strava…' : 'Uploading…'}
            </Text>
          </>
        ) : (
          <>
            <Ionicons name="fitness-outline" size={18} color="#FFFFFF" />
            <Text style={styles.pushBtnText}>Upload to Strava</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const STRAVA_ORANGE = '#FC5200';

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: Spacing.md,
  },
  pushBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: STRAVA_ORANGE,
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    minHeight: 44,
  },
  pushBtnText: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  connectBtn: {
    alignSelf: 'center',
  },
  connectImage: {
    width: 237,
    height: 48,
  },
  signInLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  signInText: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  capacityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  capacityText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  connectHint: {
    marginTop: Spacing.xs,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  successText: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.primary,
  },
  viewLink: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: STRAVA_ORANGE,
    textAlign: 'center',
    paddingVertical: Spacing.xs,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.danger,
    flex: 1,
  },
  retryBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  retryText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: STRAVA_ORANGE,
  },
});
