// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the i18n runtime (src/i18n/: runtime.ts, registry.ts, plural.ts, format.ts,
// pseudo.ts, translateGuard.ts), built 2026-10-09, running the REAL modules through the
// harness (`npm run verify:i18n-runtime`; no network, no DOM). Since 2026-10-10 also the English
// scope (I18nProvider.tsx) and the binding-language area that drives it
// (components/ui/BindingLanguageNote.tsx), rendered to static markup — React, still no DOM.
//
// Each section says which KIND of check it is, because a failure in each means
// something different:
//
//   BYTE-IDENTICAL     — new code against the OLD code it replaced, copied here verbatim:
//                        the date shapes the components assembled inline, the plural
//                        resolver before form bodies could hold placeholders. English output
//                        may not move by a byte, so a failure here is a visible regression.
//   OUTSIDE AGREEMENT  — the runtime against something it does not compute: the browser's
//                        own Intl for another language's date, its plural rules.
//   INTERNAL IDENTITY  — the store agrees with the rules it states: an override beats the
//                        core's translation, a reference resolves per locale, a translation
//                        with the wrong placeholders shows English, a stored choice that
//                        can't be honoured is held rather than dropped. A failure means the
//                        code contradicts itself.
//
// Every loop below fails on an empty set: a check over nothing is not a pass.
//
// The release hold (src/i18n/languageHold.ts, 2026-10-10). §1–§7 test the languages themselves,
// so they run UNLOCKED, as a device with the hold lifted does — the import just below plants the
// unlock before the hold resolves. §8 runs this same bundle again in a child process with
// `--held`, for a module graph resolved under the hold, and moves every source the hold masks
// while requiring what the reader gets not to move.

// FIRST, before anything that reaches src/i18n: the hold resolves as its module is evaluated
// (harness/languagesUnlocked.ts says why this has to come first).
import { HELD_RUN, releaseLanguagesUnlock } from './harness/languagesUnlocked';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as React from 'react';
import { createElement } from 'react';
import { DateTime, Info } from 'luxon';
import { en } from '../src/i18n/en';
import { makeFormatters, type DateStyle } from '../src/i18n/format';
import { applyPlurals, parseForms, placeholderNames, PLURAL_RE } from '../src/i18n/plural';
import { pseudoize } from '../src/i18n/pseudo';
import { interpolate, resolvePath } from '../src/i18n/t';
import { __setCoreCatalogForTest, loadedCoreCatalog, SUPPORTED_LOCALES } from '../src/i18n/catalog';
import { composeCatalog, composeEnglish, registerMessages, __resetRegistryForTest } from '../src/i18n/registry';
import {
  __testing,
  currentMachineSession,
  DECLARED_LANG,
  detectedAtBoot,
  documentI18n,
  englishSnapshot,
  getI18n,
  initI18n,
  isTranslated,
  lastWrittenLang,
  onLocaleChange,
  requestedKeys,
  subscribeI18n,
  tStatic,
} from '../src/i18n/runtime';
import { installTranslateGuard } from '../src/i18n/translateGuard';
import { EnglishScope, useInEnglishScope, useT } from '../src/i18n/I18nProvider';
import { BindingLanguageArea } from '../src/components/ui/BindingLanguageNote';
import { CreditsLicences, CreditsModal } from '../src/components/CreditsModal/CreditsModal';
import { registerCreditsItems } from '../src/lib/extensions/creditsFooter';
import { LANGUAGES } from '../src/i18n/languages';
import { LANGUAGES_HELD } from '../src/i18n/languageHold';
import {
  chooseMachineLanguage,
  getMachineMenu,
  machineTierOffered,
  refreshMachineAvailability,
  type TranslatorFactory,
} from '../src/i18n/machineMenu';
import type { LocaleTree, MessagePack, ShippedLocale, TVars } from '../src/i18n/types';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

/** One PASS/FAIL line for a whole set: fails when the set is empty, and names the
 *  first few members that broke the rule. */
function every<T>(label: string, items: readonly T[], bad: (x: T) => string | null) {
  if (items.length === 0) {
    check(label, false, 'empty set — nothing was compared');
    return;
  }
  const broken = items.map(bad).filter((s): s is string => s != null);
  check(`${label} (${items.length})`, broken.length === 0, broken.slice(0, 6).join('; '));
}

function section(title: string) {
  console.log(`\n── ${title}`);
}

/** Every string leaf of a tree, as [dot-path, text]. */
function leaves(node: unknown, path = ''): [string, string][] {
  if (typeof node === 'string') return [[path, node]];
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return [];
  return Object.entries(node).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
}

