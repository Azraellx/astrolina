// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The development pseudo-locale ('qps'). Every catalogued string comes back recognisably
// "translated" — accented, about a third longer, and wrapped in ⟦…⟧ — while staying
// readable. On screen that sorts the text into three kinds at a glance (2026-10-09):
//   • ⟦Šéţţıñĝš ___⟧ — catalogued, and room enough for a longer language;
//   • ⟦Šéţţıñĝš __   — catalogued, but its box clips a translation;
//   • Settings       — bare English: a string that never went through the catalog.
// The letters i/I become ı/İ so Turkish's dotted/dotless casing is exercised by every
// `text-transform` in the stylesheet, not discovered when Turkish ships.
// The padding is `_`, not a middot: the app itself splits some labels on `·` (the chart
// sidebar takes an overlay's name from before the first one), and padding made of the
// separator cut those labels in half under the pseudo-locale (2026-10-09).
//
// Left exactly as they are, because a translation must leave them so too: `{name}`
// placeholders, the ICU skeleton of a plural (`{n, plural,`, the category selectors, `=0`,
// the braces) and its `#`, astrological glyphs, and the codes that are never translated.

import { GLYPH_RUN as GLYPH_RUN_SPLIT } from '../components/ui/glyphify';

// The glyph runs glyphify() draws in the symbol font — its own pattern, made sticky here
// (components/ui/glyphify.tsx).
// Accenting only ever touches A–Z/a–z, so a glyph could not be altered anyway; the run is
// matched so it is kept out of the padding count and stays one unit.
const GLYPH_RUN = new RegExp(GLYPH_RUN_SPLIT.source, 'uy');

// Codes and names that stay as written in every language (docs/translations.md, "What not
// to translate"). Whole words only: "As" is the Ascendant's code, "Ask" is not.
const KEEP_WORD = /\b(?:AstroLina|In Mundo|In Zodiaco|ASC|DSC|Asc|Dsc|MC|IC|As|Ds)\b/y;

// A link or a domain name reads as itself in any language.
const KEEP_URL = /(?:https?:\/\/[^\s)]+|\b(?:[a-z0-9-]+\.)+(?:org|com|net|io|app)\b)/y;

const ACCENT: Record<string, string> = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'ı', j: 'ĵ', k: 'ķ',
  l: 'ļ', m: 'ɱ', n: 'ñ', o: 'ö', p: 'þ', q: 'ǫ', r: 'ŕ', s: 'š', t: 'ţ', u: 'ü', v: 'ṽ',
  w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Å', B: 'Ɓ', C: 'Ç', D: 'Đ', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'İ', J: 'Ĵ', K: 'Ķ',
  L: 'Ļ', M: 'Ṁ', N: 'Ñ', O: 'Ö', P: 'Þ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Ü', V: 'Ṽ',
  W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};

const PLACEHOLDER = /\{\w+\}/y;
const BLOCK_HEAD = /\{\w+,\s*(?:plural|selectordinal),\s*/y;
const SELECTOR = /\s*(?:=-?\d+(?:\.\d+)?|[a-z]+)\s*\{/y;
const SPACE = /\s+/y;

/** Matches `re` (sticky) at `i` in `s`, returning the matched text or null. */
function at(re: RegExp, s: string, i: number): string | null {
  re.lastIndex = i;
  const m = re.exec(s);
  return m ? m[0] : null;
}

// Accent one stretch of translatable text, keeping its protected words and glyphs.
// Returns the text and how many letters it carried (what the padding is sized from).
function accent(text: string): { out: string; letters: number } {
  let out = '';
  let letters = 0;
  for (let i = 0; i < text.length; ) {
    const kept = at(GLYPH_RUN, text, i) ?? at(KEEP_URL, text, i) ?? (isWordStart(text, i) ? at(KEEP_WORD, text, i) : null);
    if (kept) {
      out += kept;
      i += kept.length;
      continue;
    }
    const ch = text[i];
    const mapped = ACCENT[ch];
    if (mapped) letters += 1;
    out += mapped ?? ch;
    i += 1;
  }
  return { out, letters };
}

// \b in a sticky regex only looks forward; the word must also START at i.
function isWordStart(s: string, i: number): boolean {
  return i === 0 || !/\w/.test(s[i - 1]);
}

const cache = new Map<string, string>();

/**
 * The pseudo-locale form of an English template. A template with no letters to translate
 * (a lone `{count}`, a separator) is returned unchanged — there is nothing in it to flag.
 */
export function pseudoize(template: string): string {
  const hit = cache.get(template);
  if (hit !== undefined) return hit;

  let out = '';
  let letters = 0;
  let text = '';
  const flush = () => {
    if (!text) return;
    const a = accent(text);
    out += a.out;
    letters += a.letters;
    text = '';
  };

  // A small reader over the template: plain text, `{name}`, and plural blocks whose form
  // bodies are text again (with `#` and `{name}` kept). A malformed block falls through as
  // text — the braces are kept either way, and check:i18n is what reports it.
  let depth: 'text' | 'block' | 'form' = 'text';
  for (let i = 0; i < template.length; ) {
    if (depth === 'block') {
      const sel = at(SELECTOR, template, i);
      if (sel) {
        out += sel;
        i += sel.length;
        depth = 'form';
        continue;
      }
      const ws = at(SPACE, template, i);
      if (ws) {
        out += ws;
        i += ws.length;
        continue;
      }
      if (template[i] === '}') {
        out += '}';
        i += 1;
        depth = 'text';
        continue;
      }
      // Not a form after all: read the rest as plain text.
      depth = 'text';
      continue;
    }
    const ph = at(PLACEHOLDER, template, i);
    if (ph) {
      flush();
      out += ph;
      i += ph.length;
      continue;
    }
    if (depth === 'text') {
      const head = at(BLOCK_HEAD, template, i);
      if (head) {
        flush();
        out += head;
        i += head.length;
        depth = 'block';
        continue;
      }
    } else if (template[i] === '#') {
      flush();
      out += '#';
      i += 1;
      continue;
    } else if (template[i] === '}') {
      flush();
      out += '}';
      i += 1;
      depth = 'block';
      continue;
    }
    text += template[i];
    i += 1;
  }
  flush();

  const result = letters === 0 ? template : `⟦${out} ${'_'.repeat(Math.max(1, Math.ceil(letters * 0.35)))}⟧`;
  cache.set(template, result);
  return result;
}
