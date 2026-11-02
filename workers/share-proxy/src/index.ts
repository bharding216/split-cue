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
 *   /guides/maintain-running-pace             → guide page
 *   /guides/hands-free-running                → guide page
 *   /robots.txt                               → crawler rules
 *   /sitemap.xml                              → sitemap
 *   /llms.txt                                 → LLM-readable summary
 *   /delete-account                            → account deletion info (Google Play requirement)
 *   /w/<code>                                 → proxy to Supabase share Edge Function
 *   /.well-known/apple-app-site-association   → iOS Universal Links config
 *   /.well-known/assetlinks.json              → Android App Links config
 */

import { homePage } from './pages/home';
import { audioPacePage } from './pages/audio-pace';
import { intervalRunningPage } from './pages/interval-running';
import { aiBuilderPage } from './pages/ai-builder';
import { maintainPacePage } from './pages/maintain-pace';
import { handsFreePage } from './pages/hands-free';
import { compareNrcPage } from './pages/compare-nrc';
import { compareStravaPage } from './pages/compare-strava';
import { compareRunnaPage } from './pages/compare-runna';
import { paceCalculatorPage } from './pages/pace-calculator';
import { beginnerRunWalkPage } from './pages/beginner-run-walk';
import { audioVsWatchesPage } from './pages/audio-vs-watches';
import { deleteAccountPage } from './pages/delete-account';
import { robotsTxt, sitemapXml, llmsTxt } from './static';

const SUPABASE_SHARE_FN =
  'https://oakhqqrxsavmoeqlzcny.supabase.co/functions/v1/share';

const BUNDLE_ID = 'com.toddly.runningintervals';
const TEAM_ID = 'M922P47QNZ';

// ── Apple App Site Association ──────────────────────────────────────

const AASA = JSON.stringify({
  applinks: {
    apps: [],
    details: [
      {
        appIDs: [
          `${TEAM_ID}.${BUNDLE_ID}`,
          `${TEAM_ID}.${BUNDLE_ID}.dev`,
          `${TEAM_ID}.${BUNDLE_ID}.preview`,
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
      // TODO: Replace with your app signing certificate SHA-256 fingerprint
      sha256_cert_fingerprints: ['TODO:ADD:YOUR:SHA256:FINGERPRINT:HERE'],
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
  async fetch(request: Request): Promise<Response> {
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

    // ── Shared workout link — proxy to Supabase Edge Function ────
    const workoutMatch = pathname.match(/^\/w\/([A-Za-z0-9]{4,16})$/);
    if (workoutMatch) {
      const code = workoutMatch[1];
      const upstream = `${SUPABASE_SHARE_FN}?code=${code}`;
      const resp = await fetch(upstream, {
        headers: { 'User-Agent': 'pacecue-share-proxy' },
      });

      return new Response(resp.body, {
        status: resp.status,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': resp.ok ? 'public, max-age=3600' : 'no-store',
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

    // ── Marketing pages ──────────────────────────────────────────
    const pageGenerator = PAGE_ROUTES[pathname];
    if (pageGenerator) {
      return htmlResponse(pageGenerator());
    }

    // ── 404 ──────────────────────────────────────────────────────
    return htmlResponse(notFoundPage(), 404);
  },
} satisfies ExportedHandler;

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
