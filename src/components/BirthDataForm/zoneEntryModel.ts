// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The chart form's time-zone state as plain functions, 2026-10-02: what the
// field remembers (ZoneModel), what it shows and will save given the birth
// moment (zoneView), and what each control does to it (zoneReduce). No React
// here — useZoneEntry wraps it — so scripts/verify-zone-entry.ts can drive the
// same transitions the form makes, which is where the review found the faults.
//
// Three rules carry the weight, each one a fault the review found:
//
//  1. A way that was only SWITCHED to has stated nothing. Its zone is derived,
//     on every render, from the way it was switched from (`seedFrom`) — so a
//     date or birthplace corrected afterwards moves it exactly as it moves Auto,
//     and it keeps that way's "verify DST" flag. Only picking, typing or
//     pressing something inside a way states a zone (`stated`). Before this a
//     switch froze the seed: New York July 1980 switched to Standard, then
//     corrected to London in January, saved EST + daylight; and a flagged 1943
//     Mumbai birth lost its flag to a click on Offset, though nothing was
//     verified (CLAUDE.md: derive while it is a standing state).
//
//  2. A saved chart whose zone nobody touched is written back as it was. While
//     the field still shows exactly what the record reopened as, at the
//     record's own place and moment, saving (say, a rename) writes the record's
//     five zone fields verbatim — no re-resolution, so no sub-second drift, no
//     flag gained or lost, no tzManual flipped (CLAUDE.md: facts about the
//     document freeze).
//
//  3. The field shows what it will save. The "verify DST" note reads the same
//     `flag` that `toSave` writes, and `toSave` is null whenever saving must
//     wait (`error`).
//
// The form now shows one list rather than the five ways (2026-10-05, see
// TimeZoneField's header): `choose` is that list's one action, and the rows and
// the value it shows are worked out here too, beside the transitions they drive.
//
// Since 2026-10-07 (Lina's entry-form spec) the field unfolds to radios instead:
// Automatic, the other half of the place's standard/daylight pair for the year,
// the record's own terms where they are neither, and a typed custom offset.
// What those rows are, which one is checked, and whether an override still fits
// the place and date (`implausible`) are worked out in zoneView as `chooser`, so
// the verify script asks the same questions of the same code. `choose` drives
// the radios too; the Custom row is its `{ custom }` pick.

import { DateTime } from 'luxon';
import type { StoredChart } from '../../lib/chartLibrary';
import { zoneNameForChart, type ZoneName } from '../../lib/atlas/zoneName';
import {
  applyOffsetDirection,
  birthplaceLmtSeconds,
  canonicalZone,
  DAYLIGHT_OPTIONS,
  daylightSeconds,
  entrySeconds,
  formatAstroNotation,
  formatUtcNotation,
  lmtOffsetSeconds,
  MAX_ZONE_OFFSET_SECONDS,
  OFFSET_TEXT_MAX,
  parseZoneOffset,
  proposeStandardEntry,
  reopenZoneChoice,
  resolveZoneChoice,
  sanitizeTzEntry,
  STANDARD_ZONES,
  standardZoneById,
  textReadsAs,
  UTC_PICKER_HOURS,
  zoneInUse,
  type DaylightCode,
  type OffsetDirection,
  type OffsetEntry,
  type ParsedZoneOffset,
  type ResolvedZone,
  type StandardEntry,
  type StandardProposal,
  type StandardZone,
  type TzEntry,
  type ZoneChoice,
  type ZoneEntryMode,
  type ZoneMoment,
  type ZoneReopen,
} from '../../lib/atlas/zoneEntry';

/** What the field remembers between renders. */
export interface ZoneModel {
  /** The way the reader has chosen. */
  mode: ZoneEntryMode;
  /** The zone given (or the record's), in effect while `seedFrom` is null. */
  choice: ZoneChoice;
  /** While a way has only been switched to, the zone it was switched from —
   *  the way's own zone is then derived from it (rule 1 above). */
  seedFrom: ZoneChoice | null;
  /** Something was picked, typed or pressed inside a way. */
  stated: boolean;
  offsetText: string;
  offsetDir: OffsetDirection;
  /** The longitude an LMT offset was taken at. The offset is DERIVED from the
   *  current birthplace while the two differ rather than rewritten when the
   *  place moves, so a reopened chart's stored seconds (an imported LMT can
   *  carry its source's own rounding) come back if the place is put back. */
  lmtAt: number | null;
  /** The offset in effect was typed into the chooser's Custom row (2026-10-07).
   *  That row has no East/West control, so an offset that names no direction
   *  ("5:30") can't be read either way and holds the save — where the hidden
   *  Exact-offset way would take the direction from its E/W switch. */
  custom: boolean;
}

