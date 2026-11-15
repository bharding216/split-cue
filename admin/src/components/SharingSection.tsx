import type { ShareFunnelRow } from '@/lib/queries';
import StatCard from './StatCard';
import CountBars from './CountBars';

const TYPE_LABELS: Record<string, string> = {
  structure: 'Workout',
  planned: 'Planned run',
  results: 'Result',
  challenge: 'Challenge',
  achievement: 'Achievement',
  unknown: 'Unknown',
};

function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

export default function SharingSection({ data, days }: { data: ShareFunnelRow[]; days: number }) {
  const all = data.find((r) => r.share_type === 'all');
  const byType = data.filter((r) => r.share_type !== 'all');

  return (
    <>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Sharing
      </h2>
      <section className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Shares"
          value={all?.shares ?? 0}
          detail={`${all?.sharers ?? 0} sharers, last ${days} days`}
        />
        <StatCard
          label="Open → Install"
          value={percent(all?.deferred_installs ?? 0, all?.opens ?? 0)}
          format="percent"
          detail={`${all?.deferred_installs ?? 0} installs from ${all?.opens ?? 0} link opens`}
        />
        <StatCard
          label="Activated Runners"
          value={all?.activated_runners ?? 0}
          detail="Finished a shared workout"
        />
        <StatCard
          label="Activated per Sharer"
          value={all?.activated_per_sharer ?? 0}
          detail={`${all?.reshares ?? 0} re-shares and replies`}
        />
      </section>
      <section className="mb-8 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <CountBars
          title="Share Funnel"
          subtitle={`Links created in the last ${days} days`}
          description="Opens are people on the landing page (link preview bots excluded). Installs are first launches that picked up a share link."
          mode="funnel"
          rows={[
            { label: 'Link opens', count: all?.opens ?? 0 },
            { label: 'Store taps', count: all?.store_clicks ?? 0 },
            { label: 'Installs from a link', count: all?.deferred_installs ?? 0 },
            { label: 'Imports', count: all?.imports ?? 0 },
            { label: 'Completed runs', count: all?.completions ?? 0 },
          ]}
          emptyText="No share links opened yet."
        />
        <CountBars
          title="Shares by Type"
          subtitle={`Last ${days} days`}
          mode="share"
          rows={byType.map((r) => ({ label: TYPE_LABELS[r.share_type] ?? r.share_type, count: r.shares }))}
          emptyText="No shares yet."
        />
      </section>
    </>
  );
}
