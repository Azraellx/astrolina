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
// Sections 3b–3f and 4 need the bundled per-asteroid files in public/ephe/. While
// those are absent they print SKIP, name what is missing, and do not fail; everything
// else runs on the files every checkout has. Once the files are there, 3b FAILS until
// `npm run build:minor-manifest` has recorded each file's build date — deliberately,
// so the manifest step can't be skipped.
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  birthDataToJD,
  eclipticToRaDec,
  ensureAsteroidEphemeris,
  getMinorPositions,
  gmstRadians,
  initEphemeris,
  mountEphemerisFiles,
  obliquity,
  projectMinorOntoEcliptic,
  projectOntoEcliptic,
  sampleBody,
  sampleMinorBody,
  type MinorPosition,
  type PlanetPosition,
} from '../src/lib/ephemeris';
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
import { ensureMinorBodies, minorLoadState, retryMinorBody } from '../src/lib/minorBodies/loader';
import { MinorBodySourceFailure, type MinorBodySource } from '../src/lib/extensions/minorBodySources';
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
import { minorLineColor } from '../src/lib/theme';
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
  check('cards: every catalog line (all six angles, named and unnamed) reads cleanly', !badReading, badReading);
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
  const pl = generateLines(planets, meridianLng).features;
  check('frame: same line count, same angle order',
    ml.length === pl.length && ml.every((f, i) => f.properties.lineType === pl[i].properties.lineType), `${ml.length} vs ${pl.length}`);
  check('frame: identical geometry, vertex for vertex',
    ml.every((f, i) => JSON.stringify(f.geometry.coordinates) === JSON.stringify(pl[i].geometry.coordinates)));
  const mz = generateMinorZenith(minors, meridianLng, decor).features;
  const pz = generateZenithStamps(planets, meridianLng).features;
  check('frame: identical zenith points',
    mz.length === pz.length && mz.every((f, i) => JSON.stringify(f.geometry.coordinates) === JSON.stringify(pz[i].geometry.coordinates)));
}

console.log(
  failures === 0
    ? `\nverify-minor-bodies: ALL PASS${skips ? ` (${skips} skipped — see SKIP lines)` : ''}`
    : `\nverify-minor-bodies: ${failures} FAILURE(S)${skips ? `, ${skips} skipped` : ''}`,
);
process.exit(failures === 0 ? 0 : 1);
