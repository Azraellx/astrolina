// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// How a body on the reader's list is named wherever a reader meets it — the line card
// and hover tip (lineCard.minorDisplayName), the chart wheel (wheel.ts), the Minor
// bodies window, and the map's edge chips for its lines (Map.tsx minorChipText, since
// 2026-10-01). One statement of the rule, so no two surfaces can come to name one
// body two ways.
//
//   catalog body       "Eros (433)", or "(433)" when the catalog knows no name. The
//                      number is always shown — it is what tells asteroid 1181 Lilith
//                      from Black Moon Lilith, and 19 Fortuna from the Lot.
//   hypothetical point "Zeus (hyp)" — NEVER a number. Its key is not a catalog number,
//                      and the name alone would read as the asteroid 5731 Zeus.
//
// minorDisplayParts is the same label split around the name, for the window's rows,
// which cut a name too long for its line from the name's end and keep the number —
// and for the edge chips, which cut it the same way at a fixed length and set the
// number in smaller type.
//
// The map's line labels (minorLines.minorLabelName) restate the hypothetical half,
// because that module has no t(); the verify suite pins the two together.
//
// PURE: no engine, no React, no DOM.
import type { TFn } from '../../i18n';
import { isHypotheticalKey } from './ids';
import { hypotheticalPoint } from './hypothetical';

/**
 * The display label for list key `n` and the name it carries. `n` null (a feature
 * with no readable key) falls back to whatever name there is, rather than printing
 * "(null)". A hypothetical point with no name passed takes its table name; one this
 * build doesn't know, with no name at all, reads '' — never its key.
 */
export function minorDisplayLabel(n: number | null, name: string, t: TFn): string {
  const own = name.trim();
  if (n === null) return own;
  if (isHypotheticalKey(n)) {
    const hyp = own || hypotheticalPoint(n)?.name || '';
    return hyp ? t('minorBodies.card.hyp', { name: hyp }) : '';
  }
  return own ? t('minorBodies.card.name', { name: own, n }) : t('minorBodies.card.unnamed', { n });
}

/**
 * minorDisplayLabel in three parts around the body's own name, for a row too narrow for
 * the whole label: it cuts the NAME short and keeps what the label adds to it whole —
 * "Kaʻepaoka… (514107)", never "Kaʻepaokaʻāwela (51…" — because the number, or (hyp), is
 * what tells two bodies of one name apart. A label with no name ("(433)") is all `after`;
 * one the name can't be found in (a template that changes it) is all `own`, so it cuts as
 * the one piece it was.
 */
export function minorDisplayParts(
  n: number | null,
  name: string,
  t: TFn,
): { before: string; own: string; after: string } {
  const label = minorDisplayLabel(n, name, t);
  const own =
    name.trim() || (n !== null && isHypotheticalKey(n) ? (hypotheticalPoint(n)?.name ?? '') : '');
  if (!own) return { before: '', own: '', after: label };
  const i = label.indexOf(own);
  if (i < 0) return { before: '', own: label, after: '' };
  return { before: label.slice(0, i), own, after: label.slice(i + own.length) };
}
