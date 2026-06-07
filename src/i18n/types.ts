// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Type machinery for the lightweight, dependency-free i18n catalog. English is the
// single source of truth: `en` (an `as const` nested object) defines both the set of
// valid keys and the {placeholder} names inside each template. A future locale is a
// plain object checked against `Messages`.
import type { en } from './en';

// The English catalog's literal type — every leaf is a string LITERAL (e.g. 'Close'),
// which is what lets us derive the dot-path key union below.
export type EN = typeof en;

// The contract every locale must satisfy: the same shape as English, but each leaf
// string literal widened to `string` so a translation ('Cerrar') is accepted where
// English has the literal 'Close'. A future `es.ts` does `… satisfies Messages`, which
// then fails the build if any key is missing, extra, or non-string.
export type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };

export type Messages = Widen<EN>;

// Supported locales. Append new codes here as catalogs are added (and a loader in
// catalog.ts). English-only for now.
export type Locale = 'en';

// The union of every dot-path that resolves to a string leaf, e.g.
// 'common.close' | 'settings.houseSystem.koch.label'. A typo'd key passed to t() is a
// compile error at the call site.
export type MsgKey = DeepLeafKeys<EN>;

type DeepLeafKeys<T> = T extends string
  ? never
  : {
      [K in Extract<keyof T, string>]: T[K] extends string
        ? K
        : `${K}.${DeepLeafKeys<T[K]>}`;
    }[Extract<keyof T, string>];

// Interpolation variables for `{name}` tokens and ICU `{count, plural, …}`. Dot-path
// KEY safety is enforced by the type system; per-key var names are validated at
// runtime (an unreplaced `{token}` stays visible, so a missing var is obvious in dev)
// and by scripts/check-i18n. Keeping vars loosely typed avoids heavy recursive types.
export type TVars = Record<string, string | number>;

export type TFn = <K extends MsgKey>(key: K, vars?: TVars) => string;
