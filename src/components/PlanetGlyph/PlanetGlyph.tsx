import type { PlanetName } from '../../lib/ephemeris';
import { PLANET_GLYPHS } from '../../lib/astro/glyphChars';

// Astrological planet glyph drawn from the bundled 'Noto Sans Symbols' font (via
// the `.astro-glyph` class). Two render modes, matching the call sites:
//   • DOM mode (no x/y): an inline <span> sized by `size` (font-size px); color
//     inherits from the parent unless `color` is given.
//   • SVG mode (x/y given): an SVG <text> centered on (x, y), for use inside the
//     chart wheel; `color` (default currentColor) sets the fill.
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
    // The font's symbols sit a touch low against the central baseline, so inside
    // the wheel's planet discs they kiss the bottom edge. Nudge up ~10% of the
    // glyph size to optically center them.
    return (
      <text
        x={x}
        y={y - size * 0.1}
        className={cls}
        fontSize={size}
        fill={color ?? 'currentColor'}
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
