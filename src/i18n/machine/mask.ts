// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// What a device translator may not touch, taken out before it sees a string and put back after
// (2026-10-10). Each protected run becomes a numbered SENTINEL; the translator moves sentinels
// about with the words, and unmask() swaps them back and decides whether the result can stand.
//
// Protected: `{placeholders}`; glyph runs (glyphify's GLYPH_RUN — the same pattern the glyph font
// is applied by); the do-not-translate terms (terms.ts, from dnt.json); web addresses, bare
// domains and email addresses; and anything in the English that already looks like a sentinel.
// Under a pack's marker paths (a build's headline strings, for example) the braced word is the
// marked word, and it IS translated — so it is masked as a PAIR, `[1]Hours[/1]`, the word left
// between them for the translator, and put back as exactly one pair of braces round what it
// became.
//
// Line breaks are not given to the translator at all: it flattens them (measured 2026-10-10:
// "First line.\nSecond line." came back as one line in fr, de and ja), so each line is translated
// on its own and the breaks put back between them. Leading and trailing spaces are kept aside
// for the same reason — the translator trims them.
//
// A result is REJECTED — English shows for that key — unless every sentinel came back exactly
// once and none came back that wasn't sent; no `<`, `>`, `{` or `}` appears that the English
// lacked (some of these strings reach a map popup's setHTML); the marked word is still one word;
// and the length is 0.25×–4× the English. Length is counted with East Asian wide characters as
// two (in the same measurement: a plain count rejected correct Japanese — "Constellations" →
// "星座" is 0.14 — while the weighted one put the Japanese minimum at 0.29 with no false
// rejection in either sample).
//
// A result that stands gets one repair: where the English line starts with a capital and the
// translation with a lowercase letter of a cased script, that letter is capitalised in the
// target language's rules (capitaliseLike, 2026-10-10).
import { GLYPH_RUN } from '../../components/ui/glyphify';
import { protectedRanges } from './terms';

// THE SENTINEL SHAPE — a 1-based number in ASCII square brackets, `[3]`; a marker pair is
// `[3]word[/3]`. Chosen by measurement (2026-10-10): Chrome's on-device translator, en→fr,
// de, it and ja, a 226-string sample of this catalog (904 translations per shape) and a 578-string
// one for the leading four. Survival = sentinels found exactly once and unaltered:
//   [3]    99.5%  (main 792/796; large 3213/3228), 0 of 4024 ever altered, the fastest (31–33 str/s)
//   §3§    98.9%    ⟦3⟧  98.4 / 97.9    ⟪3⟫  98.0    {{3}}  97.7    __3__  97.2
//   [[3]]  96.7%    <x3/>  94.1          unmasked: 48.6 (placeholders, emails and names translated)
// Every [3] failure was a whole sentinel dropped or doubled — which the exact-match check below
// catches — never a changed one, so no lenient parsing is needed. The marker pair survived 12/12.
// None of the candidates' characters occur in the English catalog; a string that ever contains
// one is still safe — mask() protects the look-alike as a token of its own.
//
// To change the shape, change these two strings. ENGINE_VERSION (engine.ts) folds them in
// (2026-10-10), so every cached translation is made again without anyone remembering to bump it.
export const SENTINEL_OPEN = '[';
export const SENTINEL_CLOSE = ']';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every sentinel-shaped run: `[3]` or `[/3]`. Group 1 is the slash, group 2 the number. */
export const SENTINEL_RE = new RegExp(`${esc(SENTINEL_OPEN)}(\\/?)(\\d+)${esc(SENTINEL_CLOSE)}`, 'g');

// The same, unanchored and without the global flag, for a yes/no test that leaves no lastIndex
// behind (matchAll copies a global regex's lastIndex, so a stray one would skip matches).
const HAS_SENTINEL = new RegExp(SENTINEL_RE.source);

export function sentinel(n: number, closing = false): string {
  return `${SENTINEL_OPEN}${closing ? '/' : ''}${n}${SENTINEL_CLOSE}`;
}

