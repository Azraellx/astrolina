// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Ring layout: nothing on a chart wheel's glyph ring may overlap anything else,
// and the angle codes (AS/MC/DS/IC/Vx/Avx) must keep the exact spot where their
// axis crosses the ring — and, given the house cusps (since 2026-10-23, the sections
// at the foot), a body's centre must stay in its own house wherever the house can
// hold it, which outranks a code's spot.
//
// Those two pull against each other, which is why this is worth asserting rather
// than eyeballing: the second is what makes the first hard, and the cases where
// it breaks are the ones nobody opens by hand — a stellium landing on the
// Midheaven, the Vertex axis switched on, a polar chart where the Midheaven and
// the Ascendant are three degrees apart, the minor bodies all on at the narrowest
// sidebar width. Every one of those was failing at some point while this was
// written.
//
// Pure geometry: no ephemeris, no DOM. Bodies are placed by longitude alone, so
// generated charts are as good as real ones for the question being asked.
//
//   npm run verify:wheel-layout

import {
  BODY_OVERLAP_SHARE,
  HOUSE_INSET_SHARE,
  MAX_PUSH_DEG,
  RING_PAD_PX,
  arcDeg,
  layOutRing,
  pavConvex,
  placeOnRing,
  type PavTerm,
  type RingMark,
} from '../src/lib/ringLayout';
import {
  MINOR_RING_ENABLED,
  MINOR_RING_MIN,
  angleLabelHalfPx,
  wheelGeometry,
  type WheelGeometry,
} from '../src/lib/wheelGeometry';
import { WALL_HALF_PX, layoutMinorRing, minorRingWalls, ringSpokes } from '../src/lib/wheelRingLayout';
import { cuspsInOrder, houseIndexOf } from '../src/lib/houses';

// ── The wheel's own figures, from the wheel's own module ───────────────────
// These used to be restated here: an em table copied out of WheelSvg, a DISC_HALF
// hardcoded at 11 + 1.3/2, and a geom() that recomputed every radius with
// `advanced` pinned false and the readout tier pinned to 440px.
//
// That is how this suite stayed green straight through a phone-sized wheel whose
// aspect hub had collapsed to 12px and whose house band could reach zero: it was
// asserting against figures the app had stopped using. A restated formula is a
// copy of the code under test, and it passes when both are wrong in the same way.
//
// The geometry now comes from the same function the renderer calls, so a change to
// the band budget lands here as a failure rather than as a test agreeing with its
// own copy of the old numbers.
const geom = (size: number, advanced: boolean): WheelGeometry =>
  wheelGeometry({ size, detailed: true, advanced });

// The codes as the wheel DRAWS them (format.ts ANGLE_LABEL), since their widths are
// what is being reserved: AS, MC, DS, IC since 2026-10-02.
const angles4 = (asc: number, mc: number): [string, number][] => [
  ['AS', asc], ['MC', mc], ['DS', (asc + 180) % 360], ['IC', (mc + 180) % 360],
];
const angles6 = (asc: number, mc: number, vx: number): [string, number][] => [
  ...angles4(asc, mc), ['Vx', vx], ['Avx', (vx + 180) % 360],
];
const marks = (codes: [string, number][], bodies: [string, number][], g: WheelGeometry) => ({
  fixed: codes.map(([name, off]): RingMark => ({
    name,
    off,
    half: angleLabelHalfPx(name, g.angleCodePx, g.angleCodeHalo),
  })),
  movable: bodies.map(([name, off]): RingMark => ({ name, off, half: g.discHalf })),
});

interface Audit {
  /** Pairs closer than they are allowed to be. Two BODIES may share
   *  BODY_OVERLAP_SHARE of their combined width — a third of a glyph clipped beats
   *  a planet pushed across a house cusp, and the glyphs stay distinguishable. A
   *  pair involving an angle CODE may not overlap at all: the code is drawn with a
   *  panel-coloured halo that erases what it lands on, so an overlap there deletes
   *  the other mark rather than crowding it. */
  overlaps: string[];
  /** Pairs that ended up closer than FULL clearance — i.e. actually sharing ink,
   *  within the tolerance. The tolerance is a last resort, so this counts how often
   *  the last resort was reached; on a chart with room it should be zero. */
  sharedInk: number;
  /** How far the furthest body ended up from its true longitude, in degrees. Not
   *  asserted — reported, because it is the cost the tolerance above is buying
   *  down, and a number nobody was watching is how it reached 69° on a phone. */
  maxPushDeg: number;
  movedCodes: string[];
  /** Total ink round the ring — reported, not asserted on. */
  inkDeg: number;
  /** What the ring actually DEMANDS: every adjacent pair's clearance, which is
   *  ink plus RING_PAD_PX plus the minimum separation floor — the same figure
   *  placeOnRing computes. Past 360° no arrangement can satisfy every pair, and
   *  the layout deliberately shrinks the requirements and accepts an overlap.
   *
   *  This used to be measured as inkDeg, which counts the ink and nothing else. A
   *  ring can be well under 360° of ink and still be unsatisfiable once the pad and
   *  the separation floor are charged — so the suite was calling those cases
   *  failures when the layout was doing exactly what it says it does under load. */
  demandDeg: number;
  dropped: boolean;
}
function audit(
  fixed: RingMark[],
  movable: RingMark[],
  out: Map<string, number>,
  rPlanets: number,
  sep: number,
): Audit {
  const all = [...fixed, ...movable].map((m) => ({ ...m, at: out.get(m.name) }));
  if (all.some((m) => m.at === undefined)) {
    return {
      overlaps: [],
      movedCodes: [],
      sharedInk: 0,
      maxPushDeg: 0,
      inkDeg: 0,
      demandDeg: 0,
      dropped: true,
    };
  }
  const s = all.sort((a, b) => a.at! - b.at!);
  const codeNames = new Set(fixed.map((m) => m.name));
  const overlaps: string[] = [];
  let demandDeg = 0;
  let sharedInk = 0;
  for (let i = 0; i < s.length && s.length > 1; i++) {
    const a = s[i];
    const b = s[(i + 1) % s.length];
    demandDeg += Math.max(sep, arcDeg(a.half + b.half + RING_PAD_PX, rPlanets));
    const gapPx = ((((((b.at! - a.at!) % 360) + 360) % 360) * Math.PI) / 180) * rPlanets;
    // Ink to ink, less whatever overlap this pair is allowed. The hairline pad and
    // the readout floor are comfort, not correctness; THIS is the line that must
    // never be crossed — and where a code is involved it is the full ink, because
    // the halo erases rather than crowds.
    const bothBodies = !codeNames.has(a.name) && !codeNames.has(b.name);
    if (bothBodies && gapPx + 1e-6 < a.half + b.half) sharedInk += 1;
    const allowed = (a.half + b.half) * (bothBodies ? 1 - BODY_OVERLAP_SHARE : 1);
    if (gapPx + 1e-6 < allowed) {
      overlaps.push(
        `${a.name}|${b.name} ${gapPx.toFixed(1)}px < ${allowed.toFixed(1)}px` +
          `${bothBodies ? ` (tolerated ${(100 * BODY_OVERLAP_SHARE).toFixed(0)}%)` : ' (code — no tolerance)'}`,
      );
    }
  }
  // The push is measured against where the mark ASKED to be, on the short way round.
  const push = (m: { name: string; off: number }) =>
    Math.abs(((out.get(m.name)! - m.off + 540) % 360) - 180);
  const maxPushDeg = movable.length ? Math.max(...movable.map(push)) : 0;
  return {
    overlaps,
    sharedInk,
    maxPushDeg,
    movedCodes: fixed
      .filter((f) => Math.abs(((out.get(f.name)! - f.off + 540) % 360) - 180) > 1e-6)
      .map((f) => f.name),
    inkDeg: all.reduce((n, m) => n + arcDeg(2 * m.half, rPlanets), 0),
    demandDeg,
    dropped: false,
  };
}

