/**
 * Shared HTML layout for SplitCue (splitcue.app).
 *
 * Every page is server-rendered HTML — no client-side JS required for content.
 * Includes Schema.org JSON-LD, Open Graph tags, and canonical URLs.
 */

const APP_STORE_URL =
  'https://apps.apple.com/us/app/pacecue-interval-timer/id6809834816';
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.surmount.pacecue';
const BASE_URL = 'https://splitcue.app';

export { APP_STORE_URL, PLAY_STORE_URL, BASE_URL };

interface PageMeta {
  title: string;
  description: string;
  path: string;
  jsonLd?: object;
}

const APP_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'MobileApplication',
  name: 'SplitCue',
  description:
    'A running app for iPhone and Android providing adaptive AI training plans, real-time audio pace announcements, structured interval workouts with voice coaching, and an AI workout builder. Supports GPS pace tracking, Bluetooth heart rate monitors and watches, customizable audio cues, and hands-free operation for runners.',
  applicationCategory: 'SportsApplication',
  operatingSystem: 'iOS, Android',
  url: BASE_URL,
  downloadUrl: [APP_STORE_URL, PLAY_STORE_URL],
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  featureList: [
    'AI training plans for 5K, 10K, half marathon, marathon, and pace goals',
    'Training plans that adapt after every run',
    'Plan adjustments by chat or voice',
    'Bluetooth heart rate monitor and watch support',
    'Route maps, elevation profiles, and terrain pace',
    'Strava upload',
    'Personal records and progress trends',
    'Real-time voice pace announcements',
    'GPS pace tracking',
    'Structured interval workouts',
    'AI workout builder',
    'Customizable audio cues (voice, beeps, or both)',
    'Elapsed time announcements',
    'Countdown warnings before interval transitions',
    'Target pace alerts',
    'Workout sharing',
    'Cloud sync',
    'Background operation with screen locked',
    'Home screen widgets',
    'iOS Live Activities',
  ],
};

const NAV_LINKS = [
  { label: 'Features', href: '/features/audio-pace-announcements' },
  { label: 'Training Plans', href: '/features/training-plans' },
  { label: 'Intervals', href: '/features/interval-running' },
  { label: 'AI Builder', href: '/features/ai-workout-builder' },
  { label: 'Compare', href: '/compare/pacecue-vs-nike-run-club' },
  { label: 'Pace Calculator', href: '/tools/pace-calculator' },
  { label: 'Guides', href: '/guides/beginner-run-walk' },
];

export function renderPage(meta: PageMeta, body: string): string {
  const canonical = `${BASE_URL}${meta.path}`;
  const jsonLd = meta.jsonLd ?? APP_JSON_LD;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(meta.title)}</title>
  <meta name="description" content="${escapeAttr(meta.description)}">
  <link rel="canonical" href="${canonical}">
  <link rel="icon" href="/favicon.ico" sizes="48x48">
  <link rel="icon" type="image/png" href="/favicon.png?v=2" sizes="512x512">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeAttr(meta.title)}">
  <meta property="og:description" content="${escapeAttr(meta.description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:site_name" content="SplitCue">
  <meta property="og:image" content="${BASE_URL}/banner.png">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeAttr(meta.title)}">
  <meta name="twitter:description" content="${escapeAttr(meta.description)}">
  <meta name="twitter:image" content="${BASE_URL}/banner.png">

  <!-- JSON-LD Structured Data -->
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>

  <style>${CSS}</style>
