// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import type { PlanetName } from '../../lib/ephemeris';
import { PLANET_GLYPHS } from '../../lib/astro/glyphChars';

// Astrological planet glyph drawn from the bundled 'Noto Sans Symbols' font (via
// the `.astro-glyph` class). Two render modes, matching the call sites:
//   • DOM mode (no x/y): an inline <span> sized by `size` (font-size px); color
//     inherits from the parent unless `color` is given.
//   • SVG mode (x/y given): an SVG <text> centered on (x, y), for use inside the
//     chart wheel; `color` (default currentColor) sets the fill.
//
// A given `color` is written as a STYLE in both modes, never as the SVG `fill=`
// attribute (2026-10-06). Callers now pass a body's ink as `var(--planet-<slug>, <hex>)`
// (lib/themePalette planetInk), so a Custom theme can recolour the wheel from CSS alone,
// and var() is not reliable inside a presentation attribute. The move is safe for the
// built-in themes because no stylesheet sets `fill` on a planet glyph — the attribute was
// never being overridden, so the inline style (which would outrank such a rule) paints
// exactly what it did. The export bakes computed styles (lib/wheelRaster), so it follows.
// SVG’s dominant-baseline="central" centres the FONT’s em box, not the mark drawn
// inside it — so a symbol whose ink is not centred in its own em box comes out
// off-centre by exactly that much, and inside the wheel's planet discs it shows.
// Every glyph is lifted by this fraction of its size to correct for it.
//
// Measured, two ways that agree to 0.003: canvas TextMetrics (ink
// actualBoundingBox* against the fontBoundingBox* that `central` centres) and
// pixels off a Chrome screenshot of this very markup. Across the nineteen glyphs
// the ink sits between 0.045 and 0.155 of the size below the em-box centre, and
// 0.10 is the middle of that — within 0.005 for most of them.
//
// Exported so any other symbol drawn in a wheel disc (the catalog minor bodies'
// coins, MinorMarkSvg) is lifted by this figure rather than a restatement of it.
export const GLYPH_LIFT = 0.1;

// The exceptions, and only where the eye can see them. ⊗ is a CIRCLE INSIDE A
// CIRCLE once it is drawn in a disc, and nothing shows a few pixels of offset like
// two circles that should be concentric — it read as sitting low, and it was, by
// 0.045 of its size after the flat lift. The reason is in glyphChars: this one
// character is bundled from a different Noto face (Math, not Symbols), where a
// mathematical operator is centred on the math axis rather than on the optical
// centre the symbol faces use.
//
// ♂ is further out still (0.055 low) and ♄ as far the other way (0.058 high), and
// neither is listed: an arrow and a scythe have no axis of symmetry for the eye to
// measure against, so the offset that is glaring on ⊗ is invisible on them.
// Centring by ink box is an approximation of optical centring, and it is only worth
// applying where the two agree.
const GLYPH_LIFT_BY_PLANET: Partial<Record<PlanetName, number>> = {
  Fortune: 0.145,
};

interface PlanetGlyphProps {
  planet: PlanetName;
  size?: number;
  className?: string;
  x?: number;
  y?: number;
  color?: string;
}

export function PlanetGlyph({
  planet,
  size = 16,
  className,
  x,
  y,
  color,
}: PlanetGlyphProps) {
  const char = PLANET_GLYPHS[planet];
  const cls = className ? `astro-glyph ${className}` : 'astro-glyph';

  if (x !== undefined && y !== undefined) {
    // Lifted to sit optically centred in the wheel's planet discs — see GLYPH_LIFT.
    return (
      <text
        x={x}
        y={y - size * (GLYPH_LIFT_BY_PLANET[planet] ?? GLYPH_LIFT)}
        className={cls}
        fontSize={size}
        fill={color ? undefined : 'currentColor'}
        style={color ? { fill: color } : undefined}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {char}
      </text>
    );
  }

  return (
    <span className={cls} style={{ fontSize: size, ...(color ? { color } : null) }}>
      {char}
    </span>
  );
}
