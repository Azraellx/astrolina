// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Pin adornment — a single-slot decoration for the placed map pin, plus a claimable
// click broadcast from the pin marker itself. Together they let a downstream feature
// treat the placed pin as an object of its own (badge it, re-title its tip, react to
// taps on it) without the core knowing what the decoration means. The open core sets
// no adornment and claims no clicks; a downstream module installs both for its
// lifetime and MUST clear the adornment on teardown.

import { useSyncExternalStore } from 'react';

/** Window CustomEvent fired on every click/tap on the placed pin marker (the marker
 *  element itself, not the map around it). Claimable, in the spirit of the map-click
 *  broadcast (./mapOverlays): a listener that treats the pin click as its own gesture
 *  calls `detail.claim()` SYNCHRONOUSLY, and the marker then stops the native click
 *  from falling through to the map's own click handling (e.g. a line card under the
 *  pin). Unclaimed clicks behave exactly as if this event didn't exist. */
export const PIN_CLICK_EVENT = 'astro:pin-click';

/** `detail` shape of the {@link PIN_CLICK_EVENT} CustomEvent. */
export interface PinClickDetail {
  lat: number;
  lng: number;
  /** True when the pin currently marks the chart's own birthplace (the "natal" pin
   *  variant), so a listener can leave that semantic pin alone. */
  natal: boolean;
  /** Claim the click as handled — must be called synchronously from the listener. */
  claim: () => void;
}

export interface PinAdornment {
  /** Resolved image URL drawn as a small round emblem in the pin head (the SVGs own
   *  circular framing — the slot does no clipping). Omit for a tip-only adornment. */
  emblemUrl?: string;
  /** Overrides the marker's default hover-tip text (the natal/custom place wording)
   *  while set — e.g. a name the downstream feature knows for this spot. */
  tip?: string;
}

let adornment: PinAdornment | null = null;
const listeners = new Set<() => void>();

/** Install (or, with null, clear) the pin adornment. Single slot — last call wins. */
export function setPinAdornment(a: PinAdornment | null): void {
  adornment = a;
  for (const fn of listeners) fn();
}

/** Non-reactive read (event handlers). */
export function getPinAdornment(): PinAdornment | null {
  return adornment;
}

export function subscribePinAdornment(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Reactive read for render-time use. */
export function usePinAdornment(): PinAdornment | null {
  return useSyncExternalStore(subscribePinAdornment, getPinAdornment);
}

// ── One-shot celebration channel ────────────────────────────────────────────
// A downstream feature that just completed an action ON the pin (e.g. bookmarking
// the spot it marks) can ask the pin's surfaces to flourish briefly: the marker
// replays its placement pulse and pops its emblem in, and the top bar's status
// pill pops with a glint. Purely visual, fire-and-forget; the open core never
// fires it. Consumers diff the counter (never celebrate the mount value).

let celebrations = 0;
const celebrationListeners = new Set<() => void>();

/** Fire one celebration on every pin surface. */
export function celebratePin(): void {
  celebrations++;
  for (const fn of celebrationListeners) fn();
}

/** Monotonic count of celebrations fired this session (diff it; don't replay it). */
export function getPinCelebrations(): number {
  return celebrations;
}

export function subscribePinCelebration(fn: () => void): () => void {
  celebrationListeners.add(fn);
  return () => void celebrationListeners.delete(fn);
}

/** Reactive read of the celebration counter. */
export function usePinCelebrations(): number {
  return useSyncExternalStore(subscribePinCelebration, getPinCelebrations);
}
