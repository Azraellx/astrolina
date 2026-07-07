// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the REAL aspect/midpoint line generators (src/lib/astro/
// angleAspects.ts, run via the harness: `npm run verify:aspect-lines`) on the
// positions the app actually feeds them — most pointedly a MIDPOINT chart,
// whose equatorial positions are per-coordinate means carrying their ecliptic
// longitude of record (see composite.ts). What must hold, per measuring frame:
//
//  - zodiaco: the virtual point of every aspect/midpoint derives from the
//    body's zodiacal longitude OF RECORD (the flatten honors the carried
//    longitude) — NEVER from a geometric inversion of the mean ra/dec, which
//    for wide pairs lands whole degrees away (the sentinel below shows the
//    gap it would introduce).
//  - mundo: ASPECT points are the body advanced by ±aspect in ecliptic
//    longitude with its ecliptic LATITUDE retained (both signs are distinct
//    lines and both are drawn), and pair MIDPOINTS are the bodily
//    mean-RA/mean-declination points. Both keep the body off the ecliptic —
//    the convention the composite bodies themselves share.
//  - natal charts: positions carry nothing, so both frames reproduce the
//    long-standing geometric round-trip exactly (verify-angle-aspects.mjs
//    holds the external goldens for that path).
import {
  eclipticToRaDec,
  getPlanetPositions,
  initEphemeris,
  obliquity,
  projectOntoEcliptic,
  raDecToEclipticLon,
  shiftEclipticLongitude,
  type PlanetName,
  type PlanetPosition,
} from '../src/lib/ephemeris';
import {
  generateAspectLines,
  generateMidpointLines,
  type AngleOverlayLineProps,
} from '../src/lib/astro/angleAspects';
import {
  compositeEquatorial,
  solveCompositeFrameJd,
  shortArcMidLon,
} from '../src/lib/astro/composite';
import type { CompositeParents } from '../src/lib/chartLibrary';
import type { Feature, LineString } from 'geojson';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const wrap2pi = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
// Angular difference in degrees, mod 360, mapped to [0, 180].
const angErr = (a: number, b: number) =>
  Math.abs((((a - b + 180) % 360) + 360) % 360 - 180);

// Latitude (deg) where a dense line feature crosses a target longitude (deg),
// linearly interpolated across the first segment that straddles it. Coordinates
// are unwrapped past ±180 for continuity (a horizon curve near 126°E can be
// stored as ≈−234°), so the target is shifted into each segment's world copy
// before testing. Segments that jump the antimeridian (|Δlng| > 180) are skipped.
// NaN if the line never crosses.
function crossingLat(
  feature: Feature<LineString, AngleOverlayLineProps>,
  targetLng: number,
): number {
  const cs = feature.geometry.coordinates;
  for (let i = 1; i < cs.length; i++) {
    const a = cs[i - 1][0];
    const b = cs[i][0];
    if (Math.abs(b - a) > 180 || a === b) continue;
    const t = targetLng - 360 * Math.round((targetLng - a) / 360);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (t >= lo && t <= hi) {
      const f = (t - a) / (b - a);
      return cs[i - 1][1] + f * (cs[i][1] - cs[i - 1][1]);
    }
  }
  return NaN;
}

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

await initEphemeris();

// The composite benchmark pair from verify-composite.mjs (bare de-identified
// moments; positions are geocentric so the place labels are arbitrary).
const parents: CompositeParents = {
  a: {
    name: 'A',
    year: 1959, month: 9, day: 8, hour: 0, minute: 32,
    tzOffset: 0,
    birthplace: { label: '', lat: 0, lng: 0 },
  },
  b: {
    name: 'B',
    year: 1963, month: 9, day: 23, hour: 3, minute: 12,
    tzOffset: 0,
    birthplace: { label: '', lat: 0, lng: 0 },
  },
};

const jdFrame = solveCompositeFrameJd(parents);
const eps = obliquity(jdFrame);
// Celestial meridian mapping with GMST = 0: lng ≡ RA in degrees, so a feature's
// targetLng recovers its virtual point's RA directly (targetLat its dec).
const mer = (ra: number) => ra * RAD2DEG;

const mundo = compositeEquatorial(parents, 'mean');
const flat = projectOntoEcliptic(mundo, jdFrame);
const byName = (ps: PlanetPosition[], n: PlanetName) =>
  ps.find((p) => p.name === n)!;

