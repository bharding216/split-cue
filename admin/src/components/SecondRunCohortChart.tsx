'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { SecondRunCohort } from '@/lib/queries';

type Props = { data: SecondRunCohort[] };

/** Points backed by fewer runners than this are hidden. */
const MIN_SAMPLE = 10;

const WINDOWS = [7, 14, 30] as const;

function rate(returned: number, eligible: number): number | null {
  return eligible >= MIN_SAMPLE ? Math.round((returned / eligible) * 1000) / 10 : null;
}

export default function SecondRunCohortChart({ data }: Props) {
  if (data.length === 0) return null;

  const rows = data.map((c) => ({
    cohort: c.cohort.slice(5),
    firstRunners: c.first_runners,
    r7: rate(c.returned_7, c.eligible_7),
    r14: rate(c.returned_14, c.eligible_14),
    r30: rate(c.returned_30, c.eligible_30),
    counts: Object.fromEntries(
      WINDOWS.map((d) => [`r${d}`, `${c[`returned_${d}`]}/${c[`eligible_${d}`]}`]),
    ) as Record<string, string>,
  }));

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-gray-400">Second Run by Weekly Cohort</h2>
        <p className="text-xs text-gray-500">Week of first run (UTC, Monday start)</p>
      </div>
      <p className="mb-4 text-xs text-gray-600">
        % of first-time runners who logged another run within 7 / 14 / 30 days. A cohort
        shows a rate only once every runner in it has had the full window, and only with at
        least {MIN_SAMPLE} runners.
      </p>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="cohort" tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: 8,
                fontSize: 13,
              }}
              labelStyle={{ color: '#d1d5db' }}
              formatter={(value, name, item) => [
                value == null
                  ? 'not mature'
                  : `${item.payload.counts[item.dataKey as string]} (${value}%)`,
                name,
              ]}
              labelFormatter={(label: string) => {
                const row = rows.find((r) => r.cohort === label);
                return `Week of ${label} · ${row?.firstRunners ?? 0} first runners`;
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
            <Line type="linear" dataKey="r7" name="Within 7 days" stroke="#06b6d4" strokeWidth={1.5} connectNulls={false} />
            <Line type="linear" dataKey="r14" name="Within 14 days" stroke="#f59e0b" strokeWidth={3} connectNulls={false} />
            <Line type="linear" dataKey="r30" name="Within 30 days" stroke="#8b5cf6" strokeWidth={1.5} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
