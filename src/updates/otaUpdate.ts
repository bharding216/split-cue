/**
 * Controlled OTA update lifecycle.
 *
 * Checks for updates when the app foregrounds, downloads in the background,
 * and defers the reload until the user is not in an active workout.
 *
 * The hook never interrupts a workout run — GPS tracking and workout data
 * could be lost if the app reloads mid-session.
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * Manages the check → download → deferred-reload lifecycle.
 *
 * @param safeToReload `false` while the user is on a `/workout/run` screen.
 *   The hook will download the update eagerly but wait for this flag to
 *   become `true` before calling `reloadAsync()`.
 */
export function useOtaUpdate({ safeToReload }: { safeToReload: boolean }): void {
  const updateReady = useRef(false);
  const checking = useRef(false);

  useEffect(() => {
    if (!Updates.isEnabled || __DEV__) return;

    let cancelled = false;

    const checkAndFetch = async () => {
      if (checking.current) return;
      checking.current = true;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (cancelled) return;
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          if (!cancelled) updateReady.current = true;
        }
      } catch {
        // Network errors, rate limits, dev builds — silently ignore.
      } finally {
        checking.current = false;
      }
    };

    // Check on mount (app just opened or component re-rendered).
    checkAndFetch();

    // Re-check every time the app foregrounds.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !cancelled) checkAndFetch();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  // When an update has been downloaded and we're in a safe spot, reload.
  useEffect(() => {
    if (safeToReload && updateReady.current) {
      updateReady.current = false;
      Updates.reloadAsync().catch(() => {});
    }
  }, [safeToReload]);
}
