/**
 * Parser for the Bluetooth Heart Rate Measurement characteristic (0x2A37).
 *
 * Byte 0 holds flags; bit 0 set means the BPM is a little-endian uint16
 * in bytes 1-2, otherwise it's a uint8 in byte 1. Energy expended and
 * RR intervals may follow and aren't used.
 */

import { MAX_VALID_BPM, MIN_VALID_BPM } from './hrTypes';

/** BPM from a raw measurement, or null when it's missing or out of range. */
export function parseHeartRateMeasurement(bytes: Uint8Array): number | null {
  if (bytes.length < 2) return null;
  const isUint16 = (bytes[0] & 0x01) !== 0;
  let bpm: number;
  if (isUint16) {
    if (bytes.length < 3) return null;
    bpm = bytes[1] | (bytes[2] << 8);
  } else {
    bpm = bytes[1];
  }
  if (bpm < MIN_VALID_BPM || bpm > MAX_VALID_BPM) return null;
  return bpm;
}

/** Decode the base64 characteristic value delivered by react-native-ble-plx. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
