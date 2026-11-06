/**
 * Account settings — shows auth state, subscription status,
 * sign out, and link to manage subscription.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useSubscription } from '../../../src/contexts/SubscriptionContext';
import { useStrava } from '../../../src/strava/useStrava';
import {
  setStravaAutoUpload,
  STRAVA_AT_CAPACITY_MESSAGE,
} from '../../../src/strava/stravaService';
import { loadSettings, onSettingsSaved } from '../../../src/workout/workoutStorage';
import { getSyncStatus, onSyncStatusChange, SyncStatus } from '../../../src/sync/cloudSync';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../../../src/constants/theme';
import { hapticTap } from '../../../src/audio/haptics';
import { useLargeText } from '../../../src/hooks/useLargeText';

export default function AccountScreen() {
  const router = useRouter();
  const large = useLargeText();
  const { user, signOut, deleteAccount } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const { tier, manageSubscription } = useSubscription();

  const strava = useStrava();
  const [autoUpload, setAutoUpload] = useState(false);

  useEffect(() => {
    const refresh = () => {
      loadSettings().then((s) => setAutoUpload(s.stravaAutoUpload)).catch(() => {});
    };
    refresh();
    return onSettingsSaved(refresh);
  }, []);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncStatus());

  useEffect(() => {
    return onSyncStatusChange(setSyncStatus);
  }, []);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Your data will stay on this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.back();
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data, including your workouts, run history, AI conversations, and running profile. This action cannot be undone.\n\nYour local data on this device will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              'This is permanent. All your cloud data will be deleted immediately.',
              [
                { text: 'Go Back', style: 'cancel' },
                {
                  text: 'Delete Forever',
                  style: 'destructive',
                  onPress: async () => {
                    setDeleting(true);
                    const { error } = await deleteAccount();
                    setDeleting(false);
                    if (error) {
                      Alert.alert(
                        'Deletion Failed',
                        error.message ?? 'Something went wrong. Please try again or contact support.',
                      );
                    } else {
                      router.back();
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  if (!user) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.centered}>
          <Ionicons name="person-circle-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.noAccountTitle} maxFontSizeMultiplier={MaxFontScale.display}>
            No account
          </Text>
          <Text style={styles.noAccountText}>
            Sign in to unlock AI workout building and cloud sync.
          </Text>
          <TouchableOpacity
            style={styles.signInBtn}
            onPress={() => {
              hapticTap();
              router.push('/login' as any);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.signInBtnText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  const syncLabel =
    syncStatus === 'syncing'
      ? 'Syncing…'
      : syncStatus === 'success'
        ? 'Synced'
        : syncStatus === 'error'
          ? 'Sync error'
          : 'Idle';

  const syncColor =
    syncStatus === 'success'
      ? Colors.primary
      : syncStatus === 'error'
        ? Colors.danger
        : Colors.textMuted;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* User info */}
      <View style={styles.userCard}>
        <Ionicons name="person-circle" size={48} color={Colors.primary} />
        <View style={styles.userInfo}>
          <Text style={styles.userEmail}>{user.email ?? 'Account'}</Text>
          <View style={styles.tierBadgeRow}>
            <View
              style={[
                styles.tierBadge,
                tier === 'pro' && styles.tierBadgePro,
              ]}
            >
              <Text
                style={[
                  styles.tierBadgeText,
                  tier === 'pro' && styles.tierBadgeTextPro,
                ]}
              >
                {tier === 'pro' ? 'PRO' : 'FREE'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Sync status */}
      <View style={styles.syncBlock}>
        <View style={styles.row}>
          <Ionicons name="cloud-done-outline" size={20} color={syncColor} />
          <Text style={[styles.rowLabel, { color: syncColor }]}>
            Cloud sync: {syncLabel}
          </Text>
        </View>
        <Text style={styles.syncHint}>
          Your workouts and settings are backed up to the cloud so they stay
          safe and available if you switch devices.
        </Text>
      </View>

      {/* Connected Apps */}
      <View style={styles.connectedAppsSection}>
        <Text style={styles.connectedAppsTitle}>Connected Apps</Text>
        <View style={styles.stravaCard}>
          <View style={[styles.stravaRow, large && styles.stravaRowLarge]}>
            <View style={[styles.stravaInfo, large && styles.stravaInfoStacked]}>
              <View style={styles.stravaBrand}>
                <Ionicons name="fitness-outline" size={22} color="#FC5200" />
                <Text style={styles.stravaName}>Strava</Text>
              </View>
              {strava.isConnected ? (
                <Text style={styles.stravaStatus}>
                  Connected{strava.athleteName ? ` as ${strava.athleteName}` : ''}
                </Text>
              ) : (
                <Text style={styles.stravaStatus}>
                  Upload completed workouts to Strava
                </Text>
              )}
            </View>
            {strava.isConnected && (
              <TouchableOpacity
                style={styles.stravaDisconnectBtn}
                onPress={() => {
                  hapticTap();
                  strava.disconnect();
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Disconnect Strava"
              >
                <Text style={styles.stravaDisconnectText}>Disconnect</Text>
              </TouchableOpacity>
            )}
          </View>
          {strava.isConnected && (
            <View style={styles.stravaAutoRow}>
              <View style={styles.stravaInfo}>
                <Text style={styles.stravaAutoLabel}>Automatically upload workouts</Text>
                <Text style={styles.stravaAutoHint}>
                  {autoUpload
                    ? 'Every finished run goes to Strava.'
                    : 'Upload runs one at a time when you want to.'}
                </Text>
              </View>
              <Switch
                value={autoUpload}
                onValueChange={(v) => {
                  setAutoUpload(v);
                  setStravaAutoUpload(v, 'settings').catch(() => {});
                }}
                trackColor={{ false: Colors.surfaceLight, true: Colors.primaryDim }}
                thumbColor={Colors.white}
                accessibilityLabel="Automatically upload workouts to Strava"
              />
            </View>
          )}
          {!strava.isConnected &&
            (strava.connecting ? (
              <ActivityIndicator color="#FC5200" style={styles.stravaConnecting} />
            ) : strava.atCapacity ? (
              <Text style={styles.stravaCapacityNote}>{STRAVA_AT_CAPACITY_MESSAGE}</Text>
            ) : (
              <TouchableOpacity
                style={styles.stravaConnectBtn}
                onPress={() => {
                  hapticTap();
                  strava.connect();
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Connect with Strava"
              >
                <Image
                  source={require('../../../assets/strava/connect-with-strava.png')}
                  style={styles.stravaConnectImage}
                />
              </TouchableOpacity>
            ))}
        </View>
      </View>

      {/* Upgrade to Pro */}
      {tier === 'free' && (
        <TouchableOpacity
          style={styles.upgradeBtn}
          onPress={() => {
            hapticTap();
            router.push('/paywall' as any);
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="sparkles" size={18} color={Colors.black} />
          <Text style={styles.upgradeBtnText}>Upgrade to Pro</Text>
        </TouchableOpacity>
      )}

      {/* Manage subscription */}
      {tier === 'pro' && (
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => {
            hapticTap();
            manageSubscription();
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="card-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.actionRowText}>Manage Subscription</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      )}

      {/* Sign out */}
      <TouchableOpacity
        style={[styles.actionRow, { marginTop: Spacing.xl }]}
        onPress={handleSignOut}
        activeOpacity={0.7}
      >
        <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
        <Text style={[styles.actionRowText, { color: Colors.danger }]}>
          Sign Out
        </Text>
      </TouchableOpacity>

      {/* Delete account */}
      <TouchableOpacity
        style={[styles.actionRow, styles.deleteRow]}
        onPress={handleDeleteAccount}
        disabled={deleting}
        activeOpacity={0.7}
      >
        {deleting ? (
          <ActivityIndicator color={Colors.danger} size="small" />
        ) : (
          <Ionicons name="trash-outline" size={20} color={Colors.danger} />
        )}
        <Text style={[styles.actionRowText, { color: Colors.danger }]}>
          Delete Account
        </Text>
      </TouchableOpacity>
      <Text style={styles.deleteHint}>
        Permanently deletes your account and all cloud data.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  centered: {
    alignItems: 'center',
    paddingTop: Spacing.xxl,
  },
  noAccountTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: Spacing.md,
  },
  noAccountText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  signInBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl * 2,
    borderRadius: BorderRadius.md,
  },
  signInBtnText: {
    color: Colors.black,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
  },
  userInfo: {
    flex: 1,
  },
  userEmail: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  tierBadgeRow: {
    flexDirection: 'row',
    marginTop: Spacing.xs,
  },
  tierBadge: {
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  tierBadgePro: {
    backgroundColor: Colors.primary + '20',
  },
  tierBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  tierBadgeTextPro: {
    color: Colors.primary,
  },
  syncBlock: {
    marginBottom: Spacing.xs,
  },
  syncHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
    marginLeft: 20 + Spacing.sm,
    lineHeight: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  rowLabel: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  upgradeBtnText: {
    color: Colors.black,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
  },
  actionRowText: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  deleteRow: {
    marginTop: Spacing.sm,
    borderColor: Colors.danger + '33',
  },
  deleteHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  connectedAppsSection: {
    marginTop: Spacing.lg,
  },
  connectedAppsTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  stravaCard: {
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
  },
  stravaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stravaRowLarge: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  stravaInfoStacked: {
    flex: 0,
    alignSelf: 'stretch',
  },
  stravaInfo: {
    flex: 1,
  },
  stravaBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stravaName: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  stravaStatus: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
    marginLeft: 22 + Spacing.sm,
  },
  stravaAutoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight,
  },
  stravaAutoLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  stravaAutoHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  stravaConnectBtn: {
    alignSelf: 'center',
    marginTop: Spacing.md,
  },
  stravaConnectImage: {
    width: 237,
    height: 48,
  },
  stravaConnecting: {
    marginTop: Spacing.md,
    height: 48,
  },
  stravaCapacityNote: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  stravaDisconnectBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  stravaDisconnectText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
  },
});
