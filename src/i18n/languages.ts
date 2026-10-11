// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The languages shown in the Appearance ▸ Language dropdown, and the one switch that opens
// a language to readers. Each is listed by its own name; the ones without a shipped
// catalog are greyed with a "coming soon" tip.
//
// To ENABLE a language (e.g. Spanish), 2026-10-09:
//   1. Its catalog is GENERATED, never hand-assembled: translation tooling writes
//      src/i18n/es/*.ts + src/i18n/es.ts (`satisfies LocaleTree`) through scripts/i18n/emit.mjs,
//      and registers the loader in the generated src/i18n/locales.ts.
//   2. `npm run check:i18n` passes for it.
//   3. Flip `available: true` below. That is the human gate: a catalog can be generated and
//      sit unused until someone has looked at it.
//   4. Add its code to `AVAILABLE` in the `<script id="lang-boot">` at the top of index.html
//      (2026-10-09). That script declares `<html lang>` before any bundle has run, so it can't
//      read this file and carries its own copy of the list; `npm run verify:lang-boot` fails
//      until the two agree. A build that serves its own index.html carries the same script and
//      changes its copy too.
// SUPPORTED_LOCALES (catalog.ts), detection, persistence, lazy loading and the re-render all
// follow from the flag — nothing else needs touching.
//
// While the release hold stands (languageHold.ts, 2026-10-10), a language opened here still reads
// unavailable: the block at the foot of this file masks it, and it opens with the others when the
// hold lifts. Opening one meanwhile is the same four steps; it is held like the rest.
import { LANGUAGES_HELD } from './languageHold';

export interface LanguageOption {
  /** BCP-47 base code; a `ShippedLocale` (types.ts), or 'qps' for the dev pseudo-locale. */
  code: string;
  /** The language's own name (endonym), shown verbatim regardless of the active
   *  locale — language names are conventionally not translated. */
  autonym: string;
  /** True once a catalog exists, is registered (locales.ts) and has passed the human gate (step
   *  3 above) — and the release hold (languageHold.ts) is not masking it. What every consumer
   *  reads. */
  available: boolean;
  /** True on a row the release hold has greyed: opened below, and unavailable only while the hold
   *  stands. verify:lang-boot reads it to tell the boot script's full list from the held one;
   *  nothing in the app needs it, since a held row is drawn exactly as a row not yet opened. */
  held?: boolean;
}

// English first (the default); the rest follow as "coming soon" until their catalogs ship.
// Each is shown by its own native name (endonym), which is conventionally not translated.
export const LANGUAGES: LanguageOption[] = [
  { code: 'en', autonym: 'English', available: true },
  { code: 'es', autonym: 'Español', available: true },
  // The catalog is Brazilian Portuguese (2026-10-09), and the row says so — a reader in
  // Portugal should know which variant they are choosing.
  { code: 'pt', autonym: 'Português (Brasil)', available: true },
  { code: 'tr', autonym: 'Türkçe', available: true },
  { code: 'de', autonym: 'Deutsch', available: true },
  { code: 'ru', autonym: 'Русский', available: true },
  // Development only: every catalogued string comes back accented, padded and bracketed
  // (pseudo.ts), so bare English on screen is an uncatalogued string and a clipped bracket
  // is an overflow. A production build never lists it, and a stored 'qps' there is ignored.
  //
  // The test is written out here, not read from a constant: Vite writes a literal `false` for
  // `import.meta.env.DEV` in a production build, and only an inline test folds away with the
  // row (through a constant — or `import.meta.env?.DEV`, which Vite does not replace — the
  // row's words stayed in the bundle as dead data). The `typeof` half is for the verify
  // harness, which bundles this file for Node, where `import.meta.env` is undefined.
  ...(typeof import.meta.env !== 'undefined' && import.meta.env.DEV
    ? [{ code: 'qps', autonym: 'Pseudo-locale (dev)', available: true }]
    : []),
];

// THE RELEASE HOLD (languageHold.ts, 2026-10-10). While it stands, every language opened above
// except English is greyed again — `available` false, `held` true — so the menu shows it with the
// "Coming soon" tip it had before its catalog shipped, and SUPPORTED_LOCALES, detection, a stored
// choice, the translate offer and the language-detected notice all follow, as the header says they
// do from this one flag. Masked here, after the list, rather than row by row: the rows keep the
// human gate as it was set (the translation pipeline reads the list as written, for the autonyms),
// and lifting the hold is deleting this block. Nothing is written by it — a stored choice of a
// held language is masked by the runtime, not cleared (CLAUDE.md rule 2). The dev pseudo-locale
// is not held: it is a tool, not a language.
if (LANGUAGES_HELD) {
  for (const lang of LANGUAGES) {
    if (lang.available && lang.code !== 'en' && lang.code !== 'qps') {
      lang.available = false;
      lang.held = true;
    }
  }
}
