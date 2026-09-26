// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// How a chart wheel spends its radius.
//
// Pulled out of WheelSvg, which derived every ring by subtracting fixed pixel
// constants from size/2. Those constants were cut for a ~700px desktop wheel, and
// on a phone their sum exceeds the whole radius — so the bands nearest the centre
// absorbed the shortfall and the wheel quietly fell apart from the inside out:
//
//   382px, Advanced on   aspect hub 12px (6.3% of the radius), and 12.6px of arc
//                        per house number
//   340px, Advanced on   the house band down to a 3px hairline
//   280px, Advanced off  houseBand reaches 0, so the house ring, the cusp lines
//                        and all twelve house numbers vanish with nothing said
//
// None of that was decided. It fell out of the arithmetic, which is the reason
// this is a module with a test rather than a block of subtractions: the bands are
// SHARES of the radius with pixel floors and caps, and when they still do not fit,
// detail is shed in a DECLARED order until the centre gets its due. A wheel that
// has to drop something now drops what was chosen in advance, and reports which.
//
// Everything here is pure arithmetic on a pixel size — no React, no DOM, no
// ephemeris — so the renderer and scripts/verify-wheel-bands.ts call THIS function
// rather than each keeping its own copy of the figures. That is the point:
// verify-wheel-layout.ts used to restate the radii by hand, with `advanced` pinned
// false and the readout tier pinned to 440px, which is exactly why it never saw a
// single one of the failures above.

/** The size at which the readout is offered without being asked for. Unchanged in
 *  spirit from the old READOUT_MIN (440), but lowered and demoted to an OFFER:
 *  whether the trio is actually drawn — and how much of it — is the hub check's
 *  answer below, not this constant's.
 *
 *  330 rather than a phone's ~380: the offer is only the start of the ladder, so a
 *  wheel that cannot afford the whole trio drops to degree·sign and then to degree
 *  alone instead of falling off a cliff at one threshold. It has to sit below the
 *  smallest phone we care about — an iPhone SE gives the wheel ~367px — because a
 *  threshold ABOVE that is exactly the bug this replaces, in the other direction. */
export const READOUT_OFFER_MIN = 330;
/** The bi-wheel's own readout ring needs a larger wheel still. */
export const OVERLAY_READOUT_MIN = 600;

/** The catalog minor bodies' own RING is switched OFF, pending a tuning pass. With it
 *  off, every wheel at every size draws what a wheel below the gates draws: each
 *  catalog body as a rim diamond at its true degree, which costs no radius, and the
 *  built-in planets laid out exactly as they are with no catalog bodies on the wheel.
 *
 *  Off because the ring's cost to the built-ins was measured and is far outside its
 *  budget. The ring is radius taken from the planets, and the budget was +0.2
 *  percentage points of charts with a built-in pushed past a whole sign. Measured at the
 *  gates below: +2.62 pp at 500px on a single wheel (2.76% → 5.38%) and still +0.42–0.64
 *  at 600–800px; up to +5.12 pp on a 700px bi-wheel; within budget only at ~900px. It
 *  also sheds the second chart's readout ring on a 608–671px bi-wheel (the hub check
 *  fails a rung earlier), and with twenty coins in one quadrant it draws coins across
 *  the ASC or MC on up to 23% of charts.
 *
 *  Those figures are the snapshot the decision was made on (2026-09-26). The live ones
 *  come from scripts/verify-wheel-layout.ts (the sections labelled "measured — ring
 *  disabled") and verify-wheel-bands.ts §10, which still lay the ring out through
 *  `measureMinorRing` and print them on every run — the tuning pass's baseline.
 *  Switching this back on turns those sections into assertions
 *  again, on the budgets already written there, so the ring can only return once they
 *  pass — and verify-wheel-bands pins this switch as well, so it moves in two places.
 *
 *  The ring's code is kept whole behind this switch: the geometry below, the layout in
 *  lib/wheelRingLayout.ts, and WheelSvg's coins and leaders. */
export const MINOR_RING_ENABLED: boolean = false;

/** The size at which catalog minor bodies get a RING of their own — when
 *  MINOR_RING_ENABLED is on, which it is not (see there). The ring is a thin band of
 *  coins just inside the zodiac band, with the planet ring stepped inward to make room.
 *  Below it they are drawn as rim diamonds at their true degree, which cost no radius
 *  at all.
 *
 *  A gate rather than a ring at every size, because the ring is radius taken from the
 *  planets, and a planet ring pushed inward has less circumference to seat the same
 *  bodies on. On a phone that is the difference between a stellium fanning within its
 *  sign and a built-in planet drawn in the next one: the catalog bodies would be buying
 *  their room with the built-ins' positions. Below the gate the built-ins lay out
 *  exactly as they do with no catalog bodies on the wheel.
 *
 *  Nothing is hidden by it. Every body is drawn at its true degree on both sides, so
 *  crossing the gate changes HOW the catalog bodies are drawn, not whether — a declared
 *  tier, like the bi-wheel's own 420px one, and nothing to announce.
 *
 *  These two figures are provisional, and the measurement did NOT confirm them: at these
 *  sizes the ring costs the built-ins far more than its budget, which is why it is off.
 *  They stay as the sizes the suites measure the switched-off ring at, so the tuning
 *  pass compares like with like. */
