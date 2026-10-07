// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Post-load adjustments to the remote vector basemap: global road / river layer
// visibility toggles, a whole-basemap blank (Local Space ▸ "Hide map"), and the
// palette's paint over the served style (applyBasemapPaint: Dark's place-name contrast
// lift, and a Custom theme's land, water, borders, roads, buildings and names). We mutate
// the already-loaded style's layers rather than shipping custom style JSON, so it tracks
// whatever OpenFreeMap serves.
import type { Map as MlMap, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import type { MapStyle } from '../../lib/themePalette';

const ROAD_RE = /(highway|motorway|trunk|primary|secondary|street|road|transport|bridge|tunnel)/i;
const RIVER_RE = /(waterway|river|stream|canal)/i;
// Place / POI / water-name label layers — the basemap text that competes with the
// chart lines. (Road-name labels are source-layer transportation_name, so they
// toggle with Roads, not here.)
const LABEL_SOURCE_LAYERS = new Set([
  'place',
  'poi',
  'water_name',
  'mountain_peak',
  'aerodrome_label',
  'housenumber',
]);

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    /* layer may not support the property; ignore */
  }
}

function sourceLayer(l: LayerSpecification): string {
  return (l as { 'source-layer'?: string })['source-layer'] ?? '';
}

function isRoadLayer(l: LayerSpecification): boolean {
  const sl = sourceLayer(l);
  return (
    sl === 'transportation' ||
    sl === 'transportation_name' ||
    ROAD_RE.test(l.id)
  );
}

function isRiverLayer(l: LayerSpecification): boolean {
  const sl = sourceLayer(l);
  return sl === 'waterway' || RIVER_RE.test(l.id);
}

function isLabelLayer(l: LayerSpecification): boolean {
  return l.type === 'symbol' && LABEL_SOURCE_LAYERS.has(sourceLayer(l));
}

// The offline coastline fallback's source (Map.tsx installWorldFallback): the one
// GeoJSON source that is basemap ground rather than chart.
export const WORLD_FALLBACK_SOURCE = 'world-fallback';

/** Whether a source is the CHART's own rather than the basemap's: the chart draws only
 *  from GeoJSON sources the app adds itself, so "geojson" covers it — less the offline
 *  coastline, which rides a geojson source but is ground, so it's picked out by name.
 *  The one split between the two: the basemap toggles below read it through
 *  isBasemapLayer, and applyBasemapPaint and Map.tsx's chartSourcesBusy read it directly. */
export function isChartSource(id: string, type: string | undefined): boolean {
  return type === 'geojson' && id !== WORLD_FALLBACK_SOURCE;
}

// Whether a layer is part of the basemap GROUND (as opposed to the chart's own
// linework): the style's `background`, and every layer on a source that isn't the
// chart's — vector/raster tiles and the offline coastline. That covers the whole served
// basemap for any style, without naming its layers.
function isBasemapLayer(
  l: LayerSpecification,
  sources: StyleSpecification['sources'],
): boolean {
  if (l.type === 'background') return true;
  const src = (l as { source?: string }).source;
  if (!src) return false;
  return !isChartSource(src, sources[src]?.type);
}

// The layers blanked by `hideBasemap`, per map instance. Only these are restored
// when the toggle lifts, so layers the STYLE itself ships hidden stay hidden.
const hiddenBasemapLayers = new WeakMap<MlMap, Set<string>>();

export interface DetailToggles {
  showRoads: boolean;
  showRivers: boolean;
  showLabels: boolean;
  /** Blank EVERY basemap layer, leaving the GL canvas transparent behind the chart
   *  linework (Local Space ▸ "Hide map"). Overrides the per-detail toggles above. */
  hideBasemap?: boolean;
}

