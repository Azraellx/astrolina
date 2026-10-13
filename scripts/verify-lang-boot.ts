// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the page's language at boot (2026-10-09): index.html's inline `lang-boot` script,
// which declares <html lang> before any bundle runs, against the i18n runtime that declares it
// again once the app is up (`npm run verify:lang-boot`; no network, no DOM). Two independent
// parts that must agree: the script can't import anything, so it carries COPIES of the runtime's
// tables, and a copy that drifts is a page declared in one language and drawn in another — a
// browser then offers to translate our own Spanish, or Turkish uppercase loses its İ for the
// first paint. Then what happens when a browser translates the page anyway: boot's
// language-detected classification (§4) and the page-translation bridge (§5,
// i18n/pageTranslation.ts), each on a fake page.
//
// Each section says which KIND of check it is, because a failure in each means something
// different:
//
//   OUTSIDE AGREEMENT  — the boot script against the runtime, two parts written separately:
//                        the same tables, and the same answer for the same storage and browser.
//                        A failure means one of them is wrong; read both.
//   INTERNAL IDENTITY  — each part against the rules it states: the script never writes
//                        storage, a stored choice that can't be honoured falls to detection,
//                        boot's language-detected classification. A failure means the code
//                        contradicts itself.
//
// Every loop below fails on an empty set: a check over nothing is not a pass.
//
// Enabling a language: add it to AVAILABLE in index.html's lang-boot script as well as
// flipping `available` in languages.ts. §2 fails until both say the same.
//
// One divergence is deliberate and not checked: in a DEVELOPMENT build a stored 'qps' (the
// pseudo-locale) is honoured by the runtime and not by the script, which knows only shipped
// languages. The runtime corrects <html lang> as it boots, and no production page can hold it.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SUPPORTED_LOCALES } from '../src/i18n/catalog';
import {
  DECLARED_LANG,
  __testing,
  applyDocumentLang,
  detectedAtBoot,
  getI18n,
  initI18n,
  lastWrittenLang,
  setAfterLocalePick,
} from '../src/i18n/runtime';
import type { ShippedLocale } from '../src/i18n/types';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

/** One PASS/FAIL line for a whole set: fails when the set is empty, and names the first few
 *  members that broke the rule. */
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

function finish(): never {
  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

// The harness runs this from vendor/core (npm's cwd); import.meta.url is the bundle's, not ours.
const HTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const OPEN_TAG = '<script id="lang-boot">';
const AVAILABLE_RE = /var AVAILABLE = (\[[^\]]*\]);/;
const DECLARED_RE = /var DECLARED = (\{[^}]*\});/;

// ── §1 the script is there, and first ────────────────────────────────────────
section('§1 index.html carries the boot script, ahead of every other script — INTERNAL IDENTITY');
const at = HTML.indexOf(OPEN_TAG);
const end = at < 0 ? -1 : HTML.indexOf('</script>', at);
check('a <script id="lang-boot"> exists, and is closed', at >= 0 && end > at);
if (at < 0 || end < 0) finish();
const BODY = HTML.slice(at + OPEN_TAG.length, end);
{
  const headEnd = HTML.indexOf('</head>');
  const firstScript = HTML.search(/<script\b/);
  check('…inside <head>', headEnd > 0 && at < headEnd);
  check('…and is the first <script> in the page', firstScript === at, `first script at ${firstScript}, lang-boot at ${at}`);
}

