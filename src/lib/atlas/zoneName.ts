// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// One way to name a clock's zone, everywhere the app prints one (Lina's chart-header
// spec, 2026-10-06): "09:30 EDT (UTC−04:00)" — the 24-hour clock, the abbreviation IN
// FORCE FOR THAT DATE, then the ISO offset in brackets. Never the astrological inverse
// ("+4:00" for EDT), and never the "4h W" second notation in display.
//
// Where the names come from (2026-10-07). The browser cannot be asked: its English
// short names are real abbreviations almost only for North America, and only from
// 1970 — New York in 1941 comes back "GMT-4", Berlin in en-US "GMT+2". So the name is
// read from the app's own zone catalogue (STANDARD_ZONES), through the same proposal
// that preselects the chart form's Standard + daylight terms, so the form and every
// printed clock name a moment alike. On top of the catalogue, a small era table here
// for the names a catalogue row cannot carry (British and Irish summer time, the war
// years); the browser's name only as a filtered last resort; else the bare offset.
//
// THE STORED OFFSET ALWAYS WINS. A chart is cast from `tzOffset` and nothing else, so a
// name is printed only when it stands for exactly that offset, to the second. A name
// that would describe some other offset is dropped, never the offset — a bare
// "(UTC−05:00)" is a smaller statement than a wrong "EDT".
//
// Ambiguous abbreviations are allowed (CST is Chicago, Havana and Shanghai; IST is
// Kolkata, Jerusalem and Dublin): the name always comes from the resolved place, never
// from the offset, and the bracketed offset beside it tells them apart.

import { DateTime } from 'luxon';
import type { DaylightCode, StandardZone, TzEntry } from './zoneEntry';
import {
  birthplaceLmtSeconds,
  canonicalZone,
  catalogueRowsFor,
  daylightSeconds,
  entrySeconds,
  formatUtcNotation,
  lmtOffsetSeconds,
  proposeStandardEntryAt,
  sanitizeTzEntry,
  STANDARD_ZONES,
  standardZoneById,
  standardZoneForStated,
} from './zoneEntry';
import { getIanaTimezone, resolveBirthTimezone, resolveZoneInfo } from './timezone';
import lmtEras from './data/lmtEras.json';

export interface ZoneName {
  /** East-positive offset, whole seconds. */
  seconds: number;
  /** "UTC−04:00" (U+2212), ":SS" only when there are seconds; "UTC" for kind 'ut'. */
  iso: string;
  /** "EDT" — only when the name is known for this date and gives exactly `seconds`. */
  abbr?: string;
  /** "Eastern Daylight Time". */
  long?: string;
  kind: 'zone' | 'lmt' | 'ut' | 'offset';
  source: 'catalogue' | 'era' | 'intl' | 'none';
}

/** What naming a stored chart's zone reads: its civil moment, the stored offset (which
 *  always wins), how it was chosen, and the birthplace (to detect a zone). */
export interface ChartZoneInput {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** East-positive hours — the one number the chart is cast from. */
  tzOffset: number;
  tzIana?: string;
  tzEntry?: TzEntry;
  birthplace: { lat: number; lng: number };
}

export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday0Sun: number;
}

const H = 3600;

/** A bare offset: the name of last resort. */
export function offsetOnly(seconds: number): ZoneName {
  const s = Math.round(seconds) || 0;
  return { seconds: s, iso: formatUtcNotation(s, { padded: true }), kind: 'offset', source: 'none' };
}

/** Universal Time — Davison moments, composites' anchors, a time recorded in UT. */
export function utName(): ZoneName {
  return { seconds: 0, iso: 'UTC', long: 'Universal Time', kind: 'ut', source: 'none' };
}

/** A local mean time: "LMT (UTC+00:39:57)". The tz database's own designation for
 *  the era before a zone kept standard time, and the astrologer's for a birthplace's
 *  mean time — always with its offset beside it, since it names no single offset. */
export function lmtName(seconds: number): ZoneName {
  const s = Math.round(seconds) || 0;
  return {
    seconds: s,
    iso: formatUtcNotation(s, { padded: true }),
    abbr: 'LMT',
    long: 'Local Mean Time',
    kind: 'lmt',
    source: 'none',
  };
}

