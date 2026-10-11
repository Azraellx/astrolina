// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The core's own locale catalogs. English ships statically in the base bundle; every other
// locale is code-split and pulled on demand via dynamic import() from the GENERATED loader
// map in locales.ts, so an English-only visitor never downloads another catalog. What a
// catalog holds is only ever composed with English (registry.ts) — never read raw — so a
// missing key in it shows English, not a gap.
import { LANGUAGES } from './languages';
import { coreLocaleLoaders } from './locales';
import type { LocaleTree, ShippedLocale } from './types';

const SHIPPED: readonly ShippedLocale[] = ['en', 'es', 'pt', 'tr', 'de', 'ru'];

export function isShippedLocale(code: string): code is ShippedLocale {
  return (SHIPPED as readonly string[]).includes(code);
}

// The languages a reader can be in: the ones languages.ts has opened. Derived from that
// one flag so the menu, detection and this list can never disagree. The dev pseudo-locale
// is not among them — it is not a language, and no browser detection may land on it.
export const SUPPORTED_LOCALES: readonly ShippedLocale[] = LANGUAGES.filter(
  (l) => l.available && isShippedLocale(l.code),
).map((l) => l.code as ShippedLocale);

const cache = new Map<ShippedLocale, LocaleTree | null>();

/** The core catalog source for a locale, or null when none ships (English is never loaded
 *  this way — it is the base the others are composed onto). A failed load is not cached,
 *  so an offline miss is retried on the next switch. */
export async function loadCoreCatalog(locale: ShippedLocale): Promise<LocaleTree | null> {
  if (locale === 'en') return null;
  if (cache.has(locale)) return cache.get(locale) ?? null;
  const loader = coreLocaleLoaders[locale];
  if (!loader) {
    cache.set(locale, null);
    return null;
  }
  const mod = await loader();
  // Undefined when a host's vite:preloadError handler swallowed the failure (its reload is on
  // the way): not cached, so the next call tries again; the caller reads English meanwhile.
  if (!mod?.default) return null;
  cache.set(locale, mod.default);
  return mod.default;
}

/** What loadCoreCatalog has already brought in, without waiting: for a recomposition that
 *  must happen now (a late registration) and uses whatever is to hand. */
export function loadedCoreCatalog(locale: ShippedLocale): LocaleTree | null {
  return cache.get(locale) ?? null;
}

/** Test seam (verify-i18n-runtime): stand a catalog in for a locale's generated one. */
export function __setCoreCatalogForTest(locale: ShippedLocale, tree: LocaleTree | null): void {
  if (tree === null) cache.delete(locale);
  else cache.set(locale, tree);
}
