// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Band layout: how a chart wheel spends its radius, checked across every size and
// configuration the app actually renders at.
//
// This is the RADIAL complement to verify-wheel-layout.ts, which checks the
// TANGENTIAL question — that nothing on the glyph ring lands on top of anything
// else going round. Between them they were the blind spot that let this ship:
//
//   • the layout suite assumes ONE radius (rPlanets) and never looks inward, so a
//     collapsing house band or an aspect hub down to 12px was invisible to it;
//   • and it restated the radii by hand with `advanced` pinned false and the
//     readout tier pinned to 440px, so it never modelled a phone at all.
//
// §1–§5 are INTERNAL-IDENTITY checks: the geometry must not contradict itself — a
// slot the solver placed must fit between the two rings the same solver placed it
// between. When one of these breaks, the module is inconsistent with itself.
//
// §4b is neither: it is a REQUIREMENT, asserted because the budget once shed the
// cusp rim on small wheels and that is not a decision the budget gets to make. It
// sits with the identities because it is checked the same way, but a break there
// means someone changed a policy, not that the arithmetic drifted.
//
// §6–§7 are OUTSIDE-AGREEMENT checks: the geometry is measured against what a
// reader needs rather than against its own arithmetic — a house number wants a
// legible arc, an aspect figure wants a real share of the middle, and growing a
// wheel must never take detail away. When one of these breaks, the module is
// perfectly self-consistent and still wrong, which is the failure that produced the
// complaints this replaced. Keeping the two kinds apart is the point: they want
// different responses.
//
// Pure geometry: no React, no DOM, no ephemeris. Calls the same wheelGeometry the
// renderer calls, so there is nothing here that can agree with a stale copy.
//
//   npm run verify:wheel-bands

import { readFileSync } from 'node:fs';
import {
  HUB_TARGET_SHARE,
  MINOR_RING_ENABLED,
  MINOR_RING_MIN,
  houseNumberArcPx,
  wheelGeometry,
  type WheelGeometry,
  type WheelGeometryInput,
} from '../src/lib/wheelGeometry';

// The sizes the app renders a DETAILED wheel at, plus the edges. 280/900 are
// MIN_WHEEL/MAX_WHEEL in ExpandedChartSidebar; 367 is an iPhone SE; ~380 a typical
// portrait phone; 368 the minimap's enlarged size (which IS detailed); 420 the
// bi-wheel's own floor; 760 the report export.
//
// It starts at 280 because nothing renders a detailed wheel below that, and the
// budget genuinely cannot serve one: at 210 with Advanced the cusp rim and the zodiac
// band consume the radius outright and the hub reaches 0%. That is a true statement
// about an unreachable configuration, so sweeping it would assert a requirement on a
// wheel the app never draws — see MINIMAP_SIZES for where 210 is covered.
const SIZES = [
  280, 300, 320, 340, 360, 367, 368, 380, 400, 420, 440, 460, 500, 560, 600, 640,
  700, 760, 800, 860, 900,
];

/** The minimap's own sizes. 210 is ChartWheel's COMPACT_SIZE and is only ever drawn
 *  NON-detailed — no zodiac band, no houses, no readout — so it is swept as that and
 *  nothing else. (Its enlarged 368 is a detailed wheel and lives in SIZES.) */
const MINIMAP_SIZES = [210, ...SIZES];

/** Least arc a house number may be given before it stops being readable, as a
 *  multiple of the font it is drawn at: two tabular digits ("12") ink about 1.1em,
 *  and half an em of daylight either side of that is what keeps twelve of them from
 *  reading as one band of digits.
 *
 *  Font-relative, not a flat pixel figure. A flat one was the first thing written
 *  here (26px) and it is the same mistake as the separation floor it sits next to:
 *  cut against one font size, wrong at every other. The old model gave a phone
 *  12.6px of arc for a 9px number — under the ink itself. */
const MIN_HOUSE_ARC_EM = 1.6;

interface Case {
  label: string;
  input: WheelGeometryInput;
}

const cases: Case[] = [];
for (const size of SIZES) {
  for (const advanced of [false, true]) {
    for (const readouts of [false, true]) {
      cases.push({
        label: `${size}${advanced ? ' adv' : ''}${readouts ? ' forced' : ''}`,
        input: { size, detailed: true, advanced, readouts },
      });
    }
    // The component only offers the overlay at ≥420, so neither does this.
    if (size >= 420) {
      cases.push({
        label: `${size}${advanced ? ' adv' : ''} bi-wheel`,
        input: { size, detailed: true, advanced, hasOverlay: true },
      });
    }
    cases.push({
      label: `${size}${advanced ? ' adv' : ''} planets-only`,
      input: { size, detailed: true, advanced, planetsOnly: true },
    });
  }
}
for (const size of MINIMAP_SIZES) {
  cases.push({ label: `${size} minimap`, input: { size, detailed: false } });
}

let failures = 0;
// §10 also lays out the catalog minor bodies' ring where the app never draws it — on a
// bi-wheel, and anywhere while MINOR_RING_ENABLED is off. Those sections run MEASURED: a
// problem prints as `meas`, with its numbers, and is tallied here instead of in
// `failures`. See §10.
let measuring = false;
let measuredProblems = 0;
const fail = (label: string, msg: string) => {
  if (measuring) {
    measuredProblems += 1;
    console.log(`meas  ${label}: ${msg}`);
    return;
  }
  failures += 1;
  console.log(`FAIL  ${label}: ${msg}`);
};
const px = (v: number) => v.toFixed(1);

// ── §1 Rings decrease outward-in ───────────────────────────────────────────
function checkOrder(label: string, g: WheelGeometry, i: WheelGeometryInput) {
  const chain: [string, number][] = [
    ['R', g.R],
    ['rOuter', g.rOuter],
    ['rZodiacInner', g.rZodiacInner],
  ];
  if (i.hasOverlay) {
    chain.push(['rOverlay', g.rOverlay]);
    if (g.detail.overlayReadout) chain.push(['rOverlayReadout', g.rOverlayReadout]);
  }
  // The catalog ring, when the geometry granted it, sits between those and the planets.
  if (g.detail.minorRing) chain.push(['rMinor', g.rMinor]);
  chain.push(['rPlanets', g.rPlanets]);
  if (g.detail.readout) {
    chain.push(['rReadoutDeg', g.rReadoutDeg]);
    chain.push(['rReadoutSign', g.rReadoutSign]);
    chain.push(['rReadoutMin', g.rReadoutMin]);
  }
  chain.push(['houseRingOuter', g.houseRingOuter]);
  chain.push(['houseRingInner', g.houseRingInner]);
  for (let k = 1; k < chain.length; k++) {
    const [an, av] = chain[k - 1];
    const [bn, bv] = chain[k];
    // Non-strict: a shed readout slot deliberately collapses onto the one outside it.
    if (bv > av + 1e-9) fail(label, `${bn} ${px(bv)} is OUTSIDE ${an} ${px(av)}`);
  }
  if (g.houseRingInner < 0) fail(label, `houseRingInner is negative (${px(g.houseRingInner)})`);
}

