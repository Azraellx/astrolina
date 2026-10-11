// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Plurals on the device (2026-10-10). A translator can't be handed `{n, plural, one {# chart}
// other {# charts}}` — it would translate the keywords, or the braces, or both — and English's two
// forms are not the target's: Russian needs four, Japanese one. So the forms are made the way a
// reader would see them. For every plural category the TARGET language has
// (`Intl.PluralRules(lang).resolvedOptions().pluralCategories`), and every explicit `=N` form the
// English carries:
//   1. pick a sample count in that category — one not already written in the string, and two
//      digits where the category allows it (in testing, 2026-10-10, the one count a translator
//      dropped was a single "1", in Japanese);
//   2. render the WHOLE English sentence for it (applyPlurals in English — so its own form, with
//      the count in digits);
//   3. translate the sentence;
//   4. require the count's digits exactly once (bounded by non-digits — "21" in "21e" counts, in
//      "2100" it doesn't) and put `#` back in their place;
// then reassemble one block whose forms are the translated sentences. Any form failing — the count
// dropped, written as a word, doubled, a `#` of the translator's own — and the key stays English.
// A template with more than one plural block stays English too.
//
// A category no count this app shows can reach is left out, and the runtime falls back to `other`
// for it (applyPlurals): French, Italian, Spanish and Portuguese have a `many` that holds only
// counts like 1 000 000, whose digits a translator regroups ("1 000 000"), so insisting on it would
// cost every plural in those languages for a count no list here reaches. `other` itself is never
// left out — where its only members are fractions (Russian), a fractional sample is used and its
// decimal mark may come back as either "." or ",".
import { applyPlurals, parseForms, PLURAL_SOURCE } from '../plural';

const CATEGORY_ORDER = ['zero', 'one', 'two', 'few', 'many', 'other'];

export interface FormSample {
  /** The form's selector in the reassembled block: a category, or `=N`. */
  selector: string;
  /** The count the English sentence was rendered for. */
  count: number;
  /** The English sentence for that count. */
  english: string;
  /** Whether the English form used for the count prints it (`#`) — only then are its digits
   *  required in the translation and turned back into `#`. */
  printsCount: boolean;
}

export interface PluralPlan {
  name: string;
  kind: 'plural' | 'selectordinal';
  samples: FormSample[];
}

const WHOLE_BLOCK = new RegExp(`^${PLURAL_SOURCE}$`);

/** A sample count's digits, bounded by non-digits, with either decimal mark for a fraction. */
function digitsPattern(n: number): RegExp {
  const [int, frac] = String(n).split('.');
  const body = frac === undefined ? int : `${int}[.,]${frac}`;
  return new RegExp(`(?<![\\d.,])${body}(?![.,]?\\d)`, 'g');
}

function occurrences(s: string, n: number): number {
  return (s.match(digitsPattern(n)) ?? []).length;
}

// The counts tried for a category, in order of preference: two digits first, then one, then
// three; fractions only for a category no whole number reaches.
const INTEGERS = [
  ...Array.from({ length: 190 }, (_, i) => i + 10),
  ...Array.from({ length: 8 }, (_, i) => i + 2),
  0,
  1,
  ...Array.from({ length: 800 }, (_, i) => i + 200),
];
const FRACTIONS = [1.5, 2.5, 0.5, 3.5, 1.25];

/** Plans the sentences a plural template is translated as, for `lang`; null when the template
 *  has no plural block, more than one, or one this can't plan. */
