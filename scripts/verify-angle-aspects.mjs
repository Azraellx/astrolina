// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verify the aspect/midpoint virtual-point math behind the "Aspects to angles"
// map overlays (src/lib/astro/angleAspects.ts), end-to-end against Swiss
// Ephemeris houses: standing on a computed "Sun square MC" meridian must put
// the relocated MC exactly 90° from the Sun, and likewise for the horizon.
//
// Run: node scripts/verify-angle-aspects.mjs
import {
  setEphemerisPath,
  julianDay,
  calculatePosition,
  calculateHouses,
  HouseSystem,
  CalendarType,
  CalculationFlag,
  Planet,
  LunarPoint,
} from '@swisseph/node';

setEphemerisPath(process.cwd() + '/public/ephe');

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const TWO_PI = Math.PI * 2;
const wrap2pi = (a) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
const wrapDeg = (a) => ((a % 360) + 360) % 360;

// ── Mirrors of the app's pure transforms (ephemeris.ts / angleAspects.ts) ────
const eclipticLonOfRA = (ra, eps) =>
  wrap2pi(Math.atan2(Math.sin(ra), Math.cos(ra) * Math.cos(eps)));

function eclipticToRaDec(lon, lat, eps) {
  const x = Math.cos(lat) * Math.cos(lon);
  const y = Math.cos(lat) * Math.sin(lon);
  const z = Math.sin(lat);
  const ye = y * Math.cos(eps) - z * Math.sin(eps);
  const ze = y * Math.sin(eps) + z * Math.cos(eps);
  return {
    ra: wrap2pi(Math.atan2(ye, x)),
    dec: Math.atan2(ze, Math.sqrt(x * x + ye * ye)),
  };
}

const raDecToEclipticLon = (ra, dec, eps) =>
  wrap2pi(
    Math.atan2(
      Math.sin(ra) * Math.cos(eps) + Math.tan(dec) * Math.sin(eps),
      Math.cos(ra),
    ),
  );

function shortArcMid(a, b) {
  let d = wrap2pi(b - a);
  if (d > Math.PI) d -= TWO_PI;
  return wrap2pi(a + d / 2);
}

