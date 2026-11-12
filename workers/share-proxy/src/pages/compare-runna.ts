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
      <p>Two running apps with adaptive training plans and voice coaching — with different strengths.</p>
    </section>

    <section class="section">
      <div class="prose">
        <h2>Overview</h2>
        <p><strong>SplitCue</strong> is a voice coaching app with adaptive AI training plans, a flexible custom workout builder, and an AI workout generator. Follow a plan built around your race, build your own workouts, or both — SplitCue coaches you through every run with audio cues.</p>
        <p><strong>Runna</strong> is a structured training plan app. You choose a race distance and goal, and Runna generates a multi-week training program with daily workouts. Each workout includes voice guidance during the run. It's designed to take you from where you are to race day.</p>
        <p>The key difference: both build adaptive plans, but SplitCue also gives you full freedom to build any workout you want and reshape your plan just by asking. Runna offers coach-designed programming and sends workouts to your watch.</p>

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
                <td class="yes">Yes — AI plans for 5K through marathon, custom distances, or a target pace, organized into training phases</td>
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
                <td class="yes">Yes — reviews each plan run and proposes changes to upcoming workouts; adjust anytime by chat or voice</td>
                <td class="yes">Yes — plans adapt based on your feedback and progress</td>
              </tr>
              <tr>
                <td><strong>Race goal pacing</strong></td>
                <td class="yes">Plans are built around your race date and goal time, with goal suggestions from your recent runs</td>
                <td class="yes">Plans are built around your goal race time</td>
              </tr>
              <tr>
                <td><strong>Heart rate monitors</strong></td>
                <td class="yes">Bluetooth chest straps and watches that broadcast heart rate (Garmin, Polar, COROS, Amazfit, WHOOP, and more)</td>
                <td class="yes">Heart rate from connected watches and sensors</td>
              </tr>
              <tr>
                <td><strong>Workouts on your watch</strong></td>
                <td class="no">No — workouts run on your phone</td>
                <td class="yes">Pushes workouts to Garmin, Apple Watch, and others</td>
              </tr>
              <tr>
                <td><strong>Price</strong></td>
                <td class="yes">Free, including your first AI training plan; Pro for unlimited plans</td>
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
        <p>Runna is the stronger choice if:</p>
        <ul>
          <li><strong>You want to run from your wrist.</strong> Runna pushes workouts to Garmin and Apple Watch, so you can follow them without your phone. SplitCue can read heart rate from your watch, but workouts run on your phone.</li>
          <li><strong>You prefer coach-designed programming.</strong> Runna's plans are built from programming designed by running coaches. SplitCue's plans are generated by an AI coach from your profile and recent runs.</li>
        </ul>

        <h2>Where SplitCue Is Better</h2>
        <p>SplitCue is the better choice if you want a plan and control over your own workouts:</p>
        <ul>
          <li><strong>Plans you can reshape by asking.</strong> Tell your plan "this week is too much" or "swap Thursday and Saturday" by text or voice, and SplitCue shows exactly what will change before applying it.</li>
          <li><strong>Full workout customization.</strong> Build any interval structure you can imagine — any number of blocks, any durations, any labels, any repeats. Runna's workouts are plan-generated and not user-editable in the same way.</li>
          <li><strong>Configurable pace announcements.</strong> Hear your pace every 15–120 seconds with adjustable GPS smoothing. Much more control than Runna's audio feedback.</li>
          <li><strong>AI workout generation.</strong> Describe a one-off workout in natural language and get a structured session instantly, with or without a plan.</li>
          <li><strong>Price.</strong> SplitCue is free to use, including your first AI training plan. Runna requires a subscription that typically costs $15–20/month.</li>
        </ul>

        <h2>When to Use Which</h2>
        <p><strong>Use Runna</strong> if you want coach-designed programming and plan to follow your workouts from a Garmin or Apple Watch.</p>
        <p><strong>Use SplitCue</strong> if you want an adaptive training plan you can adjust by just asking, the freedom to build your own workouts alongside it, granular control over voice coaching, and a free way to get started.</p>
      </div>
    </section>

    ${ctaBanner('Try SplitCue Free', 'Get an adaptive training plan and custom interval workouts with voice coaching. Your first plan is free.')}
    `,
  );
}
