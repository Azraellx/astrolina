// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Every paint and layout value of the chart's own layers that a palette decides (2026-10-06,
// for the Custom theme), in ONE table that both paths read: setupCustomLayers writes it into
// each layer as the layer is added (bindLayer), and a live palette change writes only the rows
// whose value moved (applyMapStyle). Two copies of these values — one in the layer
// definitions, one in a repaint routine — would agree on the day they were written and drift
// apart on the first edit to either; with one table there is nothing to drift. Map.tsx's
// layer definitions therefore carry none of the properties listed here (bindLayer asserts it
// in development), and every value below reads MapStyle, whose built-in for each theme is the
// set of literals those definitions held before (lib/themePalette LINE_STYLE_BUILTIN;
// verify:theme-palette §8 checks the built-in against those literals as they stood).
//
// Per-line-type values inside one layer are expressions over `lineType`, as they always were.
// `line-dasharray` could be one too — it has taken data-driven expressions (of literal arrays)
// since maplibre-gl 5.8 — but no layer needs it today: every layer here draws one dash, and the
// overlay node pairs use the meridian dash on every angle, as they did before MapStyle. A dash,
// or any data-driven value, set through setPaintProperty re-tiles that layer's source, which
// is why the map is handed a THROTTLED MapStyle (App) and repaints from that alone — or from the
// editor's preview over it, throttled the same way (the map preview, at the end of this file).
import type { ExpressionSpecification, LayerSpecification, Map as MlMap } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import type { MapStyle, ResolvedPalette } from '../../lib/themePalette';
import type { MapInks } from '../../lib/lineInks';

export interface LayerBinding {
  /** The chart layer's id (setupCustomLayers). */
  readonly layer: string;
  /** The paint (or, with `layout`, layout) property. */
  readonly prop: string;
  readonly layout?: true;
  /** The value for a style. Arrays and expressions are built fresh on every call: MapStyle
   *  is frozen, and a layer must never be handed one of its arrays to hold. */
  value(s: MapStyle): unknown;
}

const expr = (e: unknown) => e as ExpressionSpecification;
const LT = ['get', 'lineType'];
const dash = (d: readonly number[]) => [...d];

// The width expressions the layers have always used, with MapStyle's widths in them.
/** Meridians: MC, else IC. */
const meridianWidth = (mc: number, ic: number) => expr(['case', ['==', LT, 'MC'], mc, ic]);
/** Horizon layers: the Vertex axis, else ASC/DSC. */
const horizonWidth = (vx: number, horizon: number) =>
  expr(['case', ['in', LT, ['literal', ['VX', 'AVX']]], vx, horizon]);
/** The overlay node pairs, one layer for every angle (a Vertex pair takes the horizon width,
 *  as it always has). */
const pairWidth = (mc: number, ic: number, horizon: number) =>
  expr(['case', ['==', LT, 'MC'], mc, ['==', LT, 'IC'], ic, horizon]);
/** The chart's merged node pair: one line, North Node's colour to its midpoint, South Node's
 *  after (needs the source's lineMetrics). */
const nodeGradient = (nn: string, sn: string) => expr(['step', ['line-progress'], nn, 0.5, sn]);
const visible = (on: boolean) => (on ? 'visible' : 'none');
/** The orb bands carry their opacity per feature; the strength scales it, capped at opaque.
 *  At 1 the expression is the bare read the layer always had. */
const orbOpacity = (k: number) =>
  expr(k === 1 ? ['get', 'opacity'] : ['min', 1, ['*', ['get', 'opacity'], k]]);

const paint = (layer: string, prop: string, value: (s: MapStyle) => unknown): LayerBinding => ({ layer, prop, value });
const layout = (layer: string, prop: string, value: (s: MapStyle) => unknown): LayerBinding => ({
  layer,
  prop,
  layout: true,
  value,
});
const each = (layers: readonly string[], make: (layer: string) => LayerBinding[]) => layers.flatMap(make);

