/**
 * Heart rate monitor settings — pair, check, and forget a Bluetooth heart rate monitor,
 * with setup steps by device and help when nothing is found.
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
  Switch,
  Alert,
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
import {
  DEVICE_GUIDES,
  NOT_FOUND_TIPS,
  NO_READINGS_TIP,
  type DeviceGuide,
} from '../../../src/heartRate/deviceGuides';
import { openHeartRateHelp } from '../../../src/heartRate/openHeartRateHelp';
import type { DiscoveredHrDevice } from '../../../src/heartRate/hrTypes';
import { useHeartRateMonitor } from '../../../src/hooks/useHeartRateMonitor';
import { hrConnectionLabel } from '../../../src/components/HeartRateBadge';
import { openSupportEmail } from '../../../src/support/supportEmail';
import { useAuth } from '../../../src/contexts/AuthContext';
import {
  PRIVACY_POLICY_URL,
  revokeHrCloudConsent,
  setHrCloudConsent,
  useHrCloudConsent,
} from '../../../src/heartRate/hrConsent';
import { HrCloudConsentCard } from '../../../src/components/HrCloudConsentCard';
import { syncAll } from '../../../src/sync/cloudSync';

const SCAN_DURATION_MS = 15_000;

const ACCESS_MESSAGES: Record<Exclude<BluetoothStatus, 'ready'>, string> = {
  off: 'Bluetooth is off. Turn it on to find your heart rate monitor.',
  unauthorized: 'SplitCue needs Bluetooth access to connect to your heart rate monitor.',
  unsupported: 'Bluetooth isn’t available on this device.',
};

export default function HeartRateSettingsScreen() {
  const { device, connection, bpm, noReadings } = useHeartRateMonitor();
  const { user } = useAuth();
  const consent = useHrCloudConsent();
  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState<DiscoveredHrDevice[]>([]);
  const [accessIssue, setAccessIssue] = useState<Exclude<BluetoothStatus, 'ready'> | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanEmpty, setScanEmpty] = useState(false);
  const [guide, setGuide] = useState<DeviceGuide | null>(null);
  const [guidesOpen, setGuidesOpen] = useState(false);
  const stopScanRef = useRef<(() => void) | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanStartedAtRef = useRef(0);
  const foundCountRef = useRef(0);
  const guideRef = useRef<DeviceGuide | null>(null);
  guideRef.current = guide;

  const stopScan = useCallback(() => {
    stopScanRef.current?.();
    stopScanRef.current = null;
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    scanTimerRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => stopScan, [stopScan]);

  /** End the scan; if nothing turned up, show help and record it. */
  const finishScan = useCallback(
    (endedBy: 'timeout' | 'user') => {
      if (!stopScanRef.current) return;
      stopScan();
      if (foundCountRef.current > 0) return;
      setScanEmpty(true);
      track('hr_scan_empty', {
        ended_by: endedBy,
        duration_ms: Date.now() - scanStartedAtRef.current,
        guide: guideRef.current?.id ?? null,
      });
    },
    [stopScan],
  );

  const startScan = async () => {
    hapticTap();
    setScanError(null);
    setScanEmpty(false);
    const status = await requestBluetoothAccess();
    if (status !== 'ready') {
      setAccessIssue(status);
      return;
    }
    setAccessIssue(null);
    retryHeartRateConnection();
    setFound([]);
    foundCountRef.current = 0;
    scanStartedAtRef.current = Date.now();
    setScanning(true);
    stopScanRef.current = scanForHeartRateMonitors(
      (d) => {
        foundCountRef.current++;
        setFound((prev) => [...prev, d]);
      },
      (message) => {
        setScanError(message);
        stopScan();
      },
    );
    scanTimerRef.current = setTimeout(() => finishScan('timeout'), SCAN_DURATION_MS);
  };

  const pair = async (d: DiscoveredHrDevice) => {
    hapticTap();
    stopScan();
    await setPairedHrDevice({ id: d.id, name: d.name });
    setFound([]);
    setScanEmpty(false);
    setGuidesOpen(false);
    track('hr_device_paired', {
      device_name: d.name,
      replaced_device: !!device,
      guide: guide?.id ?? null,
    });
  };

  const forget = async () => {
    hapticTap();
    await setPairedHrDevice(null);
    track('hr_device_forgotten', {});
  };

  const selectGuide = (g: DeviceGuide) => {
    hapticTap();
    const next = guide?.id === g.id ? null : g;
    setGuide(next);
    if (next) track('hr_guide_viewed', { guide: next.id });
  };

  const emailSupport = (source: string) => {
    hapticTap();
    track('hr_support_email', { source });
    openSupportEmail({
      subject: 'Heart rate monitor help',
      prompt: ['Monitor or watch (brand and model):', 'What happened:'],
      scanResults: scanEmpty || found.length > 0 ? found.map((d) => d.name) : undefined,
    });
  };

  const toggleCloudSaving = (enabled: boolean) => {
    hapticTap();
    if (!user) return;
    if (enabled) {
      setHrCloudConsent(true, 'settings').then(() => syncAll(user.id));
      return;
    }
    const revoke = async (deleteCloudCopies: boolean) => {
      const { error } = await revokeHrCloudConsent(deleteCloudCopies);
      if (error) {
        Alert.alert('Couldn’t Delete', 'Your saved heart rate couldn’t be deleted. Please try again.');
      }
    };
    Alert.alert(
      'Stop Saving Heart Rate?',
      'New runs’ heart rate readings will stay on this phone only. You can also delete the readings already saved to your account. Averages and per-interval stats stay with your runs.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Keep Saved Readings', onPress: () => revoke(false) },
        { text: 'Delete Saved Readings', style: 'destructive', onPress: () => revoke(true) },
      ],
    );
  };

  const visibleFound = found.filter((d) => d.id !== device?.id);
  const showGuides = !device || guidesOpen;

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
                {connection === 'connected'
                  ? bpm != null
                    ? `Connected · ${bpm} bpm`
                    : 'Connected · waiting for heart rate'
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
          {noReadings && <Text style={styles.hint}>{NO_READINGS_TIP}</Text>}
          <HrCloudConsentCard source="paired" />
        </>
      )}

      <Text style={styles.sectionTitle}>{device ? 'Use a Different Monitor' : 'Find Your Monitor'}</Text>

      {device && (
        <TouchableOpacity
          onPress={() => setGuidesOpen((open) => !open)}
          style={styles.guidesToggle}
          accessibilityRole="button"
        >
          <Text style={styles.linkText}>
            {guidesOpen ? 'Hide setup steps' : 'Show setup steps by device'}
          </Text>
          <Ionicons
            name={guidesOpen ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={Colors.accent}
          />
        </TouchableOpacity>
      )}

      {showGuides && (
        <>
          <Text style={styles.stepLabel}>1. Choose your device</Text>
          <View style={styles.tileGrid}>
            {DEVICE_GUIDES.map((g) => {
              const selected = guide?.id === g.id;
              return (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.tile, selected && styles.tileSelected]}
                  onPress={() => selectGuide(g)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.tileName, selected && styles.tileNameSelected]} numberOfLines={1}>
                    {g.name}
                  </Text>
                  <Text style={styles.tileExamples} numberOfLines={1}>
                    {g.examples}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {guide && (
            <View style={styles.guideCard}>
              {guide.steps.map((step, i) => (
                <View key={i} style={styles.guideStep}>
                  <Text style={styles.guideStepNum}>{i + 1}</Text>
                  <Text style={styles.guideStepText}>{step}</Text>
                </View>
              ))}
              {guide.note && <Text style={styles.guideNote}>{guide.note}</Text>}
              <TouchableOpacity
                onPress={() => openHeartRateHelp('settings_guide', guide.id)}
                accessibilityRole="link"
              >
                <Text style={styles.linkText}>Full {guide.name} guide</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.stepLabel}>2. Search for it</Text>
        </>
      )}

      <TouchableOpacity
        style={[styles.scanButton, scanning && styles.scanButtonActive]}
        onPress={scanning ? () => finishScan('user') : startScan}
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
              <Text style={styles.linkText}>Open Settings</Text>
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

      {scanEmpty && !scanning && (
        <View style={styles.issueBox}>
          <Text style={styles.issueTitle}>Didn’t find your monitor?</Text>
          {NOT_FOUND_TIPS.map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <Text style={styles.tipBullet}>•</Text>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
          <View style={styles.linkRow}>
            <TouchableOpacity onPress={startScan} accessibilityRole="button">
              <Text style={styles.linkText}>Search Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => openHeartRateHelp('scan_empty', 'troubleshooting')}
              accessibilityRole="link"
            >
              <Text style={styles.linkText}>More Help</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => emailSupport('scan_empty')} accessibilityRole="button">
              <Text style={styles.linkText}>Email Support</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!scanning && found.length === 0 && !scanEmpty && !accessIssue && !scanError && (
        <Text style={styles.hint}>
          Wear your strap while searching so it’s awake, or turn on heart rate broadcasting on
          your watch. No need to pair in your phone’s Bluetooth settings.
        </Text>
      )}

      <Text style={styles.sectionTitle}>Your Heart Rate Data</Text>
      {user ? (
        <View style={styles.settingRow}>
          <View style={styles.settingBody}>
            <Text style={styles.settingLabel}>Save heart rate to my account</Text>
            <Text style={styles.settingHint}>
              Backs up each run’s readings and shows your graphs on your other devices. Averages
              and per-interval stats are saved with your runs either way.
            </Text>
          </View>
          <Switch
            value={consent === 'granted'}
            onValueChange={toggleCloudSaving}
            disabled={consent == null}
            trackColor={{ false: Colors.surfaceLight, true: Colors.primaryDim }}
            thumbColor={Colors.white}
            accessibilityLabel="Save heart rate to my account"
          />
        </View>
      ) : (
        <Text style={styles.hint}>
          Your heart rate readings are stored on this phone. Sign in to choose whether to back them
          up to your account.
        </Text>
      )}
      <Text style={styles.hint}>
        Your heart rate is private and never used for advertising. Deleting a run deletes its heart
        rate, on this phone and in your account.{' '}
        <Text style={styles.linkText} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
          Privacy Policy
        </Text>
      </Text>

      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={18} color={Colors.accent} />
        <View style={styles.infoBody}>
          <Text style={styles.infoText}>
            Works with any Bluetooth heart rate monitor, plus watches that broadcast heart rate.
            SplitCue remembers your monitor and reconnects before each run. Many monitors connect
            to only one app at a time, so disconnect apps like Pulsoid or Zwift if yours doesn’t
            appear.
          </Text>
          <View style={styles.linkRow}>
            <TouchableOpacity onPress={() => openHeartRateHelp('settings')} accessibilityRole="link">
              <Text style={styles.linkText}>Heart Rate Help</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => emailSupport('settings')} accessibilityRole="button">
              <Text style={styles.linkText}>Email Support</Text>
            </TouchableOpacity>
          </View>
        </View>
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
  stepLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
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
  guidesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.sm,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tile: {
    width: '48.5%',
    flexGrow: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.surface,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  tileSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '12',
  },
  tileName: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  tileNameSelected: {
    color: Colors.primary,
  },
  tileExamples: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  guideCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  guideStep: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  guideStepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 20,
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.background,
    backgroundColor: Colors.primary,
  },
  guideStepText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  guideNote: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
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
  issueTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  issueText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  tipText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  tipRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  tipBullet: {
    fontSize: FontSize.sm,
    color: Colors.warning,
    lineHeight: 20,
  },
  linkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.lg,
    marginTop: Spacing.xs,
  },
  linkText: {
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
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  settingBody: { flex: 1 },
  settingLabel: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  settingHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
    lineHeight: 18,
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
  infoBody: { flex: 1 },
  infoText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});
