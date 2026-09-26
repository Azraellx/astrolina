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
import manifest from './bundled.json';
import { fileNameFor, isCatalogNumber, SEAS_MINOR_ID, type EpheSpan } from './ids';
import {
  getMinorBodySources,
  type MinorBodyHit,
  type MinorBodySource,
} from '../extensions/minorBodySources';

/** How the bundled set is grouped for browsing: by physical class. */
export type MinorBodyGroup = 'dwarf' | 'centaur' | 'mainBelt' | 'nearEarth';
export const MINOR_BODY_GROUPS: MinorBodyGroup[] = ['dwarf', 'centaur', 'mainBelt', 'nearEarth'];

export interface BundledMinorBody {
  n: number;
  name: string;
  group: MinorBodyGroup;
  /** Data already inside the bundled main-asteroid file (no file of its own). */
  seas?: boolean;
  /** Upstream build date of the file (yyyymmdd) — a cache-busting version for its
   *  URL, filled by scripts/build-minor-manifest.mjs. */
  v?: number;
}

export const BUNDLED_MINOR_BODIES: readonly BundledMinorBody[] = (
  manifest as { bodies: BundledMinorBody[] }
).bodies.filter((b) => isCatalogNumber(b.n));

const byNumber = new Map(BUNDLED_MINOR_BODIES.map((b) => [b.n, b]));

export function bundledMinorBody(n: number): BundledMinorBody | undefined {
  return byNumber.get(n);
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

export const BUNDLED_SOURCE_ID = 'bundled';

/** The built-in source: the files shipped in public/ephe/ beside the planets'. */
export const bundledSource: MinorBodySource = {
  id: BUNDLED_SOURCE_ID,
  label: 'bundled',
  minQueryLen: 1,
  debounceMs: 0,
  async search(query, { limit }) {
    const hits: { hit: MinorBodyHit; rank: number }[] = [];
    for (const b of BUNDLED_MINOR_BODIES) {
      const rank = rankMinorMatch(query, b.n, b.name);
      if (rank !== null) hits.push({ hit: { n: b.n, name: b.name }, rank });
    }
    hits.sort((a, b) => a.rank - b.rank || a.hit.n - b.hit.n);
    return hits.slice(0, limit).map((h) => h.hit);
  },
  async fetchFile(n: number, span: EpheSpan, signal?: AbortSignal) {
    const b = byNumber.get(n);
    if (!b || b.seas || span !== 'short') throw new Error(`not bundled: ${n}`);
    const v = b.v ? `?v=${b.v}` : '';
    const res = await fetch(`${import.meta.env.BASE_URL}ephe/${fileNameFor(n, 'short')}${v}`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.arrayBuffer();
  },
};

/** The source a list entry came from: the bundled set, or a registered one. Null
 *  when the entry names a source this build doesn't have. */
export function minorSourceById(id: string): MinorBodySource | null {
  if (id === BUNDLED_SOURCE_ID) return bundledSource;
  return getMinorBodySources().find((s) => s.id === id) ?? null;
}

/** Whether body `n` needs a file at all (Pholus doesn't — see SEAS_MINOR_ID). */
export function needsMinorFile(n: number): boolean {
  return !SEAS_MINOR_ID.has(n);
}