// ── §2 The readout fits between the glyph disc and the house ring ──────────
// Ink to ink, the same line the tangential suite draws: what must never be crossed
// is the actual mark, not the comfortable gap around it. Cap height rather than
// font size, because a line of tabular numerals inks about 0.72em of the box it is
// measured in, and asserting on the box would fail arrangements that read fine.
const CAP_EM = 0.72;
/** Half the inked height of a line of readout numerals. */
const halfNum = (font: number) => (CAP_EM * font) / 2;
/** Half the inked height of the readout's sign glyph. The NATAL trio draws it at
 *  font + 3 (the overlay's own trio uses font + 2, and is not checked here — its
 *  spacing is governed by overlayFan, not readoutFan). */
const halfSign = (font: number) => (CAP_EM * (font + 3)) / 2;

function checkReadout(label: string, g: WheelGeometry) {
  if (!g.detail.readout) return;
  const f = g.readoutFont;
  const discInner = g.rPlanets - g.discR;
  if (g.rReadoutDeg + halfNum(f) > discInner + 1e-9) {
    fail(label, `degree slot (${px(g.rReadoutDeg + halfNum(f))}) runs into the glyph disc (${px(discInner)})`);
  }
  const innermost = g.detail.readoutMin
    ? g.rReadoutMin - halfNum(f)
    : g.detail.readoutSign
      ? g.rReadoutSign - halfSign(f)
      : g.rReadoutDeg - halfNum(f);
  if (innermost < g.houseRingOuter - 1e-9) {
    fail(label, `readout (${px(innermost)}) runs into the house ring (${px(g.houseRingOuter)})`);
  }
  // A slot that is drawn must clear the one outside it, not stack on it.
  if (g.detail.readoutSign) {
    const need = halfNum(f) + halfSign(f);
    const gap = g.rReadoutDeg - g.rReadoutSign;
    if (gap < need - 1e-9) {
      fail(label, `sign slot inks into the degree slot (gap ${px(gap)} < ${px(need)})`);
    }
  }
  if (g.detail.readoutMin) {
    const need = halfSign(f) + halfNum(f);
    const gap = g.rReadoutSign - g.rReadoutMin;
    if (gap < need - 1e-9) {
      fail(label, `minute slot inks into the sign slot (gap ${px(gap)} < ${px(need)})`);
    }
  }
}

// ── §3 The rim signs fit the band they sit in ──────────────────────────────
function checkSignBand(label: string, g: WheelGeometry) {
  const band = g.rOuter - g.rZodiacInner;
  if (g.signGlyphPx > band * 0.95 + 1e-9) {
    fail(label, `sign glyph ${px(g.signGlyphPx)} does not fit the ${px(band)}px zodiac band`);
  }
}

// ── §4 The cusp readout fits INSIDE the zodiac band ────────────────────────
// It used to be drawn at rOuter + 12, outside the wheel, and the budget reserved a
// 20–22px band out there for it — a fifth of the radius on a phone. It shares the
// band's mid-radius with the sign glyphs now, so what has to hold is that the band
// is tall enough for both kinds of ink, not that the wheel reserved a margin.
function checkCuspRim(label: string, g: WheelGeometry) {
  if (!g.detail.cuspRim) return;
  const band = g.rOuter - g.rZodiacInner;
  // Both are centred on the band's mid-radius, so the taller of the two is what
  // has to fit — the glyph, always, since the readout is the smaller face.
  const tallest = Math.max(g.signGlyphPx, g.cuspRimPx);
  if (tallest > band * 0.95 + 1e-9) {
    fail(label, `band ${px(band)} cannot hold ${px(tallest)} of ink at its mid-radius`);
  }
  // And nothing may sit outside the rim any more.
  if (g.rOuter > g.R - 1e-9) {
    fail(label, `rOuter ${px(g.rOuter)} leaves no breathing margin inside R ${px(g.R)}`);
  }
}

// ── §4b The cusp rim is drawn whenever the chart has one ───────────────────
// Not a geometric property — a REQUIREMENT, and the reason it is asserted rather
// than left to the budget is that the budget shed it once. Under Whole Sign the
// twelve labels all read 0°00' and the ring looks disposable; under the other nine
// house systems each is a distinct value that appears nowhere else on the wheel.
// A phone was the size that lost them, which is the screen where scrolling to the
// table below costs most.
function checkCuspRimAlways(label: string, g: WheelGeometry, i: WheelGeometryInput) {
  if (!i.detailed) return;
  const shouldHave = !!i.advanced && !i.planetsOnly;
  if (g.detail.cuspRim !== shouldHave) {
    fail(
      label,
      `cusp rim is ${g.detail.cuspRim ? 'drawn' : 'OMITTED'} where it should be ` +
        `${shouldHave ? 'drawn' : 'absent'} (advanced=${!!i.advanced}, planetsOnly=${!!i.planetsOnly})`,
    );
  }
}

// ── §4c The twelve cusp units fit the band, and each other ────────────────
// A cusp reads as one unit now — degree, sign glyph, minutes, laid out
// horizontally and centred on the cusp, the way the reference charts annotate a
// cusp. Two things have to hold for that to be drawable at all.
//
// It is deliberately NOT checked against the sign glyphs at their midpoints: the
// band carries one kind of mark at a time. When the units are drawn they carry
// their own sign glyph and the standalone ones are not; when they are not drawn
// (a non-Advanced wheel, the reports export, the minimap) the standalone glyphs
// are the whole band.
function checkBandCrowding(label: string, g: WheelGeometry) {
  if (!g.detail.cuspRim) return;
  // Straight from the geometry — the figure WheelSvg lays the unit out with, not a
  // second estimate of it that could drift from the first.
  const unitHalf = g.cuspUnitHalfPx;
  // 1. The unit is laid ALONG the band, so its furthest point from the centre is
  //    hypot(radius, step) — barely more than the radius itself, which is the whole
  //    reason tangential placement does not need the inward clamp a flat one did.
  //    Still asserted, because it is what makes that true rather than a hope.
  const rMid0 = (g.rZodiacInner + g.rOuter) / 2;
  const reach = Math.hypot(rMid0, g.cuspUnitStepPx) + g.cuspRimPx * 0.6;
  if (reach > g.R + 1e-9) {
    fail(label, `a cusp unit reaches ${px(reach)} against a ${px(g.R)} radius`);
  }
  // 2. Adjacent cusps are 30 deg apart under whole sign — the evenly-spaced case, and
  //    the one every chart in that system hits. Two units must not collide there.
  const rMid = (g.rZodiacInner + g.rOuter) / 2;
  const arc30 = (2 * Math.PI * rMid * 30) / 360;
  if (2 * unitHalf > arc30) {
    fail(label, `two cusp units need ${px(2 * unitHalf)}px where 30 deg of band gives ${px(arc30)}px`);
  }
}
// ── §5 planetsOnly has no house band; everything else has one ──────────────
function checkHouseBand(label: string, g: WheelGeometry, i: WheelGeometryInput) {
  if (i.planetsOnly) {
    if (g.houseBand !== 0) fail(label, `planets-only wheel still has a ${px(g.houseBand)}px house band`);
    return;
  }
  if (!i.detailed) return;
  // The old model let this reach zero, which deleted the house ring, the cusp
  // lines and all twelve numbers with nothing said. It is an assertion now.
  if (g.houseBand <= 0) fail(label, 'house band collapsed to zero');
}

// ── §6 A house number gets a legible arc ───────────────────────────────────
function checkHouseArc(label: string, g: WheelGeometry, i: WheelGeometryInput) {
  if (i.planetsOnly || !i.detailed) return;
  const arc = houseNumberArcPx(g);
  const need = MIN_HOUSE_ARC_EM * g.houseNumPx;
  if (arc < need) {
    fail(label, `${px(arc)}px of arc per house number at ${g.houseNumPx}px (want ≥ ${px(need)})`);
  }
}

