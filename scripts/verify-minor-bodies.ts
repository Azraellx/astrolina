// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the CATALOG MINOR BODIES — numbered minor planets read from their own
// per-asteroid Swiss Ephemeris files — through the real src/lib code (run via the
// harness: `npm run verify:minor-bodies`): file naming, the header check the loader
// runs before the engine ever sees a file, the loader itself, sampling, the lines
// and zenith points, and the labels a reader sees.
//
// Every section says which KIND of assertion it makes, after verify-directions.ts §8,
// because the three fail for different reasons and want different responses:
//   IDENTITY   — the code against a fixed rule or against itself. Breaking means the
//                code contradicts itself (or the rule it restates).
//   TWO PARTS  — two independent parts (of the app, or the app and the engine it
//                reads) agreeing about the same thing at the same moment. Preferred
//                wherever a choice exists (CLAUDE.md): two parts can't agree by
//                accident, where a restated formula passes when both copies are wrong.
//   OUTSIDE    — agreement with an outside authority (JPL Horizons). Breaking means
//                the code is self-consistent and wrong — or the data has drifted.
//
// Sections 3b–3f, 4, 7 and 8 need the bundled per-asteroid files in public/ephe/.
// While those are absent they print SKIP, name what is missing, and do not fail;
// everything else runs on the files every checkout has. Once the files are there, 3b
// FAILS until `npm run build:minor-manifest` has recorded each file's build date —
// deliberately, so the manifest step can't be skipped. Section 3g needs two LONG files
// no checkout carries, in a folder named by MINOR_LONG_DIR, and SKIPs without them.
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  birthDataToJD,
  eclipticLonOfRA,
  eclipticToRaDec,
  ensureAsteroidEphemeris,
  getEclipticPositions,
  getHorizontalCoords,
  getMinorHorizontalCoords,
  getMinorPositions,
  getMinorSamples,
  gmstRadians,
  initEphemeris,
  minorPositionOf,
  mountEphemerisFiles,
  obliquity,
  projectMinorOntoEcliptic,
  projectOntoEcliptic,
  sampleBody,
  sampleMinorBody,
  type EclipticPosition,
  type MinorPosition,
  type PlanetName,
  type PlanetPosition,
} from '../src/lib/ephemeris';
import { ayanamsaRad, shiftEclipticPositions, type ZodiacMode } from '../src/lib/astro/ayanamsa';
import { buildWheelMinor } from '../src/lib/minorBodies/wheel';
import { deriveMinorRows, minorReadyNumbers, withMinorDrawGate } from '../src/lib/minorBodies/status';
import type { MinorBodiesPref } from '../src/lib/minorBodies/prefs';
import {
  astDirFor,
  BUILTIN_ALIAS,
  fileNameFor,
  filePathFor,
  isCatalogNumber,
  minorId,
  minorNumberOf,
  parseFilePath,
  SEAS_MINOR_ID,
  type EpheSpan,
} from '../src/lib/minorBodies/ids';
import { checkSe1Header } from '../src/lib/minorBodies/se1Header';
import manifestJson from '../src/lib/minorBodies/bundled.json';
import {
  BUNDLED_MINOR_BODIES,
  bundledMinorBody,
  MINOR_BODY_GROUPS,
  needsMinorFile,
} from '../src/lib/minorBodies/bundled';
import {
  ensureMinorBodies,
  minorLoadState,
  retryMinorBody,
  type MinorLoadState,
} from '../src/lib/minorBodies/loader';
import {
  MinorBodySourceFailure,
  registerMinorBodySource,
  type MinorBodySource,
} from '../src/lib/extensions/minorBodySources';
import {
  generateMinorLines,
  generateMinorZenith,
  minorLabelName,
  type MinorDecor,
} from '../src/lib/astro/minorLines';
import {
  generateLines,
  generateZenithStamps,
  LINE_TYPE_LABEL,
  normLng,
  type MeridianLng,
} from '../src/lib/astro/lines';
import { buildLineCard, lineReading, minorDisplayName, minorNameHtml } from '../src/lib/lineCard';
import { minorLineColor, THEMES, type Theme } from '../src/lib/theme';
import { en } from '../src/i18n/en';
import { interpolate, resolvePath } from '../src/i18n/t';
import type { Messages, TFn } from '../src/i18n';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const node: any = createRequire(import.meta.url)('@swisseph/node');

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const ARCSEC = 1 / 3600;
const MINOR_ID_OFFSET = 10_000; // the engine's id for MPC number n
const FLAG_EQ =
  node.CalculationFlag.SwissEphemeris | node.CalculationFlag.Speed | node.CalculationFlag.Equatorial;

// Same directory the harness shim points the engine at.
const EPHE_DIR = resolve(process.cwd(), 'public/ephe');

let failures = 0;
let skips = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}
function skip(label: string, why: string) {
  skips += 1;
  console.log(`SKIP  ${label} — ${why}`);
}

// The real English catalog, resolved the way the provider's t() does — so a label
// or card that leaks "undefined", a bare key, or an unfilled {token} shows up here.
const t = ((key: string, vars?: Record<string, string | number>) =>
  interpolate(resolvePath(en as unknown as Messages, key) ?? key, vars)) as unknown as TFn;

const J = (year: number, month: number, day: number, hour = 0) =>
  birthDataToJD({
    name: 'verify',
    year,
    month,
    day,
    hour,
    minute: 0,
    tzOffset: 0,
    birthplace: { label: 'Greenwich', lat: 51.4779, lng: 0 },
  });

const hasFile = (n: number) => existsSync(resolve(EPHE_DIR, fileNameFor(n, 'short')));

await initEphemeris();

// ── 1. File naming and identity (IDENTITY, then TWO PARTS) ────────────────────
// IDENTITY: the path helper against a fixed table — the engine's own
// swi_gen_filename rule (swephlib.c): `se%05d` to 99999, then `s%06d`, growing past
// six digits rather than wrapping; the short span inserts an `s`.
{
  const TABLE: Array<[number, string, string, string]> = [
    [5, 'se00005s.se1', 'se00005.se1', 'ast0'],
    [433, 'se00433s.se1', 'se00433.se1', 'ast0'],
    [99_999, 'se99999s.se1', 'se99999.se1', 'ast99'],
    [100_000, 's100000s.se1', 's100000.se1', 'ast100'],
    [136_199, 's136199s.se1', 's136199.se1', 'ast136'],
    [1_000_000, 's1000000s.se1', 's1000000.se1', 'ast1000'],
  ];
  for (const [n, short, long, dir] of TABLE) {
    check(`naming ${n}: short/long file names`, fileNameFor(n, 'short') === short && fileNameFor(n, 'long') === long,
      `${fileNameFor(n, 'short')} / ${fileNameFor(n, 'long')}`);
    check(`naming ${n}: directory ${dir}`, astDirFor(n) === dir, astDirFor(n));
    for (const span of ['short', 'long'] as EpheSpan[]) {
      const path = filePathFor(n, span);
      const back = parseFilePath(path);
      check(`naming ${n}: ${path} round-trips`, back?.n === n && back?.span === span, JSON.stringify(back));
    }
  }
  // Paths the engine would never ask for are refused, not coerced.
  const REJECT: Array<[string, string]> = [
    ['ast1/se00433s.se1', 'wrong directory'],
    ['ast0/s000433s.se1', 's-form below 100000'],
    ['ast99/s099999s.se1', 's-form below 100000'],
    ['ast100/se100000s.se1', 'se-form above 99999'],
    ['ast0/se0433s.se1', 'four digits'],
    ['ast0/se00000s.se1', 'number 0'],
    ['ast0/se00433s.se2', 'wrong extension'],
    ['../ast0/se00433s.se1', 'path escape'],
    ['se00433s.se1', 'no directory'],
  ];
  for (const [path, why] of REJECT) {
    check(`naming: parseFilePath rejects ${path} (${why})`, parseFilePath(path) === null);
  }

  // The built-ins are never a second, file-loaded copy.
  const ALIASES: Array<[number, string]> = [
    [1, 'Ceres'], [2, 'Pallas'], [3, 'Juno'], [4, 'Vesta'], [2060, 'Chiron'], [134_340, 'Pluto'],
  ];
  for (const [n, name] of ALIASES) {
    check(`alias ${n} → built-in ${name}, not a catalog body`, BUILTIN_ALIAS.get(n) === name && !isCatalogNumber(n));
  }
  check('alias table has exactly the six built-in numbers', BUILTIN_ALIAS.size === ALIASES.length);
  check('isCatalogNumber: 433 yes; 0, −1, 1.5, "433", NaN no',
    isCatalogNumber(433) && ![0, -1, 1.5, '433', NaN].some((x) => isCatalogNumber(x)));
  check('minor ids: mp:433 round-trips; junk is null',
    minorId(433) === 'mp:433' && minorNumberOf('mp:433') === 433 &&
      minorNumberOf('mp:abc') === null && minorNumberOf('433') === null && minorNumberOf(433) === null);
  check('Pholus (5145) is read from the main-asteroid file as body 16, and needs no file of its own',
    SEAS_MINOR_ID.get(5145) === 16 && !needsMinorFile(5145) && needsMinorFile(433));

  // The curated manifest: no alias smuggled in, no duplicates, known groups, and
  // `seas` exactly where the id table puts a body in the main-asteroid file.
  const raw = (manifestJson as { bodies: Array<{ n: number; group: string; seas?: boolean }> }).bodies;
  check('manifest: no built-in alias among the bundled bodies', raw.length === BUNDLED_MINOR_BODIES.length,
    `${raw.length - BUNDLED_MINOR_BODIES.length} filtered out`);
  check('manifest: every number once', new Set(raw.map((b) => b.n)).size === raw.length);
  check('manifest: every group is a browsing group',
    raw.every((b) => (MINOR_BODY_GROUPS as string[]).includes(b.group)));
  check('manifest: `seas` ⇔ in the main-asteroid id table', raw.every((b) => !!b.seas === SEAS_MINOR_ID.has(b.n)));
}