// The arrows riding the angle lines (rising →, setting ←): the planets' and the catalog
// bodies', chart and overlay. Not the local-space arrows, which have their own switch (Local
// Space ▸ Hide line arrows, applyLsArrowVisibility) and are not angle lines.
const ANGLE_ARROW_LAYERS = [
  'acg-lines-arrows-asc',
  'acg-lines-arrows-dsc',
  'acg-lines-ov-arrows-asc',
  'acg-lines-ov-arrows-dsc',
  'minor-lines-arrows-asc',
  'minor-lines-arrows-dsc',
  'minor-lines-ov-arrows-asc',
  'minor-lines-ov-arrows-dsc',
] as const;
// The coins' hover bloom behind every zenith stamp and catalog coin.
const ZENITH_DISC_LAYERS = ['minor-zenith-disc', 'minor-zenith-ov-disc', 'acg-zenith-ov-disc', 'acg-zenith-disc'] as const;
const GEO_GRID_LINE_LAYERS = ['geo-grid-mc-layer', 'geo-grid-asc-layer'] as const;

/** The table. In the order the layers are stacked, for whoever reads it beside Map.tsx. */
export const LAYER_BINDINGS: readonly LayerBinding[] = Object.freeze([
  paint('orb-bands-layer', 'fill-opacity', (s) => orbOpacity(s.orbStrength)),

  paint('ecliptic-layer', 'line-color', (s) => s.ecliptic.color),
  paint('ecliptic-layer', 'line-width', (s) => s.ecliptic.width),
  paint('ecliptic-layer', 'line-opacity', (s) => s.ecliptic.opacity),
  paint('ecliptic-ov-layer', 'line-color', (s) => s.ecliptic.color),
  paint('ecliptic-ov-layer', 'line-width', (s) => s.ecliptic.width),
  paint('ecliptic-ov-layer', 'line-opacity', (s) => s.ecliptic.opacity),
  paint('ecliptic-ov-layer', 'line-dasharray', (s) => dash(s.ecliptic.overlayDash)),

  paint('eclipse-isoline-labels', 'text-halo-color', (s) => s.eclipseHalo.color),
  paint('eclipse-isoline-labels', 'text-halo-width', (s) => s.eclipseHalo.width),

  paint('minor-parans-layer', 'line-width', (s) => s.minorParan.width),
  paint('parans-layer', 'line-width', (s) => s.paran.width),

  paint('local-space-layer-out', 'line-width', (s) => s.localSpace.width),
  paint('local-space-layer-in', 'line-width', (s) => s.localSpace.width),
  paint('local-space-layer-in', 'line-dasharray', (s) => dash(s.localSpace.inboundDash)),

  paint('angle-lines-layer', 'line-width', (s) => s.aspect.width),
  paint('angle-lines-layer', 'line-dasharray', (s) => dash(s.aspect.dash)),

  paint('star-lines-layer', 'line-width', (s) => s.star.width),
  paint('star-lines-layer', 'line-opacity', (s) => s.star.opacity),
  paint('star-lines-layer', 'line-dasharray', (s) => dash(s.star.dash)),
  layout('star-lines-marks', 'visibility', (s) => visible(s.starSparks)),

  paint('minor-lines-layer', 'line-width', (s) =>
    expr([
      'case',
      ['==', LT, 'MC'],
      s.minor.mcWidth,
      ['in', LT, ['literal', ['ASC', 'DSC']]],
      s.minor.horizonWidth,
      ['==', LT, 'IC'],
      s.minor.icWidth,
      s.minor.vxWidth, // VX / AVX
    ]),
  ),
  layout('minor-lines-marks', 'visibility', (s) => visible(s.minorBeads)),

  paint('acg-lines-meridian', 'line-width', (s) => meridianWidth(s.natal.mcWidth, s.natal.icWidth)),
  paint('acg-lines-horizon', 'line-width', (s) => horizonWidth(s.natal.vxWidth, s.natal.horizonWidth)),
  paint('acg-lines-meridian-pair', 'line-gradient', (s) => nodeGradient(s.nodePair.nn, s.nodePair.sn)),
  paint('acg-lines-meridian-pair', 'line-width', (s) => meridianWidth(s.natal.mcWidth, s.natal.icWidth)),
  paint('acg-lines-horizon-pair', 'line-gradient', (s) => nodeGradient(s.nodePair.nn, s.nodePair.sn)),
  paint('acg-lines-horizon-pair', 'line-width', (s) => horizonWidth(s.natal.vxWidth, s.natal.horizonWidth)),

  paint('local-space-ov-layer', 'line-width', (s) => s.localSpace.overlayWidth),
  paint('local-space-ov-layer', 'line-dasharray', (s) => dash(s.localSpace.overlayDash)),

  paint('minor-parans-ov-layer', 'line-width', (s) => s.minorParan.width),
  paint('minor-parans-ov-layer', 'line-dasharray', (s) => dash(s.minorParan.overlayDash)),
  paint('parans-ov-layer', 'line-width', (s) => s.paran.width),
  paint('parans-ov-layer', 'line-dasharray', (s) => dash(s.paran.overlayDash)),

  paint('minor-lines-ov-meridian', 'line-width', (s) => meridianWidth(s.minor.mcWidth, s.minor.icWidth)),
  paint('minor-lines-ov-meridian', 'line-dasharray', (s) => dash(s.minor.overlayMeridianDash)),
  paint('minor-lines-ov-horizon', 'line-width', (s) => s.minor.horizonWidth),
  paint('minor-lines-ov-horizon', 'line-dasharray', (s) => dash(s.minor.overlayHorizonDash)),
  paint('minor-lines-ov-arrows-asc', 'text-opacity', (s) => s.minor.overlayMarkOpacity),
  paint('minor-lines-ov-arrows-dsc', 'text-opacity', (s) => s.minor.overlayMarkOpacity),
  paint('minor-lines-ov-marks', 'icon-opacity', (s) => s.minor.overlayMarkOpacity),
  layout('minor-lines-ov-marks', 'visibility', (s) => visible(s.minorBeads)),

  paint('acg-lines-ov-meridian', 'line-width', (s) => meridianWidth(s.overlay.mcWidth, s.overlay.icWidth)),
  paint('acg-lines-ov-meridian', 'line-dasharray', (s) => dash(s.overlay.meridianDash)),
  paint('acg-lines-ov-horizon', 'line-width', (s) => horizonWidth(s.overlay.vxWidth, s.overlay.horizonWidth)),
  paint('acg-lines-ov-horizon', 'line-dasharray', (s) => dash(s.overlay.horizonDash)),
  paint('acg-lines-ov-pair-nn', 'line-color', (s) => s.overlayNodePair.nn),
  paint('acg-lines-ov-pair-nn', 'line-width', (s) =>
    pairWidth(s.overlay.mcWidth, s.overlay.icWidth, s.overlay.horizonWidth),
  ),
  paint('acg-lines-ov-pair-nn', 'line-dasharray', (s) => dash(s.overlayNodePair.nnDash)),
  paint('acg-lines-ov-pair-sn', 'line-color', (s) => s.overlayNodePair.sn),
  paint('acg-lines-ov-pair-sn', 'line-width', (s) =>
    pairWidth(s.overlay.mcWidth, s.overlay.icWidth, s.overlay.horizonWidth),
  ),
  // [0, ...nnDash]: the leading 0 offsets these dashes into the North-node layer's gaps.
  paint('acg-lines-ov-pair-sn', 'line-dasharray', (s) => dash(s.overlayNodePair.snDash)),

  ...each(ANGLE_ARROW_LAYERS, (l) => [layout(l, 'visibility', (s) => visible(s.arrows))]),

  paint('acg-ls-cross-layer', 'circle-stroke-color', (s) => s.crossingStroke),

  ...each(ZENITH_DISC_LAYERS, (l) => [paint(l, 'circle-color', (s) => s.zenithDisc)]),
  paint('minor-zenith-ov-layer', 'icon-opacity', (s) => s.minor.overlayMarkOpacity),

  paint('measure-points', 'circle-stroke-color', (s) => s.halo),

  // The Ascendant zone under the cursor, lit in the grid's own ink (feature-state hover).
  paint('geo-asc-zones-layer', 'fill-color', (s) => s.geoGrid.line),
  paint('geo-asc-zones-layer', 'fill-opacity', (s) =>
    expr(['case', ['boolean', ['feature-state', 'hover'], false], s.geoGrid.hover, 0]),
  ),
  ...each(GEO_GRID_LINE_LAYERS, (l) => [
    paint(l, 'line-color', (s) => s.geoGrid.line),
    paint(l, 'line-width', (s) => s.geoGrid.width),
    paint(l, 'line-opacity', (s) => s.geoGrid.opacity),
  ]),
]);

