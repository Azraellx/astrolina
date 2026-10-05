// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the astrocartography LINE GEOMETRY of the real src/lib code (run via
// the harness: `npm run verify:lines`). The app draws an ASC line through every
// place where a body sits on the eastern horizon at the chart instant — so the
// checks here ask the sky directly, through routes independent of the line
// algebra under test:
//   1. on-horizon: every ASC/DSC vertex has geocentric altitude 0 (vector form);
//   2. rising vs setting: the altitude of the charted point is INCREASING along
//      ASC lines and decreasing along DSC lines (finite difference in time —
//      a sign error here would swap rising/setting lines app-wide);
//   3. Swiss's own rise/transit/set finder (swe_rise_trans, geometric horizon,
//      disc center) reproduces the chart instant at points on the lines;
//   4. polyline faithfulness: how far segment midpoints stray off the true
//      curve (sampling sag), and continuity across the DEC_EPS tracing switch;
//   5. zenith stamps, the ±180° seam, geodetic-mode identities, relocated
//      angles vs Robert Hand's closed-form ASC/MC, and the polar-latitude
//      behavior of every supported house system.
// Conventions verified: geometric horizon (no refraction), geocentric body
// centers, apparent positions + apparent sidereal time, of-date frame.
import { createRequire } from 'node:module';
import {
  birthDataToJD,
  eclipticLonOfRA,
  eclipticToRaDec,
  gmstRadians,
  getPlanetPositions,
  initEphemeris,
  obliquity,
  projectOntoEcliptic,
  raDecToEclipticLon,
  relocate,
  type HouseSystem,
  type PlanetName,
  type PlanetPosition,
} from '../src/lib/ephemeris';
import {
  generateLines,
  generateZenithStamps,
  LINE_TYPE_LABEL,
  meridianLngFor,
  normLng,
  traceHorizonCoords,
  type LineType,
  type MeridianLng,
} from '../src/lib/astro/lines';
import type { BirthData } from '../src/lib/birthData';
import { ANGLE_SPECS } from '../src/lib/astro/format';
import { lineReading } from '../src/lib/lineCard';
import { en } from '../src/i18n/en';
import { interpolate, resolvePath } from '../src/i18n/t';
import type { Messages, TFn } from '../src/i18n';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const node: any = createRequire(import.meta.url)('@swisseph/node');

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
// swe_rise_trans event bits: geometric horizon (no refraction), body center.
const BIT_DISC_CENTER = 256;
const BIT_NO_REFRACTION = 512;
const GEOMETRIC = BIT_DISC_CENTER | BIT_NO_REFRACTION;

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}
const fmt = (x: number) => x.toExponential(2);

// ── Independent oracle helpers ────────────────────────────────────────────────
// Greenwich apparent sidereal time straight from Swiss (armc at Greenwich) —
// the same data source the app reads, but none of the app's code.
const gastCache = new Map<number, number>();
function gastRad(jd: number): number {
  let v = gastCache.get(jd);
  if (v === undefined) {
    v = node.calculateHouses(jd, 0, 0, node.HouseSystem.WholeSign).armc * DEG2RAD;
    gastCache.set(jd, v!);
  }
  return v!;
}

// Geocentric altitude of a fixed equatorial direction (ra, dec) seen from a
// place, in VECTOR form: the dot product of the observer's zenith direction and
// the body direction has no hour-angle sign convention to inherit a bug from.
function altitudeOf(jd: number, ra: number, dec: number, latDeg: number, lngDeg: number): number {
  const theta = gastRad(jd) + lngDeg * DEG2RAD; // local apparent sidereal time
  const phi = latDeg * DEG2RAD;
  const dot =
    Math.cos(phi) * Math.cos(theta) * Math.cos(dec) * Math.cos(ra) +
    Math.cos(phi) * Math.sin(theta) * Math.cos(dec) * Math.sin(ra) +
    Math.sin(phi) * Math.sin(dec);
  return Math.asin(Math.max(-1, Math.min(1, dot)));
}

// d(altitude)/dt of the charted (frozen) position — pure Earth rotation, the
// motion that decides whether a charted point is on the RISING or SETTING side.
function altSlope(jd: number, ra: number, dec: number, latDeg: number, lngDeg: number): number {
  const dt = 30 / 86400;
  return (
    (altitudeOf(jd + dt, ra, dec, latDeg, lngDeg) - altitudeOf(jd - dt, ra, dec, latDeg, lngDeg)) /
    (2 * dt)
  );
}

// The Swiss rise/transit/set event nearest the chart instant (search starts a
// bit more than one event period back, then walks forward past jd).
function nearestEvent(
  jd: number,
  bodyId: number,
  eventBits: number,
  lngDeg: number,
  latDeg: number,
): number | null {
  let t = jd - 1.1;
  let best: number | null = null;
  for (let i = 0; i < 6; i++) {
    const r = node.calculateRiseTransitSet(t, bodyId, eventBits, lngDeg, latDeg, 0);
    if (!Number.isFinite(r.time)) break;
    if (best === null || Math.abs(r.time - jd) < Math.abs(best - jd)) best = r.time;
    if (r.time > jd) break;
    t = r.time + 1e-4;
  }
  return best;
}

