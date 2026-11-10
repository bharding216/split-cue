/**
 * Cloud Sync — bidirectional sync of workouts & history with Supabase.
 *
 * Strategy: last-write-wins using `updated_at` timestamps (for history,
 * the `updatedAt` field inside each entry's JSON).
 * Runs automatically when the app foregrounds for authenticated users.
 *
 * Workouts and history are small JSON blobs, so we store them as JSONB
 * columns to keep the schema simple and avoid complex migrations.
 *
 * Soft deletes via `deleted_at` ensure deletions propagate correctly.
 */

import { supabase } from '../analytics/supabaseClient';
import {
  loadWorkouts,
  saveWorkouts,
  loadHistory,
  withHistoryLock,
  moveInlineHeartRate,
} from '../workout/workoutStorage';
import {
  hasHeartRateSamples,
  loadEncodedHeartRate,
  saveEncodedHeartRate,
} from '../heartRate/hrSampleStore';
import type { EncodedHeartRate } from '../heartRate/hrEncoding';
import { syncHrCloudConsent } from '../heartRate/hrConsent';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WorkoutDefinition, CompletedWorkout } from '../workout/workoutTypes';

const LAST_SYNC_KEY = '@pacecue/last_sync';
const DELETED_WORKOUTS_KEY = '@pacecue/deleted_workout_ids';
const DELETED_HISTORY_KEY = '@pacecue/deleted_history_ids';

// ── Sync status ──────────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

let currentStatus: SyncStatus = 'idle';
const listeners = new Set<(status: SyncStatus) => void>();

function setStatus(status: SyncStatus) {
  currentStatus = status;
  listeners.forEach((fn) => fn(status));
}

export function getSyncStatus(): SyncStatus {
  return currentStatus;
}

