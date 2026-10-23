// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies what a geodetic map does with a chart that has NO birth time, through the real
// modules (run via the harness: `npm run verify:geodetic-chart`): the uncertainty bands
// around the ranged bodies' lines and their aspect and midpoint lines (uncertaintyBands.ts),
// the birth-date motion the bands and the printed ranges are read from (timeless.ts), the
// range formatter (format.ts lonRange), and the horizon tracer's latitude limit the bands
// lean on (lines.ts traceHorizonCoords).
//
// Written 2026-10-02 with the timeless chart on geodetic maps. A geodetic map doesn't turn
// with the sky, so a chart with no birth time draws its lines there, from its 12:00
// placeholder — and a ranged body's line can be anywhere in a band around that. The houses a
// geodetic chart is drawn in are verify-geodetic §6's (the frame is the place's, with or
// without a birth time), so they are not repeated here.
//
// Rewritten 2026-10-22 for Lina's one range rule (timeless.ts): the fixed spans of 2 Oct (the
// Moon's ±7.7°, Mercury's ±1.11°) are gone. A body is RANGED when its motion over the birth
// date reaches 0.9°, and a band runs from `lo` to `hi` about its line's noon degree — inside the
// range, not necessarily its middle. The geometry sections (§1, §2, §5, §8) read bands made from
// motion FIXTURES, ranges chosen here with asymmetric ones among them, because a band's shape
// depends on its range and not on where the range came from; §3 holds the ranges the app
// actually reads to the ephemeris, and §10 builds a real chart's set from them.
//
//   1. Band membership against the place readout          INTERNAL IDENTITY (two parts agree)
//      (+ aspect and midpoint bands about their vlon, 2026-10-20; drawn again since 22 Oct)
//   2. Ring sanity across the whole zodiac                 INTERNAL IDENTITY
//   3. The range rule against the ephemeris, 1900–2100     OUTSIDE AGREEMENT (2026-10-22)
//   4. lonRange: offsets, truncated ends, own signs        OUTSIDE AGREEMENT (cases) + INTERNAL IDENTITY (sweep)
//   5. The generator's contract: which lines get a band    INTERNAL IDENTITY (+ the line inside its band)
//      (+ the stamp on the line, 2026-10-20; the band is   (+ TWO PARTS AGREE: the stamp against the
//       the line's sweep, and one key per line, 22 Oct)      regenerated lines)
//   6. App's sky families read one gate                    SOURCE TRIPWIRE (2026-10-02)
//   7. App's sky hold: masked, never written               SOURCE TRIPWIRE (2026-10-05)
//   8. The orb corridor round a band                       INTERNAL IDENTITY (two parts agree) (2026-10-20)
//   9. App's one tilt: declared once, read everywhere      SOURCE TRIPWIRE (2026-10-20)
//  10. A document's line set in its own system             INTERNAL IDENTITY + OUTSIDE AGREEMENT (2026-10-20)
//  11. App's line set goes through that builder            SOURCE TRIPWIRE (2026-10-20)
//  12. No chart: every geodetic surface at J2000            TWO PARTS AGREE + SOURCE TRIPWIRE (2026-10-20)
//
// The kinds, as in verify-geodetic (CLAUDE.md, "Prefer agreement between two parts"):
//   OUTSIDE AGREEMENT — the code against an independent reference (Swiss, the display rule,
//                       the figures Lina's rule was set by, the UK's clock changes).
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
import {
  RANGE_BODIES,
  RANGE_MIN_DEG,
  birthDateBounds,
  birthDateMotion,
  birthDateSampleJds,
  isRanged,
  midpointRange,
  type BirthDateMotion,
  type BodyRange,
} from '../src/lib/astro/timeless';
import {
  UNCERTAINTY_BAND_OPACITY,
  bandCoverage,
  bandCovers,
  bandEdges,
  bandFor,
  bandKeyOf,
  bandOutline,
  bandPolygon,
  bandRangeText,
  distToPolylineKm,
  generateUncertaintyBands,
  stampBands,
  type BandAngle,
  type BandedLineProps,
  type LineBand,
  type UncertaintyBandProps,
} from '../src/lib/astro/uncertaintyBands';
import { generateAspectLines, generateMidpointLines } from '../src/lib/astro/angleAspects';
import { bandedCorridor, corridorMarginKm, generateOrbBands } from '../src/lib/astro/orbBands';
import { buildNatalLineSet, type NatalLineInputs } from '../src/lib/astro/allLines';
import { getEclipticPositions, getPlanetPositions, gmstRadians, relocate } from '../src/lib/ephemeris';
import { EPS_J2000, geodeticFrame, projectOntoEcliptic } from '../src/lib/ephemeris';
import { geoReadoutAngles } from '../src/lib/astro/geodeticGrid';
import { buildSkyOverlay } from '../src/lib/astro/timeline';
import { skyLayerFor } from '../src/lib/skyAlone';
import { SEED_BIRTHS, type BirthData } from '../src/lib/birthData';
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
const norm360 = (d: number) => ((d % 360) + 360) % 360;
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

