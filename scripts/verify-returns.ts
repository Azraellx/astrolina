// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the RETURNS math of the real src/lib code (run via the harness:
// `npm run verify:returns`; `npm run verify:returns -- --print` also prints the figures
// the outside section is to hold). A return is the transits overlay snapped to the instant
// a luminary comes back to its natal degree (lib/astro/returns findReturn), read as a chart
// of its own: the map framed by that instant's sidereal time, the wheel cast for it at the
// place, the header and the timeline bar naming it.
//
// Each section says which KIND of check it is, because a failure in each means something
// different:
//
//   INTERNAL IDENTITY  (§1) — the root-finder against itself: the body back on its natal
//                        degree, the next/previous/nearest snaps landing on one instant,
//                        the first return after a date being the first. A failure means
//                        the code contradicts itself.
//   TWO PARTS AGREE    (§2) — independent parts of the app asked about the same return at
//                        the same moment: the map's layer and the natal wheel, the map's
//                        frame and the wheel's meridian, the map's line and the wheel
//                        relocated onto it, the header's clock and the timeline bar's. No
//                        formula is restated here; every figure is one the app shows.
//   OUTSIDE AGREEMENT  (§2b, §3) — the app against something it does not compute: the tz
//                        database's own clock for the place (§2b), and Lina's figures (§3,
//                        HELD and empty until she has confirmed what it will hold). A failure
//                        means the app is self-consistent and wrong about the world.
//
// Every set below fails when it is empty: a check over nothing is not a pass.
import { DateTime } from 'luxon';
import { en } from '../src/i18n/en';
import { interpolate, resolvePath } from '../src/i18n/t';
import { makeFormatters } from '../src/i18n/format';
import type { Messages, TFn } from '../src/i18n';
import {
  birthDataToJD,
  bodyLonSpeed,
  directedAngles,
  eclipticToRaDec,
  getEclipticPositions,
  getPlanetPositions,
  gmstRadians,
  initEphemeris,
  obliquity,
  relocate,
  toEclipticPositions,
} from '../src/lib/ephemeris';
import type { PlanetName } from '../src/lib/ephemeris';
import { activeReturnBody, findReturn } from '../src/lib/astro/returns';
import type { ReturnBody, ReturnInstant } from '../src/lib/astro/returns';
import { buildOverlay, jdToEpochMs, normalizeAngle } from '../src/lib/astro/timeline';
import { generateLines, meridianLngFor } from '../src/lib/astro/lines';
import { compositeBodyLon } from '../src/lib/astro/composite';
import { ayanamsaRad } from '../src/lib/astro/ayanamsa';
import { buildComposite } from '../src/lib/astro/relationship';
import { truncZodiac } from '../src/lib/astro/format';
import { castClockAt, chartHeaderModel, lineText } from '../src/lib/chartHeader';
import { formatZoneLabel, timelineZoneAt, wallClockAt } from '../src/lib/atlas/zoneName';
import type { ZoneName } from '../src/lib/atlas/zoneName';
import { SEED_BIRTHS } from '../src/lib/birthData';
import type { StoredChart } from '../src/lib/chartLibrary';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const ARCSEC = DEG2RAD / 3600;
const PRINT = process.argv.includes('--print');

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}
/** One PASS/FAIL line for a whole set: fails when the set is empty, and names the first
 *  few members that broke the rule. */
function every<T>(label: string, items: readonly T[], bad: (x: T) => string | null, note = '') {
  if (items.length === 0) {
    check(label, false, 'empty set — nothing was compared');
    return;
  }
  const broken = items.map(bad).filter((s): s is string => s != null);
  check(`${label} (${items.length})`, broken.length === 0, broken.length ? broken.slice(0, 6).join('; ') : note);
}
/** A set measured against a limit: PASS when every member is under it, and the worst
 *  member is printed either way, so the margin is on record rather than only the verdict. */
function everyUnder<T>(
  label: string,
  items: readonly T[],
  measure: (x: T) => number,
  limit: number,
  show: (v: number) => string,
  name: (x: T) => string,
) {
  if (items.length === 0) {
    check(label, false, 'empty set — nothing was compared');
    return;
  }
  let worst = -Infinity;
  let worstName = '';
  const broken: string[] = [];
  for (const x of items) {
    const v = measure(x);
    if (!(v < limit)) broken.push(`${name(x)}: ${show(v)}`);
    if (!(v <= worst)) {
      worst = v;
      worstName = name(x);
    }
  }
  check(`${label} (${items.length})`, broken.length === 0,
    broken.length ? broken.slice(0, 6).join('; ') : `worst ${show(worst)} (${worstName}), limit ${show(limit)}`);
}

const t = ((key: string, vars?: Record<string, string | number>) =>
  interpolate(resolvePath(en as unknown as Messages, key) ?? key, vars)) as unknown as TFn;
const fmt = makeFormatters('en');
const dAng = (a: number, b: number) => Math.abs(normalizeAngle(a - b));
const asec = (r: number) => `${(r / ARCSEC).toPrecision(3)}″`;
const iso = (ms: number) => new Date(ms).toISOString();
const pad2 = (n: number) => String(n).padStart(2, '0');

await initEphemeris();

