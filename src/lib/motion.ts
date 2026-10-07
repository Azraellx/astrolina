// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Reduced motion as ONE question (2026-10-06): the device's own setting OR a palette's
// "Motion: Reduced" (data-fx-motion='reduced', written by lib/appearance). CSS answers it with
// its own rules; this is for the motion JavaScript drives — canvas loops and timed pulses
// (the galaxy view, the saved-pin markers, the plan icons) — which no stylesheet can reach.
import { useSyncExternalStore } from 'react';
import { APPEARANCE_EVENT } from './appearance';

const QUERY = '(prefers-reduced-motion: reduce)';

function media(): MediaQueryList | null {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
  } catch {
    return null;
  }
}

/** Whether motion should be reduced right now. Never throws. */
export function prefersReducedMotion(): boolean {
  if (media()?.matches) return true;
  try {
    return typeof document !== 'undefined' && document.documentElement.getAttribute('data-fx-motion') === 'reduced';
  } catch {
    return false;
  }
}

/** Call `cb` whenever the answer may have changed: the device setting, or a palette change. */
export function subscribeReducedMotion(cb: () => void): () => void {
  const mq = media();
  mq?.addEventListener?.('change', cb);
  if (typeof window !== 'undefined') window.addEventListener(APPEARANCE_EVENT, cb);
  return () => {
    mq?.removeEventListener?.('change', cb);
    if (typeof window !== 'undefined') window.removeEventListener(APPEARANCE_EVENT, cb);
  };
}

/** prefersReducedMotion() as React state. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
}
