import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatTime } from '../workout/workoutTypes';
import { FontSize, MaxFontScale, Spacing } from '../constants/theme';
import { intervalColor } from '../constants/theme';

interface TimerProps {
  remainingSeconds: number;
  intervalType: string;
  label: string;
}

export function Timer({ remainingSeconds, intervalType, label }: TimerProps) {
  const color = intervalColor(intervalType);

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color }]} maxFontSizeMultiplier={MaxFontScale.display}>
        {label.toUpperCase()}
      </Text>
      <Text
        style={[styles.time, { color }]}
        maxFontSizeMultiplier={MaxFontScale.timer}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {formatTime(remainingSeconds)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  label: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  time: {
    fontSize: FontSize.timer,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
  },
});