export const MINOR_RING_MIN = 500;
/** The same gate on a bi-wheel, where the overlay ring has already taken its share of
 *  the radius. */
export const MINOR_RING_MIN_BI = 560;

// The strip just inside the zodiac band where every body's true-degree tick is drawn
// (WheelSvg: rZodiacInner − 2 to − 8) and Advanced's degree graduations hang (up to 8px
// deep). A catalog body's rim diamond IS its tick, so it lives in the same strip — clear
// of the band above it and, on a bi-wheel, of the overlay discs, whose outer edge sits
// at rZodiacInner − 9.
const TICK_ZONE_OUTER = 1;
const TICK_ZONE_INNER = 8;
// A rim diamond grows with the wheel the way the planets' glyphs do, sized off the disc,
// keeping its outer tip at the strip's outer edge and reaching inward past the strip as
// far as the room above the planet discs allows, stopping this far short of their
// outline. At the largest single wheel that is about 12px tall against the strip's 7.
const PIP_SHARE = 0.36;
const PIP_CLEAR = 2;

// The share of the radius the aspect hub must KEEP. A floor, not a target: the bands
// take what they need first and the hub gets the remainder, so on most wheels it
// lands well above this. It exists to stop the centre being squeezed to nothing,
// which is what the old cascade did — all the way down to 12px on a phone.
//
// 0.16, not the 0.30 this started at. The aspect figure needs a circle it can be read
// on, and past that the middle is simply empty: a hub at 0.30 was holding radius that
// the per-body coordinates needed more, and the coordinates were the thing actually
// running together. The bands below were widened into what that gave back — the hub
// roughly halves on a phone, and the degree · sign · minute trio gets the space.
export const HUB_TARGET_SHARE = 0.14;

/** What the caller knows; everything else is derived from `size`. */
export interface WheelGeometryInput {
  /** Rendered diameter in px. SVG user units are 1:1 with px on this wheel. */
  size: number;
  /** The full chart (zodiac band, houses, aspects) rather than the minimap. */
  detailed: boolean;
  /** Advanced mode: the degree graduations and the cusp-degree rim. */
  advanced?: boolean;
  /** A second chart is drawn in an outer ring (bi-wheel). */
  hasOverlay?: boolean;
  /** Planets on the zodiac only — no houses, cusps or angle marks. */
  planetsOnly?: boolean;
  /** Opt in to the readout below the size at which it would appear on its own
   *  (the Capture wheel). The geometry still governs: if it does not fit it is
   *  shed exactly as it would be otherwise. */
  readouts?: boolean;
  /** Catalog minor bodies are on this wheel, or on their way (a file still loading
   *  holds the ring, so the planets do not step inward a moment after the first
   *  paint). A REQUEST: the ring is taken only while MINOR_RING_ENABLED is on — it is
   *  OFF, so today this is never granted — and then only at or above MINOR_RING_MIN
   *  (MINOR_RING_MIN_BI on a bi-wheel) and never on the minimap. `detail.minorRing`
   *  says whether it was. Not granted gives exactly the geometry of a wheel with no
   *  catalog bodies. */
  minorRing?: boolean;
  /** MEASUREMENT ONLY — the app never sets this. Grants `minorRing` as if
   *  MINOR_RING_ENABLED were on (the size gates and the minimap exclusion still apply),
   *  so the verify suites can keep laying out the switched-off ring and printing what
   *  it would cost. Nothing outside scripts/ should pass it. */
  measureMinorRing?: boolean;
}

/** Which optional detail survived the fit. Reported so a caller — or a test — can
 *  see what the wheel gave up rather than inferring it from a radius. */
export interface WheelDetail {
  /** Advanced's ring of cusp degrees OUTSIDE the rim. Never shed — see the
   *  shed ladder for why the one house system that makes it redundant does not
   *  get to decide for the other nine. */
  cuspRim: boolean;
  /** The per-body degree · sign · minute readout at all. */
  readout: boolean;
  /** The sign glyph within the readout. */
  readoutSign: boolean;
  /** The minutes within the readout. Shed before the sign. */
  readoutMin: boolean;
  /** The bi-wheel's own readout ring. */
  overlayReadout: boolean;
  /** The catalog minor bodies' own ring. Always false while MINOR_RING_ENABLED is off.
   *  Not a rung of the shed ladder: the switch and size alone decide it
   *  (MINOR_RING_MIN), and when it is off the bodies are still drawn — as rim diamonds
   *  at their true degree. */
  minorRing: boolean;
}

