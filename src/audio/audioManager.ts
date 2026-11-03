/**
 * Audio cue manager for SplitCue.
 *
 * Uses expo-audio for beep tones and voice announcements. Announcements
 * play from cached premium voice clips when available and fall back to
 * expo-speech otherwise. Configured for background playback so cues work
 * with the phone locked.
 */

import {
  setAudioModeAsync,
  createAudioPlayer,
  type AudioPlayer,
} from 'expo-audio';
import * as Speech from 'expo-speech';
import type { AudioCueMode } from '../workout/workoutTypes';
import {
  type CueContext,
  type CuePhrase,
  intervalStartCue,
  warningCue,
  warningSecondsCue,
  WORKOUT_COMPLETE_TEXT,
} from './cuePhrases';
import { type Clip, getClipSource, loadVoiceIndex } from './premiumVoice';
import { playClipSequence, stopClips } from './clipPlayer';

let isAudioConfigured = false;

// ── Per-cue ducking ──────────────────────────────────────────────────
// Instead of keeping duckOthers active for the entire workout, we flip
// into duckOthers mode right before a cue and flip back to mixWithOthers
// once the cue finishes.  A debounced timer handles the "unduck" so that
// rapid-fire cues (e.g. countdown 3-2-1 → interval start) stay ducked
// without a gap.

let duckingEnabled = false;
let unduckTimer: ReturnType<typeof setTimeout> | null = null;

/** Store whether the user wants other audio ducked during cues. */
export function setDuckingEnabled(enabled: boolean): void {
  duckingEnabled = enabled;
  if (!enabled) {
    if (unduckTimer) {
      clearTimeout(unduckTimer);
      unduckTimer = null;
    }
    // Immediately restore mix mode when the user disables the setting
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'mixWithOthers',
    }).catch(() => {});
  }
}

/** Temporarily switch to duckOthers mode before playing a cue. */
async function activateDucking(): Promise<void> {
  if (!duckingEnabled) return;
  // Cancel any pending unduck — a new cue is about to play
  if (unduckTimer) {
    clearTimeout(unduckTimer);
    unduckTimer = null;
  }
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
    });
  } catch (e) {
    console.warn('Failed to activate ducking:', e);
  }
}

/**
 * Schedule a return to mixWithOthers after a cue finishes.
 * The delay gives a brief buffer so back-to-back cues don't cause
 * rapid duck/unduck flicker.
 */
function scheduleUnduck(delayMs = 500): void {
  if (!duckingEnabled) return;
  if (unduckTimer) clearTimeout(unduckTimer);
  unduckTimer = setTimeout(async () => {
    unduckTimer = null;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'mixWithOthers',
      });
    } catch (e) {
      console.warn('Failed to deactivate ducking:', e);
    }
  }, delayMs);
}

// ── Voice selection ──────────────────────────────────────────────────

/** Cached voice identifier for the current session. */
let selectedVoiceId: string | null = null;

/** Set the voice identifier used by all subsequent speak() calls. */
export function setVoiceIdentifier(id: string | null): void {
  selectedVoiceId = id;
}

/** Premium voice used for cues, or null for device text-to-speech. */
let premiumVoiceId: string | null = null;

export function setPremiumVoice(id: string | null): void {
  premiumVoiceId = id;
  if (id) loadVoiceIndex(id);
}

/**
 * Return available voices filtered to a language prefix (default "en").
 * Sorted so Enhanced/Premium voices appear first, then alphabetical.
 */
export async function getAvailableVoices(
  languagePrefix = 'en'
): Promise<Speech.Voice[]> {
  const all = await Speech.getAvailableVoicesAsync();
  const filtered = all
    .filter((v) => v.language.toLowerCase().startsWith(languagePrefix))
    .sort((a, b) => {
      const isHQ = (v: Speech.Voice) =>
        v.quality === Speech.VoiceQuality.Enhanced ||
        v.name.toLowerCase().includes('premium') ||
        v.name.toLowerCase().includes('enhanced');
      const qA = isHQ(a) ? 0 : 1;
      const qB = isHQ(b) ? 0 : 1;
      if (qA !== qB) return qA - qB;
      return a.name.localeCompare(b.name);
    });

  return filtered;
}

/** Configure the audio session for background playback (call once at app start). */
export async function configureAudio(): Promise<void> {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'mixWithOthers',
    });
    isAudioConfigured = true;
  } catch (e) {
    console.warn('Failed to configure audio:', e);
  }
}

/**
 * Generate a WAV beep in memory and return a data URI.
 * Avoids needing bundled sound files — creates simple sine-wave tones.
 */
