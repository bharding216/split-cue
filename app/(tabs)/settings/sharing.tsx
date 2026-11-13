/**
 * Sharing settings — the name on shared links and cards, and what shared
 * runs show by default. The share sheet uses and updates the same choices.
 */

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { track } from '../../../src/analytics/track';
import { hapticTap } from '../../../src/audio/haptics';
import { Colors, Spacing, FontSize, BorderRadius } from '../../../src/constants/theme';
import { useAuth } from '../../../src/contexts/AuthContext';
import {
  DEFAULT_SHARE_PREFERENCES,
  loadProfileFirstName,
  loadSharePreferences,
  saveSharePreferences,
  type SharePreferences,
} from '../../../src/sharing/sharePreferences';
import {
  SENDER_NAME_MAX_LENGTH,
  listMyShares,
  revokeShare,
  type MyShare,
} from '../../../src/sharing/shareWorkout';
import type { ShareKind } from '../../../src/sharing/shareText';

const KIND_LABELS: Record<ShareKind, string> = {
  structure: 'Workout',
  planned: 'Planned run',
  results: 'Result',
  challenge: 'Challenge',
  achievement: 'Achievement',
};

function shareStats(share: MyShare): string {
  const parts = [`${share.opens} open${share.opens !== 1 ? 's' : ''}`];
  if (share.imports > 0) parts.push(`${share.imports} saved`);
  if (share.completions > 0) parts.push(`${share.completions} run${share.completions !== 1 ? 's' : ''}`);
  return parts.join(' · ');
}

const TOGGLES: { key: keyof Omit<SharePreferences, 'senderName'>; label: string; hint?: string }[] = [
  { key: 'includeName', label: 'Show my name', hint: 'Friends see who sent the workout' },
  { key: 'includeResult', label: 'Show time, distance, and pace' },
  { key: 'includeSplits', label: 'Show splits' },
  { key: 'includeRoute', label: 'Show route shape', hint: 'The first and last 200 m are always hidden' },
];

export default function SharingSettingsScreen() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<SharePreferences>(DEFAULT_SHARE_PREFERENCES);
  const [shares, setShares] = useState<MyShare[] | null>(null);
  const [sharesFailed, setSharesFailed] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setShares(null);
        return;
      }
      let cancelled = false;
      setSharesFailed(false);
      listMyShares()
        .then((list) => {
          if (!cancelled) setShares(list);
        })
        .catch(() => {
          if (!cancelled) setSharesFailed(true);
        });
      return () => {
        cancelled = true;
      };
    }, [user]),
  );

  const confirmRevoke = (share: MyShare) => {
    hapticTap();
    Alert.alert(
      'Turn Off Link?',
      `Anyone with the link to "${share.workoutName ?? 'this workout'}" won't be able to open it. Copies friends already saved stay on their phones.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn Off',
          style: 'destructive',
          onPress: async () => {
            setRevoking(share.code);
            try {
              await revokeShare(share.code);
              track('share_revoked', { share_code: share.code, share_type: share.kind });
              setShares((list) =>
                list?.map((s) => (s.code === share.code ? { ...s, revokedAt: new Date().toISOString() } : s)) ?? list,
              );
            } catch {
              Alert.alert('Could Not Turn Off Link', 'Check your connection and try again.');
            } finally {
              setRevoking(null);
            }
          },
        },
      ],
    );
  };

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

      {user && (
        <>
          <Text style={styles.sectionTitle}>Your Shared Links</Text>
          <Text style={styles.sectionSub}>
            Turn off a link to stop anyone opening it. Copies friends already saved aren't affected.
          </Text>
          {shares === null && !sharesFailed ? (
            <ActivityIndicator color={Colors.primary} style={styles.loading} />
          ) : sharesFailed ? (
            <Text style={styles.empty}>Couldn't load your links. Check your connection.</Text>
          ) : shares && shares.length === 0 ? (
            <Text style={styles.empty}>Links you share while signed in show up here.</Text>
          ) : (
            shares?.map((share) => (
              <View key={share.code} style={styles.settingRow}>
                <View style={styles.settingText}>
                  <Text style={styles.settingLabel} numberOfLines={1}>
                    {share.workoutName ?? 'Workout'}
                  </Text>
                  <Text style={styles.settingHint}>
                    {[
                      share.kind ? KIND_LABELS[share.kind] : null,
                      new Date(share.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                      shareStats(share),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                {share.revokedAt ? (
                  <Text style={styles.revoked}>Off</Text>
                ) : revoking === share.code ? (
                  <ActivityIndicator color={Colors.textSecondary} />
                ) : (
                  <TouchableOpacity
                    onPress={() => confirmRevoke(share)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Turn off link to ${share.workoutName ?? 'workout'}`}
                  >
                    <Text style={styles.revokeText}>Turn Off</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </>
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
  loading: {
    marginTop: Spacing.md,
  },
  empty: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
  },
  revokeText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.danger,
  },
  revoked: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textMuted,
  },
});
