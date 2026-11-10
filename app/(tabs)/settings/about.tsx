/**
 * Share & Feedback — rate, share, send feedback, version info.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Platform,
  Share,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { Colors, Spacing, FontSize, BorderRadius } from '../../../src/constants/theme';
import { hapticTap } from '../../../src/audio/haptics';

const APP_STORE_URL =
  'https://apps.apple.com/us/app/pacecue-interval-timer/id6809834816';
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.surmount.pacecue';

export default function AboutSettingsScreen() {
  const handleShare = async () => {
    hapticTap();
    const storeUrl = Platform.OS === 'android' ? PLAY_STORE_URL : APP_STORE_URL;
    try {
      const pitch = 'Check out SplitCue — an interval timer for runners with audio pacing cues.';
      await Share.share(
        Platform.OS === 'ios'
          ? { message: pitch, url: storeUrl }
          : { message: `${pitch}\n\n${storeUrl}` },
      );
    } catch (_) {
      // User dismissed the share sheet
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionSub}>
        SplitCue is built by a solo developer with a passion for running. Your
        feedback helps shape the app for runners everywhere.
      </Text>

      <Text style={styles.sectionTitle}>Feedback</Text>
      <Text style={styles.sectionSub}>
        Have a feature request or found a bug? We'd love to hear from you.
      </Text>

      <TouchableOpacity
        style={styles.actionBtn}
        onPress={() => {
          hapticTap();
          const version = Constants.expoConfig?.version ?? '?';
          const subject = encodeURIComponent(
            `SplitCue Feedback (v${version})`,
          );
          Linking.openURL(
            `mailto:brandon@getsurmount.com?subject=${subject}`,
          );
        }}
        activeOpacity={0.7}
      >
        <Ionicons name="mail-outline" size={20} color={Colors.textPrimary} />
        <Text style={styles.actionBtnLabel}>Send Feedback</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionBtn, { marginTop: Spacing.sm }]}
        onPress={() => {
          hapticTap();
          // A button goes straight to the store: the in-app prompt is rate-limited
          // and may not appear, which would make the tap look broken.
          Linking.openURL(
            Platform.OS === 'android'
              ? `${PLAY_STORE_URL}&showAllReviews=true`
              : `${APP_STORE_URL}?action=write-review`,
          ).catch(() => {});
        }}
        activeOpacity={0.7}
      >
        <Ionicons name="star-outline" size={20} color={Colors.textPrimary} />
        <Text style={styles.actionBtnLabel}>Rate SplitCue</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionBtn, { marginTop: Spacing.sm }]}
        onPress={handleShare}
        activeOpacity={0.7}
      >
        <Ionicons name="share-outline" size={20} color={Colors.textPrimary} />
        <Text style={styles.actionBtnLabel}>Share SplitCue</Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          SplitCue v{Constants.expoConfig?.version ?? '?'}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  sectionSub: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
  },
  actionBtnLabel: {
    flexShrink: 1,
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  footer: {
    marginTop: Spacing.xxl * 2,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  footerText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
