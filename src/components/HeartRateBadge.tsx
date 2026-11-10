/**
 * HeartRateBadge — compact current heart rate with a connection dot.
 * Green when connected, amber while connecting or reconnecting, grey when off.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { HrConnection } from '../heartRate/hrTypes';
import { Colors, FontSize, MaxFontScale } from '../constants/theme';

export function hrConnectionLabel(connection: HrConnection): string {
  switch (connection) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting…';
    case 'lost':
      return 'Signal lost, reconnecting…';
    case 'off':
      return 'Not connected';
  }
}

function dotColor(connection: HrConnection): string {
  switch (connection) {
    case 'connected':
      return Colors.primary;
    case 'connecting':
    case 'lost':
      return Colors.warning;
    case 'off':
      return Colors.textMuted;
  }
}

interface Props {
  bpm: number | null;
  connection: HrConnection;
  size?: 'sm' | 'md';
}

export function HeartRateBadge({ bpm, connection, size = 'md' }: Props) {
  const live = connection === 'connected' && bpm != null;
  const fontSize = size === 'sm' ? FontSize.xs : FontSize.md;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={live ? `Heart rate ${bpm} beats per minute` : `Heart rate monitor ${hrConnectionLabel(connection)}`}
    >
      <Ionicons name="heart" size={fontSize + 2} color={live ? Colors.danger : Colors.textMuted} />
      <Text
        style={[styles.value, { fontSize }, !live && styles.valueMuted]}
        maxFontSizeMultiplier={MaxFontScale.display}
      >
        {live ? bpm : '--'}
      </Text>
      <View style={[styles.dot, { backgroundColor: dotColor(connection) }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  value: {
    color: Colors.textPrimary,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  valueMuted: {
    color: Colors.textMuted,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