await initEphemeris();

const birth = (
  name: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tzOffset: number,
  lat = 0,
  lng = 0,
): BirthData => ({
  name,
  year,
  month,
  day,
  hour,
  minute,
  tzOffset,
  birthplace: { label: name, lat, lng },
});

// Battery: the seed chart, a high-declination Moon (2025 major lunar standstill
// window — asserted below, not assumed), the Sun within hours of an equinox
// (exercises the DEC_EPS near-zero-declination tracing path), and J2000.
const CHARTS: BirthData[] = [
  birth('Jim Lewis (seed chart)', 1941, 6, 5, 9, 30, -4, 40.9312, -73.8988),
  birth('standstill Moon', 2025, 3, 7, 18, 0, 0),
  birth('equinox Sun', 2024, 3, 20, 3, 7, 0),
  birth('J2000', 2000, 1, 1, 12, 0, 0),
];

// Bodies that exercise every code path: luminaries, an inner and outer planet,
// the highest-ecliptic-latitude body (Pluto), and both nodes (SouthNode is the
// app-derived antipode, not a Swiss body).
const BODY_SET: PlanetName[] = ['Sun', 'Moon', 'Venus', 'Saturn', 'Pluto', 'NorthNode', 'SouthNode'];
const SWISS_ID: Partial<Record<PlanetName, number>> = {
  Sun: node.Planet.Sun,
  Moon: node.Planet.Moon,
  Venus: node.Planet.Venus,
  Saturn: node.Planet.Saturn,
  Pluto: node.Planet.Pluto,
};

