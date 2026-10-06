// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Time-zone entry in the terms birth data is actually written in.
//
// A birth record states its zone the way its source printed it: "EST + daylight",
// "5hw00", "-05:00", "4:56:02 W", "LMT", "UT". Before 2026-10-02 the chart form
// only took an IANA zone or a whole-hour UTC offset, so every one of those had to
// be translated by hand — and a hand translation is exactly where a sign flips or
// a daylight hour is added twice. This module is the arithmetic behind the form's
// other ways in, kept free of React so the importer and the share link can use
// the same rules as the form, and so a verify script can test them directly.
//
// The ONE value the chart math reads is still `tzOffset` (east-positive hours).
// Everything here either produces it or describes how it was produced. A saved
// chart never re-resolves: what is described here is how the editor reopens, not
// a second source of truth — where the two disagree, `tzOffset` wins (see
// reopenZoneChoice).

import { DateTime } from 'luxon';
import { parseOffsetToken } from '../import/fields';
// The daylight corrections are READ from the exchange-format reader's table, not
// restated: the form's "+ daylight" and an imported "time type 1" must be the same
// number, and a second copy is how they would stop being.
import { DAYLIGHT_CORRECTION } from '../import/readers/aaf';
import { resolveBirthTimezone, resolveZoneInfo, type TimezoneInfo } from './timezone';
import lmtEras from './data/lmtEras.json';

// ── Daylight codes ──────────────────────────────────────────────────────────

/** How much daylight correction a STANDARD zone carries at the birth moment.
 *  Local mean time is deliberately not one of these: a mean time has no
 *  standard zone to correct, so it is an exact offset (see OffsetEntry.basis). */
export type DaylightCode = 'standard' | 'daylight' | 'war' | 'double' | 'half';

export interface DaylightOption {
  code: DaylightCode;
  /** The exchange format's time-type letter for the same correction. */
  aaf: string;
  /** Whole seconds added to the standard offset. */
  seconds: number;
}

// War time is listed although it adds the same hour as daylight saving: sources
// print it as a separate code, and an astrologer copying "EWT" wants to find it.
// The exchange format's 'm' (special meridian) is omitted for the opposite
// reason — it means "standard", and offering it would be two names for one row.
export const DAYLIGHT_OPTIONS: readonly DaylightOption[] = (
  [
    ['standard', '0'],
    ['daylight', '1'],
    ['war', 'w'],
    ['double', '2'],
    ['half', 'h'],
  ] as const
).map(([code, aaf]) => ({ code, aaf, seconds: DAYLIGHT_CORRECTION[aaf] }));

const DAYLIGHT_BY_CODE = new Map(DAYLIGHT_OPTIONS.map((o) => [o.code, o]));

/** Seconds a daylight code adds to its standard offset. */
export function daylightSeconds(code: DaylightCode): number {
  return DAYLIGHT_BY_CODE.get(code)?.seconds ?? 0;
}

export function isDaylightCode(v: unknown): v is DaylightCode {
  return typeof v === 'string' && DAYLIGHT_BY_CODE.has(v as DaylightCode);
}

/**
 * The exchange format's time-type letter, as the reader looks it up (exact,
 * then lower case), mapped onto the form's terms. 'lmt' for its local-mean-time
 * code; null for a letter the reader does not recognise either.
 */
export function daylightFromAaf(timeType: string): DaylightCode | 'lmt' | null {
  const t = timeType.trim();
  const key = Object.hasOwn(DAYLIGHT_CORRECTION, t)
    ? t
    : Object.hasOwn(DAYLIGHT_CORRECTION, t.toLowerCase())
      ? t.toLowerCase()
      : null;
  if (key == null) return null;
  if (key === 'L') return 'lmt';
  // 'm' is the special meridian: standard by another name (see the reader).
  if (key === 'm') return 'standard';
  return DAYLIGHT_OPTIONS.find((o) => o.aaf === key)?.code ?? null;
}

// ── The standard-zone catalogue ─────────────────────────────────────────────

export interface StandardZone {
  /** Stable id, stored on charts (StandardEntry.zone). Never reuse one. */
  id: string;
  /** The zone's own name, in English. Shown WITH region and offset, never alone:
   *  the abbreviations are the ambiguous part (CST is four zones here). */
  name: string;
  /** The established abbreviation of the standard time, where one exists. */
  abbr?: string;
  /** The abbreviation of its daylight time, where that is unambiguous. */
  dstAbbr?: string;
  /** The correction `dstAbbr` names, where it is not the +1 h one: Lord Howe's
   *  daylight time (LHDT) is half an hour ahead, so LHDT is never put on a
   *  Lord Howe + 1 h reading (2026-10-02). */
  dstCode?: DaylightCode;
  /** The name of its daylight time ("Eastern Daylight"), which gives the zone a
   *  daylight row of its own in the chart form's list (2026-10-05). Set on every
   *  zone with a `dstAbbr`, and on GMT as British Summer Time — the name British
   *  sources print, kept off `dstAbbr` for the reason above. A daylight row
   *  carries no region: the standard time's list of places is not the list
   *  that keeps its daylight time (Jamaica keeps EST and never EDT). */
  dstName?: string;
  /** Where the zone is used, as names rather than a description. */
  region: string;
  /** The STANDARD offset, east-positive whole seconds. */
  std: number;
  /** A zone that keeps this standard time — what the verify cross-checks the
   *  offset against, and the first zone a detected birthplace is matched to. */
  iana: string;
  /** Further zones that keep this standard time, for matching a detected
   *  birthplace to this entry (preselection and imports). Each is checked
   *  against the tz database like `iana`. */
  members?: readonly string[];
  /** The years (inclusive) a historic standard time was in use. Absent = in use
   *  now. Bounds matching only — the entry can always be picked by hand. */
  years?: readonly (readonly [number, number])[];
  /** For a historic entry, a year in which both January and July fall inside its
   *  era — the year the verify cross-checks it in. Modern entries check 2025. */
  checkYear?: number;
}

const H = 3600;
const hm = (h: number, m = 0) => Math.sign(h || 1) * (Math.abs(h) * H + m * 60);
const NOW = 9999;

