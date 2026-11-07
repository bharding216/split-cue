import Link from 'next/link';
import type { UserEventBreakdown } from '@/lib/queries';

type Props = { data: UserEventBreakdown[] };

export default function TodaysActivity({ data }: Props) {
  const totalEvents = data.reduce((sum, u) => sum + u.event_count, 0);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-gray-400">
          Today&apos;s Activity
        </h2>
        <p className="text-xs text-gray-500">
          {totalEvents.toLocaleString()} events from {data.length} user{data.length !== 1 ? 's' : ''}
        </p>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-gray-600">No events today.</p>
      ) : (
        <div className="-mr-2 max-h-[400px] space-y-1 overflow-y-auto pr-2">
          {data.map((user, i) => {
            const pct = totalEvents > 0
              ? Math.round((user.event_count / totalEvents) * 100)
              : 0;

            return (
              <details key={user.anonymous_user_id} className="group rounded-md">
                <summary className="cursor-pointer list-none rounded-md px-1 py-1 hover:bg-gray-800/50 [&::-webkit-details-marker]:hidden">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-xs text-gray-300" title={user.anonymous_user_id}>
                      <span className="text-[10px] text-gray-600 transition-transform group-open:rotate-90">
                        ▶
                      </span>
                      {i + 1}.{' '}
                      {user.display_name === user.anonymous_user_id ? (
                        <span className="font-mono">{user.anonymous_user_id.slice(0, 8)}…</span>
                      ) : (
                        user.display_name
                      )}
                    </span>
                    <span className="tabular-nums text-gray-400">
                      {user.event_count} event{user.event_count !== 1 ? 's' : ''}{' '}
                      <span className="text-gray-600">({pct}%)</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-gray-800">
                    <div
                      className="h-1.5 rounded-full bg-emerald-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </summary>
                <div className="mt-1 flex flex-wrap gap-1 px-1 pb-1">
                  <Link
                    href={`/users/${encodeURIComponent(user.anonymous_user_id)}`}
                    className="rounded bg-blue-900/40 px-1.5 py-0.5 text-[10px] text-blue-300 hover:bg-blue-900/60"
                  >
                    Timeline →
                  </Link>
                  {user.events.map((evt) => (
                    <span
                      key={evt}
                      className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400"
                    >
                      {evt}
                    </span>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