// ── 1–4. Per-chart line geometry ──────────────────────────────────────────────
for (const b of CHARTS) {
  const jd = birthDataToJD(b);
  const gmst = gmstRadians(jd);
  const meridianLng = meridianLngFor('celestial', obliquity(jd), gmst); // the app's own factory
  const all = getPlanetPositions(jd, 'mean');
  const positions = all.filter((p) => BODY_SET.includes(p.name));
  const lines = generateLines(positions, meridianLng);
  const byBody = new Map(positions.map((p) => [p.name, p]));

  if (b.name === 'standstill Moon') {
    const moon = byBody.get('Moon');
    check(
      `${b.name}: Moon |dec| > 25° (standstill battery is meaningful)`,
      !!moon && Math.abs(moon.dec) * RAD2DEG > 25,
      moon ? `dec=${(moon.dec * RAD2DEG).toFixed(2)}°` : 'Moon missing',
    );
  }

  let maxVertexAlt = 0; // on-curve altitude (algebraic consistency)
  let maxSagDeg = 0; // chord-midpoint altitude (what the user actually sees)
  let dirViolations = 0;
  let dirChecked = 0;

  for (const f of lines.features) {
    const { planet, lineType } = f.properties;
    const p = byBody.get(planet)!;
    if (lineType !== 'ASC' && lineType !== 'DSC') continue;
    const coords = f.geometry.coordinates as [number, number][];
    const turnLat = 90 - Math.abs(p.dec) * RAD2DEG; // circumpolar boundary

    for (let i = 0; i < coords.length; i++) {
      const [lng, lat] = coords[i];
      const alt = Math.abs(altitudeOf(jd, p.ra, p.dec, lat, lng));
      if (alt > maxVertexAlt) maxVertexAlt = alt;

      // Sampling sag: evaluate the chord midpoint of each segment against the
      // true horizon. This is the real on-map placement error of the polyline.
      if (i > 0) {
        const [lng0, lat0] = coords[i - 1];
        const midAlt = Math.abs(
          altitudeOf(jd, p.ra, p.dec, (lat0 + lat) / 2, (lng0 + lng) / 2),
        );
        if (midAlt * RAD2DEG > maxSagDeg) maxSagDeg = midAlt * RAD2DEG;
      }

      // Rising/setting direction, away from the turning latitude where the
      // altitude rate legitimately passes through zero.
      if (i % 5 === 0 && Math.abs(lat) < turnLat - 2 && Math.abs(lat) <= 84) {
        dirChecked += 1;
        const slope = altSlope(jd, p.ra, p.dec, lat, lng);
        const wantRising = lineType === 'ASC';
        if ((slope > 0) !== wantRising) dirViolations += 1;
      }
    }
  }

  check(`${b.name}: ASC/DSC vertices on the horizon`, maxVertexAlt < 1e-9, `max |alt| ${fmt(maxVertexAlt)} rad`);
  check(`${b.name}: sampling sag < 0.05°`, maxSagDeg < 0.05, `max midpoint off-horizon ${maxSagDeg.toFixed(4)}°`);
  check(
    `${b.name}: rising on ASC / setting on DSC (${dirChecked} pts)`,
    dirChecked > 50 && dirViolations === 0,
    `${dirViolations} violation(s)`,
  );

  // Swiss's own event finder at mid-latitude line points: a place on the rise
  // line must see the body rise AT the chart instant (geometric, disc-center;
  // residual = topocentric parallax, seconds for planets — Moon checked via the
  // altitude oracle above instead, its ~57′ parallax shifts swe_rise_trans).
  for (const name of ['Sun', 'Venus', 'Saturn'] as PlanetName[]) {
    const p = byBody.get(name);
    if (!p) continue;
    const id = SWISS_ID[name]!;
    for (const side of ['ASC', 'DSC'] as const) {
      const f = lines.features.find(
        (x) => x.properties.planet === name && x.properties.lineType === side,
      )!;
      const v = (f.geometry.coordinates as [number, number][])
        .filter(([, lat]) => Math.abs(lat) < 55)
        .filter((_, i) => i % 23 === 0)
        .slice(0, 3);
      let worst = 0;
      for (const [lng, lat] of v) {
        const bits = (side === 'ASC' ? node.RiseTransitFlag.Rise : node.RiseTransitFlag.Set) | GEOMETRIC;
        const t = nearestEvent(jd, id, bits, normLng(lng), lat);
        const dSec = t === null ? Infinity : Math.abs(t - jd) * 86400;
        if (dSec > worst) worst = dSec;
      }
      check(`${b.name}: swe_rise_trans agrees on ${name} ${side}`, worst < 15, `worst Δ ${worst.toFixed(1)}s`);
    }

    // MC/IC: upper/lower transit instant at a point on the meridian line.
    const mcF = lines.features.find((x) => x.properties.planet === name && x.properties.lineType === 'MC')!;
    const mcLng = (mcF.geometry.coordinates as [number, number][])[0][0];
    const tUp = nearestEvent(jd, id, node.RiseTransitFlag.UpperTransit, normLng(mcLng), 40);
    check(
      `${b.name}: ${name} MC longitude culminates at chart instant`,
      tUp !== null && Math.abs(tUp - jd) * 86400 < 10,
      `Δ ${tUp === null ? 'none' : ((tUp - jd) * 86400).toFixed(1)}s`,
    );
    const icF = lines.features.find((x) => x.properties.planet === name && x.properties.lineType === 'IC')!;
    const icLng = (icF.geometry.coordinates as [number, number][])[0][0];
    const tLo = nearestEvent(jd, id, node.RiseTransitFlag.LowerTransit, normLng(icLng), 40);
    check(
      `${b.name}: ${name} IC longitude anti-culminates at chart instant`,
      tLo !== null && Math.abs(tLo - jd) * 86400 < 10,
      `Δ ${tLo === null ? 'none' : ((tLo - jd) * 86400).toFixed(1)}s`,
    );
  }

  // Vertex-axis lines (VX/AVX): at every vertex the body must stand exactly ON
  // the local prime vertical (azimuth due west for VX, due east for AVX) —
  // checked through an independent azimuth computation, the same oracle family
  // as the rising/setting checks above.
  let worstPV = 0; // |cos az| at the vertices (0 = exactly on the prime vertical)
  let sideErrors = 0;
  for (const f of lines.features) {
    const { planet, lineType } = f.properties;
    if (lineType !== 'VX' && lineType !== 'AVX') continue;
    const p = byBody.get(planet)!;
    for (const [lng, lat] of f.geometry.coordinates as [number, number][]) {
      if (Math.abs(lat) > 84.5) continue; // clip edge
      // Azimuth degenerates at the curve's two endpoints — the body's zenith
      // point (altitude +90°) and its antipode (−90°) — so skip the caps where
      // the oracle itself is undefined; everything between must sit exactly on
      // the prime vertical.
      if (Math.abs(altitudeOf(jd, p.ra, p.dec, lat, lng)) > 88 * DEG2RAD) continue;
      const theta = gastRad(jd) + lng * DEG2RAD;
      const phi = lat * DEG2RAD;
      const H = theta - p.ra;
      const az = Math.atan2(
        -Math.sin(H),
        Math.tan(p.dec) * Math.cos(phi) - Math.cos(H) * Math.sin(phi),
      );
      const offPV = Math.abs(Math.cos(az));
      if (offPV > worstPV) worstPV = offPV;
      // West (sin az < 0) on the Vertex side, east on the Anti-Vertex side.
      const west = Math.sin(az) < 0;
      if ((lineType === 'VX') !== west && Math.abs(Math.sin(az)) > 1e-9) sideErrors += 1;
    }
  }
  check(`${b.name}: VX/AVX vertices on the prime vertical`, worstPV < 1e-9, `max |cos az| ${fmt(worstPV)}`);
  check(`${b.name}: Vertex west / Anti-Vertex east`, sideErrors === 0, `${sideErrors} on the wrong side`);

  // Zenith stamps: the body stands exactly overhead. Measured as the angle
  // between the zenith and body unit vectors via atan2(|cross|, dot) — asin of
  // the dot product is ill-conditioned this close to 90° altitude.
  const stamps = generateZenithStamps(positions, meridianLng);
  let worstZenith = 0;
  for (const s of stamps.features) {
    const p = byBody.get(s.properties.planet)!;
    const [lng, lat] = s.geometry.coordinates;
    const theta = gastRad(jd) + lng * DEG2RAD;
    const phi = lat * DEG2RAD;
    const z = [Math.cos(phi) * Math.cos(theta), Math.cos(phi) * Math.sin(theta), Math.sin(phi)];
    const v = [Math.cos(p.dec) * Math.cos(p.ra), Math.cos(p.dec) * Math.sin(p.ra), Math.sin(p.dec)];
    const cross = [
      z[1] * v[2] - z[2] * v[1],
      z[2] * v[0] - z[0] * v[2],
      z[0] * v[1] - z[1] * v[0],
    ];
    const sep = Math.atan2(Math.hypot(...cross), z[0] * v[0] + z[1] * v[1] + z[2] * v[2]);
    if (sep > worstZenith) worstZenith = sep;
  }
  check(`${b.name}: zenith stamps directly under the body`, worstZenith < 1e-9, `max Δ ${fmt(worstZenith)} rad`);
}