// ── Fixtures ────────────────────────────────────────────────────────────────
// Jim Lewis is the chart the app SHIPS (SEED_BIRTHS[0]: Yonkers 40.9312, −73.8988, UTC−4,
// America/New_York since 27 Nov 2026 — so the bar and the header read one clock; a copy saved
// before then has no zone, and §2 discloses what its bar reads). Lina is her own
// fixture, exactly as verify-chart-header H-3 carries it (Toronto, America/Toronto).
// Tokyo, Sydney and the composite only widen §1: east of Greenwich, the southern
// hemisphere, and a chart whose reference is a midpoint rather than a sky.
const JIM: StoredChart = { ...SEED_BIRTHS[0], id: 'seed_0', createdAt: 0 };
const LINA: StoredChart = {
  id: 'c_lina', createdAt: 0, name: 'Lina',
  year: 1963, month: 9, day: 22, hour: 22, minute: 48,
  tzOffset: -4, tzIana: 'America/Toronto',
  birthplace: { label: 'Toronto, Ontario, Canada', lat: 43 + 42 / 60 + 22 / 3600, lng: -(79 + 23 / 60 + 56 / 3600) },
};
const TOKYO: StoredChart = {
  id: 'c_tokyo', createdAt: 0, name: 'Tokyo',
  year: 1990, month: 5, day: 15, hour: 6, minute: 0, tzOffset: 9, tzIana: 'Asia/Tokyo',
  birthplace: { label: 'Tokyo, Japan', lat: 35.68, lng: 139.69 },
};
const SYDNEY: StoredChart = {
  id: 'c_sydney', createdAt: 0, name: 'Sydney',
  year: 1985, month: 1, day: 10, hour: 14, minute: 20, tzOffset: 11, tzIana: 'Australia/Sydney',
  birthplace: { label: 'Sydney, New South Wales, Australia', lat: -33.8688, lng: 151.2093 },
};
// Exactly what App.handleGenerateRelationship stores (verify-chart-header's stamp).
const COMPOSITE: StoredChart = {
  ...buildComposite(JIM, LINA), id: 'c_comp', createdAt: 0, tzIana: 'UTC', tzManual: true, tag: 'space',
};
const PEOPLE = [JIM, LINA, TOKYO, SYDNEY];
const CHARTS = [...PEOPLE, COMPOSITE];
// The zone each birthplace keeps, stated from the world — §2b's outside source, so NOT the
// app's own polygon lookup.
const PLACE_ZONE: Record<string, string> = {
  seed_0: 'America/New_York', c_lina: 'America/Toronto', c_tokyo: 'Asia/Tokyo', c_sydney: 'Australia/Sydney',
};

const BODIES: ReturnBody[] = ['solar', 'lunar'];
const PLANET: Record<ReturnBody, PlanetName> = { solar: 'Sun', lunar: 'Moon' };
// Seeds only, for interval sanity: the gap between successive returns of one body.
const PERIOD_DAYS: Record<ReturnBody, number> = { solar: 365.2422, lunar: 27.321582 };
const GAP_DAYS: Record<ReturnBody, [number, number]> = { solar: [365.15, 365.35], lunar: [26.9, 27.8] };
// The root-finder's own stated tolerance (returns.ts TOL_RAD): it stops when the body is
// within this of its natal degree, so two runs from different seeds can part by twice it.
const ROOT_TOL_RAD = 1e-9;
const ANCHORS = [Date.UTC(1999, 11, 31, 12), Date.UTC(2026, 0, 1), Date.UTC(2026, 10, 1), Date.UTC(2051, 6, 15)];

// The natal degree the return is to: the natal WHEEL's own figure (App's ecliptic,
// getEclipticPositions at the birth JD, node type true as App defaults) — or a composite's
// midpoint, which is what its wheel shows.
const natalLon = (c: StoredChart, body: ReturnBody): number =>
  c.composite
    ? compositeBodyLon(c.composite, PLANET[body], 'mean')!
    : getEclipticPositions(birthDataToJD(c), 'true').find((p) => p.name === PLANET[body])!.lon;
const wheelLonAt = (jd: number, body: ReturnBody): number =>
  getEclipticPositions(jd, 'true').find((p) => p.name === PLANET[body])!.lon;
/** How far apart in time two runs may land and both be within the root tolerance. */
const agreeMs = (jd: number, body: ReturnBody): number => {
  const s = bodyLonSpeed(jd, PLANET[body])!;
  return ((2 * ROOT_TOL_RAD) / (s.speed * DEG2RAD)) * 86_400_000;
};
const raOf = (lon: number, jd: number) => eclipticToRaDec(lon, 0, obliquity(jd)).ra;

type Case = { c: StoredChart; body: ReturnBody; anchor: number; r: ReturnInstant; tag: string };
const cases: Case[] = [];
{
  const missing: string[] = [];
  for (const c of CHARTS) {
    for (const body of BODIES) {
      for (const anchor of ANCHORS) {
        const r = findReturn(c, body, anchor, 1);
        const tag = `${c.name} ${body} after ${iso(anchor).slice(0, 10)}`;
        if (r) cases.push({ c, body, anchor, r, tag });
        else missing.push(tag);
      }
    }
  }
  check(`a return is found for every chart, body and anchor (${cases.length})`,
    missing.length === 0 && cases.length === CHARTS.length * BODIES.length * ANCHORS.length, missing.join('; '));
}