// TWO PARTS: the engine's own file naming. Asked for a body whose file isn't there,
// the engine reports the LAST name its lookup tried — the flat short file
// (sweph.c: ast0/se00433.se1 → ast0/se00433s.se1 → se00433.se1 → se00433s.se1) — so
// its error text names, in its own words, exactly the file the loader mounts.
{
  for (const n of [5, 433, 99_999, 100_000, 136_199, 1_000_000, 12_345_678]) {
    let message: string | null = null;
    try {
      node.calculatePosition(2451545.0, MINOR_ID_OFFSET + n, FLAG_EQ);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    if (message === null) {
      console.log(`      (${n}: its file is present, so the engine's naming can't be read off a miss)`);
      continue;
    }
    check(`engine names body ${n}'s flat short file '${fileNameFor(n, 'short')}'`,
      message.includes(`'${fileNameFor(n, 'short')}'`), `engine: ${/'[^']*'/.exec(message)?.[0] ?? message.slice(0, 60)}`);
  }
}

// ── 2. The header check, and the loader's use of it (IDENTITY — fixtures) ─────
// Synthetic files built here, restating the engine's read_const (sweph.c) as
// fixtures: CRLF-terminated lines, line 2 compared trimmed and lowercased, the
// elements line parsed as spaces / digits / ONE separator / a 19-character name.
// Section 3 holds the same parser to the engine itself on the real files.
{
  const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
  const BINARY = [0x63, 0x62, 0x61, 0x00, 0x53, 0x6e, 0x00, 0x00]; // what follows a real header
  const se1 = (...lines: string[]) => {
    const head = enc(lines.map((l) => `${l}\r\n`).join(''));
    const out = new Uint8Array(head.length + BINARY.length);
    out.set(head);
    out.set(BINARY, head.length);
    return out;
  };
  const COPY = 'Created for Astrodienst in Switzerland 2026/03/13, based on JPL Ephemeris DE441, short.';
  const EROS = '000433 Eros               L.H. Wasserman  10.38  0.15                    4   0   0';
  const good = se1('SWISSEPH  3', 'se00433s.se1   ', COPY, EROS);

  const r1 = checkSe1Header(good, 'se00433s.se1', 433);
  check('header: padded version line + trailing-space name line accepted, number 433, name "Eros"',
    r1.ok && r1.number === 433 && r1.name === 'Eros', JSON.stringify(r1));
  const r2 = checkSe1Header(se1('SWISSEPH  3', 'SE00433S.SE1', COPY, EROS), 'se00433s.se1');
  check('header: name compared case-insensitively (the engine lowercases both)', r2.ok, JSON.stringify(r2));
  const r3 = checkSe1Header(se1('SWISSEPH  3', 'se00433s.se1', COPY, '   433 Eros               L.H.'), 'se00433s.se1', 433);
  check('header: leading spaces before the number are skipped', r3.ok && r3.number === 433 && r3.name === 'Eros',
    JSON.stringify(r3));
  const r4 = checkSe1Header(
    se1('SWISSEPH  3', 's136199s.se1', COPY, '136199 Eris               L.H. Wasserman  -1.26'),
    's136199s.se1', 136199);
  check('header: s-form file (136199 Eris)', r4.ok && r4.number === 136199 && r4.name === 'Eris', JSON.stringify(r4));
  const r5 = checkSe1Header(
    se1('SWISSEPH  3', 'se00433s.se1', COPY, '000433 AbcdefghijklmnopqrsL.H. Wasserman'),
    'se00433s.se1');
  check('header: the name field is exactly 19 characters', r5.ok && r5.name === 'Abcdefghijklmnopqrs', JSON.stringify(r5));
  // The engine trims the field's trailing spaces and then cuts at its first DOUBLE
  // space, so a two-word name keeps its single space and loses what follows two.
  const r5b = checkSe1Header(
    se1('SWISSEPH  3', 'se00433s.se1', COPY, '000433 Van Gogh  abcdefghiL.H. Wasserman'),
    'se00433s.se1');
  check('header: the name is cut at its first double space, single spaces kept',
    r5b.ok && r5b.name === 'Van Gogh', JSON.stringify(r5b));
  const r6 =checkSe1Header(se1('SWISSEPH  3', 'seas_18.se1 ', COPY), 'seas_18.se1');
  check('header: main-asteroid file (no elements line) accepted with no number',
    r6.ok && r6.number === null && r6.name === null, JSON.stringify(r6));

  const reason = (r: ReturnType<typeof checkSe1Header>) => (r.ok ? 'ok' : r.reason);
  const html = enc('\n  <!doctype html><html><head><title>AstroLina</title></head></html>');
  check('header: an HTML page (a static host\'s shell for a missing file) → html',
    reason(checkSe1Header(html, 'se00433s.se1', 433)) === 'html');
  check('header: a file served under another body\'s name → name',
    reason(checkSe1Header(good, 'se00434s.se1', 434)) === 'name');
  check('header: right name, elements line for another body → number',
    reason(checkSe1Header(se1('SWISSEPH  3', 'se00433s.se1', COPY, EROS.replace('000433', '000434')), 'se00433s.se1', 433)) === 'number');
  check('header: LF-only line endings → damaged',
    reason(checkSe1Header(enc(`SWISSEPH  3\nse00433s.se1\n${COPY}\n${EROS}\n`), 'se00433s.se1', 433)) === 'damaged');
  check('header: no version digit → damaged',
    reason(checkSe1Header(se1('SWISSEPH', 'se00433s.se1', COPY, EROS), 'se00433s.se1', 433)) === 'damaged');
  check('header: truncated before the elements line → damaged',
    reason(checkSe1Header(enc(`SWISSEPH  3\r\nse00433s.se1\r\n${COPY}\r\n`), 'se00433s.se1', 433)) === 'damaged');
  check('header: empty file → damaged', reason(checkSe1Header(new Uint8Array(0), 'se00433s.se1', 433)) === 'damaged');

  // The loader's reading of each verdict — none of these reach the engine, so
  // they run without any file. Numbers are ones no test elsewhere touches.
  let fetches = 0;
  const source = (
    fetchFile: (n: number) => Promise<ArrayBuffer>,
  ): MinorBodySource => ({
    id: 'verify',
    label: 'verify',
    minQueryLen: 1,
    debounceMs: 0,
    search: async () => [],
    fetchFile: (n) => {
      fetches += 1;
      return fetchFile(n);
    },
  });
  const buf = (u: Uint8Array) => u.slice().buffer;
  await ensureMinorBodies([
    { n: 99_991, source: source(async () => buf(html)) },
    { n: 99_992, source: source(async () => buf(good)) }, // se00433s.se1's bytes for 99992
    { n: 99_993, source: source(async () => { throw new MinorBodySourceFailure('Not in this catalog.'); }) },
    { n: 99_994, source: source(async () => { throw new Error('HTTP 404'); }) },
  ]);
  const st = (n: number) => JSON.stringify(minorLoadState(n));
  const s1 = minorLoadState(99_991);
  check('loader: HTML in place of a file → failed "missing" (the file isn\'t there)',
    s1?.status === 'failed' && s1.reason === 'missing', st(99_991));
  const s2 = minorLoadState(99_992);
  check('loader: another body\'s file → failed "content", never mounted',
    s2?.status === 'failed' && s2.reason === 'content', st(99_992));
  const s3 = minorLoadState(99_993);
  check('loader: a source\'s own sentence reaches the row',
    s3?.status === 'failed' && s3.reason === 'source' && s3.note === 'Not in this catalog.', st(99_993));
  const s4 = minorLoadState(99_994);
  check('loader: any other fetch failure → failed "missing" (online)',
    s4?.status === 'failed' && s4.reason === 'missing', st(99_994));
  const before = fetches;
  await ensureMinorBodies([{ n: 99_991, source: source(async () => buf(html)) }]);
  check('loader: a failed body is not fetched again until retried (no request loop)', fetches === before,
    `${fetches - before} extra fetch(es)`);
  retryMinorBody(99_991);
  check('loader: retry forgets the failure', minorLoadState(99_991) === undefined, st(99_991));

  // The span a source serves a body in (MinorBodySource.spanFor). The loader asks it
  // first, fetches THAT file, and checks the bytes under that file's name — so a source
  // that says 'long' and hands over a short file's bytes fails the check, never mounted.
  // Section 3g loads real long files end to end.
  const asked = new Map<number, EpheSpan>();
  const spanned = (
    spanFor: MinorBodySource['spanFor'],
    bytesFor: (n: number, span: EpheSpan) => Uint8Array,
  ): MinorBodySource => ({
    id: 'verify-span',
    label: 'verify-span',
    minQueryLen: 1,
    debounceMs: 0,
    search: async () => [],
    ...(spanFor ? { spanFor } : {}),
    fetchFile: async (n, span) => {
      asked.set(n, span);
      return buf(bytesFor(n, span));
    },
  });
  const elements = (n: number) => `${String(n).padStart(6, '0')} Verify              L.H. Wasserman  10.38  0.15`;
  const shortOf = (n: number) => se1('SWISSEPH  3', fileNameFor(n, 'short'), COPY, elements(n));
  // Nothing here may reach the engine: a file that passed the header check with no data
  // behind it would be mounted and fail the probe as DAMAGED, and the engine's reaction to
  // a damaged file can spill into the next calculation (scripts/minor-catalog/lib.mjs in
  // the Pro repo records it). So every fixture below fails before the mount.
  await ensureMinorBodies([
    // No spanFor: short, as every source was before the seam grew one. (An HTML page, so
    // it stops at the header check.)
    { n: 99_971, source: spanned(undefined, () => html) },
    // 'long', synchronously — and the source hands over the SHORT file's bytes.
    { n: 99_972, source: spanned(() => 'long', (n) => shortOf(n)) },
    // 'long', as a promise (a source whose answer comes from an index it loads lazily).
    { n: 99_973, source: spanned(async () => 'long', (n) => shortOf(n)) },
    // spanFor refuses, with a sentence for the row.
    { n: 99_974, source: spanned(async () => { throw new MinorBodySourceFailure('No span for you.'); }, (n) => shortOf(n)) },
  ]);
  check('loader: a source without spanFor is asked for the SHORT file', asked.get(99_971) === 'short',
    `asked ${asked.get(99_971)}`);
  check('loader: a source whose spanFor says long (sync or async) is asked for the LONG file',
    asked.get(99_972) === 'long' && asked.get(99_973) === 'long', `asked ${asked.get(99_972)}, ${asked.get(99_973)}`);
  const s72 = minorLoadState(99_972);
  const s73 = minorLoadState(99_973);
  check('loader: short-file bytes served as the long file fail the header check ("content"), never mounted',
    s72?.status === 'failed' && s72.reason === 'content' && s73?.status === 'failed' && s73.reason === 'content',
    `${st(99_972)} ${st(99_973)}`);
  const s74 = minorLoadState(99_974);
  check('loader: a spanFor failure reaches the row as the source\'s sentence, and nothing is fetched',
    s74?.status === 'failed' && s74.reason === 'source' && s74.note === 'No span for you.' && !asked.has(99_974), st(99_974));
}

// ── 3. The engine, the files, and the drawing (TWO PARTS) ─────────────────────
// 3a (Pholus) always runs: its data is inside the main-asteroid file every checkout
// has. The rest needs the bundled per-asteroid files.
{
  const jd = J(2012, 1, 31);
  await ensureAsteroidEphemeris();
  const ph = sampleMinorBody(jd, 5145);
  const ref = node.calculatePosition(jd, 16, FLAG_EQ);
  check('Pholus (5145) samples from the main-asteroid file as body 16 — no file of its own needed',
    !!ph && Math.abs(ph.ra - ref.longitude * DEG2RAD) < 1e-12 && Math.abs(ph.dec - ref.latitude * DEG2RAD) < 1e-12,
    ph ? `RA ${(ph.ra * RAD2DEG).toFixed(6)}° vs ${ref.longitude.toFixed(6)}°` : 'null');
  check('Pholus follows the main-asteroid file\'s span (1800–2399): nothing at 1501, data at 1801',
    sampleMinorBody(J(1501, 6, 1), 5145) === null && sampleMinorBody(J(1801, 6, 1), 5145) !== null);
}

const fileBodies = BUNDLED_MINOR_BODIES.filter((b) => needsMinorFile(b.n));
const missingFiles = fileBodies.filter((b) => !hasFile(b.n)).map((b) => fileNameFor(b.n, 'short'));
const presentBodies = fileBodies.filter((b) => hasFile(b.n));
const A = 433; // Eros — near-Earth, the fastest-moving of the set
const B = 136_199; // Eris — distant, slow
const pairPresent = hasFile(A) && hasFile(B);

if (missingFiles.length > 0) {
  skip(
    `bundled files (${missingFiles.length} of ${fileBodies.length} absent from public/ephe/)`,
    missingFiles.length === fileBodies.length
      ? `none are there yet; sections 3b–3f and 4 run on whichever are present — ${missingFiles.slice(0, 4).join(', ')}, …`
      : `missing: ${missingFiles.join(', ')}`,
  );
}

// 3b — manifest ↔ file header ↔ engine. Three readings of one file: the curated
// manifest's name, the header parser's, and the engine's own (read_const, which it
// exposes as the body's name). And the manifest's `v` is the header's build date.
if (presentBodies.length === 0) {
  skip('3b manifest ↔ header ↔ engine names', 'no bundled per-asteroid file is present');
} else {
  const nameMismatch: string[] = [];
  const versionMismatch: string[] = [];
  let unversioned = 0;
  for (const b of presentBodies) {
    const file = fileNameFor(b.n, 'short');
    const bytes = new Uint8Array(readFileSync(resolve(EPHE_DIR, file)));
    const h = checkSe1Header(bytes, file, b.n);
    const engineName: string = node.getCelestialBodyName(MINOR_ID_OFFSET + b.n);
    if (!h.ok || h.name !== b.name || engineName !== b.name) {
      nameMismatch.push(`${b.n}: manifest "${b.name}", header ${h.ok ? `"${h.name}"` : h.reason}, engine "${engineName}"`);
    }
    const date = /(\d{4})\/(\d{2})\/(\d{2})/.exec(new TextDecoder('latin1').decode(bytes.subarray(0, 512)).split('\r\n')[2] ?? '');
    const v = date ? Number(date.slice(1).join('')) : NaN;
    if (b.v === undefined) unversioned += 1;
    else if (b.v !== v) versionMismatch.push(`${b.n}: v ${b.v}, file ${v}`);
  }
  check(`3b ${presentBodies.length} files: manifest name = header name = engine name`,
    nameMismatch.length === 0, nameMismatch.slice(0, 3).join('; '));
  check(`3b ${presentBodies.length} files: manifest v = the file's build date`,
    unversioned === 0 && versionMismatch.length === 0,
    unversioned ? `${unversioned} without v — run npm run build:minor-manifest` : versionMismatch.slice(0, 3).join('; '));
}

if (!pairPresent) {
  skip('3c–3f loader, lines, range, one-slot', `need ${fileNameFor(A)} and ${fileNameFor(B)} in public/ephe/`);
} else {
  // 3c — the loader end to end on the real bytes: fetch, header check, mount by
  // name, J2000 probe. The source reads the disk where the app's reads the network.
  const disk: MinorBodySource = {
    id: 'verify-disk',
    label: 'disk',
    minQueryLen: 1,
    debounceMs: 0,
    search: async () => [],
    fetchFile: async (n) => {
      const b = readFileSync(resolve(EPHE_DIR, fileNameFor(n, 'short')));
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    },
  };
  await ensureMinorBodies([A, B, 5145].map((n) => ({ n, source: disk })));
  const sa = minorLoadState(A);
  const sb = minorLoadState(B);
  const sp = minorLoadState(5145);
  check('3c loader: Eros and Eris load ready, named by their own headers',
    sa?.status === 'ready' && sa.name === 'Eros' && sb?.status === 'ready' && sb.name === 'Eris',
    `${JSON.stringify(sa)} ${JSON.stringify(sb)}`);
  check('3c loader: Pholus loads ready through the main-asteroid file', sp?.status === 'ready', JSON.stringify(sp));
  // The harness shim only checks a mounted name exists; mounting by bare name is
  // what the app does with its blob: URLs.
  await mountEphemerisFiles([{ name: fileNameFor(A), url: '' }, { name: fileNameFor(B), url: '' }]);

  // 3d — a zenith stamp lies on its own MC line, at latitude = declination. The
  // line set and the stamps come from the same positions; the declination and the
  // MC's longitude are then read INDEPENDENTLY — a second app sample, and the
  // engine directly (RA, and sidereal time as the ARMC at Greenwich).
  const jd = J(2012, 1, 31); // Eros two days from a close approach (0.18 au)
  const gmst = gmstRadians(jd);
  const meridianLng: MeridianLng = (ra) => ((ra - gmst) * 180) / Math.PI; // App.tsx celestial recipe
  const decor = (n: number): MinorDecor => ({
    name: bundledMinorBody(n)?.name ?? '',
    color: minorLineColor(n, 'dark'),
    icon: `minor-coin-${n}`,
  });
  const numbers = [A, B, 5145];
  const positions = getMinorPositions(jd, numbers);
  check('3d every requested body sampled', positions.length === numbers.length, `${positions.length}/${numbers.length}`);
  const lines = generateMinorLines(positions, meridianLng, decor);
  const zenith = generateMinorZenith(positions, meridianLng, decor);
  const armc = node.calculateHouses(jd, 0, 0, node.HouseSystem.WholeSign).armc;
  for (const n of numbers) {
    const mc = lines.features.find((f) => f.properties.number === n && f.properties.lineType === 'MC');
    const ic = lines.features.find((f) => f.properties.number === n && f.properties.lineType === 'IC');
    const z = zenith.features.find((f) => f.properties.number === n);
    const own = sampleMinorBody(jd, n);
    const eng = node.calculatePosition(jd, SEAS_MINOR_ID.get(n) ?? MINOR_ID_OFFSET + n, FLAG_EQ);
    if (!mc || !ic || !z || !own) {
      check(`3d ${n}: MC, IC, zenith and a sample all exist`, false);
      continue;
    }
    const mcLng = mc.geometry.coordinates[0][0];
    const [zLng, zLat] = z.geometry.coordinates;
    check(`3d ${n}: MC line is one meridian`, mc.geometry.coordinates.every(([lng]) => lng === mcLng));
    check(`3d ${n}: zenith sits on the MC line`, Math.abs(zLng - mcLng) < 1e-9, `Δ ${Math.abs(zLng - mcLng).toExponential(2)}°`);
    check(`3d ${n}: zenith latitude = declination (independent app sample)`, Math.abs(zLat - own.dec * RAD2DEG) < 1e-12);
    check(`3d ${n}: zenith latitude = declination (engine, directly)`, Math.abs(zLat - eng.latitude) < 1e-9,
      `Δ ${Math.abs(zLat - eng.latitude).toExponential(2)}°`);
    const want = normLng(eng.longitude - armc);
    const dMc = Math.abs(normLng(mcLng - want));
    check(`3d ${n}: MC longitude = engine RA − Greenwich apparent sidereal time`, dMc < 1e-9, `Δ ${dMc.toExponential(2)}°`);
    const dIc = Math.abs(normLng(ic.geometry.coordinates[0][0] - (mcLng + 180)));
    check(`3d ${n}: IC is the MC's antipode`, dIc < 1e-9);

    // ASC/DSC vertices on the geometric horizon, by vector altitude — nothing of the
    // line algebra reused (verify-lines' oracle, the same 1e-9 rad bar).
    let worst = 0;
    for (const f of lines.features) {
      if (f.properties.number !== n || (f.properties.lineType !== 'ASC' && f.properties.lineType !== 'DSC')) continue;
      for (const [lng, lat] of f.geometry.coordinates) {
        const theta = (armc + lng) * DEG2RAD;
        const phi = lat * DEG2RAD;
        const dot =
          Math.cos(phi) * Math.cos(theta) * Math.cos(own.dec) * Math.cos(own.ra) +
          Math.cos(phi) * Math.sin(theta) * Math.cos(own.dec) * Math.sin(own.ra) +
          Math.sin(phi) * Math.sin(own.dec);
        worst = Math.max(worst, Math.abs(Math.asin(Math.max(-1, Math.min(1, dot)))));
      }
    }
    check(`3d ${n}: ASC/DSC vertices on the horizon`, worst < 1e-9, `max |alt| ${worst.toExponential(2)} rad`);
  }

  // 3e — a file's span, measured on the bundled files: they open 1499-12-31 and
  // close between 2100-09-10 and 2102-05-03 (Eros 2101-03-29, Eris 2102-05-03);
  // one near-Earth file is shorter (1862 Apollo, 1866–2104). Outside it the body is
  // null — not a throw, and not a silently different model. Dates are chart dates
  // (Julian calendar before 1582, as the app casts them).
  for (const n of [A, B]) {
    check(`3e ${n}: no position on 1499-06-01`, sampleMinorBody(J(1499, 6, 1), n) === null);
    check(`3e ${n}: positions on 1501-06-01 and 2099-06-01`,
      sampleMinorBody(J(1501, 6, 1), n) !== null && sampleMinorBody(J(2099, 6, 1), n) !== null);
    check(`3e ${n}: no position on 2103-01-01`, sampleMinorBody(J(2103, 1, 1), n) === null);
  }
  check(`3e ${A}: no position on 2101-06-01 (its file closes 2101-03-29)`, sampleMinorBody(J(2101, 6, 1), A) === null);

  // 3f — ONE numbered-asteroid file slot: the engine reopens it whenever the body
  // changes. Interleaving must cost only time, never accuracy.
  const same = (x: ReturnType<typeof sampleMinorBody>, y: ReturnType<typeof sampleMinorBody>) =>
    !!x && !!y &&
    Math.abs(x.ra - y.ra) < 1e-12 && Math.abs(x.dec - y.dec) < 1e-12 &&
    Math.abs(x.lon - y.lon) < 1e-12 && Math.abs(x.lat - y.lat) < 1e-12 && Math.abs(x.speed - y.speed) < 1e-12;
  const aAlone = sampleMinorBody(jd, A);
  const bAlone = sampleMinorBody(jd, B);
  const a2 = sampleMinorBody(jd, A);
  const b2 = sampleMinorBody(jd, B);
  const a3 = sampleMinorBody(jd, A);
  check('3f one slot: A, B, A, B, A — every A equals A alone, every B equals B alone',
    same(aAlone, a2) && same(aAlone, a3) && same(bAlone, b2));
  const jd2 = J(1950, 1, 1);
  const aFar = sampleMinorBody(jd2, A);
  sampleMinorBody(jd, B);
  check('3f one slot: across instants too (A then, B now, A then)', same(aFar, sampleMinorBody(jd2, A)));
  const batch = getMinorPositions(jd, [B, A, B]);
  const near = (m: MinorPosition | undefined, s: ReturnType<typeof sampleMinorBody>) =>
    !!m && !!s && Math.abs(m.ra - s.ra) < 1e-12 && Math.abs(m.dec - s.dec) < 1e-12;
  check('3f getMinorPositions in any order equals each body alone',
    batch.length === 3 && near(batch[0], bAlone) && near(batch[1], aAlone) && near(batch[2], bAlone));
  const marsBefore = sampleBody(jd, 'Mars', 'mean');
  sampleMinorBody(jd, A);
  sampleMinorBody(jd2, B);
  const marsAfter = sampleBody(jd, 'Mars', 'mean');
  check('3f the planets are untouched by catalog sampling',
    !!marsBefore && !!marsAfter && marsBefore.ra === marsAfter.ra && marsBefore.dec === marsAfter.dec);
}

// 3g — a body served from its LONG file (TWO PARTS). A source whose spanFor says 'long'
// has the loader fetch that file, check it under the long name and mount it; the app
// then samples the body from the mounted bytes. That must agree with the engine reading
// the same file straight from its upstream layout, with nothing mounted — at dates only
// the long file covers too — and a body the source doesn't mark must still come from its
// short file. The long files aren't in any checkout: MINOR_LONG_DIR names a folder that
// holds them in the upstream layout (ast221/s221917.se1, ast367/s367943.se1 — the two
// whose short files the hosted catalog rejects). Without it this section SKIPs.
{
  const LONG_DIR = process.env.MINOR_LONG_DIR;
  const LONG_BODIES: Array<{ n: number; name: string; inside: Array<[string, number]>; outside: Array<[string, number]> }> = [
    // Its long file runs 3000 BC–3000 AD: 1200 and 2600 are dates no short file reaches.
    { n: 221_917, name: 'Opites', inside: [['1200-06-01', J(1200, 6, 1)], ['2012-01-31', J(2012, 1, 31)], ['2600-01-01', J(2600, 1, 1)]], outside: [] },
    // A long file's span is its own: this one runs 1993-05-08 – 2090-12-15 (its short
    // file, 2009–2104, doesn't reach 1995 at all).
    { n: 367_943, name: 'Duende', inside: [['1995-06-01', J(1995, 6, 1)], ['2030-01-01', J(2030, 1, 1)], ['2090-06-01', J(2090, 6, 1)]],
      outside: [['1990-01-01', J(1990, 1, 1)], ['2095-01-01', J(2095, 1, 1)]] },
  ];
  const longFile = (n: number) => resolve(LONG_DIR ?? '', filePathFor(n, 'long'));
  const absent = LONG_BODIES.filter((b) => !LONG_DIR || !existsSync(longFile(b.n)));
  if (absent.length) {
    skip('3g a body served from its long file',
      LONG_DIR
        ? `missing under ${LONG_DIR}: ${absent.map((b) => filePathFor(b.n, 'long')).join(', ')}`
        : 'set MINOR_LONG_DIR to a folder holding ast221/s221917.se1 and ast367/s367943.se1 (upstream layout)');
  } else {
    const control = presentBodies.find((b) => b.n !== A && b.n !== B);
    const asked = new Map<number, EpheSpan>();
    const arrayBufferOf = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    // What the Pro catalog does for a body its index marks, from the disk.
    const marked = new Set(LONG_BODIES.map((b) => b.n));
    const source: MinorBodySource = {
      id: 'verify-long',
      label: 'long',
      minQueryLen: 1,
      debounceMs: 0,
      search: async () => [],
      spanFor: async (n) => (marked.has(n) ? 'long' : 'short'),
      fetchFile: async (n, span) => {
        asked.set(n, span);
        return arrayBufferOf(readFileSync(span === 'long' ? longFile(n) : resolve(EPHE_DIR, fileNameFor(n, 'short'))));
      },
    };
    await ensureMinorBodies([...marked, ...(control ? [control.n] : [])].map((n) => ({ n, source })));
    for (const b of LONG_BODIES) {
      const s = minorLoadState(b.n);
      check(`3g ${b.n}: its source says long — the loader asks for ${fileNameFor(b.n, 'long')}, and it loads ready as "${b.name}" (its own header)`,
        asked.get(b.n) === 'long' && s?.status === 'ready' && s.name === b.name, `asked ${asked.get(b.n)}, ${JSON.stringify(s)}`);
    }
    if (control) {
      const s = minorLoadState(control.n);
      check(`3g ${control.n}: a body the same source doesn't mark is asked for, and loads from, its short file`,
        asked.get(control.n) === 'short' && s?.status === 'ready', `asked ${asked.get(control.n)}, ${JSON.stringify(s)}`);
    } else {
      skip('3g the unmarked control body', 'needs a bundled per-asteroid file besides Eros and Eris');
    }

    // The app's samples, from what the loader mounted (the harness keeps blob mounts in
    // a folder of its own, as the browser build keeps them in its virtual filesystem)…
    const key = (n: number, when: string) => `${n}@${when}`;
    const app = new Map<string, ReturnType<typeof sampleMinorBody>>();
    for (const b of LONG_BODIES) for (const [when, jd] of [...b.inside, ...b.outside]) app.set(key(b.n, when), sampleMinorBody(jd, b.n));
    // …then the engine's, reading the same files from the upstream layout with nothing
    // mounted on its path; then the harness's path back (every mount call re-sets it).
    const direct = new Map<string, { longitude: number; latitude: number } | null>();
    node.setEphemerisPath(`${LONG_DIR};${EPHE_DIR}`);
    for (const b of LONG_BODIES) {
      for (const [when, jd] of [...b.inside, ...b.outside]) {
        try {
          direct.set(key(b.n, when), node.calculatePosition(jd, MINOR_ID_OFFSET + b.n, FLAG_EQ));
        } catch {
          direct.set(key(b.n, when), null);
        }
      }
    }
    await mountEphemerisFiles([{ name: 'seas_18.se1', url: '' }]);
    const wrap = (x: number) => Math.abs(((x + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
    for (const b of LONG_BODIES) {
      for (const [when] of b.inside) {
        const a = app.get(key(b.n, when));
        const d = direct.get(key(b.n, when));
        const dRa = a && d ? wrap(a.ra - d.longitude * DEG2RAD) : NaN;
        const dDec = a && d ? Math.abs(a.dec - d.latitude * DEG2RAD) : NaN;
        check(`3g ${b.n} on ${when}: the app's sample of the mounted long file = the engine reading ${filePathFor(b.n, 'long')} directly`,
          dRa < 1e-12 && dDec < 1e-12,
          a && d ? `ΔRA ${dRa.toExponential(1)} rad, Δdec ${dDec.toExponential(1)} rad` : `app ${a ? 'ok' : 'null'}, engine ${d ? 'ok' : 'null'}`);
      }
      for (const [when] of b.outside) {
        check(`3g ${b.n} on ${when}: outside the long file's own span — no position from the app, and none from the engine`,
          app.get(key(b.n, when)) === null && direct.get(key(b.n, when)) === null);
      }
    }
  }
}

// ── 4. Against JPL Horizons (OUTSIDE) ─────────────────────────────────────────
// Horizons API (https://ssd.jpl.nasa.gov/api/horizons.api), retrieved 2026-09-25,
// one request at a time:
//   format=text COMMAND='433;' OBJ_DATA='NO' MAKE_EPHEM='YES' EPHEM_TYPE='OBSERVER'
//   CENTER='500@399' TLIST_TYPE='JD' TIME_TYPE='UT' TLIST='2442435.5' '2455957.5'
//   QUANTITIES='2,20' ANG_FORMAT='DEG' EXTRA_PREC='YES' APPARENT='AIRLESS'
// then the same with TLIST='2305447.5' '2461100.5' '2488069.5', and with
// COMMAND='136199;' TLIST='2433282.5' '2461041.5'. QUANTITIES 2 is the airless
// apparent RA/DEC against the true equator and equinox of date — the frame the app
// samples in — geocentric (500@399), at UT (UT1 before 1962, UTC after; ≤0.9 s apart).
// Solutions: 433 Eros JPL#659, 136199 Eris JPL#103; DE441, SB441-N16 perturbers.
//
// WHAT IS BEING COMPARED is two integrations of each orbit: Horizons's from JPL's
// current solution, and the one baked into the per-asteroid file (built 2026-03-13
// for Eros, 2026-03-14 for Eris, from elements osculating 2026-03-01). They are not
// expected to agree exactly, so each golden carries the separation MEASURED on those
// files, and the tolerance is 1.5× that (0.5″ floor). The profile is the point: at
// the elements' epoch Eros agrees to 0.16″, and the gap grows with distance in time —
// 9″ in 2012, 40″ in 1975 and 2100, 84″ in 1600 (where the Earth's own position is
// also the Moshier model's, before the planetary file's 1800). Distant Eris stays
// under an arcsecond over 76 years. A regenerated file moves these; re-measure.
{
  const GOLDENS: Array<{ n: number; jd: number; when: string; ra: number; dec: number; measured: number }> = [
    { n: 433, jd: 2305447.5, when: '1600-01-01', ra: 177.832349349, dec: 1.769265284, measured: 83.67 },
    { n: 433, jd: 2442435.5, when: '1975-01-23 (close approach, 0.151 au)', ra: 115.933709653, dec: 25.745256824, measured: 40.38 },
    { n: 433, jd: 2455957.5, when: '2012-01-31 (close approach, 0.179 au)', ra: 158.491151823, dec: -4.872263209, measured: 9.44 },
    { n: 433, jd: 2461100.5, when: '2026-03-01 (the elements\' epoch)', ra: 72.478567147, dec: 18.48395013, measured: 0.16 },
    { n: 433, jd: 2488069.5, when: '2100-01-01', ra: 68.222105638, dec: 51.866883374, measured: 41.1 },
    { n: 136_199, jd: 2433282.5, when: '1950-01-01', ra: 15.908314863, dec: -19.98178651, measured: 0.92 },
    { n: 136_199, jd: 2461041.5, when: '2026-01-01', ra: 26.677905199, dec: -0.316495144, measured: 0.08 },
  ];
  if (!pairPresent) {
    skip('4 JPL Horizons goldens (Eros, Eris)', `need ${fileNameFor(A)} and ${fileNameFor(B)} in public/ephe/`);
  } else {
    for (const g of GOLDENS) {
      const p = sampleMinorBody(g.jd, g.n);
      if (!p) {
        check(`4 Horizons ${g.n} ${g.when}: sampled`, false);
        continue;
      }
      const dRa = normLng(p.ra * RAD2DEG - g.ra) * Math.cos(g.dec * DEG2RAD);
      const dDec = p.dec * RAD2DEG - g.dec;
      const sep = Math.hypot(dRa, dDec) / ARCSEC;
      const tol = Math.max(0.5, 1.5 * g.measured);
      check(`4 Horizons ${g.n === 433 ? 'Eros' : 'Eris'} ${g.when}: within ${tol.toFixed(1)}″`, sep <= tol,
        `${sep.toFixed(2)}″ (measured ${g.measured}″)`);
    }
  }
}

// ── 5. Labels, hover text and cards (IDENTITY) ────────────────────────────────
// Every catalog body is named "Name (number)"; with no name, the number alone. No
// label, tip or card may carry "undefined", "NaN", a bare catalog key, or an
// unfilled {token} — the failure a PlanetName-shaped consumer would produce.
{
  const p: MinorPosition = { n: 433, ra: 1.1, dec: 0.3 };
  const meridianLng: MeridianLng = (ra) => ra * RAD2DEG - 40;
  const unnamed = generateMinorLines([p], meridianLng, () => ({ name: '', color: '#e98aa0', icon: 'minor-coin-0' }));
  const named = generateMinorLines([p], meridianLng, () => ({ name: 'Eros', color: '#e98aa0', icon: 'minor-coin-0' }));
  const byType = (fc: typeof named, lt: string) => fc.features.find((f) => f.properties.lineType === lt)?.properties.label;
  check('labels: unnamed body reads "(433) MC"', byType(unnamed, 'MC') === '(433) MC', String(byType(unnamed, 'MC')));
  check('labels: named body reads "Eros ASC"', byType(named, 'ASC') === 'Eros ASC', String(byType(named, 'ASC')));
  check('labels: minorLabelName falls back to the number', minorLabelName(433, '') === '(433)' && minorLabelName(433, 'Eros') === 'Eros');
  check('labels: every angle labelled like the planets\' (LINE_TYPE_LABEL)',
    named.features.every((f) => f.properties.label === `Eros ${LINE_TYPE_LABEL[f.properties.lineType]}`));

  const zen = generateMinorZenith([p], meridianLng, () => ({ name: '', color: '#e98aa0', icon: 'minor-coin-0' }));
  const all = [...unnamed.features, ...named.features, ...zen.features];
  const leaks = (s: string) => /undefined|NaN|\bnull\b|\{\w+\}|lineMeanings\.|minorBodies\./.test(s);
  check('labels: no feature property carries undefined/NaN/null',
    all.every((f) => !leaks(JSON.stringify(f.properties)) && Object.values(f.properties).every((v) => v !== undefined)));
  check('labels: no catalog feature carries a `planet` key',
    all.every((f) => !Object.prototype.hasOwnProperty.call(f.properties, 'planet')));
  check('labels: zenith id is mp:433', zen.features[0]?.id === 'mp:433');

  const props = (name: string, extra: Record<string, unknown> = {}) =>
    ({ ...named.features[0].properties, name, ...extra }) as Record<string, unknown>;
  check('names: "Eros (433)", and "(433)" with no name',
    minorDisplayName(props('Eros'), t) === 'Eros (433)' && minorDisplayName(props(''), t) === '(433)',
    `${minorDisplayName(props('Eros'), t)} / ${minorDisplayName(props(''), t)}`);
  check('names: a feature with no readable number never prints one',
    minorDisplayName({ kind: 'minor', name: 'Eros', body: 'mp:x' }, t) === 'Eros');
  check('names: HTML-escaped where spliced into a tip or card',
    minorNameHtml(props('<b>Eros</b>'), t) === '&lt;b&gt;Eros&lt;/b&gt; (433)', minorNameHtml(props('<b>Eros</b>'), t));

  let badReading = '';
  for (const f of [...unnamed.features, ...named.features]) {
    const r = lineReading('minor-lines-layer', f.properties as unknown as Record<string, unknown>, t);
    const card = buildLineCard('minor-lines-layer', f.properties as unknown as Record<string, unknown>, t, { km: 12, type: 'pin' });
    const text = `${r?.title ?? ''} ${r?.body ?? ''} ${card ?? ''}`;
    if (!r || !card || leaks(text)) badReading ||= `${f.properties.label}: ${text.slice(0, 120)}`;
  }
  check('cards: every catalog line (all four angles, named and unnamed) reads cleanly', !badReading, badReading);
  check('cards: a catalog line is never read through the planet branch',
    lineReading('acg-lines', named.features[0].properties as unknown as Record<string, unknown>, t) === null);
}

// ── 6. Same frame as the planets (TWO PARTS) ──────────────────────────────────
// A catalog body's line must be the line a planet at the same place would draw
// (CLAUDE.md rule 5: a consumer answering a question about a line reads the frame
// the line generator read). The two families have separate projection and feature
// code; given the same RA/dec they must agree exactly.
{
  const jd = J(2012, 1, 31);
  const eps = obliquity(jd);
  const gmst = gmstRadians(jd);
  const meridianLng: MeridianLng = (ra) => ((ra - gmst) * 180) / Math.PI;
  const at = [
    { ra: 0.4, dec: 0.2 },
    { ra: 2.9, dec: -0.45 },
    { ra: 5.1, dec: 0.62 },
  ];
  const minors: MinorPosition[] = at.map((c, i) => ({ n: 1000 + i, ...c }));
  const planets: PlanetPosition[] = at.map((c) => ({ name: 'Mars', ...c }));

  const pm = projectMinorOntoEcliptic(minors, jd);
  const pp = projectOntoEcliptic(planets, jd);
  check('frame: In-Zodiaco projection identical for both families',
    pm.every((m, i) => m.ra === pp[i].ra && m.dec === pp[i].dec && m.lon === pp[i].lon));
  const withLon: MinorPosition[] = [{ n: 1, ra: 1, dec: 0.3, lon: 0.9 }];
  const onEcl = eclipticToRaDec(0.9, 0, eps);
  check('frame: a longitude of record wins over the round trip (midpoint charts)',
    projectMinorOntoEcliptic(withLon, jd)[0].ra === onEcl.ra && projectMinorOntoEcliptic(withLon, jd)[0].dec === onEcl.dec);

  const decor = (): MinorDecor => ({ name: 'x', color: '#000', icon: 'i' });
  const ml = generateMinorLines(minors, meridianLng, decor).features;
  // Catalog bodies draw the four classical angles only (minorLines.ts); the planets'
  // Vertex-axis runs are set aside, and what remains must match one for one.
  const plAll = generateLines(planets, meridianLng).features;
  const isVertex = (lt: string) => lt === 'VX' || lt === 'AVX';
  const pl = plAll.filter((f) => !isVertex(f.properties.lineType));
  check('frame: no catalog line on the Vertex axis, while the planets at the same places draw it',
    ml.every((f) => !isVertex(f.properties.lineType)) && plAll.some((f) => isVertex(f.properties.lineType)));
  check('frame: same line count, same angle order',
    ml.length === pl.length && ml.every((f, i) => f.properties.lineType === pl[i].properties.lineType), `${ml.length} vs ${pl.length}`);
  check('frame: identical geometry, vertex for vertex',
    ml.every((f, i) => JSON.stringify(f.geometry.coordinates) === JSON.stringify(pl[i].geometry.coordinates)));
  const mz = generateMinorZenith(minors, meridianLng, decor).features;
  const pz = generateZenithStamps(planets, meridianLng).features;
  check('frame: identical zenith points',
    mz.length === pz.length && mz.every((f, i) => JSON.stringify(f.geometry.coordinates) === JSON.stringify(pz[i].geometry.coordinates)));
}

// ── 7. The chart position and the lines (TWO PARTS, with IDENTITY pins) ───────
// The chart wheel places each catalog body from the SAME sample its lines are drawn
// from — getMinorSamples at the chart's own moment — through a builder of its own
// (lib/minorBodies/wheel). The wheel reads the engine's ecliptic call and the lines its
// equatorial call, so the two parts can only agree if they are describing one point:
//   (a) TWO PARTS  In Zodiaco, celestial and geodetic: each MC line culminates the
//                  wheel's longitude put on the ecliptic (geodetic: at that longitude).
//   (b) TWO PARTS  In Mundo: the wheel's longitude and latitude, taken back to the
//                  equator, are the RA the MC line and the declination the zenith sit at.
//   (c) IDENTITY   the lines' positions are the sample stripped, exactly, and never carry
//                  a `lon` — projectMinorOntoEcliptic prefers one, so it would move them.
//   (d) TWO PARTS  a sidereal zodiac moves a catalog body exactly as it moves a planet at
//                  the same tropical longitude, and leaves its RA and dec alone.
//   (e) TWO PARTS  a catalog body and a planet at one RA/dec read one azimuth and
//                  altitude, and the zodiac shift never reaches either.
//   (f) TWO PARTS  the wheel's colour is its lines' and its zenith's, in every theme.
//   (g) TWO PARTS  the wheel's label is the lines' card name — "Name (n)", or "(n)".
//   (h) TWO PARTS  a station is flagged where the engine's own speed changes sign, for
//                  the planets and the catalog bodies alike. For the planets that is also
//                  the pin on the extraction of stationFromBracket: no flag may move.
// (a) and (b) compare two engine calls through the app's conversions; they agree to
// ≤ 8e-10″ from 1950 to 2099 and ≤ 3.4e-6″ at 1501 (measured 2026-09-26). The bar is
// 1e-4″ — thirty times the worst, and still "the same point" by any reading.
const chartNumbers = [...presentBodies.map((b) => b.n), 5145];
const SEC7_DATES: Array<[string, number]> = [
  ['2012-01-31', J(2012, 1, 31)],
  ['1950-01-01', J(1950, 1, 1)],
  ['1501-06-01', J(1501, 6, 1)],
  ['2099-06-01', J(2099, 6, 1)],
];
const decorFor = (theme: Theme) => (n: number): MinorDecor => ({
  name: bundledMinorBody(n)?.name ?? '',
  color: minorLineColor(n, theme),
  icon: `minor-coin-${n}`,
});
const listOf = (ns: readonly number[]) => ns.map((n) => ({ n }));
type MinorFC = ReturnType<typeof generateMinorLines>;
const mcLngOf = (fc: MinorFC, n: number) =>
  fc.features.find((f) => f.properties.number === n && f.properties.lineType === 'MC')?.geometry.coordinates[0][0];

if (presentBodies.length === 0) {
  skip('7 the chart position and the lines', 'no bundled per-asteroid file is present');
} else {
  const AGREE_ARCSEC = 1e-4;
  const worst = { a: 0, g: 0, bRa: 0, bDec: 0 };
  const first: Record<string, string> = {};
  const note = (k: string, msg: string) => {
    first[k] ||= msg;
  };
  const arcsec = (deg: number) => Math.abs(deg) * 3600;
  let placed = 0;
  let ayanSeen = Infinity;
  for (const [when, jd] of SEC7_DATES) {
    const eps = obliquity(jd);
    const gmst = gmstRadians(jd);
    const decor = decorFor('dark');
    const samples = getMinorSamples(jd, chartNumbers, true);
    const wheel = buildWheelMinor(samples, { ayan: 0, decor, t, list: listOf(chartNumbers) });
    const positions = samples.map(minorPositionOf);
    const byN = new Map(wheel.map((w) => [w.n, w]));
    placed += wheel.length;
    if (wheel.length !== samples.length) note('a', `${when}: ${samples.length} sampled, ${wheel.length} on the wheel`);

    // (a) In Zodiaco, the lines are drawn from the ecliptic projection of the sample.
    const celestial: MeridianLng = (ra) => ((ra - gmst) * 180) / Math.PI; // App.tsx celestial recipe
    const geodetic: MeridianLng = (ra) => eclipticLonOfRA(ra, eps) * RAD2DEG; // App.tsx geodetic recipe
    const zod = projectMinorOntoEcliptic(positions, jd);
    const zc = generateMinorLines(zod, celestial, decor);
    const zg = generateMinorLines(zod, geodetic, decor);
    // (b) In Mundo, from the sample's own RA/dec.
    const mundo = generateMinorLines(positions, celestial, decor);
    const mundoZ = generateMinorZenith(positions, celestial, decor);
    for (const s of samples) {
      const w = byN.get(s.n);
      if (!w) continue;
      const culminates = normLng((eclipticToRaDec(w.lon, 0, eps).ra - gmst) * RAD2DEG);
      const dC = arcsec(normLng((mcLngOf(zc, s.n) ?? NaN) - culminates));
      const dG = arcsec(normLng((mcLngOf(zg, s.n) ?? NaN) - normLng(w.lon * RAD2DEG)));
      worst.a = Math.max(worst.a, dC);
      worst.g = Math.max(worst.g, dG);
      if (!(dC <= AGREE_ARCSEC)) note('a', `${when} ${s.n}: celestial MC ${dC.toExponential(2)}″ off`);
      if (!(dG <= AGREE_ARCSEC)) note('ag', `${when} ${s.n}: geodetic MC ${dG.toExponential(2)}″ off`);
      const back = eclipticToRaDec(w.lon, w.lat, eps);
      const dRa = arcsec(normLng((mcLngOf(mundo, s.n) ?? NaN) - normLng((back.ra - gmst) * RAD2DEG)));
      const zLat = mundoZ.features.find((f) => f.properties.number === s.n)?.geometry.coordinates[1];
      const dDec = arcsec((zLat ?? NaN) - back.dec * RAD2DEG);
      worst.bRa = Math.max(worst.bRa, dRa);
      worst.bDec = Math.max(worst.bDec, dDec);
      if (!(dRa <= AGREE_ARCSEC && dDec <= AGREE_ARCSEC)) {
        note('b', `${when} ${s.n}: MC ${dRa.toExponential(2)}″, zenith latitude ${dDec.toExponential(2)}″ off`);
      }
    }

    // (c) The lines' positions: the sample stripped, and nothing else.
    const plain = getMinorPositions(jd, chartNumbers);
    const direct = chartNumbers.map((n) => sampleMinorBody(jd, n)).filter((x) => x !== null);
    const sameShape = (p: MinorPosition, s: { n: number; ra: number; dec: number; speed?: number }) =>
      Object.keys(p).sort().join() === 'dec,n,ra,speed' &&
      p.n === s.n && p.ra === s.ra && p.dec === s.dec && p.speed === s.speed;
    if (plain.length !== direct.length || !plain.every((p, i) => sameShape(p, direct[i]))) {
      note('c', `${when}: getMinorPositions is not each body's sample stripped to {n, ra, dec, speed}`);
    }
    if (positions.length !== plain.length || !positions.every((p, i) => sameShape(p, plain[i]))) {
      note('c', `${when}: the App's path (the full sample, stripped) differs from getMinorPositions`);
    }
    if ([...plain, ...positions].some((p) => Object.prototype.hasOwnProperty.call(p, 'lon'))) {
      note('c', `${when}: a line position carries a lon`);
    }

    // (d) Both sidereal zodiacs, against a planet at the same tropical longitude.
    for (const mode of ['lahiri', 'fagan-bradley'] as ZodiacMode[]) {
      const ayan = ayanamsaRad(jd, mode);
      ayanSeen = Math.min(ayanSeen, ayan);
      const sid = buildWheelMinor(samples, { ayan, decor, t, list: listOf(chartNumbers) });
      for (const w of sid) {
        const s = samples.find((x) => x.n === w.n)!;
        const planet = shiftEclipticPositions<EclipticPosition>([{ name: 'Mars', lon: s.lon, lat: s.lat }], ayan)[0];
        if (!Object.is(w.lon, planet.lon)) note('d', `${when} ${mode} ${w.n}: ${w.lon} vs the planet's ${planet.lon}`);
        if (w.ra !== s.ra || w.dec !== s.dec || w.lat !== s.lat) note('d', `${when} ${mode} ${w.n}: the shift touched ra/dec/lat`);
      }
      // (e) Four observers; the planets' table and the catalog rows, and the sidereal
      // wheel's bodies against the tropical sample.
      if (mode !== 'lahiri') continue;
      for (const [lat, lng] of [[51.4779, 0], [44.9497, -93.0931], [-33.8688, 151.2093], [78.2232, 15.6267]]) {
        const rows = getMinorHorizontalCoords(samples, gmst, lat, lng);
        const rowsSid = getMinorHorizontalCoords(sid, gmst, lat, lng);
        for (const s of samples) {
          const mars = getHorizontalCoords(
            [{ name: 'Mars', lon: s.lon, lat: s.lat, ra: s.ra, dec: s.dec }], gmst, eps, lat, lng,
          ).get('Mars');
          const m = rows.get(s.n);
          const ms = rowsSid.get(s.n);
          if (!mars || !m || !Object.is(mars.az, m.az) || !Object.is(mars.alt, m.alt)) {
            note('e', `${when} ${s.n} at ${lat},${lng}: planet ${mars?.az},${mars?.alt} vs catalog ${m?.az},${m?.alt}`);
          }
          if (!m || !ms || !Object.is(m.az, ms.az) || !Object.is(m.alt, ms.alt)) {
            note('e', `${when} ${s.n} at ${lat},${lng}: the sidereal wheel's bodies read another az/alt`);
          }
        }
      }
    }

    if (when !== '2012-01-31') continue;
    // (f) Colour, in every theme — the wheel, every line and the zenith.
    for (const theme of THEMES) {
      const d = decorFor(theme);
      const w = buildWheelMinor(samples, { ayan: 0, decor: d, t, list: listOf(chartNumbers) });
      const lines = generateMinorLines(zod, celestial, d);
      const zen = generateMinorZenith(zod, celestial, d);
      for (const m of w) {
        const mine = lines.features.filter((f) => f.properties.number === m.n);
        const z = zen.features.find((f) => f.properties.number === m.n);
        if (!m.color || mine.length === 0 || !mine.every((f) => f.properties.color === m.color) || z?.properties.color !== m.color) {
          note('f', `${theme} ${m.n}: wheel ${m.color}, lines ${[...new Set(mine.map((f) => f.properties.color))].join('/')}, zenith ${z?.properties.color}`);
        }
      }
    }
    // (g) The label, against the card name the lines' own features produce.
    for (const m of wheel) {
      const name = bundledMinorBody(m.n)?.name ?? '';
      const want = name ? `${name} (${m.n})` : `(${m.n})`;
      const mc = zc.features.find((f) => f.properties.number === m.n && f.properties.lineType === 'MC');
      const card = mc ? minorDisplayName(mc.properties as unknown as Record<string, unknown>, t) : null;
      if (m.label !== want || card !== m.label || /undefined|NaN|\{\w+\}/.test(m.label)) {
        note('g', `${m.n}: wheel "${m.label}", card "${card}", expected "${want}"`);
      }
    }
    const unnamedDecor = (): MinorDecor => ({ name: '', color: '#000', icon: 'i' });
    const bare = buildWheelMinor(samples.slice(0, 1), { ayan: 0, decor: unnamedDecor, t, list: [] })[0];
    const bareCard = minorDisplayName(
      generateMinorLines(zod.slice(0, 1), celestial, unnamedDecor).features[0].properties as unknown as Record<string, unknown>,
      t,
    );
    if (!bare || bare.label !== `(${bare.n})` || bare.label !== bareCard) {
      note('g', `unnamed: wheel "${bare?.label}", card "${bareCard}"`);
    }
  }
  const tol = `bar ${AGREE_ARCSEC}″`;
  check(`7a In Zodiaco, celestial: every MC line culminates its body's wheel longitude (${placed} placements, 4 dates)`,
    !first.a, first.a ?? `worst ${worst.a.toExponential(2)}″, ${tol}`);
  check('7a In Zodiaco, geodetic: every MC line sits at its body\'s wheel longitude',
    !first.ag, first.ag ?? `worst ${worst.g.toExponential(2)}″, ${tol}`);
  check('7b In Mundo: the wheel\'s longitude and latitude are the RA and dec the MC line and zenith were drawn from',
    !first.b, first.b ?? `worst RA ${worst.bRa.toExponential(2)}″, dec ${worst.bDec.toExponential(2)}″, ${tol}`);
  check('7c the lines\' positions are the sample stripped to {n, ra, dec, speed} — no lon, the App\'s path included',
    !first.c, first.c ?? '');
  check('7d Lahiri and Fagan/Bradley shift a catalog body exactly as a planet at its longitude, and nothing else',
    !first.d && ayanSeen > 0.25, first.d ?? `least ayanamsa ${(ayanSeen * RAD2DEG).toFixed(2)}°`);
  check('7e one RA/dec, one azimuth and altitude — planet or catalog body, tropical or sidereal wheel (4 observers)',
    !first.e, first.e ?? '');
  check(`7f the wheel's colour is its lines' and its zenith's, in all ${THEMES.length} themes`, !first.f, first.f ?? '');
  check('7g the wheel\'s label is the lines\' card name — "Name (n)", "(n)" unnamed, never a leak', !first.g, first.g ?? '');

  // (h) Stations, located from the engine's own speeds — daily through 2012, bisected
  // to a minute — never from the app's bracket. At the instant the flag must be up for
  // planets and catalog bodies alike, and three days either side it must be down.
  // Bodies outer, instants inner, for the one numbered-asteroid file slot (3f).
  const FLAG_ECL = node.CalculationFlag.SwissEphemeris | node.CalculationFlag.Speed;
  const stationsOf = (id: number): number[] => {
    const v = (jd: number) => node.calculatePosition(jd, id, FLAG_ECL).longitudeSpeed as number;
    const out: number[] = [];
    const t0 = J(2012, 1, 1);
    for (let d = 0; d < 366; d++) {
      let lo = t0 + d;
      let hi = lo + 1;
      if (Math.sign(v(lo)) === Math.sign(v(hi))) continue;
      const sLo = Math.sign(v(lo));
      for (let k = 0; k < 12; k++) {
        const mid = (lo + hi) / 2;
        if (Math.sign(v(mid)) === sLo) lo = mid;
        else hi = mid;
      }
      out.push((lo + hi) / 2);
    }
    return out;
  };
  const PLANETS: Array<[PlanetName, number]> = [
    ['Mercury', node.Planet.Mercury], ['Venus', node.Planet.Venus], ['Mars', node.Planet.Mars],
    ['Jupiter', node.Planet.Jupiter], ['Saturn', node.Planet.Saturn], ['Uranus', node.Planet.Uranus],
    ['Neptune', node.Planet.Neptune], ['Pluto', node.Planet.Pluto],
  ];
  let planetStations = 0;
  let minorStations = 0;
  const flagOf = (jd: number, name: PlanetName) => getEclipticPositions(jd).find((p) => p.name === name)?.stationary;
  for (const [name, id] of PLANETS) {
    for (const jdS of stationsOf(id)) {
      planetStations += 1;
      if (flagOf(jdS, name) !== true) note('hp', `${name} ${jdS.toFixed(3)}: not flagged at its station`);
      if (flagOf(jdS - 3, name) !== false || flagOf(jdS + 3, name) !== false) {
        note('hp', `${name} ${jdS.toFixed(3)}: still flagged three days out`);
      }
    }
  }
  for (const n of chartNumbers) {
    for (const jdS of stationsOf(SEAS_MINOR_ID.get(n) ?? MINOR_ID_OFFSET + n)) {
      minorStations += 1;
      const at = (jd: number) => getMinorSamples(jd, [n], true)[0]?.stationary;
      if (at(jdS) !== true) note('hm', `${n} ${jdS.toFixed(3)}: not flagged at its station`);
      if (at(jdS - 3) !== false || at(jdS + 3) !== false) note('hm', `${n} ${jdS.toFixed(3)}: still flagged three days out`);
    }
  }
  check(`7h planets: flagged at each of ${planetStations} stations in 2012 the engine's speeds locate, and not 3 days out`,
    !first.hp && planetStations > 0, first.hp ?? '');
  check(`7h catalog bodies: the same, at ${minorStations} stations of ${chartNumbers.length} bodies`,
    !first.hm && minorStations > 0, first.hm ?? '');
}

// ── 8. The rows and the wheel (TWO PARTS) ─────────────────────────────────────
// The Minor bodies window's rows and the chart wheel's set come from the same
// preference by two independent routes: the rows by deriveMinorRows' ladder of holds,
// the wheel by the load requests, the sample and the builder. They must agree about
// which bodies are there: a body is on the wheel exactly when its row reads 'shown', or
// 'undrawn' for a reason that belongs to the LINES — no birth time, the Angles filter,
// the natal lines off the map — which take a body's lines away and leave the body where
// it is. A hold that belongs to the BODY (switched off, Advanced off, a held or missing
// source, the family hidden, a composite, a file loading or failed, a date outside its
// file) keeps it off both.
//
// Composed the way App composes them — minorNumbers → minorSamples → minorRows →
// minorRowsEff → minorRowsDrawn beside wheelIsNatal → wheelMinor — from the same
// exported pieces, so what is under test is the agreement of the two routes, not a
// copy of either. Two states are the rule's declared exceptions and are asserted as
// such: no chart open (rows read 'undrawn — noChart', and there is no wheel to be on),
// and a promoted overlay (the wheel stands in for another chart, so it carries no natal
// catalog body while the rows read 'undrawn — natalOff').
//
// Then the files' span edges: every wanted, loaded body missing from the wheel has a
// row that says why — 'noData' — and no body on the wheel has one.
interface PipelineState {
  jd: number;
  advanced: boolean;
  none: boolean;
  composite: boolean;
  noTime: boolean;
  anglesOff: boolean;
  eclipseSolo: boolean;
  hideNatal: boolean;
  promoted: boolean;
  shown: boolean;
}
function rowsAndWheel(
  pref: MinorBodiesPref,
  loadState: (n: number) => MinorLoadState | undefined,
  s: PipelineState,
) {
  const p = { ...pref, shown: s.shown };
  const minorNumbers = !s.none && !s.composite ? minorReadyNumbers(p, s.advanced, loadState) : [];
  const samples = minorNumbers.length ? getMinorSamples(s.jd, minorNumbers, true) : [];
  const rows = deriveMinorRows(p, loadState, {
    advanced: s.advanced,
    none: s.none,
    composite: s.composite,
    sampled: new Set(samples.map(minorPositionOf).map((x) => x.n)),
    undrawn: s.noTime ? 'noTime' : s.anglesOff ? 'angles' : null,
  });
  const rowsEff = withMinorDrawGate(rows, s.eclipseSolo || s.promoted ? 'natalOff' : null);
  const rowsDrawn = withMinorDrawGate(rowsEff, s.hideNatal && s.advanced && !s.promoted ? 'natalOff' : null);
  const wheelIsNatal = !s.promoted;
  const wheel = wheelIsNatal && samples.length
    ? buildWheelMinor(samples, { ayan: 0, decor: decorFor('dark'), t, list: p.list })
    : [];
  return { rows: rowsDrawn, wheel };
}
const setOf = (xs: Iterable<number>) => [...new Set(xs)].sort((a, b) => a - b).join(',');

if (presentBodies.length < 9) {
  skip('8 the rows and the wheel', `needs nine bundled per-asteroid files; ${presentBodies.length} present`);
} else {
  // One body in every standing state a row can be in, besides the ones the chart sets.
  const ready = [...presentBodies.slice(0, 6).map((b) => b.n), 5145];
  const [nOff, nFailed, nLoading] = presentBodies.slice(6, 9).map((b) => b.n);
  const HELD = 99_981;
  const GONE = 99_982;
  registerMinorBodySource({
    id: 'verify-held',
    label: 'held',
    minQueryLen: 1,
    debounceMs: 0,
    gate: () => ({ locked: true, note: 'Closed for the check.' }),
    search: async () => [],
    fetchFile: async () => {
      throw new Error('a held source is never fetched');
    },
  });
  const entry = (n: number, source = 'bundled') => ({ n, name: bundledMinorBody(n)?.name ?? '', source });
  const pref: MinorBodiesPref = {
    shown: true,
    list: [...ready, nOff, nFailed, nLoading].map((n) => entry(n)).concat(entry(HELD, 'verify-held'), entry(GONE, 'verify-gone')),
    visible: [...ready, nFailed, nLoading, HELD, GONE],
  };
  const loadState = (n: number): MinorLoadState | undefined =>
    ready.includes(n) || n === nOff
      ? { status: 'ready', name: bundledMinorBody(n)?.name ?? null }
      : n === nFailed
        ? { status: 'failed', reason: 'missing' }
        : undefined;
  const base: PipelineState = {
    jd: J(2012, 1, 31), advanced: true, none: false, composite: false, noTime: false,
    anglesOff: false, eclipseSolo: false, hideNatal: false, promoted: false, shown: true,
  };
  const STATES: Array<[string, Partial<PipelineState>]> = [
    ['normal', {}],
    ['no birth time', { noTime: true }],
    ['the Angles filter shows none of the four', { anglesOff: true }],
    ['natal lines off: the eclipse clean-up', { eclipseSolo: true }],
    ['natal lines off: hidden', { hideNatal: true }],
    ['a composite chart', { composite: true }],
    ['Advanced off', { advanced: false }],
    ['the family hidden', { shown: false }],
    ['outside every file (1499)', { jd: J(1499, 6, 1) }],
  ];
  const kinds = (rows: ReturnType<typeof rowsAndWheel>['rows']) =>
    new Map(rows.map((r) => [r.entry.n, r.status.kind]));
  for (const [label, over] of STATES) {
    const { rows, wheel } = rowsAndWheel(pref, loadState, { ...base, ...over });
    const onRows = rows.filter((r) => r.status.kind === 'shown' || r.status.kind === 'undrawn').map((r) => r.entry.n);
    const onWheel = wheel.map((w) => w.n);
    const k = kinds(rows);
    const summary = [...new Set(k.values())].sort().join('/');
    check(`8 ${label}: the wheel carries exactly the rows reading shown or undrawn`,
      setOf(onRows) === setOf(onWheel), `wheel [${setOf(onWheel)}], rows [${setOf(onRows)}] (rows: ${summary})`);
    if (label === 'normal') {
      // Not vacuous: every hold is present, off the wheel, and saying so.
      const want: Array<[number, string]> = [
        [nOff, 'off'], [nFailed, 'failed'], [nLoading, 'loading'], [HELD, 'held'], [GONE, 'unavailable'],
      ];
      check('8 normal: every ready body is on the wheel, and the off/failed/loading/held/unavailable rows each say so',
        setOf(onWheel) === setOf(ready) && want.every(([n, kind]) => k.get(n) === kind),
        want.map(([n, kind]) => `${n} ${k.get(n)}${k.get(n) === kind ? '' : ` (want ${kind})`}`).join(', '));
    }
  }
  {
    const { rows, wheel } = rowsAndWheel(pref, loadState, { ...base, promoted: true });
    const k = kinds(rows);
    check('8 promoted overlay (declared exception): no natal catalog body on the wheel, and no row reads shown',
      wheel.length === 0 && ![...k.values()].includes('shown') &&
        ready.every((n) => rows.find((r) => r.entry.n === n)?.status.kind === 'undrawn'),
      `wheel ${wheel.length}, rows ${[...new Set(k.values())].sort().join('/')}`);
  }
  {
    const { rows, wheel } = rowsAndWheel(pref, loadState, { ...base, none: true });
    const noChart = rows.filter((r) => r.status.kind === 'undrawn' && r.status.reason === 'noChart');
    check('8 no chart (declared exception): no wheel, and every switched-on body with an open source reads noChart',
      wheel.length === 0 && setOf(noChart.map((r) => r.entry.n)) === setOf([...ready, nFailed, nLoading]),
      `wheel ${wheel.length}, noChart [${setOf(noChart.map((r) => r.entry.n))}]`);
  }

  // The span edges, on every body the checkout has, all wanted and loaded.
  const all = chartNumbers;
  const edgePref: MinorBodiesPref = { shown: true, list: all.map((n) => entry(n)), visible: [...all] };
  const edgeLoad = (n: number): MinorLoadState => ({ status: 'ready', name: bundledMinorBody(n)?.name ?? null });
  const EDGES: Array<[string, number]> = [
    ['1499-06-01', J(1499, 6, 1)], ['1501-06-01', J(1501, 6, 1)], ['2099-06-01', J(2099, 6, 1)],
    ['2101-06-01', J(2101, 6, 1)], ['2103-01-01', J(2103, 1, 1)],
  ];
  for (const [when, jd] of EDGES) {
    const { rows, wheel } = rowsAndWheel(edgePref, edgeLoad, { ...base, jd });
    const onWheel = new Set(wheel.map((w) => w.n));
    const k = kinds(rows);
    const missingWithoutReason = all.filter((n) => !onWheel.has(n) && k.get(n) !== 'noData');
    const noDataOnWheel = all.filter((n) => onWheel.has(n) && k.get(n) === 'noData');
    const noData = all.filter((n) => k.get(n) === 'noData').length;
    check(`8 ${when}: every body missing from the wheel reads noData, and none on it does`,
      missingWithoutReason.length === 0 && noDataOnWheel.length === 0,
      `${onWheel.size} on the wheel, ${noData} noData of ${all.length}` +
        (missingWithoutReason.length ? `; missing without noData: ${missingWithoutReason.join(', ')}` : '') +
        (noDataOnWheel.length ? `; noData yet on the wheel: ${noDataOnWheel.join(', ')}` : ''));
  }
}

console.log(
  failures === 0
    ? `\nverify-minor-bodies: ALL PASS${skips ? ` (${skips} skipped — see SKIP lines)` : ''}`
    : `\nverify-minor-bodies: ${failures} FAILURE(S)${skips ? `, ${skips} skipped` : ''}`,
);
process.exit(failures === 0 ? 0 : 1);
