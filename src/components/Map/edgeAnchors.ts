// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Screen-space anchors for the ACG line labels: instead of repeating the glyph +
// angle code down each line, we drop a colored badge where the line exits the
// viewport (both ends). MapLibre has no "label at the viewport edge" placement,
// so we project each line and intersect it with the (inset) screen rect on every
// map move. ACG lines — the planets' (computeLineBadges) and, since 2026-10-01, the
// catalog minor bodies' (computeMinorBadges), which find their ends the same way — while
// the parans (paranChips.ts) and local space (Map.tsx) place their own labels, all through
// the same occupancy (chipOccupancy.ts).
import type { Map as MlMap } from 'maplibre-gl';
import type { Feature, LineString } from 'geojson';
import type { AspectKind } from '../../lib/astro/angleAspects';
import type { LineProps, LineType } from '../../lib/astro/lines';
import type { MinorLineProps } from '../../lib/astro/minorLines';
import type { MinorBodyId } from '../../lib/minorBodies/ids';
import { NODE_NAMES, type PlanetName } from '../../lib/ephemeris';
import { isOccluded } from '../../lib/mapProjection';
import {
  CHIP_RANK,
  OBSTACLE_GAP,
  placeOnPath,
  type AvoidRect,
  type ChipOccupancy,
} from './chipOccupancy';

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
  /** Where it stacks among all the map's labels (chipStack, set by dodgeBadges): where two still
   *  meet, the higher draws on top — the more important one by CHIP_RANK. */
  z?: number;
}

