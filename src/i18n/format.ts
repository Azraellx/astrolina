// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Locale-aware formatting helpers, bound to the active language by the i18n runtime.
// These replace the hand-rolled `const MONTHS = ['January', …]` arrays duplicated
// across several components: month names come from Luxon (already a dependency), and
// numbers from the native Intl API. Coordinate DMS notation stays language-neutral
// (see coordFormat.ts) — only its cardinal letters are localized, via common.cardinal.
import { DateTime, Info } from 'luxon';

/**
 * How `date()` writes a civil date. The English form of each is the exact string the
 * inline code it replaced assembled (verify-i18n-runtime holds them byte-for-byte):
 *
 *   'long'          14 March 1990
 *   'medium'        14 Mar 1990
 *   'longWeekday'   5 June 1941, Thu
 *   'mediumWeekday' Thu 5 Jun 1941
 *   'dayMonth'      14 Mar
 *   'ordinal'       September 26th 2026   (a dateline)
 */
export type DateStyle = 'long' | 'medium' | 'longWeekday' | 'mediumWeekday' | 'dayMonth' | 'ordinal';

export interface Formatters {
  /** Full month name in the active locale for a 1–12 month number (replaces MONTHS). The
   *  STANDALONE form — a month on its own, as in a picker. Inside a date, use date(): in
   *  Russian the month in "26 сентября" is not the month in a picker ("сентябрь"). */
  monthName(month1to12: number): string;
  /** Abbreviated month name in the active locale (replaces the MON/short arrays). */
  monthAbbr(month1to12: number): string;
  /** Full weekday name in the active locale, 0 = Sunday (the `Date#getUTCDay`
   *  numbering, not Luxon's Monday-first one). */
  weekdayName(weekday0Sun: number): string;
  /** Abbreviated weekday name ("Thu"), same numbering as weekdayName. */
  weekdayAbbr(weekday0Sun: number): string;
  /** A civil date — a calendar day as written, never an instant in some zone, so the
   *  weekday a style shows is that date's own. See DateStyle for the forms. English keeps
   *  the shapes the app always printed; another language writes the date its own way
   *  (word order, the month's case, its punctuation) through Intl. */
  date(year: number, month1to12: number, day: number, style: DateStyle): string;
  /** A civil date with its weekday — "5 June 1941, Thu" — for a chart's own moment
   *  (the chart-header spec, 2026-10-06). The `'longWeekday'` style of date(). */
  dateWithWeekday(year: number, month1to12: number, day: number): string;
  /** Locale-aware number formatting (decimal separator, grouping). */
  num(value: number, opts?: Intl.NumberFormatOptions): string;
  /**
   * A figure at a fixed number of decimals — the localized `value.toFixed(digits)`, for a
   * readout the app printed with toFixed ("Age 85.3", "81.7°", a magnitude "1.057").
   *
   * English returns exactly `value.toFixed(digits)`, rounding included, so no English
   * readout moves by a byte. Another language rounds with toFixed FIRST and only then
   * writes the result through Intl, with no grouping: the two round a tie differently
   * (toFixed rounds the binary value, so 0.15 → "0.1"; Intl the shortest decimal, "0.2"),
   * and a toFixed result is its own shortest decimal, so Intl then changes nothing but the
   * decimal mark — the same reasoning as TopNav's fmtMeasure (2026-10-09). A non-finite
   * value keeps toFixed's text, so "NaN" never becomes a translated word. (2026-10-10)
   *
   * Not for coordinates or DMS (coordFormat.ts keeps those language-neutral), nor for a
   * number that is a code rather than a quantity.
   */
  fixed(value: number, digits: number): string;
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

/** The proleptic-Gregorian civil date as a UTC instant at midnight. Built with
 *  setUTCFullYear because Date.UTC reads years 0–99 as 1900–1999. */
function civilUtc(year: number, month1to12: number, day: number): Date {
  const d = new Date(Date.UTC(2000, 0, 1));
  d.setUTCFullYear(year, month1to12 - 1, day);
  return d;
}

/** English's ordinal suffix — 1st, 2nd, 3rd, 4th, 11th–13th. */
function enOrdinal(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

const INTL_STYLE: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  longWeekday: { day: 'numeric', month: 'long', year: 'numeric', weekday: 'short' },
  mediumWeekday: { day: 'numeric', month: 'short', year: 'numeric', weekday: 'short' },
  dayMonth: { day: 'numeric', month: 'short' },
  // Most languages don't write a date's day as an ordinal; the dateline is a long date.
  ordinal: { day: 'numeric', month: 'long', year: 'numeric' },
};

export function makeFormatters(locale: string): Formatters {
  const monthName = (month: number) => DateTime.fromObject({ month }).setLocale(locale).toFormat('LLLL');
  const monthAbbr = (month: number) => DateTime.fromObject({ month }).setLocale(locale).toFormat('LLL');
  const weekdayAbbr = (wd: number) => Info.weekdays('short', { locale })[(wd + 6) % 7];
  const english = locale === 'en' || locale.startsWith('en-');
  const intl = new Map<DateStyle, Intl.DateTimeFormat>();

  const date = (year: number, month: number, day: number, style: DateStyle): string => {
    const weekday = () => weekdayAbbr(civilUtc(year, month, day).getUTCDay());
    if (english) {
      switch (style) {
        case 'long':
          return `${day} ${monthName(month)} ${year}`;
        case 'medium':
          return `${day} ${monthAbbr(month)} ${year}`;
        case 'longWeekday':
          return `${day} ${monthName(month)} ${year}, ${weekday()}`;
        case 'mediumWeekday':
          return `${weekday()} ${day} ${monthAbbr(month)} ${year}`;
        case 'dayMonth':
          return `${day} ${monthAbbr(month)}`;
        case 'ordinal':
          return `${monthName(month)} ${enOrdinal(day)} ${year}`;
      }
    }
    // Before year 1 Intl starts writing eras, and the shape stops being one a reader can
    // compare with the dates around it: keep English's shape, in the language's own words.
    // The FORMAT-context month ('MMMM'), not the standalone one, since it sits in a date.
    if (year < 1) {
      const fmtMonth = (token: 'MMMM' | 'MMM') =>
        DateTime.fromObject({ year: 2000, month, day: 1 }).setLocale(locale).toFormat(token);
      const long = style === 'long' || style === 'longWeekday' || style === 'ordinal';
      const core = `${day} ${fmtMonth(long ? 'MMMM' : 'MMM')}`;
      if (style === 'dayMonth') return core;
      if (style === 'mediumWeekday') return `${weekday()} ${core} ${year}`;
      if (style === 'longWeekday') return `${core} ${year}, ${weekday()}`;
      return `${core} ${year}`;
    }
    let f = intl.get(style);
    if (!f) {
      f = new Intl.DateTimeFormat(locale, { ...INTL_STYLE[style], timeZone: 'UTC' });
      intl.set(style, f);
    }
    return f.format(civilUtc(year, month, day));
  };

  // One Intl formatter per decimal count: an overlay's readout re-formats on every timeline
  // step, and constructing a NumberFormat is the expensive half. (2026-10-10)
  const fixedIntl = new Map<number, Intl.NumberFormat>();
  const fixed = (value: number, digits: number): string => {
    const rounded = value.toFixed(digits);
    if (english || !Number.isFinite(value)) return rounded;
    let f = fixedIntl.get(digits);
    if (!f) {
      f = new Intl.NumberFormat(locale, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
        useGrouping: false,
      });
      fixedIntl.set(digits, f);
    }
    return f.format(Number(rounded));
  };

  return {
    monthName,
    monthAbbr,
    weekdayName: (wd) => Info.weekdays('long', { locale })[(wd + 6) % 7],
    weekdayAbbr,
    date,
    dateWithWeekday: (year, month, day) => date(year, month, day, 'longWeekday'),
    num: (value, opts) => new Intl.NumberFormat(locale, opts).format(value),
    fixed,
    list: (items, type = 'conjunction') =>
      new Intl.ListFormat(locale, { style: 'long', type }).format(items),
  };
}
