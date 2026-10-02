// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useLayoutEffect, useState } from 'react';

// Left-dock width registry. `--es-width` on <html> tells the whole chrome how
// much of the LEFT edge is covered by a docked panel — the map edge-glow insets
// by it, flyTo centering and the floating HUDs shift by it, and the top bars
// re-center around it. Historically the expanded chart sidebar wrote the var
// directly; any second docked panel would then collide (last writer wins, and
// either panel's unmount reset the var to 0 under the other). This registry
// makes publishing safe for ANY number of docked panels: each publishes its own
// width under a stable id, and the var carries the MAX (every publisher is
// left-anchored, so content must clear the widest). Empty registry → 0px.
//
// A publisher may additionally RESERVE its width (`{ reserve: true }`): rather
// than overlaying the map, it asks the map canvas itself to shrink out from
// under it — its own dedicated column, the left-edge counterpart of the reserved
// bottom band (lib/bottomDock.ts). Like that band, the map takes the reserved
// inset as a PROP, not by reading a var (an inline style commits before layout
// effects, so the map's resize always measures the final size; a var write from
// a sibling's effect can land after the map already resized). So the reserved
// max is exposed through a subscribe hook a host reads into React state and
// passes down. Panels that only shift the chrome (the default, no reserve)
// leave the map full-width and simply overlay it.
const widths = new Map<string, number>();
const reserved = new Map<string, number>();
const reservedListeners = new Set<() => void>();
const chromeListeners = new Set<() => void>();

// Two vars: `--es-width` (the widest dock of ANY kind — what the chrome shifts
// by) and `--es-reserved` (the widest RESERVING dock — the map column really
// starts there, so centred chrome adds a second quarter-shift to sit on the
// TRUE remaining centre; see the `50% + --es-width/4 + --es-reserved/4` rules).
function applyChrome(): void {
  document.documentElement.style.setProperty('--es-width', `${getLeftDockWidth()}px`);
  document.documentElement.style.setProperty('--es-reserved', `${reservedMax()}px`);
  for (const l of chromeListeners) l();
}

function reservedMax(): number {
  let max = 0;
  for (const w of reserved.values()) if (w > max) max = w;
  return max;
}

function emitReserved(): void {
  for (const l of reservedListeners) l();
}

/** Publish (or update) a docked panel's width. Call from a layout effect. Pass
 *  `{ reserve: true }` to also shrink the map canvas by this width (its own
 *  column) rather than overlay it; omit to overlay (chrome shift only). */
export function publishLeftDock(id: string, px: number, opts?: { reserve?: boolean }): void {
  widths.set(id, px);
  const wasReserved = reserved.has(id);
  if (opts?.reserve) {
    if (reserved.get(id) !== px) {
      reserved.set(id, px);
      emitReserved();
    }
  } else if (wasReserved) {
    reserved.delete(id);
    emitReserved();
  }
  // After the reserved map settles — both vars publish from one place.
  applyChrome();
}

/** Retire a docked panel (its unmount cleanup). Recomputes both maxes. */
export function retireLeftDock(id: string): void {
  widths.delete(id);
  const wasReserved = reserved.delete(id);
  applyChrome();
  if (wasReserved) emitReserved();
}

/** The widest RESERVED width (0 if none) — the inset a host feeds the map so it
 *  shrinks out from under the reserving panel. Pairs with {@link subscribeReservedLeftInset}. */
export function getReservedLeftInset(): number {
  return reservedMax();
}

/** Subscribe to reserved-width changes (useSyncExternalStore-shaped); returns an unsubscribe fn. */
export function subscribeReservedLeftInset(cb: () => void): () => void {
  reservedListeners.add(cb);
  return () => void reservedListeners.delete(cb);
}

/** The widest dock of ANY kind, reserving or overlaying (0 if none) — the value
 *  `--es-width` carries: how much of the left edge something docked covers. */
