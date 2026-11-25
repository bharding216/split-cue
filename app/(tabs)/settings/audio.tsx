/**
 * Audio & Cues settings — progressive disclosure keeps the page light.
 * Only shows controls that are actually configurable for the current mode.
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Speech from 'expo-speech';
import {
  AppSettings,
  AudioCueMode,
  TimeRemainingInterval,
  DEFAULT_SETTINGS,
} from '../../../src/workout/workoutTypes';
import type {
  PaceCueFrequency,
  CueDistancePreset,
  HrAnnouncementFrequency,
  HrAnnouncementFormat,
} from '../../../src/pace/paceTypes';
import { loadSettings, saveSettings } from '../../../src/workout/workoutStorage';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../../../src/constants/theme';
import { hapticTap } from '../../../src/audio/haptics';
import {
  CueBasisToggle,
  CueDistanceChips,
  PROGRESS_CUE_BASES,
  AUTO_TIME_STEP_LABEL,
  AUTO_DISTANCE_STEP_LABEL,
} from '../../../src/components/CueScheduleControls';
import {
  configureAudio,
  getAvailableVoices,
  setVoiceIdentifier,
  setPremiumVoice,
  setDuckingEnabled,
  speak,
  speakCuePhrases,
} from '../../../src/audio/audioManager';
import { paceCue, VOICE_PREVIEW_TEXT } from '../../../src/audio/cuePhrases';
import { cueDistanceLabel, paceCuesEnabled } from '../../../src/audio/cueSchedule';
import { PREMIUM_VOICES } from '../../../src/audio/voiceCatalog';
import VoicePickerSheet from '../../../src/components/VoicePickerSheet';
import CollapsibleSection from '../../../src/components/CollapsibleSection';

/* ── Constants ── */

const AUDIO_MODES: {
  value: AudioCueMode;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  description: string;
}[] = [
  {
    value: 'beeps',
    label: 'Beeps',
    icon: 'notifications-outline',
    description: 'Short tones mark interval changes — no spoken announcements.',
  },
  {
    value: 'voice',
    label: 'Voice',
    icon: 'volume-high-outline',
    description: 'Speaks your pace, elapsed time, and interval changes aloud.',
  },
  {
    value: 'both',
    label: 'Both',
    icon: 'volume-medium-outline',
    description: 'Beeps on interval changes plus spoken pace, time, and progress cues.',
  },
  {
    value: 'silent',
    label: 'Silent',
    icon: 'volume-mute-outline',
    description: 'No audio — rely on screen and haptics only.',
  },
];

const WARNING_OPTIONS = [3, 5, 10, 15, 30];

const TIME_REMAINING_OPTIONS: { value: TimeRemainingInterval; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 45, label: '45s' },
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
];

const CUE_FREQUENCY_OPTIONS: { value: PaceCueFrequency; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 45, label: '45s' },
  { value: 60, label: '1 min' },
  { value: 90, label: '1:30' },
  { value: 120, label: '2 min' },
];

const DISTANCE_CALLOUT_STEPS: CueDistancePreset[] = ['quarter', 'half', 'full'];

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

/* ── Helpers ── */

function formatVoiceName(voice: Speech.Voice): string {
  let name = voice.name;
  if (name.startsWith('en-') && name.includes('#')) {
    name = name.split('#').pop() ?? name;
  }
  const quality =
    voice.quality === Speech.VoiceQuality.Enhanced ? ' (Enhanced)' : '';
  if (name.includes('Enhanced') || name.includes('Premium')) return name;
  return `${name}${quality}`;
}

function countdownSummary(seconds: number[]): string {
  return seconds.map((s) => `${s}s`).join(', ');
}

function isProgressEnabled(settings: AppSettings): boolean {
  if (settings.progressCueBasis === 'time') return settings.timeRemainingInterval !== 0;
  if (settings.progressCueBasis === 'distance') return settings.progressCueDistance !== 'off';
  return settings.timeRemainingInterval !== 0 || settings.progressCueDistance !== 'off';
}

