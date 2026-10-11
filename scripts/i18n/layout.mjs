// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Where the core's locale catalogs live on disk, and the few facts about locales the tools
// read from the app's own source rather than restating (2026-10-09):
//
//   src/i18n/en/<frag>.ts      English, one fragment per feature (the source of truth)
//   src/i18n/<loc>/<frag>.ts   a locale's fragments: same names, same key order, generated
//   src/i18n/<loc>.ts          composes them (`satisfies LocaleTree`)
//   src/i18n/<loc>.lock.json   what each value was translated from, and how (see below)
//   src/i18n/locales.ts        the lazy loader map (coreLocaleLoaders), generated
//
// The lock: { locale, keys: { "<key>": { src, out, st } } } — `src` the hash of the English
// the value was made from, `out` the hash of the value as written, `st` how it got there
// (machine | reviewed | fixed | human | approved). A value whose hash no longer matches `out`
// was edited by hand, and the tools keep it. `approved` means a person who reads the language
// checked the value. A `text` field, where an older lock has one, is written back unchanged.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseModule, staticValue } from './extract-lib.mjs';

export const LOCALE_CODE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export function corePaths(coreRoot, loc) {
  const i18n = resolve(coreRoot, 'src/i18n');
  return {
    i18n,
    dir: resolve(i18n, loc),
    compose: resolve(i18n, `${loc}.ts`),
    lock: resolve(i18n, `${loc}.lock.json`),
    loaders: resolve(i18n, 'locales.ts'),
    frag: (frag) => resolve(i18n, loc, `${frag}.ts`),
  };
}

/** Locale codes that have a catalog directory in src/i18n (never 'en'). */
export function coreLocalesOnDisk(coreRoot) {
  const i18n = resolve(coreRoot, 'src/i18n');
  return readdirSync(i18n)
    .filter((n) => n !== 'en' && LOCALE_CODE.test(n) && statSync(resolve(i18n, n)).isDirectory())
    .sort();
}

/** The ShippedLocale union from src/i18n/types.ts — the codes a loader map may name. */
export function shippedLocales(coreRoot) {
  const text = readFileSync(resolve(coreRoot, 'src/i18n/types.ts'), 'utf8');
  const m = /export type ShippedLocale\s*=\s*([^;]+);/.exec(text);
  if (!m) return ['en'];
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** A language's own name, as the language menu shows it (languages.ts), else Intl's. */
export function autonym(coreRoot, loc) {
  try {
    const mod = parseModule(resolve(coreRoot, 'src/i18n/languages.ts'));
    const exp = mod.exportsMap.get('LANGUAGES');
    const list = exp ? staticValue(mod, exp.decl.initializer) : [];
    const hit = Array.isArray(list) ? list.find((l) => l && l.code === loc) : null;
    if (hit?.autonym) return hit.autonym;
  } catch {
    /* fall through */
  }
  try {
    const name = new Intl.DisplayNames([loc], { type: 'language' }).of(loc);
    if (name && name !== loc) return name.charAt(0).toLocaleUpperCase(loc) + name.slice(1);
  } catch {
    /* fall through */
  }
  return loc;
}

export function readLock(file, locale) {
  if (!existsSync(file)) return { locale, keys: {} };
  const lock = JSON.parse(readFileSync(file, 'utf8'));
  return { locale: lock.locale ?? locale, keys: lock.keys ?? {} };
}

/**
 * The lock as written: keys sorted, one key per line, so a diff of the lock shows exactly the
 * keys that changed and nothing else.
 */
export function lockText(lock, eol = '\n') {
  const keys = Object.keys(lock.keys).sort();
  const line = (k) => {
    const e = lock.keys[k];
    const fields = [`"src": ${JSON.stringify(e.src)}`, `"out": ${JSON.stringify(e.out)}`, `"st": ${JSON.stringify(e.st)}`];
    if (e.text !== undefined) fields.push(`"text": ${JSON.stringify(e.text)}`);
    return `    ${JSON.stringify(k)}: { ${fields.join(', ')} }`;
  };
  const body = keys.length ? `{${eol}${keys.map(line).join(`,${eol}`)}${eol}  }` : '{}';
  return `{${eol}  "locale": ${JSON.stringify(lock.locale)},${eol}  "keys": ${body}${eol}}${eol}`;
}
