// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The i18n store: the active language and its composed catalog, held at module level
// rather than in a React provider (2026-10-09). A provider could only reach the components
// under it, and the app's text is not all under one tree — plugins mount React roots of
// their own, some surfaces are plain DOM, and some labels are read at registration — so
// every one of them used to stay English whatever the reader chose. Now React reads the
// store through useSyncExternalStore (I18nProvider.tsx), everything else through
// getI18n / onLocaleChange / tStatic, and all of it follows a switch.
//
// The store works before initI18n() has run — it is English until then, and a build's
// registrations show at once — and notifies when init, a switch or a late registration
// changes it. Nothing here touches the DOM, storage or navigator at import time: the
// verify harness runs this module under Node.
//
// The runtime rule throughout: a missing or invalid translation shows English for that key,
// so English copy, which changes daily, never waits on a translation.
//
// The on-device tier (2026-10-10): a language translated on the reader's own device from the
// English catalog, `mt:fr`. Its translations are made by i18n/machine/ — a lazy chunk, loaded
// only when such a language is chosen or stored — and laid over English here as one more
// composed catalog. A stored `mt:` choice the device can't show (no translator, nothing cached)
// is HELD under rule 2: kept as chosen, with the reason on the snapshot (`machineHold`), while
// the app shows the detected language or English.
//
// The release hold (languageHold.ts, 2026-10-10) reaches this file in two places, and both are
// rule 2 rather than a rewrite: setLocale stores nothing while it stands, and a stored `mt:`
// choice is masked to English without loading the on-device module. The shipped languages need
// nothing here — they read unavailable in languages.ts, and availability is all this file asks.
import { isShippedLocale, SUPPORTED_LOCALES } from './catalog';
import { makeEnumLabels, type EnumLabels } from './enums';
import { makeFormatters, type Formatters } from './format';
import { LANGUAGES_HELD } from './languageHold';
import { LANGUAGES } from './languages';
import { applyPlurals, samePlaceholders } from './plural';
import { pseudoize } from './pseudo';
import {
  composeEnglish,
  composeLoaded,
  composeLocale,
  isMarkerPath,
  onRegistryChange,
  type Composed,
  type ComposedMessages,
} from './registry';
import { interpolate, resolvePath } from './t';
import type { LocaleId, MachineLocale, ShippedLocale, TFn, TVars } from './types';

// The stored language preference. v1 is abandoned, not migrated (CLAUDE.md rule 6): only
// 'en' was ever selectable under it, so a stored v1 value carries no preference — and
// honouring it would block browser detection for exactly the readers the catalogs are for,
// the ones whose browser asks for Spanish and who once had English written for them.
// Written only by setLocale, i.e. by the reader's own pick in the menu; detection and boot
// never write it.
const LOCALE_KEY = 'astro:locale:v2';

// How long boot waits for a non-English catalog before showing the app in English. The
// chunk is small and usually cached; this only bounds a stalled connection. A catalog that
// arrives later still swaps in — it is the reader's own language arriving, not a change
// they didn't make.
const INIT_WAIT_MS = 10_000;

/** The language the store can actually be in: a shipped catalog, the dev pseudo-locale, or a
 *  device translation the device can show (its translations, or its cache, are to hand). */
export type EffectiveLocale = ShippedLocale | 'qps' | MachineLocale;

/** Why a stored device-translation choice is held rather than shown (2026-10-10):
 *    'unsupported'    — this browser has no on-device translator, and nothing was cached;
 *    'needs-download' — the translator is there but its model for the language is not, and
 *                       downloading it needs the reader's tap; nothing was cached;
 *    'failed'         — the on-device module itself didn't load (offline, say). */
export type MachineHoldReason = 'unsupported' | 'needs-download' | 'failed';

export interface MachineHold {
  id: MachineLocale;
  /** The language tag ('fr'). */
  lang: string;
  reason: MachineHoldReason;
}

/** One device translation as the runtime holds it: the English it was made from, and the
 *  text. A translation whose English has since changed is not shown — the key reads English
 *  until it is translated again (machine/cache.ts keys the stored copy the same way). */
export interface MachineEntry {
  src: string;
  text: string;
}

function isMachineLocale(id: string): id is MachineLocale {
  return id.startsWith('mt:');
}

