// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The words the on-device tier must hand back exactly as English has them (2026-10-10).
//
// THE SOURCE OF TRUTH IS scripts/i18n/dnt.json — the do-not-translate list the translation
// pipeline and check:i18n enforce for every shipped language. That file is build-time data the
// app can't read, so this is its runtime copy, minus what only the pipeline needs (the notes, and
// the per-language spellings, which name SHIPPED languages — a device translation never is one).
// `npm run verify:i18n-machine` requires the two to agree, entry for entry, kind, context and
// pattern alike; edit dnt.json first and copy the change here.
//
// One entry is the runtime's own, and the check allows exactly it (RUNTIME_ONLY below): a plan
// name that a downstream build's strings use as a name. dnt.json doesn't list it: the core never
// names a plan, and a person translating a build's catalog knows a name when they see one. A
// device translator has no way to tell a capitalised name from a word, so it is masked here.
// Case-sensitive and whole-word: "pro" and "Progress" are untouched.
//
// The matching rules are dnt.json's, as scripts/i18n/checks.mjs countTerm applies them:
//   kind 'exact' — the text, whole words where it starts or ends with a letter or digit;
//   kind 'code'  — a standalone token;
//   context 'strict' — a code that is also an ordinary word (As, Leo, Can, Me…) counts only
//                      beside a slash or directly before an angle code ('Su/Mo', 'Ju MC');
//   pattern      — a regular expression in place of the literal.

export interface ProtectedTerm {
  term: string;
  kind: 'exact' | 'code';
  context?: 'strict';
  pattern?: string;
}

export const PROTECTED_TERMS: readonly ProtectedTerm[] = [
  { term: 'MC', kind: 'code' },
  { term: 'IC', kind: 'code' },
  { term: 'AS', kind: 'code' },
  { term: 'DS', kind: 'code' },
  { term: 'ASC', kind: 'code' },
  { term: 'DSC', kind: 'code' },
  { term: 'Vx', kind: 'code' },
  { term: 'Avx', kind: 'code' },
  { term: 'As', kind: 'code', context: 'strict' },
  { term: 'Ds', kind: 'code', context: 'strict' },
  { term: 'Su', kind: 'code', context: 'strict' },
  { term: 'Mo', kind: 'code', context: 'strict' },
  { term: 'Me', kind: 'code', context: 'strict' },
  { term: 'Ve', kind: 'code', context: 'strict' },
  { term: 'Ma', kind: 'code', context: 'strict' },
  { term: 'Ju', kind: 'code', context: 'strict' },
  { term: 'Sa', kind: 'code', context: 'strict' },
  { term: 'Ur', kind: 'code', context: 'strict' },
  { term: 'Ne', kind: 'code', context: 'strict' },
  { term: 'Pl', kind: 'code', context: 'strict' },
  { term: 'NN', kind: 'code' },
  { term: 'SN', kind: 'code' },
  { term: 'Li', kind: 'code', context: 'strict' },
  { term: 'Ch', kind: 'code', context: 'strict' },
  { term: 'Cr', kind: 'code', context: 'strict' },
  { term: 'Pa', kind: 'code', context: 'strict' },
  { term: 'Jn', kind: 'code', context: 'strict' },
  { term: 'Vs', kind: 'code', context: 'strict' },
  { term: 'Fo', kind: 'code', context: 'strict' },
  { term: 'Ari', kind: 'code', context: 'strict' },
  { term: 'Tau', kind: 'code', context: 'strict' },
  { term: 'Gem', kind: 'code', context: 'strict' },
  { term: 'Can', kind: 'code', context: 'strict' },
  { term: 'Leo', kind: 'code', context: 'strict' },
  { term: 'Vir', kind: 'code', context: 'strict' },
  { term: 'Lib', kind: 'code', context: 'strict' },
  { term: 'Sco', kind: 'code', context: 'strict' },
  { term: 'Sag', kind: 'code', context: 'strict' },
  { term: 'Cap', kind: 'code', context: 'strict' },
  { term: 'Aqu', kind: 'code', context: 'strict' },
  { term: 'Pis', kind: 'code', context: 'strict' },
  { term: 'In Mundo', kind: 'exact' },
  { term: 'In Zodiaco', kind: 'exact' },
  { term: 'Placidus', kind: 'exact' },
  { term: 'Koch', kind: 'exact' },
  { term: 'Regiomontanus', kind: 'exact' },
  { term: 'Campanus', kind: 'exact' },
  { term: 'Porphyry', kind: 'exact' },
  { term: 'Alcabitus', kind: 'exact' },
  { term: 'Morinus', kind: 'exact' },
  { term: 'AstroLina', kind: 'exact' },
  { term: '© AstroLina', kind: 'exact', pattern: '©\\s*\\d{4}\\s+AstroLina' },
  { term: '©', kind: 'exact' },
  { term: 'Swiss Ephemeris', kind: 'exact' },
  { term: '@swisseph/browser', kind: 'exact' },
  { term: 'Astrodienst', kind: 'exact' },
  { term: 'AGPL-3.0', kind: 'exact' },
  { term: 'AGPL', kind: 'exact' },
  { term: 'GNU Affero General Public License v3.0', kind: 'exact' },
  { term: 'MIT', kind: 'exact' },
  { term: 'JPL', kind: 'exact' },
  { term: 'DE441', kind: 'exact' },
  { term: 'NASA', kind: 'exact' },
  { term: 'GSFC', kind: 'exact' },
  { term: 'Horizons', kind: 'exact' },
  { term: 'Fred Espenak', kind: 'exact' },
  { term: 'Jean Meeus', kind: 'exact' },
  { term: 'OpenStreetMap', kind: 'exact' },
  { term: 'OpenMapTiles', kind: 'exact' },
  { term: 'MapTiler', kind: 'exact' },
  { term: 'Mapbox', kind: 'exact' },
  { term: 'CartoDB', kind: 'exact' },
  { term: 'MapLibre', kind: 'exact' },
  { term: 'Noto', kind: 'exact' },
  { term: 'Unicode', kind: 'exact' },
  { term: 'circle-flags', kind: 'exact' },
  { term: 'GitHub', kind: 'exact' },
  { term: 'Stripe', kind: 'exact' },
  { term: 'git.astrolina.org', kind: 'exact' },
  { term: 'astrolina.org', kind: 'exact' },
  // RUNTIME_ONLY — see the header.
  { term: 'Pro', kind: 'exact' },
];

