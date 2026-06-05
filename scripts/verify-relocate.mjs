// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verify relocated angles (ASC/MC) via Swiss Ephemeris houses — the same engine
// the app uses. Compare against published chart data / astro.com.
//
// Run: node scripts/verify-relocate.mjs
import {
  setEphemerisPath,
  julianDay,
  calculateHouses,
  HouseSystem,
  CalendarType,
} from '@swisseph/node';

setEphemerisPath(process.cwd() + '/public/ephe');

function jdOf(y, m, d, h, min, tz) {
  const jd0 = julianDay(y, m, d, 0, CalendarType.Gregorian);
  return jd0 + (h + min / 60 - tz) / 24;
}

function gmstDeg(jd) {
  const h = calculateHouses(jd, 0, 0, HouseSystem.WholeSign);
  return ((h.armc % 360) + 360) % 360;
}

// Mirror ephemeris.ts relocate(): Swiss houses → asc/mc (degrees).
function relocate(jd, latDeg, lngDeg, system = HouseSystem.Placidus) {
  const h = calculateHouses(jd, latDeg, lngDeg, system);
  return { asc: h.ascendant, mc: h.mc, cusp1: h.cusps[1] };
}

const SIGNS = ['Ari', 'Tau', 'Gem', 'Can', 'Leo', 'Vir', 'Lib', 'Sco', 'Sag', 'Cap', 'Aqu', 'Pis'];
function fmt(deg) {
  const d = ((deg % 360) + 360) % 360;
  const sign = SIGNS[Math.floor(d / 30)];
  const inS = d % 30;
  const dd = Math.floor(inS);
  const mm = Math.floor((inS - dd) * 60);
  return `${dd}°${String(mm).padStart(2, '0')}' ${sign}`;
}

// Einstein 1879-03-14 11:30 LMT Ulm (9.9876E, 48.4011N, tz +0.6167)
// Published: ASC ~ 11-12° Cancer, MC ~ 13-14° Pisces (depends on source)
const jd = jdOf(1879, 3, 14, 11, 30, 0.6166666666666667);
console.log('JD:', jd);
console.log('GMST°:', gmstDeg(jd).toFixed(3));
const r = relocate(jd, 48.4011, 9.9876);
console.log('Ulm  ASC:', fmt(r.asc), '  MC:', fmt(r.mc), '  (cusp1 == asc?', Math.abs(r.cusp1 - r.asc) < 1e-6, ')');

// Same time, but New York (40.71N, -74.01W)
const r2 = relocate(jd, 40.71, -74.01);
console.log('NYC  ASC:', fmt(r2.asc), '  MC:', fmt(r2.mc));

// Same time, Tokyo (35.68N, 139.69E)
const r3 = relocate(jd, 35.68, 139.69);
console.log('Tokyo ASC:', fmt(r3.asc), '  MC:', fmt(r3.mc));
