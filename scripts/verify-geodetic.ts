// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the GEODETIC primitive — a place's own angles, read from its coordinates
// alone — through the real modules (run via the harness: `npm run verify:geodetic`):
// geodeticAngles and geodeticFrame (ephemeris.ts), the meridian factory
// meridianLngFor (lines.ts), the truncating formatter truncZodiac (format.ts), the
// grid's Ascendant-curve generator geodeticAscCurve (geodeticGrid.ts), and
// shiftAngles (ayanamsa.ts), which carries a frame's geodetic flag into sidereal.
//
// Written 2026-10-02 with the primitive. Before it, a geodetic map drew each body's
// lines at its zodiacal longitude while every surface reporting a place's angles
// answered with the CHART's angles relocated there — and no suite asked what a place's
// own geodetic angles are.
//
//   1. The Appendix: 21 places, the four angles to 1″ and as shown    OUTSIDE AGREEMENT
//   2. The Ascendant is on the horizon, in the east                   OUTSIDE AGREEMENT
//   3. Swiss's own houses at the RAMC the place culminates            OUTSIDE AGREEMENT
//   4. meridianLngFor is the old inline arithmetic, float for float   INTERNAL IDENTITY
//   5. truncZodiac: named cases, never 60′/60″, never rolls           OUTSIDE AGREEMENT (cases) + INTERNAL IDENTITY (sweep)
//   6. geodeticFrame, ten systems; shiftAngles keeps the flag         INTERNAL IDENTITY (+ one OUTSIDE fixture)
//   7. Where each Ascendant curve ends                                OUTSIDE AGREEMENT
//   8. The grid's curve generator against the place readout          INTERNAL IDENTITY (two parts agree)
//
// The grid layer (geodeticGrid.ts: geoGrid, buildGeoZones, geoReadoutAngles, geoAscZones),
// 2026-10-02:
//   G0. The grid builds before the engine is initialised (above it)  INTERNAL IDENTITY
//   G1. The MC meridians: every 30° from Greenwich, pole to pole      OUTSIDE AGREEMENT + INTERNAL IDENTITY
//   G2. The grid draws the generator §7 and §8 test                   INTERNAL IDENTITY
//   G5. The zone rings' shape; the sign rule against them             INTERNAL IDENTITY (two parts agree)
//   G6. The Appendix to the minute, through the readout               OUTSIDE AGREEMENT
//   G7. The polar flag, and where the Ascendant is left out           OUTSIDE AGREEMENT + INTERNAL IDENTITY
//   G8. MapLibre's own tiler: the ±180° seam, coverage, poles, wrap   OUTSIDE AGREEMENT
//   G9. The zone fills: palette slots, the legend's isolate           INTERNAL IDENTITY (+ the palette's order)
//   G10. The Ascendant zones (the hover highlight) against the readout INTERNAL IDENTITY (two parts agree)
//        (+ OUTSIDE: which signs rise in the polar caps)
// (G3 and G4 of the design are §8: the curve vertices and the row bisection, run on the
// same generator the grid draws, as G2 pins.)
//
// The kinds, because a failure means different things (CLAUDE.md, "Prefer agreement
// between two parts"):
//   OUTSIDE AGREEMENT — the code against an independent reference (the Appendix, the
//                       horizon, Swiss, the display rule the instruction states).
//                       Breaking means the code is self-consistent and wrong.
//   INTERNAL IDENTITY — the code against itself. Breaking means it contradicts itself.
//                       §8 is the strongest of these: two parts written independently
//                       (the curve generator and the place readout) must say the same
//                       thing about the same place.
// Every comparison counts what it compared and fails on an empty set rather than
// passing vacuously.
//
// Conventions: angles in radians inside the app, degrees at the edges; longitudes
// east-positive, latitudes north-positive; the zodiacal branch (MC = longitude,
// Greenwich = 0° Aries); the Ascendant is the EASTERN intersection of ecliptic and
// horizon; the Appendix and the grid use the J2000 mean obliquity 23.4392911°, a chart
// uses its true obliquity of date.
import {
  EPS_J2000,
  birthDataToJD,
  eclipticLonOfRA,
  eclipticToRaDec,
  geodeticAngles,
  geodeticFrame,
  gmstRadians,
  initEphemeris,
  obliquity,
  relocate,
  type HouseSystem,
} from '../src/lib/ephemeris';
import { meridianLngFor, normLng, type MeridianLng } from '../src/lib/astro/lines';
import { TRUNC_SNAP_ARCSEC, lonToZodiac, truncZodiac } from '../src/lib/astro/format';
import { shiftAngles } from '../src/lib/astro/ayanamsa';
import {
  GEO_ASC_ZONE_TOL_DEG,
  GEO_ZONE_OPACITY,
  POLAR_CIRCLE_J2000_DEG,
  buildGeoAscZones,
  buildGeoZones,
  foldRibbon,
  geoAscZones,
  geoGrid,
  geoReadoutAngles,
  geoZoneId,
  geodeticAscCurve,
  type AscRibbon,
  type GeoAscZones,
  type GeoZoneColors,
} from '../src/lib/astro/geodeticGrid';
import { GEO_ZONE_COLORS, THEMES } from '../src/lib/theme';
import { BAND_SOURCE_OPTS, LINE_SOURCE_OPTS } from '../src/components/Map/tiling';
import { SEED_BIRTHS } from '../src/lib/birthData';
import { canonicalLng, fmtLat, fmtLatDM, fmtLng, fmtLngDM } from '../src/lib/coordFormat';
// G8's tiler: MapLibre's own, the devDependency verify-slide's tiling section uses (its import
// there says why it is a dependency of its own).
import { GeoJSONVT } from '@maplibre/geojson-vt';
import type { FeatureCollection } from 'geojson';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}
const section = (s: string) => console.log(`\n── ${s} ──`);
const note = (s: string) => console.log(`      ${s}`);
const fmt = (x: number) => x.toExponential(2);

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const TWO_PI = 2 * Math.PI;
const ARCSEC_CIRCLE = 1296000;
const ARCSEC_SIGN = 108000;
const norm2pi = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
// Smallest angle between two directions, radians, 0…π.
const angDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];
const pad2 = (n: number) => String(n).padStart(2, '0');
// An ecliptic longitude (radians) to the nearest 0.01″, for the printed record. Built
// from whole hundredths so a value a hair under a second never prints as 60.00″.
function arcsecText(lon: number): string {
  const h = Math.round(((((lon * R2D) % 360) + 360) % 360) * 360000) % (ARCSEC_CIRCLE * 100);
  const sign = Math.floor(h / (ARCSEC_SIGN * 100));
  const r = h - sign * ARCSEC_SIGN * 100;
  const deg = Math.floor(r / 360000);
  const min = Math.floor((r % 360000) / 6000);
  const sec = (r % 6000) / 100;
  return `${deg}°${pad2(min)}'${sec.toFixed(2).padStart(5, '0')}" ${SIGNS[sign]}`;
}

// "31°46'N" → 31.7667; south and west negative.
function parseCoord(s: string): number {
  const m = /^(\d+)°(\d+)'([NSEW])$/.exec(s);
  if (!m) throw new Error(`bad coordinate ${s}`);
  const v = Number(m[1]) + Number(m[2]) / 60;
  return m[3] === 'S' || m[3] === 'W' ? -v : v;
}
// "11°35'35\" Leo" → sign index, the display strings, and arcseconds from 0° Aries.
function parseZodiac(s: string) {
  const m = /^(\d+)°(\d+)'(\d+)" (\w+)$/.exec(s);
  if (!m) throw new Error(`bad zodiac position ${s}`);
  const signIdx = SIGNS.indexOf(m[4]);
  if (signIdx < 0) throw new Error(`bad sign ${m[4]}`);
  const [deg, min, sec] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return {
    signIdx,
    sec: `${deg}°${m[2]}'${m[3]}"`,
    min: `${deg}°${m[2]}'`,
    arcsec: signIdx * ARCSEC_SIGN + deg * 3600 + min * 60 + sec,
  };
}

// The bare closed form, with no eastern-point rule — a local copy, so the swap rows
// can show they exercise the swap, and so §2 can show the swap is never arbitrary.
function bareAsc(lngDeg: number, latDeg: number, eps: number): number {
  const lam = lngDeg * D2R;
  const ramc = Math.atan2(Math.sin(lam) * Math.cos(eps), Math.cos(lam));
  return norm2pi(
    Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(eps) + Math.tan(latDeg * D2R) * Math.sin(eps))),
  );
}

// An ecliptic point (latitude 0) as an equatorial unit vector — the oracle's own
// conversion, written from the rotation about the equinox axis rather than read
// from the app.
const eclVec = (lam: number, eps: number): [number, number, number] => [
  Math.cos(lam),
  Math.sin(lam) * Math.cos(eps),
  Math.sin(lam) * Math.sin(eps),
];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// A palette whose every entry names its own slot, so the grid sections can tell which shade a
// zone was given without reading the theme's hexes (G9 checks those separately).
const SYNTH_ZONE_COLORS: GeoZoneColors = {
  fire: ['fire-cardinal', 'fire-fixed', 'fire-mutable'],
  earth: ['earth-cardinal', 'earth-fixed', 'earth-mutable'],
  air: ['air-cardinal', 'air-fixed', 'air-mutable'],
  water: ['water-cardinal', 'water-fixed', 'water-mutable'],
};

// ═══ G0 · The grid builds without Swiss ══════════════════════════════════════════
// INTERNAL IDENTITY. HERE, above initEphemeris, on purpose — do not move it under the
// await. The grid, its zone fills and its readout must build with the engine still
// uninitialised: anything that read a chart, a moment or a Swiss result would throw here,
// which is what holds "the grid reads no chart state" to be true rather than intended. A
// control confirms the engine really is down at this point. And geoGrid() must be the SAME
// frozen object every call — the map's push skips a source whose collection keeps its
// identity, which is what lets a constant grid tile once.
section('G0 INTERNAL IDENTITY — the grid builds before the engine is initialised');
{
  let swissDown = false;
  try {
    obliquity(2451545);
  } catch {
    swissDown = true;
  }
  check('control: a Swiss call throws here (the engine is not initialised yet)', swissDown);
  let built: ReturnType<typeof geoGrid> | null = null;
  let err = '';
  try {
    built = geoGrid();
    buildGeoZones(SYNTH_ZONE_COLORS, GEO_ZONE_OPACITY.normal, null);
    geoReadoutAngles(43.65, -79.383);
  } catch (e) {
    err = String(e);
  }
  check('geoGrid(), buildGeoZones and geoReadoutAngles all run without Swiss', built !== null && !err, err);
  if (built) {
    const counts = [
      built.mc.features.length,
      built.asc.features.length,
      built.mcLabelLines.features.length,
      built.zoneRings.length,
      built.ascEquator.length,
    ];
    check(
      '12 MC meridians / 12 Ascendant curves / 12 label meridians / 12 zone rings / 12 equator points',
      counts.every((n) => n === 12),
      counts.join('/'),
    );
    check(
      'geoGrid() === geoGrid(), and it is frozen down to the coordinates',
      geoGrid() === built &&
        Object.isFrozen(built) &&
        Object.isFrozen(built.mc.features) &&
        Object.isFrozen(built.asc.features[3].geometry.coordinates[10]) &&
        Object.isFrozen(built.zoneRings[6]),
    );
  }
  // The Ascendant zones (G10) too — and in the 8 ms slices the app feeds them where the browser
  // gives no idle estimate (useGeoAscZones; an idle callback's slice is the time it offers, at
  // most 50 ms), timed. The build is a few hundred milliseconds of arithmetic that must never
  // land on the main thread in one piece, so no slice may run far past its budget — one step,
  // whatever the budget: 50 ms here, a whole build being several times that. The build time is
  // printed, not asserted — it is a property of the machine. (2026-10-02)
  let zones: GeoAscZones | null = null;
  let slices = 0;
  let longest = 0;
  let total = 0;
  let zerr = '';
  try {
    while (!zones && slices < 100000) {
      const t0 = performance.now();
      zones = buildGeoAscZones(8);
      const dt = performance.now() - t0;
      slices += 1;
      total += dt;
      longest = Math.max(longest, dt);
    }
  } catch (e) {
    zerr = String(e);
  }
  check(
    'the Ascendant zones build without Swiss, in 8 ms slices',
    zones !== null && slices > 5 && !zerr,
    zerr || `${slices} slices, ${total.toFixed(0)} ms in all`,
  );
  check('no slice runs far past its budget (under 50 ms)', longest < 50, `longest ${longest.toFixed(1)} ms`);
  check(
    'built once: geoAscZones() and a later build return that same object, frozen down to the coordinates',
    zones !== null &&
      geoAscZones() === zones &&
      buildGeoAscZones() === zones &&
      Object.isFrozen(zones.features[0].geometry.coordinates[0][0][0]),
  );
}

await initEphemeris();

const CHART = SEED_BIRTHS[0]; // Jim Lewis, 1941 — the "chart" jd of §3 and §6
const CHART_JD = birthDataToJD(CHART);
const JDS: Array<[string, number]> = [
  ['J2000.0', 2451545.0],
  [`${CHART.name} ${CHART.year}`, CHART_JD],
];

