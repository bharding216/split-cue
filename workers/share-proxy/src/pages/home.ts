/**
 * Homepage — the most important page for AI readability.
 * Answers: What is SplitCue? Who is it for? What problems does it solve?
 */

import { renderPage, phoneFrame, ctaBanner, storeButtons } from '../layout';

export function homePage(): string {
  return renderPage(
    {
      title:
        'SplitCue — Adaptive Training Plans and Real-Time Voice Coaching for Runners',
      description:
        'SplitCue is a running app for iPhone and Android with adaptive AI training plans, real-time audio pace announcements, voice-coached interval workouts, heart rate monitor support, and an AI workout builder. Available on the App Store and Google Play.',
      path: '/',
    },
    `
    <!-- ── Hero ──────────────────────────────────────────────── -->
    <section class="hero">
      <div class="hero-bg" role="presentation"></div>
      <div class="hero-gradient" role="presentation"></div>
      <div class="hero-content">
        <img src="/icon.png" alt="SplitCue app icon" class="hero-logo" width="80" height="80">
        <h1>Real-Time <span class="green">Voice Pace Coaching</span> for Runners</h1>
        <p class="subtitle">SplitCue is a running app for iPhone and Android that builds a training plan around your goal, adapts it after every run, and coaches you through each workout with voice cues for pace, distance, and interval transitions — so you can focus on running, not your screen.</p>
        <div id="download">
          ${storeButtons()}
        </div>
        <div class="stats-row">
          <div class="stat"><span class="stat-value">11</span><span class="stat-label">Built-in Workouts</span></div>
          <div class="stat"><span class="stat-value">5K–26.2</span><span class="stat-label">AI Training Plans</span></div>
          <div class="stat"><span class="stat-value">HR</span><span class="stat-label">Monitor &amp; Watch Support</span></div>
        </div>
      </div>
    </section>

    <!-- ── App Screenshots ───────────────────────────────────── -->
    <section class="section section-center">
      <div class="container-wide">
        <span class="section-label">See It In Action</span>
        <h2>Designed for Runners Who Mean Business</h2>
        <p>A clean, dark interface built for glanceable info during workouts — or no glances at all.</p>
        <div class="phone-showcase">
          <div>
            ${phoneFrame('/screenshot-workouts.png', 'SplitCue workout list showing interval workouts with start buttons')}
            <p class="phone-label">Workout Library</p>
          </div>
          <div>
            ${phoneFrame('/screenshot-ai-builder.png', 'SplitCue AI workout builder chat generating a beginner interval workout')}
            <p class="phone-label">AI Workout Builder</p>
          </div>
          <div>
            ${phoneFrame('/screenshot-history.png', 'SplitCue workout history showing completed run with split times and pace data')}
            <p class="phone-label">Run History & Splits</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── What Is SplitCue ───────────────────────────────────── -->
    <section class="section section-alt">
      <div class="container-wide">
        <span class="section-label">What Is SplitCue</span>
        <h2>Adaptive Training Plans With Hands-Free Voice Coaching</h2>
        <p>SplitCue is a running app for runners who want structure without staring at a screen. Get an AI training plan for your next race, or build your own interval workouts. Instead of constantly checking your phone or watch, SplitCue announces your current pace, elapsed time, distance, and interval transitions out loud.</p>
        <p>Whether you're training for a marathon, doing 400-meter repeats, tempo runs, fartlek sessions, or run/walk intervals, SplitCue guides you through every phase with clear audio cues.</p>

        <div class="features-grid">
          <div class="feature-card">
            <div class="feature-icon fi-green" aria-hidden="true">📅</div>
            <h3>AI Training Plans</h3>
            <p>Training for a 5K, 10K, half marathon, marathon, or a target pace? SplitCue builds a phased plan around your race date, running days, and recent runs. <a href="/features/training-plans">Learn more</a></p>
          </div>
          <div class="feature-card">
            <div class="feature-icon fi-yellow" aria-hidden="true">🔁</div>
            <h3>Adapts After Every Run</h3>
            <p>After each plan workout, the AI coach reviews how it went and suggests changes to what's ahead. Need an easier week or to swap days? Just ask, by text or voice.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon fi-red" aria-hidden="true">❤️</div>
            <h3>Heart Rate Monitors and Watches</h3>
            <p>Connect a Bluetooth chest strap or a watch that broadcasts heart rate — Garmin, Polar, COROS, Amazfit, WHOOP, and more — and record heart rate on every run. <a href="/help/heart-rate-monitors">Supported devices</a></p>
          </div>
          <div class="feature-card">
            <div class="feature-icon fi-green" aria-hidden="true">🎙️</div>
            <h3>Voice Pace Announcements</h3>
            <p>Hear your current pace (min/mile or min/km) at configurable intervals — every 15, 30, 60, or 120 seconds — using GPS-based tracking with a rolling average for accuracy.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon fi-red" aria-hidden="true">⏱️</div>
            <h3>Interval Timer With Audio Cues</h3>
            <p>Build structured workouts with warmup, hard, easy, and cooldown intervals. SplitCue announces each transition, tells you what's next, and gives countdown warnings.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon fi-blue" aria-hidden="true">🤖</div>
            <h3>AI Workout Builder</h3>
            <p>Describe what you want in plain English — like "a 30-minute tempo run with strides" — and SplitCue's AI generates a complete interval workout.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon fi-green" aria-hidden="true">📊</div>
            <h3>GPS Pace Tracking</h3>
            <p>Real-time GPS tracks your pace, distance, and speed throughout your run. Set target paces on individual intervals and get alerts when you drift off target.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon fi-yellow" aria-hidden="true">🔇</div>
            <h3>Runs in Background</h3>
            <p>Lock your phone and keep running. SplitCue continues tracking and announcing in the background, ducking your music volume for cues and restoring it after.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon fi-blue" aria-hidden="true">📤</div>
            <h3>Workout Sharing</h3>
            <p>Share your workout structures and completed results with other runners via a link, or challenge a friend to beat your result. Recipients can import the workout directly into SplitCue.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon fi-green" aria-hidden="true">🗺️</div>
            <h3>Route Maps and Strava Upload</h3>
            <p>Review every run with a route map, elevation profile, uphill/flat/downhill pace, splits, and personal records. Upload runs to Strava, heart rate included.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── More Screenshots ──────────────────────────────────── -->
    <section class="section section-center">
      <div class="container-wide">
        <span class="section-label">Fully Customizable</span>
        <h2>Build Your Perfect Workout</h2>
        <p>Design interval workouts with precise control — or let the AI handle it.</p>
        <div class="phone-showcase">
          <div>
            ${phoneFrame('/screenshot-editor.png', 'SplitCue workout editor with warmup intervals, target pace, and effort settings')}
            <p class="phone-label">Workout Editor</p>
          </div>
          <div>
            ${phoneFrame('/screenshot-audio-cues.png', 'SplitCue audio cue settings showing voice selection, music ducking, and countdown options')}
            <p class="phone-label">Audio & Voice Settings</p>
          </div>
          <div>
            ${phoneFrame('/screenshot-profile.png', 'SplitCue running profile with experience level, pace settings, and training goals')}
            <p class="phone-label">Running Profile</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Who Is It For ─────────────────────────────────────── -->
    <section class="section section-alt">
      <div class="container-wide">
        <span class="section-label">Who It's For</span>
        <h2>Built for Every Kind of Runner</h2>
        <div class="features-grid">
          <div class="feature-card">
            <h3>Runners Training for a Race</h3>
            <p>From your first 5K to a marathon, get a plan that fits your schedule and adjusts as your fitness changes.</p>
          </div>
          <div class="feature-card">
            <h3>Interval Runners</h3>
            <p>Speed work, tempo runs, fartlek, hill repeats — SplitCue handles the timing so you can focus on effort.</p>
          </div>
          <div class="feature-card">
            <h3>Beginners Using Run/Walk</h3>
            <p>Following a run/walk program? SplitCue tells you when to run and when to walk with clear voice cues.</p>
          </div>
          <div class="feature-card">
            <h3>Pace-Conscious Runners</h3>
            <p>Training for a race pace? Get regular audio reminders of your current speed without looking at a screen.</p>
          </div>
          <div class="feature-card">
            <h3>Self-Coached Athletes</h3>
            <p>No coach? AI training plans and the AI workout builder create workouts tailored to your fitness level and goals.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Presets ────────────────────────────────────────────── -->
    <section class="section">
      <div class="container-wide">
        <span class="section-label">Ready to Run</span>
        <h2>11 Built-In Workout Presets</h2>
        <p>Start immediately with ready-to-run workouts. Every preset can be customized or used as a starting point.</p>

        <!-- Interval visualization -->
        <div class="interval-viz" aria-hidden="true">
          <div class="iv-bar iv-warmup" style="height:35%"></div>
          <div class="iv-bar iv-warmup" style="height:40%"></div>
          <div class="iv-bar iv-hard" style="height:90%"></div>
          <div class="iv-bar iv-easy" style="height:45%"></div>
          <div class="iv-bar iv-hard" style="height:95%"></div>
          <div class="iv-bar iv-easy" style="height:40%"></div>
          <div class="iv-bar iv-hard" style="height:100%"></div>
          <div class="iv-bar iv-easy" style="height:45%"></div>
          <div class="iv-bar iv-hard" style="height:85%"></div>
          <div class="iv-bar iv-easy" style="height:40%"></div>
          <div class="iv-bar iv-hard" style="height:90%"></div>
          <div class="iv-bar iv-easy" style="height:45%"></div>
          <div class="iv-bar iv-hard" style="height:80%"></div>
          <div class="iv-bar iv-easy" style="height:42%"></div>
          <div class="iv-bar iv-cool" style="height:30%"></div>
          <div class="iv-bar iv-cool" style="height:25%"></div>
        </div>

        <ul class="preset-list">
          <li class="preset-item"><strong>5K Speed</strong><span>6 × (3 min hard / 2 min easy) with warmup and cooldown</span></li>
          <li class="preset-item"><strong>Tempo Run</strong><span>20-minute sustained tempo effort with stride warmup</span></li>
          <li class="preset-item"><strong>Short Intervals</strong><span>8 × (90 sec sprint / 90 sec recovery)</span></li>
          <li class="preset-item"><strong>Pyramid</strong><span>1-2-3-2-1 minute hard intervals with equal recovery</span></li>
          <li class="preset-item"><strong>Fartlek</strong><span>Mixed-length speed bursts with jog recovery</span></li>
          <li class="preset-item"><strong>Hill Repeats</strong><span>8 × (1 min hill / 90 sec jog recovery)</span></li>
          <li class="preset-item"><strong>Run/Walk</strong><span>8 × (3 min run / 1 min walk) for beginners</span></li>
          <li class="preset-item"><strong>400m Repeats</strong><span>10 × (90 sec sprint / 90 sec recovery)</span></li>
          <li class="preset-item"><strong>Mile Intervals</strong><span>4 × (6 min race pace / 2 min recovery)</span></li>
          <li class="preset-item"><strong>5K Training</strong><span>3 × tempo + 3 × speed intervals</span></li>
          <li class="preset-item"><strong>Easy 30 Min</strong><span>Simple 30-minute easy run timer</span></li>
        </ul>
      </div>
    </section>

    <!-- ── Problems Solved ───────────────────────────────────── -->
    <section class="section section-alt">
      <div class="container-wide">
        <span class="section-label">Why SplitCue</span>
        <h2>Problems SplitCue Solves</h2>
        <div class="prose">
          <h3>Training plans that ignore how your runs actually go</h3>
          <p>A fixed plan doesn't know you were sick last week or crushed yesterday's tempo run. SplitCue <strong>reviews every plan workout and proposes changes</strong> to what's ahead, and you can reshape your plan anytime just by asking.</p>

          <h3>Constantly checking your phone or watch</h3>
          <p>Most runners glance at their screen dozens of times per workout to check pace or see when to switch intervals. SplitCue eliminates this by <strong>announcing everything out loud</strong>. You hear your pace, when to speed up or slow down, and countdown warnings before each transition.</p>

          <h3>Losing track of intervals during speed work</h3>
          <p>Trying to remember "was that my 4th or 5th repeat?" is distracting. SplitCue tracks your position in the workout and <strong>announces the set number, block name, and what's coming next</strong> at every transition.</p>

          <h3>Building structured workouts is tedious</h3>
          <p>Instead of manually configuring every interval, you can <strong>describe your workout in plain English</strong> and let SplitCue's AI builder create it — or pick from 11 built-in presets and customize from there.</p>

          <h3>Holding a consistent target pace</h3>
          <p>SplitCue's GPS pace tracking lets you set a <strong>target pace on any interval</strong>. The app tells you if you're ahead of or behind your target, helping you lock in the right effort level.</p>
        </div>
      </div>
    </section>

    <!-- ── Audio Options ─────────────────────────────────────── -->
    <section class="section">
      <div class="container-wide">
        <span class="section-label">Audio & Platform</span>
        <h2>Customizable Audio Cues</h2>
        <div class="prose">
          <p>SplitCue is available on <strong>iPhone</strong> (App Store) and <strong>Android</strong> (Google Play). It works with wired headphones, Bluetooth earbuds, or your phone's speaker.</p>

          <h3>Audio Cue Modes</h3>
          <ul>
            <li><strong>Voice</strong> — spoken announcements for pace, intervals, and time remaining</li>
            <li><strong>Beeps</strong> — short tones to mark interval transitions</li>
            <li><strong>Both</strong> — voice announcements with beep tones at transitions</li>
            <li><strong>Silent</strong> — visual-only with haptic feedback</li>
          </ul>

          <h3>Customizable Announcements</h3>
          <ul>
            <li>Pace announcements every 15, 30, 45, 60, 90, or 120 seconds</li>
            <li>Elapsed time announcements at configurable intervals</li>
            <li>Countdown warnings at 10 seconds (configurable) before interval ends</li>
            <li>Music ducking — SplitCue lowers your music volume during cues, then restores it</li>
            <li>Choose your preferred TTS voice from your device's available voices</li>
          </ul>

          <h3>Additional Features</h3>
          <ul>
            <li>Heart rate from Bluetooth monitors and compatible watches, with heart rate graphs (per-interval and recovery analysis with Pro)</li>
            <li>Route maps, elevation profiles, and pace by terrain</li>
            <li>Strava upload, including heart rate</li>
            <li>Personal records, awards, and progress trends</li>
            <li>Home screen widgets for quick workout access</li>
            <li>iOS Live Activities showing workout progress on the iPhone lock screen</li>
            <li>Haptic feedback at interval transitions</li>
            <li>Workout history with per-interval split times and distances</li>
            <li>Cloud sync to keep workouts across devices</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- ── CTA ───────────────────────────────────────────────── -->
    ${ctaBanner('Start Running With Real-Time Voice Coaching', 'Download SplitCue free and build your first training plan or try a built-in workout today.')}
    `,
  );
}