interface Naming {
  abbr: string;
  long?: string;
  source: 'catalogue' | 'era' | 'intl';
}

function named(seconds: number, n: Naming): ZoneName {
  const z: ZoneName = {
    seconds,
    iso: formatUtcNotation(seconds, { padded: true }),
    abbr: n.abbr,
    kind: 'zone',
    source: n.source,
  };
  if (n.long) z.long = n.long;
  return z;
}

// ── Zones that are not places ───────────────────────────────────────────────

/** The tz database's UTC (and its aliases): a Davison or composite's zone, a time
 *  recorded in UT. */
function isUtZone(iana: string): boolean {
  return canonicalZone(iana) === 'Etc/UTC';
}

/** A fixed offset with no rules and no name: the whole-hour UTC picker's Etc/GMT±N,
 *  or the nautical zone the atlas gives open ocean. Its offset is its only name. */
function isFixedZone(iana: string): boolean {
  return /^Etc\//.test(canonicalZone(iana));
}

/** The birthplace's zone from the atlas, or undefined where the lookup has none
 *  (non-finite or out-of-range coordinates make it throw). */
function zoneOfPlace(lat: number, lng: number): string | undefined {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90) return undefined;
  try {
    return getIanaTimezone(lat, wrapLng(lng));
  } catch {
    return undefined;
  }
}

// A click on a world copy can arrive with a longitude outside ±180.
const wrapLng = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;

/** Whether a zone's clock in `year` could still be a local mean time — a cheap
 *  pre-test, so the timeline's playback does not build a DateTime per frame to ask a
 *  question whose answer is "no" for every year past the zone's standardisation.
 *  Open ocean counts before 1920, when nautical zone time began (timezone.ts). */
function lmtPossible(iana: string, year: number): boolean {
  if (/^(Etc\/|UTC$)/.test(iana)) return year < 1920;
  const end = (lmtEras as { ends: Record<string, string> }).ends[canonicalZone(iana)];
  return !!end && year <= Number(end.slice(0, 4));
}

// ── Long names ──────────────────────────────────────────────────────────────

/** A catalogue name as a clock's long name: "Eastern Standard" → "Eastern Standard
 *  Time", "Hawaii Standard, 1896–1947" → "Hawaii Standard Time" (the era suffix is
 *  the list's, for telling rows apart, not part of the name). */
function timeName(name: string): string {
  const base = name.replace(/,\s*\d{4}.*$/, '').trim();
  return /\bTime$/.test(base) ? base : `${base} Time`;
}

// ── The era table ───────────────────────────────────────────────────────────
//
// Names a catalogue row cannot carry, because they belong to one place or one period
// rather than to the standard time the row describes. Each is the abbreviation the tz
// database itself records for that place and period.

const LONDON = 'Europe/London';
const DUBLIN = 'Europe/Dublin';

// The GMT row is shared by Britain, Ireland, Iceland and West Africa, so its summer
// time has no `dstAbbr`: BST is Britain's alone (and Bangladesh's standard time), and
// Ireland's summer is IST.
const BST: Naming = { abbr: 'BST', long: 'British Summer Time', source: 'era' };
// 27 October 1968 – 31 October 1971: Britain kept +1 all year as its STANDARD time,
// under the same abbreviation.
const BST_STANDARD: Naming = { abbr: 'BST', long: 'British Standard Time', source: 'era' };
// Two hours ahead in the summers of 1941–45 and 1947.
const BDST: Naming = { abbr: 'BDST', long: 'British Double Summer Time', source: 'era' };
// Irish summer time took the name IST from 1922; since the Standard Time Act (in force
// from 27 October 1968) the summer hour is legally Ireland's standard time.
const IST_SUMMER: Naming = { abbr: 'IST', long: 'Irish Summer Time', source: 'era' };
const IST_STANDARD: Naming = { abbr: 'IST', long: 'Irish Standard Time', source: 'era' };

const BRITISH_STANDARD_FROM = Date.UTC(1968, 9, 26, 23); // 27 Oct 1968 00:00 at +1
const BRITISH_STANDARD_UNTIL = Date.UTC(1971, 9, 31, 2);
// Ireland followed British summer time (BST) until the Free State; from the 1922
// season it was IST.
const IRISH_FROM = Date.UTC(1922, 0, 1);

