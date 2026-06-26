// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Screen-space anchors for the ACG line labels: instead of repeating the glyph +
// angle code down each line, we drop a colored badge where the line exits the
// viewport (both ends). MapLibre has no "label at the viewport edge" placement,
// so we project each line and intersect it with the (inset) screen rect on every
// map move. ACG lines only — parans / local space keep their along-line labels.
import type { Map as MlMap } from 'maplibre-gl';
import type { Feature, LineString } from 'geojson';
import type { AspectKind } from '../../lib/astro/angleAspects';
import type { LineProps, LineType } from '../../lib/astro/lines';
import type { PlanetName } from '../../lib/ephemeris';
import { isOccluded } from '../../lib/mapProjection';

export interface LineBadge {
  key: string;
  x: number;
  y: number;
  color: string;
  planet: PlanetName;
  lineType: LineType;
  /** Set on "Aspects to angles" aspect lines: the badge shows the aspect glyph
   *  between the planet and the angle code (e.g. "Su □ MC"). */
  aspect?: AspectKind;
  /** Aspect lines: the line's true geometric angle (its own MC/IC/ASC/DSC),
   *  so the badge can name it by the angle it IS (via aspectBranchReading)
   *  rather than the MC/ASC-convention relabel in `lineType`. */
  branch?: LineType;
  /** Set on midpoint lines: the pair's second body — the badge shows both
   *  glyphs (e.g. "Su/Mo MC"). */
  planetB?: PlanetName;
  /** Aspect/midpoint badges' click-to-fly target: the computed point's
   *  sub-point (where its ecliptic degree is directly overhead). */
  targetLng?: number;
  targetLat?: number;
  /** The body's overlay/promoted tag (e.g. "Tr") shown as the label prefix; empty for
   *  the natal chart's own lines. Display only — natal-vs-overlay routing uses
   *  `overlay` below, so a promoted overlay can show a prefix yet route as natal. */
  prefix: string;
  /** True when the badge belongs to the OVERLAY rendering path (the dashed
   *  'acg-lines-ov' source), so its label's zenith fly-to reads the overlay zenith
   *  lookup; false for the natal path (incl. a promoted overlay drawn as the chart). */
  overlay: boolean;
  /** This badge's line in screen space (its longest visible run, projected). Lets the
   *  placement step slide the label ALONG the line to keep it ON the (curved) line
   *  instead of detaching it when dodging the screen edge / a HUD panel. */
  line?: { x: number; y: number }[];
  /** A merged lunar-node line (North Node line coincident with its antipodal South Node
   *  counterpart): the badge shows both, e.g. "NN MC / SN IC". */
  pair?: boolean;
}

interface Pt {
  x: number;
  y: number;
}
interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// A HUD element's screen rect (map-container-relative) that badges should avoid.
export interface AvoidRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const inRect = (p: Pt, r: Rect) =>
  p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;

// Liang–Barsky: the parameter range [t0,t1] (within [0,1]) of segment a→b that
// lies inside the rect, or null if the segment misses it entirely. t0>0 means the
// segment ENTERS the rect mid-way (a is outside); t1<1 means it EXITS mid-way.
// This catches lines that cross the viewport with BOTH endpoints off-screen —
// e.g. the MC/IC meridians, whose ±85° lat endpoints sit far above/below the view.
function clipSeg(a: Pt, b: Pt, r: Rect): { t0: number; t1: number } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - r.minX, r.maxX - a.x, a.y - r.minY, r.maxY - a.y];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null; // parallel to an edge and outside it
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  return { t0, t1 };
}

// Re-wrap a longitude (possibly UNWRAPPED past ±180 — horizon curves run continuous
// across the antimeridian, see dateline.ts) into the ±180 band centred on the camera's
// CURRENT world copy. map.project() in 2D Mercator is a pure affine map of the RAW
// longitude (mercatorXfromLng = (180+lng)/360, no wrap), so feeding it the stored coords
// projects them into whatever copy they were authored in — off-screen when the camera
// sits in a different copy. Re-wrapping first lands every vertex on the copy MapLibre
// actually draws. On the globe the projection is periodic in longitude, so this is a
// no-op there.
function lngToVisibleCopy(lng: number, centerLng: number): number {
  return lng - 360 * Math.round((lng - centerLng) / 360);
}

