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
  EclipseType,
} from '@swisseph/browser';
// Vite emits the wasm as a fingerprinted asset and hands us its URL; we pass it
// to init() explicitly (the package's import.meta.url fallback is unreliable
// under Vite chunking + static hosting).
import wasmUrl from '@swisseph/browser/dist/swisseph.wasm?url';
import type { BirthData } from './birthData';
import { isHypotheticalKey, SEAS_MINOR_ID } from './minorBodies/ids';
import { HYP_SENTINEL_SE, hypotheticalPoint } from './minorBodies/hypothetical';
// The hypothetical points' elements file, as text in this module (see below for why
// it is not a separate chunk).
import HYP_ELEMENTS_TEXT from './minorBodies/seorbel.txt?raw';
// From the adapter module, NOT eclipsePath — a static import of eclipsePath
// here would hoist the whole Besselian-fitting module into the entry bundle,
// defeating the lazy eclipses chunk (see eclipseAdapter.ts).
import {
  normalizeSwissEclipse,
  normalizeSwissLunarEclipse,
  type LunarEclipseTimes,
  type SunMoonSample,
} from './astro/eclipseAdapter';

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
  | 'Vesta'
  | 'Fortune';

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

// Lunar nodes — calculated points (see POINT_BODIES for the UI grouping).
export const NODE_NAMES: PlanetName[] = ['NorthNode', 'SouthNode'];

// Asteroids, plus Black Moon Lilith (a lunar apogee, sampled alongside them and
// listed LAST). This is the canonical DISPLAY order everywhere bodies are listed;
// the filter UIs group by class instead (MINOR_BODIES / POINT_BODIES below).
export const ASTEROID_NAMES: PlanetName[] = [
  'Chiron',
  'Ceres',
  'Pallas',
  'Juno',
  'Vesta',
  'Lilith',
];

export const EXTRA_BODIES: PlanetName[] = [...NODE_NAMES, ...ASTEROID_NAMES];

// Derived zodiacal points (Lots) — not sampled bodies. They carry a longitude
// only (built from the chart's own angles/positions), so they are injected by
// the app rather than returned by the Swiss sweep, and are plotted but not
// aspected. Listed LAST in the canonical order. Extensible: further Lots join
// here on the same plumbing.
export const POINTS: PlanetName[] = ['Fortune'];

// The body CLASSES the filter surfaces group by — physical planets
// (TRADITIONAL_PLANETS), calculated points, physical minor bodies. Defined once
// here so every surface that groups bodies groups them identically.
//
// Calculated points: the lunar nodes, Black Moon Lilith (the lunar apogee — a
// computed point, not a body, which is why it groups here rather than with the
// asteroids it's sampled with) and the Lots.
export const POINT_BODIES: PlanetName[] = [...NODE_NAMES, 'Lilith', ...POINTS];

// The physical minor bodies. Derived rather than listed, so a future centaur or
// TNO joining ASTEROID_NAMES lands here on its own.
export const MINOR_BODIES: PlanetName[] = ASTEROID_NAMES.filter((b) => b !== 'Lilith');

export const PLANET_NAMES: PlanetName[] = [
  ...TRADITIONAL_PLANETS,
  ...EXTRA_BODIES,
  ...POINTS,
];

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
  Fortune: 'Fo',
};

export const PLANET_COLORS: Record<PlanetName, string> = {
  Sun: '#f5b83d',
  Moon: '#cfd6e4',
  Mercury: '#63c3a8',
  Venus: '#f08aa8',
  Mars: '#e85a4f',
  Jupiter: '#c89a5a',
  Saturn: '#9b7adc',
  Uranus: '#48aaca',
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
  Fortune: '#e6b422',
};

