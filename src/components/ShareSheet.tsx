/**
 * ShareSheet — the one place workouts and runs are shared from.
 *
 * Shows a preview of the share card, an editable caption, and switches for
 * what the share reveals (name, result, splits, route). Switch choices are
 * remembered as defaults. Sends a link through the system share sheet, the
 * card image (for Stories and the like), or copies the link.
 *
 * Render `shareSheet` from `useShareSheet()` in the screen that shares, so the
 * sheet presents above that screen even when it's a modal.
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
import { hapticTap } from '../audio/haptics';
import { track } from '../analytics/track';
import { useAuth } from '../contexts/AuthContext';
import { loadSettings } from '../workout/workoutStorage';
import { DEFAULT_SETTINGS } from '../workout/workoutTypes';
import type { PaceUnit } from '../pace/paceTypes';
import type { AwardBadge, PersonalRecord } from '../stats/personalRecords';
import {
  composeShareBody,
  composeShareMessage,
  defaultCaption,
  resultOf,
  type ShareSubject,
} from '../sharing/shareText';
import { createShareLink, generateShortCode, SENDER_NAME_MAX_LENGTH, type CreatedShareLink } from '../sharing/shareWorkout';
import {
  DEFAULT_SHARE_PREFERENCES,
  loadProfileFirstName,
  loadSharePreferences,
  saveSharePreferences,
  type SharePreferences,
} from '../sharing/sharePreferences';
import {
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  canCaptureShareCards,
  captureShareCard,
  uploadShareCard,
} from '../sharing/shareCardImage';
import { trimRouteForPrivacy } from '../sharing/routeOutline';
import { computeIntervalConsistency } from '../stats/intervalConsistency';
import type { ChallengeType, SharedResult } from '../workout/workoutTypes';
import { ShareCard, type ShareCardVariant } from './ShareCard';

const VARIANT_LABELS: Record<ShareCardVariant, string> = {
  performance: 'Stats',
  route: 'Route',
  intervals: 'Intervals',
  achievement: 'Milestone',
};

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

type ShareMethod = 'link' | 'image' | 'copy';

const TITLES: Record<ShareSubject['kind'], string> = {
  structure: 'Share Workout',
  planned: 'Share Planned Run',
  results: 'Share Your Run',
  challenge: 'Challenge a Friend',
  achievement: 'Share Your Achievement',
};

function badgeFor(request: ShareRequest): string | undefined {
  const record = request.records?.[0];
  if (record) return `New PR · ${record.label} ${record.displayValue}${record.unit ?? ''}`;
  const award = request.awards?.[0];
  return award ? `Award · ${award.label}` : undefined;
}

interface ShareSheetProps {
  request: ShareRequest | null;
  onClose: () => void;
  /** Called after the system share sheet reports a completed share. */
  onShared?: (request: ShareRequest) => void;
}