export interface I18nSnapshot {
  /** The language the app is in now — what every string below is in. */
  locale: EffectiveLocale;
  /** The reader's stored choice (`astro:locale:v2`), or null if they never made one. It
   *  can differ from `locale`: a stored language that isn't available in this build (one
   *  not shipped yet, the dev pseudo-locale in production, a device translation) is HELD —
   *  kept as chosen while the app shows the detected language or English (rule 2). */
  pref: LocaleId | null;
  /** The stored device-translation choice that this device can't show right now, and why —
   *  null otherwise. The Language menu greys its row with the reason, and the language-held
   *  notice reads it. Never written anywhere: the stored choice is `pref`, untouched. */
  machineHold: MachineHold | null;
  /** BCP-47 tag for Intl, PluralRules and `<html lang>`. */
  lang: string;
  /** The catalog lookup, strict on keys. */
  t: TFn;
  /** The same lookup with a loose key, for a build's own namespaces. */
  tAny: (key: string, vars?: TVars) => string;
  fmt: Formatters;
  labels: EnumLabels;
  /** The composed, English-filled catalog of the active locale: core, every registered
   *  namespace, overrides applied. Read it at render/call time, never at module scope. */
  msgs: ComposedMessages;
  /** The reader's pick: persists it, loads the language, swaps, notifies. */
  setLocale: (id: LocaleId) => Promise<void>;
}

interface Active extends Composed {
  id: EffectiveLocale;
}

/** What boot found when the reader had never chosen a language and their browser's language
 *  ships: the language it opened in, and whether this install had been used before. */
export interface BootDetection {
  locale: ShippedLocale;
  /** True when the install already held other `astro:` state at boot — a reader whose app
   *  had been opening in English, because their language did not ship yet. False on a first
   *  visit, where the detected language is simply the one the app has always been in. */
  existingInstall: boolean;
}

let active: Active | null = null;
let pref: LocaleId | null = null;
let snapshot: I18nSnapshot | null = null;
let initPromise: Promise<void> | null = null;
let seq = 0;
let inFlight: EffectiveLocale | null = null;
let lastLang: string | null = null;
let availableOverride: readonly ShippedLocale[] | null = null;
let bootDetected: BootDetection | null = null;
let afterPick: (() => void) | null = null;
const listeners = new Set<() => void>();
const requested = new Set<string>();
// Namespaces read WHOLE — a build's `useNs` / `nsStatic` hand a component the composed object,
// so the keys it reads never pass through t() and requestedKeys() can't see them. The
// on-device tier treats a namespace noted here as asked for in full. (2026-10-10)
const namespacesRead = new Set<string>();

// The on-device tier's state (2026-10-10). `machineLayer` is the translations laid over English
// for one `mt:` language; `machineHeld` a stored `mt:` choice the device can't show; and
// `machineSession` the work machine/engine.ts is doing for a language (a download, the
// translating, the sweep), with the handle that stops it — a pick of any other language does.
type MachineLayer = { id: MachineLocale; entries: ReadonlyMap<string, MachineEntry> };
let machineLayer: MachineLayer | null = null;
let machineHeld: MachineHold | null = null;
let machineSession: { id: MachineLocale; stop: () => void } | null = null;

