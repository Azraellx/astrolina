// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Sidereal zodiac (Advanced ▸ Zodiac). The map lines never move — a line
// marks where a body is physically angular, a zodiac-independent event — so
// sidereal mode is a READING layer: every longitude bound for the wheel and
// the degree readouts is shifted by the ayanamsa (the accumulating offset
// between the season-anchored tropical zodiac and the star-anchored sidereal
// one, ~24° today, growing ~50.3″/yr with precession).
//
// The bundled @swisseph/browser wrapper exposes no sidereal API, so the
// ayanamsa is computed here: each mode anchors a published epoch value and
// accumulates the IAU-2006 general precession in longitude from that epoch.
// scripts/verify-ayanamsa.mjs checks this against the real Swiss Ephemeris
// values (via @swisseph/node) across 1800–2400.
//
// Each chart moment uses the ayanamsa OF ITS OWN epoch (natal at the natal
// jd, a transit ring at the transit jd): the sidereal frame rides the stars,
// so a natal point precesses with them — standard sidereal practice, and why
// sidereal transit contacts differ from tropical ones by the natal point's
// precession since birth.
import type { EclipticPosition, RelocatedAngles } from '../ephemeris';

export type ZodiacMode = 'tropical' | 'lahiri' | 'fagan-bradley';

export const ZODIAC_MODES: ZodiacMode[] = ['tropical', 'lahiri', 'fagan-bradley'];

const TWO_PI = 2 * Math.PI;
const wrap2pi = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
const ARCSEC = Math.PI / 180 / 3600;
const J2000 = 2451545.0;

// Accumulated general precession in longitude since J2000 (arcsec) — IAU 2006
// (P03: 5028.796195T + 1.1054348T² + 0.00007964T³ − 0.000023857T⁴), good to
// well under an arcsecond across the app's 1800–2399 window.
function pA(jd: number): number {
  const T = (jd - J2000) / 36525;
  return (((-0.000023857 * T + 0.00007964) * T + 1.1054348) * T + 5028.796195) * T;
}

// Epoch anchors, as the Swiss Ephemeris defines these modes — referred to the
// MEAN equinox, matching the mean-precession accumulation above. Lahiri's
// published 23°15′00″.658 (IAE 1956) is a TRUE-equinox figure; Swiss (and so
// this anchor) subtracts the ~16.8″ nutation at that epoch.
const ANCHORS: Record<Exclude<ZodiacMode, 'tropical'>, { t0: number; ayan0: number }> = {
  // Lahiri (Chitrapaksha) — the Indian national standard.
  lahiri: { t0: 2435553.5, ayan0: 23.250182778 - 0.004658035 },
  // Fagan/Bradley — the Western sidereal school's standard.
  'fagan-bradley': { t0: 2433282.5, ayan0: 24.042044444 },
};

/** The ayanamsa (radians) at a moment, per mode; 0 for tropical. */
export function ayanamsaRad(jd: number, mode: ZodiacMode): number {
  if (mode === 'tropical') return 0;
  const { t0, ayan0 } = ANCHORS[mode];
  return ayan0 * (Math.PI / 180) + (pA(jd) - pA(t0)) * ARCSEC;
}

/** Display clones with every longitude moved into the sidereal frame; the
 *  equatorial fields (dec) and motion flags ride along untouched. */
export function shiftEclipticPositions(
  positions: EclipticPosition[],
  ayan: number,
): EclipticPosition[] {
  if (ayan === 0) return positions;
  return positions.map((p) => ({ ...p, lon: wrap2pi(p.lon - ayan) }));
}

/** Per-body variant for a layer that mixes epochs (cyclo: progressed inners +
 *  transiting outers) — each body shifts by its own epoch's ayanamsa. */
export function shiftEclipticPositionsPerBody(
  positions: EclipticPosition[],
  ayanFor: (name: EclipticPosition['name']) => number,
): EclipticPosition[] {
  return positions.map((p) => ({ ...p, lon: wrap2pi(p.lon - ayanFor(p.name)) }));
}

/**
 * Angles + cusps in the sidereal frame. Quadrant and Equal cusps shift
 * uniformly (their geometry is zodiac-independent; Equal stays ASC + n·30° by
 * construction). WHOLE SIGN does not survive a uniform shift — its cusps are
 * sign boundaries, so in sidereal they must be rebuilt from the start of the
 * sidereal Ascendant's sign.
 */
export function shiftAngles(
  a: RelocatedAngles,
  ayan: number,
  rebuildWholeSign: boolean,
): RelocatedAngles {
  if (ayan === 0) return a;
  const shift = (lon: number) => wrap2pi(lon - ayan);
  const asc = shift(a.asc);
  const THIRTY = Math.PI / 6;
  const cusps = rebuildWholeSign
    ? Array.from({ length: 12 }, (_, i) =>
        wrap2pi(Math.floor(asc / THIRTY) * THIRTY + i * THIRTY),
      )
    : a.cusps.map(shift);
  return {
    asc,
    mc: shift(a.mc),
    dsc: shift(a.dsc),
    ic: shift(a.ic),
    cusps,
  };
}
