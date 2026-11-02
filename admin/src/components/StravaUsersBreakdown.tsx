import type { StravaUser } from '@/lib/queries';

type Props = { data: StravaUser[] };

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

export default function StravaUsersBreakdown({ data }: Props) {
  const totalPushes = data.reduce((sum, u) => sum + u.push_count, 0);
  const maxPushes = Math.max(1, ...data.map((u) => u.push_count));

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-gray-400">
          Strava Pushes by User
        </h2>
        <p className="text-xs text-gray-500">
          {totalPushes.toLocaleString()} push{totalPushes !== 1 ? 'es' : ''} from{' '}
          {data.length} user{data.length !== 1 ? 's' : ''} · All time
        </p>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-gray-600">No users have connected Strava yet.</p>
      ) : (
        <div className="space-y-2">
          {data.map((user, i) => {
            const pct = Math.round((user.push_count / maxPushes) * 100);

            const details = [
              user.athlete_name ? `Strava: ${user.athlete_name}` : null,
              user.is_connected
                ? user.connected_at && `Connected ${formatDate(user.connected_at)}`
                : 'Disconnected',
              `${user.pushes_period} in last 30 days`,
              user.auto_push_count > 0 ? `${user.auto_push_count} auto` : null,
              user.latest_push_at ? `Last push ${formatDate(user.latest_push_at)}` : null,
            ].filter(Boolean);

            return (
              <div key={user.user_id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-xs text-gray-300" title={user.user_id}>
                    {i + 1}. {user.display_name}
                  </span>
                  <span className="tabular-nums text-gray-400">
                    {user.push_count} push{user.push_count !== 1 ? 'es' : ''}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-gray-800">
                  <div
                    className="h-1.5 rounded-full bg-orange-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-0.5 text-[10px] text-gray-600">{details.join(' · ')}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