type AspectFeature = Feature<LineString, AngleOverlayLineProps>;
// The MC-branch feature of a given planet+aspect — its targetLng/targetLat ARE
// the virtual point's sub-point (RA, dec in degrees) under `mer`.
const mcBranch = (fs: AspectFeature[], planet: PlanetName, aspect: string) =>
  fs.find(
    (f) =>
      f.properties.planet === planet &&
      f.properties.kind === 'aspect' &&
      f.properties.branch === 'MC' &&
      f.properties.aspect === aspect,
  )!;

// (1) ZODIACO aspect lines on the midpoint chart: every virtual point must sit
// at (longitude of record + aspect) ON THE ECLIPTIC — the same longitudes the
// wheel shows — not at an inversion of the mean ra/dec.
{
  const fs = generateAspectLines(flat, mer, 'zodiaco', eps).features;
  for (const name of ['Moon', 'Jupiter', 'Saturn', 'Neptune'] as PlanetName[]) {
    const lonMid = byName(mundo, name).lon!; // longitude of record (radians)
    const want = eclipticToRaDec(wrap2pi(lonMid + 90 * DEG2RAD), 0, eps);
    const got = mcBranch(fs, name, 'square');
    check(
      `zodiaco: ${name} square virtual point anchors at lonMid + 90°`,
      angErr(got.properties.targetLng, want.ra * RAD2DEG) < 1e-6 &&
        Math.abs(got.properties.targetLat - want.dec * RAD2DEG) < 1e-6,
      `ΔRA ${angErr(got.properties.targetLng, want.ra * RAD2DEG).toExponential(1)}°`,
    );
  }
  // Sentinel: had the flatten inverted the mean ra/dec instead of honoring the
  // longitude of record, whole aspect-line families would anchor visibly off
  // their wheel longitudes (tens of arcminutes for this pair; grows with the
  // parents' separation) — the failure mode this suite exists to catch. The
  // floor is far above float noise while safely below any real pair's gap.
  const gapDeg = Math.max(
    ...mundo.map((p) => angErr(raDecToEclipticLon(p.ra, p.dec, eps) * RAD2DEG, p.lon! * RAD2DEG)),
  );
  check(
    'sentinel: mean-ra/dec inversion would misplace the aspect lines',
    gapDeg > 0.25,
    `worst body would be off by ${gapDeg.toFixed(2)}°`,
  );
}

// (2) MUNDO aspect lines on the midpoint chart: the virtual point is the body
// advanced by ±aspect in ECLIPTIC LONGITUDE with its latitude retained
// (shiftEclipticLongitude), and BOTH signs are drawn as distinct lines — not an
// RA offset, and never projected onto the ecliptic (latitude 0).
{
  const fs = generateAspectLines(mundo, mer, 'mundo', eps).features;
  for (const name of ['Moon', 'Jupiter', 'Saturn', 'Neptune'] as PlanetName[]) {
    const p = byName(mundo, name);
    // The two square/MC-branch lines are the +90 and −90 latitude-retained points.
    const mcs = fs.filter(
      (f) =>
        f.properties.planet === name &&
        f.properties.kind === 'aspect' &&
        f.properties.branch === 'MC' &&
        f.properties.aspect === 'square',
    );
    const wantRas = [90, -90].map(
      (d) => shiftEclipticLongitude(p, d * DEG2RAD, eps).ra * RAD2DEG,
    );
    check(
      `mundo: ${name} square draws BOTH ± points at the latitude-retained RAs`,
      mcs.length === 2 &&
        wantRas.every((w) =>
          mcs.some((f) => angErr(f.properties.targetLng, w) < 1e-6),
        ),
      `RAs ${mcs.map((f) => f.properties.targetLng.toFixed(2)).join(', ')} vs ${wantRas.map((w) => w.toFixed(2)).join(', ')}`,
    );
  }
}

// (3) MUNDO midpoint lines on the midpoint chart: the pair's virtual point is
// the bodily midpoint — shorter-arc mean RA, plain mean declination — of the
// two composite bodies.
{
  const fs = generateMidpointLines(mundo, mer, 'mundo', eps).features;
  const sun = byName(mundo, 'Sun');
  const moon = byName(mundo, 'Moon');
  const got = fs.find(
    (f) =>
      f.properties.kind === 'midpoint' &&
      f.properties.planet === 'Sun' &&
      f.properties.planetB === 'Moon' &&
      f.properties.lineType === 'MC',
  )!;
  const wantRa = shortArcMidLon(sun.ra, moon.ra) * RAD2DEG;
  const wantDec = ((sun.dec + moon.dec) / 2) * RAD2DEG;
  check(
    'mundo: Su/Mo midpoint line = bodily mean RA + mean declination',
    angErr(got.properties.targetLng, wantRa) < 1e-6 &&
      Math.abs(got.properties.targetLat - wantDec) < 1e-6,
  );
}

