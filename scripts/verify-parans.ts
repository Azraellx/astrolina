// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the PARAN math of the real src/lib code (run via the harness:
// `npm run verify:parans`). A paran is a latitude where two bodies stand on
// their angles at the same instant — A culminating while B rises, two bodies
// rising together, and so on. The closed forms in parans.ts are checked two
// independent ways:
//   1. Simultaneity: at (paran latitude, intersection longitude) at the chart
//      instant, body A really is on its meridian / horizon and body B really is
//      on the horizon (vector-form altitudes + hour angles), with the
//      rising/setting LABELS confirmed against the actual sign of d(alt)/dt.
//   2. Completeness: an independent brute-force latitude scan with bisection
//      must find exactly the paran set the closed forms produce — nothing
//      missing, nothing extra (within the scan's resolution).
// Plus the mirrored-solution symmetry of horizon×horizon pairs, and numeric
// notes on the two guards in paranLat (the |tanφ|>6 cap and the ±72° clip).
// The geometry sections run on five charts (1941–2008, both hemispheres, the
// equator to 51°) with the Sun through Pluto. Section 7 pairs catalog minor bodies
// with the planets (generateMinorParans) on the same charts, and checks their chips'
// rank and the switch that turns them on.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { Feature, LineString } from 'geojson';
import type maplibregl from 'maplibre-gl';
import {
  birthDataToJD,
  gmstRadians,
  getMinorPositions,
  getPlanetPositions,
  initEphemeris,
  obliquity,
  PLANET_CODES,
  PLANET_COLORS,
  projectMinorOntoEcliptic,
  projectOntoEcliptic,
  type PlanetName,
  type PlanetPosition,
} from '../src/lib/ephemeris';
import {
  generateMinorParans,
  generateParans,
  generateStarParans,
  isMinorParan,
  type MinorParanProps,
  type ParanProps,
} from '../src/lib/astro/parans';
import { generateLines, meridianLngFor, normLng, type MeridianLng } from '../src/lib/astro/lines';
import { generateMinorLines, minorLabelName, type MinorDecor } from '../src/lib/astro/minorLines';
import { starsOfDate } from '../src/lib/astro/starLines';
import type { BirthData } from '../src/lib/birthData';
import { HYPOTHETICAL_POINTS, hypotheticalPoint } from '../src/lib/minorBodies/hypothetical';
import { fileNameFor, isHypotheticalKey, minorId } from '../src/lib/minorBodies/ids';
import { ensureMinorBodies, minorLoadState } from '../src/lib/minorBodies/loader';
import { bundledSource, needsMinorFile } from '../src/lib/minorBodies/bundled';
import {
  loadMinorParansPref,
  MINOR_PARANS_PREF_KEY,
  saveMinorParansPref,
} from '../src/lib/minorBodies/prefs';
import type { MinorBodySource } from '../src/lib/extensions/minorBodySources';
import {
  estimateParanChip,
  PARAN_RANK,
  paranChipFace,
  placeParanChips,
} from '../src/components/Map/paranChips';
import { ChipOccupancy } from '../src/components/Map/chipOccupancy';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const node: any = createRequire(import.meta.url)('@swisseph/node');

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

const gastCache = new Map<number, number>();
function gastRad(jd: number): number {
  let v = gastCache.get(jd);
  if (v === undefined) {
    v = node.calculateHouses(jd, 0, 0, node.HouseSystem.WholeSign).armc * DEG2RAD;
    gastCache.set(jd, v!);
  }
  return v!;
}

// Geocentric altitude of a fixed (ra, dec) from a place at an instant — vector
// form, independent of the hour-angle algebra in parans.ts.
function altitudeOf(jd: number, ra: number, dec: number, latDeg: number, lngDeg: number): number {
  const theta = gastRad(jd) + lngDeg * DEG2RAD;
  const phi = latDeg * DEG2RAD;
  const dot =
    Math.cos(phi) * Math.cos(dec) * Math.cos(theta - ra) + Math.sin(phi) * Math.sin(dec);
  return Math.asin(Math.max(-1, Math.min(1, dot)));
}

function altSlope(jd: number, ra: number, dec: number, latDeg: number, lngDeg: number): number {
  const dt = 30 / 86400;
  return (
    (altitudeOf(jd + dt, ra, dec, latDeg, lngDeg) - altitudeOf(jd - dt, ra, dec, latDeg, lngDeg)) /
    (2 * dt)
  );
}

const normDelta = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));

// A brute-force latitude cell [lo, hi] whose function has no value at one end:
// the cell runs past a body's circumpolar limit (|lat| = 90° − |dec|), beyond
// which it has no horizon crossing. Until 2026-10-02 such a cell was skipped
// whole, so a real paran within a cell of the limit (~0.06° of it) was missing
// from the scan and the generated one read as SPURIOUS — invisible on the one
// battery chart, and failing as soon as more charts and bodies were scanned.
// Shrinks the cell to its defined part by bisecting on definedness.
function definedCell(
  g: (lat: number) => number | null,
  lo: number,
  hi: number,
): [number, number] | null {
  const a = g(lo) !== null;
  const b = g(hi) !== null;
  if (a && b) return [lo, hi];
  if (!a && !b) return null;
  let inside = a ? lo : hi;
  let outside = a ? hi : lo;
  for (let i = 0; i < 50; i++) {
    const m = (inside + outside) / 2;
    if (g(m) !== null) inside = m;
    else outside = m;
  }
  return a ? [lo, inside] : [inside, hi];
}

await initEphemeris();

const CHART: BirthData = {
  name: 'paran battery',
  year: 1941,
  month: 6,
  day: 5,
  hour: 9,
  minute: 30,
  tzOffset: -4,
  birthplace: { label: 'Yonkers', lat: 40.9312, lng: -73.8988 },
};
const jd = birthDataToJD(CHART);
const gmst = gmstRadians(jd);
const BODY_SET: PlanetName[] = ['Sun', 'Moon', 'Venus', 'Saturn', 'Pluto'];
const positions = getPlanetPositions(jd, 'mean').filter((p) => BODY_SET.includes(p.name));
const byName = new Map(positions.map((p) => [p.name, p]));
// The App's celestial meridian mapping (App.tsx): RA − GMST, in degrees.
const celestialLng: MeridianLng = (ra) => ((ra - gmst) * 180) / Math.PI;

