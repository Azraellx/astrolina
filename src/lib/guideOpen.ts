// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Guide open — whether a guide card (MissionGuide: the onboarding pop-up, or the View ▸ Guides
// reference) is on screen right now. Only the card itself writes it, holding it for exactly as
// long as it is mounted, so it reports what the reader can see rather than what App intends:
// the reference parked under a view lock is not open, and an onboarding set that surfaces
// while the reference is up is not open either. The open core reads nothing from it; it is
// there so an add-on that teaches by drawing something over the map can wait its turn rather
// than talk over a guide that is already teaching.
//
// A count, not a flag: development StrictMode mounts the card twice, and if two cards are
// ever up at once, the first to close must not report the second as gone.

import { useSyncExternalStore } from 'react';

let open = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

/** Mark one guide card open; returns its release (idempotent). MissionGuide calls it on
 *  mount and releases on unmount. */
export function holdGuideOpen(): () => void {
  open += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    open -= 1;
    emit();
  };
}

/** Non-reactive read (event handlers). */
export function isGuideOpen(): boolean {
  return open > 0;
}

export function subscribeGuideOpen(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Reactive read for render-time gating. */
export function useGuideOpen(): boolean {
  return useSyncExternalStore(subscribeGuideOpen, isGuideOpen);
}
