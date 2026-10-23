// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies event charts and "No chart" (src/lib/eventCharts.ts, 2026-10-20), running the
// REAL src/lib code through the harness (`npm run verify:event-charts`).
//
// Everything here sits behind the geodetic hold, and the hold derives rather than writes
// (CLAUDE.md rule 2). So most sections are the house's "move the live source, the frozen
// value must not move": a stored kind and a stored selection are facts, the hold and the
// line system are states of the world, and the check moves the second and requires the
// first NOT to move — while each fact's own control still moves it.
//
// Each section says which KIND of check it is, because a failure in each means something
// different:
//
//   MOVE THE SOURCE    — a live state is moved through every value it has; what is stored
//                        must stay put, and what is derived must follow. A failure means a
//                        standing state wrote over a reader's choice.
//   TWO PARTS AGREE    — two parts of the app asked the same question: the example chart
//                        and the ephemeris's own Sun, the sky alone's layer and transits in
//                        the moment's own frame. A failure means one of them is wrong about
//                        the other.
//   INTERNAL IDENTITY  — the module agrees with itself. A failure means the code
//                        contradicts itself.
//   SOURCE TRIPWIRE    — App's shape, where its behaviour can't be reached from Node. A
//                        failure means a guard was removed or renamed; read the diff.
//
// Sections 4 and 5 are App's wiring (2026-10-20), through the pure module it calls
// (src/lib/skyAlone.ts): what choosing No chart holds, against what the overlay builder draws
// with and without the chart; and the sky alone's layer against transits in the moment's own
// frame, line for line on both maps. (The layer identities themselves — the no-chart block set
// against the layers that move with the chart, and buildSkyOverlay against the transit-moment
// layer — are verify-directions §10(c)'s.) Section 8 reads App's shape.
//
// Every check fails on an empty comparison: a check over nothing is not a pass.

import { en } from '../src/i18n/en';
import { interpolate, resolvePath } from '../src/i18n/t';
import type { Messages } from '../src/i18n';
import {
  EXAMPLE_EVENT_CHART_UT_MS,
  EXAMPLE_EVENT_EXACT_UT_MS,
  EXAMPLE_EVENT_FOLDER,
  EXAMPLE_EVENT_ID,
  EXAMPLE_EVENT_NAME,
  exampleEventChart,
  formOpeningKind,
  hasExampleEvent,
  kindField,
  NEEDS_CHART_KEY,
  presentedKind,
  resolveSelection,
  SECTION_COUNT,
  seedLibrary,
  selectionToPersist,
  storedKind,
  switcherSections,
  tabCycleIds,
  withExampleEvent,
  type ChartKindOf,
} from '../src/lib/eventCharts';
import {
  isSeedChart,
  NO_CHART_ID,
  RECENT_COUNT,
  recentShortlist,
  SEED_CHART_ID_PREFIX,
  type StoredChart,
} from '../src/lib/chartLibrary';
import { effectiveLineSystem } from '../src/lib/lineSystem';
import { SEED_BIRTHS } from '../src/lib/birthData';
import { birthDataToJD, getEclipticPositions, initEphemeris, type LineSystem } from '../src/lib/ephemeris';
import * as timeline from '../src/lib/astro/timeline';
import type { ZodiacMode } from '../src/lib/astro/ayanamsa';
import { readFileSync } from 'node:fs';
import { obliquity, projectOntoEcliptic, type PlanetPosition } from '../src/lib/ephemeris';
import { generateLines, meridianLngFor } from '../src/lib/astro/lines';
import { noChartHoldChanges, skyLayerFor } from '../src/lib/skyAlone';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

/** One PASS/FAIL line for a whole set: fails when the set is empty, and names the first
 *  few members that broke the rule. */
