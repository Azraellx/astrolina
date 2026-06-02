// Parses astrology chart data pasted as a text block (AstroDataBank style) or
// as a Comma-Delimited ASCII export, into the shape we need for StoredChart.
//
// Two supported inputs:
//
// 1) Text block (one or more, separated by a blank line):
//      Mary Decker - Natal Chart
//      4 Aug 1958, 2:59 am, EDT +4:00
//      Raritan New Jersey, 40N34'10", 074W38'00"
//      Geocentric Tropical Zodiac
//      Rating: AA
//      Comments: ...
//
// 2) Comma-Delimited ASCII (with or without a header row):
//      "Name","Chart Type","Date","Time","Zone","City","Region","Latitude","Longitude","Zodiac"
//      "Mary Decker","Natal","04 Aug 1958","02:59:00","-04:00","Raritan","New Jersey","40N34","074W38","Tropical"

export interface ParsedChart {
  name: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** ISO-style offset: hours east of UTC (EDT = -4). */
  tzOffset: number;
  birthplace: { label: string; lat: number; lng: number };
}

export interface ParseResult {
  charts: ParsedChart[];
  errors: string[];
}

// The bundled Swiss Ephemeris data covers 1800–2399 (see public/ephe/README.md).
// Outside it the engine silently drops the asteroids and falls back to the
// lower-accuracy Moshier model, so reject out-of-range years here rather than let
// an import produce a degraded chart with no warning.
const MIN_YEAR = 1800;
const MAX_YEAR = 2399;

const MONTHS3 = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

function yearOutOfRangeMsg(year: number): string {
  return `birth year ${year} is outside the supported range ${MIN_YEAR}–${MAX_YEAR}.`;
}

function monthNum(s: string): number | null {
  const i = MONTHS3.indexOf(s.slice(0, 3).toLowerCase());
  return i >= 0 ? i + 1 : null;
}

function parseDate(s: string): { year: number; month: number; day: number } | null {
  const m = s.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);
  if (!m) return null;
  const month = monthNum(m[2]);
  if (!month) return null;
  return { year: Number(m[3]), month, day: Number(m[1]) };
}

function parseTime(s: string): { hour: number; minute: number } | null {
  const m = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)?/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const ap = m[3]?.toLowerCase();
  if (ap?.startsWith('p') && hour < 12) hour += 12;
  if (ap?.startsWith('a') && hour === 12) hour = 0;
  return { hour, minute };
}

// Reads a signed "h:mm" / "hh:mm" offset (sign defaults to +).
function parseOffsetMagnitude(s: string): number | null {
  const m = s.match(/([+-])?\s*(\d{1,2})(?::(\d{2}))?/);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) + (m[3] ? Number(m[3]) / 60 : 0));
}

function parseCoord(
  token: string,
  posHemi: 'N' | 'E',
  negHemi: 'S' | 'W',
): number | null {
  const re = new RegExp(
    `(\\d{1,3})\\s*([${posHemi}${negHemi}])\\s*(\\d{1,2})?(?:[°'\\s]*(\\d{1,2}))?`,
    'i',
  );
  const m = token.match(re);
  if (!m) return null;
  const deg = Number(m[1]);
  const min = m[3] ? Number(m[3]) : 0;
  const sec = m[4] ? Number(m[4]) : 0;
  let v = deg + min / 60 + sec / 3600;
  if (m[2].toUpperCase() === negHemi) v = -v;
  return v;
}

// --- CSV --------------------------------------------------------------------

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// Documented column order, used when there's no header row.
const DEFAULT_COLS = {
  name: 0, date: 2, time: 3, zone: 4, city: 5, region: 6, lat: 7, lng: 8,
};