// ── §7 The aspect hub keeps its share of the middle ────────────────────────
function checkHub(label: string, g: WheelGeometry, i: WheelGeometryInput) {
  if (!i.detailed) return;
  const share = g.rAspectRing / g.R;
  if (share < HUB_TARGET_SHARE - 1e-9) {
    fail(label, `aspect hub is ${(100 * share).toFixed(1)}% of the radius (want ≥ ${(100 * HUB_TARGET_SHARE).toFixed(0)}%)`);
  }
}

console.log('§1–§5 the geometry does not contradict itself (§4b: the cusp rim is never shed)');
console.log('§6–§7 the geometry gives the reader what the reader needs\n');

for (const c of cases) {
  const g = wheelGeometry(c.input);
  checkOrder(c.label, g, c.input);
  checkReadout(c.label, g);
  if (c.input.detailed) {
    checkSignBand(c.label, g);
    checkCuspRim(c.label, g);
    checkBandCrowding(c.label, g);
  }
  checkCuspRimAlways(c.label, g, c.input);
  checkHouseBand(c.label, g, c.input);
  checkHouseArc(c.label, g, c.input);
  checkHub(c.label, g, c.input);
}
console.log(
  `${failures ? 'FAIL' : 'ok  '}  ${cases.length} size × configuration cases` +
    `, ${failures} problem(s)`,
);

// ── §8 Growing a wheel never takes detail away ─────────────────────────────
// The one an emergent budget cannot promise, and the reason the shed order is
// declared data rather than control flow. A bi-wheel used to lose its natal
// readout on crossing 600px, where the overlay ring became affordable and pushed
// everything else inward — a bigger wheel showing less.
console.log('\ngrowing a wheel never takes detail away');
const rank = (g: WheelGeometry) =>
  (g.detail.cuspRim ? 1 : 0) +
  (g.detail.overlayReadout ? 1 : 0) +
  (g.detail.readout ? 1 : 0) +
  (g.detail.readoutSign ? 1 : 0) +
  (g.detail.readoutMin ? 1 : 0);

for (const advanced of [false, true]) {
  for (const hasOverlay of [false, true]) {
    let regressions = 0;
    let prev: { size: number; g: WheelGeometry } | null = null;
    // Every 2px, not just the listed sizes: a drag handle moves through all of them.
    for (let size = hasOverlay ? 420 : 280; size <= 900; size += 2) {
      const g = wheelGeometry({ size, detailed: true, advanced, hasOverlay });
      if (prev && rank(g) < rank(prev.g)) {
        regressions += 1;
        if (regressions === 1) {
          fail(
            `${advanced ? 'adv' : 'plain'}${hasOverlay ? ' bi-wheel' : ''}`,
            `detail DROPS from ${prev.size}px to ${size}px (rank ${rank(prev.g)} → ${rank(g)})`,
          );
        }
      }
      prev = { size, g };
    }
    const label = `${advanced ? 'adv' : 'plain'}${hasOverlay ? ' bi-wheel' : ''}`;
    console.log(
      `${regressions ? 'FAIL' : 'ok  '}  ${label.padEnd(16)} ${regressions} regression(s) across 280–900px`,
    );
  }
}

// ── A table, so a change to the budget is readable in the diff ─────────────
console.log('\nwhat each size ends up with (Advanced on)');
console.log('size   hub    share  house arc  keeps');
for (const size of [280, 340, 380, 440, 560, 640, 760, 900]) {
  const g = wheelGeometry({ size, detailed: true, advanced: true });
  const keeps = [
    g.detail.cuspRim ? 'rim' : null,
    g.detail.readout
      ? g.detail.readoutMin
        ? 'deg·sign·min'
        : g.detail.readoutSign
          ? 'deg·sign'
          : 'deg'
      : 'no readout',
  ]
    .filter(Boolean)
    .join(' + ');
  console.log(
    `${String(size).padStart(4)}  ${px(g.rAspectRing).padStart(6)}  ` +
      `${((100 * g.rAspectRing) / g.R).toFixed(1).padStart(5)}%  ` +
      `${px(houseNumberArcPx(g)).padStart(9)}  ${keeps}`,
  );
}

// ── §9 No stylesheet may take the ink sizes back ───────────────────────────
// The one check here that reads a FILE rather than the module, and the only thing
// standing between this suite and a repeat of the bug it was written after.
//
// The geometry's font sizes reach the DOM as SVG presentation attributes, which
// carry specificity ZERO — so a single `font-size` in a stylesheet silently wins
// and every figure above becomes a number the suite asserts about and the browser
// never paints. That is not a hypothetical: `.readout-deg { font-size: 10px }` did
// exactly that to `fontSize={readoutFont}` for as long as readoutScale existed, and
// `.capture-extras .astro-glyph { font-size: 1.08em }` flattened every glyph on the
// capture wheel to one size. Nothing in a pure-geometry suite can see either.
console.log('\nno stylesheet takes the ink sizes back');
const cssPath = 'src/components/Wheel/WheelSvg.css';
const css = readFileSync(cssPath, 'utf8');
/** The classes WheelSvg sizes from the geometry. A font-size for any of them wins. */
const SIZED_CLASSES = [
  'house-number',
  'cusp-rim-deg',
  'wheel-angle-label',
  'readout-deg',
  'readout-min',
];
for (const cls of SIZED_CLASSES) {
  // The rule body for `.wheel-svg .<cls> { … }` — non-greedy to the first close brace.
  const m = css.match(new RegExp(`\\.wheel-svg\\s+\\.${cls}\\s*\\{([^}]*)\\}`));
  if (!m) {
    fail(cssPath, `no rule found for .${cls} — has it been renamed?`);
  } else if (/(^|[;{\s])font-size\s*:/.test(m[1])) {
    fail(
      cssPath,
      `.${cls} declares font-size, which beats the geometry's presentation attribute ` +
        `— the wheel will paint that size at EVERY wheel size`,
    );
  }
}
// The glyph classes are sized from the geometry too (signGlyphPx / glyphPx), and
// they are shared with plain HTML spans elsewhere — so what is checked is that no
// rule sizes `.astro-glyph` in a way that also catches the wheel's SVG <text>.
const captureCss = 'src/components/CaptureExtras/CaptureExtras.css';
const capture = readFileSync(captureCss, 'utf8');
for (const m of capture.matchAll(/([^{}]*\.astro-glyph[^{}]*)\{([^}]*)\}/g)) {
  const selector = m[1].trim();
  if (!/font-size\s*:/.test(m[2])) continue;
  // `span.astro-glyph` cannot match an SVG <text>, so it is safe by construction.
  if (/\bspan\.astro-glyph\b/.test(selector)) continue;
  fail(
    captureCss,
    `"${selector}" sizes .astro-glyph without a span qualifier — it will also catch ` +
      `the capture wheel's SVG glyphs and flatten them to one size`,
  );
}
console.log(
  `${failures ? 'FAIL' : 'ok  '}  ${SIZED_CLASSES.length} sized classes + the capture glyph rule`,
);
// The catalog bodies' coin draws its symbol as the same `text.astro-glyph`, sized from
// the geometry (minorGlyphPx) — so it needs no class of its own in SIZED_CLASSES, but
// the stylesheet that came with its HTML twin (MinorMark) is one more place a
// `.astro-glyph` font-size could catch the wheel's SVG text. Same test, same exemption.
{
  const before = failures;
  const markCss = 'src/components/MinorMark/MinorMark.css';
  const mark = readFileSync(markCss, 'utf8');
  for (const m of mark.matchAll(/([^{}]*\.astro-glyph[^{}]*)\{([^}]*)\}/g)) {
    const selector = m[1].trim();
    if (!/font-size\s*:/.test(m[2])) continue;
    if (/\bspan\.astro-glyph\b/.test(selector)) continue;
    fail(
      markCss,
      `"${selector}" sizes .astro-glyph without a span qualifier — it will also catch ` +
        `the wheel's catalog-coin symbols and flatten them to one size`,
    );
  }
  console.log(`${failures > before ? 'FAIL' : 'ok  '}  the catalog mark's stylesheet leaves the coin symbol alone`);
}

