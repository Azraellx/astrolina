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
// shows. The overlays that are the map itself (VIEW_LOCK_PARKED_OVERLAYS) read
// as none meanwhile, masked rather than written, so an owner never touches the
// reader's overlay (2026-10-05). An owner that carries no overlay at all parks every one
// the same way (`overlaysReason`, 2026-10-12); one that works from the Local Space window
// keeps that window up beside it (`keepsLocalSpace`, 2026-10-12). The open core sets no
// lock; a downstream tool installs one for its lifetime and MUST clear it on teardown.

import { useSyncExternalStore } from 'react';

export interface ViewLock {
  /** One or two short sentences shown as the disabled View menu's hover tip —
   *  say why it's parked and how to get it back. */
  reason: string;
  /** Set by an owner that carries NO time overlay at all — a surface that shows the
   *  chart's own moment and nothing else. Every overlay then parks the way
   *  VIEW_LOCK_PARKED_OVERLAYS always do (the effective overlay reads as none, masked
   *  rather than written, so the reader's choice is back when the lock clears), the 'o'
   *  and 'n' keys stand down, and the Overlay menu disables with this as its tip: say
   *  why, and that the overlay comes back. Unset, only the overlays that are the map
   *  itself park. */
  overlaysReason?: string;
  /** Set by an owner that works FROM the Local Space window — one standing at the local-space
   *  origin, which the reader moves there (pin / birthplace / home). The window is then not
   *  parked under the lock, and is SHOWN for as long as the lock holds: derived, never written,
   *  so when the owner closes by any other route the window is back as the reader had it. Its ✕
   *  turns the Local Space view off (its own control, stored as always) AND closes the owner —
   *  the window is how the owner is used, and with the View menu parked and L standing down
   *  nothing under the lock could bring it back. Shown only where the window could be opened at
   *  all (Advanced on). Unset, the window parks like the others. */
  keepsLocalSpace?: {
    /** Close the owner. Called by the window's ✕, after the view is turned off. */
    onClose: () => void;
    /** The ✕'s hover-tip line meanwhile — say that the owner closes with the window. */
    closeHint: string;
    /** The window's title meanwhile, naming the owner beside it — say what the window is
     *  working with. Absent, the window's own. (2026-10-12) */
    title?: string;
  };
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
