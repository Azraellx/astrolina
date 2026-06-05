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