// North American war and peace time. DAYLIGHT_STEPS (zoneEntry.ts) leaves 'war' out of
// what the proposal can return — war time adds the same hour as daylight saving, so a
// detected New York January 1943 is proposed as "EST + daylight" — and the date decides
// the name here: war time from 9 February 1942 (02:00 local standard), peace time from
// 14 August 1945 23:00 UT, until the clocks went back. A stated 'daylight' entry is not
// renamed: the source said EDT, and the stated terms are the record.
const WAR_ROWS: Readonly<Record<string, { letter: string; region: string }>> = {
  est: { letter: 'E', region: 'Eastern' },
  cst: { letter: 'C', region: 'Central' },
  mst: { letter: 'M', region: 'Mountain' },
  pst: { letter: 'P', region: 'Pacific' },
  ast: { letter: 'A', region: 'Atlantic' },
  nst: { letter: 'N', region: 'Newfoundland' },
  'hst-1896': { letter: 'H', region: 'Hawaii' },
};
// Zones listed on those rows that kept their own daylight time in the war years
// rather than the US/Canadian war time (the tz database names both ADT).
const WAR_EXCLUDED: ReadonlySet<string> = new Set(['Atlantic/Bermuda', 'America/Barbados']);
const WAR_FROM_LOCAL = Date.UTC(1942, 1, 9, 2);
const PEACE_FROM = Date.UTC(1945, 7, 14, 23);
// Peace time ended with the season (30 September in most of the US and Canada, later
// in a few places); any summer hour after this is that year's ordinary daylight time.
const PEACE_UNTIL = Date.UTC(1946, 0, 1);

/** The instants inside one year at which an era name changes while the offset and
 *  the daylight flag do not — the cache key below must tell their two sides apart.
 *  War time began on each row's own 02:00, and where the clocks were already an hour
 *  ahead (Toronto had kept daylight time since September 1940) nothing else marks it:
 *  January 1942 there is EDT, July EWT, both at −4. */
const ERA_BOUNDARIES = [
  ...Object.keys(WAR_ROWS).map((id) => WAR_FROM_LOCAL - (standardZoneById(id)?.std ?? 0) * 1000),
  PEACE_FROM,
  BRITISH_STANDARD_FROM,
];
const eraBucket = (ms: number) => ERA_BOUNDARIES.filter((b) => ms >= b).length;

function eraName(
  row: StandardZone,
  daylight: DaylightCode,
  zone: string | undefined,
  ms: number,
  lookup: boolean,
): Naming | null {
  const key = zone ? canonicalZone(zone) : undefined;
  const summer = daylight === 'daylight' || daylight === 'war';
  if (row.id === 'gmt') {
    if (key === LONDON) {
      if (daylight === 'double') return BDST;
      if (summer) return ms >= BRITISH_STANDARD_FROM && ms < BRITISH_STANDARD_UNTIL ? BST_STANDARD : BST;
    }
    if (key === DUBLIN && summer) {
      return ms < IRISH_FROM ? BST : ms < BRITISH_STANDARD_FROM ? IST_SUMMER : IST_STANDARD;
    }
    return null;
  }
  const war = WAR_ROWS[row.id];
  if (!war || (key && WAR_EXCLUDED.has(key))) return null;
  if (!(daylight === 'war' || (lookup && daylight === 'daylight'))) return null;
  if (ms >= WAR_FROM_LOCAL - row.std * 1000 && ms < PEACE_FROM) {
    return { abbr: `${war.letter}WT`, long: `${war.region} War Time`, source: 'era' };
  }
  if (ms >= PEACE_FROM && ms < PEACE_UNTIL) {
    return { abbr: `${war.letter}PT`, long: `${war.region} Peace Time`, source: 'era' };
  }
  return null;
}

/**
 * The name of a catalogue row under a daylight state, at an instant in a zone (the
 * zone and instant only matter to the era table). `lookup` is true when the state was
 * read from the tz database rather than stated by a source. Null where the row has
 * no name for that state — "Colombia, Ecuador & Peru" has no abbreviation, India no
 * daylight time — and then no long name either: a long name alone would be a claim
 * the bracketed offset cannot be checked against.
 */
