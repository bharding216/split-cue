/**
 * PostRunShareCard — compact share prompt on the workout-complete screen.
 * A single "Share" button opens the share sheet.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { hapticTap } from '../audio/haptics';

interface Props {
  /** Set when the run earned a record or award. */
  achievement: boolean;
  onShare: () => void;
}

export function PostRunShareCard({ achievement, onShare }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{achievement ? 'Share your new PR' : 'Share your run'}</Text>
      <Text style={styles.message}>Send your paceprint to a friend.</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          hapticTap();
          onShare();
        }}
        activeOpacity={0.8}
        accessibilityRole="button"
      >
        <Ionicons name="share-outline" size={16} color={Colors.black} />
        <Text style={styles.buttonText}>Share</Text>
      </TouchableOpacity>
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
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    minHeight: 40,
    backgroundColor: Colors.primary,
  },
  buttonText: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.black,
  },
});
