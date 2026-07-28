// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Comma-, semicolon- and tab-separated text — the workhorse.
//
// Semicolons are here because spreadsheet software in much of Europe writes them
// instead of commas, and tabs because "save as text" often means tabs. Quoting
// follows RFC 4180: a quoted field may contain the delimiter and newlines, and a
// doubled quote inside one is a literal quote. That last part is what lets a
// name like "Acme, Inc." survive a comma-separated file intact.

import type { ColumnSpec } from '../mapping';
import type { ImportControls, ImportRow } from '../types';
import { rowFromCells } from './fromCells';

export const DELIMITERS = [',', ';', '\t'] as const;

/** How much of a file has to agree on a cell count for a delimiter to win.
 *  Below one, because a real export can carry a truncated line or two and
 *  those rows have to be rejectable individually rather than costing the file
 *  its format. */
const AGREEMENT = 0.7;

/**
 * Which delimiter a file uses.
 *
 * Counting occurrences is not enough — a file of place names has plenty of
 * commas inside quoted fields. What distinguishes the real delimiter is that
 * most lines split into the SAME number of cells.
 *
 * "Most", not "all", and measured against the COMMONEST count rather than the
 * first line's: a file whose second row is truncated would otherwise fail to be
 * recognised as a table at all, and the whole file would be misread on the
 * strength of one bad line — the opposite of rejecting that line on its own.
 */
export function sniffDelimiter(text: string): string | null {
  const lines = text.split('\n').filter((l) => l.trim()).slice(0, 40);
  if (!lines.length) return null;

  let best: { delim: string; cells: number; score: number } | null = null;
  for (const delim of DELIMITERS) {
    const counts = lines.map((l) => splitDelimitedLine(l, delim).length);
    const tally = new Map<number, number>();
    for (const n of counts) tally.set(n, (tally.get(n) ?? 0) + 1);

    let cells = 0;
    let hits = 0;
    for (const [n, count] of tally) {
      if (n < 2) continue;
      if (count > hits || (count === hits && n > cells)) {
        cells = n;
        hits = count;
      }
    }
    if (!cells) continue;
    const score = hits / counts.length;
    if (score < AGREEMENT) continue;
    if (!best || cells > best.cells) best = { delim, cells, score };
  }
  return best?.delim ?? null;
}

/** Split one line, honouring RFC 4180 quoting. */
export function splitDelimitedLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Every line cut into cells — what the mapping UI shows and the reader reads. */
export function delimitedCells(text: string, delim: string): string[][] {
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => splitDelimitedLine(l, delim));
}

export function readDelimited(
  text: string,
  columns: ColumnSpec[],
  delim: string,
  hasHeader: boolean,
  controls: ImportControls,
): ImportRow[] {
  const lines = text.split('\n').filter((l) => l.trim());
  const body = hasHeader ? lines.slice(1) : lines;
  const offset = hasHeader ? 2 : 1; // 1-based line number in the original file

  return body.map((line, i) =>
    rowFromCells(splitDelimitedLine(line, delim), columns, controls, {
      index: i + 1,
      sourceRef: `Row ${i + offset}`,
      raw: line,
      format: 'delimited',
    }),
  );
}