// West to east. Every half- and quarter-hour standard time the tz database has
// recorded since 1868 is here, and every whole hour from −11 to +14 has at least
// one named zone in use today (scripts/verify-zone-entry.ts §1 holds both true);
// the whole-hour UTC picker remains for anything this list leaves out.
//
// A region names the places, never a description of them (2026-10-02): "West
// Africa" on GMT and "West & Central Africa" on WAT both claimed Ghana at
// different offsets. "& more" marks a list that stops short. Where the name
// already lists the places, the region repeats it and the form shows it once.
export const STANDARD_ZONES: readonly StandardZone[] = [
  { id: 'samoa-sst', name: 'Samoa Standard', abbr: 'SST', region: 'American Samoa & Midway', std: hm(-11), iana: 'Pacific/Pago_Pago', members: ['Pacific/Midway'] },
  { id: 'samoa-1911', name: 'Samoa, 1911–1949', region: 'Samoa', std: hm(-11, 30), iana: 'Pacific/Apia', years: [[1911, 1949]], checkYear: 1930 },
  { id: 'hst-1896', name: 'Hawaii Standard, 1896–1947', abbr: 'HST', region: 'Hawaii', std: hm(-10, 30), iana: 'Pacific/Honolulu', years: [[1896, 1947]], checkYear: 1930 },
  { id: 'hst', name: 'Hawaii–Aleutian Standard', abbr: 'HST', dstAbbr: 'HDT', dstName: 'Hawaii–Aleutian Daylight', region: 'Hawaii & Aleutian Islands', std: hm(-10), iana: 'Pacific/Honolulu', members: ['America/Adak'], years: [[1947, NOW]] },
  { id: 'cook-1952', name: 'Cook Islands, 1952–1978', region: 'Cook Islands', std: hm(-10, 30), iana: 'Pacific/Rarotonga', years: [[1952, 1978]], checkYear: 1970 },
  { id: 'tahiti-cook', name: 'Tahiti & Cook Islands', region: 'French Polynesia & Cook Islands', std: hm(-10), iana: 'Pacific/Tahiti', members: ['Pacific/Rarotonga'] },
  { id: 'marquesas', name: 'Marquesas Islands', region: 'French Polynesia', std: hm(-9, 30), iana: 'Pacific/Marquesas' },
  { id: 'akst', name: 'Alaska Standard', abbr: 'AKST', dstAbbr: 'AKDT', dstName: 'Alaska Daylight', region: 'Alaska', std: hm(-9), iana: 'America/Anchorage', members: ['America/Juneau', 'America/Nome', 'America/Sitka', 'America/Yakutat', 'America/Metlakatla'] },
  { id: 'pitcairn-1901', name: 'Pitcairn, 1901–1998', region: 'Pitcairn Islands', std: hm(-8, 30), iana: 'Pacific/Pitcairn', years: [[1901, 1998]], checkYear: 1950 },
  { id: 'pst', name: 'Pacific Standard', abbr: 'PST', dstAbbr: 'PDT', dstName: 'Pacific Daylight', region: 'North America', std: hm(-8), iana: 'America/Los_Angeles', members: ['America/Vancouver', 'America/Tijuana'] },
  { id: 'mst', name: 'Mountain Standard', abbr: 'MST', dstAbbr: 'MDT', dstName: 'Mountain Daylight', region: 'North America', std: hm(-7), iana: 'America/Denver', members: ['America/Phoenix', 'America/Edmonton', 'America/Boise', 'America/Hermosillo', 'America/Mazatlan', 'America/Ciudad_Juarez', 'America/Whitehorse', 'America/Dawson', 'America/Dawson_Creek', 'America/Fort_Nelson', 'America/Cambridge_Bay', 'America/Inuvik'] },
  { id: 'cst', name: 'Central Standard', abbr: 'CST', dstAbbr: 'CDT', dstName: 'Central Daylight', region: 'North & Central America', std: hm(-6), iana: 'America/Chicago', members: ['America/Winnipeg', 'America/Regina', 'America/Swift_Current', 'America/Mexico_City', 'America/Monterrey', 'America/Merida', 'America/Matamoros', 'America/Bahia_Banderas', 'America/Chihuahua', 'America/Ojinaga', 'America/Guatemala', 'America/Belize', 'America/El_Salvador', 'America/Tegucigalpa', 'America/Managua', 'America/Costa_Rica', 'America/Indiana/Knox', 'America/Indiana/Tell_City', 'America/Menominee', 'America/North_Dakota/Center', 'America/North_Dakota/New_Salem', 'America/North_Dakota/Beulah', 'America/Rankin_Inlet', 'America/Resolute'] },
  { id: 'est', name: 'Eastern Standard', abbr: 'EST', dstAbbr: 'EDT', dstName: 'Eastern Daylight', region: 'US & Canada (east), Jamaica, Haiti, Panama & more', std: hm(-5), iana: 'America/New_York', members: ['America/Toronto', 'America/Detroit', 'America/Indiana/Indianapolis', 'America/Indiana/Vincennes', 'America/Indiana/Winamac', 'America/Indiana/Marengo', 'America/Indiana/Petersburg', 'America/Indiana/Vevay', 'America/Kentucky/Louisville', 'America/Kentucky/Monticello', 'America/Iqaluit', 'America/Cancun', 'America/Panama', 'America/Jamaica', 'America/Port-au-Prince', 'America/Grand_Turk'] },
  { id: 'cuba', name: 'Cuba Standard', abbr: 'CST', dstAbbr: 'CDT', dstName: 'Cuba Daylight', region: 'Cuba', std: hm(-5), iana: 'America/Havana' },
  { id: 'andes', name: 'Colombia, Ecuador & Peru', region: 'South America', std: hm(-5), iana: 'America/Bogota', members: ['America/Lima', 'America/Guayaquil'] },
  { id: 'venezuela-4h30', name: 'Venezuela, 1912–1965 & 2007–2016', region: 'Venezuela', std: hm(-4, 30), iana: 'America/Caracas', years: [[1912, 1965], [2007, 2016]], checkYear: 2010 },
  { id: 'ast', name: 'Atlantic Standard', abbr: 'AST', dstAbbr: 'ADT', dstName: 'Atlantic Daylight', region: 'Atlantic Canada, Puerto Rico, Dominican Republic & more', std: hm(-4), iana: 'America/Halifax', members: ['America/Moncton', 'America/Glace_Bay', 'America/Goose_Bay', 'America/Thule', 'Atlantic/Bermuda', 'America/Puerto_Rico', 'America/Santo_Domingo', 'America/Barbados', 'America/Martinique'] },
  { id: 'chile', name: 'Chile Standard', abbr: 'CLT', dstAbbr: 'CLST', dstName: 'Chile Summer', region: 'Chile', std: hm(-4), iana: 'America/Santiago' },
  { id: 'amazon', name: 'Amazon', abbr: 'AMT', region: 'Brazil (Amazon), Bolivia & Venezuela', std: hm(-4), iana: 'America/Manaus', members: ['America/Porto_Velho', 'America/Boa_Vista', 'America/Cuiaba', 'America/Campo_Grande', 'America/La_Paz', 'America/Caracas'] },
  { id: 'guyana-1915', name: 'Guyana, 1915–1975', region: 'Guyana', std: hm(-3, 45), iana: 'America/Guyana', years: [[1915, 1975]], checkYear: 1960 },
  { id: 'nst', name: 'Newfoundland Standard', abbr: 'NST', dstAbbr: 'NDT', dstName: 'Newfoundland Daylight', region: 'Newfoundland', std: hm(-3, 30), iana: 'America/St_Johns' },
  { id: 'suriname-1945', name: 'Suriname, 1945–1984', region: 'Suriname', std: hm(-3, 30), iana: 'America/Paramaribo', years: [[1945, 1984]], checkYear: 1970 },
  { id: 'uruguay-1923', name: 'Uruguay, 1923–1942', region: 'Uruguay', std: hm(-3, 30), iana: 'America/Montevideo', years: [[1923, 1942]], checkYear: 1930 },
  { id: 'brasilia', name: 'Brasília Standard', abbr: 'BRT', dstAbbr: 'BRST', dstName: 'Brasília Summer', region: 'Brazil', std: hm(-3), iana: 'America/Sao_Paulo', members: ['America/Bahia', 'America/Fortaleza', 'America/Recife', 'America/Belem', 'America/Maceio', 'America/Araguaina', 'America/Santarem'] },
  { id: 'argentina-uruguay', name: 'Argentina & Uruguay', region: 'South America', std: hm(-3), iana: 'America/Argentina/Buenos_Aires', members: ['America/Argentina/Cordoba', 'America/Argentina/Salta', 'America/Argentina/Jujuy', 'America/Argentina/Tucuman', 'America/Argentina/Catamarca', 'America/Argentina/La_Rioja', 'America/Argentina/San_Juan', 'America/Argentina/Mendoza', 'America/Argentina/San_Luis', 'America/Argentina/Rio_Gallegos', 'America/Argentina/Ushuaia', 'America/Montevideo'], years: [[1969, NOW]] },
  { id: 'noronha', name: 'Fernando de Noronha & South Georgia', region: 'South Atlantic', std: hm(-2), iana: 'America/Noronha', members: ['Atlantic/South_Georgia'] },
  { id: 'azores', name: 'Azores & Cape Verde', region: 'North Atlantic', std: hm(-1), iana: 'Atlantic/Azores', members: ['Atlantic/Cape_Verde'] },
  { id: 'gmt', name: 'Greenwich Mean Time', abbr: 'GMT', dstName: 'British Summer Time', region: 'UK, Ireland, Iceland, Ghana, Senegal & more', std: 0, iana: 'Europe/London', members: ['Europe/Dublin', 'Europe/Guernsey', 'Europe/Isle_of_Man', 'Europe/Jersey', 'Atlantic/Reykjavik', 'Africa/Abidjan', 'Africa/Accra', 'Africa/Bamako', 'Africa/Banjul', 'Africa/Bissau', 'Africa/Conakry', 'Africa/Dakar', 'Africa/Freetown', 'Africa/Lome', 'Africa/Monrovia', 'Africa/Nouakchott', 'Africa/Ouagadougou', 'Africa/Sao_Tome', 'Atlantic/St_Helena', 'America/Danmarkshavn'] },
  { id: 'wet', name: 'Western European', abbr: 'WET', dstAbbr: 'WEST', dstName: 'Western European Summer', region: 'Portugal, Canary Islands & Faroes', std: 0, iana: 'Europe/Lisbon', members: ['Atlantic/Canary', 'Atlantic/Madeira', 'Atlantic/Faroe'] },
  { id: 'nigeria-1914', name: 'Nigeria, 1914–1919', region: 'Nigeria', std: hm(0, 30), iana: 'Africa/Lagos', years: [[1914, 1919]], checkYear: 1916 },
  { id: 'cet', name: 'Central European', abbr: 'CET', dstAbbr: 'CEST', dstName: 'Central European Summer', region: 'Germany, France, Italy, Spain, Poland, Algeria & more', std: hm(1), iana: 'Europe/Berlin', members: ['Europe/Paris', 'Europe/Rome', 'Europe/Madrid', 'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Vienna', 'Europe/Zurich', 'Europe/Stockholm', 'Europe/Oslo', 'Europe/Copenhagen', 'Europe/Warsaw', 'Europe/Prague', 'Europe/Budapest', 'Europe/Belgrade', 'Europe/Zagreb', 'Europe/Ljubljana', 'Europe/Sarajevo', 'Europe/Skopje', 'Europe/Podgorica', 'Europe/Tirane', 'Europe/Bratislava', 'Europe/Luxembourg', 'Europe/Monaco', 'Europe/Malta', 'Europe/Andorra', 'Europe/Gibraltar', 'Europe/Vaduz', 'Europe/San_Marino', 'Europe/Vatican', 'Europe/Busingen', 'Africa/Ceuta', 'Arctic/Longyearbyen', 'Africa/Algiers', 'Africa/Tunis'] },
  { id: 'wat', name: 'West Africa', abbr: 'WAT', region: 'Nigeria, Cameroon, Congo, Angola & more', std: hm(1), iana: 'Africa/Lagos', members: ['Africa/Kinshasa', 'Africa/Luanda', 'Africa/Douala', 'Africa/Ndjamena', 'Africa/Niamey', 'Africa/Porto-Novo', 'Africa/Libreville', 'Africa/Malabo', 'Africa/Bangui', 'Africa/Brazzaville'] },
  { id: 'southern-africa-1892', name: 'South Africa, 1892–1903', region: 'South Africa & Namibia', std: hm(1, 30), iana: 'Africa/Johannesburg', members: ['Africa/Windhoek', 'Africa/Maseru', 'Africa/Mbabane'], years: [[1892, 1903]], checkYear: 1900 },
  { id: 'eet', name: 'Eastern European', abbr: 'EET', dstAbbr: 'EEST', dstName: 'Eastern European Summer', region: 'Greece, Finland, Ukraine, Romania, the Baltic states, Egypt & more', std: hm(2), iana: 'Europe/Athens', members: ['Europe/Helsinki', 'Europe/Kyiv', 'Europe/Bucharest', 'Europe/Sofia', 'Europe/Riga', 'Europe/Tallinn', 'Europe/Vilnius', 'Europe/Chisinau', 'Europe/Mariehamn', 'Europe/Kaliningrad', 'Asia/Nicosia', 'Asia/Famagusta', 'Asia/Beirut', 'Africa/Cairo', 'Africa/Tripoli', 'Asia/Gaza', 'Asia/Hebron'] },
  { id: 'israel', name: 'Israel Standard', abbr: 'IST', dstAbbr: 'IDT', dstName: 'Israel Daylight', region: 'Israel', std: hm(2), iana: 'Asia/Jerusalem' },
  { id: 'cat', name: 'Central Africa', abbr: 'CAT', region: 'Central & Southern Africa', std: hm(2), iana: 'Africa/Maputo', members: ['Africa/Harare', 'Africa/Lusaka', 'Africa/Lubumbashi', 'Africa/Gaborone', 'Africa/Blantyre', 'Africa/Bujumbura', 'Africa/Kigali', 'Africa/Windhoek', 'Africa/Khartoum', 'Africa/Juba'] },
  { id: 'sast', name: 'South African Standard', abbr: 'SAST', region: 'South Africa, Lesotho & Eswatini', std: hm(2), iana: 'Africa/Johannesburg', members: ['Africa/Maseru', 'Africa/Mbabane'] },
  { id: 'east-africa-1908', name: 'East Africa, 1908–1936', region: 'Kenya, Tanganyika, Uganda & Somalia', std: hm(2, 30), iana: 'Africa/Nairobi', members: ['Africa/Kampala', 'Africa/Dar_es_Salaam', 'Africa/Mogadishu'], years: [[1908, 1936]], checkYear: 1920 },
  { id: 'east-africa-1937', name: 'East Africa, 1937–1942', region: 'Kenya, Tanganyika, Uganda & Somalia', std: hm(2, 45), iana: 'Africa/Nairobi', members: ['Africa/Kampala', 'Africa/Dar_es_Salaam', 'Africa/Mogadishu'], years: [[1937, 1942]], checkYear: 1940 },
  { id: 'msk', name: 'Moscow Standard', abbr: 'MSK', region: 'Western Russia & Belarus', std: hm(3), iana: 'Europe/Moscow', members: ['Europe/Simferopol', 'Europe/Kirov', 'Europe/Volgograd', 'Europe/Minsk'] },
  { id: 'turkey', name: 'Turkey', abbr: 'TRT', region: 'Turkey', std: hm(3), iana: 'Europe/Istanbul' },
  { id: 'arabia', name: 'Arabia Standard', abbr: 'AST', region: 'Arabian Peninsula & Iraq', std: hm(3), iana: 'Asia/Riyadh', members: ['Asia/Baghdad', 'Asia/Kuwait', 'Asia/Qatar', 'Asia/Bahrain', 'Asia/Aden'] },
  { id: 'eat', name: 'East Africa', abbr: 'EAT', region: 'East Africa & Madagascar', std: hm(3), iana: 'Africa/Nairobi', members: ['Africa/Addis_Ababa', 'Africa/Dar_es_Salaam', 'Africa/Kampala', 'Africa/Mogadishu', 'Africa/Djibouti', 'Africa/Asmara', 'Indian/Antananarivo', 'Indian/Comoro', 'Indian/Mayotte'] },
  { id: 'iran', name: 'Iran Standard', abbr: 'IRST', dstAbbr: 'IRDT', dstName: 'Iran Daylight', region: 'Iran', std: hm(3, 30), iana: 'Asia/Tehran' },
  { id: 'gulf', name: 'Gulf Standard', abbr: 'GST', region: 'UAE & Oman', std: hm(4), iana: 'Asia/Dubai', members: ['Asia/Muscat'] },
  { id: 'caucasus', name: 'Georgia, Armenia & Azerbaijan', region: 'Caucasus', std: hm(4), iana: 'Asia/Tbilisi', members: ['Asia/Yerevan', 'Asia/Baku'] },
  { id: 'samara', name: 'Samara', abbr: 'SAMT', region: 'Russia (Samara, Saratov, Ulyanovsk & Astrakhan)', std: hm(4), iana: 'Europe/Samara', members: ['Europe/Saratov', 'Europe/Ulyanovsk', 'Europe/Astrakhan'] },
  { id: 'mascarene', name: 'Mauritius, Réunion & Seychelles', region: 'Indian Ocean', std: hm(4), iana: 'Indian/Mauritius', members: ['Indian/Reunion', 'Indian/Mahe'] },
  { id: 'afghanistan', name: 'Afghanistan', abbr: 'AFT', region: 'Afghanistan', std: hm(4, 30), iana: 'Asia/Kabul' },
  { id: 'pakistan', name: 'Pakistan Standard', abbr: 'PKT', region: 'Pakistan', std: hm(5), iana: 'Asia/Karachi' },
  { id: 'yekaterinburg', name: 'Yekaterinburg', abbr: 'YEKT', region: 'Russia (Urals)', std: hm(5), iana: 'Asia/Yekaterinburg' },
  { id: 'central-asia-5', name: 'Uzbekistan, Tajikistan & Turkmenistan', region: 'Central Asia', std: hm(5), iana: 'Asia/Tashkent', members: ['Asia/Samarkand', 'Asia/Dushanbe', 'Asia/Ashgabat'] },
  { id: 'kazakhstan', name: 'Kazakhstan', region: 'Kazakhstan', std: hm(5), iana: 'Asia/Almaty', members: ['Asia/Qostanay', 'Asia/Aqtobe', 'Asia/Aqtau', 'Asia/Atyrau', 'Asia/Oral', 'Asia/Qyzylorda'], years: [[2024, NOW]] },
  { id: 'india', name: 'India Standard', abbr: 'IST', region: 'India & Sri Lanka', std: hm(5, 30), iana: 'Asia/Kolkata', members: ['Asia/Colombo'] },
  { id: 'nepal', name: 'Nepal', abbr: 'NPT', region: 'Nepal', std: hm(5, 45), iana: 'Asia/Kathmandu' },
  { id: 'bangladesh', name: 'Bangladesh Standard', abbr: 'BST', region: 'Bangladesh', std: hm(6), iana: 'Asia/Dhaka' },
  { id: 'myanmar', name: 'Myanmar', abbr: 'MMT', region: 'Myanmar & Cocos Islands', std: hm(6, 30), iana: 'Asia/Yangon', members: ['Indian/Cocos'] },
  { id: 'indochina', name: 'Indochina', abbr: 'ICT', region: 'Thailand, Vietnam, Cambodia & Laos', std: hm(7), iana: 'Asia/Bangkok', members: ['Asia/Ho_Chi_Minh', 'Asia/Phnom_Penh', 'Asia/Vientiane'] },
  { id: 'wib', name: 'Western Indonesia', abbr: 'WIB', region: 'Java, Sumatra & West Kalimantan', std: hm(7), iana: 'Asia/Jakarta', members: ['Asia/Pontianak'] },
  { id: 'java-1932', name: 'Java & Sumatra, 1932–1964', region: 'Indonesia', std: hm(7, 30), iana: 'Asia/Jakarta', members: ['Asia/Pontianak'], years: [[1932, 1964]], checkYear: 1960 },
  { id: 'krasnoyarsk', name: 'Krasnoyarsk & Novosibirsk', region: 'Russia (Siberia)', std: hm(7), iana: 'Asia/Krasnoyarsk', members: ['Asia/Novosibirsk', 'Asia/Novokuznetsk', 'Asia/Barnaul', 'Asia/Tomsk'] },
  { id: 'malaya-1941', name: 'Singapore & Malaya, 1941–1981', region: 'Singapore & Malaysia', std: hm(7, 30), iana: 'Asia/Singapore', members: ['Asia/Kuala_Lumpur'], years: [[1941, 1981]], checkYear: 1970 },
  { id: 'china', name: 'China Standard', abbr: 'CST', region: 'China', std: hm(8), iana: 'Asia/Shanghai' },
  { id: 'hong-kong', name: 'Hong Kong & Macau', region: 'Hong Kong & Macau', std: hm(8), iana: 'Asia/Hong_Kong', members: ['Asia/Macau'] },
  { id: 'taiwan', name: 'Taiwan Standard', abbr: 'CST', region: 'Taiwan', std: hm(8), iana: 'Asia/Taipei' },
  { id: 'singapore', name: 'Singapore & Malaysia', region: 'Singapore, Malaysia & Brunei', std: hm(8), iana: 'Asia/Singapore', members: ['Asia/Kuala_Lumpur', 'Asia/Kuching', 'Asia/Brunei'] },
  { id: 'philippines', name: 'Philippine Standard', abbr: 'PHT', region: 'Philippines', std: hm(8), iana: 'Asia/Manila' },
  { id: 'awst', name: 'Australian Western Standard', abbr: 'AWST', region: 'Western Australia', std: hm(8), iana: 'Australia/Perth' },
  { id: 'korea-1954', name: 'Korea, 1954–1961', abbr: 'KST', region: 'South Korea', std: hm(8, 30), iana: 'Asia/Seoul', years: [[1954, 1961]], checkYear: 1958 },
  { id: 'pyongyang-2015', name: 'Pyongyang, 2015–2018', region: 'North Korea', std: hm(8, 30), iana: 'Asia/Pyongyang', years: [[2015, 2018]], checkYear: 2016 },
  { id: 'eucla', name: 'Australian Central Western Standard', abbr: 'ACWST', region: 'Eucla, Western Australia', std: hm(8, 45), iana: 'Australia/Eucla' },
  { id: 'japan', name: 'Japan Standard', abbr: 'JST', region: 'Japan', std: hm(9), iana: 'Asia/Tokyo' },
  { id: 'korea', name: 'Korea Standard', abbr: 'KST', region: 'South & North Korea', std: hm(9), iana: 'Asia/Seoul', members: ['Asia/Pyongyang'] },
  { id: 'papua-1945', name: 'Western New Guinea, 1945–1963', region: 'Indonesia (Papua)', std: hm(9, 30), iana: 'Asia/Jayapura', years: [[1945, 1963]], checkYear: 1955 },
  { id: 'acst', name: 'Australian Central Standard', abbr: 'ACST', dstAbbr: 'ACDT', dstName: 'Australian Central Daylight', region: 'South Australia & Northern Territory', std: hm(9, 30), iana: 'Australia/Adelaide', members: ['Australia/Darwin', 'Australia/Broken_Hill'] },
  { id: 'aest', name: 'Australian Eastern Standard', abbr: 'AEST', dstAbbr: 'AEDT', dstName: 'Australian Eastern Daylight', region: 'New South Wales, Victoria, Queensland & Tasmania', std: hm(10), iana: 'Australia/Sydney', members: ['Australia/Melbourne', 'Australia/Brisbane', 'Australia/Hobart', 'Australia/Lindeman'] },
  { id: 'chamorro', name: 'Chamorro Standard', abbr: 'ChST', region: 'Guam & Northern Mariana Islands', std: hm(10), iana: 'Pacific/Guam', members: ['Pacific/Saipan'] },
  { id: 'lord-howe', name: 'Lord Howe Standard', abbr: 'LHST', dstAbbr: 'LHDT', dstCode: 'half', dstName: 'Lord Howe Daylight', region: 'Lord Howe Island', std: hm(10, 30), iana: 'Australia/Lord_Howe' },
  { id: 'melanesia', name: 'Solomon Islands, Vanuatu & New Caledonia', region: 'Melanesia', std: hm(11), iana: 'Pacific/Guadalcanal', members: ['Pacific/Efate', 'Pacific/Noumea'] },
  { id: 'nauru-1921', name: 'Nauru, 1921–1979', region: 'Nauru', std: hm(11, 30), iana: 'Pacific/Nauru', years: [[1921, 1979]], checkYear: 1960 },
  { id: 'norfolk-1951', name: 'Norfolk Island, 1951–2015', region: 'Norfolk Island', std: hm(11, 30), iana: 'Pacific/Norfolk', years: [[1951, 2015]], checkYear: 2000 },
  { id: 'nzmt', name: 'New Zealand Mean Time, 1868–1945', abbr: 'NZMT', region: 'New Zealand', std: hm(11, 30), iana: 'Pacific/Auckland', years: [[1868, 1945]], checkYear: 1935 },
  { id: 'nzst', name: 'New Zealand Standard', abbr: 'NZST', dstAbbr: 'NZDT', dstName: 'New Zealand Daylight', region: 'New Zealand', std: hm(12), iana: 'Pacific/Auckland', years: [[1946, NOW]] },
  { id: 'fiji', name: 'Fiji, Tuvalu & Marshall Islands', region: 'Fiji, Tuvalu & Marshall Islands', std: hm(12), iana: 'Pacific/Fiji', members: ['Pacific/Funafuti', 'Pacific/Majuro'] },
  { id: 'chatham-1868', name: 'Chatham Islands, 1868–1945', region: 'Chatham Islands', std: hm(12, 15), iana: 'Pacific/Chatham', years: [[1868, 1945]], checkYear: 1930 },
  { id: 'chatham', name: 'Chatham Standard', abbr: 'CHAST', dstAbbr: 'CHADT', dstName: 'Chatham Daylight', region: 'Chatham Islands', std: hm(12, 45), iana: 'Pacific/Chatham' },
  { id: 'tonga-samoa', name: 'Tonga, Samoa & Phoenix Islands', region: 'Tonga, Samoa & Phoenix Islands', std: hm(13), iana: 'Pacific/Tongatapu', members: ['Pacific/Apia', 'Pacific/Kanton', 'Pacific/Fakaofo'] },
  { id: 'line-islands', name: 'Line Islands', abbr: 'LINT', region: 'Kiribati (Line Islands)', std: hm(14), iana: 'Pacific/Kiritimati' },
];