function finish(): never {
  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

// The planted unlock has done its one job — the hold resolved unlocked as its module loaded — so it
// goes before any check runs, and each meets the bare harness it always has.
releaseLanguagesUnlock();
if (HELD_RUN) {
  // The child §8 starts: only the held section, against the module graph `--held` produced.
  await heldSection();
  finish();
}
check('this run resolved the language hold UNLOCKED, so §1–§7 test the languages themselves', LANGUAGES_HELD === false,
  'harness/languagesUnlocked.ts plants a copy of the unlock key — compare it with languageHold.ts');

// ── §1 fmt.date, English — BYTE-IDENTICAL ────────────────────────────────────
// The old shapes, as the components assembled them from the month/weekday helpers.
section('§1 fmt.date in English — BYTE-IDENTICAL to the inline forms it replaces');
{
  const OLD_MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  // The ordinal() helper the 'ordinal' style replaced, verbatim.
  const oldOrdinal = (n: number): string => {
    const teens = n % 100;
    if (teens >= 11 && teens <= 13) return `${n}th`;
    return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
  };
  const monthName = (m: number) => DateTime.fromObject({ month: m }).setLocale('en').toFormat('LLLL');
  const monthAbbr = (m: number) => DateTime.fromObject({ month: m }).setLocale('en').toFormat('LLL');
  // The old dateWithWeekday's weekday, verbatim.
  const weekdayAbbrOf = (year: number, month: number, day: number) => {
    const wd = new Date(Date.UTC(2000, month - 1, day)).setUTCFullYear(year);
    const weekday0Sun = new Date(wd).getUTCDay();
    return Info.weekdays('short', { locale: 'en' })[(weekday0Sun + 6) % 7];
  };
  const OLD: Record<DateStyle, (y: number, m: number, d: number) => string> = {
    long: (y, m, d) => `${d} ${monthName(m)} ${y}`,
    medium: (y, m, d) => `${d} ${monthAbbr(m)} ${y}`,
    longWeekday: (y, m, d) => `${d} ${monthName(m)} ${y}, ${weekdayAbbrOf(y, m, d)}`,
    mediumWeekday: (y, m, d) => `${weekdayAbbrOf(y, m, d)} ${d} ${monthAbbr(m)} ${y}`,
    dayMonth: (_y, m, d) => `${d} ${monthAbbr(m)}`,
    ordinal: (y, m, d) => `${OLD_MONTHS[m - 1]} ${oldOrdinal(d)} ${y}`,
  };
  const STYLES = Object.keys(OLD) as DateStyle[];
  const fmt = makeFormatters('en');

  // Every 7th day of 1600–2100, and every day of years 1, 50, 99 and 999 (the years Date.UTC
  // would read as 19xx, and a three-digit one).
  const days: [number, number, number][] = [];
  const at = new Date(0);
  at.setUTCFullYear(1600, 0, 1);
  while (at.getUTCFullYear() <= 2100) {
    days.push([at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate()]);
    at.setUTCDate(at.getUTCDate() + 7);
  }
  for (const year of [1, 50, 99, 999]) {
    const d = new Date(0);
    d.setUTCFullYear(year, 0, 1);
    while (d.getUTCFullYear() === year) {
      days.push([year, d.getUTCMonth() + 1, d.getUTCDate()]);
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }
  for (const style of STYLES) {
    every(`'${style}' matches the old form`, days, ([y, m, d]) => {
      const got = fmt.date(y, m, d, style);
      const want = OLD[style](y, m, d);
      return got === want ? null : `${y}-${m}-${d}: got "${got}", want "${want}"`;
    });
  }
  every('dateWithWeekday is the longWeekday style', days, ([y, m, d]) =>
    fmt.dateWithWeekday(y, m, d) === fmt.date(y, m, d, 'longWeekday') ? null : `${y}-${m}-${d}`,
  );
  // The examples format.ts documents, written out by hand.
  const GOLDEN: [DateStyle, [number, number, number], string][] = [
    ['long', [1990, 3, 14], '14 March 1990'],
    ['medium', [1990, 3, 14], '14 Mar 1990'],
    ['longWeekday', [1941, 6, 5], '5 June 1941, Thu'],
    ['mediumWeekday', [1941, 6, 5], 'Thu 5 Jun 1941'],
    ['dayMonth', [1990, 3, 14], '14 Mar'],
    ['ordinal', [2026, 9, 26], 'September 26th 2026'],
    ['ordinal', [2026, 10, 11], 'October 11th 2026'],
    ['ordinal', [2026, 10, 22], 'October 22nd 2026'],
  ];
  every('the examples format.ts documents', GOLDEN, ([style, [y, m, d], want]) => {
    const got = fmt.date(y, m, d, style);
    return got === want ? null : `${style}: got "${got}", want "${want}"`;
  });
}

// ── §2 fmt.date, other languages — OUTSIDE AGREEMENT ─────────────────────────
section('§2 fmt.date in other languages — OUTSIDE AGREEMENT with Intl');
{
  const ru = makeFormatters('ru');
  const es = makeFormatters('es');
  const sept = ru.date(2026, 9, 26, 'long');
  check('Russian writes the month in a date in its genitive ("сентября")', sept.includes('сентября') && !sept.includes('сентябрь '), sept);
  check('…while the standalone month name stays nominative', ru.monthName(9).toLowerCase() === 'сентябрь', ru.monthName(9));
  const intl = (lang: string, y: number, m: number, d: number, o: Intl.DateTimeFormatOptions) => {
    const at = new Date(0);
    at.setUTCFullYear(y, m - 1, d);
    return new Intl.DateTimeFormat(lang, { ...o, timeZone: 'UTC' }).format(at);
  };
  const samples: [number, number, number][] = [[1941, 6, 5], [1990, 3, 14], [2000, 2, 29], [1752, 9, 14], [2100, 12, 31]];
  every('Spanish longWeekday is Intl’s own (civil weekday, UTC)', samples, ([y, m, d]) => {
    const got = es.date(y, m, d, 'longWeekday');
    const want = intl('es', y, m, d, { day: 'numeric', month: 'long', year: 'numeric', weekday: 'short' });
    return got === want ? null : `${y}-${m}-${d}: got "${got}", want "${want}"`;
  });
  const y50 = es.date(50, 3, 14, 'long');
  check('a year below 100 is that year, not 19xx', /\b50\b/.test(y50) && !y50.includes('1950'), y50);
  const bc = es.date(-43, 3, 15, 'long');
  check('a year below 1 keeps the manual shape in the language’s words', bc === `15 ${DateTime.fromObject({ year: 2000, month: 3, day: 1 }).setLocale('es').toFormat('MMMM')} -43`, bc);
  check('the weekday is the civil date’s, whatever the zone', es.date(1941, 6, 5, 'mediumWeekday').startsWith('jue'), es.date(1941, 6, 5, 'mediumWeekday'));
}

// ── §2b fmt.fixed — BYTE-IDENTICAL in English, OUTSIDE AGREEMENT elsewhere ─────
// The readouts that printed toFixed (an overlay's "Age 85.3" and "81.7°", an eclipse's
// magnitude and gamma) now go through fmt.fixed (2026-10-10). English must be toFixed's own
// text, rounding included; every other shipped language must be the SAME digits with only
// the decimal mark changed — Intl's own mark for that language, not one restated here.
section('§2b fmt.fixed — BYTE-IDENTICAL to toFixed in English; only the mark moves elsewhere');
{
  // The awkward cases by hand: binary ties that toFixed and Intl round apart (0.15, 1.005,
  // 2.675, 8.345), a negative that rounds to zero ("-0.0"), zero of both signs, halves,
  // integers, a figure that would group (12345.678), and the readouts' own ranges — then a
  // fixed pseudo-random sweep, so the set is not only the cases somebody thought of.
  const values = [
    0, -0, 0.15, 1.005, 2.675, 8.345, -0.04, -0.3, 0.5, 1.5, 2.5, -2.5, 7, -12, 85.25, 81.65,
    359.995, 1.0574, 0.73, -0.9876543, 0.27126, 12345.678, 1000000.05, 123456789.987654,
  ];
  let seed = 20261010;
  for (let i = 0; i < 300; i++) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    const unit = seed / 4294967296;
    // Spread over eight magnitudes, both signs: up to ±0.001 … ±10000.
    values.push((unit - 0.5) * 2 * 10 ** ((i % 8) - 3));
  }
  const cases = values.flatMap((v) => [0, 1, 2, 3, 4].map((d) => [v, d] as const));
  const enF = makeFormatters('en');
  every('English fmt.fixed is value.toFixed(digits), byte for byte', cases, ([v, d]) => {
    const got = enF.fixed(v, d);
    const want = v.toFixed(d);
    return got === want ? null : `${v} @${d}: got "${got}", want "${want}"`;
  });
  const enGb = makeFormatters('en-GB');
  every('…and so is any English tag (en-GB)', cases, ([v, d]) => (enGb.fixed(v, d) === v.toFixed(d) ? null : `${v} @${d}: "${enGb.fixed(v, d)}"`));

  const de = makeFormatters('de');
  check('German writes a decimal comma', de.fixed(85.25, 1) === '85,3', de.fixed(85.25, 1));
  check('…a magnitude to three places', de.fixed(1.0574, 3) === '1,057', de.fixed(1.0574, 3));
  check('…and a negative gamma to four, its sign as English writes it', de.fixed(-0.3, 4) === '-0,3000', de.fixed(-0.3, 4));
  check('…without grouping a large figure', de.fixed(12345.678, 2) === '12345,68', de.fixed(12345.678, 2));
  check('a binary tie rounds as toFixed does (0.15 → "0,1"), not as Intl alone would', de.fixed(0.15, 1) === '0,1', de.fixed(0.15, 1));

  // Each shipped language by the tag the runtime hands Intl (pt → pt-BR), formatters built once.
  const langs = LANGUAGES.filter((l) => l.available && l.code !== 'en' && l.code !== 'qps').map(
    (l) => DECLARED_LANG[l.code as keyof typeof DECLARED_LANG] ?? l.code,
  );
  const byLang = new Map(langs.map((l) => [l, makeFormatters(l)] as const));
  every(
    'every other shipped language writes toFixed’s digits, with only Intl’s own decimal mark changed',
    langs.flatMap((l) => cases.map(([v, d]) => [l, v, d] as const)),
    ([l, v, d]) => {
      const mark = new Intl.NumberFormat(l).formatToParts(1.5).find((p) => p.type === 'decimal')?.value ?? '.';
      const got = byLang.get(l)!.fixed(v, d);
      const want = v.toFixed(d).replace('.', mark);
      return got === want ? null : `${l} ${v} @${d}: got "${got}", want "${want}"`;
    },
  );
  check('a non-finite value keeps toFixed’s text, never a translated word', makeFormatters('ru').fixed(NaN, 1) === 'NaN', makeFormatters('ru').fixed(NaN, 1));
}

// ── §3 plurals — BYTE-IDENTICAL to the old resolver ──────────────────────────
section('§3 plurals — BYTE-IDENTICAL to the resolver before placeholders in forms');
{
  // src/i18n/plural.ts as it stood before 2026-10-09, verbatim (its PLURAL_RE renamed).
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
  const OLD_PLURAL_RE = /\{(\w+),\s*(plural|selectordinal),\s*((?:[^{}]|\{[^{}]*\})*)\}/g;
  function pickForm(body: string, form: string): string | null {
    const match = new RegExp(`(?:^|\\s)${form}\\s*\\{([^{}]*)\\}`).exec(body);
    return match ? match[1] : null;
  }
  function oldApplyPlurals(template: string, locale: string, vars?: TVars): string {
    if (!vars || !/(?:plural|selectordinal),/.test(template)) return template;
    return template.replace(OLD_PLURAL_RE, (_whole, name: string, kind: string, body: string) => {
      const n = Number(vars[name] ?? 0);
      const exact = new RegExp(`=${n}(?:\\.0+)?\\s*\\{([^{}]*)\\}`).exec(body);
      const type: RuleType = kind === 'selectordinal' ? 'ordinal' : 'cardinal';
      const chosen = exact
        ? exact[1]
        : (pickForm(body, pluralRules(locale, type).select(n)) ?? pickForm(body, 'other') ?? '');
      return chosen.replace(/#/g, String(n));
    });
  }

  const plural = leaves(composeEnglish()).filter(([, s]) => /(?:plural|selectordinal),/.test(s));
  const NS = [...Array.from({ length: 31 }, (_, i) => i), 101, 111, 1000];
  const cases = plural.flatMap(([key, s]) => {
    const vars: TVars = {};
    // Every `{name}` the template mentions gets a value, so interpolation is compared too.
    for (const m of s.matchAll(/\{(\w+)[,}]/g)) vars[m[1]] = `«${m[1]}»`;
    const counted = [...s.matchAll(/\{(\w+),\s*(?:plural|selectordinal)/g)].map((m) => m[1]);
    return NS.map((n) => {
      const v = { ...vars };
      for (const name of counted) v[name] = n;
      return { key, s, v, n };
    });
  });
  for (const lang of ['en', 'ru', 'tr', 'de']) {
    every(`every English plural, n in 0–30/101/111/1000, under '${lang}' rules`, cases, ({ key, s, v, n }) => {
      const got = interpolate(applyPlurals(s, lang, v), v);
      const want = interpolate(oldApplyPlurals(s, lang, v), v);
      return got === want ? null : `${key} n=${n}: got "${got}", want "${want}"`;
    });
  }
  check('no vars leaves a plural template untouched', applyPlurals(plural[0]?.[1] ?? 'x', 'en') === (plural[0]?.[1] ?? 'y'));

  // What the new pattern adds.
  const inForm = '{n, plural, one {# chart in {place}} other {# charts in {place}}}';
  const run = (tpl: string, lang: string, v: TVars) => interpolate(applyPlurals(tpl, lang, v), v);
  check('a placeholder inside a form body survives the choice (one)', run(inForm, 'en', { n: 1, place: 'Rome' }) === '1 chart in Rome', run(inForm, 'en', { n: 1, place: 'Rome' }));
  check('a placeholder inside a form body survives the choice (other)', run(inForm, 'en', { n: 4, place: 'Rome' }) === '4 charts in Rome');
  const trap = '{n, plural, one {just one} other {no one {name} came}}';
  check('a category word inside a form’s text is not read as a selector', run(trap, 'en', { n: 1, name: 'Bo' }) === 'just one' && run(trap, 'en', { n: 3, name: 'Bo' }) === 'no one Bo came', `${run(trap, 'en', { n: 1, name: 'Bo' })} / ${run(trap, 'en', { n: 3, name: 'Bo' })}`);
  const ruTpl = '{n, plural, one {# карта} few {# карты} many {# карт} other {# карты}}';
  const ruWant: [number, string][] = [[1, '1 карта'], [2, '2 карты'], [5, '5 карт'], [11, '11 карт'], [21, '21 карта'], [22, '22 карты']];
  every('Russian picks one/few/many by Intl’s rules', ruWant, ([n, want]) => (run(ruTpl, 'ru', { n }) === want ? null : `${n}: ${run(ruTpl, 'ru', { n })}`));
  check('an exact =0 form wins over the category', run('{n, plural, =0 {none} one {# item} other {# items}}', 'en', { n: 0 }) === 'none');
  const names = placeholderNames('{chart}: {n, plural, one {# body near {place}} other {# bodies}} ({extra})');
  check('placeholderNames finds the block variable, the names inside forms and around it — not the selectors',
    [...names].sort().join(',') === 'chart,extra,n,place', [...names].sort().join(','));
  check('a bare-word form body is not a placeholder', [...placeholderNames('{n, plural, one {chart} other {charts}}')].join(',') === 'n');
}

// ── §4 registry and store — INTERNAL IDENTITY ────────────────────────────────
section('§4 registry and store — INTERNAL IDENTITY');
{
  // A storage and a browser language for the store to read; the harness has neither.
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  const setLanguages = (langs: string[]) =>
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: langs, language: langs[0] } });
  setLanguages(['en-US']);

  const enBefore = JSON.stringify(en);
  const english0 = composeEnglish();
  check('before any registration, the composed English is the core catalog', JSON.stringify(english0) === enBefore);
  check('the store is English before init', getI18n().locale === 'en' && getI18n().t('common.close') === 'Close');
  check('the snapshot is the same object until something changes', getI18n() === getI18n());

  let notified = 0;
  const unsubscribe = subscribeI18n(() => {
    notified += 1;
  });

  // A synthetic build pack: a namespace, two string overrides and two references.
  const pack: MessagePack = {
    namespaces: {
      zzTest: {
        hello: 'Hello',
        greet: 'Hello, {name}',
        only: 'English only',
        count: '{n, plural, one {# thing} other {# things}}',
        aliasTarget: 'Target EN',
        braced: 'A {word}',
        entries: { a: { title: 'Planetary {Hours}' }, b: { title: 'New {Thing}' } },
      },
    },
    // A styling marker, not a placeholder (types.ts, `markers`): only its count is English's.
    markers: ['zzTest.entries.*.title'],
    overrides: {
      'creditsModal.notes.swisseph': 'PRO swisseph EN',
      'creditsModal.notes.astrolina': 'PRO astrolina EN',
      'autoFlip.theme-held.title': { ref: 'zzTest.aliasTarget' },
    },
  };
  const packEs: MessagePack = {
    namespaces: {
      zzTest: {
        hello: 'Hola',
        greet: 'Hola, {nombre}', // a renamed placeholder: must show English
        count: '{n, plural, one {# cosa} other {# cosas}}',
        aliasTarget: 'Objetivo ES',
        braced: 'Una {palabra}', // outside the marker paths: a renamed placeholder, as greet
        entries: { a: { title: 'Horas {Planetarias}' }, b: { title: 'Cosa nueva' } },
      },
    },
    overrides: { 'creditsModal.notes.astrolina': 'PRO astrolina ES' },
  };
  // A fake core Spanish catalog, standing in for a generated one. It translates the paths
  // the pack overrides too — those translations state open-core facts and must never show.
  const coreEs: LocaleTree = {
    common: { close: 'Cerrar', locked: { feature: '{funcion} es una función {tier}.' } },
    creditsModal: { notes: { swisseph: 'CORE-ES swisseph', astrolina: 'CORE-ES astrolina' } },
    autoFlip: { 'theme-held': { title: 'CORE-ES held title', body: 'CORE-ES held body' } },
  };
  __setCoreCatalogForTest('es', coreEs);
  __setCoreCatalogForTest('ru', { common: { close: 'Закрыть' } });

  const before = notified;
  registerMessages(pack, { es: async () => ({ default: packEs }) });
  check('a registration before init notifies', notified > before);
  check('…and its namespace resolves at once, in English', tStatic('zzTest.hello') === 'Hello');
  const E = composeEnglish();
  check('English: a string override replaces the core leaf', resolvePath(E, 'creditsModal.notes.swisseph') === 'PRO swisseph EN');
  check('English: a reference reads the referenced key', resolvePath(E, 'autoFlip.theme-held.title') === 'Target EN');
  check('composition never writes to `en`', JSON.stringify(en) === enBefore);

  await __testing.activate('es');
  const s = getI18n();
  check('the active locale is es, with lang "es" on <html>', s.locale === 'es' && s.lang === 'es' && lastWrittenLang() === 'es');
  check('a translated pack leaf shows the translation', tStatic('zzTest.hello') === 'Hola' && isTranslated('zzTest.hello'));
  check('a translated core leaf shows the translation', s.t('common.close') === 'Cerrar' && isTranslated('common.close'));
  check('a missing leaf is filled from English, and reported untranslated', tStatic('zzTest.only') === 'English only' && !isTranslated('zzTest.only'));
  check('a missing core leaf is filled from English', s.t('common.cancel') === 'Cancel' && !isTranslated('common.cancel'));
  check('an override with no pack translation shows the ENGLISH override, not the core’s translation',
    tStatic('creditsModal.notes.swisseph') === 'PRO swisseph EN' && !isTranslated('creditsModal.notes.swisseph'), tStatic('creditsModal.notes.swisseph'));
  check('an override with a pack translation shows the pack’s', tStatic('creditsModal.notes.astrolina') === 'PRO astrolina ES' && isTranslated('creditsModal.notes.astrolina'));
  check('a reference resolves per locale (its target’s Spanish), never the core’s own translation',
    tStatic('autoFlip.theme-held.title') === 'Objetivo ES' && isTranslated('autoFlip.theme-held.title'), tStatic('autoFlip.theme-held.title'));
  check('a core leaf the pack does not touch keeps the core’s translation', tStatic('autoFlip.theme-held.body') === 'CORE-ES held body');
  check('a pack translation with a different placeholder set falls back to English',
    tStatic('zzTest.greet', { name: 'Ana' }) === 'Hello, Ana' && !isTranslated('zzTest.greet'), tStatic('zzTest.greet', { name: 'Ana' }));
  check('a core translation with a different placeholder set falls back to English',
    tStatic('common.locked.feature', { feature: 'X', tier: 'Pro' }) === 'X is a Pro feature.' && !isTranslated('common.locked.feature'));
  check('a translated plural uses Spanish rules', tStatic('zzTest.count', { n: 1 }) === '1 cosa' && tStatic('zzTest.count', { n: 3 }) === '3 cosas');
  check('msgs carries the composed namespace', (s.msgs as Record<string, Record<string, string>>).zzTest.hello === 'Hola');
  check('the guard applies to msgs too, not only to t()', (s.msgs as Record<string, Record<string, string>>).zzTest.greet === 'Hello, {name}');
  {
    const z = (s.msgs as unknown as { zzTest: { braced: string; entries: Record<string, { title: string }> } }).zzTest;
    check('a marked leaf keeps a translated braced word (the count, not the name, is English’s)',
      z.entries.a.title === 'Horas {Planetarias}' && isTranslated('zzTest.entries.a.title'), z.entries.a.title);
    check('a marked leaf that lost its braced word falls back to English',
      z.entries.b.title === 'New {Thing}' && !isTranslated('zzTest.entries.b.title'), z.entries.b.title);
    check('outside the marker paths a renamed brace is still a placeholder mismatch',
      z.braced === 'A {word}' && !isTranslated('zzTest.braced'), z.braced);
  }
  check('labels follow the locale (they read t)', s.labels.planet('Sun') === s.t('planets.Sun.name'));
  check('requested keys are recorded', requestedKeys().has('zzTest.hello') && requestedKeys().has('common.close'));
  const esAgain = await composeCatalog('es');
  check('composeCatalog gives the same text as the store', resolvePath(esAgain, 'zzTest.hello') === 'Hola' && resolvePath(esAgain, 'creditsModal.notes.swisseph') === 'PRO swisseph EN');

  await __testing.activate('ru');
  check('an English fallback under Russian takes ENGLISH plural rules (21 things, not 21 thing)',
    tStatic('zzTest.count', { n: 21 }) === '21 things', tStatic('zzTest.count', { n: 21 }));
  check('a locale with no pack translation still shows the English override', tStatic('creditsModal.notes.astrolina') === 'PRO astrolina EN');
  check('…and its references read English through its own tree', tStatic('autoFlip.theme-held.title') === 'Target EN');

  // A late registration recomposes the active locale and notifies.
  const n0 = notified;
  let seen: string | null = null;
  const off = onLocaleChange((snap) => {
    seen = snap.locale;
  });
  check('onLocaleChange calls back at once', seen === 'ru');
  registerMessages({ namespaces: { zzLate: { word: 'Late' } } });
  check('a late registration notifies', notified > n0);
  check('…and its keys resolve immediately (English-filled under ru)', tStatic('zzLate.word') === 'Late');
  off();
  await __testing.activate('es'); // let any recomposition the registration started settle
  check('a late registration keeps the earlier packs’ translations', tStatic('zzTest.hello') === 'Hola' && tStatic('zzLate.word') === 'Late');

  // Pseudo-locale: everything the store returns is pseudoized, msgs included.
  await __testing.activate('qps');
  const q = getI18n();
  check('qps: t() returns the pseudo form', q.t('common.close') === pseudoize('Close') && q.t('common.close') !== 'Close', q.t('common.close'));
  check('qps: a registered namespace read through msgs is pseudoized too',
    (q.msgs as Record<string, Record<string, string>>).zzTest.hello === pseudoize('Hello'));
  check('qps: lang stays "en"', q.lang === 'en');
  check('qps: plurals resolve, placeholders interpolate', q.t('wheel.house', { number: 2 }).includes('2'), q.t('wheel.house', { number: 2 }));

  // Persistence, detection, the held choice — on a fresh store each time.
  __testing.reset();
  store.clear();
  // German shipped (languages.ts, 2026-10-10), so the unavailable language is made one here
  // rather than borrowed from whichever catalog happens not to be live yet. (2026-10-10)
  __testing.setAvailable(['en']);
  setLanguages(['en-US']);
  await getI18n().setLocale('de');
  check('a pick of an unavailable language is STORED (the reader’s choice)…', store.get('astro:locale:v2') === 'de');
  check('…and HELD: the app stays in the detected language, the pref shows the choice',
    getI18n().locale === 'en' && getI18n().pref === 'de', `${getI18n().locale} / ${getI18n().pref}`);

  __testing.reset();
  store.clear();
  __testing.setAvailable(['en', 'es']);
  setLanguages(['pt-BR', 'es-ES', 'en']);
  await initI18n();
  check('detection picks the first AVAILABLE browser language', getI18n().locale === 'es', getI18n().locale);
  check('detection never writes the preference', !store.has('astro:locale:v2'));
  check('initI18n is idempotent', initI18n() === initI18n());

  __testing.reset();
  store.clear();
  __testing.setAvailable(['en', 'es']);
  setLanguages(['es']);
  store.set('astro:locale:v1', 'en');
  await initI18n();
  check('a stored v1 value is abandoned: detection is not blocked by it', getI18n().locale === 'es');

  __testing.reset();
  store.clear();
  setLanguages(['en']);
  store.set('astro:locale:v2', 'mt:fr');
  await initI18n();
  check('a stored device-translation choice is held, not dropped', getI18n().locale === 'en' && getI18n().pref === 'mt:fr' && store.get('astro:locale:v2') === 'mt:fr');

  __testing.reset();
  store.clear();
  store.set('astro:locale:v2', 'qps');
  await initI18n();
  check('qps is ignored where languages.ts doesn’t list it (production, and this harness)',
    getI18n().locale === 'en' && !LANGUAGES.some((l) => l.code === 'qps'), getI18n().locale);

  __testing.reset();
  store.clear();
  store.set('astro:locale:v2', 'nonsense');
  await initI18n();
  check('a stored value that is not a locale id reads as no choice', getI18n().pref === null);

  unsubscribe();
  __resetRegistryForTest();
  __testing.reset();
  check('reset restores the pristine English catalog', JSON.stringify(composeEnglish()) === enBefore);
}

