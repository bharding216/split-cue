/**
 * HrCloudConsentCard — asks a signed-in runner whether to save their heart
 * rate readings to their account. Renders nothing once they've answered,
 * when signed out, or when no monitor is paired.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { hapticTap } from '../audio/haptics';
import { useAuth } from '../contexts/AuthContext';
import { useHeartRateMonitor } from '../hooks/useHeartRateMonitor';
import {
  PRIVACY_POLICY_URL,
  setHrCloudConsent,
  useHrCloudConsent,
} from '../heartRate/hrConsent';
import type { HrConsentSource } from '../analytics/hrEvents';
import { syncAll } from '../sync/cloudSync';

interface Props {
  source: HrConsentSource;
  compact?: boolean;
}

export function HrCloudConsentCard({ source, compact }: Props) {
  const { user } = useAuth();
  const { device } = useHeartRateMonitor();
  const consent = useHrCloudConsent();

  if (!user || !device || consent !== 'undecided') return null;

  const answer = async (granted: boolean) => {
    hapticTap();
    await setHrCloudConsent(granted, source);
    if (granted) syncAll(user.id);
  };

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.titleRow}>
        <Ionicons name="cloud-upload-outline" size={18} color={Colors.accent} />
        <Text style={styles.title}>Save heart rate to your account?</Text>
      </View>
      <Text style={styles.body}>
        SplitCue always records your heart rate on this phone. Saving the readings to your account
        backs them up, shows your graphs on your other devices, and lets future analysis use your
        past runs.
      </Text>
      {!compact && (
        <Text style={styles.body}>
          Your heart rate is private: it’s never shown to other people or used for advertising.
          You can change this or delete the saved readings any time in Heart Rate settings.
        </Text>
      )}
      <TouchableOpacity
        onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
        accessibilityRole="link"
        style={styles.policyLink}
      >
        <Text style={styles.linkText}>Privacy Policy</Text>
      </TouchableOpacity>
      <View style={styles.buttons}>
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => answer(false)}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>Keep on This Phone</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={() => answer(true)}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Save to Account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.accent + '12',
    borderColor: Colors.accent + '33',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  cardCompact: {
    marginTop: Spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  title: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  body: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  policyLink: {
    alignSelf: 'flex-start',
  },
  linkText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.accent,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  button: {
    flexGrow: 1,
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
  },
  secondaryButton: {
    backgroundColor: Colors.surfaceLight,
  },
  primaryText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.black,
  },
  secondaryText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
});
