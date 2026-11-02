import type { CountryCount } from '@/lib/queries';
import { countryLabel } from '@/lib/countryLabel';

type Props = { data: CountryCount[] };

export default function CountriesBreakdown({ data }: Props) {
  const total = data.reduce((sum, row) => sum + row.user_count, 0);

  return (
    <div className="h-full rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-gray-400">
          Countries
        </h2>
        <p className="text-xs text-gray-500">
          {`${total.toLocaleString()} ${total === 1 ? 'device' : 'devices'} · last 30 days`}
        </p>
      </div>

      {total === 0 ? (
        <p className="text-sm text-gray-600">No app opens in the last 30 days.</p>
      ) : (
        <div className="-mr-2 max-h-[440px] space-y-2 overflow-y-auto pr-2">
          {data.map((row) => {
            const share = total > 0 ? (row.user_count / total) * 100 : 0;
            const pct = Math.round(share);
            const pctLabel = share > 0 && share < 1 ? '<1%' : `${pct}%`;

            return (
              <div key={row.country}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-200">
                    {countryLabel(row.country)}
                    {row.country !== 'unknown' && (
                      <span className="ml-2 text-xs text-gray-500">{row.country}</span>
                    )}
                  </span>
                  <span className="tabular-nums text-gray-400">
                    {row.user_count.toLocaleString()}{' '}
                    <span className="text-gray-600">({pctLabel})</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-gray-800">
                  <div
                    className="h-1.5 rounded-full bg-sky-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
