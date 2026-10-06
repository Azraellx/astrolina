// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies time-zone entry in astrologers' terms (src/lib/atlas/zoneEntry.ts),
// running the REAL src/lib code through the harness (`npm run verify:zone-entry`).
//
// Each section says which KIND of check it is, because a failure in each means
// something different:
//
//   TWO PARTS AGREE    — two independent parts of the app (or the app and the tz
//                        database it ships) asked the same question. A failure
//                        means one of them is wrong about the world.
//   INTERNAL IDENTITY  — the module agrees with itself (format then parse, resolve
//                        then reopen). A failure means the code contradicts itself.
//   GOLDEN             — values transcribed from sources and the tz database
//                        source, written out by hand. A failure means the code is
//                        self-consistent and wrong.
//
// Every loop below fails on an empty set: a check over nothing is not a pass.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DateTime } from 'luxon';
import {
  applyOffsetDirection,
  birthplaceLmtSeconds,
  canonicalZone,
  DAYLIGHT_OPTIONS,
  daylightFromAaf,
  daylightSeconds,
  entryFromStatedTerms,
  entrySeconds,
  formatAstroNotation,
  formatBothNotations,
  formatUtcNotation,
  lmtOffsetSeconds,
  localToUt,
  MAX_ZONE_OFFSET_SECONDS,
  parseZoneOffset,
  proposeStandardEntry,
  reopenZoneChoice,
  resolveZoneChoice,
  sanitizeTzEntry,
  STANDARD_ZONES,
  standardZoneById,
  zoneInUse,
  zoneSearchTerms,
  type DaylightCode,
  type TzEntry,
  type ZoneEntryMode,
  type ZoneMoment,
} from '../src/lib/atlas/zoneEntry';
import {
  atOfChart,
  initialModel,
  openZone,
  pickOfValue,
  zonePickRows,
  zonePickValue,
  zoneReduce,
  zoneView,
  type ZoneAction,
  type ZoneInputs,
  type ZonePickRow,
} from '../src/components/BirthDataForm/zoneEntryModel';
import { resolveBirthTimezone, resolveZoneInfo } from '../src/lib/atlas/timezone';
import { DAYLIGHT_CORRECTION, readAaf } from '../src/lib/import/readers/aaf';
import {
  chartsFrom,
  DEFAULT_CONTROLS,
  initialMapping,
  parseImport,
  sourceFromBytes,
  sourceFromText,
  type ImportControls,
} from '../src/lib/import';
import { decodeShareState, encodeShareState } from '../src/lib/shareState';
import type { StoredChart } from '../src/lib/chartLibrary';

const FIXTURES = resolve(process.cwd(), 'scripts/fixtures/import');

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

/** One PASS/FAIL line for a whole set: fails when the set is empty, and names
 *  the first few members that broke the rule. */
function every<T>(label: string, items: readonly T[], bad: (x: T) => string | null) {
  if (items.length === 0) {
    check(label, false, 'empty set — nothing was compared');
    return;
  }
  const broken = items.map(bad).filter((s): s is string => s != null);
  check(`${label} (${items.length})`, broken.length === 0, broken.slice(0, 6).join('; '));
}

const H = 3600;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The tz database's offset (seconds) for a zone at local noon on a date. */
function tzdbOffset(zone: string, year: number, month: number, day = 15): number | null {
  const dt = DateTime.fromObject({ year, month, day, hour: 12 }, { zone });
  return dt.isValid ? dt.offset * 60 : null;
}

const STEP_SECONDS = new Set([0, 1800, 3600, 7200]);
const MODERN_YEAR = 2025;

// ── 1. TWO PARTS AGREE: the catalogue against the tz database ───────────────

console.log('\n── 1. TWO PARTS AGREE: every standard zone is the tz database’s standard time ──');

{
  // For each entry, its representative zone and every member: in a January and a
  // July of the check year, the lower of the two offsets is the standard time
  // (that covers both hemispheres) and must be the entry's; the difference must
  // be a daylight step the form offers (none, half, one or two hours).
  const pairs = STANDARD_ZONES.flatMap((z) =>
    [z.iana, ...(z.members ?? [])].map((iana) => ({ z, iana, year: z.checkYear ?? MODERN_YEAR })),
  );
  every('catalogue standard offset = tz database standard offset', pairs, ({ z, iana, year }) => {
    const jan = tzdbOffset(iana, year, 1);
    const jul = tzdbOffset(iana, year, 7);
    if (jan == null || jul == null) return `${z.id}/${iana}: zone unknown to this engine`;
    const std = Math.min(jan, jul);
    if (std !== z.std) return `${z.id}/${iana} ${year}: tz ${formatUtcNotation(std)} vs ${formatUtcNotation(z.std)}`;
    if (!STEP_SECONDS.has(Math.abs(jan - jul))) return `${z.id}/${iana} ${year}: seasonal step ${Math.abs(jan - jul)} s`;
    return null;
  });

  every('a historic entry is checked inside its own era', STANDARD_ZONES.filter((z) => z.years), (z) =>
    zoneInUse(z, z.checkYear ?? MODERN_YEAR) ? null : `${z.id}: check year ${z.checkYear} outside its years`,
  );
  every('ids are unique', STANDARD_ZONES, (z) =>
    STANDARD_ZONES.filter((x) => x.id === z.id).length === 1 ? null : `${z.id} repeated`,
  );
  every('every entry shows a region beside its name', STANDARD_ZONES, (z) =>
    z.name.trim() && z.region.trim() ? null : `${z.id}: missing name or region`,
  );

  // Coverage, modern: every zone this engine knows whose CURRENT standard time is
  // not a whole hour must be listed — by a catalogue entry with that very offset.
  const allZones = Intl.supportedValuesOf('timeZone').filter((z) => !z.startsWith('Etc/'));
  const listed = new Map<string, number[]>();
  for (const z of STANDARD_ZONES) {
    if (!zoneInUse(z, MODERN_YEAR)) continue;
    for (const iana of [z.iana, ...(z.members ?? [])]) {
      const key = canonicalZone(iana);
      listed.set(key, [...(listed.get(key) ?? []), z.std]);
    }
  }
  const offHour = allZones
    .map((iana) => {
      const jan = tzdbOffset(iana, MODERN_YEAR, 1);
      const jul = tzdbOffset(iana, MODERN_YEAR, 7);
      return { iana, std: jan == null || jul == null ? null : Math.min(jan, jul) };
    })
    .filter((x): x is { iana: string; std: number } => x.std != null && x.std % H !== 0);
  every('every current half/quarter-hour zone is named by an entry with its offset', offHour, ({ iana, std }) =>
    (listed.get(canonicalZone(iana)) ?? []).includes(std) ? null : `${iana} ${formatUtcNotation(std)}`,
  );

  // Coverage, historic: every half/quarter-hour STANDARD time the tz database
  // records since 1868 (New Zealand's +11:30 began then), outside a zone's
  // local-mean-time era, must be offered — as an entry's offset, or as one plus
  // a daylight step (the war years, when January and July were both on summer
  // time). Scanned year by year. The catalogue's header claims 1868; until
  // 2026-10-02 this scan began at 1900 and the claim was unguarded.
  const stds = new Set(STANDARD_ZONES.map((z) => z.std));
  const gaps = new Map<string, string>();
  let scanned = 0;
  for (const iana of allZones) {
    for (let year = 1868; year <= MODERN_YEAR; year++) {
      const jan = tzdbOffset(iana, year, 1);
      const jul = tzdbOffset(iana, year, 7);
      if (jan == null || jul == null) continue;
      const std = Math.min(jan, jul);
      if (std % H === 0 || std % 900 !== 0) continue;
      const month = jan <= jul ? 1 : 7;
      if (resolveZoneInfo(iana, year, month, 15, 12, 0).lmt) continue;
      scanned++;
      const offered = stds.has(std) || DAYLIGHT_OPTIONS.some((o) => o.seconds > 0 && stds.has(std - o.seconds));
      if (!offered) gaps.set(`${iana} ${formatUtcNotation(std)}`, `${iana} ${formatUtcNotation(std)} (${year})`);
    }
  }
  check(`every half/quarter-hour standard time since 1868 is offered (${scanned} zone-years)`,
    scanned > 0 && gaps.size === 0, scanned === 0 ? 'empty set' : [...gaps.values()].slice(0, 6).join('; '));

  // The header's other claim: every whole hour the UTC picker spans from −11 to
  // +14 has a named zone in use today (−12 has no inhabited zone to name).
  const hours = Array.from({ length: 26 }, (_, i) => i - 11);
  every('every whole hour from −11 to +14 has a named zone in use today', hours, (h) =>
    STANDARD_ZONES.some((z) => z.std === h * H && zoneInUse(z, MODERN_YEAR)) ? null : `${formatUtcNotation(h * H)} unnamed`,
  );

  // A daylight abbreviation names the correction the zone really keeps: in a
  // year where its representative zone changes clocks, the summer step must be
  // what dstCode (default +1 h) adds. Lord Howe's LHDT is +0:30, and was once
  // put on a +1 h reading (2026-10-02, found in review).
  const seasonal = STANDARD_ZONES.filter((z) => {
    const jan = tzdbOffset(z.iana, MODERN_YEAR, 1);
    const jul = tzdbOffset(z.iana, MODERN_YEAR, 7);
    return z.dstAbbr && jan != null && jul != null && jan !== jul;
  });
  every('each daylight abbreviation names the zone’s own summer step', seasonal, (z) => {
    const step = Math.abs(tzdbOffset(z.iana, MODERN_YEAR, 1)! - tzdbOffset(z.iana, MODERN_YEAR, 7)!);
    const named = daylightSeconds(z.dstCode ?? 'daylight');
    return step === named ? null : `${z.id} ${z.dstAbbr}: tz step ${step} s, named ${named} s`;
  });
}

