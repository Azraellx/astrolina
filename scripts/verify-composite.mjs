// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the composite-midpoints math in src/lib/astro/composite.ts
// (replicated here — the app module imports the browser ephemeris, which
// doesn't load under Node): shorter-arc midpoints incl. the 0°-Aries wrap and
// the exactly-opposed tie-break, node antipodality, the sidereal-frame solver
// (gmst(jd*) equals the midpoint frame at machine precision; the stored-minute
// quantization stays ≤ 0.13°), and a/b symmetry.
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
// Greenwich apparent sidereal time, the same way ephemeris.ts reads it (ARMC
// at lat/lng 0).
const gmst = (jd) => wrap2pi(calculateHouses(jd, 0, 0, HouseSystem.WholeSign).armc * D2R);

// Mirrors composite.ts solveCompositeJd. The 5e-9 break matches the
// representation floor: one ULP of a modern jd is ~3e-9 rad of sidereal angle.
const SIDEREAL_DAY = 0.9972695663;
function solveCompositeJd(jdA, jdB) {
  const target = shortArcMidLon(gmst(jdA), gmst(jdB));
  let jd = (jdA + jdB) / 2;
  for (let i = 0; i < 6; i++) {
    const err = wrapPi(target - gmst(jd));
    if (Math.abs(err) < 5e-9) break;
    jd += (err / TWO_PI) * SIDEREAL_DAY;
  }
  return jd;
}

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

// Parents: Jim Lewis (the seed chart) and a 1948 London birth.
const jdA = julianDay(1941, 6, 5, 13.5); // 09:30 EDT = 13:30 UT
const jdB = julianDay(1948, 3, 12, 8.25);

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

// (5) Frame solver: gmst(jd*) hits the midpoint frame; jd* stays near the
// Davison midpoint; the stored-minute rounding keeps the frame within 0.13°.
const target = shortArcMidLon(gmst(jdA), gmst(jdB));
const jdStar = solveCompositeJd(jdA, jdB);
check(
  'solver: gmst(jd*) = frame midpoint (≤ jd ULP floor)',
  Math.abs(wrapPi(gmst(jdStar) - target)) < 5e-9,
  `residual ${Math.abs(wrapPi(gmst(jdStar) - target)).toExponential(1)} rad`,
);
check(
  'solver stays near the Davison midpoint',
  Math.abs(jdStar - (jdA + jdB) / 2) < 0.6,
  `${((jdStar - (jdA + jdB) / 2) * 24).toFixed(2)} h offset`,
);
const jdRounded = Math.round(jdStar * 1440) / 1440; // nearest minute
check(
  'minute quantization ≤ 0.13° of frame',
  Math.abs(wrapPi(gmst(jdRounded) - target)) * R2D <= 0.13,
  `${(Math.abs(wrapPi(gmst(jdRounded) - target)) * R2D).toFixed(4)}°`,
);

// (6) Symmetry: swapping the parents changes nothing — including at the
// exactly-opposed tie, where the no-tieRef rule fixes the [0, π) candidate.
check(
  'a/b symmetry (Sun midpoint)',
  Math.abs(wrapPi(shortArcMidLon(sunB, sunA) - sunMid)) < 1e-12,
);
check(
  'a/b symmetry (frame solver)',
  Math.abs(solveCompositeJd(jdB, jdA) - jdStar) < 1e-8,
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
