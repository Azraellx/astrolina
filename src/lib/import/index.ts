// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Bringing charts in from other programs.
//
//   bytes ─▸ decode ─▸ detect shape ─▸ read ─▸ rulings ─▸ duplicates ─▸ preview
//
// Nothing is saved anywhere along that path. The preview is the only way
// through, by design: a chart whose longitude was read with the wrong sign
// still draws a perfectly convincing map, just of the wrong side of the world,
// so the last check has to be a person looking at it.

import type { StoredChart } from '../chartLibrary';
import { decodeBytes, normalizeText, type DecodedText } from './decode';
import { detectShape, type Shape } from './detect';
import { markDuplicates } from './dedupe';
import { mapHeaderRow, type ColumnMapping, type ColumnSpec } from './mapping';
import { applyRulings, toStoredChart } from './normalize';
import { readAaf } from './readers/aaf';
import { delimitedCells, readDelimited, splitDelimitedLine } from './readers/delimited';
import { contentLines, readFixed, sliceFixed } from './readers/fixed';
import { readBlocks } from './readers/textBlock';
import {
  DEFAULT_CONTROLS,
  rowSeverity,
  type ImportControls,
  type ImportReport,
  type ImportRow,
} from './types';

export * from './types';
export { decodeBytes, normalizeText } from './decode';
export { detectShape, type Shape } from './detect';
export { formatOffset, MAX_YEAR, MIN_YEAR } from './normalize';
export {
  FIELD_TARGETS, deleteMapping, findMapping, loadMappings, mapHeaderRow, newMappingId,
  saveMapping, signatureOf, targetForHeader,
  type ColumnMapping, type ColumnSpec, type FieldTarget, type SavedMapping,
} from './mapping';
export { guessBoundaries, modalWidth, sliceFixed, contentLines } from './readers/fixed';
export { delimitedCells, sniffDelimiter } from './readers/delimited';
export type { DateFormat, TimeFormat } from './fields';

/** The text plus what we made of its shape — everything the mapping step needs. */
export interface ImportSource {
  text: string;
  shape: Shape;
  encoding: DecodedText['encoding'];
}

export function sourceFromBytes(buffer: ArrayBuffer): ImportSource {
  const { text, encoding } = decodeBytes(buffer);
  return { text, shape: detectShape(text), encoding };
}

export function sourceFromText(raw: string): ImportSource {
  const text = normalizeText(raw);
  return { text, shape: detectShape(text), encoding: 'utf-8' };
}

/**
 * The controls a given shape should START on.
 *
 * A default that suits the file is worth having: the pasted-block format writes
 * hours-to-add-to-reach-UT, which is the opposite of the offset, so a paste that
 * opened east-positive would show every chart with its zone inverted and invite
 * the user to "fix" a control that was never wrong.
 */
export function defaultControlsFor(shape: Shape): ImportControls {
  return shape.format === 'block'
    ? { ...DEFAULT_CONTROLS, offsetSign: 'west-positive' }
    : { ...DEFAULT_CONTROLS };
}

/** The cells the mapping UI shows: the first rows, already cut into columns. */
export function previewCells(source: ImportSource, mapping: ColumnMapping, limit = 8): string[][] {
  const { text, shape } = source;
  if (shape.format === 'fixed') {
    return contentLines(text)
      .slice(0, limit)
      .map((l) => sliceFixed(l, mapping.boundaries ?? []));
  }
  if (shape.format === 'delimited') {
    return delimitedCells(text, mapping.delimiter ?? ',').slice(0, limit);
  }
  return [];
}

/** A first mapping for a file: read from its header row when it has one. */
export function initialMapping(source: ImportSource): ColumnMapping {
  const { text, shape } = source;
  if (shape.format === 'fixed') {
    const boundaries = shape.boundaries ?? [];
    const first = contentLines(text)[0] ?? '';
    const count = sliceFixed(first, boundaries).length;
    return {
      kind: 'fixed',
      boundaries,
      columns: Array.from({ length: count }, () => ({ target: 'ignore' as const })),
    };
  }
  const delimiter = shape.delimiter ?? ',';
  const first = contentLines(text)[0] ?? '';
  const cells = splitDelimitedLine(first, delimiter);
  return {
    kind: 'delimited',
    delimiter,
    hasHeader: !!shape.hasHeader,
    columns: shape.hasHeader
      ? mapHeaderRow(cells)
      : cells.map(() => ({ target: 'ignore' as const })),
  };
}

/** Whether a mapping names enough to build a chart from. */
export function mappingIsUsable(columns: ColumnSpec[]): boolean {
  const targets = new Set(columns.map((c) => c.target));
  const hasDate = targets.has('date') || (targets.has('year') && targets.has('month') && targets.has('day'));
  return hasDate && targets.has('latitude') && targets.has('longitude');
}

export interface ParseOptions {
  controls?: ImportControls;
  mapping?: ColumnMapping;
  /** The library, so a record already in it can be recognised. */
  existing?: readonly StoredChart[];
}

/**
 * Read a source into a report the preview can render.
 *
 * Cheap enough to re-run whenever a control changes, which is what keeps the
 * preview honest: every control shows its effect on the actual rows rather than
 * on a promise about them.
 */
export function parseImport(source: ImportSource, options: ParseOptions = {}): ImportReport {
  const controls = options.controls ?? defaultControlsFor(source.shape);
  const { text, shape } = source;

  if (!text.trim()) return { rows: [], format: shape.format, fatal: 'unreadable' };

  let rows: ImportRow[];
  switch (shape.format) {
    case 'aaf':
      rows = readAaf(text);
      break;
    case 'delimited': {
      const mapping = options.mapping;
      if (!mapping || !mappingIsUsable(mapping.columns)) {
        return { rows: [], format: 'delimited' };
      }
      rows = readDelimited(
        text, mapping.columns, mapping.delimiter ?? ',', !!mapping.hasHeader, controls,
      );
      break;
    }
    case 'fixed': {
      const mapping = options.mapping;
      if (!mapping || !mappingIsUsable(mapping.columns)) {
        return { rows: [], format: 'fixed' };
      }
      rows = readFixed(text, mapping.columns, mapping.boundaries ?? [], controls);
      break;
    }
    default:
      rows = readBlocks(text, controls);
      break;
  }

  for (const row of rows) applyRulings(row, controls);
  markDuplicates(rows, options.existing ?? [], controls);

  if (!rows.length) return { rows, format: shape.format, fatal: 'unreadable' };
  return { rows, format: shape.format };
}

/** The rows that would actually be saved: readable, and not skipped. */
export function importableRows(report: ImportReport): ImportRow[] {
  return report.rows.filter((r) => rowSeverity(r) !== 'reject' && !r.skipped);
}

/** Turn the report's usable rows into charts. */
export function chartsFrom(report: ImportReport): StoredChart[] {
  return importableRows(report).map((row, i) => toStoredChart(row.chart!, i));
}

/**
 * The rejected rows, as a file that can be corrected and dropped straight back
 * in. Keeping the original text verbatim is what makes it re-importable — a
 * re-serialized "tidy" version would silently drop whatever we misread.
 */
export function rejectedReport(report: ImportReport, describe: (row: ImportRow) => string): string {
  const bad = report.rows.filter((r) => rowSeverity(r) === 'reject');
  if (!bad.length) return '';
  return bad
    .map((r) => `# ${r.sourceRef}: ${describe(r)}\n${r.raw}`)
    .join('\n\n');
}
