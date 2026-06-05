// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

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
// Variant used for the zenith stamps (which sit ON a point inside a circle, not
// inline next to an angle code); nudged down 15% to optically center it.
export const ZENITH_GLYPH_PREFIX = 'zenith-glyph-';

// Logical size of the inline glyph BOX (px); RATIO renders it at 2× for
// crispness. The box is roomy so the glyph can be nudged well down without
// clipping; the glyph itself is sized by FONT_PX (≈ the same on-map size as
// before — the extra box is transparent margin).
const LOGICAL = 24;
const RATIO = 2;
const PX = LOGICAL * RATIO;
// Glyph font size within the box — leaves generous margin for the downward
// nudge + halo.
const FONT_PX = Math.round(PX * 0.84);
const FONT_FAMILY = "'Noto Sans Symbols'";
// Baked outline width (canvas px ≈ 1.5 logical) — the image analogue of the text
// labels' halo, so glyphs read on pale basemaps.
const HALO_PX = 3;
// Nudge the glyph down within its box (~20%) so it sits on the text baseline
// instead of riding high next to the angle code.
const Y_OFFSET = Math.round(PX * 0.3);
// The zenith-stamp glyph sits 15% of the box below center, so it reads as
// optically centered within its circle rather than riding high.
const ZENITH_Y_OFFSET = Math.round(PX * 0.1);

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

function rasterize(
  planet: PlanetName,
  color: string,
  halo: string,
  yOffset: number = Y_OFFSET,
): ImageData | null {
  const canvas = document.createElement('canvas');
  canvas.width = PX;
  canvas.height = PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = `${FONT_PX}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const ch = PLANET_GLYPHS[planet];
  const x = PX / 2;
  const y = PX / 2 + yOffset;
  // Halo first (a rounded stroke behind), then the colored glyph on top. An
  // empty halo (dark theme) skips the outline — the glyph already reads on the
  // dark basemap.
  if (halo) {
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = HALO_PX;
    ctx.strokeStyle = halo;
    ctx.strokeText(ch, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(ch, x, y);
  return ctx.getImageData(0, 0, PX, PX);
}

// (Re)bake the planet-glyph images onto the map, each at its planet color with
// the theme's `halo` outline. Always re-bakes rather than skipping existing
// images: a theme change keeps the same image ids but needs the new halo (none
// in dark, dark in vintage, white in glass/light), so we remove and re-add to
// pick it up. Awaited before the custom layers are added so the `['image', …]`
// references resolve immediately.
export async function ensureGlyphImages(
  map: MlMap,
  halo: string,
  zenithHalo: string,
): Promise<void> {
  await ensureFontLoaded();
  for (const p of PLANET_NAMES) {
    const color = PLANET_COLORS[p];
    // Line-label glyph: nudged down to sit on the angle-code baseline.
    const id = `${GLYPH_IMAGE_PREFIX}${p}`;
    const data = rasterize(p, color, halo);
    if (data) {
      if (map.hasImage(id)) map.removeImage(id);
      map.addImage(id, data, { pixelRatio: RATIO });
    }
    // Zenith-stamp glyph: nudged down to sit optically centered in its circle, and
    // outlined in the disc-fill color so the halo blends into the disc (no visible
    // border — the disc fill alone carries legibility).
    const zid = `${ZENITH_GLYPH_PREFIX}${p}`;
    const zdata = rasterize(p, color, zenithHalo, ZENITH_Y_OFFSET);
    if (zdata) {
      if (map.hasImage(zid)) map.removeImage(zid);
      map.addImage(zid, zdata, { pixelRatio: RATIO });
    }
  }
}
