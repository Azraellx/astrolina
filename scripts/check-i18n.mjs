// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// `npm run check:i18n` — the gate for the core's catalogs (2026-10-09). Locale catalogs are
// typed loosely (`satisfies LocaleTree`, src/i18n/types.ts), so the compiler no longer proves a
// translation complete or well-formed; this does, and it is the check the comments in types.ts
// and enums.ts have been promising. Reads source text only (scripts/i18n/extract-lib.mjs); never
// runs app code.
//
//   English   every leaf readable statically; every plural block and placeholder parses;
//             every enum accessor in enums.ts finds a catalog key for every value of its type
//             (a new house system without a label would otherwise show its raw key).
//   Locales   each src/i18n/<loc>/ fragment against English, key by key, with the shared
//             rules in scripts/i18n/checks.mjs: placeholders, plurals for that language's
//             categories, glyphs, the do-not-translate terms. A missing key is NOT an error —
//             the runtime shows English for it — it is coverage, and reported as such. Text
//             tagged `@i18n-review` (text with legal weight) is checked like the rest; each
//             language reports how many such values its lock does not yet mark
//             `st: "approved"` (checked by someone who reads the language).
//   Loaders   src/i18n/locales.ts names exactly the shipped locales whose catalog is on disk.
//
// Exit 1 on any error. Warnings are printed and don't fail. --verbose lists every one.
import ts from 'typescript';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractCore, markDerived, readLocaleFile } from './i18n/extract-lib.mjs';
import { analyzeIcu } from './i18n/icu.mjs';
import { checkPair, deriveValue, inconsistencies, makeContext, summarise } from './i18n/checks.mjs';
import { coreLocalesOnDisk, corePaths, readLock, shippedLocales } from './i18n/layout.mjs';

const CORE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const verbose = process.argv.includes('--verbose');
let errors = 0;
const fail = (msg) => {
  errors += 1;
  console.log(`  FAIL  ${msg}`);
};
const pass = (msg) => console.log(`  ok    ${msg}`);

// ── English ────────────────────────────────────────────────────────────────────────────
const { records, untranslatable, notes, composition } = extractCore(CORE);
markDerived(records, notes);
const enKeys = new Set(records.map((r) => r.key));
console.log(`check:i18n (core) — English: ${records.length} strings in ${composition.namespaces.length} namespaces`);

if (untranslatable.length === 0) pass('every catalog leaf reads statically');
for (const u of untranslatable) fail(`${u.file}:${u.line} ${u.key} — ${u.reason} (no language can carry it)`);

{
  let bad = 0;
  for (const r of records) {
    const { errors: e } = analyzeIcu(r.en);
    for (const msg of e) {
      bad += 1;
      fail(`${r.file}:${r.line} ${r.key} — ${msg}`);
    }
  }
  if (bad === 0) pass('every plural block and placeholder parses');
}

// Enum accessors: makeEnumLabels in enums.ts builds keys from a union-typed code
// (`settings.houseSystem.${h}.label`). Expand each template over the union's members — read
// with the type checker from the app's own types — and require every key to exist.
{
  const enumsPath = resolve(CORE, 'src/i18n/enums.ts');
  const program = ts.createProgram([enumsPath], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    noEmit: true,
    skipLibCheck: true,
    allowImportingTsExtensions: true,
    resolveJsonModule: true,
    types: [],
  });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(enumsPath);
  const consts = new Map();
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) consts.set(d.name.text, d.initializer);
  }
  const strip = (n) => (ts.isAsExpression(n) || ts.isParenthesizedExpression(n) || ts.isSatisfiesExpression(n) ? strip(n.expression) : n);
  const literalsOf = (type) => {
    const parts = type.isUnion() ? type.types : [type];
    const out = [];
    for (const p of parts) {
      if (p.isStringLiteral()) out.push(p.value);
      else return null;
    }
    return out;
  };
  // The values a template span can take: the parameter's union, or a const array indexed by it.
  const spanValues = (expr, params) => {
    expr = strip(expr);
    if (ts.isIdentifier(expr) && params.has(expr.text)) return params.get(expr.text);
    if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
      const inner = strip(expr.left);
      if (ts.isElementAccessExpression(inner) && ts.isIdentifier(inner.expression)) {
        const init = consts.get(inner.expression.text);
        const arr = init && strip(init);
        if (arr && ts.isArrayLiteralExpression(arr) && arr.elements.every(ts.isStringLiteral)) return arr.elements.map((e) => e.text);
      }
    }
    return null;
  };
  let accessors = 0;
  let checked = 0;
  const missing = [];
  const unchecked = [];
  const visitFn = (name, fn) => {
    const params = new Map();
    for (const p of fn.parameters) {
      if (!ts.isIdentifier(p.name)) continue;
      const lits = literalsOf(checker.getTypeAtLocation(p));
      if (lits) params.set(p.name.text, lits);
    }
    accessors += 1;
    const walk = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't' && node.arguments[0]) {
        const arg = strip(node.arguments[0]);
        let keys = null;
        if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) keys = [arg.text];
        else if (ts.isTemplateExpression(arg)) {
          keys = [arg.head.text];
          for (const span of arg.templateSpans) {
            const vals = spanValues(span.expression, params);
            if (!vals) {
              keys = null;
              break;
            }
            keys = keys.flatMap((k) => vals.map((v) => k + v + span.literal.text));
          }
        }
        if (!keys) unchecked.push(name);
        else for (const k of keys) {
          checked += 1;
          if (!enKeys.has(k)) missing.push(`${name} → ${k}`);
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(fn.body);
  };
  ts.forEachChild(sf, function find(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'makeEnumLabels' && node.body) {
      for (const st of node.body.statements) {
        if (!ts.isReturnStatement(st) || !st.expression) continue;
        const obj = strip(st.expression);
        if (!ts.isObjectLiteralExpression(obj)) continue;
        for (const p of obj.properties) {
          if (ts.isPropertyAssignment(p) && (ts.isArrowFunction(p.initializer) || ts.isFunctionExpression(p.initializer))) {
            visitFn(p.name.getText(sf), p.initializer);
          }
        }
      }
    }
    ts.forEachChild(node, find);
  });
  if (accessors === 0 || checked === 0) fail('enum labels: found no accessors to check in enums.ts (has makeEnumLabels moved?)');
  else if (missing.length === 0) pass(`enum labels: ${accessors} accessors, ${checked} keys, every one in the catalog`);
  for (const m of missing) fail(`enum label has no catalog key: ${m}`);
  if (unchecked.length) console.log(`  note  enum accessors not expandable statically: ${[...new Set(unchecked)].join(', ')}`);
}

