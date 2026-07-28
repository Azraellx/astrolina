// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Fixed-width text: columns at fixed character offsets, with nothing between
// them to split on.
//
// The boundaries cannot be worked out reliably, and pretending otherwise is the
// trap here. Gap detection — cutting wherever every line happens to have spaces
// — looks like it should work and does not: in real files one field runs
// straight into the next with no gap at all, and some files have no gaps
// anywhere. So the guess below is a STARTING POINT that the user drags into
// place, and it has to be possible to put a boundary anywhere at all, including
// in the middle of an unbroken run of characters.
//
// The second thing real files do is carry notes on their own lines after a
// record — a remembered time, a rectification note, whose account the time came
// from. A line too short to hold the columns is not a malformed record; it
// belongs to the record above it, and it is exactly the provenance an
// astrologer would most mind losing.

import type { ColumnSpec } from '../mapping';
import type { ImportControls, ImportRow } from '../types';
import { rowFromCells } from './fromCells';

/** Non-empty lines, which is all any of this reasons about. */
export function contentLines(text: string): string[] {
  return text.split('\n').filter((l) => l.trim().length > 0);
}

/** The most common line length — the width a record is expected to have. */
export function modalWidth(lines: string[]): number {
  const counts = new Map<number, number>();
  for (const l of lines) counts.set(l.length, (counts.get(l.length) ?? 0) + 1);
  let best = 0;
  let bestCount = 0;
  for (const [width, n] of counts) {
    if (n > bestCount || (n === bestCount && width > best)) {
      best = width;
      bestCount = n;
    }
  }
  return best;
}

/**
 * Whether text looks fixed-width: enough lines share one length, and no
 * delimiter splits them consistently (that check is the caller's).
 */
export function looksFixedWidth(lines: string[]): boolean {
  if (lines.length < 2) return false;
  const width = modalWidth(lines);
  if (width < 20) return false;
  const atWidth = lines.filter((l) => l.length === width).length;
  return atWidth >= 2 && atWidth / lines.length >= 0.5;
}

/**
 * A first guess at where the columns start, from positions that are blank on
 * every full-width line.
 *
 * Only a guess. Fields that abut leave no gap to find, so this will merge them,
 * and the user separates them by hand. Returned as cut positions, ascending,
 * with the implicit first column starting at 0.
 */
export function guessBoundaries(lines: string[]): number[] {
  const width = modalWidth(lines);
  const rows = lines.filter((l) => l.length === width);
  if (!rows.length || width === 0) return [];

  const blank: boolean[] = [];
  for (let i = 0; i < width; i++) blank.push(rows.every((l) => l[i] === ' '));

  const cuts: number[] = [];
  let i = 0;
  while (i < width) {
    if (!blank[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < width && blank[j]) j++;
    // A single space is far more likely to be inside a name than between two
    // columns; two or more is a plausible separator.
    if (j - i >= 2 && j < width) cuts.push(j);
    i = j;
  }
  return cuts;
}

/** Cut one line at the given boundaries. */
export function sliceFixed(line: string, boundaries: number[]): string[] {
  const cuts = [0, ...boundaries];
  return cuts.map((start, i) => {
    const end = i + 1 < cuts.length ? cuts[i + 1] : line.length;
    return line.slice(start, end).trim();
  });
}

/**
 * Split lines into records and the notes that follow them.
 *
 * A line that cannot reach the last column is too short to be a record, so it
 * is a continuation of the one above. Lines before any record are preamble and
 * are dropped, the way a header block is.
 */
export function groupFixedLines(
  lines: string[],
  boundaries: number[],
): { line: string; notes: string[] }[] {
  const minWidth = boundaries.length ? boundaries[boundaries.length - 1] : modalWidth(lines);
  const out: { line: string; notes: string[] }[] = [];
  for (const line of lines) {
    if (line.length >= minWidth) out.push({ line, notes: [] });
    else if (out.length) out[out.length - 1].notes.push(line.trim());
  }
  return out;
}

export function readFixed(
  text: string,
  columns: ColumnSpec[],
  boundaries: number[],
  controls: ImportControls,
): ImportRow[] {
  const groups = groupFixedLines(contentLines(text), boundaries);
  return groups.map((g, i) =>
    rowFromCells(sliceFixed(g.line, boundaries), columns, controls, {
      index: i + 1,
      sourceRef: `Record ${i + 1}`,
      raw: [g.line, ...g.notes].join('\n'),
      format: 'fixed',
      trailingNotes: g.notes,
    }),
  );
}