// ── §10 The catalog minor bodies: their rim diamonds, and their ring ──────────
// Catalog bodies ASK the geometry for a ring of their own (`minorRing`). It is granted
// on a single detailed wheel at or above its gate (600px) and nowhere else: below the
// gate, on every bi-wheel and on the minimap each catalog body is a diamond in the tick
// strip at its true degree, and the geometry is EXACTLY the one a wheel with no catalog
// bodies gets.
//
//   §10a INTERNAL-IDENTITY — not asking, and asking wherever the ring is not granted
//        (below the gate, every bi-wheel, the minimap), give exactly the geometry of a
//        wheel with no catalog bodies, field for field. verify-wheel-layout builds on this
//        when it says the built-ins are untouched; if it breaks, that suite's claim is
//        hollow. Then the same with the ring laid out regardless: below the gate and on
//        the minimap, still nothing.
//   §10b REQUIREMENT — the ring is ON, its gate is 600px, and a bi-wheel never gets it.
//        Pinned HERE rather than read back from the module, so switching it, moving the
//        gate or granting it to a bi-wheel is a decision made in two places. As with §4b,
//        a break means someone changed a policy. Then every pixel from 150px to 1100px,
//        on every kind of wheel: drawn exactly when asked for at or above the gate on a
//        single detailed wheel — and on a bi-wheel, an IDENTITY: asking for it is the
//        flag omitted, field for field, at every size from 420px.
//   §10c INTERNAL-IDENTITY — the ring sits where the module says it does: nothing outside
//        the coins moves (their outer edge takes the disc's old slot), the coins clear the
//        tick strip above them and the planet discs below, and the ring takes no detail
//        at any pixel from the gate to 1100px.
//   §10d INTERNAL-IDENTITY — every rim diamond keeps its outer tip at the tick strip's
//        outer edge; stays inside the strip on a bi-wheel and the minimap; on a single
//        wheel grows with the wheel into the gap above the planet discs, never closer
//        than PIP_CLEAR to their outline; and is clear of the overlay ring and the coins.
//   §10e §1–§8 again with the ring drawn: the ring is radius taken from inside the wheel,
//        so the hub, the house arc and the monotone ladder are re-asserted for the wheels
//        that carry it (§6–§7 there are OUTSIDE-AGREEMENT, as above).
//   §10f REQUIREMENT, then INTERNAL-IDENTITY — an OVERLAY's catalog bodies on a bi-wheel
//        are marks in the same strip, PIP_CLEAR clear of the overlay discs as WheelSvg
//        draws them, of the natal discs and of both readout fans, at every size and rung;
//        and asking for them moves no other figure.
//
// The BI-WHEEL's would-be ring is still laid out, through `measureMinorRing` from the same
// gate, and §10c–§10e print it on every run as a FINDING that never fails the suite
// ("measured — bi-wheel, never granted"): it is the reason for the exclusion. On a
// 608–671px bi-wheel the ring makes the ladder shed the second chart's readout ring, and
// verify-wheel-layout measures its cost to the built-ins over budget up to ~730px. With
// MINOR_RING_ENABLED off, every section about the ring runs the same way, measured.
console.log('\n§10 catalog minor bodies: the rim diamonds, and their ring');

/** The strip just inside the zodiac band where every body's true-degree tick is drawn
 *  (WheelSvg: rZodiacInner − 2 to − 8) and Advanced's graduations hang (up to 8px). A
 *  rim diamond IS a catalog body's tick, so it must stay inside it — and the ring must
 *  not reach up into it. Stated here as the plan states it, not read from the module. */
const TICK_STRIP_OUTER = 1;
const TICK_STRIP_INNER = 8;
// How close a grown rim diamond may come to the planet discs' outline (wheelGeometry's
// PIP_CLEAR, restated on purpose: the suite pins the policy, it doesn't read it back).
const PIP_CLEAR = 2;
/** The ring's switch and gate, as this suite requires them (§10b). There is no bi-wheel
 *  gate: a bi-wheel never gets the ring, and §10b holds that as an identity. */
const RING_ENABLED = true;
const GATE_SINGLE = 600;
/** Whether the app's geometry may grant the ring to this wheel at all. */
const grantable = (i: WheelGeometryInput) =>
  MINOR_RING_ENABLED && i.detailed && !i.hasOverlay && i.size >= GATE_SINGLE;
/** The same wheel with the ring asked for and laid out whether or not it is switched on,
 *  and on a bi-wheel too — the only way to reach either. */
const withRing = (i: WheelGeometryInput): WheelGeometryInput => ({
  ...i,
  minorRing: true,
  measureMinorRing: true,
});
/** A section's label: nothing for an assertion, and what kind of measurement otherwise. */
const measuredLabel = (finding: boolean) =>
  finding ? ' [measured — bi-wheel, never granted]' : MINOR_RING_ENABLED ? '' : ' [measured — ring disabled]';
const MEASURED = measuredLabel(false);
/** Run a section about the ring itself. Its problems print as `meas` and are counted apart
 *  from the suite's failures while the ring is switched off, and always for a `finding`
 *  (the bi-wheel's would-be ring). Returns how many it found. */
function ringSection(body: () => void, finding = false): number {
  const f0 = failures;
  const m0 = measuredProblems;
  measuring = finding || !MINOR_RING_ENABLED;
  try {
    body();
  } finally {
    measuring = false;
  }
  return failures - f0 + (measuredProblems - m0);
}
const ringTag = (problems: number, finding = false) =>
  problems === 0 ? 'ok  ' : MINOR_RING_ENABLED && !finding ? 'FAIL' : 'meas';

/** Every field of two geometries, compared with Object.is — the first difference, or null. */
function geometryDiff(a: WheelGeometry, b: WheelGeometry): string | null {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.join() !== kb.join()) return `field sets differ (${ka.length} vs ${kb.length})`;
  for (const k of ka as (keyof WheelGeometry)[]) {
    if (k === 'detail') {
      for (const d of Object.keys(a.detail) as (keyof WheelGeometry['detail'])[]) {
        if (a.detail[d] !== b.detail[d]) return `detail.${d} ${a.detail[d]} vs ${b.detail[d]}`;
      }
      continue;
    }
    if (!Object.is(a[k], b[k])) return `${k} ${String(a[k])} vs ${String(b[k])}`;
  }
  return null;
}

