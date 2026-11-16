import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { Colors } from '../constants/theme';
import { track } from '../analytics/track';
import { openStoreListing } from '../updates/requiredUpdate';

const DISMISSED_KEY = '@pacecue/update_banner_dismissed_version';

/**
 * Non-blocking banner shown once per new store version when the installed
 * build is behind `latest_version` but still above `min_version`.
 *
 * Dismissing stores the `latestVersion` so the banner won't reappear until
 * the remote latest_version is bumped again.
 */
export function OptionalUpdateBanner({ latestVersion }: { latestVersion: string }) {
  const [visible, setVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(100)).current;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const dismissed = await AsyncStorage.getItem(DISMISSED_KEY).catch(() => null);
      if (cancelled) return;
      if (dismissed === latestVersion) return;

      setVisible(true);
      track('update_suggested_shown', { runtime_version: Updates.runtimeVersion, latest_version: latestVersion });
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }).start();
    })();
    return () => { cancelled = true; };
  }, [latestVersion, slideAnim]);

  if (!visible) return null;

  const dismiss = async () => {
    track('update_suggested_dismissed', { runtime_version: Updates.runtimeVersion, latest_version: latestVersion });
    await AsyncStorage.setItem(DISMISSED_KEY, latestVersion).catch(() => {});
    Animated.timing(slideAnim, { toValue: 100, duration: 200, useNativeDriver: true }).start(() => {
      setVisible(false);
    });
  };

  const update = () => {
    track('update_suggested_tapped', { runtime_version: Updates.runtimeVersion, latest_version: latestVersion });
    openStoreListing().catch(() => {});
  };

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.content}>
        <Text style={styles.message}>A new version of SplitCue is available.</Text>
        <View style={styles.buttons}>
          <Pressable
            onPress={dismiss}
            style={({ pressed }) => [styles.dismissButton, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.dismissText}>Not Now</Text>
          </Pressable>
          <Pressable
            onPress={update}
            style={({ pressed }) => [styles.updateButton, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.updateText}>Update</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  content: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  message: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 14,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  dismissButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  dismissText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  updateButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  updateText: {
    color: Colors.black,
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
});
