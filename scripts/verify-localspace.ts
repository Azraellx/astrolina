// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the LOCAL SPACE math of the real src/lib code (run via the harness:
// `npm run verify:localspace`). Local-space lines are compass bearings: each
// line leaves the origin at the azimuth of a body and follows the great circle.
// Checks, each through an independent route:
//   1. External golden: the Sun's azimuth/altitude against JPL Horizons
//      (airless apparent, azimuth from north clockwise). Horizons is
//      topocentric; the app charts geocentric directions, so the Sun (parallax
//      ~9″) is the right golden body and the tolerance reflects that.
//   2. Bearing-to-zenith: the great-circle NAVIGATION bearing from the origin
//      to the body's sub-point must equal the astronomical azimuth, and the
//      angular distance must equal 90° − altitude — two textbook formulas that
//      share no code or convention with localSpace.ts.
//   3. Geometry: every vertex of both halves lies on the great circle through
//      the origin at that bearing (zero cross-track), and the arc spans the
//      advertised 0.995 × half-Earth.
//   4. Consistency: the line generator and getHorizontalCoords (two separate
//      implementations, equatorial vs ecliptic input) agree on the azimuth.
import {
  birthDataToJD,
  getEclipticPositions,
  getHorizontalCoords,
  getPlanetPositions,
  gmstRadians,
  initEphemeris,
  obliquity,
  projectOntoEcliptic,
  type PlanetName,
} from '../src/lib/ephemeris';
import { generateLocalSpace } from '../src/lib/astro/localSpace';
import type { BirthData } from '../src/lib/birthData';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

const unit = (latDeg: number, lngDeg: number): [number, number, number] => {
  const phi = latDeg * DEG2RAD;
  const lam = lngDeg * DEG2RAD;
  return [Math.cos(phi) * Math.cos(lam), Math.cos(phi) * Math.sin(lam), Math.sin(phi)];
};
const cross = (a: number[], b: number[]): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: number[]) => Math.hypot(a[0], a[1], a[2]);

// Initial great-circle bearing from point 1 to point 2 (navigation formula).
function gcBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const p1 = lat1 * DEG2RAD;
  const p2 = lat2 * DEG2RAD;
  const dl = (lng2 - lng1) * DEG2RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) * RAD2DEG) % 360 + 360) % 360;
}
function gcDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const a = unit(lat1, lng1);
  const b = unit(lat2, lng2);
  return Math.atan2(norm(cross(a, b)), dot(a, b)) * RAD2DEG;
}

await initEphemeris();

// ── 1. External golden: JPL Horizons, Sun over Greenwich latitude ─────────────
// Horizons (https://ssd.jpl.nasa.gov/api/horizons.api) for the Sun, site
// longitude 0.0 / latitude 51.4779 N / 0 m, 2024-06-21 12:00:00 UT, QUANTITIES=4
// "Apparent AZ & EL", airless: azimuth 179.062524°, elevation 61.955375°
// (azimuth measured clockwise from north). Retrieved 2026-06-12.
{
  const b: BirthData = {
    name: 'horizons golden',
    year: 2024,
    month: 6,
    day: 21,
    hour: 12,
    minute: 0,
    tzOffset: 0,
    birthplace: { label: 'Greenwich meridian', lat: 51.4779, lng: 0 },
  };
  const jd = birthDataToJD(b);
  const gmst = gmstRadians(jd);
  const positions = getPlanetPositions(jd, 'mean').filter((p) => p.name === 'Sun');
  const ls = generateLocalSpace(positions, gmst, b.birthplace.lat, b.birthplace.lng);
  const az = ls.features.find((f) => f.properties.direction === 'out')!.properties.azimuth;
  const hc = getHorizontalCoords(
    getEclipticPositions(jd, 'mean'),
    gmst,
    obliquity(jd),
    b.birthplace.lat,
    b.birthplace.lng,
  ).get('Sun')!;
  check('Horizons golden: Sun azimuth', Math.abs(az - 179.062524) < 0.01, `app ${az.toFixed(6)}° vs 179.062524°`);
  check(
    'Horizons golden: Sun altitude',
    Math.abs(hc.alt * RAD2DEG - 61.955375) < 0.01,
    `app ${(hc.alt * RAD2DEG).toFixed(6)}° vs 61.955375°`,
  );
}

// ── 2–4. Full battery at a northern and a southern origin ─────────────────────
const SITES = [
  { label: 'Yonkers 40.93N', lat: 40.9312, lng: -73.8988 },
  { label: 'Sydney 33.87S', lat: -33.8688, lng: 151.2093 },
];
const BODY_SET: PlanetName[] = ['Sun', 'Moon', 'Venus', 'Saturn', 'Pluto', 'NorthNode'];
const CHART: BirthData = {
  name: 'ls battery',
  year: 1941,
  month: 6,
  day: 5,
  hour: 9,
  minute: 30,
  tzOffset: -4,
  birthplace: { label: '', lat: 0, lng: 0 },
};
const jd = birthDataToJD(CHART);
const gmst = gmstRadians(jd);
const eps = obliquity(jd);
const positions = getPlanetPositions(jd, 'mean').filter((p) => BODY_SET.includes(p.name));
const horiz = (lat: number, lng: number) =>
  getHorizontalCoords(getEclipticPositions(jd, 'mean'), gmst, eps, lat, lng);