const BY_LAYER = new Map<string, LayerBinding[]>();
for (const b of LAYER_BINDINGS) {
  const list = BY_LAYER.get(b.layer);
  if (list) list.push(b);
  else BY_LAYER.set(b.layer, [b]);
}

/** The layer ids the table binds — for setupCustomLayers' development check that each one is
 *  really added (a binding naming a renamed layer would otherwise just never apply). */
export const BOUND_LAYER_IDS: readonly string[] = Object.freeze([...BY_LAYER.keys()]);

/**
 * `spec` with every bound property written in from `style` — what setupCustomLayers hands to
 * addLayer. A layer the table doesn't bind comes back as it was. In development, a property
 * the definition still carries itself is reported: the table is meant to be its only source.
 */
export function bindLayer<L extends LayerSpecification>(spec: L, style: MapStyle): L {
  const list = BY_LAYER.get(spec.id);
  if (!list) return spec;
  const s = spec as L & { paint?: Record<string, unknown>; layout?: Record<string, unknown> };
  let paintOut: Record<string, unknown> | undefined;
  let layoutOut: Record<string, unknown> | undefined;
  for (const b of list) {
    const own = b.layout ? s.layout : s.paint;
    if (import.meta.env.DEV) {
      console.assert(!own || !(b.prop in own), `layer ${spec.id} defines ${b.prop} itself; LAYER_BINDINGS owns it`);
    }
    if (b.layout) (layoutOut ??= { ...s.layout })[b.prop] = b.value(style);
    else (paintOut ??= { ...s.paint })[b.prop] = b.value(style);
  }
  return { ...spec, ...(paintOut ? { paint: paintOut } : null), ...(layoutOut ? { layout: layoutOut } : null) } as L;
}

