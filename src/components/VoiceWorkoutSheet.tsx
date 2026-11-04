/**
 * VoiceWorkoutSheet — bottom-sheet modal for voice-driven workout generation.
 *
 * Flow:
 *   1. User taps the mic → records voice describing their desired workout
 *   2. Recording is transcribed via Whisper
 *   3. Transcription is sent to the generate-workout edge function
 *   4. Proposed workout is shown with Accept / Edit actions
 *   5. User can apply directly or open WorkoutEditorForm to tweak first
 */

import React, { Component, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  ScrollView,
  Alert,
  Animated,
  TextInput,
  Keyboard,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  useAudioRecorder,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorderState,
} from 'expo-audio';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale, intervalColor } from '../constants/theme';
import { useLargeText } from '../hooks/useLargeText';
import { transcribeAudio } from '../ai/transcriptionService';
import {
  generateWorkout,
  AIContext,
  ChatMessage,
} from '../ai/aiWorkoutService';
import {
  WorkoutDefinition,
  WorkoutBlock,
  Segment,
  RepeatGroup,
  flattenWorkout,
  formatTime,
  totalWorkoutSeconds,
  defaultSegmentLabel,
  segmentToIntervalType,
} from '../workout/workoutTypes';
import { WorkoutEditorForm } from './WorkoutEditorForm';
import { hapticTap } from '../audio/haptics';

// ── Types ────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  date: string;
  aiContext: AIContext | null;
  onAccept: (workout: WorkoutDefinition) => void;
  onClose: () => void;
}

type Phase =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'generating'
  | 'review'
  | 'editing';

// ── Sound Bars ───────────────────────────────────────────────

const BAR_COUNT = 7;

function meterToLevel(db: number | undefined): number {
  if (db === undefined || db <= -50) return 0;
  if (db >= 0) return 1;
  return (db + 50) / 50;
}

function SoundBars({ metering, isActive }: { metering?: number; isActive: boolean }) {
  const anims = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.15)),
  ).current;
  const hasMetering = metering !== undefined && metering > -160;
  const level = meterToLevel(metering);

  useEffect(() => {
    if (!hasMetering) return;
    anims.forEach((anim, i) => {
      const offset = Math.sin(Date.now() / 200 + i * 1.5) * 0.18;
      const target = Math.max(0.1, Math.min(1, level + offset));
      Animated.timing(anim, {
        toValue: target,
        duration: 100,
        useNativeDriver: false,
      }).start();
    });
  }, [level, hasMetering, anims]);

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
      return setTimeout(() => animate(), i * 60);
    });
    return () => {
      timers.forEach(clearTimeout);
      anims.forEach((a) => a.stopAnimation());
      anims.forEach((a) => a.setValue(0.15));
    };
  }, [isActive, hasMetering, anims]);

  return (
    <View style={barStyles.container}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            barStyles.bar,
            {
              height: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [4, 28],
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

const barStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    gap: 3,
  },
  bar: {
    width: 4,
    borderRadius: 2,
  },
});

// ── Workout Preview Card ─────────────────────────────────────