// ═══ 1 · The Appendix ════════════════════════════════════════════════════════════
// OUTSIDE AGREEMENT. Lina's fixture table (Geodetic build instruction, Appendix): the
// zodiacal branch at obliquity 23.4392911°, every value the Swiss Ephemeris result,
// TRUNCATED to the second. So the numeric test is one-sided — the computed angle may
// exceed the table by less than 1″ and never fall short of it (−1e-6″ allowed for
// float noise on the exact rows) — and the display test is exact.
interface Row {
  place: string;
  at: string;
  as: string;
  mc: string;
  /** The bare closed form lands on the WESTERN horizon here: the row tests the swap. */
  swap?: true;
}
const ROWS: Row[] = [
  { place: 'Jerusalem', at: "31°46'N 35°13'E", as: "11°35'35\" Leo", mc: "5°13'00\" Taurus" },
  { place: 'Washington DC', at: "38°54'N 77°02'W", as: "23°09'50\" Aries", mc: "12°58'00\" Capricorn" },
  { place: 'Yonkers', at: "40°56'N 73°54'W", as: "29°30'32\" Aries", mc: "16°06'00\" Capricorn" },
  { place: 'Toronto', at: "43°39'N 79°23'W", as: "21°04'26\" Aries", mc: "10°37'00\" Capricorn" },
  { place: 'Paris', at: "48°52'N 2°20'E", as: "26°06'27\" Cancer", mc: "2°20'00\" Aries" },
  { place: 'Berlin', at: "52°31'N 13°24'E", as: "6°11'06\" Leo", mc: "13°24'00\" Aries" },
  { place: 'Moscow', at: "55°45'N 37°34'E", as: "23°43'25\" Leo", mc: "7°34'00\" Taurus" },
  { place: 'Reykjavik', at: "64°08'N 21°56'W", as: "28°10'31\" Cancer", mc: "8°04'00\" Pisces" },
  { place: 'Tromsø', at: "69°39'N 18°57'E", as: "24°43'14\" Leo", mc: "18°57'00\" Aries" },
  { place: 'Resolute', at: "74°41'N 94°54'W", as: "9°47'44\" Aries", mc: "25°06'00\" Sagittarius", swap: true },
  { place: 'Melbourne', at: "37°49'S 144°58'E", as: "17°25'31\" Sagittarius", mc: "24°58'00\" Leo" },
  { place: 'Buenos Aires', at: "34°36'S 58°23'W", as: "28°15'55\" Aries", mc: "1°37'00\" Aquarius" },
  { place: 'Ushuaia', at: "54°48'S 68°18'W", as: "15°48'23\" Aries", mc: "21°42'00\" Capricorn" },
  { place: 'McMurdo', at: "77°51'S 166°40'E", as: "29°24'19\" Aquarius", mc: "16°40'00\" Virgo" },
  { place: 'Vostok', at: "78°28'S 106°50'E", as: "13°48'02\" Virgo", mc: "16°50'00\" Cancer", swap: true },
  { place: 'Auckland', at: "36°51'S 174°46'E", as: "12°31'13\" Capricorn", mc: "24°46'00\" Virgo" },
  { place: 'Cape Town', at: "33°55'S 18°25'E", as: "0°02'09\" Cancer", mc: "18°25'00\" Aries" },
  { place: 'Cape Town', at: "33°55'S 18°22'E", as: "29°59'35\" Gemini", mc: "18°22'00\" Aries" },
  { place: '40N 90W', at: "40°00'N 90°00'W", as: "0°00'00\" Aries", mc: "0°00'00\" Capricorn" },
  { place: '75N 90W', at: "75°00'N 90°00'W", as: "0°00'00\" Aries", mc: "0°00'00\" Capricorn", swap: true },
  { place: '40S 90E', at: "40°00'S 90°00'E", as: "0°00'00\" Libra", mc: "0°00'00\" Cancer" },
];
const placeOf = (r: Row) => {
  const [la, lo] = r.at.split(' ');
  return { lat: parseCoord(la), lng: parseCoord(lo) };
};
section('§1 OUTSIDE AGREEMENT — the Appendix, the four angles at J2000 obliquity');
check('the Appendix has 21 rows', ROWS.length === 21, `${ROWS.length}`);
{
  // Arcseconds the computed angle sits ABOVE the truncated fixture, wrapped to ±½ circle.
  const over = (lon: number, fixtureArcsec: number) => {
    const a = ((((lon * R2D) % 360) + 360) % 360) * 3600;
    let d = a - fixtureArcsec;
    if (d > ARCSEC_CIRCLE / 2) d -= ARCSEC_CIRCLE;
    if (d < -ARCSEC_CIRCLE / 2) d += ARCSEC_CIRCLE;
    return d;
  };
  const within = (d: number) => d >= -1e-6 && d < 1;
  let rowsOk = 0;
  let oppOk = 0;
  const oppBad: string[] = [];
  let swapsSeen = 0;
  let bareAgrees = 0;
  for (const r of ROWS) {
    const { lat, lng } = placeOf(r);
    const g = geodeticAngles(lng, lat, EPS_J2000);
    const fa = parseZodiac(r.as);
    const fm = parseZodiac(r.mc);
    const dA = over(g.asc, fa.arcsec);
    const dM = over(g.mc, fm.arcsec);
    const tA = truncZodiac(g.asc, 'sec');
    const tM = truncZodiac(g.mc, 'sec');
    const shown =
      tA.text === fa.sec && tA.signIdx === fa.signIdx &&
      tM.text === fm.sec && tM.signIdx === fm.signIdx &&
      truncZodiac(g.asc, 'min').text === fa.min && truncZodiac(g.mc, 'min').text === fm.min;
    const ok = within(dA) && within(dM) && shown;
    if (ok) rowsOk += 1;
    check(
      `${r.place.padEnd(13)} ${r.at.padEnd(16)} AS ${r.as} · MC ${r.mc}`,
      ok,
      `computed AS ${arcsecText(g.asc)} (+${dA.toFixed(3)}″), MC ${arcsecText(g.mc)} (${dM >= 0 ? '+' : ''}${dM.toExponential(1)}″)` +
        (shown ? '' : `; displayed AS ${tA.text} ${SIGNS[tA.signIdx]}, MC ${tM.text} ${SIGNS[tM.signIdx]}`),
    );
    // DS and IC, which the GE box lists beside AS and MC. The table quotes only AS and
    // MC; the opposite points are the same degree, minute and second in the opposite
    // sign — so the same one-sided 1″ bound, and the same text, six signs on.
    const dD = over(g.dsc, (fa.arcsec + ARCSEC_CIRCLE / 2) % ARCSEC_CIRCLE);
    const dI = over(g.ic, (fm.arcsec + ARCSEC_CIRCLE / 2) % ARCSEC_CIRCLE);
    const tD = truncZodiac(g.dsc, 'sec');
    const tI = truncZodiac(g.ic, 'sec');
    if (
      within(dD) && within(dI) &&
      tD.text === fa.sec && tD.signIdx === (fa.signIdx + 6) % 12 &&
      tI.text === fm.sec && tI.signIdx === (fm.signIdx + 6) % 12
    ) {
      oppOk += 1;
    } else if (oppBad.length < 3) {
      oppBad.push(`${r.place}: DS ${tD.text} ${SIGNS[tD.signIdx]} (${dD.toFixed(3)}″), IC ${tI.text} ${SIGNS[tI.signIdx]} (${dI.toFixed(3)}″)`);
    }
    // The swap: on the rows that test it, the bare formula gives the opposite point;
    // everywhere else the two agree, so the rule is not firing where it shouldn't.
    const dBare = angDiff(bareAsc(lng, lat, EPS_J2000), g.asc);
    if (r.swap) {
      swapsSeen += 1;
      check(
        `${r.place}: the bare formula gives the western point, the primitive the eastern`,
        Math.abs(dBare - Math.PI) < 1e-9,
        `bare ${arcsecText(bareAsc(lng, lat, EPS_J2000))}, |Δ − π| ${fmt(Math.abs(dBare - Math.PI))} rad`,
      );
    } else if (dBare < 1e-12) {
      bareAgrees += 1;
    }
  }
  check('all 21 rows: AS and MC within 1″ above the table, and displayed as the table', rowsOk === 21, `${rowsOk}/21`);
  check(
    'all 21 rows: DS and IC are the table\'s AS and MC six signs on, within 1″ and as displayed',
    oppOk === 21,
    `${oppOk}/21${oppBad.length ? `; ${oppBad.join('; ')}` : ''}`,
  );
  check('the three swap rows are marked', swapsSeen === 3, `${swapsSeen}`);
  check(
    'every other row: the bare formula and the primitive agree (the swap fires only where it must)',
    bareAgrees === ROWS.length - swapsSeen,
    `${bareAgrees}/${ROWS.length - swapsSeen}`,
  );

  // The trap the truncating rule exists for: Cape Town 18°22′E rises in Gemini's last
  // minute. Rounding (lonToZodiac, right for a planet) would name Cancer — a sign the
  // place is not in. The second check pins that the case really discriminates.
  const ct = placeOf(ROWS[17]);
  const ctAsc = geodeticAngles(ct.lng, ct.lat, EPS_J2000).asc;
  const shown = truncZodiac(ctAsc, 'min');
  check(
    "Cape Town 18°22′E displays 29°59' Gemini",
    shown.text === "29°59'" && shown.signIdx === 2,
    `${shown.text} ${SIGNS[shown.signIdx]}`,
  );
  const rounded = lonToZodiac(ctAsc);
  check(
    'Cape Town 18°22′E: rounding would roll it into Cancer (the case is a real trap)',
    rounded.signIdx === 3 && rounded.degMin === "0°00'",
    `lonToZodiac → ${rounded.degMin} ${SIGNS[rounded.signIdx]}`,
  );
}

// ═══ 2 · The Ascendant is the eastern point ═══════════════════════════════════════
// OUTSIDE AGREEMENT, against the sky rather than a formula. At every place the
// primitive's Ascendant must sit ON the horizon (altitude 0) and in its EASTERN half,
// for an observer whose local sidereal time is the RA that culminates the place's
// MC. Vector form, with the oracle's own ecliptic→equatorial rotation — none of the
// primitive's trigonometry. Where the swap fires, the bare formula's point must be in
// the WEST, so the rule is shown to be needed wherever it acts. Every output is also
// pinned to [0, 2π), as relocate()'s are: the comparisons here wrap, but consumers
// that sort or floor a frame's angles do not.
section('§2 OUTSIDE AGREEMENT — the Ascendant is on the horizon, in the east');
for (const [label, eps] of [
  ['EPS_J2000', EPS_J2000],
  ['obliquity(2451545)', obliquity(2451545)],
] as Array<[string, number]>) {
  let n = 0;
  let worstAlt = 0;
  let west = 0;
  let worstRamc = 0;
  let swaps = 0;
  let bareWest = 0;
  let outOfRange = 0;
  let minEast = Infinity;
  for (let i = -179; i <= 179; i++) {
    const lat = i * 0.5;
    const phi = lat * D2R;
    for (let lng = 0; lng < 360; lng += 1) {
      const g = geodeticAngles(lng, lat, eps);
      const mcV = eclVec(lng * D2R, eps);
      const theta = Math.atan2(mcV[1], mcV[0]); // RA on the upper meridian = local sidereal time
      const zen = [Math.cos(phi) * Math.cos(theta), Math.cos(phi) * Math.sin(theta), Math.sin(phi)];
      const east = [-Math.sin(theta), Math.cos(theta), 0];
      const v = eclVec(g.asc, eps);
      const alt = Math.abs(Math.asin(Math.max(-1, Math.min(1, dot(v, zen)))));
      const e = dot(v, east);
      n += 1;
      worstAlt = Math.max(worstAlt, alt);
      worstRamc = Math.max(worstRamc, angDiff(g.ramc, theta));
      minEast = Math.min(minEast, e);
      if (!(e > 0)) west += 1;
      if (![g.asc, g.mc, g.dsc, g.ic, g.ramc].every((x) => x >= 0 && x < TWO_PI)) outOfRange += 1;
      const bare = bareAsc(lng, lat, eps);
      if (angDiff(bare, g.asc) > 1) {
        swaps += 1;
        if (dot(eclVec(bare, eps), east) < 0) bareWest += 1;
      }
    }
  }
  check(`${label}: ${n} places — the Ascendant is on the horizon`, n === 129240 && worstAlt < 1e-9, `max |alt| ${fmt(worstAlt)} rad`);
  check(`${label}: … and in the east (sin az > 0) everywhere`, n > 0 && west === 0, `${west} west; least eastward component ${fmt(minEast)}`);
  check(`${label}: ramc is the RA that culminates the MC`, worstRamc < 1e-12, `max Δ ${fmt(worstRamc)} rad`);
  check(`${label}: asc, mc, dsc, ic and ramc all lie in [0, 2π)`, n > 0 && outOfRange === 0, `${outOfRange} places out of range`);
  check(`${label}: the swap fired (the polar case is exercised)`, swaps > 0, `${swaps} swaps`);
  check(`${label}: wherever it fired, the bare formula's point was in the west`, swaps > 0 && bareWest === swaps, `${bareWest}/${swaps}`);
}

// ═══ 3 · Swiss's own houses at the RAMC the place culminates ═════════════════════
// OUTSIDE AGREEMENT. A place's geodetic MC culminates at RAMC = RA(MC). Swiss computes
// a chart's angles from an RAMC, so relocate() at the fictitious longitude whose
// sidereal time IS that RAMC must return the primitive's angles — at the same ε,
// obliquity(jd), on both sides. 43,200 places (every 1° of latitude × 1.5° of
// longitude, both hemispheres, inside and outside the polar circles) × six systems ×
// two moments. The Ascendant (and Descendant) agree everywhere. The MC (and IC) agree
// everywhere except under Regiomontanus and Campanus inside the polar circles, where
// Swiss turns its MC by exactly 180° — and only where the swap fired (geodeticFrame
// reads those cusps the other way round; §6).
section('§3 OUTSIDE AGREEMENT — Swiss at the fictitious longitude, 43,200 places × 6 systems × 2 jds');
{
  const SYS6: HouseSystem[] = ['placidus', 'porphyry', 'regiomontanus', 'campanus', 'equal', 'whole'];
  const t0 = Date.now();
  for (const [label, jd] of JDS) {
    const eps = obliquity(jd);
    const gmst = gmstRadians(jd);
    let places = 0;
    let calls = 0;
    let worstAsc = 0;
    let worstMc = 0;
    let mcBad = 0;
    let flips = 0;
    let swaps = 0;
    let fallbacks = 0;
    for (let i = 0; i < 180; i++) {
      const lat = -89.5 + i;
      for (let j = 0; j < 240; j++) {
        const lng = j * 1.5;
        const g = geodeticAngles(lng, lat, eps);
        const swapped = angDiff(bareAsc(lng, lat, eps), g.asc) > 1;
        if (swapped) swaps += 1;
        const fict = ((g.ramc - gmst) * 180) / Math.PI;
        places += 1;
        for (const sys of SYS6) {
          const d = relocate(jd, lat, fict, sys);
          calls += 1;
          if (d.fallback) fallbacks += 1;
          worstAsc = Math.max(worstAsc, angDiff(d.asc, g.asc), angDiff(d.dsc, g.dsc));
          const rc = sys === 'regiomontanus' || sys === 'campanus';
          const turn = rc && swapped ? Math.PI : 0;
          const dm = Math.max(angDiff(d.mc, g.mc + turn), angDiff(d.ic, g.ic + turn));
          worstMc = Math.max(worstMc, dm);
          if (dm > 1e-9) mcBad += 1;
          if (rc && swapped) flips += 1;
        }
      }
    }
    check(`${label}: ${places} places × 6 systems — the Ascendant and Descendant agree with Swiss`, places === 43200 && calls === 259200 && worstAsc < 1e-9, `max Δ ${fmt(worstAsc)} rad`);
    check(
      `${label}: the MC and IC agree, turned by exactly 180° only for R/C where the swap fired`,
      calls > 0 && mcBad === 0,
      `${mcBad} disagree; max Δ from expected ${fmt(worstMc)} rad`,
    );
    check(`${label}: the R/C turn was exercised`, flips > 0, `${flips} R/C turns over ${swaps} swapped places`);
    note(`${fallbacks} Porphyry fallbacks (Placidus inside the polar circles)`);
  }
  note(`${((Date.now() - t0) / 1000).toFixed(1)} s for §3 — the full grid, not a subsample`);
}

