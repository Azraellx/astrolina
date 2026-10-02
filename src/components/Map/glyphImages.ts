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
import {
  MAP_LINE_COLOR_OVERRIDES,
  MINOR_LINE_PALETTE,
  STAR_LINE_COLORS,
  minorLineColor,
  minorPaletteSlot,
  type Theme,
} from '../../lib/theme';
import { MINOR_GLYPHS, PLANET_GLYPHS } from '../../lib/astro/glyphChars';
import { MINOR_DIAMOND_IN_COIN, minorDiamondPoints, minorHollowPoints } from '../../lib/minorBodies/mark';
import { isHypotheticalKey } from '../../lib/minorBodies/ids';
// The same file index.css's @font-face names (Vite emits it once), so a load that failed can be
// asked for again — see attemptFont.
import SYMBOL_FONT_URL from '../../fonts/subset-NotoSansSymbols-Regular.woff2?url';

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

// ── The symbol font ──────────────────────────────────────────────────────────
// Every sprite below draws its glyph with fillText, so the bundled font has to be loaded first or
// the canvas bakes whatever the system falls back to. But the font is a NETWORK request, and the
// chart cannot be made to wait on one: the build awaits these images before it adds a single layer,
// so a load that never succeeds is a map with no chart on it. That is exactly what the memoized
// promise this replaces did (until 2026-09-30): one failed load — the network cut while the page
// was loading — was kept, every later build awaited the same rejection, and the chart was gone until
// a reload. So: a failed load is never kept (the next build, the browser's `online` event or the
// retry schedule below asks again); a build waits a bounded time and then bakes with the fallback,
// because glyphs in a fallback font beat no chart at all; and when the font does arrive, every map
// that was baked without it is re-baked in place.
const FONT_FAMILY_NAME = 'Noto Sans Symbols';
/** How long a build waits for the font before baking without it. Long enough that a slow link
 *  still bakes the real glyphs first time (the font is ~5 KB, and the page's own glyphs have
 *  usually requested it well before the map's style lands); short enough that a request hanging on
 *  a dead network costs the chart a beat, not the tens of seconds a connection attempt into
 *  nothing takes to give up. A load that FAILS ends the wait at once. */
const FONT_WAIT_MS = 4000;
/** After a failed load, ask again at these delays, then leave it to the next build and the
 *  browser's `online` event: a file that has failed four times over eight minutes is not coming
 *  back on a timer, and this is the app's own server. */
const FONT_RETRY_MS = [10_000, 30_000, 120_000, 300_000];

// The load in flight, or the one that succeeded. Never a failed one.
let fontLoad: Promise<boolean> | null = null;
let fontOk = false;
let retryStep = 0;
let retryTimer = 0;
let listeningOnline = false;