function isLocaleId(v: string): v is LocaleId {
  return isShippedLocale(v) || v === 'qps' || /^mt:[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(v);
}

// The BCP-47 tag a locale is declared and formatted as. The one that differs from its code is
// Portuguese: the catalog is Brazilian (the wider audience, 2026-10-09), so the page
// says `pt-BR` — telling a browser translator and a screen reader which variant it is reading —
// and Intl formats as Brazil does. (CLDR's bare `pt` already IS Brazilian, so plural rules and
// dates would agree either way; the tag is for whoever reads the page's declaration.)
//
// Exported because index.html's inline boot script carries a copy (it runs before any bundle
// exists, so it cannot import this), and `npm run verify:lang-boot` requires the two to agree
// (2026-10-09). Change one, change both.
export const DECLARED_LANG: Readonly<Partial<Record<ShippedLocale, string>>> = { pt: 'pt-BR' };

function langOf(id: LocaleId): string {
  if (id === 'qps') return 'en';
  if (id.startsWith('mt:')) return id.slice(3);
  return DECLARED_LANG[id as ShippedLocale] ?? id;
}

function availableLocales(): readonly ShippedLocale[] {
  return availableOverride ?? SUPPORTED_LOCALES;
}

function isAvailable(id: LocaleId): id is EffectiveLocale {
  if (id === 'qps') return LANGUAGES.some((l) => l.code === 'qps' && l.available);
  // A device translation is available once machine/engine.ts has laid a layer for it — from
  // the device's translator, or from what it cached in an earlier session. Until then (and for
  // good, where it can't) a stored 'mt:' choice is held, not dropped.
  if (isMachineLocale(id)) return machineLayer?.id === id;
  return (availableLocales() as readonly string[]).includes(id);
}

/** The browser's first language we ship, else English. Never the device tier, never the
 *  pseudo-locale ('qps-ploc' is a real Windows tag), and never written anywhere. */
function detect(): ShippedLocale {
  try {
    const nav = typeof navigator === 'undefined' ? undefined : navigator;
    const tags = nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : [];
    for (const tag of tags) {
      const base = tag.toLowerCase().split('-')[0];
      if (isShippedLocale(base) && (availableLocales() as readonly string[]).includes(base)) return base;
    }
  } catch {
    // navigator unavailable — fall through to English.
  }
  return 'en';
}

function effectiveFor(id: LocaleId | null): EffectiveLocale {
  return id && isAvailable(id) ? id : detect();
}

function readPref(): LocaleId | null {
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    return v && isLocaleId(v) ? v : null;
  } catch {
    return null;
  }
}

function writePref(id: LocaleId): void {
  try {
    localStorage.setItem(LOCALE_KEY, id);
  } catch {
    // Private mode, blocked storage: the switch still happens for this session.
  }
}

// Whether the stored choice is EMPTY — no value at all, which is narrower than readPref()'s
// null (that also covers a value that is not a locale id). Only an empty key is a reader who
// never chose; a malformed one was put there by hand, and boot says nothing about it. Null
// when storage can't be read, which is not evidence either way.
function prefKeyEmpty(): boolean | null {
  try {
    return localStorage.getItem(LOCALE_KEY) === null;
  } catch {
    return null;
  }
}

// Whether this install has been used before: any `astro:` key besides the language's own, as
// it stood before ANY module ran — the index.html boot script takes that snapshot
// (window.__astroHadState). A check here, at init, can't promise it: a module that writes a key
// of its own while it loads (a downstream build's module did, 2026-10-09 — an earlier version
// of this comment said none did) makes a first visit look like a return, and the
// language-detected notice then tells a new reader their app changed language. The snapshot is
// the answer; the walk below is for a page without that script (the verify harness). False
// when storage can't be listed: a notice withheld costs less than one telling a first-time
// reader their app changed.
function hasOtherState(): boolean {
  const snapshot = (globalThis as { __astroHadState?: unknown }).__astroHadState;
  if (typeof snapshot === 'boolean') return snapshot;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('astro:') && key !== LOCALE_KEY) return true;
    }
  } catch {
    // Storage blocked, or a stand-in without length/key (the verify harness).
  }
  return false;
}

// The pseudo-locale's catalog: English with every string pseudoized, so a build's own
// namespaces read through `msgs` are marked as well as everything read through t().
let pseudo: { from: ComposedMessages; tree: ComposedMessages } | null = null;
function pseudoTree(): ComposedMessages {
  const from = composeLoaded('en').tree;
  if (pseudo?.from === from) return pseudo.tree;
  const map = (node: unknown): unknown => {
    if (typeof node === 'string') return pseudoize(node);
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) out[k] = map(v);
    return out;
  };
  pseudo = { from, tree: map(from) as ComposedMessages };
  return pseudo.tree;
}

// A device translation's catalog: English with the layer's translations laid over it — each
// only while the English it was made from is still the English (a string edited since shows
// English until it is translated again), and only with English's placeholders (the engine
// validated that already; this is the same guard every shipped catalog passes, registry.ts).
// Composed again only when the layer or the English moves.
let machineComposed: { from: ComposedMessages; layer: MachineLayer | null; composed: Composed } | null = null;

