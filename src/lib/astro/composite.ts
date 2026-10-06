// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Composite-midpoints relationship charts. A composite has NO real moment: each
// body's coordinates are the COORDINATE-WISE midpoints of the two parents' own
// coordinates — the midpoint tradition (à la Robert Hand, matching Solar Fire)
// averages every column independently rather than midpointing one 3D sky point.
// The WHEEL ANGLES + houses are likewise the shorter-arc midpoints of the two
// parents' own angles/cusps. The chart still STORES a real moment, though — the
// minute that realizes the composite MAP frame (the MC-midpoint, below) — so the
// gmst-driven consumers (the map lines, parans, local space, the timeline) run
// the ordinary natal pipeline untouched; the PLANET POSITIONS and the WHEEL
// ANGLES branch to the midpoint math here (App's position memos +
// compositeAngles, the directed overlays' natal base, the Returns snap), and so
// do the catalog minor bodies (compositeMinorSamples), by the planets' own rule.
//
// Conventions (see docs/calculation-methods.md):
//  - per body: zodiacal longitude = shorter-arc midpoint (an exactly-opposed
//    pair takes the side nearer the composite Sun); ecliptic latitude = plain
//    mean; declination = plain mean of the parents' NATIVE declinations (each
//    at its own moment); right ascension = shorter-arc midpoint of the native
//    RAs (ties break toward the composite Sun's RA midpoint — the longitude
//    rule, per coordinate). The same mean-RA/mean-dec convention already
//    anchors the In-Mundo midpoint lines (see angleAspects.ts).
//  - a composite row is deliberately NOT a self-consistent 3D point: its
//    declination is the mean of the parents' declinations, not the declination
//    of the (lon, lat) midpoint — benchmark programs agree column-by-column,
//    not point-by-point. The equatorial shape therefore CARRIES lon/lat of
//    record (PlanetPosition.lon/lat), so the In-Zodiaco/geodetic projection and
//    the longitude-directed overlays keep deriving from the true longitude
//    midpoint instead of inverting the mean ra/dec. In Mundo and In Zodiaco
//    genuinely differ for composites, like any chart with off-ecliptic bodies.
//    (Edge, inherent to per-coordinate midpoints: for a pair a few degrees
//    short of opposition, the shorter arc in longitude and the shorter arc in
//    RA can resolve to opposite sides of the sky — the exact-opposition tie is
//    the Sun rules' knife-edge, but this straddle window is wider than any
//    tie, so the RA midpoint is explicitly snapped to the longitude-of-record
//    side; see the quarter-turn test in compositeSamples.)
//  - wheel angles + houses = shorter-arc midpoints of the two parents' angles and
//    cusps (à la Robert Hand): the composite Ascendant and Midheaven are each the
//    exact midpoint of the two natal ones (see compositeAngles)
//  - MAP frame = the MC-MIDPOINT: a single RAMC whose Midheaven is that angle
//    midpoint. MC↔RAMC is latitude-free, so the map is fixed by sidereal time
//    alone. (One RAMC can't put both the ASC and MC on their midpoints, so the
//    map's ASC/DSC lines won't pass through the wheel's midpoint Ascendant — the
//    meridian MC/IC lines do.) Realized as a real stored UT minute.
//  - reference place = the same geographic midpoint Davison uses
import {
  birthDataToJD,
  bodyLonSpeed,
  eclipticToRaDec,
  gmstRadians,
  obliquity,
  PLANET_NAMES,
  relocate,
  sampleBody,
  sampleMinorBody,
  type BodySample,
  type EclipticPosition,
  type HouseSystem,
  type NodeType,
  type PlanetName,
  type PlanetPosition,
  type RelocatedAngles,
} from '../ephemeris';
import type { CompositeParents } from '../chartLibrary';
import type { OverlayMinorSample } from './timeline';

