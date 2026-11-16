/**
 * On-device heart rate readings, one file per completed run, named by
 * history entry ID.
 *
 * Kept out of the history blob in AsyncStorage: a 30-minute run has about
 * 1,800 readings, and enough runs would exceed Android's AsyncStorage limits.
 */

import { Directory, File, Paths } from 'expo-file-system';
import { decodeHeartRate, encodeHeartRate, type EncodedHeartRate } from './hrEncoding';
import type { HrSample } from './hrTypes';

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

function samplesDir(): Directory {
  return new Directory(Paths.document, 'heart-rate');
}

function samplesFile(historyId: string): File | null {
  if (!SAFE_ID.test(historyId)) return null;
  return new File(samplesDir(), `${historyId}.json`);
}

export function saveEncodedHeartRate(historyId: string, encoded: EncodedHeartRate): void {
  const file = samplesFile(historyId);
  if (!file || !decodeHeartRate(encoded)) return;
  try {
    samplesDir().create({ intermediates: true, idempotent: true });
    if (!file.exists) file.create();
    file.write(JSON.stringify(encoded));
  } catch (e) {
    console.warn('Failed to save heart rate readings:', e);
  }
}

export function saveHeartRateSamples(historyId: string, samples: HrSample[]): void {
  if (samples.length === 0) return;
  saveEncodedHeartRate(historyId, encodeHeartRate(samples));
}

export function loadEncodedHeartRate(historyId: string): EncodedHeartRate | null {
  const file = samplesFile(historyId);
  if (!file?.exists) return null;
  try {
    const data = JSON.parse(file.textSync());
    return decodeHeartRate(data) ? (data as EncodedHeartRate) : null;
  } catch (e) {
    console.warn('Failed to read heart rate readings:', e);
    return null;
  }
}

/** The run's readings, or null when none are stored on this device. */
export function loadHeartRateSamples(historyId: string): HrSample[] | null {
  const encoded = loadEncodedHeartRate(historyId);
  return encoded ? decodeHeartRate(encoded) : null;
}

export function hasHeartRateSamples(historyId: string): boolean {
  return samplesFile(historyId)?.exists ?? false;
}

export function deleteHeartRateSamples(historyId: string): void {
  try {
    const file = samplesFile(historyId);
    if (file?.exists) file.delete();
  } catch (e) {
    console.warn('Failed to delete heart rate readings:', e);
  }
}

/** Delete every run's readings from this device. */
export function clearAllHeartRateSamples(): void {
  try {
    const dir = samplesDir();
    if (dir.exists) dir.delete();
  } catch (e) {
    console.warn('Failed to clear heart rate readings:', e);
  }
}