// ── §2 its tables are the runtime's — OUTSIDE AGREEMENT ──────────────────────
section('§2 the script’s tables equal the runtime’s — OUTSIDE AGREEMENT');
let available: string[] = [];
let declared: Record<string, string> = {};
{
  const a = AVAILABLE_RE.exec(BODY);
  const d = DECLARED_RE.exec(BODY);
  check('AVAILABLE is written as a JSON array literal', a !== null);
  check('DECLARED is written as a JSON object literal', d !== null);
  if (!a || !d) finish();
  try {
    available = JSON.parse(a[1]) as string[];
    declared = JSON.parse(d[1]) as Record<string, string>;
  } catch (err) {
    check('both literals parse as JSON', false, String(err));
    finish();
  }
  check('AVAILABLE is non-empty and holds English (the fallback must be one of them)', available.length > 0 && available.includes('en'), JSON.stringify(available));
  const want = [...SUPPORTED_LOCALES].sort();
  const got = [...available].sort();
  check('AVAILABLE equals SUPPORTED_LOCALES (catalog.ts, from languages.ts’ `available`)',
    JSON.stringify(got) === JSON.stringify(want), `script ${JSON.stringify(got)} vs runtime ${JSON.stringify(want)}`);
  every('…each AVAILABLE code is in SUPPORTED_LOCALES', available, (c) => ((SUPPORTED_LOCALES as readonly string[]).includes(c) ? null : `${c} is not available in the runtime`));
  every('…each SUPPORTED_LOCALES code is in AVAILABLE', SUPPORTED_LOCALES, (c) => (available.includes(c) ? null : `${c} is missing from the script`));
  const keys = [...new Set([...Object.keys(declared), ...Object.keys(DECLARED_LANG)])];
  every('DECLARED equals the runtime’s DECLARED_LANG, entry by entry', keys, (k) => {
    const s = declared[k];
    const r = (DECLARED_LANG as Record<string, string | undefined>)[k];
    return s === r ? null : `${k}: script ${JSON.stringify(s)} vs runtime ${JSON.stringify(r)}`;
  });
}

const LINK_KEY = 'astro:locale-link:v1';

// ── A fake page for the script, and the same storage and browser for the runtime ─
interface Env {
  /** What astro:locale:v2 holds; 'THROW' makes every storage read throw. */
  stored?: string | null;
  /** Other storage keys present (an install with history). */
  others?: string[];
  languages?: string[];
  language?: string;
  /** The address's query string (`?lang=es`), for a link into the app; '' when absent. */
  search?: string;
  /** What astro:locale-link:v1 holds: the language an earlier link asked for, as boot remembered it. */
  linked?: string;
  /** Stands in for AVAILABLE / SUPPORTED_LOCALES. */
  available?: ShippedLocale[];
}

class FakeStorage {
  writes: string[] = [];
  private map = new Map<string, string>();
  private throws: boolean;
  constructor(throws: boolean, entries: [string, string][]) {
    this.throws = throws;
    for (const [k, v] of entries) this.map.set(k, v);
  }
  private guard() {
    if (this.throws) throw new Error('SecurityError: storage is blocked');
  }
  get length(): number {
    this.guard();
    return this.map.size;
  }
  key(i: number): string | null {
    this.guard();
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    this.guard();
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.writes.push(`set ${k}`);
    this.guard();
    this.map.set(k, String(v));
  }
  removeItem(k: string): void {
    this.writes.push(`remove ${k}`);
    this.guard();
    this.map.delete(k);
  }
  clear(): void {
    this.writes.push('clear');
    this.guard();
    this.map.clear();
  }
}

function storageFor(env: Env): FakeStorage {
  const entries: [string, string][] = [];
  if (env.stored != null && env.stored !== 'THROW') entries.push(['astro:locale:v2', env.stored]);
  if (env.linked != null) entries.push(['astro:locale-link:v1', env.linked]);
  for (const k of env.others ?? []) entries.push([k, '1']);
  return new FakeStorage(env.stored === 'THROW', entries);
}

function navigatorFor(env: Env): { languages?: string[]; language?: string } {
  return { languages: env.languages, language: env.language ?? env.languages?.[0] };
}

/** Runs the script's own body, with AVAILABLE swapped for `env.available` when given. */
function runBoot(env: Env): { lang: string; writes: string[] } {
  if (env.available && !AVAILABLE_RE.test(BODY)) throw new Error('could not inject AVAILABLE into the boot script');
  const body = env.available ? BODY.replace(AVAILABLE_RE, `var AVAILABLE = ${JSON.stringify(env.available)};`) : BODY;
  const storage = storageFor(env);
  const doc = { documentElement: { lang: '(unset)' } };
  new Function('localStorage', 'navigator', 'document', 'location', body)(storage, navigatorFor(env), doc, { search: env.search ?? '' });
  return { lang: doc.documentElement.lang, writes: storage.writes };
}