function generateBeepWav(
  frequencyHz: number,
  durationMs: number,
  sampleRate = 22050
): string {
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);
  const dataSize = numSamples * 2; // 16-bit mono
  const fileSize = 44 + dataSize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, fileSize - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const fadeSamples = Math.min(numSamples * 0.05, 200);
    let envelope = 1;
    if (i < fadeSamples) envelope = i / fadeSamples;
    if (i > numSamples - fadeSamples)
      envelope = (numSamples - i) / fadeSamples;

    const sample = Math.sin(2 * Math.PI * frequencyHz * t) * 0.7 * envelope;
    const int16 = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    view.setInt16(44 + i * 2, int16, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:audio/wav;base64,' + btoa(binary);
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// Pre-built beep data URIs
const BEEP_HIGH = generateBeepWav(880, 200);
const BEEP_LOW = generateBeepWav(440, 200);
const BEEP_DOUBLE = generateBeepWav(1046, 150);
const BEEP_COUNTDOWN = generateBeepWav(660, 100);

// A short silent WAV that loops to keep the iOS audio session alive in
// the background. Without this, iOS suspends the JS thread between beeps
// and timers stop firing.
const SILENT_WAV = generateBeepWav(1, 1000); // 1 Hz at near-zero amplitude = silence

type CueType = 'intervalStart' | 'warning' | 'countdown' | 'workoutComplete';

const CUE_URIS: Record<CueType, string> = {
  intervalStart: BEEP_HIGH,
  warning: BEEP_LOW,
  countdown: BEEP_COUNTDOWN,
  workoutComplete: BEEP_DOUBLE,
};

let activePlayer: AudioPlayer | null = null;

// Silent looping player that keeps the audio session alive in the background.
let silentPlayer: AudioPlayer | null = null;

/** Start a silent audio loop to prevent iOS from suspending the app. */
export function startBackgroundLoop(): void {
  stopBackgroundLoop();
  try {
    silentPlayer = createAudioPlayer(
      { uri: SILENT_WAV },
      { keepAudioSessionActive: true }
    );
    silentPlayer.loop = true;
    silentPlayer.volume = 0;
    silentPlayer.play();
  } catch (e) {
    console.warn('Failed to start background audio loop:', e);
  }
}

/** Stop the silent background loop (call when workout ends). */
export function stopBackgroundLoop(): void {
  if (silentPlayer) {
    try {
      silentPlayer.release();
    } catch {}
    silentPlayer = null;
  }
}

/** Play a beep cue using expo-audio's createAudioPlayer. */
export async function playBeep(cue: CueType): Promise<void> {
  try {
    if (activePlayer) {
      try {
        activePlayer.release();
      } catch {}
    }

    activePlayer = createAudioPlayer(
      { uri: CUE_URIS[cue] },
      { keepAudioSessionActive: true }
    );
    activePlayer.play();
  } catch (e) {
    console.warn('Failed to play beep:', e);
  }
}

/** Play a double beep (for workout complete). */
export async function playDoubleBeep(): Promise<void> {
  await playBeep('workoutComplete');
  setTimeout(() => playBeep('workoutComplete'), 250);
}

// ── Voice announcements ──────────────────────────────────────────────

// Transition cues (interval start, warnings, completion) interrupt whatever
// is playing. Routine cues (progress, pace) replace other routine cues but
// wait behind a transition, and are dropped if they can't start promptly.

type CuePriority = 'transition' | 'routine';

const STALE_ROUTINE_MS = 3000;

interface Utterance {
  clips: Clip[];
  text: string;
  priority: CuePriority;
  requestedAt: number;
}

let activeUtterance: { priority: CuePriority; token: number } | null = null;
let pendingUtterance: Utterance | null = null;
let utteranceToken = 0;

function stopActiveUtterance(): void {
  activeUtterance = null;
  stopClips();
  Speech.stop();
}

function startUtterance(u: Utterance): void {
  stopActiveUtterance();
  if (u.priority === 'routine' && Date.now() - u.requestedAt > STALE_ROUTINE_MS) {
    scheduleUnduck();
    return;
  }

  const token = ++utteranceToken;
  activeUtterance = { priority: u.priority, token };
  const isCurrent = () => activeUtterance?.token === token;
  const done = () => {
    if (!isCurrent()) return;
    activeUtterance = null;
    const next = pendingUtterance;
    pendingUtterance = null;
    if (next) startUtterance(next);
    else scheduleUnduck();
  };

  // Activate ducking right before speaking — cancels any pending unduck
  // so rapid-fire announcements stay ducked without gaps.
  activateDucking();

  if (premiumVoiceId) {
    const sources = u.clips.map((clip) => getClipSource(premiumVoiceId!, clip));
    if (sources.length > 0 && sources.every((s) => s != null)) {
      playClipSequence(sources, done);
      return;
    }
  }

  try {
    const opts: Speech.SpeechOptions = {
      language: 'en-US',
      rate: 1.05,
      pitch: 1.0,
      onDone: done,
      onStopped: done,
      onError: (_error: Error) => done(),
    };
    // Only override the OS default voice when the user has explicitly chosen one
    if (selectedVoiceId) {
      opts.voice = selectedVoiceId;
    }
    // Give iOS a moment to finish tearing down the previous utterance
    // before starting a new one.
    setTimeout(() => {
      if (isCurrent()) Speech.speak(u.text, opts);
    }, 50);
  } catch (e) {
    console.warn('Failed to speak:', e);
    done();
  }
}

/** Queue an announcement made of premium voice clips, with device TTS text as the fallback. */
function say(clips: Clip[], text: string, priority: CuePriority): void {
  const u: Utterance = { clips, text, priority, requestedAt: Date.now() };
  if (priority === 'routine' && activeUtterance?.priority === 'transition') {
    pendingUtterance = u;
    return;
  }
  pendingUtterance = null;
  startUtterance(u);
}

/** Speak a single phrase, interrupting anything currently playing. */
export function speak(text: string): void {
  say([text], text, 'transition');
}

/** Speak a stitched cue phrase, interrupting anything currently playing. */
function speakPhrase(phrase: CuePhrase): void {
  say(phrase.clips, phrase.text, 'transition');
}

/** Speak the announcement for an interval transition, warning, or completion. */
function announceInterval(cue: CueType, ctx: CueContext = {}): void {
  if (cue === 'workoutComplete') {
    speak(WORKOUT_COMPLETE_TEXT);
    return;
  }
  const phrase =
    cue === 'intervalStart' ? intervalStartCue(ctx)
    : cue === 'warning' ? warningCue(ctx)
    : null;
  if (phrase) speakPhrase(phrase);
}

/**
 * Speak one or more routine cue phrases (progress, pace) as a single
 * utterance so they don't cancel each other.
 */
export function speakCuePhrases(phrases: CuePhrase[], mode: AudioCueMode): void {
  if (mode !== 'voice' && mode !== 'both') return;
  const used = phrases.filter((p) => p.text.trim());
  if (used.length === 0) return;
  const text = used.map((p) => p.text.trim().replace(/\.$/, '')).join('. ') + '.';
  say(used.flatMap((p) => p.clips), text, 'routine');
}

// ── Unified cue dispatcher ───────────────────────────────────────────

/**
 * Play the appropriate cue(s) based on user's audio preference.
 *
 * @param cue        - Which type of cue event occurred.
 * @param mode       - User's audio preference (beeps / voice / both / silent).
 * @param context    - Optional labels for voice announcements.
 */
export async function playCue(
  cue: CueType,
  mode: AudioCueMode,
  context?: CueContext
): Promise<void> {
  if (mode === 'silent') return;

  // Activate ducking before any audio plays
  await activateDucking();

  // Beeps
  if (mode === 'beeps' || mode === 'both') {
    if (cue === 'workoutComplete') {
      await playDoubleBeep();
    } else {
      await playBeep(cue);
    }
  }

  // Voice
  const willSpeak = mode === 'voice' || mode === 'both';
  if (willSpeak) {
    // Small delay when in 'both' mode so the beep finishes before speech
    const delay = mode === 'both' ? 300 : 0;
    if (delay > 0) {
      setTimeout(() => announceInterval(cue, context), delay);
    } else {
      announceInterval(cue, context);
    }
  }

  // In beeps-only mode, still speak a brief time label for warnings so users
  // can tell which countdown triggered (e.g. "30 seconds" vs "10 seconds").
  if (mode === 'beeps' && cue === 'warning' && context?.warningSeconds) {
    setTimeout(() => {
      speakPhrase(warningSecondsCue(context.warningSeconds!));
    }, 300);
  }

  // Schedule a fallback unduck.  If announceInterval or the beeps-only
  // warning above calls speak(), speak() will cancel this timer and
  // schedule its own tighter unduck via onDone/onStopped/onError.
  // The fallback covers pure-beep cues and edge-cases where no speech
  // fires (e.g. countdown).
  scheduleUnduck(willSpeak || (mode === 'beeps' && cue === 'warning') ? 2000 : 500);
}
