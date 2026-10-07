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
import { minorPaletteSlot } from '../../lib/theme';
// What a sprite set is baked from (2026-10-06): a pure function of the palette, which
// lib/lineInks spriteSpecFor builds from the same MapInks the lines are coloured with — so a
// stamp, a spark or a coin can't come out in a colour its line isn't. A built-in theme's spec
// holds exactly the per-theme tables these bakes read directly before.
import type { SpriteSpec } from '../../lib/lineInks';
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
// previous theme must not overwrite it), and re-added only when that build, too, bakes without. A
// live re-bake (rebakeGlyphImages) that lands while the font is still missing REPLACES the entry's
// spec: the font's arrival re-bakes from what is stored here, and an entry left holding the spec
// before the change would put the old colours back the moment the font arrived.
const bakedWithoutFont = new Map<MlMap, SpriteSpec>();
const watchedForRemoval = new WeakSet<MlMap>();

function rebakeInFont(): void {
  for (const [map, spec] of [...bakedWithoutFont]) {
    bakedWithoutFont.delete(map);
    try {
      // No sprite on the style: a swap has replaced it, and the build that follows bakes in the font.
      if (!map.hasImage(`${GLYPH_IMAGE_PREFIX}Sun`)) continue;
      bakeAll(map, spec, true);
      map.triggerRepaint();
    } catch {
      /* the map has gone */
    }
  }
}

// ── Live re-bakes ────────────────────────────────────────────────────────────────────────────
// A palette edited while the map is up (the Custom theme's editor) changes what the sprites are
// baked from without changing the style, so they are re-baked IN PLACE — updateImage, the path the
// font's arrival already takes: every sprite keeps its id and its size, only the pixels change, so
// no layer is re-laid-out and no tile re-cut. And only the sprites whose inputs moved (spriteJobs:
// each image's `inputs`, diffed against what the map was baked from), since 2026-10-06: a full
// bake is ~90 canvases read back with getImageData, ~85 ms of a commit measured, while one body's
// colour moves three images (its glyph, its zenith stamp, its nadir stamp). A colour dragged
// across the picker is followed at most every REBAKE_MS, the last position always landing.
//
// A re-bake asked for while a build is baking (ensureGlyphImages, which may be waiting on the font)
// is held, not baked: the build is about to replace every sprite with what IT was handed, which may
// be older — so the build takes the held spec up once its own bake is done.
const REBAKE_MS = 150;
interface RebakeState {
  /** The spec asked for and not yet baked. */
  want: SpriteSpec | null;
  /** What the map's sprites are baked from now (by the last build or re-bake). */
  baked: SpriteSpec | null;
  building: boolean;
  timer: number;
  last: number;
}
const rebakes = new WeakMap<MlMap, RebakeState>();
function rebakeState(map: MlMap): RebakeState {
  let st = rebakes.get(map);
  if (!st) {
    st = { want: null, baked: null, building: false, timer: 0, last: 0 };
    rebakes.set(map, st);
  }
  return st;
}

function flushRebake(map: MlMap, st: RebakeState): void {
  window.clearTimeout(st.timer);
  st.timer = 0;
  const spec = st.want;
  // Mid-build: the build takes `want` up when it has baked (see above).
  if (!spec || st.building) return;
  st.want = null;
  if (spec === st.baked) return;
  try {
    // No sprite on the style yet (a swap has dropped it and its build hasn't begun): hold the spec
    // for that build, which bakes whatever is current when it starts and checks `want` after.
    if (!map.hasImage(`${GLYPH_IMAGE_PREFIX}Sun`)) {
      st.want = spec;
      return;
    }
    // Only what moved, against what the map's sprites were baked from (every image, the first
    // time a map is re-baked with nothing recorded).
    if (st.baked) bakeChanged(map, st.baked, spec);
    else bakeAll(map, spec, true);
  } catch {
    return; // the map has gone
  }
  st.baked = spec;
  st.last = Date.now();
  if (bakedWithoutFont.has(map)) bakedWithoutFont.set(map, spec);
  map.triggerRepaint();
}