function nameOfRow(
  row: StandardZone,
  daylight: DaylightCode,
  zone: string | undefined,
  ms: number,
  lookup: boolean,
): Naming | null {
  if (daylight === 'standard') {
    return row.abbr ? { abbr: row.abbr, long: timeName(row.name), source: 'catalogue' } : null;
  }
  const era = eraName(row, daylight, zone, ms, lookup);
  if (era) return era;
  // War time is daylight saving's hour under another name (the exchange format's own
  // table says so), so outside the war table it reads as the row's daylight time —
  // the name in force for that hour at that date.
  const code = daylight === 'war' ? 'daylight' : daylight;
  if (row.dstAbbr && code === (row.dstCode ?? 'daylight')) {
    return { abbr: row.dstAbbr, long: row.dstName ? timeName(row.dstName) : undefined, source: 'catalogue' };
  }
  return null;
}

// ── The browser's names, filtered ───────────────────────────────────────────

/** Every offset the catalogue and the era table give each abbreviation — what a
 *  browser's name has to agree with before it is printed. */
const KNOWN_OFFSETS: ReadonlyMap<string, ReadonlySet<number>> = (() => {
  const m = new Map<string, Set<number>>();
  const add = (abbr: string, s: number) => {
    const set = m.get(abbr) ?? new Set<number>();
    set.add(s);
    m.set(abbr, set);
  };
  for (const z of STANDARD_ZONES) {
    if (z.abbr) add(z.abbr, z.std);
    if (z.dstAbbr) add(z.dstAbbr, z.std + daylightSeconds(z.dstCode ?? 'daylight'));
  }
  add('BST', H);
  add('BDST', 2 * H);
  add('IST', H);
  for (const id of Object.keys(WAR_ROWS)) {
    const z = standardZoneById(id);
    if (!z) continue;
    add(`${WAR_ROWS[id].letter}WT`, z.std + H);
    add(`${WAR_ROWS[id].letter}PT`, z.std + H);
  }
  return m;
})();

// Letters only: a "GMT+2" or "+0530" is an offset dressed as a name.
const INTL_ABBR = /^[A-Z][A-Za-z]{1,5}$/;

/**
 * The browser's name for a zone at a moment — en-GB's short name first (it knows the
 * European ones), then en-US's (the North American ones) — kept only when it is
 * letters, is not "UTC" (which names no place), and is not an abbreviation the
 * catalogue knows at some other offset. Called only for a zone the catalogue does not
 * list that year. The long name is en-US's, unless that is a "GMT+…" offset too.
 */
function intlName(dt: DateTime, seconds: number): Naming | null {
  const nameIn = (locale: string, long: boolean): string | null => {
    try {
      const local = dt.setLocale(locale);
      return long ? local.offsetNameLong : local.offsetNameShort;
    } catch {
      return null;
    }
  };
  for (const locale of ['en-GB', 'en-US']) {
    const short = nameIn(locale, false);
    if (!short || !INTL_ABBR.test(short) || short === 'UTC') continue;
    const known = KNOWN_OFFSETS.get(short);
    if (known && !known.has(seconds)) continue;
    const long = nameIn('en-US', true);
    const usable = long && !/^(GMT|UTC)([+\-−]|$)/.test(long) ? long : undefined;
    return { abbr: short, long: usable, source: 'intl' };
  }
  return null;
}

// ── A zone at an instant ────────────────────────────────────────────────────

// The proposal behind a name reads up to a few dozen DateTimes (eraStandard), and the
// timeline asks again on every playback frame. Within a year, the proposal depends only
// on the zone's offset, its daylight flag and the tz data's English name for the
// period (clockState reads it), and the era table on which side of an era boundary the
// instant is — so that is the key. The name is not optional: a zone can change its
// standard time mid-year at the same offset (Vincennes, Indiana, went from EST to CDT
// at −5 in April 2006), and a key without it handed July the January answer. Cleared
// rather than evicted when full: the working set is a handful of zones and years.
const CACHE_MAX = 4096;
const instantCache = new Map<string, ZoneName>();
const chartCache = new Map<string, ZoneName>();

