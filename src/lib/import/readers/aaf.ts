// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The astrological exchange format — the one interchange format worth reading
// directly, because being read by other programs is the whole reason it exists.
//
// Shape: a text file of records. A record opens with an #A93 chunk and runs to
// the next #A93 or end of file. Every chunk starts at column 1 with #, a chunk
// id, a colon, then comma-separated fields; no field may contain a comma, and *
// in any field means unknown. Anything ahead of the first #A93 is preamble.
//
// ── The daylight trap ───────────────────────────────────────────────────────
// The offset chunk states the zone's STANDARD offset, and a separate time-type
// code says how much daylight correction to add. Reading the offset as final —
// which is the natural reading, and what "honour the stated offset" invites —
// puts every summer birth an hour out, and an hour of error moves the angles by
// roughly 15°: a plausible chart, in the wrong place.
//
// This is checkable rather than assumed. Records carry the moment a second time,
// as a Julian Day, so the arithmetic can be verified against the source's own
// answer. Across a hundred-record sample every record reconciles: the 63 marked
// standard and the 2 marked mean-time agree with the offset as stated, and all
// 35 marked daylight agree only once the hour is added. The normalizer keeps
// doing that comparison per row, so a source that disagrees with us says so in
// the preview instead of importing quietly.

import {
  parseCoord,
  parseDateToken,
  parseOffsetToken,
  parseTimeToken,
} from '../fields';
import { localToJd } from '../julian';
import { extractRating } from '../../sourceRating';
import type { ChartKind, ImportedChart, ImportRow, Issue, OffsetKind } from '../types';
import { reject, warn } from '../types';

/** Whole seconds of daylight correction to ADD to the stated standard offset. */
const DAYLIGHT_CORRECTION: Record<string, number> = {
  '0': 0, // standard time
  m: 0, // special meridian — equivalent to standard
  '1': 3600, // daylight saving
  w: 3600, // war time — equivalent to daylight saving
  '2': 7200, // double daylight saving
  h: 1800, // half-hour daylight saving
  L: 0, // local mean time; the offset already IS the mean time
};

const OFFSET_KIND: Record<string, OffsetKind> = {
  '0': 'standard',
  m: 'meridian',
  '1': 'dst',
  w: 'dst',
  '2': 'dst',
  h: 'dst',
  L: 'lmt',
};

const KIND: Record<string, ChartKind> = {
  m: 'natal',
  f: 'natal',
  w: 'natal',
  e: 'event',
  l: 'event',
  o: 'organisation',
};

/** How far a derived instant may sit from a stated one before it is worth
 *  saying so: half a minute, which is below any rounding in the format and far
 *  below anything that moves a chart. */
const JD_TOLERANCE_DAYS = 30 / 86400;

interface Chunk {
  id: string;
  body: string;
}

/** True when the text looks like this format at all. */
export function looksLikeAaf(text: string): boolean {
  return /^#A93:/m.test(text);
}

