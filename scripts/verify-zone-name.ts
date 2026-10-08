// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies how a clock's zone is NAMED (src/lib/atlas/zoneName.ts) — "09:30 EDT
// (UTC−04:00)" everywhere the app prints a zoned clock (2026-10-07) — running the REAL
// src/lib code (`npx tsx scripts/verify-zone-name.ts`; no network).
//
// Each section says which KIND of check it is, because a failure in each means
// something different:
//
//   OUTSIDE AGREEMENT  — the module against something it does not compute: the tz
//                        database the engine ships (its offset at the instant), and the
//                        browser's own English zone names. A failure means the code is
//                        self-consistent and wrong about the world.
//   GOLDEN             — the outside kind written out by hand: values transcribed from
//                        the tz database source and from Lina's spec.
//   INTERNAL IDENTITY  — the module agrees with itself (a chart against its zone at the
//                        same instant, a name's offset read back). A failure means the
//                        code contradicts itself.
//
// Every loop below fails on an empty set: a check over nothing is not a pass.

import { DateTime } from 'luxon';
import citiesJson from '../src/lib/atlas/data/cities15000.json';
import {
  clearZoneNameCaches,
  formatZoneClock,
  formatZoneLabel,
  formatZoneLong,
  placeZoneAt,
  timelineZoneAt,
  zoneNameAtInstant,
  zoneNameForChart,
  type ChartZoneInput,
  type ZoneName,
} from '../src/lib/atlas/zoneName';
import {
  canonicalZone,
  catalogueRowsFor,
  daylightSeconds,
  parseZoneOffset,
  STANDARD_ZONES,
} from '../src/lib/atlas/zoneEntry';
import { getIanaTimezone, resolveBirthTimezone } from '../src/lib/atlas/timezone';
import { eclipsePlaceClock } from '../src/lib/astro/eclipseFormat';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

/** One PASS/FAIL line for a whole set: fails when the set is empty, and names the
 *  first few members that broke the rule. */
function every<T>(label: string, items: readonly T[], bad: (x: T) => string | null) {
  if (items.length === 0) {
    check(label, false, 'empty set — nothing was compared');
    return;
  }
  const broken = items.map(bad).filter((s): s is string => s != null);
  check(`${label} (${items.length})`, broken.length === 0, broken.slice(0, 6).join('; '));
}

const H = 3600;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16) + 'Z';
const show = (z: ZoneName) => formatZoneLong(z) + ` [${z.kind}/${z.source}]`;

/** The tz database's offset (whole seconds) for a zone at an instant. */
function tzSeconds(zone: string, ms: number): number {
  return Math.round(DateTime.fromMillis(ms, { zone }).offset * 60) || 0;
}

/** Every name printed anywhere in this suite, for §4. */
const seen: ZoneName[] = [];
const keep = (z: ZoneName) => {
  seen.push(z);
  return z;
};

// What each abbreviation stands for, from the catalogue's own rows (abbreviation,
// name, offset) — the DATA, not the module's lookup — and, for the era names, written
// out by hand from the tz database source: `europe` (rules GB-Eire, Zone Europe/London
// and Europe/Dublin) and `northamerica` (the US/Canada 1942 "W" and 1945 "P" rules).
interface Meaning {
  offset: number;
  /** What the long name must begin with. */
  stem: string;
}
const MEANINGS = new Map<string, Meaning[]>();
const mean = (abbr: string, offset: number, stem: string) =>
  MEANINGS.set(abbr, [...(MEANINGS.get(abbr) ?? []), { offset, stem }]);
