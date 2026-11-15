'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateVersionGate } from './actions';

type VersionRow = { app_version: string; user_count: number };

type PlatformGate = {
  minVersion: string;
  latestVersion: string;
};

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function affectedDevices(versions: VersionRow[], newMin: string): number {
  return versions
    .filter((v) => v.app_version !== 'unknown' && compareSemver(v.app_version, newMin) < 0)
    .reduce((sum, v) => sum + v.user_count, 0);
}

function buildVersionOptions(versions: VersionRow[], current: string): string[] {
  const set = new Set(
    versions.filter((v) => v.app_version !== 'unknown').map((v) => v.app_version),
  );
  if (current) set.add(current);
  return [...set].sort((a, b) => compareSemver(b, a));
}

export default function VersionGateForm({
  ios,
  android,
  versions,
}: {
  ios: PlatformGate;
  android: PlatformGate;
  versions: VersionRow[];
}) {
  const router = useRouter();
  const versionOptions = buildVersionOptions(versions, '');

  const [iosMin, setIosMin] = useState(ios.minVersion);
  const [iosLatest, setIosLatest] = useState(ios.latestVersion);
  const [androidMin, setAndroidMin] = useState(android.minVersion);
  const [androidLatest, setAndroidLatest] = useState(android.latestVersion);

  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const iosOptions = buildVersionOptions(versions, ios.minVersion || ios.latestVersion);
  const androidOptions = buildVersionOptions(versions, android.minVersion || android.latestVersion);

  const iosChanged = iosMin !== ios.minVersion || iosLatest !== ios.latestVersion;
  const androidChanged = androidMin !== android.minVersion || androidLatest !== android.latestVersion;
  const hasChanges = iosChanged || androidChanged;

  const iosAffected = iosChanged ? affectedDevices(versions, iosMin) : 0;
  const androidAffected = androidChanged ? affectedDevices(versions, androidMin) : 0;

  function review() {
    setError(null);
    setSuccess(null);
    if (!hasChanges) {
      setError('No changes to apply.');
      return;
    }
    if (iosMin && iosLatest && compareSemver(iosLatest, iosMin) < 0) {
      setError('iOS latest version must be ≥ minimum version.');
      return;
    }
    if (androidMin && androidLatest && compareSemver(androidLatest, androidMin) < 0) {
      setError('Android latest version must be ≥ minimum version.');
      return;
    }
    setConfirming(true);
  }

  async function apply() {
    setPending(true);
    setError(null);
    const results: string[] = [];

    if (iosChanged && iosMin && iosLatest) {
      const res = await updateVersionGate({ platform: 'ios', minVersion: iosMin, latestVersion: iosLatest });
      if (!res.ok) {
        setError(res.error ?? 'Failed to update iOS.');
        setPending(false);
        setConfirming(false);
        return;
      }
      results.push('iOS');
    }

    if (androidChanged && androidMin && androidLatest) {
      const res = await updateVersionGate({ platform: 'android', minVersion: androidMin, latestVersion: androidLatest });
      if (!res.ok) {
        setError(res.error ?? 'Failed to update Android.');
        setPending(false);
        setConfirming(false);
        return;
      }
      results.push('Android');
    }

    setPending(false);
    setConfirming(false);
    setSuccess(`Updated ${results.join(' and ')} version gate.`);
    router.refresh();
  }

  const selectClass =
    'w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm outline-none focus:border-gray-500 appearance-none cursor-pointer';

  return (
    <form
      className="space-y-6 rounded-xl border border-gray-800 bg-gray-900 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (confirming) apply();
        else review();
      }}
    >
      {/* iOS */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-gray-200">iOS</legend>
        <label className="block">
          <span className="mb-1.5 block text-sm text-gray-300">Minimum version</span>
          <select
            value={iosMin}
            onChange={(e) => { setConfirming(false); setIosMin(e.target.value); }}
            className={selectClass}
          >
            <option value="">Not set</option>
            {iosOptions.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-gray-300">Latest version</span>
          <select
            value={iosLatest}
            onChange={(e) => { setConfirming(false); setIosLatest(e.target.value); }}
            className={selectClass}
          >
            <option value="">Not set</option>
            {iosOptions.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        {iosChanged && iosAffected > 0 && (
          <p className="text-sm text-red-400">
            {iosAffected} device{iosAffected === 1 ? '' : 's'} would be blocked by this minimum.
          </p>
        )}
      </fieldset>

      {/* Android */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-gray-200">Android</legend>
        <label className="block">
          <span className="mb-1.5 block text-sm text-gray-300">Minimum version</span>
          <select
            value={androidMin}
            onChange={(e) => { setConfirming(false); setAndroidMin(e.target.value); }}
            className={selectClass}
          >
            <option value="">Not set</option>
            {androidOptions.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-gray-300">Latest version</span>
          <select
            value={androidLatest}
            onChange={(e) => { setConfirming(false); setAndroidLatest(e.target.value); }}
            className={selectClass}
          >
            <option value="">Not set</option>
            {androidOptions.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        {androidChanged && androidAffected > 0 && (
          <p className="text-sm text-red-400">
            {androidAffected} device{androidAffected === 1 ? '' : 's'} would be blocked by this minimum.
          </p>
        )}
      </fieldset>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-emerald-400">{success}</p>}

      {confirming ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-gray-700 bg-gray-950 p-3 text-sm text-gray-200">
            {iosChanged && (
              <p>iOS: minimum {iosMin || '(unset)'}, latest {iosLatest || '(unset)'}
                {iosAffected > 0 && <span className="text-red-400"> — {iosAffected} device{iosAffected === 1 ? '' : 's'} blocked</span>}
              </p>
            )}
            {androidChanged && (
              <p>Android: minimum {androidMin || '(unset)'}, latest {androidLatest || '(unset)'}
                {androidAffected > 0 && <span className="text-red-400"> — {androidAffected} device{androidAffected === 1 ? '' : 's'} blocked</span>}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-gray-950 disabled:opacity-60"
            >
              {pending ? 'Applying…' : 'Apply'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <button
          type="submit"
          disabled={!hasChanges}
          className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-950 disabled:opacity-40"
        >
          Review changes
        </button>
      )}
    </form>
  );
}
