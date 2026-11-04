/**
 * Audio & Cues settings — audio mode, voice selection, countdown warning,
 * interval progress announcements, and music ducking.
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
import { loadSettings, saveSettings } from '../../../src/workout/workoutStorage';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../../../src/constants/theme';
import { hapticTap } from '../../../src/audio/haptics';
import { CueBasisToggle, CueDistanceChips } from '../../../src/components/CueScheduleControls';
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
import { PREMIUM_VOICES } from '../../../src/audio/voiceCatalog';
import VoicePickerSheet from '../../../src/components/VoicePickerSheet';

const AUDIO_MODES: {
  value: AudioCueMode;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { value: 'beeps', label: 'Beeps', icon: 'notifications-outline' },
  { value: 'voice', label: 'Voice', icon: 'volume-high-outline' },
  { value: 'both', label: 'Both', icon: 'volume-medium-outline' },
  { value: 'silent', label: 'Silent', icon: 'volume-mute-outline' },
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Audio Mode */}
      <Text style={styles.sectionTitle}>Audio Cues</Text>
      <View style={styles.row}>
        {AUDIO_MODES.map((mode) => (
          <TouchableOpacity
            key={mode.value}
            style={[
              styles.chip,
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

      {/* Duck other audio */}
      {settings.audioCueMode !== 'silent' && (
        <View style={styles.settingRow}>
          <View style={{ flex: 1, marginRight: Spacing.md }}>
            <Text style={styles.settingLabel}>Lower music during cues</Text>
            <Text style={styles.settingHint}>
              Automatically dips Spotify and other audio so cues stand out
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
      )}

      {/* Voice Selection */}
      {(settings.audioCueMode === 'voice' || settings.audioCueMode === 'both') && (
        <>
          <Text style={styles.sectionTitle}>Voice</Text>
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
                {premiumActive ? 'AI coaching voice · Works offline' : 'Device voice'}
              </Text>
            </View>
            {voicesLoading ? (
              <ActivityIndicator color={Colors.textSecondary} size="small" />
            ) : (
              <Text style={styles.chevron} maxFontSizeMultiplier={MaxFontScale.display}>›</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.downloadVoicesRow}
            onPress={() => {
              hapticTap();
              speakCuePhrases([paceCue(7 + 39 / 60, settings.paceUnit)], 'voice');
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="play-circle-outline" size={18} color={Colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.downloadVoicesLabel}>Preview pace announcement</Text>
            </View>
          </TouchableOpacity>

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

          {Platform.OS === 'ios' && !premiumActive && (
            <TouchableOpacity
              style={styles.downloadVoicesRow}
              onPress={() => {
                Linking.openURL('App-prefs:').catch(() =>
                  Linking.openURL('app-settings:').catch(() => {}),
                );
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="download-outline" size={18} color={Colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.downloadVoicesLabel}>
                  Download Enhanced Device Voices — Free
                </Text>
                <Text style={styles.downloadVoicesSub}>
                  Apple includes high-quality voices at no cost — we recommend Zoe.
                  Opens Settings › Accessibility › Read & Speak › Voices › English
                </Text>
              </View>
              <Text style={styles.chevron} maxFontSizeMultiplier={MaxFontScale.display}>›</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Countdown warning */}
      <Text style={styles.sectionTitle}>Countdown Warnings</Text>
      <Text style={styles.sectionSub}>
        Play warning cues before an interval ends — tap to toggle each
      </Text>
      <View style={styles.row}>
        {WARNING_OPTIONS.map((sec) => {
          const isSelected = settings.countdownWarningSeconds.includes(sec);
          return (
            <TouchableOpacity
              key={sec}
              style={[
                styles.chip,
                isSelected && styles.chipActive,
              ]}
              onPress={() => {
                hapticTap();
                let next: number[];
                if (isSelected) {
                  next = settings.countdownWarningSeconds.filter((s) => s !== sec);
                } else {
                  next = [...settings.countdownWarningSeconds, sec].sort((a, b) => a - b);
                }
                // Keep at least one selected
                if (next.length === 0) return;
                update({ countdownWarningSeconds: next });
              }}
              activeOpacity={0.7}
            >
              {isSelected && (
                <Ionicons name="checkmark" size={14} color={Colors.primary} />
              )}
              <Text
                style={[
                  styles.chipLabel,
                  isSelected && styles.chipLabelActive,
                ]}
              >
                {sec}s
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Interval progress announcements */}
      <Text style={styles.sectionTitle}>Interval Progress</Text>
      <Text style={styles.sectionSub}>
        {settings.progressCueBasis === 'distance'
          ? 'Announce each time you cover this distance in the interval. GPS starts automatically.'
          : 'Announce elapsed time during each interval (requires Voice or Both audio mode)'}
      </Text>
      <CueBasisToggle
        value={settings.progressCueBasis}
        onChange={(progressCueBasis) => update({ progressCueBasis })}
      />
      {settings.progressCueBasis === 'time' ? (
        <View style={styles.row}>
          {TIME_REMAINING_OPTIONS.map((opt) => (
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
      ) : (
        <CueDistanceChips
          value={settings.progressCueDistance}
          unit={settings.paceUnit}
          onChange={(progressCueDistance) => update({ progressCueDistance })}
        />
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
  },
  settingLabel: { fontSize: FontSize.md, color: Colors.textPrimary, flex: 1, marginRight: Spacing.md },
  settingHint: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  voiceSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.primary + '44',
  },
  voiceSelectorName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.primary },
  voiceSelectorSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 24, fontWeight: '300', color: Colors.textMuted, marginLeft: Spacing.sm },
  downloadVoicesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
    gap: Spacing.sm,
  },
  downloadVoicesLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  downloadVoicesSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
});
