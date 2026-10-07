// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies what a geodetic map does with a chart that has NO birth time, through the real
// modules (run via the harness: `npm run verify:geodetic-chart`): the uncertainty bands
// around the fast bodies' lines (uncertaintyBands.ts), the spans they and the printed
// ranges are built from (timeless.ts), the range formatter (format.ts lonRange), and the
// horizon tracer's latitude limit the bands lean on (lines.ts traceHorizonCoords).
//
// Written 2026-10-02 with the timeless chart on geodetic maps. A geodetic map doesn't turn
// with the sky, so a chart with no birth time draws its lines there, from its 12:00
// placeholder — and a fast body's line can be anywhere in a band around that. The houses a
// geodetic chart is drawn in are verify-geodetic §6's (the frame is the place's, with or
// without a birth time), so they are not repeated here.
//
//   1. Band membership against the place readout          INTERNAL IDENTITY (two parts agree)
//   2. Ring sanity across the whole zodiac                 INTERNAL IDENTITY
//   3. The spans against the ephemeris, 1900–2100          OUTSIDE AGREEMENT
//   4. lonRange: truncated ends, own signs, float noise    OUTSIDE AGREEMENT (cases) + INTERNAL IDENTITY (sweep)
//   5. The generator's contract: which lines get a band    INTERNAL IDENTITY (+ the line inside its band)
//   6. App's sky families read one gate                    SOURCE TRIPWIRE (2026-10-02)
//   7. App's sky hold: masked, never written               SOURCE TRIPWIRE (2026-10-05)
//
// The kinds, as in verify-geodetic (CLAUDE.md, "Prefer agreement between two parts"):
//   OUTSIDE AGREEMENT — the code against an independent reference (Swiss, the display rule).
//                       Breaking means the code is self-consistent and wrong.
//   INTERNAL IDENTITY — the code against itself. Breaking means it contradicts itself. §1
//                       is the strongest: the band polygon (the horizon tracer and the
//                       turning-point loci) and the place readout (geodeticAngles, a closed
//                       form) are written independently and must say the same thing about
//                       every place.
//   SOURCE TRIPWIRE   — the code's shape, where its behaviour can't be reached from Node.
//                       Breaking means a guard was removed or renamed; read the diff.
// Every comparison counts what it compared and fails on an empty set rather than passing
// vacuously.
import { readFileSync } from 'node:fs';
import {
  PLANET_COLORS,
  birthDataToJD,
  bodyLonSpeed,
  eclipticToRaDec,
  geodeticAngles,
  initEphemeris,
  obliquity,
  type PlanetName,
  type PlanetPosition,
} from '../src/lib/ephemeris';
import {
  generateLines,
  meridianLngFor,
  normLng,
  traceHorizonCoords,
  type LineProps,
  type LineType,
} from '../src/lib/astro/lines';
import { lonRange, lonRangeText, truncZodiac } from '../src/lib/astro/format';
import { SIGN_GLYPHS } from '../src/lib/astro/glyphChars';
import { TIMELESS_BAND_DEG, TIMELESS_RANGE_DEG } from '../src/lib/astro/timeless';
import {
  UNCERTAINTY_BAND_OPACITY,
  generateUncertaintyBands,
  type UncertaintyBandProps,
} from '../src/lib/astro/uncertaintyBands';
import { SEED_BIRTHS } from '../src/lib/birthData';
import type { Feature, FeatureCollection, LineString, Polygon } from 'geojson';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}
const section = (s: string) => console.log(`\n── ${s} ──`);
const note = (s: string) => console.log(`      ${s}`);

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
// Smallest difference between two directions in degrees, 0…180.
const degDiff = (a: number, b: number) => {
  const d = ((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
};
// Signed difference b − a folded into (−180, 180].
const signedDiff = (a: number, b: number) => {
  const d = ((((b - a + 180) % 360) + 360) % 360) - 180;
  return d === -180 ? 180 : d;
};
// A tiny seeded PRNG (mulberry32), so the random cases are the same every run.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

await initEphemeris();

// A real chart's moment and obliquity: the bands of a chart are built at its own ε.
const JD = birthDataToJD(SEED_BIRTHS[0]);
const EPS = obliquity(JD);
const ML = meridianLngFor('geodetic', EPS, 0);
const BAND_TYPES: LineType[] = ['MC', 'IC', 'ASC', 'DSC'];

// A body at ecliptic longitude lonDeg, as the geodetic line pipeline holds it (projected
// onto the ecliptic: lon of record, ra/dec at latitude 0 — projectOntoEcliptic's shape).
function bodyAt(name: PlanetName, lonDeg: number): PlanetPosition {
  const lon = (((lonDeg % 360) + 360) % 360) * D2R;
  return { name, ...eclipticToRaDec(lon, 0, EPS), lon };
}
function bandsFor(p: PlanetPosition): FeatureCollection<Polygon, UncertaintyBandProps> {
  return generateUncertaintyBands(generateLines([p], ML), [p], TIMELESS_BAND_DEG, ML, EPS);
}

// ── Point in ring, by rows ─────────────────────────────────────────────────────
// Even-odd against the ring's crossings of one latitude, testing the point's longitude
// at every world copy the ring can reach (its vertices stay inside ±540).
function rowCrossings(ring: number[][], lat: number): number[] {
  const xs: number[] = [];
  for (let i = 1; i < ring.length; i++) {
    const [x1, y1] = ring[i - 1];
    const [x2, y2] = ring[i];
    if (y1 > lat !== y2 > lat) xs.push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1));
  }
  return xs.sort((a, b) => a - b);
}
function insideRow(xs: number[], lng: number): boolean {
  for (let k = -2; k <= 2; k++) {
    const x = lng + 360 * k;
    let n = 0;
    for (const c of xs) if (c > x) n++;
    if (n % 2 === 1) return true;
  }
  return false;
}
// Planar distance (degrees) from a point to the ring's edges, at the nearest world copy.
function distToRing(ring: number[][], lng: number, lat: number): number {
  let best = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const [x1, y1] = ring[i - 1];
    const [x2, y2] = ring[i];
    for (let k = -2; k <= 2; k++) {
      const px = lng + 360 * k;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const L = dx * dx + dy * dy;
      const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (lat - y1) * dy) / L));
      const ex = x1 + t * dx - px;
      const ey = y1 + t * dy - lat;
      best = Math.min(best, Math.hypot(ex, ey));
    }
  }
  return best;
}

