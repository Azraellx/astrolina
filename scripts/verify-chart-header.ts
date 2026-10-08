// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the chart's statement (src/lib/chartHeader.ts) — the state label and the
// lines the sidebar header, the wheel's corner and the Dual layout's second header all
// render (Lina's chart-header spec, 2026-10-06; built 2026-10-07) — running the REAL
// src/lib code through the harness (`node scripts/harness/run.mjs
// scripts/verify-chart-header.ts`; it needs the ephemeris, which buildDavison and
// buildComposite read).
//
// Each section says which KIND of check it is, because a failure in each means
// something different:
//
//   OUTSIDE AGREEMENT  — the model against something it does not compute: the tz
//                        database's own clock at a place (luxon), the coordinate
//                        formatter's own output. A failure means the header is
//                        self-consistent and wrong about the world.
//   GOLDEN             — Lina's spec examples, written out by hand.
//   INTERNAL IDENTITY  — the model agrees with itself and with the rules it states:
//                        the precedence, the moment that does not move with a pin,
//                        the composite that has no moment. A failure means the code
//                        contradicts itself.
//
// Every loop below fails on an empty set: a check over nothing is not a pass.

import { DateTime } from 'luxon';
import { en } from '../src/i18n/en';
import { interpolate, resolvePath } from '../src/i18n/t';
import { makeFormatters } from '../src/i18n/format';
import type { Messages, TFn } from '../src/i18n';
import {
  castZoneAt,
  chartHeaderModel,
  davisonParents,
  lineText,
  type ChartHeaderInput,
  type ChartHeaderModel,
  type HeaderLine,
  type HeaderOverlay,
  type Segment,
} from '../src/lib/chartHeader';
import {
  formatZoneClock,
  formatZoneLabel,
  placeZoneAt,
  utName,
  wallClockAt,
  zoneNameForChart,
} from '../src/lib/atlas/zoneName';
import { getIanaTimezone } from '../src/lib/atlas/timezone';
import { fmtCoordPair, fmtCoordPairDM } from '../src/lib/coordFormat';
import { MASK_DATE, MASK_TIME, maskName } from '../src/lib/discreet';
import { buildComposite, buildDavison } from '../src/lib/astro/relationship';
import { NAME_HARD_LIMIT, NOTES_HARD_LIMIT, type StoredChart } from '../src/lib/chartLibrary';
import type { TzEntry } from '../src/lib/atlas/zoneEntry';
import { initEphemeris } from '../src/lib/ephemeris';

await initEphemeris();

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

const t = ((key: string, vars?: Record<string, string | number>) =>
  interpolate(resolvePath(en as unknown as Messages, key) ?? key, vars)) as unknown as TFn;
const fmt = makeFormatters('en');
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const label = (m: ChartHeaderModel) => m.labelParts.join(' · ');
const texts = (m: { lines: HeaderLine[] }) => m.lines.map(lineText);
const byRole = (m: { lines: HeaderLine[] }, role: HeaderLine['role']) =>
  m.lines.filter((l) => l.role === role);
const segOf = (l: HeaderLine | undefined, kind: Segment['kind']) =>
  l?.segs.find((s) => s.kind === kind);

// ── Fixtures ────────────────────────────────────────────────────────────────

const JIM: StoredChart = {
  id: 'c_jim',
  createdAt: 0,
  name: 'Jim Lewis',
  year: 1941,
  month: 6,
  day: 5,
  hour: 9,
  minute: 30,
  tzOffset: -4,
  tzIana: 'America/New_York',
  birthplace: { label: 'Yonkers, New York, United States', lat: 40.9312, lng: -73.8988 },
  sourceRating: 'AA',
};
const SHAE: StoredChart = {
  id: 'c_shae',
  createdAt: 0,
  name: 'Shae',
  year: 1972,
  month: 11,
  day: 12,
  hour: 14,
  minute: 20,
  tzOffset: -6,
  tzIana: 'America/Chicago',
  birthplace: { label: 'Saint Paul, Minnesota, United States', lat: 44.9542, lng: -93.0894 },
};
const TORONTO = { lat: 43.6532, lng: -79.3832, label: 'Toronto, Ontario, Canada' };
// 1 Aug 2026, 16:13 UT = 12:13 EDT — Lina's transits example.
const AUG1 = Date.UTC(2026, 7, 1, 16, 13);

const stamp = (b: Omit<StoredChart, 'id' | 'createdAt'>, id: string): StoredChart => ({
  ...b,
  id,
  createdAt: 0,
  tzIana: 'UTC',
  tzManual: true,
  tag: 'space',
});
// Exactly what App.handleGenerateRelationship stores.
const DAVISON = stamp(buildDavison(JIM, SHAE), 'c_dav');
const COMPOSITE = stamp(buildComposite(JIM, SHAE), 'c_comp');