function progressSummary(settings: AppSettings): string {
  if (!isProgressEnabled(settings)) return 'Off';
  return settings.progressCueBasis === 'auto'
    ? 'Match interval'
    : settings.progressCueBasis === 'time'
      ? 'By time'
      : 'By distance';
}

function voiceSummaryText(
  settings: AppSettings,
  voices: Speech.Voice[],
  premiumActive: boolean,
): string {
  if (premiumActive) {
    const pv = PREMIUM_VOICES.find((v) => v.id === settings.premiumVoiceId) ?? PREMIUM_VOICES[0];
    return pv.name;
  }
  if (settings.voiceIdentifier === null) return 'System Default';
  const v = voices.find((v) => v.identifier === settings.voiceIdentifier);
  return v ? formatVoiceName(v) : 'Device voice';
}

function paceAnnouncementSummary(settings: AppSettings): string {
  const basis =
    settings.paceCueBasis === 'auto'
      ? 'Match interval'
      : settings.paceCueBasis === 'time'
        ? 'By time'
        : 'By distance';
  if (settings.paceCueBasis !== 'distance') {
    const freq = CUE_FREQUENCY_OPTIONS.find((o) => o.value === settings.paceCueFrequency);
    if (freq && freq.value > 0) return `${basis} \u00b7 ${freq.label}`;
    if (freq?.value === 0) return `${basis} \u00b7 Off`;
  }
  return basis;
}

function hrAnnouncementSummary(settings: AppSettings): string {
  const freq = HR_FREQ_OPTIONS.find((o) => o.value === settings.hrAnnouncementFrequency);
  const style = settings.hrAnnouncementFormat === 'short' ? 'Short' : 'Full';
  return freq ? `Every ${freq.label} · ${style}` : 'On';
}

/* ── Component ── */