// ── 1. Band membership against the place readout ─────────────────────────────────
section('1. Band membership against the place readout (INTERNAL IDENTITY, two parts agree)');
// A place is in a body's MC band when its MC is within ±w of the body's degree, in its IC
// band when its IC is, in its ASC band when its geodetic Ascendant is, in its DSC band when
// its Descendant is — that is the band's definition, read off geodeticAngles. The polygon
// is built from the horizon tracer and the turning-point loci, never from the readout.
// Over a 1.5° grid from 84°S to 84°N the two must agree at every place, but for places
// within EDGE_TOL of the ring, where the polygon's own vertex spacing decides — and only a
// handful of those in any one band.
//
// Tightened 2026-10-02 after a review moved band edges by hand and watched this pass: with
// the excuse at 0.25° and a global allowance of 0.2% of every comparison, an MC edge moved
// 0.1° (9% of Mercury's half-width) and an ASC end moved 0.1° both went through. Measured,
// the shipped polygon's worst disagreement sits 0.004° from its ring, so the excuse is now
// 0.02°, counted band by band. Whole-degree centres put the MC edges at x.3° and x.7°, a fixed
// distance from every grid meridian, so the degrees now include band ends ON the equinoxes
// (w, 180° ± w, 360° − w for each body) alongside the random ones; and the MC and IC edges get
// an exact test of their own below, which no grid could give them.
const GRID = 1.5;
const LATS: number[] = [];
for (let lat = -84; lat <= 84 + 1e-9; lat += GRID) LATS.push(Number(lat.toFixed(6)));
const LNGS: number[] = [];
for (let lng = -180; lng < 180 - 1e-9; lng += GRID) LNGS.push(Number(lng.toFixed(6)));
// The readout at every grid place, computed once: [asc, dsc, mc] in degrees.
const READ: number[][][] = LATS.map((lat) =>
  LNGS.map((lng) => {
    const g = geodeticAngles(lng, lat, EPS);
    return [g.asc * R2D, g.dsc * R2D, g.mc * R2D];
  }),
);
const EDGE_TOL = 0.02;
const ON_RING = 1e-6;
const MAX_NEAR_EDGE_PER_BAND = 6;
const MIN_INSIDE = 50;
const CASE_DEGS = [0, 2, 7, 90, 172, 178, 180, 185, 270, 355];
for (const w of [TIMELESS_BAND_DEG.Moon!, TIMELESS_BAND_DEG.Mercury!]) CASE_DEGS.push(w, 180 - w, 180 + w, 360 - w);
{
  const rand = rng(20261002);
  for (let i = 0; i < 40; i++) CASE_DEGS.push(Number((rand() * 360).toFixed(4)));
}
let compared = 0;
let insideTotal = 0;
let nearEdge = 0;
let onRing = 0;
let worstNearEdge = 0;
let worstBandNear = 0;
let worstBandAt = '';
const misses: string[] = [];
let thinBands = 0;
let bandsCompared = 0;
for (const body of ['Moon', 'Mercury'] as const) {
  const w = TIMELESS_BAND_DEG[body]!;
  for (const lonDeg of CASE_DEGS) {
    const fc = bandsFor(bodyAt(body, lonDeg));
    for (const lt of BAND_TYPES) {
      const f = fc.features.find((x) => x.properties.lineType === lt);
      if (!f) {
        misses.push(`${body} ${lonDeg}° ${lt}: no band`);
        continue;
      }
      bandsCompared++;
      const ring = f.geometry.coordinates[0];
      const centre = lt === 'IC' ? lonDeg + 180 : lonDeg;
      const which = lt === 'ASC' ? 0 : lt === 'DSC' ? 1 : 2;
      let inside = 0;
      let bandNear = 0;
      LATS.forEach((lat, r) => {
        const xs = rowCrossings(ring, lat);
        LNGS.forEach((lng, c) => {
          const byReadout = degDiff(READ[r][c][which], centre) <= w;
          const byPolygon = insideRow(xs, lng);
          if (byReadout) inside++;
          if (byReadout === byPolygon) {
            compared++;
            return;
          }
          const d = distToRing(ring, lng, lat);
          // ON the ring (a band end on a grid meridian puts a whole column there): either
          // answer is the edge, and float noise picks one. Not counted.
          if (d < ON_RING) onRing++;
          else if (d < EDGE_TOL) {
            nearEdge++;
            bandNear++;
            worstNearEdge = Math.max(worstNearEdge, d);
          } else if (misses.length < 12) {
            misses.push(
              `${body} ${lonDeg}° ${lt} at ${lat},${lng}: readout ${byReadout ? 'in' : 'out'}, polygon ${byPolygon ? 'in' : 'out'} (${d.toFixed(2)}° from the ring)`,
            );
          } else misses.push('…');
        });
      });
      insideTotal += inside;
      if (inside < MIN_INSIDE) thinBands++;
      if (bandNear > worstBandNear) [worstBandNear, worstBandAt] = [bandNear, `${body} ${lonDeg}° ${lt}`];
    }
  }
}
note(
  `${bandsCompared} bands (Moon ±7.7°, Mercury ±1.1°; ${CASE_DEGS.length} degrees each), ${LATS.length}×${LNGS.length} places per band`,
);
note(`${compared} place-band pairs agreed; ${insideTotal} of them inside a band; ${onRing} on a ring; ${nearEdge} disagreements within ${EDGE_TOL}° of one (farthest ${worstNearEdge.toFixed(4)}°); most in one band ${worstBandNear} (${worstBandAt || 'none'})`);
check('every band is present: MC, IC, ASC and DSC for both bodies at every degree', bandsCompared === 2 * CASE_DEGS.length * 4, `${bandsCompared}`);
check(`the polygon and the place readout agree at every place farther than ${EDGE_TOL}° from the ring`, misses.length === 0, misses.slice(0, 12).join(' | '));
check(`not vacuous: every band holds ≥ ${MIN_INSIDE} grid places by the readout`, thinBands === 0 && insideTotal > 0, `${thinBands} thin`);
check(`no band has more than ${MAX_NEAR_EDGE_PER_BAND} near-edge disagreements`, worstBandNear <= MAX_NEAR_EDGE_PER_BAND, `${worstBandNear} in ${worstBandAt}`);

