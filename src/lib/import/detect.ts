// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// What SHAPE is this text — how are its records cut up?
//
// Shape, and nothing more. This asks whether the file is chunked, delimited,
// column-aligned or a pasted block; it never tries to work out which program
// wrote it. Program-specific layouts are the user's to describe once and save,
// which covers programs nobody here has heard of and keeps this file honest.

import { looksLikeAaf } from './readers/aaf';
import { sniffDelimiter, splitDelimitedLine } from './readers/delimited';
import { contentLines, guessBoundaries, looksFixedWidth } from './readers/fixed';
import { looksLikeHeaderRow } from './mapping';
import type { SourceFormat } from './types';

export interface Shape {
  format: SourceFormat;
  /** Delimited only. */
  delimiter?: string;
  hasHeader?: boolean;
  /** Fixed-width only: a first guess the user then adjusts. */
  boundaries?: number[];
  /** How many columns the first record cuts into. */
  columnCount?: number;
}

/** A delimited birth-data file has several columns; one or two commas is far
 *  more likely to be a place name inside a column-aligned file. */
const MIN_DELIMITED_COLUMNS = 4;

export function detectShape(text: string): Shape {
  if (looksLikeAaf(text)) return { format: 'aaf' };

  const lines = contentLines(text);
  if (!lines.length) return { format: 'block' };

  const delimiter = sniffDelimiter(text);
  const delimitedCount = delimiter ? splitDelimitedLine(lines[0], delimiter).length : 0;
  const columnar = looksFixedWidth(lines);

  // Both can look true at once — a column-aligned file whose place column
  // happens to hold a comma on every line. Column alignment wins unless the
  // delimiter is producing a genuinely table-shaped split.
  if (delimiter && delimitedCount >= MIN_DELIMITED_COLUMNS) {
    return delimitedShape(lines, delimiter, delimitedCount);
  }
  if (columnar) {
    const boundaries = guessBoundaries(lines);
    return { format: 'fixed', boundaries, columnCount: boundaries.length + 1 };
  }
  if (delimiter && delimitedCount >= 2) {
    return delimitedShape(lines, delimiter, delimitedCount);
  }
  return { format: 'block' };
}

function delimitedShape(lines: string[], delimiter: string, columnCount: number): Shape {
  const first = splitDelimitedLine(lines[0], delimiter);
  return {
    format: 'delimited',
    delimiter,
    hasHeader: looksLikeHeaderRow(first),
    columnCount,
  };
}