// ═══ 4 · meridianLngFor is the old inline arithmetic ═════════════════════════════
// INTERNAL IDENTITY. The factory replaced five inline closures in App.tsx. It must
// give the SAME float, ===, as the old expression for both systems — so moving to it
// moved no line by a single ulp — and the geodetic mapping must take a place's RAMC
// back to its longitude whatever GMST it is handed.
section('§4 INTERNAL IDENTITY — meridianLngFor against the legacy inline closures');
{
  const eps = obliquity(CHART_JD);
  const gmst = gmstRadians(CHART_JD);
  // Verbatim, as App.tsx wrote them until 2026-10-02.
  const legacyGeo: MeridianLng = (raM) => (eclipticLonOfRA(raM, eps) * 180) / Math.PI;
  const legacyCel: MeridianLng = (raM) => ((raM - gmst) * 180) / Math.PI;
  const fGeo = meridianLngFor('geodetic', eps, gmst);
  const fCel = meridianLngFor('celestial', eps, gmst);
  let n = 0;
  let geoDiffer = 0;
  let celDiffer = 0;
  // 720 RAs, and the same shifted by ±2π: the generators hand it ra + H, which runs
  // outside 0…2π.
  for (const off of [0, -TWO_PI, TWO_PI]) {
    for (let k = 0; k < 720; k++) {
      const ra = k * 0.5 * D2R + off;
      n += 1;
      if (fGeo(ra) !== legacyGeo(ra)) geoDiffer += 1;
      if (fCel(ra) !== legacyCel(ra)) celDiffer += 1;
    }
  }
  check(`geodetic: factory === legacy at ${n} RAs`, n === 2160 && geoDiffer === 0, `${geoDiffer} differ`);
  check(`celestial: factory === legacy at ${n} RAs`, n === 2160 && celDiffer === 0, `${celDiffer} differ`);

  const fGeoOther = meridianLngFor('geodetic', eps, gmst + 1.234);
  const fCelOther = meridianLngFor('celestial', eps, gmst + 1.234);
  let m = 0;
  let worstBack = 0;
  let gmstMoved = 0;
  let worstCelShift = 0;
  for (let k = 0; k < 720; k++) {
    const lng = -180 + k * 0.5;
    const g = geodeticAngles(lng, 0, eps);
    const out = fGeo(g.ramc);
    m += 1;
    worstBack = Math.max(worstBack, Math.abs(normLng(out - lng)));
    if (fGeoOther(g.ramc) !== out) gmstMoved += 1;
    worstCelShift = Math.max(worstCelShift, Math.abs(normLng(fCelOther(g.ramc) - fCel(g.ramc) + 1.234 * R2D)));
  }
  check(`geodetic: a place's RAMC maps back to its longitude (${m} places)`, m === 720 && worstBack < 1e-9, `max Δ ${fmt(worstBack)}°`);
  check('geodetic: GMST plays no part (=== under a different GMST)', m > 0 && gmstMoved === 0, `${gmstMoved} moved`);
  check('celestial: GMST does (shifts by exactly −δ)', m > 0 && worstCelShift < 1e-9, `max Δ ${fmt(worstCelShift)}°`);
}

// ═══ 5 · truncZodiac ══════════════════════════════════════════════════════════════
// OUTSIDE AGREEMENT for the named cases — hand-derived answers to the display rule the
// instruction states (29°59′35″ Gemini shows as 29°59′ Gemini; 18°56′59.9999″ as
// 18°57′) — and INTERNAL IDENTITY for the sweep. The one truncation and sign rule:
// truncated after a TRUNC_SNAP_ARCSEC snap, never 60′ or 60″, never rolled into the
// next sign by display, the same sign at either precision.
section('§5 OUTSIDE AGREEMENT + INTERNAL IDENTITY — truncZodiac');
{
  // An ecliptic longitude from a sign index and an offset in arcseconds, in radians.
  const at = (signIdx: number, arcsecInSign: number) => ((signIdx * ARCSEC_SIGN + arcsecInSign) / 3600) * D2R;
  const dms = (d: number, m: number, s: number) => d * 3600 + m * 60 + s;
  const cases: Array<[string, number, number, string, string]> = [
    // [label, longitude (rad), want signIdx, want 'min', want 'sec']
    ["Cape Town's 29°59′35.281″ Gemini", at(2, dms(29, 59, 35.281)), 2, "29°59'", "29°59'35\""],
    ['18°56′59.9999″ Aries (float noise on 18°57′)', at(0, dms(18, 56, 59.9999)), 0, "18°57'", "18°57'00\""],
    ['29°59′59.99″ Gemini stays in Gemini (the snap is far below 0.01″)', at(2, dms(29, 59, 59.99)), 2, "29°59'", "29°59'59\""],
    // These two bracket the snap at [0.0005″, 0.002″), from outside the module.
    ['29°59′59.998″ Gemini stays in Gemini (beyond the 0.001″ snap)', at(2, dms(29, 59, 59.998)), 2, "29°59'", "29°59'59\""],
    ['29°59′59.9995″ Gemini reads 0° Cancer (inside the 0.001″ snap)', at(2, dms(29, 59, 59.9995)), 3, "0°00'", "0°00'00\""],
    ['359°59′59.9999″ is 0° Aries (float noise on the circle)', at(11, dms(29, 59, 59.9999)), 0, "0°00'", "0°00'00\""],
    ['exactly 30° (through radians) is 0° Taurus', 30 * D2R, 1, "0°00'", "0°00'00\""],
    ['−0.5° is 29°30′ Pisces', -0.5 * D2R, 11, "29°30'", "29°30'00\""],
    ['−360.25° is 29°45′ Pisces', -360.25 * D2R, 11, "29°45'", "29°45'00\""],
    ['370.5° (past 2π) is 10°30′ Aries', 370.5 * D2R, 0, "10°30'", "10°30'00\""],
    ['4π + 95.25° is 5°15′ Cancer', 4 * Math.PI + 95.25 * D2R, 3, "5°15'", "5°15'00\""],
    ['0°02′09.5″ Cancer prints its padded minutes and seconds', at(3, dms(0, 2, 9.5)), 3, "0°02'", "0°02'09\""],
  ];
  // The sweep below reads the snap from the module, so it cannot pin its size; this does.
  check('TRUNC_SNAP_ARCSEC is the contract\'s 0.001″', TRUNC_SNAP_ARCSEC === 1e-3, `${TRUNC_SNAP_ARCSEC}`);
  // Tromsø's MC is 18°57′ exactly, and the radians round trip lands a hair below it.
  const tromso = placeOf(ROWS[8]);
  const tMc = geodeticAngles(tromso.lng, tromso.lat, EPS_J2000).mc;
  cases.push(["Tromsø's computed MC (18°57′ through a float round trip)", tMc, 0, "18°57'", "18°57'00\""]);
  for (const [label, lon, sign, wantMin, wantSec] of cases) {
    const a = truncZodiac(lon, 'min');
    const b = truncZodiac(lon, 'sec');
    check(
      label,
      a.signIdx === sign && b.signIdx === sign && a.text === wantMin && b.text === wantSec,
      `${a.text} / ${b.text} ${SIGNS[b.signIdx]}`,
    );
  }
  const tArc = (((tMc * R2D) % 360) + 360) % 360 * 3600;
  note(`Tromsø MC before the snap: ${(tArc - dms(18, 57, 0)).toExponential(2)}″ from 18°57′00″`);

  // Sweep: every 0.37″ across the circle (not a divisor of a second, so it lands
  // everywhere inside one), plus each sign's last microsecond.
  let n = 0;
  let bad = 0;
  const firstBad: string[] = [];
  const probe = (lon: number) => {
    n += 1;
    const lonArc = (((lon * R2D) % 360) + 360) % 360 * 3600;
    for (const unit of ['min', 'sec'] as const) {
      const z = truncZodiac(lon, unit);
      const step = unit === 'min' ? 60 : 1;
      const shown = z.signIdx * ARCSEC_SIGN + z.deg * 3600 + z.min * 60 + z.sec;
      // The displayed value is the snapped value truncated: at most it, and less than one
      // step below it (modulo the circle).
      let gap = lonArc + TRUNC_SNAP_ARCSEC - shown;
      if (gap > ARCSEC_CIRCLE / 2) gap -= ARCSEC_CIRCLE;
      const ok =
        Number.isInteger(z.deg) && z.deg >= 0 && z.deg <= 29 &&
        Number.isInteger(z.min) && z.min >= 0 && z.min <= 59 &&
        Number.isInteger(z.sec) && z.sec >= 0 && z.sec <= 59 &&
        (unit === 'sec' || z.sec === 0) &&
        !/60['"]/.test(z.text) &&
        gap >= -1e-6 && gap < step + 1e-6 &&
        z.signIdx === truncZodiac(lon, unit === 'min' ? 'sec' : 'min').signIdx;
      if (!ok) {
        bad += 1;
        if (firstBad.length < 3) firstBad.push(`${lonArc.toFixed(4)}″ ${unit}: ${z.text} sign ${z.signIdx}`);
      }
    }
  };
  for (let s = 0; s < ARCSEC_CIRCLE; s += 0.37) probe((s / 3600) * D2R);
  for (let k = 0; k < 12; k++) probe(((((k + 1) * ARCSEC_SIGN - 1e-6) / 3600) * D2R));
  check(
    `sweep: never 60′/60″, truncated after the snap, one sign at both precisions (${n} longitudes)`,
    n > 3_000_000 && bad === 0,
    bad ? firstBad.join('; ') : '',
  );

  // The coordinates printed beside these angles (coordFormat: the panel header's "Cast for",
  // the Coordinates box, the readout over open water) ROUND rather than truncate — a
  // coordinate has no sign to keep it inside — but never print 60′ or 60″ either: a rounded
  // 60″ carries into the minute and a 60′ into the degree. Until 2026-10-02 the second carry
  // was missing, and 39.99999°W printed 39°W60'00". Named cases, then the last and first
  // fractions of a second around every whole minute from 0° to 180°, each read back to within
  // half its unit.
  {
    const named: Array<[string, string, string]> = [
      ['39.99999° W, a hair below a whole degree', fmtLng(-39.99999), `40°W00'00"`],
      ['79.99995° N', fmtLat(79.99995), `80°N00'00"`],
      ['0.999995° E', fmtLng(0.999995), `1°E00'00"`],
      ['18.95° E is 18°57′00″', fmtLng(18.95), `18°E57'00"`],
      ['43.65° N to the minute', fmtLatDM(43.65), `43°N39'`],
      ['79.9999° W to the minute', fmtLngDM(-79.9999), `80°W00'`],
    ];
    for (const [label, got, want] of named) check(`coordinates: ${label} prints ${want}`, got === want, got);
    const dms = /^(\d+)°[NSEW](\d\d)'(\d\d)"$/;
    const dm = /^(\d+)°[NSEW](\d\d)'$/;
    let cn = 0;
    let cbad = 0;
    const cfirst: string[] = [];
    const read = (text: string, v: number, unit: number) => {
      cn += 1;
      const mm = unit === 1 ? dms.exec(text) : dm.exec(text);
      const back = mm ? +mm[1] + +mm[2] / 60 + (unit === 1 ? +mm[3] / 3600 : 0) : NaN;
      const ok = !!mm && +mm[2] < 60 && (unit === 60 || +mm[3] < 60) && Math.abs(back - Math.abs(v)) <= unit / 7200 + 1e-9;
      if (!ok) {
        cbad += 1;
        if (cfirst.length < 3) cfirst.push(`${v} → ${text}`);
      }
    };
    for (let k = 1; k < 180 * 60; k++) {
      for (const ds of [-0.6, -0.4, -1e-4, 1e-4, 0.4]) {
        const v = k / 60 + ds / 3600;
        for (const sgn of [1, -1]) {
          read(fmtLng(sgn * v), v, 1);
          read(fmtLngDM(sgn * v), v, 60);
          if (v < 90) {
            read(fmtLat(sgn * v), v, 1);
            read(fmtLatDM(sgn * v), v, 60);
          }
        }
      }
    }
    check(
      `coordinates: never 60′/60″, and each reads back to within half its unit (${cn} printed)`,
      cn > 300_000 && cbad === 0,
      cfirst.join('; '),
    );
  }
}

// ═══ 6 · geodeticFrame ═════════════════════════════════════════════════════════════
// INTERNAL IDENTITY, plus one OUTSIDE fixture. A chart's frame on a geodetic map: the
// primitive's angles (===), and the reader's house system computed from them. Every
// third place of §3's grid, all ten systems, both moments.
section('§6 INTERNAL IDENTITY — geodeticFrame, ten systems, every third place of §3 × 2 jds');
{
  const SYS10: HouseSystem[] = [
    'placidus', 'koch', 'regiomontanus', 'campanus', 'porphyry', 'alcabitus',
    'meridian', 'morinus', 'equal', 'whole',
  ];
  const CUSP10_IS_MC = new Set<HouseSystem>(['placidus', 'koch', 'regiomontanus', 'campanus', 'porphyry', 'alcabitus', 'meridian']);
  const CUSP1_IS_AS = new Set<HouseSystem>(['placidus', 'koch', 'regiomontanus', 'campanus', 'porphyry', 'alcabitus', 'equal']);
  const t0 = Date.now();
  for (const [label, jd] of JDS) {
    const eps = obliquity(jd);
    const gmst = gmstRadians(jd);
    let frames = 0;
    let anglesDiffer = 0;
    let worst10 = 0;
    let worst1 = 0;
    let n10 = 0;
    let n1 = 0;
    let badWidth = 0;
    let badWhole = 0;
    let badFallback = 0;
    let badFlags = 0;
    let badRange = 0;
    let turned = 0;
    let polarRc = 0;
    const firstBad: string[] = [];
    let idx = 0;
    for (let i = 0; i < 180; i++) {
      const lat = -89.5 + i;
      for (let j = 0; j < 240; j++, idx++) {
        if (idx % 3 !== 0) continue;
        const lng = j * 1.5;
        const g = geodeticAngles(lng, lat, eps);
        const fict = ((g.ramc - gmst) * 180) / Math.PI;
        for (const sys of SYS10) {
          const f = geodeticFrame(jd, lat, lng, sys);
          const d = relocate(jd, lat, fict, sys);
          frames += 1;
          if (f.asc !== g.asc || f.mc !== g.mc || f.dsc !== g.dsc || f.ic !== g.ic) anglesDiffer += 1;
          if (![f.asc, f.mc, f.dsc, f.ic, ...f.cusps].every((x) => x >= 0 && x < TWO_PI)) badRange += 1;
          if (CUSP10_IS_MC.has(sys)) {
            n10 += 1;
            worst10 = Math.max(worst10, angDiff(f.cusps[9], f.mc));
          }
          if (CUSP1_IS_AS.has(sys)) {
            n1 += 1;
            worst1 = Math.max(worst1, angDiff(f.cusps[0], f.asc));
          }
          let widthOk = f.cusps.length === 12;
          for (let k = 0; k < 12 && widthOk; k++) {
            const w = norm2pi(f.cusps[(k + 1) % 12] - f.cusps[k]);
            if (!(w > 0 && w < Math.PI)) widthOk = false;
          }
          if (!widthOk) {
            badWidth += 1;
            if (firstBad.length < 3) firstBad.push(`${sys} ${lat}° ${lng}°`);
          }
          // The sign the readout names (truncZodiac), not a bare floor: at an exact sign
          // boundary — 0° Aries along 90°W — the closed form lands 1e-12° short of it,
          // and only the snap says which side a reader is shown.
          if (sys === 'whole' && angDiff(f.cusps[0], truncZodiac(f.asc, 'sec').signIdx * (Math.PI / 6)) > 1e-12) badWhole += 1;
          if (!!f.fallback !== !!d.fallback) badFallback += 1;
          if (!Number.isNaN(f.vertex) || !Number.isNaN(f.antivertex) || f.geodetic !== true) badFlags += 1;
          if (sys === 'regiomontanus' || sys === 'campanus') {
            if (Math.abs(lat) > 90 - (eps * R2D)) polarRc += 1;
            if (angDiff(d.mc, g.mc) > Math.PI / 2) turned += 1;
          }
        }
      }
    }
    check(`${label}: ${frames} frames — asc/mc/dsc/ic === the primitive at obliquity(jd)`, frames === 144000 && anglesDiffer === 0, `${anglesDiffer} differ`);
    check(`${label}: the four angles and twelve cusps all lie in [0, 2π)`, frames > 0 && badRange === 0, `${badRange} frames out of range`);
    check(`${label}: cusp 10 = MC for the seven systems that put it there, R/C at the poles included`, n10 > 0 && worst10 < 1e-9, `${n10} frames, max Δ ${fmt(worst10)} rad`);
    check(`${label}: cusp 1 = AS for the seven systems that put it there`, n1 > 0 && worst1 < 1e-9, `${n1} frames, max Δ ${fmt(worst1)} rad`);
    check(`${label}: every house runs forward and is under 180°`, frames > 0 && badWidth === 0, `${badWidth} frames${firstBad.length ? `: ${firstBad.join('; ')}` : ''}`);
    check(`${label}: whole-sign cusp 1 starts the sign the readout names for the Ascendant`, frames > 0 && badWhole === 0, `${badWhole} differ`);
    check(`${label}: the fallback flag is relocate()'s`, frames > 0 && badFallback === 0, `${badFallback} differ`);
    check(`${label}: vertex and antivertex NaN, geodetic === true`, frames > 0 && badFlags === 0, `${badFlags} differ`);
    check(`${label}: R/C cusps read the other way round where Swiss turned them`, turned > 0, `${turned} of ${polarRc} polar R/C frames`);
  }
  note(`${((Date.now() - t0) / 1000).toFixed(1)} s for §6`);

  // OUTSIDE: Toronto, whose latitude and longitude are far apart, so a call that swapped
  // them would put the MC at 13°39′ Taurus. The MC is the longitude exactly; the AS is
  // the Appendix's to within the obliquity of date (a fifth of an arcminute for a
  // present-day chart, up to about half an arcminute for 1941).
  const to = placeOf(ROWS[3]);
  const fx = parseZodiac(ROWS[3].as).arcsec;
  const f = geodeticFrame(CHART_JD, to.lat, to.lng, 'placidus');
  const dAs = Math.abs(((((f.asc * R2D) % 360) + 360) % 360) * 3600 - fx);
  check(
    `Toronto through geodeticFrame (${CHART.year} obliquity): MC is 10°37′ Capricorn, AS within 60″ of the Appendix`,
    f.mc === norm2pi(to.lng * D2R) && dAs < 60,
    `MC ${arcsecText(f.mc)}, AS ${arcsecText(f.asc)} (${dAs.toFixed(1)}″ from 21°04′26″)`,
  );
  const swapped = geodeticFrame(CHART_JD, to.lng, to.lat, 'placidus');
  check(
    'Toronto with latitude and longitude swapped does NOT pass that check (it discriminates)',
    angDiff(swapped.mc, f.mc) > D2R,
    `swapped MC ${arcsecText(swapped.mc)}`,
  );

  // A sidereal reading passes the frame through shiftAngles. The flag has to survive
  // it, or a sidereal geodetic readout would round rather than truncate; and only a
  // geodetic frame may come out carrying it.
  const ayan = 24 * D2R;
  const shifted = ([false, true] as const).map((rebuild) => shiftAngles(f, ayan, rebuild));
  check(
    'shiftAngles keeps a geodetic frame geodetic (both whole-sign paths): flag, NaN Vertex, shifted AS',
    shifted.every((s) => s.geodetic === true && Number.isNaN(s.vertex) && Number.isNaN(s.antivertex) && angDiff(s.asc, f.asc - ayan) < 1e-12),
    shifted.map((s) => `geodetic ${s.geodetic}, vertex ${s.vertex}, AS ${arcsecText(s.asc)}`).join('; '),
  );
  const plain = shiftAngles(relocate(CHART_JD, to.lat, to.lng, 'placidus'), ayan, false);
  check('… and does not mark a relocated (non-geodetic) frame', plain.geodetic === undefined, `geodetic ${plain.geodetic}`);
}

// ═══ 7 · Where each Ascendant curve ends ═════════════════════════════════════════
// OUTSIDE AGREEMENT, against the Appendix's curve-end table: a degree stops rising at
// latitude 90° − |declination|, north and south. 0° Aries and 0° Libra (declination 0)
// run to the map edge, ±90, along 90°W and 90°E; the rest end at ±(90° − |δ|), not cut
// short. The table quotes the declination truncated to the minute, and the end latitude
// as 90° less that — which is also the exact end rounded to the minute.
section('§7 OUTSIDE AGREEMENT — the Ascendant curves end where their degrees stop rising');
{
  const TABLE: Record<number, [string, string]> = {
    0: ["0°00'", 'edge'],
    1: ["11°28'", "78°32'"],
    2: ["20°09'", "69°51'"],
    3: ["23°26'", "66°34'"],
  };
  // The table's groups: Aries/Libra 0, Taurus/Virgo/Scorpio/Pisces 1, Gemini/Leo/
  // Sagittarius/Aquarius 2, Cancer/Capricorn 3.
  const GROUP = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1];
  const dm = (minutes: number) => `${Math.floor(minutes / 60)}°${pad2(minutes % 60)}'`;
  let curves = 0;
  for (let k = 0; k < 12; k++) {
    const dec = eclipticToRaDec(30 * k * D2R, 0, EPS_J2000).dec * R2D;
    const absDec = Math.abs(dec);
    const [wantDec, wantEnd] = TABLE[GROUP[k]];
    const curve = geodeticAscCurve(30 * k);
    const lats = curve.map((c) => c[1]);
    const north = Math.max(...lats);
    const south = Math.min(...lats);
    curves += curve.length > 1 ? 1 : 0;
    const decShown = dm(Math.floor(absDec * 60 + 1e-9));
    const runsNorth = curve.length > 1 && curve[0][1] < curve[curve.length - 1][1];
    if (GROUP[k] === 0) {
      const meridian = k === 0 ? -90 : 90;
      const onMeridian = curve.every(([lng]) => Math.abs(normLng(lng - meridian)) < 1e-9);
      check(
        `0° ${SIGNS[k]}: declination ${wantDec}; the curve spans exactly −90…90 along ${k === 0 ? '90°W' : '90°E'}`,
        decShown === wantDec && curve[0][1] === -90 && curve[curve.length - 1][1] === 90 && onMeridian && runsNorth,
        `δ ${decShown}, ${south}…${north}, ${curve.length} vertices${onMeridian ? '' : ', OFF the meridian'}`,
      );
    } else {
      const end = 90 - absDec;
      const endShown = dm(Math.round(end * 60));
      const fromTable = dm(90 * 60 - Math.floor(absDec * 60 + 1e-9));
      check(
        `0° ${SIGNS[k]}: declination ${wantDec}, the curve ends at ${wantEnd} N and S`,
        decShown === wantDec && endShown === wantEnd && fromTable === wantEnd &&
          Math.abs(north - end) < 1e-9 && Math.abs(south + end) < 1e-9 && runsNorth,
        `δ ${decShown}, ends ${north.toFixed(6)}° N / ${(-south).toFixed(6)}° S (90 − |δ| = ${end.toFixed(6)}°)`,
      );
    }
  }
  check('twelve curves built', curves === 12, `${curves}`);
}

