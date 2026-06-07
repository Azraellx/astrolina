// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

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
import type { CrossingProps } from '../../lib/astro/localSpaceCrossings';
import {
  BASEMAP_STYLE_URLS,
  LABEL_HALO_COLORS,
  ZENITH_DISC_COLORS,
  type Theme,
} from '../../lib/theme';
import { PROJECTION_SPEC, type MapProjectionMode } from '../../lib/projection';
import type { MissionEvent } from '../../lib/missions';
import {
  isOccluded,
  projectVisible,
  screenAngleOfNorth,
} from '../../lib/mapProjection';
import { ensureGlyphImages, ZENITH_GLYPH_PREFIX } from './glyphImages';
import { applyDetailToggles } from './basemapStyle';
import { HoverTip, TipButton } from '../ui/HoverTip';
import { tipPosFor, type TipPos } from '../ui/useHoverTip';
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
import { PLANET_COLORS, type PlanetName } from '../../lib/ephemeris';
import { useT } from '../../i18n';
import type { EnumLabels } from '../../i18n';
import type { TFn } from '../../i18n';
import { PLANET_GLYPHS } from '../../lib/astro/glyphChars';
import { CreditsModal } from '../CreditsModal/CreditsModal';
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
  '.info-bar', // active-systems chip (bottom-right, above the attribution)
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