// Show/hide road and river layers across any theme. Rivers are checked first so
// a waterway never gets swept up by the broader road match. Applied last (after
// any recolor) so the toggles always win. `hideBasemap` trumps the lot: it blanks
// every ground layer (recording which were visible), and lifting it restores
// exactly those before the per-detail toggles reassert themselves.
export function applyDetailToggles(map: MlMap, t: DetailToggles): void {
  // Needs only a PARSED style — setLayoutProperty works fine while tiles/sources
  // are still streaming. (map.isStyleLoaded() is the WRONG readiness probe for
  // callers to gate on: it also reports false during ordinary tile/source churn,
  // which would silently drop a toggle.) Pre-parse there is nothing to touch, and
  // the map's load handler re-applies the current toggles once the style lands.
  let style: StyleSpecification | undefined;
  try {
    style = map.getStyle();
  } catch {
    return;
  }
  if (!style) return;
  const sources = style.sources ?? {};
  let hidden = hiddenBasemapLayers.get(map);
  for (const l of style.layers ?? []) {
    // Never touch the chart's own (geojson) layers — their visibility is data-driven.
    if (!isBasemapLayer(l, sources)) continue;
    if (t.hideBasemap) {
      const vis =
        (l.layout as { visibility?: string } | undefined)?.visibility ?? 'visible';
      if (vis !== 'none') {
        (hidden ??= new Set()).add(l.id);
        safe(() => map.setLayoutProperty(l.id, 'visibility', 'none'));
      }
      continue;
    }
    if (hidden?.has(l.id)) {
      safe(() => map.setLayoutProperty(l.id, 'visibility', 'visible'));
    }
    if (isRiverLayer(l)) {
      safe(() =>
        map.setLayoutProperty(l.id, 'visibility', t.showRivers ? 'visible' : 'none'),
      );
    } else if (isRoadLayer(l)) {
      safe(() =>
        map.setLayoutProperty(l.id, 'visibility', t.showRoads ? 'visible' : 'none'),
      );
    } else if (isLabelLayer(l)) {
      safe(() =>
        map.setLayoutProperty(l.id, 'visibility', t.showLabels ? 'visible' : 'none'),
      );
    }
  }
  if (t.hideBasemap) {
    if (hidden) hiddenBasemapLayers.set(map, hidden);
  } else {
    hiddenBasemapLayers.delete(map);
  }
}

// ── The palette's paint over the served basemap ──────────────────────────────────────────────
// MapStyle.basemapPaint: one colour (or setting) per KIND of basemap layer, each null for "the
// style's own" (2026-10-06). It replaced applyLabelContrast, which painted Dark's place names
// and could never put them back — harmless while the only caller was a fresh style, fatal once a
// palette edited live can set a colour and then clear it. So the first write to any property
// snapshots the style's own value, and a null puts that back. Dark's place-name lift
// (lib/theme LABEL_CONTRAST) is now simply the built-in of the label tokens, painted through the
// same writes in the same order as before.
//
// Layers are told apart by SOURCE-LAYER, the OpenMapTiles schema all three served styles share,
// rather than by id, which each style names its own way. Only basemap layers are touched (the
// split isBasemapLayer makes, through isChartSource: never the chart's), and only on the live
// vector style — the offline / Outline style is the app's own and is painted from
// MapStyle.worldFallback (Map.tsx), its `background` being the ocean there, not the land.
type BasemapPaint = MapStyle['basemapPaint'];
type PaintSlot = Exclude<keyof BasemapPaint, 'landcover'>;
// Each kind's paint properties by layer type, and the slot each one takes.
const COLOUR: Readonly<Record<string, Readonly<Partial<Record<string, readonly [string, PaintSlot][]>>>>> = {
  // The ground itself. The style's `background` IS the land on a vector basemap: water,
  // landcover and the rest are drawn on top of it.
  '': { background: [['background-color', 'land']] },
  water: { fill: [['fill-color', 'water']], line: [['line-color', 'water']] },
  waterway: { line: [['line-color', 'waterway']] },
  boundary: { line: [['line-color', 'border']] },
  transportation: { line: [['line-color', 'road']], fill: [['fill-color', 'road']] },
  building: { fill: [['fill-color', 'building']], 'fill-extrusion': [['fill-extrusion-color', 'building']] },
  // Place names only — country / state / city / town, the labels people read to orient — as
  // Dark's lift always was: POI, water and road names keep the style's own quieter paint. The
  // constant colour deliberately replaces the style's per-class expressions: size and weight
  // still carry the settlement hierarchy.
  place: {
    symbol: [
      ['text-color', 'label'],
      ['text-halo-color', 'labelHalo'],
      ['text-halo-width', 'labelHaloWidth'],
    ],
  },
};
// The patchwork over the land (woods, farmland, parks): `landcover: 'flat'` fades it out so a
// land colour reads as one sheet. Opacity, not visibility, so the detail toggles and the
// whole-basemap blank above (which own visibility, and restore exactly what they hid) never
// meet a layer this has hidden.
const LANDCOVER_SOURCE_LAYERS = new Set(['landcover', 'landuse', 'park']);
const LANDCOVER_FADE: Readonly<Partial<Record<string, string>>> = { fill: 'fill-opacity', line: 'line-opacity' };

