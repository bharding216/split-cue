import type { AIUserBreakdown } from '@/lib/queries';

type Props = { data: AIUserBreakdown[] };

export default function AIUsageBreakdown({ data }: Props) {
  const totalGenerations = data.reduce((sum, u) => sum + u.generation_count, 0);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-gray-400">
          AI Builder Workouts by User
        </h2>
        <p className="text-xs text-gray-500">
          {totalGenerations.toLocaleString()} generation{totalGenerations !== 1 ? 's' : ''} from{' '}
          {data.length} user{data.length !== 1 ? 's' : ''} · Last 7 days
        </p>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-gray-600">No AI generations in the last 7 days.</p>
      ) : (
        <div className="space-y-2">
          {data.map((user, i) => {
            const pct = totalGenerations > 0
              ? Math.round((user.generation_count / totalGenerations) * 100)
              : 0;

            const lastUsed = new Date(user.latest_at).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              timeZone: 'UTC',
              timeZoneName: 'short',
            });

            return (
              <div key={user.user_id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-xs text-gray-300" title={user.user_id}>
                    {i + 1}. {user.display_name}
                  </span>
                  <span className="tabular-nums text-gray-400">
                    {user.generation_count} gen{user.generation_count !== 1 ? 's' : ''}{' '}
                    <span className="text-gray-600">({pct}%)</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-gray-800">
                  <div
                    className="h-1.5 rounded-full bg-blue-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-0.5 text-[10px] text-gray-600">
                  Last used {lastUsed}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