console.log('\n── 1b. TWO PARTS AGREE: the daylight codes are the exchange-format reader’s ──');

{
  every('each daylight option adds what the reader’s table adds', DAYLIGHT_OPTIONS, (o) =>
    DAYLIGHT_CORRECTION[o.aaf] === o.seconds ? null : `${o.code}: ${o.seconds} vs ${DAYLIGHT_CORRECTION[o.aaf]}`,
  );
  // Every code the reader knows lands somewhere in the form: a daylight option of
  // the same size, or the exact-offset path for its mean-time code.
  every('every time-type code the reader knows maps to a form choice', Object.keys(DAYLIGHT_CORRECTION), (k) => {
    const mapped = daylightFromAaf(k);
    if (mapped == null) return `${k}: unmapped`;
    const sec = mapped === 'lmt' ? 0 : daylightSeconds(mapped);
    return sec === DAYLIGHT_CORRECTION[k] ? null : `${k}: form ${sec} vs reader ${DAYLIGHT_CORRECTION[k]}`;
  });

  // The reader's arithmetic and the form's, on the same record: a synthetic
  // exchange record per code, read by the REAL reader, must land on the offset
  // the form resolves the same terms to.
  const codes = Object.keys(DAYLIGHT_CORRECTION);
  every('reader offset = form resolution for each code (std 5h W)', codes, (code) => {
    const text = `#A93:Code,${code},m,15.1.1950,12:00,Testville,XX\n#B93:*,40n00,75w00,5hw00,${code}\n`;
    const chart = readAaf(text)[0]?.chart;
    if (!chart) return `${code}: reader made no record`;
    const mapped = daylightFromAaf(code);
    const form =
      mapped === 'lmt'
        ? -5 * H
        : mapped == null
          ? NaN
          : entrySeconds({ mode: 'standard', std: -5 * H, daylight: mapped });
    return chart.offsetSeconds === form ? null : `${code}: reader ${chart.offsetSeconds} vs form ${form}`;
  });
}

// ── 2. INTERNAL IDENTITY: format then parse, resolve then reopen ────────────

console.log('\n── 2. INTERNAL IDENTITY: both notations read back to the second ──');

{
  const grid: number[] = [];
  for (let h = 0; h <= 15; h++) {
    for (const m of [0, 1, 15, 30, 45, 59]) {
      for (const s of [0, 2, 59]) {
        const mag = h * H + m * 60 + s;
        if (mag > 15 * H) continue;
        grid.push(mag);
        if (mag) grid.push(-mag);
      }
    }
  }
  every('parse(formatUtcNotation(x)) = x', grid, (x) => {
    const p = parseZoneOffset(formatUtcNotation(x));
    return p && p.explicit && p.seconds === x ? null : `${x} → ${formatUtcNotation(x)} → ${p?.seconds}`;
  });
  every('parse(formatUtcNotation(x, padded)) = x', grid, (x) => {
    const p = parseZoneOffset(formatUtcNotation(x, { padded: true }));
    return p && p.explicit && p.seconds === x ? null : `${x} → ${formatUtcNotation(x, { padded: true })} → ${p?.seconds}`;
  });
  every('parse(formatAstroNotation(x)) = x', grid, (x) => {
    const p = parseZoneOffset(formatAstroNotation(x));
    return p && p.explicit && p.seconds === x ? null : `${x} → ${formatAstroNotation(x)} → ${p?.seconds}`;
  });
}

console.log('\n── 2b. INTERNAL IDENTITY: an entry survives the form, the record and the link ──');

const yonkers1941: ZoneMoment = { lat: 40.9312, lng: -73.8988, year: 1941, month: 6, day: 5, hour: 9, minute: 30 };

{
  const entries: TzEntry[] = [
    { mode: 'standard', std: -5 * H, daylight: 'daylight', zone: 'est' },
    { mode: 'standard', std: 0, daylight: 'double', zone: 'gmt' },
    { mode: 'standard', std: 21600, daylight: 'standard' },
    { mode: 'offset', seconds: -17762, basis: 'lmt', text: '4:56:02 W' },
    { mode: 'offset', seconds: 0, basis: 'ut', text: 'UT' },
    { mode: 'offset', seconds: 19800, text: '5:30' },
    { mode: 'offset', seconds: -9000 },
  ];
  every('sanitize keeps a well-formed entry as it is', entries, (e) =>
    same(sanitizeTzEntry(e), e) ? null : `${JSON.stringify(e)} → ${JSON.stringify(sanitizeTzEntry(e))}`,
  );
  // Form → record → editor: what the form saves for an entry reopens as that
  // entry, and resolves to the same offset again.
  every('resolve → save → reopen returns the same entry, same offset', entries, (e) => {
    const r = resolveZoneChoice(e, yonkers1941);
    if (r.seconds !== entrySeconds(e)) return `${JSON.stringify(e)}: resolved ${r.seconds}`;
    const re = reopenZoneChoice({ tzOffset: r.tzOffset, tzIana: r.tzIana, tzManual: r.tzManual, tzEntry: r.tzEntry }, yonkers1941);
    return re.fellBack || !same(re.choice, e) ? `${JSON.stringify(e)} reopened as ${JSON.stringify(re.choice)}` : null;
  });
  // The share link carries the entry, and drops only the entry when it does not
  // add up to the link's offset.
  const base: StoredChart = {
    id: 'v', createdAt: 0, name: 'Share Test', year: 1941, month: 6, day: 5, hour: 9, minute: 30,
    tzOffset: -4, tzIana: 'America/New_York',
    birthplace: { label: 'Yonkers', lat: 40.9312, lng: -73.8988 },
  };
  every('a share link round-trips the entry', entries, (e) => {
    const chart = { ...base, tzOffset: entrySeconds(e) / H, tzEntry: e };
    const back = decodeShareState(encodeShareState({ chart }))?.chart;
    return back && same(back.tzEntry, e) && back.tzOffset === chart.tzOffset ? null : `${JSON.stringify(e)} → ${JSON.stringify(back?.tzEntry)}`;
  });
  const tampered = decodeShareState(
    encodeShareState({ chart: { ...base, tzEntry: { mode: 'standard', std: -5 * H, daylight: 'standard' } } }),
  )?.chart;
  check('a link whose entry contradicts its offset keeps the offset and drops the entry',
    !!tampered && tampered.tzOffset === -4 && tampered.tzEntry === undefined, JSON.stringify(tampered?.tzEntry));
  const legacy = decodeShareState(encodeShareState({ chart: base }))?.chart;
  check('a link with no entry decodes as it always did',
    !!legacy && legacy.tzEntry === undefined && legacy.tzOffset === -4 && legacy.tzIana === 'America/New_York');
  // The link's bound is the form's (±15 h), not today's zones' ±14: a stated
  // Chatham + double summer time is +14:45, and its link used to fail whole.
  const wide: TzEntry[] = [
    { mode: 'standard', std: 45900, daylight: 'double', zone: 'chatham' },
    { mode: 'offset', seconds: -15 * H, text: '15hw00' },
  ];
  every('a link whose offset is past ±14 h still opens', wide, (e) => {
    const back = decodeShareState(encodeShareState({ chart: { ...base, tzOffset: entrySeconds(e) / H, tzEntry: e } }))?.chart;
    return back && back.tzOffset === entrySeconds(e) / H && same(back.tzEntry, e) ? null : `${JSON.stringify(e)} → ${JSON.stringify(back)}`;
  });
}

console.log('\n── 2c. INTERNAL IDENTITY: a preselection resolves to the detected offset ──');

{
  // Over every zone the catalogue names, at a winter and a summer moment in a
  // spread of years: whenever Standard + Daylight preselects something, its terms
  // add up to exactly what Auto detected. (Labels can be argued; numbers cannot.)
  const zones = [...new Set(STANDARD_ZONES.flatMap((z) => [z.iana, ...(z.members ?? [])]))];
  const samples: { iana: string; year: number; month: number }[] = [];
  for (const iana of zones) {
    for (const year of [1900, 1925, 1941, 1943, 1955, 1970, 1990, 2010, 2025]) {
      for (const month of [1, 7]) samples.push({ iana, year, month });
    }
  }
  const proposals: { iana: string; year: number; month: number; detected: number; got: number }[] = [];
  for (const { iana, year, month } of samples) {
    const info = resolveZoneInfo(iana, year, month, 15, 12, 0);
    const p = proposeStandardEntry(info, { year, month, day: 15, hour: 12, minute: 0 });
    if (p) proposals.push({ iana, year, month, detected: Math.round(info.offsetHours * H), got: entrySeconds(p.entry) });
  }
  every('every preselection adds up to the detected offset', proposals, (x) =>
    x.got === x.detected ? null : `${x.iana} ${x.year}-${x.month}: ${x.got} vs ${x.detected}`,
  );
  console.log(`      (${proposals.length} preselections out of ${samples.length} zone-moments)`);
}

console.log('\n── 2d. TWO PARTS AGREE: a preselection names the season the tz database names ──');

