// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The geodetic grid: the zodiac laid on the Earth as a place's own angles — twelve
// MC meridians at 30° intervals and twelve Ascendant curves at 0° of each sign. It
// reads NO chart state: no positions, no moment, no house system, and no Swiss call
// (the obliquity is J2000's), so it draws the same with or without a chart loaded.
// verify-geodetic G0 builds it before the engine is initialised, which is what holds
// that to be true rather than intended.
//
// Everything here that names a place's sign — the hover readout, which MC zone a place is
// in, the Ascendant zone the hover highlights — goes through ONE rule, truncZodiac
// (format.ts), so the sign a readout names is the zone's sign by construction
// (verify-geodetic G5, G10). Polygon geometry is only what the map FILLS; it is never asked
// which zone a point is in — the hover asks the readout, and lights that sign's feature.
// (2026-10-02)
import type { Feature, FeatureCollection, LineString, MultiPolygon, Polygon, Position } from 'geojson';
import { EPS_J2000, eclipticToRaDec, geodeticAngles, type GeodeticAngles } from '../ephemeris';
import { canonicalLng } from '../coordFormat';
import { DEC_EPS, meridianCoords, meridianLngFor, normLng, traceHorizonCoords } from './lines';
import { TRUNC_SNAP_ARCSEC, truncZodiac, type TruncZodiac } from './format';
import { signElement, signModality, type Element, type Modality } from './dignities';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Every place whose geodetic Ascendant is ecliptic degree `lonDeg`, south→north,
 * as the map draws it. A planet's rising line for a body at that degree with ecliptic
 * latitude 0, traced through the geodetic meridian mapping — so the curve and the
 * place readout (geodeticAngles) are two independent parts that must agree, and
 * verify-geodetic §8 requires that they do.
 *
 * Each curve ends where its degree stops rising, at latitude ±(90° − |declination|):
 * the polar circles for 0° Cancer and 0° Capricorn, further for the rest, never cut
 * short. 0° Aries and 0° Libra have declination 0, so their curves are whole
 * meridians (90°W and 90°E); the tracer's near-zero branch stops them at ±85°, the
 * planet lines' clip, so they are run on to ±90 here — the map's edge, the same
 * extent as the grid's MC meridians. The extension is exact only at declination 0,
 * the only degrees the grid draws on that branch; any other degree that near an
 * equinox turns beyond 87°, past the Web-Mercator edge (85.05°), so there it stands
 * in for an arc no map shows.
 */
export function geodeticAscCurve(lonDeg: number, eps: number = EPS_J2000): [number, number][] {
  const p = eclipticToRaDec(lonDeg * DEG2RAD, 0, eps);
  const curve = traceHorizonCoords(p, meridianLngFor('geodetic', eps, 0), 'ASC');
  if (Math.abs(Math.tan(p.dec)) >= DEC_EPS || curve.length === 0) return curve;
  return [[curve[0][0], -90], ...curve, [curve[curve.length - 1][0], 90]];
}

/** What a grid line carries. Deliberately NO `planet`: the edge chips, the crossings, the
 *  orb bands and the hit/snap lists all key on one, so a grid line can never be taken
 *  for a body's line by any of them. */
export interface GeoGridLineProps {
  kind: 'mc' | 'asc';
  /** 0 (Aries) … 11 (Pisces): the sign that begins on this line. */
  sign: number;
}

/** One MC zone's fill. No hover state: the hover lights the ASCENDANT zone under the cursor
 *  (geoAscZones below) — an MC zone is a plain band of longitude the shading already shows. */
export interface GeoZoneProps {
  sign: number;
  element: Element;
  modality: Modality;
  color: string;
  opacity: number;
}

/** The legend's "show only this group": one element or one modality, or none. Transient —
 *  a stored isolate would bring a map back next session with most zones blank and nothing
 *  on screen to attribute that to. */
