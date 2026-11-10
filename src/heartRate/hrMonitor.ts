/**
 * Connection to the runner's Bluetooth LE heart rate monitor.
 *
 * Any monitor implementing the standard Heart Rate Service (0x180D) works,
 * so Polar, Garmin, Wahoo and similar chest straps need no special handling.
 *
 * One BleManager is shared app-wide. Screens that need live heart rate take
 * a hold with `holdHeartRateConnection`; the monitor stays connected while
 * any hold is active and disconnects when the last is released, so the
 * strap isn't kept awake between workouts. A dropped connection is retried
 * with backoff until the holds are released.
 */

import { PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BleManager, State, type Subscription } from 'react-native-ble-plx';
import { base64ToBytes, parseHeartRateMeasurement } from './hrParser';
import type { DiscoveredHrDevice, HrConnection, PairedHrDevice } from './hrTypes';

const HR_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_MEASUREMENT_UUID = '00002a37-0000-1000-8000-00805f9b34fb';
const PAIRED_DEVICE_KEY = '@pacecue/hr_device';

const CONNECT_TIMEOUT_MS = 10_000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15_000;
const POWER_ON_WAIT_MS = 3000;
/**
 * Stay connected this long after the last hold is released, so moving between
 * screens that both hold (pre-run panel to the running workout) doesn't reconnect.
 */
const RELEASE_GRACE_MS = 5000;
/** A reading older than this is no longer shown as the current heart rate. */
const STALE_BPM_MS = 5000;

// ── BleManager ───────────────────────────────────────────────────────

/** undefined until first use; null when Bluetooth isn't available in this build. */
let manager: BleManager | null | undefined;

/**
 * Created on first use rather than at import: on iOS, creating it shows the
 * Bluetooth permission prompt.
 */
function getManager(): BleManager | null {
  if (manager !== undefined) return manager;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    manager = null;
    return null;
  }
  try {
    manager = new BleManager();
  } catch (e) {
    console.warn('Bluetooth unavailable:', e);
    manager = null;
  }
  return manager;
}

/** Wait briefly for the adapter to power on; it reports Unknown right after the manager is created. */
async function waitForPoweredOn(m: BleManager): Promise<State> {
  const current = await m.state();
  if (current === State.PoweredOn) return current;
  return new Promise((resolve) => {
    let settled = false;
    let sub: Subscription | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (state: State) => {
      if (settled) return;
      settled = true;
      sub?.remove();
      if (timer) clearTimeout(timer);
      resolve(state);
    };
    sub = m.onStateChange((state) => {
      if (state === State.PoweredOn || state === State.PoweredOff || state === State.Unauthorized) {
        finish(state);
      }
    }, true);
    if (settled) sub.remove();
    else timer = setTimeout(() => m.state().then(finish, () => finish(State.Unknown)), POWER_ON_WAIT_MS);
  });
}

export type BluetoothStatus = 'ready' | 'off' | 'unauthorized' | 'unsupported';

/** Ask for Bluetooth access. Android needs runtime permissions; iOS prompts when the manager is created. */
export async function requestBluetoothAccess(): Promise<BluetoothStatus> {
  if (Platform.OS === 'android') {
    const granted = await requestAndroidPermissions();
    if (!granted) return 'unauthorized';
  }
  const m = getManager();
  if (!m) return 'unsupported';
  const state = await waitForPoweredOn(m);
  if (state === State.PoweredOn) return 'ready';
  if (state === State.Unauthorized) return 'unauthorized';
  if (state === State.Unsupported) return 'unsupported';
  return 'off';
}

