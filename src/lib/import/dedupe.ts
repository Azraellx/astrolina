// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Spotting a chart that is already here.
//
// Importing the same export twice is the normal way this happens — a file gets
// re-exported after a few additions and dropped in whole. Matching on the same
// person, the same moment and the same place catches that without catching
// twins, who share a place and a date but not a minute, or a parent and child
// who share a name.
//
// Coordinates are compared with a tolerance because sources round them
// differently: one writes 43N39 and another 43.6500, and to an arcminute those
// are the same town.

import type { StoredChart } from '../chartLibrary';
import type { ImportControls, ImportedChart, ImportRow } from './types';
import { warn } from './types';

/** One arcminute, the point below which two coordinates are the same place. */
const COORD_TOLERANCE_DEGREES = 1 / 60;

function normName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** The three things that have to match, flattened so a stored chart and an
 *  imported one can be compared without caring which is which. */
interface Fingerprint {
  name: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  lat: number;
  lng: number;
}

function fingerprintOf(c: ImportedChart): Fingerprint {
  return {
    name: normName(c.name),
    year: c.local.year,
    month: c.local.month,
    day: c.local.day,
    hour: c.local.hour,
    minute: c.local.minute,
    lat: c.latitude,
    lng: c.longitude,
  };
}

function fingerprintOfStored(c: StoredChart): Fingerprint {
  return {
    name: normName(c.name),
    year: c.year,
    month: c.month,
    day: c.day,
    hour: c.hour,
    minute: c.minute,
    lat: c.birthplace.lat,
    lng: c.birthplace.lng,
  };
}

function matches(a: Fingerprint, b: Fingerprint): boolean {
  return (
    a.name === b.name &&
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute &&
    Math.abs(a.lat - b.lat) <= COORD_TOLERANCE_DEGREES &&
    Math.abs(a.lng - b.lng) <= COORD_TOLERANCE_DEGREES
  );
}

/**
 * Flag rows that match a chart already in the library, or an earlier row of the
 * same batch.
 *
 * Flagging only — nothing is dropped here. A flagged row is marked skipped when
 * the control says to skip duplicates, which is the default, and the preview
 * lets any individual row be brought in anyway.
 */
export function markDuplicates(
  rows: ImportRow[],
  existing: readonly StoredChart[],
  controls: ImportControls,
): void {
  const library = existing.map(fingerprintOfStored);
  const seen: Fingerprint[] = [];

  for (const row of rows) {
    const c = row.chart;
    if (!c || row.issues.some((i) => i.severity === 'reject')) continue;

    const fp = fingerprintOf(c);
    const inLibrary = library.some((e) => matches(fp, e));
    const inBatch = seen.some((s) => matches(fp, s));

    if (inLibrary || inBatch) {
      row.issues.push(warn('duplicate', { where: inLibrary ? 'library' : 'file' }));
      if (controls.skipDuplicates) row.skipped = true;
    }
    seen.push(fp);
  }
}
