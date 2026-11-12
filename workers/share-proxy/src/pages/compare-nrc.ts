/**
 * Comparison page: SplitCue vs Nike Run Club
 */

import { renderPage, APP_STORE_URL, ctaBanner } from '../layout';

export function compareNrcPage(): string {
  return renderPage(
    {
      title: 'SplitCue vs Nike Run Club (NRC) — Running App Comparison',
      description:
        'An honest comparison of SplitCue and Nike Run Club. See how they differ on interval training, audio coaching, GPS tracking, price, and workout customization.',
      path: '/compare/pacecue-vs-nike-run-club',
    },
    `
    <section class="page-header">
      <h1>SplitCue vs Nike Run Club</h1>
      <p>An honest comparison of two running apps with very different strengths.</p>
    </section>

    <section class="section">
      <div class="prose">
        <h2>Overview</h2>
        <p><strong>SplitCue</strong> is an interval training app with real-time voice pace coaching, a custom workout builder, and an AI workout generator. It's focused on structured workouts and hands-free audio feedback.</p>
        <p><strong>Nike Run Club (NRC)</strong> is a free, all-purpose running app with guided audio runs narrated by Nike coaches, GPS tracking, training plans, and a social community. It covers running more broadly — from casual jogs to marathon training.</p>
        <p>These apps solve different problems. Here's where each one is stronger.</p>

        <h2>Feature Comparison</h2>
      </div>

      <div class="container-wide">
        <div class="compare-table-wrap">
          <table class="compare-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>SplitCue</th>
                <th>Nike Run Club</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Custom interval workouts</strong></td>
                <td class="yes">Yes — full editor with blocks, repeats, labels, effort, target pace</td>
                <td class="no">No — no custom interval builder</td>
              </tr>
              <tr>
                <td><strong>Voice pace announcements</strong></td>
                <td class="yes">Yes — configurable frequency (15s–120s), rolling GPS average</td>
                <td class="partial">Limited — periodic audio cues during runs, not configurable</td>
              </tr>
              <tr>
                <td><strong>Guided coached runs</strong></td>
                <td class="no">No — SplitCue focuses on self-directed workouts</td>
                <td class="yes">Yes — extensive library of coach-narrated runs with motivation and tips</td>
              </tr>
              <tr>
                <td><strong>AI workout builder</strong></td>
                <td class="yes">Yes — describe a workout in plain English</td>
                <td class="no">No</td>
              </tr>
              <tr>
                <td><strong>Training plans</strong></td>
                <td class="no">No — SplitCue is workout-by-workout, not a multi-week plan</td>
                <td class="yes">Yes — 5K, 10K, half marathon, full marathon plans</td>
              </tr>
              <tr>
                <td><strong>GPS tracking</strong></td>
                <td class="yes">Yes — pace, distance, splits per interval</td>
                <td class="yes">Yes — pace, distance, route map, elevation</td>
              </tr>
              <tr>
                <td><strong>Interval timer</strong></td>
                <td class="yes">Yes — core feature with voice transitions</td>
                <td class="partial">Basic — speed runs have intervals, but no custom builder</td>
              </tr>
              <tr>
                <td><strong>Social features</strong></td>
                <td class="no">No</td>
                <td class="yes">Yes — challenges, leaderboards, friends</td>
              </tr>
              <tr>
                <td><strong>Workout sharing</strong></td>
                <td class="yes">Yes — share workout structures and results via link</td>
                <td class="partial">Share completed runs, not workout structures</td>
              </tr>
              <tr>
                <td><strong>Music integration</strong></td>
                <td class="partial">Music ducking — lowers music during cues</td>
                <td class="yes">Spotify integration, curated playlists</td>
              </tr>
              <tr>
                <td><strong>Price</strong></td>
                <td class="yes">Free with optional premium features</td>
                <td class="yes">Completely free</td>
              </tr>
              <tr>
                <td><strong>Platforms</strong></td>
                <td class="yes">iOS and Android</td>
                <td class="yes">iOS and Android</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="prose">
        <h2>Where Nike Run Club Is Better</h2>
        <p>NRC is a better choice if you want:</p>
        <ul>
          <li><strong>Guided coached runs.</strong> NRC's library of narrated runs with coaches like Coach Bennett is genuinely motivating. SplitCue doesn't have pre-recorded coach content.</li>
          <li><strong>Multi-week training plans.</strong> NRC offers structured plans that progress over weeks toward a race goal. SplitCue handles individual workouts, not periodized training.</li>
          <li><strong>Social and community features.</strong> NRC has challenges, leaderboards, and the ability to run with friends. SplitCue has no social features.</li>
          <li><strong>Music integration.</strong> NRC integrates with Spotify and offers curated playlists. SplitCue ducks your music during cues but doesn't control playback.</li>
          <li><strong>Completely free.</strong> NRC has no subscription or premium tier.</li>
        </ul>

        <h2>Where SplitCue Is Better</h2>
        <p>SplitCue is a better choice if you want:</p>
        <ul>
          <li><strong>Custom interval workouts.</strong> SplitCue lets you build any interval structure — any number of blocks, any durations, any labels, with repeat counts. NRC doesn't have a custom interval builder.</li>
          <li><strong>Frequent, configurable pace announcements.</strong> SplitCue can announce your pace every 15 seconds with GPS smoothing. NRC's audio feedback is less frequent and not configurable.</li>
          <li><strong>Target pace alerts.</strong> Set a target pace on individual intervals and hear whether you're on pace, too fast, or too slow. NRC doesn't offer per-interval target pacing.</li>
          <li><strong>AI-generated workouts.</strong> Describe what you want and get a structured workout instantly.</li>
          <li><strong>Hands-free operation.</strong> SplitCue is designed to run entirely in the background with all information delivered through audio. You never need to look at your phone.</li>
        </ul>

        <h2>When to Use Which</h2>
        <p><strong>Use Nike Run Club</strong> if you're looking for a general-purpose running companion with coaching motivation, training plans, and social features — especially if you're newer to running or want guided runs.</p>
        <p><strong>Use SplitCue</strong> if you do structured interval training and want precise control over your workout structure with hands-free voice coaching and real-time pace feedback.</p>
        <p>Many runners use both — NRC for easy runs and training plan guidance, SplitCue for speed work and custom interval sessions.</p>
      </div>
    </section>

    ${ctaBanner('Try SplitCue for Your Next Interval Workout', 'Download free on the App Store or Google Play. Includes 11 built-in presets.')}
    `,
  );
}
