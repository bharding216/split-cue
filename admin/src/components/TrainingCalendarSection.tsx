'use client';

import type { TrainingCalendarStats, TrainingCalendarDaily } from '@/lib/queries';
import StatCard from '@/components/StatCard';

type Props = {
  stats: TrainingCalendarStats;
  daily: TrainingCalendarDaily[];
  days: number;
};

export default function TrainingCalendarSection({ stats, daily, days }: Props) {
  const actionRate =
    stats.viewers === 0
      ? 0
      : Math.round((stats.viewersWithAction / stats.viewers) * 1000) / 10;

  const maxY = Math.max(...daily.map((d) => Math.max(d.viewers, d.added, d.started)), 1);

  return (
    <>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Training Calendar
      </h2>

      {/* Summary stat cards */}
      <section className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Calendar Viewers"
          value={stats.viewers}
          detail={`Unique devices, last ${days} days`}
        />
        <StatCard
          label="Engaged Viewers"
          value={actionRate}
          format="percent"
          detail={`${stats.viewersWithAction}/${stats.viewers} took an action beyond viewing`}
        />
        <StatCard
          label="Workouts Added"
          value={stats.workoutsAdded}
          detail={`${stats.uniqueAdders} user${stats.uniqueAdders !== 1 ? 's' : ''} · ${stats.workoutsAddedPicker} picker, ${stats.workoutsAddedVoice} voice`}
        />
        <StatCard
          label="Runs Started"
          value={stats.workoutsStarted}
          detail={`${stats.uniqueStarters} user${stats.uniqueStarters !== 1 ? 's' : ''}, from day detail`}
        />
        <StatCard
          label="Other Actions"
          value={stats.workoutsEdited + stats.workoutsMoved + stats.workoutsRemoved + stats.runsViewed + stats.runsRepeated}
          detail={`${stats.workoutsEdited} edit · ${stats.workoutsMoved} move · ${stats.workoutsRemoved} remove · ${stats.runsViewed} view run · ${stats.runsRepeated} repeat`}
        />
      </section>

      {/* Daily trend chart */}
      <section className="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-gray-400">Daily Trend</h3>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-400" /> Viewers
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> Added
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> Started
            </span>
          </div>
        </div>

        {daily.length === 0 ? (
          <p className="text-sm text-gray-600">No data yet.</p>
        ) : (
          <div className="flex items-end gap-px" style={{ height: 120 }}>
            {daily.map((d) => {
              const vH = (d.viewers / maxY) * 100;
              const aH = (d.added / maxY) * 100;
              const sH = (d.started / maxY) * 100;
              return (
                <div
                  key={d.date}
                  className="group relative flex flex-1 items-end justify-center gap-px"
                  style={{ height: '100%' }}
                >
                  <div
                    className="w-1 rounded-t bg-blue-400/70"
                    style={{ height: `${Math.max(vH, 1)}%` }}
                  />
                  <div
                    className="w-1 rounded-t bg-emerald-400/70"
                    style={{ height: `${Math.max(aH, 0.5)}%` }}
                  />
                  <div
                    className="w-1 rounded-t bg-amber-400/70"
                    style={{ height: `${Math.max(sH, 0.5)}%` }}
                  />
                  {/* Tooltip */}
                  <div className="pointer-events-none absolute -top-14 left-1/2 z-10 hidden -translate-x-1/2 rounded bg-gray-800 px-2 py-1 text-xs text-gray-300 shadow group-hover:block whitespace-nowrap">
                    <div className="font-medium">{d.date}</div>
                    <div>{d.viewers} view · {d.added} add · {d.started} start</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