// The MC and IC edges, exactly. A strip band's edges are meridians, so its definition can be
// checked where a grid can't reach: every vertex off the poles is a place whose readout MC
// (for the IC band, its IC) is the band's end degree λ ∓ w, to 1e-9°, both ends are used, and
// a place 1e-6° inside each edge is in the band by both the polygon and the readout, 1e-6°
// outside it out by both.
// Seeded centres every half degree, nudged off the grid, at the chart's own obliquity.
{
  let strips = 0;
  let bad = 0;
  let worstOff = 0;
  const ex: string[] = [];
  const PROBE_LATS = [-80, -45, 0, 30, 66, 83];
  for (const body of ['Moon', 'Mercury'] as const) {
    const w = TIMELESS_BAND_DEG[body]!;
    for (let k = 0; k < 720; k++) {
      const lonDeg = k / 2 + 0.0137 * (k % 7);
      const p = bodyAt(body, lonDeg);
      const drawn = generateLines([p], ML);
      const meridians: FeatureCollection<LineString, LineProps> = {
        type: 'FeatureCollection',
        features: drawn.features.filter((f) => f.properties.lineType === 'MC' || f.properties.lineType === 'IC'),
      };
      const fc = generateUncertaintyBands(meridians, [p], TIMELESS_BAND_DEG, ML, EPS);
      for (const lt of ['MC', 'IC'] as const) {
        const f = fc.features.find((x) => x.properties.lineType === lt);
        strips++;
        if (!f) {
          bad++;
          if (ex.length < 4) ex.push(`${body} ${lonDeg}° ${lt}: no band`);
          continue;
        }
        const ring = f.geometry.coordinates[0];
        // The end degrees, read off the place's MC (IC); the IC strip's meridians are those
        // degrees' IC longitudes, half a turn from where they culminate.
        const ends = [lonDeg - w, lonDeg + w];
        const off = lt === 'IC' ? 180 : 0;
        const readAngle = (lng: number, lat: number) => {
          const g = geodeticAngles(lng, lat, EPS);
          return (lt === 'IC' ? g.ic : g.mc) * R2D;
        };
        const used = [false, false];
        let onEdges = true;
        for (const [x, y] of ring) {
          if (Math.abs(y) >= 90) continue;
          const a = readAngle(x, y);
          const e0 = degDiff(a, ends[0]);
          const e1 = degDiff(a, ends[1]);
          worstOff = Math.max(worstOff, Math.min(e0, e1));
          if (e0 < 1e-9) used[0] = true;
          else if (e1 < 1e-9) used[1] = true;
          else onEdges = false;
        }
        let probesOk = true;
        for (const lat of PROBE_LATS) {
          const xs = rowCrossings(ring, lat);
          for (const [lng, want] of [
            [ends[0] + off + 1e-6, true],
            [ends[0] + off - 1e-6, false],
            [ends[1] + off - 1e-6, true],
            [ends[1] + off + 1e-6, false],
          ] as const) {
            const x = normLng(lng);
            const byReadout = degDiff(readAngle(x, lat), lonDeg) <= w;
            if (insideRow(xs, x) !== want || byReadout !== want) probesOk = false;
          }
        }
        if (!(onEdges && used[0] && used[1] && probesOk)) {
          bad++;
          if (ex.length < 4) ex.push(`${body} ${lonDeg.toFixed(4)}° ${lt}: on the end meridians ${onEdges}, both used ${used}, probes ${probesOk}`);
        }
      }
    }
  }
  note(`${strips} MC/IC strips; farthest vertex from an end meridian ${worstOff.toExponential(2)}°`);
  check(
    'every MC and IC strip is exactly the meridians of λ ∓ w (to 1e-9°), with 1e-6° probes on the right side by both parts',
    strips === 2 * 720 * 2 && bad === 0,
    `${bad} of ${strips}${ex.length ? ` — ${ex.join(' | ')}` : ''}`,
  );
}

// The two Appendix places on 0° Aries' own rising meridian (90°W): their Ascendant IS the
// band's centre, so they are inside the 0° Aries ASC band for both bodies — and the readout
// says AS 0° Aries there, inside the polar circle as outside it.
{
  const pts: [number, number][] = [[-90, 75], [-90, 40]];
  for (const body of ['Moon', 'Mercury'] as const) {
    const f = bandsFor(bodyAt(body, 0)).features.find((x) => x.properties.lineType === 'ASC');
    const ring = f?.geometry.coordinates[0] ?? [];
    const results = pts.map(([lng, lat]) => {
      const asText = truncZodiac(geodeticAngles(lng, lat, EPS).asc, 'min');
      return {
        inside: ring.length > 0 && insideRow(rowCrossings(ring, lat), lng),
        aries0: asText.signIdx === 0 && asText.deg === 0 && asText.min === 0,
      };
    });
    check(
      `${body} at 0° Aries: 75N 90W and 40N 90W inside its ASC band, reading AS 0°♈00'`,
      results.every((x) => x.inside && x.aries0),
      JSON.stringify(results),
    );
  }
}

