/**
 * VoiceInput — Reusable voice recording component.
 *
 * Tap microphone button to start recording, tap again to stop and transcribe.
 * Shows animated sound bars driven by real-time audio metering.
 *
 * Wrapped in an error boundary so a missing native recording module
 * doesn't crash the parent screen.
 */

import React, { useState, useCallback, useRef, useEffect, Component, type ReactNode } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useAudioRecorder,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorderState,
} from 'expo-audio';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { transcribeAudio } from '../ai/transcriptionService';

interface Props {
  onTranscription: (text: string) => void;
  onRecordingStart?: () => void;
  onRecordingEnd?: () => void;
  placeholder?: string;
  compact?: boolean;
}

// ── Sound Bars (metering-driven) ───────────────────────────

const BAR_COUNT = 5;
const BAR_COUNT_FULL = 12;

/**
 * Converts a metering dB value (typically -160 to 0) to a 0–1 scale.
 * -50 dB and below = silence, 0 dB = max.
 */
function meterToLevel(db: number | undefined): number {
  if (db === undefined || db <= -50) return 0;
  if (db >= 0) return 1;
  return (db + 50) / 50;
}

function SoundBars({ metering, isActive = false, count = BAR_COUNT, barWidth = 3, barGap = 2, maxHeight = 18 }: {
  metering?: number;
  /** If true and metering is unavailable, animate bars independently. */
  isActive?: boolean;
  count?: number;
  barWidth?: number;
  barGap?: number;
  maxHeight?: number;
}) {
  const anims = useRef(
    Array.from({ length: count }, () => new Animated.Value(0.15)),
  ).current;
  const hasMetering = metering !== undefined && metering > -160;
  const level = meterToLevel(metering);

  // When we have real metering data, drive bars from it
  useEffect(() => {
    if (!hasMetering) return;
    anims.forEach((anim, i) => {
      const offset = Math.sin(Date.now() / 200 + i * 1.8) * 0.15;
      const target = Math.max(0.1, Math.min(1, level + offset));
      Animated.timing(anim, {
        toValue: target,
        duration: 100,
        useNativeDriver: false,
      }).start();
    });
  }, [level, hasMetering, anims]);

  // Fallback: when recording is active but no metering, animate independently
  useEffect(() => {
    if (hasMetering || !isActive) return;

    const timers = anims.map((anim, i) => {
      const animate = (): void => {
        const duration = 180 + Math.random() * 280;
        const target = 0.2 + Math.random() * 0.8;
        Animated.timing(anim, {
          toValue: target,
          duration,
          useNativeDriver: false,
        }).start(() => {
          if (isActive) animate();
        });
      };
      const timer = setTimeout(() => animate(), i * 60);
      return timer;
    });

    return () => {
      timers.forEach(clearTimeout);
      anims.forEach((a) => a.stopAnimation());
      anims.forEach((a) => a.setValue(0.15));
    };
  }, [isActive, hasMetering, anims]);

  return (
    <View style={[soundStyles.container, { gap: barGap }]}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            soundStyles.bar,
            {
              width: barWidth,
              height: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [barWidth, maxHeight],
              }),
              backgroundColor: Colors.accent,
              opacity: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.4, 1],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
}

const soundStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 20,
  },
  bar: {
    borderRadius: 2,
  },
});

// ── Error Boundary ─────────────────────────────────────────

class VoiceInputErrorBoundary extends Component<
  { compact?: boolean; children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { compact?: boolean; children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn('VoiceInput unavailable:', error.message);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.compact) {
        return (
          <TouchableOpacity
            style={styles.compactBtn}
            onPress={() =>
              Alert.alert(
                'Voice Not Available',
                'Voice input requires a development build with microphone access. Please type your message instead.',
              )
            }
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Voice input unavailable"
          >
            <Ionicons name="mic-off" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        );
      }
      return null;
    }

    return this.props.children;
  }
}

// ── Inner component (uses hooks) ───────────────────────────

