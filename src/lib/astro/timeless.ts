// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// How far a body can be from where a chart with no birth time places it — ONE RANGE RULE
// (Lina, 22 Oct 2026, §2.1; it replaced the fixed ±7.7° / ±1.11° spans of 2 Oct).
//
// A chart saved without a birth time stores 12:00 civil time as a PLACEHOLDER, and every
// position on it is read at that instant. The real moment lies somewhere in the birth DATE, so
// for the Sun, the Moon and the eight planets the motion over that date — 00:00 to 24:00 on the
// place's own clock — is read from the ephemeris. Direction is irrelevant: it is the size of
// the motion, direct or retrograde, and a station inside the day is covered because the day is
// sampled, not just its ends.
//
//   · A body whose motion reaches RANGE_MIN_DEG (0.9°) is RANGED: it prints as a range on the
//     wheel and in the longitude table, and its lines carry a band. 0.9° lies between the
//     fastest day Mars ever has (0.79°) and the slowest the Sun ever has (0.95°), so the Sun is
//     always ranged, Mars never, and Mercury and Venus whenever they are not slowed near a
//     station. The Moon always is.
//   · Any of the ten whose motion crosses a sign boundary gets the sign note, whatever its
//     speed (crossesSign — read in the zodiac on screen, which decides where the boundaries are).
//   · Everything else — the nodes, Lilith, Chiron, the asteroids, hypothetical points — is read
//     at noon with no range and no note. Fortune is not computed at all (App's fortuneSect).
//
// The day is the place's civil day: a clock change makes it 23 or 25 hours long and the range
// follows (the 25-hour day "takes care of itself"). Its two midnights come from the chart's
// zone (luxon, through atlas/timezone) when its stored offset is that zone's; a chart entered on
// a fixed offset or on local mean time keeps its stored offset for both.
//
// A range is carried as OFFSETS from the noon position, never as two longitudes: the wheel,
// the table and the map each place the body where they already do (a sidereal wheel, a
// projected line) and add the offsets, so the range can't disagree with the position it hedges.

import type { BirthData } from '../birthData';
import { birthDataToJD, bodyLonSpeed, raDecToEclipticLon, type NodeType, type PlanetName, type PlanetPosition } from '../ephemeris';
import { offsetHoursAt } from '../atlas/timezone';

/** The bodies a range is read for: the Sun, the Moon and the eight planets. */
export const RANGE_BODIES: readonly PlanetName[] = [
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
const RANGE_BODY_SET: ReadonlySet<PlanetName> = new Set(RANGE_BODIES);

/** The motion (degrees) at which a body is given as a range (Lina's 0.9°, see the header). */
export const RANGE_MIN_DEG = 0.9;

/** A body's motion over the birth date, as offsets (degrees of longitude) from where the chart
 *  places it: lo ≤ 0 ≤ hi, since noon is one of the day's samples. */
export interface BodyRange {
  lo: number;
  hi: number;
}

/** The birth date's motion for every body it is read for. */
export interface BirthDateMotion {
  /** Each body's offset from its noon degree at every sample across the date, in time order —
   *  what a midpoint's range is measured from (midpointRange). */
  samples: ReadonlyMap<PlanetName, readonly number[]>;
  /** Each body's range: the lowest and the highest of its samples. Every body read, ranged or
   *  not (rangedOnly picks the ranged ones). */
  ranges: ReadonlyMap<PlanetName, BodyRange>;
}

/** Whether a range is wide enough to print and band (≥ RANGE_MIN_DEG). */
export const isRanged = (r: BodyRange | undefined): r is BodyRange => !!r && r.hi - r.lo >= RANGE_MIN_DEG;

/** The ranged bodies alone, as the wheel, the table and the bands take them. */
export function rangedOnly(ranges: ReadonlyMap<PlanetName, BodyRange>): Map<PlanetName, BodyRange> {
  return new Map([...ranges].filter(([, r]) => isRanged(r)));
}

/** Whether the range around `lonDeg` (the body as the zodiac on screen places it) spans a sign
 *  boundary: the sign note, for any of the ten, whatever its speed. */
export function crossesSign(lonDeg: number, r: BodyRange): boolean {
  const sign = (d: number) => Math.floor((((d % 360) + 360) % 360) / 30);
  return sign(lonDeg + r.lo) !== sign(lonDeg + r.hi) || r.hi - r.lo >= 30;
}

/** A midpoint's own range over the day, measured per pair (Lina's §2.2): at each sample the
 *  midpoint has moved by half of each body's motion, so its offsets are the two bodies' offsets
 *  averaged — a body with no samples (a node, a minor body: read at noon) contributes none. */
export function midpointRange(a: readonly number[] | undefined, b: readonly number[] | undefined): BodyRange {
  const n = Math.max(a?.length ?? 0, b?.length ?? 0);
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    const m = ((a?.[i] ?? 0) + (b?.[i] ?? 0)) / 2;
    if (m < lo) lo = m;
    if (m > hi) hi = m;
  }
  return { lo, hi };
}

const msOfJd = (jd: number) => (jd - 2440587.5) * 86400000;
// The short way round, in degrees: (−180, 180].
const shortWay = (d: number) => {
  const x = ((((d + 180) % 360) + 360) % 360) - 180;
  return x === -180 ? 180 : x;
};