</head>
<body>
  <nav class="nav" aria-label="Main navigation">
    <div class="nav-inner">
      <a href="/" class="nav-brand">
        <img src="/icon.png" alt="SplitCue logo" class="nav-logo" width="32" height="32">
        SplitCue
      </a>
      <input type="checkbox" id="nav-toggle" class="nav-toggle-input" aria-label="Toggle navigation">
      <label for="nav-toggle" class="nav-toggle" aria-hidden="true">
        <span></span><span></span><span></span>
      </label>
      <div class="nav-links">
        ${NAV_LINKS.map(
          (l) => `<a href="${l.href}" class="nav-link">${l.label}</a>`,
        ).join('\n        ')}
        <a href="/#download" class="nav-cta">Download</a>
      </div>
    </div>
  </nav>

  <main>
    ${body}
  </main>

  <footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand-col">
          <div class="footer-brand">
            <img src="/icon.png" alt="SplitCue" width="40" height="40" class="footer-logo">
            <span>SplitCue</span>
          </div>
          <p class="footer-text">Real-time voice coaching for runners. Adaptive training plans, interval training, pace tracking, and AI-powered workouts.</p>
        </div>
        <div>
          <h3 class="footer-heading">Features</h3>
          <ul class="footer-links">
            <li><a href="/features/training-plans">AI Training Plans</a></li>
            <li><a href="/features/audio-pace-announcements">Audio Pace Announcements</a></li>
            <li><a href="/features/interval-running">Interval Running</a></li>
            <li><a href="/features/ai-workout-builder">AI Workout Builder</a></li>
            <li><a href="/tools/pace-calculator">Pace Calculator</a></li>
          </ul>
        </div>
        <div>
          <h3 class="footer-heading">Guides & Compare</h3>
          <ul class="footer-links">
            <li><a href="/guides/beginner-run-walk">Beginner Run/Walk</a></li>
            <li><a href="/guides/maintain-running-pace">Maintain Running Pace</a></li>
            <li><a href="/guides/hands-free-running">Hands-Free Running</a></li>
            <li><a href="/guides/audio-coaching-vs-gps-watches">Audio vs GPS Watches</a></li>
            <li><a href="/compare/pacecue-vs-nike-run-club">vs Nike Run Club</a></li>
            <li><a href="/compare/pacecue-vs-strava">vs Strava</a></li>
            <li><a href="/compare/pacecue-vs-runna">vs Runna</a></li>
          </ul>
        </div>
        <div>
          <h3 class="footer-heading">Download</h3>
          <ul class="footer-links">
            <li><a href="${APP_STORE_URL}" rel="noopener">App Store (iPhone)</a></li>
            <li><a href="${PLAY_STORE_URL}" rel="noopener">Google Play (Android)</a></li>
          </ul>
          <h3 class="footer-heading" style="margin-top: 24px;">Help</h3>
          <ul class="footer-links">
            <li><a href="/help/heart-rate-monitors">Heart Rate Monitors</a></li>
          </ul>
        </div>
      </div>
      <p class="footer-copy">&copy; ${new Date().getFullYear()} SplitCue. All rights reserved.</p>
    </div>
  </footer>
</body>
</html>`;
}

/** Wrap a screenshot in a phone frame. */
export function phoneFrame(src: string, alt: string): string {
  return `<div class="phone-frame">
  <div class="phone-notch"></div>
  <img src="${src}" alt="${escapeAttr(alt)}" loading="lazy" width="280">
</div>`;
}

/** App Store + Google Play download buttons. */
export function storeButtons(): string {
  return `<div class="btn-row">
      <a href="${APP_STORE_URL}" class="btn btn-primary btn-glow" rel="noopener">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
        Download on App Store
      </a>
      <a href="${PLAY_STORE_URL}" class="btn btn-primary btn-glow" rel="noopener">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594zM1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924zm12.207 10.065l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973zm0 2.067l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z"/></svg>
        Get it on Google Play
      </a>
    </div>`;
}

/** Download CTA banner. */
export function ctaBanner(heading: string, sub: string): string {
  return `<div class="section">
  <div class="cta-banner">
    <h2>${heading}</h2>
    <p>${sub}</p>
    ${storeButtons()}
  </div>
