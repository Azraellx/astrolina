// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Composite-midpoints relationship charts. A composite has NO real moment: each
// body sits at the shorter-arc midpoint of the two parents' zodiacal
// longitudes, on the ecliptic (latitude 0). The chart still STORES a real
// moment, though — the minute that realizes the composite ASC-midpoint frame
// (below) — so every frame-driven consumer (gmst, relocated angles, all ten
// house systems via Swiss, parans, local space, the timeline) runs the ordinary
// natal pipeline untouched; only the PLANET POSITIONS branch to the midpoint
// math here (App's two position memos, the directed overlays' natal base, the
// Returns snap).
//
// Conventions (see docs/calculation-methods.md):
//  - shorter-arc planet midpoints; an exactly-opposed pair takes the side
//    nearer the composite Sun
//  - planets on the ecliptic (latitude 0)
//  - angle frame = the ASC-MIDPOINT method: the composite Ascendant is the
//    shorter-arc midpoint of the two natal Ascendants, and the MC + houses
//    derive from the RAMC that yields it at the geographic-midpoint latitude
//    (matches Solar Fire / Robert Hand). Realized as a real stored UT minute.
//  - reference place = the same geographic midpoint Davison uses
import {
  birthDataToJD,
  bodyLonSpeed,
  eclipticToRaDec,
  PLANET_NAMES,
  relocate,
  type EclipticPosition,
  type HouseSystem,
  type NodeType,
  type PlanetName,
  type PlanetPosition,
} from '../ephemeris';
import type { CompositeParents } from '../chartLibrary';

const TWO_PI = 2 * Math.PI;
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
 * The composite chart's stored nominal moment, realizing the ASC-MIDPOINT angle
 * frame: the composite Ascendant is the shorter-arc midpoint of the two natal
 * Ascendants (each cast at its own parent's place), and the returned jd is the
 * instant — at the geographic-midpoint place — whose Ascendant equals that
 * midpoint. The MC, every house system, parans, local space and the map lines
 * then fall out of this one stored moment via the ordinary natal pipeline, so
 * the MC is "derived from the RAMC at the midpoint latitude" (Solar Fire / Hand).
 *
 * The Ascendant sweeps a full turn over one sidereal day, monotonically at any
 * sub-polar latitude, so exactly one jd in [davisonMid ± ½ sidereal day] hits
 * the target. Bisection is robust where d(asc)/d(time) is wildly nonlinear near
 * the poles (Newton would overshoot the bracket). The caller rounds to a civil
 * minute, quantizing the frame slightly — the same convention as before.
 */
export function solveCompositeFrameJd(
  parents: CompositeParents,
  system: HouseSystem = 'placidus',
): number {
  const pa = parents.a.birthplace;
  const pb = parents.b.birthplace;
  const jdA = birthDataToJD(parents.a);
  const jdB = birthDataToJD(parents.b);
  // The composite Ascendant: shorter-arc midpoint of the two NATAL Ascendants.
  // The Ascendant is house-system-independent, so a fixed system is fine here.
  const ascA = relocate(jdA, pa.lat, pa.lng, system).asc;
  const ascB = relocate(jdB, pb.lat, pb.lng, system).asc;
  const target = shortArcMidLon(ascA, ascB);
  const midLat = (pa.lat + pb.lat) / 2;
  const midLng = midLngDeg(pa.lng, pb.lng);
  // Find the jd whose Ascendant (at the midpoint place) equals `target`. With
  // asc0 = the Ascendant at the window's start, h(jd) = wrap2pi(asc(jd) − asc0)
  // climbs 0 → 2π monotonically across the window; the root is where it reaches
  // `rel`. Only interior points are sampled, so the single 2π wrap (at the far
  // edge) never lands on a probe, and plain bisection on h converges.
  const davMid = (jdA + jdB) / 2;
  let lo = davMid - SIDEREAL_DAY / 2;
  let hi = davMid + SIDEREAL_DAY / 2;
  const asc0 = relocate(lo, midLat, midLng, system).asc;
  const rel = wrap2pi(target - asc0);
  for (let i = 0; i < 40 && hi - lo > 1e-7; i++) {
    const mid = (lo + hi) / 2;
    if (wrap2pi(relocate(mid, midLat, midLng, system).asc - asc0) < rel) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
