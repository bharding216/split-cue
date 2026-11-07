import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase-server';
import { getUserTimeline, type TimelineEvent } from '@/lib/queries';
import SignOutButton from '@/components/SignOutButton';

export const dynamic = 'force-dynamic';

type Device = {
  platform: string | null;
  model_name: string | null;
  os_version: string | null;
  app_version: string | null;
  country: string | null;
  timezone: string | null;
  notifications: string | null;
  location_foreground: string | null;
  subscription_tier: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  user_id: string | null;
};

const RUN_EVENTS = new Set(['workout_completed', 'workout_abandoned', 'first_run_completed']);

/** Metadata keys worth showing inline; the rest stay in the expandable JSON. */
const SUMMARY_KEYS = [
  'workout_name',
  'workout_source',
  'workout_origin',
  'workout_category',
  'qualifies',
  'run_number',
  'completion_pct',
  'suggested_date',
  'reason',
  'tag',
  'moment_id',
];

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Same rule as the qualifying_runs view in Postgres. */
function qualifies(e: TimelineEvent): boolean {
  if (e.event_name === 'workout_completed') return true;
  const meta = e.metadata ?? {};
  if (typeof meta.qualifies === 'boolean') return meta.qualifies;
  const pct = Number(meta.completion_pct ?? 0);
  return pct >= 50 || (pct === 0 && Number(meta.elapsed_ms ?? 0) >= 600_000);
}

function minutes(meta: Record<string, unknown>): string | null {
  const ms = Number(meta.total_duration_ms ?? meta.elapsed_ms);
  return Number.isFinite(ms) && ms > 0 ? `${Math.round(ms / 60000)} min` : null;
}

function EventRow({ event }: { event: TimelineEvent }) {
  const meta = event.metadata ?? {};
  const isRun = RUN_EVENTS.has(event.event_name);
  const summary = SUMMARY_KEYS.filter((k) => meta[k] != null && meta[k] !== '').map(
    (k) => `${k.replace(/_/g, ' ')}: ${String(meta[k])}`,
  );
  const mins = isRun ? minutes(meta) : null;
  if (mins) summary.unshift(mins);

  return (
    <li className="border-t border-gray-800/60 py-2">
      <details>
        <summary className="flex cursor-pointer list-none items-baseline gap-3 [&::-webkit-details-marker]:hidden">
          <span className="w-40 shrink-0 text-xs tabular-nums text-gray-500">
            {formatWhen(event.created_at)}
          </span>
          <span
            className={`text-sm ${
              event.event_name === 'workout_completed'
                ? 'font-semibold text-emerald-300'
                : event.event_name === 'workout_abandoned'
                  ? 'text-amber-300'
                  : event.event_name === 'first_run_completed'
                    ? 'font-semibold text-blue-300'
                    : 'text-gray-300'
            }`}
          >
            {event.event_name}
          </span>
          {event.environment && event.environment !== 'production' && (
            <span className="rounded bg-gray-800 px-1.5 text-[10px] text-gray-400">
              {event.environment}
            </span>
          )}
          <span className="min-w-0 truncate text-xs text-gray-500">{summary.join(' · ')}</span>
        </summary>
        <pre className="mt-2 max-h-80 overflow-auto rounded bg-gray-950 p-3 text-[11px] text-gray-400">
          {JSON.stringify({ app_version: event.app_version, ...meta }, null, 2)}
        </pre>
      </details>
    </li>
  );
}

export default async function UserTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const anonymousUserId = decodeURIComponent(rawId);
  const service = createServiceClient();

  const [events, deviceResult] = await Promise.all([
    getUserTimeline(anonymousUserId, 500),
    service
      .from('devices')
      .select(
        'platform, model_name, os_version, app_version, country, timezone, notifications, location_foreground, subscription_tier, first_seen_at, last_seen_at, user_id',
      )
      .eq('anonymous_user_id', anonymousUserId)
      .maybeSingle(),
  ]);
  const device = (deviceResult.data ?? null) as Device | null;

  const userId = device?.user_id ?? events.find((e) => e.user_id)?.user_id ?? null;
  let accountLabel: string | null = null;
  if (userId) {
    const [{ data: profile }, { data: authUser }] = await Promise.all([
      service.from('profiles').select('display_name').eq('id', userId).maybeSingle(),
      service.auth.admin.getUserById(userId),
    ]);
    accountLabel = profile?.display_name || authUser?.user?.email || userId;
  }

  const runs = events.filter((e) => e.event_name === 'workout_completed' || e.event_name === 'workout_abandoned');
  const qualifying = runs.filter(qualifies).length;
  const firstSeen = events.length > 0 ? events[events.length - 1].created_at : null;

  const facts: [string, string | null | undefined][] = [
    ['Account', accountLabel ?? 'Not signed in'],
    ['Device', [device?.platform, device?.model_name, device?.os_version].filter(Boolean).join(' · ') || null],
    ['App version', device?.app_version],
    ['Country', device?.country],
    ['Timezone', device?.timezone],
    ['Notifications', device?.notifications],
    ['Location', device?.location_foreground],
    ['Tier', device?.subscription_tier],
    ['First seen', firstSeen ? formatWhen(firstSeen) : null],
    ['Last seen', device?.last_seen_at ? formatWhen(device.last_seen_at) : null],
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <Link href="/retention" className="text-sm text-gray-400 hover:text-gray-200">
            Retention
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{accountLabel ?? 'Anonymous runner'}</h1>
          <p className="mt-1 font-mono text-xs text-gray-500">{anonymousUserId}</p>
        </div>
        <SignOutButton />
      </header>

      <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 md:col-span-2">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {facts.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="text-gray-500">{label}</dt>
                <dd className="truncate text-right text-gray-300">{value || '—'}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <p className="text-sm font-medium text-gray-400">Runs</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{qualifying}</p>
          <p className="mt-1 text-xs text-gray-500">
            {runs.length} ended, {runs.length - qualifying} stopped too early to count
          </p>
        </div>
      </section>

      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Timeline ({events.length}
        {events.length === 500 ? ', most recent 500' : ''})
      </h2>
      {events.length === 0 ? (
        <p className="text-sm text-gray-500">No events for this device.</p>
      ) : (
        <ul className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-2">
          {events.map((e, i) => (
            <EventRow key={`${e.created_at}-${i}`} event={e} />
          ))}
        </ul>
      )}
    </div>
  );
}
