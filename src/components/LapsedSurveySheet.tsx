/**
 * LapsedSurveySheet — a one-time question for people who did one run and
 * didn't come back. Shown on app open when the device has exactly one
 * qualifying run and it was at least 10 days ago.
 */

import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { loadQualifyingHistory } from '../analytics/workoutContext';
import { track } from '../analytics/track';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

const SEEN_KEY = '@pacecue/lapsed_survey_seen';
const MIN_DAYS_SINCE_RUN = 10;

const REASONS = [
  { id: 'other_app', label: 'I normally use another running app' },
  { id: 'not_running', label: "I haven't gone for another run yet" },
  { id: 'confusing', label: 'The app was confusing or difficult' },
  { id: 'missing_feature', label: 'It was missing something I needed' },
  { id: 'technical_problem', label: 'I had a technical problem' },
  { id: 'other', label: 'Something else' },
] as const;

type ReasonId = (typeof REASONS)[number]['id'];

let checkedThisLaunch = false;

export function LapsedSurveySheet() {
  const [visible, setVisible] = useState(false);
  const [daysSinceRun, setDaysSinceRun] = useState(0);
  const [reason, setReason] = useState<ReasonId | null>(null);
  const [detail, setDetail] = useState('');

  useEffect(() => {
    if (checkedThisLaunch) return;
    checkedThisLaunch = true;
    (async () => {
      if (await AsyncStorage.getItem(SEEN_KEY)) return;
      const runs = await loadQualifyingHistory();
      if (runs.length !== 1) return;
      const days = (Date.now() - runs[0].completedAt) / 86_400_000;
      if (days < MIN_DAYS_SINCE_RUN) return;
      await AsyncStorage.setItem(SEEN_KEY, String(Date.now()));
      setDaysSinceRun(Math.round(days));
      setVisible(true);
      track('lapsed_survey_shown', { days_since_run: Math.round(days) });
    })();
  }, []);

  const close = () => setVisible(false);

  const handleDismiss = () => {
    if (!reason) track('lapsed_survey_dismissed', { days_since_run: daysSinceRun });
    close();
  };

  const handlePick = (id: ReasonId) => {
    setReason(id);
    track('lapsed_survey_answered', { reason: id, days_since_run: daysSinceRun });
  };

  const handleSubmitDetail = () => {
    const text = detail.trim();
    if (text) track('lapsed_survey_detail', { reason, detail: text.slice(0, 500) });
    close();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleDismiss}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{reason ? 'Thanks for telling us' : 'Quick question'}</Text>
            <TouchableOpacity
              onPress={reason ? close : handleDismiss}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {!reason ? (
            <>
              <Text style={styles.subtitle}>
                It&apos;s been a while since your run. What&apos;s kept you from running with SplitCue?
              </Text>
              {REASONS.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={styles.option}
                  onPress={() => handlePick(r.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.optionText}>{r.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <>
              <Text style={styles.subtitle}>Anything you&apos;d like to add? (optional)</Text>
              <TextInput
                style={styles.input}
                value={detail}
                onChangeText={setDetail}
                placeholder="Tell us more"
                placeholderTextColor={Colors.textMuted}
                multiline
                maxLength={500}
              />
              <TouchableOpacity style={styles.submitBtn} onPress={handleSubmitDetail} activeOpacity={0.8}>
                <Text style={styles.submitBtnText}>{detail.trim() ? 'Send' : 'Done'}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.xs,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.md,
  },
  optionText: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  input: {
    minHeight: 90,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 4,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  submitBtnText: {
    color: Colors.black,
    fontSize: FontSize.md,
    fontWeight: '800',
  },
});
