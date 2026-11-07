import Link from 'next/link';
import type { FirstRunUser } from '@/lib/queries';

type Props = { data: FirstRunUser[] };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function FirstRunUsersTable({ data }: Props) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-gray-400">New Runners</h2>
        <p className="text-xs text-gray-500">
          {data.length} first run{data.length !== 1 ? 's' : ''}, last 30 days
        </p>
      </div>
      <p className="mb-4 text-xs text-gray-600">
        Each device&apos;s first qualifying run and whether they came back. Click a runner for
        their full event timeline.
      </p>

      {data.length === 0 ? (
        <p className="text-sm text-gray-600">No first runs yet.</p>
      ) : (
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900">
              <tr className="text-left text-[11px] text-gray-600">
                <th className="pb-2 font-normal">Runner</th>
                <th className="pb-2 font-normal">First run</th>
                <th className="pb-2 font-normal">Workout</th>
                <th className="pb-2 font-normal">How</th>
                <th className="pb-2 text-right font-normal">Min</th>
                <th className="pb-2 font-normal">Came back</th>
                <th className="pb-2 text-right font-normal">Runs</th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.anonymous_user_id} className="border-t border-gray-800/60 align-top">
                  <td className="py-1.5 pr-3">
                    <Link
                      href={`/users/${encodeURIComponent(u.anonymous_user_id)}`}
                      className="text-blue-300 hover:text-blue-200"
                    >
                      {u.display_name ?? (
                        <span className="font-mono text-xs">{u.anonymous_user_id.slice(0, 8)}…</span>
                      )}
                    </Link>
                    <div className="text-[11px] text-gray-600">
                      {[u.platform, u.country].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-gray-400">
                    {formatDate(u.first_at)}
                  </td>
                  <td className="py-1.5 pr-3 text-gray-300">
                    {u.first_workout || '—'}
                    <div className="text-[11px] text-gray-600">
                      {u.first_category ?? ''}
                      {u.first_ended === 'stopped early' && (
                        <span className="ml-1 text-amber-400/70">stopped early</span>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 pr-3 text-xs text-gray-400">{u.first_source ?? '—'}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-gray-400">
                    {u.first_minutes}
                  </td>
                  <td className="py-1.5 pr-3">
                    {u.second_at ? (
                      <span className="text-emerald-400/90">
                        after {u.gap_days}d
                        <div className="text-[11px] text-gray-600">{u.second_workout ?? ''}</div>
                      </span>
                    ) : (
                      <span className="text-gray-600">not yet</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-gray-400">{u.total_runs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