// Center-anchor a badge at screen (x, y) via the GPU `translate` property rather
// than left/top. left/top changes force a layout reflow each frame while panning;
// translate is handled on the compositor (no reflow), so the labels track the map
// smoothly. The calc()s fold in the -50% / -50% centering (% is of the badge's own
// size), and a non-none translate still makes each badge a stacking context (the LS
// arrow's z-index:-1 relies on that).
function badgePos(x: number, y: number): string {
  return `calc(${x}px - 50%) calc(${y}px - 50%)`;
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
// The "zoomed in close" threshold: one shared "zoomed-in-enough" mark. At this
// zoom the LS label ring reaches its max radius and the horizon compass its full
// size, the map's "Zoom out" escape button appears, AND the pin's reverse-geocode
// upgrades to the precise network lookup (App reads it via onDetailZoomChange →
// detailZoom). Lower it to make all of those kick in a little earlier.
const CLOSE_ZOOM = 8.5;
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
  /** The toward-planet ('out') half vs the reciprocal ('in') half. Only the
   *  'out' badge prints its bearing — the 'in' half is just "LS + glyph". */
  out: boolean;
  /** This half's bearing in the E=0 / N=90 convention, as degrees + arcminutes
   *  (e.g. "45°23'"). Static. Shown on the outgoing badge only. */
  azLabel: string;
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
  /** Sub-planetary (zenith) point per overlay body, so overlay labels can fly to
   *  it on click just like natal ones. No stamps are drawn for overlays. */
  zenith: FeatureCollection<Point, ZenithProps>;
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
  'local-space-layer-out',
  'local-space-layer-in',
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

// Closest screen-space point on one feature's polylines to `target`, with its pixel
// distance — shared by the cursor snap and the shift-constrain. Skips segments with
// a non-finite projection (a globe segment behind the camera / off the sphere).
// Null if no usable segment exists.
function closestScreenPointOnParts(
  map: maplibregl.Map,
  parts: number[][][],
  target: ScreenPt,
): (ScreenPt & { d: number }) | null {
  let bx = 0;
  let by = 0;
  let best = Infinity;
  for (const line of parts) {
    if (line.length < 2) continue;
    let prev = map.project(line[0] as [number, number]);
    for (let i = 1; i < line.length; i++) {
      const cur = map.project(line[i] as [number, number]);
      if (
        Number.isFinite(prev.x) &&
        Number.isFinite(prev.y) &&
        Number.isFinite(cur.x) &&
        Number.isFinite(cur.y)
      ) {
        const c = closestPointOnSegment(target, prev, cur);
        if (c.d < best) {
          best = c.d;
          bx = c.x;
          by = c.y;
        }
      }
      prev = cur;
    }
  }
  return best === Infinity ? null : { x: bx, y: by, d: best };
}

// Rendered chart lines within SNAP_RADIUS_PX of a screen point, each as its array
// of polylines (honours planet / overlay / paran / local-space visibility, since we
// only query layers that are actually drawn).
function lineFeaturesNear(map: maplibregl.Map, pt: ScreenPt): number[][][][] {
  const layers = SNAP_LINE_LAYERS.filter((id) => map.getLayer(id));
  if (layers.length === 0) return [];
  const feats = map.queryRenderedFeatures(
    [
      [pt.x - SNAP_RADIUS_PX, pt.y - SNAP_RADIUS_PX],
      [pt.x + SNAP_RADIUS_PX, pt.y + SNAP_RADIUS_PX],
    ],
    { layers },
  );
  return feats.map((f): number[][][] => {
    const g = f.geometry;
    return g.type === 'LineString'
      ? [g.coordinates]
      : g.type === 'MultiLineString'
        ? g.coordinates
        : [];
  });
}

// Nearest point (lng/lat) on any rendered chart line within SNAP_RADIUS_PX of the
// screen point, or null if nothing is close enough.
function snapToNearestLine(
  map: maplibregl.Map,
  pt: ScreenPt,
): { lng: number; lat: number } | null {
  let bx = 0;
  let by = 0;
  let best = Infinity;
  for (const parts of lineFeaturesNear(map, pt)) {
    const c = closestScreenPointOnParts(map, parts, pt);
    if (c && c.d < best) {
      best = c.d;
      bx = c.x;
      by = c.y;
    }
  }
  if (best === Infinity) return null;
  const ll = map.unproject([bx, by]);
  return { lng: ll.lng, lat: ll.lat };
}

// Shift-constrain (measure tool): of the chart lines under the cursor, pick the one
// the cursor is hovering (its polyline passes closest to the cursor), then return the
// point ON THAT line nearest the measure `origin` — the shortest hop from the first
// point to the line. Null when no line is within range of the cursor.
function constrainToHoveredLine(
  map: maplibregl.Map,
  cursor: ScreenPt,
  origin: { lng: number; lat: number },
): { lng: number; lat: number } | null {
  let hovered: number[][][] | null = null;
  let bestCursor = Infinity;
  for (const parts of lineFeaturesNear(map, cursor)) {
    const c = closestScreenPointOnParts(map, parts, cursor);
    if (c && c.d < bestCursor) {
      bestCursor = c.d;
      hovered = parts;
    }
  }
  if (!hovered) return null;
  const op = map.project([origin.lng, origin.lat] as [number, number]);
  const c = closestScreenPointOnParts(map, hovered, op);
  if (!c) return null;
  const ll = map.unproject([c.x, c.y]);
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

// ── Local-space × birth-chart crossing hover ────────────────────────────────────
// The crossing dots are small, so a query within a few px of the cursor counts as a
// hit; hovering one grows it + shows a .ui-tip explaining the crossing.
const CROSS_HIT_LAYER = 'acg-ls-cross-layer';
const CROSS_HIT_TOLERANCE_PX = 5;

interface CrossHit {
  id: number;
  lng: number;
  lat: number;
  lsPlanet: PlanetName;
  lsColor: string;
  acgPlanet: PlanetName;
  acgColor: string;
  acgLineType: LineType;
}

function crossAtPoint(map: maplibregl.Map, pt: ScreenPt): CrossHit | null {
  if (!map.getLayer(CROSS_HIT_LAYER)) return null;
  const t = CROSS_HIT_TOLERANCE_PX;
  const feats = map.queryRenderedFeatures(
    [
      [pt.x - t, pt.y - t],
      [pt.x + t, pt.y + t],
    ],
    { layers: [CROSS_HIT_LAYER] },
  );
  const f = feats[0];
  if (!f || f.id == null || !f.properties || f.geometry.type !== 'Point') {
    return null;
  }
  const [lng, lat] = f.geometry.coordinates as [number, number];
  return {
    id: Number(f.id),
    lng,
    lat,
    lsPlanet: f.properties.lsPlanet as PlanetName,
    lsColor: f.properties.lsColor as string,
    acgPlanet: f.properties.acgPlanet as PlanetName,
    acgColor: f.properties.acgColor as string,
    acgLineType: f.properties.acgLineType as LineType,
  };
}

// ── Plain line hover ────────────────────────────────────────────────────────────
// Hovering a bare line (not a stamp/dot/badge) shows a .ui-tip naming it — the same
// label its edge badge carries: planet glyph + name + angle (ACG), "LS" + body
// (local space), the two-body crossing (parans), or "Ecliptic".
const LINE_HIT_LAYERS = [
  'acg-lines-meridian',
  'acg-lines-horizon',
  'acg-lines-ov-meridian',
  'acg-lines-ov-horizon',
  'parans-layer',
  'parans-ov-layer',
  'local-space-layer-out',
  'local-space-layer-in',
  'local-space-ov-layer',
  'ecliptic-layer',
];
const LINE_HIT_TOLERANCE_PX = 3;

function glyphHtml(planet: PlanetName, color: string): string {
  return `<span class="astro-glyph cross-tip-glyph" style="color:${color}">${PLANET_GLYPHS[planet]}</span>`;
}
function tagHtml(t: string): string {
  return `<span class="cross-tip-tag">${t}</span>`;
}

function lineLabelHtml(
  layerId: string,
  props: Record<string, unknown>,
  t: TFn,
  labels: EnumLabels,
): string | null {
  const isOv = layerId.includes('-ov');
  // Overlay lines carry a tagged label ("Tr Ve MC"); lift the prefix off it.
  const pre =
    isOv && typeof props.label === 'string' ? tagHtml(props.label.split(' ')[0]) : '';
  let row: string | null = null;
  if (layerId.startsWith('acg-lines')) {
    const planet = props.planet as PlanetName;
    row =
      pre +
      glyphHtml(planet, props.color as string) +
      `${labels.planet(planet)} ${tagHtml(ANGLE_CODE[props.lineType as LineType])}`;
  } else if (layerId.startsWith('local-space')) {
    const planet = props.planet as PlanetName;
    row = tagHtml('LS') + glyphHtml(planet, props.color as string) + labels.planet(planet);
  } else if (layerId.startsWith('parans')) {
    const pa = props.planetA as PlanetName;
    const pb = props.planetB as PlanetName;
    row =
      pre +
      glyphHtml(pa, PLANET_COLORS[pa]) +
      `${labels.planet(pa)} ${tagHtml(ANGLE_CODE[props.angleA as LineType])}` +
      `<span class="cross-tip-x">×</span>` +
      glyphHtml(pb, PLANET_COLORS[pb]) +
      `${labels.planet(pb)} ${tagHtml(ANGLE_CODE[props.angleB as LineType])}`;
  } else if (layerId === 'ecliptic-layer') {
    row = t('map.ecliptic');
  }
  return row ? `<div class="ui-tip"><span class="cross-tip-row">${row}</span></div>` : null;
}

function lineAtPoint(
  map: maplibregl.Map,
  pt: ScreenPt,
  t: TFn,
  labels: EnumLabels,
): { id: string; html: string } | null {
  const layers = LINE_HIT_LAYERS.filter((l) => map.getLayer(l));
  if (!layers.length) return null;
  const tol = LINE_HIT_TOLERANCE_PX;
  const feats = map.queryRenderedFeatures(
    [
      [pt.x - tol, pt.y - tol],
      [pt.x + tol, pt.y + tol],
    ],
    { layers },
  );
  const f = feats[0];
  if (!f || !f.properties) return null;
  const html = lineLabelHtml(f.layer.id, f.properties, t, labels);
  if (!html) return null;
  // Stable id so the popup HTML is only re-set when the hovered line changes.
  return { id: `${f.layer.id}|${f.properties.label ?? f.properties.planet ?? ''}`, html };
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
  /** Dots where local-space lines cross birth-chart lines (empty when LS hidden). */
  localSpaceCross: FeatureCollection<Point, CrossingProps>;
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
  /** Emits map-originated onboarding mission events (measure point/snap, zoom-out click,
   *  box-zoom, perspective change). Must be STABLE — read inside long-lived map effects
   *  (e.g. the measure drag) that would otherwise re-subscribe and drop their state. */
  onMissionEvent?: (event: MissionEvent) => void;
  onHover?: (lat: number, lng: number) => void;
  onLeave?: () => void;
  /** Double-tap the map to drop / move the pin. */
  onPlacePin?: (lat: number, lng: number) => void;
  /** Right-click: remove the pin, or — with none placed — drop the natal pin. */
  onRightClick?: () => void;
  /** A plain click anywhere on the map — used to surface onboarding missions. */
  onMapClick?: () => void;
  /** Fires when the map crosses the "detail" zoom (CLOSE_ZOOM — the level where the
   *  Zoom-out button appears): true once zoomed in past it. Lets the app gate the
   *  network reverse-geocoder to zooms where the exact town actually matters. */
  onDetailZoomChange?: (detail: boolean) => void;
  /** Force the "Zoom Out" escape pill to stay visible even below the detail zoom —
   *  used while the zoom onboarding guide is open, so its click mission stays doable
   *  after the user zooms back out. */
  keepZoomOutVisible?: boolean;
}

interface MapData {
  lines: FeatureCollection<LineString, LineProps>;
  parans: FeatureCollection<LineString, ParanProps>;
  localSpace: FeatureCollection<LineString, LocalSpaceProps>;
  localSpaceCross: FeatureCollection<Point, CrossingProps>;
  localSpaceOrigin?: { lat: number; lng: number } | null;
  zenith: FeatureCollection<Point, ZenithProps>;
  ecliptic?: FeatureCollection<LineString> | null;
  overlay?: OverlayData | null;
}

export interface MapHandle {
  /** Recenter the map on a coordinate. Without `zoom`, eases to a usable zoom if
   *  zoomed out (keeping the current zoom otherwise); with `zoom`, sets it exactly
   *  (so Teleport can frame a country wide vs a city tight). */
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  /** Like flyTo, but first stashes the current view as the Teleport "go back"
   *  target (so a search jump can be undone). */
  teleportTo: (lat: number, lng: number, zoom?: number) => void;
  /** Fly to the stashed "go back" view, swapping it for the current one — so the
   *  same control toggles between the two locations (two-deep back/forward). */
  teleportBack: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

// A saved camera view (for one-slot back/forward toggles).
interface SavedView {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}
function snapshotView(map: maplibregl.Map): SavedView {
  const c = map.getCenter();
  return {
    center: [c.lng, c.lat],
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
}

// Fly the camera to lng/lat at `zoom`, nudged clear of the left-docked expanded
// sidebar (its width is published as --es-width on <html>): shift right by a
// quarter-width so the target lands where the centered nav/timeline bars sit
// rather than behind the panel. Shared by flyTo / teleportTo and the paran / LS /
// zenith label clicks.
function flyWithSidebarOffset(
  map: maplibregl.Map,
  lng: number,
  lat: number,
  zoom: number,
) {
  const esWidth =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--es-width'),
    ) || 0;
  map.flyTo({
    center: [lng, lat],
    zoom,
    offset: [esWidth / 4, 0],
    essential: true,
  });
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
  textSize = 15,
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
      'text-size': textSize,
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
  // Both halves at the normal LS weight; direction reads from the dash pattern (and
  // the → / ← chevrons): the outgoing (toward-planet) half is solid, the inward
  // (nadir) half dashed. Split into two layers because line-dasharray can't be a
  // data-driven ('get direction') expression in MapLibre.
  map.addLayer({
    id: 'local-space-layer-out',
    source: 'local-space',
    type: 'line',
    filter: lsDir('out'),
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 1.2,
      'line-opacity': 0.75,
    },
  });
  map.addLayer({
    id: 'local-space-layer-in',
    source: 'local-space',
    type: 'line',
    filter: lsDir('in'),
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 1.2,
      'line-opacity': 0.75,
      'line-dasharray': [2, 2],
    },
  });
  // Outward ('→', toward the planet) and inward ('←', back toward the origin)
  // arrows mark the two halves of each local-space axis. The outward chevrons are
  // oversized (2×) for emphasis; the inward ones stay normal.
  addArrowLayer(map, 'local-space-arrows-out', 'local-space', lsDir('out'), '→', 30);
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

  // ── Local-space × birth-chart crossings: a small dot wherever a local-space line
  // meets an ACG line, filled with a blend of the two line colors. Drawn above the
  // lines (below the zenith stamps); grows a touch on hover, where a .ui-tip explains
  // it.
  map.addSource('acg-ls-cross', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
  map.addLayer({
    id: 'acg-ls-cross-layer',
    source: 'acg-ls-cross',
    type: 'circle',
    paint: {
      'circle-radius': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        6,
        4,
      ],
      'circle-radius-transition': { duration: 150, delay: 0 },
      'circle-color': ['get', 'color'],
      'circle-stroke-color': haloColor || 'rgba(0,0,0,0.4)',
      'circle-stroke-width': 1.25,
    },
  });

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
  const lsx = map.getSource('acg-ls-cross') as maplibregl.GeoJSONSource | undefined;
  const zen = map.getSource('acg-zenith') as maplibregl.GeoJSONSource | undefined;
  const ecl = map.getSource('ecliptic') as maplibregl.GeoJSONSource | undefined;
  if (acg) acg.setData(data.lines);
  if (par) par.setData(data.parans);
  if (ls) ls.setData(data.localSpace);
  if (lsx) lsx.setData(data.localSpaceCross);
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
  localSpaceCross,
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
  onMissionEvent,
  keepZoomOutVisible,
  onHover,
  onLeave,
  onPlacePin,
  onRightClick,
  onMapClick,
  onDetailZoomChange,
}: MapProps, ref) {
  const { t, labels } = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // One-slot "go back" view for the Teleport window: teleportTo() stashes the
  // pre-jump camera here; teleportBack() swaps current<->saved so the same button
  // toggles between the two locations (two-deep, like browser back/forward).
  const teleportBackRef = useRef<SavedView | null>(null);

  useImperativeHandle(ref, () => ({
    flyTo: (lat: number, lng: number, zoom?: number) => {
      const map = mapRef.current;
      if (!map) return;
      flyWithSidebarOffset(map, lng, lat, zoom ?? Math.max(map.getZoom(), 4));
    },
    teleportTo: (lat: number, lng: number, zoom?: number) => {
      const map = mapRef.current;
      if (!map) return;
      // Remember where we are so "Go back" can return here.
      teleportBackRef.current = snapshotView(map);
      flyWithSidebarOffset(map, lng, lat, zoom ?? Math.max(map.getZoom(), 4));
    },
    teleportBack: () => {
      const map = mapRef.current;
      const saved = teleportBackRef.current;
      if (!map || !saved) return;
      // Swap: stash the current view so a second press goes forward again.
      teleportBackRef.current = snapshotView(map);
      map.flyTo({
        center: saved.center,
        zoom: saved.zoom,
        bearing: saved.bearing,
        pitch: saved.pitch,
        essential: true,
      });
    },
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
  }), []);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onRightClickRef = useRef(onRightClick);
  const dataRef = useRef<MapData>({ lines, parans, localSpace, localSpaceCross, localSpaceOrigin, zenith, ecliptic, overlay });
  const themeRef = useRef(theme);
  // Current projection mode, read inside the once-bound load/style.load handlers
  // (setStyle resets projection, so it must be re-applied after each style load).
  const projectionRef = useRef(projection);
  // Read inside the (once-bound) load/style.load handlers so they always paint
  // the measure layers with the latest map-state accent.
  const measureColorRef = useRef(measureColor);
  // Current detail toggles, read inside the (once-bound) load/style.load handlers.
  const detailRef = useRef({ showRoads, showRivers, showLabels });
  // The map's load/style.load/click handlers are bound once and never rebound;
  // refresh these refs after each commit (not during render) so those async
  // handlers always read the latest props.
  useEffect(() => {
    onRightClickRef.current = onRightClick;
    dataRef.current = { lines, parans, localSpace, localSpaceCross, localSpaceOrigin, zenith, ecliptic, overlay };
    measureColorRef.current = measureColor;
    detailRef.current = { showRoads, showRivers, showLabels };
  });

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
    flyWithSidebarOffset(map, lng, lat, Math.max(map.getZoom(), 4));
  }, []);

  // Clicking a paran badge flies to that paran's intersection; clicking the SAME
  // badge again returns to wherever you were when you first clicked it (a toggle).
  // Keyed by the paran's content so it survives the index-based badge recomputes.
  const paranReturnRef = useRef<(SavedView & { id: string }) | null>(null);
  const onParanClick = useCallback(
    (b: ParanBadge) => {
      const map = mapRef.current;
      if (!map) return;
      const id = `${b.prefix}|${b.planetA}|${b.angleA}|${b.planetB}|${b.angleB}`;
      const saved = paranReturnRef.current;
      if (saved && saved.id === id) {
        // Second click on the same paran — fly back to the saved view.
        paranReturnRef.current = null;
        map.flyTo({
          center: saved.center,
          zoom: saved.zoom,
          bearing: saved.bearing,
          pitch: saved.pitch,
          essential: true,
        });
        return;
      }
      paranReturnRef.current = { id, ...snapshotView(map) };
      flyToPoint(b.targetLng, b.targetLat);
    },
    [flyToPoint],
  );

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
        // Bearing in the E=0 / N=90 convention, formatted as degrees + arcminutes.
        const azE = (90 - bearingAzN + 360) % 360;
        let azWhole = Math.floor(azE);
        let azMin = Math.round((azE - azWhole) * 60);
        if (azMin === 60) {
          azMin = 0;
          azWhole = (azWhole + 1) % 360;
        }
        const azLabel = `${azWhole}°${String(azMin).padStart(2, '0')}'`;
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
          out,
          azLabel,
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

  // Hover/focus tip for the MapLibre-rendered zoom + compass buttons (plain DOM,
  // so the portaled HoverTip is driven imperatively from the init effect below).
  const [ctrlTip, setCtrlTip] = useState<
    { pos: TipPos; title: string; hotkey?: string } | null
  >(null);
  // The "AstroLina" entry in the map attribution bar opens this credits / license
  // dialog (the secondary disclosures that needn't sit on the map at all times).
  const [creditsOpen, setCreditsOpen] = useState(false);

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
    // The +/− zoom and compass buttons are MapLibre-rendered DOM. Give them the
    // shared HoverTip (with +/− hotkey callouts) instead of a native title: drop
    // `title`, keep `aria-label` as the accessible name, and drive the tip from
    // hover/focus listeners (torn down with the map in this effect's cleanup).
    const ctrlRoot = map.getContainer();
    const ctrlTipDefs: { sel: string; label: string; hotkey?: string }[] = [
      { sel: '.maplibregl-ctrl-zoom-in', label: t('map.ctrl.zoomIn'), hotkey: '+' },
      { sel: '.maplibregl-ctrl-zoom-out', label: t('map.ctrl.zoomOut'), hotkey: '−' },
      { sel: '.maplibregl-ctrl-compass', label: t('map.ctrl.resetBearing') },
    ];
    const ctrlTipCleanups: (() => void)[] = [];
    for (const def of ctrlTipDefs) {
      const el = ctrlRoot.querySelector(def.sel);
      if (!el) continue;
      el.removeAttribute('title');
      el.setAttribute('aria-label', def.label);
      const enter = () =>
        setCtrlTip({
          pos: tipPosFor(el.getBoundingClientRect(), 'left'),
          title: def.label,
          hotkey: def.hotkey,
        });
      const leave = () => setCtrlTip(null);
      el.addEventListener('mouseenter', enter);
      el.addEventListener('mouseleave', leave);
      el.addEventListener('focus', enter);
      el.addEventListener('blur', leave);
      ctrlTipCleanups.push(() => {
        el.removeEventListener('mouseenter', enter);
        el.removeEventListener('mouseleave', leave);
        el.removeEventListener('focus', enter);
        el.removeEventListener('blur', leave);
      });
    }
    map.addControl(
      new maplibregl.AttributionControl({
        compact: false,
        // The basemap style already credits OpenStreetMap (the one credit that
        // legally has to stay on the map, and which also covers the OSM-derived
        // Nominatim geocoding). Everything else — GeoNames, Swiss Ephemeris, the
        // fonts, the basemap style licence — needn't be on screen at all times,
        // so it moves behind this "AstroLina" button, which opens the credits
        // dialog (CreditsModal). The button is also where AstroLina's own
        // copyright lives. Wired below via a delegated click on the map container
        // so it survives the attribution being re-rendered on a theme/style swap.
        customAttribution: [
          '<button type="button" class="acg-credits-btn" aria-haspopup="dialog">AstroLina</button>',
        ],
      }),
      'bottom-right',
    );
    const onCreditsClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest('.acg-credits-btn')) {
        e.preventDefault();
        setCreditsOpen(true);
      }
    };
    ctrlRoot.addEventListener('click', onCreditsClick);

    // Start locked flat north-up. applyProjection() (in the load handler) sets the
    // real projection + interaction state once the style is loaded — setProjection
    // throws before then. Keeps 2D identical to before; 3D switches on load.
    map.dragRotate.disable();
    map.touchPitch.disable();
    map.touchZoomRotate.disableRotation();
    // Double-tap drops a pin (handleDoubleClick), so suppress the default zoom-in.
    // (applyProjection toggles rotate/pitch per mode but never touches this.)
    map.doubleClickZoom.disable();

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
      ctrlRoot.removeEventListener('click', onCreditsClick);
      ctrlTipCleanups.forEach((fn) => fn());
      setCtrlTip(null);
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // `t` is read once to label the bound-once nav-control tips; intentionally not a
    // dep so a locale change never tears down and recreates the whole map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // The hovered crossing dot (grow feature-state) + its .ui-tip.
    let hoveredCross: number | null = null;
    const crossPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 14,
      className: 'zenith-popup',
    });
    const clearCross = () => {
      if (hoveredCross !== null) {
        map.setFeatureState({ source: 'acg-ls-cross', id: hoveredCross }, { hover: false });
        hoveredCross = null;
      }
      crossPopup.remove();
    };
    const showCross = (cross: CrossHit) => {
      if (hoveredCross !== null && hoveredCross !== cross.id) {
        map.setFeatureState({ source: 'acg-ls-cross', id: hoveredCross }, { hover: false });
      }
      hoveredCross = cross.id;
      map.setFeatureState({ source: 'acg-ls-cross', id: cross.id }, { hover: true });
      const lsName = labels.planet(cross.lsPlanet) ?? cross.lsPlanet;
      const acgName = labels.planet(cross.acgPlanet) ?? cross.acgPlanet;
      // Stacked, like the line badges: "LS <glyph> Mars" / "×" / "Ds <glyph> Venus".
      const row = (tag: string, glyph: string, color: string, name: string) =>
        `<span class="cross-tip-row"><span class="cross-tip-tag">${tag}</span>` +
        `<span class="astro-glyph cross-tip-glyph" style="color:${color}">${glyph}</span>${name}</span>`;
      crossPopup
        .setLngLat([cross.lng, cross.lat])
        .setHTML(
          `<div class="ui-tip cross-tip">` +
            row('LS', PLANET_GLYPHS[cross.lsPlanet], cross.lsColor, lsName) +
            `<span class="cross-tip-x">×</span>` +
            row(
              ANGLE_CODE[cross.acgLineType],
              PLANET_GLYPHS[cross.acgPlanet],
              cross.acgColor,
              acgName,
            ) +
          `</div>`,
        );
      if (!crossPopup.isOpen()) crossPopup.addTo(map);
    };
    // The hovered bare line's .ui-tip (label only). Follows the cursor along the line.
    let hoveredLine: string | null = null;
    const linePopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: 'zenith-popup',
    });
    const clearLine = () => {
      hoveredLine = null;
      linePopup.remove();
    };
    const showLine = (hit: { id: string; html: string }, at: maplibregl.LngLat) => {
      linePopup.setLngLat(at);
      if (hoveredLine !== hit.id) {
        hoveredLine = hit.id;
        linePopup.setHTML(hit.html);
      }
      if (!linePopup.isOpen()) linePopup.addTo(map);
    };
    const showZenith = (zen: ZenithHit) => {
      if (hoveredZenith !== null && hoveredZenith !== zen.id) {
        map.setFeatureState({ source: 'acg-zenith', id: hoveredZenith }, { hover: false });
      }
      hoveredZenith = zen.id;
      map.setFeatureState({ source: 'acg-zenith', id: zen.id }, { hover: true });
      const name = labels.planet(zen.planet) ?? zen.planet;
      zenithPopup
        .setLngLat([zen.lng, zen.lat])
        .setHTML(
          `<div class="ui-tip"><span class="ui-tip-title">${t('map.zenithTitle', { planet: name })}</span>` +
            `<span class="ui-tip-sub">${t('map.zenithSub', { planet: name })}</span></div>`,
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
        clearCross();
        clearLine();
        map.getCanvas().style.cursor = 'pointer';
        showZenith(zen);
      } else {
        const cross = crossAtPoint(map, e.point);
        if (cross) {
          clearZenith();
          clearLine();
          map.getCanvas().style.cursor = 'pointer';
          showCross(cross);
        } else {
          // A bare line under the cursor just names itself (hover tip); it isn't a
          // click target, so the cursor stays the map's default (no pointer).
          const line = lineAtPoint(map, e.point, t, labels);
          if (line) {
            clearZenith();
            clearCross();
            showLine(line, e.lngLat);
          } else {
            clearZenith();
            clearCross();
            clearLine();
          }
          map.getCanvas().style.cursor = '';
        }
      }
      onHover?.(e.lngLat.lat, e.lngLat.lng);
    };
    const handleLeave = () => {
      clearZenith();
      clearCross();
      clearLine();
      onLeave?.();
    };
    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (measureActive) return;
      // Any map click can surface onboarding missions (the handler itself decides
      // whether anything is due).
      onMapClick?.();
      // A click on (or near) a zenith stamp flies to it. Pin placement is a
      // double-tap now, so a plain click no longer relocates the chart.
      const zen = zenithAtPoint(map, e.point);
      if (zen) flyToPoint(zen.lng, zen.lat);
    };
    const handleDoubleClick = (e: maplibregl.MapMouseEvent) => {
      if (measureActive) return;
      // Double-tap drops / moves the pin — but not on a zenith stamp, whose single
      // clicks already fly there, so the stamp stays a fly-to target.
      if (zenithAtPoint(map, e.point)) return;
      onPlacePin?.(e.lngLat.lat, e.lngLat.lng);
    };
    const handleContext = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      if (measureActive) return;
      // Remove the pin, or — with none placed — drop the natal pin.
      onRightClick?.();
    };
    map.on('mousemove', handleMove);
    map.on('mouseout', handleLeave);
    map.on('click', handleClick);
    map.on('dblclick', handleDoubleClick);
    map.on('contextmenu', handleContext);
    return () => {
      map.off('mousemove', handleMove);
      map.off('mouseout', handleLeave);
      map.off('click', handleClick);
      map.off('dblclick', handleDoubleClick);
      map.off('contextmenu', handleContext);
      clearZenith();
      clearCross();
      clearLine();
    };
  }, [onHover, onLeave, onPlacePin, onRightClick, onMapClick, measureActive, flyToPoint, t, labels]);

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
      onMissionEvent?.('measure-point');
    };
    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (!origin) return;
      // Hold Shift while dragging over a line to lock the moving endpoint to the
      // point on that hovered line CLOSEST to the first point — i.e. the shortest
      // hop from your origin to the line (the distance-to-this-line you usually
      // want in ACG). Falls back to the normal cursor / snap when no line is under
      // the cursor.
      let cur: { lng: number; lat: number };
      if (e.originalEvent.shiftKey) {
        const snapped = constrainToHoveredLine(map, e.point, origin);
        if (snapped) {
          cur = snapped;
          onMissionEvent?.('measure-snap'); // Shift actually locked onto a line
        } else {
          cur = pointFor(e);
        }
      } else {
        cur = pointFor(e);
      }
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
  }, [measureActive, onMeasure, onMeasureCancel, onMissionEvent]);

  // Onboarding signals for the zoom/perspective guide: a Shift+drag box-zoom, and a
  // USER drag-rotate (Ctrl/⌘+drag or right-drag, 3D only — dragRotate is disabled in
  // 2D). The originalEvent guard skips programmatic camera moves (flyTo etc.).
  // onMissionEvent is stable, so this binds once and never re-subscribes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onBoxZoom = () => onMissionEvent?.('box-zoom');
    const onRotate = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) onMissionEvent?.('pitch-rotate');
    };
    map.on('boxzoomend', onBoxZoom);
    map.on('rotatestart', onRotate);
    map.on('pitchstart', onRotate);
    return () => {
      map.off('boxzoomend', onBoxZoom);
      map.off('rotatestart', onRotate);
      map.off('pitchstart', onRotate);
    };
  }, [onMissionEvent]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded() && map.getSource('acg-lines')) {
      pushData(map, { lines, parans, localSpace, localSpaceCross, zenith, ecliptic, overlay });
      computeBadges();
    } else {
      map.once('load', () => {
        pushData(map, dataRef.current);
        computeBadges();
      });
    }
  }, [lines, parans, localSpace, localSpaceCross, localSpaceOrigin, zenith, ecliptic, overlay, computeBadges]);

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
      // Frosted-glass teardrop pin (drawn in CSS, .map-pin-body) so it matches the
      // app's glass panels and tints with the location-state color instead of the
      // old fixed gold/grey artwork. The aura is that color glowing out from the
      // pin's centre (the inverted edge-glow); the ring pulses from the tip; only the
      // glass head is clickable (transparent gaps stay click-through).
      el.innerHTML =
        '<span class="map-pin-aura"></span>' +
        '<span class="map-pin-glow"></span>' +
        '<span class="map-pin-body"></span>';
      // Right-click the pin to remove it (matches the map's right-click-to-remove).
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onRightClickRef.current?.();
      });
      markerRef.current = new maplibregl.Marker({
        element: el,
        // Anchor the tip on the point; nudge down so the very tip (not the SVG's
        // bottom padding) lands on the coordinate.
        anchor: 'bottom',
        offset: [0, 2],
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
        ? t('map.pin.natal')
        : t('map.pin.custom');
  }, [pin, pinType, t]);

  // Tell the app when we cross into "detail" zoom (the level where the Zoom-out
  // button appears), so it can gate the network reverse-geocoder to where town-level
  // precision matters. setState identity is stable, so this only re-runs on a zoom
  // change.
  useEffect(() => {
    onDetailZoomChange?.(zoom >= CLOSE_ZOOM);
  }, [zoom, onDetailZoomChange]);

  const zenithFill = ZENITH_DISC_COLORS[theme];
  const paranText = badgeTextColor(zenithFill);
  // Compass progress through COMPASS_ZOOM→CLOSE_ZOOM (null until it appears): drives
  // its scale (80%→full, alongside the LS labels) and fade (to full over the first
  // quarter of that range).
  const compassP =
    originScreen && localSpace.features.length > 0 && zoom >= COMPASS_ZOOM
      ? Math.min(1, (zoom - COMPASS_ZOOM) / (CLOSE_ZOOM - COMPASS_ZOOM))
      : null;
  // ACG line labels fly to that body's zenith on click — build the lookup. Natal
  // labels read the natal zenith stamps; overlay labels read the overlay's own
  // zenith points (computed but not drawn as stamps). Plain objects, not a Map —
  // `Map` is this component's own name here.
  const zenithByPlanet: Record<string, [number, number]> = {};
  for (const f of zenith.features) {
    const c = f.geometry.coordinates;
    zenithByPlanet[f.properties.planet] = [c[0], c[1]];
  }
  const zenithByOverlayPlanet: Record<string, [number, number]> = {};
  for (const f of overlay?.zenith.features ?? []) {
    const c = f.geometry.coordinates;
    zenithByOverlayPlanet[f.properties.planet] = [c[0], c[1]];
  }
  return (
    <>
      <div ref={containerRef} className="map-container" />
      {creditsOpen && <CreditsModal onClose={() => setCreditsOpen(false)} />}
      <HoverTip
        pos={ctrlTip?.pos ?? null}
        placement="left"
        title={ctrlTip?.title ?? ''}
        hotkey={ctrlTip?.hotkey}
      />
      <div className="acg-edge-badges" aria-hidden="true">
        {badges.map((b) => {
          const text = badgeTextColor(b.color);
          const zenithTarget =
            b.prefix === ''
              ? zenithByPlanet[b.planet]
              : zenithByOverlayPlanet[b.planet];
          const inner = (
            <>
              {b.prefix && <span className="acg-badge-prefix">{b.prefix}</span>}
              <PlanetGlyph planet={b.planet} size={11} color={text} />
              <span className="acg-badge-code">{ANGLE_CODE[b.lineType]}</span>
            </>
          );
          // Natal AND overlay labels fly to their body's zenith (a clickable,
          // hover-lifting button); only labels without a zenith (e.g. the nodes, or
          // when MC is hidden) stay plain, non-interactive spans.
          return zenithTarget ? (
            <TipButton
              type="button"
              key={b.key}
              tabIndex={-1}
              className="acg-badge acg-badge-btn"
              style={{ translate: badgePos(b.x, b.y), background: b.color, color: text }}
              onClick={() => flyToPoint(zenithTarget[0], zenithTarget[1])}
              placement="top"
              tip={t('map.flyToZenith', {
                prefix: b.prefix ? `${b.prefix} ` : '',
                planet: labels.planet(b.planet),
              })}
            >
              {inner}
            </TipButton>
          ) : (
            <span
              key={b.key}
              className="acg-badge"
              style={{ translate: badgePos(b.x, b.y), background: b.color, color: text }}
            >
              {inner}
            </span>
          );
        })}
        {paranBadges.map((b) => (
          <TipButton
            type="button"
            key={b.key}
            tabIndex={-1}
            className="acg-badge paran-badge acg-badge-btn"
            style={{ translate: badgePos(b.x, b.y), background: zenithFill, color: paranText }}
            onClick={() => onParanClick(b)}
            placement="top"
            tip={t('map.flyToParan')}
          >
            {b.prefix && <span className="acg-badge-prefix">{b.prefix}</span>}
            <PlanetGlyph planet={b.planetA} size={11} color={paranText} />
            <span className="acg-badge-code">{ANGLE_CODE[b.angleA]}</span>
            <span className="paran-badge-x">×</span>
            <PlanetGlyph planet={b.planetB} size={11} color={paranText} />
            <span className="acg-badge-code">{ANGLE_CODE[b.angleB]}</span>
          </TipButton>
        ))}
        {localSpaceBadges.map((b) => {
          const text = badgeTextColor(b.color);
          return (
            // Clicking an LS label flies to the local-space origin — where the lines
            // converge (the pin). Both halves show LS + glyph; only the outgoing
            // (toward-planet) half also prints its bearing (degrees + arcminutes).
            <TipButton
              type="button"
              key={b.key}
              tabIndex={-1}
              className="acg-badge acg-badge-btn"
              style={{ translate: badgePos(b.x, b.y), background: b.color, color: text }}
              onClick={() =>
                localSpaceOrigin &&
                flyToPoint(localSpaceOrigin.lng, localSpaceOrigin.lat)
              }
              placement="top"
              tip={t('map.flyToLocalSpaceOrigin')}
            >
              <span className="acg-badge-prefix">LS</span>
              <PlanetGlyph planet={b.planet} size={11} color={text} />
              {b.out && <span className="ls-deg">{b.azLabel}</span>}
            </TipButton>
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
          low-opacity pill, brighter on hover, that eases back to a wide overview. Kept
          visible while the zoom guide is open so its click mission stays completable. */}
      {(zoom >= CLOSE_ZOOM || keepZoomOutVisible) && (
        <button
          type="button"
          className="map-zoom-out"
          onClick={() => {
            mapRef.current?.easeTo({ zoom: ZOOM_OUT_TARGET, duration: 600 });
            onMissionEvent?.('zoom-out-click');
          }}
          aria-label={t('map.zoomOutToWide')}
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
          <span>{t('map.zoomOut')}</span>
        </button>
      )}
    </>
  );
});
