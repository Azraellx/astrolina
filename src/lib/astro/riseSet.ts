// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Rise / set / culmination instants per body at one place: every occurrence in
// a window (skyEventsBetween), and the civil-day view the band prints
// (dailySkyEvents / skyDayRows). Standard hour-angle astronomy (Meeus ch. 15),
// solved iteratively so fast movers (the Moon) converge on their own motion;
// circumpolar bodies — no horizon crossing at this latitude — are flagged
// instead of faked.
import {
  gmstRadians,
  sampleBody,
  sunMoonEquatorial,
  type NodeType,
  type PlanetName,
} from '../ephemeris';

const TWO_PI = 2 * Math.PI;
const D2R = Math.PI / 180;
// Sidereal turn rate: radians of hour angle per day.
const RATE = TWO_PI * 1.00273790935;
const SIDEREAL_DAY = TWO_PI / RATE;
// Standard refraction altitude at the horizon. The Sun's includes its
// semidiameter (the convention: rise/set = upper limb touching the horizon).
const H0_PLANET = -0.5667 * D2R;
const H0_SUN = -0.8333 * D2R;
// The Moon's standard altitude (Meeus, Astronomical Algorithms ch. 15):
// 0.7275 × her horizontal parallax, less the 34′ of refraction — about +0°07′,
// ABOVE the geometric horizon, because from the Earth's surface her parallax
// lowers her by more than refraction and her semidiameter lift her. The formula
// is for geocentric positions, which is what the engine gives. Until 2026-10-02
// she was given the planets' −0°34′, which printed every moonrise early and every
// moonset late — by 3 min at the equator, 7–8 at 60° (2026 medians) — and so
// failed the almanac check the visible horizon is chosen for. The mean value
// stands in only when a sampler can't give her distance.
const EARTH_RADIUS_KM = 6378.14;
const AU_KM = 149_597_870.7;
const H0_MOON_MEAN = 0.125 * D2R;
const moonH0 = (distanceAu: number | undefined): number =>
  distanceAu !== undefined && distanceAu > 0
    ? 0.7275 * Math.asin(EARTH_RADIUS_KM / (distanceAu * AU_KM)) - 0.5667 * D2R
    : H0_MOON_MEAN;

/** The four angular moments of a body's day. */
export type EventKind = 'rise' | 'culminate' | 'set' | 'anticulminate';

/** One body's apparent geocentric place at an instant, as the rise/set solve reads it. */
export interface SkySample {
  ra: number;
  dec: number;
  /** Geocentric distance, AU. Read for the Moon only, whose visible horizon
   *  depends on her parallax; absent, her mean distance stands in. */
  distance?: number;
}

/** Where a body is at an instant; null when there is no ephemeris data for it then. */
export type SkySampler = (jd: number, body: PlanetName) => SkySample | null;

/**
 * One angular moment, solved on its own: never copied from a neighbouring day.
 *
 * A rise or set carries TWO instants, one per horizon convention. `jd` is the
 * visible (almanac) crossing — the one the band prints; `geoJd` is the body's
 * centre on the geometric horizon (altitude 0, geocentric) — the convention the
 * map's horizon lines and parans are drawn on, so anything pairing events
 * against the map reads this one. Each is null when the body does not reach that
 * horizon on this pass (a body grazing the horizon at high latitude can cross one
 * and not the other); at least one of the two is always set. A meridian event has
 * one instant, and both fields hold it.
 */
export interface SkyEvent {
  body: PlanetName;
  kind: EventKind;
  /** The displayed instant (JD UT): visible horizon for a rise or set. */
  jd: number | null;
  /** The geometric-horizon instant (JD UT); equal to `jd` on a meridian event. */
  geoJd: number | null;
  /** Meridian events only: the side of the visible horizon the body keeps through
   *  this transit's whole pass — from the opposite transit before it to the one
   *  after — when it crosses that horizon on neither side ('up' = above all the
   *  while, 'down' = below). Null when it crosses, and on every rise and set. */
  circumpolar: 'up' | 'down' | null;
}

