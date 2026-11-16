import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base64ToBytes, parseHeartRateMeasurement } from './hrParser';

test('reads a uint8 heart rate', () => {
  assert.equal(parseHeartRateMeasurement(new Uint8Array([0x00, 142])), 142);
});

test('reads a little-endian uint16 heart rate', () => {
  assert.equal(parseHeartRateMeasurement(new Uint8Array([0x01, 0xb4, 0x00])), 180);
});

test('ignores trailing energy and RR interval bytes', () => {
  // Flags: uint8 BPM, energy expended present (bit 3), RR intervals present (bit 4)
  assert.equal(parseHeartRateMeasurement(new Uint8Array([0x18, 120, 0x10, 0x00, 0x00, 0x04])), 120);
});

test('rejects truncated and out-of-range readings', () => {
  assert.equal(parseHeartRateMeasurement(new Uint8Array([0x00])), null);
  assert.equal(parseHeartRateMeasurement(new Uint8Array([0x01, 0xb4])), null);
  assert.equal(parseHeartRateMeasurement(new Uint8Array([0x00, 0])), null);
  assert.equal(parseHeartRateMeasurement(new Uint8Array([0x01, 0xff, 0x00])), null);
});

test('decodes base64 characteristic values', () => {
  assert.deepEqual([...base64ToBytes('AI4=')], [0x00, 142]);
});
