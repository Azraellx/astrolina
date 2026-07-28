// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies chart import against the fixtures in test/fixtures/import, running
// the REAL src/lib/import code through the harness (`npm run verify:import`).
//
// Four layers, in the order they catch things:
//
//   1. Fidelity      — each fixture reads to the record it should.
//   2. Equivalence   — the SAME chart written four different ways normalizes to
//                      one identical record. This is the most valuable test in
//                      the file: it proves the normalizer rather than any one
//                      reader, and a reader that drifts is caught by its three
//                      siblings disagreeing with it.
//   3. Astronomy     — an imported chart lands on the same instant a
//                      hand-entered one would. That is the actual promise being
//                      made to someone who imports a library.
//   4. Adversarial   — every broken row is rejected on its own terms, the clean
//                      rows around it still import, and nothing succeeds quietly.
//
// The fixtures are synthetic. Real exports carry real people's birth data, and
// this repository is public.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { birthDataToJD, initEphemeris } from '../src/lib/ephemeris';
import type { BirthData } from '../src/lib/birthData';
import {
  chartsFrom,
  DEFAULT_CONTROLS,
  defaultControlsFor,
  detectShape,
  importableRows,
  initialMapping,
  parseImport,
  rowSeverity,
  sourceFromBytes,
  sourceFromText,
  type ColumnMapping,
  type ImportControls,
  type ImportedChart,
  type ImportReport,
  type ImportRow,
  type IssueCode,
} from '../src/lib/import';
import { localToJd } from '../src/lib/import/julian';
import { parseCoord } from '../src/lib/import/fields';
import { extractRating, normalizeRating } from '../src/lib/sourceRating';

// Resolved from the package root, not from this file: the harness bundles
// verify scripts into scripts/harness/.cache before running them, so
// import.meta.url points at the bundle rather than at the source.
//
// The fixtures live beside the scripts that read them rather than under a
// top-level test/ — this repo's testing convention is `npm run verify:*`, and a
// test/ directory would promise a runner that does not exist.
const FIXTURES = resolve(process.cwd(), 'scripts/fixtures/import');

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

