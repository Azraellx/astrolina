// Rasterize the astrological glyphs into images MapLibre can embed inline in
// line labels (via the `['image', …]` format expression). MapLibre's basemap
// fontstack doesn't carry astrological symbols, so we draw each glyph from the
// bundled 'Noto Sans Symbols' font onto a canvas, baked at its planet color and
// keyed `glyph-<PlanetName>`. The glyph chars are the single source of truth in
// lib/astro/glyphChars (the same ones the DOM/SVG components use).
import type { Map as MlMap } from 'maplibre-gl';
import { PLANET_COLORS, PLANET_NAMES, type PlanetName } from '../../lib/ephemeris';
import { PLANET_GLYPHS } from '../../lib/astro/glyphChars';

export const GLYPH_IMAGE_PREFIX = 'glyph-';

// Logical size of the inline glyph (px); RATIO renders it at 2× for crispness.
const LOGICAL = 15;
const RATIO = 2;
const PX = LOGICAL * RATIO;
// Font size within the box — a little under PX so the glyph keeps a margin.
const FONT_PX = Math.round(PX * 0.82);
const FONT_FAMILY = "'Noto Sans Symbols'";

// Load the symbol font once before any rasterization, so fillText() draws the
// real glyph rather than a fallback box. Memoized.
let fontReady: Promise<unknown> | null = null;
function ensureFontLoaded(): Promise<unknown> {
  if (!fontReady) {
    const fonts = document.fonts;
    fontReady = fonts
      ? fonts.load(`${FONT_PX}px ${FONT_FAMILY}`).then(() => fonts.ready)
      : Promise.resolve();
  }
  return fontReady;
}

function rasterize(planet: PlanetName, color: string): ImageData | null {
  const canvas = document.createElement('canvas');
  canvas.width = PX;
  canvas.height = PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = `${FONT_PX}px ${FONT_FAMILY}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(PLANET_GLYPHS[planet], PX / 2, PX / 2 + 1);
  return ctx.getImageData(0, 0, PX, PX);
}

// Add any missing planet-glyph images to the map. Idempotent, so it's safe to
// call again after a style reload (which clears images). Awaited before the
// custom layers are added so the `['image', …]` references resolve immediately.
export async function ensureGlyphImages(map: MlMap): Promise<void> {
  await ensureFontLoaded();
  for (const p of PLANET_NAMES) {
    const id = `${GLYPH_IMAGE_PREFIX}${p}`;
    if (map.hasImage(id)) continue;
    const data = rasterize(p, PLANET_COLORS[p]);
    if (data && !map.hasImage(id)) {
      map.addImage(id, data, { pixelRatio: RATIO });
    }
  }
}
