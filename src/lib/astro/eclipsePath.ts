// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Solar-eclipse path geometry from first principles — Besselian elements.
//
// Swiss Ephemeris can FIND eclipses (event times + classification) but exposes
// none of the geographic geometry: where the central line runs, how wide the
// umbral path is, which latitudes see a 50% partial. This module derives all of
// that from nothing but Sun/Moon positions, using the classical fundamental-
// plane method (Explanatory Supplement ch. 11; Meeus, "Elements of Solar
// Eclipses"; Espenak's Five Millennium Canon uses the same formulation):
//
//   1. The SHADOW AXIS is the line through the Moon's center pointing away from
//      the Sun. The FUNDAMENTAL PLANE passes through Earth's center,
//      perpendicular to that axis. Everything is measured in this frame, in
//      units of Earth's equatorial radius (ER): the axis crosses the plane at
//      (x, y); the penumbral / umbral cones cut the plane in circles of radius
//      l1 / l2 (l2 < 0 means the umbral cone is still converging when it
//      crosses the plane — its apex lies beyond it, so a real shadow disk
//      reaches the plane: a total eclipse; l2 > 0 means the cone closed before
//      the plane and the diverging antumbra cuts it: annular); tan f1 / tan f2
//      are the cones' half-angles, so at height ζ above the plane the radii
//      become L1 = l1 − ζ·tanF1, L2 = l2 − ζ·tanF2.
//   2. Sample those quantities from the ephemeris at several instants across
//      the eclipse and fit cubic polynomials in time — the BESSELIAN ELEMENTS.
//      Every curve below is then pure closed-form math on the fit.
//   3. A departure from the classical tabulation: we never compute μ (the
//      Greenwich hour angle of the axis). Points stay in the equatorial frame
//      of date and convert to geographic longitude at the very end via
//      lng = atan2(Y, X) − GAST. Swiss apparent positions + apparent sidereal
//      time are mutually consistent, and a whole family of sign-convention
//      bugs disappears with μ.
//
// EVERY public function takes the ephemeris through the EclipseEphemeris
// adapter — this module imports no ephemeris code, so the SAME math runs in the
// browser (@swisseph/browser via src/lib/ephemeris.ts) and in Node
// (scripts/verify-eclipses.ts drives it with @swisseph/node against published
// NASA path data).
//
// Magnitude convention: the fraction of the Sun's DIAMETER covered, the value
// eclipse catalogs tabulate. At fundamental-plane offset Δ from the axis,
// m = (L1 − Δ)/(L1 + L2). The Δ where m = 1 is |L2| — so the umbral path
// limits are just the m = 1.0 member of the same iso-magnitude family the
// dashed 25/50/75% curves come from, and one tracer serves both.
//
// If a future exotic case misbehaves (the tracer's known weak spot would be a
// grazing polar eclipse where a branch fragments), the drop-in fallback with
// the same outputs is: evaluate localCircumstances on a lat/lng grid and run
// marching squares over the max-magnitude field. Slower but unconditionally
// robust. Not needed for any eclipse checked so far.
//
// KNOWN LIMITATION: the map's tile pipeline (geojson-vt) clamps latitudes to
// the web-mercator limit (±85.05°), so the small deep-polar portion of a path
// like 2021-06-10's draws flattened along that parallel — the same clamp the
// ACG lines live with (lines.ts deliberately stops at ±85°). The umbral BAND
// is protected separately: pole-winding rings are rejected in umbralLimits.

import { unwrapLongitudes } from './dateline';

// ── Ephemeris adapter ─────────────────────────────────────────────────────────

/** Apparent geocentric Sun + Moon at one UT instant, equinox of date. */
export interface SunMoonSample {
  sunRa: number;     // radians
  sunDec: number;
  sunDistAu: number; // AU
  moonRa: number;
  moonDec: number;
  moonDistAu: number;
  gast: number;      // Greenwich apparent sidereal time, radians
}

export interface EclipseEphemeris {
  sunMoon(jdUT: number): SunMoonSample;
}

/** The slice of a Swiss eclipse-search result the geometry needs (UT JDs). */
export interface EclipseEventTimes {
  maximum: number;
  /** First/last external penumbral contact (P1/P4) — the global eclipse window. */
  partialBegin: number;
  partialEnd: number;
}

/**
 * Correct @swisseph's SolarEclipse field misalignment. The wrapper names its
 * fields as if the C library's tret[] array started with the phase contacts,
 * but tret[1] is actually "eclipse at local apparent noon", so every named
 * field is one slot off (verified against NASA's published contact times for
 * 2024-04-08): `partialEnd` holds P1, `centralBegin` holds P4, and the true
 * center-line end (tret[7]) is not exposed at all. We take only the fields
 * with reliable meanings; the axis-on-Earth window is re-derived from our own
 * elements in computeElements, which the lost tret slots would have fed.
 */
