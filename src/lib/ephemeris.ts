// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Astronomical engine — Swiss Ephemeris (JPL-grade), via the @swisseph/browser
// WASM build. This module is the single source of truth for every celestial
// quantity: planet/asteroid/node/Lilith positions, sidereal time, obliquity,
// houses, and Julian Day. Nothing here is approximated or hand-integrated — if
// Swiss provides it, we read it from Swiss.
//
// The WASM needs a one-time async init (`initEphemeris`) before any calc runs;
// `src/main.tsx` awaits it before the app renders, so every function below stays
// synchronous for its React `useMemo` consumers. Swiss returns DEGREES; we
// convert to radians at this boundary and keep the rest of the app in radians.
import {
  SwissEphemeris,
  Planet,
  LunarPoint,
  Asteroid,
  HouseSystem as SweHouse,
  CalculationFlag,
  CalendarType,
} from '@swisseph/browser';
// Vite emits the wasm as a fingerprinted asset and hands us its URL; we pass it
// to init() explicitly (the package's import.meta.url fallback is unreliable
// under Vite chunking + static hosting).
import wasmUrl from '@swisseph/browser/dist/swisseph.wasm?url';
import type { BirthData } from './birthData';

export type PlanetName =
  | 'Sun'
  | 'Moon'
  | 'Mercury'
  | 'Venus'
  | 'Mars'
  | 'Jupiter'
  | 'Saturn'
  | 'Uranus'
  | 'Neptune'
  | 'Pluto'
  | 'NorthNode'
  | 'SouthNode'
  | 'Lilith'
  | 'Chiron'
  | 'Ceres'
  | 'Pallas'
  | 'Juno'
  | 'Vesta';

export const TRADITIONAL_PLANETS: PlanetName[] = [
  'Sun',
  'Moon',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
  'Pluto',
];

// Lunar nodes — points, grouped with the planets (not the asteroids) in the UI.
export const NODE_NAMES: PlanetName[] = ['NorthNode', 'SouthNode'];

// Asteroids, plus Black Moon Lilith (a lunar apogee, grouped here with the
// asteroids for display and listed LAST). Shown as their own "Asteroids" filter
// section; this is also the canonical display order everywhere bodies are listed.
export const ASTEROID_NAMES: PlanetName[] = [
  'Chiron',
  'Ceres',
  'Pallas',
  'Juno',
  'Vesta',
  'Lilith',
];

export const EXTRA_BODIES: PlanetName[] = [...NODE_NAMES, ...ASTEROID_NAMES];

export const PLANET_NAMES: PlanetName[] = [...TRADITIONAL_PLANETS, ...EXTRA_BODIES];

// Planet display names moved to the i18n catalog (src/i18n/en/planets.ts); resolve
// them via useT().labels.planet(name). The PlanetName union + order arrays stay here.

export const PLANET_CODES: Record<PlanetName, string> = {
  Sun: 'Su',
  Moon: 'Mo',
  Mercury: 'Me',
  Venus: 'Ve',
  Mars: 'Ma',
  Jupiter: 'Ju',
  Saturn: 'Sa',
  Uranus: 'Ur',
  Neptune: 'Ne',
  Pluto: 'Pl',
  NorthNode: 'NN',
  SouthNode: 'SN',
  Lilith: 'Li',
  Chiron: 'Ch',
  Ceres: 'Cr',
  Pallas: 'Pa',
  Juno: 'Jn',
  Vesta: 'Vs',
};

export const PLANET_COLORS: Record<PlanetName, string> = {
  Sun: '#f5b83d',
  Moon: '#cfd6e4',
  Mercury: '#8ee0c8',
  Venus: '#f08aa8',
  Mars: '#e85a4f',
  Jupiter: '#c89a5a',
  Saturn: '#9b7adc',
  Uranus: '#5ec2e0',
  Neptune: '#5a7adc',
  Pluto: '#a85040',
  NorthNode: '#7adbb3',
  SouthNode: '#dc8a7a',
  Lilith: '#7a5a9e',
  Chiron: '#d4a374',
  Ceres: '#6cb8a8',
  Pallas: '#8a8ed4',
  Juno: '#d8a358',
  Vesta: '#e0b890',
};

export interface PlanetPosition {
  name: PlanetName;
  ra: number;
  dec: number;
}

