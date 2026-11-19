/**
 * SheetContainer — an Animated.View that renders the drag handle and adds
 * swipe-to-dismiss to any bottom sheet.
 *
 * Replaces the plain `<View style={styles.sheet}>` + handleRow pattern used
 * by every modal sheet in the app. Drop it in, remove the old handle markup,
 * and pass `onDismiss`.
 *
 * The pan gesture is attached to a dedicated drag zone at the top of the
 * sheet (the handle + some padding) so it never conflicts with ScrollViews
 * or FlatLists in the sheet body. The entire sheet translates as the user
 * drags.
 *
 * Uses React Native's built-in PanResponder + Animated so it works inside
 * `<Modal>` on both platforms without gesture-handler caveats.
 */

import React, { useRef } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Colors, Spacing } from '../constants/theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;
/** Distance the user must drag before the sheet dismisses on release. */
const DISMISS_THRESHOLD = 100;
/** Minimum downward velocity (px/ms) that triggers a dismiss even below the threshold. */
const DISMISS_VELOCITY = 0.4;

interface SheetContainerProps {
  /** Called when the user swipes down past the threshold. */
  onDismiss: () => void;
  /** Style applied to the animated sheet container (typically your existing sheet style). */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export function SheetContainer({ onDismiss, style, children }: SheetContainerProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const dismissed = useRef(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const panResponder = useRef(
    PanResponder.create({
      // Claim the gesture immediately on touch-start inside the drag zone.
      // This is critical: without it, the responder negotiation may still
      // forward the event to a ScrollView sitting below the drag zone.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dismissed.current = false;
      },
      onPanResponderMove: (_evt, { dy }) => {
        // Follow the finger downward; rubber-band resist upward drags.
        translateY.setValue(dy > 0 ? dy : dy * 0.15);
      },
      onPanResponderRelease: (_evt, { dy, vy }) => {
        if (
          !dismissed.current &&
          (dy > DISMISS_THRESHOLD || vy > DISMISS_VELOCITY)
        ) {
          dismissed.current = true;
          Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: 200,
            useNativeDriver: true,
          }).start(() => onDismissRef.current());
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 8,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 8,
        }).start();
      },
    }),
  ).current;

  return (
    <Animated.View style={[style, { transform: [{ translateY }] }]}>
      {/* Drag zone — the only area that captures the swipe gesture. */}
      <View style={styles.dragZone} {...panResponder.panHandlers}>
        <View style={styles.handle} />
      </View>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dragZone: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    minHeight: 56,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
  },
});