const ZONE_BY_ID = new Map(STANDARD_ZONES.map((z) => [z.id, z]));

export function standardZoneById(id: string | null | undefined): StandardZone | undefined {
  return id ? ZONE_BY_ID.get(id) : undefined;
}

/** Whether a catalogue entry was in use in a given year (an entry with no
 *  `years` is the current standard and counts for every year). */
export function zoneInUse(z: StandardZone, year: number): boolean {
  return !z.years || z.years.some(([a, b]) => year >= a && year <= b);
}

const links = (lmtEras as { links: Record<string, string> }).links;

/** The tz database's current name for a zone. Browsers still list several by
 *  their legacy names (Asia/Calcutta, Europe/Kiev) while the birthplace lookup
 *  returns the current ones, so matching goes through this on both sides. */
export function canonicalZone(iana: string): string {
  return links[iana] ?? iana;
}

// Canonical zone → the catalogue entries that list it (as `iana` or a member).
const ENTRIES_BY_ZONE: Map<string, StandardZone[]> = (() => {
  const m = new Map<string, StandardZone[]>();
  for (const z of STANDARD_ZONES) {
    for (const iana of [z.iana, ...(z.members ?? [])]) {
      const key = canonicalZone(iana);
      const list = m.get(key);
      if (list) {
        if (!list.includes(z)) list.push(z);
      } else m.set(key, [z]);
    }
  }
  return m;
})();