// §10a — the flag absent, false, and asked-for wherever it is not granted: one geometry.
{
  const before = failures;
  let compared = 0;
  for (const c of cases) {
    const g0 = wheelGeometry(c.input);
    const dFalse = geometryDiff(g0, wheelGeometry({ ...c.input, minorRing: false }));
    compared += 1;
    if (dFalse) fail(c.label, `minorRing:false is not the flag omitted — ${dFalse}`);
    if (!grantable(c.input)) {
      const dAsk = geometryDiff(g0, wheelGeometry({ ...c.input, minorRing: true }));
      compared += 1;
      if (dAsk) fail(c.label, `asking for the ring where it is not granted changed the geometry — ${dAsk}`);
    }
  }
  console.log(
    `${failures > before ? 'FAIL' : 'ok  '}  §10a ${compared} comparisons: minorRing false ≡ omitted, and ` +
      `asked-for ≡ omitted wherever the ring is not granted` +
      `${MINOR_RING_ENABLED ? ' (below the gate, every bi-wheel, the minimap)' : ' — with it switched off, every case'}, field for field`,
  );
  let below = 0;
  const problems = ringSection(() => {
    for (const c of cases) {
      if (c.input.detailed && c.input.size >= GATE_SINGLE) continue;
      below += 1;
      const d = geometryDiff(wheelGeometry(c.input), wheelGeometry(withRing(c.input)));
      if (d) fail(c.label, `the ring, laid out below its gate or on the minimap, changed the geometry — ${d}`);
    }
  });
  console.log(
    `${ringTag(problems)}  §10a ${below} comparisons with the ring laid out: below its gate and on the ` +
      `minimap ≡ omitted${MEASURED}`,
  );
}

// §10b — the switch and the gate, then every pixel from the smallest wheel to past the largest.
{
  const before = failures;
  if (MINOR_RING_ENABLED !== RING_ENABLED) {
    fail(
      'wheelGeometry',
      `the module's MINOR_RING_ENABLED reads ${MINOR_RING_ENABLED}, this suite pins ${RING_ENABLED} — ` +
        `move both, knowingly`,
    );
  }
  if (MINOR_RING_MIN !== GATE_SINGLE) {
    fail(
      'wheelGeometry',
      `the module's gate reads ${MINOR_RING_MIN}px, this suite pins ${GATE_SINGLE}px — move both, knowingly`,
    );
  }
  const inputsAt = (size: number, advanced: boolean): WheelGeometryInput[] => {
    const inputs: WheelGeometryInput[] = [
      { size, detailed: false },
      { size, detailed: true, advanced },
      { size, detailed: true, advanced, planetsOnly: true },
      { size, detailed: true, advanced, readouts: true },
    ];
    if (size >= 420) inputs.push({ size, detailed: true, advanced, hasOverlay: true });
    return inputs;
  };
  const labelOf = (input: WheelGeometryInput, advanced: boolean, ask: boolean) =>
    `${input.size}${input.detailed ? '' : ' minimap'}${input.hasOverlay ? ' bi-wheel' : ''}` +
    `${input.planetsOnly ? ' planets-only' : ''}${advanced ? ' adv' : ''}${ask ? ' (asked)' : ''}`;
  // As the app draws it.
  let probed = 0;
  let biProbed = 0;
  let biDiffer = 0;
  for (let size = 150; size <= 1100; size++) {
    for (const advanced of [false, true]) {
      for (const input of inputsAt(size, advanced)) {
        const g0 = wheelGeometry(input);
        const gAsk = wheelGeometry({ ...input, minorRing: true });
        const want = grantable(input);
        probed += 1;
        // The bi-wheel, on its own tally: asking is the flag omitted, at every size.
        if (input.hasOverlay) {
          biProbed += 1;
          if (geometryDiff(g0, gAsk)) biDiffer += 1;
        }
        if (g0.detail.minorRing || g0.rMinor !== 0) {
          fail(labelOf(input, advanced, false), 'the catalog ring is drawn without being asked for');
        }
        if (gAsk.detail.minorRing !== want) {
          fail(
            labelOf(input, advanced, true),
            `catalog ring ${gAsk.detail.minorRing ? 'drawn' : 'absent'} where it should be ${want ? 'drawn' : 'absent'}`,
          );
        } else if ((gAsk.rMinor > 0) !== want) {
          fail(labelOf(input, advanced, true), `rMinor ${px(gAsk.rMinor)} disagrees with detail.minorRing (${want})`);
        } else if (!want) {
          const d = geometryDiff(g0, gAsk);
          if (d) fail(labelOf(input, advanced, true), `asking for the ring changed the geometry — ${d}`);
        }
      }
    }
  }
  console.log(
    `${failures > before ? 'FAIL' : 'ok  '}  §10b ${probed} probes, 150–1100px: ` +
      (MINOR_RING_ENABLED
        ? `the ring is drawn exactly when asked for on a single wheel at ≥ ${GATE_SINGLE}px, never on a ` +
          `bi-wheel or the minimap`
        : 'the ring is switched off and never drawn — asking for it changes nothing, field for field, ' +
          'at any size on any kind of wheel'),
  );
  // The bi-wheel's exclusion, stated as what it is: an identity, counted on its own so a
  // sweep that stopped reaching bi-wheels could not pass it vacuously.
  if (biProbed === 0 || biDiffer > 0) {
    fail('bi-wheel', `asking for the ring changed the geometry on ${biDiffer} of ${biProbed} bi-wheels`);
  }
  console.log(
    `${biProbed > 0 && biDiffer === 0 ? 'ok  ' : 'FAIL'}  §10b ${biProbed} bi-wheels, 420–1100px (IDENTITY): ` +
      `asking for the ring ≡ the flag omitted, field for field — the bi-wheel never gets it`,
  );
  // With the ring laid out regardless of the switch and of the bi-wheel's exclusion: the
  // gate itself.
  let measuredProbes = 0;
  const problems = ringSection(() => {
    for (let size = 150; size <= 1100; size++) {
      for (const advanced of [false, true]) {
        for (const input of inputsAt(size, advanced)) {
          for (const ask of [false, true]) {
            const g = wheelGeometry({ ...input, minorRing: ask, measureMinorRing: true });
            const want = ask && input.detailed && size >= GATE_SINGLE;
            measuredProbes += 1;
            if (g.detail.minorRing !== want) {
              fail(
                labelOf(input, advanced, ask),
                `catalog ring ${g.detail.minorRing ? 'drawn' : 'absent'} where it should be ${want ? 'drawn' : 'absent'}`,
              );
            } else if ((g.rMinor > 0) !== want) {
              fail(labelOf(input, advanced, ask), `rMinor ${px(g.rMinor)} disagrees with detail.minorRing (${want})`);
            }
          }
        }
      }
    }
  });
  console.log(
    `${ringTag(problems)}  §10b ${measuredProbes} probes with the ring laid out, 150–1100px: drawn exactly when ` +
      `asked for at ≥ ${GATE_SINGLE}px, bi-wheel included, never on the minimap${MEASURED}`,
  );
}

// The ring-on twin of every detailed case at or above the gate, laid out regardless of
// the switch: the single wheels, which get it, and the bi-wheels, which never do and are
// measured as a finding.
const ringTwin = (c: Case): Case => ({ label: `${c.label} +catalog ring`, input: withRing(c.input) });
const atGate = cases.filter((c) => c.input.detailed && c.input.size >= GATE_SINGLE);
const ringCases: Case[] = atGate.filter((c) => !c.input.hasOverlay).map(ringTwin);
const biRingCases: Case[] = atGate.filter((c) => c.input.hasOverlay).map(ringTwin);

