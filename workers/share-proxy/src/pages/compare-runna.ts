/**
 * Comparison page: SplitCue vs Runna
 */

import { renderPage, APP_STORE_URL, ctaBanner } from '../layout';

export function compareRunnaPage(): string {
  return renderPage(
    {
      title: 'SplitCue vs Runna — Running App Comparison',
      description:
        'An honest comparison of SplitCue and Runna. See how they differ on interval training, audio coaching, training plans, workout customization, and price.',
      path: '/compare/pacecue-vs-runna',
    },
    `
    <section class="page-header">
      <h1>SplitCue vs Runna</h1>
      <p>Two running apps with voice coaching — but built for different kinds of runners.</p>
    </section>

    <section class="section">
      <div class="prose">
        <h2>Overview</h2>
        <p><strong>SplitCue</strong> is an interval training app with real-time voice pace coaching, a flexible custom workout builder, and an AI workout generator. You build or generate individual workouts and SplitCue coaches you through them with audio cues.</p>
        <p><strong>Runna</strong> is a structured training plan app. You choose a race distance and goal, and Runna generates a multi-week training program with daily workouts. Each workout includes voice guidance during the run. It's designed to take you from where you are to race day.</p>
        <p>The key difference: SplitCue gives you freedom to build any workout you want. Runna gives you a coach-designed plan and tells you what to do each day.</p>

        <h2>Feature Comparison</h2>
      </div>

      <div class="container-wide">
        <div class="compare-table-wrap">
          <table class="compare-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>SplitCue</th>
                <th>Runna</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Custom interval workouts</strong></td>
                <td class="yes">Yes — fully customizable blocks, repeats, labels, effort, target pace</td>
                <td class="no">No — workouts are plan-generated, not user-built</td>
              </tr>
              <tr>
                <td><strong>Structured training plans</strong></td>
                <td class="no">No — SplitCue is workout-by-workout</td>
                <td class="yes">Yes — multi-week plans for 5K through marathon with progressive overload</td>
              </tr>
              <tr>
                <td><strong>Voice coaching during runs</strong></td>
                <td class="yes">Yes — interval transitions, pace announcements, countdown warnings</td>
                <td class="yes">Yes — guided audio during workouts</td>
              </tr>
              <tr>
                <td><strong>Voice pace announcements</strong></td>
                <td class="yes">Yes — configurable frequency (15s–120s) with GPS smoothing</td>
                <td class="partial">Pace feedback during runs, less configurable</td>
              </tr>
              <tr>
                <td><strong>AI workout builder</strong></td>
                <td class="yes">Yes — describe any workout in plain English</td>
                <td class="no">Workouts are algorithmically generated as part of plans</td>
              </tr>
              <tr>
                <td><strong>Built-in presets</strong></td>
                <td class="yes">11 presets (5K Speed, Tempo, Fartlek, Hill Repeats, Run/Walk, etc.)</td>
                <td class="partial">Workouts are part of plans, not standalone presets</td>
              </tr>
              <tr>
                <td><strong>Adaptive training</strong></td>
                <td class="no">No — workouts don't auto-adjust based on performance</td>
                <td class="yes">Yes — plans adapt based on your feedback and progress</td>
              </tr>
              <tr>
                <td><strong>Race goal pacing</strong></td>
                <td class="partial">Target pace per interval, but no race-day pacing strategy</td>
                <td class="yes">Plans are built around your goal race time</td>
              </tr>
              <tr>
                <td><strong>Watch integration</strong></td>
                <td class="no">Phone only</td>
                <td class="yes">Garmin, Apple Watch, others</td>
              </tr>
              <tr>
                <td><strong>Price</strong></td>
                <td class="yes">Free with optional premium</td>
                <td class="partial">Subscription required (~$15–20/month)</td>
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
        <h2>Where Runna Is Better</h2>
        <p>Runna is the stronger choice if you want a coach telling you what to do every day:</p>
        <ul>
          <li><strong>Complete training plans.</strong> Runna builds an entire training block — from base building through taper — for any race distance. SplitCue handles individual workouts, not multi-week periodization.</li>
          <li><strong>Adaptive progression.</strong> Runna adjusts your plan based on how runs go. SplitCue doesn't automatically progress your training.</li>
          <li><strong>Race-specific preparation.</strong> Runna's plans are built around your goal race time and adjust paces accordingly across all workout types.</li>
          <li><strong>Watch integration.</strong> Runna pushes workouts to Garmin and Apple Watch. SplitCue is phone-only.</li>
          <li><strong>Expert-designed programming.</strong> Runna's plans are built by running coaches with structured periodization.</li>
        </ul>

        <h2>Where SplitCue Is Better</h2>
        <p>SplitCue is the better choice if you want control over your own workouts:</p>
        <ul>
          <li><strong>Full workout customization.</strong> Build any interval structure you can imagine — any number of blocks, any durations, any labels, any repeats. Runna's workouts are plan-generated and not user-editable in the same way.</li>
          <li><strong>Configurable pace announcements.</strong> Hear your pace every 15–120 seconds with adjustable GPS smoothing. Much more control than Runna's audio feedback.</li>
          <li><strong>AI workout generation.</strong> Describe a workout in natural language and get a structured plan. Useful for one-off sessions or creative training.</li>
          <li><strong>Free to use.</strong> SplitCue's core features are free. Runna requires a subscription that typically costs $15–20/month.</li>
          <li><strong>No commitment required.</strong> SplitCue is good for runners who don't want a rigid training plan but still want structured workouts with voice coaching.</li>
        </ul>

        <h2>When to Use Which</h2>
        <p><strong>Use Runna</strong> if you're training for a specific race and want a structured, adaptive training plan that tells you exactly what to do each day. Especially valuable for runners new to structured training or preparing for their first race at a given distance.</p>
        <p><strong>Use SplitCue</strong> if you prefer building your own workouts, want granular control over interval timing and audio feedback, or want a free tool for structured speed work without committing to a training plan subscription.</p>
        <p>Some runners use Runna for their overall plan structure and SplitCue for custom speed sessions that go beyond what the plan provides.</p>
      </div>
    </section>

    ${ctaBanner('Try SplitCue Free', 'Build custom interval workouts with voice coaching — no subscription required.')}
    `,
  );
}
