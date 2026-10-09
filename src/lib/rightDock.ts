// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Right-dock width registry — the mirror of lib/leftDock.ts, added 2026-10-08 for the first
// panel docked to the right edge (a theme editor, which takes that strip of the screen as its
// own column while it is open). Read leftDock.ts for the reasoning; only what differs is here.
//
// `--right-dock-w` on <html> is the widest right dock of ANY kind and `--right-dock-reserved`
// the widest RESERVING one, both `0px` with nothing docked — and every rule that reads them
// falls back to `0px` too, so with no right dock every calc() resolves to exactly what it did
// before the registry existed. What rides them: the centred chrome (the top nav, the bottom
// overlay bars, the Zoom-out pill), which subtracts a quarter of each to sit on the map
// column's true centre — `50% + es-width/4 + es-reserved/4 − right-dock-w/4 −
// right-dock-reserved/4`; the right-anchored chrome (the Settings window, the active-systems
// chip, the zone legend, the edge glow, the sky band), which steps in by it; the bars'
// max-widths; and the modal backdrop, whose panel centres in what is left.
//
// A reserving dock shrinks the map frame from the right (`Map`'s `rightInset` prop, fed by
// {@link getReservedRightInset} through the host, for the race leftDock.ts describes), so the
// zoom control, the attribution and the edge badges ride the frame in with it.
//
// Two differences from the left registry, both deliberate. Every listener here hears only a
// REAL change — a publish of the width a dock already had notifies nobody and rewrites no var —
// because the one publisher drags its width a pixel at a time, and each notice reaches the top
// nav's layout pass and every floating window's re-clamp. And the vars are written only when
// they change, for the same reason (the Pro nav watcher observes <html>'s style attribute).
const widths = new Map<string, number>();
const reserved = new Map<string, number>();
const reservedListeners = new Set<() => void>();
const chromeListeners = new Set<() => void>();
// What the vars and listeners last carried, so a no-op publish stays a no-op.
let lastWidth = 0;
let lastReserved = 0;

function maxOf(m: Map<string, number>): number {
  let max = 0;
  for (const w of m.values()) if (w > max) max = w;
  return max;
}

// After any change to the two maps: write what moved, then tell whoever listens to it. The
// reserved inset goes first, so a host re-rendering the map frame from it and the chrome
// measuring against the vars both see the same settled registry.
function settle(): void {
  const w = maxOf(widths);
  const r = maxOf(reserved);
  const root = document.documentElement.style;
  const widthMoved = w !== lastWidth;
  const reservedMoved = r !== lastReserved;
  if (widthMoved) root.setProperty('--right-dock-w', `${w}px`);
  if (reservedMoved) root.setProperty('--right-dock-reserved', `${r}px`);
  lastWidth = w;
  lastReserved = r;
  if (reservedMoved) for (const l of reservedListeners) l();
  if (widthMoved || reservedMoved) for (const l of chromeListeners) l();
}

/** Publish (or update) a right-docked panel's width. Call from an effect, and retire it from a
 *  SEPARATE unmount-only effect (a retire between two publishes reads as the dock closing for an
 *  instant — the top nav's flap, seam L78). Pass `{ reserve: true }` to also shrink the map frame
 *  by this width (its own column) rather than overlay it; omit to overlay (chrome shift only). */
export function publishRightDock(id: string, px: number, opts?: { reserve?: boolean }): void {
  const v = Math.max(0, px);
  widths.set(id, v);
  if (opts?.reserve) reserved.set(id, v);
  else reserved.delete(id);
  settle();
}

/** Retire a right-docked panel (its unmount cleanup). */
export function retireRightDock(id: string): void {
  const had = widths.delete(id);
  const hadReserve = reserved.delete(id);
  if (had || hadReserve) settle();
}

/** The widest right dock of ANY kind, reserving or overlaying (0 if none) — the value
 *  `--right-dock-w` carries: how much of the right edge something docked covers. */
export function getRightDockWidth(): number {
  return lastWidth;
}

/** Called when {@link getRightDockWidth} or {@link getReservedRightInset} moves, once both vars
 *  are written — for chrome that has to MEASURE against the docks (the top nav). Never for a
 *  publish that changed nothing. Returns an unsubscribe fn. */
export function subscribeRightDock(cb: () => void): () => void {
  chromeListeners.add(cb);
  return () => void chromeListeners.delete(cb);
}

/** The widest RESERVED right width (0 if none) — the inset a host feeds the map as
 *  `rightInset`, so the frame shrinks out from under the reserving panel. Pairs with
 *  {@link subscribeReservedRightInset}. */
export function getReservedRightInset(): number {
  return lastReserved;
}

/** Subscribe to changes of {@link getReservedRightInset} (useSyncExternalStore-shaped): fires
 *  only when the value moves. Returns an unsubscribe fn. */
export function subscribeReservedRightInset(cb: () => void): () => void {
  reservedListeners.add(cb);
  return () => void reservedListeners.delete(cb);
}

// How wide a right dock is DRAWN is not this registry's business: a right dock publishes its
// request to lib/dockColumn.ts and reads its width back with `useDockWidth`, beside the left
// docks, the column the top nav needs between them, and the window (dockColumn says why one
// allocator serves both sides). This registry carries only what the docks then draw.
