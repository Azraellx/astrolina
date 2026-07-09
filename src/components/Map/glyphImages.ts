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
import { MAP_LINE_COLOR_OVERRIDES, STAR_LINE_COLORS, type Theme } from '../../lib/theme';
import { PLANET_GLYPHS } from '../../lib/astro/glyphChars';

export const GLYPH_IMAGE_PREFIX = 'glyph-';
/** The little five-pointed star repeated along the fixed-star lines. */
export const STAR_MARK_IMAGE = 'star-mark';
// Variant used for the zenith stamps (which sit ON a point inside a circle, not
// inline next to an angle code); nudged down 15% to optically center it.
export const ZENITH_GLYPH_PREFIX = 'zenith-glyph-';
/** Nadir (sub-anti-planetary) stamp: a DIAMOND coin, distinct from the zenith's
 *  circle, so the underfoot point reads as its own marker. */
export const NADIR_GLYPH_PREFIX = 'nadir-glyph-';

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
// The zenith STAMP sprite bakes the disc + planet-colour ring behind the glyph, so
// each stamp is a SINGLE icon. Overlapping zeniths then stack as whole coins (disc
// and glyph together) instead of the discs and glyphs interleaving across two flat
// layers (which read as a merged blob). Sized to the resting disc — these mirror
// the hover-grow circle's rest radius / ring in Map.tsx, so the circle (now a
// hover-only bloom behind the stamp) lines up with the baked disc.
const ZENITH_STAMP_PX = 62; // canvas px (≈31px on the map at RATIO 2)
const ZENITH_DISC_R = 26; // 13px display radius — matches circle-radius at rest
const ZENITH_RING_W = 3; // 1.5px display ring — matches circle-stroke-width at rest
const ZENITH_STAMP_GLYPH_PX = 40; // 20px display — same glyph size as the old stamp
// (The glyph is centred by measuring its ink box in drawStampGlyph — no fixed nudge needed.)

// The nadir STAMP: the same canvas + fill/ring as the zenith, but a DIAMOND (a
// 45°-rotated square) instead of a circle, so the underfoot point reads as a
// distinct marker. Its half-diagonal reaches a touch past the disc radius; the
// glyph is nudged a hair smaller so it sits inside the diamond's narrower body.
const NADIR_DIAMOND_R = 28; // canvas half-diagonal (≈14px display)
const NADIR_STAMP_GLYPH_PX = 34; // ≈17px display — smaller than the zenith to fit the diamond

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

// The star-line spark: a five-pointed star PATH (no font involved, so it looks
// identical on every platform), baked at the theme's star tint with the theme
// halo so it reads on the pale basemaps. Baked small and dense: at ≈70% smaller
// than the old 11px spark it repeats three-times-tighter (see symbol-spacing in
// Map.tsx) as a fine ✦✦✦ bead-thread over the dotted base line, rather than a row
// of big stars. Baked at 4× (vs the glyphs' 2×) for crispness at this small size,
// with its own halo width — the glyphs' HALO_PX would swamp a ~3.5px spark.
const STAR_LOGICAL = 3.5;
const STAR_RATIO = 4;
const STAR_PX = STAR_LOGICAL * STAR_RATIO;
// Halo rim for the spark, in canvas px (≈0.5 logical on the map): a thin lift off
// the pale basemaps without thickening the small star into a blob.
const STAR_HALO_PX = 2;

function rasterizeStarMark(color: string, halo: string): ImageData | null {
  const canvas = document.createElement('canvas');
  canvas.width = STAR_PX;
  canvas.height = STAR_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const cx = STAR_PX / 2;
  const cy = STAR_PX / 2;
  const R = STAR_PX * 0.42; // outer radius, leaving room for the halo stroke
  const r = R * 0.42; // inner radius — the classic five-point proportions
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? R : r;
    const x = cx + rad * Math.cos(a);
    const y = cy + rad * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (halo) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = STAR_HALO_PX;
    ctx.strokeStyle = halo;
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.fill();
  return ctx.getImageData(0, 0, STAR_PX, STAR_PX);
}

// Draw a stamp's planet glyph, optically centred and haloed in the disc fill so its
// edge melts into the coin rather than reading as a hard cut. Shared by the zenith
// (circle) and nadir (diamond) stamps, which differ only in the shape behind it.
function drawStampGlyph(
  ctx: CanvasRenderingContext2D,
  planet: PlanetName,
  color: string,
  discFill: string,
  cx: number,
  cy: number,
  fontPx: number,
): void {
  const ch = PLANET_GLYPHS[planet];
  ctx.font = `${fontPx}px ${FONT_FAMILY}`;
  // Centre the glyph's ACTUAL INK box at (cx, cy), measured per-glyph. textAlign:center +
  // textBaseline:middle instead centre the font's EM box, which different engines (notably mobile
  // Safari/Chrome) place differently for this symbol font — so a fixed nudge that looked centred on
  // desktop pushed the glyph down-right on mobile (these sprites are baked client-side, so the
  // device's own text rendering bakes in the offset). Measuring the ink makes it identical everywhere.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(ch);
  const px = cx - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
  const py = cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = HALO_PX;
  ctx.strokeStyle = discFill;
  ctx.strokeText(ch, px, py);
  ctx.fillStyle = color;
  ctx.fillText(ch, px, py);
}

