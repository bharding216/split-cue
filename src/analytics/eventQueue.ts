/**
 * Durable queue for analytics events that couldn't be sent, usually because
 * the phone was offline mid-run. Each event keeps its client-generated id, so
 * a resend that had already landed is recognized as a duplicate rather than
 * counted twice.
 */

export interface QueuedEvent {
  row: Record<string, unknown> & { id: string };
  /** Epoch ms when the event was tracked, sent as `created_at` on delivery. */
  occurredAt: number;
}

/**
 * Outcome of sending events. 'retry' means try again later (offline, timeout,
 * server error); 'duplicate' means a row with the same id already exists;
 * 'rejected' means the server refused the rows and resending won't help.
 */
export type SendResult = 'sent' | 'retry' | 'duplicate' | 'rejected';

export interface QueueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const MAX_QUEUED_EVENTS = 500;
export const MAX_QUEUED_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 50;

export function createEventQueue(options: {
  storage: QueueStorage;
  key: string;
  send: (events: QueuedEvent[]) => Promise<SendResult>;
  now?: () => number;
}) {
  const { storage, key, send, now = Date.now } = options;
  let writes: Promise<unknown> = Promise.resolve();
  let flushing: Promise<number> | null = null;
  /** False only once the stored queue is known to be empty. */
  let mayHavePending = true;

  /** Runs read-modify-write updates one at a time so concurrent calls don't drop events. */
  function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = writes.then(fn, fn);
    writes = run.catch(() => {});
    return run;
  }

  async function load(): Promise<QueuedEvent[]> {
    try {
      const parsed = JSON.parse((await storage.getItem(key)) ?? '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async function save(events: QueuedEvent[]): Promise<void> {
    try {
      await storage.setItem(key, JSON.stringify(events));
    } catch {}
  }

  function prune(events: QueuedEvent[]): QueuedEvent[] {
    const cutoff = now() - MAX_QUEUED_AGE_MS;
    return events.filter((e) => e.occurredAt >= cutoff).slice(-MAX_QUEUED_EVENTS);
  }

  /** Sends one batch, splitting it when a single bad or duplicate row fails the whole insert. */
  async function deliver(batch: QueuedEvent[], done: Set<string>): Promise<boolean> {
    const result = await send(batch).catch((): SendResult => 'retry');
    if (result === 'retry') return false;
    if (result === 'sent' || batch.length === 1) {
      for (const e of batch) done.add(e.row.id);
      return true;
    }
    for (const e of batch) {
      if (!(await deliver([e], done))) return false;
    }
    return true;
  }

  async function runFlush(): Promise<number> {
    const pending = prune(await load());
    const done = new Set<string>();
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      if (!(await deliver(pending.slice(i, i + BATCH_SIZE), done))) break;
    }
    // Events tracked while sending were appended meanwhile, so re-read before removing.
    return exclusive(async () => {
      const remaining = prune(await load()).filter((e) => !done.has(e.row.id));
      await save(remaining);
      mayHavePending = remaining.length > 0;
      return remaining.length;
    });
  }

  return {
    enqueue(event: QueuedEvent): Promise<void> {
      return exclusive(async () => {
        await save(prune([...(await load()), event]));
        mayHavePending = true;
      });
    },

    /** Sends queued events; resolves with how many are still waiting. */
    flush(): Promise<number> {
      if (!mayHavePending) return Promise.resolve(0);
      if (!flushing) {
        flushing = runFlush().finally(() => {
          flushing = null;
        });
      }
      return flushing;
    },
  };
}