let failures = 0;
function check(
  label: string,
  size: number,
  codes: [string, number][],
  bodies: [string, number][],
  codesMustHold = true,
  advanced = false,
) {
  const g = geom(size, advanced);
  const { rPlanets, ringSep: sep } = g;
  const { fixed, movable } = marks(codes, bodies, g);
  const r = audit(fixed, movable, placeOnRing(fixed, movable, sep, rPlanets, g.bodyOverlap), rPlanets, sep);
  const ok = !r.dropped && r.overlaps.length === 0 && (!codesMustHold || r.movedCodes.length === 0);
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${label}` +
      `  [${size}px${advanced ? ' adv' : ''}, codes held: ${r.movedCodes.length === 0 ? 'all' : `all but ${r.movedCodes.join(',')}`}` +
      `, worst push ${r.maxPushDeg.toFixed(1)}°` +
      `, overlaps: ${r.overlaps.length}]`,
  );
  if (r.dropped) console.log('        a mark was dropped from the layout');
  r.overlaps.slice(0, 4).forEach((o) => console.log('        ' + o));
}

const TEN = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
const ALL19 = [...TEN, 'NorthNode', 'SouthNode', 'Lilith', 'Chiron', 'Ceres', 'Pallas', 'Juno', 'Vesta', 'Fortune'];
const at = (names: string[], lons: number[]): [string, number][] =>
  names.map((n, i) => [n, lons[i]]);

console.log('the codes hold their axis, and nothing overlaps');
check('bodies well spread', 560, angles4(0, 272), at(TEN, [12, 40, 66, 95, 130, 165, 200, 232, 300, 335]));
check('bodies exactly ON the AS and the MC', 560, angles4(0, 272), at(TEN, [0, 1, 272, 273, 130, 165, 200, 232, 300, 335]));
check('stellium straddling the MC', 800, angles4(0, 272), at(TEN, [268, 270, 271, 272, 274, 276, 165, 200, 300, 335]));
check('Vertex axis on, narrowest sidebar', 320, angles6(0, 272, 47), at(TEN, [5, 44, 50, 95, 130, 165, 200, 232, 300, 335]));
// The reported configuration: a portrait phone gives the wheel ~380px, and these
// users had Advanced on. Neither the size nor the flag was covered before.
check('phone wheel, Advanced on', 380, angles4(0, 272), at(TEN, [12, 40, 66, 95, 130, 165, 200, 232, 300, 335]), true, true);
check('phone wheel, Advanced, stellium on the MC', 380, angles4(0, 272), at(TEN, [268, 270, 271, 272, 274, 276, 165, 200, 300, 335]), true, true);
// Over-subscribed on purpose: five of the nineteen fall in the 47° arc between the
// AS and the Vx, which needs 61°. The codes cannot all hold, and the suite says so
// rather than pretending otherwise — what is still asserted is that nothing overlaps.
check('phone wheel, Advanced, all 19 bodies', 380, angles6(0, 272, 47), at(ALL19, [12, 20, 28, 36, 44, 95, 130, 165, 200, 232, 250, 268, 285, 300, 315, 330, 340, 350, 5]), false, true);
check('smallest sidebar, Advanced on', 280, angles4(0, 272), at(TEN, [12, 40, 66, 95, 130, 165, 200, 232, 300, 335]), true, true);
check('every body conjunct some angle', 700, angles4(0, 90), at(TEN, [0, 0.4, 0.8, 1.2, 90, 90.4, 180, 180.4, 270, 270.4]));
check('no angle marks at all', 560, [], at(TEN, [10, 11, 12, 13, 14, 120, 121, 240, 241, 242]));
check('one body, one angle', 560, [['MC', 100]], at(['Sun'], [100]));

console.log('\npolar chart: the MC is 3° from the AS, so the codes CANNOT all hold');
check('MC 3° from AS', 560, angles4(0, 3), at(TEN, [90, 120, 150, 180, 210, 240, 270, 300, 330, 45]), false);
check('MC 1° from AS, a body in the sliver', 560, angles4(0, 1), at(TEN, [0.5, 120, 150, 180.5, 210, 240, 270, 300, 330, 45]), false);

// ── Generated charts ──────────────────────────────────────────────────────
// Deterministic (fixed seed) so a failure is reproducible.
let seed = 987654321;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function sweep(
  label: string,
  n: number,
  gen: () => {
    size: number;
    codes: [string, number][];
    bodies: [string, number][];
    advanced: boolean;
  },
  // The geometry the charts are laid out on — a single wheel unless a caller says
  // otherwise (the bi-wheel sweep further down).
  mk: (size: number, advanced: boolean) => WheelGeometry = geom,
) {
  let bad = 0;
  let full = 0;
  let yielded = 0;
  let worstPush = 0;
  let overSign = 0;
  let touching = 0;
  for (let t = 0; t < n; t++) {
    const { size, codes, bodies, advanced } = gen();
    const g = mk(size, advanced);
    const { rPlanets, ringSep: sep } = g;
    const { fixed, movable } = marks(codes, bodies, g);
    const r = audit(fixed, movable, placeOnRing(fixed, movable, sep, rPlanets, g.bodyOverlap), rPlanets, sep);
    if (r.dropped) bad += 1;
    else if (r.demandDeg > 360) full += 1;
    else {
      if (r.overlaps.length) bad += 1;
      if (r.movedCodes.length) yielded += 1;
      worstPush = Math.max(worstPush, r.maxPushDeg);
      // 30° is a whole sign. Past it a body is certainly drawn in a house it is
      // not in, which is the cost BODY_OVERLAP_SHARE exists to buy down — so it
      // is counted rather than left to be noticed in a screenshot.
      if (r.maxPushDeg > 30) overSign += 1;
      if (r.sharedInk > 0) touching += 1;
    }
  }
  if (bad) failures += 1;
  console.log(
    `${bad ? 'FAIL' : 'ok  '}  ${label}: ${n} charts, ${bad} overlapping` +
      `, ${full} rings that cannot satisfy every clearance` +
      `, ${yielded} (${((100 * yielded) / n).toFixed(1)}%) where a code had to yield` +
      `
        worst push ${worstPush.toFixed(1)}°, ${overSign} chart(s) with a body pushed past a whole sign` +
      `, ${touching} where a pair had to share ink`,
  );
}

console.log('\ngenerated charts');
sweep('adversarial (angles anywhere, bodies bunched)', 5000, () => {
  const size = [280, 300, 340, 380, 440, 500, 560, 700, 800, 900][Math.floor(rnd() * 10)];
  const advanced = rnd() < 0.5;
  const asc = rnd() * 360;
  const codes = rnd() < 0.5 ? angles4(asc, rnd() * 360) : angles6(asc, rnd() * 360, rnd() * 360);
  const count = 4 + Math.floor(rnd() * 16);
  const tight = rnd() < 0.5;
  const centre = rnd() * 360;
  return {
    size,
    advanced,
    codes,
    bodies: ALL19.slice(0, count).map((n): [string, number] => [
      n,
      tight ? (centre + rnd() * 50) % 360 : rnd() * 360,
    ]),
  };
});
sweep('realistic (MC 55–125° from AS, inner bodies near the Sun)', 5000, () => {
  const size = [340, 380, 440, 500, 560, 700, 800][Math.floor(rnd() * 7)];
  const advanced = rnd() < 0.5;
  const asc = rnd() * 360;
  const mc = (asc + 55 + rnd() * 70) % 360;
  const codes = rnd() < 0.5 ? angles4(asc, mc) : angles6(asc, mc, (asc + 120 + rnd() * 120) % 360);
  const count = rnd() < 0.35 ? 19 : 10;
  const sun = rnd() * 360;
  return {
    size,
    advanced,
    codes,
    bodies: ALL19.slice(0, count).map((n, i): [string, number] => [
      n,
      (((i < 3 ? sun + (rnd() - 0.5) * 90 : rnd() * 360) % 360) + 360) % 360,
    ]),
  };
});


// ── Resizing the wheel ─────────────────────────────────────────
// A wheel is resized CONTINUOUSLY — a dragged sidebar, a rotated phone, a window
// pulled wider — so the layout has to be a continuous function of its size. Nothing
// above asserts that. Every check so far looks at one size and asks whether that
// answer is good, and a layout can pass all of them at 620px and all of them at
// 700px while putting a body on opposite sides of its notch in the two.
//
// Which is what it did. The re-centring pass that used to follow the relaxation
// grouped marks into runs by whether they were sitting at their requirement, slid
// each run to its members’ mean, and could not ungroup: a body nudged a single
// degree into the run ahead of it then paid that run’s whole shift. Whether it was
// nudged turned on a hair, so the drawn answer jumped. On the chart this was
// reported from, Venus sat on its notch at 620px and at 900px and 7–8° away at 700px
// and 800px, and a reader widening the sidebar watched it flip back and forth.
//
// This is the property that reader sees, asserted directly rather than through a
// figure restated from the solver. Two discontinuities are declared and excluded,
// and only two:
//
//   • the shed ladder swapping rungs. The wheel is drawing a different set of
//     things either side of that step, so its marks are entitled to move.
//   • a ring so full that the angle codes had to give up their axis. placeOnRing
//     says so by moving them, and in that regime there is no stable arrangement to
//     be continuous about.
//
// What is left is every ordinary chart, and it must not move. 5° is the bound
// because the readout font and the glyph disc STEP with the wheel (11px to 12px at
// 620px, and so on), and a mark whose width jumps drags its neighbours; measured
// across 200 charts and the whole 280–900px range the worst is 4.9°, every one of
// them at a font step. The layout itself contributes nothing: 96% of one-pixel
// steps move every body by less than a quarter of a degree.
const detailKey = (g: WheelGeometry) =>
  [g.detail.readout, g.detail.readoutSign, g.detail.readoutMin, g.detail.cuspRim].join(',');

const MAX_RESIZE_JUMP_DEG = 5;

function resizeSweep(label: string, charts: number, bodyCount: number) {
  let worst = 0;
  let worstAt = '';
  let compared = 0;
  let quiet = 0;
  for (let c = 0; c < charts; c++) {
    const advanced = rnd() < 0.5;
    const asc = rnd() * 360;
    const mc = (asc + 55 + rnd() * 70) % 360;
    const codes = angles4(asc, mc);
    const sun = rnd() * 360;
    const bodies = ALL19.slice(0, bodyCount).map((name, i): [string, number] => [
      name,
      (((i < 3 ? sun + (rnd() - 0.5) * 90 : rnd() * 360) % 360) + 360) % 360,
    ]);
    const at = (size: number) => {
      const g = geom(size, advanced);
      const { fixed, movable } = marks(codes, bodies, g);
      const out = placeOnRing(fixed, movable, g.ringSep, g.rPlanets, g.bodyOverlap);
      const held = fixed.every(
        (m) => Math.abs(((out.get(m.name)! - m.off + 540) % 360) - 180) <= 1e-6,
      );
      return { out, held, key: detailKey(g) };
    };
    let prev = at(280);
    for (let size = 281; size <= 900; size++) {
      const cur = at(size);
      const comparable = prev.key === cur.key && prev.held && cur.held;
      if (comparable) {
        compared += 1;
        let jump = 0;
        let who = '';
        for (const [name] of bodies) {
          const a = prev.out.get(name);
          const b = cur.out.get(name);
          if (a === undefined || b === undefined) continue;
          const d = Math.abs(((b - a + 540) % 360) - 180);
          if (d > jump) {
            jump = d;
            who = name;
          }
        }
        if (jump <= 0.25) quiet += 1;
        if (jump > worst) {
          worst = jump;
          worstAt = `${size - 1}→${size}px, ${who}`;
        }
      }
      prev = cur;
    }
  }
  const ok = worst <= MAX_RESIZE_JUMP_DEG;
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${label}: ${compared} one-pixel steps` +
      `, worst move ${worst.toFixed(2)}° (${worstAt})` +
      `, ${((100 * quiet) / compared).toFixed(1)}% moved nothing`,
  );
}

console.log('\nresizing one pixel at a time does not move a body across its notch');
resizeSweep('ten bodies, 280–900px', 60, 10);
resizeSweep('all nineteen, 280–900px', 40, 19);

// ══ Catalog minor bodies ══════════════════════════════════════════════════
// Catalog bodies (lib/minorBodies/wheel) can be drawn two ways. Below the gate
// (MINOR_RING_MIN), on every bi-wheel and on the minimap each is a rim diamond at its
// true degree, which costs no radius, and the natal ring above must come out exactly as
// it does without them. On a single wheel at and above the gate they get a ring of coins
// of their own, laid out by lib/wheelRingLayout — the function WheelSvg calls, imported
// here rather than restated — with the chart's four axes as walls, and the planet ring
// stepped inward to make room.
//
// The ring is ON (MINOR_RING_ENABLED, lib/wheelGeometry, where the tuning that brought
// it back is written up), and every section about it below is an assertion on the
// budget written into it. Switch it off and the same sections print as measurements
// ("measured — ring disabled", a break as `meas`) without failing the suite.
//
// The BI-WHEEL is never granted the ring, at any size. Its would-be cost is still laid
// out through `measureMinorRing` from the same gate and printed on every run, as a
// FINDING ("measured — bi-wheel, never granted") that never fails the suite: it is the
// reason for the exclusion, and the baseline if anyone revisits it. What a bi-wheel
// actually draws — the built-ins exactly as without catalog bodies — is asserted.
//
// Each section says which kind of assertion it makes, after verify-directions.ts §8,
// because the kinds break for different reasons:
//   IDENTITY           the layout against its own contract, or against itself.
//   AGREEMENT          two parts of the wheel drawn independently must agree about the
//                      same thing — a coin, laid out, and the axis line, drawn at the
//                      angle, must put the body on the same side.
//   OUTSIDE-AGREEMENT  measured against what a reader needs rather than against the
//                      arithmetic — a planet drawn in its own sign, a mark that holds
//                      still while the sidebar is dragged. A break means the module is
//                      self-consistent and still wrong.
//
// Every section runs on its own seed, so none of them depends on how many draws the
// sections above happened to take.
const seeded = (s: number) => () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
/** A wheel as the app draws it, catalog bodies on it (`minorRing`) or not. */
const geomWith = (size: number, advanced: boolean, hasOverlay: boolean, minorRing: boolean) =>
  wheelGeometry({ size, detailed: true, advanced, hasOverlay, minorRing });
/** The same wheel with the catalog ring laid out whether or not it is switched on, and on
 *  a bi-wheel too, which is never granted it — the only way to reach either. The gate
 *  still applies. */
const ringGeom = (size: number, advanced: boolean, hasOverlay: boolean) =>
  wheelGeometry({ size, detailed: true, advanced, hasOverlay, minorRing: true, measureMinorRing: true });
/** Whether the app's geometry may grant the ring at this size at all. */
const ringGrantable = (size: number, hasOverlay: boolean) =>
  MINOR_RING_ENABLED && !hasOverlay && size >= MINOR_RING_MIN;

/** The label on a section about the ring: nothing while it is on and the wheel is one
 *  that gets it, and a measurement otherwise. */
const measuredLabel = (hasOverlay: boolean) =>
  hasOverlay ? ' [measured — bi-wheel, never granted]' : MINOR_RING_ENABLED ? '' : ' [measured — ring disabled]';
const MEASURED = measuredLabel(false);
let measuredBreaks = 0;
let biWheelBreaks = 0;
let measuredFindings = 0;
/** The verdict on a section about the ring itself: a break fails the suite while the ring
 *  is switched on — except on a bi-wheel, which never gets it, so a break there is the
 *  measured finding the exclusion rests on. Either way a non-failing break prints as
 *  `meas` and is counted apart. */
function ringVerdict(ok: boolean, hasOverlay = false): string {
  if (ok) return 'ok  ';
  if (hasOverlay) {
    biWheelBreaks += 1;
    return 'meas';
  }
  if (MINOR_RING_ENABLED) {
    failures += 1;
    return 'FAIL';
  }
  measuredBreaks += 1;
  return 'meas';
}
/** The verdict on a measured FINDING that is not the ring's at all — printed, never
 *  failed (the bi-wheel's own resize behaviour, below). */
function findingVerdict(ok: boolean): string {
  if (ok) return 'ok  ';
  measuredFindings += 1;
  return 'meas';
}

/** The realistic generator above (MC 55–125° from the AS, inner bodies near the Sun, a
 *  third of charts with all nineteen bodies), on a caller's own seed. */
function realisticChart(r: () => number, count = r() < 0.35 ? 19 : 10) {
  const advanced = r() < 0.5;
  const asc = r() * 360;
  const mc = (asc + 55 + r() * 70) % 360;
  const codes = r() < 0.5 ? angles4(asc, mc) : angles6(asc, mc, (asc + 120 + r() * 120) % 360);
  const sun = r() * 360;
  const bodies = ALL19.slice(0, count).map((n, i): [string, number] => [
    n,
    (((i < 3 ? sun + (r() - 0.5) * 90 : r() * 360) % 360) + 360) % 360,
  ]);
  return { advanced, codes, bodies };
}
/** The natal ring exactly as WheelSvg lays it out on geometry `g`. */
function natalRing(g: WheelGeometry, codes: [string, number][], bodies: [string, number][]) {
  const { fixed, movable } = marks(codes, bodies, g);
  const out = placeOnRing(fixed, movable, g.ringSep, g.rPlanets, g.bodyOverlap);
  const push = (name: string, off: number) => Math.abs(((out.get(name)! - off + 540) % 360) - 180);
  return {
    out,
    held: fixed.every((m) => push(m.name, m.off) <= 1e-6),
    worstPush: bodies.length ? Math.max(...bodies.map(([n, o]) => push(n, o))) : 0,
  };
}
// ── The natal ring on a bi-wheel ───────────────────────────────────────────
// IDENTITY — the generated sweeps' own assertion (nothing overlaps), on the geometry a
// bi-wheel actually lays its natal ring out on. `geom()` above never sets hasOverlay, so
// until this line the bi-wheel's natal ring had no tangential check at all, and it is
// the baseline the ring's measured cost below compares against.
console.log('\nthe natal ring on a bi-wheel (IDENTITY)');
sweep(
  'realistic, bi-wheel geometry',
  5000,
  (() => {
    const r = seeded(424242421);
    return () => {
      const size = [420, 460, 500, 560, 600, 640, 700, 800, 900][Math.floor(r() * 9)];
      return { size, ...realisticChart(r) };
    };
  })(),
  (size, advanced) => geomWith(size, advanced, true, false),
);

