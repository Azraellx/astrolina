// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the DOCK COLUMN (lib/dockColumn): how wide each docked panel is drawn when docks
// share the map column (run via the harness: `npm run verify:dock-column`). Its promises: a
// dock alone is drawn exactly as it was before a right dock existed; docks on opposite sides
// settle on ONE answer, whatever order they render in; and together they take no more than the
// column, the room going first to the dock opened or dragged last.
//
// The second promise is why this file exists. The module's first form (2026-10-08, morning)
// capped each side by the OTHER side's drawn width, and with both docks held by those caps
// above their minima the two handed the same room back and forth until React gave up (#185,
// maximum update depth — the app blanked with Reports and the Prism dock open together at 1366,
// 1440 with a stored Prism width of 420+, 1536 and 1600). §3 restates that retired rule only to
// prove §2 can fail: if the old rule settled everywhere on this grid, §2's "settles" would be
// a check of nothing.
//
// Every section says which KIND of assertion it makes, after verify-directions.ts §8:
//   IDENTITY — the code against a fixed rule or against itself. Breaking means the code
//              contradicts itself.
//   WITNESS  — the retired rule, run on the same grid, required to FAIL where the new one holds.
// No comparison here passes on an empty set: each counts what it compared and fails at zero.
//
//   §1 IDENTITY  one dock alone (and two on the same side): the clamp each dock applied itself
//                before 2026-10-08 — max(min, min(pref, cap, floor(vw − need)))
//   §2 IDENTITY  the answer settles: allocating again, or with the requests listed in another
//                order, gives the same widths; and no drawn width is an input to the next pass
//   §3 WITNESS   the retired pair of caps, re-rendered dock by dock from where the other was
//                drawn a render earlier, cycles on part of §2's grid
//   §4 IDENTITY  the rule: the newest dock is served first; each other dock gets what is left
//                and never less than its minimum; together they fit whenever both minima do;
//                sharing only ever narrows a dock; with room for both, order doesn't matter
//   §5 IDENTITY  the store: a request overridden for a drag, listeners only on real change

import {
  allocateDocks,
  dockWidthFor,
  nextDockStamp,
  publishDockRequest,
  publishMapColumnNeed,
  retireDockRequest,
  subscribeDockColumn,
  type DockRequest,
} from '../src/lib/dockColumn';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}
/** Pass when `bad` is empty AND something was compared — a check over nothing fails. */
function checkAll(label: string, compared: number, bad: string[]) {
  const ok = compared > 0 && bad.length === 0;
  check(
    `${label} (${compared} compared)`,
    ok,
    compared === 0 ? 'compared nothing' : bad.slice(0, 4).join('; ') + (bad.length > 4 ? ` … +${bad.length - 4}` : ''),
  );
}

// ── The docks the app has, with the minima and ceilings they publish ────────────────────────
// Restated from their own files (plugins/reports/ReportsPanel.tsx, components/ExpandedChart-
// Sidebar, plugins/custom-theme/ui/EditorFrame.tsx) so the grid covers the shapes that ship;
// the rule under test is the allocator's, not these numbers.
interface Kind {
  id: string;
  side: 'left' | 'right';
  min: (vw: number) => number;
  cap: (vw: number) => number;
  prefs: number[];
}
const REPORTS: Kind = {
  id: 'reports',
  side: 'left',
  min: () => 560,
  cap: (vw) => Math.min(vw * 0.78, 1180),
  prefs: [560, 700, 860, 1000, 1180],
};
const REPORTS_TOUCH: Kind = { ...REPORTS, id: 'reports', min: () => 378 };
const SIDEBAR: Kind = {
  id: 'expanded-sidebar',
  side: 'left',
  min: (vw) => Math.min(480, Math.min(vw * 0.7, 1200)),
  cap: (vw) => Math.min(vw * 0.7, 1200),
  prefs: [480, 720, 1000, 1200],
};
const PRISM: Kind = {
  id: 'custom-theme',
  side: 'right',
  min: () => 340,
  cap: (vw) => Math.min(vw * 0.4, 560),
  prefs: [340, 380, 420, 480, 560],
};
const VWS = [600, 768, 900, 1024, 1100, 1280, 1366, 1440, 1536, 1600, 1920, 2560];
const NEEDS = [0, 389, 403, 420, 470];

function req(k: Kind, vw: number, pref: number, stamp: number): DockRequest {
  return { side: k.side, pref, min: k.min(vw), cap: k.cap(vw), stamp };
}
/** The clamp each dock applied itself before 2026-10-08, with nothing on the far side. */
function oldAlone(r: DockRequest, vw: number, need: number): number {
  return Math.round(Math.max(r.min, Math.min(r.pref, r.cap, Math.max(0, Math.floor(vw - need)))));
}