// ── Test scaffolding ──────────────────────────────────────────────────────────
let failures = 0;
function check(name, actual, expected, tolDeg = 1e-6) {
  // Compare as angles in degrees, modulo 360.
  const err = Math.abs(((actual - expected + 180) % 360 + 360) % 360 - 180);
  const ok = err <= tolDeg;
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}  (err ${err.toExponential(2)}°)`,
  );
}
function checkTrue(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

// Einstein 1879-03-14 11:30 LMT Ulm — same fixture as verify-relocate.mjs.
const jd0 = julianDay(1879, 3, 14, 0, CalendarType.Gregorian);
const jd = jd0 + (11.5 - 0.6166666666666667) / 24;

const FLAG = CalculationFlag.SwissEphemeris;
const sunEcl = calculatePosition(jd, Planet.Sun, FLAG);
const sunEqu = calculatePosition(jd, Planet.Sun, FLAG | CalculationFlag.Equatorial);
const nut = calculatePosition(jd, Planet.EclipticNutation, FLAG);
const eps = nut.longitude * DEG2RAD; // true obliquity of date

const sun = {
  lon: sunEcl.longitude * DEG2RAD,
  ra: sunEqu.longitude * DEG2RAD,
  dec: sunEqu.latitude * DEG2RAD,
};
// GMST via Swiss ARMC at longitude 0 (same trick as verify-relocate.mjs).
const gmst = calculateHouses(jd, 0, 0, HouseSystem.WholeSign).armc * DEG2RAD;

console.log('JD:', jd, ' Sun λ:', (sun.lon * RAD2DEG).toFixed(4) + '°');

// 1. shortArcMid wraps across 0° Aries.
check(
  'shortArcMid(350°, 10°) = 0°',
  shortArcMid(350 * DEG2RAD, 10 * DEG2RAD) * RAD2DEG,
  0,
);
check(
  'shortArcMid is order-independent',
  shortArcMid(10 * DEG2RAD, 350 * DEG2RAD) * RAD2DEG,
  shortArcMid(350 * DEG2RAD, 10 * DEG2RAD) * RAD2DEG,
);

// 2. Zodiacal square: the virtual point sits 90° of ecliptic longitude ahead.
{
  const lonV = wrap2pi(sun.lon + 90 * DEG2RAD);
  const v = eclipticToRaDec(lonV, 0, eps);
  check(
    'zodiacal: λ(virtual) − λ(Sun) = 90°',
    (raDecToEclipticLon(v.ra, v.dec, eps) - sun.lon) * RAD2DEG,
    90,
  );
}

// 3. IN-MUNDO square (latitude RETAINED): the map's mundo mode advances the body
//    by 90° of ecliptic longitude WITHOUT dropping its ecliptic latitude — the
//    virtual point is (λ+90, β), matching Solar Fire / Matrix Horizons. Tested
//    end-to-end with Pluto (well off the ecliptic): stand on that point's meridian
//    at 47°N and Swiss's culminating ecliptic degree is eclipticLonOfRA of the
//    point's RA. Because the point carries latitude, that MC is NOT 90° from
//    Pluto, so the mundo line sits measurably off the zodiacal square-MC line —
//    exactly the difference the audit flagged.
{
  const pEcl = calculatePosition(jd, Planet.Pluto, FLAG);
  const pEqu = calculatePosition(jd, Planet.Pluto, FLAG | CalculationFlag.Equatorial);
  const pl = { lon: pEcl.longitude * DEG2RAD, lat: pEcl.latitude * DEG2RAD };
  const vm = eclipticToRaDec(wrap2pi(pl.lon + 90 * DEG2RAD), pl.lat, eps); // β retained
  const lngM = ((((vm.ra - gmst) * RAD2DEG + 180) % 360) + 360) % 360 - 180;
  const hM = calculateHouses(jd, 47.0, lngM, HouseSystem.Placidus);
  check(
    'mundo square: MC on the (λ+90, β) line = eclipticLonOfRA(that point’s RA)',
    hM.mc,
    eclipticLonOfRA(vm.ra, eps) * RAD2DEG,
    1e-3,
  );
  const sepMC = Math.abs(
    ((hM.mc - (pl.lon * RAD2DEG + 90) + 180) % 360 + 360) % 360 - 180,
  );
  const betaDeg = pl.lat * RAD2DEG;
  if (Math.abs(betaDeg) > 0.5) {
    checkTrue(
      'mundo square carries latitude: MC differs from the zodiacal +90°',
      sepMC > 0.2,
      `${sepMC.toFixed(2)}° off, β=${betaDeg.toFixed(2)}°`,
    );
  } else {
    console.log(
      `SKIP  mundo-vs-zodiacal discriminator (β=${betaDeg.toFixed(2)}° too small on this date)`,
    );
  }
}

// 4. Antipodal symmetry (justifies dropping the South Node — its aspect set
//    coincides with the North Node's): a point's four lines equal its antipode's
//    lines with MC↔IC and ASC↔DSC swapped, in either frame. In ZODIACO the +a
//    and −a points are exact antipodes (so one +a point suffices per aspect); in
//    MUNDO they are NOT (the antipode negates the latitude), which is precisely
//    why the mundo generator draws BOTH signs.
{
  const a = 60 * DEG2RAD;
  const p1 = eclipticToRaDec(wrap2pi(sun.lon + a), 0, eps);
  const p2 = eclipticToRaDec(wrap2pi(sun.lon + Math.PI + a), 0, eps);
  check('zodiaco antipode: ΔRA = 180°', (p2.ra - p1.ra) * RAD2DEG, 180);
  check('zodiaco antipode: dec negated', (p2.dec + p1.dec) * RAD2DEG, 0, 1e-9);
  // A latitude-carrying body: its +a and −a mundo points are distinct (not the
  // same line), so both must be drawn. Use Pluto (well off the ecliptic).
  const pEcl = calculatePosition(jd, Planet.Pluto, FLAG);
  const beta = pEcl.latitude * DEG2RAD;
  const lon = pEcl.longitude * DEG2RAD;
  const vPlus = eclipticToRaDec(wrap2pi(lon + a), beta, eps);
  const vMinus = eclipticToRaDec(wrap2pi(lon - a), beta, eps);
  // Angular RA separation in [0, 180]: neither ~0 (same line) nor ~180 (antipodal
  // → one would substitute for the other). It is ~2a skewed by the latitude.
  const dRa = Math.abs(
    (((vPlus.ra - vMinus.ra) * RAD2DEG + 180) % 360 + 360) % 360 - 180,
  );
  checkTrue(
    'mundo: the +a and −a points are distinct, non-antipodal lines (both drawn)',
    dRa > 1 && dRa < 179,
    `ΔRA ${dRa.toFixed(1)}°`,
  );
}

// 5. END-TO-END (zodiacal square MC): stand on the virtual point's meridian
//    (celestial system: lng = RA − GMST) and ask Swiss for the local MC — it
//    must be exactly 90° from the Sun.
{
  const lonV = wrap2pi(sun.lon + 90 * DEG2RAD);
  const v = eclipticToRaDec(lonV, 0, eps);
  const lng = wrapDeg((v.ra - gmst) * RAD2DEG);
  const h = calculateHouses(jd, 47.0, ((lng + 180) % 360) - 180, HouseSystem.Placidus);
  check(
    'end-to-end: MC on "Su □ MC" meridian = λ(Sun) + 90°',
    h.mc,
    wrapDeg(sun.lon * RAD2DEG + 90),
    1e-3,
  );
}

// 6. END-TO-END (zodiacal sextile ASC): solve the virtual point's rising curve
//    at 47°N (hour angle H: cos H = −tanφ·tanδ, rising side H < 0; the app's
//    lines.ts traces the same relation), stand there, ask Swiss for the ASC.
{
  const lonV = wrap2pi(sun.lon + 60 * DEG2RAD);
  const v = eclipticToRaDec(lonV, 0, eps);
  const phi = 47 * DEG2RAD;
  const H = -Math.acos(-Math.tan(phi) * Math.tan(v.dec));
  const lng = ((((v.ra + H - gmst) * RAD2DEG + 180) % 360) + 360) % 360 - 180;
  const h = calculateHouses(jd, 47.0, lng, HouseSystem.Placidus);
  check(
    'end-to-end: ASC on "Su ⚹ ASC" line = λ(Sun) + 60°',
    h.ascendant,
    wrapDeg(sun.lon * RAD2DEG + 60),
    1e-3,
  );
}

// 7. END-TO-END (zodiacal midpoint on MC): Sun/Moon midpoint culminating.
{
  const moonEcl = calculatePosition(jd, Planet.Moon, FLAG);
  const mid = shortArcMid(sun.lon, moonEcl.longitude * DEG2RAD);
  const v = eclipticToRaDec(mid, 0, eps);
  const lng = ((((v.ra - gmst) * RAD2DEG + 180) % 360) + 360) % 360 - 180;
  const h = calculateHouses(jd, 47.0, lng, HouseSystem.Placidus);
  const dSun = Math.abs(((h.mc - sun.lon * RAD2DEG + 180) % 360 + 360) % 360 - 180);
  const dMoon = Math.abs(
    ((h.mc - moonEcl.longitude + 180) % 360 + 360) % 360 - 180,
  );
  check('end-to-end: Su/Mo midpoint MC equidistant', dSun, dMoon, 1e-3);
}

// 8. GOLDEN (in-mundo bodily midpoint): 1963-09-22 22:48 UTC-4 Toronto chart.
//    The Mars/South-Node midpoint (mean RA + mean declination) setting line
//    must cross 43.5°N at ≈ −79.7° — over Hamilton/Toronto, cross-checked
//    against Solar Maps. The on-ecliptic projection this replaced put it ~5°
//    west (Detroit), which is how the convention bug was caught.
{
  const jd2 =
    julianDay(1963, 9, 22, 0, CalendarType.Gregorian) + (22 + 48 / 60 + 4) / 24;
  const eps2 =
    calculatePosition(jd2, Planet.EclipticNutation, FLAG).longitude * DEG2RAD;
  const gmst2 = calculateHouses(jd2, 0, 0, HouseSystem.WholeSign).armc * DEG2RAD;
  const equ = (id) => {
    const q = calculatePosition(jd2, id, FLAG | CalculationFlag.Equatorial);
    return { ra: q.longitude * DEG2RAD, dec: q.latitude * DEG2RAD };
  };
  const ecl = (id) => calculatePosition(jd2, id, FLAG);
  const ma = equ(Planet.Mars);
  // South Node = exact antipode of the true node (lon+180, lat negated).
  const nnE = ecl(LunarPoint.TrueNode);
  const sn = eclipticToRaDec(
    wrap2pi(nnE.longitude * DEG2RAD + Math.PI),
    -nnE.latitude * DEG2RAD,
    eps2,
  );
  const raM = shortArcMid(ma.ra, sn.ra);
  const decM = (ma.dec + sn.dec) / 2;
  const x = -Math.tan(43.5 * DEG2RAD) * Math.tan(decM);
  const lng =
    ((((raM + Math.acos(x) - gmst2) * RAD2DEG + 180) % 360) + 360) % 360 - 180;
  check('golden: bodily Ma/SN midpoint Ds @43.5N ≈ −79.70°', lng, -79.7, 0.05);
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
