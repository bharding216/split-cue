/**
 * ShareSheet — the one place workouts and runs are shared from.
 *
 * For completed workouts (results/challenge): shows a live paceprint
 * text preview with toggles for time, distance, and pace. Two buttons:
 * "Share" (system share sheet) and "Copy" (clipboard).
 *
 * For achievements/stats: ultra-simple text preview + Share / Copy.
 *
 * For workout structures and planned runs: a link share with the system
 * share sheet (legacy flow).
 *
 * Render `shareSheet` from `useShareSheet()` in the screen that shares.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Switch,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Share,
  useWindowDimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { SheetContainer } from './SheetContainer';
import { hapticTap } from '../audio/haptics';
import { track } from '../analytics/track';
import { useAuth } from '../contexts/AuthContext';
import { loadSettings } from '../workout/workoutStorage';
import { DEFAULT_SETTINGS } from '../workout/workoutTypes';
import type { PaceUnit } from '../pace/paceTypes';
import { localeDefaultPaceUnit } from '../i18n/localeUnits';
import type { AwardBadge, PersonalRecord } from '../stats/personalRecords';
import {
  composeShareBody,
  composeShareMessage,
  composePaceprintText,
  composeAchievementText,
  defaultCaption,
  resultOf,
  type ShareSubject,
  type PaceprintShareOptions,
} from '../sharing/shareText';
import { createShareLink, generateShortCode, type CreatedShareLink } from '../sharing/shareWorkout';
import {
  DEFAULT_SHARE_PREFERENCES,
  loadSharePreferences,
  saveSharePreferences,
  type SharePreferences,
} from '../sharing/sharePreferences';
import { computeIntervalConsistency } from '../stats/intervalConsistency';
import type { ChallengeType, SharedResult } from '../workout/workoutTypes';

const CHALLENGE_LABELS: Record<ChallengeType, string> = {
  time: 'Beat my time',
  consistency: 'Match my consistency',
};

export interface ShareRequest extends ShareSubject {
  /** Where the share started, for analytics (e.g. "workout_complete"). */
  surface: string;
  /** New records and awards from this run, for the card's badge. */
  records?: PersonalRecord[];
  awards?: AwardBadge[];
}

type ShareMethod = 'link' | 'copy';

const TITLES: Record<ShareSubject['kind'], string> = {
  structure: 'Share Workout',
  planned: 'Share Planned Run',
  results: 'Share Your Run',
  challenge: 'Challenge a Friend',
  achievement: 'Share Your Achievement',
};

interface ShareSheetProps {
  request: ShareRequest | null;
  onClose: () => void;
  onShared?: (request: ShareRequest) => void;
}