// ═══ 8 · The grid's curve generator against the place readout ═══════════════════
// INTERNAL IDENTITY, two parts agreeing (the instruction's §4 internal-relation test).
// The curve for degree
// X is a planet rising line traced through the geodetic meridian mapping; the readout
// is the closed form at a place. Written independently, they must describe the same
// set: (a) every vertex of curve X reads AS = X; (b) walking each latitude row, the
// places that read AS = X are exactly where curve X crosses that row — one crossing
// inside the curve's span, none outside it; (c) the zone a curve begins lies to its
// EAST, judged by the one sign rule (truncZodiac).
section('§8 INTERNAL IDENTITY — geodeticAscCurve against geodeticAngles (two parts agree)');
{
  const eps = EPS_J2000;
  const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const asAt = (lng: number, lat: number) => geodeticAngles(lng, lat, eps).asc;

  // (a) Vertices. Near hour angle 0 or π a degree sits on the meridian at its turning
  // latitude, where the eastern-point choice is degenerate; those few are skipped.
  let vertices = 0;
  let skipped = 0;
  let worstVertex = 0;
  for (let k = 0; k < 12; k++) {
    const X = 30 * k * D2R;
    const raX = eclipticToRaDec(X, 0, eps).ra;
    for (const [lng, lat] of geodeticAscCurve(30 * k)) {
      const g = geodeticAngles(lng, lat, eps);
      const H = Math.abs(wrapPi(g.ramc - raX));
      if (H < 0.6 * D2R || H > Math.PI - 0.6 * D2R) {
        skipped += 1;
        continue;
      }
      vertices += 1;
      worstVertex = Math.max(worstVertex, angDiff(g.asc, X));
    }
  }
  check(
    `(a) every vertex of the twelve curves reads AS = its degree`,
    vertices > 1000 && worstVertex < 1e-9,
    `${vertices} vertices, max Δ ${fmt(worstVertex)} rad; ${skipped} at hour angle 0/π skipped`,
  );

  // (b) and (c). Rows every 0.5° from 85°S to 85°N, longitudes every 0.5°. A bracket
  // whose Ascendant jumps by more than 90° is the polar swap, not a crossing.
  const STEP = 0.5;
  let rows = 0;
  let inside = 0;
  let insideOk = 0;
  let outside = 0;
  let outsideOk = 0;
  let nearTurn = 0;
  let worstDist = 0;
  let eastChecked = 0;
  let eastOk = 0;
  let polarEast = 0;
  let polarEastOk = 0;
  const firstBad: string[] = [];
  const polarLimit = 90 - eps * R2D - 0.5;
  for (let k = 0; k < 12; k++) {
    const X = 30 * k * D2R;
    const span = 90 - Math.abs(eclipticToRaDec(X, 0, eps).dec * R2D);
    const curve = geodeticAscCurve(30 * k);
    // Ground distance (degrees) from a point to the curve polyline, longitude scaled by
    // cos(latitude), across the antimeridian.
    const distToCurve = (lng: number, lat: number) => {
      const c = Math.cos(lat * D2R);
      let best = Infinity;
      for (let i = 1; i < curve.length; i++) {
        const ax = normLng(curve[i - 1][0] - lng) * c;
        const ay = curve[i - 1][1] - lat;
        const bx = normLng(curve[i][0] - lng) * c;
        const by = curve[i][1] - lat;
        if (Math.abs(bx - ax) > 180) continue; // a segment straddling the seam after normLng
        const vx = bx - ax;
        const vy = by - ay;
        const len2 = vx * vx + vy * vy;
        const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / len2)) : 0;
        best = Math.min(best, Math.hypot(ax + t * vx, ay + t * vy));
      }
      return best;
    };
    for (let r = -170; r <= 170; r++) {
      const lat = r * STEP;
      rows += 1;
      if (Math.abs(Math.abs(lat) - span) <= 1) {
        nearTurn += 1;
        continue;
      }
      const roots: number[] = [];
      let lng0 = -180;
      let a0 = asAt(lng0, lat);
      let f0 = wrapPi(a0 - X);
      for (let s = 1; s <= 720; s++) {
        const lng1 = -180 + s * STEP;
        const a1 = asAt(lng1, lat);
        const f1 = wrapPi(a1 - X);
        const jump = angDiff(a1, a0) > Math.PI / 2;
        const across = Math.abs(f1 - f0) > Math.PI; // f wraps at X + π: not a root
        if (!jump && !across && ((f0 < 0 && f1 >= 0) || (f0 >= 0 && f1 < 0))) {
          let lo = lng0;
          let hi = lng1;
          let flo = f0;
          for (let it = 0; it < 60; it++) {
            const mid = (lo + hi) / 2;
            const fm = wrapPi(asAt(mid, lat) - X);
            if ((flo < 0) === (fm < 0)) {
              lo = mid;
              flo = fm;
            } else {
              hi = mid;
            }
          }
          roots.push((lo + hi) / 2);
        }
        lng0 = lng1;
        a0 = a1;
        f0 = f1;
      }
      if (Math.abs(lat) < span) {
        inside += 1;
        if (roots.length === 1) {
          const dist = distToCurve(roots[0], lat);
          worstDist = Math.max(worstDist, dist);
          if (dist < 0.02) insideOk += 1;
          else if (firstBad.length < 4) firstBad.push(`0° ${SIGNS[k]} at ${lat}°: ${dist.toFixed(4)}° off the curve`);
          // (c) The zone lies east: just east of the crossing the readout names X's sign,
          // just west the sign before it.
          const east = truncZodiac(asAt(roots[0] + 0.01, lat), 'min').signIdx === k;
          const west = truncZodiac(asAt(roots[0] - 0.01, lat), 'min').signIdx === (k + 11) % 12;
          if (Math.abs(lat) < polarLimit) {
            eastChecked += 1;
            if (east && west) eastOk += 1;
            else if (firstBad.length < 4) firstBad.push(`0° ${SIGNS[k]} at ${lat}°: east ${east}, west ${west}`);
          } else {
            polarEast += 1;
            if (east && west) polarEastOk += 1;
          }
        } else if (firstBad.length < 4) {
          firstBad.push(`0° ${SIGNS[k]} at ${lat}°: ${roots.length} crossings inside the span`);
        }
      } else {
        outside += 1;
        if (roots.length === 0) outsideOk += 1;
        else if (firstBad.length < 4) firstBad.push(`0° ${SIGNS[k]} at ${lat}°: ${roots.length} crossings outside the span`);
      }
    }
  }
  check(
    '(b) inside each curve\'s span, exactly one place per row reads AS = X, and it lies on curve X',
    inside > 3000 && insideOk === inside,
    `${insideOk}/${inside} rows, worst ${worstDist.toFixed(5)}° from the curve${firstBad.length ? `; ${firstBad.join('; ')}` : ''}`,
  );
  check(
    '(b) outside the span, no place reads AS = X',
    outside > 0 && outsideOk === outside,
    `${outsideOk}/${outside} rows`,
  );
  note(`${rows} rows over the 12 curves; ${nearTurn} within 1° of a curve's turning latitude skipped`);
  check(
    `(c) below the polar circles, the zone a curve begins lies to its east`,
    eastChecked > 2000 && eastOk === eastChecked,
    `${eastOk}/${eastChecked} crossings`,
  );
  note(
    `(c) above the polar circles (printed, not asserted — the Ascendant runs backward in places): ` +
      `${polarEastOk}/${polarEast} crossings have the zone to the east`,
  );
}

