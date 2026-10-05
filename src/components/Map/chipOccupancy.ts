// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Where the map's line labels may not go — ONE record, shared by every kind of label.
//
// Each kind of label has its own geometry and keeps it: an edge chip slides along its own line,
// a paran chip along its latitude row, a Local Space chip along its line out from the origin (its
// "ray", though as drawn it is a great circle and bends). What they did not share
// until 2026-10-01 was any knowledge of each other, so each kind avoided the panels on its own
// terms (or not at all) and none avoided the others: close meridians stacked their chips at the
// top and bottom edges, transit chips funnelled onto one row above the Transits bar, and a paran
// chip could sit on an edge chip (#33, #23, #28). Salvatore's call, 2026-10-01: keep each kind's
// own placement, and have all of them consult this — the panels, the tapped markers, and every
// label already placed this pass — in one fixed order of importance.
//
// It is pure and cheap by construction: no DOM in here. The caller hands it the panel and
// marker rects it already reads once a pass (Map.tsx's readHudRects cache and markerRects),
// and the chips' sizes it already knows; placed chips go in a coarse spatial grid, so testing a
// spot costs the handful of chips near it rather than all of them.

// A rectangle in map-container pixels: a HUD panel, a tapped marker, or a placed chip.
export interface AvoidRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ChipPt {
  x: number;
  y: number;
}

// The order labels are placed in, which is also the order they stack in where they still meet:
// a pass places every rank before the next, so a chip only ever steps aside for a more important
// one, and where the slide runs out the more important one draws on top. Fixed and stable so a
// settle can't reshuffle who yields to whom (Salvatore, 2026-10-01):
//
//  - the chart's own bodies first — what the map is of (a promoted overlay standing in for the
//    chart counts as the chart: it IS what the map is drawing);
//  - then an overlay's (Tr / Sp / …), the reading asked for on top of it;
//  - then Local Space, which only has chips while its window is open, i.e. while the reader is
//    working with it right now;
//  - then the lunar nodes, natal or overlay — points, not bodies;
//  - then parans, which are also reachable by hover and the tap card;
//  - then the aspect / midpoint lines, which come by the hundred;
//  - then the catalog asteroids;
//  - and the geodetic grid's sign glyphs last of all (2026-10-02): a reference the map is read
//    against, not a reading, so they take only the room every label above has left, and a
//    glyph with no clear spot is simply not drawn (geoGridLabels.ts).
export const CHIP_RANK = {
  natal: 0,
  overlay: 1,
  localSpace: 2,
  node: 3,
  paran: 4,
  aspect: 5,
  catalog: 6,
  grid: 7,
} as const;
// One more than the last rank. Raising it moves every chip's stacking value up by RANK_SPAN,
// uniformly — harmless, since they only ever compare inside the label layer's own context.
const RANK_COUNT = 8;
// Room for this many chips in one rank before stacking values would run into the next rank's.
const RANK_SPAN = 1000;

// A chip's stacking value (its inline z-index inside the label layer, which is its own stacking
// context, so these never reach anything outside it): every chip of a rank above every chip of
// the next, and inside a rank the one placed first on top — it is the one that held its spot.
// `ordinal` 0 is the top of the rank, which is also what a label placed WITHOUT the occupancy
// takes, so it still stacks in its rank's place: Local Space's in the LS-only transparent still,
// which has no other labels to make room for, and its "Degrees" labels (LS_CHIP_Z in Map.tsx).
// Every other kind places through it since 2026-10-01.
export function chipStack(rank: number, ordinal = 0): number {
  return (RANK_COUNT - rank) * RANK_SPAN - 1 - Math.min(ordinal, RANK_SPAN - 1);
}