// One formatter per zone: building an Intl.DateTimeFormat costs far more than using
// one, and this runs on every cache lookup.
const longNameFormats = new Map<string, Intl.DateTimeFormat | null>();
function longNameAt(iana: string, ms: number): string {
  let f = longNameFormats.get(iana);
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat('en-US', { timeZone: iana, timeZoneName: 'long' });
    } catch {
      f = null;
    }
    longNameFormats.set(iana, f);
  }
  try {
    return f?.formatToParts(ms).find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

function remember(cache: Map<string, ZoneName>, key: string, z: ZoneName): ZoneName {
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, z);
  return z;
}

// A caller that edits a returned name must not edit the cache's copy.
const copy = (z: ZoneName): ZoneName => ({ ...z });

/** Empty the caches. For scripts/verify-zone-name.ts, which asks the same moments in
 *  two orders to prove a cached answer never stands in for a different one. */
export function clearZoneNameCaches(): void {
  instantCache.clear();
  chartCache.clear();
}

/** A zone's name at an instant (the timeline bar, Galaxy, the Sky Band). In the zone's
 *  mean-time era the offset stands alone: what the tz database carries then is its
 *  REFERENCE CITY's mean time, and "LMT" beside a chart's place would claim it for
 *  that place — an Ulm chart scrubbed to 1879 would read Berlin's +0:53:28 as Ulm's
 *  (2026-10-07). Only a reading for one exact place says LMT: zoneNameForChart, which
 *  checks the birthplace's own mean time against the stored offset, and placeZoneAt. */
export function zoneNameAtInstant(iana: string, ms: number): ZoneName {
  if (isUtZone(iana)) return utName();
  const dt = DateTime.fromMillis(ms, { zone: iana });
  // A zone this engine does not know: no offset to name. The callers that can fall
  // back to a chart's fixed offset (timelineZoneAt) test for this first.
  if (!dt.isValid || !Number.isFinite(dt.offset)) return offsetOnly(0);
  const seconds = Math.round(dt.offset * 60) || 0;
  if (isFixedZone(iana)) return offsetOnly(seconds);
  if (lmtPossible(iana, dt.year) && resolveZoneInfo(iana, dt.year, dt.month, dt.day, dt.hour, dt.minute).lmt) {
    return offsetOnly(seconds);
  }
  const key = `${iana}|${dt.year}|${seconds}|${dt.isInDST ? 1 : 0}|${longNameAt(iana, ms)}|${eraBucket(ms)}`;
  const hit = instantCache.get(key);
  if (hit) return copy(hit);
  return copy(remember(instantCache, key, nameAt(iana, ms, dt, seconds)));
}

function nameAt(iana: string, ms: number, dt: DateTime, seconds: number): ZoneName {
  const p = proposeStandardEntryAt(iana, ms);
  if (p) {
    const n = nameOfRow(p.zone, p.daylight, iana, ms, true);
    if (!n || p.zone.std + daylightSeconds(p.daylight) !== seconds) return offsetOnly(seconds);
    // The proposal counts any hour above the year's January as summer time, which is
    // right for Ireland (whose summer is legally its standard time — the era table's
    // case, never this one) and wrong for a zone that moved its standard time up an
    // hour mid-year: Managua kept EST from May 1973 and Grand Turk AST from March 2015,
    // where a catalogue daylight name would print CDT and EDT. Where the tz data names
    // the period a standard time, no daylight name is printed over it.
    if (n.source === 'catalogue' && p.daylight !== 'standard' && /\bStandard Time$/.test(longNameAt(iana, ms))) {
      return offsetOnly(seconds);
    }
    return named(seconds, n);
  }
  // Where the catalogue lists the zone that year and still proposes nothing, the clock
  // is keeping terms the catalogue does not carry (Moscow's +4 in 2012, Istanbul on EET
  // until 2016), and the offset stands alone. The browser's names are only for a zone
  // the catalogue does not list that year (the plan's rule, 2026-10-07), so what a
  // catalogued place prints never depends on which browser's zone data printed it.
  if (catalogueRowsFor(iana, dt.year).length === 0) {
    const n = intlName(dt, seconds);
    if (n) return named(seconds, n);
  }
  return offsetOnly(seconds);
}