function cloneStrings(node: unknown): unknown {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return node;
  const proto = Object.getPrototypeOf(node);
  if (proto !== Object.prototype && proto !== null) return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) out[k] = cloneStrings(v);
  return out;
}

function setLeaf(tree: Record<string, unknown>, path: string, value: string): void {
  const parts = path.split('.');
  let node: Record<string, unknown> = tree;
  for (const part of parts.slice(0, -1)) {
    const next = node[part];
    if (next === null || typeof next !== 'object') return;
    node = next as Record<string, unknown>;
  }
  if (typeof node[parts[parts.length - 1]] === 'string') node[parts[parts.length - 1]] = value;
}

function composeMachine(id: MachineLocale): Composed {
  const from = composeEnglish();
  const layer = machineLayer?.id === id ? machineLayer : null;
  if (machineComposed && machineComposed.from === from && machineComposed.layer === layer) {
    return machineComposed.composed;
  }
  const tree = cloneStrings(from) as Record<string, unknown>;
  const translated = new Set<string>();
  for (const [key, entry] of layer?.entries ?? []) {
    if (resolvePath(from, key) !== entry.src) continue;
    if (!isMarkerPath(key) && !samePlaceholders(entry.text, entry.src)) continue;
    setLeaf(tree, key, entry.text);
    translated.add(key);
  }
  const composed: Composed = { tree: tree as ComposedMessages, translated };
  machineComposed = { from, layer, composed };
  return composed;
}

function composeNow(id: EffectiveLocale): Composed {
  if (id === 'qps') return { tree: pseudoTree(), translated: 'all' };
  if (isMachineLocale(id)) return composeMachine(id);
  return composeLoaded(id);
}

async function composeFor(id: EffectiveLocale): Promise<Composed> {
  return id === 'qps' || isMachineLocale(id) ? composeNow(id) : composeLocale(id);
}

function current(): Active {
  return active ?? { id: 'en', ...composeLoaded('en') };
}

function makeT(a: Active, lang: string): (key: string, vars?: TVars) => string {
  return (key, vars) => {
    requested.add(key);
    const template = resolvePath(a.tree, key);
    if (template === undefined) return key;
    // Plurals are chosen in the language of the template actually used: an English
    // fallback under Russian must not take Russian's `one` for 21.
    const usedLang = a.translated === 'all' || a.translated.has(key) ? lang : 'en';
    return interpolate(applyPlurals(template, usedLang, vars), vars);
  };
}

// The reader's pick. Once its language is on screen, and only if that moved the language,
// the after-pick hook runs: pageTranslation.ts installs one that reloads the page while a
// browser's page translator is at work (2026-10-09). A switch made under a translator leaves
// it translating text that is now already in the reader's language — machine output laid
// over our own translation, with every node it took frozen — and the translation lasts as
// long as the page does; a reload comes back untranslated, because index.html's boot script
// declares the new language before the browser decides whether to offer. Here rather than
// in the menu's handler so every way to pick (the Settings menu, the translate offer, a
// build's own control) does the same. A hook rather than an import: pageTranslation.ts reads
// this module, and this module stays free of the DOM (the verify harness runs it in Node).
function setLocale(id: LocaleId): Promise<void> {
  if (!isLocaleId(id)) return Promise.resolve();
  // A pick of anything but the device language being prepared or shown stops that work —
  // its download, its translating, its sweep (machine/engine.ts): the reader has moved on.
  // And a new choice ends the hold of an old one: there is nothing left to hold.
  const leaving = machineSession && machineSession.id !== id ? machineSession : null;
  if (leaving) machineSession = null;
  if (machineHeld && machineHeld.id !== id) machineHeld = null;
  const before = current().id;
  // Nothing is stored while the release hold stands (languageHold.ts, 2026-10-10). The menu marks
  // the language SHOWN — English, standing in for whatever the reader had chosen — and reports a
  // click on it like any other, so storing here would overwrite a stored 'es' with its
  // stand-in (CLAUDE.md rule 2: a control that shows a derived value refuses writes while the mask
  // is up). The switch itself still runs, for this page: under the hold it can only land on
  // English, or on the pseudo-locale in a development build.
  if (!LANGUAGES_HELD) {
    pref = id;
    writePref(id);
  }
  const switching = switchTo(effectiveFor(id));
  // Stopped only once the switch is DECIDED — switchTo has named its target (targetLocale) —
  // and still synchronously, inside the pick: the engine's stop reads where the store is going to
  // say what the menu shows, and before this line it would have seen the device language as
  // still on screen and left a line under the menu for a language the reader just left
  // (2026-10-10). Not after the switch lands: a pick finishing in that gap would adopt its
  // language over the one the reader has just chosen.
  leaving?.stop();
  return switching.then(() => {
    // A device language the reader has left: its layer goes (a later pick of it starts again
    // from its cache), unless it is still what the store shows.
    if (machineLayer && machineLayer.id !== pref && current().id !== machineLayer.id && inFlight !== machineLayer.id) {
      machineLayer = null;
    }
    if (current().id === before) return;
    try {
      afterPick?.();
    } catch (err) {
      console.warn('[i18n] the after-pick hook threw', err);
    }
  });
}