const TWO_PI = 2 * Math.PI;
const DEG2RAD = Math.PI / 180;
const wrap2pi = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
// Signed wrap to (−π, π].
const wrapPi = (a: number) => {
  let x = a % TWO_PI;
  if (x > Math.PI) x -= TWO_PI;
  if (x <= -Math.PI) x += TWO_PI;
  return x;
};

// Exactly-opposed pairs have no shorter arc; this is the tie window where the
// near-Sun rule (below) decides the side.
const OPPOSED_EPS = 1e-9;

/**
 * Shorter-arc midpoint of two angles (radians). For an exactly-opposed pair
 * the two candidates are equivalent by arc length; `tieRef` (the composite
 * Sun) picks the nearer side — without it, the candidate in [0, π) wins, a
 * fixed convention that is symmetric in (a, b) so swapping the parents can
 * never flip the result.
 */
export function shortArcMidLon(a: number, b: number, tieRef?: number): number {
  let d = wrap2pi(b - a);
  if (d > Math.PI) d -= TWO_PI;
  const mid = wrap2pi(a + d / 2);
  if (Math.abs(Math.abs(d) - Math.PI) > OPPOSED_EPS) return mid;
  const other = wrap2pi(mid + Math.PI);
  if (tieRef === undefined) return mid < Math.PI ? mid : other;
  return Math.abs(wrapPi(mid - tieRef)) <= Math.abs(wrapPi(other - tieRef))
    ? mid
    : other;
}

interface CompositeSample {
  name: PlanetName;
  lon: number; // shorter-arc midpoint of the parents' zodiacal longitudes
  lat: number; // plain mean of the parents' ecliptic latitudes
  ra: number; // shorter-arc midpoint of the parents' native right ascensions
  dec: number; // plain mean of the parents' native declinations
}

/** One body's four coordinates at one parent's moment — a planet's sample or a
 *  catalog body's, which is what lets both families midpoint through one function. */
interface ParentCoords {
  lon: number;
  lat: number;
  ra: number;
  dec: number;
}

/** The composite Sun's two midpoints, which arbitrate every exactly-opposed pair in
 *  their own frame, plus the parents' moments every other body is sampled at. */
export interface CompositeSunRefs {
  jdA: number;
  jdB: number;
  sunA: BodySample;
  sunB: BodySample;
  sunMidLon: number;
  sunMidRa: number;
}

/** The Sun is settled first, for every body that follows — the planets here, the
 *  catalog bodies in compositeMinorSamples. Null when either parent's Sun can't be
 *  sampled, in which case no body can be midpointed at all. (The Sun's sample doesn't
 *  depend on the node type, so none is asked for.) */
export function compositeSunRefs(parents: CompositeParents): CompositeSunRefs | null {
  const jdA = birthDataToJD(parents.a);
  const jdB = birthDataToJD(parents.b);
  const sunA = sampleBody(jdA, 'Sun', 'mean');
  const sunB = sampleBody(jdB, 'Sun', 'mean');
  if (!sunA || !sunB) return null;
  return {
    jdA,
    jdB,
    sunA,
    sunB,
    sunMidLon: shortArcMidLon(sunA.lon, sunB.lon),
    sunMidRa: shortArcMidLon(sunA.ra, sunB.ra),
  };
}

/** One body's coordinate-wise midpoint — the ONE statement of the convention in this
 *  file's header, for planets and catalog bodies alike. */
export function compositeMidpoint(
  a: ParentCoords,
  b: ParentCoords,
  refs: Pick<CompositeSunRefs, 'sunMidLon' | 'sunMidRa'>,
): ParentCoords {
  const lon = shortArcMidLon(a.lon, b.lon, refs.sunMidLon);
  let ra = shortArcMidLon(a.ra, b.ra, refs.sunMidRa);
  // A pair a hair short of opposition can straddle it differently per frame:
  // RA−λ skews each separation independently (same-sign latitudes stretch
  // the RA arc past 180° while the longitude arc stays under), so the two
  // shorter-arc midpoints land on OPPOSITE sides of the sky. The row is one
  // body — keep its RA on the side of its longitude of record. RA−λ never
  // legitimately approaches a quarter turn, so the test is unambiguous.
  if (Math.abs(wrapPi(ra - lon)) > Math.PI / 2) ra = wrap2pi(ra + Math.PI);
  return { lon, lat: (a.lat + b.lat) / 2, ra, dec: (a.dec + b.dec) / 2 };
}

