// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The shape every glyph-less catalog body shares: a solid diamond, a little taller
// than it is wide. It is drawn in three places — baked into the map coin
// (glyphImages.rasterizeMinorCoin), inside the chart wheel's coin (while that ring is
// switched on: see wheelGeometry MINOR_RING_ENABLED), and as the rim mark at a body's
// true degree on every wheel — and its proportions live HERE so the three cannot drift
// into three slightly different diamonds.
//
// A path rather than the U+25C6 text character: that code point is also the Mutable
// modality glyph (glyphChars), a path needs no font metrics to centre, and the wheel
// export keeps a path's fill where it re-stamps every glyph separately.
//
// A HYPOTHETICAL point (hypothetical.ts) has no glyph and draws the same diamond with
// its centre left empty — the hollow ◇ beside the real bodies' filled ◆, the mark that
// tells a computed point from an observed body at a glance. Its proportions live here
// too (minorHollowPoints), for the same reason.
//
// PURE: no DOM, no canvas, no React — the canvas and the SVG both take their points
// from the functions below.

/** How far the diamond reaches from its centre along its long axis, as a share of the
 *  coin radius it sits in. */
export const MINOR_DIAMOND_IN_COIN = 0.42;
/** Its half-width as a share of that reach — narrower than tall, so it reads as a
 *  diamond rather than a square on its corner. */
export const MINOR_DIAMOND_ASPECT = 0.72;

/**
 * The diamond's four corners, centred on (cx, cy): the far tip of the long axis, then
 * round clockwise-on-screen through a side, the near tip and the other side — the
 * order the map coin has always traced them in.
 *
 * `half` is the reach along the long axis, in px. (ux, uy) is that axis as a unit
 * vector; the default points straight up the screen, which is how a coin draws it. A
 * rim mark passes the outward radial direction instead, so the diamond points at the
 * degree it marks the way a tick does.
 */
export function minorDiamondPoints(
  cx: number,
  cy: number,
  half: number,
  ux = 0,
  uy = -1,
): [number, number][] {
  const w = half * MINOR_DIAMOND_ASPECT;
  // The short axis, a quarter turn from the long one.
  const vx = -uy;
  const vy = ux;
  return [
    [cx + ux * half, cy + uy * half],
    [cx + vx * w, cy + vy * w],
    [cx - ux * half, cy - uy * half],
    [cx - vx * w, cy - vy * w],
  ];
}

const svgPoint = (p: [number, number]) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;

/** The same four corners as a closed SVG path. */
export function minorDiamondPath(
  cx: number,
  cy: number,
  half: number,
  ux?: number,
  uy?: number,
): string {
  const [a, b, c, d] = minorDiamondPoints(cx, cy, half, ux, uy);
  return `M ${svgPoint(a)} L ${svgPoint(b)} L ${svgPoint(c)} L ${svgPoint(d)} Z`;
}

/** The hollow diamond's wall, measured square across each edge, as a share of the
 *  reach — 0.28 puts it at the coin ring's own 1.5px on the map (the coin's diamond
 *  reaches 5.46px), and it scales with the diamond everywhere else. */
export const MINOR_HOLLOW_WALL = 0.28;

/**
 * The hollow diamond's two outlines, centred on (cx, cy): `outer` is the filled
 * diamond exactly — same four corners, same order — and `inner` is the hole, the same
 * diamond shrunk until the wall between them is MINOR_HOLLOW_WALL × `half` thick
 * square across every edge, and traced the OTHER way round, so a plain nonzero fill
 * of the two leaves it empty.
 *
 * A filled ring rather than a stroked outline, for three reasons. The footprint is
 * the solid diamond's to the pixel: a stroke straddles its path, so it either grows
 * past the solid mark (and a rim mark's outer tip out of the tick strip that
 * verify-wheel-bands §10d holds it to) or has to be inset by a mitre-dependent amount.
 * The Earth theme's halo on the wheel's rim marks is a CSS stroke under the fill
 * (WheelSvg.css): a stroked mark would have its colour replaced by that halo, where a
 * filled ring takes the halo exactly as the solid mark does. And the wheel export
 * (lib/wheelRaster) already carries a fill across.
 */
export function minorHollowPoints(
  cx: number,
  cy: number,
  half: number,
  ux = 0,
  uy = -1,
): { outer: [number, number][]; inner: [number, number][] } {
  // A rhombus shrunk about its centre keeps its shape, and every edge moves in by the
  // same distance: the centre-to-edge distance times the scale lost. That distance is
  // half · ASPECT / √(1 + ASPECT²).
  const edge = MINOR_DIAMOND_ASPECT / Math.hypot(1, MINOR_DIAMOND_ASPECT);
  const inner = minorDiamondPoints(cx, cy, half * Math.max(0, 1 - MINOR_HOLLOW_WALL / edge), ux, uy);
  return { outer: minorDiamondPoints(cx, cy, half, ux, uy), inner: inner.reverse() };
}

/** The hollow diamond as one closed SVG path: the outline, then the hole. */
export function minorHollowPath(
  cx: number,
  cy: number,
  half: number,
  ux?: number,
  uy?: number,
): string {
  const { outer, inner } = minorHollowPoints(cx, cy, half, ux, uy);
  const ring = (p: [number, number][]) => `M ${p.map(svgPoint).join(' L ')} Z`;
  return `${ring(outer)} ${ring(inner)}`;
}
