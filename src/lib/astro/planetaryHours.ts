// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// PLANETARY DAYS & HOURS at a place. A planetary day runs from one sunrise to the
// next: its daylight is cut into 12 equal hours and its night into 12 more, so
// the hours are unequal between day and night and change through the year. The
// day is ruled by the planet of its weekday, which also rules its first hour; the
// rest follow in the descending order of the planets' periods, cycling. After 24
// hours that order lands on the next weekday's planet (24 ≡ 3 mod 7) — the week's
// order falls out of the hours', and the tests lean on that identity.
//
// Deliberately independent of every chart setting: zodiac, line system, houses,
// birth time and which bodies are shown take no part (none is an argument here).
// The only astronomy is the Sun's visible rise and set — the same instants the
// sky band prints — from riseSet.ts. See docs/calculation-methods.md, "Planetary
// days and hours", for the conventions and the reasons for them.
import type { PlanetName } from '../ephemeris';
import { offsetHoursAt } from '../atlas/timezone';
import { sunHorizonDay, type SunHorizonDay } from './riseSet';

const MS_DAY = 86_400_000;
const msToJD = (ms: number) => ms / MS_DAY + 2440587.5;
const jdToMs = (jd: number) => (jd - 2440587.5) * MS_DAY;

export type PlanetaryRuler = Extract<
  PlanetName,
  'Saturn' | 'Jupiter' | 'Mars' | 'Sun' | 'Venus' | 'Mercury' | 'Moon'
>;

/** The order the hours follow: slowest to fastest, as the planets were ranked by
 *  their periods. */
export const CHALDEAN_ORDER: readonly PlanetaryRuler[] = [
  'Saturn',
  'Jupiter',
  'Mars',
  'Sun',
  'Venus',
  'Mercury',
  'Moon',
];

/** Each weekday's planet, indexed like `Date#getUTCDay` (0 = Sunday). */
export const WEEKDAY_RULERS: readonly PlanetaryRuler[] = [
  'Sun',
  'Moon',
  'Mars',
  'Mercury',
  'Jupiter',
  'Venus',
  'Saturn',
];

/** A local calendar date; `weekday` 0 = Sunday. */
export interface CivilDate {
  year: number;
  month: number;
  day: number;
  weekday: number;
}

export interface PlanetaryHour {
  /** 0–11 the daylight hours, 12–23 the night's. */
  index: number;
  night: boolean;
  ruler: PlanetaryRuler;
  /** JD (UT). */
  start: number;
  end: number;
}

export interface PlanetaryDay {
  ok: true;
  /** The calendar date the day is named for: the date of its midday. */
  date: CivilDate;
  ruler: PlanetaryRuler;
  /** JD (UT). */
  sunrise: number;
  sunset: number;
  nextSunrise: number;
  /** One daylight hour and one night hour, in days. Measured in UT, so a clock
   *  change inside the night moves its labels, never its length. */
  dayHour: number;
  nightHour: number;
  hours: PlanetaryHour[];
}

/** 'sun-up': the Sun doesn't set (or didn't the night before) — no night to close
 *  the day. 'sun-down': it doesn't rise. 'no-next-sunrise': the day has a sunrise
 *  and a sunset, but the night after has no end. */
export type PlanetaryUnavailableReason = 'sun-up' | 'sun-down' | 'no-next-sunrise';

export interface PlanetaryDayUnavailable {
  ok: false;
  date: CivilDate;
  reason: PlanetaryUnavailableReason;
  /** Kept when it exists, so the instants after it can still be attributed to
   *  this day — and to its reason. */
  sunrise: number | null;
}

export type PlanetaryDayResult = PlanetaryDay | PlanetaryDayUnavailable;

/** The planetary day named for a calendar date, with its neighbours: an instant
 *  between midnight and sunrise belongs to the day BEFORE, and near the polar
 *  circles a sunrise can fall before midnight, so an instant late in the evening
 *  can already belong to the day after. */
export interface PlanetaryDaysAround {
  previous: PlanetaryDayResult;
  shown: PlanetaryDayResult;
  next: PlanetaryDayResult;
}

export type PlanetaryNow =
  | { ok: true; day: PlanetaryDay; hour: PlanetaryHour }
  | { ok: false; day: PlanetaryDayUnavailable };

// The local calendar date at an instant, read the way the sky band reads its
// clock: shift by the zone's offset AT that instant, then take the UTC fields.
function civilDate(ms: number, zone: string): CivilDate {
  const wall = new Date(ms + offsetHoursAt(zone, ms) * 3_600_000);
  return {
    year: wall.getUTCFullYear(),
    month: wall.getUTCMonth() + 1,
    day: wall.getUTCDate(),
    weekday: wall.getUTCDay(),
  };
}

