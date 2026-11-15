import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase-server';
import { createAuthServerClient } from '@/lib/supabase-server-actions';
import {
  getUsersByAppVersion,
  getUpdateFunnel,
  getUpdatePromptsByVersion,
} from '@/lib/queries';
import SignOutButton from '@/components/SignOutButton';
import StatCard from '@/components/StatCard';
import CountBars from '@/components/CountBars';
import VersionGateForm from './VersionGateForm';

export const dynamic = 'force-dynamic';

type AppMinVersionRow = {
  platform: 'ios' | 'android';
  min_version: string;
  latest_version: string | null;
  updated_at: string;
};

function formatWhen(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function VersionsPage() {
  const auth = await createAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();

  const service = createServiceClient();
  const [minVersionsResult, appVersions, updateFunnel, promptsByVersion] = await Promise.all([
    service.from('app_min_versions').select('platform, min_version, latest_version, updated_at'),
    getUsersByAppVersion(30),
    getUpdateFunnel(30),
    getUpdatePromptsByVersion(30),
  ]);

  const rows = (minVersionsResult.data ?? []) as AppMinVersionRow[];
  const iosRow = rows.find((r) => r.platform === 'ios');
  const androidRow = rows.find((r) => r.platform === 'android');

  const ios = {
    minVersion: iosRow?.min_version ?? '',
    latestVersion: iosRow?.latest_version ?? '',
  };
  const android = {
    minVersion: androidRow?.min_version ?? '',
    latestVersion: androidRow?.latest_version ?? '',
  };

  const lastUpdated = rows
    .map((r) => r.updated_at)
    .filter(Boolean)
    .sort()
    .pop();

  // Compute stat card values from the funnel
  const requiredShown = updateFunnel.find((s) => s.step === 'Required: shown')?.user_count ?? 0;
  const requiredTapped = updateFunnel.find((s) => s.step === 'Required: tapped')?.user_count ?? 0;
  const suggestedShown = updateFunnel.find((s) => s.step === 'Suggested: shown')?.user_count ?? 0;
  const suggestedTapped = updateFunnel.find((s) => s.step === 'Suggested: tapped')?.user_count ?? 0;
  const requiredTapRate = requiredShown > 0 ? Math.round((requiredTapped / requiredShown) * 100) : 0;
  const suggestedTapRate = suggestedShown > 0 ? Math.round((suggestedTapped / suggestedShown) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-200">
            Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-bold">Version Gate</h1>
          <p className="mt-1 text-sm text-gray-400">Signed in as {user?.email}</p>
        </div>
        <SignOutButton />
      </header>

      {/* Current state */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Current Configuration
        </h2>
        <div className="mb-2 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="iOS minimum" value={ios.minVersion || '—'} detail="Builds below are blocked" />
          <StatCard label="iOS latest" value={ios.latestVersion || '—'} detail="Builds below are prompted" />
          <StatCard label="Android minimum" value={android.minVersion || '—'} detail="Builds below are blocked" />
          <StatCard label="Android latest" value={android.latestVersion || '—'} detail="Builds below are prompted" />
        </div>
        <p className="text-xs text-gray-500">Last updated {formatWhen(lastUpdated ?? null)}</p>
      </section>

      {/* Edit form */}
      <section className="mb-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Update Version Gate
        </h2>
        <VersionGateForm ios={ios} android={android} versions={appVersions} />
        <p className="mt-3 text-xs text-gray-500">
          Only raise the minimum version after the replacement build is live in the store.
          Versions are sourced from devices seen in the last 30 days.
        </p>
      </section>

      {/* ── Update Prompt Analytics ──────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Update Prompt Analytics
        </h2>
        <p className="mb-4 text-xs text-gray-500">
          Last 30 days. Shows how many users saw update prompts and what they did.
        </p>

        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Required: shown"
            value={requiredShown}
            detail="Users blocked by min version"
          />
          <StatCard
            label="Required: tap rate"
            value={requiredTapRate}
            format="percent"
            detail={`${requiredTapped} of ${requiredShown} tapped Update`}
          />
          <StatCard
            label="Suggested: shown"
            value={suggestedShown}
            detail="Users prompted to update"
          />
          <StatCard
            label="Suggested: tap rate"
            value={suggestedTapRate}
            format="percent"
            detail={`${suggestedTapped} of ${suggestedShown} tapped Update`}
          />
        </div>

        <CountBars
          title="Update Funnel"
          description="Unique users who saw each prompt and what action they took."
          mode="funnel"
          rows={updateFunnel.map((s) => ({ label: s.step, count: s.user_count }))}
          emptyText="No update prompt events yet."
        />
      </section>

      {/* Prompts by Version */}
      {promptsByVersion.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Prompts by Version
          </h2>
          <p className="mb-4 text-xs text-gray-500">
            Which runtime versions are triggering update prompts. Helps decide when to retire a version.
          </p>
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="mb-3 grid grid-cols-3 text-xs font-medium text-gray-500">
              <span>Version</span>
              <span className="text-right">Required</span>
              <span className="text-right">Suggested</span>
            </div>
            <div className="space-y-2">
              {promptsByVersion.map((row) => (
                <div key={row.runtime_version} className="grid grid-cols-3 text-sm">
                  <span className="text-gray-200">
                    {row.runtime_version === 'unknown' ? 'Unknown' : row.runtime_version}
                  </span>
                  <span className="text-right tabular-nums text-gray-400">
                    {row.required_count > 0 ? row.required_count.toLocaleString() : '—'}
                  </span>
                  <span className="text-right tabular-nums text-gray-400">
                    {row.suggested_count > 0 ? row.suggested_count.toLocaleString() : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
