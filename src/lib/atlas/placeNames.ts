// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The atlas's place names in the interface language.
//
// The atlas is English. For each other shipped language, data/names/<lang>.json holds the
// city and region names that differ from the English (scripts/build-city-names.mjs); a
// country is named by the runtime (countryName.ts). This module follows the interface
// language: it loads that language's file as its own chunk when the language is chosen,
// and nothing at all while it is English — or a device translation, which has no file.
//
// Everything here is synchronous to read: a lookup answers from the file in hand, and
// answers English while it is still on its way. A surface that wants to redraw when it
// lands subscribes (subscribePlaceNames / usePlaceNamesVersion); one that labels a place
// once and keeps the label (a pick, a saved place) awaits placeNamesReady() first.
//
// Kept apart from cityLookup, like placeLabel: the atlas is a lazy chunk, and code that
// only needs a name — or to know when names change — must not pull it in.

import { useSyncExternalStore } from 'react';
import { getI18n, subscribeI18n } from '../../i18n/runtime';
import { countryDisplayName } from './countryName';
import { foldName } from './placeLabel';

/** The languages with a names file. */
export const PLACE_NAME_LANGS = ['es', 'pt', 'tr', 'de', 'ru', 'pl'] as const;
export type PlaceNameLang = (typeof PLACE_NAME_LANGS)[number];

/** One language's names: city by geonameid, region by "CC.code" — only where the name
 *  differs from the atlas's English. */
export interface PlaceNamesFile {
  cities: Record<string, string>;
  admin1: Record<string, string>;
}

// One chunk per language, fetched on first use.
const loaders: Record<PlaceNameLang, () => Promise<{ default: unknown }>> = {
  es: () => import('./data/names/es.json'),
  pt: () => import('./data/names/pt.json'),
  tr: () => import('./data/names/tr.json'),
  de: () => import('./data/names/de.json'),
  ru: () => import('./data/names/ru.json'),
  pl: () => import('./data/names/pl.json'),
};

const isNameLang = (code: string): code is PlaceNameLang =>
  (PLACE_NAME_LANGS as readonly string[]).includes(code);

// The language the screen asks for (null: English, or a language with no file), whether
// its file failed to load (so the next notice retries it), and the file in force — which
// is only ever the target's: one language's names never show under another's.
let target: PlaceNameLang | null = null;
let failed = false;
let active: PlaceNamesFile | null = null;
let pending: Promise<void> = Promise.resolve();
const loaded = new Map<PlaceNameLang, PlaceNamesFile>();

let version = 0;
const listeners = new Set<() => void>();
function changed(): void {
  version++;
  for (const fn of [...listeners]) fn();
}

function follow(lang: PlaceNameLang | null): Promise<void> {
  if (lang === target && !failed) return pending;
  const moved = lang !== target || active !== null;
  target = lang;
  failed = false;
  active = lang ? (loaded.get(lang) ?? null) : null;
  if (!lang || active) {
    pending = Promise.resolve();
    if (moved) changed();
    return pending;
  }
  // The country part of a label follows the target at once (the runtime names it); the
  // city and region parts follow when the file lands.
  if (moved) changed();
  pending = loaders[lang]()
    .then((m) => {
      const file = m.default as PlaceNamesFile;
      loaded.set(lang, file);
      if (target !== lang) return;
      active = file;
      changed();
    })
    .catch(() => {
      // Offline, say: the names read in English, and the next language notice retries.
      if (target === lang) failed = true;
    });
  return pending;
}

let wired = false;
let pinned = false; // the verify harness's own language, in place of the interface's
const screenLang = (): PlaceNameLang | null => {
  const locale = getI18n().locale;
  return isNameLang(locale) ? locale : null;
};
function wire(): void {
  if (wired) return;
  wired = true;
  const sync = () => void (pinned || follow(screenLang()));
  subscribeI18n(sync);
  sync();
}

/** A number that moves whenever the names in force do — the snapshot half of
 *  {@link subscribePlaceNames}. */
export function placeNamesVersion(): number {
  return version;
}

/** Calls `fn` whenever the names in force change (a language switch, a file landing).
 *  Subscribing starts following the interface language. Returns the unsubscribe. */
export function subscribePlaceNames(fn: () => void): () => void {
  wire();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The names version, re-rendering the caller when it moves. Put it in the deps of
 *  whatever computes a place label. */
export function usePlaceNamesVersion(): number {
  return useSyncExternalStore(subscribePlaceNames, placeNamesVersion, placeNamesVersion);
}

/** Resolves once the interface language's names are in force, or have failed to load
 *  (English then stands). Never rejects. For a label made once and kept. */
export function placeNamesReady(): Promise<void> {
  wire();
  // Asked of the language on screen NOW, so a caller woken by the same switch that this
  // module's own listener has yet to hear still waits for the new language's names.
  return pinned ? pending : follow(screenLang());
}

/** The language the names in force are in, or null when they are English. */
export function placeNamesLang(): PlaceNameLang | null {
  wire();
  return target;
}

/** The names file in force, or null (English). For building search keys. */
export function placeNamesFile(): PlaceNamesFile | null {
  wire();
  return active;
}

/** A city's name in the interface language; `english` where there is none. */
export function localCityName(gid: number, english: string): string {
  wire();
  return (gid && active?.cities[gid]) || english;
}

/** A region's name in the interface language; `english` where there is none. */
export function localRegionName(key: string, english: string): string {
  wire();
  return active?.admin1[key] || english;
}

/** A country's name in the interface language; `english` (the atlas's) in English. */
export function localCountryName(cc: string, english: string): string {
  wire();
  return target ? countryDisplayName(cc, english, target) : english;
}

/**
 * The folding a localized name is searched by: foldName, and Turkish dotless ı read as i —
 * NFD leaves ı whole, so "Kırıkkale" would otherwise never match a typed "kirikkale". Kept
 * apart from foldName, which the English keys and the label rule share.
 */
export const foldLocalName = (s: string): string => foldName(s).replace(/ı/g, 'i');

/** For the verify harness: put the names in force for `lang` (null: English) without the
 *  interface language, and resolve once they are. */
export function setPlaceNamesLangForTest(lang: PlaceNameLang | null): Promise<void> {
  wire();
  pinned = true;
  return follow(lang);
}
