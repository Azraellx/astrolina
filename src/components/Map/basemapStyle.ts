// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Post-load adjustments to the remote vector basemap: global road / river layer
// visibility toggles, a whole-basemap blank (Local Space ▸ "Hide map"), and a
// per-theme place-name contrast lift. We mutate the already-loaded style's layers
// rather than shipping custom style JSON, so it tracks whatever OpenFreeMap serves.
import type { Map as MlMap, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { LABEL_CONTRAST, type Theme } from '../../lib/theme';

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
 *  isBasemapLayer, and Map.tsx's chartSourcesBusy reads it directly. */
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

/** Lift the basemap's PLACE-NAME contrast where the theme asks for it
 *  (lib/theme LABEL_CONTRAST; currently the dark style, whose dim slate names
 *  are hard to read on the near-black ground). Only the `place` source-layer —
 *  country/state/city/town names, the labels people read to orient — is
 *  touched; POI / water / housenumber keep the style's own quieter paint. The
 *  constant color deliberately replaces the style's per-class expressions:
 *  size and weight still carry the settlement hierarchy. Call after each style
 *  load (setPaintProperty needs only a parsed style, like the toggles above). */
export function applyLabelContrast(map: MlMap, theme: Theme): void {
  const c = LABEL_CONTRAST[theme];
  if (!c) return;
  let style: StyleSpecification | undefined;
  try {
    style = map.getStyle();
  } catch {
    return;
  }
  if (!style) return;
  const sources = style.sources ?? {};
  for (const l of style.layers ?? []) {
    if (l.type !== 'symbol' || sourceLayer(l) !== 'place') continue;
    if (!isBasemapLayer(l, sources)) continue;
    safe(() => map.setPaintProperty(l.id, 'text-color', c.color));
    safe(() => map.setPaintProperty(l.id, 'text-halo-color', c.halo));
    safe(() => map.setPaintProperty(l.id, 'text-halo-width', c.haloWidth));
  }
}

