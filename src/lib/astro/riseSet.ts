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

    // Semi-diurnal arc at the (mid-day) declination. |cos H₀| > 1 → the body
    // never crosses the horizon here: circumpolar above (same hemisphere as
    // the observer) or below.
    const h0 = body === 'Sun' ? H0_SUN : H0_PLANET;
    const cosH0 =
      (Math.sin(h0) - Math.sin(latRad) * Math.sin(s0.dec)) /
      (Math.cos(latRad) * Math.cos(s0.dec));
    let rise: number | null = null;
    let set: number | null = null;
    let circumpolar: BodyDayEvents['circumpolar'] = null;
    if (cosH0 < -1) circumpolar = 'up';
    else if (cosH0 > 1) circumpolar = 'down';
    else {
      const H0 = Math.acos(cosH0);
      rise = solveHourAngle(culm - H0 / RATE, -H0, lngRad, sample);
      set = solveHourAngle(culm + H0 / RATE, H0, lngRad, sample);
    }

    out.push({
      body,
      rise: intoDay(rise, dayStartJd),
      set: intoDay(set, dayStartJd),
      culminate: intoDay(culm, dayStartJd) as number,
      anticulminate: intoDay(anti, dayStartJd) as number,
      circumpolar,
    });
  }
  return out;
}

