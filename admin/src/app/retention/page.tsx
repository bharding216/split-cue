import Link from 'next/link';
import { createAuthServerClient } from '@/lib/supabase-server-actions';
import {
  getSecondRunRetention,
  getFirstRunBreakdown,
  getFirstRunUsers,
  getNextRunFunnel,
  getLapsedSurveyBreakdown,
  getLapsedSurveySummary,
  getLapsedSurveyComments,
  getRunReminderFunnel,
  getWorkoutRetentionCurve,
  type SecondRunCohort,
} from '@/lib/queries';
import StatCard from '@/components/StatCard';
import SignOutButton from '@/components/SignOutButton';
import SecondRunCohortChart from '@/components/SecondRunCohortChart';
import FirstRunBreakdown from '@/components/FirstRunBreakdown';
import FirstRunUsersTable from '@/components/FirstRunUsersTable';
import RetentionCurveChart from '@/components/RetentionCurveChart';
import CountBars from '@/components/CountBars';
import SurveyCommentsTable from '@/components/SurveyCommentsTable';

export const dynamic = 'force-dynamic';

const SURVEY_LABELS: Record<string, string> = {
  other_app: 'I normally use another running app',
  not_running: "I haven't gone for another run yet",
  confusing: 'The app was confusing or difficult',
  missing_feature: 'It was missing something I needed',
  technical_problem: 'I had a technical problem',
  other: 'Something else',
};

type Window = 7 | 14 | 30;

/** Pooled rate over every runner old enough for the window. */
function pooled(cohorts: SecondRunCohort[], days: Window) {
  const eligible = cohorts.reduce((s, c) => s + c[`eligible_${days}`], 0);
  const returned = cohorts.reduce((s, c) => s + c[`returned_${days}`], 0);
  return {
    eligible,
    returned,
    pct: eligible > 0 ? Math.round((returned / eligible) * 1000) / 10 : null,
  };
}

export default async function RetentionPage() {
  const auth = await createAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();

  const [cohorts, breakdown, newRunners, funnel, reminders, survey, surveySummary, surveyComments, curve] =
    await Promise.all([
      getSecondRunRetention(12),
      getFirstRunBreakdown(90),
      getFirstRunUsers(30),
      getNextRunFunnel(30),
      getRunReminderFunnel(30),
      getLapsedSurveyBreakdown(90),
      getLapsedSurveySummary(90),
      getLapsedSurveyComments(90),
      getWorkoutRetentionCurve(6),
    ]);

  const r7 = pooled(cohorts, 7);
  const r14 = pooled(cohorts, 14);
  const r30 = pooled(cohorts, 30);
  const firstRunners = cohorts.reduce((s, c) => s + c.first_runners, 0);

  // Overall 14-day rate over the breakdown's 90-day window, for comparing segments.
  const endedRows = breakdown.filter((r) => r.dimension === 'Ended');
  const bdEligible = endedRows.reduce((s, r) => s + r.eligible, 0);
  const bdReturned = endedRows.reduce((s, r) => s + r.returned, 0);
  const overallPct = bdEligible > 0 ? Math.round((bdReturned / bdEligible) * 1000) / 10 : null;

  const fmt = (p: { pct: number | null }) => (p.pct == null ? '—' : p.pct);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-200">
            Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-bold">Second-Run Retention</h1>
          <p className="mt-1 text-sm text-gray-400">Signed in as {user?.email}</p>
        </div>
        <SignOutButton />
      </header>

      <p className="mb-6 max-w-3xl text-sm text-gray-500">
        A run counts when the runner finished it, or stopped after at least half the planned time
        (10 minutes for open-ended runs). A runner &quot;came back&quot; when they logged another
        run at least 6 hours after their first. Production devices only.
      </p>

      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Came Back in 14 Days"
          value={fmt(r14)}
          format={r14.pct == null ? 'number' : 'percent'}
          detail={`${r14.returned}/${r14.eligible} first runners ≥ 14 days ago`}
        />
        <StatCard
          label="Came Back in 7 Days"
          value={fmt(r7)}
          format={r7.pct == null ? 'number' : 'percent'}
          detail={`${r7.returned}/${r7.eligible} first runners ≥ 7 days ago`}
        />
        <StatCard
          label="Came Back in 30 Days"
          value={fmt(r30)}
          format={r30.pct == null ? 'number' : 'percent'}
          detail={`${r30.returned}/${r30.eligible} first runners ≥ 30 days ago`}
        />
        <StatCard
          label="First Runners"
          value={firstRunners}
          detail="Last 12 weeks"
        />
      </section>

      <section className="mb-8">
        <SecondRunCohortChart data={cohorts} />
      </section>

      <section className="mb-8">
        <FirstRunBreakdown data={breakdown} overallPct={overallPct} />
      </section>

      <section className="mb-8 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <CountBars
          title="Next-Run Funnel"
          subtitle="Last 30 days"
          description="Unique devices at each step after a run: suggestion shown on the finished screen, added to the calendar, reminder set, and the suggested workout run."
          mode="funnel"
          rows={funnel.map((f) => ({ label: f.step, count: f.user_count }))}
          emptyText="No next-run suggestions yet. They ship with the next app update."
        />
        <CountBars
          title="Run Reminders"
          subtitle="Last 30 days"
          description="Unique devices that tapped “Remind me that morning” on a calendar workout, how many had notifications blocked, and whether the reminder led to a run."
          mode="funnel"
          rows={reminders.map((f) => ({ label: f.step, count: f.user_count }))}
          emptyText="No reminders yet. They ship with the next app update."
        />
      </section>

      <h2 className="mb-1 text-lg font-semibold">Lapsed-Runner Survey</h2>
      <p className="mb-4 max-w-3xl text-sm text-gray-500">
        Shown once to runners whose only run was 10+ days ago. Check the response rate before
        reading too much into the reasons.
      </p>
      <section className="mb-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <CountBars
          title="Response Rate"
          subtitle="Last 90 days"
          description="Unique devices that saw the survey, picked a reason, added a comment, or closed it without answering."
          mode="funnel"
          rows={surveySummary.map((f) => ({ label: f.step, count: f.user_count }))}
          emptyText="Nobody has seen the survey yet."
        />
        <CountBars
          title="Why Runners Didn't Come Back"
          subtitle="Last 90 days"
          description="Reasons picked, as a share of everyone who answered."
          mode="share"
          rows={survey.map((s) => ({ label: SURVEY_LABELS[s.reason] ?? s.reason, count: s.user_count }))}
          emptyText="No survey answers yet."
        />
      </section>
      <section className="mb-8">
        <SurveyCommentsTable data={surveyComments} reasonLabels={SURVEY_LABELS} />
      </section>

      <section className="mb-8">
        <FirstRunUsersTable data={newRunners} />
      </section>

      <section className="mb-8">
        <RetentionCurveChart data={curve} />
      </section>
    </div>
  );
}
