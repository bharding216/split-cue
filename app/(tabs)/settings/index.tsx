/**
 * Settings hub — cards that navigate to focused settings pages.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { Colors, Spacing, FontSize, BorderRadius } from '../../../src/constants/theme';
import { hapticTap } from '../../../src/audio/haptics';
import { useSubscription } from '../../../src/contexts/SubscriptionContext';
import { useUnits } from '../../../src/hooks/useUnits';
import { loadSettings, saveSettings } from '../../../src/workout/workoutStorage';
import type { PaceUnit } from '../../../src/pace/paceTypes';

const UNIT_OPTIONS: { value: PaceUnit; label: string; short: string }[] = [
  { value: 'minPerMile', label: 'Miles', short: 'mi' },
  { value: 'minPerKm', label: 'Kilometers', short: 'km' },
];

interface SettingsCard {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
  route: string;
}

const CARDS: SettingsCard[] = [
  {
    icon: 'body-outline',
    title: 'Running Profile',
    description: 'Goals, paces, limits & preferences',
    route: '/(tabs)/settings/profile',
  },
  {
    icon: 'person-outline',
    title: 'Account',
    description: 'Sign in, subscription, cloud sync',
    route: '/(tabs)/settings/account',
  },
  {
    icon: 'volume-high-outline',
    title: 'Audio & Cues',
    description: 'Cue mode, voice, countdown warning, progress updates',
    route: '/(tabs)/settings/audio',
  },
  {
    icon: 'speedometer-outline',
    title: 'Pace Tracking',
    description: 'GPS pace, cue frequency, pace window',
    route: '/(tabs)/settings/pace',
  },
  {
    icon: 'heart-outline',
    title: 'Heart Rate Monitor',
    description: 'Connect a Bluetooth chest strap or armband',
    route: '/(tabs)/settings/heart-rate',
  },
  {
    icon: 'paper-plane-outline',
    title: 'Sharing',
    description: 'Your name and what shared runs show',
    route: '/(tabs)/settings/sharing',
  },
  {
    icon: 'options-outline',
    title: 'General',
    description: 'Haptic feedback, screen behavior, backup & restore',
    route: '/(tabs)/settings/general',
  },
  {
    icon: 'chatbubble-ellipses-outline',
    title: 'Share & Feedback',
    description: 'Rate, share, send feedback',
    route: '/(tabs)/settings/about',
  },
];

export default function SettingsHubScreen() {
  const router = useRouter();
  const { tier, devOverrideTier, setDevOverrideTier } = useSubscription();
  const unit = useUnits();

  const setUnit = async (paceUnit: PaceUnit) => {
    hapticTap();
    const current = await loadSettings();
    await saveSettings({ ...current, paceUnit });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.unitCard}>
        <Text style={styles.unitTitle}>Units</Text>
        <View style={styles.unitToggle}>
          {UNIT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.unitSegment, unit === opt.value && styles.unitSegmentActive]}
              onPress={() => setUnit(opt.value)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: unit === opt.value }}
              accessibilityLabel={opt.label}
            >
              <Text style={[styles.unitSegmentLabel, unit === opt.value && styles.unitSegmentLabelActive]}>
                {opt.short}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {CARDS.map((card) => (
        <TouchableOpacity
          key={card.route}
          style={styles.card}
          onPress={() => {
            hapticTap();
            router.push(card.route as any);
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Ionicons name={card.icon} size={26} color={Colors.textSecondary} />
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={styles.cardDescription}>{card.description}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      ))}

      {__DEV__ && (
        <View style={styles.devSection}>
          <Text style={styles.devHeader}>🛠 Dev Tools</Text>
          <View style={styles.devRow}>
            <View style={{ flex: 1, marginRight: Spacing.md }}>
              <Text style={styles.cardTitle}>Pro Override</Text>
              <Text style={styles.cardDescription}>
                {devOverrideTier != null
                  ? `Forced to "${devOverrideTier}"`
                  : `Using real tier ("${tier}")`}
              </Text>
            </View>
            <Switch
              value={devOverrideTier === 'pro'}
              onValueChange={(on) => setDevOverrideTier(on ? 'pro' : null)}
              trackColor={{ true: Colors.primary }}
              accessibilityLabel="Pro Override"
            />
          </View>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          SplitCue v{Constants.expoConfig?.version ?? '?'}
        </Text>
        <Text style={styles.footerText}>
          Made with ❤️ in Texas 🤠
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
    gap: Spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
    gap: Spacing.md,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  cardDescription: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },
  unitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    rowGap: Spacing.sm,
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
  },
  unitTitle: {
    flexShrink: 1,
    marginRight: Spacing.md,
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: 2,
  },
  unitSegment: {
    paddingVertical: 4,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md - 2,
  },
  unitSegmentActive: {
    backgroundColor: Colors.primary + '22',
  },
  unitSegmentLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  unitSegmentLabelActive: { color: Colors.primary },
  devSection: {
    marginTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight,
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
  },
  devHeader: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  devRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
  },
  footer: {
    marginTop: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  footerText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