/** What the field is drawn from besides its own state. */
export interface ZoneInputs {
  initial: StoredChart | null | undefined;
  opened: ZoneReopen;
  /** The birth moment and place, or null until both exist. */
  at: ZoneMoment | null;
}

/** The zone fields a chart stores, as saving writes them. */
export interface ZoneFields {
  tzOffset: number;
  tzIana: string | undefined;
  tzManual: boolean;
  tzUncertain: boolean;
  tzEntry: TzEntry | undefined;
}

export interface ZoneView {
  /** A composite's moment is UT by construction; nothing here is editable. */
  locked: boolean;
  at: ZoneMoment | null;
  mode: ZoneEntryMode;
  /** The zone in effect: the given one, or the one a switched-to way derives. */
  choice: ZoneChoice;
  resolved: ResolvedZone | null;
  /** The chosen way has nothing truthful to show yet (Standard with no zone
   *  this birthplace kept, the whole-hour picker for a half-hour offset). */
  pending: boolean;
  /** The way in effect was only switched to and follows the birth moment. */
  seeded: boolean;
  /** Exact offset: the text in the box, what it reads as, and the direction
   *  the E/W control shows. */
  offsetText: string;
  offsetParsed: ParsedZoneOffset | null;
  offsetDirection: OffsetDirection;
  /** The typed text names its own direction, so the E/W control has nothing to say. */
  directionStated: boolean;
  /** The standard offset of an imported entry that named no zone, kept on offer
   *  for the whole edit so picking a named zone can be undone. */
  unnamedStd: number | null;
  /** The birthplace's local mean time on its calendar of the time (what the
   *  one-click LMT gives), whether that differs from longitude ÷ 15 by a day,
   *  and whether it is within what an offset can state. */
  lmtSeconds: number | null;
  lmtShifted: boolean;
  lmtAvailable: boolean;
  /** A chart that reopened on its stored number, untouched: the terms it was
   *  saved in (`was`, null when they can't be read) and what they would give
   *  now. Null otherwise, and when they would give the stored number again. */
  kept: { was: ZoneChoice | null; now: number | null } | null;
  /** The terms a saved chart reopened in, where no entry in the form's list
   *  gives them (an IANA zone, a typed offset, war time…): the list then offers
   *  them back as "As saved". Null for a new chart and for terms it lists. */
  saved: ZoneChoice | null;
  /** The tzUncertain saving writes, and the "verify DST" note shows. */
  flag: boolean;
  /** Why saving must wait, or null. 'range': the terms add up past ±15 h.
   *  'direction': the Custom row holds an offset that names no direction. */
  error: 'pending' | 'offset' | 'range' | 'direction' | null;
  /** What saving writes, or null while it must wait (always null when locked:
   *  the form fixes a composite's zone itself). */
  toSave: ZoneFields | null;
  /** The radios the field unfolds to (2026-10-07), or null until there is a
   *  moment and place (and always for a composite). */
  chooser: ZoneChooser | null;
  /** The zone is not Automatic's: it was stated (here, or in the record) and
   *  stays put when the date or place moves. */
  overridden: boolean;
  /** An override that gives neither half of this place's pair on this date,
   *  nor its local mean time in that era (Lina, 2026-10-06: "flag instead if
   *  the stored zone becomes implausible" — never revert it). A time stated in
   *  UT is never implausible; it names no place's clock. */
  implausible: boolean;
}

/** The chooser's rows, by what they are rather than where they sit. */
export type ZoneRadio = 'auto' | 'other' | 'saved' | 'stated' | 'custom';

export interface ZoneChooser {
  /** What Automatic gives at this moment and place — the zone in force. */
  auto: ResolvedZone;
  /** The catalogue's reading of that zone (EST + daylight), or null in a
   *  mean-time era or where the catalogue has no row for the place that year. */
  inForce: StandardProposal | null;
  /** The other half of the place's standard/daylight pair for the year: EST
   *  when EDT is in force, EDT when EST is (offered only if the place kept it
   *  that year). Null where there is no pair. */
  other: ZonePickRow | null;
  /** The record's own terms, where they are none of the rows (war time, a
   *  zone picked by name, the stored number kept as saved…): "As saved". */
  saved: ZoneChoice | null;
  /** The terms in effect, where they are none of the rows either — an override
   *  the date or place has since moved off the pair (EST chosen against June's
   *  EDT, then the date moved to December, where EST is Automatic's). */
  stated: ZoneChoice | null;
  /** The row that is checked. */
  value: ZoneRadio;
}