// ═══ G1 · The MC meridians ═════════════════════════════════════════════════════════
// OUTSIDE AGREEMENT against the instruction's definition — twelve meridians at exact 30°
// intervals from Greenwich (0° Aries), running to the map edge — and INTERNAL IDENTITY
// against the readout: every place on meridian k reads MC 0°00′ of sign k, and every place
// on its band-centre (label) meridian 15°00′ of it.
section('G1 OUTSIDE AGREEMENT + INTERNAL IDENTITY — the MC meridians');
{
  const grid = geoGrid();
  let ok = 0;
  const bad: string[] = [];
  let reads = 0;
  let readOk = 0;
  for (let k = 0; k < 12; k++) {
    const f = grid.mc.features[k];
    const L = normLng(30 * k);
    const c = f.geometry.coordinates;
    const onL = c.every(([x]) => x === L);
    const ends = c[0][1] === -90 && c[c.length - 1][1] === 90;
    const north = c.every((p, i) => i === 0 || p[1] > c[i - 1][1]);
    const props = f.properties.kind === 'mc' && f.properties.sign === k && !('planet' in f.properties);
    if (onL && ends && north && props) ok += 1;
    else if (bad.length < 3) bad.push(`${SIGNS[k]}: on ${onL}, ends ${ends}, northward ${north}, props ${props}`);
    const label = grid.mcLabelLines.features[k];
    for (const lat of [-80, -45, 0, 45, 80]) {
      reads += 2;
      const r = geoReadoutAngles(lat, L).mc;
      if (r.signIdx === k && r.text === "0°00'") readOk += 1;
      const m = geoReadoutAngles(lat, label.geometry.coordinates[0][0]).mc;
      if (m.signIdx === k && m.text === "15°00'" && label.properties.sign === k) readOk += 1;
    }
  }
  check(
    'twelve meridians at normLng(30k), each running −90…90 northward; kind mc, sign k, no planet',
    ok === 12,
    `${ok}/12${bad.length ? `; ${bad.join('; ')}` : ''}`,
  );
  check(
    '0° Libra lands exactly on +180 (the seam), never −180',
    grid.mc.features[6].geometry.coordinates.every(([x]) => x === 180),
  );
  check(
    'every place on meridian k reads MC 0°00′ of sign k, and on its label meridian 15°00′',
    reads === 120 && readOk === reads,
    `${readOk}/${reads} places`,
  );
}

// ═══ G2 · The grid draws the generator §7 and §8 test ═══════════════════════════════
// INTERNAL IDENTITY. §7 (where the curves end) and §8 (the curves against the readout) run on
// geodeticAscCurve; this pins that the grid DRAWS exactly that, vertex for vertex — so those
// sections test what is on the map, not a copy of it. And each curve's equator point, where
// its glyph goes, must be on the curve and read AS 0°00′ of its sign.
section('G2 INTERNAL IDENTITY — the grid draws the generator §7 and §8 test');
{
  const grid = geoGrid();
  let same = 0;
  let eqOk = 0;
  let worstEq = 0;
  const bad: string[] = [];
  for (let k = 0; k < 12; k++) {
    const f = grid.asc.features[k];
    const a = f.geometry.coordinates;
    const b = geodeticAscCurve(30 * k);
    if (
      f.properties.kind === 'asc' && f.properties.sign === k &&
      a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1])
    ) {
      same += 1;
    }
    // Ground distance (degrees) from the equator point to the drawn polyline, across the seam.
    const [lng, lat] = grid.ascEquator[k];
    let dist = Infinity;
    for (let i = 1; i < a.length; i++) {
      const ax = normLng(a[i - 1][0] - lng);
      const ay = a[i - 1][1] - lat;
      const bx = normLng(a[i][0] - lng);
      const by = a[i][1] - lat;
      if (Math.abs(bx - ax) > 180) continue;
      const vx = bx - ax;
      const vy = by - ay;
      const len2 = vx * vx + vy * vy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / len2)) : 0;
      dist = Math.min(dist, Math.hypot(ax + t * vx, ay + t * vy));
    }
    worstEq = Math.max(worstEq, dist);
    const r = geoReadoutAngles(lat, lng).as;
    if (lat === 0 && dist < 0.02 && r && r.signIdx === k && r.text === "0°00'") eqOk += 1;
    else if (bad.length < 3) bad.push(`${SIGNS[k]}: ${dist.toFixed(4)}° off, reads ${r?.text} ${r ? SIGNS[r.signIdx] : ''}`);
  }
  check('geoGrid().asc feature k is geodeticAscCurve(30k), vertex for vertex (===)', same === 12, `${same}/12`);
  check(
    'each curve\'s equator point is on the drawn curve and reads AS 0°00′ of its sign',
    eqOk === 12,
    `${eqOk}/12, worst ${worstEq.toExponential(1)}° off${bad.length ? `; ${bad.join('; ')}` : ''}`,
  );
}

// ═══ G5 · The sign rule against the zone polygons ═════════════════════════════════
// INTERNAL IDENTITY, two parts agreeing. The map FILLS the zones from polygon geometry; the
// readout and the MC zone a place is in both come from the one sign rule (truncZodiac,
// through geoReadoutAngles). They are written independently and must say the
// same thing: at every probe the zone polygon that contains the point is the zone of the
// readout's MC sign — every 0.25° of longitude, either side of every boundary by 1e-6° (the
// ±180° seam included), from 89°S to 89°N. And the rings tile the world: every probe is in
// exactly ONE of them. On a boundary meridian itself (where containment can't decide) the
// readout names the sign that begins there, so ±180 reads Libra.
//
// First the rings' own shape, because the probes can't see it: they never leave −180…180, and
// a point-in-ring test closes an open ring for itself. So a ring overhanging the seam by 0.2°
// (a double-shaded strip down the date line once tiled), one left open, or one closed short
// of the poles passed every probe here (review, 2026-10-02). Each ring must be closed, lie
// inside −180…180, run exactly pole to pole, be its own 30° rectangle — every vertex on its
// edges, counter-clockwise as the module says — and the twelve must tile −180…180 end to
// end. Exact comparisons: every edge is a whole degree.
section('G5 INTERNAL IDENTITY — the sign rule against the zone polygons (two parts agree)');
{
  const zones = buildGeoZones(SYNTH_ZONE_COLORS, GEO_ZONE_OPACITY.normal, null);
  const rings = zones.features.map((f) => f.geometry.coordinates[0]);
  let shapeOk = 0;
  const shapeBad: string[] = [];
  const spans: Array<[number, number]> = [];
  rings.forEach((ring, k) => {
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    const w = Math.min(...xs);
    const e = Math.max(...xs);
    spans.push([w, e]);
    const [x0, y0] = ring[0];
    const [xn, yn] = ring[ring.length - 1];
    const closed = ring.length >= 5 && x0 === xn && y0 === yn;
    const inWorld = w >= -180 && e <= 180;
    const poles = Math.min(...ys) === -90 && Math.max(...ys) === 90;
    let twice = 0; // shoelace over the closed ring: +2 × 30 × 180 for a counter-clockwise rectangle
    for (let i = 1; i < ring.length; i++) twice += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
    const rect =
      e - w === 30 && twice === 2 * 30 * 180 &&
      ring.every(([x, y]) => x === w || x === e || y === -90 || y === 90);
    if (closed && inWorld && poles && rect) shapeOk += 1;
    else if (shapeBad.length < 3) {
      shapeBad.push(
        `${SIGNS[k]}: closed ${closed}, ${w}…${e}, lat ${Math.min(...ys)}…${Math.max(...ys)}, ` +
          `rectangle ${rect} (area ${twice / 2})`,
      );
    }
  });
  check(
    'each ring is closed, inside −180…180, pole to pole, and its own counter-clockwise 30° rectangle',
    rings.length === 12 && shapeOk === 12,
    `${shapeOk}/${rings.length}${shapeBad.length ? `; ${shapeBad.join('; ')}` : ''}`,
  );
  spans.sort((a, b) => a[0] - b[0]);
  check(
    'the twelve [west, east] spans tile −180…180 end to end — no overhang at the seam, no gap',
    spans.length === 12 &&
      spans[0][0] === -180 &&
      spans[11][1] === 180 &&
      spans.every((s, i) => i === 0 || s[0] === spans[i - 1][1]),
    spans.map(([w, e]) => `${w}…${e}`).join(' '),
  );
  const inRing = (ring: number[][], x: number, y: number) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  let probes = 0;
  let single = 0;
  let agree = 0;
  let nearBoundary = 0;
  let seam = 0;
  const bad: string[] = [];
  const probe = (lng: number, lat: number) => {
    probes += 1;
    const hits: number[] = [];
    rings.forEach((r, k) => {
      if (inRing(r, lng, lat)) hits.push(k);
    });
    if (hits.length === 1) single += 1;
    const sign = geoReadoutAngles(lat, lng).mc.signIdx;
    if (hits.length === 1 && hits[0] === sign && zones.features[sign].properties.sign === sign) agree += 1;
    else if (bad.length < 4) bad.push(`${lat}° ${lng}°: in [${hits.map((h) => SIGNS[h]).join(',')}], reads ${SIGNS[sign]}`);
  };
  for (const lat of [-89, -60, 0, 60, 89]) {
    for (let i = 0; i <= 1440; i++) {
      const lng = -180 + i * 0.25;
      if (lng % 30 !== 0) probe(lng, lat);
    }
    for (let b = -180; b <= 180; b += 30) {
      for (const d of [-1e-6, 1e-6]) {
        const lng = b + d;
        if (lng < -180 || lng > 180) continue;
        nearBoundary += 1;
        if (Math.abs(b) === 180) seam += 1;
        probe(lng, lat);
      }
    }
  }
  check(
    `the zone rings tile −180…180: every probe lies in exactly one (${probes} probes)`,
    probes === 7260 && single === probes,
    `${single}/${probes}`,
  );
  check(
    'and it is the zone of the readout\'s MC sign — at every probe, boundaries ±1e-6° and the ±180° seam included',
    nearBoundary > 100 && seam > 0 && agree === probes,
    `${agree}/${probes}; ${nearBoundary} beside a boundary, ${seam} beside the seam${bad.length ? `; ${bad.join('; ')}` : ''}`,
  );
  let onB = 0;
  let onBOk = 0;
  for (const lat of [-60, 0, 60]) {
    for (let b = -180; b <= 180; b += 30) {
      onB += 1;
      const want = (((b / 30) % 12) + 12) % 12;
      const r = geoReadoutAngles(lat, b).mc;
      if (r.signIdx === want && r.text === "0°00'") onBOk += 1;
    }
  }
  check(
    'exactly on a boundary the readout names the sign that begins there (−180 and +180 both Libra)',
    onB === 39 && onBOk === onB,
    `${onBOk}/${onB}`,
  );
}

