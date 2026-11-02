import type { TrainingPlanUserBreakdown } from '@/lib/queries';

type Props = { data: TrainingPlanUserBreakdown[] };

export default function TrainingPlansBreakdown({ data }: Props) {
  const totalPlans = data.reduce((sum, u) => sum + u.plan_count, 0);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-gray-400">
          AI Training Plans by User
        </h2>
        <p className="text-xs text-gray-500">
          {totalPlans.toLocaleString()} plan{totalPlans !== 1 ? 's' : ''} from{' '}
          {data.length} user{data.length !== 1 ? 's' : ''} · Last 30 days
        </p>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-gray-600">No AI training plans in the last 30 days.</p>
      ) : (
        <div className="space-y-2">
          {data.map((user, i) => {
            const pct = totalPlans > 0
              ? Math.round((user.plan_count / totalPlans) * 100)
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
                    {user.plan_count} plan{user.plan_count !== 1 ? 's' : ''}{' '}
                    <span className="text-gray-600">({pct}%)</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-gray-800">
                  <div
                    className="h-1.5 rounded-full bg-emerald-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-0.5 text-[10px] text-gray-600">
                  {user.accepted_count}/{user.plan_count} accepted · Last generated {lastUsed}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