function BlocksPreview({ blocks }: { blocks: WorkoutBlock[] }) {
  const large = useLargeText();
  if (blocks.length === 0) return null;

  return (
    <View style={prevStyles.section}>
      {blocks.map((block, bi) => {
        if (block.blockType === 'segment') {
          const seg = block;
          const dur = seg.target.type === 'time' ? (seg.target.durationSeconds ?? 0) : 0;
          return (
            <View key={bi} style={prevStyles.intervalRow}>
              <View style={[prevStyles.dot, { backgroundColor: intervalColor(segmentToIntervalType(seg.segmentType, seg.intensity)) }]} />
              <Text style={prevStyles.intervalName} numberOfLines={large ? undefined : 1}>
                {seg.label || defaultSegmentLabel(seg.segmentType)}
              </Text>
              <Text style={prevStyles.intervalDuration}>
                {dur > 0 ? formatTime(dur) : 'GPS'}
              </Text>
            </View>
          );
        }
        // RepeatGroup
        const rg = block;
        return (
          <View key={bi} style={prevStyles.block}>
            <View style={[prevStyles.blockHeader, large && prevStyles.blockHeaderLarge]}>
              {rg.name && <Text style={prevStyles.blockName}>{rg.name}</Text>}
              {rg.repetitions > 1 && (
                <View style={prevStyles.repeatBadge}>
                  <Text style={prevStyles.repeatText}>×{rg.repetitions}</Text>
                </View>
              )}
            </View>
            {rg.blocks.map((inner, ii) => {
              if (inner.blockType !== 'segment') return null;
              const seg = inner;
              const dur = seg.target.type === 'time' ? (seg.target.durationSeconds ?? 0) : 0;
              return (
                <View key={ii} style={prevStyles.intervalRow}>
                  <View style={[prevStyles.dot, { backgroundColor: intervalColor(segmentToIntervalType(seg.segmentType, seg.intensity)) }]} />
                  <Text style={prevStyles.intervalName} numberOfLines={large ? undefined : 1}>
                    {seg.label || defaultSegmentLabel(seg.segmentType)}
                  </Text>
                  <Text style={prevStyles.intervalDuration}>
                    {dur > 0 ? formatTime(dur) : 'GPS'}
                  </Text>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const prevStyles = StyleSheet.create({
  section: { marginTop: Spacing.sm },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  block: {
    backgroundColor: Colors.background + '80',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  blockHeaderLarge: {
    flexWrap: 'wrap',
  },
  blockName: {
    flexShrink: 1,
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  repeatBadge: {
    backgroundColor: Colors.primary + '22',
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: BorderRadius.sm,
  },
  repeatText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.primary,
  },
  intervalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    gap: Spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  intervalName: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  intervalDuration: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});

// ── Error Boundary ──────────────────────────────────────────

class VoiceWorkoutSheetErrorBoundary extends Component<
  { onClose: () => void; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn('VoiceWorkoutSheet unavailable:', error.message);
    Alert.alert(
      'Voice Not Available',
      'The microphone could not be started. Please try again in a moment.',
    );
    this.props.onClose();
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

// ── Main Component ──────────────────────────────────────────

export function VoiceWorkoutSheet(props: Props) {
  return (
    <VoiceWorkoutSheetErrorBoundary onClose={props.onClose}>
      <VoiceWorkoutSheetInner {...props} />
    </VoiceWorkoutSheetErrorBoundary>
  );
}

function VoiceWorkoutSheetInner({
  visible,
  date,
  aiContext,
  onAccept,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const large = useLargeText();
  const [phase, setPhase] = useState<Phase>('idle');
  const [transcription, setTranscription] = useState('');
  const [textInput, setTextInput] = useState('');
  const [aiMessage, setAiMessage] = useState('');
  const [proposedWorkout, setProposedWorkout] = useState<WorkoutDefinition | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 100);

  // Request mic permission on mount
  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const result = await AudioModule.requestRecordingPermissionsAsync();
        setHasPermission(result.granted);
      } catch {
        setHasPermission(false);
      }
    })();
  }, [visible]);

  // Reset state when sheet opens
  useEffect(() => {
    if (visible) {
      setPhase('idle');
      setTranscription('');
      setTextInput('');
      setAiMessage('');
      setProposedWorkout(null);
    }
  }, [visible]);

  const startRecording = useCallback(async () => {
    if (hasPermission === false) {
      Alert.alert(
        'Microphone Access',
        'SplitCue needs microphone access for voice input. Enable it in Settings.',
      );
      return;
    }
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
    } catch (err) {
      console.error('Failed to start recording:', err);
      Alert.alert('Recording Error', 'Could not start recording. Please try again.');
    }
  }, [hasPermission, recorder]);

  const stopAndProcess = useCallback(async () => {
    if (phase !== 'recording') return;

    try {
      await recorder.stop();
      setPhase('transcribing');

      const uri = recorder.uri;
      if (!uri) {
        setPhase('idle');
        return;
      }

      const result = await transcribeAudio(uri, 'audio/m4a');
      const text = result.text.trim();

      if (!text) {
        Alert.alert('No Speech Detected', 'Please try again and speak clearly.');
        setPhase('idle');
        return;
      }

      setTranscription(text);
      setPhase('generating');

      const context: AIContext = aiContext ?? { goals: [], preferences: [] };
      const response = await generateWorkout(text, context, []);

      setAiMessage(response.message);
      setProposedWorkout(response.workout);
      setPhase('review');
    } catch (err: any) {
      console.error('Voice workout generation failed:', err);
      Alert.alert(
        'Generation Failed',
        err.message || 'Something went wrong. Please try again.',
      );
      setPhase('idle');
    }
  }, [phase, recorder, aiContext]);

  const handleMicPress = useCallback(() => {
    hapticTap();
    if (phase === 'recording') {
      stopAndProcess();
    } else if (phase === 'idle' || phase === 'review') {
      setProposedWorkout(null);
      setAiMessage('');
      setTranscription('');
      startRecording();
    }
  }, [phase, startRecording, stopAndProcess]);

  const handleTextSend = useCallback(async () => {
    const text = textInput.trim();
    if (!text || phase === 'generating') return;
    Keyboard.dismiss();
    setTextInput('');
    setProposedWorkout(null);
    setAiMessage('');
    setTranscription(text);
    setPhase('generating');

    try {
      const context: AIContext = aiContext ?? { goals: [], preferences: [] };
      const response = await generateWorkout(text, context, []);
      setAiMessage(response.message);
      setProposedWorkout(response.workout);
      setPhase('review');
    } catch (err: any) {
      console.error('Text workout generation failed:', err);
      Alert.alert(
        'Generation Failed',
        err.message || 'Something went wrong. Please try again.',
      );
      setPhase('idle');
    }
  }, [textInput, phase, aiContext]);

  const handleAccept = useCallback(() => {
    if (!proposedWorkout) return;
    hapticTap();
    onAccept(proposedWorkout);
  }, [proposedWorkout, onAccept]);

  const handleEdit = useCallback(() => {
    hapticTap();
    setPhase('editing');
  }, []);

  const handleEditSave = useCallback(
    (updated: WorkoutDefinition) => {
      onAccept(updated);
    },
    [onAccept],
  );

  const handleClose = useCallback(() => {
    if (phase === 'recording') {
      recorder.stop().catch(() => {});
    }
    onClose();
  }, [phase, recorder, onClose]);

  const metering = phase === 'recording' ? recorderState.metering : undefined;
  const flat = proposedWorkout ? flattenWorkout(proposedWorkout) : [];
  const totalSecs = proposedWorkout ? totalWorkoutSeconds(proposedWorkout) : 0;

  const dateLabel = (() => {
    const d = new Date(date + 'T12:00:00');
    return d.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  })();

  // Editor modal (full-screen)
  if (phase === 'editing' && proposedWorkout) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.editorContainer}>
          <View style={styles.editorHeader}>
            <Text style={styles.editorTitle}>Edit Workout</Text>
            <TouchableOpacity
              onPress={() => setPhase('review')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close editor"
            >
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <WorkoutEditorForm
            initial={proposedWorkout}
            onSave={handleEditSave}
            onCancel={() => setPhase('review')}
          />
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} onPress={handleClose} activeOpacity={1} />
        <View style={[styles.sheet, large && styles.sheetLarge]}>
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerInfo}>
              <View style={styles.headerTitleRow}>
                <Ionicons name="sparkles" size={18} color={Colors.accent} />
                <Text style={styles.headerTitle} maxFontSizeMultiplier={MaxFontScale.display}>
                  Voice Workout Builder
                </Text>
              </View>
              <Text style={styles.headerDate}>{dateLabel}</Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Idle / Recording states ── */}
            {(phase === 'idle' || phase === 'recording') && (
              <View style={styles.voiceSection}>
                <TouchableOpacity
                  style={[
                    styles.micButton,
                    phase === 'recording' && styles.micButtonActive,
                  ]}
                  onPress={handleMicPress}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={phase === 'recording' ? 'Stop recording' : 'Start recording'}
                >
                  {phase === 'recording' ? (
                    <View style={styles.recordingContent}>
                      <SoundBars metering={metering} isActive />
                      <View style={styles.stopIcon}>
                        <Ionicons name="stop" size={14} color={Colors.danger} />
                      </View>
                    </View>
                  ) : (
                    <Ionicons name="mic" size={36} color={Colors.accent} />
                  )}
                </TouchableOpacity>

                <Text style={styles.voiceLabel}>
                  {phase === 'recording'
                    ? 'Listening… tap to stop'
                    : 'Describe the workout you want'}
                </Text>
                <Text style={styles.voiceHint}>
                  {phase === 'recording'
                    ? '"30 minute tempo run with warm up and cool down"'
                    : 'e.g. "6×400m repeats with 90 second recovery"'}
                </Text>
              </View>
            )}

            {/* ── Transcribing ── */}
            {phase === 'transcribing' && (
              <View style={styles.processingSection}>
                <ActivityIndicator color={Colors.accent} size="large" />
                <Text style={styles.processingLabel}>Transcribing…</Text>
              </View>
            )}

            {/* ── Generating ── */}
            {phase === 'generating' && (
              <View style={styles.processingSection}>
                <ActivityIndicator color={Colors.primary} size="large" />
                <View style={styles.transcriptionBubble}>
                  <Text style={styles.transcriptionText}>"{transcription}"</Text>
                </View>
                <Text style={styles.processingLabel}>Building your workout…</Text>
              </View>
            )}

            {/* ── Review proposed workout ── */}
            {phase === 'review' && proposedWorkout && (
              <View style={styles.reviewSection}>
                {/* What the user said */}
                <View style={styles.transcriptionBubble}>
                  <Ionicons name="mic" size={14} color={Colors.accent} />
                  <Text style={styles.transcriptionText}>"{transcription}"</Text>
                </View>

                {/* AI message */}
                {aiMessage ? (
                  <View style={styles.aiMessageBubble}>
                    <Text style={styles.aiMessageText}>{aiMessage}</Text>
                  </View>
                ) : null}

                {/* Workout preview */}
                <View style={styles.workoutCard}>
                  <View style={styles.workoutCardHeader}>
                    <Text style={styles.workoutName}>{proposedWorkout.name}</Text>
                    <Text style={styles.workoutSummary}>
                      {formatTime(totalSecs)} · {flat.length} interval{flat.length !== 1 ? 's' : ''}
                    </Text>
                  </View>

                  <BlocksPreview blocks={proposedWorkout.blocks} />
                </View>

                {/* Action buttons */}
                <View style={[styles.actionRow, large && styles.actionRowLarge]}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={handleEdit}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="create-outline" size={16} color={Colors.accent} />
                    <Text style={styles.editButtonText}>Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.acceptButton, large && styles.acceptButtonLarge]}
                    onPress={handleAccept}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="checkmark-circle" size={16} color={Colors.black} />
                    <Text style={styles.acceptButtonText}>Add to Calendar</Text>
                  </TouchableOpacity>
                </View>

                {/* Try again */}
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={handleMicPress}
                  activeOpacity={0.7}
                >
                  <Ionicons name="mic" size={16} color={Colors.textSecondary} />
                  <Text style={styles.retryButtonText}>Describe a different workout</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {/* Text input bar — fallback for when the user can't speak */}
          {(phase === 'idle' || phase === 'review') && (
            <View style={[styles.inputBar, { paddingBottom: Math.max(Spacing.sm, insets.bottom) }]}>
              <TextInput
                style={[styles.textInput, large && styles.textInputLarge]}
                value={textInput}
                onChangeText={setTextInput}
                placeholder="Or type your workout…"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="send"
                onSubmitEditing={handleTextSend}
                blurOnSubmit
              />
              <TouchableOpacity
                style={[styles.sendBtn, !textInput.trim() && styles.sendBtnDisabled]}
                onPress={handleTextSend}
                disabled={!textInput.trim()}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Send"
                accessibilityState={{ disabled: !textInput.trim() }}
              >
                <Ionicons name="send" size={16} color={Colors.black} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    minHeight: '45%',
    maxHeight: '85%',
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight,
  },
  sheetLarge: {
    maxHeight: '92%',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  headerInfo: {
    flexShrink: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  headerTitle: {
    flexShrink: 1,
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  headerDate: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Scroll area
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },

  // Voice / Idle section
  voiceSection: {
    alignItems: 'center',
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  micButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.accent + '40',
    marginBottom: Spacing.lg,
  },
  micButtonActive: {
    borderColor: Colors.danger + '60',
    backgroundColor: Colors.danger + '10',
  },
  recordingContent: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  stopIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.danger + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  voiceHint: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Processing states
  processingSection: {
    alignItems: 'center',
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  processingLabel: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textSecondary,
  },

  // Transcription bubble
  transcriptionBubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  transcriptionText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 20,
  },

  // AI message
  aiMessageBubble: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary + '60',
  },
  aiMessageText: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    lineHeight: 20,
  },

  // Review section
  reviewSection: {
    paddingTop: Spacing.md,
  },

  // Workout card
  workoutCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  workoutCardHeader: {
    marginBottom: Spacing.xs,
  },
  workoutName: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.primary,
  },
  workoutSummary: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  actionRowLarge: {
    flexDirection: 'column-reverse',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.accent + '40',
  },
  editButtonText: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.accent,
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  acceptButtonLarge: {
    flex: 0,
  },
  acceptButtonText: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.black,
  },

  // Retry
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  retryButtonText: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },

  // Editor
  editorContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceLight,
  },
  editorTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.textPrimary,
  },

  // Text input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight,
    gap: Spacing.sm,
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    maxHeight: 80,
  },
  textInputLarge: {
    maxHeight: undefined,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
