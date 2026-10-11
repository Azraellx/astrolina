// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// What a build adds to the core catalog, and how the catalog a reader sees is composed
// from it (2026-10-09). A build — the hosted one, with its own plugins — registers a PACK:
// new namespaces, and overrides of core strings that are false in that build. Composition
// is pure: `en` is never written to (it used to be, in place, by the build that needed its
// strings in it — which worked for English and could not work for a second language).
//
// The composed catalog for a locale L, in order:
//   1. English: the core's `en`, every pack's English namespaces, every English override.
//   2. L's own text: the core's L catalog and every pack's L namespaces, laid over (1)'s
//      shape — any leaf L lacks, or whose placeholders don't match English's, is (1)'s.
//   3. Each overridden path: the pack's L override, else the ENGLISH override — never the
//      core's own L translation of that path. The core's string states open-core facts that
//      are false in this build; translating them faithfully would only make them false in
//      another language. An override `{ ref }` resolves against the composed L tree, so a
//      reference reads each locale's own translation of the referenced key.
// Leaves that came from L itself are recorded, which is what isTranslated() answers from.
import { en } from './en';
import { loadCoreCatalog, loadedCoreCatalog } from './catalog';
import { samePlaceholders } from './plural';
import { resolvePath } from './t';
import type { MessagePack, Messages, ShippedLocale } from './types';

/** A composed catalog: the core's shape plus every registered namespace. */
export type ComposedMessages = Messages & Record<string, unknown>;

type PackLoader = () => Promise<{ default: MessagePack }>;
type OverrideValue = string | { ref: string };

interface Registration {
  en: MessagePack;
  locales: Partial<Record<ShippedLocale, PackLoader>>;
  /** Each locale's pack once loaded; null when the pack ships none for that locale. */
  loaded: Map<ShippedLocale, MessagePack | null>;
}

export interface Composed {
  tree: ComposedMessages;
  /** The dot-paths whose text came from the locale itself; 'all' for English. */
  translated: ReadonlySet<string> | 'all';
}

const registrations: Registration[] = [];
const listeners = new Set<() => void>();

type Tree = Record<string, unknown>;

