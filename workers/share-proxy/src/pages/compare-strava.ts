/**
 * Comparison page: SplitCue vs Strava
 */

import { renderPage, APP_STORE_URL, ctaBanner } from '../layout';

export function compareStravaPage(): string {
  return renderPage(
    {
      title: 'SplitCue vs Strava — Running App Comparison',
      description:
        'An honest comparison of SplitCue and Strava. See how they differ on interval training, audio coaching, social features, GPS tracking, and workout customization.',
      path: '/compare/pacecue-vs-strava',
    },
    `
    <section class="page-header">
      <h1>SplitCue vs Strava</h1>
      <p>An honest comparison — two apps that serve very different roles in a runner's toolkit.</p>
    </section>

    <section class="section">
      <div class="prose">
        <h2>Overview</h2>
        <p><strong>SplitCue</strong> is a running app with adaptive AI training plans, real-time voice pace coaching, a custom workout builder, and an AI workout generator. It's designed to guide you <em>during</em> the run with audio cues — and it can upload your runs to Strava.</p>
        <p><strong>Strava</strong> is a GPS tracking and social fitness platform. It records your runs (and rides, swims, hikes), maps routes, tracks performance over time, and connects you with a large community of athletes through segments, clubs, and leaderboards.</p>
        <p>These apps don't really compete — they complement each other. But here's a detailed comparison.</p>

        <h2>Feature Comparison</h2>
      </div>

      <div class="container-wide">
        <div class="compare-table-wrap">
          <table class="compare-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>SplitCue</th>
                <th>Strava</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Custom interval workouts</strong></td>
                <td class="yes">Yes — full editor with blocks, repeats, labels, effort, target pace</td>
                <td class="no">No — Strava records runs but doesn't coach intervals</td>
              </tr>
              <tr>
                <td><strong>Voice pace announcements</strong></td>
                <td class="yes">Yes — configurable frequency, rolling GPS average</td>
                <td class="partial">Basic audio cues for pace/distance at mile markers</td>
              </tr>
              <tr>
                <td><strong>Interval timer with coaching</strong></td>
                <td class="yes">Yes — core feature with transitions, set tracking, countdown warnings</td>
                <td class="no">No built-in interval timer</td>
              </tr>
              <tr>
                <td><strong>AI workout builder</strong></td>
                <td class="yes">Yes — describe a workout in plain English</td>
                <td class="no">No</td>
              </tr>
              <tr>
                <td><strong>GPS tracking and mapping</strong></td>
                <td class="partial">Route map, elevation profile, and pace by terrain for each run</td>
                <td class="yes">Full route mapping, elevation profiles, heatmaps</td>
              </tr>
              <tr>
                <td><strong>Segments and leaderboards</strong></td>
                <td class="no">No</td>
                <td class="yes">Yes — millions of segments with local and global leaderboards</td>
              </tr>
              <tr>
                <td><strong>Social features</strong></td>
                <td class="no">No</td>
                <td class="yes">Yes — clubs, followers, kudos, comments, group challenges</td>
              </tr>
              <tr>
                <td><strong>Training log and analytics</strong></td>
                <td class="partial">Workout history with splits, heart rate graphs, personal records, and progress trends</td>
                <td class="yes">Detailed training log, fitness trends, relative effort, power data</td>
              </tr>
              <tr>
                <td><strong>Route planning</strong></td>
                <td class="no">No</td>
                <td class="yes">Yes — route builder with popularity heatmap</td>
              </tr>
              <tr>
                <td><strong>Multi-sport support</strong></td>
                <td class="no">Running only</td>
                <td class="yes">Running, cycling, swimming, hiking, and 30+ activities</td>
              </tr>
              <tr>
                <td><strong>Workout sharing</strong></td>
                <td class="yes">Share workout structures and results via link</td>
                <td class="yes">Share activities, route links</td>
              </tr>
              <tr>
                <td><strong>Price</strong></td>
                <td class="yes">Free with optional premium</td>
                <td class="partial">Free tier + Strava Summit subscription ($11.99/mo) for advanced features</td>
              </tr>
              <tr>
                <td><strong>Platforms</strong></td>
                <td class="partial">iOS and Android</td>
                <td class="yes">iOS, Android, web, watch integrations</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="prose">
        <h2>Where Strava Is Better</h2>
        <p>Strava is stronger in almost every category that isn't real-time interval coaching:</p>
        <ul>
          <li><strong>Long-term analysis.</strong> Strava's training log, relative effort, and fitness trends go deeper. SplitCue shows splits, route maps, elevation, heart rate, and personal records for your runs, but isn't a full training-load platform.</li>
          <li><strong>Route planning.</strong> Strava lets you plan routes with a popularity heatmap. SplitCue maps the runs you've done but doesn't plan routes.</li>
          <li><strong>Social community.</strong> Strava is the social network for runners. Segments, clubs, kudos, and challenges are core to the experience.</li>
          <li><strong>Multi-sport support.</strong> Strava covers running, cycling, swimming, hiking, and more. SplitCue is running only.</li>
          <li><strong>Platform support.</strong> Strava works on iOS, Android, web, and integrates with GPS watches from Garmin, Apple, COROS, and others.</li>
          <li><strong>Watch integrations.</strong> Strava syncs with virtually every running watch and fitness tracker.</li>
        </ul>

        <h2>Where SplitCue Is Better</h2>
        <p>SplitCue fills a gap that Strava doesn't address:</p>
        <ul>
          <li><strong>Adaptive training plans.</strong> SplitCue builds a plan around your race date and recent runs, reviews each plan workout, and lets you adjust the plan by text or voice.</li>
          <li><strong>Interval training with voice coaching.</strong> Strava records your run but doesn't tell you when to start your next interval or what your current set is. SplitCue guides every transition with audio.</li>
          <li><strong>Custom workout builder.</strong> Create any interval structure with blocks, repeats, and target paces. Strava has no equivalent.</li>
          <li><strong>Frequent pace announcements.</strong> Hear your pace every 15–120 seconds, not just at mile markers.</li>
          <li><strong>AI workout generation.</strong> Describe a workout and get a structured plan instantly.</li>
          <li><strong>Hands-free, screen-off operation.</strong> SplitCue is designed to run entirely through audio with your phone locked in your pocket.</li>
        </ul>

        <h2>Using Them Together</h2>
        <p>SplitCue and Strava serve different roles. Many runners will benefit from both:</p>
        <ul>
          <li>Use <strong>SplitCue</strong> to coach you through interval workouts with real-time audio guidance.</li>
          <li>Use <strong>Strava</strong> to log your training, track fitness over time, plan routes, and connect with other runners.</li>
        </ul>
        <p>Connect Strava in SplitCue and upload your runs with one tap — GPS route and heart rate included. SplitCue doesn't try to replace Strava's tracking and social features. Strava doesn't try to coach your intervals.</p>
      </div>
    </section>

    ${ctaBanner('Add Interval Coaching to Your Training', 'SplitCue handles the coaching. Strava handles the tracking. Download free.')}
    `,
  );
}
