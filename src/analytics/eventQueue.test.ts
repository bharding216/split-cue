import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_QUEUED_AGE_MS,
  MAX_QUEUED_EVENTS,
  createEventQueue,
  type QueuedEvent,
  type QueueStorage,
  type SendResult,
} from './eventQueue';

const NOW = 1_800_000_000_000;

function memoryStorage(): QueueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
  };
}

function event(id: string, occurredAt = NOW): QueuedEvent {
  return { row: { id, event_name: 'test' }, occurredAt };
}

function stored(storage: ReturnType<typeof memoryStorage>): string[] {
  return (JSON.parse(storage.data.get('q') ?? '[]') as QueuedEvent[]).map((e) => e.row.id);
}

function setup(send: (events: QueuedEvent[]) => Promise<SendResult>) {
  const storage = memoryStorage();
  const queue = createEventQueue({ storage, key: 'q', send, now: () => NOW });
  return { storage, queue };
}

test('flush sends queued events and clears them', async () => {
  const sent: string[] = [];
  const { storage, queue } = setup(async (events) => {
    sent.push(...events.map((e) => e.row.id));
    return 'sent';
  });
  await queue.enqueue(event('a'));
  await queue.enqueue(event('b'));
  assert.equal(await queue.flush(), 0);
  assert.deepEqual(sent, ['a', 'b']);
  assert.deepEqual(stored(storage), []);
});

test('events stay queued while offline', async () => {
  const { storage, queue } = setup(async () => 'retry');
  await queue.enqueue(event('a'));
  assert.equal(await queue.flush(), 1);
  assert.deepEqual(stored(storage), ['a']);
});

test('a duplicate in a batch is split out and the rest are sent', async () => {
  const landed = new Set(['b']);
  const { storage, queue } = setup(async (events) => {
    if (events.some((e) => landed.has(e.row.id))) return 'duplicate';
    events.forEach((e) => landed.add(e.row.id));
    return 'sent';
  });
  for (const id of ['a', 'b', 'c']) await queue.enqueue(event(id));
  assert.equal(await queue.flush(), 0);
  assert.deepEqual([...landed].sort(), ['a', 'b', 'c']);
  assert.deepEqual(stored(storage), []);
});

test('a rejected event is dropped without blocking the others', async () => {
  const { storage, queue } = setup(async (events) =>
    events.some((e) => e.row.id === 'bad') ? 'rejected' : 'sent',
  );
  for (const id of ['a', 'bad', 'c']) await queue.enqueue(event(id));
  assert.equal(await queue.flush(), 0);
  assert.deepEqual(stored(storage), []);
});

test('going offline mid-flush keeps the unsent events', async () => {
  let calls = 0;
  const { storage, queue } = setup(async (events) => {
    calls += 1;
    if (events.length > 1) return 'rejected';
    return calls <= 2 ? 'sent' : 'retry';
  });
  for (const id of ['a', 'bad', 'c']) await queue.enqueue(event(id));
  assert.equal(await queue.flush(), 2);
  assert.deepEqual(stored(storage), ['bad', 'c']);
});

test('events tracked during a flush are kept', async () => {
  const { storage, queue } = setup(async () => {
    await queue.enqueue(event('late'));
    return 'sent';
  });
  await queue.enqueue(event('a'));
  assert.equal(await queue.flush(), 1);
  assert.deepEqual(stored(storage), ['late']);
});

test('old events and overflow are dropped', async () => {
  const { storage, queue } = setup(async () => 'retry');
  await queue.enqueue(event('stale', NOW - MAX_QUEUED_AGE_MS - 1));
  for (let i = 0; i < MAX_QUEUED_EVENTS + 5; i++) await queue.enqueue(event(`e${i}`));
  const ids = stored(storage);
  assert.equal(ids.length, MAX_QUEUED_EVENTS);
  assert.equal(ids.includes('stale'), false);
  assert.equal(ids[0], 'e5');
});

test('a corrupt queue is treated as empty', async () => {
  const { storage, queue } = setup(async () => 'sent');
  storage.data.set('q', '{not json');
  assert.equal(await queue.flush(), 0);
});