// ── §1 One dock alone ───────────────────────────────────────────────────────────────────────
console.log('\n── §1 IDENTITY  one dock alone is drawn as before ──');
{
  let n = 0;
  const bad: string[] = [];
  for (const k of [REPORTS, REPORTS_TOUCH, SIDEBAR, PRISM]) {
    for (const vw of VWS) {
      for (const need of NEEDS) {
        for (const pref of [...k.prefs, 120, 5000]) {
          const r = req(k, vw, pref, 1);
          const got = allocateDocks(vw, need, { [k.id]: r })[k.id];
          const want = oldAlone(r, vw, need);
          n += 1;
          if (got !== want) bad.push(`${k.id} vw ${vw} need ${need} pref ${pref}: ${got} ≠ ${want}`);
        }
      }
    }
  }
  checkAll('1a a single dock equals max(min, min(pref, cap, floor(vw − need)))', n, bad);
}
{
  // Reports and the expanded sidebar are both LEFT docks: they overlap, so each is drawn as if
  // it were alone, in either order — exactly as before (they never capped each other).
  let n = 0;
  const bad: string[] = [];
  for (const vw of VWS) {
    for (const need of NEEDS) {
      for (const pa of REPORTS.prefs) {
        for (const pb of SIDEBAR.prefs) {
          for (const [sa, sb] of [[1, 2], [2, 1]]) {
            const a = req(REPORTS, vw, pa, sa);
            const b = req(SIDEBAR, vw, pb, sb);
            const got = allocateDocks(vw, need, { reports: a, 'expanded-sidebar': b });
            n += 1;
            if (got.reports !== oldAlone(a, vw, need) || got['expanded-sidebar'] !== oldAlone(b, vw, need)) {
              bad.push(`vw ${vw} need ${need} ${pa}/${pb} order ${sa}${sb}: ${JSON.stringify(got)}`);
            }
          }
        }
      }
    }
  }
  checkAll('1b two docks on the same side never squeeze each other', n, bad);
}

// The two-sided grid §2–§4 walk: every window × need × pair of prefs × open order, for
// Reports + Prism, and the three docks together in every order.
interface Case {
  vw: number;
  need: number;
  reqs: Record<string, DockRequest>;
  label: string;
}
const CASES: Case[] = [];
for (const vw of VWS) {
  for (const need of NEEDS) {
    for (const pl of REPORTS.prefs) {
      for (const pr of PRISM.prefs) {
        for (const [sl, sr] of [[1, 2], [2, 1]]) {
          CASES.push({
            vw,
            need,
            reqs: { reports: req(REPORTS, vw, pl, sl), 'custom-theme': req(PRISM, vw, pr, sr) },
            label: `vw ${vw} need ${need} R${pl}@${sl} P${pr}@${sr}`,
          });
        }
      }
    }
    const perms = [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]];
    for (const [a, b, c] of perms) {
      CASES.push({
        vw,
        need,
        reqs: {
          reports: req(REPORTS, vw, 860, a),
          'expanded-sidebar': req(SIDEBAR, vw, 1000, b),
          'custom-theme': req(PRISM, vw, 480, c),
        },
        label: `vw ${vw} need ${need} three@${a}${b}${c}`,
      });
    }
  }
}

// ── §2 The answer settles ───────────────────────────────────────────────────────────────────
console.log('\n── §2 IDENTITY  one answer, however often and in whatever order ──');
{
  let n = 0;
  const bad: string[] = [];
  for (const c of CASES) {
    const once = allocateDocks(c.vw, c.need, c.reqs);
    const twice = allocateDocks(c.vw, c.need, c.reqs);
    const reversed = allocateDocks(c.vw, c.need, Object.fromEntries(Object.entries(c.reqs).reverse()));
    n += 1;
    const s = JSON.stringify(once);
    const sortKeys = (o: Record<string, number>) => JSON.stringify(Object.fromEntries(Object.entries(o).sort()));
    if (s !== JSON.stringify(twice) || sortKeys(once) !== sortKeys(reversed)) bad.push(c.label);
  }
  checkAll('2a allocating again, or with the requests in another order, gives the same widths', n, bad);
}
{
  // The docks re-render from the allocation, and each re-render republishes a request — but a
  // request is the dock's own (pref, min, cap, stamp), never a width it was drawn at. Run that
  // loop: twenty passes in which every dock "re-renders" and republishes what it asks for, and
  // require the widths of pass 1 at pass 20. (Structural — the request type has no field a drawn
  // width could ride in — and run anyway, so the day one is added this is what notices.)
  let n = 0;
  const bad: string[] = [];
  for (const c of CASES) {
    let reqs = c.reqs;
    const first = JSON.stringify(allocateDocks(c.vw, c.need, reqs));
    let last = first;
    for (let pass = 0; pass < 20; pass++) {
      const drawn = allocateDocks(c.vw, c.need, reqs);
      reqs = Object.fromEntries(Object.entries(reqs).map(([id, r]) => [id, { ...r }]));
      last = JSON.stringify(drawn);
    }
    n += 1;
    if (last !== first) bad.push(`${c.label}: ${first} → ${last}`);
  }
  checkAll('2b twenty render passes later the widths are the first pass\'s', n, bad);
}

