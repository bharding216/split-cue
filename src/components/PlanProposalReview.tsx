/**
 * PlanProposalReview — shows the coach's high-level plan approach and phases
 * before anything is saved. The runner approves it or replies with changes.
 */

import React, { useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VoiceInput } from './VoiceInput';
import { derivePhases } from './TrainingPhases';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../constants/theme';
import { useLargeText, useScaledSize } from '../hooks/useLargeText';
import type { PlanOutlineResult } from '../ai/planService';

export interface PlanRevisionExchange {
  feedback: string;
  reply: string | null;
}

interface PlanProposalReviewProps {
  outline: PlanOutlineResult;
  exchanges: PlanRevisionExchange[];
  revising: boolean;
  approving: boolean;
  onApprove: () => void;
  onRevise: (feedback: string) => void;
  onBack: () => void;
}

const APPROVAL_PATTERN = /^\s*(approve[ds]?|approve it|looks? good|lgtm|yes|yep|ok(ay)?|sounds good|perfect|great|let'?s do it|go|do it)\s*[.!]*\s*$/i;

interface PhaseRow {
  key: string;
  weekRange: string;
  name: string;
  focus: string | null;
  miles: string | null;
}

function formatMiles(values: number[]): string | null {
  const valid = values.filter((v) => isFinite(v) && v > 0);
  if (valid.length === 0) return null;
  const min = Math.round(Math.min(...valid));
  const max = Math.round(Math.max(...valid));
  return min === max ? `${min} mi/wk` : `${min}\u2013${max} mi/wk`;
}

function buildPhaseRows(outline: PlanOutlineResult): PhaseRow[] {
  const milesFor = (start: number, end: number) =>
    formatMiles(
      outline.weeks
        .filter((w) => w.week_number >= start && w.week_number <= end)
        .map((w) => w.total_miles_target),
    );

  if (outline.phases?.length) {
    return outline.phases.map((p) => ({
      key: `${p.start_week}-${p.end_week}`,
      weekRange: p.start_week === p.end_week ? `Week ${p.start_week}` : `Weeks ${p.start_week}\u2013${p.end_week}`,
      name: p.name,
      focus: p.focus || null,
      miles: milesFor(p.start_week, p.end_week),
    }));
  }

  return derivePhases(outline.weeks, 0).map((p) => {
    const nums = p.weekRange.match(/\d+/g)?.map(Number) ?? [];
    const start = nums[0] ?? 1;
    const end = nums[1] ?? start;
    return {
      key: String(p.number),
      weekRange: p.weekRange,
      name: p.name,
      focus: null,
      miles: milesFor(start, end),
    };
  });
}

export function PlanProposalReview({
  outline,
  exchanges,
  revising,
  approving,
  onApprove,
  onRevise,
  onBack,
}: PlanProposalReviewProps) {
  const insets = useSafeAreaInsets();
  const large = useLargeText();
  const inputMaxHeight = useScaledSize(100, MaxFontScale.display);
  const scrollRef = useRef<ScrollView>(null);
  const [input, setInput] = useState('');
  const busy = revising || approving;

  const phases = useMemo(() => buildPhaseRows(outline), [outline]);
  const totalMiles = useMemo(() => formatMiles(outline.weeks.map((w) => w.total_miles_target)), [outline]);

  const submit = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput('');
    if (APPROVAL_PATTERN.test(trimmed)) {
      onApprove();
    } else {
      onRevise(trimmed);
    }
  }, [busy, onApprove, onRevise]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (exchanges.length > 0) scrollRef.current?.scrollToEnd({ animated: true });
        }}
      >
        <View style={styles.header}>
          <View style={styles.sparkleWrap}>
            <Ionicons name="sparkles" size={20} color={Colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Your coach's proposal</Text>
            <Text style={styles.title}>{outline.title}</Text>
            <Text style={styles.meta}>
              {outline.weeks.length} weeks{totalMiles ? ` \u00B7 ${totalMiles}` : ''}
            </Text>
          </View>
        </View>

        <View style={[styles.card, revising && styles.dimmed]}>
          {outline.approach ? (
            <Text style={styles.approach}>{outline.approach}</Text>
          ) : null}

          {phases.map((phase, i) => (
            <View key={phase.key} style={[styles.phaseRow, i === phases.length - 1 && styles.phaseRowLast]}>
              <View style={styles.phaseHead}>
                <Text style={styles.phaseWeeks}>{phase.weekRange}</Text>
                {phase.miles ? <Text style={styles.phaseMiles}>{phase.miles}</Text> : null}
              </View>
              <Text style={styles.phaseName}>{phase.name}</Text>
              {phase.focus ? <Text style={styles.phaseFocus}>{phase.focus}</Text> : null}
            </View>
          ))}
        </View>

        {exchanges.map((ex, i) => (
          <View key={i} style={styles.exchange}>
            <View style={styles.userBubble}>
              <Text style={styles.userBubbleText}>{ex.feedback}</Text>
            </View>
            {ex.reply ? (
              <View style={styles.coachBubble}>
                <Text style={styles.coachBubbleText}>{ex.reply}</Text>
              </View>
            ) : null}
          </View>
        ))}

        {revising && (
          <View style={styles.revisingRow}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.revisingText}>Your coach is revising the plan…</Text>
          </View>
        )}

        {!revising && (
          <Text style={styles.hint}>
            Happy with this? Approve it to add the workouts to your calendar. Or tell your coach what to change, like "make long runs on Sunday" or "start with lower mileage".
          </Text>
        )}

        <View style={[styles.actionRow, large && styles.actionRowLarge]}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack} disabled={busy} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={18} color={Colors.textSecondary} />
            <Text style={styles.backBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.approveBtn, busy && styles.disabled]}
            onPress={onApprove}
            disabled={busy}
            activeOpacity={0.8}
          >
            {approving ? (
              <ActivityIndicator size="small" color={Colors.black} />
            ) : (
              <Ionicons name="checkmark-circle" size={18} color={Colors.black} />
            )}
            <Text style={styles.approveBtnText}>{approving ? 'Adding to calendar…' : 'Approve Plan'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, Spacing.sm) }]}>
        <VoiceInput onTranscription={submit} compact />
        <TextInput
          style={[styles.input, { maxHeight: inputMaxHeight }]}
          maxFontSizeMultiplier={MaxFontScale.display}
          value={input}
          onChangeText={setInput}
          placeholder='Ask for changes, or type "approve"'
          placeholderTextColor={Colors.textMuted}
          multiline
          maxLength={500}
          editable={!busy}
          returnKeyType="send"
          onSubmitEditing={() => submit(input)}
          blurOnSubmit
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || busy) && styles.disabled]}
          onPress={() => submit(input)}
          disabled={!input.trim() || busy}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Send"
        >
          <Ionicons name="send" size={18} color={Colors.black} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  sparkleWrap: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.accent + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  meta: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  dimmed: { opacity: 0.5 },
  approach: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    lineHeight: 21,
    marginBottom: Spacing.md,
  },
  phaseRow: {
    paddingVertical: Spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight,
  },
  phaseRowLast: { paddingBottom: 0 },
  phaseHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    columnGap: Spacing.sm,
  },
  phaseWeeks: {
    flexShrink: 1,
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  phaseMiles: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  phaseName: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  phaseFocus: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginTop: 2,
  },
  exchange: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  userBubbleText: {
    fontSize: FontSize.sm,
    color: Colors.black,
    lineHeight: 20,
  },
  coachBubble: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  coachBubbleText: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  revisingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  revisingText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  hint: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    lineHeight: 20,
    marginTop: Spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  actionRowLarge: {
    flexDirection: 'column-reverse',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
    minHeight: 50,
  },
  backBtnText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    minHeight: 50,
  },
  approveBtnText: {
    color: Colors.black,
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  disabled: { opacity: 0.4 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