// ── As drawn: the built-ins do not notice ──────────────────────────────────
// IDENTITY — catalog bodies on a wheel that is not granted the ring must leave the natal
// layout untouched: every body and every angle code at exactly the offset it has with no
// catalog bodies on the wheel, compared with Object.is rather than a tolerance. (The band
// suite proves the geometry is identical field for field; this proves nothing between the
// geometry and the layout reads the request some other way.) On a single wheel that is
// every size below the gate; on a bi-wheel, which never gets the ring, every size there
// is — so the bi-wheel's sizes run to the largest, across the gate.
//
// Then the same with the ring laid out regardless of the switch: below its gate it must
// still change nothing — which is what makes the gate safe for the wheels under it.
console.log('\nas drawn, the built-ins are laid out exactly as without catalog bodies (IDENTITY)');
{
  const groups: [string, number[], boolean, number][] = [
    ['single', [280, 320, 367, 380, 440, 500, 560, MINOR_RING_MIN - 1, MINOR_RING_MIN, 700, 800, 900], false, 20260926],
    ['bi-wheel', [420, 480, 540, 560, MINOR_RING_MIN - 1, MINOR_RING_MIN, 640, 700, 800, 900], true, 20260927],
  ];
  for (const [kind, sizes, hasOverlay, seed] of groups) {
    const r = seeded(seed);
    let charts = 0;
    let compared = 0;
    let differ = 0;
    let first = '';
    const tried: number[] = [];
    for (const size of sizes) {
      if (ringGrantable(size, hasOverlay)) continue;
      tried.push(size);
      for (let t = 0; t < 500; t++) {
        const { advanced, codes, bodies } = realisticChart(r);
        const off = geomWith(size, advanced, hasOverlay, false);
        const on = geomWith(size, advanced, hasOverlay, true);
        charts += 1;
        if (on.detail.minorRing) {
          differ += 1;
          first ||= `${size}px drew the catalog ring where it is not granted`;
          continue;
        }
        const a = natalRing(off, codes, bodies).out;
        const b = natalRing(on, codes, bodies).out;
        for (const [name, deg] of a) {
          compared += 1;
          if (!Object.is(deg, b.get(name))) {
            differ += 1;
            first ||= `${size}px ${name}: ${deg} without, ${b.get(name)} with`;
          }
        }
      }
    }
    if (differ) failures += 1;
    console.log(
      `${differ ? 'FAIL' : 'ok  '}  ${kind} ${tried.join('/')}px: ${charts} charts, ${compared} marks, ` +
        `${differ} at a different offset${first ? ` — first: ${first}` : ''}`,
    );
  }
}
{
  const r = seeded(20260926);
  const groups: [string, number[], boolean][] = [
    ['single', [280, 320, 367, 380, 440, 500, 560, MINOR_RING_MIN - 1], false],
    ['bi-wheel', [420, 480, 540, 560, MINOR_RING_MIN - 1], true],
  ];
  for (const [kind, sizes, hasOverlay] of groups) {
    let charts = 0;
    let compared = 0;
    let differ = 0;
    let first = '';
    for (const size of sizes) {
      for (let t = 0; t < 500; t++) {
        const { advanced, codes, bodies } = realisticChart(r);
        const off = geomWith(size, advanced, hasOverlay, false);
        const on = ringGeom(size, advanced, hasOverlay);
        charts += 1;
        if (on.detail.minorRing) {
          differ += 1;
          first ||= `${size}px drew the catalog ring below its gate`;
          continue;
        }
        const a = natalRing(off, codes, bodies).out;
        const b = natalRing(on, codes, bodies).out;
        for (const [name, deg] of a) {
          compared += 1;
          if (!Object.is(deg, b.get(name))) {
            differ += 1;
            first ||= `${size}px ${name}: ${deg} without, ${b.get(name)} with`;
          }
        }
      }
    }
    console.log(
      `${ringVerdict(differ === 0)}  ${kind} ${sizes.join('/')}px, the ring laid out below its gate: ` +
        `${charts} charts, ${compared} marks, ${differ} at a different offset` +
        `${first ? ` — first: ${first}` : ''}${MEASURED}`,
    );
  }
}

// ── At and above the gate: what the ring costs the built-ins ───────────────
// OUTSIDE-AGREEMENT — the gate exists so that catalog bodies do not buy their room with
// the built-ins' positions. The ring takes radius from the planets, and a planet ring
// pushed inward has less circumference to seat the same bodies on. What a reader pays
// for that is a planet drawn in a sign it is not in, so that is what is counted: the
// share of charts with a built-in pushed more than a whole sign, with the ring and
// without it, on the SAME charts. The budget is GATE_COST_PP percentage points at every
// size the ring is drawn at.
//
// This is the measurement that switched the ring off on 2026-09-26 (+2.62 pp at 500px),
// and the one the tuning pass was judged on. Every 10px from the gate to 900px, because
// the sizes it used to sample (500/560/600…) stepped straight over a spike at 530–550px
// that fails the budget by up to three and a half times; a sample is only as good as the
// sizes nobody thought to list. The bi-wheel's line is the finding behind its exclusion,
// on a sparser list since it is never asserted.
//
// The charts are the realistic sweep's (a third with all nineteen bodies), and each size
// sees the same ones, so the sizes are comparable with each other. The planet-ring step
// and the share of charts where some glyph moved more than 2° are reported, not asserted.
const GATE_COST_PP = 0.2;
const GATE_COST_CHARTS = 5000;
console.log(
  `\nat and above the gate: what the catalog ring costs the built-ins (OUTSIDE-AGREEMENT, ` +
    `budget +${GATE_COST_PP} pp)${MEASURED}`,
);
{
  const every10: number[] = [];
  for (let s = MINOR_RING_MIN; s <= 900; s += 10) every10.push(s);
  const groups: [string, number[], boolean][] = [
    ['single', every10, false],
    ['bi-wheel', [MINOR_RING_MIN, 640, 700, 740, 800, 900], true],
  ];
  let worstSingle = -Infinity;
  let worstSingleAt = 0;
  for (const [kind, sizes, hasOverlay] of groups) {
    for (const size of sizes) {
      const r = seeded(987654321);
      let pastOff = 0;
      let pastOn = 0;
      let newly = 0;
      let moved = 0;
      let ringMissing = 0;
      for (let t = 0; t < GATE_COST_CHARTS; t++) {
        const { advanced, codes, bodies } = realisticChart(r);
        const off = geomWith(size, advanced, hasOverlay, false);
        const on = ringGeom(size, advanced, hasOverlay);
        if (!on.detail.minorRing) ringMissing += 1;
        const a = natalRing(off, codes, bodies);
        const b = natalRing(on, codes, bodies);
        if (a.worstPush > 30) pastOff += 1;
        if (b.worstPush > 30) pastOn += 1;
        if (b.worstPush > 30 && a.worstPush <= 30) newly += 1;
        if (bodies.some(([n]) => Math.abs(((b.out.get(n)! - a.out.get(n)! + 540) % 360) - 180) > 2)) moved += 1;
      }
      const step = geomWith(size, false, hasOverlay, false).rPlanets - ringGeom(size, false, hasOverlay).rPlanets;
      const pct = (x: number) => `${((100 * x) / GATE_COST_CHARTS).toFixed(2)}%`;
      const dpp = (100 * (pastOn - pastOff)) / GATE_COST_CHARTS;
      const ok = ringMissing === 0 && dpp <= GATE_COST_PP + 1e-9;
      if (!hasOverlay && dpp > worstSingle) {
        worstSingle = dpp;
        worstSingleAt = size;
      }
      console.log(
        `${ringVerdict(ok, hasOverlay)}  ${kind} ${size}px: past a sign ${pct(pastOff)} → ${pct(pastOn)} ` +
          `(${dpp >= 0 ? '+' : ''}${dpp.toFixed(2)} pp, ${newly} chart(s) newly)` +
          `\n        planet ring ${step.toFixed(1)}px inward; some glyph moved more than 2° on ${pct(moved)}` +
          `${ringMissing ? `; the ring was NOT drawn on ${ringMissing} chart(s)` : ''}` +
          `${measuredLabel(hasOverlay)}`,
      );
    }
  }
  console.log(
    `        single wheels, ${every10.length} sizes: worst +${worstSingle.toFixed(2)} pp at ${worstSingleAt}px`,
  );
}

// ── The catalog ring itself ────────────────────────────────────────────────
// Three assertions, per chart — on a single wheel; on the bi-wheel, a finding:
//
//   AGREEMENT  no coin across an axis. The axis line is drawn at the angle; the coin is
//              laid out by the ring. A coin on the far side of the line — or with its
//              ink over it — tells the reader the body is in the next quadrant, while
//              its own rim diamond, the tip and the table say otherwise.
//   IDENTITY   the push ceiling: on every arc with room for it, no coin is drawn more
//              than MAX_PUSH_DEG from its degree. "Room" is decided here independently
//              of the solver — can ANY arrangement keep the arc's coins in order, apart
//              by the ring's own floor (BODY_OVERLAP_SHARE between coins, an axis's full
//              clearance of WALL_HALF_PX + RING_PAD_PX, which never gives) and within the
//              ceiling? An arc where none can is TIGHT; it is counted and its worst push
//              reported, not asserted.
//   IDENTITY   coins share no more than BODY_OVERLAP_SHARE of their width.
//
// On three sets of bodies — twenty anywhere, eight within 20°, twenty in one quadrant —
// at 600/700/800/900px single and 600/700/800px bi-wheel, between realistic axes; and on
// a planets-only wheel, whose walls are the 0/90/180/270° device. Twenty in one quadrant
// is the case the coins were thinned for (0.5 of the planet disc, from 0.64): at the
// old size it put a coin across the ASC or MC on up to a quarter of charts.
type Walls = number[];
interface MinorChart {
  walls: Walls;
  bodies: { id: string; lon: number }[];
}
const D2R = Math.PI / 180;
const n360 = (d: number) => ((d % 360) + 360) % 360;
/** Realistic axes, as the chart generators above draw them, in radians. */
function realisticWalls(r: () => number): Walls {
  const asc = r() * 360;
  const mc = (asc + 55 + r() * 70) % 360;
  return minorRingWalls({
    asc: asc * D2R,
    dsc: n360(asc + 180) * D2R,
    mc: mc * D2R,
    ic: n360(mc + 180) * D2R,
  });
}
const coins = (lons: number[]) => lons.map((d, i) => ({ id: `mp:${i + 1}`, lon: n360(d) * D2R }));
const MINOR_SETS: [string, (r: () => number, walls: Walls) => MinorChart['bodies']][] = [
  ['twenty anywhere', (r) => coins(Array.from({ length: 20 }, () => r() * 360))],
  [
    'eight within 20°',
    (r) => {
      const c = r() * 360;
      return coins(Array.from({ length: 8 }, () => c + r() * 20));
    },
  ],
  [
    'twenty in one quadrant',
    (r, walls) => {
      const s = walls.map((w) => n360(w / D2R)).sort((a, b) => a - b);
      const k = Math.floor(r() * s.length);
      const lo = s[k];
      const hi = k + 1 < s.length ? s[k + 1] : s[0] + 360;
      return coins(Array.from({ length: 20 }, () => lo + 0.5 + r() * (hi - lo - 1)));
    },
  ],
];

interface RingAudit {
  /** Coins drawn across an axis, or with their ink over one — and how many of those
   *  sit in an arc too narrow to seat its coins at the ring's floor. */
  crossed: number;
  crossedOverfull: number;
  overlaps: number;
  /** Arcs with room whose worst coin is past the ceiling. */
  breaches: number;
  worstWithRoom: number;
  tightArcs: number;
  worstTight: number;
  overfullArcs: number;
  arcs: number;
}
function auditMinorRing(
  g: WheelGeometry,
  wallsRad: Walls,
  bodies: MinorChart['bodies'],
  placed: Map<string, number>,
): RingAudit {
  const r = g.rMinor;
  const half = g.minorDiscHalf;
  const walls = wallsRad.map((w) => n360(w / D2R)).sort((a, b) => a - b);
  const arcBounds = walls.map((lo, k) => [lo, k + 1 < walls.length ? walls[k + 1] : walls[0] + 360]);
  const arcOf = (d: number) =>
    arcBounds.findIndex(([lo, hi]) => (d < lo ? d + 360 : d) >= lo && (d < lo ? d + 360 : d) < hi);
  // The ring's floor, from its own figures.
  const coinGap = arcDeg(2 * half * (1 - BODY_OVERLAP_SHARE), r);
  const wallGap = arcDeg(half + WALL_HALF_PX + RING_PAD_PX, r);
  const inkDeg = arcDeg(half, r);
  const a: RingAudit = {
    crossed: 0, crossedOverfull: 0, overlaps: 0, breaches: 0, worstWithRoom: 0,
    tightArcs: 0, worstTight: 0, overfullArcs: 0, arcs: 0,
  };
  const overfull = new Set<number>();
  const pushIn = new Map<number, number>();
  const trueIn = new Map<number, number[]>();
  for (const b of bodies) {
    const t = n360(b.lon / D2R);
    const p = n360(placed.get(b.id)! / D2R);
    const k = arcOf(t);
    pushIn.set(k, Math.max(pushIn.get(k) ?? 0, Math.abs(((p - t + 540) % 360) - 180)));
    trueIn.set(k, [...(trueIn.get(k) ?? []), t < arcBounds[k][0] ? t + 360 : t]);
  }
  for (const [k, offs] of trueIn) {
    const [lo, hi] = arcBounds[k];
    const xs = [...offs].sort((x, y) => x - y);
    a.arcs += 1;
    const full = 2 * wallGap + (xs.length - 1) * coinGap > hi - lo;
    if (full) {
      overfull.add(k);
      a.overfullArcs += 1;
    }
    // Can any order-keeping arrangement at the floor hold every coin within the
    // ceiling? Greedy from the left wall: each coin as far left as its own window and
    // its neighbour allow; it fits iff nobody overruns its window or the right wall.
    let prev = -Infinity;
    let feasible = !full;
    for (let i = 0; feasible && i < xs.length; i++) {
      const at = Math.max(xs[i] - MAX_PUSH_DEG, i === 0 ? lo + wallGap : prev + coinGap);
      if (at > xs[i] + MAX_PUSH_DEG + 1e-9) feasible = false;
      prev = at;
    }
    if (feasible && prev > hi - wallGap + 1e-9) feasible = false;
    const worst = pushIn.get(k) ?? 0;
    if (feasible) {
      a.worstWithRoom = Math.max(a.worstWithRoom, worst);
      if (worst > MAX_PUSH_DEG + 1e-6) a.breaches += 1;
    } else {
      a.tightArcs += 1;
      a.worstTight = Math.max(a.worstTight, worst);
    }
  }
  for (const b of bodies) {
    const t = n360(b.lon / D2R);
    const p = n360(placed.get(b.id)! / D2R);
    const onLine = walls.some((w) => Math.abs(((p - w + 540) % 360) - 180) + 1e-9 < inkDeg);
    if (arcOf(p) !== arcOf(t) || onLine) {
      a.crossed += 1;
      if (overfull.has(arcOf(t))) a.crossedOverfull += 1;
    }
  }
  const drawn = bodies.map((b) => n360(placed.get(b.id)! / D2R)).sort((x, y) => x - y);
  for (let i = 0; i < drawn.length && drawn.length > 1; i++) {
    const gapPx = n360(drawn[(i + 1) % drawn.length] - drawn[i]) * D2R * r;
    if (gapPx + 1e-6 < 2 * half * (1 - BODY_OVERLAP_SHARE)) a.overlaps += 1;
  }
  return a;
}

