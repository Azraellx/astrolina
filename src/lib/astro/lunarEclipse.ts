// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Lunar-eclipse visibility geometry.
//
// A lunar eclipse needs none of the fundamental-plane machinery solar paths do
// (eclipsePath.ts): the eclipsed Moon looks the same from everywhere it is
// above the horizon, so the only geographic question is "where is the Moon up
// at instant t". That makes the whole map a family of horizon circles — the
// great circle 90° from the sub-lunar point — evaluated at the phase contacts:
//
//   - the VISIBILITY HEMISPHERE at maximum (who sees the eclipse at its peak),
//   - rise/set boundary curves at phase contacts (between a phase's begin and
//     end curves, the Moon rises or sets mid-phase — the NASA map zones).
//
// Altitude convention: the GEOMETRIC geocentric horizon. True moonrise happens
// at apparent altitude ≈ +0.125° (the Moon's horizontal parallax, ~57′, lowers
// it more than refraction's ~34′ raises it — Meeus ch. 15), which shifts every
// curve here by ~14 km on the ground: under the drawn line width at any
// plausible zoom, so the correction is deliberately omitted. Latitudes are
// likewise geocentric (geodetic differs by ≤ 0.2°, same order, same verdict).
//
// Like the solar module, every function takes the ephemeris through the
// EclipseEphemeris adapter so the same math runs in the browser and in the
// Node verify script.
//
// The visibility hemisphere is closed over the true pole (POLE_LAT below). The map's
// tile pipeline clamps latitudes to web-mercator's limit (±85.0511°), so a flat map
// draws it up to that parallel and no further, and the globe — which extends a fill
// over the polar cap only from an edge lying exactly on the world's top or bottom
// tile edge, where the clamp puts the pole — shades the cap as well.

import { unwrapLongitudes } from './dateline';
import type {
  EclipseEphemeris,
  LunarEclipseTimes,
  SunMoonSample,
} from './eclipseAdapter';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

/** Phase-contact tags in chronological order. P = penumbral, U = umbral. */
export type LunarPhaseTag = 'P1' | 'U1' | 'U2' | 'max' | 'U3' | 'U4' | 'P4';
export const LUNAR_PHASE_ORDER: LunarPhaseTag[] = [
  'P1', 'U1', 'U2', 'max', 'U3', 'U4', 'P4',
];

export interface LunarEclipseGeometry {
  /** Sub-lunar point at maximum — where the eclipsed Moon stands at zenith. */
  sublunar: { lat: number; lng: number };
  /** Closed ring of the Moon-above-horizon hemisphere at maximum (longitudes
   *  unwrapped; closed over the pole on the sub-lunar side of the equator). */
  visPolygon: [number, number][];
  /** Moonrise/set boundary circles at the phase contacts worth drawing. */
  contactHorizons: { phase: LunarPhaseTag; jd: number; ring: [number, number][] }[];
  /** Sky samples at every phase contact the eclipse has (always incl. 'max'),
   *  for per-place visibility tests without further ephemeris calls. */
  samples: Partial<Record<LunarPhaseTag, { jd: number; sample: SunMoonSample }>>;
}

// Earth-fixed unit vector of the sub-lunar point (geocentric).
function sublunarVector(s: SunMoonSample): [number, number, number] {
  const lng = s.moonRa - s.gast;
  const cosD = Math.cos(s.moonDec);
  return [cosD * Math.cos(lng), cosD * Math.sin(lng), Math.sin(s.moonDec)];
}

const normLng = (deg: number) => {
  let v = deg % 360;
  if (v > 180) v -= 360;
  if (v <= -180) v += 360;
  return v;
};

/** The sub-lunar (Moon-at-zenith) ground point for one sky sample. */
export function sublunarPoint(s: SunMoonSample): { lat: number; lng: number } {
  return {
    lat: s.moonDec * RAD2DEG,
    lng: normLng((s.moonRa - s.gast) * RAD2DEG),
  };
}

/** Sine of the Moon's geometric altitude at a geographic point — the ζ
 *  analogue of the solar module; ≥ −0.01 counts as visible (refraction-width
 *  tolerance, matching localCircumstances' convention). */
