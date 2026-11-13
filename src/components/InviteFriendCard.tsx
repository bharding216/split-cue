/**
 * InviteFriendCard — one-time "Tell a friend" prompt on the workout-complete
 * screen, shown from the runner's third finished run.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { hapticTap } from '../audio/haptics';
import { shareSplitCue } from '../sharing/shareApp';

export function InviteFriendCard() {
  const [shared, setShared] = useState(false);

  return (
    <View style={styles.card}>
      <View style={styles.textCol}>
        <Text style={styles.title}>{shared ? 'Thanks for spreading the word!' : 'Know a runner who\'d like this?'}</Text>
        {!shared && (
          <Text style={styles.message}>Send them SplitCue. Workouts and audio cues are free.</Text>
        )}
      </View>
      {!shared && (
        <TouchableOpacity
          style={styles.button}
          onPress={async () => {
            hapticTap();
            if (await shareSplitCue('workout_complete_invite')) setShared(true);
          }}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Ionicons name="person-add-outline" size={16} color={Colors.primary} />
          <Text style={styles.buttonText}>Tell a Friend</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  textCol: {
    flexGrow: 1,
    flexBasis: 180,
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  message: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1.5,
    borderColor: Colors.primary + '66',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    minHeight: 40,
  },
  buttonText: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.primary,
  },
});