export interface WheelGeometry {
  size: number;
  cx: number;
  cy: number;
  /** Half the size — what every share below is a share OF. */
  R: number;

  // ── Rings, outermost first ────────────────────────────────────────────────
  rOuter: number;
  rZodiacInner: number;
  /** Centre of the catalog minor bodies' rim diamonds: their outer tip at the tick
   *  strip's outer edge just inside the zodiac band (the rim, on the minimap), so the
   *  centre moves in as the diamond grows. Drawn on every wheel, ring or not. */
  rPip: number;
  /** Centre of the catalog minor-body coins, between the zodiac band (the overlay
   *  ring, on a bi-wheel) and the planets. 0 when the ring is not drawn. */
  rMinor: number;
  /** Centre of the planet glyph discs. */
  rPlanets: number;
  /** The three readout slots. Degree is OUTERMOST (nearest the glyph), then the
   *  sign, then the minutes — the printed-chart order. When a slot is shed its
   *  radius collapses onto the one outside it, so a draw site can read all three
   *  unconditionally and gate on `detail`. */
  rReadoutDeg: number;
  rReadoutSign: number;
  rReadoutMin: number;
  houseRingOuter: number;
  houseRingInner: number;
  houseBand: number;
  /** Where the aspect chords are strung. The band this module exists to protect. */
  rAspectRing: number;
  /** The innermost drawn circle. Same radius as rAspectRing, kept under its own
   *  name because it is a different thing — a ring you can see, not a chord
   *  endpoint — and the two could reasonably diverge later. */
  rInner: number;

  // ── Bi-wheel ──────────────────────────────────────────────────────────────
  rOverlay: number;
  rOverlayReadout: number;
  rOverlayDivider: number;
  overlayFan: number;
  overlayDiscR: number;

  // ── Ink ───────────────────────────────────────────────────────────────────
  discR: number;
  discStroke: number;
  /** Disc radius plus half its stroke: the half-width a body claims on the ring,
   *  which is what ringLayout separates marks by. */
  discHalf: number;
  glyphPx: number;
  /** A catalog minor body's coin: 0.64 of the planet disc, so it reads as a lesser
   *  body beside the planets rather than as one of them. 0 on the minimap, as are the
   *  three coin figures below it: the minimap draws catalog bodies as rim diamonds only.
   *  Non-zero on every detailed wheel whether or not the ring is drawn — to ask whether it
   *  is, test `detail.minorRing` (or `rMinor > 0`). */
  minorR: number;
  /** The coin's outline — solid; a dashed outline is the overlay ring's convention. */
  minorDiscStroke: number;
  /** Coin radius plus half its outline: what a coin claims on its ring. */
  minorDiscHalf: number;
  /** A catalog body's own glyph, inside its coin. */
  minorGlyphPx: number;
  /** How far a rim diamond reaches either side of rPip along the radius. It grows with
   *  the wheel on a single wheel (PIP_SHARE of the disc, as far as the room above the
   *  planet discs allows) and keeps half the tick strip on a bi-wheel and the minimap. */
  pipR: number;
  signGlyphPx: number;
  houseNumPx: number;
  cuspRimPx: number;
  /** The sign glyph inside a cusp unit. Scales with the BAND, not with the numbers
   *  beside it — the band grows with the wheel and the glyph should take that room. */
  cuspSignPx: number;
  /** Centre of a cusp unit out to its degree (and its minutes, the other way). */
  cuspUnitStepPx: number;
  /** Half the whole unit. What one cusp has to be given on the band, and what the
   *  band suite reserves — published rather than restated in two places. */
  cuspUnitHalfPx: number;
  readoutFont: number;
  readoutFan: number;
  angleCodePx: number;
  angleCodeHalo: number;

  // ── Layout inputs ─────────────────────────────────────────────────────────
  /** Minimum separation (degrees) handed to placeOnRing for the natal ring. */
  ringSep: number;
  /** How much of their combined width two bodies may share. Passed straight to
   *  placeOnRing, and already folded into ringSep above, so both rings tolerate
   *  the same amount and one constant governs the whole layout. */
  bodyOverlap: number;
  /** The radius the overlay ring's marks are separated at. */
  overlaySpreadRadius: number;
  overlayRingSep: number;

  detail: WheelDetail;
}

