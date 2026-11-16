// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Country names in the reader's language.
//
// The bundled atlas names every country in English. The runtime knows every country's
// name in every language (Intl.DisplayNames, from CLDR), so a country can read in the
// reader's language with no data of our own.
//
// ENGLISH KEEPS THE ATLAS NAME, always. CLDR's English differs from the atlas for a few
// dozen codes ("Türkiye" for Turkey, "Côte d’Ivoire" for Ivory Coast, "Congo - Kinshasa",
// "St. Lucia", "Hong Kong SAR China"…), and English text must read exactly as the atlas
// writes it.
//
// Kept apart from cityLookup so a surface naming a country never pulls in the atlas chunk.

/** Whether a BCP-47 tag is English — the atlas's own language. */
const isEnglish = (lang: string): boolean => /^en(?:-|$)/i.test(lang);

// One namer per language: constructing a DisplayNames is the costly part, and the lookups
// run per label, per chip and per row. `null` records a runtime without the API (or without
// the language), so it is asked only once.
const regionNamers = new Map<string, Intl.DisplayNames | null>();
function regionNamer(lang: string): Intl.DisplayNames | null {
  let namer = regionNamers.get(lang);
  if (namer === undefined) {
    try {
      // fallback 'none': an unknown code comes back undefined rather than as itself, so
      // the atlas name stands in instead of a bare "XX".
      namer = new Intl.DisplayNames([lang], { type: 'region', fallback: 'none' });
    } catch {
      namer = null;
    }
    regionNamers.set(lang, namer);
  }
  return namer;
}

/**
 * A country's name as the reader should see it: the atlas's own name in English, the
 * runtime's name for the code in any other language — and the atlas's again wherever the
 * runtime has none.
 *
 * `atlasName` is whatever the caller would have shown before (the dataset's name, or the
 * bare code while the dataset is still loading); `lang` is the BCP-47 tag of the language
 * the text around it is in — the screen's for a control, a document's own for a document,
 * which can differ.
 *
 * A RETIRED code keeps the atlas name too. The atlas still carries "CS" (Serbia and
 * Montenegro) and "AN" (Netherlands Antilles), and the runtime canonicalises a retired code
 * to its successor before naming it — Serbia, Curaçao — which would name a different
 * country. A code is retired exactly when that canonicalisation moves it.
 */
export function countryDisplayName(cc: string, atlasName: string, lang: string): string {
  if (isEnglish(lang)) return atlasName;
  const namer = regionNamer(lang);
  if (!namer) return atlasName;
  try {
    const tag = `und-${cc.toUpperCase()}`;
    if (Intl.getCanonicalLocales(tag)[0] !== tag) return atlasName;
    const name = namer.of(cc.toUpperCase());
    return name && name !== cc ? name : atlasName;
  } catch {
    // Not a region code the runtime accepts at all (a malformed stored code).
    return atlasName;
  }
}