export interface EclipticPosition {
  name: PlanetName;
  lon: number;
  // Optional advanced fields, populated by getEclipticPositions when the
  // expanded sidebar's "Advanced" mode wants declination / speed / retrograde.
  lat?: number;          // ecliptic latitude, radians
  dec?: number;          // equatorial declination, radians
  speed?: number;        // ecliptic longitude motion, degrees/day (negative = Rx)
  retrograde?: boolean;
  stationary?: boolean;  // near a station (instantaneous speed ≈ 0)
}

export interface RelocatedAngles {
  asc: number;
  mc: number;
  dsc: number;
  ic: number;
  /**
   * The 12 house cusps in ecliptic longitude (radians), index 0 = cusp 1 …
   * index 11 = cusp 12, as returned by Swiss Ephemeris for the chosen house
   * system. Cusps 1/4/7/10 equal asc/ic/dsc/mc for quadrant systems; for
   * whole-sign / equal the angles float off the cusps (handled by Swiss).
   */
  cusps: number[];
}

// ── Swiss Ephemeris init (one-time, async) ────────────────────────────────────
// A module-level promise singleton: the WASM module + the self-hosted .se1 data
// files are loaded exactly once. React StrictMode's double-invoke is harmless
// because the promise is cached. After this resolves, every calc below is sync.
let swe: SwissEphemeris | null = null;
let initPromise: Promise<void> | null = null;
// Set true once the .se1 files verify as actually loaded (see
// ephemerisReadsSwissData). Stays false until initEphemeris resolves, or if the
// engine silently fell back to Moshier. Exposed via isEphemerisDataVerified().
let dataFilesVerified = false;

// JPL-grade Swiss data we self-host under public/ephe/ (covers 1800–2399 AD):
// planets (sepl), Moon (semo), and the main-belt asteroids incl. Chiron (seas).
const EPHE_FILES = ['sepl_18.se1', 'semo_18.se1', 'seas_18.se1'].map((name) => ({
  name,
  url: `${import.meta.env.BASE_URL}ephe/${name}`,
}));

export function initEphemeris(
  onStage?: (stage: 'planets' | 'moon' | 'asteroids') => void,
): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const inst = new SwissEphemeris();
      await inst.init(wasmUrl);
      // Load the .se1 files one at a time so the loading screen can report each
      // step (semo, the lunar file, is by far the largest). Each call fetches the
      // file into the WASM virtual FS and re-points the ephemeris path; the
      // SwissEphemeris flag then finds them.
      onStage?.('planets');
      await inst.loadEphemerisFiles([EPHE_FILES[0]]); // sepl — planets
      onStage?.('moon');
      await inst.loadEphemerisFiles([EPHE_FILES[1]]); // semo — Moon
      onStage?.('asteroids');
      await inst.loadEphemerisFiles([EPHE_FILES[2]]); // seas — asteroids
      swe = inst;
      // Confirm the engine is actually reading the .se1 files and not silently
      // on Moshier (a failed file load throws nothing). See ephemerisReadsSwissData.
      dataFilesVerified = ephemerisReadsSwissData(inst);
      if (!dataFilesVerified) {
        console.warn(
          '[ephemeris] Swiss Ephemeris .se1 data files did not load — positions ' +
            'have silently fallen back to the lower-accuracy Moshier model. Check ' +
            'that public/ephe/*.se1 are reachable at the deployed base URL.',
        );
      }
    })();
  }
  return initPromise;
}

function eph(): SwissEphemeris {
  if (!swe) {
    throw new Error('Ephemeris not initialized — await initEphemeris() first');
  }
  return swe;
}

// ── Constants, flags, body mapping ────────────────────────────────────────────
const DEG2RAD = Math.PI / 180;
const TWO_PI = 2 * Math.PI;

// Use the self-hosted Swiss data (not the built-in Moshier fallback) for every
// body, and always request instantaneous speed. FLAG_EQ adds the equatorial
// flag so the position comes back as RA/dec in the longitude/latitude fields.
const FLAG_ECL = CalculationFlag.SwissEphemeris | CalculationFlag.Speed;
const FLAG_EQ = FLAG_ECL | CalculationFlag.Equatorial;