// ── §3 Witness: the retired rule cycles ─────────────────────────────────────────────────────
console.log('\n── §3 WITNESS  the retired pair of caps does not settle ──');
{
  // The first form: a dock's cap was the window less the far side's DRAWN width and the need,
  // its width that cap's clamp. Two docks opened one after the other settle (each reads the
  // other's settled width); then the column's need moves by a pixel — the nav re-measuring, a
  // resize — and BOTH docks re-render from where the other was drawn a render earlier. With
  // both held by the cap, every pair that fills the column is a fixed point, and the pair swaps
  // between two of them for ever.
  const oldW = (r: DockRequest, room: number) =>
    Math.round(Math.max(r.min, Math.min(r.pref, r.cap, Math.max(0, Math.floor(room)))));
  let n = 0;
  let cycles = 0;
  let newSettled = 0;
  const two = CASES.filter((c) => Object.keys(c.reqs).length === 2);
  for (const c of two) {
    const L = c.reqs.reports;
    const R = c.reqs['custom-theme'];
    const firstIsLeft = L.stamp < R.stamp;
    // Opened in stamp order, each settling on the other's published width.
    let l = 0;
    let r = 0;
    if (firstIsLeft) {
      l = oldW(L, c.vw - c.need);
      r = oldW(R, c.vw - l - c.need);
      l = oldW(L, c.vw - r - c.need);
    } else {
      r = oldW(R, c.vw - c.need);
      l = oldW(L, c.vw - r - c.need);
      r = oldW(R, c.vw - l - c.need);
    }
    const need = c.need + 1;
    const seen = new Set<string>();
    let settled = false;
    for (let pass = 0; pass < 50; pass++) {
      const nl = oldW(L, c.vw - r - need);
      const nr = oldW(R, c.vw - l - need);
      if (nl === l && nr === r) {
        settled = true;
        break;
      }
      const key = `${nl},${nr}`;
      if (seen.has(key)) break; // revisited: a cycle
      seen.add(key);
      l = nl;
      r = nr;
    }
    n += 1;
    if (!settled) cycles += 1;
    // The new rule under the same nudge: one answer, the same answer twice.
    const a = JSON.stringify(allocateDocks(c.vw, need, c.reqs));
    if (a === JSON.stringify(allocateDocks(c.vw, need, c.reqs))) newSettled += 1;
  }
  check(
    `3a the retired caps cycle on part of the grid (${cycles} of ${n} two-dock cases)`,
    n > 0 && cycles > 0,
    cycles === 0 ? 'the old rule settled everywhere: §2 would be checking nothing' : '',
  );
  check(`3b the allocator gives one answer on every one of them (${newSettled} of ${n})`, n > 0 && newSettled === n);
}