// ═══ G6 · The Appendix to the minute, through the readout ══════════════════════════
// OUTSIDE AGREEMENT. §1 checks the primitive and the formatter on the Appendix; this checks
// what the hover readout SAYS there — geoReadoutAngles, the very call the map makes —
// against the table to the minute, sign included. The rows that test the truncation: Cape
// Town 18°22′E rises in Gemini's last minute, and where plain truncation of the readout's
// own MC would come out a minute low (float noise on an exact 18°57′, and the like), it
// must not. The 0° Aries / 0° Libra rows sit exactly on a boundary.
section('G6 OUTSIDE AGREEMENT — the Appendix to the minute, through the grid readout');
{
  let rowsOk = 0;
  let noisy = 0;
  let noisyOk = 0;
  const shown = (z: { text: string; signIdx: number } | null) => (z ? `${z.text} ${SIGNS[z.signIdx]}` : 'none');
  for (const r of ROWS) {
    const { lat, lng } = placeOf(r);
    const g = geoReadoutAngles(lat, lng);
    const fa = parseZodiac(r.as);
    const fm = parseZodiac(r.mc);
    const ok =
      g.as !== null && g.as.signIdx === fa.signIdx && g.as.text === fa.min &&
      g.mc.signIdx === fm.signIdx && g.mc.text === fm.min;
    if (ok) rowsOk += 1;
    // Would plain truncation of the MC the readout computed read a minute low — the same
    // arithmetic as truncZodiac's, less the snap?
    const mcRad = geodeticAngles(canonicalLng(lng), lat, EPS_J2000).mc;
    const mcDeg = ((((mcRad * 180) / Math.PI) % 360) + 360) % 360;
    if (Math.floor((mcDeg * 3600) / 60) < Math.round(fm.arcsec / 60)) {
      noisy += 1;
      if (ok) noisyOk += 1;
    }
    check(
      `${r.place.padEnd(13)} reads AS ${fa.min} ${SIGNS[fa.signIdx]} · MC ${fm.min} ${SIGNS[fm.signIdx]}`,
      ok,
      `read AS ${shown(g.as)}, MC ${shown(g.mc)}`,
    );
  }
  check('all 21 rows read as the table, to the minute', ROWS.length === 21 && rowsOk === 21, `${rowsOk}/21`);
  check(
    'the rows where plain truncation would read the MC a minute low are not a minute low',
    noisy > 0 && noisyOk === noisy,
    `${noisyOk}/${noisy} such rows`,
  );
  const ct = geoReadoutAngles(placeOf(ROWS[17]).lat, placeOf(ROWS[17]).lng);
  check("Cape Town 18°22′E: AS 29°59′ Gemini, never 0°00′ Cancer", ct.as?.text === "29°59'" && ct.as.signIdx === 2, shown(ct.as));
  const to = geoReadoutAngles(placeOf(ROWS[3]).lat, placeOf(ROWS[3]).lng);
  check(
    "Toronto: AS 21°04′ Aries, MC 10°37′ Capricorn",
    to.as?.text === "21°04'" && to.as.signIdx === 0 && to.mc.text === "10°37'" && to.mc.signIdx === 9,
    `AS ${shown(to.as)}, MC ${shown(to.mc)}`,
  );
  const zeroRows = ROWS.slice(18).map((r) => geoReadoutAngles(placeOf(r).lat, placeOf(r).lng));
  check(
    '40N 90W and 75N 90W: AS 0°00′ Aries, MC 0°00′ Capricorn; 40S 90E: AS 0°00′ Libra, MC 0°00′ Cancer',
    zeroRows[0].as?.text === "0°00'" && zeroRows[0].as.signIdx === 0 && zeroRows[0].mc.signIdx === 9 &&
      zeroRows[1].as?.text === "0°00'" && zeroRows[1].as.signIdx === 0 && zeroRows[1].mc.signIdx === 9 &&
      zeroRows[2].as?.text === "0°00'" && zeroRows[2].as.signIdx === 6 && zeroRows[2].mc.signIdx === 3 &&
      zeroRows.every((z) => z.mc.text === "0°00'"),
    zeroRows.map((z) => `AS ${shown(z.as)}, MC ${shown(z.mc)}`).join('; '),
  );
  const noise = geoReadoutAngles(0, 18 + 56 / 60 + 59.9999 / 3600).mc;
  check('a longitude of 18°56′59.9999″ reads MC 18°57′ Aries', noise.text === "18°57'" && noise.signIdx === 0, shown(noise));
}

// ═══ G7 · The polar flag ═══════════════════════════════════════════════════════════
// OUTSIDE AGREEMENT on the Appendix's own annotations ("inside the Arctic" / "Antarctic") and
// on the J2000 polar circle, 90° − 23°26′21.448″; INTERNAL IDENTITY on the edges: the flag
// switches at exactly POLAR_CIRCLE_J2000_DEG in both hemispheres, and the readout leaves the
// Ascendant out only within 0.01° of a pole, where it is undefined (the MC is still there).
section('G7 OUTSIDE AGREEMENT + INTERNAL IDENTITY — the polar flag, and where the AS is left out');
{
  const want: Array<[string, boolean]> = [
    ['Tromsø', true], ['Resolute', true], ['McMurdo', true], ['Vostok', true],
    ['Reykjavik', false], ['Ushuaia', false],
  ];
  let ok = 0;
  const got: string[] = [];
  for (const [name, polar] of want) {
    const row = ROWS.find((r) => r.place === name);
    if (!row) continue;
    const { lat, lng } = placeOf(row);
    const p = geoReadoutAngles(lat, lng).polar;
    got.push(`${name} ${p}`);
    if (p === polar) ok += 1;
  }
  check('polar: Tromsø, Resolute, McMurdo, Vostok; not Reykjavik, Ushuaia', ok === want.length, got.join(', '));
  const P = POLAR_CIRCLE_J2000_DEG;
  check('the threshold is the J2000 polar circle, 90° − 23.4392911° (66°33′38.55″)', Math.abs(P - (90 - 23.4392911)) < 1e-12, `${P}`);
  check(
    'the flag switches exactly there, north and south',
    !geoReadoutAngles(P - 1e-9, 0).polar && geoReadoutAngles(P, 0).polar &&
      !geoReadoutAngles(-(P - 1e-9), 0).polar && geoReadoutAngles(-P, 0).polar,
  );
  const pole = geoReadoutAngles(89.995, 10);
  check(
    'within 0.01° of a pole the AS is left out and the MC is not; 0.02° away the AS is back',
    pole.as === null && geoReadoutAngles(-89.995, 10).as === null &&
      pole.mc.text === "10°00'" && pole.mc.signIdx === 0 && pole.polar &&
      geoReadoutAngles(89.98, 10).as !== null && geoReadoutAngles(-89.98, 10).as !== null,
  );
}

// ═══ G8 · MapLibre's own tiler ═════════════════════════════════════════════════════
// OUTSIDE AGREEMENT. What the map hands MapLibre goes through its tiler, @maplibre/geojson-vt,
// with each source's own options from tiling.ts — so this tiles the zone fills and the
// meridians and the Ascendant curves exactly as the map does (verify-slide's idiom), and asks
// the tiles four things a screenshot would otherwise be the only witness to:
//   (a) the ±180° seam: in every tile of the west edge column the Libra zone has area, in
//       every tile of the east edge column Virgo does, and the 0° Libra meridian is in both
//       edge columns (z0–z4);
//   (b) coverage: in every tile the zones' areas sum to the tile's EXACTLY, and each zone's
//       share is its overlap in longitude with the tile — no gap and no overlap anywhere, the
//       seam and the poles included (z0–z5);
//   (c) the poles: every MC meridian in a top-row tile reaches the map's top edge, and in a
//       bottom-row tile its bottom (z0–z4);
//   (d) the Ascendant curves come through the world wrap: every vertex lies on its own curve
//       in the tile that holds it (z1–z4);
//   (e) the Ascendant zones (G10) tile every tile exactly, as (b) asks of the MC zones, each
//       tile's pieces carrying their promoted id (z0–z3).
section("G8 OUTSIDE AGREEMENT — MapLibre's own tiler: the ±180° seam, full coverage, the poles, the wrap");
{
  // MapLibre's GeoJSONSource hands geojson-vt its pixel options scaled to tile units
  // (× EXTENT / tileSize = 8192 / 512) with maxZoom 18 — restated from its source, as in
  // verify-slide, and a source's promoteId with them ((e) tiles the Ascendant zones, which
  // have one).
  const EXT = 8192;
  const index = (fc: FeatureCollection, o: { buffer: number; tolerance: number }, promoteId?: string) =>
    new GeoJSONVT(fc, {
      buffer: o.buffer * 16,
      tolerance: o.tolerance * 16,
      extent: EXT,
      maxZoom: 18,
      ...(promoteId ? { promoteId } : {}),
    });
  const zt = index(buildGeoZones(SYNTH_ZONE_COLORS, GEO_ZONE_OPACITY.normal, null) as FeatureCollection, BAND_SOURCE_OPTS);
  const mt = index(geoGrid().mc as FeatureCollection, LINE_SOURCE_OPTS);
  type TileFeature = { type: number; tags: Record<string, unknown> | null; geometry: unknown };
  const ringArea = (ring: [number, number][]) => {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    }
    return Math.abs(a / 2);
  };
  const area = (f: TileFeature) =>
    f.type === 3 ? (f.geometry as [number, number][][]).reduce((s, r) => s + ringArea(r), 0) : 0;
  const feats = (vt: typeof zt, z: number, x: number, y: number) =>
    (vt.getTile(z, x, y)?.features ?? []) as TileFeature[];

  let seamTiles = 0;
  let seamOk = 0;
  const seamBad: string[] = [];
  for (let z = 0; z <= 4; z++) {
    const n = 2 ** z;
    for (let y = 0; y < n; y++) {
      seamTiles += 1;
      const zoneIn = (fs: TileFeature[], sign: number) => fs.some((f) => f.tags?.sign === sign && area(f) > 0);
      const libraMc = (fs: TileFeature[]) => fs.some((f) => f.tags?.kind === 'mc' && f.tags?.sign === 6);
      const l = zoneIn(feats(zt, z, 0, y), 6);
      const r = zoneIn(feats(zt, z, n - 1, y), 5);
      const ml = libraMc(feats(mt, z, 0, y));
      const mr = libraMc(feats(mt, z, n - 1, y));
      if (l && r && ml && mr) seamOk += 1;
      else if (seamBad.length < 3) seamBad.push(`z${z} y${y}: Libra west ${l}, Virgo east ${r}, 0° Libra meridian west ${ml} / east ${mr}`);
    }
  }
  check(
    '(a) z0–z4: the west edge column holds Libra, the east Virgo, and the 0° Libra meridian is in both',
    seamTiles === 31 && seamOk === seamTiles,
    `${seamOk}/${seamTiles} rows of edge tiles${seamBad.length ? `; ${seamBad.join('; ')}` : ''}`,
  );

  // (b) geojson-vt snaps every vertex to the tile's integer grid, and neighbouring zones share
  // their edge vertex for vertex, so a tile's zone areas sum to the tile's EXACTLY — 1e-6 is
  // only float noise in the shoelace sums. A zone's own share can be off by the snap of its two
  // edges, at most half a unit each over the tile's full height (1/EXT of the tile between
  // them), so it is held to 2/EXT. This was a 0.5% sum to z3, which a ring overhanging the seam
  // by 0.2° (0.44% of a z3 tile) passed (review, 2026-10-02). The zones' longitudes here are
  // the instruction's, folded into the world — sign k from 30k° east of Greenwich, so Libra's
  // from −180 — not read off the rings.
  const westOf = (k: number) => ((((30 * k + 180) % 360) + 360) % 360) - 180;
  let covTiles = 0;
  let covOk = 0;
  let worst = 0;
  let worstAt = '';
  let shares = 0;
  let shareOk = 0;
  let worstShare = 0;
  let worstShareAt = '';
  for (let z = 0; z <= 5; z++) {
    const n = 2 ** z;
    for (let x = 0; x < n; x++) {
      const L0 = -180 + (360 * x) / n;
      const L1 = -180 + (360 * (x + 1)) / n;
      for (let y = 0; y < n; y++) {
        covTiles += 1;
        const bySign = new Array<number>(12).fill(0);
        let sum = 0;
        let untagged = 0;
        for (const f of feats(zt, z, x, y)) {
          const a = area(f);
          sum += a;
          const s = f.tags?.sign;
          if (typeof s === 'number' && s >= 0 && s < 12) bySign[s] += a;
          else untagged += a;
        }
        const rel = Math.abs(sum / (EXT * EXT) - 1);
        if (rel > worst) {
          worst = rel;
          worstAt = `z${z}/${x}/${y}`;
        }
        if (rel <= 1e-6) covOk += 1;
        for (let k = 0; k < 12; k++) {
          shares += 1;
          const w = westOf(k);
          const frac = Math.max(0, Math.min(w + 30, L1) - Math.max(w, L0)) / (L1 - L0);
          const off = Math.abs(bySign[k] / (EXT * EXT) - frac);
          if (off > worstShare) {
            worstShare = off;
            worstShareAt = `z${z}/${x}/${y} ${SIGNS[k]} ${(bySign[k] / (EXT * EXT)).toFixed(5)} for ${frac.toFixed(5)}`;
          }
          if (off <= 2 / EXT && untagged === 0) shareOk += 1;
        }
      }
    }
  }
  check(
    '(b) z0–z5: in every tile the zones\' areas sum to the tile\'s exactly (to 1e-6) — no gap, no overlap',
    covTiles === 1365 && covOk === covTiles,
    `${covOk}/${covTiles} tiles, worst ${worst.toExponential(1)}${worstAt ? ` at ${worstAt}` : ''}`,
  );
  check(
    '(b) z0–z5: and each zone\'s share of every tile is its overlap in longitude, to the snap of its edges',
    shares === 1365 * 12 && shareOk === shares,
    `${shareOk}/${shares} (tile, zone) pairs, worst ${worstShare.toExponential(1)} of a tile (2/EXT = ` +
      `${(2 / EXT).toExponential(1)})${worstShareAt ? ` at ${worstShareAt}` : ''}`,
  );

  let pairs = 0;
  let reach = 0;
  const reachBad: string[] = [];
  for (let z = 0; z <= 4; z++) {
    const n = 2 ** z;
    for (let x = 0; x < n; x++) {
      for (const [y, top] of [[0, true], [n - 1, false]] as Array<[number, boolean]>) {
        for (const f of feats(mt, z, x, y)) {
          if (f.tags?.kind !== 'mc') continue;
          pairs += 1;
          const ys = (f.geometry as [number, number][][]).flat().map((p) => p[1]);
          if (top ? Math.min(...ys) <= 0 : Math.max(...ys) >= EXT) reach += 1;
          else if (reachBad.length < 3) reachBad.push(`z${z}/${x}/${y} ${SIGNS[f.tags.sign as number]}: y ${Math.min(...ys)}…${Math.max(...ys)}`);
        }
      }
    }
  }
  check(
    '(c) z0–z4: every MC meridian in a top-row tile reaches the top edge, in a bottom-row tile the bottom',
    pairs > 0 && reach === pairs,
    `${reach}/${pairs} (tile, meridian) pairs${reachBad.length ? `; ${reachBad.join('; ')}` : ''}`,
  );

  // (d) The tracer unwraps a curve's longitudes, as it does for a planet's horizon line, so
  // five curves run partly west of −180 (Scorpio from −330°, through Pisces from −210°), and
  // only geojson-vt's world wrap brings that part back onto the map. Every vertex of every
  // curve, taken to its canonical position, must lie on its own curve's feature in the tile
  // that holds it — to within the source's simplification tolerance plus the integer snap.
  // geojson-vt's projection restated: Web Mercator, y clamped to the world square.
  const at = index(geoGrid().asc as FeatureCollection, LINE_SOURCE_OPTS);
  const mercY = (lat: number) => {
    const s = Math.sin(lat * D2R);
    const y = 0.5 - (0.25 * Math.log((1 + s) / (1 - s))) / Math.PI;
    return y < 0 ? 0 : y > 1 ? 1 : y;
  };
  const reachTol = LINE_SOURCE_OPTS.tolerance * 16 + 1;
  const segDist = (px: number, py: number, a: [number, number], b: [number, number]) => {
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / len2)) : 0;
    return Math.hypot(a[0] + t * vx - px, a[1] + t * vy - py);
  };
  let verts = 0;
  let wrapped = 0;
  let onCurve = 0;
  let worstOff = 0;
  const offBad: string[] = [];
  for (let z = 1; z <= 4; z++) {
    const n = 2 ** z;
    for (let k = 0; k < 12; k++) {
      for (const [lng, lat] of geoGrid().asc.features[k].geometry.coordinates) {
        verts += 1;
        if (lng < -180 || lng > 180) wrapped += 1;
        const X = ((canonicalLng(lng) + 180) / 360) * n;
        const Y = mercY(lat) * n;
        const tx = Math.min(n - 1, Math.floor(X));
        const ty = Math.min(n - 1, Math.floor(Y));
        const px = (X - tx) * EXT;
        const py = (Y - ty) * EXT;
        let d = Infinity;
        for (const f of feats(at, z, tx, ty)) {
          if (f.type !== 2 || f.tags?.kind !== 'asc' || f.tags?.sign !== k) continue;
          for (const line of f.geometry as [number, number][][]) {
            for (let i = 1; i < line.length; i++) d = Math.min(d, segDist(px, py, line[i - 1], line[i]));
          }
        }
        if (d <= reachTol) onCurve += 1;
        else if (offBad.length < 3) offBad.push(`z${z}/${tx}/${ty} ${SIGNS[k]} at ${lng.toFixed(1)}°, ${lat.toFixed(1)}°: ${d} units off`);
        if (Number.isFinite(d)) worstOff = Math.max(worstOff, d);
      }
    }
  }
  check(
    `(d) z1–z4: every Ascendant-curve vertex is on its own curve in the tile that holds it, the wrapped ones included`,
    verts > 0 && wrapped > 0 && onCurve === verts,
    `${onCurve}/${verts} (${wrapped} west of −180 before the wrap), worst ${worstOff.toFixed(2)} of ${reachTol} units` +
      `${offBad.length ? `; ${offBad.join('; ')}` : ''}`,
  );

  // (e) The Ascendant zones reach ±89.99°, past the tiler's 85.05° clamp, so every tile is
  // theirs in full: the pieces' areas sum to the tile's, and each piece carries its sign's
  // promoted id, the one the hover lights. The zones are cut at ±180° before the tiler sees
  // them, so this is also the seam: a piece left overhanging it, or cut short, breaks a sum.
  const asz = geoAscZones();
  const azt = asz ? index(asz as FeatureCollection, BAND_SOURCE_OPTS, 'zone') : null;
  let aTiles = 0;
  let aOk = 0;
  let aWorst = 0;
  let aWorstAt = '';
  let aIds = 0;
  for (let z = 0; z <= 3 && azt; z++) {
    const n = 2 ** z;
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) {
        aTiles += 1;
        const fs = feats(azt, z, x, y);
        const sum = fs.reduce((s, f) => s + area(f), 0);
        const rel = Math.abs(sum / (EXT * EXT) - 1);
        if (rel > aWorst) {
          aWorst = rel;
          aWorstAt = `z${z}/${x}/${y}`;
        }
        if (rel <= 1e-6) aOk += 1;
        if (fs.length > 0 && fs.every((f) => (f as TileFeature & { id?: unknown }).id === (f.tags?.sign as number) + 1)) aIds += 1;
      }
    }
  }
  check(
    '(e) z0–z3: the Ascendant zones\' areas sum to every tile\'s exactly (to 1e-6), each piece with its sign\'s id',
    aTiles === 85 && aOk === aTiles && aIds === aTiles,
    `${aOk}/${aTiles} tiles, worst ${aWorst.toExponential(1)}${aWorstAt ? ` at ${aWorstAt}` : ''}; ids ${aIds}/${aTiles}`,
  );
}