console.log(
  '\nthe catalog ring: no coin across an axis (AGREEMENT); the push ceiling on every arc ' +
    `with room, and the overlap tolerance (IDENTITY)${MEASURED}`,
);
{
  const RING_CHARTS = 1000;
  const geoms: [string, number, boolean, boolean][] = [
    ...[600, 700, 800, 900].map((s): [string, number, boolean, boolean] => [`${s}px`, s, false, false]),
    ...[600, 700, 800].map((s): [string, number, boolean, boolean] => [`${s}px bi-wheel`, s, true, false]),
    [`${MINOR_RING_MIN}px planets-only`, MINOR_RING_MIN, false, true],
  ];
  for (const [setName, gen] of MINOR_SETS) {
    for (const [gLabel, size, hasOverlay, planetsOnly] of geoms) {
      const r = seeded(13579 + size + (hasOverlay ? 1 : 0) + (planetsOnly ? 2 : 0));
      const sum: RingAudit = {
        crossed: 0, crossedOverfull: 0, overlaps: 0, breaches: 0, worstWithRoom: 0,
        tightArcs: 0, worstTight: 0, overfullArcs: 0, arcs: 0,
      };
      let crossedCharts = 0;
      let noRing = 0;
      for (let t = 0; t < RING_CHARTS; t++) {
        const g = ringGeom(size, r() < 0.5, hasOverlay);
        if (!g.detail.minorRing) noRing += 1;
        const walls = planetsOnly ? minorRingWalls(null) : realisticWalls(r);
        const bodies = gen(r, walls);
        const x = auditMinorRing(g, walls, bodies, layoutMinorRing(g, walls, bodies));
        if (x.crossed) crossedCharts += 1;
        sum.crossed += x.crossed;
        sum.crossedOverfull += x.crossedOverfull;
        sum.overlaps += x.overlaps;
        sum.breaches += x.breaches;
        sum.worstWithRoom = Math.max(sum.worstWithRoom, x.worstWithRoom);
        sum.tightArcs += x.tightArcs;
        sum.worstTight = Math.max(sum.worstTight, x.worstTight);
        sum.overfullArcs += x.overfullArcs;
        sum.arcs += x.arcs;
      }
      const ok = noRing === 0 && sum.crossed === 0 && sum.overlaps === 0 && sum.breaches === 0;
      console.log(
        `${ringVerdict(ok, hasOverlay)}  ${setName}, ${gLabel}: ${RING_CHARTS} charts` +
          `, ${crossedCharts} with a coin across an axis` +
          (sum.crossed
            ? ` (${sum.crossed} coins, ${sum.crossedOverfull} of them in an arc too narrow to seat its coins)`
            : '') +
          `, ${sum.overlaps} overlap(s) past the tolerance` +
          `\n        worst push ${sum.worstWithRoom.toFixed(2)}° on arcs with room` +
          `${sum.breaches ? ` — ${sum.breaches} arc(s) PAST the ${MAX_PUSH_DEG}° ceiling` : ''}` +
          `; ${sum.tightArcs} tight arc(s) of ${sum.arcs}` +
          `${sum.tightArcs ? ` (${sum.overfullArcs} too narrow to seat their coins at all), worst there ${sum.worstTight.toFixed(2)}°` : ''}` +
          `${noRing ? `; the ring was NOT drawn on ${noRing}` : ''}${hasOverlay ? measuredLabel(true) : ''}`,
      );
    }
  }
}

// ── Resizing with catalog bodies on the wheel ──────────────────────────────
// OUTSIDE-AGREEMENT, as the resize section above: the property the reader sees when
// they drag the sidebar. Three kinds of line; the second never fails the suite.
//
//   • AS DRAWN — the built-ins, with catalog bodies on the wheel, from the smallest wheel
//     to the largest, on the geometry the app uses. Asserted twice over: every one-pixel
//     step within the resize bound above (on its declared exclusions — the gate, where
//     the ring comes on, among them), AND at every pixel where the ring is not granted —
//     below the gate, and the whole of a bi-wheel — every body at exactly the offset it
//     has with no catalog bodies (Object.is).
//   • THE BI-WHEEL'S OWN BEHAVIOUR — the bi-wheel breaks the 5° bound by itself, with no
//     catalog bodies at all: 5.83° at 621→622px, a readout-font step, the first time
//     anything resized a bi-wheel. That is a finding about the bi-wheel, not about
//     catalog bodies or the ring, so it is printed as a measured finding and never
//     fails the suite. Its as-drawn line is the same finding, and the identity half of
//     that line (above) is what IS asserted.
//   • THE RING — the built-ins with the ring laid out, where the gate is one more
//     declared discontinuity (the ring comes on and the planet ring steps inward;
//     reported, not bounded); and the coins, from the gate up, every one-pixel step
//     bounded the same way except where an arc is too narrow to seat its coins (the
//     ring's own crowded regime, the analogue of codes giving up their axis), which is
//     excluded and counted. Asserted on a single wheel; on the bi-wheel, a finding.
//
// The declared discontinuities are the ones above (the shed ladder swapping rungs — the
// bi-wheel's overlay readout included — and a ring so full its codes gave up their axis).
console.log('\nresizing with catalog bodies on the wheel (OUTSIDE-AGREEMENT)');
type ResizeGeometry = 'drawn' | 'ring' | 'none';
type ResizeVerdict = 'assert' | 'ring' | 'finding';
function resizeWithCatalog(
  label: string,
  charts: number,
  bodyCount: number,
  hasOverlay: boolean,
  which: ResizeGeometry,
  verdict: ResizeVerdict,
) {
  const r = seeded(hasOverlay ? 77001 : 77000 + bodyCount);
  let worst = 0;
  let worstAt = '';
  let compared = 0;
  let quiet = 0;
  let gateJump = 0;
  let sizes = 0;
  let differ = 0;
  let firstDiffer = '';
  const mk = (size: number, advanced: boolean) =>
    which === 'ring'
      ? ringGeom(size, advanced, hasOverlay)
      : geomWith(size, advanced, hasOverlay, which === 'drawn');
  for (let c = 0; c < charts; c++) {
    const { advanced, codes, bodies } = realisticChart(r, bodyCount);
    const at = (size: number) => {
      const g = mk(size, advanced);
      const ring = natalRing(g, codes, bodies);
      // As drawn, wherever the ring is not granted: exactly the layout with no catalog
      // bodies on the wheel.
      if (which === 'drawn' && !ringGrantable(size, hasOverlay)) {
        sizes += 1;
        const bare = natalRing(geomWith(size, advanced, hasOverlay, false), codes, bodies).out;
        for (const [name, deg] of bare) {
          if (!Object.is(deg, ring.out.get(name))) {
            differ += 1;
            firstDiffer ||= `${size}px ${name}: ${deg} without, ${ring.out.get(name)} with`;
          }
        }
      }
      return { out: ring.out, held: ring.held, ringOn: g.detail.minorRing, key: `${detailKey(g)},${g.detail.overlayReadout}` };
    };
    const from = hasOverlay ? 420 : 280;
    let prev = at(from);
    for (let size = from + 1; size <= 900; size++) {
      const cur = at(size);
      let jump = 0;
      let who = '';
      for (const [name] of bodies) {
        const d = Math.abs(((cur.out.get(name)! - prev.out.get(name)! + 540) % 360) - 180);
        if (d > jump) {
          jump = d;
          who = name;
        }
      }
      if (prev.ringOn !== cur.ringOn) {
        gateJump = Math.max(gateJump, jump);
      } else if (prev.key === cur.key && prev.held && cur.held) {
        compared += 1;
        if (jump <= 0.25) quiet += 1;
        if (jump > worst) {
          worst = jump;
          worstAt = `${size - 1}→${size}px, ${who}`;
        }
      }
      prev = cur;
    }
  }
  const ok = worst <= MAX_RESIZE_JUMP_DEG;
  let tag: string;
  if (verdict === 'ring') {
    tag = ringVerdict(ok, hasOverlay);
  } else if (verdict === 'finding') {
    tag = findingVerdict(ok);
  } else {
    tag = ok ? 'ok  ' : 'FAIL';
    if (!ok) failures += 1;
  }
  console.log(
    `${tag}  ${label}: ${compared} one-pixel steps` +
      `, worst move ${worst.toFixed(2)}° (${worstAt})` +
      `, ${((100 * quiet) / compared).toFixed(1)}% moved nothing` +
      (which === 'ring'
        ? `\n        at the gate itself the ring moves them up to ${gateJump.toFixed(2)}° (declared, not bounded)` +
          `${hasOverlay ? measuredLabel(true) : ''}`
        : ''),
  );
  if (which === 'drawn') {
    // The identity half is what ships, so it is asserted whatever the bound's verdict.
    if (differ) failures += 1;
    console.log(
      `${differ ? 'FAIL' : 'ok  '}  the same charts, IDENTITY: at ${sizes} chart-size(s) not granted the ring, ` +
        `every body exactly where it is with no catalog bodies` +
        `${differ ? ` — ${differ} not; first: ${firstDiffer}` : ''}`,
    );
  }
}
function resizeCoins(label: string, charts: number, setIdx: number, hasOverlay: boolean) {
  const [, gen] = MINOR_SETS[setIdx];
  const r = seeded(88000 + setIdx + (hasOverlay ? 10 : 0));
  const gate = MINOR_RING_MIN;
  let worst = 0;
  let worstAt = '';
  let compared = 0;
  let quiet = 0;
  let crowded = 0;
  for (let c = 0; c < charts; c++) {
    const walls = realisticWalls(r);
    const bodies = gen(r, walls);
    const at = (size: number) => {
      const g = ringGeom(size, false, hasOverlay);
      const placed = layoutMinorRing(g, walls, bodies);
      return { placed, full: auditMinorRing(g, walls, bodies, placed).overfullArcs > 0 };
    };
    let prev = at(gate);
    for (let size = gate + 1; size <= 900; size++) {
      const cur = at(size);
      if (prev.full || cur.full) {
        crowded += 1;
      } else {
        compared += 1;
        let jump = 0;
        let who = '';
        for (const b of bodies) {
          const d = Math.abs(((((cur.placed.get(b.id)! - prev.placed.get(b.id)!) / D2R) + 540) % 360) - 180);
          if (d > jump) {
            jump = d;
            who = b.id;
          }
        }
        if (jump <= 0.25) quiet += 1;
        if (jump > worst) {
          worst = jump;
          worstAt = `${size - 1}→${size}px, ${who}`;
        }
      }
      prev = cur;
    }
  }
  const ok = worst <= MAX_RESIZE_JUMP_DEG;
  console.log(
    `${ringVerdict(ok, hasOverlay)}  ${label}: ${compared} one-pixel steps` +
      `, worst move ${worst.toFixed(2)}° (${worstAt || 'none'})` +
      `, ${compared ? ((100 * quiet) / compared).toFixed(1) : '0.0'}% moved nothing` +
      `${crowded ? `, ${crowded} step(s) excluded where an arc was too narrow for its coins` : ''}` +
      `${hasOverlay ? measuredLabel(true) : ''}`,
  );
}
console.log('as drawn (asserted)');
resizeWithCatalog('built-ins, ten bodies, 280–900px, catalog bodies on, as drawn', 60, 10, false, 'drawn', 'assert');
resizeWithCatalog('built-ins, all nineteen, 280–900px, catalog bodies on, as drawn', 40, 19, false, 'drawn', 'assert');
console.log("the bi-wheel's own behaviour (measured finding — not the ring's, not asserted)");
resizeWithCatalog(
  "built-ins, bi-wheel, 420–900px, NO catalog bodies — the bi-wheel's own, measured, not asserted",
  40,
  10,
  true,
  'none',
  'finding',
);
resizeWithCatalog(
  'built-ins, bi-wheel, 420–900px, catalog bodies on, as drawn — the same finding, not asserted',
  40,
  10,
  true,
  'drawn',
  'finding',
);
console.log(`the ring${MEASURED}`);
resizeWithCatalog('built-ins, ten bodies, 280–900px, ring laid out', 60, 10, false, 'ring', 'ring');
resizeWithCatalog('built-ins, all nineteen, 280–900px, ring laid out', 40, 19, false, 'ring', 'ring');
resizeCoins(`coins, twenty anywhere, ${MINOR_RING_MIN}–900px`, 40, 0, false);
resizeCoins(`coins, eight within 20°, ${MINOR_RING_MIN}–900px`, 40, 1, false);
console.log("the bi-wheel's would-be ring (measured finding — never granted, not asserted)");
resizeWithCatalog('built-ins, bi-wheel, 420–900px, ring laid out', 40, 10, true, 'ring', 'ring');
resizeCoins(`coins, twenty anywhere, bi-wheel, ${MINOR_RING_MIN}–900px`, 40, 0, true);

