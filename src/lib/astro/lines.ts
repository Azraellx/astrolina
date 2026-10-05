// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import {
  NODE_NAMES,
  PLANET_CODES,
  PLANET_COLORS,
  eclipticLonOfRA,
  eclipticToRaDec,
  obliquity,
  type LineSystem,
  type PlanetName,
  type PlanetPosition,
} from '../ephemeris';
import { unwrapLongitudes } from './dateline';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

// VX/AVX are the Vertex axis: where a body stands exactly on the local prime
// vertical's WESTERN (Vertex) or eastern (Anti-Vertex) crossing — curves like
// ASC/DSC but for the prime vertical instead of the horizon. Off by default in
// the line filters.
export type LineType = 'MC' | 'IC' | 'ASC' | 'DSC' | 'VX' | 'AVX';

// The angle a body hits at the OTHER end of the same axis. Used for the lunar-node merge:
// the North and South nodes are antipodes, so North Node MC = South Node IC, etc.
// (and North Node VX = South Node AVX — verified by the same H → H−π substitution).
export const OPPOSITE_ANGLE: Record<LineType, LineType> = {
  MC: 'IC',
  IC: 'MC',
  ASC: 'DSC',
  DSC: 'ASC',
  VX: 'AVX',
  AVX: 'VX',
};

// Display form per line type: the four classical angles read as plain caps; the
// Vertex axis uses the wheel's Vx/Avx casing everywhere a label is built. The ONE
// funnel from a line type to what a reader sees — every line, paran and aspect label
// is built through it. The horizon pair reads AS and DS (2026-10-02), as the wheel
// and the Coordinates box do; the LineType values themselves are unchanged.
export const LINE_TYPE_LABEL: Record<LineType, string> = {
  MC: 'MC',
  IC: 'IC',
  ASC: 'AS',
  DSC: 'DS',
  VX: 'Vx',
  AVX: 'Avx',
};

// Maps a meridian's right ascension (radians) to its geographic longitude (degrees,
// before normLng). Celestial: raM → (raM − GMST)·deg. Geodetic: raM →
// eclipticLonOfRA(raM)·deg. Injected so one set of generators serves both systems.
// (e.g. a body culminating over Vannford falls near 3.0°E.) App code takes one
// from meridianLngFor below rather than writing it inline; a suite may still inject
// its own, including deliberately synthetic ones. (2026-10-02)
export type MeridianLng = (raRad: number) => number;

/**
 * The ONE meridian mapping for each line system (2026-10-02). It replaces five
 * inline copies in the app (the natal frame, three overlay memos, buildAllLines),
 * so the geodetic grid reads the mapping the lines read rather than a sixth copy
 * of it. The arithmetic is byte-for-byte the old inline closures', so every line
 * lands on the same float it always did (verify-geodetic §4 pins that with ===).
 * `gmst` is unread on geodetic: a geodetic map does not turn with the sky.
 */
export function meridianLngFor(system: LineSystem, eps: number, gmst: number): MeridianLng {
  return system === 'geodetic'
    ? (raM) => (eclipticLonOfRA(raM, eps) * 180) / Math.PI
    : (raM) => ((raM - gmst) * 180) / Math.PI;
}

export interface LineProps {
  planet: PlanetName;
  lineType: LineType;
  color: string;
  label: string;
  /** Overlay/promoted tag (e.g. "Tr") stamped by tagLabels; absent on the natal
   *  chart's own lines. The edge badge reads it for the label prefix, independent of
   *  whether the badge is routed as natal or overlay. */
  tag?: string;
  /** Set by the node-pair merge (see App.mergeNodePairs): this North Node line coincides
   *  with its (antipodal) South Node counterpart, so the map draws it two-toned and the
   *  edge badge labels it for both nodes ("NN MC / SN IC"). Absent on every other line. */
  pair?: boolean;
}