const base = (over: Partial<ChartHeaderInput> = {}): ChartHeaderInput => ({
  chart: JIM,
  point: null,
  pointLabel: null,
  isNatalPin: false,
  lineSystem: 'celestial',
  overlay: null,
  noChart: false,
  houses: { system: 'whole', fallback: false },
  zodiac: 'tropical',
  nodeType: 'true',
  discreet: false,
  t,
  fmt,
  ...over,
});
const pinAt = (p: { lat: number; lng: number; label: string }): Partial<ChartHeaderInput> => ({
  point: { lat: p.lat, lng: p.lng },
  pointLabel: p.label,
});
const ov = (kind: HeaderOverlay['kind'], over: Partial<HeaderOverlay> = {}): HeaderOverlay => ({
  kind,
  ms: kind === 'synastry' ? null : AUG1,
  promoted: false,
  returnBody: null,
  ...over,
});
const model = (over: Partial<ChartHeaderInput> = {}) => chartHeaderModel(base(over));

// ── 1. INTERNAL IDENTITY: the label names the state, by precedence ──────────

console.log('\n── 1. INTERNAL IDENTITY: the label, for every state and by precedence ──');

{
  const aug = '1 August 2026';
  const cases: { name: string; input: Partial<ChartHeaderInput>; want: string[] }[] = [
    { name: 'natal', input: {}, want: ['NATAL CHART'] },
    { name: 'natal, pinned', input: pinAt(TORONTO), want: ['NATAL CHART', 'RELOCATED'] },
    // The model takes the active point, pin or hover alike: both relocate the angles.
    { name: 'natal, hovering', input: { point: { lat: 10, lng: 10 }, pointLabel: '' }, want: ['NATAL CHART', 'RELOCATED'] },
    {
      name: 'natal pin on the birthplace',
      input: { point: { lat: JIM.birthplace.lat, lng: JIM.birthplace.lng }, isNatalPin: true },
      want: ['NATAL CHART'],
    },
    { name: 'transits ring', input: { overlay: ov('transits') }, want: ['TRANSITS', aug] },
    { name: 'transits promoted', input: { overlay: ov('transits', { promoted: true }) }, want: ['TRANSITS', aug] },
    { name: 'transits, pinned', input: { overlay: ov('transits'), ...pinAt(TORONTO) }, want: ['TRANSITS', aug, 'RELOCATED'] },
    { name: 'secondary progressed', input: { overlay: ov('progressed') }, want: ['SECONDARY PROGRESSED', aug] },
    { name: 'tertiary progressed', input: { overlay: ov('tertiary-progressed') }, want: ['TERTIARY PROGRESSED', aug] },
    { name: 'solar arc', input: { overlay: ov('solar-arc') }, want: ['SOLAR ARC', aug] },
    { name: 'primary directions', input: { overlay: ov('primary-directions') }, want: ['PRIMARY DIRECTIONS', aug] },
    { name: 'eclipse chart', input: { overlay: ov('eclipses') }, want: ['ECLIPSE', aug] },
    // A return outranks the transits it is a moment of.
    { name: 'solar return over transits', input: { overlay: ov('transits', { returnBody: 'solar' }) }, want: ['SOLAR RETURN 2026'] },
    { name: 'solar return promoted', input: { overlay: ov('transits', { returnBody: 'solar', promoted: true }) }, want: ['SOLAR RETURN 2026'] },
    { name: 'lunar return', input: { overlay: ov('transits', { returnBody: 'lunar' }) }, want: ['LUNAR RETURN', aug] },
    { name: 'solar return, pinned', input: { overlay: ov('transits', { returnBody: 'solar' }), ...pinAt(TORONTO) }, want: ['SOLAR RETURN 2026', 'RELOCATED'] },
    // CCG never makes a wheel, so it names nothing.
    { name: 'CCG ring', input: { overlay: ov('cyclo') }, want: ['NATAL CHART'] },
    { name: 'synastry', input: { overlay: ov('synastry', { partner: SHAE }) }, want: ['SYNASTRY'] },
    { name: 'synastry, pinned', input: { overlay: ov('synastry', { partner: SHAE }), ...pinAt(TORONTO) }, want: ['SYNASTRY', 'RELOCATED'] },
    { name: 'davison', input: { chart: DAVISON }, want: ['DAVISON'] },
    { name: 'davison, pinned', input: { chart: DAVISON, ...pinAt(TORONTO) }, want: ['DAVISON', 'RELOCATED'] },
    { name: 'davison generated before parents were kept', input: { chart: { ...DAVISON, davison: undefined } }, want: ['DAVISON'] },
    { name: 'davison with transits', input: { chart: DAVISON, overlay: ov('transits') }, want: ['TRANSITS', aug] },
    { name: 'composite', input: { chart: COMPOSITE }, want: ['COMPOSITE (MIDPOINTS)'] },
    // The composite's own angles do not relocate, so no RELOCATED.
    { name: 'composite, pinned', input: { chart: COMPOSITE, ...pinAt(TORONTO) }, want: ['COMPOSITE (MIDPOINTS)'] },
    { name: 'composite over a transits ring', input: { chart: COMPOSITE, overlay: ov('transits') }, want: ['COMPOSITE (MIDPOINTS)'] },
    // …but a PROMOTED overlay is the only chart on the wheel, composite or not.
    { name: 'composite, transits promoted', input: { chart: COMPOSITE, overlay: ov('transits', { promoted: true }) }, want: ['TRANSITS', aug] },
    { name: 'geodetic', input: { lineSystem: 'geodetic' }, want: ['GEODETIC CHART'] },
    { name: 'geodetic, pinned (no RELOCATED)', input: { lineSystem: 'geodetic', ...pinAt(TORONTO) }, want: ['GEODETIC CHART'] },
    { name: 'geodetic over composite', input: { lineSystem: 'geodetic', chart: COMPOSITE }, want: ['GEODETIC CHART'] },
    { name: 'geodetic over a promoted overlay', input: { lineSystem: 'geodetic', overlay: ov('transits', { promoted: true }) }, want: ['GEODETIC CHART'] },
    { name: 'NO CHART (promoted CCG)', input: { noChart: true, overlay: ov('cyclo', { promoted: true }) }, want: [] },
    { name: 'no chart loaded', input: { chart: null }, want: [] },
  ];
  every('label', cases, (c) => {
    const got = model(c.input).labelParts;
    return same(got, c.want) ? null : `${c.name}: ${JSON.stringify(got)} ≠ ${JSON.stringify(c.want)}`;
  });
  // The Dual layout's two wheels: the first is the chart alone, the second the overlay.
  const dual = model({ overlay: ov('transits'), ...pinAt(TORONTO) });
  check('Dual: the first wheel is the chart alone', same(dual.chartView.labelParts, ['NATAL CHART', 'RELOCATED']), label({ ...dual, labelParts: dual.chartView.labelParts }));
  check('Dual: the second wheel is the overlay, cast for the same point', same(dual.overlayView?.labelParts, ['TRANSITS', '1 August 2026', 'RELOCATED']));
  check('a solar return label carries no date, so the corner caption adds it', model({ overlay: ov('transits', { returnBody: 'solar' }) }).labelHasOverlayDate === false);
  check('a transits label carries the date, so the corner caption does not repeat it', model({ overlay: ov('transits') }).labelHasOverlayDate === true);
}

