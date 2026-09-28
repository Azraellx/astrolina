// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Daily rise / set / culmination instants per body for one place and day.
// Standard hour-angle astronomy (Meeus ch. 15), solved iteratively so fast
// movers (the Moon) converge on their own motion; circumpolar bodies — no
// horizon crossing at this latitude — are flagged instead of faked.
import {
  getPlanetPositions,
  gmstRadians,
  sampleBody,
  type NodeType,
  type PlanetName,
} from '../ephemeris';

const TWO_PI = 2 * Math.PI;
const D2R = Math.PI / 180;
// Sidereal turn rate: radians of hour angle per day.
const RATE = TWO_PI * 1.00273790935;
// Standard refraction altitude at the horizon. The Sun's includes its
// semidiameter (the convention: rise/set = upper limb touching the horizon).
const H0_PLANET = -0.5667 * D2R;
const H0_SUN = -0.8333 * D2R;

/** The four angular moments of a body's day. */
export type EventKind = 'rise' | 'culminate' | 'set' | 'anticulminate';

export interface BodyDayEvents {
  body: PlanetName;
  /** Null when the body never crosses the horizon at this latitude that day. */
  rise: number | null;
  set: number | null;
  culminate: number;
  anticulminate: number;
  /** 'up' = circumpolar above the horizon all day; 'down' = never rises. */
  circumpolar: 'up' | 'down' | null;
}

const wrapPi = (x: number) => {
  let v = x % TWO_PI;
  if (v > Math.PI) v -= TWO_PI;
  if (v <= -Math.PI) v += TWO_PI;
  return v;
};

// The body's local hour angle at jd (radians, −π…π].
function hourAngle(jd: number, ra: number, lngRad: number): number {
  return wrapPi(gmstRadians(jd) + lngRad - ra);
}

// Solve the instant nearest `jdGuess` when the body's hour angle equals
// `target`, resampling the body's RA at each step so its own motion (≈13°/day
// for the Moon) is folded in. Converges in 2–3 iterations.
function solveHourAngle(
  jdGuess: number,
  target: number,
  lngRad: number,
  sample: (jd: number) => { ra: number; dec: number } | null,
): number | null {
  let jd = jdGuess;
  for (let i = 0; i < 4; i++) {
    const s = sample(jd);
    if (!s) return null;
    jd += wrapPi(target - hourAngle(jd, s.ra, lngRad)) / RATE;
  }
  return jd;
}

type Sampler = (jd: number) => { ra: number; dec: number } | null;
type Circumpolar = 'up' | 'down';

// cos of the semi-diurnal arc: the hour angle at which a body of declination
// `dec` stands at altitude `h0`. Beyond ±1 it never reaches that altitude —
// below −1 it stays above it all day, above +1 it never climbs to it.
const cosSemiArc = (h0: number, latRad: number, dec: number) =>
  (Math.sin(h0) - Math.sin(latRad) * Math.sin(dec)) / (Math.cos(latRad) * Math.cos(dec));

// Solve a horizon crossing nearest `jdGuess` — a rise (side −1, east of the
// meridian) or a set (+1). Unlike the meridian solve above, the TARGET moves
// too: the semi-diurnal arc is re-read from the declination at each step, so
// the crossing is timed on the body's declination AT the crossing rather than
// at noon (worth ~30 s for the Sun at 50°, minutes for the Moon). Returns the
// sense a step found the body circumpolar in when the arc vanishes mid-solve
// (a day at the edge of midnight sun or polar night), and null when there is
// no data or the solve fails to settle — never an extrapolated instant.
function solveHorizon(
  jdGuess: number,
  side: -1 | 1,
  h0: number,
  latRad: number,
  lngRad: number,
  sample: Sampler,
): number | Circumpolar | null {
  let jd = jdGuess;
  for (let i = 0; i < 6; i++) {
    const s = sample(jd);
    if (!s) return null;
    const c = cosSemiArc(h0, latRad, s.dec);
    if (c < -1) return 'up';
    if (c > 1) return 'down';
    const step = wrapPi(side * Math.acos(c) - hourAngle(jd, s.ra, lngRad)) / RATE;
    jd += step;
    if (Math.abs(step) < 1e-6) return jd; // ≈ 0.1 s
  }
  return null;
}

interface HorizonCrossings {
  rise: number | null;
  set: number | null;
  /** Circumpolar at the transit itself: no crossing either side of it. */
  circumpolar: Circumpolar | null;
  /** The sense a rise or set solve found the body circumpolar in, when the
   *  transit's own arc exists but the crossing's does not. */
  edge: Circumpolar | null;
}

// The rise before and the set after an upper transit `culm`, at altitude `h0`.
// The one horizon solve every caller shares, so the band's printed times and
// anything built on the Sun's day (planetary hours) are the same instants.
function riseSetAround(
  culm: number,
  h0: number,
  latRad: number,
  lngRad: number,
  sample: Sampler,
): HorizonCrossings | null {
  const s = sample(culm);
  if (!s) return null;
  const c = cosSemiArc(h0, latRad, s.dec);
  if (c < -1) return { rise: null, set: null, circumpolar: 'up', edge: null };
  if (c > 1) return { rise: null, set: null, circumpolar: 'down', edge: null };
  const H0 = Math.acos(c);
  const r = solveHorizon(culm - H0 / RATE, -1, h0, latRad, lngRad, sample);
  const st = solveHorizon(culm + H0 / RATE, 1, h0, latRad, lngRad, sample);
  return {
    rise: typeof r === 'number' ? r : null,
    set: typeof st === 'number' ? st : null,
    circumpolar: null,
    edge: typeof r === 'string' ? r : typeof st === 'string' ? st : null,
  };
}