export interface SkyEventsOptions {
  /** Position source. Default: the engine's own sampling (sampleBody, the call
   *  getPlanetPositions makes for every body), with the Moon's distance. A verify
   *  script injects a frozen sky here. */
  sample?: SkySampler;
}

/**
 * One body's moments in one civil day — the band's row. Every instant is the
 * displayed one (visible horizon for rise and set), in time order. An array
 * holds two entries when the body genuinely has two of that event in the day (a
 * sidereal day is ~4 min short of a civil one; the Moon's is ~50 min long, so she
 * can also have none, skipping a culmination about once a month), and is empty
 * when it has none.
 */
export interface BodyDayEvents {
  body: PlanetName;
  rise: number[];
  set: number[];
  culminate: number[];
  anticulminate: number[];
  /** With no rise or set in the day: 'up' = above the visible horizon all day
   *  (circumpolar), 'down' = below it all day. Null when it rises or sets. */
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

type Sampler = (jd: number) => SkySample | null;
type Circumpolar = 'up' | 'down';
// A horizon altitude: fixed, or read from the sample (the Moon's follows her
// distance).
type Horizon = number | ((s: SkySample) => number);

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
  h0: Horizon,
  latRad: number,
  lngRad: number,
  sample: Sampler,
): number | Circumpolar | null {
  let jd = jdGuess;
  for (let i = 0; i < 6; i++) {
    const s = sample(jd);
    if (!s) return null;
    const c = cosSemiArc(typeof h0 === 'number' ? h0 : h0(s), latRad, s.dec);
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

// The rise before and the set after an upper transit `culm`, at altitude `h0` —
// the Sun's day for planetary hours. Its crossings come from solveHorizon, from the
// same guess the window solve below starts each crossing at, so the band's printed
// Sun times and the planetary day are the same instants.
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

// ── Every occurrence in a window ──────────────────────────────────────────────
// Until 2026-10-02 the band solved one culmination near midday and the rise and
// set either side of it, then moved anything that fell outside the civil day back
// in by a whole SIDEREAL day. That is right for a star and wrong for anything
// with motion of its own: the Moon's day is ~24h50m, so about a quarter of her
// printed rises and sets were instants at which she was nowhere near the horizon
// (an hour out at the equator, two at 60°), and a culmination was drawn on the
// days she has none; Mercury and Venus were out by up to 40 and 22 minutes. It
// also could only ever give ONE of each event, though a civil day can hold two.
// Now every transit is found in its own right, each crossing is solved between
// the two transits that bracket it, and nothing is ever translated in time.

// How far past the window the transits are enumerated: every transit inside it
// needs both neighbours (the half-day either side of a transit is ≤ ~0.53 d, the
// Moon's), so its pass and the crossings that bound it are known.
const MARGIN = 0.75;

// The instant nearest `guess` at which the body's hour angle is `target`,
// resampled every step like solveHourAngle but run to convergence (the window's
// next transit is guessed a sidereal day on, up to ~75 min short for the Moon).
// Null when there is no data or it fails to settle.
function solveMeridian(guess: number, target: number, lngRad: number, sample: Sampler): number | null {
  let jd = guess;
  for (let i = 0; i < 12; i++) {
    const s = sample(jd);
    if (!s) return null;
    const step = wrapPi(target - hourAngle(jd, s.ra, lngRad)) / RATE;
    jd += step;
    if (Math.abs(step) < 1e-8) return jd; // ≈ 1 ms
  }
  return null;
}

// Every meridian transit (hour angle `target`) in [a, b), in order: the one
// nearest `a`, stepped back to the last before it, then forward a sidereal day
// at a time with each one re-solved on the body's own motion. A step that fails
// to advance by half a day (no successor found) ends the list rather than loop.
function meridianTransits(a: number, b: number, target: number, lngRad: number, sample: Sampler): number[] | null {
  let t = solveMeridian(a, target, lngRad, sample);
  if (t === null) return null;
  if (t > a) {
    const p = solveMeridian(t - SIDEREAL_DAY, target, lngRad, sample);
    if (p === null) return null;
    if (p < t - 0.5) t = p;
  }
  const out: number[] = [];
  for (let guard = 0; t < b && guard < 400; guard++) {
    if (t >= a) out.push(t);
    const n = solveMeridian(t + SIDEREAL_DAY, target, lngRad, sample);
    if (n === null) return null;
    if (n < t + 0.5) break;
    t = n;
  }
  return out;
}

// Geocentric altitude of the sampled body at jd (radians).
function altitude(jd: number, s: SkySample, latRad: number, lngRad: number): number {
  const H = hourAngle(jd, s.ra, lngRad);
  return Math.asin(
    Math.sin(latRad) * Math.sin(s.dec) + Math.cos(latRad) * Math.cos(s.dec) * Math.cos(H),
  );
}

// Where a body's altitude turns — its highest near an upper transit, its lowest
// near a lower one. For a fixed star that is the transit itself. A body whose
// declination moves turns minutes away from it (10–20 for the Moon at 70–78° of
// latitude), at a height that differs from the transit's by up to a few
// arcminutes there; so a pass whose transit stands just above a horizon can still
// dip below it, briefly, or one just below can still clear it. Until 2026-10-02
// the crossings were bracketed by the transits, and those passes were lost: both
// crossings missing, and the day's row noting the opposite as circumpolar (the
// Moon at 72°N on 22 May 2026: set 03:35, rise 03:50 UT, her lower transit 47″
// above the visible horizon and her lowest 29″ below it). A transit that stands
// clear of both horizons by more than that difference has its turn on the same
// side of each, so the search runs only within GRAZE of one, and elsewhere the
// transit stands in for its turn. GRAZE is ample to about 88° of latitude (the
// difference is ~0.15° there), beyond which the turn drifts hours from the
// transit (TURN_MAX) and the picture of one turn per transit stops holding.
const GRAZE = 1 * D2R;
const TURN_MAX = 3 / 24;

// The turning point nearest transit `t`: the vertex of the parabola through the
// altitude five minutes either side, re-centred until it settles (altitude is
// that close to a parabola over the half-hour that matters). Null when there is
// no data, it wanders past TURN_MAX, or it fails to settle.
function turningPoint(t: number, latRad: number, lngRad: number, sample: Sampler): number | null {
  const alt = (jd: number) => {
    const s = sample(jd);
    return s ? altitude(jd, s, latRad, lngRad) : null;
  };
  const d = 5 / 1440;
  let jd = t;
  for (let i = 0; i < 6; i++) {
    const a0 = alt(jd - d);
    const a1 = alt(jd);
    const a2 = alt(jd + d);
    if (a0 === null || a1 === null || a2 === null) return null;
    const curv = a0 - 2 * a1 + a2;
    if (curv === 0) return null;
    const step = (d * (a0 - a2)) / (2 * curv);
    jd += step;
    if (Math.abs(jd - t) > TURN_MAX) return null;
    if (Math.abs(step) < 1 / 86_400) return jd; // 1 s
  }
  return null;
}

// The crossing of horizon `h` between two consecutive transits, `a` before `b`: a
// set after an upper transit (side +1), a rise after a lower one (−1). `lo` and
// `hi` are the altitude's turning points at `a` and `b` (the transits themselves,
// away from a graze). The caller has already seen the body above `h` at the upper
// turn and below it at the lower, so there is exactly one between them — between
// two turns the altitude only climbs or only falls (between two TRANSITS it need
// not: see turningPoint). solveHorizon first, from the semi-arc at the upper
// transit (the guess riseSetAround makes, so the Sun's times are the planetary
// day's to the solve), or at the lower one when only it has an arc; if that fails
// to settle inside the bracket — the arc vanishing mid-solve at the edge of
// circumpolar, or a crossing on the far side of its transit — the altitude itself
// is bisected between the turns.
function crossingBetween(
  a: number,
  b: number,
  lo: number,
  hi: number,
  side: -1 | 1,
  h: Horizon,
  latRad: number,
  lngRad: number,
  sample: Sampler,
): number | null {
  const hAt = (s: SkySample) => (typeof h === 'number' ? h : h(s));
  const upper = side > 0 ? a : b;
  const lower = side > 0 ? b : a;
  const su = sample(upper);
  const sl = sample(lower);
  if (!su || !sl) return null;
  let guess: number | null = null;
  const cu = cosSemiArc(hAt(su), latRad, su.dec);
  if (cu >= -1 && cu <= 1) guess = upper + (side * Math.acos(cu)) / RATE;
  else {
    const cl = cosSemiArc(hAt(sl), latRad, sl.dec);
    if (cl >= -1 && cl <= 1) guess = lower - (side * (Math.PI - Math.acos(cl))) / RATE;
  }
  if (guess !== null) {
    const x = solveHorizon(guess, side, h, latRad, lngRad, sample);
    if (typeof x === 'number' && x > lo && x < hi) return x;
  }
  const f = (jd: number) => {
    const s = sample(jd);
    return s ? altitude(jd, s, latRad, lngRad) - hAt(s) : null;
  };
  const fa = f(lo);
  if (fa === null) return null;
  let x0 = lo;
  let x1 = hi;
  for (let i = 0; i < 40; i++) {
    const mid = (x0 + x1) / 2;
    const fm = f(mid);
    if (fm === null) return null;
    if (fm > 0 === fa > 0) x0 = mid;
    else x1 = mid;
  }
  return (x0 + x1) / 2;
}

// The engine's own sampling, one body at a time (the call getPlanetPositions
// makes per body, so the same numbers, without paying for every other body at
// each step of each body's solve), with the Moon's distance for her horizon.
function engineSampler(nodeType: NodeType): SkySampler {
  return (jd, body) => {
    const s = sampleBody(jd, body, nodeType);
    if (!s) return null;
    if (body !== 'Moon') return { ra: s.ra, dec: s.dec };
    let distance: number | undefined;
    try {
      distance = sunMoonEquatorial(jd).moonDistAu;
    } catch {
      // No distance → her mean parallax (moonH0); never a crashed band.
    }
    return { ra: s.ra, dec: s.dec, distance };
  };
}

// A body's samples, cached to the millisecond: a converged solve re-reads the
// instant it settled on, and a crossing re-reads the transits that bracket it.
function cachedSampler(raw: SkySampler, body: PlanetName): Sampler {
  const cache = new Map<number, SkySample | null>();
  return (jd) => {
    const key = Math.round(jd * 86_400_000);
    let s = cache.get(key);
    if (s === undefined) {
      s = raw(jd, body);
      cache.set(key, s);
    }
    return s;
  };
}

// One body's moments over [a, b): the meridian transits, then the crossings of
// each horizon between consecutive transits — only where the body is above that
// horizon at the upper turn and below it at the lower (turningPoint), so a pass
// that never reaches a horizon has no crossing of it, rather than an invented
// one, and a pass that just reaches one has both.
function bodyEvents(
  body: PlanetName,
  a: number,
  b: number,
  latRad: number,
  lngRad: number,
  sample: Sampler,
): SkyEvent[] | null {
  const ups = meridianTransits(a, b, 0, lngRad, sample);
  const downs = meridianTransits(a, b, Math.PI, lngRad, sample);
  if (!ups || !downs) return null;
  // The hour angle only grows (no body outruns the sky's turn), so upper and
  // lower transits alternate.
  const merid = [
    ...ups.map((jd) => ({ jd, upper: true })),
    ...downs.map((jd) => ({ jd, upper: false })),
  ].sort((x, y) => x.jd - y.jd);
  const shown: Horizon = body === 'Sun' ? H0_SUN : body === 'Moon' ? (s) => moonH0(s.distance) : H0_PLANET;
  const shownAt = (s: SkySample) => (typeof shown === 'number' ? shown : shown(s));
  // Each transit's turn: where the altitude turns (the transit itself unless it
  // grazes a horizon), and its height there above the shown horizon and above
  // the geometric one.
  const height: { at: number; shown: number; geo: number }[] = [];
  for (const m of merid) {
    const s = sample(m.jd);
    if (!s) return null;
    const alt = altitude(m.jd, s, latRad, lngRad);
    let h = { at: m.jd, shown: alt - shownAt(s), geo: alt };
    if (Math.abs(h.shown) < GRAZE || Math.abs(h.geo) < GRAZE) {
      const t = turningPoint(m.jd, latRad, lngRad, sample);
      const st = t === null ? null : sample(t);
      if (t !== null && st) {
        const turned = altitude(t, st, latRad, lngRad);
        // A highest point is no lower than the transit, a lowest no higher: a
        // vertex on the wrong side is a failed search, and the transit stands.
        if (m.upper ? turned >= alt : turned <= alt) h = { at: t, shown: turned - shownAt(st), geo: turned };
      }
    }
    height.push(h);
  }

  const events: SkyEvent[] = [];
  // Whether the shown horizon is crossed between transit i and i + 1.
  const crossed: boolean[] = [];
  for (let i = 0; i + 1 < merid.length; i++) {
    const m0 = merid[i];
    const m1 = merid[i + 1];
    crossed.push(false);
    if (m0.upper === m1.upper) continue;
    const up = m0.upper ? height[i] : height[i + 1];
    const low = m0.upper ? height[i + 1] : height[i];
    const side: -1 | 1 = m0.upper ? 1 : -1;
    const lo = height[i].at;
    const hi = height[i + 1].at;
    const crossesShown = up.shown > 0 && low.shown <= 0;
    crossed[i] = crossesShown;
    const jd = crossesShown ? crossingBetween(m0.jd, m1.jd, lo, hi, side, shown, latRad, lngRad, sample) : null;
    const geoJd =
      up.geo > 0 && low.geo <= 0
        ? crossingBetween(m0.jd, m1.jd, lo, hi, side, 0, latRad, lngRad, sample)
        : null;
    if (jd === null && geoJd === null) continue;
    events.push({ body, kind: m0.upper ? 'set' : 'rise', jd, geoJd, circumpolar: null });
  }
  merid.forEach((m, i) => {
    // The pass is this transit's half-day either side. The first and last
    // transits lack a neighbour, but they lie in the margin, outside the window.
    const before = i > 0 ? crossed[i - 1] : false;
    const after = i < crossed.length ? crossed[i] : false;
    events.push({
      body,
      kind: m.upper ? 'culminate' : 'anticulminate',
      jd: m.jd,
      geoJd: m.jd,
      circumpolar: before || after ? null : height[i].shown > 0 ? 'up' : 'down',
    });
  });
  return events;
}

// The instant an event is filed under: the displayed one, or — for a crossing
// of the geometric horizon alone — that one.
const eventTime = (e: SkyEvent): number => (e.jd ?? e.geoJd) as number;

/**
 * Every true rise / culmination / set / anti-culmination of each body at (lat, lng)
 * whose displayed instant (or, for a geometric-only crossing, geometric instant)
 * lies in [startJd, endJd), in time order. Each is solved on the body's own
 * motion: no event is copied from a neighbouring day, so a body can contribute
 * two of an event, or none, in any span. Bodies without ephemeris data
 * contribute nothing. See {@link SkyEvent} for the two horizon conventions.
 */
export function skyEventsBetween(
  startJd: number,
  endJd: number,
  lat: number,
  lng: number,
  bodies: PlanetName[],
  nodeType: NodeType,
  opts: SkyEventsOptions = {},
): SkyEvent[] {
  const latRad = lat * D2R;
  const lngRad = lng * D2R;
  const raw = opts.sample ?? engineSampler(nodeType);
  const out: SkyEvent[] = [];
  for (const body of bodies) {
    const evs = bodyEvents(body, startJd - MARGIN, endJd + MARGIN, latRad, lngRad, cachedSampler(raw, body));
    if (!evs) continue;
    // Each transit is enumerated once and each crossing once per bracket, so
    // nothing here can be a duplicate of anything else.
    for (const e of evs) {
      const t = eventTime(e);
      if (t >= startJd && t < endJd) out.push(e);
    }
  }
  return out.sort((x, y) => eventTime(x) - eventTime(y));
}

export interface NextSkyEventOptions extends SkyEventsOptions {
  /** How far an event must be from `fromJd` to count, days: a caller standing ON
   *  an event steps off it. Default 1 s. */
  skipJd?: number;
  /** How many days to search outward before giving up. Default 3. */
  days?: number;
}

/**
 * The displayed instant of the next rise / culmination / set / anti-culmination
 * of any of `bodies` after `fromJd` (dir 1) or before it (dir −1), more than
 * `skipJd` away: Slide's step to the next angular event. Searched a day at a
 * time outward, in absolute time, so midnight and clock changes need nothing
 * special, and further only when a day holds none (a sparse visible set). A
 * crossing of the geometric horizon alone is printed nowhere, so it is never a
 * stop. Null when there is none within `days` days. Lifted out of App on
 * 2026-10-02 so verify:rise-set can walk it against {@link skyEventsBetween}.
 */
export function nextSkyEvent(
  fromJd: number,
  dir: 1 | -1,
  lat: number,
  lng: number,
  bodies: PlanetName[],
  nodeType: NodeType,
  opts: NextSkyEventOptions = {},
): number | null {
  const { skipJd = 1 / 86_400, days = 3, ...solve } = opts;
  for (let k = 0; k < days; k++) {
    const from = dir > 0 ? fromJd + k : fromJd - k - 1;
    let best: number | null = null;
    for (const e of skyEventsBetween(from, from + 1, lat, lng, bodies, nodeType, solve)) {
      if (e.jd === null) continue;
      const ok = dir > 0 ? e.jd > fromJd + skipJd : e.jd < fromJd - skipJd;
      if (ok && (best === null || (dir > 0 ? e.jd < best : e.jd > best))) best = e.jd;
    }
    if (best !== null) return best;
  }
  return null;
}

/**
 * A civil day's rows, read from a window solve that covers it: each body's
 * displayed instants in [dayStartJd, dayEndJd), in `bodies` order. The band solves
 * a wider window once and derives its rows from it with this, so the day's rows
 * and the events handed to a track are one solve. A body with no events in the day
 * (no ephemeris data) has no row.
 */
export function skyDayRows(
  events: SkyEvent[],
  bodies: PlanetName[],
  dayStartJd: number,
  dayEndJd: number,
): BodyDayEvents[] {
  const out: BodyDayEvents[] = [];
  for (const body of bodies) {
    const row: BodyDayEvents = {
      body,
      rise: [],
      set: [],
      culminate: [],
      anticulminate: [],
      circumpolar: null,
    };
    let side: Circumpolar | null = null;
    let any = false;
    for (const e of events) {
      if (e.body !== body || e.jd === null || e.jd < dayStartJd || e.jd >= dayEndJd) continue;
      any = true;
      row[e.kind].push(e.jd);
      // With no crossing in the day the body keeps one side all day, and any
      // transit in it says which: its own pass's, or — when that pass crosses
      // outside the day — above at an upper transit, below at a lower.
      if (side === null && (e.kind === 'culminate' || e.kind === 'anticulminate')) {
        side = e.circumpolar ?? (e.kind === 'culminate' ? 'up' : 'down');
      }
    }
    if (!any) continue;
    if (row.rise.length === 0 && row.set.length === 0) row.circumpolar = side;
    out.push(row);
  }
  return out;
}

/**
 * Every body's rises, sets and upper & lower culminations in one civil day at
 * (lat, lng): [dayStartJd, dayEndJd), local midnight to the next local midnight
 * (UT). The day is 23 or 25 hours on a clock-change day, so pass the real end —
 * the default, 24 hours, is right only away from one. A view over
 * {@link skyEventsBetween} through {@link skyDayRows}. Bodies without ephemeris
 * data at this date contribute nothing.
 */
export function dailySkyEvents(
  dayStartJd: number,
  lat: number,
  lng: number,
  bodies: PlanetName[],
  nodeType: NodeType,
  dayEndJd: number = dayStartJd + 1,
  opts?: SkyEventsOptions,
): BodyDayEvents[] {
  const events = skyEventsBetween(dayStartJd, dayEndJd, lat, lng, bodies, nodeType, opts);
  return skyDayRows(events, bodies, dayStartJd, dayEndJd);
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
 * Built around the transit, not cut to a civil day: a sunset after local midnight
 * (high summer at high latitude) stays on the day whose noon it follows, where the
 * band's rows ({@link dailySkyEvents}) file it under the next civil day. The same
 * horizon solve from the same guess as those rows, so wherever both have the
 * crossing they agree to a fraction of a second. Null when there is no ephemeris
 * data.
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

