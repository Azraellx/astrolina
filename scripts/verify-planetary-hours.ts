// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies PLANETARY DAYS & HOURS (src/lib/astro/planetaryHours.ts) and the Sun's
// horizon solve they stand on (sunHorizonDay in src/lib/astro/riseSet.ts), through
// the real modules (run via the harness: `npm run verify:planetary-hours`).
//
// The sections say which KIND of check they are, because a failure means
// different things (CLAUDE.md, "Prefer agreement between two parts"):
//   OUTSIDE AGREEMENT — the code against an independent reference. Breaking means
//                       the code is self-consistent and wrong.
//   TWO PARTS AGREE   — two parts of the app that must say the same thing.
//   INTERNAL IDENTITY — the code against itself. Breaking means it contradicts
//                       itself.
//   GOLDEN            — hand-derived answers for named cases.
import { createRequire } from 'node:module';
import { DateTime } from 'luxon';
import { initEphemeris } from '../src/lib/ephemeris';
import { dailySkyEvents, sunHorizonDay } from '../src/lib/astro/riseSet';
import {
  CHALDEAN_ORDER,
  planetaryDaysAround,
  planetaryHourAt,
  type PlanetaryDay,
} from '../src/lib/astro/planetaryHours';
import { getIanaTimezone, offsetHoursAt } from '../src/lib/atlas/timezone';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const node: any = createRequire(import.meta.url)('@swisseph/node');

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}
const section = (s: string) => console.log(`\n── ${s} ──`);

const MS_DAY = 86_400_000;
const msToJD = (ms: number) => ms / MS_DAY + 2440587.5;
const jdToMs = (jd: number) => (jd - 2440587.5) * MS_DAY;
const SEC = 1 / 86400;

interface Site {
  name: string;
  lat: number;
  lng: number;
}
const site = (name: string, lat: number, lng: number): Site => ({ name, lat, lng });
const SITES: Site[] = [
  site('Quito', -0.18, -78.47),
  site('Singapore', 1.35, 103.82),
  site('Apia', -13.83, -171.76),
  site('Sydney', -33.87, 151.21),
  site('New York', 40.71, -74.01),
  site('Kashgar', 39.47, 75.99),
  site('London', 51.51, -0.13),
  site('Ushuaia', -54.8, -68.3),
  site('Oslo', 59.91, 10.75),
  site('Reykjavik', 64.15, -21.94),
];

const zoneOf = (s: Site) => getIanaTimezone(s.lat, s.lng);

// Local noon of a calendar date in a zone (epoch ms) — the true one, from Luxon.
const localNoon = (y: number, m: number, d: number, zone: string) =>
  DateTime.fromObject({ year: y, month: m, day: d, hour: 12 }, { zone }).toMillis();

// The band's own shown-day start (SkyBand.tsx `dayStart`), reproduced: the zone's
// offset at a reference instant, floored to the wall-clock day. Its noon is what
// the band hands planetaryDaysAround.
function bandNoon(y: number, m: number, d: number, zone: string): number {
  const ref = localNoon(y, m, d, zone);
  const off = offsetHoursAt(zone, ref) * 3_600_000;
  const dayStart = Math.floor((ref + off) / MS_DAY) * MS_DAY - off;
  return dayStart + MS_DAY / 2;
}

const around = (s: Site, y: number, m: number, d: number) =>
  planetaryDaysAround(localNoon(y, m, d, zoneOf(s)), s.lat, s.lng, zoneOf(s));

// Swiss's own event finder, with its default bits: the Sun's UPPER LIMB on the
// horizon, with refraction — at the almanac's standard atmosphere (1013.25 hPa,
// 10 °C), which is what the app's fixed −0°50′ stands for.
const RISE = 1;
const SET = 2;
function swissEvent(from: number, kind: number, s: Site): number | null {
  const r = node.calculateRiseTransitSet(from, 0, kind, s.lng, s.lat, 0, 2, 1013.25, 10);
  return Number.isFinite(r?.time) ? r.time : null;
}

const dates2026: [number, number, number][] = [];
for (let m = 1; m <= 12; m++) {
  dates2026.push([2026, m, 1], [2026, m, 15]);
}
const farDates: [number, number, number][] = [
  [1850, 3, 15],
  [1850, 9, 15],
  [2150, 6, 15],
  [2150, 12, 15],
];

await initEphemeris();