// Startup self-check: confirm the engine is reading the Swiss .se1 data files
// rather than silently falling back to the built-in Moshier model. A failed file
// load (404, renamed asset, CDN miss, FS write failure) throws NO error —
// calculatePosition just returns a Moshier result — so without this probe the app
// would draw subtly-wrong lines with no signal. We assert the returned method
// FLAGS, not the value: Moshier's Sun is within ~1e-6° of Swiss at J2000, so a
// value comparison would pass even on a full fallback. One extra calc, once.
function ephemerisReadsSwissData(inst: SwissEphemeris): boolean {
  try {
    const jdJ2000 = inst.julianDay(2000, 1, 1, 12, CalendarType.Gregorian);
    const sun = inst.calculatePosition(jdJ2000, Planet.Sun, FLAG_ECL);
    return (
      (sun.flags & CalculationFlag.SwissEphemeris) !== 0 &&
      (sun.flags & CalculationFlag.MoshierEphemeris) === 0
    );
  } catch {
    return false;
  }
}

// Whether the .se1 data files verified as loaded at startup. UI may read this to
// warn that positions are approximate (Moshier) when the data files are missing.
export function isEphemerisDataVerified(): boolean {
  return dataFilesVerified;
}

// Lunar node convention: the smoothed long-term average ('mean') or the
// instantaneous osculating node ('true', which oscillates ±~1.5° around the
// mean with a ~173-day period). Both are native Swiss points.
export type NodeType = 'mean' | 'true';

const nodeId = (t: NodeType) => (t === 'true' ? LunarPoint.TrueNode : LunarPoint.MeanNode);

// PlanetName → Swiss body id. SouthNode is handled separately (Swiss has no
// south-node body — it is the antipode of the north node). NorthNode resolves
// via nodeId() because it depends on the mean/true convention.
const BODY_ID: Record<Exclude<PlanetName, 'SouthNode'>, number> = {
  Sun: Planet.Sun,
  Moon: Planet.Moon,
  Mercury: Planet.Mercury,
  Venus: Planet.Venus,
  Mars: Planet.Mars,
  Jupiter: Planet.Jupiter,
  Saturn: Planet.Saturn,
  Uranus: Planet.Uranus,
  Neptune: Planet.Neptune,
  Pluto: Planet.Pluto,
  NorthNode: LunarPoint.MeanNode, // overridden per nodeType in sampleBody
  Lilith: LunarPoint.MeanApogee, // Black Moon Lilith (mean lunar apogee)
  Chiron: Asteroid.Chiron,
  Ceres: Asteroid.Ceres,
  Pallas: Asteroid.Pallas,
  Juno: Asteroid.Juno,
  Vesta: Asteroid.Vesta,
};

const norm2pi = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;

// ── Coordinate helpers (pure geometry, used on DERIVED positions) ─────────────
// These transform already-computed positions (solar-arc shifting, zodiaco
// projection) — they are NOT ephemeris lookups, so they stay hand-rolled.

export function obliquity(jd: number): number {
  // SE_ECL_NUT (body -1): longitude holds the TRUE obliquity of date (degrees).
  const nut = eph().calculatePosition(jd, Planet.EclipticNutation, CalculationFlag.SwissEphemeris);
  return nut.longitude * DEG2RAD;
}

export function raDecToEclipticLon(ra: number, dec: number, eps: number): number {
  const lon = Math.atan2(
    Math.sin(ra) * Math.cos(eps) + Math.tan(dec) * Math.sin(eps),
    Math.cos(ra),
  );
  return norm2pi(lon);
}

// The ecliptic longitude (at latitude 0) whose right ascension is `ra` — i.e. the
// inverse of RA(λ, 0). Used by the geodetic line mode: with Greenwich = 0° Aries,
// this IS the geographic longitude of the meridian whose RAMC equals `ra`.
// NOTE: this is NOT raDecToEclipticLon(ra, 0, eps) — that formula needs the body's
// true dec and gives the wrong value at dec 0 (it would compute tanλ = sinα·cosε/cosα
// instead of the correct tanλ = sinα/(cosα·cosε)).
export function eclipticLonOfRA(ra: number, eps: number): number {
  return norm2pi(Math.atan2(Math.sin(ra), Math.cos(ra) * Math.cos(eps)));
}

function raDecToEclipticLat(ra: number, dec: number, eps: number): number {
  return Math.asin(
    Math.sin(dec) * Math.cos(eps) - Math.cos(dec) * Math.sin(eps) * Math.sin(ra),
  );
}