function VoiceInputInner({
  onTranscription,
  onRecordingStart,
  onRecordingEnd,
  placeholder = 'Tap to speak',
  compact = false,
}: Props) {
  const [status, setStatus] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  // Poll at 100ms for responsive metering
  const recorderState = useAudioRecorderState(recorder, 100);

  useEffect(() => {
    (async () => {
      try {
        const result = await AudioModule.requestRecordingPermissionsAsync();
        setHasPermission(result.granted);
      } catch {
        setHasPermission(false);
      }
    })();
  }, []);

  const startRecording = useCallback(async () => {
    if (hasPermission === false) {
      Alert.alert(
        'Microphone Access',
        'SplitCue needs microphone access for voice input. Enable it in Settings.',
      );
      return;
    }

    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
      setStatus('recording');
      onRecordingStart?.();
    } catch (err) {
      console.error('Failed to start recording:', err);
      Alert.alert('Recording Error', 'Could not start recording. Please try again.');
    }
  }, [hasPermission, recorder, onRecordingStart]);

  const stopRecording = useCallback(async () => {
    if (status !== 'recording') return;

    try {
      await recorder.stop();
      onRecordingEnd?.();
      setStatus('transcribing');

      const uri = recorder.uri;
      if (!uri) {
        setStatus('idle');
        return;
      }

      const result = await transcribeAudio(uri, 'audio/m4a');

      if (result.text.trim()) {
        onTranscription(result.text.trim());
      }

      setStatus('idle');
    } catch (err) {
      console.error('Transcription failed:', err);
      setStatus('idle');
      Alert.alert(
        'Transcription Error',
        'Could not transcribe your voice. Please try again or type instead.',
      );
    }
  }, [status, recorder, onTranscription, onRecordingEnd]);

  const handlePress = useCallback(() => {
    if (status === 'recording') {
      stopRecording();
    } else if (status === 'idle') {
      startRecording();
    }
  }, [status, startRecording, stopRecording]);

  // Current metering level from the recorder
  const metering = status === 'recording' ? recorderState.metering : undefined;

  if (compact) {
    return (
      <TouchableOpacity
        style={[
          styles.compactBtn,
          status === 'recording' && styles.compactBtnActive,
        ]}
        onPress={handlePress}
        disabled={status === 'transcribing'}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={
          status === 'transcribing' ? 'Transcribing' : status === 'recording' ? 'Stop recording' : 'Start voice input'
        }
        accessibilityState={{ disabled: status === 'transcribing' }}
      >
        {status === 'transcribing' ? (
          <Ionicons name="ellipsis-horizontal" size={20} color={Colors.textSecondary} />
        ) : status === 'recording' ? (
          <View style={styles.compactRecording}>
            <SoundBars metering={metering} isActive count={3} barWidth={2.5} barGap={1.5} maxHeight={14} />
            <Ionicons name="stop" size={10} color={Colors.danger} />
          </View>
        ) : (
          <Ionicons name="mic" size={20} color={Colors.accent} />
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.recordBtn, status === 'recording' && styles.recordBtnActive]}
        onPress={handlePress}
        disabled={status === 'transcribing'}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={status === 'recording' ? 'Stop recording' : undefined}
        accessibilityState={{ disabled: status === 'transcribing' }}
      >
        {status === 'transcribing' ? (
          <>
            <Ionicons name="ellipsis-horizontal" size={24} color={Colors.textSecondary} />
            <Text style={styles.statusText}>Transcribing…</Text>
          </>
        ) : status === 'recording' ? (
          <>
            <SoundBars metering={metering} isActive count={BAR_COUNT_FULL} barWidth={3} barGap={2} maxHeight={22} />
            <Ionicons name="stop-circle" size={20} color={Colors.danger} />
          </>
        ) : (
          <>
            <Ionicons name="mic" size={32} color={Colors.accent} />
            <Text style={styles.statusText}>{placeholder}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ── Public export (wrapped in error boundary) ──────────────

export function VoiceInput(props: Props) {
  return (
    <VoiceInputErrorBoundary compact={props.compact}>
      <VoiceInputInner {...props} />
    </VoiceInputErrorBoundary>
  );
}

// ── Styles ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    minWidth: 200,
    maxWidth: '100%',
  },
  recordBtnActive: {
    borderColor: Colors.danger + '50',
    backgroundColor: Colors.danger + '10',
  },
  statusText: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  recordingText: {
    color: Colors.danger,
    fontWeight: '600',
  },
  compactBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactBtnActive: {
    borderColor: Colors.danger + '50',
    backgroundColor: Colors.danger + '10',
    borderWidth: 1,
    borderRadius: BorderRadius.full,
  },
  compactRecording: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
});
