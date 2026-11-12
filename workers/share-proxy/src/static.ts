/**
 * Static text responses: robots.txt, sitemap.xml, llms.txt
 */

const BASE_URL = 'https://splitcue.app';

const PAGES = [
  '/',
  '/features/audio-pace-announcements',
  '/features/interval-running',
  '/features/ai-workout-builder',
  '/features/training-plans',
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

> SplitCue is a running app with adaptive AI training plans and real-time voice coaching for interval workouts and pace tracking.

## What SplitCue Does

SplitCue is an iPhone and Android app for runners who want structured training. It builds AI training plans around a race or pace goal and adapts them after every run. During workouts it announces interval transitions, current pace, elapsed time, and countdown warnings through voice audio — so runners don't need to check their phone or watch.

## Key Features

- AI training plans for 5K, 10K, half marathon, marathon, custom distances, or a target pace, organized into training phases on a calendar
- Adaptive plans: the AI coach reviews each completed plan workout and proposes changes to upcoming workouts, which the runner approves
- Plan adjustments by chat or voice (e.g. "make this week easier", "swap days", "help me taper")
- Heart rate from Bluetooth chest straps and watches that broadcast heart rate (Garmin, Polar, COROS, Amazfit, WHOOP, Wahoo, and more)
- Route maps, elevation profiles, and pace by terrain (uphill, flat, downhill)
- Strava upload, including heart rate
- Personal records, awards, and progress trends
- Real-time GPS pace tracking with voice announcements (min/mile or min/km)
- Structured interval workouts with warmup, hard, easy, and cooldown phases
- Configurable audio cues: voice, beeps, both, or silent with haptics
- AI workout builder: describe a workout in plain English, get a structured plan
- Target pace alerts on individual intervals
- 11 built-in workout presets (5K Speed, Tempo Run, Fartlek, Hill Repeats, Run/Walk, etc.)
- Background operation with screen locked
- Music ducking during announcements
- Workout sharing via links, including challenging a friend to beat a result
- iOS Live Activities and home screen widgets
- Cloud sync across devices
- Workout history with per-interval splits and distances

## Who It's For

- Runners training for a 5K, 10K, half marathon, or marathon who want an adaptive plan
- Interval runners doing speed work, tempo runs, fartlek, or hill repeats
- Beginners using run/walk programs
- Pace-conscious runners who want audio feedback without screen-checking
- Self-coached runners who want structured workout guidance

## Platforms

- iOS (iPhone): available on the App Store
- Android: available on Google Play

## Links

- Website: ${BASE_URL}
- App Store: https://apps.apple.com/us/app/pacecue-interval-timer/id6809834816
- Google Play: https://play.google.com/store/apps/details?id=com.surmount.pacecue

## Comparison with Other Apps

- SplitCue is better than Nike Run Club for adaptive training plans, custom interval workouts, and configurable pace announcements. NRC is better for coach-narrated guided runs and social features.
- SplitCue is better than Strava for training plans and real-time interval coaching with voice guidance, and can upload runs to Strava. Strava is better for long-term analytics, social features, route planning, and multi-sport tracking.
- SplitCue and Runna both offer adaptive training plans. SplitCue is better for fully custom workout building, adjusting plans by chat or voice, and price. Runna is better for coach-designed programming and pushing workouts to Garmin and Apple Watch.
- SplitCue is free, including one AI training plan; SplitCue Pro adds unlimited plans. NRC is free. Strava has a subscription for advanced features. Runna requires a subscription.

## Pages

- [Home](${BASE_URL}/)
- [AI Training Plans](${BASE_URL}/features/training-plans)
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