export type ZoneAction =
  | { type: 'mode'; mode: ZoneEntryMode }
  | { type: 'standard'; zone: string | null }
  | { type: 'daylight'; code: DaylightCode }
  | { type: 'type'; text: string }
  | { type: 'direction'; dir: OffsetDirection }
  | { type: 'lmt' }
  | { type: 'ut' }
  | { type: 'iana'; zone: string }
  | { type: 'utc'; hours: number }
  | { type: 'choose'; pick: ZonePick };

/** An entry in the form's list: Auto, the birthplace's mean time, UT, the
 *  terms a saved chart reopened in, or a standard zone with a correction — or
 *  (2026-10-07) the radios' Custom row with its text as typed. */
export type ZonePick =
  | 'auto'
  | 'lmt'
  | 'ut'
  | 'saved'
  | { zone: string; daylight: DaylightCode }
  | { custom: string };

/** One named row of the list: a zone's standard time, or its daylight time. */
export interface ZonePickRow {
  /** The select's value, `id:code` (no catalogue id contains a colon). */
  value: string;
  zone: StandardZone;
  daylight: DaylightCode;
  /** The offset the row gives, east-positive whole seconds. */
  seconds: number;
  /** The standard time's name and abbreviation, or its daylight time's. */
  name: string;
  abbr: string | undefined;
  isDaylight: boolean;
}

/** The correction a zone's own daylight time adds — Lord Howe's is half an hour. */
const daylightCodeOf = (z: StandardZone): DaylightCode => z.dstCode ?? 'daylight';

const rowValue = (zone: string, daylight: DaylightCode) => `${zone}:${daylight}`;

function standardRow(z: StandardZone): ZonePickRow {
  return { value: rowValue(z.id, 'standard'), zone: z, daylight: 'standard', seconds: z.std, name: z.name, abbr: z.abbr, isDaylight: false };
}

function daylightRow(z: StandardZone): ZonePickRow | null {
  if (!z.dstName) return null;
  const daylight = daylightCodeOf(z);
  return {
    value: rowValue(z.id, daylight),
    zone: z,
    daylight,
    seconds: z.std + daylightSeconds(daylight),
    name: z.dstName,
    abbr: z.dstAbbr,
    isDaylight: true,
  };
}

/** Every row the catalogue gives, whatever the year. */
const ALL_ROWS: readonly ZonePickRow[] = STANDARD_ZONES.flatMap((z) => {
  const d = daylightRow(z);
  return d ? [standardRow(z), d] : [standardRow(z)];
});
const ROW_BY_VALUE = new Map(ALL_ROWS.map((r) => [r.value, r]));

/** The row a choice is, if the list has one. */
function rowOfChoice(c: ZoneChoice): ZonePickRow | undefined {
  return c.mode === 'standard' && c.zone ? ROW_BY_VALUE.get(rowValue(c.zone, c.daylight)) : undefined;
}

/**
 * The list's named rows for a birth year: the zones in use that year (an
 * era-bounded zone outside its years is left out, so a 1990 birth isn't offered
 * Hawaii's 1896–1947 half hour), plus the row now selected, wherever it falls.
 * West to east by offset, then by name.
 */
export function zonePickRows(year: number, selected?: string): ZonePickRow[] {
  return ALL_ROWS.filter((r) => zoneInUse(r.zone, year) || r.value === selected).sort(
    (a, b) => a.seconds - b.seconds || a.name.localeCompare(b.name, 'en'),
  );
}

/** What the list shows for a choice: its entry, or 'saved' for terms it has
 *  no entry for (only ever a saved chart's own — the list can't produce them). */
export function pickOfChoice(c: ZoneChoice): string {
  if (c.mode === 'auto') return 'auto';
  if (c.mode === 'offset' && (c.basis === 'lmt' || c.basis === 'ut')) return c.basis;
  return rowOfChoice(c)?.value ?? 'saved';
}

/** The select's value for a view. */
export function zonePickValue(view: ZoneView): string {
  return view.mode === 'auto' ? 'auto' : pickOfChoice(view.choice);
}

/** The pick a select value stands for. */
export function pickOfValue(value: string): ZonePick | null {
  if (value === 'auto' || value === 'lmt' || value === 'ut' || value === 'saved') return value;
  const r = ROW_BY_VALUE.get(value);
  return r ? { zone: r.zone.id, daylight: r.daylight } : null;
}

// ── The radios (2026-10-07) ──────────────────────────────────────────────────

/** Whether a zone's clock read `seconds` at some point in a year, sampled on the
 *  1st and 15th of every month — so a daylight half is offered only where the
 *  place kept it that year (Arizona's MST has a daylight row in the catalogue
 *  that Phoenix has not kept since 1967). Cached: the answer is a fact of the
 *  tz database, and the field asks it on every render. */
