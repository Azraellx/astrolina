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
import { PROJECTION_SPEC, type MapProjectionMode } from '../../lib/projection';
import {
  isOccluded,
  projectVisible,
  screenAngleOfNorth,
} from '../../lib/mapProjection';
import { ensureGlyphImages, ZENITH_GLYPH_PREFIX } from './glyphImages';
import { applyDetailToggles } from './basemapStyle';
import {
  computeLineBadges,
  dodgeBadges,
  clipSegmentToView,
  type AvoidRect,
  type LineBadge,
} from './edgeAnchors';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import { LocalHorizonWheel } from '../LocalHorizonWheel/LocalHorizonWheel';
import type { LineType } from '../../lib/astro/lines';
import { PLANET_DISPLAY, type PlanetName } from '../../lib/ephemeris';
import 'maplibre-gl/dist/maplibre-gl.css';
import './Map.css';

const EMPTY_FC = <T,>(): FeatureCollection<LineString, T> => ({
  type: 'FeatureCollection',
  features: [],
});

// Tile options for the line / paran / zenith sources. A maximal buffer makes
// neighbouring tiles overlap so an antimeridian-crossing line has no hairline seam
// at the ±180° world boundary (geojson-vt wraps the out-of-range longitudes into the
// adjacent world copy; the overlap hides the join), and tolerance:0 keeps the lines
// un-simplified — so the crossing stays precise even when zoomed all the way out.
const LINE_SOURCE_OPTS = { buffer: 512, tolerance: 0 } as const;

// Angle code shown in each line / paran badge (As/Ds match the wheel's shorthand).
// Covers all four angles — a paran's body A may sit on the MC/IC or the horizon.
const ANGLE_CODE: Record<LineType, string> = {
  MC: 'MC',
  IC: 'IC',
  ASC: 'As',
  DSC: 'Ds',
};

// How far inside the viewport edge the badges anchor (px). Small, since badges
// then dodge the HUD panels rather than relying on a wide margin.
const BADGE_INSET = 16;

// HUD panels the edge badges should slide clear of, so a label is never hidden.
const HUD_SELECTORS = [
  '.timeline-hud', // top nav bar(s) + bottom timeline
  '.thud-measure', // the timeline's overlay-mode nub (protrudes above the bar)
  '.synastry-hud', // bottom synastry bar (same slot as the timeline; its tag is inline)
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

// Pick dark or white text for a badge from its fill luminance, so the glyph/code
// stays legible on pale (e.g. Moon) or dark planet colors and on the themed paran
// fill. Accepts #rrggbb or rgb()/rgba().
function badgeTextColor(fill: string): string {
  let r: number;
  let g: number;
  let b: number;
  const hex = /^#?([0-9a-f]{6})$/i.exec(fill.trim());
  if (hex) {
    const n = parseInt(hex[1], 16);
    r = (n >> 16) & 255;
    g = (n >> 8) & 255;
    b = n & 255;
  } else {
    const rgb = /rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)/i.exec(fill);
    if (!rgb) return '#fff';
    r = parseFloat(rgb[1]);
    g = parseFloat(rgb[2]);
    b = parseFloat(rgb[3]);
  }
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#1a1c22' : '#fff';
}

// One badge per paran, parked at the horizontal centre of the screen on the line's
// latitude row (replaces the old repeated along-the-line labels).
interface ParanBadge {
  key: string;
  x: number;
  y: number;
  planetA: ParanProps['planetA'];
  angleA: ParanProps['angleA'];
  planetB: ParanProps['planetB'];
  angleB: ParanProps['angleB'];
  prefix: string;
  /** Click-to-fly target: the paran's intersection point. */
  targetLng: number;
  targetLat: number;
}

// One badge per local-space line ("LS" + planet glyph), parked on a ring around
// the origin point at the planet's azimuth. North is up and Mercator is conformal,
// so the screen angle matches the bearing — the label lands on its own line. The
// ring radius grows from the base up to 4× as you zoom in toward street level
// (~where minor roads appear), so the labels spread apart as the map gains detail.
// The "zoomed in close" threshold: at this zoom the LS label ring reaches its max
// radius AND the local-horizon compass pops in — a single zoomed-in-enough mark.
const CLOSE_ZOOM = 10;
// Once zoomed past CLOSE_ZOOM (LS labels at full radius) a subtle "Zoom out"
// escape button appears; clicking it eases back to this wide overview in one step.
const ZOOM_OUT_TARGET = 3;
// The horizon compass starts fading in once zoomed in this far — well before the LS
// labels finish spreading, so it shows up quickly.
const COMPASS_ZOOM = 4;
// Diameter (px) of the local-horizon compass at full (CLOSE_ZOOM) size.
const HORIZON_WHEEL_SIZE = 480;
// It starts 20% smaller and grows to full across COMPASS_ZOOM→CLOSE_ZOOM (alongside
// the LS labels), while fading to full opacity over the first quarter of that range.
const COMPASS_MIN_SCALE = 0.5;
const COMPASS_FADE_FRACTION = 0.25;
const COMPASS_MAX_OPACITY = 0.92;
const LS_BADGE_RADIUS_PX = 74;
const LS_RADIUS_ZOOM_MIN = 2;
const LS_RADIUS_MAX_SCALE = 4;
function lsBadgeRadius(zoom: number): number {
  const t = Math.max(
    0,
    Math.min(1, (zoom - LS_RADIUS_ZOOM_MIN) / (CLOSE_ZOOM - LS_RADIUS_ZOOM_MIN)),
  );
  return LS_BADGE_RADIUS_PX * (1 + (LS_RADIUS_MAX_SCALE - 1) * t);
}
// Rough half-extents of an LS pill, used to keep the ring's labels from colliding.
const LS_BADGE_HALF_W = 34;
const LS_BADGE_HALF_H = 11;
interface LocalSpaceBadge {
  key: string;
  x: number;
  y: number;
  planet: LocalSpaceProps['planet'];
  color: string;
  /** This half's bearing in the E=0 / N=90 dial convention (static). */
  azDeg: number;
  /** Screen rotation (deg, clockwise from up) of the in/out direction arrow. */
  arrowDeg: number;
}