// ── Locales ────────────────────────────────────────────────────────────────────────────
const locales = coreLocalesOnDisk(CORE);
const shipped = new Set(shippedLocales(CORE));
const translatable = records.filter((r) => !r.flags.includes('skip') && !r.flags.includes('derived'));

if (locales.length === 0) console.log('Locales: none on disk yet (English only).');
for (const loc of locales) {
  const paths = corePaths(CORE, loc);
  const lock = readLock(paths.lock, loc);
  const ctx = makeContext({ locale: loc });
  const values = new Map();
  const orphans = [];
  for (const ns of composition.namespaces) {
    const file = paths.frag(ns.frag);
    if (!existsSync(file)) continue;
    const read = readLocaleFile(file, ns.exportName, ns.namespace);
    if (!read) {
      fail(`${loc}/${ns.frag}.ts: no \`export const ${ns.exportName}\``);
      continue;
    }
    for (const u of read.untranslatable) fail(`${loc}/${ns.frag}.ts ${[ns.namespace, ...u.path].join('.')} — ${u.reason}`);
    for (const [k, v] of read.values) {
      if (enKeys.has(k)) values.set(k, v);
      else orphans.push(k);
    }
  }
  // The composition must take in every fragment that exists, or that fragment never loads.
  if (!existsSync(paths.compose)) fail(`${loc}: src/i18n/${loc}.ts is missing`);
  else {
    const compose = readFileSync(paths.compose, 'utf8');
    for (const ns of composition.namespaces) {
      if (existsSync(paths.frag(ns.frag)) && !compose.includes(`'./${loc}/${ns.frag}'`)) fail(`${loc}.ts does not compose ./${loc}/${ns.frag}`);
    }
  }
  const found = [];
  const pairs = [];
  for (const rec of records) {
    const out = values.get(rec.key);
    if (out === undefined) continue;
    for (const i of checkPair(rec, out, ctx)) found.push({ ...i, key: rec.key });
    pairs.push({ rec, out });
    if (rec.derive) {
      const want = deriveValue(rec.derive, (k) => values.get(k));
      if (want !== null && want !== out) found.push({ severity: 'warning', rule: 'derived', key: rec.key, message: 'no longer equals its parts (regenerate the locale files)' });
    }
  }
  for (const inc of inconsistencies(pairs)) {
    found.push({ severity: 'warning', rule: 'consistency', key: inc.outputs.flatMap((o) => o.keys).join(', '), message: `"${inc.en}" → ${inc.outputs.map((o) => `"${o.out}"`).join(' / ')}` });
  }
  const done = translatable.filter((r) => values.has(r.key)).length;
  const stale = translatable.filter((r) => values.has(r.key) && lock.keys[r.key] && lock.keys[r.key].src !== r.hash).length;
  // `@i18n-review` values the lock does not mark approved: informational, never an error
  // (2026-10-10).
  const unread = translatable.filter((r) => r.flags.includes('review') && values.has(r.key) && lock.keys[r.key]?.st !== 'approved').length;
  for (const k of orphans) found.push({ severity: 'warning', rule: 'orphaned', key: k, message: 'no longer in English (regenerating the locale files prunes it)' });
  const nErr = found.filter((f) => f.severity === 'error').length;
  errors += nErr;
  console.log(`${loc}: ${done}/${translatable.length} translated (${Math.round((100 * done) / Math.max(1, translatable.length))}%), ${stale} stale, ${orphans.length} orphaned — ${nErr} errors, ${found.length - nErr} warnings`);
  if (unread) console.log(`  note  @i18n-review values not marked approved in src/i18n/${loc}.lock.json: ${unread}`);
  if (found.length) console.log(summarise(found, { verbose }));
}

// The loader map lists exactly the shipped locales with a catalog on disk.
{
  const text = readFileSync(resolve(CORE, 'src/i18n/locales.ts'), 'utf8');
  const listed = [...text.matchAll(/^\s*'?([a-z]{2,3}(?:-[A-Za-z0-9]+)*)'?\s*:\s*\(\)\s*=>\s*import\(/gm)].map((m) => m[1]).sort();
  const want = locales.filter((l) => shipped.has(l)).sort();
  if (listed.join() === want.join()) pass(`locales.ts lists ${want.length ? want.join(', ') : 'no catalogs'}`);
  else fail(`locales.ts lists [${listed.join(', ')}] but the shipped catalogs on disk are [${want.join(', ')}] (regenerate src/i18n/locales.ts)`);
  const unshipped = locales.filter((l) => !shipped.has(l));
  if (unshipped.length) console.log(`  note  on disk but not a ShippedLocale, so never loaded: ${unshipped.join(', ')}`);
}

console.log(errors === 0 ? 'check:i18n (core): no errors' : `check:i18n (core): ${errors} error(s)`);
process.exit(errors === 0 ? 0 : 1);
