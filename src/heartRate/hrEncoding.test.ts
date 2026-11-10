import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeHeartRate, encodeHeartRate } from './hrEncoding';
import type { HrSample } from './hrTypes';

const START_TS = 1_700_000_000_000;

test('round-trips readings, including dropout gaps', () => {
  const samples: HrSample[] = [
    { t: 400, ts: START_TS, bpm: 112 },
    { t: 1400, ts: START_TS + 1000, bpm: 114 },
    { t: 2400, ts: START_TS + 2000, bpm: 116 },
    { t: 31_400, ts: START_TS + 31_000, bpm: 150 },
  ];
  const encoded = encodeHeartRate(samples);
  assert.deepEqual(encoded.t, [400, 1000, 1000, 29_000]);
  assert.deepEqual(decodeHeartRate(JSON.parse(JSON.stringify(encoded))), samples);
});

test('encodes an empty recording', () => {
  assert.deepEqual(decodeHeartRate(encodeHeartRate([])), []);
});

test('rejects unknown or malformed data', () => {
  assert.equal(decodeHeartRate(null), null);
  assert.equal(decodeHeartRate({ v: 2, startTs: 0, t: [], ts: [], bpm: [] }), null);
  assert.equal(decodeHeartRate({ v: 1, startTs: 0, t: [1], ts: [], bpm: [100] }), null);
});