export type GeoZoneIsolate =
  | { kind: 'element'; value: Element }
  | { kind: 'modality'; value: Modality }
  | null;

/** Per element, the three modality shades: cardinal (darkest), fixed, mutable (lightest). */
export type GeoZoneColors = Record<Element, readonly [string, string, string]>;

// The latitude beyond which some degrees never rise: 90° − ε at J2000, 66°33′39″. The
// readout's polar caution is keyed to it — the grid's obliquity, not the map's fixed 66.5°.
export const POLAR_CIRCLE_J2000_DEG = 90 - EPS_J2000 * RAD2DEG;

// Zone shading in use (about 12%) and for showing someone else (about 50%) — a switch,
// not a slider.
export const GEO_ZONE_OPACITY = { normal: 0.12, presentation: 0.5 } as const;

/** A sign's Ascendant zone as a feature-state id: 1 … 12. Never 0 — a falsy id is the case
 *  MapLibre reads as "no id" on some paths, and Aries would never highlight. */
export const geoZoneId = (sign: number): number => sign + 1;

// The readout leaves the Ascendant out within this of a pole, where it is undefined: every
// direction there is south (or north), and the closed form returns whatever the float says.
const AS_UNDEFINED_LAT = 89.99;
// Ring densification: the straight zone edges get a vertex every this many degrees, so the
// globe can bend them onto its surface and the tiler (tolerance 0) has real vertices to keep.
const RING_STEP_DEG = 2;

export interface GeoGrid {
  /** Twelve MC meridians at normLng(30k), −90…90 (0° Libra on +180). */
  mc: FeatureCollection<LineString, GeoGridLineProps>;
  /** Twelve Ascendant curves: feature k is geodeticAscCurve(30k), as drawn. */
  asc: FeatureCollection<LineString, GeoGridLineProps>;
  /** The band-centre meridians (15° into each sign) — where an MC band's label goes. Never drawn. */
  mcLabelLines: FeatureCollection<LineString, GeoGridLineProps>;
  /** Where Ascendant curve k crosses the equator, [lng, 0]. */
  ascEquator: readonly (readonly [number, number])[];
  /** MC zone k as one closed counter-clockwise ring, densified, closed at ±90. */
  zoneRings: readonly (readonly [number, number])[][];
}

function lineFeature(
  coordinates: [number, number][],
  kind: 'mc' | 'asc',
  sign: number,
): Feature<LineString, GeoGridLineProps> {
  return { type: 'Feature', properties: { kind, sign }, geometry: { type: 'LineString', coordinates } };
}

// West edge of zone k: 30k, folded so Libra runs −180…−150 and Pisces −30…0 — every ring
// inside −180…180, which is inside the tiler's one-world fold either way.
function zoneWest(k: number): number {
  const w = 30 * k;
  return w >= 180 ? w - 360 : w;
}

