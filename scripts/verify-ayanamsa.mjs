// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies src/lib/astro/ayanamsa.ts (replicated here — the app module's
// import chain pulls the browser ephemeris) against the REAL Swiss Ephemeris
// ayanamsa via @swisseph/node's setSiderealMode/getAyanamsa, for Lahiri and
// Fagan/Bradley across 1800–2399, plus the whole-sign sidereal cusp rebuild.
//
// Run: npm run verify:ayanamsa
import swe from '@swisseph/node';
const { setEphemerisPath, julianDay, setSiderealMode, getAyanamsa, SiderealMode } = swe;
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

setEphemerisPath(join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'ephe'));

const ARCSEC_DEG = 1 / 3600;
const J2000 = 2451545.0;

// Mirror of ayanamsa.ts (degrees out, for readable diffs).
function pA(jd) {
  const T = (jd - J2000) / 36525;
  return (((-0.000023857 * T + 0.00007964) * T + 1.1054348) * T + 5028.796195) * T;
}
const ANCHORS = {
  // Mean-equinox anchors per Swiss (Lahiri's published true-equinox value
  // minus the ~16.8″ nutation at its epoch).
  lahiri: { t0: 2435553.5, ayan0: 23.250182778 - 0.004658035 },
  'fagan-bradley': { t0: 2433282.5, ayan0: 24.042044444 },
};
function ayanamsaDeg(jd, mode) {
  const { t0, ayan0 } = ANCHORS[mode];
  return ayan0 + (pA(jd) - pA(t0)) * ARCSEC_DEG;
}

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const YEARS = [1800, 1900, 1950, 2000, 2026, 2100, 2399];
const MODES = [
  ['lahiri', SiderealMode.Lahiri],
  ['fagan-bradley', SiderealMode.FaganBradley],
];

// Tolerance: with the mean-equinox anchors the agreement with Swiss is
// sub-arcsecond for both modes; 2″ leaves headroom without masking an anchor
// or polynomial regression (the old 36″ tolerance hid a 16.6″ anchor bias).
const TOL_DEG = 2 / 3600;

for (const [mode, swissMode] of MODES) {
  setSiderealMode(swissMode, 0, 0);
  let worst = 0;
  for (const y of YEARS) {
    const jd = julianDay(y, 1, 1, 0);
    const diff = Math.abs(ayanamsaDeg(jd, mode) - getAyanamsa(jd));
    if (diff > worst) worst = diff;
  }
  check(
    `${mode} matches Swiss across 1800–2399`,
    worst <= TOL_DEG,
    `worst ${(worst * 3600).toFixed(1)}″`,
  );
}

// Sanity anchors: the well-known ballpark values.
const lah2000 = ayanamsaDeg(julianDay(2000, 1, 1, 0), 'lahiri');
check('Lahiri ≈ 23°51′ at J2000', Math.abs(lah2000 - 23.853) < 0.02, `${lah2000.toFixed(4)}°`);
const fb2000 = ayanamsaDeg(julianDay(2000, 1, 1, 0), 'fagan-bradley');
check('Fagan/Bradley ≈ 24°44′ at J2000', Math.abs(fb2000 - 24.74) < 0.03, `${fb2000.toFixed(4)}°`);

// Whole-sign rebuild (mirror of shiftAngles' sidereal branch): the sidereal
// cusps are exact 30° boundaries starting at the sidereal ASC's sign.
const TWO_PI = 2 * Math.PI;
const wrap2pi = (a) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
const THIRTY = Math.PI / 6;
const ayanRad = (24.2 * Math.PI) / 180;
const ascTrop = (200.5 * Math.PI) / 180; // 20°30′ Libra tropical
const ascSid = wrap2pi(ascTrop - ayanRad); // ≈ 176.3° = Virgo sidereal
const cusps = Array.from({ length: 12 }, (_, i) =>
  wrap2pi(Math.floor(ascSid / THIRTY) * THIRTY + i * THIRTY),
);
check(
  'whole-sign sidereal cusp 1 = start of the sidereal ASC sign',
  Math.abs(cusps[0] - (150 * Math.PI) / 180) < 1e-12 && cusps.every(
    (c, i) => Math.abs(wrap2pi(c - cusps[0]) - wrap2pi(i * THIRTY)) < 1e-9,
  ),
  `cusp1 ${(cusps[0] * 180 / Math.PI).toFixed(1)}° (Virgo 0°)`,
);

process.exit(failures ? 1 : 0);
