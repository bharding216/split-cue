import * as WebBrowser from 'expo-web-browser';
import { Colors } from '../constants/theme';
import { track } from '../analytics/track';
import { HR_HELP_URL } from './deviceGuides';

/** Open the heart rate help page in an in-app browser, optionally at a section anchor. */
export function openHeartRateHelp(source: string, section?: string): void {
  track('hr_help_opened', { source, section: section ?? null });
  WebBrowser.openBrowserAsync(section ? `${HR_HELP_URL}#${section}` : HR_HELP_URL, {
    controlsColor: Colors.primary,
    dismissButtonStyle: 'done',
  }).catch(() => {});
}