/** Boots the runtime on a fresh store against the same storage and browser. */
async function runRuntime(env: Env): Promise<{ lang: string | null; writes: string[]; storage: FakeStorage }> {
  const storage = storageFor(env);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: navigatorFor(env) });
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { search: env.search ?? '' } });
  __testing.reset();
  __testing.setAvailable(env.available ?? null);
  await initI18n();
  return { lang: lastWrittenLang(), writes: [...storage.writes], storage };
}

// ── §3 the script resolves as the runtime does — OUTSIDE AGREEMENT ───────────
section('§3 the script, run on a fake page, declares what the runtime declares — OUTSIDE AGREEMENT');
interface Case extends Env {
  name: string;
  want: string;
  /** The language the runtime's boot should remember from the address (it writes nothing else, and
   *  nothing at all when the key already holds it). */
  remembers?: string;
}
const CASES: Case[] = [
  { name: 'stored "es" not available → falls to detection', stored: 'es', available: ['en', 'de'], languages: ['de-AT', 'en'], want: 'de' },
  { name: 'stored "es" not available, nothing detected → English', stored: 'es', available: ['en'], languages: ['es-ES', 'en-US'], want: 'en' },
  { name: 'stored garbage → detection', stored: 'nonsense', available: ['en', 'es'], languages: ['es-MX'], want: 'es' },
  { name: 'navigator pt-PT with pt available → declared pt-BR', available: ['en', 'pt'], languages: ['pt-PT', 'en'], want: 'pt-BR' },
  { name: 'stored "pt", available → declared pt-BR', stored: 'pt', available: ['en', 'pt'], languages: ['de'], want: 'pt-BR' },
  { name: 'a stored available choice beats the browser', stored: 'es', available: ['en', 'es', 'de'], languages: ['de-DE'], want: 'es' },
  { name: 'stored "en" beats an available browser language', stored: 'en', available: ['en', 'es'], languages: ['es'], want: 'en' },
  { name: 'storage that throws → detection', stored: 'THROW', available: ['en', 'es'], languages: ['es'], want: 'es' },
  { name: 'no languages list → navigator.language', available: ['en', 'es'], languages: [], language: 'es-419', want: 'es' },
  { name: 'the browser’s FIRST available language, not its first language', available: ['en', 'tr', 'ru'], languages: ['fr-FR', 'ru-RU', 'tr'], want: 'ru' },
  { name: 'nothing matches → English', available: ['en', 'es'], languages: ['fr-FR', 'ja'], want: 'en' },
  { name: 'no navigator languages at all → English', available: ['en', 'es'], want: 'en' },
  { name: 'a held device-translation choice (mt:fr) → detection', stored: 'mt:fr', available: ['en', 'es'], languages: ['es'], want: 'es' },
  { name: 'the pseudo-locale is never honoured here → detection', stored: 'qps', available: ['en', 'es'], languages: ['en-GB'], want: 'en' },
  // A link's language (?lang=, 2026-10-13): under a stored choice, over the browser's.
  { name: 'a link’s language beats the browser’s', search: '?lang=de', available: ['en', 'es', 'de'], languages: ['es-ES'], want: 'de', remembers: 'de' },
  { name: 'a stored choice beats a link’s language', stored: 'es', search: '?lang=de', available: ['en', 'es', 'de'], languages: ['de'], want: 'es' },
  { name: 'a link asking for English is honoured over a shipped browser language', search: '?lang=en', available: ['en', 'es'], languages: ['es'], want: 'en', remembers: 'en' },
  { name: 'a link’s regional tag, in any case → its base, declared pt-BR', search: '?lang=PT-br', available: ['en', 'pt'], languages: ['en'], want: 'pt-BR', remembers: 'pt' },
  { name: 'lang among other parameters', search: '?x=1&lang=tr&y=2', available: ['en', 'tr'], languages: ['en'], want: 'tr', remembers: 'tr' },
  { name: 'a link language that isn’t available → the browser’s', search: '?lang=fr', available: ['en', 'es'], languages: ['es'], want: 'es' },
  { name: 'a link language not yet opened here → the browser’s', search: '?lang=ru', available: ['en', 'es'], languages: ['es'], want: 'es' },
  { name: 'an escape that doesn’t decode → the browser’s', search: '?lang=%E0%A4%A', available: ['en', 'es'], languages: ['es'], want: 'es' },
  { name: 'a parameter that merely ends in lang is not one', search: '?xlang=de&language=de', available: ['en', 'de'], languages: ['en'], want: 'en' },
  { name: 'an empty lang → the browser’s', search: '?lang=', available: ['en', 'es'], languages: ['es'], want: 'es' },
  { name: 'a link language over a held device choice', stored: 'mt:fr', search: '?lang=de', available: ['en', 'de'], languages: ['en'], want: 'de' },
  // The link remembered from an earlier visit (astro:locale-link:v1, 2026-10-13).
  { name: 'a remembered link’s language beats the browser’s', linked: 'de', available: ['en', 'es', 'de'], languages: ['es-ES'], want: 'de' },
  { name: 'a stored choice beats a remembered link', stored: 'es', linked: 'de', available: ['en', 'es', 'de'], languages: ['de'], want: 'es' },
  { name: 'the address beats a remembered link, and replaces it', search: '?lang=ru', linked: 'de', available: ['en', 'de', 'ru'], languages: ['en'], want: 'ru', remembers: 'ru' },
  { name: 'the address agreeing with the remembered link writes nothing', search: '?lang=de', linked: 'de', available: ['en', 'de'], languages: ['en'], want: 'de' },
  { name: 'a remembered link that doesn’t ship → the browser’s', linked: 'xx', available: ['en', 'es'], languages: ['es'], want: 'es' },
  { name: 'a remembered link not yet opened here → the browser’s', linked: 'ru', available: ['en', 'es'], languages: ['es'], want: 'es' },
  { name: 'a remembered link under a held device choice', stored: 'mt:fr', linked: 'de', available: ['en', 'de'], languages: ['en'], want: 'de' },
  { name: 'storage that throws: the address still holds for the visit', stored: 'THROW', search: '?lang=de', available: ['en', 'de'], languages: ['en'], want: 'de' },
  // The real list, as shipped: no injection, and the runtime on its own SUPPORTED_LOCALES.
  { name: 'the shipped AVAILABLE list, unmodified, with a Spanish browser', languages: ['es-ES'], want: SUPPORTED_LOCALES.includes('es') ? (DECLARED_LANG.es ?? 'es') : 'en' },
  { name: 'the shipped AVAILABLE list: a stored "es" beats a German browser', stored: 'es', languages: ['de-DE', 'en'], want: SUPPORTED_LOCALES.includes('es') ? 'es' : 'en' },
];
{
  const results: { c: Case; boot: { lang: string; writes: string[] }; rt: { lang: string | null; writes: string[]; storage: FakeStorage } }[] = [];
  for (const c of CASES) results.push({ c, boot: runBoot(c), rt: await runRuntime(c) });
  every('the script declares the expected tag', results, ({ c, boot }) => (boot.lang === c.want ? null : `${c.name}: got ${boot.lang}, want ${c.want}`));
  every('…and the runtime, booted on the same storage and browser, declares the same', results, ({ c, boot, rt }) =>
    rt.lang === boot.lang ? null : `${c.name}: script ${boot.lang}, runtime ${rt.lang}`,
  );
  every('the script never writes storage', results, ({ c, boot }) => (boot.writes.length === 0 ? null : `${c.name}: ${boot.writes.join(', ')}`));
  every('…nor does the runtime’s boot, but for the address’s language, under its own key, for a reader with no choice', results, ({ c, rt }) => {
    const want = c.remembers ? [`set ${LINK_KEY}`] : [];
    return JSON.stringify(rt.writes) === JSON.stringify(want) ? null : `${c.name}: wrote [${rt.writes.join(', ')}], want [${want.join(', ')}]`;
  });
  every('…and what it remembers is the address’s language', results.filter(({ c }) => c.remembers), ({ c, rt }) =>
    rt.storage.getItem(LINK_KEY) === c.remembers && rt.storage.getItem('astro:locale:v2') === (c.stored ?? null)
      ? null
      : `${c.name}: link ${rt.storage.getItem(LINK_KEY)}, choice ${rt.storage.getItem('astro:locale:v2')}`,
  );
}

