// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import type { SourceRating } from '../sourceRating';

// The canonical import record and the vocabulary of things that can go wrong.
//
// Every reader produces `ImportedChart` and nothing else; the rest of the import
// path only ever sees this shape. That is what makes a chart read out of a
// delimited file, a fixed-width file, an exchange-format file or a pasted block
// provably identical — the readers differ, the record does not.

/** Where a record came from. Informational: it rides the row for the error report. */
export type SourceFormat = 'delimited' | 'fixed' | 'aaf' | 'block';

/** What kind of moment the record describes. Only ever informational here — the
 *  app has one chart type — but sources distinguish them and dropping the
 *  distinction would silently relabel an event as a person. */
export type ChartKind = 'natal' | 'event' | 'organisation' | 'unknown';

/** How the record's UTC offset was arrived at. 'file' means the source stated it
 *  and we kept it verbatim; 'derived' means nothing was stated and the offset
 *  came from the birthplace. */
export type OffsetSource = 'file' | 'derived';

/** What the source said the offset MEANS. Kept because it decides whether a
 *  daylight correction has already been applied, and because a mean-time offset
 *  must survive to the second. */
export type OffsetKind = 'standard' | 'dst' | 'lmt' | 'meridian' | 'unknown';

/** Whether coordinates came from the file or would have to be looked up. Import
 *  never geocodes, so a record with no coordinates is rejected rather than
 *  quietly placed. */
export type CoordSource = 'file' | 'geocoded';

export type Calendar = 'gregorian' | 'julian' | 'auto';

/** A wall-clock reading exactly as the source stated it, before any offset is
 *  applied. Seconds are kept because mean-time sources carry them. */
export interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface ImportedChart {
  name: string;
  kind: ChartKind;
  local: LocalDateTime;
  /** False when the source had no birth time. The local reading then holds a
   *  noon placeholder, matching how the app stores an unknown time everywhere
   *  else — the moment stays computable and every time-of-day layer degrades. */
  timeKnown: boolean;
  /**
   * Signed, EAST POSITIVE, in whole SECONDS.
   *
   * Seconds rather than hours because mean-time offsets are not round: a 19th
   * century birth runs at its own longitude / 15°, e.g. +0:39:57. The app stores
   * `tzOffset` as float hours, so the conversion happens once, at the boundary
   * in normalize.ts — never inside a reader, where repeated float arithmetic
   * would drift.
   */
  offsetSeconds: number;
  offsetSource: OffsetSource;
  offsetKind: OffsetKind;
  /** e.g. "EDT". Informational only — never used to derive the offset, because
   *  abbreviations are ambiguous across regions. */
  zoneAbbrev?: string;
  placeName?: string;
  countryState?: string;
  /** NORTH POSITIVE, decimal degrees. */
  latitude: number;
  /** EAST POSITIVE, decimal degrees. */
  longitude: number;
  coordSource: CoordSource;
  calendar: Calendar;
  /** Provenance the source carried: comment lines, source/researcher notes,
   *  rating strings. Astrologers care about these more than almost anything
   *  else in the record, so they are preserved rather than dropped. */
  notes?: string;
  /** How far the source said its data can be trusted, fitted to the seven
   *  codes in lib/sourceRating.ts. */
  sourceRating?: SourceRating;
  /** Folder path this record should land in, when the source offered one. */
  folder?: string;
  /**
   * A moment the source stated outright, as a Julian Day, when it had one.
   *
   * This is a gift: it lets the normalizer check its own arithmetic. Where a
   * stated instant and the one we derive from the date, time and offset
   * disagree, one of the two readings is wrong, and the row says so instead of
   * importing a chart that is confidently an hour out.
   */
  statedJd?: number;
}

// ── Issues ──────────────────────────────────────────────────────────────────

/**
 * Why a row is amber or red. Codes rather than sentences: the modal renders
 * them through the catalog, so the reasons translate with everything else.
 * Each code's message lives at `importChartModal.issue.<code>`.
 */
export type IssueCode =
  // rejects — the row cannot become a chart
  | 'noDate'
  | 'badDate'
  | 'ambiguousDate'
  | 'noPlace'
  | 'noCoords'
  | 'badCoords'
  | 'latRange'
  | 'lngRange'
  | 'yearRange'
  | 'offsetRange'
  | 'fieldCount'
  | 'unreadable'
  // warnings — the row imports, with something worth a glance
  | 'noName'
  | 'noTime'
  | 'noTimeAssumed'
  | 'noOffset'
  | 'jdMismatch'
  | 'zoneDisagrees'
  | 'signAssumed'
  | 'duplicate';

export type Severity = 'ok' | 'warn' | 'reject';

export interface Issue {
  code: IssueCode;
  severity: 'warn' | 'reject';
  /** Interpolated into the catalog message, e.g. { year: 1503 }. */
  vars?: Record<string, string | number>;
}

/** A single record's worth of the report: what we made of it, and what to say. */
export interface ImportRow {
  /** 1-based position in the file — what the error report cites. */
  index: number;
  /** Human reference for this row, e.g. "Row 12" or "Record 3". */
  sourceRef: string;
  /** The original line or record, kept verbatim for the error report. */
  raw: string;
  format: SourceFormat;
  /** Null when the row could not be read far enough to form a record. */
  chart: ImportedChart | null;
  issues: Issue[];
  /** True when the user has chosen to skip this row (duplicates default to it). */
  skipped: boolean;
}

export function rowSeverity(row: ImportRow): Severity {
  if (!row.chart || row.issues.some((i) => i.severity === 'reject')) return 'reject';
  return row.issues.length > 0 ? 'warn' : 'ok';
}

export function reject(code: IssueCode, vars?: Issue['vars']): Issue {
  return { code, severity: 'reject', vars };
}

export function warn(code: IssueCode, vars?: Issue['vars']): Issue {
  return { code, severity: 'warn', vars };
}

// ── Controls ────────────────────────────────────────────────────────────────

/** Which way a source counts longitude. Sources disagree, and the disagreement
 *  cannot be inferred from the numbers, so it is asked rather than guessed. */
export type SignConvention = 'east-positive' | 'west-positive';

/** How to read an all-numeric date. 'auto' infers when a value exceeds 12 and
 *  otherwise refuses, rather than picking one silently. */
export type DateOrder = 'auto' | 'dmy' | 'mdy' | 'ymd';

/** What to do where the file's stated offset and ours disagree. Defaults to
 *  keeping the file's: it is usually the value an astrologer already checked
 *  against a printed atlas, and our tz data disagrees with those for
 *  pre-1970 and mean-time births. */
export type ZonePreference = 'file' | 'app';

export interface ImportControls {
  longitudeSign: SignConvention;
  offsetSign: SignConvention;
  dateOrder: DateOrder;
  zonePreference: ZonePreference;
  /** Skip rows that match a chart already in the library (default) or bring
   *  them in anyway. */
  skipDuplicates: boolean;
  /** Folder every imported chart lands in. Empty = unfiled. A record that
   *  carries its own folder (a mapped column) wins over this. */
  folder: string;
}

export const DEFAULT_CONTROLS: ImportControls = {
  longitudeSign: 'east-positive',
  offsetSign: 'east-positive',
  dateOrder: 'auto',
  zonePreference: 'file',
  skipDuplicates: true,
  folder: '',
};

/** Everything the preview needs to render, and the commit step needs to save. */
export interface ImportReport {
  rows: ImportRow[];
  format: SourceFormat;
  /** Set when the reader could not proceed at all (an empty or unrecognised
   *  input), as a code for the catalog. */
  fatal?: IssueCode;
}
