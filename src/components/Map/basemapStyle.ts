// Post-load adjustments to the remote vector basemap: global road / river layer
// visibility toggles. We mutate the already-loaded style's layers rather than
// shipping custom style JSON, so it tracks whatever OpenFreeMap serves.
import type { Map as MlMap, LayerSpecification } from 'maplibre-gl';

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

export interface DetailToggles {
  showRoads: boolean;
  showRivers: boolean;
  showLabels: boolean;
}

// Show/hide road and river layers across any theme. Rivers are checked first so
// a waterway never gets swept up by the broader road match. Applied last (after
// any recolor) so the toggles always win.
export function applyDetailToggles(map: MlMap, t: DetailToggles): void {
  for (const l of map.getStyle().layers ?? []) {
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
}