const keptCache = new Map<string, boolean>();
function zoneKept(iana: string, year: number, seconds: number): boolean {
  const key = `${iana}|${year}|${seconds}`;
  const hit = keptCache.get(key);
  if (hit !== undefined) return hit;
  let kept = false;
  for (let month = 1; month <= 12 && !kept; month++) {
    for (const day of [1, 15]) {
      const dt = DateTime.fromObject({ year, month, day, hour: 12 }, { zone: iana });
      if (dt.isValid && Math.round(dt.offset * 60) === seconds) {
        kept = true;
        break;
      }
    }
  }
  keptCache.set(key, kept);
  return kept;
}

/**
 * The other half of the zone in force: the standard time when a daylight
 * (summer, war, double) time is in force, the zone's own daylight time when its
 * standard time is. Exactly two plausible answers, so the question the reader
 * is really asking — was daylight saving applied? — has one click each way
 * (Lina, 2026-10-06). Null where there is no pair: a mean-time era, a place the
 * catalogue has no row for that year, a zone with no daylight time of its own
 * (India), or one that kept none that year.
 */
function otherHalf(inForce: StandardProposal | null, detected: ResolvedZone['detected'], year: number): ZonePickRow | null {
  if (!inForce || !detected) return null;
  // Double summer time in force: the question is whether the SECOND hour was applied,
  // so the other half is the zone's single daylight time where the place kept it that
  // year — London's summer of 1941 offers BST, not a GMT it never kept that year (found
  // in review, 2026-10-07). Berlin's 1945 midsummer time offers CEST the same way.
  if (inForce.daylight === 'double') {
    const d = daylightRow(inForce.zone);
    if (d && zoneKept(detected.iana, year, d.seconds)) return d;
  }
  if (inForce.daylight !== 'standard') return standardRow(inForce.zone);
  const d = daylightRow(inForce.zone);
  return d && zoneKept(detected.iana, year, d.seconds) ? d : null;
}

/** Every offset the zone's clock read in the year among its standard time and its
 *  daylight steps — what an override may plausibly state. Wider than the pair: in
 *  1941 London read +1 all winter and +2 all summer, so either is a real reading for
 *  any 1941 date, and a ⚠ on the one the radio doesn't offer would flag the right
 *  answer as wrong (review, 2026-10-07). */
function keptOffsets(inForce: StandardProposal | null, detected: ResolvedZone['detected'], year: number): number[] {
  if (!inForce || !detected) return [];
  const z = inForce.zone;
  const codes: DaylightCode[] = ['standard', daylightCodeOf(z), 'double'];
  return codes
    .map((c) => z.std + daylightSeconds(c))
    .filter((s) => Math.abs(s) <= MAX_ZONE_OFFSET_SECONDS && zoneKept(detected.iana, year, s));
}

const isOtherRow = (c: ZoneChoice, other: ZonePickRow | null): boolean =>
  !!other && c.mode === 'standard' && c.zone === other.zone.id && c.daylight === other.daylight;

/** The kind of entry the Custom row states: a plain typed offset, or one
 *  stated as UT. A local mean time is terms of its own (it follows the
 *  birthplace), so a saved one is offered back as "As saved". */
const isCustomKind = (c: ZoneChoice): boolean => c.mode === 'offset' && c.basis !== 'lmt';

const sameChoice = (a: ZoneChoice, b: ZoneChoice): boolean => JSON.stringify(a) === JSON.stringify(b);

/** A bare UT the reader typed into the Custom row: the time was given in
 *  Universal Time, recorded as such (basis 'ut') so it is named UT and never
 *  flagged against the birthplace's zones. */
const UT_WORDS = /^(ut|utc|gmt|z)$/i;

/** The Custom row's text for an offset it didn't get from typing: the ISO form
 *  without its "UTC" ("−04:00", "+00:39:57"), which reads back to the second —
 *  never the "4h W" astrological form (Lina, 2026-10-06). Empty past ±15 h,
 *  where no offset can be stated. */
export function customOffsetText(seconds: number): string {
  return Math.abs(seconds) <= MAX_ZONE_OFFSET_SECONDS ? formatUtcNotation(seconds, { padded: true }).replace(/^UTC/, '') : '';
}

/** The name of the zone a chart with these zone fields would carry at this
 *  moment and place — what every row of the field prints, through the one
 *  naming rule the chart header uses (lib/atlas/zoneName.ts), so the form and
 *  the header can't name one saved zone two ways. */
