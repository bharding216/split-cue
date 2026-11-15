import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import { isTransientEdgeError, retryDelayMs } from './edgeFunctionErrors';

test('isTransientEdgeError: FunctionsFetchError is retryable', () => {
  const err = new FunctionsFetchError(new TypeError('fetch failed'));
  assert.equal(isTransientEdgeError(err), true);
});

test('isTransientEdgeError: FunctionsRelayError is retryable', () => {
  const err = new FunctionsRelayError(new Response(null, { status: 502 }));
  assert.equal(isTransientEdgeError(err), true);
});

test('isTransientEdgeError: gateway HTTP statuses are retryable', () => {
  for (const status of [502, 503, 504, 546]) {
    const err = new FunctionsHttpError(new Response('oops', { status }));
    assert.equal(isTransientEdgeError(err), true, `status ${status}`);
  }
});

test('isTransientEdgeError: application 4xx is not retryable', () => {
  const err = new FunctionsHttpError(new Response('{"error":"bad"}', { status: 400 }));
  assert.equal(isTransientEdgeError(err), false);
});

test('isTransientEdgeError: plain message match for known flake', () => {
  assert.equal(
    isTransientEdgeError(new Error('Failed to send a request to the Edge Function')),
    true,
  );
});

test('isTransientEdgeError: unrelated errors are not retryable', () => {
  assert.equal(isTransientEdgeError(new Error('quota exceeded')), false);
  assert.equal(isTransientEdgeError(null), false);
});

test('retryDelayMs grows with attempt and stays capped', () => {
  const noJitter = () => 0;
  assert.equal(retryDelayMs(0, noJitter), 800);
  assert.equal(retryDelayMs(1, noJitter), 1600);
  assert.equal(retryDelayMs(2, noJitter), 3200);
  assert.equal(retryDelayMs(9, noJitter), 5000);
});
