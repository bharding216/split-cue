import type { FirstRunBreakdownRow } from '@/lib/queries';

type Props = { data: FirstRunBreakdownRow[]; overallPct: number | null };

/** Rates from fewer mature runners than this are shown faded and left out of takeaways. */
const MIN_SAMPLE = 10;

const DIMENSION_ORDER = [
  'Ended',
  'Duration',
  'Source',
  'Origin',
  'Category',
  'Structure',
  'Quick start',
  'Audio cues',
  'GPS',
  'Planned next run',
  'Platform',
];

/** Values with a natural order; anything else sorts by first runs. */
const VALUE_ORDER: Record<string, string[]> = {
  Duration: ['< 15 min', '15-30 min', '30-45 min', '45-60 min', '60+ min'],
  Ended: ['finished', 'stopped early'],
  GPS: ['good', 'poor', 'no fix', 'off'],
  'Planned next run': ['yes', 'no'],
};

function isUsable(r: FirstRunBreakdownRow) {
  return r.value !== 'unknown' && r.return_pct != null && r.eligible >= MIN_SAMPLE;
}

function sortValues(dim: string, rows: FirstRunBreakdownRow[]) {
  const order = VALUE_ORDER[dim];
  if (!order) return [...rows].sort((a, b) => b.first_runners - a.first_runners);
  const rank = (v: string) => (order.includes(v) ? order.indexOf(v) : order.length);
  return [...rows].sort((a, b) => rank(a.value) - rank(b.value));
}

export default function FirstRunBreakdown({ data, overallPct }: Props) {
  if (data.length === 0) return null;

  const dimensions = [...new Set(data.map((d) => d.dimension))]
    .sort((a, b) => DIMENSION_ORDER.indexOf(a) - DIMENSION_ORDER.indexOf(b))
    .map((dim) => {
      const all = data.filter((d) => d.dimension === dim);
      const known = sortValues(dim, all.filter((r) => r.value !== 'unknown'));
      const usable = known.filter(isUsable);
      return {
        dim,
        known,
        usable,
        total: all.reduce((s, r) => s + r.first_runners, 0),
        tracked: known.reduce((s, r) => s + r.first_runners, 0),
      };
    });

  const shown = dimensions.filter((d) => d.usable.length >= 2);
  const waiting = dimensions.filter((d) => d.usable.length < 2).map((d) => d.dim);

  const takeaways = shown
    .map(({ dim, usable }) => {
      const byRate = [...usable].sort((a, b) => b.return_pct! - a.return_pct!);
      const best = byRate[0];
      const worst = byRate[byRate.length - 1];
      return { dim, best, worst, spread: best.return_pct! - worst.return_pct! };
    })
    .sort((a, b) => b.spread - a.spread);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-gray-400">How First Runs Start</h2>
        <p className="text-xs text-gray-500">First runs in the last 90 days</p>
      </div>
      <p className="mb-4 text-xs text-gray-600">
        % of first-time runners who came back within 14 days, by what their first run looked
        like. These are correlations, not causes.
        {overallPct != null && ` Overall: ${overallPct}%.`}
      </p>

      {takeaways.length > 0 && (
        <ul className="mb-6 space-y-1.5 rounded-lg bg-gray-800/40 p-3 text-sm">
          {takeaways.map(({ dim, best, worst }) => (
            <li key={dim} className="text-gray-300">
              <span className="text-gray-500">{dim}:</span>{' '}
              <span className="font-medium text-emerald-400/90">{best.value}</span> runners came back{' '}
              <span className="font-medium tabular-nums text-gray-100">{best.return_pct}%</span> of the
              time vs{' '}
              <span className="font-medium tabular-nums text-gray-100">{worst.return_pct}%</span> for{' '}
              <span className="font-medium text-red-400/90">{worst.value}</span>
              <span className="text-xs text-gray-600">
                {' '}
                ({best.eligible} vs {worst.eligible} runners)
              </span>
            </li>
          ))}
        </ul>
      )}

      {shown.length > 0 && (
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
          {shown.map(({ dim, known, tracked, total }) => (
            <div key={dim}>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {dim}
                </h3>
                {tracked < total && (
                  <span className="text-[11px] text-gray-600">
                    {tracked} of {total} first runs tracked
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {known.map((r) => {
                  const thin = !isUsable(r);
                  const above = overallPct != null && r.return_pct != null && r.return_pct >= overallPct;
                  const barColor = thin
                    ? 'bg-gray-600/40'
                    : above
                      ? 'bg-emerald-500/50'
                      : 'bg-red-500/40';
                  return (
                    <div key={r.value}>
                      <div className="mb-0.5 flex items-baseline justify-between text-sm">
                        <span className={thin ? 'text-gray-500' : 'text-gray-300'}>
                          {r.value}
                          {thin && r.eligible > 0 && (
                            <span className="ml-1.5 text-[10px] uppercase text-gray-600">early</span>
                          )}
                        </span>
                        <span className="tabular-nums text-xs text-gray-500">
                          {r.return_pct == null ? (
                            'no data yet'
                          ) : (
                            <>
                              <span className={thin ? 'text-gray-500' : 'text-gray-200'}>
                                {r.return_pct}%
                              </span>
                              {' · '}
                              {r.returned}/{r.eligible}
                            </>
                          )}
                        </span>
                      </div>
                      <div className="relative h-2 w-full rounded bg-gray-800">
                        <div
                          className={`h-2 rounded ${barColor}`}
                          style={{ width: `${r.return_pct ?? 0}%` }}
                        />
                        {overallPct != null && (
                          <div
                            className="absolute -top-0.5 h-3 w-px bg-gray-300"
                            style={{ left: `${overallPct}%` }}
                            title={`Overall ${overallPct}%`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {overallPct != null && shown.length > 0 && (
        <p className="mt-4 text-[11px] text-gray-600">
          White tick marks the overall rate. Green bars beat it, red bars trail it, grey bars
          have fewer than {MIN_SAMPLE} runners old enough to count.
        </p>
      )}

      {waiting.length > 0 && (
        <p className="mt-4 border-t border-gray-800 pt-3 text-xs text-gray-500">
          <span className="text-gray-400">Waiting for data:</span> {waiting.join(', ')}. These
          need at least two values with {MIN_SAMPLE}+ runners whose first run was 14+ days ago,
          from app builds that track them.
        </p>
      )}
    </div>
  );
}
