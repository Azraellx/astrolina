// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Minimal ICU plural & ordinal support:
//   `{name, plural, =0 {…} one {…} other {…}}`       — cardinal (1 chart / 2 charts)
//   `{name, selectordinal, one {#st} two {#nd} …}`   — ordinal (1st / 2nd / 7th House)
// where `#` is replaced by the number. The CATEGORY (one/two/few/many/other) is chosen by
// the browser's native Intl.PluralRules for the active locale — cardinal by default,
// ordinal for `selectordinal` — so Slavic/Arabic/English-ordinal forms are correct once
// those catalogs exist, with zero dependencies. Only a handful of strings use this;
// everything else passes through untouched.
import type { TVars } from './types';

type RuleType = NonNullable<Intl.PluralRulesOptions['type']>;
const rulesCache = new Map<string, Intl.PluralRules>();
function pluralRules(locale: string, type: RuleType): Intl.PluralRules {
  const cacheKey = `${locale}:${type}`;
  let rules = rulesCache.get(cacheKey);
  if (!rules) {
    rules = new Intl.PluralRules(locale, { type });
    rulesCache.set(cacheKey, rules);
  }
  return rules;
}

// Matches one `{name, plural|selectordinal, <body>}` block. The body allows a single level
// of nested braces (the form bodies), which is all these forms need.
const PLURAL_RE = /\{(\w+),\s*(plural|selectordinal),\s*((?:[^{}]|\{[^{}]*\})*)\}/g;

// Pull the body of a named plural form ('one', 'other', …) out of the block body.
function pickForm(body: string, form: string): string | null {
  const match = new RegExp(`(?:^|\\s)${form}\\s*\\{([^{}]*)\\}`).exec(body);
  return match ? match[1] : null;
}

export function applyPlurals(template: string, locale: string, vars?: TVars): string {
  if (!vars || !/(?:plural|selectordinal),/.test(template)) return template;
  return template.replace(PLURAL_RE, (_whole, name: string, kind: string, body: string) => {
    const n = Number(vars[name] ?? 0);
    // An explicit `=N {…}` form wins over the category (e.g. "=0 {no charts}").
    const exact = new RegExp(`=${n}(?:\\.0+)?\\s*\\{([^{}]*)\\}`).exec(body);
    const type: RuleType = kind === 'selectordinal' ? 'ordinal' : 'cardinal';
    const chosen = exact
      ? exact[1]
      : (pickForm(body, pluralRules(locale, type).select(n)) ?? pickForm(body, 'other') ?? '');
    return chosen.replace(/#/g, String(n));
  });
}
