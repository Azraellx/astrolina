// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Locale registry. English ships statically in the base bundle; every other locale is
// code-split and pulled on demand via dynamic import(), so an English-only visitor
// never downloads other catalogs. To add a locale: add its code to `Locale` (types.ts),
// create the catalog file (e.g. es.ts, `… satisfies Messages`), and register a loader
// here, e.g.  es: () => import('./es').
import { en } from './en';
import type { Locale, Messages } from './types';

export const SUPPORTED_LOCALES: readonly Locale[] = ['en'];

const loaders: Partial<Record<Locale, () => Promise<{ default: Messages }>>> = {
  // es: () => import('./es'),
};

const cache = new Map<Locale, Messages>([['en', en]]);

export async function loadCatalog(locale: Locale): Promise<Messages> {
  const cached = cache.get(locale);
  if (cached) return cached;
  const loader = loaders[locale];
  if (!loader) return en;
  const mod = await loader();
  cache.set(locale, mod.default);
  return mod.default;
}