// ═══ G9 · The zone fills ═══════════════════════════════════════════════════════════
// INTERNAL IDENTITY: each zone's sign, its element's hue and its modality's shade, and the
// legend's isolate — every zone stays in the collection (feature k is always sign k's), the
// isolated group keeps its opacity, and every other zone is 0. No hover state: the hover
// lights the Ascendant zone under the cursor instead (G10). Plus the palette the themes
// supply, against the instruction: in every theme, cardinal darkest and mutable lightest,
// twelve distinct.
section('G9 INTERNAL IDENTITY — the zone fills: palette slots, the legend\'s isolate');
{
  const ELEM = ['fire', 'earth', 'air', 'water'] as const;
  const MOD = ['cardinal', 'fixed', 'mutable'] as const;
  const base = GEO_ZONE_OPACITY.normal;
  const all = buildGeoZones(SYNTH_ZONE_COLORS, base, null);
  check(
    'zone k is sign k\'s, and carries no hover state of its own',
    all.features.length === 12 &&
      all.features.every((f, k) => f.properties.sign === k && !('hoverOpacity' in f.properties) && f.id === undefined),
  );
  check(
    'each zone takes its element\'s hue and its modality\'s shade (Aries fire-cardinal … Pisces water-mutable)',
    all.features.every(
      (f, k) =>
        f.properties.element === ELEM[k % 4] &&
        f.properties.modality === MOD[k % 3] &&
        f.properties.color === `${ELEM[k % 4]}-${MOD[k % 3]}`,
    ),
  );
  check('no isolate: all twelve at the base opacity', all.features.every((f) => f.properties.opacity === base));
  const shownSigns = (iso: Parameters<typeof buildGeoZones>[2]) =>
    buildGeoZones(SYNTH_ZONE_COLORS, base, iso)
      .features.filter((f) => f.properties.opacity > 0)
      .map((f) => f.properties.sign)
      .join(',');
  const fire = shownSigns({ kind: 'element', value: 'fire' });
  check('isolating Fire leaves Aries, Leo and Sagittarius (0, 4, 8)', fire === '0,4,8', fire);
  const card = shownSigns({ kind: 'modality', value: 'cardinal' });
  check('isolating Cardinal leaves Aries, Cancer, Libra and Capricorn (0, 3, 6, 9)', card === '0,3,6,9', card);
  let isoN = 0;
  let isoOk = 0;
  const isolates: NonNullable<Parameters<typeof buildGeoZones>[2]>[] = [
    ...ELEM.map((value) => ({ kind: 'element' as const, value })),
    ...MOD.map((value) => ({ kind: 'modality' as const, value })),
  ];
  for (const iso of isolates) {
    isoN += 1;
    const fc = buildGeoZones(SYNTH_ZONE_COLORS, base, iso);
    let shown = 0;
    const ok = fc.features.length === 12 && fc.features.every((f, k) => {
      const inGroup = iso.kind === 'element' ? f.properties.element === iso.value : f.properties.modality === iso.value;
      if (inGroup) shown += 1;
      return f.properties.sign === k && f.properties.opacity === (inGroup ? base : 0);
    });
    if (ok && shown === (iso.kind === 'element' ? 3 : 4)) isoOk += 1;
  }
  check(
    'every isolate: its group shown, every other zone 0, all twelve kept in place',
    isoN === 7 && isoOk === isoN,
    `${isoOk}/${isoN}`,
  );
  const pres = buildGeoZones(SYNTH_ZONE_COLORS, GEO_ZONE_OPACITY.presentation, null);
  check(
    'about 12% in use and 50% for Presentation',
    base === 0.12 && GEO_ZONE_OPACITY.presentation === 0.5 && pres.features.every((f) => f.properties.opacity === 0.5),
  );
  // Relative luminance (sRGB) of a #rrggbb.
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const lin = (c: number) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  let ordered = 0;
  for (const th of THEMES) {
    for (const e of ELEM) {
      const [c, f, m] = GEO_ZONE_COLORS[th][e];
      if (lum(c) < lum(f) && lum(f) < lum(m)) ordered += 1;
    }
  }
  const distinct = THEMES.every((th) => new Set(ELEM.flatMap((e) => GEO_ZONE_COLORS[th][e])).size === 12);
  check(
    'every theme\'s palette: cardinal darkest → mutable lightest in each element, twelve distinct',
    THEMES.length === 3 && ordered === THEMES.length * 4 && distinct,
    `${ordered}/${THEMES.length * 4} element rows ordered`,
  );
}

