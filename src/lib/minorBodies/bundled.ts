// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The bundled catalog set — the curated minor bodies whose short files ship in
// public/ephe/ — and the built-in source that serves them. Every build has it, so
// the Minor bodies window works on its own in the open core; a downstream build's
// registered sources (lib/extensions/minorBodySources.ts) add to it, never replace
// it.
//
// The same source serves the hypothetical points (hypothetical.ts), which ship with
// every build too but have no file: BUNDLED_SET is the two together. They stay OUT of
// bundled.json, whose every entry the manifest script and the verify suite treat as a
// file in public/ephe/.
import manifest from './bundled.json';
import { fileNameFor, isCatalogNumber, isHypotheticalKey, SEAS_MINOR_ID, type EpheSpan } from './ids';
import { HYPOTHETICAL_POINTS, hypotheticalPoint, type HypotheticalGroup } from './hypothetical';
import { minorClassTag, type MinorClassTag } from './classTags';
import {
  getMinorBodySources,
  type MinorBodyHit,
  type MinorBodySource,
} from '../extensions/minorBodySources';

/** How the bundled set is grouped for browsing: by physical class, then the
 *  hypothetical points' two groups. */
export type MinorBodyGroup = 'dwarf' | 'centaur' | 'mainBelt' | 'nearEarth' | HypotheticalGroup;
export const MINOR_BODY_GROUPS: MinorBodyGroup[] = [
  'dwarf',
  'centaur',
  'mainBelt',
  'nearEarth',
  'uranian',
  'otherHyp',
];

export interface BundledMinorBody {
  n: number;
  name: string;
  group: MinorBodyGroup;
  /** Its NASA JPL orbit-class code (TNO, CEN, MBA, AMO, APO, …), behind its class tag
   *  (classTags.ts). Data, never shown: a reader sees the tag's label only. Absent on a
   *  hypothetical point, whose tag is its group. */
  cls?: string;
  /** Data already inside the bundled main-asteroid file (no file of its own). */
  seas?: boolean;
  /** Upstream build date of the file (yyyymmdd) — a cache-busting version for its
   *  URL, filled by scripts/build-minor-manifest.mjs. */
  v?: number;
}

/** The bodies with a bundled FILE (or, Pholus, a place in the main-asteroid file). */
export const BUNDLED_MINOR_BODIES: readonly BundledMinorBody[] = (
  manifest as { bodies: BundledMinorBody[] }
).bodies.filter((b) => isCatalogNumber(b.n));

/** Everything the bundled source offers: the files' bodies, then the hypothetical
 *  points (keyed −se, so no number is shared). What search and lookup read. */
export const BUNDLED_SET: readonly BundledMinorBody[] = [...BUNDLED_MINOR_BODIES, ...HYPOTHETICAL_POINTS];

// Files by number: fetchFile reads this one, so a hypothetical key finds no file.
const byNumber = new Map(BUNDLED_MINOR_BODIES.map((b) => [b.n, b]));
const byKey = new Map(BUNDLED_SET.map((b) => [b.n, b]));

export function bundledMinorBody(n: number): BundledMinorBody | undefined {
  return byKey.get(n);
}

// Accent-insensitive folding for name search — the same folding the place search
// uses (lib/atlas/cityLookup.ts `foldName`), restated here so this module doesn't
// pull the city index into the bundle.
export const foldMinorName = (s: string): string =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** A query that names a body by NUMBER: "433", "(433)", " 433 ". */
export function numberQuery(q: string): number | null {
  const m = /^\s*\(?\s*(\d{1,8})\s*\)?\s*$/.exec(q);
  return m ? Number(m[1]) : null;
}

/**
 * Rank bodies against a query: exact number, number prefix, exact name, name
 * prefix, then substring. Shared so every source's results sort the same way.
 * Returns a rank (lower is better) or null for no match.
 */
export function rankMinorMatch(q: string, n: number, name: string): number | null {
  const num = numberQuery(q);
  if (num !== null) {
    if (n === num) return 0;
    return String(n).startsWith(String(num)) ? 1 : null;
  }
  const fq = foldMinorName(q.trim());
  if (!fq) return null;
  const fn = foldMinorName(name);
  if (fn === fq) return 2;
  if (fn.startsWith(fq)) return 3;
  if (fn.includes(fq)) return 4;
  return null;
}

