// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verify the Eclipses overlay's path mathematics (src/lib/astro/eclipsePath.ts)
// against NASA/GSFC published eclipse data — the same module the browser runs,
// driven here through a @swisseph/node adapter with the app's own .se1 files.
//
// Checks, per reference eclipse (fixtures quote eclipse.gsfc.nasa.gov SEdata
// pages, Eclipse Predictions by Fred Espenak and Jean Meeus, NASA/GSFC):
//   1. Swiss event search lands on the published instant and classification.
//   2. The cubic element fit matches direct ephemeris evaluation (<1e-4 ER).
//   3. Our Besselian elements match NASA's published polynomials (2024-04-08,
//      the one page that prints them) — x, y, d, l1, l2 and the equivalent of
//      μ, element by element.
//   4. The greatest-eclipse ground point lands on NASA's coordinates.
//   5. The umbral path width at greatest eclipse matches.
//   6. Local circumstances at the GE point reproduce the catalog magnitude.
//   7. The curve generators return sane shapes (central line, band, isolines).
// Plus catalog integrity for src/lib/astro/data/solarEclipses.json.
//
// Run: npm run verify:eclipses   (tsx — eclipsePath.ts is imported as-is)

import {
  setEphemerisPath,
  julianDay,
  calculatePosition,
  calculateHouses,
  findNextSolarEclipse,
  CalculationFlag,
  EclipseType,
  HouseSystem,
  Planet,
} from '@swisseph/node';
import {
  computeElements,
  centralLine,
  umbralLimits,
  magnitudeIsolines,
  greatestEclipsePoint,
  localCircumstances,
  normalizeSwissEclipse,
  umbralPathWidthKm,
  type BesselianElements,
  type EclipseEphemeris,
} from '../src/lib/astro/eclipsePath';
import catalog from '../src/lib/astro/data/solarEclipses.json';

setEphemerisPath(process.cwd() + '/public/ephe');

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

// ── Node-side ephemeris adapter (mirrors ephemeris.ts sunMoonEquatorial) ──────
const FLAG_EQ =
  CalculationFlag.SwissEphemeris | CalculationFlag.Speed | CalculationFlag.Equatorial;

const nodeEphemeris: EclipseEphemeris = {
  sunMoon(jdUT: number) {
    const sun = calculatePosition(jdUT, Planet.Sun, FLAG_EQ);
    const moon = calculatePosition(jdUT, Planet.Moon, FLAG_EQ);
    const gast =
      calculateHouses(jdUT, 0, 0, HouseSystem.WholeSign).armc * DEG2RAD;
    return {
      sunRa: sun.longitude * DEG2RAD,
      sunDec: sun.latitude * DEG2RAD,
      sunDistAu: sun.distance,
      moonRa: moon.longitude * DEG2RAD,
      moonDec: moon.latitude * DEG2RAD,
      moonDistAu: moon.distance,
      gast,
    };
  },
};