const symbolFaceLoaded = (fonts: FontFaceSet): boolean => {
  let ok = false;
  fonts.forEach((f) => {
    if (f.status === 'loaded' && f.family.replace(/["']/g, '') === FONT_FAMILY_NAME) ok = true;
  });
  return ok;
};

// One attempt. The stylesheet's face first (its @font-face in index.css); but a FontFace that has
// failed stays failed for the life of the document — asking it again is answered with the same
// error and no request — so after a failure the file itself is asked for again as a fresh face under
// the same family name, which every consumer of the family (these sprites, the DOM glyphs, the
// capture and wheel rasters) then resolves to.
async function attemptFont(fonts: FontFaceSet): Promise<void> {
  try {
    await fonts.load(`${FONT_PX}px ${FONT_FAMILY}`, PLANET_GLYPHS.Sun);
    if (symbolFaceLoaded(fonts)) return;
  } catch {
    /* the stylesheet's face has failed: ask for the file again, below */
  }
  const face = new FontFace(FONT_FAMILY_NAME, `url("${SYMBOL_FONT_URL}") format("woff2")`);
  await face.load();
  fonts.add(face);
}

function scheduleFontRetry(): void {
  if (!listeningOnline) {
    listeningOnline = true;
    window.addEventListener('online', () => void loadFont());
  }
  window.clearTimeout(retryTimer);
  if (retryStep >= FONT_RETRY_MS.length) return;
  retryTimer = window.setTimeout(() => void loadFont(), FONT_RETRY_MS[retryStep++]);
}

/** Resolves true once the symbol font is usable, false when this attempt failed. Never rejects,
 *  and never hands a failed attempt to the next caller. */
function loadFont(): Promise<boolean> {
  if (fontOk) return Promise.resolve(true);
  if (fontLoad) return fontLoad;
  const fonts = document.fonts;
  if (!fonts) {
    fontOk = true; // no font API: fillText draws whatever is there, and waiting changes nothing
    return Promise.resolve(true);
  }
  const attempt: Promise<boolean> = attemptFont(fonts).then(
    () => {
      fontOk = true;
      window.clearTimeout(retryTimer);
      rebakeInFont();
      return true;
    },
    () => {
      if (fontLoad === attempt) fontLoad = null;
      scheduleFontRetry();
      return false;
    },
  );
  fontLoad = attempt;
  return attempt;
}

// The maps whose sprites were last baked WITHOUT the font, with what they were baked from. An entry
// is dropped when a build starts on that map (the build bakes afresh, and an entry still holding the
// previous theme must not overwrite it), and re-added only when that build, too, bakes without.
type BakeArgs = { halo: string; zenithHalo: string; theme: Theme };
const bakedWithoutFont = new Map<MlMap, BakeArgs>();
const watchedForRemoval = new WeakSet<MlMap>();

function rebakeInFont(): void {
  for (const [map, args] of [...bakedWithoutFont]) {
    bakedWithoutFont.delete(map);
    try {
      // No sprite on the style: a swap has replaced it, and the build that follows bakes in the font.
      if (!map.hasImage(`${GLYPH_IMAGE_PREFIX}Sun`)) continue;
      bakeAll(map, args, true);
      map.triggerRepaint();
    } catch {
      /* the map has gone */
    }
  }
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
  ch: string,
  color: string,
  discFill: string,
  cx: number,
  cy: number,
  fontPx: number,
): void {
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
  drawStampGlyph(ctx, PLANET_GLYPHS[planet], color, discFill, c, c, ZENITH_STAMP_GLYPH_PX);
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
  drawStampGlyph(ctx, PLANET_GLYPHS[planet], color, discFill, c, c, NADIR_STAMP_GLYPH_PX);
  return ctx.getImageData(0, 0, ZENITH_STAMP_PX, ZENITH_STAMP_PX);
}

// ── Catalog minor bodies ──────────────────────────────────────────────────────
// A catalog body's zenith stamp (and the bead repeated along its lines) is a coin
// like a planet's: theme disc, palette-colour ring. Bodies with a Unicode symbol
// (MINOR_GLYPHS) carry it; every other body — the great majority — carries a small
// solid diamond, the one mark every such coin shares, so a catalog coin never
// reads as a planet's. A HYPOTHETICAL point (minorBodies/hypothetical.ts) carries the
// same diamond hollow: it has no symbol, and the empty centre is what says the point is
// computed rather than observed. Baked per PALETTE SLOT (12 images each), not per body,
// so the number of sprites doesn't grow with the catalog; glyph bodies add one each.
export const MINOR_COIN_PREFIX = 'minor-coin-';
export const MINOR_HOLLOW_COIN_PREFIX = 'minor-hcoin-';
export const MINOR_GLYPH_PREFIX = 'minor-glyph-';

/** The sprite id for catalog body `n` (see MinorDecor.icon) — the lines' beads and
 *  the zenith coin both draw it (Map.tsx, `icon-image: ['get', 'icon']`). */
export function minorIconId(n: number): string {
  if (MINOR_GLYPHS.has(n)) return `${MINOR_GLYPH_PREFIX}${n}`;
  const prefix = isHypotheticalKey(n) ? MINOR_HOLLOW_COIN_PREFIX : MINOR_COIN_PREFIX;
  return `${prefix}${minorPaletteSlot(n)}`;
}

function rasterizeMinorCoin(
  color: string,
  discFill: string,
  glyph: string | undefined,
  hollow = false,
): ImageData | null {
  const canvas = document.createElement('canvas');
  canvas.width = ZENITH_STAMP_PX;
  canvas.height = ZENITH_STAMP_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const c = ZENITH_STAMP_PX / 2;
  ctx.beginPath();
  ctx.arc(c, c, ZENITH_DISC_R, 0, Math.PI * 2);
  ctx.fillStyle = discFill;
  ctx.fill();
  ctx.lineWidth = ZENITH_RING_W;
  ctx.strokeStyle = color;
  ctx.stroke();
  if (glyph) {
    drawStampGlyph(ctx, glyph, color, discFill, c, c, ZENITH_STAMP_GLYPH_PX);
  } else {
    // The shared catalog mark: a small solid diamond (a path, so it looks the same
    // on every platform and needs no font). Its proportions are the chart wheel's
    // too — lib/minorBodies/mark — so the coin on the map and the coin in the chart
    // carry the same diamond. Hollow, it is the same outline with the hole traced the
    // other way round, so the one nonzero fill leaves the centre showing the disc —
    // a wall ≈1.5px across at this size, the ring's own weight.
    const half = ZENITH_DISC_R * MINOR_DIAMOND_IN_COIN;
    const rings = hollow
      ? Object.values(minorHollowPoints(c, c, half))
      : [minorDiamondPoints(c, c, half)];
    ctx.beginPath();
    for (const [first, ...rest] of rings) {
      ctx.moveTo(first[0], first[1]);
      for (const p of rest) ctx.lineTo(p[0], p[1]);
      ctx.closePath();
    }
    ctx.fillStyle = color;
    ctx.fill();
  }
  return ctx.getImageData(0, 0, ZENITH_STAMP_PX, ZENITH_STAMP_PX);
}

// Put one sprite on the map. A build removes and re-adds (the ids stay the same across themes and
// the new halo has to be picked up); the re-bake once the font has arrived updates IN PLACE, on a
// style whose layers already draw these images — the same size and ratio, only the pixels change.
type Put = (id: string, data: ImageData | null, pixelRatio: number) => void;
const putter =
  (map: MlMap, inPlace: boolean): Put =>
  (id, data, pixelRatio) => {
    if (!data) return;
    if (inPlace && map.hasImage(id)) return void map.updateImage(id, data);
    if (map.hasImage(id)) map.removeImage(id);
    map.addImage(id, data, { pixelRatio });
  };

function bakeMinorImages(put: Put, discFill: string, theme: Theme): void {
  MINOR_LINE_PALETTE[theme].forEach((color, slot) => {
    put(`${MINOR_COIN_PREFIX}${slot}`, rasterizeMinorCoin(color, discFill, undefined), RATIO);
    put(`${MINOR_HOLLOW_COIN_PREFIX}${slot}`, rasterizeMinorCoin(color, discFill, undefined, true), RATIO);
  });
  for (const [n, glyph] of MINOR_GLYPHS) {
    put(`${MINOR_GLYPH_PREFIX}${n}`, rasterizeMinorCoin(minorLineColor(n, theme), discFill, glyph), RATIO);
  }
}

// (Re)bake the planet-glyph images onto the map, each at its planet color with
// the theme's `halo` outline. Always re-bakes rather than skipping existing
// images: a theme change keeps the same image ids but needs the new halo (none
// in dark, dark in vintage, white in glass/light), so we remove and re-add to
// pick it up. Awaited before the custom layers are added so the `['image', …]`
// references resolve immediately — after waiting a bounded time for the symbol
// font, never on it (see FONT_WAIT_MS).
export async function ensureGlyphImages(
  map: MlMap,
  halo: string,
  zenithHalo: string,
  theme: Theme,
): Promise<void> {
  // This build bakes afresh: a re-bake still holding the previous build's theme must not land
  // after it.
  bakedWithoutFont.delete(map);
  if (!fontOk) {
    let cut = 0;
    await Promise.race([
      loadFont(),
      new Promise<void>((resolve) => {
        cut = window.setTimeout(resolve, FONT_WAIT_MS);
      }),
    ]);
    window.clearTimeout(cut);
  }
  const args = { halo, zenithHalo, theme };
  bakeAll(map, args, false);
  // Read at bake time, not from the wait: the bake is synchronous, so this is what it drew with.
  if (!fontOk) {
    if (!watchedForRemoval.has(map)) {
      watchedForRemoval.add(map);
      map.once('remove', () => bakedWithoutFont.delete(map));
    }
    bakedWithoutFont.set(map, args);
  }
}

function bakeAll(map: MlMap, { halo, zenithHalo, theme }: BakeArgs, inPlace: boolean): void {
  const put = putter(map, inPlace);
  for (const p of PLANET_NAMES) {
    // Bodies whose tint washes out on a light basemap are baked in the shared per-theme
    // override (MAP_LINE_COLOR_OVERRIDES) — the Moon over the pale zenith disc on both
    // light themes, Mercury/Uranus on Earth — matching App's withThemeLineColors for the
    // lines. Everything else (incl. all bodies on dark) keeps its PLANET_COLORS tint.
    const color = MAP_LINE_COLOR_OVERRIDES[theme][p] ?? PLANET_COLORS[p];
    // Line-label glyph: nudged down to sit on the angle-code baseline.
    put(`${GLYPH_IMAGE_PREFIX}${p}`, rasterize(p, color, halo), RATIO);
    // Zenith STAMP: the full coin (disc + ring + glyph) baked as one image, so the
    // stamp draws as a single overlap-stacking unit. `zenithHalo` is the disc fill.
    put(`${ZENITH_GLYPH_PREFIX}${p}`, rasterizeZenith(p, color, zenithHalo), RATIO);
    // Nadir STAMP: the diamond variant, same fill/ring, for the antipodal point.
    put(`${NADIR_GLYPH_PREFIX}${p}`, rasterizeNadir(p, color, zenithHalo), RATIO);
  }
  // The star-line spark, in the theme's star tint (see STAR_LINE_COLORS).
  put(STAR_MARK_IMAGE, rasterizeStarMark(STAR_LINE_COLORS[theme], halo), STAR_RATIO);
  // Catalog minor-body coins, on the same disc fill as the planets' stamps.
  bakeMinorImages(put, zenithHalo, theme);
}