// ── 2. INTERNAL IDENTITY: the birth moment never moves; the cast place has no zone ──

console.log('\n── 2. INTERNAL IDENTITY: "Born:" stays the birthplace clock, "Relocated to:" has no zone ──');

{
  const natal = model();
  const pinned = model(pinAt(TORONTO));
  const [nm] = byRole(natal, 'moment');
  const [pm] = byRole(pinned, 'moment');
  check('natal: the moment line has no lead', !!nm && segOf(nm, 'lead') == null, lineText(nm));
  check('relocated: the moment line leads with "Born:"', segOf(pm, 'lead')?.text === 'Born:', lineText(pm));
  check(
    'relocated: the birth moment is the same date, clock and zone as unrelocated',
    same(nm.segs.map((s) => s.text), pm.segs.filter((s) => s.kind !== 'lead').map((s) => s.text)),
    `${lineText(nm)} | ${lineText(pm)}`,
  );
  check('the moment\'s zone is the birthplace\'s own (zoneNameForChart)', segOf(nm, 'zone')?.text === formatZoneLabel(zoneNameForChart(JIM)));
  const [rl] = byRole(pinned, 'relocated');
  check('relocated: a "Relocated to:" line', segOf(rl, 'lead')?.text === 'Relocated to:', rl ? lineText(rl) : 'missing');
  check('relocated: it names the place', segOf(rl, 'place')?.text === TORONTO.label);
  check('relocated: no zone and no clock on it', !segOf(rl, 'zone') && !segOf(rl, 'clock') && !segOf(rl, 'date'));
  check('relocated: its coordinates to the minute (fmtCoordPairDM)', segOf(rl, 'coords')?.text === fmtCoordPairDM(TORONTO.lat, TORONTO.lng));
  check('relocated: the birthplace line stays', byRole(pinned, 'birthplace').length === 1);
  check('natal: no relocated line', byRole(natal, 'relocated').length === 0);
  check('the birthplace coordinates in DMS (fmtCoordPair)', segOf(byRole(natal, 'birthplace')[0], 'coords')?.text === fmtCoordPair(JIM.birthplace.lat, JIM.birthplace.lng));
  const hovering = model({ point: { lat: 10, lng: 10 }, pointLabel: '' });
  const [hl] = byRole(hovering, 'relocated');
  check('a hover whose name has not resolved yet keeps the line, with coordinates alone', !!hl && !segOf(hl, 'place') && !!segOf(hl, 'coords'), hl ? lineText(hl) : 'missing');

  // Geodetic: "Cast for:" instead, and the GE block after the place lines.
  const geo = model({ lineSystem: 'geodetic', ...pinAt(TORONTO) });
  const roles = geo.lines.map((l) => l.role);
  check('geodetic, pinned: "Cast for:" rather than "Relocated to:"', segOf(byRole(geo, 'relocated')[0], 'lead')?.text === 'Cast for:');
  check(
    'geodetic: the GE block follows the place lines and precedes rating and settings',
    roles.indexOf('geo') === roles.indexOf('relocated') + 1 && roles.indexOf('geo') < roles.indexOf('rodden') && roles.at(-1) === 'settings',
    roles.join(' > '),
  );
  check('celestial: no GE block', !model().lines.some((l) => l.role === 'geo'));

  // A chart with no birth time: the wording in the clock's place, and no zone.
  const timeless = model({ chart: { ...JIM, timeKnown: false, hour: 12, minute: 0 } });
  const [tm] = byRole(timeless, 'moment');
  check('no birth time: "birth time unknown, noon used" in place of the clock', lineText(tm).endsWith('birth time unknown, noon used'), lineText(tm));
  check('no birth time: no clock and no zone', !segOf(tm, 'clock') && !segOf(tm, 'zone'));

  // The overlay's lines: its moment, then where it is cast.
  const tr = model({ overlay: ov('transits') });
  check('transits: the moment line, then the cast place (the birthplace)', same(tr.lines.slice(0, 2).map((l) => l.role), ['overlay-moment', 'overlay-place']), tr.lines.map((l) => l.role).join(' > '));
  const trPin = model({ overlay: ov('transits'), ...pinAt(TORONTO) });
  check('transits, pinned: the cast place is the pin, without a lead', byRole(trPin, 'relocated').length === 1 && !segOf(byRole(trPin, 'relocated')[0], 'lead'));
  check('transits: no natal moment line', byRole(tr, 'moment').length === 0);
}

