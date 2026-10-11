// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the on-device translation tier (src/i18n/machine/, src/i18n/machineMenu.ts and its
// side of runtime.ts), built 2026-10-10, running the REAL modules through the harness
// (`npm run verify:i18n-machine`; no network, no DOM, no real translator — the browser's
// Translator API is stood in for by fakes that do exactly what each check needs).
//
// Each section says which KIND of check it is (as verify-i18n-runtime's do):
//
//   INTERNAL IDENTITY  — the tier agrees with the rules it states: masking then unmasking gives
//                        the English back byte for byte; a translator that breaks a sentinel is
//                        never let through; the cache keys a translation to its English; a held
//                        choice stays stored while another language shows.
//   OUTSIDE AGREEMENT  — the tier against something it does not compute: plural forms it
//                        reassembles against the browser's own Intl.PluralRules (through a
//                        hand-written template for the same language); the runtime list of
//                        protected terms against scripts/i18n/dnt.json.
//
// Every loop fails on an empty set, and every "falls back" check is paired with one that requires
// something to get THROUGH — a validator that rejected everything would pass the first alone.
//
// The tier is held from readers with the languages (src/i18n/languageHold.ts, 2026-10-10). This
// suite tests the tier itself, so it runs UNLOCKED; verify-i18n-runtime §8 checks it held. Its own
// §8 (2026-10-10) re-runs this bundle held, in a child process, for the one thing a build adds to
// the tier — its own text through translateOnDevice — which must be refused there too.

// FIRST, before anything that reaches src/i18n: the hold resolves as its module is evaluated
// (harness/languagesUnlocked.ts says why this has to come first).
import { HELD_RUN, releaseLanguagesUnlock } from './harness/languagesUnlocked';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLYPH_RUN } from '../src/components/ui/glyphify';
import { applyPlurals, placeholderNames, PLURAL_RE, PLURAL_SOURCE, samePlaceholders } from '../src/i18n/plural';
import { composeEnglish, isMarkerPath, registerMessages, __resetRegistryForTest } from '../src/i18n/registry';
import { interpolate, resolvePath } from '../src/i18n/t';
import {
  __testing,
  currentMachineSession,
  documentI18n,
  getI18n,
  initI18n,
  isHeldRepick,
  isTranslated,
  noteNamespaceRead,
  subscribeI18n,
  tStatic,
} from '../src/i18n/runtime';
import {
  capitaliseLike,
  mask,
  MAX_RATIO,
  MIN_RATIO,
  sentinel,
  SENTINEL_CLOSE,
  SENTINEL_OPEN,
  SENTINEL_RE,
  STRAY_CHARS,
  unmask,
  untranslatable,
  WIDE,
  widthOf,
} from '../src/i18n/machine/mask';
import { planPlural, translatePlural } from '../src/i18n/machine/forms';
import { PROTECTED_TERMS, RUNTIME_ONLY, protectedRanges } from '../src/i18n/machine/terms';
import {
  CACHE_LOAD_TIMEOUT_MS,
  entryHash,
  MachineCache,
  memoryBackend,
  __setMachineCacheForTest,
  type CacheBackend,
  type CacheRecord,
} from '../src/i18n/machine/cache';
import {
  ENGINE_REVISION,
  ENGINE_VERSION,
  engineIngredients,
  engineVersionOf,
  isOwnKey,
  MAX_CONSECUTIVE_ERRORS,
  ownText,
  PUBLISH_EVERY_MS,
  runPick,
  translateFree,
  translateTemplate,
  __resetEngineForTest,
  __sessionForTest,
  __whenIdleForTest,
} from '../src/i18n/machine/engine';
import { canTranslateOnDevice, translateOnDevice, type OnDeviceItem } from '../src/i18n/machine/onDevice';
import { OWN_STRINGS, OWN_STRINGS_SOURCE } from '../src/i18n/machine/ownStrings';
import {
  chooseMachineLanguage,
  getMachineMenu,
  MACHINE_CANDIDATES,
  refreshMachineAvailability,
  updateMachineMenu,
  __resetMachineMenuForTest,
  type TranslatorAvailability,
  type TranslatorFactory,
  type TranslatorLike,
} from '../src/i18n/machineMenu';
import type { LocaleId, MessagePack, TVars } from '../src/i18n/types';
import { LANGUAGES_HELD } from '../src/i18n/languageHold';


let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

/** One PASS/FAIL line for a whole set: fails when the set is empty, and names the first few
 *  members that broke the rule. */
async function every<T>(label: string, items: readonly T[], bad: (x: T) => string | null | Promise<string | null>) {
  if (items.length === 0) {
    check(label, false, 'empty set — nothing was compared');
    return;
  }
  const broken: string[] = [];
  for (const x of items) {
    const b = await bad(x);
    if (b != null) broken.push(b);
  }
  check(`${label} (${items.length})`, broken.length === 0, broken.slice(0, 6).join('; '));
}

function section(title: string) {
  console.log(`\n── ${title}`);
}

function leaves(node: unknown, path = ''): [string, string][] {
  if (typeof node === 'string') return [[path, node]];
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return [];
  return Object.entries(node).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
}