const PLACEHOLDER = /\{\w+\}/g;
const MARKER = /\{[^{}]+\}/g;
const GLYPHS = new RegExp(GLYPH_RUN.source, 'gu');
const URL = /https?:\/\/[^\s<>"'()]+[^\s<>"'().,;:!?]/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const DOMAIN = /\b(?:[a-z0-9-]+\.)+(?:org|com|net|io|app|dev)\b/g;

export interface MaskedLine {
  /** Whitespace before and after the text, kept aside (the translator trims it). */
  lead: string;
  trail: string;
  /** The English line, unmasked, without its edges. */
  source: string;
  /** What the translator is given: the line with its protected runs as sentinels. */
  text: string;
  /** False when there is nothing to translate once masked — no letter at all, or one token that
   *  is data rather than a word (a fingerprint, a code shape). Passed through unchanged. */
  translate: boolean;
  /** The sentinel numbers in this line; a marker pair is listed once, by its number. */
  ids: number[];
}

export interface Masked {
  source: string;
  lines: MaskedLine[];
  /** Sentinel number → the English text it stands for (index 0 unused). */
  tokens: string[];
  /** Marker pairs: sentinel number → the English word between the braces. */
  markers: Map<number, string>;
}

/** Whether a masked line is data rather than words: a single token with no space that carries
 *  a digit ("a3f9c01e", "000000"), or nothing that is a letter at all. */
function nothingToTranslate(masked: string): boolean {
  const rest = masked.replace(SENTINEL_RE, ' ').trim();
  if (!/\p{L}/u.test(rest)) return true;
  return !/\s/.test(rest) && /\d/.test(rest);
}

/** Masks one English template (no plural block — forms.ts renders those to sentences first).
 *  `marker` says the braces are a marked word (a marker path), not placeholders. */
export function mask(template: string, opts: { marker?: boolean } = {}): Masked {
  const tokens: string[] = [''];
  const markers = new Map<number, string>();
  const lines: MaskedLine[] = [];
  for (const raw of template.split('\n')) {
    const lead = raw.match(/^\s*/)?.[0] ?? '';
    const body = raw.slice(lead.length);
    const trail = body.match(/\s*$/)?.[0] ?? '';
    const source = body.slice(0, body.length - trail.length);

    // Every protected run, then the leftmost-longest of any that overlap.
    const ranges: { start: number; end: number; kind: 'token' | 'marker' }[] = [];
    const add = (re: RegExp, kind: 'token' | 'marker') => {
      re.lastIndex = 0;
      for (const m of source.matchAll(re)) {
        if (m[0].length) ranges.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, kind });
      }
    };
    add(opts.marker ? MARKER : PLACEHOLDER, opts.marker ? 'marker' : 'token');
    add(SENTINEL_RE, 'token');
    add(GLYPHS, 'token');
    add(URL, 'token');
    add(EMAIL, 'token');
    add(DOMAIN, 'token');
    for (const [start, end] of protectedRanges(source)) ranges.push({ start, end, kind: 'token' });
    ranges.sort((a, b) => a.start - b.start || b.end - a.end);

    let text = '';
    let at = 0;
    const ids: number[] = [];
    for (const r of ranges) {
      if (r.start < at) continue; // inside a longer run already taken
      text += source.slice(at, r.start);
      const n = tokens.length;
      const original = source.slice(r.start, r.end);
      tokens.push(original);
      ids.push(n);
      if (r.kind === 'marker') {
        const word = original.slice(1, -1);
        markers.set(n, word);
        text += `${sentinel(n)}${word}${sentinel(n, true)}`;
      } else {
        text += sentinel(n);
      }
      at = r.end;
    }
    text += source.slice(at);
    lines.push({ lead, trail, source, text, translate: !nothingToTranslate(text), ids });
  }
  return { source: template, lines, tokens, markers };
}

// East Asian wide and fullwidth characters, which take two columns: the CJK blocks, kana,
// Hangul, and the fullwidth forms. Exported because it is one of the validation rules
// ENGINE_VERSION folds in (engine.ts): a change to it changes which translations stand.
export const WIDE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{20000}-\u{2FFFD}\u{30000}-\u{3FFFD}]/u;

/** A string's length with East Asian wide characters counted as two. */
export function widthOf(s: string): number {
  let w = 0;
  for (const ch of s) w += WIDE.test(ch) ? 2 : 1;
  return w;
}

export const MIN_RATIO = 0.25;
export const MAX_RATIO = 4;
/** Characters a translation may not carry more of than its English (some strings reach a map
 *  popup's setHTML, and a brace would read as a placeholder). */
export const STRAY_CHARS: readonly string[] = ['<', '>', '{', '}'];

const count = (s: string, ch: string) => s.split(ch).length - 1;

// Georgian has lowercase letters in Unicode (Mkhedruli) with capitals (Mtavruli) that are used
// only to set a whole word in capitals, never to start a sentence: in prose it is a script
// without case, and so it is left alone like one.
const UNCASED_IN_PROSE = /\p{Script=Georgian}/u;

/**
 * The translation with its first letter capitalised where the English line's first letter is a
 * capital and the translator's is a lowercase letter of a cased script (2026-10-10). Translators
 * lowercase the first word of a short label surprisingly often ("Close" → "fermer"), and a menu
 * of mixed-case labels reads as broken. Only a lowercase letter (\p{Ll}) is touched: scripts
 * without case (CJK, Thai, Devanagari…) have none, so they never change. In the language's own
 * rules (toLocaleUpperCase) — except Greek, whose locale rule is the ALL-CAPS one and drops the
 * accent ("ά" → "Α"), where a sentence's capital keeps it ("Ά"). Exported for the verify harness.
 */