// The on-screen portion of segment a→b, clipped to the (inset) viewport: its `near`
// end (closer to a) and `far` end (closer to b), or null if the segment misses the
// screen entirely. Lets a radial LS label stay visible by anchoring to whichever end
// fits — the pin-ward `near` end when the origin is off-screen (so it slides back to
// the ring as you pan toward the pin), or the planet-ward `far` end otherwise — using
// the same clip the ACG badges use.
export function clipSegmentToView(
  a: { x: number; y: number },
  b: { x: number; y: number },
  w: number,
  h: number,
  inset: number,
): { near: { x: number; y: number }; far: { x: number; y: number } } | null {
  const r: Rect = { minX: inset, minY: inset, maxX: w - inset, maxY: h - inset };
  if (r.maxX <= r.minX || r.maxY <= r.minY) return null;
  const c = clipSeg(a, b, r);
  if (!c) return null;
  const at = (t: number) => ({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
  return { near: at(c.t0), far: at(c.t1) };
}

// The per-line display facts a badge carries, shared by every end of the line.
interface LineMeta {
  color: string;
  planet: PlanetName;
  lineType: LineType;
  prefix: string;
  /** Whether this is a merged lunar-node pair line (see LineBadge.pair). */
  pair: boolean;
  /** Aspect / midpoint extras (see the same fields on LineBadge). */
  aspect?: AspectKind;
  branch?: LineType;
  planetB?: PlanetName;
  targetLng?: number;
  targetLat?: number;
}

interface LineGroup extends LineMeta {
  // The two ends (or single end) of the LONGEST on-screen run seen so far, plus that
  // run's squared end-to-end pixel extent and its full projected polyline. We label the
  // most-visible contiguous run rather than the farthest-apart pair across all runs, so
  // the badge pair always belongs to ONE visible segment and never mixes a mid-section
  // end with an apex/nadir end from a different fragment. bestLine is kept so the
  // placement step can slide a label along the line to a clear, on-screen spot.
  bestEnds: Pt[];
  bestExtent: number;
  bestLine: Pt[];
}

// Find one contiguous, on-screen run's ends — the leading vertex if it's already inside
// the rect, each viewport entry/exit crossing (Liang–Barsky), and the trailing vertex if
// inside — then keep them as the group's labelled ends IF this run spans more on-screen
// than any earlier run for the same line. Labelling the longest visible run (rather than
// pooling every run and taking the global farthest pair) keeps the badge pair on a single
// visible segment.
function addRunEnds(
  pts: Pt[],
  rect: Rect,
  groups: Map<string, LineGroup>,
  key: string,
  meta: LineMeta,
): void {
  if (pts.length === 0) return;
  const anchors: Pt[] = [];
  if (inRect(pts[0], rect)) anchors.push(pts[0]);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const c = clipSeg(a, b, rect);
    if (!c) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (c.t0 > 0) anchors.push({ x: a.x + c.t0 * dx, y: a.y + c.t0 * dy });
    if (c.t1 < 1) anchors.push({ x: a.x + c.t1 * dx, y: a.y + c.t1 * dy });
  }
  const last = pts[pts.length - 1];
  if (inRect(last, rect)) anchors.push(last);
  if (anchors.length === 0) return;
  let g = groups.get(key);
  if (!g) {
    g = { ...meta, bestEnds: [], bestExtent: -1, bestLine: [] };
    groups.set(key, g);
  }
  const ends =
    anchors.length > 1 ? [anchors[0], anchors[anchors.length - 1]] : [anchors[0]];
  const extent =
    ends.length > 1
      ? (ends[0].x - ends[1].x) ** 2 + (ends[0].y - ends[1].y) ** 2
      : 0;
  if (extent > g.bestExtent) {
    g.bestExtent = extent;
    g.bestEnds = ends;
    g.bestLine = pts;
  }
}

// Up to two badges per LOGICAL line: the two ends of its longest on-screen run. Each
// vertex is re-wrapped to the camera's current world copy before projection (stored
// ASC/DSC longitudes run past ±180 across the antimeridian, and map.project does NOT
// wrap), so the projected polyline coincides with the basemap copy MapLibre draws and a
// label tracks the visible arc instead of clamping to the curve's apex/nadir. One label
// pair per line at every zoom, world view included.
export function computeLineBadges(
  map: MlMap,
  features: Feature<
    LineString,
    LineProps & {
      aspect?: AspectKind;
      /** Geometric branch discriminator on aspect lines (see AspectLineProps.branch). */
      branch?: LineType;
      planetB?: PlanetName;
      targetLng?: number;
      targetLat?: number;
    }
  >[],
  inset: number,
  isOverlay: boolean,
  // React-key namespace for this feature set. The natal, overlay, and
  // aspect/midpoint sets are computed in separate calls whose badges render in
  // ONE list, so each call needs its own namespace to keep keys unique.
  keyNs: string = isOverlay ? 'ov' : 'n',
): LineBadge[] {
  const container = map.getContainer();
  const w = container.clientWidth;
  const h = container.clientHeight;
  const rect: Rect = { minX: inset, minY: inset, maxX: w - inset, maxY: h - inset };
  if (rect.maxX <= rect.minX || rect.maxY <= rect.minY) return [];

  const groups = new Map<string, LineGroup>();

  // map.project() is a pure affine map of the RAW longitude (it does not wrap to the
  // visible world copy), so re-wrap every vertex toward the camera centre before
  // projecting. worldPx is the on-screen pixel width of 360° — used to break a run
  // wherever a re-wrapped segment would jump a whole world (the lone seam at
  // centerLng±180). On the globe there are no world copies (the projection is periodic
  // and occlusion handles the far side), so the guard is disabled (worldPx = ∞).
  const centerLng = map.getCenter().lng;
  const isFlat = map.getProjection()?.type !== 'globe';
  const worldPx = isFlat
    ? Math.abs(map.project([centerLng + 360, 0]).x - map.project([centerLng, 0]).x)
    : Infinity;

  features.forEach((f) => {
    const coords = f.geometry.coordinates;
    if (coords.length < 2) return;
    // Lines are dense polylines (horizon curves at 0.5° steps, meridians at 2°);
    // every 3rd point is plenty to find edge crossings and keeps the per-move cost
    // low. Anything short (a stray fragment) is walked point-by-point.
    const step = coords.length > 20 ? 3 : 1;
    const { planet, lineType, color, tag, pair = false, aspect, branch, planetB, targetLng, targetLat } =
      f.properties;
    // Display prefix comes from the line's tag (set by tagLabels for overlay AND
    // promoted lines), independent of the isOverlay routing flag below.
    const prefix = tag ?? '';
    // aspect/planetB join the key so each aspect or midpoint line labels its own
    // ends — they all share a planet + lineType within one body's set. `branch`
    // separates an aspect's two same-label sides (e.g. both trine-MC meridians).
    const key = `${planet}|${lineType}|${prefix}|${aspect ?? ''}|${branch ?? ''}|${planetB ?? ''}`;
    const meta: LineMeta = {
      color, planet, lineType, prefix, pair, aspect, branch, planetB, targetLng, targetLat,
    };

    // Split the projected polyline into contiguous runs of VISIBLE vertices. On a
    // globe, occluded / behind-camera points project to bogus pixels, so we break
    // the run at any such vertex rather than connecting a front point to a far-side
    // one, so a label hugs the visible terminator and never anchors to the back of the
    // globe. In 2D nothing is occluded; there the run breaks only at the world seam
    // (the worldPx jump guard below).
    let run: Pt[] = [];
    const flushRun = () => {
      addRunEnds(run, rect, groups, key, meta);
      run = [];
    };
    const pushCoord = (c: number[]) => {
      const lng = lngToVisibleCopy(c[0], centerLng);
      if (isOccluded(map, lng, c[1])) {
        flushRun();
        return;
      }
      const p = map.project([lng, c[1]]);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        flushRun();
        return;
      }
      // A re-wrapped segment that jumps a whole world straddles the seam at centerLng±180:
      // break the run there so clipSeg never sees a spurious full-width segment.
      const prev = run.length ? run[run.length - 1] : null;
      if (prev && Math.abs(p.x - prev.x) > worldPx / 2) flushRun();
      run.push({ x: p.x, y: p.y });
    };

    for (let i = 0; i < coords.length; i += step) pushCoord(coords[i]);
    pushCoord(coords[coords.length - 1]); // ensure the true last coord is included
    flushRun();
  });

  const out: LineBadge[] = [];
  let gi = 0;
  groups.forEach((g) => {
    g.bestEnds.forEach((pt, ei) => {
      out.push({
        key: `${keyNs}-${gi}-${ei}`,
        x: pt.x,
        y: pt.y,
        color: g.color,
        planet: g.planet,
        lineType: g.lineType,
        prefix: g.prefix,
        overlay: isOverlay,
        line: g.bestLine,
        pair: g.pair,
        aspect: g.aspect,
        branch: g.branch,
        planetB: g.planetB,
        targetLng: g.targetLng,
        targetLat: g.targetLat,
      });
    });
    gi++;
  });

  return out;
}

