// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import tzlookup from 'tz-lookup';
import { DateTime } from 'luxon';
// Per zone, the date its local-mean-time era ended (tzdb source, see
// scripts/build-lmt-table.mjs) plus the legacy-alias Link map.
import lmtEras from './data/lmtEras.json';

export function getIanaTimezone(lat: number, lng: number): string {
  return tzlookup(lat, lng);
}

export interface TimezoneInfo {
  iana: string;
  offsetHours: number;
  uncertain: boolean;
  /** The birth predates this zone's adoption of standard time, so the offset is a
   *  local mean time: the birthplace's own (detected path) or the zone reference
   *  city's (explicit-zone path, which is why that path also flags uncertain). */
  lmt: boolean;
}

const HISTORICAL_DST_CONFIDENT_REGIONS = /^(America|Europe|Pacific\/Honolulu|US\/)/;

// Whether the zone was still running on LOCAL MEAN TIME — standard time not yet
// adopted — at this wall-clock birth moment. In that era the tz database (and
// thus Luxon/ICU) reports the mean time of the zone's reference city as a
// stand-in for the whole zone; a birth chart should instead use the mean time
// of the birthplace itself, the convention of the astrological atlases. The
// boundary comes from the tzdb source because it cannot be inferred from offset
// values: France's LEGAL Paris Mean Time (1891–1911) equals Paris LMT to the
// second, and legal mean-time standards must be kept, not replaced. The
// boundary keeps its time-of-day — the US standardized at local NOON on
// 1883-11-18 (the "Day of Two Noons"), so that morning is still LMT. (The
// boundary wall clock is the reference city's; comparing the birthplace's wall
// clock against it is at most minutes off, only within that sliver of the day.)
function inLmtEra(
  iana: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): boolean {
  const eras = lmtEras as { ends: Record<string, string>; links: Record<string, string> };
  const end = eras.ends[eras.links[iana] ?? iana];
  if (!end) return false;
  const m = end.match(/^(\d+)-(\d+)-(\d+)T(\d+):(\d+)/);
  if (!m) return false;
  const birth = [year, month, day, hour, minute];
  const bound = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])];
  for (let i = 0; i < 5; i++) {
    if (birth[i] !== bound[i]) return birth[i] < bound[i];
  }
  return false; // exactly the transition moment: standard time
}

// The offset (east-positive hours, DST-aware) and DST-confidence of an EXPLICIT IANA
// zone for a wall-clock birth moment. This is the heart of timezone handling: the user
// picks a zone (defaulting to the one detected from the birthplace) and we derive the
// exact offset birthDataToJD subtracts to get the UT instant.
export function resolveZoneInfo(
  iana: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): TimezoneInfo {
  const dt = DateTime.fromObject(
    { year, month, day, hour, minute },
    { zone: iana },
  );
  // A zone name the host's ICU doesn't recognize yields an invalid DateTime and
  // a NaN offset — surface a zero offset flagged uncertain instead of letting
  // NaN flow into the saved chart.
  if (!dt.isValid || !Number.isFinite(dt.offset)) {
    return { iana, offsetHours: 0, uncertain: true, lmt: false };
  }
  const offsetHours = dt.offset / 60;
  const lmt = inLmtEra(iana, year, month, day, hour, minute);
  // An explicitly chosen zone in its LMT era yields the REFERENCE CITY's mean
  // time, which is almost certainly not the birthplace's — flag it.
  const uncertain =
    lmt || (year < 1970 && !HISTORICAL_DST_CONFIDENT_REGIONS.test(iana));
  return { iana, offsetHours, uncertain, lmt };
}

// resolveZoneInfo for the zone detected from coordinates — the default a fresh chart
// starts from before any manual zone pick. For births in the zone's LMT era this
// substitutes the BIRTHPLACE's own local mean time (longitude / 15°h), matching
// astro.com / ACS atlas practice: e.g. Einstein, Ulm 1879, gets Ulm's +0:39:57,
// not Europe/Berlin's reference-city +0:53:28 (13½ minutes — ~3.4° on the MC).
export function resolveBirthTimezone(
  lat: number,
  lng: number,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): TimezoneInfo {
  const info = resolveZoneInfo(getIanaTimezone(lat, lng), year, month, day, hour, minute);
  // Open ocean resolves to a nautical Etc/GMT±N zone, which has no LMT era in
  // the table (its whole-hour offset is constant forever). Nautical zone time
  // was only standardized in 1920; a sea birth before that kept ship's local
  // mean time, so substitute the position's own LMT for those.
  if (!info.lmt && /^(Etc\/|UTC$)/.test(info.iana) && year < 1920) {
    return { iana: info.iana, offsetHours: lng / 15, uncertain: true, lmt: true };
  }
  if (info.lmt) {
    // Match the era's CALENDAR RECKONING: territories that historically sat on
    // the other side of the date line (Alaska pre-1867, the Philippines
    // pre-1845, Samoa pre-1892...) kept the same local meridian but a civil
    // date one day apart from the modern reckoning lng/15 implies. The zone's
    // own offset for the birth moment carries that reckoning, so shift the
    // birthplace mean time by whole days toward it — a birth recorded on the
    // local calendar then lands on the correct UT instant.
    const base = lng / 15;
    const dayShift = Math.round((info.offsetHours - base) / 24) * 24;
    const uncertain = year < 1970 && !HISTORICAL_DST_CONFIDENT_REGIONS.test(info.iana);
    return { iana: info.iana, offsetHours: base + dayShift, uncertain, lmt: true };
  }
  return info;
}

// The canonical IANA zone list (Intl Enumeration API), for the time-zone picker —
// computed once and cached. Empty on the rare engine without supportedValuesOf, in
// which case the picker falls back to just the detected zone.
let cachedZones: string[] | null = null;
export function listTimeZones(): string[] {
  if (cachedZones) return cachedZones;
  const intl = Intl as unknown as {
    supportedValuesOf?: (key: 'timeZone') => string[];
  };
  try {
    cachedZones =
      typeof intl.supportedValuesOf === 'function'
        ? intl.supportedValuesOf('timeZone')
        : [];
  } catch {
    cachedZones = [];
  }
  return cachedZones;
}

// The IANA zone's UTC offset (hours, east-positive) AT a specific absolute instant
// — DST-aware. Used to show the timeline in a chart's zone with the right DST.
export function offsetHoursAt(iana: string, ms: number): number {
  return DateTime.fromMillis(ms, { zone: iana }).offset / 60;
}

// zoneLabelAt ("EDT", "GMT+5:30") and formatUtcOffset ("UTC-05:00") were removed on
// 2026-10-07, once the last importer had moved. Every zoned clock now prints one way,
// "09:30 EDT (UTC−04:00)", through zoneName.ts: the name in force is read from the zone
// catalogue, where the browser has none for New York before 1970 ("GMT-4") nor for
// Berlin in en-US ("GMT+2"), and the offset keeps a mean time's seconds and a true minus.
