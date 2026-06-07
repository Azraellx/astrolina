// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import tzlookup from 'tz-lookup';
import { DateTime } from 'luxon';

export function getIanaTimezone(lat: number, lng: number): string {
  return tzlookup(lat, lng);
}

export interface TimezoneInfo {
  iana: string;
  offsetHours: number;
  uncertain: boolean;
}

const HISTORICAL_DST_CONFIDENT_REGIONS = /^(America|Europe|Pacific\/Honolulu|US\/)/;

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
  const offsetHours = dt.offset / 60;
  const uncertain =
    year < 1970 && !HISTORICAL_DST_CONFIDENT_REGIONS.test(iana);
  return { iana, offsetHours, uncertain };
}

// resolveZoneInfo for the zone detected from coordinates — the default a fresh chart
// starts from before any manual zone pick.
export function resolveBirthTimezone(
  lat: number,
  lng: number,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): TimezoneInfo {
  return resolveZoneInfo(getIanaTimezone(lat, lng), year, month, day, hour, minute);
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

// Short zone label at an instant, e.g. "EDT", "GMT+5:30". Falls back to a plain
// UTC offset when the zone has no localized name.
export function zoneLabelAt(iana: string, ms: number): string {
  const dt = DateTime.fromMillis(ms, { zone: iana });
  const name = dt.toFormat('ZZZZ');
  return name && !/^GMT$/.test(name) ? name : formatUtcOffset(dt.offset / 60);
}

// Format an east-positive hour offset as "UTC-05:00" / "UTC+05:30".
export function formatUtcOffset(hours: number): string {
  const sign = hours < 0 ? '-' : '+';
  const abs = Math.abs(hours);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  const p = (n: number) => String(n).padStart(2, '0');
  return `UTC${sign}${p(h)}:${p(m)}`;
}