// ── 5. DEC_EPS tracing-switch continuity ──────────────────────────────────────
// The tracer switches algorithms at |tan dec| = 0.05 (hour-angle sweep above,
// latitude sweep below). The two must describe the same curve: compare the
// longitudes they produce at matched latitudes for declinations a hair on
// either side of the threshold.
{
  const gmst = 1.234;
  const meridianLng: MeridianLng = (raM) => ((raM - gmst) * 180) / Math.PI;
  const mk = (dec: number): PlanetPosition => ({ name: 'Sun', ra: 2.1, dec });
  for (const sgn of [1, -1]) {
    const below = generateLines([mk(sgn * Math.atan(0.0499))], meridianLng);
    const above = generateLines([mk(sgn * Math.atan(0.0501))], meridianLng);
    for (const side of ['ASC', 'DSC'] as const) {
      const cb = below.features.find((f) => f.properties.lineType === side)!.geometry.coordinates as [number, number][];
      const ca = above.features.find((f) => f.properties.lineType === side)!.geometry.coordinates as [number, number][];
      // Interpolate each curve's longitude at shared latitudes (both monotonic
      // in latitude away from the apex; near-vertical here, apex off-map).
      const lngAtLat = (coords: [number, number][], lat: number): number | null => {
        for (let i = 1; i < coords.length; i++) {
          const [g0, l0] = coords[i - 1];
          const [g1, l1] = coords[i];
          if ((l0 <= lat && lat <= l1) || (l1 <= lat && lat <= l0)) {
            const t = l1 === l0 ? 0 : (lat - l0) / (l1 - l0);
            return g0 + (g1 - g0) * t;
          }
        }
        return null;
      };
      let worst = 0;
      for (let lat = -80; lat <= 80; lat += 5) {
        const ga = lngAtLat(ca, lat);
        const gb = lngAtLat(cb, lat);
        if (ga === null || gb === null) continue;
        const d = Math.abs(normLng(ga - gb));
        if (d > worst) worst = d;
      }
      check(
        `DEC_EPS switch continuity (${side}, dec ${sgn > 0 ? '+' : '-'})`,
        worst < 0.1,
        `max Δlng ${worst.toFixed(4)}°`,
      );
    }
  }
}

// ── 6. ±180° seam ─────────────────────────────────────────────────────────────
// Drive a synthetic body's lines across the antimeridian; after the tracer's
// unwrap, consecutive longitudes must never jump more than 180°.
{
  const gmst = 0;
  const meridianLng: MeridianLng = (raM) => ((raM - gmst) * 180) / Math.PI;
  const p: PlanetPosition = { name: 'Sun', ra: 179.7 * DEG2RAD, dec: 18 * DEG2RAD };
  const lines = generateLines([p], meridianLng);
  let worstJump = 0;
  for (const f of lines.features) {
    const coords = f.geometry.coordinates as [number, number][];
    for (let i = 1; i < coords.length; i++) {
      const d = Math.abs(coords[i][0] - coords[i - 1][0]);
      if (d > worstJump) worstJump = d;
    }
  }
  check('seam: no >180° longitude jump after unwrap', worstJump <= 180, `max |Δlng| ${worstJump.toFixed(2)}°`);
  check('seam: normLng(-180) → +180', normLng(-180) === 180, `got ${normLng(-180)}`);
}