// ── Motion fixtures ──────────────────────────────────────────────────────────────
// A BirthDateMotion in the shape birthDateMotion hands one in: DAY_SAMPLES offsets per body
// across the date, the first midnight to the last, noon in the middle at 0 — each body moving
// steadily from `lo` through noon to `hi` — and its range, the lowest and highest of them.
const DAY_SAMPLES = 25;
function samplesOf(r: BodyRange): number[] {
  const mid = (DAY_SAMPLES - 1) / 2;
  return Array.from({ length: DAY_SAMPLES }, (_, k) => (k < mid ? (r.lo * (mid - k)) / mid : (r.hi * (k - mid)) / mid));
}
function motionOf(ranges: Partial<Record<PlanetName, BodyRange>>): BirthDateMotion {
  const samples = new Map<PlanetName, readonly number[]>();
  const out = new Map<PlanetName, BodyRange>();
  for (const [name, r] of Object.entries(ranges) as [PlanetName, BodyRange][]) {
    samples.set(name, samplesOf(r));
    out.set(name, { lo: r.lo, hi: r.hi });
  }
  return { samples, ranges: out };
}
// The geometry fixtures: four RANGED bodies — a wide, nearly symmetric range; a wide one with noon
// a quarter of the way in; a narrower one the other way round; and the narrowest a ranged body
// gets (the Sun's slowest day, 0.95°) — beside two that are not ranged (Mars at its fastest day,
// 0.79°, and Jupiter). Which body wears which range is only a label here: §3 holds the real ones.
type FixBody = 'Moon' | 'Venus' | 'Mercury' | 'Sun';
const FIX: Record<FixBody, BodyRange> = {
  Moon: { lo: -6.6, hi: 6.1 },
  Venus: { lo: -3, hi: 9 },
  Mercury: { lo: -1.9, hi: 0.4 },
  Sun: { lo: -0.47, hi: 0.49 },
};
const FIX_BODIES = Object.keys(FIX) as FixBody[];
const UNRANGED_FIX: Partial<Record<PlanetName, BodyRange>> = { Mars: { lo: -0.39, hi: 0.4 }, Jupiter: { lo: -0.1, hi: 0.12 } };
const MOTION = motionOf({ ...FIX, ...UNRANGED_FIX });
// The band's definition, read off a place's angle: is `angleDeg` within lo…hi of `centre`?
const inRange = (angleDeg: number, centre: number, r: BodyRange) => {
  const d = signedDiff(centre, angleDeg);
  return d >= r.lo && d <= r.hi;
};
// A midpoint's range by the rule's own words (Lina, 22 Oct 2026, §2.2): at each sample the
// midpoint has moved by half of each body's motion. Written out here from the fixture's samples
// for the readout to test against; §5 holds the library's midpointRange to the regenerated lines.
function pairRange(a: PlanetName, b: PlanetName | undefined): BodyRange {
  const sa = MOTION.samples.get(a);
  const sb = b ? MOTION.samples.get(b) : undefined;
  let lo = 0;
  let hi = 0;
  for (let k = 0; k < DAY_SAMPLES; k++) {
    const m = ((sa?.[k] ?? 0) + (sb?.[k] ?? 0)) / 2;
    lo = Math.min(lo, m);
    hi = Math.max(hi, m);
  }
  return { lo, hi };
}
function bandsFor(p: PlanetPosition): FeatureCollection<Polygon, UncertaintyBandProps> {
  return generateUncertaintyBands(generateLines([p], ML), [p], MOTION, ML, EPS);
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
// A place is in a body's MC band when its MC lies in the body's range about the body's degree —
// from λ + lo to λ + hi — in its IC band when its IC does, in its ASC band when its geodetic
// Ascendant does, in its DSC band when its Descendant does: that is the band's definition, read
// off geodeticAngles. The polygon is built from the horizon tracer and the turning-point loci,
// never from the readout. Over a 1.5° grid from 84°S to 84°N the two must agree at every place,
// but for places within EDGE_TOL of the ring, where the polygon's own vertex spacing decides —
// and only a handful of those in any one band.
//
// Tightened 2026-10-02 after a review moved band edges by hand and watched this pass: with
// the excuse at 0.25° and a global allowance of 0.2% of every comparison, an MC edge moved
// 0.1° and an ASC end moved 0.1° both went through. Measured, the shipped polygon's worst
// disagreement sits 0.004° from its ring, so the excuse is now 0.02°, counted band by band. The
// degrees include band ends ON the equinoxes (−lo, 180° − lo, 180° − hi and 360° − hi for each
// range) alongside the random ones; and the MC and IC edges get an exact test of their own below,
// which no grid could give them. Since the range rule (2026-10-22) the ranges are asymmetric, so
// a polygon that swapped its ends or centred its range on the noon line fails here too. The
// narrowest fixture (0.96°) is left to the exact strip test below and to §2: a strip narrower than
// the grid's spacing can fall between two grid meridians and hold no place at all.
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
const BASE_DEGS = [0, 2, 7, 90, 172, 178, 180, 185, 270, 355];
// A range's test degrees: the fixed ones, the four that put one of its ends on an equinox, and
// sixteen seeded ones.
function caseDegs(r: BodyRange, seed: number): number[] {
  const out = [...BASE_DEGS, norm360(-r.lo), norm360(180 - r.lo), norm360(180 - r.hi), norm360(360 - r.hi)];
  const rand = rng(seed);
  for (let i = 0; i < 16; i++) out.push(Number((rand() * 360).toFixed(4)));
  return out;
}
const CASE_DEGS = new Map<FixBody, number[]>(FIX_BODIES.map((b, i) => [b, caseDegs(FIX[b], 20261002 + i)]));
const GRID_BODIES: FixBody[] = ['Moon', 'Venus', 'Mercury'];
{
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
  let bandsWanted = 0;
  for (const body of GRID_BODIES) {
    const r = FIX[body];
    for (const lonDeg of CASE_DEGS.get(body)!) {
      const fc = bandsFor(bodyAt(body, lonDeg));
      for (const lt of BAND_TYPES) {
        bandsWanted++;
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
        LATS.forEach((lat, ri) => {
          const xs = rowCrossings(ring, lat);
          LNGS.forEach((lng, c) => {
            const byReadout = inRange(READ[ri][c][which], centre, r);
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
    `${bandsCompared} bands (${GRID_BODIES.map((b) => `${b} ${FIX[b].lo}…+${FIX[b].hi}°`).join(', ')}; ${CASE_DEGS.get('Moon')!.length} degrees each), ${LATS.length}×${LNGS.length} places per band`,
  );
  note(`${compared} place-band pairs agreed; ${insideTotal} of them inside a band; ${onRing} on a ring; ${nearEdge} disagreements within ${EDGE_TOL}° of one (farthest ${worstNearEdge.toFixed(4)}°); most in one band ${worstBandNear} (${worstBandAt || 'none'})`);
  check('every band is present: MC, IC, ASC and DSC for every range at every degree', bandsWanted > 0 && bandsCompared === bandsWanted, `${bandsCompared} of ${bandsWanted}`);
  check(`the polygon and the place readout agree at every place farther than ${EDGE_TOL}° from the ring`, misses.length === 0 && compared > 0, misses.slice(0, 12).join(' | '));
  check(`not vacuous: every band holds ≥ ${MIN_INSIDE} grid places by the readout`, thinBands === 0 && insideTotal > 0, `${thinBands} thin`);
  check(`no band has more than ${MAX_NEAR_EDGE_PER_BAND} near-edge disagreements`, worstBandNear <= MAX_NEAR_EDGE_PER_BAND, `${worstBandNear} in ${worstBandAt}`);
}

// The MC and IC edges, exactly. A strip band's edges are meridians, so its definition can be
// checked where a grid can't reach: every vertex off the poles is a place whose readout MC
// (for the IC band, its IC) is one of the band's end degrees λ + lo and λ + hi, to 1e-9°, both
// ends are used, and a place 1e-6° inside each edge is in the band by both the polygon and the
// readout, 1e-6° outside it out by both. Every fixture, the narrowest included, at 360 seeded
// centres nudged off the grid, at the chart's own obliquity.
{
  let strips = 0;
  let bad = 0;
  let worstOff = 0;
  const ex: string[] = [];
  const PROBE_LATS = [-80, -45, 0, 30, 66, 83];
  for (const body of FIX_BODIES) {
    const r = FIX[body];
    for (let k = 0; k < 360; k++) {
      const lonDeg = k + 0.31 + 0.0137 * (k % 7);
      const p = bodyAt(body, lonDeg);
      const drawn = generateLines([p], ML);
      const meridians: FeatureCollection<LineString, LineProps> = {
        type: 'FeatureCollection',
        features: drawn.features.filter((f) => f.properties.lineType === 'MC' || f.properties.lineType === 'IC'),
      };
      const fc = generateUncertaintyBands(meridians, [p], MOTION, ML, EPS);
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
        const ends = [lonDeg + r.lo, lonDeg + r.hi];
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
            const byReadout = inRange(readAngle(x, lat), lonDeg, r);
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
    'every MC and IC strip is exactly the meridians of λ + lo and λ + hi (to 1e-9°), with 1e-6° probes on the right side by both parts',
    strips === FIX_BODIES.length * 360 * 2 && bad === 0,
    `${bad} of ${strips}${ex.length ? ` — ${ex.join(' | ')}` : ''}`,
  );
}

// The two Appendix places on 0° Aries' own rising meridian (90°W): their Ascendant IS the
// band's noon degree, which lies inside every range (lo ≤ 0 ≤ hi), so they are inside the
// 0° Aries ASC band of every fixture — and the readout says AS 0° Aries there, inside the
// polar circle as outside it.
{
  const pts: [number, number][] = [[-90, 75], [-90, 40]];
  for (const body of FIX_BODIES) {
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
      `${body} (${FIX[body].lo}…+${FIX[body].hi}°) at 0° Aries: 75N 90W and 40N 90W inside its ASC band, reading AS 0°♈00'`,
      results.every((x) => x.inside && x.aries0),
      JSON.stringify(results),
    );
  }
}

// Aspect and midpoint lines (Lina, 20 Oct 2026, §12; drawn and banded again under the range rule,
// 22 Oct 2026, §2.2). An aspect line of a RANGED body is banded by that body's range about its own
// virtual point's degree (`vlon`, angleAspects.ts), as the angle the line really is (its `branch`);
// a midpoint line with a ranged body on EITHER side by the pair's own midpoint motion (pairRange
// above); no other aspect or midpoint line has a band. Each band polygon must agree with the place
// readout at THAT degree and range, place by place, as the bodies' bands do above. And bandCovers
// — the library's own reading of the same definition, which every listing tool asks — must give
// the readout's answer at every place too. Two position sets, the Moon and Venus ranged, Mars and
// Jupiter not, so both sides of the rule are counted; the Vertex axis (generated here, as on a
// celestial map) is never banded.
{
  let lines = 0;
  let bandedN = 0;
  let plainN = 0;
  let wrongBanded = 0;
  let compared = 0;
  let insideTotal = 0;
  let thin = 0;
  let nearEdge = 0;
  let worstBandNear = 0;
  let coverCompared = 0;
  let coverMiss = 0;
  const ruleMiss: string[] = [];
  const misses: string[] = [];
  const coverMisses: string[] = [];
  const RANGED1: ReadonlySet<string> = new Set(['Moon', 'Venus']);
  const isR = (n: PlanetName | undefined) => n !== undefined && RANGED1.has(n);
  for (const [moonDeg, otherDeg] of [[123.4, 200.7], [5.2, 270.9]]) {
    const ps = [bodyAt('Moon', moonDeg), bodyAt('Venus', otherDeg), bodyAt('Mars', otherDeg + 40), bodyAt('Jupiter', otherDeg + 95)];
    const fc = [
      ...stampBands(generateAspectLines(ps, ML, 'zodiaco', EPS), ps, MOTION, EPS).features,
      ...stampBands(generateMidpointLines(ps, ML, 'zodiaco', EPS), ps, MOTION, EPS).features,
    ];
    for (const f of fc) {
      lines++;
      const p = f.properties as BandedLineProps;
      const angle = p.kind === 'aspect' ? p.branch : p.lineType;
      const want = BAND_TYPES.includes(angle!) && (p.kind === 'aspect' ? isR(p.planet) : isR(p.planet) || isR(p.planetB));
      if (!!p.band !== want) {
        wrongBanded++;
        if (ruleMiss.length < 8) ruleMiss.push(`${p.kind} ${p.planet}${p.planetB ? `/${p.planetB}` : ''} ${angle}: banded ${!!p.band}, the rule says ${want}`);
      }
      if (!p.band) {
        plainN++;
        continue;
      }
      bandedN++;
      const band = p.band;
      const ring = bandPolygon(band, ML);
      if (!ring) {
        if (misses.length < 12) misses.push(`${p.kind} ${p.planet} ${band.angle}: no ring`);
        continue;
      }
      // What the rule says, from the fixture, not from the stamp: the body's range for an aspect
      // line, the pair's midpoint motion for a midpoint line — about the line's own vlon.
      const r = p.kind === 'aspect' ? MOTION.ranges.get(p.planet)! : pairRange(p.planet, p.planetB);
      const which = band.angle === 'ASC' ? 0 : band.angle === 'DSC' ? 1 : 2;
      const centre = band.angle === 'IC' ? p.vlon! + 180 : p.vlon!;
      let inside = 0;
      let bandNear = 0;
      LATS.forEach((lat, ri) => {
        const xs = rowCrossings(ring, lat);
        LNGS.forEach((lng, c) => {
          const byReadout = inRange(READ[ri][c][which], centre, r);
          if (byReadout) inside++;
          // bandCovers at every other place of every other row (it reads geodeticAngles itself).
          if (ri % 2 === 0 && c % 2 === 0) {
            coverCompared++;
            if (bandCovers(band, lat, lng) !== byReadout) {
              const d = signedDiff(centre, READ[ri][c][which]);
              // Exactly on an end, float noise decides: not counted.
              if (Math.min(Math.abs(d - r.lo), Math.abs(d - r.hi)) > 1e-9) {
                coverMiss++;
                if (coverMisses.length < 6) coverMisses.push(`${p.kind} ${p.planet} ${band.angle} at ${lat},${lng}: bandCovers ${!byReadout}, readout ${byReadout}`);
              }
            }
          }
          const byPolygon = insideRow(xs, lng);
          if (byReadout === byPolygon) {
            compared++;
            return;
          }
          const d = distToRing(ring, lng, lat);
          if (d < ON_RING) return;
          if (d < EDGE_TOL) {
            nearEdge++;
            bandNear++;
          } else if (misses.length < 12) {
            misses.push(`${p.kind} ${p.planet}${p.planetB ? `/${p.planetB}` : ''} ${band.angle} (vlon ${p.vlon!.toFixed(2)}°) at ${lat},${lng}: readout ${byReadout ? 'in' : 'out'}, polygon ${byPolygon ? 'in' : 'out'} (${d.toFixed(2)}° from the ring)`);
          } else misses.push('…');
        });
      });
      insideTotal += inside;
      if (inside < MIN_INSIDE) thin++;
      worstBandNear = Math.max(worstBandNear, bandNear);
    }
  }
  note(`${lines} aspect and midpoint lines: ${bandedN} banded, ${plainN} not; ${compared} place-band pairs agreed (${insideTotal} inside), ${nearEdge} near an edge; bandCovers asked at ${coverCompared}`);
  check(
    'aspect and midpoint lines are banded exactly where the rule says: a ranged body\'s aspect lines, a midpoint with a ranged body on either side, on the four angles',
    bandedN > 0 && plainN > 0 && wrongBanded === 0,
    `${wrongBanded} wrong of ${lines}${ruleMiss.length ? ` — ${ruleMiss.join(' | ')}` : ''}`,
  );
  check(
    `each aspect and midpoint band polygon agrees with the place readout about its own vlon, at its own range, farther than ${EDGE_TOL}° from the ring (≤ ${MAX_NEAR_EDGE_PER_BAND} near-edge per band, ≥ ${MIN_INSIDE} inside)`,
    bandedN > 0 && compared > 0 && thin === 0 && worstBandNear <= MAX_NEAR_EDGE_PER_BAND && misses.length === 0,
    misses.slice(0, 12).join(' | '),
  );
  check('bandCovers gives the readout\'s answer at every place it was asked', coverCompared > 0 && coverMiss === 0, `${coverMiss} of ${coverCompared}${coverMisses.length ? ` — ${coverMisses.join(' | ')}` : ''}`);
}

// ── 2. Ring sanity across the whole zodiac ──────────────────────────────────────────
section('2. Ring sanity across the whole zodiac (INTERNAL IDENTITY)');
// Every half degree for the two wide fixtures (one of them asymmetric), every degree for the
// two narrow ones, every band. A ring the generator dropped (wound round a pole, or a NaN) is a
// missing band, so the count is part of the check.
{
  let rings = 0;
  let missing = 0;
  let wanted = 0;
  const bad: string[] = [];
  let maxExtent = 0;
  const STEPS: [FixBody, number][] = [['Moon', 720], ['Venus', 720], ['Mercury', 360], ['Sun', 360]];
  for (const [body, n] of STEPS) {
    for (let k = 0; k < n; k++) {
      const lonDeg = (k * 360) / n;
      const fc = bandsFor(bodyAt(body, lonDeg));
      for (const lt of BAND_TYPES) {
        wanted++;
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
  note(`${rings} rings (${STEPS.map(([b, n]) => `${b} × ${n}`).join(', ')} degrees × 4 lines); widest spans ${maxExtent.toFixed(1)}° of longitude`);
  check('no band dropped anywhere in the zodiac', wanted === (720 * 2 + 360 * 2) * 4 && missing === 0 && rings === wanted, `${missing} missing of ${wanted}`);
  check('every ring is closed, finite, |lat| ≤ 90, inside ±540, net wrap < 180°, no chord off the poles', bad.length === 0, bad.slice(0, 10).join(' | '));
}

// ── 3. The range rule against the ephemeris, 1900–2100 ───────────────────────────────
section('3. The range rule against the ephemeris, 1900–2100 (OUTSIDE AGREEMENT)');
// Lina's rule (22 Oct 2026, §2.1): a body is RANGED when its motion over the birth date reaches
// 0.9°, a figure she set between the fastest day Mars ever has (0.79°) and the slowest the Sun
// ever has (0.95°) — so the Sun is always ranged, Mars never, and the Moon always.
//   (a) Those claims and her two figures, measured here from Swiss across two centuries: every
//       6 hours, over every 24-hour window (every civil day in every zone is one of them, to
//       within the 6-hour step, which moves neither figure in its second decimal), each window's
//       motion handed to the library's own isRanged.
//   (b) birthDateMotion against the ephemeris sampled independently — getEclipticPositions, not
//       the bodyLonSpeed it reads, every 20 minutes from the civil date's first midnight to its
//       last, computed here from the date and the offset rather than by birthDateBounds — on a
//       seeded spread of dates and offsets, and on a day Mercury stations, where the day's two
//       ends alone would understate the motion.
//   (c) The day's length: a clock-change day is 23 or 25 hours long on the zone's own clock
//       (the UK's changes of 2023, at 01:00 UTC), and a chart entered on a fixed offset, on local
//       mean time or on an unknown zone keeps its stored offset at both ends.
{
  const JD0 = 2415020.5; // 1900-01-01 00:00 UT
  const JD1 = 2488069.5; // 2100-01-01 00:00 UT
  const STEP = 0.25;
  const hist: number[][] = [];
  let samples = 0;
  let missingSamples = 0;
  let windows = 0;
  const min = { sun: Infinity, moon: Infinity };
  let marsMax = 0;
  const at = { sun: 0, moon: 0, mars: 0 };
  let sunUnranged = 0;
  let moonUnranged = 0;
  let marsRanged = 0;
  for (let jd = JD0; jd <= JD1; jd += STEP) {
    const s = bodyLonSpeed(jd, 'Sun');
    const m = bodyLonSpeed(jd, 'Moon');
    const ma = bodyLonSpeed(jd, 'Mars');
    if (!s || !m || !ma) {
      missingSamples++;
      hist.length = 0;
      continue;
    }
    samples++;
    hist.push([s.lon * R2D, m.lon * R2D, ma.lon * R2D]);
    if (hist.length > 5) hist.shift();
    if (hist.length < 5) continue;
    windows++;
    // The window's motion as offsets from its middle sample (its "noon"), lowest and highest.
    const range = (i: number): BodyRange => {
      const offs = hist.map((h) => signedDiff(hist[2][i], h[i]));
      return { lo: Math.min(0, ...offs), hi: Math.max(0, ...offs) };
    };
    const [rs, rm, rma] = [range(0), range(1), range(2)];
    const [ws, wm, wma] = [rs.hi - rs.lo, rm.hi - rm.lo, rma.hi - rma.lo];
    if (ws < min.sun) [min.sun, at.sun] = [ws, jd - 1];
    if (wm < min.moon) [min.moon, at.moon] = [wm, jd - 1];
    if (wma > marsMax) [marsMax, at.mars] = [wma, jd - 1];
    if (!isRanged(rs)) sunUnranged++;
    if (!isRanged(rm)) moonUnranged++;
    if (isRanged(rma)) marsRanged++;
  }
  note(`${samples} samples every 6 h (${missingSamples} missing), ${windows} 24-hour windows`);
  note(`Sun:  slowest day ${min.sun.toFixed(4)}° (from JD ${at.sun.toFixed(2)})`);
  note(`Moon: slowest day ${min.moon.toFixed(4)}° (from JD ${at.moon.toFixed(2)})`);
  note(`Mars: fastest day ${marsMax.toFixed(4)}° (from JD ${at.mars.toFixed(2)}); RANGE_MIN_DEG ${RANGE_MIN_DEG}°`);
  check('not vacuous: two centuries sampled, none missing', samples > 290000 && missingSamples === 0 && windows > 290000, `${samples}`);
  check('the rule\'s threshold is Lina\'s 0.9°', RANGE_MIN_DEG === 0.9, `${RANGE_MIN_DEG}`);
  check(
    'her figures, measured: the fastest Mars day is 0.79°, the slowest Sun day 0.95°, and 0.9° lies between them',
    marsMax.toFixed(2) === '0.79' && min.sun.toFixed(2) === '0.95' && marsMax < RANGE_MIN_DEG && RANGE_MIN_DEG < min.sun,
    `Mars ${marsMax.toFixed(4)}°, Sun ${min.sun.toFixed(4)}°`,
  );
  check('the Sun is ranged on every day (isRanged on each window)', windows > 0 && sunUnranged === 0, `${sunUnranged} unranged of ${windows}`);
  check('the Moon is ranged on every day', windows > 0 && moonUnranged === 0 && min.moon > 10, `${moonUnranged} unranged; slowest ${min.moon.toFixed(2)}°`);
  check('Mars is never ranged', windows > 0 && marsRanged === 0 && marsMax > 0.5, `${marsRanged} ranged of ${windows}`);
}

// (b) and (c): the library's day and the library's motion, against a day and a motion worked out
// here from the date, the offset and the ephemeris.
type ZonedBirth = BirthData & { tzIana?: string; tzManual?: boolean };
const jdOfMs = (ms: number) => ms / 86400000 + 2440587.5;
// Every RANGE body's longitude (degrees) at `jd`, through getEclipticPositions.
const eclAt = (jd: number) => new Map(getEclipticPositions(jd, 'mean').map((p) => [p.name, p.lon * R2D] as const));
// The ten bodies' ranges over [start, end] against their longitudes at `noon`, every `stepMin`.
function sweepDay(start: number, end: number, noon: number, stepMin = 20): Map<PlanetName, BodyRange> {
  const at0 = eclAt(noon);
  const out = new Map<PlanetName, BodyRange>();
  const n = Math.round(((end - start) * 1440) / stepMin);
  for (let k = 0; k <= n; k++) {
    const at = eclAt(start + ((end - start) * k) / n);
    for (const name of RANGE_BODIES) {
      const d = signedDiff(at0.get(name)!, at.get(name)!);
      const r = out.get(name) ?? { lo: 0, hi: 0 };
      out.set(name, { lo: Math.min(r.lo, d), hi: Math.max(r.hi, d) });
    }
  }
  return out;
}
const birth = (year: number, month: number, day: number, tzOffset: number, extra: Partial<ZonedBirth> = {}): ZonedBirth => ({
  name: 'verify',
  year,
  month,
  day,
  hour: 12,
  minute: 0,
  tzOffset,
  timeKnown: false,
  birthplace: { label: 'verify', lat: 51.5, lng: -0.13 },
  ...extra,
});
{
  check(
    'RANGE_BODIES is the Sun, the Moon and the eight planets',
    JSON.stringify([...RANGE_BODIES]) === JSON.stringify(['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']),
    RANGE_BODIES.join(', '),
  );
  // A day on which Mercury stations, found from the ephemeris (its speed changes sign between the
  // day's two midnights, UTC).
  let station: ZonedBirth | null = null;
  for (let d = 0; d < 366 && !station; d++) {
    const ms = Date.UTC(2024, 0, 1 + d);
    const a = bodyLonSpeed(jdOfMs(ms), 'Mercury');
    const b = bodyLonSpeed(jdOfMs(ms + 86400000), 'Mercury');
    if (a && b && Math.sign(a.speed) !== Math.sign(b.speed)) {
      const dt = new Date(ms);
      station = birth(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), 0);
    }
  }
  const cases: { what: string; chart: ZonedBirth; start: number; end: number }[] = [];
  const civil = (c: ZonedBirth) => jdOfMs(Date.UTC(c.year, c.month - 1, c.day)) - c.tzOffset / 24;
  const plain = (what: string, c: ZonedBirth) => cases.push({ what, chart: c, start: civil(c), end: civil(c) + 1 });
  plain('Jim Lewis, 1941-06-05, UTC−4', { ...SEED_BIRTHS[0], hour: 12, minute: 0, timeKnown: false });
  {
    const rand = rng(1900);
    const span = Date.UTC(2100, 0, 1) - Date.UTC(1900, 0, 2);
    for (let i = 0; i < 12; i++) {
      const dt = new Date(Date.UTC(1900, 0, 2) + Math.floor(rand() * span));
      const tz = Math.round((rand() * 26 - 12) * 4) / 4;
      plain(`${dt.toISOString().slice(0, 10)}, UTC${tz >= 0 ? '+' : ''}${tz}`, birth(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), tz));
    }
  }
  if (station) plain(`Mercury stations, ${station.year}-${station.month}-${station.day}, UTC`, station);
  // The UK's clocks went back at 01:00 UTC on 29 Oct 2023 and forward at 01:00 UTC on 26 Mar 2023.
  const BACK = birth(2023, 10, 29, 0, { tzIana: 'Europe/London' });
  const FWD = birth(2023, 3, 26, 1, { tzIana: 'Europe/London' });
  cases.push({ what: 'London, clocks back (25 h)', chart: BACK, start: jdOfMs(Date.UTC(2023, 9, 28, 23)), end: jdOfMs(Date.UTC(2023, 9, 30, 0)) });
  cases.push({ what: 'London, clocks forward (23 h)', chart: FWD, start: jdOfMs(Date.UTC(2023, 2, 26, 0)), end: jdOfMs(Date.UTC(2023, 2, 26, 23)) });
  // Kept at the stored offset: a fixed offset chosen by hand, London's local mean time (−0:01:15)
  // under the London zone, and a zone name nobody knows.
  plain('London on a fixed offset (tzManual), the clocks-back date', { ...BACK, tzManual: true });
  plain('London on local mean time, the clocks-back date', { ...BACK, tzOffset: -1.25 / 60 });
  plain('an unknown zone name, the clocks-back date', { ...BACK, tzIana: 'Nowhere/Atlantis' });

  let boundsBad = 0;
  let nBounds = 0;
  const boundsMiss: string[] = [];
  let worst = 0;
  let worstAt = '';
  let compared = 0;
  for (const c of cases) {
    const b = birthDateBounds(c.chart);
    const jds = birthDateSampleJds(c.chart);
    const hours = Math.round((c.end - c.start) * 24);
    nBounds++;
    const ok =
      Math.abs(b.start - c.start) * 86400 < 1e-3 &&
      Math.abs(b.end - c.end) * 86400 < 1e-3 &&
      Math.abs(b.noon - birthDataToJD(c.chart)) < 1e-12 &&
      jds.length === hours + 1 &&
      Math.abs(jds[0] - c.start) * 86400 < 1e-3 &&
      Math.abs(jds[jds.length - 1] - c.end) * 86400 < 1e-3;
    if (!ok) {
      boundsBad++;
      boundsMiss.push(`${c.what}: ${((b.start - c.start) * 24).toFixed(4)} h / ${((b.end - c.end) * 24).toFixed(4)} h off, ${jds.length} samples for ${hours} h`);
    }
    // The motion, against the ephemeris swept here across the same day, about the chart's noon.
    const mine = sweepDay(c.start, c.end, birthDataToJD(c.chart));
    const lib = birthDateMotion(c.chart, 'mean');
    for (const name of RANGE_BODIES) {
      const a = lib.ranges.get(name);
      const e = mine.get(name)!;
      compared++;
      const d = a ? Math.max(Math.abs(a.lo - e.lo), Math.abs(a.hi - e.hi)) : Infinity;
      if (d > worst) [worst, worstAt] = [d, `${c.what} ${name}: library ${a ? `${a.lo.toFixed(5)}…${a.hi.toFixed(5)}` : 'none'}, ephemeris ${e.lo.toFixed(5)}…${e.hi.toFixed(5)}`];
    }
  }
  check(
    'birthDateBounds: each day\'s two midnights where the date and the offset put them (25 h and 23 h across the UK\'s clock changes; 24 h on a stored offset), sampled hourly, ends included',
    nBounds === cases.length && nBounds >= 18 && boundsBad === 0,
    boundsMiss.join(' | ') || `${nBounds} days`,
  );
  check(
    'birthDateMotion: every body\'s range is the ephemeris\'s own lowest and highest across the day (within 1e-4°)',
    compared === cases.length * RANGE_BODIES.length && worst < 1e-4,
    `${compared} ranges; worst ${worst.toExponential(2)}° (${worstAt})`,
  );
  // The station: Mercury turns inside the day, so its range is wider than the distance between its
  // two midnights — the samples between, not the ends, decide it.
  if (!station) check('a 2024 day on which Mercury stations', false, 'none found');
  else {
    const b = birthDateBounds(station);
    const r = birthDateMotion(station, 'mean').ranges.get('Mercury')!;
    const ends = Math.abs(signedDiff(bodyLonSpeed(b.start, 'Mercury')!.lon * R2D, bodyLonSpeed(b.end, 'Mercury')!.lon * R2D));
    check(
      `a station inside the day is covered: Mercury's range on ${station.year}-${station.month}-${station.day} is wider than its two midnights apart`,
      r.hi - r.lo > ends + 1e-6,
      `range ${(r.hi - r.lo).toFixed(5)}°, ends ${ends.toFixed(5)}° apart`,
    );
  }
  // The 25-hour day takes care of itself: one more hour of the Moon's motion than the day before.
  {
    const back = birthDateMotion(BACK, 'mean').ranges.get('Moon')!;
    const prev = birthDateMotion(birth(2023, 10, 28, 1, { tzIana: 'Europe/London' }), 'mean').ranges.get('Moon')!;
    const len = birthDateSampleJds(BACK).length;
    check(
      'the clocks-back day: 26 samples, and the Moon\'s range is about 25/24 of the day before\'s',
      len === 26 && (back.hi - back.lo) / (prev.hi - prev.lo) > 1.02 && (back.hi - back.lo) / (prev.hi - prev.lo) < 1.06,
      `${len} samples; ${(back.hi - back.lo).toFixed(3)}° against ${(prev.hi - prev.lo).toFixed(3)}°`,
    );
  }
}

// ── 4. lonRange ─────────────────────────────────────────────────────────────────────
section('4. lonRange: offsets, truncated ends, own signs, float noise (OUTSIDE AGREEMENT + INTERNAL IDENTITY)');
// Since the range rule (2026-10-22) a range is carried as OFFSETS from the noon degree — lo ≤ 0
// ≤ hi, and not necessarily equal — and each end is printed truncated to its whole degree in its
// own sign.
{
  const deg = (d: number) => d * D2R;
  // The expected text, built from the app's own sign glyphs (each carries the text-
  // presentation selector), so a case reads as degrees and sign names.
  const S = ['Ari', 'Tau', 'Gem', 'Can', 'Leo', 'Vir', 'Lib', 'Sco', 'Sag', 'Cap', 'Aqu', 'Pis'];
  const want = (d0: number, s0: string, d1: number, s1: string) =>
    `${d0}°${SIGN_GLYPHS[S.indexOf(s0)]}–${d1}°${SIGN_GLYPHS[S.indexOf(s1)]}`;
  const sym = (h: number) => ({ lo: -h, hi: h });
  const cases: { what: string; lon: number; r: BodyRange; want: string; label: string }[] = [
    // 10°20' Taurus, 7.7° either way: 2°38' Taurus to 18°02' Taurus — each end truncated.
    { what: 'ends truncated to the whole degree', lon: deg(30 + 10 + 20 / 60), r: sym(7.7), want: want(2, 'Tau', 18, 'Tau'), label: '2° Tau – 18° Tau' },
    // The same degree, 3° back and 9° on: 7°20' Taurus to 19°20' Taurus.
    { what: 'an asymmetric range: 3° back, 9° on', lon: deg(30 + 10 + 20 / 60), r: { lo: -3, hi: 9 }, want: want(7, 'Tau', 19, 'Tau'), label: '7° Tau – 19° Tau' },
    // 25° Taurus, 7.7° either way: 17°18' Taurus to 2°42' Gemini — each end in its own sign.
    { what: 'each end carries its own sign', lon: deg(55), r: sym(7.7), want: want(17, 'Tau', 2, 'Gem'), label: '17° Tau – 2° Gem' },
    // 25° Taurus, 1° back and 8° on: 24° Taurus to 3° Gemini.
    { what: 'asymmetric, across a sign boundary', lon: deg(55), r: { lo: -1, hi: 8 }, want: want(24, 'Tau', 3, 'Gem'), label: '24° Tau – 3° Gem' },
    // 1.9° Aries, 7.7° either way: 24°12' Pisces to 9°36' Aries — across 0° Aries.
    { what: 'a range across 0° Aries', lon: deg(1.9), r: sym(7.7), want: want(24, 'Pis', 9, 'Ari'), label: '24° Pis – 9° Ari' },
    // 1.9° Aries, 2.4° back and 0.3° on: 29°30' Pisces to 2°12' Aries.
    { what: 'asymmetric, across 0° Aries', lon: deg(1.9), r: { lo: -2.4, hi: 0.3 }, want: want(29, 'Pis', 2, 'Ari'), label: '29° Pis – 2° Ari' },
    // Exactly 7.7°, 7.7° back: the low end is 0° Aries, never 29° Pisces.
    { what: '7.7° less 7.7° starts at 0° Aries', lon: deg(7.7), r: sym(7.7), want: want(0, 'Ari', 15, 'Ari'), label: '0° Ari – 15° Ari' },
    // The same with the low end a float hair below 0° — the noise a round trip leaves.
    { what: 'a hair below 0° Aries (−1e-13 rad) is 0° Aries', lon: deg(7.7) - 1e-13, r: sym(7.7), want: want(0, 'Ari', 15, 'Ari'), label: '0° Ari – 15° Ari' },
    // A high end landing on 30° by addition (22.3 + 7.7): 0° of the next sign.
    { what: '22.3° + 7.7° ends at 0° Taurus', lon: deg(22.3), r: sym(7.7), want: want(14, 'Ari', 0, 'Tau'), label: '14° Ari – 0° Tau' },
    // A real distance below the boundary, past the 0.001″ snap: the noise rule only
    // absorbs noise — 0.02″ short of 0° Aries is still Pisces.
    { what: '0.02″ short of 0° Aries stays Pisces', lon: deg(7.7) - 1e-7, r: sym(7.7), want: want(29, 'Pis', 15, 'Ari'), label: '29° Pis – 15° Ari' },
    // 2° Libra, 8° back and 1.5° on: 24° Virgo to 3°30' Libra — across 0° Libra.
    { what: 'asymmetric, across 0° Libra', lon: deg(182), r: { lo: -8, hi: 1.5 }, want: want(24, 'Vir', 3, 'Lib'), label: '24° Vir – 3° Lib' },
    // Noon at an end of the range (a body at the day's extreme at noon): one end IS the noon degree.
    { what: 'noon at the low end (lo = 0)', lon: deg(22.3), r: { lo: 0, hi: 5 }, want: want(22, 'Ari', 27, 'Ari'), label: '22° Ari – 27° Ari' },
    { what: 'noon at the high end (hi = 0)', lon: deg(22.3), r: { lo: -5, hi: 0 }, want: want(17, 'Ari', 22, 'Ari'), label: '17° Ari – 22° Ari' },
  ];
  // The noise case is only a test if the low end really is below zero before the snap.
  check('the noise case is real: its low end is negative before the snap', deg(7.7) - 1e-13 - deg(7.7) < 0);
  for (const c of cases) {
    const got = lonRangeText(c.lon, c.r);
    check(`${c.what}: ${c.label}`, got === c.want, got);
  }
  // Sweep: 200,000 random longitudes and random ranges, lo in −10…0 and hi in 0…10 apiece. Each
  // end is truncZodiac's whole degree at lon + lo (lon + hi), in 0–29, in its own sign; the text is
  // "D°G–D°G" with an en dash; and the two printed ends lie the range's width apart, to within the
  // degree truncation can take off either end.
  const rand = rng(7);
  let n = 0;
  let bad = 0;
  let straddles = 0;
  let asym = 0;
  const glyph = `(?:${SIGN_GLYPHS.join('|')})`;
  const shape = new RegExp(`^\\d{1,2}°${glyph}–\\d{1,2}°${glyph}$`, 'u');
  for (let i = 0; i < 200000; i++) {
    const lon = rand() * 2 * Math.PI;
    const r = { lo: -10 * rand(), hi: 10 * rand() };
    const { lo, hi } = lonRange(lon, r);
    const zlo = truncZodiac(lon + r.lo * D2R, 'min');
    const zhi = truncZodiac(lon + r.hi * D2R, 'min');
    const text = lonRangeText(lon, r);
    const fwd = norm360(hi.signIdx * 30 + hi.deg - (lo.signIdx * 30 + lo.deg));
    const ok =
      lo.deg === zlo.deg &&
      lo.signIdx === zlo.signIdx &&
      hi.deg === zhi.deg &&
      hi.signIdx === zhi.signIdx &&
      [lo.deg, hi.deg].every((d) => Number.isInteger(d) && d >= 0 && d <= 29) &&
      Math.abs(fwd - (r.hi - r.lo)) < 1 + 1e-9 &&
      shape.test(text);
    if (lo.signIdx !== hi.signIdx) straddles++;
    if (Math.abs(r.hi + r.lo) > 1) asym++;
    n++;
    if (!ok) bad++;
  }
  check(
    'sweep: every end is truncZodiac\'s degree at its own offset, in its own sign, 0–29, the ends a range apart, text "D°G–D°G"',
    bad === 0 && n === 200000 && straddles > 0 && asym > n / 2,
    `${bad} bad of ${n}; ${straddles} straddle a boundary; ${asym} asymmetric by more than a degree`,
  );
}

// ── 5. The generator's contract ─────────────────────────────────────────────────────
section("5. The generator's contract: which lines get a band (INTERNAL IDENTITY)");
// The fixture chart for this section: four ranged bodies (FIX) and two that are not, placed so no
// pair is near opposition (where a pair's near midpoint swaps for its far one).
const PS5 = [bodyAt('Sun', 200), bodyAt('Moon', 123.4), bodyAt('Mercury', 140), bodyAt('Venus', 250), bodyAt('Mars', 30), bodyAt('Jupiter', 330)];
const RANGED5 = ['Mercury', 'Moon', 'Sun', 'Venus'];
const ownKeys = (bodies: string[]) => bodies.flatMap((b) => BAND_TYPES.map((t) => `${b}:${t}`)).sort();
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

  // The threshold itself, at its edge: a range exactly 0.9° wide is ranged, a hair under it not.
  check(
    'isRanged: 0.9° wide is ranged, 0.8999° is not, and no range at all is not',
    isRanged({ lo: -0.45, hi: 0.45 }) && isRanged({ lo: 0, hi: 0.9 }) && !isRanged({ lo: -0.45, hi: 0.4499 }) && !isRanged(undefined),
  );

  // Which lines get bands: every RANGED body's four angle lines, untagged, once each, in the
  // line's own colour — and no unranged body's, nor the Vertex axis.
  const lines = generateLines(PS5, ML);
  const recoloured: FeatureCollection<LineString, LineProps> = {
    type: 'FeatureCollection',
    features: lines.features.map((f) => ({
      ...f,
      properties: { ...f.properties, color: f.properties.planet === 'Moon' ? '#123456' : f.properties.color },
    })),
  };
  const fc = generateUncertaintyBands(recoloured, PS5, MOTION, ML, EPS);
  const keys = fc.features.map((f) => `${f.properties.planet}:${f.properties.lineType}`).sort();
  check(
    'bands for the four ranged bodies on MC, IC, ASC and DSC only — none for Mars or Jupiter (under 0.9°), no Vertex axis',
    JSON.stringify(keys) === JSON.stringify(ownKeys(RANGED5)),
    keys.join(','),
  );
  check(
    "each band is the line's own colour at the band opacity",
    fc.features.length > 0 &&
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
  const fc2 = generateUncertaintyBands(noMoonAsc, PS5, MOTION, ML, EPS);
  const moonKeys = fc2.features.filter((f) => f.properties.planet === 'Moon').map((f) => f.properties.lineType).sort();
  check('a filtered-out line has no band, and a repeated line one band', JSON.stringify(moonKeys) === JSON.stringify(['DSC', 'IC', 'MC']), moonKeys.join(','));
  // Another chart's line (an overlay's, tagged) gets none.
  const tagged: FeatureCollection<LineString, LineProps> = {
    type: 'FeatureCollection',
    features: lines.features.map((f) => ({ ...f, properties: { ...f.properties, tag: 'Tr' } })),
  };
  check('a tagged (overlay) line gets no band', generateUncertaintyBands(tagged, PS5, MOTION, ML, EPS).features.length === 0 && fc.features.length > 0);

  // The line sits inside its own band: every vertex of the drawn MC, IC, ASC and DSC lines
  // (two independent constructions — the line generator and the band) is inside the band,
  // but where it touches the ring at a turning point. Every fixture, asymmetric ones and the
  // narrowest included: noon lies inside every range, so the line does too.
  let verts = 0;
  let outside = 0;
  let touching = 0;
  const outs: string[] = [];
  for (const body of FIX_BODIES) {
    for (const lonDeg of CASE_DEGS.get(body)!) {
      const p = bodyAt(body, lonDeg);
      const drawn = generateLines([p], ML);
      const bands = generateUncertaintyBands(drawn, [p], MOTION, ML, EPS);
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

// The stamp (2026-10-20): the band is decided once, by bandFor, written onto the line by
// stampBands, and read from there by the fills, the corridors and the listing tools. Which lines
// carry one under the range rule (Lina, 22 Oct 2026, §2.2): every RANGED body's own MC, IC, ASC
// and DSC; its aspect lines; every midpoint line with a ranged body on EITHER side — and nothing
// of an unranged body's (an unranged pair's midpoints included), not the Vertex axis, not another
// chart's (tagged) line unless the caller says the tagged family is the timeless chart's own (§15).
{
  const ps = PS5;
  type P = BandedLineProps & { aspect?: string };
  const keyOf = (p: P) =>
    `${p.kind ?? 'line'}:${p.planet}${p.planetB ? `/${p.planetB}` : ''}:${p.kind === 'aspect' ? `${p.aspect}:${p.branch}` : p.lineType}`;
  const bandedKeys = (fc: FeatureCollection<LineString, LineProps>) =>
    [...new Set(stampBands(fc, ps, MOTION, EPS).features.filter((f) => (f.properties as P).band).map((f) => keyOf(f.properties as P)))].sort();
  const allKeys = (fc: FeatureCollection<LineString, LineProps>, keep: (p: P) => boolean) =>
    [...new Set(fc.features.map((f) => f.properties as P).filter(keep).map(keyOf))].sort();
  const isR = (n: PlanetName | undefined) => n !== undefined && RANGED5.includes(n);
  const lines = generateLines(ps, ML);
  const aspects = generateAspectLines(ps, ML, 'zodiaco', EPS);
  const mids = generateMidpointLines(ps, ML, 'zodiaco', EPS);
  const planetKeys = bandedKeys(lines);
  check(
    'own lines: every ranged body\'s MC, IC, ASC and DSC are stamped — none of Mars\'s or Jupiter\'s, no Vertex axis',
    lines.features.some((f) => f.properties.lineType === 'VX' && isR(f.properties.planet)) &&
      JSON.stringify(planetKeys) === JSON.stringify(ownKeys(RANGED5).map((k) => `line:${k}`)),
    planetKeys.join(','),
  );
  // The Vertex axis is generated here (as on a celestial map), so "no band on it" is a claim about
  // lines that exist.
  const onAngle = (p: P) => BAND_TYPES.includes((p.kind === 'aspect' ? p.branch : p.lineType)!);
  const aspectFc = aspects as FeatureCollection<LineString, LineProps>;
  const aspectKeys = bandedKeys(aspectFc);
  const aspectWant = allKeys(aspectFc, (p) => isR(p.planet) && onAngle(p));
  const aspectPlainOwn = allKeys(aspectFc, (p) => isR(p.planet) && !onAngle(p));
  const aspectNot = allKeys(aspectFc, (p) => !isR(p.planet));
  check(
    'aspect lines: exactly the ranged bodies\' on the four angles are stamped (every aspect, every branch); their Vertex branches and Mars\'s and Jupiter\'s are not',
    aspectWant.length === RANGED5.length * 12 && aspectPlainOwn.length > 0 && aspectNot.length > 0 && JSON.stringify(aspectKeys) === JSON.stringify(aspectWant),
    `${aspectKeys.length} stamped, ${aspectWant.length} wanted; plain: ${aspectPlainOwn.length} Vertex branches, ${aspectNot.length} of unranged bodies`,
  );
  const midFc = mids as FeatureCollection<LineString, LineProps>;
  const midKeys = bandedKeys(midFc);
  const midWant = allKeys(midFc, (p) => (isR(p.planet) || isR(p.planetB)) && onAngle(p));
  const midNot = allKeys(midFc, (p) => !isR(p.planet) && !isR(p.planetB));
  check(
    'midpoint lines: every pair with a ranged body on either side is stamped on the four angles; Mars/Jupiter, neither ranged, is not',
    midWant.length === 14 * 4 && midNot.includes('midpoint:Mars/Jupiter:MC') && JSON.stringify(midKeys) === JSON.stringify(midWant),
    `${midKeys.length} stamped, ${midWant.length} wanted, unranged pair: ${midNot.join(',')}`,
  );
  // Every aspect and midpoint line publishes a finite vlon in [0, 360).
  const all = [...aspects.features, ...generateMidpointLines(ps, ML, 'mundo', EPS).features];
  check('every aspect and midpoint line carries vlon in [0, 360)', all.length > 0 && all.every((f) => f.properties.vlon >= 0 && f.properties.vlon < 360));

  const tagged: FeatureCollection<LineString, LineProps> = {
    type: 'FeatureCollection',
    features: lines.features.map((f) => ({ ...f, properties: { ...f.properties, tag: 'Pr' } })),
  };
  const nTagged = stampBands(tagged, ps, MOTION, EPS).features.filter((f) => f.properties.band).length;
  const taggedOwn = stampBands(tagged, ps, MOTION, EPS, { tagged: true });
  const nOwn = taggedOwn.features.filter((f) => f.properties.band).length;
  check('a tagged line is stamped only when the caller says the family is the chart\'s own', nTagged === 0 && nOwn === RANGED5.length * 4, `${nTagged} / ${nOwn}`);

  // Nothing to stamp gives the collection itself back; a stamped line keeps its stamp.
  const plainOnly = generateLines([bodyAt('Mars', 30), bodyAt('Jupiter', 330)], ML);
  const once = stampBands(lines, ps, MOTION, EPS);
  const twice = stampBands(once, ps, motionOf({ Moon: { lo: -3, hi: 3 }, Sun: { lo: -2, hi: 2 } }), EPS);
  check(
    'no banded line: the same object back; a line already stamped keeps its stamp',
    stampBands(plainOnly, ps, MOTION, EPS) === plainOnly &&
      once.features.every((f, i) => twice.features[i].properties.band === f.properties.band) &&
      once.features.some((f) => f.properties.band),
  );
  // bandFor and the stamp: a body's own line has no degree of its own (it comes from the
  // positions), a derived line's is its vlon; the range is the body's offsets, about that degree.
  const moonMc = lines.features.find((f) => f.properties.planet === 'Moon' && f.properties.lineType === 'MC')!;
  const specMc = bandFor(moonMc.properties, MOTION);
  const stampMc = once.features.find((f) => f.properties.planet === 'Moon' && f.properties.lineType === 'MC')!.properties.band;
  check(
    'a body\'s own band: noon degree the body\'s longitude in the positions, lo = λ + lo, hi = lo + the width (asymmetric about noon)',
    specMc !== null &&
      specMc.deg === undefined &&
      !!stampMc &&
      Math.abs(stampMc.deg - 123.4) < 1e-9 &&
      Math.abs(stampMc.lo - (123.4 - 6.6)) < 1e-9 &&
      Math.abs(stampMc.hi - (123.4 + 6.1)) < 1e-9 &&
      stampMc.angle === 'MC' &&
      stampMc.eps === EPS,
    JSON.stringify(stampMc),
  );

  // TWO PARTS AGREE — the band is where the line sweeps. Every body moved to each of its samples
  // across the day, the lines generated again, and each banded line's own degree read off the
  // regenerated line (the body's longitude for its own lines; the vlon the generator publishes for
  // an aspect or midpoint line): its lowest and highest offset from noon must be the band's ends.
  // So an aspect line's band is its body's range, a midpoint line's the pair's own (midpointRange),
  // never a fixed span — and the generator, not a restated formula, says so.
  {
    const stampedAll = [
      ...once.features,
      ...stampBands(aspects as FeatureCollection<LineString, LineProps>, ps, MOTION, EPS).features,
      ...stampBands(mids as FeatureCollection<LineString, LineProps>, ps, MOTION, EPS).features,
    ];
    const gen = (q: PlanetPosition[]) =>
      [
        ...generateLines(q, ML).features,
        ...generateAspectLines(q, ML, 'zodiaco', EPS).features,
        ...generateMidpointLines(q, ML, 'zodiaco', EPS).features,
      ] as Feature<LineString, P>[];
    const degOf = (p: P, q: PlanetPosition[]) => (p.kind ? p.vlon! : q.find((x) => x.name === p.planet)!.lon! * R2D);
    const noonDeg = new Map<string, number>();
    for (const f of gen(ps)) noonDeg.set(keyOf(f.properties), degOf(f.properties, ps));
    const swept = new Map<string, BodyRange>();
    for (let k = 0; k < DAY_SAMPLES; k++) {
      const q = ps.map((p) => {
        const s = MOTION.samples.get(p.name);
        return s ? bodyAt(p.name, p.lon! * R2D + s[k]) : p;
      });
      for (const f of gen(q)) {
        const id = keyOf(f.properties);
        const at = noonDeg.get(id);
        if (at === undefined) continue;
        const d = signedDiff(at, degOf(f.properties, q));
        const r = swept.get(id) ?? { lo: 0, hi: 0 };
        swept.set(id, { lo: Math.min(r.lo, d), hi: Math.max(r.hi, d) });
      }
    }
    let n = 0;
    let worst = 0;
    let midN = 0;
    let midLib = 0;
    const bad: string[] = [];
    for (const f of stampedAll) {
      const p = f.properties as P;
      const band = p.band;
      if (!band) continue;
      const sw = swept.get(keyOf(p));
      n++;
      if (!sw) {
        bad.push(`${keyOf(p)}: not regenerated`);
        continue;
      }
      const loOff = signedDiff(band.deg, band.lo);
      const d = Math.max(Math.abs(loOff - sw.lo), Math.abs(band.hi - band.lo - (sw.hi - sw.lo)), degDiff(band.deg, noonDeg.get(keyOf(p))!));
      worst = Math.max(worst, d);
      if (d > 1e-7 && bad.length < 6) bad.push(`${keyOf(p)}: band ${loOff.toFixed(4)}…+${(loOff + band.hi - band.lo).toFixed(4)}, swept ${sw.lo.toFixed(4)}…+${sw.hi.toFixed(4)}`);
      if (p.kind === 'midpoint') {
        midN++;
        const lib = midpointRange(MOTION.samples.get(p.planet), p.planetB ? MOTION.samples.get(p.planetB) : undefined);
        if (Math.abs(lib.lo - sw.lo) < 1e-7 && Math.abs(lib.hi - sw.hi) < 1e-7) midLib++;
      }
    }
    check(
      'every stamp is its line\'s own sweep across the day: noon degree, low end and width (own, aspect and midpoint lines alike)',
      n > 40 && worst < 1e-7 && bad.length === 0,
      `${n} stamped lines; worst ${worst.toExponential(2)}°${bad.length ? ` — ${bad.join(' | ')}` : ''}`,
    );
    check('…and a midpoint\'s is midpointRange of the pair\'s samples, half of each body\'s motion, sample by sample', midN > 0 && midLib === midN, `${midLib} of ${midN}`);

    // The range as the tips print it: bandRangeText (from the band's own ends) is lonRangeText at
    // the noon degree with the body's offsets — two routes to one text.
    let texts = 0;
    let textBad = 0;
    for (const f of stampedAll) {
      const p = f.properties as P;
      if (!p.band) continue;
      const r = { lo: signedDiff(p.band.deg, p.band.lo), hi: signedDiff(p.band.deg, p.band.lo) + p.band.hi - p.band.lo };
      texts++;
      if (bandRangeText(p.band) !== lonRangeText(p.band.deg * D2R, r)) textBad++;
    }
    check('bandRangeText is lonRangeText at the noon degree with the line\'s own offsets', texts > 40 && textBad === 0, `${textBad} of ${texts}`);

    // One key per line (Lina, 22 Oct 2026, §2.2: the band belongs to the hovered line only). The
    // map shows a band and its corridor by the hovered line's key (bandKeyOf), so a natal line and
    // the same body's line in an overlay ('Sp'), a body's own MC line and its aspect line on the
    // MC, and its midpoint line on the MC must not share one — the hover fault she reported — and
    // no two distinct lines in the set may either.
    const ownMc = once.features.find((f) => f.properties.planet === 'Moon' && f.properties.lineType === 'MC')!.properties as P;
    const spMc = stampBands(
      { type: 'FeatureCollection', features: lines.features.map((f) => ({ ...f, properties: { ...f.properties, tag: 'Sp' } })) },
      ps,
      MOTION,
      EPS,
      { tagged: true },
    ).features.find((f) => f.properties.planet === 'Moon' && f.properties.lineType === 'MC')!.properties as P;
    const aspMc = stampedAll.map((f) => f.properties as P).find((p) => p.kind === 'aspect' && p.planet === 'Moon' && p.branch === 'MC' && p.band);
    const midMc = stampedAll.map((f) => f.properties as P).find((p) => p.kind === 'midpoint' && (p.planet === 'Moon' || p.planetB === 'Moon') && p.lineType === 'MC' && p.band);
    check(
      'bandKeyOf: a natal line and the same body\'s overlay (Sp) line differ; a body\'s own MC line, its aspect line on the MC and its midpoint line on the MC differ',
      !!spMc.band && !!aspMc && !!midMc &&
        bandKeyOf(ownMc) !== bandKeyOf(spMc) &&
        bandKeyOf(ownMc) !== bandKeyOf(aspMc) &&
        bandKeyOf(ownMc) !== bandKeyOf(midMc) &&
        bandKeyOf(aspMc) !== bandKeyOf(midMc),
      [ownMc, spMc, aspMc, midMc].map((p) => (p ? bandKeyOf(p) : 'none')).join('  '),
    );
    const keyLines = new Map<string, Set<string>>();
    for (const f of stampedAll) {
      const p = f.properties as P;
      if (!p.band) continue;
      const k = bandKeyOf(p);
      if (!keyLines.has(k)) keyLines.set(k, new Set());
      keyLines.get(k)!.add(keyOf(p));
    }
    const shared = [...keyLines].filter(([, ls]) => ls.size > 1);
    check(
      'no two banded lines share a band key (one hover, one band)',
      keyLines.size > 40 && shared.length === 0,
      `${keyLines.size} keys${shared.length ? `; shared: ${shared.slice(0, 4).map(([k, ls]) => `«${k}» by ${[...ls].join(' & ')}`).join(' | ')}${shared.length > 4 ? ` … (${shared.length} keys shared)` : ''}` : ''}`,
    );
    // The fills carry their line's key, so the map's hover filter finds the band it belongs to.
    const fills = generateUncertaintyBands(
      { type: 'FeatureCollection', features: stampedAll as Feature<LineString, LineProps>[] },
      ps,
      MOTION,
      ML,
      EPS,
    );
    const fillKeys = new Set(fills.features.map((f) => f.properties.bandKey));
    check(
      'every band fill carries its line\'s bandKeyOf, and every banded line\'s key has a fill',
      fills.features.length > 0 && fillKeys.size === keyLines.size && [...keyLines.keys()].every((k) => fillKeys.has(k)),
      `${fillKeys.size} fill keys, ${keyLines.size} line keys`,
    );
  }

  // The stamp path and the path App took before bands were carried draw the same bands.
  const viaStamp = generateUncertaintyBands(once, ps, MOTION, ML, EPS);
  const viaMotion = generateUncertaintyBands(lines, ps, MOTION, ML, EPS);
  check(
    'the fills from stamped lines are the fills from unstamped ones, ring for ring',
    viaStamp.features.length === RANGED5.length * 4 && JSON.stringify(viaStamp) === JSON.stringify(viaMotion),
  );
  // The coverage reading: the band's noon line is covered, at distance to its edge; a place
  // well outside isn't, and its distance is to the nearest edge, never the noon line.
  const covMid = bandCoverage(stampMc!, 10, moonMc.geometry.coordinates[40][0]);
  const farLng = moonMc.geometry.coordinates[40][0] + 40;
  const covFar = bandCoverage(stampMc!, 10, farLng);
  const edgeAtFar = Math.min(...(bandEdges(stampMc!, ML) ?? []).map((e) => distToPolylineKm(e, 10, farLng)));
  check(
    'bandCoverage: the line itself is covered; 40° away is not, and its distance is to the band\'s edge',
    covMid.covers && covMid.edgeKm > 300 && !covFar.covers && Math.abs(covFar.edgeKm - edgeAtFar) < 1e-6,
    `covered at ${covMid.edgeKm.toFixed(0)} km from the edge; 40° away ${covFar.edgeKm.toFixed(0)} km (edge line ${edgeAtFar.toFixed(0)} km)`,
  );
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
  // Further clauses may follow the two (the gate's own comment: anything else that turns the same
  // families off joins it here — since 22 Oct 2026 a stored line-system conflict, lineConflict).
  check('…and whenever the map is held (noTime || skyHeld, noTime first, any further clause after)', !!gate && /=\s*noTime\s*\|\|\s*skyHeld\s*(?:\|\|\s*\w+\s*)*;/.test(gate), gate ?? 'not found');
  // Since the Custom theme (2026-10-06) three of the families are two memos each: the
  // geometry (`*Geom`, which generates — and so is where the gate belongs) and an ink step
  // after it that only recolours. The gate is asserted on the geometry; the second check
  // below holds each ink step to reading its own gated geometry, so the gate still covers
  // what is drawn and what a plugin's complete set carries.
  // (natalStarLines left this list on 2026-10-20: the complete set's natal half is
  // lib/astro/allLines buildNatalLineSet now, whose gate §10 tests by what it builds, and §11
  // holds App's builder to calling it.)
  const families = ['allParans', 'allZenith', 'eclipticLine', 'starLinesGeom', 'starParansGeom', 'minorZenithGeom'];
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
    // (…and, since 2026-10-20, with no chart in force: the skyAlone clause after it.)
    ['lsActive', /=\s*showLocalSpace\s*&&\s*!skyHeld\s*(?:&&\s*!skyAlone\s*)?;/],
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

// ── 8. The orb corridor round a band ─────────────────────────────────────────────────
section('8. The orb corridor round a band (INTERNAL IDENTITY, two parts agree)');
// Lina, 20 Oct 2026, §13: "On a banded line the orb corridor surrounds the band, so it shows
// every place that could be within orb of the line, wherever in the band the line truly lies."
// The corridor (orbBands bandedCorridor) is built from the band's ring, by rows; this measures
// it with parts it never reads — the ground distance (great-circle) to the band's two EDGE LINES
// (bandEdges: the end degrees' meridians or curves) and the band's definition (bandCovers,
// through the place readout) — against plain polygon membership:
//   (a) every place within orb of either edge line is inside the corridor;
//   (b) every place the band covers is inside it;
//   (c) no place further from the band than the orb plus the construction's stated margin
//       (corridorMarginKm: 2.5 row steps, orbBands' header says why) is inside it — so a
//       corridor that covered the world would fail, not pass (a) and (b) for free;
//   (d) no place is in two pieces (the pieces abut: no doubled shading).
// Bands at degrees whose curves cross inside the polar circles (the figure of eight), at an
// equinox (the pole runs), across ±180°; wide symmetric ranges, asymmetric ones (noon a quarter
// of the way in, either way round), the narrowest a ranged body gets and a midpoint's, at three
// orbs. Places: seeded over the sphere to ±88° (the corridor stops at ±88.5°, every orb band's
// clamp), and seeded close to each edge line, where (a) and (c) are decided.
{
  // A band as stampBands writes it: `deg` the noon degree, the range's offsets about it.
  const bandAt = (deg: number, r: BodyRange, angle: BandAngle): LineBand => {
    const lo = norm360(deg + r.lo);
    return { lo, hi: lo + (r.hi - r.lo), deg, angle, eps: EPS };
  };
  const WIDE = { lo: -7.7, hi: 7.7 };
  const cases: { what: string; band: LineBand }[] = [];
  for (const [deg, angle] of [[50, 'ASC'], [100, 'DSC'], [175, 'ASC'], [0, 'MC'], [180, 'IC'], [263.2, 'ASC'], [90, 'ASC']] as const) {
    cases.push({ what: `±7.7° at ${deg}° ${angle}`, band: bandAt(deg, WIDE, angle) });
  }
  cases.push({ what: '−3…+9° at 172° ASC (across 0° Libra)', band: bandAt(172, { lo: -3, hi: 9 }, 'ASC') });
  cases.push({ what: '−9…+3° at 50° ASC', band: bandAt(50, { lo: -9, hi: 3 }, 'ASC') });
  cases.push({ what: '−9…+3° at 3° MC (across 0° Aries)', band: bandAt(3, { lo: -9, hi: 3 }, 'MC') });
  cases.push({ what: 'the narrowest, −0.47…+0.49° at 300° ASC', band: bandAt(300, FIX.Sun, 'ASC') });
  cases.push({ what: 'a midpoint\'s, −2…+5.2° at 33.3° DSC', band: bandAt(33.3, { lo: -2, hi: 5.2 }, 'DSC') });
  const ORBS = [120, 325, 900];
  const rand = rng(8);
  // Uniform on the sphere to ±88°.
  const sample = (): [number, number] => {
    for (;;) {
      const lat = Math.asin(2 * rand() - 1) * R2D;
      if (Math.abs(lat) <= 88) return [-180 + 360 * rand(), lat];
    }
  };
  const inPiece = (ring: number[][], lng: number, lat: number) => insideRow(rowCrossings(ring, lat), lng);
  let nA = 0;
  let okA = 0;
  let nB = 0;
  let okB = 0;
  let nC = 0;
  let okC = 0;
  let nD = 0;
  let okD = 0;
  let nCnear = 0;
  let overshoot = -Infinity;
  let widestOut = Infinity;
  let pieces = 0;
  let worstMs = 0;
  const bad: string[] = [];
  for (const { what, band } of cases) {
    const edges = bandEdges(band, ML);
    const ring = bandOutline(band);
    if (!edges || !ring) {
      bad.push(`${what}: no edges or ring`);
      continue;
    }
    for (const orb of ORBS) {
      const t0 = performance.now();
      const corr = bandedCorridor(band, orb);
      worstMs = Math.max(worstMs, performance.now() - t0);
      pieces += corr.length;
      // The module's own stated bound, plus a kilometre for the sampled distance's own error.
      const margin = corridorMarginKm(orb) + 1;
      const probes: [number, number][] = [];
      for (let i = 0; i < 1500; i++) probes.push(sample());
      // Near the edges: a point of an edge line, moved off it by up to 1.6 orbs in a random
      // direction — inside and outside the orb, either side, the turning points included.
      for (const e of edges) {
        const usable = e.filter(([, y]) => Math.abs(y) < 86);
        for (let i = 0; i < 350 && usable.length; i++) {
          const [x, y] = usable[Math.floor(rand() * usable.length)];
          const dist = (orb * 1.6 * rand()) / 6371;
          const brg = 2 * Math.PI * rand();
          const p1 = y * D2R;
          const lat2 = Math.asin(Math.sin(p1) * Math.cos(dist) + Math.cos(p1) * Math.sin(dist) * Math.cos(brg));
          const lng2 = x * D2R + Math.atan2(Math.sin(brg) * Math.sin(dist) * Math.cos(p1), Math.cos(dist) - Math.sin(p1) * Math.sin(lat2));
          const lat = lat2 * R2D;
          if (Math.abs(lat) <= 88) probes.push([normLng(lng2 * R2D), lat]);
        }
      }
      for (const [lng, lat] of probes) {
        const hits = corr.filter((r) => inPiece(r, lng, lat)).length;
        nD++;
        if (hits <= 1) okD++;
        else if (bad.length < 8) bad.push(`${what} ${orb} km: ${lat.toFixed(3)},${lng.toFixed(3)} in ${hits} pieces`);
        const inCorr = hits > 0;
        const dEdge = Math.min(distToPolylineKm(edges[0], lat, lng), distToPolylineKm(edges[1], lat, lng));
        const covered = bandCovers(band, lat, lng);
        if (dEdge <= orb) {
          nA++;
          if (inCorr) okA++;
          else if (bad.length < 8) bad.push(`${what} ${orb} km (a): ${lat.toFixed(3)},${lng.toFixed(3)} is ${dEdge.toFixed(1)} km from an edge, outside`);
        }
        if (covered) {
          nB++;
          if (inCorr) okB++;
          else if (bad.length < 8) bad.push(`${what} ${orb} km (b): ${lat.toFixed(3)},${lng.toFixed(3)} covered by the band, outside`);
        }
        const dBand = covered ? 0 : distToPolylineKm(ring, lat, lng);
        if (!inCorr && dBand > 0) widestOut = Math.min(widestOut, dBand / orb);
        if (inCorr && !covered) overshoot = Math.max(overshoot, dBand - orb);
        if (dBand > orb + margin) {
          nC++;
          if (dBand < 1.3 * orb) nCnear++;
          if (!inCorr) okC++;
          else if (bad.length < 8) bad.push(`${what} ${orb} km (c): ${lat.toFixed(3)},${lng.toFixed(3)} is ${dBand.toFixed(1)} km from the band, inside`);
        }
      }
    }
  }
  note(`${cases.length} bands × ${ORBS.length} orbs: ${pieces} corridor pieces; slowest build ${worstMs.toFixed(1)} ms`);
  check(`(a) every place within orb of an edge line is inside the corridor`, nA > 5000 && okA === nA, `${okA}/${nA}${bad.length ? ` — ${bad.join(' | ')}` : ''}`);
  check(`(b) every place the band covers is inside it`, nB > 2000 && okB === nB, `${okB}/${nB}`);
  check(
    `(c) no place further than the orb and the margin from the band is inside it — ${nCnear} of them within 1.3 orbs`,
    nC > 20000 && nCnear > 500 && okC === nC,
    `${okC}/${nC}; furthest drawn ${overshoot.toFixed(1)} km past the orb; nearest left out ${widestOut.toFixed(3)} orbs away`,
  );
  check(`(d) no place is in two pieces`, nD > 0 && okD === nD, `${okD}/${nD}`);

  // And App's orb layer draws it: a stamped line's orb fill is its band's corridor, an unstamped
  // line's the old ring round the line — the same calls, the stamp alone deciding — and each piece
  // of a corridor carries its line's band key (bandOf = bandKeyOf), so the map shows it only with
  // its own line hovered.
  const moon = bodyAt('Moon', 50);
  const lines = generateLines([moon], ML);
  const stamped = stampBands(lines, [moon], MOTION, EPS);
  const noParans = { type: 'FeatureCollection' as const, features: [] };
  const plain = generateOrbBands(lines, noParans, 325, 0);
  const viaBand = generateOrbBands(stamped, noParans, 325, 0);
  const ascProps = stamped.features.find((f) => f.properties.lineType === 'ASC')!.properties;
  const want = bandedCorridor(ascProps.band!, 325);
  check(
    "generateOrbBands: a stamped line's fill is its band's corridor (its own colour, its line's band key), an unstamped line's the ring round it",
    plain.features.length === lines.features.length &&
      plain.features.every((f) => f.properties.bandOf === undefined) &&
      want.length > 0 &&
      want.every((r) =>
        viaBand.features.some(
          (f) => f.geometry.coordinates[0] === r && f.properties.color === PLANET_COLORS.Moon && f.properties.bandOf === bandKeyOf(ascProps),
        ),
      ),
    `${plain.features.length} plain, ${viaBand.features.length} via the bands`,
  );
}

// The App source, for the two tripwires below: a declaration's text, from `const NAME` to the
// next line indented at most as deep as its own.
const APP = readFileSync('src/App.tsx', 'utf8').replace(/\r\n/g, '\n');
const appDecl = (name: string): string | null => {
  const m = new RegExp(`const ${name}(?::[^=\\n]+)?(?:<[^>\\n]+>)? =\\s`).exec(APP);
  if (!m) return null;
  const i = m.index;
  const indent = i - APP.lastIndexOf('\n', i) - 1;
  const end = APP.slice(i).search(new RegExp(`\\n {0,${indent}}\\S`));
  return end < 0 ? null : APP.slice(i, i + end);
};
const shownSrc = (s: string | null) => (s ?? 'not found').replace(/\s+/g, ' ').slice(0, 160);

// ── 9. App's one tilt ────────────────────────────────────────────────────────────────
section("9. App's one tilt: declared once, read everywhere (SOURCE TRIPWIRE)");
// Lina, 20 Oct 2026, §2: "Every geodetic surface uses the loaded chart's true obliquity of date.
// With no chart loaded, every geodetic surface uses J2000. One tilt on screen at a time." App's
// geoEps is that tilt, and the failure this guards against is quiet: a surface left reading its
// own ε draws a second tilt that differs by minutes of arc in places, and nothing looks wrong.
// verify-geodetic G11 holds the readout and the frame to agree at one ε; this holds App to
// handing every geodetic surface the same one.
{
  const decls = APP.match(/\bconst geoEps\b/g)?.length ?? 0;
  const geo = appDecl('geoEps');
  check(
    'geoEps is declared once, from the DERIVED chart: current ? eps : EPS_J2000',
    decls === 1 && !!geo && /=\s*current\s*\?\s*eps\s*:\s*EPS_J2000\s*;/.test(geo),
    `${decls} declaration(s): ${shownSrc(geo)}`,
  );
  // J2000 reaches no surface but through it: the import, and the one declaration.
  const j2000 = APP.match(/\bEPS_J2000\b/g)?.length ?? 0;
  check('EPS_J2000 is read nowhere else in App (the import and geoEps alone)', j2000 === 2, `${j2000} occurrences`);
  const consumers: [string, RegExp][] = [
    ['the readout', /geoReadoutAngles\(\s*lat\s*,\s*lng\s*,\s*geoEps\s*\)/],
    ['the Ascendant curves on the map', /geoAscGrid\(\s*geoEps\s*\)\.asc/],
    ['the Ascendant zones', /useGeoAscZones\(\s*geoHoverAsc\s*,\s*geoEps\s*\)/],
    ['the wheel\'s frame', /geodeticFrame\(\s*jd\s*,\s*at\.lat\s*,\s*at\.lng\s*,\s*effHouseSystem\s*,\s*geoEps\s*\)/],
    ['the Coordinates box with no chart', /geodeticAngles\(\s*activePoint\.lng\s*,\s*activePoint\.lat\s*,\s*geoEps\s*\)/],
    // The bands' fills, from the chart's own motion at the lines' own positions and mapping.
    ['the bands', /generateUncertaintyBands\(\s*drawn\s*,\s*linePositions\s*,\s*natalMotion\s*,\s*meridianLng\s*,\s*geoEps\s*\)/],
    // The stamp on the natal planet lines (and, below, on every natal stamp call).
    ['the natal lines\' bands', /stampNatalBands\(\s*generateLines\(\s*src\s*,\s*meridianLng\s*,\s*lineOpts\s*\)\s*,\s*linePositions\s*,\s*natalMotion\s*,\s*lineSystem\s*,\s*geoEps\s*\)/],
    // An overlay's motion is read at the one tilt, and its lines stamped at it (§15, 22 Oct §2.3).
    ['the overlay\'s motion', /overlayBirthDateMotion\(\s*current\s*,[\s\S]{0,800}?\)\s*,\s*geoEps\s*,?\s*\)/],
    ['the overlay\'s bands', /stampBands\(\s*fc\s*,\s*ovPositions\s*,\s*overlayMotion\s*,\s*geoEps\s*,\s*\{\s*tagged:\s*true\s*\}\s*\)/],
    ['the natal lines (natalLineEps)', /natalLineEps\(\s*\{\s*eps\s*,\s*geoEps\s*\}\s*,\s*lineSystem\s*\)/],
    ['the overlays\' projection', /const ovProjectEps = lineSystem === 'geodetic' \? geoEps : undefined;/],
  ];
  const missing = consumers.filter(([, re]) => !re.test(APP));
  check(
    `every geodetic surface reads it: ${consumers.map(([n]) => n).join(', ')}`,
    missing.length === 0,
    missing.map(([n]) => n).join(', '),
  );
  // Every overlay memo maps at the one tilt (ovFrameEps) and lays its bodies back at it
  // (ovProjectEps) — none left on obliquity(overlayLayer.jd) on a geodetic map.
  const ovEpsDecls = [...APP.matchAll(/const ovEps = ([^;]+);/g)].map((m) => m[1].trim());
  const ownTilt = ovEpsDecls.filter((d) => d !== 'ovFrameEps(overlayLayer.jd)');
  check(
    `every overlay memo's ε is ovFrameEps (${ovEpsDecls.length} memos)`,
    ovEpsDecls.length >= 4 && ownTilt.length === 0,
    ownTilt.join(' | '),
  );
  const projections = [...APP.matchAll(/projectOntoEcliptic\(overlayLayer\.positions, overlayLayer\.jd([^)]*)\)/g)].map((m) => m[1]);
  const unprojected = projections.filter((p) => !/,\s*ovProjectEps$/.test(p));
  check(
    `every overlay projection lays its bodies back at ovProjectEps (${projections.length} calls)`,
    projections.length >= 4 && unprojected.length === 0,
    unprojected.join(' | '),
  );
  const minorFrames = [...APP.matchAll(/overlayMinorLines\(overlayLayer, overlayMinorSampled, \{([^}]*)\}\)/g)].map((m) => m[1]);
  check(
    `the overlay's catalog lines are handed it too (${minorFrames.length} calls)`,
    minorFrames.length === 2 && minorFrames.every((f) => /\bgeoEps\b/.test(f)),
  );
  // Every natal stamp — the planet lines and, since the range rule (22 Oct 2026, §2.2), the drawn
  // aspect and midpoint lines — reads the chart's own motion and stamps at the one tilt.
  const stampCalls: string[] = [];
  for (const m of APP.matchAll(/\bstampNatalBands\(/g)) {
    let depth = 0;
    let j = m.index! + m[0].length - 1;
    for (; j < APP.length; j++) {
      if (APP[j] === '(') depth++;
      else if (APP[j] === ')' && --depth === 0) break;
    }
    stampCalls.push(APP.slice(m.index!, j + 1));
  }
  const offTilt = stampCalls.filter((c) => !/,\s*linePositions,\s*natalMotion,\s*lineSystem,\s*geoEps,?\s*\)$/.test(c));
  check(
    `every natal stamp reads natalMotion at geoEps (${stampCalls.length} calls: the planet lines, the aspect and midpoint lines)`,
    stampCalls.length >= 2 && offTilt.length === 0,
    offTilt.map((c) => shownSrc(c)).join(' | '),
  );
}

// ── 10. A document's line set in its own line system ─────────────────────────────────────
section("10. A document's line set in its own system (INTERNAL IDENTITY + OUTSIDE AGREEMENT)");
// Lina's ruling for Reports (20 Oct 2026, §23): a report builds its lines in the line system it
// records (lib/astro/allLines buildNatalLineSet, through MapExtensionContext.collectAllLinesFor).
// So the set built for a system must be the map's lines in that system — checked here against
// parts the builder never calls: Swiss's own houses for the celestial MC lines (relocate's MC at
// the line's meridian is the body's right ascension on the ecliptic), the place readout for the
// geodetic ones (geodeticAngles' MC there is the body's longitude). And one input state asked for
// both systems must give two different sets — the line system moves the set, nothing else does.
{
  const pos = getPlanetPositions(JD, 'mean');
  const ecl = getEclipticPositions(JD, 'mean');
  const bp = SEED_BIRTHS[0].birthplace;
  const base: NatalLineInputs = {
    positions: pos,
    sampleJd: JD,
    jd: JD,
    eps: EPS,
    gmst: gmstRadians(JD),
    geoEps: EPS,
    coordSystem: 'mundo',
    noTime: false,
    motion: null,
    fortune: null,
    starSet: 'bright',
    starColor: '#ffd27f',
    localSpaceOrigin: { lat: bp.lat, lng: bp.lng },
    minor: { positions: [], sampleJd: JD, decor: () => ({ name: '', color: '', icon: '' }) },
    minorParans: false,
  };
  const cel = buildNatalLineSet(base, 'celestial');
  const geo = buildNatalLineSet(base, 'geodetic');
  type P = { planet?: PlanetName; lineType?: string; kind?: string; band?: LineBand };
  const mcOf = (set: typeof cel) =>
    set.lines.features.filter((f) => (f.properties as P).lineType === 'MC' && (f.properties as P).kind === undefined);
  // The MC line's meridian: its first vertex's longitude.
  const lngOf = (f: Feature) => (f.geometry as LineString).coordinates[0][0];
  const raLon = (ra: number) => Math.atan2(Math.sin(ra), Math.cos(ra) * Math.cos(EPS));
  let nCel = 0;
  let okCel = 0;
  let worstCel = 0;
  for (const f of mcOf(cel)) {
    const p = pos.find((q) => q.name === (f.properties as P).planet);
    if (!p) continue;
    nCel += 1;
    const mc = relocate(JD, 0, lngOf(f), 'placidus').mc;
    const d = degDiff(mc * R2D, raLon(p.ra) * R2D);
    worstCel = Math.max(worstCel, d);
    if (d < 1e-4) okCel += 1;
  }
  check(
    "celestial: every body's MC line lies where Swiss puts that body's right ascension on the MC",
    nCel >= 10 && okCel === nCel,
    `${okCel}/${nCel}, worst ${worstCel.toExponential(2)}°`,
  );
  let nGeo = 0;
  let okGeo = 0;
  let worstGeo = 0;
  for (const f of mcOf(geo)) {
    const e = ecl.find((q) => q.name === (f.properties as P).planet);
    if (!e) continue;
    nGeo += 1;
    const d = degDiff(geodeticAngles(lngOf(f), 0, EPS).mc * R2D, e.lon * R2D);
    worstGeo = Math.max(worstGeo, d);
    if (d < 1e-6) okGeo += 1;
  }
  check(
    "geodetic: every body's MC line lies where the place readout's MC is the body's longitude",
    nGeo >= 10 && okGeo === nGeo,
    `${okGeo}/${nGeo}, worst ${worstGeo.toExponential(2)}°`,
  );
  const moved = mcOf(cel).filter((f) => {
    const g = mcOf(geo).find((h) => (h.properties as P).planet === (f.properties as P).planet);
    return g && degDiff(lngOf(f), lngOf(g)) > 0.5;
  }).length;
  check('one input state, two systems, two sets: the MC lines move with the line system asked', moved >= 10, `${moved} moved`);
  const again = buildNatalLineSet(base, 'celestial');
  check(
    '…and nothing else moves them: the same system asked twice gives the same lines',
    again.lines.features.length === cel.lines.features.length &&
      again.lines.features.every((f, k) => lngOf(f) === lngOf(cel.lines.features[k])),
  );
  // The sky hold, by what is built: on geodetic no parans, stars, local space or Vertex; on
  // celestial all of them, so the empties above are the hold and not an empty chart.
  const vx = (set: typeof cel) => set.lines.features.filter((f) => /^A?VX$/.test(String((f.properties as P).lineType))).length;
  check(
    'celestial: parans, star lines, local space and the Vertex axis are all built',
    cel.parans.features.length > 0 && cel.starLines.features.length > 0 && cel.localSpace.features.length > 0 && vx(cel) > 0 && cel.skyHeld === false && cel.lineSystem === 'celestial',
    `${cel.parans.features.length} parans, ${cel.starLines.features.length} star lines, ${cel.localSpace.features.length} local space, ${vx(cel)} Vx`,
  );
  check(
    'geodetic: none of them (the sky hold), and the set says it is held and geodetic',
    geo.parans.features.length === 0 && geo.starLines.features.length === 0 && geo.localSpace.features.length === 0 && vx(geo) === 0 && geo.skyHeld === true && geo.lineSystem === 'geodetic' && geo.angleLines.features.length > 0,
  );
  check(
    'a natal set carries no overlay, whichever system',
    [cel, geo].every((s) => s.overlayLines === null && s.overlayParans === null && s.overlayLocalSpace === null && s.overlayMinorLines === null),
  );
  // A chart with no birth time (Lina's one range rule, 22 Oct 2026): no lines on a celestial map;
  // on a geodetic one its lines with their bands, read from the chart's motion over its birth date
  // (birthDateMotion, the input App hands in as `motion`) — every RANGED body's own four lines,
  // each ranged body's aspect lines, and every midpoint line with a ranged body on either side —
  // each band about the degree its line is drawn for, at the one tilt. The degree is held to the
  // ephemeris (getEclipticPositions), a part the builder never reads; the ranges to §3.
  const motion = birthDateMotion(SEED_BIRTHS[0], 'mean');
  const ranged = new Set([...motion.ranges].filter(([, r]) => isRanged(r)).map(([n]) => n));
  check(
    "the chart's ranged bodies include the Sun and the Moon, and none of Mars to Pluto (the rule's own figures, §3)",
    ranged.has('Sun') && ranged.has('Moon') && !(['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'] as PlanetName[]).some((n) => ranged.has(n)),
    [...ranged].join(', '),
  );
  const tlCel = buildNatalLineSet({ ...base, noTime: true, motion }, 'celestial');
  const tlGeo = buildNatalLineSet({ ...base, noTime: true, motion }, 'geodetic');
  type Q = P & { planetB?: PlanetName; branch?: string; vlon?: number };
  const bands = (fc: FeatureCollection) => fc.features.filter((f) => (f.properties as P).band);
  check(
    'timeless, celestial: no lines at all (the hour decides them)',
    tlCel.lines.features.length === 0 && tlCel.angleLines.features.length === 0,
  );
  const own = bands(tlGeo.lines);
  const ownOk = own.every((f) => {
    const p = f.properties as Q;
    const e = ecl.find((q) => q.name === p.planet);
    const r = motion.ranges.get(p.planet!);
    return (
      !!e &&
      !!r &&
      degDiff(p.band!.deg, e.lon * R2D) < 1e-9 &&
      degDiff(p.band!.lo, e.lon * R2D + r.lo) < 1e-9 &&
      Math.abs(p.band!.hi - p.band!.lo - (r.hi - r.lo)) < 1e-9 &&
      p.band!.angle === p.lineType &&
      p.band!.eps === EPS
    );
  });
  const ownBodies = [...new Set(own.map((f) => String((f.properties as P).planet)))].sort();
  check(
    "timeless, geodetic: every ranged body's four lines, and only theirs, carry its band — about the body's degree, λ + lo to λ + hi, at the one tilt",
    ranged.size >= 2 && own.length === ranged.size * 4 && JSON.stringify(ownBodies) === JSON.stringify([...ranged].sort()) && ownOk,
    `${own.length} banded lines for ${ownBodies.join(', ')}`,
  );
  // The aspect and midpoint lines are in the set again (left out from 21 to 22 Oct), and banded by
  // the rule: an aspect line by its body's range, a midpoint line with a ranged body on either side
  // by the pair's own range (midpointRange), each about its own vlon.
  const ang = tlGeo.angleLines.features.map((f) => f.properties as Q);
  const angleOf = (p: Q) => (p.kind === 'aspect' ? p.branch : p.lineType);
  const isR = (n: PlanetName | undefined) => n !== undefined && ranged.has(n);
  const wantBand = (p: Q) =>
    BAND_TYPES.includes(angleOf(p) as LineType) && (p.kind === 'aspect' ? isR(p.planet) : isR(p.planet) || isR(p.planetB));
  const wrong = ang.filter((p) => !!p.band !== wantBand(p));
  const moonAsp = ang.filter((p) => p.kind === 'aspect' && p.planet === 'Moon');
  const moonMid = ang.filter((p) => p.kind === 'midpoint' && (p.planet === 'Moon' || p.planetB === 'Moon'));
  const plainAsp = ang.filter((p) => p.kind === 'aspect' && !p.band).length;
  const plainMid = ang.filter((p) => p.kind === 'midpoint' && !p.band).length;
  check(
    "timeless, geodetic: the aspect and midpoint lines are drawn — the Moon's among them, all banded — and banded exactly where the rule says",
    moonAsp.length > 0 && moonMid.length > 0 && moonAsp.every((p) => p.band) && moonMid.every((p) => p.band) && plainAsp > 0 && plainMid > 0 && wrong.length === 0,
    `${ang.length} aspect/midpoint lines: ${moonAsp.length} of the Moon's aspects, ${moonMid.length} of its midpoints; plain ${plainAsp} aspect, ${plainMid} midpoint; ${wrong.length} against the rule`,
  );
  const angBanded = ang.filter((p) => p.band);
  const angOk = angBanded.filter((p) => {
    const r =
      p.kind === 'aspect'
        ? motion.ranges.get(p.planet!)!
        : midpointRange(motion.samples.get(p.planet!), p.planetB ? motion.samples.get(p.planetB) : undefined);
    return (
      degDiff(p.band!.deg, p.vlon!) < 1e-9 &&
      degDiff(p.band!.lo, p.vlon! + r.lo) < 1e-9 &&
      Math.abs(p.band!.hi - p.band!.lo - (r.hi - r.lo)) < 1e-9 &&
      p.band!.angle === angleOf(p) &&
      p.band!.eps === EPS
    );
  }).length;
  check(
    '…each about its own vlon, as the angle it really is, at the one tilt',
    angBanded.length > 0 && angOk === angBanded.length,
    `${angOk}/${angBanded.length}`,
  );
  check(
    'a timed chart (no motion) carries no band, whichever line',
    geo.lines.features.length > 0 && geo.angleLines.features.length > 0 && bands(geo.lines).length === 0 && bands(geo.angleLines).length === 0,
  );
  // The reuse the live builder passes: the families handed in are the set's, as they are.
  const reused = buildNatalLineSet(base, 'celestial', { lines: cel.lines, parans: cel.parans });
  check('the live builder\'s reuse: families handed in are the set\'s own objects', reused.lines === cel.lines && reused.parans === cel.parans && reused.natalParans === cel.parans);
}

// ── 11. App's line set goes through that builder ─────────────────────────────────────────
section("11. App's line set goes through that builder (SOURCE TRIPWIRE)");
// What §10 proves of buildNatalLineSet is only true of the map's own complete set and of a
// document's while App builds both with it: the live set's natal half, and collectAllLinesFor
// for the other system — in the map's own, collectAllLines itself — with the review hold applied
// so a held device never builds a geodetic set. App can't be reached from Node, so its shape is
// read here.
{
  const build = appDecl('buildAllLines');
  check(
    "buildAllLines' natal half is buildNatalLineSet, handed the drawn memos",
    !!build && /buildNatalLineSet\(\s*liveNatalInputs\s*,\s*lineSystem\s*,\s*\{[^}]*lines:\s*allLines[^}]*\}\s*\)/.test(build) && !/generateAspectLines\(\s*linePositions/.test(build),
    shownSrc(build),
  );
  const forLs = appDecl('collectAllLinesFor');
  check(
    "collectAllLinesFor: the map's own system is collectAllLines(); a held 'geodetic' is answered in Celestial; the other is buildNatalLineSet, inked",
    !!forLs &&
      /ls === 'geodetic' && GEODETIC_HELD \? 'celestial' : ls/.test(forLs) &&
      /if \(want === lineSystem\) return collectAllLines\(\);/.test(forLs) &&
      /buildNatalLineSet\(\s*docNatalInputs\s*,\s*want\s*\)/.test(forLs) &&
      /inkAllLines\(/.test(forLs),
    shownSrc(forLs),
  );
  const stampFor = appDecl('linesStampFor');
  check(
    "linesStampFor: the map's own stamp in its own system, its own (with the system asked) otherwise",
    !!stampFor && /if \(want === lineSystem\) return linesStamp;/.test(stampFor) && /\bwant\b,/.test(stampFor),
    shownSrc(stampFor),
  );
  // A document's set is the chart's own sample, never a Slide's.
  const doc = appDecl('docNatalInputs');
  check(
    "a document's inputs are the chart's own sample (positions at jd), never the slid one",
    !!doc && /\bpositions,/.test(doc) && /sampleJd: jd,/.test(doc) && !/slidPositions|slideBucket/.test(doc),
    shownSrc(doc),
  );
  // The bands §10 builds come from `motion`; both input sets must hand the builder the chart's
  // own (22 Oct 2026), read once from the birth date — for a chart with no birth time, never a
  // composite's (whose moment is solved, not born) — or a document's set would carry no band, or
  // another's.
  const nm = appDecl('natalMotion');
  check(
    'natalMotion is birthDateMotion(current, nodeType), only for a chart with no birth time and not a composite',
    !!nm && /noTime && current && !current\.composite \? birthDateMotion\(current, nodeType\) : null/.test(nm),
    shownSrc(nm),
  );
  const live = appDecl('liveNatalInputs');
  check(
    "the live and the document's inputs both carry it (motion: natalMotion)",
    !!live && /\bmotion: natalMotion,/.test(live) && !!doc && /\bmotion: natalMotion,/.test(doc),
    `${shownSrc(live)} || ${shownSrc(doc)}`,
  );
  check(
    'the extension context carries both',
    /collectAllLinesFor,\n\s*linesStampFor,\n\s*advancedMode/.test(APP),
  );
}

// ── 12. No chart: every geodetic surface at J2000 ────────────────────────────────────────
section('12. No chart: every geodetic surface at J2000, and the Coordinates box is the wheel (TWO PARTS AGREE + SOURCE TRIPWIRE)');
// Lina, 20 Oct 2026, §2: "With no chart loaded, every geodetic surface uses J2000. One tilt on
// screen at a time." With No chart (the sky alone) a geodetic map still has a wheel — the sky's,
// at the pin or the hover — a Coordinates box, the readout and the transit lines. Three parts
// written apart must say the same thing about a place at that one tilt: the wheel's frame
// (geodeticFrame, through Swiss's houses), the Coordinates box (geodeticAngles, the closed form)
// and the readout (geoReadoutAngles, truncated to the minute). And the sky's transit lines, laid
// on the map by the generator App runs, must sit where the readout puts each body's degree —
// at J2000, not at the moment's own obliquity, which is what overlay lines were drawn at until
// that day. The second half reads App's shape, which no Node suite can reach.
{
  const MS = Date.UTC(2026, 9, 20, 12, 0); // a sky moment, as No chart's Transits would draw it
  const layer = buildSkyOverlay('transits', MS, 'mean');
  const ownEps = obliquity(layer.jd);
  const r = rng(1220);
  const places = Array.from({ length: 400 }, () => ({ lat: -64 + r() * 128, lng: -180 + r() * 360 }));
  // The readout prints to the minute, truncated by the one rule (truncZodiac): the wheel's
  // longitude through that rule must be the readout's, sign and all.
  const same = (z: { signIdx: number; text: string }, rad: number) => {
    const w = truncZodiac(rad, 'min');
    return w.signIdx === z.signIdx && w.text === z.text;
  };
  // The wheel (geodeticFrame at J2000, handed the placeholder moment App has with no chart, jd 0)
  // against the Coordinates box (geodeticAngles at J2000) and the readout.
  let worstBox = 0;
  let readoutMisses = 0;
  let agreed = 0;
  for (const p of places) {
    const wheel = geodeticFrame(0, p.lat, p.lng, 'placidus', EPS_J2000);
    const box = geodeticAngles(p.lng, p.lat, EPS_J2000);
    const read = geoReadoutAngles(p.lat, p.lng, EPS_J2000);
    const dBox = Math.max(degDiff(wheel.asc * R2D, box.asc * R2D), degDiff(wheel.mc * R2D, box.mc * R2D));
    const asOk = read.as === null || same(read.as, wheel.asc);
    const mcOk = same(read.mc, wheel.mc);
    worstBox = Math.max(worstBox, dBox);
    if (!asOk || !mcOk) readoutMisses += 1;
    if (dBox < 1e-9 && asOk && mcOk) agreed += 1;
  }
  check(
    "no chart: the sky's wheel, the Coordinates box and the readout name one AS and one MC at every place, at J2000",
    places.length > 0 && agreed === places.length,
    `${agreed}/${places.length}, worst wheel–box ${worstBox.toExponential(2)}°, ${readoutMisses} readout misses`,
  );
  // Not vacuous: the moment's own obliquity is a different tilt, and the Ascendant moves with it.
  const moved = places.filter(
    (p) => degDiff(geodeticAngles(p.lng, p.lat, ownEps).asc * R2D, geodeticAngles(p.lng, p.lat, EPS_J2000).asc * R2D) > 1e-4,
  ).length;
  check(
    '  …and the tilt is one the check can see: the sky moment’s own ε moves the Ascendant (past 1e-4°, the tolerance above) at most places',
    moved > places.length / 2 && Math.abs(ownEps - EPS_J2000) > 1e-6,
    `${moved}/${places.length} places, ε(moment) − ε(J2000) = ${((ownEps - EPS_J2000) * R2D * 3600).toFixed(1)}″`,
  );
  // The sky's transit lines, generated as App's overlay memos generate them on a geodetic map
  // with no chart: projected and mapped at the one tilt (ovProjectEps / ovFrameEps = geoEps =
  // J2000). Each MC line must stand where the readout at J2000 gives that body's degree as MC.
  const ovPos = projectOntoEcliptic(layer.positions, layer.jd, EPS_J2000);
  const ovMl = meridianLngFor('geodetic', EPS_J2000, layer.gmst);
  const skyLines = generateLines(ovPos, ovMl).features;
  const ecl = getEclipticPositions(layer.jd, 'mean');
  let nMc = 0;
  let okMc = 0;
  let worstMc = 0;
  for (const f of skyLines.filter((g) => g.properties.lineType === 'MC')) {
    const e = ecl.find((q) => q.name === f.properties.planet);
    if (!e) continue;
    nMc += 1;
    const lng = (f.geometry as LineString).coordinates[0][0];
    const d = degDiff(geodeticAngles(lng, 0, EPS_J2000).mc * R2D, e.lon * R2D);
    worstMc = Math.max(worstMc, d);
    if (d < 1e-6) okMc += 1;
  }
  check(
    "no chart: the sky's transit MC lines stand where the J2000 readout gives each body's degree as MC",
    nMc >= 10 && okMc === nMc,
    `${okMc}/${nMc}, worst ${worstMc.toExponential(2)}°`,
  );
  // …and its ASC lines run where the J2000 readout's Ascendant is the body's degree — the curve
  // that moves with the tilt, so the half the moment's own ε would fail.
  let nAsc = 0;
  let okAsc = 0;
  let worstAsc = 0;
  let ownMiss = 0;
  for (const f of skyLines.filter((g) => g.properties.lineType === 'ASC')) {
    const e = ecl.find((q) => q.name === f.properties.planet);
    if (!e) continue;
    for (const [lng, lat] of (f.geometry as LineString).coordinates) {
      if (Math.abs(lat) > 60) continue;
      nAsc += 1;
      const d = degDiff(geodeticAngles(lng, lat, EPS_J2000).asc * R2D, e.lon * R2D);
      worstAsc = Math.max(worstAsc, d);
      if (d < 1e-4) okAsc += 1;
      if (degDiff(geodeticAngles(lng, lat, ownEps).asc * R2D, e.lon * R2D) > 1e-4) ownMiss += 1;
    }
  }
  check(
    "  …and its ASC lines run where the J2000 readout's Ascendant is each body's degree (and not where the moment's own ε puts it)",
    nAsc >= 100 && okAsc === nAsc && ownMiss > 0,
    `${okAsc}/${nAsc} vertices, worst ${worstAsc.toExponential(2)}°; ${ownMiss} off the moment's own tilt`,
  );
  // The sky layer App builds is that layer: skyLayerFor is the call App's overlayLayer memo makes.
  const viaApp = skyLayerFor('transits', { targetDate: MS, eclipseMs: null }, 'mean', (k: string) => k);
  check(
    'the layer App builds with no chart is the sky at the moment (skyLayerFor = buildSkyOverlay, positions and frame)',
    !!viaApp &&
      viaApp.skyOnly === true &&
      viaApp.gmst === layer.gmst &&
      viaApp.jd === layer.jd &&
      viaApp.positions.length === layer.positions.length &&
      viaApp.positions.every((p, k) => p.ra === layer.positions[k].ra && p.dec === layer.positions[k].dec),
  );

  // App's shape: the sky wheel's angles come through the one geodetic frame call at geoEps,
  // admitted with no chart only while the sky is the wheel's chart; the overlay's angles on a
  // geodetic map are those same angles; the Coordinates box with no chart reads geodeticAngles
  // at geoEps — so §9's one tilt reaches all three, and J2000 with no chart by geoEps' own
  // definition (current ? eps : EPS_J2000, §9).
  const ang = appDecl('angles');
  check(
    "the wheel's geodetic angles: one geodeticFrame call at geoEps, the pin or hover with no chart, and only while the sky is the wheel's chart",
    !!ang &&
      (ang.match(/geodeticFrame\(/g)?.length ?? 0) === 1 &&
      /const at = activePoint \?\? current\?\.birthplace;/.test(ang) &&
      /if \(!at \|\| \(!current && !wheelIsSky\)\) return null;/.test(ang),
    shownSrc(ang),
  );
  const ovAng = appDecl('overlayAngles');
  check(
    "with no chart the sky's angles on a geodetic map ARE the wheel's frame; on a celestial one the point's at the layer's moment",
    !!ovAng &&
      /if \(!current\) \{\s*if \(!wheelIsSky\) return null;\s*if \(lineSystem === 'geodetic'\) return angles;\s*return activePoint \? relocate\(overlayLayer\.jd, activePoint\.lat, activePoint\.lng, effHouseSystem\) : null;/.test(ovAng),
    shownSrc(ovAng),
  );
  const box = appDecl('coordAngles');
  check(
    'the Coordinates box with no chart reads geodeticAngles at geoEps, and otherwise the wheel’s own angles',
    !!box && /geodeticAngles\(activePoint\.lng, activePoint\.lat, geoEps\)/.test(box) && /:\s*wheelAngles,/.test(box),
    shownSrc(box),
  );
  const wa = appDecl('wheelAngles');
  check(
    "the sky's wheel takes the overlay's angles (none without a point), never a chart's",
    !!wa && /wheelIsSky\s*\?\s*displayOverlayAngles/.test(wa),
    shownSrc(wa),
  );
  const layerDecl = appDecl('overlayLayer');
  check(
    'with no chart, the overlay layer is skyLayerFor’s — and only while the sky alone is in force',
    !!layerDecl && /if \(!current\) \{\s*if \(!skyAlone\) return null;\s*return skyLayerFor\(/.test(layerDecl),
    shownSrc(layerDecl),
  );
}

console.log(`\n${failures === 0 ? 'verify-geodetic-chart: ALL PASS' : `verify-geodetic-chart: ${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
