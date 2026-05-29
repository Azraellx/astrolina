import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { FeatureCollection, LineString } from 'geojson';
import type { LineProps } from '../../lib/astro/lines';
import type { ParanProps } from '../../lib/astro/parans';
import type { LocalSpaceProps } from '../../lib/astro/localSpace';
import {
  BASEMAP_STYLE_URLS,
  LABEL_HALO_COLORS,
  type Theme,
} from '../../lib/theme';
import 'maplibre-gl/dist/maplibre-gl.css';
import './Map.css';

const EMPTY_FC = <T,>(): FeatureCollection<LineString, T> => ({
  type: 'FeatureCollection',
  features: [],
});

export interface OverlayData {
  lines: FeatureCollection<LineString, LineProps>;
  parans: FeatureCollection<LineString, ParanProps>;
  localSpace: FeatureCollection<LineString, LocalSpaceProps>;
}

interface MapProps {
  lines: FeatureCollection<LineString, LineProps>;
  parans: FeatureCollection<LineString, ParanProps>;
  localSpace: FeatureCollection<LineString, LocalSpaceProps>;
  /** Second, time/relationship overlay rendered dashed + dimmed over the base. */
  overlay?: OverlayData | null;
  pin?: { lat: number; lng: number } | null;
  pinType?: 'custom' | 'natal' | null;
  theme: Theme;
  onHover?: (lat: number, lng: number) => void;
  onLeave?: () => void;
  onClick?: (lat: number, lng: number) => void;
  onPinNatal?: () => void;
}

interface MapData {
  lines: FeatureCollection<LineString, LineProps>;
  parans: FeatureCollection<LineString, ParanProps>;
  localSpace: FeatureCollection<LineString, LocalSpaceProps>;
  overlay?: OverlayData | null;
}

export interface MapHandle {
  /** Recenter the map on a coordinate, easing to a usable zoom if zoomed out. */
  flyTo: (lat: number, lng: number) => void;
}

// Directional arrows chained ALONG a horizon (ASC/DSC) line — '→→→' that follow
// the line's bearing (map rotation, keep-upright off so the true direction is
// preserved). ASC arrows ('→') flow one way along the line and DSC ('←') the
// opposite, so the two are distinguishable without dashes. Tight spacing makes
// them read as one connected arrowed line. `text-ignore-placement` keeps them
// purely decorative so they never suppress the planet labels.
function addHorizonArrows(
  map: maplibregl.Map,
  id: string,
  source: string,
  lineType: 'ASC' | 'DSC',
  glyph: string,
  haloColor: string,
  opacity: number,
) {
  map.addLayer({
    id,
    source,
    type: 'symbol',
    filter: ['==', ['get', 'lineType'], lineType],
    layout: {
      'text-field': glyph,
      'symbol-placement': 'line',
      // Spaced out so the solid base line shows through as the shaft between
      // arrowheads — reads as ———→———→ rather than a dense →→→ run.
      'symbol-spacing': 64,
      'text-size': 15,
      'text-font': ['Noto Sans Regular'],
      'text-rotation-alignment': 'map',
      'text-pitch-alignment': 'map',
      'text-keep-upright': false,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
      'text-padding': 1,
    },
    paint: {
      'text-color': ['get', 'color'],
      'text-opacity': opacity,
      'text-halo-color': haloColor,
      'text-halo-width': 1.2,
      'text-halo-blur': 0.5,
    },
  });
}