// Ecliptic spherical (lon, lat) → equatorial RA/dec for a given obliquity.
// Used by the south-node antipode, the zodiaco projection, the solar-arc
// round-trip (one consistent `eps` in both directions), and the map ecliptic line.
export function eclipticToRaDec(
  lon: number,
  lat: number,
  eps: number,
): { ra: number; dec: number } {
  const x = Math.cos(lat) * Math.cos(lon);
  const y = Math.cos(lat) * Math.sin(lon);
  const z = Math.sin(lat);
  const cosE = Math.cos(eps);
  const sinE = Math.sin(eps);
  const xe = x;
  const ye = y * cosE - z * sinE;
  const ze = y * sinE + z * cosE;
  let ra = Math.atan2(ye, xe);
  if (ra < 0) ra += TWO_PI;
  const dec = Math.atan2(ze, Math.sqrt(xe * xe + ye * ye));
  return { ra, dec };
}

// Shift a body's ECLIPTIC longitude by deltaLonRad (keeping its ecliptic
// latitude), then convert back to RA/dec. Used for solar-arc directions, where
// every natal body is advanced by the solar arc. NOTE: the arc must be applied
// in ecliptic longitude — adding it directly to RA is wrong for bodies off the
// equator (Pluto, the Moon). Pass eps = obliquity(jd) for the round-trip.
export function shiftEclipticLongitude(
  p: PlanetPosition,
  deltaLonRad: number,
  eps: number,
): PlanetPosition {
  const lon = raDecToEclipticLon(p.ra, p.dec, eps) + deltaLonRad;
  const lat = raDecToEclipticLat(p.ra, p.dec, eps);
  const { ra, dec } = eclipticToRaDec(lon, lat, eps);
  return { name: p.name, ra, dec };
}

// Shift a body's RIGHT ASCENSION directly (declination unchanged) — the defining
// operation of the "in RA" directions (solar arc / Naibod in RA) and of primary
// directions advancing the RAMC frame. Unlike shiftEclipticLongitude (which
// round-trips through the ecliptic), this is a pure RA increment, which is exactly
// what those methods call for.
export function shiftRightAscension(
  p: PlanetPosition,
  deltaRaRad: number,
): PlanetPosition {
  return { name: p.name, ra: norm2pi(p.ra + deltaRaRad), dec: p.dec };
}

// The Sun's instantaneous daily motion in ECLIPTIC LONGITUDE (degrees/day) straight
// from Swiss — the "Natal Solar Rate in Longitude" primary-direction key. Sun is
// index 0 of PLANET_NAMES.
export function solarDailyMotionLong(
  jd: number,
  nodeType: NodeType = 'mean',
): number {
  return getEclipticPositions(jd, nodeType)[0].speed ?? 0;
}

// The Sun's instantaneous daily motion in RIGHT ASCENSION (degrees/day) — the
// Kepler ("Natal Solar Rate in RA") key. Swiss has no RA-speed field, so take a
// centered finite difference over ±0.5 day, unwrapping the 0/2π seam.
export function solarDailyMotionRA(jd: number): number {
  const ra0 = getPlanetPositions(jd - 0.5)[0].ra;
  const ra1 = getPlanetPositions(jd + 0.5)[0].ra;
  let d = ra1 - ra0;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return (d * 180) / Math.PI; // over a 1-day baseline → degrees/day
}

// Which convention the astrocartography lines use:
//  - 'mundo'   — each body's actual position in the sky (RA/dec as computed).
//  - 'zodiaco' — each body projected onto the ecliptic plane (latitude → 0)
//                before the line is drawn.
// They diverge most for high-latitude bodies (Pluto up to ~17°, Moon up to ~5°).
export type CoordSystem = 'mundo' | 'zodiaco';

// Celestial = standard ACG (lines placed by sidereal time, RA − GMST). Geodetic =
// Sepharial "geodetic equivalents": each angle is anchored to geographic longitude
// via the zodiac (Greenwich = 0° Aries), independent of sidereal time.
export type LineSystem = 'celestial' | 'geodetic';

// Project bodies onto the ecliptic (set ecliptic latitude to 0) and convert back
// to RA/dec — the "in zodiaco" line convention. Longitude is unchanged, so the
// chart wheel (which reads ecliptic longitude) is unaffected; only the line
// geometry on the map shifts for off-ecliptic bodies.
export function projectOntoEcliptic(
  positions: PlanetPosition[],
  jd: number,
): PlanetPosition[] {
  const eps = obliquity(jd);
  return positions.map((p) => {
    const lon = raDecToEclipticLon(p.ra, p.dec, eps);
    const { ra, dec } = eclipticToRaDec(lon, 0, eps);
    return { name: p.name, ra, dec };
  });
}

