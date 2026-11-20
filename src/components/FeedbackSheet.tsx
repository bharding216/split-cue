/**
 * FeedbackSheet — in-app feedback form presented as a bottom sheet modal.
 *
 * Categories: "Something isn't working", "I have an idea", "Other feedback"
 * Optional email + "I'm open to a follow-up" toggle.
 * Submits to the submit-feedback edge function.
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Keyboard,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { SheetContainer } from './SheetContainer';
import { hapticTap } from '../audio/haptics';
import { track } from '../analytics/track';
import { supabase } from '../analytics/supabaseClient';
import { staticDeviceInfo, devicePlatform, deviceOsVersion } from '../analytics/deviceInfo';

type FeedbackCategory = 'bug' | 'idea' | 'other';

interface CategoryOption {
  value: FeedbackCategory;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

const CATEGORIES: CategoryOption[] = [
  { value: 'bug', label: 'Something isn\'t working', icon: 'bug-outline' },
  { value: 'idea', label: 'I have an idea', icon: 'bulb-outline' },
  { value: 'other', label: 'Other feedback', icon: 'chatbubble-outline' },
];

const PLACEHOLDER: Record<FeedbackCategory, string> = {
  bug: 'What happened? What did you expect?',
  idea: 'What would make SplitCue better?',
  other: 'What\'s on your mind?',
};

interface FeedbackSheetProps {
  visible: boolean;
  onDismiss: () => void;
  /** Current screen name for context, e.g. "settings/about". */
  screen?: string;
}

export function FeedbackSheet({ visible, onDismiss, screen }: FeedbackSheetProps) {
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [openToFollowup, setOpenToFollowup] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const messageRef = useRef<TextInput>(null);

  const reset = useCallback(() => {
    setCategory('bug');
    setMessage('');
    setEmail('');
    setOpenToFollowup(true);
    setSubmitting(false);
    setSubmitted(false);
  }, []);

  const handleDismiss = useCallback(() => {
    onDismiss();
    // Reset after animation
    setTimeout(reset, 300);
  }, [onDismiss, reset]);

  const handleSubmit = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      Alert.alert('Feedback', 'Please enter your feedback before submitting.');
      return;
    }

    hapticTap();
    Keyboard.dismiss();
    setSubmitting(true);

    try {
      const info = staticDeviceInfo();
      const deviceModel = [info.manufacturer, info.model_name].filter(Boolean).join(' ') || null;

      const { data: { session } } = await supabase.auth.getSession();

      const res = await supabase.functions.invoke('submit-feedback', {
        body: {
          category,
          message: trimmed,
          email: openToFollowup && email.trim() ? email.trim() : null,
          open_to_followup: openToFollowup,
          app_version: Constants.expoConfig?.version ?? null,
          platform: devicePlatform(),
          os_version: deviceOsVersion(),
          device_model: deviceModel,
          screen: screen ?? null,
        },
      });

      if (res.error) throw res.error;

      track('feedback_submitted', { category });
      setSubmitted(true);
    } catch (err) {
      console.error('Feedback submission failed:', err);
      Alert.alert(
        'Couldn\'t send feedback',
        'Please check your connection and try again.',
        [{ text: 'OK' }],
      );
    } finally {
      setSubmitting(false);
    }
  }, [category, message, email, openToFollowup, screen]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleDismiss}
        />
        <SheetContainer
          onDismiss={handleDismiss}
          style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}
        >
          {submitted ? (
            <View style={styles.successContainer}>
              <Ionicons name="checkmark-circle" size={56} color={Colors.primary} />
              <Text style={styles.successTitle}>Thanks for your feedback!</Text>
              <Text style={styles.successSub}>
                {openToFollowup && email.trim()
                  ? 'We\'ll follow up via email if we have questions.'
                  : 'Your feedback helps shape SplitCue for runners everywhere.'}
              </Text>
              <TouchableOpacity
                style={styles.doneBtn}
                onPress={handleDismiss}
                activeOpacity={0.7}
              >
                <Text style={styles.doneBtnLabel}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.title}>Help improve SplitCue</Text>
              <Text style={styles.subtitle}>
                Your feedback goes directly to the developer.
              </Text>

              {/* Category radio buttons */}
              <View style={styles.categoryGroup}>
                {CATEGORIES.map((opt) => {
                  const selected = category === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={styles.categoryRow}
                      onPress={() => {
                        hapticTap();
                        setCategory(opt.value);
                      }}
                      activeOpacity={0.7}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                    >
                      <View style={[styles.radio, selected && styles.radioSelected]}>
                        {selected && <View style={styles.radioDot} />}
                      </View>
                      <Text style={[styles.categoryLabel, selected && styles.categoryLabelSelected]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Message input */}
              <TextInput
                ref={messageRef}
                style={styles.messageInput}
                placeholder={PLACEHOLDER[category]}
                placeholderTextColor={Colors.textMuted}
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={5000}
                textAlignVertical="top"
                returnKeyType="default"
                autoFocus={false}
              />

              {/* Follow-up toggle + email */}
              <TouchableOpacity
                style={styles.followupRow}
                onPress={() => {
                  hapticTap();
                  setOpenToFollowup((v) => !v);
                }}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: openToFollowup }}
              >
                <Ionicons
                  name={openToFollowup ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={openToFollowup ? Colors.primary : Colors.textMuted}
                />
                <View style={styles.followupTextGroup}>
                  <Text style={styles.followupLabel}>Notify me when it's done</Text>
                  <Text style={styles.followupHint}>
                    We'll email you once we've addressed your feedback.
                  </Text>
                </View>
              </TouchableOpacity>

              {openToFollowup && (
                <TextInput
                  style={styles.emailInput}
                  placeholder="Email address"
                  placeholderTextColor={Colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={254}
                />
              )}

              {/* Submit button */}
              <TouchableOpacity
                style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={submitting || !message.trim()}
                activeOpacity={0.7}
              >
                {submitting ? (
                  <ActivityIndicator color={Colors.background} size="small" />
                ) : (
                  <Text style={styles.submitBtnLabel}>Send Feedback</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </SheetContainer>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    maxHeight: '90%',
  },

  title: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.md,
  },

  // Category radios
  categoryGroup: {
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 6,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: Colors.primary,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  categoryLabel: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  categoryLabelSelected: {
    color: Colors.textPrimary,
    fontWeight: '600',
  },

  // Message input
  messageInput: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    minHeight: 100,
    maxHeight: 180,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },

  // Follow-up
  followupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  followupTextGroup: {
    flex: 1,
  },
  followupLabel: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  followupHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  emailInput: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },

  // Submit
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.background,
  },

  // Success
  successContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  successTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  successSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  doneBtn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
    paddingHorizontal: Spacing.xxl,
  },
  doneBtnLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.background,
  },
});
