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

export function resolveBirthTimezone(
  lat: number,
  lng: number,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): TimezoneInfo {
  const iana = getIanaTimezone(lat, lng);
  const dt = DateTime.fromObject(
    { year, month, day, hour, minute },
    { zone: iana },
  );
  const offsetHours = dt.offset / 60;
  const uncertain =
    year < 1970 && !HISTORICAL_DST_CONFIDENT_REGIONS.test(iana);
  return { iana, offsetHours, uncertain };
}