function setupCustomLayers(map: maplibregl.Map, haloColor: string) {
  map.addSource('parans', { type: 'geojson', data: EMPTY_FC() });
  map.addLayer({
    id: 'parans-layer',
    source: 'parans',
    type: 'line',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 0.7,
      'line-opacity': 0.45,
    },
  });
  map.addLayer({
    id: 'parans-labels',
    source: 'parans',
    type: 'symbol',
    layout: {
      'text-field': ['get', 'label'],
      'symbol-placement': 'line',
      'symbol-spacing': 320,
      'text-size': 10,
      'text-font': ['Noto Sans Regular'],
      'text-rotation-alignment': 'viewport',
      'text-pitch-alignment': 'viewport',
      'text-keep-upright': true,
      'text-padding': 3,
      'text-letter-spacing': 0.04,
    },
    paint: {
      'text-color': ['get', 'color'],
      'text-halo-color': haloColor,
      'text-halo-width': 2,
      'text-halo-blur': 0.5,
    },
  });

  map.addSource('local-space', { type: 'geojson', data: EMPTY_FC() });
  map.addLayer({
    id: 'local-space-layer',
    source: 'local-space',
    type: 'line',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 1.2,
      'line-opacity': 0.75,
      'line-dasharray': [2, 2],
    },
  });

  map.addSource('acg-lines', { type: 'geojson', data: EMPTY_FC() });
  map.addLayer({
    id: 'acg-lines-meridian',
    source: 'acg-lines',
    type: 'line',
    filter: ['in', ['get', 'lineType'], ['literal', ['MC', 'IC']]],
    paint: {
      'line-color': ['get', 'color'],
      'line-width': [
        'case',
        ['==', ['get', 'lineType'], 'MC'],
        1.9,
        1.0,
      ],
      'line-opacity': [
        'case',
        ['==', ['get', 'lineType'], 'MC'],
        0.95,
        0.7,
      ],
    },
  });
  // Base horizon lines are SOLID (no dashes) — dashes are reserved entirely for
  // overlays now. ASC vs DSC is shown instead by periodic arrows: ASC points up,
  // DSC points down (added just below).
  map.addLayer({
    id: 'acg-lines-horizon',
    source: 'acg-lines',
    type: 'line',
    filter: ['in', ['get', 'lineType'], ['literal', ['ASC', 'DSC']]],
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 1.5,
      'line-opacity': 0.85,
    },
  });
  addHorizonArrows(map, 'acg-lines-arrows-asc', 'acg-lines', 'ASC', '→', haloColor, 1);
  addHorizonArrows(map, 'acg-lines-arrows-dsc', 'acg-lines', 'DSC', '←', haloColor, 1);
  map.addLayer({
    id: 'acg-lines-labels',
    source: 'acg-lines',
    type: 'symbol',
    layout: {
      'text-field': ['get', 'label'],
      'symbol-placement': 'line',
      'symbol-spacing': 280,
      'text-size': 10,
      'text-font': ['Noto Sans Regular'],
      'text-rotation-alignment': 'viewport',
      'text-pitch-alignment': 'viewport',
      'text-keep-upright': true,
      'text-padding': 3,
      'text-letter-spacing': 0.04,
    },
    paint: {
      'text-color': ['get', 'color'],
      'text-halo-color': haloColor,
      'text-halo-width': 2,
      'text-halo-blur': 0.5,
    },
  });

  // ── Overlay slot (-ov): a second set of sources/layers for the timeline
  // overlay (transits / progressed / solar-arc / synastry). Same per-planet
  // colors as the base, but dashed and dimmed so it reads as "derived". Labels
  // carry a baked-in prefix (t/p/d/s) so the text-field expression is unchanged.
  map.addSource('local-space-ov', { type: 'geojson', data: EMPTY_FC() });
  map.addLayer({
    id: 'local-space-ov-layer',
    source: 'local-space-ov',
    type: 'line',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 1.0,
      'line-opacity': 0.6,
      'line-dasharray': [1, 3],
    },
  });

  map.addSource('parans-ov', { type: 'geojson', data: EMPTY_FC() });
  map.addLayer({
    id: 'parans-ov-layer',
    source: 'parans-ov',
    type: 'line',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 0.6,
      'line-opacity': 0.35,
      'line-dasharray': [2, 3],
    },
  });
  map.addLayer({
    id: 'parans-ov-labels',
    source: 'parans-ov',
    type: 'symbol',
    layout: {
      'text-field': ['get', 'label'],
      'symbol-placement': 'line',
      'symbol-spacing': 320,
      'text-size': 9,
      'text-font': ['Noto Sans Regular'],
      'text-rotation-alignment': 'viewport',
      'text-pitch-alignment': 'viewport',
      'text-keep-upright': true,
      'text-padding': 3,
      'text-letter-spacing': 0.04,
    },
    paint: {
      'text-color': ['get', 'color'],
      'text-opacity': 0.8,
      'text-halo-color': haloColor,
      'text-halo-width': 2,
      'text-halo-blur': 0.5,
    },
  });

  map.addSource('acg-lines-ov', { type: 'geojson', data: EMPTY_FC() });
  map.addLayer({
    id: 'acg-lines-ov-meridian',
    source: 'acg-lines-ov',
    type: 'line',
    filter: ['in', ['get', 'lineType'], ['literal', ['MC', 'IC']]],
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['case', ['==', ['get', 'lineType'], 'MC'], 1.5, 0.8],
      'line-opacity': ['case', ['==', ['get', 'lineType'], 'MC'], 0.7, 0.5],
      'line-dasharray': [3, 3],
    },
  });
  // Overlay horizon lines are dashed (the "dotted equivalent" of the solid base
  // lines); ASC vs DSC is shown by the same up/down arrows, added below.
  map.addLayer({
    id: 'acg-lines-ov-horizon',
    source: 'acg-lines-ov',
    type: 'line',
    filter: ['in', ['get', 'lineType'], ['literal', ['ASC', 'DSC']]],
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 1.1,
      'line-opacity': 0.6,
      'line-dasharray': [2, 3],
    },
  });
  addHorizonArrows(map, 'acg-lines-ov-arrows-asc', 'acg-lines-ov', 'ASC', '→', haloColor, 0.65);
  addHorizonArrows(map, 'acg-lines-ov-arrows-dsc', 'acg-lines-ov', 'DSC', '←', haloColor, 0.65);
  map.addLayer({
    id: 'acg-lines-ov-labels',
    source: 'acg-lines-ov',
    type: 'symbol',
    layout: {
      'text-field': ['get', 'label'],
      'symbol-placement': 'line',
      'symbol-spacing': 280,
      'text-size': 9,
      'text-font': ['Noto Sans Regular'],
      'text-rotation-alignment': 'viewport',
      'text-pitch-alignment': 'viewport',
      'text-keep-upright': true,
      'text-padding': 3,
      'text-letter-spacing': 0.04,
    },
    paint: {
      'text-color': ['get', 'color'],
      'text-opacity': 0.8,
      'text-halo-color': haloColor,
      'text-halo-width': 2,
      'text-halo-blur': 0.5,
    },
  });
}