for (const z of STANDARD_ZONES) {
  if (z.abbr) mean(z.abbr, z.std, z.name.replace(/,.*$/, ''));
  if (z.dstAbbr) mean(z.dstAbbr, z.std + daylightSeconds(z.dstCode ?? 'daylight'), z.dstName ?? '');
}
const ERA_GOLDEN: [string, number, string][] = [
  ['BST', H, 'British Summer Time'],
  ['BST', H, 'British Standard Time'],
  ['BDST', 2 * H, 'British Double Summer Time'],
  ['IST', H, 'Irish Summer Time'],
  ['IST', H, 'Irish Standard Time'],
  ['EWT', -4 * H, 'Eastern War Time'],
  ['EPT', -4 * H, 'Eastern Peace Time'],
  ['CWT', -5 * H, 'Central War Time'],
  ['CPT', -5 * H, 'Central Peace Time'],
  ['MWT', -6 * H, 'Mountain War Time'],
  ['MPT', -6 * H, 'Mountain Peace Time'],
  ['PWT', -7 * H, 'Pacific War Time'],
  ['PPT', -7 * H, 'Pacific Peace Time'],
  ['AWT', -3 * H, 'Atlantic War Time'],
  ['APT', -3 * H, 'Atlantic Peace Time'],
  ['NWT', -2.5 * H, 'Newfoundland War Time'],
  ['NPT', -2.5 * H, 'Newfoundland Peace Time'],
  ['HWT', -9.5 * H, 'Hawaii War Time'],
  ['HPT', -9.5 * H, 'Hawaii Peace Time'],
];
for (const [abbr, offset, stem] of ERA_GOLDEN) mean(abbr, offset, stem);

/** Why a catalogue/era name is wrong for the tz database's offset, or null. */
function meaningWrong(z: ZoneName, tz: number): string | null {
  if (z.seconds !== tz) return `name at ${z.iso}, tz database ${tz} s`;
  const ok = (MEANINGS.get(z.abbr ?? '') ?? []).some(
    (m) => m.offset === tz && (!z.long || z.long.startsWith(m.stem)),
  );
  return ok ? null : `${z.abbr} / ${z.long ?? '—'} stands for no ${tz} s`;
}

// ── The sample ──────────────────────────────────────────────────────────────

// Every zone the catalogue lists, and a seeded sample of atlas cities.
const catalogueZones = [...new Set(STANDARD_ZONES.flatMap((z) => [z.iana, ...(z.members ?? [])]))];
const representative = new Set(STANDARD_ZONES.map((z) => z.iana));

type Row = [string, string | 0, number, number, string, string, number, number, 0 | 1];
const rows = citiesJson as unknown as Row[];
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261007);
const cities = Array.from({ length: 240 }, () => rows[Math.floor(rand() * rows.length)]).map((r) => ({
  name: r[0],
  lat: r[2],
  lng: r[3],
}));

const midMonth = (y: number, m: number) => Date.UTC(y, m - 1, 15, 12);

interface Sample {
  label: string;
  iana: string;
  ms: number;
  z: ZoneName;
  /** For a place's clock, the place. */
  at?: { lat: number; lng: number };
}
const instantSamples: Sample[] = [];

// Jan/Jul of 1900–2030: every year for a catalogue row's own zone, every third year
// (staggered) for its other members, so every year is still met somewhere.
catalogueZones.forEach((iana, i) => {
  const step = representative.has(iana) ? 1 : 3;
  for (let y = 1900 + (i % step); y <= 2030; y += step) {
    for (const m of [1, 7]) {
      const ms = midMonth(y, m);
      instantSamples.push({ label: `${iana} ${y}-${m}`, iana, ms, z: keep(zoneNameAtInstant(iana, ms)) });
    }
  }
});

// ±1 h around the transitions a sample of years carries, for every row's own zone:
// both sides of a fall-back hour, and the war and peace boundaries.
const TRANSITION_YEARS = [1916, 1918, 1941, 1942, 1945, 1947, 1968, 1971, 1983, 1996, 2007, 2016, 2025];
let transitions = 0;
for (const iana of representative) {
  for (const year of TRANSITION_YEARS) {
    const end = Date.UTC(year + 1, 0, 1);
    for (let t = Date.UTC(year, 0, 1); t < end; t += 7 * 86400_000) {
      const t2 = Math.min(t + 7 * 86400_000, end);
      if (tzSeconds(iana, t) === tzSeconds(iana, t2)) continue;
      // Bisect to the second the offset changes.
      let lo = t;
      let hi = t2;
      const before = tzSeconds(iana, lo);
      while (hi - lo > 1000) {
        const mid = Math.floor((lo + hi) / 2000) * 1000;
        if (tzSeconds(iana, mid) === before) lo = mid;
        else hi = mid;
      }
      transitions++;
      for (const d of [-H, -60, -1, 0, 60, H]) {
        const ms = hi + d * 1000;
        instantSamples.push({ label: `${iana} ${iso(ms)}`, iana, ms, z: keep(zoneNameAtInstant(iana, ms)) });
      }
    }
  }
}

