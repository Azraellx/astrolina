// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Lowering a catalogued word to slot it into a sentence — a label "Trine" becoming "a trine to
// the Ascendant", a theme "Love" becoming "drawn to love". Right in English and most languages,
// wrong in German, where every noun keeps its capital ("ein Trigon zum Aszendenten"): there the
// word goes in as the catalog writes it. Turkish lowers with its own dotted/dotless i, which is
// why the language is passed in at all. (2026-10-09 — three sites lowered unconditionally,
// flagged by the casing pass before German ships.)
const KEEPS_NOUN_CAPITALS = /^de(?:-|$)/i;

/** The whole word lowered for use mid-sentence, unless the language capitalises nouns. */
export function lowerForSentence(word: string, lang: string): string {
  return KEEPS_NOUN_CAPITALS.test(lang) ? word : word.toLocaleLowerCase(lang);
}

/** Text folded for a search match: lower-cased, then without the combining dot above (U+0307)
 *  that lower-casing a Turkish "İ" leaves behind — "İlker".toLowerCase() is "i̇lker", which
 *  "ilker" typed on any keyboard never matches. Both the query and the text searched go through
 *  it. The dotless "ı" folds to "i" as well, so "ırmak" finds "Irmak" — a Turkish reader types
 *  either for a name written in capitals. Nothing else changes: accents still count, as they
 *  did. (2026-10-10, before Turkish ships; the dotless case from the Turkish layout pass.) */
// Written by code point so the characters are visible here: U+0307 COMBINING DOT ABOVE and
// U+0131 LATIN SMALL LETTER DOTLESS I.
const COMBINING_DOT_ABOVE = new RegExp(String.fromCodePoint(0x0307), 'g');
const DOTLESS_I = new RegExp(String.fromCodePoint(0x0131), 'g');

export function foldForSearch(s: string): string {
  return s.toLowerCase().replace(COMBINING_DOT_ABOVE, '').replace(DOTLESS_I, 'i');
}

/** Only the first letter lowered (a phrase whose later capitals are names), on the same rule. */
export function lowerFirstForSentence(word: string, lang: string): string {
  if (KEEPS_NOUN_CAPITALS.test(lang) || !word) return word;
  return word.charAt(0).toLocaleLowerCase(lang) + word.slice(1);
}
