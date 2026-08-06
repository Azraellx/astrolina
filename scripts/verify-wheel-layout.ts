// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Ring layout: nothing on a chart wheel's glyph ring may overlap anything else,
// and the angle codes (As/Ds/Mc/Ic/Vx/Avx) must keep the exact spot where their
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

import { arcDeg, placeOnRing, type RingMark } from '../src/lib/ringLayout';

// ── The wheel's own figures, mirrored from WheelSvg ────────────────────────
// A body's disc is r=11 with a 1.3 stroke; the angle codes are 13px/700 text
// with a 3px halo. (The em table is WheelSvg's — repeated rather than exported,
// since what is under test is the LAYOUT, not the width estimate.)
const EM: Record<string, number> = {
  A: 0.72, D: 0.72, I: 0.34, M: 0.92, V: 0.68,
  c: 0.56, s: 0.52, v: 0.56, x: 0.56,
};
const codeHalf = (code: string) => {
  let em = 0;
  for (const ch of code) em += EM[ch] ?? 0.6;
  return (em * 13 + 3) / 2;
};
const DISC_HALF = 11 + 1.3 / 2;

/** The single detailed wheel's radii + readout floor at a given pixel size. */
function geom(size: number) {
  const rOuter = size / 2 - 14;
  const rZodiacInner = rOuter - 34;
  const bandGrow = size >= 440 ? (size - 440) * 0.25 : 0;
  const readoutFan = Math.round(16 * (1 + bandGrow / 130));
  const rPlanets = rZodiacInner - 20 - bandGrow / 3;
  const rReadout = rPlanets - 39 - bandGrow / 3;
  const showReadouts = rReadout > 30 && size >= 440;
  const sep = showReadouts
    ? Math.min(20, Math.max(4, (16 * 360) / (2 * Math.PI * Math.max(rReadout - readoutFan, 1))))
    : 0;
  return { rPlanets, sep };
}

const angles4 = (asc: number, mc: number): [string, number][] => [
  ['As', asc], ['Ds', (asc + 180) % 360], ['Mc', mc], ['Ic', (mc + 180) % 360],
];
const angles6 = (asc: number, mc: number, vx: number): [string, number][] => [
  ...angles4(asc, mc), ['Vx', vx], ['Avx', (vx + 180) % 360],
];
const marks = (codes: [string, number][], bodies: [string, number][]) => ({
  fixed: codes.map(([name, off]): RingMark => ({ name, off, half: codeHalf(name) })),
  movable: bodies.map(([name, off]): RingMark => ({ name, off, half: DISC_HALF })),
});