// The atlas cities: each one's clock (placeZoneAt), and a chart cast there in Auto
// at local noon — the stored offset what detection gives, as the form saves it.
interface ChartSample {
  label: string;
  chart: ChartZoneInput;
  instant: number;
  iana: string;
  z: ZoneName;
}
const chartSamples: ChartSample[] = [];
const placeSamples: Sample[] = [];
for (const c of cities) {
  const clock = placeZoneAt(c.lat, c.lng);
  const iana = getIanaTimezone(c.lat, c.lng);
  for (let y = 1880; y <= 2030; y += 5) {
    for (const m of [1, 7]) {
      const info = resolveBirthTimezone(c.lat, c.lng, y, m, 15, 12, 0);
      const chart: ChartZoneInput = {
        year: y, month: m, day: 15, hour: 12, minute: 0,
        tzOffset: info.offsetHours, tzIana: info.iana, birthplace: { lat: c.lat, lng: c.lng },
      };
      const stored = Math.round(info.offsetHours * H);
      const instant = Date.UTC(y, m - 1, 15, 12) - stored * 1000;
      chartSamples.push({ label: `${c.name} ${y}-${m}`, chart, instant, iana, z: keep(zoneNameForChart(chart)) });
      if (clock) placeSamples.push({ label: `${c.name} ${y}-${m}`, iana, ms: instant, z: keep(clock(instant)), at: c });
    }
  }
}

// ── 1. OUTSIDE AGREEMENT: a name stands for the tz database's offset ─────────

console.log('\n── 1. OUTSIDE AGREEMENT: every catalogue or era name is the tz database’s offset ──');

{
  const named = (s: { z: ZoneName }) => s.z.source === 'catalogue' || s.z.source === 'era';
  every(
    'zone at an instant: the name stands for the tz offset there',
    instantSamples.filter(named),
    (s) => {
      const bad = meaningWrong(s.z, tzSeconds(s.iana, s.ms));
      return bad ? `${s.label}: ${bad}` : null;
    },
  );
  check(`transitions found and named on both sides (${transitions})`, transitions > 0);
  every('a place’s clock: the name stands for the tz offset there', placeSamples.filter(named), (s) => {
    const bad = meaningWrong(s.z, tzSeconds(s.iana, s.ms));
    return bad ? `${s.label}: ${bad}` : null;
  });
  every('an Auto chart: the name stands for its stored offset and the tz offset', chartSamples.filter(named), (s) => {
    const stored = Math.round(s.chart.tzOffset * H);
    if (s.z.seconds !== stored) return `${s.label}: name ${s.z.iso}, stored ${stored} s`;
    const bad = meaningWrong(s.z, tzSeconds(s.chart.tzIana!, s.instant));
    return bad ? `${s.label}: ${bad}` : null;
  });

  // A name is never printed for any other offset than the one beside it, whatever
  // its source — the offset in brackets is always the tz database's.
  every('every name’s offset is the tz database’s at its instant', instantSamples, (s) =>
    s.z.kind === 'ut' || s.z.seconds === tzSeconds(s.iana, s.ms) ? null : `${s.label}: ${show(s.z)}`,
  );

  // The sweep reached the era table, not just the catalogue: each era name was met.
  const abbrs = new Set([...instantSamples, ...placeSamples, ...chartSamples].map((s) => `${s.z.abbr}|${s.z.long}`));
  const wanted = [
    'EWT|Eastern War Time', 'EPT|Eastern Peace Time', 'CWT|Central War Time', 'PWT|Pacific War Time',
    'BST|British Summer Time', 'BST|British Standard Time', 'BDST|British Double Summer Time',
    'IST|Irish Standard Time', 'IST|Irish Summer Time', 'HWT|Hawaii War Time',
  ];
  every('the sweep met each era name', wanted, (w) => (abbrs.has(w) ? null : `${w} never returned`));
  const counts = { catalogue: 0, era: 0, intl: 0, none: 0 };
  for (const s of [...instantSamples, ...placeSamples, ...chartSamples]) counts[s.z.source]++;
  console.log(`      sources: ${JSON.stringify(counts)}`);
  check('the sweep named most moments from the catalogue', counts.catalogue > counts.none);
}

