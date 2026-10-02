// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the RISE / SET / CULMINATION solve (src/lib/astro/riseSet.ts): every
// occurrence in a window (skyEventsBetween), the civil-day rows the Sky Times
// band prints (skyDayRows, dailySkyEvents) and Slide's step to the next event
// (nextSkyEvent), through the real modules (run via the harness:
// `npm run verify:rise-set`).
//
// Written 2026-10-02 with the solve's rewrite. Until then the band found one
// culmination near midday and the crossings either side of it, and moved anything
// outside the civil day back in by a sidereal day: about a quarter of the Moon's
// printed rises and sets were instants at which she was nowhere near the horizon,
// and nothing tested it — the solve was verified for the Sun only
// (verify:planetary-hours). This suite covers every body.
//
// The sections say which KIND of check they are, because a failure means
// different things (CLAUDE.md, "Prefer agreement between two parts"):
//   OUTSIDE AGREEMENT — the code against an independent reference. Breaking means
//                       the code is self-consistent and wrong.
//   TWO PARTS AGREE   — two parts of the app that must say the same thing.
//   INTERNAL IDENTITY — the code against itself. Breaking means it contradicts
//                       itself.
//   GOLDEN            — hand-derived answers for named cases.
// Every comparison fails on an empty set rather than passing vacuously.
import { createRequire } from 'node:module';
import { DateTime } from 'luxon';
import {
  gmstRadians,
  initEphemeris,
  sampleBody,
  sunMoonEquatorial,
  type PlanetName,
} from '../src/lib/ephemeris';
import {
  dailySkyEvents,
  nextSkyEvent,
  skyDayRows,
  skyEventsBetween,
  type BodyDayEvents,
  type EventKind,
  type SkyEvent,
  type SkySampler,
} from '../src/lib/astro/riseSet';
import { normLng, traceHorizonCoords, type MeridianLng } from '../src/lib/astro/lines';
import { getIanaTimezone, offsetHoursAt } from '../src/lib/atlas/timezone';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const node: any = createRequire(import.meta.url)('@swisseph/node');

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}
const section = (s: string) => console.log(`\n── ${s} ──`);
const note = (s: string) => console.log(`      ${s}`);

const MS_DAY = 86_400_000;
const msToJD = (ms: number) => ms / MS_DAY + 2440587.5;
const jdToMs = (jd: number) => (jd - 2440587.5) * MS_DAY;
const MIN = 1 / 1440;
const D2R = Math.PI / 180;
const TWO_PI = 2 * Math.PI;
const utc = (jd: number) => DateTime.fromMillis(jdToMs(jd), { zone: 'utc' }).toFormat('yyyy-MM-dd HH:mm');

// The Sun through Pluto — the band's default set, less the Part of Fortune, which
// has no position to sample (the band says why in its own entry).
const BODIES: PlanetName[] = [
  'Sun',
  'Moon',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
  'Pluto',
];
const SWISS_ID: Record<string, number> = {
  Sun: 0,
  Moon: 1,
  Mercury: 2,
  Venus: 3,
  Mars: 4,
  Jupiter: 5,
  Saturn: 6,
  Uranus: 7,
  Neptune: 8,
  Pluto: 9,
};

interface Site {
  name: string;
  lat: number;
  lng: number;
}
const site = (name: string, lat: number, lng: number): Site => ({ name, lat, lng });

// The visible horizon each body is printed on (the methods page's convention,
// restated here as the definition under test): the Sun's upper limb at −0°50′,
// a planet's centre at −0°34′, the Moon's centre at Meeus' standard altitude,
// 0.7275 × her horizontal parallax − 0°34′.
function shownH0(body: PlanetName, distanceAu: number | undefined): number {
  if (body === 'Sun') return -0.8333 * D2R;
  if (body !== 'Moon') return -0.5667 * D2R;
  const d = distanceAu ?? 384_400 / 149_597_870.7;
  return 0.7275 * Math.asin(6378.14 / (d * 149_597_870.7)) - 0.5667 * D2R;
}

// Greenwich apparent sidereal time from the engine directly — the ARMC at
// longitude 0 — not through the app's gmstRadians.
function gast(jd: number): number {
  const v = node.calculateHouses(jd, 0, 0, node.HouseSystem.WholeSign).armc * D2R;
  return ((v % TWO_PI) + TWO_PI) % TWO_PI;
}

// A body's exact place at an instant (no solver cache), with the Moon's distance.
function exactSample(jd: number, body: PlanetName): { ra: number; dec: number; distance?: number } | null {
  const s = sampleBody(jd, body, 'mean');
  if (!s) return null;
  return body === 'Moon' ? { ra: s.ra, dec: s.dec, distance: sunMoonEquatorial(jd).moonDistAu } : s;
}

function altitudeAt(jd: number, ra: number, dec: number, s: Site): number {
  const H = gast(jd) + s.lng * D2R - ra;
  const phi = s.lat * D2R;
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
}

// The band's shown day (SkyBand.tsx `dayStart` / `dayEnd`), reproduced exactly as
// verify-planetary-hours does: local midnight to the next local midnight, each by
// the offset in force AT it (one refine pass), so a clock-change day is 23 or 25 h.
function bandDay(y: number, m: number, d: number, zone: string): { start: number; end: number } {
  const ref = DateTime.fromObject({ year: y, month: m, day: d, hour: 12 }, { zone }).toMillis();
  const off = offsetHoursAt(zone, ref) * 3_600_000;
  const wallMidnight = Math.floor((ref + off) / MS_DAY) * MS_DAY;
  const start = wallMidnight - offsetHoursAt(zone, wallMidnight - off) * 3_600_000;
  const end = wallMidnight + MS_DAY - offsetHoursAt(zone, wallMidnight + MS_DAY - off) * 3_600_000;
  return { start, end };
}

