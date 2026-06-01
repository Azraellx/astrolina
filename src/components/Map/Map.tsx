import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import maplibregl, { type ExpressionSpecification } from 'maplibre-gl';
import type { FeatureCollection, LineString, Point } from 'geojson';
import type { LineProps, ZenithProps } from '../../lib/astro/lines';
import type { ParanProps } from '../../lib/astro/parans';
import type { LocalSpaceProps } from '../../lib/astro/localSpace';
import {
  BASEMAP_STYLE_URLS,
  LABEL_HALO_COLORS,
  ZENITH_DISC_COLORS,
  type Theme,
} from '../../lib/theme';
import { ensureGlyphImages, GLYPH_IMAGE_PREFIX, ZENITH_GLYPH_PREFIX } from './glyphImages';
import { applyDetailToggles } from './basemapStyle';
import {
  computeLineBadges,
  dodgeBadges,
  type AvoidRect,
  type LineBadge,
} from './edgeAnchors';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import type { LineType } from '../../lib/astro/lines';
import 'maplibre-gl/dist/maplibre-gl.css';
import './Map.css';

const EMPTY_FC = <T,>(): FeatureCollection<LineString, T> => ({
  type: 'FeatureCollection',
  features: [],
});

// Inline the planet glyph (a baked image, keyed glyph-<planet>) ahead of the
// angle code in each line label, instead of a two-letter code. Angles read
// MC / IC / As / Ds. The text portion is colored by the layer's text-color.
const planetGlyph = (planetProp: string): ExpressionSpecification =>
  ['image', ['concat', GLYPH_IMAGE_PREFIX, ['get', planetProp]]] as unknown as ExpressionSpecification;

const PARAN_LABEL_FIELD = [
  'format',
  planetGlyph('planetA'),
  {},
  ['match', ['get', 'angleA'], 'MC', ' MC', 'IC', ' IC', 'ASC', ' As', 'DSC', ' Ds', ''],
  {},
  ' × ',
  {},
  planetGlyph('planetB'),
  {},
  ['match', ['get', 'angleB'], 'ASC', ' As', 'DSC', ' Ds', ''],
  {},
] as unknown as ExpressionSpecification;

// Overlay variants prepend the overlay tag (Tr / Sp / Sa / Sy, stamped onto the
// feature `label`) so overlay lines read e.g. "Tr ♂ MC".
const PARAN_OV_LABEL_FIELD = [
  'format',
  ['get', 'label'],
  {},
  ' ',
  {},
  planetGlyph('planetA'),
  {},
  ['match', ['get', 'angleA'], 'MC', ' MC', 'IC', ' IC', 'ASC', ' As', 'DSC', ' Ds', ''],
  {},
  ' × ',
  {},
  planetGlyph('planetB'),
  {},
  ['match', ['get', 'angleB'], 'ASC', ' As', 'DSC', ' Ds', ''],
  {},
] as unknown as ExpressionSpecification;

// Angle code shown in each edge badge (As/Ds match the wheel's shorthand).
const ANGLE_CODE: Record<LineType, string> = {
  MC: 'MC',
  IC: 'IC',
  ASC: 'As',
  DSC: 'Ds',
};

// How far inside the viewport edge the badges anchor (px). Small, since badges
// then dodge the HUD panels rather than relying on a wide margin.
const BADGE_INSET = 16;
// Below this zoom the whole-world view packs every planet's lines together, so the
// edge badges just stack up and read as noise — hide them until zoomed in enough
// for the lines (and their labels) to be distinguishable.
const BADGE_MIN_ZOOM = 3;

// HUD panels the edge badges should slide clear of, so a label is never hidden.
const HUD_SELECTORS = [
  '.timeline-hud', // top nav bar(s) + bottom timeline
  '.sidebar',
  '.app-header',
  '.chart-wheel',
  '.expanded-sidebar',
  '.maplibregl-ctrl-top-right',
  '.maplibregl-ctrl-bottom-right',
];

// Current screen rects of the HUD panels, in map-container coordinates.
function readHudRects(map: maplibregl.Map): AvoidRect[] {
  const cont = map.getContainer().getBoundingClientRect();
  const out: AvoidRect[] = [];
  for (const sel of HUD_SELECTORS) {
    document.querySelectorAll(sel).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      out.push({
        left: r.left - cont.left,
        top: r.top - cont.top,
        right: r.right - cont.left,
        bottom: r.bottom - cont.top,
      });
    });
  }
  return out;
}