export function ShareSheet({ request, onClose, onShared }: ShareSheetProps) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [prefs, setPrefs] = useState<SharePreferences>(DEFAULT_SHARE_PREFERENCES);
  const [paceUnit, setPaceUnit] = useState<PaceUnit>(localeDefaultPaceUnit);
  const [caption, setCaption] = useState('');
  const [captionEdited, setCaptionEdited] = useState(false);
  const [busy, setBusy] = useState<ShareMethod | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const createdLink = useRef<{ key: string; link: CreatedShareLink | null } | null>(null);

  const run = request?.run;
  const hasResult =
    !!run &&
    run.totalDurationMs > 0 &&
    (request?.kind === 'results' || request?.kind === 'challenge' || request?.kind === 'achievement');

  const isRunShare = request?.kind === 'results' || request?.kind === 'challenge';
  const isAchievementShare = request?.kind === 'achievement';
  const isWorkoutShare = request?.kind === 'structure' || request?.kind === 'planned';

  const consistency = useMemo(
    () => (hasResult ? computeIntervalConsistency(run?.splits) : null),
    [hasResult, run?.splits],
  );

  const challengeTypes: ChallengeType[] =
    request?.kind === 'challenge' && !request.replyTo && consistency ? ['consistency', 'time'] : [];
  const [pickedChallengeType, setPickedChallengeType] = useState<ChallengeType | null>(null);
  const challengeType: ChallengeType | undefined =
    request?.kind !== 'challenge'
      ? undefined
      : request.replyTo
        ? request.replyTo.challengeType
        : (pickedChallengeType ?? (consistency ? 'consistency' : 'time'));

  const showTime = prefs.includeTime;
  const showDistance = prefs.includeDistance;
  const showPace = prefs.includePace;
  const showResult = hasResult && (showTime || showDistance || showPace);
  const textOptions = { includeResult: showResult, includeSplits: false };
  const subject = request ? { ...request, challengeType } : null;

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    setCaptionEdited(false);
    setNotice(null);
    setPickedChallengeType(null);
    createdLink.current = null;
    track('share_sheet_opened', { share_type: request.kind, surface: request.surface });
    (async () => {
      const [loaded, settings] = await Promise.all([loadSharePreferences(), loadSettings().catch(() => DEFAULT_SETTINGS)]);
      if (cancelled) return;
      setPrefs(loaded);
      setPaceUnit(settings.paceUnit);
    })();
    return () => { cancelled = true; };
  }, [request, user]);

  useEffect(() => {
    if (!subject || captionEdited || !isWorkoutShare) return;
    setCaption(defaultCaption(subject, textOptions, paceUnit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, captionEdited, showResult, paceUnit, challengeType, isWorkoutShare]);

  const updatePrefs = (partial: Partial<SharePreferences>) => {
    const next = { ...prefs, ...partial };
    setPrefs(next);
    saveSharePreferences(next);
  };

  const ensureLink = useCallback(async () => {
    if (!request) return { link: null };
    const key = JSON.stringify([showTime, showDistance, showPace, challengeType]);
    if (createdLink.current?.key === key) return createdLink.current;

    let link: CreatedShareLink | null = null;
    if (request.workout) {
      const code = generateShortCode();
      let result: SharedResult | undefined = showResult && run ? resultOf(run) : undefined;
      if (result && request.kind === 'challenge' && consistency) {
        result = { ...result, consistency: consistency.score, repPaces: consistency.repPaces };
      }
      const achievement = request.kind === 'achievement' ? request.achievement : undefined;
      link = await createShareLink(
        { ...request.workout, name: request.workoutName || request.workout.name },
        {
          kind: request.kind,
          plannedDate: request.plannedDate,
          result,
          challengeType,
          achievement: achievement ? { id: achievement.id, label: achievement.label, value: achievement.value } : undefined,
          parentCode: request.replyTo?.code ?? request.workout.sharedFrom?.code,
        },
        { code },
      );
    }
    createdLink.current = { key, link };
    return createdLink.current;
  }, [request, showTime, showDistance, showPace, showResult, challengeType, consistency, run]);

  const trackShare = (method: ShareMethod, link: CreatedShareLink | null) => {
    if (!request) return;
    track('workout_shared', {
      workout_id: request.workout?.id ?? request.run?.workoutId,
      workout_name: request.workoutName,
      share_type: request.kind,
      surface: request.surface,
      method,
      share_code: link?.code ?? null,
      has_link: !!link,
      include_time: showTime,
      include_distance: showDistance,
      include_pace: showPace,
      challenge_type: challengeType ?? null,
      consistency_score: consistency?.score ?? null,
      is_reply: !!request.replyTo,
    });
  };

  const paceprintOptions: PaceprintShareOptions = {
    includeTime: showTime,
    includeDistance: showDistance,
    includePace: showPace,
  };

  const getShareText = (): string => {
    if (!subject) return '';
    if (isAchievementShare) return composeAchievementText(subject);
    if (isRunShare) return composePaceprintText(subject, paceprintOptions, paceUnit);
    return composeShareMessage(caption, composeShareBody(subject, textOptions, paceUnit));
  };

  const handleShare = async (method: ShareMethod) => {
    if (!request || busy) return;
    hapticTap();
    setBusy(method);
    setNotice(null);
    try {
      const { link } = await ensureLink();
      const text = getShareText();
      const url = link?.url;

      if (method === 'copy') {
        await Clipboard.setStringAsync([text, url].filter(Boolean).join('\n'));
        setNotice('Copied!');
        trackShare(method, link);
        return;
      }

      // method === 'link': share via system share sheet
      const result = await Share.share(
        Platform.OS === 'ios'
          ? url ? { message: text, url } : { message: text }
          : { message: url ? `${text}\n${url}` : text, title: TITLES[request.kind] },
      );
      if (result.action === Share.sharedAction) {
        trackShare(method, link);
        onShared?.(request);
        onClose();
      }
    } catch {
      setNotice('Sharing didn\'t work. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  if (!request) return null;

  // ── Run share or Achievement: text-only paceprint ──
  if (isRunShare || isAchievementShare) {
    return (
      <Modal visible animationType="slide" transparent onRequestClose={onClose}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} accessibilityLabel="Close" />
          <SheetContainer style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.md }]} onDismiss={onClose}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>{TITLES[request.kind]}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Live paceprint text preview */}
              <View style={styles.textPreview}>
                <Text style={styles.textPreviewContent} selectable>
                  {getShareText()}
                </Text>
              </View>

              {challengeTypes.length > 1 && (
                <ChipRow
                  label="Challenge"
                  options={challengeTypes.map((t) => ({ value: t, label: CHALLENGE_LABELS[t] }))}
                  value={challengeType ?? 'time'}
                  onChange={(t) => {
                    hapticTap();
                    setPickedChallengeType(t);
                  }}
                />
              )}

              {hasResult && isRunShare && (
                <>
                  <Text style={styles.label}>Include</Text>
                  <View style={styles.group}>
                    <ToggleRow
                      label="Time"
                      value={prefs.includeTime}
                      onChange={(v) => updatePrefs({ includeTime: v })}
                    />
                    <ToggleRow
                      label="Distance"
                      value={prefs.includeDistance}
                      onChange={(v) => updatePrefs({ includeDistance: v })}
                    />
                    <ToggleRow
                      label="Pace"
                      value={prefs.includePace}
                      onChange={(v) => updatePrefs({ includePace: v })}
                    />
                  </View>
                </>
              )}

              {notice && <Text style={styles.notice}>{notice}</Text>}

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => handleShare('link')}
                  disabled={!!busy}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                >
                  {busy === 'link' ? (
                    <ActivityIndicator color={Colors.black} />
                  ) : (
                    <>
                      <Ionicons name="paper-plane" size={16} color={Colors.black} />
                      <Text style={styles.primaryBtnText}>
                        {request.kind === 'challenge' ? 'Send Challenge' : 'Share'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => handleShare('copy')}
                  disabled={!!busy}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                >
                  {busy === 'copy' ? (
                    <ActivityIndicator color={Colors.textPrimary} size="small" />
                  ) : (
                    <>
                      <Ionicons name="copy-outline" size={16} color={Colors.textPrimary} />
                      <Text style={styles.secondaryBtnText}>Copy</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </SheetContainer>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  // ── Structure / Planned share: legacy flow ──
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} accessibilityLabel="Close" />
        <SheetContainer style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.md }]} onDismiss={onClose}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{TITLES[request.kind]}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.label}>Message</Text>
            <TextInput
              style={styles.caption}
              value={caption}
              onChangeText={(text) => {
                setCaption(text);
                setCaptionEdited(true);
              }}
              multiline
              maxLength={280}
              textAlignVertical="top"
              placeholderTextColor={Colors.textMuted}
              accessibilityLabel="Share message"
            />

            {notice && <Text style={styles.notice}>{notice}</Text>}

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => handleShare('link')}
              disabled={!!busy}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              {busy === 'link' ? (
                <ActivityIndicator color={Colors.black} />
              ) : (
                <>
                  <Ionicons name="paper-plane" size={16} color={Colors.black} />
                  <Text style={styles.primaryBtnText}>Share</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, { marginTop: Spacing.sm }]}
              onPress={() => handleShare('copy')}
              disabled={!!busy}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              {busy === 'copy' ? (
                <ActivityIndicator color={Colors.textPrimary} size="small" />
              ) : (
                <>
                  <Ionicons name="copy-outline" size={16} color={Colors.textPrimary} />
                  <Text style={styles.secondaryBtnText}>{request.workout ? 'Copy Link' : 'Copy Text'}</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SheetContainer>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: Colors.surfaceLight, true: Colors.primaryDim }}
        thumbColor={Colors.white}
        accessibilityLabel={label}
      />
    </View>
  );
}

function ChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipRow} accessibilityRole="radiogroup">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onChange(option.value)}
              activeOpacity={0.7}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

export function useShareSheet(onShared?: (request: ShareRequest) => void) {
  const [request, setRequest] = useState<ShareRequest | null>(null);
  const openShare = useCallback((next: ShareRequest) => setRequest(next), []);
  const close = useCallback(() => setRequest(null), []);
  const shareSheet = <ShareSheet request={request} onClose={close} onShared={onShared} />;
  return { openShare, shareSheet };
}

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
    maxHeight: '92%',
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerTitle: {
    flexShrink: 1,
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  textPreview: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  textPreviewContent: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    lineHeight: 24,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },
  caption: {
    minHeight: 64,
    padding: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  group: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  toggleLabel: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.surface,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '22',
  },
  chipText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.primary,
  },
  notice: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  buttonRow: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 6,
    marginTop: Spacing.md,
    minHeight: 48,
  },
  primaryBtnText: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.black,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 4,
    minHeight: 44,
  },
  secondaryBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
});