// ── 3. INTERNAL IDENTITY: a composite has no moment ─────────────────────────

console.log('\n── 3. INTERNAL IDENTITY: the composite states its parents and no moment of its own ──');

{
  const states = [
    { name: 'composite', m: model({ chart: COMPOSITE }) },
    { name: 'composite, pinned', m: model({ chart: COMPOSITE, ...pinAt(TORONTO) }) },
    { name: 'composite under a transits ring', m: model({ chart: COMPOSITE, overlay: ov('transits') }) },
    { name: 'composite, geodetic', m: model({ chart: COMPOSITE, lineSystem: 'geodetic' }) },
    { name: 'composite, the Dual first wheel', m: { ...model({ chart: COMPOSITE, overlay: ov('transits') }), lines: model({ chart: COMPOSITE, overlay: ov('transits') }).chartView.lines } as ChartHeaderModel },
  ];
  every('no moment line on a composite', states, ({ name, m }) =>
    byRole(m, 'moment').length || byRole(m, 'overlay-moment').length ? `${name}: ${texts(m).join(' | ')}` : null,
  );
  // And the stored minute — the synthesized frame anchor — is printed nowhere.
  const anchor = `${String(COMPOSITE.hour).padStart(2, '0')}:${String(COMPOSITE.minute).padStart(2, '0')}`;
  const c = model({ chart: COMPOSITE });
  check('the frame anchor\'s date is printed nowhere', !texts(c).some((s) => s.includes(`${COMPOSITE.day} ${fmt.monthName(COMPOSITE.month)} ${COMPOSITE.year}`)), anchor);
  const parents = byRole(c, 'parent');
  check('both parents, each with a name, date, clock and zone', parents.length === 2 && parents.every((l) => ['name', 'date', 'clock', 'zone'].every((k) => segOf(l, k as Segment['kind']))), texts(c).join(' | '));
  check(
    'each parent\'s clock in its own zone (zoneNameForChart on the snapshot)',
    segOf(parents[0], 'zone')?.text === formatZoneLabel(zoneNameForChart(COMPOSITE.composite!.a)) &&
      segOf(parents[1], 'zone')?.text === formatZoneLabel(zoneNameForChart(COMPOSITE.composite!.b)),
  );
  check('each parent\'s birthplace line, in DMS', byRole(c, 'parent-place').map((l) => segOf(l, 'coords')?.text).join() === [fmtCoordPair(JIM.birthplace.lat, JIM.birthplace.lng), fmtCoordPair(SHAE.birthplace.lat, SHAE.birthplace.lng)].join());
  const [mid] = byRole(c, 'midpoint');
  check('"Geographic midpoint:" with the stored midpoint to the minute', segOf(mid, 'lead')?.text === 'Geographic midpoint:' && segOf(mid, 'coords')?.text === fmtCoordPairDM(COMPOSITE.birthplace.lat, COMPOSITE.birthplace.lng), mid ? lineText(mid) : 'missing');
  check('composite, pinned on a celestial map: no relocated line', byRole(model({ chart: COMPOSITE, ...pinAt(TORONTO) }), 'relocated').length === 0);
  check('composite, pinned on a geodetic map: "Cast for:"', segOf(byRole(model({ chart: COMPOSITE, lineSystem: 'geodetic', ...pinAt(TORONTO) }), 'relocated')[0], 'lead')?.text === 'Cast for:');
  // A timeless parent: its noon placeholder is not printed as a recorded time.
  const timelessComp = stamp(buildComposite({ ...JIM, timeKnown: false, hour: 12, minute: 0 }, SHAE), 'c_comp2');
  const [p0] = byRole(model({ chart: timelessComp }), 'parent');
  check('a timeless parent reads "birth time unknown, noon used", no zone', lineText(p0).endsWith('birth time unknown, noon used') && !segOf(p0, 'zone'), lineText(p0));
}

// ── 4. INTERNAL IDENTITY: "Derived from:" only while the Davison is its parents' ──

console.log('\n── 4. INTERNAL IDENTITY: a Davison names its parents only while it is still their midpoint ──');

