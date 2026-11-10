/**
 * Heart rate monitor help — setup by brand, troubleshooting, and what's recorded.
 * Opened from the app's Heart Rate Monitor screen and pre-run card.
 */

import { renderPage } from '../layout';
import {
  CONFIRMED_DEVICES,
  DEVICE_GUIDES,
  DROPOUT_TIPS,
  NOT_FOUND_TIPS,
  NO_READINGS_TIP,
  SUPPORT_EMAIL,
  type DeviceGuide,
} from '../../../../src/heartRate/deviceGuides';

const NOT_LISTED_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  'Heart rate monitor help',
)}&body=${encodeURIComponent(
  'Monitor or watch (brand and model):\nPhone (model and OS version):\nWhat happened:\n',
)}`;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function list(items: string[]): string {
  return `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

function guideSection(g: DeviceGuide): string {
  return `
        <h3 id="${g.id}">${esc(g.name)} <span class="hr-examples">${esc(g.examples)}</span></h3>
        <ol>${g.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        ${g.note ? `<p class="hr-note">${esc(g.note)}</p>` : ''}`;
}

export function helpHeartRatePage(): string {
  const supported = DEVICE_GUIDES.filter((g) => g.kind !== 'limited');
  const limited = DEVICE_GUIDES.filter((g) => g.kind === 'limited');

  return renderPage(
    {
      title: 'Connect a Heart Rate Monitor — SplitCue Help',
      description:
        'How to connect a Bluetooth heart rate monitor or watch to SplitCue: setup for Polar, Garmin, Amazfit, COROS, Wahoo and more, plus troubleshooting.',
      path: '/help/heart-rate-monitors',
    },
    `
    <style>
      .hr-examples { font-size: 14px; font-weight: 500; color: var(--text-muted); margin-left: 6px; }
      .hr-note { font-size: 14px; color: var(--text-muted); }
      .hr-jump { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 8px; padding: 0; list-style: none; }
      .hr-jump li { margin: 0; }
      .hr-jump a { display: inline-block; padding: 6px 12px; border-radius: 999px; background: var(--card); border: 1px solid var(--card-border); font-size: 14px; }
      .prose h3[id] { scroll-margin-top: 80px; }
    </style>

    <section class="page-header">
      <h1>Connect a Heart Rate Monitor</h1>
      <p>Record heart rate during your SplitCue workouts with a Bluetooth chest strap, armband, or a watch that broadcasts heart rate.</p>
    </section>

    <section class="section">
      <div class="prose">
        <h2>How it works</h2>
        <ul>
          <li>SplitCue connects directly to monitors that use standard Bluetooth heart rate. You don’t need to pair it in your phone’s Bluetooth settings.</li>
          <li>Connect once in <strong>Settings → Heart Rate Monitor → Add Device</strong>. SplitCue remembers it and reconnects automatically before each workout.</li>
          <li>Heart rate is optional. Without a monitor, workouts work exactly the same.</li>
        </ul>

        <h2 id="setup">Setup by device</h2>
        <ul class="hr-jump">
          ${DEVICE_GUIDES.map((g) => `<li><a href="#${g.id}">${esc(g.name)}</a></li>`).join('')}
        </ul>
        ${supported.map(guideSection).join('')}

        <h2 id="limited">Limited or not supported</h2>
        ${limited.map(guideSection).join('')}

        <h2 id="troubleshooting">Troubleshooting</h2>
        <h3>SplitCue can’t find my monitor</h3>
        ${list(NOT_FOUND_TIPS)}
        <p>Also check that Bluetooth is on and that SplitCue is allowed to use it. If you declined the prompt, enable Bluetooth for SplitCue in your phone’s Settings app (on Android, it’s called Nearby devices).</p>

        <h3>It’s connected but shows no heart rate</h3>
        <p>${esc(NO_READINGS_TIP)}</p>

        <h3>Heart rate drops out during my run</h3>
        ${list(DROPOUT_TIPS)}

        <h2 id="features">What you get</h2>
        <h3>Free</h3>
        <ul>
          <li>Live heart rate during workouts</li>
          <li>Average and max heart rate for every workout</li>
          <li>A heart rate graph for the whole workout, with your intervals shaded</li>
        </ul>
        <h3>SplitCue Pro</h3>
        <ul>
          <li>Average and max heart rate for each interval</li>
          <li>Recovery drop: how much your heart rate falls during each recovery</li>
        </ul>
        <h3>Strava</h3>
        <p>Heart rate is included when you upload a GPS run to Strava. Treadmill (non-GPS) workouts don’t include heart rate on Strava yet.</p>

        ${
          CONFIRMED_DEVICES.length > 0
            ? `<h2 id="confirmed">Confirmed working</h2>
        <p>Models runners have recorded successfully with SplitCue:</p>
        ${list(CONFIRMED_DEVICES)}`
            : ''
        }

        <h2 id="contact">Device not listed? Tell us</h2>
        <p>If your monitor isn’t covered here or still won’t connect, <a href="${NOT_LISTED_MAILTO}">email us</a> with its brand and model and your phone model. We read every message and use them to improve this guide. In the app, <strong>Settings → Heart Rate Monitor → Email Support</strong> fills in your phone details for you.</p>
      </div>
    </section>
    `,
  );
}
