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
import { DateTime, Info } from 'luxon';

export interface Formatters {
  /** Full month name in the active locale for a 1–12 month number (replaces MONTHS). */
  monthName(month1to12: number): string;
  /** Abbreviated month name in the active locale (replaces the MON/short arrays). */
  monthAbbr(month1to12: number): string;
  /** Full weekday name in the active locale, 0 = Sunday (the `Date#getUTCDay`
   *  numbering, not Luxon's Monday-first one). */
  weekdayName(weekday0Sun: number): string;
  /** Abbreviated weekday name ("Thu"), same numbering as weekdayName. */
  weekdayAbbr(weekday0Sun: number): string;
  /** A civil date with its weekday — "5 June 1941, Thu" — for a chart's own moment
   *  (Lina's chart-header spec, 2026-10-06). The weekday is the civil date's, so it is
   *  computed from year/month/day alone, never from an instant in some zone. */
  dateWithWeekday(year: number, month1to12: number, day: number): string;
  /** Locale-aware number formatting (decimal separator, grouping). */
  num(value: number, opts?: Intl.NumberFormatOptions): string;
  /**
   * A run of items as one phrase — "Toronto, Lisbon and Auckland". The
   * separator and the final conjunction differ per language (and the serial
   * comma is a live argument even within English), so this is Intl's to decide
   * rather than something a caller joins by hand.
   *
   * `type` picks the conjunction: 'conjunction' is "and" (the default, for a
   * set that all applies), 'disjunction' is "or".
   */
  list(items: readonly string[], type?: 'conjunction' | 'disjunction'): string;
}

export function makeFormatters(locale: string): Formatters {
  return {
    monthName: (month) =>
      DateTime.fromObject({ month }).setLocale(locale).toFormat('LLLL'),
    monthAbbr: (month) =>
      DateTime.fromObject({ month }).setLocale(locale).toFormat('LLL'),
    weekdayName: (wd) => Info.weekdays('long', { locale })[(wd + 6) % 7],
    weekdayAbbr: (wd) => Info.weekdays('short', { locale })[(wd + 6) % 7],
    dateWithWeekday: (year, month, day) => {
      const wd = new Date(Date.UTC(2000, month - 1, day)).setUTCFullYear(year);
      const weekday0Sun = new Date(wd).getUTCDay();
      const monthName = DateTime.fromObject({ month }).setLocale(locale).toFormat('LLLL');
      return `${day} ${monthName} ${year}, ${Info.weekdays('short', { locale })[(weekday0Sun + 6) % 7]}`;
    },
    num: (value, opts) => new Intl.NumberFormat(locale, opts).format(value),
    list: (items, type = 'conjunction') =>
      new Intl.ListFormat(locale, { style: 'long', type }).format(items),
  };
}