export function moonSinAlt(s: SunMoonSample, latDeg: number, lngDeg: number): number {
  const phi = latDeg * DEG2RAD;
  const H = s.gast + lngDeg * DEG2RAD - s.moonRa; // local hour angle
  return (
    Math.sin(phi) * Math.sin(s.moonDec) +
    Math.cos(phi) * Math.cos(s.moonDec) * Math.cos(H)
  );
}

const HORIZON_STEPS = 181;

// The horizon circle (Moon altitude = 0) for one sky sample: the great circle
// 90° from the sub-lunar point, swept by azimuth and unwrapped into one
// continuous polyline. Not closed — callers append the first point for a
// drawn circle, or the pole closure for the hemisphere fill.
function horizonCircle(s: SunMoonSample): [number, number][] {
  let c = sublunarVector(s);
  // A sub-lunar point exactly on the equator degenerates the unwrap (the
  // circle runs pole-to-pole as a meridian pair); a hair of declination
  // restores a single monotonic sweep without moving anything visibly.
  if (Math.abs(c[2]) < 1e-6) {
    const nudged: SunMoonSample = { ...s, moonDec: 1e-6 };
    c = sublunarVector(nudged);
  }
  // Orthonormal frame perpendicular to c: n1 along the equator (east of the
  // sub-lunar meridian), n2 completing the right-handed set.
  const hx = Math.hypot(c[0], c[1]);
  const n1: [number, number, number] = [-c[1] / hx, c[0] / hx, 0];
  const n2: [number, number, number] = [
    c[1] * n1[2] - c[2] * n1[1],
    c[2] * n1[0] - c[0] * n1[2],
    c[0] * n1[1] - c[1] * n1[0],
  ];
  const pts: [number, number][] = [];
  for (let i = 0; i < HORIZON_STEPS; i++) {
    const A = (2 * Math.PI * i) / (HORIZON_STEPS - 1);
    const p = [
      Math.cos(A) * n1[0] + Math.sin(A) * n2[0],
      Math.cos(A) * n1[1] + Math.sin(A) * n2[1],
      Math.cos(A) * n1[2] + Math.sin(A) * n2[2],
    ];
    pts.push([
      normLng(Math.atan2(p[1], p[0]) * RAD2DEG),
      Math.asin(Math.max(-1, Math.min(1, p[2]))) * RAD2DEG,
    ]);
  }
  return unwrapLongitudes(pts);
}

/** A drawn moonrise/set circle: the horizon circle, closed. */
export function horizonRing(s: SunMoonSample): [number, number][] {
  const ring = horizonCircle(s);
  ring.push(ring[0]);
  return ring;
}

/** The latitude pole-enclosing rings close on: the pole itself. The tiler clamps it onto
 *  the world's top/bottom tile edge exactly, which is what lets the globe shade the polar
 *  cap. It used to be 85.05 — short of web-mercator's ±85.0511° limit, so inside the edge
 *  tiles, and the globe left the cap unshaded (night shade, nightShade.ts, had the same). */
const POLE_LAT = 90;

/**
 * The Moon-above-horizon hemisphere at one instant, as a renderable closed
 * polygon ring. The hemisphere always contains the pole on the sub-lunar side
 * of the equator, so the unwrapped boundary (net ±360° of longitude) is closed
 * with two corners over that pole — the standard pole-enclosing ring
 * construction.
 */
export function visibilityRing(s: SunMoonSample): [number, number][] {
  const boundary = horizonCircle(s);
  const poleLat = (s.moonDec >= 0 ? 1 : -1) * POLE_LAT;
  const first = boundary[0];
  const last = boundary[boundary.length - 1];
  return [...boundary, [last[0], poleLat], [first[0], poleLat], first];
}

/**
 * Everything the map needs for one lunar eclipse: ~7 ephemeris calls (one per
 * phase contact), then pure geometry. Curves drawn: the umbral contacts U1/U4
 * when an umbral phase exists (where the eclipse PROPER rises/sets), else the
 * penumbral P1/P4 — penumbral curves on top of umbral ones add clutter without
 * information, and the click card supplies exact per-place phase visibility.
 */