// Place each line badge ON its line, fully on screen and clear of the HUD panels. The
// anchor from computeLineBadges sits where the line meets the (inset) viewport — often
// right at the edge, or behind a panel like the bottom timeline / minimap. Rather than
// clamp x and y independently or shove the badge PERPENDICULAR off the panel (both
// DETACH the label from an angled/curved line, because the line has moved by the time
// you arrive at the clamped spot), we slide ALONG the line to the nearest projected
// point that's a valid badge spot. A label therefore always sits on its own line, so
// it's unambiguous which line it belongs to. Straight vertical lines are unaffected
// (sliding along a vertical line only moves y) — which is why they were never the
// problem. If no point on the visible run is clear (the whole run hides behind panels),
// fall back to an axis clamp so the label is at least fully on screen.
export function dodgeBadges(
  badges: LineBadge[],
  rects: AvoidRect[],
  w: number,
  h: number,
  inset: number,
): LineBadge[] {
  const HW = 32; // generous half-width / -height estimate for a badge
  const HH = 11;
  const GAP = 6; // breathing room kept between a badge box and a panel
  const minX = inset + HW;
  const maxX = w - inset - HW;
  const minY = inset + HH;
  const maxY = h - inset - HH;
  if (maxX <= minX || maxY <= minY) return badges; // viewport too small to place safely
  // A badge box centred at (x,y) comes within GAP of panel r? (panel inflated by GAP, so
  // a "clear" spot keeps a small cushion and absorbs badge-width underestimation.)
  const onPanel = (x: number, y: number) =>
    rects.some(
      (r) =>
        x + HW > r.left - GAP &&
        x - HW < r.right + GAP &&
        y + HH > r.top - GAP &&
        y - HH < r.bottom + GAP,
    );
  // Valid spot: the whole badge box is inside the safe rect and clears every panel.
  const ok = (x: number, y: number) =>
    x >= minX && x <= maxX && y >= minY && y <= maxY && !onPanel(x, y);

  return badges.map((b) => {
    if (ok(b.x, b.y)) return b; // already on screen, on its line, clear of panels
    const line = b.line;
    if (line && line.length) {
      // Nearest point ALONG the line to the original anchor that is a valid spot — i.e.
      // where the line emerges past the edge / panel. Walk each segment continuously
      // (run vertices can be ~100px apart when zoomed in) so the label lands smoothly on
      // the line rather than snapping to a coarse vertex.
      const acc: { pt: { x: number; y: number } | null; d: number } = {
        pt: null,
        d: Infinity,
      };
      const consider = (x: number, y: number) => {
        if (!ok(x, y)) return;
        const dx = x - b.x;
        const dy = y - b.y;
        const d = dx * dx + dy * dy;
        if (d < acc.d) {
          acc.d = d;
          acc.pt = { x, y };
        }
      };
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i];
        const c = line[i + 1];
        // Cheap reject: a segment with both endpoints off the same side of the safe rect
        // can't contain a valid spot. Prunes the (many) fully off-screen segments.
        if (
          (a.x < minX && c.x < minX) ||
          (a.x > maxX && c.x > maxX) ||
          (a.y < minY && c.y < minY) ||
          (a.y > maxY && c.y > maxY)
        )
          continue;
        const steps = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.y - a.y) / 8));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          consider(a.x + (c.x - a.x) * t, a.y + (c.y - a.y) * t);
        }
      }
      if (line.length === 1) consider(line[0].x, line[0].y);
      if (acc.pt) return { ...b, x: acc.pt.x, y: acc.pt.y };
    }
    // No clear point on the visible run (the whole run hides behind panels): fall back to
    // the old behaviour — push perpendicular off any overlapping panel toward the screen
    // interior, then clamp on screen — so the label is at least visible and not buried.
    let { x, y } = b;
    const onTop = y <= inset + 1;
    const onBottom = y >= h - inset - 1;
    const onLeft = x <= inset + 1;
    const onRight = x >= w - inset - 1;
    for (const r of rects) {
      const hit =
        x + HW > r.left && x - HW < r.right && y + HH > r.top && y - HH < r.bottom;
      if (!hit) continue;
      if (onTop) y = Math.max(y, r.bottom + HH + GAP);
      else if (onBottom) y = Math.min(y, r.top - HH - GAP);
      else if (onLeft) x = Math.max(x, r.right + HW + GAP);
      else if (onRight) x = Math.min(x, r.left - HW - GAP);
      else y = Math.max(y, r.bottom + HH + GAP);
    }
    return {
      ...b,
      x: Math.min(Math.max(x, minX), maxX),
      y: Math.min(Math.max(y, minY), maxY),
    };
  });
}