// Spread overlapping badges apart — a few passes of AABB separation along the axis
// of least overlap — so the LS labels stay readable/clickable when their azimuths
// crowd. Mutates x/y in place.
function deOverlapBadges(
  items: { x: number; y: number }[],
  halfW: number,
  halfH: number,
  iterations: number,
): void {
  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const ox = 2 * halfW - Math.abs(dx);
        const oy = 2 * halfH - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox < oy) {
          const push = (ox / 2 + 0.5) * (dx < 0 ? -1 : 1);
          a.x -= push;
          b.x += push;
        } else {
          const push = (oy / 2 + 0.5) * (dy < 0 ? -1 : 1);
          a.y -= push;
          b.y += push;
        }
      }
    }
    if (!moved) break;
  }
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

// ── Measure-tool line snapping ────────────────────────────────────────────────
// While the measure tool is dragged, the endpoint auto-snaps to the nearest
// rendered chart line whenever the cursor comes within SNAP_RADIUS_PX of one. We
// query whatever line layers are actually drawn (so it honours planet / overlay /
// paran / local-space visibility), then take the closest point on those polylines
// in screen space. Approximate by design — close enough to grab a line without
// fiddly precision.
const SNAP_LINE_LAYERS = [
  'acg-lines-meridian',
  'acg-lines-horizon',
  'acg-lines-ov-meridian',
  'acg-lines-ov-horizon',
  'parans-layer',
  'parans-ov-layer',
  'local-space-layer',
  'local-space-ov-layer',
];
// Cursor-to-line distance (px) within which the measure endpoint snaps. Small, so
// it grabs a line you're aiming at without hijacking nearby free-space measuring.
const SNAP_RADIUS_PX = 12;

interface ScreenPt {
  x: number;
  y: number;
}

// Closest point on segment a→b to p, all in screen px; returns the point + distance.
function closestPointOnSegment(p: ScreenPt, a: ScreenPt, b: ScreenPt): ScreenPt & { d: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return { x, y, d: Math.hypot(p.x - x, p.y - y) };
}

// Nearest point (lng/lat) on any rendered chart line within SNAP_RADIUS_PX of the
// screen point, or null if nothing is close enough.
function snapToNearestLine(
  map: maplibregl.Map,
  pt: ScreenPt,
): { lng: number; lat: number } | null {
  const layers = SNAP_LINE_LAYERS.filter((id) => map.getLayer(id));
  if (layers.length === 0) return null;
  const feats = map.queryRenderedFeatures(
    [
      [pt.x - SNAP_RADIUS_PX, pt.y - SNAP_RADIUS_PX],
      [pt.x + SNAP_RADIUS_PX, pt.y + SNAP_RADIUS_PX],
    ],
    { layers },
  );
  let bx = 0;
  let by = 0;
  let best = Infinity;
  for (const f of feats) {
    const g = f.geometry;
    const parts =
      g.type === 'LineString'
        ? [g.coordinates]
        : g.type === 'MultiLineString'
          ? g.coordinates
          : [];
    for (const line of parts) {
      if (line.length < 2) continue;
      let prev = map.project(line[0] as [number, number]);
      for (let i = 1; i < line.length; i++) {
        const cur = map.project(line[i] as [number, number]);
        // Only measure against segments whose endpoints both project to finite
        // pixels (a globe segment can run behind the camera / off the sphere).
        if (
          Number.isFinite(prev.x) &&
          Number.isFinite(prev.y) &&
          Number.isFinite(cur.x) &&
          Number.isFinite(cur.y)
        ) {
          const c = closestPointOnSegment(pt, prev, cur);
          if (c.d < best) {
            best = c.d;
            bx = c.x;
            by = c.y;
          }
        }
        prev = cur;
      }
    }
  }
  if (best === Infinity) return null;
  const ll = map.unproject([bx, by]);
  return { lng: ll.lng, lat: ll.lat };
}

// ── Zenith hover / click ────────────────────────────────────────────────────────
// The sub-planetary stamps are small, so a query within a few px of the cursor
// counts as a hit. Hovering one animates it + shows a tooltip; clicking flies to it
// (the same place a planet's ACG line labels fly to).
const ZENITH_HIT_LAYER = 'acg-zenith-disc';
const ZENITH_HIT_TOLERANCE_PX = 4;