// ── 1. INTERNAL IDENTITY: the root-finder against itself ────────────────────

console.log('\n── 1. INTERNAL IDENTITY: the returning body is back on its degree, and every snap finds one instant ──');

everyUnder('the returning body reads its natal degree on the wheel, within the root tolerance (1e-9 rad)',
  cases, ({ c, body, r }) => dAng(wheelLonAt(r.jd, body), natalLon(c, body)), ROOT_TOL_RAD, asec, (x) => x.tag);

every('the return found after a date is the FIRST after it: the one before it falls before the date', cases, ({ c, body, anchor, r, tag }) => {
  const prev = findReturn(c, body, r.ms, -1);
  return r.ms > anchor && prev && prev.ms < anchor ? null : `${tag}: prev ${prev ? iso(prev.ms) : 'none'}, found ${iso(r.ms)}`;
});

every('› from 2 s before, ‹ from 2 s after and the nearest from a quarter-period either side land on one instant', cases, ({ c, body, r, tag }) => {
  const q = (PERIOD_DAYS[body] / 4) * 86_400_000;
  const tol = agreeMs(r.jd, body);
  const runs: [string, ReturnInstant | null][] = [
    ['› −2 s', findReturn(c, body, r.ms - 2000, 1)],
    ['‹ +2 s', findReturn(c, body, r.ms + 2000, -1)],
    ['nearest −¼', findReturn(c, body, r.ms - q, 0)],
    ['nearest +¼', findReturn(c, body, r.ms + q, 0)],
  ];
  const off = runs.find(([, x]) => !x || Math.abs(x.ms - r.ms) > tol);
  return off ? `${tag}: ${off[0]} → ${off[1] ? `${(off[1].ms - r.ms).toFixed(3)} ms` : 'none'} (allowed ${tol.toFixed(3)} ms)` : null;
});

every('a repeated press walks on: › from the return is the next one, a period on, and ‹ from that is this one again', cases, ({ c, body, r, tag }) => {
  const next = findReturn(c, body, r.ms, 1);
  if (!next) return `${tag}: no next`;
  const gap = (next.ms - r.ms) / 86_400_000;
  const [lo, hi] = GAP_DAYS[body];
  const back = findReturn(c, body, next.ms, -1);
  if (gap < lo || gap > hi) return `${tag}: gap ${gap.toFixed(4)} d`;
  return back && Math.abs(back.ms - r.ms) <= agreeMs(r.jd, body) ? null : `${tag}: back ${back ? (back.ms - r.ms).toFixed(3) : 'none'} ms`;
}, `gaps within ${GAP_DAYS.solar.join('–')} d (solar), ${GAP_DAYS.lunar.join('–')} d (lunar)`);

// returns.ts: "The one-second slack keeps a repeated press from re-finding the same instant."
// So a date within a second of a return counts as AT it, and a press moves on from it.
every('within the one-second slack a press moves on: › from 0.5 s before and ‹ from 0.5 s after skip this return', cases, ({ c, body, r, tag }) => {
  const half = (PERIOD_DAYS[body] / 2) * 86_400_000;
  const fwd = findReturn(c, body, r.ms - 500, 1);
  const bwd = findReturn(c, body, r.ms + 500, -1);
  return fwd && bwd && fwd.ms > r.ms + half && bwd.ms < r.ms - half ? null : `${tag}: › ${fwd ? iso(fwd.ms) : 'none'}, ‹ ${bwd ? iso(bwd.ms) : 'none'}`;
});

// Try to move it. The instant has two inputs the reader can move — the date the snap starts
// from and the chart — and no setting (findReturn takes none: zodiac, houses, node, line
// system and frame never reach it). Moving the start date anywhere between two returns must
// not move the one › finds; recording the chart's zone moves the bar's clock (§2) and must not
// move the instant either. And the positive control, so neither of those can pass because
// nothing moves at all: the birth minute DOES move it, by about a minute.
every('moving the date › starts from anywhere between the previous return and this one never moves what it finds (12 starts each)', cases, ({ c, body, r, tag }) => {
  const prev = findReturn(c, body, r.ms, -1);
  if (!prev) return `${tag}: no previous`;
  const lo = prev.ms + 2000;
  const span = r.ms - 2000 - lo;
  for (let k = 0; k <= 11; k++) {
    const from = lo + (span * k) / 11;
    const x = findReturn(c, body, from, 1);
    if (!x || Math.abs(x.ms - r.ms) > agreeMs(r.jd, body)) return `${tag}: from ${iso(from)} → ${x ? iso(x.ms) : 'none'}`;
  }
  return null;
});
every('recording the chart\'s zone (or removing it) never moves the instant', cases.filter((x) => !x.c.composite), ({ c, body, anchor, r, tag }) => {
  const other = findReturn({ ...c, tzIana: c.tzIana ? undefined : PLACE_ZONE[c.id] }, body, anchor, 1);
  return other && other.ms === r.ms ? null : `${tag}: ${other ? `${other.ms - r.ms} ms` : 'none'}`;
});
// Control: a minute later at birth, the return about a minute later — exactly the ratio of the
// body's speed at birth to its speed at the return, so near 1 for the Sun (same season) and
// anywhere in the Moon's 11.8–15.4°/day range for the Moon.
every('…while a minute later at birth moves the return later, by about a minute', cases.filter((x) => !x.c.composite), ({ c, body, anchor, r, tag }) => {
  const moved = findReturn({ ...c, minute: c.minute + 1 }, body, anchor, 1);
  if (!moved) return `${tag}: none`;
  const shiftMin = (moved.ms - r.ms) / 60_000;
  const [lo, hi] = body === 'solar' ? [0.98, 1.02] : [0.75, 1.32];
  return shiftMin > lo && shiftMin < hi ? null : `${tag}: moved ${shiftMin.toFixed(4)} min`;
});

