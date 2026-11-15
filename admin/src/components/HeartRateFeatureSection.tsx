import type { HeartRateFeatureStats, HeartRateRetentionRow } from '@/lib/queries';
import StatCard from '@/components/StatCard';

type Props = {
  stats: HeartRateFeatureStats;
  retention: HeartRateRetentionRow[];
  days: number;
  retentionDays: number;
};

export default function HeartRateFeatureSection({ stats, retention, days, retentionDays }: Props) {
  const consentAnswers = stats.consentGranted + stats.consentDeclined;

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