// ── 7. Geodetic-mode identities ───────────────────────────────────────────────
{
  const jd = birthDataToJD(CHARTS[3]);
  const eps = obliquity(jd);
  // eclipticLonOfRA must be the exact inverse of RA(λ, lat 0).
  let worstInv = 0;
  let counterDiffers = false;
  for (let lonDeg = 0; lonDeg < 360; lonDeg += 0.5) {
    const lam = lonDeg * DEG2RAD;
    const { ra } = eclipticToRaDec(lam, 0, eps);
    const back = eclipticLonOfRA(ra, eps);
    const d = Math.abs(Math.atan2(Math.sin(back - lam), Math.cos(back - lam)));
    if (d > worstInv) worstInv = d;
    // The source NOTE says raDecToEclipticLon(ra, 0, eps) is NOT the inverse —
    // confirm the two formulas genuinely disagree somewhere.
    const wrong = raDecToEclipticLon(ra, 0, eps);
    if (Math.abs(Math.atan2(Math.sin(wrong - lam), Math.cos(wrong - lam))) > 1e-3) counterDiffers = true;
  }
  check('geodetic: eclipticLonOfRA inverts RA(λ,0)', worstInv < 1e-12, `max Δ ${fmt(worstInv)} rad`);
  check('geodetic: raDecToEclipticLon(ra,0,ε) is a different function (NOTE holds)', counterDiffers);

  // Full path: in geodetic mode the Sun's MC line longitude IS its zodiacal
  // longitude (Greenwich = 0° Aries, Sepharial's geodetic equivalents). Through the
  // app's own meridian factory, so this is the mapping the map draws with.
  // (2026-10-02)
  const geodeticLng = meridianLngFor('geodetic', eps, gmstRadians(jd));
  const proj = projectOntoEcliptic(getPlanetPositions(jd, 'mean'), jd);
  const sun = proj.find((p) => p.name === 'Sun')!;
  const lines = generateLines([sun], geodeticLng);
  const mcLng = (lines.features.find((f) => f.properties.lineType === 'MC')!.geometry.coordinates as [number, number][])[0][0];
  const sunEclDeg = raDecToEclipticLon(sun.ra, sun.dec, eps) * RAD2DEG;
  check(
    'geodetic: Sun MC line at Sun zodiacal longitude',
    Math.abs(normLng(mcLng - sunEclDeg)) < 1e-9,
    `Δ ${fmt(Math.abs(normLng(mcLng - sunEclDeg)))}°`,
  );
}