function isPlainObject(v: unknown): v is Tree {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

// A deep copy of the nested objects. Anything that isn't a string or a plain object (an
// array, a function a namespace still carries) is not text this runtime translates, and is
// passed through by reference.
function cloneTree(node: unknown): unknown {
  if (!isPlainObject(node)) return node;
  const out: Tree = {};
  for (const [k, v] of Object.entries(node)) out[k] = cloneTree(v);
  return out;
}

function setPath(tree: Tree, path: string, value: string): void {
  const parts = path.split('.');
  let node: Tree = tree;
  for (const part of parts.slice(0, -1)) {
    const next = node[part];
    if (!isPlainObject(next)) return;
    node = next;
  }
  node[parts[parts.length - 1]] = value;
}

// ── Registration ────────────────────────────────────────────────────────────

/**
 * Add a build's message pack: `namespaces` become new top-level namespaces, `overrides`
 * replace core leaves (by dot-path) in this build. `locales` lazily loads the same pack's
 * translation for each shipped locale. May be called before or after initI18n(); a late
 * registration recomposes the active catalog and notifies. Registering the same pack
 * object again only adds the locale loaders.
 */
export function registerMessages(
  enPack: MessagePack,
  locales: Partial<Record<ShippedLocale, PackLoader>> = {},
): void {
  const existing = registrations.find((r) => r.en === enPack);
  if (existing) {
    for (const loc of Object.keys(locales) as ShippedLocale[]) existing.loaded.delete(loc);
    existing.locales = { ...existing.locales, ...locales };
    changed();
    return;
  }
  // A namespace may not replace a core one (that is what overrides are for, leaf by leaf,
  // with a reason at each), nor one another pack already registered: the first stays.
  for (const ns of Object.keys(enPack.namespaces ?? {})) {
    if (ns in en) {
      console.error(`[i18n] namespace "${ns}" collides with a core namespace — the core's is kept.`);
    } else if (registrations.some((r) => r.en.namespaces && ns in r.en.namespaces)) {
      console.error(`[i18n] namespace "${ns}" is already registered — the first is kept.`);
    }
  }
  for (const path of Object.keys(enPack.overrides ?? {})) {
    if (resolvePath(en, path) === undefined) {
      console.error(`[i18n] override "${path}" names no core string — it has nothing to replace.`);
    }
  }
  registrations.push({ en: enPack, locales: { ...locales }, loaded: new Map() });
  changed();
}

/** Called after every registration. The runtime recomposes from it. */
export function onRegistryChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

let english: EnglishComposition | null = null;
const composedCache = new Map<ShippedLocale, Composed>();

function changed(): void {
  english = null;
  composedCache.clear();
  for (const fn of [...listeners]) fn();
}

// ── English ─────────────────────────────────────────────────────────────────

interface EnglishComposition {
  tree: ComposedMessages;
  /** Which registration owns each added namespace. */
  owner: Map<string, Registration>;
  /** Every overridden core path and the registration whose override stands (the last). */
  overrides: Map<string, { reg: Registration; value: OverrideValue }>;
}

function composeEnglishFull(): EnglishComposition {
  if (english) return english;
  const tree = cloneTree(en) as Tree;
  const owner = new Map<string, Registration>();
  for (const reg of registrations) {
    for (const [ns, sub] of Object.entries(reg.en.namespaces ?? {})) {
      if (ns in tree) continue; // a collision, reported at registration
      tree[ns] = cloneTree(sub);
      owner.set(ns, reg);
    }
  }
  const overrides = new Map<string, { reg: Registration; value: OverrideValue }>();
  for (const reg of registrations) {
    for (const [path, value] of Object.entries(reg.en.overrides ?? {})) {
      if (resolvePath(en, path) === undefined) continue; // reported at registration
      overrides.set(path, { reg, value });
    }
  }
  for (const [path, o] of overrides) {
    if (typeof o.value === 'string') setPath(tree, path, o.value);
  }
  const refOf = (path: string) => {
    const v = overrides.get(path)?.value;
    return v !== undefined && typeof v !== 'string' ? v.ref : null;
  };
  for (const path of overrides.keys()) {
    if (refOf(path) === null) continue;
    const target = followRef(path, refOf);
    const text = resolvePath(tree, target);
    if (text === undefined) {
      console.error(`[i18n] override "${path}" refers to "${target}", which is not a string.`);
      continue;
    }
    setPath(tree, path, text);
  }
  english = { tree: tree as ComposedMessages, owner, overrides };
  return english;
}

// Follow a chain of references to the key that holds text (a reference to a reference is
// allowed; a cycle stops where it closes).
function followRef(path: string, refOf: (p: string) => string | null): string {
  const seen = new Set<string>();
  let at = path;
  for (let next = refOf(at); next !== null && !seen.has(at); next = refOf(at)) {
    seen.add(at);
    at = next;
  }
  return at;
}

/** The English catalog with every registered namespace and override applied. Synchronous;
 *  the same object until something is registered. Never mutates `en`. */
export function composeEnglish(): ComposedMessages {
  return composeEnglishFull().tree;
}

// ── Other locales ───────────────────────────────────────────────────────────

// A braced word under a pack's `markers` (types.ts): only the count is English's to keep.
const MARKED_WORD = /\{[^{}]+\}/g;
function sameMarkers(l: string, e: string): boolean {
  const count = (s: string) => (s.match(MARKED_WORD) ?? []).length;
  return count(l) === count(e) && !/[{}]/.test(l.replace(MARKED_WORD, ''));
}

function markerTest(patterns: readonly string[] | undefined): (path: string) => boolean {
  if (!patterns?.length) return () => false;
  const split = patterns.map((p) => p.split('.'));
  return (path) => {
    const parts = path.split('.');
    return split.some((p) => p.length === parts.length && p.every((seg, i) => seg === '*' || seg === parts[i]));
  };
}

// Lay the locale's text over English's shape. A leaf is the locale's only if it is a string
// whose placeholder set matches English's — a translation that dropped or renamed a
// `{name}` would print a raw token or lose a value, so that key shows English instead.
// Under a marker path the braces hold a translated word, so the test is their count.
function fill(
  e: unknown,
  l: unknown,
  path: string,
  translated: Set<string>,
  isMarker: (path: string) => boolean,
): unknown {
  if (typeof e === 'string') {
    if (typeof l === 'string' && (l === e || (isMarker(path) ? sameMarkers(l, e) : samePlaceholders(l, e)))) {
      translated.add(path);
      return l;
    }
    return e;
  }
  if (isPlainObject(e)) {
    const src = isPlainObject(l) ? l : undefined;
    const out: Tree = {};
    for (const [k, v] of Object.entries(e)) out[k] = fill(v, src?.[k], path ? `${path}.${k}` : k, translated, isMarker);
    return out;
  }
  return e;
}

/** Compose a locale from whatever of its sources is already loaded — synchronous, for a
 *  recomposition that cannot wait (a late registration). Missing sources read as English. */
export function composeLoaded(locale: ShippedLocale): Composed {
  const E = composeEnglishFull();
  if (locale === 'en') return { tree: E.tree, translated: 'all' };
  const cached = composedCache.get(locale);
  if (cached) return cached;

  const core = loadedCoreCatalog(locale) as Tree | null;
  const translated = new Set<string>();
  const tree: Tree = {};
  const noMarkers = markerTest(undefined);
  for (const [ns, eSub] of Object.entries(E.tree as Tree)) {
    const reg = E.owner.get(ns);
    const source = reg ? reg.loaded.get(locale)?.namespaces?.[ns] : core?.[ns];
    tree[ns] = fill(eSub, source, ns, translated, reg ? markerTest(reg.en.markers) : noMarkers);
  }

  // Overrides. A pack's own L text wins; with none, the English override stands — the
  // core's L translation of the path is dropped either way.
  const refOf = (path: string): string | null => {
    const o = E.overrides.get(path);
    if (!o) return null;
    const own = o.reg.loaded.get(locale)?.overrides?.[path];
    if (typeof own === 'string') return null;
    if (own) return own.ref;
    return typeof o.value === 'string' ? null : o.value.ref;
  };
  for (const [path, o] of E.overrides) {
    if (refOf(path) !== null) continue;
    const englishText = resolvePath(E.tree, path) ?? '';
    const own = o.reg.loaded.get(locale)?.overrides?.[path];
    if (typeof own === 'string' && samePlaceholders(own, englishText)) {
      setPath(tree, path, own);
      translated.add(path);
    } else {
      setPath(tree, path, englishText);
      translated.delete(path);
    }
  }
  for (const path of E.overrides.keys()) {
    if (refOf(path) === null) continue;
    const target = followRef(path, refOf);
    const text = resolvePath(tree, target);
    if (text === undefined) continue; // reported when English was composed
    setPath(tree, path, text);
    if (translated.has(target)) translated.add(path);
    else translated.delete(path);
  }

  const composed: Composed = { tree: tree as ComposedMessages, translated };
  composedCache.set(locale, composed);
  return composed;
}

/** Load every source a locale has — the core's catalog and each pack's — then compose it.
 *  A source that fails to load reads as English (and is retried on the next call). */
export async function composeLocale(locale: ShippedLocale): Promise<Composed> {
  if (locale !== 'en') {
    const tasks: Promise<unknown>[] = [
      loadCoreCatalog(locale).catch((err) => console.warn(`[i18n] the core ${locale} catalog failed to load`, err)),
    ];
    for (const reg of registrations) {
      if (reg.loaded.has(locale)) continue;
      const loader = reg.locales[locale];
      if (!loader) {
        reg.loaded.set(locale, null);
        continue;
      }
      tasks.push(
        loader().then(
          (mod) => {
            // `mod` is undefined when a host's vite:preloadError handler swallowed the failure
            // (a reload is then already on its way): read as not loaded, retried next time.
            if (mod?.default) reg.loaded.set(locale, mod.default);
          },
          (err) => console.warn(`[i18n] a registered ${locale} pack failed to load`, err),
        ),
      );
    }
    await Promise.all(tasks);
    composedCache.delete(locale);
  }
  return composeLoaded(locale);
}

/** The composed catalog for a locale: English-filled, overrides applied. Pure — a new
 *  composition never changes an earlier one, and `en` is never written. */
export async function composeCatalog(locale: ShippedLocale): Promise<ComposedMessages> {
  return (await composeLocale(locale)).tree;
}

// ── What the on-device tier asks of the registrations (2026-10-10) ──────────

/** True when `path` is under a registered pack's `markers` — its braces hold a translated
 *  word for styling, not a value (types.ts). The on-device tier masks such a word as a pair
 *  and keeps exactly one pair round it (i18n/machine/mask.ts). */
export function isMarkerPath(path: string): boolean {
  const ns = path.split('.', 1)[0];
  const reg = composeEnglishFull().owner.get(ns);
  return reg ? markerTest(reg.en.markers)(path) : false;
}

/** True when a registered pack asks the on-device tier to leave `path` in English
 *  (`machineExclude`, types.ts): text with legal weight, and data. A pattern covers its own
 *  path and everything beneath it. Any pack may name any path — its own namespaces, or a core
 *  leaf it overrides (a build's licence statements are overrides) — since the build is the one
 *  that knows which of its words carry legal weight. The core itself excludes nothing. */
export function isMachineExcluded(path: string): boolean {
  const parts = path.split('.');
  return registrations.some((reg) =>
    (reg.en.machineExclude ?? []).some((p) => {
      const seg = p.split('.');
      return seg.length <= parts.length && seg.every((s, i) => s === '*' || s === parts[i]);
    }),
  );
}

/** Test seam (verify-i18n-runtime): forget every registration, as on a fresh page. */
export function __resetRegistryForTest(): void {
  registrations.length = 0;
  changed();
}