// ── A stored chart ──────────────────────────────────────────────────────────

/** Epoch ms of a wall-clock reading taken as UTC, safe for years below 100 (which
 *  Date.UTC would move into the 1900s). */
function wallMs(year: number, month: number, day: number, hour: number, minute: number): number {
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(hour, minute, 0, 0);
  return d.getTime();
}

/** The stored chart's zone of place, for the era table: its own zone when that is a
 *  place, else the birthplace's. */
function placeZoneOf(c: ChartZoneInput): string | undefined {
  if (c.tzIana && !isUtZone(c.tzIana) && !isFixedZone(c.tzIana)) return c.tzIana;
  return zoneOfPlace(c.birthplace?.lat ?? NaN, c.birthplace?.lng ?? NaN);
}

/** The zone of a stored chart's own moment, named only where the name gives exactly
 *  the stored offset. */
export function zoneNameForChart(c: ChartZoneInput): ZoneName {
  const key = JSON.stringify([
    c.year, c.month, c.day, c.hour, c.minute, c.tzOffset, c.tzIana ?? null,
    c.tzEntry ?? null, c.birthplace?.lat ?? null, c.birthplace?.lng ?? null,
  ]);
  const hit = chartCache.get(key);
  if (hit) return copy(hit);
  return copy(remember(chartCache, key, nameChart(c)));
}

function nameChart(c: ChartZoneInput): ZoneName {
  const stored = Math.round(c.tzOffset * H) || 0;
  // The stored offset fixes the instant, so a fall-back hour is read on the pass the
  // chart was cast on: New York 01:30 on 2 November 2025 saved at −5 is EST, at −4 EDT.
  const instant = wallMs(c.year, c.month, c.day, c.hour, c.minute) - stored * 1000;

  // 1. The record's own terms, when they still give its offset. An entry that no
  //    longer does is ignored here, as the editor ignores it (reopenZoneChoice), and
  //    the chart is named like one without terms.
  const entry = c.tzEntry !== undefined ? sanitizeTzEntry(c.tzEntry) : undefined;
  if (entry && entrySeconds(entry) === stored) {
    if (entry.mode === 'offset') {
      if (entry.basis === 'ut') return utName();
      if (entry.basis === 'lmt') return lmtName(stored);
      // A number the reader typed is not turned into a claim about a zone.
      return offsetOnly(stored);
    }
    const place = placeZoneOf(c);
    const row =
      standardZoneById(entry.zone) ?? standardZoneForStated(entry.std, { iana: place, year: c.year });
    const n = row ? nameOfRow(row, entry.daylight, place, instant, false) : null;
    return n ? named(stored, n) : offsetOnly(stored);
  }

  // 2. The zone — stored, or detected from the birthplace (a composite's parents carry
  //    only an offset and a place).
  const lat = c.birthplace?.lat ?? NaN;
  const lng = c.birthplace?.lng ?? NaN;
  const zone = c.tzIana ?? zoneOfPlace(lat, lng);
  if (!zone) return offsetOnly(stored);

  // 3. Zones that are not places: UT, and the fixed Etc/GMT±N offsets.
  if (isUtZone(zone)) return stored === 0 ? utName() : offsetOnly(stored);
  if (isFixedZone(zone)) {
    // Open ocean before 1920 kept ship's mean time, which detection stores under the
    // nautical zone (resolveBirthTimezone): that is a local mean time, and says so.
    if (c.year < 1920 && Math.abs(stored - lmtOffsetSeconds(lng)) <= 1) return lmtName(stored);
    return offsetOnly(stored);
  }

  // 4. A place's zone: its mean-time era, then the catalogue at the chart's instant.
  const info = resolveZoneInfo(zone, c.year, c.month, c.day, c.hour, c.minute);
  if (!Number.isFinite(info.offsetHours)) return offsetOnly(stored);
  if (info.lmt) {
    // The BIRTHPLACE's mean time, to the second (with the date-line shift detection
    // applies). A zone's reference-city mean time is not named LMT on a chart born
    // elsewhere: Ulm's chart at Berlin's +0:53:28 would print an "LMT" that is not
    // Ulm's — the offset alone says what it is.
    const at = { lat, lng, year: c.year, month: c.month, day: c.day, hour: c.hour, minute: c.minute };
    return Math.abs(stored - birthplaceLmtSeconds(at, info)) <= 1 ? lmtName(stored) : offsetOnly(stored);
  }
  const z = zoneNameAtInstant(zone, instant);
  return z.seconds === stored && z.kind === 'zone' ? z : offsetOnly(stored);
}

