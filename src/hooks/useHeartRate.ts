/**
 * Records heart rate from the paired monitor during a workout.
 *
 * Readings are stamped with workout time (pauses excluded) from
 * `getElapsedMs`, so they line up with interval splits even after the
 * workout is restored from a snapshot. While paused, readings are ignored
 * but the monitor stays connected.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addHeartRateListener,
  addHrConnectionListener,
  getCurrentBpm,
  getHrConnection,
  getPairedHrDevice,
  holdHeartRateConnection,
} from '../heartRate/hrMonitor';
import type { HrConnection, HrSample } from '../heartRate/hrTypes';

export interface HeartRateRecorder {
  /** Latest reading while recording, null when there's no recent one. */
  currentBpm: number | null;
  connection: HrConnection;
  /** Name of the monitor being recorded, null when none is paired. */
  deviceName: string | null;
  /** Connect to the paired monitor, if any, and start recording. Never prompts for permissions. */
  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  /** Pick up samples from a workout restored after the app was closed. Starts paused. */
  restore: (samples: HrSample[]) => void;
  getSamples: () => HrSample[];
  getDeviceName: () => string | null;
}

export function useHeartRate(getElapsedMs: () => number): HeartRateRecorder {
  const [connection, setConnection] = useState<HrConnection>('off');
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [, setLastBpm] = useState<number | null>(null);

  const getElapsedRef = useRef(getElapsedMs);
  getElapsedRef.current = getElapsedMs;
  const samplesRef = useRef<HrSample[]>([]);
  const pausedRef = useRef(false);
  const deviceNameRef = useRef<string | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    releaseRef.current?.();
    releaseRef.current = null;
    setConnection('off');
  }, []);

  const start = useCallback(async () => {
    if (releaseRef.current) return;
    const device = await getPairedHrDevice();
    if (!device || releaseRef.current) return;
    deviceNameRef.current = device.name;
    setDeviceName(device.name);

    const offBpm = addHeartRateListener((bpm, at) => {
      setLastBpm(bpm);
      if (pausedRef.current) return;
      const samples = samplesRef.current;
      const t = Math.max(0, getElapsedRef.current());
      const last = samples[samples.length - 1];
      if (last && t <= last.t) return;
      samples.push({ t, ts: at, bpm });
    });
    const offConnection = addHrConnectionListener(setConnection);
    unsubscribeRef.current = () => {
      offBpm();
      offConnection();
    };
    releaseRef.current = holdHeartRateConnection();
    setConnection(getHrConnection());
  }, []);

  const pause = useCallback(() => {
    pausedRef.current = true;
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
  }, []);

  const reset = useCallback(() => {
    samplesRef.current = [];
    pausedRef.current = false;
  }, []);

  const restore = useCallback((samples: HrSample[]) => {
    samplesRef.current = [...samples];
    pausedRef.current = true;
  }, []);

  const getSamples = useCallback(() => [...samplesRef.current], []);
  const getDeviceName = useCallback(() => deviceNameRef.current, []);

  useEffect(() => stop, [stop]);

  return {
    currentBpm: releaseRef.current ? getCurrentBpm() : null,
    connection,
    deviceName,
    start,
    stop,
    pause,
    resume,
    reset,
    restore,
    getSamples,
    getDeviceName,
  };
}
