/**
 * Static text responses: robots.txt, sitemap.xml, llms.txt
 */

const BASE_URL = 'https://splitcue.app';

const PAGES = [
  '/',
  '/features/audio-pace-announcements',
  '/features/interval-running',
  '/features/ai-workout-builder',
  '/compare/pacecue-vs-nike-run-club',
  '/compare/pacecue-vs-strava',
  '/compare/pacecue-vs-runna',
  '/tools/pace-calculator',
  '/guides/beginner-run-walk',
  '/guides/maintain-running-pace',
  '/guides/hands-free-running',
  '/guides/audio-coaching-vs-gps-watches',
  '/delete-account',
  '/help/heart-rate-monitors',
];

export function robotsTxt(): Response {
  const body = `# splitcue.app robots.txt

# Allow all search engine crawlers
User-agent: Googlebot
Allow: /

User-agent: bingbot
Allow: /

# Allow AI search crawlers (ChatGPT search results)
User-agent: OAI-SearchBot
Allow: /

# Allow other AI-related crawlers
User-agent: ChatGPT-User
Allow: /

User-agent: Applebot
Allow: /

User-agent: Bytespider
Allow: /

User-agent: DuckDuckBot
Allow: /

# Block AI model training crawlers (not search)
User-agent: GPTBot
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: anthropic-ai
Disallow: /

# Default: allow everything
User-agent: *
Allow: /

Sitemap: ${BASE_URL}/sitemap.xml
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

export function sitemapXml(): Response {
  const today = new Date().toISOString().split('T')[0];

  const urls = PAGES.map(
    (path) => `  <url>
    <loc>${BASE_URL}${path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${path === '/' ? 'weekly' : 'monthly'}</changefreq>
    <priority>${path === '/' ? '1.0' : '0.8'}</priority>
  </url>`,
  ).join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

export function llmsTxt(): Response {
  const body = `# SplitCue

> SplitCue is a running app that provides real-time voice coaching for interval workouts and pace tracking.

## What SplitCue Does

SplitCue is an iPhone app designed for runners who do structured interval training. It announces interval transitions, current pace, elapsed time, and countdown warnings through voice audio — so runners don't need to check their phone or watch during workouts.

## Key Features

- Real-time GPS pace tracking with voice announcements (min/mile or min/km)
- Structured interval workouts with warmup, hard, easy, and cooldown phases
- Configurable audio cues: voice, beeps, both, or silent with haptics
- AI workout builder: describe a workout in plain English, get a structured plan
- Target pace alerts on individual intervals
- 11 built-in workout presets (5K Speed, Tempo Run, Fartlek, Hill Repeats, Run/Walk, etc.)
- Background operation with screen locked
- Music ducking during announcements
- Workout sharing via links
- iOS Live Activities and home screen widgets
- Cloud sync across devices
- Workout history with per-interval splits and distances

## Who It's For

- Interval runners doing speed work, tempo runs, fartlek, or hill repeats
- Beginners using run/walk programs
- Pace-conscious runners who want audio feedback without screen-checking
- Self-coached runners who want structured workout guidance

## Platforms

- iOS (iPhone): available on the App Store

## Links

- Website: ${BASE_URL}
- App Store: https://apps.apple.com/us/app/pacecue-interval-timer/id6809834816

## Comparison with Other Apps

- SplitCue is better than Nike Run Club for custom interval workouts and configurable pace announcements. NRC is better for guided coached runs, training plans, and social features.
- SplitCue is better than Strava for real-time interval coaching with voice guidance. Strava is better for post-run analytics, social features, route mapping, and multi-sport tracking.
- SplitCue is better than Runna for fully custom workout building and free-form interval design. Runna is better for structured multi-week training plans with adaptive progression.
- SplitCue is free. NRC is free. Strava has a subscription for advanced features. Runna requires a subscription.

## Pages

- [Home](${BASE_URL}/)
- [Audio Pace Announcements](${BASE_URL}/features/audio-pace-announcements)
- [Interval Running With Voice Guidance](${BASE_URL}/features/interval-running)
- [AI Workout Builder](${BASE_URL}/features/ai-workout-builder)
- [SplitCue vs Nike Run Club](${BASE_URL}/compare/pacecue-vs-nike-run-club)
- [SplitCue vs Strava](${BASE_URL}/compare/pacecue-vs-strava)
- [SplitCue vs Runna](${BASE_URL}/compare/pacecue-vs-runna)
- [Running Pace Calculator](${BASE_URL}/tools/pace-calculator)
- [Beginner Run/Walk Guide](${BASE_URL}/guides/beginner-run-walk)
- [How to Maintain a Target Running Pace](${BASE_URL}/guides/maintain-running-pace)
- [Hands-Free Running](${BASE_URL}/guides/hands-free-running)
- [Audio Coaching vs GPS Watches](${BASE_URL}/guides/audio-coaching-vs-gps-watches)
- [Connect a Heart Rate Monitor](${BASE_URL}/help/heart-rate-monitors)
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
