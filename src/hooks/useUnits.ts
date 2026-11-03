import { useEffect, useState } from 'react';
import type { PaceUnit } from '../pace/paceTypes';
import { DEFAULT_SETTINGS } from '../workout/workoutTypes';
import { loadSettings, onSettingsSaved } from '../workout/workoutStorage';

/** The runner's distance/pace unit, kept in sync with saved settings. */
export function useUnits(): PaceUnit {
  const [unit, setUnit] = useState<PaceUnit>(DEFAULT_SETTINGS.paceUnit);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      loadSettings().then((s) => {
        if (active) setUnit(s.paceUnit);
      });
    };
    refresh();
    const unsubscribe = onSettingsSaved(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return unit;
}
