// OAuth redirects (Supabase Google sign-in, Strava) are consumed by
// WebBrowser.openAuthSessionAsync, but Expo Router also receives them and
// would otherwise render the unmatched-route screen.
const OAUTH_CALLBACK = /^(?:[a-z][a-z0-9+.-]*:\/\/|\/)?(?:auth|strava)\/callback\/?$/i;

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    const withoutQuery = path.split(/[?#]/)[0];
    if (OAUTH_CALLBACK.test(withoutQuery)) {
      return initial ? '/' : null;
    }
    return path;
  } catch {
    return path;
  }
}