// Sections 1–3 and 5 run on five charts with the default ten bodies, the Sun
// through Pluto (extended 2026-10-02 from the battery chart's five; the Part of
// Fortune has no sampled position and never enters the parans). Sections 6 and
// the overlay frame stay on the battery chart and its five bodies.
const TEN: PlanetName[] = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
const utChart = (name: string, y: number, mo: number, d: number, h: number, mi: number, lat: number, lng: number): BirthData => ({
  name,
  year: y,
  month: mo,
  day: d,
  hour: h,
  minute: mi,
  tzOffset: 0,
  birthplace: { label: name, lat, lng },
});
const CHARTS: BirthData[] = [
  CHART,
  utChart('London 1952', 1952, 3, 14, 6, 30, 51.507, -0.128),
  utChart('New York 1975', 1975, 10, 20, 18, 45, 40.713, -74.006),
  utChart('Sydney 1990', 1990, 7, 4, 12, 0, -33.869, 151.209),
  utChart('Singapore 2008', 2008, 12, 21, 3, 0, 1.352, 103.82),
];

for (const chart of CHARTS) verifyChart(chart);

// Sections 1–3 for one chart. The names jd / gmst / positions / byName /
// celestialLng / props are this chart's own here, as they were the battery
// chart's when these sections ran on it alone.
function verifyChart(chart: BirthData) {
  const jd = birthDataToJD(chart);
  const gmst = gmstRadians(jd);
  const positions = getPlanetPositions(jd, 'mean').filter((p) => TEN.includes(p.name));
  const byName = new Map(positions.map((p) => [p.name, p]));
  const celestialLng: MeridianLng = (ra) => ((ra - gmst) * 180) / Math.PI;
  const parans = generateParans(positions, celestialLng);
  const props = parans.features.map((f) => f.properties as ParanProps);
  const tag = chart.name;

  console.log(`\n${tag}: generated parans: ${props.length}`);

  // ── 1. Simultaneity + labels at every generated paran ─────────────────────────
  {
    let worstHorizonAlt = 0; // how far off the horizon the "on the horizon" body is
    let worstMeridian = 0; // how far off the meridian the culminating body is
    let labelErrors = 0;
    for (const p of props) {
      const A = byName.get(p.planetA)!;
      const B = byName.get(p.planetB)!;
      const lat = p.latitude;
      const lng = p.intersectionLng;

      // Body B is on the horizon at the chart instant at the intersection point.
      const altB = Math.abs(altitudeOf(jd, B.ra, B.dec, lat, lng));
      if (altB > worstHorizonAlt) worstHorizonAlt = altB;
      // ...and its ASC/DSC label matches whether it is actually rising there.
      const rising = altSlope(jd, B.ra, B.dec, lat, lng) > 0;
      if ((p.angleB === 'ASC') !== rising) labelErrors += 1;

      if (p.angleA === 'MC' || p.angleA === 'IC') {
        // A's hour angle at the intersection: 0 on the MC, π on the IC.
        const H = normDelta(gastRad(jd) + lng * DEG2RAD - A.ra);
        const err = p.angleA === 'MC' ? Math.abs(H) : Math.abs(Math.abs(H) - Math.PI);
        if (err > worstMeridian) worstMeridian = err;
      } else {
        // Horizon × horizon: A is on the horizon too, with a matching label.
        const altA = Math.abs(altitudeOf(jd, A.ra, A.dec, lat, lng));
        if (altA > worstHorizonAlt) worstHorizonAlt = altA;
        const risingA = altSlope(jd, A.ra, A.dec, lat, lng) > 0;
        if ((p.angleA === 'ASC') !== risingA) labelErrors += 1;
      }
    }
    check(`${tag}: paran horizon body altitude 0 at intersection`, worstHorizonAlt < 1e-9, `max ${worstHorizonAlt.toExponential(2)} rad`);
    check(`${tag}: paran meridian body on MC/IC at intersection`, worstMeridian < 1e-9, `max ${worstMeridian.toExponential(2)} rad`);
    check(`${tag}: paran ASC/DSC labels match actual rising/setting`, labelErrors === 0, `${labelErrors} mislabeled`);
  }

  // ── 1b. theta — the pairing's shared sidereal time holds along the whole line ──
  // ParanProps.theta claims: wherever local sidereal time equals theta, both
  // bodies stand on their claimed angles (the paran recurring with the daily
  // turn, at ANY longitude along the latitude). For each paran, solve the
  // instant LST hits theta at three longitudes — the intersection plus two
  // arbitrary ones — and re-run the section-1 angle conditions there against the
  // chart's fixed (ra, dec). Cross-validates theta jointly against the latitude
  // and both bodies, on the sidereal-time side the intersection checks never
  // exercise directly.
  {
    const TWO_PI = Math.PI * 2;
    const RATE = TWO_PI * 1.00273790935; // mean sidereal turn rate, rad/day
    const wrap2pi = (x: number) => ((x % TWO_PI) + TWO_PI) % TWO_PI;
    let worstAlt = 0;
    let worstMeridian = 0;
    let badRange = 0;
    for (const p of props) {
      if (!(Number.isFinite(p.theta) && p.theta >= 0 && p.theta < TWO_PI)) {
        badRange += 1;
        continue;
      }
      const A = byName.get(p.planetA)!;
      const B = byName.get(p.planetB)!;
      for (const lng of [p.intersectionLng, -117.25, 31.5]) {
        // The instant local sidereal time reaches theta at this longitude: one
        // wrapped sidereal step from the chart instant, one refinement.
        let jdT = jd + wrap2pi(p.theta - lng * DEG2RAD - gastRad(jd)) / RATE;
        jdT += normDelta(p.theta - lng * DEG2RAD - gastRad(jdT)) / RATE;
        const altB = Math.abs(altitudeOf(jdT, B.ra, B.dec, p.latitude, lng));
        if (altB > worstAlt) worstAlt = altB;
        if (p.angleA === 'MC' || p.angleA === 'IC') {
          const H = normDelta(gastRad(jdT) + lng * DEG2RAD - A.ra);
          const err = p.angleA === 'MC' ? Math.abs(H) : Math.abs(Math.abs(H) - Math.PI);
          if (err > worstMeridian) worstMeridian = err;
        } else {
          const altA = Math.abs(altitudeOf(jdT, A.ra, A.dec, p.latitude, lng));
          if (altA > worstAlt) worstAlt = altA;
        }
      }
    }
    check(`${tag}: theta in [0, 2π) on every paran`, badRange === 0, `${badRange} out of range`);
    check(`${tag}: theta: horizon bodies on the horizon when LST = theta (3 lngs each)`, worstAlt < 1e-6, `max ${worstAlt.toExponential(2)} rad`);
    check(`${tag}: theta: meridian bodies on the MC/IC when LST = theta (3 lngs each)`, worstMeridian < 1e-6, `max ${worstMeridian.toExponential(2)} rad`);
  }

  // ── 2. Completeness vs an independent brute-force scan ────────────────────────
  // For each configuration, scan latitude and root-find where the constraint
  // crosses zero, using only textbook horizon algebra (no parans.ts code). Every
  // root must appear in the generated set and vice versa.
  {
    type Found = { a: PlanetName; angleA: 'MC' | 'IC' | 'ASC' | 'DSC'; b: PlanetName; angleB: 'ASC' | 'DSC'; lat: number };
    const found: Found[] = [];

    // Altitude of body B at the sidereal moment body A sits on a given angle, as
    // a function of latitude. Roots in φ are the meridian×horizon parans.
    const altBatThetaOf = (theta: number, B: PlanetPosition) => (latDeg: number) => {
      const phi = latDeg * DEG2RAD;
      return Math.asin(
        Math.max(-1, Math.min(1,
          Math.cos(phi) * Math.cos(B.dec) * Math.cos(theta - B.ra) + Math.sin(phi) * Math.sin(B.dec),
        )),
      );
    };
    const bisect = (f: (x: number) => number, lo: number, hi: number): number => {
      let a = lo;
      let b = hi;
      for (let i = 0; i < 60; i++) {
        const m = (a + b) / 2;
        if ((f(a) <= 0) === (f(m) <= 0)) a = m;
        else b = m;
      }
      return (a + b) / 2;
    };

    for (const A of positions) {
      for (const B of positions) {
        if (A.name === B.name) continue;
        for (const angleA of ['MC', 'IC'] as const) {
          const theta = A.ra + (angleA === 'IC' ? Math.PI : 0);
          const f = altBatThetaOf(theta, B);
          for (let lat = -72; lat < 72; lat += 0.1) {
            const y0 = f(lat);
            const y1 = f(lat + 0.1);
            if ((y0 <= 0) === (y1 <= 0)) continue;
            const root = bisect(f, lat, lat + 0.1);
            // Label by whether B is rising at that sidereal moment: with frozen
            // positions, d(alt)/dθ ∝ −sin(θ − ra).
            const angleB: 'ASC' | 'DSC' = -Math.sin(theta - B.ra) > 0 ? 'ASC' : 'DSC';
            found.push({ a: A.name, angleA, b: B.name, angleB, lat: root });
          }
        }
      }
    }

    // Horizon×horizon: at each latitude both bodies have (up to) two horizon
    // crossings per sidereal day; a paran is where one of A's coincides with one
    // of B's. Track each rise/set pairing's sidereal-time gap across latitude.
    const horizonTheta = (P: PlanetPosition, latDeg: number, which: 'rise' | 'set'): number | null => {
      const x = -Math.tan(latDeg * DEG2RAD) * Math.tan(P.dec);
      if (x < -1 || x > 1) return null;
      // alt(θ) = 0 at hour angle ±H0; rising at −H0 (altitude increasing), setting at +H0.
      const H0 = Math.acos(x);
      return P.ra + (which === 'rise' ? -H0 : H0);
    };
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const A = positions[i];
        const B = positions[j];
        for (const wa of ['rise', 'set'] as const) {
          for (const wb of ['rise', 'set'] as const) {
            const g = (latDeg: number): number | null => {
              const ta = horizonTheta(A, latDeg, wa);
              const tb = horizonTheta(B, latDeg, wb);
              if (ta === null || tb === null) return null;
              return normDelta(ta - tb);
            };
            for (let lat = -72; lat < 72; lat += 0.1) {
              const cell = definedCell(g, lat, lat + 0.1);
              if (!cell) continue;
              const y0 = g(cell[0]) as number;
              const y1 = g(cell[1]) as number;
              if ((y0 <= 0) === (y1 <= 0)) continue;
              if (Math.abs(y0) > 1 || Math.abs(y1) > 1) continue; // ±π wrap, not a root
              const root = bisect((x) => g(x) ?? NaN, cell[0], cell[1]);
              found.push({
                a: A.name,
                angleA: wa === 'rise' ? 'ASC' : 'DSC',
                b: B.name,
                angleB: wb === 'rise' ? 'ASC' : 'DSC',
                lat: root,
              });
            }
          }
        }
      }
    }

    // Match the two sets both ways. Generated horizon×horizon parans are stored
    // for unordered pairs, so allow the scan's (A,B) to match a generated (B,A).
    const matches = (f: Found, p: ParanProps) =>
      Math.abs(f.lat - p.latitude) < 0.02 &&
      ((p.planetA === f.a && p.angleA === f.angleA && p.planetB === f.b && p.angleB === f.angleB) ||
        (p.planetA === f.b && p.planetB === f.a && p.angleA === f.angleB && p.angleB === f.angleA &&
          (p.angleA === 'ASC' || p.angleA === 'DSC')));

    const missing = found.filter((f) => !props.some((p) => matches(f, p)));
    const extra = props.filter((p) => !found.some((f) => matches(f, p)));
    check(
      `${tag}: completeness: every brute-force paran generated (${found.length} scanned)`,
      found.length > 0 && missing.length === 0,
      missing.slice(0, 4).map((m) => `${m.a} ${m.angleA} × ${m.b} ${m.angleB} @ ${m.lat.toFixed(2)}°`).join('; '),
    );
    check(
      `${tag}: completeness: no spurious generated parans (${props.length} generated)`,
      props.length > 0 && extra.length === 0,
      extra.slice(0, 4).map((p) => `${p.planetA} ${p.angleA} × ${p.planetB} ${p.angleB} @ ${p.latitude.toFixed(2)}°`).join('; '),
    );
  }

  // ── 3. Horizon×horizon mirror symmetry ────────────────────────────────────────
  // The two sidereal-time solutions of each pair sit at mirrored latitudes. Only
  // observable here when both survive the ±72° clip.
  {
    const hh = props.filter((p) => p.angleA === 'ASC' || p.angleA === 'DSC');
    const byPair = new Map<string, ParanProps[]>();
    for (const p of hh) {
      const key = `${p.planetA}|${p.planetB}`;
      byPair.set(key, [...(byPair.get(key) ?? []), p]);
    }
    let worst = 0;
    let pairs = 0;
    for (const list of byPair.values()) {
      if (list.length !== 2) continue;
      pairs += 1;
      const d = Math.abs(list[0].latitude + list[1].latitude);
      if (d > worst) worst = d;
    }
    check(
      `${tag}: horizon×horizon solutions mirror in latitude (${pairs} pairs)`,
      pairs > 0 && worst < 1e-9,
      `max |lat1+lat2| ${worst.toExponential(2)}°`,
    );
  }
}

