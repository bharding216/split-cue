/**
 * Settings hub — grouped sections with navigation cards, inline actions,
 * and dynamic descriptions showing current setting values.
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Linking,
  Platform,
} from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { Colors, Spacing, FontSize, BorderRadius } from '../../../src/constants/theme';
import { hapticTap } from '../../../src/audio/haptics';
import { useSubscription } from '../../../src/contexts/SubscriptionContext';
import { useUnits } from '../../../src/hooks/useUnits';
import { loadSettings, saveSettings } from '../../../src/workout/workoutStorage';
import { AppSettings, DEFAULT_SETTINGS } from '../../../src/workout/workoutTypes';
import type { PaceUnit } from '../../../src/pace/paceTypes';
import { useFeedbackButton } from '../../../src/components/FeedbackHeaderButton';
import { useHeartRateMonitor } from '../../../src/hooks/useHeartRateMonitor';
import { shareSplitCue } from '../../../src/sharing/shareApp';
import { PREMIUM_VOICES } from '../../../src/audio/voiceCatalog';

const APP_STORE_URL =
  'https://apps.apple.com/us/app/pacecue-interval-timer/id6809834816';
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.surmount.pacecue';

const UNIT_OPTIONS: { value: PaceUnit; label: string; short: string }[] = [
  { value: 'minPerMile', label: 'Miles', short: 'mi' },
  { value: 'minPerKm', label: 'Kilometers', short: 'km' },
];

/* ── Types ── */

interface SettingsCard {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string | (() => string);
  route: string;
}

interface SettingsAction {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  onPress: () => void;
}

interface SettingsSection {
  title: string;
  items: (SettingsCard | SettingsAction | 'units')[];
}

function isCard(item: SettingsCard | SettingsAction | 'units'): item is SettingsCard {
  return typeof item === 'object' && 'route' in item;
}
function isAction(item: SettingsCard | SettingsAction | 'units'): item is SettingsAction {
  return typeof item === 'object' && 'onPress' in item;
}

/* ── Helpers for dynamic descriptions ── */

function audioDescription(s: AppSettings): string {
  const mode = s.audioCueMode === 'both' ? 'Voice & beeps' : s.audioCueMode.charAt(0).toUpperCase() + s.audioCueMode.slice(1);
  if (s.voiceEngine === 'premium') {
    const pv = PREMIUM_VOICES.find((v) => v.id === s.premiumVoiceId) ?? PREMIUM_VOICES[0];
    return `${mode} \u00b7 ${pv.name}`;
  }
  return `${mode} \u00b7 Device voice`;
}

function paceDescription(s: AppSettings): string {
  if (s.paceMode === 'off') return 'GPS off';
  const window = `${s.paceWindow}s smoothing`;
  return `GPS ${s.paceMode === 'announce' ? 'announce' : 'record'} \u00b7 ${window}`;
}

function hrDescription(s: AppSettings, deviceName: string | null): string {
  const parts: string[] = [];
  if (deviceName) parts.push(deviceName);
  if (s.hrMode === 'off') {
    parts.push('Off');
  } else {
    parts.push(s.hrMode === 'announce' ? 'Record + Announce' : 'Record only');
  }
  return parts.join(' \u00b7 ');
}

function workoutPrefsDescription(s: AppSettings): string {
  const haptic = s.hapticEnabled ? 'Haptics on' : 'Haptics off';
  const screen = s.keepScreenOn ? 'Screen stays on' : 'Screen dims';
  return `${haptic} \u00b7 ${screen}`;
}