export function readAaf(text: string): ImportRow[] {
  const lines = text.split('\n');
  const rows: ImportRow[] = [];

  let current: Chunk[] | null = null;
  let rawLines: string[] = [];
  let index = 0;

  const flush = () => {
    if (current) rows.push(buildRow(current, rawLines.join('\n'), ++index));
    current = null;
    rawLines = [];
  };

  for (const line of lines) {
    const m = line.match(/^#([A-Za-z0-9]*):?(.*)$/);
    if (m && m[1].toUpperCase() === 'A93') {
      flush();
      current = [{ id: 'A93', body: m[2] }];
      rawLines = [line];
      continue;
    }
    if (!current) continue; // preamble ahead of the first record
    rawLines.push(line);
    if (!m) continue;
    const id = m[1].toUpperCase();
    // Sub-records describe derived charts — returns, corrected times — which we
    // deliberately do not import. A bare "#:" is the exporter's own annotation
    // and carries no chart field, but it is kept rather than dropped: see
    // noonPlaceholder() for the one thing it is read for.
    if (id.startsWith('SUB')) continue;
    current.push({ id, body: m[2] });
  }
  flush();

  return rows;
}

function chunkBody(chunks: Chunk[], id: string): string | null {
  const c = chunks.find((x) => x.id === id);
  return c ? c.body : null;
}

function unknown(field: string | undefined): string {
  const t = (field ?? '').trim();
  return t === '*' ? '' : t;
}

/**
 * Whether a 12:00 reading is a placeholder rather than a birth at noon.
 *
 * Some exporters write noon when the time is not known, which is exactly the
 * "confidently wrong chart" an importer must not produce — and the only trace
 * is a trailing marker on an annotation line that carries no chart field. In a
 * hundred-record sample the marker never appeared on a record with a real time
 * (all 68 carried a plain 0) and appeared on 23 of the 32 noon records, so it
 * reads as an unknown-time flag.
 *
 * That correlation is not documentation, so this only ever produces a WARNING
 * and a time-unknown chart, both of which the editor can undo in a click. It
 * refuses to fire on any time other than exactly noon, so a genuine midday
 * birth is never quietly relabelled.
 */
function noonPlaceholder(chunks: Chunk[], time: { hour: number; minute: number; second: number }): boolean {
  if (time.hour !== 12 || time.minute !== 0 || time.second !== 0) return false;
  return chunks.some((c) => {
    if (c.id !== '' || !/\bsbli=/.test(c.body)) return false;
    const marker = c.body.trim().split(',').pop()?.trim() ?? '';
    return /^\d+$/.test(marker) && Number(marker) > 0;
  });
}

function buildRow(chunks: Chunk[], raw: string, index: number): ImportRow {
  const issues: Issue[] = [];
  const sourceRef = `Record ${index}`;
  const bail = (): ImportRow => ({
    index, sourceRef, raw, format: 'aaf', chart: null, issues, skipped: false,
  });

  const a = (chunkBody(chunks, 'A93') ?? '').split(',');
  // Seven fields exactly. A short count means a field carried a comma the format
  // does not allow — guessing at the boundaries would mis-assign every field
  // after it, so the record is flagged instead.
  if (a.length !== 7) {
    issues.push(reject('fieldCount', { expected: 7, got: a.length }));
    return bail();
  }

  const surname = unknown(a[0]);
  const given = unknown(a[1]);
  const name = [given, surname].filter(Boolean).join(' ').trim();
  const kind = KIND[unknown(a[2]).toLowerCase()] ?? 'unknown';

  const date = parseDateToken(a[3], 'dmy');
  if (!date || date.ambiguous) {
    issues.push(reject('badDate', { value: a[3].trim() }));
    return bail();
  }

  const time = parseTimeToken(a[4]);
  const placeName = unknown(a[5]);
  const countryState = unknown(a[6]);

  const b = (chunkBody(chunks, 'B93') ?? '').split(',');
  if (b.length !== 5) {
    issues.push(reject('fieldCount', { expected: 5, got: b.length }));
    return bail();
  }

  const lat = parseCoord(b[1], 'lat');
  const lng = parseCoord(b[2], 'lng');
  if (!lat || !lng) {
    issues.push(reject('badCoords', { value: `${b[1].trim()}, ${b[2].trim()}` }));
    return bail();
  }
  if (lat.outOfRange || lng.outOfRange) {
    issues.push(reject(lat.outOfRange ? 'latRange' : 'lngRange', {
      value: (lat.outOfRange ? b[1] : b[2]).trim(),
    }));
    return bail();
  }

  // The offset is written as hours, a direction letter, then minutes and
  // optional seconds: 5hw00, 1he00, 6hw18:56. The letter is the direction, so
  // no sign convention has to be asked about here.
  const rawOffset = b[3].trim();
  const om = rawOffset.match(/^(\d{1,2})h([ew])(\d{0,2})(?::(\d{1,2}))?$/i);
  let offsetSeconds: number;
  if (om) {
    const magnitude = Number(om[1]) * 3600 + Number(om[3] || 0) * 60 + Number(om[4] || 0);
    offsetSeconds = om[2].toLowerCase() === 'w' ? -magnitude : magnitude;
  } else {
    const generic = parseOffsetToken(rawOffset);
    if (!generic) {
      issues.push(warn('noOffset', { value: rawOffset }));
      offsetSeconds = 0;
    } else {
      offsetSeconds = generic.seconds;
    }
  }

  const timeType = b[4].trim();
  const correction = DAYLIGHT_CORRECTION[timeType] ?? DAYLIGHT_CORRECTION[timeType.toLowerCase()] ?? 0;
  offsetSeconds += correction;

  const placeholder = !!time && noonPlaceholder(chunks, time);
  const timeKnown = !!time && !placeholder;
  const local = {
    year: date.year,
    month: date.month,
    day: date.day,
    hour: timeKnown ? time.hour : 12,
    minute: timeKnown ? time.minute : 0,
    second: timeKnown ? time.second : 0,
  };
  if (!time) issues.push(warn('noTime'));
  else if (placeholder) issues.push(warn('noTimeAssumed'));
  if (!name) issues.push(warn('noName', { fallback: index }));

  const notes = [chunkBody(chunks, 'SRC'), chunkBody(chunks, 'VIA'), chunkBody(chunks, 'COM')]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join('\n');

  const chart: ImportedChart = {
    name: name || `Imported ${index}`,
    kind,
    local,
    timeKnown,
    offsetSeconds,
    offsetSource: 'file',
    offsetKind: OFFSET_KIND[timeType] ?? OFFSET_KIND[timeType.toLowerCase()] ?? 'unknown',
    zoneAbbrev: (chunkBody(chunks, 'ZNAM') ?? '').trim() || undefined,
    placeName: placeName || undefined,
    countryState: countryState || undefined,
    latitude: lat.value,
    longitude: lng.value,
    coordSource: 'file',
    calendar: date.calendar ?? 'auto',
    notes: notes || undefined,
    sourceRating: extractRating(notes) ?? undefined,
  };

  // The stated moment, when there is one, checks our reading of every field
  // that went into it — the date order, the offset direction, and above all
  // whether the daylight correction belonged.
  const statedJd = b[0].trim();
  if (statedJd && statedJd !== '*') {
    const stated = Number(statedJd);
    if (Number.isFinite(stated)) {
      chart.statedJd = stated;
      // Only meaningful against a real reading: a placeholder noon has no
      // instant to disagree with.
      if (timeKnown) {
        const derived = localToJd(local, offsetSeconds, chart.calendar);
        const driftMinutes = (derived - stated) * 24 * 60;
        if (Math.abs(derived - stated) > JD_TOLERANCE_DAYS) {
          issues.push(warn('jdMismatch', { minutes: Math.round(driftMinutes) }));
        }
      }
    }
  }

  return { index, sourceRef, raw, format: 'aaf', chart, issues, skipped: false };
}
