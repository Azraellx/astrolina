// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useLayoutEffect, useReducer, useRef } from 'react';

// ── The map column, and how wide each dock is drawn beside it ─────────────────
// The two dock registries (lib/leftDock.ts, lib/rightDock.ts) flow from the docks to the chrome.
// This module is the flow back: how wide each dock may be DRAWN, given the window, the other
// docks and the chrome sharing the map column — so no dock is ever dragged so wide that the
// chrome beside it has to break up. That chrome's claim is one figure, which the top nav
// publishes: its compact form on ONE row, plus its gutter, the gap it keeps from the zoom
// control and the control itself (TopNav.tsx). Measured there, not restated here as a number,
// because the bar's width depends on the chart's initials and year, the language and the font —
// and a constant would be wrong the first time any of them moved. 0 = no claim (the phone
// layout, where the nav spans the screen and measures nothing).
//
// It lives in its own module, not in either registry, since 2026-10-08 (the right dock): a left
// dock's room depends on the right docks and a right dock's on the left, so in either registry
// the two would have had to import each other. Nothing here imports them.
//
// ── One allocator, not two caps ───────────────────────────────────────────────
// The first form of this module (the morning of 2026-10-08) capped each side by the OTHER
// side's drawn width: a left dock could take the window less the widest right dock and the
// column's need, a right dock the window less the widest left dock. Each cap is sound alone;
// together they are one equation in two unknowns. With both docks held by them above their
// minima, every pair of widths that fills the column satisfies both — a continuum of fixed
// points — and each dock, re-rendering, read where the OTHER had been a render earlier. So the
// two handed the same room back and forth until React gave up (#185, maximum update depth):
// the app blanked with Reports and the Prism dock open together at 1366, at 1440 with a stored
// Prism width of 420 or more, and at 1536 and 1600 (Chrome smoke, 2026-10-08).
//
// So no dock reads another's width any more. Each publishes its REQUEST — the reader's width,
// its own minimum and ceiling, and when it was last opened or dragged — and one pure function,
// allocateDocks, turns the window, the column's need and every request into every drawn width
// at once. No drawn width is ever an input, so nothing can feed back: the same requests give
// the same widths however many times they are allocated, and in whatever order the docks
// happen to render.
//
// The rule it applies: the dock opened or dragged MOST RECENTLY is served first, and may take
// everything the far side's docks can't do without — their minima. Each dock after it takes
// what the docks before it left, down to its own minimum and never under it. That keeps the
// narrowing one the reader can attribute: what takes the room is the dock they just opened or
// are dragging, in plain sight across the column, and the other gets its width back when that
// one closes or the window grows. Docks on the SAME side never squeeze each other: every left
// dock is anchored at the left edge (the right ones at the right), so they overlap, and a
// side's footprint is its widest dock — as `--es-width` and `--right-dock-w` already carry it.
// Alone, a dock is drawn exactly as before the right dock existed: its width held inside
// [minimum, the lower of its own ceiling and the window less the column's need].
//
// The dock's OWN MINIMUM outranks every cap: on a window too narrow for both (under ~963 px
// beside the Reports dock's 560), the dock keeps its minimum and the nav falls back to its
// two-row form (TopNav.css) — and where even two rows won't fit, the zoom control steps down
// under it. A dock squeezed under its minimum breaks the panel the reader is working in, its
// own toolbar and paper; a nav on two rows is a designed state with every control whole.
// (TopNav.tsx's step 1b keeps a different move out — a dock changing width because a panel that
// takes no room in the column opened — and that one stays out: the need it publishes is the
// column's own, whatever is docked either side.)
//
// The allocation is a STANDING constraint, so a dock derives its drawn width from it at render
// and never writes it back (CLAUDE.md rule 2): the reader's own width stays stored, and returns
// as soon as the window, the nav or the other dock leaves room for it. Only the reader's drag
// writes the stored value — and a dock squeezed by another is not being dragged, so it never
// writes.

/** What a dock asks of the column. Everything here is the dock's own — never a width some other
 *  dock was drawn at — which is what keeps the allocation free of feedback. */
export interface DockRequest {
  /** The edge it is anchored to. Docks on the same side overlap; opposite sides share. */
  side: 'left' | 'right';
  /** The reader's width (stored, or the one their drag has reached). */
  pref: number;
  /** Its own minimum, which outranks every cap. */
  min: number;
  /** Its own ceiling at this window width. */
  cap: number;
  /** When it was last opened or dragged ({@link nextDockStamp}); the highest is served first. */
  stamp: number;
}

/** Every dock's drawn width, from the window's width, the column's need and the docks'
 *  requests — pure, and the whole rule (see above). Served in descending `stamp` order (ties
 *  by id, so the answer never depends on the order the requests were listed in); each dock gets
 *  `round(max(min, min(pref, cap, room)))`, where `room` is the window less the need and less
 *  what the far side holds: the widths already given there, or the minimum of any dock there
 *  still to be served, whichever is wider. With one dock, room = `floor(vw − need)`. */
