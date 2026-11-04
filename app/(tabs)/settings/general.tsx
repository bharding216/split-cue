/**
 * General settings — haptic feedback, display preferences, and backup/restore.
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
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppSettings, DEFAULT_SETTINGS } from '../../../src/workout/workoutTypes';
import { loadSettings, saveSettings } from '../../../src/workout/workoutStorage';
import { Colors, Spacing, FontSize, BorderRadius } from '../../../src/constants/theme';
import { hapticTap } from '../../../src/audio/haptics';
import { exportData, importData } from '../../../src/workout/backupManager';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushToggleState,
} from '../../../src/notifications/pushRegistration';

export default function GeneralSettingsScreen() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
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
      loadSettings().then(setSettings);
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

  const update = async (partial: Partial<AppSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    await saveSettings(next);
  };

  const handleExport = async () => {
    hapticTap();
    setExporting(true);
    try {
      await exportData();
    } catch (e: any) {
      Alert.alert('Export Failed', e.message ?? 'Something went wrong.');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    hapticTap();
    setImporting(true);
    try {
      const result = await importData();
      if (result) {
        Alert.alert(
          'Import Complete',
          `Restored ${result.workoutsCount} workout${result.workoutsCount !== 1 ? 's' : ''} and ${result.historyCount} history entr${result.historyCount !== 1 ? 'ies' : 'y'}.`,
        );
      }
    } catch (e: any) {
      Alert.alert('Import Failed', e.message ?? 'Could not read backup file.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Haptic */}
      <Text style={styles.sectionTitle}>Haptic Feedback</Text>
      <View style={styles.settingRow}>
        <Text style={styles.settingLabel}>Vibrate on interval changes</Text>
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

      {/* Keep screen on */}
      <Text style={styles.sectionTitle}>Display</Text>
      <View style={styles.settingRow}>
        <Text style={styles.settingLabel}>Keep screen on during workout</Text>
        <Switch
          value={settings.keepScreenOn}
          onValueChange={(v) => update({ keepScreenOn: v })}
          trackColor={{ false: Colors.surfaceLight, true: Colors.primaryDim }}
          thumbColor={Colors.white}
          accessibilityLabel="Keep screen on during workout"
        />
      </View>

      {/* Feature notifications */}
      <Text style={styles.sectionTitle}>Notifications</Text>
      <Text style={styles.sectionSub}>
        Get a notification when we ship something new.
      </Text>
      <View style={styles.settingRow}>
        <Text style={styles.settingLabel}>New feature updates</Text>
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

      {/* Backup & Restore */}
      <Text style={styles.sectionTitle}>Backup & Restore</Text>
      <Text style={styles.sectionSub}>
        Export your workouts, history, and settings to a file so you can restore
        them later.
      </Text>

      <TouchableOpacity
        style={styles.actionBtn}
        onPress={handleExport}
        disabled={exporting}
        activeOpacity={0.7}
      >
        {exporting ? (
          <ActivityIndicator color={Colors.primary} size="small" />
        ) : (
          <Ionicons name="cloud-upload-outline" size={20} color={Colors.textPrimary} />
        )}
        <Text style={styles.actionBtnLabel}>Export Backup</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionBtn, { marginTop: Spacing.sm }]}
        onPress={handleImport}
        disabled={importing}
        activeOpacity={0.7}
      >
        {importing ? (
          <ActivityIndicator color={Colors.accent} size="small" />
        ) : (
          <Ionicons name="cloud-download-outline" size={20} color={Colors.textPrimary} />
        )}
        <Text style={styles.actionBtnLabel}>Import Backup</Text>
      </TouchableOpacity>
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
  settingLabel: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    flex: 1,
    marginRight: Spacing.md,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
  },
  actionBtnLabel: {
    flexShrink: 1,
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
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