// ══ Houses ════════════════════════════════════════════════════════════════
// Since 2026-10-23 a detailed wheel lays its glyph rings out against the house cusps
// (placeOnRing's `spokes`, from ringSpokes in lib/wheelRingLayout — the renderer's own
// function, imported here rather than restated). A body's CENTRE stays inside its own
// house wherever the house can hold it; an angle code gives up its axis, by the least
// it can, only where that is what keeps a body in; everything else is as above. The
// case it was built for is the reported one: a Whole Sign chart with the Descendant at
// 27°18' Scorpio and Neptune at 28°42', where the code↔body clearance drew Neptune's
// glyph at about 5° Sagittarius, in the 8th.
//
// The sections below say which kind of assertion each makes, as the catalog sections
// above do. Charts are laid out the way WheelSvg lays them out — offsets from the
// Ascendant, the cusps through ringSpokes with the renderer's own conversion — and on
// their own seeds, from their own generator: the suite's `seeded` multiplies past 2^53
// before it masks, so its low bits are gone and it falls into a cycle within 10,000–20,000
// draws (987654321, the seed of the sweeps above, gives 15,820 distinct values in
// 200,000). These sections take about a million draws, so they use mulberry32, which has
// the full 32-bit period.
const seeded32 = (s: number) => () => {
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const housesHalf = (name: string, g: WheelGeometry) => angleLabelHalfPx(name, g.angleCodePx, g.angleCodeHalo);
type HouseSystem = 'Whole Sign' | 'Equal' | 'Porphyry-like' | 'polar';
const HOUSE_SYSTEMS: HouseSystem[] = ['Whole Sign', 'Equal', 'Porphyry-like', 'polar'];
interface HouseChart {
  asc: number;
  mc: number;
  vx: number | null;
  bodies: [string, number][];
  /** Longitudes in degrees, in the order the chart lists them. */
  cusps: number[];
}
/** The realistic generator with cusps. Polar charts put the MC 6–40° from the AS, so
 *  their quadrant houses come out as slivers; the Porphyry-like system jitters the
 *  intermediate cusps so they are not evenly spaced. */
function houseChart(r: () => number, system: HouseSystem, count = r() < 0.35 ? 19 : 10, angles: 4 | 'random' = 'random'): HouseChart {
  const asc = r() * 360;
  const mc = system === 'polar' ? n360(asc + 6 + r() * 34) : n360(asc + 55 + r() * 70);
  const vx = angles === 'random' && r() < 0.5 ? n360(asc + 120 + r() * 120) : null;
  const sun = r() * 360;
  const bodies = ALL19.slice(0, count).map((n, i): [string, number] => [
    n,
    n360(i < 3 ? sun + (r() - 0.5) * 90 : r() * 360),
  ]);
  let cusps: number[];
  if (system === 'Whole Sign') {
    const c1 = Math.floor(asc / 30) * 30;
    cusps = Array.from({ length: 12 }, (_, i) => n360(c1 + 30 * i));
  } else if (system === 'Equal') {
    cusps = Array.from({ length: 12 }, (_, i) => n360(asc + 30 * i));
  } else {
    const ax = [asc, mc, n360(asc + 180), n360(mc + 180)];
    cusps = [];
    for (let q = 0; q < 4; q++) {
      const span = n360(ax[(q + 1) % 4] - ax[q]);
      const j = () => (system === 'Porphyry-like' ? (r() - 0.5) * Math.min(8, span / 4) : 0);
      cusps.push(ax[q], n360(ax[q] + span / 3 + j()), n360(ax[q] + (2 * span) / 3 + j()));
    }
  }
  return { asc, mc, vx, bodies, cusps };
}
/** The ring as WheelSvg hands it to placeOnRing: every offset measured from the AS by the
 *  renderer's conversion, the spokes through ringSpokes with that same conversion. */
function houseRing(c: HouseChart, g: WheelGeometry, withCodes = true) {
  const ascRad = c.asc * D2R;
  const off = (lonRad: number) => (((((lonRad - ascRad) * 180) / Math.PI) % 360) + 360) % 360;
  const codes: [string, number][] = withCodes
    ? [
        ['AS', c.asc], ['MC', c.mc], ['DS', n360(c.asc + 180)], ['IC', n360(c.mc + 180)],
        ...(c.vx === null ? [] : ([['Vx', c.vx], ['Avx', n360(c.vx + 180)]] as [string, number][])),
      ]
    : [];
  return {
    fixed: codes.map(([name, l]): RingMark => ({ name, off: off(l * D2R), half: housesHalf(name, g) })),
    movable: c.bodies.map(([name, l]): RingMark => ({ name, off: off(l * D2R), half: g.discHalf })),
    spokes: ringSpokes(c.cusps.map((d) => d * D2R), off)!,
    off: (lonDeg: number) => off(lonDeg * D2R),
  };
}
/** The sector a centre is drawn in — the last spoke at or before it, half-open, a run of
 *  equal spokes being one line — named by the spoke it starts at. Its own implementation,
 *  so the layout's sectors are checked against the lines, not against themselves. */
function drawnSector(spokes: readonly number[], deg: number): number {
  const s = spokes.map(n360).sort((a, b) => a - b);
  const x = n360(deg);
  let k = -1;
  for (let i = 0; i < s.length; i++) if (s[i] <= x + 1e-9) k = i;
  if (x + 1e-9 >= s[0] + 360) k = 0;
  return s[k < 0 ? s.length - 1 : k];
}
/** How far inside its house a body's centre is held, from the module's own figures. */
const insetOf = (half: number, r: number) => arcDeg(half * HOUSE_INSET_SHARE + RING_PAD_PX / 2, r);
/** A body's house as the interval its centre may sit in, in absolute degrees near `z`. */
function houseBox(spokes: readonly number[], z: number, half: number, r: number) {
  const s = spokes.map(n360).sort((a, b) => a - b);
  const m = insetOf(half, r);
  const start = drawnSector(spokes, z);
  const next = s.find((v) => v > start + 1e-12) ?? s[0] + 360;
  let d = n360(z - start);
  if (d > 360 - 1e-6) d -= 360;
  const span = next - start;
  return span < 2 * m ? { lo: z - d + span / 2, hi: z - d + span / 2 } : { lo: z - d + m, hi: z - d + span - m };
}
/** Degrees of body centre outside its box, summed — recounted here from the drawn
 *  positions, not read off the layout. */
function spillOfLayout(movable: RingMark[], out: Map<string, number>, spokes: readonly number[], r: number) {
  return movable.reduce((a, m) => {
    const bx = houseBox(spokes, m.off, m.half, r);
    let x = out.get(m.name)!;
    while (x < bx.lo - 180) x += 360;
    while (x > bx.hi + 180) x -= 360;
    return a + Math.max(0, bx.lo - x, x - bx.hi);
  }, 0);
}
interface OrderedMark extends RingMark {
  code: boolean;
}
/** What two neighbours owe each other at full pressure, from the module's own figures:
 *  a body pair shares BODY_OVERLAP_SHARE of its ink and nothing else, a pair with a code
 *  in it keeps the full ink and the hairline. */
const fullPressureGap = (a: OrderedMark, b: OrderedMark, r: number, share: number) =>
  arcDeg(!a.code && !b.code ? (a.half + b.half) * (1 - share) : a.half + b.half + RING_PAD_PX, r);
/** The ring's marks in their order round it — codes first on a tie, which is the side of
 *  a code a body exactly on it is drawn — starting from a code. */
function ringOrder(fixed: RingMark[], movable: RingMark[]): OrderedMark[] {
  const all: OrderedMark[] = [
    ...fixed.map((f) => ({ ...f, code: true })),
    ...movable.map((m) => ({ ...m, code: false })),
  ].sort((a, b) => a.off - b.off || Number(b.code) - Number(a.code));
  const k = all.findIndex((m) => m.code);
  return k <= 0 ? all : [...all.slice(k), ...all.slice(0, k)];
}
/** Can the ring, with the codes FREE, seat every mark at full pressure with every body in
 *  its house? Difference constraints — a gap per neighbouring pair, round the circle, and
 *  a box per body — are feasible iff their graph has no negative cycle, which
 *  Bellman–Ford decides. Independent of the layout's own solve: no kernel, no cut. */
function ringCanHold(ms: OrderedMark[], spokes: readonly number[], r: number, share: number): boolean {
  const n = ms.length;
  const z: number[] = [];
  for (let j = 0; j < n; j++) {
    let v = ms[j].off;
    while (j > 0 && v < z[j - 1] - 1e-12) v += 360;
    z.push(v);
  }
  const edges: [number, number, number][] = [];
  for (let j = 0; j + 1 < n; j++) edges.push([j + 1, j, -fullPressureGap(ms[j], ms[j + 1], r, share)]);
  if (n > 1) edges.push([0, n - 1, 360 - fullPressureGap(ms[n - 1], ms[0], r, share)]);
  for (let j = 0; j < n; j++) {
    if (ms[j].code) continue;
    const b = houseBox(spokes, z[j], ms[j].half, r);
    edges.push([n, j, b.hi], [j, n, -b.lo]);
  }
  const dist = new Array(n + 1).fill(0);
  for (let it = 0; it <= n + 1; it++) {
    let changed = false;
    for (const [u, v, w] of edges) {
      if (dist[u] + w < dist[v] - 1e-9) {
        dist[v] = dist[u] + w;
        changed = true;
      }
    }
    if (!changed) return true;
  }
  return false;
}
/** With the codes at `walls`, does every arc between them seat its bodies in their houses
 *  at full pressure? Greedy from each arc's left wall, as auditMinorRing's room check:
 *  each body as far left as its house and its neighbour allow; the arc holds iff nobody
 *  overruns its house or the right wall. An arc with no bodies still owes its two codes
 *  their gap. */
function arcsCanHold(ms: OrderedMark[], walls: Map<string, number>, spokes: readonly number[], r: number, share: number): boolean {
  const n = ms.length;
  const codeAt = ms.map((m, j) => (m.code ? j : -1)).filter((j) => j >= 0);
  for (let c = 0; c < codeAt.length; c++) {
    const i0 = codeAt[c];
    const i1 = c + 1 < codeAt.length ? codeAt[c + 1] : codeAt[0] + n;
    const L = walls.get(ms[i0].name)!;
    let R = walls.get(ms[i1 % n].name)!;
    if (codeAt.length === 1) R = L + 360;
    else while (R < L - 1e-9) R += 360;
    let prev = L;
    let prevM = ms[i0];
    for (let j = i0 + 1; j < i1; j++) {
      const b = ms[j % n];
      const bx = houseBox(spokes, b.off, b.half, r);
      let { lo, hi } = bx;
      while (hi < L - 180) {
        lo += 360;
        hi += 360;
      }
      while (lo > L + 360) {
        lo -= 360;
        hi -= 360;
      }
      const at = Math.max(lo, prev + fullPressureGap(prevM, b, r, share));
      if (at > hi + 1e-9) return false;
      prev = at;
      prevM = b;
    }
    if (prev + fullPressureGap(prevM, ms[i1 % n], r, share) > R + 1e-9) return false;
  }
  return true;
}
/** The codes where they settle among themselves (S1 — the same step on both paths, so it
 *  is read off a layout with no bodies, which runs that step alone). */
const settledCodes = (fixed: RingMark[], g: WheelGeometry) =>
  layOutRing(fixed, [], g.ringSep, g.rPlanets, g.bodyOverlap).at;
const circDeg = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
/** The houses sections' measured findings — printed, never failed, and counted apart. */
let houseFindings = 0;
function houseFindingVerdict(ok: boolean): string {
  if (ok) return 'ok  ';
  houseFindings += 1;
  return 'meas';
}

// ── The kernel ─────────────────────────────────────────────────────────────
// IDENTITY — pavConvex, the solve the houses path runs when a body would leave its house,
// against its own optimality conditions on random problems of up to eight terms: the
// answer ascends; over each run of equal values some subgradient choice has every prefix
// summing to ≤ 0 and the run to 0 (the KKT conditions of an ascending fit); a random
// order-keeping nudge never lowers the loss; houses that admit an ascending arrangement
// are kept with zero spill; and a code with nothing pushing it is held on its axis to the
// bit. The counterexample in its comment is checked by value.
console.log('\nhouses: the kernel against its own optimality conditions (IDENTITY)');
{
  const r = seeded32(20261023);
  const P = 1e9;
  const W = 1e6;
  const loss = (e: PavTerm, y: number) =>
    e.q * (y - e.t) ** 2 + (e.w ? e.w * Math.abs(y - e.at!) : 0) + (e.P ? e.P * Math.max(0, e.lo! - y, y - e.hi!) : 0);
  const slopeL = (e: PavTerm, y: number) =>
    2 * e.q * (y - e.t) + (e.w ? (y <= e.at! ? -e.w : e.w) : 0) + (e.P ? (y <= e.lo! ? -e.P : y > e.hi! ? e.P : 0) : 0);
  const slopeR = (e: PavTerm, y: number) =>
    2 * e.q * (y - e.t) + (e.w ? (y < e.at! ? -e.w : e.w) : 0) + (e.P ? (y < e.lo! ? -e.P : y >= e.hi! ? e.P : 0) : 0);
  let bad = 0;
  let first = '';
  let runs = 0;
  let boxed = 0;
  let held = 0;
  const PROBLEMS = 30000;
  for (let trial = 0; trial < PROBLEMS; trial++) {
    const n = 1 + Math.floor(r() * 8);
    const mode = trial % 3; // mixed weights; houses only; one code and nothing else
    const codeAt = mode === 2 ? Math.floor(r() * n) : -1;
    const terms: PavTerm[] = [];
    for (let k = 0; k < n; k++) {
      const e: PavTerm = { q: mode === 0 ? 0.5 + r() * 2 : 1, t: (r() - 0.5) * 60 };
      if ((mode === 0 && r() < 0.3) || k === codeAt) {
        e.at = e.t + (mode === 0 ? (r() - 0.5) * 10 : 0);
        e.w = mode === 0 ? [1, 50, W][Math.floor(r() * 3)] : W;
      }
      if ((mode === 0 && r() < 0.6) || mode === 1) {
        const c = e.t + (r() - 0.5) * 20;
        const width = r() < 0.1 ? 0 : r() * 15;
        e.lo = c - width / 2;
        e.hi = c + width / 2;
        e.P = mode === 0 ? [3, 100, P][Math.floor(r() * 3)] : P;
      }
      terms.push(e);
    }
    const y = pavConvex(terms);
    const fail = (msg: string) => {
      bad += 1;
      first ||= `problem ${trial}: ${msg}`;
    };
    for (let k = 1; k < n; k++) if (!(y[k] >= y[k - 1])) fail(`descends at ${k}`);
    const tol = 1e-9 * terms.reduce((a, e) => a + 200 * e.q + (e.w ?? 0) + (e.P ?? 0), 0) + 1e-6;
    for (let i = 0; i < n; ) {
      let j = i;
      while (j + 1 < n && y[j + 1] === y[i]) j++;
      runs += 1;
      let pre = 0;
      for (let k = i; k <= j; k++) if ((pre += slopeL(terms[k], y[k])) > tol) fail(`run ${i}–${j}: a prefix pulls right`);
      let suf = 0;
      for (let k = j; k >= i; k--) if ((suf += slopeR(terms[k], y[k])) < -tol) fail(`run ${i}–${j}: a suffix pulls left`);
      i = j + 1;
    }
    const total = (v: number[]) => v.reduce((a, x, k) => a + loss(terms[k], x), 0);
    const at = total(y);
    for (let p = 0; p < 4; p++) {
      const v = y.map((x) => x + (r() - 0.5) * (p < 2 ? 1e-3 : 1)).sort((a, b) => a - b);
      if (total(v) < at - 1e-7 * (1 + Math.abs(at))) fail('a nudge lowered the loss');
    }
    if (mode === 1) {
      let run = -Infinity;
      const a = terms.map((e) => (run = Math.max(run, e.lo!)));
      run = Infinity;
      let fits = true;
      for (let k = n - 1; k >= 0; k--) if (a[k] > (run = Math.min(run, terms[k].hi!))) fits = false;
      if (fits) {
        boxed += 1;
        const spill = terms.reduce((s, e, k) => s + Math.max(0, e.lo! - y[k], y[k] - e.hi!), 0);
        if (spill > 1e-9) fail(`houses that fit, spilt ${spill}`);
      }
    }
    if (mode === 2) {
      held += 1;
      if (!Object.is(y[codeAt], terms[codeAt].at)) fail(`code at ${y[codeAt]}, axis ${terms[codeAt].at}`);
    }
  }
  const cx = pavConvex([{ q: 1, t: 10 }, { q: 1, t: 0, lo: 6, hi: 1e9, P }]);
  if (cx[0] !== 6 || cx[1] !== 6) {
    bad += 1;
    first ||= `the comment's counterexample came out (${cx.join(', ')}), not (6, 6)`;
  }
  const empty = runs === 0 || boxed === 0 || held === 0;
  if (bad || empty) failures += 1;
  console.log(
    `${bad || empty ? 'FAIL' : 'ok  '}  ${PROBLEMS} problems: ${runs} runs KKT-checked, ${boxed} houses that fit kept ` +
      `with zero spill, ${held} codes held to the bit${bad ? ` — ${bad} failure(s); first: ${first}` : ''}`,
  );
}

// ── Fixed cases ────────────────────────────────────────────────────────────
// IDENTITY — the layout against its contract, on charts built by hand so that each says
// exactly one thing. Every case that claims the houses path moved something also checks
// that the house-blind layout did NOT already get it right, so none of them can pass by
// testing nothing.
console.log('\nhouses: fixed cases (IDENTITY)');
let housesFixedFails = 0;
function houseCase(label: string, ok: boolean, detail: string) {
  if (!ok) {
    failures += 1;
    housesFixedFails += 1;
  }
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}
const near = (a: number | undefined, b: number, eps = 1e-9) => a !== undefined && circDeg(a, b) <= eps;
// The reported chart, late September 1969: AS 27°18' Taurus and an MC of 5°19' Aquarius
// (40°N), so the DS is 27°18' Scorpio; Neptune 28°42' Scorpio, Mars 1°56' Sagittarius,
// Uranus and Jupiter early Libra beside the Sun, Pluto 24° Virgo.
const REF: HouseChart = {
  asc: 57.3,
  mc: 305.32,
  vx: null,
  bodies: [
    ['Sun', 182.5], ['Moon', 130], ['Mercury', 200], ['Venus', 140], ['Mars', 241 + 56 / 60],
    ['Jupiter', 185], ['Saturn', 37], ['Uranus', 183.5], ['Neptune', 238.7], ['Pluto', 174],
  ],
  cusps: Array.from({ length: 12 }, (_, i) => 30 + 30 * i), // Whole Sign from Taurus
};
for (const size of [340, 440, 720]) {
  const g = geom(size, false);
  const { fixed, movable, spokes, off } = houseRing(REF, g);
  const r = g.rPlanets;
  const housed = layOutRing(fixed, movable, g.ringSep, r, g.bodyOverlap, spokes);
  const blind = placeOnRing(fixed, movable, g.ringSep, r, g.bodyOverlap);
  const cusp8 = off(240); // 0° Sagittarius
  const m = insetOf(g.discHalf, r);
  const R = arcDeg(housesHalf('DS', g) + g.discHalf + RING_PAD_PX, r);
  const nep = housed.at.get('Neptune')!;
  const ds = housed.at.get('DS')!;
  const held = ['AS', 'MC', 'IC'].every((k) => near(housed.at.get(k), fixed.find((f) => f.name === k)!.off));
  const crossedBlind = blind.get('Neptune')! > cusp8;
  houseCase(
    `the reported chart, Whole Sign, ${size}px: Neptune held inside the 7th, the DS gives way`,
    near(nep, cusp8 - m) && near(ds, cusp8 - m - R) && held && crossedBlind && housed.regime === 'yielded',
    `Neptune ${nep.toFixed(3)}° (cusp 8 ${cusp8.toFixed(3)}° less ${m.toFixed(3)}°), DS ${ds.toFixed(3)}° ` +
      `(${R.toFixed(3)}° below it, ${circDeg(ds, 180).toFixed(2)}° off its axis); AS/MC/IC ${held ? 'on' : 'OFF'} their axes; ` +
      `house-blind Neptune ${blind.get('Neptune')!.toFixed(2)}°${crossedBlind ? ', across the cusp' : ' — NOT across it, so the case tests nothing'}`,
  );
}
{
  // The same chart with quadrant cusps: the DS is ON cusp 7, so the codes are already the
  // house walls, and the intermediate cusps are placed clear of where the house-blind
  // layout draws its bodies. Nothing about houses is in question, and nothing may move.
  const quad = [0, 22, 45, 68.02, 98, 160, 180, 210, 230, 248.02, 280, 315].map((o) => n360(o + REF.asc));
  const c = { ...REF, cusps: quad };
  for (const size of [340, 440, 720]) {
    const g = geom(size, false);
    const { fixed, movable, spokes } = houseRing(c, g);
    const housed = layOutRing(fixed, movable, g.ringSep, g.rPlanets, g.bodyOverlap, spokes);
    const blind = placeOnRing(fixed, movable, g.ringSep, g.rPlanets, g.bodyOverlap);
    const differ = [...blind].filter(([k, v]) => !Object.is(v, housed.at.get(k))).map(([k]) => k);
    houseCase(
      `the reported chart, DS on cusp 7 (quadrant), ${size}px: exactly the house-blind layout`,
      differ.length === 0 && housed.regime === 'held' && housed.spillDeg === 0,
      `${blind.size} marks, ${differ.length ? `differ: ${differ.join(', ')}` : 'all identical'}, regime ${housed.regime}`,
    );
  }
}
{
  // Whole Sign, the AS at 0°20' Aries and a body at 0°10': the body is in the 1st but
  // BEFORE the AS, so the AS has to move along for it — it cannot cross the axis.
  const c: HouseChart = {
    asc: 1 / 3,
    mc: 270.5,
    vx: null,
    bodies: [['Sun', 1 / 6], ['Moon', 95], ['Mars', 150], ['Jupiter', 215], ['Saturn', 300]],
    cusps: Array.from({ length: 12 }, (_, i) => 30 * i),
  };
  for (const size of [340, 720]) {
    const g = geom(size, false);
    const { fixed, movable, spokes, off } = houseRing(c, g);
    const r = g.rPlanets;
    const housed = layOutRing(fixed, movable, g.ringSep, r, g.bodyOverlap, spokes);
    const blind = placeOnRing(fixed, movable, g.ringSep, r, g.bodyOverlap);
    const cusp1 = off(0);
    const m = insetOf(g.discHalf, r);
    const R = arcDeg(housesHalf('AS', g) + g.discHalf + RING_PAD_PX, r);
    const sun = housed.at.get('Sun')!;
    const as = housed.at.get('AS')!;
    const rest = ['MC', 'DS', 'IC'].every((k) => near(housed.at.get(k), fixed.find((f) => f.name === k)!.off));
    const blindOut = drawnSector(spokes, blind.get('Sun')!) !== drawnSector(spokes, cusp1);
    houseCase(
      `Whole Sign AS at 0°20', a body at 0°10', ${size}px: the body stays in the 1st, the AS moves along`,
      near(sun, cusp1 + m) && near(as, cusp1 + m + R) && rest && blindOut,
      `body ${n360(sun - cusp1).toFixed(3)}° past cusp 1, AS ${n360(as - cusp1).toFixed(3)}° past it ` +
        `(${circDeg(as, 0).toFixed(2)}° off its axis); MC/DS/IC ${rest ? 'on' : 'OFF'} their axes; ` +
        `house-blind body ${blindOut ? 'in the 12th' : 'NOT in the 12th, so the case tests nothing'}`,
    );
    // And with nothing near it, the same AS is not moved at all: codes have no house.
    const alone = { ...c, bodies: c.bodies.slice(1) };
    const a = houseRing(alone, g);
    const h2 = layOutRing(a.fixed, a.movable, g.ringSep, r, g.bodyOverlap, a.spokes);
    const b2 = placeOnRing(a.fixed, a.movable, g.ringSep, r, g.bodyOverlap);
    houseCase(
      `Whole Sign AS at 0°20' with nothing near it, ${size}px: the AS keeps its axis`,
      Object.is(h2.at.get('AS'), b2.get('AS')) && h2.regime === 'held',
      `AS ${h2.at.get('AS')}, house-blind ${b2.get('AS')}, regime ${h2.regime}`,
    );
  }
}
{
  // A body exactly ON a cusp is in the house that starts there (the half-open rule a
  // longitude's house is read by), and is held a hairline inside it — so it moves FORWARD.
  // One a billionth of a degree short of the cusp is on it too.
  const g = geom(560, false);
  for (const [label, lon] of [['exactly on cusp 4 (0° Cancer)', 90], ['1e-10° short of it', 90 - 1e-10]] as const) {
    const c: HouseChart = {
      asc: 15, mc: 285, vx: null,
      bodies: [['Sun', lon], ['Moon', 200], ['Mars', 330]],
      cusps: Array.from({ length: 12 }, (_, i) => 30 * i),
    };
    const { fixed, movable, spokes, off } = houseRing(c, g);
    const housed = layOutRing(fixed, movable, g.ringSep, g.rPlanets, g.bodyOverlap, spokes);
    const sun = housed.at.get('Sun')!;
    const want = off(90) + insetOf(g.discHalf, g.rPlanets);
    houseCase(
      `a body ${label}, 560px: in the house that starts there`,
      near(sun, want) && housed.regime === 'held',
      `drawn ${n360(sun - off(90)).toFixed(4)}° past the cusp (inset ${insetOf(g.discHalf, g.rPlanets).toFixed(4)}°), regime ${housed.regime}`,
    );
  }
}
{
  // A polar sliver: a 1.5° house with one body in it and two more pressing on it from
  // just behind, which push it clean out of the sliver house-blind. Its centre stays in
  // the sliver, the others in their own house, nothing overlapping past the tolerance. And
  // a house narrower than the two insets: the centre is drawn exactly mid-house.
  for (const [width, size] of [[1.5, 340], [1.5, 720], [0.3, 340]] as const) {
    const g = geom(size, false);
    const cusps = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 300 + width].map((d) => n360(d + 10));
    const c: HouseChart = {
      asc: 10, mc: 280, vx: null,
      bodies: [['Sun', 310 + width / 2], ['Moon', 309.9], ['Mercury', 309], ['Venus', 316 + width], ['Mars', 60]],
      cusps,
    };
    const { fixed, movable, spokes, off } = houseRing(c, g);
    const r = g.rPlanets;
    const housed = layOutRing(fixed, movable, g.ringSep, r, g.bodyOverlap, spokes);
    const blindSun = n360(placeOnRing(fixed, movable, g.ringSep, r, g.bodyOverlap).get('Sun')! - off(310));
    const sun = n360(housed.at.get('Sun')! - off(310));
    const m = insetOf(g.discHalf, r);
    const narrow = width < 2 * m;
    const a = audit(fixed, movable, housed.at, r, g.ringSep);
    const inside = narrow ? Math.abs(sun - width / 2) <= 1e-9 : sun >= m - 1e-9 && sun <= width - m + 1e-9;
    const neighbours = ['Moon', 'Mercury', 'Venus'].every(
      (k) => drawnSector(spokes, housed.at.get(k)!) === drawnSector(spokes, movable.find((x) => x.name === k)!.off),
    );
    houseCase(
      `a ${width}° polar sliver with one body, ${size}px${narrow ? ' — narrower than two insets' : ''}`,
      inside && neighbours && a.overlaps.length === 0 && blindSun > width,
      `centre ${sun.toFixed(4)}° into the ${width}° house (${narrow ? `mid-house ${(width / 2).toFixed(4)}°` : `inset ${m.toFixed(4)}°`}), ` +
        `neighbours ${neighbours ? 'in' : 'NOT in'} their own houses, ${a.overlaps.length} overlap(s); ` +
        `house-blind ${blindSun.toFixed(2)}° in${blindSun > width ? ', out of the sliver' : ' — IN the sliver, so the case tests nothing'}`,
    );
  }
}
{
  // Five bodies in one sign at 340px: a sign cannot seat five discs even sharing a quarter
  // of their ink, so some spill is unavoidable — and it must be the LEAST there is. Packed
  // at the full-pressure gap g the five span 4g; the sign offers its width less two
  // insets; the least total spill is the difference (split between the two ends, each
  // under a gap). The codes are a quadrant away and do not move.
  const g = geom(340, false);
  const r = g.rPlanets;
  const c: HouseChart = {
    asc: 0, mc: 270, vx: null,
    bodies: [['Sun', 123], ['Moon', 128], ['Mercury', 134], ['Venus', 140], ['Mars', 147]],
    cusps: Array.from({ length: 12 }, (_, i) => 30 * i),
  };
  const { fixed, movable, spokes } = houseRing(c, g);
  const housed = layOutRing(fixed, movable, g.ringSep, r, g.bodyOverlap, spokes);
  const gap = arcDeg(2 * g.discHalf * (1 - g.bodyOverlap), r);
  const least = 4 * gap - (30 - 2 * insetOf(g.discHalf, r));
  const a = audit(fixed, movable, housed.at, r, g.ringSep);
  const recount = spillOfLayout(movable, housed.at, spokes, r);
  houseCase(
    'five bodies in one sign, 340px: the least spill there is, and no overlap past the tolerance',
    least > 0 && Math.abs(housed.spillDeg - least) <= 1e-6 && Math.abs(recount - least) <= 1e-6 &&
      a.overlaps.length === 0 && a.movedCodes.length === 0,
    `spill ${housed.spillDeg.toFixed(6)}° (recounted ${recount.toFixed(6)}°), least possible ${least.toFixed(6)}°; ` +
      `${a.overlaps.length} overlap(s); codes ${a.movedCodes.length ? `moved: ${a.movedCodes.join(',')}` : 'on their axes'}`,
  );
}
{
  // `spokes` absent or empty is the house-blind layout, to the bit, on the realistic sweep.
  const r = seeded32(11235);
  let compared = 0;
  let differ = 0;
  for (let t = 0; t < 2000; t++) {
    const size = [340, 380, 440, 500, 560, 700, 800][Math.floor(r() * 7)];
    const { advanced, codes, bodies } = realisticChart(r);
    const g = geom(size, advanced);
    const { fixed, movable } = marks(codes, bodies, g);
    const base = placeOnRing(fixed, movable, g.ringSep, g.rPlanets, g.bodyOverlap);
    for (const variant of [undefined, [] as number[]]) {
      const v = layOutRing(fixed, movable, g.ringSep, g.rPlanets, g.bodyOverlap, variant);
      for (const [k, deg] of base) {
        compared += 1;
        if (!Object.is(deg, v.at.get(k))) differ += 1;
      }
      if (v.spillDeg !== 0) differ += 1;
    }
  }
  houseCase('spokes undefined, and spokes [] — the house-blind layout', compared > 0 && differ === 0, `${compared} marks compared with Object.is, ${differ} differ`);
}
{
  // A stellium straddling an MC that is ON cusp 10, under quadrant cusps placed clear of
  // it: the MC is already the wall between the 9th and 10th, so nothing changes.
  const g = geom(800, false);
  const cusps = [0, 30, 60, 92, 121, 150, 180, 210, 240, 272, 305, 330];
  const c: HouseChart = {
    asc: 0, mc: 272, vx: null,
    bodies: at(TEN, [268, 270, 271, 272, 274, 276, 165, 200, 300, 335]),
    cusps,
  };
  const { fixed, movable, spokes } = houseRing(c, g);
  const housed = layOutRing(fixed, movable, g.ringSep, g.rPlanets, g.bodyOverlap, spokes);
  const blind = placeOnRing(fixed, movable, g.ringSep, g.rPlanets, g.bodyOverlap);
  const differ = [...blind].filter(([k, v]) => !Object.is(v, housed.at.get(k))).length;
  const pushed = movable.filter((x) => circDeg(blind.get(x.name)!, x.off) > 1).length;
  houseCase(
    'a stellium on an MC that is on cusp 10, 800px: exactly the house-blind layout',
    differ === 0 && pushed >= 4 && housed.regime === 'held',
    `${blind.size} marks, ${differ} differ; ${pushed} bodies pushed more than 1° (the stellium is in play); regime ${housed.regime}`,
  );
}
{
  // Cusps out of order — a composite chart's can be: the spokes are the lines as drawn,
  // whatever order the chart lists them in, and each body stays in the sector the lines
  // actually cut around its degree.
  const g = geom(560, false);
  const cusps = [10, 40, 35, 100, 130, 125, 190, 220, 215, 280, 310, 305];
  const c: HouseChart = {
    asc: 10, mc: 280, vx: null,
    bodies: [['Sun', 37], ['Moon', 38.5], ['Mercury', 127], ['Venus', 150], ['Mars', 216], ['Jupiter', 250], ['Saturn', 307], ['Uranus', 340]],
    cusps,
  };
  const { fixed, movable, spokes } = houseRing(c, g);
  let ok = true;
  let detail = '';
  try {
    const housed = layOutRing(fixed, movable, g.ringSep, g.rPlanets, g.bodyOverlap, spokes);
    const finite = [...fixed, ...movable].every((x) => Number.isFinite(housed.at.get(x.name)));
    const out = movable.filter((x) => drawnSector(spokes, housed.at.get(x.name)!) !== drawnSector(spokes, x.off));
    ok = finite && out.length === 0 && housed.at.size === fixed.length + movable.length;
    detail = `${housed.at.size} marks, ${finite ? 'all finite' : 'NOT all finite'}, ${out.length ? `outside their sector: ${out.map((x) => x.name).join(', ')}` : 'every body in its drawn sector'}`;
  } catch (e) {
    ok = false;
    detail = `threw: ${(e as Error).message}`;
  }
  houseCase('cusps out of order (a composite flip), 560px: no crash, every body in its drawn sector', ok, detail);
}
{
  // A ring with no codes on it — the overlay ring without overlay angles — is one arc, and
  // each rung of its scan is a ring-wide solve (S4). On the reported chart it keeps every
  // body in its house.
  const g = geom(720, false);
  const { movable, spokes } = houseRing(REF, g, false);
  const housed = layOutRing([], movable, g.ringSep, g.rPlanets, g.bodyOverlap, spokes);
  const out = movable.filter((x) => drawnSector(spokes, housed.at.get(x.name)!) !== drawnSector(spokes, x.off));
  const a = audit([], movable, housed.at, g.rPlanets, g.ringSep);
  houseCase(
    'no codes on the ring, the reported chart, 720px: every body in its house',
    out.length === 0 && housed.spillDeg <= 1e-9 && a.overlaps.length === 0 && housed.regime === 'held',
    `${out.length} outside, spill ${housed.spillDeg.toExponential(1)}, ${a.overlaps.length} overlap(s)`,
  );
}
{
  // A ring too full to seat at full pressure: it is laid out whole, codes in the running,
  // in order, with nothing lost and nothing non-finite.
  const g = geom(280, true);
  const lons = Array.from({ length: 60 }, (_, i) => i * 6 + 0.5);
  const c: HouseChart = {
    asc: 0, mc: 272, vx: 47,
    bodies: lons.map((l, i): [string, number] => [`b${i}`, l]),
    cusps: Array.from({ length: 12 }, (_, i) => 30 * i),
  };
  const { fixed, movable, spokes } = houseRing(c, g);
  const housed = layOutRing(fixed, movable, g.ringSep, g.rPlanets, g.bodyOverlap, spokes);
  const all = [...fixed, ...movable];
  const finite = all.every((x) => Number.isFinite(housed.at.get(x.name)));
  const S1 = settledCodes(fixed, g);
  const ms = ringOrder(fixed.map((f) => ({ ...f, off: S1.get(f.name)! })), movable);
  // Order kept: walking the marks in their own order, the drawn positions go round once.
  let turns = 0;
  for (let j = 0; j < ms.length; j++) {
    const a = housed.at.get(ms[j].name)!;
    const b = housed.at.get(ms[(j + 1) % ms.length].name)!;
    turns += n360(b - a);
  }
  houseCase(
    'a ring too full to seat, 280px: re-laid whole, in order, nothing lost',
    housed.regime === 'relaid' && finite && housed.at.size === all.length && Math.abs(turns - 360) < 1e-6,
    `regime ${housed.regime}, ${housed.at.size} of ${all.length} marks, ${finite ? 'finite' : 'NOT finite'}, ` +
      `the order goes round ${(turns / 360).toFixed(3)} time(s)`,
  );
}