// ── 8. relocate() vs Robert Hand's closed-form ASC/MC ─────────────────────────
// An independent textbook formulation (Hand, Essays on Astrology ch. 12):
//   MC  = atan2(sin RAMC, cos RAMC · cos ε)
//   Asc = atan2(cos RAMC, −(sin RAMC · cos ε + tan φ · sin ε))
// both quadrant-correct, with RAMC = GAST + geographic longitude.
//
// Inside the polar circles the Asc formula can return the WESTERN intersection of
// ecliptic and horizon; the Ascendant is the eastern one, so the oracle picks that
// branch from the point's own azimuth — never from the acmc rule under test. Until
// 2026-10-02 this section stopped at ±60°, where the branch never comes up, so it
// could not see the case; it now runs to ±85° (Placidus falls back to Porphyry
// there, which leaves the MC where it is, so the MC check still means something).
{
  const jd = birthDataToJD(CHARTS[0]);
  const eps = obliquity(jd);
  const gmst = gmstRadians(jd);
  let worstMc = 0;
  let worstAsc = 0;
  let n = 0;
  let swaps = 0;
  let notEast = 0;
  for (const lat of [-85, -80, -75, -70, -60, -45, -23.5, 0, 23.5, 45, 60, 70, 75, 80, 85]) {
    const phi = lat * DEG2RAD;
    for (const lng of [-150, -75, 0, 75, 150]) {
      const ramc = gmst + lng * DEG2RAD;
      // Azimuth (from north, clockwise) of an ecliptic point for this observer; east
      // is sin az > 0.
      const azOf = (lon: number) => {
        const { ra, dec } = eclipticToRaDec(lon, 0, eps);
        const H = ramc - ra;
        return Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(phi) - Math.cos(H) * Math.sin(phi));
      };
      const mcHand = Math.atan2(Math.sin(ramc), Math.cos(ramc) * Math.cos(eps));
      let ascHand = Math.atan2(
        Math.cos(ramc),
        -(Math.sin(ramc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps)),
      );
      if (Math.sin(azOf(ascHand)) < 0) {
        ascHand += Math.PI;
        swaps += 1;
      }
      const h = relocate(jd, lat, lng, 'placidus');
      n += 1;
      if (!(Math.sin(azOf(h.asc)) > 0)) notEast += 1;
      const dMc = Math.abs(Math.atan2(Math.sin(h.mc - mcHand), Math.cos(h.mc - mcHand)));
      const dAsc = Math.abs(Math.atan2(Math.sin(h.asc - ascHand), Math.cos(h.asc - ascHand)));
      if (dMc > worstMc) worstMc = dMc;
      if (dAsc > worstAsc) worstAsc = dAsc;
    }
  }
  check('relocate MC matches Hand closed form', n === 75 && worstMc < 1e-6, `max Δ ${fmt(worstMc)} rad`);
  check('relocate ASC matches Hand closed form (eastern branch)', n === 75 && worstAsc < 1e-6, `max Δ ${fmt(worstAsc)} rad`);
  check('relocate ASC is the eastern point', n === 75 && notEast === 0, `${notEast}/${n} not in the east`);
  check('the polar branch was exercised (the bare formula gave the western point)', swaps > 0, `${swaps}/${n}`);

  // The Vertex against Hand's closed form (Essays on Astrology §I.4):
  //   Vx = arctan(cos RAMC / (cot φ·sin ε − sin RAMC·cos ε))
  // Hand's formula fixes the AXIS; the BRANCH (Vertex vs Anti-Vertex) is a
  // convention — Swiss picks the prime vertical's WESTERN intersection, which
  // we verify directly from the point's azimuth. The Anti-Vertex must be the
  // exact antipode.
  let worstAxis = 0;
  let branchErrors = 0;
  let antipodeErr = 0;
  for (const lat of [-60, -45, -23.5, 23.5, 45, 60]) {
    for (const lng of [-150, -75, 0, 75, 150]) {
      const ramc = gmst + lng * DEG2RAD;
      const h = relocate(jd, lat, lng, 'placidus');
      const handVx = Math.atan2(
        Math.cos(ramc),
        Math.sin(eps) / Math.tan(lat * DEG2RAD) - Math.sin(ramc) * Math.cos(eps),
      );
      const dAxis = Math.abs(Math.atan2(Math.sin(2 * (h.vertex - handVx)), Math.cos(2 * (h.vertex - handVx)))) / 2;
      if (dAxis > worstAxis) worstAxis = dAxis;
      // Branch: the Vertex (an ecliptic point, latitude 0) must stand in the
      // WESTERN half of the local sky (sin az < 0 measuring az from north,
      // clockwise) — computed through the real getAngleCoords path.
      const { ra, dec } = eclipticToRaDec(h.vertex, 0, eps);
      const H = ramc - ra;
      const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(lat * DEG2RAD) - Math.cos(H) * Math.sin(lat * DEG2RAD));
      if (Math.sin(az) > 1e-9) branchErrors += 1;
      const dAnti = Math.abs(Math.atan2(Math.sin(h.antivertex - h.vertex - Math.PI), Math.cos(h.antivertex - h.vertex - Math.PI)));
      if (dAnti > antipodeErr) antipodeErr = dAnti;
    }
  }
  check('Vertex axis matches Hand closed form', worstAxis < 1e-6, `max axis Δ ${fmt(worstAxis)} rad`);
  check('Vertex branch is the western prime-vertical intersection', branchErrors === 0, `${branchErrors}/30 east`);
  check('Anti-Vertex is the exact antipode', antipodeErr < 1e-12, `max Δ ${fmt(antipodeErr)} rad`);

  // Near the equator the prime vertical approaches the celestial equator, so
  // the Vertex collapses toward an equinox point (0° Aries / 0° Libra) — the
  // documented tropics caveat, pinned here as a behavior, not a bug.
  const eq = relocate(jd, 0.001, 0, 'placidus');
  const toEquinox = Math.min(
    Math.abs(Math.atan2(Math.sin(eq.vertex), Math.cos(eq.vertex))),
    Math.abs(Math.atan2(Math.sin(eq.vertex - Math.PI), Math.cos(eq.vertex - Math.PI))),
  );
  check('equatorial Vertex collapses to an equinox point', toEquinox < 0.02, `Δ ${(toEquinox * RAD2DEG).toFixed(3)}°`);
}