// Normalize an instant into [dayStart, dayStart + 1) by whole sidereal days.
const intoDay = (jd: number | null, dayStart: number): number | null => {
  if (jd === null) return null;
  let v = jd;
  const siderealDay = TWO_PI / RATE;
  while (v < dayStart) v += siderealDay;
  while (v >= dayStart + 1) v -= siderealDay;
  // A sidereal day is ~4 min short of a civil day, so one event can fall just
  // outside after normalization — accept a small spill rather than lose it.
  return v;
};

/**
 * Every body's rise / set / upper & lower culmination during the civil day
 * starting at `dayStartJd` (UT), at (lat, lng). Bodies without ephemeris data
 * at this date contribute nothing.
 */
export function dailySkyEvents(
  dayStartJd: number,
  lat: number,
  lng: number,
  bodies: PlanetName[],
  nodeType: NodeType,
): BodyDayEvents[] {
  const latRad = lat * D2R;
  const lngRad = lng * D2R;
  const mid = dayStartJd + 0.5;

  // One shared per-jd sampler cache: every solver iteration samples ALL bodies
  // once (getPlanetPositions), so a day's worth of solves stays ~a dozen calls.
  const cache = new Map<number, Map<PlanetName, { ra: number; dec: number }>>();
  const sampleAll = (jd: number) => {
    const key = Math.round(jd * 86400); // second resolution is plenty here
    let m = cache.get(key);
    if (!m) {
      m = new Map(getPlanetPositions(jd, nodeType).map((p) => [p.name, { ra: p.ra, dec: p.dec }]));
      cache.set(key, m);
    }
    return m;
  };
  const samplerFor =
    (body: PlanetName) =>
    (jd: number): { ra: number; dec: number } | null =>
      sampleAll(jd).get(body) ?? null;

  const out: BodyDayEvents[] = [];
  for (const body of bodies) {
    const sample = samplerFor(body);
    const s0 = sample(mid);
    if (!s0) continue;

    const culm = solveHourAngle(mid, 0, lngRad, sample);
    const anti = solveHourAngle(mid, Math.PI, lngRad, sample);
    if (culm === null || anti === null) continue;

    // Rise and set around the transit, each timed on its own declination.
    // Circumpolar at the transit → the body never crosses the horizon here:
    // above all day (same hemisphere as the observer) or below.
    const h0 = body === 'Sun' ? H0_SUN : H0_PLANET;
    const x = riseSetAround(culm, h0, latRad, lngRad, sample);
    if (!x) continue;

    out.push({
      body,
      rise: intoDay(x.rise, dayStartJd),
      set: intoDay(x.set, dayStartJd),
      culminate: intoDay(culm, dayStartJd) as number,
      anticulminate: intoDay(anti, dayStartJd) as number,
      circumpolar: x.circumpolar,
    });
  }
  return out;
}

/** The Sun's day around one upper transit: the visible rise before it and the
 *  visible set after it (upper limb with standard refraction, as the band prints
 *  them). Instants are JD (UT). */
export interface SunHorizonDay {
  /** The upper transit (local apparent noon) the day is built around. */
  noon: number;
  rise: number | null;
  set: number | null;
  /** 'up' = the Sun doesn't set (midnight sun), 'down' = it doesn't rise (polar
   *  night) — at the transit itself, or at the edge where a rise or set that the
   *  noon arc promised isn't there. Null when both crossings were found — or,
   *  rarely, when a crossing's solve failed to settle, leaving it null unexplained. */
  circumpolar: 'up' | 'down' | null;
}

/**
 * The Sun's rise and set around the upper transit nearest `jdNear`, at (lat, lng).
 * NOT folded into a civil day, unlike {@link dailySkyEvents}: a sunset after local
 * midnight (high summer at high latitude) stays on the day whose noon it follows.
 * The same horizon solve the band's rows use, so for a day where neither needed
 * folding the two agree to the sample. Null when there is no ephemeris data.
 */
export function sunHorizonDay(jdNear: number, lat: number, lng: number): SunHorizonDay | null {
  const latRad = lat * D2R;
  const lngRad = lng * D2R;
  // The Sun alone — the band's sampler pays for every body per step. The node
  // type only matters to the nodes.
  const sample: Sampler = (jd) => sampleBody(jd, 'Sun', 'mean');
  const noon = solveHourAngle(jdNear, 0, lngRad, sample);
  if (noon === null) return null;
  const x = riseSetAround(noon, H0_SUN, latRad, lngRad, sample);
  if (!x) return null;
  return { noon, rise: x.rise, set: x.set, circumpolar: x.circumpolar ?? x.edge };
}

