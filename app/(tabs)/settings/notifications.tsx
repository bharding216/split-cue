/**
 * Notifications settings — push notification preferences.
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '../../../src/constants/theme';
import { hapticTap } from '../../../src/audio/haptics';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushToggleState,
} from '../../../src/notifications/pushRegistration';

export default function NotificationsScreen() {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushDenied, setPushDenied] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const refreshPushToggle = useCallback(() => {
    getPushToggleState().then((state) => {
      setPushEnabled(state.enabled);
      setPushDenied(state.osDenied);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshPushToggle();
    }, [refreshPushToggle]),
  );

  const handlePushToggle = async (on: boolean) => {
    if (pushBusy) return;
    hapticTap();
    setPushEnabled(on);
    setPushBusy(true);
    try {
      if (on) {
        const result = await enablePushNotifications();
        if (!result.ok && result.osDenied) {
          Alert.alert(
            'Notifications are off',
            'Enable notifications for SplitCue in system settings to hear about new features.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ],
          );
        } else if (!result.ok && result.error) {
          Alert.alert('Notifications', result.error);
        }
      } else {
        await disablePushNotifications();
      }
      refreshPushToggle();
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Feature Updates</Text>
      <Text style={styles.sectionSub}>
        Get a notification when we ship something new.
      </Text>
      <View style={styles.settingRow}>
        <View style={styles.settingBody}>
          <Text style={styles.settingLabel}>New feature updates</Text>
        </View>
        <Switch
          value={pushEnabled}
          disabled={pushBusy}
          onValueChange={handlePushToggle}
          trackColor={{ false: Colors.surfaceLight, true: Colors.primaryDim }}
          thumbColor={Colors.white}
          accessibilityLabel="New feature updates"
        />
      </View>
      {pushDenied && !pushEnabled && (
        <TouchableOpacity
          onPress={() => Linking.openSettings()}
          activeOpacity={0.7}
          style={styles.settingsLink}
        >
          <Text style={styles.settingsLinkText}>Open system settings</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  sectionSub: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  settingBody: { flex: 1, marginRight: Spacing.md },
  settingLabel: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  settingsLink: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  settingsLinkText: {
    fontSize: FontSize.sm,
    color: Colors.accent,
    fontWeight: '600',
  },
});