// ── §4 the language-detected classification — INTERNAL IDENTITY ─────────────
section('§4 boot’s language-detected classification — INTERNAL IDENTITY');
{
  const spanish: Env = { available: ['en', 'es'], languages: ['es-ES', 'en'] };

  await runRuntime(spanish);
  const fresh = detectedAtBoot();
  check('a first visit landing on a detected language: detected, not an existing install',
    fresh?.locale === 'es' && fresh.existingInstall === false, JSON.stringify(fresh));

  await runRuntime({ ...spanish, others: ['astro:show-roads:v1'] });
  const returning = detectedAtBoot();
  check('an install with other astro: state: detected, an existing install', returning?.locale === 'es' && returning.existingInstall === true, JSON.stringify(returning));

  await runRuntime({ ...spanish, others: ['someone-else:key'] });
  check('a key that is not ours does not make an install existing', detectedAtBoot()?.existingInstall === false, JSON.stringify(detectedAtBoot()));

  await runRuntime({ ...spanish, stored: 'en', others: ['astro:show-roads:v1'] });
  check('a stored choice is not a detection', detectedAtBoot() === null, JSON.stringify(detectedAtBoot()));

  await runRuntime({ ...spanish, stored: 'nonsense', others: ['astro:show-roads:v1'] });
  check('a malformed stored value is not an empty one: no detection to report', detectedAtBoot() === null, JSON.stringify(detectedAtBoot()));

  await runRuntime({ ...spanish, stored: 'mt:fr', others: ['astro:show-roads:v1'] });
  check('a held choice (the reader chose something) is not a detection', detectedAtBoot() === null, JSON.stringify(detectedAtBoot()));

  await runRuntime({ available: ['en', 'es'], languages: ['en-US'], others: ['astro:show-roads:v1'] });
  check('detecting English is no change to report', detectedAtBoot() === null, JSON.stringify(detectedAtBoot()));

  await runRuntime({ ...spanish, stored: 'THROW' });
  check('unreadable storage reports nothing (no evidence either way)', detectedAtBoot() === null, JSON.stringify(detectedAtBoot()));

  // Where the language came from (2026-10-13): the browser, or a link's ?lang=.
  check('a browser language is classified as the browser’s', (await runRuntime(spanish), detectedAtBoot()?.via === 'browser'), JSON.stringify(detectedAtBoot()));
  await runRuntime({ available: ['en', 'es', 'de'], languages: ['en-US'], search: '?lang=de', others: ['astro:show-roads:v1'] });
  const linked = detectedAtBoot();
  check('a link’s language: detected, via the link, existing install as it stands', linked?.locale === 'de' && linked.via === 'link' && linked.existingInstall === true, JSON.stringify(linked));
  await runRuntime({ available: ['en', 'es', 'de'], languages: ['de-DE'], search: '?lang=de' });
  check('a link agreeing with the browser is still the link (the reader came by it knowingly)', detectedAtBoot()?.via === 'link', JSON.stringify(detectedAtBoot()));
  await runRuntime({ available: ['en', 'es', 'de'], languages: ['es-ES'], search: '?lang=xx' });
  check('a link the app can’t honour leaves it to the browser', detectedAtBoot()?.locale === 'es' && detectedAtBoot()?.via === 'browser', JSON.stringify(detectedAtBoot()));
  await runRuntime({ available: ['en', 'es'], languages: ['es-ES'], search: '?lang=en', others: ['astro:show-roads:v1'] });
  check('a link to English is no change to report', detectedAtBoot() === null, JSON.stringify(detectedAtBoot()));
  {
    const { storage: s } = await runRuntime({ available: ['en', 'es', 'de'], languages: ['en'], search: '?lang=de' });
    check('a link’s language is remembered under its own key, never as the choice',
      s.writes.join(', ') === `set ${LINK_KEY}` && s.getItem(LINK_KEY) === 'de' && s.getItem('astro:locale:v2') === null, s.writes.join(', '));
    check('…and remembering it doesn’t make a first visit look like a return', detectedAtBoot()?.existingInstall === false, JSON.stringify(detectedAtBoot()));
    // A held pick shows the language the app would show without one: the link's, here.
    await getI18n().setLocale('ru');
    check('a pick that can’t be shown falls to the link’s language, not the browser’s', getI18n().locale === 'de' && getI18n().pref === 'ru', `${getI18n().locale} / ${getI18n().pref}`);
    check('…and a pick leaves the remembered link alone (the choice outranks it from now on)', s.getItem(LINK_KEY) === 'de' && s.getItem('astro:locale:v2') === 'ru');
  }
  {
    const { storage: s } = await runRuntime({ available: ['en', 'es', 'de'], languages: ['es-ES'], linked: 'de', others: ['astro:show-roads:v1'] });
    const later = detectedAtBoot();
    check('a later visit without the address opens in the remembered link’s language, as a link', later?.locale === 'de' && later.via === 'link' && later.existingInstall === true, JSON.stringify(later));
    check('…writing nothing', s.writes.length === 0, s.writes.join(', '));
  }
  await runRuntime({ available: ['en', 'es', 'de'], languages: ['de'], stored: 'es', linked: 'de' });
  check('a stored choice: the remembered link is no detection', getI18n().locale === 'es' && detectedAtBoot() === null, `${getI18n().locale} / ${JSON.stringify(detectedAtBoot())}`);
  {
    const { storage: s } = await runRuntime({ available: ['en', 'es', 'de'], languages: ['en'], stored: 'mt:fr', search: '?lang=es' });
    check('a held device choice: the address’s language shows, and is not remembered (the reader has a choice)', getI18n().locale === 'es' && s.getItem(LINK_KEY) === null, `${getI18n().locale} / ${s.getItem(LINK_KEY)}`);
  }

  // A pick ends the question, and the after-pick hook runs only when the language moved.
  const { storage } = await runRuntime({ ...spanish, others: ['astro:show-roads:v1'] });
  let picks = 0;
  setAfterLocalePick(() => {
    picks += 1;
  });
  await getI18n().setLocale('es');
  check('a pick of the language already on screen runs no after-pick hook', picks === 0, `${picks}`);
  check('…but it is a pick: the detection is over', detectedAtBoot() === null, JSON.stringify(detectedAtBoot()));
  check('…and it is stored, as the reader’s own choice', storage.getItem('astro:locale:v2') === 'es');
  await getI18n().setLocale('en');
  check('a pick that moves the language runs the after-pick hook once, after the switch',
    picks === 1 && getI18n().locale === 'en', `${picks} / ${getI18n().locale}`);
  await getI18n().setLocale('en');
  check('picking it again runs no hook', picks === 1, `${picks}`);
  // A held pick shows the DETECTED language, so it moves only if detection differs: with an
  // English browser, English stays on screen.
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: navigatorFor({ languages: ['en-US'] }) });
  await getI18n().setLocale('de');
  check('a pick of an unavailable language is held — the language does not move, no hook',
    picks === 1 && getI18n().locale === 'en' && getI18n().pref === 'de', `${picks} / ${getI18n().locale} / ${getI18n().pref}`);
  setAfterLocalePick(null);
  __testing.reset();
}

