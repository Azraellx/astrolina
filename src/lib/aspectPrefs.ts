// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Per-aspect orb settings for the wheel's aspect grid and aspect lines
// (Advanced ▸ Aspect orbs). The defaults reproduce the original behaviour
// exactly: one flat 7° across the majors, no luminary widening. Persisted as
// one JSON blob; values clamp to sane ranges on load so a hand-edited store
// can't wedge the wheel.

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
