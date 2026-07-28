// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Field primitives shared by every reader: coordinates, dates, times, offsets.
//
// The governing rule in this file is that an unreadable field must FAIL, not
// approximate. A coordinate is the sharpest case — a longitude that is wrong by
// a degree still draws a perfectly plausible map, just of the wrong planet — so
// each parser below is anchored end to end and returns null the moment anything
// is left over, rather than matching whatever prefix happens to look numeric.

// ── Coordinates ─────────────────────────────────────────────────────────────

export interface CoordResult {
  /** Decimal degrees, positive toward the hemisphere the token named. When no
   *  hemisphere was named this is the unsigned-or-signed number as written, and
   *  `explicit` is false. */
  value: number;
  /**
   * True when the token carried a hemisphere letter, so its sign is a fact.
   * False for a bare decimal, whose sign depends on which way the source counts
   * — a question no amount of staring at the number can answer, so it is put to
   * the user rather than assumed.
   */
  explicit: boolean;
  /**
   * The token read cleanly but names no point on Earth (a latitude past the
   * pole, say). Reported rather than folded into a null so the row can say
   * "latitude 91 is not a real latitude" instead of the far less useful
   * "could not read the coordinates".
   */
  outOfRange: boolean;
}

const DEGREE_MARKS = /[°º°]/g;
const MINUTE_MARKS = /['′’]/g;
const SECOND_MARKS = /["″”]/g;

/**
 * Read a latitude-or-longitude token.
 *
 * Accepts the forms real exports actually emit: `40N34'10"`, `43N39`, `54N3500`,
 * `19n20`, `15e0` (minutes are not always zero-padded), `43°39'00"N`, `43.6532N`,
 * and a bare `-79.38`. Rejects anything it cannot account for completely —
 * notably a run like `40N345`, whose three trailing digits could be 34'5" or
 * 3°45' and must not be silently read as either.
 *
 * `axis` names which hemisphere letters are legal, so a latitude column holding
 * an east/west token is caught rather than quietly accepted.
 */
export function parseCoord(token: string, axis: 'lat' | 'lng'): CoordResult | null {
  const raw = token.trim().replace(/^["']|["']$/g, '').trim();
  if (!raw) return null;

  // Only the negative letter needs naming; the other one leaves the sign alone.
  const neg = axis === 'lat' ? 'S' : 'W';
  const hemiRe = axis === 'lat' ? /[NS]/gi : /[EW]/gi;

  // At most one hemisphere letter, and no letters from the other axis.
  const wrongAxis = axis === 'lat' ? /[EW]/i : /[NS]/i;
  if (wrongAxis.test(raw)) return null;
  const hits = raw.match(hemiRe);
  if (hits && hits.length > 1) return null;

  let body = raw;
  if (hits) {
    const sign = hits[0].toUpperCase() === neg ? -1 : 1;
    const at = raw.search(hemiRe);
    const before = raw.slice(0, at).trim();
    const after = raw.slice(at + 1).trim();
    const beforeHasDigits = /\d/.test(before);
    const afterHasDigits = /\d/.test(after);

    if (beforeHasDigits && afterHasDigits) {
      // Degrees ahead of the letter, minutes (and maybe seconds) behind it —
      // the packed shape, e.g. 54N3500 or 40N34'10".
      const deg = wholeDegrees(before);
      const rest = minutesSeconds(after);
      if (deg == null || rest == null) return null;
      return finish(sign * (deg + rest), axis, true);
    }
    // The letter sits at one end and the whole number at the other.
    body = beforeHasDigits ? before : after;
    if (!/\d/.test(body)) return null;
    const v = fullMeasure(body);
    if (v == null) return null;
    return finish(sign * v, axis, true);
  }

  // No hemisphere letter: a signed or unsigned decimal. Its sign is the user's
  // call, so hand it back unresolved.
  const m = body.match(/^([+-]?)\s*(\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const v = Number(m[2]);
  if (!Number.isFinite(v)) return null;
  return finish(m[1] === '-' ? -v : v, axis, false);
}

function finish(value: number, axis: 'lat' | 'lng', explicit: boolean): CoordResult | null {
  if (!Number.isFinite(value)) return null;
  const limit = axis === 'lat' ? 90 : 180;
  return { value, explicit, outOfRange: Math.abs(value) > limit };
}

/** A degrees-only leading part: `54`, `074`, `43.6532`. */
function wholeDegrees(s: string): number | null {
  const m = s.replace(DEGREE_MARKS, '').trim().match(/^(\d{1,3})$/);
  return m ? Number(m[1]) : null;
}

/** The minutes-and-seconds tail behind a hemisphere letter, as a fraction of a
 *  degree. Separated forms are read as written; a bare digit run is only read
 *  when its length says unambiguously what it is. */
function minutesSeconds(s: string): number | null {
  const t = s.replace(DEGREE_MARKS, ' ').replace(MINUTE_MARKS, ' ').replace(SECOND_MARKS, ' ').trim();
  if (!t) return 0;

  if (/[\s:]/.test(t)) {
    const parts = t.split(/[\s:]+/).filter(Boolean);
    if (parts.length > 2 || parts.some((p) => !/^\d{1,2}$/.test(p))) return null;
    const min = Number(parts[0]);
    const sec = parts.length > 1 ? Number(parts[1]) : 0;
    return sexagesimal(min, sec);
  }

  if (!/^\d+$/.test(t)) return null;
  switch (t.length) {
    case 1:
    case 2:
      return sexagesimal(Number(t), 0);
    case 4:
      return sexagesimal(Number(t.slice(0, 2)), Number(t.slice(2)));
    default:
      // 3 digits could be mm+s or m+ss; 5+ has no reading at all. Refuse both.
      return null;
  }
}

/** A complete measure on one side of the letter: `43.6532`, `43°39'00"`, `074`. */
function fullMeasure(s: string): number | null {
  const t = s.replace(DEGREE_MARKS, ' ').replace(MINUTE_MARKS, ' ').replace(SECOND_MARKS, ' ').trim();

  const dec = t.match(/^(\d{1,3}(?:\.\d+)?)$/);
  if (dec) return Number(dec[1]);

  const parts = t.split(/[\s:]+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return null;
  if (!/^\d{1,3}$/.test(parts[0])) return null;
  if (parts.slice(1).some((p) => !/^\d{1,2}$/.test(p))) return null;
  const frac = sexagesimal(Number(parts[1]), parts.length > 2 ? Number(parts[2]) : 0);
  return frac == null ? null : Number(parts[0]) + frac;
}

function sexagesimal(min: number, sec: number): number | null {
  if (min >= 60 || sec >= 60) return null;
  return min / 60 + sec / 3600;
}

// ── Dates ───────────────────────────────────────────────────────────────────

export type DateFormat = 'auto' | 'dmy' | 'mdy' | 'ymd' | 'yyyymmdd' | 'mmddyyyy' | 'ddmmyyyy';

export interface DateResult {
  year: number;
  month: number;
  day: number;
  /** The source forced a calendar (some exchange formats append g or j). */
  calendar?: 'gregorian' | 'julian';
  /** True when the token was all-numeric and its order could not be inferred —
   *  the caller must have been told which order to use, or reject the row. */
  ambiguous: boolean;
}

const MONTHS3 = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

function monthNum(s: string): number | null {
  const i = MONTHS3.indexOf(s.slice(0, 3).toLowerCase());
  return i >= 0 ? i + 1 : null;
}

/**
 * Read a date token under a stated format.
 *
 * An alphabetic month is read directly whatever the format says — `4 Aug 1958`
 * cannot mean anything else. An all-numeric token is read by the stated format;
 * under 'auto' it is inferred only when a value above 12 settles it, and is
 * otherwise returned flagged ambiguous rather than resolved by coin toss. A
 * silently transposed date produces a chart that is wrong in a way nobody
 * notices for months.
 */
export function parseDateToken(token: string, format: DateFormat = 'auto'): DateResult | null {
  let t = token.trim();
  if (!t || t === '*') return null;

  // Trailing calendar force, e.g. "4.10.1582 j".
  let calendar: 'gregorian' | 'julian' | undefined;
  const cal = t.match(/\s*([gj])$/i);
  if (cal) {
    calendar = cal[1].toLowerCase() === 'j' ? 'julian' : 'gregorian';
    t = t.slice(0, cal.index).trim();
  }

  // Alphabetic month, in either order: "4 Aug 1958" / "Aug 4, 1958".
  const dmy = t.match(/^(\d{1,2})[\s.-]+([A-Za-z]{3,9})\.?[\s.-]+(\d{1,4})$/);
  if (dmy) {
    const month = monthNum(dmy[2]);
    if (month) return { year: Number(dmy[3]), month, day: Number(dmy[1]), calendar, ambiguous: false };
  }
  const mdy = t.match(/^([A-Za-z]{3,9})\.?[\s.-]+(\d{1,2}),?[\s.-]+(\d{1,4})$/);
  if (mdy) {
    const month = monthNum(mdy[1]);
    if (month) return { year: Number(mdy[3]), month, day: Number(mdy[2]), calendar, ambiguous: false };
  }

  // Packed all-digit forms carry no separators to reason about, so they are only
  // read when the mapping says which one it is.
  const packed = t.match(/^(\d{8})$/);
  if (packed) {
    const d = packed[1];
    const pick =
      format === 'yyyymmdd' ? [d.slice(0, 4), d.slice(4, 6), d.slice(6)]
      : format === 'mmddyyyy' ? [d.slice(4), d.slice(0, 2), d.slice(2, 4)]
      : format === 'ddmmyyyy' ? [d.slice(4), d.slice(2, 4), d.slice(0, 2)]
      : null;
    if (!pick) return { year: 0, month: 0, day: 0, calendar, ambiguous: true };
    const [y, mo, dd] = pick.map(Number);
    return valid(y, mo, dd) ? { year: y, month: mo, day: dd, calendar, ambiguous: false } : null;
  }

  const sep = t.match(/^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})$/);
  if (!sep) return null;
  const a = Number(sep[1]);
  const b = Number(sep[2]);
  const c = Number(sep[3]);

  // A four-digit leader is a year, whatever the format says.
  if (sep[1].length === 4) {
    return valid(a, b, c) ? { year: a, month: b, day: c, calendar, ambiguous: false } : null;
  }

  const order =
    format === 'dmy' || format === 'ddmmyyyy' ? 'dmy'
    : format === 'mdy' || format === 'mmddyyyy' ? 'mdy'
    : format === 'ymd' || format === 'yyyymmdd' ? 'ymd'
    : a > 12 ? 'dmy'
    : b > 12 ? 'mdy'
    : null;

  if (!order) return { year: c, month: 0, day: 0, calendar, ambiguous: true };

  const [year, month, day] =
    order === 'dmy' ? [c, b, a] : order === 'mdy' ? [c, a, b] : [a, b, c];
  return valid(year, month, day) ? { year, month, day, calendar, ambiguous: false } : null;
}

function valid(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  return Number.isFinite(year);
}

// ── Times ───────────────────────────────────────────────────────────────────

export type TimeFormat = 'auto' | 'hhmm' | 'hhmmss';

export interface TimeResult {
  hour: number;
  minute: number;
  second: number;
}

/**
 * Read a time token. Returns null when the field is empty or explicitly
 * unknown — which the caller turns into a time-unknown chart, not a midnight
 * one and not a noon one.
 */
export function parseTimeToken(token: string, format: TimeFormat = 'auto'): TimeResult | null {
  const t = token.trim();
  if (!t || t === '*' || /^-+$/.test(t)) return null;

  // Separated: 2:59 am, 14:00, 09:30:00, and the 22h30 form some formats use.
  const sepd = t.match(/^(\d{1,2})\s*[:h]\s*(\d{1,2})(?:\s*[:m]\s*(\d{1,2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i);
  if (sepd) {
    let hour = Number(sepd[1]);
    const minute = Number(sepd[2]);
    const second = sepd[3] ? Number(sepd[3]) : 0;
    const ap = sepd[4]?.toLowerCase();
    if (ap?.startsWith('p') && hour < 12) hour += 12;
    if (ap?.startsWith('a') && hour === 12) hour = 0;
    return inRange(hour, minute, second) ? { hour, minute, second } : null;
  }

  // Packed: HHMM or HHMMSS. Length decides, and nothing else is accepted.
  const packed = t.match(/^(\d{4}|\d{6})$/);
  if (packed) {
    const d = packed[1];
    if (format === 'hhmm' && d.length !== 4) return null;
    if (format === 'hhmmss' && d.length !== 6) return null;
    const hour = Number(d.slice(0, 2));
    const minute = Number(d.slice(2, 4));
    const second = d.length === 6 ? Number(d.slice(4)) : 0;
    return inRange(hour, minute, second) ? { hour, minute, second } : null;
  }

  return null;
}

function inRange(h: number, m: number, s: number): boolean {
  return h >= 0 && h < 24 && m >= 0 && m < 60 && s >= 0 && s < 60;
}

// ── UTC offsets ─────────────────────────────────────────────────────────────

export interface OffsetResult {
  /** Whole seconds. Signed only when the token said which way; see `explicit`. */
  seconds: number;
  /** True when the token itself carried a direction (a sign or an e/w letter). */
  explicit: boolean;
}

/** The largest offset any real zone has used, with room to spare. Anything
 *  past this is a misread field, not a timezone. */
const MAX_OFFSET_SECONDS = 15 * 3600;

/**
 * Read a UTC offset token into seconds.
 *
 * Seconds because mean-time offsets are not round — a 19th century birth runs
 * at its own longitude / 15°, so +0:39:57 has to survive intact. Float hours
 * would round it away before the chart was ever cast.
 *
 * The token's sign is honoured when present, but WHICH DIRECTION a bare
 * magnitude means is the caller's business: some sources count west as
 * positive. That is what `explicit` reports.
 */
export function parseOffsetToken(token: string): OffsetResult | null {
  // Drop a leading zone abbreviation ("EDT +4:00", "UTC-5").
  const t = token.trim().replace(/^[A-Za-z]{1,5}\s*(?=[+-]|\d)/, '').trim();
  if (!t || t === '*') return null;

  const m = t.match(/^([+-]?)\s*(\d{1,6})(?::(\d{1,2}))?(?::(\d{1,2}))?$/);
  if (!m) return null;

  const negative = m[1] === '-';
  const explicit = m[1] === '-' || m[1] === '+';
  let h: number;
  let min: number;
  let sec: number;

  if (m[3] != null) {
    // Separated: H:MM[:SS] — the unambiguous shape.
    h = Number(m[2]);
    min = Number(m[3]);
    sec = m[4] ? Number(m[4]) : 0;
  } else {
    // Packed digits. Length decides; a length with two readings is refused.
    let d = m[2];
    // A fixed-width sign column shows up as a leading zero ahead of HHMM.
    if (d.length === 5 && d[0] === '0') d = d.slice(1);
    switch (d.length) {
      case 1:
      case 2:
        h = Number(d); min = 0; sec = 0; break;
      case 3:
        h = Number(d.slice(0, 1)); min = Number(d.slice(1)); sec = 0; break;
      case 4:
        h = Number(d.slice(0, 2)); min = Number(d.slice(2)); sec = 0; break;
      case 6:
        h = Number(d.slice(0, 2)); min = Number(d.slice(2, 4)); sec = Number(d.slice(4)); break;
      default:
        return null;
    }
  }

  if (min >= 60 || sec >= 60) return null;
  const seconds = h * 3600 + min * 60 + sec;
  if (seconds > MAX_OFFSET_SECONDS) return null;
  return { seconds: negative ? -seconds : seconds, explicit };
}

/** Read a yes/no-ish flag column: Y, N, 1, 0, true, false, DST, "". */
export function parseFlag(token: string): boolean | null {
  const t = token.trim().toLowerCase();
  if (!t) return null;
  if (/^(y|yes|1|t|true|d|dst)$/.test(t)) return true;
  if (/^(n|no|0|f|false|s|std|standard)$/.test(t)) return false;
  return null;
}
