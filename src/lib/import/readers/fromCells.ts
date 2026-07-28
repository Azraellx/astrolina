// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// One row of cells plus a mapping becomes one record.
//
// Delimited files and fixed-width files differ only in how a line is cut into
// cells; everything after that cut is identical, so it lives here once. That is
// also what makes the two provably agree: the same file expressed either way
// runs through the same assembly and has to produce the same record.

import {
  parseCoord,
  parseDateToken,
  parseFlag,
  parseOffsetToken,
  parseTimeToken,
  type DateFormat,
  type TimeFormat,
} from '../fields';
import { extractRating, normalizeRating } from '../../sourceRating';
import type { ColumnSpec, FieldTarget } from '../mapping';
import type { ImportControls, ImportedChart, ImportRow, Issue, SourceFormat } from '../types';
import { reject, warn } from '../types';

export interface CellRowContext {
  index: number;
  sourceRef: string;
  raw: string;
  format: SourceFormat;
  /** Continuation lines the reader attached to this record (see readers/fixed). */
  trailingNotes?: string[];
}

type Bag = Partial<Record<FieldTarget, string>> & {
  dateFormat?: DateFormat;
  timeFormat?: TimeFormat;
};

function collect(cells: string[], columns: ColumnSpec[]): Bag {
  const bag: Bag = {};
  columns.forEach((spec, i) => {
    if (spec.target === 'ignore') return;
    const value = (cells[i] ?? '').trim();
    if (!value) return;
    // Repeated targets append rather than overwrite, which is what a second
    // notes column almost always means.
    if (spec.target === 'notes' && bag.notes) bag.notes = `${bag.notes}\n${value}`;
    else bag[spec.target] = value;
    if (spec.target === 'date' && spec.dateFormat) bag.dateFormat = spec.dateFormat;
    if (spec.target === 'time' && spec.timeFormat) bag.timeFormat = spec.timeFormat;
  });
  return bag;
}