// Pick dark or white text for a badge from the line color's luminance, so the
// glyph/code stays legible on both pale (e.g. Moon) and dark planet colors.
function badgeTextColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#1a1c22' : '#fff';
}

export interface OverlayData {
  lines: FeatureCollection<LineString, LineProps>;
  parans: FeatureCollection<LineString, ParanProps>;
  localSpace: FeatureCollection<LineString, LocalSpaceProps>;
}

// Live result of the on-map measurement tool: great-circle separation between
// the click origin and the current point, as a central angle plus distance, with
// the two endpoints so the readout can show start/end lat-long.
export interface LatLng {
  lat: number;
  lng: number;
}
export interface MeasureInfo {
  start: LatLng;
  end: LatLng;
  angleDeg: number;
  km: number;
  miles: number;
}

const EARTH_RADIUS_KM = 6371.0088;
const KM_PER_MILE = 1.609344;

function measureBetween(a: LatLng, b: LatLng): MeasureInfo {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  const km = EARTH_RADIUS_KM * c;
  return {
    start: { lat: a.lat, lng: a.lng },
    end: { lat: b.lat, lng: b.lng },
    angleDeg: (c * 180) / Math.PI,
    km,
    miles: km / KM_PER_MILE,
  };
}

interface MapProps {
  lines: FeatureCollection<LineString, LineProps>;
  parans: FeatureCollection<LineString, ParanProps>;
  localSpace: FeatureCollection<LineString, LocalSpaceProps>;
  /** Planet-glyph stamps at each body's zenith (sub-planetary) point, on its MC line. */
  zenith: FeatureCollection<Point, ZenithProps>;
  /** Second, time/relationship overlay rendered dashed + dimmed over the base. */
  overlay?: OverlayData | null;
  pin?: { lat: number; lng: number } | null;
  pinType?: 'custom' | 'natal' | null;
  theme: Theme;
  /** Basemap detail toggles (Theme tab). Default-off keeps the chart uncluttered. */
  showRoads?: boolean;
  showRivers?: boolean;
  /** When true, click-drag on the map measures great-circle distance (and map
   *  panning is suspended for the duration). */
  measureActive?: boolean;
  /** Color of the measure line/points — the current map-pin-state accent. */
  measureColor: string;
  onMeasure?: (m: MeasureInfo | null) => void;
  /** Right-click while measuring cancels (exits) the tool. */
  onMeasureCancel?: () => void;
  onHover?: (lat: number, lng: number) => void;
  onLeave?: () => void;
  onClick?: (lat: number, lng: number) => void;
  onPinNatal?: () => void;
}

interface MapData {
  lines: FeatureCollection<LineString, LineProps>;
  parans: FeatureCollection<LineString, ParanProps>;
  localSpace: FeatureCollection<LineString, LocalSpaceProps>;
  zenith: FeatureCollection<Point, ZenithProps>;
  overlay?: OverlayData | null;
}

export interface MapHandle {
  /** Recenter the map on a coordinate, easing to a usable zoom if zoomed out. */
  flyTo: (lat: number, lng: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
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
    },
  });
}