export default function SettingsHubScreen() {
  const router = useRouter();
  const feedback = useFeedbackButton('settings');
  const { tier, devOverrideTier, setDevOverrideTier } = useSubscription();
  const unit = useUnits();
  const { device } = useHeartRateMonitor();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useFocusEffect(
    useCallback(() => {
      loadSettings().then(setSettings);
    }, []),
  );

  const setUnit = async (paceUnit: PaceUnit) => {
    hapticTap();
    const current = await loadSettings();
    const next = { ...current, paceUnit };
    await saveSettings(next);
    setSettings(next);
  };

  const handleRate = () => {
    hapticTap();
    Linking.openURL(
      Platform.OS === 'android'
        ? `${PLAY_STORE_URL}&showAllReviews=true`
        : `${APP_STORE_URL}?action=write-review`,
    ).catch(() => {});
  };

  const handleShare = () => {
    hapticTap();
    shareSplitCue('settings_hub');
  };

  const SECTIONS: SettingsSection[] = [
    {
      title: 'ACCOUNT',
      items: [
        {
          icon: 'person-outline',
          title: 'Account',
          description: 'Profile, subscription, cloud sync',
          route: '/(tabs)/settings/account',
        },
      ],
    },
    {
      title: 'WORKOUT EXPERIENCE',
      items: [
        {
          icon: 'volume-high-outline',
          title: 'Audio & Cues',
          description: () => audioDescription(settings),
          route: '/(tabs)/settings/audio',
        },
        {
          icon: 'speedometer-outline',
          title: 'Pace & Distance',
          description: () => paceDescription(settings),
          route: '/(tabs)/settings/pace',
        },
        {
          icon: 'heart-outline',
          title: 'Heart Rate',
          description: () => hrDescription(settings, device?.name ?? null),
          route: '/(tabs)/settings/heart-rate',
        },
        {
          icon: 'options-outline',
          title: 'Workout Preferences',
          description: () => workoutPrefsDescription(settings),
          route: '/(tabs)/settings/workout-preferences',
        },
      ],
    },
    {
      title: 'APP PREFERENCES',
      items: [
        'units' as const,
        {
          icon: 'notifications-outline',
          title: 'Notifications',
          route: '/(tabs)/settings/notifications',
          description: 'Feature updates',
        },
        {
          icon: 'cloud-outline',
          title: 'Data & Backup',
          route: '/(tabs)/settings/data-backup',
          description: 'Export and restore workouts',
        },
      ],
    },
    {
      title: 'SUPPORT',
      items: [
        {
          icon: 'chatbubble-ellipses-outline',
          title: 'Help & Feedback',
          description: 'Send feedback, get help',
          route: '/(tabs)/settings/about',
        },
        { icon: 'star-outline', title: 'Rate SplitCue', onPress: handleRate },
        { icon: 'share-outline', title: 'Share SplitCue', onPress: handleShare },
      ],
    },
  ];

  return (
    <>
      <Stack.Screen options={{ headerRight: () => feedback.button }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionHeader}>{section.title}</Text>
            {section.items.map((item, i) => {
              if (item === 'units') {
                return (
                  <View key="units" style={styles.unitCard}>
                    <Ionicons name="swap-horizontal-outline" size={22} color={Colors.textSecondary} />
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
                );
              }

              if (isCard(item)) {
                const desc = typeof item.description === 'function' ? item.description() : item.description;
                return (
                  <TouchableOpacity
                    key={item.route}
                    style={styles.card}
                    onPress={() => {
                      hapticTap();
                      router.push(item.route as any);
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                  >
                    <Ionicons name={item.icon} size={22} color={Colors.textSecondary} />
                    <View style={styles.cardBody}>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      <Text style={styles.cardDescription} numberOfLines={1}>{desc}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                );
              }

              if (isAction(item)) {
                return (
                  <TouchableOpacity
                    key={item.title}
                    style={styles.card}
                    onPress={item.onPress}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                  >
                    <Ionicons name={item.icon} size={22} color={Colors.textSecondary} />
                    <View style={styles.cardBody}>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                );
              }

              return null;
            })}
          </View>
        ))}

        {__DEV__ && (
          <View style={styles.devSection}>
            <Text style={styles.sectionHeader}>DEV TOOLS</Text>
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
        </View>
      </ScrollView>
      {feedback.sheet}
    </>
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
  },
  section: {
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
    gap: Spacing.md,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  cardDescription: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: 1,
  },
  unitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
    gap: Spacing.md,
  },
  unitTitle: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: '600',
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
    marginTop: Spacing.sm,
  },
  devRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  footer: {
    marginTop: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  footerText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