// Clearance a chip keeps from a panel or a tapped marker: the 6 px the edge dodge always kept, and
// enough for the pin's hover lift (Map.css: up 2px and scaled 1.08 from near the tip, which raises
// its head ~5px). The Local Space labels kept the same figure from a marker on their own
// (LS_MARKER_GAP in Map.tsx) until they placed through here, 2026-10-01.
export const OBSTACLE_GAP = 6;
// Clear gap kept between two chips: enough that two pills read as two, not one long one.
export const CHIP_GAP = 3;
// How far a chip may slide past its panel-clear spot to get off other chips before it gives up
// and overlaps. About five chip heights: a cluster of close meridians fans out into a short
// staircase along their lines, while a crowd too dense for that (aspect lines by the hundred)
// overlaps near where it belongs rather than wandering down its line to somewhere it doesn't.
export const CHIP_SLIDE_CAP = 96;
// Grid cell (px). About a chip's width, so a chip box touches at most a 3×2 block of cells.
const CELL = 48;
// Sample spacing along a path — the edge dodge's 8 px since it was written. Halved where a chip
// looks for room among the others, and a spot found there is tightened by bisection toward its
// neighbour (REFINE rounds, to ½ px), so a stacked chip lands just clear of the one below. And
// FINE_STEP where the 8 px walk found no clear spot at all, but only between two samples kept out
// for different reasons — the one place a clear stretch shorter than 8 px can hide.
const WALK_STEP = 8;
const FINE_STEP = 2;
const REFINE = 3;

export class ChipOccupancy {
  readonly w: number;
  readonly h: number;
  /** The panels and tapped markers, kept clear by OBSTACLE_GAP. */
  readonly obstacles: readonly AvoidRect[];
  private readonly cols: number;
  private readonly rows: number;
  private readonly cells: (number[] | undefined)[];
  // Placed chips, flat: left, top, right, bottom per chip.
  private readonly boxes: number[] = [];
  private readonly perRank: number[] = new Array(RANK_COUNT).fill(0);
  // Which overlapArea query last counted each chip: a chip spanning two cells is met twice.
  private readonly seen: number[] = [];
  private query = 0;

  constructor(w: number, h: number, obstacles: readonly AvoidRect[]) {
    this.w = w;
    this.h = h;
    this.obstacles = obstacles;
    this.cols = Math.max(1, Math.ceil(w / CELL));
    this.rows = Math.max(1, Math.ceil(h / CELL));
    this.cells = new Array(this.cols * this.rows);
  }