export function zoneNameOf(at: ZoneMoment, f: { tzOffset: number; tzIana?: string; tzEntry?: TzEntry }): ZoneName {
  return zoneNameForChart({
    year: at.year,
    month: at.month,
    day: at.day,
    hour: at.hour,
    minute: at.minute,
    tzOffset: f.tzOffset,
    tzIana: f.tzIana,
    tzEntry: f.tzEntry,
    birthplace: { lat: at.lat, lng: at.lng },
  });
}

/** The zone fields a choice resolves to here, for naming a row. */
export function choiceFields(c: ZoneChoice, at: ZoneMoment): { tzOffset: number; tzIana?: string; tzEntry?: TzEntry } {
  const r = resolveZoneChoice(c, at);
  return { tzOffset: r.seconds / 3600, tzIana: r.tzIana, tzEntry: r.tzEntry };
}

const directionOf = (seconds: number): OffsetDirection => (seconds < 0 ? 'west' : 'east');

/** A chart's own stored moment and place. */
export function atOfChart(c: StoredChart): ZoneMoment {
  return {
    lat: c.birthplace.lat,
    lng: c.birthplace.lng,
    year: c.year,
    month: c.month,
    day: c.day,
    hour: c.hour,
    minute: c.minute,
  };
}

/** How the field opens: a saved chart in the terms it was saved in, checked
 *  against its own stored moment (where those terms would no longer give the
 *  stored offset it opens on the stored number — reopenZoneChoice); a new
 *  chart, and a composite (whose zone is fixed), on Auto. */
export function openZone(initial: StoredChart | null | undefined): ZoneReopen {
  return initial && !initial.composite
    ? reopenZoneChoice(initial, atOfChart(initial))
    : { choice: { mode: 'auto' }, fellBack: false };
}

/** What the offset box shows for an entry it didn't get from typing: the ISO
 *  form since 2026-10-07, now that the Custom row shows it (it was "5h W"). */
function offsetDisplay(e: OffsetEntry): string {
  if (e.text) return e.text;
  return e.basis === 'ut' && e.seconds === 0 ? 'UT' : customOffsetText(e.seconds) || formatAstroNotation(e.seconds);
}

export function initialModel(opened: ZoneReopen, initial: StoredChart | null | undefined): ZoneModel {
  const c = opened.choice;
  return {
    mode: c.mode,
    choice: c,
    seedFrom: null,
    stated: false,
    offsetText: c.mode === 'offset' ? offsetDisplay(c) : '',
    offsetDir: c.mode === 'offset' ? directionOf(c.seconds) : 'east',
    lmtAt: c.mode === 'offset' && c.basis === 'lmt' && initial ? initial.birthplace.lng : null,
    // A saved offset reopens as stated, whatever its text: only typing in the
    // Custom row asks for a direction (a "5:30" saved through the hidden E/W
    // switch already has its sign in `seconds`).
    custom: false,
  };
}

/**
 * The Standard entry a switched-to Standard shows: the detected zone's own
 * terms when they give the offset in effect (from Auto they always do, except
 * at a mean-time birth), otherwise the same zone with whatever correction
 * gives that offset, otherwise nothing. Only a zone proposeStandardEntry names
 * — one the birthplace kept as its standard time that year — never a listed
 * zone that merely has the right number, which put Turkey's later +3 on
 * Istanbul's summer of 2000.
 */
function standardSeed(from: ResolvedZone, at: ZoneMoment): StandardEntry | null {
  const p = proposeStandardEntry(from.detected, at);
  if (!p) return null;
  if (entrySeconds(p.entry) === from.seconds) return p.entry;
  const code = DAYLIGHT_OPTIONS.find((o) => o.seconds === from.seconds - p.zone.std)?.code;
  return code ? { mode: 'standard', std: p.zone.std, daylight: code, zone: p.zone.id } : null;
}

/** The zone a way switched to shows, derived from the zone in effect before
 *  it; null where the way has nothing truthful to show (it is then pending). */
function seedZone(mode: ZoneEntryMode, source: ZoneChoice, from: ResolvedZone, at: ZoneMoment): ZoneChoice | null {
  if (source.mode === mode) return source;
  switch (mode) {
    case 'auto':
      return { mode: 'auto' };
    case 'standard':
      return standardSeed(from, at);
    case 'offset':
      // The offset in effect, so switching ways in changes nothing until
      // something is typed or pressed — unless it is beyond what an offset can
      // state (a mean time across the date line, Manila 1840's −15:56).
      return Math.abs(from.seconds) <= MAX_ZONE_OFFSET_SECONDS ? { mode: 'offset', seconds: from.seconds } : null;
    case 'iana':
      return from.detected ? { mode: 'iana', zone: from.detected.iana } : null;
    case 'utc': {
      // Only a whole hour the picker offers; anything else would be a silent
      // rounding of the birth moment, so the picker waits for a choice.
      const h = from.seconds / 3600;
      return UTC_PICKER_HOURS.includes(h) ? { mode: 'utc', hours: h } : null;
    }
  }
}

