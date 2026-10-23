// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Which house a longitude falls in, read from the twelve cusps the wheel draws.
//
// HALF-OPEN, and that is a rule rather than a detail: a house runs from its own cusp
// up to the next one, not including it, so a body exactly on a cusp belongs to the
// house that cusp BEGINS. The wheel's glyph layout keeps each body inside the same
// sector by the same rule (lib/ringLayout, its spokes), so the house a tip names and
// the slice the glyph is drawn in cannot disagree. (2026-10-23)
//
// That holds only while the cusps go once round the wheel in order (cuspsInOrder). A
// composite's cusps can come out of order, and then no house is named at all, rather than
// one the drawing contradicts.
//
// The TRUE longitude, always — never a glyph's drawn position, which the layout may
// have nudged along the ring.

const TAU = 2 * Math.PI;

/** The forward arc from `a` to `b`, in radians, in [0, 2π): the span of a house that
 *  runs from cusp `a` to cusp `b`, wrapping past 0° the way the wheel does. */
export const forwardSpan = (a: number, b: number): number => (((b - a) % TAU) + TAU) % TAU;

/** Whether twelve finite cusps go once round the circle in order: their forward spans
 *  add up to one turn. A composite's cusps are each the short-arc midpoint of the parents'
 *  pair, and where the parents' cusps lie nearly opposite, some of them land on the far
 *  side of the wheel. The houses then overlap, a longitude is in several of them at once,
 *  and the layout (which sorts the spokes) and a reading in house order would answer
 *  differently. Every cusp on one point fails too: there are no houses to be in. */
export function cuspsInOrder(cusps: readonly number[]): boolean {
  if (cusps.length !== 12 || !cusps.every(Number.isFinite)) return false;
  let turn = 0;
  for (let k = 0; k < 12; k++) turn += forwardSpan(cusps[k], cusps[(k + 1) % 12]);
  return Math.abs(turn - TAU) < 1e-6;
}

/** The 0-based index of the house `lon` (radians) falls in — 0 for the 1st house — or
 *  null without twelve finite cusps (a chart with no birth time has no houses), or when
 *  they are out of order (cuspsInOrder). */
export function houseIndexOf(lon: number, cusps: readonly number[]): number | null {
  if (!Number.isFinite(lon) || !cuspsInOrder(cusps)) return null;
  for (let k = 0; k < 12; k++) {
    if (forwardSpan(cusps[k], lon) < forwardSpan(cusps[k], cusps[(k + 1) % 12])) return k;
  }
  return null;
}
