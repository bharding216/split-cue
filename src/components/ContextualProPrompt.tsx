/**
 * ContextualProPrompt — Non-intrusive Pro upgrade prompt.
 *
 * Displays as a dismissible card in context (e.g. after a workout,
 * on the training tab, on the predictions screen). Respects the
 * global 7-day cooldown and per-moment 30-day cooldown.
 *
 * Usage:
 *   <ContextualProPrompt
 *     momentId="post_workout_analysis"
 *     onUpgrade={() => router.push('/paywall')}
 *   />
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useLargeText } from '../hooks/useLargeText';
import {
  type PromptMomentId,
  PROMPT_MOMENTS,
  getAvailablePrompt,
  recordPromptShown,
  recordPromptDismissed,
  recordPromptTapped,
} from '../subscription/proPrompts';

interface Props {
  momentId: PromptMomentId;
  onUpgrade: () => void;
}

export function ContextualProPrompt({ momentId, onUpgrade }: Props) {
  const { tier } = useSubscription();
  const [visible, setVisible] = useState(false);
  const [moment, setMoment] = useState(PROMPT_MOMENTS[momentId]);
  const large = useLargeText();

  useEffect(() => {
    if (tier === 'pro') return;

    let cancelled = false;
    getAvailablePrompt(momentId).then((result) => {
      if (cancelled) return;
      if (result) {
        setMoment(result);
        setVisible(true);
        recordPromptShown(momentId);
      }
    });

    return () => { cancelled = true; };
  }, [tier, momentId]);

  const handleDismiss = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setVisible(false);
    recordPromptDismissed(momentId);
  }, [momentId]);

  const handleUpgrade = useCallback(() => {
    recordPromptTapped(momentId);
    onUpgrade();
  }, [momentId, onUpgrade]);

  if (!visible || tier === 'pro') return null;

  return (
    <View style={styles.container}>
      {/* Dismiss button */}
      <TouchableOpacity
        style={styles.dismissBtn}
        onPress={handleDismiss}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={8}
      >
        <Ionicons name="close" size={16} color={Colors.textMuted} />
      </TouchableOpacity>

      {/* Icon + content */}
      <View style={[styles.content, large && styles.contentLarge]}>
        <View style={styles.iconCircle}>
          <Ionicons name={moment.icon as any} size={24} color={Colors.accent} />
        </View>
        <View style={[styles.textContent, large && styles.textContentLarge]}>
          <Text style={styles.title}>{moment.title}</Text>
          <Text style={styles.message}>{moment.message}</Text>
        </View>
      </View>

      {/* CTA */}
      <TouchableOpacity style={styles.ctaBtn} onPress={handleUpgrade} activeOpacity={0.8} accessibilityRole="button">
        <Ionicons name="sparkles" size={14} color={Colors.black} />
        <Text style={styles.ctaText}>{moment.ctaLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.accent + '25',
    position: 'relative',
  },
  dismissBtn: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  content: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
    paddingRight: Spacing.lg,
  },
  contentLarge: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.accent + '15',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textContent: {
    flex: 1,
  },
  textContentLarge: {
    flex: 0,
    alignSelf: 'stretch',
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  message: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2,
    gap: Spacing.xs,
  },
  ctaText: {
    flexShrink: 1,
    textAlign: 'center',
    color: Colors.black,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
});