/**
 * Coordinate-wise midpoints for every body BOTH parents resolve (an asteroid
 * outside its ephemeris range in either chart drops out, like a normal chart
 * outside coverage). The Sun is settled first so its own midpoints can
 * arbitrate any exactly-opposed pair — in each frame by its own coordinate
 * (longitude ties toward the Sun's longitude midpoint, RA ties toward its RA
 * midpoint). Latitude and declination don't wrap, so a plain mean is exact.
 */
function compositeSamples(
  parents: CompositeParents,
  nodeType: NodeType,
): CompositeSample[] {
  const refs = compositeSunRefs(parents);
  if (!refs) return [];
  const { jdA, jdB, sunA, sunB } = refs;
  const midpoint = (a: BodySample, b: BodySample) => compositeMidpoint(a, b, refs);
  const out: CompositeSample[] = [];
  for (const name of PLANET_NAMES) {
    if (name === 'Sun') {
      // midpoint() reproduces sunMidLon/sunMidRa exactly: with the tie-ref
      // being the [0, π) tie candidate itself, the tie resolves to it.
      out.push({ name, ...midpoint(sunA, sunB) });
      continue;
    }
    if (name === 'SouthNode') {
      // Derived, not midpointed: the parents' south nodes are the antipodes of
      // their north nodes, so the only case where an independent midpoint
      // could differ is the exactly-opposed tie — where the shared near-Sun
      // rule would collapse BOTH nodes onto one point. Deriving keeps the
      // documented antipodality in every case (and halves the Swiss calls).
      // The antipode of an ecliptic-plane point in all four coordinates:
      // lon + π, ra + π, dec negated; node latitude is identically 0 (the
      // literal, not −lat, so no −0 ever reaches a readout).
      const nn = out.find((p) => p.name === 'NorthNode');
      if (nn) {
        out.push({
          name,
          lon: wrap2pi(nn.lon + Math.PI),
          lat: 0,
          ra: wrap2pi(nn.ra + Math.PI),
          dec: -nn.dec,
        });
      }
      continue;
    }
    const a = sampleBody(jdA, name, nodeType);
    const b = sampleBody(jdB, name, nodeType);
    if (!a || !b) continue;
    out.push({ name, ...midpoint(a, b) });
  }
  return out;
}

/**
 * Midpoint zodiacal longitudes (radians) — the longitude-only projection of
 * compositeSamples, for consumers that read nothing else.
 */
export function compositeLongitudes(
  parents: CompositeParents,
  nodeType: NodeType,
): { name: PlanetName; lon: number }[] {
  return compositeSamples(parents, nodeType).map(({ name, lon }) => ({
    name,
    lon,
  }));
}

/** Composite positions in the map pipeline's equatorial shape: ra/dec are the
 *  coordinate-wise means (the In-Mundo truth), with the zodiacal lon/lat OF
 *  RECORD riding along — the In-Zodiaco/geodetic projection and the directed
 *  overlays derive from those, never from an inversion of the mean ra/dec. */
export function compositeEquatorial(
  parents: CompositeParents,
  nodeType: NodeType,
): PlanetPosition[] {
  return compositeSamples(parents, nodeType).map(
    ({ name, ra, dec, lon, lat }) => ({ name, ra, dec, lon, lat }),
  );
}

/** Composite positions for the wheel/readouts, with the mean latitude and mean
 *  declination the tables show (and `ra` of record for the equatorial columns).
 *  Midpoints have no motion, so speed/retrograde stay absent (same shape as the
 *  derived overlay rings). */
