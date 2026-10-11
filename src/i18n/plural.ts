// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Minimal ICU plural & ordinal support:
//   `{name, plural, =0 {…} one {…} other {…}}`       — cardinal (1 chart / 2 charts)
//   `{name, selectordinal, one {#st} two {#nd} …}`   — ordinal (1st / 2nd / 7th House)
// where `#` is replaced by the number. The CATEGORY (one/two/few/many/other) is chosen by
// the browser's native Intl.PluralRules for the language passed in — cardinal by default,
// ordinal for `selectordinal` — so Slavic/Arabic/English-ordinal forms are correct with
// zero dependencies. Only a handful of strings use this; everything else passes through
// untouched.
//
// A form body may hold `{name}` placeholders — `one {# chart in {place}}` — since
// 2026-10-09. Russian and German need it (the noun agreeing with the count sits inside the
// form, and so does whatever else the sentence names), and so does the on-device tier.
// The placeholders are left for interpolate() to fill after the form is chosen. (This
// retires the workaround noted at en/expandedSidebar.ts' overlayOwnAspects — "a plural
// template cannot also interpolate {overlay}" — which is no longer true; the fragment is
// left as it is because its plain '{count}' is still the simpler string.)
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

// Matches one `{name, plural|selectordinal, <body>}` block. The body is a run of form
// bodies `{…}`, each of which may hold `{word}` placeholders — two levels of nesting, which
// is all these forms need (a plural inside a plural is not supported, as before).
// The translation pipeline's scripts/i18n/icu.mjs copies this pattern and FORM_RE below (it
// runs under plain Node); a change to either is a change to both.
export const PLURAL_SOURCE = String.raw`\{(\w+),\s*(plural|selectordinal),\s*((?:[^{}]|\{(?:[^{}]|\{\w+\})*\})*)\}`;
export const PLURAL_RE = new RegExp(PLURAL_SOURCE, 'g');

// One `selector {body}` pair of a block's body, read from where the last one ended. Read
// in sequence rather than searched for, so a category word that happens to sit before a
// placeholder inside some form's text ("… no one {name} …") is never taken for a selector.
const FORM_RE = /\s*(=-?\d+(?:\.\d+)?|[a-z]+)\s*\{((?:[^{}]|\{\w+\})*)\}/y;

interface PluralForm {
  selector: string;
  text: string;
}

/** The forms of a block body, in order. Stops at the first thing that isn't a form. */
export function parseForms(body: string): PluralForm[] {
  const forms: PluralForm[] = [];
  FORM_RE.lastIndex = 0;
  for (let m = FORM_RE.exec(body); m; m = FORM_RE.exec(body)) {
    forms.push({ selector: m[1], text: m[2] });
  }
  return forms;
}

// How `#` prints the count. English keeps the bare digits it has always printed ("1000 charts").
// Another language writes the count the way it writes numbers — its decimal mark ("1,5 Stunden")
// and its thousands separator — grouping only from five digits (`min2`: "1000", "10 000"), the
// convention Spanish and Russian typography follow for a four-digit figure and harmless where
// a language would group it. A count is always a count here, never a year, so grouping it is
// safe. An engine that predates `min2` reads it as "group", which only adds a separator to a
// four-digit count. (2026-10-09)
const countFormats = new Map<string, Intl.NumberFormat>();
function formatCount(n: number, locale: string): string {
  if (/^en(?:-|$)/.test(locale)) return String(n);
  let f = countFormats.get(locale);
  if (!f) {
    // Through `unknown`: an older TypeScript lib (a downstream build may still use one) types
    // `useGrouping` as a boolean.
    const opts = { useGrouping: 'min2', maximumFractionDigits: 20 } as unknown as Intl.NumberFormatOptions;
    f = new Intl.NumberFormat(locale, opts);
    countFormats.set(locale, f);
  }
  return f.format(n);
}

export function applyPlurals(template: string, locale: string, vars?: TVars): string {
  if (!vars || !/(?:plural|selectordinal),/.test(template)) return template;
  return template.replace(PLURAL_RE, (_whole, name: string, kind: string, body: string) => {
    const n = Number(vars[name] ?? 0);
    const forms = parseForms(body);
    // An explicit `=N {…}` form wins over the category (e.g. "=0 {no charts}").
    const exact = forms.find((f) => f.selector.startsWith('=') && Number(f.selector.slice(1)) === n);
    const type: RuleType = kind === 'selectordinal' ? 'ordinal' : 'cardinal';
    const category = pluralRules(locale, type).select(n);
    const chosen =
      exact ??
      forms.find((f) => f.selector === category) ??
      forms.find((f) => f.selector === 'other');
    return (chosen?.text ?? '').replace(/#/g, formatCount(n, locale));
  });
}

const PLACEHOLDER_RE = /\{(\w+)\}/g;

/** The names a template interpolates: each block's variable, the `{name}`s inside its
 *  forms, and the plain `{name}`s around it — never the category keywords or a form's
 *  own braces. The runtime compares a translation's set with English's (runtime.ts). */
export function placeholderNames(template: string): Set<string> {
  const names = new Set<string>();
  const rest = template.replace(PLURAL_RE, (_whole, name: string, _kind: string, body: string) => {
    names.add(name);
    for (const form of parseForms(body)) {
      for (const m of form.text.matchAll(PLACEHOLDER_RE)) names.add(m[1]);
    }
    return '';
  });
  for (const m of rest.matchAll(PLACEHOLDER_RE)) names.add(m[1]);
  return names;
}

/** True when the two templates interpolate the same set of names. */
export function samePlaceholders(a: string, b: string): boolean {
  const x = placeholderNames(a);
  const y = placeholderNames(b);
  if (x.size !== y.size) return false;
  for (const name of x) if (!y.has(name)) return false;
  return true;
}
