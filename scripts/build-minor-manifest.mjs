// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Refreshes the per-FILE fields of src/lib/minorBodies/bundled.json from the
// per-asteroid ephemeris files actually sitting in public/ephe/.
//
// The manifest is curated, and this script never touches the curation: which
// bodies ship, the name the app shows, the group a body is browsed under, and
// whether its data lives in the main-asteroid file (`seas`) are decisions, not
// data. What it fills is the one thing only the file can say:
//
//   v — the file's build date (yyyymmdd, from header line 3). It rides on the
//       file's URL as `?v=`, so a regenerated file is never answered from a
//       year-long cache holding the old one.
//
// On the way it checks every file is one the engine will open under that name
// (header lines 1–4, then a real probe through @swisseph/node), and reads the
// body's name the way the ENGINE reads it (getCelestialBodyName). A curated name
// that differs is a WARNING, not an error — the curated name is the one shown,
// and a difference may be deliberate — but it is printed every run until someone
// decides.
//
// Nothing is written unless every file is present and readable: a manifest with
// `v` on some bodies and not others would be a half-regenerated state that looks
// finished. `npm run verify:minor-bodies` checks the result against the files
// (header name = manifest name = engine name; header date = v).
//
// Run: npm run build:minor-manifest
//      node scripts/build-minor-manifest.mjs [--dry-run] [--ephe <dir>]
//   --dry-run    print the manifest instead of writing it
//   --ephe DIR   read the files from DIR instead of public/ephe (a staging copy)
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(root, 'src', 'lib', 'minorBodies', 'bundled.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const epheAt = args.indexOf('--ephe');
if (epheAt >= 0 && !args[epheAt + 1]) {
  console.error('build-minor-manifest: --ephe needs a directory');
  process.exit(2);
}
const EPHE_DIR = epheAt >= 0 ? resolve(args[epheAt + 1]) : join(root, 'public', 'ephe');

// The engine's own name for body n's SHORT file, restated from
// src/lib/minorBodies/ids.ts (`fileNameFor`, which mirrors the engine's
// swi_gen_filename): `se%05d` up to 99999, then `s%06d` — growing past six digits
// rather than wrapping — with an `s` before the extension for the short span. The
// bundled set ships short files only, flat in public/ephe/. Section 1 of
// `npm run verify:minor-bodies` holds fileNameFor to the engine's own naming.
const shortFileName = (n) =>
  `${n > 99_999 ? `s${String(n).padStart(6, '0')}` : `se${String(n).padStart(5, '0')}`}s.se1`;

// Bodies whose data is inside the bundled main-asteroid file under their own
// engine id, restated from ids.ts `SEAS_MINOR_ID`. They have no file of their own
// and no `v` (the main file is loaded without one).
const SEAS_ID = new Map([[5145, 16]]);
const SEAS_FILE = 'seas_18.se1';

const MINOR_ID_OFFSET = 10_000; // the engine's id for MPC number n is 10000 + n
const FLAG_SWIEPH = 2;
const FLAG_SPEED = 256;
const J2000 = 2451545.0; // inside every short (1500–2100) file

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
if (!Array.isArray(manifest.bodies)) {
  console.error(`build-minor-manifest: ${MANIFEST} has no "bodies" array`);
  process.exit(2);
}
if (!existsSync(EPHE_DIR)) {
  console.error(`build-minor-manifest: no ephemeris directory at ${EPHE_DIR}`);
  process.exit(2);
}

const swe = createRequire(import.meta.url)('@swisseph/node');
swe.setEphemerisPath(EPHE_DIR);

/** Header lines 1–4 as the engine's read_const reads them (CRLF-terminated). */
function readHeader(path) {
  const text = readFileSync(path).subarray(0, 2048).toString('latin1');
  const lines = [];
  let pos = 0;
  for (let i = 0; i < 4; i++) {
    const end = text.indexOf('\r\n', pos);
    if (end < 0) break;
    lines.push(text.slice(pos, end));
    pos = end + 2;
  }
  return lines;
}

const missing = [];
const broken = [];
const warnings = [];
const next = [];

for (const body of manifest.bodies) {
  const { n, name } = body;
  const out = { ...body };
  delete out.v;

  if (body.seas) {
    const seId = SEAS_ID.get(n);
    if (seId === undefined) {
      broken.push(`${n} ${name}: marked "seas" but has no main-asteroid id (ids.ts SEAS_MINOR_ID)`);
    } else if (!existsSync(join(EPHE_DIR, SEAS_FILE))) {
      missing.push(`${SEAS_FILE}  (${n} ${name}, and the five main asteroids)`);
    } else {
      const engineName = swe.getCelestialBodyName(seId);
      if (engineName !== name) warnings.push(`${n}: curated "${name}", engine says "${engineName}" (${SEAS_FILE})`);
    }
    next.push(out);
    continue;
  }

  const file = shortFileName(n);
  const path = join(EPHE_DIR, file);
  if (!existsSync(path)) {
    missing.push(`${file}  (${n} ${name})`);
    next.push(out);
    continue;
  }

  const [l1 = '', l2 = '', l3 = '', l4 = ''] = readHeader(path);
  if (!l1.startsWith('SWISSEPH') || !/\d/.test(l1)) {
    broken.push(`${file}: line 1 is not a Swiss Ephemeris version line (${JSON.stringify(l1.slice(0, 40))})`);
    next.push(out);
    continue;
  }
  if (l2.replace(/\s+$/, '').toLowerCase() !== file) {
    // The engine refuses a file whose own name line differs from the name it was
    // opened under — renamed files are the usual cause.
    broken.push(`${file}: header names itself ${JSON.stringify(l2.trim())}`);
    next.push(out);
    continue;
  }
  const date = /(\d{4})\/(\d{2})\/(\d{2})/.exec(l3);
  if (!date) {
    broken.push(`${file}: no build date on header line 3 (${JSON.stringify(l3.slice(0, 60))})`);
    next.push(out);
    continue;
  }
  const num = /^ *(\d+)/.exec(l4);
  if (!num || Number(num[1]) !== n) {
    broken.push(`${file}: elements line is for body ${num ? Number(num[1]) : '(none)'}, not ${n}`);
    next.push(out);
    continue;
  }

  // The engine's own reading: it opens the file and must compute from it.
  let flags = 0;
  try {
    flags = swe.calculatePosition(J2000, MINOR_ID_OFFSET + n, FLAG_SWIEPH | FLAG_SPEED).flags;
  } catch (err) {
    broken.push(`${file}: the engine can't compute from it — ${err instanceof Error ? err.message : err}`);
    // A file the engine rejects makes it discard every planet file's cached state
    // on the way out (read_const → free_planets), and the NEXT body's probe then
    // fails for no reason of its own ("18 coefficients instead of 0" from
    // semo_18.se1, measured). Close and re-point, so one bad file is reported once.
    swe.close();
    swe.setEphemerisPath(EPHE_DIR);
    next.push(out);
    continue;
  }
  if ((flags & FLAG_SWIEPH) === 0) {
    broken.push(`${file}: the engine computed without it (flags ${flags})`);
    next.push(out);
    continue;
  }
  const engineName = swe.getCelestialBodyName(MINOR_ID_OFFSET + n);
  if (engineName !== name) warnings.push(`${n}: curated "${name}", file says "${engineName}" (${file})`);

  out.v = Number(`${date[1]}${date[2]}${date[3]}`);
  next.push(out);
}

// Ephemeris-shaped files that nothing in the manifest names: they would ship and
// never be offered.
const named = new Set(manifest.bodies.filter((b) => !b.seas).map((b) => shortFileName(b.n)));
for (const f of readdirSync(EPHE_DIR)) {
  if (!/^(se\d{5}|s\d{6,})s?\.se1$/i.test(f) || named.has(f)) continue;
  warnings.push(
    /s\.se1$/i.test(f)
      ? `${f}: in ${EPHE_DIR} but not in the manifest — it would ship and never be offered`
      : // The browser mounts each body's short file by name, so a long file there is
        // never read; but on disk (this script, the verify harness) the engine tries
        // the long name FIRST and uses it in place of the short one.
        `${f}: a LONG file — shipped unused by the app, and on disk the engine reads it instead of the short file`,
  );
}

for (const w of warnings) console.warn(`WARN  ${w}`);

if (missing.length || broken.length) {
  if (missing.length) {
    console.error(`\nMissing from ${EPHE_DIR} (${missing.length}):`);
    for (const m of missing) console.error(`  ${m}`);
  }
  if (broken.length) {
    console.error(`\nUnusable (${broken.length}):`);
    for (const b of broken) console.error(`  ${b}`);
  }
  console.error(`\nbuild-minor-manifest: nothing written.`);
  process.exit(1);
}

// One body per line, keys in their existing order — the file stays diffable and
// hand-editable, which is the point of a curated list.
const bodyLine = (b) =>
  `    { ${Object.entries(b)
    .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(', ')} }`;
const head = Object.entries(manifest)
  .filter(([k]) => k !== 'bodies')
  .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},\n`)
  .join('');
const text = `{\n${head}  "bodies": [\n${next.map(bodyLine).join(',\n')}\n  ]\n}\n`;

// Keep whatever line endings the checkout has (the two machines' git settings
// differ), and compare content, not endings.
const current = readFileSync(MANIFEST, 'utf8');
const eol = current.includes('\r\n') ? '\r\n' : '\n';
const files = next.filter((b) => !b.seas).length;
if (dryRun) {
  process.stdout.write(text);
  console.error(`\nbuild-minor-manifest: ${files} files checked (dry run — nothing written).`);
} else if (text === current.replace(/\r\n/g, '\n')) {
  console.log(`build-minor-manifest: ${files} files checked; bundled.json unchanged.`);
} else {
  writeFileSync(MANIFEST, text.replace(/\n/g, eol));
  console.log(`build-minor-manifest: ${files} files checked; wrote ${MANIFEST}.`);
}