// ── A place's clock ─────────────────────────────────────────────────────────

/** The clock of a place, LMT-aware: null where no zone can be found for it. Before the
 *  place's region kept standard time, the tz database can only offer its reference
 *  city's mean time (all of Germany before 1893 reads as Berlin's); a clock at the
 *  place then kept the place's OWN mean time, as a birth there does
 *  (resolveBirthTimezone, reused for the era test). The offset always comes from the
 *  instant, never from a wall-clock round trip, which lands an hour out inside a
 *  fall-back hour. */
export function placeZoneAt(lat: number, lng: number): ((ms: number) => ZoneName) | null {
  const iana = zoneOfPlace(lat, lng);
  if (!iana) return null;
  // A zone name the host's time-zone data doesn't know yields NaN offsets.
  const probe = DateTime.now().setZone(iana);
  if (!probe.isValid || !Number.isFinite(probe.offset)) return null;
  const wrapped = wrapLng(lng);
  return (ms) => {
    const dt = DateTime.fromMillis(ms, { zone: iana });
    if (dt.isValid && lmtPossible(iana, dt.year)) {
      const era = resolveBirthTimezone(lat, wrapped, dt.year, dt.month, dt.day, dt.hour, dt.minute);
      if (era.lmt) return lmtName(era.offsetHours * H);
    }
    return zoneNameAtInstant(iana, ms);
  };
}

/** The timeline bar's rule, kept in one place: the chart's own zone at the instant,
 *  else its fixed offset, else UTC. The chart's zone is used even where its offset was
 *  stated (Standard + daylight, an exact offset), because what the bar shows is the
 *  place's live clock at the instant scrubbed to, not the birth moment's terms. */
export function timelineZoneAt(
  chart: { tzIana?: string; tzOffset: number } | null,
  ms: number,
): ZoneName {
  if (!chart) return utName();
  if (chart.tzIana) {
    if (isUtZone(chart.tzIana)) return utName();
    const dt = DateTime.fromMillis(ms, { zone: chart.tzIana });
    if (dt.isValid && Number.isFinite(dt.offset)) return zoneNameAtInstant(chart.tzIana, ms);
  }
  return offsetOnly(chart.tzOffset * H);
}

/** The wall clock an instant reads in a zone, always from `z.seconds`. */
export function wallClockAt(ms: number, z: ZoneName): WallClock {
  const d = new Date(ms + z.seconds * 1000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    weekday0Sun: d.getUTCDay(),
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "EDT (UTC−04:00)", "(UTC+04:00)", "(UTC)". */
export function formatZoneLabel(z: ZoneName): string {
  return z.abbr ? `${z.abbr} (${z.iso})` : `(${z.iso})`;
}

/** "09:30 EDT (UTC−04:00)", "09:30 (UTC+04:00)", "16:12 (UTC)"; seconds when given. */
export function formatZoneClock(hour: number, minute: number, z: ZoneName, second?: number): string {
  const clock = `${pad2(hour)}:${pad2(minute)}${second ? `:${pad2(second)}` : ''}`;
  return `${clock} ${formatZoneLabel(z)}`;
}

/** The entry form's row: "Eastern Daylight Time · EDT (UTC−04:00)", falling back to
 *  whatever of the name is known — "Universal Time (UTC)", "UTC+04:00". */
export function formatZoneLong(z: ZoneName): string {
  if (z.long && z.abbr) return `${z.long} · ${z.abbr} (${z.iso})`;
  if (z.long) return `${z.long} (${z.iso})`;
  if (z.abbr) return `${z.abbr} (${z.iso})`;
  return z.iso;
}
