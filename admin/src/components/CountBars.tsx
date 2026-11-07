type Row = { label: string; count: number };

type Props = {
  title: string;
  subtitle?: string;
  description?: string;
  rows: Row[];
  /** Percentages are relative to the first row (a funnel) or to the total (a breakdown). */
  mode: 'funnel' | 'share';
  emptyText: string;
};

export default function CountBars({ title, subtitle, description, rows, mode, emptyText }: Props) {
  const base = mode === 'funnel' ? (rows[0]?.count ?? 0) : rows.reduce((s, r) => s + r.count, 0);
  const max = Math.max(1, ...rows.map((r) => r.count));
  const empty = rows.every((r) => r.count === 0);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-gray-400">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      {description && <p className="mb-4 text-xs text-gray-600">{description}</p>}

      {empty ? (
        <p className="text-sm text-gray-600">{emptyText}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const pct = base > 0 ? Math.round((r.count / base) * 100) : 0;
            return (
              <div key={r.label}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="text-gray-300">{r.label}</span>
                  <span className="tabular-nums text-gray-400">
                    {r.count.toLocaleString()} <span className="text-gray-600">({pct}%)</span>
                  </span>
                </div>
                <div className="h-2 w-full rounded bg-gray-800">
                  <div
                    className="h-2 rounded bg-blue-600/50"
                    style={{ width: `${Math.max((r.count / max) * 100, r.count > 0 ? 2 : 0)}%` }}
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