function setupCustomLayers(
  map: maplibregl.Map,
  haloColor: string,
  measureColor: string,
  zenithFill: string,
) {
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
      'text-field': PARAN_LABEL_FIELD,
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
  addHorizonArrows(map, 'acg-lines-arrows-asc', 'acg-lines', 'ASC', '→');
  addHorizonArrows(map, 'acg-lines-arrows-dsc', 'acg-lines', 'DSC', '←');
  // The glyph + angle label is no longer drawn along the line — it's rendered as
  // a colored edge badge (see the edge-badge overlay in the Map component).

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
      'line-opacity': 0.75,
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
      'line-width': 0.7,
      'line-opacity': 0.45,
      'line-dasharray': [2, 3],
    },
  });
  map.addLayer({
    id: 'parans-ov-labels',
    source: 'parans-ov',
    type: 'symbol',
    layout: {
      'text-field': PARAN_OV_LABEL_FIELD,
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
      'line-opacity': ['case', ['==', ['get', 'lineType'], 'MC'], 0.95, 0.7],
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
      'line-opacity': 0.85,
      'line-dasharray': [2, 3],
    },
  });
  addHorizonArrows(map, 'acg-lines-ov-arrows-asc', 'acg-lines-ov', 'ASC', '→');
  addHorizonArrows(map, 'acg-lines-ov-arrows-dsc', 'acg-lines-ov', 'DSC', '←');
  // Overlay glyph + angle labels are also drawn as edge badges, not along the line.

  // ── Zenith stamps: the planet glyph at each body's sub-planetary point (where
  // it is directly overhead) — on its MC line, at latitude = declination. Drawn
  // above the lines so the glyph reads on top of the meridian.
  map.addSource('acg-zenith', { type: 'geojson', data: EMPTY_FC() });
  // A ring around each stamp, bordered in the planet's color, over an inner fill
  // that matches the glyph's halo/glow (a themed disc color) so the glyph reads
  // on any basemap. Drawn under the glyph.
  map.addLayer({
    id: 'acg-zenith-disc',
    source: 'acg-zenith',
    type: 'circle',
    paint: {
      'circle-radius': 13,
      'circle-color': zenithFill,
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-width': 1.5,
    },
  });
  map.addLayer({
    id: 'acg-zenith-layer',
    source: 'acg-zenith',
    type: 'symbol',
    layout: {
      'icon-image': ['concat', ZENITH_GLYPH_PREFIX, ['get', 'planet']] as unknown as ExpressionSpecification,
      'icon-size': 1,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });

  // ── Measurement tool: a dashed great-circle segment from the click origin to
  // the cursor, with a disc at each end. Drawn on top of everything else.
  map.addSource('measure', { type: 'geojson', data: EMPTY_FC() });
  map.addLayer({
    id: 'measure-line',
    source: 'measure',
    type: 'line',
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: {
      'line-color': measureColor,
      'line-width': 2,
      'line-dasharray': [2, 2],
    },
  });
  map.addLayer({
    id: 'measure-points',
    source: 'measure',
    type: 'circle',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': 4,
      'circle-color': measureColor,
      'circle-stroke-color': haloColor,
      'circle-stroke-width': 1.5,
    },
  });
}