export function getLeftDockWidth(): number {
  let max = 0;
  for (const w of widths.values()) if (w > max) max = w;
  return max;
}

/** Called after every publish/retire, once both vars are written — for chrome
 *  that has to MEASURE against the docks rather than just ride the vars in CSS
 *  (the top nav decides its compact layout from the column they leave). Fires
 *  for an overlaying dock too, which {@link subscribeReservedLeftInset} does not.
 *  Returns an unsubscribe fn. */
export function subscribeLeftDock(cb: () => void): () => void {
  chromeListeners.add(cb);
  return () => void chromeListeners.delete(cb);
}

// ── The other direction: how wide a dock may grow ─────────────────────────────
// Everything above flows from the docks to the chrome. This is the one figure that flows back:
// how much of the screen, measured in from its RIGHT edge, the chrome sharing the map column
// needs to keep — so no dock is ever dragged so wide that the chrome beside it has to break up.
// The top nav publishes it: its compact form on ONE row, plus its gutter, the gap it keeps from
// the zoom control and the control itself (TopNav.tsx). Measured there, not restated here as a
// number, because the bar's width depends on the chart's initials and year, the language and the
// font — and a constant would be wrong the first time any of them moved. 0 = no claim (the phone
// layout, where the nav spans the screen and measures nothing).
//
// Each dock applies it as a cap on top of its own, and the dock's OWN MINIMUM outranks it: on a
// window too narrow for both (under ~963 px beside the Reports dock's 560), the dock keeps its
// minimum and the nav falls back to its two-row form (TopNav.css) — and where even two rows
// won't fit, the zoom control steps down under it. A dock squeezed under its minimum breaks the
// panel the reader is working in, its own toolbar and paper; a nav on two rows is a designed
// state with every control whole.
//
// The cap is a STANDING constraint, so a dock derives its width from it at render and never
// writes it back (CLAUDE.md rule 2): the reader's own width stays stored, and returns as soon
// as the window or the nav leaves room for it. Only the reader's drag writes the stored value.
let columnNeed = 0;
const needListeners = new Set<() => void>();

/** Publish how much of the screen's width, in from its right edge, the chrome in the map column
 *  needs beside the widest dock (the top nav's one-row form plus the zoom corner; 0 = none).
 *  Listeners hear only real changes. */
export function publishMapColumnNeed(px: number): void {
  const v = Math.max(0, Math.ceil(px));
  if (v === columnNeed) return;
  columnNeed = v;
  for (const l of needListeners) l();
}

/** The widest a left dock may be in this window without crowding the chrome beside it: the
 *  window less {@link publishMapColumnNeed}'s figure. A dock still floors it at its own minimum
 *  (see above). The full window when nothing has claimed room. */
export function getLeftDockMax(): number {
  return Math.max(0, Math.floor(window.innerWidth - columnNeed));
}

function subscribeLeftDockMax(cb: () => void): () => void {
  needListeners.add(cb);
  window.addEventListener('resize', cb);
  return () => {
    needListeners.delete(cb);
    window.removeEventListener('resize', cb);
  };
}

/** Reactive {@link getLeftDockMax}: re-renders on a window resize and when the claim changes.
 *
 *  Subscribed from a LAYOUT effect, not through useSyncExternalStore, whose subscription lands
 *  in a passive effect — after the first paint. The claim is published from the nav's own layout
 *  effect, so a dock mounted in the same commit as the nav (Reports reopening with the app) drew
 *  its first frame against no claim at all: measured 1123 → 1037 at 1440, 799 → 621 at 1024, one
 *  frame each. From the layout phase the claim is either already there to read or arrives while
 *  this listens, and a state update made then renders before the browser paints. */
export function useLeftDockMax(): number {
  const [max, setMax] = useState(getLeftDockMax);
  useLayoutEffect(() => {
    const sync = () => setMax(getLeftDockMax());
    sync(); // a claim published between this render and now
    return subscribeLeftDockMax(sync);
  }, []);
  return max;
}