// Per map: each property this has written ("layer\0prop") → the style's own value before the
// first write. Dropped by forgetBasemapPaint when a new style lands — its layers are new.
const basemapPaintOriginals = new WeakMap<MlMap, Map<string, unknown>>();

/** A new style has landed on `map`: whatever applyBasemapPaint wrote went with the old one. */
export function forgetBasemapPaint(map: MlMap): void {
  basemapPaintOriginals.delete(map);
}

/**
 * Paint the served basemap from `paint`: every non-null slot is written to its kind of layer,
 * every null slot puts back the style's own value where an earlier call changed it. Call after
 * each style load (with forgetBasemapPaint first) and on a live palette change. Reached through
 * the layer list rather than getStyle(), which would serialize every chart source's GeoJSON on
 * every repaint of a colour drag. setPaintProperty skips a value equal to the current one, so an
 * unchanged slot costs nothing; needs only a parsed style, like the toggles above.
 */
export function applyBasemapPaint(map: MlMap, paint: BasemapPaint): void {
  let ids: string[];
  try {
    ids = map.getLayersOrder();
  } catch {
    return;
  }
  let originals = basemapPaintOriginals.get(map);
  const write = (id: string, prop: string, want: unknown) => {
    const key = `${id}\u0000${prop}`;
    if (want === null || want === undefined) {
      if (!originals?.has(key)) return;
      const own = originals.get(key);
      originals.delete(key);
      safe(() => map.setPaintProperty(id, prop, own === undefined ? null : own));
      return;
    }
    if (!originals) basemapPaintOriginals.set(map, (originals = new Map()));
    if (!originals.has(key)) {
      let own: unknown;
      try {
        own = map.getPaintProperty(id, prop);
      } catch {
        return;
      }
      // A copy: the value is the style's own object, and must still be what it was when it is
      // put back.
      originals.set(key, own === undefined ? undefined : JSON.parse(JSON.stringify(own)));
    }
    safe(() => map.setPaintProperty(id, prop, want));
  };
  for (const id of ids) {
    const l = map.getLayer(id);
    if (!l) continue;
    const type = l.type as string;
    if (type !== 'background') {
      if (!l.source) continue;
      if (isChartSource(l.source, map.getSource(l.source)?.type)) continue;
    }
    const sl = type === 'background' ? '' : (l.sourceLayer ?? '');
    for (const [prop, slot] of COLOUR[sl]?.[type] ?? []) write(id, prop, paint[slot]);
    const fade = LANDCOVER_SOURCE_LAYERS.has(sl) ? LANDCOVER_FADE[type] : undefined;
    if (fade) write(id, fade, paint.landcover === 'flat' ? 0 : null);
  }
}