/**
 * Repaint the chart's layers from `prev` to `next`: only the bindings whose value differs
 * (compared as JSON, since expressions and dashes are rebuilt on every read), and only on
 * layers that exist. Returns how many it wrote. Throws what MapLibre throws for a style that
 * hasn't loaded — the caller is a live effect that wraps it.
 */
export function applyMapStyle(map: MlMap, prev: MapStyle, next: MapStyle): number {
  if (prev === next) return 0;
  let n = 0;
  for (const b of LAYER_BINDINGS) {
    const want = b.value(next);
    if (JSON.stringify(b.value(prev)) === JSON.stringify(want)) continue;
    if (!map.getLayer(b.layer)) continue;
    if (b.layout) map.setLayoutProperty(b.layer, b.prop, want);
    else map.setPaintProperty(b.layer, b.prop, want);
    n += 1;
  }
  return n;
}

// ── The editor's map preview (2026-10-06) ─────────────────────────────────────────────────────
// While a Custom theme's colour or weight is being DRAGGED, the editor commits nothing until the
// gesture ends (a drag is one storage write and one undo step), and a full commit is far too dear
// to run at input rate: measured at ~350 ms of main thread — the sprites re-baked, every line
// family re-inked and re-pushed, App re-rendered. So the map follows the drag through this path
// instead, a TRANSIENT preview over what is committed: App resolves the editor's draft
// (ThemeEditorContext.preview, throttled) and hands the Map its MapStyle and line inks, and the
// Map paints them — the style through LAYER_BINDINGS above (applyMapStyle, from what is painted to
// the preview's), the line colours through PREVIEW_INK_BINDINGS below: an expression per layer
// that computes each feature's colour in the preview's inks from what the feature already carries
// (its body, its catalog number). Paint only: no source is re-pushed, no sprite re-baked, nothing
// stored, and nothing reaches the line set a plugin reads (collectAllLines, linesStamp, ctx.inks —
// all COMMITTED). verify:theme-palette §9 holds the expressions to the ink chain the commit path
// runs, feature by feature, through MapLibre's own expression engine.
//
// What follows only on the commit, at the gesture's end: every sprite (the glyph labels, the
// zenith and nadir stamps, the catalog coins and beads, the star sparks — a bake is ~90
// canvases), the DOM edge badges and paran chips (placed and coloured by computeBadges from the
// pushed data), and the families whose generators bake their colours into the data
// (PREVIEW_COMMIT_ONLY). A basemap CHOICE — another map, or Outline — is a new style, so it lands
// on commit too; a preview on another basemap than the one drawn (hold to compare from an Outline
// theme, say) repaints the chart's own layers and leaves the drawn basemap's paint as committed.