// One planetary day from the Sun's day `a` and the next one, `b`.
function buildDay(a: SunHorizonDay, b: SunHorizonDay | null, zone: string): PlanetaryDayResult {
  const date = civilDate(jdToMs(a.noon), zone);
  if (a.rise === null || a.set === null) {
    const reason: PlanetaryUnavailableReason =
      a.circumpolar === 'up'
        ? 'sun-up'
        : a.circumpolar === 'down'
          ? 'sun-down'
          : a.rise === null
            ? 'sun-down'
            : 'sun-up';
    return { ok: false, date, reason, sunrise: a.rise };
  }
  const { rise, set } = a;
  const next = b?.rise ?? null;
  // The next sunrise must close THIS night: after the sunset, and within a day
  // of it. Anything else is a solve that found a different crossing at a polar
  // edge — reported, never stretched into hours.
  if (next === null || !(next > set) || next - set > 1) {
    return { ok: false, date, reason: 'no-next-sunrise', sunrise: rise };
  }
  if (!(rise < a.noon && a.noon < set)) {
    return { ok: false, date, reason: set - rise > 0.5 ? 'sun-up' : 'sun-down', sunrise: rise };
  }
  const ruler = WEEKDAY_RULERS[date.weekday];
  const first = CHALDEAN_ORDER.indexOf(ruler);
  const dayHour = (set - rise) / 12;
  const nightHour = (next - set) / 12;
  const hours: PlanetaryHour[] = [];
  for (let i = 0; i < 24; i++) {
    const night = i >= 12;
    const start = night ? set + (i - 12) * nightHour : rise + i * dayHour;
    // The last hour of each half ends on the Sun's own instant, not on the sum
    // of twelve lengths, so the tiles meet exactly.
    const end = i === 11 ? set : i === 23 ? next : start + (night ? nightHour : dayHour);
    hours.push({ index: i, night, ruler: CHALDEAN_ORDER[(first + i) % 7], start, end });
  }
  return {
    ok: true,
    date,
    ruler,
    sunrise: rise,
    sunset: set,
    nextSunrise: next,
    dayHour,
    nightHour,
    hours,
  };
}

/**
 * The planetary day named for the calendar date whose local midday is near
 * `noonMs` (epoch ms UT — the sky band passes its shown day's midnight + 12 h),
 * with the days either side, at (lat, lng) in `zone`. Null when the Sun has no
 * ephemeris data or the transits don't line up a day apart.
 */
export function planetaryDaysAround(
  noonMs: number,
  lat: number,
  lng: number,
  zone: string,
): PlanetaryDaysAround | null {
  const noonJd = msToJD(noonMs);
  const suns: SunHorizonDay[] = [];
  for (let k = -1; k <= 2; k++) {
    const s = sunHorizonDay(noonJd + k, lat, lng);
    if (!s) return null;
    suns.push(s);
  }
  // Each solve anchors on the transit nearest its own noon, so consecutive
  // transits must be a day apart; anything else means a solve latched onto the
  // wrong one, and no day built from it can be trusted.
  for (let i = 1; i < suns.length; i++) {
    if (Math.abs(suns[i].noon - suns[i - 1].noon - 1) > 0.05) return null;
  }
  return {
    previous: buildDay(suns[0], suns[1], zone),
    shown: buildDay(suns[1], suns[2], zone),
    next: buildDay(suns[2], suns[3], zone),
  };
}

/**
 * The planetary hour in force at `ms` (epoch ms UT), from the days around it.
 * `ok: false` names the unavailable day that owns the instant (the latest one
 * whose sunrise has passed, or the shown day when none has). Null when the
 * instant lies outside all three days.
 */
export function planetaryHourAt(days: PlanetaryDaysAround, ms: number): PlanetaryNow | null {
  const jd = msToJD(ms);
  const order = [days.previous, days.shown, days.next];
  for (const d of order) {
    if (!d.ok || jd < d.sunrise || jd >= d.nextSunrise) continue;
    const i =
      jd < d.sunset
        ? Math.min(11, Math.floor((jd - d.sunrise) / d.dayHour))
        : 12 + Math.min(11, Math.floor((jd - d.sunset) / d.nightHour));
    // The floor can land one tile off at an exact boundary; the tiles' own
    // edges decide.
    let hour = d.hours[i];
    if (jd < hour.start && i > 0) hour = d.hours[i - 1];
    else if (jd >= hour.end && i < 23) hour = d.hours[i + 1];
    return { ok: true, day: d, hour };
  }
  // No hour covers it: attribute it to an unavailable day, if one owns it.
  let owner: PlanetaryDayUnavailable | null = null;
  for (const d of order) {
    if (d.ok) {
      if (jd >= d.sunrise) owner = null; // a later available day took over
      continue;
    }
    if (d.sunrise !== null && jd >= d.sunrise) owner = d;
  }
  if (owner) return { ok: false, day: owner };
  if (!days.shown.ok) return { ok: false, day: days.shown };
  if (!days.previous.ok) return { ok: false, day: days.previous };
  return null;
}
