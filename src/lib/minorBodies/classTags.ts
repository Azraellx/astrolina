// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// A minor body's CLASS TAG — the short word beside its name in the Minor bodies window
// ("Main belt", "Uranian"). Lists only: nothing here ever reaches the map.
//
// Orbit classes are NASA JPL's (the Small-Body Database's class codes); dwarf-planet
// status is the IAU's. JPL's codes are data, never copy — a reader only ever sees the
// tag's label (i18n minorBodies.tags.*). The rule, in one place so every source tags
// alike:
//   • Ceres, Eris, Haumea and Makemake are 'dwarf', whatever their orbit class.
//   • Pluto is never tagged: it is a planet here (and never a catalog body — ids.ts).
//   • Otherwise the JPL code decides, and a code none of the classes below claims is
//     'other' — rare, and still a real class rather than a guess. Its label is
//     "Unusual orbit"; the key keeps the older word.
//   • A hypothetical point is tagged by its group ('uranian' | 'otherHyp'), which the
//     bundled source answers from its own table (hypothetical.ts), not from here.
//
// Where a source gets the code is its own business — bundled.json's `cls` for the bundled
// set, a downstream catalog's own table — and it hands the answer over through
// MinorBodySource.classTag (lib/extensions/minorBodySources.ts).
//
// PURE: no imports, so a downstream build's catalog scripts and the verify suites can
// load it under Node.

export type MinorClassTag =
  | 'dwarf'
  | 'tno'
  | 'centaur'
  | 'mainBelt'
  | 'nearEarth'
  | 'trojan'
  | 'marsCrosser'
  | 'other'
  | 'uranian'
  | 'otherHyp';

/** Every tag, in the order the Help lists them — for a check that each has a label. */
export const MINOR_CLASS_TAGS: readonly MinorClassTag[] = [
  'dwarf',
  'tno',
  'centaur',
  'mainBelt',
  'nearEarth',
  'trojan',
  'marsCrosser',
  'other',
  'uranian',
  'otherHyp',
];

/** The four dwarf planets this app draws as minor bodies (the IAU's fifth, Pluto, is
 *  a planet here): 1 Ceres, 136199 Eris, 136108 Haumea, 136472 Makemake. */
export const DWARF_PLANET_NUMBERS: ReadonlySet<number> = new Set([1, 136199, 136108, 136472]);

const PLUTO = 134340;

// JPL class code → tag. MBA/IMB/OMB are the main belt's three parts (inner, main,
// outer); APO/ATE/AMO/IEO the near-Earth families (Apollo, Aten, Amor, Atira).
const BY_CODE: Readonly<Record<string, MinorClassTag>> = {
  TNO: 'tno',
  CEN: 'centaur',
  MBA: 'mainBelt',
  IMB: 'mainBelt',
  OMB: 'mainBelt',
  APO: 'nearEarth',
  ATE: 'nearEarth',
  AMO: 'nearEarth',
  IEO: 'nearEarth',
  TJN: 'trojan',
  MCA: 'marsCrosser',
};

/**
 * The tag for MPC number `n` whose JPL orbit class is `code` — null for Pluto, and
 * for a body whose class isn't known (no code: a table still loading, or a number
 * newer than it). A dwarf planet needs no code.
 */
export function minorClassTag(n: number, code: string | null | undefined): MinorClassTag | null {
  if (n === PLUTO) return null;
  if (DWARF_PLANET_NUMBERS.has(n)) return 'dwarf';
  if (!code) return null;
  return BY_CODE[code.toUpperCase()] ?? 'other';
}

// The built-in bodies' own JPL classes, for a search pointer to one of them ("Chiron —
// in Main minor bodies"): a reader who searches "Chiron" learns its class
// there as they would any other body's. Ceres's MBA gives way to the dwarf rule above;
// Pluto has no entry and is never tagged.
const BUILTIN_CLASS_CODE: ReadonlyMap<number, string> = new Map([
  [1, 'MBA'],
  [2, 'MBA'],
  [3, 'MBA'],
  [4, 'MBA'],
  [2060, 'CEN'],
]);

/** The tag for a built-in body's MPC number (ids.ts BUILTIN_ALIAS), or null — Pluto. */
export function builtinClassTag(n: number): MinorClassTag | null {
  return minorClassTag(n, BUILTIN_CLASS_CODE.get(n));
}