{
  // Adding up is not enough: Istanbul's July 2000 summed to +3 as "Turkey +
  // standard" while the tz database called it Eastern European Summer Time
  // (found in review, 2026-10-02). Here the proposal is asked against the tz
  // database's OWN season names, over every zone and year the catalogue lists:
  //  - a moment it names summer/daylight time is never proposed as standard;
  //  - in a year where one season is named standard time and the other is
  //    later in the year's offsets, a summer proposal's standard is that one.
  const longName = (iana: string, year: number, month: number) =>
    DateTime.fromObject({ year, month, day: 15, hour: 12 }, { zone: iana }).setLocale('en-US').offsetNameLong ?? '';
  const summerName = (n: string) => /daylight|summer|war/i.test(n);
  const standardName = (n: string) => !!n && !summerName(n) && !/^GMT([+\-−]|$)/.test(n);
  const zones = [...new Set(STANDARD_ZONES.flatMap((z) => [z.iana, ...(z.members ?? [])]))];
  const named: { iana: string; year: number; month: number; got: string; why: string | null }[] = [];
  for (const iana of zones) {
    for (let year = 1970; year <= MODERN_YEAR; year += 3) {
      const jan = tzdbOffset(iana, year, 1);
      const jul = tzdbOffset(iana, year, 7);
      if (jan == null || jul == null) continue;
      for (const month of [1, 7]) {
        const n = longName(iana, year, month);
        const info = resolveZoneInfo(iana, year, month, 15, 12, 0);
        const p = proposeStandardEntry(info, { year, month, day: 15, hour: 12, minute: 0 });
        if (!p) continue;
        const got = `${p.zone.id}/${p.daylight}`;
        let why: string | null = null;
        if (summerName(n) && p.daylight === 'standard') why = `"${n}" proposed as standard`;
        const other = month === 1 ? 7 : 1;
        const otherName = longName(iana, year, other);
        const otherOffset = other === 1 ? jan : jul;
        const offset = month === 1 ? jan : jul;
        if (!why && p.daylight !== 'standard' && standardName(otherName) && otherOffset < offset && p.zone.std !== otherOffset) {
          why = `named standard is ${formatUtcNotation(otherOffset)} ("${otherName}"), proposal ${formatUtcNotation(p.zone.std)}`;
        }
        named.push({ iana, year, month, got, why });
      }
    }
  }
  every('a proposal never contradicts the season the tz database names', named, (x) =>
    x.why ? `${x.iana} ${x.year}-${x.month} ${x.got}: ${x.why}` : null,
  );
}

// ── 3. GOLDEN: what sources print, to the second ────────────────────────────

console.log('\n── 3. GOLDEN: source notations read to the second ──');

{
  const accept: [string, number, boolean][] = [
    ['5hw00', -5 * H, true],          // exchange format
    ['1he00', H, true],
    ['6hw18:56', -(6 * H + 18 * 60 + 56), true],
    ['5hw', -5 * H, true],
    ['h5w', -5 * H, true],            // hours-first letter form
    ['h5:30e', 19800, true],
    ['5W00', -5 * H, true],
    ['5w30', -(5 * H + 1800), true],
    ['-05:00', -5 * H, true],
    ['+5:30', 19800, true],
    ['+0530', 19800, true],
    ['4:56:02 W', -17762, true],
    ['W 5', -5 * H, true],
    ['5h30m E', 19800, true],
    ['4h56m02s W', -17762, true],
    ['12h45m E', 45900, true],
    ['UTC−4:56:02', -17762, true],
    ['UTC−05:00', -5 * H, true],
    ['UTC+5:45', 20700, true],
    ['GMT+1', H, true],
    ['EDT -4:00', -4 * H, true],      // an abbreviation ahead of the offset
    ['UT', 0, true],
    ['utc', 0, true],
    ['0h', 0, true],
    ['5:30', 19800, false],           // direction left to the East/West control
    ['0530', 19800, false],
    ['5', 5 * H, false],
  ];
  for (const [text, want, explicit] of accept) {
    const p = parseZoneOffset(text);
    check(`  ${JSON.stringify(text)} → ${want} s${explicit ? '' : ' (direction asked)'}`,
      !!p && p.seconds === want && p.explicit === explicit, p ? `${p.seconds}, explicit ${p.explicit}` : 'refused');
  }
  check('  an undirected 5:30 under West is −5:30',
    applyOffsetDirection(parseZoneOffset('5:30')!, 'west') === -19800);
  check('  a signed +5:30 ignores the West control',
    applyOffsetDirection(parseZoneOffset('+5:30')!, 'west') === 19800);

  const refuse: [string, string][] = [
    ['5.5', 'a decimal: hours, or five thirty?'],
    ['5.30', 'a decimal'],
    ['-5w', 'a sign and a direction letter'],
    ['5e30w', 'two direction letters'],
    ['5hw185', 'three trailing digits'],
    ['4:60', 'sixty minutes'],
    ['15:01', 'past the importer’s fifteen hours'],
    ['25', 'not an offset'],
    ['EST', 'an abbreviation alone — EST is not one zone'],
    ['abc', 'not a number'],
    ['', 'empty'],
  ];
  for (const [text, why] of refuse) {
    check(`  refuses ${JSON.stringify(text)}`, parseZoneOffset(text) === null, why);
  }
}

console.log('\n── 3b. GOLDEN: standard + daylight, and the form’s stored fields ──');

{
  const kolkata: ZoneMoment = { lat: 22.5726, lng: 88.3639, year: 1990, month: 3, day: 1, hour: 12, minute: 0 };
  const cases: [string, TzEntry, number, ZoneMoment][] = [
    ['EST + daylight = UTC−4', { mode: 'standard', std: -5 * H, daylight: 'daylight', zone: 'est' }, -4 * H, yonkers1941],
    ['GMT + double summer (Britain 1941) = UTC+2', { mode: 'standard', std: 0, daylight: 'double', zone: 'gmt' }, 2 * H,
      { lat: 51.5074, lng: -0.1278, year: 1941, month: 7, day: 1, hour: 12, minute: 0 }],
    ['India Standard = UTC+5:30', { mode: 'standard', std: 19800, daylight: 'standard', zone: 'india' }, 19800, kolkata],
    ['Nepal = UTC+5:45', { mode: 'standard', std: 20700, daylight: 'standard', zone: 'nepal' }, 20700,
      { lat: 27.7172, lng: 85.324, year: 1990, month: 3, day: 1, hour: 12, minute: 0 }],
    ['Newfoundland + daylight = UTC−2:30', { mode: 'standard', std: -12600, daylight: 'daylight', zone: 'nst' }, -9000,
      { lat: 47.5615, lng: -52.7126, year: 1990, month: 7, day: 1, hour: 12, minute: 0 }],
    ['Chatham Standard = UTC+12:45', { mode: 'standard', std: 45900, daylight: 'standard', zone: 'chatham' }, 45900,
      { lat: -43.9535, lng: -176.5597, year: 1990, month: 7, day: 1, hour: 12, minute: 0 }],
    ['Lord Howe + half hour = UTC+11', { mode: 'standard', std: 37800, daylight: 'half', zone: 'lord-howe' }, 11 * H,
      { lat: -31.5553, lng: 159.0821, year: 1990, month: 1, day: 1, hour: 12, minute: 0 }],
    ['EST + war time = UTC−4', { mode: 'standard', std: -5 * H, daylight: 'war', zone: 'est' }, -4 * H,
      { ...yonkers1941, year: 1943, month: 1 }],
  ];
  every('each entry resolves to its offset, stated and certain', cases, ([label, entry, want, at]) => {
    const r = resolveZoneChoice(entry, at);
    if (r.seconds !== want || Math.round(r.tzOffset * H) !== want) return `${label}: ${r.seconds}`;
    if (!same(r.tzEntry, entry)) return `${label}: entry not recorded`;
    if (r.tzUncertain || !r.tzManual) return `${label}: flags ${r.tzUncertain}/${r.tzManual}`;
    return null;
  });
  every('each named zone in the cases exists with that offset', cases, ([label, entry]) =>
    entry.mode === 'standard' && entry.zone && standardZoneById(entry.zone)?.std !== entry.std ? `${label}: catalogue disagrees` : null,
  );
  check('  UTC−5 is written 5h W (the sign flip)', formatBothNotations(-5 * H) === 'UTC−5 · 5h W', formatBothNotations(-5 * H));
  check('  UTC+5:30 is written 5h30m E', formatBothNotations(19800) === 'UTC+5:30 · 5h30m E', formatBothNotations(19800));
  check('  UTC−4:56:02 is written 4h56m02s W', formatBothNotations(-17762) === 'UTC−4:56:02 · 4h56m02s W', formatBothNotations(-17762));
  check('  padded form', formatUtcNotation(-5 * H, { padded: true }) === 'UTC−05:00');
}

console.log('\n── 3c. GOLDEN: local mean time of a longitude, to the second ──');

{
  const lmt: [string, number, number][] = [
    ['New York 74°00′23″ W', -(74 + 23 / 3600), -17762],  // 4h56m02s W
    ['Ulm 9.9876° E (the import fixture’s +0:39:57)', 9.9876, 2397],
    ['Greenwich', 0, 0],
    ['15° E', 15, H],
    ['180° W', -180, -12 * H],
    ['Kathmandu 85.324° E', 85.324, 20478],               // 5h41m18s E
  ];
  every('longitude / 15 to the second', lmt, ([label, lng, want]) =>
    lmtOffsetSeconds(lng) === want ? null : `${label}: ${lmtOffsetSeconds(lng)} vs ${want}`,
  );
  const r = resolveZoneChoice({ mode: 'offset', seconds: lmtOffsetSeconds(-73.8988), basis: 'lmt' }, yonkers1941);
  check('  an LMT entry is stated, flagged as mean time, not uncertain', r.lmt && !r.tzUncertain && r.tzManual);
}

console.log('\n── 3c′. TWO PARTS AGREE: the one-click mean time is the one detection uses ──');

