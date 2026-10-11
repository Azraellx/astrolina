// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Reads message catalogs from their SOURCE TEXT with the TypeScript compiler API — never by
// bundling or running app code (2026-10-09). The catalogs are `export const x = { … } as const`
// object literals whose comments are the translator's notes, and only the source carries those:
// a runtime import would hand back the strings and lose every reason beside them.
//
// What it gives per string leaf: the dot-path, the English value, the file and line, and the
// comments that apply to it (its own, the nearest one above it in the same object, each
// enclosing object's, the export's, and the file header without the licence block). Anything
// it cannot read statically — a function value, a template over something that isn't a
// same-file string constant, a spread, an imported identifier, a computed key — is reported in
// `untranslatable` with its file and line. Nothing is dropped silently: a string the tool can't
// see is a string no language gets, so it has to be on a list somebody reads.
//
// Same-file string constants ARE read (`const WHY = '…'` used as `x: WHY` or inside
// `${WHY} …`), because the catalogs use them deliberately — one sentence typed once and reused
// word for word — and each use records which constants built it (`compose`), so the pipeline
// can keep the reuse true in every language rather than translating each copy apart.
//
// Line endings are normalised to LF before parsing (Windows checkouts here run with
// core.autocrlf=true) and the original style is reported, so generated files can mirror it.
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// ── Reading ────────────────────────────────────────────────────────────────────────────

/** A source file's text with CRLF normalised, plus the line ending it was written with. */
export function readSource(file) {
  let raw = readFileSync(file, 'utf8');
  const bom = raw.charCodeAt(0) === 0xfeff;
  if (bom) raw = raw.slice(1);
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  return { text: raw.replace(/\r\n/g, '\n'), eol, bom };
}

/** Parse a module once; every reader below works from this. */
export function parseModule(file) {
  const { text, eol, bom } = readSource(file);
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const consts = new Map();
  const exportsMap = new Map();
  const imports = new Map();
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st)) {
      const exported = !!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      const isConst = (st.declarationList.flags & ts.NodeFlags.Const) !== 0;
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        if (isConst) consts.set(d.name.text, d);
        if (exported) exportsMap.set(d.name.text, { decl: d, stmt: st });
      }
    } else if (ts.isImportDeclaration(st) && st.importClause && ts.isStringLiteral(st.moduleSpecifier)) {
      const from = st.moduleSpecifier.text;
      const named = st.importClause.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const el of named.elements) {
          imports.set(el.name.text, { from, imported: (el.propertyName ?? el.name).text, typeOnly: st.importClause.isTypeOnly || el.isTypeOnly });
        }
      }
    }
  }
  return { file, text, eol, bom, sf, consts, exportsMap, imports };
}

export function lineOf(mod, pos) {
  return mod.sf.getLineAndCharacterOfPosition(pos).line + 1;
}

// ── Comments ───────────────────────────────────────────────────────────────────────────

/** One comment's text without its markers: `// a` → `a`; `/** a\n * b *\/` → `a\nb`. */
export function cleanComment(raw) {
  if (raw.startsWith('//')) return raw.replace(/^\/\/ ?/, '').replace(/\s+$/, '');
  const body = raw.replace(/^\/\*+/, '').replace(/\*+\/$/, '');
  return body
    .split('\n')
    .map((l) => l.replace(/^\s*\* ?/, '').replace(/\s+$/, ''))
    .join('\n')
    .replace(/^\n+|\n+$/g, '');
}

/**
 * The comments leading a node. `text` is all of them, joined; `direct` is the lines of the
 * block DIRECTLY above it (no blank line between), which is where a comment tag has to sit
 * to apply — so a tag in a file header doesn't reach the first export by accident.
 * TypeScript's leading ranges already skip a trailing comment on the previous line.
 */
export function leadingComments(mod, node) {
  const ranges = ts.getLeadingCommentRanges(mod.text, node.pos) ?? [];
  if (ranges.length === 0) return { text: '', direct: [] };
  const parts = ranges.map((r) => cleanComment(mod.text.slice(r.pos, r.end)));
  const start = node.getStart(mod.sf);
  const gapOk = (a, b) => (mod.text.slice(a, b).match(/\n/g) ?? []).length <= 1;
  let first = ranges.length;
  if (gapOk(ranges[ranges.length - 1].end, start)) {
    first = ranges.length - 1;
    while (first > 0 && gapOk(ranges[first - 1].end, ranges[first].pos)) first -= 1;
  }
  const direct = parts.slice(first).join('\n').split('\n');
  return { text: joinComments(ranges, parts, mod.text), direct };
}

