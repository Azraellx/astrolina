// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// View lock — a single-slot signal that an add-on surface currently OWNS the
// viewport (e.g. a scene drawn in the map's place). While set, the host parks
// the View-menu windows: the menu's trigger disables (showing the provider's
// reason as its tip), the plain-letter view hotkeys and open windows stand
// down, and the Settings sidebar hides its map-surface-only rows — Settings
// itself stays available, so users can still tune what the owning surface
// shows. The open core sets no lock; a downstream tool installs one for its
// lifetime and MUST clear it on teardown.

import { useSyncExternalStore } from 'react';

export interface ViewLock {
  /** One or two short sentences shown as the disabled View menu's hover tip —
   *  say why it's parked and how to get it back. */
  reason: string;
}

let lock: ViewLock | null = null;
const listeners = new Set<() => void>();

/** Install (or, with null, clear) the view lock. Single slot — last call wins. */
export function setViewLock(l: ViewLock | null): void {
  lock = l;
  for (const fn of listeners) fn();
}

/** Non-reactive read (event handlers). */
export function getViewLock(): ViewLock | null {
  return lock;
}

export function subscribeViewLock(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Reactive read for render-time gating. */
export function useViewLock(): ViewLock | null {
  return useSyncExternalStore(subscribeViewLock, getViewLock);
}
