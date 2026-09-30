// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The HYPOTHETICAL POINTS — ten bodies that exist only as sets of orbital elements:
// the eight Uranian points and two others. The engine computes them from its elements
// file (seorbel.txt, beside this module), not from an ephemeris file of their own, so
// they have no date span. How the file reaches the engine, and why nothing is ever
// computed without it, is at ensureHypotheticalElements in ephemeris.ts.
//
// The names are OURS and hard-coded. The engine's own differ — it spells Vulkanus,
// and calls body 48 Isis-Transpluto and body 56 Selena/White Moon — and a name taken
// from the engine would put "Isis" on a point that search must never confuse with the
// asteroid 42 Isis. Nothing in this table may be derived from the engine.
//
// Keys are n = −se (ids.ts). `slot` is the point's palette slot (theme.ts
// MINOR_LINE_PALETTE): the number hash would put −40, −48 and −56 all in slot 0, so
// each point carries its own — all ten distinct, and each different from the hashed
// slot of the asteroid that shares its name (763 Cupido 7, 5731 Zeus 3, 85030
// Admetos 10, 4341 Poseidon 9), so the two never read as one body on the map.
//
// PURE: no imports, so ids-level code, the palette and the naming helper can all
// read it.

export type HypotheticalGroup = 'uranian' | 'otherHyp';

export interface HypotheticalPoint {
  kind: 'hyp';
  /** The list key: −se. */
  n: number;
  /** The engine's body number — 39 + the element set's place in seorbel.txt. */
  se: number;
  name: string;
  group: HypotheticalGroup;
  /** Palette slot (see above). */
  slot: number;
}

const point = (se: number, name: string, group: HypotheticalGroup, slot: number): HypotheticalPoint => ({
  kind: 'hyp',
  n: -se,
  se,
  name,
  group,
  slot,
});

export const HYPOTHETICAL_POINTS: readonly HypotheticalPoint[] = [
  point(40, 'Cupido', 'uranian', 0),
  point(41, 'Hades', 'uranian', 3),
  point(42, 'Zeus', 'uranian', 2),
  point(43, 'Kronos', 'uranian', 5),
  point(44, 'Apollon', 'uranian', 8),
  point(45, 'Admetos', 'uranian', 7),
  point(46, 'Vulcanus', 'uranian', 10),
  point(47, 'Poseidon', 'uranian', 1),
  point(48, 'TransPluto', 'otherHyp', 6),
  point(56, 'Selena', 'otherHyp', 11),
];

/** The body that proves the elements file was read: Selena, element set 17. The
 *  engine carries only fifteen sets built in (bodies 40–54), so without the file it
 *  THROWS for 56 — where for 40–54 it silently answers from the built-ins. */
export const HYP_SENTINEL_SE = 56;

const byKey = new Map(HYPOTHETICAL_POINTS.map((p) => [p.n, p]));

/** The point behind a reserved key, or undefined — for an MPC number, and for a key
 *  a newer build added that this one doesn't know. */
export function hypotheticalPoint(n: number): HypotheticalPoint | undefined {
  return byKey.get(n);
}