// ── 2. Ring sanity across the whole zodiac ──────────────────────────────────────────
section('2. Ring sanity across the whole zodiac (INTERNAL IDENTITY)');
// Every half degree, both bodies, every band. A ring the generator dropped (wound round a
// pole, or a NaN) is a missing band, so the count is part of the check.
{
  let rings = 0;
  let missing = 0;
  const bad: string[] = [];
  let maxExtent = 0;
  for (const body of ['Moon', 'Mercury'] as const) {
    for (let k = 0; k < 720; k++) {
      const lonDeg = k / 2;
      const fc = bandsFor(bodyAt(body, lonDeg));
      for (const lt of BAND_TYPES) {
        const f = fc.features.find((x) => x.properties.lineType === lt);
        if (!f) {
          missing++;
          continue;
        }
        rings++;
        const ring = f.geometry.coordinates[0];
        const [fx, fy] = ring[0];
        const [lx, ly] = ring[ring.length - 1];
        const why: string[] = [];
        if (f.geometry.coordinates.length !== 1) why.push('not one ring');
        if (fx !== lx || fy !== ly) why.push('not closed');
        if (ring.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) why.push('non-finite');
        if (ring.some(([, y]) => Math.abs(y) > 90)) why.push('|lat| > 90');
        if (ring.some(([x]) => Math.abs(x) > 540)) why.push('outside ±540');
        if (fx < -180 || fx >= 180) why.push('first vertex outside −180…180');
        // Net wrap: the unwrapped longitude comes back to where it set out, the closing edge
        // included, and no edge jumps the seam.
        let net = 0;
        let chord = '';
        for (let i = 1; i < ring.length; i++) {
          const d = ring[i][0] - ring[i - 1][0];
          net += d;
          if (Math.abs(d) >= 180) why.push('an edge ≥ 180° of longitude');
          // A long edge is legitimate only at a pole: the runs along ±90, and a near-
          // equinox degree's last few half-degree latitude samples, which swing tens of
          // degrees of longitude above 85.5° (and under 4.6° below it). Anywhere else it
          // is a chord: across the map, or across the cap a ring clipped short of its
          // turning point would leave on the globe.
          if (
            Math.abs(d) > 5 &&
            Math.min(Math.abs(ring[i][1]), Math.abs(ring[i - 1][1])) < 85.5 &&
            !chord
          )
            chord = `a ${d.toFixed(1)}° edge at ${ring[i - 1][1].toFixed(1)}→${ring[i][1].toFixed(1)}°`;
        }
        if (Math.abs(net) >= 180) why.push(`net wrap ${net.toFixed(1)}°`);
        if (chord) why.push(chord);
        const xs = ring.map(([x]) => x);
        maxExtent = Math.max(maxExtent, Math.max(...xs) - Math.min(...xs));
        if (why.length && bad.length < 10) bad.push(`${body} ${lonDeg}° ${lt}: ${why.join(', ')}`);
        else if (why.length) bad.push('…');
      }
    }
  }
  note(`${rings} rings (2 bodies × 720 degrees × 4 lines); widest spans ${maxExtent.toFixed(1)}° of longitude`);
  check('no band dropped anywhere in the zodiac', missing === 0 && rings === 2 * 720 * 4, `${missing} missing`);
  check('every ring is closed, finite, |lat| ≤ 90, inside ±540, net wrap < 180°, no chord off the poles', bad.length === 0, bad.slice(0, 10).join(' | '));
}

// ── 3. The spans against the ephemeris, 1900–2100 ────────────────────────────────────
section('3. The spans against the ephemeris, 1900–2100 (OUTSIDE AGREEMENT)');
// The real moment of a chart saved with no time lies within 12 hours of its 12:00
// placeholder, so a span is the most the body moves in 12 hours. Sampled every 6 hours
// across two centuries from Swiss, the largest change over each 12-hour window. Each span
// must cover its measured motion outright: the Moon's band, Mercury's band and Fortune's
// printed range (the Moon's motion less the Sun's: on a geodetic map its Ascendant is the
// place's, which doesn't move; for the sect the wheel takes, timeless.ts says why).
//
// One recorded exception, named rather than absorbed into a slack every check shares:
// Mercury's measured maximum is 1.1013°, 0.0013° past its 1.10° (timeless.ts, flagged for
// review). MERCURY_EXCESS_DEG allows exactly that, so a band narrowed below 1.10° still
// fails. The 13-hour day the clocks go back on is outside this 12-hour basis; timeless.ts
// records how far it reaches. (2026-10-02)
const MERCURY_EXCESS_DEG = 0.0015;
{
  const JD0 = 2415020.5; // 1900-01-01 00:00 UT
  const JD1 = 2488069.5; // 2100-01-01 00:00 UT
  const STEP = 0.25;
  const hist: { sun: number; moon: number; mercury: number }[] = [];
  let samples = 0;
  let missingSamples = 0;
  const max = { moon: 0, mercury: 0, fortune: 0 };
  const at = { moon: 0, mercury: 0, fortune: 0 };
  for (let jd = JD0; jd <= JD1; jd += STEP) {
    const s = bodyLonSpeed(jd, 'Sun');
    const m = bodyLonSpeed(jd, 'Moon');
    const me = bodyLonSpeed(jd, 'Mercury');
    if (!s || !m || !me) {
      missingSamples++;
      hist.length = 0;
      continue;
    }
    samples++;
    hist.push({ sun: s.lon * R2D, moon: m.lon * R2D, mercury: me.lon * R2D });
    if (hist.length > 3) hist.shift();
    if (hist.length < 3) continue;
    const a = hist[0];
    const b = hist[2];
    const dMoon = signedDiff(a.moon, b.moon);
    const dSun = signedDiff(a.sun, b.sun);
    const dMer = Math.abs(signedDiff(a.mercury, b.mercury));
    const dFor = Math.abs(dMoon - dSun);
    if (Math.abs(dMoon) > max.moon) [max.moon, at.moon] = [Math.abs(dMoon), jd - 0.5];
    if (dMer > max.mercury) [max.mercury, at.mercury] = [dMer, jd - 0.5];
    if (dFor > max.fortune) [max.fortune, at.fortune] = [dFor, jd - 0.5];
  }
  const moonW = TIMELESS_BAND_DEG.Moon!;
  const merW = TIMELESS_BAND_DEG.Mercury!;
  const forW = TIMELESS_RANGE_DEG.get('Fortune')!;
  note(`${samples} samples every 6 h (${missingSamples} missing)`);
  note(`Moon:    largest 12-hour motion ${max.moon.toFixed(4)}° (window from JD ${at.moon.toFixed(2)}); band ±${moonW.toFixed(3)}°`);
  note(`Mercury: largest 12-hour motion ${max.mercury.toFixed(4)}° (window from JD ${at.mercury.toFixed(2)}); band ±${merW.toFixed(3)}°`);
  note(`Fortune: largest 12-hour motion ${max.fortune.toFixed(4)}° (window from JD ${at.fortune.toFixed(2)}); printed range ±${forW.toFixed(3)}°`);
  check('not vacuous: two centuries sampled, none missing', samples > 290000 && missingSamples === 0, `${samples}`);
  check(`the Moon never moves more than its band in 12 hours (≤ ${moonW.toFixed(3)}°)`, max.moon > 0 && max.moon <= moonW, `${max.moon.toFixed(4)}°`);
  check(
    `Mercury never moves more than its band in 12 hours (≤ ${merW.toFixed(3)}° + the recorded ${MERCURY_EXCESS_DEG}°)`,
    max.mercury > 0 && max.mercury <= merW + MERCURY_EXCESS_DEG,
    `${max.mercury.toFixed(4)}°`,
  );
  check(`Fortune's printed range covers its 12-hour motion (≤ ${forW.toFixed(3)}°)`, max.fortune > 0 && max.fortune <= forW, `${max.fortune.toFixed(4)}°`);
  check('the printed ranges carry the Moon\'s band (Moon range = Moon band)', TIMELESS_RANGE_DEG.get('Moon') === moonW);
}