// ── The house a tip names ──────────────────────────────────────────────────
//   AGREEMENT  lib/houses houseIndexOf — what the tip names and the house focus lights,
//              read from the TRUE longitude and the cusps in house order — against the
//              sector the drawn lines cut round the same degree (drawnSector, over the
//              spokes as the wheel draws them). Bodies laid exactly on a cusp are added to
//              every chart, so the half-open rule is asked too.
//   IDENTITY   cusps out of order (a composite's can be) name no house at all, rather than
//              one the lines contradict: cuspsInOrder is false and every body reads null.
console.log('\nhouses: the house a tip names, against the sector the lines cut (AGREEMENT); cusps out of order (IDENTITY)');
{
  let compared = 0;
  let onCusp = 0;
  let disagree = 0;
  let first = '';
  for (const system of HOUSE_SYSTEMS) {
    const r = seeded32(9091 + HOUSE_SYSTEMS.indexOf(system) * 1000);
    for (let t = 0; t < 400; t++) {
      const c = houseChart(r, system);
      const g = geom(560, false);
      const { spokes, off } = houseRing(c, g);
      const cuspsRad = c.cusps.map((d) => d * D2R);
      const k0 = Math.floor(r() * 12);
      const bodies: [string, number][] = [...c.bodies, ['onCuspA', c.cusps[k0]], ['onCuspB', c.cusps[(k0 + 5) % 12]]];
      for (const [name, lon] of bodies) {
        const k = houseIndexOf(lon * D2R, cuspsRad);
        const sector = drawnSector(spokes, off(lon));
        const named = k === null ? null : off(c.cusps[k]);
        compared += 1;
        if (name.startsWith('onCusp')) onCusp += 1;
        if (named === null || circDeg(named, sector) > 1e-9) {
          disagree += 1;
          first ||= `${system} chart ${t}: ${name} at ${lon.toFixed(4)}° — houseIndexOf ${k === null ? 'null' : `house ${k + 1} (from ${named!.toFixed(4)}°)`}, drawn sector from ${sector.toFixed(4)}°`;
        }
      }
    }
  }
  const ok = disagree === 0 && compared > 0 && onCusp > 0;
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${HOUSE_SYSTEMS.length} systems × 400 charts: ${compared} bodies (${onCusp} exactly on a cusp), ` +
      `${disagree} where the tip's house is not the drawn sector${first ? ` — first: ${first}` : ''}`,
  );

  // The suite's own out-of-order set (above), and a composite-shaped one: per-cusp midpoints
  // where the parents' cusps lie nearly opposite, so three of them land across the wheel.
  const sets: [string, number[]][] = [
    ['the fixed case above', [10, 40, 35, 100, 130, 125, 190, 220, 215, 280, 310, 305]],
    ['a composite flip', [89, 299, 329.5, 179, 209, 239, 269, 119, 149.5, 359, 29, 59]],
  ];
  for (const [label, cusps] of sets) {
    const rad = cusps.map((d) => d * D2R);
    const named = Array.from({ length: 36 }, (_, i) => houseIndexOf((i * 10 + 3) * D2R, rad)).filter((k) => k !== null);
    const sane = cuspsInOrder(Array.from({ length: 12 }, (_, i) => (30 * i + 7) * D2R));
    const ok2 = !cuspsInOrder(rad) && named.length === 0 && sane;
    if (!ok2) failures += 1;
    console.log(
      `${ok2 ? 'ok  ' : 'FAIL'}  cusps out of order, ${label}: ${cuspsInOrder(rad) ? 'read as IN order' : 'out of order'}, ` +
        `${named.length} of 36 degrees given a house${sane ? '' : ' — and a plain Equal set was refused too, so the check proves nothing'}`,
    );
  }
}