/** What App hands the Map while the editor previews a draft: the draft's style, and its line
 *  inks — null when the drawn lines already carry them (the layers then read their own `color`). */
export interface MapPreview {
  readonly style: MapStyle;
  readonly inks: MapInks | null;
}

/**
 * The preview the Map needs for `draft` over what it draws now (`drawnStyle`, and the lines as
 * pushed, in `drawnInks`), or null when the draft would change nothing. Compared by KEY (the
 * engine's content hash; a built-in's is its name), so a draft equal to what has landed — the
 * commit arriving behind a drag — is no preview at all, and the line colours go back to the data.
 */
export function mapPreviewFor(
  draft: ResolvedPalette | null,
  drawnStyle: MapStyle,
  drawnInks: MapInks,
): MapPreview | null {
  if (!draft) return null;
  const inks = draft.inks.key === drawnInks.key ? null : draft.inks;
  if (!inks && draft.map.key === drawnStyle.key) return null;
  return { style: draft.map, inks };
}

/** Which ink rule a layer's features take — the family function App's chain runs on that
 *  layer's source (lib/lineInks), restated as an expression. */
export type PreviewInkFamily =
  /** withLineInks: `inks.planet[planet]`. */
  | 'planet'
  /** inkAspectLines: the one aspect ink, else the planet's. */
  | 'aspect'
  /** inkOverlayLines: the one overlay ink, else the planet's. */
  | 'overlay'
  /** withParanInks: a catalog paran keeps its colour, a star paran takes `inks.star`, the rest
   *  `inks.paran[planetA]`. */
  | 'paran'
  /** inkOverlayParans: the one overlay ink, else the paran rule. */
  | 'overlayParan'
  /** withUniformInk(inks.star). */
  | 'star'
  /** withMinorInks: `inks.minorOf(number)`. */
  | 'minor';

export interface PreviewInkBinding {
  readonly layer: string;
  readonly prop: 'line-color' | 'text-color' | 'circle-stroke-color';
  readonly family: PreviewInkFamily;
}

const inkRow = (layer: string, prop: PreviewInkBinding['prop'], family: PreviewInkFamily): PreviewInkBinding => ({
  layer,
  prop,
  family,
});

/** Every chart layer whose colour reads its features' own `color` and can be previewed, with the
 *  family its source is inked as in App (lines and zeniths → withLineInks, angleLines →
 *  inkAspectLines, the overlay bundle's lines and local space → inkOverlayLines, its zeniths →
 *  withLineInks, the catalog's → withMinorInks). verify:theme-palette §9 checks each row against
 *  Map.tsx's own definition, and that every other `['get', 'color']` layer is on
 *  PREVIEW_COMMIT_ONLY with its reason. */