// ═══ G10 · The Ascendant zones ═════════════════════════════════════════════════════
// INTERNAL IDENTITY, two parts agreeing. The hover lights the Ascendant zone of the readout's
// own AS sign — the instruction's §6, "everywhere the readout gives the same sign" — and the
// map FILLS it from geoAscZones' geometry: built by sampling that rule, but joined between rows
// by straight edges, cut at the seam and split flat where the pattern changes. So the geometry
// is held to the readout, the reference here:
//   (a) shape: sign k's feature has id and `zone` k + 1; every ring is closed, counter-
//       clockwise, inside −180…180 and inside ±89.99° (where the readout has an AS at all);
//       and no flat edge runs further than 2° between vertices, the MC zones' densification,
//       so the globe bends it onto its parallel;
//   (b) they tile: the rings' areas sum to the world's between ±89.99° exactly, and every
//       probe of (c) lies in exactly one zone — together, no gap and no overlap;
//   (c) membership at seeded random places, a third of them in the polar caps: the zone that
//       holds the place is the readout's AS sign — except within GEO_ASC_ZONE_TOL_DEG (on the
//       ground) of a place where the readout changes sign, which a straight edge may stray
//       past (2.5 × until 2026-10-02; no probe has needed the excuse at all);
//   (d) the edges, row by row: along seeded and chosen latitudes, the zones' own changes of
//       sign (where their rings cross the row) are the readout's — the same signs either side,
//       in the same order — each within the tolerance of where this suite's own walk of the
//       readout finds it; and on rows a hair to a hundredth of a degree from the six
//       latitudes where curves end, the zone at every 0.01° is the readout's sign, but within
//       the tolerance of a change;
//   (e) the polar caps, where signs never rise: at ±79.9° and ±75.1° the readout names exactly
//       the signs holding a degree that can rise there, |δ| < 90° − |φ| (OUTSIDE AGREEMENT,
//       the sky), and the zones crossing the row are exactly those;
//   (f) the fold at ±180° on its own, with made-up ribbons that do what the zones' edges need
//       not: cross the seam westward as well as eastward, span two world copies, lie wholly in
//       the copy west of the map, pinch on the seam. Folded, each keeps its area, lies inside
//       −180…180, and holds a place exactly when the unwrapped ribbon holds one of its copies.
// (d)'s ordered rows keep 0.05° from the six latitudes where curves end, 90° − |δ| of 0°, 30°
// and 60° from a solstice: the readout turns over there within millimetres, which no walk of
// it could pair change for change, and the zones split flat across it by design. Its second
// half goes to those latitudes on purpose and scores place by place instead (2026-10-02).
section('G10 INTERNAL IDENTITY — the Ascendant zones against the readout (two parts agree)');
{
  const zones = geoAscZones();
  const LAT = 89.99;
  const TOL = GEO_ASC_ZONE_TOL_DEG;
  const asSign = (lat: number, lng: number) => geoReadoutAngles(lat, lng).as?.signIdx ?? -1;
  // Seeded (mulberry32), so a failure reproduces.
  let seed = 0x2545f491;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // (a)
  type ZRing = { sign: number; ring: number[][]; box: [number, number, number, number]; area: number };
  const rings: ZRing[] = [];
  let featOk = 0;
  let ringOk = 0;
  let verts = 0;
  let flat = 0;
  let flatLong = 0;
  const shapeBad: string[] = [];
  (zones?.features ?? []).forEach((f, k) => {
    if (
      f.id === k + 1 && f.properties.zone === k + 1 && geoZoneId(k) === k + 1 && f.properties.sign === k &&
      f.geometry.type === 'MultiPolygon' && f.geometry.coordinates.length > 0
    ) {
      featOk += 1;
    }
    for (const poly of f.geometry.coordinates) {
      const ring = poly[0];
      verts += ring.length;
      let twice = 0;
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      ring.forEach(([x, y], i) => {
        if (i > 0) twice += ring[i - 1][0] * y - x * ring[i - 1][1];
        if (i > 0 && y === ring[i - 1][1] && x !== ring[i - 1][0]) {
          flat += 1;
          if (Math.abs(x - ring[i - 1][0]) > 2 + 1e-9) flatLong += 1;
        }
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      });
      const closed = ring.length >= 4 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
      if (poly.length === 1 && closed && twice > 0 && x0 >= -180 && x1 <= 180 && y0 >= -LAT && y1 <= LAT) ringOk += 1;
      else if (shapeBad.length < 3) shapeBad.push(`${SIGNS[k]}: ${poly.length} ring(s), closed ${closed}, area ${twice / 2}, ${x0}…${x1}, ${y0}…${y1}`);
      rings.push({ sign: k, ring, box: [x0, x1, y0, y1], area: twice / 2 });
    }
  });
  check(
    '(a) twelve zones, sign k\'s with id and `zone` k + 1 (never 0), each with at least one polygon',
    zones !== null && zones.features.length === 12 && featOk === 12,
    `${featOk}/12`,
  );
  check(
    '(a) every ring closed, counter-clockwise, inside −180…180 and ±89.99°',
    rings.length >= 12 && ringOk === rings.length,
    `${ringOk}/${rings.length} rings, ${verts} vertices${shapeBad.length ? `; ${shapeBad.join('; ')}` : ''}`,
  );
  check('(a) no flat edge runs more than 2° between vertices', flat > 100 && flatLong === 0, `${flatLong} of ${flat} flat edges`);

  // (b) and (c)
  const total = rings.reduce((s, r) => s + r.area, 0);
  const world = 360 * 2 * LAT;
  check(
    '(b) the rings\' areas sum to the world\'s between ±89.99° (to 1e-9)',
    rings.length > 0 && Math.abs(total / world - 1) < 1e-9,
    `${total} of ${world}`,
  );
  const inRing = (ring: number[][], x: number, y: number) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const zonesAt = (lng: number, lat: number) => {
    const hits: number[] = [];
    for (const r of rings) {
      if (lng < r.box[0] || lng > r.box[1] || lat < r.box[2] || lat > r.box[3]) continue;
      if (inRing(r.ring, lng, lat)) hits.push(r.sign);
    }
    return hits;
  };
  // Does the readout name another sign within `tau` (degrees of arc on the ground) of here?
  const nearChange = (lat: number, lng: number, s: number, tau: number) => {
    for (const r of [tau / 2, tau]) {
      for (let q = 0; q < 16; q++) {
        const th = (q * Math.PI) / 8;
        const la = lat + r * Math.sin(th);
        if (Math.abs(la) > LAT) continue;
        if (asSign(la, lng + (r * Math.cos(th)) / Math.cos(lat * D2R)) !== s) return true;
      }
    }
    return false;
  };
  const N = 40000;
  let single = 0;
  let agree = 0;
  let excused = 0;
  let polarProbes = 0;
  const probeBad: string[] = [];
  for (let i = 0; i < N; i++) {
    const lng = -180 + 360 * rnd();
    const polar = i % 3 === 0;
    const lat = polar ? (rnd() < 0.5 ? -1 : 1) * (POLAR_CIRCLE_J2000_DEG + (LAT - POLAR_CIRCLE_J2000_DEG) * rnd()) : -LAT + 2 * LAT * rnd();
    if (Math.abs(lat) >= POLAR_CIRCLE_J2000_DEG) polarProbes += 1;
    const hits = zonesAt(lng, lat);
    if (hits.length === 1) single += 1;
    const s = asSign(lat, lng);
    if (hits.length === 1 && hits[0] === s) agree += 1;
    else if (nearChange(lat, lng, s, TOL)) excused += 1;
    else if (probeBad.length < 4) probeBad.push(`${lat.toFixed(5)}° ${lng.toFixed(5)}°: in [${hits.map((h) => SIGNS[h])}], reads ${SIGNS[s]}`);
  }
  check(
    `(b) every probe lies in exactly one zone (${N} probes, ${polarProbes} in the polar caps)`,
    polarProbes > N / 4 && single === N,
    `${single}/${N}`,
  );
  check(
    '(c) and it is the zone of the readout\'s AS sign, but within the tolerance of a change',
    agree + excused === N && agree > N * 0.999,
    `${agree}/${N} agree, ${excused} within ${TOL}° of a change${probeBad.length ? `; ${probeBad.join('; ')}` : ''}`,
  );

  // (d) The zones' changes along a row: where each ring crosses it, as spans of sign, in order.
  const zoneChanges = (lat: number) => {
    const spans: Array<[number, number, number]> = [];
    for (const { sign, ring, box } of rings) {
      if (lat < box[2] || lat > box[3]) continue;
      const xs: number[] = [];
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > lat !== yj > lat) xs.push(xi + ((lat - yi) * (xj - xi)) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) spans.push([xs[i], xs[i + 1], sign]);
    }
    spans.sort((a, b) => a[0] - b[0]);
    const tiles =
      spans.length > 0 && Math.abs(spans[0][0] + 180) < 1e-9 && Math.abs(spans[spans.length - 1][1] - 180) < 1e-9 &&
      spans.every((s, i) => i === 0 || Math.abs(s[0] - spans[i - 1][1]) < 1e-9);
    const changes: Array<[number, number, number]> = [];
    spans.forEach((s, i) => {
      const next = spans[(i + 1) % spans.length];
      if (next[2] !== s[2]) changes.push([s[1], s[2], next[2]]);
    });
    return { tiles, changes, spans, signs: new Set(spans.filter((s) => s[1] > s[0]).map((s) => s[2])) };
  };
  // This suite's own walk of the readout along a row: every 0.01°, each change bisected to 1e-9°.
  const readoutChanges = (lat: number) => {
    const changes: Array<[number, number, number]> = [];
    const signs = new Set<number>();
    let x0 = -180;
    let s0 = asSign(lat, x0);
    for (let i = 1; i <= 36000; i++) {
      const x1 = i === 36000 ? 180 : -180 + i * 0.01;
      const s1 = asSign(lat, x1);
      signs.add(s1);
      if (s1 !== s0) {
        let lo = x0;
        let hi = x1;
        while (hi - lo > 1e-9) {
          const m = (lo + hi) / 2;
          if (asSign(lat, m) === s0) lo = m;
          else hi = m;
        }
        changes.push([(lo + hi) / 2, s0, s1]);
      }
      x0 = x1;
      s0 = s1;
    }
    return { changes, signs };
  };
  const events = [90, 60, 30].map((lam) => 90 - Math.abs(eclipticToRaDec(lam * D2R, 0, EPS_J2000).dec * R2D));
  const clearOfEvents = (lat: number) => events.every((ev) => Math.abs(Math.abs(lat) - ev) > 0.05);
  const rowsLat: number[] = [0.37, 23.3, -41.7, 61.2, -66.66, 66.62, -67.4, 69.9, -72.5, 78.6, -80.3, 85.2, -89.5, 89.9];
  while (rowsLat.length < 30) {
    const lat = -89.9 + 179.8 * rnd();
    if (clearOfEvents(lat)) rowsLat.push(lat);
  }
  let rowsOk = 0;
  let edges = 0;
  let worstEdge = 0;
  const rowBad: string[] = [];
  for (const lat of rowsLat) {
    const z = zoneChanges(lat);
    const r = readoutChanges(lat);
    // The documented tolerance itself, on the ground (plus float room for the 1e-9° walk).
    // It was 2 × until 2026-10-02, which let every smooth edge move 0.003° and still pass.
    const tol = TOL / Math.cos(lat * D2R) + 1e-6;
    let ok = clearOfEvents(lat) && z.tiles && z.changes.length === r.changes.length && r.changes.length > 0;
    for (let i = 0; ok && i < r.changes.length; i++) {
      const [xr, wr, er] = r.changes[i];
      const [xz, wz, ez] = z.changes[i];
      const off = Math.abs(xz - xr);
      worstEdge = Math.max(worstEdge, off * Math.cos(lat * D2R));
      if (wr !== wz || er !== ez || off > tol) ok = false;
      edges += 1;
    }
    if (ok) rowsOk += 1;
    else if (rowBad.length < 3) {
      rowBad.push(
        `${lat.toFixed(4)}°: tiles ${z.tiles}; zones ${z.changes.map(([x, w, e]) => `${x.toFixed(3)} ${w}>${e}`).join(' ')}; ` +
          `readout ${r.changes.map(([x, w, e]) => `${x.toFixed(3)} ${w}>${e}`).join(' ')}`,
      );
    }
  }
  check(
    `(d) along ${rowsLat.length} rows the zones change sign where the readout does, in order, within the tolerance`,
    rowsOk === rowsLat.length && edges > 200,
    `${rowsOk}/${rowsLat.length} rows, ${edges} changes, worst ${worstEdge.toExponential(1)}° on the ground` +
      `${rowBad.length ? `; ${rowBad.join('; ')}` : ''}`,
  );

  // (d) at the six latitudes where curves end, which the rows above keep clear of: rows 1e-5°
  // to 1e-2° either side of each, in both hemispheres. The readout turns over there within
  // millimetres and the zones split flat across it, so the changes can't be paired in order;
  // instead every 0.01° along each row the zone holding the place must be the readout's sign,
  // but within the tolerance (on the ground) of a place where the readout changes — and each
  // row must tile. Added 2026-10-02: with the rows kept 0.05° away, a flat split a hundredth
  // of a degree tall at exactly these latitudes passed, ten thousand times the one built.
  const evRows: number[] = [];
  for (const ev of events) {
    for (const hemi of [1, -1]) for (const d of [1e-5, 1e-4, 1e-3, 1e-2]) for (const side of [1, -1]) evRows.push(hemi * (ev + side * d));
  }
  let evSamples = 0;
  let evAgree = 0;
  let evExcused = 0;
  let evTiles = 0;
  const evBad: string[] = [];
  for (const lat of evRows) {
    const { tiles, spans } = zoneChanges(lat);
    if (tiles) evTiles += 1;
    let j = 0;
    for (let i = 0; i < 36000; i++) {
      const x = -179.995 + i * 0.01;
      while (j + 1 < spans.length && spans[j][1] <= x) j += 1;
      const z = spans[j] && spans[j][0] <= x && x < spans[j][1] ? spans[j][2] : -1;
      const s = asSign(lat, x);
      evSamples += 1;
      if (z === s) evAgree += 1;
      else if (nearChange(lat, x, s, TOL)) evExcused += 1;
      else if (evBad.length < 3) evBad.push(`${lat.toFixed(6)}° ${x.toFixed(3)}°: zone ${z >= 0 ? SIGNS[z] : 'none'}, reads ${SIGNS[s]}`);
    }
  }
  check(
    `(d) ${evRows.length} rows 1e-5° to 1e-2° either side of the six event latitudes tile, and the zone is the readout's sign but within the tolerance of a change`,
    evTiles === evRows.length && evSamples === evRows.length * 36000 && evAgree + evExcused === evSamples,
    `${evTiles}/${evRows.length} tile; ${evAgree}/${evSamples} agree, ${evExcused} within ${TOL}° of a change` +
      `${evBad.length ? `; ${evBad.join('; ')}` : ''}`,
  );

  // (e) Which signs the sky lets rise at a latitude: those holding a degree with |δ| < 90° − |φ|.
  const risers = (lat: number) => {
    const set = new Set<number>();
    for (let i = 0; i < 36000; i++) {
      const lam = i * 0.01;
      if (Math.abs(eclipticToRaDec(lam * D2R, 0, EPS_J2000).dec * R2D) < 90 - Math.abs(lat)) set.add(Math.floor(lam / 30));
    }
    return set;
  };
  const names = (set: Set<number>) => [...set].sort((a, b) => a - b).map((k) => SIGNS[k]).join(', ');
  let capsOk = 0;
  let never = 0;
  const capNotes: string[] = [];
  for (const lat of [79.9, -79.9, 75.1, -75.1]) {
    const sky = risers(lat);
    const read = readoutChanges(lat).signs;
    const zs = zoneChanges(lat).signs;
    const absent = SIGNS.map((_, k) => k).filter((k) => !sky.has(k));
    never += absent.length;
    if (names(sky) === names(read) && names(sky) === names(zs) && absent.length > 0 && absent.every((k) => !zs.has(k))) capsOk += 1;
    capNotes.push(`${lat}°: rise ${names(sky)}; readout ${names(read)}; zones ${names(zs)}`);
  }
  check(
    '(e) ±79.9°, ±75.1°: the readout names exactly the signs that can rise, and only their zones reach the row',
    capsOk === 4 && never > 0,
    `${capsOk}/4; ${never} (row, sign) pairs that never rise`,
  );
  for (const n of capNotes) note(n);

  // (f) Made-up ribbons, one per slot of a twelve-slot output, as the build folds into.
  const synth: AscRibbon[] = [
    // the west edge crossing −180 westward, back, and westward again
    { sign: 0, y: [0, 1, 2, 3, 4], l: [-170, -200, -175, -190, -160], r: [-100, -120, -90, -150, -130] },
    // the east edge crossing +180 westward, back, and westward again
    { sign: 1, y: [10, 11, 12, 13], l: [100, 120, 90, 110], r: [200, 170, 185, 175] },
    // over two copies: the map's and the one east of it
    { sign: 2, y: [20, 22, 24], l: [150, 250, 200], r: [400, 300, 330] },
    // wholly in the copy west of the map
    { sign: 3, y: [30, 31], l: [-300, -290], r: [-200, -185] },
    // narrow, straddling +180, pinched to nothing at its top
    { sign: 4, y: [40, 41, 42], l: [170, 185, 181], r: [175, 190, 181] },
  ];
  const folded: number[][][][][] = Array.from({ length: 12 }, () => []);
  for (const rb of synth) foldRibbon(rb, folded);
  const ribbonAt = (rb: AscRibbon, yy: number) => {
    let j = 0;
    while (j + 2 < rb.y.length && yy > rb.y[j + 1]) j += 1;
    const t = (yy - rb.y[j]) / (rb.y[j + 1] - rb.y[j]);
    return [rb.l[j] + (rb.l[j + 1] - rb.l[j]) * t, rb.r[j] + (rb.r[j + 1] - rb.r[j]) * t];
  };
  let foldOk = 0;
  let foldProbes = 0;
  const foldBad: string[] = [];
  for (const rb of synth) {
    let want = 0;
    for (let j = 0; j + 1 < rb.y.length; j++) {
      want += ((rb.r[j] - rb.l[j] + rb.r[j + 1] - rb.l[j + 1]) / 2) * (rb.y[j + 1] - rb.y[j]);
    }
    const pieces = folded[rb.sign].map((p) => p[0]);
    let got = 0;
    let inside = true;
    for (const ring of pieces) {
      for (let i = 1; i < ring.length; i++) got += (ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1]) / 2;
      if (ring.some(([x]) => x < -180 || x > 180)) inside = false;
    }
    let held = 0;
    let probes = 0;
    for (let i = 0; i < 400; i++) {
      const yy = rb.y[0] + (rb.y[rb.y.length - 1] - rb.y[0]) * (0.005 + 0.99 * rnd());
      const [lw, re] = ribbonAt(rb, yy);
      if (re - lw < 1e-6) continue;
      const u = 0.01 + 0.98 * rnd();
      const xIn = canonicalLng(lw + u * (re - lw));
      const xOut = canonicalLng(re + u * (360 - (re - lw)));
      probes += 2;
      if (pieces.filter((ring) => inRing(ring, xIn, yy)).length === 1) held += 1;
      if (pieces.every((ring) => !inRing(ring, xOut, yy))) held += 1;
    }
    foldProbes += probes;
    if (pieces.length > 0 && inside && Math.abs(got - want) < 1e-9 * Math.max(1, want) && probes > 600 && held === probes) foldOk += 1;
    else if (foldBad.length < 3) foldBad.push(`ribbon ${rb.sign}: ${pieces.length} pieces, inside ${inside}, area ${got} for ${want}, ${held}/${probes} probes`);
  }
  check(
    '(f) folded at ±180°, made-up ribbons keep their area, stay inside −180…180, and hold exactly their own places',
    foldOk === synth.length,
    `${foldOk}/${synth.length} ribbons, ${foldProbes} probes${foldBad.length ? `; ${foldBad.join('; ')}` : ''}`,
  );
}

console.log(failures === 0 ? '\nverify-geodetic: ALL PASS' : `\nverify-geodetic: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