// ── 2. OUTSIDE AGREEMENT: our names against the browser's ────────────────────

console.log('\n── 2. OUTSIDE AGREEMENT: where the browser has a name, ours is the same ──');

{
  // The browser's English short names, where they are letters ("GMT+2" and "+0530"
  // are offsets dressed as names, and "UTC" names no place).
  const icu = (iana: string, ms: number) =>
    ['en-GB', 'en-US']
      .map((loc) => DateTime.fromMillis(ms, { zone: iana }).setLocale(loc).offsetNameShort ?? '')
      .filter((n) => /^[A-Z][A-Za-z]{1,5}$/.test(n) && n !== 'UTC');

  // Named exceptions: every disagreement must be one of these, each a statement about
  // the world the browser's names do not carry, or a rule of ours. Counted below, so
  // one that stops firing shows.
  const EXCEPTIONS: { name: string; why: string; applies: (z: ZoneName, names: string[], iana: string, ms: number) => boolean }[] = [
    {
      name: 'double summer time',
      why: 'the browser names Britain’s +2 summers (1941–45, 1947) “BST” like its +1 ones; the tz database says BDST',
      applies: (z, names) => z.abbr === 'BDST' && names.includes('BST'),
    },
    {
      name: 'Aleutian abbreviations',
      why: 'the browser abbreviates Aleutian time HAST/HADT; the tz database and the catalogue write HST/HDT',
      applies: (z, names, iana) =>
        canonicalZone(iana) === 'America/Adak' &&
        ((z.abbr === 'HST' && names.includes('HAST')) || (z.abbr === 'HDT' && names.includes('HADT'))),
    },
    {
      // PLAN.md (2026-10-07): the browser's name is a fallback only for a zone the
      // catalogue does not list that year. Where it does list it and proposes nothing,
      // the clock kept terms the catalogue does not carry — Istanbul on EET 1970–2016,
      // Lisbon on CET 1992–96, Whitehorse on PST until 2020 — and the offset stands
      // alone. A rule of ours, not a fact about the world: if the fallback is ever
      // widened, this count falls to nothing and the exception goes with it.
      name: 'the catalogue’s silence',
      why: 'a zone the catalogue lists that year, keeping terms it does not carry: offset only, by rule',
      applies: (z, _names, iana, ms) =>
        z.kind === 'offset' && catalogueRowsFor(iana, DateTime.fromMillis(ms, { zone: iana }).year).length > 0,
    },
  ];
  const fired = new Map<string, number>();
  const compared = instantSamples.filter((s) => icu(s.iana, s.ms).length > 0);
  every('our abbreviation is the browser’s, or a named exception', compared, (s) => {
    const names = icu(s.iana, s.ms);
    if (s.z.abbr && names.includes(s.z.abbr)) return null;
    const ex = EXCEPTIONS.find((e) => e.applies(s.z, names, s.iana, s.ms));
    if (ex) {
      fired.set(ex.name, (fired.get(ex.name) ?? 0) + 1);
      return null;
    }
    return `${s.label}: ours ${s.z.abbr ?? '—'} (${s.z.iso}), browser ${names.join('/')}`;
  });
  for (const e of EXCEPTIONS) console.log(`      exception “${e.name}”: ${fired.get(e.name) ?? 0} — ${e.why}`);
  const agreed = compared.filter((s) => s.z.abbr && icu(s.iana, s.ms).includes(s.z.abbr)).length;
  check(`most comparisons are plain agreement (${agreed} of ${compared.length})`, agreed > compared.length / 2);
}

// ── 3. GOLDEN: cases written out by hand ────────────────────────────────────

console.log('\n── 3. GOLDEN: the spec’s cases and the tz database’s eras ──');

const YONKERS = { lat: 40.9312, lng: -73.8988 };
const chartAt = (
  y: number, mo: number, d: number, h: number, mi: number, tzOffset: number,
  place: { lat: number; lng: number }, more: Partial<ChartZoneInput> = {},
): ZoneName => keep(zoneNameForChart({ year: y, month: mo, day: d, hour: h, minute: mi, tzOffset, birthplace: place, ...more }));

/** A golden that holds only for a catalogue- or era-sourced name: the browser's own
 *  names differ between engines, so no golden rests on one. */
