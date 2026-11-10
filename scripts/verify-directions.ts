// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the TIME-OVERLAY and RELATIONSHIP math of the real src/lib code (run
// via the harness: `npm run verify:directions`): progression clocks, solar-arc
// and primary-direction arcs and frames, transit framing, synastry framing, and
// the Davison midpoints. Each assertion pins either a textbook identity (the
// day-for-a-year ratio, solar-arc-in-longitude's directed MC = natal MC + arc, the
// RAMC+arc directed angles of the solar-arc and progressed bi-wheels, the classical
// arcs of direction) or a deliberate design equivalence (primary directions are the
// natal sky on a frame advanced by the arc, so every line family the map draws from
// that layer is the natal one carried west by the arc — and the layer has no wheel
// of its own), so any future change of convention has to be made knowingly.
import { createRequire } from 'node:module';
import type { FeatureCollection, LineString } from 'geojson';
import {
  birthDataToJD,
  directedAngles,
  getAngleCoords,
  getPlanetPositions,
  gmstRadians,
  initEphemeris,
  obliquity,
  projectOntoEcliptic,
  raDecToEclipticLon,
  eclipticLonOfRA,
  eclipticToRaDec,
  relocate,
  trueMidnightsAround,
} from '../src/lib/ephemeris';
import type { HouseSystem } from '../src/lib/ephemeris';
import {
  buildOverlay,
  buildSkyOverlay,
  CHARTLESS_OVERLAYS,
  epochMsToJD,
  jdToEpochMs,
  NO_CHART_BLOCKED_OVERLAYS,
  normalizeAngle,
  OVERLAY_MODES,
  overlayBlockFor,
  overlayBlockedFor,
  SKY_HELD_OVERLAYS,
  TIME_UNKNOWN_BLOCKED_OVERLAYS,
  TIMELESS_GEODETIC_OVERLAYS,
} from '../src/lib/astro/timeline';
import type { AngleProgression, OverlayKind, OverlayLayer, PrimaryRate } from '../src/lib/astro/timeline';
import { RANGE_BODIES, isRanged, overlayBirthDateMotion } from '../src/lib/astro/timeless';
import type { PlanetPosition } from '../src/lib/ephemeris';
import { buildDavison } from '../src/lib/astro/relationship';
import { generateEcliptic, generateLines, meridianLngFor } from '../src/lib/astro/lines';
import { generateStarLines, starsOfDate } from '../src/lib/astro/starLines';
import type { BirthData } from '../src/lib/birthData';
import type { StoredChart } from '../src/lib/chartLibrary';
import type { TFn } from '../src/i18n';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const node: any = createRequire(import.meta.url)('@swisseph/node');

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const ARCSEC = 1 / 3600;
const TROPICAL_YEAR_DAYS = 365.2422;
const TROPICAL_MONTH_DAYS = 27.321582;

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}
const t = ((key: string) => key) as unknown as TFn;
const dAng = (a: number, b: number) => Math.abs(normalizeAngle(a - b));

await initEphemeris();

const stored = (b: BirthData): StoredChart => ({ ...b, id: 'verify', createdAt: 0 });
const CHART = stored({
  name: 'Jim Lewis',
  year: 1941, month: 6, day: 5, hour: 9, minute: 30, tzOffset: -4,
  birthplace: { label: 'Yonkers', lat: 40.9312, lng: -73.8988 },
});
const PARTNER = stored({
  name: 'partner',
  year: 1990, month: 5, day: 15, hour: 6, minute: 0, tzOffset: 9,
  birthplace: { label: 'Tokyo', lat: 35.68, lng: 139.69 },
});

const birthJD = birthDataToJD(CHART);
const natalGmst = gmstRadians(birthJD);
const eps = obliquity(birthJD);
const natal = getPlanetPositions(birthJD, 'mean');
// Age ≈ 30: 30 tropical years after birth, in epoch ms.
const target = jdToEpochMs(birthJD + 30 * TROPICAL_YEAR_DAYS);
const targetJD = epochMsToJD(target);
const years = (targetJD - birthJD) / TROPICAL_YEAR_DAYS;