// Closed CCW: bottom edge west→east at −90, east edge south→north, top edge east→west at
// +90, west edge north→south, then the first vertex again. Closed at ±90, not at the tiler's
// 85.05° clamp, for the night shade's reason (nightShade.ts POLE_LAT): a ring closed short of
// the pole left an unshaded disc over the polar cap on the globe.
function zoneRing(k: number): [number, number][] {
  const w = zoneWest(k);
  const e = w + 30;
  const ring: [number, number][] = [];
  for (let x = w; x < e; x += RING_STEP_DEG) ring.push([x, -90]);
  for (let y = -90; y < 90; y += RING_STEP_DEG) ring.push([e, y]);
  for (let x = e; x > w; x -= RING_STEP_DEG) ring.push([x, 90]);
  for (let y = 90; y > -90; y -= RING_STEP_DEG) ring.push([w, y]);
  ring.push([w, -90]);
  return ring;
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

let built: GeoGrid | null = null;

/**
 * The grid, built on first call and frozen — the SAME object every call after, for the
 * life of the page. The map's push skips a source whose collection has the identity it
 * had last time (Map.tsx pushData), so a constant grid is tiled once, not on every render.
 */
export function geoGrid(): GeoGrid {
  if (built) return built;
  // The grid's own meridian mapping: the geodetic one, at J2000. GMST is unread there.
  const gridLng = meridianLngFor('geodetic', EPS_J2000, 0);
  const mc: Feature<LineString, GeoGridLineProps>[] = [];
  const asc: Feature<LineString, GeoGridLineProps>[] = [];
  const labels: Feature<LineString, GeoGridLineProps>[] = [];
  const equator: (readonly [number, number])[] = [];
  const rings: [number, number][][] = [];
  for (let k = 0; k < 12; k++) {
    // The meridians run on past meridianCoords' ±85 to the map edge, like the zone rings.
    const L = normLng(30 * k);
    mc.push(lineFeature([[L, -90], ...meridianCoords(L), [L, 90]], 'mc', k));
    asc.push(lineFeature(geodeticAscCurve(30 * k), 'asc', k));
    labels.push(lineFeature(meridianCoords(normLng(30 * k + 15)), 'mc', k));
    // Curve k crosses the equator at hour angle −90° (the ASC side): lat(H) = 0 there,
    // on both of the tracer's branches.
    const ra = eclipticToRaDec(30 * k * DEG2RAD, 0, EPS_J2000).ra;
    equator.push([normLng(gridLng(ra - Math.PI / 2)), 0]);
    rings.push(zoneRing(k));
  }
  built = deepFreeze<GeoGrid>({
    mc: { type: 'FeatureCollection', features: mc },
    asc: { type: 'FeatureCollection', features: asc },
    mcLabelLines: { type: 'FeatureCollection', features: labels },
    ascEquator: equator,
    zoneRings: rings,
  });
  return built;
}

/**
 * The twelve MC zones as fills, in the given palette at opacity `base`. A zone outside the
 * isolated group stays in the collection at opacity 0, so feature k is always sign k's zone
 * whatever the legend shows.
 */
export function buildGeoZones(
  colors: GeoZoneColors,
  base: number,
  isolate: GeoZoneIsolate,
): FeatureCollection<Polygon, GeoZoneProps> {
  const { zoneRings } = geoGrid();
  const features = zoneRings.map((ring, k): Feature<Polygon, GeoZoneProps> => {
    const element = signElement(k);
    const modality = signModality(k);
    const shown =
      !isolate || (isolate.kind === 'element' ? element === isolate.value : modality === isolate.value);
    return {
      type: 'Feature',
      properties: {
        sign: k,
        element,
        modality,
        color: colors[element][k % 3],
        opacity: shown ? base : 0,
      },
      geometry: { type: 'Polygon', coordinates: [ring.map(([x, y]) => [x, y])] },
    };
  });
  return { type: 'FeatureCollection', features };
}

/** What the hover readout says about a place: its geodetic AS and MC to the minute. */
export interface GeoReadoutAngles {
  /** Null within 0.01° of a pole, where the Ascendant is undefined. */
  as: TruncZodiac | null;
  mc: TruncZodiac;
  /** Past the J2000 polar circle (|lat| ≥ 90° − ε), where some degrees never rise. */
  polar: boolean;
}

/**
 * A place's geodetic AS and MC as the readout shows them, truncated to the minute by the one
 * sign rule. J2000 obliquity, like the curves — the readout and the curve it sits on must
 * agree, and a chart's obliquity of date would put them up to a quarter-minute apart. The
 * longitude is folded to its canonical meridian first, so every world copy reads the same
 * float. `mc.signIdx` is ALSO which MC zone the place is in, and `as.signIdx` which
 * Ascendant zone (geoAscZones).
 */
export function geoReadoutAngles(lat: number, lng: number): GeoReadoutAngles {
  const g = readoutFrame(lat, lng);
  return {
    as: Math.abs(lat) > AS_UNDEFINED_LAT ? null : truncZodiac(g.asc, 'min'),
    mc: truncZodiac(g.mc, 'min'),
    polar: Math.abs(lat) >= POLAR_CIRCLE_J2000_DEG,
  };
}

// The readout's frame at a place — J2000, the canonical meridian. One function for the readout
// and the Ascendant zones alike, so the two can never come to read different floats.
function readoutFrame(lat: number, lng: number): GeodeticAngles {
  return geodeticAngles(canonicalLng(lng), lat, EPS_J2000);
}

// ── The Ascendant zones: what the hover highlights ──────────────────────────────────────
// Lina's ruling for the grid: "Ascendant zones are not filled. The zone under the cursor
// highlights on hover and clears when the cursor leaves. Define it as everywhere the readout
// gives the same sign." So a zone is not the strip between two curves — above the polar
// circles that strip is not one sign: the Ascendant runs backward between two jumps of half
// the zodiac, some signs never rise, and at nearly half the crossings the sign a curve begins
// lies to its WEST (verify-geodetic §8(c)). It is the set the readout itself names, built by
// sampling the readout's own sign rule, so its edges are where the readout changes sign and
// nowhere else.
//
// How. Latitude rows, each walked in longitude for the places its sign changes: a smooth
// change is a root of the continuous Ascendant, confirmed by the sign rule either side; a
// jump (the eastern-point swap) is narrowed until it is under 1e-9°. Neighbouring rows whose
// changes match one for one — the same two signs either side, in the same order round the
// circle — are joined by straight edges, once the row halfway between shows the straight
// edge within GEO_ASC_ZONE_TOL_DEG of where the readout really changes; where it isn't, the
// strip is halved. Where the pattern itself changes — six latitudes, ±(90° − |δ|) of the
// degrees 0°, 30° and 60° from a solstice, where those curves end on a jump — the halving runs
// down to 1e-6° and that sliver is split flat between the two patterns, so the zones still
// tile. Joined strips make ribbons; each is cut at ±180° and folded into the world, so every
// ring lies inside −180…180 like the MC zones'. Nothing here reads a chart.
//
// ~0.3 s of arithmetic, so it is never built on the main thread's hot path: buildGeoAscZones
// is resumable, and useGeoAscZones feeds it idle-time slices the first time the readout is
// up. verify-geodetic G0 times it; G10 holds the result to the readout. (2026-10-02)

/** One Ascendant zone: every place whose readout gives sign `sign` as its AS. `zone` is the
 *  feature-state id the hover keys on (geoZoneId, never 0). */
export interface GeoAscZoneProps {
  zone: number;
  sign: number;
}
/** The twelve Ascendant zones, feature k sign k's. */
export type GeoAscZones = FeatureCollection<MultiPolygon, GeoAscZoneProps>;

/** How far, as ground distance in degrees of arc (about 200 m), a zone's straight edge may
 *  stray from where the readout changes sign. */
export const GEO_ASC_ZONE_TOL_DEG = 0.002;

// The base row step; halved where the edges bend, or where the pattern changes.
const ASC_ROW_STEP_DEG = 0.5;
// The longitude samples per row; halved where the Ascendant moves fast or turns.
const ASC_SAMPLE_STEP_DEG = 5;
// Under 30°: a stretch moving one way, and no further than this, crosses one sign boundary at
// most — so a sign change inside it is a single edge to find.
const ASC_SMOOTH_RAD = 20 * DEG2RAD;
// A stretch still moving further than that when it is this narrow is a jump.
const ASC_JUMP_DEG = 1e-9;
// A smooth sign change is placed to within this.
const ASC_EDGE_DEG = 1e-7;
// The step that reads which way the Ascendant is moving.
const ASC_DIR_DEG = 1e-7;
// The thinnest strip: where the pattern changes, it is split flat between the two.
const ASC_STRIP_MIN_DEG = 1e-6;

const wrapPi = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
const wrap180 = (d: number) => d - 360 * Math.round(d / 360);

// One latitude row: where the readout's sign changes, west to east inside (−180, 180), and the
// sign each side of every change. The runs between changes go round the circle, so the run
// after the last change is the one before the first.
interface AscRow {
  y: number;
  x: number[];
  w: number[];
  e: number[];
}

function ascRow(lat: number): AscRow {
  const row: AscRow = { y: lat, x: [], w: [], e: [] };
  const asAt = (lng: number) => readoutFrame(lat, lng).asc;
  const signOf = (asc: number) => truncZodiac(asc, 'min').signIdx;
  const change = (at: number, s0: number, s1: number) => {
    row.x.push(at);
    row.w.push(s0);
    row.e.push(s1);
  };
  // Which way the Ascendant moves just east of a point. It runs backward only between the
  // two jumps inside a polar circle, so a stretch whose ends move different ways holds a
  // jump, however little its ends differ — the backward run can all but cancel the jump.
  const dirs = new Map<number, boolean>();
  const forward = (lng: number, asc: number) => {
    let f = dirs.get(lng);
    if (f === undefined) {
      f = wrapPi(asAt(lng + ASC_DIR_DEG) - asc) >= 0;
      dirs.set(lng, f);
    }
    return f;
  };
  // A smooth sign change between x0 and x1. The seed is where the continuous Ascendant meets
  // the boundary the sign rule changes at (the start of the sign entered, TRUNC_SNAP below
  // it), by regula falsi (Illinois); the sign rule itself then decides, either side of the
  // seed, and bisects the stretch if the seed was off. So the seed only saves time: the edge
  // is wherever the rule says.
  const edge = (x0: number, a0: number, s0: number, x1: number, a1: number, s1: number) => {
    const b = (wrapPi(a1 - a0) > 0 ? s1 : s0) * 30 * DEG2RAD - (TRUNC_SNAP_ARCSEC / 3600) * DEG2RAD;
    let lo = x0;
    let hi = x1;
    let flo = wrapPi(a0 - b);
    let fhi = wrapPi(a1 - b);
    let side = 0;
    let r = (lo + hi) / 2;
    for (let it = 0; it < 40; it++) {
      r = fhi !== flo ? (lo * fhi - hi * flo) / (fhi - flo) : (lo + hi) / 2;
      if (!(r > lo && r < hi)) r = (lo + hi) / 2;
      const fr = wrapPi(asAt(r) - b);
      if (Math.abs(fr) < 1e-13) break;
      if (fr < 0 === flo < 0) {
        lo = r;
        flo = fr;
        if (side < 0) fhi /= 2;
        side = -1;
      } else {
        hi = r;
        fhi = fr;
        if (side > 0) flo /= 2;
        side = 1;
      }
    }
    let l = Math.max(x0, r - ASC_EDGE_DEG / 2);
    let h = Math.min(x1, r + ASC_EDGE_DEG / 2);
    if (signOf(asAt(l)) !== s0 || signOf(asAt(h)) !== s1) {
      l = x0;
      h = x1;
      while (h - l > ASC_EDGE_DEG) {
        const m = (l + h) / 2;
        if (signOf(asAt(m)) === s0) l = m;
        else h = m;
      }
    }
    change((l + h) / 2, s0, s1);
  };
  const walk = (x0: number, a0: number, s0: number, x1: number, a1: number, s1: number): void => {
    if (Math.abs(wrapPi(a1 - a0)) > ASC_SMOOTH_RAD || forward(x0, a0) !== forward(x1, a1)) {
      if (x1 - x0 <= ASC_JUMP_DEG) {
        if (s0 !== s1) change((x0 + x1) / 2, s0, s1);
        return;
      }
      const xm = (x0 + x1) / 2;
      const am = asAt(xm);
      const sm = signOf(am);
      walk(x0, a0, s0, xm, am, sm);
      walk(xm, am, sm, x1, a1, s1);
    } else if (s0 !== s1) {
      edge(x0, a0, s0, x1, a1, s1);
    }
  };
  const n = Math.round(360 / ASC_SAMPLE_STEP_DEG);
  let x0 = -180;
  let a0 = asAt(x0);
  let s0 = signOf(a0);
  for (let i = 1; i <= n; i++) {
    const x1 = i === n ? 180 : -180 + i * ASC_SAMPLE_STEP_DEG;
    const a1 = asAt(x1);
    const s1 = signOf(a1);
    walk(x0, a0, s0, x1, a1, s1);
    x0 = x1;
    a0 = a1;
    s0 = s1;
  }
  return row;
}

// Row B as a continuation of row A: the rotation r taking A's change i to B's change i + r
// (the same two signs either side, so the same edge), and how far each moved, unwrapped. Null
// when the pattern differs, or when a run would have to turn inside out to join them.
function matchRows(A: AscRow, B: AscRow): { r: number; d: number[] } | null {
  const n = A.x.length;
  if (n === 0 || n !== B.x.length) return null;
  let best: { r: number; d: number[] } | null = null;
  let bestMove = Infinity;
  for (let r = 0; r < n; r++) {
    if (B.w[r] !== A.w[0] || B.e[r] !== A.e[0]) continue;
    const d = new Array<number>(n);
    let ok = true;
    let move = 0;
    for (let i = 0; i < n && ok; i++) {
      const j = (i + r) % n;
      if (B.w[j] !== A.w[i] || B.e[j] !== A.e[i]) ok = false;
      else {
        d[i] = wrap180(B.x[j] - A.x[i]);
        move = Math.max(move, Math.abs(d[i]));
      }
    }
    for (let i = 0; i < n && ok; i++) {
      const i1 = (i + 1) % n;
      if (!(A.x[i1] + d[i1] - (A.x[i] + d[i]) + (i1 === 0 ? 360 : 0) > 0)) ok = false;
    }
    if (ok && move < bestMove) {
      best = { r, d };
      bestMove = move;
    }
  }
  return best;
}

/** One run followed up through the rows: its west edge `l` and east edge `r` at each row `y`,
 *  unwrapped — continuous however often an edge crosses ±180°. */
export interface AscRibbon {
  sign: number;
  y: number[];
  l: number[];
  r: number[];
}

/**
 * A ribbon cut at ±180° and folded into the world: for each world copy it touches, the part
 * inside it, as counter-clockwise rings (east edge north, west edge south), pushed onto
 * `out[sign]`. Each strip is split where an edge crosses the copy's bounds, so inside each
 * piece the clipped edges are straight. Exported for scripts/verify-geodetic.ts, which folds
 * made-up ribbons crossing the seam both ways — the zones' own edges need not try every case.
 */
export function foldRibbon({ sign, y, l, r }: AscRibbon, out: Position[][][][]) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = 0; j < y.length; j++) {
    lo = Math.min(lo, l[j]);
    hi = Math.max(hi, r[j]);
  }
  for (let s = Math.floor((lo + 180) / 360); -180 + 360 * s < hi; s++) {
    const a = -180 + 360 * s;
    const b = a + 360;
    let west: Position[] = [];
    let east: Position[] = [];
    const flush = () => {
      if (west.length >= 2) {
        const ring: Position[] = [];
        // A flat edge — a cap at ±89.99°, or a line where the pattern changes — gets a vertex
        // every RING_STEP_DEG like the MC zones' edges, so the globe bends it onto its parallel.
        const add = (p: Position) => {
          const q = ring[ring.length - 1];
          if (q && q[0] === p[0] && q[1] === p[1]) return;
          if (q && q[1] === p[1]) {
            const n = Math.ceil(Math.abs(p[0] - q[0]) / RING_STEP_DEG);
            for (let k = 1; k < n; k++) ring.push([q[0] + ((p[0] - q[0]) * k) / n, p[1]]);
          }
          ring.push(p);
        };
        for (const p of east) add(p);
        for (let i = west.length - 1; i >= 0; i--) add(west[i]);
        if (ring.length >= 3) {
          add([ring[0][0], ring[0][1]]);
          let twice = 0;
          for (let i = 1; i < ring.length; i++) twice += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
          if (ring.length >= 4 && twice > 0) out[sign].push([ring]);
        }
      }
      west = [];
      east = [];
    };
    const lerp = (v: number[], j: number, t: number) =>
      t === 0 ? v[j] : t === 1 ? v[j + 1] : v[j] + (v[j + 1] - v[j]) * t;
    const at = (j: number, t: number) => {
      const yy = lerp(y, j, t);
      west.push([Math.min(Math.max(lerp(l, j, t), a), b) - 360 * s, yy]);
      east.push([Math.min(Math.max(lerp(r, j, t), a), b) - 360 * s, yy]);
    };
    for (let j = 0; j + 1 < y.length; j++) {
      // Most strips lie wholly inside one copy, or wholly outside it.
      const l0 = l[j];
      const l1 = l[j + 1];
      const r0 = r[j];
      const r1 = r[j + 1];
      if (l0 >= a && l1 >= a && r0 <= b && r1 <= b) {
        if (west.length === 0) at(j, 0);
        at(j, 1);
        continue;
      }
      if ((r0 <= a && r1 <= a) || (l0 >= b && l1 >= b)) {
        flush();
        continue;
      }
      const ts = [0, 1];
      for (const [v0, v1] of [[l0, l1], [r0, r1]]) {
        for (const c of [a, b]) if ((v0 - c) * (v1 - c) < 0) ts.push((c - v0) / (v1 - v0));
      }
      ts.sort((p, q) => p - q);
      for (let q = 0; q + 1 < ts.length; q++) {
        const t0 = ts[q];
        const t1 = ts[q + 1];
        if (!(t1 > t0)) continue;
        const tm = (t0 + t1) / 2;
        const lm = l[j] + (l[j + 1] - l[j]) * tm;
        const rm = r[j] + (r[j + 1] - r[j]) * tm;
        if (Math.max(lm, a) < Math.min(rm, b)) {
          if (west.length === 0) at(j, t0);
          at(j, t1);
        } else flush();
      }
    }
    flush();
  }
}