// ── 9. Polar-latitude behavior of every supported house system ────────────────
// Above the polar circles, quadrant systems degrade or fail (Hand ch. 12). The
// app must never crash on a polar relocation, whatever Swiss returns. This
// section characterizes (prints) and asserts only survivability + finiteness.
{
  const jd = birthDataToJD(CHARTS[0]);
  const gmst = gmstRadians(jd);
  // A longitude that puts the local RAMC at Hand's 280° test value.
  const lng80 = normLng((280 * DEG2RAD - gmst) * RAD2DEG);
  const systems: HouseSystem[] = [
    'placidus', 'koch', 'regiomontanus', 'campanus', 'porphyry', 'alcabitus',
    'meridian', 'morinus', 'equal', 'whole',
  ];
  for (const sys of systems) {
    let outcome: string;
    let finite = true;
    let flagged = false;
    try {
      const h = relocate(jd, 80, lng80, sys);
      finite = [h.asc, h.mc, ...h.cusps].every(Number.isFinite);
      flagged = !!h.fallback;
      const ascDeg = (h.asc * RAD2DEG).toFixed(2);
      const mcDeg = (h.mc * RAD2DEG).toFixed(2);
      outcome = `asc ${ascDeg}° mc ${mcDeg}°${flagged ? ' (porphyry fallback)' : ''}`;
    } catch (e) {
      outcome = `THROWS: ${(e as Error).message}`;
    }
    console.log(`  polar 80°N RAMC 280° [${sys}] ${outcome}`);
    check(`polar: relocate(80°N, ${sys}) survives with finite angles`, !outcome.startsWith('THROWS') && finite, outcome);
    // The axial systems are genuinely defined polewards — they must come back
    // as themselves, never as a flagged Porphyry substitution.
    if (sys === 'meridian' || sys === 'morinus') {
      check(`polar: ${sys} needs no fallback at 80°N`, !outcome.startsWith('THROWS') && !flagged, outcome);
    }
  }

  // Robert Hand's published cusp table (Essays on Astrology ch. 12; 80°N,
  // RAMC exactly 280°) as an independent golden for the two axial systems —
  // minute-precision values from a 1982-era obliquity, so the tolerance is a
  // few arcminutes. Houses 10/11/12/1/2/3, in degrees:
  const HAND_TABLE: Array<[HouseSystem, number[]]> = [
    // Meridian: 9°Cap11′, 7°Aqu35′, 8°Pis21′, 10°Ari53′, 12°Tau27′, 11°Gem32′
    ['meridian', [279 + 11 / 60, 307 + 35 / 60, 338 + 21 / 60, 10 + 53 / 60, 42 + 27 / 60, 71 + 32 / 60]],
    // Morinus: 10°Cap53′, 12°Aqu27′, 11°Pis32′, 9°Ari11′, 7°Tau35′, 8°Gem22′
    ['morinus', [280 + 53 / 60, 312 + 27 / 60, 341 + 32 / 60, 9 + 11 / 60, 37 + 35 / 60, 68 + 22 / 60]],
  ];
  for (const [sys, want] of HAND_TABLE) {
    const h = relocate(jd, 80, lng80, sys);
    const got = [9, 10, 11, 0, 1, 2].map((i) => h.cusps[i] * RAD2DEG);
    let worst = 0;
    for (let i = 0; i < 6; i++) {
      const d = Math.abs(normLng(got[i] - want[i]));
      if (d > worst) worst = d;
    }
    check(`Hand table golden: ${sys} cusps 10–3 at 80°N RAMC 280°`, worst < 0.2, `max Δ ${worst.toFixed(4)}°`);
  }
  // Sweep the whole sidereal day at 80°N under Placidus — the system Swiss
  // documents as undefined there. Whatever the wrapper does must hold app-wide,
  // and every fallback must be FLAGGED (the wheel shows a caution from it).
  let throws = 0;
  let unflagged = 0;
  for (let ramcDeg = 0; ramcDeg < 360; ramcDeg += 15) {
    const lng = normLng((ramcDeg * DEG2RAD - gmst) * RAD2DEG);
    try {
      const h = relocate(jd, 80, lng, 'placidus');
      if (![h.asc, h.mc, ...h.cusps].every(Number.isFinite)) throws += 1;
      if (!h.fallback) unflagged += 1;
    } catch {
      throws += 1;
    }
  }
  check('polar: Placidus RAMC sweep at 80°N never crashes', throws === 0, `${throws}/24 failures`);
  check('polar: every Porphyry fallback carries the flag', unflagged === 0, `${unflagged}/24 unflagged`);
  // ...and a mid-latitude chart must NOT be flagged.
  check('mid-latitude Placidus is not flagged as fallback', !relocate(jd, 48.4, 9.99, 'placidus').fallback);
}

// ── Rising and setting lines run south→north, whatever the declination ────────────
// INTERNAL-IDENTITY. The map's ASC/DSC arrows ride the line's own direction (→ on ASC,
// ← on DSC), so they point up on a rising line and down on a setting one only when every
// horizon line runs the same way. The hour-angle trace starts at the SOUTH apex only for
// a northern declination; a southern one used to come back north→south, flipping every
// arrow on every body south of the equator. Both signs, both near-zero branches, and
// both sides, at several right ascensions and a geodetic-style meridian mapping.
{
  const DEG = Math.PI / 180;
  const celestial: MeridianLng = (ra) => normLng((ra / DEG) - 100);
  const decs = [23, 5, 0.00001, -0.00001, -5, -23, -28];
  let bad = 0;
  const detail: string[] = [];
  for (const decDeg of decs) {
    for (const raDeg of [0, 77, 190, 301]) {
      for (const side of ['ASC', 'DSC'] as const) {
        const run = traceHorizonCoords({ ra: raDeg * DEG, dec: decDeg * DEG }, celestial, side);
        const first = run[0][1];
        const last = run[run.length - 1][1];
        if (!(first < last)) {
          bad += 1;
          if (detail.length < 4) detail.push(`dec ${decDeg}° ra ${raDeg}° ${side}: ${first.toFixed(1)}→${last.toFixed(1)}`);
        }
      }
    }
  }
  check(
    'horizon lines run south→north for every declination (the ASC/DSC arrows point up/down)',
    bad === 0,
    bad ? detail.join('; ') : `${decs.length * 4 * 2} runs`,
  );
}

