/**
 * PostRunShareCard — compact share prompt on the workout-complete screen.
 * Sharing the run and challenging a friend both open the share sheet.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { hapticTap } from '../audio/haptics';
import { useLargeText } from '../hooks/useLargeText';

interface Props {
  /** Set when the run earned a record or award. */
  achievement: boolean;
  onShare: () => void;
  onChallenge: () => void;
}

export function PostRunShareCard({ achievement, onShare, onChallenge }: Props) {
  const large = useLargeText();
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{achievement ? 'Share your new PR' : 'Share your run'}</Text>
      <Text style={styles.message}>Send the workout to a friend and see who runs it better.</Text>
      <View style={[styles.row, large && styles.rowLarge]}>
        <TouchableOpacity
          style={[styles.button, styles.primary]}
          onPress={() => {
            hapticTap();
            onShare();
          }}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Ionicons name="share-outline" size={16} color={Colors.black} />
          <Text style={styles.primaryText}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.secondary]}
          onPress={() => {
            hapticTap();
            onChallenge();
          }}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Ionicons name="people-outline" size={16} color={Colors.primary} />
          <Text style={styles.secondaryText}>Challenge a Friend</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  message: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginTop: 2,
    marginBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  rowLarge: {
    flexDirection: 'column',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    minHeight: 40,
  },
  primary: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  secondary: {
    flex: 1.4,
    borderWidth: 1.5,
    borderColor: Colors.primary + '66',
  },
  primaryText: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.black,
  },
  secondaryText: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.primary,
  },
});
