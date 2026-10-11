// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The writer for generated locale files (2026-10-09). Its one job is to be DETERMINISTIC:
// the same translations always produce the same bytes, so running the pipeline twice is no
// diff, and a diff in review is only ever a change in words.
//
// Hence: keys in the English file's order, 2-space indent, single quotes, one fixed escape
// table, every value on one line however long (re-wrapping would make a one-word edit look
// like a paragraph rewrite), `as const`, and the line ending the English source uses. A file
// is only written when its bytes change, so an unchanged locale doesn't even touch mtimes.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const ESCAPES = { '\\': '\\\\', "'": "\\'", '\n': '\\n', '\r': '\\r', '\t': '\\t' };

/** A single-quoted JS string literal. Non-ASCII text stays as written (the files are UTF-8). */
export function quote(s) {
  let out = "'";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (ESCAPES[ch]) out += ESCAPES[ch];
    // Control characters, and the two Unicode line separators JS source treats as line ends.
    else if (c < 0x20 || c === 0x7f || c === 0x2028 || c === 0x2029) out += `\\u${c.toString(16).padStart(4, '0')}`;
    else out += ch;
  }
  return `${out}'`;
}

export function keyText(k) {
  return /^[A-Za-z_$][\w$]*$/.test(k) ? k : quote(k);
}

/** Build an ordered tree (nested Maps) from [path[], value] pairs, in the order given. */
export function treeOf(pairs) {
  const root = new Map();
  for (const [path, value] of pairs) {
    let node = root;
    for (let i = 0; i < path.length - 1; i += 1) {
      if (!node.has(path[i])) node.set(path[i], new Map());
      node = node.get(path[i]);
    }
    node.set(path[path.length - 1], value);
  }
  return root;
}

function objectLines(tree, depth) {
  const pad = '  '.repeat(depth);
  const lines = [];
  for (const [k, v] of tree) {
    if (v instanceof Map) {
      if (v.size === 0) continue;
      lines.push(`${pad}${keyText(k)}: {`, ...objectLines(v, depth + 1), `${pad}},`);
    } else {
      lines.push(`${pad}${keyText(k)}: ${quote(v)},`);
    }
  }
  return lines;
}

/** `{ … }` as lines, starting at `depth` (the opening brace is the caller's). */
export function emitObjectBody(tree, depth = 1) {
  return objectLines(tree, depth);
}

/**
 * A whole generated module: header lines, then `export const <name> = { … } as const;`.
 * `tree` empty → `{}` on one line.
 */
export function emitConstModule({ header, exportName, tree, eol, suffix = ' as const;' }) {
  const body = objectLines(tree, 1);
  const lines = [...header];
  if (body.length === 0) lines.push(`export const ${exportName} = {}${suffix}`);
  else lines.push(`export const ${exportName} = {`, ...body, `}${suffix}`);
  return lines.join(eol) + eol;
}

/** Write only when the bytes differ. Returns true when the file changed. */
export function writeIfChanged(file, content) {
  if (existsSync(file) && readFileSync(file, 'utf8') === content) return false;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, 'utf8');
  return true;
}

/**
 * Regenerate a loader map in place: only the object literal after
 * `export const <varName>… =` is rewritten, so the file's own header and comments — written by
 * whoever owns the file — survive every apply. `entries` are [locale, importPath] in order.
 */
export function rewriteLoaderMap(text, varName, entries) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  // The type annotation holds `=>`, so the `=` that matters is the one an object literal follows.
  const re = new RegExp(`(export const ${varName}\\b[\\s\\S]*?=\\s*)\\{[\\s\\S]*?\\};`);
  if (!re.test(text)) throw new Error(`no \`export const ${varName} = {…};\` to rewrite`);
  const literal = entries.length === 0
    ? '{};'
    : `{${eol}${entries.map(([loc, path]) => `  ${keyText(loc)}: () => import(${quote(path)}),`).join(eol)}${eol}};`;
  return text.replace(re, (_m, head) => `${head}${literal}`);
}

/** Stable JSON: keys of `keys`-like maps sorted, 2-space indent, trailing newline. */
export function stableJson(value, eol = '\n') {
  return JSON.stringify(value, null, 2).replace(/\n/g, eol) + eol;
}
