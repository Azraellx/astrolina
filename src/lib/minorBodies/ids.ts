// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Identity + file naming for CATALOG minor bodies — numbered minor planets drawn
// from their own per-asteroid Swiss Ephemeris files (433 Eros, 136199 Eris, …).
//
// They are a separate family from the built-in bodies on purpose: PlanetName and
// every table keyed by it stay closed, so nothing written for the nineteen
// built-ins can meet an id it cannot decorate. A catalog body is identified by its
// MPC number and carried as `mp:<n>` where a string id is needed.
//
// The same family also carries the HYPOTHETICAL POINTS (Cupido, TransPluto, Selena…;
// hypothetical.ts), which have no MPC number and no file. Each takes a reserved
// NEGATIVE key, n = −(its engine body number), and is carried as `hyp:<se>`. Negative
// so it can never meet an MPC number: the engine's own number would, since Zeus is
// engine body 42 and 42 Isis is bundled. Every list, map and memo is keyed by n, so
// the points ride through all of them unchanged; only the tests below tell them apart.
//
// PURE: no engine import (only a type), so lineCard.ts and the map can use it
// without pulling the WASM into their module graph — and with no value import at
// all, because a downstream build's vite config and catalog scripts load this file
// directly under Node, where a value import could pull in modules only a Vite build
// can load.
import type { PlanetName } from '../ephemeris';

export type MinorBodyId = `mp:${number}` | `hyp:${number}`;

export const minorId = (n: number): MinorBodyId => (n < 0 ? `hyp:${-n}` : `mp:${n}`);

/** The MPC number inside a `mp:<n>` id, or null for anything else — a `hyp:` id
 *  included, which names no MPC number. */
export function minorNumberOf(id: unknown): number | null {
  if (typeof id !== 'string' || !id.startsWith('mp:')) return null;
  const n = Number(id.slice(3));
  return isMinorNumber(n) ? n : null;
}

/** The list key inside either form of id — the MPC number of `mp:<n>`, the reserved
 *  negative key of `hyp:<se>` — or null for anything else. The inverse of minorId. */
export function minorKeyOf(id: unknown): number | null {
  if (typeof id !== 'string') return null;
  if (id.startsWith('hyp:')) {
    const se = id.slice(4);
    const n = se === '' ? NaN : -Number(se);
    return isHypotheticalKey(n) ? n : null;
  }
  return minorNumberOf(id);
}

/** A reserved key for a hypothetical point: −40 … −999, the engine's range of
 *  fictitious bodies, negated. Whether THIS build knows the point is a separate
 *  question (hypothetical.ts) — a key a newer build added is still a key here, so a
 *  stored list keeps it. */
export function isHypotheticalKey(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n <= -40 && n >= -999;
}

/** A plausible MPC number: a positive integer. */
export function isMinorNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n < 100_000_000;
}

// ── Which file ────────────────────────────────────────────────────────────────
// Per-asteroid files come in two spans: SHORT (1500–2100 CE, ~10–60 KB for most
// bodies; a few near-Earth objects run to ~1 MB) and LONG (3000 BCE–3000 CE,
// ~300 KB+). Short is the default everywhere; see calculation-methods.md.
export type EpheSpan = 'short' | 'long';

/** The directory Swiss files a body under: `ast{⌊n/1000⌋}`. */
export function astDirFor(n: number): string {
  return `ast${Math.floor(n / 1000)}`;
}

/**
 * The file name, mirroring the engine's own `swi_gen_filename` (swephlib.c):
 * `se%05d` up to 99999, then `s%06d` — which keeps growing past six digits
 * (1000000 → `s1000000`) rather than wrapping. Short files insert an `s` before
 * the extension. This is the ONE place the rule lives: the loader, the manifest
 * script, the verify suite and any server path check all derive from it.
 */
export function fileNameFor(n: number, span: EpheSpan = 'short'): string {
  const stem = n > 99_999 ? `s${String(n).padStart(6, '0')}` : `se${String(n).padStart(5, '0')}`;
  return `${stem}${span === 'short' ? 's' : ''}.se1`;
}

/** The upstream-layout relative path, `ast0/se00433s.se1` — how a mirror stores it. */
export function filePathFor(n: number, span: EpheSpan = 'short'): string {
  return `${astDirFor(n)}/${fileNameFor(n, span)}`;
}

/** Parse an upstream-layout path back to its body — the inverse of filePathFor,
 *  strict: the directory must be the one the number belongs in. */
export function parseFilePath(path: string): { n: number; span: EpheSpan } | null {
  const m = /^ast(\d{1,5})\/(?:se(\d{5})|s(\d{6,8}))(s?)\.se1$/.exec(path);
  if (!m) return null;
  const n = Number(m[2] ?? m[3]);
  if (!isMinorNumber(n)) return null;
  // se%05d only below 100000, s%06d only from 100000 — anything else is not a
  // name the engine would ever ask for.
  if (m[2] !== undefined && n > 99_999) return null;
  if (m[3] !== undefined && n <= 99_999) return null;
  if (Number(m[1]) !== Math.floor(n / 1000)) return null;
  return { n, span: m[4] === 's' ? 'short' : 'long' };
}

// ── Numbers the catalog must NOT load as files ────────────────────────────────
// Some numbered minor planets are already bodies of their own here. Each
// resolves to the existing row, never to a second copy of the same object:
//   1 Ceres … 4 Vesta — the engine itself aliases 10001–10004 to the built-ins.
//   2060 Chiron — a built-in (seas_18), NOT aliased by the engine for positions,
//                 so a file request would be a second, differently-integrated Chiron.
//   134340 Pluto — the engine remaps 10000+134340 to Pluto.
export const BUILTIN_ALIAS: ReadonlyMap<number, PlanetName> = new Map<number, PlanetName>([
  [1, 'Ceres'],
  [2, 'Pallas'],
  [3, 'Juno'],
  [4, 'Vesta'],
  [2060, 'Chiron'],
  [134340, 'Pluto'],
]);

// Catalog bodies whose data is already inside the bundled main-asteroid file
// (seas_18.se1), sampled by that file's own body id instead of a per-asteroid
// file: 5145 Pholus is Swiss body 16.
export const SEAS_MINOR_ID: ReadonlyMap<number, number> = new Map([[5145, 16]]);

/** The number can be a catalog body at all (not an alias of a built-in). MPC
 *  numbers only — a hypothetical point's key never passes: parseFilePath, and a
 *  downstream build's hosted catalog and its sync, depend on that. */
export function isCatalogNumber(n: unknown): n is number {
  return isMinorNumber(n) && !BUILTIN_ALIAS.has(n);
}

/** A key that may stand on the reader's list: a catalog number or a hypothetical
 *  point's reserved key. */
export function isListKey(n: unknown): n is number {
  return isCatalogNumber(n) || isHypotheticalKey(n);
}
