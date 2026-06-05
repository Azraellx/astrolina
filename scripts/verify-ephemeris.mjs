// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Sanity check: compute body positions for known dates via Swiss Ephemeris (the
// same engine + flags the app uses) and print MC-line longitudes. Compare against
// astro.com's free ACG tool / Astrodienst ephemeris.
//
// Uses @swisseph/node (the Node build of the same Swiss Ephemeris) reading the
// self-hosted .se1 files from public/ephe — identical numbers to the browser
// build the app ships.
//
// Run: node scripts/verify-ephemeris.mjs
import {
  setEphemerisPath,
  julianDay,
  calculatePosition,
  calculateHouses,
  Planet,
  LunarPoint,
  Asteroid,
  CalculationFlag,
  HouseSystem,
  CalendarType,
} from '@swisseph/node';

setEphemerisPath(process.cwd() + '/public/ephe');

const SWISS = CalculationFlag.SwissEphemeris | CalculationFlag.Speed;
const SWISS_EQ = SWISS | CalculationFlag.Equatorial;

// Mirror ephemeris.ts birthDataToJD: JD at 0h UT + fractional UT hour.
function jdOf(year, month, day, hour, minute, tzOffset) {
  const jd0 = julianDay(year, month, day, 0, CalendarType.Gregorian);
  return jd0 + (hour + minute / 60 - tzOffset) / 24;
}

// Mirror ephemeris.ts gmstRadians: ARMC at lon 0 = Greenwich apparent sidereal
// time (degrees).
function gmstDeg(jd) {
  const h = calculateHouses(jd, 0, 0, HouseSystem.WholeSign);
  return ((h.armc % 360) + 360) % 360;
}

const BODIES = [
  ['Sun', Planet.Sun],
  ['Moon', Planet.Moon],
  ['Mercury', Planet.Mercury],
  ['Venus', Planet.Venus],
  ['Mars', Planet.Mars],
  ['Jupiter', Planet.Jupiter],
  ['Saturn', Planet.Saturn],
  ['Uranus', Planet.Uranus],
  ['Neptune', Planet.Neptune],
  ['Pluto', Planet.Pluto],
  // Extras (no astronomia baseline — Swiss is the reference):
  ['NorthNode', LunarPoint.MeanNode],
  ['Lilith', LunarPoint.MeanApogee],
  ['Chiron', Asteroid.Chiron],
  ['Ceres', Asteroid.Ceres],
];

function fmtLng(raDeg, gmst) {
  let d = raDeg - gmst;
  d = (((d + 180) % 360) + 360) % 360 - 180;
  return d.toFixed(2);
}

function report(label, year, month, day, hour, minute, tzOffset) {
  const jd = jdOf(year, month, day, hour, minute, tzOffset);
  const gmst = gmstDeg(jd);
  console.log(`\n=== ${label} ===`);
  console.log(`JD: ${jd.toFixed(5)}    GMST: ${gmst.toFixed(2)}°`);
  console.log('Body      RA°      Dec°    MC-line lng°');
  for (const [name, id] of BODIES) {
    const eq = calculatePosition(jd, id, SWISS_EQ); // RA in .longitude, dec in .latitude
    console.log(
      `${name.padEnd(9)} ${eq.longitude.toFixed(2).padStart(7)} ${eq.latitude
        .toFixed(2)
        .padStart(7)} ${fmtLng(eq.longitude, gmst).padStart(8)}`,
    );
  }
}

// Einstein: 1879-03-14 11:30 LMT (Ulm 9.9876°E → tz offset ~+0.6166h)
report('Einstein 1879-03-14 11:30 LMT Ulm', 1879, 3, 14, 11, 30, 0.6166666666666667);

// J2000.0 epoch: 2000-01-01 12:00 UTC. Sun's RA should be ~281°, GMST ~280.5°.
report('J2000.0 reference (2000-01-01 12:00 UTC)', 2000, 1, 1, 12, 0, 0);

// Summer solstice sanity check.
report('2024-06-21 12:00 UTC (summer solstice)', 2024, 6, 21, 12, 0, 0);

// Eastern-tz case: exercises a large UT-hour offset (Tokyo, +9, early morning →
// the local civil day differs from the UT day). Tests birthDataToJD's 0h+frac path.
report('Tokyo 1990-05-15 06:00 JST (tz +9)', 1990, 5, 15, 6, 0, 9);