// ── §5 the page-translation bridge — INTERNAL IDENTITY ───────────────────────
// i18n/pageTranslation.ts on a fake page: an <html> whose class and lang the test sets as a
// translator would, a MutationObserver the test fires by hand, a probe whose answer the test
// decides, and a captured interval in place of the 5 s timer.
section('§5 the page-translation bridge, on a fake page — INTERNAL IDENTITY');
{
  await runRuntime({ available: ['en', 'es'], languages: ['en-US'] });
  check('the runtime declared English before the bridge starts', lastWrittenLang() === 'en');

  const attrs = new Map<string, string>([['lang', 'en']]);
  const classes = new Set<string>();
  let translatedNodes = false;
  let fireObserver: (() => void) | null = null;
  const docListeners = new Map<string, () => void>();
  const html = {
    getAttribute: (n: string) => attrs.get(n) ?? null,
    get lang() {
      return attrs.get('lang') ?? '';
    },
    set lang(v: string) {
      attrs.set('lang', v);
    },
    classList: { contains: (c: string) => classes.has(c) },
  };
  const doc = {
    documentElement: html,
    visibilityState: 'visible',
    querySelector: () => (translatedNodes ? {} : null),
    addEventListener: (type: string, fn: () => void) => void docListeners.set(type, fn),
    removeEventListener: (type: string) => void docListeners.delete(type),
  };
  class FakeObserver {
    constructor(cb: () => void) {
      fireObserver = cb;
    }
    observe() {}
    disconnect() {
      fireObserver = null;
    }
  }
  const intervals = new Map<number, () => void>();
  let nextTimer = 1;
  let reloads = 0;
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  Object.defineProperty(globalThis, 'MutationObserver', { configurable: true, value: FakeObserver });
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { reload: () => void (reloads += 1) } });
  (globalThis as { setInterval: unknown }).setInterval = (fn: () => void) => {
    const id = nextTimer++;
    intervals.set(id, fn);
    return id;
  };
  (globalThis as { clearInterval: unknown }).clearInterval = (id: number) => void intervals.delete(id);

  const bridge = await import('../src/i18n/pageTranslation');
  const fire = () => fireObserver?.();
  const tick = () => [...intervals.values()].forEach((fn) => fn());
  let notified = 0;
  const off = bridge.subscribePageTranslation(() => {
    notified += 1;
  });
  const s = () => bridge.getPageTranslation();

  check('the first subscriber starts it: idle on an untranslated page, probing while visible',
    fireObserver !== null && !s().active && intervals.size === 1, `${JSON.stringify(s())}, ${intervals.size} timer(s)`);

  attrs.set('lang', 'es');
  classes.add('translated-ltr');
  fire();
  check('a translator’s class and its own lang: active, target "es", subscribers told',
    s().active && s().target === 'es' && notified === 1, `${JSON.stringify(s())}, ${notified}`);
  check('…and probing stops once the answer is known', intervals.size === 0);

  attrs.set('lang', 'en');
  classes.delete('translated-ltr');
  fire();
  check('the original back: idle again, and probing resumes', !s().active && intervals.size === 1, JSON.stringify(s()));

  applyDocumentLang('pt-BR');
  fire();
  check('the runtime’s own lang write is not a translator', !s().active && attrs.get('lang') === 'pt-BR', JSON.stringify(s()));
  applyDocumentLang('en');
  fire();

  attrs.set('lang', 'es-419');
  fire();
  check('a lang the runtime did not write is enough by itself, read as its base tag', s().active && s().target === 'es', JSON.stringify(s()));
  attrs.set('lang', 'en');
  fire();

  classes.add('translated-rtl');
  fire();
  check('the class alone: active, but no target to offer', s().active && s().target === null, JSON.stringify(s()));
  classes.delete('translated-rtl');
  fire();

  translatedNodes = true;
  check('a translator’s nodes are not seen until the probe runs', !s().active);
  tick();
  check('…the probe finds them: active, no target', s().active && s().target === null && intervals.size === 0, JSON.stringify(s()));
  translatedNodes = false;
  fire();
  check('a change on <html> re-probes, so the original back clears it', !s().active && intervals.size === 1, JSON.stringify(s()));

  doc.visibilityState = 'hidden';
  docListeners.get('visibilitychange')?.();
  check('a hidden tab is not probed', intervals.size === 0);
  doc.visibilityState = 'visible';
  docListeners.get('visibilitychange')?.();
  check('…and probing resumes when it is visible again', intervals.size === 1);

  // A pick under a translator reloads, once.
  classes.add('translated-ltr');
  attrs.set('lang', 'es');
  fire();
  await getI18n().setLocale('es');
  check('a pick that moves the language while translated reloads the page', reloads === 1 && getI18n().locale === 'es', `${reloads} / ${getI18n().locale}`);
  bridge.reloadUntranslated();
  check('…and only once, however many ask', reloads === 1, `${reloads}`);
  check('the runtime’s write for the pick is its own, so the class is what keeps it active', s().active && attrs.get('lang') === 'es', JSON.stringify(s()));

  off();
  check('the last subscriber out stops it: no observer, no probe, idle',
    fireObserver === null && intervals.size === 0 && !s().active, `${intervals.size} timer(s), ${JSON.stringify(s())}`);
  check('…and the bridge never wrote storage', (globalThis as unknown as { localStorage: FakeStorage }).localStorage.writes.every((w) => w === 'set astro:locale:v2'),
    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.writes.join(', '));

  (globalThis as { setInterval: unknown }).setInterval = realSetInterval;
  (globalThis as { clearInterval: unknown }).clearInterval = realClearInterval;
  __testing.reset();
}

finish();