// Half-widths on the glyph ring, in pixels — what a mark actually occupies, and
// therefore what its neighbour has to clear.
//
// The angle codes are TEXT, and text is not square: "Ic" is barely half the width
// of "Avx". One separation figure for the whole ring can only be right for one of
// them, which is why the codes used to sit on top of the discs beside them — the
// figure was sized for a circular disc and the labels are wider than that. So each
// mark states its own half-width and every pair clears the sum of the two.
//
// This lives here, beside the font size it is measuring, rather than in the
// component: scripts/verify-wheel-layout.ts needs it too, and it used to keep its
// own copy of the table. A width model and the text it models drifting apart is a
// silent overlap, and a second copy in a test is a test that agrees with itself.
// Per-character advances (in em, at weight 700) for the nine characters the six
// codes are built from. Deliberately a table rather than one average figure: an
// average generous enough for "Mc" reserves half again too much for "Ic", and the
// wasted arc is arc some body is being pushed out of for no reason.
const ANGLE_LABEL_EM: Record<string, number> = {
  A: 0.72, D: 0.72, I: 0.34, M: 0.92, V: 0.68,
  c: 0.56, s: 0.52, v: 0.56, x: 0.56,
};
// .wheel-angle-label: 700 weight with a paint-order stroke halo (half of it each
// side, and the halo is part of what must not be overlapped — it is the panel
// colour, so it erases whatever it lands on).
//
// The font size is passed in rather than fixed at 13: the codes now scale with the
// wheel, and a width model pinned to one size would under-reserve arc on a large
// wheel and overlap the very discs it was written to keep clear of.
export const angleLabelHalfPx = (code: string, font: number, halo: number): number => {
  let em = 0;
  for (const ch of code) em += ANGLE_LABEL_EM[ch] ?? 0.6;
  return (em * font + halo) / 2;
};
import { BODY_OVERLAP_SHARE } from './ringLayout';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// A band's thickness: a share of the radius, floored so it stays usable on a small
// wheel and capped so it stops eating the middle of a large one. The floors are
// what make a 280px wheel legible; the caps are what stop a 900px wheel becoming a
// thick doughnut with nothing in it.
const bandPx = (R: number, share: number, floor: number, cap: number) =>
  clamp(share * R, floor, cap);

/** Arc in px each house number gets at the house band's mid-radius. Nothing is laid
 *  out with this — it exists so the band suite can assert LEGIBILITY rather than
 *  merely non-overlap, which is the distinction the old harness never drew. */
export const houseNumberArcPx = (g: WheelGeometry): number =>
  (2 * Math.PI * ((g.houseRingInner + g.houseRingOuter) / 2)) / 12;

/** One rung of the band stack. `wheelGeometry` walks these in order and takes the
 *  first that leaves the hub its share — so the shed order is data, not control
 *  flow, and a test can assert the order itself. */
interface Trial {
  cuspRim: boolean;
  /** The bi-wheel's own readout ring. Its own rung rather than a rider on the
   *  natal readout: it costs ~80px of radius, so tying the two together made a
   *  bi-wheel LOSE its natal readout on crossing 600px, where the overlay ring
   *  became affordable and pushed everything else inward. Growing a wheel must
   *  never take detail away. */
  overlayReadout: boolean;
  readout: boolean;
  readoutSign: boolean;
  readoutMin: boolean;
}

