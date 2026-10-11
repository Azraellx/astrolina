// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Type machinery for the lightweight, dependency-free i18n catalog. English is the
// single source of truth: `en` (an `as const` nested object) defines both the set of
// valid keys and the {placeholder} names inside each template.
//
// Other locales are typed LOOSELY on purpose (2026-10-09): a catalog is `… satisfies
// LocaleTree` — nested strings — not `satisfies Messages`. The strict form would fail the
// build in every shipped language on every English edit, public contributors to the core
// included, and English copy changes daily. Completeness and validity (every key present,
// the same placeholders, ICU that parses) are guarded by `npm run check:i18n` instead, and
// at runtime a missing or invalid translation simply shows English for that key.
import type { en } from './en';

// The English catalog's literal type — every leaf is a string LITERAL (e.g. 'Close'),
// which is what lets us derive the dot-path key union below.
export type EN = typeof en;

// The English shape with each leaf string literal widened to `string`: the type of a
// COMPOSED catalog, where a leaf may hold any language's text ('Cerrar' where English has
// the literal 'Close'). A locale's own source file is not checked against it — see the
// header: it is a LocaleTree, and check:i18n compares it with English.
export type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };

export type Messages = Widen<EN>;

// The languages that ship a translated catalog (or will: a code is listed here before its
// catalog lands, and languages.ts' `available` flag is what opens it to readers).
export type ShippedLocale = 'en' | 'es' | 'pt' | 'tr' | 'de' | 'ru';

// A language translated on the reader's own device from the English catalog — 'mt:fr'.
// Never shipped, never detected; only ever chosen.
export type MachineLocale = `mt:${string}`;

// Everything the stored language preference (`astro:locale:v2`) can hold. 'qps' is the
// development pseudo-locale (pseudo.ts), offered only in a dev build.
export type LocaleId = ShippedLocale | MachineLocale | 'qps';

// Kept for the call sites that predate the locale ids — the shipped languages.
export type Locale = ShippedLocale;

// A locale's catalog source: the English shape, nested strings, no literal types. The
// generated `src/i18n/<loc>.ts` files default-export one of these.
export type LocaleTree = { readonly [k: string]: string | LocaleTree };

// The same shape for a build's own message namespaces (a pack's `namespaces`).
export type MessageTree = { readonly [k: string]: string | MessageTree };

// What a build registers on top of the core catalog (registry.ts):
//   namespaces — new top-level namespaces, typically one per plugin ('myPlugin', …);
//   overrides  — dot-paths of CORE leaves whose value this build replaces, either with its
//                own text or with `{ ref }`, an alias to another key, so every locale uses
//                its own translation of the referenced key.
//   markers    — dot-path patterns ('news.*.title', `*` = any one segment) of the
//                pack's own leaves whose `{braces}` mark a word for styling rather than a
//                value to fill. The braced word is translated with the rest, so its name
//                cannot match English's; a translation there stands if it keeps the same
//                NUMBER of braced words (2026-10-09). Read from the English pack only.
//   machineExclude — dot-path patterns (same syntax as `markers`; a pattern also covers
//                everything beneath it) of leaves — the pack's own, or core leaves it
//                overrides — that the on-device tier
//                (i18n/machine/) must leave in English: text a build ships only as a
//                translation people wrote and checked (tagged `@i18n-review` in its source;
//                text with legal weight, for example), which no device translation can be,
//                and values that are data, not copy (`@i18n-skip`). The runtime never sees
//                comments, so a build that has such text names it here.
//                (2026-10-10) Read from the English pack only.
// A locale's pack has the same shape, holding that locale's text for both.
export type MessagePack = {
  namespaces?: Record<string, MessageTree>;
  overrides?: Record<string, string | { ref: string }>;
  markers?: readonly string[];
  machineExclude?: readonly string[];
};

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