async function requestAndroidPermissions(): Promise<boolean> {
  const P = PermissionsAndroid.PERMISSIONS;
  if (typeof Platform.Version === 'number' && Platform.Version >= 31) {
    const result = await PermissionsAndroid.requestMultiple([P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT]);
    return (
      result[P.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
      result[P.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
    );
  }
  // Android 11 and earlier require location access to scan for BLE devices.
  const result = await PermissionsAndroid.request(P.ACCESS_FINE_LOCATION);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

/** Whether connecting needs no prompt. Never prompts, so it's safe to call once a workout is running. */
async function hasBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const P = PermissionsAndroid.PERMISSIONS;
  if (typeof Platform.Version === 'number' && Platform.Version >= 31) {
    return (
      (await PermissionsAndroid.check(P.BLUETOOTH_SCAN)) &&
      (await PermissionsAndroid.check(P.BLUETOOTH_CONNECT))
    );
  }
  return PermissionsAndroid.check(P.ACCESS_FINE_LOCATION);
}

// ── Scanning ─────────────────────────────────────────────────────────

/**
 * Report heart rate monitors nearby, plus any the phone is already connected
 * to (those may not be advertising). Returns a function that stops the scan.
 */
export function scanForHeartRateMonitors(
  onFound: (device: DiscoveredHrDevice) => void,
  onError: (message: string) => void,
): () => void {
  const m = getManager();
  if (!m) {
    onError('Bluetooth is not available on this device.');
    return () => {};
  }
  let stopped = false;
  const seen = new Set<string>();
  const report = (device: DiscoveredHrDevice) => {
    if (stopped || seen.has(device.id)) return;
    seen.add(device.id);
    onFound(device);
  };

  m.connectedDevices([HR_SERVICE_UUID])
    .then((devices) =>
      devices.forEach((d) => report({ id: d.id, name: d.name ?? d.localName ?? 'Heart Rate Monitor', rssi: null })),
    )
    .catch(() => {});

  m.startDeviceScan([HR_SERVICE_UUID], { allowDuplicates: false }, (error, device) => {
    if (stopped) return;
    if (error) {
      onError(error.message);
      return;
    }
    if (!device) return;
    report({
      id: device.id,
      name: device.name ?? device.localName ?? 'Heart Rate Monitor',
      rssi: device.rssi,
    });
  }).catch((e: Error) => onError(e.message));

  return () => {
    if (stopped) return;
    stopped = true;
    m.stopDeviceScan().catch(() => {});
  };
}

// ── Paired device ────────────────────────────────────────────────────

let pairedDevice: PairedHrDevice | null | undefined;
const pairedListeners = new Set<(device: PairedHrDevice | null) => void>();

export async function getPairedHrDevice(): Promise<PairedHrDevice | null> {
  if (pairedDevice !== undefined) return pairedDevice;
  try {
    const raw = await AsyncStorage.getItem(PAIRED_DEVICE_KEY);
    pairedDevice = raw ? (JSON.parse(raw) as PairedHrDevice) : null;
  } catch {
    pairedDevice = null;
  }
  return pairedDevice;
}

/** Remember a monitor, or forget it with null. Reconnects any active hold to the new device. */
export async function setPairedHrDevice(device: PairedHrDevice | null): Promise<void> {
  pairedDevice = device;
  if (device) await AsyncStorage.setItem(PAIRED_DEVICE_KEY, JSON.stringify(device));
  else await AsyncStorage.removeItem(PAIRED_DEVICE_KEY);
  pairedListeners.forEach((l) => l(device));
  disconnect();
  if (holds > 0 && device) connectTo(device.id);
}

export function addPairedHrDeviceListener(listener: (device: PairedHrDevice | null) => void): () => void {
  pairedListeners.add(listener);
  return () => pairedListeners.delete(listener);
}

// ── Connection ───────────────────────────────────────────────────────

let holds = 0;
let connection: HrConnection = 'off';
let targetId: string | null = null;
/** Bumped whenever the target changes, so stale async connection attempts give up. */
let generation = 0;
/** Whether the target connected during the current hold, so a drop reads as `lost` rather than `connecting`. */
let everConnected = false;
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
let attemptInFlight = false;
let monitorSub: Subscription | null = null;
let disconnectSub: Subscription | null = null;
let lastBpm: number | null = null;
let lastBpmAt = 0;

const bpmListeners = new Set<(bpm: number, at: number) => void>();
const connectionListeners = new Set<(connection: HrConnection) => void>();

function setConnection(next: HrConnection) {
  if (next === connection) return;
  connection = next;
  connectionListeners.forEach((l) => l(next));
}

export function getHrConnection(): HrConnection {
  return connection;
}

/** The latest reading, or null once it's gone stale. */
export function getCurrentBpm(now = Date.now()): number | null {
  return lastBpm != null && now - lastBpmAt <= STALE_BPM_MS ? lastBpm : null;
}

export function addHeartRateListener(listener: (bpm: number, at: number) => void): () => void {
  bpmListeners.add(listener);
  return () => bpmListeners.delete(listener);
}

export function addHrConnectionListener(listener: (connection: HrConnection) => void): () => void {
  connectionListeners.add(listener);
  return () => connectionListeners.delete(listener);
}

/**
 * Keep the paired monitor connected until the returned release function is
 * called. Does nothing visible when no monitor is paired.
 */
export function holdHeartRateConnection(): () => void {
  holds++;
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  if (holds === 1 && !targetId) {
    everConnected = false;
    getPairedHrDevice().then((device) => {
      if (holds > 0 && device && targetId !== device.id) connectTo(device.id);
    });
  } else if (holds === 1 && connection !== 'connected' && !attemptInFlight && !reconnectTimer) {
    // Retries stop while nothing holds the connection, so resume them.
    attemptConnect(targetId!, generation);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds--;
    if (holds > 0) return;
    if (releaseTimer) clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => {
      releaseTimer = null;
      if (holds === 0) disconnect();
    }, RELEASE_GRACE_MS);
  };
}

/** Try connecting again now, e.g. after Bluetooth access was granted or Bluetooth turned on. */
export async function retryHeartRateConnection(): Promise<void> {
  const device = await getPairedHrDevice();
  if (holds > 0 && device) connectTo(device.id);
}

function connectTo(id: string) {
  disconnect();
  targetId = id;
  reconnectAttempt = 0;
  everConnected = false;
  const gen = ++generation;
  setConnection('connecting');
  attemptConnect(id, gen);
}

async function attemptConnect(id: string, gen: number) {
  const m = getManager();
  if (!m) {
    setConnection('off');
    return;
  }
  const isCurrent = () => gen === generation && holds > 0;
  attemptInFlight = true;
  try {
    if (!(await hasBluetoothPermissions())) {
      if (isCurrent()) setConnection('off');
      return;
    }
    const state = await waitForPoweredOn(m);
    if (!isCurrent()) return;
    if (state !== State.PoweredOn) throw new Error(`Bluetooth ${state}`);

    if (!(await m.isDeviceConnected(id))) {
      await m.connectToDevice(id, { timeout: CONNECT_TIMEOUT_MS });
    }
    await m.discoverAllServicesAndCharacteristicsForDevice(id);
    if (!isCurrent()) {
      m.cancelDeviceConnection(id).catch(() => {});
      return;
    }

    disconnectSub = m.onDeviceDisconnected(id, () => {
      if (gen === generation) handleDrop(id, gen);
    });
    monitorSub = m.monitorCharacteristicForDevice(id, HR_SERVICE_UUID, HR_MEASUREMENT_UUID, (error, ch) => {
      if (error || !ch?.value || gen !== generation) return;
      const bpm = parseHeartRateMeasurement(base64ToBytes(ch.value));
      if (bpm == null) return;
      const at = Date.now();
      lastBpm = bpm;
      lastBpmAt = at;
      bpmListeners.forEach((l) => l(bpm, at));
    });
    reconnectAttempt = 0;
    everConnected = true;
    setConnection('connected');
  } catch {
    if (isCurrent()) handleDrop(id, gen);
  } finally {
    attemptInFlight = false;
  }
}

function handleDrop(id: string, gen: number) {
  clearSubscriptions();
  lastBpm = null;
  if (holds === 0 || gen !== generation) return;
  setConnection(everConnected ? 'lost' : 'connecting');
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_MS);
  reconnectAttempt++;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (gen === generation && holds > 0) attemptConnect(id, gen);
  }, delay);
}

function clearSubscriptions() {
  monitorSub?.remove();
  monitorSub = null;
  disconnectSub?.remove();
  disconnectSub = null;
}

function disconnect() {
  generation++;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  clearSubscriptions();
  const id = targetId;
  targetId = null;
  lastBpm = null;
  if (id && manager) manager.cancelDeviceConnection(id).catch(() => {});
  setConnection('off');
}