// ─────────────────────────────────────────────────────────────────────────────
section('§1 OUTSIDE AGREEMENT — sunrise / sunset against Swiss rise_trans');
// Printed as HH:MM, so a disagreement past half a minute or so shows as a
// different minute from a published sunrise table.
for (const s of SITES) {
  let worst = 0;
  let worstAt = '';
  let n = 0;
  for (const [y, m, d] of [...dates2026, ...farDates]) {
    const sun = sunHorizonDay(msToJD(localNoon(y, m, d, zoneOf(s))), s.lat, s.lng);
    if (!sun || sun.rise === null || sun.set === null) continue;
    const r = swissEvent(sun.noon - 0.75, RISE, s);
    const st = swissEvent(sun.noon, SET, s);
    for (const [ours, ref, kind] of [
      [sun.rise, r, 'rise'],
      [sun.set, st, 'set'],
    ] as const) {
      if (ref === null) continue;
      n += 1;
      const dSec = Math.abs(ours - ref) * 86400;
      if (dSec > worst) {
        worst = dSec;
        worstAt = `${y}-${m}-${d} ${kind}`;
      }
    }
  }
  // Measured 2026-09-27: 3–9 s up to Oslo, 14 s at Reykjavik — the residue is
  // Swiss's refraction model and true semidiameter against the fixed −0°50′.
  const bound = Math.abs(s.lat) <= 60 ? 15 : 30;
  check(
    `${s.name}: sunrise/sunset within ${bound} s of Swiss (${n} events)`,
    n >= 40 && worst <= bound,
    `worst Δ ${worst.toFixed(1)} s at ${worstAt}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('§2 TWO PARTS AGREE — the band rows vs the planetary day');
{
  // (a) The band's Sun ASC/DSC (dailySkyEvents) and the planetary day's sunrise/
  // sunset are one solve — wherever the band didn't fold the event into its
  // civil day, they must be the same instant.
  let compared = 0;
  let worst = 0;
  for (const s of SITES) {
    for (const [y, m, d] of dates2026) {
      const noonMs = bandNoon(y, m, d, zoneOf(s));
      const dayStartJd = msToJD(noonMs - MS_DAY / 2);
      const band = dailySkyEvents(dayStartJd, s.lat, s.lng, ['Sun'], 'mean')[0];
      const sun = sunHorizonDay(dayStartJd + 0.5, s.lat, s.lng);
      if (!band || !sun) continue;
      for (const [a, b] of [
        [band.rise, sun.rise],
        [band.set, sun.set],
      ]) {
        if (a === null || b === null || Math.abs(a - b) > 0.01) continue; // folded
        compared += 1;
        worst = Math.max(worst, Math.abs(a - b) * 86400);
      }
    }
  }
  check(
    `band Sun ASC/DSC = planetary sunrise/sunset (${compared} pairs)`,
    compared >= 400 && worst < 1,
    `worst Δ ${worst.toFixed(3)} s`,
  );

  // (b) Independent calls for consecutive dates agree about the day between them.
  let pairs = 0;
  let bad = 0;
  for (const s of SITES) {
    for (let d = 1; d <= 14; d++) {
      const a = around(s, 2026, 4, d);
      const b = around(s, 2026, 4, d + 1);
      if (!a || !b || !a.shown.ok || !b.shown.ok || !b.previous.ok) continue;
      pairs += 1;
      const same =
        Math.abs(a.shown.nextSunrise - b.shown.sunrise) < SEC / 10 &&
        Math.abs(b.previous.sunrise - a.shown.sunrise) < SEC / 10 &&
        Math.abs(b.previous.sunset - a.shown.sunset) < SEC / 10 &&
        b.previous.ruler === a.shown.ruler;
      if (!same) bad += 1;
    }
  }
  check(`consecutive dates agree on the day between (${pairs} pairs)`, pairs >= 120 && bad === 0, `${bad} mismatch(es)`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('§3 INTERNAL IDENTITY — tiling, equal hours, the 25th hour');
function tilingErrors(d: PlanetaryDay): string[] {
  const e: string[] = [];
  const h = d.hours;
  if (h.length !== 24) e.push(`${h.length} hours`);
  if (h[0].start !== d.sunrise) e.push('hour 1 ≠ sunrise');
  if (h[11].end !== d.sunset || h[12].start !== d.sunset) e.push('hour 12/13 ≠ sunset');
  if (h[23].end !== d.nextSunrise) e.push('hour 24 ≠ next sunrise');
  for (let i = 0; i < 23; i++) {
    if (Math.abs(h[i].end - h[i + 1].start) > 1e-9) e.push(`gap after hour ${i + 1}`);
  }
  for (let i = 0; i < 24; i++) {
    const len = h[i].end - h[i].start;
    const want = i < 12 ? d.dayHour : d.nightHour;
    if (!(len > 0) || Math.abs(len - want) > 1e-7) e.push(`hour ${i + 1} length`);
    if (h[i].night !== i >= 12) e.push(`hour ${i + 1} half`);
    if (h[i].ruler !== CHALDEAN_ORDER[(CHALDEAN_ORDER.indexOf(d.ruler) + i) % 7]) {
      e.push(`hour ${i + 1} ruler`);
    }
  }
  return e;
}
{
  let days = 0;
  let broken = 0;
  let firstBroken = '';
  let links = 0;
  let badLinks = 0;
  for (const s of SITES) {
    for (let d = 1; d <= 14; d++) {
      const a = around(s, 2026, 7, d);
      if (!a) continue;
      for (const pd of [a.previous, a.shown, a.next]) {
        if (!pd.ok) continue;
        days += 1;
        const e = tilingErrors(pd);
        if (e.length && !firstBroken) firstBroken = `${s.name} ${pd.date.year}-${pd.date.month}-${pd.date.day}: ${e[0]}`;
        if (e.length) broken += 1;
      }
      // The 25th hour lands on the NEXT day's ruler — computed by the next
      // day from its own weekday, not by counting on.
      for (const [x, y] of [
        [a.previous, a.shown],
        [a.shown, a.next],
      ] as const) {
        if (!x.ok || !y.ok) continue;
        links += 1;
        if (CHALDEAN_ORDER[(CHALDEAN_ORDER.indexOf(x.ruler) + 24) % 7] !== y.ruler) badLinks += 1;
      }
    }
  }
  check(`hours tile exactly and are equal within each half (${days} days)`, days >= 300 && broken === 0, firstBroken || '');
  check(`25th hour = next day's ruler (${links} links)`, links >= 200 && badLinks === 0, `${badLinks} broken`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('§4 GOLDEN — weekday rulers and the lookup');
{
  const london = SITES.find((s) => s.name === 'London')!;
  for (const [y, m, d, want] of [
    [1969, 7, 20, 'Sun'], // a Sunday
    [2000, 1, 1, 'Saturn'], // a Saturday
    [2026, 9, 27, 'Sun'], // a Sunday
    [2026, 10, 2, 'Venus'], // a Friday
  ] as const) {
    const a = around(london, y, m, d);
    const got = a?.shown.ok ? a.shown.ruler : '—';
    check(`London ${y}-${m}-${d} is ruled by ${want}`, got === want, `got ${got}`);
  }

  // Friday 2 October 2026, London. 03:00 BST is still THURSDAY's night.
  const a = around(london, 2026, 10, 2)!;
  const zone = zoneOf(london);
  const at3 = DateTime.fromObject({ year: 2026, month: 10, day: 2, hour: 3 }, { zone }).toMillis();
  const n3 = planetaryHourAt(a, at3);
  check(
    '03:00 on Friday belongs to Thursday’s night (Jupiter’s day)',
    !!n3 && n3.ok && n3.day === a.previous && n3.hour.night && n3.day.ruler === 'Jupiter',
    n3?.ok ? `day ${n3.day.ruler}, hour ${n3.hour.index + 1} ${n3.hour.ruler}` : 'none',
  );
  // Thursday's hours run Jupiter → … → the 24th is the Sun's; Friday's first is
  // Venus's. One second either side of sunrise.
  if (a.shown.ok) {
    const before = planetaryHourAt(a, jdToMs(a.shown.sunrise) - 1000);
    const after = planetaryHourAt(a, jdToMs(a.shown.sunrise) + 1000);
    check(
      'a second before sunrise: Thursday’s 24th hour, the Sun’s',
      !!before?.ok && before.day === a.previous && before.hour.index === 23 && before.hour.ruler === 'Sun',
      before?.ok ? `hour ${before.hour.index + 1} ${before.hour.ruler}` : 'none',
    );
    check(
      'a second after sunrise: Friday’s 1st hour, Venus’s',
      !!after?.ok && after.day === a.shown && after.hour.index === 0 && after.hour.ruler === 'Venus',
      after?.ok ? `hour ${after.hour.index + 1} ${after.hour.ruler}` : 'none',
    );
  }

  // A sweep: every instant across the three days falls in exactly the hour whose
  // edges hold it, in order; and one second past an hour's end is the next hour
  // (the chip's timer wakes there).
  let steps = 0;
  let wrong = 0;
  let order = 0;
  let prevKey = -1;
  const days = [a.previous, a.shown, a.next].filter((d): d is PlanetaryDay => d.ok);
  const t0 = jdToMs(days[0].sunrise);
  const t1 = jdToMs(days[days.length - 1].nextSunrise);
  for (let ms = t0; ms < t1; ms += 7 * 60_000) {
    const r = planetaryHourAt(a, ms);
    steps += 1;
    const jd = msToJD(ms);
    if (!r?.ok || jd < r.hour.start || jd >= r.hour.end) {
      wrong += 1;
      continue;
    }
    const key = days.indexOf(r.day) * 24 + r.hour.index;
    if (key < prevKey) order += 1;
    prevKey = key;
  }
  check(`7-minute sweep: each instant in its own hour, in order (${steps} steps)`, steps > 600 && wrong === 0 && order === 0, `${wrong} misplaced, ${order} out of order`);
  let nextOk = 0;
  let nextBad = 0;
  for (const d of days) {
    for (const h of d.hours) {
      const r = planetaryHourAt(a, jdToMs(h.end) + 1000);
      if (!r) continue; // past the last day
      const want = h.index < 23 ? d.hours[h.index + 1] : null;
      const good = want ? r.ok && r.hour === want : r.ok && r.hour.index === 0 && r.day !== d;
      if (good) nextOk += 1;
      else nextBad += 1;
    }
  }
  check(`one second past each hour's end is the next hour (${nextOk} ends)`, nextOk >= 47 && nextBad === 0, `${nextBad} wrong`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('§5 High latitude in summer — sunset after local midnight');
{
  const rk = SITES.find((s) => s.name === 'Reykjavik')!;
  const zone = zoneOf(rk);
  let hit = 0;
  let broken = 0;
  let worst = 0;
  let folded = 0;
  for (let d = 10; d <= 30; d++) {
    const a = around(rk, 2026, 6, d);
    if (!a || !a.shown.ok) {
      broken += 1;
      continue;
    }
    const setMs = jdToMs(a.shown.sunset);
    const setDate = DateTime.fromMillis(setMs, { zone }).day;
    if (setDate !== d) hit += 1;
    if (tilingErrors(a.shown).length) broken += 1;
    const ref = swissEvent(a.shown.sunrise, SET, rk);
    if (ref !== null) worst = Math.max(worst, Math.abs(ref - a.shown.sunset) * 86400);
    // The band's row for the same date folds that sunset back into the civil
    // day (a known limit of the row solve — riseSet.ts intoDay). Reported only.
    const band = dailySkyEvents(msToJD(bandNoon(2026, 6, d, zone) - MS_DAY / 2), rk.lat, rk.lng, ['Sun'], 'mean')[0];
    if (band?.set != null && Math.abs(band.set - a.shown.sunset) > 0.01) folded += 1;
  }
  check(`Reykjavik June: sunset after midnight actually occurs (${hit} of 21 days)`, hit >= 5);
  check('Reykjavik June: every day valid and tiled', broken === 0, `${broken} broken`);
  check('Reykjavik June: sunsets within 30 s of Swiss', worst <= 30, `worst Δ ${worst.toFixed(1)} s`);
  console.log(`      note: the band row folds that sunset into the civil day on ${folded} of 21 days`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('§6 Polar — reported, never faked');
{
  const tromso = site('Tromsø', 69.65, 18.96);
  const summer = around(tromso, 2026, 6, 21);
  const winter = around(tromso, 2026, 12, 21);
  check('Tromsø 21 June: unavailable, the Sun stays up', !!summer && !summer.shown.ok && summer.shown.reason === 'sun-up', summer?.shown.ok ? 'available' : summer?.shown.reason);
  check('Tromsø 21 December: unavailable, the Sun doesn’t rise', !!winter && !winter.shown.ok && winter.shown.reason === 'sun-down', winter?.shown.ok ? 'available' : winter?.shown.reason);
  for (const [s, y, m, d, want] of [
    [site('Longyearbyen', 78.22, 15.65), 2026, 6, 21, 'sun-up'],
    [site('Longyearbyen', 78.22, 15.65), 2026, 12, 21, 'sun-down'],
    [site('McMurdo', -77.85, 166.67), 2026, 12, 21, 'sun-up'],
    [site('McMurdo', -77.85, 166.67), 2026, 6, 21, 'sun-down'],
  ] as const) {
    const a = around(s, y, m, d);
    check(`${s.name} ${y}-${m}-${d}: ${want}`, !!a && !a.shown.ok && a.shown.reason === want, a?.shown.ok ? 'available' : a?.shown.reason);
  }

  // The edges: scan into and out of midnight sun and polar night. Every day is
  // either fully valid (finite, positive, tiled) or unavailable with a reason.
  const scans: [string, [number, number, number], number][] = [
    ['into midnight sun', [2026, 5, 5], 25],
    ['out of midnight sun', [2026, 7, 12], 25],
    ['into polar night', [2026, 11, 18], 15],
    ['out of polar night', [2026, 1, 5], 20],
  ];
  const reasons = new Map<string, number>();
  let bad = 0;
  let firstBad = '';
  for (const [, [y, m, d0], n] of scans) {
    for (let k = 0; k < n; k++) {
      const date = DateTime.fromObject({ year: y, month: m, day: d0 }).plus({ days: k });
      const a = around(tromso, date.year, date.month, date.day);
      if (!a) {
        bad += 1;
        firstBad ||= `${date.toISODate()}: no result`;
        continue;
      }
      for (const pd of [a.previous, a.shown, a.next]) {
        if (pd.ok) {
          const e = tilingErrors(pd);
          if (e.length) {
            bad += 1;
            firstBad ||= `${date.toISODate()}: ${e[0]}`;
          }
        } else {
          reasons.set(pd.reason, (reasons.get(pd.reason) ?? 0) + 1);
        }
      }
    }
  }
  check('Tromsø edge scans: every day valid or reported', bad === 0, firstBad);
  console.log(`      unavailable reasons seen: ${[...reasons].map(([r, c]) => `${r} ×${c}`).join(', ')}`);

  // The first sunrise after polar night: the night before it belongs to a day with
  // no hours, so the lookup names THAT day (the band's chip reads "not available"
  // and its window explains) until the sunrise, and then hour 1 of the new day.
  let edge: { date: string; before: string; after: string } | null = null;
  for (let k = 0; k < 30 && !edge; k++) {
    const date = DateTime.fromObject({ year: 2026, month: 1, day: 1 }).plus({ days: k });
    const a = around(tromso, date.year, date.month, date.day);
    if (!a || a.previous.ok || !a.shown.ok) continue;
    const before = planetaryHourAt(a, jdToMs(a.shown.sunrise) - 1000);
    const after = planetaryHourAt(a, jdToMs(a.shown.sunrise) + 1000);
    edge = {
      date: date.toISODate() ?? '',
      before: before ? (before.ok ? 'an hour' : before.day === a.previous ? 'previous, unavailable' : 'other') : 'none',
      after: after?.ok ? `${after.day === a.shown ? 'shown' : 'other'} hour ${after.hour.index + 1}` : 'none',
    };
  }
  check(
    'Tromsø, first sunrise after polar night: unavailable until it, then hour 1',
    !!edge && edge.before === 'previous, unavailable' && edge.after === 'shown hour 1',
    edge ? `${edge.date}: before → ${edge.before}; after → ${edge.after}` : 'no such day found in January',
  );

  // Near the polar circles, where the clock runs well BEHIND the Sun (Vorkuta, at
  // 64° E on Moscow time, has its solar midnight near 22:45), a short night's
  // sunrise lands BEFORE local midnight. The day is named for its MIDDAY's date,
  // so the week still advances one ruler a day across those dates; naming it for
  // its sunrise's date would give two days running the same ruler. (A clock
  // AHEAD of the Sun — Reykjavik, Murmansk — puts the SUNSET past midnight
  // instead, which names nothing; §5.)
  for (const [s, wantHit] of [
    [site('Vorkuta', 67.5, 64.05), true],
    [site('Vardø', 70.37, 31.11), false],
  ] as const) {
    const zone = zoneOf(s);
    let early = 0;
    let links = 0;
    let badLinks = 0;
    for (const [y, m, d0, n] of [
      [2026, 4, 20, 35],
      [2026, 7, 15, 35],
    ] as const) {
      for (let k = 0; k < n; k++) {
        const date = DateTime.fromObject({ year: y, month: m, day: d0 }).plus({ days: k });
        const a = around(s, date.year, date.month, date.day);
        if (!a) continue;
        const pd = a.shown;
        if (pd.ok && DateTime.fromMillis(jdToMs(pd.sunrise), { zone }).day !== pd.date.day) early += 1;
        for (const [x, y2] of [
          [a.previous, a.shown],
          [a.shown, a.next],
        ] as const) {
          if (!x.ok || !y2.ok) continue;
          links += 1;
          if (CHALDEAN_ORDER[(CHALDEAN_ORDER.indexOf(x.ruler) + 24) % 7] !== y2.ruler) badLinks += 1;
        }
      }
    }
    console.log(`      ${s.name}: ${early} day(s) whose sunrise falls on the previous calendar date`);
    if (wantHit) check(`${s.name}: the early-sunrise case actually occurs`, early > 0);
    check(`${s.name}: the week advances one ruler a day (${links} links)`, links > 50 && badLinks === 0, `${badLinks} broken`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('§7 DST — equal in UT, labels jump');
{
  for (const [s, y, m, d] of [
    [SITES.find((x) => x.name === 'New York')!, 2026, 3, 8],
    [SITES.find((x) => x.name === 'New York')!, 2026, 11, 1],
    [SITES.find((x) => x.name === 'London')!, 2026, 3, 29],
    [SITES.find((x) => x.name === 'London')!, 2026, 10, 25],
  ] as const) {
    const zone = zoneOf(s);
    const a = around(s, y, m, d);
    const b = planetaryDaysAround(bandNoon(y, m, d, zone), s.lat, s.lng, zone);
    check(
      `${s.name} ${y}-${m}-${d}: the band's noon names the same day`,
      !!a && !!b && a.shown.ok && b.shown.ok && a.shown.sunrise === b.shown.sunrise,
    );
    check(`${s.name} ${y}-${m}-${d}: a Sunday, ruled by the Sun`, !!a && a.shown.ok && a.shown.ruler === 'Sun');
    // Saturday night holds the change: its night hours stay equal in UT, and
    // exactly one wall-clock gap between them is an hour off.
    const sat = a?.previous;
    if (sat?.ok) {
      const wall = (jd: number) => {
        const ms = jdToMs(jd);
        return ms + offsetHoursAt(zone, ms) * 3_600_000;
      };
      let off = 0;
      for (let i = 12; i < 23; i++) {
        const gap = wall(sat.hours[i + 1].start) - wall(sat.hours[i].start);
        if (Math.abs(Math.abs(gap - sat.nightHour * MS_DAY) - 3_600_000) < 1000) off += 1;
      }
      check(`${s.name} ${y}-${m}-${d}: one wall-clock gap in Saturday night is an hour off`, off === 1, `${off}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('§8 The date line — the weekday is the local one');
{
  for (const s of [site('Apia', -13.83, -171.76), site('Kiritimati', 1.87, -157.4)]) {
    const zone = zoneOf(s);
    const a = around(s, 2026, 9, 27); // a Sunday, locally
    const utcWeekday = new Date(localNoon(2026, 9, 27, zone)).getUTCDay();
    check(`${s.name} (${zone}): local noon is on a different UTC weekday`, utcWeekday !== 0, `UTC weekday ${utcWeekday}`);
    check(`${s.name}: Sunday 27 September is ruled by the Sun`, !!a && a.shown.ok && a.shown.ruler === 'Sun', a?.shown.ok ? a.shown.ruler : '—');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('§9 Cost');
{
  let rnd = 12345;
  const rand = () => ((rnd = (rnd * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const N = 300;
  let done = 0;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    const s = site('r', -60 + rand() * 120, -180 + rand() * 360);
    const r = planetaryDaysAround(Date.UTC(2026, Math.floor(rand() * 12), 1 + Math.floor(rand() * 28), 12), s.lat, s.lng, zoneOf(s));
    if (r) done += 1;
  }
  const per = (performance.now() - t0) / N;
  console.log(`      planetaryDaysAround: ${per.toFixed(2)} ms per call (${done}/${N} resolved)`);
  check('cheap enough to recompute on every Time Stamp move', per < 20 && done === N);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