// ── 1. Progression clocks ─────────────────────────────────────────────────────
{
  const sec = buildOverlay(CHART, 'progressed', target, null, 'mean', 'mean-quotidian', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  const wantSec = birthJD + (targetJD - birthJD) / TROPICAL_YEAR_DAYS;
  check('secondary progressed JD: day per tropical year (365.2422)', Math.abs(sec.jd - wantSec) < 1e-9, `Δ ${(sec.jd - wantSec).toExponential(2)} d`);
  check('progressed default frame: natal RAMC held', dAng(sec.gmst, natalGmst) < 1e-12);
  const sunAtProg = getPlanetPositions(sec.jd, 'mean')[0];
  check('progressed positions are the real sky at the progressed instant', dAng(sec.positions[0].ra, sunAtProg.ra) < 1e-12);

  const ter = buildOverlay(CHART, 'progressed', target, null, 'mean', 'mean-quotidian', 'ptolemy', 1, 'relative-to-natal', 'tertiary', t)!;
  const wantTer = birthJD + (targetJD - birthJD) / TROPICAL_MONTH_DAYS;
  check('tertiary progressed JD: day per tropical month (27.321582)', Math.abs(ter.jd - wantTer) < 1e-9, `Δ ${(ter.jd - wantTer).toExponential(2)} d`);

  // Angle-method variants frame the RAMC as documented.
  const naibod = buildOverlay(CHART, 'progressed', target, null, 'mean', 'naibod-ra', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  check('progressed naibod-ra: RAMC advanced 0.985647°/yr', dAng(naibod.gmst, natalGmst + 0.985647 * years * DEG2RAD) < 1e-12);
  const saRa = buildOverlay(CHART, 'progressed', target, null, 'mean', 'sa-ra', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  const arcRA = normalizeAngle(getPlanetPositions(wantSec, 'mean')[0].ra - natal[0].ra);
  check('progressed sa-ra: RAMC advanced by the solar arc in RA', dAng(saRa.gmst, natalGmst + arcRA) < 1e-12);

  // Bi-wheel angle coherence (June 2026 audit fix): the wheel's overlay-ring
  // angles seed from the NATAL moment (angleJd) and are directed by the same
  // arc/frame the map gmst uses. Previously the wheel showed true-quotidian
  // angles (~1°/yr drift) under every method, including "Natal Frame".
  check(
    'progressed default: wheel seeds natal angles, no direction applied',
    Math.abs((sec.angleJd ?? 0) - birthJD) < 1e-9 && sec.angleArc === undefined,
  );
  const saL = buildOverlay(CHART, 'progressed', target, null, 'mean', 'sa-long', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  const sunProgLon = raDecToEclipticLon(getPlanetPositions(wantSec, 'mean')[0].ra, getPlanetPositions(wantSec, 'mean')[0].dec, eps);
  const sunNatalLon = raDecToEclipticLon(natal[0].ra, natal[0].dec, eps);
  const arcLong = normalizeAngle(sunProgLon - sunNatalLon);
  const baseAng = relocate(birthJD, CHART.birthplace.lat, CHART.birthplace.lng, 'placidus');
  const saLDir = directedAngles(baseAng, birthJD, CHART.birthplace.lat, CHART.birthplace.lng, 'placidus', saL.angleArc, saL.angleFrame);
  // The MC is the ONLY angle a longitude arc advances directly: it is a point on
  // the ecliptic, so "the chart shifts in longitude" and "the meridian moves" are
  // the same sentence for it, and for nothing else.
  check(
    'progressed sa-long: directed MC advances by the arc in longitude',
    saL.angleFrame === 'long' && dAng(saLDir.mc, baseAng.mc + arcLong) < 1e-12,
  );
  // The Ascendant does NOT, and until 2026-08-24 this file asserted that it did —
  // `dAng(saLDir.asc, baseAng.asc + arcLong) < 1e-12`, pinning what the code was
  // doing. Solar Fire and Sirius both contradict it, and the app's own printed table
  // was internally inconsistent: it gave the directed Ascendant a right ascension no
  // Ascendant could have at this latitude. The Ascendant is not a linear function of
  // the RAMC, so adding the arc to its longitude names a point that does not rise
  // against the directed meridian — 15° away at age 85 here. It must be re-derived
  // from the RAMC that culminates the directed MC. (Lina's ruling, 24 Aug 2026.)
  const advRamc = eclipticToRaDec(normalizeAngle(baseAng.mc + arcLong), 0, eps).ra;
  const fromRamc = relocate(
    birthJD, CHART.birthplace.lat, ((advRamc - natalGmst) * 180) / Math.PI, 'placidus',
  );
  check(
    'progressed sa-long: directed ASC is derived from the directed MC, not arc-shifted',
    dAng(saLDir.asc, fromRamc.asc) < 1e-12,
    `the retired convention sits ${(dAng(baseAng.asc + arcLong, fromRamc.asc) * RAD2DEG).toFixed(2)}° away`,
  );

  // Cusps are part of the directed angle set, not leftovers from the natal one.
  // `directedAngles` used to omit them entirely, so every directed overlay carried a
  // directed Ascendant glued to twelve NATAL cusps. That is invisible on a quadrant
  // wheel except as a stray first-house spoke — but WheelSvg INFERS whole sign from
  // the cusps and anchors the wheel on cusps[0], so it drew the whole directed chart
  // on the natal rising sign.
  const QUADRANT: HouseSystem[] = ['placidus', 'koch', 'regiomontanus', 'campanus', 'porphyry'];
  for (const [name, layer] of [['sa-long', saL], ['sa-ra', saRa], ['naibod-ra', naibod]] as const) {
    let worstQ = 0;
    for (const sys of QUADRANT) {
      const b = relocate(birthJD, CHART.birthplace.lat, CHART.birthplace.lng, sys);
      const d = directedAngles(b, birthJD, CHART.birthplace.lat, CHART.birthplace.lng, sys, layer.angleArc, layer.angleFrame);
      worstQ = Math.max(
        worstQ,
        dAng(d.cusps[0], d.asc), dAng(d.cusps[3], d.ic),
        dAng(d.cusps[6], d.dsc), dAng(d.cusps[9], d.mc),
      );
    }
    check(`${name}: directed cusps 1/4/7/10 are the directed angles`, worstQ < 1e-9,
      `max Δ ${(worstQ * RAD2DEG * 3600).toFixed(3)}″ over ${QUADRANT.length} quadrant systems`);

    // Whole sign is detected by every cusp lying on a sign boundary (WheelSvg's 1e-6
    // rad test). A rigid +arc would walk them off it and silently flip the wheel to
    // quadrant layout mid-overlay, so the cusps have to come from the house engine.
    const bw = relocate(birthJD, CHART.birthplace.lat, CHART.birthplace.lng, 'whole');
    const dw = directedAngles(bw, birthJD, CHART.birthplace.lat, CHART.birthplace.lng, 'whole', layer.angleArc, layer.angleFrame);
    const offBoundary = Math.max(...dw.cusps.map((c) => {
      const m = ((c % (Math.PI / 6)) + Math.PI / 6) % (Math.PI / 6);
      return Math.min(m, Math.PI / 6 - m);
    }));
    check(`${name}: directed whole-sign cusps stay on their sign boundaries`, offBoundary < 1e-6);
    check(`${name}: directed whole-sign wheel anchors on the DIRECTED rising sign`,
      dAng(dw.cusps[0], Math.floor(dw.asc / (Math.PI / 6)) * (Math.PI / 6)) < 1e-9);
  }

  // ── The invariant that would have caught all of this ────────────────────────
  // An Ascendant is ON the horizon; a Midheaven is ON the meridian. Read the directed
  // angles back through the shipped horizontal-coordinate path, in the overlay's OWN
  // map frame. That last part is what gives it teeth: it fails if the angles are wrong
  // (defect 1), if the map frame is wrong (defect 2), or if the two were derived at
  // different meridians — which is exactly how the two defects differed. Before
  // 2026-08-24 this read −16.7° of altitude under sa-long and −17.4° under naibod-long.
  // naibod-long is built here rather than reused, because the comment above quotes its
  // pre-fix reading and a loop that skipped it would promise coverage it wasn't giving.
  const naibodLong = buildOverlay(CHART, 'progressed', target, null, 'mean', 'naibod-long', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  for (const [name, layer] of [
    ['sa-long', saL], ['naibod-long', naibodLong], ['sa-ra', saRa], ['naibod-ra', naibod],
  ] as const) {
    const dir = directedAngles(
      baseAng, birthJD, CHART.birthplace.lat, CHART.birthplace.lng, 'placidus',
      layer.angleArc, layer.angleFrame,
    );
    const ac = getAngleCoords(dir, layer.gmst, eps, CHART.birthplace.lat, CHART.birthplace.lng);
    const lst = layer.gmst + CHART.birthplace.lng * DEG2RAD;
    check(`${name}: the directed ASC sits on its own horizon`,
      Math.abs(ac.asc.alt) * RAD2DEG < 1e-9, `alt ${(ac.asc.alt * RAD2DEG).toFixed(6)}°`);
    check(`${name}: the directed MC sits on its own meridian`,
      dAng(lst, ac.mc.ra) * RAD2DEG < 1e-9, `hour angle ${(dAng(lst, ac.mc.ra) * RAD2DEG).toFixed(6)}°`);
  }

  // The map frame's anchor, pinned. `-long` must culminate the directed MC at the
  // CHART'S OWN meridian; anchoring at Greenwich (or at the map pin) fails this.
  check(
    'progressed sa-long: the map frame culminates the directed MC at the birth meridian',
    dAng(saL.gmst + CHART.birthplace.lng * DEG2RAD, advRamc) < 1e-12,
  );
  // …and Δλ = 0 must round-trip to the natal frame exactly, through the new local form.
  const saL0 = buildOverlay(CHART, 'progressed', jdToEpochMs(birthJD), null, 'mean', 'sa-long', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  const nai0 = buildOverlay(CHART, 'progressed', jdToEpochMs(birthJD), null, 'mean', 'naibod-long', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  check('longitude methods at age 0: frame is the natal RAMC exactly',
    dAng(saL0.gmst, natalGmst) < 1e-12 && dAng(nai0.gmst, natalGmst) < 1e-12);

  // The `-ra` frame is anchor-INDEPENDENT — the true half of the Greenwich rule. Assert
  // it at meridians the chart has nothing to do with, so a future "tidy-up" that gives
  // the RA methods a birthplace term too gets caught.
  {
    let worstRa = 0;
    for (const [lat, lng] of [[0, 0], [51.5, -0.1], [-33.9, 151.2], [69.6, 18.96]] as const) {
      const b = relocate(birthJD, lat, lng, 'placidus');
      const d = directedAngles(b, birthJD, lat, lng, 'placidus', saRa.angleArc, saRa.angleFrame);
      worstRa = Math.max(worstRa, dAng(eclipticLonOfRA(saRa.gmst + lng * DEG2RAD, eps), d.mc));
    }
    check('sa-ra: the map frame culminates the directed MC at EVERY meridian',
      worstRa * RAD2DEG < 1e-9, `max Δ ${(worstRa * RAD2DEG).toExponential(2)}°`);
  }

  // ── One overlay, one instant (Lina's tertiary ruling, 24 Aug 2026) ──────────
  // The tertiary clock used to reach the BODIES only: the angle arc was measured to
  // the secondary-progressed Sun, so a tertiary chart carried tertiary planets against
  // secondary angles, and its angles were byte-identical to the secondary overlay's at
  // the same date. Solar Fire and Sirius both put them on the tertiary instant.
  const sunLonAt = (jd: number) => {
    const p = getPlanetPositions(jd, 'mean').find((x) => x.name === 'Sun')!;
    return raDecToEclipticLon(p.ra, p.dec, eps);
  };
  const natalSunLon = sunLonAt(birthJD);
  const terOf = (ap: AngleProgression) =>
    buildOverlay(CHART, 'tertiary-progressed', target, null, 'mean', ap, 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  const terSaL = terOf('sa-long');
  check(
    'tertiary sa-long: the angle arc is the Sun\'s travel to the TERTIARY instant',
    dAng(terSaL.angleArc ?? 0, normalizeAngle(sunLonAt(wantTer) - natalSunLon)) < 1e-12,
    `${((terSaL.angleArc ?? 0) * RAD2DEG).toFixed(2)}°`,
  );
  check(
    'tertiary angles are no longer the secondary angles at the same date',
    dAng(terSaL.angleArc ?? 0, saL.angleArc ?? 0) * RAD2DEG > 1,
    `tertiary ${((terSaL.angleArc ?? 0) * RAD2DEG).toFixed(2)}° vs secondary ${((saL.angleArc ?? 0) * RAD2DEG).toFixed(2)}°`,
  );
  // Naibod is a mean RATE, so it follows the same instant: 0.985647° per progressed
  // day. Wrapped, because an arc is a rotation and only the residue means anything —
  // and the tertiary hand comes all the way round every 27.32 years of life. That
  // period is exact rather than approximate: a full turn takes 360/0.985647 = 365.24
  // progressed days (a tropical year of them), and each progressed day is a tropical
  // month of life, so the period in YEARS is the tropical month in DAYS.
  const terNai = terOf('naibod-ra');
  check(
    'tertiary naibod: the same mean rate over the TERTIARY interval, wrapped',
    dAng(terNai.angleArc ?? 0, normalizeAngle((wantTer - birthJD) * 0.985647 * DEG2RAD)) < 1e-12,
    `${((terNai.angleArc ?? 0) * RAD2DEG).toFixed(2)}° over ${(wantTer - birthJD).toFixed(1)} progressed days`,
  );
  check(
    'secondary naibod is untouched by the tertiary fix',
    dAng(naibod.angleArc ?? 0, 0.985647 * years * DEG2RAD) < 1e-12,
  );
  // The point of the ruling, stated as an invariant: whatever clock an overlay runs,
  // the instant its bodies are read at is the instant its angle arc is measured to.
  for (const [name, layer, progJd] of [
    ['secondary', saL, wantSec], ['tertiary', terSaL, wantTer],
  ] as const) {
    check(`${name}: bodies and angle arc share one instant`,
      Math.abs(layer.jd - progJd) < 1e-9 &&
        dAng(layer.angleArc ?? 0, normalizeAngle(sunLonAt(layer.jd) - natalSunLon)) < 1e-12);
  }
}

// ── 2. Solar arc ──────────────────────────────────────────────────────────────
{
  const sa = buildOverlay(CHART, 'solar-arc', target, null, 'mean', 'sa-long', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  // The arc, re-derived directly from Swiss ecliptic longitudes (one code path
  // fewer than the app's RA/dec→longitude route, and using each instant's own
  // frame) — also quantifies the natal-epsilon simplification.
  const FLAG = node.CalculationFlag.SwissEphemeris | node.CalculationFlag.Speed;
  const progJD = birthJD + years;
  const lonN = node.calculatePosition(birthJD, node.Planet.Sun, FLAG).longitude;
  const lonP = node.calculatePosition(progJD, node.Planet.Sun, FLAG).longitude;
  const arcSwiss = normalizeAngle((lonP - lonN) * DEG2RAD);
  // The applied arc is the layer's angleArc (radians).
  const arcApplied = sa.angleArc!;
  check(
    'solar arc equals the progressed Sun\'s longitude travel',
    dAng(arcApplied, arcSwiss) * RAD2DEG < 0.5 * ARCSEC,
    `Δ ${((dAng(arcApplied, arcSwiss) * RAD2DEG) / ARCSEC).toFixed(3)}″ (natal-ε simplification)`,
  );
  // The Sun's real daily motion spans ~0.953°/day (aphelion, early July — which
  // a June birth's progressed month lands on) to ~1.019°/day (perihelion).
  check('solar arc within the Sun\'s real rate band (0.95–1.03°/yr)', arcApplied * RAD2DEG / years > 0.95 && arcApplied * RAD2DEG / years < 1.03, `${(arcApplied * RAD2DEG / years).toFixed(4)}°/yr`);

  // Directed MC = natal MC + arc (longitude frame), through directedAngles.
  const natalAngles = relocate(birthJD, CHART.birthplace.lat, CHART.birthplace.lng, 'placidus');
  const saDir = directedAngles(natalAngles, birthJD, CHART.birthplace.lat, CHART.birthplace.lng, 'placidus', sa.angleArc, sa.angleFrame);
  check('directed MC = natal MC + arc (sa-long)', dAng(saDir.mc, natalAngles.mc + arcApplied) < 1e-12);
  // Bodies shifted by the same arc in longitude.
  const dSun = dAng(raDecToEclipticLon(sa.positions[0].ra, sa.positions[0].dec, eps), raDecToEclipticLon(natal[0].ra, natal[0].dec, eps) + arcApplied);
  check('directed bodies shifted by the same arc (sa-long)', dSun < 1e-9, `Δ ${dSun.toExponential(2)} rad`);

  // Age 0 → arc 0 (the directed chart IS the natal chart at birth).
  const sa0 = buildOverlay(CHART, 'solar-arc', jdToEpochMs(birthJD), null, 'mean', 'sa-long', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  check('solar arc at age 0 is 0', Math.abs(sa0.angleArc ?? 0) < 1e-9);
}

// ── 3. Primary directions ─────────────────────────────────────────────────────
// The layer is THE NATAL SKY ON AN ADVANCED FRAME (2026-11-10): the bodies keep their natal
// places and the frame turns, gmst = natal RAMC + arc. So the arc is read off the frame,
// `layer.gmst − natal gmst`, and every family the map draws from the layer is the natal family
// carried WEST by exactly the arc. (Until then the bodies were moved by −arc in RA against the
// natal frame. That drew the same In Mundo body lines and nothing else the same: In Zodiaco
// projected the moved body, and the stars and the ecliptic line stayed where they were.)
//
// Four parts, and they are not the same KIND of check (§8's header draws the line):
//  (a) the arc of every time-key. Internal for the fixed keys. For the two Solar Daily Motion
//      keys the day of birth is found here a SECOND way — bisection on the Sun's hour angle,
//      the Sun read straight from Swiss — and the layer's rate must be the Sun's travel over it;
//  (b) the layer's shape. Internal;
//  (c) the map. TWO PARTS AGREE: the lines built from the layer the way the app's overlay frame
//      builds them, against the natal lines built in the natal frame and moved west by the arc;
//  (d) the classical arcs. An INTERNAL IDENTITY: the arc at which the layer's own drawn line
//      reaches the birthplace is the textbook arc of direction. The closed forms are restated
//      here, so (d) passes on a wrong ephemeris; what it pins is that the line the map draws
//      IS the classical direction, in both projections. Its three figures to two decimals are
//      pinned beside it, so a change of convention has to be made knowingly.
{
  const PD = 'primary-directions' as const;
  const pdOf = (rate: PrimaryRate, user = 1, at = target, chart: StoredChart = CHART) =>
    buildOverlay(chart, PD, at, null, 'mean', 'mean-quotidian', rate, user, 'relative-to-natal', 'secondary', t)!;
  // The applied arc, degrees, read off the layer's own frame.
  const arcOf = (layer: OverlayLayer, baseGmst = natalGmst) => normalizeAngle(layer.gmst - baseGmst) * RAD2DEG;
  const wrapDeg = (d: number) => normalizeAngle(d * DEG2RAD) * RAD2DEG;
  // The Sun straight from Swiss, degrees: a second read beside the app's sampling layer.
  const FLAG = node.CalculationFlag.SwissEphemeris | node.CalculationFlag.Speed;
  const FLAG_EQ = FLAG | node.CalculationFlag.Equatorial;
  const sunEq = (jd: number) => {
    const s = node.calculatePosition(jd, node.Planet.Sun, FLAG_EQ);
    return { ra: s.longitude as number, dec: s.latitude as number };
  };
  const sunLonDeg = (jd: number) => node.calculatePosition(jd, node.Planet.Sun, FLAG).longitude as number;
  const utc = (jd: number) => new Date(jdToEpochMs(jd)).toISOString().replace('T', ' ').replace('Z', ' UT');

  // ── (a) The arc of every time-key ───────────────────────────────────────────
  // A Record over PrimaryRate, so a key added to the type has to be given its arc here.
  const sunRaTravel = wrapDeg(sunEq(birthJD + years).ra - sunEq(birthJD).ra);
  const FIXED: Record<Exclude<PrimaryRate, 'kepler-ra' | 'solar-long'>, { label: string; layer: OverlayLayer; want: number }> = {
    ptolemy: { label: 'Ptolemy key: arc = 1°/yr × years', layer: pdOf('ptolemy'), want: years },
    naibod: { label: 'Naibod key: 0.985647°/yr', layer: pdOf('naibod'), want: 0.985647 * years },
    cardan: { label: 'Cardan key: 0.986667°/yr', layer: pdOf('cardan'), want: 0.986667 * years },
    user: { label: 'user key 2°/yr honored', layer: pdOf('user', 2), want: 2 * years },
    'placidus-ra': {
      label: 'Placidus key: the secondary-progressed Sun\'s travel in RA (birth → birth + one day per year)',
      layer: pdOf('placidus-ra'), want: sunRaTravel,
    },
  };
  for (const { label, layer, want } of Object.values(FIXED)) {
    const got = arcOf(layer);
    check(label, Math.abs(got - want) < 1e-9, `${got.toFixed(6)}° at ${years.toFixed(4)} yr, Δ ${(got - want).toExponential(2)}°`);
  }
  check('the keys really differ at age 30 (else one arc would satisfy them all)',
    new Set(Object.values(FIXED).map((f) => arcOf(f.layer).toFixed(4))).size === Object.keys(FIXED).length,
    Object.entries(FIXED).map(([k, f]) => `${k} ${arcOf(f.layer).toFixed(4)}°`).join(', '));

  // The two Solar Daily Motion keys: the Sun's travel over the DAY OF BIRTH, the day running
  // between the two true midnights (the Sun's lower culminations) that bound the birth moment
  // at the birthplace. Found here independently of the app's solver: the Sun's hour angle at the
  // place, less π, wrapped, rises through zero once a day; step back from the birth moment by the
  // fraction of a turn it shows, bracket, bisect.
  const dayOfBirth = (jd: number, lngDeg: number) => {
    const g = (at: number) => normalizeAngle(gmstRadians(at) + lngDeg * DEG2RAD - sunEq(at).ra * DEG2RAD - Math.PI);
    const root = (guess: number) => {
      let lo = guess - 0.02;
      let hi = guess + 0.02;
      if (!(g(lo) < 0 && g(hi) > 0)) return NaN;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (g(mid) < 0) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    };
    const since = ((g(jd) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI); // turns since the last one
    const before = root(jd - since);
    const after = root(before + 1);
    return {
      before, after,
      ra: wrapDeg(sunEq(after).ra - sunEq(before).ra),
      lon: wrapDeg(sunLonDeg(after) - sunLonDeg(before)),
    };
  };
  // The hour angle of the Sun as the APP reads it (its own sampling layer, not this suite's).
  const appHourAngle = (jd: number, lngDeg: number) => {
    const sun = getPlanetPositions(jd, 'mean').find((p) => p.name === 'Sun')!;
    return gmstRadians(jd) + lngDeg * DEG2RAD - sun.ra;
  };
  const sunAlt = (jd: number, latDeg: number, lngDeg: number) => {
    const s = sunEq(jd);
    const H = gmstRadians(jd) + lngDeg * DEG2RAD - s.ra * DEG2RAD;
    const phi = latDeg * DEG2RAD;
    const dec = s.dec * DEG2RAD;
    return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)) * RAD2DEG;
  };
  const { lat: bLat, lng: bLng } = CHART.birthplace;
  const day = dayOfBirth(birthJD, bLng);
  const offPi = Math.max(
    Math.abs(normalizeAngle(appHourAngle(day.before, bLng) - Math.PI)),
    Math.abs(normalizeAngle(appHourAngle(day.after, bLng) - Math.PI)),
  );
  check('day of birth: two true midnights bracket the birth moment, a day apart, the Sun\'s hour angle π at each',
    day.before < birthJD && birthJD < day.after &&
      day.after - day.before > 0.99 && day.after - day.before < 1.01 && offPi < 1e-6,
    `${utc(day.before)} → ${utc(day.after)} (${(day.after - day.before).toFixed(6)} d), hour angle off π by ${offPi.toExponential(2)} rad`);
  // A second reading of "midnight" that owes nothing to the hour angle's zero: the Sun is under
  // the horizon there and lower than ten minutes either side.
  const TEN_MIN = 10 / 1440;
  check('day of birth: at each midnight the Sun is below the horizon and at its lowest',
    [day.before, day.after].every((m) => {
      const a = sunAlt(m, bLat, bLng);
      return a < 0 && a < sunAlt(m - TEN_MIN, bLat, bLng) && a < sunAlt(m + TEN_MIN, bLat, bLng);
    }),
    `altitude ${sunAlt(day.before, bLat, bLng).toFixed(3)}° and ${sunAlt(day.after, bLat, bLng).toFixed(3)}°`);
  const appDay = trueMidnightsAround(birthJD, bLng);
  const dSec = Math.max(Math.abs(appDay.before - day.before), Math.abs(appDay.after - day.after)) * 86400;
  check('day of birth: the app\'s two midnights are the bisected ones (within 0.01 s)', dSec < 0.01, `max Δ ${dSec.toExponential(2)} s`);
  const keplerRate = arcOf(pdOf('kepler-ra')) / years;
  const solarLongRate = arcOf(pdOf('solar-long')) / years;
  check('Solar Daily Motion in RA: the rate is the Sun\'s RA travel between the two true midnights',
    Math.abs(keplerRate - day.ra) < 1e-7, `${keplerRate.toFixed(7)}°/yr vs ${day.ra.toFixed(7)}° over the day, Δ ${(keplerRate - day.ra).toExponential(2)}°`);
  check('Solar Daily Motion in longitude: the rate is the Sun\'s longitude travel between the same two',
    Math.abs(solarLongRate - day.lon) < 1e-7, `${solarLongRate.toFixed(7)}°/yr vs ${day.lon.toFixed(7)}° over the day, Δ ${(solarLongRate - day.lon).toExponential(2)}°`);
  check('the two solar keys are two rates (RA and longitude travel differ over the day)',
    Math.abs(keplerRate - solarLongRate) > 1e-3, `RA ${keplerRate.toFixed(5)}°, longitude ${solarLongRate.toFixed(5)}°`);
  // The day is the BIRTHPLACE's. Move the place a third of the way round the Earth with the
  // birth moment held: other midnights bound the moment, the rates move with them, and both
  // parts must follow. A rate read at the birth instant, or at Greenwich, fails this.
  {
    const FAR: StoredChart = { ...CHART, birthplace: { ...CHART.birthplace, lng: bLng + 120 } };
    const farDay = dayOfBirth(birthJD, bLng + 120);
    const farRa = arcOf(pdOf('kepler-ra', 1, target, FAR)) / years;
    const farLon = arcOf(pdOf('solar-long', 1, target, FAR)) / years;
    check('the day of birth is the birthplace\'s: moved 120° east, other midnights bound the same moment and both rates follow',
      birthDataToJD(FAR) === birthJD && farDay.before < birthJD && birthJD < farDay.after &&
        Math.abs(farDay.before - day.before) > 0.3 &&
        Math.abs(farRa - farDay.ra) < 1e-7 && Math.abs(farLon - farDay.lon) < 1e-7 &&
        Math.abs(farRa - keplerRate) > 1e-6 && Math.abs(farLon - solarLongRate) > 1e-6,
      `${utc(farDay.before)} → ${utc(farDay.after)}: RA ${farRa.toFixed(7)}° (was ${keplerRate.toFixed(7)}°), longitude ${farLon.toFixed(7)}° (was ${solarLongRate.toFixed(7)}°)`);
  }

  // ── (b) The layer is the natal sky on an advanced frame ─────────────────────
  const pd = FIXED.ptolemy.layer;
  const arcDeg = arcOf(pd);
  const TEN = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
  const isNatal = (layer: OverlayLayer) =>
    layer.positions.length === natal.length &&
    layer.positions.every((p, i) => p.name === natal[i].name && p.ra === natal[i].ra && p.dec === natal[i].dec);
  check('primary: every body stands at its natal RA and declination, exactly, under every key',
    natal.length >= TEN.length && TEN.every((n) => pd.positions.some((p) => p.name === n)) &&
      [...Object.values(FIXED).map((f) => f.layer), pdOf('kepler-ra'), pdOf('solar-long')].every(isNatal),
    `${pd.positions.length} bodies`);
  check('primary: the layer is read at the birth moment, and its catalog bodies are sampled there',
    pd.jd === birthJD && pd.bodyRule.by === 'sample' && pd.bodyRule.jd === birthJD,
    `bodyRule ${JSON.stringify(pd.bodyRule)}`);
  check('primary: no directed angles ride the layer (no angleArc, no angleFrame)',
    pd.angleArc === undefined && pd.angleFrame === undefined);
  // What is left of "the directed MC advances": the frame's RAMC does, by the arc.
  check('primary: the frame advances — its RAMC is the natal one plus the arc, forward',
    arcDeg > 0 && Math.abs(arcDeg - years) < 1e-9, `+${arcDeg.toFixed(4)}° at age ${years.toFixed(1)}`);
  const pd0 = pdOf('ptolemy', 1, jdToEpochMs(birthJD));
  check('primary at age 0: the natal sky on the natal frame', isNatal(pd0) && dAng(pd0.gmst, natalGmst) < 1e-12);
  // The set that tells the wheel side "no chart of its own" against the builder, which knows
  // nothing of the set: build every mode at age 30, and the layers whose bodies are the natal
  // bodies unmoved are the ones with no second set of positions to show.
  {
    const unmoved = OVERLAY_MODES.filter((m) => {
      const layer = buildOverlay(CHART, m, target, PARTNER, 'mean', 'mean-quotidian', 'ptolemy', 1, 'relative-to-natal',
        m === 'tertiary-progressed' ? 'tertiary' : 'secondary', t);
      return !!layer && isNatal(layer);
    });
    check('the chartless set is exactly the modes whose layer carries the natal bodies unmoved',
      OVERLAY_MODES.length > unmoved.length && unmoved.length === CHARTLESS_OVERLAYS.size &&
        unmoved.every((m) => CHARTLESS_OVERLAYS.has(m)) && CHARTLESS_OVERLAYS.has(PD),
      `unmoved: ${unmoved.join(', ') || 'none'} of ${OVERLAY_MODES.length}`);
  }

  // ── (c) The map: every family is the natal one, the arc west ────────────────
  // The natal side in the natal frame; the layer's side as the app's overlay frame builds it —
  // the layer's own positions, instant and gmst through the same meridian mapping.
  const mlNatal = meridianLngFor('celestial', eps, natalGmst);
  const mlLayer = meridianLngFor('celestial', obliquity(pd.jd), pd.gmst);
  const circ = (d: number) => {
    const m = Math.abs(d) % 360; // the true circular distance (a seam-wrap reads ~360 raw)
    return Math.min(m, 360 - m);
  };
  type Lines = FeatureCollection<LineString>;
  // Vertex by vertex: natal longitude − arc against the layer's, latitude against latitude.
  // `moved` is the least distance any vertex actually travelled, so a pair of identical
  // collections (an arc that reached neither side) cannot pass; `n` fails an empty set.
  const carried = (natalFc: Lines, layerFc: Lines) => {
    const bad = { n: 0, vertices: 0, worst: Infinity, moved: 0 };
    if (natalFc.features.length !== layerFc.features.length) return bad;
    let worst = 0;
    let moved = Infinity;
    let vertices = 0;
    for (let i = 0; i < natalFc.features.length; i++) {
      const a = natalFc.features[i].geometry.coordinates;
      const b = layerFc.features[i].geometry.coordinates;
      if (a.length !== b.length) return bad;
      if (JSON.stringify(natalFc.features[i].properties) !== JSON.stringify(layerFc.features[i].properties)) return bad;
      for (let k = 0; k < a.length; k++) {
        worst = Math.max(worst, circ(a[k][0] - arcDeg - b[k][0]), Math.abs(a[k][1] - b[k][1]));
        moved = Math.min(moved, circ(a[k][0] - b[k][0]));
        vertices++;
      }
    }
    return { n: natalFc.features.length, vertices, worst, moved };
  };
  const report = (label: string, r: ReturnType<typeof carried>, minFeatures: number) =>
    check(label, r.n >= minFeatures && r.vertices > 0 && r.worst < 1e-9 && Math.abs(r.moved - arcDeg) < 1e-9,
      `${r.n} lines, ${r.vertices} vertices, max vertex Δ ${r.worst.toExponential(2)}°, every vertex moved ${r.moved.toFixed(6)}°`);

  const mundoNatal = generateLines(natal, mlNatal);
  const mundoLayer = generateLines(pd.positions, mlLayer);
  const planetsDrawn = new Set(mundoLayer.features.map((f) => f.properties.planet as string));
  check('primary map: all ten planets are drawn from the layer', TEN.every((n) => planetsDrawn.has(n)), `${planetsDrawn.size} bodies`);
  // Four angle lines a body at least (plus the Vertex-axis runs).
  report('primary map, In Mundo: every body line is the natal line, the arc west', carried(mundoNatal, mundoLayer), TEN.length * 4);

  const zodNatalPos = projectOntoEcliptic(natal, birthJD);
  const zodLayer = generateLines(projectOntoEcliptic(pd.positions, pd.jd), mlLayer);
  report('primary map, In Zodiaco: the natal degree\'s lines, the arc west (project the natal body, then turn)',
    carried(generateLines(zodNatalPos, mlNatal), zodLayer), TEN.length * 4);
  // The two projections have to be two things on this chart, or the In Zodiaco row above is the
  // In Mundo row again; and the retired construction — move the body in RA, THEN project — is
  // pinned as the thing that must not come back, by how far its meridian lines stood off.
  {
    const mcLng = (fc: Lines) =>
      new Map(fc.features.filter((f) => f.properties?.lineType === 'MC')
        .map((f) => [f.properties!.planet as string, f.geometry.coordinates[0][0]]));
    const apart = (a: Map<string, number>, b: Map<string, number>) => {
      let worst = 0;
      let who = 'none';
      for (const n of TEN) {
        const d = circ((a.get(n) ?? NaN) - (b.get(n) ?? NaN));
        if (!(d <= worst)) { worst = d; who = n; }
      }
      return { worst, who };
    };
    const proj = apart(mcLng(mundoLayer), mcLng(zodLayer));
    check('primary map: In Mundo and In Zodiaco are different lines on this chart', proj.worst > 0.5,
      `MC lines up to ${proj.worst.toFixed(2)}° apart (${proj.who})`);
    const arcRad = arcDeg * DEG2RAD;
    const retired = generateLines(
      projectOntoEcliptic(natal.map((p) => ({ ...p, ra: p.ra - arcRad })), birthJD), mlNatal);
    const old = apart(mcLng(retired), mcLng(zodLayer));
    check('primary map, In Zodiaco: the retired construction (move the body, then project) is not what is drawn',
      old.worst > 0.5, `its MC lines stood up to ${old.worst.toFixed(2)}° off (${old.who})`);
  }

  const starsNatal = generateStarLines(starsOfDate(birthJD, 'all'), mlNatal, null, '#fff');
  const starsLayer = generateStarLines(starsOfDate(pd.jd, 'all'), mlLayer, null, '#fff');
  report('primary map: every fixed-star line is the natal one, the arc west', carried(starsNatal, starsLayer), 20);
  report('primary map: the ecliptic line is the natal one, the arc west',
    carried(generateEcliptic(birthJD, mlNatal), generateEcliptic(pd.jd, mlLayer)), 1);

  // ── (d) The classical arcs, off the drawn line (an internal identity) ───────
  // A second chart: 7 September 1937, 10:58 CST, Saint Louis, True Node. For each direction the
  // arc is FOUND on the map — the layer rebuilt under the Ptolemy key at the date whose arc is
  // the trial value, its line generated as in (c), bisected until the line stands on the
  // birthplace — and then read off that layer's own frame. It must be the textbook arc:
  //   the Sun to the Midheaven         α☉ − RAMC
  //   Mars to the Ascendant, In Mundo   α − SA − RAMC, SA = acos(−tan φ · tan δ)
  //   the same, In Zodiaco              as above for the point (λ♂, β = 0)
  // A drawn horizon line is a run of vertices, so its longitude AT the birthplace's latitude is
  // read by polynomial interpolation through the six vertices nearest it (the vertices lie on
  // the curve exactly, about a degree apart; a straight chord between two would be ~0.002° out).
  {
    const dms = (d: number, m: number, s: number) => d + m / 60 + s / 3600;
    const DAVIS = stored({
      name: 'Martin Davis',
      year: 1937, month: 9, day: 7, hour: 10, minute: 58, tzOffset: -6,
      birthplace: { label: 'Saint Louis', lat: dms(38, 37, 31), lng: -dms(90, 11, 24) },
    });
    const dJD = birthDataToJD(DAVIS);
    const dGmst = gmstRadians(dJD);
    const dEps = obliquity(dJD);
    const dNatal = getPlanetPositions(dJD, 'true');
    const phi = DAVIS.birthplace.lat * DEG2RAD;
    const ramc = dGmst + DAVIS.birthplace.lng * DEG2RAD;
    const layerAt = (arc: number) =>
      buildOverlay(DAVIS, PD, jdToEpochMs(dJD + arc * TROPICAL_YEAR_DAYS), null, 'true', 'mean-quotidian', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
    const lngAtLat = (coords: number[][], lat: number) => {
      const near = [...coords].sort((a, b) => Math.abs(a[1] - lat) - Math.abs(b[1] - lat)).slice(0, 6);
      const x = near.map((c) => c[1]);
      const p = near.map((c) => c[0]);
      for (let m = 1; m < x.length; m++) { // Neville
        for (let i = 0; i < x.length - m; i++) {
          p[i] = ((lat - x[i + m]) * p[i] + (x[i] - lat) * p[i + 1]) / (x[i] - x[i + m]);
        }
      }
      return p[0];
    };
    // The longitude where a body's line of one type stands at the birthplace's latitude, drawn
    // from the layer as the app draws it in the given projection.
    const lineLng = (layer: OverlayLayer, body: string, type: 'MC' | 'ASC', zodiaco: boolean) => {
      const pos = (zodiaco ? projectOntoEcliptic(layer.positions, layer.jd) : layer.positions).filter((p) => p.name === body);
      const f = generateLines(pos, meridianLngFor('celestial', obliquity(layer.jd), layer.gmst))
        .features.find((x) => x.properties.lineType === type);
      if (!f || f.geometry.coordinates.length < 6) return NaN;
      return type === 'MC' ? f.geometry.coordinates[0][0] : lngAtLat(f.geometry.coordinates, DAVIS.birthplace.lat);
    };
    const arcToBirthplace = (body: string, type: 'MC' | 'ASC', zodiaco: boolean) => {
      const off = (arc: number) => wrapDeg(lineLng(layerAt(arc), body, type, zodiaco) - DAVIS.birthplace.lng);
      let lo = 0;
      let hi = 90;
      if (!(off(lo) > 0 && off(hi) < 0)) return NaN; // the line starts east of the place and is carried west past it
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if (off(mid) > 0) lo = mid; else hi = mid;
      }
      const at = layerAt((lo + hi) / 2);
      return Math.abs(off((lo + hi) / 2)) < 1e-9 ? arcOf(at, dGmst) : NaN;
    };
    const turn = (rad: number) => ((rad * RAD2DEG) % 360 + 360) % 360;
    const dSun = dNatal.find((p) => p.name === 'Sun')!;
    const dMars = dNatal.find((p) => p.name === 'Mars')!;
    const semiArc = (dec: number) => Math.acos(-Math.tan(phi) * Math.tan(dec));
    // Mars' degree straight from Swiss (not through the app's RA/dec → longitude route).
    const marsLon = (node.calculatePosition(dJD, node.Planet.Mars, FLAG).longitude as number) * DEG2RAD;
    const marsZod = eclipticToRaDec(marsLon, 0, dEps);
    const CASES = [
      { label: 'the Sun to the Midheaven: α☉ − RAMC', got: arcToBirthplace('Sun', 'MC', false),
        want: turn(dSun.ra - ramc), printed: 15.19 },
      { label: 'Mars to the Ascendant, In Mundo: α − SA − RAMC', got: arcToBirthplace('Mars', 'ASC', false),
        want: turn(dMars.ra - semiArc(dMars.dec) - ramc), printed: 35.58 },
      { label: 'Mars to the Ascendant, In Zodiaco: the same for (λ♂, β = 0)', got: arcToBirthplace('Mars', 'ASC', true),
        want: turn(marsZod.ra - semiArc(marsZod.dec) - ramc), printed: 33.25 },
    ];
    for (const c of CASES) {
      check(`classical arc off the drawn line — ${c.label}`, Math.abs(c.got - c.want) < 1e-6,
        `line reaches the birthplace at ${c.got.toFixed(5)}°, closed form ${c.want.toFixed(5)}°, Δ ${(c.got - c.want).toExponential(2)}°`);
      check(`…and it is ${c.printed.toFixed(2)}° (±0.005)`, Math.abs(c.got - c.printed) <= 0.005, `${c.got.toFixed(5)}°`);
    }
    check('the two projections give Mars two different arcs (the In Zodiaco row is not the In Mundo row again)',
      Math.abs(CASES[1].got - CASES[2].got) > 1, `${(CASES[1].got - CASES[2].got).toFixed(2)}° apart`);
  }
}

// ── 4. Transit frames ─────────────────────────────────────────────────────────
{
  const rel = buildOverlay(CHART, 'transits', target, null, 'mean', 'mean-quotidian', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  check('transits relative-to-natal: natal RAMC', dAng(rel.gmst, natalGmst) < 1e-12);
  const mom = buildOverlay(CHART, 'transits', target, null, 'mean', 'mean-quotidian', 'ptolemy', 1, 'transit-moment', 'secondary', t)!;
  check('transits transit-moment: the instant\'s RAMC', dAng(mom.gmst, gmstRadians(targetJD)) < 1e-12);
  const sunNow = getPlanetPositions(targetJD, 'mean')[0];
  check('transit positions are the real sky either way', dAng(rel.positions[0].ra, sunNow.ra) < 1e-12 && dAng(mom.positions[0].ra, sunNow.ra) < 1e-12);
}

// ── 5. Cyclocartography body split ────────────────────────────────────────────
{
  const cy = buildOverlay(CHART, 'cyclo', target, null, 'mean', 'mean-quotidian', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  const progJD = birthJD + years;
  const sunProg = getPlanetPositions(progJD, 'mean').find((p) => p.name === 'Sun')!;
  const jupNow = getPlanetPositions(targetJD, 'mean').find((p) => p.name === 'Jupiter')!;
  const cySun = cy.positions.find((p) => p.name === 'Sun')!;
  const cyJup = cy.positions.find((p) => p.name === 'Jupiter')!;
  check('cyclo: Sun progressed / Jupiter transiting', dAng(cySun.ra, sunProg.ra) < 1e-12 && dAng(cyJup.ra, jupNow.ra) < 1e-12);
  // bodyJd lists ONLY the progressed inners; the transiting outers inherit the
  // layer's jd (the transit instant) by design.
  check(
    'cyclo: per-body epochs — inners progressed, outers on layer jd',
    Math.abs((cy.bodyJd?.Sun ?? 0) - progJD) < 1e-9 && cy.bodyJd?.Jupiter === undefined && Math.abs(cy.jd - targetJD) < 1e-9,
  );
  check('cyclo: natal frame', dAng(cy.gmst, natalGmst) < 1e-12);
}

// ── 6. Synastry framing ───────────────────────────────────────────────────────
{
  const sy = buildOverlay(CHART, 'synastry', target, PARTNER, 'mean', 'mean-quotidian', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  const pjd = birthDataToJD(PARTNER);
  const pSun = getPlanetPositions(pjd, 'mean')[0];
  check('synastry: partner positions at partner instant', Math.abs(sy.jd - pjd) < 1e-9 && dAng(sy.positions[0].ra, pSun.ra) < 1e-12);
  check('synastry: partner\'s own RAMC (their ACG overlaid)', dAng(sy.gmst, gmstRadians(pjd)) < 1e-12);
}

// ── 7. Davison midpoints ──────────────────────────────────────────────────────
{
  const dav = buildDavison(CHART, PARTNER);
  const jdMid = (birthDataToJD(CHART) + birthDataToJD(PARTNER)) / 2;
  check('Davison: time midpoint (minute-snapped)', Math.abs(birthDataToJD(dav) - jdMid) * 86400 <= 30.5, `Δ ${(Math.abs(birthDataToJD(dav) - jdMid) * 86400).toFixed(1)}s`);
  check('Davison: tz stored as UT', dav.tzOffset === 0);
  check('Davison: latitude arithmetic mean', Math.abs(dav.birthplace.lat - (CHART.birthplace.lat + PARTNER.birthplace.lat) / 2) < 1e-9);

  // Longitude midpoint goldens, incl. the antimeridian pair.
  const at = (lngA: number, lngB: number) =>
    buildDavison(
      { ...CHART, birthplace: { ...CHART.birthplace, lng: lngA } },
      { ...PARTNER, birthplace: { ...PARTNER.birthplace, lng: lngB } },
    ).birthplace.lng;
  check('Davison lng: (+170, −170) → ±180 (shorter arc, not 0)', Math.abs(Math.abs(at(170, -170)) - 180) < 1e-9, `got ${at(170, -170)}`);
  check('Davison lng: (10, 30) → 20', Math.abs(at(10, 30) - 20) < 1e-9, `got ${at(10, 30)}`);
  check('Davison lng: (−10, 30) → 10', Math.abs(at(-10, 30) - 10) < 1e-9, `got ${at(-10, 30)}`);
}

// ── 8. External audit: agreement with Solar Fire ──────────────────────────────
// Sections 1–7 pin INTERNAL identities — relations the app must satisfy against
// itself. This one is different in kind: it pins agreement with an outside authority
// on printed chart data, and it fails for a different reason. An internal assertion
// breaking means the code contradicts itself; this breaking means the code is
// self-consistent and wrong, which is the failure that survived here for months.
//
// Provenance: Lina's verification of the progressed overlays against Solar Fire,
// 24–25 Aug 2026. Both programs agree on the natal chart to the arcminute, which is
// what makes the directed comparison meaningful.
//
// This is the case that exposed defect 1 most sharply. The Ascendant error is 31° here
// against 15° on the Jim Lewis chart above, because the arc lands in a part of the
// zodiac where the Ascendant moves fast — so a fix that lands both is well tested.
//
// Footnote from the same audit, deliberately not asserted: Solar Fire labels the zone
// CST on a date when Saint Paul is on CDT, putting the two progressed instants 1h03m
// apart in real time. On a secondary progression that is ~2.5 seconds of progressed
// time, which is why the Suns agree exactly and Jupiter differs by one arcminute. It
// would matter on a technique whose angles run fast.
{
  const dms = (d: number, m: number, s: number) => d + m / 60 + s / 3600;
  const SP = stored({
    name: 'Saint Paul 1972',
    year: 1972, month: 11, day: 12, hour: 11, minute: 7, tzOffset: -6,
    birthplace: { label: 'Saint Paul MN', lat: dms(44, 56, 59), lng: -dms(93, 5, 35) },
  });
  const spJD = birthDataToJD(SP);
  const spTarget = Date.UTC(2026, 7, 23, 12, 0, 0);
  const zod = (sign: string, d: number, m: number) =>
    ((['Ari', 'Tau', 'Gem', 'Can', 'Leo', 'Vir', 'Lib', 'Sco', 'Sag', 'Cap', 'Aqu', 'Pis']
      .indexOf(sign) * 30) + d + m / 60) * DEG2RAD;
  // Tolerance: one arcminute. Tighter than the zone footnote above would justify, and
  // it holds — the point of an external golden is that it is not fitted to us.
  const ARCMIN = DEG2RAD / 60;
  const near = (a: number, b: number) => dAng(a, b) < ARCMIN;
  const fmt = (r: number) => `${(dAng(r, 0) * RAD2DEG * 60).toFixed(2)}′`;

  const spNatal = relocate(spJD, SP.birthplace.lat, SP.birthplace.lng, 'placidus');
  check('Saint Paul natal MC = 7°57′ Sco (Solar Fire)', near(spNatal.mc, zod('Sco', 7, 57)),
    `Δ ${fmt(spNatal.mc - zod('Sco', 7, 57))}`);
  check('Saint Paul natal ASC = 9°32′ Cap (Solar Fire)', near(spNatal.asc, zod('Cap', 9, 32)),
    `Δ ${fmt(spNatal.asc - zod('Cap', 9, 32))}`);

  const spL = buildOverlay(SP, 'progressed', spTarget, null, 'mean', 'sa-long', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  const spDir = directedAngles(
    spNatal, spL.angleJd ?? spL.jd, SP.birthplace.lat, SP.birthplace.lng, 'placidus',
    spL.angleArc, spL.angleFrame,
  );
  // The arc, measured off the two printed MCs rather than reconstructed.
  check('Saint Paul sa-long arc = 54.58° (natal MC → progressed MC, both printed)',
    Math.abs((spL.angleArc ?? 0) * RAD2DEG - 54.58) < 0.02,
    `${((spL.angleArc ?? 0) * RAD2DEG).toFixed(2)}°`);
  check('Saint Paul directed MC = 2°32′ Cap (Solar Fire)', near(spDir.mc, zod('Cap', 2, 32)),
    `Δ ${fmt(spDir.mc - zod('Cap', 2, 32))}`);
  check('Saint Paul directed ASC = 5°18′ Ari (Solar Fire)', near(spDir.asc, zod('Ari', 5, 18)),
    `Δ ${fmt(spDir.asc - zod('Ari', 5, 18))}`);

  // The retired convention, pinned as the thing that must NOT come back: it reproduced
  // AL's printed 4°08′ Pis to the arcminute, 31° from where the Ascendant belongs.
  const retired = normalizeAngle(spNatal.asc + (spL.angleArc ?? 0));
  check('Saint Paul: `natal ASC + arc` still reproduces the old wrong value (4°08′ Pis)',
    near(retired, zod('Pis', 4, 8)), `Δ ${fmt(retired - zod('Pis', 4, 8))}`);
  check('…and it is 31° from the Solar Fire Ascendant',
    Math.abs(dAng(retired, zod('Ari', 5, 18)) * RAD2DEG - 31.18) < 0.1,
    `${(dAng(retired, zod('Ari', 5, 18)) * RAD2DEG).toFixed(2)}°`);
}

// ── 9. The arc-separation bound ───────────────────────────────────────────────
// A standing check Lina asked to keep after a 22.47° separation turned out to be a
// misreading. The longitude arc and the RA arc are the SAME Sun over the SAME interval,
// read in two coordinates, so their difference is the reduction to the ecliptic — which
// peaks near 2.47° (at λ=45°, α=42.53°). An arc is a difference of two such conversions,
// so the two coordinates can separate by at most about 4.9°, for any chart at any age.
// This refutes a large claimed separation without reference to any particular chart.
{
  let worst = 0;
  let worstAt = '';
  for (let month = 1; month <= 12; month++) {
    for (const age of [20, 40, 60, 85]) {
      const probe = stored({
        name: 'probe', year: 1970, month, day: 15, hour: 12, minute: 0, tzOffset: 0,
        birthplace: { label: 'Greenwich', lat: 51.48, lng: 0 },
      });
      const at = Date.UTC(1970 + age, month - 1, 15, 12, 0, 0);
      const mk = (ap: AngleProgression) =>
        (buildOverlay(probe, 'progressed', at, null, 'mean', ap, 'ptolemy', 1, 'relative-to-natal', 'secondary', t)?.angleArc ?? 0) * RAD2DEG;
      const sep = Math.abs(mk('sa-ra') - mk('sa-long'));
      if (sep > worst) { worst = sep; worstAt = `month ${month}, age ${age}`; }
    }
  }
  check('longitude and RA arcs never separate by more than ~4.9°',
    worst < 4.95, `max ${worst.toFixed(2)}° (${worstAt}) over 48 chart/age combinations`);
}

// ── 10. Which overlays a chart and a map can carry ────────────────────────────
// Three parts, all read through overlayBlockFor, the one predicate behind the Overlay
// menu, the 'o' cycle and App's effective overlay: (a) primary directions held on a
// geodetic map; (b) a chart with no birth time on a geodetic map (Lina's §15, 20 Oct
// 2026); (c) no chart at all (2026-10-20).
//
// (a) Primary directions held on a geodetic map.
// An internal rule, like §§1–7 (2026-10-02). Primary directions move the map by
// advancing the RAMC, the sky turning over the place, and a geodetic map doesn't turn
// (lib/skyHold), so the Overlay menu greys the mode there with the sky sentence and the
// effective overlay reads it as off. Pinned: (a) it is the ONLY mode the map holds —
// every other technique moves the planets by degree; (b) the chart's own blocks outrank
// the map's, because the geodetic reason names a fix ("switch to Celestial") that would
// be false on a chart that bars the mode anyway.
//
// Deliberately NOT here: "overlayBlockedFor agrees with overlayBlockFor". The one is
// defined as the other `!== null`, so that check could not fail and only restated the
// code. The agreement worth having is between two consumers — the effective overlay mode
// App derives and the Overlay menu's greyed row, read under the same line system — and
// it belongs with the App wiring that passes them the line system.
{
  const TIMELESS = { ...CHART, timeKnown: false };
  const COMPOSITE = { ...CHART, composite: {} };
  const DAVISON = { ...CHART, tag: 'space' };
  const PD = 'primary-directions' as const;
  check('geodetic: primary directions read as held (\'geodetic\')',
    overlayBlockFor(CHART, 'geodetic')(PD) === 'geodetic');
  check('celestial: primary directions not held',
    overlayBlockFor(CHART, 'celestial')(PD) === null);
  check('no line system given: reads as celestial, holds nothing',
    overlayBlockFor(CHART)(PD) === null && !overlayBlockedFor(CHART)(PD));
  check('the held set is primary directions alone',
    SKY_HELD_OVERLAYS.size === 1 && SKY_HELD_OVERLAYS.has(PD));
  const heldOnGeo = OVERLAY_MODES.filter((m) => overlayBlockFor(CHART, 'geodetic')(m) !== null);
  check('geodetic, timed natal chart: every other overlay stays available',
    OVERLAY_MODES.length > 1 && heldOnGeo.length === 1 && heldOnGeo[0] === PD,
    `held: ${heldOnGeo.join(', ') || 'none'} of ${OVERLAY_MODES.length}`);
  check('geodetic + composite: the composite reason outranks the map\'s',
    overlayBlockFor(COMPOSITE, 'geodetic')(PD) === 'composite');
  check('geodetic + unknown birth time: the no-time reason outranks the map\'s',
    overlayBlockFor(TIMELESS, 'geodetic')(PD) === 'no-time');
  check('geodetic + Davison: synastry keeps its own reason, primary directions the map\'s',
    overlayBlockFor(DAVISON, 'geodetic')('synastry') === 'davison' &&
      overlayBlockFor(DAVISON, 'geodetic')(PD) === 'geodetic');
  // Until 2026-10-20 this read "no chart: the map's hold still answers". With no chart,
  // 'no-chart' now outranks the map's reason on both maps, for the same reason the chart's
  // own blocks do: "switch to Celestial" is no fix for a technique with nothing to direct.
  check('no chart: the no-chart reason outranks the map\'s, on both maps',
    overlayBlockFor(null, 'geodetic')(PD) === 'no-chart' && overlayBlockFor(null, 'celestial')(PD) === 'no-chart');
}

// (b) A chart with no birth time on a geodetic map (Lina's ruling §15, 20 Oct 2026).
// The progressions, solar arc and Cyclocartography come off the time-unknown block on a
// geodetic map, where a place's angles come from its coordinates and the overlays advance only
// the planets' degrees; primary directions stay blocked, and Celestial is unchanged. The first
// group is internal rules.
//
// The rest is TWO PARTS AGREE (Lina's one range rule for an overlay, 22 Oct 2026, §2.3). An
// overlay's lines are banded by the overlay's own motion over the birth date, which
// lib/astro/timeless overlayBirthDateMotion reads by rebuilding the overlay with the birth HOUR
// moved across the date — every third hour and the last midnight — and reading each body's
// longitude at the tilt App hands it. This suite moves the birth its own way: by the OFFSET
// (tzOffset − h moves the birth's UT by +h hours, the civil fields untouched), every hour from
// the date's first midnight to its last, each body read at its layer's own obliquity. The two
// must find the same extent for every body of every lifted overlay. If they disagreed, a
// progressed or directed band would not be where the line can be — and the range rule's
// consequences must show: the progressed Moon is ranged, Cyclo's transiting outer bodies (read
// at the overlay's own moment, which no birth hour moves) are not.
// (Until 22 Oct this held each overlay body under the NATAL band's fixed half-width, which the
// range rule retired: an overlay's range is its own now, not the chart's.)
{
  const TIMELESS = { ...CHART, timeKnown: false };
  const COMPOSITE_TIMELESS = { ...CHART, composite: {}, timeKnown: false };
  // Cyclocartography joined on 21 Oct 2026 (Lina, question 6).
  const LIFTED = ['progressed', 'tertiary-progressed', 'solar-arc', 'cyclo'] as const;
  check('the geodetic lift is the progressions, solar arc and Cyclocartography, nothing else',
    TIMELESS_GEODETIC_OVERLAYS.size === LIFTED.length && LIFTED.every((m) => TIMELESS_GEODETIC_OVERLAYS.has(m)),
    `set: ${[...TIMELESS_GEODETIC_OVERLAYS].join(', ')}`);
  check('every lifted mode is one the time-unknown block bars (else the lift is a no-op)',
    [...TIMELESS_GEODETIC_OVERLAYS].every((m) => TIME_UNKNOWN_BLOCKED_OVERLAYS.has(m)));
  const geo = overlayBlockFor(TIMELESS, 'geodetic');
  const cel = overlayBlockFor(TIMELESS, 'celestial');
  const freeOnGeo = LIFTED.filter((m) => geo(m) === null);
  check('timeless chart on geodetic: progressed, tertiary, solar arc and Cyclocartography are available',
    freeOnGeo.length === LIFTED.length, `available: ${freeOnGeo.join(', ') || 'none'}`);
  check('timeless chart on geodetic: primary directions still \'no-time\' (outranking the sky hold)',
    geo('primary-directions') === 'no-time');
  check('timeless chart on geodetic: Cyclo is available (question 6), on Celestial still \'no-time\'',
    geo('cyclo') === null && cel('cyclo') === 'no-time');
  const blockedOnCel = [...TIME_UNKNOWN_BLOCKED_OVERLAYS].filter((m) => cel(m) === 'no-time');
  check('timeless chart on Celestial: every time-unknown block stands',
    TIME_UNKNOWN_BLOCKED_OVERLAYS.size > 0 && blockedOnCel.length === TIME_UNKNOWN_BLOCKED_OVERLAYS.size,
    `'no-time': ${blockedOnCel.join(', ')}`);
  check('timeless chart, no line system given: reads as Celestial, lifts nothing',
    LIFTED.every((m) => overlayBlockFor(TIMELESS)(m) === 'no-time'));
  check('timeless chart on geodetic: transits, eclipses and synastry unaffected',
    (['transits', 'eclipses', 'synastry'] as const).every((m) => geo(m) === null && cel(m) === null));
  check('a timeless composite keeps the composite reason on geodetic',
    LIFTED.every((m) => overlayBlockFor(COMPOSITE_TIMELESS, 'geodetic')(m) === 'composite'));

  // The agreement check. Jim Lewis, recast with the time unknown (noon placeholder; UTC−4 with
  // no zone, so his birth date is the 24 hours either side of noon), at ages 30 and 60.
  const NOON: StoredChart = { ...CHART, hour: 12, minute: 0, timeKnown: false };
  const noonJD = birthDataToJD(NOON);
  // The tilt App hands the library on a geodetic map: the chart's own obliquity (geoEps).
  const geoEps = obliquity(noonJD);
  const lonOf = (p: PlanetPosition, layer: OverlayLayer) =>
    p.lon ?? raDecToEclipticLon(p.ra, p.dec, obliquity(layer.jd));
  // Built as App builds the layer (its progression clock from the mode).
  const mk = (c: StoredChart, kind: OverlayKind, at: number) =>
    buildOverlay(c, kind, at, null, 'mean', 'mean-quotidian', 'ptolemy', 1, 'relative-to-natal',
      kind === 'tertiary-progressed' ? 'tertiary' : 'secondary', t)!;
  const OUTER = ['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
  let compared = 0;
  let worst = 0;
  let worstAt = 'none';
  const missing: string[] = [];
  const moonSpread: string[] = [];
  let moonMin = Infinity;
  const moonRanged: string[] = [];
  let moonUnranged = 0;
  let outerN = 0;
  let outerMoved = 0;
  let outerSimMoved = 0;
  let cases = 0;
  for (const kind of TIMELESS_GEODETIC_OVERLAYS as Set<OverlayKind>) {
    for (const age of [30, 60]) {
      cases++;
      const at = jdToEpochMs(noonJD + age * TROPICAL_YEAR_DAYS);
      const base = mk(NOON, kind, at);
      // The suite's own: the birth moved by its offset, hour by hour, midnight to midnight; each
      // body's extent as offsets (the short way) from its placeholder longitude.
      const sim = new Map<string, { lo: number; hi: number }>();
      for (let h = -12; h <= 12; h++) {
        const alt = h === 0 ? base : mk({ ...NOON, tzOffset: NOON.tzOffset - h }, kind, at);
        for (const p of base.positions) {
          if (!RANGE_BODIES.includes(p.name)) continue;
          const q = alt.positions.find((x) => x.name === p.name);
          if (!q) continue;
          const d = normalizeAngle(lonOf(q, alt) - lonOf(p, base)) * RAD2DEG;
          const r = sim.get(p.name) ?? { lo: 0, hi: 0 };
          sim.set(p.name, { lo: Math.min(r.lo, d), hi: Math.max(r.hi, d) });
        }
      }
      // The library's: the hour moved, through the build App hands it.
      const lib = overlayBirthDateMotion(NOON, (c) => mk(c, kind, at), geoEps);
      for (const [name, r] of sim) {
        const l = lib?.ranges.get(name as never);
        compared++;
        if (!l) {
          missing.push(`${kind}@${age} ${name}`);
          continue;
        }
        const d = Math.max(Math.abs(l.lo - r.lo), Math.abs(l.hi - r.hi));
        if (d > worst) {
          worst = d;
          worstAt = `${kind}@${age} ${name}: library ${l.lo.toFixed(4)}…+${l.hi.toFixed(4)}°, moved offset ${r.lo.toFixed(4)}…+${r.hi.toFixed(4)}°`;
        }
        if (kind === 'cyclo' && OUTER.includes(name)) {
          outerN++;
          if (l.hi - l.lo > 1e-9) outerMoved++;
          if (r.hi - r.lo > 1e-9) outerSimMoved++;
        }
      }
      const moonSim = sim.get('Moon');
      const moon = moonSim ? moonSim.hi - moonSim.lo : 0;
      moonMin = Math.min(moonMin, moon);
      moonSpread.push(`${kind}@${age} ${moon.toFixed(2)}°`);
      // The progressed Moon (and Cyclo's, which is the progressed one) is ranged; the solar arc's
      // directed Moon too, carried by the arc.
      const lm = lib?.ranges.get('Moon');
      if (isRanged(lm)) moonRanged.push(`${kind}@${age} ${(lm.hi - lm.lo).toFixed(2)}°`);
      else moonUnranged++;
    }
  }
  // Non-vacuous: the birth-time move has to have moved the Moon, or two parts that both
  // ignored the birth moment would agree on nothing moving.
  check('the moved birth time really moves the overlay (the Moon spreads ≥ 5° in every case)',
    cases === TIMELESS_GEODETIC_OVERLAYS.size * 2 && moonMin >= 5, `Moon: ${moonSpread.join(', ')}`);
  check('overlayBirthDateMotion agrees with the birth moved by its offset, body by body, for every lifted overlay (within 0.001°)',
    compared >= cases * RANGE_BODIES.length && missing.length === 0 && worst < 1e-3,
    missing.length
      ? `missing from the library: ${missing.join(', ')}`
      : `${compared} body ranges, ${cases} overlay cases; worst ${worst.toExponential(2)}° (${worstAt})`);
  check('the progressed Moon is ranged in every lifted overlay (progressed, tertiary, solar arc, Cyclo)',
    moonRanged.length === cases && moonUnranged === 0, moonRanged.join(', '));
  check('Cyclo\'s transiting outer bodies have no range at all, by both parts (no birth hour moves the moment they are read at)',
    outerN === OUTER.length * 2 && outerMoved === 0 && outerSimMoved === 0,
    `${outerN} ranges; ${outerMoved} moved by the library, ${outerSimMoved} by the offset`);
}

// (c) No chart (2026-10-20). With no chart the techniques that advance or compare a chart
// are blocked with 'no-chart' (NO_CHART_BLOCKED_OVERLAYS); Transits and Eclipses stay, cast
// by buildSkyOverlay in the moment's own frame. The set is checked against the builder, a
// second part that knows nothing of the set: build every mode for two DIFFERENT charts at one
// instant, and the layers that move when the chart moves are the ones that need a chart.
// Synastry is the one named exception: its layer is the partner's own sky, which no chart
// moves, and it is blocked because it compares a chart rather than because it advances one.
{
  const OTHER = PARTNER; // a different birth moment and place
  const THIRD = stored({
    name: 'third', year: 1965, month: 11, day: 2, hour: 18, minute: 45, tzOffset: 1,
    birthplace: { label: 'Rome', lat: 41.9, lng: 12.5 },
  });
  const sameBodies = (a: PlanetPosition[], b: PlanetPosition[]) =>
    a.length > 0 && a.length === b.length &&
    a.every((p, i) => p.name === b[i].name && dAng(p.ra, b[i].ra) < 1e-12 && Math.abs(p.dec - b[i].dec) < 1e-12);
  const layerOf = (c: StoredChart, m: OverlayKind) =>
    buildOverlay(c, m, target, THIRD, 'mean', 'mean-quotidian', 'ptolemy', 1, 'transit-moment', 'secondary', t);
  check('the two charts really differ (else nothing could move)',
    !sameBodies(getPlanetPositions(birthDataToJD(CHART), 'mean'), getPlanetPositions(birthDataToJD(OTHER), 'mean')));
  const moves: OverlayKind[] = [];
  const still: OverlayKind[] = [];
  for (const m of OVERLAY_MODES) {
    const a = layerOf(CHART, m);
    const b = layerOf(OTHER, m);
    if (!a || !b) continue;
    (sameBodies(a.positions, b.positions) && dAng(a.gmst, b.gmst) < 1e-12 ? still : moves).push(m);
  }
  const expected = new Set<OverlayKind>([...moves, 'synastry']);
  check('the no-chart set is exactly the layers that move with the chart, plus synastry',
    moves.length > 0 && still.includes('synastry') &&
      expected.size === NO_CHART_BLOCKED_OVERLAYS.size && [...expected].every((m) => NO_CHART_BLOCKED_OVERLAYS.has(m)),
    `move: ${moves.join(', ')}; still: ${still.join(', ')}`);
  check('transits and eclipses are the layers no chart moves (besides synastry)',
    still.length === 3 && still.includes('transits') && still.includes('eclipses'),
    `still: ${still.join(', ')}`);

  for (const ls of ['celestial', 'geodetic'] as const) {
    const none = overlayBlockFor(null, ls);
    const wrong = OVERLAY_MODES.filter(
      (m) => none(m) !== (NO_CHART_BLOCKED_OVERLAYS.has(m) ? 'no-chart' : null),
    );
    check(`no chart on ${ls}: 'no-chart' for exactly the set, nothing for the rest`,
      OVERLAY_MODES.length > NO_CHART_BLOCKED_OVERLAYS.size && wrong.length === 0,
      wrong.length ? `wrong: ${wrong.map((m) => `${m}=${String(none(m))}`).join(', ')}` : `${OVERLAY_MODES.length} modes`);
    check(`no chart on ${ls}: overlayBlockedFor bars the same set`,
      OVERLAY_MODES.every((m) => overlayBlockedFor(null, ls)(m) === NO_CHART_BLOCKED_OVERLAYS.has(m)));
  }
  check('a chart is never \'no-chart\'',
    [CHART, { ...CHART, timeKnown: false }, { ...CHART, composite: {} }, { ...CHART, tag: 'space' }].every((c) =>
      (['celestial', 'geodetic'] as const).every((ls) =>
        OVERLAY_MODES.every((m) => overlayBlockFor(c, ls)(m) !== 'no-chart'))));

  // The sky with no chart. buildSkyOverlay and buildOverlay's two sky cases share one
  // constructor today; these pin that a later edit can't split them: with no chart, the
  // sky is exactly the 'transit-moment' layer of any chart at that instant, less the chart.
  const skyT = buildSkyOverlay('transits', target, 'mean', t);
  const momT = layerOf(CHART, 'transits')!;
  check('no chart: the Transits sky is the moment-framed transit layer, less the chart',
    skyT.kind === 'transits' && sameBodies(skyT.positions, momT.positions) &&
      dAng(skyT.gmst, momT.gmst) < 1e-12 && dAng(skyT.gmst, gmstRadians(targetJD)) < 1e-12 &&
      skyT.jd === momT.jd && skyT.labelFull === momT.labelFull && skyT.moment === momT.moment);
  const ecMs = Date.UTC(2026, 7, 12, 17, 46); // an instant in the eclipse slot, as App passes one
  const skyE = buildSkyOverlay('eclipses', ecMs, 'mean', t);
  const momE = buildOverlay(CHART, 'eclipses', ecMs, null, 'mean', 'mean-quotidian', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  check('no chart: the eclipse chart is the same sky with or without a chart',
    skyE.kind === 'eclipses' && sameBodies(skyE.positions, momE.positions) &&
      dAng(skyE.gmst, momE.gmst) < 1e-12 && skyE.jd === momE.jd);
  check('the sky layer is marked skyOnly and has no origin; a chart\'s layer is neither',
    skyT.skyOnly === true && skyE.skyOnly === true && momT.skyOnly === undefined &&
      Number.isNaN(skyT.originLat) && Number.isNaN(skyT.originLng) &&
      momT.originLat === CHART.birthplace.lat && momT.originLng === CHART.birthplace.lng);
}

console.log(failures === 0 ? '\nverify-directions: ALL PASS' : `\nverify-directions: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