// ── Over the sweeps ────────────────────────────────────────────────────────
// Four house systems — Whole Sign, Equal, Porphyry-like (quadrant cusps, the intermediate
// ones jittered) and polar (the MC 6–40° from the AS, so quadrant houses come out as
// slivers) — at seven sizes, realistic charts (a third with all nineteen bodies, half
// with the Vertex axis).
//
//   AGREEMENT  no body's centre drawn outside its own house, wherever the ring can hold
//              them all. Two parts that know nothing of each other: the layout, and the
//              sector the cusp lines — the spokes, as the wheel draws them — cut round the
//              drawn centre (drawnSector, not the layout's own boxes). "Can hold" is
//              decided independently, ring-wide: the bodies boxed in their houses, the codes
//              free, every gap at full pressure, as difference constraints (ringCanHold).
//              It has to be ring-wide. A house that is roomy by itself can still be handed
//              a body by an over-full neighbour, because the least total spill is traded
//              degree for degree between them; where the ring cannot hold everything, the
//              bodies outside are counted, not failed.
//   IDENTITY   the regimes against their contract. `held` (every code exactly on its axis)
//              ⇔ every arc can seat its bodies in their houses with the codes on their
//              axes, by an independent greedy (arcsCanHold). Where nothing spills, a code
//              off its axis moved by the LEAST that works: 0.01° back toward its axis and
//              some arc can no longer hold. The spill is never more than the house-blind
//              layout's, wherever that layout is itself seated at full pressure. And the
//              layout's own spill figure agrees with a recount from the drawn positions.
//
// Codes are compared where they settle among themselves (settledCodes): a Vertex too near
// an angle is moved off it on both paths alike, before houses come into it.
console.log('\nhouses: over the sweeps — every body in its house wherever the ring can hold them (AGREEMENT), the regimes (IDENTITY)');
{
  const SIZES = [340, 380, 440, 500, 560, 720, 800];
  const CHARTS = 300;
  for (const system of HOUSE_SYSTEMS) {
    const s = {
      charts: 0, canHold: 0, outWhereHeld: 0, cannotHold: 0, outWhereNot: 0, bodiesOutWhereNot: 0, noCodes: 0,
      held: 0, regimeWrong: 0, exactWrong: 0, moved: 0, notLeast: 0, spillCmp: 0, spillWorse: 0, spillFigureWrong: 0,
    };
    let first = '';
    const note = (msg: string) => (first ||= msg);
    for (const size of SIZES) {
      const r = seeded32(4711 + size + HOUSE_SYSTEMS.indexOf(system) * 1000);
      for (let t = 0; t < CHARTS; t++) {
        const advanced = r() < 0.5;
        const g = geom(size, advanced);
        const c = houseChart(r, system);
        // One chart in eight has no codes on its ring (the overlay ring without overlay
        // angles), which the layout runs as one arc (S4).
        const withCodes = t % 8 !== 7;
        const { fixed, movable, spokes } = houseRing(c, g, withCodes);
        const rad = g.rPlanets;
        const share = g.bodyOverlap;
        const L = layOutRing(fixed, movable, g.ringSep, rad, share, spokes);
        const B = placeOnRing(fixed, movable, g.ringSep, rad, share);
        s.charts += 1;
        if (!withCodes) s.noCodes += 1;
        const S1 = settledCodes(fixed, g);
        const settled = fixed.map((f) => ({ ...f, off: S1.get(f.name)! }));
        const ms = ringOrder(settled, movable);
        const out = movable.filter((m) => drawnSector(spokes, L.at.get(m.name)!) !== drawnSector(spokes, m.off));
        if (ringCanHold(ms, spokes, rad, share)) {
          s.canHold += 1;
          if (out.length) {
            s.outWhereHeld += 1;
            note(`${size}px chart ${t}: the ring can hold them, ${out.map((m) => m.name).join(', ')} drawn outside`);
          }
        } else {
          s.cannotHold += 1;
          if (out.length) s.outWhereNot += 1;
          s.bodiesOutWhereNot += out.length;
        }
        const spill = spillOfLayout(movable, L.at, spokes, rad);
        if (Math.abs(spill - L.spillDeg) > 1e-6) {
          s.spillFigureWrong += 1;
          note(`${size}px chart ${t}: spillDeg ${L.spillDeg}, recounted ${spill}`);
        }
        if (withCodes) {
          const axes = new Map(settled.map((f) => [f.name, f.off]));
          const arcsHold = arcsCanHold(ms, axes, spokes, rad, share);
          if (L.regime === 'held') s.held += 1;
          if ((L.regime === 'held') !== arcsHold) {
            s.regimeWrong += 1;
            note(`${size}px chart ${t}: regime ${L.regime}, but the arcs ${arcsHold ? 'can' : 'cannot'} hold`);
          }
          if (L.spillDeg <= 1e-9) {
            const exact = settled.every((f) => near(L.at.get(f.name), f.off));
            if (exact !== arcsHold) {
              s.exactWrong += 1;
              note(`${size}px chart ${t}: nothing spills, codes ${exact ? 'on' : 'off'} their axes, arcs ${arcsHold ? 'can' : 'cannot'} hold`);
            }
            if (L.regime === 'yielded') {
              const drawnAt = new Map(settled.map((f) => [f.name, L.at.get(f.name)!]));
              for (const f of settled) {
                const x = drawnAt.get(f.name)!;
                const back = ((f.off - x + 540) % 360) - 180;
                if (Math.abs(back) <= 1e-9) continue;
                s.moved += 1;
                const nudged = new Map(drawnAt);
                nudged.set(f.name, x + Math.sign(back) * Math.min(0.01, Math.abs(back)));
                if (arcsCanHold(ms, nudged, spokes, rad, share)) {
                  s.notLeast += 1;
                  note(`${size}px chart ${t}: ${f.name} is ${Math.abs(back).toFixed(3)}° off its axis, and 0.01° back still holds`);
                }
              }
            }
          }
        }
        if (L.regime !== 'relaid') {
          const drawn = ms.map((m) => ({ ...m, at: B.get(m.name)! }));
          const seated = drawn.every((a, j) => {
            const b = drawn[(j + 1) % drawn.length];
            return drawn.length < 2 || n360(b.at - a.at) + 1e-9 >= fullPressureGap(a, b, rad, share);
          });
          if (seated) {
            s.spillCmp += 1;
            const blindSpill = spillOfLayout(movable, B, spokes, rad);
            if (spill > blindSpill + 1e-9) {
              s.spillWorse += 1;
              note(`${size}px chart ${t}: spill ${spill.toFixed(4)}°, house-blind ${blindSpill.toFixed(4)}°`);
            }
          }
        }
      }
    }
    const agreeOk = s.outWhereHeld === 0 && s.canHold > 0 && s.spillFigureWrong === 0;
    const idOk = s.regimeWrong === 0 && s.exactWrong === 0 && s.notLeast === 0 && s.spillWorse === 0 && s.held > 0 && s.moved > 0 && s.spillCmp > 0;
    if (!agreeOk) failures += 1;
    if (!idOk) failures += 1;
    console.log(
      `${agreeOk ? 'ok  ' : 'FAIL'}  ${system}, ${SIZES.join('/')}px: ${s.charts} charts (${s.noCodes} with no codes on the ring); ` +
        `${s.canHold} can hold every body in its house, ${s.outWhereHeld} of them drew one outside` +
        `\n        ${s.cannotHold} cannot (an over-full house): ${s.outWhereNot} drew a body outside, ${s.bodiesOutWhereNot} bodies in all` +
        `${s.spillFigureWrong ? `; the spill figure disagreed with a recount on ${s.spillFigureWrong}` : ''}`,
    );
    console.log(
      `${idOk ? 'ok  ' : 'FAIL'}  ${system}: held ⇔ every arc can hold, ${s.regimeWrong} wrong (${s.held} held); ` +
        `codes on their axes ⇔ the arcs can hold, where nothing spills, ${s.exactWrong} wrong; ` +
        `${s.moved} codes off their axis, ${s.notLeast} by more than the least; ` +
        `spill above the house-blind layout's on ${s.spillWorse} of ${s.spillCmp}` +
        `${first ? `\n        first: ${first}` : ''}`,
    );
  }
}