function build(): I18nSnapshot {
  const a = current();
  const lang = langOf(a.id);
  const tAny = makeT(a, lang);
  const t = tAny as TFn;
  return {
    locale: a.id,
    pref,
    machineHold: machineHeld,
    lang,
    t,
    tAny,
    fmt: makeFormatters(lang),
    labels: makeEnumLabels(t),
    msgs: a.tree,
    setLocale,
  };
}

// Publish a new snapshot only when something a reader could see moved — the language, the
// catalog, the stored choice, or whether a device-translation choice is held — so an
// idempotent init or a no-op switch re-renders nothing.
function commit(): void {
  const a = current();
  if (
    snapshot &&
    snapshot.locale === a.id &&
    snapshot.msgs === a.tree &&
    snapshot.pref === pref &&
    snapshot.machineHold === machineHeld
  ) {
    return;
  }
  snapshot = null;
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch (err) {
      console.error('[i18n] a locale listener threw', err);
    }
  }
}

// The newest switch. A superseded one settles when this does, so whoever awaited the old
// one (boot, a menu pick) resumes on the language the store actually lands on.
let latest: Promise<void> = Promise.resolve();

function switchTo(target: EffectiveLocale): Promise<void> {
  const p = runSwitch(target);
  latest = p;
  return p;
}

async function runSwitch(target: EffectiveLocale): Promise<void> {
  const mine = ++seq;
  inFlight = target;
  let id = target;
  let composed: Composed;
  try {
    composed = await composeFor(target);
  } catch (err) {
    console.warn(`[i18n] could not compose ${target}; showing English`, err);
    id = 'en';
    composed = composeLoaded('en');
  }
  if (mine !== seq) return latest; // a later switch (or registration) superseded this one
  inFlight = null;
  active = { id, ...composed };
  const lang = langOf(id);
  if (lang !== lastLang) applyDocumentLang(lang);
  commit();
}

onRegistryChange(() => {
  // A switch under way restarts, so the language it lands on includes the new pack.
  if (inFlight) {
    void switchTo(inFlight);
    return;
  }
  if (!active) {
    commit();
    return;
  }
  // Show the new namespaces at once, English-filled, then bring in their translation.
  const id = active.id;
  active = { id, ...composeNow(id) };
  commit();
  if (id !== 'en' && id !== 'qps') void switchTo(id);
});

// ── Public API ──────────────────────────────────────────────────────────────

/** The current snapshot — the same object until something changes. */
export function getI18n(): I18nSnapshot {
  if (!snapshot) snapshot = build();
  return snapshot;
}