// ── 4. lonRange ─────────────────────────────────────────────────────────────────────
section('4. lonRange: truncated ends, own signs, float noise (OUTSIDE AGREEMENT + INTERNAL IDENTITY)');
{
  const deg = (d: number) => d * D2R;
  // The expected text, built from the app's own sign glyphs (each carries the text-
  // presentation selector), so a case reads as degrees and sign names.
  const S = ['Ari', 'Tau', 'Gem', 'Can', 'Leo', 'Vir', 'Lib', 'Sco', 'Sag', 'Cap', 'Aqu', 'Pis'];
  const want = (d0: number, s0: string, d1: number, s1: string) =>
    `${d0}°${SIGN_GLYPHS[S.indexOf(s0)]}–${d1}°${SIGN_GLYPHS[S.indexOf(s1)]}`;
  const cases: { what: string; lon: number; h: number; want: string; label: string }[] = [
    // 10°20' Taurus ± 7.7°: 2°38' Taurus to 18°02' Taurus — each end truncated.
    { what: 'ends truncated to the whole degree', lon: deg(30 + 10 + 20 / 60), h: 7.7, want: want(2, 'Tau', 18, 'Tau'), label: '2° Tau – 18° Tau' },
    // 25° Taurus ± 7.7°: 17°18' Taurus to 2°42' Gemini — each end in its own sign.
    { what: 'each end carries its own sign', lon: deg(55), h: 7.7, want: want(17, 'Tau', 2, 'Gem'), label: '17° Tau – 2° Gem' },
    // 1.9° Aries ± 7.7°: 24°12' Pisces to 9°36' Aries — across 0° Aries.
    { what: 'a span across 0° Aries', lon: deg(1.9), h: 7.7, want: want(24, 'Pis', 9, 'Ari'), label: '24° Pis – 9° Ari' },
    // Exactly 7.7° ± 7.7°: the low end is 0° Aries, never 29° Pisces.
    { what: '7.7° ± 7.7° starts at 0° Aries', lon: deg(7.7), h: 7.7, want: want(0, 'Ari', 15, 'Ari'), label: '0° Ari – 15° Ari' },
    // The same with the low end a float hair below 0° — the noise a round trip leaves.
    { what: 'a hair below 0° Aries (−1e-13 rad) is 0° Aries', lon: deg(7.7) - 1e-13, h: 7.7, want: want(0, 'Ari', 15, 'Ari'), label: '0° Ari – 15° Ari' },
    // A high end landing on 30° by addition (22.3 + 7.7): 0° of the next sign.
    { what: '22.3° + 7.7° ends at 0° Taurus', lon: deg(22.3), h: 7.7, want: want(14, 'Ari', 0, 'Tau'), label: '14° Ari – 0° Tau' },
    // A real distance below the boundary, past the 0.001″ snap: the noise rule only
    // absorbs noise — 0.02″ short of 0° Aries is still Pisces.
    { what: '0.02″ short of 0° Aries stays Pisces', lon: deg(7.7) - 1e-7, h: 7.7, want: want(29, 'Pis', 15, 'Ari'), label: '29° Pis – 15° Ari' },
    // Fortune's ±7.2° across 0° Libra.
    { what: 'Fortune ±7.2° across 0° Libra', lon: deg(182), h: 7.2, want: want(24, 'Vir', 9, 'Lib'), label: '24° Vir – 9° Lib' },
  ];
  // The noise case is only a test if the low end really is below zero before the snap.
  check('the noise case is real: its low end is negative before the snap', deg(7.7) - 1e-13 - deg(7.7) < 0);
  for (const c of cases) {
    const got = lonRangeText(c.lon, c.h);
    check(`${c.what}: ${c.label}`, got === c.want, got);
  }
  // Sweep: 200,000 random longitudes and both spans. Each end is truncZodiac's whole degree
  // at lon ∓ h, in 0–29, in its own sign, and the text is "D°G–D°G" with an en dash.
  const rand = rng(7);
  let n = 0;
  let bad = 0;
  let straddles = 0;
  const glyph = `(?:${SIGN_GLYPHS.join('|')})`;
  const shape = new RegExp(`^\\d{1,2}°${glyph}–\\d{1,2}°${glyph}$`, 'u');
  for (let i = 0; i < 200000; i++) {
    const lon = rand() * 2 * Math.PI;
    const h = i % 2 ? 7.7 : 7.2;
    const { lo, hi } = lonRange(lon, h);
    const zlo = truncZodiac(lon - h * D2R, 'min');
    const zhi = truncZodiac(lon + h * D2R, 'min');
    const text = lonRangeText(lon, h);
    const ok =
      lo.deg === zlo.deg &&
      lo.signIdx === zlo.signIdx &&
      hi.deg === zhi.deg &&
      hi.signIdx === zhi.signIdx &&
      [lo.deg, hi.deg].every((d) => Number.isInteger(d) && d >= 0 && d <= 29) &&
      shape.test(text);
    if (lo.signIdx !== hi.signIdx) straddles++;
    n++;
    if (!ok) bad++;
  }
  check('sweep: every end is truncZodiac\'s degree in its own sign, 0–29, text "D°G–D°G"', bad === 0 && n === 200000, `${bad} bad of ${n}; ${straddles} straddle a boundary`);
}