{
  const fresh = model({ chart: DAVISON });
  const roles = fresh.lines.map((l) => l.role);
  check('fresh: davisonParents returns the parents', !!davisonParents(DAVISON));
  check('fresh: "Derived from:" then both parents', roles.indexOf('derived') > 0 && roles[roles.indexOf('derived') + 1] === 'parent' && roles[roles.indexOf('derived') + 2] === 'parent', roles.join(' > '));
  const derived = byRole(fresh, 'parent');
  check(
    'fresh: each parent by name · date · place',
    lineText(derived[0]) === 'Jim Lewis · 5 June 1941 · Yonkers, New York, United States' &&
      lineText(derived[1]) === 'Shae · 12 November 1972 · Saint Paul, Minnesota, United States',
    derived.map(lineText).join(' | '),
  );
  const [dm] = byRole(fresh, 'moment');
  check(
    'the Davison moment in UT: "d Month yyyy · HH:MM (UTC)"',
    lineText(dm) === `${DAVISON.day} ${fmt.monthName(DAVISON.month)} ${DAVISON.year} · ${formatZoneClock(DAVISON.hour, DAVISON.minute, utName())}`,
    lineText(dm),
  );
  check('the Davison midpoint line', segOf(byRole(fresh, 'midpoint')[0], 'coords')?.text === fmtCoordPairDM(DAVISON.birthplace.lat, DAVISON.birthplace.lng));
  const edits: { name: string; chart: StoredChart }[] = [
    { name: 'the minute edited', chart: { ...DAVISON, minute: (DAVISON.minute + 1) % 60 } },
    { name: 'the day edited', chart: { ...DAVISON, day: DAVISON.day === 1 ? 2 : DAVISON.day - 1 } },
    { name: 'the place moved', chart: { ...DAVISON, birthplace: { ...DAVISON.birthplace, lat: DAVISON.birthplace.lat + 0.5 } } },
    { name: 'the zone edited', chart: { ...DAVISON, tzOffset: 1 } },
    { name: 'a parent swapped', chart: { ...DAVISON, davison: { a: DAVISON.davison!.a, b: { ...SHAE, year: 1980 } } } },
    { name: 'no parents recorded (an old Davison)', chart: { ...DAVISON, davison: undefined } },
  ];
  every('no "Derived from:" once the chart is no longer its parents\' midpoint', edits, ({ name, chart }) =>
    byRole(model({ chart }), 'derived').length || davisonParents(chart) ? name : null,
  );
  // Vacuity guard for the set above: the fresh one DOES carry the line.
  check('…and the fresh one does (the set above is not passing by never having it)', byRole(fresh, 'derived').length === 1);
  check('a no-op save that rounds the coordinates keeps the parents', !!davisonParents({ ...DAVISON, birthplace: { ...DAVISON.birthplace, lat: Number(DAVISON.birthplace.lat.toFixed(5)) } }));
  check('a Davison relocated: "Relocated to:" after the midpoint, before "Derived from:"', (() => {
    const r = model({ chart: DAVISON, ...pinAt(TORONTO) }).lines.map((l) => l.role);
    return r.indexOf('relocated') === r.indexOf('midpoint') + 1 && r.indexOf('derived') === r.indexOf('relocated') + 1;
  })());
}

// ── 5. INTERNAL IDENTITY: Discreet masks every subject segment ──────────────

console.log('\n── 5. INTERNAL IDENTITY: Discreet masks every subject segment, and only those ──');

