// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The rules a translation is held to, shared by the core's `npm run check:i18n` and any
// downstream build's translation pipeline (2026-10-09). One function per question, each
// answering for ONE key, so the batch check a translator runs on its own output and the gate
// that runs before a build can't disagree about what passes.
//
// ERRORS mean the runtime would show something wrong — a lost {placeholder} (some call sites
// split on one, so the COUNT matters, not just the set), a plural the runtime can't read or a
// language's category left without a form, a glyph or a protected term gone, a length limit a
// string's own comment states. A key with an error is not shipped: English shows for it.
// WARNINGS are for a person to look at: a label that grew past what its row holds, a hover
// tip that crossed a width step, the same English translated two ways, prose left in English.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeIcu, placeholderCounts, pluralCategories, rareCategories, renderPlural } from './icu.mjs';

// What a tip SHOWS, for the width steps: its plural blocks rendered (the longest over a few
// counts) and each {placeholder} counted as a short value. ui/tipWidth.ts sizes the card from the
// rendered text, so measuring the template — plural markup and all — warned about tips that fit:
// a German hint reported "178 → 210" renders at about the English length (2026-10-10).
const PLACEHOLDER_STANDIN = 'XXXXXXXX';
const PLACEHOLDER_TOKEN = new RegExp('[{]\\w+[}]', 'g');
function shownLength(template, locale) {
  const names = analyzeIcu(template).blocks.map((b) => b.name);
  let worst = 0;
  for (const n of [0, 1, 2, 5, 21, 1000]) {
    const vars = Object.fromEntries(names.map((k) => [k, n]));
    worst = Math.max(worst, renderPlural(template, locale, vars).replace(PLACEHOLDER_TOKEN, PLACEHOLDER_STANDIN).length);
  }
  return worst;
}

const HERE = dirname(fileURLToPath(import.meta.url));

export function loadDnt(file = resolve(HERE, 'dnt.json')) {
  return JSON.parse(readFileSync(file, 'utf8')).terms;
}