// (4) ZODIACO midpoint lines on the midpoint chart: the classic λ-average of
// the two longitudes of record, on the ecliptic.
{
  const fs = generateMidpointLines(flat, mer, 'zodiaco', eps).features;
  const wantLon = shortArcMidLon(
    byName(mundo, 'Sun').lon!,
    byName(mundo, 'Moon').lon!,
  );
  const want = eclipticToRaDec(wantLon, 0, eps);
  const got = fs.find(
    (f) =>
      f.properties.kind === 'midpoint' &&
      f.properties.planet === 'Sun' &&
      f.properties.planetB === 'Moon' &&
      f.properties.lineType === 'MC',
  )!;
  check(
    'zodiaco: Su/Mo midpoint line anchors at the λ-average of record',
    angErr(got.properties.targetLng, want.ra * RAD2DEG) < 1e-6 &&
      Math.abs(got.properties.targetLat - want.dec * RAD2DEG) < 1e-6,
  );
}

// (5) Natal charts are untouched: bare samples carry no longitude of record,
// so the zodiaco flatten reproduces the geometric round-trip of the true
// ra/dec exactly, and the mundo generator reads the same native RA as ever.
{
  const jd = 2447892.5; // 1990-01-01 00:00 UT — arbitrary natal moment
  const natal = getPlanetPositions(jd, 'mean');
  const epsN = obliquity(jd);
  check(
    'natal: samples carry no coordinates of record',
    natal.every((p) => p.lon === undefined && p.lat === undefined),
  );
  const flatN = projectOntoEcliptic(natal, jd);
  const sun = byName(natal, 'Sun');
  const fs = generateAspectLines(flatN, mer, 'zodiaco', epsN).features;
  const got = mcBranch(fs, 'Sun', 'square');
  const want = eclipticToRaDec(
    wrap2pi(raDecToEclipticLon(sun.ra, sun.dec, epsN) + 90 * DEG2RAD),
    0,
    epsN,
  );
  check(
    'natal: zodiacal Sun square anchors at the geometric round-trip + 90°',
    angErr(got.properties.targetLng, want.ra * RAD2DEG) < 1e-6,
  );
}

// (6) MUNDO: the trine draws both ±120 latitude-retained points; each virtual
// point's RA is the ecliptic-longitude shift of the body (NOT RA ± 120, which
// was the old projected-onto-ecliptic convention this replaced).
{
  const fs = generateAspectLines(mundo, mer, 'mundo', eps).features;
  const sun = byName(mundo, 'Sun');
  const mcs = fs.filter(
    (f) =>
      f.properties.planet === 'Sun' &&
      f.properties.kind === 'aspect' &&
      f.properties.branch === 'MC' &&
      f.properties.aspect === 'trine',
  );
  const wantRas = [120, -120].map(
    (d) => shiftEclipticLongitude(sun, d * DEG2RAD, eps).ra * RAD2DEG,
  );
  check(
    'mundo: Sun trine draws both ± points (ecliptic-longitude shift, latitude retained)',
    mcs.length === 2 &&
      wantRas.every((w) => mcs.some((f) => angErr(f.properties.targetLng, w) < 1e-6)),
  );
}