export function lunarGeometry(
  eph: EclipseEphemeris,
  ev: LunarEclipseTimes,
): LunarEclipseGeometry {
  const jdOf: Partial<Record<LunarPhaseTag, number | null>> = {
    P1: ev.penumbralBegin,
    U1: ev.partialBegin,
    U2: ev.totalBegin,
    max: ev.maximum,
    U3: ev.totalEnd,
    U4: ev.partialEnd,
    P4: ev.penumbralEnd,
  };
  const samples: LunarEclipseGeometry['samples'] = {};
  for (const phase of LUNAR_PHASE_ORDER) {
    const jd = jdOf[phase];
    if (jd != null) samples[phase] = { jd, sample: eph.sunMoon(jd) };
  }
  const max = samples.max!;
  const drawn: LunarPhaseTag[] =
    samples.U1 && samples.U4 ? ['U1', 'U4'] : ['P1', 'P4'];
  return {
    sublunar: sublunarPoint(max.sample),
    visPolygon: visibilityRing(max.sample),
    contactHorizons: drawn
      .filter((phase) => samples[phase])
      .map((phase) => ({
        phase,
        jd: samples[phase]!.jd,
        ring: horizonRing(samples[phase]!.sample),
      })),
    samples,
  };
}

// ── Per-place circumstances ───────────────────────────────────────────────────

export interface LunarLocalView {
  /** Every phase contact the eclipse has, with whether the Moon is up then. */
  phases: { phase: LunarPhaseTag; jd: number; visible: boolean }[];
  /** Moonrise/set instants falling INSIDE the eclipse window (UT JD), when
   *  the Moon crosses the horizon mid-eclipse; null otherwise. */
  moonrise: number | null;
  moonset: number | null;
}

const VISIBLE_SIN_ALT = -0.01;

/**
 * What one geographic point sees of the eclipse: which phase contacts happen
 * with the Moon up, plus any horizon crossing inside the eclipse window
 * (bisected live — a handful of ephemeris calls, fine at click rate). Returns
 * null when the Moon stays below the horizon for the whole eclipse.
 */
export function lunarLocalView(
  eph: EclipseEphemeris,
  geometry: LunarEclipseGeometry,
  latDeg: number,
  lngDeg: number,
): LunarLocalView | null {
  const present = LUNAR_PHASE_ORDER.filter((p) => geometry.samples[p]);
  const alt = new Map<LunarPhaseTag, number>();
  for (const p of present) {
    alt.set(p, moonSinAlt(geometry.samples[p]!.sample, latDeg, lngDeg));
  }
  const phases = present.map((phase) => ({
    phase,
    jd: geometry.samples[phase]!.jd,
    visible: alt.get(phase)! >= VISIBLE_SIN_ALT,
  }));
  if (phases.every((p) => !p.visible)) return null;

  // Horizon crossings between consecutive contacts: bisect each sign change
  // of sin(alt). The eclipse window (≲ 6.5 h) is shorter than half a lunar
  // day, so at most one rise and one set occur.
  let moonrise: number | null = null;
  let moonset: number | null = null;
  for (let i = 1; i < present.length; i++) {
    const a = present[i - 1], b = present[i];
    const sa = alt.get(a)!, sb = alt.get(b)!;
    if ((sa >= 0) === (sb >= 0)) continue;
    let lo = geometry.samples[a]!.jd;
    let hi = geometry.samples[b]!.jd;
    let sLo = sa;
    for (let n = 0; n < 24; n++) {
      const mid = (lo + hi) / 2;
      const sMid = moonSinAlt(eph.sunMoon(mid), latDeg, lngDeg);
      if ((sMid >= 0) === (sLo >= 0)) { lo = mid; sLo = sMid; }
      else hi = mid;
    }
    const jd = (lo + hi) / 2;
    if (sb >= 0) moonrise = jd;
    else moonset = jd;
  }
  return { phases, moonrise, moonset };
}