/** The catalogue entries that name this zone and were in use in `year`. Where
 *  two would both fit — Seoul in the summer of 1955 is +8:30 plus daylight, or
 *  +9 plus half an hour — an entry whose era covers the year is the more
 *  specific statement, so bounded entries come first; that keeps the answer
 *  independent of the order the catalogue happens to be written in. (Eras
 *  themselves do the heavier lifting: New Zealand 1935 never sees NZST.) */
function entriesForZone(iana: string, year: number): StandardZone[] {
  const all = (ENTRIES_BY_ZONE.get(canonicalZone(iana)) ?? []).filter((z) => zoneInUse(z, year));
  return [...all.filter((z) => z.years), ...all.filter((z) => !z.years)];
}

// ── Offsets: reading what sources print ─────────────────────────────────────

/** The largest offset accepted, the importer's bound (parseOffsetToken): past it
 *  is a misread field, not a timezone. */
export const MAX_ZONE_OFFSET_SECONDS = 15 * H;

/** How much of a typed offset is kept on the chart (OffsetEntry.text). */
export const OFFSET_TEXT_MAX = 24;

export interface ParsedZoneOffset {
  /** Whole seconds. East-positive when `explicit`; otherwise the magnitude. */
  seconds: number;
  /** True when the text itself said which way — a sign, or an E/W letter — or
   *  the offset is zero, which has no way. False leaves the direction to the
   *  form's East/West control: sources disagree on it, and a bare "5" cannot say. */
  explicit: boolean;
}