/** Calls `fn` after every change. Returns the unsubscribe. */
export function subscribeI18n(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Calls `fn(snapshot)` now and after every change — for code outside React (a plain-DOM
 *  notice, a separately mounted root's own text). Returns the unsubscribe. */
export function onLocaleChange(fn: (snapshot: I18nSnapshot) => void): () => void {
  fn(getI18n());
  return subscribeI18n(() => fn(getI18n()));
}

/** t() with a loose key, for code outside React. Reads the snapshot at CALL time, so it is
 *  only locale-aware where it is called late — in a getter, a handler, a render — and never
 *  in a module-scope constant, which would freeze English. */
export function tStatic(key: string, vars?: TVars): string {
  return getI18n().tAny(key, vars);
}

/** True when the active locale is English, or when `key`'s text came from the active
 *  locale's own catalog rather than from the English fill. (The pseudo-locale counts as
 *  translated throughout: every string in it is its own.) */
export function isTranslated(key: string): boolean {
  const a = current();
  return a.translated === 'all' || a.translated.has(key);
}

/** Every key t / tAny / tStatic has been asked for this session. */
export function requestedKeys(): ReadonlySet<string> {
  return requested;
}

/** Records that a namespace was read whole — a build's own reader (`useNs` / `nsStatic`) hands
 *  out the composed object, so its keys never pass through t(). The on-device tier counts every
 *  key under a namespace noted here as asked for (2026-10-10). Cheap: one Set insert. */
export function noteNamespaceRead(ns: string): void {
  namespacesRead.add(ns);
}

/** Every namespace noteNamespaceRead has recorded this session. */
export function namespacesReadWhole(): ReadonlySet<string> {
  return namespacesRead;
}

// The English lookups, built once per English catalog and shared by the two readers that need
// English while the screen is in another language: documentI18n (a device translation prints
// English) and englishSnapshot (a binding-language area showing the English in place). One
// build, so the two can't come to disagree about what "the English" is. (2026-10-10)
interface EnglishParts {
  from: ComposedMessages;
  t: TFn;
  tAny: (key: string, vars?: TVars) => string;
  fmt: Formatters;
  labels: EnumLabels;
}
let englishParts: EnglishParts | null = null;

function englishPartsNow(): EnglishParts {
  const from = composeEnglish();
  if (englishParts?.from !== from) {
    const tAny = makeT({ id: 'en', tree: from, translated: 'all' }, 'en');
    const t = tAny as TFn;
    englishParts = { from, t, tAny, fmt: makeFormatters('en'), labels: makeEnumLabels(t) };
  }
  return englishParts;
}

// The English half of documentI18n, built once per English catalog.
let documentEnglish: { from: ComposedMessages; value: DocumentI18n } | null = null;

// englishSnapshot's last answer, and the live snapshot and English catalog it was built from.
let englishView: { base: I18nSnapshot; from: ComposedMessages; value: I18nSnapshot } | null = null;

/** The live snapshot with its TEXT in English — t, tAny, msgs, labels, and fmt and lang 'en',
 *  locale 'en' — for what an EnglishScope (I18nProvider.tsx) hands its descendants: a binding-
 *  language area whose reader asked to see the English in place (2026-10-10). The stored choice,
 *  the hold and setLocale are the live ones: the scope changes what a part of the screen is
 *  written in, not what the reader chose. The live snapshot itself while it is English already;
 *  otherwise the same object until the live snapshot or the English catalog moves, so a scoped
 *  component re-renders exactly when an unscoped one would. Never writes anything. */
export function englishSnapshot(base: I18nSnapshot = getI18n()): I18nSnapshot {
  if (base.locale === 'en') return base;
  const e = englishPartsNow();
  if (englishView?.base !== base || englishView.from !== e.from) {
    englishView = {
      base,
      from: e.from,
      value: {
        ...base,
        locale: 'en',
        lang: 'en',
        t: e.t,
        tAny: e.tAny,
        fmt: e.fmt,
        labels: e.labels,
        msgs: e.from,
      },
    };
  }
  return englishView.value;
}

export type DocumentI18n = Pick<I18nSnapshot, 'locale' | 'lang' | 't' | 'tAny' | 'fmt' | 'labels'>;

/** What a DOCUMENT is written in, for a file or print a build exports: the language on screen
 *  when it is one this build ships (or English, or the dev pseudo-locale), and ENGLISH while the
 *  screen is in a device translation. Machine text is there to help someone read the app; a
 *  document is handed to someone else as a record, and nobody has checked a word of it.
 *  (2026-10-10) */
export function documentI18n(): DocumentI18n {
  const s = getI18n();
  if (!isMachineLocale(s.locale)) return s;
  const e = englishPartsNow();
  if (documentEnglish?.from !== e.from) {
    documentEnglish = {
      from: e.from,
      value: { locale: 'en', lang: 'en', t: e.t, tAny: e.tAny, fmt: e.fmt, labels: e.labels },
    };
  }
  return documentEnglish.value;
}

// ── The on-device tier's side of the store (machine/engine.ts calls these) ──

/** Lays `entries` over English as `id`'s catalog (a new map each call — the store keeps it).
 *  Shown at once when `id` is the language on screen; when it is the reader's stored choice
 *  and not on screen yet (a boot whose cache arrived after the wait), the store switches to it
 *  — the reader's own language arriving, as a late catalog does. Never writes the choice.
 *
 *  Every call that changes what `id` reads gives the app a new catalog, so every component
 *  re-renders — and the map's popup effects (Map.tsx, the ones keyed on `t`) tear their popups
 *  down when it does. The engine therefore calls this at most once per 1.5 s while it is
 *  translating what is on screen, and once when its sweep ends; never per key. */
export function publishMachine(id: MachineLocale, entries: ReadonlyMap<string, MachineEntry>): void {
  machineLayer = { id, entries };
  if (machineHeld?.id === id) machineHeld = null;
  if (inFlight === id) {
    void switchTo(id);
  } else if (current().id === id) {
    active = { id, ...composeNow(id) };
    commit();
  } else if (pref === id) {
    void switchTo(id);
  } else {
    commit();
  }
}

/** The reader's pick of `id` is ready (its on-screen keys are translated, or 15 s passed):
 *  lays `entries` over English and makes `id` the choice exactly as a menu pick of a shipped
 *  language does — stored, `<html lang>` set, everyone notified. */
export function adoptMachine(id: MachineLocale, entries: ReadonlyMap<string, MachineEntry>): Promise<void> {
  machineLayer = { id, entries };
  if (machineHeld?.id === id) machineHeld = null;
  return setLocale(id);
}

/** `id` can't be shown on this device now — no translator and nothing cached, or the module
 *  failed to load: HELD under rule 2. The stored choice stays as it is; the app shows the
 *  detected language or English; `machineHold` carries the reason. */
export function holdMachine(id: MachineLocale, reason: MachineHoldReason): void {
  machineHeld = { id, lang: id.slice(3), reason };
  if (machineLayer?.id === id) machineLayer = null;
  if (current().id === id || inFlight === id) void switchTo(effectiveFor(pref));
  else commit();
}

/** The work machine/engine.ts is doing for `id`, and how to stop it; null clears. A pick of any
 *  other language stops it (setLocale). */
export function setMachineSession(session: { id: MachineLocale; stop: () => void } | null): void {
  machineSession = session;
}

/** The work in progress set above, or null. */
export function currentMachineSession(): { id: MachineLocale; stop: () => void } | null {
  return machineSession;
}

/** Where the store is going: the target of a switch under way, else the language on screen.
 *  The engine reads it when it stops, to say whether the language it served is still the one
 *  shown (setLocale stops it after the switch is decided, so this already names the new one).
 *  (2026-10-10) */
export function targetLocale(): EffectiveLocale {
  return inFlight ?? current().id;
}

/** Whether choosing `code` in the Language menu would only write the MASK back over a held
 *  choice (CLAUDE.md rule 2, 2026-10-10). While a stored device language is held, the menu marks
 *  the language shown in its place — the effective value — and a click on that marked row would
 *  store it, silently replacing the reader's real choice with what was only standing in for it.
 *  Such a re-pick is a no-op; choosing any OTHER row is a real choice and goes through. */
export function isHeldRepick(code: string): boolean {
  return machineHeld !== null && code === current().id;
}

// Boot, for a stored device-translation choice: load the on-device module and let it bring the
// language's cache in (and its translator, where the device has one ready). The module is a lazy
// chunk; nothing of it loads for a reader who never chose such a language.
function resumeMachine(id: MachineLocale): Promise<void> {
  // Not while the release hold stands (languageHold.ts, 2026-10-10): the module is never fetched,
  // and the choice is masked to English SILENTLY — no holdMachine, so no reason on the snapshot
  // and no language-held notice. That notice says the device can't translate any more; a release
  // hold is not that, and telling the reader it was would be a reason that isn't true. The stored
  // choice is left as it is, and comes back when the hold lifts.
  if (LANGUAGES_HELD) return Promise.resolve();
  return import('./machine/engine')
    .then((m) => {
      // Undefined when a host's vite:preloadError handler swallowed a failed fetch.
      if (!m?.resumeMachine) {
        holdMachine(id, 'failed');
        return;
      }
      return m.resumeMachine(id);
    })
    .catch((err) => {
      console.warn('[i18n] the on-device translation module failed to load', err);
      holdMachine(id, 'failed');
    });
}

/** Sets `<html lang>` — which decides the browser's translate offer, and what CSS casing
 *  does (Turkish uppercase needs lang="tr" to give İ) — and remembers what it wrote. */
export function applyDocumentLang(lang: string): void {
  lastLang = lang;
  try {
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  } catch {
    // No document (the verify harness) — nothing to write.
  }
}

/** The `lang` this runtime last gave `<html>`, or null before it has. A different value on
 *  the element was written by something else — a page translator. */
export function lastWrittenLang(): string | null {
  return lastLang;
}

/** The language boot DETECTED — the reader never chose one, their browser asks for one that
 *  ships, and it is the language on screen now — or null. Null as well once the reader picks a
 *  language (that ends the question), and while the detected catalog has not arrived (the app
 *  is still in English, so nothing has changed yet). The language-detected notice reads it
 *  (App, lib/autoFlipNotice): only `existingInstall` is a change to announce, since a first
 *  visit was never in English. Never writes anything. (2026-10-09) */
export function detectedAtBoot(): BootDetection | null {
  if (!bootDetected || pref !== null) return null;
  return current().id === bootDetected.locale ? bootDetected : null;
}

/** Installs what a pick runs once its language is on screen and only if the language moved
 *  (setLocale says why); null removes it. One hook — the page-translation bridge's. */
export function setAfterLocalePick(fn: (() => void) | null): void {
  afterPick = fn;
}

/** Boot: read the stored choice, resolve the language, load and compose its catalog, set
 *  `<html lang>`. Idempotent, and never rejects — a catalog that fails to load leaves the
 *  app in English rather than stopping it. */
export function initI18n(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      pref = readPref();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const wait = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, INIT_WAIT_MS);
      });
      // A device-translation choice: its cache comes in first, within the same wait, so a
      // reader who chose French comes back to French rather than to a flash of English. If the
      // device can't show it, the module holds it (holdMachine) and the line below resolves to
      // the detected language. A cache that arrives after the wait still swaps in (publishMachine).
      if (pref !== null && isMachineLocale(pref)) await Promise.race([resumeMachine(pref), wait]);
      // A reader who never chose, landing on a language their browser asks for: recorded for
      // the language-detected notice (detectedAtBoot, above). Classified here, at boot, because
      // whether the install had been used before can only be read before this session writes.
      const empty = prefKeyEmpty();
      const detected = effectiveFor(pref);
      bootDetected =
        pref === null && empty === true && isShippedLocale(detected) && detected !== 'en'
          ? { locale: detected, existingInstall: hasOtherState() }
          : null;
      const done = switchTo(detected);
      await Promise.race([done, wait]);
      clearTimeout(timer);
      // English shows meanwhile; give <html> its lang now rather than after the wait.
      if (lastLang === null) applyDocumentLang('en');
      commit();
    })();
  }
  return initPromise;
}

/** Test seams (verify-i18n-runtime). */
export const __testing = {
  /** Treat these locales as available (null restores languages.ts). */
  setAvailable(list: readonly ShippedLocale[] | null): void {
    availableOverride = list;
  },
  /** Switch to a locale regardless of availability, without touching the stored choice. */
  activate(id: EffectiveLocale): Promise<void> {
    return switchTo(id);
  },
  /** Forget boot, the active locale and the requested keys, as on a fresh page. */
  reset(): void {
    seq += 1;
    latest = Promise.resolve();
    initPromise = null;
    active = null;
    pref = null;
    inFlight = null;
    lastLang = null;
    availableOverride = null;
    bootDetected = null;
    afterPick = null;
    requested.clear();
    namespacesRead.clear();
    machineSession?.stop();
    machineSession = null;
    machineLayer = null;
    machineHeld = null;
    machineComposed = null;
    documentEnglish = null;
    englishParts = null;
    englishView = null;
    commit();
  },
};