function mapHeader(headers: string[]) {
  const find = (...names: string[]) => {
    for (const n of names) {
      const i = headers.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  return {
    name: find('name'),
    date: find('date'),
    time: find('time'),
    zone: find('zone', 'timezone', 'time zone'),
    city: find('city'),
    region: find('region', 'state'),
    lat: find('latitude', 'lat'),
    lng: find('longitude', 'long', 'lon', 'lng'),
  };
}

function parseCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  const charts: ParsedChart[] = [];
  const errors: string[] = [];
  if (!lines.length) return { charts, errors };

  const firstFields = splitCsvLine(lines[0]).map((s) => s.toLowerCase());
  const hasHeader =
    firstFields.includes('latitude') ||
    firstFields.includes('longitude') ||
    (firstFields.includes('name') && firstFields.includes('date'));
  const cols = hasHeader ? mapHeader(firstFields) : DEFAULT_COLS;
  const dataLines = hasHeader ? lines.slice(1) : lines;

  dataLines.forEach((line, i) => {
    const f = splitCsvLine(line);
    const at = (idx: number) => (idx >= 0 ? f[idx] ?? '' : '');
    const rowLabel = `Row ${i + 1}`;
    const name = at(cols.name).trim();
    const date = parseDate(at(cols.date));
    const time = parseTime(at(cols.time));
    const offset = parseOffsetMagnitude(at(cols.zone)); // CSV zone is ISO
    const lat = parseCoord(at(cols.lat), 'N', 'S');
    const lng = parseCoord(at(cols.lng), 'E', 'W');

    if (!name || !date || lat == null || lng == null) {
      errors.push(`${rowLabel}: missing name, date, or coordinates.`);
      return;
    }
    if (date.year < MIN_YEAR || date.year > MAX_YEAR) {
      errors.push(`${rowLabel}: ${yearOutOfRangeMsg(date.year)}`);
      return;
    }
    const city = at(cols.city).trim();
    const region = at(cols.region).trim();
    const label = [city, region].filter(Boolean).join(', ') || name;
    charts.push({
      name,
      ...date,
      hour: time?.hour ?? 0,
      minute: time?.minute ?? 0,
      tzOffset: offset ?? 0,
      birthplace: { label, lat, lng },
    });
  });

  return { charts, errors };
}

// --- Text block -------------------------------------------------------------

function stripChartType(line: string): string {
  return line.split(/\s+[-–—]\s+/)[0].trim();
}

function parseTextBlock(block: string, idx: number): ParsedChart | string {
  const lines = block
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return `Block ${idx + 1}: empty.`;

  const name = stripChartType(lines[0]);

  // The date / time / zone line, e.g. "4 Aug 1958, 2:59 am, EDT +4:00".
  const dtLine = lines.find((l) => parseDate(l));
  const date = dtLine ? parseDate(dtLine) : null;
  if (!date) return `${name || `Block ${idx + 1}`}: couldn't find a date.`;
  if (date.year < MIN_YEAR || date.year > MAX_YEAR) {
    return `${name || `Block ${idx + 1}`}: ${yearOutOfRangeMsg(date.year)}`;
  }

  // Expected order: "date, time, zone".
  const segs = (dtLine ?? '').split(',').map((s) => s.trim());
  const time = segs.length > 1 ? parseTime(segs[1]) : null;
  // In the text format the zone is "hours to add to reach UT" — the negative
  // of the ISO offset (EDT "+4:00" → UTC-4). Strip any leading abbreviation
  // ("EDT ") before reading the number.
  const zoneSeg = segs.length > 2 ? segs.slice(2).join(' ') : '';
  const offsetMag = parseOffsetMagnitude(zoneSeg.replace(/^[^+\-\d]*/, ''));

  // The coordinate line, e.g. "Raritan New Jersey, 40N34'10", 074W38'00"".
  const coordLine = lines.find(
    (l) => parseCoord(l, 'N', 'S') != null && parseCoord(l, 'E', 'W') != null,
  );
  const lat = coordLine ? parseCoord(coordLine, 'N', 'S') : null;
  const lng = coordLine ? parseCoord(coordLine, 'E', 'W') : null;
  if (lat == null || lng == null) {
    return `${name || `Block ${idx + 1}`}: couldn't find coordinates.`;
  }

  const latRe = /\d{1,3}\s*[NS]/i;
  const label =
    (coordLine ?? '')
      .slice(0, (coordLine ?? '').search(latRe))
      .replace(/[,\s]+$/, '')
      .trim() || name;

  return {
    name: name || `Imported ${idx + 1}`,
    ...date,
    hour: time?.hour ?? 0,
    minute: time?.minute ?? 0,
    tzOffset: offsetMag == null ? 0 : -offsetMag,
    birthplace: { label, lat, lng },
  };
}

function parseText(text: string): ParseResult {
  const blocks = text.split(/\r?\n\s*\r?\n/).filter((b) => b.trim().length);
  const charts: ParsedChart[] = [];
  const errors: string[] = [];
  blocks.forEach((b, i) => {
    const r = parseTextBlock(b, i);
    if (typeof r === 'string') errors.push(r);
    else charts.push(r);
  });
  return { charts, errors };
}

// --- Dispatch ---------------------------------------------------------------

function looksLikeCsv(text: string): boolean {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return false;
  const first = lines[0].toLowerCase();
  if (first.includes('latitude') && first.includes('longitude')) return true;
  if (/"\s*,\s*"/.test(lines[0])) return true;
  const quoted = lines.filter((l) => /^".*"(,|$)/.test(l)).length;
  return quoted >= Math.ceil(lines.length / 2);
}

export function parseImport(text: string): ParseResult {
  if (!text.trim()) return { charts: [], errors: [] };
  const result = looksLikeCsv(text) ? parseCsv(text) : parseText(text);
  if (result.charts.length === 0 && result.errors.length === 0) {
    result.errors.push("Couldn't recognize the format. Check the examples.");
  }
  return result;
}
