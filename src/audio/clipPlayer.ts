/**
 * Plays a sequence of voice clips (bundled assets or downloaded files)
 * back to back using an expo-audio playlist (gapless between tracks).
 */

import { createAudioPlaylist, type AudioPlaylist, type AudioSource } from 'expo-audio';

/** Upper bound for one cue so a missed finish event can't leave the queue stuck. */
const MAX_SEQUENCE_MS = 30000;

let playlist: AudioPlaylist | null = null;
let subscription: { remove: () => void } | null = null;
let safetyTimer: ReturnType<typeof setTimeout> | null = null;

/** Stop and release the current sequence without firing its onDone. */
export function stopClips(): void {
  if (safetyTimer) {
    clearTimeout(safetyTimer);
    safetyTimer = null;
  }
  subscription?.remove();
  subscription = null;
  if (playlist) {
    try {
      playlist.pause();
      playlist.destroy();
    } catch {}
    playlist = null;
  }
}

/** Play the clips in order and call onDone once the last one finishes. */
export function playClipSequence(sources: AudioSource[], onDone: () => void): void {
  stopClips();

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    stopClips();
    onDone();
  };

  try {
    const pl = createAudioPlaylist({ sources, updateInterval: 100 });
    playlist = pl;
    subscription = pl.addListener('playlistStatusUpdate', (status) => {
      const onLastTrack = status.currentIndex >= status.trackCount - 1;
      const reachedEnd =
        !status.playing && status.duration > 0 && status.currentTime >= status.duration - 0.1;
      if (onLastTrack && (status.didJustFinish || reachedEnd)) {
        finish();
      }
    });
    safetyTimer = setTimeout(finish, MAX_SEQUENCE_MS);
    pl.play();
  } catch (e) {
    console.warn('Failed to play voice clips:', e);
    finish();
  }
}
