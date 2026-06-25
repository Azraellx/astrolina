// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the composite-midpoints math in src/lib/astro/composite.ts
// (replicated here — the app module imports the browser ephemeris, which
// doesn't load under Node): shorter-arc midpoints incl. the 0°-Aries wrap and
// the exactly-opposed tie-break, node antipodality, the ASC-midpoint frame
// solver (the composite Ascendant equals the shorter-arc midpoint of the two
// natal Ascendants, and the solved jd stays within a half sidereal day of the
// Davison midpoint), sub-polar robustness, and a/b symmetry.
//
// Run: npm run verify:composite
import swe from '@swisseph/node';
const { setEphemerisPath, julianDay, calculatePosition, calculateHouses, CalculationFlag, Planet, LunarPoint, HouseSystem } = swe;
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

setEphemerisPath(join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'ephe'));

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const TWO_PI = 2 * Math.PI;
const FLAG = CalculationFlag.SwissEphemeris | CalculationFlag.Speed;

const wrap2pi = (a) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
const wrapPi = (a) => {
  let x = a % TWO_PI;
  if (x > Math.PI) x -= TWO_PI;
  if (x <= -Math.PI) x += TWO_PI;
  return x;
};

// Mirrors composite.ts shortArcMidLon.
function shortArcMidLon(a, b, tieRef) {
  let d = wrap2pi(b - a);
  if (d > Math.PI) d -= TWO_PI;
  const mid = wrap2pi(a + d / 2);
  if (Math.abs(Math.abs(d) - Math.PI) > 1e-9) return mid;
  const other = wrap2pi(mid + Math.PI);
  if (tieRef === undefined) return mid < Math.PI ? mid : other;
  return Math.abs(wrapPi(mid - tieRef)) <= Math.abs(wrapPi(other - tieRef)) ? mid : other;
}

const lonOf = (jd, planet) =>
  wrap2pi(calculatePosition(jd, planet, FLAG).longitude * D2R);
// One chart's Ascendant (radians), the same way ephemeris.ts's relocate reads
// it (Swiss calculateHouses; the Ascendant is house-system-independent).
const ascendant = (jd, lat, lng) =>
  wrap2pi(calculateHouses(jd, lat, lng, HouseSystem.Placidus).ascendant * D2R);

// Mirrors relationship.ts midpointLng (the stored composite place's longitude).
const midLngDeg = (a, b) => {
  const diff = ((b - a + 540) % 360) - 180;
  const mid = a + diff / 2;
  return (((mid % 360) + 540) % 360) - 180;
};

const SIDEREAL_DAY = 0.9972695663;