export function onSyncStatusChange(fn: (status: SyncStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ── Track local deletions ────────────────────────────────────

export async function trackWorkoutDeletion(id: string): Promise<void> {
  const raw = await AsyncStorage.getItem(DELETED_WORKOUTS_KEY);
  const ids: string[] = raw ? JSON.parse(raw) : [];
  if (!ids.includes(id)) {
    ids.push(id);
    await AsyncStorage.setItem(DELETED_WORKOUTS_KEY, JSON.stringify(ids));
  }
}

export async function trackHistoryDeletion(id: string): Promise<void> {
  const raw = await AsyncStorage.getItem(DELETED_HISTORY_KEY);
  const ids: string[] = raw ? JSON.parse(raw) : [];
  if (!ids.includes(id)) {
    ids.push(id);
    await AsyncStorage.setItem(DELETED_HISTORY_KEY, JSON.stringify(ids));
  }
}

// ── Main sync ────────────────────────────────────────────────

export async function syncAll(userId: string): Promise<void> {
  if (currentStatus === 'syncing') return;

  setStatus('syncing');

  try {
    const [, history] = await Promise.all([
      syncWorkouts(userId),
      syncHistory(userId),
    ]);
    await syncHeartRateSamples(userId, history).catch((err) => {
      console.warn('Heart rate sync failed:', err);
    });

    await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    setStatus('success');
  } catch (err) {
    console.warn('Cloud sync failed:', err);
    setStatus('error');
  }
}

// ── Workout sync ─────────────────────────────────────────────

async function syncWorkouts(userId: string): Promise<void> {
  const localWorkouts = await loadWorkouts();

  // Fetch all remote workouts (including soft-deleted)
  const { data: remoteRows } = await supabase
    .from('cloud_workouts')
    .select('*')
    .eq('user_id', userId);

  const remote = (remoteRows ?? []) as CloudWorkoutRow[];
  const remoteMap = new Map(remote.map((r) => [r.workout_id, r]));

  // Load locally deleted IDs
  const deletedRaw = await AsyncStorage.getItem(DELETED_WORKOUTS_KEY);
  const locallyDeleted: string[] = deletedRaw ? JSON.parse(deletedRaw) : [];

  // Push local deletions to remote
  for (const deletedId of locallyDeleted) {
    const remoteRow = remoteMap.get(deletedId);
    if (remoteRow && !remoteRow.deleted_at) {
      await supabase
        .from('cloud_workouts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', remoteRow.id);
    }
  }

  // Merge: compare by updatedAt
  const merged: WorkoutDefinition[] = [];
  const toUpsert: { workout_id: string; data: WorkoutDefinition; updated_at: string }[] = [];

  // Process local workouts
  for (const local of localWorkouts) {
    if (locallyDeleted.includes(local.id)) continue;

    const remoteRow = remoteMap.get(local.id);

    if (!remoteRow) {
      // New local workout → push to remote
      toUpsert.push({
        workout_id: local.id,
        data: local,
        updated_at: new Date(local.updatedAt).toISOString(),
      });
      merged.push(local);
    } else if (remoteRow.deleted_at) {
      // Deleted remotely → skip (don't keep locally)
    } else {
      const localTime = local.updatedAt;
      const remoteTime = new Date(remoteRow.updated_at).getTime();

      if (localTime >= remoteTime) {
        // Local is newer → push to remote
        toUpsert.push({
          workout_id: local.id,
          data: local,
          updated_at: new Date(local.updatedAt).toISOString(),
        });
        merged.push(local);
      } else {
        // Remote is newer → use remote
        merged.push(remoteRow.data as WorkoutDefinition);
      }
    }
  }

  // Process remote-only workouts
  const localIds = new Set(localWorkouts.map((w) => w.id));
  for (const remoteRow of remote) {
    if (localIds.has(remoteRow.workout_id)) continue;
    if (remoteRow.deleted_at) continue;
    if (locallyDeleted.includes(remoteRow.workout_id)) continue;

    merged.push(remoteRow.data as WorkoutDefinition);
  }

  // Upsert to remote
  for (const row of toUpsert) {
    await supabase.from('cloud_workouts').upsert(
      {
        user_id: userId,
        workout_id: row.workout_id,
        data: row.data,
        updated_at: row.updated_at,
      },
      { onConflict: 'user_id,workout_id' },
    );
  }

  // Save merged result locally
  await saveWorkouts(merged);

  // Clear the deletions we pushed, keeping any tracked while syncing
  await clearTrackedDeletions(DELETED_WORKOUTS_KEY, locallyDeleted);
}

// ── History sync ─────────────────────────────────────────────

async function syncHistory(userId: string): Promise<CompletedWorkout[]> {
  const localHistory = await loadHistory();

  const { data: remoteRows } = await supabase
    .from('cloud_history')
    .select('*')
    .eq('user_id', userId);

  const remote = (remoteRows ?? []) as CloudHistoryRow[];
  // Runs uploaded by early 1.10.0 builds carry their heart rate readings inline.
  const remoteWithInlineHr = new Set(
    remote.filter((r) => hasInlineHeartRate(r.data)).map((r) => r.history_id),
  );
  for (const r of remote) {
    if (!r.deleted_at && r.data) r.data = moveInlineHeartRate(r.data as CompletedWorkout);
  }
  const remoteMap = new Map(remote.map((r) => [r.history_id, r]));

  // Load locally deleted IDs
  const deletedRaw = await AsyncStorage.getItem(DELETED_HISTORY_KEY);
  const locallyDeleted: string[] = deletedRaw ? JSON.parse(deletedRaw) : [];

  // Push local deletions to remote
  for (const deletedId of locallyDeleted) {
    const remoteRow = remoteMap.get(deletedId);
    if (remoteRow && !remoteRow.deleted_at) {
      await supabase
        .from('cloud_history')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', remoteRow.id);
    }
  }

  // Merge by ID. Runs are fixed once recorded, but tags and notes can be
  // edited afterwards, so when both sides have an entry the newer edit wins.
  const merged = new Map<string, CompletedWorkout>();

  for (const local of localHistory) {
    if (locallyDeleted.includes(local.id)) continue;
    if (merged.has(local.id)) continue;

    const remoteRow = remoteMap.get(local.id);
    if (remoteRow?.deleted_at) continue;

    const remoteEntry = remoteRow?.data as CompletedWorkout | undefined;
    merged.set(
      local.id,
      remoteEntry && editedAt(remoteEntry) > editedAt(local) ? remoteEntry : local,
    );
  }

  // Add remote-only entries
  for (const remoteRow of remote) {
    if (merged.has(remoteRow.history_id)) continue;
    if (remoteRow.deleted_at) continue;
    if (locallyDeleted.includes(remoteRow.history_id)) continue;

    merged.set(remoteRow.history_id, remoteRow.data as CompletedWorkout);
  }

  // Write merged result under the history lock. Re-read local history inside
  // the lock to pick up changes made while we were doing network I/O: new
  // entries (a workout finished mid-sync), edits (tags or notes typed
  // mid-sync), and deletions.
  const startIds = new Set(localHistory.map((h) => h.id));
  let finalHistory: CompletedWorkout[] = [];
  await withHistoryLock(async () => {
    const freshLocal = await loadHistory();
    const freshIds = new Set(freshLocal.map((h) => h.id));

    for (const id of startIds) {
      if (!freshIds.has(id)) merged.delete(id);
    }
    for (const entry of freshLocal) {
      if (locallyDeleted.includes(entry.id)) continue;
      const current = merged.get(entry.id);
      if (!current) {
        if (remoteMap.get(entry.id)?.deleted_at) continue;
        merged.set(entry.id, entry);
      } else if (editedAt(entry) > editedAt(current)) {
        merged.set(entry.id, entry);
      }
    }

    finalHistory = [...merged.values()].sort((a, b) => b.completedAt - a.completedAt);
    await AsyncStorage.setItem('@pacecue/history', JSON.stringify(finalHistory));
  });

  // Push new and locally edited entries (outside the lock to avoid holding it
  // during network I/O)
  for (const entry of finalHistory) {
    const remoteRow = remoteMap.get(entry.id);
    if (
      remoteRow &&
      !remoteWithInlineHr.has(entry.id) &&
      !localCopyIsNewer(entry, remoteRow.data as CompletedWorkout)
    ) {
      continue;
    }

    await supabase.from('cloud_history').upsert(
      {
        user_id: userId,
        history_id: entry.id,
        data: entry,
        completed_at: new Date(entry.completedAt).toISOString(),
      },
      { onConflict: 'user_id,history_id' },
    );
  }

  // Clear the deletions we pushed, keeping any tracked while syncing
  await clearTrackedDeletions(DELETED_HISTORY_KEY, locallyDeleted);
  return finalHistory;
}

// ── Heart rate readings sync ─────────────────────────────────

const HR_DOWNLOAD_BATCH = 20;

/**
 * Readings sync separately from history, after it, so each run's
 * cloud_history row exists first. Uploads only with the runner's consent;
 * downloads readings already saved to their account for runs missing them here.
 */
async function syncHeartRateSamples(userId: string, history: CompletedWorkout[]): Promise<void> {
  const consent = await syncHrCloudConsent(userId);
  const withHr = history.filter((h) => h.heartRate);
  if (withHr.length === 0) return;

  const { data, error } = await supabase
    .from('workout_hr_samples')
    .select('history_id')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  const remoteIds = new Set((data ?? []).map((r: { history_id: string }) => r.history_id));

  const toDownload = withHr
    .filter((h) => remoteIds.has(h.id) && !hasHeartRateSamples(h.id))
    .map((h) => h.id);
  for (let i = 0; i < toDownload.length; i += HR_DOWNLOAD_BATCH) {
    const { data: rows, error: downloadError } = await supabase
      .from('workout_hr_samples')
      .select('history_id, samples')
      .eq('user_id', userId)
      .in('history_id', toDownload.slice(i, i + HR_DOWNLOAD_BATCH));
    if (downloadError) throw new Error(downloadError.message);
    for (const row of (rows ?? []) as { history_id: string; samples: EncodedHeartRate }[]) {
      saveEncodedHeartRate(row.history_id, row.samples);
    }
  }

  if (consent !== 'granted') return;
  for (const entry of withHr) {
    if (remoteIds.has(entry.id)) continue;
    const encoded = loadEncodedHeartRate(entry.id);
    if (!encoded) continue;
    const { error: uploadError } = await supabase.from('workout_hr_samples').insert({
      user_id: userId,
      history_id: entry.id,
      encoding_version: encoded.v,
      sample_count: encoded.bpm.length,
      samples: encoded,
    });
    if (uploadError && uploadError.code !== '23505') {
      console.warn('Failed to upload heart rate readings:', uploadError.message);
    }
  }
}

function hasInlineHeartRate(data: unknown): boolean {
  return Array.isArray((data as { heartRate?: { samples?: unknown } } | null)?.heartRate?.samples);
}

function editedAt(entry: CompletedWorkout): number {
  return entry.updatedAt ?? 0;
}

/**
 * Whether the local copy of a history entry should replace the remote one.
 * Entries edited before `updatedAt` existed have no timestamp on either
 * side; for those, differing tags or notes mean the edit only happened on
 * this device.
 */
function localCopyIsNewer(local: CompletedWorkout, remote: CompletedWorkout): boolean {
  if (editedAt(local) !== editedAt(remote)) return editedAt(local) > editedAt(remote);
  if (local.updatedAt != null) return false;
  return (
    JSON.stringify(local.tags ?? []) !== JSON.stringify(remote.tags ?? []) ||
    (local.notes ?? '') !== (remote.notes ?? '')
  );
}

async function clearTrackedDeletions(key: string, processed: string[]): Promise<void> {
  const raw = await AsyncStorage.getItem(key);
  const current: string[] = raw ? JSON.parse(raw) : [];
  const remaining = current.filter((id) => !processed.includes(id));
  if (remaining.length > 0) {
    await AsyncStorage.setItem(key, JSON.stringify(remaining));
  } else {
    await AsyncStorage.removeItem(key);
  }
}

// ── Types ────────────────────────────────────────────────────

interface CloudWorkoutRow {
  id: string;
  user_id: string;
  workout_id: string;
  data: unknown;
  updated_at: string;
  deleted_at: string | null;
}

interface CloudHistoryRow {
  id: string;
  user_id: string;
  history_id: string;
  data: unknown;
  completed_at: string;
  deleted_at: string | null;
}