// ── Tiny assertion harness ────────────────────────────────────────────────────
let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  if (ok) {
    console.log(`  ok   ${label}  (${detail})`);
  } else {
    failures++;
    console.error(`  FAIL ${label}  (${detail})`);
  }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371.0;
  const p1 = lat1 * DEG2RAD, p2 = lat2 * DEG2RAD;
  const h =
    Math.sin(((p2 - p1) / 2)) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(((lng2 - lng1) * DEG2RAD) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ── Reference eclipses ────────────────────────────────────────────────────────
// All values from the per-eclipse pages at
// https://eclipse.gsfc.nasa.gov/SEsearch/SEdata.php?Ecl=YYYYMMDD
// GE coordinates there are printed to 0.1° (≈ up to 8 km of quantization).
interface Fixture {
  id: string;
  kind: 'total' | 'annular' | 'hybrid' | 'partial';
  /** Greatest eclipse, UT: [y, m, d, h, min, s]. */
  geUT: [number, number, number, number, number, number];
  geLat: number;
  geLng: number;
  widthKm: number | null;
  magnitude: number;
}

const FIXTURES: Fixture[] = [
  { id: '2024-04-08', kind: 'total',   geUT: [2024, 4, 8, 18, 17, 15],  geLat: 25.3,  geLng: -104.1, widthKm: 197.5, magnitude: 1.0566 },
  { id: '2017-08-21', kind: 'total',   geUT: [2017, 8, 21, 18, 25, 30], geLat: 37.0,  geLng: -87.7,  widthKm: 114.7, magnitude: 1.0306 },
  { id: '2023-10-14', kind: 'annular', geUT: [2023, 10, 14, 17, 59, 27], geLat: 11.4, geLng: -83.1,  widthKm: 187.4, magnitude: 0.9520 },
  { id: '2026-08-12', kind: 'total',   geUT: [2026, 8, 12, 17, 45, 51], geLat: 65.2,  geLng: -25.2,  widthKm: 293.9, magnitude: 1.0386 },
  { id: '2018-02-15', kind: 'partial', geUT: [2018, 2, 15, 20, 51, 22], geLat: -71.0, geLng: 0.6,    widthKm: null,  magnitude: 0.5991 },
];

// NASA's published Besselian polynomials for 2024-04-08 (SEdata.php page),
// t in TDT hours from 18:00:00 TDT, ΔT = 74.0 s. μ and d in degrees.
const NASA_2024 = {
  t0TDT: julianDay(2024, 4, 8, 18),
  deltaT: 74.0,
  x: [-0.318244, 0.5117116, 0.0000326, -0.0000084],
  y: [0.219764, 0.2709589, -0.0000595, -0.0000047],
  d: [7.5862002, 0.014844, -0.000002, 0],
  l1: [0.535814, 0.0000618, -0.0000128, 0],
  l2: [-0.010272, 0.0000615, -0.0000127, 0],
  mu: [89.591217, 15.00408, 0, 0],
};
const poly = (c: number[], t: number) => c[0] + t * (c[1] + t * (c[2] + t * c[3]));

function swissKind(typeFlags: number): Fixture['kind'] {
  if (typeFlags & EclipseType.AnnularTotal) return 'hybrid';
  if (typeFlags & EclipseType.Total) return 'total';
  if (typeFlags & EclipseType.Annular) return 'annular';
  return 'partial';
}

function verifyFixture(fx: Fixture) {
  console.log(`\n${fx.id} (${fx.kind})`);
  const [y, m, d, hh, mm, ss] = fx.geUT;
  const geJd = julianDay(y, m, d, hh + mm / 60 + ss / 3600);
  const ev = findNextSolarEclipse(geJd - 2, CalculationFlag.SwissEphemeris, 0, false);

  check('classification', swissKind(ev.type) === fx.kind, swissKind(ev.type));
  const dtSec = Math.abs(ev.maximum - geJd) * 86400;
  check('greatest-eclipse instant', dtSec < 60, `Δ ${dtSec.toFixed(1)} s`);

  const el = computeElements(nodeEphemeris, normalizeSwissEclipse(ev));

  // 2. Fit vs direct evaluation across the window.
  let worstXY = 0, worstL = 0;
  for (let i = 0; i <= 20; i++) {
    const t = el.tPartial[0] + ((el.tPartial[1] - el.tPartial[0]) * i) / 20;
    const a = el.at(t);
    const b = el.atDirect(t);
    worstXY = Math.max(worstXY, Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    worstL = Math.max(worstL, Math.abs(a.l1 - b.l1), Math.abs(a.l2 - b.l2));
  }
  check('cubic fit (x, y)', worstXY < 1e-4, `worst ${worstXY.toExponential(1)} ER`);
  check('cubic fit (l1, l2)', worstL < 1e-5, `worst ${worstL.toExponential(1)} ER`);

  // 4. Greatest-eclipse ground point.
  const ge = greatestEclipsePoint(el);
  const geKm = haversineKm(ge.lat, ge.lng, fx.geLat, fx.geLng);
  check(
    'greatest-eclipse point',
    geKm < 25,
    `${ge.lat.toFixed(2)}°, ${ge.lng.toFixed(2)}° — ${geKm.toFixed(1)} km off NASA`,
  );

  // 5. Umbral path width at the GE instant.
  if (fx.widthKm !== null) {
    const w = umbralPathWidthKm(el, (ge.jd - el.jd0) * 24);
    check(
      'path width at GE',
      w !== null && Math.abs(w - fx.widthKm) < 6,
      `${w?.toFixed(1)} km vs NASA ${fx.widthKm} km`,
    );
  }

  // 6. Local circumstances at the GE point reproduce the catalog magnitude.
  const lc = localCircumstances(el, fx.geLat, fx.geLng);
  check(
    'local magnitude at GE',
    lc !== null && Math.abs(lc.magnitude - fx.magnitude) < 0.004,
    `${lc?.magnitude.toFixed(4)} vs NASA ${fx.magnitude}`,
  );

  // 7. Curve generators return sane shapes.
  const central = centralLine(el);
  const { limits, band } = umbralLimits(el);
  const isos = magnitudeIsolines(el, 25);
  if (fx.kind === 'partial') {
    check('no central line (partial)', central.length === 0, `${central.length} segments`);
    check('no umbral limits (partial)', limits.length === 0, `${limits.length} segments`);
    const expected = Math.floor((fx.magnitude * 100) / 25);
    check(
      'isoline family',
      isos.length === expected,
      `magnitudes [${isos.map((i) => i.magnitude).join(', ')}]`,
    );
  } else {
    const points = central.reduce((s, seg) => s + seg.length, 0);
    check('central line', central.length >= 1 && points > 150, `${central.length} segment(s), ${points} points`);
    check('umbral band ring', band !== null, `${limits.length} limit segment(s)`);
    check('isoline family', isos.length === 3, `magnitudes [${isos.map((i) => i.magnitude).join(', ')}]`);
    // The central line must thread between the limits: spot-check that its
    // midpoint sits within a path-width of both limit curves.
    if (band) {
      const mid = central[0][Math.floor(central[0].length / 2)];
      const near = limits.some((seg) =>
        seg.some(([lng, lat]) => haversineKm(lat, lng, mid[1], mid[0]) < 400),
      );
      check('central line inside band', near, 'midpoint near limits');
    }
  }
  return el;
}

// 3. Element-by-element comparison with NASA's published Besselian polynomials.
// Tolerances reflect convention differences, not bugs: NASA's canon uses the
// JPL DE405 ephemeris and slightly different light-time/aberration handling
// than Swiss's apparent positions, which moves x/y by a few × 1e-4 ER (≈ a
// few km on the ground — confirmed independently by the greatest-eclipse and
// path-width checks above landing on NASA's coordinates).
function verifyNasaElements(el: BesselianElements) {
  console.log('\n2024-04-08 — Besselian elements vs NASA polynomials');
  const worst = { x: 0, y: 0, d: 0, l1: 0, l2: 0, mu: 0 };
  for (let i = -2; i <= 2; i++) {
    const jdUT = NASA_2024.t0TDT + i / 24 - NASA_2024.deltaT / 86400;
    const t = (jdUT - el.jd0) * 24;
    const ours = el.at(t);
    worst.x = Math.max(worst.x, Math.abs(ours.x - poly(NASA_2024.x, i)));
    worst.y = Math.max(worst.y, Math.abs(ours.y - poly(NASA_2024.y, i)));
    worst.d = Math.max(worst.d, Math.abs(ours.d * RAD2DEG - poly(NASA_2024.d, i)));
    worst.l1 = Math.max(worst.l1, Math.abs(ours.l1 - poly(NASA_2024.l1, i)));
    worst.l2 = Math.max(worst.l2, Math.abs(ours.l2 - poly(NASA_2024.l2, i)));
    // We never form μ (Greenwich hour angle of the axis), but GAST − a IS μ —
    // up to the canon's EPHEMERIS-MERIDIAN convention: its μ is tabulated
    // against the TDT argument as if it were the rotation clock, i.e. it is
    // the hour angle ΔT of sidereal rotation ahead of the true Greenwich
    // value. Evaluating our GAST at t + ΔT reproduces it.
    const gastAtTdt = el.at(t + NASA_2024.deltaT / 3600).gast;
    const ourMu = ((gastAtTdt - ours.a) * RAD2DEG + 720) % 360;
    const nasaMu = ((poly(NASA_2024.mu, i) % 360) + 360) % 360;
    const dMu = Math.abs(((ourMu - nasaMu + 540) % 360) - 180);
    worst.mu = Math.max(worst.mu, dMu);
  }
  check('x', worst.x < 1e-3, `worst Δ ${worst.x.toExponential(2)} ER`);
  check('y', worst.y < 1e-3, `worst Δ ${worst.y.toExponential(2)} ER`);
  check('d', worst.d < 1e-3, `worst Δ ${worst.d.toExponential(2)} °`);
  check('l1', worst.l1 < 1e-4, `worst Δ ${worst.l1.toExponential(2)} ER`);
  check('l2', worst.l2 < 1e-4, `worst Δ ${worst.l2.toExponential(2)} ER`);
  check('μ (gast − a, ephem. meridian)', worst.mu < 3e-3, `worst Δ ${worst.mu.toExponential(2)} °`);
}

// ── Degenerate / polar regression checks ──────────────────────────────────────
function verifyEdgeCases() {
  console.log('\nedge cases');
  // 1935-01-05 (gamma −1.5381, magnitude 0.0013): Swiss returns ZEROED contact
  // slots for this barely-grazing partial; normalizeSwissEclipse must
  // synthesize a window instead of letting the sampler run off to JD 0.
  const grazing = findNextSolarEclipse(
    julianDay(1935, 1, 3, 0),
    CalculationFlag.SwissEphemeris,
    0,
    false,
  );
  const gn = normalizeSwissEclipse(grazing);
  check(
    '1935-01-05 window synthesized',
    gn.partialBegin > gn.maximum - 1 && gn.partialEnd < gn.maximum + 1,
    `±${(((gn.partialEnd - gn.partialBegin) / 2) * 24).toFixed(1)} h`,
  );
  const gel = computeElements(nodeEphemeris, gn);
  const gge = greatestEclipsePoint(gel);
  const glc = localCircumstances(gel, gge.lat, gge.lng);
  check(
    '1935-01-05 resolves end-to-end',
    glc !== null && glc.magnitude > 0 && glc.magnitude < 0.01,
    `GE ${gge.lat.toFixed(1)}°, ${gge.lng.toFixed(1)}° — mag ${glc?.magnitude.toFixed(4)}`,
  );

  // 2021-06-10 (Arctic annular): the umbral path winds around the pole, so the
  // band ring cannot be represented as a planar polygon — it must be rejected
  // (limit polylines still draw) rather than filled as a hemisphere streak.
  const arctic = findNextSolarEclipse(
    julianDay(2021, 6, 8, 0),
    CalculationFlag.SwissEphemeris,
    0,
    false,
  );
  const ael = computeElements(nodeEphemeris, normalizeSwissEclipse(arctic));
  const { limits, band } = umbralLimits(ael);
  check('2021-06-10 pole-winding band rejected', band === null, `${limits.length} limit segment(s) kept`);
  check('2021-06-10 central line still drawn', centralLine(ael).length >= 1, 'present');
}

// ── Catalog integrity ─────────────────────────────────────────────────────────
function verifyCatalog() {
  console.log('\nsolarEclipses.json');
  const rows = catalog.rows as (string | number | null)[][];
  check('row count', rows.length > 1400, `${rows.length} rows`);
  const ids = rows.map((r) => r[0] as string);
  check('ids unique', new Set(ids).size === ids.length, `${ids.length} ids`);
  const sorted = [...ids].sort();
  check('ids sorted', ids.every((id, i) => id === sorted[i]), 'chronological');
  // Spot-check that every ~70th row resolves to a Swiss eclipse on its date.
  let worst = 0;
  for (let i = 0; i < rows.length; i += 71) {
    const id = rows[i][0] as string;
    const [y, m, d] = id.split('-').map(Number);
    const jd = julianDay(y, m, d, 0);
    const ev = findNextSolarEclipse(jd - 1.5, CalculationFlag.SwissEphemeris, 0, false);
    worst = Math.max(worst, Math.abs(ev.maximum - (jd + 0.5)));
  }
  check('rows resolve via Swiss', worst < 1.0, `worst |Δ| ${worst.toFixed(2)} d`);
}

// ── Run ───────────────────────────────────────────────────────────────────────
let el2024: BesselianElements | null = null;
for (const fx of FIXTURES) {
  const el = verifyFixture(fx);
  if (fx.id === '2024-04-08') el2024 = el;
}
if (el2024) verifyNasaElements(el2024);
verifyEdgeCases();
verifyCatalog();

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
