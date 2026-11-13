/**
 * Cloudflare Worker — splitcue.app
 *
 * Serves the SplitCue marketing website, share-link proxy, and app deep-link configs.
 *
 * Routes:
 *   /                                        → homepage
 *   /features/audio-pace-announcements        → feature page
 *   /features/interval-running                → feature page
 *   /features/ai-workout-builder              → feature page
 *   /features/training-plans                  → feature page
 *   /guides/maintain-running-pace             → guide page
 *   /guides/hands-free-running                → guide page
 *   /robots.txt                               → crawler rules
 *   /sitemap.xml                              → sitemap
 *   /llms.txt                                 → LLM-readable summary
 *   /delete-account                            → account deletion info (Google Play requirement)
 *   /help/heart-rate-monitors                 → heart rate monitor setup help (linked from the app)
 *   /w/<code>                                 → proxy to Supabase share Edge Function
 *   POST /w/<code>/e?t=store_click&p=<os>     → landing page store tap beacon
 *   /.well-known/apple-app-site-association   → iOS Universal Links config
 *   /.well-known/assetlinks.json              → Android App Links config
 */

import { homePage } from './pages/home';
import { audioPacePage } from './pages/audio-pace';
import { intervalRunningPage } from './pages/interval-running';
import { aiBuilderPage } from './pages/ai-builder';
import { trainingPlansPage } from './pages/training-plans';
import { maintainPacePage } from './pages/maintain-pace';
import { handsFreePage } from './pages/hands-free';
import { compareNrcPage } from './pages/compare-nrc';
import { compareStravaPage } from './pages/compare-strava';
import { compareRunnaPage } from './pages/compare-runna';
import { paceCalculatorPage } from './pages/pace-calculator';
import { beginnerRunWalkPage } from './pages/beginner-run-walk';
import { audioVsWatchesPage } from './pages/audio-vs-watches';
import { deleteAccountPage } from './pages/delete-account';
import { fetchConfirmedHrDevices, helpHeartRatePage } from './pages/help-heart-rate';
import { robotsTxt, sitemapXml, llmsTxt } from './static';

const SUPABASE_URL = 'https://oakhqqrxsavmoeqlzcny.supabase.co';
const SUPABASE_SHARE_FN = `${SUPABASE_URL}/functions/v1/share`;

interface Env {
  SUPABASE_PUBLISHABLE_KEY?: string;
  /** Per-visitor limit on share pages and beacons, against scraping codes. */
  SHARE_RATE_LIMITER?: RateLimit;
}

const STORE_CLICK_PLATFORMS = new Set(['ios', 'android']);

/** Referring site's hostname only, so share events never store full URLs. */
function referrerHost(request: Request): string {
  const referer = request.headers.get('Referer');
  if (!referer) return '';
  try {
    return new URL(referer).hostname.slice(0, 64);
  } catch {
    return '';
  }
}

async function shareRateLimited(request: Request, env: Env): Promise<boolean> {
  if (!env.SHARE_RATE_LIMITER) return false;
  const visitor = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const { success } = await env.SHARE_RATE_LIMITER.limit({ key: `share:${visitor}` });
  return !success;
}