{
  const inputs: { name: string; input: Partial<ChartHeaderInput> }[] = [
    { name: 'natal', input: {} },
    { name: 'natal, pinned', input: pinAt(TORONTO) },
    { name: 'natal pin', input: { point: { lat: JIM.birthplace.lat, lng: JIM.birthplace.lng }, isNatalPin: true, pointLabel: JIM.birthplace.label } },
    { name: 'transits at the birthplace', input: { overlay: ov('transits') } },
    { name: 'transits, pinned', input: { overlay: ov('transits'), ...pinAt(TORONTO) } },
    { name: 'solar return', input: { overlay: ov('transits', { returnBody: 'solar' }) } },
    { name: 'lunar return', input: { overlay: ov('transits', { returnBody: 'lunar' }) } },
    { name: 'composite', input: { chart: COMPOSITE } },
    { name: 'davison', input: { chart: DAVISON } },
    { name: 'synastry', input: { overlay: ov('synastry', { partner: SHAE }) } },
    { name: 'geodetic', input: { lineSystem: 'geodetic' } },
  ];
  type Pair = { where: string; plain: Segment; masked: Segment | undefined };
  const pairs: Pair[] = [];
  const leaks: string[] = [];
  for (const { name, input } of inputs) {
    const plain = model(input);
    const masked = model({ ...input, discreet: true });
    const views = [
      [plain.lines, masked.lines, 'header'],
      [plain.overlayView?.lines ?? [], masked.overlayView?.lines ?? [], 'overlay view'],
    ] as const;
    for (const [pl, ml, where] of views) {
      pl.forEach((l, i) => {
        // A masked zone drops out, so pair the rest in order.
        const kept = l.segs.filter((s) => !(s.kind === 'zone' && s.mask === 'subject'));
        const m = ml[i]?.segs ?? [];
        if (m.some((s) => s.kind === 'zone' && s.mask === 'subject')) leaks.push(`${name} ${where}: a subject zone survived`);
        kept.forEach((s, j) => pairs.push({ where: `${name} ${where} ${l.role}`, plain: s, masked: m[j] }));
      });
    }
    // Labels: a lunar return's date is masked; nothing else in a label is the subject's.
    if (name === 'lunar return' && masked.labelParts[1] !== MASK_DATE) leaks.push(`${name}: label date ${masked.labelParts[1]}`);
  }
  const subject = pairs.filter((p) => p.plain.mask === 'subject');
  every('every subject segment is masked', subject, ({ where, plain, masked }) => {
    if (!masked) return `${where}: missing`;
    const want =
      plain.kind === 'date'
        ? MASK_DATE
        : plain.kind === 'clock'
          ? MASK_TIME
          : plain.kind === 'name'
            ? maskName(plain.text)
            : null;
    if (want != null) return masked.text === want ? null : `${where} ${plain.kind}: ${masked.text}`;
    // Places and coordinates blank to dots and spaces only.
    return /^[• ]+$/.test(masked.text) ? null : `${where} ${plain.kind}: ${masked.text}`;
  });
  every('every other segment reads as it does without Discreet', pairs.filter((p) => p.plain.mask === 'none'), ({ where, plain, masked }) =>
    masked && masked.text === plain.text ? null : `${where}: ${plain.text} → ${masked?.text}`,
  );
  check('no subject zone survives and no return date leaks into a label', leaks.length === 0, leaks.join('; '));
  // The states whose subject data is what the mode exists for, spot-checked by role.
  const roleMasked = (input: Partial<ChartHeaderInput>, role: HeaderLine['role']) =>
    byRole(model({ ...input, discreet: true }), role).every((l) => l.segs.every((s) => s.mask === 'subject' || s.kind === 'lead'));
  check('the birth moment and the birthplace are subject data', roleMasked({}, 'moment') && roleMasked({}, 'birthplace'));
  check('a pinned place is not', byRole(model({ ...pinAt(TORONTO), discreet: true }), 'relocated')[0].segs.every((s) => s.mask === 'none'));
  check('a transit\'s moment is not', byRole(model({ overlay: ov('transits'), discreet: true }), 'overlay-moment')[0].segs.every((s) => s.mask === 'none'));
  check('a solar return\'s moment is (it falls on the birthday)', byRole(model({ overlay: ov('transits', { returnBody: 'solar' }), discreet: true }), 'overlay-moment')[0].segs.every((s) => s.mask === 'subject'));
  check('the parents, the Davison moment and the midpoint are', roleMasked({ chart: DAVISON }, 'parent') && roleMasked({ chart: DAVISON }, 'moment') && roleMasked({ chart: COMPOSITE }, 'midpoint') && roleMasked({ chart: COMPOSITE }, 'parent'));
  check('vacuity: subject segments were compared in every state', subject.length >= inputs.length * 2, `${subject.length}`);
}

// ── 6. OUTSIDE AGREEMENT: the overlay's moment is the cast place's clock ────

console.log('\n── 6. OUTSIDE AGREEMENT: the overlay\'s moment against the tz database at the cast place ──');

