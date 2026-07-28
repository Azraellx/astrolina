// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// A standalone Julian Day, used only to check the importer's own arithmetic.
//
// The app casts charts through the ephemeris, whose julianDay() is the one that
// matters. This is deliberately NOT that: the ephemeris has to be loaded before
// it can answer, and the import path runs before any of that — while the user is
// still looking at a preview and may yet cancel. Plain arithmetic here keeps the
// readers free of that dependency and lets them be exercised outside a browser.
//
// It is only ever compared against a moment a source stated for itself, never
// used to cast anything, so the two implementations cannot drift into disagreeing
// about a real chart.

/**
 * Julian Day for a UTC civil date and a fraction of a day.
 *
 * Pre-reform dates fall on the Julian calendar, matching the app's own rule:
 * Julian 4 Oct 1582 was followed by Gregorian 15 Oct 1582, and the ten skipped
 * days never existed.
 */
export function julianDay(
  year: number,
  month: number,
  day: number,
  dayFraction: number,
  calendar: 'gregorian' | 'julian' | 'auto' = 'auto',
): number {
  const gregorian =
    calendar === 'gregorian' ||
    (calendar === 'auto' &&
      (year > 1582 || (year === 1582 && (month > 10 || (month === 10 && day >= 15)))));

  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = gregorian ? 2 - a + Math.floor(a / 4) : 0;
  return (
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    day +
    b -
    1524.5 +
    dayFraction
  );
}

/** The UT Julian Day of a local reading and its east-positive offset in seconds. */
export function localToJd(
  local: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  offsetSeconds: number,
  calendar: 'gregorian' | 'julian' | 'auto' = 'auto',
): number {
  const secondsOfDay = local.hour * 3600 + local.minute * 60 + local.second;
  return julianDay(
    local.year,
    local.month,
    local.day,
    (secondsOfDay - offsetSeconds) / 86400,
    calendar,
  );
}