function pushData(map: maplibregl.Map, data: MapData) {
  const acg = map.getSource('acg-lines') as maplibregl.GeoJSONSource | undefined;
  const par = map.getSource('parans') as maplibregl.GeoJSONSource | undefined;
  const ls = map.getSource('local-space') as maplibregl.GeoJSONSource | undefined;
  if (acg) acg.setData(data.lines);
  if (par) par.setData(data.parans);
  if (ls) ls.setData(data.localSpace);

  const acgOv = map.getSource('acg-lines-ov') as
    | maplibregl.GeoJSONSource
    | undefined;
  const parOv = map.getSource('parans-ov') as
    | maplibregl.GeoJSONSource
    | undefined;
  const lsOv = map.getSource('local-space-ov') as
    | maplibregl.GeoJSONSource
    | undefined;
  const ov = data.overlay;
  if (acgOv) acgOv.setData(ov ? ov.lines : EMPTY_FC());
  if (parOv) parOv.setData(ov ? ov.parans : EMPTY_FC());
  if (lsOv) lsOv.setData(ov ? ov.localSpace : EMPTY_FC());
}

export const Map = forwardRef<MapHandle, MapProps>(function Map({
  lines,
  parans,
  localSpace,
  overlay,
  pin,
  pinType,
  theme,
  onHover,
  onLeave,
  onClick,
  onPinNatal,
}: MapProps, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useImperativeHandle(ref, () => ({
    flyTo: (lat: number, lng: number) => {
      const map = mapRef.current;
      if (!map) return;
      map.flyTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), 4),
        essential: true,
      });
    },
  }), []);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;
  const dataRef = useRef<MapData>({ lines, parans, localSpace, overlay });
  dataRef.current = { lines, parans, localSpace, overlay };
  const themeRef = useRef(theme);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE_URLS[themeRef.current],
      center: [0, 20],
      zoom: 1.5,
      maxZoom: 8,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'top-right',
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: false }),
      'bottom-right',
    );

    // No right-click rotate / pitch — keeps the map flat and removes the need
    // for a compass reset.
    map.dragRotate.disable();
    map.touchPitch.disable();
    map.touchZoomRotate.disableRotation();

    map.on('styleimagemissing', (e) => {
      if (map.hasImage(e.id)) return;
      map.addImage(e.id, {
        width: 1,
        height: 1,
        data: new Uint8Array([0, 0, 0, 0]),
      });
    });

    map.on('load', () => {
      setupCustomLayers(map, LABEL_HALO_COLORS[themeRef.current]);
      pushData(map, dataRef.current);
    });

    mapRef.current = map;

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (themeRef.current === theme) return;
    themeRef.current = theme;
    map.setStyle(BASEMAP_STYLE_URLS[theme]);
    map.once('style.load', () => {
      setupCustomLayers(map, LABEL_HALO_COLORS[theme]);
      pushData(map, dataRef.current);
    });
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handleMove = (e: maplibregl.MapMouseEvent) => {
      onHover?.(e.lngLat.lat, e.lngLat.lng);
    };
    const handleLeave = () => onLeave?.();
    const handleClick = (e: maplibregl.MapMouseEvent) => {
      onClick?.(e.lngLat.lat, e.lngLat.lng);
    };
    const handleContext = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      onPinNatal?.();
    };
    map.on('mousemove', handleMove);
    map.on('mouseout', handleLeave);
    map.on('click', handleClick);
    map.on('contextmenu', handleContext);
    return () => {
      map.off('mousemove', handleMove);
      map.off('mouseout', handleLeave);
      map.off('click', handleClick);
      map.off('contextmenu', handleContext);
    };
  }, [onHover, onLeave, onClick, onPinNatal]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded() && map.getSource('acg-lines')) {
      pushData(map, { lines, parans, localSpace, overlay });
    } else {
      map.once('load', () => pushData(map, dataRef.current));
    }
  }, [lines, parans, localSpace, overlay]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!pin) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const el = document.createElement('div');
      el.className = 'map-pin';
      el.innerHTML =
        '<div class="map-pin-ring"></div><div class="map-pin-dot"></div>';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const m = markerRef.current;
        if (!m) return;
        const ll = m.getLngLat();
        onClickRef.current?.(ll.lat, ll.lng);
      });
      markerRef.current = new maplibregl.Marker({
        element: el,
        anchor: 'center',
      })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map);
    } else {
      markerRef.current.setLngLat([pin.lng, pin.lat]);
    }
    const el = markerRef.current.getElement();
    el.classList.toggle('natal', pinType === 'natal');
    el.title =
      pinType === 'natal'
        ? 'Natal birth location (click to unpin)'
        : 'Pinned location (click to unpin)';
  }, [pin, pinType]);

  return <div ref={containerRef} className="map-container" />;
});