/**
 * Read an offset the way birth sources print it, to the second.
 *
 * Accepts the signed clock forms the importer already reads ("-05:00", "+5:30",
 * "0530", "UTC−4"), the direction-letter forms ("5W00", "5hw00", "1he00",
 * "6hw18:56", "h5w", "4:56:02 W", "W 5"), our own display forms ("UTC−4:56:02",
 * "4h56m02s W", "0h") and "UT" / "UTC" / "GMT" / "Z" for zero. A sign and a
 * direction letter together, two letters, decimals ("5.30" — five and a half, or
 * five thirty?) and anything left over are refused rather than guessed: an
 * offset read wrong still casts a perfectly plausible chart.
 */
export function parseZoneOffset(text: string): ParsedZoneOffset | null {
  const s = text
    .replace(/[\u2212\u2012\u2013\u2014\uFE63\uFF0D]/g, '-')
    .replace(/\uFF0B/g, '+')
    .replace(/[\u00A0\u2007\u2009\u202F]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!s) return null;
  if (/^(ut|utc|gmt|z)$/.test(s)) return { seconds: 0, explicit: true };

  const body = s.replace(/^(utc|gmt|ut)\s*(?=[+-]|\d)/, '');
  // Anything but digits, separators, signs and the h/m/s/e/w letters means the
  // text carries something else — a zone abbreviation ahead of an offset, say.
  // The importer's reader knows that shape ("EDT -4:00"); nothing else is read.
  if (!/^[\d\s:+\-hmsew]+$/.test(body)) return fromImporter(body);

  const signMatch = body.match(/^([+-])\s*/);
  const sign = signMatch ? signMatch[1] : '';
  const rest = signMatch ? body.slice(signMatch[0].length) : body;
  if (/[+-]/.test(rest)) return null;

  const dirs = rest.match(/[ew]/g);
  if (dirs && dirs.length > 1) return null;
  if (dirs && sign) return null; // "-5w": a double negative, or a typo — refuse

  if (!dirs) {
    const mag = measure(rest);
    if (mag == null) return null;
    return { seconds: sign === '-' ? -mag || 0 : mag, explicit: !!sign || mag === 0 };
  }

  const at = rest.search(/[ew]/);
  const west = rest[at] === 'w';
  const before = rest.slice(0, at).trim();
  const after = rest.slice(at + 1).trim();
  let mag: number | null;
  if (/\d/.test(before) && /\d/.test(after)) {
    // Hours ahead of the letter, minutes (and seconds) behind it: 5hw00, 5w30,
    // 6hw18:56 — the exchange format's shape.
    const hours = before.match(/^h?\s*(\d{1,2})\s*h?$/);
    const ms = minutesSeconds(after);
    mag = hours && ms != null ? bounded(Number(hours[1]) * H + ms) : null;
  } else {
    // The whole measure on one side of the letter: 4:56:02 W, h5w, W 5.
    const one = /\d/.test(before) ? before : after;
    const other = one === before ? after : before;
    if (other && other !== 'h') return null;
    mag = measure(other === 'h' ? `h${one}` : one);
  }
  if (mag == null) return null;
  return { seconds: west ? -mag || 0 : mag, explicit: true };
}

/** The importer's own reader, for the abbreviation-led shapes only it knows. */
function fromImporter(t: string): ParsedZoneOffset | null {
  const r = parseOffsetToken(t);
  if (!r) return null;
  return { seconds: r.seconds || 0, explicit: r.explicit || r.seconds === 0 };
}

function bounded(sec: number): number | null {
  return Number.isFinite(sec) && sec >= 0 && sec <= MAX_ZONE_OFFSET_SECONDS ? sec : null;
}

function hms(h: number, m: number, s: number): number | null {
  if (m >= 60 || s >= 60) return null;
  return bounded(h * H + m * 60 + s);
}

/** A complete unsigned measure: 5, 0530, 5:30, 4:56:02, h5, h5:30, 5h, 5h30,
 *  4h56m02s. */
function measure(t: string): number | null {
  const x = t.trim();
  let m = x.match(/^h\s*(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?$/);
  if (m) return hms(Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0));
  m = x.match(/^(\d{1,2})\s*h(?:\s*(\d{1,2})\s*m?(?:\s*(\d{1,2})\s*s)?)?$/);
  if (m) return hms(Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0));
  m = x.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (m) return hms(Number(m[1]), Number(m[2]), Number(m[3] ?? 0));
  if (/^\d{1,6}$/.test(x)) {
    // Packed digits: length decides, exactly as the importer reads them.
    const r = parseOffsetToken(x);
    return r ? bounded(Math.abs(r.seconds)) : null;
  }
  return null;
}

/** Minutes (and seconds) behind a direction letter: 00, 30, 30m, 18:56,
 *  18m56s, 1856. A three-digit run (18:5 or 1:85?) is refused. */
function minutesSeconds(t: string): number | null {
  let m = t.match(/^(\d{1,2})\s*m?$/);
  if (m) return Number(m[1]) < 60 ? Number(m[1]) * 60 : null;
  m = t.match(/^(\d{1,2})\s*[:m]\s*(\d{1,2})\s*s?$/) ?? t.match(/^(\d{2})(\d{2})$/);
  if (m) {
    const min = Number(m[1]);
    const sec = Number(m[2]);
    return min < 60 && sec < 60 ? min * 60 + sec : null;
  }
  return null;
}

export type OffsetDirection = 'east' | 'west';

/** A parsed offset as east-positive seconds: its own direction when it stated
 *  one, the form's East/West control otherwise. */
export function applyOffsetDirection(p: ParsedZoneOffset, dir: OffsetDirection): number {
  if (p.explicit) return p.seconds;
  return dir === 'west' ? -Math.abs(p.seconds) || 0 : Math.abs(p.seconds);
}

// ── Offsets: writing both notations ─────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0');

function split(seconds: number): { neg: boolean; h: number; m: number; s: number } {
  const t = Math.round(seconds);
  const abs = Math.abs(t);
  return { neg: t < 0, h: Math.floor(abs / H), m: Math.floor((abs % H) / 60), s: abs % 60 };
}

/**
 * An east-positive offset in the civil notation: "UTC−5", "UTC+5:30",
 * "UTC−4:56:02", "UTC+0" — the shortest form that loses nothing. `padded` gives
 * the fixed-width "UTC−05:00" / "UTC+05:30" / "UTC−04:56:02" instead.
 * The minus is U+2212, as typeset; parseZoneOffset reads it back.
 */
export function formatUtcNotation(seconds: number, opts: { padded?: boolean } = {}): string {
  const { neg, h, m, s } = split(seconds);
  const sign = neg ? '\u2212' : '+';
  if (opts.padded) {
    return `UTC${sign}${pad2(h)}:${pad2(m)}${s ? `:${pad2(s)}` : ''}`;
  }
  const body = s ? `${h}:${pad2(m)}:${pad2(s)}` : m ? `${h}:${pad2(m)}` : `${h}`;
  return `UTC${sign}${body}`;
}

