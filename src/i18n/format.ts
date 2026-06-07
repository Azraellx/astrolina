// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Locale-aware formatting helpers, bound to the active locale by the I18nProvider.
// These replace the hand-rolled `const MONTHS = ['January', …]` arrays duplicated
// across several components: month names come from Luxon (already a dependency), and
// numbers from the native Intl API. Coordinate DMS notation stays language-neutral
// (see coordFormat.ts) — only its cardinal letters are localized, via common.cardinal.
import { DateTime } from 'luxon';

export interface Formatters {
  /** Full month name in the active locale for a 1–12 month number (replaces MONTHS). */
  monthName(month1to12: number): string;
  /** Abbreviated month name in the active locale (replaces the MON/short arrays). */
  monthAbbr(month1to12: number): string;
  /** Locale-aware number formatting (decimal separator, grouping). */
  num(value: number, opts?: Intl.NumberFormatOptions): string;
}

export function makeFormatters(locale: string): Formatters {
  return {
    monthName: (month) =>
      DateTime.fromObject({ month }).setLocale(locale).toFormat('LLLL'),
    monthAbbr: (month) =>
      DateTime.fromObject({ month }).setLocale(locale).toFormat('LLL'),
    num: (value, opts) => new Intl.NumberFormat(locale, opts).format(value),
  };
}
