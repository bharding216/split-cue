/**
 * PreRunHeartRateCard — the paired heart rate monitor's status before Start,
 * so the runner knows heart rate will be recorded. Renders nothing when no
 * monitor is paired. Keeps the monitor connected while shown.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../constants/theme';
import { hapticTap } from '../audio/haptics';
import { useHeartRateMonitor } from '../hooks/useHeartRateMonitor';
import { requestBluetoothAccess, retryHeartRateConnection } from '../heartRate/hrMonitor';
import { hrConnectionLabel } from './HeartRateBadge';

/** Show troubleshooting tips once connecting has taken this long. */
const SLOW_CONNECT_MS = 10_000;

export function PreRunHeartRateCard() {
  const router = useRouter();
  const { device, connection, bpm } = useHeartRateMonitor();
  const [slow, setSlow] = useState(false);

  const waiting = connection === 'connecting' || connection === 'lost';
  useEffect(() => {
    setSlow(false);
    if (!waiting) return;
    const timer = setTimeout(() => setSlow(true), SLOW_CONNECT_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  if (!device) return null;

  const connected = connection === 'connected';
  const statusColor = connected ? Colors.primary : waiting ? Colors.warning : Colors.textMuted;

  const connect = async () => {
    hapticTap();
    if ((await requestBluetoothAccess()) === 'ready') retryHeartRateConnection();
    else router.push('/(tabs)/settings/heart-rate');
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Ionicons name="heart" size={22} color={connected ? Colors.danger : Colors.textMuted} />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {device.name}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text style={[styles.status, { color: statusColor }]}>{hrConnectionLabel(connection)}</Text>
          </View>
        </View>
        {connected ? (
          <View style={styles.bpmBox} accessible accessibilityLabel={bpm != null ? `${bpm} beats per minute` : 'Waiting for heart rate'}>
            <Text style={styles.bpm} maxFontSizeMultiplier={MaxFontScale.display}>
              {bpm ?? '--'}
            </Text>
            <Text style={styles.bpmUnit}>BPM</Text>
          </View>
        ) : connection === 'off' ? (
          <TouchableOpacity onPress={connect} style={styles.connectBtn} accessibilityRole="button">
            <Text style={styles.connectText}>Connect</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {slow && waiting && (
        <Text style={styles.hint}>
          Make sure your strap is on, or heart rate broadcasting is turned on for a watch, and that
          it isn’t connected to another app. You can start anyway; heart rate is recorded once it
          connects.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  status: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  bpmBox: {
    alignItems: 'center',
    minWidth: 52,
  },
  bpm: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  bpmUnit: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },
  connectBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  connectText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.primary,
  },
  hint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    marginTop: Spacing.sm,
  },
});
