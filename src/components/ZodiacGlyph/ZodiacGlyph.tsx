// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { SIGN_GLYPHS } from '../../lib/astro/glyphChars';
import { SVG_NO_TRANSLATE } from '../ui/glyphify';

// Zodiac sign glyph drawn from the bundled 'Noto Sans Symbols' font (via the
// `.astro-glyph` class). Same two render modes as PlanetGlyph: an inline <span>
// in the DOM, or a centered SVG <text> when x/y are supplied (chart wheel).
// `sign` is 0 (Aries) … 11 (Pisces).
//
// A given `color` goes in a STYLE in SVG mode too, not the `fill=` attribute, for
// PlanetGlyph's reason (2026-10-06): the wheel passes a var() expression — the sign ink
// `var(--wheel-sign-<element>, var(--wheel-sign, currentColor))` — and var() is not reliable
// in a presentation attribute. No stylesheet sets `fill` on a sign glyph, so nothing the
// attribute used to lose to is now outranked. Without `color` it is still the attribute's
// currentColor, exactly as before.
//
// translate="no" in both modes, for PlanetGlyph's reason (2026-10-09; ui/glyphify's
// SVG_NO_TRANSLATE says it in full).
interface ZodiacGlyphProps {
  sign: number;
  size?: number;
  className?: string;
  x?: number;
  y?: number;
  color?: string;
}

export function ZodiacGlyph({
  sign,
  size = 14,
  className,
  x,
  y,
  color,
}: ZodiacGlyphProps) {
  const char = SIGN_GLYPHS[sign] ?? '';
  const cls = className ? `astro-glyph ${className}` : 'astro-glyph';

  if (x !== undefined && y !== undefined) {
    return (
      <text
        x={x}
        y={y}
        className={cls}
        fontSize={size}
        fill={color ? undefined : 'currentColor'}
        style={color ? { fill: color } : undefined}
        textAnchor="middle"
        dominantBaseline="central"
        {...SVG_NO_TRANSLATE}
      >
        {char}
      </text>
    );
  }

  return (
    <span
      className={cls}
      style={{ fontSize: size, ...(color ? { color } : null) }}
      translate="no"
    >
      {char}
    </span>
  );
}
