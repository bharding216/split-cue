/**
 * Feature page: AI Training Plans
 */

import { renderPage, ctaBanner } from '../layout';

export function trainingPlansPage(): string {
  return renderPage(
    {
      title: 'AI Running Training Plans That Adapt to Every Run — SplitCue',
      description:
        'SplitCue builds a personalized training plan for your 5K, 10K, half marathon, marathon, or pace goal, then adapts it after every run. Every workout is voice coached.',
      path: '/features/training-plans',
    },
    `
    <section class="page-header">
      <h1>Training Plans That Adapt to Every Run</h1>
      <p>Tell SplitCue what you're training for. It builds a plan around your race date, your schedule, and your recent runs, then adjusts it as your training goes.</p>
    </section>

    <section class="section">
      <div class="prose">
        <h2>Build a Plan in Four Steps</h2>
        <ol>
          <li><strong>Pick your goal.</strong> Train for a 5K, 10K, half marathon, marathon, or a custom distance. Or skip the race and train toward a target pace.</li>
          <li><strong>Set your race date and goal time.</strong> Not sure what's realistic? SplitCue suggests goal times based on your recent runs, or lets the coach pick for you.</li>
          <li><strong>Choose your running days.</strong> Pick how many days a week you can run and which days work best.</li>
          <li><strong>Review the proposal.</strong> The coach explains its approach and lays out the training phases. Ask for changes in plain English before you approve it.</li>
        </ol>

        <h2>A Plan Built Around You</h2>
        <p>Plans use your running profile — experience, typical run length, weekly mileage, recent race times, and any limitations — along with your workout history. Your plan is organized into phases, from base building through taper, and laid out on a training calendar so you always know what's next.</p>
        <p>Upcoming workouts are filled in using your most recent runs, so the paces and durations keep up with your fitness instead of being fixed on day one.</p>

        <h2>Every Workout Is Voice Coached</h2>
        <p>Each day in your plan is a full SplitCue interval workout. When you start it, SplitCue coaches you through every warmup, interval, recovery, and cooldown with voice cues, pace announcements, and countdown warnings — with your phone in your pocket.</p>

        <h2>Adapts After Every Run</h2>
        <p>When you finish a plan workout, the AI coach reviews how it went: whether you hit your targets, exceeded them, or struggled. If your upcoming workouts should change, it proposes specific edits and shows you a before-and-after comparison. Apply the changes or keep your original plan — and undo if you change your mind.</p>

        <h2>Change Your Plan by Asking</h2>
        <p>Life happens. Talk to your plan by typing or using your voice:</p>
        <ul>
          <li><em>"This week is too much. Can you make it easier?"</em></li>
          <li><em>"Swap Thursday and Saturday."</em></li>
          <li><em>"I've been sick for a week. Help me ease back in."</em></li>
          <li><em>"Push me harder."</em></li>
          <li><em>"Help me taper for race day."</em></li>
        </ul>
        <p>SplitCue shows exactly which workouts will change before anything is applied.</p>

        <h2>Pricing</h2>
        <p>Your first AI training plan is free. SplitCue Pro adds unlimited training plans. Custom interval workouts, built-in presets, and voice coaching are free.</p>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container-wide">
        <div class="features-grid">
          <div class="feature-card">
            <h3>Race or Pace Goals</h3>
            <p>5K through marathon, any custom distance, or a target pace without a race.</p>
          </div>
          <div class="feature-card">
            <h3>Phases and Calendar</h3>
            <p>See where you are in your training block and every workout on your calendar.</p>
          </div>
          <div class="feature-card">
            <h3>Post-Run Coaching</h3>
            <p>Feedback after every plan run, with suggested changes you approve.</p>
          </div>
          <div class="feature-card">
            <h3>Heart Rate Aware</h3>
            <p>Connect a Bluetooth heart rate monitor or compatible watch to record heart rate on every run. <a href="/help/heart-rate-monitors">Supported devices</a></p>
          </div>
        </div>
      </div>
    </section>

    ${ctaBanner('Start Your Training Plan', 'Download SplitCue, open the Training tab, and build your first plan free.')}
    `,
  );
}