export const PREVIEW_INK_BINDINGS: readonly PreviewInkBinding[] = Object.freeze([
  inkRow('acg-lines-meridian', 'line-color', 'planet'),
  inkRow('acg-lines-horizon', 'line-color', 'planet'),
  inkRow('acg-lines-arrows-asc', 'text-color', 'planet'),
  inkRow('acg-lines-arrows-dsc', 'text-color', 'planet'),
  inkRow('acg-zenith-disc', 'circle-stroke-color', 'planet'),
  inkRow('local-space-layer-out', 'line-color', 'planet'),
  inkRow('local-space-layer-in', 'line-color', 'planet'),
  inkRow('local-space-arrows-out', 'text-color', 'planet'),
  inkRow('local-space-arrows-in', 'text-color', 'planet'),
  inkRow('angle-lines-layer', 'line-color', 'aspect'),
  inkRow('parans-layer', 'line-color', 'paran'),
  inkRow('star-lines-layer', 'line-color', 'star'),
  inkRow('minor-lines-layer', 'line-color', 'minor'),
  inkRow('minor-lines-arrows-asc', 'text-color', 'minor'),
  inkRow('minor-lines-arrows-dsc', 'text-color', 'minor'),
  inkRow('minor-zenith-disc', 'circle-stroke-color', 'minor'),
  inkRow('minor-parans-layer', 'line-color', 'minor'),
  inkRow('acg-lines-ov-meridian', 'line-color', 'overlay'),
  inkRow('acg-lines-ov-horizon', 'line-color', 'overlay'),
  inkRow('acg-lines-ov-arrows-asc', 'text-color', 'overlay'),
  inkRow('acg-lines-ov-arrows-dsc', 'text-color', 'overlay'),
  inkRow('acg-zenith-ov-disc', 'circle-stroke-color', 'planet'),
  inkRow('local-space-ov-layer', 'line-color', 'overlay'),
  inkRow('local-space-ov-arrows-out', 'text-color', 'overlay'),
  inkRow('local-space-ov-arrows-in', 'text-color', 'overlay'),
  inkRow('parans-ov-layer', 'line-color', 'overlayParan'),
  inkRow('minor-lines-ov-meridian', 'line-color', 'minor'),
  inkRow('minor-lines-ov-horizon', 'line-color', 'minor'),
  inkRow('minor-lines-ov-arrows-asc', 'text-color', 'minor'),
  inkRow('minor-lines-ov-arrows-dsc', 'text-color', 'minor'),
  inkRow('minor-zenith-ov-disc', 'circle-stroke-color', 'minor'),
  inkRow('minor-parans-ov-layer', 'line-color', 'minor'),
]);

/** The `['get', 'color']` layers left to the commit, each with its reason: their generators
 *  bake the colour into the data along with geometry of their own. */
export const PREVIEW_COMMIT_ONLY: Readonly<Record<string, string>> = Object.freeze({
  'night-shade-layer': 'the wash is generated in its colour (generateNightShade)',
  'orb-bands-layer': 'each band is built in its line’s colour with the band',
  'eclipse-band-fill': 'buildEclipseMap colours each path by its kind',
  'eclipse-lunar-vis-fill': 'buildEclipseMap colours each path by its kind',
  'eclipse-penumbral': 'buildEclipseMap colours each path by its kind',
  'eclipse-isolines': 'buildEclipseMap colours each path by its kind',
  'eclipse-lunar-horizon': 'buildEclipseMap colours each path by its kind',
  'eclipse-isoline-labels': 'buildEclipseMap colours each path by its kind',
  'eclipse-limits': 'buildEclipseMap colours each path by its kind',
  'eclipse-central': 'buildEclipseMap colours each path by its kind',
  'acg-ls-cross-layer': 'a crossing dot blends two lines’ colours, computed with the crossings',
  'geo-zones-layer': 'the zones are generated in the element colours (App geoZones)',
  'uncertainty-bands-layer': 'each band is generated in its line’s colour with the band',
});

const GET_COLOR_JSON = JSON.stringify(['get', 'color']);
const getColor = () => ['get', 'color'];

/** ['match', ['get', prop], key, colour, …, ['get', 'color']] over a body table. */
function bodyMatch(prop: string, table: Readonly<Record<string, string>>): unknown[] {
  const e: unknown[] = ['match', ['get', prop]];
  for (const [k, c] of Object.entries(table)) e.push(k, c);
  e.push(getColor());
  return e;
}
// withParanInks' order exactly: a catalog paran is left alone, a star paran (`p.star` truthy)
// takes the star ink, and the rest their planetA's paran ink.
const paranExpr = (inks: MapInks): unknown[] => [
  'case',
  ['==', ['get', 'kind'], 'minor'],
  getColor(),
  ['to-boolean', ['get', 'star']],
  inks.star,
  bodyMatch('planetA', inks.paran),
];