{
  const places = [
    { label: 'Yonkers (no pin)', lat: JIM.birthplace.lat, lng: JIM.birthplace.lng, pin: false },
    { label: TORONTO.label, lat: TORONTO.lat, lng: TORONTO.lng, pin: true },
    { label: 'Berlin', lat: 52.52, lng: 13.405, pin: true },
    { label: 'Kolkata', lat: 22.5726, lng: 88.3639, pin: true },
    { label: 'Tokyo', lat: 35.6762, lng: 139.6503, pin: true },
    { label: 'Auckland', lat: -36.8485, lng: 174.7633, pin: true },
  ];
  const instants = [
    AUG1,
    Date.UTC(2026, 7, 1, 2, 0), // 31 July in the Americas — the local date, not UT's
    Date.UTC(2026, 0, 15, 3, 0),
    Date.UTC(2026, 10, 1, 5, 30), // New York's fall-back hour, first pass (EDT)
    Date.UTC(2026, 10, 1, 6, 30), // …second pass (EST)
    Date.UTC(2026, 2, 29, 0, 59), // Berlin a minute before its spring change
    Date.UTC(2026, 2, 29, 1, 0), // …and at it
  ];
  const rows = places.flatMap((p) => instants.map((ms) => ({ p, ms })));
  every('the moment line\'s date and clock are the tz database\'s at the cast place', rows, ({ p, ms }) => {
    const m = model({ overlay: ov('transits', { ms }), ...(p.pin ? { point: { lat: p.lat, lng: p.lng }, pointLabel: p.label } : {}) });
    const [line] = byRole(m, 'overlay-moment');
    const local = DateTime.fromMillis(ms, { zone: getIanaTimezone(p.lat, p.lng) });
    const wantDate = fmt.dateWithWeekday(local.year, local.month, local.day);
    const wantClock = local.toFormat('HH:mm');
    const wantLabelDate = `${local.day} ${fmt.monthName(local.month)} ${local.year}`;
    const gotZoneSec = (() => {
      const z = castZoneAt(ms, p.lat, p.lng);
      return z.seconds;
    })();
    if (segOf(line, 'date')?.text !== wantDate) return `${p.label} ${new Date(ms).toISOString()}: date ${segOf(line, 'date')?.text} ≠ ${wantDate}`;
    if (segOf(line, 'clock')?.text !== wantClock) return `${p.label} ${new Date(ms).toISOString()}: clock ${segOf(line, 'clock')?.text} ≠ ${wantClock}`;
    if (gotZoneSec !== Math.round(local.offset * 60)) return `${p.label}: offset ${gotZoneSec} ≠ ${local.offset * 60}`;
    if (m.labelParts[1] !== wantLabelDate) return `${p.label}: label date ${m.labelParts[1]} ≠ ${wantLabelDate}`;
    return null;
  });
  every('…and its zone is placeZoneAt\'s at that instant, in the shared format', rows, ({ p, ms }) => {
    const m = model({ overlay: ov('transits', { ms }), ...(p.pin ? { point: { lat: p.lat, lng: p.lng }, pointLabel: p.label } : {}) });
    const [line] = byRole(m, 'overlay-moment');
    const reader = placeZoneAt(p.lat, p.lng);
    if (!reader) return `${p.label}: placeZoneAt found no zone`;
    const z = reader(ms);
    const w = wallClockAt(ms, z);
    const want = `${fmt.dateWithWeekday(w.year, w.month, w.day)} · ${formatZoneClock(w.hour, w.minute, z)}`;
    return lineText(line) === want ? null : `${p.label}: "${lineText(line)}" ≠ "${want}"`;
  });
  // The fall-back hour: the same wall-clock 01:30 twice, under two names.
  const first = byRole(model({ overlay: ov('transits', { ms: Date.UTC(2026, 10, 1, 5, 30) }) }), 'overlay-moment')[0];
  const second = byRole(model({ overlay: ov('transits', { ms: Date.UTC(2026, 10, 1, 6, 30) }) }), 'overlay-moment')[0];
  check(
    'New York\'s fall-back hour reads 01:30 twice, in two different offsets',
    segOf(first, 'clock')?.text === '01:30' && segOf(second, 'clock')?.text === '01:30' && segOf(first, 'zone')?.text !== segOf(second, 'zone')?.text,
    `${lineText(first)} | ${lineText(second)}`,
  );
  // Where no zone can be found, UTC — said as UTC, never a silent offset.
  const nowhere = byRole(model({ overlay: ov('transits'), point: { lat: 95, lng: 0 }, pointLabel: '' }), 'overlay-moment')[0];
  check('a point with no zone reads the moment in UTC', segOf(nowhere, 'zone')?.text === formatZoneLabel(utName()), lineText(nowhere));
}

// ── 7. INTERNAL IDENTITY: the settings line is the effective settings ───────

console.log('\n── 7. INTERNAL IDENTITY: the settings line reads the effective zodiac, houses and node ──');

{
  const set = (over: Partial<ChartHeaderInput>) => lineText(byRole(model(over), 'settings')[0]);
  const cases: { name: string; over: Partial<ChartHeaderInput>; want: string }[] = [
    { name: 'tropical, whole sign, true node', over: {}, want: 'Geocentric · Tropical · Whole Sign · True Node' },
    { name: 'sidereal Lahiri, Placidus, mean node', over: { zodiac: 'lahiri', houses: { system: 'placidus', fallback: false }, nodeType: 'mean' }, want: 'Geocentric · Sidereal · Lahiri · Placidus · Mean Node' },
    { name: 'Placidus undefined here: Porphyry', over: { houses: { system: 'placidus', fallback: true } }, want: 'Geocentric · Tropical · Porphyry · True Node' },
    { name: 'no houses drawn (no birth time)', over: { houses: null }, want: 'Geocentric · Tropical · True Node' },
    { name: 'geodetic is tropical-only', over: { lineSystem: 'geodetic', zodiac: 'lahiri' }, want: 'Geocentric · Tropical · Whole Sign · True Node' },
    { name: 'the same line on a composite', over: { chart: COMPOSITE }, want: 'Geocentric · Tropical · Whole Sign · True Node' },
  ];
  every('settings line', cases, ({ name, over, want }) => (set(over) === want ? null : `${name}: ${set(over)}`));
  check('the settings line is the last line, in every state', [{}, pinAt(TORONTO), { chart: COMPOSITE }, { chart: DAVISON }, { overlay: ov('transits') }, { lineSystem: 'geodetic' as const }].every((o) => model(o).lines.at(-1)?.role === 'settings'));
  check('the Rodden line when the chart is rated', lineText(byRole(model(), 'rodden')[0]) === 'Rodden: AA · Birth record');
  check('no Rodden line when it is not', byRole(model({ chart: { ...JIM, sourceRating: undefined } }), 'rodden').length === 0);
}

// ── 8. GOLDEN: Lina's examples ──────────────────────────────────────────────

console.log('\n── 8. GOLDEN: the spec\'s examples, as printed ──');