/** The birth date's two midnights and its noon placeholder, as Julian days (UT). */
export function birthDateBounds(chart: BirthData & { tzIana?: string; tzManual?: boolean }): {
  start: number;
  end: number;
  noon: number;
} {
  const noon = birthDataToJD(chart);
  // 0h UT of the civil date: the placeholder less its local hour, back through its offset.
  const jd0 = noon - (chart.hour + chart.minute / 60 - chart.tzOffset) / 24;
  let offStart = chart.tzOffset;
  let offEnd = chart.tzOffset;
  const iana = chart.tzIana;
  if (iana && !chart.tzManual) {
    try {
      // Only a zone whose own offset at the placeholder IS the stored one speaks for the day:
      // a fixed-offset or local-mean-time entry keeps its stored offset at both ends.
      if (Math.abs(offsetHoursAt(iana, msOfJd(noon)) - chart.tzOffset) < 1e-6) {
        offStart = offsetHoursAt(iana, msOfJd(jd0 - chart.tzOffset / 24));
        offEnd = offsetHoursAt(iana, msOfJd(jd0 + 1 - chart.tzOffset / 24));
      }
    } catch {
      // An unknown zone name: the stored offset at both ends.
    }
  }
  return { start: jd0 - offStart / 24, end: jd0 + 1 - offEnd / 24, noon };
}

/** The instants a birth date is sampled at: every hour from its first midnight to its last
 *  (24 hours, or 23 / 25 across a clock change), ends included. */
export function birthDateSampleJds(chart: BirthData & { tzIana?: string; tzManual?: boolean }): number[] {
  const { start, end } = birthDateBounds(chart);
  const n = Math.max(1, Math.round((end - start) * 24));
  return Array.from({ length: n + 1 }, (_, k) => start + ((end - start) * k) / n);
}

/** Offsets and ranges from longitudes sampled across the day, against the noon longitudes:
 *  the one reduction the chart's own motion and an overlay's (overlayBirthDateMotion) share. */
export function motionFromSamples(
  noonDeg: ReadonlyMap<PlanetName, number>,
  sampled: readonly ReadonlyMap<PlanetName, number>[],
): BirthDateMotion {
  const samples = new Map<PlanetName, number[]>();
  const ranges = new Map<PlanetName, BodyRange>();
  for (const [name, at] of noonDeg) {
    const offs: number[] = [];
    for (const s of sampled) {
      const d = s.get(name);
      if (d !== undefined) offs.push(shortWay(d - at));
    }
    if (!offs.length) continue;
    samples.set(name, offs);
    ranges.set(name, { lo: Math.min(0, ...offs), hi: Math.max(0, ...offs) });
  }
  return { samples, ranges };
}

/** The birth date's motion of the Sun, the Moon and the eight planets (the header's rule). */
export function birthDateMotion(
  chart: BirthData & { tzIana?: string; tzManual?: boolean },
  nodeType: NodeType = 'mean',
): BirthDateMotion {
  const lonsAt = (jd: number) => {
    const m = new Map<PlanetName, number>();
    for (const name of RANGE_BODIES) {
      const s = bodyLonSpeed(jd, name, nodeType);
      if (s) m.set(name, (s.lon * 180) / Math.PI);
    }
    return m;
  };
  return motionFromSamples(lonsAt(birthDataToJD(chart)), birthDateSampleJds(chart).map(lonsAt));
}

/** How many of the day's samples an overlay's motion is read at: every third hour and the last
 *  midnight. An overlay is rebuilt once per sample, and an overlay's bodies move steadily
 *  across one day (a progressed body over one ephemeris day), so the ends and a few points
 *  between them give the same extent as every hour. */
const OVERLAY_SAMPLE_STEP = 3;

/**
 * An overlay's motion over the birth date: the same rule, for an overlay of a chart with no
 * birth time (Lina, 22 Oct 2026, §2.3, generalising question 5). The overlay is rebuilt with the
 * birth moved across its date — `build` is handed the chart cast at each sample — and each of
 * its bodies' longitudes is read off the rebuilt layer, so a progressed body's range is its
 * motion over the progressed day that corresponds to the birth date, a directed body's is its
 * own birth-date motion carried by the arc, and a transiting body (Cyclo's outer planets) comes
 * out with no motion at all. Only the ten RANGE_BODIES are read.
 */
export function overlayBirthDateMotion<C extends BirthData & { tzIana?: string; tzManual?: boolean }>(
  chart: C,
  build: (c: C) => { positions: readonly PlanetPosition[] } | null,
  eps: number,
): BirthDateMotion | null {
  const lonsOf = (layer: { positions: readonly PlanetPosition[] } | null) => {
    if (!layer) return null;
    const m = new Map<PlanetName, number>();
    for (const p of layer.positions) {
      if (!RANGE_BODY_SET.has(p.name)) continue;
      m.set(p.name, ((p.lon ?? raDecToEclipticLon(p.ra, p.dec, eps)) * 180) / Math.PI);
    }
    return m;
  };
  const noon = lonsOf(build(chart));
  if (!noon) return null;
  const jds = birthDateSampleJds(chart);
  const noonJd = birthDataToJD(chart);
  const picks = jds.filter((_, k) => k % OVERLAY_SAMPLE_STEP === 0 || k === jds.length - 1);
  const sampled: Map<PlanetName, number>[] = [];
  for (const jd of picks) {
    // The same date and offset, the hour moved to the sample (fractional, and below 0 or past
    // 24 across a clock change — birthDataToJD reads it straight through).
    const hour = chart.hour + chart.minute / 60 + (jd - noonJd) * 24;
    const lons = lonsOf(build({ ...chart, hour, minute: 0 }));
    if (lons) sampled.push(lons);
  }
  return sampled.length ? motionFromSamples(noon, sampled) : null;
}
