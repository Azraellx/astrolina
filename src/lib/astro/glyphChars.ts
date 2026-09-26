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
  Fortune: '⊗' + VS_TEXT, // ⊗ Part of Fortune (U+2297 CIRCLED TIMES — the X sits
  // INSIDE the circle, the conventional Lot symbol; U+29BB's X spills past the rim).
  // Bundled from Noto Sans Math (subset-font.sh).
};

// Catalog minor bodies that HAVE a Unicode astrological symbol, by MPC number — all
// from Noto Sans Symbols 2 (scripts/subset-font.sh). Every other catalog body draws
// as a plain coin in its palette colour (see minorLineColor). Deliberately absent:
// 26 Proserpina — U+2BD8 is the hypothetical planet of that name, not the asteroid.
// Eris has two encoded forms (U+2BF0 / U+2BF1); Form One is used here.
export const MINOR_GLYPHS: ReadonlyMap<number, string> = new Map([
  [5, '⯙' + VS_TEXT], // U+2BD9 ASTRAEA
  [10, '⯚' + VS_TEXT], // U+2BDA HYGIEA
  [5145, '⯛' + VS_TEXT], // U+2BDB PHOLUS
  [7066, '⯜' + VS_TEXT], // U+2BDC NESSUS
  [136199, '⯰' + VS_TEXT], // U+2BF0 ERIS FORM ONE
  [90377, '⯲' + VS_TEXT], // U+2BF2 SEDNA
  [136108, String.fromCodePoint(0x1f77b) + VS_TEXT], // HAUMEA
  [136472, String.fromCodePoint(0x1f77c) + VS_TEXT], // MAKEMAKE
  [225088, String.fromCodePoint(0x1f77d) + VS_TEXT], // GONGGONG
  [50000, String.fromCodePoint(0x1f77e) + VS_TEXT], // QUAOAR
  [90482, String.fromCodePoint(0x1f77f) + VS_TEXT], // ORCUS
]);

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

// The four classical elements → their alchemical triangle symbols (the
// traditional element glyphs): fire △, water ▽, air △-with-bar, earth ▽-with-bar.
// These live in Noto Sans Symbols (Alchemical Symbols block); written via
// fromCodePoint so the source stays free of astral-plane literals. Drives the
// chart sidebar's element-balance bar.
export const ELEMENT_GLYPHS: Record<'fire' | 'earth' | 'air' | 'water', string> = {
  fire: String.fromCodePoint(0x1f702) + VS_TEXT, // ALCHEMICAL SYMBOL FOR FIRE
  earth: String.fromCodePoint(0x1f703) + VS_TEXT, // ALCHEMICAL SYMBOL FOR EARTH
  air: String.fromCodePoint(0x1f701) + VS_TEXT, // ALCHEMICAL SYMBOL FOR AIR
  water: String.fromCodePoint(0x1f704) + VS_TEXT, // ALCHEMICAL SYMBOL FOR WATER
};

// The three modalities → icons for the modality-balance bar. There is no
// standard astrological glyph for the qualities, so these are chosen for
// legibility as bold filled shapes (from Noto Sans Symbols 2): a heavy cross for
// cardinal (initiating), a filled square for fixed (stable), a filled diamond for
// mutable (shifting).
export const MODALITY_GLYPHS: Record<'cardinal' | 'fixed' | 'mutable', string> = {
  cardinal: '✚' + VS_TEXT, // U+271A HEAVY GREEK CROSS
  fixed: '◼' + VS_TEXT, // U+25FC BLACK MEDIUM SQUARE
  mutable: '◆' + VS_TEXT, // U+25C6 BLACK DIAMOND
};