export default function AudioSettingsScreen() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [voices, setVoices] = useState<Speech.Voice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicePickerVisible, setVoicePickerVisible] = useState(false);
  const premiumActive = settings.voiceEngine === 'premium';
  const premiumVoice =
    PREMIUM_VOICES.find((v) => v.id === settings.premiumVoiceId) ?? PREMIUM_VOICES[0];

  useFocusEffect(
    useCallback(() => {
      loadSettings().then((s) => {
        setSettings(s);
        configureAudio();
        setDuckingEnabled(s.duckOtherAudio);
        setPremiumVoice(s.voiceEngine === 'premium' ? s.premiumVoiceId : null);
      });
      setVoicesLoading(true);
      getAvailableVoices('en').then((v) => {
        setVoices(v);
        setVoicesLoading(false);
      });
    }, []),
  );

  const update = async (partial: Partial<AppSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    await saveSettings(next);
    if ('duckOtherAudio' in partial) {
      setDuckingEnabled(next.duckOtherAudio);
    }
  };

  const selectPremiumVoice = () => {
    setPremiumVoice(settings.premiumVoiceId);
    update({ voiceEngine: 'premium' });
    speak(VOICE_PREVIEW_TEXT);
  };

  const usesVoice =
    settings.audioCueMode === 'voice' || settings.audioCueMode === 'both';
  const isSilent = settings.audioCueMode === 'silent';

  const canConfigurePace = settings.paceMode === 'announce';
  const canConfigureDistance = settings.paceMode !== 'off';
  const canConfigureHr = settings.hrMode === 'announce';
  const hasAnyAnnouncement = canConfigurePace || canConfigureDistance || canConfigureHr;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ── Mode selector ── */}
      <View style={styles.modeGrid}>
        {AUDIO_MODES.map((mode) => (
          <TouchableOpacity
            key={mode.value}
            style={[
              styles.modeChip,
              settings.audioCueMode === mode.value && styles.chipActive,
            ]}
            onPress={() => {
              hapticTap();
              update({ audioCueMode: mode.value });
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={mode.icon}
              size={16}
              color={
                settings.audioCueMode === mode.value
                  ? Colors.primary
                  : Colors.textSecondary
              }
            />
            <Text
              style={[
                styles.chipLabel,
                settings.audioCueMode === mode.value && styles.chipLabelActive,
              ]}
            >
              {mode.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.modeDescription}>
        {AUDIO_MODES.find((m) => m.value === settings.audioCueMode)?.description}
      </Text>

      {/* ── Playback options (non-silent) ── */}
      {!isSilent && (
        <>
          <View style={styles.settingRow}>
            <View style={{ flex: 1, marginRight: Spacing.md }}>
              <Text style={styles.settingLabel}>Lower music during cues</Text>
              <Text style={styles.settingHint}>
                Dips Spotify / other audio so cues stand out
              </Text>
            </View>
            <Switch
              value={settings.duckOtherAudio}
              onValueChange={(v) => {
                hapticTap();
                update({ duckOtherAudio: v });
              }}
              trackColor={{ false: Colors.surfaceLight, true: Colors.primaryDim }}
              thumbColor={Colors.white}
              accessibilityLabel="Lower music during cues"
            />
          </View>

          {/* Voice — collapsible (voice/both only) */}
          {usesVoice && (
            <CollapsibleSection
              title="Voice"
              icon="mic-outline"
              summary={voiceSummaryText(settings, voices, premiumActive)}
            >
              <TouchableOpacity
                style={styles.voiceSelector}
                onPress={() => {
                  hapticTap();
                  setVoicePickerVisible(true);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityHint="Choose a voice"
              >
                <Ionicons
                  name={premiumActive ? 'sparkles' : 'phone-portrait-outline'}
                  size={20}
                  color={Colors.primary}
                  style={{ marginRight: Spacing.sm }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.voiceSelectorName}>
                    {premiumActive
                      ? premiumVoice.name
                      : settings.voiceIdentifier === null
                        ? 'System Default'
                        : (() => {
                            const v = voices.find((v) => v.identifier === settings.voiceIdentifier);
                            return v ? formatVoiceName(v) : 'Device voice';
                          })()}
                  </Text>
                  <Text style={styles.voiceSelectorSub}>
                    {premiumActive ? 'AI coaching voice \u00b7 Works offline' : 'Device voice'}
                  </Text>
                </View>
                {voicesLoading ? (
                  <ActivityIndicator color={Colors.textSecondary} size="small" />
                ) : (
                  <Text style={styles.chevron} maxFontSizeMultiplier={MaxFontScale.display}>{'\u203a'}</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryRow}
                onPress={() => {
                  hapticTap();
                  speakCuePhrases([paceCue(7 + 39 / 60, settings.paceUnit)], 'voice');
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="play-circle-outline" size={18} color={Colors.textSecondary} />
                <Text style={styles.secondaryRowLabel}>Preview Voice</Text>
              </TouchableOpacity>

              {Platform.OS === 'ios' && !premiumActive && (
                <TouchableOpacity
                  style={styles.secondaryRow}
                  onPress={() => {
                    Linking.openURL('App-prefs:').catch(() =>
                      Linking.openURL('app-settings:').catch(() => {}),
                    );
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="download-outline" size={18} color={Colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.secondaryRowLabel}>
                      Download Enhanced Voices — Free
                    </Text>
                    <Text style={styles.secondaryRowSub}>
                      Settings › Accessibility › Voices › English
                    </Text>
                  </View>
                  <Text style={styles.chevron} maxFontSizeMultiplier={MaxFontScale.display}>{'\u203a'}</Text>
                </TouchableOpacity>
              )}

              <VoicePickerSheet
                visible={voicePickerVisible}
                voices={voices}
                selectedId={premiumActive ? undefined : settings.voiceIdentifier}
                premiumOption={{
                  label: premiumVoice.name,
                  selected: premiumActive,
                  onSelect: selectPremiumVoice,
                }}
                onSelect={(id) => {
                  setVoiceIdentifier(id);
                  setPremiumVoice(null);
                  update({ voiceIdentifier: id, voiceEngine: 'device' });
                }}
                onPreview={(id) => {
                  setVoiceIdentifier(id);
                  speak(VOICE_PREVIEW_TEXT);
                }}
                onClose={() => setVoicePickerVisible(false)}
              />
            </CollapsibleSection>
          )}

          {/* ── Interval cues divider ── */}
          <View style={styles.divider} />
          <Text style={styles.groupLabel}>Interval Cues</Text>

          <CollapsibleSection
            title="Countdown Warnings"
            icon="timer-outline"
            summary={countdownSummary(settings.countdownWarningSeconds)}
          >
            <Text style={styles.sectionSub}>
              Play warning cues before an interval ends
            </Text>
            <View style={styles.row}>
              {WARNING_OPTIONS.map((sec) => {
                const isSelected = settings.countdownWarningSeconds.includes(sec);
                return (
                  <TouchableOpacity
                    key={sec}
                    style={[styles.chip, isSelected && styles.chipActive]}
                    onPress={() => {
                      hapticTap();
                      let next: number[];
                      if (isSelected) {
                        next = settings.countdownWarningSeconds.filter((s) => s !== sec);
                      } else {
                        next = [...settings.countdownWarningSeconds, sec].sort((a, b) => a - b);
                      }
                      if (next.length === 0) return;
                      update({ countdownWarningSeconds: next });
                    }}
                    activeOpacity={0.7}
                  >
                    {isSelected && (
                      <Ionicons name="checkmark" size={14} color={Colors.primary} />
                    )}
                    <Text
                      style={[styles.chipLabel, isSelected && styles.chipLabelActive]}
                    >
                      {sec}s
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </CollapsibleSection>

          <CollapsibleSection
            title="Interval Progress"
            icon="analytics-outline"
            summary={progressSummary(settings)}
          >
            <View style={[styles.nestedToggle, { marginTop: 0 }]}>
              <View style={{ flex: 1, marginRight: Spacing.md }}>
                <Text style={styles.nestedToggleLabel}>Enable</Text>
                <Text style={styles.nestedToggleHint}>
                  Hear time or distance updates during each interval
                </Text>
              </View>
              <Switch
                value={isProgressEnabled(settings)}
                onValueChange={(on) => {
                  hapticTap();
                  if (on) {
                    update({ timeRemainingInterval: 60, progressCueDistance: 'full' });
                  } else {
                    update({ timeRemainingInterval: 0, progressCueDistance: 'off' });
                  }
                }}
                trackColor={{ false: Colors.surfaceLight, true: Colors.primaryDim }}
                thumbColor={Colors.white}
                accessibilityLabel="Enable interval progress announcements"
              />
            </View>

            {isProgressEnabled(settings) && (
              <>
                <View style={{ marginTop: Spacing.md }}>
                  <CueBasisToggle
                    value={settings.progressCueBasis}
                    options={PROGRESS_CUE_BASES}
                    onChange={(progressCueBasis) => update({ progressCueBasis })}
                  />
                </View>
                {settings.progressCueBasis === 'auto' && (
                  <Text style={styles.stepLabel}>{AUTO_TIME_STEP_LABEL}</Text>
                )}
                {settings.progressCueBasis !== 'distance' && (
                  <View style={styles.row}>
                    {TIME_REMAINING_OPTIONS.filter((o) => o.value !== 0).map((opt) => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.chip,
                          settings.timeRemainingInterval === opt.value && styles.chipActive,
                        ]}
                        onPress={() => {
                          hapticTap();
                          update({ timeRemainingInterval: opt.value });
                        }}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.chipLabel,
                            settings.timeRemainingInterval === opt.value &&
                              styles.chipLabelActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {settings.progressCueBasis === 'auto' && (
                  <Text style={styles.stepLabel}>{AUTO_DISTANCE_STEP_LABEL}</Text>
                )}
                {settings.progressCueBasis !== 'time' && (
                  <CueDistanceChips
                    value={settings.progressCueDistance}
                    unit={settings.paceUnit}
                    onChange={(progressCueDistance) => update({ progressCueDistance })}
                  />
                )}
                <Text style={styles.previewText}>
                  {settings.progressCueBasis === 'distance'
                    ? settings.paceUnit === 'minPerMile'
                      ? '\u{1F50A} "Half mile passed"'
                      : '\u{1F50A} "500 meters passed"'
                    : '\u{1F50A} "2 minutes passed"'}
                </Text>
              </>
            )}
          </CollapsibleSection>

          {/* ── Workout announcements (voice/both only, and only when there's something to configure) ── */}
          {usesVoice && (
            <>
              <View style={styles.divider} />
              <Text style={styles.groupLabel}>Workout Announcements</Text>

              {!hasAnyAnnouncement && (
                <Text style={styles.emptyHint}>
                  Enable GPS announcing or heart rate announcing in their settings pages to configure what you hear during runs.
                </Text>
              )}

              {/* Pace Announcements — only when GPS announce is on */}
              {canConfigurePace && (
                <CollapsibleSection
                  title="Pace Announcements"
                  icon="megaphone-outline"
                  summary={paceAnnouncementSummary(settings)}
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
                  <Text style={styles.previewText}>
                    {settings.paceUnit === 'minPerMile'
                      ? '\u{1F50A} "Current pace 7 minutes 39 seconds per mile"'
                      : '\u{1F50A} "Current pace 4 minutes 45 seconds per kilometer"'}
                  </Text>
                </CollapsibleSection>
              )}

              {/* Total Distance Announcements — only when GPS is on */}
              {canConfigureDistance && (
                <CollapsibleSection
                  title="Total Distance Announcements"
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
                  <Text style={styles.previewText}>
                    {settings.paceUnit === 'minPerMile'
                      ? '\u{1F50A} "1 mile passed"'
                      : '\u{1F50A} "1 kilometer passed"'}
                  </Text>
                </CollapsibleSection>
              )}

              {/* Heart Rate Announcements — only when HR announce is on */}
              {canConfigureHr && (
                <CollapsibleSection
                  title="Heart Rate Announcements"
                  icon="heart-outline"
                  summary={hrAnnouncementSummary(settings)}
                >
                  <Text style={styles.sectionSub}>
                    How often to announce your current heart rate during a run.
                  </Text>
                  <View style={styles.row}>
                    {HR_FREQ_OPTIONS.map((opt) => {
                      const isActive = settings.hrAnnouncementFrequency === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[styles.chip, isActive && styles.chipActive]}
                          onPress={() => {
                            hapticTap();
                            update({ hrAnnouncementFrequency: opt.value });
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={[styles.stepLabel, { marginTop: Spacing.sm }]}>Announcement style</Text>
                  <View style={styles.row}>
                    {HR_FORMAT_OPTIONS.map((opt) => {
                      const isActive = settings.hrAnnouncementFormat === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[styles.chip, isActive && styles.chipActive]}
                          onPress={() => {
                            hapticTap();
                            update({ hrAnnouncementFormat: opt.value });
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={styles.previewText}>
                    {settings.hrAnnouncementFormat === 'short'
                      ? '\u{1F50A} "Heart rate: 142"'
                      : '\u{1F50A} "Heart rate: 142 beats per minute"'}
                  </Text>
                </CollapsibleSection>
              )}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  modeDescription: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surfaceLight,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  groupLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  sectionSub: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  emptyHint: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    lineHeight: 20,
  },
  stepLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: Spacing.md,
  },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '48%',
    flexGrow: 1,
    backgroundColor: Colors.background,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
    gap: Spacing.xs,
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
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '18' },
  chipLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  chipLabelActive: { color: Colors.primary },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
  },
  settingLabel: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: '600' },
  settingHint: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
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
  voiceSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.primary + '44',
  },
  voiceSelectorName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.primary },
  voiceSelectorSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 24, fontWeight: '300', color: Colors.textMuted, marginLeft: Spacing.sm },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
    gap: Spacing.sm,
  },
  secondaryRowLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  secondaryRowSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  previewText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
});
