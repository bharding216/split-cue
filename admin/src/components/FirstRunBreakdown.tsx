import type { FirstRunBreakdownRow } from '@/lib/queries';

type Props = { data: FirstRunBreakdownRow[]; overallPct: number | null };

/** Rates from fewer mature runners than this are shown faded. */
const MIN_SAMPLE = 10;

const DIMENSION_ORDER = [
  'Source',
  'Origin',
  'Category',
  'Structure',
  'Quick start',
  'Duration',
  'Ended',
  'Audio cues',
  'GPS',
  'Planned next run',
  'Platform',
];

export default function FirstRunBreakdown({ data, overallPct }: Props) {
  if (data.length === 0) return null;

  const dimensions = [...new Set(data.map((d) => d.dimension))].sort(
    (a, b) => DIMENSION_ORDER.indexOf(a) - DIMENSION_ORDER.indexOf(b),
  );

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-gray-400">How First Runs Start</h2>
        <p className="text-xs text-gray-500">First runs in the last 90 days</p>
      </div>
      <p className="mb-4 text-xs text-gray-600">
        14-day return rate by what the first run looked like. &quot;unknown&quot; is runs from
        app builds before workout context was tracked. These are correlations, not causes;
        faded rates have fewer than {MIN_SAMPLE} runners old enough to count.
        {overallPct != null && ` Overall: ${overallPct}%.`}
      </p>

      <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
        {dimensions.map((dim) => {
          const rows = data.filter((d) => d.dimension === dim);
          return (
            <div key={dim}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                {dim}
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-gray-600">
                    <th className="pb-1 font-normal">Value</th>
                    <th className="pb-1 text-right font-normal">First runs</th>
                    <th className="pb-1 text-right font-normal">Returned</th>
                    <th className="w-28 pb-1 text-right font-normal">14-day rate</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const thin = r.eligible < MIN_SAMPLE;
                    const delta =
                      r.return_pct != null && overallPct != null
                        ? Math.round((r.return_pct - overallPct) * 10) / 10
                        : null;
                    return (
                      <tr key={r.value} className="border-t border-gray-800/60">
                        <td className="py-1 text-gray-300">{r.value}</td>
                        <td className="py-1 text-right tabular-nums text-gray-400">
                          {r.first_runners}
                        </td>
                        <td className="py-1 text-right tabular-nums text-gray-500">
                          {r.returned}/{r.eligible}
                        </td>
                        <td
                          className={`py-1 text-right tabular-nums ${thin ? 'text-gray-600' : 'text-gray-200'}`}
                        >
                          {r.return_pct == null ? '—' : `${r.return_pct}%`}
                          {delta != null && !thin && delta !== 0 && (
                            <span
                              className={`ml-1.5 text-xs ${delta > 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}
                            >
                              {delta > 0 ? '+' : ''}
                              {delta}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