export function normalizeSwissEclipse(raw: {
  maximum: number;
  partialEnd: number;   // tret[2] — P1, partial begin
  centralBegin: number; // tret[3] — P4, partial end
}): EclipseEventTimes {
  const maximum = raw.maximum;
  let partialBegin = raw.partialEnd;
  let partialEnd = raw.centralBegin;
  // Extreme grazing eclipses (e.g. 1935-01-05, magnitude 0.0013 — the penumbra
  // barely kisses Earth) come back from Swiss with ZEROED contact slots, and
  // JD 0 would send the element sampler to 4713 BC, far outside the ephemeris
  // files. P1/P4 physically fall within ~3 h of maximum, so substitute a ±3 h
  // window when a slot is not a sane contact time; an over-wide window is
  // harmless downstream (off-Earth instants already trace as gaps).
  if (!(partialBegin > maximum - 1 && partialBegin < maximum)) {
    partialBegin = maximum - 3 / 24;
  }
  if (!(partialEnd > maximum && partialEnd < maximum + 1)) {
    partialEnd = maximum + 3 / 24;
  }
  return { maximum, partialBegin, partialEnd };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EARTH_EQ_RADIUS_KM = 6378.137;
/** Moon radius / Earth equatorial radius, the IAU k for umbral contacts. */
const K_UMBRA = 0.272281;
/** Slightly larger k for penumbral contacts (mean lunar limb conventions). */
const K_PENUMBRA = 0.2725076;
const R_SUN_ER = 696000 / EARTH_EQ_RADIUS_KM;
const AU_ER = 149597870.7 / EARTH_EQ_RADIUS_KM;
/** Earth flattening (IAU 1976, the value eclipse canons use). */
const FLATTENING = 1 / 298.257;
/** Polar/equatorial axis ratio (1 − f), squared form used in latitude swaps. */
const AXIS_RATIO = 1 - FLATTENING;

const TWO_PI = 2 * Math.PI;
const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

// ── Besselian elements ────────────────────────────────────────────────────────

/** The fitted element set evaluated at one instant (t hours from maximum). */
export interface InstantElements {
  x: number;      // shadow axis on the fundamental plane, ER
  y: number;
  dx: number;     // axis velocity, ER/hour
  dy: number;
  d: number;      // declination of the shadow-axis direction, radians
  a: number;      // right ascension of the shadow-axis direction, radians
  gast: number;   // Greenwich apparent sidereal time, radians
  l1: number;     // penumbral radius on the fundamental plane, ER
  l2: number;     // umbral radius (negative = total), ER
  tanF1: number;  // penumbral cone half-angle
  tanF2: number;  // umbral cone half-angle
}

export interface BesselianElements {
  /** Reference epoch (UT JD of greatest eclipse); t below is hours from it. */
  jd0: number;
  /** Penumbra-on-Earth window, hours from jd0. */
  tPartial: [number, number];
  /** Axis-on-Earth window, hours from jd0; null for non-central eclipses. */
  tCentral: [number, number] | null;
  /** Evaluate the polynomial fit. */
  at(t: number): InstantElements;
  /** Evaluate straight from the ephemeris (verify scripts bound fit error). */
  atDirect(t: number): InstantElements;
}

// Least-squares cubic fit through (t, v) samples — normal equations on the
// Vandermonde matrix. Nine samples over a ±4 h window in double precision is
// comfortably well-conditioned for degree 3 (NASA tabulates the same cubics).
function fitCubic(ts: number[], vs: number[]): [number, number, number, number] {
  const n = ts.length;
  // Power sums S_k = Σ t^k (k ≤ 6) and moment sums M_k = Σ v·t^k (k ≤ 3).
  const S = new Array(7).fill(0);
  const M = new Array(4).fill(0);
  for (let i = 0; i < n; i++) {
    let p = 1;
    for (let k = 0; k <= 6; k++) {
      S[k] += p;
      if (k <= 3) M[k] += vs[i] * p;
      p *= ts[i];
    }
  }
  // Solve the symmetric 4×4 system A·c = M with A[r][c] = S[r+c].
  const A = [
    [S[0], S[1], S[2], S[3], M[0]],
    [S[1], S[2], S[3], S[4], M[1]],
    [S[2], S[3], S[4], S[5], M[2]],
    [S[3], S[4], S[5], S[6], M[3]],
  ];
  for (let col = 0; col < 4; col++) {
    let piv = col;
    for (let r = col + 1; r < 4; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    }
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let r = 0; r < 4; r++) {
      if (r === col) continue;
      const k = A[r][col] / A[col][col];
      for (let c = col; c <= 4; c++) A[r][c] -= k * A[col][c];
    }
  }
  return [A[0][4] / A[0][0], A[1][4] / A[1][1], A[2][4] / A[2][2], A[3][4] / A[3][3]];
}

