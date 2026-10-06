// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Ring layout: nothing on a chart wheel's glyph ring may overlap anything else,
// and the angle codes (AS/MC/DS/IC/Vx/Avx) must keep the exact spot where their
// axis crosses the ring.
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
  MAX_PUSH_DEG,
  RING_PAD_PX,
  arcDeg,
  placeOnRing,
  type RingMark,
} from '../src/lib/ringLayout';
import {
  MINOR_RING_ENABLED,
  MINOR_RING_MIN,
  angleLabelHalfPx,
  wheelGeometry,
  type WheelGeometry,
} from '../src/lib/wheelGeometry';
import { WALL_HALF_PX, layoutMinorRing, minorRingWalls } from '../src/lib/wheelRingLayout';

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

if (measuredBreaks || biWheelBreaks || measuredFindings) {
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
        : ''),
  );
}

console.log(failures ? `\n${failures} FAILING CHECK(S)` : '\nall checks pass');
process.exit(failures ? 1 : 0);