const sameMoment = (c: StoredChart, at: ZoneMoment) =>
  c.birthplace.lat === at.lat &&
  c.birthplace.lng === at.lng &&
  c.year === at.year &&
  c.month === at.month &&
  c.day === at.day &&
  c.hour === at.hour &&
  c.minute === at.minute;

export function zoneView(model: ZoneModel, { initial, opened, at }: ZoneInputs): ZoneView {
  const locked = !!initial?.composite;
  const unnamedStd =
    opened.choice.mode === 'standard' && opened.choice.zone == null ? opened.choice.std : null;
  const saved = initial && !locked && pickOfChoice(opened.choice) === 'saved' ? opened.choice : null;
  const idle: ZoneView = {
    locked,
    at,
    mode: model.mode,
    choice: model.choice,
    resolved: null,
    pending: false,
    seeded: false,
    offsetText: model.offsetText,
    offsetParsed: null,
    offsetDirection: model.offsetDir,
    directionStated: false,
    unnamedStd,
    lmtSeconds: null,
    lmtShifted: false,
    lmtAvailable: false,
    kept: null,
    saved,
    flag: false,
    error: null,
    toSave: null,
    chooser: null,
    overridden: false,
    implausible: false,
  };
  if (!at) return idle;

  // An LMT taken at another longitude follows the birthplace.
  const withLiveLmt = (c: ZoneChoice): ZoneChoice =>
    c.mode === 'offset' && c.basis === 'lmt' && model.lmtAt != null && at.lng !== model.lmtAt
      ? { mode: 'offset', seconds: birthplaceLmtSeconds(at), basis: 'lmt' }
      : c;

  const source = model.seedFrom ? withLiveLmt(model.seedFrom) : null;
  const from = source ? resolveZoneChoice(source, at) : null;
  const seed = source && from ? seedZone(model.mode, source, from, at) : null;
  const live = source ? (seed ?? source) : withLiveLmt(model.choice);
  const resolved = from && live === source ? from : resolveZoneChoice(live, at);
  const pending = !locked && model.mode !== live.mode;

  let offsetText = model.offsetText;
  if (model.mode === 'offset') {
    if (source) offsetText = seed?.mode === 'offset' ? formatAstroNotation(seed.seconds) : '';
    else if (live !== model.choice && live.mode === 'offset') offsetText = formatAstroNotation(live.seconds);
  }
  const offsetParsed = model.mode === 'offset' ? parseZoneOffset(offsetText) : null;
  const directionStated = !!offsetParsed?.explicit;
  const offsetDirection =
    offsetParsed?.explicit && offsetParsed.seconds !== 0 ? directionOf(offsetParsed.seconds) : model.offsetDir;

  const lmtSeconds = birthplaceLmtSeconds(at, resolved.detected);

  // The record, while the field shows exactly what it reopened as.
  const record = initial && !locked ? initial : null;
  const onRecord = !!record && !model.stated && !source && live === opened.choice;
  const verbatim = onRecord && !!record && sameMoment(record, at);

  // The flag of what is shown without having been stated: a record's own
  // where its terms are not a lookup (a stated entry, or a stored number kept
  // as saved), otherwise the lookup's at this moment.
  const unstatedFlag = (c: ZoneChoice, r: ResolvedZone): boolean =>
    record && c === opened.choice && (opened.fellBack || c.mode === 'standard' || c.mode === 'offset')
      ? !!record.tzUncertain
      : r.tzUncertain;
  const flag = verbatim
    ? !!record?.tzUncertain
    : model.stated
      ? resolved.tzUncertain
      : source && from
        ? unstatedFlag(source, from)
        : unstatedFlag(live, resolved);

  let kept: ZoneView['kept'] = null;
  if (opened.fellBack && onRecord) {
    const now = opened.was ? resolveZoneChoice(opened.was, at).seconds : null;
    if (now !== resolved.seconds) kept = { was: opened.was ?? null, now };
  }

  const rangeBad = !pending && (live.mode === 'standard' || live.mode === 'offset') && !resolved.tzEntry;
  const unreadable = model.mode === 'offset' && !offsetParsed;
  const directionless = model.custom && model.mode === 'offset' && !!offsetParsed && !offsetParsed.explicit;
  const error: ZoneView['error'] = locked
    ? null
    : directionless
      ? 'direction'
      : unreadable && offsetText.trim()
        ? 'offset'
        : pending
          ? 'pending'
          : unreadable
            ? 'offset'
            : rangeBad
              ? 'range'
              : null;

  let toSave: ZoneFields | null = null;
  if (!locked && !error) {
    toSave =
      verbatim && record
        ? {
            tzOffset: record.tzOffset,
            tzIana: record.tzIana,
            tzManual: !!record.tzManual,
            tzUncertain: !!record.tzUncertain,
            tzEntry: sanitizeTzEntry(record.tzEntry),
          }
        : {
            tzOffset: resolved.tzOffset,
            tzIana: resolved.tzIana,
            tzManual: resolved.tzManual,
            tzUncertain: flag,
            tzEntry: resolved.tzEntry,
          };
  }

  // The radios. Automatic's zone is the lookup at this moment whatever the
  // field holds, so the row offering it names what choosing it would give.
  let chooser: ZoneChooser | null = null;
  let implausible = false;
  const overridden = !locked && model.mode !== 'auto';
  if (!locked) {
    const auto = model.mode === 'auto' && !source ? resolved : resolveZoneChoice({ mode: 'auto' }, at);
    const inForce = proposeStandardEntry(auto.detected, at);
    const other = otherHalf(inForce, auto.detected, at.year);
    const o = opened.choice;
    const savedTerms =
      record && o.mode !== 'auto' && !isOtherRow(o, other) && !(isCustomKind(o) && !opened.fellBack) ? o : null;
    // Text typed in the Custom row keeps that row checked even while it can't
    // be read (no direction yet) and the zone in effect is still the last one.
    const value: ZoneRadio =
      model.mode === 'auto'
        ? 'auto'
        : model.custom
          ? 'custom'
          : isOtherRow(live, other)
            ? 'other'
            : savedTerms && sameChoice(live, savedTerms)
              ? 'saved'
              : isCustomKind(live)
                ? 'custom'
                : 'stated';
    chooser = { auto, inForce, other, saved: savedTerms, stated: value === 'stated' ? live : null, value };
    // Plausible: the zone in force, the other half of its pair, any other offset
    // the zone's clock read that year (keptOffsets), or (in the mean-time era,
    // where the zone in force IS the local mean time) that. To the second, within
    // the one a legacy record's float can carry.
    const plausible = [
      auto.seconds,
      ...(other ? [other.seconds] : []),
      ...keptOffsets(inForce, auto.detected, at.year),
    ];
    const ut = live.mode === 'offset' && live.basis === 'ut';
    implausible =
      overridden && !error && !ut && !plausible.some((s) => Math.abs(s - resolved.seconds) <= 1);
  }

  return {
    ...idle,
    choice: live,
    resolved,
    pending,
    seeded: !!source && !pending,
    offsetText,
    offsetParsed,
    offsetDirection,
    directionStated,
    lmtSeconds,
    lmtShifted: lmtSeconds !== lmtOffsetSeconds(at.lng),
    lmtAvailable: Math.abs(lmtSeconds) <= MAX_ZONE_OFFSET_SECONDS,
    kept,
    flag,
    error,
    toSave,
    chooser,
    overridden,
    implausible,
  };
}

