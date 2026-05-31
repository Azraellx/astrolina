// Post-load adjustments to the remote vector basemap: global road / river layer
// visibility toggles. We mutate the already-loaded style's layers rather than
// shipping custom style JSON, so it tracks whatever OpenFreeMap serves.
import type { Map as MlMap, LayerSpecification } from 'maplibre-gl';

const ROAD_RE = /(highway|motorway|trunk|primary|secondary|street|road|transport|bridge|tunnel)/i;
const RIVER_RE = /(waterway|river|stream|canal)/i;

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

export interface DetailToggles {
  showRoads: boolean;
  showRivers: boolean;
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
    }
  }
}