// ── 5. The generator's contract ─────────────────────────────────────────────────────
section("5. The generator's contract: which lines get a band (INTERNAL IDENTITY)");
{
  // The tracer's default is untouched by the new parameter: the drawn lines' ±85° clip.
  let traces = 0;
  let traceBad = 0;
  let subseqBad = 0;
  for (const lonDeg of [0, 1, 2, 30, 90, 120, 179, 181, 270, 359]) {
    const p = bodyAt('Moon', lonDeg);
    for (const side of ['ASC', 'DSC'] as const) {
      const def = traceHorizonCoords(p, ML, side);
      const at85 = traceHorizonCoords(p, ML, side, 85);
      traces++;
      if (JSON.stringify(def) !== JSON.stringify(at85)) traceBad++;
      // And the full trace, clipped back to ±85°, is the drawn line vertex for vertex.
      const full = traceHorizonCoords(p, ML, side, 90)
        .filter(([, y]) => Math.abs(y) <= 85)
        .map(([x, y]) => [normLng(x), y]);
      const drawn = def.map(([x, y]) => [normLng(x), y]);
      if (JSON.stringify(full) !== JSON.stringify(drawn)) subseqBad++;
    }
  }
  check('traceHorizonCoords with no latLimit is the ±85° trace, byte for byte', traceBad === 0 && traces > 0, `${traceBad} of ${traces}`);
  check('the ±90° trace clipped to ±85° is the drawn trace, vertex for vertex', subseqBad === 0 && traces > 0, `${subseqBad} of ${traces}`);

  // Which lines get bands: the spans' bodies' four angle lines, untagged, once each, in the
  // line's own colour.
  const moon = bodyAt('Moon', 123.4);
  const sun = bodyAt('Sun', 200);
  const mer = bodyAt('Mercury', 140);
  const lines = generateLines([moon, sun, mer], ML);
  const recoloured: FeatureCollection<LineString, LineProps> = {
    type: 'FeatureCollection',
    features: lines.features.map((f) => ({
      ...f,
      properties: { ...f.properties, color: f.properties.planet === 'Moon' ? '#123456' : f.properties.color },
    })),
  };
  const fc = generateUncertaintyBands(recoloured, [moon, sun, mer], TIMELESS_BAND_DEG, ML, EPS);
  const keys = fc.features.map((f) => `${f.properties.planet}:${f.properties.lineType}`).sort();
  check(
    'bands for the Moon and Mercury on MC, IC, ASC and DSC only — no Sun, no Vertex axis',
    JSON.stringify(keys) ===
      JSON.stringify(['Mercury:ASC', 'Mercury:DSC', 'Mercury:IC', 'Mercury:MC', 'Moon:ASC', 'Moon:DSC', 'Moon:IC', 'Moon:MC']),
    keys.join(','),
  );
  check(
    "each band is the line's own colour at the band opacity",
    fc.features.every(
      (f) =>
        f.properties.opacity === UNCERTAINTY_BAND_OPACITY &&
        f.properties.color === (f.properties.planet === 'Moon' ? '#123456' : PLANET_COLORS[f.properties.planet]),
    ),
  );
  // A line the reader filtered away takes its band with it; a duplicate makes no second band.
  const noMoonAsc: FeatureCollection<LineString, LineProps> = {
    type: 'FeatureCollection',
    features: [
      ...lines.features.filter((f) => !(f.properties.planet === 'Moon' && f.properties.lineType === 'ASC')),
      ...lines.features.filter((f) => f.properties.planet === 'Moon' && f.properties.lineType === 'MC'),
    ],
  };
  const fc2 = generateUncertaintyBands(noMoonAsc, [moon, sun, mer], TIMELESS_BAND_DEG, ML, EPS);
  const moonKeys = fc2.features.filter((f) => f.properties.planet === 'Moon').map((f) => f.properties.lineType).sort();
  check('a filtered-out line has no band, and a repeated line one band', JSON.stringify(moonKeys) === JSON.stringify(['DSC', 'IC', 'MC']), moonKeys.join(','));
  // Another chart's line (an overlay's, tagged) gets none.
  const tagged: FeatureCollection<LineString, LineProps> = {
    type: 'FeatureCollection',
    features: lines.features.map((f) => ({ ...f, properties: { ...f.properties, tag: 'Tr' } })),
  };
  check('a tagged (overlay) line gets no band', generateUncertaintyBands(tagged, [moon, mer], TIMELESS_BAND_DEG, ML, EPS).features.length === 0);

  // The line sits inside its own band: every vertex of the drawn MC, IC, ASC and DSC lines
  // (two independent constructions — the line generator and the band) is inside the band,
  // but where it touches the ring at a turning point.
  let verts = 0;
  let outside = 0;
  let touching = 0;
  const outs: string[] = [];
  for (const body of ['Moon', 'Mercury'] as const) {
    for (const lonDeg of CASE_DEGS) {
      const p = bodyAt(body, lonDeg);
      const drawn = generateLines([p], ML);
      const bands = generateUncertaintyBands(drawn, [p], TIMELESS_BAND_DEG, ML, EPS);
      for (const f of drawn.features as Feature<LineString, LineProps>[]) {
        const b = bands.features.find((x) => x.properties.lineType === f.properties.lineType);
        if (!b) continue;
        const ring = b.geometry.coordinates[0];
        for (const [lng, lat] of f.geometry.coordinates) {
          verts++;
          if (insideRow(rowCrossings(ring, lat), lng)) continue;
          if (distToRing(ring, lng, lat) < EDGE_TOL) touching++;
          else {
            outside++;
            if (outs.length < 6) outs.push(`${body} ${lonDeg}° ${f.properties.lineType} at ${lat.toFixed(2)},${lng.toFixed(2)}`);
          }
        }
      }
    }
  }
  note(`${verts} line vertices; ${touching} on the ring (a turning point the band closes on)`);
  check('every vertex of every banded line lies inside its band', outside === 0 && verts > 0, outs.join(' | '));
}