// Other names a body of the bundled set is FOUND by — search only; the name shown
// stays its own, and no alias makes a second entry. Each ranks as a name would
// (rankMinorMatch: exact, prefix, substring), and the body takes its best rank. Kept
// deliberately short: an alias is a claim that two names mean one body, and the names
// that most need care (TransPluto's older names Isis, Persephone and Bacchus) belong
// to real asteroids — 42, 399 and 2063 — that search must keep finding as themselves.
//
// 10 Hygiea: the official (MPC) spelling. "Hygeia" is an older one that astrological
// software still uses — the house astrologer's review met it in the program she checks
// against — so a reader typing it should land on the body.
//
// −56 Selena: "White Moon" is the point's other common name (the engine's own is
// "Selena/White Moon"). Lina's brief V2 specified Hygeia as the only alias; this one
// is the product owner's call (2026-09-29). No asteroid is named White Moon, so unlike
// TransPluto's older names it can't be mistaken for a real body's; the asteroid 580
// Selene is found by its own name as before.
const NAME_ALIASES: ReadonlyMap<number, readonly string[]> = new Map([
  [10, ['Hygeia']],
  [-56, ['White Moon']],
]);

/** {@link rankMinorMatch} for a body of the bundled set: the best rank its name or any
 *  of its aliases takes. Any other body has no alias, and ranks exactly as there. */
export function rankBundledMatch(q: string, n: number, name: string): number | null {
  let best = rankMinorMatch(q, n, name);
  for (const alias of NAME_ALIASES.get(n) ?? []) {
    const r = rankMinorMatch(q, n, alias);
    if (r !== null && (best === null || r < best)) best = r;
  }
  return best;
}

export const BUNDLED_SOURCE_ID = 'bundled';

/** The built-in source: the files shipped in public/ephe/ beside the planets', and
 *  the hypothetical points (found by search here; loaded by the elements file). */
export const bundledSource: MinorBodySource = {
  id: BUNDLED_SOURCE_ID,
  label: 'bundled',
  minQueryLen: 1,
  debounceMs: 0,
  async search(query, { limit }) {
    return bundledSearch(query).slice(0, limit);
  },
  async fetchFile(n: number, span: EpheSpan, signal?: AbortSignal) {
    const b = byNumber.get(n);
    // A hypothetical point has no file to fetch (the loader never asks — see
    // needsMinorFile); refused here too, so no caller can turn its key into a path.
    if (!b || b.seas || isHypotheticalKey(n) || span !== 'short') throw new Error(`not bundled: ${n}`);
    const v = b.v ? `?v=${b.v}` : '';
    const res = await fetch(`${import.meta.env.BASE_URL}ephe/${fileNameFor(n, 'short')}${v}`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.arrayBuffer();
  },
  // Answered from data this build carries, so synchronous and complete from the start:
  // a file's body from its JPL code in bundled.json, a hypothetical point from its group.
  classTag: bundledClassTag,
};

/** Every body of the bundled set matching `q` — the hypothetical points included —
 *  ranked as every scope ranks (aliases counted), then by key. Synchronous: the window
 *  also reads it directly, to answer in any scope without waiting on the active one. */
export function bundledSearch(q: string): MinorBodyHit[] {
  const hits: { hit: MinorBodyHit; rank: number }[] = [];
  for (const b of BUNDLED_SET) {
    const rank = rankBundledMatch(q, b.n, b.name);
    if (rank !== null) hits.push({ hit: { n: b.n, name: b.name }, rank });
  }
  hits.sort((a, b) => a.rank - b.rank || a.hit.n - b.hit.n);
  return hits.map((h) => h.hit);
}

/** The class tag of a body in the bundled set, or null for any other key. */
export function bundledClassTag(n: number): MinorClassTag | null {
  if (isHypotheticalKey(n)) return hypotheticalPoint(n)?.group ?? null;
  const b = byNumber.get(n);
  return b ? minorClassTag(n, b.cls) : null;
}

/** The source a list entry came from: the bundled set, or a registered one. Null
 *  when the entry names a source this build doesn't have. */
export function minorSourceById(id: string): MinorBodySource | null {
  if (id === BUNDLED_SOURCE_ID) return bundledSource;
  return getMinorBodySources().find((s) => s.id === id) ?? null;
}

/** Whether body `n` needs a file at all. Pholus doesn't (see SEAS_MINOR_ID), and
 *  neither does a hypothetical point, which the elements file carries. */
export function needsMinorFile(n: number): boolean {
  return !SEAS_MINOR_ID.has(n) && !isHypotheticalKey(n);
}