export function compositeEcliptic(
  parents: CompositeParents,
  nodeType: NodeType,
): EclipticPosition[] {
  return compositeSamples(parents, nodeType).map(
    ({ name, lon, lat, ra, dec }) => ({ name, lon, lat, dec, ra }),
  );
}

/**
 * Catalog minor bodies on a composite: each one the coordinate-wise midpoint of its two
 * parents' samples, by the planets' own rule (compositeMidpoint, arbitrated by the same
 * composite Sun) — so a catalog body on a composite is placed exactly as a planet at the
 * same coordinates would be.
 *
 * Bodies outermost, the two parents inside: the engine keeps one numbered-asteroid file
 * open, and both parents' samples of one body come from that body's file. A body either
 * parent can't sample — its file doesn't reach that parent's date — drops out, as an
 * asteroid does from compositeSamples. The output carries its lon/lat OF RECORD
 * (`ofRecord`), so the In-Zodiaco projection reads the longitude midpoint rather than
 * inverting the mean ra/dec, and no speed: a midpoint has no motion of its own.
 */
export function compositeMinorSamples(
  parents: CompositeParents,
  numbers: readonly number[],
): OverlayMinorSample[] {
  if (numbers.length === 0) return [];
  const refs = compositeSunRefs(parents);
  if (!refs) return [];
  const out: OverlayMinorSample[] = [];
  for (const n of numbers) {
    const a = sampleMinorBody(refs.jdA, n);
    const b = a && sampleMinorBody(refs.jdB, n);
    if (!a || !b) continue;
    const m = compositeMidpoint(a, b, refs);
    out.push({ n, ra: m.ra, dec: m.dec, lon: m.lon, lat: m.lat, ofRecord: true });
  }
  return out;
}

/** One body's composite longitude (radians) — the Returns snap's natal
 *  reference (a "composite solar return" = the transiting Sun back on the
 *  composite Sun). Null if either parent can't resolve the body. */
export function compositeBodyLon(
  parents: CompositeParents,
  name: PlanetName,
  nodeType: NodeType,
): number | null {
  const a = bodyLonSpeed(birthDataToJD(parents.a), name, nodeType);
  const b = bodyLonSpeed(birthDataToJD(parents.b), name, nodeType);
  if (!a || !b) return null;
  const sun = compositeBodySun(parents);
  return shortArcMidLon(a.lon, b.lon, sun ?? undefined);
}

function compositeBodySun(parents: CompositeParents): number | null {
  const a = bodyLonSpeed(birthDataToJD(parents.a), 'Sun');
  const b = bodyLonSpeed(birthDataToJD(parents.b), 'Sun');
  return a && b ? shortArcMidLon(a.lon, b.lon) : null;
}

// Mean solar days per sidereal day.
const SIDEREAL_DAY = 0.9972695663;

// Shorter-arc mean of two longitudes (degrees) — the SAME signed-difference
// formula relationship.ts's midpointLng uses for the stored composite place, so
// the frame is solved at exactly the longitude the chart is stored at (an
// antimeridian pair would otherwise desync). Latitude is a plain mean.
function midLngDeg(a: number, b: number): number {
  const diff = ((b - a + 540) % 360) - 180;
  const mid = a + diff / 2;
  return (((mid % 360) + 540) % 360) - 180;
}

/**
 * The composite chart's stored nominal moment, realizing the MAP frame: the
 * composite Midheaven is the shorter-arc midpoint of the two natal Midheavens
 * (each cast at its own parent's place), and the returned jd is the instant
 * whose Greenwich sidereal time culminates that midpoint MC at the
 * geographic-midpoint meridian. The map lines, parans and local space then fall
 * out of this one stored moment via the ordinary natal pipeline.
 *
 * The MC is anchored (not the ASC) because MC↔RAMC carries no latitude term, so
 * the frame is fixed by sidereal time alone. The wheel's Ascendant is a separate
 * independent midpoint (see compositeAngles); one RAMC can't place both the ASC
 * and the MC on their midpoints, so the map's ASC/DSC lines won't pass through
 * the wheel Ascendant — the meridian MC/IC lines do.
 *
 * GMST sweeps a full turn over one sidereal day, monotonically and near-linearly,
 * so exactly one jd in [davisonMid ± ½ sidereal day] hits the target; the lone 2π
 * wrap sits at `hi` and, since only interior points are sampled, never lands on a
 * probe. The caller rounds to a civil minute, quantizing the frame slightly.
 */