{
  // The form's "birthplace LMT" and Auto's mean-time era are two parts asked
  // the same question. Across the date line they disagreed by a whole day —
  // Sitka 1860 one-click UTC−9:01:19 against Auto's UTC+14:58:41 (2026-10-02,
  // found in review). Within a second (Auto's is longitude / 15 unrounded).
  const births: [string, ZoneMoment][] = [
    ['Ulm 1879', { lat: 48.4011, lng: 9.9876, year: 1879, month: 3, day: 14, hour: 10, minute: 30 }],
    ['New York 1870', { lat: 40.7128, lng: -74.006, year: 1870, month: 6, day: 1, hour: 12, minute: 0 }],
    ['Sitka 1860 (Russian calendar)', { lat: 57.0531, lng: -135.33, year: 1860, month: 6, day: 1, hour: 12, minute: 0 }],
    ['Apia 1880', { lat: -13.8333, lng: -171.7667, year: 1880, month: 6, day: 1, hour: 12, minute: 0 }],
  ];
  every('one-click LMT = Auto’s LMT', births, ([label, at]) => {
    const auto = resolveBirthTimezone(at.lat, at.lng, at.year, at.month, at.day, at.hour, at.minute);
    if (!auto.lmt) return `${label}: Auto is not in its mean-time era`;
    const one = birthplaceLmtSeconds(at);
    return Math.abs(one - auto.offsetHours * H) <= 1 ? null : `${label}: ${formatUtcNotation(one)} vs Auto ${formatUtcNotation(auto.offsetHours * H)}`;
  });
  const manila: ZoneMoment = { lat: 14.5995, lng: 120.9842, year: 1840, month: 6, day: 1, hour: 12, minute: 0 };
  check('  Manila 1840’s mean time on its calendar is past what an offset can state',
    Math.abs(birthplaceLmtSeconds(manila)) > MAX_ZONE_OFFSET_SECONDS, formatUtcNotation(birthplaceLmtSeconds(manila)));
}

console.log('\n── 3d. GOLDEN: the confirmation line’s UT ──');

{
  const ut: [string, ReturnType<typeof localToUt>, string][] = [
    ['14:30 at UTC−4', localToUt(14, 30, -4 * H), '18:30:00 +0'],
    ['22:00 at UTC−5', localToUt(22, 0, -5 * H), '03:00:00 +1'],
    ['01:00 at UTC+5:30', localToUt(1, 0, 19800), '19:30:00 -1'],
    ['14:30 at 4h56m02s W', localToUt(14, 30, -17762), '19:26:02 +0'],
  ];
  every('local time to UT', ut, ([label, r, want]) => {
    const got = `${String(r.hour).padStart(2, '0')}:${String(r.minute).padStart(2, '0')}:${String(r.second).padStart(2, '0')} ${r.dayShift >= 0 ? '+' : ''}${r.dayShift}`;
    return got === want ? null : `${label}: ${got}`;
  });
}

console.log('\n── 3e. GOLDEN: preselecting from the detected zone ──');

{
  type Case = [string, string, [number, number, number], string | null, DaylightCode | null];
  const cases: Case[] = [
    ['New York, July 2000', 'America/New_York', [2000, 7, 1], 'est', 'daylight'],
    ['New York, January 2000', 'America/New_York', [2000, 1, 15], 'est', 'standard'],
    ['New York, January 1943 (war time, all year)', 'America/New_York', [1943, 1, 15], 'est', 'daylight'],
    ['London, July 1941 (double summer)', 'Europe/London', [1941, 7, 1], 'gmt', 'double'],
    ['London, January 1941 (summer time all winter)', 'Europe/London', [1941, 1, 15], 'gmt', 'daylight'],
    ['Kolkata 2000', 'Asia/Kolkata', [2000, 3, 1], 'india', 'standard'],
    ['Kolkata, by its legacy id', 'Asia/Calcutta', [2000, 3, 1], 'india', 'standard'],
    ['Kathmandu 2000', 'Asia/Kathmandu', [2000, 3, 1], 'nepal', 'standard'],
    ['Chatham, January 2025', 'Pacific/Chatham', [2025, 1, 15], 'chatham', 'daylight'],
    ['Lord Howe, January 2025', 'Australia/Lord_Howe', [2025, 1, 15], 'lord-howe', 'half'],
    ['St John’s, July 2025', 'America/St_Johns', [2025, 7, 1], 'nst', 'daylight'],
    ['Honolulu 1943 (war time on the old −10:30)', 'Pacific/Honolulu', [1943, 7, 1], 'hst-1896', 'daylight'],
    ['Honolulu 1960', 'Pacific/Honolulu', [1960, 7, 1], 'hst', 'standard'],
    ['Auckland, January 1935 (NZMT + half hour)', 'Pacific/Auckland', [1935, 1, 15], 'nzmt', 'half'],
    ['Seoul, July 1958', 'Asia/Seoul', [1958, 7, 1], 'korea-1954', 'daylight'],
    ['Moscow 2012 (+4 was standard): no guess', 'Europe/Moscow', [2012, 1, 15], null, null],
    ['Almaty 2000 (+6 was standard): no guess', 'Asia/Almaty', [2000, 1, 15], null, null],
    ['Bishkek: not named here, no neighbour’s name', 'Asia/Bishkek', [2000, 1, 15], null, null],
    // Found in review, 2026-10-02: each of these used to name a zone whose
    // standard time was another era's, because the sum came out right.
    ['Istanbul, July 2000 (EET + daylight; TRT only from 2016)', 'Europe/Istanbul', [2000, 7, 15], null, null],
    ['Cancún, July 2000 (CST + daylight; EST only from 2015)', 'America/Cancun', [2000, 7, 15], null, null],
    ['Lisbon, July 1994 (CET + daylight, not WET + double)', 'Europe/Lisbon', [1994, 7, 15], null, null],
    ['Kyiv, July 1985 (Moscow summer time, not EET + double)', 'Europe/Kyiv', [1985, 7, 15], null, null],
    ['Whitehorse, July 2010 (PDT, not MST)', 'America/Whitehorse', [2010, 7, 15], null, null],
    ['Istanbul 2020 (+3 is standard now)', 'Europe/Istanbul', [2020, 7, 15], 'turkey', 'standard'],
    ['Dublin, July 2025 (Irish summer: GMT + 1 h, whatever its legal name)', 'Europe/Dublin', [2025, 7, 15], 'gmt', 'daylight'],
    ['Berlin, July 1945 (midsummer time on CET)', 'Europe/Berlin', [1945, 7, 15], 'cet', 'double'],
    ['Tokyo, July 1950 (summer time on JST)', 'Asia/Tokyo', [1950, 7, 15], 'japan', 'daylight'],
    ['São Paulo, January 2000 (southern summer)', 'America/Sao_Paulo', [2000, 1, 15], 'brasilia', 'daylight'],
    ['Kolkata 1945 (war time, no names in the data)', 'Asia/Kolkata', [1945, 1, 15], 'india', 'daylight'],
  ];
  every('preselection', cases, ([label, iana, [y, m, d], zone, daylight]) => {
    const info = resolveZoneInfo(iana, y, m, d, 12, 0);
    const p = proposeStandardEntry(info, { year: y, month: m, day: d, hour: 12, minute: 0 });
    const got = p ? `${p.zone.id}/${p.daylight}` : 'none';
    const want = zone ? `${zone}/${daylight}` : 'none';
    return got === want ? null : `${label}: ${got}, wanted ${want}`;
  });
  const ulm = resolveBirthTimezone(48.4011, 9.9876, 1879, 3, 14, 10, 30);
  check('  a mean-time birth gets no standard-zone preselection',
    ulm.lmt && proposeStandardEntry(ulm, { year: 1879, month: 3, day: 14, hour: 10, minute: 30 }) === null);
}

console.log('\n── 3f. GOLDEN: the IANA search finds a zone by the abbreviation sources print ──');

{
  // The browser's English short names are bare "GMT+5:30" outside North
  // America, so "IST" found Istanbul and not Kolkata (found in review,
  // 2026-10-02). The catalogue's abbreviations, and Britain's and Ireland's
  // summer names, are search terms now.
  const terms: [string, string][] = [
    ['Asia/Kolkata', 'IST'], ['Asia/Calcutta', 'IST'], ['Asia/Jerusalem', 'IST'], ['Europe/Dublin', 'IST'],
    ['Europe/London', 'BST'], ['Asia/Dhaka', 'BST'], ['Asia/Seoul', 'KST'], ['Europe/Moscow', 'MSK'],
    ['Europe/Paris', 'CET'], ['Europe/Paris', 'CEST'], ['Asia/Tokyo', 'JST'], ['Australia/Sydney', 'AEST'],
    ['Africa/Johannesburg', 'SAST'], ['Asia/Karachi', 'PKT'], ['Asia/Jakarta', 'WIB'], ['America/New_York', 'EDT'],
  ];
  every('a zone is found by its abbreviation', terms, ([iana, abbr]) =>
    zoneSearchTerms(iana).includes(abbr) ? null : `${iana}: no ${abbr} in ${JSON.stringify(zoneSearchTerms(iana))}`,
  );
}

// ── 4. TWO PARTS AGREE: the importer and the form ───────────────────────────

console.log('\n── 4. TWO PARTS AGREE: an imported chart reopens in its record’s terms ──');

function aafCharts(text: string, controls: ImportControls = DEFAULT_CONTROLS): StoredChart[] {
  return chartsFrom(parseImport(sourceFromText(text), { controls }));
}

function atOf(c: StoredChart): ZoneMoment {
  return { lat: c.birthplace.lat, lng: c.birthplace.lng, year: c.year, month: c.month, day: c.day, hour: c.hour, minute: c.minute };
}

