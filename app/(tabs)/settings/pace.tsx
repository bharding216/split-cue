/**
 * Pace tracking settings — simplified with collapsible sections.
 * GPS toggle is always visible; cue frequency, target filtering,
 * and pace window collapse with summaries.
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
  DataMode,
  CueDistancePreset,
} from '../../../src/pace/paceTypes';
import { cueDistanceLabel } from '../../../src/audio/cueSchedule';
import { loadSettings, saveSettings } from '../../../src/workout/workoutStorage';
import {
  Colors,
  Spacing,
  FontSize,
  BorderRadius,
} from '../../../src/constants/theme';
import { hapticTap } from '../../../src/audio/haptics';
import { paceCuesEnabled } from '../../../src/audio/cueSchedule';
import {
  CueBasisToggle,
  CueDistanceChips,
  PROGRESS_CUE_BASES,
  AUTO_TIME_STEP_LABEL,
  AUTO_DISTANCE_STEP_LABEL,
} from '../../../src/components/CueScheduleControls';
import CollapsibleSection from '../../../src/components/CollapsibleSection';

const DATA_MODE_OPTIONS: { value: DataMode; label: string; desc: string }[] = [
  { value: 'off', label: 'Off', desc: 'No GPS tracking' },
  { value: 'record', label: 'Record Only', desc: 'Track pace for post-run analysis' },
  { value: 'announce', label: 'Record + Announce', desc: 'Track pace and hear updates during your run' },
];

const DISTANCE_CALLOUT_STEPS: CueDistancePreset[] = ['quarter', 'half', 'full'];

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
  { value: 10, label: '10s', desc: 'Responsive — best for track sprints' },
  { value: 30, label: '30s', desc: 'Balanced — good for most runs' },
  { value: 60, label: '60s', desc: 'Smooth — best for tempo & long runs' },
];

function cueFrequencySummary(settings: AppSettings): string {
  const basis =
    settings.paceCueBasis === 'auto'
      ? 'Match interval'
      : settings.paceCueBasis === 'time'
        ? 'By time'
        : 'By distance';

  if (settings.paceCueBasis !== 'distance') {
    const freq = CUE_FREQUENCY_OPTIONS.find((o) => o.value === settings.paceCueFrequency);
    if (freq && freq.value > 0) return `${basis} · ${freq.label}`;
    if (freq?.value === 0) return `${basis} · Off`;
  }
  return basis;
}

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
            style={[styles.windowOption, isActive && styles.windowOptionActive, { marginTop: Spacing.xs }]}
            onPress={() => {
              hapticTap();
              update({ paceMode: opt.value, paceTrackingEnabled: opt.value !== 'off' });
            }}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ checked: isActive }}
          >
            <View style={styles.windowOptionHeader}>
              <View style={[styles.windowRadio, isActive && styles.windowRadioActive]}>
                {isActive && <View style={styles.windowRadioDot} />}
              </View>
              <Text style={[styles.windowLabel, isActive && styles.windowLabelActive]}>{opt.label}</Text>
            </View>
            <Text style={styles.windowDesc}>{opt.desc}</Text>
          </TouchableOpacity>
        );
      })}

      {settings.paceMode === 'announce' && (
        <>
          {/* Pace Cue Frequency — collapsible */}
          <CollapsibleSection
            title="Pace Cue Frequency"
            icon="megaphone-outline"
            summary={cueFrequencySummary(settings)}
          >
            <Text style={styles.sectionSub}>
              {settings.paceCueBasis === 'auto'
                ? 'Announces pace by time in timed intervals, by distance in distance intervals.'
                : settings.paceCueBasis === 'distance'
                  ? 'Announce your pace each time you cover this distance.'
                  : 'How often to announce your current pace.'}
            </Text>
            <CueBasisToggle
              value={settings.paceCueBasis}
              options={PROGRESS_CUE_BASES}
              onChange={(paceCueBasis) => update({ paceCueBasis })}
            />
            {settings.paceCueBasis === 'auto' && (
              <Text style={styles.stepLabel}>{AUTO_TIME_STEP_LABEL}</Text>
            )}
            {settings.paceCueBasis !== 'distance' && (
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
            )}
            {settings.paceCueBasis === 'auto' && (
              <Text style={styles.stepLabel}>{AUTO_DISTANCE_STEP_LABEL}</Text>
            )}
            {settings.paceCueBasis !== 'time' && (
              <CueDistanceChips
                value={settings.paceCueDistance}
                unit={settings.paceUnit}
                onChange={(paceCueDistance) => update({ paceCueDistance })}
              />
            )}

            {/* Only With Target Pace — nested inside cue frequency */}
            {paceCuesEnabled(settings) && (
              <View style={styles.nestedToggle}>
                <View style={{ flex: 1, marginRight: Spacing.md }}>
                  <Text style={styles.nestedToggleLabel}>Only With Target Pace</Text>
                  <Text style={styles.nestedToggleHint}>
                    Skip pace cues on intervals without a target
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
                  accessibilityLabel="Only With Target Pace"
                />
              </View>
            )}
          </CollapsibleSection>

          {/* Pace Window — collapsible */}
          <CollapsibleSection
            title="Pace Window"
            icon="options-outline"
            summary={windowSummary(settings)}
          >
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
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isActive }}
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
          </CollapsibleSection>

          {/* Info — always visible */}
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

      {/* Distance Callouts — available when GPS is on (record or announce) */}
      {settings.paceMode !== 'off' && (
        <CollapsibleSection
          title="Distance Callouts"
          icon="navigate-outline"
          summary={settings.distanceCalloutEnabled ? cueDistanceLabel(settings.distanceCalloutStep, settings.paceUnit) : 'Off'}
        >
          <Text style={styles.sectionSub}>
            Hear your total distance called out at regular intervals during the run.
          </Text>
          <View style={[styles.nestedToggle, { marginTop: 0 }]}>
            <View style={{ flex: 1, marginRight: Spacing.md }}>
              <Text style={styles.nestedToggleLabel}>Enable Callouts</Text>
            </View>
            <Switch
              value={settings.distanceCalloutEnabled}
              onValueChange={(v) => {
                hapticTap();
                update({ distanceCalloutEnabled: v });
              }}
              trackColor={{ false: Colors.surfaceLight, true: Colors.primaryDim }}
              thumbColor={Colors.white}
            />
          </View>
          {settings.distanceCalloutEnabled && (
            <View style={[styles.row, { marginTop: Spacing.sm }]}>
              {DISTANCE_CALLOUT_STEPS.map((preset) => {
                const isActive = settings.distanceCalloutStep === preset;
                return (
                  <TouchableOpacity
                    key={preset}
                    style={[styles.chip, isActive && styles.chipActive]}
                    onPress={() => {
                      hapticTap();
                      update({ distanceCalloutStep: preset });
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
                      {cueDistanceLabel(preset, settings.paceUnit)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
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
  toggleCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
  },
  toggleLabel: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  toggleHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  sectionSub: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  stepLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: Spacing.md,
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
    backgroundColor: Colors.background,
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
  nestedToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
  },
  nestedToggleLabel: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  nestedToggleHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  windowOption: {
    backgroundColor: Colors.background,
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
    flexShrink: 1,
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