/**
 * The same offset in the notation astrological sources use: "5h W", "5h30m E",
 * "4h56m02s W", "0h". Note the sign flip against the civil form — UTC−5 is
 * 5h W — which is the whole reason both are shown side by side.
 */
export function formatAstroNotation(seconds: number): string {
  const { neg, h, m, s } = split(seconds);
  if (!h && !m && !s) return '0h';
  const body = `${h}h${m || s ? `${pad2(m)}m` : ''}${s ? `${pad2(s)}s` : ''}`;
  return `${body} ${neg ? 'W' : 'E'}`;
}

/** Both notations, the way every offset in the zone UI is shown: "UTC−4 · 4h W". */
export function formatBothNotations(seconds: number, opts: { padded?: boolean } = {}): string {
  return `${formatUtcNotation(seconds, opts)} · ${formatAstroNotation(seconds)}`;
}

/** The local mean time of a longitude, east-positive whole seconds — longitude
 *  / 15° to the second, which is what an atlas prints (New York 74°00′23″ W →
 *  4h56m02s W). */
export function lmtOffsetSeconds(lng: number): number {
  return Math.round(lng * 240) || 0;
}

/** A wall-clock reading converted to Universal Time, for the form's
 *  confirmation line ("14:30 EDT … = 18:30 UT"). `dayShift` is −1/0/+1 when the
 *  UT date differs from the local one. */
export function localToUt(
  hour: number,
  minute: number,
  offsetSeconds: number,
  second = 0,
): { hour: number; minute: number; second: number; dayShift: number } {
  const total = hour * H + minute * 60 + second - Math.round(offsetSeconds);
  const dayShift = Math.floor(total / 86400);
  const t = total - dayShift * 86400;
  return { hour: Math.floor(t / H), minute: Math.floor((t % H) / 60), second: t % 60, dayShift };
}

/** "18:30", or "19:26:02" when there are seconds to show. */
export function formatClock(hour: number, minute: number, second = 0): string {
  return `${pad2(hour)}:${pad2(minute)}${second ? `:${pad2(second)}` : ''}`;
}

// ── What the chart records ──────────────────────────────────────────────────

/** A standard zone plus a daylight correction: "EST + daylight". */
export interface StandardEntry {
  mode: 'standard';
  /** The standard offset, east-positive whole seconds. Recorded even with a
   *  `zone`, so the record says what it means if the catalogue ever changes. */
  std: number;
  daylight: DaylightCode;
  /** The catalogue entry it was picked as (STANDARD_ZONES id). Absent when the
   *  standard offset has no named zone here — an imported record can state one. */
  zone?: string;
}

/** An offset given as a number: typed, the birthplace's mean time, or UT. */
export interface OffsetEntry {
  mode: 'offset';
  /** East-positive whole seconds. */
  seconds: number;
  /** 'lmt': a local mean time (one click from the birthplace, or an imported
   *  mean-time record). 'ut': the time was given in Universal Time. Absent: a
   *  plain offset. */
  basis?: 'lmt' | 'ut';
  /** The offset as typed or as the source printed it ("5hw00"), so the editor
   *  can show the astrologer's own notation back. Only kept when it reads back
   *  to `seconds`. */
  text?: string;
}

/** How a chart's offset was chosen, where that is more than "detected" or "an
 *  IANA zone" (StoredChart.tzEntry). Absent on every chart saved before
 *  2026-10-02, which keeps its old meaning — see reopenZoneChoice. */
export type TzEntry = StandardEntry | OffsetEntry;

/** The ways into the form's zone control. 'auto', 'iana' and 'utc' are what the
 *  form offered before 2026-10-02 and are carried by tzIana/tzManual exactly as
 *  before; only the two new ways need a TzEntry. */
export type ZoneEntryMode = 'auto' | 'standard' | 'offset' | 'iana' | 'utc';

export type ZoneChoice =
  | { mode: 'auto' }
  | { mode: 'iana'; zone: string }
  | { mode: 'utc'; hours: number }
  | TzEntry;

/** The offset a TzEntry stands for, east-positive whole seconds. */
export function entrySeconds(entry: TzEntry): number {
  return entry.mode === 'standard' ? entry.std + daylightSeconds(entry.daylight) : entry.seconds;
}

const isWholeSeconds = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= MAX_ZONE_OFFSET_SECONDS;

/**
 * A TzEntry from untrusted input — storage, a synced blob, a share link — or
 * undefined. Fields that do not hold together are dropped rather than trusted: a
 * catalogue id that no longer exists (or names another offset), a basis that
 * contradicts the seconds, a text that does not read back to them.
 */
export function sanitizeTzEntry(v: unknown): TzEntry | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (o.mode === 'standard') {
    if (!isWholeSeconds(o.std) || !isDaylightCode(o.daylight)) return undefined;
    const e: StandardEntry = { mode: 'standard', std: o.std || 0, daylight: o.daylight };
    const z = typeof o.zone === 'string' ? standardZoneById(o.zone) : undefined;
    if (z && z.std === e.std) e.zone = z.id;
    return isWholeSeconds(entrySeconds(e)) ? e : undefined;
  }
  if (o.mode === 'offset') {
    if (!isWholeSeconds(o.seconds)) return undefined;
    const e: OffsetEntry = { mode: 'offset', seconds: o.seconds || 0 };
    if (o.basis === 'lmt' || (o.basis === 'ut' && e.seconds === 0)) e.basis = o.basis;
    if (typeof o.text === 'string') {
      const text = o.text.trim().slice(0, OFFSET_TEXT_MAX);
      if (text && textReadsAs(text, e.seconds)) e.text = text;
    }
    return e;
  }
  return undefined;
}

/** Whether typed text reads back to these seconds (its magnitude, when the text
 *  left the direction to the East/West control). */
export function textReadsAs(text: string, seconds: number): boolean {
  const p = parseZoneOffset(text);
  if (!p) return false;
  return p.explicit ? p.seconds === seconds : p.seconds === Math.abs(seconds);
}

// ── Resolving a choice to what the chart stores ─────────────────────────────