export function planPlural(template: string, lang: string): PluralPlan | null {
  const blocks = [...template.matchAll(new RegExp(PLURAL_SOURCE, 'g'))];
  if (blocks.length !== 1) return null;
  const [, name, kindRaw, body] = blocks[0];
  const kind = kindRaw as PluralPlan['kind'];
  const forms = parseForms(body);
  if (!forms.some((f) => f.selector === 'other')) return null;
  const type: Intl.PluralRulesOptions['type'] = kind === 'selectordinal' ? 'ordinal' : 'cardinal';
  let target: Intl.PluralRules;
  let english: Intl.PluralRules;
  try {
    target = new Intl.PluralRules(lang, { type });
    english = new Intl.PluralRules('en', { type });
  } catch {
    return null;
  }
  const exact = new Map(forms.filter((f) => f.selector.startsWith('=')).map((f) => [Number(f.selector.slice(1)), f]));
  // Every number already written in the template: a sample equal to one would be found twice.
  const literal = new Set((template.match(/\d+(?:\.\d+)?/g) ?? []).map(Number));
  const render = (n: number) => applyPlurals(template, 'en', { [name]: n });
  // The English form a count lands on — the exact one, its English category's, or `other`.
  const formFor = (n: number) =>
    exact.get(n) ?? forms.find((f) => f.selector === english.select(n)) ?? forms.find((f) => f.selector === 'other')!;
  const usable = (n: number) => !exact.has(n) && !literal.has(n);

  const samples: FormSample[] = [];
  for (const [n, f] of exact) {
    const printsCount = f.text.includes('#');
    const sentence = render(n);
    if (printsCount && occurrences(sentence, n) !== 1) return null;
    samples.push({ selector: f.selector, count: n, english: sentence, printsCount });
  }

  const categories = target.resolvedOptions().pluralCategories.slice().sort(
    (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b),
  );
  for (const category of categories) {
    // The first count in the category, and the first whose English form prints it and whose
    // sentence then carries it exactly once — scanned lazily, stopping at that one.
    const scan = (pool: readonly number[]) => {
      const found: { first?: number; printing?: number; formPrints: boolean } = { formPrints: false };
      for (const n of pool) {
        if (!usable(n) || target.select(n) !== category) continue;
        found.first ??= n;
        if (!formFor(n).text.includes('#')) continue;
        found.formPrints = true;
        if (occurrences(render(n), n) === 1) {
          found.printing = n;
          break;
        }
      }
      return found;
    };
    let found = scan(INTEGERS);
    if (found.first === undefined && category === 'other') found = scan(FRACTIONS);
    const { first, printing, formPrints } = found;
    if (first === undefined) {
      if (category === 'other') return null;
      continue; // unreachable for this app's counts: the runtime uses `other` (header)
    }
    // Some form prints the count but none could be read back for this category: give up rather
    // than take a sentence whose number nobody can find. With no printing form at all, the
    // English is a fixed phrase for these counts, and so is the translation.
    if (printing === undefined && formPrints) return null;
    const n = printing ?? first;
    samples.push({ selector: category, count: n, english: render(n), printsCount: printing !== undefined });
  }
  return { name, kind, samples };
}

/** Reassembles a plan's translated sentences into one plural block, or null if any form fails
 *  (the header lists how). `outputs[i]` is the translation of `plan.samples[i].english`. */
export function reassemble(plan: PluralPlan, outputs: readonly (string | null)[]): string | null {
  const forms: string[] = [];
  for (let i = 0; i < plan.samples.length; i += 1) {
    const s = plan.samples[i];
    let text = outputs[i];
    if (text == null || text.includes('#')) return null;
    if (s.printsCount) {
      if (occurrences(text, s.count) !== 1) return null;
      text = text.replace(digitsPattern(s.count), '#');
    }
    // Only placeholders may be braced inside a form (plural.ts reads two levels, no more).
    if (/[{}]/.test(text.replace(/\{\w+\}/g, ''))) return null;
    forms.push(`${s.selector} {${text}}`);
  }
  const block = `{${plan.name}, ${plan.kind}, ${forms.join(' ')}}`;
  return WHOLE_BLOCK.test(block) ? block : null;
}

/** Translates a template with exactly one plural block, sentence by sentence through
 *  `translateSentence` (which masks, translates and validates one plain sentence); null — English
 *  for the key — when the template can't be planned or any sentence fails. */
export async function translatePlural(
  template: string,
  lang: string,
  translateSentence: (english: string) => Promise<string | null>,
): Promise<string | null> {
  const plan = planPlural(template, lang);
  if (!plan) return null;
  const outputs: string[] = [];
  for (const s of plan.samples) {
    const out = await translateSentence(s.english);
    if (out === null) return null;
    outputs.push(out);
  }
  return reassemble(plan, outputs);
}
