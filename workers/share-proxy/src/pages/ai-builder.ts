/**
 * Feature page: AI Workout Builder
 */

import { renderPage, phoneFrame, ctaBanner } from '../layout';

export function aiBuilderPage(): string {
  return renderPage(
    {
      title:
        'AI Workout Builder for Running — SplitCue',
      description:
        'Describe a running workout in plain English and SplitCue\'s AI generates a complete structured interval workout. No more manually configuring every interval.',
      path: '/features/ai-workout-builder',
    },
    `
    <section class="page-header">
      <h1>AI Workout Builder — Describe It, Run It</h1>
      <p>Tell SplitCue what kind of workout you want in plain English, and the AI builds a complete interval workout for you.</p>
    </section>

    <section class="section section-center">
      <div class="container-wide">
        <div class="phone-showcase">
          <div>
            ${phoneFrame('/screenshot-ai-builder.png', 'SplitCue AI workout builder generating a beginner interval workout from a natural language prompt')}
            <p class="phone-label">AI Builder Chat</p>
          </div>
          <div>
            ${phoneFrame('/screenshot-profile.png', 'SplitCue running profile settings used by the AI builder for personalized workout generation')}
            <p class="phone-label">Running Profile for AI Context</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section section-alt">
      <div class="prose">
        <h2>How the AI Builder Works</h2>
        <p>SplitCue's AI Workout Builder takes a natural-language description and generates a fully structured interval workout with warmup, work intervals, recovery, and cooldown — ready to run immediately.</p>

        <p>Examples of prompts you can use:</p>
        <ul>
          <li><em>"A 30-minute tempo run with a warmup and cooldown"</em></li>
          <li><em>"8 × 400m repeats at 5K pace with 90 seconds recovery"</em></li>
          <li><em>"Something similar to what I ran last week but a bit harder"</em></li>
          <li><em>"A beginner run/walk program, 25 minutes total"</em></li>
          <li><em>"Pyramid intervals going 1-2-3-4-3-2-1 minutes"</em></li>
          <li><em>"A hill repeat workout for half marathon training"</em></li>
        </ul>

        <h2>Context-Aware Generation</h2>
        <p>The AI builder can use context from your <strong>running profile and workout history</strong> to generate workouts that fit your fitness level. If you've been running 7:30 pace in your recent workouts, the AI can set target paces accordingly rather than guessing.</p>
        <p>You can also have a <strong>conversation</strong> with the builder — ask it to make the workout harder, add more recovery, change the interval lengths, or adjust the warmup. The AI remembers what it already built and modifies it.</p>

        <h2>What the AI Generates</h2>
        <p>The output is a standard SplitCue workout with:</p>
        <ul>
          <li>Named warmup, main, and cooldown phases</li>
          <li>Interval durations, labels, and types</li>
          <li>Block repeat counts</li>
          <li>Optional target paces and effort ratings</li>
        </ul>
        <p>Once generated, the workout appears in your workout list. You can edit any part of it manually — change durations, add or remove intervals, adjust target paces — and then run it with full voice coaching like any other SplitCue workout.</p>

        <p>Want more than one workout? <a href="/features/training-plans">AI Training Plans</a> build a full multi-week schedule around your race date and adapt it after every run.</p>

        <h2>Example: Generating a Speed Session</h2>
        <p>If you type <em>"6 × 3 minutes hard with 2 minutes easy, plus a 10-minute warmup"</em>, the AI builder creates:</p>
        <ul>
          <li>1 × 10-minute warmup</li>
          <li>6 × (3 minutes hard / 2 minutes easy)</li>
          <li>1 × 5-minute cooldown</li>
        </ul>
        <p>Total: approximately 45 minutes. SplitCue assigns appropriate labels, and you can add target paces to the hard intervals before starting.</p>

        <h2>Limitations</h2>
        <ul>
          <li>The AI builder requires a SplitCue account (free to create) and an internet connection.</li>
          <li>AI-generated workouts should be reviewed before running — especially target paces, which the AI estimates from your history or your prompt.</li>
          <li>The AI builder creates time-based intervals. If you request distance-based intervals (e.g., "800m repeats"), the AI estimates an equivalent duration based on your fitness level.</li>
        </ul>
      </div>
    </section>

    ${ctaBanner('Build a Workout With AI', 'Download SplitCue, sign in, and tap "AI Builder" to describe your next workout.')}
    `,
  );
}
