/**
 * Background preparation of premium voice clips so cues play offline.
 * Never blocks a run: anything not ready falls back to device TTS.
 */

import type { AppSettings, WorkoutDefinition } from '../workout/workoutTypes';
import { loadSettings } from '../workout/workoutStorage';
import type { PaceUnit } from '../pace/paceTypes';
import type { PlanWorkout } from '../types/database';
import { enumerateWorkoutClips, globalPackClips } from './cuePhrases';
import { ensureClips, type EnsureProgress } from './premiumVoice';
import { setPremiumVoice } from './audioManager';

const UPCOMING_WORKOUTS_TO_PREPARE = 3;

function usesPremiumVoice(settings: AppSettings): boolean {
  return (
    settings.voiceEngine === 'premium' &&
    (settings.audioCueMode === 'voice' || settings.audioCueMode === 'both' || settings.audioCueMode === 'beeps')
  );
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Shared clips (pace segments, completion, distance progress) for a voice.
 * These ship with the app, so this only downloads phrases added after the
 * bundle was generated.
 */
export function prepareVoicePack(
  voiceId: string,
  unit: PaceUnit,
  onProgress?: (p: EnsureProgress) => void,
): Promise<EnsureProgress> {
  return ensureClips(voiceId, globalPackClips(unit), onProgress);
}

/**
 * Download every clip a workout can speak. Safe to call repeatedly; cached
 * clips are skipped. Loads saved settings when none are passed.
 */
export async function prepareWorkoutAudio(
  workout: WorkoutDefinition,
  settingsOverride?: AppSettings,
): Promise<void> {
  const settings = settingsOverride ?? (await loadSettings());
  if (!usesPremiumVoice(settings)) return;
  try {
    await ensureClips(settings.premiumVoiceId, [
      ...globalPackClips(settings.paceUnit),
      ...enumerateWorkoutClips(workout, settings),
    ]);
  } catch (e) {
    console.warn('Failed to prepare workout audio:', e);
  }
}

/** Activate the saved voice and fill in any shared clips missing from the bundle. Call once at launch. */
export async function initVoice(): Promise<void> {
  const settings = await loadSettings();
  const premium = settings.voiceEngine === 'premium';
  setPremiumVoice(premium ? settings.premiumVoiceId : null);
  if (!usesPremiumVoice(settings)) return;
  try {
    await prepareVoicePack(settings.premiumVoiceId, settings.paceUnit);
  } catch (e) {
    console.warn('Failed to prepare voice pack:', e);
  }
}

/** Prepare the next few planned workouts so today's run is usually ready before it's opened. */
export async function prepareUpcomingPlanWorkouts(planWorkouts: PlanWorkout[]): Promise<void> {
  const today = toDateKey(new Date());
  const upcoming = planWorkouts
    .filter((pw) => pw.status === 'planned' && pw.date >= today)
    .map((pw) => ({ date: pw.date, workout: pw.workout_data as WorkoutDefinition | null }))
    .filter((pw) => pw.workout?.blocks?.length)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, UPCOMING_WORKOUTS_TO_PREPARE);
  if (upcoming.length === 0) return;

  const settings = await loadSettings();
  for (const { workout } of upcoming) {
    await prepareWorkoutAudio(workout!, settings);
  }
}
