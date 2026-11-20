/**
 * FeedbackHeaderButton — small message icon for the navigation header.
 *
 * Two exports:
 *
 * 1. `<FeedbackHeaderButton />` — self-contained component (icon + sheet).
 *    Use in a Tabs layout `headerRight` where the JS header can host a
 *    fragment with a Modal just fine.
 *
 * 2. `useFeedbackButton(screen)` — hook returning `{ button, sheet }`.
 *    Use inside native-stack screens: put `button` in headerRight and
 *    render `sheet` in the screen body so the Modal isn't inside the
 *    native iOS navigation bar (which adds a grey circle of its own).
 */

import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { FeedbackSheet } from './FeedbackSheet';
import { hapticTap } from '../audio/haptics';
import { Colors } from '../constants/theme';

/* ── Self-contained component (for Tabs / JS headers) ─────────────── */

interface FeedbackHeaderButtonProps {
  screen?: string;
}

export function FeedbackHeaderButton({ screen }: FeedbackHeaderButtonProps) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => {
          hapticTap();
          setVisible(true);
        }}
        hitSlop={8}
        style={styles.pressable}
        accessibilityRole="button"
        accessibilityLabel="Send feedback"
      >
        <Ionicons name="chatbubble-outline" size={22} color={Colors.textSecondary} />
      </Pressable>
      <FeedbackSheet
        visible={visible}
        onDismiss={() => setVisible(false)}
        screen={screen}
      />
    </>
  );
}

/* ── Hook (for native-stack screens) ──────────────────────────────── */

export function useFeedbackButton(screen?: string) {
  const [visible, setVisible] = useState(false);

  const open = useCallback(() => {
    hapticTap();
    setVisible(true);
  }, []);

  const button = (
    <Pressable
      onPress={open}
      hitSlop={8}
      style={styles.pressable}
      accessibilityRole="button"
      accessibilityLabel="Send feedback"
    >
      <Ionicons name="chatbubble-outline" size={22} color={Colors.black} />
    </Pressable>
  );

  const sheet = (
    <FeedbackSheet
      visible={visible}
      onDismiss={() => setVisible(false)}
      screen={screen}
    />
  );

  return { button, sheet };
}

const styles = StyleSheet.create({
  pressable: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
