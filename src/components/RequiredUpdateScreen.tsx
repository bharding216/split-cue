import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { Colors } from '../constants/theme';
import { track } from '../analytics/track';
import { openStoreListing } from '../updates/requiredUpdate';

/** Full-screen block shown when this store build is below the supported minimum. */
export function RequiredUpdateScreen() {
  useEffect(() => {
    track('update_required_shown', { runtime_version: Updates.runtimeVersion });
  }, []);

  const onUpdate = () => {
    track('update_required_tapped', { runtime_version: Updates.runtimeVersion });
    openStoreListing().catch(() => {});
  };

  return (
    <View style={styles.container} accessibilityViewIsModal>
      <Text style={styles.title}>Update Required</Text>
      <Text style={styles.body}>
        This version of SplitCue is no longer supported. Update to the latest version to keep
        getting new features and fixes.
      </Text>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={onUpdate}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Update SplitCue</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    zIndex: 1000,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    color: Colors.textSecondary,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: Colors.black,
    fontSize: 17,
    fontWeight: '700',
  },
});