// activeReturnBody is the one predicate behind the bar's Returns highlight, the wheel's
// title and the header's "SOLAR RETURN": a minute of slack, both sides.
every('the instant IS the return (bar, wheel and header), and still is ±59 s off it, and is not ±61 s off it', cases, ({ c, body, r, tag }) => {
  const at = (d: number) => activeReturnBody(c, r.ms + d);
  const got = [at(0), at(-59_000), at(59_000), at(-61_000), at(61_000)];
  const want = [body, body, body, null, null];
  return got.every((g, i) => g === want[i]) ? null : `${tag}: ${got.join(', ')}`;
});

// ── 2. TWO PARTS AGREE: the map, the wheel, the header and the bar at the snapped instant ──

console.log('\n── 2. TWO PARTS AGREE: what the map draws, the wheel shows and the header and bar say, at the return ──');

// What App draws once snapped: the transits overlay at the target date the snap set, in the
// moment's own frame (the borrow), node type true and every other option at its default.
const layerOf = (c: StoredChart, ms: number, frame: 'transit-moment' | 'relative-to-natal' = 'transit-moment') =>
  buildOverlay(c, 'transits', ms, null, 'true', 'mean-quotidian', 'ptolemy', 1, frame, 'secondary', t)!;
// App's overlayAngles for a chart in force, no point chosen: relocate at the layer's angle
// moment, then directedAngles with the layer's arc (none, for transits).
const wheelAngles = (c: StoredChart, layer: ReturnType<typeof layerOf>, lat = c.birthplace.lat, lng = c.birthplace.lng) => {
  const angleJd = layer.angleJd ?? layer.jd;
  return directedAngles(relocate(angleJd, lat, lng, 'placidus'), angleJd, lat, lng, 'placidus', layer.angleArc, layer.angleFrame);
};
const people = cases.filter((x) => !x.c.composite);

everyUnder('the map\'s layer is cast at the snapped instant (target date in ms, back to a JD)', people,
  ({ c, r }) => Math.abs(jdToEpochMs(layerOf(c, r.ms).jd) - r.ms), 1, (v) => `${(v * 1000).toFixed(1)} µs`, (x) => x.tag);

everyUnder('the return ring\'s body (the map layer\'s equatorial sample) reads the natal wheel\'s degree', people,
  ({ c, body, r }) => {
    const layer = layerOf(c, r.ms);
    const ring = toEclipticPositions(layer.positions, layer.jd).find((p) => p.name === PLANET[body])!;
    return dAng(ring.lon, natalLon(c, body));
  }, 0.001 * ARCSEC, asec, (x) => x.tag);

everyUnder('the wheel\'s meridian at the birthplace is the map\'s frame: RA of the wheel\'s MC = the layer\'s sidereal time + longitude', people,
  ({ c, r }) => {
    const layer = layerOf(c, r.ms);
    if (layer.angleArc !== undefined || layer.angleFrame !== undefined) return Infinity; // a transit wheel is never directed
    return dAng(raOf(wheelAngles(c, layer).mc, layer.jd), layer.gmst + c.birthplace.lng * DEG2RAD);
  }, 0.001 * ARCSEC, asec, (x) => x.tag);

// The claim a return's map makes: go to the returning body's MC line and the return chart
// cast there has that body on its meridian. The line is the map's own (generateLines over
// the layer, In Mundo as by default); the wheel is relocated onto it.
const mcLineLng = (positions: ReturnType<typeof getPlanetPositions>, gmst: number, jd: number, name: PlanetName): number | null => {
  const f = generateLines(positions, meridianLngFor('celestial', obliquity(jd), gmst))
    .features.find((x) => x.properties.planet === name && x.properties.lineType === 'MC');
  if (!f || f.geometry.coordinates.length === 0) return null;
  const lng = f.geometry.coordinates[0][0];
  return f.geometry.coordinates.every(([x]) => x === lng) ? lng : null;
};
everyUnder('the wheel relocated onto the map\'s MC line of the returning body has that body on its meridian (RA)', people,
  ({ c, body, r }) => {
    const layer = layerOf(c, r.ms);
    const lng = mcLineLng(layer.positions, layer.gmst, layer.jd, PLANET[body]);
    if (lng === null) return Infinity;
    const p = layer.positions.find((q) => q.name === PLANET[body])!;
    return dAng(raOf(wheelAngles(c, layer, c.birthplace.lat, lng).mc, layer.jd), p.ra);
  }, 0.001 * ARCSEC, asec, (x) => x.tag);
