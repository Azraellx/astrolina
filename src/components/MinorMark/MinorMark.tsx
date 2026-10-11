// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { GLYPH_LIFT } from '../PlanetGlyph/PlanetGlyph';
import { SVG_NO_TRANSLATE } from '../ui/glyphify';
import { MINOR_DIAMOND_IN_COIN, minorDiamondPath, minorHollowPath } from '../../lib/minorBodies/mark';
import './MinorMark.css';

// A catalog minor body's mark: its own astrological symbol where one is encoded
// (MINOR_GLYPHS — Eris, Sedna, Pholus, …), otherwise the diamond every other catalog
// body shares — always in the body's map-line colour, so a mark and its lines read as
// the same thing wherever the reader meets them. A hypothetical point has no symbol and
// draws the diamond HOLLOW (`hollow`): same colour, same size, empty centre — what tells
// a point computed from orbital elements from an observed body wherever the two meet.
//
// Two forms, as PlanetGlyph has:
//   • MinorMark — HTML, for rows and tips: the Minor bodies window, the chart wheel's
//     hover tip, the positions table, the Capture list. The diamond is a CSS shape
//     sized in em, so it follows the font size of whatever row it sits in.
//   • MinorMarkSvg — SVG, inside a chart-wheel coin (the ring a single wheel draws from
//     600px: wheelGeometry MINOR_RING_MIN). The symbol is a
//     <text class="astro-glyph">, which is what lets the wheel export strip it and
//     re-stamp it in the page's own font (lib/wheelRaster); the diamond is a <path> in
//     the proportions the map coin is baked with (lib/minorBodies/mark), so the coin on
//     the map and the coin in the chart carry the same shape.

interface MinorMarkBase {
  /** The body's map-line colour in the current theme. */
  color: string;
  /** Its own symbol, where one is encoded; absent draws the shared diamond. */
  glyph?: string;
  /** A hypothetical point (WheelMinorBody.hypothetical): the diamond drawn hollow. A
   *  symbol, where there is one, wins — no point has one. */
  hollow?: boolean;
}

/** The HTML mark. `size` (px) sets the font size it draws at; omitted, it inherits the
 *  row's. `className` is the surface's own glyph class (its column width, say). */
export function MinorMark({
  color,
  glyph,
  hollow = false,
  size,
  className,
}: MinorMarkBase & { size?: number; className?: string }) {
  if (glyph) {
    return (
      <span
        className={className ? `astro-glyph ${className}` : 'astro-glyph'}
        style={size === undefined ? { color } : { color, fontSize: size }}
        aria-hidden="true"
        // A symbol, kept out of a page translator as every glyph is (ui/glyphify's
        // SVG_NO_TRANSLATE says why). (2026-10-09)
        translate="no"
      >
        {glyph}
      </span>
    );
  }
  const cls = `minor-mark-diamond${hollow ? ' is-hollow' : ''}`;
  return (
    <span
      className={className ? `${className} ${cls}` : cls}
      style={size === undefined ? undefined : { fontSize: size }}
      aria-hidden="true"
    >
      <span style={hollow ? { borderColor: color } : { background: color }} />
    </span>
  );
}

/**
 * The SVG mark, centred on (x, y) inside a coin of radius `r`.
 *
 * The symbol is lifted by the planets' own flat figure (GLYPH_LIFT), for the reason
 * given there: `central` centres the font's em box, not the ink. The catalog symbols
 * have not been measured one by one the way ⊗ was, so none of them has an exception;
 * one belongs beside GLYPH_LIFT_BY_PLANET only once a screenshot shows a symbol sitting
 * visibly off-centre in its coin.
 */
export function MinorMarkSvg({
  color,
  glyph,
  hollow = false,
  x,
  y,
  r,
  glyphPx,
}: MinorMarkBase & { x: number; y: number; r: number; glyphPx: number }) {
  if (glyph) {
    return (
      <text
        x={x}
        y={y - glyphPx * GLYPH_LIFT}
        className="astro-glyph"
        fontSize={glyphPx}
        fill={color}
        textAnchor="middle"
        dominantBaseline="central"
        {...SVG_NO_TRANSLATE}
      >
        {glyph}
      </text>
    );
  }
  const half = r * MINOR_DIAMOND_IN_COIN;
  return <path d={hollow ? minorHollowPath(x, y, half) : minorDiamondPath(x, y, half)} fill={color} />;
}
