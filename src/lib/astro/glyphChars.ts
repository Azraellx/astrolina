// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Single source of truth for astrological glyph characters, rendered with the
// bundled 'Noto Sans Symbols' subset (see src/fonts/stylesheet.css) via the
// `.astro-glyph` class. Each character carries the U+FE0E variation selector
// ("forced text"), which locks every OS — iPhone, Android, Windows — out of
// substituting a colored emoji for the flat, monochrome symbol.
import type { PlanetName } from '../ephemeris';

const VS_TEXT = '︎';

// Planets, luminaries, nodes and asteroids → their Unicode astrological symbol.
export const PLANET_GLYPHS: Record<PlanetName, string> = {
  Sun: '☉' + VS_TEXT, // ☉
  Moon: '☽' + VS_TEXT, // ☽ (waxing crescent)
  Mercury: '☿' + VS_TEXT, // ☿
  Venus: '♀' + VS_TEXT, // ♀
  Mars: '♂' + VS_TEXT, // ♂
  Jupiter: '♃' + VS_TEXT, // ♃
  Saturn: '♄' + VS_TEXT, // ♄
  Uranus: '♅' + VS_TEXT, // ♅
  Neptune: '♆' + VS_TEXT, // ♆
  Pluto: '⯓' + VS_TEXT, // Pluto Form Two (U+2BD3; from Noto Sans Symbols 2)
  NorthNode: '☊' + VS_TEXT, // ☊
  SouthNode: '☋' + VS_TEXT, // ☋
  Lilith: '⚸' + VS_TEXT, // ⚸ Black Moon Lilith (U+26B8)
  Chiron: '⚷' + VS_TEXT, // ⚷
  Ceres: '⚳' + VS_TEXT, // ⚳
  Pallas: '⚴' + VS_TEXT, // ⚴
  Juno: '⚵' + VS_TEXT, // ⚵
  Vesta: '⚶' + VS_TEXT, // ⚶
};

// The 12 zodiac signs, indexed 0 (Aries, U+2648) … 11 (Pisces, U+2653).
export const SIGN_GLYPHS: string[] = Array.from(
  { length: 12 },
  (_, i) => String.fromCodePoint(0x2648 + i) + VS_TEXT,
);

// The five Ptolemaic aspect symbols: conjunction/opposition/sextile (U+260C /
// U+260D / U+26B9) from Noto Sans Symbols, the square/trine shapes (U+25A1 /
// U+25B3) from Noto Sans Symbols 2 — all in the bundled subset
// (scripts/subset-font.sh). The "Aspects to angles" map lines use only the
// sextile/square/trine subset (conjunction/opposition lines ARE the planets'
// own angle lines); the chart sidebar's aspect tables use all five.
export const ASPECT_GLYPHS: Record<
  'conjunction' | 'opposition' | 'sextile' | 'square' | 'trine',
  string
> = {
  conjunction: '☌' + VS_TEXT,
  opposition: '☍' + VS_TEXT,
  sextile: '⚹' + VS_TEXT,
  square: '□' + VS_TEXT,
  trine: '△' + VS_TEXT,
};