const days2026: DateTime[] = [];
for (let k = 0; k < 365; k++) days2026.push(DateTime.fromObject({ year: 2026, month: 1, day: 1 }).plus({ days: k }));

await initEphemeris();

// ─────────────────────────────────────────────────────────────────────────────
section('§1 OUTSIDE AGREEMENT — rise and set against Swiss rise_trans');
// Swiss's own event search, with its default bits: the disc's upper limb on the
// horizon with refraction at the almanac's standard atmosphere (1013.25 hPa,
// 10 °C), seen TOPOCENTRICALLY — from the surface, so the Moon's parallax is in it.
// Meeus' standard altitudes are that same definition put on geocentric positions,
// which is what the app has; this is the almanac check the visible horizon is
// chosen for. Searched from two hours before each of our instants: an instant that
// is not a real crossing lands on a different one, hours away.
{
  const SITES1 = [
    site('equator', -0.18, -78.47),
    site('35°', 35.0, 135.77),
    site('50°', 50.11, 8.68),
    site('60°', 59.91, 10.75),
  ];
  const HIGH = site('72°', 72.0, 25.0);
  const dates: number[] = [];
  for (let k = 0; k < 365; k += 3) dates.push(msToJD(Date.UTC(2026, 0, 1 + k)));
  // `none`: our crossings Swiss's search finds nothing for — it throws, or its
  // first crossing of that kind is hours away (another pass's). Only a graze can
  // do that — a pass that just reaches the standard altitude on our geocentric
  // model and not on Swiss's topocentric one — so it is reported at 72° and must
  // not happen at the bounded latitudes.
  type Tally = { n: number; worst: number; at: string; none: number };
  const run = (s: Site) => {
    const tally = new Map<string, Tally>();
    for (const jd0 of dates) {
      for (const e of skyEventsBetween(jd0, jd0 + 1, s.lat, s.lng, BODIES, 'mean')) {
        if ((e.kind !== 'rise' && e.kind !== 'set') || e.jd === null) continue;
        const key = e.body === 'Sun' || e.body === 'Moon' ? e.body : 'planets';
        const t = tally.get(key) ?? { n: 0, worst: 0, at: '', none: 0 };
        tally.set(key, t);
        let time: number | undefined;
        try {
          time = node.calculateRiseTransitSet(
            e.jd - 2 / 24,
            SWISS_ID[e.body],
            e.kind === 'rise' ? 1 : 2,
            s.lng,
            s.lat,
            0,
            2,
            1013.25,
            10,
          )?.time;
        } catch {
          t.none += 1;
          continue;
        }
        if (time === undefined || !Number.isFinite(time)) continue;
        if (Math.abs(time - e.jd) > 2 / 24) {
          t.none += 1;
          continue;
        }
        const dSec = Math.abs(time - e.jd) * 86400;
        t.n += 1;
        if (dSec > t.worst) {
          t.worst = dSec;
          t.at = `${e.body} ${e.kind} ${utc(e.jd)}`;
        }
        tally.set(key, t);
      }
    }
    return tally;
  };
  // Measured 2026-10-02 (worst over every third day of 2026, equator → 60°): the
  // Sun 3–9 s, the planets 4–12 s, the Moon 3–19 s — the residue is Swiss's
  // refraction model, the true discs and the Earth's flattening against the fixed
  // standard altitudes. Before that day's correction the Moon was printed 5 to 21
  // minutes off at 60°.
  const bound: Record<string, number> = { Sun: 15, planets: 30, Moon: 30 };
  for (const s of SITES1) {
    const t = run(s);
    for (const key of ['Sun', 'Moon', 'planets']) {
      const x = t.get(key) ?? { n: 0, worst: Infinity, at: 'none', none: 0 };
      check(
        `${s.name}: ${key} rise/set within ${bound[key]} s of Swiss (${x.n} events)`,
        x.n >= 100 && x.worst <= bound[key] && x.none === 0,
        `worst Δ ${x.worst.toFixed(1)} s at ${x.at}${x.none ? `; ${x.none} Swiss finds no crossing for` : ''}`,
      );
    }
  }
  // 72°: reported, not bounded. Near the circumpolar limit a crossing's time is
  // ill-conditioned (an arcsecond of altitude is minutes of time), and the two
  // standard-altitude models part by more than a fixed bound can say — at a
  // graze, by whether the crossing happens at all.
  const t = run(HIGH);
  for (const key of ['Sun', 'Moon', 'planets']) {
    const x = t.get(key);
    note(
      `72°: ${key} — ${
        x
          ? `${x.n} events, worst Δ ${(x.worst / 60).toFixed(1)} min at ${x.at}${
              x.none ? `; ${x.none} more Swiss finds no crossing for (grazes)` : ''
            }`
          : 'none'
      }`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The brute-force sky for §2–§3: every body's place every 10 minutes through 2026
// (and a day either side), straight from the engine, with sidereal time from the
// engine's ARMC; read at any minute by linear interpolation. Independent of the
// solver: no hour-angle algebra, no semi-arc, no iteration — just the altitude and
// the hour angle, scanned minute by minute for every sign change.
const NODE = 10 / 1440;
const T0 = msToJD(Date.UTC(2025, 11, 30));
const T1 = msToJD(Date.UTC(2027, 0, 3));
const NN = Math.ceil((T1 - T0) / NODE) + 1;
const nodeGast = new Float64Array(NN);
const nodePos = new Map<PlanetName, { ra: Float64Array; dec: Float64Array; dist: Float64Array }>();
{
  const tBuild = performance.now();
  let unwrap = 0;
  let prev = 0;
  for (let i = 0; i < NN; i++) {
    const g = gast(T0 + i * NODE);
    if (i > 0 && g < prev) unwrap += TWO_PI;
    nodeGast[i] = g + unwrap;
    prev = g;
  }
  for (const body of BODIES) {
    const ra = new Float64Array(NN);
    const dec = new Float64Array(NN);
    const dist = new Float64Array(NN);
    let off = 0;
    for (let i = 0; i < NN; i++) {
      const s = exactSample(T0 + i * NODE, body)!;
      // Unwrapped RA, so interpolation never runs the long way round.
      if (i > 0) {
        const d = s.ra + off - ra[i - 1];
        if (d > Math.PI) off -= TWO_PI;
        else if (d < -Math.PI) off += TWO_PI;
      }
      ra[i] = s.ra + off;
      dec[i] = s.dec;
      dist[i] = s.distance ?? NaN;
    }
    nodePos.set(body, { ra, dec, dist });
  }
  note(`brute-force sky: ${NN} nodes × ${BODIES.length} bodies, built in ${((performance.now() - tBuild) / 1000).toFixed(1)} s`);
}

// One scanned moment: which body, which event, which horizon, when.
interface Found {
  body: PlanetName;
  kind: EventKind;
  geo: boolean; // a crossing of the geometric horizon (else of the visible one / a meridian)
  jd: number;
}

// Every sign change of the altitude above each horizon, and of the hour angle
// through 0 and π, minute by minute through the node span, refined by bisection
// on the interpolated sky.
function scan(s: Site): Found[] {
  const out: Found[] = [];
  const phi = s.lat * D2R;
  const lng = s.lng * D2R;
  for (const body of BODIES) {
    const p = nodePos.get(body)!;
    const at = (jd: number) => {
      const x = (jd - T0) / NODE;
      const i = Math.min(Math.max(Math.floor(x), 0), NN - 2);
      const f = x - i;
      const lerp = (a: Float64Array) => a[i] + (a[i + 1] - a[i]) * f;
      const ra = lerp(p.ra);
      const dec = lerp(p.dec);
      const H = lerp(nodeGast) + lng - ra;
      const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
      const dist = body === 'Moon' ? lerp(p.dist) : undefined;
      return { alt, shown: alt - shownH0(body, dist), sinH: Math.sin(H), cosH: Math.cos(H) };
    };
    const refine = (a: number, b: number, g: (jd: number) => number) => {
      const ga = g(a) > 0;
      for (let k = 0; k < 24; k++) {
        const m = (a + b) / 2;
        if (g(m) > 0 === ga) a = m;
        else b = m;
      }
      return (a + b) / 2;
    };
    const n = Math.floor((T1 - T0 - 2 * NODE) / MIN);
    let prev = at(T0);
    for (let k = 1; k <= n; k++) {
      const jd = T0 + k * MIN;
      const cur = at(jd);
      const a = jd - MIN;
      if (prev.shown <= 0 && cur.shown > 0) out.push({ body, kind: 'rise', geo: false, jd: refine(a, jd, (t) => at(t).shown) });
      if (prev.shown > 0 && cur.shown <= 0) out.push({ body, kind: 'set', geo: false, jd: refine(a, jd, (t) => at(t).shown) });
      if (prev.alt <= 0 && cur.alt > 0) out.push({ body, kind: 'rise', geo: true, jd: refine(a, jd, (t) => at(t).alt) });
      if (prev.alt > 0 && cur.alt <= 0) out.push({ body, kind: 'set', geo: true, jd: refine(a, jd, (t) => at(t).alt) });
      if (prev.sinH < 0 && cur.sinH >= 0 && cur.cosH > 0) {
        out.push({ body, kind: 'culminate', geo: false, jd: refine(a, jd, (t) => at(t).sinH) });
      }
      if (prev.sinH > 0 && cur.sinH <= 0 && cur.cosH < 0) {
        out.push({ body, kind: 'anticulminate', geo: false, jd: refine(a, jd, (t) => -at(t).sinH) });
      }
      prev = cur;
    }
  }
  return out;
}

const SCAN_SITES = [
  site('Quito', -0.18, -78.47), // ~0°, no clock change
  site('Albuquerque', 35.08, -106.65), // ~35°, US clock changes
  site('Frankfurt', 50.11, 8.68), // ~50°, EU clock changes
  site('Oulu', 65.01, 25.47), // ~65°, EU clock changes, near the polar circle
];
// Scanned and checked like the four above (§2, §3), but not in §4's map-line check,
// which is about the four. Added 2026-10-02 with the turning-point brackets: at
// 72° a moving body's altitude turns minutes from its transit at a height that can
// put it on the other side of a horizon, and the transit-bracketed solve lost both
// crossings of such a pass (two in 2026 here; at Oulu the window is about 20″ wide
// and none fell in it, which is how the suite missed it).
const HIGH_SITES = [site('72°N', 72.0, 25.0)];
const ALL_SITES = [...SCAN_SITES, ...HIGH_SITES];

// Per site: the band's solve for every civil day of 2026, and the scan.
interface DayRun {
  start: number; // JD
  end: number;
  events: SkyEvent[]; // the band's solve: [start − 12 h, end + 12 h)
  rows: BodyDayEvents[];
}
const runs = new Map<string, DayRun[]>();
const scans = new Map<string, Found[]>();
let solveMs = 0;
let solveN = 0;
for (const s of ALL_SITES) {
  const zone = getIanaTimezone(s.lat, s.lng);
  const list: DayRun[] = [];
  for (const d of days2026) {
    const day = bandDay(d.year, d.month, d.day, zone);
    const start = msToJD(day.start);
    const end = msToJD(day.end);
    const t0 = performance.now();
    const events = skyEventsBetween(start - 0.5, end + 0.5, s.lat, s.lng, BODIES, 'mean');
    solveMs += performance.now() - t0;
    solveN += 1;
    list.push({ start, end, events, rows: skyDayRows(events, BODIES, start, end) });
  }
  runs.set(s.name, list);
  scans.set(
    s.name,
    scan(s).sort((a, b) => a.jd - b.jd),
  );
}

// The scanned moments in [a, b), from a list sorted by time.
function foundIn(list: Found[], a: number, b: number): Found[] {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (list[m].jd < a) lo = m + 1;
    else hi = m;
  }
  const out: Found[] = [];
  for (let i = lo; i < list.length && list[i].jd < b; i++) out.push(list[i]);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
section('§2 INTERNAL IDENTITY — every civil day of 2026 against a brute-force scan of the same sky');
// The solver against a minute-by-minute scan of the positions it reads: breaking
// means it has missed a crossing the sky makes, or reported one it doesn't.
{
  for (const s of ALL_SITES) {
    const found = scans.get(s.name)!;
    let matched = 0;
    let missed = 0;
    let invented = 0;
    let worst = 0;
    let geoMatched = 0;
    let geoMissed = 0;
    let geoInvented = 0;
    let doubles = 0;
    let doublesBoth = 0;
    let skipped = 0;
    let skippedEmpty = 0;
    const firstBad: string[] = [];
    for (const r of runs.get(s.name)!) {
      const inDay = foundIn(found, r.start, r.end);
      for (const body of BODIES) {
        const row = r.rows.find((x) => x.body === body);
        for (const kind of ['rise', 'culminate', 'set', 'anticulminate'] as const) {
          // Displayed instants: the row against the scan (visible horizon, meridian).
          const want = inDay.filter((f) => f.body === body && f.kind === kind && !f.geo).map((f) => f.jd);
          const got = row ? row[kind] : [];
          for (const w of want) {
            const g = got.find((x) => Math.abs(x - w) <= MIN);
            if (g === undefined) {
              missed += 1;
              if (firstBad.length < 3) firstBad.push(`missed ${body} ${kind} ${utc(w)}`);
            } else {
              matched += 1;
              worst = Math.max(worst, Math.abs(g - w) * 86400);
            }
          }
          for (const g of got) {
            if (!want.some((w) => Math.abs(g - w) <= MIN)) {
              invented += 1;
              if (firstBad.length < 3) firstBad.push(`reported ${body} ${kind} ${utc(g)}`);
            }
          }
          if (want.length === 2) {
            doubles += 1;
            if (got.length === 2) doublesBoth += 1;
          }
          if (body === 'Moon' && kind === 'culminate' && want.length === 0) {
            skipped += 1;
            if (got.length === 0) skippedEmpty += 1;
          }
          // Geometric instants: the solve's geoJd against the scan's altitude-0
          // crossings, inside the day.
          if (kind === 'rise' || kind === 'set') {
            const wantG = inDay.filter((f) => f.body === body && f.kind === kind && f.geo).map((f) => f.jd);
            const gotG = r.events
              .filter((e) => e.body === body && e.kind === kind && e.geoJd !== null)
              .map((e) => e.geoJd as number)
              .filter((x) => x >= r.start && x < r.end);
            for (const w of wantG) {
              if (gotG.some((x) => Math.abs(x - w) <= MIN)) geoMatched += 1;
              else {
                geoMissed += 1;
                if (firstBad.length < 3) firstBad.push(`missed geometric ${body} ${kind} ${utc(w)}`);
              }
            }
            for (const g of gotG) {
              if (!wantG.some((w) => Math.abs(g - w) <= MIN)) {
                geoInvented += 1;
                if (firstBad.length < 3) firstBad.push(`reported geometric ${body} ${kind} ${utc(g)}`);
              }
            }
          }
        }
      }
    }
    check(
      `${s.name}: every scanned rise/culmination/set/anti-culmination is in the day's row, and nothing else (${matched} matched)`,
      matched > 5000 && missed === 0 && invented === 0,
      `${missed} missed, ${invented} reported without a crossing; worst Δ ${worst.toFixed(1)} s${firstBad.length ? ` — ${firstBad.join('; ')}` : ''}`,
    );
    check(
      `${s.name}: every geometric-horizon crossing is a geoJd, and nothing else (${geoMatched} matched)`,
      geoMatched > 2000 && geoMissed === 0 && geoInvented === 0,
      `${geoMissed} missed, ${geoInvented} reported without a crossing`,
    );
    check(
      `${s.name}: a body with two of an event in a civil day shows both (${doubles} such)`,
      doubles > 0 && doublesBoth === doubles,
      `${doubles - doublesBoth} shown once`,
    );
    check(
      `${s.name}: a day the Moon doesn't culminate shows no culmination (${skipped} such)`,
      skipped > 0 && skippedEmpty === skipped,
      `${skipped - skippedEmpty} drawn anyway`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('§3 INTERNAL IDENTITY — the window, the horizons, the circumpolar notes');
{
  let outside = 0;
  let rowOutside = 0;
  let nEvents = 0;
  let nRowInstants = 0;
  let worstGeo = 0;
  let worstShown = 0;
  let nGeo = 0;
  let nShown = 0;
  let notes = 0;
  let badNotes = 0;
  let worstMeridian = 0;
  let nMeridian = 0;
  for (const s of ALL_SITES) {
    const found = scans.get(s.name)!;
    runs.get(s.name)!.forEach((r, i) => {
      for (const e of r.events) {
        nEvents += 1;
        const t = e.jd ?? (e.geoJd as number);
        if (t < r.start - 0.5 || t >= r.end + 0.5) outside += 1;
      }
      for (const row of r.rows) {
        for (const k of ['rise', 'culminate', 'set', 'anticulminate'] as const) {
          for (const x of row[k]) {
            nRowInstants += 1;
            if (x < r.start || x >= r.end) rowOutside += 1;
          }
        }
      }
      // Every fifth day: each instant's altitude / hour angle, sampled exactly.
      if (i % 5 !== 0) return;
      for (const e of r.events) {
        const at = (jd: number) => exactSample(jd, e.body)!;
        if (e.kind === 'rise' || e.kind === 'set') {
          if (e.geoJd !== null) {
            const p = at(e.geoJd);
            worstGeo = Math.max(worstGeo, Math.abs(altitudeAt(e.geoJd, p.ra, p.dec, s)));
            nGeo += 1;
          }
          if (e.jd !== null) {
            const p = at(e.jd);
            worstShown = Math.max(
              worstShown,
              Math.abs(altitudeAt(e.jd, p.ra, p.dec, s) - shownH0(e.body, p.distance)),
            );
            nShown += 1;
          }
        } else {
          const p = at(e.jd as number);
          const H = gast(e.jd as number) + s.lng * D2R - p.ra - (e.kind === 'culminate' ? 0 : Math.PI);
          worstMeridian = Math.max(worstMeridian, Math.abs(Math.atan2(Math.sin(H), Math.cos(H))));
          nMeridian += 1;
        }
      }
      // A circumpolar note says the body is on one side of the visible horizon all
      // day: the scan must find no crossing of it in the day, and the body on that side.
      for (const row of r.rows) {
        if (!row.circumpolar) continue;
        notes += 1;
        const crosses = foundIn(found, r.start, r.end).some(
          (f) => f.body === row.body && !f.geo && (f.kind === 'rise' || f.kind === 'set'),
        );
        const p = exactSample(r.start, row.body)!;
        const side = altitudeAt(r.start, p.ra, p.dec, s) - shownH0(row.body, p.distance) > 0 ? 'up' : 'down';
        if (crosses || side !== row.circumpolar) badNotes += 1;
      }
    });
  }
  check(`no event outside the window it was asked for (${nEvents} events)`, nEvents > 0 && outside === 0, `${outside} outside`);
  check(
    `no row instant outside its civil day (${nRowInstants} instants)`,
    nRowInstants > 5000 && rowOutside === 0,
    `${rowOutside} outside`,
  );
  check(
    `geometric instants: the body's centre at altitude 0 (${nGeo} crossings)`,
    nGeo > 1000 && worstGeo < 1e-6,
    `max |alt| ${worstGeo.toExponential(2)} rad`,
  );
  check(
    `visible instants: the body at its standard altitude (${nShown} crossings)`,
    nShown > 1000 && worstShown < 1e-6,
    `max Δ ${worstShown.toExponential(2)} rad`,
  );
  check(
    `meridian instants: hour angle 0 / π (${nMeridian} transits)`,
    nMeridian > 1000 && worstMeridian < 1e-6,
    `max Δ ${worstMeridian.toExponential(2)} rad`,
  );
  check(`circumpolar notes: no visible crossing in the day, and the right side (${notes} notes)`, notes > 0 && badNotes === 0, `${badNotes} wrong`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('§4 TWO PARTS AGREE — the band\'s rows, the day view, and the map\'s lines');
{
  // (a) The band derives its rows from one widened solve; dailySkyEvents solves
  // the civil day alone. Two solves of the same sky from different windows: the
  // same instants, the same notes.
  const s = SCAN_SITES[2];
  let compared = 0;
  let differ = 0;
  let worst = 0;
  for (const r of runs.get(s.name)!) {
    const view = dailySkyEvents(r.start, s.lat, s.lng, BODIES, 'mean', r.end);
    // Both ways: a body the day view has and the band's rows dropped is a
    // difference too, not a row nobody looked at.
    for (const v of view) if (!r.rows.some((x) => x.body === v.body)) differ += 1;
    for (const row of r.rows) {
      const v = view.find((x) => x.body === row.body);
      if (!v || v.circumpolar !== row.circumpolar) {
        differ += 1;
        continue;
      }
      for (const k of ['rise', 'culminate', 'set', 'anticulminate'] as const) {
        if (v[k].length !== row[k].length) {
          differ += 1;
          continue;
        }
        row[k].forEach((x, i) => {
          compared += 1;
          worst = Math.max(worst, Math.abs(x - v[k][i]) * 86400);
        });
      }
    }
  }
  check(
    `${s.name}: the band's rows (widened solve) = dailySkyEvents (the day alone) (${compared} instants)`,
    compared > 5000 && differ === 0 && worst < 0.1,
    `${differ} row(s) differ; worst Δ ${worst.toFixed(4)} s`,
  );

  // (b) The map's own line geometry at the solve's instants: at a geometric rise or
  // set the body's drawn ASC/DSC curve passes through the place, and at a
  // culmination its MC (or IC) meridian does — core's traceHorizonCoords and the
  // celestial RA − sidereal-time mapping, the calls the map draws from. This is
  // the promise a pairing on the geometric instants makes: that it is the map's
  // horizon, not another one.
  let nH = 0;
  let nM = 0;
  let worstH = 0;
  let worstM = 0;
  const misses: string[] = [];
  for (const site of SCAN_SITES) {
    runs.get(site.name)!.forEach((r, i) => {
      if (i % 7 !== 0) return;
      for (const e of r.events) {
        const t = e.kind === 'rise' || e.kind === 'set' ? e.geoJd : e.jd;
        if (t === null) continue;
        const p = exactSample(t, e.body)!;
        const gmst = gmstRadians(t);
        const meridianLng: MeridianLng = (ra) => ((ra - gmst) * 180) / Math.PI;
        if (e.kind === 'culminate' || e.kind === 'anticulminate') {
          nM += 1;
          const drawn = meridianLng(e.kind === 'culminate' ? p.ra : p.ra + Math.PI);
          worstM = Math.max(worstM, Math.abs(normLng(drawn - site.lng)));
          continue;
        }
        nH += 1;
        const coords = traceHorizonCoords(p, meridianLng, e.kind === 'rise' ? 'ASC' : 'DSC');
        // Distance from the place to the drawn polyline, in degrees of arc on a
        // local flat frame — not the longitude miss along the parallel, which blows
        // up where the curve runs nearly east–west (its turning latitude, close to
        // the place at 65°) though the curve passes within metres.
        const k0 = Math.cos(site.lat * D2R);
        const xy = ([lng, lat]: [number, number]) => [normLng(lng - site.lng) * k0, lat - site.lat];
        let d = Infinity;
        for (let k = 1; k < coords.length; k++) {
          const [x0, y0] = xy(coords[k - 1]);
          const [x1, y1] = xy(coords[k]);
          const dx = x1 - x0;
          const dy = y1 - y0;
          if (Math.abs(dx) > 90) continue; // a wrap across the antimeridian, not a segment
          const len2 = dx * dx + dy * dy;
          const f = len2 === 0 ? 0 : Math.min(1, Math.max(0, -(x0 * dx + y0 * dy) / len2));
          d = Math.min(d, Math.hypot(x0 + f * dx, y0 + f * dy));
        }
        worstH = Math.max(worstH, Number.isFinite(d) ? d : 999);
        if (!(d < 0.01) && misses.length < 3) misses.push(`${site.name} ${e.body} ${e.kind} ${utc(t)} off by ${d.toFixed(4)}°`);
      }
    });
  }
  check(
    `every culmination puts the body's MC/IC meridian on the place (${nM} transits)`,
    nM > 1000 && worstM < 1e-6,
    `max Δ ${worstM.toExponential(2)}° of longitude`,
  );
  // The tolerance is the TRACER's: core samples the curve at 1° of hour angle and
  // this measures to the chord between two samples (verify:activations makes the
  // same allowance, along the parallel).
  check(
    `every geometric rise/set puts the body's drawn ASC/DSC curve on the place (${nH} crossings)`,
    nH > 1000 && worstH < 0.01,
    `max distance ${worstH.toFixed(4)}°${misses.length ? ` — ${misses.join('; ')}` : ''}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('§5 GOLDEN — a frozen sky, the Moon\'s horizon, and a named day');
{
  // A frozen sky (a fixed RA and declination for every body): the solve reduces
  // to pure sidereal geometry, and the answers can be written down by hand.
  const frozen =
    (ra: number, dec: number, distance?: number): SkySampler =>
    () => ({ ra, dec, distance });
  const jd0 = msToJD(Date.UTC(2026, 2, 10)); // a UT day; the place is on Greenwich
  const g = site('Greenwich', 51.48, 0);

  // (a) Two culminations in one civil day. A fixed star's day is a sidereal day,
  // 23h56m: put its culmination at 00:01:30 and it culminates again at 23:57:34.
  // Both are listed; neither is moved.
  const ra1 = gmstRadians(jd0 + 1.5 * MIN);
  const rowA = dailySkyEvents(jd0, g.lat, g.lng, ['Mars'], 'mean', jd0 + 1, { sample: frozen(ra1, 0.3) })[0];
  const hm = (jd: number) => DateTime.fromMillis(jdToMs(jd), { zone: 'utc' }).toFormat('HH:mm');
  check(
    'frozen sky: a culmination at 00:01 and its next at 23:57 are both listed',
    !!rowA && rowA.culminate.length === 2 && hm(rowA.culminate[0]) === '00:01' && hm(rowA.culminate[1]) === '23:57',
    rowA ? rowA.culminate.map(hm).join(' · ') : 'no row',
  );

  // (b) The geometric rise of a fixed body is at hour angle −acos(−tan φ tan δ).
  const dec = 0.3;
  const evB = skyEventsBetween(jd0, jd0 + 1, g.lat, g.lng, ['Mars'], 'mean', { sample: frozen(1.0, dec) });
  const rise = evB.find((e) => e.kind === 'rise');
  const want = -Math.acos(-Math.tan(g.lat * D2R) * Math.tan(dec));
  const got = rise?.geoJd != null ? gmstRadians(rise.geoJd) + g.lng * D2R - 1.0 : NaN;
  const dH = Math.abs(Math.atan2(Math.sin(got - want), Math.cos(got - want)));
  check('frozen sky: the geometric rise at H = −acos(−tan φ tan δ)', dH < 1e-9, `Δ ${dH.toExponential(2)} rad`);

  // (c) A body that reaches one horizon and not the other is given the crossing
  // it makes and no other. The Moon's visible horizon is ABOVE the geometric one
  // (+0°07′30″ at her mean distance), a planet's below it (−0°34′). Hold each so
  // its upper culmination peaks between the two.
  const peakDec = (altDeg: number) => (altDeg - (90 - g.lat)) * D2R; // culmination altitude = 90 − φ + δ
  const moonEv = skyEventsBetween(jd0, jd0 + 1, g.lat, g.lng, ['Moon'], 'mean', { sample: frozen(1.0, peakDec(0.06)) });
  const moonRow = skyDayRows(moonEv, ['Moon'], jd0, jd0 + 1)[0];
  const moonX = moonEv.filter((e) => e.kind === 'rise' || e.kind === 'set');
  check(
    'frozen sky: the Moon peaking at +0°04′ crosses the geometric horizon only — no visible rise or set',
    moonX.length >= 2 && moonX.every((e) => e.jd === null && e.geoJd !== null) && moonRow?.circumpolar === 'down',
    `${moonX.length} crossing(s); row note ${moonRow?.circumpolar}`,
  );
  const marsEv = skyEventsBetween(jd0, jd0 + 1, g.lat, g.lng, ['Mars'], 'mean', { sample: frozen(1.0, peakDec(-0.3)) });
  const marsRow = skyDayRows(marsEv, ['Mars'], jd0, jd0 + 1)[0];
  const marsX = marsEv.filter((e) => e.kind === 'rise' || e.kind === 'set');
  check(
    'frozen sky: a planet peaking at −0°18′ crosses the visible horizon only — no geometric instant',
    marsX.length >= 2 && marsX.every((e) => e.jd !== null && e.geoJd === null) && marsRow?.circumpolar === null,
    `${marsX.length} crossing(s)`,
  );
  const deep = skyEventsBetween(jd0, jd0 + 1, g.lat, g.lng, ['Mars'], 'mean', { sample: frozen(1.0, peakDec(-5)) });
  const deepRow = skyDayRows(deep, ['Mars'], jd0, jd0 + 1)[0];
  check(
    'frozen sky: a body that never rises has no crossing at all, and the note says so',
    deep.every((e) => e.kind !== 'rise' && e.kind !== 'set') && deepRow?.circumpolar === 'down' && deepRow.culminate.length >= 1,
    `note ${deepRow?.circumpolar}`,
  );

  // (d) The Moon's standard altitude: 0.7275 π − 0°34′. At her mean distance,
  // 384,400 km (π = 0°57′03″), that is +0°07′30″ — the value a sampler that can't
  // give her distance falls back to.
  for (const [label, distance, wantDeg] of [
    ['her mean distance', 384_400 / 149_597_870.7, 0.125],
    ['perigee, 356,500 km', 356_500 / 149_597_870.7, 0.7275 * Math.asin(6378.14 / 356_500) / D2R - 0.5667],
    ['no distance given', undefined, 0.125],
  ] as const) {
    const ev = skyEventsBetween(jd0, jd0 + 1, g.lat, g.lng, ['Moon'], 'mean', { sample: frozen(1.0, 0.2, distance) });
    const r = ev.find((e) => e.kind === 'rise' && e.jd !== null);
    const alt = r?.jd != null ? altitudeAt(r.jd, 1.0, 0.2, g) / D2R : NaN;
    check(`the Moon rises at ${wantDeg.toFixed(4)}° (${label})`, Math.abs(alt - wantDeg) < 2e-4, `got ${alt.toFixed(5)}°`);
  }

  // (e) 1 January 2026 at 0°, 0°. Before 2026-10-02 the band printed a moonset at
  // 04:55 UT, the previous day's moonset moved forward a sidereal day — the Moon
  // was 15° below the horizon then. The real one is at 03:41 (Swiss's search, the
  // same minute).
  const jan1 = msToJD(Date.UTC(2026, 0, 1));
  const moon = dailySkyEvents(jan1, 0, 0, ['Moon'], 'mean', jan1 + 1)[0];
  const swiss = node.calculateRiseTransitSet(jan1, 1, 2, 0, 0, 0, 2, 1013.25, 10).time as number;
  check(
    '1 Jan 2026 at 0°, 0°: one moonset, at Swiss\'s minute, nothing at 04:55',
    !!moon && moon.set.length === 1 && Math.abs(moon.set[0] - swiss) < MIN && hm(moon.set[0]) !== '04:55',
    moon ? `set ${moon.set.map(hm).join(' · ')}; Swiss ${hm(swiss)}` : 'no row',
  );

  // (f) A graze on a MOVING declination. The sky is frozen in right ascension but
  // its declination runs at 5° a day (the Moon's pace at its fastest), at 72°N.
  // The transit stands 20″ on one side of the visible horizon, and the drift
  // carries the altitude's turn ~11 min past it and ~67″ further — over the
  // horizon and back: a dip below it after a lower transit that stands above, or
  // a rise above it after an upper transit that stands below. Both crossings are
  // owed, and a solve bracketed by the transits finds neither (fixed 2026-10-02).
  // The answer is the closed-form altitude itself, scanned second by second.
  {
    const hi = site('72°N', 72.0, 0);
    const phi = hi.lat * D2R;
    const ra = 1.0;
    const h0 = -0.5667 * D2R; // a planet's visible horizon
    const rate = (5 * D2R) / 1; // radians of declination per day
    for (const [label, H, sign] of [
      ['a dip after a lower transit 20″ above the horizon', Math.PI, -1],
      ['a peak after an upper transit 20″ below it', 0, 1],
    ] as const) {
      // The transit (hour angle H) nearest midday.
      let T = jd0 + 0.5;
      for (let k = 0; k < 4; k++) {
        const dH = Math.atan2(Math.sin(H + ra - gmstRadians(T)), Math.cos(H + ra - gmstRadians(T)));
        T += dH / (TWO_PI * 1.00273790935);
      }
      // Transit altitude: φ + δ − 90° at the lower transit, 90° − φ + δ at the
      // upper; set 20″ above the horizon (lower) or below it (upper).
      const altT = h0 - (sign * 20 * D2R) / 3600;
      const dec0 = H === 0 ? altT - (Math.PI / 2 - phi) : Math.PI / 2 - phi + altT;
      const decAt = (jd: number) => dec0 + sign * rate * (jd - T);
      const sample: SkySampler = (jd) => ({ ra, dec: decAt(jd) });
      const altAt = (jd: number) => {
        const d = decAt(jd);
        const Hh = gmstRadians(jd) + hi.lng * D2R - ra;
        return Math.asin(Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(Hh)) - h0;
      };
      // Expected: every sign change within an hour of the transit, to 0.01 s.
      const want: { kind: 'rise' | 'set'; jd: number }[] = [];
      const SEC = 1 / 86_400;
      let prev = altAt(T - 1 / 24);
      for (let t = T - 1 / 24 + SEC; t <= T + 1 / 24; t += SEC) {
        const cur = altAt(t);
        if (prev > 0 !== cur > 0) {
          let a = t - SEC;
          let b = t;
          for (let k = 0; k < 30; k++) {
            const m = (a + b) / 2;
            if (altAt(m) > 0 === prev > 0) a = m;
            else b = m;
          }
          want.push({ kind: cur > 0 ? 'rise' : 'set', jd: (a + b) / 2 });
        }
        prev = cur;
      }
      const got = skyEventsBetween(T - 1 / 24, T + 1 / 24, hi.lat, hi.lng, ['Mars'], 'mean', { sample }).filter(
        (e) => (e.kind === 'rise' || e.kind === 'set') && e.jd !== null,
      );
      const worst = want.reduce((w, x, i) => Math.max(w, got[i] ? Math.abs((got[i].jd as number) - x.jd) * 86400 : Infinity), 0);
      const sameKinds = got.length === want.length && want.every((x, i) => got[i].kind === x.kind);
      const atT = altAt(T);
      check(
        `frozen RA, moving declination at 72°: ${label} — both crossings, at the closed form's instants`,
        want.length === 2 && sign * atT < 0 && sameKinds && worst < 0.5,
        `transit ${(atT / D2R) * 3600 >= 0 ? '+' : ''}${((atT / D2R) * 3600).toFixed(1)}″; want ${want
          .map((x) => `${x.kind} ${hm(x.jd)}`)
          .join(', ')}; got ${got.map((e) => `${e.kind} ${hm(e.jd as number)}`).join(', ') || 'none'}; worst Δ ${worst.toFixed(2)} s`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('§6 Cost');
{
  const per = solveMs / solveN;
  note(`the band's solve (${BODIES.length} bodies, its day ± 12 h): ${per.toFixed(1)} ms per call over ${solveN} calls`);
  check('cheap enough to recompute on every Time Stamp move', per < 40);
}

// ─────────────────────────────────────────────────────────────────────────────
section('§7 INTERNAL IDENTITY — Slide\'s step walks the same events the band lists');
// nextSkyEvent is what Slide's ⏮ ⏭ call (App stepSlideEvent): stepped from a
// stop, over and over, in either direction, it must land on every displayed
// instant skyEventsBetween gives for the span, in order, and on nothing else. Two
// events within the step's 1 s skip are one stop. From an instant mid-morning,
// so the walk crosses midnight both ways.
{
  const SPAN = 3;
  const SKIP = 1 / 86_400;
  const t0 = msToJD(Date.UTC(2026, 2, 27, 5, 17));
  const t1 = t0 + SPAN;
  const collapse = (xs: number[]) => xs.filter((x, i) => i === 0 || Math.abs(x - xs[i - 1]) > SKIP);
  for (const s of [SCAN_SITES[2], SCAN_SITES[3]]) {
    const ref = skyEventsBetween(t0 - 0.1, t1 + 0.1, s.lat, s.lng, BODIES, 'mean')
      .filter((e) => e.jd !== null)
      .map((e) => e.jd as number)
      .sort((a, b) => a - b);
    const walk = (dir: 1 | -1) => {
      const out: number[] = [];
      let t = dir > 0 ? t0 : t1;
      for (let guard = 0; guard < 1000; guard++) {
        const n = nextSkyEvent(t, dir, s.lat, s.lng, BODIES, 'mean');
        if (n === null || (dir > 0 ? n > t1 : n < t0)) break;
        out.push(n);
        t = n;
      }
      return out;
    };
    for (const dir of [1, -1] as const) {
      const got = walk(dir);
      const want = collapse(
        dir > 0
          ? ref.filter((x) => x > t0 + SKIP && x <= t1)
          : ref.filter((x) => x < t1 - SKIP && x >= t0).reverse(),
      );
      const worst = got.length === want.length ? got.reduce((w, x, i) => Math.max(w, Math.abs(x - want[i]) * 86400), 0) : Infinity;
      check(
        `${s.name}: stepping ${dir > 0 ? 'forward' : 'back'} over ${SPAN} days lands on every listed event and no other (${want.length} events)`,
        want.length > 50 && worst < 0.01,
        `${got.length} steps; worst Δ ${worst.toFixed(4)} s`,
      );
    }
  }
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