// The edge chip of a CATALOG minor body's line (lib/astro/minorLines). A type of its own rather
// than a LineBadge, because a catalog line has no `planet` and a LineBadge is read through
// PlanetName-keyed tables at every turn (glyphs, colours, zenith lookups, ranks); a catalog chip
// that carried one would reach them with an id they can't decorate — the same reason the features
// themselves carry none. Named by its list key and name instead; how it is drawn is Map.tsx's.
export interface MinorBadge {
  key: string;
  x: number;
  y: number;
  color: string;
  /** The body's id (`mp:433`, `hyp:42`) — its zenith coin's key too. */
  body: MinorBodyId;
  /** Its list key: an MPC number, or a hypothetical point's reserved negative key. */
  n: number;
  /** Its display name as the line carries it ('' when the catalog knows none). */
  name: string;
  lineType: LineType;
  /** Overlay/promoted tag, as on the planets' chips (unused while catalog bodies are natal-only). */
  prefix: string;
  /** Its line in screen space (the longest visible run), which the chip slides along. */
  line?: { x: number; y: number }[];
  /** Where it stacks among all the map's labels (chipStack, set by placeMinorChips). */
  z?: number;
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

// One logical line's labelled ends: `meta` is what its chips display (LineMeta for a planet's
// line, the body for a catalog line), the same for both ends.
interface LineGroup<M> {
  meta: M;
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
function addRunEnds<M>(
  pts: Pt[],
  rect: Rect,
  groups: Map<string, LineGroup<M>>,
  key: string,
  meta: M,
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
    g = { meta, bestEnds: [], bestExtent: -1, bestLine: [] };
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
  const groups = lineEndGroups(map, features, inset, (p) => {
    const { planet, lineType, color, tag, pair = false, aspect, branch, planetB, targetLng, targetLat } = p;
    // Display prefix comes from the line's tag (set by tagLabels for overlay AND
    // promoted lines), independent of the isOverlay routing flag below.
    const prefix = tag ?? '';
    // aspect/planetB join the key so each aspect or midpoint line labels its own
    // ends — they all share a planet + lineType within one body's set. `branch`
    // separates an aspect's two same-label sides (e.g. both trine-MC meridians);
    // targetLng separates the two same-branch lines an in-mundo aspect draws for
    // its +a and −a points (the two square-MC meridians at different longitudes).
    const key = `${planet}|${lineType}|${prefix}|${aspect ?? ''}|${branch ?? ''}|${planetB ?? ''}|${targetLng ?? ''}`;
    const meta: LineMeta = {
      color, planet, lineType, prefix, pair, aspect, branch, planetB, targetLng, targetLat,
    };
    return { key, meta };
  });

  const out: LineBadge[] = [];
  let gi = 0;
  groups.forEach(({ meta: g, bestEnds, bestLine }) => {
    bestEnds.forEach((pt, ei) => {
      out.push({
        key: `${keyNs}-${gi}-${ei}`,
        x: pt.x,
        y: pt.y,
        color: g.color,
        planet: g.planet,
        lineType: g.lineType,
        prefix: g.prefix,
        overlay: isOverlay,
        line: bestLine,
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

// The catalog minor bodies' edge chips: the same two ends of each line's longest on-screen
// run as a planet's (lineEndGroups), one chip per end, keyed by body and angle. Every feature
// the map is handed is a body the reader has switched on and that is drawn — a body hidden in
// the Minor bodies window, or all of them behind its Hide all, has no features (App's
// minorNumbers), so it has no chip either, without a test here.
export function computeMinorBadges(
  map: MlMap,
  features: Feature<LineString, MinorLineProps>[],
  inset: number,
): MinorBadge[] {
  const groups = lineEndGroups(map, features, inset, (p) => ({
    key: `${p.body}|${p.lineType}|${p.tag ?? ''}`,
    meta: p,
  }));
  const out: MinorBadge[] = [];
  let gi = 0;
  groups.forEach(({ meta: p, bestEnds, bestLine }) => {
    bestEnds.forEach((pt, ei) => {
      out.push({
        key: `mp-${gi}-${ei}`,
        x: pt.x,
        y: pt.y,
        color: p.color,
        body: p.body,
        n: p.number,
        name: p.name,
        lineType: p.lineType,
        prefix: p.tag ?? '',
        line: bestLine,
      });
    });
    gi++;
  });
  return out;
}

// The Mercator y of a latitude, up to the scale and offset the flat map's projection applies.
function mercatorY(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
}

// Each logical line's ends on screen (`keyMeta` names the line, and says what its chips carry):
// the projection both kinds of edge chip share.
function lineEndGroups<P, M>(
  map: MlMap,
  features: Feature<LineString, P>[],
  inset: number,
  keyMeta: (p: P) => { key: string; meta: M },
): Map<string, LineGroup<M>> {
  const groups = new Map<string, LineGroup<M>>();
  const container = map.getContainer();
  const w = container.clientWidth;
  const h = container.clientHeight;
  const rect: Rect = { minX: inset, minY: inset, maxX: w - inset, maxY: h - inset };
  if (rect.maxX <= rect.minX || rect.maxY <= rect.minY) return groups;

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
  // On the flat map at rest — north up and unpitched, as applyProjection holds it (and tested
  // here, since MapLibre's keyboard handler can still turn it) — a screen point is an affine
  // function of the longitude and of the Mercator y of the latitude, so three projections fix it
  // for every vertex. map.project per vertex was the bulk of a settle and allocates a point each:
  // 3.2 ms for the 22,000 vertices of 368 lines (transits, the aspect lines and 12 catalog bodies
  // at 1440×810), against 1.6 ms for this, which agrees with it to 1e-10 px (measured 2026-10-02).
  let affine: { kx: number; x0: number; ky: number; y0: number } | null = null;
  if (isFlat && map.getBearing() === 0 && map.getPitch() === 0) {
    const a = map.project([centerLng, 0]);
    const b = map.project([centerLng + 360, 0]);
    const c = map.project([centerLng, 60]);
    const kx = (b.x - a.x) / 360;
    const ky = (c.y - a.y) / (mercatorY(60) - mercatorY(0));
    if (Number.isFinite(kx) && Number.isFinite(ky) && kx !== 0 && ky !== 0) {
      affine = { kx, x0: a.x - kx * centerLng, ky, y0: a.y - ky * mercatorY(0) };
    }
  }

  features.forEach((f) => {
    const coords = f.geometry.coordinates;
    if (coords.length < 2) return;
    // Lines are dense polylines (horizon curves at 0.5° steps, meridians at 2°);
    // every 3rd point is plenty to find edge crossings and keeps the per-move cost
    // low. Anything short (a stray fragment) is walked point-by-point.
    const step = coords.length > 20 ? 3 : 1;
    const { key, meta } = keyMeta(f.properties);

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
      // Nothing is occluded on the flat map (MapLibre's own test is a constant `false` there),
      // so it isn't asked: it allocates per vertex, and this runs for every vertex of every line
      // at each settle — hundreds of lines with the aspect lines on.
      if (!isFlat && isOccluded(map, lng, c[1])) {
        flushRun();
        return;
      }
      const p = affine
        ? { x: affine.x0 + affine.kx * lng, y: affine.y0 + affine.ky * mercatorY(c[1]) }
        : map.project([lng, c[1]]);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        flushRun();
        return;
      }
      // A re-wrapped segment that jumps a whole world straddles the seam at centerLng±180:
      // break the run there so clipSeg never sees a spurious full-width segment.
      const prev = run.length ? run[run.length - 1] : null;
      if (prev && Math.abs(p.x - prev.x) > worldPx / 2) flushRun();
      run.push(affine ? p : { x: p.x, y: p.y });
    };

    for (let i = 0; i < coords.length; i += step) pushCoord(coords[i]);
    pushCoord(coords[coords.length - 1]); // ensure the true last coord is included
    flushRun();
  });

  return groups;
}

// Which rank of label an edge chip is (CHIP_RANK): the chart's own bodies, an overlay's, the
// lunar nodes (either), or the aspect / midpoint lines. By the render path, not the prefix: a
// promoted overlay is drawn AS the chart and ranks as it.
const NODES = new Set<PlanetName>(NODE_NAMES);
export function edgeChipRank(b: LineBadge): number {
  if (b.aspect || b.planetB) return CHIP_RANK.aspect;
  if (b.pair || NODES.has(b.planet)) return CHIP_RANK.node;
  return b.overlay ? CHIP_RANK.overlay : CHIP_RANK.natal;
}

// Place each line badge ON its line, fully on screen, clear of the HUD panels and the tapped
// markers, and clear of the labels placed before it. The anchor from computeLineBadges sits where
// the line meets the (inset) viewport — often right at the edge, or behind a panel like the
// bottom timeline / minimap. Rather than clamp x and y independently or shove the badge
// PERPENDICULAR off the panel (both DETACH the label from an angled/curved line, because the
// line has moved by the time you arrive at the clamped spot), we slide ALONG the line to the
// nearest projected point that's a valid badge spot (placeOnPath). A label therefore always sits
// on its own line, so it's unambiguous which line it belongs to.
//
// Since 2026-10-01 (Salvatore, #33) "valid" includes the other labels. Before, this tested the
// panels only, and the chip-vs-chip pass ran just while Capture was armed (spreadBadges below),
// on the reasoning that the live map lets you pan to tell stacked labels apart. Panning doesn't:
// close meridians stay close at every pan, and "nearest clear point" sent every line converging
// on the Transits bar to the same row above it — measured at 1440×810 with transits on, 22 chip
// pairs overlapping on a settled map, 808 with the aspect lines on. So the chips are placed
// greedily in the fixed order of CHIP_RANK (stable within a rank: the input order, which is the
// line order), each consulting the shared occupancy, and each sliding at most CHIP_SLIDE_CAP
// along its own line to find room. Past that it overlaps, at the least-covered spot within the
// cap, and its stacking value puts the more important chip on top. The live map never moves a
// chip OFF its line to make room — that stays a Capture-only step, for a still that can't be
// panned.
//
// Sizes are the chips' real rendered boxes (`sizeOf`; Map.tsx measures them once per face and
// caches them), not the generous 64 × 22 estimate this used to apply to every chip, so chips
// pack as tightly as they look. Returns the badges in their INPUT order (the render order), each
// with its x/y and its stacking value `z` — less any of the call's ranks that found nowhere on
// its line (below); every placed box joins `occ`, so a kind placed after these steps off them too.
//
// A line with NO spot on its visible run clear of the panels — the run hides behind them, or what
// shows of it is shorter than the chip — gets the catalog chips' pierce rule first (placeOnLine
// below): held wholly on screen, clear of the panels, with its own line still running through the
// pill. Failing that, the old axis clamp: pushed square off the panel it sits under, then onto the
// screen, which for a meridian whose end hides under the nav is a slide down its own line, to sit
// partly under the next panel down where there is no room between the two. That is kept only where
// its own line still runs through the pill and its centre isn't under a panel; otherwise the line
// gets no chip, and is left out of what this returns. Until 2026-10-02 the clamp was kept wherever
// it landed, and that is the step that left labels OFF their lines: measured that day before the
// change, 4 of 58 chips at 1440×810 with transits (up to 246 px off), 10 of 46 on a 432×768 phone
// (up to 363 px), 28 of 252 and 42 of 190 with the aspect lines — against Salvatore's ruling of
// 2026-10-01 that a live chip always sits on its own line, and the one label kind still breaking it
// (the parans, Local Space and the catalog chips already drop one with nowhere to go). Now none is
// off its line, and the lines left with no chip at all had 7–101 px of themselves showing outside
// the panels in the same views (1–14 lines a view); a chip hundreds of px from that names a line
// the reader can't find, or the wrong one where the palette repeats. Such a line is still named by
// hover and the tap card.
//
// `minRank`–`maxRank` limit a call to the chips of those ranks, passing the rest through as they
// are: a kind that ranks BETWEEN two edge ranks is placed between two calls — the Local Space chips
// after an overlay's and before the nodes, the paran chips after the nodes and before the aspect
// lines (both 2026-10-01) — so the occupancy still sees every label in CHIP_RANK order.
export function dodgeBadges(
  badges: LineBadge[],
  occ: ChipOccupancy,
  sizeOf: (b: LineBadge) => BadgeSize,
  inset: number,
  minRank: number = CHIP_RANK.natal,
  maxRank: number = CHIP_RANK.catalog,
): LineBadge[] {
  const ranks = badges.map(edgeChipRank);
  const order = badges
    .map((_, i) => i)
    .filter((i) => ranks[i] >= minRank && ranks[i] <= maxRank)
    .sort((a, b) => ranks[a] - ranks[b] || a - b);
  const { w, h, obstacles } = occ;
  const out: (LineBadge | null)[] = badges.slice();
  for (const i of order) {
    const b = badges[i];
    const { hw, hh } = sizeOf(b);
    const path = b.line?.length ? b.line : [b];
    let spot = placeOnLine(occ, path, b, hw, hh, inset, EDGE_PIERCE);
    if (!spot) {
      // The old axis clamp: push perpendicular off any overlapping panel toward the screen
      // interior, then clamp on screen. (A viewport too small to hold the chip at all just
      // centres it.) Kept only if the chip is still on its own line there, and not centred under
      // a panel — the push clears only the panel the chip started under, and a chip that has slid
      // down a meridian into the next one is hidden there, a label for no one.
      let x = b.x;
      let y = b.y;
      const onTop = y <= inset + 1;
      const onBottom = y >= h - inset - 1;
      const onLeft = x <= inset + 1;
      const onRight = x >= w - inset - 1;
      for (const r of obstacles) {
        const hit = x + hw > r.left && x - hw < r.right && y + hh > r.top && y - hh < r.bottom;
        if (!hit) continue;
        if (onTop) y = Math.max(y, r.bottom + hh + OBSTACLE_GAP);
        else if (onBottom) y = Math.min(y, r.top - hh - OBSTACLE_GAP);
        else if (onLeft) x = Math.max(x, r.right + hw + OBSTACLE_GAP);
        else if (onRight) x = Math.min(x, r.left - hw - OBSTACLE_GAP);
        else y = Math.max(y, r.bottom + hh + OBSTACLE_GAP);
      }
      const minX = inset + hw;
      const maxX = w - inset - hw;
      const minY = inset + hh;
      const maxY = h - inset - hh;
      x = minX <= maxX ? Math.min(Math.max(x, minX), maxX) : w / 2;
      y = minY <= maxY ? Math.min(Math.max(y, minY), maxY) : h / 2;
      const hidden = obstacles.some((r) => x > r.left && x < r.right && y > r.top && y < r.bottom);
      if (!hidden && crossesBox(path, x, y, hw, hh)) spot = { x, y };
    }
    out[i] = spot
      ? { ...b, x: spot.x, y: spot.y, z: occ.add(spot.x, spot.y, hw, hh, ranks[i]) }
      : null;
  }
  return out.filter((b): b is LineBadge => b !== null);
}

// Does the polyline run through the box of half-extents hw × hh centred on (cx, cy)? The test for a
// chip being on its own line, wherever it sits along it.
function crossesBox(path: readonly Pt[], cx: number, cy: number, hw: number, hh: number): boolean {
  const r: Rect = { minX: cx - hw, minY: cy - hh, maxX: cx + hw, maxY: cy + hh };
  if (path.length === 1) return inRect(path[0], r);
  for (let i = 0; i + 1 < path.length; i++) if (clipSeg(path[i], path[i + 1], r)) return true;
  return false;
}

// Where a chip goes ON its own line (`path`), or null for nowhere: placeOnPath's spot, or — when
// the line has no stretch where the whole chip fits clear of the panels and markers — the pierce
// rule. The commonest case is a line too near a SIDE of the screen for the chip to centre on it (a
// meridian 20 px in from the edge, under a 53 px chip held 16 px inside it). There the chip is
// placed as one `pierce` px either side of the line would be, then pulled wholly onto the screen:
// that moves it at most hw − pierce, so its own line still runs through the pill at least
// `pierce` px in from its end, and the chip is still ON its line, as the live map requires, though
// not centred. Only where that whole pill is clear of the panels and markers. Each width in
// `pierce` is tried in turn, the widest (most nearly centred) first.
//
// PIERCE_HW is the catalog chips' (placeMinorChips): through the mark at a catalog chip's left
// end. A planet's chip, half the width, goes on to 3 px (EDGE_PIERCE), the line just inside the
// pill, before dodgeBadges falls back on the old clamp.
const PIERCE_HW = 12;
const EDGE_PIERCE = [PIERCE_HW, 3];
function placeOnLine(
  occ: ChipOccupancy,
  path: readonly { x: number; y: number }[],
  anchor: { x: number; y: number },
  hw: number,
  hh: number,
  inset: number,
  pierce: readonly number[],
): { x: number; y: number } | null {
  const spot = placeOnPath(occ, path, anchor, hw, hh, inset);
  if (spot) return spot;
  const { w, h } = occ;
  if (w - 2 * inset < 2 * hw || h - 2 * inset < 2 * hh) return null;
  for (const p of pierce) {
    if (!(hw > p)) continue;
    const narrow = placeOnPath(occ, path, anchor, p, hh, inset);
    if (!narrow) continue;
    const x = Math.min(Math.max(narrow.x, inset + hw), w - inset - hw);
    const y = Math.min(Math.max(narrow.y, inset + hh), h - inset - hh);
    if (!occ.blocked(x, y, hw, hh)) return { x, y };
  }
  return null;
}

// Place the catalog minor bodies' chips — last of every label, CHIP_RANK.catalog — ON their own
// lines, by the same placeOnPath an edge chip uses: the nearest spot clear of the panels and the
// tapped markers, then room among the labels already placed within CHIP_SLIDE_CAP, then, past the
// cap, overlapping under them. Returns only the chips that found a spot, in input order (the line
// order: the reader's list order, then MC, IC, ASC, DSC), each with its stacking value `z`.
//
// A chip with NO panel-clear spot anywhere on the visible run is not drawn — as a planet's isn't
// either, since 2026-10-02 (dodgeBadges). It is the least important label on the map, named on its
// line by its coin beads and by hover and the tap card wherever the chip isn't (#34); and a chip
// pushed off its line is the one that could name the wrong body, since the palette repeats.
//
// Short of that, a line too near a SIDE of the screen for the chip to centre on it is caught by
// the pierce rule (placeOnLine), at PIERCE_HW only: the line runs through the pill at least 12 px
// in from its end, through the mark. A catalog chip is 80–100 px wide against a planet's 31–53, so
// a meridian within about 60 px of either side had nowhere to centre one — measured 2026-10-01, 6
// of the 13 catalog lines on a 432 px phone, and Eris's MC 43 px in from a desktop's left edge.
//
// The projected line is the placement's alone, so it is left off what this returns: the chips then
// compare equal field by field whenever a settle lands them where they were, and the map keeps the
// list it already has rather than re-rendering for nothing.
const CATALOG_PIERCE = [PIERCE_HW];
export function placeMinorChips<T extends MinorBadge>(
  badges: T[],
  occ: ChipOccupancy,
  sizeOf: (b: T) => BadgeSize,
  inset: number,
): T[] {
  const out: T[] = [];
  for (const b of badges) {
    const { hw, hh } = sizeOf(b);
    const spot = placeOnLine(occ, b.line?.length ? b.line : [b], b, hw, hh, inset, CATALOG_PIERCE);
    if (!spot) continue;
    const z = occ.add(spot.x, spot.y, hw, hh, CHIP_RANK.catalog);
    out.push({ ...b, line: undefined, x: spot.x, y: spot.y, z });
  }
  return out;
}

// Half-extents (px) of a badge's rendered box.
export interface BadgeSize {
  hw: number;
  hh: number;
}

// Spread the edge labels apart so they don't overlap, letting them drift OFF their lines to do
// it — used ONLY while the Capture frame is armed, as the last pass after dodgeBadges. The paran
// chips go through it with them since 2026-10-01 (#23: they were left out, so a still kept every
// paran overlap), and the catalog minor bodies' chips since they were added the same day (#34);
// it reads only a label's position and size, so it takes any kind.
//
// The recorded decision here was, until 2026-10-01, that the live map needs no chip-vs-chip pass
// at all because it lets you pan to tell stacked labels apart. Salvatore reversed it that day
// (#33): panning doesn't separate close meridians or a funnel of lines into one bottom row, so
// the live map is now collision-aware too — in dodgeBadges, through the shared occupancy, and
// strictly ALONG each label's own line (capped; past the cap, overlapping with the more important
// label on top). What stays Capture-only is this pass's licence to move a label off its line:
// on the live map a label must always sit on the line it names, while a still that can't be
// panned or hovered is better served by a legible label a few px off its exit point than by two
// it has to guess between. So dodgeBadges' result is the start, and the relaxation below only
// has the overlaps the slide cap left to deal with: a few passes of AABB separation push each
// overlapping pair apart along its axis of least overlap, and after every pass each label is
// re-seated inside the frame and off the avoid-rects (the on-map attribution and the markers the
// export stamps over the labels). When the frame is too crowded to separate everything, residual
// overlap is tolerated — the relaxation simply doesn't fully converge — rather than shoving
// labels out of the shot.
//
// `sizeOf` gives each badge's rendered box — the same per-face sizes the live placement uses
// (measured once per face, an estimate until then, corrected on the next recompute). Because the
// sizes are intrinsic (content-, not position-, dependent) and the anchors derive only from the
// camera, the result is a fixed point: a settled camera re-spreads to the identical layout, so
// there's no measure→resize feedback.
//
// `axisOf` says which way each label may move (all of them, both ways, if it is left out). A
// paran chip is the one kind that may not leave its line even here (2026-10-02). The rows are a
// few px apart, so a chip moved across them sits on another row and names the wrong paran in a
// still that can't be hovered. With every visible row chipped again (L83's revert) the spread
// moved 78 of 84 paran chips off their rows, by up to 82 px. So on the flat map, whose rows are
// horizontal (always north-up), a paran chip moves sideways only ('x'). On the globe, whose rows
// curve, it stays where the live placement put it ('none'), and the labels around it move round
// it. A pair where neither can move along an axis isn't separated along it, and one where only
// one can moves that one the whole way.
export function spreadBadges<T extends { x: number; y: number }>(
  badges: T[],
  sizeOf: (b: T) => BadgeSize,
  rects: readonly AvoidRect[],
  w: number,
  h: number,
  inset: number,
  axisOf?: (b: T) => 'xy' | 'x' | 'none',
): T[] {
  if (badges.length < 2) return badges;
  const GAP = 4; // clear gap kept between two label boxes (and off the avoid-rects)
  const ITERATIONS = 24;

  const items = badges.map((b) => {
    const s = sizeOf(b);
    const axis = axisOf?.(b) ?? 'xy';
    // How freely it moves along x and along y: 1 or 0.
    return { x: b.x, y: b.y, hw: s.hw, hh: s.hh, mx: axis === 'none' ? 0 : 1, my: axis === 'xy' ? 1 : 0 };
  });
  type Item = (typeof items)[number];

  // Keep a box's centre inside the safe rect, accounting for its own extents. A box wider
  // or taller than the frame just centres on that axis (best effort). Only along the axes the
  // box may move: a paran chip is already wholly inside, where the live placement put it.
  const clamp = (it: Item) => {
    const minX = inset + it.hw;
    const maxX = w - inset - it.hw;
    const minY = inset + it.hh;
    const maxY = h - inset - it.hh;
    if (it.mx) it.x = minX <= maxX ? Math.min(Math.max(it.x, minX), maxX) : w / 2;
    if (it.my) it.y = minY <= maxY ? Math.min(Math.max(it.y, minY), maxY) : h / 2;
  };

  // Push a box clear of any avoid-rect (the on-map attribution) along its least-penetration
  // axis, so a spread label never lands on the credits — the one panel still in the export.
  // A box that may only move sideways goes sideways.
  const avoid = (it: Item) => {
    if (!it.mx && !it.my) return;
    for (const r of rects) {
      const penX = it.hw + GAP + (r.right - r.left) / 2 - Math.abs(it.x - (r.left + r.right) / 2);
      const penY = it.hh + GAP + (r.bottom - r.top) / 2 - Math.abs(it.y - (r.top + r.bottom) / 2);
      if (penX <= 0 || penY <= 0) continue;
      if (it.mx && (penX < penY || !it.my)) it.x += it.x < (r.left + r.right) / 2 ? -penX : penX;
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
        const sx = a.mx + b.mx;
        const sy = a.my + b.my;
        if (!sx && !sy) continue;
        moved = true;
        if (sx && (ox < oy || !sy)) {
          // Separate horizontally. A dead-on vertical stack (dx≈0) has no preferred side,
          // so nudge deterministically by index (j>i ⇒ a left, b right) to break the tie.
          const dir = dx !== 0 ? (dx < 0 ? -1 : 1) : -1;
          const push = ox * dir;
          a.x -= (push * a.mx) / sx;
          b.x += (push * b.mx) / sx;
        } else {
          const dir = dy !== 0 ? (dy < 0 ? -1 : 1) : -1;
          const push = oy * dir;
          a.y -= (push * a.my) / sy;
          b.y += (push * b.my) / sy;
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