/** The entries above that dnt.json does not carry, each with its reason in the header. The
 *  agreement check allows exactly these and no others. */
export const RUNTIME_ONLY: readonly string[] = ['Pro'];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isWordChar = (ch: string) => /[\p{L}\p{N}]/u.test(ch);
const ANGLE_AFTER = /^\s(?:MC|IC|AS|DS|ASC|DSC|Vx|Avx)(?![\p{L}\p{N}])/u;

function matcherOf(entry: ProtectedTerm): RegExp {
  if (entry.pattern) return new RegExp(entry.pattern, 'gu');
  if (entry.kind === 'code') {
    return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(entry.term)}(?![\\p{L}\\p{N}])`, 'gu');
  }
  const pre = isWordChar(entry.term[0]) ? '(?<![\\p{L}\\p{N}])' : '';
  const post = isWordChar(entry.term[entry.term.length - 1]) ? '(?![\\p{L}\\p{N}])' : '';
  return new RegExp(`${pre}${escapeRe(entry.term)}${post}`, 'gu');
}

const MATCHERS = PROTECTED_TERMS.map((entry) => ({ entry, re: matcherOf(entry) }));

/** Every protected occurrence in `s`, as [start, end) ranges — overlapping ones included; the
 *  masker keeps the longest at each start. A strict code counts only where dnt.json's rule
 *  says it is standing as a code. */
export function protectedRanges(s: string): [number, number][] {
  const out: [number, number][] = [];
  for (const { entry, re } of MATCHERS) {
    re.lastIndex = 0;
    for (const m of s.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (entry.context === 'strict') {
        const before = s[start - 1];
        const after = s.slice(end);
        if (!(before === '/' || after.startsWith('/') || ANGLE_AFTER.test(after))) continue;
      }
      out.push([start, end]);
    }
  }
  return out;
}