</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --green: #4ADE80;
    --green-dim: #22C55E;
    --green-glow: rgba(74, 222, 128, 0.3);
    --blue: #60A5FA;
    --red: #F87171;
    --yellow: #FBBF24;
    --bg: #0A0A0F;
    --surface: #12121A;
    --card: #16161F;
    --card-border: #1E1E2A;
    --text: #F1F5F9;
    --text-secondary: #94A3B8;
    --text-muted: #475569;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.7;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }

  a { color: var(--green); text-decoration: none; transition: color 0.2s; }
  a:hover { color: #6EE7A0; text-decoration: none; }

  .container { max-width: 800px; margin: 0 auto; padding: 0 24px; }
  .container-wide { max-width: 1100px; margin: 0 auto; padding: 0 24px; }

  /* ── Navigation ──────────────────────────────────────────── */
  .nav {
    border-bottom: 1px solid rgba(255,255,255,0.06);
    padding: 0 24px;
    position: sticky;
    top: 0;
    background: rgba(10, 10, 15, 0.85);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    z-index: 100;
    height: 64px;
  }
  .nav-inner {
    max-width: 1100px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 100%;
  }
  .nav-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 20px;
    font-weight: 800;
    color: var(--green);
    letter-spacing: 0.5px;
  }
  .nav-brand:hover { color: var(--green); }
  .nav-logo { border-radius: 8px; }
  .nav-links { display: flex; gap: 24px; align-items: center; }
  .nav-link { color: var(--text-secondary); font-size: 14px; font-weight: 500; transition: color 0.2s; white-space: nowrap; }
  .nav-link:hover { color: var(--text); }
  .nav-cta {
    background: var(--green);
    color: var(--bg) !important;
    padding: 8px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.3px;
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .nav-cta:hover { transform: translateY(-1px); box-shadow: 0 4px 20px var(--green-glow); }

  /* Mobile nav toggle */
  .nav-toggle-input { display: none; }
  .nav-toggle { display: none; cursor: pointer; flex-direction: column; gap: 5px; }
  .nav-toggle span { display: block; width: 22px; height: 2px; background: var(--text-secondary); border-radius: 2px; transition: 0.3s; }

  @media (max-width: 1040px) {
    .nav-toggle { display: flex; }
    .nav-links {
      position: fixed; top: 64px; left: 0; right: 0;
      background: rgba(10,10,15,0.97);
      backdrop-filter: blur(20px);
      flex-direction: column;
      padding: 24px;
      gap: 16px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      transform: translateY(-120%);
      transition: transform 0.3s;
    }
    .nav-toggle-input:checked ~ .nav-links { transform: translateY(0); }
  }

  /* ── Hero ─────────────────────────────────────────────────── */
  .hero {
    position: relative;
    padding: 100px 24px 80px;
    text-align: center;
    overflow: hidden;
  }
  .hero-bg {
    position: absolute;
    inset: 0;
    background: url('/banner.png') center center / cover no-repeat;
    opacity: 0.35;
    z-index: 0;
  }
  .hero-gradient {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 0%, var(--bg) 92%);
    z-index: 1;
  }
  .hero-content { position: relative; z-index: 2; }
  .hero-logo {
    width: 80px;
    height: 80px;
    border-radius: 20px;
    box-shadow: 0 0 60px var(--green-glow), 0 8px 32px rgba(0,0,0,0.5);
    margin-bottom: 28px;
    animation: float 4s ease-in-out infinite;
  }
  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
  }
  .hero h1 {
    font-size: clamp(28px, 5vw, 52px);
    font-weight: 900;
    color: #fff;
    margin-bottom: 20px;
    line-height: 1.15;
    letter-spacing: -0.5px;
  }
  .hero h1 .green { color: var(--green); }
  .hero .subtitle {
    font-size: clamp(16px, 2.5vw, 20px);
    color: var(--text-secondary);
    max-width: 620px;
    margin: 0 auto 36px;
    line-height: 1.6;
  }

  /* ── Buttons ──────────────────────────────────────────────── */
  .btn-row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 16px 32px;
    border-radius: 14px;
    font-size: 16px;
    font-weight: 700;
    text-decoration: none !important;
    transition: transform 0.15s, box-shadow 0.2s;
    cursor: pointer;
  }
  .btn:hover { transform: translateY(-2px); }
  .btn-primary {
    background: var(--green);
    color: var(--bg) !important;
  }
  .btn-glow:hover {
    box-shadow: 0 8px 40px var(--green-glow), 0 0 80px rgba(74,222,128,0.15);
  }
  .btn-secondary {
    background: var(--card);
    color: var(--text) !important;
    border: 1px solid var(--card-border);
  }
  .btn-secondary:hover { border-color: var(--green); }

  /* ── Sections ────────────────────────────────────────────── */
  .section { padding: 80px 24px; }
  .section-alt { background: var(--surface); }
  .section-label {
    display: inline-block;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--green);
    margin-bottom: 12px;
  }
  .section h2 {
    font-size: clamp(24px, 4vw, 36px);
    font-weight: 800;
    color: #fff;
    margin-bottom: 16px;
    letter-spacing: -0.3px;
  }
  .section h3 {
    font-size: 20px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 8px;
  }
  .section p { margin-bottom: 16px; color: var(--text-secondary); }
  .section-center { text-align: center; }

  /* ── Feature grid ────────────────────────────────────────── */
  .features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
    margin-top: 40px;
  }
  .feature-card {
    background: var(--card);
    border: 1px solid var(--card-border);
    border-radius: 20px;
    padding: 32px;
    transition: border-color 0.3s, transform 0.2s, box-shadow 0.3s;
    position: relative;
    overflow: hidden;
  }
  .feature-card:hover {
    border-color: rgba(74,222,128,0.3);
    transform: translateY(-4px);
    box-shadow: 0 12px 40px rgba(0,0,0,0.3);
  }
  .feature-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--green), transparent);
    opacity: 0;
    transition: opacity 0.3s;
  }
  .feature-card:hover::before { opacity: 1; }
  .feature-card h3 { font-size: 18px; margin-bottom: 8px; }
  .feature-card p { font-size: 15px; color: var(--text-muted); margin-bottom: 0; }
  .feature-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    margin-bottom: 16px;
  }
  .fi-green  { background: rgba(74,222,128,0.1); }
  .fi-blue   { background: rgba(96,165,250,0.1); }
  .fi-red    { background: rgba(248,113,113,0.1); }
  .fi-yellow { background: rgba(251,191,36,0.1); }

  /* ── Phone mockup ─────────────────────────────────────────── */
  .phone-showcase {
    display: flex;
    justify-content: center;
    gap: 32px;
    flex-wrap: wrap;
    margin-top: 48px;
    perspective: 1200px;
  }
  .phone-frame {
    position: relative;
    width: 280px;
    background: #000;
    border-radius: 36px;
    padding: 12px;
    box-shadow: 0 24px 80px rgba(0,0,0,0.6), 0 0 40px rgba(74,222,128,0.08);
    border: 2px solid #222;
    overflow: hidden;
    transition: transform 0.4s;
  }
  .phone-frame:hover { transform: translateY(-8px) scale(1.02); }
  .phone-notch {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    width: 120px;
    height: 28px;
    background: #000;
    border-radius: 0 0 16px 16px;
    z-index: 2;
  }
  .phone-frame img {
    width: 100%;
    border-radius: 24px;
    display: block;
  }
  .phone-label {
    text-align: center;
    margin-top: 16px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
  }

  /* ── Preset list ──────────────────────────────────────────── */
  .preset-list {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    margin-top: 24px;
  }
  .preset-item {
    background: var(--card);
    border: 1px solid var(--card-border);
    border-radius: 14px;
    padding: 18px 20px;
    transition: border-color 0.2s;
  }
  .preset-item:hover { border-color: rgba(74,222,128,0.3); }
  .preset-item strong { color: var(--green); display: block; margin-bottom: 4px; font-size: 15px; }
  .preset-item span { font-size: 13px; color: var(--text-muted); line-height: 1.5; }

  /* ── Page header (subpages) ───────────────────────────────── */
  .page-header {
    padding: 80px 24px 48px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .page-header::before {
    content: '';
    position: absolute;
    top: -100px;
    left: 50%;
    transform: translateX(-50%);
    width: 600px;
    height: 400px;
    background: radial-gradient(ellipse, var(--green-glow) 0%, transparent 70%);
    opacity: 0.3;
    z-index: 0;
  }
  .page-header > * { position: relative; z-index: 1; }
  .page-header h1 {
    font-size: clamp(26px, 4vw, 42px);
    font-weight: 900;
    color: #fff;
    margin-bottom: 16px;
    max-width: 800px;
    margin-left: auto;
    margin-right: auto;
    letter-spacing: -0.3px;
  }
  .page-header p {
    font-size: 18px;
    color: var(--text-secondary);
    max-width: 600px;
    margin: 0 auto;
  }

  /* ── Content prose ────────────────────────────────────────── */
  .prose { max-width: 800px; margin: 0 auto; }
  .prose h2 { margin-top: 48px; }
  .prose h3 { margin-top: 32px; }
  .prose ul, .prose ol { padding-left: 24px; margin-bottom: 16px; }
  .prose li { margin-bottom: 8px; color: var(--text-secondary); }
  .prose li::marker { color: var(--green); }
  .prose strong { color: var(--text); }
  .prose em { color: var(--text-muted); font-style: italic; }

  /* ── CTA banner ───────────────────────────────────────────── */
  .cta-banner {
    background: var(--card);
    border: 1px solid var(--card-border);
    border-radius: 24px;
    padding: 56px 40px;
    text-align: center;
    margin: 0 auto;
    max-width: 800px;
    position: relative;
    overflow: hidden;
  }
  .cta-banner::before {
    content: '';
    position: absolute;
    top: -2px; left: -2px; right: -2px; bottom: -2px;
    border-radius: 25px;
    background: linear-gradient(135deg, var(--green-glow), transparent 50%);
    z-index: -1;
  }
  .cta-banner h2 { margin-bottom: 12px; }
  .cta-banner p { margin-bottom: 28px; }

  /* ── Stats row ────────────────────────────────────────────── */
  .stats-row {
    display: flex;
    gap: 48px;
    justify-content: center;
    flex-wrap: wrap;
    margin-top: 40px;
    padding-top: 40px;
    border-top: 1px solid rgba(255,255,255,0.06);
  }
  .stat { text-align: center; }
  .stat-value {
    font-size: 36px;
    font-weight: 900;
    color: var(--green);
    display: block;
    letter-spacing: -1px;
  }
  .stat-label {
    font-size: 13px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-top: 4px;
  }

  /* ── Interval viz ─────────────────────────────────────────── */
  .interval-viz {
    display: flex;
    align-items: end;
    gap: 3px;
    height: 40px;
    margin: 20px 0;
  }
  .iv-bar {
    flex: 1;
    border-radius: 3px 3px 0 0;
    min-width: 6px;
    animation: growUp 0.6s ease-out forwards;
    transform-origin: bottom;
  }
  @keyframes growUp { from { transform: scaleY(0); } to { transform: scaleY(1); } }
  .iv-warmup { background: var(--yellow); }
  .iv-hard   { background: var(--red); }
  .iv-easy   { background: var(--green); }
  .iv-cool   { background: var(--blue); }

  /* ── Footer ──────────────────────────────────────────────── */
  .footer {
    border-top: 1px solid rgba(255,255,255,0.06);
    padding: 56px 24px 36px;
    background: #06060A;
  }
  .footer-grid {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr;
    gap: 40px;
    margin-bottom: 40px;
  }
  .footer-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }
  .footer-brand span { font-size: 20px; font-weight: 800; color: var(--green); }
  .footer-logo { border-radius: 10px; }
  .footer-heading { color: var(--text); font-size: 14px; font-weight: 700; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 1px; }
  .footer-text { color: var(--text-muted); font-size: 14px; line-height: 1.6; }
  .footer-links { list-style: none; }
  .footer-links li { margin-bottom: 10px; }
  .footer-links a { color: var(--text-muted); font-size: 14px; }
  .footer-links a:hover { color: var(--green); }
  .footer-copy { color: var(--text-muted); font-size: 13px; text-align: center; border-top: 1px solid rgba(255,255,255,0.04); padding-top: 28px; }

  @media (max-width: 768px) {
    .footer-grid { grid-template-columns: 1fr 1fr; gap: 32px; }
    .footer-brand-col { grid-column: 1 / -1; }
  }
  @media (max-width: 480px) {
    .footer-grid { grid-template-columns: 1fr; }
  }
  /* ── Comparison tables ──────────────────────────────────── */
  .compare-table-wrap { overflow-x: auto; margin-top: 24px; }
  .compare-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }
  .compare-table th {
    text-align: left;
    padding: 14px 16px;
    background: var(--card);
    color: var(--text);
    font-weight: 700;
    border-bottom: 2px solid var(--card-border);
    white-space: nowrap;
  }
  .compare-table td {
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    color: var(--text-secondary);
    vertical-align: top;
  }
  .compare-table tr:hover td { background: rgba(255,255,255,0.02); }
  .compare-table td.yes { color: var(--green); }
  .compare-table td.no { color: var(--text-muted); }
  .compare-table td.partial { color: var(--yellow); }
  .pace-ref-table td { text-align: center; font-variant-numeric: tabular-nums; }
  .pace-ref-table td:first-child,
  .pace-ref-table td:nth-child(2) { font-weight: 600; color: var(--text); text-align: left; }

  /* ── Calculator ───────────────────────────────────────────── */
  .calc-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
  }
  .calc-card {
    background: var(--card);
    border: 1px solid var(--card-border);
    border-radius: 20px;
    padding: 28px;
  }
  .calc-card h2 { font-size: 20px; margin-bottom: 6px; }
  .calc-card p { font-size: 14px; color: var(--text-muted); margin-bottom: 20px; }
  .calc-row { margin-bottom: 16px; }
  .calc-row label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .calc-input-group { display: flex; align-items: center; gap: 6px; }
  .calc-input-group span { color: var(--text-muted); font-size: 20px; font-weight: 700; }
  .calc-input {
    width: 72px;
    background: var(--surface);
    border: 1px solid var(--card-border);
    border-radius: 10px;
    color: var(--text);
    font-size: 18px;
    font-weight: 700;
    padding: 10px 12px;
    text-align: center;
    font-variant-numeric: tabular-nums;
    outline: none;
    transition: border-color 0.2s;
  }
  .calc-input:focus { border-color: var(--green); }
  .calc-select {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--card-border);
    border-radius: 10px;
    color: var(--text);
    font-size: 15px;
    padding: 10px 12px;
    outline: none;
    cursor: pointer;
  }
  .calc-select:focus { border-color: var(--green); }
  .calc-result {
    background: var(--surface);
    border-radius: 12px;
    padding: 16px;
    margin-top: 16px;
  }
  .calc-result-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 15px;
  }
  .calc-result-row span { color: var(--text-muted); }
  .calc-result-row strong { color: var(--green); font-variant-numeric: tabular-nums; }

  @media (max-width: 640px) {
    .hero { padding: 60px 16px 48px; }
    .section { padding: 56px 16px; }
    .page-header { padding: 56px 16px 32px; }
    .cta-banner { padding: 36px 20px; border-radius: 20px; }
    .phone-showcase { gap: 20px; }
    .phone-frame { width: 240px; }
    .stats-row { gap: 32px; }
    .features-grid { grid-template-columns: 1fr; }
    .calc-grid { grid-template-columns: 1fr; }
  }
`;
