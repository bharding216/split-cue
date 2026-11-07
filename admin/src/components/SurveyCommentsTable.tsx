import Link from 'next/link';
import type { SurveyComment } from '@/lib/queries';

type Props = {
  data: SurveyComment[];
  reasonLabels: Record<string, string>;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SurveyCommentsTable({ data, reasonLabels }: Props) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-gray-400">What Lapsed Runners Told Us</h2>
        <p className="text-xs text-gray-500">
          {data.length} comment{data.length !== 1 ? 's' : ''}, last 90 days
        </p>
      </div>
      <p className="mb-4 text-xs text-gray-600">
        Optional comments written after picking a reason. &quot;Since&quot; counts runs logged after
        answering. Click a runner for their full event timeline.
      </p>

      {data.length === 0 ? (
        <p className="text-sm text-gray-600">No comments yet.</p>
      ) : (
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900">
              <tr className="text-left text-[11px] text-gray-600">
                <th className="pb-2 font-normal">Date</th>
                <th className="pb-2 font-normal">Reason</th>
                <th className="pb-2 font-normal">Comment</th>
                <th className="pb-2 text-right font-normal">Since</th>
                <th className="pb-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={`${c.anonymous_user_id}-${c.created_at}`} className="border-t border-gray-800/60 align-top">
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-400">
                    {formatDate(c.created_at)}
                    <div className="text-[11px] text-gray-600">
                      {[c.platform, c.app_version].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-400">
                    {c.reason ? (reasonLabels[c.reason] ?? c.reason) : '—'}
                  </td>
                  <td className="whitespace-pre-wrap py-2 pr-3 text-gray-200">{c.detail}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {c.runs_since > 0 ? (
                      <span className="text-emerald-400/90">{c.runs_since}</span>
                    ) : (
                      <span className="text-gray-600">0</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2">
                    <Link
                      href={`/users/${encodeURIComponent(c.anonymous_user_id)}`}
                      className="text-xs text-blue-300 hover:text-blue-200"
                    >
                      Timeline →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
