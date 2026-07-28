// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The rulings every record passes through, whatever read it, and the one place
// an imported record becomes a chart.
//
// Readers know about file shapes; this file knows about charts. Anything that
// applies regardless of how the record was written lives here, so there is one
// answer to each question rather than one per reader.

import { newChartId, NOTES_HARD_LIMIT, type StoredChart } from '../chartLibrary';
import { getIanaTimezone, resolveBirthTimezone } from '../atlas/timezone';
import type { ImportControls, ImportedChart, ImportRow } from './types';
import { reject, warn } from './types';

// The bundled ephemeris data covers 1800–2399. Outside it the engine quietly
// drops the asteroids and falls back to a lower-accuracy model, so a chart out
// there would be degraded with nothing to show for it. Rejected per row, with
// the reason stated — never clamped into range, which would move the birth.
export const MIN_YEAR = 1800;
export const MAX_YEAR = 2399;

/** How far our timezone data may differ from the file's before the row says so.
 *  A minute is below any real disagreement and above float noise. */
const ZONE_TOLERANCE_SECONDS = 60;

/**
 * Apply the cross-cutting rulings to one row, in place.
 *
 * The timezone comparison is the interesting one. Where a file states an offset
 * and ours disagrees, the file's is KEPT by default — it is usually the value
 * an astrologer already checked against a printed atlas, and our data genuinely
 * disagrees with those for pre-1970 and mean-time births. But the disagreement
 * is shown rather than swallowed, and one control switches the whole batch over.
 */
export function applyRulings(row: ImportRow, controls: ImportControls): void {
  const c = row.chart;
  if (!c) return;

  if (c.local.year < MIN_YEAR || c.local.year > MAX_YEAR) {
    row.issues.push(reject('yearRange', { year: c.local.year, min: MIN_YEAR, max: MAX_YEAR }));
    return;
  }
  if (!Number.isFinite(c.latitude) || Math.abs(c.latitude) > 90) {
    row.issues.push(reject('latRange', { value: round(c.latitude) }));
    return;
  }
  if (!Number.isFinite(c.longitude) || Math.abs(c.longitude) > 180) {
    row.issues.push(reject('lngRange', { value: round(c.longitude) }));
    return;
  }
  if (!Number.isFinite(c.offsetSeconds) || Math.abs(c.offsetSeconds) > 15 * 3600) {
    row.issues.push(reject('offsetRange', { value: formatOffset(c.offsetSeconds) }));
    return;
  }

  // What this app would have worked out for the same moment and place. Null
  // when there is no zone data for the position, in which case the file's
  // value simply stands — there is nothing to disagree with it.
  const ours = (() => {
    try {
      return resolveBirthTimezone(
        c.latitude, c.longitude,
        c.local.year, c.local.month, c.local.day, c.local.hour, c.local.minute,
      );
    } catch {
      return null;
    }
  })();

  if (ours) {
    const oursSeconds = Math.round(ours.offsetHours * 3600);
    if (c.offsetSource === 'derived') {
      // Nothing was stated, so there is nothing to disagree with.
      c.offsetSeconds = oursSeconds;
      if (ours.lmt) c.offsetKind = 'lmt';
    } else if (Math.abs(oursSeconds - c.offsetSeconds) > ZONE_TOLERANCE_SECONDS) {
      row.issues.push(
        warn('zoneDisagrees', {
          file: formatOffset(c.offsetSeconds),
          app: formatOffset(oursSeconds),
        }),
      );
      if (controls.zonePreference === 'app') {
        c.offsetSeconds = oursSeconds;
        c.offsetSource = 'derived';
      }
    }
  }

  if (controls.folder && !c.folder) c.folder = controls.folder;
}

/**
 * The imported record as a chart the app can hold.
 *
 * Two conversions matter here. Seconds become the float hours the rest of the
 * app stores — done once, at this boundary, after all the arithmetic is
 * finished. And an unknown time becomes the app's own honest unknown-time
 * chart: a noon placeholder with the flag set, which every layer that depends
 * on the minute already knows to stand down for.
 */
export function toStoredChart(c: ImportedChart, index: number): StoredChart {
  let tzIana: string | undefined;
  try {
    tzIana = getIanaTimezone(c.latitude, c.longitude);
  } catch {
    tzIana = undefined;
  }

  const label = [c.placeName, c.countryState].filter(Boolean).join(', ') || c.name;

  const chart: StoredChart = {
    id: `${newChartId()}_${index}`,
    createdAt: Date.now(),
    name: c.name,
    year: c.local.year,
    month: c.local.month,
    day: c.local.day,
    hour: c.timeKnown ? c.local.hour : 12,
    minute: c.timeKnown ? c.local.minute : 0,
    tzOffset: c.offsetSeconds / 3600,
    tzIana,
    // The file's offset is being kept as stated, which is a deliberate choice
    // and not an uncertain one; the chart form shows it plainly either way.
    tzUncertain: false,
    birthplace: { label, lat: c.latitude, lng: c.longitude },
  };

  // Only ever written as false: absent means known, which is what every chart
  // saved before unknown-time existed has always meant.
  if (!c.timeKnown) chart.timeKnown = false;
  // Bounded on the way in as well as in the form: a source can carry a comment
  // block of any length, and a chart too large for its blob would be dropped by
  // a downstream store rather than saved — silently, since it still looks fine
  // locally. Trimming visible text beats losing the whole record.
  if (c.notes) chart.notes = c.notes.slice(0, NOTES_HARD_LIMIT);
  if (c.folder) chart.folder = c.folder;
  // A rating the source stated, fitted to the seven codes. Where none was
  // stated, a chart with no birth time is X by definition — that is what the
  // code means, and it is a fact about the record rather than a judgement.
  const rating = c.sourceRating ?? (c.timeKnown ? undefined : 'X');
  if (rating) chart.sourceRating = rating;

  return chart;
}

function round(n: number): string {
  return Number.isFinite(n) ? n.toFixed(4) : String(n);
}

/** An offset as a signed clock reading, e.g. "−5:00" or "+0:39:57". */
export function formatOffset(seconds: number): string {
  if (!Number.isFinite(seconds)) return String(seconds);
  const sign = seconds < 0 ? '−' : '+';
  const abs = Math.abs(Math.round(seconds));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const mm = String(m).padStart(2, '0');
  return s ? `${sign}${h}:${mm}:${String(s).padStart(2, '0')}` : `${sign}${h}:${mm}`;
}
