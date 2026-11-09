/**
 * VoicePlanAdjustSheet — bottom-sheet modal for voice-driven plan adjustments.
 *
 * Appears as a compact sheet (like VoiceWorkoutSheet) rather than navigating
 * to a full chat screen. Voice-first with text fallback.
 *
 * Flow:
 *   1. User taps mic or types a message describing the desired change
 *   2. Voice is transcribed via Whisper (if mic used)
 *   3. Prompt is sent to the adjust-plan edge function
 *   4. Proposed modifications are shown with Apply / Discard actions
 *   5. User can apply, discard, or try again
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
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
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  useAudioRecorder,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorderState,
} from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../constants/theme';
import { useLargeText } from '../hooks/useLargeText';
import { transcribeAudio } from '../ai/transcriptionService';
import {
  adjustPlan,
  applyPlanModifications,
  type PlanAdjustmentInput,
  type PlanModification,
} from '../ai/planService';
import { ModificationReview, type ModificationItem } from './ModificationReview';
import { hapticTap } from '../audio/haptics';
import { aiClientMeta, useAiOutcome, type AiInputMethod } from '../analytics/aiOutcome';
import type { TrainingPlan, PlanWorkout } from '../types/database';

// ── Types ────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  plan: TrainingPlan;
  planWorkouts: PlanWorkout[];
  onClose: () => void;
  onApplied: () => void;
}

type Phase =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'generating'
  | 'review'
  | 'applying';

// ── Quick Chips ──────────────────────────────────────────────

interface QuickChip {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  prompt: string;
  /** If set, tapping pre-fills the text input instead of submitting immediately. */
  prefill?: string;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tomorrowKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

function buildQuickChips(
  plan: TrainingPlan,
  planWorkouts: PlanWorkout[],
): QuickChip[] {
  const chips: QuickChip[] = [];
  const tomorrow = tomorrowKey();
  const daysToRace = daysUntil(plan.race_date);

  const tomorrowWorkout = planWorkouts.find(
    (w) => w.date === tomorrow && w.status === 'planned',
  );
  if (tomorrowWorkout) {
    chips.push({
      icon: 'bed-outline',
      label: 'Easier tomorrow',
      prompt: "I'm feeling tired. Can you make tomorrow's workout easier?",
    });
  }

  if (daysToRace > 0 && daysToRace <= 14 && plan.race_type !== 'custom' && (plan.goal_type ?? 'race') === 'race') {
    chips.push({
      icon: 'flag-outline',
      label: 'Help me taper',
      prompt: `My race is in ${daysToRace} days. Help me taper properly.`,
    });
  }

  chips.push({
    icon: 'trending-down-outline',
    label: 'Easier week',
    prompt: 'This week is too much. Can you make it easier?',
  });

  chips.push({
    icon: 'trending-up-outline',
    label: 'Push harder',
    prompt: "The plan feels too easy. Can you increase the intensity?",
  });

  chips.push({
    icon: 'calendar-outline',
    label: 'Busy day coming up',
    prompt: '',
    prefill: "I'm busy on ",
  });

  return chips;
}

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

// ── Main Component ──────────────────────────────────────────