// ── 6. App's sky families read one gate ─────────────────────────────────────────────
section("6. App's sky families read one gate (SOURCE TRIPWIRE)");
// A timeless chart draws its lines on a geodetic map, so nothing upstream empties the
// families that read the sky's turning any more: parans, zenith stamps and the catalog's
// zenith coins, the fixed stars' lines and parans, the ecliptic. Each is kept off by a gate
// in App.tsx, which no Node suite can import, so a deleted gate would pass every behaviour
// check here. This reads the source instead — a tripwire, not a behaviour test: the gate is
// one named value that holds whenever the birth time is unknown, and each of those memos
// reads it. (2026-10-02)
{
  const app = readFileSync('src/App.tsx', 'utf8').replace(/\r\n/g, '\n');
  // A declaration's text, from `const NAME =` to the next line indented at most as deep as
  // its own (the memo's closing line, or the next statement).
  const decl = (name: string): string | null => {
    const i = app.indexOf(`const ${name} = `);
    if (i < 0) return null;
    const indent = i - app.lastIndexOf('\n', i) - 1;
    const end = app.slice(i).search(new RegExp(`\\n {0,${indent}}\\S`));
    return end < 0 ? null : app.slice(i, i + end);
  };
  const gate = decl('skyFamiliesOff');
  check('skyFamiliesOff is declared, and holds whenever the birth time is unknown (reads noTime)', !!gate && /=\s*noTime\b/.test(gate), gate ?? 'not found');
  // …and on every geodetic map, timed or not: the sky hold (lib/skyHold) is the gate's other
  // half, so a deleted clause would publish parans and star lines into a plugin's complete
  // set on a geodetic map. (2026-10-05: the check above alone passed with it gone.)
  check('…and whenever the map is held (noTime || skyHeld, noTime first)', !!gate && /=\s*noTime\s*\|\|\s*skyHeld\s*;/.test(gate), gate ?? 'not found');
  // Since the Custom theme (2026-10-06) three of the families are two memos each: the
  // geometry (`*Geom`, which generates — and so is where the gate belongs) and an ink step
  // after it that only recolours. The gate is asserted on the geometry; the second check
  // below holds each ink step to reading its own gated geometry, so the gate still covers
  // what is drawn and what a plugin's complete set carries.
  const families = ['allParans', 'allZenith', 'eclipticLine', 'starLinesGeom', 'starParansGeom', 'minorZenithGeom', 'natalStarLines'];
  // The body without its dependency list, which names the gate whether the body reads it or not.
  const bodyOf = (n: string) => decl(n)?.replace(/^\s*\[[^\n]*\],?[ \t]*$/gm, '') ?? null;
  const reads = (n: string) => !!bodyOf(n)?.includes('skyFamiliesOff');
  const ungated = families.filter((n) => !reads(n));
  check(`each sky family reads it: ${families.join(', ')}`, ungated.length === 0, `not gated: ${ungated.join(', ')}`);
  const INKED: [inked: string, geom: string][] = [
    ['starLines', 'starLinesGeom'],
    ['starParans', 'starParansGeom'],
    ['minorZenith', 'minorZenithGeom'],
  ];
  const strays = INKED.filter(([inked, geom]) => {
    const b = bodyOf(inked);
    // Reads its gated geometry, and generates nothing of its own.
    return !b || !new RegExp(`\\b${geom}\\b`).test(b) || /\bgenerate[A-Z]\w*\(/.test(b);
  });
  check(`…and each inked family only recolours its gated geometry: ${INKED.map(([a, b]) => `${a} ← ${b}`).join(', ')}`,
    strays.length === 0, `not reading its geometry, or generating: ${strays.map(([a]) => a).join(', ')}`);
}

// ── 7. App's sky hold: what it masks, and what it never writes ───────────────────────
section("7. App's sky hold: masked, never written (SOURCE TRIPWIRE)");
// On a geodetic map everything that reads the sky's turning is HELD (Lina's instruction of
// 2 Oct 2026, §2; lib/skyHold): not drawn, its control greyed with the reason, and the
// reader's choice kept for Celestial. In App that is CLAUDE.md rule 2 many times over — a
// preference, a derived value that masks it, and persistence that writes the preference.
// None of it can be reached from Node, and the failure each guard prevents is quiet: a
// family drawn on a geodetic map, or a choice overwritten and missed only in the next
// session. So the shape is read here, as §6 reads the gate. (2026-10-05)
{
  const app = readFileSync('src/App.tsx', 'utf8').replace(/\r\n/g, '\n');
  const decl = (name: string): string | null => {
    const m = new RegExp(`const ${name}(?::[^=\\n]+)? =\\s`).exec(app);
    if (!m) return null;
    const i = m.index;
    const indent = i - app.lastIndexOf('\n', i) - 1;
    const end = app.slice(i).search(new RegExp(`\\n {0,${indent}}\\S`));
    return end < 0 ? null : app.slice(i, i + end);
  };
  // A declaration's body without its dependency lists (which name a value read or not).
  const body = (name: string) => decl(name)?.replace(/^\s*\[[^\n]*\],?[ \t]*$/gm, '').replace(/\}, \[[^\]]*\]\);?$/m, '') ?? null;
  const shown = (s: string | null) => (s ?? 'not found').replace(/\s+/g, ' ').slice(0, 140);

  const held = decl('skyHeld');
  check('skyHeld reads the DERIVED line system (skyHeldFor(lineSystem), never the preference)', !!held && /=\s*skyHeldFor\(\s*lineSystem\s*\)\s*;/.test(held), shown(held));

  // The masked families: each effective flag, the local-space data, the night-shade wash.
  const masks: [string, RegExp][] = [
    ['effShowParans', /&&\s*!skyHeld\s*;/],
    ['effShowStarLines', /&&\s*!skyHeld\s*;/],
    ['effShowZenith', /&&\s*!skyHeld\s*;/],
    ['lsActive', /=\s*showLocalSpace\s*&&\s*!skyHeld\s*;/],
    ['lineOpts', /\{\s*vertex:\s*!skyHeld\s*\}/],
  ];
  const unmasked = masks.filter(([n, re]) => !re.test(decl(n) ?? ''));
  check(`each held flag masks on skyHeld: ${masks.map(([n]) => n).join(', ')}`, unmasked.length === 0, unmasked.map(([n]) => `${n}: ${shown(decl(n))}`).join(' | '));
  const dataGated = ['allLocalSpace', 'natalLocalSpaceCoords', 'relocatedLocalSpaceCoords', 'nightShade'];
  const dataOpen = dataGated.filter((n) => !/\bskyHeld\b/.test(body(n) ?? ''));
  check(`each held family's data reads skyHeld in its body: ${dataGated.join(', ')}`, dataOpen.length === 0, `not gated: ${dataOpen.join(', ')}`);

  // The Vertex axis: masked from the drawn filter, the stored filter to the Sidebar alone,
  // and never generated — every planet, aspect and midpoint generator call takes lineOpts.
  const vlt = body('visibleLineTypes');
  check(
    'visibleLineTypes masks VX/AVX from visibleLineTypesPref while held',
    !!vlt && /skyHeld/.test(vlt) && /visibleLineTypesPref/.test(vlt) && /'VX'/.test(vlt) && /'AVX'/.test(vlt),
    shown(vlt),
  );
  const prefProps = app.match(/visibleLineTypes=\{visibleLineTypesPref\}/g)?.length ?? 0;
  check('only one control reads the stored filter (the Sidebar: visibleLineTypes={visibleLineTypesPref})', prefProps === 1, `${prefProps}`);
  const calls: string[] = [];
  for (const m of app.matchAll(/\b(generateLines|generateAspectLines|generateMidpointLines)\(/g)) {
    let depth = 0;
    let j = m.index! + m[0].length - 1;
    for (; j < app.length; j++) {
      if (app[j] === '(') depth++;
      else if (app[j] === ')' && --depth === 0) break;
    }
    calls.push(app.slice(m.index!, j + 1));
  }
  const noOpts = calls.filter((c) => !/\blineOpts\s*\)$/.test(c));
  check(
    `every generator call passes lineOpts last (${calls.length} calls)`,
    calls.length >= 12 && noOpts.length === 0,
    noOpts.map((c) => shown(c)).join(' | '),
  );

  // The openers refuse OPENING while held (closing is never held), through the ref a
  // same-gesture line-system move has already written.
  const openers = ['setShowLocalSpaceSafe', 'setShowSkyTimesSafe'];
  const leaky = openers.filter((n) => !/if\s*\(\s*v\s*&&\s*skyHeldRef\.current\s*\)\s*return;/.test(decl(n) ?? ''));
  check(`the view openers refuse opening while held: ${openers.join(', ')}`, leaky.length === 0, leaky.join(', '));
  check(
    'a held needsSiderealTime tool renders the host’s held card, never its own render()',
    /ext\.needsSiderealTime && skyHeld \? \(\s*<HeldHud\b/.test(app),
  );

  // Masked overlays and angle frames read the derived line system…
  const om = decl('overlayMode');
  check(
    'the effective overlay masks through overlayBlockedFor(current, lineSystem) and the view lock',
    !!om && /overlayBlockedFor\(\s*current\s*,\s*lineSystem\s*\)\(\s*overlayModePref\s*\)/.test(om) && /viewParked\s*&&\s*VIEW_LOCK_PARKED_OVERLAYS\.has\(\s*overlayModePref\s*\)/.test(om),
    shown(om),
  );
  const frames = ['effTransitFrame', 'effProgAngleFrame'];
  const frameOpen = frames.filter((n) => !/lineSystem === 'geodetic'/.test(decl(n) ?? ''));
  check(`the angle frames hold at Natal on a geodetic map: ${frames.join(', ')}`, frameOpen.length === 0, frameOpen.join(', '));
  // …and persistence writes the PREFERENCE, never the masked value — the line CLAUDE.md
  // calls the easiest to get wrong, visible only in the next session.
  const persisted: [string, string, string][] = [
    ['saveOverlayMode', 'overlayModePref', 'overlayMode'],
    ['saveTransitFrame', 'transitFrame', 'effTransitFrame'],
    ['saveProgAngleFrame', 'progAngleFrame', 'effProgAngleFrame'],
  ];
  const wrong = persisted.filter(
    ([fn, pref, eff]) => !app.includes(`${fn}(${pref})`) || app.includes(`${fn}(${eff})`),
  );
  check(
    `persistence writes the preferences: ${persisted.map(([fn, pref]) => `${fn}(${pref})`).join(', ')}`,
    wrong.length === 0,
    wrong.map(([fn]) => fn).join(', '),
  );
}

console.log(`\n${failures === 0 ? 'verify-geodetic-chart: ALL PASS' : `verify-geodetic-chart: ${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