// The Sun keeps to the ecliptic (latitude under ~1″), so on its line the wheel's MC is its
// natal degree too — the return chart's Midheaven on the returning Sun.
everyUnder('…and for a solar return that MC reads the natal Sun\'s degree (the Sun\'s latitude is the only gap)',
  people.filter((x) => x.body === 'solar'),
  ({ c, r }) => {
    const layer = layerOf(c, r.ms);
    const lng = mcLineLng(layer.positions, layer.gmst, layer.jd, 'Sun');
    return lng === null ? Infinity : dAng(wheelAngles(c, layer, c.birthplace.lat, lng).mc, natalLon(c, 'solar'));
  }, 2 * ARCSEC, asec, (x) => x.tag);

// Why the snap borrows the moment's frame (App snapToReturn; methods page, Returns ▸ Frame):
// in the natal frame the returning Sun is pinned to its birth degree by construction, so its
// line sits on the natal Sun's line whatever year you walk to. Natal map: the natal positions
// framed by the natal sidereal time, as App draws them.
everyUnder('in the natal frame (the stored default the borrow masks) the return Sun\'s MC line sits on the natal Sun\'s',
  people.filter((x) => x.body === 'solar'),
  ({ c, r }) => {
    const bjd = birthDataToJD(c);
    const natal = mcLineLng(getPlanetPositions(bjd, 'true'), gmstRadians(bjd), bjd, 'Sun');
    const L = layerOf(c, r.ms, 'relative-to-natal');
    const ret = mcLineLng(L.positions, L.gmst, L.jd, 'Sun');
    return natal === null || ret === null ? Infinity : dAng(ret * DEG2RAD, natal * DEG2RAD);
  }, 60 * ARCSEC, asec, (x) => x.tag);

// The header (chart statement) as App builds it for a snapped return: the overlay at the
// target date, the return named by the same predicate as the bar, no point chosen.
const headerFor = (c: StoredChart, ms: number) =>
  chartHeaderModel({
    chart: c, point: null, pointLabel: null, isNatalPin: false, lineSystem: 'celestial',
    overlay: { kind: 'transits', ms, promoted: true, returnBody: activeReturnBody(c, ms) },
    noChart: false, houses: { system: 'placidus' }, zodiac: 'tropical', nodeType: 'true', discreet: false, t, fmt,
  });
const momentText = (c: StoredChart, ms: number) =>
  headerFor(c, ms).lines.filter((l) => l.role === 'overlay-moment').map(lineText).join(' | ');
every('the header titles the wheel as the return (state, and the year where it names one)', people, ({ c, body, r, tag }) => {
  const m = headerFor(c, r.ms);
  const year = castClockAt(r.ms, c.birthplace.lat, c.birthplace.lng).wall.year;
  const want = body === 'solar' ? `SOLAR RETURN ${year}` : 'LUNAR RETURN';
  return m.state === 'return' && m.labelParts[0] === want ? null : `${tag}: ${m.state} ${m.labelParts.join(' · ')}`;
});

// The header reads the cast place's clock (castClockAt); the bar reads the chart's own zone
// (timelineZoneAt). For a chart with its zone recorded they are one clock, and must say so.
const barClock = (c: StoredChart, ms: number) => {
  const z = timelineZoneAt(c, ms);
  const w = wallClockAt(ms, z);
  return { z, w, text: `${pad2(w.hour)}:${pad2(w.minute)} ${formatZoneLabel(z)}` };
};
every('for a chart with its zone recorded, the header\'s clock and the timeline bar\'s are one clock',
  people.filter((x) => !!x.c.tzIana), ({ c, r, tag }) => {
    const bar = barClock(c, r.ms);
    const text = momentText(c, r.ms);
    const date = fmt.dateWithWeekday(bar.w.year, bar.w.month, bar.w.day);
    return text.includes(date) && text.includes(bar.text) ? null : `${tag}: header "${text}", bar "${date} ${bar.text}"`;
  });
// A chart with no zone recorded is the exception the bar documents (TimelineHud: "only a
// zone-less legacy chart falls back to its fixed offset"): the bar then reads the stored offset
// all year, while the header reads the birthplace's live clock. The shipped Jim Lewis was one
// until 27 Nov 2026, and every copy saved before then still is, so his chart is read here with
// its zone taken off, as such a copy holds it. Not a check — a disclosure, printed whenever the
// two disagree.
const zoneless = people.map((x) =>
  x.c.id === JIM.id ? { ...x, c: { ...x.c, tzIana: undefined }, tag: `${x.tag} (a copy saved before 27 Nov 2026)` } : x,
);
for (const { c, r, tag } of zoneless.filter((x) => !x.c.tzIana)) {
  const bar = barClock(c, r.ms);
  const head = castClockAt(r.ms, c.birthplace.lat, c.birthplace.lng);
  if (bar.z.seconds !== head.zone.seconds) {
    console.log(`NOTE  ${tag}: the bar reads ${bar.text}, the header ${pad2(head.wall.hour)}:${pad2(head.wall.minute)} ${formatZoneLabel(head.zone)} — the chart records no zone`);
  }
}

