/**
 * Capture share cards as PNGs and upload them for link previews.
 *
 * react-native-view-shot is loaded lazily: builds without its native module
 * would crash on import, and those builds share text and links only.
 */

import type { RefObject } from 'react';
import { NativeModules, PixelRatio, TurboModuleRegistry, type View } from 'react-native';
import { File } from 'expo-file-system';
import { supabase } from '../analytics/supabaseClient';

type ViewShot = typeof import('react-native-view-shot');

export const SHARE_CARD_BUCKET = 'share-cards';
/** Card size in points; captured at 3× for a 1080 × 1350 image. */
export const SHARE_CARD_WIDTH = 360;
export const SHARE_CARD_HEIGHT = 450;
const OUTPUT_WIDTH_PX = 1080;
const UPLOAD_TIMEOUT_MS = 6000;

let viewShot: ViewShot | null | undefined;

function loadViewShot(): ViewShot | null {
  if (viewShot !== undefined) return viewShot;
  try {
    const native = TurboModuleRegistry.get('RNViewShot') ?? NativeModules.RNViewShot;
    viewShot = native ? (require('react-native-view-shot') as ViewShot) : null;
  } catch {
    viewShot = null;
  }
  return viewShot;
}

/** Whether this build can turn a card into an image. */
export function canCaptureShareCards(): boolean {
  return loadViewShot() != null;
}

/** Capture the card view as a temporary PNG file, or null when unsupported. */
export async function captureShareCard(ref: RefObject<View | null>): Promise<string | null> {
  const shot = loadViewShot();
  if (!shot || !ref.current) return null;
  try {
    const scale = OUTPUT_WIDTH_PX / SHARE_CARD_WIDTH / PixelRatio.get();
    return await shot.captureRef(ref, {
      format: 'png',
      result: 'tmpfile',
      width: SHARE_CARD_WIDTH * scale,
      height: SHARE_CARD_HEIGHT * scale,
    });
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/**
 * Upload a captured card as `<code>.png`. Returns the storage path, or null
 * when the upload fails or is slow; the link is shared without an image then.
 */
export async function uploadShareCard(code: string, uri: string): Promise<string | null> {
  const path = `${code}.png`;
  const upload = async () => {
    const bytes = await new File(uri).arrayBuffer();
    const { error } = await supabase.storage
      .from(SHARE_CARD_BUCKET)
      .upload(path, bytes, { contentType: 'image/png', upsert: false });
    return error ? null : path;
  };
  try {
    return await withTimeout(upload(), UPLOAD_TIMEOUT_MS);
  } catch {
    return null;
  }
}
