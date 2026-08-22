// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Marker adornment — a single-slot decoration for the placed map pin, plus a claimable
// click broadcast from the pin marker itself. Together they let a downstream feature
// treat the placed pin as an object of its own (badge it, re-title its tip, react to
// taps on it) without the core knowing what the decoration means. The open core sets
// no adornment and claims no clicks; a downstream module installs both for its
// lifetime and MUST clear the adornment on teardown.
//
// The standing HOME marker has its own slot further down, decoration only. Two slots in
// one file rather than two near-identical modules, so their sameness stays visible: they
// carry the same shape for the same reason, and the head geometry they both write into
// is one seat that a dot, a house glyph or an emblem takes in turn.

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

// ── Home marker adornment ───────────────────────────────────────────────────
// The same single-slot decoration for the STANDING home marker. Decoration only:
// no click channel (home's own click already places the pin there and flies in,
// which is a different and still-wanted gesture) and no celebration counter
// (nothing lands on the house).
//
// It exists because the core's own rule — one teardrop per coordinate — needs a
// way to hold for markers the core doesn't own. The placed pin already yields to
// home when it stands on the spot (App's `homeMark` is withheld there), but a
// downstream marker layer sitting on the same coordinate had no way to merge, and
// two teardrops stacked exactly is precisely what that rule exists to prevent.
// Setting this lets the house carry the other marker's identity ADDITIVELY — the
// house keeps the head, the visitor gets a corner badge and the tip's title.
//
// That "additively" is the whole lesson of the first version, which gave the head
// to the visitor's emblem and stood the house down. One teardrop, correctly — but
// the surviving marker no longer looked like home, so merging two markers read as
// losing one. A merge has to leave the survivor recognisable, or it isn't a merge.

export interface HomeAdornment {
  /** Resolved image URL drawn as a small round badge on the home marker's upper right,
   *  ALONGSIDE the house — never in place of it. The house is the one thing that says
   *  this marker is home, and a badge announcing what else is here must not cost it
   *  that. (It did, briefly: the emblem took the head and the house stood down, which
   *  read as the home marker having vanished.) The SVGs own their circular framing —
   *  the slot does no clipping. Omit for a tip-only adornment. */
  badgeUrl?: string;
  /** Overrides the marker's default hover-tip TITLE ("Home") while set. The place
   *  label stays on the hint line either way, so the spot is still named. */
  tip?: string;
}

let homeAdornment: HomeAdornment | null = null;
const homeListeners = new Set<() => void>();

/** Install (or, with null, clear) the home adornment. Single slot — last call wins. */
export function setHomeAdornment(a: HomeAdornment | null): void {
  homeAdornment = a;
  for (const fn of homeListeners) fn();
}

/** Non-reactive read (event handlers). */
export function getHomeAdornment(): HomeAdornment | null {
  return homeAdornment;
}

export function subscribeHomeAdornment(fn: () => void): () => void {
  homeListeners.add(fn);
  return () => void homeListeners.delete(fn);
}

/** Reactive read for render-time use. */
export function useHomeAdornment(): HomeAdornment | null {
  return useSyncExternalStore(subscribeHomeAdornment, getHomeAdornment);
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
