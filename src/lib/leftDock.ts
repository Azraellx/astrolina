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

function applyChrome(): void {
  let max = 0;
  for (const w of widths.values()) if (w > max) max = w;
  document.documentElement.style.setProperty('--es-width', `${max}px`);
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
  applyChrome();
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
}

/** Retire a docked panel (its unmount cleanup). Recomputes both maxes. */
export function retireLeftDock(id: string): void {
  widths.delete(id);
  applyChrome();
  if (reserved.delete(id)) emitReserved();
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