function every<T>(label: string, items: readonly T[], bad: (x: T) => string | null) {
  if (items.length === 0) {
    check(label, false, 'empty set — nothing was compared');
    return;
  }
  const broken = items.map(bad).filter((s): s is string => s != null);
  check(`${label} (${items.length})`, broken.length === 0, broken.slice(0, 6).join('; '));
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const ids = (list: readonly StoredChart[]) => list.map((c) => c.id);

// ── Fixtures: a library of people and events, in folders ────────────────────

let seq = 0;
const mk = (name: string, folder: string | undefined, used: number, kind?: 'event'): StoredChart => {
  seq += 1;
  return {
    id: `c_${seq}`,
    createdAt: seq,
    lastUsedAt: used,
    name,
    year: 1990, month: 1, day: 1, hour: 12, minute: 0,
    tzOffset: 0,
    birthplace: { label: 'Nowhere', lat: 0, lng: 0 },
    ...(folder ? { folder } : {}),
    ...(kind ? { kind } : {}),
  };
};
const LIBRARY: StoredChart[] = [
  mk('Client A', 'Clients', 60),
  mk('Client B', 'Clients', 59),
  mk('Client C', 'Clients', 58),
  mk('Client D', 'Clients', 57),
  mk('Client E', 'Clients', 56),
  mk('Client F', 'Clients', 55),
  mk('Aunt', 'Family', 70),
  mk('Unfiled Person', undefined, 40),
  mk('Aries 2026', 'Mundane/Ingresses', 50, 'event'),
  mk('Cancer 2026', 'Mundane/Ingresses', 49, 'event'),
  mk('Libra 2026', 'Mundane/Ingresses', 48, 'event'),
  mk('Capricorn 2026', 'Mundane/Ingresses', 47, 'event'),
  mk('Aries 2027', 'Mundane/Ingresses', 46, 'event'),
  mk('New Moon', 'Mundane/Lunations', 80, 'event'),
  mk('Founding', undefined, 30, 'event'),
];
const EVENTS = LIBRARY.filter((c) => c.kind === 'event');
const LINE_SYSTEMS: LineSystem[] = ['celestial', 'geodetic'];
const HOLDS = [true, false];

// ── 1. MOVE THE SOURCE: the hold masks how a kind is shown, never the kind ──

console.log('\n── 1. MOVE THE SOURCE: the hold moves the presented kind, never the stored one ──');

{
  every('held, every event is presented as a person — stored and presented required to disagree', EVENTS, (c) =>
    storedKind(c) === 'event' && presentedKind(c, true) === 'person' ? null : `${c.name}: ${storedKind(c)} / ${presentedKind(c, true)}`,
  );
  every('  …and unlocked the two agree, for every chart', LIBRARY, (c) =>
    presentedKind(c, false) === storedKind(c) ? null : `${c.name}: ${presentedKind(c, false)} vs ${storedKind(c)}`,
  );
  every('  …while every person reads a person on both sides of the hold', LIBRARY.filter((c) => !c.kind), (c) =>
    presentedKind(c, true) === 'person' && presentedKind(c, false) === 'person' ? null : c.name,
  );
  const before = JSON.stringify(LIBRARY);
  for (const held of HOLDS) for (const c of LIBRARY) presentedKind(c, held);
  check('  presenting a kind writes nothing to the record', JSON.stringify(LIBRARY) === before);

  // The form, edited on a held device: it opens on the record's own kind and writes it
  // back, though the switch that would show it isn't there.
  const roundTrip = (c: StoredChart, eventsOn: boolean) => kindField(formOpeningKind(c, eventsOn, 'person'));
  every('an event edited on a held device is saved as an event', EVENTS, (c) =>
    roundTrip(c, false) === 'event' ? null : `${c.name}: saved ${String(roundTrip(c, false))}`,
  );
  every('  …a person edited anywhere is saved with no kind, as before', LIBRARY.filter((c) => !c.kind), (c) =>
    roundTrip(c, false) === undefined && roundTrip(c, true) === undefined ? null : c.name,
  );
  const opens: [string, boolean, ChartKindOf, ChartKindOf][] = [
    ['held, the caller asking for an event', false, 'event', 'person'],
    ['held, the caller asking for a person', false, 'person', 'person'],
    ['unlocked, on a geodetic map', true, 'event', 'event'],
    ['unlocked, on a celestial map', true, 'person', 'person'],
  ];
  every('a new chart opens on the derived default only while events are on offer', opens, ([name, on, def, want]) =>
    formOpeningKind(null, on, def) === want ? null : `${name}: ${formOpeningKind(null, on, def)}`,
  );
}

// ── 2. MOVE THE SOURCE: the line system and the hold move the menu, never the pick ──

console.log('\n── 2. MOVE THE SOURCE: the line system and the hold move the menu, never the selection or a record ──');

{
  // Every derived line system there is: the pref through both values, under each mask.
  type World = { pref: LineSystem; zodiac: ZodiacMode; held: boolean };
  const worlds: World[] = [];
  for (const pref of LINE_SYSTEMS)
    for (const zodiac of ['tropical', 'lahiri'] as ZodiacMode[])
      for (const held of HOLDS) worlds.push({ pref, zodiac, held });
  const derivedOf = (w: World) => effectiveLineSystem(w.pref, w.zodiac, true, w.held);
  check('the worlds reach both derived line systems (the sweep is not vacuous)',
    new Set(worlds.map(derivedOf)).size === 2, [...new Set(worlds.map(derivedOf))].join(','));

  const picks: [string, string | null][] = [
    ['a person', LIBRARY[0].id],
    ['an event', EVENTS[0].id],
    ['No chart', NO_CHART_ID],
    ['a chart since deleted', 'c_gone'],
    ['nothing stored', null],
  ];
  // The line system and the zodiac never reach the selection: resolveSelection and
  // selectionToPersist take neither, and §8 reads App's one call of them — which is where a
  // line system would have to enter. So the source moved here is the HOLD, the one state of
  // the world they do take: it may move what is in force, and must never move what is saved.
  const libBefore = JSON.stringify(LIBRARY);
  let inForceMoved = 0;
  for (const [name, stored] of picks) {
    const sides = HOLDS.map((held) => {
      const r = resolveSelection(LIBRARY, stored, held);
      return { held, id: r.storedCurrent?.id ?? null, persist: selectionToPersist(stored, r.storedCurrent) };
    });
    if (new Set(sides.map((s) => s.id)).size > 1) inForceMoved++;
    check(`${name}: the hold never moves what is saved (${sides.map((s) => `${s.held ? 'held' : 'unlocked'} → ${String(s.persist)}`).join(', ')})`,
      sides.length === 2 && sides.every((s) => s.persist === sides[0].persist));
  }
  check('  …while it did move what is in force for at least one pick (the sweep is not vacuous)', inForceMoved > 0, String(inForceMoved));
  check('  …and no pick wrote to any record', JSON.stringify(LIBRARY) === libBefore);

  // …while the section order follows the derived line system, and only while unlocked.
  const orders = worlds.map((w) => ({ w, s: switcherSections(LIBRARY, LIBRARY[0], derivedOf(w), w.held) }));
  every('the section order follows the DERIVED line system: Events first only on a geodetic map', orders, ({ w, s }) => {
    if (w.held) return s === null ? null : `held but sections returned`;
    const want = derivedOf(w) === 'geodetic' ? 'event,person' : 'person,event';
    return s && s.order.join(',') === want ? null : `${JSON.stringify(w)}: ${s?.order.join(',')}`;
  });
  check('  …and both orders were seen unlocked (the order did move)',
    new Set(orders.filter((o) => o.s).map((o) => o.s!.order.join(','))).size === 2);

  // The sentinel across the hold: the pick is the same string on both sides; what is in
  // force differs, and what is saved is the pick.
  const held = resolveSelection(LIBRARY, NO_CHART_ID, true);
  const open = resolveSelection(LIBRARY, NO_CHART_ID, false);
  check('No chart stored, held: the first chart stands in for it…',
    held.storedCurrent?.id === LIBRARY[0].id && !held.noChartPicked, String(held.storedCurrent?.id));
  check('  …while what is saved is still No chart — the two required to disagree',
    selectionToPersist(NO_CHART_ID, held.storedCurrent) === NO_CHART_ID && held.storedCurrent?.id !== NO_CHART_ID);
  check('  unlocked, the same stored pick is in force: no chart at all',
    open.storedCurrent === null && open.noChartPicked && selectionToPersist(NO_CHART_ID, open.storedCurrent) === NO_CHART_ID);
  // The pick's own control still moves it: choosing a chart replaces the sentinel.
  const chosen = resolveSelection(LIBRARY, EVENTS[0].id, false);
  check('  …and choosing a chart (the pick’s own control) moves what is saved',
    selectionToPersist(EVENTS[0].id, chosen.storedCurrent) === EVENTS[0].id && chosen.storedCurrent?.id === EVENTS[0].id);
  // A stale id repairs to the first chart, as it always has — and an empty library has
  // nothing to repair to.
  const stale = resolveSelection(LIBRARY, 'c_gone', false);
  check('a stale id repairs to the first chart, and that repair is what is saved',
    stale.storedCurrent?.id === LIBRARY[0].id && selectionToPersist('c_gone', stale.storedCurrent) === LIBRARY[0].id);
  check('  an empty library is no chart, saved as nothing', resolveSelection([], 'c_gone', true).storedCurrent === null &&
    selectionToPersist('c_gone', null) === null);
}

// ── 3. MOVE THE SOURCE: the Tab swap cycles the most recent, whatever their folders ─

console.log('\n── 3. MOVE THE SOURCE: the Tab swap, across folders, on both sides of the hold ──');

{
  // Since 2026-10-23 (Salvatore) Tab cycles the most recently used charts of the whole library;
  // only the menu a click opens keeps to the active chart's folder. The flash Tab opens draws
  // Tab's own frozen list (§8 reads that wiring), so what is cycled is still what is shown.
  // The folders are the live source here: every chart is re-filed into a folder of its own,
  // and Tab's list must NOT move, while the menu's DOES. Each chart is made the active one the
  // way App makes it: selection bumps its recency, so it heads its own list.
  const selected = (current: StoredChart) => {
    const lib = LIBRARY.map((c) => (c.id === current.id ? { ...c, lastUsedAt: 1_000 } : c));
    return { lib, current: lib.find((c) => c.id === current.id)! };
  };
  const refiled = (lib: StoredChart[]) => lib.map((c) => ({ ...c, folder: `Own/${c.id}` }));
  const cases = LIBRARY.flatMap((c) => HOLDS.map((held) => ({ ...selected(c), held })));
  every('re-filing every chart moves nothing Tab cycles, starting from the active chart', cases, ({ lib, current, held }) => {
    const tab = tabCycleIds(lib, current, held);
    const moved = refiled(lib);
    const after = tabCycleIds(moved, moved.find((c) => c.id === current.id)!, held);
    return same(tab, after) && tab[0] === current.id && tab.length > 1
      ? null
      : `${current.name} ${held ? 'held' : 'open'}: ${tab} vs ${after}`;
  });
  // Required to disagree, and never vacuously: some menu must move, some Tab list must cross.
  const menuMoved = cases.filter(({ lib, current }) => {
    const moved = refiled(lib);
    return !same(ids(recentShortlist(lib, current)), ids(recentShortlist(moved, moved.find((c) => c.id === current.id)!)));
  });
  check('  …while the same re-filing DOES move the menu a click opens (it keeps to the folder)',
    menuMoved.length > 0, `${menuMoved.length} of ${cases.length} moved`);
  const crossing = cases.filter(({ lib, current, held }) =>
    tabCycleIds(lib, current, held).some((id) => lib.find((c) => c.id === id)!.folder !== current.folder));
  check('  …and Tab reaches past the active chart’s folder', crossing.length > 0, `${crossing.length} of ${cases.length}`);
  every('held, Tab cycles the library’s five most recent, id for id', cases.filter((c) => c.held), ({ lib, current }) =>
    same(tabCycleIds(lib, current, true), ids(recentShortlist(lib, null, RECENT_COUNT))) ? null : current.name,
  );
  every('unlocked, the four most recent of the active chart’s own kind, never the other', cases.filter((c) => !c.held), ({ lib, current }) => {
    const tab = tabCycleIds(lib, current, false);
    const own = ids(recentShortlist(lib.filter((c) => storedKind(c) === storedKind(current)), null, SECTION_COUNT));
    return same(tab, own) && tab.every((id) => storedKind(lib.find((c) => c.id === id)) === storedKind(current))
      ? null
      : `${current.name}: ${tab} vs ${own}`;
  });
  every('unlocked, a menu section holds at most four, all of one kind',
    LIBRARY.flatMap((c) => LINE_SYSTEMS.map((ls) => ({ current: c, ls }))), ({ current, ls }) => {
      const s = switcherSections(LIBRARY, current, ls, false)!;
      const ok = (k: ChartKindOf) => s[k].length <= SECTION_COUNT && s[k].every((c) => storedKind(c) === k);
      return ok('event') && ok('person') ? null : current.name;
    });
  check('with No chart there is no section to cycle, so Tab stays Tab', tabCycleIds(LIBRARY, null, false).length === 0);
  check('  …while held, a null chart (an empty library) cycles what it always did',
    same(tabCycleIds(LIBRARY, null, true), ids(recentShortlist(LIBRARY, null))));
}

await initEphemeris();

// The English catalog as a `t`, for the builders' labels.
const tEn = (key: string, vars?: Record<string, string | number>) =>
  interpolate(resolvePath(en as unknown as Messages, key) ?? key, vars);

// Two timed charts and a moment to look at the sky from (the overlay builders' inputs).
const CHART_A: StoredChart = { ...SEED_BIRTHS[0], id: 'seed_0', createdAt: 0 };
// A second, made-up chart (another place and decade), so "any chart" means two.
const CHART_B: StoredChart = {
  id: 'c_other',
  createdAt: 1,
  name: 'Other Person',
  year: 1984, month: 11, day: 2, hour: 6, minute: 15,
  tzOffset: 1,
  birthplace: { label: 'Rome, Italy', lat: 41.9028, lng: 12.4964 },
};
const SKY_MS = Date.UTC(2026, 9, 20, 18, 30);
const FRAMES: timeline.TransitFrame[] = ['relative-to-natal', 'transit-moment'];

/** A layer's lines as App's overlay memos draw them in line system `ls` — projected and mapped
 *  at ONE given tilt (so a comparison sees what the layer itself does, not the map's tilt rule) —
 *  reduced to each line's first vertex, keyed by body and angle. */
function drawn(layer: timeline.OverlayLayer, ls: LineSystem, eps: number): Map<string, number> {
  const pos: PlanetPosition[] = ls === 'geodetic' ? projectOntoEcliptic(layer.positions, layer.jd, eps) : layer.positions;
  const ml = meridianLngFor(ls, eps, layer.gmst);
  const out = new Map<string, number>();
  for (const f of generateLines(pos, ml).features) {
    out.set(`${f.properties.planet} ${f.properties.lineType}`, f.geometry.coordinates[0][0]);
  }
  return out;
}
/** Whether two drawn sets are one set of lines (every key, each within a micro-degree). */
function sameLines(a: Map<string, number> | null, b: Map<string, number> | null): boolean {
  if (!a || !b) return a === b;
  if (a.size !== b.size || a.size === 0) return false;
  for (const [k, v] of a) {
    const w = b.get(k);
    if (w === undefined) return false;
    const d = Math.abs(((((v - w + 540) % 360) + 360) % 360) - 180);
    if (d > 1e-6) return false;
  }
  return true;
}

// ── 4. TWO PARTS AGREE: what choosing No chart holds, against what the map draws ──

console.log('\n── 4. TWO PARTS AGREE: the no-chart notice fires exactly when the drawn overlay moves ──');

{
  // For every overlay, on both maps, in both transit frames: what a chart in force draws (its
  // EFFECTIVE overlay, as App masks it, built by buildOverlay) against what the sky alone draws
  // (skyLayerFor — the call App's overlay memo makes with no chart). "Moved" is the reader's view:
  // the overlay in force changed, or its lines moved. noChartHoldChanges — the notice's `changed`
  // — must say "moved" exactly then (CLAUDE.md rule 3: a notice for a change that didn't happen
  // trains readers to dismiss notices unread; one missing leaves a change unattributed).
  const modes = timeline.OVERLAY_MODES as readonly timeline.OverlayMode[];
  const cases = LINE_SYSTEMS.flatMap((ls) => modes.flatMap((mode) => FRAMES.map((pref) => ({ ls, mode, pref }))));
  const rows = cases.map(({ ls, mode, pref }) => {
    const effMode: timeline.OverlayMode = timeline.overlayBlockedFor(CHART_A, ls)(mode) ? 'off' : mode;
    const effModeNone: timeline.OverlayMode = timeline.overlayBlockedFor(null, ls)(mode) ? 'off' : mode;
    // App's effTransitFrame for a timed chart with no borrow: Natal angles on a geodetic map.
    const effFrame: timeline.TransitFrame = ls === 'geodetic' ? 'relative-to-natal' : pref;
    const withChart =
      effMode === 'off'
        ? null
        : timeline.buildOverlay(CHART_A, effMode, SKY_MS, CHART_B, 'mean', 'mean-quotidian', 'ptolemy', 1, effFrame, 'secondary', tEn);
    const noChart = skyLayerFor(effModeNone, { targetDate: SKY_MS, eclipseMs: SKY_MS }, 'mean', tEn);
    const eps = obliquity(timeline.epochMsToJD(SKY_MS));
    const moved =
      effMode !== effModeNone || !sameLines(withChart && drawn(withChart, ls, eps), noChart && drawn(noChart, ls, eps));
    const changed = noChartHoldChanges({
      chartInForce: true,
      overlayMode: effMode,
      lineSystem: ls,
      transitFrame: effFrame,
      localSpaceOpen: false,
    });
    return { ls, mode, pref, effMode, effFrame, moved, changed, built: !!withChart };
  });
  every('the notice says "held" exactly when the overlay in force or its lines move', rows, (r) =>
    r.moved === r.changed ? null : `${r.ls} ${r.mode} ${r.pref}: moved ${r.moved}, notice ${r.changed}`,
  );
  check('  …both answers occur (the sweep is not one-sided)', rows.some((r) => r.changed) && rows.some((r) => !r.changed));
  check('  …and every overlay a chart can carry was built (nothing compared against nothing)',
    rows.filter((r) => r.mode !== 'off' && r.built).length >= modes.length);
  // The frame clause on its own, as the reader meets it: Transits on a celestial map in the
  // chart's frame moves; in the moment's own, and on any geodetic map, the sky is the same sky.
  const tr = (ls: LineSystem, pref: timeline.TransitFrame) => rows.find((r) => r.mode === 'transits' && r.ls === ls && r.pref === pref)!;
  check('Transits, celestial, Natal angles: the lines move to the moment’s frame, and the notice says so',
    tr('celestial', 'relative-to-natal').moved && tr('celestial', 'relative-to-natal').changed);
  check('  …in the moment’s own frame, or on a geodetic map, nothing moves and nothing is said',
    !tr('celestial', 'transit-moment').moved && !tr('celestial', 'transit-moment').changed &&
      FRAMES.every((p) => !tr('geodetic', p).moved && !tr('geodetic', p).changed));
  check('with no chart already in force, choosing it again holds nothing',
    modes.every((m) => LINE_SYSTEMS.every((ls) => [false, true].every((lsOpen) =>
      !noChartHoldChanges({ chartInForce: false, overlayMode: m, lineSystem: ls, transitFrame: 'relative-to-natal', localSpaceOpen: lsOpen })))));
  // The Local Space window (2026-10-20): with a chart in force an open one is put away by No
  // chart, so the notice fires for it in every case the sweep above found silent — and a
  // closed one adds nothing to any case.
  const silent = rows.filter((r) => !r.changed);
  check('an open Local Space window makes the notice fire where nothing else moved',
    silent.length > 0 &&
      silent.every((r) =>
        noChartHoldChanges({ chartInForce: true, overlayMode: r.effMode, lineSystem: r.ls, transitFrame: r.effFrame, localSpaceOpen: true })),
    `${silent.length} silent cases`);
}

// ── 5. TWO PARTS AGREE: the sky alone is the transit sky, line for line ─────

console.log('\n── 5. TWO PARTS AGREE: the sky alone draws the transits of any chart in the moment’s frame ──');

{
  // skyLayerFor's layer drawn as the overlay memos draw it, against buildOverlay's transit-moment
  // layer of two different charts, on both maps and at two tilts: the same lines, every one. The
  // eclipse chart likewise (its frame is the moment's whatever the chart). And on a geodetic map a
  // chart's Natal-angles transits too, since a geodetic line never reads the frame.
  const eps0 = obliquity(timeline.epochMsToJD(SKY_MS));
  const tilts = [eps0, obliquity(birthDataToJD(CHART_A))];
  const sky = skyLayerFor('transits', { targetDate: SKY_MS, eclipseMs: null }, 'mean', tEn)!;
  const sEcl = skyLayerFor('eclipses', { targetDate: SKY_MS, eclipseMs: SKY_MS }, 'mean', tEn)!;
  const pairs: { name: string; a: timeline.OverlayLayer; ls: LineSystem; eps: number }[] = [];
  for (const chart of [CHART_A, CHART_B])
    for (const ls of LINE_SYSTEMS)
      for (const eps of tilts) {
        pairs.push({ name: `${chart.name} transits ${ls}`, a: timeline.buildOverlay(chart, 'transits', SKY_MS, null, 'mean', 'mean-quotidian', 'ptolemy', 1, 'transit-moment', 'secondary', tEn)!, ls, eps });
        pairs.push({ name: `${chart.name} eclipse chart ${ls}`, a: timeline.buildOverlay(chart, 'eclipses', SKY_MS, null, 'mean', 'mean-quotidian', 'ptolemy', 1, 'relative-to-natal', 'secondary', tEn)!, ls, eps });
      }
  every('the sky alone’s lines are the transit-moment (and eclipse-chart) lines of any chart', pairs, (p) => {
    const mine = p.a.kind === 'eclipses' ? sEcl : sky;
    return sameLines(drawn(p.a, p.ls, p.eps), drawn(mine, p.ls, p.eps)) ? null : p.name;
  });
  const natalFrame = (chart: StoredChart) =>
    timeline.buildOverlay(chart, 'transits', SKY_MS, null, 'mean', 'mean-quotidian', 'ptolemy', 1, 'relative-to-natal', 'secondary', tEn)!;
  check('on a geodetic map a chart’s Natal-angles transits are the same lines too (the frame places no geodetic line)',
    [CHART_A, CHART_B].every((c) => sameLines(drawn(natalFrame(c), 'geodetic', eps0), drawn(sky, 'geodetic', eps0))));
  check('  …while on a celestial map they are not (so the comparison can see a frame)',
    [CHART_A, CHART_B].every((c) => !sameLines(drawn(natalFrame(c), 'celestial', eps0), drawn(sky, 'celestial', eps0))));
  check('the layer is marked sky-only and has no place under it (no local space can be cast from it)',
    sky.skyOnly === true && Number.isNaN(sky.originLat) && Number.isNaN(sky.originLng) && sEcl.skyOnly === true);
  check('with no chart, only the two sky overlays build anything; the eclipse chart only once its maximum is known',
    (timeline.OVERLAY_MODES as readonly timeline.OverlayMode[]).every((m) =>
      (skyLayerFor(m, { targetDate: SKY_MS, eclipseMs: SKY_MS }, 'mean', tEn) !== null) === (m === 'transits' || m === 'eclipses')) &&
      skyLayerFor('eclipses', { targetDate: SKY_MS, eclipseMs: null }, 'mean', tEn) === null);
}

// ── 6. TWO PARTS AGREE: the example event against the ephemeris ─────────────

console.log('\n── 6. TWO PARTS AGREE: the example event is the Sun’s own ingress ──');

{
  const JD_UNIX_EPOCH = 2440587.5;
  const jdOf = (ms: number) => JD_UNIX_EPOCH + ms / 86_400_000;
  const msOf = (jd: number) => (jd - JD_UNIX_EPOCH) * 86_400_000;
  const RAD = 180 / Math.PI;
  /** The Sun's apparent tropical longitude in degrees, wrapped to (−180, 180] — the
   *  wheel's own call. */
  const sunLon = (jd: number): number => {
    const sun = getEclipticPositions(jd).find((p) => p.name === 'Sun');
    if (!sun) return NaN;
    const d = sun.lon * RAD;
    return d > 180 ? d - 360 : d;
  };
  // Bisect the Sun through 0° between the 19th and the 21st of March 2026.
  let lo = jdOf(Date.UTC(2026, 2, 19));
  let hi = jdOf(Date.UTC(2026, 2, 21));
  const bracketed = sunLon(lo) < 0 && sunLon(hi) > 0;
  for (let i = 0; i < 60 && hi - lo > 1e-9; i++) {
    const mid = (lo + hi) / 2;
    if (sunLon(mid) < 0) lo = mid;
    else hi = mid;
  }
  const ingressMs = msOf((lo + hi) / 2);
  check('the Sun crosses 0° in the bracket (the bisection had something to find)', bracketed,
    `${sunLon(jdOf(Date.UTC(2026, 2, 19)))}° → ${sunLon(jdOf(Date.UTC(2026, 2, 21)))}°`);
  check('the exact-instant constant is the ephemeris’s ingress, within a second',
    bracketed && Math.abs(ingressMs - EXAMPLE_EVENT_EXACT_UT_MS) <= 1000,
    `${new Date(ingressMs).toISOString()} vs ${new Date(EXAMPLE_EVENT_EXACT_UT_MS).toISOString()}`);
  check('  …and the chart’s minute is that ingress rounded UP',
    EXAMPLE_EVENT_CHART_UT_MS === Math.ceil(ingressMs / 60_000) * 60_000, new Date(EXAMPLE_EVENT_CHART_UT_MS).toISOString());

  const seed = exampleEventChart(0);
  const castLon = sunLon(birthDataToJD(seed));
  check('the seeded record casts with the Sun in [0°, 0°01′) Aries',
    castLon >= 0 && castLon < 1 / 60, `${(castLon * 60).toFixed(3)}′`);
  check('  …named, filed and marked as R4 has it',
    seed.name === EXAMPLE_EVENT_NAME && EXAMPLE_EVENT_NAME === 'Aries Ingress 2026' &&
      seed.folder === EXAMPLE_EVENT_FOLDER && EXAMPLE_EVENT_FOLDER === 'Mundane/Ingresses' &&
      seed.kind === 'event' && seed.tzOffset === 0 && seed.tzIana === 'Europe/London' && seed.tzManual === false,
    JSON.stringify(seed));
  check('its id is deterministic and an example’s',
    exampleEventChart(1).id === EXAMPLE_EVENT_ID && exampleEventChart(2).id === EXAMPLE_EVENT_ID &&
      EXAMPLE_EVENT_ID === 'seed_aries_ingress_2026' && isSeedChart(seed));

  // Add example: once, then never again — the second call returns the very same array.
  const lib: StoredChart[] = [LIBRARY[0]];
  const once = withExampleEvent(lib, 1);
  const twice = withExampleEvent(once, 2);
  check('adding the example adds it once…', once.length === 2 && hasExampleEvent(once) && !hasExampleEvent(lib), String(once.length));
  check('  …and a second add changes nothing (the same array back, nothing to write)', twice === once);
  const renamed = once.map((c) => (c.id === EXAMPLE_EVENT_ID ? { ...c, name: 'My equinox', folder: 'Elsewhere' } : c));
  check('  …even after the reader renamed and refiled it', withExampleEvent(renamed, 3) === renamed);

  // The seeds: held, exactly the set from before event charts; unlocked, the example after.
  const NOW = 1_800_000_000_000;
  const heldSeeds = seedLibrary(true, NOW);
  const want = SEED_BIRTHS.map((b, i) => ({ ...b, id: `${SEED_CHART_ID_PREFIX}${i}`, createdAt: NOW + i }));
  check('held, the seeds are SEED_BIRTHS exactly, ids and order included', heldSeeds.length > 0 && same(heldSeeds, want),
    JSON.stringify(ids(heldSeeds)));
  const openSeeds = seedLibrary(false, NOW);
  check('  unlocked, the same people first (Jim Lewis still the chart a fresh install opens), then the example',
    same(openSeeds.slice(0, want.length), want) && openSeeds.length === want.length + 1 &&
      openSeeds[0].name === 'Jim Lewis' && openSeeds[openSeeds.length - 1].id === EXAMPLE_EVENT_ID,
    JSON.stringify(ids(openSeeds)));
}

// ── 7. INTERNAL IDENTITY: every no-chart reason is the one sentence ─────────

console.log('\n── 7. INTERNAL IDENTITY: with no chart, the reasons are one reason, said in one sentence ──');

{
  const t = (key: string, vars?: Record<string, string | number>) =>
    interpolate(resolvePath(en as unknown as Messages, key) ?? key, vars);
  const sentence = t(NEEDS_CHART_KEY);
  check('the needs-a-chart reason is in the English catalog', sentence !== NEEDS_CHART_KEY && sentence.trim().length > 0, sentence);
  check('  …one sentence for one fact: no placeholder, under the hover-tip cap',
    !/[{}]/.test(sentence) && sentence.length < 180, `${sentence.length} chars`);

  // The overlay menu's block reasons with no chart: exactly one reason appears, and it is
  // the no-chart reason — on every map, for exactly the techniques that advance or
  // compare a chart. (lib/astro/timeline; the menu maps 'no-chart' to the key above.)
  const modes = (timeline.OVERLAY_MODES ?? []) as readonly timeline.OverlayKind[];
  const blockedSet = (timeline as { NO_CHART_BLOCKED_OVERLAYS?: ReadonlySet<string> }).NO_CHART_BLOCKED_OVERLAYS;
  const rows = LINE_SYSTEMS.flatMap((ls) => modes.map((mode) => ({ ls, mode, reason: timeline.overlayBlockFor(null, ls)(mode) })));
  check('the timeline names a no-chart set', !!blockedSet && blockedSet.size > 0, String(blockedSet?.size));
  every('with no chart, a mode is blocked for want of a chart exactly when it is in that set', rows, ({ ls, mode, reason }) => {
    const want = blockedSet?.has(mode) ? 'no-chart' : null;
    // The one reason a held mode might give instead is the map's own, which the set
    // outranks today; anything else is a second reason for the same fact.
    return reason === want || (want === null && reason === 'geodetic') ? null : `${ls} ${mode}: ${String(reason)}`;
  });
  const free = rows.filter((r) => r.reason === null).map((r) => r.mode);
  check('  …and the sky’s own two stay free on a celestial map (Transits, Eclipses)',
    free.includes('transits') && free.includes('eclipses'), [...new Set(free)].join(','));
}

// ── 8. SOURCE TRIPWIRE: App's selection, its persistence and its one opener ─

console.log('\n── 8. SOURCE TRIPWIRE: App keeps the pick, derives the rest, and opens No chart in one place ──');

{
  // The failures these guard are the quiet kind CLAUDE.md rule 2 is about: a persist effect
  // pointed at the derived chart writes the first chart over a held device's "No chart" pick,
  // visible only the day the hold lifts. App can't be reached from Node, so its shape is read.
  const app = readFileSync('src/App.tsx', 'utf8').replace(/\r\n/g, '\n');
  const decl = (name: string): string | null => {
    const m = new RegExp(`const ${name}(?::[^=\\n]+)?(?:<[^>\\n]+>)? =\\s`).exec(app);
    if (!m) return null;
    const i = m.index;
    const indent = i - app.lastIndexOf('\n', i) - 1;
    const end = app.slice(i).search(new RegExp(`\\n {0,${indent}}\\S`));
    return end < 0 ? null : app.slice(i, i + end);
  };
  const shown = (s: string | null) => (s ?? 'not found').replace(/\s+/g, ' ').slice(0, 160);
  const persists = [...app.matchAll(/saveCurrentId\(([^;]*)\);/g)].map((m) => m[1]);
  check('the current-id key is written in one place, with the PICK (selectionToPersist(currentId, current))',
    persists.length === 1 && persists[0] === 'selectionToPersist(currentId, current)', persists.join(' | '));
  const effect = /saveCurrentId\(selectionToPersist\(currentId, current\)\);[\s\S]*?\}, \[([^\]]*)\]\);/.exec(app);
  check('  …in an effect that re-runs when the pick moves (currentId in its deps), not only the chart',
    !!effect && /\bcurrentId\b/.test(effect[1]) && /\bcurrent\b/.test(effect[1]), effect?.[1] ?? 'not found');
  check('the chart in force comes from resolveSelection over the pick, with the hold passed in',
    /resolveSelection\(charts, currentId, GEODETIC_HELD\)/.test(app) && /const storedCurrent = selection\.storedCurrent;/.test(app));
  const sky = decl('skyAlone');
  check('skyAlone reads the DERIVED chart and the hold: current === null && !GEODETIC_HELD',
    !!sky && /=\s*current === null && !GEODETIC_HELD;/.test(sky), shown(sky));
  const sel = decl('selectNoChart');
  check('selectNoChart refuses while held, announces through noChartHoldChanges, and writes only the sentinel',
    !!sel && /if \(GEODETIC_HELD\) return;/.test(sel) && /announceFlip\(\s*'no-chart-held',\s*noChartHoldChanges\(/.test(sel) &&
      /setCurrentId\(NO_CHART_ID\)/.test(sel) && !/setCharts\(/.test(sel), shown(sel));
  check('  …and nothing else in App writes the sentinel', (app.match(/setCurrentId\(NO_CHART_ID\)/g)?.length ?? 0) === 1);
  const add = decl('addExampleEvent');
  // Since 2026-10-21 event charts sit on the ADV rung: the refusal reads that gate.
  check('addExampleEvent refuses below the ADV rung, adds through withExampleEvent, and selects nothing',
    !!add && /if \(eventsLocked\) return;/.test(add) && /withExampleEvent\(prev, /.test(add) && !/setCurrentId\(/.test(add), shown(add));
  // The example is not seeded since 2026-10-21 (the tier is not known at module load).
  check('a fresh library is seedLibrary(true, …): no example seeded', /const seedCharts: StoredChart\[\] = seedLibrary\(true, /.test(app));
  check('the Tab swap cycles tabCycleIds, under the menu’s own hold', /const ids = tabCycleIds\(charts, current, eventsLocked\);/.test(app) && /const eventsLocked = GEODETIC_HELD \|\| !tierMet\(planTier, 'adv'\);/.test(app));
  // What Tab cycles is what its flash shows: App hands the session (tabCycleIds' ids, frozen)
  // to the menu, and the menu draws a flash from those ids, not from its folder shortlist.
  check('  …and the flash the menu draws is that list: App passes the session, the menu maps its ids',
    /setChartFlash\(session\);/.test(app) && /session = \{ ids, index: /.test(app) &&
      /flash\s*\?\s*flash\.ids\s*\.map\(\(id\) => charts\.find\(\(c\) => c\.id === id\)\)/.test(
        readFileSync('src/components/ChartSwitcher/ChartSwitcher.tsx', 'utf8').replace(/\r\n/g, '\n'),
      ));
  const frame = decl('effTransitFrame');
  check('with no chart the transit frame is the moment’s own (masked, the stored frame untouched)',
    !!frame && /!current \|\| noTime \|\| frameHeldForReturn/.test(frame), shown(frame));
  const promote = decl('promoteOverlay');
  check('the sky alone promotes its transits whatever the eye says', !!promote && /\(!showNatal \|\| skyAlone\)/.test(promote), shown(promote));
  const ls = decl('lsActive');
  check('local space is never drawn with no chart (the sky layer has no origin)', !!ls && /!skyAlone/.test(ls), shown(ls));
  check('the complete set casts no local space from a sky layer', /overlayLocalSpace = skyHeld \|\| overlayLayer\.skyOnly/.test(app));
  const lsSafe = decl('setShowLocalSpaceSafe');
  check('the Local Space opener refuses with no chart, through the ref', !!lsSafe && /if \(v && skyAloneRef\.current\) return;/.test(lsSafe), shown(lsSafe));
  // What No chart puts away and what it names are one value: the window hides on
  // `lsOpenWithChart && !skyAlone`, and the notice and the row's tip read `lsOpenWithChart`.
  const lsWin = decl('lsWindowOpen');
  check('an open Local Space window is put away with no chart, from lsOpenWithChart',
    !!lsWin && /lsKeptByLock \? advancedWheel : lsOpenWithChart && !skyAlone;/.test(lsWin), shown(lsWin));
  check('  …and selectNoChart’s notice and the No chart row’s tip name it from the same value',
    !!sel && /localSpaceOpen: lsOpenWithChart,/.test(sel) &&
      /\.\.\.\(lsOpenWithChart \? \[t\('topNav\.view\.localSpace'\)\] : \[\]\)/.test(decl('noChartHolds') ?? ''),
    shown(decl('noChartHolds')));
  const slide = decl('slideAvailable');
  check('Slide stands down with no chart', !!slide && /!skyAlone/.test(slide), shown(slide));
  check('Shift N stands down with no chart, and its row greys', /case 'n': if \(advancedWheel && !parked && !skyAlone\)/.test(app) && /natalLinesHeld=\{skyAlone\}/.test(app));
  check('  …and so does L, both ways: the window is put away then, so a press would flip the stored flag unseen',
    /case 'l': if \(advancedWheel && !getViewLock\(\) && !skyAlone\) setShowLocalSpaceSafe/.test(app));
  // The View-menu row is the key's other route to that write. The sky hold leaves an open row
  // live (its window stays up, showing the reason, so the row closes something); No chart puts
  // the window away, so the row greys open or shut, and still shows the stored tick.
  const topNav = readFileSync('src/components/TopNav/TopNav.tsx', 'utf8').replace(/\r\n/g, '\n');
  check('  …and so does its View-menu row, open or shut, still showing the stored tick',
    /heldWhy: skyHeld \? undefined : needsChartWhy, heldPutAway: skyAlone \}/.test(topNav) &&
      /const heldInert = held && \(!it\.checked \|\| !!it\.heldPutAway\);/.test(topNav) &&
      /disabled=\{!!it\.unavailable \|\| !reached \|\| heldInert\}/.test(topNav) &&
      /checked=\{it\.checked && !it\.unavailable\}/.test(topNav));
  // A held device with "No chart" stored shows the first chart: a returns borrow keyed on the
  // stored pick there would never take hold, while its notice still fired.
  const borrow = decl('frameHeldForReturn');
  check('a returns borrow belongs to the chart IN FORCE, which snapToReturn stamps — not the stored pick',
    !!borrow && /returnBorrow\.chartId === \(current\?\.id \?\? null\)/.test(borrow) &&
      /setReturnBorrow\(\{ body, ms: r\.ms, chartId: current\.id \}\)/.test(app), shown(borrow));
  check('both chart menus take the one bundle', (app.match(/switcherSky=\{switcherSky\}/g)?.length ?? 0) === 2);
  // The menu's own lists keep to the active chart's folder (only Tab left it, 2026-10-23): the
  // bundle hands it the hold the Tab swap reads and the derived line system its order follows.
  const bundle = decl('switcherSky');
  check('the bundle hands the menu the hold the Tab swap reads, and the derived line system',
    !!bundle && /eventsOn: !eventsLocked,/.test(bundle) && /\blineSystem,/.test(bundle), shown(bundle));
  const switcher = readFileSync('src/components/ChartSwitcher/ChartSwitcher.tsx', 'utf8').replace(/\r\n/g, '\n');
  check('  …and builds its sections and its held list scoped to the active chart (its folder)',
    /switcherSections\(charts, current, lineSystem, !eventsOn\)/.test(switcher) &&
      /recentShortlist\(charts, current\)/.test(switcher));
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