function golden(label: string, z: ZoneName, clock: string, got: string, long?: string) {
  const sourced = z.source === 'catalogue' || z.source === 'era' || z.kind !== 'zone';
  check(
    `${label}: ${clock}${long ? ` · ${long}` : ''}`,
    sourced && got === clock && (long === undefined || z.long === long),
    `got ${got} · ${z.long ?? '—'} [${z.kind}/${z.source}]`,
  );
}

{
  const ny = 'America/New_York';
  let z = chartAt(1941, 6, 5, 9, 30, -4, YONKERS, { tzIana: ny });
  golden('New York 5 June 1941', z, '09:30 EDT (UTC−04:00)', formatZoneClock(9, 30, z), 'Eastern Daylight Time');
  check('  the entry form’s row reads it in full',
    formatZoneLong(z) === 'Eastern Daylight Time · EDT (UTC−04:00)', formatZoneLong(z));
  z = chartAt(1941, 12, 5, 9, 30, -5, YONKERS, { tzIana: ny });
  golden('New York December 1941', z, '09:30 EST (UTC−05:00)', formatZoneClock(9, 30, z), 'Eastern Standard Time');
  z = chartAt(1943, 1, 15, 9, 30, -4, YONKERS, { tzIana: ny });
  golden('New York January 1943 (war time all year)', z, '09:30 EWT (UTC−04:00)', formatZoneClock(9, 30, z), 'Eastern War Time');
  z = chartAt(1945, 9, 1, 12, 0, -4, YONKERS, { tzIana: ny });
  golden('New York 1 September 1945 (peace time)', z, '12:00 EPT (UTC−04:00)', formatZoneClock(12, 0, z), 'Eastern Peace Time');

  z = chartAt(1990, 7, 15, 17, 3, 2, { lat: 52.52, lng: 13.405 }, { tzIana: 'Europe/Berlin' });
  golden('Berlin July 1990', z, '17:03 CEST (UTC+02:00)', formatZoneClock(17, 3, z), 'Central European Summer Time');
  const london = { lat: 51.5074, lng: -0.1278 };
  z = chartAt(1941, 6, 5, 12, 0, 2, london, { tzIana: 'Europe/London' });
  golden('London June 1941', z, '12:00 BDST (UTC+02:00)', formatZoneClock(12, 0, z), 'British Double Summer Time');
  // The tz database: rules GB-Eire kept +1 through the winters of 1940–45 ("BST").
  z = chartAt(1941, 1, 15, 12, 0, 1, london, { tzIana: 'Europe/London' });
  golden('London January 1941 (summer time kept all winter)', z, '12:00 BST (UTC+01:00)', formatZoneClock(12, 0, z), 'British Summer Time');
  z = chartAt(1970, 1, 15, 12, 0, 1, london, { tzIana: 'Europe/London' });
  golden('London January 1970 (+1 as standard time, 1968–71)', z, '12:00 BST (UTC+01:00)', formatZoneClock(12, 0, z), 'British Standard Time');
  z = chartAt(2000, 1, 15, 12, 0, 0, london, { tzIana: 'Europe/London' });
  golden('London January 2000', z, '12:00 GMT (UTC+00:00)', formatZoneClock(12, 0, z), 'Greenwich Mean Time');
  z = chartAt(2000, 7, 15, 12, 0, 1, { lat: 53.3498, lng: -6.2603 }, { tzIana: 'Europe/Dublin' });
  golden('Dublin July 2000', z, '12:00 IST (UTC+01:00)', formatZoneClock(12, 0, z), 'Irish Standard Time');
  z = chartAt(2000, 1, 15, 12, 0, 5.5, { lat: 22.5726, lng: 88.3639 }, { tzIana: 'Asia/Kolkata' });
  golden('Kolkata', z, '12:00 IST (UTC+05:30)', formatZoneClock(12, 0, z), 'India Standard Time');
  z = chartAt(2000, 1, 15, 12, 0, 4, { lat: 25.2048, lng: 55.2708 }, { tzIana: 'Asia/Dubai' });
  golden('Dubai', z, '12:00 GST (UTC+04:00)', formatZoneClock(12, 0, z), 'Gulf Standard Time');

  // Einstein: Ulm's own mean time, to the second, never Berlin's +0:53:28.
  const ulm = { lat: 48.4011, lng: 9.9876 };
  z = chartAt(1879, 3, 14, 11, 30, 9.9876 / 15, ulm, { tzIana: 'Europe/Berlin' });
  golden('Ulm 14 March 1879', z, '11:30 LMT (UTC+00:39:57)', formatZoneClock(11, 30, z), 'Local Mean Time');
  z = chartAt(1879, 3, 14, 11, 30, 3208 / H, ulm, { tzIana: 'Europe/Berlin' });
  golden('Ulm 1879 saved at Berlin’s mean time: not called LMT', z, '11:30 (UTC+00:53:28)', formatZoneClock(11, 30, z));
  // At an instant, a zone's mean-time era is its reference city's mean time — no
  // place's LMT in particular, so the offset stands alone (an Ulm chart's timeline
  // scrubbed to 1879 would otherwise call Berlin's +0:53:28 Ulm's "LMT").
  const berlin1879 = Date.UTC(1879, 2, 14, 10, 36);
  z = keep(zoneNameAtInstant('Europe/Berlin', berlin1879));
  golden('Europe/Berlin on 14 March 1879, by instant: the offset, no LMT', z, '(UTC+00:53:28)', formatZoneLabel(z));
  z = keep(timelineZoneAt({ tzIana: 'Europe/Berlin', tzOffset: 9.9876 / 15 }, berlin1879));
  golden('  and the timeline of an Ulm chart there', z, '(UTC+00:53:28)', formatZoneLabel(z));

  // The fall-back hour: one wall clock, two instants, two names.
  const first = keep(zoneNameAtInstant(ny, Date.UTC(2025, 10, 2, 5, 30)));
  const second = keep(zoneNameAtInstant(ny, Date.UTC(2025, 10, 2, 6, 30)));
  golden('New York 2 November 2025 01:30, first pass', first, '01:30 EDT (UTC−04:00)', formatZoneClock(1, 30, first));
  golden('New York 2 November 2025 01:30, second pass', second, '01:30 EST (UTC−05:00)', formatZoneClock(1, 30, second));
  z = chartAt(2025, 11, 2, 1, 30, -5, YONKERS, { tzIana: ny });
  golden('  a chart saved at −5 in that hour reads its own pass', z, '01:30 EST (UTC−05:00)', formatZoneClock(1, 30, z));
  z = chartAt(2025, 11, 2, 1, 30, -4, YONKERS, { tzIana: ny });
  golden('  and one saved at −4 the other', z, '01:30 EDT (UTC−04:00)', formatZoneClock(1, 30, z));

  // Zones that are not places.
  z = chartAt(1957, 3, 14, 16, 12, 0, { lat: 42.93, lng: -83.48 }, { tzIana: 'UTC' });
  golden('a Davison moment (zone UTC)', z, '16:12 (UTC)', formatZoneClock(16, 12, z));
  z = keep(zoneNameAtInstant('Etc/GMT+5', Date.UTC(2000, 0, 1)));
  golden('Etc/GMT+5 at an instant: the offset only', z, '(UTC−05:00)', formatZoneLabel(z));
  z = chartAt(2000, 1, 1, 9, 30, -5, YONKERS, { tzIana: 'Etc/GMT+5' });
  golden('a whole-hour UTC pick: the offset only', z, '09:30 (UTC−05:00)', formatZoneClock(9, 30, z));

  // A composite's parent carries only its offset and place: named where they agree.
  z = chartAt(1941, 6, 5, 9, 30, -5, YONKERS);
  golden('a composite parent stored at −5 in June 1941 New York: no EDT, no EST', z, '09:30 (UTC−05:00)', formatZoneClock(9, 30, z));
  z = chartAt(1941, 6, 5, 9, 30, -4, YONKERS);
  golden('  and at −4, named from its detected zone', z, '09:30 EDT (UTC−04:00)', formatZoneClock(9, 30, z));
  // The stored offset wins over the zone it names.
  z = chartAt(1941, 6, 5, 9, 30, -4.5, YONKERS, { tzIana: ny });
  golden('a stored offset no zone name gives', z, '09:30 (UTC−04:30)', formatZoneClock(9, 30, z));

  // Stated terms are the record.
  const est = { mode: 'standard' as const, std: -5 * H, zone: 'est' };
  z = chartAt(1943, 1, 15, 9, 30, -4, YONKERS, { tzIana: ny, tzEntry: { ...est, daylight: 'daylight' } });
  golden('stated "EST + daylight" in 1943 stays as stated', z, '09:30 EDT (UTC−04:00)', formatZoneClock(9, 30, z));
  z = chartAt(1943, 1, 15, 9, 30, -4, YONKERS, { tzIana: ny, tzEntry: { ...est, daylight: 'war' } });
  golden('stated "EST + war time" in 1943', z, '09:30 EWT (UTC−04:00)', formatZoneClock(9, 30, z), 'Eastern War Time');
  z = chartAt(1944, 6, 15, 9, 30, 2, london, { tzIana: 'Europe/London', tzEntry: { mode: 'standard', std: 0, daylight: 'double', zone: 'gmt' } });
  golden('stated "GMT + double" in London', z, '09:30 BDST (UTC+02:00)', formatZoneClock(9, 30, z));
  z = chartAt(1980, 7, 15, 9, 30, -4, YONKERS, { tzIana: ny, tzEntry: { mode: 'offset', seconds: -4 * H, text: '-04:00' } });
  golden('a typed offset is not turned into a zone', z, '09:30 (UTC−04:00)', formatZoneClock(9, 30, z));
  z = chartAt(1980, 7, 15, 9, 30, 0, YONKERS, { tzIana: ny, tzEntry: { mode: 'offset', seconds: 0, basis: 'ut' } });
  golden('a time recorded in UT', z, '09:30 (UTC)', formatZoneClock(9, 30, z));
  z = chartAt(1850, 1, 15, 9, 30, -17762 / H, YONKERS, { tzIana: ny, tzEntry: { mode: 'offset', seconds: -17762, basis: 'lmt' } });
  golden('a stated local mean time', z, '09:30 LMT (UTC−04:56:02)', formatZoneClock(9, 30, z));

  // A place's clock and the eclipse card built on it.
  const ulmClock = placeZoneAt(ulm.lat, ulm.lng);
  z = keep(ulmClock!(Date.UTC(1879, 2, 14, 10, 50)));
  golden('Ulm’s clock in 1879 is its own mean time', z, 'LMT (UTC+00:39:57)', formatZoneLabel(z));
  const ecl = eclipsePlaceClock(ulm.lat, ulm.lng)!(2407788.0);
  check('  the eclipse card reads it as local mean time (its own label)', ecl.zone === null && Math.round(ecl.offsetHours * H) === 2397,
    JSON.stringify({ zone: ecl.zone, offsetHours: ecl.offsetHours }));
  // 8 April 2024, 18:18 UT: Dallas's clock.
  const dallas = eclipsePlaceClock(32.7767, -96.797)!(2460409.2625);
  check('  Dallas on 8 April 2024 reads “CDT (UTC−05:00)”', dallas.zone === 'CDT (UTC−05:00)' && dallas.offsetHours === -5,
    JSON.stringify({ zone: dallas.zone, offsetHours: dallas.offsetHours }));
  check('  a point with no zone gives no clock', eclipsePlaceClock(NaN, 0) === null && placeZoneAt(95, 0) === null);

  // The timeline bar's rule.
  z = keep(timelineZoneAt(null, Date.UTC(2025, 6, 1)));
  golden('the timeline with no chart', z, '(UTC)', formatZoneLabel(z));
  z = keep(timelineZoneAt({ tzOffset: 5.5 }, Date.UTC(2025, 6, 1)));
  golden('the timeline with a zone-less legacy chart', z, '(UTC+05:30)', formatZoneLabel(z));
  z = keep(timelineZoneAt({ tzIana: ny, tzOffset: -5 }, Date.UTC(2025, 6, 1)));
  golden('the timeline in a chart’s zone, in summer', z, 'EDT (UTC−04:00)', formatZoneLabel(z));
  z = keep(timelineZoneAt({ tzIana: 'Not/AZone', tzOffset: -3 }, Date.UTC(2025, 6, 1)));
  golden('the timeline with a zone this engine does not know', z, '(UTC−03:00)', formatZoneLabel(z));
}