// ── §5 pseudoize across the whole English catalog — INTERNAL IDENTITY ────────
section('§5 pseudoize across the whole English catalog — INTERNAL IDENTITY');
{
  // The protected parts, read with the RUNTIME's ICU parser (plural.ts) — a different reader
  // from pseudo.ts' own — so a template the pseudo-locale damaged would parse differently.
  const skeleton = (s: string) => {
    const blocks: string[] = [];
    for (const m of s.matchAll(PLURAL_RE)) {
      const forms = parseForms(m[3]).map((f) => `${f.selector}:${(f.text.match(/#/g) ?? []).length}:${[...f.text.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).join('+')}`);
      blocks.push(`${m[1]},${m[2]}[${forms.join(' ')}]`);
    }
    const rest = s.replace(PLURAL_RE, '');
    const names = [...rest.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort();
    return `${blocks.join(' | ')} :: ${names.join(',')}`;
  };
  const symbols = (s: string) => (s.match(/[\p{So}\p{Sm}\u{FE0E}]/gu) ?? []).join('');
  const CODES = ['MC', 'IC', 'As', 'Ds', 'ASC', 'DSC', 'AstroLina'];
  const codeCount = (s: string) => CODES.map((c) => (s.match(new RegExp(`(?<![\\w])${c}(?![\\w])`, 'g')) ?? []).length).join(',');
  // What may stay ASCII in the output: the protected tokens. Anything else is a letter the
  // pseudo-locale missed — which on screen would read as an uncatalogued string.
  const PROTECTED = /\{\w+,\s*(?:plural|selectordinal),|(?:=-?\d+|zero|one|two|few|many|other)\s*\{|\{\w+\}|\b(?:AstroLina|In Mundo|In Zodiaco|ASC|DSC|Asc|Dsc|MC|IC|As|Ds)\b|https?:\/\/[^\s)]+|\b(?:[a-z0-9-]+\.)+(?:org|com|net|io|app)\b/g;

  const all = leaves(composeEnglish());
  every('the ICU skeleton, every {name} (as a multiset) and every #', all, ([key, s]) => {
    const p = pseudoize(s);
    return skeleton(p) === skeleton(s) ? null : `${key}: "${s}" → "${p}"`;
  });
  every('the runtime’s placeholder guard accepts every pseudo string', all, ([key, s]) => {
    const a = [...placeholderNames(s)].sort().join();
    const b = [...placeholderNames(pseudoize(s))].sort().join();
    return a === b ? null : `${key}: {${a}} vs {${b}}`;
  });
  every('glyphs and symbols, in order', all, ([key, s]) => (symbols(pseudoize(s)) === symbols(s) ? null : `${key}: "${symbols(s)}" vs "${symbols(pseudoize(s))}"`));
  every('the never-translated codes (MC, IC, As, Ds, ASC, DSC, AstroLina)', all, ([key, s]) =>
    codeCount(pseudoize(s)) === codeCount(s) ? null : `${key}: ${codeCount(s)} vs ${codeCount(pseudoize(s))}`,
  );
  const lettered = all.filter(([, s]) => /[A-Za-z]/.test(s.replace(PROTECTED, '')));
  every('every string with letters to translate is bracketed and accented', lettered, ([key, s]) => {
    const p = pseudoize(s);
    if (!p.startsWith('⟦') || !p.endsWith('⟧')) return `${key}: not bracketed: "${p}"`;
    const left = p.replace(PROTECTED, '').match(/[A-Za-z]/g);
    return left ? `${key}: ASCII left: ${left.join('')} in "${p}"` : null;
  });
  // Room for a longer language: the padding grows with the letters there are to translate
  // (placeholders and codes don't count — they come out the same length in any language).
  const translatable = (s: string) => (s.replace(PROTECTED, '').match(/[A-Za-z]/g) ?? []).length;
  every('…and padded by about a third (12+ letters to translate)', lettered.filter(([, s]) => translatable(s) >= 12), ([key, s]) => {
    const p = pseudoize(s);
    const pad = p.match(/ (_+)⟧$/)?.[1].length ?? 0;
    return pad >= translatable(s) * 0.3 ? null : `${key}: ${translatable(s)} letters, ${pad} padding`;
  });
  const sample = 'Sextile (⚹︎) to ☉ at the MC: {count, plural, one {# line near {place}} other {# lines}}';
  const ps = pseudoize(sample);
  check('a mixed sample keeps its glyphs, code, placeholders and skeleton', skeleton(ps) === skeleton(sample) && ps.includes('⚹︎') && ps.includes('☉') && ps.includes('MC') && ps.includes('{place}'), ps);
  check('a template with nothing to translate is returned unchanged', pseudoize('{count}') === '{count}' && pseudoize(' · ') === ' · ');
}

// ── §6 translate guard — INTERNAL IDENTITY ───────────────────────────────────
section('§6 translate guard — INTERNAL IDENTITY');
{
  // A minimal stand-in for the DOM's Node: removeChild/insertBefore throw NotFoundError
  // when the node in question isn't a child, as the real ones do.
  class FakeNode {
    parentNode: FakeNode | null = null;
    children: FakeNode[] = [];
    removeChild<T extends FakeNode>(child: T): T {
      const i = this.children.indexOf(child);
      if (i < 0) throw new Error('NotFoundError');
      this.children.splice(i, 1);
      child.parentNode = null;
      return child;
    }
    insertBefore<T extends FakeNode>(node: T, ref: FakeNode | null): T {
      const i = ref ? this.children.indexOf(ref) : this.children.length;
      if (i < 0) throw new Error('NotFoundError');
      this.children.splice(i, 0, node);
      node.parentNode = this;
      return node;
    }
  }
  Object.defineProperty(globalThis, 'Node', { configurable: true, value: FakeNode });
  installTranslateGuard();
  const patchedRemove = FakeNode.prototype.removeChild;
  installTranslateGuard();
  check('installing twice patches once', FakeNode.prototype.removeChild === patchedRemove);

  const parent = new FakeNode();
  const a = parent.insertBefore(new FakeNode(), null);
  const b = parent.insertBefore(new FakeNode(), null);
  const stray = new FakeNode(); // the text node a translator detached
  let threw = false;
  try {
    check('removeChild of a detached node returns it, without throwing', parent.removeChild(stray) === stray);
    const c = new FakeNode();
    check('insertBefore a detached reference returns the node, inserting nothing', parent.insertBefore(c, stray) === c && !parent.children.includes(c));
  } catch {
    threw = true;
  }
  check('neither call threw', !threw);
  parent.removeChild(a);
  check('a real removeChild still removes', parent.children.length === 1 && parent.children[0] === b);
  const d = parent.insertBefore(new FakeNode(), b);
  check('a real insertBefore still inserts in place', parent.children[0] === d && parent.children[1] === b);
}

// ── §7 the English scope — INTERNAL IDENTITY (pieces) and a static render (wiring) ──
// A binding-language area (components/ui/BindingLanguageNote, 2026-10-10) shows legal text in
// the reader's language with the English one press away. The English it shows is the store's own
// English, read through a second door: so the check is the store IN English against the English
// VIEW of the store while it is in another language — two parts asked the same question, not a
// formula restated. Each comparison is also required to differ from the live language somewhere,
// so a view that simply returned the live snapshot could not pass. The click itself is React
// state and can't be pressed in a static render; the scope it drives is rendered both ways.
section('§7 the English scope — INTERNAL IDENTITY, and the hooks wired to it (static render)');
{
  const pack7: MessagePack = {
    namespaces: {
      zzBind: {
        title: 'Billing',
        count: '{n, plural, one {# chart} other {# charts}}',
        creditName: 'Data credit',
        creditNote: 'Constellation data',
      },
    },
    overrides: { 'creditsModal.notes.swisseph': 'PRO swisseph EN' },
  };
  const pack7Es: MessagePack = {
    namespaces: {
      zzBind: {
        title: 'Facturación',
        count: '{n, plural, one {# carta} other {# cartas}}',
        creditName: 'Crédito de datos',
        creditNote: 'Datos de constelaciones',
      },
    },
    overrides: { 'creditsModal.notes.swisseph': 'PRO swisseph ES' },
  };
  const pack7Ru: MessagePack = {
    namespaces: { zzBind: { count: '{n, plural, one {# карта} few {# карты} many {# карт} other {# карты}}' } },
  };
  const esNote = {
    note: 'Traducido para tu comodidad. Solo la versión en inglés es legalmente vinculante.',
    showEnglish: 'Ver en inglés',
    showTranslation: 'Ver la traducción',
    iconLabel: 'Sobre esta traducción',
  };
  __setCoreCatalogForTest('es', { common: { close: 'Cerrar' }, bindingLanguage: esNote });
  __setCoreCatalogForTest('ru', { common: { close: 'Закрыть' } });
  registerMessages(pack7, { es: async () => ({ default: pack7Es }), ru: async () => ({ default: pack7Ru }) });

  // The store IN English: what every key says, and the values formatted.
  await __testing.activate('en');
  const keys = leaves(composeEnglish()).map(([k]) => k);
  const VARS: TVars = { n: 21, count: 21, number: 2, name: 'Ana' };
  const inEnglish = new Map(keys.map((k) => [k, [getI18n().tAny(k), getI18n().tAny(k, VARS)] as const]));
  const enFixed = getI18n().fmt.fixed(1234.5, 1);
  const enDate = getI18n().fmt.date(2026, 10, 10, 'long');
  const enSun = getI18n().labels.planet('Sun');
  check('in English the view IS the live snapshot (nothing rebuilt, nothing re-rendered)', englishSnapshot() === getI18n());

  await __testing.activate('es');
  const live = getI18n();
  const E = englishSnapshot();
  every('under Spanish, the English view says what the store says in English, key for key (with and without values)', keys, (k) => {
    const [plain, withVars] = inEnglish.get(k)!;
    const a = E.tAny(k);
    const b = E.tAny(k, VARS);
    return a === plain && b === withVars ? null : `${k}: "${a}" / "${b}" vs "${plain}" / "${withVars}"`;
  });
  // And against the composed English catalog itself, for every leaf with no value to fill in.
  every('…and what composeEnglish() holds, for every leaf without placeholders', keys.filter((k) => !/[{}]/.test(String(resolvePath(composeEnglish(), k)))), (k) =>
    E.tAny(k) === resolvePath(composeEnglish(), k) ? null : `${k}: "${E.tAny(k)}"`,
  );
  const moved = keys.filter((k) => live.tAny(k) !== E.tAny(k));
  check('…and it is not the live language: keys the live store translates differ in the view',
    moved.length >= 3 && moved.includes('common.close') && moved.includes('zzBind.title'), `${moved.length} differ`);
  check('the view reads a build’s English override, not its translation',
    E.tAny('creditsModal.notes.swisseph') === 'PRO swisseph EN' && live.tAny('creditsModal.notes.swisseph') === 'PRO swisseph ES');
  check('msgs is the composed English (a build’s whole-namespace reader gets English too)',
    E.msgs === composeEnglish() && (E.msgs as unknown as { zzBind: { title: string } }).zzBind.title === 'Billing' &&
      (live.msgs as unknown as { zzBind: { title: string } }).zzBind.title === 'Facturación');
  check('locale and lang are "en"', E.locale === 'en' && E.lang === 'en' && live.locale === 'es');
  check('fmt formats as the store does in English',
    E.fmt.fixed(1234.5, 1) === enFixed && E.fmt.date(2026, 10, 10, 'long') === enDate && live.fmt.fixed(1234.5, 1) !== enFixed,
    `${E.fmt.fixed(1234.5, 1)} / ${live.fmt.fixed(1234.5, 1)}`);
  check('labels read English', E.labels.planet('Sun') === enSun);
  check('the reader’s choice, the hold and setLocale are the live ones',
    E.pref === live.pref && E.machineHold === live.machineHold && E.setLocale === live.setLocale);
  check('the view is the same object until something changes', englishSnapshot() === E && englishSnapshot(live) === E);

  await __testing.activate('ru');
  const ER = englishSnapshot();
  check('a language switch gives a new view over the same English lookups', ER !== E && ER.t === E.t);
  check('an English plural in the view takes English rules (21 charts), the live one Russian',
    ER.tAny('zzBind.count', { n: 21 }) === '21 charts' && getI18n().tAny('zzBind.count', { n: 21 }) === '21 карта',
    `${ER.tAny('zzBind.count', { n: 21 })} / ${getI18n().tAny('zzBind.count', { n: 21 })}`);

  await __testing.activate('mt:fr');
  check('a device translation’s document English and the scope’s English are one build',
    documentI18n().t === englishSnapshot().t && documentI18n().lang === 'en');

  // The wiring, rendered: the hooks, EnglishScope, and the area. Core .tsx is bundled here with
  // the classic JSX transform (vendor/core/tsconfig.json names no `jsx`), so React has to be
  // reachable globally when it renders; react-dom/server is loaded only after a `require` exists
  // for its CommonJS internals.
  const g = globalThis as unknown as { React: typeof React; require: NodeRequire };
  g.React = React;
  g.require = createRequire(import.meta.url);
  const { renderToStaticMarkup } = (await import('react-dom/server.browser')) as typeof import('react-dom/server');
  const html = (el: React.ReactElement) => renderToStaticMarkup(el);
  const h = createElement;
  function Probe() {
    const s = useT();
    const scoped = useInEnglishScope();
    const title = (s.msgs as unknown as { zzBind: { title: string } }).zzBind.title;
    return h('span', null, `${s.t('common.close')}|${title}|${s.locale}|${s.lang}|${scoped}`);
  }

  await __testing.activate('es');
  check('outside a scope the hooks read the live language', html(h(Probe)) === '<span>Cerrar|Facturación|es|es|false</span>', html(h(Probe)));
  check('a scope that is off changes nothing', html(h(EnglishScope, { on: false }, h(Probe))) === html(h(Probe)));
  check('a scope that is on hands every hook reader the English view',
    html(h(EnglishScope, { on: true }, h(Probe))) === '<span>Close|Billing|en|en|true</span>', html(h(EnglishScope, { on: true }, h(Probe))));
  check('an inner scope that is off leaves an outer one’s English in force',
    html(h(EnglishScope, { on: true }, h(EnglishScope, { on: false }, h(Probe)))) === '<span>Close|Billing|en|en|true</span>');

  // The rendered markup is a check's detail only when it fails: on a pass it is a screenful.
  const markupCheck = (label: string, ok: boolean, markup: string) => check(label, ok, ok ? '' : markup);
  const area = html(h(BindingLanguageArea, null, h(Probe)));
  const noteAt = area.indexOf('role="note"');
  const contentAt = area.indexOf('class="binding-language-content"');
  markupCheck('in Spanish the area says the notice in Spanish, the mark labelled, the toggle offering the English',
    noteAt >= 0 && area.includes(esNote.note) && area.includes(`aria-label="${esNote.iconLabel}"`) &&
      area.includes(`>${esNote.showEnglish}</button>`) && area.includes('aria-live="polite"'), area);
  markupCheck('…before the text, which shows the translation, with no lang of its own',
    noteAt < contentAt && area.includes('<div class="binding-language-content"><span>Cerrar|Facturación|es|es|false</span></div>'), area);
  check('…and translate="no" is nowhere on it (the notice is copy to translate)', !area.includes('translate='));
  const bottom = html(h(BindingLanguageArea, { placement: 'bottom', className: 'host-gap' }, h(Probe)));
  markupCheck('placement "bottom" puts the line after the text, with the host’s class on the line',
    bottom.indexOf('role="note"') > bottom.indexOf('class="binding-language-content"') &&
      bottom.includes('class="binding-language-note host-gap"'), bottom);
  const nested = html(h(EnglishScope, { on: true }, h(BindingLanguageArea, null, h(Probe))));
  markupCheck('inside an area already showing the English, an area stays quiet and its text is English',
    !nested.includes('role="note"') && nested.includes('<span>Close|Billing|en|en|true</span>'), nested);

  // The credits dialog, the core's own use (2026-10-10). Its licence text has to be READ inside
  // the area: the dialog's first wiring resolved every note with a `t` taken at its top, outside
  // the scope, so the toggle switched nothing — and a render of the area with a probe in it
  // could not see that. So: the dialog puts the notice over its rows, and the rows themselves,
  // under an English scope, answer in English — a build's override, and a registered row that
  // names catalog keys, included. A row with only pre-localized strings keeps them (the seam's
  // documented limit), which the last check pins so a change to it is a decision.
  registerCreditsItems([
    { group: 'astronomy', name: 'zz-keyed', license: 'X', note: 'stale', nameKey: 'zzBind.creditName', noteKey: 'zzBind.creditNote' },
    { group: 'astronomy', name: 'zz-plain', license: 'X', note: 'pre-localized ES' },
  ]);
  const dialog = html(h(CreditsModal, { onClose: () => {} }));
  markupCheck('the credits dialog puts the notice over its licence rows, inside the area',
    dialog.indexOf('role="note"') >= 0 && dialog.indexOf('role="note"') < dialog.indexOf('class="binding-language-content"') &&
      dialog.indexOf('class="binding-language-content"') < dialog.indexOf('class="credits-groups"'), dialog);
  const rowsLive = html(h(CreditsLicences));
  const rowsEnglish = html(h(EnglishScope, { on: true }, h(CreditsLicences)));
  markupCheck('…its rows read the reader’s language outside a scope (override, keyed row)',
    rowsLive.includes('PRO swisseph ES') && rowsLive.includes('Crédito de datos') && rowsLive.includes('Datos de constelaciones'), rowsLive);
  markupCheck('…and English inside one: the override’s English, the keyed row’s English, no Spanish left in either',
    rowsEnglish.includes('PRO swisseph EN') && rowsEnglish.includes('Data credit') && rowsEnglish.includes('Constellation data') &&
      !rowsEnglish.includes('PRO swisseph ES') && !rowsEnglish.includes('Crédito de datos'), rowsEnglish);
  check('…while a registered row with only pre-localized strings keeps them', rowsEnglish.includes('pre-localized ES'));

  // In English and under a device translation there is nothing to say: no notice, no lang. The
  // wrapper stays all the same (2026-10-10) — `display: contents`, so the host lays out as if it
  // weren't there — because the area's shape must not depend on the language (next check). So
  // English is LAYOUT-identical to the bare children, no longer byte-identical.
  for (const id of ['en', 'mt:fr'] as const) {
    await __testing.activate(id);
    const wrapped = `<div class="binding-language-content">${html(h(Probe))}</div>`;
    const forms = [
      html(h(BindingLanguageArea, null, h(Probe))),
      html(h(BindingLanguageArea, { placement: 'bottom', className: 'host-gap', children: h(Probe) })),
    ];
    markupCheck(`in ${id === 'en' ? 'English' : 'a device translation'} the area renders its children in the wrapper and nothing else — no notice, no lang`,
      forms.every((f) => f === wrapped && !f.includes('role="note"') && !f.includes(' lang=')), forms.find((f) => f !== wrapped) ?? '');
  }

  // ONE SHAPE IN EVERY LANGUAGE (2026-10-10). Switching language with an area on screen used to
  // rebuild everything in it — a host form's nodes replaced and any third-party widget inside it
  // torn down and drawn again — because in English (and under a device translation) the area
  // returned its bare children while in other languages it wrapped them, and React remounts a
  // subtree whose position, or the element type above it, changes. Markup can't show this: an
  // empty slot leaves nothing in HTML. So the area's own output is read — it is called as a plain function inside a
  // render, its hooks running on the caller — and the path from what it returns down to its
  // children, the slot index and element type at every level, has to be the same in en, es and
  // mt:fr, at both placements, and with an outer English scope silencing the notice.
  const typeName = (type: unknown, props: { className?: string }): string =>
    typeof type === 'string'
      ? `${type}${props.className ? `.${props.className.trim().split(/\s+/).join('.')}` : ''}`
      : typeof type === 'function'
        ? type.name || '(anonymous)'
        : type === React.Fragment
          ? 'Fragment'
          : String(type);
  const pathDown = (node: React.ReactNode, target: React.ReactElement): string | null => {
    if (node === target) return '';
    if (!React.isValidElement(node)) return null;
    const props = node.props as { children?: React.ReactNode; className?: string };
    const kids = props.children;
    const list = Array.isArray(kids) ? kids : [kids];
    for (let i = 0; i < list.length; i++) {
      const rest = pathDown(list[i] as React.ReactNode, target);
      if (rest != null) return `${typeName(node.type, props)}${Array.isArray(kids) ? `[${kids.length}]` : ''}→${i}${rest ? ` › ${rest}` : ''}`;
    }
    return null;
  };
  const kid = h(Probe);
  const shapeOf = (placement: 'top' | 'bottom', outerEnglish: boolean): string | null => {
    let out: React.ReactNode = null;
    function Capture() {
      out = BindingLanguageArea({ placement, className: 'host-gap', children: kid });
      return null;
    }
    html(outerEnglish ? h(EnglishScope, { on: true, children: h(Capture) }) : h(Capture));
    return pathDown(out, kid);
  };
  const shapes: { where: string; placement: 'top' | 'bottom'; path: string | null }[] = [];
  for (const id of ['en', 'es', 'mt:fr'] as const) {
    await __testing.activate(id);
    for (const placement of ['top', 'bottom'] as const) shapes.push({ where: id, placement, path: shapeOf(placement, false) });
  }
  await __testing.activate('es');
  for (const placement of ['top', 'bottom'] as const) shapes.push({ where: 'es in an English scope', placement, path: shapeOf(placement, true) });
  // The reference is English's, per placement; each path must also reach the children THROUGH the
  // wrapper, so a shape that lost it everywhere alike could not pass.
  every('the path from the area to its children (slot and element type at every level) is one shape in en, es and mt:fr', shapes, (s) => {
    const ref = shapes.find((r) => r.placement === s.placement)!.path;
    const why =
      s.path == null ? 'children not reached' : !s.path.includes('div.binding-language-content') ? 'not through the wrapper' : s.path !== ref ? 'differs from en' : null;
    return why == null ? null : `${s.where}/${s.placement} ${why}: ${s.path} (en: ${ref})`;
  });

  __resetRegistryForTest();
  __setCoreCatalogForTest('es', null);
  __setCoreCatalogForTest('ru', null);
  __testing.reset();
}

// ── §8 the release hold — INTERNAL IDENTITY, in a child process ─────────────
// languageHold.ts resolves the hold once, as its module loads, so a held module graph can't be had
// in this process: it loaded unlocked for §1–§7. This same bundle runs again with `--held` — the
// harness then plants nothing — and the child runs heldSection() alone. Its lines are shown here,
// indented, and its exit status is one check.
section('§8 the release hold — the held run, in a child process (INTERNAL IDENTITY)');
{
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--held'], { cwd: process.cwd(), encoding: 'utf8' });
  const out = `${child.stdout ?? ''}${child.stderr ?? ''}`.trimEnd();
  for (const line of out.split(/\r?\n/)) console.log(`   | ${line}`);
  const ran = (out.match(/^(PASS|FAIL) {2}/gm) ?? []).length;
  check('the held run passes every check', child.status === 0, child.error ? String(child.error) : `exit ${child.status}`);
  check('…and made some (a held run that checked nothing would pass vacuously)', ran >= 10, `${ran} check line(s)`);
}

finish();

// The held section itself — run only in the child (`--held`), whose module graph resolved the hold.
// Each check MOVES a source the hold masks — a stored choice, a browser language, a pick, a stored
// device language, the device's own translator — and requires what the reader gets NOT to move,
// while the stored choice and the language shown are required to DISAGREE: a hold that agreed with
// its source would be indistinguishable from no hold at all. Against a build with HELD_BASE false,
// every one of these fails (confirmed 2026-10-10, then restored).
async function heldSection(): Promise<void> {
  section('§8 (held) the release hold masks the languages without writing — INTERNAL IDENTITY');
  check('this module graph resolved the hold HELD (nothing planted)', LANGUAGES_HELD === true);

  const FIVE: ShippedLocale[] = ['es', 'pt', 'tr', 'de', 'ru'];
  every('the five shipped languages read unavailable, greyed by the hold (as "Coming soon" in the menu)', FIVE, (code) => {
    const row = LANGUAGES.find((l) => l.code === code);
    if (!row) return `${code}: no row in languages.ts`;
    if (row.available) return `${code}: available`;
    return row.held ? null : `${code}: unavailable but not marked held`;
  });
  check('English stays open, and is the only language the runtime may be in — so the translate offer has nothing to offer',
    LANGUAGES.find((l) => l.code === 'en')?.available === true && JSON.stringify(SUPPORTED_LOCALES) === '["en"]', JSON.stringify(SUPPORTED_LOCALES));

  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  const setLanguages = (langs: string[]) =>
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: langs, language: langs[0] } });

  // A stored Spanish choice, and a browser asking for German.
  __testing.reset();
  store.set('astro:locale:v2', 'es');
  setLanguages(['de-DE', 'en']);
  await initI18n();
  const s = getI18n();
  check('a stored "es" and a German browser: the app is in English, and declares it', s.locale === 'en' && lastWrittenLang() === 'en', `${s.locale} / ${lastWrittenLang()}`);
  check('…while storage still says "es": the stored choice and the language shown DISAGREE',
    store.get('astro:locale:v2') === 'es' && s.pref === 'es' && s.pref !== s.locale, `stored ${store.get('astro:locale:v2')}, pref ${s.pref}, shown ${s.locale}`);
  every('…and no held language’s catalog was fetched', FIVE, (code) => (loadedCoreCatalog(code) === null ? null : `${code} loaded`));

  // The menu marks English, the stand-in; a click on any row is a setLocale.
  await getI18n().setLocale('de');
  check('setLocale("de") under the hold stores nothing — storage still says "es" — and shows English',
    store.get('astro:locale:v2') === 'es' && getI18n().locale === 'en' && getI18n().pref === 'es', `stored ${store.get('astro:locale:v2')}, shown ${getI18n().locale}`);
  await getI18n().setLocale('en');
  check('…nor does a pick of the marked row, English: the stand-in never overwrites the choice',
    store.get('astro:locale:v2') === 'es' && getI18n().pref === 'es', `stored ${store.get('astro:locale:v2')}`);

  // A returning install that never chose, its browser asking for German.
  __testing.reset();
  store.clear();
  store.set('astro:show-roads:v1', '1');
  setLanguages(['de-DE']);
  await initI18n();
  check('no stored choice and a German browser on a returning install: English, and no language-detected notice to give',
    getI18n().locale === 'en' && detectedAtBoot() === null, `${getI18n().locale} / ${JSON.stringify(detectedAtBoot())}`);
  check('…and boot wrote nothing', store.size === 1 && !store.has('astro:locale:v2'), [...store.keys()].join(', '));

  // The on-device tier, with a translator on the device that records every touch.
  const touched: string[] = [];
  const factory: TranslatorFactory = {
    availability: async (o) => {
      touched.push(`availability ${o.targetLanguage}`);
      return 'available';
    },
    create: (o) => {
      touched.push(`create ${o.targetLanguage}`);
      return Promise.reject(new Error('the held tier must not create a translator'));
    },
  };
  Object.defineProperty(globalThis, 'self', { configurable: true, value: globalThis });
  Object.defineProperty(globalThis, 'Translator', { configurable: true, writable: true, value: factory });
  __testing.reset();
  store.clear();
  store.set('astro:locale:v2', 'mt:fr');
  setLanguages(['en-US']);
  await initI18n();
  const m = getI18n();
  check('a stored device language ("mt:fr"): the app is in English, the choice kept in storage',
    m.locale === 'en' && m.pref === 'mt:fr' && store.get('astro:locale:v2') === 'mt:fr', `${m.locale} / ${m.pref} / ${store.get('astro:locale:v2')}`);
  check('…masked in SILENCE: no hold reason, so no language-held notice', m.machineHold === null, JSON.stringify(m.machineHold));
  await refreshMachineAvailability();
  await chooseMachineLanguage('fr');
  check('the device is never asked, and no device language can be started: the translator untouched, the menu state empty',
    touched.length === 0 && getMachineMenu().pick === null && Object.keys(getMachineMenu().availability).length === 0 && currentMachineSession() === null,
    touched.join(', ') || JSON.stringify(getMachineMenu()));
  check('…and storage untouched by the attempt', store.get('astro:locale:v2') === 'mt:fr' && store.size === 1, [...store.entries()].join('; '));
  check('the menu is told to offer no device section at all', machineTierOffered() === false);
  {
    // The menu's own derivation, from its source: every device row hangs off that one answer.
    const sidebar = readFileSync(resolve(process.cwd(), 'src/components/Sidebar/Sidebar.tsx'), 'utf8');
    const start = sidebar.indexOf('function LanguageMenu(');
    const menu = sidebar.slice(start, sidebar.indexOf('onChange={', start));
    check('…and the Language menu lists device rows only through it (candidates, the language shown, the stored choice)',
      start >= 0 &&
        /const deviceOffered = machineTierOffered\(\);/.test(menu) &&
        /const deviceCanTranslate = deviceOffered && translatorApi\(\) !== null;/.test(menu) &&
        /if \(deviceOffered && shownLang\) listed\.add\(shownLang\);/.test(menu) &&
        /if \(deviceOffered && prefLang\) listed\.add\(prefLang\);/.test(menu));
  }
  delete (globalThis as { Translator?: unknown }).Translator;
  delete (globalThis as { self?: unknown }).self;
  __testing.reset();
}
