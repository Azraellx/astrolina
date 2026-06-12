// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the bundled star catalog + the position-of-date math used by
// src/lib/astro/starLines.ts (replicated here — the app module imports the
// browser ephemeris, which doesn't load under Node): proper motion + IAU-1976
// precession must land the classic stars on their published zodiacal degrees.
// References: standard fixed-star ephemeris longitudes (J2000 positions plus
// the ~50.3″/yr precession rate), tolerance ±0.05° (3′) — far inside the
// arcminute scale astrologers use for fixed stars.
//
// Run: npm run verify:stars
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { stars } = JSON.parse(
  readFileSync(join(root, 'src', 'lib', 'astro', 'data', 'stars.json'), 'utf8'),
);

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const J2000 = 2451545.0;
const MAS = D2R / 3_600_000;
const ARCSEC = D2R / 3600;

// Mirror of starsOfDate (starLines.ts).
function ofDate(s, jd) {
  const T = (jd - J2000) / 36525;
  const years = (jd - J2000) / 365.25;
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * ARCSEC;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * ARCSEC;
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * ARCSEC;
  const dec0 = s.dec * D2R + s.pmDec * MAS * years;
  const ra0 = s.ra * D2R + (s.pmRa * MAS * years) / Math.cos(dec0);
  const A = Math.cos(dec0) * Math.sin(ra0 + zeta);
  const B =
    Math.cos(theta) * Math.cos(dec0) * Math.cos(ra0 + zeta) -
    Math.sin(theta) * Math.sin(dec0);
  const C =
    Math.sin(theta) * Math.cos(dec0) * Math.cos(ra0 + zeta) +
    Math.cos(theta) * Math.sin(dec0);
  return { ra: Math.atan2(A, B) + z, dec: Math.asin(C) };
}

function eclipticLon(ra, dec, jd) {
  const T = (jd - J2000) / 36525;
  const eps = (23.439291 - 0.0130042 * T) * D2R; // mean obliquity is plenty here
  const lon = Math.atan2(
    Math.sin(ra) * Math.cos(eps) + Math.tan(dec) * Math.sin(eps),
    Math.cos(ra),
  );
  return ((lon * R2D) + 360) % 360;
}

const JD_2026 = 2461041.5; // 2026-01-01 TT≈UT (sub-minute slack is irrelevant)

// Published 2026 longitudes (degrees), from J2000 references + 50.29″/yr.
const CASES = [
  ['Regulus', 150.19], // 0°11′ Virgo
  ['Spica', 204.2], // 24°12′ Libra
  ['Sirius', 104.45], // 14°27′ Cancer
  ['Aldebaran', 70.13], // 10°08′ Gemini
  ['Antares', 250.12], // 10°07′ Sagittarius
];

let failures = 0;
for (const [name, expected] of CASES) {
  const s = stars.find((x) => x.name === name);
  if (!s) {
    console.log(`FAIL  ${name} missing from catalog`);
    failures++;
    continue;
  }
  const p = ofDate(s, JD_2026);
  const lon = eclipticLon(p.ra, p.dec, JD_2026);
  const ok = Math.abs(lon - expected) < 0.05;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name} 2026 lon ${lon.toFixed(3)}° (expect ~${expected}°)`,
  );
  if (!ok) failures++;
}

// Catalog sanity: tiers populated, magnitudes plausible, no duplicate names.
const names = new Set(stars.map((s) => s.name));
const t1 = stars.filter((s) => s.tier === 1).length;
const sane =
  names.size === stars.length &&
  t1 >= 10 &&
  stars.every((s) => s.mag < 4.5 && Math.abs(s.dec) <= 90);
console.log(`${sane ? 'PASS' : 'FAIL'}  catalog sanity (${stars.length} stars, ${t1} tier-1, unique names)`);
if (!sane) failures++;

process.exit(failures ? 1 : 0);