// ── Resizing, with houses ──────────────────────────────────────────────────
// OUTSIDE-AGREEMENT, as the resize section above: the sidebar dragged one pixel at a time,
// 280–900px, now with the houses in the layout — Whole Sign, quadrant (Porphyry-like) and
// Equal cusps, the same 60 ten-body and 40 nineteen-body charts' shape as above. Two things
// change from the house-blind sweep, and both are on purpose:
//
//   • steps where a code YIELDED are not excluded. A yield is the least move that keeps
//     the bodies in, and the least move is continuous in the wheel's size — it starts from
//     nothing at the size where it first becomes needed — so a held→yielded step must be
//     as quiet as any other. The section fails if no compared step had a yielded side, so
//     it cannot pass by never meeting one. Only `relaid` is excluded, as before.
//   • the CODES are bounded too, by the same 5°: a code off its axis must not jump either.
//
// What is declared instead is the analogue of the catalog ring's over-full arc: a ring with
// a house too full to hold its bodies (spill on either side of the step). There the least
// total spill is bought by sliding a code by as much as it takes — 0.37–0.65° per pixel on
// the two cases below — and a body pinned against that code at the push ceiling
// crosses the scan's soft ramp in about a pixel. Its worst step is printed as a measured
// finding and does not fail the suite. On these charts it stays inside the bound (4.76°
// when this was written); on two other samples of the same shape it did not: 8.05° (Equal
// cusps, nineteen bodies, 285→286px — an MC slid 21° off its axis to make room for the
// crowded houses behind it, Jupiter pinned against it at the ceiling) and 5.32°
// (Porphyry-like, nineteen bodies, 315→316px). So it is not asserted on the strength of a
// sample that happens to miss them.

console.log('\nresizing with houses (OUTSIDE-AGREEMENT)');
{
  const systems: HouseSystem[] = ['Whole Sign', 'Porphyry-like', 'Equal'];
  for (const system of systems) {
    for (const [charts, count] of [[60, 10], [40, 19]] as const) {
      const r = seeded32(97000 + count + systems.indexOf(system) * 10);
      let compared = 0;
      let yieldedSteps = 0;
      let quiet = 0;
      let relaidSteps = 0;
      let worst = 0;
      let worstAt = '';
      let worstCode = 0;
      let worstCodeAt = '';
      let fullSteps = 0;
      let worstFull = 0;
      let worstFullAt = '';
      for (let c = 0; c < charts; c++) {
        const advanced = r() < 0.5;
        const ch = houseChart(r, system, count, 4);
        const layAt = (size: number) => {
          const g = geom(size, advanced);
          const ring = houseRing(ch, g);
          const L = layOutRing(ring.fixed, ring.movable, g.ringSep, g.rPlanets, g.bodyOverlap, ring.spokes);
          return { L, ring, key: detailKey(g) };
        };
        let prev = layAt(280);
        for (let size = 281; size <= 900; size++) {
          const cur = layAt(size);
          if (prev.L.regime === 'relaid' || cur.L.regime === 'relaid') relaidSteps += 1;
          else if (prev.key === cur.key) {
            let jump = 0;
            let who = '';
            for (const m of cur.ring.movable) {
              const d = circDeg(prev.L.at.get(m.name)!, cur.L.at.get(m.name)!);
              if (d > jump) [jump, who] = [d, m.name];
            }
            let cj = 0;
            let cwho = '';
            for (const m of cur.ring.fixed) {
              const d = circDeg(prev.L.at.get(m.name)!, cur.L.at.get(m.name)!);
              if (d > cj) [cj, cwho] = [d, m.name];
            }
            const step = `${size - 1}→${size}px, ${prev.L.regime}→${cur.L.regime}`;
            if (prev.L.spillDeg > 1e-9 || cur.L.spillDeg > 1e-9) {
              fullSteps += 1;
              if (Math.max(jump, cj) > worstFull) [worstFull, worstFullAt] = [Math.max(jump, cj), `${step}, ${jump >= cj ? who : cwho}`];
            } else {
              compared += 1;
              if (prev.L.regime === 'yielded' || cur.L.regime === 'yielded') yieldedSteps += 1;
              if (Math.max(jump, cj) <= 0.25) quiet += 1;
              if (jump > worst) [worst, worstAt] = [jump, `${step}, ${who}`];
              if (cj > worstCode) [worstCode, worstCodeAt] = [cj, `${step}, ${cwho}`];
            }
          }
          prev = cur;
        }
      }
      const ok = worst <= MAX_RESIZE_JUMP_DEG && worstCode <= MAX_RESIZE_JUMP_DEG && yieldedSteps > 0 && compared > 0;
      if (!ok) failures += 1;
      console.log(
        `${ok ? 'ok  ' : 'FAIL'}  ${system}, ${count === 10 ? 'ten bodies' : 'all nineteen'}, 280–900px: ${compared} one-pixel steps ` +
          `(${yieldedSteps} with a code yielded on one side or both), worst body move ${worst.toFixed(2)}° (${worstAt}), ` +
          `worst code move ${worstCode.toFixed(2)}° (${worstCodeAt || 'none'}), ${((100 * quiet) / Math.max(compared, 1)).toFixed(1)}% moved nothing` +
          `${relaidSteps ? `; ${relaidSteps} relaid step(s) excluded` : ''}`,
      );
      console.log(
        `${houseFindingVerdict(worstFull <= MAX_RESIZE_JUMP_DEG)}  the same charts where a house is over-full: ${fullSteps} step(s), ` +
          `worst move ${worstFull.toFixed(2)}°${worstFullAt ? ` (${worstFullAt})` : ''} — measured, not asserted`,
      );
    }
  }
}

if (measuredBreaks || biWheelBreaks || measuredFindings || houseFindings) {
  console.log(
    `\nmeasured, not failed (the \`meas\` lines above):` +
      (measuredBreaks
        ? `\n  ${measuredBreaks} line(s) where the switched-off catalog ring is outside its bound — ` +
          `they fail the suite again once MINOR_RING_ENABLED is back on`
        : '') +
      (biWheelBreaks
        ? `\n  ${biWheelBreaks} line(s) where the ring a bi-wheel is never granted would be outside its ` +
          `bound — the finding the exclusion rests on`
        : '') +
      (measuredFindings
        ? `\n  ${measuredFindings} line(s) of the bi-wheel's own resize behaviour, with or without catalog bodies`
        : '') +
      (houseFindings
        ? `\n  ${houseFindings} line(s) of resizing a ring whose houses are over-full — the declared regime, measured`
        : ''),
  );
}

console.log(failures ? `\n${failures} FAILING CHECK(S)` : '\nall checks pass');
process.exit(failures ? 1 : 0);
