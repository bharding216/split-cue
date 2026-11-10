/**
 * Heart rate monitor settings — pair, check, and forget a Bluetooth heart rate monitor.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Spacing, FontSize, BorderRadius } from '../../../src/constants/theme';
import { hapticTap } from '../../../src/audio/haptics';
import { track } from '../../../src/analytics/track';
import {
  requestBluetoothAccess,
  retryHeartRateConnection,
  scanForHeartRateMonitors,
  setPairedHrDevice,
  type BluetoothStatus,
} from '../../../src/heartRate/hrMonitor';
import type { DiscoveredHrDevice } from '../../../src/heartRate/hrTypes';
import { useHeartRateMonitor } from '../../../src/hooks/useHeartRateMonitor';
import { hrConnectionLabel } from '../../../src/components/HeartRateBadge';

const SCAN_DURATION_MS = 15_000;

const ACCESS_MESSAGES: Record<Exclude<BluetoothStatus, 'ready'>, string> = {
  off: 'Bluetooth is off. Turn it on to find your heart rate monitor.',
  unauthorized: 'SplitCue needs Bluetooth access to connect to your heart rate monitor.',
  unsupported: 'Bluetooth isn’t available on this device.',
};

export default function HeartRateSettingsScreen() {
  const { device, connection, bpm } = useHeartRateMonitor();
  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState<DiscoveredHrDevice[]>([]);
  const [accessIssue, setAccessIssue] = useState<Exclude<BluetoothStatus, 'ready'> | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const stopScanRef = useRef<(() => void) | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopScan = useCallback(() => {
    stopScanRef.current?.();
    stopScanRef.current = null;
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    scanTimerRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => stopScan, [stopScan]);

  const startScan = async () => {
    hapticTap();
    setScanError(null);
    const status = await requestBluetoothAccess();
    if (status !== 'ready') {
      setAccessIssue(status);
      return;
    }
    setAccessIssue(null);
    retryHeartRateConnection();
    setFound([]);
    setScanning(true);
    stopScanRef.current = scanForHeartRateMonitors(
      (d) => setFound((prev) => [...prev, d]),
      (message) => {
        setScanError(message);
        stopScan();
      },
    );
    scanTimerRef.current = setTimeout(stopScan, SCAN_DURATION_MS);
  };

  const pair = async (d: DiscoveredHrDevice) => {
    hapticTap();
    stopScan();
    await setPairedHrDevice({ id: d.id, name: d.name });
    setFound([]);
    track('hr_device_paired', { device_name: d.name, replaced_device: !!device });
  };

  const forget = async () => {
    hapticTap();
    await setPairedHrDevice(null);
    track('hr_device_forgotten', {});
  };

  const visibleFound = found.filter((d) => d.id !== device?.id);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Record your heart rate during workouts with a Bluetooth heart rate monitor. You’ll see
        your average, max, and a heart rate graph on each run’s details.
      </Text>

      {device && (
        <>
          <Text style={styles.sectionTitle}>Your Monitor</Text>
          <View style={styles.deviceCard}>
            <Ionicons
              name="heart"
              size={26}
              color={connection === 'connected' ? Colors.danger : Colors.textMuted}
            />
            <View style={styles.deviceBody}>
              <Text style={styles.deviceName} numberOfLines={1}>
                {device.name}
              </Text>
              <Text style={styles.deviceStatus}>
                {connection === 'connected' && bpm != null
                  ? `Connected · ${bpm} bpm`
                  : hrConnectionLabel(connection)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={forget}
              style={styles.forgetButton}
              accessibilityRole="button"
              accessibilityLabel={`Forget ${device.name}`}
            >
              <Text style={styles.forgetText}>Forget</Text>
            </TouchableOpacity>
          </View>
          {connection !== 'connected' && (
            <Text style={styles.hint}>
              Put your strap on (most only turn on when they detect a heartbeat) or turn on heart
              rate broadcasting on your watch, and keep it near your phone.
            </Text>
          )}
        </>
      )}

      <Text style={styles.sectionTitle}>{device ? 'Use a Different Monitor' : 'Find Your Monitor'}</Text>
      <TouchableOpacity
        style={[styles.scanButton, scanning && styles.scanButtonActive]}
        onPress={scanning ? stopScan : startScan}
        activeOpacity={0.7}
        accessibilityRole="button"
      >
        {scanning ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <Ionicons name="bluetooth" size={18} color={Colors.primary} />
        )}
        <Text style={styles.scanText}>{scanning ? 'Searching… tap to stop' : 'Add Device'}</Text>
      </TouchableOpacity>

      {accessIssue && (
        <View style={styles.issueBox}>
          <Text style={styles.issueText}>{ACCESS_MESSAGES[accessIssue]}</Text>
          {accessIssue === 'unauthorized' && (
            <TouchableOpacity onPress={() => Linking.openSettings()} accessibilityRole="link">
              <Text style={styles.issueLink}>Open Settings</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {scanError && (
        <View style={styles.issueBox}>
          <Text style={styles.issueText}>Couldn’t search for monitors: {scanError}</Text>
        </View>
      )}

      {visibleFound.map((d) => (
        <TouchableOpacity
          key={d.id}
          style={styles.foundRow}
          onPress={() => pair(d)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Connect ${d.name}`}
        >
          <Ionicons name="heart-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.foundName} numberOfLines={1}>
            {d.name}
          </Text>
          <Text style={styles.connectText}>Connect</Text>
        </TouchableOpacity>
      ))}
      {!scanning && found.length === 0 && !accessIssue && !scanError && (
        <Text style={styles.hint}>
          Wear your strap while searching so it’s awake. Watches work too once heart rate
          broadcasting is on, such as Amazfit’s “Heart Rate Push” or Garmin’s “Broadcast Heart
          Rate”. No need to pair in your phone’s Bluetooth settings.
        </Text>
      )}

      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={18} color={Colors.accent} />
        <Text style={styles.infoText}>
          Works with any Bluetooth heart rate monitor, including chest straps and armbands from
          Polar, Garmin, Wahoo, and COROS. SplitCue remembers your monitor and reconnects before
          each run. Many monitors connect to only one app at a time, so disconnect apps like
          Pulsoid or Zwift if yours doesn’t appear.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  intro: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  deviceBody: { flex: 1 },
  deviceName: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  deviceStatus: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },
  forgetButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  forgetText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.danger,
  },
  hint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary + '18',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
  },
  scanButtonActive: {
    backgroundColor: Colors.surface,
  },
  scanText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.primary,
  },
  issueBox: {
    backgroundColor: Colors.warning + '12',
    borderColor: Colors.warning + '33',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  issueText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  issueLink: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.accent,
  },
  foundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  foundName: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
  connectText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.primary,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.accent + '12',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.accent + '33',
  },
  infoText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});