interface ZenithHit {
  id: string;
  planet: PlanetName;
  lng: number;
  lat: number;
}

function zenithAtPoint(map: maplibregl.Map, pt: ScreenPt): ZenithHit | null {
  if (!map.getLayer(ZENITH_HIT_LAYER)) return null;
  const t = ZENITH_HIT_TOLERANCE_PX;
  const feats = map.queryRenderedFeatures(
    [
      [pt.x - t, pt.y - t],
      [pt.x + t, pt.y + t],
    ],
    { layers: [ZENITH_HIT_LAYER] },
  );
  const f = feats[0];
  if (!f || f.id == null || !f.properties || f.geometry.type !== 'Point') {
    return null;
  }
  const [lng, lat] = f.geometry.coordinates as [number, number];
  return { id: String(f.id), planet: f.properties.planet as PlanetName, lng, lat };
}

// Apply a projection mode to the live map: swap mercator↔globe, gate rotate/tilt
// (3D only), and in 2D snap back to flat north-up. Must be re-run after every
// setStyle (which resets the projection). The `proj-2d` container class lets CSS
// hide the compass button in flat mode.
function applyProjection(map: maplibregl.Map, mode: MapProjectionMode): void {
  map.setProjection({ type: PROJECTION_SPEC[mode] });
  map.getContainer().classList.toggle('proj-2d', mode === '2d');
  if (mode === '3d') {
    map.dragRotate.enable();
    map.touchPitch.enable();
    map.touchZoomRotate.enableRotation();
  } else {
    map.dragRotate.disable();
    map.touchPitch.disable();
    map.touchZoomRotate.disableRotation();
    map.setBearing(0);
    map.setPitch(0);
  }
}

interface MapProps {
  lines: FeatureCollection<LineString, LineProps>;
  parans: FeatureCollection<LineString, ParanProps>;
  localSpace: FeatureCollection<LineString, LocalSpaceProps>;
  /** Origin the local-space lines radiate from (pin or birthplace) — the centre of
   *  the LS label ring. Null when local space is hidden. */
  localSpaceOrigin?: { lat: number; lng: number } | null;
  /** Planet-glyph stamps at each body's zenith (sub-planetary) point, on its MC line. */
  zenith: FeatureCollection<Point, ZenithProps>;
  /** The ecliptic great circle (zodiac) projected to its sub-points — a subtle
   *  bright-yellow reference line that threads through the Sun's zenith. */
  ecliptic?: FeatureCollection<LineString> | null;
  /** Second, time/relationship overlay rendered dashed + dimmed over the base. */
  overlay?: OverlayData | null;
  pin?: { lat: number; lng: number } | null;
  pinType?: 'custom' | 'natal' | null;
  theme: Theme;
  /** Flat Mercator ('2d') or 3D globe ('3d'). */
  projection: MapProjectionMode;
  /** Basemap detail toggles (the Theme tab's "Hide details" section). Default-on. */
  showRoads?: boolean;
  showRivers?: boolean;
  showLabels?: boolean;
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
  localSpaceOrigin?: { lat: number; lng: number } | null;
  zenith: FeatureCollection<Point, ZenithProps>;
  ecliptic?: FeatureCollection<LineString> | null;
  overlay?: OverlayData | null;
}