// ── 2b. OUTSIDE AGREEMENT: the header's clock against the tz database ───────────

console.log('\n── 2b. OUTSIDE AGREEMENT: the header\'s clock for the return, against the tz database (luxon) ──');

// The header's moment line for the return against the zone the place keeps, read from the tz
// database as the host has it: the date, the minute and the offset. (The app picks the zone
// from the place by its own polygon lookup and names it from its own catalogue; neither is
// used here.)
every('the header gives the return\'s date, minute and offset as the birthplace\'s own clock', people, ({ c, r, tag }) => {
  const dt = DateTime.fromMillis(r.ms, { zone: PLACE_ZONE[c.id] });
  const head = castClockAt(r.ms, c.birthplace.lat, c.birthplace.lng);
  const text = momentText(c, r.ms);
  const ok =
    head.zone.seconds === dt.offset * 60 &&
    text.includes(fmt.dateWithWeekday(dt.year, dt.month, dt.day)) &&
    text.includes(`${dt.toFormat('HH:mm')} ${formatZoneLabel(head.zone)}`);
  return ok ? null : `${tag}: header "${text}" (${head.zone.seconds} s), tz database ${dt.toFormat('yyyy-MM-dd HH:mm ZZ')}`;
});
// Where the tz database itself has a letter abbreviation for the zone (North America), the
// header's must be it.
every('…and names the zone as the tz database does, where it has a letter abbreviation', people.filter((x) => {
  const n = DateTime.fromMillis(x.r.ms, { zone: PLACE_ZONE[x.c.id] }).setLocale('en-US').offsetNameShort ?? '';
  return /^[A-Z]{3,4}$/.test(n);
}), ({ c, r, tag }) => {
  const n = DateTime.fromMillis(r.ms, { zone: PLACE_ZONE[c.id] }).setLocale('en-US').offsetNameShort;
  const z = castClockAt(r.ms, c.birthplace.lat, c.birthplace.lng).zone;
  return z.abbr === n ? null : `${tag}: header ${z.abbr ?? '(none)'}, tz database ${n}`;
});

// ── 3. OUTSIDE AGREEMENT: Lina's figures — HELD, EMPTY ──────────────────────────────
// The same KIND as verify-directions §8b/§8c: agreement with figures worked independently of
// this code, so a failure here means the app is self-consistent and wrong. It holds NO figures
// yet, by her rule: "before the figures are fixed into the check, send me what it will hold".
// The app's own outputs (`--print`) went to her for that; they are not her figures and must
// never be pasted in as if they were. Fill LINA_RETURNS only from her confirmed reply, citing
// its item code and date.
//
// Planned tolerances, to be confirmed with the figures:
//  · angles — 1.5′ around her figure truncated to the minute, as §8b: dAng(got, want + TOL/3)
//    < TOL. Two truncations of one value can part by a minute at a boundary (`--print` flags
//    every angle within 10″ of one, with what that is worth in time).
//  · the instant — within INSTANT_TOL_S of her UT figure (her clock to the second, truncated,
//    compared as want + 0.5 s). Not tighter: a different ΔT extrapolation moves the UT
//    instant of a 2026 return by about a second whatever the body, and an ephemeris
//    difference of 0.1″ in the Sun moves a solar return by ~2.4 s (the Moon, ~13× faster, by
//    ~0.2 s). If she gives the clock to the minute only, her minute must contain the instant,
//    ±1 minute at a boundary.
//  · the two are coupled: at these returns every angle turns 11–16″ per second of the
//    instant (`--print` gives the rate for each), so the angle window above absorbs about two
//    seconds of disagreement in the instant. Her angles are compared at OUR instant, because
//    that is what the app shows; an angle failing alongside an instant that is off is the
//    instant's failure seen twice, not a second finding.
{
  const TOL = (1.5 / 60) * DEG2RAD;
  const INSTANT_TOL_S = 3;
  type LinaReturn = {
    code: string; // her item code, e.g. RT-1
    chart: StoredChart;
    body: ReturnBody;
    after: number; // epoch ms: the return is the first one after this
    utMs: number; // her UT instant, to the second as she gives it (truncated)
    asc: number; // radians, her figure truncated to the minute
    mc: number;
  };
  const LINA_RETURNS: LinaReturn[] = [];
  if (LINA_RETURNS.length === 0) {
    console.log('\n── 3. OUTSIDE AGREEMENT: Lina\'s figures ──');
    console.log('HELD  no figures until Lina has confirmed the ones `--print` gives (her rule); nothing here is counted as a pass');
  } else {
    console.log('\n── 3. OUTSIDE AGREEMENT: Lina\'s figures ──');
    for (const w of LINA_RETURNS) {
      const r = findReturn(w.chart, w.body, w.after, 1);
      if (!r) {
        check(`${w.code} ${w.chart.name} ${w.body}: a return is found`, false);
        continue;
      }
      check(`${w.code} ${w.chart.name} ${w.body}: instant within ${INSTANT_TOL_S} s of hers`,
        Math.abs(r.ms - (w.utMs + 500)) < INSTANT_TOL_S * 1000, `Δ ${((r.ms - w.utMs) / 1000).toFixed(2)} s from her truncated second`);
      const a = wheelAngles(w.chart, layerOf(w.chart, r.ms));
      check(`${w.code} ${w.chart.name} ${w.body}: ASC`, dAng(a.asc, w.asc + TOL / 3) < TOL, `Δ ${(normalizeAngle(a.asc - w.asc) * RAD2DEG * 60).toFixed(2)}′`);
      check(`${w.code} ${w.chart.name} ${w.body}: MC`, dAng(a.mc, w.mc + TOL / 3) < TOL, `Δ ${(normalizeAngle(a.mc - w.mc) * RAD2DEG * 60).toFixed(2)}′`);
    }
  }
}