// ── §4 The rule ─────────────────────────────────────────────────────────────────────────────
console.log('\n── §4 IDENTITY  newest first, the rest take what is left ──');
{
  let n = 0;
  const bad = { newest: [] as string[], floor: [] as string[], fit: [] as string[], rest: [] as string[], narrow: [] as string[], order: [] as string[] };
  let fitCompared = 0;
  let restCompared = 0;
  let orderCompared = 0;
  for (const c of CASES) {
    const got = allocateDocks(c.vw, c.need, c.reqs);
    const avail = c.vw - c.need;
    const ids = Object.keys(c.reqs);
    const newest = ids.reduce((a, b) => (c.reqs[b].stamp > c.reqs[a].stamp ? b : a));
    const nr = c.reqs[newest];
    const farMin = Math.max(0, ...ids.filter((id) => c.reqs[id].side !== nr.side).map((id) => c.reqs[id].min));
    const wantNewest = Math.round(Math.max(nr.min, Math.min(nr.pref, nr.cap, Math.max(0, Math.floor(avail - farMin)))));
    n += 1;
    if (got[newest] !== wantNewest) bad.newest.push(`${c.label}: ${newest} ${got[newest]} ≠ ${wantNewest}`);
    for (const id of ids) {
      const r = c.reqs[id];
      if (got[id] < Math.round(r.min)) bad.floor.push(`${c.label}: ${id} ${got[id]} < ${r.min}`);
      const alone = oldAlone(r, c.vw, c.need);
      if (got[id] > alone) bad.narrow.push(`${c.label}: ${id} ${got[id]} > alone ${alone}`);
    }
    const foot = (side: 'left' | 'right') => Math.max(0, ...ids.filter((id) => c.reqs[id].side === side).map((id) => got[id]));
    const minOf = (side: 'left' | 'right') =>
      Math.max(0, ...ids.filter((id) => c.reqs[id].side === side).map((id) => Math.ceil(c.reqs[id].min)));
    if (minOf('left') + minOf('right') <= Math.floor(avail)) {
      fitCompared += 1;
      if (foot('left') + foot('right') > avail) bad.fit.push(`${c.label}: ${foot('left')} + ${foot('right')} > ${avail}`);
    }
    if (ids.length === 2) {
      // The older of two takes what the newest left, down to its own minimum.
      const older = ids.find((id) => id !== newest)!;
      const or = c.reqs[older];
      const want = Math.round(Math.max(or.min, Math.min(or.pref, or.cap, Math.max(0, Math.floor(avail - got[newest])))));
      restCompared += 1;
      if (got[older] !== want) bad.rest.push(`${c.label}: ${older} ${got[older]} ≠ ${want}`);
    }
    // Room for every dock at its own width alone: then who opened last changes nothing.
    const aloneFoot = (side: 'left' | 'right') =>
      Math.max(0, ...ids.filter((id) => c.reqs[id].side === side).map((id) => oldAlone(c.reqs[id], c.vw, c.need)));
    if (aloneFoot('left') + aloneFoot('right') <= avail) {
      orderCompared += 1;
      for (const id of ids) {
        if (got[id] !== oldAlone(c.reqs[id], c.vw, c.need)) bad.order.push(`${c.label}: ${id} ${got[id]}`);
      }
    }
  }
  checkAll('4a the dock opened or dragged last keeps min(pref, cap, column − the far side\'s minima)', n, bad.newest);
  checkAll('4b no dock is ever drawn under its own minimum', n, bad.floor);
  checkAll('4c together they fit the column whenever both sides\' minima do', fitCompared, bad.fit);
  checkAll('4d the older of two takes what the newest left, down to its minimum', restCompared, bad.rest);
  checkAll('4e sharing only ever narrows a dock: never wider than it would be alone', n, bad.narrow);
  checkAll('4f with room for both at their own widths, the order changes nothing', orderCompared, bad.order);
}

// ── §5 The store ────────────────────────────────────────────────────────────────────────────
console.log('\n── §5 IDENTITY  the store ──');
{
  // The harness runs under Node: a window of one fixed width, with nobody resizing it.
  (globalThis as unknown as { window: unknown }).window = {
    innerWidth: 1440,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  let heard = 0;
  const unsub = subscribeDockColumn(() => {
    heard += 1;
  });
  const s1 = nextDockStamp();
  const s2 = nextDockStamp();
  check('5a stamps only ever rise', s2 > s1, `${s1} → ${s2}`);
  publishMapColumnNeed(402.3);
  const needHeard = heard;
  publishMapColumnNeed(403); // the same need, ceil'd: nothing to hear
  const prism: DockRequest = { side: 'right', pref: 480, min: 340, cap: 560, stamp: s1 };
  publishDockRequest('custom-theme', prism);
  const afterPublish = heard;
  publishDockRequest('custom-theme', { ...prism });
  check(
    '5b listeners hear a real change only (a need, a request), not a repeat of either',
    needHeard === 1 && afterPublish === 2 && heard === 2,
    `need ${needHeard}, publish ${afterPublish}, repeat ${heard}`,
  );
  const reports: DockRequest = { side: 'left', pref: 860, min: 560, cap: 1123.2, stamp: s2 };
  const want = allocateDocks(1440, 403, { 'custom-theme': prism, reports });
  check(
    '5c dockWidthFor reads the published requests, with the asking dock\'s own in place',
    dockWidthFor('reports', reports) === want.reports,
    `${dockWidthFor('reports', reports)} vs ${want.reports}`,
  );
  // A drag asks with a request it hasn't published: that one, not the stored, is the answer.
  const dragged = { ...prism, pref: 560, stamp: nextDockStamp() };
  const wantDrag = allocateDocks(1440, 403, { 'custom-theme': dragged });
  check(
    '5d a drag\'s request replaces the dock\'s published one for the answer',
    dockWidthFor('custom-theme', dragged) === wantDrag['custom-theme'],
    `${dockWidthFor('custom-theme', dragged)} vs ${wantDrag['custom-theme']}`,
  );
  const beforeRetire = heard;
  retireDockRequest('nobody');
  retireDockRequest('custom-theme');
  check('5e retiring a dock that isn\'t there is silent; retiring one that is, heard once', heard === beforeRetire + 1);
  unsub();
  publishMapColumnNeed(0);
}

console.log(failures === 0 ? '\nverify-dock-column: ALL PASS' : `\nverify-dock-column: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
