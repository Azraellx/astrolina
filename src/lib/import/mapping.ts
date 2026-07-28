// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// What each column in a file HOLDS — the one piece of knowledge no importer can
// derive on its own.
//
// Rather than ship a table of layouts for particular programs, the user points
// at their own file once and says which column is which. That covers every
// program that can write text, including ones nobody has thought of, and the
// answer is then saved: a later file of the same shape is recognised and the
// mapping re-offered, so the setup happens once rather than every time.
//
// A saved mapping is portable on purpose. Astrologers using the same program
// have the same columns, so one person's mapping is everyone's, and it travels
// as a small file between them instead of being baked in here.

import type { DateFormat, TimeFormat } from './fields';

/** What a column holds. 'ignore' is the default for anything unrecognised —
 *  silence is safer than a wrong guess. */
export type FieldTarget =
  | 'ignore'
  | 'name'
  | 'firstName'
  | 'lastName'
  | 'date'
  | 'year'
  | 'month'
  | 'day'
  | 'time'
  | 'hour'
  | 'minute'
  | 'second'
  | 'meridiem'
  | 'offset'
  | 'dstFlag'
  | 'zoneAbbrev'
  | 'place'
  | 'country'
  | 'latitude'
  | 'longitude'
  | 'notes'
  | 'rating'
  | 'folder';

/** The order the mapping dropdown offers, grouped the way people think about a
 *  birth record: who, when, where, and the two organizing extras. */
export const FIELD_TARGETS: readonly FieldTarget[] = [
  'ignore',
  'name', 'firstName', 'lastName',
  'date', 'year', 'month', 'day',
  'time', 'hour', 'minute', 'second', 'meridiem',
  'offset', 'dstFlag', 'zoneAbbrev',
  'place', 'country', 'latitude', 'longitude',
  'notes', 'rating', 'folder',
];

export interface ColumnSpec {
  target: FieldTarget;
  /** Only meaningful on a 'date' column; how to read an all-numeric token. */
  dateFormat?: DateFormat;
  /** Only meaningful on a 'time' column. */
  timeFormat?: TimeFormat;
}

export interface ColumnMapping {
  /** Delimited files split themselves; fixed-width files need boundaries. */
  kind: 'delimited' | 'fixed';
  delimiter?: string;
  hasHeader?: boolean;
  /** Character offsets each fixed-width column STARTS at, ascending, first
   *  implicitly 0. Unused for delimited files. */
  boundaries?: number[];
  columns: ColumnSpec[];
}

export interface SavedMapping extends ColumnMapping {
  id: string;
  name: string;
  /** Shape fingerprint — column count and widths, or delimiter and count. Two
   *  files from the same program share it; nothing else does. */
  signature: string;
  updatedAt: number;
}

// ── Recognising a header row ────────────────────────────────────────────────

// Header names seen in the wild, folded to letters only so "Zone Time (String)",
// "zone_time" and "ZONETIME" all land in the same place.
const HEADER_HINTS: [FieldTarget, RegExp][] = [
  ['firstName', /^(first|given|fore)(name)?$/],
  ['lastName', /^(last|sur|family)(name)?$/],
  ['name', /^(name|description|chartname|subject|person|fullname)$/],
  ['year', /^(year|yr|birthyear)$/],
  ['month', /^(month|mon|mth|birthmonth)$/],
  ['day', /^(day|birthday|dayofmonth)$/],
  ['date', /^(date|birthdate|dateofbirth|dob|birthday)$/],
  ['hour', /^(hour|hr|birthhour)$/],
  ['minute', /^(minute|min|birthminute)$/],
  ['second', /^(second|sec)$/],
  ['meridiem', /^(ampm|meridiem|amorpm)$/],
  ['time', /^(time|birthtime|timeofbirth|tob)$/],
  ['dstFlag', /^(dst|daylight|daylightsaving|summertime|dstflag)$/],
  ['zoneAbbrev', /^(zoneabbrev\w*|zonename|tzabbr\w*|zonecode)$/],
  ['offset', /^(offset|utcoffset|gmtoffset|zonetime|timezone|zone|tz)$/],
  ['country', /^(country|state|province|region|countrystate|nation)$/],
  ['place', /^(place|city|placename|town|birthplace|locality|location)$/],
  ['latitude', /^(latitude|lat)$/],
  ['longitude', /^(longitude|long|lon|lng)$/],
  ['rating', /^(rating|rodden|roddenrating|rr|accuracy|datasource|sourcerating)$/],
  ['notes', /^(notes?|comments?|source|remarks?|memo)$/],
  ['folder', /^(folder|group|category|class|collection|file)$/],
];

function fold(header: string): string {
  return header.toLowerCase().replace(/[^a-z]/g, '');
}

/** Best guess at what a single header names, or 'ignore' when nothing fits. */
export function targetForHeader(header: string): FieldTarget {
  const key = fold(header);
  if (!key) return 'ignore';
  for (const [target, re] of HEADER_HINTS) {
    if (re.test(key)) return target;
  }
  return 'ignore';
}

/** Map a whole header row, refusing to assign the same target twice — a second
 *  "date" column is far more likely to be something else than a duplicate. */
export function mapHeaderRow(headers: string[]): ColumnSpec[] {
  const taken = new Set<FieldTarget>();
  return headers.map((h) => {
    const target = targetForHeader(h);
    if (target === 'ignore' || taken.has(target)) return { target: 'ignore' };
    taken.add(target);
    return { target, dateFormat: target === 'date' ? 'auto' : undefined };
  });
}

/** Whether a row of cells reads as headers rather than data: mostly non-numeric,
 *  and at least two of them recognisable. */
export function looksLikeHeaderRow(cells: string[]): boolean {
  const named = cells.filter((c) => targetForHeader(c) !== 'ignore').length;
  const numeric = cells.filter((c) => /^\s*[-+]?[\d.]+\s*$/.test(c)).length;
  return named >= 2 && numeric <= cells.length / 3;
}

// ── Saved mappings ──────────────────────────────────────────────────────────

const STORE_KEY = 'astro:import-mappings:v1';

/** A shape fingerprint that two files from the same source share. */
export function signatureOf(mapping: ColumnMapping, columnCount: number): string {
  return mapping.kind === 'fixed'
    ? `fixed:${(mapping.boundaries ?? []).join('.')}`
    : `delim:${mapping.delimiter === '\t' ? 'tab' : mapping.delimiter}:${columnCount}`;
}

export function loadMappings(): SavedMapping[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as SavedMapping[];
    return Array.isArray(list) ? list.filter(isMapping) : [];
  } catch {
    return [];
  }
}

function isMapping(m: unknown): m is SavedMapping {
  const x = m as SavedMapping;
  return !!x && typeof x.id === 'string' && typeof x.name === 'string' && Array.isArray(x.columns);
}

export function saveMapping(mapping: SavedMapping): SavedMapping[] {
  const list = loadMappings().filter((m) => m.id !== mapping.id);
  list.push(mapping);
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    // A full or unavailable store must not lose the import in progress; the
    // mapping simply is not remembered for next time.
  }
  return list;
}

export function deleteMapping(id: string): SavedMapping[] {
  const list = loadMappings().filter((m) => m.id !== id);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    /* see saveMapping */
  }
  return list;
}

/** The saved mapping that fits this file's shape, if one does. */
export function findMapping(signature: string): SavedMapping | null {
  return loadMappings().find((m) => m.signature === signature) ?? null;
}

export function newMappingId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
