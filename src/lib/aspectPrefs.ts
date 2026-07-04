// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Per-aspect orb settings for the wheel's aspect grid and aspect lines
// (Advanced ▸ Aspect orbs). The defaults reproduce the original behaviour
// exactly: one flat 7° across the majors, no luminary widening. Persisted as
// one JSON blob; values clamp to sane ranges on load so a hand-edited store
// can't wedge the wheel. Also home to the aspect-line display filters (below).
import type { AspectKind } from './astro/angleAspects';
import type { LineType } from './astro/lines';

export type AspectName =
  | 'conjunction'
  | 'opposition'
  | 'trine'
  | 'square'
  | 'sextile';

export const ASPECT_NAMES: AspectName[] = [
  'conjunction',
  'opposition',
  'trine',
  'square',
  'sextile',
];

export interface AspectOrbs {
  /** Max orb (degrees) per aspect. */
  orbs: Record<AspectName, number>;
  /** Extra degrees allowed when either body is the Sun or Moon — the common
   *  "luminaries run wider" practice. 0 disables it. */
  luminaryBonus: number;
  /** Orb (degrees of declination) for parallel/contraparallel aspects. */
  declinationOrb: number;
}

export const DEFAULT_ASPECT_ORBS: AspectOrbs = {
  orbs: { conjunction: 7, opposition: 7, trine: 7, square: 7, sextile: 7 },
  luminaryBonus: 0,
  declinationOrb: 1,
};

const KEY = 'astro:aspect-orbs:v1';
const MAX_ASPECT_ORB = 15;
const MAX_LUMINARY_BONUS = 5;

const clampOrb = (v: unknown, fallback: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(Math.max(v, 0), max)
    : fallback;

export function loadAspectOrbs(): AspectOrbs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_ASPECT_ORBS;
    const parsed = JSON.parse(raw) as Partial<AspectOrbs>;
    const orbs = {} as Record<AspectName, number>;
    for (const name of ASPECT_NAMES) {
      orbs[name] = clampOrb(
        parsed.orbs?.[name],
        DEFAULT_ASPECT_ORBS.orbs[name],
        MAX_ASPECT_ORB,
      );
    }
    return {
      orbs,
      luminaryBonus: clampOrb(parsed.luminaryBonus, 0, MAX_LUMINARY_BONUS),
      declinationOrb: clampOrb(parsed.declinationOrb, 1, 3),
    };
  } catch {
    return DEFAULT_ASPECT_ORBS;
  }
}

export function saveAspectOrbs(o: AspectOrbs) {
  localStorage.setItem(KEY, JSON.stringify(o));
}

/** The widest reachable orb — normalizes the aspect lines' opacity fade. */
export function maxAspectOrb(o: AspectOrbs): number {
  return Math.max(...ASPECT_NAMES.map((n) => o.orbs[n])) + o.luminaryBonus;
}

// ── Aspect-line display filters (the Aspect Lines window) ───────────────────
// Which of the map's aspect lines draw. Quality note: every drawn line reads
// simultaneously as an aspect to one angle and its 180−a complement to the
// opposite angle (sextile↔trine, square↔square — see astro/angleAspects
// ASPECT_COMPLEMENT), so sextile and trine are ONE harmonious family and the
// square family stands alone as the challenging one. A gated-tier surface
// (lib/plan): App applies the DEFAULTS unless the plan reaches that rung, so a
// stale pref can never hide lines for a tier that hasn't reached it.
export interface AspectLineFilters {
  /** The sextile/trine family. */
  harmonious: boolean;
  /** The square family. */
  challenging: boolean;
  /** Lines labeled to the MC axis (each also readable from the IC). */
  mcAxis: boolean;
  /** Lines labeled to the ASC (horizon) axis (each also readable from the DSC). */
  ascAxis: boolean;
}

export const DEFAULT_ASPECT_LINE_FILTERS: AspectLineFilters = {
  harmonious: true,
  challenging: true,
  mcAxis: true,
  ascAxis: true,
};

const FILTERS_KEY = 'astro:aspect-line-filters:v1';

const boolOr = (v: unknown, fallback: boolean) =>
  typeof v === 'boolean' ? v : fallback;

export function loadAspectLineFilters(): AspectLineFilters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return DEFAULT_ASPECT_LINE_FILTERS;
    const p = JSON.parse(raw) as Partial<AspectLineFilters>;
    return {
      harmonious: boolOr(p.harmonious, true),
      challenging: boolOr(p.challenging, true),
      mcAxis: boolOr(p.mcAxis, true),
      ascAxis: boolOr(p.ascAxis, true),
    };
  } catch {
    return DEFAULT_ASPECT_LINE_FILTERS;
  }
}

export function saveAspectLineFilters(f: AspectLineFilters) {
  localStorage.setItem(FILTERS_KEY, JSON.stringify(f));
}

/** Whether one aspect-line feature passes the display filters. Stable under the
 *  generator's MC/ASC relabeling: quality tests 'square' vs not-square (the
 *  complement maps sextile↔trine within the harmonious family), and the axis
 *  tests the displayed lineType. VX/AVX-branch lines are never relabeled and
 *  pass both axis tests untouched. */
export function aspectLinePasses(
  f: AspectLineFilters,
  aspect: AspectKind,
  lineType: LineType,
): boolean {
  if (aspect === 'square' ? !f.challenging : !f.harmonious) return false;
  if (lineType === 'MC') return f.mcAxis;
  if (lineType === 'ASC') return f.ascAxis;
  return true;
}
