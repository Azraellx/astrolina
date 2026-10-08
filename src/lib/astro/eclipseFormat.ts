// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// How an eclipse's figures READ — dates, clock times, durations, magnitudes —
// in one place, so the map's click card and the eclipse panel cannot drift into
// two styles for the same number. They had: one frame showed "Duration 6m20s",
// "108% magnitude" and "2027-08-02" on the card while the panel beside it said
// "Max duration 6m 23s", "Magnitude 1.0790" and "2 August 2027" (2026-09-30).
// Also here: the clicked place's civil clock (eclipsePlaceClock), which the card
// gives every contact time on, beside UTC.
//
// Its own small module rather than a section of eclipses.ts because the panel is
// part of the main bundle and eclipses.ts is not: that module carries the two
// catalogs and the Besselian fitting, and stays behind a dynamic import until
// eclipse mode first opens. Anything the panel calls at runtime has to live
// outside it, or the import would drag the whole chunk into the main bundle.
import type { Formatters } from '../../i18n';
import { formatZoneLabel, placeZoneAt, type ZoneName } from '../atlas/zoneName';

const UNIX_EPOCH_JD = 2440587.5;
const MS_DAY = 86_400_000;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** A wall-clock reading of one instant: "HH:MM:SS" plus the calendar date it
 *  falls on in that clock (which can differ from the eclipse's own date). */
export interface EclipseClock {
  hms: string;
  year: number;
  month: number;
  day: number;
}

/**
 * One instant on a clock running `offsetHours` ahead of UTC (east-positive, the
 * timezone helpers' convention; 0 = UTC itself).
 *
 * The instant is rounded to the whole second FIRST and only then split into
 * fields. Splitting first and rounding the seconds field on its own is what
 * produces "12:04:60" — the same mistake the durations below were making. The
 * offset is applied after the round, and the sum rounded again, because a zone
 * still on local mean time can carry an offset in odd seconds.
 */
export function jdToClock(jd: number, offsetHours = 0): EclipseClock {
  const utcMs = Math.round(((jd - UNIX_EPOCH_JD) * MS_DAY) / 1000) * 1000;
  const d = new Date(Math.round((utcMs + offsetHours * 3_600_000) / 1000) * 1000);
  return {
    hms: `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`,
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/** A place's civil clock at one instant: hours ahead of UTC, and the zone's
 *  label then in the shared format ("EDT (UTC−04:00)", "(UTC+03:00)") — or null
 *  for local mean time, which the caller labels in its own words. `name` is the
 *  whole reading (zoneName.ts), for a caller printing the clock itself
 *  (formatZoneClock) or the mean time WITH its offset (formatZoneLabel gives
 *  "LMT (UTC+00:39:57)"). */
export interface PlaceClockReading {
  offsetHours: number;
  zone: string | null;
  name: ZoneName;
}

/**
 * The civil clock of the place at (lat, lng), as a reader there would read an
 * eclipse: its time zone from the coordinates, with that zone's offset AT each
 * instant asked about — so daylight saving is whatever was (or will be) in
 * force on the eclipse's own date, and an eclipse that happens to straddle a
 * clock change reads each contact on the clock of its own moment.
 *
 * Before the place's region adopted standard time, the place's own LOCAL MEAN
 * TIME is substituted for the zone reference city's, as a birth chart's offset
 * is in that era. Both rules, and the name in force, are placeZoneAt's
 * (lib/atlas/zoneName.ts) since 2026-10-07, so the card, the chart header and
 * the timeline name one place's clock alike; the zone's name used to come from
 * the browser, which gives "GMT-4" for New York before 1970.
 *
 * null when the point resolves to no zone (non-finite or out-of-range
 * coordinates, or a zone the host's time-zone data doesn't know), and the caller
 * then gives UTC alone rather than guess.
 */
export function eclipsePlaceClock(
  lat: number,
  lng: number,
): ((jd: number) => PlaceClockReading) | null {
  const clock = placeZoneAt(lat, lng);
  if (!clock) return null;
  return (jd) => {
    const name = clock((jd - UNIX_EPOCH_JD) * MS_DAY);
    return {
      offsetHours: name.seconds / 3600,
      zone: name.kind === 'lmt' ? null : formatZoneLabel(name),
      name,
    };
  };
}

/**
 * An eclipse duration, from seconds: "6m 23s" under an hour, "2h 05m" from an
 * hour up — the resolution follows the size, since a solar central phase is
 * minutes long and a lunar phase hours.
 *
 * `{ resolution: 'minute' }` is for a figure that is only KNOWN to the minute:
 * the catalog's lunar phase lengths, given to a tenth of a minute. Read at the
 * second, a short phase printed "45m 18s" — seconds that are always a multiple
 * of six, a precision the source doesn't have. Those read "45m" instead, or
 * "1h 05m" from an hour up as before. The solar central duration is computed
 * for the place to the second, and keeps its seconds.
 *
 * Rounded to the shown resolution BEFORE it is split into units. The old code
 * floored the larger unit and rounded the remainder separately, which printed
 * "2h 60m" for a 179.8-minute partial phase (15 Jun 1992) and "0h 60m" for a
 * 59.8-minute totality (18 Oct 1967) — twelve catalog eclipses in all — and
 * "3m60s" on the solar card. The seconds are rounded first and THEN tested
 * against the hour, so 3,599.6 s reads "1h 00m", never "60m 00s"; at minute
 * resolution the minutes are, so 59.8 minutes reads "1h 00m", never "60m".
 */
export function formatEclipseDuration(
  seconds: number,
  opts: { resolution?: 'second' | 'minute' } = {},
): string {
  if (opts.resolution === 'minute') {
    const totalMin = Math.max(0, Math.round(seconds / 60));
    return totalMin < 60
      ? `${totalMin}m`
      : `${Math.floor(totalMin / 60)}h ${pad2(totalMin % 60)}m`;
  }
  const s = Math.max(0, Math.round(seconds));
  if (s < 3600) {
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${pad2(s % 60)}s` : `${s}s`;
  }
  const totalMin = Math.round(s / 60);
  return `${Math.floor(totalMin / 60)}h ${pad2(totalMin % 60)}m`;
}

/**
 * An eclipse magnitude: the fraction of the eclipsed body's DIAMETER covered,
 * as the decimal it is conventionally published as ("1.057", "0.730") — not a
 * percentage, which is how the area fraction (obscuration) reads and which the
 * click card prints right beside it, so a percent magnitude invited the reader
 * to take two different quantities for one.
 *
 * Three decimals, everywhere. The catalog publishes four; the place-by-place
 * figure is computed (verify-eclipses §6 holds it to ±0.004 of the published one
 * at greatest eclipse, and it lands within about 0.0001). The point is one
 * precision for both, so the panel's published figure and the card's computed
 * one read against each other directly — and a ten-thousandth of the diameter is
 * nothing an observer sees. The reason is public on calculation-methods.md
 * ("Eclipse times at a place").
 */
export function formatEclipseMagnitude(magnitude: number): string {
  return magnitude.toFixed(3);
}

/** "8 April 2024" from a catalog id ("2024-04-08") — the eclipse's own date, in
 *  the long form both the panel and the click card use. */
export function eclipseLongDate(id: string, fmt: Formatters): string {
  const [y, m, d] = id.split('-').map(Number);
  return `${d} ${fmt.monthName(m)} ${y}`;
}

/** "13 Mar" — the short date a clock column adds when a time falls on a
 *  different day from the one the column is read against. */
export function eclipseShortDate(c: EclipseClock, fmt: Formatters): string {
  return `${c.day} ${fmt.monthAbbr(c.month)}`;
}
