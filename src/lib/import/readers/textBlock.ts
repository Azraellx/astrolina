// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// A chart's details copied off the screen and pasted in:
//
//     Mary Decker - Natal Chart
//     4 Aug 1958, 2:59 am, EDT +4:00
//     Raritan New Jersey, 40N34'10", 074W38'00"
//     Geocentric Tropical Zodiac
//     Rating: AA
//
// Several such blocks may be pasted at once, separated by blank lines, and any
// line that is not recognised is kept as a note rather than failing the paste —
// the trailing lines vary between programs and often carry the rating and the
// rectification note, which are worth more than they cost to keep.
//
// This reader is deliberately strict about WHICH line is which. Scanning the
// whole block for anything date-shaped or coordinate-shaped is how a file with
// no blank lines in it ends up read as a single record whose latitude came out
// of the middle of a date. A block therefore has to name itself on the first
// line, and the coordinate line has to yield a latitude and a longitude that
// each account for their token completely.
//
// The offset here reads as hours to ADD to reach UT, which is the negative of
// the offset itself — "EDT +4:00" is UTC−4. That is this format's convention
// rather than a universal one, so it arrives as the west-positive default on
// the preview's offset control, where it can be flipped if a paste disagrees.

import { extractRating } from '../../sourceRating';
import { parseCoord, parseDateToken, parseOffsetToken, parseTimeToken } from '../fields';
import type { ImportControls, ImportedChart, ImportRow, Issue } from '../types';
import { reject, warn } from '../types';

/** Split the coordinate line into its label and the two coordinates. */
function findCoordPair(
  line: string,
): { lat: number; lng: number; explicit: boolean; label: string } | null {
  for (const parts of [line.split(','), line.split(/\s{2,}/)]) {
    const trimmed = parts.map((p) => p.trim()).filter(Boolean);
    if (trimmed.length < 2) continue;
    for (let i = 0; i < trimmed.length - 1; i++) {
      const lat = parseCoord(trimmed[i], 'lat');
      const lng = parseCoord(trimmed[i + 1], 'lng');
      if (lat && lng) {
        return {
          lat: lat.value,
          lng: lng.value,
          explicit: lat.explicit && lng.explicit,
          label: trimmed.slice(0, i).join(', ').replace(/[,\s]+$/, '').trim(),
        };
      }
    }
  }
  return null;
}

/** Split pasted text into blocks on blank lines. */
export function splitBlocks(text: string): string[] {
  return text.split(/\n\s*\n/).filter((b) => b.trim().length > 0);
}

export function readBlocks(text: string, controls: ImportControls): ImportRow[] {
  return splitBlocks(text).map((block, i) => readBlock(block, i + 1, controls));
}

function readBlock(block: string, index: number, controls: ImportControls): ImportRow {
  const issues: Issue[] = [];
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  const sourceRef = `Block ${index}`;
  const bail = (): ImportRow => ({
    index, sourceRef, raw: block, format: 'block', chart: null, issues, skipped: false,
  });

  if (!lines.length) {
    issues.push(reject('unreadable'));
    return bail();
  }

  // Line 1 names the chart; a trailing " - Natal Chart" is the kind, not the name.
  const name = lines[0].split(/\s+[-–—]\s+/)[0].trim();

  // The date line is the first line AFTER the name whose leading comma-segment
  // is a date. Starting at line 2 is what stops a name that happens to contain
  // a date from being read as one.
  let dateLineAt = -1;
  let date: ReturnType<typeof parseDateToken> = null;
  for (let i = 1; i < lines.length; i++) {
    const head = lines[i].split(',')[0].trim();
    const d = parseDateToken(head, controls.dateOrder);
    if (d && !d.ambiguous) {
      dateLineAt = i;
      date = d;
      break;
    }
  }
  if (!date || dateLineAt < 0) {
    issues.push(reject('noDate'));
    return bail();
  }

  const segs = lines[dateLineAt].split(',').map((s) => s.trim());
  const time = segs.length > 1 ? parseTimeToken(segs[1]) : null;
  if (!time) issues.push(warn('noTime'));

  const zoneSeg = segs.length > 2 ? segs.slice(2).join(' ') : '';
  const zoneAbbrev = zoneSeg.match(/^([A-Za-z]{2,5})\b/)?.[1];
  const parsedOffset = zoneSeg ? parseOffsetToken(zoneSeg) : null;
  if (!parsedOffset) issues.push(warn('noOffset', { value: zoneSeg }));
  const offsetSeconds = !parsedOffset
    ? 0
    : controls.offsetSign === 'west-positive'
      ? -parsedOffset.seconds
      : parsedOffset.seconds;

  // The coordinate line is any line other than the date line that yields a
  // complete latitude AND longitude.
  let coordsAt = -1;
  let coords: ReturnType<typeof findCoordPair> = null;
  for (let i = 0; i < lines.length; i++) {
    if (i === dateLineAt) continue;
    const found = findCoordPair(lines[i]);
    if (found) {
      coordsAt = i;
      coords = found;
      break;
    }
  }
  if (!coords) {
    issues.push(reject('noPlace'));
    return bail();
  }
  if (!coords.explicit) issues.push(warn('signAssumed'));
  const longitude =
    !coords.explicit && controls.longitudeSign === 'west-positive' ? -coords.lng : coords.lng;

  // Whatever is left is provenance: the rating, the comment, the house system.
  const notes = lines
    .filter((_, i) => i !== 0 && i !== dateLineAt && i !== coordsAt)
    .join('\n')
    .trim();

  if (!name) issues.push(warn('noName', { fallback: index }));

  const chart: ImportedChart = {
    name: name || `Imported ${index}`,
    kind: 'unknown',
    local: {
      year: date.year,
      month: date.month,
      day: date.day,
      hour: time?.hour ?? 12,
      minute: time?.minute ?? 0,
      second: time?.second ?? 0,
    },
    timeKnown: !!time,
    offsetSeconds,
    offsetSource: parsedOffset ? 'file' : 'derived',
    offsetKind: parsedOffset ? 'standard' : 'unknown',
    zoneAbbrev,
    placeName: coords.label || undefined,
    latitude: coords.lat,
    longitude,
    coordSource: 'file',
    calendar: date.calendar ?? 'auto',
    notes: notes || undefined,
    sourceRating: extractRating(notes) ?? undefined,
  };

  return { index, sourceRef, raw: block, format: 'block', chart, issues, skipped: false };
}
