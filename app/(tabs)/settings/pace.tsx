/**
 * Pace & Distance settings — GPS mode and pace smoothing.
 * Announcement controls have moved to Audio & Cues.
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  AppSettings,
  DEFAULT_SETTINGS,
} from '../../../src/workout/workoutTypes';
import type { PaceWindowSize, DataMode, PaceCueFrequency } from '../../../src/pace/paceTypes';
import { loadSettings, saveSettings } from '../../../src/workout/workoutStorage';
import {
  Colors,
  Spacing,
  FontSize,
  BorderRadius,
} from '../../../src/constants/theme';
import { hapticTap } from '../../../src/audio/haptics';
import CollapsibleSection from '../../../src/components/CollapsibleSection';

const DATA_MODE_OPTIONS: { value: DataMode; label: string; desc: string }[] = [
  { value: 'off', label: 'Off', desc: 'No GPS tracking' },
  { value: 'record', label: 'Record Only', desc: 'Track pace for post-run analysis' },
  { value: 'announce', label: 'Record + Announce', desc: 'Track pace and hear updates during your run' },
];

const PACE_FREQ_OPTIONS: { value: PaceCueFrequency; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
];

const WINDOW_OPTIONS: { value: PaceWindowSize; label: string; desc: string }[] = [
  { value: 10, label: '10s', desc: 'Responsive — best for track sprints' },
  { value: 30, label: '30s', desc: 'Balanced — good for most runs' },
  { value: 60, label: '60s', desc: 'Smooth — best for tempo & long runs' },
];

function windowSummary(settings: AppSettings): string {
  const opt = WINDOW_OPTIONS.find((o) => o.value === settings.paceWindow);
  return opt ? `${opt.label} — ${opt.desc.split('—')[0].trim()}` : `${settings.paceWindow}s`;
}

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
      {/* GPS Pace Tracking — 3-way mode */}
      <Text style={styles.sectionTitle}>GPS Pace Tracking</Text>
      {DATA_MODE_OPTIONS.map((opt) => {
        const isActive = settings.paceMode === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.radioOption, isActive && styles.radioOptionActive, { marginTop: Spacing.xs }]}
            onPress={() => {
              hapticTap();
              update({ paceMode: opt.value, paceTrackingEnabled: opt.value !== 'off' });
            }}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ checked: isActive }}
          >
            <View style={styles.radioHeader}>
              <View style={[styles.radio, isActive && styles.radioActive]}>
                {isActive && <View style={styles.radioDot} />}
              </View>
              <Text style={[styles.radioLabel, isActive && styles.radioLabelActive]}>{opt.label}</Text>
            </View>
            <Text style={styles.radioDesc}>{opt.desc}</Text>
          </TouchableOpacity>
        );
      })}

      {/* Pace announcement frequency — inline when announce mode is on */}
      {settings.paceMode === 'announce' && (
        <View style={styles.freqSection}>
          <Text style={styles.freqLabel}>Announce pace every</Text>
          <View style={styles.freqRow}>
            {PACE_FREQ_OPTIONS.map((opt) => {
              const isActive = settings.paceCueFrequency === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.freqChip, isActive && styles.freqChipActive]}
                  onPress={() => {
                    hapticTap();
                    update({ paceCueFrequency: opt.value });
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.freqChipText, isActive && styles.freqChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.previewText}>
            {settings.paceUnit === 'minPerMile'
              ? '\u{1F50A} "Current pace 7 minutes 39 seconds per mile"'
              : '\u{1F50A} "Current pace 4 minutes 45 seconds per kilometer"'}
          </Text>
        </View>
      )}

      {/* Pace Smoothing — collapsible, visible when GPS is on */}
      {settings.paceMode !== 'off' && (
        <CollapsibleSection
          title="Pace Smoothing"
          icon="options-outline"
          summary={windowSummary(settings)}
        >
          <Text style={styles.sectionSub}>
            Controls how quickly your displayed pace responds to changes in running speed
          </Text>
          {WINDOW_OPTIONS.map((opt) => {
            const isActive = settings.paceWindow === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.radioOption,
                  isActive && styles.radioOptionActive,
                ]}
                onPress={() => {
                  hapticTap();
                  update({ paceWindow: opt.value });
                }}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityState={{ checked: isActive }}
              >
                <View style={styles.radioHeader}>
                  <View
                    style={[
                      styles.radio,
                      isActive && styles.radioActive,
                    ]}
                  >
                    {isActive && <View style={styles.radioDot} />}
                  </View>
                  <Text
                    style={[
                      styles.radioLabel,
                      isActive && styles.radioLabelActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </View>
                <Text style={styles.radioDesc}>{opt.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </CollapsibleSection>
      )}

      {settings.paceMode === 'off' && (
        <View style={[styles.infoBox, { marginTop: Spacing.md }]}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.accent} />
          <Text style={styles.infoText}>
            GPS is off. Turn on recording or announcing to track pace and distance.
          </Text>
        </View>
      )}

      {/* Battery info — small, at the bottom */}
      {settings.paceMode !== 'off' && (
        <Text style={styles.batteryHint}>
          Pace tracking uses GPS and will increase battery usage.
        </Text>
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
    marginBottom: Spacing.xs,
  },
  sectionSub: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  radioOption: {
    backgroundColor: Colors.background,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
  },
  radioOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '12',
  },
  radioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 4,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioActive: {
    borderColor: Colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  radioLabel: {
    flexShrink: 1,
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  radioLabelActive: { color: Colors.primary },
  freqSection: {
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  freqLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  freqRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  freqChip: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
    backgroundColor: Colors.background,
  },
  freqChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '18',
  },
  freqChipText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  freqChipTextActive: { color: Colors.primary },
  previewText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
  radioDesc: {
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
  batteryHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.lg,
    lineHeight: 18,
  },
});