export function rowFromCells(
  cells: string[],
  columns: ColumnSpec[],
  controls: ImportControls,
  ctx: CellRowContext,
): ImportRow {
  const issues: Issue[] = [];
  const bag = collect(cells, columns);
  const bail = (): ImportRow => ({
    index: ctx.index, sourceRef: ctx.sourceRef, raw: ctx.raw,
    format: ctx.format, chart: null, issues, skipped: false,
  });

  // ── Who ───────────────────────────────────────────────────────────────────
  const name =
    bag.name?.trim() ||
    [bag.firstName, bag.lastName].filter(Boolean).join(' ').trim();
  if (!name) issues.push(warn('noName', { fallback: ctx.index }));

  // ── When ──────────────────────────────────────────────────────────────────
  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;
  let calendar: 'gregorian' | 'julian' | undefined;

  if (bag.date) {
    const d = parseDateToken(bag.date, bag.dateFormat ?? controls.dateOrder);
    if (!d) {
      issues.push(reject('badDate', { value: bag.date }));
      return bail();
    }
    if (d.ambiguous) {
      // Both readings are possible and neither is more likely. Rather than pick
      // one, say so: the preview's date-order control settles it in one click.
      issues.push(reject('ambiguousDate', { value: bag.date }));
      return bail();
    }
    ({ year, month, day } = d);
    calendar = d.calendar;
  } else if (bag.year && bag.month && bag.day) {
    // Split date columns, as hand-built spreadsheets tend to have.
    year = Number(bag.year);
    month = monthFrom(bag.month);
    day = Number(bag.day);
  }

  if (year == null || month == null || day == null || !Number.isFinite(year) || !month || !day) {
    issues.push(reject('noDate'));
    return bail();
  }

  let time = bag.time ? parseTimeToken(bag.time, bag.timeFormat ?? 'auto') : null;
  if (!time && bag.hour) {
    const h = Number(bag.hour);
    const mi = bag.minute ? Number(bag.minute) : 0;
    const s = bag.second ? Number(bag.second) : 0;
    if (Number.isFinite(h) && Number.isFinite(mi) && Number.isFinite(s)) {
      let hour = h;
      const ap = bag.meridiem?.trim().toLowerCase();
      if (ap?.startsWith('p') && hour < 12) hour += 12;
      if (ap?.startsWith('a') && hour === 12) hour = 0;
      time = { hour, minute: mi, second: s };
    }
  }
  if (!time) issues.push(warn('noTime'));

  // ── Where ─────────────────────────────────────────────────────────────────
  if (!bag.latitude || !bag.longitude) {
    // Import never geocodes. A place name alone would have to be looked up, and
    // a looked-up place is a different place than the one the astrologer
    // recorded — often by enough to move a line. Say which is missing so the
    // fix is obvious.
    issues.push(reject(bag.place ? 'noCoords' : 'noPlace', { place: bag.place ?? '' }));
    return bail();
  }
  const lat = parseCoord(bag.latitude, 'lat');
  const lng = parseCoord(bag.longitude, 'lng');
  if (!lat || !lng) {
    issues.push(reject('badCoords', { value: `${bag.latitude}, ${bag.longitude}` }));
    return bail();
  }
  // Readable, but not a place on Earth. Named precisely, because "91" tells the
  // user which column to look at and "could not read them" does not.
  if (lat.outOfRange) {
    issues.push(reject('latRange', { value: bag.latitude }));
    return bail();
  }
  if (lng.outOfRange) {
    issues.push(reject('lngRange', { value: bag.longitude }));
    return bail();
  }

  // A hemisphere letter settles a coordinate's sign outright. A bare decimal
  // does not, and cannot be made to: which way a source counts is a property of
  // the source, not of the number. That question goes to the preview control,
  // and the row says it was answered rather than measured.
  //
  // The control governs LONGITUDE only. Sources that count west as positive are
  // documented as doing so for longitude and are silent on latitude, and north
  // positive is close to universal — so a bare latitude is taken as written and
  // flagged, rather than flipped on the strength of a neighbouring convention.
  const latitude = lat.value;
  let longitude = lng.value;
  if (!lng.explicit && controls.longitudeSign === 'west-positive') longitude = -longitude;
  if (!lat.explicit || !lng.explicit) issues.push(warn('signAssumed'));

  // ── The offset ────────────────────────────────────────────────────────────
  // Unlike a coordinate, an offset's WRITTEN sign does not settle it either:
  // some sources count hours to add to reach UT, which is the negative of the
  // offset. So the convention applies to the value whether or not a sign
  // character was present.
  let offsetSeconds = 0;
  let offsetSource: ImportedChart['offsetSource'] = 'derived';
  if (bag.offset) {
    const off = parseOffsetToken(bag.offset);
    if (!off) {
      // An offset was stated and it is not a possible one. That is different
      // from none being stated: the field is wrong, so the row is wrong, and
      // quietly substituting our own value would hide it behind a chart that
      // looks fine. Reject rather than guess.
      issues.push(reject('offsetRange', { value: bag.offset }));
      return bail();
    }
    offsetSeconds = controls.offsetSign === 'west-positive' ? -off.seconds : off.seconds;
    offsetSource = 'file';
  } else {
    // Nothing stated: derive it from the birthplace, and say so.
    issues.push(warn('noOffset', { value: '' }));
  }

  // A separate daylight column means the offset beside it is the STANDARD one
  // and the hour has still to be added.
  let offsetKind: ImportedChart['offsetKind'] = offsetSource === 'file' ? 'standard' : 'unknown';
  if (bag.dstFlag) {
    const dst = parseFlag(bag.dstFlag);
    if (dst) {
      offsetSeconds += 3600;
      offsetKind = 'dst';
    }
  }

  // The place and country stay separate on the record; normalize.ts joins them
  // into the one label a chart carries, so every reader labels alike.
  const notes = [bag.notes, ...(ctx.trailingNotes ?? [])].filter(Boolean).join('\n');
  // A mapped rating column wins; failing that, look for one announced inside
  // the notes ("Rodden: AA"), which is where sources without a column put it.
  const sourceRating = normalizeRating(bag.rating) ?? extractRating(notes);

  const chart: ImportedChart = {
    name: name || `Imported ${ctx.index}`,
    kind: 'unknown',
    local: {
      year,
      month,
      day,
      hour: time?.hour ?? 12,
      minute: time?.minute ?? 0,
      second: time?.second ?? 0,
    },
    timeKnown: !!time,
    offsetSeconds,
    offsetSource,
    offsetKind,
    zoneAbbrev: bag.zoneAbbrev || undefined,
    placeName: bag.place || undefined,
    countryState: bag.country || undefined,
    latitude,
    longitude,
    coordSource: 'file',
    calendar: calendar ?? 'auto',
    notes: notes || undefined,
    sourceRating: sourceRating ?? undefined,
    folder: bag.folder || undefined,
  };

  return {
    index: ctx.index, sourceRef: ctx.sourceRef, raw: ctx.raw,
    format: ctx.format, chart, issues, skipped: false,
  };
}

const MONTH_NAMES = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

/** A month column may hold a number or a name. */
function monthFrom(token: string): number | null {
  const t = token.trim();
  if (/^\d{1,2}$/.test(t)) {
    const n = Number(t);
    return n >= 1 && n <= 12 ? n : null;
  }
  const i = MONTH_NAMES.indexOf(t.slice(0, 3).toLowerCase());
  return i >= 0 ? i + 1 : null;
}