export function solveCompositeFrameJd(
  parents: CompositeParents,
  system: HouseSystem = 'placidus',
): number {
  const pa = parents.a.birthplace;
  const pb = parents.b.birthplace;
  const jdA = birthDataToJD(parents.a);
  const jdB = birthDataToJD(parents.b);
  const davMid = (jdA + jdB) / 2;
  const midLng = midLngDeg(pa.lng, pb.lng);
  // The composite Midheaven: shorter-arc midpoint of the two NATAL Midheavens.
  // The MC is house-system-independent, so a fixed system is fine here.
  const mcA = relocate(jdA, pa.lat, pa.lng, system).mc;
  const mcB = relocate(jdB, pb.lat, pb.lng, system).mc;
  const targetMC = shortArcMidLon(mcA, mcB);
  // MC longitude → its RAMC (ecliptic→equatorial at latitude 0 — latitude-free).
  // Obliquity is read once at davMid: it moves <1e-7° across the ½-sidereal-day
  // window, and it's the same obliquity Swiss uses for ARMC→MC, so the round-trip
  // is self-consistent to float noise.
  const eps = obliquity(davMid);
  const targetRamc = eclipticToRaDec(targetMC, 0, eps).ra;
  // Local RAMC at the midpoint meridian = gmst(jd) + midLng; invert for gmst.
  const targetGmst = wrap2pi(targetRamc - midLng * DEG2RAD);
  let lo = davMid - SIDEREAL_DAY / 2;
  let hi = davMid + SIDEREAL_DAY / 2;
  const g0 = gmstRadians(lo);
  const rel = wrap2pi(targetGmst - g0);
  for (let i = 0; i < 40 && hi - lo > 1e-7; i++) {
    const mid = (lo + hi) / 2;
    if (wrap2pi(gmstRadians(mid) - g0) < rel) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The composite chart's WHEEL angles, à la Robert Hand: every angle and house
 * cusp is the shorter-arc midpoint of the two parents' OWN angles/cusps (each
 * cast at its own parent's place). This decouples the wheel from the map frame
 * (solveCompositeFrameJd), so BOTH the Ascendant and the Midheaven read as the
 * exact midpoint of the two natal ones — which a single sky-frame can't do.
 * Opposite points are derived (dsc = asc + 180°, ic = mc + 180°, antivertex =
 * vertex + 180°) so the axes stay straight; the cusp midpoints keep cusp 1 = asc
 * and cusp 10 = mc for quadrant systems by construction.
 */
export function compositeAngles(
  parents: CompositeParents,
  system: HouseSystem = 'placidus',
): RelocatedAngles {
  const pa = parents.a.birthplace;
  const pb = parents.b.birthplace;
  const a = relocate(birthDataToJD(parents.a), pa.lat, pa.lng, system);
  const b = relocate(birthDataToJD(parents.b), pb.lat, pb.lng, system);
  const asc = shortArcMidLon(a.asc, b.asc);
  const mc = shortArcMidLon(a.mc, b.mc);
  const vertex = shortArcMidLon(a.vertex, b.vertex);
  const cusps = a.cusps.map((c, i) => shortArcMidLon(c, b.cusps[i] ?? c));
  return {
    asc,
    mc,
    dsc: wrap2pi(asc + Math.PI),
    ic: wrap2pi(mc + Math.PI),
    cusps,
    vertex,
    antivertex: wrap2pi(vertex + Math.PI),
    // A parent above the polar circle falls back to Porphyry cusps; surface it so
    // the wheel's house-system note still fires for the midpoint cusps.
    fallback: a.fallback || b.fallback,
  };
}