/**
 * Re-bake the map's sprites from `spec`, in place, throttled to one bake per REBAKE_MS (the
 * first at once, the last always). A spec the sprites are already baked from does nothing. For a
 * palette change on a style that stays; a new style goes through ensureGlyphImages.
 */
export function rebakeGlyphImages(map: MlMap, spec: SpriteSpec): void {
  const st = rebakeState(map);
  st.want = spec;
  if (st.timer) return;
  const wait = st.last + REBAKE_MS - Date.now();
  if (wait <= 0) flushRebake(map, st);
  else st.timer = window.setTimeout(() => flushRebake(map, st), wait);
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
// the new halo has to be picked up); the re-bakes on a style that stays — once the font has arrived,
// or for a live palette change — update IN PLACE, on a style whose layers already draw these images:
// the same size and ratio, only the pixels change.
type Put = (id: string, data: ImageData | null, pixelRatio: number) => void;
const putter =
  (map: MlMap, inPlace: boolean): Put =>
  (id, data, pixelRatio) => {
    if (!data) return;
    if (inPlace && map.hasImage(id)) return void map.updateImage(id, data);
    if (map.hasImage(id)) map.removeImage(id);
    map.addImage(id, data, { pixelRatio });
  };

// (Re)bake the planet-glyph images onto the map from `spec`, each in its body's map-line colour
// with the spec's `halo` outline. Always re-bakes rather than skipping existing images: a theme
// change keeps the same image ids but needs the new halo (none on Dark, dark on Earth, white on
// Glass), so we remove and re-add to pick it up. Awaited before the custom layers are added so the
// `['image', …]` references resolve immediately — after waiting a bounded time for the symbol
// font, never on it (see FONT_WAIT_MS). The build that calls this hands it the spec current when
// the build began; a newer one asked for meanwhile (rebakeGlyphImages) is baked straight after.
export async function ensureGlyphImages(map: MlMap, spec: SpriteSpec): Promise<void> {
  // This build bakes afresh: a re-bake still holding the previous build's theme must not land
  // after it.
  bakedWithoutFont.delete(map);
  const st = rebakeState(map);
  st.building = true;
  window.clearTimeout(st.timer);
  st.timer = 0;
  try {
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
    bakeAll(map, spec, false);
    st.baked = spec;
    st.last = Date.now();
  } finally {
    st.building = false;
  }
  // Read at bake time, not from the wait: the bake is synchronous, so this is what it drew with.
  if (!fontOk) {
    if (!watchedForRemoval.has(map)) {
      watchedForRemoval.add(map);
      map.once('remove', () => bakedWithoutFont.delete(map));
    }
    bakedWithoutFont.set(map, spec);
  }
  // A palette change that came in while this build waited: bake it now, through the throttle.
  if (st.want === spec) st.want = null;
  else if (st.want) rebakeGlyphImages(map, st.want);
}

/** One sprite a spec bakes: its id and pixel ratio, the spec values its pixels are drawn from
 *  (`inputs` — equal inputs, equal pixels), and the bake itself. */
export interface SpriteJob {
  readonly id: string;
  readonly ratio: number;
  readonly inputs: string;
  draw(): ImageData | null;
}

/**
 * Every sprite `spec` bakes, in bake order — the one list a full bake (a build, the font's
 * arrival) and a live re-bake of what changed (bakeChanged) both walk, so the two can't disagree
 * about what an image is drawn from. Each body in its MAP-LINE colour — the spec's `planet`, which
 * is the MapInks.planet lib/lineInks puts on the lines themselves, so a stamp and its line can't
 * disagree. For a built-in theme that is PLANET_COLORS under the theme's MAP_LINE_COLOR_OVERRIDES
 * (today one entry: the Moon's slate on both light maps, where its pale grey vanished over the pale
 * zenith disc). Everything else, every body on Dark included, keeps its own tint.
 * verify:theme-palette §7 draws each job on a recording canvas and holds `inputs` to what the
 * rasterizer really reads.
 */
export function spriteJobs(spec: SpriteSpec): SpriteJob[] {
  const { halo, discFill, minor } = spec;
  const jobs: SpriteJob[] = [];
  for (const p of PLANET_NAMES) {
    const color = spec.planet[p] ?? PLANET_COLORS[p];
    // Line-label glyph: nudged down to sit on the angle-code baseline.
    jobs.push({ id: `${GLYPH_IMAGE_PREFIX}${p}`, ratio: RATIO, inputs: `${color}|${halo}`, draw: () => rasterize(p, color, halo) });
    // Zenith STAMP: the full coin (disc + ring + glyph) baked as one image, so the
    // stamp draws as a single overlap-stacking unit, on the spec's disc fill.
    jobs.push({ id: `${ZENITH_GLYPH_PREFIX}${p}`, ratio: RATIO, inputs: `${color}|${discFill}`, draw: () => rasterizeZenith(p, color, discFill) });
    // Nadir STAMP: the diamond variant, same fill/ring, for the antipodal point.
    jobs.push({ id: `${NADIR_GLYPH_PREFIX}${p}`, ratio: RATIO, inputs: `${color}|${discFill}`, draw: () => rasterizeNadir(p, color, discFill) });
  }
  // The star-line spark, in the star lines' own colour (MapInks.star; STAR_LINE_COLORS for a
  // built-in theme).
  jobs.push({ id: STAR_MARK_IMAGE, ratio: STAR_RATIO, inputs: `${spec.star}|${halo}`, draw: () => rasterizeStarMark(spec.star, halo) });
  // Catalog minor-body coins, on the same disc fill as the planets' stamps: one per palette slot
  // (solid and hollow), and one per body with a symbol of its own, in the slot colour its lines
  // are drawn in.
  minor.forEach((color, slot) => {
    const inputs = `${color}|${discFill}`;
    jobs.push({ id: `${MINOR_COIN_PREFIX}${slot}`, ratio: RATIO, inputs, draw: () => rasterizeMinorCoin(color, discFill, undefined) });
    jobs.push({ id: `${MINOR_HOLLOW_COIN_PREFIX}${slot}`, ratio: RATIO, inputs, draw: () => rasterizeMinorCoin(color, discFill, undefined, true) });
  });
  for (const [n, glyph] of MINOR_GLYPHS) {
    const color = minor[minorPaletteSlot(n)] ?? minor[0];
    jobs.push({
      id: `${MINOR_GLYPH_PREFIX}${n}`,
      ratio: RATIO,
      inputs: `${color}|${discFill}`,
      draw: () => rasterizeMinorCoin(color, discFill, glyph),
    });
  }
  return jobs;
}

/** The ids of the sprites whose inputs differ between two specs — what a live re-bake from
 *  `from` to `to` redraws. */
export function changedSpriteIds(from: SpriteSpec, to: SpriteSpec): string[] {
  const before = new Map(spriteJobs(from).map((j) => [j.id, j.inputs]));
  return spriteJobs(to)
    .filter((j) => before.get(j.id) !== j.inputs)
    .map((j) => j.id);
}

function bakeAll(map: MlMap, spec: SpriteSpec, inPlace: boolean): void {
  const put = putter(map, inPlace);
  for (const j of spriteJobs(spec)) put(j.id, j.draw(), j.ratio);
}

// In place, only the sprites whose inputs moved from `from` (what the map is baked from) to `to`.
function bakeChanged(map: MlMap, from: SpriteSpec, to: SpriteSpec): void {
  const put = putter(map, true);
  const before = new Map(spriteJobs(from).map((j) => [j.id, j.inputs]));
  for (const j of spriteJobs(to)) {
    if (before.get(j.id) !== j.inputs) put(j.id, j.draw(), j.ratio);
  }
}
