/**
 * PreRunSettings — compact settings summary shown before starting a workout.
 * Displays current GPS, audio cue, and pace announcement settings with
 * quick toggles, expandable into a full settings sheet.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { AppSettings, AudioCueMode } from '../workout/workoutTypes';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { hapticTap } from '../audio/haptics';
import { cueDistanceLabel } from '../audio/cueSchedule';

interface PreRunSettingsProps {
  settings: AppSettings;
  onUpdate: (partial: Partial<AppSettings>) => void;
  hasDistanceFeature: boolean;
}

const AUDIO_MODES: { value: AudioCueMode; label: string }[] = [
  { value: 'voice', label: 'Voice' },
  { value: 'beeps', label: 'Beeps' },
  { value: 'both', label: 'Voice + Beeps' },
  { value: 'silent', label: 'Silent' },
];

export function PreRunSettings({ settings, onUpdate, hasDistanceFeature }: PreRunSettingsProps) {
  const [expanded, setExpanded] = useState(false);

  const audioCueLabel =
    AUDIO_MODES.find((m) => m.value === settings.audioCueMode)?.label ?? 'Silent';

  // Build a compact cue-schedule label for the summary chip.
  const cueLabel = (() => {
    if (settings.audioCueMode === 'silent') return null;
    const v = settings.timeRemainingInterval;
    const timeLabel = v === 0 ? null : v >= 60 ? `${v / 60} min` : `${v}s`;
    const distanceLabel =
      settings.progressCueDistance === 'off'
        ? null
        : cueDistanceLabel(settings.progressCueDistance, settings.paceUnit);
    if (settings.progressCueBasis === 'distance') return distanceLabel;
    if (settings.progressCueBasis === 'time') return timeLabel;
    if (timeLabel && distanceLabel) return `${timeLabel} / ${distanceLabel}`;
    return timeLabel ?? distanceLabel;
  })();

  return (
    <View style={styles.container}>
      {/* Summary row */}
      <TouchableOpacity
        style={styles.summaryRow}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <View style={styles.summaryMain}>
          <Text style={styles.summaryTitle}>Run Settings</Text>
          <View style={[styles.chip, settings.paceTrackingEnabled && styles.chipActive]}>
            <Ionicons
              name="navigate"
              size={12}
              color={settings.paceTrackingEnabled ? Colors.primary : Colors.textMuted}
            />
            <Text style={[styles.chipText, settings.paceTrackingEnabled && styles.chipTextActive]}>
              GPS {settings.paceTrackingEnabled ? 'On' : 'Off'}
            </Text>
          </View>
          <View style={[styles.chip, settings.audioCueMode !== 'silent' && styles.chipActive]}>
            <Ionicons
              name={settings.audioCueMode === 'silent' ? 'volume-mute' : 'volume-high'}
              size={12}
              color={settings.audioCueMode !== 'silent' ? Colors.primary : Colors.textMuted}
            />
            <Text style={[styles.chipText, settings.audioCueMode !== 'silent' && styles.chipTextActive]}>
              {audioCueLabel}
            </Text>
          </View>
          {cueLabel && (
            <View style={[styles.chip, styles.chipActive]}>
              <Ionicons
                name={settings.progressCueBasis === 'distance' ? 'map-outline' : 'time-outline'}
                size={12}
                color={Colors.primary}
              />
              <Text style={[styles.chipText, styles.chipTextActive]}>
                {cueLabel}
              </Text>
            </View>
          )}
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={Colors.textMuted}
        />
      </TouchableOpacity>

      {/* Expanded settings */}
      {expanded && (
        <View style={styles.expandedContent}>
          {/* GPS tracking */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="navigate" size={18} color={Colors.textSecondary} />
              <Text style={styles.settingLabel}>GPS Pace Tracking</Text>
            </View>
            <Switch
              value={settings.paceTrackingEnabled}
              onValueChange={(v) => {
                hapticTap();
                onUpdate({ paceTrackingEnabled: v });
              }}
              trackColor={{ false: Colors.surfaceLight, true: Colors.primaryDim }}
              thumbColor={Colors.white}
            />
          </View>

          {/* Audio cues */}
          <View style={styles.audioSettingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="volume-high" size={18} color={Colors.textSecondary} />
              <Text style={styles.settingLabel}>Audio Cues</Text>
            </View>
            <View style={styles.audioModeRow}>
              {AUDIO_MODES.map(({ value, label }) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.audioChip, settings.audioCueMode === value && styles.audioChipActive]}
                  onPress={() => {
                    hapticTap();
                    onUpdate({ audioCueMode: value });
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.audioChipText, settings.audioCueMode === value && styles.audioChipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Pace announcements (when GPS is on) */}
          {settings.paceTrackingEnabled && (
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Ionicons name="megaphone-outline" size={18} color={Colors.textSecondary} />
                <Text style={styles.settingLabel}>Pace Announcements</Text>
              </View>
              <Switch
                value={settings.paceCueEnabled !== false}
                onValueChange={(v) => {
                  hapticTap();
                  onUpdate({ paceCueEnabled: v });
                }}
                trackColor={{ false: Colors.surfaceLight, true: Colors.primaryDim }}
                thumbColor={Colors.white}
              />
            </View>
          )}

          {hasDistanceFeature && !settings.paceTrackingEnabled && (
            <View style={styles.hintRow}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.accent} />
              <Text style={styles.hintText}>
                This workout has distance intervals. GPS will auto-enable when you start.
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    overflow: 'hidden',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  summaryMain: {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.sm,
    rowGap: Spacing.xs,
  },
  summaryTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginRight: 'auto',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  chipActive: {},
  chipText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  chipTextActive: {
    color: Colors.primary,
  },
  expandedContent: {
    padding: Spacing.md,
    paddingTop: 0,
    gap: Spacing.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  settingInfo: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginRight: Spacing.sm,
  },
  settingLabel: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  audioSettingRow: {
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  audioModeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  audioChip: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceLight,
  },
  audioChipActive: {
    backgroundColor: Colors.primary + '20',
  },
  audioChipText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  audioChipTextActive: {
    color: Colors.primary,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  hintText: {
    fontSize: FontSize.xs,
    color: Colors.accent,
    flex: 1,
  },
});
