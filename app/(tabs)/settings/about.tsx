/**
 * Help & Feedback — personal developer messaging and feedback form.
 * Rate and Share actions have moved to the main settings hub.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { Colors, Spacing, FontSize, BorderRadius } from '../../../src/constants/theme';
import { hapticTap } from '../../../src/audio/haptics';
import { FeedbackSheet } from '../../../src/components/FeedbackSheet';

export default function AboutSettingsScreen() {
  const [feedbackVisible, setFeedbackVisible] = useState(false);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        I{'\u2019'}m an independent developer and runner building SplitCue to make every run
        better. Your feedback directly influences what I build next. Thanks for being part
        of the journey!
      </Text>

      <Text style={styles.sectionTitle}>Feedback</Text>
      <Text style={styles.sectionSub}>
        Have a feature request or found a bug? I{'\u2019'}d love to hear from you.
      </Text>

      <TouchableOpacity
        style={styles.actionBtn}
        onPress={() => {
          hapticTap();
          setFeedbackVisible(true);
        }}
        activeOpacity={0.7}
      >
        <Ionicons name="chatbubble-ellipses-outline" size={20} color={Colors.textPrimary} />
        <Text style={styles.actionBtnLabel}>Send Feedback</Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          SplitCue v{Constants.expoConfig?.version ?? '?'}
        </Text>
      </View>

      <FeedbackSheet
        visible={feedbackVisible}
        onDismiss={() => setFeedbackVisible(false)}
        screen="settings/about"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  intro: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
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