/** The birth moment and place a zone is resolved at (wall clock, as entered). */
export interface ZoneMoment {
  lat: number;
  lng: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** The zone fields a chart stores, as one bundle. */
export interface ResolvedZone {
  /** East-positive hours — the one value the chart math reads. */
  tzOffset: number;
  tzIana: string | undefined;
  tzManual: boolean;
  tzUncertain: boolean;
  /** Absent for auto/iana/utc, whose terms tzIana and tzManual already carry. */
  tzEntry: TzEntry | undefined;
  /** The offset is a local mean time (auto in a zone's mean-time era, an IANA
   *  zone in its own, or an exact offset given as LMT). */
  lmt: boolean;
  /** `tzOffset` in whole seconds, for display. */
  seconds: number;
  /** What Auto would use here — for the Auto option's label, and for
   *  proposeStandardEntry when switching into Standard + Daylight. */
  detected: TimezoneInfo | null;
}

/** The fixed-offset IANA zone the whole-hour UTC picker writes (note the IANA
 *  sign flip: Etc/GMT+5 is UTC−5). Same mapping as the form's picker. */
export function etcZoneForHours(hours: number): string {
  return hours === 0 ? 'Etc/GMT' : `Etc/GMT${hours > 0 ? '-' : '+'}${Math.abs(hours)}`;
}

/** The whole-hour UTC picker's range, −12 … +14. */
export const UTC_PICKER_HOURS: readonly number[] = Array.from({ length: 27 }, (_, i) => i - 12);

/** The hours an Etc/GMT zone written by the UTC picker stands for, or null. */
export function utcHoursOfEtcZone(iana: string | null | undefined): number | null {
  if (iana === 'Etc/GMT') return 0;
  const m = iana?.match(/^Etc\/GMT([+-])(\d{1,2})$/);
  if (!m) return null;
  const h = (m[1] === '-' ? 1 : -1) * Number(m[2]);
  return UTC_PICKER_HOURS.includes(h) ? h : null;
}

function detect(at: ZoneMoment): TimezoneInfo | null {
  try {
    return resolveBirthTimezone(at.lat, at.lng, at.year, at.month, at.day, at.hour, at.minute);
  } catch {
    return null;
  }
}

/**
 * Turn a choice in the form into the zone fields the chart stores.
 *
 * Auto and an IANA zone resolve to the offsets the form always gave — same
 * calls, same rule that picking the very zone detection chose counts as the
 * detected path (or re-selecting it would swap an LMT-era birth from the
 * birthplace's mean time to the zone reference city's).
 *
 * Standard + daylight, an exact offset and the whole-hour UTC picker are
 * statements, not lookups: the offset is what was stated, `tzUncertain` is false
 * (nothing was guessed — the importer's ruling for a stated offset), and for the
 * first two `tzIana` stays the birthplace's detected zone, because what it drives
 * is the place's live clock in the timeline readouts, not the birth moment.
 */
export function resolveZoneChoice(choice: ZoneChoice, at: ZoneMoment): ResolvedZone {
  const detected = detect(at);
  const pack = (
    hours: number,
    rest: Omit<ResolvedZone, 'tzOffset' | 'seconds' | 'detected'>,
  ): ResolvedZone => ({ tzOffset: hours, seconds: Math.round(hours * H) || 0, detected, ...rest });

  switch (choice.mode) {
    case 'iana': {
      const info =
        detected && choice.zone === detected.iana
          ? detected
          : resolveZoneInfo(choice.zone, at.year, at.month, at.day, at.hour, at.minute);
      return pack(info.offsetHours, {
        tzIana: info.iana,
        tzManual: true,
        tzUncertain: info.uncertain,
        tzEntry: undefined,
        lmt: info.lmt,
      });
    }
    case 'utc': {
      // 2026-10-02 (Salvatore): a whole-hour UTC pick is a STATED offset, like
      // Standard + daylight and Exact offset — so it saves exactly the hour
      // picked and carries no "verify DST" flag. Before this a pre-1970 pick was
      // flagged because resolveZoneInfo treats every Etc zone as a region with
      // doubtful DST history, which is a question about a zone's RULES, and an
      // Etc zone has none to doubt. It also never takes the detected path: at
      // sea before 1920 detection gives the Etc zone ship's mean time, so a pick
      // of UTC−10 that happened to name the detected zone used to save −10:08,
      // flagged, under a picker that showed UTC−10 (found in review).
      const zone = etcZoneForHours(choice.hours);
      const info = resolveZoneInfo(zone, at.year, at.month, at.day, at.hour, at.minute);
      return pack(info.offsetHours, {
        tzIana: info.iana,
        tzManual: true,
        tzUncertain: false,
        tzEntry: undefined,
        lmt: false,
      });
    }
    case 'standard':
    case 'offset': {
      const entry = sanitizeTzEntry(choice);
      // An entry that does not hold together (out of range, unknown daylight
      // code) resolves as Auto rather than as some default number: the form's
      // confirmation line then shows the detected zone, which is visibly not
      // what was typed, instead of quietly saving a zero offset.
      if (!entry) return resolveZoneChoice({ mode: 'auto' }, at);
      return pack(entrySeconds(entry) / H, {
        tzIana: detected?.iana,
        tzManual: true,
        tzUncertain: false,
        tzEntry: entry,
        lmt: entry.mode === 'offset' && entry.basis === 'lmt',
      });
    }
    default:
      return pack(detected?.offsetHours ?? 0, {
        tzIana: detected?.iana,
        tzManual: false,
        tzUncertain: detected?.uncertain ?? false,
        tzEntry: undefined,
        lmt: detected?.lmt ?? false,
      });
  }
}

/** What reopenZoneChoice hands the editor. */
export interface ZoneReopen {
  choice: ZoneChoice;
  /**
   * True when the record's own terms no longer give its stored offset — an
   * entry that disagrees with tzOffset, or (when `at` was passed) a record
   * without one whose auto/IANA zone now resolves to something else (older zone
   * data, the pre-LMT-era rules, a file offset kept on import). The editor then
   * opens on the stored number as an exact offset, because reopening in Auto and
   * saving would move a saved chart.
   */
  fellBack: boolean;
  /** With `fellBack`, the terms the record carried that no longer give its
   *  offset — so the editor can say WHAT would now give something else (Auto, a
   *  picked zone, a recorded entry) rather than always blaming Auto. Absent
   *  when the record's entry could not be read at all. */
  was?: ZoneChoice;
}

/** One second: below anything that moves a chart, above float noise. */
const REOPEN_TOLERANCE_SECONDS = 1;

/**
 * The choice the editor should reopen a saved chart with.
 *
 * A chart with a TzEntry reopens in its terms. One without keeps the meaning it
 * always had: tzManual + tzIana is a picked zone (shown in the UTC picker when
 * it is one of that picker's Etc/GMT zones, since that is where it came from and
 * the IANA name has the inverted sign), anything else is Auto.
 *
 * `tzOffset` is the record. Where the terms and the record disagree the record
 * wins — so pass `at` (the chart's own stored moment and place) to have the
 * legacy modes checked as well; leave it out only where nothing will be saved.
 */
export function reopenZoneChoice(
  chart: { tzOffset: number; tzIana?: string; tzManual?: boolean; tzEntry?: unknown },
  at?: ZoneMoment,
): ZoneReopen {
  const stored = Math.round(chart.tzOffset * H) || 0;
  const asStored = (was?: ZoneChoice): ZoneReopen => ({
    choice: { mode: 'offset', seconds: stored },
    fellBack: true,
    ...(was ? { was } : {}),
  });

  if (chart.tzEntry !== undefined) {
    const entry = sanitizeTzEntry(chart.tzEntry);
    if (!entry) return asStored();
    if (entrySeconds(entry) !== stored) return asStored(entry);
    return { choice: entry, fellBack: false };
  }

  let choice: ZoneChoice = { mode: 'auto' };
  if (chart.tzManual && chart.tzIana) {
    const hours = utcHoursOfEtcZone(chart.tzIana);
    choice = hours != null ? { mode: 'utc', hours } : { mode: 'iana', zone: chart.tzIana };
  }
  if (at) {
    const now = resolveZoneChoice(choice, at);
    if (Math.abs(now.seconds - stored) > REOPEN_TOLERANCE_SECONDS) return asStored(choice);
  }
  return { choice, fellBack: false };
}

// ── Matching a detected zone to the catalogue ───────────────────────────────

export interface StandardProposal {
  zone: StandardZone;
  daylight: DaylightCode;
  entry: StandardEntry;
}

const DAYLIGHT_STEPS = DAYLIGHT_OPTIONS.filter((o) => o.seconds > 0 && o.code !== 'war');

/**
 * What the tz database says a clock was keeping at a moment. Offsets alone
 * cannot say: Moscow's +4 in 2012 was its standard time, New York's −4 in
 * January 1943 was war time.
 *  - 'summer': above the other season of its year (Luxon's isInDST) — whatever
 *    the name, since Ireland's summer is legally "Irish Standard Time" and is
 *    still the hour a source records as summer time — or named summer, daylight
 *    or war time (Britain kept "British Summer Time" all winter in 1941).
 *  - 'standard': a proper name that is none of those ("Moscow Standard Time").
 *  - 'unnamed': a bare "GMT+…" — no name for that period, no evidence.
 */
type ClockState = 'standard' | 'summer' | 'unnamed';

function clockState(dt: DateTime): ClockState {
  if (dt.isInDST) return 'summer';
  const name = dt.setLocale('en-US').offsetNameLong ?? '';
  if (/daylight|summer|war/i.test(name)) return 'summer';
  return !name || /^GMT([+\-\u2212]|$)/.test(name) ? 'unnamed' : 'standard';
}

const midMonth = (iana: string, year: number, month: number) =>
  DateTime.fromObject({ year, month, day: 15, hour: 12 }, { zone: iana });

/**
 * The STANDARD offset a zone kept in a year, east-positive seconds, to name a
 * summer moment's correction against — or null where nothing can be read.
 * First the season of that year the tz database names as standard time:
 * Istanbul's January 2000 is "Eastern European Standard Time", so its July +3
 * is EET plus daylight, not the +3 that became Turkey's standard in 2016.
 * Where neither season is named standard (Britain 1941 kept summer time all
 * winter; many zones carry no names before 1970), the lowest offset the zone
 * kept in a January or July within three years either side, outside its
 * mean-time era: London 1941 reads GMT, Berlin 1945 CET.
 */
function eraStandard(iana: string, year: number): number | null {
  const named = [1, 7]
    .map((m) => midMonth(iana, year, m))
    .filter((dt) => dt.isValid && clockState(dt) === 'standard')
    .map((dt) => Math.round(dt.offset * 60));
  if (named.length) return Math.min(...named);
  let low: number | null = null;
  for (let y = year - 3; y <= year + 3; y++) {
    for (const m of [1, 7]) {
      const dt = midMonth(iana, y, m);
      if (!dt.isValid || resolveZoneInfo(iana, y, m, 15, 12, 0).lmt) continue;
      const s = Math.round(dt.offset * 60);
      if (low == null || s < low) low = s;
    }
  }
  return low;
}

/**
 * The catalogue entry and daylight state that match a DETECTED zone at a birth
 * moment — what Standard + Daylight preselects when the form switches out of
 * Auto. Only entries that name the detected zone and were in use that year are
 * considered; a mean-time birth, or a zone the catalogue does not name, gets
 * null (no preselection) rather than a neighbour's name. The proposal always
 * resolves to the detected offset exactly.
 *
 * Adding up is not enough, and before 2026-10-02 it was the only test: an
 * entry listing the zone counts as in use for every year, so Istanbul's July
 * 2000 (EET + daylight) came out as Turkey + standard and Lisbon's July 1994
 * (CET + daylight) as WET + double — the right number under terms the
 * birthplace never kept, saved onto the chart. A summer moment's correction is
 * now named against the standard time the zone kept THAT year (eraStandard),
 * and where no listed entry has that standard there is no proposal.
 */
export function proposeStandardEntry(
  detected: Pick<TimezoneInfo, 'iana' | 'offsetHours' | 'lmt'> | null | undefined,
  at: Pick<ZoneMoment, 'year' | 'month' | 'day' | 'hour' | 'minute'>,
): StandardProposal | null {
  if (!detected || detected.lmt) return null;
  const offset = Math.round(detected.offsetHours * H);
  const candidates = entriesForZone(detected.iana, at.year);
  if (!candidates.length) return null;
  const make = (zone: StandardZone, daylight: DaylightCode): StandardProposal => ({
    zone,
    daylight,
    entry: { mode: 'standard', std: zone.std, daylight, zone: zone.id },
  });

  const dt = DateTime.fromObject(
    { year: at.year, month: at.month, day: at.day, hour: at.hour, minute: at.minute },
    { zone: detected.iana },
  );
  if (!dt.isValid) return null;
  const state = clockState(dt);
  if (state !== 'summer') {
    const standard = candidates.find((z) => z.std === offset);
    if (standard) return make(standard, 'standard');
    // Named standard time with no entry for it: nothing to correct, and no
    // name to give — Moscow's +4 in 2012.
    if (state === 'standard') return null;
  }
  const std = eraStandard(detected.iana, at.year);
  if (std == null || std >= offset) return null;
  const zone = candidates.find((z) => z.std === std);
  const step = DAYLIGHT_STEPS.find((o) => o.seconds === offset - std);
  return zone && step ? make(zone, step.code) : null;
}

/**
 * The catalogue entry for a standard offset a source stated, or undefined.
 * Named only when the birthplace's zone is one the entry lists (in use that
 * year), or failing that when the source's own abbreviation picks out exactly
 * one entry with that offset. A bare offset matching some entry elsewhere is not
 * enough — it would label a Bishkek birth "Bangladesh Standard".
 */
export function standardZoneForStated(
  std: number,
  ctx: { iana?: string; year?: number; abbrev?: string } = {},
): StandardZone | undefined {
  const year = ctx.year ?? new Date().getFullYear();
  if (ctx.iana) {
    const hit = entriesForZone(ctx.iana, year).find((z) => z.std === std);
    if (hit) return hit;
  }
  const ab = ctx.abbrev?.trim().toUpperCase();
  if (ab) {
    const byAbbr = STANDARD_ZONES.filter(
      (z) => z.std === std && zoneInUse(z, year) && (z.abbr?.toUpperCase() === ab || z.dstAbbr?.toUpperCase() === ab),
    );
    if (byAbbr.length === 1) return byAbbr[0];
  }
  return undefined;
}

/**
 * The TzEntry for an offset a source stated in split terms — the exchange
 * format's standard offset + time-type code — or undefined when the terms are
 * unreadable, unknown, or do not add up to the offset being stored. That last
 * check is what keeps an entry from ever describing a different number from the
 * one the chart uses.
 */
export function entryFromStatedTerms(
  terms: { standardSeconds: number; timeType: string; token: string },
  offsetSeconds: number,
  ctx: { iana?: string; year?: number; abbrev?: string } = {},
): TzEntry | undefined {
  const code = daylightFromAaf(terms.timeType);
  if (code == null || !isWholeSeconds(terms.standardSeconds)) return undefined;
  let entry: TzEntry;
  if (code === 'lmt') {
    entry = { mode: 'offset', seconds: terms.standardSeconds, basis: 'lmt' };
    const text = terms.token.trim().slice(0, OFFSET_TEXT_MAX);
    if (text && textReadsAs(text, entry.seconds)) entry.text = text;
  } else {
    entry = { mode: 'standard', std: terms.standardSeconds, daylight: code };
    const zone = standardZoneForStated(terms.standardSeconds, ctx);
    if (zone) entry.zone = zone.id;
  }
  return entrySeconds(entry) === offsetSeconds ? entry : undefined;
}

// ── Searching the IANA list ─────────────────────────────────────────────────

// Summer names a source prints that the catalogue deliberately leaves off GMT
// (its dstAbbr would put "BST" on a London reading, and BST is also Bangladesh)
// but that a reader searching for their birthplace's zone will type. Search
// only: every row of the list shows its offset beside it, so nothing is
// labelled by them.
const SEARCH_ONLY_ABBRS: Readonly<Record<string, readonly string[]>> = {
  'Europe/London': ['BST'],
  'Europe/Dublin': ['IST'],
};

/** The abbreviations the catalogue gives the entries that list a zone, in
 *  any era: Asia/Kolkata → IST, Asia/Seoul → KST, Europe/Berlin → CET, CEST. */
function catalogueAbbrs(iana: string): string[] {
  const key = canonicalZone(iana);
  const out = new Set<string>(SEARCH_ONLY_ABBRS[key] ?? []);
  for (const z of ENTRIES_BY_ZONE.get(key) ?? []) {
    if (z.abbr) out.add(z.abbr);
    if (z.dstAbbr) out.add(z.dstAbbr);
  }
  return [...out];
}

/**
 * The words an IANA zone can be found by besides its id: its reference city
 * ("Kolkata", from Asia/Kolkata, or "Buenos Aires"), the current name of a
 * legacy id, and its abbreviations — the catalogue's for the entries that list
 * it, plus the ones the browser shows for it in winter and summer ("EST",
 * "EDT"). The browser alone is not enough: outside North America most of its
 * English short names are bare "GMT+5:30" (2026-10-02, found in review — "IST"
 * found Istanbul and not Kolkata). A country index is not here: the tz
 * database's zone-to-country table is not bundled, and adding its codes to
 * scripts/build-lmt-table.mjs's output is the route if one is wanted.
 */
export function zoneSearchTerms(iana: string, year = 2025): string[] {
  const out = new Set<string>([iana]);
  const canon = canonicalZone(iana);
  for (const id of [iana, canon]) {
    out.add(id);
    const city = id.split('/').pop();
    if (city && city !== id) out.add(city.replace(/_/g, ' '));
  }
  for (const abbr of catalogueAbbrs(iana)) out.add(abbr);
  for (const month of [1, 7]) {
    try {
      const name = DateTime.fromObject({ year, month, day: 15, hour: 12 }, { zone: iana })
        .setLocale('en-US').offsetNameShort;
      if (name && !/^(GMT|UTC)/.test(name)) out.add(name);
    } catch {
      /* an id this engine does not know — the id itself is still searchable */
    }
  }
  return [...out];
}

// ── The birthplace's own mean time ──────────────────────────────────────────

/**
 * The local mean time of a birthplace, east-positive whole seconds, on the
 * calendar the place kept at the birth moment — what the form's one-click LMT
 * gives. lmtOffsetSeconds alone is longitude / 15; places that sat across the
 * date line from that reckoning (Alaska before 1867, the Philippines before
 * 1845, Kiribati's Line Islands since 1995) kept a civil date a day apart, and
 * detection already shifts their mean time by the whole day toward the zone's
 * own offset (resolveBirthTimezone). Without the same shift the one-click value
 * landed a birth a day away from Auto's (2026-10-02, found in review: Sitka
 * 1860 gave UTC−9:01:19 against Auto's UTC+14:58:41). `detected` is what
 * detection gave at this moment; pass it where it is already to hand.
 */
export function birthplaceLmtSeconds(
  at: ZoneMoment,
  detected: Pick<TimezoneInfo, 'offsetHours'> | null = detect(at),
): number {
  const base = lmtOffsetSeconds(at.lng);
  if (!detected) return base;
  const days = Math.round((detected.offsetHours * H - base) / 86400);
  return base + days * 86400 || 0;
}