// Line comments that run on (no blank line) are one paragraph; a blank line starts another.
function joinComments(ranges, parts, text) {
  let out = '';
  for (let i = 0; i < parts.length; i += 1) {
    if (i > 0) {
      const gap = text.slice(ranges[i - 1].end, ranges[i].pos);
      out += (gap.match(/\n/g) ?? []).length > 1 ? '\n\n' : '\n';
    }
    out += parts[i];
  }
  return out.replace(/^\n+|\n+$/g, '');
}

// The licence lines every core source opens with, and the Pro build's one-liner. They say
// nothing about any string, so they are struck from the header note.
const LICENCE_LINE = [
  /^AstroLina: web-based astrocartography for curious minds\.$/,
  /^Copyright \(C\) \d{4} AstroLina/,
  /^SPDX-License-Identifier:/,
  /^Licensed under the GNU AGPL v3\.0/,
  /^AGPL section 7\(b\)\. See the LICENSE and NOTICE files/,
  /^AstroLina Pro — proprietary\.$/,
];

/**
 * The file's opening comments with the licence block removed ('' when nothing is left).
 * When the first statement is a private constant, the comment block sitting directly on it
 * is that constant's, not the file's (settings.ts opens with the sky hold's two sentences),
 * so it is left to the keys that use the constant.
 */
export function fileHeader(mod) {
  let ranges = ts.getLeadingCommentRanges(mod.text, 0) ?? [];
  const first = mod.sf.statements[0];
  if (first && ts.isVariableStatement(first) && !first.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
    const start = first.getStart(mod.sf);
    const gapOk = (a, b) => (mod.text.slice(a, b).match(/\n/g) ?? []).length <= 1;
    let cut = ranges.length;
    if (cut > 0 && gapOk(ranges[cut - 1].end, start)) {
      cut -= 1;
      while (cut > 0 && gapOk(ranges[cut - 1].end, ranges[cut].pos)) cut -= 1;
    }
    ranges = ranges.slice(0, cut);
  }
  if (ranges.length === 0) return '';
  const parts = ranges.map((r) => cleanComment(mod.text.slice(r.pos, r.end)));
  const joined = joinComments(ranges, parts, mod.text);
  return joined
    .split('\n')
    .filter((l) => !LICENCE_LINE.some((re) => re.test(l.trim())))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}

/** The licence block itself, verbatim, for generated files that must carry it. */
export function licenceBlock(mod) {
  const lines = mod.text.split('\n');
  const out = [];
  for (const l of lines) {
    if (!l.startsWith('//')) break;
    const body = l.replace(/^\/\/ ?/, '');
    if (!LICENCE_LINE.some((re) => re.test(body.trim()))) break;
    out.push(l);
  }
  return out;
}

// A comment tag applies to its key and everything under it (docs/translations.md, "Writing
// English for translation", the comment-tag table). It has to OPEN a comment line — prose that
// mentions a tag ("tagged `@i18n-review`") is not one.
export function tagsIn(lines) {
  const tags = { skip: false, review: false, verbatim: false, max: null };
  for (const raw of lines) {
    const l = raw.trim();
    let m;
    if ((m = /^@i18n-(skip|review|verbatim)\b/.exec(l))) tags[m[1]] = true;
    else if ((m = /^@i18n-max\s+(\d+)\b/.exec(l))) tags.max = Number(m[1]);
  }
  return tags;
}

// ── Values ─────────────────────────────────────────────────────────────────────────────

function unwrap(node) {
  for (;;) {
    if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)
      || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)) {
      node = node.expression;
    } else return node;
  }
}

function describe(node) {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return 'function value';
  if (ts.isConditionalExpression(node)) return 'conditional expression';
  if (ts.isCallExpression(node)) return 'call expression';
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return 'property access';
  if (ts.isTemplateExpression(node)) return 'template over a non-constant';
  if (ts.isIdentifier(node)) return 'identifier';
  if (ts.isNumericLiteral(node)) return 'number';
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return 'boolean';
  return ts.SyntaxKind[node.kind];
}