const evalCubic = (c: [number, number, number, number], t: number) =>
  c[0] + t * (c[1] + t * (c[2] + t * c[3]));
const evalCubicDeriv = (c: [number, number, number, number], t: number) =>
  c[1] + t * (2 * c[2] + t * 3 * c[3]);

// Make a sampled angle series continuous (no 2π wraps) so it can be poly-fitted.
function unwrapAngles(vs: number[]): number[] {
  const out = [vs[0]];
  let offset = 0;
  for (let i = 1; i < vs.length; i++) {
    const delta = vs[i] - vs[i - 1];
    if (delta > Math.PI) offset -= TWO_PI;
    else if (delta < -Math.PI) offset += TWO_PI;
    out.push(vs[i] + offset);
  }
  return out;
}

// One raw element evaluation straight from the ephemeris sample.
function elementsFromSample(s: SunMoonSample): Omit<InstantElements, 'dx' | 'dy'> {
  // Geocentric position vectors in the equatorial frame of date, in ER.
  const rs = s.sunDistAu * AU_ER;
  const rm = s.moonDistAu * AU_ER;
  const sun = [
    rs * Math.cos(s.sunDec) * Math.cos(s.sunRa),
    rs * Math.cos(s.sunDec) * Math.sin(s.sunRa),
    rs * Math.sin(s.sunDec),
  ];
  const moon = [
    rm * Math.cos(s.moonDec) * Math.cos(s.moonRa),
    rm * Math.cos(s.moonDec) * Math.sin(s.moonRa),
    rm * Math.sin(s.moonDec),
  ];
  // Shadow-axis direction ĝ: from Moon toward Sun.
  const g = [sun[0] - moon[0], sun[1] - moon[1], sun[2] - moon[2]];
  const dist = Math.hypot(g[0], g[1], g[2]); // Sun–Moon distance, ER
  const k = [g[0] / dist, g[1] / dist, g[2] / dist];
  const d = Math.asin(k[2]);
  const a = Math.atan2(k[1], k[0]);
  // Fundamental-plane basis: î eastward in the equator, ĵ completing the
  // right-handed set toward the north — the classical (x, y) orientation
  // (y grows toward the celestial north of the shadow axis).
  const sinA = Math.sin(a), cosA = Math.cos(a);
  const sinD = Math.sin(d), cosD = Math.cos(d);
  const i = [-sinA, cosA, 0];
  const j = [-sinD * cosA, -sinD * sinA, cosD];
  const x = moon[0] * i[0] + moon[1] * i[1] + moon[2] * i[2];
  const y = moon[0] * j[0] + moon[1] * j[1] + moon[2] * j[2];
  const z = moon[0] * k[0] + moon[1] * k[1] + moon[2] * k[2];
  // Shadow-cone half-angles: external (penumbra) and internal (umbra) tangents
  // to the Sun and Moon disks, then the cone radii where they cut the plane.
  const sinF1 = (R_SUN_ER + K_PENUMBRA) / dist;
  const sinF2 = (R_SUN_ER - K_UMBRA) / dist;
  const tanF1 = sinF1 / Math.sqrt(1 - sinF1 * sinF1);
  const tanF2 = sinF2 / Math.sqrt(1 - sinF2 * sinF2);
  const l1 = (z + K_PENUMBRA / sinF1) * tanF1;
  const l2 = (z - K_UMBRA / sinF2) * tanF2;
  return { x, y, d, a, gast: s.gast, l1, l2, tanF1, tanF2 };
}

const SAMPLE_COUNT = 9;

/**
 * Sample the ephemeris across the eclipse window and fit the Besselian
 * elements. ~18 ephemeris calls; everything downstream is pure arithmetic.
 */
