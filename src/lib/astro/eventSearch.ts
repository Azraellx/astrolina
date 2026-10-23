// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Find the moment (2026-10-20): the instant the sky does a named thing — a body enters a
// sign, the Moon is new or full, an eclipse peaks, a planet stations, two bodies reach an
// aspect — searched forward or back from a starting instant. It is what lets an event chart
// be cast for the moment it is about rather than for a date somebody looked up.
//
// Every longitude here is the one the wheel shows: apparent geocentric ecliptic longitude
// from Swiss (ephemeris.ts bodyLonSpeed, the same flags getEclipticPositions uses), so a
// found moment is one where the chart cast for it says what the search said. Ingresses
// follow the active zodiac — a sidereal Aries ingress is the Sun reaching 0° of SIDEREAL
// Aries, with the ayanamsa applied at each instant as transitMovers does — because the
// sign a body is "in" is a reading in that zodiac (CLAUDE.md rule 5: answer a question
// about the chart in the frame the chart is read in). A lunation, an aspect, a station and
// an eclipse are the same instant in every zodiac; only the sign their detail names moves.
//
// Pure and synchronous, and it imports only ephemeris.ts, ayanamsa.ts and timeline.ts —
// never eclipses.ts, which stays a lazy chunk with its catalogue. The UI runs it in slices
// (searchEvent) so a long search never holds the main thread; nothing here may be called
// from a render useMemo.
//
// ── ONE SOLVER for ingresses, lunations and aspects ─────────────────────────────────────
// The target function is a wrapped angle, φ(t) = λA − λB − ayanamsa − target, wrapped into
// (−P/2, P/2], with P = 360° (or 30° for "the next sign"). Each sample is one
// `bodyLonSpeed` per body, and the speed rides in the same call, so φ′ costs nothing extra.
//
//   · STEP: a guaranteed lower bound on the time φ needs to reach zero — the larger of
//       (d − δ)/R                                    (it cannot move faster than R)
//       (−v + √(v² + 2Q·(d − δ)))/Q                  (starting at v, accelerating at most Q)
//     with d = |φ|, v = |φ′|, R and Q the sum of the two bodies' measured maxima
//     (MAX_SPEED_DEG, MAX_ACCEL_DEG), clamped to [1 h, 3 yr]. Above 1 h the step cannot
//     reach zero at all; the clamp to 1 h is where a crossing is found.
//   · δ is the light-deflection bump. Swiss's APPARENT longitude bends by up to ~4.4″
//     where a planet passes the Sun (measured 1800–2200; DEFLECTION_BUMP_DEG), and the
//     reported speed there spikes by up to ~0.05°/day for a few minutes — Neptune's falls
//     from 0.039 to 0.011, and below zero on its closest passes. The tables bound the
//     GEOMETRIC motion (which the apparent one is, away from the Sun); δ = 2·(bump A +
//     bump B) covers the displacement, and the acceleration bound is not used while a
//     deflected body is within DEFLECTION_REACH_DEG of the Sun, because the speed it starts
//     from is then not the speed of the motion it bounds. (Measured: beyond 15° the term
//     moves the speed by under 1e-6°/day.)
//   · BRACKET: a crossing counts only when φ changes sign AND |φ₀| + |φ₁| < P/2. The step
//     bound means no step covers both zero and the ±P/2 seam, so the seam's jump is never
//     read as a crossing.
//   · TWO CROSSINGS IN ONE STEP can happen only inside the 1 h minimum, and only with a
//     relative station inside it (a planet turning on a cusp). When φ′ changes sign across
//     such a step and φ does not, the relative station is found and φ tested there; if it
//     crossed, the step holds two crossings and is split.
//   · REFINE: safeguarded Newton with φ′ (Numerical Recipes' rtsafe: bisect whenever the
//     Newton step leaves the bracket or stops halving it), until a step is under 1e-7 day
//     (≈9 ms). Newton is quadratic there, so the instant is good to far better than that.
//
// ── Stations ────────────────────────────────────────────────────────────────────────────
// The function is the speed itself. Steps are |s|/amax, clamped to [1 h, STATION_STEP_CAP]
// — and it is the CAP that makes the march exhaustive, being under half the shortest time
// between two stations of that body, so no step can hold two. A speed root then counts
// only away from the Sun (STATION_SUN_EXCLUSION_DEG): the deflection spike above takes
// Neptune's and Pluto's reported speed below zero for minutes at their closest passes, and
// that is not a station by anyone's reading. Real stations stand at least ~14° (Mercury)
// from the Sun. Illinois refinement, to under 1e-6 day; for Jupiter to Pluto, whose speed
// turns so slowly that Swiss's ~1e-8°/day of noise moves the raw root by a second or two,
// the instant is then read off a line fitted on a fixed half-hour grid (fitStation), so the
// same station found from either side is the same instant.
//
// ── Eclipses ────────────────────────────────────────────────────────────────────────────
// Swiss's own searches (findSolarEclipse / findLunarEclipse), at greatest eclipse. Swiss
// accepts a result up to 0.0001 day before its start, so a search from a found eclipse's
// own instant returns that eclipse again; when it does, the search restarts a day past it.
// Eclipses are at least 29 days apart, so the day cannot skip one.
//
// ── Strictly next or previous ───────────────────────────────────────────────────────────
// A result lies more than `marginSec` past the start: 1 s by default (returns.ts's
// ONE_SECOND_DAYS), and 60 s when the start is a minute the form holds
// (FORM_MINUTE_MARGIN_SEC) — otherwise, once an ingress has been rounded up to 14:46,
// Previous from 14:46 would find the 14:45:58 ingress it came from.
//
// ── Range ───────────────────────────────────────────────────────────────────────────────
// The default is the ephemeris files' span (EPHEMERIS_SPAN, 1800–2399). The form passes its
// own year range shrunk by the largest zone offset and a minute (searchRangeForYears), so a
// result's local date can never fail the form's year check. A null from bodyLonSpeed is the range
// edge. No horizon beyond the range: Pluto into a given sign can take 248 years.
//
// ── Cost, measured once (2026-10-20) ────────────────────────────────────────────────────
// The browser's WASM engine under V8 (Node 24, 10,000 calls each): 6–16 µs a
// calculatePosition (marching one body ≈10 µs, two bodies in turn ≈6 µs, scattered dates
// ≈16 µs) — the same order as the native binding — and 0.5–1.0 ms a Swiss eclipse search.
// Searches in calls (verify:event-search §g holds each to twice these): the next equinox 6,
// the Moon into a sign 16–21, a lunation 16–28, a Mercury station 11, a Saturn station 47,
// Pluto into Pisces (2043) 111, Jupiter conjunct Saturn (2040) 252 — a few milliseconds at
// most. The worst of every slow pair, aspect and direction from 1800 and from 2026 is
// Neptune trine Pluto from 1800, 1,820 calls (the two hover within a few degrees of it for
// decades), and a search that finds nothing in the whole range back to 1800 about 900:
// tens of milliseconds, which is why the UI still searches in slices and can be cancelled.
// No Web Worker: it would need a second WASM instance and its own copy of the .se1 files.
import {
  bodyLonSpeed,
  findLunarEclipse,
  findSolarEclipse,
  type LunarEclipseKind,
  type SolarEclipseKind,
} from '../ephemeris';
import { ayanamsaRad, type ZodiacMode } from './ayanamsa';
import { epochMsToJD, jdToEpochMs } from './timeline';