interface Audit {
  overlaps: string[];
  movedCodes: string[];
  /** Total ink round the ring. Past 360° no arrangement can avoid an overlap. */
  inkDeg: number;
  dropped: boolean;
}
function audit(
  fixed: RingMark[],
  movable: RingMark[],
  out: Map<string, number>,
  rPlanets: number,
): Audit {
  const all = [...fixed, ...movable].map((m) => ({ ...m, at: out.get(m.name) }));
  if (all.some((m) => m.at === undefined)) {
    return { overlaps: [], movedCodes: [], inkDeg: 0, dropped: true };
  }
  const s = all.sort((a, b) => a.at! - b.at!);
  const overlaps: string[] = [];
  for (let i = 0; i < s.length && s.length > 1; i++) {
    const a = s[i];
    const b = s[(i + 1) % s.length];
    const gapPx = ((((((b.at! - a.at!) % 360) + 360) % 360) * Math.PI) / 180) * rPlanets;
    // Ink to ink: the hairline pad and the readout floor are comfort, not
    // correctness. This is the line that must never be crossed.
    if (gapPx + 1e-6 < a.half + b.half) {
      overlaps.push(`${a.name}|${b.name} ${gapPx.toFixed(1)}px < ${(a.half + b.half).toFixed(1)}px`);
    }
  }
  return {
    overlaps,
    movedCodes: fixed
      .filter((f) => Math.abs(((out.get(f.name)! - f.off + 540) % 360) - 180) > 1e-6)
      .map((f) => f.name),
    inkDeg: all.reduce((n, m) => n + arcDeg(2 * m.half, rPlanets), 0),
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
) {
  const { rPlanets, sep } = geom(size);
  const { fixed, movable } = marks(codes, bodies);
  const r = audit(fixed, movable, placeOnRing(fixed, movable, sep, rPlanets), rPlanets);
  const ok = !r.dropped && r.overlaps.length === 0 && (!codesMustHold || r.movedCodes.length === 0);
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${label}` +
      `  [${size}px, codes held: ${r.movedCodes.length === 0 ? 'all' : `all but ${r.movedCodes.join(',')}`}` +
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
check('bodies exactly ON the As and the Mc', 560, angles4(0, 272), at(TEN, [0, 1, 272, 273, 130, 165, 200, 232, 300, 335]));
check('stellium straddling the Mc', 800, angles4(0, 272), at(TEN, [268, 270, 271, 272, 274, 276, 165, 200, 300, 335]));
check('Vertex axis on, narrowest sidebar', 320, angles6(0, 272, 47), at(TEN, [5, 44, 50, 95, 130, 165, 200, 232, 300, 335]));
check('every body conjunct some angle', 700, angles4(0, 90), at(TEN, [0, 0.4, 0.8, 1.2, 90, 90.4, 180, 180.4, 270, 270.4]));
check('no angle marks at all', 560, [], at(TEN, [10, 11, 12, 13, 14, 120, 121, 240, 241, 242]));
check('one body, one angle', 560, [['Mc', 100]], at(['Sun'], [100]));

console.log('\npolar chart: the Mc is 3° from the As, so the codes CANNOT all hold');
check('Mc 3° from As', 560, angles4(0, 3), at(TEN, [90, 120, 150, 180, 210, 240, 270, 300, 330, 45]), false);
check('Mc 1° from As, a body in the sliver', 560, angles4(0, 1), at(TEN, [0.5, 120, 150, 180.5, 210, 240, 270, 300, 330, 45]), false);

// ── Generated charts ──────────────────────────────────────────────────────
// Deterministic (fixed seed) so a failure is reproducible.
let seed = 987654321;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function sweep(
  label: string,
  n: number,
  gen: () => { size: number; codes: [string, number][]; bodies: [string, number][] },
) {
  let bad = 0;
  let full = 0;
  let yielded = 0;
  for (let t = 0; t < n; t++) {
    const { size, codes, bodies } = gen();
    const { rPlanets, sep } = geom(size);
    const { fixed, movable } = marks(codes, bodies);
    const r = audit(fixed, movable, placeOnRing(fixed, movable, sep, rPlanets), rPlanets);
    if (r.dropped) bad += 1;
    else if (r.inkDeg > 360) full += 1;
    else {
      if (r.overlaps.length) bad += 1;
      if (r.movedCodes.length) yielded += 1;
    }
  }
  if (bad) failures += 1;
  console.log(
    `${bad ? 'FAIL' : 'ok  '}  ${label}: ${n} charts, ${bad} overlapping` +
      `, ${full} rings physically full` +
      `, ${yielded} (${((100 * yielded) / n).toFixed(1)}%) where a code had to yield`,
  );
}

console.log('\ngenerated charts');
sweep('adversarial (angles anywhere, bodies bunched)', 5000, () => {
  const size = [320, 380, 440, 560, 700, 800, 900][Math.floor(rnd() * 7)];
  const asc = rnd() * 360;
  const codes = rnd() < 0.5 ? angles4(asc, rnd() * 360) : angles6(asc, rnd() * 360, rnd() * 360);
  const count = 4 + Math.floor(rnd() * 16);
  const tight = rnd() < 0.5;
  const centre = rnd() * 360;
  return {
    size,
    codes,
    bodies: ALL19.slice(0, count).map((n): [string, number] => [
      n,
      tight ? (centre + rnd() * 50) % 360 : rnd() * 360,
    ]),
  };
});
sweep('realistic (Mc 55–125° from As, inner bodies near the Sun)', 5000, () => {
  const size = [380, 440, 560, 700, 800][Math.floor(rnd() * 5)];
  const asc = rnd() * 360;
  const mc = (asc + 55 + rnd() * 70) % 360;
  const codes = rnd() < 0.5 ? angles4(asc, mc) : angles6(asc, mc, (asc + 120 + rnd() * 120) % 360);
  const count = rnd() < 0.35 ? 19 : 10;
  const sun = rnd() * 360;
  return {
    size,
    codes,
    bodies: ALL19.slice(0, count).map((n, i): [string, number] => [
      n,
      (((i < 3 ? sun + (rnd() - 0.5) * 90 : rnd() * 360) % 360) + 360) % 360,
    ]),
  };
});

console.log(failures ? `\n${failures} FAILING CHECK(S)` : '\nall checks pass');
process.exit(failures ? 1 : 0);