/**
 * A string-valued expression, read statically: literals, same-file `const` strings, `+` and
 * templates over those. `compose` lists the pieces when constants were involved (a bare
 * constant is `[{ ref }]`), so callers can keep shared sentences shared.
 */
export function resolveString(mod, node, seen = new Set()) {
  node = unwrap(node);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { ok: true, value: node.text, compose: null };
  }
  if (ts.isIdentifier(node)) {
    const decl = mod.consts.get(node.text);
    if (!decl) {
      const imp = mod.imports.get(node.text);
      return { ok: false, reason: imp ? `identifier imported from '${imp.from}'` : `identifier ${node.text}` };
    }
    if (seen.has(node.text)) return { ok: false, reason: `circular constant ${node.text}` };
    const inner = resolveString(mod, decl.initializer, new Set([...seen, node.text]));
    if (!inner.ok) return { ok: false, reason: `constant ${node.text}: ${inner.reason}` };
    return { ok: true, value: inner.value, compose: [{ ref: node.text }] };
  }
  if (ts.isTemplateExpression(node)) {
    let value = node.head.text;
    const compose = node.head.text ? [{ lit: node.head.text }] : [];
    for (const span of node.templateSpans) {
      const inner = resolveString(mod, span.expression, seen);
      if (!inner.ok) return { ok: false, reason: `template \${…}: ${inner.reason}` };
      value += inner.value;
      compose.push(...(inner.compose ?? [{ lit: inner.value }]));
      if (span.literal.text) {
        value += span.literal.text;
        compose.push({ lit: span.literal.text });
      }
    }
    return { ok: true, value, compose };
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = resolveString(mod, node.left, seen);
    if (!a.ok) return a;
    const b = resolveString(mod, node.right, seen);
    if (!b.ok) return b;
    const compose = a.compose || b.compose
      ? [...(a.compose ?? [{ lit: a.value }]), ...(b.compose ?? [{ lit: b.value }])]
      : null;
    return { ok: true, value: a.value + b.value, compose };
  }
  return { ok: false, reason: describe(node) };
}

function propKey(name) {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

/**
 * Walk an exported value. Returns `leaves` (string leaves, in source order), `untranslatable`
 * (with the reason), and the comment frames the record builder turns into notes and flags.
 *
 * Each leaf: { path: string[], value, line, compose, frames } where `frames` runs OUTER →
 * INNER, one per enclosing property, and the last is the leaf's own:
 * { key, comments, direct, sibling } — `sibling` being the nearest comment above it in the
 * same object, used when the leaf has none of its own.
 */
export function walkExport(mod, exportName, { dottedKeys = false } = {}) {
  const exp = mod.exportsMap.get(exportName);
  if (!exp) return null;
  const leaves = [];
  const untranslatable = [];
  const stmtComments = leadingComments(mod, exp.stmt);
  const isFirst = mod.sf.statements[0] === exp.stmt;
  const root = {
    exportName,
    // The export's own comment is the file header when it is the first statement; the
    // header is reported separately, so it is not counted twice as an enclosing frame.
    comments: isFirst ? '' : stmtComments.text,
    direct: stmtComments.direct,
    header: fileHeader(mod),
    line: lineOf(mod, exp.stmt.getStart(mod.sf)),
  };

  const visit = (node, path, frames) => {
    node = unwrap(node);
    if (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node)) {
      let sibling = '';
      const items = ts.isObjectLiteralExpression(node) ? node.properties : node.elements;
      items.forEach((item, i) => {
        const c = leadingComments(mod, item);
        const line = lineOf(mod, item.getStart(mod.sf));
        let key;
        let valueNode;
        if (ts.isArrayLiteralExpression(node)) {
          key = String(i);
          valueNode = item;
        } else if (ts.isPropertyAssignment(item)) {
          key = propKey(item.name);
          valueNode = item.initializer;
        } else if (ts.isShorthandPropertyAssignment(item)) {
          key = item.name.text;
          valueNode = item.name;
        } else {
          const what = ts.isSpreadAssignment(item) ? 'spread' : 'method or accessor';
          const k = item.name ? propKey(item.name) : null;
          untranslatable.push({ path: [...path, k ?? '…'], line, reason: what });
          if (c.text) sibling = c.text;
          return;
        }
        // A dot inside a key can't be addressed by a dot-path (the runtime splits keys on '.'),
        // so no language could reach it. Generated override maps are the one place dotted keys
        // are meant — their keys ARE dot-paths — and they are read with dottedKeys.
        if (key !== null && key.includes('.') && !dottedKeys) {
          untranslatable.push({ path: [...path, key], line, reason: "key contains '.', which a dot-path can't address" });
          if (c.text) sibling = c.text;
          return;
        }
        if (key === null) {
          untranslatable.push({ path: [...path, '[computed]'], line, reason: 'computed key' });
          if (c.text) sibling = c.text;
          return;
        }
        const frame = { key, comments: c.text, direct: c.direct, sibling: c.text ? '' : sibling, line, array: ts.isArrayLiteralExpression(node) };
        visit(valueNode, [...path, key], [...frames, frame]);
        if (c.text) sibling = c.text;
      });
      return;
    }
    const line = frames.length ? frames[frames.length - 1].line : root.line;
    const r = resolveString(mod, node);
    if (r.ok) leaves.push({ path, value: r.value, line, compose: r.compose, frames });
    else untranslatable.push({ path, line, reason: r.reason });
  };

  visit(exp.decl.initializer, [], []);
  const constNotes = constComments(mod);
  for (const leaf of leaves) {
    const refs = (leaf.compose ?? []).filter((p) => p.ref).map((p) => p.ref);
    leaf.constNotes = [...new Set(refs.map((r) => constNotes.get(r)).filter(Boolean))];
  }
  return { root, leaves, untranslatable, eol: mod.eol };
}

