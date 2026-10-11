// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { lonRange } from '../../lib/astro/format';
import { ZodiacGlyph } from './ZodiacGlyph';

// A longitude printed as the span it may lie in rather than a degree to the minute —
// "2°♉–18°♉" — for a body on a chart with no birth time (lib/astro/timeless says how
// wide). Each end is a whole degree with its own sign glyph (format.ts lonRange), so a
// span across a sign boundary reads 24°♓–9°♈. Kept on one line: half a range on each
// line reads as two figures. (2026-10-02)
interface ZodiacRangeProps {
  /** The placeholder longitude, radians. */
  lon: number;
  /** The half-width, degrees. */
  halfDeg: number;
  /** The sign glyphs' size, px. */
  size?: number;
  className?: string;
}

export function ZodiacRange({ lon, halfDeg, size = 12, className }: ZodiacRangeProps) {
  const { lo, hi } = lonRange(lon, halfDeg);
  // Figures and glyphs only, redrawn as the body moves: not offered to a page translator,
  // whose rewrite of one run React would then write into unseen. (2026-10-09)
  return (
    <span
      className={className ? `zodiac-range ${className}` : 'zodiac-range'}
      style={{ whiteSpace: 'nowrap' }}
      translate="no"
    >
      {`${lo.deg}°`}
      <ZodiacGlyph sign={lo.signIdx} size={size} />
      {'–'}
      {`${hi.deg}°`}
      <ZodiacGlyph sign={hi.signIdx} size={size} />
    </span>
  );
}
