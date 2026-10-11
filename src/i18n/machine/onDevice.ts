// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// A build's own text through the on-device tier (2026-10-10): longer text that is not in the
// catalog — passages a build writes and renders itself — translated on the reader's device, into
// the device language on screen, with everything the catalog's strings get: the same masking
// (glyphs, do-not-translate terms, placeholders, web addresses), the same checks (every sentinel
// back exactly once, no invented markup, the length bounds), the same cache (keyed by the
// caller's namespaced key, hashed with the English and the engine's version), and the same ONE
// translator the catalog sweep is using. The work is engine.ts's; see translateFree there for the
// order it is done in.
//
// The one file under machine/ that is NOT part of the lazy chunk: index.ts exports it, so it stays
// small and reaches the engine only by a dynamic import — and only once a device language is on
// screen, by which time the engine is already loaded (it is what put the language there). A
// reader who never chooses a device language fetches nothing more because a build calls this.
//
// Refused — an empty answer, the translator untouched, the engine not fetched — while the
// languages are held for release (languageHold.ts), and whenever the language on screen is not a
// device translation: a shipped language has translators of its own, and English needs none.
import { LANGUAGES_HELD } from '../languageHold';
import { getI18n } from '../runtime';

/** One passage for the device to translate. `cacheKey` is the caller's, namespaced by it
 *  (`<ns>:<key>`) so two callers can't collide; `text` is the English. */
export interface OnDeviceItem {
  cacheKey: string;
  text: string;
}

export interface OnDeviceOptions {
  /** Aborting stops the work between passages: nothing more goes to the translator for this
   *  call, and it resolves at once with what was done before. */
  signal?: AbortSignal;
  /** Called as passages are settled — found, translated, or failed — with how many of the
   *  call's distinct keys are settled so far. */
  onProgress?: (done: number, total: number) => void;
  /** 'now' (the default): ahead of the catalog's background sweep, behind only what the catalog
   *  has on screen — for text the reader is looking at. 'background': after the sweep. */
  priority?: 'now' | 'background';
}

/** True while the language on screen is a device translation and the languages are not held.
 *  By then the device has a translator for it, or a cache serving it (otherwise the choice would
 *  be held, and the screen in another language). That says the device CAN be asked, not what it
 *  will give: a cache-only language answers only what was translated before, so a caller decides
 *  what to show from what translateOnDevice returns — an empty map is a possible answer. */
export function canTranslateOnDevice(): boolean {
  if (LANGUAGES_HELD) return false;
  return getI18n().locale.startsWith('mt:');
}

/**
 * Translates a build's own text on this device, into the device language on screen. Resolves to
 * the translations by `cacheKey`; a passage that couldn't be done validly — the translator's
 * answer failed the checks, it was over the translator's limit even split at sentence ends, the
 * translator threw, the work was aborted or the language left first — is simply absent, and the
 * caller shows its English. Never rejects.
 */
export async function translateOnDevice(
  items: readonly OnDeviceItem[],
  opts: OnDeviceOptions = {},
): Promise<Map<string, string>> {
  if (!items.length || !canTranslateOnDevice() || opts.signal?.aborted) return new Map();
  try {
    const m = await import('./engine');
    // Undefined when a host's vite:preloadError handler swallowed a failed fetch.
    if (!m?.translateFree) return new Map();
    return await m.translateFree(items, opts);
  } catch (err) {
    console.warn('[i18n] device translation of a build’s text could not run', err);
    return new Map();
  }
}