{
  // The zone names come from lib/atlas/zoneName; a stub there reads offsets alone.
  const natal = texts(model());
  check('natal', same(natal, [
    '5 June 1941, Thu · 09:30 EDT (UTC−04:00)',
    'Yonkers, New York, United States · 40°N55\'52" 073°W53\'56"',
    'Rodden: AA · Birth record',
    'Geocentric · Tropical · Whole Sign · True Node',
  ]), natal.join(' | '));
  const reloc = texts(model(pinAt(TORONTO)));
  check('natal, relocated', same(reloc, [
    'Born: 5 June 1941, Thu · 09:30 EDT (UTC−04:00)',
    'Yonkers, New York, United States · 40°N55\'52" 073°W53\'56"',
    'Relocated to: Toronto, Ontario, Canada · 43°N39\' 079°W23\'',
    'Rodden: AA · Birth record',
    'Geocentric · Tropical · Whole Sign · True Node',
  ]), reloc.join(' | '));
  const torontoChart: StoredChart = { ...JIM, birthplace: { ...TORONTO }, sourceRating: undefined };
  const tr = model({ chart: torontoChart, overlay: ov('transits') });
  // Cast at the chart's own birthplace, which the header prints in DMS. Lina's example
  // shows Toronto to the minute — the form a RELOCATED place takes (the next check).
  check('transits', label(tr) === 'TRANSITS · 1 August 2026' && same(texts(tr), [
    '1 August 2026, Sat · 12:13 EDT (UTC−04:00)',
    `Toronto, Ontario, Canada · ${fmtCoordPair(TORONTO.lat, TORONTO.lng)}`,
    'Geocentric · Tropical · Whole Sign · True Node',
  ]), texts(tr).join(' | '));
  const trPin = model({ overlay: ov('transits'), ...pinAt(TORONTO), chart: { ...JIM, sourceRating: undefined } });
  check('transits, relocated to Toronto', label(trPin) === 'TRANSITS · 1 August 2026 · RELOCATED' && same(texts(trPin), [
    '1 August 2026, Sat · 12:13 EDT (UTC−04:00)',
    'Toronto, Ontario, Canada · 43°N39\' 079°W23\'',
    'Geocentric · Tropical · Whole Sign · True Node',
  ]), texts(trPin).join(' | '));
  const comp = texts(model({ chart: COMPOSITE }));
  check('composite: the parents', comp[0] === 'Jim Lewis · 5 June 1941 · 09:30 EDT (UTC−04:00)' && comp[2] === 'Shae · 12 November 1972 · 14:20 CST (UTC−06:00)', `${comp[0]} | ${comp[2]}`);
  check('composite: the midpoint', comp[4] === `Geographic midpoint: ${fmtCoordPairDM(COMPOSITE.birthplace.lat, COMPOSITE.birthplace.lng)}`, comp[4]);
  check('Davison: "Derived from:"', texts(model({ chart: DAVISON })).includes('Derived from:'));
}

// ── 9. INTERNAL IDENTITY: what a relationship chart stores ──────────────────

console.log('\n── 9. INTERNAL IDENTITY: the parents a relationship chart keeps, and the sync cap ──');

{
  const entry: TzEntry = { mode: 'offset', seconds: -4 * 3600, text: '4h W' };
  const a: StoredChart = { ...JIM, timeKnown: false, tzEntry: entry, notes: 'not a parent field', tag: 'star', folder: 'Clients' };
  const d = buildDavison(a, SHAE);
  const c = buildComposite(a, SHAE);
  for (const [name, p] of [['Davison', d.davison.a], ['composite', c.composite.a]] as const) {
    check(`${name}: the snapshot keeps tzIana, tzEntry and timeKnown`, p.tzIana === a.tzIana && same(p.tzEntry, entry) && p.timeKnown === false);
    check(`${name}: and none of the bookkeeping`, !('notes' in p) && !('tag' in p) && !('folder' in p) && !('id' in p));
  }
  check('an absent field stays absent (no undefined keys)', !('tzEntry' in d.davison.b) && !('timeKnown' in d.davison.b));
  // A chart is synced as ONE JSON blob, capped at 4096 characters by the account store
  // (functions/api/charts/sync.ts MAX_DATA_BYTES). The worst a generated relationship
  // chart can be: full-length names, long place labels, stated zones, full notes.
  const long = (s: string, n: number) => s.repeat(Math.ceil(n / s.length)).slice(0, n);
  const fat = (b: StoredChart): StoredChart => ({
    ...b,
    name: long('Name ', NAME_HARD_LIMIT),
    tzEntry: { mode: 'offset', seconds: -(4 * 3600 + 56 * 60 + 2), basis: 'lmt', text: '4h56m02s W' },
    birthplace: { ...b.birthplace, label: long('Saint-Rémy-de-Provence, Bouches-du-Rhône, ', 120) },
  });
  const worst = [
    { name: 'Davison', chart: { ...stamp(buildDavison(fat(JIM), fat(SHAE)), 'c_x'), notes: long('n', NOTES_HARD_LIMIT) } },
    { name: 'composite', chart: { ...stamp(buildComposite(fat(JIM), fat(SHAE)), 'c_y'), notes: long('n', NOTES_HARD_LIMIT) } },
  ];
  every('a worst-case relationship chart fits the 4096-character sync cap', worst, ({ name, chart }) => {
    const n = JSON.stringify(chart).length;
    return n <= 4096 ? null : `${name}: ${n}`;
  });
  console.log(`      (worst cases: ${worst.map(({ name, chart }) => `${name} ${JSON.stringify(chart).length}`).join(', ')})`);
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
