// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the Part of Fortune (Lot of Fortune) math in src/lib/ephemeris.ts
// (partOfFortuneLon + the sect test of isDayBirth, replicated here — the app
// module imports the browser ephemeris, which doesn't load under Node):
//   • the sect flip: day = Asc + Moon − Sun, night = Asc + Sun − Moon, and the
//     two results mirror across the Ascendant (a worked example whose day/night
//     degrees are 27°Leo20 / 22°Cancer40 — see the Part-of-Fortune question memo);
//   • Ptolemaic (fixed) uses the day formula regardless of sect;
//   • a real day birth (noon) and night birth (midnight): the Sun's altitude at
//     the birthplace classifies sect (≥ 0 ⇒ day), and the derived Fortune degrees
//     are printed for a manual Astro-Seek / Solar Fire cross-check.
//
// Run: npm run verify:fortune
import swe from '@swisseph/node';
const { setEphemerisPath, julianDay, calculatePosition, calculateHouses, CalculationFlag, Planet, HouseSystem } = swe;
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

setEphemerisPath(join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'ephe'));

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const TWO_PI = 2 * Math.PI;
const FLAG = CalculationFlag.SwissEphemeris | CalculationFlag.Speed;
const EQ_FLAG = FLAG | CalculationFlag.Equatorial;
const wrap2pi = (a) => ((a % TWO_PI) + TWO_PI) % TWO_PI;

// ── replicas of src/lib/ephemeris.ts (radians in/out) ────────────────────────
function partOfFortuneLon(ascLon, sunLon, moonLon, day, formula) {
  const useDay = formula === 'ptolemaic' ? true : day;
  return wrap2pi(useDay ? ascLon + moonLon - sunLon : ascLon + sunLon - moonLon);
}
// Sun on or above the true horizon ⇒ day (inclusive). armc (deg) is the local
// sidereal time; H = LST − RA; alt = asin(sinφ sinδ + cosφ cosδ cosH).
function isDayBirth(jd, latDeg, lngDeg) {
  const { longitude: raDeg, latitude: decDeg } = calculatePosition(jd, Planet.Sun, EQ_FLAG);
  const lst = calculateHouses(jd, latDeg, lngDeg, HouseSystem.Placidus).armc * D2R;
  const phi = latDeg * D2R, ra = raDeg * D2R, dec = decDeg * D2R;
  const H = lst - ra;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  return { day: alt >= 0, altDeg: alt * R2D };
}

// ── formatting + assertions ──────────────────────────────────────────────────
const SIGNS = ['Ari','Tau','Gem','Can','Leo','Vir','Lib','Sco','Sag','Cap','Aqu','Pis'];
function fmt(lonRad) {
  const d = ((lonRad * R2D) % 360 + 360) % 360;
  const sign = Math.floor(d / 30);
  const inSign = d - sign * 30;
  const deg = Math.floor(inSign);
  const min = Math.round((inSign - deg) * 60);
  return `${String(deg).padStart(2,'0')}°${SIGNS[sign]}${String(min).padStart(2,'0')}'`;
}
let fails = 0;
function assert(name, got, wantRad, tolDeg = 1 / 60) {
  const diff = Math.abs(((got - wantRad + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI) * R2D;
  const ok = diff <= tolDeg;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}: ${fmt(got)}${ok ? '' : `  (want ${fmt(wantRad)}, off ${diff.toFixed(3)}°)`}`);
  if (!ok) fails++;
}
function assertBool(name, got, want) {
  const ok = got === want;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}: ${got}${ok ? '' : `  (want ${want})`}`);
  if (!ok) fails++;
}

// 1 · Pure formula + sect flip (the worked memo example). Asc 10°Leo, Sun 15°Sco20',
//     Moon 2°Sag40'.  Day → 27°Leo20',  Night → 22°Can40'  (mirror across the Asc).
const asc = 130 * D2R, sun = (225 + 20 / 60) * D2R, moon = (242 + 40 / 60) * D2R;
console.log('— sect flip (worked example) —');
assert('day  (Asc+Moon−Sun)', partOfFortuneLon(asc, sun, moon, true, 'sect'), (147 + 20 / 60) * D2R);
assert('night (Asc+Sun−Moon)', partOfFortuneLon(asc, sun, moon, false, 'sect'), (112 + 40 / 60) * D2R);
assert('ptolemaic on a night chart = day formula', partOfFortuneLon(asc, sun, moon, false, 'ptolemaic'), (147 + 20 / 60) * D2R);

// 2 · Real charts — noon (day) and midnight (night) at London, 1990-06-15 UT.
const LAT = 51.5074, LNG = -0.1278;
for (const [label, hour, wantDay] of [['noon  ', 12, true], ['midnite', 0, false]]) {
  const jd = julianDay(1990, 6, 15, hour);
  const { day, altDeg } = isDayBirth(jd, LAT, LNG);
  const ascLon = calculateHouses(jd, LAT, LNG, HouseSystem.Placidus).ascendant * D2R;
  const sunLon = wrap2pi(calculatePosition(jd, Planet.Sun, FLAG).longitude * D2R);
  const moonLon = wrap2pi(calculatePosition(jd, Planet.Moon, FLAG).longitude * D2R);
  const sect = partOfFortuneLon(ascLon, sunLon, moonLon, day, 'sect');
  const ptol = partOfFortuneLon(ascLon, sunLon, moonLon, day, 'ptolemaic');
  console.log(`\n— ${label} (Sun alt ${altDeg.toFixed(1)}°, ${day ? 'day' : 'night'}) —`);
  console.log(`   Asc ${fmt(ascLon)}  Sun ${fmt(sunLon)}  Moon ${fmt(moonLon)}`);
  console.log(`   Fortune  sect ${fmt(sect)}   ptolemaic ${fmt(ptol)}`);
  assertBool(`${label.trim()} sect classification`, day, wantDay);
}

console.log(fails === 0 ? '\nAll Fortune checks passed.' : `\n${fails} Fortune check(s) FAILED.`);
process.exit(fails === 0 ? 0 : 1);