// §10c — where the ring sits, against the same wheel without it: on the single wheels
// that get it, asserted; on the bi-wheels, which never do, the finding behind that.
{
  const sitsRight = (list: Case[], finding: boolean) => {
    let leastDaylight = Infinity;
    let leastDaylightAt = '';
    const problems = ringSection(() => {
      for (const c of list) {
        const on = wheelGeometry(c.input);
        const off = wheelGeometry({ ...c.input, minorRing: false });
        if (!on.detail.minorRing) {
          fail(c.label, 'the ring was not drawn at or above its gate');
          continue;
        }
        // Nothing outside the coins moves.
        for (const k of ['rOuter', 'rZodiacInner', 'rPip', 'pipR', 'rOverlay', 'rOverlayReadout', 'rOverlayDivider'] as const) {
          if (!Object.is(on[k], off[k])) fail(c.label, `${k} moved with the ring on: ${px(off[k])} → ${px(on[k])}`);
        }
        if (on.detail.overlayReadout !== off.detail.overlayReadout) {
          fail(c.label, `the overlay readout ${off.detail.overlayReadout ? 'was shed' : 'appeared'} when the ring came on`);
        }
        // The coin's outer edge takes the planet disc's old slot, exactly.
        const coinOuter = on.rMinor + on.minorR;
        if (Math.abs(coinOuter - (off.rPlanets + off.discR)) > 1e-9) {
          fail(c.label, `coin outer edge ${px(coinOuter)} ≠ the disc's old outer edge ${px(off.rPlanets + off.discR)}`);
        }
        // Clear of the tick strip above (outline included) …
        if (on.rMinor + on.minorDiscHalf > on.rZodiacInner - TICK_STRIP_INNER + 1e-9) {
          fail(c.label, `coin (${px(on.rMinor + on.minorDiscHalf)}) reaches into the tick strip (${px(on.rZodiacInner - TICK_STRIP_INNER)})`);
        }
        // … and of the planet discs below, outline to outline, with daylight between.
        const daylight = on.rMinor - on.minorDiscHalf - (on.rPlanets + on.discHalf);
        if (daylight < leastDaylight) {
          leastDaylight = daylight;
          leastDaylightAt = c.label;
        }
        if (daylight < 1 - 1e-9) {
          fail(c.label, `only ${px(daylight)}px between a coin's outline and a planet disc's`);
        }
        // On a bi-wheel the divider runs between the two charts: inside the overlay ring's
        // innermost ink, outside the coins.
        if (c.input.hasOverlay) {
          const overlayInner = on.detail.overlayReadout
            ? on.rOverlayReadout - on.overlayFan
            : on.rOverlay - on.overlayDiscR;
          if (!(on.rOverlay - on.overlayDiscR > on.rOverlayDivider)) {
            fail(c.label, `divider ${px(on.rOverlayDivider)} is not inside the overlay discs (${px(on.rOverlay - on.overlayDiscR)})`);
          }
          if (!(overlayInner > on.rOverlayDivider && on.rOverlayDivider > coinOuter)) {
            fail(c.label, `divider ${px(on.rOverlayDivider)} is not between the overlay (${px(overlayInner)}) and the coins (${px(coinOuter)})`);
          }
        }
      }
    }, finding);
    console.log(
      `${ringTag(problems, finding)}  §10c ${list.length} ring-on ${finding ? 'bi-wheel' : 'single-wheel'} cases: ` +
        `nothing outside the coins moves, the coins clear the tick strip` +
        `${finding ? ', the divider stays between the charts' : ''}${measuredLabel(finding)}` +
        `\n        least daylight between a coin and a planet disc ${px(leastDaylight)}px (${leastDaylightAt})`,
    );
  };
  sitsRight(ringCases, false);
  sitsRight(biRingCases, true);
  // The listed sizes are a sample; a dragged sidebar passes through every pixel. What
  // can go wrong between them is the shed ladder picking a different rung with the ring
  // on — the ring's radius failing the hub check one rung earlier — which moves
  // everything the ring was supposed to leave alone. Named as runs of sizes, so a break
  // says where rather than only that.
  for (const hasOverlay of [false, true]) {
    const moved: string[] = [];
    ringSection(() => {
      for (const advanced of [false, true]) {
        const sizes: number[] = [];
        for (let size = GATE_SINGLE; size <= 1100; size++) {
          const input: WheelGeometryInput = { size, detailed: true, advanced, hasOverlay };
          const on = wheelGeometry(withRing(input));
          const off = wheelGeometry(input);
          const kept =
            on.detail.overlayReadout === off.detail.overlayReadout &&
            on.detail.readout === off.detail.readout &&
            on.detail.readoutSign === off.detail.readoutSign &&
            on.detail.readoutMin === off.detail.readoutMin &&
            Object.is(on.rOverlayDivider, off.rOverlayDivider) &&
            Math.abs(on.rMinor + on.minorR - (off.rPlanets + off.discR)) <= 1e-9;
          if (!kept) sizes.push(size);
        }
        if (sizes.length) {
          const runs: string[] = [];
          let start = sizes[0];
          for (let k = 1; k <= sizes.length; k++) {
            if (k === sizes.length || sizes[k] !== sizes[k - 1] + 1) {
              runs.push(start === sizes[k - 1] ? `${start}` : `${start}–${sizes[k - 1]}`);
              if (k < sizes.length) start = sizes[k];
            }
          }
          moved.push(`${advanced ? 'adv ' : ''}${hasOverlay ? 'bi-wheel' : 'single'} ${runs.join(', ')}px`);
        }
      }
      if (moved.length) {
        fail('every pixel from the gate to 1100px', `the ring changes the detail or the radii it should leave alone at: ${moved.join('; ')}`);
      }
    }, hasOverlay);
    console.log(
      `${ringTag(moved.length, hasOverlay)}  §10c every pixel from the gate to 1100px, ` +
        `${hasOverlay ? 'bi-wheel' : 'single wheel'}: the ring takes no detail and moves nothing outside the coins` +
        `${measuredLabel(hasOverlay)}`,
    );
  }
}

