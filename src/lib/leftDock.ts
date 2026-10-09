// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

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
// The column's need moved to lib/dockColumn.ts on 2026-10-08, when a right dock arrived
// (lib/rightDock.ts), and so did the rule for how wide a dock is drawn: one allocator for both
// sides, since a left dock's room now depends on the right docks too (dockColumn says why it
// is one allocator and not two caps). A dock publishes its request there and reads its width
// back with `useDockWidth`; this registry still carries only what it draws. The need is
// re-exported under its old name, so the top nav imports it from here as it always did.
export { publishMapColumnNeed } from './dockColumn';