  private col(x: number): number {
    return Math.min(this.cols - 1, Math.max(0, Math.floor(x / CELL)));
  }
  private row(y: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor(y / CELL)));
  }

  /** Would a chip box centred at (cx, cy) come within OBSTACLE_GAP of a panel or tapped marker? */
  blocked(cx: number, cy: number, hw: number, hh: number): boolean {
    return this.blocker(cx, cy, hw, hh) >= 0;
  }

  /** …and if so, which one (its index in `obstacles`), else -1. */
  blocker(cx: number, cy: number, hw: number, hh: number): number {
    const l = cx - hw - OBSTACLE_GAP;
    const r = cx + hw + OBSTACLE_GAP;
    const t = cy - hh - OBSTACLE_GAP;
    const b = cy + hh + OBSTACLE_GAP;
    const obs = this.obstacles;
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      if (r > o.left && l < o.right && b > o.top && t < o.bottom) return i;
    }
    return -1;
  }

  /** Would it come within CHIP_GAP of a chip already placed this pass? With `gap` 0: would it
   *  overlap one (Local Space's test for a label it leaves out — Map.tsx). */
  crowded(cx: number, cy: number, hw: number, hh: number, gap: number = CHIP_GAP): boolean {
    const l = cx - hw - gap;
    const r = cx + hw + gap;
    const t = cy - hh - gap;
    const b = cy + hh + gap;
    const bx = this.boxes;
    for (let gy = this.row(t), gy1 = this.row(b); gy <= gy1; gy++) {
      for (let gx = this.col(l), gx1 = this.col(r); gx <= gx1; gx++) {
        const cell = this.cells[gy * this.cols + gx];
        if (!cell) continue;
        for (const k of cell) {
          if (r > bx[k] && l < bx[k + 2] && b > bx[k + 1] && t < bx[k + 3]) return true;
        }
      }
    }
    return false;
  }

  /** How much of it the placed chips would cover (px², summed, each chip once) — to choose the
   *  least-bad spot once the slide has run out. */
  overlapArea(cx: number, cy: number, hw: number, hh: number): number {
    const l = cx - hw;
    const r = cx + hw;
    const t = cy - hh;
    const b = cy + hh;
    const bx = this.boxes;
    const seen = this.seen;
    const q = ++this.query;
    let sum = 0;
    for (let gy = this.row(t), gy1 = this.row(b); gy <= gy1; gy++) {
      for (let gx = this.col(l), gx1 = this.col(r); gx <= gx1; gx++) {
        const cell = this.cells[gy * this.cols + gx];
        if (!cell) continue;
        for (const k of cell) {
          if (seen[k >> 2] === q) continue;
          seen[k >> 2] = q;
          const ox = Math.min(r, bx[k + 2]) - Math.max(l, bx[k]);
          const oy = Math.min(b, bx[k + 3]) - Math.max(t, bx[k + 1]);
          if (ox > 0 && oy > 0) sum += ox * oy;
        }
      }
    }
    return sum;
  }

  /** The stretches of `path`, at arc lengths lo…hi, along which a chip of half-extents hw × hh
   *  centred on the path stays clear of every panel and tapped marker (OBSTACLE_GAP; `of`
   *  'panels') or of every chip placed so far (CHIP_GAP; 'chips'): ascending, as flat [from, to]
   *  pairs of arc length. For a kind that moves its labels along their lines by a solver of its
   *  own — Local Space's radial stagger — and so needs everything open to each label rather than
   *  one spot for it; the two are asked apart because they bind differently (the panels hide a
   *  label, a chip only overlaps it). Exact (a slab test per rect per segment, not a walk), so a
   *  short clear stretch between two panels is never stepped over. Every chip placed so far is
   *  tested, not just a grid cell's worth: a line can cross the whole map, and the kinds ranked
   *  above Local Space place a few dozen chips at most. */
  clearSpans(
    path: ArcPath,
    hw: number,
    hh: number,
    lo: number,
    hi: number,
    of: 'panels' | 'chips',
  ): number[] {
    if (!(hi >= lo)) return [];
    const cut: number[] = [];
    const { pts, cum } = path;
    for (let i = 0; i + 1 < pts.length; i++) {
      const s = cum[i];
      const len = cum[i + 1] - s;
      if (!(len > 0) || cum[i + 1] <= lo || s >= hi) continue;
      const ox = pts[i].x;
      const oy = pts[i].y;
      const ex = pts[i + 1].x;
      const ey = pts[i + 1].y;
      const dx = (ex - ox) / len;
      const dy = (ey - oy) / len;
      const tlo = Math.max(0, lo - s);
      const thi = Math.min(len, hi - s);
      // The segment's box, grown by the chip: a rect clear of it can't cut the segment, and most
      // rects are — two comparisons instead of the slab test's divisions.
      const x0 = Math.min(ox, ex) - hw;
      const x1 = Math.max(ox, ex) + hw;
      const y0 = Math.min(oy, ey) - hh;
      const y1 = Math.max(oy, ey) + hh;
      if (of === 'panels') {
        const g = OBSTACLE_GAP;
        for (const o of this.obstacles) {
          if (o.right + g <= x0 || o.left - g >= x1 || o.bottom + g <= y0 || o.top - g >= y1) continue;
          rayCut(cut, s, ox, oy, dx, dy, o.left - hw - g, o.top - hh - g, o.right + hw + g, o.bottom + hh + g, tlo, thi);
        }
      } else {
        const bx = this.boxes;
        const c = CHIP_GAP;
        for (let k = 0; k < bx.length; k += 4) {
          if (bx[k + 2] + c <= x0 || bx[k] - c >= x1 || bx[k + 3] + c <= y0 || bx[k + 1] - c >= y1) continue;
          rayCut(cut, s, ox, oy, dx, dy, bx[k] - hw - c, bx[k + 1] - hh - c, bx[k + 2] + hw + c, bx[k + 3] + hh + c, tlo, thi);
        }
      }
    }
    const order: number[] = [];
    for (let i = 0; i < cut.length; i += 2) order.push(i);
    order.sort((a, b) => cut[a] - cut[b]);
    // The complement within [lo, hi]. A cut is OPEN (a chip exactly touching the inflated rect is
    // clear — blocked() and crowded() test strictly), so its ends are themselves clear; a span of
    // zero length is dropped all the same, which also drops the ends of a cut clipped at lo or hi.
    const out: number[] = [];
    let cur = lo;
    for (const i of order) {
      if (cut[i] > cur) out.push(cur, cut[i]);
      if (cut[i + 1] > cur) cur = cut[i + 1];
    }
    if (hi > cur) out.push(cur, hi);
    return out;
  }

  /** Record a placed chip, and return its stacking value (chipStack) — its place in its rank is
   *  the order it was placed in. */
  add(cx: number, cy: number, hw: number, hh: number, rank: number): number {
    const k = this.boxes.length;
    this.boxes.push(cx - hw, cy - hh, cx + hw, cy + hh);
    for (let gy = this.row(cy - hh), gy1 = this.row(cy + hh); gy <= gy1; gy++) {
      for (let gx = this.col(cx - hw), gx1 = this.col(cx + hw); gx <= gx1; gx++) {
        const i = gy * this.cols + gx;
        (this.cells[i] ??= []).push(k);
      }
    }
    return chipStack(rank, this.perRank[rank]++);
  }
}