export function VoicePlanAdjustSheet({
  visible,
  plan,
  planWorkouts,
  onClose,
  onApplied,
}: Props) {
  const insets = useSafeAreaInsets();
  const large = useLargeText();
  const [phase, setPhase] = useState<Phase>('idle');
  const [transcription, setTranscription] = useState('');
  const [textInput, setTextInput] = useState('');
  const [aiMessage, setAiMessage] = useState('');
  const [modifications, setModifications] = useState<PlanModification[]>([]);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const textInputRef = useRef<TextInput>(null);
  const outcome = useAiOutcome();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 100);

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

  useEffect(() => {
    if (visible) {
      setPhase('idle');
      setTranscription('');
      setTextInput('');
      setAiMessage('');
      setModifications([]);
    }
  }, [visible]);

  const quickChips = React.useMemo(
    () => buildQuickChips(plan, planWorkouts),
    [plan, planWorkouts],
  );

  const processPrompt = useCallback(async (prompt: string, inputMethod: AiInputMethod) => {
    outcome.report('retried');
    setTranscription(prompt);
    setPhase('generating');

    try {
      const today = todayKey();
      const outline = plan.outline ?? [];
      const totalWeeks =
        outline.length ||
        Math.max(...planWorkouts.map((w) => w.week_number), 1);

      const relevantWorkouts = planWorkouts
        .filter((w) => w.plan_id === plan.id)
        .map((w) => ({
          date: w.date,
          day_label: w.day_label ?? '',
          status: w.status,
          week_number: w.week_number,
        }));

      const result = await adjustPlan({
        prompt: `Today is ${today}. ${prompt}`,
        planSummary: {
          title: plan.title,
          raceType: plan.race_type,
          raceDate: plan.race_date,
          goalType: plan.goal_type ?? 'race',
          goalPace: plan.goal_pace ?? null,
          startDate: plan.start_date,
          daysPerWeek: plan.days_per_week,
          totalWeeks,
          workouts: relevantWorkouts,
        },
        client: aiClientMeta('plan_adjust_sheet', inputMethod, prompt),
      });

      outcome.begin(result.requestId);
      setAiMessage(result.message);
      setModifications(result.modifications ?? []);
      setPhase('review');
    } catch (err: any) {
      console.error('Plan adjustment failed:', err);
      Alert.alert(
        'Adjustment Failed',
        err.message || 'Something went wrong. Please try again.',
      );
      setPhase('idle');
    }
  }, [plan, planWorkouts, outcome]);

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

      await processPrompt(text, 'voice');
    } catch (err: any) {
      console.error('Voice plan adjustment failed:', err);
      Alert.alert(
        'Adjustment Failed',
        err.message || 'Something went wrong. Please try again.',
      );
      setPhase('idle');
    }
  }, [phase, recorder, processPrompt]);

  const handleMicPress = useCallback(() => {
    hapticTap();
    if (phase === 'recording') {
      stopAndProcess();
    } else if (phase === 'idle' || phase === 'review') {
      setModifications([]);
      setAiMessage('');
      setTranscription('');
      startRecording();
    }
  }, [phase, startRecording, stopAndProcess]);

  const handleTextSend = useCallback(() => {
    const text = textInput.trim();
    if (!text) return;
    Keyboard.dismiss();
    setTextInput('');
    hapticTap();
    processPrompt(text, 'text');
  }, [textInput, processPrompt]);

  const handleChipPress = useCallback((chip: QuickChip) => {
    hapticTap();
    if (chip.prefill) {
      setTextInput(chip.prefill);
      setTimeout(() => textInputRef.current?.focus(), 100);
    } else {
      processPrompt(chip.prompt, 'chip');
    }
  }, [processPrompt]);

  const handleApply = useCallback(async (mods: PlanModification[]) => {
    setPhase('applying');
    try {
      await applyPlanModifications(plan.id, mods);
      outcome.report(mods.length < modifications.length ? 'partially_applied' : 'applied', {
        modification_count: modifications.length,
        applied_count: mods.length,
      });
      onApplied();
    } catch (err: any) {
      Alert.alert('Apply Failed', err.message || 'Could not apply changes.');
      setPhase('review');
    }
  }, [plan.id, onApplied, onClose, modifications.length, outcome]);

  const handleKeep = useCallback(() => {
    outcome.report('discarded');
    setModifications([]);
    setAiMessage('');
    setTranscription('');
    setPhase('idle');
  }, []);

  const handleClose = useCallback(() => {
    if (phase === 'recording') {
      recorder.stop().catch(() => {});
    }
    outcome.report('closed');
    onClose();
  }, [phase, recorder, onClose, outcome]);

  const metering = phase === 'recording' ? recorderState.metering : undefined;

  const modItems: ModificationItem[] = modifications.map((mod) => {
    const existing = planWorkouts.find((pw) => pw.date === mod.date);
    return {
      modification: mod,
      before: existing
        ? { day_label: existing.day_label ?? undefined, description: existing.description ?? undefined }
        : null,
    };
  });

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
            <View style={styles.headerLeft}>
              <View style={styles.headerTitleRow}>
                <Ionicons name="mic" size={18} color={Colors.accent} />
                <Text style={styles.headerTitle} maxFontSizeMultiplier={MaxFontScale.display}>
                  Adjust My Plan
                </Text>
              </View>
              <Text style={styles.headerSubtitle}>Speak or type your request</Text>
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
            {/* ── Idle state ── */}
            {phase === 'idle' && (
              <View style={styles.idleSection}>
                {/* Mic button */}
                <TouchableOpacity
                  style={styles.micButton}
                  onPress={handleMicPress}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Start recording"
                >
                  <Ionicons name="mic" size={36} color={Colors.accent} />
                </TouchableOpacity>
                <Text style={styles.voiceLabel}>Tap to describe your change</Text>
                <Text style={styles.voiceHint}>
                  "Make this week easier" or "Add a long run on Sunday"
                </Text>

                {/* Quick chips */}
                <View style={styles.chipsWrap}>
                  {quickChips.map((chip) => (
                    <TouchableOpacity
                      key={chip.label}
                      style={styles.chip}
                      onPress={() => handleChipPress(chip)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                    >
                      <Ionicons name={chip.icon} size={12} color={Colors.accent} />
                      <Text style={styles.chipLabel}>{chip.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* ── Recording ── */}
            {phase === 'recording' && (
              <View style={styles.idleSection}>
                <TouchableOpacity
                  style={[styles.micButton, styles.micButtonActive]}
                  onPress={handleMicPress}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Stop recording"
                >
                  <View style={styles.recordingContent}>
                    <SoundBars metering={metering} isActive />
                    <View style={styles.stopIcon}>
                      <Ionicons name="stop" size={14} color={Colors.danger} />
                    </View>
                  </View>
                </TouchableOpacity>
                <Text style={styles.voiceLabel}>Listening… tap to stop</Text>
                <Text style={styles.voiceHint}>
                  "I'm feeling tired, make tomorrow easier"
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
                  <Ionicons name="mic" size={14} color={Colors.accent} />
                  <Text style={styles.transcriptionText}>"{transcription}"</Text>
                </View>
                <Text style={styles.processingLabel}>Adjusting your plan…</Text>
              </View>
            )}

            {/* ── Review proposed changes ── */}
            {phase === 'review' && (
              <View style={styles.reviewSection}>
                {/* What was said */}
                <View style={styles.transcriptionBubble}>
                  <Ionicons name="mic" size={14} color={Colors.accent} />
                  <Text style={styles.transcriptionText}>"{transcription}"</Text>
                </View>

                {/* AI response with modifications */}
                {modItems.length > 0 ? (
                  <ModificationReview
                    items={modItems}
                    coachMessage={aiMessage}
                    onApply={handleApply}
                    onKeepOriginal={handleKeep}
                  />
                ) : (
                  <>
                    {aiMessage ? (
                      <View style={styles.aiMessageBubble}>
                        <Text style={styles.aiMessageText}>{aiMessage}</Text>
                      </View>
                    ) : null}
                    <View style={styles.noChanges}>
                      <Ionicons name="information-circle-outline" size={18} color={Colors.textMuted} />
                      <Text style={styles.noChangesText}>
                        No changes suggested. Try describing what you'd like differently.
                      </Text>
                    </View>
                  </>
                )}

                {/* Try again */}
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={handleMicPress}
                  activeOpacity={0.7}
                >
                  <Ionicons name="mic" size={16} color={Colors.textSecondary} />
                  <Text style={styles.retryButtonText}>Try a different request</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Applying ── */}
            {phase === 'applying' && (
              <View style={styles.processingSection}>
                <ActivityIndicator color={Colors.primary} size="large" />
                <Text style={styles.processingLabel}>Applying changes…</Text>
              </View>
            )}
          </ScrollView>

          {/* Text input bar — always visible in idle/review as fallback */}
          {(phase === 'idle' || phase === 'review') && (
            <View style={[styles.inputBar, { paddingBottom: Math.max(Spacing.sm, insets.bottom) }]}>
              <TextInput
                ref={textInputRef}
                style={[styles.textInput, large && styles.textInputLarge]}
                value={textInput}
                onChangeText={setTextInput}
                placeholder="Or type your request…"
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
    minHeight: '55%',
    maxHeight: '90%',
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
  },
  headerLeft: {
    flex: 1,
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
  headerSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Scroll
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },

  // Idle / Recording
  idleSection: {
    alignItems: 'center',
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
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
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },

  // Quick chips
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },

  // Processing
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

  // Review
  reviewSection: {
    paddingTop: Spacing.md,
  },

  // No changes
  noChanges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  noChangesText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    lineHeight: 20,
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
