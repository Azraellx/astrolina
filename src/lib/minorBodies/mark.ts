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
// PURE: no DOM, no canvas, no React — the canvas and the SVG both take their points
// from the one function below.

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

/** The same four corners as a closed SVG path. */
export function minorDiamondPath(
  cx: number,
  cy: number,
  half: number,
  ux?: number,
  uy?: number,
): string {
  const [a, b, c, d] = minorDiamondPoints(cx, cy, half, ux, uy);
  const f = (p: [number, number]) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
  return `M ${f(a)} L ${f(b)} L ${f(c)} L ${f(d)} Z`;
}