// The whole build, as steps: it yields after every row it computes, every ribbon it folds and
// every zone it freezes — none of them more than a millisecond or two.
type Work = Generator<void, void, void>;
function* ascZoneWork(): Generator<void, GeoAscZones, void> {
  const polys: Position[][][][] = Array.from({ length: 12 }, () => []);
  let open: AscRibbon[] = [];
  let openRow: AscRow | null = null;
  const closeAll = function* (): Work {
    const done = open;
    open = [];
    openRow = null;
    for (const rb of done) {
      foldRibbon(rb, polys);
      yield;
    }
  };
  // A ribbon for every run of `row`, starting at latitude `y`.
  const start = (row: AscRow, y: number) => {
    const n = row.x.length;
    open = row.x.map((x, i) => ({ sign: row.e[i], y: [y], l: [x], r: [i + 1 < n ? row.x[i + 1] : row.x[0] + 360] }));
    openRow = row;
  };
  const attach = function* (A: AscRow): Work {
    if (openRow !== A) {
      yield* closeAll();
      start(A, A.y);
    }
  };
  // A to B by straight edges: each ribbon moves with its two edges.
  const join = function* (A: AscRow, B: AscRow, m: { r: number; d: number[] }): Work {
    yield* attach(A);
    const n = A.x.length;
    const next = new Array<AscRibbon>(n);
    for (let i = 0; i < n; i++) {
      const rb = open[i];
      rb.y.push(B.y);
      rb.l.push(rb.l[rb.l.length - 1] + m.d[i]);
      rb.r.push(rb.r[rb.r.length - 1] + m.d[(i + 1) % n]);
      next[(i + m.r) % n] = rb;
    }
    open = next;
    openRow = B;
  };
  // A to B where the pattern changes: A's runs to halfway, then B's.
  const split = function* (A: AscRow, B: AscRow): Work {
    yield* attach(A);
    const ym = (A.y + B.y) / 2;
    for (const rb of open) {
      rb.y.push(ym);
      rb.l.push(rb.l[rb.l.length - 1]);
      rb.r.push(rb.r[rb.r.length - 1]);
    }
    yield* closeAll();
    start(B, ym);
    for (const rb of open) {
      rb.y.push(B.y);
      rb.l.push(rb.l[0]);
      rb.r.push(rb.r[0]);
    }
  };
  const refine = function* (A: AscRow, B: AscRow): Work {
    if (B.y - A.y <= ASC_STRIP_MIN_DEG) {
      const m = matchRows(A, B);
      if (m) yield* join(A, B, m);
      else yield* split(A, B);
      return;
    }
    const M = ascRow((A.y + B.y) / 2);
    yield;
    const ab = matchRows(A, B);
    const am = ab && matchRows(A, M);
    if (ab && am) {
      // The straight edge at the middle latitude against where the readout changes there.
      const c = Math.cos(M.y * DEG2RAD);
      if (ab.d.every((d, i) => Math.abs(am.d[i] - d / 2) * c <= GEO_ASC_ZONE_TOL_DEG)) {
        yield* join(A, B, ab);
        return;
      }
    }
    yield* refine(A, M);
    yield* refine(M, B);
  };
  // Rows from −89.99 to 89.99: where the readout gives an Ascendant at all.
  const ys = [-AS_UNDEFINED_LAT];
  for (let k = Math.ceil(-AS_UNDEFINED_LAT / ASC_ROW_STEP_DEG); k * ASC_ROW_STEP_DEG < AS_UNDEFINED_LAT; k++) {
    if (k * ASC_ROW_STEP_DEG > -AS_UNDEFINED_LAT) ys.push(k * ASC_ROW_STEP_DEG);
  }
  ys.push(AS_UNDEFINED_LAT);
  let A = ascRow(ys[0]);
  yield;
  for (let k = 1; k < ys.length; k++) {
    const B = ascRow(ys[k]);
    yield;
    yield* refine(A, B);
    A = B;
  }
  yield* closeAll();
  const features = polys.map(
    (coordinates, k): Feature<MultiPolygon, GeoAscZoneProps> => ({
      type: 'Feature',
      id: geoZoneId(k),
      properties: { zone: geoZoneId(k), sign: k },
      geometry: { type: 'MultiPolygon', coordinates },
    }),
  );
  for (const f of features) {
    deepFreeze(f);
    yield;
  }
  return deepFreeze<GeoAscZones>({ type: 'FeatureCollection', features });
}

let ascZones: GeoAscZones | null = null;
let ascWork: Generator<void, GeoAscZones, void> | null = null;

/** The Ascendant zones once built, else null. Built once per page; the same frozen object
 *  from then on, so the map tiles it once. */
export function geoAscZones(): GeoAscZones | null {
  return ascZones;
}

/**
 * Build the Ascendant zones for about `budgetMs` (one step past it at most: a row, a ribbon
 * folded or a zone frozen) and return them once they are complete — null while work remains.
 * Resumable: each call carries on where the last one stopped.
 */
export function buildGeoAscZones(budgetMs = Infinity): GeoAscZones | null {
  if (ascZones) return ascZones;
  ascWork ??= ascZoneWork();
  const until = performance.now() + budgetMs;
  for (;;) {
    const step = ascWork.next();
    if (step.done) {
      ascWork = null;
      ascZones = step.value;
      return ascZones;
    }
    if (performance.now() >= until) return null;
  }
}
