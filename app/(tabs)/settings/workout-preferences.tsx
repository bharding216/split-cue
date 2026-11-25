/**
 * Workout Preferences — haptic feedback and screen behavior during workouts.
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AppSettings, DEFAULT_SETTINGS } from '../../../src/workout/workoutTypes';
import { loadSettings, saveSettings } from '../../../src/workout/workoutStorage';
import { Colors, Spacing, FontSize, BorderRadius } from '../../../src/constants/theme';
import { hapticTap } from '../../../src/audio/haptics';

export default function WorkoutPreferencesScreen() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useFocusEffect(
    useCallback(() => {
      loadSettings().then(setSettings);
    }, []),
  );

  const update = async (partial: Partial<AppSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    await saveSettings(next);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Haptic Feedback</Text>
      <View style={styles.settingRow}>
        <View style={styles.settingBody}>
          <Text style={styles.settingLabel}>Vibrate on interval changes</Text>
          <Text style={styles.settingHint}>
            Feel a tap when your workout moves to the next interval
          </Text>
        </View>
        <Switch
          value={settings.hapticEnabled}
          onValueChange={(v) => {
            if (v) hapticTap();
            update({ hapticEnabled: v });
          }}
          trackColor={{ false: Colors.surfaceLight, true: Colors.primaryDim }}
          thumbColor={Colors.white}
          accessibilityLabel="Vibrate on interval changes"
        />
      </View>

      <Text style={styles.sectionTitle}>Display</Text>
      <View style={styles.settingRow}>
        <View style={styles.settingBody}>
          <Text style={styles.settingLabel}>Keep screen on during workout</Text>
          <Text style={styles.settingHint}>
            Prevents the screen from dimming while a workout is active
          </Text>
        </View>
        <Switch
          value={settings.keepScreenOn}
          onValueChange={(v) => update({ keepScreenOn: v })}
          trackColor={{ false: Colors.surfaceLight, true: Colors.primaryDim }}
          thumbColor={Colors.white}
          accessibilityLabel="Keep screen on during workout"
        />
      </View>
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
  settingHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },
});
