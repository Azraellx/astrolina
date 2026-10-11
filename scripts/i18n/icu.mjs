// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The catalog's placeholder and plural syntax, read exactly the way the runtime reads it
// (src/i18n/plural.ts and t.ts). The two patterns below are COPIES of plural.ts' PLURAL_SOURCE
// and FORM_RE — kept as copies rather than imported because this file runs under plain Node
// and plural.ts is TypeScript — so a change to one is a change to both (plural.ts says the
// same). The checker is deliberately STRICTER than the runtime: the runtime reads forms until
// the first thing that isn't one and quietly ignores the rest, which is right for a reader and
// wrong for a gate, so here an unread tail is an error.
//
//   {name}                                   a placeholder, filled by interpolate()
//   {n, plural, =0 {…} one {…} other {…}}    cardinal plural; `#` is the number
//   {n, selectordinal, one {#st} other {#th}} ordinal plural
// A form body may hold `{name}` placeholders (2026-10-09), never another plural.

export const PLURAL_SOURCE = String.raw`\{(\w+),\s*(plural|selectordinal),\s*((?:[^{}]|\{(?:[^{}]|\{\w+\})*\})*)\}`;
const FORM_SOURCE = String.raw`\s*(=-?\d+(?:\.\d+)?|[a-z]+)\s*\{((?:[^{}]|\{\w+\})*)\}`;

export const CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];
const PLACEHOLDER = /\{(\w+)\}/g;

/** The forms of a block body, in order, and where reading stopped (body.length when all read). */
export function parseForms(body) {
  const re = new RegExp(FORM_SOURCE, 'y');
  const forms = [];
  let end = 0;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    forms.push({ selector: m[1], text: m[2] });
    end = re.lastIndex;
  }
  return { forms, rest: body.slice(end) };
}

/**
 * Every plural block in a template, with its forms and any reading error. `outside` is the
 * template with each block replaced by a NUL, which is what the placeholder count reads.
 */
export function analyzeIcu(template) {
  const blocks = [];
  const errors = [];
  const re = new RegExp(PLURAL_SOURCE, 'g');
  const outside = template.replace(re, (whole, name, kind, body) => {
    const { forms, rest } = parseForms(body);
    const inner = new Set();
    for (const f of forms) for (const m of f.text.matchAll(PLACEHOLDER)) inner.add(m[1]);
    const block = { name, kind, forms, inner: [...inner].sort() };
    if (rest.trim()) errors.push(`{${name}, ${kind}, …}: unreadable after the last form: "${rest.trim().slice(0, 40)}"`);
    if (!forms.some((f) => f.selector === 'other')) errors.push(`{${name}, ${kind}, …}: no \`other\` form`);
    const seen = new Set();
    for (const f of forms) {
      if (seen.has(f.selector)) errors.push(`{${name}, ${kind}, …}: \`${f.selector}\` given twice`);
      seen.add(f.selector);
      if (!f.selector.startsWith('=') && !CATEGORIES.includes(f.selector)) {
        errors.push(`{${name}, ${kind}, …}: \`${f.selector}\` is not a plural category`);
      }
    }
    blocks.push(block);
    return '\u0000';
  });
  // What the block pattern couldn't take is left in `outside`: a plural keyword there means a
  // block the runtime will print raw, braces and all.
  if (/(?:plural|selectordinal)\s*,/.test(outside)) errors.push('a plural block the runtime cannot read (nested or unbalanced braces)');
  const stray = outside.replace(PLACEHOLDER, '').replace(/\u0000/g, '');
  if (/[{}]/.test(stray)) errors.push('a brace that is neither a {placeholder} nor part of a plural block');
  return { blocks, outside, errors };
}

/** Placeholder counts outside plural blocks: { name: count }. */
export function placeholderCounts(template) {
  const { outside } = analyzeIcu(template);
  const counts = {};
  for (const m of outside.matchAll(PLACEHOLDER)) counts[m[1]] = (counts[m[1]] ?? 0) + 1;
  return counts;
}

/** The plural categories a language uses: { cardinal: [...], ordinal: [...] } (Intl's order). */
export function pluralCategories(locale) {
  const order = (xs) => CATEGORIES.filter((c) => xs.includes(c));
  return {
    cardinal: order(new Intl.PluralRules(locale).resolvedOptions().pluralCategories),
    ordinal: order(new Intl.PluralRules(locale, { type: 'ordinal' }).resolvedOptions().pluralCategories),
  };
}

/**
 * The categories a language's rules only ever pick for very large or fractional numbers —
 * Spanish and Portuguese `many` (1,000,000 → "de"). A catalog count never reaches them, so a
 * missing form there is worth a warning, not a failure.
 */
export function rareCategories(locale, type = 'cardinal') {
  const rules = new Intl.PluralRules(locale, { type });
  const used = new Set();
  for (let n = 0; n <= 1000; n += 1) used.add(rules.select(n));
  return rules.resolvedOptions().pluralCategories.filter((c) => !used.has(c));
}

/** Render one template's plural blocks for a number, as the runtime would (for samples). */
export function renderPlural(template, locale, vars) {
  const re = new RegExp(PLURAL_SOURCE, 'g');
  return template.replace(re, (_w, name, kind, body) => {
    const n = Number(vars[name] ?? 0);
    const { forms } = parseForms(body);
    const exact = forms.find((f) => f.selector.startsWith('=') && Number(f.selector.slice(1)) === n);
    const cat = new Intl.PluralRules(locale, { type: kind === 'selectordinal' ? 'ordinal' : 'cardinal' }).select(n);
    const chosen = exact ?? forms.find((f) => f.selector === cat) ?? forms.find((f) => f.selector === 'other');
    return (chosen?.text ?? '').replace(/#/g, String(n));
  });
}

/** The ICU summary stored on a record: null when the template has no plural block. */
export function icuSummary(template) {
  const { blocks } = analyzeIcu(template);
  if (blocks.length === 0) return null;
  return blocks.map((b) => ({ name: b.name, kind: b.kind, selectors: b.forms.map((f) => f.selector), inner: b.inner }));
}