function normLng(lng: number): number {
  let x = ((lng + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
}

function makeFeature(
  coords: [number, number][],
  planet: PlanetName,
  lineType: LineType,
): Feature<LineString, LineProps> {
  return {
    type: 'Feature',
    properties: {
      planet,
      lineType,
      color: PLANET_COLORS[planet],
      label: `${PLANET_CODES[planet]} ${LINE_TYPE_LABEL[lineType]}`,
    },
    geometry: { type: 'LineString', coordinates: coords },
  };
}

// A body rises/sets only up to |lat| = 90 − |dec|; past that turning latitude it's
// circumpolar. We trace the curve to ±85° (the MC/IC extent and the Web-Mercator
// visible edge) and clip there — points beyond just exit the map edge.
const HORIZON_LAT_LIMIT = 85;
// Near-zero declination degenerates the rising/setting lines into two near-vertical
// meridians (turning latitude beyond ±85°, off-map) and makes the hour-angle
// latitude formula blow up. Below this |tan(dec)| (~2.9°) we fall back to the
// latitude sweep, which traces the vertical case cleanly and has no apex gap there.
// Exported for the geodetic grid: at declination 0 this branch traces a whole
// meridian, and the grid runs those two (0° Aries, 0° Libra) on to the poles.
// (2026-10-02)
export const DEC_EPS = 0.05;
const HORIZON_H_STEP = 1 * DEG2RAD; // base hour-angle step
const HORIZON_MAX_DLAT_DEG = 1; // subdivide a step whose latitude jump exceeds this

function pushHorizonPoint(
  coords: [number, number][],
  lngDeg: number,
  latDeg: number,
  latLimit: number = HORIZON_LAT_LIMIT,
): void {
  if (latDeg < -latLimit || latDeg > latLimit) return;
  coords.push([normLng(lngDeg), latDeg]);
}

// The rising/setting curve traced by LATITUDE (one longitude per latitude). Used
// only for near-zero-declination bodies, whose lines are essentially vertical and so
// have no high-latitude turning point to streak/break.
function horizonByLatitude(
  p: { ra: number; dec: number },
  meridianLng: MeridianLng,
  sign: -1 | 1,
  latLimit: number = HORIZON_LAT_LIMIT,
): [number, number][] {
  const coords: [number, number][] = [];
  for (let lat = -latLimit; lat <= latLimit; lat += 0.5) {
    const phi = lat * DEG2RAD;
    const x = -Math.tan(phi) * Math.tan(p.dec);
    if (x < -1 || x > 1) continue;
    const H = sign * Math.acos(x);
    coords.push([normLng(meridianLng(p.ra + H)), lat]);
  }
  return coords;
}

// A planet's rising (ASC) or setting (DSC) line, traced by HOUR ANGLE H instead of
// by latitude. Both lng(H) = ra + H − gmst and lat(H) = atan(−cosH / tanDec) are
// smooth in H, so the curve is evenly, gap-free sampled everywhere — including the
// turning latitude |lat| = 90 − |dec|, where the latitude sweep's dH/dlat → ∞ drew a
// long horizontal streak and left a break between the two halves. We sweep H out from
// 0 to ∓π (ASC: −π, DSC: +π); the halves share the apex (H=0) and nadir (H=±π) points
// exactly, so ASC and DSC meet with no gap. Each half is monotonic in latitude, so
// clipping to ±85° leaves one contiguous on-map run.
//
// Every run is returned SOUTH→NORTH — the map's ASC/DSC arrows ride the line's own
// direction (→ on ASC, ← on DSC), so they point up on a rising line and down on a
// setting one only if every line runs the same way. H = 0 is the SOUTH apex only for a
// body north of the equator: lat(0) = atan(−1/tanDec) takes the sign opposite to dec's,
// so for a southern declination the sweep runs north→south and is reversed at the end.
// (Until 2026-09-26 it was not, and every body south of the equator — planets and
// minor bodies alike — drew its rising and setting arrows pointing the wrong way.)
// Geometry-only horizon trace for any equatorial position (the fixed-star lines
// reuse it with their own feature properties; angleLineRuns below uses it for the
// planets and the catalog minor bodies alike).
//
// `latLimit` is where the trace is clipped, ±85° (the drawn lines') unless a caller
// asks for more. The uncertainty bands (uncertaintyBands.ts) pass 90 so the trace runs
// the whole way to the degree's turning latitude, where their rings close — a band
// clipped at 85° would leave a hole over the pole on the globe. (2026-10-02)
export function traceHorizonCoords(
  p: { ra: number; dec: number },
  meridianLng: MeridianLng,
  side: 'ASC' | 'DSC',
  latLimit: number = HORIZON_LAT_LIMIT,
): [number, number][] {
  const tanDec = Math.tan(p.dec);
  if (Math.abs(tanDec) < DEC_EPS) {
    const sign = side === 'ASC' ? -1 : 1;
    return unwrapLongitudes(horizonByLatitude(p, meridianLng, sign, latLimit));
  }

  const hDir = side === 'ASC' ? -1 : 1; // sweep H from 0 toward ∓π
  const latAt = (H: number) => Math.atan(-Math.cos(H) / tanDec) * RAD2DEG;
  const lngAt = (H: number) => meridianLng(p.ra + H);

  // Hour-angle magnitudes 0 … π, always including the exact apex endpoint π.
  // The loop stops a hair short of π: the 180th accumulated 1° step lands at
  // π − ~1e-14 by float error, which would otherwise duplicate the exact-π
  // endpoint as a zero-length final segment.
  const mags: number[] = [0];
  for (let m = HORIZON_H_STEP; m < Math.PI - 1e-9; m += HORIZON_H_STEP) mags.push(m);
  mags.push(Math.PI);

  const coords: [number, number][] = [];
  let prevLat = latAt(hDir * mags[0]);
  pushHorizonPoint(coords, lngAt(hDir * mags[0]), prevLat, latLimit);
  for (let i = 1; i < mags.length; i++) {
    const H = hDir * mags[i];
    const lat = latAt(H);
    // Subdivide the step if latitude moved too fast (low-declination curves climb
    // steeply near H = ±90°), re-evaluating the curve at each sub-sample.
    const jumps = Math.max(
      1,
      Math.ceil(Math.abs(lat - prevLat) / HORIZON_MAX_DLAT_DEG),
    );
    for (let k = 1; k < jumps; k++) {
      const mk = mags[i - 1] + (mags[i] - mags[i - 1]) * (k / jumps);
      pushHorizonPoint(coords, lngAt(hDir * mk), latAt(hDir * mk), latLimit);
    }
    pushHorizonPoint(coords, lngAt(H), lat, latLimit);
    prevLat = lat;
  }
  // One continuous run (longitudes may go past ±180 across the antimeridian), south→north.
  const run = unwrapLongitudes(coords);
  return tanDec < 0 ? run.reverse() : run;
}

// The Vertex-axis curve: every place where the body stands exactly on the
// local PRIME VERTICAL (the great circle through due east, the zenith, and due
// west). On it, tan(lat) = tan(dec) / cos(H) — the prime-vertical counterpart
// of the horizon's cos(H) = −tan(lat)·tan(dec) — so the curve is traced by
// hour angle exactly like the horizon curves. The western half (H 0…+π) is the
// VERTEX side, the eastern (H 0…−π) the ANTI-VERTEX. Both halves run from the
// body's zenith point (H = 0, lat = dec, on the MC line) to its antipode
// (H = ±π), shooting poleward near |H| = 90° where the clip takes over. A
// near-zero declination needs no special case here: the formula divides by
// cos H, never by tan(dec), so the curve just hugs the equator between its
// poleward spikes.
export function tracePrimeVerticalCoords(
  p: { ra: number; dec: number },
  meridianLng: MeridianLng,
  side: 'VX' | 'AVX',
): [number, number][][] {
  const tanDec = Math.tan(p.dec);
  const hDir = side === 'VX' ? 1 : -1; // west for the Vertex, east for the Anti-Vertex
  const latAt = (H: number) => Math.atan(tanDec / Math.cos(H)) * RAD2DEG;
  const lngAt = (H: number) => meridianLng(p.ra + H);

  // Unlike a horizon half, a prime-vertical half is NOT one contiguous on-map
  // run: it exits poleward at |H| → 90° and re-enters at the OPPOSITE pole, so
  // a single polyline would draw a spurious pole-to-pole chord. Trace the two
  // natural runs (either side of the |H| = 90° spike) as separate pieces.
  const traceRange = (from: number, to: number): [number, number][] => {
    const mags: number[] = [from];
    for (let m = from + HORIZON_H_STEP; m < to - 1e-9; m += HORIZON_H_STEP) mags.push(m);
    mags.push(to);
    const coords: [number, number][] = [];
    let prevLat = latAt(hDir * mags[0]);
    pushHorizonPoint(coords, lngAt(hDir * mags[0]), prevLat);
    for (let i = 1; i < mags.length; i++) {
      const H = hDir * mags[i];
      const lat = latAt(H);
      const jumps = Math.max(
        1,
        Math.ceil(Math.abs(lat - prevLat) / HORIZON_MAX_DLAT_DEG),
      );
      for (let k = 1; k < jumps; k++) {
        const mk = mags[i - 1] + (mags[i] - mags[i - 1]) * (k / jumps);
        pushHorizonPoint(coords, lngAt(hDir * mk), latAt(hDir * mk));
      }
      pushHorizonPoint(coords, lngAt(H), lat);
      prevLat = lat;
    }
    return unwrapLongitudes(coords);
  };

  return [traceRange(0, Math.PI / 2), traceRange(Math.PI / 2, Math.PI)].filter(
    (run) => run.length >= 2,
  );
}

// A meridian as a DENSE run of vertices (constant longitude, lat −85…85). The
// globe projection draws every line segment as a straight chord through the
// sphere, so a 2-point meridian would cut through the globe's interior instead of
// following its surface. Densifying lets MapLibre bend each short segment onto the
// surface — a true meridian on the globe, and an identical vertical line in flat
// 2D (the dense ASC/DSC curves and local-space arcs already satisfy this).
const MERIDIAN_LAT_MIN = -85;
const MERIDIAN_LAT_MAX = 85;
const GLOBE_STEP_DEG = 2;

// Exported for the fixed-star lines, which build their own features over the
// same dense-meridian geometry. Also normLng below, the shared wrap helper.
export function meridianCoords(lng: number): [number, number][] {
  const coords: [number, number][] = [];
  for (let lat = MERIDIAN_LAT_MIN; lat <= MERIDIAN_LAT_MAX; lat += GLOBE_STEP_DEG) {
    coords.push([lng, lat]);
  }
  return coords;
}

export { normLng };

/**
 * The angle-line GEOMETRY for one equatorial position — MC, IC, ASC, DSC, then the
 * Vertex-axis runs — in the order every line family emits them. Shared by the
 * planet lines below and the catalog minor-body lines (minorLines.ts), so the two
 * families can never be drawn by different geometry. `vertex: false` leaves the
 * Vertex-axis runs out — the catalog bodies draw the four classical angles only.
 */
export function angleLineRuns(
  p: { ra: number; dec: number },
  meridianLng: MeridianLng,
  { vertex = true }: { vertex?: boolean } = {},
): { lineType: LineType; coords: [number, number][] }[] {
  // Celestial: meridianLng(ra) = ra − GMST. Geodetic: = the body's zodiacal
  // longitude (eclipticLonOfRA). IC = MC + 180 holds in both (antipode-preserving).
  const lngMC = normLng(meridianLng(p.ra));
  const lngIC = normLng(lngMC + 180);
  const runs: { lineType: LineType; coords: [number, number][] }[] = [
    { lineType: 'MC', coords: meridianCoords(lngMC) },
    { lineType: 'IC', coords: meridianCoords(lngIC) },
    { lineType: 'ASC', coords: traceHorizonCoords(p, meridianLng, 'ASC') },
    { lineType: 'DSC', coords: traceHorizonCoords(p, meridianLng, 'DSC') },
  ];
  // The Vertex axis (two runs per side — see tracePrimeVerticalCoords);
  // hidden by default via the line-type filters.
  if (!vertex) return runs;
  for (const side of ['VX', 'AVX'] as const) {
    for (const run of tracePrimeVerticalCoords(p, meridianLng, side)) {
      runs.push({ lineType: side, coords: run });
    }
  }
  return runs;
}

// `opts.vertex: false` leaves out the Vertex axis (Vx/Avx), exactly as angleLineRuns does —
// what a geodetic map asks for: it draws the four angles only, since the Vertex reads the
// sky's turning (lib/skyHold). The four angles are the same runs either way. (2026-10-02)
export function generateLines(
  positions: PlanetPosition[],
  meridianLng: MeridianLng,
  opts: { vertex?: boolean } = {},
): FeatureCollection<LineString, LineProps> {
  const features: Feature<LineString, LineProps>[] = [];

  for (const p of positions) {
    for (const run of angleLineRuns(p, meridianLng, opts)) {
      features.push(makeFeature(run.coords, p.name, run.lineType));
    }
  }

  return { type: 'FeatureCollection', features };
}

export interface ZenithProps {
  planet: PlanetName;
  color: string;
  /** Overlay/promoted tag (e.g. "Tr"); absent for the natal chart. Shown as the
   *  prefix in the zenith stamp's hover tooltip, like the line/paran labels. */
  tag?: string;
}

// The zenith / sub-planetary point: the single spot on Earth where a planet is
// exactly overhead (altitude 90°). It sits on the planet's MC line, at the
// latitude equal to its declination, and longitude where local sidereal time
// equals the planet's RA — i.e. the same longitude as the MC line. One stamp per
// body, rendered as the planet glyph on the map.
export function generateZenithStamps(
  positions: PlanetPosition[],
  meridianLng: MeridianLng,
): FeatureCollection<Point, ZenithProps> {
  const features: Feature<Point, ZenithProps>[] = positions
    // The lunar nodes are abstract ecliptic points, not bodies that stand overhead
    // anywhere, so they get no zenith (sub-planetary) stamp.
    .filter((p) => !NODE_NAMES.includes(p.name))
    .map((p) => ({
      type: 'Feature',
      // Per-body id. NOT what the map's hover state keys on: MapLibre keeps only a
      // numeric feature id, so the stamp sources promote the `planet` property to the id
      // instead (promoteId in Map.tsx). Kept for any consumer reading the collection.
      id: p.name,
      properties: { planet: p.name, color: PLANET_COLORS[p.name] },
      geometry: {
        type: 'Point',
        coordinates: [normLng(meridianLng(p.ra)), p.dec * RAD2DEG],
      },
    }));
  return { type: 'FeatureCollection', features };
}

// The nadir / sub-anti-planetary point: the spot on Earth where a planet is exactly
// UNDERFOOT (altitude −90°) — the antipode of its zenith. It sits on the planet's IC
// line, at the antipodal longitude (zenith + 180°) and the negated latitude
// (−declination). A pure transform of the zenith stamps, so it inherits their ids,
// planet (which the map promotes to the hover id), and colour (the on-map stamp
// reuses the same baked glyph coin).
export function antipodeStamps(
  fc: FeatureCollection<Point, ZenithProps>,
): FeatureCollection<Point, ZenithProps> {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => ({
      ...f,
      geometry: {
        type: 'Point',
        coordinates: [
          normLng(f.geometry.coordinates[0] + 180),
          -f.geometry.coordinates[1],
        ],
      },
    })),
  };
}

// The ecliptic (the Sun's apparent path / the zodiac great circle) projected onto
// Earth: the locus of sub-points of the ecliptic at this instant. Each ecliptic
// longitude λ (ecliptic latitude 0) maps to equatorial (RA, dec) via the obliquity
// ε, then to its sub-point via the SAME `meridianLng` mapping as the lines/zenith
// stamps — so the curve threads through the Sun's zenith (the Sun rides the
// ecliptic) and near every other body's in BOTH systems (celestial: lng = RA − GMST;
// geodetic: lng = the zodiacal longitude). Sampled densely + longitude-unwrapped so
// it bends onto the 3D globe instead of chording through it.
export function generateEcliptic(
  jd: number,
  meridianLng: MeridianLng,
): FeatureCollection<LineString> {
  const eps = obliquity(jd);
  const coords: [number, number][] = [];
  for (let lonDeg = 0; lonDeg <= 360; lonDeg += GLOBE_STEP_DEG) {
    const { ra, dec } = eclipticToRaDec(lonDeg * DEG2RAD, 0, eps);
    coords.push([normLng(meridianLng(ra)), dec * RAD2DEG]);
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: unwrapLongitudes(coords) },
      },
    ],
  };
}

