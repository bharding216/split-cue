/**
 * Feature page: Structured Running Workouts
 *
 * Previously "AI Training Plans". Refocused on the execution experience
 * — what makes SplitCue great for running any structured workout.
 */

import { renderPage, ctaBanner } from '../layout';

export function trainingPlansPage(): string {
  return renderPage(
    {
      title: 'Run Any Structured Workout With Voice Coaching — SplitCue',
      description:
        'SplitCue makes structured running workouts easy. Intervals, tempos, long runs, and custom workouts — all with real-time voice coaching, pace tracking, and heart rate monitoring.',
      path: '/features/training-plans',
    },
    `
    <section class="page-header">
      <h1>Run Any Workout, Coached Every Step</h1>
      <p>Pick a workout — intervals, tempo, easy run, or anything custom — and SplitCue coaches you through every interval with voice cues, pace updates, and countdown warnings. Phone stays in your pocket.</p>
    </section>

    <section class="section">
      <div class="prose">
        <h2>How It Works</h2>
        <ol>
          <li><strong>Choose a workout.</strong> Pick from built-in presets, your saved workouts, or create something custom.</li>
          <li><strong>Start running.</strong> SplitCue calls out every interval transition, your pace, and your progress.</li>
          <li><strong>Review your run.</strong> See interval splits, pace consistency, heart rate, and route — then share your results.</li>
        </ol>

        <h2>Voice Coached From Start to Finish</h2>
        <p>Every warmup, interval, recovery, and cooldown gets called out with clear voice cues. You hear your current pace, distance, and time without looking at your phone. Premium voices or device TTS — your choice.</p>

        <h2>Build Any Workout</h2>
        <p>The workout builder supports intervals, repeat groups, tempo segments, distance-based targets, time-based targets, and open-ended manual segments. Or just describe what you want — "6 by 400 with 90 second recovery" — and SplitCue builds it instantly.</p>

        <h2>Track Everything</h2>
        <p>GPS pace, Bluetooth heart rate, interval splits, distance, elevation, and route — all recorded automatically. See your results on a calendar that shows every run you've done.</p>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container-wide">
        <div class="features-grid">
          <div class="feature-card">
            <h3>16 Built-In Presets</h3>
            <p>Easy runs, intervals, tempo, fartlek, hill repeats, and more — ready to run immediately.</p>
          </div>
          <div class="feature-card">
            <h3>Calendar</h3>
            <p>See every completed run and scheduled workout on your training calendar.</p>
          </div>
          <div class="feature-card">
            <h3>Heart Rate Monitoring</h3>
            <p>Connect any Bluetooth heart rate monitor. Per-interval HR stats, recovery tracking. <a href="/help/heart-rate-monitors">Supported devices</a></p>
          </div>
          <div class="feature-card">
            <h3>Share Your Runs</h3>
            <p>Paceprint visual fingerprints, challenge friends, share to Strava. See how consistent your splits were.</p>
          </div>
        </div>
      </div>
    </section>

    ${ctaBanner('Start Running With SplitCue', 'Download SplitCue and start your first run in under 30 seconds.')}
    `,
  );
}
