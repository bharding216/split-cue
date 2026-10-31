import type { AppVersionCount } from '@/lib/queries';
import StatCard from '@/components/StatCard';

export default function AppVersionsSection({ data }: { data: AppVersionCount[] }) {
  const total = data.reduce((sum, row) => sum + row.user_count, 0);
  const known = data.filter((row) => row.app_version !== 'unknown');
  const latest = known[0];
  const latestShare = latest && total > 0 ? Math.round((latest.user_count / total) * 100) : 0;
  const mostUsed = known.reduce<AppVersionCount | undefined>(
    (best, row) => (!best || row.user_count > best.user_count ? row : best),
    undefined,
  );

  return (
    <section className="mb-8">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
        App Versions
      </h2>
      <p className="mb-3 text-xs text-gray-500">
        App version from the latest app open in the last 30 days. Each device is counted once.
      </p>
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Devices"
          value={total}
          detail="Opened the app, last 30 days"
        />
        <StatCard
          label="Versions in use"
          value={known.length}
          detail="Distinct app versions"
        />
        <StatCard
          label="On latest"
          value={latestShare}
          format="percent"
          detail={latest ? `${latest.user_count.toLocaleString()} devices on ${latest.app_version}` : 'No versions reported yet'}
        />
        <StatCard
          label="Most used"
          value={mostUsed ? mostUsed.app_version : '—'}
          detail={mostUsed ? `${mostUsed.user_count.toLocaleString()} devices` : 'No versions reported yet'}
        />
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-gray-400">Devices by version</h2>
          <p className="text-xs text-gray-500">
            {`${total.toLocaleString()} ${total === 1 ? 'device' : 'devices'} · last 30 days`}
          </p>
        </div>

        {total === 0 ? (
          <p className="text-sm text-gray-600">No app opens in the last 30 days.</p>
        ) : (
          <div className="space-y-2">
            {data.map((row) => {
              const pct = Math.round((row.user_count / total) * 100);
              return (
                <div key={row.app_version}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-200">
                      {row.app_version === 'unknown' ? 'Unknown' : row.app_version}
                    </span>
                    <span className="tabular-nums text-gray-400">
                      {row.user_count.toLocaleString()}{' '}
                      <span className="text-gray-600">({pct}%)</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-gray-800">
                    <div
                      className="h-1.5 rounded-full bg-emerald-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