// ── What can be searched ────────────────────────────────────────────────────────────────

/** The bodies a search can name: the luminaries and the planets. Left out of v1, and why:
 *  the nodes (a mean/true choice, and mostly retrograde), Chiron and the asteroids (an
 *  on-demand file) and Lilith. Wheel order. */
export type EventBody =
  | 'Sun'
  | 'Moon'
  | 'Mercury'
  | 'Venus'
  | 'Mars'
  | 'Jupiter'
  | 'Saturn'
  | 'Uranus'
  | 'Neptune'
  | 'Pluto';

/** A body that stations — everything but the luminaries, which never turn. */
export type StationBody = Exclude<EventBody, 'Sun' | 'Moon'>;

export type EventAspect = 'conjunction' | 'sextile' | 'square' | 'trine' | 'opposition';

export const EVENT_BODIES: readonly EventBody[] = [
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

export const STATION_BODIES: readonly StationBody[] = [
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
  'Pluto',
];

export const EVENT_ASPECTS: readonly EventAspect[] = [
  'conjunction',
  'sextile',
  'square',
  'trine',
  'opposition',
];

/** Each aspect's separation in ecliptic longitude, degrees. */
export const ASPECT_ANGLE_DEG: Record<EventAspect, number> = {
  conjunction: 0,
  sextile: 60,
  square: 90,
  trine: 120,
  opposition: 180,
};

export type EventSpec =
  /** `sign` 0 = Aries … 11 = Pisces, or 'any' for the next sign whichever it is. A
   *  retrograde entry INTO the sign counts (Rx): Previous and Next step through every entry
   *  in time order. */
  | { kind: 'ingress'; body: EventBody; sign: number | 'any' }
  | { kind: 'new-moon' }
  | { kind: 'full-moon' }
  | { kind: 'solar-eclipse' }
  | { kind: 'lunar-eclipse' }
  | { kind: 'station'; body: StationBody; turn: 'retrograde' | 'direct' | 'any' }
  | { kind: 'aspect'; a: EventBody; b: EventBody; aspect: EventAspect };

/** What was found, for naming it. Every `sign` is read in the search's zodiac (0 = Aries):
 *  the sign entered; the Moon's at a lunation or lunar eclipse; the Sun's at a solar
 *  eclipse (the body eclipsed); the station's; body A's at an aspect. */
export type EventDetail =
  | { kind: 'ingress'; body: EventBody; sign: number; retrograde: boolean; zodiac: ZodiacMode }
  | { kind: 'new-moon' | 'full-moon'; sign: number }
  | { kind: 'solar-eclipse'; type: SolarEclipseKind; central: boolean; sign: number }
  | { kind: 'lunar-eclipse'; type: LunarEclipseKind; sign: number }
  | { kind: 'station'; body: StationBody; turn: 'retrograde' | 'direct'; sign: number }
  | {
      kind: 'aspect';
      a: EventBody;
      b: EventBody;
      aspect: EventAspect;
      retrogradeA: boolean;
      retrogradeB: boolean;
      sign: number;
    };

/** One found moment: the exact instant (UT Julian Day, to well under a second) and what it is. */
export interface EventHit {
  jd: number;
  detail: EventDetail;
}

export interface SearchOpts {
  /** The zodiac ingresses (and every detail's `sign`) are read in. Default tropical. */
  zodiac?: ZodiacMode;
  /** The range searched, UT Julian Days. Default EPHEMERIS_SPAN. */
  minJD?: number;
  maxJD?: number;
  /** How far past the start a result must lie, seconds. Default 1; FORM_MINUTE_MARGIN_SEC
   *  when the start is a minute the form holds rather than an exact instant. */
  marginSec?: number;
  /** Counts Swiss calls (a position, or an eclipse search), for the budgets in the suite. */
  stats?: { calls: number };
}

export interface SliceOpts extends SearchOpts {
  /** Stop and hand back a resume point once the search front passes this instant. */
  untilJD: number;
  /** …or once `performance.now()` passes this (ms). Infinity runs to the end. */
  deadline: number;
}

export type SliceResult =
  | { found: EventHit }
  | { resumeJD: number }
  | { none: true; limitJD: number };

export type SearchResult =
  | { found: EventHit }
  | { none: true; limitJD: number }
  | { aborted: true };

/** The span the bundled ephemeris files cover: 1800-01-01 to 2400-01-01, 0h UT. */
export const EPHEMERIS_SPAN = { minJD: 2378496.5, maxJD: 2597641.5 } as const;

/** The start margin for a minute the form holds (see the header). */
export const FORM_MINUTE_MARGIN_SEC = 60;

// ── The measured tables ─────────────────────────────────────────────────────────────────
// Measured 2026-10-20 with the native binding against the repo's .se1 files, 1800–2200,
// every 0.5 day (0.1 day for the Moon), and rounded UP by 3–6% so the bound survives the
// sampling. They bound the GEOMETRIC motion: the apparent motion away from the Sun, where the
// two agree to 1e-6°/day, and the engine read without light deflection within
// DEFLECTION_REACH_DEG of it. verify:event-search §f re-measures every figure that way and
// fails if one stops bounding the ephemeris. The step bound is only as good as these: a
// table that underestimates lets a step reach zero, which is the failure the whole design
// exists to rule out.

/** Largest |dλ/dt|, degrees/day (measured: Sun 1.0199, Moon 15.398, Mercury 2.2029,
 *  Venus 1.2589, Mars 0.7914, Jupiter 0.2425, Saturn 0.1304, Uranus 0.0632, Neptune 0.0381,
 *  Pluto 0.0405 — the outer planets' figures sampled through the deflection spike read
 *  higher, Neptune 0.0433, and the table covers those too). */
export const MAX_SPEED_DEG: Record<EventBody, number> = {
  Sun: 1.05,
  Moon: 15.8,
  Mercury: 2.27,
  Venus: 1.3,
  Mars: 0.82,
  Jupiter: 0.25,
  Saturn: 0.137,
  Uranus: 0.067,
  Neptune: 0.045,
  Pluto: 0.042,
};

/** Largest |d²λ/dt²|, degrees/day², of the geometric motion — read through the apparent
 *  speed near the Sun, the deflection spike (see the header) inflates the outer planets'
 *  figure up to ninetyfold (Neptune 0.054 against 0.0006), and that is covered by δ and the
 *  near-Sun rule instead. Measured: Sun 0.00067, Moon 0.5155, Mercury 0.1986, Venus 0.0424,
 *  Mars 0.0152, Jupiter 0.00353, Saturn 0.00192, Uranus 0.00097, Neptune 0.00061,
 *  Pluto 0.00063. */
export const MAX_ACCEL_DEG: Record<EventBody, number> = {
  Sun: 0.0007,
  Moon: 0.535,
  Mercury: 0.207,
  Venus: 0.0445,
  Mars: 0.016,
  Jupiter: 0.0037,
  Saturn: 0.002,
  Uranus: 0.00102,
  Neptune: 0.00064,
  Pluto: 0.00066,
};

/** The pairs that can never stand far apart, with their greatest separation in longitude
 *  (degrees, measured 1800–2200: 27.79, 47.28, 73.76, rounded up). An aspect wider than
 *  this never forms, and the option says so rather than searching the whole range. */
export const MAX_SEPARATION_DEG: ReadonlyArray<{ a: EventBody; b: EventBody; deg: number }> = [
  { a: 'Sun', b: 'Mercury', deg: 28 },
  { a: 'Sun', b: 'Venus', deg: 48 },
  { a: 'Mercury', b: 'Venus', deg: 74 },
];

/** The light-deflection bump: how far the APPARENT longitude stands from the geometric one
 *  at worst, degrees — 6″ against a measured 1.4″ (Mercury) to 4.4″ (Neptune). Zero for
 *  the luminaries: the Sun does not deflect its own light, and the Moon is too near. */
export const DEFLECTION_BUMP_DEG = 6 / 3600;

/** Within this elongation from the Sun a deflected body's reported speed is not trusted as
 *  the start of a bounded motion (the acceleration bound is skipped). */
export const DEFLECTION_REACH_DEG = 15;

/** A speed root nearer the Sun than this is the deflection spike, not a station. */
export const STATION_SUN_EXCLUSION_DEG = 5;

/** The longest station step per body, days: under half the shortest time between two of
 *  its stations (the shortest retrograde: Mercury ~20 d, Venus ~40, Mars ~60, Jupiter
 *  ~118, Saturn ~133, Uranus ~150, Neptune ~157, Pluto ~150; §f measures them), so one
 *  step never holds two stations and a sign change of the speed is never cancelled out. */
export const STATION_STEP_CAP_DAYS: Record<StationBody, number> = {
  Mercury: 7,
  Venus: 15,
  Mars: 20,
  Jupiter: 40,
  Saturn: 45,
  Uranus: 50,
  Neptune: 50,
  Pluto: 50,
};

// ── Small helpers ───────────────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;
const TWO_PI = 2 * Math.PI;
const SECOND_DAYS = 1 / 86_400;
const HOUR_DAYS = 1 / 24;
const MAX_STEP_DAYS = 3 * 365.25;
/** Refinement stops once a Newton step is under this (≈9 ms). */
const NEWTON_TOL_DAYS = 1e-7;
/** Station refinement stops once the bracket is under this (≈0.09 s). */
const STATION_TOL_DAYS = 1e-6;
const MINUTE_MS = 60_000;

const norm2pi = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;

/** x wrapped into (−P/2, P/2]. */
function wrapP(x: number, period: number): number {
  const half = period / 2;
  let v = x % period;
  if (v > half) v -= period;
  else if (v <= -half) v += period;
  return v;
}

const signOf = (lon: number) => Math.floor(norm2pi(lon) / (Math.PI / 6)) % 12;

const now = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

/** A good-to-a-fraction-of-a-degree Sun (the low-precision almanac formula), for one
 *  question only: is a body within DEFLECTION_REACH_DEG of the Sun? It costs no Swiss call;
 *  §f holds it within 1° of Swiss's Sun over the whole range, against a 15° threshold. */
export function approxSunLon(jd: number): number {
  const n = jd - 2451545.0;
  const g = (357.528 + 0.9856003 * n) * DEG;
  return norm2pi((280.46 + 0.9856474 * n + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG);
}

/** The bodies whose apparent position bends near the Sun. */
const deflected = (b: EventBody) => b !== 'Sun' && b !== 'Moon';

/** One Swiss sample, counted. Null = the range edge. */
function lonSpeed(jd: number, body: EventBody, stats?: { calls: number }) {
  if (stats) stats.calls += 1;
  return bodyLonSpeed(jd, body);
}

// ── Public helpers: impossibility, rounding, range ──────────────────────────────────────

/** The pair's greatest separation when `aspect` can never form between them, else null.
 *  0 for a body with itself. */
export function impossibleAspect(a: EventBody, b: EventBody, aspect: EventAspect): number | null {
  if (a === b) return 0;
  const row = MAX_SEPARATION_DEG.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
  if (!row) return null;
  return ASPECT_ANGLE_DEG[aspect] > row.deg ? row.deg : null;
}

/** How a found instant becomes the minute a chart carries (BirthData holds no seconds). */
export type ChartRound = 'ceil' | 'nearest';

/** An ingress rounds UP, so the saved chart shows the body in its new sign rather than at
 *  29°59′ of the old one (the March 2026 equinox, 14:45:58 UT, becomes 14:46, which is also
 *  the published minute). Everything else rounds to the nearest minute. */
export function chartRoundFor(detail: EventDetail): ChartRound {
  return detail.kind === 'ingress' ? 'ceil' : 'nearest';
}

/** Epoch ms to a whole minute by `round`. The one rounding rule — the form's wall clock is
 *  rounded with it too, so the minute shown and the minute saved cannot differ. */
export function roundToMinute(ms: number, round: ChartRound): number {
  return (round === 'ceil' ? Math.ceil(ms / MINUTE_MS) : Math.round(ms / MINUTE_MS)) * MINUTE_MS;
}

/** The minute (epoch ms UT) the chart for `hit` will carry. */
export function chartInstantOf(hit: EventHit): number {
  return roundToMinute(jdToEpochMs(hit.jd), chartRoundFor(hit.detail));
}

/** The form's range for a search: 1 Jan of `yearMin` to 31 Dec of `yearMax` (UT), each end
 *  moved inward by `inwardSeconds` (the largest zone offset, MAX_ZONE_OFFSET_SECONDS) and a
 *  minute more — the chart carries the instant ROUNDED, an ingress up — so the date the chart
 *  shows lands inside the years in any zone, and the form's year check can never refuse it. */
export function searchRangeForYears(
  yearMin: number,
  yearMax: number,
  inwardSeconds: number,
): { minJD: number; maxJD: number } {
  const jan1 = (y: number) => {
    const d = new Date(Date.UTC(2000, 0, 1));
    d.setUTCFullYear(y, 0, 1);
    return epochMsToJD(d.getTime());
  };
  const shrink = (inwardSeconds + 60) * SECOND_DAYS;
  return { minJD: jan1(yearMin) + shrink, maxJD: jan1(yearMax + 1) - shrink };
}

// ── The angle solver (ingresses, lunations, aspects) ────────────────────────────────────

interface Track {
  /** φ's zero, radians. */
  target: number;
  /** The wrap period, radians: 2π, or π/6 for "the next sign". */
  period: number;
  /** Which way φ must cross: +1 rising, −1 falling, 0 either. */
  accept: 1 | -1 | 0;
}

interface AngleSample {
  t: number;
  lonA: number;
  vA: number;
  lonB: number;
  vB: number;
  /** λA − λB − ayanamsa, radians (unwrapped). */
  x: number;
  /** dx/dt, radians/day. */
  rate: number;
}

interface AngleProblem {
  a: EventBody;
  b: EventBody | null;
  /** Applied to x only for an ingress (it cancels from a difference of two longitudes). */
  zodiac: ZodiacMode;
  sidereal: boolean;
  tracks: Track[];
  /** Bound constants, radians and days. */
  R: number;
  Q: number;
  delta: number;
  anyDeflected: boolean;
  detail: (s: AngleSample, track: Track, sense: 1 | -1) => EventDetail;
}

function sampleAngle(p: AngleProblem, t: number, stats?: { calls: number }): AngleSample | null {
  const A = lonSpeed(t, p.a, stats);
  if (!A) return null;
  let lonB = 0;
  let vB = 0;
  if (p.b) {
    const B = lonSpeed(t, p.b, stats);
    if (!B) return null;
    lonB = B.lon;
    vB = B.speed;
  }
  let x = A.lon - lonB;
  let rate = (A.speed - vB) * DEG;
  if (p.sidereal) {
    x -= ayanamsaRad(t, p.zodiac);
    // The ayanamsa's own rate (~50″/yr), for Newton's derivative.
    rate -= ayanamsaRad(t + 0.5, p.zodiac) - ayanamsaRad(t - 0.5, p.zodiac);
  }
  return { t, lonA: A.lon, vA: A.speed, lonB, vB, x, rate };
}

const phi = (tr: Track, s: AngleSample) => wrapP(s.x - tr.target, tr.period);

/** Whether a deflected body of the problem stands within DEFLECTION_REACH_DEG of the Sun. */
function nearSun(p: AngleProblem, s: AngleSample): boolean {
  if (!p.anyDeflected) return false;
  const reach = DEFLECTION_REACH_DEG * DEG;
  const sun = p.a === 'Sun' ? s.lonA : p.b === 'Sun' ? s.lonB : approxSunLon(s.t);
  const close = (lon: number) => Math.abs(wrapP(lon - sun, TWO_PI)) < reach;
  return (deflected(p.a) && close(s.lonA)) || (!!p.b && deflected(p.b) && close(s.lonB));
}

/** The guaranteed lower bound on the time φ needs to reach zero from distance d (rad) at
 *  speed v (rad/day). Not clamped. */
function boundDays(p: AngleProblem, d: number, v: number, near: boolean): number {
  const reach = d - p.delta;
  if (reach <= 0) return 0;
  let lb = reach / p.R;
  if (!near) {
    const acc = (Math.sqrt(v * v + 2 * p.Q * reach) - v) / p.Q;
    if (acc > lb) lb = acc;
  }
  return lb;
}

function angleProblem(spec: EventSpec, zodiac: ZodiacMode): AngleProblem | null {
  const sidereal = zodiac !== 'tropical';
  const make = (
    a: EventBody,
    b: EventBody | null,
    tracks: Track[],
    detail: AngleProblem['detail'],
    applyZodiac: boolean,
  ): AngleProblem => ({
    a,
    b,
    zodiac,
    sidereal: applyZodiac && sidereal,
    tracks,
    // The ayanamsa moves ~3.8e-5°/day (50″ a year); 1e-4 is added to R so the speed bound
    // stays a bound in a sidereal zodiac.
    R: (MAX_SPEED_DEG[a] + (b ? MAX_SPEED_DEG[b] : 0) + (applyZodiac && sidereal ? 1e-4 : 0)) * DEG,
    Q: (MAX_ACCEL_DEG[a] + (b ? MAX_ACCEL_DEG[b] : 0)) * DEG,
    delta:
      2 * ((deflected(a) ? DEFLECTION_BUMP_DEG : 0) + (b && deflected(b) ? DEFLECTION_BUMP_DEG : 0)) * DEG,
    anyDeflected: deflected(a) || (!!b && deflected(b)),
    detail,
  });
  // A sign in the search's zodiac, at the sample (the ayanamsa is in x only for ingresses).
  const signAt = (lon: number, t: number) => signOf(lon - (sidereal ? ayanamsaRad(t, zodiac) : 0));

  switch (spec.kind) {
    case 'ingress': {
      const { body, sign } = spec;
      if (sign === 'any') {
        // Every cusp at once: φ wraps every 30°. The sign entered comes from the cusp
        // reached and the direction of the crossing.
        return make(
          body,
          null,
          [{ target: 0, period: Math.PI / 6, accept: 0 }],
          (s, _tr, sense) => {
            const cusp = Math.round(norm2pi(s.x) / (Math.PI / 6)) % 12;
            return {
              kind: 'ingress',
              body,
              sign: sense > 0 ? cusp : (cusp + 11) % 12,
              retrograde: sense < 0,
              zodiac,
            };
          },
          true,
        );
      }
      if (!Number.isInteger(sign) || sign < 0 || sign > 11) return null;
      // Into sign S: its own cusp crossed going forward (direct entry), or the next sign's
      // cusp crossed going backward (a retrograde entry from the sign after).
      const entry: Track = { target: sign * 30 * DEG, period: TWO_PI, accept: 1 };
      const rxEntry: Track = { target: ((sign + 1) % 12) * 30 * DEG, period: TWO_PI, accept: -1 };
      return make(
        body,
        null,
        [entry, rxEntry],
        (_s, tr) => ({ kind: 'ingress', body, sign, retrograde: tr === rxEntry, zodiac }),
        true,
      );
    }
    case 'new-moon':
    case 'full-moon': {
      const kind = spec.kind;
      // The elongation always increases (the Moon is always the faster), so one target and
      // no stations.
      return make(
        'Moon',
        'Sun',
        [{ target: kind === 'new-moon' ? 0 : Math.PI, period: TWO_PI, accept: 0 }],
        (s) => ({ kind, sign: signAt(s.lonA, s.t) }),
        false,
      );
    }
    case 'aspect': {
      const { a, b, aspect } = spec;
      if (a === b || impossibleAspect(a, b, aspect) !== null) return null;
      const alpha = ASPECT_ANGLE_DEG[aspect] * DEG;
      // ±α for the three aspects that come in two senses; one target for 0° and 180°.
      const targets = alpha === 0 || alpha === Math.PI ? [alpha] : [alpha, -alpha];
      return make(
        a,
        b,
        targets.map((target) => ({ target, period: TWO_PI, accept: 0 as const })),
        (s) => ({
          kind: 'aspect',
          a,
          b,
          aspect,
          retrogradeA: s.vA < 0,
          retrogradeB: s.vB < 0,
          sign: signAt(s.lonA, s.t),
        }),
        false,
      );
    }
    default:
      return null;
  }
}

/** The instant inside [lo, hi] where the relative motion turns (φ′ = 0), by bisection on
 *  the rate — only ever asked for within a 1 h step, so a dozen halvings reach ~1 s. */
function relativeStation(
  p: AngleProblem,
  lo: AngleSample,
  hi: AngleSample,
  stats?: { calls: number },
): AngleSample | null {
  let a = lo;
  let b = hi;
  let mid: AngleSample | null = null;
  for (let i = 0; i < 14; i++) {
    mid = sampleAngle(p, (a.t + b.t) / 2, stats);
    if (!mid) return null;
    if ((mid.rate <= 0) === (a.rate <= 0)) a = mid;
    else b = mid;
  }
  return mid;
}

/** Safeguarded Newton inside a bracket whose ends straddle φ = 0 (rtsafe). */
function refine(
  p: AngleProblem,
  tr: Track,
  lo: AngleSample,
  hi: AngleSample,
  stats?: { calls: number },
): AngleSample | null {
  let a = lo;
  let b = hi;
  let fa = phi(tr, a);
  let x = Math.abs(fa) < Math.abs(phi(tr, b)) ? a : b;
  let fx = phi(tr, x);
  let dxOld = b.t - a.t;
  let dx = dxOld;
  for (let i = 0; i < 100; i++) {
    const newton = x.rate !== 0 ? x.t - fx / x.rate : NaN;
    let tNext: number;
    if (!(newton > a.t && newton < b.t) || Math.abs(2 * fx) > Math.abs(dxOld * x.rate)) {
      // Out of the bracket, or not halving it: bisect.
      dxOld = dx;
      dx = (b.t - a.t) / 2;
      tNext = a.t + dx;
    } else {
      dxOld = dx;
      dx = Math.abs(newton - x.t);
      tNext = newton;
    }
    const s = sampleAngle(p, tNext, stats);
    if (!s) return null;
    const f = phi(tr, s);
    if ((f <= 0) === (fa <= 0)) {
      a = s;
      fa = f;
    } else {
      b = s;
    }
    x = s;
    fx = f;
    if (dx < NEWTON_TOL_DAYS || b.t - a.t < NEWTON_TOL_DAYS) break;
  }
  return x;
}

/** Every accepted crossing inside one step, refined; the first in the search direction. */
function crossingIn(
  p: AngleProblem,
  s0: AngleSample,
  s1: AngleSample,
  raws: number[],
  dir: 1 | -1,
  start: number,
  stats?: { calls: number },
): EventHit | null {
  const [lo, hi] = s0.t < s1.t ? [s0, s1] : [s1, s0];
  const span = hi.t - lo.t;
  const brackets: Array<{ tr: Track; lo: AngleSample; hi: AngleSample }> = [];
  let station: AngleSample | null | undefined;
  p.tracks.forEach((tr, k) => {
    const f0 = phi(tr, lo);
    const f1 = phi(tr, hi);
    if ((f0 <= 0) !== (f1 <= 0)) {
      if (Math.abs(f0) + Math.abs(f1) < tr.period / 2) brackets.push({ tr, lo, hi });
      return;
    }
    // No net crossing. Two are possible only where the bound let this track reach zero at
    // all (the 1 h minimum) and the relative motion turned inside the step.
    if (raws[k] >= span || (lo.rate <= 0) === (hi.rate <= 0)) return;
    if (station === undefined) station = relativeStation(p, lo, hi, stats);
    if (!station) return;
    const fm = phi(tr, station);
    if ((fm <= 0) === (f0 <= 0)) return;
    if (Math.abs(f0) + Math.abs(fm) < tr.period / 2) brackets.push({ tr, lo, hi: station });
    if (Math.abs(fm) + Math.abs(f1) < tr.period / 2) brackets.push({ tr, lo: station, hi });
  });
  let best: EventHit | null = null;
  for (const br of brackets) {
    const sense: 1 | -1 = phi(br.tr, br.lo) <= 0 ? 1 : -1;
    if (br.tr.accept !== 0 && br.tr.accept !== sense) continue;
    const r = refine(p, br.tr, br.lo, br.hi, stats);
    if (!r || dir * (r.t - start) <= 0) continue;
    if (!best || dir * (r.t - best.jd) < 0) best = { jd: r.t, detail: p.detail(r, br.tr, sense) };
  }
  return best;
}

function marchAngle(
  p: AngleProblem,
  start: number,
  dir: 1 | -1,
  limit: number,
  opts: SliceOpts,
): SliceResult {
  const { stats } = opts;
  let s0 = sampleAngle(p, start, stats);
  if (!s0) return { none: true, limitJD: start };
  for (;;) {
    if (dir * (s0.t - limit) >= 0) return { none: true, limitJD: limit };
    const near = nearSun(p, s0);
    const v = Math.abs(s0.rate);
    const raws = p.tracks.map((tr) => boundDays(p, Math.abs(phi(tr, s0!)), v, near));
    const step = Math.min(Math.max(Math.min(...raws), HOUR_DAYS), MAX_STEP_DAYS);
    let t1 = s0.t + dir * step;
    if (dir * (t1 - limit) > 0) t1 = limit;
    const s1 = sampleAngle(p, t1, stats);
    if (!s1) return { none: true, limitJD: s0.t };
    const hit = crossingIn(p, s0, s1, raws, dir, start, stats);
    if (hit) return { found: hit };
    s0 = s1;
    if (dir * (s0.t - opts.untilJD) >= 0 || now() > opts.deadline) {
      return dir * (s0.t - limit) >= 0 ? { none: true, limitJD: limit } : { resumeJD: s0.t };
    }
  }
}

// ── Stations ────────────────────────────────────────────────────────────────────────────

interface SpeedSample {
  t: number;
  lon: number;
  speed: number;
}

function sampleSpeed(body: StationBody, t: number, stats?: { calls: number }): SpeedSample | null {
  const s = lonSpeed(t, body, stats);
  return s && { t, lon: s.lon, speed: s.speed };
}

/** The bodies whose station instant is read off a fitted line rather than the raw root. Their
 *  speed changes by under 1e-8°/day a second near a turn (Neptune ~7e-9), which is the size of
 *  the noise in Swiss's reported speed (measured ~1e-8 at Neptune's 1812 station), so the raw
 *  root wanders by a second or two with the bracket it was found from — and a station found
 *  going forward then sat a second away from the same station found going back, which is
 *  enough to return it twice. Mercury to Mars turn a hundred times faster; their raw root is
 *  good to milliseconds. */
const STATION_FIT_BODIES: ReadonlySet<StationBody> = new Set(['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']);
const STATION_FIT_STEP_DAYS = 1 / 48;
const STATION_FIT_HALF = 6;

/**
 * A slow body's station: the zero of a straight line fitted to the speed at the 13 half-hour
 * marks nearest the raw root. The marks sit on an ABSOLUTE grid (multiples of half an hour),
 * so the same station searched from either side reads the same marks and lands on the same
 * instant. Over ±3 h the speed of these bodies is a straight line to far below its noise.
 */
function fitStation(body: StationBody, around: number, stats?: { calls: number }): number | null {
  const t0 = Math.round(around / STATION_FIT_STEP_DAYS) * STATION_FIT_STEP_DAYS;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let n = 0;
  for (let k = -STATION_FIT_HALF; k <= STATION_FIT_HALF; k++) {
    const x = k * STATION_FIT_STEP_DAYS;
    const s = sampleSpeed(body, t0 + x, stats);
    if (!s) return null;
    sx += x;
    sy += s.speed;
    sxx += x * x;
    sxy += x * s.speed;
    n++;
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  if (!(slope !== 0 && Number.isFinite(slope))) return null;
  const root = t0 - (sy - slope * sx) / n / slope;
  // A line that puts the zero outside the marks has not found this station.
  return Math.abs(root - around) < STATION_FIT_STEP_DAYS ? root : null;
}

/** Illinois (modified regula falsi) on the speed, inside a bracket whose ends differ in sign. */
function refineStation(
  body: StationBody,
  lo: SpeedSample,
  hi: SpeedSample,
  stats?: { calls: number },
): SpeedSample | null {
  let a = lo;
  let b = hi;
  let fa = a.speed;
  let fb = b.speed;
  let c: SpeedSample = Math.abs(fa) < Math.abs(fb) ? a : b;
  for (let i = 0; i < 80 && Math.abs(b.t - a.t) >= STATION_TOL_DAYS; i++) {
    let t = (a.t * fb - b.t * fa) / (fb - fa);
    if (!(t > Math.min(a.t, b.t) && t < Math.max(a.t, b.t))) t = (a.t + b.t) / 2;
    const s = sampleSpeed(body, t, stats);
    if (!s) return null;
    c = s;
    if ((s.speed <= 0) !== (fb <= 0)) {
      a = b;
      fa = fb;
    } else {
      fa /= 2;
    }
    b = s;
    fb = s.speed;
  }
  return c;
}

function marchStation(
  spec: Extract<EventSpec, { kind: 'station' }>,
  start: number,
  dir: 1 | -1,
  limit: number,
  opts: SliceOpts,
  zodiac: ZodiacMode,
): SliceResult {
  const { body, turn } = spec;
  const { stats } = opts;
  const A = MAX_ACCEL_DEG[body];
  const cap = STATION_STEP_CAP_DAYS[body];
  let s0 = sampleSpeed(body, start, stats);
  if (!s0) return { none: true, limitJD: start };
  for (;;) {
    if (dir * (s0.t - limit) >= 0) return { none: true, limitJD: limit };
    const step = Math.min(Math.max(Math.abs(s0.speed) / A, HOUR_DAYS), cap);
    let t1 = s0.t + dir * step;
    if (dir * (t1 - limit) > 0) t1 = limit;
    const s1 = sampleSpeed(body, t1, stats);
    if (!s1) return { none: true, limitJD: s0.t };
    if ((s0.speed <= 0) !== (s1.speed <= 0)) {
      const [lo, hi] = s0.t < s1.t ? [s0, s1] : [s1, s0];
      // Which way it turned: the motion just BEFORE the root, in time.
      const turned: 'retrograde' | 'direct' = lo.speed > 0 ? 'retrograde' : 'direct';
      const root = turn === 'any' || turn === turned ? refineStation(body, lo, hi, stats) : null;
      // The instant the station is reported at — and the one the strictness test reads, so
      // a station is never returned twice by searches that started a second apart.
      const at = root && (STATION_FIT_BODIES.has(body) ? (fitStation(body, root.t, stats) ?? root.t) : root.t);
      if (root && at !== null && dir * (at - start) > 0) {
        const sun = lonSpeed(root.t, 'Sun', stats);
        const elong = sun ? Math.abs(wrapP(root.lon - sun.lon, TWO_PI)) : Math.PI;
        if (elong >= STATION_SUN_EXCLUSION_DEG * DEG) {
          const ayan = zodiac === 'tropical' ? 0 : ayanamsaRad(at, zodiac);
          return {
            found: { jd: at, detail: { kind: 'station', body, turn: turned, sign: signOf(root.lon - ayan) } },
          };
        }
      }
    }
    s0 = s1;
    if (dir * (s0.t - opts.untilJD) >= 0 || now() > opts.deadline) {
      return dir * (s0.t - limit) >= 0 ? { none: true, limitJD: limit } : { resumeJD: s0.t };
    }
  }
}

// ── Eclipses ────────────────────────────────────────────────────────────────────────────

function eclipseSearch(
  kind: 'solar-eclipse' | 'lunar-eclipse',
  start: number,
  dir: 1 | -1,
  limit: number,
  opts: SliceOpts,
  zodiac: ZodiacMode,
): SliceResult {
  const { stats } = opts;
  let from = start;
  // Twice is the most it can take (see the header); the bound is a guard, not a budget.
  for (let i = 0; i < 4; i++) {
    if (stats) stats.calls += 1;
    let max: number;
    let detail: EventDetail;
    try {
      if (kind === 'solar-eclipse') {
        const e = findSolarEclipse(from, dir < 0);
        max = e.maximum;
        const sun = lonSpeed(max, 'Sun', stats);
        const ayan = zodiac === 'tropical' ? 0 : ayanamsaRad(max, zodiac);
        detail = { kind, type: e.kind, central: e.central, sign: signOf((sun?.lon ?? 0) - ayan) };
      } else {
        const e = findLunarEclipse(from, dir < 0);
        max = e.maximum;
        const moon = lonSpeed(max, 'Moon', stats);
        const ayan = zodiac === 'tropical' ? 0 : ayanamsaRad(max, zodiac);
        detail = { kind, type: e.kind, sign: signOf((moon?.lon ?? 0) - ayan) };
      }
    } catch {
      return { none: true, limitJD: from };
    }
    if (!Number.isFinite(max) || dir * (max - limit) > 0) return { none: true, limitJD: limit };
    if (dir * (max - start) > 0) return { found: { jd: max, detail } };
    // Swiss handed back the eclipse at (or just behind) the start: go a day past it.
    from = max + dir;
  }
  return { none: true, limitJD: limit };
}

// ── The search ──────────────────────────────────────────────────────────────────────────

/**
 * One slice of a search: from `fromJD` in direction `dir`, until something is found, the
 * range ends, the front passes `untilJD`, or the clock passes `deadline` — whichever is
 * first. A `resumeJD` is handed back to continue from; pass it as the next slice's `fromJD`
 * with `marginSec: 0` (the margin belongs to the original start, not to a resume point).
 * Synchronous; each slice reads the ephemeris as it stands, so a file loading elsewhere in
 * the meantime is harmless.
 */
export function searchSlice(
  spec: EventSpec,
  fromJD: number,
  dir: 1 | -1,
  opts: SliceOpts,
): SliceResult {
  const zodiac = opts.zodiac ?? 'tropical';
  const minJD = opts.minJD ?? EPHEMERIS_SPAN.minJD;
  const maxJD = opts.maxJD ?? EPHEMERIS_SPAN.maxJD;
  const limit = dir > 0 ? maxJD : minJD;
  let start = fromJD + dir * (opts.marginSec ?? 1) * SECOND_DAYS;
  // A start outside the range searches inward from its edge.
  if (dir > 0 && start < minJD) start = minJD;
  if (dir < 0 && start > maxJD) start = maxJD;
  if (dir * (start - limit) >= 0) return { none: true, limitJD: limit };

  switch (spec.kind) {
    case 'solar-eclipse':
    case 'lunar-eclipse':
      return eclipseSearch(spec.kind, start, dir, limit, opts, zodiac);
    case 'station':
      return marchStation(spec, start, dir, limit, opts, zodiac);
    default: {
      const p = angleProblem(spec, zodiac);
      // An aspect that never forms (or a malformed spec): there is none in the range, and
      // saying so at once is the honest answer.
      if (!p) return { none: true, limitJD: limit };
      return marchAngle(p, start, dir, limit, opts);
    }
  }
}

/** The next (dir 1) or previous (dir −1) event matching `spec`, run to the end in one go —
 *  for the suites and anything off the main thread. Null when there is none in the range. */
export function findEvent(
  spec: EventSpec,
  fromJD: number,
  dir: 1 | -1,
  opts: SearchOpts = {},
): EventHit | null {
  const r = searchSlice(spec, fromJD, dir, {
    ...opts,
    untilJD: dir > 0 ? Infinity : -Infinity,
    deadline: Infinity,
  });
  return 'found' in r ? r.found : null;
}

/** Yield to the event loop: a fresh MessageChannel task (no 4 ms timer clamp), else a timer. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof MessageChannel === 'undefined') {
      setTimeout(resolve, 0);
      return;
    }
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      resolve();
    };
    ch.port2.postMessage(null);
  });
}

/**
 * The search for the UI: slices of about `sliceMs` (12 ms), yielding to the browser between
 * them, so typing and painting carry on while Pluto is found decades ahead. `onProgress`
 * hears the front after each slice (the panel shows "Searching… {year}" after 150 ms).
 *
 * Cancellable: abort the signal (a new spec, the panel closing, the form unmounting) and it
 * resolves `{ aborted: true }` at the next slice boundary. It never rejects for that; an
 * exception means something else is wrong (the engine not initialised).
 *
 * From a component: hold an AbortController in a ref, abort the previous one before
 * starting, and call this from the click handler — never from render.
 */
export async function searchEvent(
  spec: EventSpec,
  fromJD: number,
  dir: 1 | -1,
  opts: SearchOpts & {
    signal?: AbortSignal;
    onProgress?(jd: number): void;
    sliceMs?: number;
  } = {},
): Promise<SearchResult> {
  const { signal, onProgress, sliceMs = 12, ...search } = opts;
  let from = fromJD;
  let marginSec = search.marginSec;
  for (;;) {
    if (signal?.aborted) return { aborted: true };
    const r = searchSlice(spec, from, dir, {
      ...search,
      marginSec,
      untilJD: dir > 0 ? Infinity : -Infinity,
      deadline: now() + sliceMs,
    });
    if (!('resumeJD' in r)) return r;
    onProgress?.(r.resumeJD);
    from = r.resumeJD;
    marginSec = 0;
    await nextTask();
  }
}
