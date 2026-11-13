/**
 * AchievementMomentCard — the celebration at the top of the workout-complete
 * screen when a run sets a record or earns a milestone worth sharing.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../constants/theme';
import { hapticTap } from '../audio/haptics';
import type { AchievementMoment } from '../sharing/shareText';

interface Props {
  moment: AchievementMoment;
  onShare: () => void;
}

export function AchievementMomentCard({ moment, onShare }: Props) {
  return (
    <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.card}>
      <View style={styles.kicker}>
        <Ionicons name="trophy" size={13} color={Colors.black} />
        <Text style={styles.kickerText}>{moment.kicker}</Text>
      </View>
      <Text
        style={styles.value}
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={MaxFontScale.timer}
        accessibilityLabel={`${moment.label}: ${moment.value}`}
      >
        {moment.value}
      </Text>
      <Text style={styles.label} maxFontSizeMultiplier={MaxFontScale.display}>{moment.label}</Text>
      <Text style={styles.message}>{moment.message}</Text>

      {moment.totals?.length ? (
        <View style={styles.totals}>
          {moment.totals.map((t) => (
            <View key={t.label} style={styles.total}>
              <Text style={styles.totalValue}>{t.value}</Text>
              <Text style={styles.totalLabel}>{t.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

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
        <Text style={styles.buttonText}>Share It</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.warning + '66',
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  kicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.warning,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  kickerText: {
    color: Colors.black,
    fontSize: FontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    marginTop: Spacing.sm,
    fontSize: 64,
    fontWeight: '900',
    color: Colors.warning,
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    marginTop: Spacing.xs,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  totals: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.xl,
    marginTop: Spacing.md,
  },
  total: {
    alignItems: 'center',
  },
  totalValue: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  totalLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    alignSelf: 'stretch',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 4,
    marginTop: Spacing.md,
    minHeight: 44,
  },
  buttonText: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.black,
  },
});