{
  const b = readFileSync(resolve(FIXTURES, 'f01-lewis.aaf'));
  const report = parseImport(sourceFromBytes(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer));
  const row = report.rows[0];
  const [lewis] = chartsFrom(report);
  check('F01 exchange record reopens as EST + daylight',
    !!lewis && same(lewis.tzEntry, { mode: 'standard', std: -5 * H, daylight: 'daylight', zone: 'est' }),
    JSON.stringify(lewis?.tzEntry));
  check('F01 its tzOffset is the file’s, unchanged (−4)',
    !!lewis && !!row?.chart && lewis.tzOffset === row.chart.offsetSeconds / H && lewis.tzOffset === -4, String(lewis?.tzOffset));
  if (lewis) {
    const re = reopenZoneChoice(lewis, atOf(lewis));
    check('F01 the editor reopens on the entry, not a fallback', !re.fellBack && same(re.choice, lewis.tzEntry));
    const saved = resolveZoneChoice(re.choice, atOf(lewis));
    check('F01 saving it again from the form stores the same offset', saved.tzOffset === lewis.tzOffset,
      `${saved.tzOffset} vs ${lewis.tzOffset}`);
  }

  // Synthetic records, one per kind of statement. Each: what tzEntry the chart
  // gets, and that tzOffset is exactly the reader's offset / 3600.
  const rec = (date: string, time: string, lat: string, lng: string, off: string, type: string, znam = '') =>
    `#A93:Case,${type || 'blank'},m,${date},${time},Testville,XX\n#B93:*,${lat},${lng},${off},${type}\n${znam ? `#ZNAM:${znam}\n` : ''}`;
  type Synth = [string, string, TzEntry | undefined];
  const synth: Synth[] = [
    ['mean time (L) keeps the offset and the source’s notation',
      rec('14.3.1879', '10:50', '40n43', '74w00', '4hw56:02', 'L'),
      { mode: 'offset', seconds: -17762, basis: 'lmt', text: '4hw56:02' }],
    ['standard time (0), New York winter',
      rec('15.1.1950', '12:00', '40n43', '74w00', '5hw00', '0'),
      { mode: 'standard', std: -5 * H, daylight: 'standard', zone: 'est' }],
    ['double summer time (2), London 1941',
      rec('1.7.1941', '12:00', '51n30', '0w07', '0he00', '2'),
      { mode: 'standard', std: 0, daylight: 'double', zone: 'gmt' }],
    ['half-hour daylight (h), Auckland 1935',
      rec('15.1.1935', '12:00', '36s51', '174e46', '11he30', 'h'),
      { mode: 'standard', std: 41400, daylight: 'half', zone: 'nzmt' }],
    ['war time (w), New York 1943',
      rec('15.1.1943', '12:00', '40n43', '74w00', '5hw00', 'w'),
      { mode: 'standard', std: -5 * H, daylight: 'war', zone: 'est' }],
    ['special meridian (m) is standard',
      rec('15.1.1950', '12:00', '40n43', '74w00', '5hw00', 'm'),
      { mode: 'standard', std: -5 * H, daylight: 'standard', zone: 'est' }],
    ['an offset with no named zone here keeps its terms without a name',
      rec('15.1.2000', '12:00', '42n52', '74e36', '6he00', '0'),
      { mode: 'standard', std: 6 * H, daylight: 'standard' }],
    ['the record’s abbreviation names the zone when the place does not',
      rec('15.1.2000', '12:00', '0n00', '30w00', '5hw00', '0', 'EST'),
      { mode: 'standard', std: -5 * H, daylight: 'standard', zone: 'est' }],
    ['an unknown time-type code records nothing',
      rec('15.1.1950', '12:00', '40n43', '74w00', '5hw00', 'x'),
      undefined],
    ['an unreadable offset records nothing',
      rec('15.1.1950', '12:00', '40n43', '74w00', 'garbage', '0'),
      undefined],
  ];
  every('each record’s entry, and its tzOffset untouched', synth, ([label, text, want]) => {
    const r = parseImport(sourceFromText(text));
    const c = r.rows[0]?.chart;
    const [chart] = chartsFrom(r);
    if (!c || !chart) return `${label}: no chart`;
    if (chart.tzOffset !== c.offsetSeconds / H) return `${label}: tzOffset ${chart.tzOffset} vs ${c.offsetSeconds / H}`;
    if (!same(chart.tzEntry, want)) return `${label}: ${JSON.stringify(chart.tzEntry)}`;
    if (chart.tzEntry && entrySeconds(chart.tzEntry) !== c.offsetSeconds) return `${label}: entry does not add up`;
    if (!!chart.tzEntry !== !!chart.tzManual) return `${label}: tzManual ${chart.tzManual}`;
    return null;
  });

  // The batch control that swaps the file's offset for ours makes the file's
  // terms untrue of the chart — so they must not ride along.
  const disagree = rec('1.7.1950', '12:00', '40n43', '74w00', '5hw00', '0'); // file: EST; tz data: EDT
  const kept = aafCharts(disagree)[0];
  const swapped = aafCharts(disagree, { ...DEFAULT_CONTROLS, zonePreference: 'app' })[0];
  check('keeping the file’s offset keeps its terms', kept?.tzOffset === -5 && kept?.tzEntry?.mode === 'standard',
    `${kept?.tzOffset} ${JSON.stringify(kept?.tzEntry)}`);
  check('taking our zone data instead drops them', swapped?.tzOffset === -4 && swapped?.tzEntry === undefined,
    `${swapped?.tzOffset} ${JSON.stringify(swapped?.tzEntry)}`);

  // The terms are refused if they do not add up to the offset being stored.
  check('terms that do not add up are refused',
    entryFromStatedTerms({ standardSeconds: -5 * H, timeType: '1', token: '5hw00' }, -5 * H) === undefined);

  // Every other fixture: no terms to keep, so no entry, and tzOffset exactly as before.
  const others = ['f01-lewis.csv', 'f02-f06-zones.csv', 'f07-comma.csv', 'f08-cp1252.csv', 'f09-f10-edges.csv', 'f01-lewis.txt'];
  const rows = others.flatMap((name) => {
    const buf = readFileSync(resolve(FIXTURES, name));
    const source = sourceFromBytes(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    const mapping = source.shape.format === 'delimited' ? initialMapping(source) : undefined;
    const report = parseImport(source, { mapping });
    const charts = chartsFrom(report);
    const usable = report.rows.filter((r) => r.chart && !r.skipped && !r.issues.some((i) => i.severity === 'reject'));
    return charts.map((chart, i) => ({ name, chart, offsetSeconds: usable[i]?.chart?.offsetSeconds }));
  });
  every('non-exchange imports: no entry, tzOffset = file offset / 3600', rows, ({ name, chart, offsetSeconds }) =>
    chart.tzEntry === undefined && offsetSeconds != null && chart.tzOffset === offsetSeconds / H
      ? null
      : `${name}/${chart.name}: ${chart.tzOffset} ${JSON.stringify(chart.tzEntry)}`,
  );
}

// ── 5. INTERNAL IDENTITY: Auto and the IANA list resolve exactly as before ──
//
// A regression pin on the wrapper, not an outside agreement: resolveZoneChoice
// calls the same detection these checks compare it with, so a fault in
// detection itself passes here. Detection is checked against sources by
// verify:timechain (its goldens — Ulm 1879's +0:39:57 among them — fail on
// exactly such a fault). Relabelled 2026-10-02, found in review.

console.log('\n── 5. INTERNAL IDENTITY: the old ways in are unchanged ──');

{
  const places: ZoneMoment[] = [
    yonkers1941,
    { lat: 48.4011, lng: 9.9876, year: 1879, month: 3, day: 14, hour: 10, minute: 50 },   // Ulm, mean time
    { lat: 51.5074, lng: -0.1278, year: 1941, month: 7, day: 1, hour: 12, minute: 0 },    // double summer
    { lat: 27.7172, lng: 85.324, year: 1990, month: 6, day: 1, hour: 6, minute: 0 },      // Nepal +5:45
    { lat: -34.9285, lng: 138.6007, year: 1980, month: 7, day: 1, hour: 14, minute: 0 },  // Adelaide
    { lat: 10, lng: -150, year: 1910, month: 1, day: 1, hour: 0, minute: 0 },             // open sea, ship's time
  ];
  every('Auto = the birthplace detection the form always used', places, (at) => {
    const r = resolveZoneChoice({ mode: 'auto' }, at);
    const d = resolveBirthTimezone(at.lat, at.lng, at.year, at.month, at.day, at.hour, at.minute);
    return r.tzOffset === d.offsetHours && r.tzIana === d.iana && r.tzUncertain === d.uncertain && !r.tzManual && !r.tzEntry
      ? null : `${at.lat},${at.lng} ${at.year}: ${r.tzOffset} vs ${d.offsetHours}`;
  });
  every('picking the detected zone by name stays on the detected path', places, (at) => {
    const d = resolveBirthTimezone(at.lat, at.lng, at.year, at.month, at.day, at.hour, at.minute);
    const r = resolveZoneChoice({ mode: 'iana', zone: d.iana }, at);
    return r.tzOffset === d.offsetHours && r.tzManual ? null : `${d.iana} ${at.year}: ${r.tzOffset} vs ${d.offsetHours}`;
  });
  const kolkata = resolveZoneChoice({ mode: 'iana', zone: 'Asia/Kolkata' }, yonkers1941);
  check('an IANA zone other than the detected one resolves through the tz database',
    kolkata.tzOffset === 5.5 && kolkata.tzIana === 'Asia/Kolkata' && kolkata.tzManual && !kolkata.tzEntry);
  const utc = resolveZoneChoice({ mode: 'utc', hours: -5 }, yonkers1941);
  check('the whole-hour UTC picker writes the same Etc/GMT zone it always did',
    utc.tzOffset === -5 && utc.tzIana === 'Etc/GMT+5' && utc.tzManual && !utc.tzEntry, `${utc.tzOffset} ${utc.tzIana}`);
}

// Salvatore, 2026-10-02: a whole-hour UTC pick is a STATED offset, like the two
// other manual ways in, so it no longer carries "verify DST". The first check
// pins that the old flag really was there to remove (resolveZoneInfo still
// raises it for any pre-1970 Etc zone) — without it, the second could pass on a
// moment that was never flagged.
console.log('\n── 5a. GOLDEN: a whole-hour UTC pick is a stated offset (2026-10-02) ──');

{
  const raw = resolveZoneInfo('Etc/GMT+5', yonkers1941.year, yonkers1941.month, yonkers1941.day, yonkers1941.hour, yonkers1941.minute);
  check('  the tz lookup alone flags a 1941 Etc/GMT+5 as uncertain', raw.uncertain && !raw.lmt);
  const picked = resolveZoneChoice({ mode: 'utc', hours: -5 }, yonkers1941);
  check('  a pre-1970 Etc/GMT pick is stated: tzUncertain false', !picked.tzUncertain && picked.tzManual && picked.tzOffset === -5,
    `uncertain ${picked.tzUncertain}`);
  // At sea before 1920 detection gives the very Etc zone a pick names, with
  // ship's mean time — and a pick that took that detected path saved −10:08,
  // flagged, under a picker showing UTC−10 (found in review). The pick is the
  // hour picked: the first check pins that detection really does differ here.
  const atSea: ZoneMoment = { lat: 10, lng: -152, year: 1910, month: 1, day: 1, hour: 0, minute: 0 };
  const seaAuto = resolveZoneChoice({ mode: 'auto' }, atSea);
  check('  at sea in 1910 detection names Etc/GMT+10 with ship’s mean time',
    seaAuto.tzIana === 'Etc/GMT+10' && seaAuto.lmt && seaAuto.seconds !== -10 * H, `${seaAuto.tzIana} ${seaAuto.seconds}`);
  const sea = resolveZoneChoice({ mode: 'utc', hours: -10 }, atSea);
  check('  …and a pick of UTC−10 there saves exactly −10, unflagged',
    sea.tzIana === 'Etc/GMT+10' && sea.tzOffset === -10 && !sea.lmt && !sea.tzUncertain,
    `${sea.tzIana} ${sea.tzOffset} lmt ${sea.lmt} uncertain ${sea.tzUncertain}`);
  // The decision is the whole-hour picker's. A zone named from the IANA list is
  // a lookup in the tz database, and keeps its flag (the methods page says so).
  const named = resolveZoneChoice({ mode: 'iana', zone: 'Asia/Kolkata' }, yonkers1941);
  check('  an IANA zone named from the database keeps the lookup’s flag', named.tzUncertain === true,
    `uncertain ${named.tzUncertain}`);
}

console.log('\n── 5b. INTERNAL IDENTITY: a chart without the new field means what it meant ──');

{
  type Reopen = [string, Parameters<typeof reopenZoneChoice>[0], ZoneMoment | undefined, unknown, boolean];
  const cases: Reopen[] = [
    ['detected zone, not manual → Auto', { tzOffset: -4, tzIana: 'America/New_York' }, yonkers1941, { mode: 'auto' }, false],
    ['manual IANA zone → that zone', { tzOffset: 5.5, tzIana: 'Asia/Kolkata', tzManual: true }, yonkers1941,
      { mode: 'iana', zone: 'Asia/Kolkata' }, false],
    ['manual Etc/GMT+5 → the UTC picker at −5', { tzOffset: -5, tzIana: 'Etc/GMT+5', tzManual: true }, yonkers1941,
      { mode: 'utc', hours: -5 }, false],
    ['manual Etc/GMT → the UTC picker at 0', { tzOffset: 0, tzIana: 'Etc/GMT', tzManual: true }, yonkers1941,
      { mode: 'utc', hours: 0 }, false],
    ['no zone at all (the seed chart) → Auto', { tzOffset: -4 }, yonkers1941, { mode: 'auto' }, false],
    ['a stored offset Auto would no longer give → that offset, flagged', { tzOffset: -5, tzIana: 'America/New_York' },
      yonkers1941, { mode: 'offset', seconds: -18000 }, true],
    ['…but only when asked to check (no moment given)', { tzOffset: -5, tzIana: 'America/New_York' }, undefined,
      { mode: 'auto' }, false],
    ['an entry that contradicts tzOffset → tzOffset wins', { tzOffset: -4, tzEntry: { mode: 'standard', std: -18000, daylight: 'standard' } },
      yonkers1941, { mode: 'offset', seconds: -14400 }, true],
    ['an unreadable entry → tzOffset', { tzOffset: -4, tzEntry: { mode: 'nonsense' } }, yonkers1941,
      { mode: 'offset', seconds: -14400 }, true],
  ];
  every('reopen', cases, ([label, chart, at, want, fellBack]) => {
    const r = reopenZoneChoice(chart, at);
    return same(r.choice, want) && r.fellBack === fellBack ? null : `${label}: ${JSON.stringify(r)}`;
  });
}

// ── 6. The form's own state (BirthDataForm/zoneEntryModel.ts) ────────────────
//
// The same functions the chart form runs, driven step by step: what the field
// shows, and what saving writes. Each fault pinned here was found in review on
// 2026-10-02, after a manual Chrome session had passed every one of them.

console.log('\n── 6. TWO PARTS AGREE: a way only switched to follows the birth moment, as Auto does ──');

/** The form's zone field at a moment, with the controls a reader would use. */
function field(initial: StoredChart | null, at: ZoneMoment) {
  const opened = openZone(initial);
  let model = initialModel(opened, initial);
  let inputs: ZoneInputs = { initial, opened, at };
  return {
    get view() {
      return zoneView(model, inputs);
    },
    act(a: ZoneAction) {
      model = zoneReduce(model, a, zoneView(model, inputs), inputs);
      return this;
    },
    move(next: ZoneMoment) {
      inputs = { ...inputs, at: next };
      return this;
    },
  };
}
const autoAt = (at: ZoneMoment) => resolveZoneChoice({ mode: 'auto' }, at);
const chartAt = (at: ZoneMoment, zone: Partial<StoredChart>): StoredChart => ({
  id: 'f', createdAt: 0, name: 'Form', year: at.year, month: at.month, day: at.day, hour: at.hour, minute: at.minute,
  birthplace: { label: 'Here', lat: at.lat, lng: at.lng }, tzOffset: 0, ...zone,
});

{
  // New York July 1980, a way clicked and nothing chosen in it, then the date
  // and the birthplace corrected to London in January: each way must save what
  // Auto saves there (it used to keep New York's summer −4).
  const ny: ZoneMoment = { lat: 40.7128, lng: -74.006, year: 1980, month: 7, day: 4, hour: 14, minute: 30 };
  const london: ZoneMoment = { lat: 51.5074, lng: -0.1278, year: 1980, month: 1, day: 4, hour: 14, minute: 30 };
  const ways = ['standard', 'offset', 'iana', 'utc'] as const;
  every('a switched-to way saves what Auto saves after the place and date move', ways, (mode) => {
    const f = field(null, ny).act({ type: 'mode', mode });
    const before = f.view.toSave?.tzOffset;
    const after = f.move(london).view;
    if (before !== -4) return `${mode}: New York July saved ${before}`;
    if (after.mode !== mode || !after.seeded) return `${mode}: not on its own way, or not following (${after.mode})`;
    return after.toSave?.tzOffset === autoAt(london).tzOffset ? null : `${mode}: London January saved ${after.toSave?.tzOffset}`;
  });
  // The other half: once something is chosen inside the way, it is the
  // reader's statement, and a moved date must NOT move it.
  const chosen = field(null, ny).act({ type: 'mode', mode: 'standard' }).act({ type: 'daylight', code: 'daylight' });
  const moved = chosen.move({ ...ny, month: 1 }).view;
  check('  …but once something is chosen in it, a moved date leaves it as stated (EST + daylight stays −4)',
    moved.toSave?.tzOffset === -4 && !moved.seeded && autoAt({ ...ny, month: 1 }).tzOffset === -5,
    `${moved.toSave?.tzOffset}`);
}

console.log('\n── 6b. GOLDEN: a way only switched to keeps the lookup’s "verify DST" ──');

{
  // Mumbai 1943 and Tokyo 1950 are flagged by detection. Clicking a way states
  // nothing, so the flag stays — on the field and in what is saved (a click on
  // Offset used to clear it). Choosing something inside the way clears it.
  const mumbai: ZoneMoment = { lat: 19.076, lng: 72.8777, year: 1943, month: 8, day: 15, hour: 10, minute: 0 };
  const tokyo: ZoneMoment = { lat: 35.6762, lng: 139.6503, year: 1950, month: 7, day: 15, hour: 10, minute: 0 };
  const cases: [string, ZoneMoment, ZoneEntryMode][] = [
    ['Mumbai 1943 → Standard', mumbai, 'standard'],
    ['Mumbai 1943 → Offset', mumbai, 'offset'],
    ['Mumbai 1943 → IANA', mumbai, 'iana'],
    ['Tokyo 1950 → UTC', tokyo, 'utc'],
  ];
  every('switching ways keeps the flag', cases, ([label, at, mode]) => {
    if (!autoAt(at).tzUncertain) return `${label}: Auto is not flagged — nothing to keep`;
    const v = field(null, at).act({ type: 'mode', mode }).view;
    if (v.pending || !v.toSave) return `${label}: pending`;
    return v.flag && v.toSave.tzUncertain ? null : `${label}: flag ${v.flag}, saved ${v.toSave.tzUncertain}`;
  });
  const stated = field(null, tokyo).act({ type: 'mode', mode: 'utc' }).act({ type: 'utc', hours: 10 }).view;
  check('  …and a pick made inside the way is stated: no flag', !stated.flag && stated.toSave?.tzUncertain === false);
  const typed = field(null, mumbai).act({ type: 'mode', mode: 'offset' }).act({ type: 'type', text: '6h30m E' }).view;
  check('  …and so is an offset typed in', !typed.flag && typed.toSave?.tzUncertain === false && typed.toSave.tzOffset === 6.5);
}

console.log('\n── 6c. TWO PARTS AGREE: a saved chart nobody’s zone edit touched is written back as it was ──');

{
  // Each record below is moved against its live source — the zone data would
  // now give something else — and an untouched save (say, a rename) must keep
  // the record, while the record's own control still moves it. Both halves
  // are asked, so a check that compared nothing could not pass.
  type Kept = [string, StoredChart, ZoneEntryMode | null];
  const ny41 = yonkers1941;
  const kolkata1850: ZoneMoment = { lat: 22.5726, lng: 88.3639, year: 1850, month: 1, day: 1, hour: 12, minute: 0 };
  const records: Kept[] = [
    // Stored −5 under New York; Auto now gives −4. Flagged, not manual.
    ['a fell-back Auto chart', chartAt(ny41, { tzOffset: -5, tzIana: 'America/New_York', tzUncertain: true }), 'auto'],
    // Stored 5:53:28 under older LMT rules; Auto now gives 5:53:27.3 — inside
    // the reopen tolerance, so it reopens on Auto and used to drift on save.
    ['a legacy Auto chart a fraction of a second off', chartAt(kolkata1850, { tzOffset: 5.891111, tzIana: 'Asia/Kolkata', tzUncertain: true }), 'auto'],
    // Saved by the whole-hour picker when it still flagged pre-1970 picks.
    ['a legacy whole-hour pick, flagged under the old rule', chartAt(ny41, { tzOffset: -5, tzIana: 'Etc/GMT+5', tzManual: true, tzUncertain: true }), 'utc'],
    // A zone the reader picked whose data now gives another number.
    ['a fell-back IANA pick', chartAt(kolkata1850, { tzOffset: 4.5, tzIana: 'Asia/Karachi', tzManual: true, tzUncertain: true }), 'iana'],
  ];
  every('an untouched save writes the record’s five zone fields back verbatim', records, ([label, c]) => {
    const v = field(c, atOfChart(c)).view;
    const want = { tzOffset: c.tzOffset, tzIana: c.tzIana, tzManual: !!c.tzManual, tzUncertain: !!c.tzUncertain, tzEntry: undefined };
    if (!same(v.toSave, want)) return `${label}: ${JSON.stringify(v.toSave)}`;
    return v.flag === !!c.tzUncertain ? null : `${label}: the field shows flag ${v.flag}, saves ${c.tzUncertain}`;
  });
  every('…while the live source would have moved it', records, ([label, c]) => {
    const opened = openZone(c);
    const live = resolveZoneChoice(opened.fellBack ? (opened.was ?? opened.choice) : opened.choice, atOfChart(c));
    return live.tzOffset !== c.tzOffset || live.tzUncertain !== !!c.tzUncertain || live.tzManual !== !!c.tzManual
      ? null
      : `${label}: the live source agrees with the record — nothing was moved`;
  });
  every('…and stating a zone in the field still moves it', records, ([label, c]) => {
    const v = field(c, atOfChart(c)).act({ type: 'mode', mode: 'offset' }).act({ type: 'type', text: '+3' }).view;
    return v.toSave?.tzOffset === 3 && v.toSave.tzManual && !v.toSave.tzUncertain ? null : `${label}: ${JSON.stringify(v.toSave)}`;
  });
  // Looking at another way and coming back is not a statement: still verbatim.
  const looked = field(records[1][1], atOfChart(records[1][1]))
    .act({ type: 'mode', mode: 'offset' })
    .act({ type: 'mode', mode: 'auto' }).view;
  check('  switching to another way and back, choosing nothing, still writes the record back',
    looked.toSave?.tzOffset === records[1][1].tzOffset, `${looked.toSave?.tzOffset}`);
  // Reopening on the stored number names what it was saved in.
  const karachi = field(records[3][1], atOfChart(records[3][1])).view.kept;
  check('  a fell-back IANA pick is explained by its own zone, not by Auto',
    karachi?.was?.mode === 'iana' && karachi.was.zone === 'Asia/Karachi', JSON.stringify(karachi));
}

console.log('\n── 6d. GOLDEN: what holds a save ──');

{
  // Line Islands + double summer time would be UTC+16: not a zone. It used to
  // fall back to Auto silently and save that.
  const kiritimati: ZoneMoment = { lat: 1.8721, lng: -157.4278, year: 2000, month: 1, day: 15, hour: 12, minute: 0 };
  const line = field(null, kiritimati).act({ type: 'mode', mode: 'standard' });
  const seeded = line.view.choice;
  const over = line.act({ type: 'daylight', code: 'double' }).view;
  check('  Line Islands + double summer time holds the save',
    seeded.mode === 'standard' && seeded.zone === 'line-islands' && over.error === 'range' && over.toSave === null,
    `${JSON.stringify(seeded)} → ${over.error}`);
  // Manila 1840 keeps a mean time 15:56 west of UT on its calendar of the time:
  // Exact offset has nothing it can state, and the one-click LMT is unavailable.
  const manila: ZoneMoment = { lat: 14.5995, lng: 120.9842, year: 1840, month: 6, day: 1, hour: 12, minute: 0 };
  const m = field(null, manila).act({ type: 'mode', mode: 'offset' }).view;
  check('  an offset past ±15 h leaves Exact offset pending, LMT unavailable',
    m.pending && m.error === 'pending' && m.toSave === null && !m.lmtAvailable, `${m.pending} ${m.error} ${m.lmtAvailable}`);
  // A typed offset nobody can read, and Standard with nothing to preselect.
  const bad = field(null, yonkers1941).act({ type: 'mode', mode: 'offset' }).act({ type: 'type', text: '5.30' }).view;
  check('  an unreadable offset holds the save', bad.error === 'offset' && bad.toSave === null);
  const istanbul: ZoneMoment = { lat: 41.0082, lng: 28.9784, year: 2000, month: 7, day: 15, hour: 12, minute: 0 };
  const ist = field(null, istanbul).act({ type: 'mode', mode: 'standard' }).view;
  check('  Istanbul July 2000 → Standard waits for a choice rather than naming Turkey', ist.pending && ist.toSave === null,
    JSON.stringify(ist.choice));
  // The one-click LMT across the date line lands where Auto does.
  const sitka: ZoneMoment = { lat: 57.0531, lng: -135.33, year: 1860, month: 6, day: 1, hour: 12, minute: 0 };
  const s = field(null, sitka).act({ type: 'mode', mode: 'offset' }).act({ type: 'lmt' }).view;
  check('  Sitka 1860’s one-click LMT saves Auto’s mean time, to the second',
    !!s.toSave && Math.abs(s.toSave.tzOffset * H - autoAt(sitka).tzOffset * H) <= 1 && s.lmtShifted,
    `${s.toSave?.tzOffset} vs ${autoAt(sitka).tzOffset}`);
}

// ── 7. The form's one list (2026-10-05) ──────────────────────────────────────
//
// The field unfolds to one select whose entries each set a way and its zone in
// one step (`choose`). The five ways' controls are hidden, so the list is now
// the only way a reader states a zone, and a chart saved in the hidden terms
// must still come back as it was.

console.log('\n── 7. INTERNAL IDENTITY: the list’s rows are the catalogue’s arithmetic ──');

/** Every row the list can show, gathered over the years that reach them all. */
const ALL_PICK_ROWS: ZonePickRow[] = (() => {
  const years = [MODERN_YEAR, ...STANDARD_ZONES.flatMap((z) => (z.checkYear ? [z.checkYear] : []))];
  const m = new Map<string, ZonePickRow>();
  for (const y of years) for (const r of zonePickRows(y)) m.set(r.value, r);
  return [...m.values()];
})();
const nyJuly1980: ZoneMoment = { lat: 40.7128, lng: -74.006, year: 1980, month: 7, day: 4, hour: 14, minute: 30 };

{
  const standardRows = ALL_PICK_ROWS.filter((r) => !r.isDaylight);
  check('  every catalogue zone has its standard row',
    standardRows.length === STANDARD_ZONES.length, `${standardRows.length} of ${STANDARD_ZONES.length}`);
  every('a row gives its zone’s standard offset plus its correction', ALL_PICK_ROWS, (r) =>
    r.seconds === r.zone.std + daylightSeconds(r.daylight) ? null : `${r.value}: ${r.seconds}`);
  every('a daylight row exactly where the zone names its daylight time, with the zone’s own step', ALL_PICK_ROWS, (r) => {
    if (!r.isDaylight) return r.daylight === 'standard' ? null : `${r.value}: a standard row with ${r.daylight}`;
    if (!r.zone.dstName) return `${r.value}: a daylight row with no dstName`;
    return r.daylight === (r.zone.dstCode ?? 'daylight') ? null : `${r.value}: ${r.daylight}`;
  });
  every('every zone with a daylight abbreviation has a daylight row', STANDARD_ZONES.filter((z) => z.dstAbbr), (z) =>
    ALL_PICK_ROWS.some((r) => r.isDaylight && r.zone.id === z.id) ? null : z.id);
  const modern = zonePickRows(MODERN_YEAR);
  every('rows run west to east', modern.slice(1), (r) => {
    const prev = modern[modern.indexOf(r) - 1];
    return prev.seconds <= r.seconds ? null : `${prev.value} before ${r.value}`;
  });
  every('a year’s rows are the zones in use that year', modern, (r) =>
    zoneInUse(r.zone, MODERN_YEAR) ? null : `${r.value} offered in ${MODERN_YEAR}`);
  const kept = zonePickRows(1990, 'hst-1896:standard');
  check('  …except the row now selected, which stays wherever it falls',
    !zonePickRows(1990).some((r) => r.value === 'hst-1896:standard') && kept.some((r) => r.value === 'hst-1896:standard'));
}

console.log('\n── 7a. TWO PARTS AGREE: choosing a row saves what the row says ──');

{
  // The row's own arithmetic against the model's resolution of the same pick:
  // the offset saved, and the entry the select then shows.
  every('each row, chosen, saves its offset and shows itself as chosen', ALL_PICK_ROWS, (r) => {
    const pick = pickOfValue(r.value);
    if (!pick || typeof pick === 'string') return `${r.value}: reads as ${JSON.stringify(pick)}`;
    const v = field(null, nyJuly1980).act({ type: 'choose', pick }).view;
    if (!v.toSave) return `${r.value}: nothing to save (${v.error})`;
    if (Math.round(v.toSave.tzOffset * H) !== r.seconds) return `${r.value}: saved ${v.toSave.tzOffset}`;
    if (v.toSave.tzEntry?.mode !== 'standard' || !v.toSave.tzManual || v.toSave.tzUncertain) {
      return `${r.value}: ${JSON.stringify(v.toSave)}`;
    }
    return zonePickValue(v) === r.value ? null : `${r.value}: the select shows ${zonePickValue(v)}`;
  });
}

console.log('\n── 7b. GOLDEN: what the list gives ──');

{
  const byValue = (v: string) => ALL_PICK_ROWS.find((r) => r.value === v);
  const edt = byValue('est:daylight');
  check('  Eastern Daylight (EDT) is UTC−4', edt?.name === 'Eastern Daylight' && edt.abbr === 'EDT' && edt.seconds === -4 * H);
  const lhdt = byValue('lord-howe:half');
  check('  Lord Howe’s daylight row is its half hour, UTC+11', lhdt?.seconds === 11 * H && !byValue('lord-howe:daylight'));
  const bst = byValue('gmt:daylight');
  check('  GMT’s daylight row is British Summer Time, UTC+1, with no bare abbreviation',
    bst?.name === 'British Summer Time' && bst.seconds === H && bst.abbr === undefined);

  // New York, July 1980: EST + daylight stated, then the date moved to January.
  const f = field(null, nyJuly1980).act({ type: 'choose', pick: { zone: 'est', daylight: 'daylight' } });
  const v = f.view;
  check('  EDT chosen from Auto: no switch in between, saves −4 as stated terms',
    v.mode === 'standard' && !v.pending && v.toSave?.tzOffset === -4 && !v.flag &&
      same(v.toSave.tzEntry, { mode: 'standard', std: -5 * H, daylight: 'daylight', zone: 'est' }),
    JSON.stringify(v.toSave));
  check('  …and a moved date leaves it as stated', f.move({ ...nyJuly1980, month: 1 }).view.toSave?.tzOffset === -4);
  const back = field(null, nyJuly1980)
    .act({ type: 'choose', pick: { zone: 'est', daylight: 'daylight' } })
    .act({ type: 'choose', pick: 'auto' }).view;
  check('  Automatic chosen again saves what Auto saves', back.mode === 'auto' && zonePickValue(back) === 'auto' &&
    back.toSave?.tzOffset === autoAt(nyJuly1980).tzOffset && !back.toSave.tzManual);

  // Ulm 1879: the birthplace's mean time, +0:39:57 (the import fixture's value).
  const ulmAt: ZoneMoment = { lat: 48.4011, lng: 9.9876, year: 1879, month: 3, day: 14, hour: 10, minute: 30 };
  const lmt = field(null, ulmAt).act({ type: 'choose', pick: 'lmt' }).view;
  check('  Local mean time at Ulm 1879 saves +0:39:57',
    lmt.mode === 'offset' && zonePickValue(lmt) === 'lmt' && Math.round((lmt.toSave?.tzOffset ?? 0) * H) === 2397 &&
      lmt.toSave?.tzEntry?.mode === 'offset' && lmt.toSave.tzEntry.basis === 'lmt',
    JSON.stringify(lmt.toSave));
  const ut = field(null, nyJuly1980).act({ type: 'choose', pick: 'ut' }).view;
  check('  Universal Time saves zero, recorded as UT',
    zonePickValue(ut) === 'ut' && ut.toSave?.tzOffset === 0 && ut.toSave.tzEntry?.mode === 'offset' &&
      ut.toSave.tzEntry.basis === 'ut',
    JSON.stringify(ut.toSave));

  // Mumbai 1943 is flagged by detection: a row chosen is stated (no flag);
  // Automatic chosen again is the lookup's again (flagged).
  const mumbai: ZoneMoment = { lat: 19.076, lng: 72.8777, year: 1943, month: 8, day: 15, hour: 10, minute: 0 };
  const ist = field(null, mumbai).act({ type: 'choose', pick: { zone: 'india', daylight: 'standard' } });
  const istFlag = ist.view.flag;
  const istAuto = ist.act({ type: 'choose', pick: 'auto' }).view;
  check('  a row chosen for flagged Mumbai 1943 is not flagged; Automatic again is',
    autoAt(mumbai).tzUncertain && !istFlag && istAuto.flag && !!istAuto.toSave?.tzUncertain);

  // Manila 1840: its mean time is past ±15 h, so the entry does nothing.
  const manila: ZoneMoment = { lat: 14.5995, lng: 120.9842, year: 1840, month: 6, day: 1, hour: 12, minute: 0 };
  const man = field(null, manila).act({ type: 'choose', pick: 'lmt' }).view;
  check('  Local mean time past ±15 h changes nothing (Manila 1840 stays on Automatic)',
    man.mode === 'auto' && !man.lmtAvailable && man.toSave?.tzOffset === autoAt(manila).tzOffset);

  // A composite's zone is fixed: the list has nothing to change.
  const comp = chartAt(nyJuly1980, {
    tzOffset: 0, tzIana: 'UTC', tzManual: true,
    composite: { a: 'x', b: 'y' } as unknown as StoredChart['composite'],
  });
  const locked = field(comp, nyJuly1980).act({ type: 'choose', pick: { zone: 'est', daylight: 'standard' } }).view;
  check('  a composite is untouched by a pick', locked.locked && locked.mode === 'auto' && locked.toSave === null);
}

console.log('\n── 7c. TWO PARTS AGREE: a chart saved in hidden terms comes back as it was ──');

{
  // Terms the list has no row for, each saved as a record. Opened, it must show
  // "As saved" and write its five fields back untouched; a row chosen must
  // move it (the list's own control still works); "As saved" chosen again
  // must restore it exactly. Every record is asked all three.
  type Hidden = [string, StoredChart];
  const records: Hidden[] = [
    ['an IANA pick', chartAt(nyJuly1980, { tzOffset: -5, tzIana: 'America/Chicago', tzManual: true })],
    ['a whole-hour UTC pick', chartAt(nyJuly1980, { tzOffset: -5, tzIana: 'Etc/GMT+5', tzManual: true })],
    ['a typed offset', chartAt(nyJuly1980, {
      tzOffset: -5, tzIana: 'America/New_York', tzManual: true,
      tzEntry: { mode: 'offset', seconds: -5 * H, text: '5hw00' },
    })],
    ['war time', chartAt(yonkers1941, {
      tzOffset: -4, tzIana: 'America/New_York', tzManual: true,
      tzEntry: { mode: 'standard', std: -5 * H, daylight: 'war', zone: 'est' },
    })],
    ['an unnamed imported standard time', chartAt(nyJuly1980, {
      tzOffset: -4, tzIana: 'America/New_York', tzManual: true,
      tzEntry: { mode: 'standard', std: -5 * H, daylight: 'daylight' },
    })],
    ['a stored number Auto would no longer give', chartAt(yonkers1941, { tzOffset: -5, tzIana: 'America/New_York', tzUncertain: true })],
  ];
  const fieldsOf = (c: StoredChart) => ({
    tzOffset: c.tzOffset, tzIana: c.tzIana, tzManual: !!c.tzManual, tzUncertain: !!c.tzUncertain, tzEntry: c.tzEntry,
  });
  every('opened: offered as "As saved", written back verbatim', records, ([label, c]) => {
    const v = field(c, atOfChart(c)).view;
    if (!v.saved || zonePickValue(v) !== 'saved') return `${label}: shows ${zonePickValue(v)}`;
    return same(v.toSave, fieldsOf(c)) ? null : `${label}: ${JSON.stringify(v.toSave)}`;
  });
  every('…a row chosen moves it', records, ([label, c]) => {
    const v = field(c, atOfChart(c)).act({ type: 'choose', pick: { zone: 'cet', daylight: 'standard' } }).view;
    return v.toSave?.tzOffset === 1 && zonePickValue(v) === 'cet:standard' ? null : `${label}: ${JSON.stringify(v.toSave)}`;
  });
  every('…and "As saved" chosen again restores it exactly', records, ([label, c]) => {
    const v = field(c, atOfChart(c))
      .act({ type: 'choose', pick: { zone: 'cet', daylight: 'standard' } })
      .act({ type: 'choose', pick: 'saved' }).view;
    return zonePickValue(v) === 'saved' && same(v.toSave, fieldsOf(c)) ? null : `${label}: ${JSON.stringify(v.toSave)}`;
  });

  // Terms the list does have reopen on their own row, with nothing extra.
  const edtChart = chartAt(nyJuly1980, {
    tzOffset: -4, tzIana: 'America/New_York', tzManual: true,
    tzEntry: { mode: 'standard', std: -5 * H, daylight: 'daylight', zone: 'est' },
  });
  const edtView = field(edtChart, nyJuly1980).view;
  check('  a chart saved as EDT reopens on its row, with no "As saved" entry',
    edtView.saved === null && zonePickValue(edtView) === 'est:daylight');

  // An Auto record a fraction of a second off the live lookup: a row chosen
  // and then Automatic again writes the record back, not a re-resolution.
  const kolkata1850: ZoneMoment = { lat: 22.5726, lng: 88.3639, year: 1850, month: 1, day: 1, hour: 12, minute: 0 };
  const legacy = chartAt(kolkata1850, { tzOffset: 5.891111, tzIana: 'Asia/Kolkata', tzUncertain: true });
  const again = field(legacy, kolkata1850)
    .act({ type: 'choose', pick: { zone: 'india', daylight: 'standard' } })
    .act({ type: 'choose', pick: 'auto' }).view;
  check('  an Auto record, a row chosen and Automatic chosen again, is written back as it was',
    again.saved === null && same(again.toSave, fieldsOf(legacy)) &&
      Math.abs(autoAt(kolkata1850).tzOffset - legacy.tzOffset) > 0,
    JSON.stringify(again.toSave));
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