// ── 4. Notes (numeric facts for the audit report) ─────────────────────────────
{
  // The |tan dec| < 1e-6 equator skip: a body sits inside that window only
  // while |dec| < 0.21″ — for the Sun, under ~10 s around an equinox crossing.
  console.log(`  note: equator-skip window |dec| < ${(Math.atan(1e-6) * RAD2DEG * 3600).toFixed(2)}″`);
}

// ── 5. Frame consistency with the drawn lines, celestial AND geodetic ─────────
// The paran's recorded intersection point is the badge's fly-to target; it must
// land where the drawn lines visibly cross the paran latitude, in BOTH line
// systems (in Mundane/geodetic mode the meridian mapping changes — a celestial-
// frame fly-to would miss the drawn crossing by roughly the GMST, ~96° on the
// battery chart). Every chart, the ten bodies.
for (const chart of CHARTS) {
  const jd = birthDataToJD(chart);
  const gmst = gmstRadians(jd);
  const positions = getPlanetPositions(jd, 'mean').filter((p) => TEN.includes(p.name));
  const tag = chart.name;
  const eps = obliquity(jd);
  // Both frames from the app's meridian factory, so the pair is one mapping, not a
  // factory beside a copy. (2026-10-02)
  const celestialLng = meridianLngFor('celestial', eps, gmst);
  const geodeticLng = meridianLngFor('geodetic', eps, gmst);
  const frames: Array<[string, PlanetPosition[], MeridianLng]> = [
    ['celestial', positions, celestialLng],
    ['geodetic', projectOntoEcliptic(positions, jd).filter((p) => TEN.includes(p.name)), geodeticLng],
  ];
  for (const [frame, pos, ml] of frames) {
    const ps = generateParans(pos, ml);
    const ls = generateLines(pos, ml);
    const byKey = new Map(
      ls.features.map((f) => [`${f.properties.planet}|${f.properties.lineType}`, f.geometry.coordinates as [number, number][]]),
    );
    let worstMc = 0; // intersectionLng vs the drawn MC/IC meridian longitude
    let worstHorizon = 0; // distance from the horizon curve to the intersection point
    let nMc = 0;
    for (const f of ps.features) {
      const p = f.properties as ParanProps;
      if (p.angleA === 'MC' || p.angleA === 'IC') {
        const meridian = byKey.get(`${p.planetA}|${p.angleA}`)!;
        const d = Math.abs(normLng(p.intersectionLng - meridian[0][0]));
        if (d > worstMc) worstMc = d;
        nMc += 1;
      }
      // The horizon body's drawn curve must pass through the intersection point
      // (within polyline sampling).
      const curve = byKey.get(`${p.planetB}|${p.angleB}`)!;
      let best = Infinity;
      for (const [lng, lat] of curve) {
        const d = Math.hypot(normLng(lng - p.intersectionLng), lat - p.latitude);
        if (d < best) best = d;
      }
      if (best > worstHorizon) worstHorizon = best;
    }
    // Both fail on an empty set: a frame that generated no parans compared nothing.
    check(
      `${tag}: ${frame}: paran fly-to sits on the drawn MC/IC meridian (${nMc} parans)`,
      nMc > 0 && worstMc < 1e-9,
      `max Δlng ${worstMc.toExponential(2)}°`,
    );
    check(
      `${tag}: ${frame}: drawn horizon curve passes through the fly-to point (${ps.features.length} parans)`,
      ps.features.length > 0 && worstHorizon < 1.2,
      `max miss ${worstHorizon.toFixed(3)}° (vertex spacing)`,
    );
  }
}