// ── The angle codes a reader sees: one funnel, every surface ──────────────────────
// Lina's instruction of 2 Oct 2026, §1: on screen the four angles read AS, MC, DS, IC, in
// that order wherever all four appear. LINE_TYPE_LABEL is the one place a line type
// becomes that text; the tables that key the same codes another way (the angle specs, the
// Sky Times headers) and the plain readings behind the line cards, Radar's Line Notes and
// a report's Influences must say what it says. Two parts asked the same question, so a
// table that drifts — or a reading that prints the raw ASC/DSC again, as the paran and
// aspect readings did until 2026-10-05 — fails here rather than in front of a client.
console.log('\n── Angle codes: one funnel, every surface ──');
{
  check(
    'LINE_TYPE_LABEL gives the instruction’s codes, AS, MC, DS, IC (Vx/Avx for the Vertex axis)',
    JSON.stringify(['ASC', 'MC', 'DSC', 'IC', 'VX', 'AVX'].map((k) => LINE_TYPE_LABEL[k as LineType])) ===
      JSON.stringify(['AS', 'MC', 'DS', 'IC', 'Vx', 'Avx']),
  );
  const specBad = ANGLE_SPECS.filter((s) => s.label !== LINE_TYPE_LABEL[s.lineType]);
  check(
    `each angle spec's label is its line type's label (${ANGLE_SPECS.length} specs)`,
    ANGLE_SPECS.length === 6 && specBad.length === 0,
    specBad.map((s) => `${s.code}: ${s.label} vs ${LINE_TYPE_LABEL[s.lineType]}`).join(', '),
  );
  check(
    'the angle specs run AS, MC, DS, IC, then the Vertex axis',
    ANGLE_SPECS.map((s) => s.label).join(' ') === 'AS MC DS IC Vx Avx',
    ANGLE_SPECS.map((s) => s.label).join(' '),
  );
  const col = en.skyTimes.col;
  check(
    'the Sky Times headers are the lines’ own codes',
    col.rise === LINE_TYPE_LABEL.ASC &&
      col.culminate === LINE_TYPE_LABEL.MC &&
      col.set === LINE_TYPE_LABEL.DSC &&
      col.anticulminate === LINE_TYPE_LABEL.IC,
    `${col.rise} ${col.culminate} ${col.set} ${col.anticulminate}`,
  );

  // The readings, through the real English catalog, for every kind that prints an angle.
  const t = ((key: string, vars?: Record<string, string | number>) =>
    interpolate(resolvePath(en as unknown as Messages, key) ?? key, vars)) as unknown as TFn;
  const cases: [string, string, Record<string, unknown>, string[]][] = [
    ['paran', 'parans-layer', { planetA: 'Venus', planetB: 'Mercury', angleA: 'IC', angleB: 'DSC' }, ['IC', 'DS']],
    ['paran (horizon pair)', 'parans-layer', { planetA: 'Sun', planetB: 'Mars', angleA: 'ASC', angleB: 'MC' }, ['AS', 'MC']],
    ['aspect line', 'angle-lines-layer', { kind: 'aspect', planet: 'Venus', aspect: 'trine', branch: 'DSC', lineType: 'ASC' }, ['DS']],
    ['midpoint line', 'angle-lines-layer', { kind: 'midpoint', planet: 'Sun', planetB: 'Moon', lineType: 'DSC' }, ['DS']],
    ['star line', 'star-lines-layer', { star: 'Regulus', lineType: 'ASC' }, ['AS']],
  ];
  const bad: string[] = [];
  let read = 0;
  for (const [what, layer, props, want] of cases) {
    const r = lineReading(layer, props, t);
    if (!r) {
      bad.push(`${what}: no reading`);
      continue;
    }
    read++;
    const text = `${r.title} | ${r.body}`;
    if (/\b(ASC|DSC)\b/.test(text)) bad.push(`${what} prints a raw code: ${text}`);
    for (const code of want) if (!new RegExp(`\\b${code}\\b`).test(text)) bad.push(`${what} lacks ${code}: ${text}`);
  }
  check(
    `the plain readings print the funnel's codes, never the raw ASC/DSC (${read} of ${cases.length} kinds read)`,
    read === cases.length && bad.length === 0,
    bad.join(' || '),
  );
}

console.log(failures === 0 ? '\nverify-lines: ALL PASS' : `\nverify-lines: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