// ── Core sampling ─────────────────────────────────────────────────────────────
interface BodySample {
  name: PlanetName;
  ra: number; // radians (equatorial)
  dec: number;
  lon: number; // radians (ecliptic)
  lat: number;
  speed: number; // ecliptic longitude motion, degrees/day
}

// Sample one body in both the ecliptic and equatorial frames, plus its speed —
// everything downstream needs, straight from Swiss. Two calc calls per body.
// Returns null when the body has no ephemeris data for this date, so callers can
// drop it instead of crashing the whole chart (see the try/catch below).
function sampleBody(jd: number, name: PlanetName, nodeType: NodeType): BodySample | null {
  if (name === 'SouthNode') {
    // The south node is the antipode of the north node (on the ecliptic, lat 0).
    const nn = sampleBody(jd, 'NorthNode', nodeType);
    if (!nn) return null;
    const lon = norm2pi(nn.lon + Math.PI);
    const eps = obliquity(jd);
    const { ra, dec } = eclipticToRaDec(lon, 0, eps);
    return { name, ra, dec, lon, lat: 0, speed: nn.speed };
  }
  const id = name === 'NorthNode' ? nodeId(nodeType) : BODY_ID[name];
  try {
    const ecl = eph().calculatePosition(jd, id, FLAG_ECL); // lon/lat + speed
    const equ = eph().calculatePosition(jd, id, FLAG_EQ); // RA in .longitude, dec in .latitude
    return {
      name,
      ra: norm2pi(equ.longitude * DEG2RAD),
      dec: equ.latitude * DEG2RAD,
      lon: norm2pi(ecl.longitude * DEG2RAD),
      lat: ecl.latitude * DEG2RAD,
      speed: ecl.longitudeSpeed,
    };
  } catch {
    // No data for this body+date: the bundled asteroid file (seas_18.se1) only
    // covers 1800+, and Chiron is JD-restricted, so the five asteroids throw for
    // pre-1800 charts (e.g. the year-1452 default). The Sun/Moon/planets/nodes/
    // Lilith fall back to Moshier and only reach here on truly out-of-range dates.
    // Dropping the body keeps the rest of the chart intact rather than unmounting
    // the app (these calls run in a render useMemo with no error boundary).
    return null;
  }
}

// Just the ecliptic-longitude speed (deg/day) of one body at an instant — a
// single Swiss call, used to bracket a station without sampleBody's full two-frame
// work. Returns null if the body has no data here (edge of coverage).
function longitudeSpeedAt(jd: number, name: PlanetName, nodeType: NodeType): number | null {
  if (name === 'SouthNode') return longitudeSpeedAt(jd, 'NorthNode', nodeType);
  const id = name === 'NorthNode' ? nodeId(nodeType) : BODY_ID[name];
  try {
    return eph().calculatePosition(jd, id, FLAG_ECL).longitudeSpeed;
  } catch {
    return null;
  }
}

// A body is "stationary" when its ecliptic-longitude motion reverses direction
// within ~a day on either side — i.e. it sits at a retrograde/direct station,
// appearing motionless. We detect the reversal by a SIGN CHANGE of the longitude
// speed across a ±1-day bracket, not by an absolute speed cutoff: the outer
// planets' entire geocentric speed range is only a few hundredths of a degree/day
// (Neptune/Pluto peak ~0.038°/day), so any fixed threshold near that scale would
// read them as "stationary" year-round and hide their genuine retrograde. A sign
// change is self-scaling and correct for every body. The luminaries and the nodes
// never reverse, so they are excluded outright.
const STATION_BRACKET_DAYS = 1;

