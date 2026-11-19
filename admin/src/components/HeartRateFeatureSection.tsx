import type { HeartRateFeatureStats, HeartRateRetentionRow, HrScanFunnelRow, HrNotListedStats } from '@/lib/queries';
import StatCard from '@/components/StatCard';
import CountBars from '@/components/CountBars';

type Props = {
  stats: HeartRateFeatureStats;
  retention: HeartRateRetentionRow[];
  scanFunnel: HrScanFunnelRow[];
  notListed: HrNotListedStats;
  days: number;
  retentionDays: number;
};

export default function HeartRateFeatureSection({ stats, retention, scanFunnel, notListed, days, retentionDays }: Props) {
  const consentAnswers = stats.consentGranted + stats.consentDeclined;

  const uniqueDeviceNames = Array.from(
    new Map(notListed.deviceNames.map((d) => [d.name.toLowerCase(), d])).values(),
  );

  return (
    <>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Heart Rate
      </h2>
      <section className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="HR Adoption"
          value={stats.adoptionPct}
          format="percent"
          detail={`${stats.hrDevices}/${stats.activeDevices} devices that started a workout connected a monitor, last ${days} days`}
        />
        <StatCard
          label="HR Workout Completion"
          value={stats.completionPct}
          format="percent"
          detail={`${stats.hrWorkoutsCompleted}/${stats.hrWorkoutsStarted} workouts with a paired monitor finished`}
        />
        <StatCard
          label="Analysis Engagement"
          value={stats.analysisPct}
          format="percent"
          detail={`${stats.analysisViewers}/${stats.hrCompleters} HR runners opened a run's heart rate`}
        />
        <StatCard
          label="Pro Conversion"
          value={stats.conversionPct}
          format="percent"
          detail={`${stats.upgradeConverted}/${stats.upgradeClickers} who tapped the HR upgrade are Pro now`}
        />
        <StatCard
          label="Cloud Saving Opt-in"
          value={consentAnswers === 0 ? 0 : Math.round((stats.consentGranted / consentAnswers) * 1000) / 10}
          format="percent"
          detail={`${stats.consentGranted} saved to account, ${stats.consentDeclined} kept on phone`}
        />
        <StatCard
          label="Connection Failures"
          value={stats.connectionFailures}
          detail={`Monitors that never connected, last ${days} days`}
        />
      </section>

      {/* ── Scan Funnel & Not-Listed ─────────────────── */}
      <section className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CountBars
          title="HR Scan Outcomes by Guide Kind"
          subtitle={`Last ${days} days`}
          description="Scans that ended with a device found vs. timed out / user-cancelled, grouped by the active device guide."
          mode="share"
          rows={scanFunnel.map((r) => ({
            label: `${r.guide_kind}: ${r.scans_found} found / ${r.scans_empty} empty (${r.success_pct}%)`,
            count: r.total_scans,
          }))}
          emptyText="No HR scan events in this window."
        />

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="mb-1 flex items-baseline justify-between">
            <h3 className="text-sm font-medium text-gray-400">Device Not Listed</h3>
            <p className="text-xs text-gray-500">Last {days} days</p>
          </div>
          <p className="mb-3 text-xs text-gray-600">
            Users who tapped &ldquo;My device isn&apos;t listed&rdquo; during an empty scan.
          </p>
          <div className="mb-3 grid grid-cols-2 gap-4">
            <StatCard label="Reports" value={notListed.totalReports} detail={`${notListed.uniqueReporters} unique users`} />
          </div>
          {uniqueDeviceNames.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded border border-gray-800 bg-gray-950 p-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="pb-1 font-medium">Device</th>
                    <th className="pb-1 text-right font-medium">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {uniqueDeviceNames.map((d, i) => (
                    <tr key={i} className="border-t border-gray-800 text-gray-300">
                      <td className="py-1">{d.name}</td>
                      <td className="py-1 text-right text-gray-500">{d.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-gray-400">Heart Rate vs. No Heart Rate</h3>
          <p className="text-xs text-gray-500">First run in the last {retentionDays} days</p>
        </div>
        {retention.length === 0 ? (
          <p className="text-sm text-gray-600">No first-time runners in this window yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="pb-2 font-medium">Runners</th>
                <th className="pb-2 text-right font-medium">Count</th>
                <th className="pb-2 text-right font-medium">2nd run</th>
                <th className="pb-2 text-right font-medium">Runs / active week</th>
                <th className="pb-2 text-right font-medium">Pro</th>
              </tr>
            </thead>
            <tbody>
              {retention.map((row) => (
                <tr key={row.cohort} className="border-t border-gray-800 text-gray-300">
                  <td className="py-2">{row.cohort}</td>
                  <td className="py-2 text-right tabular-nums">{row.runners.toLocaleString()}</td>
                  <td className="py-2 text-right tabular-nums">{row.second_run_pct}%</td>
                  <td className="py-2 text-right tabular-nums">{row.runs_per_active_week ?? '—'}</td>
                  <td className="py-2 text-right tabular-nums">{row.pro_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-gray-500">
          Correlation, not causation: runners who own a heart rate monitor may already be more
          committed, so a gap here doesn&apos;t prove the feature caused it.
        </p>
      </section>
    </>
  );
}
