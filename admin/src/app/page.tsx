import { createAuthServerClient } from '@/lib/supabase-server-actions';
import {
  getOverviewStats,
  getEngagementStats,
  getWorkoutCompletionStats,
  getOnboardingFunnel,
  getAIAdoptionRate,
  getTrainingPlanStats,
  getDAUOverTime,
  getWorkoutsOverTime,
  getSignupsOverTime,
  getEventsOverTime,
  getTodaysEventsByUser,
  getTrainingPlansByUser,
  getRunLadder,
  getUsersByCountryPlatform,
  getUsersByAppVersion,
  getStravaStats,
  getStravaUsers,
  getHeartRateFeatureStats,
  getHeartRateRetention,
  getShareFunnel,
} from '@/lib/queries';
import HeartRateFeatureSection from '@/components/HeartRateFeatureSection';
import SharingSection from '@/components/SharingSection';
import StatCard from '@/components/StatCard';
import DAUChart from '@/components/DAUChart';
import WorkoutsChart from '@/components/WorkoutsChart';
import SignupsChart from '@/components/SignupsChart';
import EventsChart from '@/components/EventsChart';
import OnboardingFunnel from '@/components/OnboardingFunnel';
import CountBars from '@/components/CountBars';
import TodaysActivity from '@/components/TodaysActivity';
import PlatformsSection from '@/components/PlatformsSection';
import CountriesSection from '@/components/CountriesSection';
import AppVersionsSection from '@/components/AppVersionsSection';
import TrainingPlansBreakdown from '@/components/TrainingPlansBreakdown';
import StravaUsersBreakdown from '@/components/StravaUsersBreakdown';
import SignOutButton from '@/components/SignOutButton';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [
    stats,
    engagement,
    workoutStats,
    funnel,
    aiAdoption,
    planStats,
    runLadder,
    dau,
    workouts,
    signups,
    events,
    todaysUsers,
    planUsers,
    countries,
    appVersions,
    stravaStats,
    stravaUsers,
    hrStats,
    hrRetention,
    shareFunnel,
  ] = await Promise.all([
    getOverviewStats(),
    getEngagementStats(),
    getWorkoutCompletionStats(),
    getOnboardingFunnel(30),
    getAIAdoptionRate(30),
    getTrainingPlanStats(30),
    getRunLadder(14),
    getDAUOverTime(30),
    getWorkoutsOverTime(30),
    getSignupsOverTime(30),
    getEventsOverTime(30),
    getTodaysEventsByUser(),
    getTrainingPlansByUser(30),
    getUsersByCountryPlatform(30),
    getUsersByAppVersion(30),
    getStravaStats(30),
    getStravaUsers(30),
    getHeartRateFeatureStats(30),
    getHeartRateRetention(90),
    getShareFunnel(30),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">SplitCue Admin</h1>
          <p className="mt-1 break-all text-sm text-gray-400">
            Signed in as {user?.email}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Link
            href="/retention"
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            Retention
          </Link>
          <Link
            href="/notifications"
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            Notifications
          </Link>
          <SignOutButton />
        </div>
      </header>

      {/* ── Usage ─────────────────────────────────────────── */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Usage
      </h2>
      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Accounts" value={stats.totalUsers} detail="Registered users" />
        <StatCard label="DAU" value={stats.dauToday} detail="Unique devices today (UTC)" />
        <StatCard label="WAU" value={stats.wau} detail="Unique devices, rolling 7 days" />
        <StatCard
          label="Pro Subscribers"
          value={stats.proSubscribers}
          detail={`${engagement.freeToPaidRate}% of accounts, active + trialing`}
        />
      </section>

      {/* ── Training Plans ────────────────────────────────── */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        AI Training Plans
      </h2>
      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Plans Generated"
          value={planStats.generated}
          detail={`${planStats.uniqueUsers} user${planStats.uniqueUsers !== 1 ? 's' : ''}, last 30 days`}
        />
        <StatCard
          label="Plans Started"
          value={planStats.started}
          detail="Runner completed ≥ 1 plan workout"
        />
        <StatCard
          label="Start Rate"
          value={planStats.startRate}
          format="percent"
          detail="Started ÷ generated, last 30 days"
        />
        <StatCard
          label="Still Active"
          value={planStats.stillActive}
          detail={`${planStats.archived} archived or replaced`}
        />
        <StatCard
          label="Failed Generations"
          value={planStats.failed}
          detail="Errors before a plan was saved"
        />
      </section>

      {/* ── Workouts ──────────────────────────────────────── */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Workouts
      </h2>
      <section className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Started Today"
          value={workoutStats.startedToday}
        />
        <StatCard
          label="Completed Today"
          value={workoutStats.completedToday}
        />
        <StatCard
          label="Started"
          value={workoutStats.startedPeriod}
          detail="Last 7 days"
        />
        <StatCard
          label="Completed"
          value={workoutStats.completedPeriod}
          detail="Last 7 days"
        />
        <StatCard
          label="Completion Rate"
          value={workoutStats.completionRate}
          format="percent"
          detail="Completed ÷ started, last 7 days"
        />
      </section>

      {/* ── Growth & Engagement ───────────────────────────── */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Growth &amp; Engagement
      </h2>
      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label="Activation Rate"
          value={engagement.activationRate}
          format="percent"
          detail="Signed up last 30d → completed a workout"
        />
        <StatCard
          label="Core Engagement"
          value={engagement.coreEngagementRate}
          format="percent"
          detail="WAU who started/completed a workout"
        />
        <StatCard
          label="AI Adoption"
          value={aiAdoption.adoptionRate}
          format="percent"
          detail={`${aiAdoption.aiUsersCompleted}/${aiAdoption.aiUsers} AI users completed a workout`}
        />
      </section>

      {/* ── Sharing ───────────────────────────────────────── */}
      <SharingSection data={shareFunnel} days={30} />

      {/* ── Strava ────────────────────────────────────────── */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Strava
      </h2>
      <section className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Strava Connected"
          value={stravaStats.connectedUsers}
          detail={`${stravaStats.connectedPct}% of accounts · ${stravaStats.newConnections} new, last 30 days`}
        />
        <StatCard
          label="Strava Pushes"
          value={stravaStats.pushes}
          detail={`${stravaStats.autoPushes} auto-uploaded, last 30 days`}
        />
        <StatCard
          label="Users Pushing"
          value={stravaStats.uniquePushers}
          detail="Pushed ≥ 1 workout, last 30 days"
        />
        <StatCard
          label="Strava Disconnects"
          value={stravaStats.disconnects}
          detail="Last 30 days"
        />
      </section>
      <section className="mb-8">
        <StravaUsersBreakdown data={stravaUsers} />
      </section>

      {/* ── Heart Rate ────────────────────────────────────── */}
      <HeartRateFeatureSection stats={hrStats} retention={hrRetention} days={30} retentionDays={90} />

      {/* ── Platforms ─────────────────────────────────────── */}
      <PlatformsSection data={countries} />

      {/* ── Countries ─────────────────────────────────────── */}
      <CountriesSection data={countries} />

      {/* ── App Versions ──────────────────────────────────── */}
      <AppVersionsSection data={appVersions} />

      {/* ── Onboarding Funnel ─────────────────────────────── */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Onboarding Funnel
      </h2>
      <section className="mb-8">
        <OnboardingFunnel data={funnel} />
      </section>

      {/* ── Workout Retention ─────────────────────────────── */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Workout Retention
      </h2>
      <section className="mb-8">
        <CountBars
          title="Run Ladder"
          subtitle={`${runLadder[0]?.eligible ?? 0} runners, first run ≥ 14 days ago`}
          description="How many first-time runners reached each run within 14 days of their first. Runs less than 6 hours apart count as one."
          mode="funnel"
          rows={runLadder.map((s) => ({ label: `Run ${s.step}`, count: s.reached }))}
          emptyText="No runners are 14 days past their first run yet."
        />
      </section>

      {/* ── Trends ────────────────────────────────────────── */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Trends
      </h2>
      <section className="mb-4">
        <DAUChart data={dau} />
      </section>
      <section className="mb-4">
        <WorkoutsChart data={workouts} />
      </section>
      <section className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SignupsChart data={signups} />
        <EventsChart data={events} />
      </section>

      {/* ── Drilldowns ─────────────────────────────────────── */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Drilldowns
      </h2>
      <section className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <TodaysActivity data={todaysUsers} />
        <TrainingPlansBreakdown data={planUsers} />
      </section>
    </div>
  );
}