// ── 6. Fixed-star × planet parans ─────────────────────────────────────────────
// Same closed forms with a star's equinox-of-date position on one side; same
// oracles: every listed paran is a genuine simultaneity (the star and the
// planet really stand on their named angles at the same instant at that
// latitude), labels match actual rising/setting, and an independent latitude
// scan finds exactly the listed set.
{
  const stars = starsOfDate(jd, 'bright');
  const starByName = new Map(stars.map((s) => [s.name, s]));
  const planetSub = positions.filter((p) => ['Sun', 'Venus', 'Saturn'].includes(p.name));
  const sp = generateStarParans(stars, planetSub, celestialLng, '#cdbf8f');
  const spProps = sp.features.map((f) => f.properties as ParanProps);
  console.log(`generated star parans: ${spProps.length} (${stars.length} stars × ${planetSub.length} planets)`);

  let worstAlt = 0;
  let worstMeridian = 0;
  let labelErrors = 0;
  for (const p of spProps) {
    const star = starByName.get(p.star!)!;
    const planet = byName.get(p.planetA)!;
    // Parse who is on which angle from the label convention: the star side is
    // prefixed "★". The meridian body has angle MC/IC; horizon bodies ASC/DSC.
    const starFirst = p.label.startsWith('★');
    const aBody = starFirst ? star : planet;
    const bBody = starFirst ? planet : star;
    const lat = p.latitude;
    const lng = p.intersectionLng;
    const theta = gastRad(jd) + lng * DEG2RAD;

    const checkSide = (body: { ra: number; dec: number }, angle: string) => {
      if (angle === 'MC' || angle === 'IC') {
        const H = normDelta(theta - body.ra);
        const err = angle === 'MC' ? Math.abs(H) : Math.abs(Math.abs(H) - Math.PI);
        if (err > worstMeridian) worstMeridian = err;
      } else {
        const alt = Math.abs(altitudeOf(jd, body.ra, body.dec, lat, lng));
        if (alt > worstAlt) worstAlt = alt;
        const rising = altSlope(jd, body.ra, body.dec, lat, lng) > 0;
        if ((angle === 'ASC') !== rising) labelErrors += 1;
      }
    };
    checkSide(aBody, p.angleA);
    checkSide(bBody, p.angleB);
  }
  check('star parans: horizon bodies on the horizon', worstAlt < 1e-9, `max ${worstAlt.toExponential(2)} rad`);
  check('star parans: meridian bodies on the MC/IC', worstMeridian < 1e-9, `max ${worstMeridian.toExponential(2)} rad`);
  check('star parans: ASC/DSC labels match actual rising/setting', labelErrors === 0, `${labelErrors} mislabeled`);

  // Completeness for one star × one planet: a brute-force latitude scan of all
  // angle-event coincidences must reproduce exactly the generated set.
  const star = stars.find((s) => s.name === 'Regulus') ?? stars[0];
  const planet = byName.get('Saturn')!;
  const one = generateStarParans([star], [planet], celestialLng, '#cdbf8f')
    .features.map((f) => f.properties as ParanProps);
  const eventTheta = (b: { ra: number; dec: number }, which: string, latDeg: number): number | null => {
    if (which === 'MC') return b.ra;
    if (which === 'IC') return b.ra + Math.PI;
    const x = -Math.tan(latDeg * DEG2RAD) * Math.tan(b.dec);
    if (x < -1 || x > 1) return null;
    return b.ra + (which === 'ASC' ? -Math.acos(x) : Math.acos(x));
  };
  // Every angle pairing except both-on-meridian (two meridian events share a
  // sidereal time only when the bodies share a meridian — vertical lines, no
  // latitude — matching the generators' exclusion).
  const combos: Array<[string, string]> = [];
  for (const aw of ['MC', 'IC', 'ASC', 'DSC']) {
    for (const bw of ['MC', 'IC', 'ASC', 'DSC']) {
      const aMer = aw === 'MC' || aw === 'IC';
      const bMer = bw === 'MC' || bw === 'IC';
      if (aMer && bMer) continue;
      combos.push([aw, bw]);
    }
  }
  let scanned = 0;
  let missing = 0;
  for (const [starAngle, planetAngle] of combos) {
    const g = (latDeg: number): number | null => {
      const ts = eventTheta(star, starAngle, latDeg);
      const tp = eventTheta(planet, planetAngle, latDeg);
      if (ts === null || tp === null) return null;
      return normDelta(ts - tp);
    };
    for (let lat = -72; lat < 72; lat += 0.1) {
      const cell = definedCell(g, lat, lat + 0.1);
      if (!cell) continue;
      const y0 = g(cell[0]) as number;
      const y1 = g(cell[1]) as number;
      if ((y0 <= 0) === (y1 <= 0)) continue;
      if (Math.abs(y0) > 1 || Math.abs(y1) > 1) continue; // ±π wrap, not a root
      let lo = cell[0];
      let hi = cell[1];
      for (let i = 0; i < 50; i++) {
        const m = (lo + hi) / 2;
        if (((g(lo) ?? NaN) <= 0) === ((g(m) ?? NaN) <= 0)) lo = m;
        else hi = m;
      }
      const root = (lo + hi) / 2;
      scanned += 1;
      // The scan also finds planet-MC × star-horizon as star-ASC × planet-...;
      // match on the angle pair regardless of label order.
      const found = one.some((p) => {
        if (Math.abs(p.latitude - root) > 0.02) return false;
        const starFirst = p.label.startsWith('★');
        const sAngle = starFirst ? p.angleA : p.angleB;
        const pAngle = starFirst ? p.angleB : p.angleA;
        return sAngle === starAngle && pAngle === planetAngle;
      });
      if (!found) missing += 1;
    }
  }
  check(
    `star parans completeness (Regulus × Saturn): scan ↔ generated (${scanned} scanned, ${one.length} generated)`,
    missing === 0 && scanned === one.length,
    `${missing} missing`,
  );
}