export interface MapHandle {
  /** Recenter the map on a coordinate, easing to a usable zoom if zoomed out. */
  flyTo: (lat: number, lng: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

// Directional arrows chained ALONG a line — '→→→' that follow the line's bearing
// (map rotation, keep-upright off so the true direction is preserved). The glyph
// + filter decide direction: horizon lines use '→' for ASC and '←' for DSC; local
// space uses '→' on the outward (toward-planet) half and '←' on the inward half,
// so each axis reads as energy flowing out toward the planet and back in. Tight
// spacing reads as one connected arrowed line; `text-ignore-placement` keeps them
// decorative so they never suppress the planet labels.
function addArrowLayer(
  map: maplibregl.Map,
  id: string,
  source: string,
  filter: ExpressionSpecification,
  glyph: string,
) {
  map.addLayer({
    id,
    source,
    type: 'symbol',
    filter,
    layout: {
      'text-field': glyph,
      'symbol-placement': 'line',
      // Spaced out so the base line shows through as the shaft between arrowheads
      // — reads as ———→———→ rather than a dense →→→ run.
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

// Filter expression for one direction-tagged local-space half.
const lsDir = (d: 'out' | 'in'): ExpressionSpecification =>
  ['==', ['get', 'direction'], d] as unknown as ExpressionSpecification;
const lineTypeIs = (t: 'ASC' | 'DSC'): ExpressionSpecification =>
  ['==', ['get', 'lineType'], t] as unknown as ExpressionSpecification;

function setupCustomLayers(
  map: maplibregl.Map,
  haloColor: string,
  measureColor: string,
  zenithFill: string,
) {
  // The ecliptic (zodiac great circle) projected to its sub-points — a subtle
  // bright-yellow reference threading through the Sun's zenith. Added first so it
  // sits beneath the ACG lines, parans, and stamps.
  map.addSource('ecliptic', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
  map.addLayer({
    id: 'ecliptic-layer',
    source: 'ecliptic',
    type: 'line',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#ffe14d',
      'line-width': 1.6,
      'line-opacity': 0.45,
    },
  });

  map.addSource('parans', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
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
  // Paran labels are drawn as centred DOM badges (see the paran-badge overlay in
  // the Map component), not repeated along the line.

  map.addSource('local-space', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
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
  // Outward ('→', toward the planet) and inward ('←', back toward the origin)
  // arrows distinguish the two halves of each local-space axis.
  addArrowLayer(map, 'local-space-arrows-out', 'local-space', lsDir('out'), '→');
  addArrowLayer(map, 'local-space-arrows-in', 'local-space', lsDir('in'), '←');

  map.addSource('acg-lines', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
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
  addArrowLayer(map, 'acg-lines-arrows-asc', 'acg-lines', lineTypeIs('ASC'), '→');
  addArrowLayer(map, 'acg-lines-arrows-dsc', 'acg-lines', lineTypeIs('DSC'), '←');
  // The glyph + angle label is no longer drawn along the line — it's rendered as
  // a colored edge badge (see the edge-badge overlay in the Map component).

  // ── Overlay slot (-ov): a second set of sources/layers for the timeline
  // overlay (transits / progressed / solar-arc / synastry). Same per-planet
  // colors as the base, but dashed and dimmed so it reads as "derived". Labels
  // carry a baked-in prefix (t/p/d/s) so the text-field expression is unchanged.
  map.addSource('local-space-ov', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
  map.addLayer({
    id: 'local-space-ov-layer',
    source: 'local-space-ov',
    type: 'line',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 1.0,
      // Overlay lines are dashed, so they read as "derived" without dimming —
      // keep them at full opacity (dash pattern alone distinguishes them).
      'line-opacity': 1,
      'line-dasharray': [1, 3],
    },
  });
  addArrowLayer(map, 'local-space-ov-arrows-out', 'local-space-ov', lsDir('out'), '→');
  addArrowLayer(map, 'local-space-ov-arrows-in', 'local-space-ov', lsDir('in'), '←');

  map.addSource('parans-ov', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
  map.addLayer({
    id: 'parans-ov-layer',
    source: 'parans-ov',
    type: 'line',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 0.7,
      'line-opacity': 1,
      'line-dasharray': [2, 3],
    },
  });
  // Overlay paran labels are also centred DOM badges, not drawn along the line.

  map.addSource('acg-lines-ov', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
  map.addLayer({
    id: 'acg-lines-ov-meridian',
    source: 'acg-lines-ov',
    type: 'line',
    filter: ['in', ['get', 'lineType'], ['literal', ['MC', 'IC']]],
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['case', ['==', ['get', 'lineType'], 'MC'], 1.5, 0.8],
      'line-opacity': 1,
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
      'line-opacity': 1,
      'line-dasharray': [2, 3],
    },
  });
  addArrowLayer(map, 'acg-lines-ov-arrows-asc', 'acg-lines-ov', lineTypeIs('ASC'), '→');
  addArrowLayer(map, 'acg-lines-ov-arrows-dsc', 'acg-lines-ov', lineTypeIs('DSC'), '←');
  // Overlay glyph + angle labels are also drawn as edge badges, not along the line.

  // ── Zenith stamps: the planet glyph at each body's sub-planetary point (where
  // it is directly overhead) — on its MC line, at latitude = declination. Drawn
  // above the lines so the glyph reads on top of the meridian.
  map.addSource('acg-zenith', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
  // A ring around each stamp, bordered in the planet's color, over an inner fill
  // that matches the glyph's halo/glow (a themed disc color) so the glyph reads
  // on any basemap. Drawn under the glyph.
  map.addLayer({
    id: 'acg-zenith-disc',
    source: 'acg-zenith',
    type: 'circle',
    paint: {
      // Grows + thickens its ring while hovered (a feature-state set on mouseover),
      // mirroring the badge hover lift. The transitions animate the change.
      'circle-radius': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        18,
        13,
      ],
      'circle-radius-transition': { duration: 150, delay: 0 },
      'circle-color': zenithFill,
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-width': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        2.75,
        1.5,
      ],
      'circle-stroke-width-transition': { duration: 150, delay: 0 },
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
  map.addSource('measure', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
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
  const ecl = map.getSource('ecliptic') as maplibregl.GeoJSONSource | undefined;
  if (acg) acg.setData(data.lines);
  if (par) par.setData(data.parans);
  if (ls) ls.setData(data.localSpace);
  if (zen) zen.setData(data.zenith);
  if (ecl) ecl.setData(data.ecliptic ?? EMPTY_FC());

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
  localSpaceOrigin,
  zenith,
  ecliptic,
  overlay,
  pin,
  pinType,
  theme,
  projection,
  showRoads = true,
  showRivers = true,
  showLabels = true,
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
  const dataRef = useRef<MapData>({ lines, parans, localSpace, localSpaceOrigin, zenith, ecliptic, overlay });
  dataRef.current = { lines, parans, localSpace, localSpaceOrigin, zenith, ecliptic, overlay };
  const themeRef = useRef(theme);
  // Current projection mode, read inside the once-bound load/style.load handlers
  // (setStyle resets projection, so it must be re-applied after each style load).
  const projectionRef = useRef(projection);
  // Read inside the (once-bound) load/style.load handlers so they always paint
  // the measure layers with the latest map-state accent.
  const measureColorRef = useRef(measureColor);
  measureColorRef.current = measureColor;
  // Current detail toggles, read inside the (once-bound) load/style.load handlers.
  const detailRef = useRef({ showRoads, showRivers, showLabels });
  detailRef.current = { showRoads, showRivers, showLabels };

  // Edge badges: glyph + angle code per ACG line, anchored where the line exits
  // the viewport. Recomputed (rAF-throttled) on every map move + when data changes.
  const [badges, setBadges] = useState<LineBadge[]>([]);
  const [paranBadges, setParanBadges] = useState<ParanBadge[]>([]);
  const [localSpaceBadges, setLocalSpaceBadges] = useState<LocalSpaceBadge[]>([]);
  // Current map zoom — gates the local-horizon compass and drives its scale + fade.
  const [zoom, setZoom] = useState(0);
  // Screen position of the local-space origin — the centre of the horizon compass.
  const [originScreen, setOriginScreen] = useState<{ x: number; y: number } | null>(
    null,
  );
  // On-screen angle (deg) of north at the origin — 0 in 2D, non-zero on a rotated
  // globe; rotates the horizon compass dial so it stays aligned with the lines.
  const [originNorthDeg, setOriginNorthDeg] = useState(0);
  const badgeRafRef = useRef(0);

  // Ease the map to a lng/lat, keeping the target clear of the left-docked expanded
  // sidebar (same offset as the recenter button). Used by paran + LS label clicks.
  const flyToPoint = useCallback((lng: number, lat: number) => {
    const map = mapRef.current;
    if (!map) return;
    const esWidth =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--es-width'),
      ) || 0;
    map.flyTo({
      center: [lng, lat],
      zoom: Math.max(map.getZoom(), 4),
      offset: [esWidth / 4, 0],
      essential: true,
    });
  }, []);

  const computeBadges = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setZoom(map.getZoom());
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

    // Paran centre badges: one per visible paran, parked on its latitude row at the
    // map's centre longitude (the visible meridian arc). In 2D that's screen-centre;
    // on a globe it tracks the curved row and is culled when it's on the far side.
    const centerLng = map.getCenter().lng;
    const w = cont.clientWidth;
    const h = cont.clientHeight;
    const pbadges: ParanBadge[] = [];
    const pushParans = (
      fc: FeatureCollection<LineString, ParanProps>,
      overlay: boolean,
    ) => {
      fc.features.forEach((f, i) => {
        const p = f.properties;
        const sp = projectVisible(map, centerLng, p.latitude);
        if (!sp || sp.x < 0 || sp.x > w || sp.y < 0 || sp.y > h) return;
        pbadges.push({
          key: `${overlay ? 'pov' : 'pn'}-${i}`,
          x: sp.x,
          y: sp.y,
          planetA: p.planetA,
          angleA: p.angleA,
          planetB: p.planetB,
          angleB: p.angleB,
          prefix: overlay ? p.label : '',
          targetLng: p.intersectionLng,
          targetLat: p.latitude,
        });
      });
    };
    pushParans(data.parans, false);
    if (data.overlay?.parans) pushParans(data.overlay.parans, true);
    setParanBadges(pbadges);

    // Local-space badges: one "LS + glyph" per planet, on a fixed-pixel ring around
    // the origin at the outward (toward-planet) azimuth — measured from the on-screen
    // north direction so it stays correct under rotation/tilt. Hidden when the origin
    // is on the globe's far side.
    const lsbadges: LocalSpaceBadge[] = [];
    const origin = data.localSpaceOrigin;
    if (
      origin &&
      data.localSpace.features.length &&
      !isOccluded(map, origin.lng, origin.lat)
    ) {
      const oc = map.project([origin.lng, origin.lat]);
      setOriginScreen({ x: oc.x, y: oc.y });
      const north = screenAngleOfNorth(map, origin.lng, origin.lat);
      setOriginNorthDeg((north * 180) / Math.PI);
      const r = lsBadgeRadius(map.getZoom());
      // Anchor an off-screen LS label on its ACTUAL projected arc (a great circle that
      // curves away from a straight ring ray the farther out it runs): walk from the
      // pin outward and return where the line first enters the view — its pin-ward end.
      const lsPinwardEntry = (coords: number[][]): { x: number; y: number } | null => {
        let prev: { x: number; y: number } | null = null;
        for (let i = 0; i < coords.length; i++) {
          const c = coords[i];
          const cur = isOccluded(map, c[0], c[1]) ? null : map.project([c[0], c[1]]);
          if (prev && cur) {
            const seg = clipSegmentToView(prev, cur, w, h, BADGE_INSET);
            if (seg) return seg.near; // first crossing from the pin = pin-ward edge
          }
          prev = cur;
        }
        return null;
      };
      const seen = new Set<string>();
      for (const f of data.localSpace.features) {
        const lp = f.properties;
        const k = `${lp.planet}-${lp.direction}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const out = lp.direction === 'out';
        // 'out' runs toward the planet; 'in' is the opposite (nadir) half. The badge
        // sits at this screen bearing from the origin.
        const angle = north + (lp.azimuth * Math.PI) / 180 + (out ? 0 : Math.PI);
        // This half's bearing (clockwise from north): out = toward the planet, in =
        // the reciprocal. Labelled in the E=0 / N=90 convention (matches the dial).
        const bearingAzN = out ? lp.azimuth : (lp.azimuth + 180) % 360;
        const azDeg = Math.round((90 - bearingAzN + 360) % 360) % 360;
        // Direction arrow points along the axis: away from the pin ('out', toward
        // the planet) or back toward it ('in').
        const arrowDeg = ((out ? angle : angle + Math.PI) * 180) / Math.PI;
        // Keep the label on screen. At rest it sits at the ring point. Once that's off
        // screen we hug the edge where the line exits — but WHICH end depends on the
        // pin: while the pin is still visible, hug the planet-ward exit; once the pin
        // is ALSO off screen, hug the PIN-ward end instead, so the label sits nearer
        // the (off-screen) pin and slides back toward the ring as you pan to it. Same
        // viewport clip the ACG line labels use.
        const ringPt = { x: oc.x + r * Math.sin(angle), y: oc.y - r * Math.cos(angle) };
        const inView = (p: { x: number; y: number }) =>
          p.x >= BADGE_INSET &&
          p.x <= w - BADGE_INSET &&
          p.y >= BADGE_INSET &&
          p.y <= h - BADGE_INSET;
        let placed: { x: number; y: number } | null;
        if (inView(ringPt)) {
          placed = ringPt;
        } else if (inView(oc)) {
          const seg = clipSegmentToView(oc, ringPt, w, h, BADGE_INSET);
          placed = seg ? seg.far : null;
        } else {
          // Both off screen: anchor on the real projected arc at its pin-ward entry,
          // so the label sits ON the (curved) line rather than along a straight ray
          // that drifts off it the farther out the line goes.
          placed = lsPinwardEntry(f.geometry.coordinates);
        }
        if (!placed) continue; // line entirely off-screen
        lsbadges.push({
          key: k,
          x: placed.x,
          y: placed.y,
          planet: lp.planet,
          color: lp.color,
          azDeg,
          arrowDeg,
        });
      }
      deOverlapBadges(lsbadges, LS_BADGE_HALF_W, LS_BADGE_HALF_H, 16);
      // deOverlapBadges has no viewport clamp of its own, and edge-hugged labels sit
      // right at the inset — so clamp every pill fully back on screen afterward
      // (accounting for its half-extents), matching the ACG badges' final clamp.
      for (const b of lsbadges) {
        b.x = Math.min(Math.max(b.x, BADGE_INSET + LS_BADGE_HALF_W), w - BADGE_INSET - LS_BADGE_HALF_W);
        b.y = Math.min(Math.max(b.y, BADGE_INSET + LS_BADGE_HALF_H), h - BADGE_INSET - LS_BADGE_HALF_H);
      }
    } else {
      setOriginScreen(null);
    }
    setLocalSpaceBadges(lsbadges);
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
      // The compass (resets bearing + tilt) stacks under +/−. It's hidden via CSS
      // in 2D (the `.proj-2d` container class) where the map is locked north-up.
      new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }),
      'top-right',
    );
    // Surface the +/− zoom hotkeys and the compass action in hover tooltips.
    const ctrlRoot = map.getContainer();
    const zoomInBtn = ctrlRoot.querySelector('.maplibregl-ctrl-zoom-in');
    const zoomOutBtn = ctrlRoot.querySelector('.maplibregl-ctrl-zoom-out');
    const compassBtn = ctrlRoot.querySelector('.maplibregl-ctrl-compass');
    zoomInBtn?.setAttribute('title', 'Zoom in (+)');
    zoomInBtn?.setAttribute('aria-label', 'Zoom in (+)');
    zoomOutBtn?.setAttribute('title', 'Zoom out (-)');
    zoomOutBtn?.setAttribute('aria-label', 'Zoom out (-)');
    compassBtn?.setAttribute('title', 'Reset bearing & tilt');
    compassBtn?.setAttribute('aria-label', 'Reset bearing & tilt');
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

    // Start locked flat north-up. applyProjection() (in the load handler) sets the
    // real projection + interaction state once the style is loaded — setProjection
    // throws before then. Keeps 2D identical to before; 3D switches on load.
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
      // Apply the persisted projection first (before the async glyph load) so a
      // 3D reload doesn't briefly flash the flat map.
      applyProjection(map, projectionRef.current);
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
    // The timeline bar can be dragged anywhere; it dispatches 'astro:hud-moved'
    // when it moves, so re-dodge the labels off its new rect right away rather
    // than waiting for the next pan/zoom.
    window.addEventListener('astro:hud-moved', scheduleBadges);

    mapRef.current = map;

    return () => {
      if (badgeRafRef.current) cancelAnimationFrame(badgeRafRef.current);
      window.removeEventListener('astro:hud-moved', scheduleBadges);
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
      applyProjection(map, projectionRef.current); // setStyle reset it; re-apply first
      await ensureGlyphImages(map, theme === 'dark' ? '' : LABEL_HALO_COLORS[theme], ZENITH_DISC_COLORS[theme]);
      applyDetailToggles(map, detailRef.current);
      setupCustomLayers(map, LABEL_HALO_COLORS[theme], measureColorRef.current, ZENITH_DISC_COLORS[theme]);
      pushData(map, dataRef.current);
      computeBadges();
    });
  }, [theme, computeBadges]);

  // Switch projection on demand (2D ↔ 3D). To 2D snaps flat north-up; to 3D leaves
  // the camera where it is (free rotate/tilt). Overlays recompute for the new view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || projectionRef.current === projection) return;
    projectionRef.current = projection;
    // Guard against a toggle before the first style load (setProjection throws):
    // the load handler will apply projectionRef.current once it's ready.
    if (map.isStyleLoaded()) {
      applyProjection(map, projection);
      scheduleBadges();
    }
  }, [projection, scheduleBadges]);

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
    // The hovered zenith stamp (drives its grow/brighten feature-state) + a themed
    // tooltip explaining what it is. Kept across moves; cleared on leave/teardown.
    let hoveredZenith: string | null = null;
    const zenithPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 22, // clear the stamp even at its enlarged hover size
      className: 'zenith-popup',
    });
    const clearZenith = () => {
      if (hoveredZenith !== null) {
        map.setFeatureState({ source: 'acg-zenith', id: hoveredZenith }, { hover: false });
        hoveredZenith = null;
      }
      zenithPopup.remove();
    };
    const showZenith = (zen: ZenithHit) => {
      if (hoveredZenith !== null && hoveredZenith !== zen.id) {
        map.setFeatureState({ source: 'acg-zenith', id: hoveredZenith }, { hover: false });
      }
      hoveredZenith = zen.id;
      map.setFeatureState({ source: 'acg-zenith', id: zen.id }, { hover: true });
      const name = PLANET_DISPLAY[zen.planet] ?? zen.planet;
      zenithPopup
        .setLngLat([zen.lng, zen.lat])
        .setHTML(
          `<div class="ui-tip"><span class="ui-tip-title">${name} zenith</span>` +
            `<span class="ui-tip-sub">where ${name} is directly overhead</span></div>`,
        );
      // Add once, then just reposition/retitle on subsequent moves (no DOM churn).
      if (!zenithPopup.isOpen()) zenithPopup.addTo(map);
    };

    // While the measurement tool is active, the map's pointer drives the ruler,
    // so suppress hover-relocation / pin interactions.
    const handleMove = (e: maplibregl.MapMouseEvent) => {
      if (measureActive) return;
      // A zenith stamp under the cursor wins: animate it + show the tooltip;
      // otherwise fall back to the map's CSS grab cursor.
      const zen = zenithAtPoint(map, e.point);
      if (zen) {
        map.getCanvas().style.cursor = 'pointer';
        showZenith(zen);
      } else {
        clearZenith();
        map.getCanvas().style.cursor = '';
      }
      onHover?.(e.lngLat.lat, e.lngLat.lng);
    };
    const handleLeave = () => {
      clearZenith();
      onLeave?.();
    };
    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (measureActive) return;
      // A click on (or near) a zenith stamp flies to it rather than relocating.
      const zen = zenithAtPoint(map, e.point);
      if (zen) {
        flyToPoint(zen.lng, zen.lat);
        return;
      }
      // Paran LINES are intentionally NOT click-to-fly — they're easy to hit by
      // accident. Use the paran's label badge (below), which flies to the
      // intersection; a click on the line just relocates the chart like anywhere.
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
      clearZenith();
    };
  }, [onHover, onLeave, onClick, onPinNatal, measureActive, flyToPoint]);

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

    // The endpoint auto-snaps to the nearest rendered chart line when the cursor is
    // close to one (snapToNearestLine returns null when nothing is within range);
    // otherwise it tracks the raw cursor.
    const pointFor = (e: maplibregl.MapMouseEvent): { lng: number; lat: number } =>
      snapToNearestLine(map, e.point) ?? { lng: e.lngLat.lng, lat: e.lngLat.lat };

    let origin: { lng: number; lat: number } | null = null;
    const onDown = (e: maplibregl.MapMouseEvent) => {
      // Left button only — right-click is reserved for cancelling the tool.
      if (e.originalEvent.button !== 0) return;
      // Leave Shift+drag to MapLibre's box-zoom rather than starting a measurement.
      if (e.originalEvent.shiftKey) return;
      origin = pointFor(e);
      setSegment(origin, origin);
      onMeasure?.(measureBetween(origin, origin));
    };
    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (!origin) return;
      const cur = pointFor(e);
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
      pushData(map, { lines, parans, localSpace, zenith, ecliptic, overlay });
      computeBadges();
    } else {
      map.once('load', () => {
        pushData(map, dataRef.current);
        computeBadges();
      });
    }
  }, [lines, parans, localSpace, localSpaceOrigin, zenith, ecliptic, overlay, computeBadges]);

  // Toggle basemap road / river / foliage visibility live (theme reloads reapply
  // via the style.load handler above).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    applyDetailToggles(map, { showRoads, showRivers, showLabels });
  }, [showRoads, showRivers, showLabels]);

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

  const zenithFill = ZENITH_DISC_COLORS[theme];
  const paranText = badgeTextColor(zenithFill);
  // Compass progress through COMPASS_ZOOM→CLOSE_ZOOM (null until it appears): drives
  // its scale (80%→full, alongside the LS labels) and fade (to full over the first
  // quarter of that range).
  const compassP =
    originScreen && localSpace.features.length > 0 && zoom >= COMPASS_ZOOM
      ? Math.min(1, (zoom - COMPASS_ZOOM) / (CLOSE_ZOOM - COMPASS_ZOOM))
      : null;
  // Natal ACG line labels fly to that planet's zenith on click — build the lookup.
  // (Overlay lines carry no zenith stamp, so their badges stay non-interactive.)
  // A plain object, not a Map — `Map` is this component's own name here.
  const zenithByPlanet: Record<string, [number, number]> = {};
  for (const f of zenith.features) {
    const c = f.geometry.coordinates;
    zenithByPlanet[f.properties.planet] = [c[0], c[1]];
  }
  return (
    <>
      <div ref={containerRef} className="map-container" />
      <div className="acg-edge-badges" aria-hidden="true">
        {badges.map((b) => {
          const text = badgeTextColor(b.color);
          const zenithTarget =
            b.prefix === '' ? zenithByPlanet[b.planet] : undefined;
          const inner = (
            <>
              {b.prefix && <span className="acg-badge-prefix">{b.prefix}</span>}
              <PlanetGlyph planet={b.planet} size={11} color={text} />
              <span className="acg-badge-code">{ANGLE_CODE[b.lineType]}</span>
            </>
          );
          // Natal labels fly to the planet's zenith (a clickable, hover-lifting
          // button); overlay labels stay plain, non-interactive spans.
          return zenithTarget ? (
            <button
              type="button"
              key={b.key}
              tabIndex={-1}
              className="acg-badge acg-badge-btn"
              style={{ left: b.x, top: b.y, background: b.color, color: text }}
              onClick={() => flyToPoint(zenithTarget[0], zenithTarget[1])}
              title={`Fly to ${PLANET_DISPLAY[b.planet]}'s zenith`}
            >
              {inner}
            </button>
          ) : (
            <span
              key={b.key}
              className="acg-badge"
              style={{ left: b.x, top: b.y, background: b.color, color: text }}
            >
              {inner}
            </span>
          );
        })}
        {paranBadges.map((b) => (
          <button
            type="button"
            key={b.key}
            tabIndex={-1}
            className="acg-badge paran-badge acg-badge-btn"
            style={{ left: b.x, top: b.y, background: zenithFill, color: paranText }}
            onClick={() => flyToPoint(b.targetLng, b.targetLat)}
            title="Fly to this paran's intersection"
          >
            {b.prefix && <span className="acg-badge-prefix">{b.prefix}</span>}
            <PlanetGlyph planet={b.planetA} size={11} color={paranText} />
            <span className="acg-badge-code">{ANGLE_CODE[b.angleA]}</span>
            <span className="paran-badge-x">×</span>
            <PlanetGlyph planet={b.planetB} size={11} color={paranText} />
            <span className="acg-badge-code">{ANGLE_CODE[b.angleB]}</span>
          </button>
        ))}
        {localSpaceBadges.map((b) => {
          const text = badgeTextColor(b.color);
          return (
            // Non-interactive label (LS lines aren't click-to-fly): glyph + azimuth,
            // with a color-matched arrow pointing outward (to the planet) or inward
            // (to the pin) along the line.
            <span
              key={b.key}
              className="acg-badge"
              style={{ left: b.x, top: b.y, background: b.color, color: text }}
            >
              <span className="acg-badge-prefix">LS</span>
              <PlanetGlyph planet={b.planet} size={11} color={text} />
              <span className="ls-deg">{b.azDeg}°</span>
              <span
                className="ls-arrow"
                style={{ color: b.color, transform: `rotate(${b.arrowDeg}deg)` }}
                aria-hidden="true"
              >
                <span className="ls-arrow-shaft" />
                <span className="ls-arrow-head" />
              </span>
            </span>
          );
        })}
      </div>
      {compassP !== null && originScreen && (
        <LocalHorizonWheel
          cx={originScreen.x}
          cy={originScreen.y}
          size={HORIZON_WHEEL_SIZE}
          scale={COMPASS_MIN_SCALE + (1 - COMPASS_MIN_SCALE) * compassP}
          opacity={COMPASS_MAX_OPACITY * Math.min(1, compassP / COMPASS_FADE_FRACTION)}
          bearing={originNorthDeg}
        />
      )}
      {/* Subtle escape hatch once deeply zoomed in (LS labels at full radius): a
          low-opacity pill, brighter on hover, that eases back to a wide overview. */}
      {zoom >= CLOSE_ZOOM && (
        <button
          type="button"
          className="map-zoom-out"
          onClick={() =>
            mapRef.current?.easeTo({ zoom: ZOOM_OUT_TARGET, duration: 600 })
          }
          aria-label="Zoom out to a wide view"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" />
            <path d="M8 11h6" />
          </svg>
          <span>Zoom out</span>
        </button>
      )}
    </>
  );
});
