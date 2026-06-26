// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Composite-midpoints relationship charts. A composite has NO real moment: each
// body sits at the shorter-arc midpoint of the two parents' zodiacal longitudes,
// on the ecliptic (latitude 0). The WHEEL ANGLES + houses are likewise the
// shorter-arc midpoints of the two parents' own angles/cusps (à la Robert Hand).
// The chart still STORES a real moment, though — the minute that realizes the
// composite MAP frame (the MC-midpoint, below) — so the gmst-driven consumers
// (the map lines, parans, local space, the timeline) run the ordinary natal
// pipeline untouched; the PLANET POSITIONS and the WHEEL ANGLES branch to the
// midpoint math here (App's position memos + compositeAngles, the directed
// overlays' natal base, the Returns snap).
//
// Conventions (see docs/calculation-methods.md):
//  - shorter-arc planet midpoints; an exactly-opposed pair takes the side
//    nearer the composite Sun
//  - planets on the ecliptic (latitude 0)
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
  type EclipticPosition,
  type HouseSystem,
  type NodeType,
  type PlanetName,
  type PlanetPosition,
  type RelocatedAngles,
} from '../ephemeris';
import type { CompositeParents } from '../chartLibrary';

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

/**
 * Midpoint zodiacal longitudes (radians) for every body BOTH parents resolve
 * (an asteroid outside its ephemeris range in either chart drops out, like a
 * normal chart outside coverage). The Sun is settled first so its midpoint can
 * arbitrate any exactly-opposed pair.
 */
export function compositeLongitudes(
  parents: CompositeParents,
  nodeType: NodeType,
): { name: PlanetName; lon: number }[] {
  const jdA = birthDataToJD(parents.a);
  const jdB = birthDataToJD(parents.b);
  const sunA = bodyLonSpeed(jdA, 'Sun');
  const sunB = bodyLonSpeed(jdB, 'Sun');
  if (!sunA || !sunB) return [];
  const sunMid = shortArcMidLon(sunA.lon, sunB.lon);
  const out: { name: PlanetName; lon: number }[] = [];
  for (const name of PLANET_NAMES) {
    if (name === 'Sun') {
      out.push({ name, lon: sunMid });
      continue;
    }
    if (name === 'SouthNode') {
      // Derived, not midpointed: the parents' south nodes are the antipodes of
      // their north nodes, so the only case where an independent midpoint
      // could differ is the exactly-opposed tie — where the shared near-Sun
      // rule would collapse BOTH nodes onto one point. Deriving keeps the
      // documented antipodality in every case (and halves the Swiss calls).
      const nn = out.find((p) => p.name === 'NorthNode');
      if (nn) out.push({ name, lon: wrap2pi(nn.lon + Math.PI) });
      continue;
    }
    const a = bodyLonSpeed(jdA, name, nodeType);
    const b = bodyLonSpeed(jdB, name, nodeType);
    if (!a || !b) continue;
    out.push({ name, lon: shortArcMidLon(a.lon, b.lon, sunMid) });
  }
  return out;
}

/** Composite positions in the map pipeline's equatorial shape (lat 0 by the
 *  ecliptic-placement convention, so In Mundo and In Zodiaco coincide). */
export function compositeEquatorial(
  parents: CompositeParents,
  nodeType: NodeType,
  eps: number,
): PlanetPosition[] {
  return compositeLongitudes(parents, nodeType).map(({ name, lon }) => {
    const { ra, dec } = eclipticToRaDec(lon, 0, eps);
    return { name, ra, dec };
  });
}

/** Composite positions for the wheel/readouts. Midpoints have no motion, so
 *  speed/retrograde stay absent (same shape as the derived overlay rings). */
export function compositeEcliptic(
  parents: CompositeParents,
  nodeType: NodeType,
  eps: number,
): EclipticPosition[] {
  return compositeLongitudes(parents, nodeType).map(({ name, lon }) => ({
    name,
    lon,
    lat: 0,
    dec: eclipticToRaDec(lon, 0, eps).dec,
  }));
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