// ── Overlay frame (one-frame rule) ────────────────────────────────────────────
// While an overlay is active the App feeds the paran generator that overlay's OWN
// single frame (transits/progressions/…), and the natal set is hidden. The generator
// is frame-agnostic, so single-frame simultaneity must hold on a transit set exactly
// as on the natal one, and every row must pair two bodies of that ONE set. (The
// SELECTION — natal parans hidden under any overlay — and the Cyclocartography
// suppression are App-wiring policy: docs/core-integration-seams.md L23, not generator
// math, so they're covered by the seam doc + manual QA rather than this unit.)
{
  const trJd = jd + 3653; // ~10 years on: a distinct sky, same battery of bodies
  const trGmst = gmstRadians(trJd);
  const trPos = getPlanetPositions(trJd, 'mean').filter((p) => BODY_SET.includes(p.name));
  const trByName = new Map(trPos.map((p) => [p.name, p]));
  const trLng: MeridianLng = (ra) => ((ra - trGmst) * 180) / Math.PI;
  const trProps = generateParans(trPos, trLng).features.map((f) => f.properties as ParanProps);
  let worstHorizon = 0;
  let worstMeridian = 0;
  let single = true;
  for (const p of trProps) {
    if (!trByName.has(p.planetA) || !trByName.has(p.planetB)) {
      single = false;
      continue;
    }
    const A = trByName.get(p.planetA)!;
    const B = trByName.get(p.planetB)!;
    const { latitude: lat, intersectionLng: lng } = p;
    const altB = Math.abs(altitudeOf(trJd, B.ra, B.dec, lat, lng));
    if (altB > worstHorizon) worstHorizon = altB;
    if (p.angleA === 'MC' || p.angleA === 'IC') {
      const H = normDelta(gastRad(trJd) + lng * DEG2RAD - A.ra);
      const err = p.angleA === 'MC' ? Math.abs(H) : Math.abs(Math.abs(H) - Math.PI);
      if (err > worstMeridian) worstMeridian = err;
    } else {
      const altA = Math.abs(altitudeOf(trJd, A.ra, A.dec, lat, lng));
      if (altA > worstHorizon) worstHorizon = altA;
    }
  }
  console.log(`overlay-frame parans generated: ${trProps.length}`);
  check('overlay frame: every paran pairs two bodies of the single overlay set', single);
  check('overlay frame: horizon body altitude 0 at intersection (transit set)', worstHorizon < 1e-9, `max ${worstHorizon.toExponential(2)} rad`);
  check('overlay frame: meridian body on MC/IC at intersection (transit set)', worstMeridian < 1e-9, `max ${worstMeridian.toExponential(2)} rad`);
}