export function allocateDocks(
  vw: number,
  need: number,
  requests: Readonly<Record<string, DockRequest>>,
): Record<string, number> {
  const ids = Object.keys(requests).sort((a, b) => {
    const d = requests[b].stamp - requests[a].stamp;
    return d !== 0 ? d : a < b ? -1 : a > b ? 1 : 0;
  });
  const avail = vw - need;
  const held = { left: 0, right: 0 };
  const out: Record<string, number> = {};
  ids.forEach((id, i) => {
    const r = requests[id];
    const far = r.side === 'left' ? 'right' : 'left';
    let farClaim = held[far];
    for (let j = i + 1; j < ids.length; j++) {
      const later = requests[ids[j]];
      if (later.side === far && later.min > farClaim) farClaim = later.min;
    }
    const room = Math.max(0, Math.floor(avail - farClaim));
    const w = Math.round(Math.max(r.min, Math.min(r.pref, r.cap, room)));
    out[id] = w;
    if (w > held[r.side]) held[r.side] = w;
  });
  return out;
}

// ── The store ──────────────────────────────────────────────────────────────────
let columnNeed = 0;
const requests: Record<string, DockRequest> = {};
const listeners = new Set<() => void>();
let stampSeq = 0;

function emit(): void {
  for (const l of listeners) l();
}

/** A fresh recency stamp, higher than every one handed out before: a dock takes one when it
 *  opens (its state initialiser) and another when the reader's drag leaves the slop. */
export function nextDockStamp(): number {
  stampSeq += 1;
  return stampSeq;
}

/** Publish how much of the screen's width the chrome in the map column needs beside the docks
 *  (the top nav's one-row form plus the zoom corner; 0 = none). Listeners hear only real
 *  changes. */
export function publishMapColumnNeed(px: number): void {
  const v = Math.max(0, Math.ceil(px));
  if (v === columnNeed) return;
  columnNeed = v;
  emit();
}

function sameRequest(a: DockRequest | undefined, b: DockRequest): boolean {
  return (
    !!a &&
    a.side === b.side &&
    a.pref === b.pref &&
    a.min === b.min &&
    a.cap === b.cap &&
    a.stamp === b.stamp
  );
}

/** Publish (or update) dock `id`'s request. Listeners hear only a real change, so a dock
 *  re-rendering with the request it already made re-renders nothing else. */
export function publishDockRequest(id: string, req: DockRequest): void {
  if (sameRequest(requests[id], req)) return;
  requests[id] = { ...req };
  emit();
}

/** Withdraw dock `id`'s request (it closed). */
export function retireDockRequest(id: string): void {
  if (!(id in requests)) return;
  delete requests[id];
  emit();
}

/** The width dock `id` is drawn at if it asks for `req` now — the published requests, with this
 *  one in place of whatever `id` last published. Non-reactive: for a drag handler, which has to
 *  clamp the edge by the very rule the dock is drawn by. */
export function dockWidthFor(id: string, req: DockRequest): number {
  return allocateDocks(window.innerWidth, columnNeed, { ...requests, [id]: req })[id];
}

/** Hear every change an allocation reads: a request, the column's need, the window's width. */
export function subscribeDockColumn(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener('resize', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('resize', cb);
  };
}

/** The width dock `id` is drawn at, for the request it makes in this render: computed at render
 *  from this request and every other dock's published one, so the first frame the dock paints
 *  is already its allocated width. The request is published from a layout effect and withdrawn
 *  on unmount only — a separate effect, because a withdraw between two publishes reads to every
 *  other dock as this one closing for an instant (the top nav's flap, seam L78).
 *
 *  It re-renders whenever the allocation moves under it — another dock opening, closing or
 *  being dragged, the column's need — and whenever the window's width changes, since a dock's
 *  own minimum and ceiling are usually fractions of it and the request made at the last render
 *  may no longer be the one it would make (the expanded chart sidebar reads both straight off
 *  the window, with no resize listener of its own).
 *
 *  Subscribed from a LAYOUT effect, not through useSyncExternalStore, whose subscription lands
 *  in a passive effect — after the first paint. The need is published from the nav's own layout
 *  effect, so a dock mounted in the same commit as the nav (Reports reopening with the app) drew
 *  its first frame against no claim at all: measured 1123 → 1037 at 1440, 799 → 621 at 1024,
 *  one frame each. From the layout phase a change is either already there to read or arrives
 *  while this listens, and a state update made then renders before the browser paints. */
export function useDockWidth(id: string, req: DockRequest): number {
  const { side, pref, min, cap, stamp } = req;
  const vw = window.innerWidth;
  const width = dockWidthFor(id, req);
  // What this render drew, and from what, for the listener to compare against — kept current
  // before the publish below can call it.
  const drawn = useRef({ req, width, vw });
  useLayoutEffect(() => {
    drawn.current = { req: { side, pref, min, cap, stamp }, width, vw };
  });
  useLayoutEffect(() => {
    publishDockRequest(id, { side, pref, min, cap, stamp });
  }, [id, side, pref, min, cap, stamp]);
  useLayoutEffect(() => () => retireDockRequest(id), [id]);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useLayoutEffect(() => {
    const sync = () => {
      const d = drawn.current;
      if (window.innerWidth !== d.vw || dockWidthFor(id, d.req) !== d.width) rerender();
    };
    sync(); // a change published between this render and now
    return subscribeDockColumn(sync);
  }, [id]);
  return width;
}