function finish(): never {
  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

// The planted unlock has done its one job; it goes before any check, which meet the bare harness.
releaseLanguagesUnlock();
if (HELD_RUN) {
  // The child §8 starts: only the held section, against the module graph `--held` produced.
  await heldSection();
  finish();
}
check('this run resolved the language hold UNLOCKED, so the tier below is the one a reader gets once the hold lifts', LANGUAGES_HELD === false,
  'harness/languagesUnlocked.ts plants a copy of the unlock key — compare it with languageHold.ts');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const count = (s: string, ch: string) => s.split(ch).length - 1;
const blocksIn = (s: string) => s.match(PLURAL_RE)?.length ?? 0;
const COUNTS = [...Array.from({ length: 31 }, (_, i) => i), 101, 1000];

/** Every count variable a template's plural blocks read, set to `n`, and every other name to a
 *  marked value — so interpolation is compared as well as the form chosen. */
function varsFor(s: string, n: number): TVars {
  const v: TVars = {};
  for (const m of s.matchAll(/\{(\w+)[,}]/g)) v[m[1]] = `«${m[1]}»`;
  for (const m of s.matchAll(/\{(\w+),\s*(?:plural|selectordinal)/g)) v[m[1]] = n;
  return v;
}

/** A translator that returns what it is given, after `fn`. */
function fakeTranslator(fn: (s: string) => string): TranslatorLike {
  return { inputQuota: Infinity, translate: async (s) => fn(s) };
}
const identity = fakeTranslator((s) => s);
const wrap = (s: string) => `«${s}»`;
const signal = new AbortController().signal;

// A pack of this build's own, standing in for a downstream build's: a marker title (a `markers`
// path: the braced word is the one the build styles, translated), a fingerprint that is data, a
// line break, a plan name, and a path the build asks the device tier to leave in English.
const PACK: MessagePack = {
  namespaces: {
    zzMachine: {
      entries: {
        a: { title: 'Planetary {Hours}', body: 'See the hours of the day and night.', src: 'a3f9c01e' },
        b: { title: 'Discreet {Mode}', body: 'Hide what the app says out loud.', src: '0b12ff9a' },
      },
      legal: { text: 'By continuing, you agree to our {terms} and acknowledge our {privacy}.' },
      plan: 'Upgrade to Pro to see {feature} on AstroLina.',
      multi: 'First line.\nSecond line.',
    },
  },
  markers: ['zzMachine.entries.*.title'],
  // Its own legal line, and a core path it would override (a build's licence statements are).
  machineExclude: ['zzMachine.legal', 'creditsModal.notes'],
};
registerMessages(PACK);

// ── §1 identity round trip over the whole composed catalog — INTERNAL IDENTITY ─
section('§1 an identity translator round trip over the whole composed catalog — INTERNAL IDENTITY');
{
  const all = leaves(composeEnglish());
  const plain = all.filter(([, s]) => blocksIn(s) === 0);
  const plural = all.filter(([, s]) => blocksIn(s) > 0);
  await every('unmask(mask(x)) === x for every plain key', plain, ([key, s]) => {
    const m = mask(s, { marker: isMarkerPath(key) });
    const back = unmask(m, m.lines.map((l) => l.text));
    return back === s ? null : `${key}: ${JSON.stringify(back)}`;
  });
  await every('…and for every sentence a plural key renders (counts 0–30, 101, 1000)', plural, ([key, s]) => {
    for (const n of COUNTS) {
      const sentence = applyPlurals(s, 'en', varsFor(s, n));
      const m = mask(sentence);
      const back = unmask(m, m.lines.map((l) => l.text));
      if (back !== sentence) return `${key} n=${n}: ${JSON.stringify(back)}`;
    }
    return null;
  });
  const masked = all.filter(([key, s]) => mask(s, { marker: isMarkerPath(key) }).lines.some((l) => l.ids.length > 0));
  check('…and the masking had something to protect in a good share of keys', masked.length > 200, `${masked.length} keys carry a sentinel`);
  await every('every key through the ENGINE with an identity translator comes back as English', all, async ([key, s]) => {
    const r = await translateTemplate(identity, s, key, 'en', signal);
    const blocks = blocksIn(s);
    if (blocks > 1) return r === null ? null : `${key}: a template with ${blocks} plural blocks was not left English`;
    if (r === null) return `${key}: rejected`;
    if (blocks === 0) return r === s ? null : `${key}: ${JSON.stringify(r)}`;
    for (const n of COUNTS) {
      const want = interpolate(applyPlurals(s, 'en', varsFor(s, n)), varsFor(s, n));
      const got = interpolate(applyPlurals(r, 'en', varsFor(s, n)), varsFor(s, n));
      if (got !== want) return `${key} n=${n}: "${got}" vs "${want}"`;
    }
    return null;
  });
  const multi = mask('First line.\nSecond line.');
  check('a line break is never sent: each line is translated alone', multi.lines.length === 2 && multi.lines.every((l) => !l.text.includes('\n')));
  const spaced = mask('  Padded {x}  ');
  check('edge spaces are kept aside and put back', spaced.lines[0].lead === '  ' && spaced.lines[0].trail === '  ' && unmask(spaced, ['Rembourré [1]']) === '  Rembourré {x}  ', String(unmask(spaced, ['Rembourré [1]'])));
  check('a fingerprint is data, passed through untranslated', untranslatable(mask('a3f9c01e')) && untranslatable(mask('000000')));
  check('the sentinel shape is [n], pairs [n]…[/n]', sentinel(3) === '[3]' && sentinel(3, true) === '[/3]');
  check('wide characters count double in the length rule', widthOf('星座') === 4 && widthOf('ab') === 2);
}

// ── §2 fake translators that break sentinels — INTERNAL IDENTITY ─────────────
section('§2 translators that drop, double, alter or reorder sentinels: validated or English, never broken — INTERNAL IDENTITY');
{
  const OPEN = /\[(\d+)\]/g;
  const fakes: Record<string, (s: string) => string> = {
    drop: (s) => {
      let done = false;
      return s.replace(OPEN, (w) => (done ? w : ((done = true), '')));
    },
    double: (s) => {
      let done = false;
      return s.replace(OPEN, (w) => (done ? w : ((done = true), `${w} ${w}`)));
    },
    alter: (s) => s.replace(/\[(\d+)\]/, '[ $1]'),
    unknown: (s) => `${s} [99]`,
    brace: (s) => `${s} {x}`,
    angle: (s) => `<b>${s}</b>`,
    shrink: (s) => s.slice(0, 1),
    reorder: (s) => {
      const toks = [...s.matchAll(OPEN)].map((m) => m[0]);
      const rev = [...toks].reverse();
      let i = 0;
      return s.replace(OPEN, () => rev[i++]);
    },
    numberWords: (s) => s.replace(/\d+(?:[.,]\d+)?/g, 'several'),
    greedyMarker: (s) => s.replace(/\[(\d+)\]([^[]*)\[\/(\d+)\]/, '[$1]$2 extra words[/$3]'),
  };

  const glyphRuns = (s: string) => (s.match(new RegExp(GLYPH_RUN.source, 'gu')) ?? []).sort();
  const protectedTexts = (s: string) => protectedRanges(s).map(([a, b]) => s.slice(a, b));
  const contains = (hay: string[], needles: string[]) => {
    const pool = [...hay];
    return needles.every((n) => {
      const i = pool.indexOf(n);
      if (i < 0) return false;
      pool.splice(i, 1);
      return true;
    });
  };
  function brokenReason(r: string, s: string, key: string): string | null {
    if ((r.match(SENTINEL_RE) ?? []).length > (s.match(SENTINEL_RE) ?? []).length) return 'a sentinel left in';
    for (const ch of ['{', '}', '<', '>']) {
      if (blocksIn(s) === 0 && count(r, ch) > count(s, ch)) return `a stray ${ch}`;
    }
    if (isMarkerPath(key)) {
      if ((r.match(/\{[^{}]+\}/g) ?? []).length !== (s.match(/\{[^{}]+\}/g) ?? []).length) return 'marker count';
    } else if (!samePlaceholders(r, s)) {
      return 'placeholders differ';
    }
    if (blocksIn(s) === 1 && !new RegExp(`^${PLURAL_SOURCE}$`).test(r)) return 'not one readable plural block';
    // Each protected run of the English, still there as written. Counted as plain whole-word text
    // in the result, not with dnt.json's context rule: a translator may move a code out of the
    // 'Su/Mo' position it was protected in, and it is still the code, unaltered.
    const wordCount = (hay: string, w: string) => {
      const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`);
      return (hay.match(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'gu')) ?? []).length;
    };
    for (const w of new Set(protectedTexts(s))) {
      if (wordCount(r, w) < protectedTexts(s).filter((x) => x === w).length) return `a protected term lost (${w})`;
    }
    if (!contains(glyphRuns(r), glyphRuns(s))) return 'a glyph lost';
    return null;
  }

  const all = leaves(composeEnglish());
  const sentWithSentinel = (key: string, s: string) =>
    blocksIn(s) === 0 && mask(s, { marker: isMarkerPath(key) }).lines.some((l) => l.translate && l.ids.length > 0);
  const sentAtAll = (key: string, s: string) => blocksIn(s) === 0 && !untranslatable(mask(s, { marker: isMarkerPath(key) }));

  for (const [name, fn] of Object.entries(fakes)) {
    const tr = fakeTranslator(fn);
    let through = 0;
    await every(`'${name}': every key validates or falls back to English — never a broken string`, all, async ([key, s]) => {
      const r = await translateTemplate(tr, s, key, 'ru', signal);
      if (r === null) return null;
      through += 1;
      const why = brokenReason(r, s, key);
      return why ? `${key}: ${why}: ${JSON.stringify(r)}` : null;
    });
    if (name === 'reorder') check(`'reorder': moving sentinels is not breaking them — most keys get through`, through > all.length / 2, `${through} of ${all.length}`);
  }

  // What each breaker must cause, so the check above cannot pass by rejecting nothing.
  const expectNull = async (name: string, pick: (key: string, s: string) => boolean) => {
    const tr = fakeTranslator(fakes[name]);
    await every(`'${name}' is rejected wherever it reached a sentinel or the text`, all.filter(([k, s]) => pick(k, s)), async ([key, s]) =>
      (await translateTemplate(tr, s, key, 'ru', signal)) === null ? null : `${key} got through`,
    );
  };
  await expectNull('drop', sentWithSentinel);
  await expectNull('double', sentWithSentinel);
  await expectNull('alter', sentWithSentinel);
  await expectNull('unknown', sentAtAll);
  await expectNull('brace', sentAtAll);
  await expectNull('angle', sentAtAll);
  await expectNull('greedyMarker', (k) => isMarkerPath(k));
  await expectNull('numberWords', (_k, s) => blocksIn(s) === 1 && /#/.test(s));
  {
    const tr = fakeTranslator(fakes.reorder);
    const two = 'Drag {from} onto {to} with the MC.';
    const r = await translateTemplate(tr, two, 'x', 'ru', signal);
    check('a reordered sentence comes back with its tokens where the translator put them', r === 'Drag {to} onto MC with the {from}.' || r === 'Drag MC onto {to} with the {from}.', String(r));
  }
}

// ── §3 plural reassembly against Intl.PluralRules — OUTSIDE AGREEMENT ────────
section('§3 plural forms reassembled for ru, pl and ar agree with Intl.PluralRules — OUTSIDE AGREEMENT');
{
  // A fake translator that writes the count's noun as the target language does for THAT count,
  // by asking Intl itself — so a reassembled form is right only if each form was made from a count
  // in the category it ends up serving.
  const WORDS: Record<string, Record<string, string>> = {
    ru: { one: 'карта', few: 'карты', many: 'карт', other: 'карты' },
    pl: { one: 'mapa', few: 'mapy', many: 'map', other: 'mapy' },
    ar: { zero: 'خرائط٠', one: 'خريطة', two: 'خريطتان', few: 'خرائط', many: 'خريطةً', other: 'خريطةٍ' },
  };
  const translatorFor = (lang: string) =>
    fakeTranslator((s) =>
      s
        .replace(/(\d+(?:\.\d+)?) charts?/g, (_w, d: string) => `${d} ${WORDS[lang][new Intl.PluralRules(lang).select(Number(d))]}`)
        .replace(/No charts/, 'NONE')
        .replace(/Saved/, 'SAVED')
        .replace(/ in /, ' IN '),
    );
  const TEMPLATES = [
    '{n, plural, one {# chart} other {# charts}}',
    'Saved {n, plural, one {# chart} other {# charts}} in {place}',
    '{n, plural, =0 {No charts} one {# chart} other {# charts}}',
  ];
  for (const lang of ['ru', 'pl', 'ar']) {
    const cats = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
    const hand = (prefix: string, suffix: string, zero?: string) =>
      `{n, plural, ${zero ? `=0 {${zero}} ` : ''}${cats.map((c) => `${c} {${prefix}# ${WORDS[lang][c]}${suffix}}`).join(' ')}}`;
    const want: Record<string, string> = {
      [TEMPLATES[0]]: hand('', ''),
      [TEMPLATES[1]]: hand('SAVED ', ' IN {place}'),
      [TEMPLATES[2]]: hand('', '', 'NONE'),
    };
    for (const tpl of TEMPLATES) {
      const r = await translatePlural(tpl, lang, async (sentence) => translateTemplate(translatorFor(lang), sentence, 'x', lang, signal));
      if (r === null) {
        check(`${lang}: "${tpl}" reassembled`, false, 'rejected');
        continue;
      }
      const forms = [...r.matchAll(/(?:^|\s|,\s)(=\d+|zero|one|two|few|many|other) \{/g)].map((m) => m[1]);
      // Arabic's `zero` holds 0 alone, which an English `=0` form already serves: no form of its
      // own is needed there, and none is made (the n-by-n check below holds 0 to it).
      const needed = cats.filter((c) => !(c === 'zero' && /=0 \{/.test(tpl)));
      check(`${lang}: a form for every category ${lang} has that no =N form serves (${needed.join(', ')})`, needed.every((c) => forms.includes(c)), forms.join(', '));
      const ns = [...Array.from({ length: 230 }, (_, i) => i), 1001, 1.5, 2.5, 21.5];
      await every(`${lang}: "${tpl}" reads as a hand-written ${lang} template does, n in 0–229, 1001, fractions`, ns, (n) => {
        const v = { n, place: 'Kraków' };
        const got = interpolate(applyPlurals(r, lang, v), v);
        const exp = interpolate(applyPlurals(want[tpl], lang, v), v);
        return got === exp ? null : `n=${n}: "${got}" vs "${exp}"`;
      });
    }
  }
  // French has a `many` holding only counts like 1 000 000: left out, and `other` serves it.
  const frPlan = planPlural('{n, plural, one {# chart} other {# charts}}', 'fr');
  check('fr: the unreachable `many` is left out of the plan, `one` and `other` kept',
    !!frPlan && !frPlan.samples.some((s) => s.selector === 'many') && ['one', 'other'].every((c) => frPlan.samples.some((s) => s.selector === c)),
    frPlan?.samples.map((s) => `${s.selector}:${s.count}`).join(' '));
  check('…and samples avoid a number already in the string, preferring two digits',
    (planPlural('Top {n, plural, one {# place} other {# places}} within 10 km', 'ja')?.samples ?? []).every((s) => s.count !== 10 && s.count >= 10),
    planPlural('Top {n, plural, one {# place} other {# places}} within 10 km', 'ja')?.samples.map((s) => s.count).join(' '));
  check('ru: `other` (fractions only) gets a fractional sample', (planPlural('{n, plural, one {# chart} other {# charts}}', 'ru')?.samples ?? []).some((s) => s.selector === 'other' && !Number.isInteger(s.count)));
  // An ordinal into French: 1re / 2e.
  const ord = await translatePlural('{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} house', 'fr', async (s) =>
    translateTemplate(fakeTranslator((x) => x.replace(/(\d+)(st|nd|rd|th) house/, (_w, d: string) => `${d}${d === '1' ? 're' : 'e'} maison`)), s, 'x', 'fr', signal),
  );
  check('fr ordinals: 1re maison, 2e maison, 21e maison', !!ord && ['1re maison', '2e maison', '21e maison'].every((w, i) => applyPlurals(ord, 'fr', { n: [1, 2, 21][i] }) === w), String(ord));
  check('a template with two plural blocks stays English', (await translateTemplate(identity, '{a, plural, one {# x} other {# xs}} and {b, plural, one {# y} other {# ys}}', 'x', 'ru', signal)) === null);
  check('a count dropped from one form fails the whole key',
    (await translatePlural('{n, plural, one {# chart} other {# charts}}', 'ru', async (s) => (/\b5\b|\b2\d\b|\b1[5-9]\b/.test(s) ? 'карт' : s))) === null);
}

// ── §4 protected terms against dnt.json — OUTSIDE AGREEMENT ──────────────────
section('§4 the runtime’s protected terms agree with scripts/i18n/dnt.json — OUTSIDE AGREEMENT');
{
  type Dnt = { term: string; kind: string; context?: string; pattern?: string };
  const dnt = (JSON.parse(readFileSync(resolve(process.cwd(), 'scripts/i18n/dnt.json'), 'utf8')) as { terms: Dnt[] }).terms;
  await every('every dnt.json term is in the runtime list, with the same kind, context and pattern', dnt, (d) => {
    const r = PROTECTED_TERMS.find((t) => t.term === d.term);
    if (!r) return `${d.term}: missing`;
    if (r.kind !== d.kind || (r.context ?? null) !== (d.context ?? null) || (r.pattern ?? null) !== (d.pattern ?? null)) {
      return `${d.term}: ${JSON.stringify(r)} vs ${JSON.stringify(d)}`;
    }
    return null;
  });
  const extra = PROTECTED_TERMS.filter((t) => !dnt.some((d) => d.term === t.term)).map((t) => t.term);
  check('the runtime list adds exactly the declared runtime-only terms', JSON.stringify(extra) === JSON.stringify(RUNTIME_ONLY), extra.join(', '));
  check('…and no term is listed twice', new Set(PROTECTED_TERMS.map((t) => t.term)).size === PROTECTED_TERMS.length);
  // A translator that turns every unmasked word around: whatever the masking protects survives it.
  const garble = fakeTranslator((s) => s.replace(/\p{L}+/gu, (w) => [...w].reverse().join('')));
  const all = leaves(composeEnglish()).filter(([key, s]) => blocksIn(s) === 0 && protectedRanges(s).length > 0 && !isMarkerPath(key));
  await every('every protected term in the catalog survives a translator that rewrites every other word', all, async ([key, s]) => {
    const r = await translateTemplate(garble, s, key, 'fr', signal);
    if (r === null) return `${key}: rejected`;
    const want = protectedRanges(s).map(([a, b]) => s.slice(a, b)).sort().join('|');
    const got = protectedRanges(r).map(([a, b]) => r.slice(a, b)).sort().join('|');
    return got === want ? null : `${key}: ${want} → ${got}`;
  });
  check('a strict code is protected only standing as a code', protectedRanges('Su/Mo and Leo MC').length === 4 && protectedRanges('Can you see Leo rise?').length === 0,
    JSON.stringify(protectedRanges('Su/Mo and Leo MC')));
}

// ── §5 the cache, the runtime and the menu — INTERNAL IDENTITY ───────────────
section('§5 cache invalidation, the hold, a pick and its pacing — INTERNAL IDENTITY');
{
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: ['en-US'], language: 'en-US' } });
  Object.defineProperty(globalThis, 'self', { configurable: true, value: globalThis });

  interface Fake {
    creates: { lang: string; sync: boolean; signal?: AbortSignal }[];
    calls: string[];
    /** Each create()'s monitor target, so a check can send a progress event later. */
    monitors: EventTarget[];
  }
  let inCall = false;
  function installTranslator(cfg: {
    availability: TranslatorAvailability;
    translate?: (s: string) => string;
    delayMs?: number;
    hang?: (lang: string) => boolean;
  }): Fake {
    const fake: Fake = { creates: [], calls: [], monitors: [] };
    const factory: TranslatorFactory = {
      availability: async () => cfg.availability,
      create: (opts) => {
        fake.creates.push({ lang: opts.targetLanguage, sync: inCall, signal: opts.signal });
        const ev = Object.assign(new Event('downloadprogress'), { loaded: 0.5, total: 1 });
        const target = new EventTarget();
        fake.monitors.push(target);
        opts.monitor?.(target);
        target.dispatchEvent(ev);
        if (cfg.hang?.(opts.targetLanguage)) {
          return new Promise((_res, rej) =>
            opts.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))),
          );
        }
        return Promise.resolve<TranslatorLike>({
          inputQuota: Infinity,
          translate: async (s, o) => {
            if (o?.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
            fake.calls.push(s);
            if (cfg.delayMs) await sleep(cfg.delayMs);
            return (cfg.translate ?? wrap)(s);
          },
          destroy() {},
        });
      },
    };
    Object.defineProperty(globalThis, 'Translator', { configurable: true, writable: true, value: factory });
    return fake;
  }
  const removeTranslator = () => {
    delete (globalThis as { Translator?: unknown }).Translator;
  };
  function fresh(cache: Iterable<[string, string, CacheRecord]> = []): CacheBackend {
    __resetEngineForTest();
    __resetMachineMenuForTest();
    __testing.reset();
    store.clear();
    const backend = memoryBackend(cache);
    __setMachineCacheForTest(new MachineCache(backend));
    return backend;
  }
  const rec = (english: string, v: string | null): CacheRecord => ({ h: entryHash(ENGINE_VERSION, english), v, at: 1 });

  check('the hash moves with the English and with the engine version, and only with them',
    entryHash(ENGINE_VERSION, 'Close') === entryHash(ENGINE_VERSION, 'Close') &&
      entryHash(ENGINE_VERSION, 'Close') !== entryHash(ENGINE_VERSION, 'Close ') &&
      entryHash(ENGINE_VERSION, 'Close') !== entryHash(`${ENGINE_VERSION}+`, 'Close'));

  // 5a — a later session with the translator ready: the cache shows at once, stale entries don't.
  const failedNow = 'common.locked.feature';
  const failedOld = 'settings.headings.planets';
  const backend = fresh([
    ['fr', 'common.close', rec('Close', 'FERMER (cache)')],
    ['fr', 'common.cancel', rec('Cancel (an older English)', 'STALE')],
    ['fr', failedNow, rec(resolvePath(composeEnglish(), failedNow)!, null)],
    ['fr', failedOld, rec('Planets (older)', null)],
  ]);
  const fake = installTranslator({ availability: 'available' });
  store.set('astro:locale:v2', 'mt:fr');
  await initI18n();
  check('a stored device language with a cache comes up in it at boot', getI18n().locale === 'mt:fr' && getI18n().lang === 'fr', getI18n().locale);
  check('…from the cache, before anything is translated', tStatic('common.close') === 'FERMER (cache)' && isTranslated('common.close'), tStatic('common.close'));
  check('…but never a cached translation of an older English', tStatic('common.cancel') === 'Cancel' && !isTranslated('common.cancel'), tStatic('common.cancel'));
  await __whenIdleForTest();
  check('the sweep re-translated the stale entry and the stale failure', fake.calls.includes('Cancel') && fake.calls.includes('Planets'), `${fake.calls.length} calls`);
  check('…and did not re-translate the fresh entry or retry the fresh failure',
    !fake.calls.includes('Close') && !fake.calls.includes(mask(resolvePath(composeEnglish(), failedNow)!).lines[0].text));
  check('after the sweep the stale key reads its new translation', tStatic('common.cancel') === '«Cancel»', tStatic('common.cancel'));
  const stored = await backend.loadAll('fr');
  check('…and the cache now holds it under the current hash', stored.get('common.cancel')?.h === entryHash(ENGINE_VERSION, 'Cancel') && stored.get('common.cancel')?.v === '«Cancel»');
  {
    // The tier's own sentences (ownStrings.ts): written, never sent, never cached.
    const ownEn = leaves(composeEnglish()).filter(([k]) => isOwnKey(k));
    const sentForm = new Set(ownEn.flatMap(([, s]) => mask(s).lines.map((l) => l.text)));
    check('the tier’s own sentences never reach the translator', ownEn.length > 0 && !fake.calls.some((c) => sentForm.has(c)),
      fake.calls.filter((c) => sentForm.has(c)).slice(0, 3).join(' | '));
    check('…they read as written for the language — the disclosure first',
      tStatic('settings.machine.disclosure') === OWN_STRINGS.fr?.['settings.machine.disclosure'] && isTranslated('settings.machine.disclosure'),
      tStatic('settings.machine.disclosure'));
    check('…and none of them is cached', ownEn.every(([k]) => !stored.has(k)));
  }
  check('a document is written in English while the screen is a device translation',
    documentI18n().t('common.cancel') === 'Cancel' && getI18n().t('common.cancel') === '«Cancel»' && documentI18n().lang === 'en');
  check('a path the build excludes is never sent and stays English',
    !fake.calls.some((c) => c.startsWith('By continuing')) && !isTranslated('zzMachine.legal.text') && tStatic('zzMachine.legal.text', { terms: 'T', privacy: 'P' }).startsWith('By continuing'));
  {
    const core = resolvePath(composeEnglish(), 'creditsModal.notes.swisseph')!;
    check('…and so is a CORE path a build excludes',
      !!core && !fake.calls.includes(mask(core).lines[0].text) && !isTranslated('creditsModal.notes.swisseph') && tStatic('creditsModal.notes.swisseph') === core);
  }
  check('a marker title keeps one pair of braces round its translated word', tStatic('zzMachine.entries.a.title') === '«Planetary {Hours}»', tStatic('zzMachine.entries.a.title'));
  check('a fingerprint is kept as it is and counts as this language’s own', tStatic('zzMachine.entries.a.src') === 'a3f9c01e' && isTranslated('zzMachine.entries.a.src'));
  check('each line of a two-line string is translated alone', tStatic('zzMachine.multi') === '«First line.»\n«Second line.»', JSON.stringify(tStatic('zzMachine.multi')));
  check('the plan name and the product name are handed back as written', tStatic('zzMachine.plan', { feature: 'X' }) === '«Upgrade to Pro to see X on AstroLina.»', tStatic('zzMachine.plan', { feature: 'X' }));
  {
    const pluralKey = leaves(composeEnglish()).find(([, s]) => blocksIn(s) === 1 && /#/.test(s))?.[0];
    const one = pluralKey ? tStatic(pluralKey, varsFor(resolvePath(composeEnglish(), pluralKey)!, 1)) : '';
    const five = pluralKey ? tStatic(pluralKey, varsFor(resolvePath(composeEnglish(), pluralKey)!, 5)) : '';
    check(`a core plural (${pluralKey}) reads its device forms, with the count`, !!pluralKey && isTranslated(pluralKey) && one.includes('«') && five.includes('5'), `${one} / ${five}`);
  }

  // 5b — the hold (rule 2): the stored and the effective language must DISAGREE.
  fresh();
  removeTranslator();
  store.set('astro:locale:v2', 'mt:fr');
  await initI18n();
  const held = getI18n();
  check('no translator and nothing cached: the choice is HELD — stored, not shown',
    held.pref === 'mt:fr' && held.locale === 'en' && held.pref !== held.locale && store.get('astro:locale:v2') === 'mt:fr', `${held.locale} / ${held.pref}`);
  check('…with its reason for the row and the notice', held.machineHold?.id === 'mt:fr' && held.machineHold.reason === 'unsupported', JSON.stringify(held.machineHold));
  check('…and boot wrote nothing', store.size === 1);
  {
    // Rule 2: the menu marks the language shown in the held one's place (the derived value), and
    // reports a click on that marked row like any other — storing it would overwrite the real
    // choice with its stand-in. The stored and the shown must still DISAGREE afterwards.
    check('held: a re-pick of the marked row is refused, and of any other row is not',
      isHeldRepick(held.locale) && !isHeldRepick('es') && !isHeldRepick('mt:fr'), held.locale);
    // The Language menu's own path, as its onChange runs it.
    const menuPick = async (code: string) => {
      if (isHeldRepick(code)) return;
      await getI18n().setLocale(code as LocaleId);
    };
    await menuPick(held.locale);
    check('…so re-picking it writes nothing: the stored choice and the hold both stand',
      store.get('astro:locale:v2') === 'mt:fr' && getI18n().pref === 'mt:fr' && getI18n().locale === 'en' && getI18n().machineHold?.id === 'mt:fr',
      `${store.get('astro:locale:v2')} ${getI18n().pref} ${JSON.stringify(getI18n().machineHold)}`);
    const sidebar = readFileSync(resolve(process.cwd(), 'src/components/Sidebar/Sidebar.tsx'), 'utf8');
    const menu = sidebar.slice(sidebar.indexOf('function LanguageMenu('));
    const onChange = menu.slice(menu.indexOf('onChange={'), menu.indexOf('onOpen={'));
    check('…and the Language menu’s onChange refuses it before choosing anything',
      onChange.length > 0 && /if \(isHeldRepick\(code\)\) return;[\s\S]*chooseMachineLanguage[\s\S]*setLocale/.test(onChange));
  }
  await held.setLocale('es');
  check('a new choice ends the hold', getI18n().machineHold === null);
  check('…and once nothing is held, nothing is refused', !isHeldRepick(getI18n().locale));

  fresh([['fr', 'common.close', rec('Close', 'FERMER (cache)')]]);
  removeTranslator();
  store.set('astro:locale:v2', 'mt:fr');
  await initI18n();
  check('no translator but a cache: shown from the cache, the menu says so',
    getI18n().locale === 'mt:fr' && tStatic('common.close') === 'FERMER (cache)' && getMachineMenu().session?.mode === 'cache', `${getI18n().locale} ${getMachineMenu().session?.mode}`);

  fresh();
  installTranslator({ availability: 'downloadable' });
  store.set('astro:locale:v2', 'mt:fr');
  await initI18n();
  check('the model to download again and nothing cached: held until a tap', getI18n().locale === 'en' && getI18n().machineHold?.reason === 'needs-download');

  fresh([['fr', 'common.close', rec('Close', 'FERMER (cache)')]]);
  installTranslator({ availability: 'downloadable' });
  store.set('astro:locale:v2', 'mt:fr');
  await initI18n();
  check('…with a cache: shown from it, "partial"', getI18n().locale === 'mt:fr' && getMachineMenu().session?.mode === 'partial');

  // 5c — a pick: create() inside the click, on-screen keys first, then the switch.
  fresh();
  const pick = installTranslator({ availability: 'downloadable' });
  await initI18n();
  const ON_SCREEN = ['common.close', 'common.cancel', 'settings.headings.language'];
  for (const k of ON_SCREEN) tStatic(k);
  noteNamespaceRead('zzMachine');
  inCall = true;
  const picked = chooseMachineLanguage('it');
  inCall = false;
  check('Translator.create() is called synchronously, inside the click', pick.creates.length === 1 && pick.creates[0].sync && pick.creates[0].lang === 'it');
  check('…and the menu shows the download at once', getMachineMenu().pick?.lang === 'it' && getMachineMenu().pick?.phase === 'download');
  await picked;
  check('the pick switches once what is on screen is translated: stored, shown, declared',
    getI18n().locale === 'mt:it' && store.get('astro:locale:v2') === 'mt:it' && getI18n().lang === 'it' && tStatic('common.close') === '«Close»');
  check('…with the disclosure as written for the language from the first moment it is shown',
    tStatic('settings.machine.disclosure') === OWN_STRINGS.it?.['settings.machine.disclosure'], tStatic('settings.machine.disclosure'));
  {
    const onScreenTexts = new Set<string>();
    for (const k of ON_SCREEN) onScreenTexts.add(mask(resolvePath(composeEnglish(), k)!).lines[0].text);
    for (const [key, s] of leaves((composeEnglish() as Record<string, unknown>).zzMachine, 'zzMachine')) {
      for (const l of mask(s, { marker: isMarkerPath(key) }).lines) if (l.translate) onScreenTexts.add(l.text);
    }
    const firstOther = pick.calls.findIndex((c) => !onScreenTexts.has(c));
    const lastOnScreen = Math.max(...[...onScreenTexts].map((t) => pick.calls.indexOf(t)));
    check('keys asked for on screen — t() and a namespace read whole — go before the sweep', firstOther > 0 && lastOnScreen < firstOther, `last on-screen ${lastOnScreen}, first other ${firstOther}`);
  }
  await __whenIdleForTest();

  // 5d — choosing another language aborts a pick still under way.
  fresh();
  const hang = installTranslator({ availability: 'downloadable', hang: (l) => l === 'fr' });
  await initI18n();
  void chooseMachineLanguage('fr');
  await sleep(5);
  await getI18n().setLocale('en');
  await sleep(5);
  check('choosing English aborts the download under way, and nothing switches later',
    hang.creates[0]?.signal?.aborted === true && getI18n().locale === 'en' && store.get('astro:locale:v2') === 'en' && getMachineMenu().pick === null,
    `${hang.creates[0]?.signal?.aborted} ${getI18n().locale} ${JSON.stringify(getMachineMenu().pick)}`);
  void chooseMachineLanguage('fr');
  const second = chooseMachineLanguage('it');
  await second;
  check('choosing another device row aborts the first and lands on the second',
    hang.creates[1]?.signal?.aborted === true && getI18n().locale === 'mt:it', `${hang.creates[1]?.signal?.aborted} ${getI18n().locale}`);
  await __whenIdleForTest();

  // 5e — pacing: while keys on screen are being translated, at most one re-render per 1.5 s.
  fresh();
  installTranslator({ availability: 'available', delayMs: 1 });
  await initI18n();
  await chooseMachineLanguage('fr');
  const late = leaves(composeEnglish()).filter(([, s]) => blocksIn(s) === 0).slice(-400).map(([k]) => k);
  const commits: number[] = [];
  const off = subscribeI18n(() => commits.push(Date.now()));
  let asking = true;
  void (async () => {
    for (let i = 0; asking && i < late.length; i += 1) {
      tStatic(late[i]);
      await sleep(40);
    }
  })();
  await __whenIdleForTest();
  asking = false;
  off();
  const gaps = commits.slice(1).map((t, i) => t - commits[i]);
  // The last re-render is the sweep's end, which may follow the one before it sooner.
  const paced = gaps.slice(0, -1);
  check(`re-renders while on-screen keys arrive are ${PUBLISH_EVERY_MS} ms apart or more`, paced.length >= 2 && paced.every((g) => g >= PUBLISH_EVERY_MS - 60), `${commits.length} re-renders, gaps ${gaps.join(', ')} ms`);

  // 5f — a translator that THROWS says nothing about the key: English for now, never stored —
  // while a quota error (the same answer next time) is stored as the key's failure.
  {
    const backendF = fresh([['fr', 'common.close', rec('Close', 'FERMER (cache)')]]);
    const fakeF = installTranslator({
      availability: 'available',
      translate: (s) => {
        if (s === 'Cancel') throw new Error('busy');
        if (s === 'Planets') throw Object.assign(new Error('too long'), { name: 'QuotaExceededError' });
        return wrap(s);
      },
    });
    store.set('astro:locale:v2', 'mt:fr');
    await initI18n();
    await __whenIdleForTest();
    const storedF = await backendF.loadAll('fr');
    check('a translator that threw on a key: English for it this session, and nothing stored for it',
      fakeF.calls.includes('Cancel') && tStatic('common.cancel') === 'Cancel' && !storedF.has('common.cancel'),
      `${tStatic('common.cancel')} ${JSON.stringify(storedF.get('common.cancel'))}`);
    check('…while a quota error is stored as the key’s failure', fakeF.calls.includes('Planets') && storedF.get('settings.headings.planets')?.v === null,
      JSON.stringify(storedF.get('settings.headings.planets')));
    check('…and exceptions among successes don’t stop the session: the sweep finished',
      __sessionForTest()?.broken === false && storedF.size > 200 && tStatic('common.close') === 'FERMER (cache)', `${storedF.size} stored`);
  }

  // 5g–5h expect the engine to warn (a broken translator, a stalled cache): those warnings are
  // the behaviour under test, not news, so they are kept off the report.
  const warn = console.warn;
  console.warn = () => {};
  // 5g — five exceptions in a row: the translator is broken. The loop stops, nothing of it is
  // stored, the menu says so as a failed pick does, and choosing the row again starts afresh.
  {
    const backendG = fresh([['fr', 'common.close', rec('Close', 'FERMER (cache)')]]);
    const fakeG = installTranslator({
      availability: 'available',
      translate: () => {
        throw new Error('crashed');
      },
    });
    store.set('astro:locale:v2', 'mt:fr');
    await initI18n();
    await __whenIdleForTest();
    const sG = __sessionForTest();
    check(`${MAX_CONSECUTIVE_ERRORS} exceptions in a row stop the loop — and it asks nothing more`,
      sG?.broken === true && sG.running === false && fakeG.calls.length === MAX_CONSECUTIVE_ERRORS, `${fakeG.calls.length} calls, ${JSON.stringify(sG)}`);
    check('…nothing is stored for any of them', (await backendG.loadAll('fr')).size === 1);
    check('…the menu says the language couldn’t be set up, and its row is live again',
      getMachineMenu().pick?.phase === 'failed' && getMachineMenu().pick?.lang === 'fr' && getMachineMenu().session?.mode === 'partial',
      JSON.stringify(getMachineMenu()));
    check('…and the language stays on screen from what it has', getI18n().locale === 'mt:fr' && tStatic('common.close') === 'FERMER (cache)');
    const retry = installTranslator({ availability: 'available' });
    await chooseMachineLanguage('fr');
    await __whenIdleForTest();
    check('choosing the row again brings a fresh translator, which retries every key the broken one threw on',
      fakeG.calls.every((c) => retry.calls.includes(c)) && __sessionForTest()?.broken === false &&
        getMachineMenu().session?.mode === 'live' && getMachineMenu().pick === null,
      `${retry.calls.length} calls, ${JSON.stringify(getMachineMenu().pick)}`);

    // A pick whose translator throws on what is on screen fails instead of switching.
    fresh();
    installTranslator({
      availability: 'downloadable',
      translate: () => {
        throw new Error('crashed');
      },
    });
    await initI18n();
    for (const k of ['common.close', 'common.cancel', 'settings.headings.language']) tStatic(k);
    noteNamespaceRead('zzMachine');
    await chooseMachineLanguage('it');
    check('a pick whose translator keeps throwing fails: nothing switches, nothing is stored, the menu says so',
      getI18n().locale === 'en' && store.get('astro:locale:v2') === undefined && getMachineMenu().pick?.phase === 'failed' &&
        getMachineMenu().pick?.lang === 'it' && __sessionForTest() === null && currentMachineSession() === null,
      `${getI18n().locale} ${JSON.stringify(getMachineMenu().pick)}`);
  }

  // 5h — a cache that stalls (IndexedDB can hang without failing): bounded, then memory.
  {
    const stalled: CacheBackend = {
      loadAll: () => new Promise(() => {}),
      loadFree: () => new Promise(() => {}),
      putAll: () => new Promise(() => {}),
    };
    const slow = new MachineCache(stalled, { loadTimeoutMs: 40 });
    const t0 = Date.now();
    const got = await slow.load('fr');
    check('a cache read that stalls gives up at its bound: empty, and the cache runs in memory from then',
      got.size === 0 && slow.memoryOnly && Date.now() - t0 < 1000, `${Date.now() - t0} ms`);
    check('…the bound in the app is about two and a half seconds', CACHE_LOAD_TIMEOUT_MS === 2500);
    fresh();
    __setMachineCacheForTest(new MachineCache(stalled, { loadTimeoutMs: 40 }));
    installTranslator({ availability: 'downloadable' });
    await initI18n();
    await chooseMachineLanguage('it');
    check('…a pick over a stalled cache still lands', getI18n().locale === 'mt:it' && store.get('astro:locale:v2') === 'mt:it', getI18n().locale);
    fresh();
    __setMachineCacheForTest(new MachineCache(stalled, { loadTimeoutMs: 40 }));
    removeTranslator();
    store.set('astro:locale:v2', 'mt:fr');
    await initI18n();
    check('…a resume over a stalled cache with no translator holds the choice', getI18n().locale === 'en' && getI18n().machineHold?.id === 'mt:fr');
    fresh();
    __setMachineCacheForTest(new MachineCache(stalled, { loadTimeoutMs: 40 }));
    installTranslator({ availability: 'available' });
    store.set('astro:locale:v2', 'mt:fr');
    await initI18n();
    check('…and with a translator ready, shows the language from it', getI18n().locale === 'mt:fr' && getI18n().machineHold === null);
  }

  console.warn = warn;

  // 5i — the re-tap that finishes a download: its handle is the pick's AND the session's.
  {
    fresh([['fr', 'common.close', rec('Close', 'FERMER (cache)')]]);
    const hangR = installTranslator({ availability: 'downloadable', hang: (l) => l === 'fr' });
    store.set('astro:locale:v2', 'mt:fr');
    await initI18n();
    void chooseMachineLanguage('fr');
    await sleep(5);
    check('a re-tap of the language on screen is under way', getMachineMenu().pick?.lang === 'fr' && hangR.creates.length === 1 && getMachineMenu().session?.mode === 'partial');
    await getI18n().setLocale('en');
    await sleep(5);
    check('leaving the language during a re-tap aborts its download too, and its line goes',
      hangR.creates[0]?.signal?.aborted === true && getMachineMenu().pick === null,
      `${hangR.creates[0]?.signal?.aborted} ${JSON.stringify(getMachineMenu().pick)}`);
    check('…and no line is left for the language left behind', getMachineMenu().session === null && getI18n().locale === 'en' && currentMachineSession() === null,
      JSON.stringify(getMachineMenu().session));
  }

  // 5j — leaving a live device language: the engine's stop sees where the store is going.
  {
    fresh();
    installTranslator({ availability: 'available' });
    await initI18n();
    await chooseMachineLanguage('fr');
    check('a device language is live', getI18n().locale === 'mt:fr' && getMachineMenu().session?.mode === 'live');
    await getI18n().setLocale('en');
    check('leaving it for English leaves no session line behind', getMachineMenu().session === null && currentMachineSession() === null,
      JSON.stringify(getMachineMenu().session));
  }

  // 5k — a pick aborted while its module loaded registers nothing.
  {
    fresh([['fr', 'common.close', rec('Close', 'FERMER (cache)')]]);
    installTranslator({ availability: 'available' });
    store.set('astro:locale:v2', 'mt:fr');
    await initI18n();
    const handle = currentMachineSession();
    const ctrl = new AbortController();
    ctrl.abort();
    updateMachineMenu({ pick: { lang: 'it', phase: 'download', loaded: null } });
    await runPick('it', Promise.resolve(identity), ctrl);
    check('a pick aborted before it began leaves the session on screen untouched, and its line goes',
      handle !== null && currentMachineSession() === handle && getI18n().locale === 'mt:fr' && __sessionForTest()?.lang === 'fr' && getMachineMenu().pick === null);
  }

  // 5l — a language with no written own sentences: English for them, still never the translator's.
  {
    fresh();
    const eo = installTranslator({ availability: 'available' });
    await initI18n();
    tStatic('settings.machine.disclosure');
    await chooseMachineLanguage('eo');
    const disclosure = resolvePath(composeEnglish(), 'settings.machine.disclosure')!;
    check('a language with no written own sentences shows them in English — never the translator’s',
      !OWN_STRINGS.eo && getI18n().locale === 'mt:eo' && tStatic('settings.machine.disclosure') === disclosure && !eo.calls.includes(mask(disclosure).lines[0].text),
      tStatic('settings.machine.disclosure'));
  }

  // 5m — a pick's line, as the menu owns it (machineMenu, 2026-10-10). A language the device has
  // ready opens translating and ignores progress events; one that downloads shows them — the
  // pair, so a guard that swallowed every event can't pass the first check alone.
  {
    fresh();
    const ready = installTranslator({ availability: 'available', hang: (l) => l === 'fr' });
    await initI18n();
    await refreshMachineAvailability();
    void chooseMachineLanguage('fr');
    ready.monitors[0]?.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded: 0.25, total: 1 }));
    check('a language the device has ready: its pick opens translating, and a progress event doesn’t turn it into a download',
      getMachineMenu().pick?.lang === 'fr' && getMachineMenu().pick?.phase === 'translate' && ready.monitors.length === 1, JSON.stringify(getMachineMenu().pick));
    await getI18n().setLocale('en');
    await __whenIdleForTest();

    fresh();
    const dl = installTranslator({ availability: 'downloadable', hang: (l) => l === 'fr' });
    await initI18n();
    await refreshMachineAvailability();
    void chooseMachineLanguage('fr');
    dl.monitors[0]?.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded: 0.25, total: 1 }));
    check('…while one that downloads shows its progress',
      getMachineMenu().pick?.phase === 'download' && getMachineMenu().pick?.loaded === 0.25, JSON.stringify(getMachineMenu().pick));
    // Left before the engine's module has even run: the line goes with the abort itself, so a
    // module that then fails to load can't leave "Downloading…" up for work that has stopped.
    void getI18n().setLocale('en');
    check('…and leaving before the engine has started clears its line at once',
      dl.creates[0]?.signal?.aborted === true && getMachineMenu().pick === null, JSON.stringify(getMachineMenu().pick));
    await sleep(5);
    await __whenIdleForTest();
  }

  // 5n — the tier's own sentences against an English edited AFTER they were written: the written
  // text is refused end to end (English shows), and the translator still never sees the key.
  {
    const edited = 'Machine-translated on this device (an English edited since).';
    registerMessages({ overrides: { 'settings.machine.disclosure': edited } });
    fresh();
    const ed = installTranslator({ availability: 'available' });
    await initI18n();
    tStatic('settings.machine.disclosure');
    await chooseMachineLanguage('fr');
    check('a written sentence whose English was edited since shows the English through the engine — never the stale text, never the translator’s',
      getI18n().locale === 'mt:fr' && tStatic('settings.machine.disclosure') === edited && !ed.calls.some((c) => c.includes('English edited since')),
      tStatic('settings.machine.disclosure'));
    check('…while an own sentence whose English is unchanged still shows as written',
      tStatic('settings.machine.section') === OWN_STRINGS.fr?.['settings.machine.section'], tStatic('settings.machine.section'));
    await __whenIdleForTest();
  }
  __resetEngineForTest();
  __resetRegistryForTest();
}

// ── §6 the engine version, first-letter capitals, the tier's own sentences ───
section('§6 the engine version, first-letter capitals, the tier’s own sentences — INTERNAL IDENTITY, then OUTSIDE AGREEMENT');
{
  // The version must move with everything a cached translation depends on. Named here from the
  // live sources, so dropping one from engineIngredients fails the first check, and the second
  // requires each one to reach the hash.
  const named: unknown[] = [JSON.stringify(PROTECTED_TERMS), GLYPH_RUN.source, SENTINEL_OPEN, SENTINEL_CLOSE, MIN_RATIO, MAX_RATIO, STRAY_CHARS.join(''), WIDE.source];
  check('ENGINE_VERSION folds in the protected terms, the glyph pattern, the sentinel and the validation rules',
    JSON.stringify(engineIngredients()) === JSON.stringify(named) && ENGINE_VERSION === engineVersionOf(ENGINE_REVISION, named));
  await every('moving any one of them moves the version, and with it every entry’s hash', named.map((_, i) => i), (i) => {
    const moved = [...named];
    moved[i] = typeof moved[i] === 'number' ? (moved[i] as number) + 0.01 : `${String(moved[i])}x`;
    const v = engineVersionOf(ENGINE_REVISION, moved);
    return v !== ENGINE_VERSION && entryHash(v, 'Close') !== entryHash(ENGINE_VERSION, 'Close') ? null : `ingredient ${i} did not move it`;
  });
  check('…and so does the revision', engineVersionOf(`${ENGINE_REVISION}+`, named) !== ENGINE_VERSION);
  // THE PIN. Any change above retranslates every reader's cache, by design — this makes it a
  // decision rather than a side effect: when it fails, check the change was meant, then copy
  // the new value here.
  const PINNED = 'mt-3 2026-10-10 751aad4e'; // mt-3: the capital rule skips leading punctuation (engine.ts)
  check(`ENGINE_VERSION is pinned — a change retranslates every cache; update the pin knowingly`, ENGINE_VERSION === PINNED, ENGINE_VERSION);

  // Capitals (mask capitaliseLike): where the English starts with one and the translation with a
  // lowercase letter of a cased script — in the language's rules; scripts without case untouched.
  const CAPS: [string, string, string, string][] = [
    ['Close', 'fermer', 'fr', 'Fermer'],
    ['Close', 'chiudi', 'it', 'Chiudi'],
    ['Close', 'закрити', 'uk', 'Закрити'],
    ['Close', 'đóng', 'vi', 'Đóng'],
    ['Close', 'κλείσιμο', 'el', 'Κλείσιμο'],
    ['Open', 'άνοιγμα', 'el', 'Άνοιγμα'], // a sentence's capital keeps its accent
    ['Info', 'istanbul', 'tr', 'İstanbul'], // the language's own rule
    ['close', 'fermer', 'fr', 'fermer'], // the English has no capital
    ['Close', 'Fermer', 'fr', 'Fermer'],
    // Leading spaces, punctuation and symbols are skipped to the first letter on both sides
    // (2026-10-10: a build's "+ …" labels were left lower case when only the first code point
    // was compared) — but never past a sentinel, so a line opening with a token is untouched.
    ['Close', '«fermer»', 'fr', '«Fermer»'],
    ['+ Text', '+ texte', 'fr', '+ Texte'],
    ['— Note', '— remarque', 'fr', '— Remarque'],
    ['Close', '[1] fermer', 'fr', '[1] fermer'],
    ['{n} charts', 'graphiques', 'fr', 'graphiques'],
    ['Close', '閉じる', 'ja', '閉じる'],
    ['Close', '닫기', 'ko', '닫기'],
    ['Close', '关闭', 'zh', '关闭'],
    ['Close', 'ปิด', 'th', 'ปิด'],
    ['Close', 'बंद करें', 'hi', 'बंद करें'],
    ['Close', 'დახურვა', 'ka', 'დახურვა'], // cased in Unicode, not in prose
  ];
  await every('a capital where the English has one, in the language’s rules; scripts without case untouched', CAPS, ([src, tr, lang, want]) => {
    const got = capitaliseLike(src, tr, lang);
    return got === want ? null : `${lang} "${tr}" → "${got}", want "${want}"`;
  });
  const lower = fakeTranslator((s) => s.toLowerCase());
  const drag = await translateTemplate(lower, 'Drag {from} onto the MC line', 'x', 'fr', signal);
  check('through the engine: the first letter capitalised back, the tokens as they were', drag === 'Drag {from} onto the MC line', String(drag));
  const twoLines = await translateTemplate(lower, 'First line.\nsecond line.', 'x', 'fr', signal);
  check('…each line by its own English', twoLines === 'First line.\nsecond line.', JSON.stringify(twoLines));
  const tokenFirst = await translateTemplate(fakeTranslator((s) => s.replace(/^Flags by (\[\d+\])$/, '$1 drapeaux')), 'Flags by circle-flags', 'x', 'fr', signal);
  check('…and a translation that starts with a protected term leaves the term as written', tokenFirst === 'circle-flags drapeaux', String(tokenFirst));

  // The tier's own sentences against the catalog — two parts written apart, required to agree.
  const en = composeEnglish();
  const ownKeys = leaves(en).filter(([k]) => isOwnKey(k));
  await every('every own key’s English is the English its written translations were made from', ownKeys, ([k, s]) =>
    OWN_STRINGS_SOURCE[k] === s ? null : `${k}: catalog ${JSON.stringify(s)} vs ${JSON.stringify(OWN_STRINGS_SOURCE[k])}`,
  );
  check('…and every written English is an own key the catalog has', Object.keys(OWN_STRINGS_SOURCE).every((k) => isOwnKey(k) && resolvePath(en, k) !== undefined));
  const written = Object.entries(OWN_STRINGS).flatMap(([lang, m]) => Object.entries(m).map(([k, v]) => [lang, k, v] as const));
  await every('every written translation keeps its English’s placeholders', written, ([lang, k, v]) => {
    const src = resolvePath(en, k);
    if (src === undefined || !isOwnKey(k)) return `${lang} ${k}: not an own key in the catalog`;
    return samePlaceholders(v, src) && ownText(lang, k, src) === v ? null : `${lang} ${k}: placeholders`;
  });
  await every('every device-language candidate has every own sentence written', MACHINE_CANDIDATES, (c) => {
    const missing = ownKeys.filter(([k]) => !OWN_STRINGS[c.lang]?.[k]).map(([k]) => k);
    return missing.length ? `${c.lang}: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}` : null;
  });
  // Carried over from ownStrings.ts's own check (2026-10-10): exactly the candidates, no more; each
  // placeholder once and nothing brace- or tag-like besides (some strings reach setHTML); no
  // browser or vendor named (the copy says "on this device").
  const candidateSet = MACHINE_CANDIDATES.map((c) => c.lang).sort().join(',');
  check('the written languages are exactly the device-language candidates', Object.keys(OWN_STRINGS).sort().join(',') === candidateSet,
    Object.keys(OWN_STRINGS).filter((l) => !MACHINE_CANDIDATES.some((c) => c.lang === l)).join(', '));
  const VENDORS = /chrome|chromium|google|\bedge\b|microsoft|apple|safari|firefox|mozilla|gemini|bing|opera|brave/i;
  await every('every written translation has each placeholder once, no stray brace or angle bracket, and names no browser or vendor', written, ([lang, k, v]) => {
    const src = resolvePath(en, k) ?? '';
    for (const name of placeholderNames(src)) if (v.split(`{${name}}`).length !== 2) return `${lang} ${k}: {${name}} not exactly once`;
    if (/[{}<>]/.test(v.replace(/\{[A-Za-z_][A-Za-z0-9_]*\}/g, ''))) return `${lang} ${k}: a stray brace or angle bracket`;
    return VENDORS.test(v) ? `${lang} ${k}: names a browser or vendor` : null;
  });
  // The percent sign where Intl writes it in each language: two parts written apart, agreeing.
  await every('the download line places its percent sign as Intl.NumberFormat does in each language', MACHINE_CANDIDATES, (c) => {
    const shape = new Intl.NumberFormat(c.lang, { style: 'percent' }).format(0.42).replace('42', '{percent}');
    return OWN_STRINGS[c.lang]?.['settings.machine.downloading']?.includes(shape) ? null : `${c.lang}: lacks ${JSON.stringify(shape)}`;
  });
  const disclosure = resolvePath(en, 'settings.machine.disclosure')!;
  check('a written sentence whose English has moved since is refused (English shows)',
    ownText('fr', 'settings.machine.disclosure', `${disclosure} `) === null && ownText('fr', 'settings.machine.disclosure', disclosure) === OWN_STRINGS.fr?.['settings.machine.disclosure']);
}

// ── §7 a build's own text through the device — INTERNAL IDENTITY ─────────────
// translateOnDevice (machine/onDevice.ts → engine translateFree, 2026-10-10): longer text a build
// renders itself, through the tier's own masking, checks, cache and translator. Each "absent" check
// is paired with one where something gets THROUGH, and the scheduling checks drive the translator
// a call at a time, so they read what the engine asks for NEXT rather than what it asked in all.
section('§7 a build’s own text: masked, checked, cached, scheduled, abortable, refused off a device language — INTERNAL IDENTITY');
{
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: ['en-US'], language: 'en-US' } });
  Object.defineProperty(globalThis, 'self', { configurable: true, value: globalThis });

  const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
  const tick = () => new Promise<void>((r) => setImmediate(r));
  async function until(ok: () => boolean, tries = 20_000): Promise<boolean> {
    for (let i = 0; i < tries && !ok(); i += 1) await tick();
    return ok();
  }
  const sameMap = (a: Map<string, string>, b: Map<string, string>) =>
    a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
  /** What reaches the translator for a passage: its masked lines. */
  const sentOf = (text: string) => mask(text).lines.filter((l) => l.translate).map((l) => l.text);

  /** A device translator the checks drive: every call recorded; answered at once, or — `manual` —
   *  held until released, so a check can see which call the engine makes next. It rejects when its
   *  signal aborts, as a real one does, so a stopped session never waits on it. */
  interface Driven {
    calls: string[];
    creates: number;
    pending: (() => void)[];
    manual: boolean;
    release(): void;
    auto(): void;
  }
  function installDriven(cfg: { translate?: (s: string) => string; quota?: number; manual?: boolean; createDelayMs?: number } = {}): Driven {
    const d: Driven = {
      calls: [],
      creates: 0,
      pending: [],
      manual: cfg.manual ?? false,
      release() {
        d.pending.shift()?.();
      },
      auto() {
        d.manual = false;
        while (d.pending.length) d.pending.shift()!();
      },
    };
    const tr: TranslatorLike = {
      inputQuota: cfg.quota ?? Infinity,
      measureInputUsage: async (s) => s.length,
      translate: (s, o) =>
        new Promise<string>((resolveCall, rejectCall) => {
          if (o?.signal?.aborted) {
            rejectCall(abortError());
            return;
          }
          d.calls.push(s);
          o?.signal?.addEventListener('abort', () => rejectCall(abortError()), { once: true });
          const answer = () => {
            try {
              resolveCall((cfg.translate ?? wrap)(s));
            } catch (err) {
              rejectCall(err);
            }
          };
          if (d.manual) d.pending.push(answer);
          else answer();
        }),
      destroy() {},
    };
    const factory: TranslatorFactory = {
      availability: async () => 'available',
      create: async () => {
        d.creates += 1;
        if (cfg.createDelayMs) await sleep(cfg.createDelayMs);
        return tr;
      },
    };
    Object.defineProperty(globalThis, 'Translator', { configurable: true, writable: true, value: factory });
    return d;
  }
  const removeTranslator = () => {
    delete (globalThis as { Translator?: unknown }).Translator;
  };
  function fresh(backend: CacheBackend = memoryBackend()): CacheBackend {
    __resetEngineForTest();
    __resetMachineMenuForTest();
    __testing.reset();
    store.clear();
    __setMachineCacheForTest(new MachineCache(backend));
    return backend;
  }
  /** French on screen with its translator attached — boot resuming a stored device language. */
  async function live(): Promise<void> {
    store.set('astro:locale:v2', 'mt:fr');
    await initI18n();
    await until(() => __sessionForTest()?.translator === true);
  }

  // 7a — refused off a device language: nothing translated, the translator never touched.
  {
    fresh();
    const d = installDriven();
    await initI18n();
    const got = await translateOnDevice([{ cacheKey: 'zz:a', text: 'A passage of a build’s own.' }]);
    check('in English: canTranslateOnDevice() is false, and translateOnDevice answers nothing without touching the translator',
      getI18n().locale === 'en' && !canTranslateOnDevice() && got.size === 0 && d.creates === 0 && d.calls.length === 0,
      `${getI18n().locale} ${got.size} ${d.creates}/${d.calls.length}`);
    await __testing.activate('qps');
    const got2 = await translateOnDevice([{ cacheKey: 'zz:a', text: 'A passage of a build’s own.' }]);
    check('…nor in a language that is not a device translation (the pseudo-locale)',
      getI18n().locale === 'qps' && !canTranslateOnDevice() && got2.size === 0 && d.creates === 0 && d.calls.length === 0);
  }

  // 7b — the round trip: masked, translated, checked, put back.
  const ITEMS: OnDeviceItem[] = [
    { cacheKey: 'zz:plain', text: 'Lines on the map show where each planet is angular.' },
    { cacheKey: 'zz:tokens', text: 'Open {name} at astrolina.org, then write to hello@astrolina.org.' },
    { cacheKey: 'zz:lines', text: 'First line.\nSecond line.' },
  ];
  const backend = fresh();
  const d = installDriven();
  await live();
  check('a device language on screen: canTranslateOnDevice() is true', getI18n().locale === 'mt:fr' && canTranslateOnDevice(), getI18n().locale);
  const progress: [number, number][] = [];
  const got = await translateOnDevice(ITEMS, { onProgress: (n, total) => progress.push([n, total]) });
  check('each passage comes back translated, under its own key', got.get('zz:plain') === `«${ITEMS[0].text}»`, String(got.get('zz:plain')));
  check('…its placeholder, web address and email address as written, and never shown to the translator',
    got.get('zz:tokens') === `«${ITEMS[1].text}»` && !d.calls.some((c) => c.includes('{name}') || c.includes('astrolina.org')),
    String(got.get('zz:tokens')));
  check('…each of its lines translated alone', got.get('zz:lines') === '«First line.»\n«Second line.»', JSON.stringify(got.get('zz:lines')));
  check('…and its progress counted to the end', progress.length > 0 && progress[progress.length - 1][0] === 3 && progress.every(([, t]) => t === 3), JSON.stringify(progress));
  {
    // The sweep shares the translator and goes on meanwhile, so what is compared is what was sent
    // for THESE passages, not how many calls there were.
    const sent = ITEMS.flatMap((it) => sentOf(it.text));
    const before = d.calls.length;
    const second = await translateOnDevice(ITEMS);
    check('asked again in the same session: the same answers, and none of them sent to the translator again',
      sent.length > 0 && sent.every((t) => d.calls.includes(t)) && !d.calls.slice(before).some((c) => sent.includes(c)) && sameMap(second, got));
  }
  // A later visit over the same store.
  fresh(backend);
  const d2 = installDriven();
  await live();
  {
    const later = await translateOnDevice(ITEMS);
    const sent = ITEMS.flatMap((it) => sentOf(it.text));
    check('a later session over the same store: the same answers from the cache, none of them sent to the translator again',
      sameMap(later, got) && sent.length > 0 && !d2.calls.some((c) => sent.includes(c)));
    check('…kept apart from the catalog’s records, so a language’s catalog read (boot’s) never carries them',
      !(await backend.loadAll('fr')).has('zz:plain') && (await backend.loadFree('fr', ['zz:plain'])).has('zz:plain'));
    const stored = (await backend.loadFree('fr', ['zz:plain'])).get('zz:plain');
    check('…stored under the hash of their English and the engine’s version', stored?.h === entryHash(ENGINE_VERSION, ITEMS[0].text) && stored?.v === got.get('zz:plain'));
    const moved = 'Lines on the map show where each planet rises.';
    const edited = await translateOnDevice([{ cacheKey: 'zz:plain', text: moved }]);
    check('…and a passage whose English moved under the same key is translated again', edited.get('zz:plain') === `«${moved}»` && d2.calls.includes(moved));
  }

  // 7c — an identity translator gives every passage back byte for byte, through translateOnDevice.
  {
    fresh();
    installDriven({ translate: (s) => s });
    await live();
    const sample = leaves(composeEnglish())
      .filter(([, s]) => blocksIn(s) === 0 && s.length > 0)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 300);
    const back = await translateOnDevice(sample.map(([k, s]) => ({ cacheKey: `zz:id:${k}`, text: s })));
    await every('an identity translator gives the longest catalog strings, sent as a build’s text, back byte for byte', sample, ([k, s]) =>
      back.get(`zz:id:${k}`) === s ? null : `${k}: ${JSON.stringify(back.get(`zz:id:${k}`))}`,
    );
  }

  // 7d — a translator that drops a sentinel: absent, and remembered so.
  {
    const backendD = fresh();
    const dd = installDriven({ translate: (s) => wrap(s.replace(/\[1\]/, '')) });
    await live();
    const PAIR: OnDeviceItem[] = [
      { cacheKey: 'zz:drop', text: 'Open {name} now.' },
      { cacheKey: 'zz:keep', text: 'Nothing to protect here.' },
    ];
    const g = await translateOnDevice(PAIR);
    check('a translator that drops a sentinel: that passage is absent (English shows), while one with nothing to drop gets through',
      !g.has('zz:drop') && g.get('zz:keep') === '«Nothing to protect here.»', JSON.stringify([...g]));
    const sent = PAIR.flatMap((it) => sentOf(it.text));
    const n = dd.calls.length;
    const again = await translateOnDevice(PAIR);
    await tick();
    check('…and the failure is kept as a catalog key’s is: asked again, neither is sent, still absent — and it is stored as a failure',
      sent.every((t) => dd.calls.includes(t)) && !dd.calls.slice(n).some((c) => sent.includes(c)) && !again.has('zz:drop') &&
        again.get('zz:keep') === '«Nothing to protect here.»' && (await backendD.loadFree('fr', ['zz:drop'])).get('zz:drop')?.v === null);
  }

  // 7e — the order: 'now' ahead of the queued sweep, 'background' after it. The translator is held
  // a call at a time, so each check reads the call the engine makes NEXT.
  {
    fresh();
    const st = installDriven({ manual: true });
    await live();
    await until(() => st.pending.length > 0);
    const inHandAt = st.calls.length;
    const BG = 'Asked for in the background.';
    const bgP = translateOnDevice([{ cacheKey: 'zz:bg', text: BG }], { priority: 'background' });
    const nowP = translateOnDevice([
      { cacheKey: 'zz:n1', text: 'Asked for now, first.' },
      { cacheKey: 'zz:n2', text: 'Asked for now, second.' },
    ]);
    await until(() => __sessionForTest()?.freeWaiting === 2);
    const nextCalls: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      st.release();
      await until(() => st.pending.length > 0);
      nextCalls.push(st.calls[st.calls.length - 1]);
    }
    check('a passage asked for now goes ahead of the queued sweep: the very next calls after the sweep’s key in hand',
      inHandAt === 1 && nextCalls[0] === 'Asked for now, first.' && nextCalls[1] === 'Asked for now, second.', JSON.stringify(nextCalls));
    check('…then the sweep carries on, ahead of what was asked for in the background',
      nextCalls[2] !== BG && !st.calls.includes(BG), JSON.stringify(nextCalls[2]));
    const nowGot = await nowP;
    check('…and the now call resolved with both', nowGot.get('zz:n1') === '«Asked for now, first.»' && nowGot.get('zz:n2') === '«Asked for now, second.»');
    st.auto();
    const bgGot = await bgP;
    check('the background passage went to the translator only after the sweep’s last key',
      bgGot.get('zz:bg') === `«${BG}»` && st.calls.length > 100 && st.calls.indexOf(BG) === st.calls.length - 1,
      `${st.calls.indexOf(BG)} of ${st.calls.length}`);

    // 7f — an abort, in the same session (idle now): nothing more of the call is sent.
    await __whenIdleForTest();
    st.manual = true;
    const ctrl = new AbortController();
    const ticks: number[] = [];
    const AB = ['Abort one.', 'Abort two.', 'Abort three.', 'Abort four.'].map((text, i) => ({ cacheKey: `zz:ab${i}`, text }));
    const abP = translateOnDevice(AB, { signal: ctrl.signal, onProgress: (n) => ticks.push(n) });
    await until(() => st.pending.length > 0);
    const inHand = st.calls[st.calls.length - 1];
    ctrl.abort();
    const abGot = await Promise.race([abP, sleep(2000).then(() => null)]);
    st.release();
    await __whenIdleForTest();
    check('an abort resolves the call at once, with nothing it had not finished, and its progress stops',
      abGot !== null && abGot.size === 0 && inHand === 'Abort one.' && ticks.join(',') === '0', `${inHand} ${abGot?.size} [${ticks.join(',')}]`);
    check('…and nothing more of it reaches the translator: the passage in hand finishes, the other three are never sent',
      !AB.slice(1).some((it) => st.calls.includes(it.text)) && st.pending.length === 0);
    const n = st.calls.length;
    st.auto();
    const kept = await translateOnDevice([AB[0]]);
    check('…while the passage that was with the translator is kept, for the next call that asks for it', kept.get('zz:ab0') === '«Abort one.»' && st.calls.length === n);
  }

  // 7g — text over the translator's input limit: split at sentence ends, rejoined.
  {
    fresh();
    const q = installDriven({ quota: 40 });
    await live();
    const LONG = 'The first sentence is here. The second one follows. A third.';
    const OVER = 'One single sentence that runs on far past the limit set';
    const g = await translateOnDevice([{ cacheKey: 'zz:long', text: LONG }, { cacheKey: 'zz:over', text: OVER }]);
    check('text over the translator’s input limit is split at sentence ends, each sent alone, and rejoined',
      g.get('zz:long') === '«The first sentence is here.» «The second one follows.» «A third.»' && q.calls.includes('The second one follows.') && !q.calls.includes(LONG),
      String(g.get('zz:long')));
    check('…while one sentence over the limit on its own is absent (English shows), never sent whole', !g.has('zz:over') && !q.calls.includes(OVER));
  }

  // 7h — a translator that throws on a passage says nothing about it: absent now, stored nowhere.
  {
    fresh();
    const T = 'Throws the first time.';
    let thrown = false;
    const th = installDriven({
      translate: (s) => {
        if (s === T && !thrown) {
          thrown = true;
          throw new Error('busy');
        }
        return wrap(s);
      },
    });
    await live();
    const first = await translateOnDevice([{ cacheKey: 'zz:th', text: T }]);
    const second = await translateOnDevice([{ cacheKey: 'zz:th', text: T }]);
    check('a translator that throws on a passage: absent from that answer and stored nowhere — asked again, it is translated',
      !first.has('zz:th') && second.get('zz:th') === `«${T}»` && th.calls.filter((c) => c === T).length === 2);
  }

  // 7i — a translator still being created (boot's resume): a passage asked for meanwhile waits.
  {
    fresh();
    installDriven({ createDelayMs: 50 });
    store.set('astro:locale:v2', 'mt:fr');
    await initI18n();
    const early = getI18n().locale === 'mt:fr' && __sessionForTest()?.translator === false;
    const g = await translateOnDevice([{ cacheKey: 'zz:early', text: 'Asked for before the translator arrived.' }]);
    check('a passage asked for while the translator is still being created waits for it, rather than finding none',
      early && g.get('zz:early') === '«Asked for before the translator arrived.»', `${early} ${g.get('zz:early')}`);
  }

  // 7j — leaving the device language: a waiting call resolves, and nothing more is sent.
  {
    fresh();
    const lv = installDriven({ manual: true });
    await live();
    await until(() => lv.pending.length > 0);
    const waiting = translateOnDevice([{ cacheKey: 'zz:leave', text: 'Never reached.' }]);
    await until(() => __sessionForTest()?.freeWaiting === 1);
    await getI18n().setLocale('en');
    const left = await Promise.race([waiting, sleep(2000).then(() => null)]);
    check('leaving the device language resolves a waiting call with what it has, sends nothing more, and refuses the next',
      left !== null && left.size === 0 && !lv.calls.includes('Never reached.') && !canTranslateOnDevice() && getI18n().locale === 'en',
      `${left?.size} ${getI18n().locale}`);
  }

  // 7k — a language served from its cache alone (this browser has no translator now).
  {
    const cb = memoryBackend([['fr', 'common.close', { h: entryHash(ENGINE_VERSION, 'Close'), v: 'FERMER (cache)', at: 1 }]]);
    await cb.putAll([{ lang: 'fr', key: 'zz:cached', rec: { h: entryHash(ENGINE_VERSION, 'Cached before.'), v: 'AVANT (cache)', at: 1 }, free: true }]);
    fresh(cb);
    removeTranslator();
    store.set('astro:locale:v2', 'mt:fr');
    await initI18n();
    const g = await translateOnDevice([
      { cacheKey: 'zz:cached', text: 'Cached before.' },
      { cacheKey: 'zz:new', text: 'Never translated.' },
    ]);
    check('a language served from its cache alone: what the store had comes back, the rest is absent',
      getI18n().locale === 'mt:fr' && canTranslateOnDevice() && g.get('zz:cached') === 'AVANT (cache)' && g.size === 1, JSON.stringify([...g]));
  }
  __resetEngineForTest();
  __resetMachineMenuForTest();
  __testing.reset();
  removeTranslator();
}

// ── §8 the release hold — INTERNAL IDENTITY, in a child process ─────────────
// languageHold.ts resolves the hold once, as its module loads, so a held module graph can't be had
// in this process. This same bundle runs again with `--held` (the harness then plants nothing), and
// the child runs heldSection() alone. Its lines are shown here, indented; its exit status is one
// check. verify-i18n-runtime §8 holds the rest of the tier to the hold; this is a build's own text.
// Goes with the hold, as that one does: once HELD_BASE is false the child can't resolve held.
section('§8 the release hold refuses a build’s own text — the held run, in a child process (INTERNAL IDENTITY)');
{
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--held'], { cwd: process.cwd(), encoding: 'utf8' });
  const out = `${child.stdout ?? ''}${child.stderr ?? ''}`.trimEnd();
  for (const line of out.split(/\r?\n/)) console.log(`   | ${line}`);
  const ran = (out.match(/^(PASS|FAIL) {2}/gm) ?? []).length;
  check('the held run passes every check', child.status === 0, child.error ? String(child.error) : `exit ${child.status}`);
  check('…and made some (a held run that checked nothing would pass vacuously)', ran >= 4, `${ran} check line(s)`);
}

finish();

// The held section — run only in the child (`--held`). A stored device language and a translator
// that records every touch; then the store FORCED into the device language through the runtime's
// test seam (no reader can get there while held), so the hold is the only thing left to refuse.
async function heldSection(): Promise<void> {
  section('§8 (held) a build’s own text is refused while the languages are held — INTERNAL IDENTITY');
  check('this module graph resolved the hold HELD (nothing planted)', LANGUAGES_HELD === true);
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: ['en-US'], language: 'en-US' } });
  const touched: string[] = [];
  const factory: TranslatorFactory = {
    availability: async (o) => {
      touched.push(`availability ${o.targetLanguage}`);
      return 'available';
    },
    create: async (o) => {
      touched.push(`create ${o.targetLanguage}`);
      return {
        translate: async (s: string) => {
          touched.push(`translate ${s}`);
          return s;
        },
      };
    },
  };
  Object.defineProperty(globalThis, 'self', { configurable: true, value: globalThis });
  Object.defineProperty(globalThis, 'Translator', { configurable: true, writable: true, value: factory });
  // The store holds this very passage's translation, so an empty answer below is the hold's
  // refusal and not an empty store — the engine would otherwise answer from it, translator or not.
  const item: OnDeviceItem[] = [{ cacheKey: 'zz:held', text: 'A passage of a build’s own.' }];
  const seeded = memoryBackend();
  await seeded.putAll([{ lang: 'fr', key: 'zz:held', rec: { h: entryHash(ENGINE_VERSION, item[0].text), v: 'TENU (cache)', at: 1 }, free: true }]);
  __setMachineCacheForTest(new MachineCache(seeded));
  check('the store holds the passage’s translation (so a refusal below is the hold’s)', (await seeded.loadFree('fr', ['zz:held'])).get('zz:held')?.v === 'TENU (cache)');
  __testing.reset();
  store.set('astro:locale:v2', 'mt:fr');
  await initI18n();
  const got = await translateOnDevice(item);
  check('a stored device language under the hold: English on screen, canTranslateOnDevice() false, nothing translated, the translator untouched',
    getI18n().locale === 'en' && !canTranslateOnDevice() && got.size === 0 && touched.length === 0, touched.join(', '));
  await __testing.activate('mt:fr');
  const forced = await translateOnDevice(item);
  check('…and with the store forced into the device language, the hold alone still refuses: false, nothing, untouched',
    getI18n().locale === 'mt:fr' && !canTranslateOnDevice() && forced.size === 0 && touched.length === 0, `${getI18n().locale} ${touched.join(', ')}`);
  const direct = await translateFree(item);
  check('…as does the engine itself, asked directly', direct.size === 0 && touched.length === 0, touched.join(', '));
  delete (globalThis as { Translator?: unknown }).Translator;
  delete (globalThis as { self?: unknown }).self;
  __setMachineCacheForTest(null);
  __testing.reset();
}