// ── 7. Catalog minor body × planet parans ─────────────────────────────────────
// generateMinorParans (parans.ts): each of the reader's catalog bodies paired with
// the built-in bodies, never with each other. Run on the ten hypothetical points —
// their elements ship in src/, so this section never skips — plus Eros and Eris
// where their files are in public/ephe, and Pholus (the main-asteroid file).
//   7a TWO PARTS  the row against the two families' DRAWN lines: the meridian body's
//                 MC/IC line (generateMinorLines for a catalog body, generateLines for
//                 a partner) sits at the row's intersection longitude, and the horizon
//                 body's drawn curve passes through the intersection point. Both
//                 directions, and horizon × horizon, celestial and geodetic, every chart.
//   7b TWO PARTS  simultaneity (§1's test): at the intersection, at the chart instant,
//                 both bodies stand on their named angles, rising/setting labels included.
//   7c IDENTITY   a PlanetName partner from the set on every row (no catalog × catalog),
//                 no planet/planetA/planetB key, ≤6 rows per pair, within ±72°, the
//                 catalog body's own colour, its name on its own side, "(hyp)" on a point.
//   7d TWO PARTS  completeness: §6's brute-force scan of every angle pairing, every
//                 catalog body × partner on the battery chart, against the generated set.
//   7e            the chips: a catalog row is labelled only after every built-in row of
//                 its set (PARAN_RANK.pair), and carries its body and side.
//   7f            the switch's preference: off unless explicitly on; reading writes nothing.
{
  const HYP_KEYS = HYPOTHETICAL_POINTS.map((p) => p.n);
  const EPHE_DIR = resolve(process.cwd(), 'public/ephe');
  const disk: MinorBodySource = {
    id: 'verify-disk',
    label: 'disk',
    minQueryLen: 1,
    debounceMs: 0,
    search: async () => [],
    fetchFile: async (n) => {
      const b = readFileSync(resolve(EPHE_DIR, fileNameFor(n, 'short')));
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    },
  };
  await ensureMinorBodies(HYP_KEYS.map((n) => ({ n, source: bundledSource })));
  const FILED = [433, 136_199, 5145].filter(
    (n) => !needsMinorFile(n) || existsSync(resolve(EPHE_DIR, fileNameFor(n, 'short'))),
  );
  await ensureMinorBodies(FILED.map((n) => ({ n, source: disk })));
  const ready = (n: number) => minorLoadState(n)?.status === 'ready';
  const CATALOG = [...HYP_KEYS, ...FILED].filter(ready);
  check(
    `7 the ten hypothetical points load ready, so the section runs (${CATALOG.length} catalog bodies: ${CATALOG.join(', ')})`,
    HYP_KEYS.every(ready),
    HYP_KEYS.filter((n) => !ready(n)).join(', '),
  );

  // The decoration the App hands both families: a name, and a colour no planet has, so a
  // row coloured from a PLANET_COLORS lookup could not pass 7c.
  const nameOf = (n: number) => {
    const s = minorLoadState(n);
    return hypotheticalPoint(n)?.name ?? (s?.status === 'ready' ? s.name ?? '' : '');
  };
  const colourOf = (n: number) => `#0a${(Math.abs(n) % 256).toString(16).padStart(2, '0')}0c`;
  const decor = (n: number): MinorDecor => ({ name: nameOf(n), color: colourOf(n), icon: `minor-verify-${n}` });
  const planetColours = new Set(Object.values(PLANET_COLORS).map((c) => c.toLowerCase()));
  const PARTNERS: PlanetName[] = [...TEN, 'NorthNode', 'Chiron'];

  const isMer = (a: string) => a === 'MC' || a === 'IC';
  const runsOf = <P,>(
    fc: { features: { properties: P; geometry: { coordinates: number[][] } }[] },
    key: (p: P) => string,
  ) => {
    const m = new Map<string, [number, number][]>();
    for (const f of fc.features) {
      const k = key(f.properties);
      m.set(k, [...(m.get(k) ?? []), ...(f.geometry.coordinates as [number, number][])]);
    }
    return m;
  };
  const missBy = (curve: [number, number][] | undefined, lng: number, lat: number) => {
    let best = Infinity;
    for (const [x, y] of curve ?? []) best = Math.min(best, Math.hypot(normLng(x - lng), y - lat));
    return best;
  };

  // 7a + 7b + 7c, every chart, both frames.
  for (const frame of ['celestial', 'geodetic'] as const) {
    let rows = 0;
    let catMer = 0; // catalog body on MC/IC, partner on the horizon
    let planetMer = 0; // partner on MC/IC, catalog body on the horizon
    let both = 0; // both on the horizon
    let worstMer = 0;
    let worstHorizon = 0;
    let worstAlt = 0;
    let worstH = 0;
    let labelErrors = 0;
    const identity: string[] = [];
    let perPairMax = 0;
    for (const chart of CHARTS) {
      const jd = birthDataToJD(chart);
      const ml = meridianLngFor(frame, obliquity(jd), gmstRadians(jd));
      const rawPlanets = getPlanetPositions(jd, 'mean').filter((p) => PARTNERS.includes(p.name));
      const rawMinors = getMinorPositions(jd, CATALOG);
      const planets = frame === 'geodetic' ? projectOntoEcliptic(rawPlanets, jd) : rawPlanets;
      const minors = frame === 'geodetic' ? projectMinorOntoEcliptic(rawMinors, jd) : rawMinors;
      if (minors.length !== CATALOG.length) identity.push(`${chart.name}: ${minors.length}/${CATALOG.length} catalog positions`);
      const ps = generateMinorParans(minors, planets, ml, decor);
      const minorDrawn = runsOf(generateMinorLines(minors, ml, decor), (p) => `${p.number}|${p.lineType}`);
      const planetDrawn = runsOf(generateLines(planets, ml), (p) => `${p.planet}|${p.lineType}`);
      const minorBy = new Map(rawMinors.map((m) => [m.n, m]));
      const planetBy = new Map(rawPlanets.map((p) => [p.name, p]));
      const perPair = new Map<string, number>();
      for (const f of ps.features) {
        const p = f.properties;
        rows += 1;
        const catAngle = p.side === 'A' ? p.angleA : p.angleB;
        const partnerAngle = p.side === 'A' ? p.angleB : p.angleA;
        const catLine = (a: string) => minorDrawn.get(`${p.number}|${a}`);
        const partnerLine = (a: string) => planetDrawn.get(`${p.partner}|${a}`);

        // 7a — the drawn lines cross where the row says.
        if (isMer(p.angleA)) {
          const meridian = p.side === 'A' ? catLine(p.angleA) : partnerLine(p.angleA);
          const horizon = p.side === 'A' ? partnerLine(p.angleB) : catLine(p.angleB);
          if (p.side === 'A') catMer += 1;
          else planetMer += 1;
          worstMer = Math.max(worstMer, meridian ? Math.abs(normLng(p.intersectionLng - meridian[0][0])) : Infinity);
          worstHorizon = Math.max(worstHorizon, missBy(horizon, p.intersectionLng, p.latitude));
        } else {
          both += 1;
          worstHorizon = Math.max(
            worstHorizon,
            missBy(catLine(catAngle), p.intersectionLng, p.latitude),
            missBy(partnerLine(partnerAngle), p.intersectionLng, p.latitude),
          );
        }

        // 7b — simultaneity, in the frame that is the sky's own (celestial).
        if (frame === 'celestial') {
          const cat = minorBy.get(p.number)!;
          const partner = planetBy.get(p.partner)!;
          for (const [body, angle] of [[cat, catAngle], [partner, partnerAngle]] as const) {
            if (isMer(angle)) {
              const H = normDelta(gastRad(jd) + p.intersectionLng * DEG2RAD - body.ra);
              worstH = Math.max(worstH, angle === 'MC' ? Math.abs(H) : Math.abs(Math.abs(H) - Math.PI));
            } else {
              worstAlt = Math.max(worstAlt, Math.abs(altitudeOf(jd, body.ra, body.dec, p.latitude, p.intersectionLng)));
              const rising = altSlope(jd, body.ra, body.dec, p.latitude, p.intersectionLng) > 0;
              if ((angle === 'ASC') !== rising) labelErrors += 1;
            }
          }
        }

        // 7c — identity.
        const own = minorLabelName(p.number, nameOf(p.number));
        const [first, second] = p.label.split(' × ');
        const bad = [
          !isMinorParan(p) && 'not kind minor',
          !(p.partner in PLANET_CODES && PARTNERS.includes(p.partner)) && `partner ${p.partner}`,
          !CATALOG.includes(p.number) && `number ${p.number}`,
          p.body !== minorId(p.number) && `body ${p.body}`,
          ('planet' in p || 'planetA' in p || 'planetB' in p) && 'a planet key',
          Math.abs(p.latitude) > 72 && `lat ${p.latitude.toFixed(2)}`,
          (p.color !== colourOf(p.number) || planetColours.has(p.color.toLowerCase())) && `colour ${p.color}`,
          !(own && (p.side === 'A' ? first : second)?.startsWith(`${own} `)) && `label "${p.label}"`,
          isHypotheticalKey(p.number) && !p.label.includes(' (hyp) ') && `no (hyp) in "${p.label}"`,
          p.icon !== `minor-verify-${p.number}` && 'icon',
        ].filter(Boolean) as string[];
        if (bad.length) identity.push(`${chart.name} ${p.label}: ${bad.join(', ')}`);
        const k = `${p.number}|${p.partner}`;
        perPair.set(k, (perPair.get(k) ?? 0) + 1);
      }
      for (const v of perPair.values()) perPairMax = Math.max(perPairMax, v);
    }
    // Every count must be non-empty: a direction that generated nothing compared nothing.
    check(
      `7a ${frame}: the drawn MC/IC line sits at the row's longitude — catalog body (${catMer}) and partner (${planetMer}) on the meridian`,
      catMer > 0 && planetMer > 0 && worstMer < 1e-9,
      `max Δlng ${worstMer.toExponential(2)}°`,
    );
    check(
      `7a ${frame}: the drawn horizon curve passes through the intersection — ${rows} rows, ${both} horizon × horizon`,
      rows > 0 && both > 0 && worstHorizon < 1.2,
      `max miss ${worstHorizon.toFixed(3)}° (vertex spacing)`,
    );
    if (frame === 'celestial') {
      check(`7b ${frame}: horizon bodies at altitude 0 at the intersection (${rows} rows)`, rows > 0 && worstAlt < 1e-9, `max ${worstAlt.toExponential(2)} rad`);
      check(`7b ${frame}: meridian bodies on the MC/IC at the intersection`, rows > 0 && worstH < 1e-9, `max ${worstH.toExponential(2)} rad`);
      check(`7b ${frame}: ASC/DSC labels match actual rising/setting`, rows > 0 && labelErrors === 0, `${labelErrors} mislabeled`);
    }
    check(
      `7c ${frame}: every row pairs one catalog body with a built-in partner, keyed and decorated as its own (no planet keys, ±72°, its colour, "(hyp)" on a point)`,
      rows > 0 && identity.length === 0,
      identity.slice(0, 4).join('; '),
    );
    check(`7c ${frame}: at most six rows per catalog body × partner`, perPairMax > 0 && perPairMax <= 6, `max ${perPairMax}`);
  }

  const jd0 = birthDataToJD(CHART);
  const ml0 = meridianLngFor('celestial', obliquity(jd0), gmstRadians(jd0));
  {
    const someMinors = getMinorPositions(jd0, CATALOG);
    const somePlanets = getPlanetPositions(jd0, 'mean').filter((p) => TEN.includes(p.name));
    const planetRow = generateParans(somePlanets, ml0).features[0]?.properties;
    check(
      '7c no partners or no catalog bodies → no rows; a planet row is never read as a catalog one',
      generateMinorParans(someMinors, [], ml0, decor).features.length === 0 &&
        generateMinorParans([], somePlanets, ml0, decor).features.length === 0 &&
        !!planetRow && !isMinorParan(planetRow),
    );
  }

  // 7d — completeness against an independent scan (battery chart, celestial).
  {
    const minors = getMinorPositions(jd0, CATALOG);
    const planets = getPlanetPositions(jd0, 'mean').filter((p) => PARTNERS.includes(p.name));
    const rows = generateMinorParans(minors, planets, ml0, decor).features.map((f) => f.properties);
    const eventTheta = (b: { ra: number; dec: number }, which: string, latDeg: number): number | null => {
      if (which === 'MC') return b.ra;
      if (which === 'IC') return b.ra + Math.PI;
      const x = -Math.tan(latDeg * DEG2RAD) * Math.tan(b.dec);
      if (x < -1 || x > 1) return null;
      return b.ra + (which === 'ASC' ? -Math.acos(x) : Math.acos(x));
    };
    const ANGLES = ['MC', 'IC', 'ASC', 'DSC'];
    let scanned = 0;
    const missing: string[] = [];
    for (const m of minors) {
      for (const pl of planets) {
        for (const ca of ANGLES) {
          for (const pa of ANGLES) {
            if (isMer(ca) && isMer(pa)) continue;
            const g = (latDeg: number): number | null => {
              const tc = eventTheta(m, ca, latDeg);
              const tp = eventTheta(pl, pa, latDeg);
              return tc === null || tp === null ? null : normDelta(tc - tp);
            };
            for (let lat = -72; lat < 72; lat += 0.1) {
              const cell = definedCell(g, lat, lat + 0.1);
              if (!cell) continue;
              const y0 = g(cell[0]) as number;
              const y1 = g(cell[1]) as number;
              if ((y0 <= 0) === (y1 <= 0)) continue;
              if (Math.abs(y0) > 1 || Math.abs(y1) > 1) continue; // ±π wrap, not a root
              let lo = cell[0];
              let hi = cell[1];
              for (let i = 0; i < 50; i++) {
                const mid = (lo + hi) / 2;
                if (((g(lo) ?? NaN) <= 0) === ((g(mid) ?? NaN) <= 0)) lo = mid;
                else hi = mid;
              }
              const root = (lo + hi) / 2;
              scanned += 1;
              const hit = rows.some(
                (p) =>
                  p.number === m.n &&
                  p.partner === pl.name &&
                  Math.abs(p.latitude - root) < 0.02 &&
                  (p.side === 'A' ? p.angleA : p.angleB) === ca &&
                  (p.side === 'A' ? p.angleB : p.angleA) === pa,
              );
              if (!hit) missing.push(`${m.n} ${ca} × ${pl.name} ${pa} @ ${root.toFixed(2)}°`);
            }
          }
        }
      }
    }
    check(
      `7d completeness (${minors.length} catalog bodies × ${planets.length} partners): scan ↔ generated (${scanned} scanned, ${rows.length} generated)`,
      rows.length > 0 && missing.length === 0 && scanned === rows.length,
      missing.slice(0, 4).join('; '),
    );
  }

  // 7e — the chips. A flat test map, the camera on (0, 0), every row at one latitude: the centre
  // spot and one chip's width either side hold three chips, so of four rows one goes unlabelled.
  {
    const fakeMap = {
      getCenter: () => ({ lng: 0, lat: 0 }),
      getProjection: () => ({ type: 'mercator' }),
      project: ([lng, lat]: [number, number]) => ({ x: 400 + lng * 4, y: 300 - lat * 4 }),
    } as unknown as maplibregl.Map;
    type Row = Feature<LineString, ParanProps | MinorParanProps>;
    const row = (p: Partial<ParanProps & MinorParanProps>): Row =>
      ({
        type: 'Feature',
        properties: { latitude: 10, intersectionLng: 0, theta: 0, color: '#000', label: '', ...p },
        geometry: { type: 'LineString', coordinates: [] },
      }) as Row;
    const builtIn = (a: PlanetName, b: PlanetName) => row({ planetA: a, angleA: 'MC', planetB: b, angleB: 'ASC' });
    const catalog = row({ kind: 'minor', body: minorId(-42), number: -42, name: 'Zeus', icon: '', side: 'A', partner: 'Sun', angleA: 'MC', angleB: 'ASC' });
    const place = (features: Row[]) =>
      placeParanChips(
        fakeMap,
        [{ fc: { type: 'FeatureCollection', features }, overlay: false }],
        () => new ChipOccupancy(800, 600, []),
        estimateParanChip,
        0,
        800,
        600,
      );
    // The catalog row first in, and paired with the Sun: by the pair's stronger body alone it
    // would take the column from Saturn × Uranus.
    const crowded = place([catalog, builtIn('Saturn', 'Uranus'), builtIn('Neptune', 'Pluto'), builtIn('Uranus', 'Pluto')]);
    check(
      '7e a catalog row is labelled after every built-in row of its set: Sun × Zeus loses the crowded column to Saturn × Uranus and the outer pairs',
      PARAN_RANK.pair.catalog > PARAN_RANK.pair.builtIn && crowded.length === 3 && crowded.every((b) => b.minorN === undefined),
      crowded.map((b) => `${b.planetA}×${b.planetB}${b.minorN !== undefined ? ` (${b.minorN})` : ''}`).join(', '),
    );
    const [alone] = place([catalog]);
    const [twin] = place([builtIn('Sun', 'Sun')]);
    check(
      '7e … and alone it is labelled: its body, side and colour on the chip, both planet keys the partner, a key and a face of its own',
      !!alone && 'planetA' in alone && alone.minorN === -42 && alone.minorSide === 'A' &&
        alone.minorColor === '#000' && alone.planetA === 'Sun' && alone.planetB === 'Sun' &&
        alone.key.startsWith('pnm-') && !!twin && paranChipFace(alone) !== paranChipFace(twin) &&
        alone.key !== twin.key,
      alone ? `${alone.key} ${paranChipFace(alone)}` : 'none placed',
    );
  }

  // 7f — the switch's preference, through a stand-in storage that counts writes.
  {
    const store = new Map<string, string>();
    let writes = 0;
    let blocked = false;
    const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: (k: string) => {
          if (blocked) throw new Error('verify: storage blocked');
          return store.get(k) ?? null;
        },
        setItem: (k: string, v: string) => {
          if (blocked) throw new Error('verify: storage blocked');
          writes += 1;
          store.set(k, String(v));
        },
        removeItem: (k: string) => void store.delete(k),
      },
    });
    try {
      const untouched = loadMinorParansPref();
      store.set(MINOR_PARANS_PREF_KEY, 'true');
      const malformed = loadMinorParansPref();
      store.delete(MINOR_PARANS_PREF_KEY);
      check(
        `7f the switch (${MINOR_PARANS_PREF_KEY}) is off untouched and on for nothing but its own '1'; reading writes nothing`,
        MINOR_PARANS_PREF_KEY === 'astro:minor-parans:v1' && untouched === false && malformed === false &&
          writes === 0 && !store.has(MINOR_PARANS_PREF_KEY),
        `untouched ${untouched}, 'true' ${malformed}, ${writes} writes`,
      );
      saveMinorParansPref(true);
      const on = loadMinorParansPref();
      saveMinorParansPref(false);
      const off = loadMinorParansPref();
      blocked = true;
      const whileBlocked = loadMinorParansPref();
      saveMinorParansPref(true); // must not throw
      check(
        '7f its own setter stores it both ways, and blocked storage reads as off without throwing',
        on === true && off === false && store.get(MINOR_PARANS_PREF_KEY) === '0' && whileBlocked === false && writes === 2,
        `on ${on}, off ${off}, stored ${store.get(MINOR_PARANS_PREF_KEY)}, blocked ${whileBlocked}, ${writes} writes`,
      );
    } finally {
      if (prior) Object.defineProperty(globalThis, 'localStorage', prior);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  }
}

console.log(failures === 0 ? '\nverify-parans: ALL PASS' : `\nverify-parans: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