// The comment on each private string constant — or, for one with none, the nearest comment
// on a constant above it (settings.ts comments a PAIR of constants once). For the first
// statement only the block directly on it counts; the rest above it is the file header.
function constComments(mod) {
  const out = new Map();
  let last = '';
  mod.sf.statements.forEach((st, i) => {
    if (!ts.isVariableStatement(st) || st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return;
    const c = leadingComments(mod, st);
    const own = i === 0 ? c.direct.join('\n').trim() : c.text;
    if (own) last = own;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) out.set(d.name.text, own || last);
  });
  return out;
}

/** Read a static value (objects, arrays, strings) — for small data such as languages.ts. */
export function staticValue(mod, node) {
  node = unwrap(node);
  if (ts.isObjectLiteralExpression(node)) {
    const o = {};
    for (const p of node.properties) {
      if (ts.isPropertyAssignment(p)) {
        const k = propKey(p.name);
        if (k !== null) o[k] = staticValue(mod, p.initializer);
      }
    }
    return o;
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((e) => staticValue(mod, e));
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  const r = resolveString(mod, node);
  return r.ok ? r.value : undefined;
}

// ── Records ────────────────────────────────────────────────────────────────────────────

export function sha(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 12);
}

/** FNV-1a 32-bit over UTF-16 code units, 8 hex chars — the note-id hash (short, stable). */
export function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export const noteId = (text) => `n${fnv1a(text)}`;

// The kind decides which warnings apply (label length, tip steps). Read from the key's last
// segment — the catalogs name keys by role consistently enough for that to hold.
export function kindOf(lastSeg, en) {
  if (/^aria/i.test(lastSeg)) return 'aria';
  if (lastSeg === 'placeholder' || /Placeholder$/.test(lastSeg)) return 'placeholder';
  if (lastSeg === 'tip' || /Tip$/.test(lastSeg)) return 'tip';
  if (/^(hint|body|note|intro)$/.test(lastSeg) || /(Hint|Note)$/.test(lastSeg)) return 'body';
  if (/^(label|title|name|menuLabel|cta)$/.test(lastSeg) || /(Label|Title)$/.test(lastSeg)) return 'label';
  return /\s/.test(en) && /[.!?:…)”’"]\s*$/.test(en) ? 'prose' : 'label';
}

