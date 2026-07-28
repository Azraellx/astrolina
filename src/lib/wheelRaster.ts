// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

/* Turning a live chart-wheel SVG into pixels.
 *
 * Two things make this harder than serializing the markup, and both are why
 * this file exists rather than each caller solving it again:
 *
 *  1. The wheel is coloured through CSS — classes and custom properties — and a
 *     serialized SVG loaded as an <img> is a separate document with no
 *     stylesheet and no :root to resolve `var()` against. Everything would come
 *     out black. So the clone carries every relevant computed value inline.
 *
 *  2. The glyphs are drawn in a bundled symbol font, and an <img>-loaded SVG
 *     may not use the parent document's fonts. Rather than embedding the font,
 *     the glyph <text> nodes are dropped from the clone and re-stamped onto the
 *     canvas afterwards with fillText, which uses the page's own fonts.
 */

/** The properties that actually decide how the wheel looks. Copying every
 *  computed property instead would balloon the serialized string by roughly two
 *  orders of magnitude for no visual gain. */
const WHEEL_STYLE_PROPS = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity',
  'stroke-dasharray', 'stroke-linejoin', 'stroke-linecap', 'opacity', 'color',
  'font-size', 'font-weight', 'font-style', 'font-family', 'letter-spacing',
  'text-anchor', 'dominant-baseline', 'paint-order', 'visibility',
] as const;

/** The class marking a symbol-font glyph. Those nodes are stripped from the
 *  clone and stamped separately. */
export const GLYPH_CLASS = 'astro-glyph';

/** U+FE0E, the text-presentation variation selector. Some glyph strings carry
 *  it to ask for the monochrome form; the live DOM honours it, but fillText
 *  renders it as a blank box, so it comes off before stamping. Named rather
 *  than written literally — an invisible character in source is one stray
 *  keystroke away from vanishing unnoticed. */
const VARIATION_SELECTOR = new RegExp(String.fromCharCode(0xfe0e), 'g');

/** Clone an SVG with its computed styling baked in and its glyph text removed —
 *  ready to serialize into something an <img> can render faithfully.
 *
 *  Walking both trees in parallel relies on cloneNode preserving document order,
 *  which it does; it is far cheaper than matching elements by any kind of id. */
export function cloneWithInlineStyles(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const liveEls = [svg, ...svg.querySelectorAll('*')];
  const cloneEls = [clone, ...clone.querySelectorAll('*')];
  const n = Math.min(liveEls.length, cloneEls.length);
  for (let i = 0; i < n; i++) {
    const cs = getComputedStyle(liveEls[i]);
    const st = (cloneEls[i] as SVGElement).style;
    for (const pr of WHEEL_STYLE_PROPS) st.setProperty(pr, cs.getPropertyValue(pr));
  }
  clone.querySelectorAll(`.${GLYPH_CLASS}`).forEach((g) => g.remove());
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return clone;
}

/** Serialize a prepared clone and decode it as an image. Resolves to null on
 *  failure rather than throwing: a caller compositing several layers would
 *  rather lose one than lose the whole frame. */
export async function svgToImage(
  clone: SVGSVGElement,
  width: number,
  height: number,
): Promise<HTMLImageElement | null> {
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  const str = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  await new Promise<void>((resolve) => {
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
  });
  return img.width > 0 ? img : null;
}

/** Make sure the symbol font is resident before any glyph is stamped. Without
 *  this the first stamp on a cold page silently falls back to a font that has
 *  no astrological symbols in it. */
export async function ensureGlyphFont(): Promise<void> {
  try {
    await document.fonts.ready;
    await document.fonts.load('16px "Noto Sans Symbols"', '☉');
  } catch {
    /* font API unavailable — fillText uses whatever is loaded */
  }
}

/** Draw one glyph element onto a canvas at a position the caller computes.
 *  Shared so the baseline correction lives in one place: with the alphabetic
 *  baseline the ink spans [y − ascent, y + descent], so the pen has to shift by
 *  half their difference for the ink to land on the intended centre. */
export function stampGlyph(
  ctx: CanvasRenderingContext2D,
  el: Element,
  centre: { x: number; y: number },
  scale: number,
): void {
  const char = (el.textContent ?? '').replace(VARIATION_SELECTOR, '');
  if (!char) return;
  const cs = getComputedStyle(el);
  const px = parseFloat(cs.fontSize) || 11;
  ctx.font = `${px * scale}px "Noto Sans Symbols", sans-serif`;
  // SVG text carries its colour in `fill`; an HTML span carries it in `color`.
  ctx.fillStyle = el.namespaceURI === 'http://www.w3.org/2000/svg' ? cs.fill : cs.color;
  const m = ctx.measureText(char);
  const asc = m.actualBoundingBoxAscent;
  const desc = m.actualBoundingBoxDescent;
  const y =
    Number.isFinite(asc) && Number.isFinite(desc) ? centre.y + (asc - desc) / 2 : centre.y;
  ctx.fillText(char, centre.x, y);
}

/** Rasterize a STANDALONE wheel — one that is not being composited into a
 *  larger frame — at `scale` times its layout size.
 *
 *  Simpler than the compositing case because the wheel is the whole picture:
 *  every coordinate is relative to the SVG's own box, so no frame offsets enter
 *  the arithmetic and the glyphs can be placed from their own bounding boxes. */
export async function rasterizeWheelSvg(
  svg: SVGSVGElement,
  opts: { scale: number; background?: string | null },
): Promise<HTMLCanvasElement | null> {
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(rect.width * opts.scale);
  canvas.height = Math.round(rect.height * opts.scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Take the glyph list from the LIVE element: the clone has had them removed.
  const glyphs = [...svg.querySelectorAll(`.${GLYPH_CLASS}`)];
  // Serialize at the CANVAS size rather than the layout size. The clone keeps its
  // viewBox, so a wider serialization scales the whole coordinate system uniformly and
  // the drawing is rasterized once at the size it will occupy. Decoding at layout size
  // and enlarging on draw would leave the sharpness to whether the browser re-rasterizes
  // an SVG <img> at the destination size — behaviour that has varied between engines.
  const img = await svgToImage(cloneWithInlineStyles(svg), canvas.width, canvas.height);
  if (img) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  await ensureGlyphFont();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const g of glyphs) {
    const gr = g.getBoundingClientRect();
    if (gr.width <= 0 || gr.height <= 0) continue;
    stampGlyph(
      ctx,
      g,
      {
        x: (gr.left + gr.width / 2 - rect.left) * opts.scale,
        y: (gr.top + gr.height / 2 - rect.top) * opts.scale,
      },
      opts.scale,
    );
  }
  return canvas;
}