// The hover-tip width steps, read from the component that applies them (ui/tipWidth.ts) so a
// moved threshold moves the warning with it. Falls back to the values in force on 2026-10-09
// only if the file can't be read — and says so.
export function readTipSteps(coreRoot = resolve(HERE, '../..')) {
  try {
    const text = readFileSync(resolve(coreRoot, 'src/components/ui/tipWidth.ts'), 'utf8');
    const steps = [...text.matchAll(/if \(n <= (\d+)\) return \d+/g)].map((m) => Number(m[1]));
    if (steps.length > 0) return steps;
  } catch {
    /* fall through */
  }
  console.warn('check: could not read the tip steps from tipWidth.ts; using 180/300');
  return [180, 300];
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isWordChar = (ch) => /[\p{L}\p{N}]/u.test(ch);

function exactMatcher(term) {
  const pre = isWordChar(term[0]) ? '(?<![\\p{L}\\p{N}])' : '';
  const post = isWordChar(term[term.length - 1]) ? '(?![\\p{L}\\p{N}])' : '';
  return new RegExp(`${pre}${escapeRe(term)}${post}`, 'gu');
}

const ANGLE_AFTER = /^\s(?:MC|IC|AS|DS|ASC|DSC|Vx|Avx)(?![\p{L}\p{N}])/u;

/** How many times a do-not-translate term occurs in a string, by its kind and context. */
export function countTerm(entry, s) {
  if (entry.pattern) return (s.match(new RegExp(entry.pattern, 'gu')) ?? []).length;
  const re = entry.kind === 'code'
    ? new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(entry.term)}(?![\\p{L}\\p{N}])`, 'gu')
    : exactMatcher(entry.term);
  if (entry.context !== 'strict') return (s.match(re) ?? []).length;
  let n = 0;
  for (const m of s.matchAll(re)) {
    const before = s[m.index - 1];
    const after = s.slice(m.index + m[0].length);
    if (before === '/' || after.startsWith('/') || ANGLE_AFTER.test(after)) n += 1;
  }
  return n;
}

const GLYPH_RUN = /[←-⯿\u{1F700}-\u{1F77F}][←-⯿\u{1F700}-\u{1F77F}︎️]*/gu;
export const glyphRuns = (s) => (s.match(GLYPH_RUN) ?? []).slice().sort();

// A marked string (a pack's `markers` paths, src/i18n/types.ts) carries ONE {word} that the
// build styles: a marker, not a placeholder.
const MARKER = /\{([^{}]+)\}/g;
const stripMarker = (s) => s.replace(MARKER, '$1');

function tipLike(key) {
  const last = key.slice(key.lastIndexOf('.') + 1);
  return /^(tip|hint)$/.test(last) || /(Tip|Hint)$/.test(last);
}

/**
 * The checking context for one locale. `glossary` and `programs` are optional: a downstream
 * pipeline may pass its own, and the open core has neither.
 */
export function makeContext({ locale, dnt = loadDnt(), glossary = null, programs = null, tipSteps = readTipSteps() }) {
  return {
    locale,
    categories: pluralCategories(locale),
    rare: { cardinal: rareCategories(locale), ordinal: rareCategories(locale, 'ordinal') },
    dnt,
    glossary: glossary?.entries ?? null,
    programs: programs?.names ?? null,
    tipSteps,
  };
}

/** Every issue with one translation of one record: [{ severity, rule, message }]. */
export function checkPair(rec, out, ctx) {
  const issues = [];
  const err = (rule, message) => issues.push({ severity: 'error', rule, message });
  const warn = (rule, message) => issues.push({ severity: 'warning', rule, message });
  if (typeof out !== 'string') {
    err('type', 'not a string');
    return issues;
  }
  if (out.trim() === '' && rec.en.trim() !== '') err('empty', 'empty translation');
  let en = rec.en;
  let tr = out;

  if (rec.marker) {
    const n = [...tr.matchAll(MARKER)].filter((m) => m[1].trim()).length;
    if (n !== 1 || /[{}]/.test(tr.replace(MARKER, ''))) err('marker', `a marked string needs exactly one {word} (found ${n})`);
    en = stripMarker(en);
    tr = stripMarker(tr);
  }

  // Leading and trailing whitespace is layout: 'Built by ' is followed by a link.
  if (/^\s*/.exec(en)[0] !== /^\s*/.exec(tr)[0] || /\s*$/.exec(en)[0] !== /\s*$/.exec(tr)[0]) {
    err('spaces', 'leading or trailing spaces differ from the English');
  }

  // Placeholders outside plural blocks: the same COUNT of each.
  const pe = placeholderCounts(en);
  const pt = placeholderCounts(tr);
  for (const name of new Set([...Object.keys(pe), ...Object.keys(pt)])) {
    if ((pe[name] ?? 0) !== (pt[name] ?? 0)) {
      err('placeholders', `{${name}}: English has ${pe[name] ?? 0}, translation has ${pt[name] ?? 0}`);
    }
  }

  // Plural blocks: readable, the same blocks, every category the language uses.
  const ie = analyzeIcu(en);
  const it = analyzeIcu(tr);
  for (const e of it.errors) err('icu', e);
  const sig = (b) => `${b.name}:${b.kind}`;
  const enSigs = ie.blocks.map(sig).sort().join(',');
  const trSigs = it.blocks.map(sig).sort().join(',');
  if (enSigs !== trSigs) err('icu', `plural blocks differ: English [${enSigs}], translation [${trSigs}]`);
  for (const b of it.blocks) {
    const type = b.kind === 'selectordinal' ? 'ordinal' : 'cardinal';
    const cats = ctx.categories[type];
    const selectors = b.forms.map((f) => f.selector);
    for (const s of selectors) {
      if (!s.startsWith('=') && s !== 'other' && !cats.includes(s)) {
        err('icu', `{${b.name}, ${b.kind}}: \`${s}\` is never chosen in ${ctx.locale} (a dead form)`);
      }
    }
    // Where the English itself has one form for every count (`other {min}`, `=0 {none} other {#}`)
    // its author judged the words invariant, and a language may agree — a missing category is then
    // a question for the reviewer, not a failure. Where the English varies by category, every
    // category the language has must be there.
    const match = ie.blocks.find((x) => sig(x) === sig(b));
    const enVaries = !!match?.forms.some((f) => !f.selector.startsWith('=') && f.selector !== 'other');
    for (const c of cats) {
      if (selectors.includes(c)) continue;
      if (ctx.rare[type].includes(c)) warn('icu', `{${b.name}, ${b.kind}}: no \`${c}\` form (${ctx.locale} uses it only for very large numbers)`);
      else if (!enVaries) warn('icu', `{${b.name}, ${b.kind}}: no \`${c}\` form — the English has one form for every count; check ${ctx.locale} doesn't need one`);
      else err('icu', `{${b.name}, ${b.kind}}: no \`${c}\` form, which ${ctx.locale} needs`);
    }
    if (match && match.inner.join(',') !== b.inner.join(',')) {
      err('icu', `{${b.name}, ${b.kind}}: placeholders inside the forms differ — English {${match.inner.join('}, {')}}, translation {${b.inner.join('}, {')}}`);
    }
  }

  // Glyph runs (astrological symbols, arrows, ▸ paths): the same ones.
  const ge = glyphRuns(en).join(' ');
  const gt = glyphRuns(tr).join(' ');
  if (ge !== gt) err('glyphs', `glyphs differ: English [${ge}], translation [${gt}]`);

  // Do-not-translate terms. A term may carry a language's own established spelling
  // (`locales`, e.g. the house-system eponyms in Cyrillic for Russian, 2026-10-09):
  // there the translation must carry THAT spelling instead, matched as a stem (a boundary before
  // it, none after) because a language that inflects names declines it ("по Плацидусу").
  for (const entry of ctx.dnt) {
    const ne = countTerm(entry, en);
    if (ne === 0) continue;
    const local = entry.locales?.[ctx.locale];
    if (local) {
      const pre = isWordChar(local[0]) ? '(?<![\\p{L}\\p{N}])' : '';
      const nt = (tr.match(new RegExp(`${pre}${escapeRe(local)}`, 'gu')) ?? []).length;
      if (nt < ne) err('dnt', `"${entry.term}" is written "${local}" in this language (English has ${ne}, translation ${nt})`);
      continue;
    }
    const nt = countTerm(entry, tr);
    if (nt < ne) err('dnt', `"${entry.term}" must stay as it is (English has ${ne}, translation ${nt})`);
  }

  // Glossary (when a pipeline supplies one). Matched over the English with every {placeholder}
  // blanked out: a placeholder's NAME is not a word of the sentence. Without this, {min} in
  // "between {min} and {max}" matched the glossary's "min" (minutes) and failed three correct
  // Russian year-range strings, and {planet} asked every template for the word "planet"
  // (2026-10-09). An entry with its OWN `match` is tested against the English as
  // written: a hand-written pattern may name a placeholder on purpose (Spanish solar-return
  // skips "SOLAR RETURN {year}"). The translation is searched as written — a rendering can only
  // be in its words, never inside a placeholder.
  if (ctx.glossary) {
    const enWords = en.replace(/\{\w+\}/g, ' ');
    // Whether the English uses a glossary term. Two things a word boundary alone got wrong (Help,
    // 2026-10-10): an apostrophe joins a contraction, so the "d" of "you’d" is not the day unit
    // "d"; and a one-letter term matches in its own case only, so the key "(D)" is not it either.
    // Only here: the do-not-translate count keeps the plain boundary, where "l’AstroLina" must
    // still count as AstroLina.
    const enHit = (t, label) =>
      new RegExp(
        exactMatcher(t).source.replace('(?<![\\p{L}\\p{N}])', "(?<![\\p{L}\\p{N}'’])"),
        label || [...t].length === 1 ? 'u' : 'iu',
      ).test(enWords);
    for (const g of ctx.glossary) {
      const target = g[ctx.locale];
      if (!target) continue;
      const label = g.enforce === 'label';
      const hit = g.match
        ? new RegExp(g.match, label ? 'u' : 'iu').test(en)
        : (g.en ?? []).some((t) => enHit(t, label));
      if (label && g.key === rec.key) {
        if (tr !== target) err('glossary', `label "${g.en?.[0]}" is "${target}" in the glossary (${g.id})`);
        continue;
      }
      if (!hit) continue;
      if (g.enforce === 'stem') {
        const re = new RegExp(`(?<![\\p{L}])${escapeRe(target)}`, 'iu');
        if (!re.test(tr)) warn('glossary', `"${g.en?.[0]}" → "${target}…" expected (${g.id})`);
      } else {
        const first = target[0];
        const body = escapeRe(target.slice(1));
        const head = first.toLowerCase() !== first.toUpperCase() && !label ? `[${escapeRe(first.toLowerCase())}${escapeRe(first.toUpperCase())}]` : escapeRe(first);
        const re = new RegExp(`(?<![\\p{L}\\p{N}])${head}${body}(?![\\p{L}\\p{N}])`, 'u');
        if (!re.test(tr)) err('glossary', `"${g.en?.[0]}" must read "${target}" (${g.id}, ${g.enforce})`);
      }
    }
  }

  // Another program named where the English names none (when a pipeline supplies the list of
  // names).
  if (ctx.programs) {
    for (const p of ctx.programs) {
      const re = new RegExp(p.match ?? exactMatcher(p.name).source, 'iu');
      if (re.test(tr) && !re.test(en)) err('policy', `names another program ("${p.name}"), which the English doesn't`);
    }
  }

  // A hard limit a string's own comment states.
  if (rec.maxLen) {
    if (en.length <= rec.maxLen && tr.length > rec.maxLen) err('length', `${tr.length} characters, over its stated limit of ${rec.maxLen}`);
    else if (en.length > rec.maxLen && tr.length > en.length) warn('length', `${tr.length} characters; the English (${en.length}) is already over its stated ${rec.maxLen}`);
  }

  // ── Warnings ──
  if (rec.kind === 'label' && tr.length > Math.max(1.3 * en.length, en.length + 6)) {
    warn('label-length', `${tr.length} characters against the English ${en.length}`);
  }
  if (tipLike(rec.key)) {
    const se = shownLength(en, 'en');
    const st = shownLength(tr, ctx.locale);
    for (const step of ctx.tipSteps) {
      if (se <= step && st > step) warn('tip-step', `crosses the ${step}-character tip step as shown (${se} → ${st})`);
    }
  }
  if ((rec.kind === 'prose' || rec.kind === 'body' || rec.kind === 'tip') && tr === en
    && (en.match(/[\p{L}]{2,}/gu) ?? []).length >= 3) {
    warn('untranslated', 'prose identical to the English');
  }
  for (const ch of ['<', '>', '&']) {
    const a = en.split(ch).length;
    const b = tr.split(ch).length;
    if (b > a) warn('markup', `adds "${ch}" (some strings reach HTML)`);
  }
  return issues;
}