export function ShareSheet({ request, onClose, onShared }: ShareSheetProps) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const cardRef = useRef<View>(null);
  const canCapture = useMemo(() => canCaptureShareCards(), []);

  const [prefs, setPrefs] = useState<SharePreferences>(DEFAULT_SHARE_PREFERENCES);
  const [paceUnit, setPaceUnit] = useState<PaceUnit>(DEFAULT_SETTINGS.paceUnit);
  const [caption, setCaption] = useState('');
  const [captionEdited, setCaptionEdited] = useState(false);
  const [busy, setBusy] = useState<ShareMethod | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Link already created for the current choices, reused across buttons. */
  const createdLink = useRef<{ key: string; link: CreatedShareLink | null; imageUri: string | null } | null>(null);

  const run = request?.run;
  const hasResult =
    !!run &&
    run.totalDurationMs > 0 &&
    (request?.kind === 'results' || request?.kind === 'challenge' || request?.kind === 'achievement');
  const hasSplits = hasResult && (run?.splits?.length ?? 0) > 1;
  const hasRoute = hasResult && trimRouteForPrivacy(run?.route ?? []).length > 0;

  const showResult = hasResult && prefs.includeResult;
  const showSplits = showResult && hasSplits && prefs.includeSplits;
  const senderName = prefs.includeName ? prefs.senderName.trim() : '';

  const consistency = useMemo(
    () => (hasResult ? computeIntervalConsistency(run?.splits) : null),
    [hasResult, run?.splits],
  );
  const variants = useMemo<ShareCardVariant[]>(() => {
    if (!request) return [];
    const list: ShareCardVariant[] = [];
    if (request.achievement) list.push('achievement');
    list.push('performance');
    if (showResult && consistency) list.push('intervals');
    if (showResult && hasRoute) list.push('route');
    return list;
  }, [request, showResult, consistency, hasRoute]);

  // Replies keep the original challenge's type; new challenges default to consistency when it can be scored.
  const challengeTypes: ChallengeType[] =
    request?.kind === 'challenge' && !request.replyTo && consistency ? ['consistency', 'time'] : [];
  const [pickedChallengeType, setPickedChallengeType] = useState<ChallengeType | null>(null);
  const challengeType: ChallengeType | undefined =
    request?.kind !== 'challenge'
      ? undefined
      : request.replyTo
        ? request.replyTo.challengeType
        : (pickedChallengeType ?? (consistency ? 'consistency' : 'time'));

  const [pickedVariant, setPickedVariant] = useState<ShareCardVariant | null>(null);
  const defaultVariant: ShareCardVariant = request?.achievement
    ? 'achievement'
    : challengeType === 'consistency' && consistency
      ? 'intervals'
      : 'performance';
  const variant: ShareCardVariant =
    pickedVariant && variants.includes(pickedVariant) ? pickedVariant : defaultVariant;

  // Picking the route card opts this share in to the route, still with its ends hidden.
  const showRoute = showResult && hasRoute && (prefs.includeRoute || variant === 'route');
  const textOptions = { includeResult: showResult, includeSplits: showSplits };
  const subject = request ? { ...request, challengeType } : null;

  // Load preferences and units each time the sheet opens.
  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    setCaptionEdited(false);
    setNotice(null);
    setPickedVariant(null);
    setPickedChallengeType(null);
    createdLink.current = null;
    track('share_sheet_opened', { share_type: request.kind, surface: request.surface });
    (async () => {
      const [loaded, settings] = await Promise.all([loadSharePreferences(), loadSettings().catch(() => DEFAULT_SETTINGS)]);
      let next = loaded;
      if (!loaded.senderName && user) {
        const profileName = await loadProfileFirstName(user.id);
        if (profileName) next = { ...loaded, senderName: profileName };
      }
      if (cancelled) return;
      setPrefs(next);
      setPaceUnit(settings.paceUnit);
    })();
    return () => {
      cancelled = true;
    };
  }, [request, user]);

  // Keep the default caption in step with the switches until the runner edits it.
  useEffect(() => {
    if (!subject || captionEdited) return;
    setCaption(defaultCaption(subject, textOptions, paceUnit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, captionEdited, showResult, showSplits, paceUnit, challengeType]);

  const updatePrefs = (partial: Partial<SharePreferences>) => {
    const next = { ...prefs, ...partial };
    setPrefs(next);
    saveSharePreferences(next);
  };

  /** Create the link (and upload the card) once per set of choices. */
  const ensureLink = useCallback(async () => {
    if (!request) return { link: null, imageUri: null };
    const key = JSON.stringify([senderName, showResult, showSplits, showRoute, variant, challengeType]);
    if (createdLink.current?.key === key) return createdLink.current;

    const imageUri = canCapture ? await captureShareCard(cardRef) : null;
    let link: CreatedShareLink | null = null;
    if (request.workout) {
      const code = generateShortCode();
      const imagePath = imageUri ? await uploadShareCard(code, imageUri) : null;
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
          senderName: senderName || undefined,
          result,
          challengeType,
          achievement: achievement ? { id: achievement.id, label: achievement.label, value: achievement.value } : undefined,
          parentCode: request.replyTo?.code ?? request.workout.sharedFrom?.code,
        },
        { code, imagePath },
      );
    }
    createdLink.current = { key, link, imageUri };
    return createdLink.current;
  }, [request, senderName, showResult, showSplits, showRoute, variant, challengeType, consistency, canCapture, run]);

  const trackShare = (method: ShareMethod, link: CreatedShareLink | null, imageUri: string | null) => {
    if (!request) return;
    track('workout_shared', {
      workout_id: request.workout?.id ?? request.run?.workoutId,
      workout_name: request.workoutName,
      share_type: request.kind,
      surface: request.surface,
      method,
      share_code: link?.code ?? null,
      has_link: !!link,
      has_image: !!imageUri,
      include_name: !!senderName,
      include_result: showResult,
      include_splits: showSplits,
      include_route: showRoute,
      card_variant: imageUri ? variant : null,
      challenge_type: challengeType ?? null,
      consistency_score: consistency?.score ?? null,
      is_reply: !!request.replyTo,
      caption_edited: captionEdited,
    });
  };

  const handleShare = async (method: ShareMethod) => {
    if (!request || busy) return;
    hapticTap();
    setBusy(method);
    setNotice(null);
    try {
      const { link, imageUri } = await ensureLink();
      const message = composeShareMessage(caption, composeShareBody(subject ?? request, textOptions, paceUnit));
      const url = link?.url;

      if (method === 'copy') {
        await Clipboard.setStringAsync(url ?? message);
        setNotice(url ? 'Link copied.' : 'Message copied.');
        trackShare(method, link, imageUri);
        return;
      }

      if (method === 'image' && imageUri) {
        await Clipboard.setStringAsync([caption.trim(), url].filter(Boolean).join('\n'));
        setNotice('Caption and link copied. Paste them with the image.');
        await Sharing.shareAsync(imageUri, {
          mimeType: 'image/png',
          UTI: 'public.png',
          dialogTitle: TITLES[request.kind],
        });
        trackShare(method, link, imageUri);
        return;
      }

      const lead = request.kind === 'planned' ? 'Add it to your SplitCue calendar:' : 'Open it in SplitCue:';
      const result = await Share.share(
        Platform.OS === 'ios'
          ? url
            ? { message: `${message}\n\n${lead}`, url }
            : { message }
          : { message: url ? `${message}\n\n${lead}\n${url}` : message, title: TITLES[request.kind] },
      );
      if (result.action === Share.sharedAction) {
        trackShare(method, link, imageUri);
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

  const previewWidth = Math.min(screenWidth - Spacing.lg * 2, 260, (screenHeight * 0.36 * SHARE_CARD_WIDTH) / SHARE_CARD_HEIGHT);
  const scale = previewWidth / SHARE_CARD_WIDTH;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.md }]}>
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>
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
            {canCapture && (
              <View style={[styles.preview, { width: previewWidth, height: SHARE_CARD_HEIGHT * scale }]}>
                <View
                  style={{
                    width: SHARE_CARD_WIDTH,
                    height: SHARE_CARD_HEIGHT,
                    transform: [
                      { translateX: (previewWidth - SHARE_CARD_WIDTH) / 2 },
                      { translateY: (SHARE_CARD_HEIGHT * scale - SHARE_CARD_HEIGHT) / 2 },
                      { scale },
                    ],
                  }}
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                >
                  <ShareCard
                    ref={cardRef}
                    subject={subject ?? request}
                    paceUnit={paceUnit}
                    senderName={senderName || undefined}
                    showResult={showResult}
                    showSplits={showSplits}
                    showRoute={showRoute}
                    badge={showResult ? badgeFor(request) : undefined}
                    variant={variant}
                    consistency={consistency}
                  />
                </View>
              </View>
            )}

            {canCapture && variants.length > 1 && (
              <ChipRow
                label="Card"
                options={variants.map((v) => ({ value: v, label: VARIANT_LABELS[v] }))}
                value={variant}
                onChange={(v) => {
                  hapticTap();
                  setPickedVariant(v);
                }}
              />
            )}

            {challengeTypes.length > 1 && (
              <ChipRow
                label="Challenge"
                options={challengeTypes.map((t) => ({ value: t, label: CHALLENGE_LABELS[t] }))}
                value={challengeType ?? 'time'}
                onChange={(t) => {
                  hapticTap();
                  setPickedChallengeType(t);
                  if (t === 'consistency') setPickedVariant('intervals');
                }}
              />
            )}

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

            <Text style={styles.label}>Include</Text>
            <View style={styles.group}>
              <ToggleRow
                label="My name"
                value={prefs.includeName}
                onChange={(v) => updatePrefs({ includeName: v })}
              />
              {prefs.includeName && (
                <TextInput
                  style={styles.nameInput}
                  value={prefs.senderName}
                  onChangeText={(text) => updatePrefs({ senderName: text })}
                  placeholder="Your first name"
                  placeholderTextColor={Colors.textMuted}
                  maxLength={SENDER_NAME_MAX_LENGTH}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  accessibilityLabel="Name shown on shares"
                />
              )}
              {hasResult && (
                <ToggleRow
                  label="Time, distance, and pace"
                  value={prefs.includeResult}
                  onChange={(v) => updatePrefs({ includeResult: v })}
                />
              )}
              {hasSplits && showResult && (
                <ToggleRow
                  label="Splits"
                  value={prefs.includeSplits}
                  onChange={(v) => updatePrefs({ includeSplits: v })}
                />
              )}
              {hasRoute && showResult && variant !== 'route' && (
                <ToggleRow
                  label="Route shape"
                  hint="Start and finish are always hidden"
                  value={prefs.includeRoute}
                  onChange={(v) => updatePrefs({ includeRoute: v })}
                />
              )}
            </View>

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
                  <Text style={styles.primaryBtnText}>
                    {request.kind === 'challenge' ? 'Send Challenge' : 'Share'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.secondaryRow}>
              {canCapture && (
                <SecondaryButton
                  icon="image-outline"
                  label="Share Image"
                  busy={busy === 'image'}
                  disabled={!!busy}
                  onPress={() => handleShare('image')}
                />
              )}
              <SecondaryButton
                icon="link-outline"
                label={request.workout ? 'Copy Link' : 'Copy Text'}
                busy={busy === 'copy'}
                disabled={!!busy}
                onPress={() => handleShare('copy')}
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint ? <Text style={styles.toggleHint}>{hint}</Text> : null}
      </View>
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

function SecondaryButton({
  icon,
  label,
  busy,
  disabled,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.secondaryBtn}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
    >
      {busy ? (
        <ActivityIndicator color={Colors.textPrimary} size="small" />
      ) : (
        <Ionicons name={icon} size={16} color={Colors.textPrimary} />
      )}
      <Text style={styles.secondaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

/** A share sheet for one screen: call `openShare`, and render `shareSheet`. */
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
  preview: {
    alignSelf: 'center',
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
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
  toggleText: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
  toggleHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
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
  nameInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.sm,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    marginBottom: Spacing.sm,
  },
  notice: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    marginTop: Spacing.md,
    textAlign: 'center',
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
  secondaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  secondaryBtn: {
    flexGrow: 1,
    flexBasis: 140,
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