// Measured half-extents (px) of a badge's rendered box, keyed by badge key.
export interface BadgeSize {
  hw: number;
  hh: number;
}

// Spread the edge labels apart so they don't overlap — used ONLY while the Capture frame
// is armed. The live map lets you pan to disambiguate stacked labels; a static export can't,
// so before capturing we relax the labels off each other for legibility. Unlike dodgeBadges
// (which keeps a label ON its line, sliding it along to clear a panel), this deliberately lets
// a label drift OFF its exit point to make room: a few passes of AABB separation push each
// overlapping pair apart along its axis of least overlap, and after every pass each label is
// re-seated inside the frame and off the avoid-rects (the on-map attribution). When the frame
// is too crowded to separate everything, residual overlap is tolerated — the relaxation simply
// doesn't fully converge — rather than shoving labels out of the shot.
//
// `sizes` carries each badge's measured box (keyed by badge key). A badge with no measurement
// (e.g. one that just appeared and has no DOM yet) falls back to a generous default box and is
// corrected on the next recompute. Because the sizes are intrinsic (content-, not position-,
// dependent) and the anchors derive only from the camera, the result is a fixed point: a
// settled camera re-spreads to the identical layout, so there's no measure→resize feedback.
export function spreadBadges(
  badges: LineBadge[],
  sizes: Map<string, BadgeSize>,
  rects: AvoidRect[],
  w: number,
  h: number,
  inset: number,
): LineBadge[] {
  if (badges.length < 2) return badges;
  const DEF_HW = 30; // fallback box for an unmeasured (just-appeared) badge
  const DEF_HH = 11;
  const GAP = 4; // clear gap kept between two label boxes (and off the avoid-rects)
  const ITERATIONS = 24;

  const items = badges.map((b) => {
    const s = sizes.get(b.key);
    return { x: b.x, y: b.y, hw: s?.hw ?? DEF_HW, hh: s?.hh ?? DEF_HH };
  });
  type Item = (typeof items)[number];

  // Keep a box's centre inside the safe rect, accounting for its own extents. A box wider
  // or taller than the frame just centres on that axis (best effort).
  const clamp = (it: Item) => {
    const minX = inset + it.hw;
    const maxX = w - inset - it.hw;
    const minY = inset + it.hh;
    const maxY = h - inset - it.hh;
    it.x = minX <= maxX ? Math.min(Math.max(it.x, minX), maxX) : w / 2;
    it.y = minY <= maxY ? Math.min(Math.max(it.y, minY), maxY) : h / 2;
  };

  // Push a box clear of any avoid-rect (the on-map attribution) along its least-penetration
  // axis, so a spread label never lands on the credits — the one panel still in the export.
  const avoid = (it: Item) => {
    for (const r of rects) {
      const penX = it.hw + GAP + (r.right - r.left) / 2 - Math.abs(it.x - (r.left + r.right) / 2);
      const penY = it.hh + GAP + (r.bottom - r.top) / 2 - Math.abs(it.y - (r.top + r.bottom) / 2);
      if (penX <= 0 || penY <= 0) continue;
      if (penX < penY) it.x += it.x < (r.left + r.right) / 2 ? -penX : penX;
      else it.y += it.y < (r.top + r.bottom) / 2 ? -penY : penY;
    }
  };

  for (let iter = 0; iter < ITERATIONS; iter++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const ox = a.hw + b.hw + GAP - Math.abs(dx);
        const oy = a.hh + b.hh + GAP - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox < oy) {
          // Separate horizontally. A dead-on vertical stack (dx≈0) has no preferred side,
          // so nudge deterministically by index (j>i ⇒ a left, b right) to break the tie.
          const dir = dx !== 0 ? (dx < 0 ? -1 : 1) : -1;
          const push = (ox / 2) * dir;
          a.x -= push;
          b.x += push;
        } else {
          const dir = dy !== 0 ? (dy < 0 ? -1 : 1) : -1;
          const push = (oy / 2) * dir;
          a.y -= push;
          b.y += push;
        }
      }
    }
    // Re-seat every box off the avoid-rects and back inside the frame after each relaxation
    // pass, so all the constraints settle together (clamp last so on-screen always wins).
    for (const it of items) {
      avoid(it);
      clamp(it);
    }
    if (!moved) break;
  }

  return badges.map((b, i) => {
    const it = items[i];
    return it.x === b.x && it.y === b.y ? b : { ...b, x: it.x, y: it.y };
  });
}
