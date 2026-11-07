/**
 * Weather for finished runs, via the `weather` edge function (Apple WeatherKit).
 *
 * Best effort: a run without GPS, a signed-out user, or no signal simply
 * leaves the run without weather.
 */

import { supabase } from '../analytics/supabaseClient';
import type { CompletedWorkout, RunWeather } from '../workout/workoutTypes';
import { updateHistoryEntry } from '../workout/workoutStorage';

/** ~1 km precision is plenty for weather and keeps exact routes off the server. */
function coarse(coord: number): number {
  return Math.round(coord * 100) / 100;
}

export async function fetchWeather(lat: number, lng: number): Promise<RunWeather | null> {
  const { data, error } = await supabase.functions.invoke('weather', {
    body: { lat: coarse(lat), lng: coarse(lng) },
  });
  if (error || !data?.weather) return null;
  return data.weather as RunWeather;
}

/** Look up weather at the end of a saved run's route and store it on the entry. */
export async function attachRunWeather(entry: CompletedWorkout): Promise<void> {
  const last = entry.route?.[entry.route.length - 1];
  if (!last) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;

  const weather = await fetchWeather(last.lat, last.lng);
  if (!weather) return;
  await updateHistoryEntry(entry.id, (e) => ({ ...e, weather }));
}