// The run of spaces, punctuation and symbols a line may open with before its first word ("+ Text",
// "— Note", "“Quoted"), skipped on both sides so the first LETTER is what is compared. It stops at
// a sentinel's `[`: a line opening with a protected token is never re-cased (see unmaskLine).
// (2026-10-10: a browser re-test found labels opening "+ …" left lower case.)
const LEADING_NON_LETTERS = /^(?:(?!\[)[\s\p{P}\p{S}])*/u;

export function capitaliseLike(source: string, text: string, lang: string): string {
  const sp = LEADING_NON_LETTERS.exec(source)?.[0].length ?? 0;
  const tp = LEADING_NON_LETTERS.exec(text)?.[0].length ?? 0;
  const s = source.codePointAt(sp);
  const t = text.codePointAt(tp);
  if (s === undefined || t === undefined) return text;
  if (!/\p{Lu}/u.test(String.fromCodePoint(s))) return text;
  const ch = String.fromCodePoint(t);
  if (!/\p{Ll}/u.test(ch) || UNCASED_IN_PROSE.test(ch)) return text;
  let up: string;
  try {
    up = lang.toLowerCase().split('-')[0] === 'el' ? ch.toUpperCase() : ch.toLocaleUpperCase(lang);
  } catch {
    up = ch.toUpperCase(); // a tag Intl doesn't know: the root rules
  }
  return up === ch ? text : text.slice(0, tp) + up + text.slice(tp + ch.length);
}

/** Words in a marked word, with a number's digit groups ("900 000") counted as one. */
function wordsIn(s: string): number {
  const joined = s.trim().replace(/(\d)\s(?=\d)/g, '$1'); // \s takes the no-break spaces too
  return joined ? joined.split(/\s+/).length : 0;
}

/** Puts one line's translation back together, or says why it can't stand. With `lang`, the
 *  first letter is capitalised as the English line's is (capitaliseLike) — while the sentinels
 *  are still in, so a line the translator starts with a protected token ("circle-flags", a
 *  placeholder's value) is never altered: it starts with `[`, which is no letter. */
function unmaskLine(m: Masked, line: MaskedLine, out: string, lang?: string): string | null {
  // A translator returns one line for one line; if it ever adds a break, it is not ours.
  let text = out.replace(/\s*\n\s*/g, ' ').trim();
  const seen = new Map<string, number>();
  for (const s of text.matchAll(SENTINEL_RE)) {
    const n = Number(s[2]);
    const closing = s[1] === '/';
    if (!line.ids.includes(n)) return null; // a sentinel that wasn't sent
    if (closing && !m.markers.has(n)) return null;
    const k = `${closing ? '/' : ''}${n}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  for (const n of line.ids) {
    if (seen.get(String(n)) !== 1) return null; // dropped or doubled
    if (m.markers.has(n) && seen.get(`/${n}`) !== 1) return null;
  }
  if (lang) text = capitaliseLike(line.source, text, lang);
  // The marked word: one pair, in order, round as many words as the English had (one, nearly
  // always) — a translator that pulls an adjective in with it fails here (seen in the same
  // measurement).
  for (const [n, word] of m.markers) {
    if (!line.ids.includes(n)) continue;
    const open = sentinel(n);
    const close = sentinel(n, true);
    const a = text.indexOf(open);
    const b = text.indexOf(close);
    if (b < a) return null;
    const inner = text.slice(a + open.length, b).trim();
    if (!inner || /[{}<>]/.test(inner) || HAS_SENTINEL.test(inner)) return null;
    if (wordsIn(inner) > Math.max(1, wordsIn(word))) return null;
    text = `${text.slice(0, a)}{${inner}}${text.slice(b + close.length)}`;
  }
  text = text.replace(SENTINEL_RE, (whole, slash: string, num: string) => (slash ? whole : m.tokens[Number(num)] ?? whole));
  for (const ch of STRAY_CHARS) {
    if (count(text, ch) > count(line.source, ch)) return null;
  }
  return text;
}

/** Puts a masked template back together from its translated lines — `outputs[i]` is line i's
 *  translation, ignored for a line that wasn't sent — or returns null when it can't stand (the
 *  header lists the rules). With every output equal to its line's `text`, the result is the
 *  English template itself, byte for byte: verify-i18n-machine holds that for every key.
 *  `opts.lang` (the target language) turns on the first-letter capital rule (capitaliseLike). */
export function unmask(m: Masked, outputs: readonly (string | null)[], opts: { lang?: string } = {}): string | null {
  const lines: string[] = [];
  let translated = false;
  for (let i = 0; i < m.lines.length; i += 1) {
    const line = m.lines[i];
    if (!line.translate) {
      lines.push(line.lead + line.source + line.trail);
      continue;
    }
    const out = outputs[i];
    if (out == null) return null;
    const back = unmaskLine(m, line, out, opts.lang);
    if (back === null) return null;
    translated = true;
    lines.push(line.lead + back + line.trail);
  }
  const result = lines.join('\n');
  if (translated) {
    const src = widthOf(m.source);
    const got = widthOf(result);
    if (src > 0 && (got < src * MIN_RATIO || got > src * MAX_RATIO)) return null;
  }
  return result;
}

/** True when nothing in the template is for a translator (the engine keeps it as it is). */
export function untranslatable(m: Masked): boolean {
  return m.lines.every((l) => !l.translate);
}
