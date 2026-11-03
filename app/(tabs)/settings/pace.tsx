/**
 * Pace tracking settings — GPS pace, cue frequency, window size.
 * Units (miles / kilometers) live on the settings hub.
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  AppSettings,
  DEFAULT_SETTINGS,
} from '../../../src/workout/workoutTypes';
import type {
  PaceCueFrequency,
  PaceWindowSize,
} from '../../../src/pace/paceTypes';
import { loadSettings, saveSettings } from '../../../src/workout/workoutStorage';
import {
  Colors,
  Spacing,
  FontSize,
  BorderRadius,
} from '../../../src/constants/theme';
import { hapticTap } from '../../../src/audio/haptics';
import { paceCuesEnabled } from '../../../src/audio/cueSchedule';
import { CueBasisToggle, CueDistanceChips } from '../../../src/components/CueScheduleControls';

const CUE_FREQUENCY_OPTIONS: { value: PaceCueFrequency; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 45, label: '45s' },
  { value: 60, label: '1 min' },
  { value: 90, label: '1:30' },
  { value: 120, label: '2 min' },
];

const WINDOW_OPTIONS: { value: PaceWindowSize; label: string; desc: string }[] = [
  { value: 10, label: '10s', desc: 'Responsive but noisy — best for track sprints' },
  { value: 30, label: '30s', desc: 'Balanced — good for most runs' },
  { value: 60, label: '60s', desc: 'Smooth and stable — best for tempo & long runs' },
];

export default function PaceSettingsScreen() {
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
      {/* Enable/Disable */}
      <View style={styles.settingRow}>
        <View style={{ flex: 1, marginRight: Spacing.md }}>
          <Text style={styles.settingLabel}>GPS Pace Tracking</Text>
          <Text style={styles.settingHint}>
            Track your running pace using GPS during workouts
          </Text>
        </View>
        <Switch
          value={settings.paceTrackingEnabled}
          onValueChange={(v) => {
            hapticTap();
            update({ paceTrackingEnabled: v });
          }}
          trackColor={{ false: Colors.surfaceLight, true: Colors.primaryDim }}
          thumbColor={Colors.white}
        />
      </View>

      {settings.paceTrackingEnabled && (
        <>
          {/* Cue Frequency */}
          <Text style={styles.sectionTitle}>Pace Cue Frequency</Text>
          <Text style={styles.sectionSub}>
            {settings.paceCueBasis === 'distance'
              ? 'Announce your pace each time you cover this distance'
              : 'How often to announce your current pace during each interval'}
          </Text>
          <CueBasisToggle
            value={settings.paceCueBasis}
            onChange={(paceCueBasis) => update({ paceCueBasis })}
          />
          {settings.paceCueBasis === 'time' ? (
            <View style={styles.row}>
              {CUE_FREQUENCY_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.chip,
                    settings.paceCueFrequency === opt.value && styles.chipActive,
                  ]}
                  onPress={() => {
                    hapticTap();
                    update({ paceCueFrequency: opt.value });
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipLabel,
                      settings.paceCueFrequency === opt.value &&
                        styles.chipLabelActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <CueDistanceChips
              value={settings.paceCueDistance}
              unit={settings.paceUnit}
              onChange={(paceCueDistance) => update({ paceCueDistance })}
            />
          )}

          {/* Only cue on intervals with target pace */}
          {paceCuesEnabled(settings) && (
            <View style={[styles.settingRow, { marginTop: Spacing.md }]}>
              <View style={{ flex: 1, marginRight: Spacing.md }}>
                <Text style={styles.settingLabel}>Only With Target Pace</Text>
                <Text style={styles.settingHint}>
                  Only announce pace cues on intervals that have a target pace set
                </Text>
              </View>
              <Switch
                value={settings.paceCueOnlyWithTarget}
                onValueChange={(v) => {
                  hapticTap();
                  update({ paceCueOnlyWithTarget: v });
                }}
                trackColor={{ false: Colors.surfaceLight, true: Colors.primaryDim }}
                thumbColor={Colors.white}
              />
            </View>
          )}

          {/* Pace Window */}
          <Text style={styles.sectionTitle}>Pace Window</Text>
          <Text style={styles.sectionSub}>
            Time window used to calculate your rolling pace
          </Text>
          {WINDOW_OPTIONS.map((opt) => {
            const isActive = settings.paceWindow === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.windowOption,
                  isActive && styles.windowOptionActive,
                ]}
                onPress={() => {
                  hapticTap();
                  update({ paceWindow: opt.value });
                }}
                activeOpacity={0.7}
              >
                <View style={styles.windowOptionHeader}>
                  <View
                    style={[
                      styles.windowRadio,
                      isActive && styles.windowRadioActive,
                    ]}
                  >
                    {isActive && <View style={styles.windowRadioDot} />}
                  </View>
                  <Text
                    style={[
                      styles.windowLabel,
                      isActive && styles.windowLabelActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </View>
                <Text style={styles.windowDesc}>{opt.desc}</Text>
              </TouchableOpacity>
            );
          })}

          {/* Info */}
          <View style={styles.infoBox}>
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={Colors.accent}
            />
            <Text style={styles.infoText}>
              Pace tracking uses GPS and will increase battery usage. Set a
              target pace per interval in the workout editor for smart
              comparisons.
            </Text>
          </View>
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
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
    gap: Spacing.xs,
  },
  chipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '18',
  },
  chipLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  chipLabelActive: { color: Colors.primary },
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
    fontWeight: '600',
  },
  settingHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  windowOption: {
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
  },
  windowOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '12',
  },
  windowOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 4,
  },
  windowRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  windowRadioActive: {
    borderColor: Colors.primary,
  },
  windowRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  windowLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  windowLabelActive: { color: Colors.primary },
  windowDesc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginLeft: 28,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.accent + '12',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.accent + '33',
  },
  infoText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});