/** What a control does. `view` is zoneView of this same model and inputs. */
export function zoneReduce(model: ZoneModel, action: ZoneAction, view: ZoneView, inputs: ZoneInputs): ZoneModel {
  const live = view.choice;
  // Anything done inside a way states its zone and ends the derivation. Only
  // the Custom row's own typing (below) marks the offset as typed there.
  const act = (patch: Partial<ZoneModel>): ZoneModel => ({ ...model, custom: false, ...patch, seedFrom: null, stated: true });

  switch (action.type) {
    case 'mode': {
      if (action.mode === model.mode || view.locked || !inputs.at) return model;
      // Derive from the zone the reader actually gave (or the record), however
      // many ways have been looked at since; returning to that way returns it.
      const root = model.seedFrom ?? model.choice;
      if (root.mode === action.mode) return { ...model, mode: action.mode, choice: root, seedFrom: null, custom: false };
      if (action.mode === 'auto') return { ...model, mode: 'auto', choice: { mode: 'auto' }, seedFrom: null, custom: false };
      return { ...model, mode: action.mode, seedFrom: root, custom: false };
    }
    case 'standard': {
      const daylight: DaylightCode = live.mode === 'standard' ? live.daylight : 'standard';
      if (action.zone == null) {
        return view.unnamedStd != null
          ? act({ choice: { mode: 'standard', std: view.unnamedStd, daylight } })
          : model;
      }
      const z = standardZoneById(action.zone);
      return z ? act({ choice: { mode: 'standard', std: z.std, daylight, zone: z.id } }) : model;
    }
    case 'daylight':
      return live.mode === 'standard' ? act({ choice: { ...live, daylight: action.code } }) : model;
    case 'type': {
      const p = parseZoneOffset(action.text);
      const dir = p?.explicit && p.seconds !== 0 ? directionOf(p.seconds) : view.offsetDirection;
      const base = { offsetText: action.text, offsetDir: dir, lmtAt: null };
      // Unreadable text keeps the last readable offset but sets `error`, which
      // blocks saving: what was typed is never replaced by a guess.
      if (!p) return act({ ...base, choice: live.mode === 'offset' ? live : model.choice });
      const seconds = applyOffsetDirection(p, dir);
      const entry: OffsetEntry = { mode: 'offset', seconds };
      const kept = action.text.trim().slice(0, OFFSET_TEXT_MAX);
      if (kept && textReadsAs(kept, seconds)) entry.text = kept;
      return act({ ...base, choice: entry });
    }
    case 'direction': {
      if (live.mode !== 'offset' || !view.offsetParsed || view.offsetParsed.explicit) {
        return { ...model, offsetDir: action.dir };
      }
      const entry: OffsetEntry = { mode: 'offset', seconds: applyOffsetDirection(view.offsetParsed, action.dir) };
      if (live.text) entry.text = live.text;
      return act({ choice: entry, offsetDir: action.dir, offsetText: view.offsetText });
    }
    case 'lmt': {
      const at = inputs.at;
      if (!at || view.lmtSeconds == null || !view.lmtAvailable) return model;
      const s = view.lmtSeconds;
      return act({
        choice: { mode: 'offset', seconds: s, basis: 'lmt' },
        lmtAt: at.lng,
        offsetText: formatAstroNotation(s),
        offsetDir: s ? directionOf(s) : model.offsetDir,
      });
    }
    case 'ut':
      return act({ choice: { mode: 'offset', seconds: 0, basis: 'ut' }, lmtAt: null, offsetText: 'UT' });
    case 'iana': {
      // The list shows the tz database's current names; the birthplace lookup
      // can return either. Picking the detected zone under any of its names
      // stays on the detected path, so the offset Auto showed is kept.
      const detected = view.resolved?.detected?.iana;
      const zone = detected && canonicalZone(action.zone) === canonicalZone(detected) ? detected : action.zone;
      return act({ choice: { mode: 'iana', zone } });
    }
    case 'utc':
      return act({ choice: { mode: 'utc', hours: action.hours } });
    case 'choose': {
      // The list's one action sets the way and its zone together: the controls
      // above leave `mode` alone (inside the five-way field they run within a
      // way already chosen), and two dispatches from one handler would lose
      // the first, since each reduces the same `model`.
      if (view.locked || !inputs.at) return model;
      const { pick } = action;
      // Back to the record's own terms — Auto included, where it was saved on
      // Auto — reopens them exactly, so saving writes the record back verbatim.
      if (pick === 'saved' || (pick === 'auto' && inputs.opened.choice.mode === 'auto')) {
        return initialModel(inputs.opened, inputs.initial);
      }
      if (pick === 'auto') return { ...model, mode: 'auto', choice: { mode: 'auto' }, seedFrom: null, custom: false };
      if (pick === 'lmt' || pick === 'ut') {
        const next = zoneReduce(model, { type: pick }, view, inputs);
        return next === model ? model : { ...next, mode: 'offset' };
      }
      if ('custom' in pick) {
        // The radios' Custom row (2026-10-07): the typed offset and the way
        // that holds it in one step, like every pick here.
        const text = pick.custom;
        const p = parseZoneOffset(text);
        if (p && !p.explicit) {
          // "5:30" with no sign or letter: which way is the whole question, and
          // the row has no East/West control to answer it. Keep the text and
          // the last offset; zoneView holds the save ('direction'). Guessing a
          // side would cast a perfectly plausible chart on the wrong side of UT.
          return {
            ...model,
            mode: 'offset',
            choice: live.mode === 'offset' ? live : model.choice,
            seedFrom: null,
            stated: true,
            offsetText: text,
            lmtAt: null,
            custom: true,
          };
        }
        const next = zoneReduce(model, { type: 'type', text }, view, inputs);
        const asUt = !!p && p.seconds === 0 && UT_WORDS.test(text.trim()) && next.choice.mode === 'offset';
        return {
          ...next,
          mode: 'offset',
          choice: asUt ? { ...(next.choice as OffsetEntry), basis: 'ut' } : next.choice,
          custom: true,
        };
      }
      const z = standardZoneById(pick.zone);
      return z
        ? act({ mode: 'standard', choice: { mode: 'standard', std: z.std, daylight: pick.daylight, zone: z.id } })
        : model;
    }
  }
}