function bytesOf(name: string): ArrayBuffer {
  const b = readFileSync(resolve(FIXTURES, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

function read(name: string, opts: { mapping?: ColumnMapping; controls?: ImportControls } = {}) {
  const source = sourceFromBytes(bytesOf(name));
  const controls = opts.controls ?? defaultControlsFor(source.shape);
  const mapping = opts.mapping ?? (source.shape.format === 'delimited' ? initialMapping(source) : undefined);
  return { source, report: parseImport(source, { controls, mapping }) };
}

function codes(row: ImportRow): IssueCode[] {
  return row.issues.map((i) => i.code);
}

/** The UTC instant a record resolves to, as a Julian Day. */
function instantOf(c: ImportedChart): number {
  return localToJd(c.local, c.offsetSeconds, c.calendar);
}

/** Julian Day of a stated UTC civil moment, for comparing against. */
function utc(y: number, mo: number, d: number, h: number, mi: number, s = 0): number {
  return localToJd({ year: y, month: mo, day: d, hour: h, minute: mi, second: s }, 0, 'auto');
}

const SECOND = 1 / 86400;

// ── Layer 0 — the coordinate reader ─────────────────────────────────────────
//
// Its own section because it is the sharpest edge in the importer. A longitude
// that is wrong still draws a map that looks completely normal — it is simply
// of the wrong side of the world — so nothing downstream can catch a
// misreading here. Every form below is one a real export emits, and every
// rejection is a shape that must NOT be given a confident answer.

console.log('\n── Layer 0: coordinates are read exactly or not at all ──');

{
  const DMS = (d: number, m = 0, s = 0) => d + m / 60 + s / 3600;
  const accept: [string, 'lat' | 'lng', number][] = [
    ["40N34'10\"", 'lat', DMS(40, 34, 10)],
    ['43N39', 'lat', DMS(43, 39)],
    ['54N3500', 'lat', DMS(54, 35)],       // packed degrees-minutes-seconds
    ['19n20', 'lat', DMS(19, 20)],
    ['15e0', 'lng', 15],                    // minutes are not always padded
    ['9e10', 'lng', DMS(9, 10)],
    ['074W38\'00"', 'lng', -DMS(74, 38)],
    ['33S55', 'lat', -DMS(33, 55)],
    ['45N08 19', 'lat', DMS(45, 8, 19)],   // space-separated seconds
    ['43°39\'00"N', 'lat', DMS(43, 39)],   // hemisphere trailing
    ['43.6532N', 'lat', 43.6532],           // decimal degrees with a hemisphere
  ];
  for (const [token, axis, want] of accept) {
    const got = parseCoord(token, axis);
    check(`  ${token} reads as ${want.toFixed(4)}`,
      !!got && !got.outOfRange && Math.abs(got.value - want) < 1e-9,
      got ? String(got.value) : 'rejected');
  }

  // A bare decimal cannot settle its own sign: which way a source counts is a
  // property of the source. It comes back flagged so the preview asks.
  const bare = parseCoord('-79.38', 'lng');
  check('  a bare decimal defers its sign to the control',
    !!bare && bare.explicit === false, String(bare?.explicit));
  check('  a token with a hemisphere letter does not',
    parseCoord('079W23', 'lng')?.explicit === true);

  // Every one of these was accepted by the previous reader, silently.
  const refuse: [string, 'lat' | 'lng', string][] = [
    ['40N345', 'lat', "three trailing digits: 34'5\" or 3°45'?"],
    ['40N34567', 'lat', 'no reading at all'],
    ['40N75', 'lat', '75 minutes'],
    ['40N34N', 'lat', 'two hemisphere letters'],
    ['43N39', 'lng', 'a north/south token in the longitude column'],
    ['079W23', 'lat', 'an east/west token in the latitude column'],
    ['Cheiro  1 Nov 1866  10:55  Dublin', 'lat', 'a whole line — "1 Nov" is not 1°N'],
    ['abc', 'lat', 'not a number'],
    ['', 'lat', 'empty'],
  ];
  for (const [token, axis, why] of refuse) {
    check(`  refuses ${JSON.stringify(token)}`, parseCoord(token, axis) === null, why);
  }

  // Readable but impossible: reported as out of range rather than unreadable,
  // so the row can name the offending value.
  check('  91N00 is read but flagged out of range', parseCoord('91N00', 'lat')?.outOfRange === true);
  check('  999W00 is read but flagged out of range', parseCoord('999W00', 'lng')?.outOfRange === true);
}

// ── Source ratings ──────────────────────────────────────────────────────────
//
// Seven codes, and every collection in the wild uses a slightly different
// alphabet — so the job is to fit an unknown code to the nearest of ours rather
// than grow the vocabulary to meet it. What must NOT happen is a confident
// wrong rating: it will be believed, and it speaks to whether a chart can be
// trusted at all.

console.log('\n── Source ratings fit to the nearest of seven ──');

{
  const exact: [string, string][] = [
    ['AA', 'AA'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['DD', 'DD'], ['X', 'X'], ['XX', 'XX'],
    ['aa', 'AA'], [' dd ', 'DD'],
  ];
  for (const [raw, want] of exact) {
    check(`  ${JSON.stringify(raw)} → ${want}`, normalizeRating(raw) === want,
      String(normalizeRating(raw)));
  }

  // Labelled forms, as they appear in notes and columns.
  for (const [raw, want] of [['Rodden: AA', 'AA'], ['Rating B', 'B'], ['RR = DD', 'DD']] as const) {
    check(`  ${JSON.stringify(raw)} → ${want}`, normalizeRating(raw) === want,
      String(normalizeRating(raw)));
  }

  // Codes from other alphabets, fitted by their leading letter.
  const fitted: [string, string][] = [
    ['AAA', 'AA'],  // a longer run of the letter means more of the letter
    // …but a modifier does NOT promote: "A+" says A, and reading it as AA
    // would claim a birth record where the source only claimed a good quote.
    // A rating is a claim about trust; rounding it upward is the wrong error.
    ['A+', 'A'],
    ['D', 'DD'],    // a bare D is dirty data elsewhere
    ['F', 'DD'],    // below D on a letter ladder
    ['XXX', 'XX'],
    ['U', 'XX'],    // unknown
    ['N', 'XX'],    // none
    ['Q', 'C'],     // on the scale somewhere, but we cannot say where
  ];
  for (const [raw, want] of fitted) {
    check(`  ${JSON.stringify(raw)} fits to ${want}`, normalizeRating(raw) === want,
      String(normalizeRating(raw)));
  }

  // Nothing rating-shaped is NOT "source unknown" — it is no rating at all.
  for (const raw of ['', '   ', '?', '—', null, undefined]) {
    check(`  ${JSON.stringify(raw)} → no rating`, normalizeRating(raw) === null,
      String(normalizeRating(raw)));
  }
  // Numbers are refused outright: programs that rate 1–5 disagree about which
  // end is best, so a direction would invert half of them.
  for (const raw of ['1', '5', '3/5']) {
    check(`  ${JSON.stringify(raw)} is refused rather than guessed`, normalizeRating(raw) === null,
      String(normalizeRating(raw)));
  }

  // Pulled out of free text only when announced — "A" is an ordinary word.
  check('  "Rating: AA" is found in notes', extractRating('From the birth certificate\nRating: AA') === 'AA');
  check('  a bare code on its own line is found', extractRating('notes here\nDD') === 'DD');
  check('  prose is not mined for ratings',
    extractRating('A friend of the family gave me this. B is unsure.') === null,
    String(extractRating('A friend of the family gave me this. B is unsure.')));
}

// ── Layer 1 — fidelity ──────────────────────────────────────────────────────

console.log('\n── Layer 1: each fixture reads to the record it should ──');

{
  const { report } = read('f01-lewis.csv');
  const c = report.rows[0]?.chart;
  check('F01 csv reads one clean row', report.rows.length === 1 && rowSeverity(report.rows[0]) === 'ok',
    `${report.rows.length} rows, ${report.rows[0] ? rowSeverity(report.rows[0]) : 'none'}`);
  check('F01 csv name', c?.name === 'Jim Lewis', c?.name);
  check('F01 csv moment', !!c && Math.abs(instantOf(c) - utc(1941, 6, 5, 13, 30)) < SECOND,
    c ? String(instantOf(c)) : 'no chart');
  check('F01 csv coordinates', !!c && Math.abs(c.latitude - (40 + 56 / 60)) < 1e-9 &&
    Math.abs(c.longitude - -(73 + 54 / 60)) < 1e-9, `${c?.latitude}, ${c?.longitude}`);
}

{
  // The zone gauntlet: each row is a shape that a float-hours or
  // northern-hemisphere-only implementation gets wrong.
  const { report } = read('f02-f06-zones.csv');
  const want: [string, number][] = [
    ['Adelaide Person', utc(1980, 7, 1, 4, 30)],
    ['Ulm Person', utc(1879, 3, 14, 10, 50, 3)],
    ['Kathmandu Person', utc(1990, 6, 1, 0, 15)],
    ['Auckland Person', utc(1999, 12, 31, 11, 30)],
    ['Chicago Person', utc(2018, 11, 4, 6, 30)],
  ];
  check('F02–F06 all five rows read', report.rows.length === 5, String(report.rows.length));
  for (const [name, expected] of want) {
    const c = report.rows.find((r) => r.chart?.name === name)?.chart;
    check(`  ${name} lands on its stated instant`, !!c && Math.abs(instantOf(c) - expected) < SECOND,
      c ? `off by ${((instantOf(c) - expected) * 86400).toFixed(3)}s` : 'no chart');
  }
  // Mean time to the second is the case float hours would round away.
  const ulm = report.rows.find((r) => r.chart?.name === 'Ulm Person')?.chart;
  check('  Ulm keeps its offset to the second', ulm?.offsetSeconds === 39 * 60 + 57,
    String(ulm?.offsetSeconds));
}

{
  const { report } = read('f07-comma.csv');
  const c = report.rows[0]?.chart;
  check('F07 a quoted name keeps its comma', c?.name === 'Acme Holdings, Inc.', c?.name);
}

{
  // Single-byte Windows text with no byte order mark. Decoded as UTF-8 the
  // accented place names arrive as mojibake and then match nothing.
  const { source, report } = read('f08-cp1252.csv');
  check('F08 encoding is sniffed, not assumed', source.encoding === 'windows-1252', source.encoding);
  const names = report.rows.map((r) => r.chart?.placeName);
  check('F08 accented place names survive', names.includes('Zürich') && names.includes('St Rémy'),
    names.join(' / '));
}

{
  const { report } = read('f09-f10-edges.csv');
  const noTime = report.rows.find((r) => r.chart?.name === 'No Time Person');
  // Ruling: a missing time is not a rejection. The app has an honest
  // unknown-time chart, so the row imports flagged rather than being dropped.
  check('F09 a missing time imports as time-unknown',
    !!noTime && rowSeverity(noTime) === 'warn' && noTime.chart?.timeKnown === false &&
      codes(noTime).includes('noTime'),
    noTime ? `${rowSeverity(noTime)} ${codes(noTime).join(',')}` : 'missing');
  check('F09 the unknown time holds a noon placeholder',
    noTime?.chart?.local.hour === 12 && noTime?.chart?.local.minute === 0,
    `${noTime?.chart?.local.hour}:${noTime?.chart?.local.minute}`);

  for (const name of ['Too Early Person', 'Too Late Person']) {
    const row = report.rows.find((r) => r.chart?.name === name || r.raw.includes(name));
    check(`F10 ${name} is rejected, not clamped`,
      !!row && rowSeverity(row) === 'reject' && codes(row).includes('yearRange'),
      row ? codes(row).join(',') : 'missing');
  }
}

// ── Layer 2 — cross-format equivalence ──────────────────────────────────────

console.log('\n── Layer 2: one chart, four ways, one record ──');

{
  const csv = read('f01-lewis.csv').report.rows[0]?.chart;
  const aaf = read('f01-lewis.aaf').report.rows[0]?.chart;
  const block = read('f01-lewis.txt').report.rows[0]?.chart;

  // The column-aligned file has nothing to split on, so it carries the mapping
  // a user would have set once on the ruler.
  const fixedSource = sourceFromBytes(bytesOf('f01-lewis.fixed.txt'));
  const fixedMapping: ColumnMapping = {
    kind: 'fixed',
    boundaries: [18, 32, 40, 49, 58],
    columns: [
      { target: 'name' }, { target: 'date', dateFormat: 'auto' }, { target: 'time' },
      { target: 'offset' }, { target: 'latitude' }, { target: 'longitude' },
    ],
  };
  const fixed = parseImport(fixedSource, {
    mapping: fixedMapping,
    controls: DEFAULT_CONTROLS,
  }).rows[0]?.chart;

  const all: [string, ImportedChart | null | undefined][] = [
    ['separated columns', csv], ['exchange format', aaf],
    ['pasted details', block], ['aligned columns', fixed],
  ];
  for (const [label, c] of all) {
    check(`  ${label} produced a record`, !!c, c ? c.name : 'none');
  }

  // Everything that identifies the CHART must agree. Provenance fields
  // (which reader, which line, the raw text, the notes each format happens to
  // carry) are expected to differ — that is what they are for.
  const identity = (c: ImportedChart) => ({
    name: c.name,
    local: c.local,
    timeKnown: c.timeKnown,
    offsetSeconds: c.offsetSeconds,
    latitude: Number(c.latitude.toFixed(9)),
    longitude: Number(c.longitude.toFixed(9)),
  });
  const ref = csv ? JSON.stringify(identity(csv)) : '';
  for (const [label, c] of all) {
    if (!c) continue;
    check(`  ${label} matches the separated-columns record`, JSON.stringify(identity(c)) === ref,
      JSON.stringify(identity(c)));
  }

  // The exchange format states the instant itself, so it can check our reading
  // of it — including whether the daylight hour belonged.
  const aafRow = read('f01-lewis.aaf').report.rows[0];
  check('  the exchange record agrees with its own stated moment',
    !!aafRow && !codes(aafRow).includes('jdMismatch'), aafRow ? codes(aafRow).join(',') : 'missing');
  check('  its daylight hour was applied (UTC−4, not −5)',
    aaf?.offsetSeconds === -4 * 3600, String(aaf?.offsetSeconds));
}

// ── Layer 3 — an imported chart is a chart ──────────────────────────────────

console.log('\n── Layer 3: an imported chart lands where a typed one does ──');

await initEphemeris();

{
  const { report } = read('f01-lewis.csv');
  const [imported] = chartsFrom(report);
  // The same person, entered by hand the way the birth form would store them.
  const typed: BirthData = {
    name: 'Jim Lewis',
    year: 1941, month: 6, day: 5, hour: 9, minute: 30,
    tzOffset: -4,
    birthplace: { label: 'Yonkers, New York', lat: 40 + 56 / 60, lng: -(73 + 54 / 60) },
  };
  check('F01 imported and hand-entered give the same Julian Day',
    !!imported && Math.abs(birthDataToJD(imported) - birthDataToJD(typed)) < SECOND,
    imported ? `${birthDataToJD(imported)} vs ${birthDataToJD(typed)}` : 'no chart');
  check('F01 the saved chart keeps the file’s offset verbatim',
    imported?.tzOffset === -4, String(imported?.tzOffset));

  // Mean time again, this time through the ephemeris rather than our own
  // arithmetic: float hours must still resolve to the right second.
  const ulm = read('f02-f06-zones.csv').report.rows.find((r) => r.chart?.name === 'Ulm Person');
  const [ulmChart] = ulm?.chart ? chartsFrom({ ...(read('f02-f06-zones.csv').report), rows: [ulm] } as ImportReport) : [];
  check('F03 a mean-time chart survives the conversion to stored hours',
    !!ulmChart && Math.abs(birthDataToJD(ulmChart) - utc(1879, 3, 14, 10, 50, 3)) < SECOND,
    ulmChart ? `${((birthDataToJD(ulmChart) - utc(1879, 3, 14, 10, 50, 3)) * 86400).toFixed(3)}s off` : 'no chart');
}

// ── Layer 4 — adversarial ───────────────────────────────────────────────────

console.log('\n── Layer 4: broken rows fail loudly, one at a time ──');

{
  const { report } = read('f12-adversarial.csv');
  const byName = (n: string) => report.rows.find((r) => r.raw.startsWith(n));
  const expect: [string, IssueCode][] = [
    ['Bad Lat', 'latRange'],
    ['Bad Lng', 'lngRange'],
    ['Bad Offset', 'offsetRange'],
    ['Ambiguous Coord', 'badCoords'],
    ['No Coords', 'noCoords'],
    ['Bad Date', 'badDate'],
  ];
  for (const [name, code] of expect) {
    const row = byName(name);
    check(`  ${name} is flagged (${code})`, !!row && codes(row).includes(code),
      row ? `${rowSeverity(row)}: ${codes(row).join(',')}` : 'row missing');
  }
  const good = byName('Good Row');
  check('  the clean row in the same file still imports',
    !!good && rowSeverity(good) === 'ok', good ? rowSeverity(good) : 'missing');
  check('  nothing broken slipped through as importable',
    importableRows(report).length === 1, String(importableRows(report).length));

  // A truncated line must not take the file down with it.
  check('  a truncated line is rejected rather than throwing',
    !!byName('Truncated Row') && rowSeverity(byName('Truncated Row')!) === 'reject');
}

{
  // Volume. Not a benchmark — just proof that a thousand rows complete, and a
  // number to look at if the dialog ever feels slow.
  //
  // Built here rather than committed: it is machine-generated and would be by
  // far the largest thing in the fixtures folder, which is a poor trade for a
  // file no one will ever read.
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const bulk = ['Name,Date,Time,Zone,City,Region,Latitude,Longitude'];
  for (let i = 0; i < 1000; i++) {
    bulk.push(
      `Person ${i},${(i % 28) + 1} ${MONTHS[i % 12]} ${1900 + (i % 120)},` +
        `0${i % 10}:1${i % 6},-05:00,Toronto,Ontario,43N39,079W23`,
    );
  }
  const started = Date.now();
  const source = sourceFromText(bulk.join('\n'));
  const report = parseImport(source, { mapping: initialMapping(source) });
  const ms = Date.now() - started;
  check('F11 a thousand rows all read', report.rows.length === 1000, String(report.rows.length));
  check('F11 they all import', importableRows(report).length === 1000,
    String(importableRows(report).length));
  console.log(`      (${ms} ms for 1000 rows)`);
}

{
  // Duplicates: the same file dropped twice should not double the library.
  const source = sourceFromText(readFileSync(resolve(FIXTURES, 'f01-lewis.csv'), 'utf8'));
  const first = parseImport(source, { mapping: initialMapping(source) });
  const saved = chartsFrom(first);
  const second = parseImport(source, { mapping: initialMapping(source), existing: saved });
  check('  a re-dropped file recognises what it already brought in',
    second.rows[0]?.skipped === true && codes(second.rows[0]).includes('duplicate'),
    codes(second.rows[0] ?? ({ issues: [] } as unknown as ImportRow)).join(','));
  check('  and so imports nothing the second time', importableRows(second).length === 0,
    String(importableRows(second).length));
}

{
  // Shape detection has to keep its hands off things it does not understand.
  check('  an empty paste is not a chart', parseImport(sourceFromText('   ')).rows.length === 0);
  check('  prose is not mistaken for a chart',
    parseImport(sourceFromText('just some words\nand more words')).rows.every(
      (r) => rowSeverity(r) === 'reject'));
  check('  the exchange format is recognised by its own marker',
    detectShape(readFileSync(resolve(FIXTURES, 'f01-lewis.aaf'), 'utf8')).format === 'aaf');
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