// ── --print: the figures §3 is to hold, for her to confirm first ─────────────────────

if (PRINT) {
  const SIGNS = ['Ari', 'Tau', 'Gem', 'Can', 'Leo', 'Vir', 'Lib', 'Sco', 'Sag', 'Cap', 'Aqu', 'Pis'];
  /** The app's own truncations (truncZodiac) to the second and to the minute the wheel
   *  prints, and whether the figure is within 10″ of a minute boundary. */
  const zod = (r: number) => {
    const s = truncZodiac(r, 'sec');
    const m = truncZodiac(r, 'min');
    const arcsec = ((((r * RAD2DEG) % 360) + 360) % 360) * 3600;
    const sec = arcsec - Math.floor(arcsec / 60) * 60; // seconds into the minute, untruncated
    const next = m.min === 59 ? `${m.deg + 1}°00'` : `${m.deg}°${pad2(m.min + 1)}'`;
    const edge = sec < 10 ? `EDGE ${sec.toFixed(1)}″ past ${m.text}` : sec > 50 ? `EDGE ${(60 - sec).toFixed(1)}″ short of ${next}` : '';
    return { text: `${s.text} ${SIGNS[s.signIdx]}`, app: `${m.text} ${SIGNS[m.signIdx]}`, edge, margin: Math.min(sec, 60 - sec) };
  };
  /** An edge flag with what it is worth in time: the shift of the instant that flips the minute. */
  const edgeIn = (z: ReturnType<typeof zod>, arcsecPerSec: number) =>
    z.edge ? ` — ${z.edge}, ${(z.margin / Math.abs(arcsecPerSec)).toFixed(2)} s of the instant` : '';
  const raText = (r: number) => {
    const deg = (((r * RAD2DEG) % 360) + 360) % 360;
    const as = deg * 3600;
    const d = Math.floor(as / 3600);
    const m = Math.floor((as - d * 3600) / 60);
    const s = as - d * 3600 - m * 60;
    const hs = (deg / 15) * 3600;
    const h = Math.floor(hs / 3600);
    const hm = Math.floor((hs - h * 3600) / 60);
    const hsec = hs - h * 3600 - hm * 60;
    return `${d}°${pad2(m)}′${pad2(Math.floor(s))}″ (${h}h${pad2(hm)}m${pad2(Math.floor(hsec))}s)`;
  };
  const clockSec = (ms: number, z: ZoneName) => {
    const w = wallClockAt(ms, z);
    return `${pad2(w.hour)}:${pad2(w.minute)}:${pad2(w.second)} ${formatZoneLabel(z)}`;
  };
  const row = (c: StoredChart, body: ReturnBody, r: ReturnInstant) => {
    const head = castClockAt(r.ms, c.birthplace.lat, c.birthplace.lng);
    const w = head.wall;
    const ms = ((r.ms % 60_000) + 60_000) % 60_000; // into the minute, UT and zone alike (whole-minute offsets)
    const clockEdge = ms < 2000 ? `EDGE ${(ms / 1000).toFixed(2)} s past the minute` : ms > 58_000 ? `EDGE ${((60_000 - ms) / 1000).toFixed(2)} s short of the minute` : '';
    const layer = layerOf(c, r.ms);
    const a = wheelAngles(c, layer);
    const asc = zod(a.asc);
    const mc = zod(a.mc);
    const bar = barClock(c, r.ms);
    const sid = (ayanamsaRad(r.jd, 'lahiri') - ayanamsaRad(birthDataToJD(c), 'lahiri')) * RAD2DEG * 60;
    // How far each angle moves per second of the instant: what couples §3's two tolerances.
    const sec = 1 / 86_400;
    const lo = relocate(r.jd - sec, c.birthplace.lat, c.birthplace.lng, 'placidus');
    const hi = relocate(r.jd + sec, c.birthplace.lat, c.birthplace.lng, 'placidus');
    const ascRate = normalizeAngle(hi.asc - lo.asc) / 2 / ARCSEC;
    const mcRate = normalizeAngle(hi.mc - lo.mc) / 2 / ARCSEC;
    const perSec = `ASC ${ascRate.toFixed(1)}″, MC ${mcRate.toFixed(1)}″`;
    return {
      what: body === 'solar' ? `Solar return ${w.year}` : `Lunar return`,
      date: fmt.dateWithWeekday(w.year, w.month, w.day),
      ut: iso(r.ms).replace('T', ' ').replace('Z', ' UT'),
      clock: clockSec(r.ms, head.zone),
      clockEdge,
      header: momentText(c, r.ms),
      bar: `${fmt.date(bar.w.year, bar.w.month, bar.w.day, 'medium')}, ${pad2(bar.w.hour)}:${pad2(bar.w.minute)} ${bar.z.abbr ?? bar.z.iso}`,
      asc: `${asc.text} (app ${asc.app})${edgeIn(asc, ascRate)}`,
      mc: `${mc.text} (app ${mc.app})${edgeIn(mc, mcRate)}`,
      mcRA: raText(raOf(a.mc, r.jd)),
      sidereal: `${sid.toFixed(1)}′`,
      perSec,
      r,
    };
  };
  const out: string[] = [];
  out.push('', '## Figures (`npm run verify:returns -- --print`)', '');
  out.push('Default settings: Placidus, tropical, true node, transits in the moment\'s frame (the returns borrow), angles at the birthplace.', '');
  for (const c of [JIM, LINA]) {
    const bjd = birthDataToJD(c);
    const sun = zod(natalLon(c, 'solar'));
    const moon = zod(natalLon(c, 'lunar'));
    out.push(`### ${c.name}`, '');
    out.push(`Fixture: ${c.year}-${pad2(c.month)}-${pad2(c.day)} ${pad2(c.hour)}:${pad2(c.minute)} (UTC${c.tzOffset < 0 ? '−' : '+'}${pad2(Math.abs(c.tzOffset))}:00), ${c.birthplace.label}, ${c.birthplace.lat.toFixed(6)}, ${c.birthplace.lng.toFixed(6)}, tzIana ${c.tzIana ?? '(none)'}. Birth JD ${bjd.toFixed(6)} UT.`);
    out.push(`Natal Sun ${sun.text}, natal Moon ${moon.text} (the degrees the returns come back to).`, '');
    const sr = findReturn(c, 'solar', Date.UTC(2026, 0, 1), 1)!;
    // The lunar return after 1 Nov 2026, from 00:00 at the place and from 00:00 UT.
    const localMidnight = DateTime.fromObject({ year: 2026, month: 11, day: 1 }, { zone: PLACE_ZONE[c.id] }).toMillis();
    const utMidnight = Date.UTC(2026, 10, 1);
    const lrLocal = findReturn(c, 'lunar', localMidnight, 1)!;
    const lrUt = findReturn(c, 'lunar', utMidnight, 1)!;
    const rows = [row(c, 'solar', sr), row(c, 'lunar', lrLocal)];
    out.push('| | ' + rows.map((x) => x.what).join(' | ') + ' |');
    out.push('|---|' + rows.map(() => '---').join('|') + '|');
    const line = (k: string, f: (x: (typeof rows)[number]) => string) => out.push(`| ${k} | ${rows.map(f).join(' | ')} |`);
    line('Date (place)', (x) => x.date);
    line('Instant, UT (ms)', (x) => x.ut);
    line('Clock at the birthplace, to the second', (x) => x.clock + (x.clockEdge ? ` — ${x.clockEdge}` : ''));
    line('Header shows', (x) => x.header);
    line('Timeline bar shows', (x) => x.bar);
    line('ASC (Placidus, birthplace)', (x) => x.asc);
    line('MC', (x) => x.mc);
    line('RA of the MC (RAMC)', (x) => x.mcRA);
    line('Angle motion per second of the instant', (x) => x.perSec);
    line('Lahiri: precession since birth (return ring vs natal)', (x) => x.sidereal);
    if (c === JIM) {
      // verify-directions §8b/§8c carry Yonkers as Lina's DMS, 40°55′52″N 73°53′56″W (0.3″
      // from the seed's decimals); whether that moves a truncated figure.
      const dms = { lat: 40 + 55 / 60 + 52 / 3600, lng: -(73 + 53 / 60 + 56 / 3600) };
      line('ASC / MC at 40°55′52″N 73°53′56″W (§8b\'s Yonkers)', (x) => {
        const a = relocate(x.r.jd, dms.lat, dms.lng, 'placidus');
        return `${zod(a.asc).text} / ${zod(a.mc).text}`;
      });
      // The same chart as a copy saved before 27 Nov 2026 holds it: no zone recorded.
      line('Timeline bar on a copy saved before 27 Nov 2026 (no zone recorded)', (x) => {
        const b = barClock({ ...c, tzIana: undefined }, x.r.ms);
        return `${fmt.date(b.w.year, b.w.month, b.w.day, 'medium')}, ${pad2(b.w.hour)}:${pad2(b.w.minute)} ${b.z.abbr ?? b.z.iso}`;
      });
    }
    out.push('');
    const gap = lrLocal.ms - lrUt.ms;
    out.push(`Lunar return anchors: from 00:00 at the place (${iso(localMidnight)}) → ${iso(lrLocal.ms)}; from 00:00 UT (${iso(utMidnight)}) → ${iso(lrUt.ms)}; ${Math.abs(gap) <= agreeMs(lrUt.jd, 'lunar') ? `the same instant (the two runs part by ${gap.toFixed(3)} ms, inside the root tolerance)` : `DIFFER by ${(gap / 1000).toFixed(3)} s`}.`, '');
  }
  console.log(out.join('\n'));
}

console.log(failures === 0 ? '\nverify-returns: ALL PASS (§3 held: no outside figures yet)' : `\nverify-returns: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
