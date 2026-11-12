/**
 * Sharing settings — the name on shared links and cards, and what shared
 * runs show by default. The share sheet uses and updates the same choices.
 */

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, TextInput } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '../../../src/constants/theme';
import { useAuth } from '../../../src/contexts/AuthContext';
import {
  DEFAULT_SHARE_PREFERENCES,
  loadProfileFirstName,
  loadSharePreferences,
  saveSharePreferences,
  type SharePreferences,
} from '../../../src/sharing/sharePreferences';
import { SENDER_NAME_MAX_LENGTH } from '../../../src/sharing/shareWorkout';

const TOGGLES: { key: keyof Omit<SharePreferences, 'senderName'>; label: string; hint?: string }[] = [
  { key: 'includeName', label: 'Show my name', hint: 'Friends see who sent the workout' },
  { key: 'includeResult', label: 'Show time, distance, and pace' },
  { key: 'includeSplits', label: 'Show splits' },
  { key: 'includeRoute', label: 'Show route shape', hint: 'The first and last 200 m are always hidden' },
];

export default function SharingSettingsScreen() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<SharePreferences>(DEFAULT_SHARE_PREFERENCES);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const loaded = await loadSharePreferences();
        if (!loaded.senderName && user) {
          const name = await loadProfileFirstName(user.id);
          setPrefs(name ? { ...loaded, senderName: name } : loaded);
          return;
        }
        setPrefs(loaded);
      })();
    }, [user]),
  );

  const update = (partial: Partial<SharePreferences>) => {
    const next = { ...prefs, ...partial };
    setPrefs(next);
    saveSharePreferences(next);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionTitle}>Your Name</Text>
      <Text style={styles.sectionSub}>
        Shown on workout links and share images, so friends know who sent them.
      </Text>
      <TextInput
        style={styles.input}
        value={prefs.senderName}
        onChangeText={(text) => update({ senderName: text })}
        placeholder="First name"
        placeholderTextColor={Colors.textMuted}
        maxLength={SENDER_NAME_MAX_LENGTH}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        accessibilityLabel="Name shown on shares"
      />

      <Text style={styles.sectionTitle}>Defaults</Text>
      <Text style={styles.sectionSub}>
        What a shared run includes. You can change these each time you share.
      </Text>
      {TOGGLES.map(({ key, label, hint }) => (
        <View key={key} style={styles.settingRow}>
          <View style={styles.settingText}>
            <Text style={styles.settingLabel}>{label}</Text>
            {hint ? <Text style={styles.settingHint}>{hint}</Text> : null}
          </View>
          <Switch
            value={prefs[key]}
            onValueChange={(v) => update({ [key]: v })}
            trackColor={{ false: Colors.surfaceLight, true: Colors.primaryDim }}
            thumbColor={Colors.white}
            accessibilityLabel={label}
          />
        </View>
      ))}
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
  input: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
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
  settingText: {
    flex: 1,
    marginRight: Spacing.md,
  },
  settingLabel: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
  settingHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