// Data, not copy, by name — but only where the value reads as data too: `date: '2026-10-05'` and
// `shortcut: 'S'` are data, while `date: 'Birth date'` and `shortcut: 'Shortcut'` are the labels
// of a column and a key cap, which a reader sees. A value with a space, or one capitalised word,
// is copy whatever its key is called.
const SKIP_KEYS = new Set(['href', 'url', 'id', 'icon', 'palette', 'date', 'shortcut']);
const looksLikeData = (v) => !/\s/.test(v) && !/^\p{Lu}\p{Ll}+$/u.test(v);
const VERBATIM_NOTE = /verbatim|Lina['’]s (own )?(words|copy)/i;
const MAX_NOTE = /under (the )?(\d{2,3})[- ]char/i;

/**
 * Turn walked leaves into records: key, English, notes (by id, into `notes`), kind and flags.
 * `notes` is a shared { id: text } table so a header quoted by 300 keys is stored once.
 */
export function buildRecords(walked, { repo, file, namespace, notes }) {
  const records = [];
  for (const leaf of walked.leaves) {
    const key = [namespace, ...leaf.path].join('.');
    const own = leaf.frames[leaf.frames.length - 1];
    const noteTexts = [];
    if (own?.comments) noteTexts.push(own.comments);
    else if (own?.sibling) noteTexts.push(own.sibling);
    noteTexts.push(...(leaf.constNotes ?? []));
    for (let i = leaf.frames.length - 2; i >= 0; i -= 1) {
      if (leaf.frames[i].comments) noteTexts.push(leaf.frames[i].comments);
    }
    if (walked.root.comments) noteTexts.push(walked.root.comments);
    if (walked.root.header) noteTexts.push(walked.root.header);
    const ids = [];
    for (const raw of noteTexts) {
      // The tags are for the tools (they become flags); a translator reads the words around them.
      const t = raw
        .split('\n')
        .map((l) => l.replace(/^(\s*)@i18n-(?:skip|review|verbatim|max\s+\d+)\b\s*(?:[—–-]\s*)?/, '$1'))
        .filter((l, i, all) => l.trim() !== '' || (i > 0 && i < all.length - 1))
        .join('\n')
        .trim();
      if (!t) continue;
      const id = noteId(t);
      notes[id] = t;
      if (!ids.includes(id)) ids.push(id);
    }

    // Tags: the export's direct block, then each frame's, outer → inner (inner max wins).
    const flags = new Set();
    let maxLen = null;
    for (const lines of [walked.root.direct, ...leaf.frames.map((f) => f.direct)]) {
      const t = tagsIn(lines);
      if (t.skip) flags.add('skip');
      if (t.review) flags.add('review');
      if (t.verbatim) flags.add('verbatim');
      if (t.max !== null) maxLen = t.max;
    }
    // Heuristics read the key's own comments and its enclosing objects' — not the file
    // header, which talks about the whole file.
    const near = leaf.frames.map((f) => f.comments).filter(Boolean).join('\n');
    if (VERBATIM_NOTE.test(near)) flags.add('verbatim');
    const mm = MAX_NOTE.exec(own?.comments ?? '');
    if (maxLen === null && mm) maxLen = Number(mm[2]);
    const last = leaf.path[leaf.path.length - 1];
    if (SKIP_KEYS.has(last) && looksLikeData(leaf.value)) flags.add('skip');

    records.push({
      key,
      repo,
      file,
      line: leaf.line,
      en: leaf.value,
      hash: sha(leaf.value),
      kind: kindOf(last, leaf.value),
      notes: ids,
      maxLen,
      flags: [...flags].sort(),
      compose: leaf.compose,
      ...(leaf.frames.some((f) => f.array) ? { inArray: true } : {}),
    });
  }
  return records;
}

// ── The core catalog ───────────────────────────────────────────────────────────────────

/**
 * The core's English catalog as composed in src/i18n/en.ts: one entry per namespace, in the
 * composition's order, with the fragment it is read from.
 */
export function coreComposition(coreRoot) {
  const enTs = resolve(coreRoot, 'src/i18n/en.ts');
  const mod = parseModule(enTs);
  const exp = mod.exportsMap.get('en');
  if (!exp) throw new Error(`${enTs}: no \`export const en\``);
  const obj = unwrap(exp.decl.initializer);
  if (!ts.isObjectLiteralExpression(obj)) throw new Error(`${enTs}: en is not an object literal`);
  const out = [];
  for (const p of obj.properties) {
    let ns;
    let local;
    if (ts.isShorthandPropertyAssignment(p)) {
      ns = p.name.text;
      local = ns;
    } else if (ts.isPropertyAssignment(p) && ts.isIdentifier(unwrap(p.initializer))) {
      ns = propKey(p.name);
      local = unwrap(p.initializer).text;
    } else {
      throw new Error(`${enTs}:${lineOf(mod, p.getStart(mod.sf))}: unreadable namespace entry`);
    }
    const imp = mod.imports.get(local);
    if (!imp) throw new Error(`${enTs}: namespace ${ns} is not imported`);
    const file = resolve(dirname(enTs), imp.from.replace(/\.ts$/, '') + '.ts');
    out.push({ namespace: ns, file, exportName: imp.imported, frag: imp.from.replace(/^\.\/en\//, '').replace(/\.ts$/, '') });
  }
  return { file: enTs, eol: mod.eol, namespaces: out, licence: licenceBlock(mod) };
}

/** Extract the whole core catalog: { records, untranslatable, notes, composition }. */
export function extractCore(coreRoot, { relTo = coreRoot } = {}) {
  const composition = coreComposition(coreRoot);
  const notes = {};
  const records = [];
  const untranslatable = [];
  for (const ns of composition.namespaces) {
    const mod = parseModule(ns.file);
    const walked = walkExport(mod, ns.exportName);
    const rel = relPath(relTo, ns.file);
    if (!walked) {
      untranslatable.push({ key: ns.namespace, file: rel, line: 1, reason: `no export ${ns.exportName}` });
      continue;
    }
    ns.eol = walked.eol;
    records.push(...buildRecords(walked, { repo: 'core', file: rel, namespace: ns.namespace, notes }));
    for (const u of walked.untranslatable) {
      untranslatable.push({ key: [ns.namespace, ...u.path].join('.'), file: rel, line: u.line, reason: u.reason });
    }
  }
  return { records, untranslatable, notes, composition };
}

export function relPath(from, to) {
  return to.slice(from.length + 1).replace(/\\/g, '/');
}

/**
 * Read a GENERATED locale file back: { key → value } under `namespace`. Used to notice hand
 * edits and to send the current translation as `prev`. A file that doesn't exist reads empty.
 */
export function readLocaleFile(file, exportName, namespace) {
  let mod;
  try {
    mod = parseModule(file);
  } catch {
    return null;
  }
  const walked = walkExport(mod, exportName, { dottedKeys: true });
  if (!walked) return null;
  const values = new Map();
  for (const leaf of walked.leaves) values.set([namespace, ...leaf.path].filter(Boolean).join('.'), leaf.value);
  return { values, untranslatable: walked.untranslatable, eol: mod.eol };
}

/**
 * Keep shared sentences shared. A leaf that is a bare constant used bare by an earlier leaf,
 * or that is built only from such constants and punctuation, becomes DERIVED: it is not sent
 * to a translator, and each language's value is assembled from its parts' translations — so
 * settings.inert.skyHeld stays exactly skyHeldWhy + ' ' + skyHeldFix in every language, as the
 * comment at those constants promises. A leaf whose own words sit between the constants
 * (minorOmitted's hints) can't be assembled; it is translated whole, with a note naming the
 * shared sentences so a translator words them alike.
 */
export function markDerived(records, notes) {
  const canonical = new Map();
  for (const rec of records) {
    if (rec.compose?.length === 1 && rec.compose[0].ref && !canonical.has(`${rec.file}#${rec.compose[0].ref}`)) {
      canonical.set(`${rec.file}#${rec.compose[0].ref}`, rec.key);
    }
  }
  for (const rec of records) {
    if (!rec.compose) continue;
    const refs = rec.compose.filter((p) => p.ref).map((p) => p.ref);
    const keys = refs.map((r) => canonical.get(`${rec.file}#${r}`));
    const lettersBetween = rec.compose.some((p) => p.lit !== undefined && /\p{L}/u.test(p.lit));
    const isCanonical = rec.compose.length === 1 && keys[0] === rec.key;
    if (isCanonical) continue;
    if (!lettersBetween && keys.every(Boolean)) {
      rec.derive = { parts: rec.compose.map((p) => (p.ref ? { key: canonical.get(`${rec.file}#${p.ref}`) } : { lit: p.lit })) };
      rec.flags = [...new Set([...rec.flags, 'derived'])].sort();
    } else if (refs.length > 0) {
      const text = `Built in the source from shared sentence(s) ${[...new Set(refs)].join(', ')}: the same words open or close sibling strings, so translate them identically wherever they recur.`;
      const id = noteId(text);
      notes[id] = text;
      if (!rec.notes.includes(id)) rec.notes.unshift(id);
    }
  }
  return records;
}