/**
 * The same English translated more than one way: [{ en, outputs: [{ out, keys }] }]. Often a
 * slip (one label, two words for it on screen); sometimes context, which is why it only warns.
 */
export function inconsistencies(pairs) {
  const byEn = new Map();
  for (const { rec, out } of pairs) {
    if (rec.marker || rec.en.trim().length < 2) continue;
    const k = rec.en;
    if (!byEn.has(k)) byEn.set(k, new Map());
    const m = byEn.get(k);
    if (!m.has(out)) m.set(out, []);
    m.get(out).push(rec.key);
  }
  const found = [];
  for (const [en, outs] of byEn) {
    if (outs.size > 1) found.push({ en, outputs: [...outs].map(([out, keys]) => ({ out, keys })) });
  }
  return found;
}

/**
 * A derived record's value from its parts' values (a string built from shared constants in
 * the source — settings.inert.skyHeld is skyHeldWhy + ' ' + skyHeldFix). null while any part
 * is missing, so the whole shows English rather than half a sentence.
 */
export function deriveValue(derive, valueOf) {
  let out = '';
  for (const p of derive.parts) {
    if (p.lit !== undefined) out += p.lit;
    else {
      const v = valueOf(p.key);
      if (typeof v !== 'string') return null;
      out += v;
    }
  }
  return out;
}

/** Summarise issues for a console: counts by rule, then up to `limit` examples per rule. */
export function summarise(found, { limit = 8, verbose = false } = {}) {
  const lines = [];
  for (const severity of ['error', 'warning']) {
    const bucket = found.filter((f) => f.severity === severity);
    if (bucket.length === 0) continue;
    const byRule = new Map();
    for (const f of bucket) {
      if (!byRule.has(f.rule)) byRule.set(f.rule, []);
      byRule.get(f.rule).push(f);
    }
    lines.push(`${severity === 'error' ? 'ERRORS' : 'warnings'}: ${bucket.length}`);
    for (const [rule, list] of byRule) {
      lines.push(`  ${rule}: ${list.length}`);
      for (const f of verbose ? list : list.slice(0, limit)) lines.push(`    ${f.key}: ${f.message}`);
      if (!verbose && list.length > limit) lines.push(`    … ${list.length - limit} more (--verbose)`);
    }
  }
  return lines.join('\n');
}