export function computeElements(
  eph: EclipseEphemeris,
  ev: EclipseEventTimes,
): BesselianElements {
  const jd0 = ev.maximum;
  const t0 = (ev.partialBegin - jd0) * 24 - 0.25;
  const t1 = (ev.partialEnd - jd0) * 24 + 0.25;
  const ts: number[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    ts.push(t0 + ((t1 - t0) * i) / (SAMPLE_COUNT - 1));
  }
  const raw = ts.map((t) => elementsFromSample(eph.sunMoon(jd0 + t / 24)));
  const series = (f: (e: (typeof raw)[number]) => number) => raw.map(f);
  const cx = fitCubic(ts, series((e) => e.x));
  const cy = fitCubic(ts, series((e) => e.y));
  const cd = fitCubic(ts, series((e) => e.d));
  const ca = fitCubic(ts, unwrapAngles(series((e) => e.a)));
  const cg = fitCubic(ts, unwrapAngles(series((e) => e.gast)));
  const cl1 = fitCubic(ts, series((e) => e.l1));
  const cl2 = fitCubic(ts, series((e) => e.l2));
  // The cone half-angles drift by ~1e-6 over the window; means suffice.
  const tanF1 = raw.reduce((s, e) => s + e.tanF1, 0) / raw.length;
  const tanF2 = raw.reduce((s, e) => s + e.tanF2, 0) / raw.length;

  const at = (t: number): InstantElements => ({
    x: evalCubic(cx, t),
    y: evalCubic(cy, t),
    dx: evalCubicDeriv(cx, t),
    dy: evalCubicDeriv(cy, t),
    d: evalCubic(cd, t),
    a: evalCubic(ca, t),
    gast: evalCubic(cg, t),
    l1: evalCubic(cl1, t),
    l2: evalCubic(cl2, t),
    tanF1,
    tanF2,
  });
  const atDirect = (t: number): InstantElements => {
    const e = elementsFromSample(eph.sunMoon(jd0 + t / 24));
    // Direct velocity via a centered difference, for parity with `at`.
    const dt = 0.01;
    const eA = elementsFromSample(eph.sunMoon(jd0 + (t - dt) / 24));
    const eB = elementsFromSample(eph.sunMoon(jd0 + (t + dt) / 24));
    return {
      ...e,
      dx: (eB.x - eA.x) / (2 * dt),
      dy: (eB.y - eA.y) / (2 * dt),
    };
  };

  const tPartial: [number, number] = [
    (ev.partialBegin - jd0) * 24,
    (ev.partialEnd - jd0) * 24,
  ];
  return {
    jd0,
    tPartial,
    tCentral: findAxisWindow(at, tPartial),
    at,
    atDirect,
  };
}

