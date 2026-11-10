/**
 * Support emails pre-filled with the details we'd otherwise ask for:
 * app version, phone model, OS version and the heart rate monitor.
 */

import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { staticDeviceInfo } from '../analytics/deviceInfo';
import { SUPPORT_EMAIL } from '../heartRate/deviceGuides';
import { getHrDiagnostics, getPairedHrDevice } from '../heartRate/hrMonitor';

interface SupportEmailOptions {
  subject: string;
  /** Prompt lines placed above the diagnostics for the user to fill in. */
  prompt?: string[];
  /** Device names from the latest Bluetooth search, if one was just run. */
  scanResults?: string[];
}

async function diagnosticLines(scanResults?: string[]): Promise<string[]> {
  const info = staticDeviceInfo();
  const os = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS;
  const phone = [info.manufacturer, info.model_name].filter(Boolean).join(' ') || 'Unknown';
  const build = info.native_build_version ? ` (${info.native_build_version})` : '';

  const lines = [
    `App: SplitCue ${Constants.expoConfig?.version ?? '?'}${build}`,
    `Phone: ${phone}, ${os} ${info.os_version ?? '?'}`,
  ];

  const device = await getPairedHrDevice().catch(() => null);
  if (device) {
    const { connection, lastError, lastReadingAt } = getHrDiagnostics();
    lines.push(`Heart rate monitor: ${device.name} (${connection})`);
    if (lastReadingAt) lines.push(`Last reading: ${new Date(lastReadingAt).toISOString()}`);
    if (lastError) lines.push(`Last connection error: ${lastError}`);
  } else {
    lines.push('Heart rate monitor: none connected');
  }
  if (scanResults) {
    lines.push(`Last search found: ${scanResults.length ? scanResults.join(', ') : 'nothing'}`);
  }
  return lines;
}

export async function openSupportEmail({ subject, prompt, scanResults }: SupportEmailOptions): Promise<void> {
  const diagnostics = await diagnosticLines(scanResults);
  const body = [...(prompt ?? []), '', '', '— Please keep the details below, they help us troubleshoot —', ...diagnostics].join('\n');
  await Linking.openURL(
    `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  );
}