// Where the ray (ox, oy) + t·(dx, dy) runs through the open rect l < x < r, t < y < b, cut to
// [lo, hi]: pushed onto `out` as a (base + t0, base + t1) pair, or nothing when it misses.
function rayCut(
  out: number[],
  base: number,
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  l: number,
  t: number,
  r: number,
  b: number,
  lo: number,
  hi: number,
): void {
  if (!(r > l && b > t)) return;
  let t0 = lo;
  let t1 = hi;
  if (Math.abs(dx) < 1e-9) {
    if (ox <= l || ox >= r) return;
  } else {
    const a = (l - ox) / dx;
    const c = (r - ox) / dx;
    t0 = Math.max(t0, Math.min(a, c));
    t1 = Math.min(t1, Math.max(a, c));
  }
  if (Math.abs(dy) < 1e-9) {
    if (oy <= t || oy >= b) return;
  } else {
    const a = (t - oy) / dy;
    const c = (b - oy) / dy;
    t0 = Math.max(t0, Math.min(a, c));
    t1 = Math.min(t1, Math.max(a, c));
  }
  if (t1 > t0) out.push(base + t0, base + t1);
}

/** A screen polyline with the arc length at each vertex (`cum[0]` = 0), for the span queries: a
 *  label's line as drawn, measured from where it starts. */
export interface ArcPath {
  pts: readonly ChipPt[];
  cum: readonly number[];
}

export function arcPath(pts: ChipPt[]): ArcPath {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return { pts, cum };
}