// §10d — the rim diamond, on every wheel: bi-wheel, minimap, asked-for or not — and then
// with the ring drawn.
{
  const checkPip = (c: Case) => {
    const g = wheelGeometry(c.input);
    const inner = g.rPip - g.pipR;
    const outer = g.rPip + g.pipR;
    if (!(g.pipR > 0)) fail(c.label, `rim diamond has no size (pipR ${px(g.pipR)})`);
    // The outer tip sits at the strip's outer edge on every wheel, whatever the size.
    if (Math.abs(outer - (g.rZodiacInner - TICK_STRIP_OUTER)) > 1e-9) {
      fail(c.label, `rim diamond's outer tip (${px(outer)}) is off the strip's outer edge (${px(g.rZodiacInner - TICK_STRIP_OUTER)})`);
    }
    // Strip-sized where there is no room to grow: the minimap, and a bi-wheel (its
    // overlay discs sit right under the strip).
    const stripOnly = !c.input.detailed || c.input.hasOverlay === true;
    if (stripOnly && inner < g.rZodiacInner - TICK_STRIP_INNER - 1e-9) {
      fail(
        c.label,
        `rim diamond ${px(inner)}–${px(outer)} leaves the tick strip ` +
          `${px(g.rZodiacInner - TICK_STRIP_INNER)}–${px(g.rZodiacInner - TICK_STRIP_OUTER)}`,
      );
    }
    // Grown past the strip: never closer than PIP_CLEAR to the planet discs' outline.
    if (!stripOnly && inner < g.rZodiacInner - TICK_STRIP_INNER - 1e-9 && !g.detail.minorRing) {
      const discEdge = g.rPlanets + g.discHalf;
      if (inner < discEdge + PIP_CLEAR - 1e-9) {
        fail(c.label, `grown rim diamond (${px(inner)}) is within ${PIP_CLEAR}px of the planet discs (${px(discEdge)})`);
      }
    }
    // Clear of the natal chart's outermost ink below it: the coins when the ring is
    // drawn, the planet discs otherwise (on the minimap too — its discs sit well in).
    const natalOuter = g.detail.minorRing ? g.rMinor + g.minorDiscHalf : g.rPlanets + g.discHalf;
    if (!(inner > natalOuter)) {
      fail(c.label, `rim diamond (${px(inner)}) reaches down to the natal ring's ink (${px(natalOuter)})`);
    }
    if (c.input.hasOverlay && !(inner > g.rOverlay + g.overlayDiscR)) {
      fail(c.label, `rim diamond (${px(inner)}) reaches the overlay discs (${px(g.rOverlay + g.overlayDiscR)})`);
    }
  };
  const before = failures;
  const shipped = [
    ...cases,
    ...cases.map((c) => ({ label: `${c.label} (asked)`, input: { ...c.input, minorRing: true } })),
  ];
  for (const c of shipped) checkPip(c);
  console.log(
    `${failures > before ? 'FAIL' : 'ok  '}  §10d ${shipped.length} cases as drawn: every rim diamond's outer tip at the ` +
      `strip's outer edge, inside the strip on a bi-wheel and the minimap, clear of the discs below it and of the overlay ring`,
  );
  // It grows with the wheel as the glyphs do: never smaller on a larger single wheel,
  // clearly larger at the top of the range than at the bottom; strip-sized on a bi-wheel.
  const beforeGrow = failures;
  let prev = 0;
  let smallest = Infinity;
  let largest = 0;
  for (let size = 280; size <= 1100; size++) {
    for (const advanced of [false, true]) {
      const g = wheelGeometry({ size, detailed: true, advanced });
      if (!advanced) {
        if (g.pipR < prev - 1e-9) fail(`${size} single`, `rim diamond shrinks as the wheel grows (${px(prev)} → ${px(g.pipR)})`);
        prev = g.pipR;
      }
      smallest = Math.min(smallest, g.pipR);
      largest = Math.max(largest, g.pipR);
    }
    if (size >= 420) {
      const bi = wheelGeometry({ size, detailed: true, hasOverlay: true });
      if (Math.abs(bi.pipR - (TICK_STRIP_INNER - TICK_STRIP_OUTER) / 2) > 1e-9) {
        fail(`${size} bi-wheel`, `rim diamond is not strip-sized on a bi-wheel (${px(bi.pipR)})`);
      }
    }
  }
  if (!(largest >= 1.5 * smallest)) fail('single wheels', `rim diamond barely grows (${px(smallest)} → ${px(largest)})`);
  console.log(
    `${failures > beforeGrow ? 'FAIL' : 'ok  '}  §10d the rim diamond grows with a single wheel ` +
      `(${px(smallest)} → ${px(largest)} half-length, 280–1100px, never shrinking) and stays strip-sized on a bi-wheel`,
  );
  for (const [list, finding] of [[ringCases, false], [biRingCases, true]] as const) {
    const problems = ringSection(() => list.forEach(checkPip), finding);
    console.log(
      `${ringTag(problems, finding)}  §10d ${list.length} ${finding ? 'bi-wheel' : 'single-wheel'} cases with the ring ` +
        `laid out: every rim diamond inside the tick strip and clear of the coins below it${measuredLabel(finding)}`,
    );
  }
}

// §10e — §1–§7 over the ring-on cases, then §8's monotone ladder with the ring drawn.
{
  for (const [list, finding] of [[ringCases, false], [biRingCases, true]] as const) {
    const problems = ringSection(() => {
      for (const c of list) {
        const g = wheelGeometry(c.input);
        checkOrder(c.label, g, c.input);
        checkReadout(c.label, g);
        checkSignBand(c.label, g);
        checkCuspRim(c.label, g);
        checkBandCrowding(c.label, g);
        checkCuspRimAlways(c.label, g, c.input);
        checkHouseBand(c.label, g, c.input);
        checkHouseArc(c.label, g, c.input);
        checkHub(c.label, g, c.input);
      }
    }, finding);
    console.log(
      `${ringTag(problems, finding)}  §10e §1–§7 over the ${list.length} ring-on ` +
        `${finding ? 'bi-wheel' : 'single-wheel'} cases, ${problems} problem(s)${measuredLabel(finding)}`,
    );
  }
  for (const advanced of [false, true]) {
    for (const hasOverlay of [false, true]) {
      let regressions = 0;
      ringSection(() => {
        let prev: { size: number; g: WheelGeometry } | null = null;
        for (let size = hasOverlay ? 420 : 280; size <= 900; size += 2) {
          const g = wheelGeometry(withRing({ size, detailed: true, advanced, hasOverlay }));
          if (prev && rank(g) < rank(prev.g)) {
            regressions += 1;
            if (regressions === 1) {
              fail(
                `${advanced ? 'adv' : 'plain'}${hasOverlay ? ' bi-wheel' : ''} +catalog ring`,
                `detail DROPS from ${prev.size}px to ${size}px (rank ${rank(prev.g)} → ${rank(g)})`,
              );
            }
          }
          prev = { size, g };
        }
      }, hasOverlay);
      const label = `${advanced ? 'adv' : 'plain'}${hasOverlay ? ' bi-wheel' : ''} +ring`;
      console.log(
        `${ringTag(regressions, hasOverlay)}  §10e ${label.padEnd(16)} ${regressions} regression(s) across ` +
          `${hasOverlay ? 420 : 280}–900px, the gate included${measuredLabel(hasOverlay)}`,
      );
    }
  }
}