function pushData(map: maplibregl.Map, data: MapData) {
  const acg = map.getSource('acg-lines') as maplibregl.GeoJSONSource | undefined;
  const par = map.getSource('parans') as maplibregl.GeoJSONSource | undefined;
  const ls = map.getSource('local-space') as maplibregl.GeoJSONSource | undefined;
  const zen = map.getSource('acg-zenith') as maplibregl.GeoJSONSource | undefined;
  if (acg) acg.setData(data.lines);
  if (par) par.setData(data.parans);
  if (ls) ls.setData(data.localSpace);
  if (zen) zen.setData(data.zenith);

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
  zenith,
  overlay,
  pin,
  pinType,
  theme,
  showRoads = false,
  showRivers = false,
  measureActive,
  measureColor,
  onMeasure,
  onMeasureCancel,
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
      // The expanded chart sidebar is left-docked and overlays the map; while
      // open it publishes its width as --es-width on <html>. Shift the target
      // right so the pin lands where the nav/timeline bars center
      // (left: calc(50% + --es-width/4)) instead of behind the panel.
      const esWidth =
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            '--es-width',
          ),
        ) || 0;
      map.flyTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), 4),
        offset: [esWidth / 4, 0],
        essential: true,
      });
    },
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
  }), []);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;
  const dataRef = useRef<MapData>({ lines, parans, localSpace, zenith, overlay });
  dataRef.current = { lines, parans, localSpace, zenith, overlay };
  const themeRef = useRef(theme);
  // Read inside the (once-bound) load/style.load handlers so they always paint
  // the measure layers with the latest map-state accent.
  const measureColorRef = useRef(measureColor);
  measureColorRef.current = measureColor;
  // Current detail toggles, read inside the (once-bound) load/style.load handlers.
  const detailRef = useRef({ showRoads, showRivers });
  detailRef.current = { showRoads, showRivers };

  // Edge badges: glyph + angle code per ACG line, anchored where the line exits
  // the viewport. Recomputed (rAF-throttled) on every map move + when data changes.
  const [badges, setBadges] = useState<LineBadge[]>([]);
  const badgeRafRef = useRef(0);
  const computeBadges = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    // Zoomed-out world view crams every line together — skip the badges there.
    if (map.getZoom() < BADGE_MIN_ZOOM) {
      setBadges((prev) => (prev.length ? [] : prev));
      return;
    }
    const data = dataRef.current;
    const natal = computeLineBadges(map, data.lines.features, BADGE_INSET, false);
    const ov = data.overlay?.lines
      ? computeLineBadges(map, data.overlay.lines.features, BADGE_INSET, true)
      : [];
    const cont = map.getContainer();
    const dodged = dodgeBadges(
      natal.concat(ov),
      readHudRects(map),
      cont.clientWidth,
      cont.clientHeight,
      BADGE_INSET,
    );
    setBadges(dodged);
  }, []);
  const scheduleBadges = useCallback(() => {
    if (badgeRafRef.current) return;
    badgeRafRef.current = requestAnimationFrame(() => {
      badgeRafRef.current = 0;
      computeBadges();
    });
  }, [computeBadges]);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE_URLS[themeRef.current],
      center: [0, 20],
      zoom: 1.5,
      // MapLibre's hard ceiling. OpenFreeMap vector tiles only carry data to
      // z14, so past that the map overzooms (scales z14 tiles — blurrier) but
      // still lets you zoom right in for fine placement.
      maxZoom: 22,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'top-right',
    );
    // Surface the +/− zoom hotkeys in the nav buttons' hover tooltips.
    const zoomInBtn = map.getContainer().querySelector('.maplibregl-ctrl-zoom-in');
    const zoomOutBtn = map.getContainer().querySelector('.maplibregl-ctrl-zoom-out');
    zoomInBtn?.setAttribute('title', 'Zoom in (+)');
    zoomInBtn?.setAttribute('aria-label', 'Zoom in (+)');
    zoomOutBtn?.setAttribute('title', 'Zoom out (-)');
    zoomOutBtn?.setAttribute('aria-label', 'Zoom out (-)');
    map.addControl(
      new maplibregl.AttributionControl({
        compact: false,
        // The basemap style already credits OpenStreetMap (which also covers
        // the OSM-derived Nominatim geocoding). This adds the one credit the
        // basemap doesn't: GeoNames, for the bundled offline place-name / city
        // data. The CC BY 4.0 licence is surfaced as a hover tooltip (`title`)
        // rather than inline text, to keep the chip compact; the always-visible
        // GeoNames link to geonames.org (which states the licence) satisfies the
        // CC BY attribution on its own, and `title` stays in the DOM regardless.
        customAttribution: [
          'Places &copy; <a href="https://www.geonames.org" target="_blank" rel="noopener noreferrer" title="GeoNames place-name data — licensed CC BY 4.0">GeoNames</a>',
        ],
      }),
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

    map.on('load', async () => {
      await ensureGlyphImages(
        map,
        themeRef.current === 'dark' ? '' : LABEL_HALO_COLORS[themeRef.current],
        ZENITH_DISC_COLORS[themeRef.current],
      );
      applyDetailToggles(map, detailRef.current);
      setupCustomLayers(
        map,
        LABEL_HALO_COLORS[themeRef.current],
        measureColorRef.current,
        ZENITH_DISC_COLORS[themeRef.current],
      );
      pushData(map, dataRef.current);
      computeBadges();
    });

    // Re-anchor the edge badges on every pan/zoom (throttled to one rAF/frame).
    map.on('move', scheduleBadges);
    map.on('moveend', computeBadges);

    mapRef.current = map;

    return () => {
      if (badgeRafRef.current) cancelAnimationFrame(badgeRafRef.current);
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [computeBadges, scheduleBadges]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (themeRef.current === theme) return;
    themeRef.current = theme;
    map.setStyle(BASEMAP_STYLE_URLS[theme]);
    map.once('style.load', async () => {
      await ensureGlyphImages(map, theme === 'dark' ? '' : LABEL_HALO_COLORS[theme], ZENITH_DISC_COLORS[theme]);
      applyDetailToggles(map, detailRef.current);
      setupCustomLayers(map, LABEL_HALO_COLORS[theme], measureColorRef.current, ZENITH_DISC_COLORS[theme]);
      pushData(map, dataRef.current);
      computeBadges();
    });
  }, [theme, computeBadges]);

  // Repaint the measure layers when the map-state accent changes (e.g. pinning a
  // location) without needing a full style reload.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer('measure-line')) return;
    map.setPaintProperty('measure-line', 'line-color', measureColor);
    map.setPaintProperty('measure-points', 'circle-color', measureColor);
  }, [measureColor]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // While the measurement tool is active, the map's pointer drives the ruler,
    // so suppress hover-relocation / pin interactions.
    const handleMove = (e: maplibregl.MapMouseEvent) => {
      if (measureActive) return;
      onHover?.(e.lngLat.lat, e.lngLat.lng);
    };
    const handleLeave = () => onLeave?.();
    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (measureActive) return;
      onClick?.(e.lngLat.lat, e.lngLat.lng);
    };
    const handleContext = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      if (measureActive) return;
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
  }, [onHover, onLeave, onClick, onPinNatal, measureActive]);

  // Measurement tool: press-drag draws a great-circle segment from the origin to
  // the cursor and reports the live distance. Panning is disabled while the tool
  // is active so the drag measures instead of moving the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !measureActive) return;

    const setSegment = (
      o: { lng: number; lat: number },
      c: { lng: number; lat: number },
    ) => {
      const src = map.getSource('measure') as
        | maplibregl.GeoJSONSource
        | undefined;
      src?.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [o.lng, o.lat],
                [c.lng, c.lat],
              ],
            },
          },
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [o.lng, o.lat] },
          },
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
          },
        ],
      });
    };

    let origin: { lng: number; lat: number } | null = null;
    const onDown = (e: maplibregl.MapMouseEvent) => {
      // Left button only — right-click is reserved for cancelling the tool.
      if (e.originalEvent.button !== 0) return;
      origin = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      setSegment(origin, origin);
      onMeasure?.(measureBetween(origin, origin));
    };
    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (!origin) return;
      const cur = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      setSegment(origin, cur);
      onMeasure?.(measureBetween(origin, cur));
    };
    const onUp = () => {
      origin = null;
    };
    // Right-click anywhere on the map exits the measure tool (no context menu).
    const onContextMenu = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      origin = null;
      onMeasureCancel?.();
    };

    map.dragPan.disable();
    map.getCanvas().style.cursor = 'crosshair';
    map.on('mousedown', onDown);
    map.on('mousemove', onMove);
    map.on('mouseup', onUp);
    map.on('contextmenu', onContextMenu);

    return () => {
      map.off('mousedown', onDown);
      map.off('mousemove', onMove);
      map.off('mouseup', onUp);
      map.off('contextmenu', onContextMenu);
      map.dragPan.enable();
      map.getCanvas().style.cursor = '';
      const src = map.getSource('measure') as
        | maplibregl.GeoJSONSource
        | undefined;
      src?.setData(EMPTY_FC());
      onMeasure?.(null);
    };
  }, [measureActive, onMeasure, onMeasureCancel]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded() && map.getSource('acg-lines')) {
      pushData(map, { lines, parans, localSpace, zenith, overlay });
      computeBadges();
    } else {
      map.once('load', () => {
        pushData(map, dataRef.current);
        computeBadges();
      });
    }
  }, [lines, parans, localSpace, zenith, overlay, computeBadges]);

  // Toggle basemap road / river visibility live (theme reloads reapply via the
  // style.load handler above).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    applyDetailToggles(map, { showRoads, showRivers });
  }, [showRoads, showRivers]);

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

  return (
    <>
      <div ref={containerRef} className="map-container" />
      <div className="acg-edge-badges" aria-hidden="true">
        {badges.map((b) => {
          const text = badgeTextColor(b.color);
          return (
            <span
              key={b.key}
              className="acg-badge"
              style={{ left: b.x, top: b.y, background: b.color, color: text }}
            >
              {b.prefix && <span className="acg-badge-prefix">{b.prefix}</span>}
              <PlanetGlyph planet={b.planet} size={11} color={text} />
              <span className="acg-badge-code">{ANGLE_CODE[b.lineType]}</span>
            </span>
          );
        })}
      </div>
    </>
  );
});