// Bake a zenith STAMP: the disc (theme `discFill`) + the planet-colour ring, with
// the glyph on top. One sprite per body, so the stamp draws as a single unit that
// stacks cleanly when two zeniths overlap (see ZENITH_STAMP_PX above).
function rasterizeZenith(
  planet: PlanetName,
  color: string,
  discFill: string,
): ImageData | null {
  const canvas = document.createElement('canvas');
  canvas.width = ZENITH_STAMP_PX;
  canvas.height = ZENITH_STAMP_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const c = ZENITH_STAMP_PX / 2;
  // Disc fill + planet-colour ring, centred on the sprite (i.e. on the point).
  ctx.beginPath();
  ctx.arc(c, c, ZENITH_DISC_R, 0, Math.PI * 2);
  ctx.fillStyle = discFill;
  ctx.fill();
  ctx.lineWidth = ZENITH_RING_W;
  ctx.strokeStyle = color;
  ctx.stroke();
  drawStampGlyph(ctx, planet, color, discFill, c, c, ZENITH_STAMP_GLYPH_PX);
  return ctx.getImageData(0, 0, ZENITH_STAMP_PX, ZENITH_STAMP_PX);
}

// Bake a nadir STAMP: like the zenith coin but a DIAMOND (a 45°-rotated square) —
// sharp-cornered so it never reads as a squashed circle — over the same theme fill
// + planet ring, with the glyph on top. A distinct shape for the underfoot point.
function rasterizeNadir(
  planet: PlanetName,
  color: string,
  discFill: string,
): ImageData | null {
  const canvas = document.createElement('canvas');
  canvas.width = ZENITH_STAMP_PX;
  canvas.height = ZENITH_STAMP_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const c = ZENITH_STAMP_PX / 2;
  const r = NADIR_DIAMOND_R;
  // Diamond: vertices at top / right / bottom / left. Sharp corners (default miter
  // join) so it reads as a crisp square stood on its point.
  ctx.beginPath();
  ctx.moveTo(c, c - r);
  ctx.lineTo(c + r, c);
  ctx.lineTo(c, c + r);
  ctx.lineTo(c - r, c);
  ctx.closePath();
  ctx.fillStyle = discFill;
  ctx.fill();
  ctx.lineWidth = ZENITH_RING_W;
  ctx.strokeStyle = color;
  ctx.stroke();
  drawStampGlyph(ctx, planet, color, discFill, c, c, NADIR_STAMP_GLYPH_PX);
  return ctx.getImageData(0, 0, ZENITH_STAMP_PX, ZENITH_STAMP_PX);
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
  theme: Theme,
): Promise<void> {
  await ensureFontLoaded();
  for (const p of PLANET_NAMES) {
    // Bodies whose tint washes out on a light basemap are baked in the shared per-theme
    // override (MAP_LINE_COLOR_OVERRIDES) — the Moon over the pale zenith disc on both
    // light themes, Mercury/Uranus on Earth — matching App's withThemeLineColors for the
    // lines. Everything else (incl. all bodies on dark) keeps its PLANET_COLORS tint.
    const color = MAP_LINE_COLOR_OVERRIDES[theme][p] ?? PLANET_COLORS[p];
    // Line-label glyph: nudged down to sit on the angle-code baseline.
    const id = `${GLYPH_IMAGE_PREFIX}${p}`;
    const data = rasterize(p, color, halo);
    if (data) {
      if (map.hasImage(id)) map.removeImage(id);
      map.addImage(id, data, { pixelRatio: RATIO });
    }
    // Zenith STAMP: the full coin (disc + ring + glyph) baked as one image, so the
    // stamp draws as a single overlap-stacking unit. `zenithHalo` is the disc fill.
    const zid = `${ZENITH_GLYPH_PREFIX}${p}`;
    const zdata = rasterizeZenith(p, color, zenithHalo);
    if (zdata) {
      if (map.hasImage(zid)) map.removeImage(zid);
      map.addImage(zid, zdata, { pixelRatio: RATIO });
    }
    // Nadir STAMP: the diamond variant, same fill/ring, for the antipodal point.
    const nid = `${NADIR_GLYPH_PREFIX}${p}`;
    const ndata = rasterizeNadir(p, color, zenithHalo);
    if (ndata) {
      if (map.hasImage(nid)) map.removeImage(nid);
      map.addImage(nid, ndata, { pixelRatio: RATIO });
    }
  }
  // The star-line spark, in the theme's star tint (see STAR_LINE_COLORS).
  const star = rasterizeStarMark(STAR_LINE_COLORS[theme], halo);
  if (star) {
    if (map.hasImage(STAR_MARK_IMAGE)) map.removeImage(STAR_MARK_IMAGE);
    map.addImage(STAR_MARK_IMAGE, star, { pixelRatio: STAR_RATIO });
  }
}
