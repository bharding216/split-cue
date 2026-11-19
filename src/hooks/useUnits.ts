import { useEffect, useState } from 'react';
import type { PaceUnit } from '../pace/paceTypes';
import { loadSettings, onSettingsSaved } from '../workout/workoutStorage';
import { localeDefaultPaceUnit } from '../i18n/localeUnits';

/** The runner's distance/pace unit, kept in sync with saved settings. */
export function useUnits(): PaceUnit {
  const [unit, setUnit] = useState<PaceUnit>(localeDefaultPaceUnit);

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
