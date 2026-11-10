/**
 * Live status of the paired heart rate monitor, for settings and the
 * pre-run screen. Keeps the monitor connected while mounted, unless
 * `connect` is false.
 */

import { useEffect, useState } from 'react';
import {
  addHeartRateListener,
  addHrConnectionListener,
  addPairedHrDeviceListener,
  getCurrentBpm,
  getHrConnection,
  getPairedHrDevice,
  holdHeartRateConnection,
} from '../heartRate/hrMonitor';
import type { HrConnection, PairedHrDevice } from '../heartRate/hrTypes';

/** Clear the shown reading if the monitor goes quiet for this long. */
const STALE_CHECK_MS = 5000;
/** Connected this long with no reading suggests a loose strap or dry electrodes. */
const NO_READINGS_MS = 8000;

export interface HeartRateMonitorStatus {
  /** undefined while loading. */
  device: PairedHrDevice | null | undefined;
  connection: HrConnection;
  bpm: number | null;
  /** Connected, but no reading has arrived for a while. */
  noReadings: boolean;
}

export function useHeartRateMonitor(connect = true): HeartRateMonitorStatus {
  const [device, setDevice] = useState<PairedHrDevice | null | undefined>(undefined);
  const [connection, setConnection] = useState<HrConnection>(getHrConnection);
  const [bpm, setBpm] = useState<number | null>(getCurrentBpm);

  useEffect(() => {
    let mounted = true;
    getPairedHrDevice().then((d) => {
      if (mounted) setDevice(d);
    });
    const offDevice = addPairedHrDeviceListener(setDevice);
    const offConnection = addHrConnectionListener((c) => {
      setConnection(c);
      if (c !== 'connected') setBpm(null);
    });
    let staleTimer: ReturnType<typeof setTimeout> | null = null;
    const offBpm = addHeartRateListener((value) => {
      setBpm(value);
      if (staleTimer) clearTimeout(staleTimer);
      staleTimer = setTimeout(() => setBpm(getCurrentBpm()), STALE_CHECK_MS + 100);
    });
    const release = connect ? holdHeartRateConnection() : null;
    return () => {
      mounted = false;
      offDevice();
      offConnection();
      offBpm();
      if (staleTimer) clearTimeout(staleTimer);
      release?.();
    };
  }, [connect]);

  const [noReadings, setNoReadings] = useState(false);
  const silent = connection === 'connected' && bpm == null;
  useEffect(() => {
    setNoReadings(false);
    if (!silent) return;
    const timer = setTimeout(() => setNoReadings(true), NO_READINGS_MS);
    return () => clearTimeout(timer);
  }, [silent]);

  return { device, connection, bpm, noReadings: silent && noReadings };
}
