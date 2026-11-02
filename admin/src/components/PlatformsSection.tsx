import type { CountryPlatformCount } from '@/lib/queries';
import StatCard from '@/components/StatCard';

const SEGMENTS = [
  { platform: 'ios', label: 'iOS', color: 'bg-sky-500' },
  { platform: 'android', label: 'Android', color: 'bg-emerald-500' },
  { platform: 'unknown', label: 'Unknown', color: 'bg-gray-600' },
] as const;

export default function PlatformsSection({ data }: { data: CountryPlatformCount[] }) {
  const counts = { ios: 0, android: 0, unknown: 0 };
  for (const row of data) counts[row.platform] += row.user_count;
  const total = counts.ios + counts.android + counts.unknown;
  const known = counts.ios + counts.android;
  const shareOf = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

  return (
    <section className="mb-8">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Platforms
      </h2>
      <p className="mb-3 text-xs text-gray-500">
        Device platform from the latest app open in the last 30 days. Each device is counted once.
      </p>
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label="iOS"
          value={counts.ios}
          detail={`${shareOf(counts.ios, known)}% of devices with a known platform`}
        />
        <StatCard
          label="Android"
          value={counts.android}
          detail={`${shareOf(counts.android, known)}% of devices with a known platform`}
        />
        <StatCard
          label="Unknown"
          value={counts.unknown}
          detail="Latest open came from a build without platform tracking"
        />
      </div>

      {total > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-800">
            {SEGMENTS.map(({ platform, color }) =>
              counts[platform] > 0 ? (
                <div
                  key={platform}
                  className={color}
                  style={{ width: `${(counts[platform] / total) * 100}%` }}
                />
              ) : null,
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400">
            {SEGMENTS.map(({ platform, label, color }) => (
              <span key={platform} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${color}`} />
                {label}
                <span className="tabular-nums text-gray-500">
                  {counts[platform].toLocaleString()} ({shareOf(counts[platform], total)}%)
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