for (const site of SITES) {
  const ls = generateLocalSpace(positions, gmst, site.lat, site.lng);
  const hc = horiz(site.lat, site.lng);
  let worstBearing = 0;
  let worstDist = 0;
  let worstCrossTrack = 0;
  let worstSpan = 0;
  let worstAzConsistency = 0;

  for (const p of positions) {
    const out = ls.features.find((f) => f.properties.planet === p.name && f.properties.direction === 'out')!;
    const inn = ls.features.find((f) => f.properties.planet === p.name && f.properties.direction === 'in')!;
    const az = out.properties.azimuth;
    const { zenithLat, zenithLng } = out.properties;
    const h = hc.get(p.name)!;

    // Bearing to the sub-point == azimuth; distance == 90° − altitude.
    const dB = Math.abs((((gcBearing(site.lat, site.lng, zenithLat, zenithLng) - az) % 360) + 540) % 360 - 180);
    const dD = Math.abs(gcDistance(site.lat, site.lng, zenithLat, zenithLng) - (90 - h.alt * RAD2DEG));
    if (dB > worstBearing) worstBearing = dB;
    if (dD > worstDist) worstDist = dD;

    // Both halves stay on the bearing's great circle (zero cross-track).
    const u = unit(site.lat, site.lng);
    const phi = site.lat * DEG2RAD;
    const lam = site.lng * DEG2RAD;
    const north = [-Math.sin(phi) * Math.cos(lam), -Math.sin(phi) * Math.sin(lam), Math.cos(phi)];
    const east = [-Math.sin(lam), Math.cos(lam), 0];
    const azr = az * DEG2RAD;
    const dir = [
      Math.cos(azr) * north[0] + Math.sin(azr) * east[0],
      Math.cos(azr) * north[1] + Math.sin(azr) * east[1],
      Math.cos(azr) * north[2] + Math.sin(azr) * east[2],
    ];
    const n = cross(u, dir);
    for (const f of [out, inn]) {
      for (const [vLng, vLat] of f.geometry.coordinates as [number, number][]) {
        const ct = Math.abs(dot(unit(vLat, vLng), n) / norm(n));
        if (ct > worstCrossTrack) worstCrossTrack = ct;
      }
      const coords = f.geometry.coordinates as [number, number][];
      const [eLng, eLat] = coords[coords.length - 1];
      const span = gcDistance(site.lat, site.lng, eLat, eLng);
      // 0.995 of a half-Earth, just short of the antipode.
      const want = 0.995 * 180;
      if (Math.abs(span - want) > worstSpan) worstSpan = Math.abs(span - want);
    }

    // The generator's azimuth (equatorial input) vs getHorizontalCoords
    // (ecliptic input, converted with the true obliquity) — two code paths.
    const dAz = Math.abs(((((h.az * RAD2DEG) - az) % 360) + 540) % 360 - 180);
    if (dAz > worstAzConsistency) worstAzConsistency = dAz;
  }

  check(`${site.label}: bearing to sub-point equals azimuth`, worstBearing < 1e-6, `max Δ ${worstBearing.toExponential(2)}°`);
  check(`${site.label}: sub-point distance equals 90°−alt`, worstDist < 1e-6, `max Δ ${worstDist.toExponential(2)}°`);
  check(`${site.label}: vertices on the bearing great circle`, worstCrossTrack < 1e-9, `max cross-track ${worstCrossTrack.toExponential(2)}`);
  check(`${site.label}: arc spans 0.995 × half-Earth`, worstSpan < 1e-6, `max Δ ${worstSpan.toExponential(2)}°`);
  check(`${site.label}: generator vs getHorizontalCoords azimuth`, worstAzConsistency < 1e-4, `max Δ ${worstAzConsistency.toExponential(2)}°`);
}

// ── 5. Q3a: local space is a true-sky technique (no ecliptic projection) ──────
// The In-Zodiaco / Mundane toggle projects the LINE positions onto the ecliptic
// (zero latitude); local space must NOT inherit that — projecting an off-ecliptic
// body first skews its bearing. Pin that the projected bearing diverges from the
// true-sky one for high-latitude Pluto, so App is right to feed the un-projected
// positions (the true-sky bearing itself is checked against Horizons above).
{
  const site = { lat: 40.9312, lng: -73.8988 };
  const pluto = getPlanetPositions(jd, 'mean').filter((p) => p.name === 'Pluto');
  const azOf = (ps: typeof pluto) =>
    generateLocalSpace(ps, gmst, site.lat, site.lng).features.find(
      (f) => f.properties.direction === 'out',
    )!.properties.azimuth;
  const azTrue = azOf(pluto);
  const azProj = azOf(projectOntoEcliptic(pluto, jd));
  const dAz = Math.abs((((azTrue - azProj) % 360) + 540) % 360 - 180);
  check('Q3a: ecliptic projection skews the bearing (so true-sky positions are used)', dAz > 0.5, `Δ ${dAz.toFixed(3)}° true−vs−projected`);
}

console.log(failures === 0 ? '\nverify-localspace: ALL PASS' : `\nverify-localspace: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