// §10f — an OVERLAY's catalog bodies on a bi-wheel (rOverlayPip, overlayPipR): marks at their
// true degree in the tick strip beside the chart's own rim diamonds (the module says why the
// strip and not the divider, with the measurement). Three kinds of check:
//   REQUIREMENT — at every pixel from 420 to 1100, on every rung the ladder reaches there
//        (overlay readout or not, Advanced or not, readouts forced or not), each mark clears
//        by PIP_CLEAR: the overlay discs' ink — their radius AND their outline, read off
//        WheelSvg's own drawing rather than restated — the natal discs, and both readout
//        fans; it keeps the strip's outer edge as the chart's diamonds do; and it is the
//        lesser mark (never longer than the chart's own rim diamond), yet not a speck.
//   INTERNAL-IDENTITY — asking for the marks moves nothing: every other figure is the one
//        a bi-wheel without them gets, field for field. Not asking — every Reports wheel —
//        and asking without an overlay publish none.
{
  // What WheelSvg draws an overlay disc as: its radius and its outline, both draws (the
  // interactive one and the static one). Read from the component, so a disc redrawn larger
  // there fails here instead of quietly overlapping the marks.
  //
  // Source-agnostic about the disc's COLOUR (2026-10-06): whatever props sit between the
  // class and the width — a `stroke={…}` attribute, as it was, or the `style={{ stroke: … }}`
  // the Custom theme moved it to — are skipped. Only the geometry is this check's business;
  // restating how the colour is spelled made it fail on a change that moved no pixel.
  const wheelSrc = readFileSync('src/components/Wheel/WheelSvg.tsx', 'utf8');
  const discDraws = [
    ...wheelSrc.matchAll(
      /r=\{(\d+(?:\.\d+)?)\}\s*className="planet-disc-fill"\s*(?:\w+=(?:\{\{[^}]*\}\}|\{[^}]*\}|"[^"]*")\s*)*?strokeWidth=\{(\d+(?:\.\d+)?)\}\s*strokeDasharray="2 1\.5"/g,
    ),
  ].map((m) => ({ r: Number(m[1]), stroke: Number(m[2]) }));
  const before = failures;
  if (discDraws.length !== 2 || discDraws.some((d) => d.r !== discDraws[0].r || d.stroke !== discDraws[0].stroke)) {
    fail('WheelSvg', `expected the overlay disc drawn twice, alike; found ${JSON.stringify(discDraws)}`);
  }
  const drawn = discDraws[0] ?? { r: NaN, stroke: NaN };
  const rungs = new Set<string>();
  // Where the mark sits against the band above it and the overlay ring below it, per
  // probe: one value each everywhere, or a rung could move it — the ladder only ever
  // rearranges what lies INSIDE the overlay ring, and this holds it to that.
  const offsets = new Set<string>();
  let probed = 0;
  let identical = 0;
  let tightest = { clear: Infinity, where: '' };
  for (let size = 420; size <= 1100; size++) {
    for (const advanced of [false, true]) {
      for (const readouts of [false, true]) {
        const input: WheelGeometryInput = { size, detailed: true, advanced, readouts, hasOverlay: true };
        const label = `${size}${advanced ? ' adv' : ''}${readouts ? ' forced' : ''} bi-wheel +overlay catalog`;
        const plain = wheelGeometry(input);
        const g = wheelGeometry({ ...input, overlayMinor: true });
        probed += 1;
        // Identity: nothing but the two published figures differs.
        const rest = (x: WheelGeometry) => {
          const { rOverlayPip: _a, overlayPipR: _b, ...others } = x;
          void _a;
          void _b;
          return JSON.stringify(others);
        };
        if (rest(g) !== rest(plain)) fail(label, 'asking for the overlay marks moved another figure');
        else identical += 1;
        if (plain.rOverlayPip !== 0 || plain.overlayPipR !== 0) {
          fail(label, `published overlay marks without being asked (${px(plain.rOverlayPip)}, ${px(plain.overlayPipR)})`);
        }
        rungs.add(`${g.detail.overlayReadout ? 'overlay readout' : 'plain'}/${g.detail.readout ? (g.detail.readoutMin ? 'trio' : g.detail.readoutSign ? 'deg+sign' : 'deg') : 'no readout'}`);
        offsets.add(`${(g.rZodiacInner - g.rOverlayPip).toFixed(9)}|${(g.rOverlayPip - g.rOverlay).toFixed(9)}|${g.overlayPipR.toFixed(9)}`);
        // Requirement: where the marks sit, and what they clear.
        const inner = g.rOverlayPip - g.overlayPipR;
        const outer = g.rOverlayPip + g.overlayPipR;
        if (!(g.overlayPipR >= 2.5)) fail(label, `overlay mark too small to read (half-length ${px(g.overlayPipR)})`);
        if (!(g.overlayPipR <= g.pipR + 1e-9)) fail(label, `overlay mark (${px(g.overlayPipR)}) larger than the chart's rim diamond (${px(g.pipR)})`);
        if (Math.abs(outer - (g.rZodiacInner - TICK_STRIP_OUTER)) > 1e-9) {
          fail(label, `overlay mark's outer tip (${px(outer)}) is off the strip's outer edge (${px(g.rZodiacInner - TICK_STRIP_OUTER)})`);
        }
        const clears: Array<[string, number]> = [
          ['the overlay discs', inner - (g.rOverlay + drawn.r + drawn.stroke / 2)],
          ['the natal discs', inner - (g.rPlanets + g.discHalf)],
          ...(g.detail.overlayReadout
            ? [['the overlay readout', inner - (g.rOverlayReadout + g.overlayFan + g.readoutFont / 2)] as [string, number]]
            : []),
          ...(g.detail.readout
            ? [['the natal readout', inner - (g.rReadoutDeg + g.readoutFont / 2)] as [string, number]]
            : []),
        ];
        for (const [what, clear] of clears) {
          if (clear < tightest.clear) tightest = { clear, where: `${label}, ${what}` };
          if (!(clear >= PIP_CLEAR - 1e-9)) fail(label, `overlay mark (${px(inner)}–${px(outer)}) only ${px(clear)}px clear of ${what}`);
        }
      }
    }
  }
  // Not asking for them on a single wheel publishes none either.
  for (const size of [280, 600, 1100]) {
    const g = wheelGeometry({ size, detailed: true, overlayMinor: true });
    if (g.rOverlayPip !== 0 || g.overlayPipR !== 0) fail(`${size} single +overlay catalog`, 'published overlay marks with no overlay ring');
  }
  console.log(
    `${failures > before ? 'FAIL' : 'ok  '}  §10f ${probed} bi-wheels, 420–1100px, ${rungs.size} rungs ` +
      `(${[...rungs].sort().join('; ')}): every overlay catalog mark ≥${PIP_CLEAR}px clear of the overlay discs ` +
      `(r ${drawn.r} + outline ${drawn.stroke}, as WheelSvg draws them), the natal discs and both readout fans, ` +
      `tightest ${px(tightest.clear)}px (${tightest.where}); and asking for them moved nothing in ${identical} of ${probed}`,
  );
  if (!(probed > 0 && rungs.size >= 2 && identical === probed)) {
    fail('§10f', `vacuous: ${probed} probes, ${rungs.size} rungs, ${identical} identical`);
  }
  if (offsets.size !== 1) {
    fail('§10f', `the overlay mark moves against the band and the overlay ring with the size or rung: ${[...offsets].slice(0, 4).join(', ')}`);
  }
  const [underBand, overRing, half] = ([...offsets][0] ?? 'NaN|NaN|NaN').split('|').map(Number);
  console.log(
    `${offsets.size === 1 ? 'ok  ' : 'FAIL'}  §10f one place on every bi-wheel: centred ${px(underBand)}px inside the zodiac ` +
      `band, ${px(overRing)}px outside the overlay ring's centre line, half-length ${px(half)}px — no size or rung moves ` +
      `it, so the clearances above hold on rungs the 420–1100px sweep never reaches`,
  );

}

if (measuredProblems) {
  console.log(
    `\n${measuredProblems} problem(s) measured in a catalog ring the app does not draw (the \`meas\` lines ` +
      `above) — reported, not failed: ` +
      (MINOR_RING_ENABLED
        ? 'the bi-wheel is never granted the ring, and this is why'
        : 'MINOR_RING_ENABLED is off'),
  );
}

console.log(failures ? `\n${failures} FAILING CHECK(S)` : '\nall checks pass');
process.exit(failures ? 1 : 0);