function stationaryFlag(
  jd: number,
  name: PlanetName,
  nodeType: NodeType,
  speed: number,
): boolean {
  if (name === 'Sun' || name === 'Moon' || name === 'NorthNode' || name === 'SouthNode') {
    return false;
  }
  const before = longitudeSpeedAt(jd - STATION_BRACKET_DAYS, name, nodeType);
  const after = longitudeSpeedAt(jd + STATION_BRACKET_DAYS, name, nodeType);
  // At the very edge of ephemeris coverage a neighbor may be unavailable; fall
  // back to a tight near-zero instantaneous-speed test (real stations only).
  if (before === null || after === null) return Math.abs(speed) < 0.002;
  return Math.sign(before) !== Math.sign(after);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function birthDataToJD(b: BirthData): number {
  // JD at 0h UT of the civil date, then add the fractional UT hour. Going via
  // 0h keeps the hour argument in range and stays exact for any tz offset
  // (including negative / >24h UT hours from large east/west offsets).
  //
  // Dates before the Gregorian reform are historically Julian — Julian 4 Oct 1582
  // was followed by Gregorian 15 Oct 1582 — so cast pre-reform dates on the Julian
  // calendar. Otherwise a pre-1582 birth (e.g. Leonardo da Vinci, 15 Apr 1452)
  // lands ~10 days off, dragging the Sun a whole sign. The 10 skipped days
  // (5–14 Oct 1582) never existed; such inputs fall to Julian here, the
  // conventional handling.
  const reformed =
    b.year > 1582 ||
    (b.year === 1582 && (b.month > 10 || (b.month === 10 && b.day >= 15)));
  const jd0 = eph().julianDay(
    b.year,
    b.month,
    b.day,
    0,
    reformed ? CalendarType.Gregorian : CalendarType.Julian,
  );
  return jd0 + (b.hour + b.minute / 60 - b.tzOffset) / 24;
}

export function gmstRadians(jd: number): number {
  // ARMC at longitude 0 is Greenwich apparent sidereal time (degrees). This is
  // apparent (vs the old mean) sidereal time — ≤~0.004° different and consistent
  // with the apparent RA the bodies are computed in. House system is irrelevant
  // to ARMC, which depends only on jd and longitude.
  const h = eph().calculateHouses(jd, 0, 0, SweHouse.WholeSign);
  return norm2pi(h.armc * DEG2RAD);
}

export function getPlanetPositions(
  jd: number,
  nodeType: NodeType = 'mean',
): PlanetPosition[] {
  return PLANET_NAMES.map((name) => {
    const s = sampleBody(jd, name, nodeType);
    return s ? { name, ra: s.ra, dec: s.dec } : null;
  }).filter((p): p is PlanetPosition => p !== null);
}

// Ecliptic positions for the chart wheel, straight from Swiss — exact longitude,
// latitude, declination, and instantaneous speed (no finite differences).
export function getEclipticPositions(
  jd: number,
  nodeType: NodeType = 'mean',
): EclipticPosition[] {
  const out: EclipticPosition[] = [];
  for (const name of PLANET_NAMES) {
    const s = sampleBody(jd, name, nodeType);
    if (!s) continue;
    out.push({
      name,
      lon: s.lon,
      lat: s.lat,
      dec: s.dec,
      speed: s.speed,
      retrograde: s.speed < 0,
      stationary: stationaryFlag(jd, name, nodeType, s.speed),
    });
  }
  return out;
}

// Ecliptic longitude/latitude for DERIVED positions (solar-arc shifts, overlay
// bi-wheels) where the input is a {ra,dec} that is not a direct Swiss lookup, so
// it must be converted geometrically. Speed/retrograde are meaningless for these
// and intentionally omitted; the overlay wheel only reads `lon`.
export function toEclipticPositions(
  positions: PlanetPosition[],
  jd: number,
): EclipticPosition[] {
  const eps = obliquity(jd);
  return positions.map((p) => ({
    name: p.name,
    lon: raDecToEclipticLon(p.ra, p.dec, eps),
    lat: raDecToEclipticLat(p.ra, p.dec, eps),
    dec: p.dec,
  }));
}

// Equatorial RA + horizontal (azimuth/altitude) coordinates for each body, as
// seen from one observer location at the chart's instant. RA/dec are geocentric
// (same everywhere); azimuth (from north, clockwise) and altitude depend on the
// observer's latitude and local sidereal time. Feeds the expanded sidebar's
// Advanced planet table. Pass gmst = gmstRadians(jd), eps = obliquity(jd).
export interface HorizontalCoords {
  ra: number;   // right ascension, radians (0..2π)
  az: number;   // azimuth from north, radians (0 = N, clockwise)
  alt: number;  // altitude above the horizon, radians (negative = below)
}

export function getHorizontalCoords(
  ecliptic: EclipticPosition[],
  gmst: number,
  eps: number,
  obsLatDeg: number,
  obsLngDeg: number,
): Map<PlanetName, HorizontalCoords> {
  const lst = norm2pi(gmst + obsLngDeg * DEG2RAD);
  const phi = obsLatDeg * DEG2RAD;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const out = new Map<PlanetName, HorizontalCoords>();
  for (const p of ecliptic) {
    const { ra, dec } = eclipticToRaDec(p.lon, p.lat ?? 0, eps);
    const H = lst - ra; // local hour angle
    const alt = Math.asin(
      sinPhi * Math.sin(dec) + cosPhi * Math.cos(dec) * Math.cos(H),
    );
    // Azimuth measured from north, increasing clockwise (matches the local-space
    // bearing in localSpace.ts).
    const az = norm2pi(
      Math.atan2(
        -Math.sin(H),
        Math.tan(dec) * cosPhi - Math.cos(H) * sinPhi,
      ),
    );
    out.set(p.name, { ra, az, alt });
  }
  return out;
}

export interface AngleCoords {
  lat: number;  // ecliptic latitude, radians — 0, since an angle is an ecliptic point
  ra: number;   // right ascension, radians
  dec: number;  // declination, radians
  az: number;   // azimuth from north, radians
  alt: number;  // altitude above the horizon, radians
}

// Equatorial + horizontal coordinates for the four chart angles, for the Advanced
// table. Each angle (ASC/MC/DSC/IC) is a point ON the ecliptic — latitude 0 — at
// its known longitude, so it runs through the same ecliptic → equatorial →
// horizontal conversion as the planets in getHorizontalCoords. By construction the
// ASC/DSC fall on the horizon (alt ≈ 0) and the MC/IC sit on the meridian.
export function getAngleCoords(
  angles: RelocatedAngles,
  gmst: number,
  eps: number,
  obsLatDeg: number,
  obsLngDeg: number,
): Record<'asc' | 'mc' | 'dsc' | 'ic', AngleCoords> {
  const lst = norm2pi(gmst + obsLngDeg * DEG2RAD);
  const phi = obsLatDeg * DEG2RAD;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const at = (lon: number): AngleCoords => {
    const { ra, dec } = eclipticToRaDec(lon, 0, eps);
    const H = lst - ra; // local hour angle
    const alt = Math.asin(
      sinPhi * Math.sin(dec) + cosPhi * Math.cos(dec) * Math.cos(H),
    );
    const az = norm2pi(
      Math.atan2(-Math.sin(H), Math.tan(dec) * cosPhi - Math.cos(H) * sinPhi),
    );
    return { lat: 0, ra, dec, az, alt };
  };
  return {
    asc: at(angles.asc),
    mc: at(angles.mc),
    dsc: at(angles.dsc),
    ic: at(angles.ic),
  };
}

// House-division systems offered in the wheel. The four angles (ASC/MC/DSC/IC)
// are identical across systems; only the intermediate cusps differ. All are
// computed natively by Swiss Ephemeris.
export type HouseSystem =
  | 'placidus'
  | 'whole'
  | 'equal'
  | 'koch'
  | 'regiomontanus'
  | 'campanus'
  | 'porphyry'
  | 'alcabitus';

const HOUSE_MAP: Record<HouseSystem, SweHouse> = {
  placidus: SweHouse.Placidus,
  whole: SweHouse.WholeSign,
  equal: SweHouse.Equal,
  koch: SweHouse.Koch,
  regiomontanus: SweHouse.Regiomontanus,
  campanus: SweHouse.Campanus,
  porphyry: SweHouse.Porphyrius,
  alcabitus: SweHouse.Alcabitus,
};

export function relocate(
  jd: number,
  latDeg: number,
  lngDeg: number,
  system: HouseSystem = 'placidus',
): RelocatedAngles {
  const h = eph().calculateHouses(jd, latDeg, lngDeg, HOUSE_MAP[system]);
  const asc = norm2pi(h.ascendant * DEG2RAD);
  const mc = norm2pi(h.mc * DEG2RAD);
  // Swiss cusps are 1-indexed (cusps[1] = house 1); re-base to 0-indexed.
  const cusps = Array.from({ length: 12 }, (_, i) => norm2pi(h.cusps[i + 1] * DEG2RAD));
  return {
    asc,
    mc,
    dsc: norm2pi(asc + Math.PI),
    ic: norm2pi(mc + Math.PI),
    cusps,
  };
}