// Mirrors composite.ts solveCompositeFrameJd: the jd whose Ascendant at the
// midpoint place equals the shorter-arc midpoint of the two natal Ascendants.
// Bisection over one sidereal day (the Ascendant sweeps a full turn there).
function solveCompositeFrameJd(jdA, latA, lngA, jdB, latB, lngB) {
  const target = shortArcMidLon(ascendant(jdA, latA, lngA), ascendant(jdB, latB, lngB));
  const midLat = (latA + latB) / 2;
  const midLng = midLngDeg(lngA, lngB);
  const davMid = (jdA + jdB) / 2;
  let lo = davMid - SIDEREAL_DAY / 2;
  let hi = davMid + SIDEREAL_DAY / 2;
  const asc0 = ascendant(lo, midLat, midLng);
  const rel = wrap2pi(target - asc0);
  for (let i = 0; i < 40 && hi - lo > 1e-7; i++) {
    const mid = (lo + hi) / 2;
    if (wrap2pi(ascendant(mid, midLat, midLng) - asc0) < rel) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

// Parents: Jim Lewis (the seed chart) and a 1948 London birth.
const jdA = julianDay(1941, 6, 5, 13.5); // 09:30 EDT = 13:30 UT
const latA = 40.71, lngA = -74.01; // parent A's birthplace
const jdB = julianDay(1948, 3, 12, 8.25);
const latB = 51.51, lngB = -0.13; // parent B's birthplace (London)

// (1) Composite Sun is the shorter-arc midpoint of the parents' Suns.
const sunA = lonOf(jdA, Planet.Sun);
const sunB = lonOf(jdB, Planet.Sun);
const sunMid = shortArcMidLon(sunA, sunB);
const dA = Math.abs(wrapPi(sunMid - sunA));
const dB = Math.abs(wrapPi(sunMid - sunB));
check(
  'composite Sun equidistant on the shorter arc',
  Math.abs(dA - dB) < 1e-12 && dA <= Math.PI / 2 + 1e-12,
  `each side ${(dA * R2D).toFixed(4)}°`,
);

// (2) 0°-Aries wrap: 350° and 10° must midpoint at 0°, not 180°.
check(
  'wrap midpoint (350°,10°) → 0°',
  Math.abs(wrapPi(shortArcMidLon(350 * D2R, 10 * D2R))) < 1e-12,
);

// (3) Exactly-opposed tie-break lands on the side nearer the reference.
const tied = shortArcMidLon(0, Math.PI, 100 * D2R);
check(
  'opposed pair takes the near-Sun side',
  Math.abs(wrapPi(tied - 90 * D2R)) < 1e-9,
  `chose ${(wrap2pi(tied) * R2D).toFixed(1)}°`,
);

// (4) Node antipodality: SN midpoint is exactly NN midpoint + 180°.
const nnMid = shortArcMidLon(lonOf(jdA, LunarPoint.MeanNode), lonOf(jdB, LunarPoint.MeanNode), sunMid);
const snMid = shortArcMidLon(
  wrap2pi(lonOf(jdA, LunarPoint.MeanNode) + Math.PI),
  wrap2pi(lonOf(jdB, LunarPoint.MeanNode) + Math.PI),
  sunMid,
);
check(
  'south-node midpoint antipodal to north-node midpoint',
  Math.abs(wrapPi(snMid - nnMid - Math.PI)) < 1e-9,
);

// (5) Frame solver: the composite Ascendant at the midpoint place equals the
// shorter-arc midpoint of the two natal Ascendants (Solar Fire / Hand), and the
// solved jd stays inside the half-sidereal-day window the bisection searches.
const target = shortArcMidLon(ascendant(jdA, latA, lngA), ascendant(jdB, latB, lngB));
const midLat = (latA + latB) / 2;
const midLng = midLngDeg(lngA, lngB);
const jdStar = solveCompositeFrameJd(jdA, latA, lngA, jdB, latB, lngB);
const ascResidual = Math.abs(wrapPi(ascendant(jdStar, midLat, midLng) - target));
check(
  'solver: composite Ascendant = shorter-arc midpoint of the natal Ascendants',
  ascResidual < 1e-6,
  `residual ${(ascResidual * R2D * 3600).toFixed(2)}″`,
);
check(
  'solver stays within ½ sidereal day of the Davison midpoint',
  Math.abs(jdStar - (jdA + jdB) / 2) <= SIDEREAL_DAY / 2 + 1e-9,
  `${((jdStar - (jdA + jdB) / 2) * 24).toFixed(2)} h offset`,
);
// (5b) Sub-polar robustness: a high midpoint latitude still solves — bisection
// holds where the Ascendant's rate is sharply nonlinear (Newton would overshoot).
const polarStar = solveCompositeFrameJd(jdA, 64.1, -21.9, jdB, 59.9, 10.7);
const polarTarget = shortArcMidLon(ascendant(jdA, 64.1, -21.9), ascendant(jdB, 59.9, 10.7));
check(
  'solver converges at a sub-polar midpoint latitude (~62°N)',
  Math.abs(
    wrapPi(ascendant(polarStar, (64.1 + 59.9) / 2, midLngDeg(-21.9, 10.7)) - polarTarget),
  ) < 1e-5,
);

// (6) Symmetry: swapping the parents changes nothing — including at the
// exactly-opposed tie, where the no-tieRef rule fixes the [0, π) candidate.
check(
  'a/b symmetry (Sun midpoint)',
  Math.abs(wrapPi(shortArcMidLon(sunB, sunA) - sunMid)) < 1e-12,
);
check(
  'a/b symmetry (frame solver)',
  Math.abs(solveCompositeFrameJd(jdB, latB, lngB, jdA, latA, lngA) - jdStar) < 1e-6,
);
check(
  'a/b symmetry at the exact tie (no tieRef)',
  shortArcMidLon(0, Math.PI) === shortArcMidLon(Math.PI, 0),
  `both ${(shortArcMidLon(0, Math.PI) * R2D).toFixed(1)}°`,
);

// (7) Node antipodality survives the exactly-opposed tie: composite.ts now
// DERIVES the South Node as NN-midpoint + 180° instead of midpointing the
// antipodes independently (which the shared near-Sun rule would collapse).
const tiedNN = shortArcMidLon(0.7, 0.7 + Math.PI, 100 * D2R);
const derivedSN = wrap2pi(tiedNN + Math.PI);
check(
  'derived south node antipodal even at the tie',
  Math.abs(wrapPi(derivedSN - tiedNN - Math.PI)) < 1e-12,
);

process.exit(failures ? 1 : 0);