export function wheelGeometry(input: WheelGeometryInput): WheelGeometry {
  const { size, detailed } = input;
  const advanced = input.advanced ?? false;
  const hasOverlay = input.hasOverlay ?? false;
  const planetsOnly = input.planetsOnly ?? false;
  const wantReadouts = input.readouts ?? false;

  const R = size / 2;
  const cx = R;
  const cy = R;

  // ── Ink sizes ─────────────────────────────────────────────────────────────
  // These scale too. Under the old model a 280px wheel and a 900px wheel carried
  // identical 9px house numbers and 22px sign glyphs, which is why one felt cramped
  // and the other sparse. Floors are set at the smallest size that stays readable
  // on a phone rather than at the old value — 9px was under it.
  const discR = detailed ? bandPx(R, 0.038, 11, 17) : 13;
  const discStroke = 1.3;
  const glyphPx = detailed ? clamp(discR * 1.5, 15, 25) : 19.5;
  const houseNumPx = clamp(Math.round(0.034 * R), 10, 15);
  const cuspRimPx = clamp(Math.round(0.03 * R), 10, 14);
  // Capped lower on a bi-wheel for the reason the bands are (see `tight` below):
  // two charts share the radius, so the readout stops growing sooner.
  const readoutFont = clamp(Math.round(0.037 * R), 11, hasOverlay ? 13 : 17);
  const angleCodePx = clamp(Math.round(0.041 * R), 13, 18);
  const angleCodeHalo = 3;
  // A catalog body's rim diamond marks its TRUE degree the way a planet's tick does.
  // Its outer tip sits at the tick strip's outer edge on every wheel; how far it reaches
  // in depends on the room below (see PIP_SHARE). Strip-sized to start with — what the
  // minimap and a bi-wheel keep — and grown below, once the band budget is known.
  const pipStrip = (TICK_ZONE_INNER - TICK_ZONE_OUTER) / 2;
  const pipMini = clamp(0.28 * discR, 3, pipStrip);
  /** The rim diamonds' centre, for a diamond of half-length `r`: its outer tip at the
   *  tick strip's outer edge under `rZodiacInner`. */
  const pipAt = (rZodiacInner: number, r: number) => rZodiacInner - TICK_ZONE_OUTER - r;

  // ── The minimap keeps its own figures ─────────────────────────────────────
  // It draws no zodiac band, houses or readout, so none of the budget below
  // applies. Reproducing its four numbers here rather than leaving them in the
  // component keeps every wheel in the app answering one function.
  //
  // Catalog bodies are rim diamonds here at every size — it runs no layout pass to
  // seat coins with — so of their figures it carries only the diamond's.
  if (!detailed) {
    const rOuter = R - 4;
    const rPlanets = rOuter - 26;
    const rInner = rPlanets - 22;
    return {
      size, cx, cy, R,
      rOuter,
      rZodiacInner: rOuter,
      rPip: pipAt(rOuter, pipMini),
      rMinor: 0,
      rPlanets,
      rReadoutDeg: 0, rReadoutSign: 0, rReadoutMin: 0,
      houseRingOuter: 0, houseRingInner: 0, houseBand: 0,
      rAspectRing: rInner, rInner,
      rOverlay: 0, rOverlayReadout: 0, rOverlayDivider: 0, overlayFan: 0,
      overlayDiscR: 9,
      discR, discStroke, discHalf: discR + discStroke / 2,
      glyphPx,
      minorR: 0, minorDiscStroke: 0, minorDiscHalf: 0, minorGlyphPx: 0, pipR: pipMini,
      signGlyphPx: 22, houseNumPx, cuspRimPx,
      cuspSignPx: 0, cuspUnitStepPx: 0, cuspUnitHalfPx: 0, readoutFont,
      readoutFan: 0, angleCodePx, angleCodeHalo,
      ringSep: 0, overlaySpreadRadius: 0, overlayRingSep: 0, bodyOverlap: 0,
      detail: {
        cuspRim: false, readout: false, readoutSign: false,
        readoutMin: false, overlayReadout: false, minorRing: false,
      },
    };
  }

  // ── The band budget ───────────────────────────────────────────────────────
  // A bi-wheel carries two charts in one radius, so the bands that grow with the
  // wheel are capped tighter here: past a point, a readout that keeps growing is
  // simply the hub's radius spent on whitespace between three short numbers. This
  // is the same judgement the old model made when it disabled `bandGrow` for
  // overlays ("that layout is already tight"), reached for the same reason, and it
  // is what lets a large bi-wheel keep its overlay readout AND a usable centre.
  const tight = hasOverlay;
  const margin = bandPx(R, 0.022, 4, 6);
  const zodiacBand = bandPx(R, 0.14, 26, tight ? 38 : 52);
  // Floored at 10 rather than 8 so the Advanced degree ticks clear the planet discs.
  // They hang INWARD from rZodiacInner by up to 8px, into exactly this gap, and the
  // disc's outer edge sits at the far end of it.
  const gapZodiacGlyph = bandPx(R, 0.035, 10, 16);
  // The rim diamond grows into the gap between the tick strip and the planet discs —
  // on a single wheel. On a bi-wheel the overlay discs sit right under the strip
  // (their outer edge at rZodiacInner − 9), so it keeps the strip's size there. Never
  // smaller than the strip allows: on the smallest wheels the gap is 10px, and the
  // diamond keeps the size it always had.
  const pipRoom = hasOverlay
    ? pipStrip
    : Math.max(pipStrip, (gapZodiacGlyph - TICK_ZONE_OUTER - discStroke / 2 - PIP_CLEAR) / 2);
  const pipR = clamp(PIP_SHARE * discR, 3, pipRoom);
  // Kept tight, and deliberately NOT where the hub's radius went. Two reasons, and
  // the second is counter-intuitive enough to be worth writing down:
  //
  //   1. the trio has to read as part of the BODY, not as a row of numbers floating
  //      between two rings;
  //   2. every px the trio moves INWARD costs it tangential room. Circumference
  //      shrinks with radius, so the same "28°" needs a wider ANGLE the further in it
  //      sits — and `ringSep` below is sized on exactly that. Widening this band to
  //      "give the coordinates room" makes neighbouring bodies collide sooner, which
  //      is the opposite of the intent. An earlier cut of this budget widened the gap
  //      ABOVE the trio for exactly that reason and drove the floor into its 20° cap.
  //
  //      What happens THERE has changed, and the change is worth knowing before
  //      touching these figures. The floor used to be squeezable only as far as the
  //      glyphs were, so a wheel where it reached the cap had arcs that could not
  //      seat what fell into them at any pressure — they fell through to even
  //      spacing and every glyph in them lost its notch, which is what a 340px wheel
  //      did. placeOnRing gives the floor up FIRST and completely now (see
  //      MAX_PUSH_DEG), so a large floor costs crowded coordinates rather than a
  //      scrambled ring. It is still worth keeping small: what it buys back at t=0
  //      is every uncrowded chart looking uncrowded.
  const gapGlyphReadout = bandPx(R, 0.04, 9, tight ? 16 : 20);
  // The gap between the three slots' CENTRES, so it has to clear the height of the
  // text sitting in them — hence the floor at the font size plus daylight, not below
  // it. (The share alone worked out at 10.4px against an 11px font on a small wheel,
  // which verify-wheel-bands caught.) Raised from 0.055 so the three lines are not
  // nearly touching, but only as far as the tangential cost above allows.
  const readoutFan = bandPx(R, 0.085, readoutFont + 5, tight ? 22 : 34);
  // THIS is where the hub's radius went, along with the house band below: both sit
  // inside the readout, so widening them costs the trio nothing and buys the house
  // numbers a wider band to sit in.
  const gapReadoutHouse = bandPx(R, 0.045, 9, tight ? 15 : 22);
  const houseBandWidth = bandPx(R, 0.085, 18, 42);
  // Half the readout text's ink, so a slot's radius is its CENTRE and the gaps on
  // either side clear the glyph box rather than the baseline.
  const textHalf = readoutFont / 2;

  // ── The cusp unit: degree · sign glyph · minutes ──────────────────────────
  // The glyph takes its size from the BAND, the way the standalone rim glyphs do,
  // rather than from the small numbers it sits between: the band grows with the
  // wheel, and a glyph pinned to the text size leaves that room unused on a large
  // one. Floored so it never drops below the numbers beside it, capped short of the
  // standalone glyph so a unit still reads as one thing rather than a glyph with two
  // footnotes.
  const cuspSignPx = clamp(zodiacBand * 0.55, cuspRimPx + 3, 26);
  /** Half a degree or minute string ("23°"), at ~0.55em per character. */
  const cuspNumHalfPx = 0.825 * cuspRimPx;
  // Enough that the numbers clear the glyph between them, whichever way round the
  // unit is laid — the horizontal case is the wider of the two and so the one that
  // sets this.
  const cuspUnitStepPx = cuspSignPx * 0.45 + cuspNumHalfPx + clamp(0.01 * R, 2, 4);
  const cuspUnitHalfPx = cuspUnitStepPx + cuspNumHalfPx;

  // The bi-wheel's own offsets, cascading from rZodiacInner exactly as they did.
  // Left on their original figures rather than reproportioned: the overlay layout
  // is already tight, it is gated to wheels ≥420px so it never meets the sizes this
  // module exists to rescue, and re-cutting two rings at once is how a working
  // bi-wheel gets broken in order to fix a phone.
  const overlayDiscR = 9;
  const ovInset = 18;
  const ovReadoutGap = 40;
  const ovToNatalWithReadout = 41;
  const ovToNatalPlain = 32;
  const overlayFan = Math.round(18 * (readoutFont / 11));

  // ── The catalog ring ──────────────────────────────────────────────────────
  // SWITCHED OFF (MINOR_RING_ENABLED, and why, at the top of this module): in the app
  // this is false on every wheel, and everything below that reads it takes the
  // no-ring path. Only `measureMinorRing` — the suites' way to keep measuring it —
  // reaches the rest.
  //
  // With the switch on, size alone decides it, not the shed ladder: it is not detail a
  // crowded wheel can give up but WHERE a set of bodies is drawn, and below the gate
  // they are still drawn — as rim diamonds, which take no radius.
  const minorRingOn =
    (MINOR_RING_ENABLED || (input.measureMinorRing ?? false)) &&
    (input.minorRing ?? false) &&
    size >= (hasOverlay ? MINOR_RING_MIN_BI : MINOR_RING_MIN);
  const minorR = Math.round(0.64 * discR);
  const minorDiscStroke = 1;
  const minorGlyphPx = clamp(1.5 * minorR, 10, 16);
  // Daylight between a coin's inner edge and a planet disc's outer edge.
  const minorGap = Math.max(3, Math.round(0.012 * R));

  interface Solved {
    rOuter: number;
    rZodiacInner: number;
    rMinor: number;
    rPlanets: number;
    rReadoutDeg: number;
    rReadoutSign: number;
    rReadoutMin: number;
    houseRingOuter: number;
    houseBand: number;
    houseRingInner: number;
    rOverlay: number;
    rOverlayReadout: number;
  }

  // One pass of the stack, outward-in, for a given set of surviving detail.
  const layOut = (t: Trial): Solved => {
    // Nothing but the breathing margin sits outside the rim any more. The cusp
    // degrees used to be drawn beyond it and reserved a 20–22px band for the
    // privilege — 10.5% of the radius on a phone, spent on labels that read as page
    // furniture rather than as part of the chart. They are inside the zodiac band
    // now, where they cost nothing, and that radius went to the content instead.
    const rOuter = R - margin;
    const rZodiacInner = rOuter - zodiacBand;

    const rOverlay = hasOverlay ? rZodiacInner - ovInset : 0;
    const rOverlayReadout = t.overlayReadout ? rOverlay - ovReadoutGap : 0;
    const rPlanetsBase = hasOverlay
      ? t.overlayReadout
        ? rOverlayReadout - ovToNatalWithReadout
        : rOverlay - ovToNatalPlain
      : rZodiacInner - gapZodiacGlyph - discR;
    // With the catalog ring on, the coins take the planets' old slot — a coin's OUTER
    // edge lands exactly where the disc's did, so nothing outside it moves (the tick
    // strip, the overlay ring, the divider between the two charts) — and the planet
    // ring steps inward by a coin's width and a gap. Everything below hangs off
    // rPlanets and follows it in.
    const rMinor = minorRingOn ? rPlanetsBase + discR - minorR : 0;
    const rPlanets = minorRingOn ? rMinor - minorR - minorGap - discR : rPlanetsBase;

    // The glyph disc's INNER EDGE — everything below hangs off that, not off the
    // disc's centre. Hanging it off the centre is what let the old model park a
    // degree value 39px away from a glyph at every size, whatever the disc did.
    const discInner = rPlanets - discR;

    let rReadoutDeg = 0;
    let rReadoutSign = 0;
    let rReadoutMin = 0;
    let innermostReadout = discInner;
    if (t.readout) {
      rReadoutDeg = discInner - gapGlyphReadout - textHalf;
      rReadoutSign = t.readoutSign ? rReadoutDeg - readoutFan : rReadoutDeg;
      rReadoutMin = t.readoutMin ? rReadoutSign - readoutFan : rReadoutSign;
      innermostReadout = rReadoutMin - textHalf;
    }

    const houseRingOuter = innermostReadout - gapReadoutHouse;
    // The band takes its full width whenever the radius allows it, and the hub takes
    // what is left. It is never traded away to buy an outer ring: if the sum does not
    // fit, this trial fails its hub check and something further out sheds instead.
    // That is the whole difference from `min(24, max(0, houseRingOuter - 12))`, which
    // could and did reach zero.
    const houseBand = planetsOnly ? 0 : clamp(houseRingOuter, 0, houseBandWidth);
    const houseRingInner = houseRingOuter - houseBand;

    return {
      rOuter, rZodiacInner, rMinor, rPlanets,
      rReadoutDeg, rReadoutSign, rReadoutMin,
      houseRingOuter, houseBand, houseRingInner,
      rOverlay, rOverlayReadout,
    };
  };

  // ── The shed ladder ───────────────────────────────────────────────────────
  // Read top to bottom, each rung gives up one more: the bi-wheel's overlay readout
  // first, then the natal minutes, then the readout's sign glyph, then the readout
  // entirely.
  //
  // TWO things are not on this list and never shed.
  //
  // The house band, whose silent disappearance is the bug this module replaces.
  //
  // And the CUSP RIM. It was the first rung here, on the reasoning that a whole-sign
  // chart repeats `0°00'` twelve times so the labels are worth little. That is true
  // of whole sign and of nothing else: under Placidus, Koch, Regiomontanus, Campanus,
  // Porphyry, Alcabitius, Meridian or Morinus every one of the twelve is a different
  // value, and it is a value that appears nowhere else on the wheel. Dropping it on a
  // phone meant the small screen — the one where scrolling to the table below costs
  // most — was the screen that lost the house cusps. A band that is redundant in one
  // house system out of ten is not a band to shed by default.
  const rimAvailable = advanced && !planetsOnly;
  const readoutOffered = wantReadouts || size >= READOUT_OFFER_MIN;
  const overlayOffered = hasOverlay && size >= OVERLAY_READOUT_MIN;

  const ladder: Trial[] = [];
  const rung = (overlayReadout: boolean, readout: boolean, sign: boolean, min: boolean) =>
    ladder.push({
      cuspRim: rimAvailable,
      overlayReadout,
      readout,
      readoutSign: sign,
      readoutMin: min,
    });
  if (readoutOffered) {
    if (overlayOffered) rung(true, true, true, true);
    rung(false, true, true, true);
    rung(false, true, true, false);
    rung(false, true, false, false);
  } else if (overlayOffered) {
    // No natal readout on offer, but the overlay ring can still carry its own.
    rung(true, false, false, false);
  }
  rung(false, false, false, false);

  const hubFloor = HUB_TARGET_SHARE * R;
  let trial = ladder[ladder.length - 1];
  let solved = layOut(trial);
  for (const t of ladder) {
    const s = layOut(t);
    // Keep every attempt as the running answer, so if nothing clears the floor the
    // wheel ends on the LAST (least cluttered) rung — the right answer for a wheel
    // simply too small to give the hub its share.
    trial = t;
    solved = s;
    if (s.houseRingInner >= hubFloor) break;
  }
  const overlayReadout = trial.overlayReadout;

  // Midway between the overlay ring's innermost ink and the natal chart's outermost —
  // the coins' outer edge when the catalog ring is drawn, the planet discs' otherwise.
  // (On any one rung of the ladder that is the same radius either way, by construction
  // of rMinor above; it is stated against the coins so it stays right if that changes.)
  const natalOuterInk = minorRingOn ? solved.rMinor + minorR : solved.rPlanets + discR;
  const rOverlayDivider = hasOverlay
    ? ((overlayReadout ? solved.rOverlayReadout - overlayFan : solved.rOverlay - overlayDiscR) +
        natalOuterInk) /
      2
    : 0;

  // A floor every pair on the glyph ring clears on top of what their own widths ask
  // for. The readout fans inward from the glyph, and the same angle buys less arc
  // the further in it lands, so the floor is sized on the INNERMOST slot actually
  // drawn — and is zero when no readout is drawn at all, because reserving arc for a
  // ring that is not there flings bodies off their true degree for nothing.
  //
  // The width to clear is the widest readout string — three glyphs, "28°" or "04'",
  // which at tabular figures inks roughly 1.6em (~18px at an 11px font). 1.9em is the
  // RESERVATION, that ink plus a little daylight. It was a flat 16px, cut when the
  // font was 11px at every size: it under-reserved as soon as the font grew, and
  // even at 11px it gave "04'" less arc (16px) than the string is wide (~18px),
  // which is why a stellium's minutes ran together while its glyphs looked spaced.
  //
  // This is the COMFORTABLE figure, and it is the only figure stated here: what an
  // arc that cannot seat what fell into it does with it belongs to placeOnRing, not
  // to the budget. It gives this up FIRST, and all of it, before the glyph discs
  // give anything — crowding the coordinates costs a reader a moment, moving a glyph
  // off its notch costs them the position. So do not fold a tolerance in here: the
  // number to state is the one a chart with room actually gets.
  //
  // Worth knowing which of the two actually binds, because it is not the obvious
  // one: measured across every shipped size, THIS floor exceeds the disc
  // requirement. At 380px it asks 17.2° where the discs ask 12.0°, so it is the
  // coordinates, not the glyphs, that decide how far a stellium fans. Squeezing the
  // glyphs while holding this at its full figure would move nothing at all.
  const readoutInkPx = readoutFont * 1.9;
  const ringSep = trial.readout
    ? clamp((readoutInkPx * 360) / (2 * Math.PI * Math.max(solved.rReadoutMin, 1)), 4, 20)
    : 0;

  const overlaySpreadRadius = overlayReadout
    ? Math.max(solved.rOverlayReadout - overlayFan, 1)
    : solved.rOverlay;
  const overlayRingSep = overlayReadout
    ? clamp((readoutInkPx * 360) / (2 * Math.PI * Math.max(overlaySpreadRadius, 1)), 4, 20)
    : 0;

  return {
    size, cx, cy, R,
    rOuter: solved.rOuter,
    rZodiacInner: solved.rZodiacInner,
    rPip: pipAt(solved.rZodiacInner, pipR),
    rMinor: solved.rMinor,
    rPlanets: solved.rPlanets,
    rReadoutDeg: solved.rReadoutDeg,
    rReadoutSign: solved.rReadoutSign,
    rReadoutMin: solved.rReadoutMin,
    houseRingOuter: solved.houseRingOuter,
    houseRingInner: solved.houseRingInner,
    houseBand: solved.houseBand,
    rAspectRing: solved.houseRingInner,
    rInner: solved.houseRingInner,
    rOverlay: solved.rOverlay,
    rOverlayReadout: solved.rOverlayReadout,
    rOverlayDivider,
    overlayFan,
    overlayDiscR,
    discR, discStroke, discHalf: discR + discStroke / 2,
    glyphPx,
    minorR, minorDiscStroke, minorDiscHalf: minorR + minorDiscStroke / 2, minorGlyphPx, pipR,
    // The rim signs fill their band instead of sitting at a fixed 22px in a band
    // that runs 24px on a phone to 52px at the maximum.
    signGlyphPx: clamp(zodiacBand * 0.75, 16, 32),
    houseNumPx, cuspRimPx, cuspSignPx, cuspUnitStepPx, cuspUnitHalfPx,
    readoutFont, readoutFan,
    angleCodePx, angleCodeHalo,
    ringSep, overlaySpreadRadius, overlayRingSep,
    bodyOverlap: BODY_OVERLAP_SHARE,
    detail: {
      cuspRim: trial.cuspRim,
      readout: trial.readout,
      readoutSign: trial.readout && trial.readoutSign,
      readoutMin: trial.readout && trial.readoutMin,
      overlayReadout,
      minorRing: minorRingOn,
    },
  };
}