/** Log a landing page store tap. Always answers 204 so beacons never retry. */
async function logStoreClick(code: string, url: URL, env: Env): Promise<Response> {
  const platform = url.searchParams.get('p') ?? '';
  if (url.searchParams.get('t') === 'store_click' && STORE_CLICK_PLATFORMS.has(platform) && env.SUPABASE_PUBLISHABLE_KEY) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/log_share_event`, {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_code: code, p_event: 'store_click', p_platform: platform }),
      });
    } catch {
      // Best effort
    }
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

const BUNDLE_ID = 'com.toddly.runningintervals';
// Production is signed by Surmount; dev/preview are still signed by Toddly.
// Installs signed before the team transfer still carry the Toddly prefix until they update.
const TEAM_ID = 'G4DCQGFUKF';
const LEGACY_TEAM_ID = 'M922P47QNZ';

// ── Apple App Site Association ──────────────────────────────────────

const AASA = JSON.stringify({
  applinks: {
    apps: [],
    details: [
      {
        appIDs: [
          `${TEAM_ID}.${BUNDLE_ID}`,
          `${LEGACY_TEAM_ID}.${BUNDLE_ID}`,
          `${LEGACY_TEAM_ID}.${BUNDLE_ID}.dev`,
          `${LEGACY_TEAM_ID}.${BUNDLE_ID}.preview`,
        ],
        paths: ['/w/*'],
      },
    ],
  },
});

// ── Android Asset Links ─────────────────────────────────────────────

const ASSET_LINKS = JSON.stringify([
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'com.surmount.pacecue',
      // Play installs are signed with the Play app signing key; EAS builds
      // installed outside Play carry the EAS keystore signature.
      sha256_cert_fingerprints: [
        // Play app signing key
        '05:EA:A0:62:B1:83:E9:AC:3F:6F:22:E3:ED:A4:F6:DD:B3:6B:CD:8F:8E:AC:44:6D:8E:B9:C9:D9:98:C6:A1:74',
        // EAS keystore, production profile (Play upload key)
        '39:4A:A0:D5:15:94:57:8E:61:97:FE:7E:E9:82:5B:1D:83:4A:C5:48:AF:44:89:F9:87:7A:A5:20:E3:D7:DD:2F',
        // EAS keystore, build credentials zKjx_H1HoG
        '86:A4:37:87:51:2E:5C:8C:D0:77:F1:25:09:FD:84:5F:E3:1F:BD:12:BC:25:0F:B4:B5:18:C0:E2:ED:22:FC:AC',
      ],
    },
  },
]);

// ── HTML page helper ────────────────────────────────────────────────

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}

// ── Page routes (path → HTML generator) ─────────────────────────────

const PAGE_ROUTES: Record<string, () => string> = {
  '/': homePage,
  '/features/audio-pace-announcements': audioPacePage,
  '/features/interval-running': intervalRunningPage,
  '/features/ai-workout-builder': aiBuilderPage,
  '/features/training-plans': trainingPlansPage,
  '/guides/maintain-running-pace': maintainPacePage,
  '/guides/hands-free-running': handsFreePage,
  '/guides/beginner-run-walk': beginnerRunWalkPage,
  '/guides/audio-coaching-vs-gps-watches': audioVsWatchesPage,
  '/compare/pacecue-vs-nike-run-club': compareNrcPage,
  '/compare/pacecue-vs-strava': compareStravaPage,
  '/compare/pacecue-vs-runna': compareRunnaPage,
  '/tools/pace-calculator': paceCalculatorPage,
  '/delete-account': deleteAccountPage,
};

// ── Worker ───────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    let { pathname } = url;

    // Normalize trailing slash (except root)
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    // ── Static text files ────────────────────────────────────────
    if (pathname === '/robots.txt') return robotsTxt();
    if (pathname === '/sitemap.xml') return sitemapXml();
    if (pathname === '/llms.txt') return llmsTxt();

    // ── Shared workout link — store tap beacon ───────────────────
    const beaconMatch = pathname.match(/^\/w\/([A-Za-z0-9]{4,16})\/e$/);
    if (beaconMatch && request.method === 'POST') {
      if (await shareRateLimited(request, env)) {
        return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
      }
      return logStoreClick(beaconMatch[1], url, env);
    }

    // ── Shared workout link — proxy to Supabase Edge Function ────
    const workoutMatch = pathname.match(/^\/w\/([A-Za-z0-9]{4,16})$/);
    if (workoutMatch) {
      const code = workoutMatch[1];
      if (await shareRateLimited(request, env)) {
        return new Response('Too many requests. Try again in a minute.', {
          status: 429,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '60', 'Cache-Control': 'no-store' },
        });
      }
      const upstream = `${SUPABASE_SHARE_FN}?code=${code}`;
      let resp: Response | null = null;
      try {
        resp = await fetch(upstream, {
          headers: {
            'User-Agent': 'pacecue-share-proxy',
            // Lets the share function skip link-preview bots when counting opens.
            'X-Forwarded-User-Agent': request.headers.get('User-Agent') ?? '',
            'X-Forwarded-Referer': referrerHost(request),
          },
        });
      } catch {
        resp = null;
      }

      // Never show recipients a raw server error: fall back to a static page
      // that can still open the app or send them to the store.
      if (!resp || resp.status >= 500) {
        return new Response(shareFallbackPage(code), {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        });
      }

      return new Response(resp.body, {
        status: resp.status,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': resp.ok ? 'public, max-age=300' : 'no-store',
        },
      });
    }

    // ── Strava OAuth callback — redirect into the app ────────────
    if (pathname === '/strava/callback') {
      const query = url.search; // preserves ?code=...&state=...&scope=...
      // Determine the app scheme from the state param (which carries the
      // variant), defaulting to the production scheme.
      const scheme = 'pacecue';
      const deepLink = `${scheme}://strava/callback${query}`;
      return new Response(
        `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${deepLink}"></head><body>Redirecting to SplitCue…</body></html>`,
        {
          status: 302,
          headers: {
            Location: deepLink,
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    // ── iOS Universal Links ──────────────────────────────────────
    if (pathname === '/.well-known/apple-app-site-association') {
      return new Response(AASA, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    // ── Android App Links ────────────────────────────────────────
    if (pathname === '/.well-known/assetlinks.json') {
      return new Response(ASSET_LINKS, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    // ── Help pages with live data ────────────────────────────────
    if (pathname === '/help/heart-rate-monitors') {
      const confirmed = await fetchConfirmedHrDevices(SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);
      return htmlResponse(helpHeartRatePage(confirmed));
    }

    // ── Marketing pages ──────────────────────────────────────────
    const pageGenerator = PAGE_ROUTES[pathname];
    if (pageGenerator) {
      return htmlResponse(pageGenerator());
    }

    // ── 404 ──────────────────────────────────────────────────────
    return htmlResponse(notFoundPage(), 404);
  },
} satisfies ExportedHandler<Env>;

const APP_STORE_URL = 'https://apps.apple.com/us/app/pacecue-interval-timer/id6809834816';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.surmount.pacecue';

function shareFallbackPage(code: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Shared Workout \u2014 SplitCue</title>
  <meta property="og:title" content="Shared Workout \u2014 SplitCue">
  <meta property="og:description" content="Open in SplitCue to try this workout.">
  <meta property="og:image" content="https://splitcue.app/banner.png">
  <meta name="twitter:card" content="summary_large_image">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#181818;color:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
    .card{background:#242424;border-radius:16px;padding:32px;max-width:380px;width:100%;text-align:center}
    h1{font-size:22px;margin-bottom:8px}
    .summary{color:#aaa;font-size:14px;margin-bottom:24px}
    .btn{display:block;width:100%;padding:14px;border-radius:10px;font-size:16px;font-weight:600;text-decoration:none;margin-bottom:12px}
    .btn-primary{background:#4ADE80;color:#181818}
    .btn-secondary{background:#333;color:#f5f5f5}
    .footer{margin-top:20px;color:#666;font-size:12px}
  </style>
</head>
<body>
  <div class="card">
    <h1>Shared Workout</h1>
    <p class="summary">Open in SplitCue to try this workout. If it doesn't open, update to the latest version.</p>
    <a class="btn btn-primary" href="pacecue://w/${code}">Open in SplitCue</a>
    <a class="btn btn-secondary" href="${APP_STORE_URL}">Get SplitCue on the App Store</a>
    <a class="btn btn-secondary" href="${PLAY_STORE_URL}">Get SplitCue on Google Play</a>
    <p class="footer">SplitCue \u2014 Interval running, guided by audio cues</p>
  </div>
</body>
</html>`;
}

function notFoundPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Page Not Found — SplitCue</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0f0f0f; color: #e0e0e0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .box { text-align: center; }
    h1 { font-size: 48px; color: #4ADE80; margin-bottom: 8px; }
    p { color: #888; margin-bottom: 24px; }
    a { color: #4ADE80; text-decoration: none; font-weight: 600; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="box">
    <h1>404</h1>
    <p>This page doesn't exist.</p>
    <a href="/">Back to SplitCue</a>
  </div>
</body>
</html>`;
}
