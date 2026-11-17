// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { lonRange, rangeEndMin } from '../../lib/astro/format';
import { ZodiacGlyph } from './ZodiacGlyph';

// A longitude printed as the span it may lie in — "29°♊52'–12°♋05'" — for a body on a chart
// with no birth time (lib/astro/timeless says how wide). Each end is its degree, its own sign
// glyph and its minutes, truncated (format.ts lonRange), so a span across a sign boundary
// reads 24°♓51'–9°♈03'. Minutes on every range since Lina's CH-1, 17 Nov 2026. Kept on one
// line: half a range on each line reads as two figures. (2026-10-02)
interface ZodiacRangeProps {
  /** The placeholder longitude, radians. */
  lon: number;
  /** The range's ends as offsets from `lon`, degrees (lib/astro/timeless BodyRange). */
  range: { lo: number; hi: number };
  /** The sign glyphs' size, px. */
  size?: number;
  className?: string;
}

export function ZodiacRange({ lon, range, size = 12, className }: ZodiacRangeProps) {
  const { lo, hi } = lonRange(lon, range);
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
      {`${rangeEndMin(lo)}–${hi.deg}°`}
      <ZodiacGlyph sign={hi.signIdx} size={size} />
      {rangeEndMin(hi)}
    </span>
  );
}
