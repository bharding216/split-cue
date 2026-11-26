/**
 * PreRunSettings — compact settings summary shown before starting a workout.
 * Displays current GPS, audio cue, and pace announcement settings with
 * quick toggles, expandable into a full settings sheet.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DEFAULT_SETTINGS, type AppSettings, type AudioCueMode } from '../workout/workoutTypes';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { hapticTap } from '../audio/haptics';
import { CUE_DISTANCE_PRESETS, cueDistanceLabel, paceCuesEnabled } from '../audio/cueSchedule';
import type { DataMode, HrAnnouncementFrequency, HrAnnouncementFormat, ProgressCueBasis } from '../pace/paceTypes';
import {
  CueBasisToggle,
  CueDistanceChips,
  PACE_CUE_FREQUENCY_OPTIONS,
  PROGRESS_TIME_OPTIONS,
  TimeStepChips,
} from './CueScheduleControls';

const HR_FREQ_OPTIONS: { value: HrAnnouncementFrequency; label: string }[] = [
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
  { value: 300, label: '5 min' },
];

const HR_FORMAT_OPTIONS: { value: HrAnnouncementFormat; label: string }[] = [
  { value: 'long', label: 'Full' },
  { value: 'short', label: 'Short' },
];

const PACE_BASIS_OPTIONS: readonly ProgressCueBasis[] = ['time', 'distance'];
/** The switch turns pace cues off, so the step chips leave out 'Off'. */
const PACE_FREQUENCY_STEPS = PACE_CUE_FREQUENCY_OPTIONS.filter((o) => o.value !== 0);
const PACE_DISTANCE_STEPS = CUE_DISTANCE_PRESETS.filter((p) => p !== 'off');

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
    if (settings.audioCueMode !== 'voice' && settings.audioCueMode !== 'both') return null;
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

  const speaksProgress = settings.audioCueMode === 'voice' || settings.audioCueMode === 'both';
  const progressScheduleLabel = (() => {
    const v = settings.timeRemainingInterval;
    const timeLabel = v === 0 ? 'off' : v >= 60 ? `every ${v / 60} min` : `every ${v}s`;
    const distanceLabel =
      settings.progressCueDistance === 'off'
        ? 'off'
        : `every ${cueDistanceLabel(settings.progressCueDistance, settings.paceUnit)}`;
    if (settings.progressCueBasis === 'distance') return `Distance covered, ${distanceLabel}`;
    if (settings.progressCueBasis === 'time') return `Elapsed time, ${timeLabel}`;
    return `Timed & Free Runs: ${timeLabel} · distance intervals: ${distanceLabel}`;
  })();

  const paceCuesOn = paceCuesEnabled(settings);
  const paceScheduleLabel = (() => {
    const v = settings.paceCueFrequency;
    const timeLabel = v === 0 ? null : v >= 60 ? `every ${v / 60} min` : `every ${v}s`;
    const distanceLabel =
      settings.paceCueDistance === 'off'
        ? null
        : `every ${cueDistanceLabel(settings.paceCueDistance, settings.paceUnit)}`;
    if (settings.paceCueBasis === 'distance') return distanceLabel ?? 'off';
    if (settings.paceCueBasis === 'time') return timeLabel ?? 'off';
    return `Timed & Free Runs: ${timeLabel ?? 'off'} · distance intervals: ${distanceLabel ?? 'off'}`;
  })();

  const paceChipLabel = (() => {
    if (settings.audioCueMode === 'silent' || settings.paceMode !== 'announce' || !paceCuesOn) {
      return null;
    }
    const v = settings.paceCueFrequency;
    const timeLabel = v === 0 ? null : v >= 60 ? `${v / 60} min` : `${v}s`;
    const distanceLabel =
      settings.paceCueDistance === 'off'
        ? null
        : cueDistanceLabel(settings.paceCueDistance, settings.paceUnit);
    const step =
      settings.paceCueBasis === 'distance'
        ? distanceLabel
        : settings.paceCueBasis === 'time'
          ? timeLabel
          : [timeLabel, distanceLabel].filter(Boolean).join(' / ');
    return step ? `Pace ${step}` : null;
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
        <View style={styles.summaryHeader}>
          <Text style={styles.summaryTitle}>Run Settings</Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={Colors.textMuted}
          />
        </View>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryItem}>
            <Ionicons
              name="navigate"
              size={14}
              color={settings.paceMode !== 'off' ? Colors.primary : Colors.textMuted}
            />
            <Text style={[styles.summaryItemText, settings.paceMode !== 'off' && styles.summaryItemTextActive]}>
              GPS {settings.paceMode === 'off' ? 'Off' : settings.paceMode === 'record' ? 'Record' : 'On'}
            </Text>
          </View>
          {settings.hrMode !== 'off' && (
            <View style={styles.summaryItem}>
              <Ionicons name="heart" size={14} color={Colors.danger} />
              <Text style={[styles.summaryItemText, styles.summaryItemTextActive]}>
                HR {settings.hrMode === 'record'
                  ? 'Record'
                  : `Announce ${HR_FREQ_OPTIONS.find((o) => o.value === settings.hrAnnouncementFrequency)?.label ?? ''}`}
              </Text>
            </View>
          )}
          {settings.distanceCalloutEnabled && settings.paceMode !== 'off' && (
            <View style={styles.summaryItem}>
              <Ionicons name="navigate-outline" size={14} color={Colors.primary} />
              <Text style={[styles.summaryItemText, styles.summaryItemTextActive]}>
                Total Distance Announcements
              </Text>
            </View>
          )}
          <View style={styles.summaryItem}>
            <Ionicons
              name={settings.audioCueMode === 'silent' ? 'volume-mute' : 'volume-high'}
              size={14}
              color={settings.audioCueMode !== 'silent' ? Colors.primary : Colors.textMuted}
            />
            <Text style={[styles.summaryItemText, settings.audioCueMode !== 'silent' && styles.summaryItemTextActive]}>
              {audioCueLabel}
            </Text>
          </View>
          {cueLabel && (
            <View style={styles.summaryItem}>
              <Ionicons
                name={settings.progressCueBasis === 'distance' ? 'map-outline' : 'time-outline'}
                size={14}
                color={Colors.primary}
              />
              <Text style={[styles.summaryItemText, styles.summaryItemTextActive]}>
                Progress {cueLabel}
              </Text>
            </View>
          )}
          {paceChipLabel && (
            <View style={styles.summaryItem}>
              <Ionicons name="speedometer-outline" size={14} color={Colors.primary} />
              <Text style={[styles.summaryItemText, styles.summaryItemTextActive]}>{paceChipLabel}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Expanded settings */}
      {expanded && (
        <View style={styles.expandedContent}>
          {/* GPS tracking — 3-way mode */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="navigate" size={18} color={Colors.textSecondary} />
              <Text style={styles.settingLabel}>GPS Pace Tracking</Text>
            </View>
          </View>
          <View style={styles.audioModeRow}>
            {(['off', 'record', 'announce'] as DataMode[]).map((mode) => {
              const isActive = settings.paceMode === mode;
              const label = mode === 'off' ? 'Off' : mode === 'record' ? 'Record' : 'Announce';
              return (
                <TouchableOpacity
                  key={mode}
                  style={[styles.audioChip, isActive && styles.audioChipActive]}
                  onPress={() => {
                    hapticTap();
                    onUpdate({ paceMode: mode, paceTrackingEnabled: mode !== 'off' });
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.audioChipText, isActive && styles.audioChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Heart rate mode — 3-way toggle */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="heart" size={18} color={Colors.textSecondary} />
              <Text style={styles.settingLabel}>Heart Rate</Text>
            </View>
          </View>
          <View style={styles.audioModeRow}>
            {(['off', 'record', 'announce'] as DataMode[]).map((mode) => {
              const isActive = settings.hrMode === mode;
              const label = mode === 'off' ? 'Off' : mode === 'record' ? 'Record' : 'Announce';
              return (
                <TouchableOpacity
                  key={mode}
                  style={[styles.audioChip, isActive && styles.audioChipActive]}
                  onPress={() => {
                    hapticTap();
                    onUpdate({ hrMode: mode });
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.audioChipText, isActive && styles.audioChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {settings.hrMode === 'announce' && (
            <View style={styles.hrAnnounceControls}>
              <Text style={styles.hrControlLabel}>Announce every</Text>
              <View style={styles.audioModeRow}>
                {HR_FREQ_OPTIONS.map((opt) => {
                  const isActive = settings.hrAnnouncementFrequency === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.audioChip, isActive && styles.audioChipActive]}
                      onPress={() => {
                        hapticTap();
                        onUpdate({ hrAnnouncementFrequency: opt.value });
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.audioChipText, isActive && styles.audioChipTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.hrControlLabel}>Style</Text>
              <View style={styles.audioModeRow}>
                {HR_FORMAT_OPTIONS.map((opt) => {
                  const isActive = settings.hrAnnouncementFormat === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.audioChip, isActive && styles.audioChipActive]}
                      onPress={() => {
                        hapticTap();
                        onUpdate({ hrAnnouncementFormat: opt.value });
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.audioChipText, isActive && styles.audioChipTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.hrPreviewText}>
                {settings.hrAnnouncementFormat === 'short'
                  ? '🔊 "Heart rate: 142"'
                  : '🔊 "Heart rate: 142 beats per minute"'}
              </Text>
            </View>
          )}

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

          {/* Interval progress (spoken, so only with voice) */}
          {speaksProgress && (
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Ionicons name="time-outline" size={18} color={Colors.textSecondary} />
                <View style={styles.settingText}>
                  <Text style={styles.settingLabel}>Interval Progress Announcements</Text>
                  <Text style={styles.settingHint}>{progressScheduleLabel}</Text>
                </View>
              </View>
            </View>
          )}
          {speaksProgress && (
            <View style={styles.paceScheduleControls}>
              <CueBasisToggle<ProgressCueBasis>
                value={settings.progressCueBasis}
                options={PACE_BASIS_OPTIONS}
                onChange={(progressCueBasis) => onUpdate({ progressCueBasis })}
              />
              {settings.progressCueBasis === 'time' && (
                <TimeStepChips
                  value={settings.timeRemainingInterval}
                  options={PROGRESS_TIME_OPTIONS}
                  onChange={(timeRemainingInterval) => onUpdate({ timeRemainingInterval })}
                />
              )}
              {settings.progressCueBasis === 'distance' && (
                <CueDistanceChips
                  value={settings.progressCueDistance}
                  unit={settings.paceUnit}
                  onChange={(progressCueDistance) => onUpdate({ progressCueDistance })}
                />
              )}
            </View>
          )}

          {/* Pace announcements (when GPS announces) */}
          {settings.paceMode === 'announce' && (
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Ionicons name="megaphone-outline" size={18} color={Colors.textSecondary} />
                <View style={styles.settingText}>
                  <Text style={styles.settingLabel}>Pace Announcements</Text>
                  {paceCuesOn && settings.paceCueBasis === 'auto' && (
                    <Text style={styles.settingHint}>{paceScheduleLabel}</Text>
                  )}
                </View>
              </View>
              <Switch
                value={paceCuesOn}
                onValueChange={(v) => {
                  hapticTap();
                  onUpdate(
                    v
                      ? {
                          paceCueFrequency:
                            settings.paceCueFrequency || DEFAULT_SETTINGS.paceCueFrequency,
                          paceCueDistance:
                            settings.paceCueDistance === 'off'
                              ? DEFAULT_SETTINGS.paceCueDistance
                              : settings.paceCueDistance,
                        }
                      : { paceCueFrequency: 0, paceCueDistance: 'off' },
                  );
                }}
                trackColor={{ false: Colors.surfaceLight, true: Colors.primaryDim }}
                thumbColor={Colors.white}
              />
            </View>
          )}

          {settings.paceMode === 'announce' && paceCuesOn && (
            <View style={styles.paceScheduleControls}>
              <CueBasisToggle<ProgressCueBasis>
                value={settings.paceCueBasis}
                options={PACE_BASIS_OPTIONS}
                onChange={(paceCueBasis) =>
                  onUpdate(
                    paceCueBasis === 'time'
                      ? {
                          paceCueBasis,
                          paceCueFrequency:
                            settings.paceCueFrequency || DEFAULT_SETTINGS.paceCueFrequency,
                        }
                      : {
                          paceCueBasis,
                          paceCueDistance:
                            settings.paceCueDistance === 'off'
                              ? DEFAULT_SETTINGS.paceCueDistance
                              : settings.paceCueDistance,
                        },
                  )
                }
              />
              {settings.paceCueBasis === 'time' && (
                <TimeStepChips
                  value={settings.paceCueFrequency}
                  options={PACE_FREQUENCY_STEPS}
                  onChange={(paceCueFrequency) => onUpdate({ paceCueFrequency })}
                />
              )}
              {settings.paceCueBasis === 'distance' && (
                <CueDistanceChips
                  value={settings.paceCueDistance}
                  unit={settings.paceUnit}
                  presets={PACE_DISTANCE_STEPS}
                  onChange={(paceCueDistance) => onUpdate({ paceCueDistance })}
                />
              )}
            </View>
          )}

          {hasDistanceFeature && settings.paceMode === 'off' && (
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
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  summaryItemText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  summaryItemTextActive: {
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
  paceScheduleControls: {
    marginTop: -Spacing.sm,
    paddingLeft: 18 + Spacing.sm,
  },
  settingText: {
    flexShrink: 1,
  },
  settingHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
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
  hrAnnounceControls: {
    paddingLeft: 18 + Spacing.sm,
    gap: Spacing.sm,
  },
  hrControlLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  hrPreviewText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
    lineHeight: 18,
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
