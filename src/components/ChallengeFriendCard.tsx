/**
 * ChallengeFriendCard — prompt to send a finished workout to a friend as a
 * result to beat. Opens the share sheet in challenge mode via `onPress`.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { hapticTap } from '../audio/haptics';
import { useLargeText } from '../hooks/useLargeText';

interface Props {
  /** The runner's result, e.g. "32:10 · 4.02 mi · 8:00/mi". */
  mark: string | null;
  /** Whether a challenge was already sent from this screen. */
  sent: boolean;
  /** Set when this workout came from a friend; the challenge goes back to them. */
  replyToName?: string;
  onPress: () => void;
}

export function ChallengeFriendCard({ mark, sent, replyToName, onPress }: Props) {
  const large = useLargeText();
  const isReply = replyToName != null;

  const title = isReply ? `Send it back to ${replyToName || 'your friend'}` : 'Challenge a friend';
  const message = sent
    ? 'Challenge sent. Pass it to someone else and see who comes out ahead.'
    : isReply
      ? 'Let them know how you did on their workout.'
      : 'Send this workout and your result. See who runs it better.';

  return (
    <View style={styles.card}>
      <View style={[styles.row, large && styles.rowLarge]}>
        <View style={styles.iconCircle}>
          <Ionicons name="people" size={22} color={Colors.primary} />
        </View>
        <View style={[styles.text, large && styles.textLarge]}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          {mark ? <Text style={styles.mark}>Your mark · {mark}</Text> : null}
        </View>
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          hapticTap();
          onPress();
        }}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={sent ? 'Send challenge to someone else' : 'Send challenge'}
      >
        <Ionicons name={sent ? 'paper-plane' : 'paper-plane-outline'} size={16} color={Colors.black} />
        <Text style={styles.buttonText}>
          {sent ? 'Send to someone else' : isReply ? 'Send my result' : 'Send challenge'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    marginTop: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  rowLarge: {
    flexDirection: 'column',
    gap: Spacing.sm,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
  textLarge: {
    flexGrow: 0,
    flexBasis: 'auto',
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
  mark: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
    minHeight: 40,
  },
  buttonText: {
    flexShrink: 1,
    textAlign: 'center',
    color: Colors.black,
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
});