// (7) Regression fixture from an external audit (Solar Fire / Matrix Horizons vs
// AstroLina) of a high-latitude Pluto — the case that exposed the in-mundo bug.
// Pluto RA 169°14′, dec +19°07′ (ecliptic λ ≈ 12°32′ Vir, β ≈ +13°19′); the
// chart's GMST puts Pluto's own MC line at 126°E. The reference programs place
// the aspect point at λ±90 with the planet's latitude RETAINED, which yields four
// square meridians (a pair to the MC and a pair to the IC) and rising/setting
// crossings well off the equator — where the old projected method collapsed them
// to a single meridian (~143°W) and 0°N parans.
{
  const epsL = 23.4367 * DEG2RAD;
  const GMST = 43.2333; // deg — Pluto/MC at 126°E means RA − GMST = 126
  const merL = (ra: number) => {
    const x = ra * RAD2DEG - GMST;
    return ((x + 180) % 360 + 360) % 360 - 180;
  };
  const pluto: PlanetPosition = {
    name: 'Pluto',
    ra: (169 + 14 / 60) * DEG2RAD,
    dec: (19 + 7 / 60) * DEG2RAD,
  };
  const fs = generateAspectLines([pluto], merL, 'mundo', epsL)
    .features as Feature<LineString, AngleOverlayLineProps>[];
  const sqBranch = (branch: string) =>
    fs.filter(
      (f) =>
        f.properties.kind === 'aspect' &&
        f.properties.aspect === 'square' &&
        f.properties.branch === branch,
    );
  const matches = (vals: number[], targets: number[], tol: number) =>
    vals.length === targets.length &&
    targets.every((tg) => vals.some((v) => angErr(v, tg) < tol));

  const mcLngs = sqBranch('MC').map((f) => f.properties.targetLng);
  check(
    'Lina fixture: square/MC meridians at 150.4°W and 25.7°E (both ± points)',
    matches(mcLngs, [-150.4, 25.7], 0.5),
    `got ${mcLngs.map((x) => x.toFixed(1)).join(', ') || '—'}`,
  );
  const icLngs = sqBranch('IC').map((f) => f.properties.targetLng);
  check(
    'Lina fixture: square/IC meridians at 29.6°E and 154.3°W',
    matches(icLngs, [29.6, -154.3], 0.5),
    `got ${icLngs.map((x) => x.toFixed(1)).join(', ') || '—'}`,
  );
  // The headline bug: aspect parans collapsing onto the equator. The +90 point's
  // rising branch (sub-point near 150°W) must cross Pluto's own MC meridian
  // (126°E) near 35°N — not 0°N.
  const ascFeats = sqBranch('ASC');
  const ascPlus = ascFeats.reduce(
    (best, f) =>
      angErr(f.properties.targetLng, -150.4) < angErr(best.properties.targetLng, -150.4)
        ? f
        : best,
    ascFeats[0],
  );
  const latAsc = ascPlus ? crossingLat(ascPlus, 126) : NaN;
  check(
    'Lina fixture: +90 rising branch crosses 126°E near 35°N (not the equator)',
    Number.isFinite(latAsc) && Math.abs(latAsc - 35.1) < 1.5,
    `got ${Number.isFinite(latAsc) ? latAsc.toFixed(1) + '°' : 'no crossing'}`,
  );
}

// ── Overlay frame (one-frame rule) ────────────────────────────────────────────
// While an overlay is active the App feeds these SAME generators the overlay's own
// positions (here a transit set) instead of the natal ones. The math is frame-
// agnostic, so the zodiaco virtual point must still recover the body's longitude ±
// the aspect, and pair midpoints must still generate. (Single-frame SELECTION and the
// Cyclocartography MIDPOINT suppression are App-wiring policy — see
// docs/core-integration-seams.md L23 — not generator math.)
{
  const trJd = jdFrame + 3653; // a distinct transit epoch, same machinery
  const tr = getPlanetPositions(trJd, 'mean');
  const epsTr = obliquity(trJd);
  const merTr = (ra: number) => ra * RAD2DEG; // GMST = 0 → lng ≡ RA°
  const asp = generateAspectLines(tr, merTr, 'zodiaco', epsTr)
    .features as AspectFeature[];
  const sun = byName(tr, 'Sun');
  const sunLon = (raDecToEclipticLon(sun.ra, sun.dec, epsTr) * RAD2DEG + 360) % 360;
  const sunTrineMc = mcBranch(asp, 'Sun', 'trine');
  const vpLon = sunTrineMc
    ? (raDecToEclipticLon(
        sunTrineMc.properties.targetLng * DEG2RAD,
        sunTrineMc.properties.targetLat * DEG2RAD,
        epsTr,
      ) *
        RAD2DEG +
        360) %
      360
    : NaN;
  check(
    'overlay frame: transit Sun trine-MC virtual point = Sun lon + 120° (zodiaco)',
    Number.isFinite(vpLon) && angErr(vpLon, sunLon + 120) < 0.5,
    `vp ${Number.isFinite(vpLon) ? vpLon.toFixed(1) : '—'}° vs ${((sunLon + 120) % 360).toFixed(1)}°`,
  );
  const mids = generateMidpointLines(tr, merTr, 'zodiaco', epsTr)
    .features as AspectFeature[];
  check(
    'overlay frame: transit midpoint lines generate on the overlay set',
    mids.some((f) => f.properties.kind === 'midpoint'),
    `${mids.length} midpoint features`,
  );
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
