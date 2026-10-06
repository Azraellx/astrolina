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
// Sections 3b–3f, 3h, 4, 7 and 8 need the bundled per-asteroid files in public/ephe/.
// While those are absent they print SKIP, name what is missing, and do not fail;
// everything else runs on the files every checkout has. Once the files are there, 3b
// FAILS until `npm run build:minor-manifest` has recorded each file's build date —
// deliberately, so the manifest step can't be skipped. Section 3g needs two LONG files
// no checkout carries, in a folder named by MINOR_LONG_DIR, and SKIPs without them.
// Likewise five catalog bodies no checkout carries — one in 3d's geometry, all five in
// 4's second Horizons run — need their short files in a folder named by
// MINOR_CATALOG_DIR (upstream layout, ast0/se00588s.se1 …), and SKIP without it.
// Section 9 (the hypothetical points) needs only their elements file, which ships in
// src/, and always runs. So do 10 (class tags, search, the list's keys) and 11 (the
// hollow designator, and the glyph font it is drawn in), which read only src/.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import {
  birthDataToJD,
  eclipticToRaDec,
  ensureAsteroidEphemeris,
  getEclipticPositions,
  getHorizontalCoords,
  getMinorHorizontalCoords,
  getMinorPositions,
  getMinorSamples,
  getPlanetPositions,
  gmstRadians,
  initEphemeris,
  minorLinePositionOf,
  minorPositionOf,
  mountEphemerisFiles,
  obliquity,
  projectMinorOntoEcliptic,
  projectOntoEcliptic,
  raDecToEclipticLat,
  raDecToEclipticLon,
  sampleBody,
  sampleMinorBody,
  toEclipticPositions,
  type CoordSystem,
  type EclipticPosition,
  type LineSystem,
  type MinorPosition,
  type PlanetName,
  type PlanetPosition,
} from '../src/lib/ephemeris';
import { ayanamsaRad, shiftEclipticPositions, type ZodiacMode } from '../src/lib/astro/ayanamsa';
import { SEED_BIRTHS, type BirthData } from '../src/lib/birthData';
import type { CompositeParents, StoredChart } from '../src/lib/chartLibrary';
import { compositeEquatorial, compositeMinorSamples } from '../src/lib/astro/composite';
import {
  buildOverlay,
  buildOverlayMinorLines,
  OVERLAY_LABEL_PREFIX,
  overlayMinorLines,
  overlayMinorSamples,
  type AngleProgression,
  type OverlayKind,
  type PrimaryRate,
  type TransitFrame,
} from '../src/lib/astro/timeline';
import { buildWheelMinor } from '../src/lib/minorBodies/wheel';
import {
  builtinClassTag,
  DWARF_PLANET_NUMBERS,
  MINOR_CLASS_TAGS,
  minorClassTag,
  type MinorClassTag,
} from '../src/lib/minorBodies/classTags';
import { minorDiamondPoints, minorHollowPoints } from '../src/lib/minorBodies/mark';
import {
  deriveMinorRows,
  minorChartContext,
  minorLoadRequests,
  minorReadyNumbers,
  minorRowHasLines,
  resolveMinorSource,
  withMinorDrawGate,
} from '../src/lib/minorBodies/status';
import {
  loadMinorBodiesPref,
  MINOR_PREF_KEY,
  MINOR_VISIBLE_CAP,
  type MinorBodiesPref,
} from '../src/lib/minorBodies/prefs';
import { HYP_SENTINEL_SE, HYPOTHETICAL_POINTS, hypotheticalPoint } from '../src/lib/minorBodies/hypothetical';
import { minorDisplayLabel, minorDisplayParts } from '../src/lib/minorBodies/naming';
import {
  astDirFor,
  BUILTIN_ALIAS,
  fileNameFor,
  filePathFor,
  isCatalogNumber,
  isHypotheticalKey,
  isListKey,
  minorId,
  minorKeyOf,
  minorNumberOf,
  parseFilePath,
  SEAS_MINOR_ID,
  type EpheSpan,
} from '../src/lib/minorBodies/ids';
import { checkSe1Header } from '../src/lib/minorBodies/se1Header';
import manifestJson from '../src/lib/minorBodies/bundled.json';
import {
  BUNDLED_MINOR_BODIES,
  BUNDLED_SET,
  BUNDLED_SOURCE_ID,
  bundledMinorBody,
  bundledSearch,
  bundledSource,
  foldMinorName,
  MINOR_BODY_GROUPS,
  needsMinorFile,
  rankBundledMatch,
  rankMinorMatch,
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
  meridianLngFor,
  normLng,
  type LineType,
  type MeridianLng,
} from '../src/lib/astro/lines';
import { buildLineCard, lineReading, minorDisplayName, minorMarkHtml, minorNameHtml } from '../src/lib/lineCard';
import { generateMinorParans } from '../src/lib/astro/parans';
import { minorLineColor, minorPaletteSlot, THEMES, type Theme } from '../src/lib/theme';
import {
  ASPECT_GLYPHS,
  ELEMENT_GLYPHS,
  MINOR_GLYPHS,
  MODALITY_GLYPHS,
  PLANET_GLYPHS,
  SIGN_GLYPHS,
} from '../src/lib/astro/glyphChars';
import { minorIconId } from '../src/components/Map/glyphImages';
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
  // The engine's own ids below 10000 are its planets, nodes and built-in bodies (5 is
  // Jupiter, 10 the mean node), so this table is the ONLY way a catalog number may reach
  // one. 3h holds the offset to what the engine actually answers.
  check('the main-asteroid id table is Pholus alone — every other catalog number reaches the engine as 10000 + n',
    SEAS_MINOR_ID.size === 1 && [...SEAS_MINOR_ID.values()].join() === '16',
    [...SEAS_MINOR_ID].map(([n, id]) => `${n} → ${id}`).join(', '));

  // The curated manifest: no alias smuggled in, no duplicates, known groups, and
  // `seas` exactly where the id table puts a body in the main-asteroid file.
  const raw = (manifestJson as { bodies: Array<{ n: number; group: string; seas?: boolean }> }).bodies;
  check('manifest: no built-in alias among the bundled bodies', raw.length === BUNDLED_MINOR_BODIES.length,
    `${raw.length - BUNDLED_MINOR_BODIES.length} filtered out`);
  check('manifest: every number once', new Set(raw.map((b) => b.n)).size === raw.length);
  check('manifest: every group is a browsing group',
    raw.every((b) => (MINOR_BODY_GROUPS as string[]).includes(b.group)));
  check('manifest: `seas` ⇔ in the main-asteroid id table', raw.every((b) => !!b.seas === SEAS_MINOR_ID.has(b.n)));

  // TWO PARTS: each body's browsing group, chosen by hand, against its orbit class —
  // the code JPL's Small-Body Database gives it, recorded beside the group as `cls` by a
  // lookup of its own, never derived from the group. A body filed under the wrong heading
  // disagrees with its class, and so does a class the lookup got wrong. Main belt takes
  // the inner and outer belt too; near-Earth, the four near-Earth orbit families.
  const CLASS_OF_GROUP: Record<string, string[]> = {
    dwarf: ['TNO'],
    centaur: ['CEN'],
    mainBelt: ['MBA', 'IMB', 'OMB'],
    nearEarth: ['APO', 'ATE', 'AMO', 'IEO'],
  };
  const classed = (manifestJson as { bodies: Array<{ n: number; name: string; group: string; cls?: string }> }).bodies;
  const unclassed = classed.filter((b) => typeof b.cls !== 'string' || b.cls === '');
  check(`manifest: every entry carries its orbit class (cls) — ${classed.length - unclassed.length} of ${classed.length}`,
    unclassed.length === 0, unclassed.map((b) => `${b.n} ${b.name}`).join(', '));
  for (const group of [...new Set(classed.map((b) => b.group))]) {
    const members = classed.filter((b) => b.group === group);
    const allowed = CLASS_OF_GROUP[group] ?? [];
    const wrong = members.filter((b) => !allowed.includes(b.cls ?? ''));
    const tally = [...new Set(members.map((b) => b.cls ?? '—'))].sort()
      .map((c) => `${c} ${members.filter((b) => (b.cls ?? '—') === c).length}`).join(', ');
    check(`manifest: group "${group}" holds only ${allowed.join('/') || '(no class rule)'} — ${members.length} bodies`,
      allowed.length > 0 && wrong.length === 0,
      wrong.length ? `not ${allowed.join('/')}: ${wrong.map((b) => `${b.n} ${b.name} ${b.cls}`).join(', ')}` : tally);
  }
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

// Catalog bodies — numbered bodies whose files no checkout carries, for 3d's geometry
// and section 4's second Horizons run. MINOR_CATALOG_DIR names a folder holding their
// short files in the upstream layout (a downstream build's staging mirror is one as it
// stands). Each is loaded the way the app loads one — fetched (here, read off the disk),
// header-checked under its own name, mounted, probed at J2000 — so what 3d and 4 sample
// is what the loader mounted, never a folder put on the engine's path by hand. Without
// the folder, 3d and 4 say what they left out and SKIP it.
const CATALOG_DIR = process.env.MINOR_CATALOG_DIR;
const CATALOG_NAMES = new Map<number, string>([
  [588, 'Achilles'], // Jupiter Trojan
  [85_030, 'Admetos'], // Jupiter Trojan
  [514_107, 'Kaʻepaokaʻāwela'], // Jupiter's retrograde co-orbital
  [524_522, 'Zoozve'], // near-Earth, Aten
  [541_132, 'Leleākūhonua'], // trans-Neptunian, above 500,000
]);
const catalogFile = (n: number) => resolve(CATALOG_DIR ?? '', filePathFor(n, 'short'));
const catalogAbsent = [...CATALOG_NAMES.keys()].filter((n) => !CATALOG_DIR || !existsSync(catalogFile(n)));
const catalogReady = new Set<number>();
const catalogWhy = CATALOG_DIR
  ? `missing under ${CATALOG_DIR}: ${catalogAbsent.map((n) => filePathFor(n, 'short')).join(', ')}`
  : `set MINOR_CATALOG_DIR to a folder holding ${[...CATALOG_NAMES.keys()].map((n) => filePathFor(n, 'short')).join(', ')} (upstream layout)`;