export interface PlanetPosition {
  name: PlanetName;
  ra: number;
  dec: number;
  // Ecliptic coordinates OF RECORD, carried only by synthetic positions
  // (midpoint charts) whose ra/dec are per-coordinate means rather than one
  // sky point — there the ecliptic coords can't be recovered from ra/dec.
  // The geometry helpers below prefer these when present; direct ephemeris
  // samples omit them (their ra/dec round-trip exactly).
  lon?: number;          // ecliptic longitude of record, radians
  lat?: number;          // ecliptic latitude of record, radians
  /** Ecliptic longitude motion, degrees/day (negative = retrograde) — carried only
   *  by positions SAMPLED from the sky, which is what makes its absence meaningful.
   *
   *  A directed chart (solar arc, primary directions) advances every body by one
   *  shared arc, so its bodies have no daily motion of their own: the two shift
   *  helpers above build fresh positions without this field, and every readout of
   *  it then prints an em-dash rather than quoting the birth sky's rate as though
   *  it were the directed body's. Midpoint constructions (composite) are the same.
   *
   *  Free where it exists: sampleBody computes it for every body already. */
  speed?: number;
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
  // Equatorial RA of record, carried when the position's equatorial coords are
  // per-coordinate means (midpoint charts) rather than derivable from lon/lat;
  // getHorizontalCoords prefers it so the table matches the map.
  ra?: number;           // right ascension, radians
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
  /**
   * The Vertex: the ecliptic's intersection with the prime vertical in the
   * WEST (the Swiss Ephemeris branch convention), an auxiliary angle some
   * astrologers read for fated encounters. The Anti-Vertex is its exact
   * antipode (the eastern intersection). Like the Ascendant near the poles,
   * the Vertex degenerates near the EQUATOR — the prime vertical there
   * approaches the celestial equator, pinning the Vertex toward 0° Aries/Libra
   * and making it oscillate — so tropical-latitude values deserve care.
   */
  vertex: number;
  antivertex: number;
  /**
   * True when the chosen system (Placidus/Koch) was undefined at this latitude
   * — above the polar circles — and the cusps are the Porphyry fallback instead.
   * The UI surfaces this so the wheel never silently shows a different system
   * than the one selected. The angles themselves are system-independent.
   */
  fallback?: boolean;
  /**
   * Marks a geodetic frame (geodeticFrame sets it, shiftAngles carries it): these
   * angles belong to a PLACE, not to a moment — everyone born there has the same
   * ones — so readouts truncate them rather than round (format.ts truncZodiac,
   * which says why). vertex/antivertex are NaN on such a frame, because geodetic
   * maps draw the four angles only. (2026-10-02)
   */
  geodetic?: true;
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

// JPL-grade Swiss data we self-host under public/ephe/ (covers 1800–2399 AD).
// Planets (sepl) and the Moon (semo) load at startup — every chart needs them.
// The main-belt asteroids incl. Chiron (seas) load on demand instead (see
// ensureAsteroidEphemeris): most sessions never enable an asteroid body, so its
// download shouldn't gate first paint or cost those sessions the bandwidth.
const epheFile = (name: string) => ({
  name,
  url: `${import.meta.env.BASE_URL}ephe/${name}`,
});
const CORE_EPHE_FILES = [epheFile('sepl_18.se1'), epheFile('semo_18.se1')];
const SEAS_EPHE_FILE = epheFile('seas_18.se1');

export function initEphemeris(
  onStage?: (stage: 'planets' | 'moon') => void,
): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const inst = new SwissEphemeris();
      await inst.init(wasmUrl);
      // Fetch both core files concurrently — total wait is the larger file
      // (semo) rather than the sum. Each call fetches into the WASM virtual FS
      // and (re)points the ephemeris path; the SwissEphemeris flag then finds
      // them. The stage callbacks keep the loading screen honest: "planets"
      // fires as the downloads start, "moon" once the smaller file is in and
      // only the lunar tables are still streaming. The stage hop rides a
      // two-handler then() (error side a no-op) and the single wait/rejection
      // point is the Promise.all — awaiting the files one at a time would
      // leave the other's rejection unhandled when the first one fails.
      onStage?.('planets');
      const sepl = inst.loadEphemerisFiles([CORE_EPHE_FILES[0]]);
      const semo = inst.loadEphemerisFiles([CORE_EPHE_FILES[1]]);
      sepl.then(
        () => onStage?.('moon'),
        () => {},
      );
      await Promise.all([sepl, semo]);
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

// ── Deferred asteroid data ────────────────────────────────────────────────────
// Chiron/Ceres/Pallas/Juno/Vesta come from seas_18.se1 (Lilith is a lunar point
// and needs no asteroid file). Until the file is in, sampleBody throws for these
// five and they simply drop out of charts — same shape as an out-of-range date —
// so loading late is safe: the App bumps a state counter when this resolves and
// the chart memos resample with the new data.
const SEAS_BODIES: ReadonlySet<PlanetName> = new Set([
  'Chiron',
  'Ceres',
  'Pallas',
  'Juno',
  'Vesta',
]);

/** True when `names` contains a body whose positions need the asteroid file. */
export function needsAsteroidEphemeris(names: Iterable<PlanetName>): boolean {
  for (const n of names) if (SEAS_BODIES.has(n)) return true;
  return false;
}

let seasPromise: Promise<void> | null = null;

/** Fetch the asteroid ephemeris once, after core init. Re-callable on failure. */
export function ensureAsteroidEphemeris(): Promise<void> {
  if (!seasPromise) {
    seasPromise = (async () => {
      await initEphemeris();
      await eph().loadEphemerisFiles([SEAS_EPHE_FILE]);
    })().catch((err: unknown) => {
      // Reset so a later toggle retries the download instead of failing forever.
      seasPromise = null;
      throw err;
    });
  }
  return seasPromise;
}

// ── Hypothetical points' elements ─────────────────────────────────────────────
// The hypothetical points (lib/minorBodies/hypothetical.ts) are computed from the
// engine's elements file, seorbel.txt — shipped beside that table, NOT in public/ephe:
// a downstream build's service worker caches only binary responses under /ephe,
// public/_headers marks that folder immutable for a year, and the verify harness puts
// public/ephe on the engine's path, where a file sitting there would hide a mount that
// never happened (public/ephe/README.md).
//
// THE TRAP this guards: without the file the engine does not fail for bodies 40–54. It
// answers from fifteen element sets compiled into it, which differ from the file's —
// Kronos's semi-axis is 64.81960 built in against the file's 64.81690, which moves
// Kronos 14–20″ — and says nothing. So nothing is computed until the file is proven
// read: after mounting, body 56 (HYP_SENTINEL_SE), which has no built-in set and so
// throws without the file, must compute; only then does hypElementsVerified turn on.
// minorSweId below refuses every hypothetical point while it is off, whatever the caller.
//
// COST: the engine re-opens and re-parses the file on EVERY call for these bodies (it
// keeps no copy): ≈160–175 µs a call natively against ≈9 µs for a planet (the
// downstream WASM build's parity check prints its own figure). About 7 ms for all ten
// on a chart change, both frames and the station bracket — acceptable there. Any
// future time sweep that adopts these bodies must measure before it does.
const HYP_ELEMENTS_FILE = 'seorbel.txt';
let hypPromise: Promise<void> | null = null;
let hypElementsVerified = false;

/** Mount the elements file once and prove the engine reads it. Re-callable on
 *  failure: the promise resets, so a row's retry tries again. */
export function ensureHypotheticalElements(): Promise<void> {
  if (!hypPromise) {
    hypPromise = (async () => {
      await initEphemeris();
      // The text rides in this module (≈2.8 KB gzipped) rather than as a lazy chunk:
      // the browser keeps a FAILED module import for the life of the page, so a chunk
      // that missed the network once could never be fetched again by a retry, and a
      // failed chunk load also trips the app's deploy-skew reload. Bundled, the only
      // ways left to fail are the mount and the check below. Normalised to LF: a
      // checkout's line endings are not the file's.
      const url = URL.createObjectURL(
        new Blob([HYP_ELEMENTS_TEXT.replace(/\r\n/g, '\n')], { type: 'text/plain' }),
      );
      try {
        // Under its bare name, where the engine looks for it — setting the path also
        // clears the engine's saved positions.
        await eph().loadEphemerisFiles([{ name: HYP_ELEMENTS_FILE, url }]);
      } finally {
        URL.revokeObjectURL(url);
      }
      // Throws unless the file was read (see the trap, above).
      eph().calculatePosition(2451545.0, HYP_SENTINEL_SE, FLAG_ECL);
      hypElementsVerified = true;
    })().catch((err: unknown) => {
      hypPromise = null;
      throw err;
    });
  }
  return hypPromise;
}

function eph(): SwissEphemeris {
  if (!swe) {
    throw new Error('Ephemeris not initialized — await initEphemeris() first');
  }
  return swe;
}

/**
 * Hand ephemeris files to the engine's virtual filesystem, each under its bare
 * `name` (the engine finds a numbered asteroid's file there by name — see
 * lib/minorBodies/ids.ts). One call for a whole batch: every load re-points the
 * engine's path, which closes its open files. The catalog loader passes `blob:`
 * URLs for bytes it has already validated; `url` is fetched by the engine binding.
 */
export async function mountEphemerisFiles(files: Array<{ name: string; url: string }>): Promise<void> {
  if (files.length === 0) return;
  await initEphemeris();
  await eph().loadEphemerisFiles(files);
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
// south-node body — it is the antipode of the north node). Fortune is a derived
// point with no Swiss body at all — it is injected by the app, never sampled.
// NorthNode resolves via nodeId() because it depends on the mean/true convention.
const BODY_ID: Record<Exclude<PlanetName, 'SouthNode' | 'Fortune'>, number> = {
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

// Geodetic angles: a place's own angles, read from its coordinates with no chart.

// Mean obliquity at J2000.0 (23°26′21.448″), radians. Everything that reads a place's
// geodetic angles with NO chart behind it — the grid, its hover readout and zone
// membership — uses this. A surface fed by a chart uses that chart's obliquity(jd)
// instead, so its seconds differ from the grid's: a 1941 chart moves Toronto's
// Ascendant 18″ (verify-geodetic §6). (2026-10-02)
export const EPS_J2000 = 23.4392911 * DEG2RAD;

// Which zodiac-to-Earth convention maps a longitude to its Midheaven. Only the
// zodiacal one exists (MC = geographic longitude, Greenwich = 0° Aries). The
// right-ascension convention (RAMC = longitude) would be a second member; the
// parameter is built now so adding it changes no call site, but it is not exposed.
// (2026-10-02)
export type GeodeticBranch = 'zodiacal';

/** A place's geodetic angles, all in radians. `ramc` is the right ascension that
 *  culminates the MC — what a table of houses is entered with. */
export interface GeodeticAngles {
  asc: number;
  mc: number;
  dsc: number;
  ic: number;
  ramc: number;
}

/**
 * The geodetic angles of a place — pure: no chart, no ephemeris, no house system.
 * Mind the order: (longitude, latitude) — longitude first, because a place's
 * geodetic MC IS its longitude — while geodeticFrame below takes relocate()'s
 * (latitude, longitude).
 * verify-geodetic §6 runs geodeticFrame at an off-diagonal place (Toronto), so a
 * swap between the two orders fails there.
 *
 * The Ascendant is the standard closed form, then the EASTERN point. Inside the
 * polar circles the closed form can return the western intersection of ecliptic and
 * horizon (the bare formula gives 9°47′ Libra at Resolute, where the eastern point is
 * 9°47′ Aries); the rule below keeps the Ascendant within 180° ahead of the MC, which
 * is the Swiss Ephemeris' own acmc rule, so it agrees with every other Ascendant in
 * AstroLina (verify-geodetic §2–§3 check it against the horizon and against Swiss).
 * (2026-10-02)
 */
export function geodeticAngles(
  lngDeg: number,
  latDeg: number,
  eps: number,
  branch: GeodeticBranch = 'zodiacal',
): GeodeticAngles {
  // One convention today. A caller outside the type system naming another must
  // fail here rather than be read as zodiacal without a word.
  if (branch !== 'zodiacal') throw new Error(`geodeticAngles: unknown branch ${String(branch)}`);
  const mc = norm2pi(lngDeg * DEG2RAD);
  const ramc = eclipticToRaDec(mc, 0, eps).ra;
  const phi = latDeg * DEG2RAD;
  let asc = norm2pi(
    Math.atan2(
      Math.cos(ramc),
      -(Math.sin(ramc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps)),
    ),
  );
  if (norm2pi(asc - mc) >= Math.PI) asc = norm2pi(asc + Math.PI);
  return { asc, mc, dsc: norm2pi(asc + Math.PI), ic: norm2pi(mc + Math.PI), ramc };
}

// Shift a body's ECLIPTIC longitude by deltaLonRad (keeping its ecliptic
// latitude), then convert back to RA/dec. Used for solar-arc directions, where
// every natal body is advanced by the solar arc. NOTE: the arc must be applied
// in ecliptic longitude — adding it directly to RA is wrong for bodies off the
// equator (Pluto, the Moon). Pass eps = obliquity(jd) for the round-trip.
// Coordinates of record (midpoint charts) are preferred over the geometric
// round-trip and carried forward shifted, so a directed midpoint stays anchored
// to its true longitude of record; direct-sample inputs stay bare, keeping
// "carried ⇔ synthetic" true along the whole chain.
export function shiftEclipticLongitude(
  p: PlanetPosition,
  deltaLonRad: number,
  eps: number,
): PlanetPosition {
  const lon = norm2pi((p.lon ?? raDecToEclipticLon(p.ra, p.dec, eps)) + deltaLonRad);
  const lat = p.lat ?? raDecToEclipticLat(p.ra, p.dec, eps);
  const { ra, dec } = eclipticToRaDec(lon, lat, eps);
  return p.lon !== undefined
    ? { name: p.name, ra, dec, lon, lat }
    : { name: p.name, ra, dec };
}

// Shift a body's RIGHT ASCENSION directly (declination unchanged) — the defining
// operation of the "in RA" directions (solar arc / Naibod in RA) and of primary
// directions advancing the RAMC frame. Unlike shiftEclipticLongitude (which
// round-trips through the ecliptic), this is a pure RA increment, which is exactly
// what those methods call for. Intentionally returns a bare {name, ra, dec}: an
// RA shift invalidates any carried ecliptic coordinates of record, so downstream
// re-derives them from the shifted ra/dec (the defining "in RA" reading).
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
//
// ALIAS, noted once here: 'geodetic' is shown to readers as "Geodetic", and was
// labelled "Mundane" until 2026-10. Only the label changed — the stored value
// 'geodetic' never did, so nothing stored needed migrating. (2026-10-02)
export type LineSystem = 'celestial' | 'geodetic';

// Project bodies onto the ecliptic (set ecliptic latitude to 0) and convert back
// to RA/dec — the "in zodiaco" line convention. Longitude is unchanged, so the
// chart wheel (which reads ecliptic longitude) is unaffected; only the line
// geometry on the map shifts for off-ecliptic bodies. A longitude of record
// (midpoint charts) is preferred over the geometric round-trip: a synthetic
// position's ra/dec are per-coordinate means, so inverting them would land on a
// longitude other than the one the chart is defined by. The projected point IS
// its own longitude of record, so `lon` rides along (idempotent).
export function projectOntoEcliptic(
  positions: PlanetPosition[],
  jd: number,
): PlanetPosition[] {
  const eps = obliquity(jd);
  return positions.map((p) => {
    const lon = p.lon ?? raDecToEclipticLon(p.ra, p.dec, eps);
    const { ra, dec } = eclipticToRaDec(lon, 0, eps);
    return { name: p.name, ra, dec, lon };
  });
}

// The same In-Zodiaco / geodetic projection for catalog minor bodies, so their
// lines follow the planets' frame exactly (a consumer answering a question about a
// line must read the frame the line generator read). Kept beside the planets'
// version on purpose: the two must never drift into different conventions.
export function projectMinorOntoEcliptic(
  positions: readonly MinorPosition[],
  jd: number,
): MinorPosition[] {
  const eps = obliquity(jd);
  return positions.map((p) => {
    const lon = p.lon ?? raDecToEclipticLon(p.ra, p.dec, eps);
    const { ra, dec } = eclipticToRaDec(lon, 0, eps);
    return { n: p.n, ra, dec, lon };
  });
}

// ── Core sampling ─────────────────────────────────────────────────────────────
export interface BodySample {
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
// Exported for the midpoint-chart math, which needs each parent's native
// four-coordinate sample per body (same drop-a-body-on-null semantics).
export function sampleBody(jd: number, name: PlanetName, nodeType: NodeType): BodySample | null {
  // Fortune is a derived point (built from the Ascendant, which Swiss doesn't
  // give here) — never sampled; the app injects it after the chart is assembled.
  if (name === 'Fortune') return null;
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
  const s = sampleById(jd, id);
  return s && { name, ...s };
}

// The two-frame sample for one Swiss body id — shared by the built-in bodies above
// and the catalog minor bodies below, so both read the engine through the SAME
// flags and conversions.
function sampleById(jd: number, id: number): Omit<BodySample, 'name'> | null {
  try {
    const ecl = eph().calculatePosition(jd, id, FLAG_ECL); // lon/lat + speed
    const equ = eph().calculatePosition(jd, id, FLAG_EQ); // RA in .longitude, dec in .latitude
    return {
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
    // A catalog minor body throws outside its own file's span (1500–2100 for the
    // short files) and whenever its file isn't mounted — numbered asteroids have
    // no Moshier fallback at all.
    // Dropping the body keeps the rest of the chart intact rather than unmounting
    // the app (these calls run in a render useMemo with no error boundary).
    return null;
  }
}

// ── Catalog minor bodies ──────────────────────────────────────────────────────
// Numbered minor planets read from their own per-asteroid files (see
// lib/minorBodies/). The engine's body id for MPC number n is 10000 + n — the
// engine's own offset, restated here rather than imported: the downstream engine
// build doesn't export the constant, and an import the type-checker accepts but the
// other build lacks would break that build's bundle. A few numbered bodies live in
// the bundled main-asteroid file under their own id instead (SEAS_MINOR_ID).
const MINOR_ID_OFFSET = 10000;

/** The engine's body id for list key `n`, or null when it must not be computed. A
 *  hypothetical point is refused until its elements file is proven read, and always
 *  when this build doesn't know it — the ONE chokepoint every sample and speed goes
 *  through, so no caller can reach the engine's built-in elements (see above). */
function minorSweId(n: number): number | null {
  if (isHypotheticalKey(n)) {
    const p = hypotheticalPoint(n);
    return p && hypElementsVerified ? p.se : null;
  }
  return SEAS_MINOR_ID.get(n) ?? MINOR_ID_OFFSET + n;
}

/** A catalog minor body's position — PlanetPosition's shape, keyed by MPC number. */
export interface MinorPosition {
  n: number;
  ra: number;
  dec: number;
  /** Ecliptic longitude of record — set by the In-Zodiaco projection. */
  lon?: number;
  /** Ecliptic longitude motion, degrees/day. */
  speed?: number;
}

export interface MinorSample {
  n: number;
  ra: number;
  dec: number;
  lon: number;
  lat: number;
  speed: number;
}

/** One catalog body at one instant, or null (file not mounted, or the date is
 *  outside the file's span; for a hypothetical point, its elements not yet proven
 *  read). Same two-frame sample the built-ins get. */
export function sampleMinorBody(jd: number, n: number): MinorSample | null {
  const id = minorSweId(n);
  if (id === null) return null;
  const s = sampleById(jd, id);
  return s && { n, ...s };
}

// Just the ecliptic-longitude speed (deg/day) of one catalog body — the minor-body
// twin of longitudeSpeedAt below, for bracketing a station. Null outside the file.
function minorSpeedAt(jd: number, n: number): number | null {
  const id = minorSweId(n);
  if (id === null) return null;
  try {
    return eph().calculatePosition(jd, id, FLAG_ECL).longitudeSpeed;
  } catch {
    return null;
  }
}

/**
 * Full samples for a set of catalog bodies at one instant — both frames and the
 * speed, plus (with `withStation`) the same station flag the built-ins carry. The
 * engine keeps ONE numbered-asteroid file open at a time and reopens it whenever the
 * body changes, so everything for a body is sampled before moving to the next
 * (body-outer) — one open per body, the station bracket included: its two extra
 * speeds are taken while the body's file is still the open one. A time sweep over
 * several bodies should follow the same order: loop bodies outside, instants inside.
 */
export function getMinorSamples(
  jd: number,
  numbers: readonly number[],
  withStation = false,
): (MinorSample & { stationary?: boolean })[] {
  const out: (MinorSample & { stationary?: boolean })[] = [];
  for (const n of numbers) {
    const s = sampleMinorBody(jd, n);
    if (!s) continue;
    if (!withStation) {
      out.push(s);
      continue;
    }
    const before = minorSpeedAt(jd - STATION_BRACKET_DAYS, n);
    const after = minorSpeedAt(jd + STATION_BRACKET_DAYS, n);
    out.push({ ...s, stationary: stationFromBracket(before, after, s.speed) });
  }
  return out;
}

/**
 * One sample stripped to the line generator's shape — the ONE place that stripping is
 * written, for getMinorPositions below and for a caller that already holds the full
 * samples (the App samples once, for the wheel and the lines both).
 *
 * Never carries `lon`. On a MinorPosition that field means a longitude OF RECORD, and
 * projectMinorOntoEcliptic prefers it over the ra/dec round-trip — so passing the
 * sample's longitude through here would quietly change which point the In-Zodiaco
 * lines are drawn from.
 */
export function minorPositionOf(s: MinorSample): MinorPosition {
  return { n: s.n, ra: s.ra, dec: s.dec, speed: s.speed };
}

/**
 * Positions for a set of catalog bodies at one instant — getMinorSamples stripped to
 * the line generator's shape (minorPositionOf).
 */
export function getMinorPositions(jd: number, numbers: readonly number[]): MinorPosition[] {
  return getMinorSamples(jd, numbers).map(minorPositionOf);
}

// Just the ecliptic-longitude speed (deg/day) of one body at an instant — a
// single Swiss call, used to bracket a station without sampleBody's full two-frame
// work. Returns null if the body has no data here (edge of coverage).
function longitudeSpeedAt(jd: number, name: PlanetName, nodeType: NodeType): number | null {
  if (name === 'Fortune') return null; // derived point — no Swiss body to sample
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
  return stationFromBracket(before, after, speed);
}

/** The station test itself, on speeds already in hand (deg/day): a sign change
 *  across the ±STATION_BRACKET_DAYS bracket. Pure, and the ONE copy of the rule —
 *  the built-ins (stationaryFlag) and the catalog bodies (getMinorSamples) both
 *  read it, so the two families cannot come to disagree about what a station is. */
export function stationFromBracket(
  before: number | null,
  after: number | null,
  speed: number,
): boolean {
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

// JD of 1582-10-15 00:00 UT — the first Gregorian date after the reform. Picks the
// calendar when going back from a JD, mirroring birthDataToJD's forward branch.
const GREGORIAN_REFORM_JD = 2299160.5;

// Inverse of birthDataToJD's calendar step: a Universal-Time Julian Day → civil
// Y/M/D and H:M (UT). Snaps to the nearest minute first, then reads the date back
// from Swiss, so the extracted hour/minute are exact and a tick before midnight can't
// land on the wrong day. Used to turn a Davison midpoint instant into a chart date.
export function jdToCivil(jd: number): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const jdMin = Math.round(jd * 1440) / 1440;
  const cal =
    jdMin >= GREGORIAN_REFORM_JD ? CalendarType.Gregorian : CalendarType.Julian;
  const d = eph().julianDayToDate(jdMin, cal);
  const totalMin = Math.round(d.hour * 60); // minute-of-day, 0..1439 (already snapped)
  return {
    year: d.year,
    month: d.month,
    day: d.day,
    hour: Math.floor(totalMin / 60),
    minute: totalMin % 60,
  };
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
  return PLANET_NAMES.map((name): PlanetPosition | null => {
    const s = sampleBody(jd, name, nodeType);
    // Speed rides along because sampleBody has already paid for it — the same Swiss
    // call that returns the longitude returns its rate. Dropping it here was why an
    // overlay's Speed column read as em-dashes: every overlay ring is built from
    // these positions, and nothing downstream could recover a figure this had thrown
    // away. (Its absence still means something — see PlanetPosition.speed.)
    return s ? { name, ra: s.ra, dec: s.dec, speed: s.speed } : null;
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

// One body's ecliptic longitude (radians) + speed (deg/day) at an instant — the
// minimal sample the solar/lunar-return root-finder iterates on. A single Swiss
// call, vs getEclipticPositions' all-bodies sweep (which would resample every
// body on each Newton step). Returns null off the ephemeris range, like the rest
// of the sampling layer.
export function bodyLonSpeed(
  jd: number,
  name: PlanetName,
  nodeType: NodeType = 'mean',
): { lon: number; speed: number } | null {
  if (name === 'Fortune') return null; // derived point — no Swiss body to sample
  if (name === 'SouthNode') {
    const nn = bodyLonSpeed(jd, 'NorthNode', nodeType);
    return nn && { lon: norm2pi(nn.lon + Math.PI), speed: nn.speed };
  }
  const id = name === 'NorthNode' ? nodeId(nodeType) : BODY_ID[name];
  try {
    const ecl = eph().calculatePosition(jd, id, FLAG_ECL);
    return { lon: norm2pi(ecl.longitude * DEG2RAD), speed: ecl.longitudeSpeed };
  } catch {
    return null;
  }
}

// Ecliptic longitude/latitude for DERIVED positions (solar-arc shifts, overlay
// bi-wheels) where the input is a {ra,dec} that is not a direct Swiss lookup, so
// it must be converted geometrically — unless the position carries coordinates
// of record (midpoint charts), which are preferred: their ra/dec are
// per-coordinate means, so the geometric inversion would drift off the chart's
// own longitudes. Speed/retrograde are meaningless for these and intentionally
// omitted; `ra` rides along for the equatorial readouts.
export function toEclipticPositions(
  positions: PlanetPosition[],
  jd: number,
): EclipticPosition[] {
  const eps = obliquity(jd);
  return positions.map((p) => ({
    name: p.name,
    lon: p.lon ?? raDecToEclipticLon(p.ra, p.dec, eps),
    lat: p.lat ?? raDecToEclipticLat(p.ra, p.dec, eps),
    dec: p.dec,
    ra: p.ra,
    // Both undefined for a directed or midpoint-built position, which carries no
    // speed — so those keep reading as an em-dash rather than gaining a rate they
    // do not have. `stationary` is deliberately NOT derived here: retrograde is a
    // sign test on a figure already in hand, while a station needs the body
    // resampled either side of the instant, and that is a real cost to pay on
    // every timeline tick for a flag the overlay ring has never shown.
    speed: p.speed,
    retrograde: p.speed == null ? undefined : p.speed < 0,
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

// One observer, as horizontalAt takes it: local sidereal time and the sine/cosine of
// the latitude. Shared so the planets' table and the catalog bodies' rows below are
// set up for the observer by the same three lines rather than two copies of them.
function observerAt(gmst: number, obsLatDeg: number, obsLngDeg: number) {
  const lst = norm2pi(gmst + obsLngDeg * DEG2RAD);
  const phi = obsLatDeg * DEG2RAD;
  return { lst, sinPhi: Math.sin(phi), cosPhi: Math.cos(phi) };
}

export function getHorizontalCoords(
  ecliptic: EclipticPosition[],
  gmst: number,
  eps: number,
  obsLatDeg: number,
  obsLngDeg: number,
): Map<PlanetName, HorizontalCoords> {
  const { lst, sinPhi, cosPhi } = observerAt(gmst, obsLatDeg, obsLngDeg);
  const out = new Map<PlanetName, HorizontalCoords>();
  for (const p of ecliptic) {
    // Equatorial coordinates of record (midpoint charts) win over the geometric
    // conversion: a midpoint row's dec is a per-coordinate mean, not the dec of
    // its (lon, lat) point, and the table must agree with the map lines.
    const { ra, dec } =
      p.ra !== undefined && p.dec !== undefined
        ? { ra: p.ra, dec: p.dec }
        : eclipticToRaDec(p.lon, p.lat ?? 0, eps);
    const { az, alt } = horizontalAt(ra, dec, lst, sinPhi, cosPhi);
    out.set(p.name, { ra, az, alt });
  }
  return out;
}

/** Azimuth + altitude of one equatorial point for one observer — the per-body step
 *  of getHorizontalCoords, taken out so a body that is not a PlanetName (a catalog
 *  minor body) is converted by the same arithmetic rather than a copy of it. Pass
 *  `lst` = norm2pi(gmst + observer longitude) and the sine/cosine of the observer's
 *  latitude; ra/dec are the tropical equatorial coordinates of record, never a
 *  zodiac-shifted display value. */
export function horizontalAt(
  ra: number,
  dec: number,
  lst: number,
  sinPhi: number,
  cosPhi: number,
): { az: number; alt: number } {
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
  return { az, alt };
}

/** Azimuth + altitude for catalog minor bodies, keyed by MPC number — the positions
 *  table's catalog rows, getHorizontalCoords' twin for a family that is not keyed by
 *  PlanetName. Same observer set-up, same per-body arithmetic (horizontalAt), so a
 *  catalog body and a planet at one ra/dec read the same azimuth and altitude. Feed it
 *  the TROPICAL ra/dec of record (as sampled), with the gmst and observer the planets'
 *  table uses; RA is not repeated here, since each body already carries its own. */
export function getMinorHorizontalCoords(
  bodies: readonly { n: number; ra: number; dec: number }[],
  gmst: number,
  obsLatDeg: number,
  obsLngDeg: number,
): Map<number, { az: number; alt: number }> {
  const { lst, sinPhi, cosPhi } = observerAt(gmst, obsLatDeg, obsLngDeg);
  const out = new Map<number, { az: number; alt: number }>();
  for (const b of bodies) out.set(b.n, horizontalAt(b.ra, b.dec, lst, sinPhi, cosPhi));
  return out;
}

// ── Part of Fortune (Lot of Fortune) ────────────────────────────────────────
// A derived zodiacal point, not a sampled body. Its longitude is the Ascendant
// plus the Moon–Sun arc — reflected across the Ascendant for a night birth under
// the sect-based convention. Built from the Ascendant, it is a longitude only,
// with no mundane sky position of its own (drawn like a latitude-0 point), and
// it is undefined when the birth time (hence the Ascendant) is unknown.

// Which light leads the formula: sect-based flips it by day/night; the Ptolemaic
// convention uses the day formula regardless of sect.
export type FortuneFormula = 'sect' | 'ptolemaic';

// A day birth is the Sun on OR above the true horizon at the birth place/instant
// (inclusive boundary: altitude exactly 0 counts as day, for a deterministic
// answer at the sunrise/sunset edge). Reuses the horizontal conversion so the
// sect test agrees with the Advanced table's altitudes to the arcminute.
export function isDayBirth(
  ecliptic: EclipticPosition[],
  gmst: number,
  eps: number,
  latDeg: number,
  lngDeg: number,
): boolean {
  const sun = getHorizontalCoords(ecliptic, gmst, eps, latDeg, lngDeg).get('Sun');
  return sun ? sun.alt >= 0 : true; // no Sun sample (shouldn't happen) → day
}

// The Lot of Fortune's ecliptic longitude (radians). Sect-based: day births use
// Asc + Moon − Sun, night births reflect it to Asc + Sun − Moon; Ptolemaic uses
// the day formula always. All inputs and the result are radians.
export function partOfFortuneLon(
  ascLon: number,
  sunLon: number,
  moonLon: number,
  day: boolean,
  formula: FortuneFormula,
): number {
  const useDay = formula === 'ptolemaic' ? true : day;
  return norm2pi(useDay ? ascLon + moonLon - sunLon : ascLon + sunLon - moonLon);
}

// Wrap a Lot longitude as a latitude-0 position for the line pipeline, carrying
// its longitude of record so the In-Zodiaco projection is idempotent (and so the
// map lines place it by its zodiac degree, exactly like a lunar node).
export function fortunePosition(lon: number, eps: number): PlanetPosition {
  const { ra, dec } = eclipticToRaDec(lon, 0, eps);
  return { name: 'Fortune', ra, dec, lon, lat: 0 };
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
): Record<'asc' | 'mc' | 'dsc' | 'ic' | 'vertex' | 'antivertex', AngleCoords> {
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
    // By construction the Vertex/Anti-Vertex sit on the prime vertical
    // (azimuth due west / due east) — a consistency the verify suite pins.
    vertex: at(angles.vertex),
    antivertex: at(angles.antivertex),
  };
}

// ── Solar eclipses ────────────────────────────────────────────────────────────

export type SolarEclipseKind = 'total' | 'annular' | 'hybrid' | 'partial';

// A solar-eclipse event from Swiss's global search: classification plus the
// reliable instants (UT Julian Days). The contact fields go through
// normalizeSwissEclipse — the wrapper's own field names are misaligned with
// the underlying C array (see that helper) — and the finer phase windows are
// re-derived geometrically in eclipsePath.ts rather than read from Swiss.
export interface EclipseEvent {
  kind: SolarEclipseKind;
  /** Whether the shadow-cone axis itself crosses Earth's surface. */
  central: boolean;
  maximum: number;
  /** First/last external penumbral contact (P1/P4). */
  partialBegin: number;
  partialEnd: number;
}

// The next solar eclipse anywhere on Earth after (or before, with `backward`)
// the given UT JD. Wraps swe_sol_eclipse_when_glob; the path geometry itself is
// not exposed by Swiss — src/lib/astro/eclipsePath.ts derives it from positions.
export function findSolarEclipse(startJD: number, backward = false): EclipseEvent {
  const e = eph().findNextSolarEclipse(
    startJD,
    CalculationFlag.SwissEphemeris,
    0, // no type filter
    backward,
  );
  const kind: SolarEclipseKind =
    e.type & EclipseType.AnnularTotal
      ? 'hybrid'
      : e.type & EclipseType.Total
        ? 'total'
        : e.type & EclipseType.Annular
          ? 'annular'
          : 'partial';
  return {
    kind,
    central: (e.type & EclipseType.Central) !== 0,
    ...normalizeSwissEclipse(e),
  };
}

// ── Lunar eclipses ────────────────────────────────────────────────────────────

export type LunarEclipseKind = 'total' | 'partial' | 'penumbral';

/** A lunar-eclipse event from Swiss's search: classification plus the phase
 *  contacts (UT JDs), already remapped by normalizeSwissLunarEclipse. */
export interface LunarEclipseEvent extends LunarEclipseTimes {
  kind: LunarEclipseKind;
}

// The next lunar eclipse after (or before, with `backward`) the given UT JD.
// Wraps swe_lun_eclipse_when; visibility geometry (who sees it) is derived in
// src/lib/astro/lunarEclipse.ts from Moon positions.
export function findLunarEclipse(startJD: number, backward = false): LunarEclipseEvent {
  const e = eph().findNextLunarEclipse(
    startJD,
    CalculationFlag.SwissEphemeris,
    0, // no type filter
    backward,
  );
  const kind: LunarEclipseKind =
    e.type & EclipseType.Total
      ? 'total'
      : e.type & EclipseType.Partial
        ? 'partial'
        : 'penumbral';
  return { kind, ...normalizeSwissLunarEclipse(e) };
}

// Apparent geocentric Sun + Moon (equatorial, of date) plus sidereal time at one
// UT instant — the ephemeris adapter eclipsePath.ts builds Besselian elements
// from. Distances stay in AU (the adapter scales to Earth radii itself).
export function sunMoonEquatorial(jd: number): SunMoonSample {
  const sun = eph().calculatePosition(jd, Planet.Sun, FLAG_EQ);
  const moon = eph().calculatePosition(jd, Planet.Moon, FLAG_EQ);
  return {
    sunRa: norm2pi(sun.longitude * DEG2RAD),
    sunDec: sun.latitude * DEG2RAD,
    sunDistAu: sun.distance,
    moonRa: norm2pi(moon.longitude * DEG2RAD),
    moonDec: moon.latitude * DEG2RAD,
    moonDistAu: moon.distance,
    gast: gmstRadians(jd),
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
  | 'alcabitus'
  // The two axial systems — well-defined at every latitude including the polar
  // circles (Morinus references neither ASC, MC, nor Vertex). Note their 1st
  // cusp is an East Point, NOT the Ascendant; the wheel's angle diameters
  // already float free of the cusps (as for Whole Sign / Equal).
  | 'meridian'
  | 'morinus';

const HOUSE_MAP: Record<HouseSystem, SweHouse> = {
  placidus: SweHouse.Placidus,
  whole: SweHouse.WholeSign,
  equal: SweHouse.Equal,
  koch: SweHouse.Koch,
  regiomontanus: SweHouse.Regiomontanus,
  campanus: SweHouse.Campanus,
  porphyry: SweHouse.Porphyrius,
  alcabitus: SweHouse.Alcabitus,
  meridian: SweHouse.Meridian,
  morinus: SweHouse.Morinus,
};

export function relocate(
  jd: number,
  latDeg: number,
  lngDeg: number,
  system: HouseSystem = 'placidus',
): RelocatedAngles {
  let h;
  let fallback = false;
  try {
    h = eph().calculateHouses(jd, latDeg, lngDeg, HOUSE_MAP[system]);
  } catch (err) {
    // Placidus and Koch are mathematically undefined above the polar circles
    // (some house cusps never rise or set there). The Swiss Ephemeris C library
    // handles that case by computing Porphyry cusps instead and flagging an
    // error; the JS wrapper turns the flag into a throw WITHOUT the fallback
    // values, which would crash any chart relocated to a polar latitude. Apply
    // the same documented fallback here: Porphyry is defined at every latitude,
    // and the ASC/MC angles are house-system-independent either way. Only these
    // two systems get the fallback — a throw from any other system signals a
    // genuinely bad input and must surface, not silently become Porphyry. (See
    // docs/calculation-methods.md, "Houses at extreme latitudes".)
    if (system !== 'placidus' && system !== 'koch') throw err;
    h = eph().calculateHouses(jd, latDeg, lngDeg, SweHouse.Porphyrius);
    fallback = true;
  }
  const asc = norm2pi(h.ascendant * DEG2RAD);
  const mc = norm2pi(h.mc * DEG2RAD);
  const vertex = norm2pi(h.vertex * DEG2RAD);
  // Swiss cusps are 1-indexed (cusps[1] = house 1); re-base to 0-indexed.
  const cusps = Array.from({ length: 12 }, (_, i) => norm2pi(h.cusps[i + 1] * DEG2RAD));
  return {
    asc,
    mc,
    dsc: norm2pi(asc + Math.PI),
    ic: norm2pi(mc + Math.PI),
    vertex,
    antivertex: norm2pi(vertex + Math.PI),
    cusps,
    ...(fallback ? { fallback } : {}),
  };
}

/**
 * Directed bi-wheel angles for the time overlays. A directed / progressed chart has
 * no relocatable "second moment": its overlay-ring angle marks are the NATAL
 * relocated angles (`base`) advanced by the directional `arc`.
 *   - 'long' (solar-arc-in-longitude): the MC's ecliptic longitude advances by the arc,
 *     and everything that depends on LATITUDE — ASC/DSC, the Vertex, the cusps — is then
 *     re-derived from the RAMC that culminates that directed MC. The MC is the only angle
 *     a longitude arc advances directly, because it is a point on the ecliptic: for it,
 *     "the chart shifts in longitude" and "the meridian moves" are the same sentence.
 *     The Ascendant is not a linear function of the RAMC, so `natal ASC + arc` names a
 *     different point from the one that actually rises against the directed meridian —
 *     15° away at age 85 on the Jim Lewis chart, and 17° BELOW its own horizon.
 *   - 'ramc' (the classical meridian operation): an angle has no independent
 *     declination to freeze — it is fixed entirely by the RAMC. Since
 *     `armc = gmst(jd) + lng`, relocating at `lng + arc` advances the RAMC by exactly
 *     the arc and re-derives MC/ASC at the SAME latitude and obliquity (the audited
 *     angle engine the map frame already uses), giving the forward "MC advances
 *     ~1°/yr" motion rather than a declination-frozen RA shift or a rigid rotation.
 *   - Every latitude-dependent value — ASC/DSC, Vertex/Anti-Vertex, and all twelve
 *     CUSPS — is re-derived from the advanced RAMC in BOTH frames ('long' uses the RAMC
 *     that culminates the directed MC), so the directed ring shows real directed points,
 *     never natal ones arc-shifted. The cusps matter beyond the house spokes: `WheelSvg`
 *     INFERS Whole Sign from them and anchors the wheel on `cusps[0]`, so leaving them
 *     natal drew the whole directed wheel on the natal rising sign.
 * `arc`/`frame` absent (transits / synastry / Natal-Frame progressed) → `base`.
 * See docs/calculation-methods.md, "Directed-overlay angles".
 */
export function directedAngles(
  base: RelocatedAngles,
  angleJd: number,
  latDeg: number,
  lngDeg: number,
  system: HouseSystem,
  arc: number | undefined,
  frame: 'long' | 'ramc' | undefined,
): RelocatedAngles {
  if (!arc || !frame) return base;
  if (frame === 'long') {
    const mc = norm2pi(base.mc + arc);
    // Advance the MC in longitude, convert THAT to an RAMC, and re-derive every
    // latitude-dependent angle from it — one relocate() at this pin's own meridian.
    // `timeline.ramcOfLong` performs the same construction for the map frame; the two
    // agree where they are evaluated at the same meridian.
    const eps = obliquity(angleJd);
    const advRamc = eclipticToRaDec(mc, 0, eps).ra;
    const d = relocate(angleJd, latDeg, ((advRamc - gmstRadians(angleJd)) * 180) / Math.PI, system);
    return {
      ...base,
      asc: d.asc,
      // eclipticToRaDec → eclipticLonOfRA round-trips, so d.mc equals `mc` to 1e-12.
      // The explicit form is kept because it is what the method MEANS: this frame is
      // defined by the MC's longitude advance, and the RAMC is derived from it.
      mc,
      dsc: d.dsc,
      ic: norm2pi(mc + Math.PI),
      vertex: d.vertex,
      antivertex: d.antivertex,
      cusps: d.cusps,
      // Describes the cusps being RETURNED, so it must follow d, not base.
      fallback: d.fallback,
    };
  }
  // 'ramc': advance the RAMC by the arc and re-derive ALL angles — including the
  // Vertex and the cusps — at the same place.
  const d = relocate(angleJd, latDeg, lngDeg + (arc * 180) / Math.PI, system);
  return {
    ...base,
    asc: d.asc,
    mc: d.mc,
    dsc: d.dsc,
    ic: d.ic,
    vertex: d.vertex,
    antivertex: d.antivertex,
    cusps: d.cusps,
    fallback: d.fallback,
  };
}

/**
 * A chart's frame on a geodetic map: the place's own geodetic angles, and the
 * house cusps of the reader's system computed FROM them — the way a table of houses
 * is read: enter it with the RAMC that culminates the geodetic MC and the place's
 * latitude. The system is a method; only its two inputs are geodetic. Argument
 * order follows relocate() (latitude, then longitude), unlike geodeticAngles.
 *
 * - Angles come from geodeticAngles at the chart's obliquity of date, so they agree
 *   with the Swiss cusps below to ~1e-12 (verify-geodetic §3, §6).
 * - Cusps: the same RAMC inversion directedAngles' 'long' frame uses — relocate()
 *   at the fictitious longitude whose sidereal time is that RAMC.
 * - Regiomontanus and Campanus inside the polar circles: where the closed-form
 *   Ascendant lands on the western horizon, Swiss turns its MC (and every cusp) by
 *   180° and numbers the twelve house circles CLOCKWISE from it, so its cusp 10
 *   lands on the geodetic IC. The geodetic MC is the longitude by definition, so the
 *   same twelve points are read COUNTER-clockwise instead (cusp 1 = AS, cusp 10 = MC,
 *   every house positive). Porphyry with the fallback caution is the alternative
 *   put to review; the mirror is the default until that is ruled on. No other
 *   system turns. (2026-10-02)
 * - The Vertex is NaN: geodetic maps draw the four angles only.
 * - `fallback` is relocate()'s, unchanged: Placidus/Koch inside the circles are
 *   Porphyry cusps here too, and the wheel's caution must still say so.
 * - Two places have no Ascendant: where the ecliptic lies IN the horizon (latitude
 *   90° − ε on 90°W, and its antipode). There the closed form and the Ascendant
 *   Swiss builds its cusps from can be tens of degrees apart, so cusp 1 = AS fails;
 *   the gap passes 1″ only within ~1e-7° (about a centimetre of ground) of either
 *   point, so it is recorded here rather than guarded. (2026-10-02)
 */
export function geodeticFrame(
  jd: number,
  latDeg: number,
  lngDeg: number,
  system: HouseSystem,
): RelocatedAngles {
  // obliquity(jd) is taken here, not passed in, so the angles and Swiss's cusps
  // are computed against the same ε.
  const g = geodeticAngles(lngDeg, latDeg, obliquity(jd));
  const d = relocate(jd, latDeg, ((g.ramc - gmstRadians(jd)) * 180) / Math.PI, system);
  const turned = Math.abs(Math.atan2(Math.sin(d.mc - g.mc), Math.cos(d.mc - g.mc))) > Math.PI / 2;
  const cusps = turned ? d.cusps.map((_, k) => d.cusps[(12 - k) % 12]) : d.cusps;
  return {
    asc: g.asc,
    mc: g.mc,
    dsc: g.dsc,
    ic: g.ic,
    cusps,
    vertex: NaN,
    antivertex: NaN,
    geodetic: true,
    ...(d.fallback ? { fallback: true } : {}),
  };
}
