// OAuth redirects (Supabase Google sign-in, Strava) are consumed by
// WebBrowser.openAuthSessionAsync, but Expo Router also receives them and
// would otherwise render the unmatched-route screen.
const OAUTH_CALLBACK = /^(?:[a-z][a-z0-9+.-]*:\/\/|\/)?(?:auth|strava)\/callback\/?$/i;

// Share deep links (pacecue://w/<code>) don't map to a file route — they're
// handled by the Linking listener in _layout.tsx. Intercept them here so Expo
// Router doesn't render an unmatched-route screen.
const SHARE_CODE = /^(?:[a-z][a-z0-9+.-]*:\/\/|\/)?w\/[A-Za-z0-9]{4,16}\/?(?:[?#].*)?$/i;

// Legacy share deep links (pacecue://workout/import?d=...) would match the
// workout/[id] route with id="import", rendering the wrong screen.
const LEGACY_SHARE = /^(?:[a-z][a-z0-9+.-]*:\/\/|\/)?workout\/import\b/i;

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    const withoutQuery = path.split(/[?#]/)[0];
    if (OAUTH_CALLBACK.test(withoutQuery)) {
      return initial ? '/' : null;
    }
    if (SHARE_CODE.test(path) || LEGACY_SHARE.test(path)) {
      return initial ? '/' : null;
    }
    return path;
  } catch {
    return path;
  }
}
