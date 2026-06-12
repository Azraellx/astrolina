// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Composite-midpoints relationship charts. A composite has NO real moment: each
// body sits at the shorter-arc midpoint of the two parents' zodiacal
// longitudes, on the ecliptic (latitude 0). The chart still STORES a real
// moment, though — the minute whose Greenwich sidereal time best matches the
// shorter-arc midpoint of the parents' sidereal times — so every frame-driven
// consumer (gmst, relocated angles, all eight house systems via Swiss, parans,
// local space, the timeline) runs the ordinary natal pipeline untouched; only
// the PLANET POSITIONS branch to the midpoint math here (App's two position
// memos, the directed overlays' natal base, the Returns snap).
//
// Conventions (proposed defaults, under review with a practicing astrologer —
// see docs/calculation-methods.md):
//  - shorter-arc planet midpoints; an exactly-opposed pair takes the side
//    nearer the composite Sun
//  - planets on the ecliptic (latitude 0)
//  - sidereal frame = shorter-arc midpoint of the parents' sidereal times,
//    realized as a real UT minute (quantization ≤ ±0.13° of frame)
//  - reference place = the same geographic midpoint Davison uses
import {
  birthDataToJD,
  bodyLonSpeed,
  eclipticToRaDec,
  gmstRadians,
  PLANET_NAMES,
  type EclipticPosition,
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

// Mean solar days per sidereal day — converts a sidereal-angle error into the
// civil-time step that cancels it.
const SIDEREAL_DAY = 0.9972695663;

/**
 * The composite chart's stored nominal moment: the instant nearest the
 * Davison time-midpoint whose Greenwich apparent sidereal time equals the
 * shorter-arc midpoint of the parents' sidereal times. Newton on the (linear,
 * 2π-per-sidereal-day) gmst converges to the representation floor — one ULP
 * of a modern jd is ~3e-9 rad of sidereal angle, hence the 5e-9 break. The
 * caller then rounds to a storable civil minute anyway, which quantizes the
 * frame by at most ±0.13° (documented convention).
 */
export function solveCompositeJd(parents: CompositeParents): number {
  const jdA = birthDataToJD(parents.a);
  const jdB = birthDataToJD(parents.b);
  const target = shortArcMidLon(gmstRadians(jdA), gmstRadians(jdB));
  let jd = (jdA + jdB) / 2;
  for (let i = 0; i < 6; i++) {
    const err = wrapPi(target - gmstRadians(jd));
    if (Math.abs(err) < 5e-9) break;
    jd += (err / TWO_PI) * SIDEREAL_DAY;
  }
  return jd;
}