/** The point at arc length s along the path (held to its ends), which has at least one point. */
export function arcPoint(path: ArcPath, s: number): ChipPt {
  const { pts, cum } = path;
  const n = pts.length;
  if (n === 1 || s <= 0) return pts[0];
  if (s >= cum[n - 1]) return pts[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const len = cum[hi] - cum[lo];
  const t = len > 0 ? (s - cum[lo]) / len : 0;
  return { x: pts[lo].x + (pts[hi].x - pts[lo].x) * t, y: pts[lo].y + (pts[hi].y - pts[lo].y) * t };
}

/** The stretches of the path (ascending [from, to] pairs of arc length) that lie inside the rect
 *  l…r × t…b — e.g. where a chip's centre keeps the whole chip on screen. None when the rect is
 *  empty: a screen too small for the chip. */
export function pathInRect(path: ArcPath, l: number, t: number, r: number, b: number): number[] {
  const { pts, cum } = path;
  const runs: number[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const len = cum[i + 1] - cum[i];
    if (!(len > 0)) continue;
    const dx = (pts[i + 1].x - pts[i].x) / len;
    const dy = (pts[i + 1].y - pts[i].y) / len;
    rayCut(runs, cum[i], pts[i].x, pts[i].y, dx, dy, l, t, r, b, 0, len);
  }
  // Segment by segment, in order; one run continues the last where they meet at a vertex.
  const out: number[] = [];
  for (let k = 0; k < runs.length; k += 2) {
    if (out.length && runs[k] - out[out.length - 1] < 1e-6) out[out.length - 1] = runs[k + 1];
    else out.push(runs[k], runs[k + 1]);
  }
  return out;
}

export interface PathSpot extends ChipPt {
  /** False when the slide ran out and the chip overlaps others (at the least-covered spot). */
  clear: boolean;
}

// Samples of the path that are on screen and clear of the panels, from the one walk a placement
// makes: x, y, squared distance to the anchor, segment index, t along it, t step there. Kept
// between calls and grown as needed — placements run one at a time, and a pass places hundreds,
// so the hot loops below allocate nothing and close over nothing.
const STRIDE = 6;
let samples: Float64Array = new Float64Array(STRIDE * 256);
// …the candidates step 2 draws from them, in the same layout…
let cands: Float64Array = new Float64Array(STRIDE * 64);
// …and the stretches the fine walk revisits: segment, t0, t1.
let gaps: Float64Array = new Float64Array(3 * 64);

function grow(buf: Float64Array, need: number): Float64Array {
  if (need <= buf.length) return buf;
  const out = new Float64Array(Math.max(need, buf.length * 2));
  out.set(buf);
  return out;
}

// What keeps a chip's centre from (x, y), given its safe rect: -1 nothing; 0–3 off the rect's
// left, right, top or bottom; 4 + i obstacle i. Every one of those regions is convex (a
// half-plane, or a rect inflated by the gap), so two points kept out by the SAME one have nothing
// valid between them — which is what lets the walk skip a stretch of line on two tests instead
// of sampling it.
function exclusion(
  occ: ChipOccupancy,
  x: number,
  y: number,
  hw: number,
  hh: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): number {
  if (x < minX) return 0;
  if (x > maxX) return 1;
  if (y < minY) return 2;
  if (y > maxY) return 3;
  const o = occ.blocker(x, y, hw, hh);
  return o < 0 ? -1 : 4 + o;
}

// Place a chip of half-extents hw × hh ON its path (a screen polyline: an edge chip's line, a
// paran's projected row, a Local Space ray), as near `anchor` (a point on the path) as it can be
// while fully on screen inside `inset` and clear of every panel and tapped marker — and then, as
// near as that, clear of the chips already placed, sliding at most `cap` px further along the
// path to find room. Past the cap it overlaps, at the spot within the cap the placed chips cover
// least. Never off the path: that is what keeps a label unambiguous about which line it names.
// Null when no point of the path is on screen and clear of the panels (the caller decides what a
// label with nowhere to go does).
export function placeOnPath(
  occ: ChipOccupancy,
  path: readonly ChipPt[],
  anchor: ChipPt,
  hw: number,
  hh: number,
  inset: number,
  cap: number = CHIP_SLIDE_CAP,
): PathSpot | null {
  const minX = inset + hw;
  const maxX = occ.w - inset - hw;
  const minY = inset + hh;
  const maxY = occ.h - inset - hh;
  if (maxX < minX || maxY < minY || path.length === 0) return null;
  const ax = anchor.x;
  const ay = anchor.y;
  const one = path.length === 1;
  const nSeg = one ? 1 : path.length - 1;

  // 1. The panel-clear spot: the anchor if it is one, else the nearest point along the path that
  //    is. The walk is continuous along each segment (vertices can be ~100 px apart zoomed in),
  //    so the label lands smoothly on the line rather than snapping to a coarse vertex. It keeps
  //    every valid sample for step 2 — all of them when the spot had to be searched for, only
  //    those within `cap` of the anchor when the anchor itself was clear of the panels (it then
  //    needs a walk at all only if another chip is on it).
  const anchorOk = exclusion(occ, ax, ay, hw, hh, minX, maxX, minY, maxY) < 0;
  if (anchorOk && !occ.crowded(ax, ay, hw, hh)) return { x: ax, y: ay, clear: true };
  let n = 0;
  let ng = 0;
  let bx = ax;
  let by = ay;
  let best = anchorOk ? 0 : Infinity;
  for (let i = 0; i < nSeg; i++) {
    const a = path[i];
    const c = one ? a : path[i + 1];
    // Both ends off the same side of the safe rect: the (many) fully off-screen segments of a
    // long line, pruned without testing a panel. And when the anchor is the spot, a segment that
    // stays more than `cap` from it can't matter.
    if (
      (a.x < minX && c.x < minX) ||
      (a.x > maxX && c.x > maxX) ||
      (a.y < minY && c.y < minY) ||
      (a.y > maxY && c.y > maxY)
    )
      continue;
    if (
      anchorOk &&
      (Math.max(a.x, c.x) < ax - cap ||
        Math.min(a.x, c.x) > ax + cap ||
        Math.max(a.y, c.y) < ay - cap ||
        Math.min(a.y, c.y) > ay + cap)
    )
      continue;
    // Both ends kept out by the same region: so is all of it (a stretch of line under a panel).
    const ra = exclusion(occ, a.x, a.y, hw, hh, minX, maxX, minY, maxY);
    if (ra >= 0 && ra === exclusion(occ, c.x, c.y, hw, hh, minX, maxX, minY, maxY)) continue;
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / WALK_STEP));
    const dt = 1 / steps;
    let prev = -2;
    for (let s = 0; s <= steps; s++) {
      const t = s * dt;
      const x = a.x + dx * t;
      const y = a.y + dy * t;
      const r = exclusion(occ, x, y, hw, hh, minX, maxX, minY, maxY);
      if (r < 0) {
        const d = (x - ax) * (x - ax) + (y - ay) * (y - ay);
        if (d < best) {
          best = d;
          bx = x;
          by = y;
        }
        const k = n * STRIDE;
        if (k + STRIDE > samples.length) samples = grow(samples, k + STRIDE);
        samples[k] = x;
        samples[k + 1] = y;
        samples[k + 2] = d;
        samples[k + 3] = i;
        samples[k + 4] = t;
        samples[k + 5] = dt;
        n++;
      } else if (prev >= 0 && prev !== r) {
        // Kept out on both sides, for different reasons: a clear window narrower than the
        // spacing can only hide between two such samples.
        const g = ng * 3;
        if (g + 3 > gaps.length) gaps = grow(gaps, g + 3);
        gaps[g] = i;
        gaps[g + 1] = t - dt;
        gaps[g + 2] = t;
        ng++;
      }
      prev = r;
    }
  }
  // Nothing at 8 px isn't always nothing: the clear stretch of a line can be shorter than that —
  // a corner between the attribution and the screen edge left 4 px of one (measured 2026-10-01),
  // and missing it sends the chip off its line to the fallback. So the stretches that could hide
  // one are walked again, finely, before giving up.
  for (let g = 0; best === Infinity && g < ng * 3; g += 3) {
    const i = gaps[g] | 0;
    const a = path[i];
    const c = one ? a : path[i + 1];
    const t0 = gaps[g + 1];
    const t1 = gaps[g + 2];
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const steps = Math.max(1, Math.ceil((Math.sqrt(dx * dx + dy * dy) * (t1 - t0)) / FINE_STEP));
    const dt = (t1 - t0) / steps;
    for (let s = 1; s < steps; s++) {
      const t = t0 + s * dt;
      const x = a.x + dx * t;
      const y = a.y + dy * t;
      if (exclusion(occ, x, y, hw, hh, minX, maxX, minY, maxY) >= 0) continue;
      const d = (x - ax) * (x - ax) + (y - ay) * (y - ay);
      if (d < best) {
        best = d;
        bx = x;
        by = y;
      }
      const k = n * STRIDE;
      if (k + STRIDE > samples.length) samples = grow(samples, k + STRIDE);
      samples[k] = x;
      samples[k + 1] = y;
      samples[k + 2] = d;
      samples[k + 3] = i;
      samples[k + 4] = t;
      samples[k + 5] = dt;
      n++;
    }
  }
  if (best === Infinity) return null;
  if (!anchorOk && !occ.crowded(bx, by, hw, hh)) return { x: bx, y: by, clear: true };

  // 2. Room among the placed chips. The candidates are the walk's samples within `cap` of that
  //    spot, each with the point half a step on along its segment (4 px apart: a gap just one
  //    chip tall can fall between two 8 px samples). Of those, the one nearest the anchor that is
  //    clear of the placed chips, tightened by bisection toward its neighbour nearer the anchor —
  //    or, if none is clear, the one they cover least (nearest the anchor on a tie).
  const cap2 = cap * cap;
  let m = 0;
  for (let j = 0; j < n; j++) {
    const k = j * STRIDE;
    const sx = samples[k];
    const sy = samples[k + 1];
    if ((sx - bx) * (sx - bx) + (sy - by) * (sy - by) > cap2) continue;
    const i = samples[k + 3] | 0;
    const t = samples[k + 4];
    const step = samples[k + 5] / 2;
    if (m * STRIDE + 2 * STRIDE > cands.length) cands = grow(cands, m * STRIDE + 2 * STRIDE);
    let c = m * STRIDE;
    cands[c] = sx;
    cands[c + 1] = sy;
    cands[c + 2] = samples[k + 2];
    cands[c + 3] = i;
    cands[c + 4] = t;
    cands[c + 5] = step;
    m++;
    const th = t + step;
    if (th > 1) continue;
    const a = path[i];
    const e = one ? a : path[i + 1];
    const x = a.x + (e.x - a.x) * th;
    const y = a.y + (e.y - a.y) * th;
    if (
      (x - bx) * (x - bx) + (y - by) * (y - by) > cap2 ||
      exclusion(occ, x, y, hw, hh, minX, maxX, minY, maxY) >= 0
    )
      continue;
    c = m * STRIDE;
    cands[c] = x;
    cands[c + 1] = y;
    cands[c + 2] = (x - ax) * (x - ax) + (y - ay) * (y - ay);
    cands[c + 3] = i;
    cands[c + 4] = th;
    cands[c + 5] = step;
    m++;
  }
  let pick = -1;
  let pickD = Infinity;
  for (let j = 0; j < m; j++) {
    const c = j * STRIDE;
    if (cands[c + 2] >= pickD || occ.crowded(cands[c], cands[c + 1], hw, hh)) continue;
    pick = c;
    pickD = cands[c + 2];
  }
  if (pick >= 0) {
    const i = cands[pick + 3] | 0;
    const a = path[i];
    const e = one ? a : path[i + 1];
    const ex = e.x - a.x;
    const ey = e.y - a.y;
    const t = cands[pick + 4];
    const step = cands[pick + 5];
    // Its neighbour on the same segment that lies nearer the anchor — crowded, blocked or off
    // screen, or it would have been picked — and the nearest clear point between the two, which
    // stays on the segment, so still on the line.
    let lo = -1;
    let loD = pickD;
    for (let side = -1; side <= 1; side += 2) {
      const u = t + side * step;
      if (u < -1e-9 || u > 1 + 1e-9) continue;
      const d = (a.x + ex * u - ax) ** 2 + (a.y + ey * u - ay) ** 2;
      if (d < loD) {
        lo = u;
        loD = d;
      }
    }
    let hi = t;
    if (lo >= 0) {
      for (let r = 0; r < REFINE; r++) {
        const mid = (lo + hi) / 2;
        const x = a.x + ex * mid;
        const y = a.y + ey * mid;
        if (
          exclusion(occ, x, y, hw, hh, minX, maxX, minY, maxY) < 0 &&
          !occ.crowded(x, y, hw, hh)
        )
          hi = mid;
        else lo = mid;
      }
    }
    return { x: a.x + ex * hi, y: a.y + ey * hi, clear: true };
  }
  let ox = bx;
  let oy = by;
  let oArea = Infinity;
  let oD = Infinity;
  for (let j = 0; j < m; j++) {
    const c = j * STRIDE;
    const area = occ.overlapArea(cands[c], cands[c + 1], hw, hh);
    if (area < oArea || (area === oArea && cands[c + 2] < oD)) {
      oArea = area;
      oD = cands[c + 2];
      ox = cands[c];
      oy = cands[c + 1];
    }
  }
  return { x: ox, y: oy, clear: false };
}
