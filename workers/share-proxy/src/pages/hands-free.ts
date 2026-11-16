/**
 * Guide page: Running Without Constantly Checking Your Watch
 */

import { renderPage, ctaBanner } from '../layout';

export function handsFreePage(): string {
  return renderPage(
    {
      title:
        'Hands-Free Running — How to Stop Checking Your Phone or Watch Mid-Run',
      description:
        'Voice-coached running with SplitCue eliminates the need to check your phone or watch. Hear pace, distance, interval transitions, and elapsed time through your headphones while you run.',
      path: '/guides/hands-free-running',
    },
    `
    <section class="page-header">
      <h1>Running Without Constantly Checking Your Watch</h1>
      <p>How voice-coached interval running lets you put your phone away and focus entirely on the run.</p>
    </section>

    <section class="section">
      <div class="prose">
        <h2>The Problem With Screen-Dependent Running</h2>
        <p>Runners look at their phone or watch <strong>dozens of times per workout</strong>. During interval training, the checking is near-constant: "How much time left? What's my pace? Which set is this?" Each glance breaks concentration, alters arm swing, and can even create a tripping hazard on trails.</p>

        <p>GPS watches help by putting the screen on your wrist, but you still have to look down. And if you're running with your phone, you're either holding it (awkward) or pulling it out of a pocket or armband (disruptive).</p>

        <h2>How Voice Coaching Solves This</h2>
        <p>The solution is simple: instead of looking at a screen, <strong>listen to your workout</strong>. A voice-coached running app speaks the information you need directly through your headphones or your phone's speaker. Your phone stays in your pocket with the screen locked.</p>

        <p>SplitCue announces:</p>
        <ul>
          <li><strong>Interval transitions</strong> — what's starting, how long it is, which set you're on</li>
          <li><strong>Current pace</strong> — your GPS-measured running speed at regular intervals</li>
          <li><strong>Elapsed time</strong> — how long you've been in the current interval</li>
          <li><strong>Countdown warnings</strong> — a heads-up before the next transition (e.g., "10 seconds remaining")</li>
          <li><strong>Target pace comparisons</strong> — whether you're faster or slower than your goal</li>
        </ul>

        <h2>What "Hands-Free" Actually Looks Like</h2>
        <p>Here's a typical SplitCue workout experience:</p>
        <ol>
          <li>Open SplitCue, tap a workout, tap Start</li>
          <li>Lock your phone and put it in your pocket or armband</li>
          <li>Run — SplitCue announces everything through your headphones</li>
          <li>When the workout finishes, SplitCue tells you it's done</li>
        </ol>
        <p>You never touch your phone during the run. SplitCue handles the entire workout — transitions, pace tracking, time announcements — automatically.</p>

        <h2>Key Features That Enable Hands-Free Running</h2>

        <h3>Background Operation</h3>
        <p>SplitCue runs in the background on iPhone and Android. Lock your screen and the app continues tracking GPS, timing intervals, and making announcements. Your phone's battery usage is minimal because the screen is off.</p>

        <h3>Music Ducking</h3>
        <p>If you're listening to music, SplitCue temporarily lowers the music volume during voice cues, then restores it. You never miss an announcement, and you never lose your music.</p>

        <h3>Haptic Feedback</h3>
        <p>SplitCue sends a haptic buzz at interval transitions — so even in loud environments, you feel the change. This works alongside or instead of voice cues.</p>

        <h3>iOS Live Activities</h3>
        <p>On iPhone, SplitCue displays your current interval, time remaining, and set progress on the Lock Screen and Dynamic Island through iOS Live Activities. If you do want to glance at your screen, the information is right there — no unlocking or opening the app.</p>

        <h3>Home Screen Widgets</h3>
        <p>Launch your favorite workout with a single tap from a home screen widget. Skip the app navigation entirely.</p>

        <h2>When Hands-Free Running Matters Most</h2>
        <ul>
          <li><strong>Trail running</strong> — uneven terrain demands your full attention on footing</li>
          <li><strong>Track workouts</strong> — constant screen-checking disrupts running form and arm carriage</li>
          <li><strong>Night running</strong> — bright screens ruin night vision and are distracting</li>
          <li><strong>Cold weather</strong> — checking a watch with gloves on is awkward; listening is effortless</li>
          <li><strong>Rainy conditions</strong> — wet screens are hard to read and waterproofing concerns are eliminated</li>
          <li><strong>Group runs</strong> — everyone hears the same cues at the same time</li>
        </ul>

        <h2>Limitations</h2>
        <ul>
          <li>You'll need headphones (wired or Bluetooth) or to be comfortable with your phone's speaker playing audio aloud during the run.</li>
          <li>In extremely noisy environments (heavy traffic, wind), voice announcements may be harder to hear. Haptic cues help as a backup.</li>
          <li>Pausing or stopping the workout does require interacting with your phone or the Lock Screen Live Activity.</li>
        </ul>
      </div>
    </section>

    ${ctaBanner('Put Your Phone Away and Just Run', 'SplitCue handles the details. You handle the running.')}
    `,
  );
}
