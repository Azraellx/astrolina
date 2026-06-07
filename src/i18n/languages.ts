// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The languages shown in the Appearance ▸ Language dropdown. This is the scaffolding
// registry for multi-language support: the top astrology-community languages (by rough
// community size), with English the only one that has a catalog today. The other nine
// are listed but disabled in the UI until a translation lands.
//
// To ENABLE a language (e.g. Spanish):
//   1. Create its catalog: src/i18n/es/*.ts fragments + src/i18n/es.ts (`… satisfies Messages`).
//   2. Register it: add 'es' to `Locale` (types.ts), to SUPPORTED_LOCALES + the lazy
//      `loaders` map (catalog.ts).
//   3. Flip `available: true` below.
// The dropdown, locale detection, persistence, lazy-loading and re-render are already
// wired — that's all the switching needs.

export interface LanguageOption {
  /** BCP-47 base code; matches the `Locale` union once available. */
  code: string;
  /** The language's own name (endonym), shown verbatim regardless of the active
   *  locale — language names are conventionally not translated. */
  autonym: string;
  /** True once a catalog exists and is registered (see catalog.ts). English only, today. */
  available: boolean;
}

// Ordered by approximate astrology-community size, English first (the default + only
// translated locale). Endonyms render via the browser's font fallback for non-Latin
// scripts (Devanagari, CJK, Cyrillic).
export const LANGUAGES: LanguageOption[] = [
  { code: 'en', autonym: 'English', available: true },
  { code: 'es', autonym: 'Español', available: false },
  { code: 'pt', autonym: 'Português', available: false },
  { code: 'hi', autonym: 'हिन्दी', available: false },
  { code: 'ru', autonym: 'Русский', available: false },
  { code: 'zh', autonym: '中文', available: false },
  { code: 'ja', autonym: '日本語', available: false },
  { code: 'fr', autonym: 'Français', available: false },
  { code: 'de', autonym: 'Deutsch', available: false },
  { code: 'it', autonym: 'Italiano', available: false },
];