/**
 * A preview layer's colour value: `inks` restated as an expression of what each feature carries
 * (its `planet`, `planetA`, `star`, `kind`, `number`), falling back to its own `color` wherever
 * the family's function would leave a feature alone. The fallback reads the COMMITTED colour, so
 * it is exact for a feature the function leaves alone under both palettes — true of everything
 * these layers' sources carry (a catalog paran rides minor-parans, not parans-ov, so no overlay
 * one-ink is ever laid over a feature the paran rule leaves alone). `minorNumbers` are the catalog bodies in the
 * drawn data — a match needs its labels, and minorPaletteSlot is a hash no expression can
 * compute — so a body missing from them keeps its committed colour. With `inks` null, the
 * layer's own `['get', 'color']`, the value its definition carries.
 */
export function previewInkValue(
  family: PreviewInkFamily,
  inks: MapInks | null,
  minorNumbers: readonly number[],
): unknown {
  if (!inks) return getColor();
  switch (family) {
    case 'planet':
      return bodyMatch('planet', inks.planet);
    case 'aspect':
      return inks.aspect ?? bodyMatch('planet', inks.planet);
    case 'overlay':
      return inks.overlay ?? bodyMatch('planet', inks.planet);
    case 'paran':
      return paranExpr(inks);
    case 'overlayParan':
      return inks.overlay ?? paranExpr(inks);
    case 'star':
      return inks.star;
    case 'minor': {
      if (!minorNumbers.length) return getColor();
      const e: unknown[] = ['match', ['get', 'number']];
      for (const n of minorNumbers) e.push(n, inks.minorOf(n));
      e.push(getColor());
      return e;
    }
  }
}

// The catalog numbers in a collection, cached per collection (the data is never mutated).
const NUMBERS = new WeakMap<FeatureCollection, readonly number[]>();
/** The distinct integer `number`s across these collections, ascending — the labels the minor
 *  family's match needs. */
export function minorNumbersIn(fcs: readonly (FeatureCollection | null | undefined)[]): number[] {
  const all = new Set<number>();
  for (const fc of fcs) {
    if (!fc) continue;
    let nums = NUMBERS.get(fc);
    if (!nums) {
      const s = new Set<number>();
      for (const f of fc.features) {
        const n = (f.properties as { number?: unknown } | null)?.number;
        if (typeof n === 'number' && Number.isSafeInteger(n)) s.add(n);
      }
      nums = [...s];
      NUMBERS.set(fc, nums);
    }
    for (const n of nums) all.add(n);
  }
  return [...all].sort((a, b) => a - b);
}

/**
 * Put the preview's line colours on the chart's layers — or, with `inks` null, give every layer
 * back its own `['get', 'color']` — writing only the layers whose value differs from what
 * `applied` records: a data-driven colour re-tiles its source, so nothing is rewritten for
 * nothing. `applied` is the caller's record of what it has written, cleared when a style lands
 * (new layers carry their definitions' values). Paint properties only. Returns how many it wrote.
 */
export function applyPreviewInks(
  map: MlMap,
  inks: MapInks | null,
  minorNumbers: readonly number[],
  applied: Map<string, string>,
): number {
  let n = 0;
  for (const b of PREVIEW_INK_BINDINGS) {
    const key = `${b.layer}|${b.prop}`;
    const want = previewInkValue(b.family, inks, minorNumbers);
    const json = JSON.stringify(want);
    if ((applied.get(key) ?? GET_COLOR_JSON) === json) continue;
    if (!map.getLayer(b.layer)) {
      applied.delete(key);
      continue;
    }
    map.setPaintProperty(b.layer, b.prop, want as ExpressionSpecification);
    if (json === GET_COLOR_JSON) applied.delete(key);
    else applied.set(key, json);
    n += 1;
  }
  return n;
}