if (catalogAbsent.length < CATALOG_NAMES.size) {
  const present = [...CATALOG_NAMES.keys()].filter((n) => !catalogAbsent.includes(n));
  const disk: MinorBodySource = {
    id: 'verify-catalog',
    label: 'catalog',
    minQueryLen: 1,
    debounceMs: 0,
    search: async () => [],
    fetchFile: async (n) => {
      const b = readFileSync(catalogFile(n));
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    },
  };
  await ensureMinorBodies(present.map((n) => ({ n, source: disk })));
  for (const n of present) if (minorLoadState(n)?.status === 'ready') catalogReady.add(n);
  const said = (n: number) => {
    const s = minorLoadState(n);
    return s?.status === 'ready' ? `"${s.name}"` : JSON.stringify(s);
  };
  check(`3c loader: ${present.length === 1 ? 'the one catalog body' : `${present.length} catalog bodies`} from MINOR_CATALOG_DIR ${present.length === 1 ? 'loads' : 'load'} ready, each named by its own header`,
    catalogReady.size === present.length, present.map((n) => `${n} ${said(n)}`).join(', '));
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
  // engine directly (RA, and sidereal time as the ARMC at Greenwich). One body of each
  // class the files hold — near-Earth Eros, trans-Neptunian Eris, the centaur Pholus from
  // the main-asteroid file, main-belt Hygiea — and a catalog body, the Jupiter Trojan
  // 588 Achilles, as the loader mounted it from MINOR_CATALOG_DIR.
  const jd = J(2012, 1, 31); // Eros two days from a close approach (0.18 au)
  const gmst = gmstRadians(jd);
  const meridianLng = meridianLngFor('celestial', obliquity(jd), gmst); // the app's own factory
  const decor = (n: number): MinorDecor => ({
    name: bundledMinorBody(n)?.name ?? CATALOG_NAMES.get(n) ?? '',
    color: minorLineColor(n, 'dark'),
    icon: `minor-coin-${n}`,
  });
  const HYGIEA = 10;
  const TROJAN = 588;
  if (!hasFile(HYGIEA)) skip(`3d ${HYGIEA} (main belt)`, `${fileNameFor(HYGIEA)} is absent from public/ephe/`);
  if (!catalogReady.has(TROJAN)) {
    skip(`3d ${TROJAN} ${CATALOG_NAMES.get(TROJAN)} (a catalog body)`,
      catalogAbsent.includes(TROJAN) ? catalogWhy : 'its file did not load (the 3c catalog line says why)');
  }
  const numbers = [A, B, 5145, ...(hasFile(HYGIEA) ? [HYGIEA] : []), ...(catalogReady.has(TROJAN) ? [TROJAN] : [])];
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

// The seeded chart — a fresh install's first (birthData.ts: Jim Lewis, 1941-06-05 09:30
// EDT, Yonkers) — through the app's own JD conversion. 3h and section 4's second Horizons
// run are taken at its moment, which Horizons was asked for as JD 2430151.0625 UT.
const LEWIS_HORIZONS_JD = 2430151.0625;
const lewis = SEED_BIRTHS.find((b) => b.name === 'Jim Lewis');
const LEWIS_JD = lewis ? birthDataToJD(lewis) : NaN;
check('3h the seeded Jim Lewis chart is 1941-06-05 13:30 UT — JD 2430151.0625, the instant Horizons was asked for',
  Math.abs(LEWIS_JD - LEWIS_HORIZONS_JD) < 1e-9, lewis ? `JD ${LEWIS_JD}` : 'no seeded chart named Jim Lewis');

// 3h — catalog numbers that are also engine body ids (TWO PARTS). MPC 5 Astraea and
// 10 Hygiea share their numbers with the engine's Jupiter and mean lunar node. A catalog
// body reaches the engine as 10000 + n (minorSweId, ephemeris.ts), and Pholus alone by
// the main-asteroid file's id, 16, on purpose (section 1). minorSweId is private to
// ephemeris.ts, so the id it chose is read off what the app returns: the app's sample of
// n must be the engine's body 10000 + n exactly — one engine instance, the same flags —
// and must NOT be the engine's body n.
//
// The bar for "not": a lost offset would have the app ask the engine for Jupiter itself,
// which agrees to the last bit, so any bar clear of rounding catches it. It is 1°, and it
// is a bar for THIS instant only — each pair does pass within about 0.1° of the other (a
// 5-day scan of 1500–2100, measured 2026-09-29: Astraea–Jupiter 0.12°, Hygiea–node
// 0.11°). At the seeded chart's moment they are 39.2° and 132.5° apart, 39 times the bar
// at the nearer — a margin no regenerated file, which moves a body by arcseconds, closes.
if (!hasFile(5) || !hasFile(10)) {
  skip('3h Astraea and Hygiea against the engine\'s bodies 5 and 10', `need ${fileNameFor(5)} and ${fileNameFor(10)} in public/ephe/`);
} else {
  const NOT_BAR_DEG = 1;
  const jd = LEWIS_JD;
  const engine = (id: number) => {
    const p = node.calculatePosition(jd, id, FLAG_EQ);
    return { ra: p.longitude * DEG2RAD, dec: p.latitude * DEG2RAD };
  };
  const apart = (a: { ra: number; dec: number }, b: { ra: number; dec: number }) =>
    2 * Math.asin(Math.sqrt(Math.sin((b.dec - a.dec) / 2) ** 2 + Math.cos(a.dec) * Math.cos(b.dec) * Math.sin((b.ra - a.ra) / 2) ** 2)) * RAD2DEG;
  const same = (a: { ra: number; dec: number } | null, b: { ra: number; dec: number }) =>
    !!a && Math.abs(normLng((a.ra - b.ra) * RAD2DEG)) * DEG2RAD < 1e-12 && Math.abs(a.dec - b.dec) < 1e-12;
  const radec = (p: { ra: number; dec: number } | null) =>
    p ? `RA ${(p.ra * RAD2DEG).toFixed(4)}° Dec ${(p.dec * RAD2DEG).toFixed(4)}°` : 'null';
  for (const n of [5, 10]) {
    const name = bundledMinorBody(n)?.name ?? `(${n})`;
    const own = sampleMinorBody(jd, n);
    const offset = engine(MINOR_ID_OFFSET + n);
    const clash = engine(n);
    const offsetName: string = node.getCelestialBodyName(MINOR_ID_OFFSET + n);
    const clashName: string = node.getCelestialBodyName(n);
    check(`3h ${name} (${n}) is the engine's body ${MINOR_ID_OFFSET + n}: the app's sample equals it exactly, and the engine names it "${offsetName}"`,
      same(own, offset) && offsetName === name, `app ${radec(own)}`);
    const sep = own ? apart(own, clash) : NaN;
    check(`3h ${name} (${n}) is not the engine's body ${n}, "${clashName}": ${sep.toFixed(2)}° apart at the seeded chart's moment (bar ${NOT_BAR_DEG}°)`,
      sep > NOT_BAR_DEG, `${clashName} ${radec(clash)}`);
  }
  const ph = sampleMinorBody(jd, 5145);
  const phName: string = node.getCelestialBodyName(16);
  check(`3h Pholus (5145) is the engine's body 16 by design: the app's sample equals it exactly, and the engine names it "${phName}"`,
    same(ph, engine(16)) && phName === 'Pholus', `app ${radec(ph)}`);
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

// Then a second run, retrieved 2026-09-29 (18:14–18:18 UTC), one request per body: the
// same query with format=json CSV_FORMAT='YES' and QUANTITIES='2,20,30,31,36' — 36 is
// Horizons's own formal RA/DEC 3σ for its solution; the other additions go unused here —
// at TLIST='2407715.5' '2430151.0625' '2461312.5' '2484417.5': 1880-01-01, the seeded
// Jim Lewis chart (1941-06-05 13:30 UT, pinned above 3h), 2026-09-29 and 2090-01-01.
// Every solution is DE441 with SB441-N16 perturbers; each body's JPL# heads its rows.
// The bodies: eight with bundled files (main belt, near-Earth, a centaur, three
// trans-Neptunians); Pholus, from the main-asteroid file; Chiron and Ceres, which are
// the app's BUILT-IN bodies and are sampled by name through the alias table as the
// planets are (on the catalog path 2060 and 1 would ask for files that don't exist); and
// five catalog bodies from MINOR_CATALOG_DIR, three of them numbered above 500,000.
//
// The tolerance is the first run's — 1.5× the separation measured on these files, never
// under 0.5″ — so it is a regression guard, not an accuracy claim: it holds the app to
// what these files gave on 2026-09-29. Horizons's 3σ is printed beside each gap as
// context and is never the bar. Three things to read it with:
//   - A floor under every gap. The Sun, Moon and Mars — one JPL planetary integration on
//     both sides — differ by 0.05–0.30″ at these instants: a rotation between Horizons's
//     IAU 1976/80 "of date" frame and the engine's precession model. For well-observed
//     bodies (Ceres ≤ 0.001″, the main belt and the Trojans ≤ 0.11″) the formal 3σ sits
//     under that floor, so "outside 3σ" there says nothing about either orbit.
//   - A clock in 2090. Horizons holds TDB − UT at its last known 69.18 s for every future
//     date, while the engine extrapolates ΔT to about 88.8 s. The 19.6 s between them
//     moves only fast movers — Zoozve 1.3″, Eros 0.5″ — and is what would shift a 2090
//     row if the engine's ΔT model changed.
//   - Horizons's own caveat: its 3σ can be optimistic far from the solution's epoch,
//     above all for bodies with close planetary encounters.
// The profile: in 2026 every bundled body agrees within 0.25″. Away from the files'
// epoch the near-Earth bodies drift furthest (Eros 17.7″ in 1880; Apollo 60.3″ in 2090,
// where Horizons's own 3σ has grown to 8.0″), and the distant centaurs and
// trans-Neptunians reach 5–11″ in 1880 and 2090, inside Horizons's 3σ. Leleākūhonua is
// outside it at every date, 3.2″ even in 2026: JPL's current solution (#7, 2026-05-26)
// is newer than the file (built 2026-03-14), so the two start from different orbits.
{
  const H1880 = 2407715.5;
  const H2026 = 2461312.5;
  const H2090 = 2484417.5;
  const WHEN = new Map<number, string>([
    [H1880, '1880-01-01'],
    [LEWIS_HORIZONS_JD, '1941-06-05 13:30 (Jim Lewis)'],
    [H2026, '2026-09-29'],
    [H2090, '2090-01-01'],
  ]);
  const RUN: Array<{ n: number; jd: number; ra: number; dec: number; sigma3: number; measured: number }> = [
    // 5 Astraea (main belt) — JPL#147
    { n: 5, jd: H1880, ra: 210.698390122, dec: -8.696439923, sigma3: 0.107, measured: 0.237 },
    { n: 5, jd: LEWIS_HORIZONS_JD, ra: 102.421858333, dec: 21.186288494, sigma3: 0.054, measured: 0.282 },
    { n: 5, jd: H2026, ra: 332.578507568, dec: -13.926512427, sigma3: 0.008, measured: 0.25 },
    { n: 5, jd: H2090, ra: 59.553256483, dec: 12.634679999, sigma3: 0.09, measured: 0.472 },
    // 10 Hygiea (main belt) — JPL#129
    { n: 10, jd: H1880, ra: 5.53978104, dec: 6.627744309, sigma3: 0.096, measured: 1.032 },
    { n: 10, jd: LEWIS_HORIZONS_JD, ra: 41.986952351, dec: 19.146602099, sigma3: 0.04, measured: 0.543 },
    { n: 10, jd: H2026, ra: 148.535647148, dec: 10.992972999, sigma3: 0.01, measured: 0.489 },
    { n: 10, jd: H2090, ra: 282.439439527, dec: -22.935267512, sigma3: 0.059, measured: 0.997 },
    // 1862 Apollo (near-Earth, Apollo) — JPL#579
    { n: 1862, jd: H1880, ra: 188.211266166, dec: 3.217860409, sigma3: 0.43, measured: 9.444 },
    { n: 1862, jd: LEWIS_HORIZONS_JD, ra: 35.308588363, dec: 5.801536665, sigma3: 0.193, measured: 3.061 },
    { n: 1862, jd: H2026, ra: 186.58601346, dec: -0.722190839, sigma3: 0.002, measured: 0.093 },
    { n: 1862, jd: H2090, ra: 68.970630626, dec: 35.250679154, sigma3: 7.971, measured: 60.256 },
    // 433 Eros (near-Earth, Amor) — JPL#659
    { n: 433, jd: H1880, ra: 187.200349084, dec: -5.448260668, sigma3: 0.084, measured: 17.698 },
    { n: 433, jd: LEWIS_HORIZONS_JD, ra: 67.598195649, dec: 26.944919904, sigma3: 0.022, measured: 4.585 },
    { n: 433, jd: H2026, ra: 234.984082955, dec: -25.074227059, sigma3: 0.014, measured: 0.11 },
    { n: 433, jd: H2090, ra: 258.230964663, dec: -28.982953098, sigma3: 0.02, measured: 2.376 },
    // 10199 Chariklo (centaur) — JPL#61
    { n: 10199, jd: H1880, ra: 181.964882208, dec: -24.899503974, sigma3: 1.118, measured: 1.306 },
    { n: 10199, jd: LEWIS_HORIZONS_JD, ra: 166.452190834, dec: -16.815129519, sigma3: 0.581, measured: 0.681 },
    { n: 10199, jd: H2026, ra: 321.431139363, dec: -4.212273537, sigma3: 0.018, measured: 0.123 },
    { n: 10199, jd: H2090, ra: 325.115532907, dec: -2.458737054, sigma3: 0.299, measured: 0.325 },
    // 136199 Eris (trans-Neptunian) — JPL#103
    { n: 136_199, jd: H1880, ra: 2.481143227, dec: -38.782548492, sigma3: 9.423, measured: 5.36 },
    { n: 136_199, jd: LEWIS_HORIZONS_JD, ra: 15.657426525, dec: -21.635828023, sigma3: 2.483, measured: 1.102 },
    { n: 136_199, jd: H2026, ra: 27.536883109, dec: 0.093010582, sigma3: 0.046, measured: 0.056 },
    { n: 136_199, jd: H2090, ra: 36.778725404, dec: 18.351606349, sigma3: 2.859, measured: 0.665 },
    // 90377 Sedna (trans-Neptunian) — JPL#51
    { n: 90377, jd: H1880, ra: 5.615350356, dec: -6.061363019, sigma3: 8.456, measured: 3.673 },
    { n: 90377, jd: LEWIS_HORIZONS_JD, ra: 22.88566509, dec: -1.149522607, sigma3: 4.034, measured: 1.489 },
    { n: 90377, jd: H2026, ra: 62.722580697, dec: 8.951434364, sigma3: 0.118, measured: 0.078 },
    { n: 90377, jd: H2090, ra: 108.293021124, dec: 14.817678227, sigma3: 7.981, measured: 0.962 },
    // 225088 Gonggong (trans-Neptunian) — JPL#25
    { n: 225_088, jd: H1880, ra: 216.148774442, dec: -45.380481483, sigma3: 105.711, measured: 10.863 },
    { n: 225_088, jd: LEWIS_HORIZONS_JD, ra: 310.273553127, dec: -37.628869609, sigma3: 13.347, measured: 2.589 },
    { n: 225_088, jd: H2026, ra: 337.759366795, dec: -10.106193057, sigma3: 0.11, measured: 0.056 },
    { n: 225_088, jd: H2090, ra: 349.161880021, dec: 4.364260399, sigma3: 4.92, measured: 0.284 },
    // 5145 Pholus (centaur; the main-asteroid file) — JPL#24
    { n: 5145, jd: H1880, ra: 332.91512315, dec: -24.614026314, sigma3: 9.709, measured: 4.581 },
    { n: 5145, jd: LEWIS_HORIZONS_JD, ra: 289.53357504, dec: -17.050247745, sigma3: 3.97, measured: 1.858 },
    { n: 5145, jd: H2026, ra: 280.137972171, dec: -15.007308782, sigma3: 0.418, measured: 0.175 },
    { n: 5145, jd: H2090, ra: 212.710328159, dec: 12.403634273, sigma3: 24.489, measured: 11.186 },
    // 2060 Chiron (built-in) — JPL#171
    { n: 2060, jd: H1880, ra: 36.477325302, dec: 12.811486951, sigma3: 0.197, measured: 0.211 },
    { n: 2060, jd: LEWIS_HORIZONS_JD, ra: 119.651912597, dec: 14.073214974, sigma3: 0.424, measured: 0.217 },
    { n: 2060, jd: H2026, ra: 27.44024158, dec: 11.486981378, sigma3: 0.016, measured: 0.061 },
    { n: 2060, jd: H2090, ra: 96.517361212, dec: 16.376022706, sigma3: 0.501, measured: 0.29 },
    // 1 Ceres (built-in) — JPL#48
    { n: 1, jd: H1880, ra: 156.953186679, dec: 22.379077165, sigma3: 0.001, measured: 0.287 },
    { n: 1, jd: LEWIS_HORIZONS_JD, ra: 275.841612057, dec: -25.407823354, sigma3: 0.001, measured: 0.455 },
    { n: 1, jd: H2026, ra: 106.948472549, dec: 23.14459998, sigma3: 0, measured: 0.055 },
    { n: 1, jd: H2090, ra: 344.850927907, dec: -16.542858488, sigma3: 0, measured: 0.484 },
    // 588 Achilles (catalog; Jupiter Trojan) — JPL#117
    { n: 588, jd: H1880, ra: 34.315842924, dec: 26.214443171, sigma3: 0.029, measured: 0.247 },
    { n: 588, jd: LEWIS_HORIZONS_JD, ra: 115.167504496, dec: 23.783515921, sigma3: 0.024, measured: 0.109 },
    { n: 588, jd: H2026, ra: 200.573481641, dec: -17.73623702, sigma3: 0.023, measured: 0.096 },
    { n: 588, jd: H2090, ra: 296.275157081, dec: -24.612159301, sigma3: 0.005, measured: 0.009 },
    // 85030 Admetos (catalog; Jupiter Trojan) — JPL#49
    { n: 85030, jd: H1880, ra: 38.482860976, dec: -1.718229675, sigma3: 0.014, measured: 0.145 },
    { n: 85030, jd: LEWIS_HORIZONS_JD, ra: 159.60437418, dec: 0.239068474, sigma3: 0.05, measured: 0.147 },
    { n: 85030, jd: H2026, ra: 169.047492279, dec: -3.695497057, sigma3: 0.039, measured: 0.081 },
    { n: 85030, jd: H2090, ra: 331.660582288, dec: -0.44098452, sigma3: 0.036, measured: 0.097 },
    // 514107 Kaʻepaokaʻāwela (catalog; Jupiter's retrograde co-orbital) — JPL#9
    { n: 514_107, jd: H1880, ra: 219.856868308, dec: 2.492910747, sigma3: 3.103, measured: 0.674 },
    { n: 514_107, jd: LEWIS_HORIZONS_JD, ra: 194.962683626, dec: 13.316284017, sigma3: 2.873, measured: 0.522 },
    { n: 514_107, jd: H2026, ra: 128.14726728, dec: 14.732726931, sigma3: 1.142, measured: 0.019 },
    { n: 514_107, jd: H2090, ra: 255.38881075, dec: -10.029245988, sigma3: 2.184, measured: 0.152 },
    // 524522 Zoozve (catalog; near-Earth, Aten) — JPL#86
    { n: 524_522, jd: H1880, ra: 251.132298195, dec: -41.407036182, sigma3: 2.157, measured: 11.345 },
    { n: 524_522, jd: LEWIS_HORIZONS_JD, ra: 72.560622078, dec: 20.881444518, sigma3: 0.383, measured: 0.735 },
    { n: 524_522, jd: H2026, ra: 162.261952866, dec: 43.154673627, sigma3: 0.345, measured: 0.104 },
    { n: 524_522, jd: H2090, ra: 290.48057891, dec: -18.805720029, sigma3: 1.206, measured: 11.375 },
    // 541132 Leleākūhonua (catalog; trans-Neptunian) — JPL#7
    { n: 541_132, jd: H1880, ra: 318.875828107, dec: -12.003546931, sigma3: 57.184, measured: 73.258 },
    { n: 541_132, jd: LEWIS_HORIZONS_JD, ra: 332.908788721, dec: -4.361954294, sigma3: 28.26, measured: 33.544 },
    { n: 541_132, jd: H2026, ra: 8.701140624, dec: 16.073903667, sigma3: 0.949, measured: 3.162 },
    { n: 541_132, jd: H2090, ra: 68.56505283, dec: 31.220034648, sigma3: 68.787, measured: 116.766 },
  ];
  const via = (n: number): 'builtin' | 'seas' | 'catalog' | 'file' =>
    BUILTIN_ALIAS.has(n) ? 'builtin' : SEAS_MINOR_ID.has(n) ? 'seas' : CATALOG_NAMES.has(n) ? 'catalog' : 'file';
  const nameOf = (n: number) => BUILTIN_ALIAS.get(n) ?? bundledMinorBody(n)?.name ?? CATALOG_NAMES.get(n) ?? `(${n})`;
  const available = (n: number) =>
    via(n) === 'file' ? hasFile(n) : via(n) === 'catalog' ? catalogReady.has(n) : true;
  const bodiesOf = (pick: (n: number) => boolean) => [...new Set(RUN.map((g) => g.n))].filter(pick);
  const noFile = bodiesOf((n) => via(n) === 'file' && !hasFile(n));
  const noCatalog = bodiesOf((n) => via(n) === 'catalog' && !catalogReady.has(n));
  if (noFile.length) {
    skip(`4 Horizons 2026-09-29: ${noFile.length} bundled bodies × 4 instants`,
      `absent from public/ephe/: ${noFile.map((n) => fileNameFor(n)).join(', ')}`);
  }
  if (noCatalog.length) {
    skip(`4 Horizons 2026-09-29: ${noCatalog.length} catalog bodies × 4 instants (${noCatalog.map((n) => `${n} ${nameOf(n)}`).join(', ')})`,
      noCatalog.every((n) => catalogAbsent.includes(n)) ? catalogWhy : 'not all of them loaded (the 3c catalog line says why)');
  }
  const tally = { ran: 0, inside: 0, over1: 0, over60: 0, widest: 0, at: '' };
  for (const g of RUN) {
    if (!available(g.n)) continue;
    const label = `4 Horizons ${nameOf(g.n)} ${WHEN.get(g.jd)}`;
    const alias = BUILTIN_ALIAS.get(g.n);
    const p = alias ? sampleBody(g.jd, alias, 'mean') : sampleMinorBody(g.jd, g.n);
    if (!p) {
      check(`${label}: sampled`, false);
      continue;
    }
    const dRa = normLng(p.ra * RAD2DEG - g.ra) * Math.cos(g.dec * DEG2RAD);
    const dDec = p.dec * RAD2DEG - g.dec;
    const sep = Math.hypot(dRa, dDec) / ARCSEC;
    const tol = Math.max(0.5, 1.5 * g.measured);
    tally.ran += 1;
    if (sep <= g.sigma3) tally.inside += 1;
    if (sep > 1) tally.over1 += 1;
    if (sep > 60) tally.over60 += 1;
    if (sep > tally.widest) Object.assign(tally, { widest: sep, at: `${nameOf(g.n)} ${WHEN.get(g.jd)}` });
    check(`${label}: within ${tol.toFixed(1)}″`, sep <= tol,
      `${sep.toFixed(2)}″ (measured ${g.measured}″; Horizons 3σ ${g.sigma3.toFixed(3)}″, ${sep <= g.sigma3 ? 'inside' : 'outside'} it)`);
  }
  if (tally.ran) {
    console.log(`      (${tally.ran} gaps: ${tally.inside} inside Horizons's own 3σ, ${tally.over1} over 1″, ${tally.over60} over 1′; ` +
      `the widest ${tally.widest.toFixed(2)}″, ${tally.at})`);
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
  check('labels: named body reads "Eros AS"', byType(named, 'ASC') === 'Eros AS', String(byType(named, 'ASC')));
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

  // The catalog parans' reading and card ('minor-parans-layer' and its overlay twin): every
  // row of a body with Saturn — named and unnamed, an asteroid and a hypothetical point, the
  // overlay's tagged — reads cleanly, in side order, escapes the catalog name, and marks a
  // point "(hyp)". Required non-empty: a reading check over no rows passes vacuously.
  const saturn: PlanetPosition = { name: 'Saturn', ra: 2.2, dec: -0.15 };
  const paransOf = (n: number, name: string) =>
    generateMinorParans([{ n, ra: 1.1, dec: 0.3 }], [saturn], meridianLng, () => ({
      name,
      color: '#e98aa0',
      icon: 'minor-coin-0',
    })).features;
  const paranRows = [
    ...paransOf(433, 'Eros'),
    ...paransOf(433, ''),
    ...paransOf(-42, 'Zeus'),
    ...paransOf(433, '<b>Eros</b>').map((f) => ({ ...f, properties: { ...f.properties, tag: 'Tr' } })),
  ];
  let badParan = '';
  for (const f of paranRows) {
    const props = f.properties as unknown as Record<string, unknown>;
    for (const layer of ['minor-parans-layer', 'minor-parans-ov-layer']) {
      const r = lineReading(layer, props, t);
      const card = buildLineCard(layer, props, t, { km: 12, type: 'pin' }) ?? '';
      const own = minorDisplayName(props, t);
      const first = r?.title.split(' × ')[0] ?? '';
      const sideOk = f.properties.side === 'A' ? first.startsWith(own) : first.startsWith('Saturn');
      const text = `${r?.title ?? ''} ${r?.body ?? ''} ${card}`;
      if (!r || !card || leaks(text) || !sideOk || !r.body.includes(own) || card.includes('<b>Eros'))
        badParan ||= `${layer} ${f.properties.label}: ${text.slice(0, 140)}`;
    }
  }
  check('cards: every catalog paran (named, unnamed, a point, an overlay\'s) reads cleanly, in side order, its name escaped',
    paranRows.length >= 8 && !badParan, badParan || `${paranRows.length} rows`);
  const zeusParan = paransOf(-42, 'Zeus')[0];
  check('cards: a point\'s paran names it "Zeus (hyp)", never by number',
    !!zeusParan && (lineReading('minor-parans-layer', zeusParan.properties as unknown as Record<string, unknown>, t)?.title ?? '').includes('Zeus (hyp)'));
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
//                  The App strips through minorLinePositionOf (a composite's midpoints DO
//                  carry theirs, §12d); on a direct sample it must be minorPositionOf.
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
    // The App's own stripping (App.tsx minorPositions).
    const positions = samples.map(minorLinePositionOf);
    const byN = new Map(wheel.map((w) => [w.n, w]));
    placed += wheel.length;
    if (wheel.length !== samples.length) note('a', `${when}: ${samples.length} sampled, ${wheel.length} on the wheel`);

    // (a) In Zodiaco, the lines are drawn from the ecliptic projection of the sample.
    // The app's own meridian factory, both systems — the mapping the map draws with.
    // (2026-10-02)
    const celestial = meridianLngFor('celestial', eps, gmst);
    const geodetic = meridianLngFor('geodetic', eps, gmst);
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
    if (samples.some((s, i) => JSON.stringify(minorPositionOf(s)) !== JSON.stringify(positions[i]))) {
      note('c', `${when}: minorLinePositionOf is not minorPositionOf on a direct sample`);
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
  check('7c the lines\' positions are the sample stripped to {n, ra, dec, speed} — no lon, the App\'s path (minorLinePositionOf) included',
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
// source, the family hidden, a file loading or failed, a date outside its file — on a
// composite, either parent's date) keeps it off both.
//
// Composed the way App composes them — minorNumbers → minorSamples → minorRows (through
// minorChartContext) → minorRowsEff → minorRowsDrawn beside wheelIsNatal → wheelMinor —
// from the same exported pieces, so what is under test is the agreement of the two
// routes, not a copy of either. One state is the rule's declared exception and is
// asserted as such: no chart open (rows read 'undrawn — noChart', and there is no wheel
// to be on). A promoted overlay is not an exception since 2026-10-05: it stands in for
// the chart catalog bodies and all, so its rows and the wheel both read ITS set, and
// agree by the same rule (checked at an instant where that set differs from the chart's).
//
// A composite is no longer a hold (2026-10-05): its catalog bodies are the parents'
// midpoints (compositeMinorSamples), sampled as App samples them.
//
// Then the files' span edges: every wanted, loaded body missing from the wheel has a
// row that says why — 'noData' — and no body on the wheel has one.

// Composite parents for §8, §9f and §12. COMPOSITE: both inside every short file (about
// 1500–2100) and the main-asteroid file (1800–2399). COMPOSITE_1750: one parent before
// the main-asteroid file and inside the short files, so Pholus and Ceres drop out and the
// short-file bodies stay. COMPOSITE_1450: one parent before every file.
const parentAt = (name: string, year: number, month: number, day: number, hour: number, lat: number, lng: number): BirthData => ({
  name, year, month, day, hour, minute: 0, tzOffset: 0, birthplace: { label: name, lat, lng },
});
const COMPOSITE: CompositeParents = {
  a: parentAt('verify A', 1984, 3, 10, 12, 40.7128, -74.006),
  b: parentAt('verify B', 1991, 8, 20, 6, 48.8566, 2.3522),
};
const COMPOSITE_1750: CompositeParents = { a: parentAt('verify 1750', 1750, 5, 1, 9, 51.5074, -0.1278), b: COMPOSITE.b };
const COMPOSITE_1450: CompositeParents = { a: parentAt('verify 1450', 1450, 5, 1, 9, 51.5074, -0.1278), b: COMPOSITE.b };

interface PipelineState {
  jd: number;
  advanced: boolean;
  none: boolean;
  /** A composite chart's parents, or null for a chart cast for its own moment. */
  composite: CompositeParents | null;
  noTime: boolean;
  anglesOff: boolean;
  eclipseSolo: boolean;
  hideNatal: boolean;
  /** A transits overlay at this instant, or none. */
  overlayJd?: number | null;
  /** That overlay stands in for the chart (Natal off). */
  promoted: boolean;
  shown: boolean;
}
function rowsAndWheel(
  pref: MinorBodiesPref,
  loadState: (n: number) => MinorLoadState | undefined,
  s: PipelineState,
) {
  const p = { ...pref, shown: s.shown };
  const minorNumbers = !s.none ? minorReadyNumbers(p, s.advanced, loadState) : [];
  const samples = minorNumbers.length === 0
    ? []
    : s.composite
      ? compositeMinorSamples(s.composite, minorNumbers)
      : getMinorSamples(s.jd, minorNumbers, true);
  // App's composition: the overlay's set by its rule, then the rows' context folded by
  // minorChartContext — the one App calls — and the natal gates after it.
  const overlayJd = s.overlayJd ?? null;
  const ovSamples = overlayJd !== null && minorNumbers.length
    ? overlayMinorSamples({ by: 'sample', jd: overlayJd }, minorNumbers, null)
    : [];
  const promoted = s.promoted && overlayJd !== null;
  const rows = deriveMinorRows(p, loadState, minorChartContext({
    advanced: s.advanced,
    none: s.none,
    chartSampled: new Set(samples.map(minorLinePositionOf).map((x) => x.n)),
    overlay: overlayJd !== null ? { sampled: new Set(ovSamples.map((x) => x.n)), mode: 'transits' } : null,
    promoted,
    overlayOnMap: overlayJd !== null,
    noTime: s.noTime,
    anglesOff: s.anglesOff,
  }));
  const rowsEff = withMinorDrawGate(rows, s.eclipseSolo ? 'natalOff' : null);
  const rowsDrawn = withMinorDrawGate(rowsEff, s.hideNatal && s.advanced && !promoted ? 'natalOff' : null);
  const wheelSet = promoted ? ovSamples : samples;
  const wheel = wheelSet.length
    ? buildWheelMinor(wheelSet, { ayan: 0, decor: decorFor('dark'), t, list: p.list })
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
    jd: J(2012, 1, 31), advanced: true, none: false, composite: null, noTime: false,
    anglesOff: false, eclipseSolo: false, hideNatal: false, promoted: false, shown: true,
  };
  const STATES: Array<[string, Partial<PipelineState>]> = [
    ['normal', {}],
    ['no birth time', { noTime: true }],
    ['the Angles filter shows none of the four', { anglesOff: true }],
    ['natal lines off: the eclipse clean-up', { eclipseSolo: true }],
    ['natal lines off: hidden', { hideNatal: true }],
    ['a composite chart', { composite: COMPOSITE }],
    ['a composite with a parent before every file (1450)', { composite: COMPOSITE_1450 }],
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
    // Not vacuous either way: a composite both parents' dates reach has every ready body
    // shown and on the wheel — placed, with no speed, no ℞ and no station, since a
    // midpoint has no motion — and one a parent's date is outside has none, each saying so.
    const both = rowsAndWheel(pref, loadState, { ...base, composite: COMPOSITE });
    const kb = kinds(both.rows);
    check('8 a composite chart: every ready body reads shown and is on the wheel, with no speed, ℞ or station',
      setOf(both.wheel.map((w) => w.n)) === setOf(ready) && ready.every((n) => kb.get(n) === 'shown') &&
        both.wheel.every((w) => w.speed === undefined && w.retrograde === undefined && w.stationary === false),
      `wheel [${setOf(both.wheel.map((w) => w.n))}], rows ${[...new Set(kb.values())].sort().join('/')}`);
    const early = rowsAndWheel(pref, loadState, { ...base, composite: COMPOSITE_1450 });
    const ke = kinds(early.rows);
    check('8 a composite with a parent in 1450: every ready body reads noData, and none is on the wheel',
      early.wheel.length === 0 && ready.every((n) => ke.get(n) === 'noData'),
      `wheel ${early.wheel.length}, rows ${[...new Set(ke.values())].sort().join('/')}`);
  }
  {
    // A promoted overlay stands in for the chart, its catalog set included: the wheel and
    // the rows follow ITS instant. At 2300 (a transits overlay on a 2012 chart) every
    // short file is out and Pholus's file still in — so the chart's own set, all shown at
    // 2012, is not what either reads.
    const FAR = J(2300, 1, 1);
    const { rows, wheel } = rowsAndWheel(pref, loadState, { ...base, overlayJd: FAR, promoted: true });
    const k = kinds(rows);
    const shown = ready.filter((n) => k.get(n) === 'shown');
    check('8 promoted overlay at 2300: the wheel and the rows read the overlay\'s instant — Pholus shown and on the wheel, the short-file bodies noData and off it',
      setOf(wheel.map((w) => w.n)) === setOf([5145]) && setOf(shown) === setOf([5145]) &&
        ready.filter((n) => n !== 5145).every((n) => k.get(n) === 'noData') &&
        rows.every((r) => !('overlay' in r)),
      `wheel [${setOf(wheel.map((w) => w.n))}], shown [${setOf(shown)}], rows ${[...new Set(k.values())].sort().join('/')}`);
    // And beside the chart instead: the chart's set on the wheel, every row shown by the
    // chart, and the overlay's side saying which the overlay's date reaches.
    const beside = rowsAndWheel(pref, loadState, { ...base, overlayJd: FAR, promoted: false });
    const bk = kinds(beside.rows);
    const side = new Map(beside.rows.map((r) => [r.entry.n, r.overlay?.kind ?? '-']));
    check('8 the same overlay beside the chart: the chart\'s set on the wheel and shown, the overlay side shown for Pholus and noData for the rest',
      setOf(beside.wheel.map((w) => w.n)) === setOf(ready) && ready.every((n) => bk.get(n) === 'shown') &&
        side.get(5145) === 'shown' && ready.filter((n) => n !== 5145).every((n) => side.get(n) === 'noData'),
      `wheel [${setOf(beside.wheel.map((w) => w.n))}], overlay side ${[...side].map(([n, v]) => `${n}:${v}`).join(' ')}`);
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

// Past every short file (TWO PARTS). 2300-01-01 lies beyond every per-asteroid short file
// (they close 2100–2104) and inside the main-asteroid file (to 2400), so the two kinds must
// part there, each by its own route: every short-file body samples at J2000 and is null at
// 2300, its row reads noData and it is off the wheel; Pholus, from the main-asteroid file,
// still samples, still reads shown, and is still on the wheel. The catalog bodies from
// MINOR_CATALOG_DIR are short files too, and join the sampling half when they loaded.
if (presentBodies.length === 0) {
  skip('8 2300-01-01, past every short file', 'no bundled per-asteroid file is present');
} else {
  const J2000 = 2451545.0;
  const FAR = J(2300, 1, 1);
  const shortFiles = [...presentBodies.map((b) => b.n), ...catalogReady];
  const atJ2000 = shortFiles.filter((n) => sampleMinorBody(J2000, n) !== null);
  const at2300 = shortFiles.filter((n) => sampleMinorBody(FAR, n) !== null);
  const pholus = sampleMinorBody(FAR, 5145);
  check(`8 2300-01-01: all ${shortFiles.length} short-file bodies (${presentBodies.length} bundled, ${catalogReady.size} catalog) sample at J2000 and are null at 2300; Pholus still returns a position`,
    atJ2000.length === shortFiles.length && at2300.length === 0 && !!pholus,
    [
      atJ2000.length < shortFiles.length ? `null at J2000: ${shortFiles.filter((n) => !atJ2000.includes(n)).join(', ')}` : '',
      at2300.length ? `still sampled at 2300: ${at2300.join(', ')}` : '',
      `Pholus at 2300: ${pholus ? `RA ${(pholus.ra * RAD2DEG).toFixed(4)}° Dec ${(pholus.dec * RAD2DEG).toFixed(4)}°` : 'null'}`,
    ].filter(Boolean).join('; '));

  const shortNs = presentBodies.map((b) => b.n);
  const all = [...shortNs, 5145];
  const entry = (n: number) => ({ n, name: bundledMinorBody(n)?.name ?? '', source: BUNDLED_SOURCE_ID });
  const pref: MinorBodiesPref = { shown: true, list: all.map(entry), visible: [...all] };
  const ready = (n: number): MinorLoadState => ({ status: 'ready', name: bundledMinorBody(n)?.name ?? null });
  const { rows, wheel } = rowsAndWheel(pref, ready, {
    jd: FAR, advanced: true, none: false, composite: null, noTime: false,
    anglesOff: false, eclipseSolo: false, hideNatal: false, promoted: false, shown: true,
  });
  const kind = (n: number) => rows.find((r) => r.entry.n === n)?.status.kind;
  const onWheel = new Set(wheel.map((w) => w.n));
  const astray = shortNs.filter((n) => kind(n) !== 'noData' || onWheel.has(n));
  check(`8 2300-01-01: all ${shortNs.length} bundled short-file rows read noData and are off the wheel; Pholus reads shown and is on it`,
    astray.length === 0 && kind(5145) === 'shown' && onWheel.has(5145) && onWheel.size === 1,
    (astray.length ? `not noData, or on the wheel: ${astray.map((n) => `${n} ${kind(n)}`).join(', ')}; ` : '') +
      `${shortNs.filter((n) => kind(n) === 'noData').length} noData; Pholus ${kind(5145)}; wheel [${[...onWheel].join(', ')}]`);
}

// ── 9. Hypothetical points ────────────────────────────────────────────────────
// The ten points computed from the engine's elements file (lib/minorBodies/
// hypothetical.ts, and seorbel.txt beside it). The order is load-bearing: 9a and 9b
// never reach the engine, and 9c must run before ANYTHING has mounted the file.
//   9a IDENTITY   keys, ids, names, colours, search and the list — the reserved-key
//                 design against the MPC-number code it rides beside.
//   9b IDENTITY   the shipped file: the official 2.10.03 element lines (some comment
//                 lines removed), the element sets named where the table says, and
//                 the Kronos figure that makes it matter.
//   9c TWO PARTS  the trap. Without the file the engine answers bodies 40–54 from its
//                 built-in elements (Kronos 14–20″ off), silently, and throws for 56; the
//                 app must compute nothing until the file is proven read. Then the
//                 loader's mount — its failure, its retry — and the app's sample against
//                 the engine's own.
//   9d OUTSIDE    the house astrologer's acceptance values, computed independently with
//                 Swiss Ephemeris 2.10.03 and its seorbel.txt: 1 January, 16:00 UT,
//                 geocentric, tropical, apparent. Tolerance 1″ plus half the last printed
//                 digit. Here the outside authority is her run, not JPL.
//   9e TWO PARTS  the lines: In Zodiaco against the true position for the eight points
//                 near the ecliptic (and not for Cupido and Hades, which aren't), then
//                 §3d's geometry and §7's wheel agreement on one point.
//   9f TWO PARTS  the rows' holds and the wheel, as fixtures (§8's composition).
const HYP_KEYS = HYPOTHETICAL_POINTS.map((p) => p.n);
const HYP_FLAG_ECL = node.CalculationFlag.SwissEphemeris | node.CalculationFlag.Speed;
const hypByName = (name: string) => HYPOTHETICAL_POINTS.find((p) => p.name === name)!;
const HYP_DATES: Array<[string, number]> = [
  ['1990', J(1990, 1, 1, 16)],
  ['2000', J(2000, 1, 1, 16)],
  ['2026', J(2026, 1, 1, 16)],
];
const deg360 = (d: number) => ((d % 360) + 360) % 360;

// 9a — identity, names, colours, search, the list.
{
  const WANT: Array<[number, string, string]> = [
    [40, 'Cupido', 'uranian'], [41, 'Hades', 'uranian'], [42, 'Zeus', 'uranian'], [43, 'Kronos', 'uranian'],
    [44, 'Apollon', 'uranian'], [45, 'Admetos', 'uranian'], [46, 'Vulcanus', 'uranian'], [47, 'Poseidon', 'uranian'],
    [48, 'TransPluto', 'otherHyp'], [56, 'Selena', 'otherHyp'],
  ];
  check('9a ten points, keyed −se, with exactly these names and groups — and the bundled source knows each',
    HYPOTHETICAL_POINTS.length === WANT.length &&
      WANT.every(([se, name, group], i) => {
        const p = HYPOTHETICAL_POINTS[i];
        return p.kind === 'hyp' && p.se === se && p.n === -se && p.name === name && p.group === group &&
          hypotheticalPoint(-se) === p && bundledMinorBody(-se)?.name === name;
      }),
    HYPOTHETICAL_POINTS.map((p) => `${p.n} ${p.name}`).join(', '));
  check('9a the sentinel is Selena (56), beyond the fifteen built-in element sets', HYP_SENTINEL_SE === 56 && hypotheticalPoint(-56)?.name === 'Selena');
  check('9a the points ride beside bundled.json, never in it (its every entry is a file)',
    (manifestJson as { bodies: Array<{ n: number }> }).bodies.every((b) => !isHypotheticalKey(b.n)) &&
      BUNDLED_SET.length === BUNDLED_MINOR_BODIES.length + HYPOTHETICAL_POINTS.length &&
      HYPOTHETICAL_POINTS.every((p) => (MINOR_BODY_GROUPS as string[]).includes(p.group)));
  check('9a ids: minorId(−42) is hyp:42 and minorKeyOf round-trips both forms; malformed ids are null',
    minorId(-42) === 'hyp:42' && minorKeyOf('hyp:42') === -42 && minorKeyOf(minorId(433)) === 433 &&
      HYP_KEYS.every((n) => minorKeyOf(minorId(n)) === n) &&
      ['hyp:', 'hyp:-42', 'hyp:39', 'hyp:1000', 'hyp:42.5', 'mp:-42', 'mp:0', -42, null].every((x) => minorKeyOf(x) === null));
  check('9a the MPC-only tests never take a point: minorNumberOf(hyp:42), minorNumberOf(mp:-42) null; −42 not a catalog number; 42 is still Isis',
    minorNumberOf('hyp:42') === null && minorNumberOf('mp:-42') === null && !isCatalogNumber(-42) &&
      isCatalogNumber(42) && bundledMinorBody(42)?.name === 'Isis');
  check('9a keys: −40…−999 are hypothetical, −39/−1000/−42.5/0/42 are not; a list key is a catalog number or one of those',
    isHypotheticalKey(-40) && isHypotheticalKey(-999) && ![-39, -1000, -42.5, 0, 42, '-42'].some((x) => isHypotheticalKey(x)) &&
      isListKey(-42) && isListKey(-49) && isListKey(433) && !isListKey(2060) && !isListKey(-39));
  check('9a no point needs a file', HYP_KEYS.every((n) => !needsMinorFile(n)));
  let refused = 0;
  for (const n of HYP_KEYS) {
    try {
      await bundledSource.fetchFile(n, 'short');
    } catch {
      refused += 1;
    }
  }
  check('9a the bundled source refuses to fetch a file for any point', refused === HYP_KEYS.length, `${refused}/${HYP_KEYS.length} refused`);

  // Colours: the table's slots, not the number hash (which puts −40, −48 and −56 all
  // in slot 0), and each unlike the same-named asteroid's.
  const slots = HYP_KEYS.map((n) => minorPaletteSlot(n));
  const SAME_NAME: Array<[string, number]> = [['Cupido', 763], ['Zeus', 5731], ['Admetos', 85_030], ['Poseidon', 4341]];
  check('9a colours: ten distinct slots, the table\'s own, each unlike the same-named asteroid\'s — in every theme',
    slots.join() === HYPOTHETICAL_POINTS.map((p) => p.slot).join() && new Set(slots).size === HYP_KEYS.length &&
      SAME_NAME.every(([name, n]) => minorPaletteSlot(hypByName(name).n) !== minorPaletteSlot(n)) &&
      THEMES.every((th) => new Set(HYP_KEYS.map((n) => minorLineColor(n, th))).size === HYP_KEYS.length),
    `slots ${slots.join(',')}; asteroids ${SAME_NAME.map(([name, n]) => `${n} ${name} → ${minorPaletteSlot(n)}`).join(', ')}`);

  // Names — the card, the naming helper, the map label, the wheel. Never a number.
  const zeus = { kind: 'minor', body: 'hyp:42', number: -42, name: 'Zeus', lineType: 'MC', color: '#000' };
  const zeusName = minorDisplayName(zeus, t);
  check('9a names: the card reads "Zeus (hyp)", no digit — from the number, from the id alone, or with no name passed',
    zeusName === 'Zeus (hyp)' && !/\d/.test(zeusName) &&
      minorDisplayName({ kind: 'minor', body: 'hyp:42', name: 'Zeus' }, t) === 'Zeus (hyp)' &&
      minorDisplayName({ ...zeus, name: '' }, t) === 'Zeus (hyp)', zeusName);
  check('9a names: every point is "Name (hyp)"; a point this build doesn\'t know, with no name, reads empty — never "(-49)"',
    HYPOTHETICAL_POINTS.every((p) => minorDisplayLabel(p.n, p.name, t) === `${p.name} (hyp)` && minorDisplayLabel(p.n, '', t) === `${p.name} (hyp)`) &&
      minorDisplayLabel(-49, '', t) === '');
  // The window's rows split that label around the name, so a name too long for its row is
  // cut and its number kept: the parts put back ARE the label, and only the name shortens.
  const PART_CASES: Array<[number, string]> = [
    [514_107, 'Kaʻepaokaʻāwela'], [433, 'Eros'], [433, ''],
    ...HYPOTHETICAL_POINTS.flatMap((p): Array<[number, string]> => [[p.n, p.name], [p.n, '']]),
  ];
  const kaepa = minorDisplayParts(514_107, 'Kaʻepaokaʻāwela', t);
  const unnamed = minorDisplayParts(433, '', t);
  const transPluto = minorDisplayParts(-48, '', t);
  check('9a names: minorDisplayParts is the label cut around the name — "(514107)" and "(hyp)" whole, the name alone the part that shortens',
    PART_CASES.every(([n, name]) => { const p = minorDisplayParts(n, name, t); return p.before + p.own + p.after === minorDisplayLabel(n, name, t); }) &&
      kaepa.before === '' && kaepa.own === 'Kaʻepaokaʻāwela' && kaepa.after === ' (514107)' &&
      unnamed.own === '' && unnamed.after === '(433)' &&
      transPluto.own === 'TransPluto' && transPluto.after === ' (hyp)',
    JSON.stringify([kaepa, unnamed, transPluto]));
  const meridianLng: MeridianLng = (ra) => ra * RAD2DEG - 40;
  const at: MinorPosition = { n: -42, ra: 1.1, dec: 0.1 };
  const zeusLines = generateMinorLines([at], meridianLng, () => ({ name: 'Zeus', color: '#000', icon: 'i' }));
  const asteroidLines = generateMinorLines([{ ...at, n: 5731 }], meridianLng, () => ({ name: 'Zeus', color: '#000', icon: 'i' }));
  const labelOf = (fc: typeof zeusLines) => fc.features.find((f) => f.properties.lineType === 'MC')?.properties.label;
  check('9a map label: minorLabelName + MC = "Zeus (hyp) MC", the naming rule\'s own words — unlike the asteroid 5731 Zeus\'s "Zeus MC" (the hover popup keys on it)',
    labelOf(zeusLines) === 'Zeus (hyp) MC' && labelOf(asteroidLines) === 'Zeus MC' &&
      HYPOTHETICAL_POINTS.every((p) => minorLabelName(p.n, p.name) === minorDisplayLabel(p.n, p.name, t) && minorLabelName(p.n, '') === minorDisplayLabel(p.n, '', t)),
    `${labelOf(zeusLines)} / ${labelOf(asteroidLines)}`);
  const zeusZenith = generateMinorZenith([at], meridianLng, () => ({ name: 'Zeus', color: '#000', icon: 'i' }));
  check('9a features: body and zenith id hyp:42, number −42, no `planet` key',
    zeusLines.features.every((f) => f.properties.body === 'hyp:42' && f.properties.number === -42 && !('planet' in f.properties)) &&
      zeusZenith.features[0]?.id === 'hyp:42');
  const reading = lineReading('minor-lines-layer', zeusLines.features[0].properties as unknown as Record<string, unknown>, t);
  const card = buildLineCard('minor-lines-layer', zeusLines.features[0].properties as unknown as Record<string, unknown>, t, { km: 12, type: 'pin' }) ?? '';
  check('9a card: titled "Zeus (hyp)", read as a hypothetical point, with nothing leaking',
    !!reading && reading.title.includes('Zeus (hyp)') && reading.body.startsWith('Zeus (hyp) is a hypothetical point') &&
      card.includes('Zeus (hyp)') && !/undefined|NaN|\{\w+\}|minorBodies\.|\(-?\d+\)/.test(`${reading.title} ${reading.body} ${card}`),
    reading ? `${reading.title} — ${reading.body.slice(0, 60)}…` : 'no reading');
  const { body: bodyTpl, hypBody: hypTpl } = en.minorBodies.card;
  check('9a card: a point\'s reading is no longer than a minor planet\'s (card.hypBody ≤ card.body, as templates)',
    [...hypTpl].length <= [...bodyTpl].length, `${[...hypTpl].length} / ${[...bodyTpl].length}`);
  const wheelZeus = buildWheelMinor([{ n: -42, ra: 1, dec: 0.1, lon: 1, lat: 0, speed: 0.01 }], {
    ayan: 0, decor: () => ({ name: 'Zeus', color: '#000', icon: 'i' }), t, list: [{ n: -42 }],
  })[0];
  check('9a wheel: id hyp:42, label "Zeus (hyp)" — the card\'s name', wheelZeus?.id === 'hyp:42' && wheelZeus.label === zeusName,
    `${wheelZeus?.id} "${wheelZeus?.label}"`);

  // Search: the bundled source's own ranking over BUNDLED_SET.
  const find = async (q: string) => (await bundledSource.search(q, { limit: 100 })).map((h) => h.n);
  const [isis, persephone, bacchus, n42, zeusHits, vulcanus, transpluto, selena] = await Promise.all(
    ['Isis', 'Persephone', 'Bacchus', '42', 'Zeus', 'Vulcanus', 'TransPluto', 'Selena'].map(find));
  check('9a search: "Isis" → only 42 Isis, "Persephone" → only 399, "Bacchus" → no point (all three real asteroids, never TransPluto)',
    isis.join() === '42' && persephone.join() === '399' && bacchus.includes(2063) && !bacchus.some((n) => isHypotheticalKey(n)),
    `Isis [${isis}], Persephone [${persephone}], Bacchus [${bacchus}]`);
  check('9a search: "42" → only 42 Isis (a point\'s key is never a number to search by)', n42.join() === '42', `[${n42}]`);
  check('9a search: "Zeus" finds the point; "Vulcanus", "TransPluto", "Selena" each find exactly theirs',
    zeusHits.includes(-42) && vulcanus.join() === '-46' && transpluto.join() === '-48' && selena.join() === '-56',
    `Zeus [${zeusHits}], Vulcanus [${vulcanus}], TransPluto [${transpluto}], Selena [${selena}]`);

  // The stored list (prefs.ts), through a stand-in localStorage: points load, a newer
  // build's too; a non-key doesn't; and the points count toward the drawn cap.
  const store = new Map<string, string>();
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  try {
    const entry = (n: number, name: string) => ({ n, name, source: BUNDLED_SOURCE_ID });
    store.set(MINOR_PREF_KEY, JSON.stringify({
      shown: true,
      list: [entry(433, 'Eros'), entry(-42, 'Zeus'), entry(-49, 'Later'), entry(-39, 'Not a key')],
      visible: [-42, -49, 433, -39],
    }));
    const pref = loadMinorBodiesPref();
    check('9a a stored list keeps its points — a newer build\'s (−49) included — and drops a non-key (−39)',
      pref.list.map((e) => e.n).join() === '433,-42,-49' && pref.visible.join() === '-42,-49,433',
      `list [${pref.list.map((e) => e.n)}], visible [${pref.visible}]`);
    const rows = deriveMinorRows(pref, () => undefined, { advanced: true, none: false, sampled: new Set() });
    const kind = (n: number) => rows.find((r) => r.entry.n === n)?.status.kind;
    const requested = minorLoadRequests(pref, true);
    check('9a a point this build doesn\'t know (−49) derives "unavailable" and is never requested; a known one is requested from the bundled source',
      kind(-49) === 'unavailable' && !requested.some((r) => r.n === -49) &&
        requested.find((r) => r.n === -42)?.source === bundledSource &&
        resolveMinorSource({ n: -42, name: 'Zeus', source: 'verify-gone' }) === bundledSource,
      `−49 ${kind(-49)}, requested [${requested.map((r) => r.n)}]`);
    const catalog = BUNDLED_MINOR_BODIES.filter((b) => needsMinorFile(b.n)).slice(0, 15);
    store.set(MINOR_PREF_KEY, JSON.stringify({
      shown: true,
      list: [...HYPOTHETICAL_POINTS.map((p) => entry(p.n, p.name)), ...catalog.map((b) => entry(b.n, b.name))],
      visible: [...HYP_KEYS, ...catalog.map((b) => b.n)],
    }));
    const capped = loadMinorBodiesPref();
    check(`9a the points count toward the ${MINOR_VISIBLE_CAP}-body cap: ten points + ${catalog.length} bodies switched on load ${MINOR_VISIBLE_CAP} visible, points first`,
      capped.visible.length === MINOR_VISIBLE_CAP && HYP_KEYS.every((n) => capped.visible.includes(n)),
      `${capped.visible.length} visible`);
  } finally {
    if (prior) Object.defineProperty(globalThis, 'localStorage', prior);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

// 9b — the shipped file.
{
  const text = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const shipped = text(resolve(process.cwd(), 'src/lib/minorBodies/seorbel.txt'));
  // An element line as the engine reads one (swemplan.c read_elements_file): leading
  // blanks skipped, '#' lines and blank lines passed over, a trailing '#…' cut off,
  // fields split on commas.
  const rawElementLines = (s: string) =>
    s.split('\n').map((l) => l.trimStart()).filter((l) => l !== '' && !l.startsWith('#'));
  const elementLines = (s: string) =>
    rawElementLines(s).map((l) => l.replace(/#.*$/, '').split(',').map((f) => f.trim()));
  const sets = elementLines(shipped);
  // Not the official file byte for byte: some of its comment lines were removed or
  // shortened (those naming people), and its header says so. What the engine reads is
  // pinned against the official file (upstream ephe/seorbel.txt, Swiss Ephemeris
  // 2.10.03) — every element line as written, trailing blanks and '#' tails included —
  // and the file itself separately, so any edit, to a comment or an element, fails here.
  // Both hashes over the text with line endings normalised to LF, as the loader
  // normalises them. (The official file's own, for provenance:
  // 3b9828ae8e40868022ce34ae58d00126ab7b4996e911a4f1fc7234a12ea5b125.)
  const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
  const OFFICIAL_ELEMENT_LINES_SHA256 = 'c2cf9d0e1888078e4f58c3b0af0bf3fe624a22a99162359e08a901f888fb7d3e';
  const SHIPPED_SHA256 = '761e8b74cc725a5721ece2ec8e87c8032f1a572e35b24669059472413131d023';
  const raw = rawElementLines(shipped);
  const elementSha = sha256(raw.join('\n'));
  check('9b every element line is the official 2.10.03 file\'s: its 30 element lines, sha256 of the lines LF-joined',
    raw.length === 30 && elementSha === OFFICIAL_ELEMENT_LINES_SHA256, `${raw.length} lines, ${elementSha.slice(0, 16)}`);
  const sha = sha256(shipped);
  check('9b the shipped file is the pinned revision, comments included (sha256 after CRLF → LF)', sha === SHIPPED_SHA256, sha.slice(0, 16));
  check('9b its header is intact, with the note that it was modified', shipped.startsWith('    # Orbital elements of ficticious planets') &&
    shipped.includes('# This file is part of the Swiss Ephemeris') && shipped.includes('# Modified for AstroLina'));
  // A guard against a future re-download: the official file's comments name people.
  const NAMES = ['Koch', 'Treindl', 'Astrodienst'];
  const named = NAMES.filter((w) => shipped.includes(w));
  check('9b the file names no Swiss Ephemeris author (a re-downloaded official file would)', named.length === 0, named.join(', '));
  const ENGINE_NAMES: Array<[number, string]> = [
    [1, 'Cupido'], [2, 'Hades'], [3, 'Zeus'], [4, 'Kronos'], [5, 'Apollon'], [6, 'Admetos'], [7, 'Vulcanus'], [8, 'Poseidon'],
    [9, 'Isis-Transpluto'], [17, 'Selena/White Moon'],
  ];
  check('9b element sets 1–8, 9 and 17 name the bodies the table computes as 40–47, 48 and 56',
    ENGINE_NAMES.every(([line, name], i) => sets[line - 1]?.[8] === name && HYPOTHETICAL_POINTS[i].se === 39 + line),
    ENGINE_NAMES.map(([line]) => `${line}: ${sets[line - 1]?.[8]}`).join(', '));
  check('9b Kronos\'s semi-axis is 64.81690 (the engine\'s built-in set has 64.81960)', sets[3]?.[3] === '64.81690', sets[3]?.[3]);
  const NODE_COPY = resolve(process.cwd(), 'node_modules/@swisseph/node/libswe/seorbel.txt');
  if (!existsSync(NODE_COPY)) {
    skip('9b against the @swisseph/node copy', `${NODE_COPY} is absent`);
  } else {
    // Not the whole file: the node package carries an older revision of it — trailing
    // blanks trimmed, the Proserpina comment older, and without the test set 26 the
    // official file added. The numbered element sets both engines read are compared.
    const other = elementLines(text(NODE_COPY));
    const shared = Math.min(sets.length, other.length, 25);
    const differ = [...Array(shared).keys()].filter((i) => sets[i].join() !== other[i].join());
    check(`9b element sets 1–${shared} are identical in the shipped file and the @swisseph/node copy`, differ.length === 0,
      differ.map((i) => `set ${i + 1}`).join(', '));
  }
}

// 9c — the trap, then the mount.
{
  const [, jd90] = HYP_DATES[0];
  let threw = '';
  try {
    node.calculatePosition(jd90, HYP_SENTINEL_SE, HYP_FLAG_ECL);
  } catch (err) {
    threw = err instanceof Error ? err.message : String(err);
  }
  check('9c before any mount the engine can\'t compute body 56 — the elements file is on none of its folders (public/ephe included)',
    threw !== '', threw ? `engine: ${threw.trim().replace(/\s+/g, ' ').slice(0, 60)}` : 'it computed');
  const builtIn = node.calculatePosition(jd90, 43, HYP_FLAG_ECL).longitude as number;
  const off = Math.abs(builtIn - 80.6806) / ARCSEC;
  check('9c … and answers Kronos (43) from its built-in elements anyway, silently: ≈80.6767°, over 10″ from the file\'s 80.6806°',
    Math.abs(builtIn - 80.6767) < 0.00033 && off > 10, `${builtIn.toFixed(4)}°, ${off.toFixed(1)}″ from the file's value`);
  check('9c … while the app computes nothing: no sample, no speed, no positions for any point',
    HYP_KEYS.every((n) => sampleMinorBody(jd90, n) === null) && getMinorSamples(jd90, HYP_KEYS, true).length === 0 &&
      getMinorPositions(jd90, HYP_KEYS).length === 0);

  // A mount that fails (no blob: URL to be had): 'elements', and still nothing computed.
  const createObjectURL = URL.createObjectURL;
  URL.createObjectURL = () => {
    throw new Error('verify: no blob URL');
  };
  try {
    await ensureMinorBodies([{ n: -43, source: bundledSource }]);
  } finally {
    URL.createObjectURL = createObjectURL;
  }
  const failedK = minorLoadState(-43);
  check('9c a failed mount leaves the point failed "elements", with the window\'s sentence, and nothing computed',
    failedK?.status === 'failed' && failedK.reason === 'elements' && sampleMinorBody(jd90, -43) === null &&
      t('minorBodies.hud.status.elements') === 'Its orbital elements couldn’t be read.',
    JSON.stringify(failedK));
  // The retry: the mount promise was reset, so this batch mounts afresh.
  retryMinorBody(-43);
  await ensureMinorBodies(HYP_KEYS.map((n) => ({ n, source: bundledSource })));
  const notReady = HYPOTHETICAL_POINTS.filter((p) => minorLoadState(p.n)?.status !== 'ready');
  check('9c after the retry the loader mounts the file and all ten load ready',
    notReady.length === 0, notReady.map((p) => `${p.name} ${JSON.stringify(minorLoadState(p.n))}`).join('; '));
  let worst = 0;
  let missing = '';
  for (const p of HYPOTHETICAL_POINTS) {
    let raw: { longitude: number; latitude: number } | null;
    try {
      raw = node.calculatePosition(jd90, p.se, FLAG_EQ);
    } catch {
      raw = null;
    }
    const app = sampleMinorBody(jd90, p.n);
    if (!raw || !app) {
      missing ||= `${p.name}: engine ${raw ? 'ok' : 'throws'}, app ${app ? 'ok' : 'null'}`;
      continue;
    }
    worst = Math.max(worst, Math.abs(normLng((app.ra - raw.longitude * DEG2RAD) * RAD2DEG)), Math.abs(app.dec * RAD2DEG - raw.latitude));
  }
  check('9c afterwards the engine computes 56 itself, and the app\'s sample of every point is the engine\'s own (1990)',
    !missing && worst < 1e-9, missing || `worst ${worst.toExponential(2)}°`);
}

// 9d — against the acceptance values.
{
  const LONGITUDES: Array<[string, [number, number, number]]> = [
    ['Cupido', [230.2480, 243.9003, 279.3906]],
    ['Hades', [67.9053, 78.1777, 104.8996]],
    ['Zeus', [177.3437, 185.3884, 206.2559]],
    ['Kronos', [80.6806, 87.7961, 106.3277]],
    ['Apollon', [195.0808, 201.3073, 217.4864]],
    ['Admetos', [43.2347, 49.1140, 64.4393]],
    ['Vulcanus', [104.9281, 110.4365, 124.7549]],
    ['Poseidon', [209.7465, 214.5591, 227.0880]],
    ['TransPluto', [142.0547, 145.7354, 154.8750]],
    ['Selena', [87.9636, 242.2402, 139.6369]],
  ];
  const LATITUDES: Array<[string, [number, number, number]]> = [
    ['Cupido', [1.0472, 0.9746, 0.5488]],
    ['Hades', [-1.0533, -1.0504, -0.8949]],
  ];
  const TOL = ARCSEC + 0.00005; // 1″ + half the fourth decimal
  const sampleAt = new Map(HYP_DATES.map(([when, jd]) => [when, new Map(getMinorSamples(jd, HYP_KEYS).map((s) => [s.n, s]))]));
  const measure = (name: string, want: [number, number, number], of: 'lon' | 'lat') => {
    let worst = 0;
    const got: string[] = [];
    HYP_DATES.forEach(([when], i) => {
      const s = sampleAt.get(when)!.get(hypByName(name).n);
      const v = s ? s[of] * RAD2DEG : NaN;
      got.push(v.toFixed(4));
      worst = Math.max(worst, of === 'lon' ? Math.abs(normLng(v - want[i])) : Math.abs(v - want[i]));
    });
    return { ok: worst <= TOL, detail: `${got.join(' | ')} — worst ${(worst / ARCSEC).toFixed(2)}″` };
  };
  for (const [name, want] of LONGITUDES) {
    const m = measure(name, want, 'lon');
    check(`9d ${name} longitude 1990 | 2000 | 2026 = ${want.map((w) => w.toFixed(4)).join(' | ')}`, m.ok, m.detail);
  }
  for (const [name, want] of LATITUDES) {
    const m = measure(name, want, 'lat');
    check(`9d ${name} latitude 1990 | 2000 | 2026 = ${want.map((w) => `${w > 0 ? '+' : ''}${w.toFixed(4)}`).join(' | ')}`, m.ok, m.detail);
  }
  let worstLat = 0;
  for (const p of HYPOTHETICAL_POINTS) {
    if (p.name === 'Cupido' || p.name === 'Hades') continue;
    for (const [when] of HYP_DATES) worstLat = Math.max(worstLat, Math.abs((sampleAt.get(when)!.get(p.n)?.lat ?? NaN) * RAD2DEG));
  }
  check('9d the other eight points\' latitudes are within 0.02° of zero at all three dates', worstLat < 0.02, `worst ${worstLat.toFixed(4)}°`);

  // Cupido, 1 Jan 1990 16:00 UT, through the App's own recipe (App.tsx
  // minorLinePositions): In Mundo draws from the true position, latitude included; In
  // Zodiaco from its projection onto the ecliptic. Read back off the MC line (RA =
  // its longitude + GMST) and the zenith (declination = its latitude).
  const [, jd] = HYP_DATES[0];
  const gmst = gmstRadians(jd);
  const celestial: MeridianLng = (ra) => ((ra - gmst) * 180) / Math.PI;
  const decor = decorFor('dark');
  const positions = getMinorSamples(jd, [-40]).map(minorPositionOf);
  const drawn = (ps: MinorPosition[]) => {
    const mc = mcLngOf(generateMinorLines(ps, celestial, decor), -40);
    const zLat = generateMinorZenith(ps, celestial, decor).features[0]?.geometry.coordinates[1];
    return { ra: deg360((mc ?? NaN) + gmst * RAD2DEG), dec: zLat ?? NaN };
  };
  const dm = (d: number) => `${d < 0 ? '−' : ''}${Math.floor(Math.abs(d))}°${((Math.abs(d) % 1) * 60).toFixed(2)}′`;
  const mundo = drawn(positions);
  const zod = drawn(projectMinorOntoEcliptic(positions, jd));
  check('9d Cupido In Mundo, 1990: drawn from RA 228.10° (±0.005°), Dec −16°48′ (±0.5′) — latitude included',
    Math.abs(mundo.ra - 228.10) <= 0.005 && Math.abs(mundo.dec - (-16 - 48 / 60)) <= 0.5 / 60,
    `RA ${mundo.ra.toFixed(4)}°, Dec ${dm(mundo.dec)}`);
  check('9d Cupido In Zodiaco, 1990: drawn from the ecliptic projection, RA 227.81° (±0.005°), Dec −17°49′ (±0.5′)',
    Math.abs(zod.ra - 227.81) <= 0.005 && Math.abs(zod.dec - (-17 - 49 / 60)) <= 0.5 / 60,
    `RA ${zod.ra.toFixed(4)}°, Dec ${dm(zod.dec)}`);
}

// 9e — the lines.
{
  const near = HYPOTHETICAL_POINTS.filter((p) => p.name !== 'Cupido' && p.name !== 'Hades');
  const off = HYPOTHETICAL_POINTS.filter((p) => p.name === 'Cupido' || p.name === 'Hades');
  const decor = decorFor('dark');
  const worst = { lat: 0, ra: 0, dec: 0, mc: 0 };
  let leastMove = Infinity;
  let firstBad = '';
  for (const [when, jd] of HYP_DATES) {
    const gmst = gmstRadians(jd);
    const celestial: MeridianLng = (ra) => ((ra - gmst) * 180) / Math.PI;
    const samples = getMinorSamples(jd, HYP_KEYS);
    const positions = samples.map(minorPositionOf);
    const zod = projectMinorOntoEcliptic(positions, jd);
    const trueLines = generateMinorLines(positions, celestial, decor);
    const zodLines = generateMinorLines(zod, celestial, decor);
    for (const p of [...near, ...off]) {
      const s = samples.find((x) => x.n === p.n);
      const z = zod.find((x) => x.n === p.n);
      if (!s || !z) {
        firstBad ||= `${when} ${p.name}: not sampled`;
        continue;
      }
      const dDec = Math.abs(z.dec - s.dec) * RAD2DEG;
      if (off.includes(p)) {
        leastMove = Math.min(leastMove, dDec);
        continue;
      }
      worst.lat = Math.max(worst.lat, Math.abs(s.lat) * RAD2DEG);
      worst.ra = Math.max(worst.ra, Math.abs(normLng((z.ra - s.ra) * RAD2DEG)));
      worst.dec = Math.max(worst.dec, dDec);
      worst.mc = Math.max(worst.mc, Math.abs(normLng((mcLngOf(zodLines, p.n) ?? NaN) - (mcLngOf(trueLines, p.n) ?? NaN))));
    }
  }
  check('9e the eight near-ecliptic points: |β| < 0.02°, and In Zodiaco within 0.03° of In Mundo in RA, Dec and MC-line longitude (3 dates)',
    !firstBad && worst.lat < 0.02 && worst.ra < 0.03 && worst.dec < 0.03 && worst.mc < 0.03,
    firstBad || `worst β ${worst.lat.toFixed(4)}°, RA ${worst.ra.toFixed(4)}°, Dec ${worst.dec.toFixed(4)}°, MC ${worst.mc.toFixed(4)}°`);
  check('9e Cupido and Hades are NOT near it: the projection moves their Dec by more than 0.5° at every date',
    !firstBad && leastMove > 0.5, `least ${leastMove.toFixed(3)}°`);

  // §3d's geometry on Cupido, In Mundo, 1990 — the zenith, the MC and the horizon read
  // against the engine's own RA/dec and sidereal time, nothing of the line algebra
  // reused.
  const [, jd] = HYP_DATES[0];
  const gmst = gmstRadians(jd);
  const celestial: MeridianLng = (ra) => ((ra - gmst) * 180) / Math.PI;
  const samples = getMinorSamples(jd, [-40], true);
  const own = samples[0];
  if (!own) {
    check('9e Cupido sampled for §3d and §7', false);
  } else {
    const positions = samples.map(minorPositionOf);
    const lines = generateMinorLines(positions, celestial, decor);
    const zenith = generateMinorZenith(positions, celestial, decor);
    const eng = node.calculatePosition(jd, 40, FLAG_EQ);
    const armc = node.calculateHouses(jd, 0, 0, node.HouseSystem.WholeSign).armc;
    const mcLng = mcLngOf(lines, -40) ?? NaN;
    const icLng = lines.features.find((f) => f.properties.number === -40 && f.properties.lineType === 'IC')?.geometry.coordinates[0][0] ?? NaN;
    const [zLng, zLat] = zenith.features[0]?.geometry.coordinates ?? [NaN, NaN];
    let alt = 0;
    for (const f of lines.features) {
      if (f.properties.lineType !== 'ASC' && f.properties.lineType !== 'DSC') continue;
      for (const [lng, lat] of f.geometry.coordinates) {
        const theta = (armc + lng) * DEG2RAD;
        const phi = lat * DEG2RAD;
        const dot =
          Math.cos(phi) * Math.cos(theta) * Math.cos(own.dec) * Math.cos(own.ra) +
          Math.cos(phi) * Math.sin(theta) * Math.cos(own.dec) * Math.sin(own.ra) +
          Math.sin(phi) * Math.sin(own.dec);
        alt = Math.max(alt, Math.abs(Math.asin(Math.max(-1, Math.min(1, dot)))));
      }
    }
    const dMc = Math.abs(normLng(mcLng - normLng(eng.longitude - armc)));
    check('9e Cupido (§3d): the MC is the engine\'s RA − sidereal time, the IC its antipode, the zenith on it at the engine\'s declination, ASC/DSC on the horizon',
      dMc < 1e-9 && Math.abs(normLng(icLng - (mcLng + 180))) < 1e-9 && Math.abs(zLng - mcLng) < 1e-9 &&
        Math.abs(zLat - eng.latitude) < 1e-9 && alt < 1e-9,
      `MC Δ ${dMc.toExponential(2)}°, zenith Δ ${Math.abs(zLat - eng.latitude).toExponential(2)}°, max |alt| ${alt.toExponential(2)} rad`);

    // §7 on the same point: the wheel reads the ecliptic call, the lines the equatorial
    // one, and the two describe one point.
    const eps = obliquity(jd);
    const w = buildWheelMinor(samples, { ayan: 0, decor, t, list: [{ n: -40 }] })[0];
    const ecl = node.calculatePosition(jd, 40, HYP_FLAG_ECL);
    const back = w ? eclipticToRaDec(w.lon, w.lat, eps) : { ra: NaN, dec: NaN };
    const dRa = Math.abs(normLng(mcLng - normLng((back.ra - gmst) * RAD2DEG))) / ARCSEC;
    const dDec = Math.abs(zLat - back.dec * RAD2DEG) / ARCSEC;
    const zodMc = mcLngOf(generateMinorLines(projectMinorOntoEcliptic(positions, jd), celestial, decor), -40) ?? NaN;
    const dZod = w ? Math.abs(normLng(zodMc - normLng((eclipticToRaDec(w.lon, 0, eps).ra - gmst) * RAD2DEG))) / ARCSEC : NaN;
    check('9e Cupido (§7): the wheel\'s longitude is the engine\'s; taken back to the equator it is the RA and dec the lines were drawn from; In Zodiaco culminates it',
      !!w && Math.abs(normLng(w.lon * RAD2DEG - ecl.longitude)) < 1e-9 && dRa < 1e-4 && dDec < 1e-4 && dZod < 1e-4 &&
        w.label === 'Cupido (hyp)' && w.id === 'hyp:40',
      `RA ${dRa.toExponential(2)}″, dec ${dDec.toExponential(2)}″, In Zodiaco MC ${dZod.toExponential(2)}″, "${w?.label}"`);
  }
}

// 9f — the rows, and the wheel beside them (§8's composition).
{
  const entry = (n: number, name: string) => ({ n, name, source: BUNDLED_SOURCE_ID });
  const pref: MinorBodiesPref = {
    shown: true,
    list: [...HYPOTHETICAL_POINTS.map((p) => entry(p.n, p.name)), entry(-49, 'Later')],
    visible: [...HYP_KEYS, -49],
  };
  const ready = (): MinorLoadState => ({ status: 'ready', name: null });
  const base: PipelineState = {
    jd: J(2012, 1, 31), advanced: true, none: false, composite: null, noTime: false,
    anglesOff: false, eclipseSolo: false, hideNatal: false, promoted: false, shown: true,
  };
  const kinds = (rows: readonly { entry: { n: number }; status: { kind: string } }[]) =>
    HYP_KEYS.map((n) => rows.find((r) => r.entry.n === n)?.status.kind);
  const all = (xs: Array<string | undefined>, k: string) => xs.every((x) => x === k);
  {
    const { rows, wheel } = rowsAndWheel(pref, ready, base);
    const k = kinds(rows);
    check('9f normal: all ten read shown under their table names, are on the wheel as "Name (hyp)", and −49 reads unavailable',
      all(k, 'shown') && rows.find((r) => r.entry.n === -49)?.status.kind === 'unavailable' &&
        HYPOTHETICAL_POINTS.every((p) => rows.find((r) => r.entry.n === p.n)?.name === p.name) &&
        setOf(wheel.map((x) => x.n)) === setOf(HYP_KEYS) && wheel.every((x) => x.label === `${hypotheticalPoint(x.n)?.name} (hyp)`),
      `${[...new Set(k)].join('/')}; wheel ${wheel.length}`);
  }
  {
    const { rows, wheel } = rowsAndWheel(pref, ready, { ...base, advanced: false });
    const k = kinds(rows);
    check('9f Advanced off: every point reads advanced, and none is on the wheel', all(k, 'advanced') && wheel.length === 0,
      `${[...new Set(k)].join('/')}; wheel ${wheel.length}`);
  }
  // A composite: the points are midpointed like any catalog body — and with the planets'
  // span, a parent in 1450 (before every asteroid file) still has them.
  for (const [label, parents] of [['a composite chart', COMPOSITE], ['a composite with a parent in 1450', COMPOSITE_1450]] as Array<[string, CompositeParents]>) {
    const { rows, wheel } = rowsAndWheel(pref, ready, { ...base, composite: parents });
    const k = kinds(rows);
    check(`9f ${label}: every point reads shown and is on the wheel as its midpoint, with no speed`,
      all(k, 'shown') && setOf(wheel.map((x) => x.n)) === setOf(HYP_KEYS) && wheel.every((x) => x.speed === undefined),
      `${[...new Set(k)].join('/')}; wheel ${wheel.length}`);
  }
  {
    const failed = (): MinorLoadState => ({ status: 'failed', reason: 'elements' });
    const { rows, wheel } = rowsAndWheel(pref, failed, base);
    check('9f elements unreadable (fixture): every point reads failed "elements", none on the wheel, none requested for sampling',
      rows.filter((r) => isHypotheticalKey(r.entry.n) && r.entry.n !== -49)
        .every((r) => r.status.kind === 'failed' && r.status.reason === 'elements') &&
        wheel.length === 0 && minorReadyNumbers(pref, true, failed).length === 0,
      `${[...new Set(kinds(rows))].join('/')}; wheel ${wheel.length}`);
  }
  // No file span of their own: where every bundled file is out, the points still
  // compute — from the same planetary positions the planets do.
  for (const [when, jd] of [['1499-06-01', J(1499, 6, 1)], ['2103-01-01', J(2103, 1, 1)]] as Array<[string, number]>) {
    const { rows, wheel } = rowsAndWheel(pref, ready, { ...base, jd });
    const k = kinds(rows);
    check(`9f ${when}, outside every asteroid file: every point still reads shown and is on the wheel`,
      all(k, 'shown') && wheel.length === HYP_KEYS.length, `${[...new Set(k)].join('/')}; wheel ${wheel.length}`);
  }
}

// ── 10. Class tags, search and the list's keys (IDENTITY, then TWO PARTS) ─────
// The short word beside a name in the window's lists (lib/minorBodies/classTags.ts), the
// aliases search reads, and the key test every writer of the reader's list applies.
//   10a IDENTITY   the tag rule against a fixed table: every JPL class code, the IAU's
//                  dwarf planets whatever their code, Pluto never, no code no guess.
//   10b TWO PARTS  the tag each Featured row shows (its `cls` through the rule, or a
//                  point's own group) against the heading it sits under (its group, filed
//                  by hand) — §1 holds the group to the class; this holds what the reader
//                  sees to both. Then the source's answers, by name.
//   10c IDENTITY   search: the older spelling "Hygeia" finds 10 Hygiea, as Hygiea, and
//                  "White Moon" finds Selena (hyp), as Selena — each ranked as a name. And
//                  the fold: a name is found however its marks are typed (apostrophes, the
//                  click letters, accents), and nothing that matched before stops matching.
//   10d IDENTITY   the list's keys (A4): no built-in's number can stand on it.
{
  // 10a — the rule. 5000 stands for any numbered body that isn't a dwarf planet.
  const BY_CODE: Array<[string[], MinorClassTag]> = [
    [['TNO'], 'tno'],
    [['CEN'], 'centaur'],
    [['MBA', 'IMB', 'OMB'], 'mainBelt'],
    [['APO', 'ATE', 'AMO', 'IEO'], 'nearEarth'],
    [['TJN'], 'trojan'],
    [['MCA'], 'marsCrosser'],
    [['AST', 'PAA', 'HYA'], 'other'],
  ];
  for (const [codes, tag] of BY_CODE) {
    const got = codes.map((c) => minorClassTag(5000, c));
    check(`10a class ${codes.join(', ')} → ${tag}`, got.every((g) => g === tag), got.join(', '));
  }
  const DWARFS = [1, 136_199, 136_108, 136_472];
  check('10a Ceres, Eris, Haumea and Makemake are "dwarf" whatever their class — TNO, MBA or none — and are the only four',
    DWARFS.every((n) => ['TNO', 'MBA', null].every((c) => minorClassTag(n, c) === 'dwarf')) &&
      DWARF_PLANET_NUMBERS.size === DWARFS.length && DWARFS.every((n) => DWARF_PLANET_NUMBERS.has(n)));
  check('10a Pluto (134340) is never tagged — not as a TNO, not with no class, not as a built-in\'s pointer',
    minorClassTag(134_340, 'TNO') === null && minorClassTag(134_340, null) === null && builtinClassTag(134_340) === null);
  check('10a no class, no tag: 433 with a null, undefined or empty code is null, never a guess',
    [null, undefined, ''].every((c) => minorClassTag(433, c) === null));
  const builtins = [1, 2, 3, 4, 2060].map((n) => builtinClassTag(n));
  check('10a the built-ins\' pointers: Ceres dwarf; Pallas, Juno, Vesta main-belt; Chiron centaur',
    builtins.join() === 'dwarf,mainBelt,mainBelt,mainBelt,centaur', builtins.join(', '));
  const unlabelled = MINOR_CLASS_TAGS.filter((tag) => !resolvePath(en as unknown as Messages, `minorBodies.tags.${tag}`)?.trim());
  check(`10a every tag (${MINOR_CLASS_TAGS.length}) has a label`, unlabelled.length === 0, unlabelled.join(', '));

  // 10b — what a row shows, against where it sits.
  const TAGS_OF_GROUP: Record<string, MinorClassTag[]> = {
    dwarf: ['dwarf', 'tno'],
    centaur: ['centaur'],
    mainBelt: ['mainBelt'],
    nearEarth: ['nearEarth'],
    uranian: ['uranian'],
    otherHyp: ['otherHyp'],
  };
  const tagOf = (n: number) => bundledSource.classTag?.(n) ?? null;
  const astray = BUNDLED_SET.filter((b) => {
    const tag = tagOf(b.n);
    return tag === null || !(TAGS_OF_GROUP[b.group] ?? []).includes(tag);
  });
  const tally = MINOR_CLASS_TAGS.map((tag) => `${tag} ${BUNDLED_SET.filter((b) => tagOf(b.n) === tag).length}`)
    .filter((s) => !s.endsWith(' 0')).join(', ');
  check(`10b every Featured row's tag fits the heading it sits under — ${BUNDLED_MINOR_BODIES.length} bodies and ${HYPOTHETICAL_POINTS.length} points`,
    astray.length === 0 && BUNDLED_SET.length === BUNDLED_MINOR_BODIES.length + HYPOTHETICAL_POINTS.length,
    astray.length ? astray.map((b) => `${b.n} ${b.name} under ${b.group} tagged ${tagOf(b.n)}`).join('; ') : tally);
  const NAMED: Array<[number, string, MinorClassTag]> = [
    [136_199, 'Eris', 'dwarf'],
    [944, 'Hidalgo', 'centaur'],
    [10, 'Hygiea', 'mainBelt'],
    [1862, 'Apollo', 'nearEarth'],
    [-42, 'Zeus', 'uranian'],
    [-48, 'TransPluto', 'otherHyp'],
  ];
  check('10b the bundled source tags Eris a dwarf planet, Hidalgo a centaur, Hygiea main-belt, Apollo near-Earth; the points Zeus Uranian, TransPluto other hypothetical',
    NAMED.every(([n, name, tag]) => bundledMinorBody(n)?.name === name && tagOf(n) === tag),
    NAMED.map(([n]) => `${bundledMinorBody(n)?.name ?? n} ${tagOf(n)}`).join(', '));
  check('10b … and nothing for a key it doesn\'t carry: 5731 (a catalog body), −49 (a newer build\'s point), 134340 Pluto',
    [5731, -49, 134_340].every((n) => tagOf(n) === null));

  // 10c — the aliases: found by one, shown by the body's own name, and no second entry.
  const hits = async (q: string) => (await bundledSource.search(q, { limit: 100 })).map((h) => `${h.n} ${h.name}`).join('; ');
  const direct = (q: string) => bundledSearch(q).map((h) => `${h.n} ${h.name}`).join('; ');
  const [older, lower, official] = await Promise.all(['Hygeia', 'hygeia', 'Hygiea'].map(hits));
  check('10c "Hygeia" and "hygeia" find 10 Hygiea alone, by its official name — exactly what "Hygiea" finds, in the window\'s direct search too',
    older === '10 Hygiea' && lower === older && official === older && direct('Hygeia') === older,
    `Hygeia [${older}], hygeia [${lower}], Hygiea [${official}]`);
  const [whiteMoon, whiteMoonLower, white, selenaHits] = await Promise.all(['White Moon', 'white moon', 'white', 'Selena'].map(hits));
  check('10c "White Moon", "white moon" and "white" find Selena alone, as Selena — exactly what "Selena" finds, in the window\'s direct search too',
    whiteMoon === '-56 Selena' && whiteMoonLower === whiteMoon && white === whiteMoon && selenaHits === whiteMoon &&
      direct('White Moon') === whiteMoon && direct('white') === whiteMoon,
    `White Moon [${whiteMoon}], white moon [${whiteMoonLower}], white [${white}], Selena [${selenaHits}]`);
  // The same ranks a name takes (rankMinorMatch): exact 2, prefix 3, substring 4. So an
  // alias sorts among a catalog scope's hits exactly as the name it stands for would.
  const ranks = rankBundledMatch;
  check('10c each alias ranks as a name: "Hygeia" and "White Moon" exact (2), "Hyge" and "white" a prefix (3), "ygei" and "te mo" a substring (4)',
    ranks('Hygeia', 10, 'Hygiea') === 2 && ranks('White Moon', -56, 'Selena') === 2 &&
      ranks('Hyge', 10, 'Hygiea') === 3 && ranks('white', -56, 'Selena') === 3 &&
      ranks('ygei', 10, 'Hygiea') === 4 && ranks('te mo', -56, 'Selena') === 4,
    `White Moon ${ranks('White Moon', -56, 'Selena')}, white ${ranks('white', -56, 'Selena')}, moon ${ranks('moon', -56, 'Selena')}`);
  check('10c an alias is its body\'s alone: "White Moon" ranks no other key (580 Selene, 56), and "Selene" ranks the asteroid 580 by its own name',
    ranks('White Moon', 580, 'Selene') === null && ranks('White Moon', 56, 'Selena') === null &&
      ranks('Selene', 580, 'Selene') === 2 && ranks('Hygeia', 399, 'Persephone') === null);
  const tens = BUNDLED_SET.filter((b) => b.n === 10);
  const selenas = BUNDLED_SET.filter((b) => b.n === -56);
  check('10c the aliases add no entry: one body keyed 10, named Hygiea, one keyed −56, named Selena, and none named Hygeia or White Moon',
    tens.length === 1 && tens[0].name === 'Hygiea' && selenas.length === 1 && selenas[0].name === 'Selena' &&
      !BUNDLED_SET.some((b) => ['hygeia', 'white moon'].includes(b.name.toLowerCase())));

  // 10c — the fold (foldMinorName). A name is found however its marks are typed: accents,
  // an apostrophe of any kind or none, the click letters or the | = ! plain text writes them
  // with, and a plain letter for one that has no separable accent. The names are real ones,
  // in the letters the Minor Planet Center gives them; 5000 stands for any number.
  const TYPED: Array<[string, string[]]> = [
    ['Kaʻepaokaʻāwela', ['Kaepaokaawela', "Ka'epaoka'awela", 'Ka`epaoka`awela', 'Ka’epaoka’awela', 'kaʻepaokaʻāwela']],
    ['ǂKá̦gára', ['kagara', '|=Kagara', '=Kagara', 'ǂKagara']],
    ['Gǃkúnǁʼhòmdímà', ["G!kun||'homdima", 'gkunhomdima', 'Gǃkúnǁʼhòmdímà']],
    ['Ó Briain', ['O Briain', 'o briain', 'ó briain']],
    ['Prokofʹev', ["Prokof'ev", 'prokofev']],
    ['Søren', ['Soren']],
    ['Michałowski', ['Michalowski']],
    ['Yücelkılıç', ['Yucelkilic', 'YUCELKILIC']],
    ['Reißfelder', ['Reissfelder']],
    ["O'Higgins", ['ohiggins', 'O’Higgins', 'O`Higgins']],
  ];
  const unfound = TYPED.flatMap(([name, typed]) => typed.filter((q) => rankMinorMatch(q, 5000, name) !== 2).map((q) => `"${q}" for ${name}`));
  check(`10c the fold finds a name exactly however its marks are typed — ${TYPED.reduce((k, t) => k + t[1].length, 0)} spellings of ${TYPED.length} names: "Kaepaokaawela" and "Ka'epaoka'awela" are Kaʻepaokaʻāwela, "kagara" is ǂKá̦gára, "O Briain" is Ó Briain`,
    unfound.length === 0, unfound.join('; '));
  const marksOnly = ["'", '’', '‘', '`', 'ʻ', 'ʼ', 'ǀ', 'ǁ', 'ǂ', 'ǃ', '|=', '!'];
  check('10c what is typed with nothing but those marks in it folds to nothing and finds nothing',
    marksOnly.every((q) => foldMinorName(q) === '' && rankMinorMatch(q, 3192, "A'Hearn") === null),
    marksOnly.filter((q) => foldMinorName(q) !== '').join(' '));
  // Nothing that matched before stops matching. The fold before it dropped those marks —
  // accents and case only — restated, over every name here and every piece of one a reader
  // could type: each match it made is still a match, ranked no worse.
  const foldBefore = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const rankBefore = (q: string, name: string) => {
    const fq = foldBefore(q.trim());
    const fn = foldBefore(name);
    return !fq ? null : fn === fq ? 2 : fn.startsWith(fq) ? 3 : fn.includes(fq) ? 4 : null;
  };
  const foldNames = [...BUNDLED_SET.map((b) => b.name), ...TYPED.map(([name]) => name), "A'Hearn", 'Wilson-Harrington', 'Mr. Spock', "van 't Hoff"];
  const pieces = new Set<string>();
  for (const name of foldNames) {
    for (let i = 0; i < name.length; i++) for (let j = i + 1; j <= Math.min(name.length, i + 4); j++) pieces.add(name.slice(i, j));
    for (let j = 5; j <= name.length; j++) pieces.add(name.slice(0, j));
  }
  let matchesBefore = 0;
  const lostMatches: string[] = [];
  for (const q of pieces) {
    if (!foldMinorName(q.trim())) continue; // marks alone: the check above
    for (const name of foldNames) {
      const before = rankBefore(q, name);
      if (before === null) continue;
      matchesBefore++;
      const now = rankMinorMatch(q, 5000, name);
      if (now === null || now > before) lostMatches.push(`"${q}" in ${name}: ${before} → ${now}`);
    }
  }
  check(`10c nothing that matched before the fold dropped those marks stops matching, or ranks worse — ${matchesBefore} matches of ${pieces.size} typed pieces against ${foldNames.length} names`,
    matchesBefore > 1000 && lostMatches.length === 0, lostMatches.slice(0, 5).join('; '));

  // 10d — the list's keys. Its one writer, useMinorBodies' toggle, refuses a built-in's
  // number (BUILTIN_ALIAS) and any other non-key (isListKey); its loader (prefs.ts) drops
  // the same on read. The toggle is a React hook and isn't reached here — the test both
  // apply is, and so is the loader.
  check('10d no built-in\'s number is a list key: 1–4, 2060 and 134340 each fail isListKey, the test the list\'s writer refuses on and its loader drops on',
    BUILTIN_ALIAS.size === 6 && [...BUILTIN_ALIAS.keys()].every((n) => !isListKey(n)),
    [...BUILTIN_ALIAS.keys()].filter((n) => isListKey(n)).join(', '));
  const store = new Map<string, string>();
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  try {
    const stored = [1, 2, 3, 4, 2060, 134_340, 433, -42];
    store.set(MINOR_PREF_KEY, JSON.stringify({
      shown: true,
      list: stored.map((n) => ({ n, name: BUILTIN_ALIAS.get(n) ?? bundledMinorBody(n)?.name ?? '', source: BUNDLED_SOURCE_ID })),
      visible: stored,
    }));
    const pref = loadMinorBodiesPref();
    check('10d a stored list naming all six built-ins loads without them: 433 and the point −42 kept, on the list and switched on',
      pref.list.map((e) => e.n).join() === '433,-42' && pref.visible.join() === '433,-42',
      `list [${pref.list.map((e) => e.n)}], visible [${pref.visible}]`);
  } finally {
    if (prior) Object.defineProperty(globalThis, 'localStorage', prior);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

// ── 11. The hollow designator and its font (TWO PARTS, with IDENTITY pins) ────
// A hypothetical point's mark is the diamond HOLLOW; a body with a symbol keeps its
// symbol; every other body keeps the solid diamond. Three surfaces decide that, each on
// its own: the map's sprite (glyphImages minorIconId), the wheel (buildWheelMinor's
// `hypothetical` and `glyph`), and the hover tip and line card (lineCard minorMarkHtml).
//   11a TWO PARTS  the three agree, body by body — with the sprite ids and the tip's
//                  characters pinned (IDENTITY).
//   11b IDENTITY   the hollow outline IS the solid diamond, corner for corner, and the
//                  hole winds the other way, so a nonzero fill leaves it empty.
//   11c TWO PARTS  the font: what glyphChars.ts draws, what subset-font.sh asks for and
//                  the tip's two marks as minorMarkHtml writes them, against the character
//                  map of the subset the app actually loads (index.css). The subsetter
//                  drops a code point its source lacks without a word; nothing else would.
{
  // 11a — map, wheel, tip.
  const BODIES = [...HYP_KEYS, 433, 944, 5731, ...MINOR_GLYPHS.keys()];
  const decor = (n: number): MinorDecor => ({ name: hypotheticalPoint(n)?.name ?? `#${n}`, color: '#123456', icon: minorIconId(n) });
  const wheel = buildWheelMinor(
    BODIES.map((n, i) => ({ n, ra: i / 10, dec: 0, lon: i / 10, lat: 0, speed: 0.01 })),
    { ayan: 0, decor, t, list: BODIES.map((n) => ({ n })) },
  );
  const tipHtml = (n: number) => minorMarkHtml({ number: n, body: minorId(n), color: '#123456' }, 'cross-tip-glyph');
  const onMap = (n: number) => {
    const id = minorIconId(n);
    return id.startsWith('minor-hcoin-') ? 'hollow' : id.startsWith('minor-coin-') ? 'solid' : id.startsWith('minor-glyph-') ? 'glyph' : id;
  };
  const onWheel = (n: number) => {
    const w = wheel.find((x) => x.n === n);
    return !w ? 'absent' : w.hypothetical ? (w.glyph ? 'hollow and glyph' : 'hollow') : w.glyph ? 'glyph' : 'solid';
  };
  const inTip = (n: number) => {
    const html = tipHtml(n);
    return html.includes('is-hollow') ? 'hollow' : html.includes('minor-mark') ? 'solid' : 'glyph';
  };
  const want = (n: number) => (isHypotheticalKey(n) ? 'hollow' : MINOR_GLYPHS.has(n) ? 'glyph' : 'solid');
  const disagree = BODIES.filter((n) => onMap(n) !== want(n) || onWheel(n) !== want(n) || inTip(n) !== want(n));
  check(`11a map sprite, wheel and tip agree body by body: hollow for the ten points (the wheel's \`hypothetical\` on them alone), the symbol for the ${MINOR_GLYPHS.size} symbol bodies, solid for 433, 944 and 5731 Zeus`,
    disagree.length === 0 && wheel.length === BODIES.length && wheel.every((w) => w.hypothetical === isHypotheticalKey(w.n)),
    disagree.map((n) => `${n}: map ${onMap(n)}, wheel ${onWheel(n)}, tip ${inTip(n)}`).join('; '));
  check('11a sprites: minorIconId(−42) is "minor-hcoin-<its slot>", every point in its table slot; 433 and 5731 Zeus "minor-coin-<slot>"; a symbol body "minor-glyph-<n>"',
    minorIconId(-42) === `minor-hcoin-${hypByName('Zeus').slot}` &&
      HYPOTHETICAL_POINTS.every((p) => minorIconId(p.n) === `minor-hcoin-${p.slot}`) &&
      minorIconId(433) === `minor-coin-${minorPaletteSlot(433)}` && minorIconId(5731) === `minor-coin-${minorPaletteSlot(5731)}` &&
      [...MINOR_GLYPHS.keys()].every((n) => minorIconId(n) === `minor-glyph-${n}`),
    `${minorIconId(-42)}, ${minorIconId(433)}, ${minorIconId(5731)}, ${minorIconId(136_199)}`);
  const text = (html: string) => html.replace(/<[^>]*>/g, '');
  const U = (c: number) => `U+${c.toString(16).toUpperCase().padStart(4, '0')}`;
  const hex = (s: string) => [...s].map((c) => U(c.codePointAt(0)!)).join(' ');
  const [pointTip, plainTip, symbolTip] = [-42, 433, 136_199].map(tipHtml);
  check('11a tip: a point reads U+25C7 (white diamond) with "is-hollow" — by its number or its id alone; a plain body U+25C6 (black diamond), not hollow; Eris its own symbol, no diamond',
    text(pointTip) === '◇︎' && pointTip.includes('minor-mark is-hollow') &&
      text(minorMarkHtml({ body: 'hyp:42', color: '#abc' }, 'line-card-glyph')) === '◇︎' &&
      text(plainTip) === '◆︎' && plainTip.includes('minor-mark') && !plainTip.includes('is-hollow') &&
      text(symbolTip) === MINOR_GLYPHS.get(136_199) && !symbolTip.includes('minor-mark'),
    `${hex(text(pointTip))} / ${hex(text(plainTip))} / ${hex(text(symbolTip))}`);

  // 11b — the outline: upright as a coin draws it, and turned as a rim mark does.
  const same = (a: [number, number][], b: [number, number][]) =>
    a.length === 4 && b.length === 4 && a.every((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1]) < 1e-12);
  const area = (p: [number, number][]) =>
    p.reduce((s, a, i) => s + a[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * a[1], 0) / 2;
  const shapes = [
    { hollow: minorHollowPoints(0, 0, 10), solid: minorDiamondPoints(0, 0, 10) },
    { hollow: minorHollowPoints(5, 7, 4, Math.cos(1.1), Math.sin(1.1)), solid: minorDiamondPoints(5, 7, 4, Math.cos(1.1), Math.sin(1.1)) },
  ];
  check('11b the hollow diamond\'s outline is the solid diamond, corner for corner — upright and turned — and its hole winds the other way',
    shapes.every(({ hollow, solid }) => same(hollow.outer, solid) && area(hollow.inner) !== 0 &&
      Math.sign(area(hollow.inner)) === -Math.sign(area(hollow.outer))),
    shapes.map(({ hollow }) => `outline ${area(hollow.outer).toFixed(2)}, hole ${area(hollow.inner).toFixed(2)}`).join('; '));

  // 11c — the font. WOFF2 (W3C WOFF 2.0 §4–5): a 48-byte header, a table directory whose
  // lengths are UIntBase128, then ONE brotli stream carrying every table back to back,
  // unpadded, in directory order. Only glyf, loca and hmtx are ever transformed, so cmap
  // and maxp come straight off that stream. (Read identically to fontTools on nine fonts
  // — TrueType and CFF, each transform on and off — 2026-09-29.)
  const woff2Tables = (bytes: Buffer) => {
    if (bytes.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not WOFF2');
    if (bytes.readUInt32BE(4) === 0x74746366) throw new Error('a font collection');
    let p = 48;
    const base128 = () => {
      let v = 0;
      for (let i = 0; i < 5; i++) {
        const b = bytes[p++];
        if (i === 0 && b === 0x80) throw new Error('UIntBase128 with a leading zero');
        v = v * 128 + (b & 0x7f);
        if (!(b & 0x80)) return v;
      }
      throw new Error('UIntBase128 over five bytes');
    };
    // A known table is named by its index in the spec's list (0 cmap, 4 maxp, 10 glyf,
    // 11 loca); any other (63) spells its tag out.
    const found = new Map<number | string, { offset: number; length: number; plain: boolean }>();
    let offset = 0;
    for (let i = 0, n = bytes.readUInt16BE(12); i < n; i++) {
      const flags = bytes[p++];
      const index = flags & 0x3f;
      const version = flags >> 6;
      let key: number | string = index;
      if (index === 63) {
        key = bytes.toString('latin1', p, p + 4);
        p += 4;
      }
      const origLength = base128();
      // glyf and loca are transformed at version 0 (3 is none); any other table at any
      // version but 0. A transformed table's stream length follows.
      const plain = index === 10 || index === 11 ? version === 3 : version === 0;
      const length = plain ? origLength : base128();
      found.set(key, { offset, length, plain });
      offset += length;
    }
    const stream = brotliDecompressSync(bytes.subarray(p, p + bytes.readUInt32BE(20)));
    if (stream.length !== offset) throw new Error(`stream ${stream.length} bytes, directory ${offset}`);
    return (index: number, tag: string) => {
      const e = found.get(index) ?? found.get(tag);
      if (!e?.plain) throw new Error(`no untransformed ${tag}`);
      return stream.subarray(e.offset, e.offset + e.length);
    };
  };
  // Code point → glyph, from every format 4 (BMP) and format 12 (full range) subtable.
  const cmapOf = (cmap: Buffer) => {
    const map = new Map<number, number>();
    for (let i = 0; i < cmap.readUInt16BE(2); i++) {
      const sub = cmap.readUInt32BE(8 + i * 8);
      const format = cmap.readUInt16BE(sub);
      if (format === 4) {
        const seg2 = cmap.readUInt16BE(sub + 6);
        const ends = sub + 14;
        const starts = ends + seg2 + 2;
        const deltas = starts + seg2;
        const ranges = deltas + seg2;
        for (let s = 0; s < seg2; s += 2) {
          const start = cmap.readUInt16BE(starts + s);
          const delta = cmap.readUInt16BE(deltas + s);
          const range = cmap.readUInt16BE(ranges + s);
          for (let c = start; c <= cmap.readUInt16BE(ends + s); c++) {
            const raw = range === 0 ? c : cmap.readUInt16BE(ranges + s + range + (c - start) * 2);
            const g = range !== 0 && raw === 0 ? 0 : (raw + delta) & 0xffff;
            if (g) map.set(c, g);
          }
        }
      } else if (format === 12) {
        for (let k = 0; k < cmap.readUInt32BE(sub + 12); k++) {
          const group = sub + 16 + k * 12;
          const start = cmap.readUInt32BE(group);
          const end = cmap.readUInt32BE(group + 4);
          for (let c = start; c <= end; c++) map.set(c, cmap.readUInt32BE(group + 8) + c - start);
        }
      }
    }
    return map;
  };

  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
  const fontPath = /@font-face\s*\{[^}]*font-family:\s*'Noto Sans Symbols'[^}]*src:\s*url\('\.\/([^']+\.woff2)'\)/.exec(css)?.[1];
  let cmap = new Map<number, number>();
  let numGlyphs = 0;
  let error = fontPath ? '' : 'index.css names no woff2 for Noto Sans Symbols';
  if (fontPath) {
    try {
      const table = woff2Tables(readFileSync(resolve(process.cwd(), 'src', fontPath)));
      numGlyphs = table(4, 'maxp').readUInt16BE(4);
      cmap = cmapOf(table(0, 'cmap'));
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
  const has = (c: number) => (cmap.get(c) ?? 0) > 0 && (cmap.get(c) ?? 0) < numGlyphs;
  check(`11c the glyph font the app loads (src/${fontPath}) reads as WOFF2: ${cmap.size} code points, into ${numGlyphs} glyphs`,
    !error && cmap.size > 0, error);
  const cps = (s: string) => [...s].map((c) => c.codePointAt(0)!).filter((c) => c !== 0xfe0e);
  const DRAWN: Array<[string, string[]]> = [
    ['PLANET_GLYPHS', Object.values(PLANET_GLYPHS)],
    ['MINOR_GLYPHS', [...MINOR_GLYPHS.values()]],
    ['SIGN_GLYPHS', SIGN_GLYPHS],
    ['ASPECT_GLYPHS', Object.values(ASPECT_GLYPHS)],
    ['ELEMENT_GLYPHS', Object.values(ELEMENT_GLYPHS)],
    ['MODALITY_GLYPHS', Object.values(MODALITY_GLYPHS)],
  ];
  const drawn = new Set(DRAWN.flatMap(([, glyphs]) => glyphs.flatMap(cps)));
  const undrawable = DRAWN.flatMap(([name, glyphs]) => glyphs.flatMap(cps).filter((c) => !has(c)).map((c) => `${name} ${U(c)}`));
  check(`11c every symbol glyphChars.ts draws is in it — ${drawn.size} code points across its six tables`,
    !error && undrawable.length === 0, undrawable.join(', '));
  // What subset-font.sh asks each source font for, U+FE0E aside (listed there for the
  // record only; no font carries it). Noto Sans Symbols 2's list holds both diamonds.
  const script = readFileSync(resolve(process.cwd(), 'scripts/subset-font.sh'), 'utf8');
  const asked = ['SYM_UNICODES', 'SYM2_UNICODES', 'MATH_UNICODES'].map((name) => {
    const list = new RegExp(`^${name}="([^"]+)"`, 'm').exec(script)?.[1] ?? '';
    const codes = list.split(',').filter(Boolean).flatMap((r) => {
      const [a, b = a] = r.split('-').map((h) => parseInt(h, 16));
      return Array.from({ length: b - a + 1 }, (_, i) => a + i);
    });
    return { name, codes: codes.filter((c) => c !== 0xfe0e) };
  });
  const sym2 = asked.find((a) => a.name === 'SYM2_UNICODES')?.codes ?? [];
  const dropped = asked.flatMap(({ name, codes }) => codes.filter((c) => !has(c)).map((c) => `${name} ${U(c)}`));
  check(`11c every code point subset-font.sh asks for is in it, none dropped by the subsetter — ${asked.map(({ name, codes }) => `${name} ${codes.length}`).join(', ')}`,
    !error && asked.every(({ codes }) => codes.length > 0) && sym2.includes(0x25c6) && sym2.includes(0x25c7) && dropped.length === 0,
    dropped.join(', '));
  const marks = [-42, 433].map((n) => cps(text(tipHtml(n))));
  check('11c … and so are the tip\'s two marks as minorMarkHtml writes them: U+25C7 for a point, U+25C6 for a plain body',
    marks[0].join() === String(0x25c7) && marks[1].join() === String(0x25c6) && marks.flat().every(has),
    marks.map((m) => m.map(U).join(' ')).join(' / '));
}

// ── 12. Beside an overlay, and on a composite (TWO PARTS, then IDENTITY) ──────
// The reader's list placed by an overlay's own rule (timeline.ts overlayMinorSamples,
// overlayMinorLines, buildOverlayMinorLines) and as a composite's midpoints (composite.ts
// compositeMinorSamples): the planets' pipeline, followed by a second family of bodies.
//   12a TWO PARTS  MPC 1 through the catalog path against Ceres through the planets' —
//                  the engine answers body 10001 with Ceres itself, bit for bit (checked
//                  first) — for every overlay mode and method, In Mundo, In Zodiaco and on
//                  a geodetic map: the sample against the layer's Ceres (ra, dec, speed),
//                  the line position against the overlay's (ra, dec, lon of record), and
//                  the drawn MC/IC/ASC/DSC and zenith against generateLines and
//                  generateZenithStamps in the layer's own frame, built as App's overlay
//                  memo builds it (meridianLngFor at obliquity(layer.jd), layer.gmst).
//                  Exact: one engine, one arithmetic. With IDENTITY pins on the features:
//                  the overlay's tag, and the body's own label (tagMinor, never tagLabels,
//                  whose label-for-tag swap would give every catalog line one hover id).
//   12b TWO PARTS  against the engine: an overlay's catalog MC is the engine's RA at the
//                  layer's body instant less the ARMC at its frame instant, the zenith at
//                  the engine's declination, ASC/DSC on the horizon (§3d's pattern).
//   12c TWO PARTS  a directed catalog body moves by the directed Sun's own Δλ (in
//                  longitude) or ΔRA (in RA), read off the planets' layer, and keeps its
//                  ecliptic latitude or its declination; no directed body has a speed.
//   12d TWO PARTS  compositeMinorSamples([1]) is compositeEquatorial's Ceres row in all
//                  four coordinates; a body one parent's date is outside drops out of both.
//   12e IDENTITY   the rows' overlay side, on fixtures (status.ts): present only while an
//                  overlay's lines are passed, only on the statuses that leave it open,
//                  kept through the natal draw gate, counted by minorRowHasLines — and
//                  when App passes them, through minorChartContext, the one fold App calls:
//                  not when promoted (the overlay's set is then the chart's), not with the
//                  overlay's lines off the map (eclipse map lines), not under the Angles
//                  filter; no birth time gates nothing a promoted overlay draws.
//   12f TWO PARTS  the overlay's wheel set (buildWheelMinor over its own samples) against
//                  its planets' ring (toEclipticPositions, as App's displayOverlayEcliptic):
//                  MPC 1 on Ceres's degree under every overlay and zodiac, shifted by the
//                  overlay's own ayanamsa, with a speed exactly when the planet has one.
//   12g MEASURED   the catalog set's share of a playback tick (sample + geometry), at the
//                  20-body cap and with the ten hypothetical points — the figures App's
//                  decision not to defer the catalog set during playback rests on.
// Every check counts what it compared and fails on none.
{
  const FOUR: readonly LineType[] = ['MC', 'IC', 'ASC', 'DSC'];
  const ALL_FOUR = new Set<LineType>(FOUR);
  const chartAt = (name: string, year: number, month: number, day: number, hour: number, minute: number, lat: number, lng: number): StoredChart => ({
    id: `verify-${name}`, createdAt: 0, name, year, month, day, hour, minute, tzOffset: 0, birthplace: { label: name, lat, lng },
  });
  const NATAL = chartAt('natal', 1975, 4, 12, 14, 20, 40.7128, -74.006);
  const PARTNER = chartAt('partner', 1978, 11, 3, 6, 45, 48.8566, 2.3522);
  // A composite partner's own moment is solved from its parents (solveCompositeFrameJd);
  // the stored fields are never read for its bodies.
  const COMPOSITE_PARTNER: StoredChart = { ...chartAt('composite partner', 1988, 1, 1, 12, 0, 44.6, -36), composite: COMPOSITE };
  const TARGET = Date.UTC(2026, 9, 5, 12, 0);
  const natalJd = birthDataToJD(NATAL);
  interface OverlayCase { label: string; mode: OverlayKind; partner?: StoredChart; ap?: AngleProgression; rate?: PrimaryRate; tf?: TransitFrame }
  const CASES: OverlayCase[] = [
    { label: 'transits, natal frame', mode: 'transits' },
    { label: 'transits, the moment\'s frame', mode: 'transits', tf: 'transit-moment' },
    { label: 'eclipses', mode: 'eclipses' },
    { label: 'secondary progressed, natal angles', mode: 'progressed' },
    { label: 'secondary progressed, SA in longitude', mode: 'progressed', ap: 'sa-long' },
    { label: 'tertiary progressed, Naibod in RA', mode: 'tertiary-progressed', ap: 'naibod-ra' },
    { label: 'solar arc in longitude', mode: 'solar-arc', ap: 'sa-long' },
    { label: 'solar arc in RA', mode: 'solar-arc', ap: 'sa-ra' },
    { label: 'Naibod in longitude', mode: 'solar-arc', ap: 'naibod-long' },
    { label: 'Naibod in RA', mode: 'solar-arc', ap: 'naibod-ra' },
    { label: 'primary directions, Ptolemy', mode: 'primary-directions' },
    { label: 'primary directions, true arc in RA', mode: 'primary-directions', rate: 'placidus-ra' },
    { label: 'Cyclo', mode: 'cyclo' },
    { label: 'synastry', mode: 'synastry', partner: PARTNER },
    { label: 'synastry, a composite partner', mode: 'synastry', partner: COMPOSITE_PARTNER },
  ];
  const FRAMES: Array<[string, LineSystem, CoordSystem]> = [
    ['In Mundo', 'celestial', 'mundo'],
    ['In Zodiaco', 'celestial', 'zodiaco'],
    ['geodetic', 'geodetic', 'mundo'],
  ];
  const layerOf = (c: OverlayCase) =>
    buildOverlay(NATAL, c.mode, TARGET, c.partner ?? null, 'mean', c.ap ?? 'mean-quotidian', c.rate ?? 'ptolemy', 1,
      c.tf ?? 'relative-to-natal', 'secondary', t);
  const natalOf = (ns: readonly number[]) => ({ jd: natalJd, samples: getMinorSamples(natalJd, ns, true) });
  const decor = decorFor('dark');
  const mundo = { lineSystem: 'celestial' as const, coordSystem: 'mundo' as const, visibleLineTypes: ALL_FOUR, zenith: true, decor };
  const wrapPi = (a: number) => {
    let x = a % (2 * Math.PI);
    if (x > Math.PI) x -= 2 * Math.PI;
    if (x <= -Math.PI) x += 2 * Math.PI;
    return x;
  };
  const engineId = (n: number) => SEAS_MINOR_ID.get(n) ?? MINOR_ID_OFFSET + n;

  // 12a — the premise: wherever a layer reads its bodies, MPC 1 is Ceres to the last bit.
  const layers = CASES.map((c) => [c, layerOf(c)] as const);
  const premiseJds = new Set<number>([natalJd, birthDataToJD(COMPOSITE.a), birthDataToJD(COMPOSITE.b)]);
  for (const [, layer] of layers) if (layer?.bodyRule.by === 'sample') premiseJds.add(layer.bodyRule.jd);
  const premiseOff = [...premiseJds].filter((jd) => {
    const m = sampleMinorBody(jd, 1);
    const c = sampleBody(jd, 'Ceres', 'mean');
    return !m || !c || m.ra !== c.ra || m.dec !== c.dec || m.lon !== c.lon || m.lat !== c.lat || m.speed !== c.speed;
  });
  check(`12a premise: the engine's body 10001 is Ceres, bit for bit, at all ${premiseJds.size} instants the layers read`,
    premiseJds.size > 0 && premiseOff.length === 0, premiseOff.map((jd) => `JD ${jd}`).join(', '));

  {
    let compared = 0;
    let pinned = 0;
    let firstBad = '';
    let firstPin = '';
    for (const [c, layer] of layers) {
      if (!layer) {
        firstBad ||= `${c.label}: no layer`;
        continue;
      }
      const natal = natalOf([1]);
      const ceresLayer = layer.positions.find((p) => p.name === 'Ceres');
      const tag = c.mode === 'cyclo' ? 'Tr' : OVERLAY_LABEL_PREFIX[c.mode];
      for (const [fname, lineSystem, coordSystem] of FRAMES) {
        const where = `${c.label}, ${fname}`;
        const got = buildOverlayMinorLines(layer, [1], natal, { lineSystem, coordSystem, visibleLineTypes: ALL_FOUR, zenith: true, decor });
        // The planets' path, exactly as App's overlay memo runs it.
        const ovPositions = lineSystem === 'geodetic' || coordSystem === 'zodiaco'
          ? projectOntoEcliptic(layer.positions, layer.jd)
          : layer.positions;
        const ovMeridianLng = meridianLngFor(lineSystem, obliquity(layer.jd), layer.gmst);
        const ceresLine = ovPositions.find((p) => p.name === 'Ceres');
        const pLines = generateLines(ovPositions, ovMeridianLng).features
          .filter((f) => f.properties.planet === 'Ceres' && ALL_FOUR.has(f.properties.lineType));
        const pZen = generateZenithStamps(ovPositions, ovMeridianLng).features.filter((f) => f.properties.planet === 'Ceres');
        const s = got.samples.find((x) => x.n === 1);
        const pos = got.positions.find((x) => x.n === 1);
        const mLines = got.lines.features.filter((f) => f.properties.number === 1);
        const mZen = got.zenith.features.filter((f) => f.properties.number === 1);
        if (!s || !ceresLayer || !pos || !ceresLine) {
          firstBad ||= `${where}: catalog sample ${!!s}, layer's Ceres ${!!ceresLayer}, line positions ${!!pos}/${!!ceresLine}`;
          continue;
        }
        const coords = (fs: Array<{ geometry: { coordinates: unknown } }>) => fs.map((f) => JSON.stringify(f.geometry.coordinates)).join('|');
        const why = [
          s.ra !== ceresLayer.ra || s.dec !== ceresLayer.dec ? 'sample ra/dec' : '',
          s.speed !== ceresLayer.speed ? `speed ${s.speed} vs ${ceresLayer.speed}` : '',
          pos.ra !== ceresLine.ra || pos.dec !== ceresLine.dec || pos.lon !== ceresLine.lon
            ? `line position (lon ${pos.lon} vs ${ceresLine.lon})` : '',
          mLines.length === 0 || mLines.length !== pLines.length ||
            mLines.some((f, i) => f.properties.lineType !== pLines[i].properties.lineType)
            ? `lines ${mLines.map((f) => f.properties.lineType).join('/')} vs ${pLines.map((f) => f.properties.lineType).join('/')}` : '',
          coords(mLines) !== coords(pLines) ? 'line geometry' : '',
          mZen.length !== 1 || pZen.length !== 1 || coords(mZen) !== coords(pZen) ? 'zenith' : '',
        ].filter(Boolean);
        if (why.length) firstBad ||= `${where}: ${why.join(', ')}`;
        else compared += 1;
        for (const f of [...mLines, ...mZen]) {
          const lt = 'lineType' in f.properties ? f.properties.lineType : null;
          const label = 'label' in f.properties ? f.properties.label : null;
          const ownLabel = lt ? `${minorLabelName(1, decor(1).name)} ${LINE_TYPE_LABEL[lt]}` : null;
          if (f.properties.tag !== tag || label !== ownLabel) {
            firstPin ||= `${where}: tag ${f.properties.tag} (want ${tag}), label "${label}" (want "${ownLabel}")`;
          } else pinned += 1;
        }
      }
    }
    const want = CASES.length * FRAMES.length;
    check(`12a MPC 1 through the catalog path = Ceres through the planets': ${CASES.length} overlay modes and methods × ${FRAMES.length} frames — sample, line position, MC/IC/ASC/DSC and zenith identical`,
      !firstBad && compared === want, firstBad || `${compared} of ${want}`);
    check('12a the catalog features carry the overlay\'s tag (Cyclo: the transits\' Tr) and keep the body\'s own label',
      !firstPin && pinned >= want * 5, firstPin || `${pinned} features`);
  }

  // 12b — against the engine, at the frame instants the overlays name. Only the layers
  // whose gmst IS some instant's sidereal time (an advanced RAMC is no instant's): the
  // frame instant is checked to be that before anything is read off it.
  {
    const ns = [1, 5145, ...(pairPresent ? [A, B] : [])];
    const FRAME_AT: Array<[string, (jd: number) => number]> = [
      ['transits, natal frame', () => natalJd],
      ['transits, the moment\'s frame', (jd) => jd],
      ['eclipses', (jd) => jd],
      ['secondary progressed, natal angles', () => natalJd],
      ['Cyclo', () => natalJd],
      ['synastry', (jd) => jd],
    ];
    let compared = 0;
    let firstBad = '';
    const worst = { mc: 0, zen: 0, alt: 0 };
    for (const [label, frameAt] of FRAME_AT) {
      const layer = layers.find(([c]) => c.label === label)?.[1];
      if (!layer || layer.bodyRule.by !== 'sample') {
        firstBad ||= `${label}: no sampled layer`;
        continue;
      }
      const bodyJd = layer.bodyRule.jd;
      const frameJd = frameAt(layer.jd);
      if (gmstRadians(frameJd) !== layer.gmst) {
        firstBad ||= `${label}: the layer's gmst is not the sidereal time of JD ${frameJd}`;
        continue;
      }
      const armc = node.calculateHouses(frameJd, 0, 0, node.HouseSystem.WholeSign).armc as number;
      const got = buildOverlayMinorLines(layer, ns, null, mundo);
      for (const n of ns) {
        const eng = node.calculatePosition(bodyJd, engineId(n), FLAG_EQ);
        const mc = got.lines.features.find((f) => f.properties.number === n && f.properties.lineType === 'MC');
        const ic = got.lines.features.find((f) => f.properties.number === n && f.properties.lineType === 'IC');
        const z = got.zenith.features.find((f) => f.properties.number === n);
        if (!mc || !ic || !z) {
          firstBad ||= `${label} ${n}: MC ${!!mc}, IC ${!!ic}, zenith ${!!z}`;
          continue;
        }
        const mcLng = mc.geometry.coordinates[0][0];
        const [zLng, zLat] = z.geometry.coordinates;
        const dMc = Math.abs(normLng(mcLng - normLng(eng.longitude - armc)));
        const dIc = Math.abs(normLng(ic.geometry.coordinates[0][0] - (mcLng + 180)));
        const dZen = Math.max(Math.abs(zLat - eng.latitude), Math.abs(normLng(zLng - mcLng)));
        const raE = eng.longitude * DEG2RAD;
        const decE = eng.latitude * DEG2RAD;
        let alt = 0;
        for (const f of got.lines.features) {
          if (f.properties.number !== n || (f.properties.lineType !== 'ASC' && f.properties.lineType !== 'DSC')) continue;
          for (const [lng, lat] of f.geometry.coordinates) {
            const theta = (armc + lng) * DEG2RAD;
            const phi = lat * DEG2RAD;
            const dot =
              Math.cos(phi) * Math.cos(theta) * Math.cos(decE) * Math.cos(raE) +
              Math.cos(phi) * Math.sin(theta) * Math.cos(decE) * Math.sin(raE) +
              Math.sin(phi) * Math.sin(decE);
            alt = Math.max(alt, Math.abs(Math.asin(Math.max(-1, Math.min(1, dot)))));
          }
        }
        worst.mc = Math.max(worst.mc, dMc, dIc);
        worst.zen = Math.max(worst.zen, dZen);
        worst.alt = Math.max(worst.alt, alt);
        if (!(dMc < 1e-9 && dIc < 1e-9 && dZen < 1e-9 && alt < 1e-9)) {
          firstBad ||= `${label} ${n}: MC ${dMc.toExponential(2)}°, IC ${dIc.toExponential(2)}°, zenith ${dZen.toExponential(2)}°, |alt| ${alt.toExponential(2)} rad`;
        } else compared += 1;
      }
    }
    const want = FRAME_AT.length * ns.length;
    check(`12b ${FRAME_AT.length} overlays × ${ns.length} bodies (${ns.join(', ')}): the MC is the engine's RA at the body instant less the ARMC at the frame instant, the IC its antipode, the zenith on it at the engine's declination, ASC/DSC on the horizon`,
      !firstBad && compared === want,
      firstBad || `${compared} of ${want}; worst MC ${worst.mc.toExponential(2)}°, zenith ${worst.zen.toExponential(2)}°, |alt| ${worst.alt.toExponential(2)} rad`);
  }

  // 12c — the directed bodies against the directed Sun.
  {
    const ns = [5145, ...presentBodies.slice(0, 4).map((b) => b.n)];
    const natal = natalOf(ns);
    const eps = obliquity(natalJd);
    const sunNatal = getPlanetPositions(natalJd, 'mean').find((p) => p.name === 'Sun');
    const DIRECTED = CASES.filter((c) => c.mode === 'solar-arc' || c.mode === 'primary-directions');
    let compared = 0;
    let firstBad = '';
    let worst = 0;
    for (const c of DIRECTED) {
      const layer = layers.find(([x]) => x === c)?.[1];
      const sunDir = layer?.positions.find((p) => p.name === 'Sun');
      const rule = layer?.bodyRule;
      if (!layer || !sunDir || !sunNatal || !rule || (rule.by !== 'shift-long' && rule.by !== 'shift-ra')) {
        firstBad ||= `${c.label}: no directed layer (rule ${rule?.by})`;
        continue;
      }
      const inLon = rule.by === 'shift-long';
      const dSun = inLon
        ? wrapPi(raDecToEclipticLon(sunDir.ra, sunDir.dec, eps) - raDecToEclipticLon(sunNatal.ra, sunNatal.dec, eps))
        : wrapPi(sunDir.ra - sunNatal.ra);
      const dir = overlayMinorSamples(rule, ns, natal);
      // The fallback: no natal samples in hand, the same answer from a fresh sample.
      const fresh = overlayMinorSamples(rule, ns, null);
      if (JSON.stringify(fresh) !== JSON.stringify(dir)) firstBad ||= `${c.label}: resampled at the base instant ≠ the natal samples directed`;
      if (Math.abs(dSun) < 1e-3) firstBad ||= `${c.label}: the Sun moved only ${dSun} rad — nothing was directed`;
      if (dir.length !== natal.samples.length) firstBad ||= `${c.label}: ${dir.length} directed of ${natal.samples.length}`;
      for (const d of dir) {
        const s = natal.samples.find((x) => x.n === d.n)!;
        const dBody = inLon
          ? wrapPi(raDecToEclipticLon(d.ra, d.dec, eps) - raDecToEclipticLon(s.ra, s.dec, eps))
          : wrapPi(d.ra - s.ra);
        const kept = inLon
          ? Math.abs(raDecToEclipticLat(d.ra, d.dec, eps) - raDecToEclipticLat(s.ra, s.dec, eps))
          : Math.abs(d.dec - s.dec);
        worst = Math.max(worst, Math.abs(dBody - dSun), kept);
        if (!(Math.abs(dBody - dSun) < 1e-11 && kept < 1e-11 && d.speed === undefined && !('speed' in d) && d.ofRecord === false)) {
          firstBad ||= `${c.label} ${d.n}: Δ ${dBody} vs the Sun's ${dSun}, ${inLon ? 'latitude' : 'declination'} moved ${kept}, speed ${d.speed}, ofRecord ${d.ofRecord}`;
        } else compared += 1;
      }
    }
    const want = DIRECTED.length * ns.length;
    check(`12c ${DIRECTED.length} directed overlays × ${ns.length} bodies: each moves by the directed Sun's own Δλ (in longitude) or ΔRA (in RA, primaries' −arc included), keeps its latitude or declination, and has no speed`,
      !firstBad && compared === want && DIRECTED.length === 6, firstBad || `${compared} of ${want}; worst ${worst.toExponential(2)} rad`);
  }

  // 12d — a composite's catalog bodies against its planets.
  {
    const [cm] = compositeMinorSamples(COMPOSITE, [1]);
    const ce = compositeEquatorial(COMPOSITE, 'mean').find((p) => p.name === 'Ceres');
    check('12d compositeMinorSamples([1]) is compositeEquatorial\'s Ceres in all four coordinates — of record, and with no speed',
      !!cm && !!ce && cm.ra === ce.ra && cm.dec === ce.dec && cm.lon === ce.lon && cm.lat === ce.lat &&
        cm.ofRecord === true && !('speed' in cm),
      cm && ce ? `RA ${cm.ra} / ${ce.ra}, lon ${cm.lon} / ${ce.lon}` : `catalog ${!!cm}, planets' Ceres ${!!ce}`);
    // The line position carries the longitude of record, so In Zodiaco reads the midpoint.
    const pos = cm ? minorLinePositionOf(cm) : null;
    const zodC = pos ? projectMinorOntoEcliptic([pos], natalJd)[0] : null;
    const zodP = ce ? projectOntoEcliptic([ce], natalJd)[0] : null;
    check('12d … and its line position carries that longitude, so In Zodiaco projects it exactly as the planets\' midpoint',
      !!pos && pos.lon === cm?.lon && !!zodC && !!zodP && zodC.ra === zodP.ra && zodC.dec === zodP.dec);

    // A parent in 1750: before the main-asteroid file (Ceres, Pholus), inside the short
    // files — the catalog drops exactly the bodies a parent's date is outside, and the
    // planets drop Ceres for the same reason.
    const stayers = [-40, ...presentBodies.slice(0, 3).map((b) => b.n)];
    const asked = [1, 5145, ...stayers];
    const early = compositeMinorSamples(COMPOSITE_1750, asked);
    const jdA = birthDataToJD(COMPOSITE_1750.a);
    const jdB = birthDataToJD(COMPOSITE_1750.b);
    const reachesBoth = asked.filter((n) => sampleMinorBody(jdA, n) !== null && sampleMinorBody(jdB, n) !== null);
    const planets = compositeEquatorial(COMPOSITE_1750, 'mean');
    check(`12d a parent in 1750: the catalog keeps exactly the ${reachesBoth.length} bodies both parents' dates reach (Ceres and Pholus out), and the planets' composite drops Ceres too`,
      setOf(early.map((s) => s.n)) === setOf(reachesBoth) && !reachesBoth.includes(1) && !reachesBoth.includes(5145) &&
        stayers.every((n) => reachesBoth.includes(n)) && !planets.some((p) => p.name === 'Ceres') && planets.some((p) => p.name === 'Sun'),
      `kept [${setOf(early.map((s) => s.n))}], both reach [${setOf(reachesBoth)}]`);
  }

  // 12e — the rows' overlay side.
  {
    const entry = (n: number) => ({ n, name: '', source: BUNDLED_SOURCE_ID });
    const ns = [5145, -40, -41, -42];
    const pref: MinorBodiesPref = { shown: true, list: [...ns, -43].map(entry), visible: [...ns] };
    const ready = (): MinorLoadState => ({ status: 'ready', name: null });
    const ctx = { advanced: true, none: false, sampled: new Set([5145, -40]) };
    const over = { overlaySampled: new Set([-40, -41]), overlayMode: 'transits' as const };
    const side = (rows: readonly ReturnType<typeof deriveMinorRows>[number][]) =>
      Object.fromEntries(rows.map((r) => [r.entry.n, `${r.status.kind}${r.status.kind === 'undrawn' ? `:${r.status.reason}` : ''}/${r.overlay ? `${r.overlay.kind}:${r.overlay.mode}` : '-'}`]));
    const rows = deriveMinorRows(pref, ready, { ...ctx, ...over });
    const got = side(rows);
    const want = {
      5145: 'shown/noData:transits', [-40]: 'shown/shown:transits', [-41]: 'noData/shown:transits',
      [-42]: 'noData/noData:transits', [-43]: 'off/-',
    };
    check('12e chart in, overlay out; both in; chart out, overlay in; both out — and a switched-off body has no overlay side',
      JSON.stringify(got) === JSON.stringify(Object.fromEntries(Object.entries(want))), JSON.stringify(got));
    const none = deriveMinorRows(pref, ready, ctx);
    check('12e with no overlay passed, no row has an overlay side (not even an empty one)',
      none.length === 5 && none.every((r) => !('overlay' in r)));
    const noTime = side(deriveMinorRows(pref, ready, { ...ctx, ...over, undrawn: 'noTime' }));
    const angles = deriveMinorRows(pref, ready, { ...ctx, ...over, undrawn: 'angles' });
    check('12e no birth time keeps the overlay side (an overlay\'s instant has its own); the Angles filter, which takes its lines too, drops it',
      noTime[-40] === 'undrawn:noTime/shown:transits' && noTime[-41] === 'noData/shown:transits' &&
        angles.filter((r) => r.status.kind === 'undrawn').length === 2 && angles.filter((r) => r.status.kind === 'undrawn').every((r) => !('overlay' in r)),
      `${noTime[-40]}, ${noTime[-41]}`);
    const gated = withMinorDrawGate(rows, 'natalOff');
    const g = side(gated);
    const has = (rs: readonly (typeof rows)[number][]) => rs.filter(minorRowHasLines).map((r) => r.entry.n);
    check('12e the natal draw gate leaves the overlay side as it was; minorRowHasLines counts either side',
      g[5145] === 'undrawn:natalOff/noData:transits' && g[-40] === 'undrawn:natalOff/shown:transits' &&
        setOf(has(rows)) === setOf([5145, -40, -41]) && setOf(has(gated)) === setOf([-40, -41]) && has(none).length === 2,
      `${g[5145]}, ${g[-40]}; with lines [${setOf(has(rows))}] → [${setOf(has(gated))}]`);

    // When App passes the overlay side at all — minorChartContext, the one fold App
    // calls: promoted, the eclipse map lines off, the Angles filter, no birth time.
    const frame = {
      advanced: true, none: false, chartSampled: ctx.sampled,
      overlay: { sampled: over.overlaySampled, mode: over.overlayMode },
      promoted: false, overlayOnMap: true, noTime: false, anglesOff: false,
    };
    const via = (f: Partial<typeof frame>) => side(deriveMinorRows(pref, ready, minorChartContext({ ...frame, ...f })));
    const besideRows = via({});
    check('12e minorChartContext beside the chart is exactly the context 12e\'s first case passed by hand',
      JSON.stringify(besideRows) === JSON.stringify(got), JSON.stringify(besideRows));
    const promotedRows = via({ promoted: true });
    check('12e promoted: the rows read the overlay\'s set as the chart\'s, with no overlay side',
      JSON.stringify(promotedRows) === JSON.stringify({ 5145: 'noData/-', [-40]: 'shown/-', [-41]: 'shown/-', [-42]: 'noData/-', [-43]: 'off/-' }),
      JSON.stringify(promotedRows));
    const promotedNoTime = via({ promoted: true, noTime: true });
    check('12e promoted on a chart with no birth time: the overlay\'s moment draws, so no row reads noTime',
      JSON.stringify(promotedNoTime) === JSON.stringify(promotedRows), JSON.stringify(promotedNoTime));
    const offMap = via({ overlayOnMap: false });
    const plain = side(deriveMinorRows(pref, ready, ctx));
    check('12e an overlay whose lines are off the map (eclipse map lines off): no overlay side — the rows the chart alone gives',
      JSON.stringify(offMap) === JSON.stringify(plain), JSON.stringify(offMap));
    const anglesOff = via({ anglesOff: true });
    check('12e the Angles filter showing none of the four: no overlay side, the chart\'s rows undrawn for it',
      anglesOff[5145] === 'undrawn:angles/-' && anglesOff[-40] === 'undrawn:angles/-' && anglesOff[-41] === 'noData/-' &&
        Object.values(anglesOff).every((v) => v.endsWith('/-')),
      JSON.stringify(anglesOff));
    const noOverlay = via({ overlay: null as unknown as typeof frame.overlay });
    check('12e no overlay layer at all: the rows the chart alone gives',
      JSON.stringify(noOverlay) === JSON.stringify(plain), JSON.stringify(noOverlay));
  }

  // 12f — the overlay's wheel set against its planets' ring. App places the overlay's catalog
  // bodies on the bi-wheel (and a promoted overlay's on the wheel) with buildWheelMinor over
  // the overlay's own samples, shifted by the overlay ring's ayanamsa; the planets' ring is
  // toEclipticPositions over the layer, shifted the same way (displayOverlayEcliptic). MPC 1
  // and Ceres must land on one degree in every mode and zodiac — and carry a speed exactly
  // when the planet does: sampled, yes; directed or a midpoint, no (an em-dash, not a rate).
  // To rounding where the two take different roads to the same figure: a sampled catalog
  // body carries the engine's own longitude and latitude, where the ring re-derives the
  // planet's from its ra/dec (toEclipticPositions); directed and midpoint figures are
  // derived alike on both sides, and those agree exactly.
  {
    const MODES: ZodiacMode[] = ['tropical', 'lahiri', 'fagan-bradley'];
    const TOL = 1e-12; // radians
    let worst = 0;
    let compared = 0;
    let withSpeed = 0;
    let withoutSpeed = 0;
    let firstBad = '';
    for (const [c, layer] of layers) {
      // Cyclo is never wheeled (App's isCyclo: no coherent chart to ring).
      if (!layer || c.mode === 'cyclo') continue;
      const samples = overlayMinorSamples(layer.bodyRule, [1], natalOf([1]));
      for (const mode of MODES) {
        const ayan = ayanamsaRad(layer.jd, mode);
        const [w] = buildWheelMinor(samples, { ayan, decor, t, list: [] });
        const ceres = shiftEclipticPositions(toEclipticPositions(layer.positions, layer.jd), ayan)
          .find((p) => p.name === 'Ceres');
        const where = `${c.label}, ${mode}`;
        if (!w || !ceres) {
          firstBad ||= `${where}: wheel body ${!!w}, ring's Ceres ${!!ceres}`;
          continue;
        }
        const dLon = Math.abs(wrapPi(w.lon - ceres.lon));
        const dLat = Math.abs(w.lat - (ceres.lat ?? NaN));
        const exact = layer.bodyRule.by !== 'sample';
        worst = Math.max(worst, dLon, dLat);
        const why = [
          !(exact ? dLon === 0 : dLon < TOL) ? `lon ${w.lon} vs ${ceres.lon}` : '',
          !(exact ? dLat === 0 : dLat < TOL) ? `lat ${w.lat} vs ${ceres.lat}` : '',
          w.ra !== ceres.ra || w.dec !== ceres.dec ? 'ra/dec' : '',
          w.speed !== ceres.speed ? `speed ${w.speed} vs ${ceres.speed}` : '',
          w.retrograde !== ceres.retrograde ? `retrograde ${w.retrograde} vs ${ceres.retrograde}` : '',
          w.stationary !== false ? 'stationary' : '',
          (layer.bodyRule.by === 'sample') !== (w.speed !== undefined) ? `speed present ${w.speed !== undefined} under ${layer.bodyRule.by}` : '',
        ].filter(Boolean);
        if (why.length) firstBad ||= `${where}: ${why.join(', ')}`;
        else {
          compared += 1;
          if (w.speed === undefined) withoutSpeed += 1;
          else withSpeed += 1;
        }
      }
    }
    const want = (CASES.length - 1) * MODES.length;
    check(`12f the overlay wheel set: MPC 1 on Ceres's degree in the overlay ring — ${CASES.length - 1} overlays × ${MODES.length} zodiacs, each shifted by the overlay's own ayanamsa — with a speed exactly when the planet has one`,
      !firstBad && compared === want && withSpeed > 0 && withoutSpeed > 0,
      firstBad || `${compared} of ${want}; ${withSpeed} with a speed, ${withoutSpeed} without (directed and midpoint); worst ${worst.toExponential(2)} rad`);
  }

  // 12g — MEASURED: what the catalog set adds to one playback tick. The timeline plays by
  // moving the target one notch every 120 ms (App's playback interval), and each notch
  // rebuilds the overlay; the catalog set beside it then takes one sample per body at the
  // new instant (bodies outermost — the engine holds one asteroid file open at a time, so
  // every body is a file switch) and one pass of line geometry. Timed against the planets'
  // own share of the same tick (buildOverlay, then the lines and zenith stamps App's
  // overlay memo draws), at the cap of 20 bundled bodies and with the ten hypothetical
  // points, which the engine computes from elements rather than reading off a file.
  // Printed, never asserted on time — a machine's speed is not a property of the code —
  // except that it measured something. The deferral (App.tsx, minorLayer) reads these.
  {
    const TICKS = 48;
    const STEP_MS = 86_400_000; // a day a notch, the transits default
    const bundled20 = presentBodies.slice(0, 20).map((b) => b.n);
    const hyp10 = HYPOTHETICAL_POINTS.map((p) => p.n);
    const now = () => performance.now();
    const median = (xs: number[]) => {
      const s = [...xs].sort((a, b) => a - b);
      return s.length ? s[Math.floor(s.length / 2)] : NaN;
    };
    const timeSet = (label: string, ns: readonly number[]) => {
      const planets: number[] = [];
      const sample: number[] = [];
      const geom: number[] = [];
      let drawn = 0;
      // One untimed pass first: the first touch of each file mounts it.
      for (let i = -2; i < TICKS; i++) {
        const t0 = now();
        const layer = buildOverlay(NATAL, 'transits', TARGET + i * STEP_MS, null, 'mean', 'mean-quotidian', 'ptolemy', 1,
          'relative-to-natal', 'secondary', t);
        if (!layer) continue;
        const ovMeridianLng = meridianLngFor('celestial', obliquity(layer.jd), layer.gmst);
        generateLines(layer.positions, ovMeridianLng);
        generateZenithStamps(layer.positions, ovMeridianLng);
        const t1 = now();
        const samples = overlayMinorSamples(layer.bodyRule, ns, null);
        const t2 = now();
        const g = buildOverlayMinorLinesFrom(layer, samples);
        const t3 = now();
        if (i < 0) continue;
        planets.push(t1 - t0);
        sample.push(t2 - t1);
        geom.push(t3 - t2);
        drawn += g.lines.features.length;
      }
      const added = median(sample) + median(geom);
      console.log(`meas  12g ${label}: per tick (median of ${planets.length}) — planets ${median(planets).toFixed(2)} ms; ` +
        `catalog sample ${median(sample).toFixed(2)} ms + geometry ${median(geom).toFixed(2)} ms = ${added.toFixed(2)} ms ` +
        `(${((added / 120) * 100).toFixed(1)}% of the 120 ms playback interval; ${(drawn / Math.max(planets.length, 1)).toFixed(0)} lines a tick)`);
      return { ticks: planets.length, drawn, added };
    };
    const buildOverlayMinorLinesFrom = (layer: NonNullable<ReturnType<typeof layerOf>>, samples: ReturnType<typeof overlayMinorSamples>) =>
      overlayMinorLines(layer, samples, mundo);
    const a = bundled20.length > 0 ? timeSet(`${bundled20.length} bundled bodies`, bundled20) : null;
    const h = timeSet(`${hyp10.length} hypothetical points`, hyp10);
    if (!a) skip('12g bundled bodies', 'no bundled per-asteroid file is present');
    check('12g measured the catalog set\'s share of a playback tick (figures above, as meas lines)',
      h.ticks > 0 && h.drawn > 0 && (!a || (a.ticks > 0 && a.drawn > 0)),
      `${a ? `${a.ticks} ticks × ${bundled20.length} bodies` : 'no bundled bodies'}; ${h.ticks} ticks × ${hyp10.length} points`);
  }
}

console.log(
  failures === 0
    ? `\nverify-minor-bodies: ALL PASS${skips ? ` (${skips} skipped — see SKIP lines)` : ''}`
    : `\nverify-minor-bodies: ${failures} FAILURE(S)${skips ? `, ${skips} skipped` : ''}`,
);
process.exit(failures === 0 ? 0 : 1);