// The interval where the shadow axis itself crosses Earth — derived from OUR
// fitted elements (a single interval for any real eclipse; empty for partials
// and non-central eclipses): coarse scan, then bisect both touch instants.
function findAxisWindow(
  at: (t: number) => InstantElements,
  [tA, tB]: [number, number],
): [number, number] | null {
  const onEarth = (t: number) => {
    const e = at(t);
    return fundamentalToGeo(e, e.x, e.y) !== null;
  };
  const SCAN = 240;
  let first = NaN, last = NaN;
  for (let i = 0; i <= SCAN; i++) {
    const t = tA + ((tB - tA) * i) / SCAN;
    if (onEarth(t)) {
      if (Number.isNaN(first)) first = t;
      last = t;
    }
  }
  if (Number.isNaN(first)) return null;
  const step = (tB - tA) / SCAN;
  const bisect = (tIn: number, tOut: number): number => {
    let lo = tIn, hi = tOut;
    for (let n = 0; n < 28; n++) {
      const mid = (lo + hi) / 2;
      if (onEarth(mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  return [
    first - step <= tA ? first : bisect(first, first - step),
    last + step >= tB ? last : bisect(last, last + step),
  ];
}

// ── Fundamental plane ⇄ geographic conversions ────────────────────────────────

interface GeoPoint {
  lat: number;  // geodetic latitude, degrees
  lng: number;  // longitude, degrees east, normalized to (−180, 180]
  zeta: number; // height above the fundamental plane, ER (>0 = sunward)
}

// Rebuild the fundamental-plane basis vectors from the fitted (d, a).
function basis(el: InstantElements) {
  const sinA = Math.sin(el.a), cosA = Math.cos(el.a);
  const sinD = Math.sin(el.d), cosD = Math.cos(el.d);
  return {
    i: [-sinA, cosA, 0],
    j: [-sinD * cosA, -sinD * sinA, cosD],
    k: [cosD * cosA, cosD * sinA, sinD],
  };
}

const normLng = (deg: number) => {
  let v = deg % 360;
  if (v > 180) v -= 360;
  if (v <= -180) v += 360;
  return v;
};

/**
 * Drop a fundamental-plane point (u, v) along the shadow axis onto Earth's
 * surface. Solves |M·(p + ζk̂)| = 1 for the ellipsoid scaled by
 * M = diag(1, 1, 1/(1−f)) and keeps the sunward root — the day-side surface
 * point. Returns null when the line misses Earth.
 */
function fundamentalToGeo(el: InstantElements, u: number, v: number): GeoPoint | null {
  const { i, j, k } = basis(el);
  const p = [
    u * i[0] + v * j[0],
    u * i[1] + v * j[1],
    u * i[2] + v * j[2],
  ];
  const mk = [k[0], k[1], k[2] / AXIS_RATIO];
  const mp = [p[0], p[1], p[2] / AXIS_RATIO];
  const A = mk[0] * mk[0] + mk[1] * mk[1] + mk[2] * mk[2];
  const B = 2 * (mp[0] * mk[0] + mp[1] * mk[1] + mp[2] * mk[2]);
  const C = mp[0] * mp[0] + mp[1] * mp[1] + mp[2] * mp[2] - 1;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const zeta = (-B + Math.sqrt(disc)) / (2 * A);
  const X = p[0] + zeta * k[0];
  const Y = p[1] + zeta * k[1];
  const Z = p[2] + zeta * k[2];
  const lng = normLng((Math.atan2(Y, X) - el.gast) * RAD2DEG);
  // Geocentric → geodetic latitude on the ellipsoid: tanφ = tanφ_c / (1−f)².
  const lat = Math.atan2(Z, AXIS_RATIO * AXIS_RATIO * Math.hypot(X, Y)) * RAD2DEG;
  return { lat, lng, zeta };
}

/**
 * The inverse: a geographic point's fundamental-plane coordinates at time t.
 * ζ > 0 also means the Sun is (geometrically) above the point's horizon.
 */
function geoToFundamental(
  el: InstantElements,
  latDeg: number,
  lngDeg: number,
): { u: number; v: number; zeta: number } {
  const phi = latDeg * DEG2RAD;
  // Geodetic latitude → geocentric position on the ellipsoid (a = 1):
  // ρcosφ' = Ccosφ, ρsinφ' = Ssinφ with the standard ellipsoidal C and S.
  const Cg = 1 / Math.sqrt(Math.cos(phi) ** 2 + (AXIS_RATIO * Math.sin(phi)) ** 2);
  const Sg = AXIS_RATIO * AXIS_RATIO * Cg;
  const theta = el.gast + lngDeg * DEG2RAD; // the point's right ascension
  const X = Cg * Math.cos(phi) * Math.cos(theta);
  const Y = Cg * Math.cos(phi) * Math.sin(theta);
  const Z = Sg * Math.sin(phi);
  const { i, j, k } = basis(el);
  return {
    u: X * i[0] + Y * i[1] + Z * i[2],
    v: X * j[0] + Y * j[1] + Z * j[2],
    zeta: X * k[0] + Y * k[1] + Z * k[2],
  };
}

// ── Curve tracing ─────────────────────────────────────────────────────────────

/** Chebyshev (cosine-spaced) nodes over [a, b] — denser toward both ends,
 *  where eclipse curves move fastest (the sunrise/sunset extremes). */
function chebyshevNodes(a: number, b: number, n: number): number[] {
  const out: number[] = [];
  for (let idx = 0; idx < n; idx++) {
    const u = (1 - Math.cos((Math.PI * idx) / (n - 1))) / 2;
    out.push(a + (b - a) * u);
  }
  return out;
}

/** Split a traced sequence on gaps (nulls), drop dust, unwrap each segment. */
function toSegments(points: (GeoPoint | null)[]): [number, number][][] {
  const segments: [number, number][][] = [];
  let cur: [number, number][] = [];
  for (const p of points) {
    if (p) {
      cur.push([p.lng, p.lat]);
    } else if (cur.length) {
      if (cur.length >= 2) segments.push(unwrapLongitudes(cur));
      cur = [];
    }
  }
  if (cur.length >= 2) segments.push(unwrapLongitudes(cur));
  return segments;
}

const CENTRAL_STEPS = 181;

/**
 * The central line — where the shadow axis itself meets the ground, sampled
 * over the axis-on-Earth window computeElements already bisected. Empty for
 * partial and non-central eclipses.
 */
export function centralLine(el: BesselianElements): [number, number][][] {
  if (!el.tCentral) return [];
  const [tA, tB] = el.tCentral;
  const points = chebyshevNodes(tA, tB, CENTRAL_STEPS).map((t) => {
    const e = el.at(t);
    return fundamentalToGeo(e, e.x, e.y);
  });
  return toSegments(points);
}

const LIMIT_STEPS = 241;
const TRACE_ITERATIONS = 6;
const TRACE_TOLERANCE = 1e-5; // ER, ≈ 64 m
const VELOCITY_DT = 0.01;     // hours, for the ground-velocity difference

/**
 * Offset radius from the shadow axis for the curve being traced, as a function
 * of the observer's height ζ above the fundamental plane:
 *   umbral path limit       Δ = |L2(ζ)|         (the magnitude-1.0 member)
 *   iso-magnitude M curve   Δ = L1(ζ) − M·(L1(ζ) + L2(ζ))
 */
type OffsetFn = (el: InstantElements, zeta: number) => number;

const umbralOffset: OffsetFn = (el, zeta) => Math.abs(el.l2 - zeta * el.tanF2);
const magnitudeOffset = (m: number): OffsetFn => (el, zeta) => {
  const L1 = el.l1 - zeta * el.tanF1;
  const L2 = el.l2 - zeta * el.tanF2;
  return L1 - m * (L1 + L2);
};

/**
 * Trace one branch (side = ±1) of an offset curve across the eclipse.
 *
 * At each instant the curve passes through the points whose LOCAL eclipse
 * maximum happens right then: where the shadow's motion relative to the
 * rotating ground is perpendicular to the offset from the axis. So per time
 * step: estimate that relative velocity (numerically — the ground point's
 * fundamental-plane drift over ±36 s, minus the fitted axis velocity), offset
 * the axis by Δ(ζ) perpendicular to it, re-project, and iterate until the
 * point stops moving. Off-Earth instants become gaps; toSegments splits there.
 */
function traceAtInstant(
  el: BesselianElements,
  t: number,
  offsetFn: OffsetFn,
  side: 1 | -1,
): GeoPoint | null {
  const e = el.at(t);
  // Seed at the axis — clamped radially to Earth's limb when the axis
  // itself misses (partial eclipses), so there is always a ground point to
  // measure the rotation velocity at.
  let ground = fundamentalToGeo(e, e.x, e.y) ?? clampToLimb(e, e.x, e.y);
  let result: GeoPoint | null = null;
  let prevU = NaN, prevV = NaN;
  for (let iter = 0; iter < TRACE_ITERATIONS; iter++) {
    // Ground-point velocity in the fundamental plane (Earth rotation seen
    // by the moving frame), then the shadow-relative velocity.
    const fA = geoToFundamental(el.at(t - VELOCITY_DT), ground.lat, ground.lng);
    const fB = geoToFundamental(el.at(t + VELOCITY_DT), ground.lat, ground.lng);
    const wu = (fB.u - fA.u) / (2 * VELOCITY_DT) - e.dx;
    const wv = (fB.v - fA.v) / (2 * VELOCITY_DT) - e.dy;
    const wLen = Math.hypot(wu, wv);
    if (wLen < 1e-9) break; // degenerate (no relative motion) — skip instant
    // Unit normal to the relative velocity; the branch side picks which.
    const nu = (side * -wv) / wLen;
    const nv = (side * wu) / wLen;
    const zeta = Math.max(0, geoToFundamental(e, ground.lat, ground.lng).zeta);
    const L = offsetFn(e, zeta);
    if (L <= 0) { result = null; break; } // curve family vanished (e.g. m>max)
    const u = e.x + L * nu;
    const v = e.y + L * nv;
    const projected = fundamentalToGeo(e, u, v);
    if (!projected) { result = null; break; } // off Earth at this instant
    result = projected;
    ground = projected;
    if (Math.hypot(u - prevU, v - prevV) < TRACE_TOLERANCE) break;
    prevU = u;
    prevV = v;
  }
  return result;
}

function traceOffsetCurve(
  el: BesselianElements,
  offsetFn: OffsetFn,
  side: 1 | -1,
): (GeoPoint | null)[] {
  const [tA, tB] = el.tPartial;
  return chebyshevNodes(tA, tB, LIMIT_STEPS).map((t) =>
    traceAtInstant(el, t, offsetFn, side),
  );
}

/**
 * Width of the umbral/antumbral path at one instant — the great-circle
 * distance between the two limit points. Null while the umbra is off Earth.
 */
export function umbralPathWidthKm(el: BesselianElements, t: number): number | null {
  const n = traceAtInstant(el, t, umbralOffset, 1);
  const s = traceAtInstant(el, t, umbralOffset, -1);
  if (!n || !s) return null;
  // Haversine on the mean sphere — for a ≤300 km span the ellipsoidal
  // correction is below a kilometre, well under the path-edge softness.
  const MEAN_RADIUS_KM = 6371.0;
  const phi1 = n.lat * DEG2RAD, phi2 = s.lat * DEG2RAD;
  const dPhi = phi2 - phi1;
  const dLng = (s.lng - n.lng) * DEG2RAD;
  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLng / 2) ** 2;
  return 2 * MEAN_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// Largest on-Earth point along the ray from the fundamental-plane origin
// toward (u, v) — the limb point nearest the axis. (The origin always
// projects: it is Earth's center.) Used to seed tracing for partial eclipses
// and to place the greatest-eclipse marker of non-central ones.
function clampToLimb(el: InstantElements, u: number, v: number): GeoPoint {
  let lo = 0, hi = 1;
  for (let n = 0; n < 32; n++) {
    const mid = (lo + hi) / 2;
    if (fundamentalToGeo(el, u * mid, v * mid)) lo = mid;
    else hi = mid;
  }
  // lo is the last scale that projected; recompute its point.
  return fundamentalToGeo(el, u * lo, v * lo)!;
}

/**
 * Northern and southern limits of the umbral (or antumbral) path. Returns the
 * limit polylines plus — when both limits are single unbroken arcs — a closed
 * band ring suitable for a translucent fill between them.
 */
export function umbralLimits(el: BesselianElements): {
  limits: [number, number][][];
  band: [number, number][] | null;
} {
  const north = toSegments(traceOffsetCurve(el, umbralOffset, 1));
  const south = toSegments(traceOffsetCurve(el, umbralOffset, -1));
  let band: [number, number][] | null = null;
  if (north.length === 1 && south.length === 1) {
    // North limit forward, south limit reversed, re-unwrapped as ONE sequence
    // so a dateline-crossing band stays a contiguous ring, then closed.
    const ring = unwrapLongitudes([...north[0], ...[...south[0]].reverse()]);
    // A path that crosses near a pole (2021-06-10's Arctic annular, and a
    // dozen like it) yields a ring that WINDS AROUND the pole: unwrapping
    // accumulates a net ~360° of longitude, so the closure becomes a
    // near-world-width chord and the planar polygon fills a hemisphere-wide
    // streak. Healthy rings return to their starting longitude (net ≈ 0 —
    // even dateline crossers, and even with the wild local longitude swings
    // of a near-pole vertex, like 2026-08-12's limit at 89°N). Reject the
    // wound rings (the limit polylines still draw); also reject any ring
    // with a world-scale chord away from the poles, where it would be a
    // genuine visual smear rather than a sub-pixel polar artifact.
    const netWrap = Math.abs(ring[ring.length - 1][0] - ring[0][0]);
    ring.push(ring[0]);
    const lowLatChord = ring.some(
      (p, i) =>
        i > 0 &&
        Math.abs(p[0] - ring[i - 1][0]) > 45 &&
        Math.max(Math.abs(p[1]), Math.abs(ring[i - 1][1])) < 80,
    );
    if (netWrap < 180 && !lowLatChord) band = ring;
  }
  return { limits: [...north, ...south], band };
}

/**
 * The dashed "maximum eclipse is M" curves, both branches, for
 * M = step, 2·step, … below 1.0. Solar Maps draws these at 25% intervals.
 */
export function magnitudeIsolines(
  el: BesselianElements,
  stepPct: number,
): { magnitude: number; segments: [number, number][][] }[] {
  const out: { magnitude: number; segments: [number, number][][] }[] = [];
  for (let pct = stepPct; pct < 100; pct += stepPct) {
    const m = pct / 100;
    const segments = [
      ...toSegments(traceOffsetCurve(el, magnitudeOffset(m), 1)),
      ...toSegments(traceOffsetCurve(el, magnitudeOffset(m), -1)),
    ];
    if (segments.length) out.push({ magnitude: m, segments });
  }
  return out;
}

/**
 * The point of greatest eclipse — where the shadow axis passes closest to
 * Earth's center. Central eclipses: the axis ground point at that instant.
 * Non-central/partial: the limb point nearest the axis.
 */
export function greatestEclipsePoint(el: BesselianElements): {
  lat: number;
  lng: number;
  jd: number;
} {
  // The axis-to-geocenter distance is minimal very near t = 0 (that is the
  // catalog's definition of greatest eclipse); golden-section a ±20 min
  // bracket to land on OUR elements' own minimum.
  const dist = (t: number) => {
    const e = el.at(t);
    return Math.hypot(e.x, e.y);
  };
  const GR = (Math.sqrt(5) - 1) / 2;
  let lo = -1 / 3, hi = 1 / 3;
  let m1 = hi - GR * (hi - lo), m2 = lo + GR * (hi - lo);
  for (let n = 0; n < 40; n++) {
    if (dist(m1) < dist(m2)) { hi = m2; m2 = m1; m1 = hi - GR * (hi - lo); }
    else { lo = m1; m1 = m2; m2 = lo + GR * (hi - lo); }
  }
  const t = (lo + hi) / 2;
  const e = el.at(t);
  const p = fundamentalToGeo(e, e.x, e.y) ?? clampToLimb(e, e.x, e.y);
  return { lat: p.lat, lng: p.lng, jd: el.jd0 + t / 24 };
}

// ── Local circumstances ───────────────────────────────────────────────────────

export interface LocalCircumstances {
  /**
   * Maximum eclipse magnitude reached at this place, in the catalog
   * convention: the fraction of the Sun's diameter covered while the eclipse
   * is partial, switching to the Moon/Sun apparent-diameter RATIO once the
   * place is inside totality (> 1) or annularity (< 1, but ≥ ring coverage).
   */
  magnitude: number;
  /** Fraction of the Sun's AREA covered at that moment (what the eye sees). */
  obscuration: number;
  /** UT instant of the local maximum. */
  jd: number;
}

/**
 * What this geographic point experiences: peak magnitude, obscuration, and
 * when. Returns null where the eclipse is invisible (Sun below the horizon
 * throughout, or the penumbra never reaches the place). Powers hover tips.
 */
export function localCircumstances(
  el: BesselianElements,
  latDeg: number,
  lngDeg: number,
): LocalCircumstances | null {
  const [tA, tB] = el.tPartial;
  const magAt = (t: number): number => {
    const e = el.at(t);
    const f = geoToFundamental(e, latDeg, lngDeg);
    // Sun below the horizon — but allow ~0.6° past the geometric horizon
    // (ζ ≈ sin alt): refraction keeps the Sun visible there, and the maximum
    // of a grazing eclipse sits exactly on the terminator (1935-01-05's peak
    // is at ζ = −0.002, a hair "below" geometrically yet plainly visible).
    if (f.zeta < -0.01) return -Infinity;
    const L1 = e.l1 - f.zeta * e.tanF1;
    const L2 = e.l2 - f.zeta * e.tanF2;
    const delta = Math.hypot(f.u - e.x, f.v - e.y);
    return (L1 - delta) / (L1 + L2);
  };
  // Coarse scan for the best bracket, then golden-section refine.
  const STEPS = 96;
  let bestT = tA, bestM = -Infinity;
  for (let i = 0; i <= STEPS; i++) {
    const t = tA + ((tB - tA) * i) / STEPS;
    const m = magAt(t);
    if (m > bestM) { bestM = m; bestT = t; }
  }
  if (!Number.isFinite(bestM)) return null;
  const span = (tB - tA) / STEPS;
  const GR = (Math.sqrt(5) - 1) / 2;
  let lo = bestT - span, hi = bestT + span;
  let m1 = hi - GR * (hi - lo), m2 = lo + GR * (hi - lo);
  for (let n = 0; n < 36; n++) {
    if (magAt(m1) > magAt(m2)) { hi = m2; m2 = m1; m1 = hi - GR * (hi - lo); }
    else { lo = m1; m1 = m2; m2 = lo + GR * (hi - lo); }
  }
  const t = (lo + hi) / 2;
  let magnitude = magAt(t);
  if (magnitude <= 0) return null;

  // Obscuration: the classical two-disk overlap. In Δ-scaled units the Sun
  // and Moon apparent radii are (L1+L2)/2 and (L1−L2)/2, separated by Δ.
  const e = el.at(t);
  const f = geoToFundamental(e, latDeg, lngDeg);
  const L1 = e.l1 - f.zeta * e.tanF1;
  const L2 = e.l2 - f.zeta * e.tanF2;
  const rs = (L1 + L2) / 2;
  const rm = (L1 - L2) / 2;
  const s = Math.hypot(f.u - e.x, f.v - e.y);
  // Inside the central phase (Δ ≤ |L2|, i.e. m ≥ min(1, ratio)) the reported
  // magnitude switches to the diameter ratio — the value local-circumstance
  // tables list for places that see totality or the full ring.
  const ratio = rm / rs;
  if (magnitude >= Math.min(1, ratio)) magnitude = ratio;
  let obscuration: number;
  if (s >= rs + rm) {
    obscuration = 0;
  } else if (s <= Math.abs(rm - rs)) {
    // One disk inside the other: totality (1) or annularity ((rm/rs)²).
    obscuration = rm >= rs ? 1 : (rm * rm) / (rs * rs);
  } else {
    const a1 = Math.acos((s * s + rs * rs - rm * rm) / (2 * s * rs));
    const a2 = Math.acos((s * s + rm * rm - rs * rs) / (2 * s * rm));
    const lens =
      rs * rs * (a1 - Math.sin(2 * a1) / 2) + rm * rm * (a2 - Math.sin(2 * a2) / 2);
    obscuration = lens / (Math.PI * rs * rs);
  }
  return { magnitude, obscuration, jd: el.jd0 + t / 24 };
}