// ── 4. INTERNAL IDENTITY: every offset printed reads back ────────────────────

console.log('\n── 4. INTERNAL IDENTITY: every printed offset reads back to its seconds ──');

{
  const unique = [...new Map(seen.map((z) => [`${z.iso}|${z.seconds}`, z])).values()];
  every('parseZoneOffset(iso) = seconds', unique, (z) => {
    const p = parseZoneOffset(z.iso);
    return p && p.explicit && p.seconds === z.seconds ? null : `${z.iso} → ${p?.seconds} (want ${z.seconds})`;
  });
  every('UT is printed bare, every other offset in full', unique, (z) =>
    (z.kind === 'ut') === (z.iso === 'UTC') ? null : `${z.kind} printed ${z.iso}`,
  );
}

// ── 5. INTERNAL IDENTITY: the chart, the place and the timeline agree ────────

console.log('\n── 5. INTERNAL IDENTITY: one moment, one name, whichever way it is asked ──');

{
  const same = (a: ZoneName, b: ZoneName) =>
    a.seconds === b.seconds && a.abbr === b.abbr && a.long === b.long && a.kind === b.kind;
  every('an Auto chart is named like its place’s clock at its instant', chartSamples, (s) => {
    const place = placeZoneAt(s.chart.birthplace.lat, s.chart.birthplace.lng)!(s.instant);
    return same(s.z, place) ? null : `${s.label}: chart ${show(s.z)}, place ${show(place)}`;
  });
  every('the timeline in a chart’s zone is that zone at the instant', instantSamples.slice(0, 4000), (s) => {
    const t = timelineZoneAt({ tzIana: s.iana, tzOffset: 0 }, s.ms);
    return same(t, s.z) ? null : `${s.label}: timeline ${show(t)}, zone ${show(s.z)}`;
  });
  every('the eclipse card reads the place’s clock', placeSamples.filter((_, i) => i % 7 === 0), (s) => {
    const r = eclipsePlaceClock(s.at!.lat, s.at!.lng)!(s.ms / 86400_000 + 2440587.5);
    const want = s.z.kind === 'lmt' ? null : formatZoneLabel(s.z);
    return Math.round(r.offsetHours * H) === s.z.seconds && r.zone === want && same(r.name, s.z)
      ? null
      : `${s.label}: card ${r.zone} ${r.offsetHours} h vs ${want} ${s.z.seconds} s`;
  });
  // The stored offset wins: the same chart a minute off is the offset alone.
  const namedCharts = chartSamples.filter((s) => s.z.abbr);
  every('a chart a minute off its zone is named by its offset alone', namedCharts, (s) => {
    const off = zoneNameForChart({ ...s.chart, tzOffset: s.chart.tzOffset + 1 / 60 });
    return off.kind === 'offset' && off.seconds === Math.round(s.chart.tzOffset * H) + 60 ? null : `${s.label}: ${show(off)}`;
  });
  // A cached answer never stands in for a different moment: the whole sweep asked
  // again with the caches emptied and in reverse order — July before January, the far
  // side of every transition first — gives the same names. (Vincennes' switch from
  // EST to CDT at −5 in April 2006 once handed July the January answer.)
  clearZoneNameCaches();
  every('the instant sweep again, caches emptied, in reverse order', [...instantSamples].reverse(), (s) => {
    const again = zoneNameAtInstant(s.iana, s.ms);
    return same(again, s.z) ? null : `${s.label}: first ${show(s.z)}, again ${show(again)}`;
  });
  clearZoneNameCaches();
  every('the chart sweep again, caches emptied, in reverse order', [...chartSamples].reverse(), (s) => {
    const again = zoneNameForChart(s.chart);
    return same(again, s.z) ? null : `${s.label}: first ${show(s.z)}, again ${show(again)}`;
  });

  // The caches hand out copies.
  const a = zoneNameAtInstant('Europe/Berlin', Date.UTC(1990, 6, 15));
  a.abbr = 'XX';
  const b = zoneNameForChart(chartSamples[0].chart);
  b.abbr = 'XX';
  check('editing a returned name does not edit the next one',
    zoneNameAtInstant('Europe/Berlin', Date.UTC(1990, 6, 15)).abbr === 'CEST' &&
      zoneNameForChart(chartSamples[0].chart).abbr !== 'XX');
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
