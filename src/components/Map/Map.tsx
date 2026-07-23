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
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import maplibregl, {
  type ExpressionSpecification,
  type StyleSpecification,
} from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson';
import type { LineProps, ZenithProps } from '../../lib/astro/lines';
import { getCaptureBrand } from '../../lib/captureBrand';
import { addPngMetadata } from '../../lib/pngMeta';
import { isTouchLayout } from '../../lib/touch';
import {
  CaptureExtras,
  type CaptureFrameExtras,
} from '../CaptureExtras/CaptureExtras';
import type { OrbBandProps } from '../../lib/astro/orbBands';
import type { StarLineProps } from '../../lib/astro/starLines';
import type { NightShadeProps } from '../../lib/astro/nightShade';
import { aspectBranchReading, type AngleOverlayLineProps, type AspectKind } from '../../lib/astro/angleAspects';
import type { ParanProps } from '../../lib/astro/parans';
import type { LocalSpaceProps } from '../../lib/astro/localSpace';
import type { CrossingProps } from '../../lib/astro/localSpaceCrossings';
import type { EclipseMapData } from '../../lib/astro/eclipses';
import {
  BASEMAP_STYLE_URLS,
  WORLD_FALLBACK_COLORS,
  LABEL_HALO_COLORS,
  ECLIPSE_LABEL_HALO,
  ZENITH_DISC_COLORS,
  type Theme,
} from '../../lib/theme';
import { PROJECTION_SPEC, type MapProjectionMode } from '../../lib/projection';
import type { MissionEvent } from '../../lib/missions';
import type { LineCardDistance } from '../../lib/lineCard';
import {
  isOccluded,
  projectVisible,
  screenAngleOfNorth,
} from '../../lib/mapProjection';
import { ensureGlyphImages, STAR_MARK_IMAGE, ZENITH_GLYPH_PREFIX, NADIR_GLYPH_PREFIX } from './glyphImages';
import { applyDetailToggles, applyLabelContrast } from './basemapStyle';
import { MapOverlayHost } from './MapOverlayHost';
import {
  MAP_CLICK_EVENT,
  MAP_DBLCLICK_EVENT,
  type MapClickDetail,
} from '../../lib/extensions/mapOverlays';
import type { MapExtensionContext } from '../../lib/extensions/mapExtensions';
import {
  PIN_CLICK_EVENT,
  usePinAdornment,
  usePinCelebrations,
  type PinClickDetail,
} from '../../lib/extensions/pinAdornment';
import { getParanAnnotation } from '../../lib/extensions/paranAnnotation';
import { HoverTip, TipButton } from '../ui/HoverTip';
import { bindTouchTip, tipPosFor, type TipPos } from '../ui/useHoverTip';
import {
  computeLineBadges,
  dodgeBadges,
  spreadBadges,
  clipSegmentToView,
  type AvoidRect,
  type BadgeSize,
  type LineBadge,
} from './edgeAnchors';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import { LocalHorizonWheel } from '../LocalHorizonWheel/LocalHorizonWheel';
import type { LineType } from '../../lib/astro/lines';
import { OPPOSITE_ANGLE } from '../../lib/astro/lines';
import { PLANET_COLORS, type PlanetName } from '../../lib/ephemeris';
import { useT } from '../../i18n';
import type { EnumLabels } from '../../i18n';
import type { TFn } from '../../i18n';
import { ASPECT_GLYPHS, PLANET_GLYPHS } from '../../lib/astro/glyphChars';
import { CreditsModal } from '../CreditsModal/CreditsModal';
import 'maplibre-gl/dist/maplibre-gl.css';
import './Map.css';

const EMPTY_FC = <T,>(): FeatureCollection<LineString, T> => ({
  type: 'FeatureCollection',
  features: [],
});

// Tile options for the line / paran / zenith sources. The buffer makes neighbouring
// tiles overlap so an antimeridian-crossing line has no hairline seam at the ±180°
// world boundary (geojson-vt wraps the out-of-range longitudes into the adjacent
// world copy; the overlap hides the join), and tolerance is geojson-vt's per-zoom
// line simplification. Both are tuned for render cost: an earlier {512, 0} kept
// every vertex of every line in maximal-overlap tiles, which made low zooms — where
// the world copies multiply the geometry — disproportionately expensive to tile and
// tessellate. 128/0.375 (the geojson-vt defaults) render visually identical output,
// including the ±180° crossing at world zoom. Before touching these again, re-check
// the seam: centre on lng 180 with every line overlay on and screenshot z1/z2/z4 in
// 2D and tilted 3D — any gap, kink, or dash-phase jump at the join is a regression.
const LINE_SOURCE_OPTS = { buffer: 128, tolerance: 0.375 } as const;
// Parans (and their orb-zone fills) are the exception: a paran is a perfect parallel
// of latitude, so its densified geometry (parallelCoords in parans.ts; the constant-
// latitude top/bottom edges of paranRing in orbBands.ts) is PERFECTLY collinear in
// lng/lat. geojson-vt's tolerance simplification then strips every interior vertex,
// collapsing the parallel back to one −180→180 span — whose 360° longitude jump it
// mis-handles at the antimeridian, so it gets clipped off near the world centre when
// zoomed far out (2D) and can collapse through the globe (3D). The densification
// exists precisely to avoid that, so these sources keep the same seam buffer but
// disable simplification. The curved line bands in the orb source survive 0.375 fine
// (the ACG lines do), so the only cost is keeping their vertices too — acceptable for
// an off-by-default fill; split the paran bands into their own source if low-zoom orb
// perf ever bites. (Re-run the ±180° seam check from LINE_SOURCE_OPTS if you touch this.)
const PARAN_SOURCE_OPTS = { buffer: 128, tolerance: 0 } as const;

// Angle code shown in each line / paran badge (As/Ds match the wheel's shorthand).
// Covers every line type — a paran's body A may sit on the MC/IC or the horizon,
// and the Vertex-axis lines badge as Vx/Avx.
const ANGLE_CODE: Record<LineType, string> = {
  MC: 'MC',
  IC: 'IC',
  ASC: 'As',
  DSC: 'Ds',
  VX: 'Vx',
  AVX: 'Avx',
};

// How far inside the viewport edge the badges anchor (px). Small, since badges
// then dodge the HUD panels rather than relying on a wide margin.
const BADGE_INSET = 16;
// While the Capture frame is armed, anchor + clamp the edge badges with a tighter gap so
// they tuck closer to the frame edge in the exported still — mirroring the attribution
// disclosure's halved capture margin (see .map-frame.framed in Map.css).
const CAPTURE_BADGE_INSET = BADGE_INSET / 2;

// HUD panels the edge badges should slide clear of, so a label is never hidden.
const HUD_SELECTORS = [
  '.timeline-hud', // top nav bar(s) + bottom timeline
  '.thud-measure', // the timeline's overlay-mode nub (protrudes above the bar)
  '.synastry-hud', // bottom synastry bar (same slot as the timeline; its tag is inline)
  '.sidebar',
  '.profile-window', // username + plan-badge strip (top-left, or bottom-left on touch)
  '.app-header', // coordinates readout (top-left; present only while the Coordinates view is on)
  '.chart-wheel',
  '.expanded-sidebar',
  '.maplibregl-ctrl-top-right',
  '.maplibregl-ctrl-bottom-right',
  '.info-bar', // active-systems chip (bottom-right, above the attribution)
];

// While the Capture frame is armed, badges ignore the HUD panels (Capture window, sidebar,
// etc.) and hug the frame edges — with ONE exception: the on-map attribution / credits
// disclosure (bottom-right), which is part of the exported image, so badges still dodge
// it so a label never sits on top of it.
const CAPTURE_AVOID_SELECTORS = ['.maplibregl-ctrl-bottom-right'];

// Current screen rects of the given selectors (default: the HUD panels), in
// map-container coordinates.
function readHudRects(
  map: maplibregl.Map,
  selectors: readonly string[] = HUD_SELECTORS,
): AvoidRect[] {
  const cont = map.getContainer().getBoundingClientRect();
  const out: AvoidRect[] = [];
  for (const sel of selectors) {
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

// Shallow equality over arrays of flat badge records. computeBadges runs on every
// data push and settled moveend even when nothing on screen moved; handing React
// the PREVIOUS array back when a recompute lands on identical output lets its
// Object.is bailout skip re-rendering this (large) component for nothing.
function sameBadges<T extends object>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as Record<string, unknown>;
    const y = b[i] as Record<string, unknown>;
    for (const k in x) if (x[k] !== y[k]) return false;
    for (const k in y) if (!(k in x)) return false;
  }
  return true;
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
// Exported so the Location view's "Fly to origin" can land at exactly this zoom —
// deep enough that the "Zoom out" escape button (gated on zoom >= CLOSE_ZOOM) shows.
export const CLOSE_ZOOM = 8.5;
// Once zoomed past CLOSE_ZOOM (LS labels at full radius) a subtle "Zoom out"
// escape button appears; clicking it eases back to this wide overview in one step.
const ZOOM_OUT_TARGET = 3;
// First-load framing. Opening on the whole globe drops every line on screen at
// once, which is a lot to take in before you've found your footing. Instead we
// open on a continental box CENTRED on the active chart's birthplace (see
// firstLoadBounds) so you start looking at the chart's own part of the world.
// Expressed as a bounding box (not a fixed zoom) so MapLibre fits it to the
// viewport: wide on a desktop, comfortably pulled-in on a phone, with the
// surrounding continent staying in frame either way.
//
// This North-America box is the fallback used only when no birthplace is known.
// [SW corner, NE corner] as [lng, lat].
const DEFAULT_BOUNDS: maplibregl.LngLatBoundsLike = [
  [-128, 22], // Pacific coast / southern US
  [-64, 52], // Atlantic coast / southern Canada
];
// Half-spans of the first-load box around the birthplace, in degrees. Sized for a
// continental overview — wide enough that a US chart opens seeing all of North
// America, a European one all of Europe, etc. — and a touch wider than the old
// fixed North-America frame so a little more of the continent shows.
const FIRST_LOAD_HALF_LNG = 46;
const FIRST_LOAD_HALF_LAT = 24;
// A continental box centred on `center`. Latitude is clamped so a high-latitude
// birthplace can't push an edge past the Mercator limit (longitude is left to
// wrap naturally across the antimeridian). Falls back to DEFAULT_BOUNDS when no
// birthplace is supplied.
function firstLoadBounds(
  center?: { lat: number; lng: number } | null,
): maplibregl.LngLatBoundsLike {
  if (!center) return DEFAULT_BOUNDS;
  const south = Math.max(center.lat - FIRST_LOAD_HALF_LAT, -82);
  const north = Math.min(center.lat + FIRST_LOAD_HALF_LAT, 82);
  return [
    [center.lng - FIRST_LOAD_HALF_LNG, south],
    [center.lng + FIRST_LOAD_HALF_LNG, north],
  ];
}
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
// The compass's on-screen scale at a given zoom (0.5 → 1 across COMPASS_ZOOM→CLOSE_ZOOM), and
// the "Mask Lines" clip circle's radius (px): ~30% wider than the compass radius at that zoom.
const compassScaleAt = (zoom: number) =>
  COMPASS_MIN_SCALE +
  (1 - COMPASS_MIN_SCALE) *
    Math.min(1, Math.max(0, (zoom - COMPASS_ZOOM) / (CLOSE_ZOOM - COMPASS_ZOOM)));
const maskRadiusAt = (zoom: number) => (HORIZON_WHEEL_SIZE * compassScaleAt(zoom) * 1.3) / 2;
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
// Nominal half-extents of an LS pill for the de-overlap. A pill that prints its bearing keeps
// the wide value as a FLOOR even once measured (the long faces crowd the ring at close azimuths,
// and a capture still can't be panned to disambiguate them — so they get pushed fully clear);
// a blank-faced pill uses the narrow value only UNTIL measured, then its real box is the truth
// (a permanent floor would space a bare glyph as if it still carried its optional name label,
// shoving badges off their lines with nothing visibly crowding them).
const LS_BADGE_HALF_W = 34;
const LS_BADGE_OUT_HALF_W = 66;
const LS_BADGE_HALF_H = 11;
// A SMALL breathing margin added to every pill's half-extents before the de-overlap, so neighbours
// clear by a hair rather than touching exactly. Kept tiny on purpose: a larger margin pushed crowded
// labels so far off their lines (esp. with many planets enabled) that it was hard to tell which badge
// belonged to which line. 2× this is the min gap between any two.
const LS_BADGE_GAP = 1;
// Closest a crowded label may slide toward the origin (px) — keeps a clear zone around the centre
// where all the lines converge, so staggered labels never pile on the origin pin / compass hub.
const LS_BADGE_MIN_RAD = 26;
// Gap (px) past the badge's edge — along the ray toward the origin — where the transparent
// "Degrees" label is parked, so each bearing reads as its line's degree and clears the pill
// (whose width varies with the optional name). Added to the measured half-extent, not the centre.
const LS_LINE_DEG_GAP = 26;
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
   *  (e.g. "45°23'"). Static. Shown on the outgoing badge only — and blanked ('')
   *  in the Capture "Standard labels" mode, whose faces match the ACG badges. */
  azLabel: string;
  /** This half's bearing, ALWAYS populated (unlike azLabel, which the standard-labels mode
   *  blanks) — the transparent "Degrees" toggle prints it along the line toward the origin. */
  bearing: string;
  /** Screen anchor for the along-the-line "Degrees" label — just past this badge's edge toward
   *  the origin (badge x/y is the pill centre). Set once the layout settles, else undefined. */
  degX?: number;
  degY?: number;
}

// Resolve crowding among the LS labels by sliding each one ALONG ITS OWN LINE (the ray out from the
// origin), never off it. A label's direction (dx,dy — a unit vector from the origin) is fixed; only
// its RADIUS changes, so it always sits ON its line — just nearer to or farther from the centre.
// Because the lines fan OUT from the origin, a bundle resolves by staggering radii: when two labels
// overlap, the outer one moves further out and the inner one further in, and since the rays diverge
// that radial offset clears them — the more labels pile up, the more line they use. A weak pull back
// toward each label's rest radius (rad0, where its line meets the ring) keeps uncrowded labels on the
// ring and stops the stagger from drifting. Each radius is bounded to [minRad, maxRad] so a label
// never piles on the origin nor slides off-screen. Writes the resulting screen x/y back onto each item.
function spreadLsBadgesRadial(
  items: {
    x: number;
    y: number;
    dx: number;
    dy: number;
    rad: number;
    rad0: number;
    minRad: number;
    maxRad: number;
    hw: number;
    hh: number;
  }[],
  ocx: number,
  ocy: number,
  iterations: number,
): void {
  const ATTRACT = 0.15; // fraction of the way back to the rest radius reclaimed each pass
  const seat = (it: (typeof items)[number]) => {
    it.rad = Math.min(Math.max(it.rad, it.minRad), it.maxRad);
    it.x = ocx + it.rad * it.dx;
    it.y = ocy + it.rad * it.dy;
  };
  for (const it of items) seat(it);
  for (let iter = 0; iter < iterations; iter++) {
    for (const it of items) {
      it.rad += (it.rad0 - it.rad) * ATTRACT;
      seat(it);
    }
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const ox = a.hw + b.hw - Math.abs(b.x - a.x);
        const oy = a.hh + b.hh - Math.abs(b.y - a.y);
        if (ox <= 0 || oy <= 0) continue;
        const mag = Math.min(ox, oy) / 2 + 0.5;
        // Stagger along the rays: the already-outer label goes further out, the inner one further in.
        if (a.rad >= b.rad) {
          a.rad += mag;
          b.rad -= mag;
        } else {
          a.rad -= mag;
          b.rad += mag;
        }
        seat(a);
        seat(b);
      }
    }
  }
}

// The mask-mode twin of spreadLsBadgesRadial: the badges sit on a FIXED-radius rim, so de-overlap
// by nudging them ALONG the rim (changing angle, not radius) while pulling each back toward its
// line's true bearing — a crowded fan spreads around the circle instead of sliding off it.
function spreadLsBadgesAngular(
  items: { x: number; y: number; ang: number; ang0: number; hw: number; hh: number }[],
  ocx: number,
  ocy: number,
  radius: number,
  iterations: number,
): void {
  const ATTRACT = 0.12; // fraction of the way back to the line's true bearing reclaimed each pass
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a)); // → [-π, π]
  const seat = (it: (typeof items)[number]) => {
    it.x = ocx + radius * Math.sin(it.ang);
    it.y = ocy - radius * Math.cos(it.ang);
  };
  for (const it of items) seat(it);
  for (let iter = 0; iter < iterations; iter++) {
    for (const it of items) {
      it.ang += wrap(it.ang0 - it.ang) * ATTRACT;
      seat(it);
    }
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const ox = a.hw + b.hw - Math.abs(b.x - a.x);
        const oy = a.hh + b.hh - Math.abs(b.y - a.y);
        if (ox <= 0 || oy <= 0) continue;
        // Turn the pixel overlap into an arc nudge and push the pair apart around the rim.
        const push = (Math.min(ox, oy) / 2 + 0.5) / radius;
        if (wrap(b.ang - a.ang) >= 0) {
          a.ang -= push;
          b.ang += push;
        } else {
          a.ang += push;
          b.ang -= push;
        }
        seat(a);
        seat(b);
      }
    }
  }
}

export interface OverlayData {
  lines: FeatureCollection<LineString, LineProps>;
  parans: FeatureCollection<LineString, ParanProps>;
  localSpace: FeatureCollection<LineString, LocalSpaceProps>;
  /** Sub-planetary (zenith) point per overlay body. Drawn as stamps (and used as
   *  the overlay labels' click-to-fly target, like natal) only when the overlay's
   *  Zeniths/Nadirs toggle is on; the App feeds this empty otherwise. */
  zenith: FeatureCollection<Point, ZenithProps>;
  /** The antipodal nadir (underfoot) stamps for the overlay bodies — the overlay's
   *  twin of the natal `nadir`, on the IC line. Shares the overlay Zeniths/Nadirs
   *  toggle (empty when off). */
  nadir: FeatureCollection<Point, ZenithProps>;
  /** The overlay's ecliptic (zodiac) line — a dotted companion to the solid
   *  bright-yellow natal ecliptic, threading through the overlay Sun's zenith. Shown
   *  only while the overlay zeniths are (the App gates it the same way; empty
   *  otherwise). */
  ecliptic: FeatureCollection<LineString>;
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

// Slide tool readout: how far the Earth has been spun about its polar axis, as a
// rotation angle (deg of longitude) and the equivalent elapsed sidereal time.
export interface SlideInfo {
  /** Total rotation about the pole, signed (east-positive), in degrees. */
  thetaDeg: number;
  /** Equivalent elapsed Earth-rotation time, signed, in hours (theta / 15.041). */
  dtHours: number;
  /** Resulting wall-clock time at the birthplace, in the chart's zone — e.g. "18:42 EDT". */
  clock: string;
  /** Wall-clock DATE at the birthplace on the slid day (localized, short — e.g.
   *  "16 Jun"), so a spin across midnight reads as a day change. */
  date: string;
  /** The slid instant itself (epoch ms UT) — for surfaces that project it onto
   *  their own clock (the sky band's time cursor follows the spin through it). */
  ms: number;
}

// Earth turns 360° relative to the fixed stars in one sidereal day (23.9344696 h),
// i.e. 15.0410686°/h. The Slide tool maps a spin angle to a sidereal-time offset
// and back through this rate (the celestial frame the natal lines live in).
export const SIDEREAL_DEG_PER_HOUR = 360 / 23.9344696;

// Rigidly rotate a geometry collection about the polar axis by shifting every
// vertex's longitude. The generators emit antimeridian-continuous coordinates (see
// unwrapLongitudes), so a constant offset keeps each feature unbroken and the globe
// wraps any out-of-range longitudes onto the sphere natively — no re-normalization.
// Handles every geometry the line/band/zenith layers use (lines, polygons, points).
function translateLng(
  fc: FeatureCollection,
  dLng: number,
): FeatureCollection {
  if (dLng === 0) return fc;
  const ring = (pts: number[][]) => pts.map((c) => [c[0] + dLng, c[1]]);
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f): Feature => {
      const g = f.geometry;
      switch (g.type) {
        case 'LineString':
          return { ...f, geometry: { type: 'LineString', coordinates: ring(g.coordinates) } };
        case 'MultiLineString':
          return { ...f, geometry: { type: 'MultiLineString', coordinates: g.coordinates.map(ring) } };
        case 'Polygon':
          return { ...f, geometry: { type: 'Polygon', coordinates: g.coordinates.map(ring) } };
        case 'MultiPolygon':
          return {
            ...f,
            geometry: { type: 'MultiPolygon', coordinates: g.coordinates.map((poly) => poly.map(ring)) },
          };
        case 'Point':
          return { ...f, geometry: { type: 'Point', coordinates: [g.coordinates[0] + dLng, g.coordinates[1]] } };
        default:
          return f;
      }
    }),
  };
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
  'acg-lines-meridian-pair',
  'acg-lines-horizon-pair',
  'acg-lines-ov-meridian',
  'acg-lines-ov-horizon',
  'acg-lines-ov-pair-nn',
  'acg-lines-ov-pair-sn',
  'angle-lines-layer',
  // The dotted fixed-star lines (Filters ▸ Fixed Stars); the line layer carries
  // the geometry — the symbol sparks aren't snapped to. Empty source when the
  // filter is off, so snapping honours visibility like the rest. Kept in sync
  // with LINE_HIT_LAYERS (hover tips), which already lists it.
  'star-lines-layer',
  'parans-layer',
  'parans-ov-layer',
  'local-space-layer-out',
  'local-space-layer-in',
  'local-space-ov-layer',
  'eclipse-central',
  'eclipse-limits',
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
// (the same place a planet's ACG line labels fly to). Both the natal stamps and the
// overlay stamps are hit-tested — the natal disc is drawn on top, so it wins where
// the two coincide (queryRenderedFeatures returns topmost first).
// Hit-test the STAMP symbol layers (the baked disc+glyph coins) rather than the
// circle layers — those are now a hover-only bloom that's transparent at rest, so
// they're no longer a reliable query target. The stamps are always rendered, and
// their feature ids/props/geometry match the discs (same source).
const ZENITH_HIT_LAYERS = ['acg-zenith-layer', 'acg-zenith-ov-layer', 'acg-nadir-layer', 'acg-nadir-ov-layer'] as const;

// Each hit-testable stamp layer → the GeoJSON source its features live in (so a
// hover/click feature-state targets the right source; ids collide across sources).
const ZENITH_SOURCE_BY_LAYER: Record<string, string> = {
  'acg-zenith-layer': 'acg-zenith',
  'acg-zenith-ov-layer': 'acg-zenith-ov',
  'acg-nadir-layer': 'acg-nadir',
  'acg-nadir-ov-layer': 'acg-nadir-ov',
};
const ZENITH_HIT_TOLERANCE_PX = 4;

// Inline SVG for the eclipse-maximum DOM marker (set as the marker element's
// innerHTML). Solar: a radiating corona / "ring of fire" — eight rays + a bright
// annulus with a dark occulting core. Lunar: a disc bitten by a darker umbral
// crescent (an eclipsed Moon). Both tint from the element's `color` (the eclipse's
// own colour) via currentColor; the dark core/umbra fill comes from Map.css. A
// deliberately different shape language from the zenith/nadir coins.
const SOLAR_MARKER_SVG =
  '<svg class="eclipse-marker-icon" viewBox="0 0 36 36" aria-hidden="true">' +
  '<g class="eclipse-marker-rays" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">' +
  '<line x1="18" y1="2.5" x2="18" y2="7.5"/><line x1="18" y1="28.5" x2="18" y2="33.5"/>' +
  '<line x1="2.5" y1="18" x2="7.5" y2="18"/><line x1="28.5" y1="18" x2="33.5" y2="18"/>' +
  '<line x1="7.1" y1="7.1" x2="10.6" y2="10.6"/><line x1="25.4" y1="25.4" x2="28.9" y2="28.9"/>' +
  '<line x1="7.1" y1="28.9" x2="10.6" y2="25.4"/><line x1="25.4" y1="10.6" x2="28.9" y2="7.1"/>' +
  '</g>' +
  '<circle cx="18" cy="18" r="8" fill="currentColor"/>' +
  '<circle class="eclipse-marker-core" cx="18" cy="18" r="4.4"/>' +
  '</svg>';
const LUNAR_MARKER_SVG =
  '<svg class="eclipse-marker-icon" viewBox="0 0 36 36" aria-hidden="true">' +
  '<circle cx="18" cy="18" r="8.6" fill="currentColor"/>' +
  '<circle class="eclipse-marker-umbra" cx="22.7" cy="15.3" r="8"/>' +
  '</svg>';

interface ZenithHit {
  id: string;
  /** The GeoJSON source the stamp lives in — 'acg-zenith' (natal) or 'acg-zenith-ov'
   *  (overlay) — so its hover feature-state targets the right one (both number their
   *  features by planet name, so the ids collide across sources). */
  source: string;
  /** True for an overlay stamp, so the click-to-fly toggle keys it by the overlay's
   *  tag (matching the overlay label) rather than the natal '' prefix. */
  overlay: boolean;
  /** True for a nadir (underfoot) stamp vs a zenith (overhead): the hover tooltip
   *  names it accordingly and its fly-to toggle keys distinctly from the zenith. */
  nadir: boolean;
  /** The body's overlay/promoted tag (e.g. "Tr"), carried on the stamp's feature;
   *  shown as the hover-tooltip prefix. Absent for the natal chart's own zeniths. A
   *  promoted stamp HAS a tag (display) yet is overlay=false (natal-path routing). */
  tag?: string;
  planet: PlanetName;
  lng: number;
  lat: number;
}

function zenithAtPoint(map: maplibregl.Map, pt: ScreenPt): ZenithHit | null {
  const layers = ZENITH_HIT_LAYERS.filter((id) => map.getLayer(id));
  if (layers.length === 0) return null;
  const t = ZENITH_HIT_TOLERANCE_PX;
  const feats = map.queryRenderedFeatures(
    [
      [pt.x - t, pt.y - t],
      [pt.x + t, pt.y + t],
    ],
    { layers: layers as unknown as string[] },
  );
  const f = feats[0];
  if (!f || f.id == null || !f.properties || f.geometry.type !== 'Point') {
    return null;
  }
  const overlay =
    f.layer.id === 'acg-zenith-ov-layer' || f.layer.id === 'acg-nadir-ov-layer';
  const nadir =
    f.layer.id === 'acg-nadir-layer' || f.layer.id === 'acg-nadir-ov-layer';
  const [lng, lat] = f.geometry.coordinates as [number, number];
  return {
    id: String(f.id),
    source: ZENITH_SOURCE_BY_LAYER[f.layer.id] ?? 'acg-zenith',
    overlay,
    nadir,
    tag: typeof f.properties.tag === 'string' ? f.properties.tag : undefined,
    planet: f.properties.planet as PlanetName,
    lng,
    lat,
  };
}

// A zenith's stable identity for the click-to-fly-and-back toggle: the overlay
// prefix ('' for natal) plus the planet. The ACG label badges and the on-map
// stamps build the SAME key, so flying out via a label and flying back by clicking
// the stamp now centred under you share one toggle (see flyToZenith).
function zenithKey(prefix: string, planet: string): string {
  return `${prefix}|${planet}`;
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
  'star-lines-layer',
  'acg-lines-meridian',
  'acg-lines-horizon',
  'acg-lines-meridian-pair',
  'acg-lines-horizon-pair',
  'acg-lines-ov-meridian',
  'acg-lines-ov-horizon',
  'acg-lines-ov-pair-nn',
  'acg-lines-ov-pair-sn',
  'angle-lines-layer',
  'parans-layer',
  'parans-ov-layer',
  'local-space-layer-out',
  'local-space-layer-in',
  'local-space-ov-layer',
  'ecliptic-layer',
  'ecliptic-ov-layer',
  'eclipse-central',
  'eclipse-limits',
  'eclipse-isolines',
  'eclipse-penumbral',
  'eclipse-lunar-horizon',
];
const LINE_HIT_TOLERANCE_PX = 3;

function glyphHtml(planet: PlanetName, color: string): string {
  return `<span class="astro-glyph cross-tip-glyph" style="color:${color}">${PLANET_GLYPHS[planet]}</span>`;
}
function tagHtml(t: string): string {
  return `<span class="cross-tip-tag">${t}</span>`;
}

// Poleward of this latitude a rising/setting line can crest (the horizon
// grazes its point's diurnal circle): across the crest the rising and setting
// identities — and so an As-vs-Ds reading — trade places. The tooltips flag it.
const POLAR_LAT = 66.5;

// Whether this hovered line is a rising/setting-type curve, whose reading is
// ambiguous around a polar crest (meridians are immune).
function isHorizonLine(layerId: string, props: Record<string, unknown>): boolean {
  if (layerId.startsWith('acg-lines')) {
    return props.lineType === 'ASC' || props.lineType === 'DSC';
  }
  if (layerId === 'angle-lines-layer') {
    return props.kind === 'aspect'
      ? props.branch === 'ASC' || props.branch === 'DSC'
      : props.lineType === 'ASC' || props.lineType === 'DSC';
  }
  return false;
}

function lineLabelHtml(
  layerId: string,
  props: Record<string, unknown>,
  t: TFn,
  labels: EnumLabels,
  hoverLatDeg: number,
): string | null {
  // Overlay AND promoted lines carry their tag (e.g. "Tr") in props.tag; show it as the
  // hover-tip prefix regardless of which path (dashed overlay or solid natal/promoted)
  // drew the line.
  const pre = typeof props.tag === 'string' ? tagHtml(props.tag) : '';
  let row: string | null = null;
  if (layerId.startsWith('acg-lines')) {
    const planet = props.planet as PlanetName;
    if (props.pair) {
      // Merged lunar-node line: show both nodes, e.g. "NN MC / SN IC" (with the overlay
      // tag ahead of it on overlay lines).
      const opp = OPPOSITE_ANGLE[props.lineType as LineType];
      row =
        pre +
        glyphHtml('NorthNode', PLANET_COLORS.NorthNode) +
        `${labels.planet('NorthNode')} ${tagHtml(ANGLE_CODE[props.lineType as LineType])}` +
        `<span class="cross-tip-x">/</span>` +
        glyphHtml('SouthNode', PLANET_COLORS.SouthNode) +
        `${labels.planet('SouthNode')} ${tagHtml(ANGLE_CODE[opp])}`;
    } else {
      row =
        pre +
        glyphHtml(planet, props.color as string) +
        `${labels.planet(planet)} ${tagHtml(ANGLE_CODE[props.lineType as LineType])}`;
    }
  } else if (layerId === 'angle-lines-layer') {
    // "Aspects to angles" overlay: either "Sun □ MC" (planet square the MC here)
    // or "Sun/Moon MC" (the pair's midpoint culminates here).
    const planet = props.planet as PlanetName;
    if (props.kind === 'midpoint') {
      const pb = props.planetB as PlanetName;
      // colorB carries the same light-theme colour swap as props.color (see
      // App.withThemeLineColors), so a "Sun/Moon" tip stays readable on Glass/Earth.
      row =
        pre +
        glyphHtml(planet, props.color as string) +
        labels.planet(planet) +
        `<span class="cross-tip-x">/</span>` +
        glyphHtml(pb, (props.colorB as string) ?? PLANET_COLORS[pb]) +
        `${labels.planet(pb)} ${tagHtml(ANGLE_CODE[props.lineType as LineType])}`;
    } else {
      // Name the line by the angle it actually is (its `branch`), not the
      // MC/ASC-convention relabel: the setting-side line reads "✶ Sextile Ds",
      // the rising-side "✶ Sextile As". The aspect symbol renders glyph-sized in
      // the bundled glyph font (astro-glyph + cross-tip-glyph), and the aspect is
      // also spelled out ("Sextile"/"Square"/"Trine") so the tip reads plainly —
      // the compact edge badges keep just the glyph + code.
      const { aspect, angle } = aspectBranchReading(
        props.aspect as AspectKind,
        props.branch as LineType,
      );
      const aspHtml = (a: AspectKind) =>
        `<span class="astro-glyph cross-tip-glyph">${ASPECT_GLYPHS[a]}</span>`;
      const aspectWord = t(`expandedSidebar.aspect.${aspect}.name`);
      row =
        pre +
        glyphHtml(planet, props.color as string) +
        `${labels.planet(planet)} ` +
        aspHtml(aspect) +
        ` ${aspectWord} ` +
        tagHtml(ANGLE_CODE[angle]);
    }
  } else if (layerId === 'star-lines-layer') {
    // Fixed-star line: ★ in the shared star tint, then "Name MC" like the
    // planet rows (star names are proper nouns, shown as-is).
    row =
      pre +
      `<span class="cross-tip-glyph" style="color:${props.color}">★</span>` +
      `${props.star} ${tagHtml(ANGLE_CODE[props.lineType as LineType])}`;
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
  } else if (layerId === 'ecliptic-layer' || layerId === 'ecliptic-ov-layer') {
    row = t('map.ecliptic');
  } else if (layerId.startsWith('eclipse')) {
    // Eclipse curves: lead with the eclipse identity ("2024-04-08 · Total"),
    // then name the curve. The cursor's local obscuration is appended by the
    // hover handler (it knows the lat/lng; this function only sees the feature).
    const kind = props.kind as string;
    const what =
      kind === 'central'
        ? t('map.eclipse.central')
        : kind === 'limit'
          ? t('map.eclipse.pathEdge')
          : kind === 'penumbral-limit'
            ? t('map.eclipse.outerLimit')
            : kind === 'lunar-horizon'
              ? t('map.eclipse.horizon', { phase: props.label as string })
              : t('map.eclipse.isoline', { pct: props.label as string });
    row = tagHtml(props.dateLabel as string) + what;
  }
  if (!row) return null;
  // Rising/setting curves hovered inside a polar circle get a one-line caveat:
  // past the line's crest the As/Ds reading flips (see POLAR_LAT).
  const polar =
    Math.abs(hoverLatDeg) > POLAR_LAT && isHorizonLine(layerId, props)
      ? `<span class="ui-tip-sub">${t('map.polarNote')}</span>`
      : '';
  return `<div class="ui-tip"><span class="cross-tip-row">${row}</span>${polar}</div>`;
}

// A clickable line collection — for the closest-approach search we need only the geometry
// (the per-line-type props are irrelevant), so keep the shape minimal and structural.
type ClickableLineFC = { features: { geometry: LineString }[] };

// Normalised longitude difference in degrees, within [-180, 180] (antimeridian-safe).
function lngDelta(a: number, b: number): number {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

// Distance from the origin to planar segment AB.
function distToSeg(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(ax, ay);
  let s = -(ax * dx + ay * dy) / l2; // project the origin onto AB, clamped to the segment
  s = Math.max(0, Math.min(1, s));
  return Math.hypot(ax + s * dx, ay + s * dy);
}

// Closest great-circle distance (km) from a point to a polyline. Each segment is measured in
// a local equirectangular frame centred on the point — accurate where it matters (the nearest
// segment lies near the point), antimeridian-safe, and point-to-SEGMENT (not just to vertices)
// so it reads ~0 when the point sits on the line. Drives the line card's "Closest distance" row.
function nearestApproachKm(pLat: number, pLng: number, geom: LineString): number {
  const toRad = Math.PI / 180;
  const kx = 6371 * toRad * Math.cos(pLat * toRad); // km per degree of longitude near the point
  const ky = 6371 * toRad; // km per degree of latitude
  const pts = geom.coordinates;
  if (pts.length === 1) {
    return Math.hypot(lngDelta(pts[0][0], pLng) * kx, (pts[0][1] - pLat) * ky);
  }
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = lngDelta(pts[i][0], pLng) * kx;
    const ay = (pts[i][1] - pLat) * ky;
    const bx = lngDelta(pts[i + 1][0], pLng) * kx;
    const by = (pts[i + 1][1] - pLat) * ky;
    best = Math.min(best, distToSeg(ax, ay, bx, by));
  }
  return best;
}

function lineAtPoint(
  map: maplibregl.Map,
  pt: ScreenPt,
  t: TFn,
  labels: EnumLabels,
): { id: string; html: string; layerId: string; props: Record<string, unknown> } | null {
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
  const hoverLat = map.unproject([pt.x, pt.y]).lat;
  const html = lineLabelHtml(f.layer.id, f.properties, t, labels, hoverLat);
  if (!html) return null;
  // Stable id so the popup HTML is only re-set when the hovered line changes.
  // The polar-zone flag joins it so the caveat appears/disappears as the hover
  // crosses the polar circle along one line.
  const polarKey = Math.abs(hoverLat) > POLAR_LAT ? 'p' : '';
  return {
    // targetLng joins the id so the popup re-renders when the hover moves between
    // an aspect's two same-label branches (e.g. the two square-MC meridians an
    // in-mundo aspect draws), which share label/planet but sit at different points.
    id: `${f.layer.id}|${f.properties.label ?? f.properties.planet ?? ''}|${f.properties.targetLng ?? ''}|${polarKey}`,
    html,
    layerId: f.layer.id,
    props: f.properties,
  };
}

// Cap how far the FLAT map can zoom out so the viewport never spans more than one
// world (360° of longitude). Below that, MapLibre's world copies repeat and each
// line draws in every copy — a meridian at 126°E reappearing at 234°W, etc. The
// world is 512·2^zoom px wide, so the zoom where it just fills the container is
// z = log2(width / 512); pin minZoom there (setMinZoom clamps the current zoom up
// if needed). The globe shows a single copy inherently, so it keeps minZoom 0.
function applyMinZoom(map: maplibregl.Map, mode: MapProjectionMode): void {
  if (mode === '3d') {
    map.setMinZoom(0);
    return;
  }
  const w = map.getContainer().clientWidth;
  if (w <= 0) return;
  map.setMinZoom(Math.max(0, Math.log2(w / 512)));
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
  applyMinZoom(map, mode);
}

interface MapProps {
  lines: FeatureCollection<LineString, LineProps>;
  /** The "Aspects to angles" overlays: planet-aspect lines and/or midpoint
   *  lines, concatenated (the two toggles stack; empty when both are off). */
  angleLines: FeatureCollection<LineString, AngleOverlayLineProps>;
  parans: FeatureCollection<LineString, ParanProps>;
  /** Orb-of-influence zones (Filters ▸ Orb zones): translucent bands around the
   *  planet angle lines and parans, drawn under every line layer. */
  orbBands?: FeatureCollection<Polygon, OrbBandProps> | null;
  /** Fixed-star angle lines (Filters ▸ Fixed Stars); empty when off. */
  starLines?: FeatureCollection<LineString, StarLineProps> | null;
  /** Night-side wash (Filters ▸ Night Shading); empty when off. */
  nightShade?: FeatureCollection<Polygon, NightShadeProps> | null;
  localSpace: FeatureCollection<LineString, LocalSpaceProps>;
  /** Dots where local-space lines cross birth-chart lines (empty when LS hidden). */
  localSpaceCross: FeatureCollection<Point, CrossingProps>;
  /** Origin the local-space lines radiate from (pin or birthplace) — the centre of
   *  the LS label ring. Null when local space is hidden. */
  localSpaceOrigin?: { lat: number; lng: number } | null;
  /** Hide the local-horizon compass wheel (Location ▸ Local Space ▸ Hide compass).
   *  Render-time gating only — not draw data, so it's a plain prop, not in MapData. */
  hideCompass?: boolean;
  /** Planet-glyph stamps at each body's zenith (sub-planetary) point, on its MC line. */
  zenith: FeatureCollection<Point, ZenithProps>;
  /** The antipodal nadir stamps (sub-anti-planetary points, on the IC line) — the
   *  same coins, softened; display-only. Empty unless the Zeniths/Nadirs filter is on. */
  nadir: FeatureCollection<Point, ZenithProps>;
  /** The ecliptic great circle (zodiac) projected to its sub-points — a subtle
   *  bright-yellow reference line that threads through the Sun's zenith. */
  ecliptic?: FeatureCollection<LineString> | null;
  /** Second, time/relationship overlay rendered dashed + dimmed over the base. */
  overlay?: OverlayData | null;
  /** The Eclipses overlay: the selected solar eclipse's ground track (central
   *  line, umbral band, magnitude isolines, greatest-eclipse marker). */
  eclipse?: EclipseMapData | null;
  /** Local circumstances for the eclipse hover tip ("63% obscured at {time}");
   *  null where the eclipse is invisible. Read via ref — may change freely. */
  eclipseTip?: ((lat: number, lng: number) => string | null) | null;
  /** Click-for-details card in eclipses mode: full local circumstances
   *  (contact times, phase visibility) as ready-made .ui-tip HTML for the
   *  clicked point; null when the eclipse is invisible there. Supplying the
   *  prop arms the click handler; the card closes when it changes. */
  eclipseCard?: ((lat: number, lng: number) => string | null) | null;
  /** Click-a-line interpretation card: ready-made .ui-tip HTML for the clicked
   *  line feature, or null for lines without a reading. Not consulted while the
   *  eclipse card is armed (eclipses mode owns clicks there). */
  lineCard?:
    | ((
        layerId: string,
        props: Record<string, unknown>,
        dist: LineCardDistance | null,
      ) => string | null)
    | null;
  pin?: { lat: number; lng: number } | null;
  pinType?: 'custom' | 'natal' | null;
  /** Reference point for the line card's "Distance from …" row: a placed pin, or the natal
   *  location by default. The line card reports how far the clicked spot is from it. */
  distanceRef?: { lat: number; lng: number; type: 'pin' | 'natal' } | null;
  /** The active chart's birthplace at mount — the first-load view is framed on a
   *  continental box centred here (read once; later chart switches recenter via
   *  their own flyTo). Absent → the North-America fallback frame. */
  initialCenter?: { lat: number; lng: number } | null;
  /** An EXACT first-load camera (a restored share link's view). When present it
   *  wins over the initialCenter continental framing. Read once at mount. */
  initialView?: { lat: number; lng: number; zoom: number } | null;
  /** Height (px) of a reserved LAYOUT band along the viewport bottom (e.g. a
   *  docked bar): the whole map frame lifts above it and the GL viewport
   *  re-fits. 0/absent = the frame reaches the bottom edge as usual. Carried as
   *  a prop (not a CSS var) so the inline style and the resize() layout effect
   *  land on the same commit. Ignored while the Capture frame owns the insets. */
  bottomInset?: number;
  /** Width (px) of a reserved LAYOUT band along the viewport LEFT (a docked panel
   *  that claims its own column, e.g. a left-docked document view): the map frame
   *  shrinks out from under it and the GL viewport re-fits. Same prop-not-var
   *  reasoning as {@link bottomInset}; likewise ignored under the Capture frame. */
  leftInset?: number;
  theme: Theme;
  /** Flat Mercator ('2d') or 3D globe ('3d'). */
  projection: MapProjectionMode;
  /** Basemap detail toggles (the Theme tab's "Hide details" section). Default-on. */
  showRoads?: boolean;
  showRivers?: boolean;
  showLabels?: boolean;
  /** Blank the whole basemap (Local Space ▸ Capture ▸ "Hide map"), leaving the GL
   *  canvas transparent behind the chart linework — so a Capture exports a
   *  see-through PNG the user can lay over external imagery (a floor plan, their
   *  own map). Overrides the detail toggles above while on. */
  hideBasemap?: boolean;
  /** Hide the direction arrows riding the local-space lines (Local Space ▸
   *  Capture ▸ "Hide line arrows") — cleaner linework in the framed export. */
  hideLsArrows?: boolean;
  /** Transparent (Local Space) export mode is on. Folds together the whole clean-export
   *  treatment: clip the local-space lines to a circle ~30% wider than the horizon compass and
   *  anchor their badges on that rim (a self-contained compass rose, only while the compass is
   *  shown), and render those badges glyph-only (no "LS" prefix) and ~50% larger. */
  lsTransparent?: boolean;
  /** Transparent export, "Label Name": print each local-space planet's name after its glyph
   *  (e.g. "♂ Mars") on the badge. */
  lsLabelName?: boolean;
  /** Transparent export, "Degrees": print each local-space line's bearing along the line, just
   *  inside its badge toward the origin (the focal point where the rose converges). */
  lsLineDeg?: boolean;
  /** Label the local-space lines like the chart's other lines (Local Space ▸
   *  Capture ▸ "Standard labels"): each badge anchors at its line's outermost
   *  visible point — hugging the frame edge like the ACG edge badges — instead of
   *  on the ring around the origin, and drops the bearing degrees from its face. */
  lsEdgeLabels?: boolean;
  /** When true, click-drag on the map measures great-circle distance (and map
   *  panning is suspended for the duration). */
  measureActive?: boolean;
  /** Persistent "snap to chart lines" toggle for the measure tool (touch-reachable Shift). */
  measureSnap?: boolean;
  /** Color of the measure line/points — the current map-pin-state accent. */
  measureColor: string;
  onMeasure?: (m: MeasureInfo | null) => void;
  /** Right-click while measuring cancels (exits) the tool. */
  onMeasureCancel?: () => void;
  /** When true, drag east/west spins the Earth about its polar axis under the
   *  natal line-cage (3D only). The cage stays screen-pinned; the basemap rotates.
   *  Normal pan/rotate are suspended for the duration. */
  slideActive?: boolean;
  /** Reports the elapsed Earth-rotation time (days, signed) as the user spins;
   *  0 when reset. Must be STABLE (read inside the long-lived slide effect). */
  onSlide?: (dtDays: number) => void;
  /** Right-click while sliding resets the spin to natal and exits the tool. */
  onSlideCancel?: () => void;
  /** Capture tool: when true, the working map view is inset to a centred
   *  capture frame (its shape set by frameAspect) while the surrounding HUD stays
   *  put — the framed region is what `captureFrame` exports. */
  frameActive?: boolean;
  /** Capture-frame aspect ratio (width / height). null = no frame. */
  frameAspect?: number | null;
  /** The caption text (chart name · birth date · place). The footer band itself is normally
   *  reserved while framing — it carries the watermark — so blank text just renders an empty
   *  band with the watermark, not a missing band. `noCaption` (below) drops the band entirely. */
  frameCaptionText?: string;
  /** The caption fields as separate lines (same content as frameCaptionText, unjoined). The
   *  Transparent export has no footer band, so it stacks these in the frame's top-left instead. */
  frameCaptionLines?: readonly string[];
  /** Drop the caption band + watermark from the frame (and its reserved height): a caption-free
   *  export. Set only by the gated Transparent (Local Space) mode for a clean see-through PNG;
   *  the watermark is otherwise the mandatory AGPL-7(b) attribution, so this stays gated. */
  noCaption?: boolean;
  /** Optional "Details" overlay drawn inside the frame — the position LIST or the chart
   *  WHEEL (+ balance grid), docked left for landscape, top for square/portrait. Null = no
   *  panel (and no inset). */
  frameExtras?: CaptureFrameExtras | null;
  /** Esc while the Capture frame is armed exits the tool. */
  onFrameCancel?: () => void;
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
  /** The read-only map/chart snapshot handed to registered map overlays (registerMapOverlay),
   *  rendered as positioned DOM inside the frame by MapOverlayHost. Omit to draw no overlays. */
  overlayCtx?: MapExtensionContext;
  /** Registered-overlay ids to withhold from the map — the Capture window's
   *  per-overlay visibility toggles (MapOverlay.captureToggle). App passes the set
   *  only while the Capture tool is armed, so every overlay returns the moment
   *  the tool closes. Absent/empty = draw all. */
  hiddenOverlayIds?: ReadonlySet<string>;
  /** When true a line "spotlight" is active: the tool owns the pin gestures, so
   *  the map suppresses its own double-click pin-drop and right-click pin-remove, and broadcasts
   *  double-clicks ({@link MAP_DBLCLICK_EVENT}) for the tool to re-place its centre. The line
   *  FILTERING is done upstream in App — the line props arrive already reduced. The dim itself is a
   *  DOM "porthole" the tool draws over the map (an in-canvas wash can't carve a screen-space hole),
   *  so the map only needs the gesture handling here. */
  spotlightActive?: boolean;
  /** When true the spotlight has no centre yet (the tool is AIMING — picking a point): a single
   *  click is for placement, so ALSO suppress the map's single-click side-effects (line/eclipse
   *  cards, zenith fly-to). Once a centre is placed this is false, so clicking a revealed line pops
   *  its interpretation card as usual — the tool only owns the click while placing. */
  spotlightAiming?: boolean;
  /** Open state + setter for the credits / licenses dialog, lifted out of the map so
   *  it can be opened both from the attribution button here and from elsewhere in the
   *  app (see MapExtensionContext.openCredits); the map still renders the dialog. */
  creditsOpen: boolean;
  setCreditsOpen: (open: boolean) => void;
  /** Sky Times "follow the cursor" beacon: 'live' rides the raw pointer (the aura
   *  hugs the cursor), 'held' anchors on the parked spot, 'off' hides it. */
  skyFollow?: 'off' | 'live' | 'held';
  /** The parked spot for `skyFollow === 'held'` (the clicked read point). */
  skyFollowHeld?: { lat: number; lng: number } | null;
}

interface MapData {
  lines: FeatureCollection<LineString, LineProps>;
  angleLines: FeatureCollection<LineString, AngleOverlayLineProps>;
  parans: FeatureCollection<LineString, ParanProps>;
  orbBands?: FeatureCollection<Polygon, OrbBandProps> | null;
  starLines?: FeatureCollection<LineString, StarLineProps> | null;
  nightShade?: FeatureCollection<Polygon, NightShadeProps> | null;
  localSpace: FeatureCollection<LineString, LocalSpaceProps>;
  localSpaceCross: FeatureCollection<Point, CrossingProps>;
  localSpaceOrigin?: { lat: number; lng: number } | null;
  zenith: FeatureCollection<Point, ZenithProps>;
  nadir: FeatureCollection<Point, ZenithProps>;
  ecliptic?: FeatureCollection<LineString> | null;
  overlay?: OverlayData | null;
  eclipse?: EclipseMapData | null;
}

export interface MapHandle {
  /** Recenter the map on a coordinate. Without `zoom`, eases to a usable zoom if
   *  zoomed out (keeping the current zoom otherwise); with `zoom`, sets it exactly
   *  (so the Location search can frame a country wide vs a city tight). */
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  /** The current camera (centre + zoom) — e.g. to encode into a share link.
   *  Null before the map exists. */
  getView: () => { lat: number; lng: number; zoom: number } | null;
  /** Like flyTo, but first stashes the current view as the Location "go back"
   *  target (so a search jump can be undone). The method keeps its "teleport"
   *  name — it describes the camera mechanic, not the (renamed) view. Returns the
   *  coordinate "Go back" would now fly to (the pre-jump centre), so the caller can
   *  label it; null if there's no map. */
  teleportTo: (
    lat: number,
    lng: number,
    zoom?: number,
    duration?: number,
  ) => { lat: number; lng: number } | null;
  /** Fly to the stashed "go back" view, swapping it for the current one — so the
   *  same control toggles between the two locations (two-deep back/forward).
   *  Returns the coordinate the NEXT press would fly to (so the caller can label it
   *  and know it moved), or null when there's no stashed view yet. */
  teleportBack: () => { lat: number; lng: number } | null;
  zoomIn: () => void;
  zoomOut: () => void;
  /** Drive the Slide tool's spin programmatically to an ABSOLUTE elapsed
   *  rotation time (days, signed; 0 = the chart moment). No-op while the tool
   *  is off or a spin-drag is in progress — the pointer owns the spin then. */
  slideTo: (dtDays: number) => void;
  /** Nudge the Slide tool's spin by a RELATIVE amount (days, signed), against
   *  the live spin — safe under rapid repeats (no state read-back lag). */
  slideBy: (deltaDays: number) => void;
  /** Composite the current capture frame (map canvas + the pin, edge labels, caption
   *  and watermark DOM overlays) into a PNG and resolve a Blob; null if the map isn't
   *  ready. Driven by the Capture tool's Download / Copy buttons. */
  captureFrame: () => Promise<Blob | null>;
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

// Fly the camera to lng/lat at `zoom`, nudged clear of a left-docked panel (its
// width is published as --es-width on <html>): shift right by a quarter-width so
// the target lands where the centered nav/timeline bars sit rather than behind the
// panel. A panel that RESERVES its width already shrank the GL viewport out from
// under itself (`leftInset`), so that portion needs no nudge — only the OVERLAID
// remainder (--es-width beyond the reserved inset) does. Shared by flyTo /
// teleportTo and the paran / LS / zenith label clicks.
function flyWithSidebarOffset(
  map: maplibregl.Map,
  lng: number,
  lat: number,
  zoom: number,
  leftInset: number,
  // Optional flight time (ms). Omitted → MapLibre's default flyTo curve. A small value gives a
  // near-instant hop (the transparent-export toggle wants that; the normal fly stays leisurely).
  duration?: number,
) {
  const esWidth =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--es-width'),
    ) || 0;
  const overlaid = Math.max(0, esWidth - leftInset);
  map.flyTo({
    center: [lng, lat],
    zoom,
    offset: [overlaid / 4, 0],
    essential: true,
    ...(duration !== undefined ? { duration } : {}),
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

// The local-space direction-arrow layers (added via addArrowLayer in
// setupCustomLayers), togglable as one set — the Local Space window's Capture-time
// "Hide line arrows" option. Covers the natal AND overlay variants.
const LS_ARROW_LAYER_IDS = [
  'local-space-arrows-out',
  'local-space-arrows-in',
  'local-space-ov-arrows-out',
  'local-space-ov-arrows-in',
] as const;

function applyLsArrowVisibility(map: maplibregl.Map, hidden: boolean): void {
  try {
    for (const id of LS_ARROW_LAYER_IDS) {
      if (map.getLayer(id))
        map.setLayoutProperty(id, 'visibility', hidden ? 'none' : 'visible');
    }
  } catch {
    /* style not parsed yet — the load handler reasserts the current state */
  }
}
const lineTypeIs = (t: 'ASC' | 'DSC'): ExpressionSpecification =>
  ['==', ['get', 'lineType'], t] as unknown as ExpressionSpecification;

// ── Offline basemap fallback ─────────────────────────────────────────────────────────────────
// The live basemap (styles + vector tiles) streams from OpenFreeMap — and the glass/dark STYLES
// themselves are remote, so offline a fresh load wouldn't even reach the background. So with no
// connection the map opens on a self-contained style (a plain ocean) and draws the bundled coarse
// world outline (Natural Earth 1:110m — the same data the offline country lookup already ships and
// precaches) on top, so continents + borders still show beneath the chart lines.
const WF_SOURCE = 'world-fallback';
const WF_FILL = 'world-fallback-fill';
const WF_LINE = 'world-fallback-line';

// A style with NO external sources/sprite, so it loads with zero network. It keeps the live glyphs
// URL only so chart-line TEXT can reuse the SW-cached font PBFs when present; the outline's
// fills/lines need no glyphs, so even a cold cache still shows continents + borders.
function offlineStyle(theme: Theme): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': WORLD_FALLBACK_COLORS[theme].ocean },
      },
    ],
  };
}

// Draw the world outline into the current (offline) style, just above the background so it sits
// BENEATH the chart lines (added by setupCustomLayers before this async load resolves). The GeoJSON
// is dynamic-imported, so online users never download it; the chunk is precached for offline use.
async function installWorldFallback(map: maplibregl.Map, theme: Theme): Promise<void> {
  if (!map.getStyle() || map.getLayer(WF_FILL)) return;
  let worldOutline: () => GeoJSON.FeatureCollection;
  try {
    ({ worldOutline } = await import('../../lib/worldFallback'));
  } catch {
    return; // chunk unavailable — leave the plain ocean background
  }
  // The style may have swapped (theme / connectivity change) during the await.
  if (!map.getStyle() || map.getLayer(WF_FILL)) return;
  if (!map.getSource(WF_SOURCE)) {
    map.addSource(WF_SOURCE, { type: 'geojson', data: worldOutline() });
  }
  const c = WORLD_FALLBACK_COLORS[theme];
  const beforeId = (map.getStyle().layers ?? []).find((l) => l.id !== 'background')?.id;
  map.addLayer(
    { id: WF_FILL, type: 'fill', source: WF_SOURCE, paint: { 'fill-color': c.land } },
    beforeId,
  );
  map.addLayer(
    {
      id: WF_LINE,
      type: 'line',
      source: WF_SOURCE,
      paint: { 'line-color': c.line, 'line-width': 0.8 },
    },
    beforeId,
  );
}

function setupCustomLayers(
  map: maplibregl.Map,
  haloColor: string,
  measureColor: string,
  zenithFill: string,
  eclipseLabelHalo: { color: string; width: number },
) {
  // Night-side shading (Filters ▸ Night Shading): the very bottom of the
  // custom stack — an environment wash that everything astrological draws over.
  map.addSource('night-shade', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
  map.addLayer({
    id: 'night-shade-layer',
    source: 'night-shade',
    type: 'fill',
    paint: {
      'fill-color': ['get', 'color'],
      'fill-opacity': ['get', 'opacity'],
      'fill-antialias': false,
    },
  });

  // Orb-of-influence zones: under everything the chart draws — ecliptic,
  // eclipse curves, lines, parans, overlays, stamps (only the night wash sits
  // deeper). One source carries both band kinds; opacity is per-feature
  // (paran latitude bands run fainter than line bands). PARAN_SOURCE_OPTS (no
  // simplification) because that source includes the flat paran latitude bands,
  // which simplification would collapse at the antimeridian (see PARAN_SOURCE_OPTS).
  map.addSource('orb-bands', { type: 'geojson', data: EMPTY_FC(), ...PARAN_SOURCE_OPTS });
  map.addLayer({
    id: 'orb-bands-layer',
    source: 'orb-bands',
    type: 'fill',
    paint: {
      'fill-color': ['get', 'color'],
      'fill-opacity': ['get', 'opacity'],
      'fill-antialias': false,
    },
  });

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
  // The overlay's ecliptic — the same bright-yellow reference, but DOTTED so it reads
  // as the derived layer: a short round-capped dash + gap (a non-zero dash so it's
  // reliably visible; round caps soften it toward dots). Fed only while the overlay
  // zeniths are shown (the App gates it). Added right after the natal ecliptic, so
  // both sit beneath the lines, parans, and stamps.
  map.addSource('ecliptic-ov', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
  map.addLayer({
    id: 'ecliptic-ov-layer',
    source: 'ecliptic-ov',
    type: 'line',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#ffe14d',
      'line-width': 1.6,
      'line-opacity': 0.45,
      'line-dasharray': [1, 2],
    },
  });

  // ── Eclipses overlay: the selected eclipse's ground geometry — a solar
  // eclipse's track (band/limits/isolines/central) or a lunar eclipse's
  // visibility hemisphere and moonrise/set contact curves. One mixed-geometry
  // source; each layer filters on the feature `kind` (colors ride in feature
  // props, themed by the App). Added here so the shaded fills and contour
  // lines sit beneath all chart linework; the greatest-eclipse / sub-lunar
  // marker layers are added later, above the lines, beside the zenith stamps.
  map.addSource('eclipse', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
  map.addLayer({
    id: 'eclipse-band-fill',
    source: 'eclipse',
    type: 'fill',
    filter: ['==', ['get', 'kind'], 'band'],
    paint: {
      'fill-color': ['get', 'color'],
      'fill-opacity': 0.16,
    },
  });
  // The Moon-above-horizon hemisphere at a lunar eclipse's maximum — a wash
  // even fainter than the umbral band (it spans half the planet).
  map.addLayer({
    id: 'eclipse-lunar-vis-fill',
    source: 'eclipse',
    type: 'fill',
    filter: ['==', ['get', 'kind'], 'lunar-vis'],
    paint: {
      'fill-color': ['get', 'color'],
      'fill-opacity': 0.12,
    },
  });
  // The solar 0%-magnitude outer boundary: how far ANY trace of the eclipse
  // reaches. Faint and solid, so the dashed percentage family stands out
  // inside it.
  map.addLayer({
    id: 'eclipse-penumbral',
    source: 'eclipse',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'penumbral-limit'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 0.9,
      'line-opacity': 0.45,
    },
  });
  // Dashed-dotted contours of equal MAXIMUM partial-eclipse magnitude (the
  // classic eclipse-map 25/50/75% family). The dash-dot pattern is unique to
  // these — every other dashed line on the map uses a plain dash.
  map.addLayer({
    id: 'eclipse-isolines',
    source: 'eclipse',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'isoline'],
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 1,
      'line-opacity': 0.75,
      'line-dasharray': [5, 2, 1, 2],
    },
  });
  // Moonrise/set circles at a lunar eclipse's phase contacts (U1/U4, or P1/P4
  // for penumbral-only events) — between a phase's two circles, the Moon
  // rises or sets mid-phase. Same dash-dot family as the solar isolines.
  map.addLayer({
    id: 'eclipse-lunar-horizon',
    source: 'eclipse',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'lunar-horizon'],
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 1,
      'line-opacity': 0.75,
      'line-dasharray': [5, 2, 1, 2],
    },
  });
  map.addLayer({
    id: 'eclipse-isoline-labels',
    source: 'eclipse',
    type: 'symbol',
    filter: [
      'in',
      ['get', 'kind'],
      ['literal', ['isoline', 'lunar-horizon']],
    ],
    layout: {
      'symbol-placement': 'line',
      'text-field': ['get', 'label'],
      'text-size': 10,
      'text-font': ['Noto Sans Regular'],
      'symbol-spacing': 350,
    },
    paint: {
      'text-color': ['get', 'color'],
      // Theme-aware halo: Earth's medium-brown digits need a light parchment ring
      // (a near-black one buried them); Glass/Dark keep their high-contrast halos.
      'text-halo-color': eclipseLabelHalo.color,
      'text-halo-width': eclipseLabelHalo.width,
    },
  });
  map.addLayer({
    id: 'eclipse-limits',
    source: 'eclipse',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'limit'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 1.1,
      'line-opacity': 0.8,
    },
  });
  map.addLayer({
    id: 'eclipse-central',
    source: 'eclipse',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'central'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 2,
      'line-opacity': 0.95,
    },
  });

  map.addSource('parans', { type: 'geojson', data: EMPTY_FC(), ...PARAN_SOURCE_OPTS });
  map.addLayer({
    id: 'parans-layer',
    source: 'parans',
    type: 'line',
    // Full opacity like every chart line; the hairline width keeps the
    // horizontal rows subordinate to the angle lines.
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 0.7,
      'line-opacity': 1,
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
      'line-opacity': 1,
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
      'line-opacity': 1,
      'line-dasharray': [2, 2],
    },
  });
  // Outward ('→', toward the planet) and inward ('←', back toward the origin)
  // arrows mark the two halves of each local-space axis. The outward chevrons are
  // oversized (2×) for emphasis; the inward ones stay normal.
  addArrowLayer(map, 'local-space-arrows-out', 'local-space', lsDir('out'), '→', 30);
  addArrowLayer(map, 'local-space-arrows-in', 'local-space', lsDir('in'), '←');

  // "Aspects to angles" overlays (aspect lines and/or midpoint lines — the two
  // toggles stack, concatenated into this one source). Added before the base
  // acg-lines so those stay on top; thinner + DOTTED (round-capped) so the set
  // reads as "derived" from the solid base lines AND — since these lines follow
  // the active frame (natal, or the overlay's own aspects/midpoints when an
  // overlay is up) — stays distinct from the DASHED overlay primary lines that
  // share that frame. The fixed-star lines are dotted too, but carry their ✦
  // beads + starlight tint (and butt-cap fine dashes) to tell the two apart.
  map.addSource('angle-lines', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
  map.addLayer({
    id: 'angle-lines-layer',
    source: 'angle-lines',
    type: 'line',
    // Round caps round the short dashes off into dots. NB the zero-length "pure
    // dot" dasharray ([0, N]) at width 1 renders as sub-pixel dots too faint to
    // read over the basemap (all but invisible) — a leading 0 only works when a
    // real on-segment follows it as a phase offset (e.g. the node-pair [0, 3, 3]
    // below). So keep the on-segment > 0 with a hair more width; the round cap
    // does the rest.
    layout: { 'line-cap': 'round' },
    // Full opacity like every chart line; the slim width + tight round dots mark
    // the set as "derived" and keep it distinct from both the solid base lines
    // and the longer-dashed overlays.
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 1.3,
      'line-opacity': 1,
      'line-dasharray': [1, 3],
    },
  });

  // Fixed-star lines (Filters ▸ Fixed Stars): thin and dotted in one shared
  // per-theme starlight tint, under the planet lines so the chart's own
  // linework keeps visual priority. Little baked star sparks repeat along each
  // line (✦—✦—✦) so the set reads at a glance on the pale basemaps too — the
  // sprite carries the theme halo, the dotted line stays the thread (and the
  // hover/click hit target).
  map.addSource('star-lines', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
  map.addLayer({
    id: 'star-lines-layer',
    source: 'star-lines',
    type: 'line',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 0.8,
      'line-opacity': 0.9,
      'line-dasharray': [1, 2.5],
    },
  });
  map.addLayer({
    id: 'star-lines-marks',
    source: 'star-lines',
    type: 'symbol',
    layout: {
      'icon-image': STAR_MARK_IMAGE,
      'symbol-placement': 'line',
      // Tight spacing with the small re-baked spark (see STAR_LOGICAL in
      // glyphImages): a fine ✦✦✦ bead-thread along the dotted base line. Collision
      // is disabled below, so every bead draws — but the tiny icon keeps the GPU
      // fill lower than the old roomy-but-large sparks.
      'symbol-spacing': 24,
      // Upright stars (a rotated five-point star reads as noise), decorative
      // placement that never suppresses or collides with the planet labels.
      'icon-rotation-alignment': 'viewport',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-padding': 0,
    },
  });

  // lineMetrics:true lets the node-pair layers below colour a single line with a
  // line-gradient (half North Node colour, half South Node colour).
  map.addSource('acg-lines', {
    type: 'geojson',
    data: EMPTY_FC(),
    ...LINE_SOURCE_OPTS,
    lineMetrics: true,
  });
  map.addLayer({
    id: 'acg-lines-meridian',
    source: 'acg-lines',
    // Solid (single-colour) meridians; merged node-pair meridians render in the dedicated
    // two-tone layer below instead (pair == true), so exclude them here.
    filter: [
      'all',
      ['in', ['get', 'lineType'], ['literal', ['MC', 'IC']]],
      ['!=', ['get', 'pair'], true],
    ],
    type: 'line',
    // Full opacity everywhere — the MC/IC hierarchy reads from width alone.
    paint: {
      'line-color': ['get', 'color'],
      'line-width': [
        'case',
        ['==', ['get', 'lineType'], 'MC'],
        1.9,
        1.0,
      ],
      'line-opacity': 1,
    },
  });
  // Base horizon lines are SOLID (no dashes) — dashes are reserved entirely for
  // overlays now. ASC vs DSC is shown instead by periodic arrows: ASC points up,
  // DSC points down (added just below). The Vertex-axis curves (VX/AVX) ride
  // this layer too, a touch thinner and arrow-free, so they read as the quieter
  // cousins of the rising/setting lines; their edge badges name them Vx/Avx.
  map.addLayer({
    id: 'acg-lines-horizon',
    source: 'acg-lines',
    type: 'line',
    filter: [
      'all',
      ['in', ['get', 'lineType'], ['literal', ['ASC', 'DSC', 'VX', 'AVX']]],
      ['!=', ['get', 'pair'], true],
    ],
    paint: {
      'line-color': ['get', 'color'],
      'line-width': [
        'case',
        ['in', ['get', 'lineType'], ['literal', ['VX', 'AVX']]],
        1.0,
        1.5,
      ],
      'line-opacity': 1,
    },
  });
  // Merged lunar-node pairs: the North Node line and its antipodal South Node line
  // coincide, so we draw ONE line graded half North Node colour, half South Node colour
  // (a hard split at the line's midpoint) rather than two lines overdrawing. Same
  // width/opacity as the solid layers above so it reads as the same kind of line.
  const nodePairGradient = [
    'step',
    ['line-progress'],
    PLANET_COLORS.NorthNode,
    0.5,
    PLANET_COLORS.SouthNode,
  ] as unknown as ExpressionSpecification;
  map.addLayer({
    id: 'acg-lines-meridian-pair',
    source: 'acg-lines',
    type: 'line',
    filter: [
      'all',
      ['in', ['get', 'lineType'], ['literal', ['MC', 'IC']]],
      ['==', ['get', 'pair'], true],
    ],
    paint: {
      'line-gradient': nodePairGradient,
      'line-width': ['case', ['==', ['get', 'lineType'], 'MC'], 1.9, 1.0],
      'line-opacity': 1,
    },
  });
  map.addLayer({
    id: 'acg-lines-horizon-pair',
    source: 'acg-lines',
    type: 'line',
    filter: [
      'all',
      ['in', ['get', 'lineType'], ['literal', ['ASC', 'DSC', 'VX', 'AVX']]],
      ['==', ['get', 'pair'], true],
    ],
    paint: {
      'line-gradient': nodePairGradient,
      'line-width': [
        'case',
        ['in', ['get', 'lineType'], ['literal', ['VX', 'AVX']]],
        1.0,
        1.5,
      ],
      'line-opacity': 1,
    },
  });
  // ASC/DSC arrows skip merged node pairs (pair == true): a single line that is both a
  // rising and a setting line can't carry a meaningful up/down arrow.
  addArrowLayer(
    map,
    'acg-lines-arrows-asc',
    'acg-lines',
    ['all', lineTypeIs('ASC'), ['!=', ['get', 'pair'], true]] as unknown as ExpressionSpecification,
    '→',
  );
  addArrowLayer(
    map,
    'acg-lines-arrows-dsc',
    'acg-lines',
    ['all', lineTypeIs('DSC'), ['!=', ['get', 'pair'], true]] as unknown as ExpressionSpecification,
    '←',
  );
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

  map.addSource('parans-ov', { type: 'geojson', data: EMPTY_FC(), ...PARAN_SOURCE_OPTS });
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
    // Merged node-pair meridians render in the two-tone pair layers below (pair == true).
    filter: [
      'all',
      ['in', ['get', 'lineType'], ['literal', ['MC', 'IC']]],
      ['!=', ['get', 'pair'], true],
    ],
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['case', ['==', ['get', 'lineType'], 'MC'], 1.5, 0.8],
      'line-opacity': 1,
      'line-dasharray': [3, 3],
    },
  });
  // Overlay horizon lines are dashed (the "dotted equivalent" of the solid base
  // lines); ASC vs DSC is shown by the same up/down arrows, added below. The
  // Vertex-axis curves ride along, slightly thinner, like on the base layer.
  map.addLayer({
    id: 'acg-lines-ov-horizon',
    source: 'acg-lines-ov',
    type: 'line',
    filter: [
      'all',
      ['in', ['get', 'lineType'], ['literal', ['ASC', 'DSC', 'VX', 'AVX']]],
      ['!=', ['get', 'pair'], true],
    ],
    paint: {
      'line-color': ['get', 'color'],
      'line-width': [
        'case',
        ['in', ['get', 'lineType'], ['literal', ['VX', 'AVX']]],
        0.8,
        1.1,
      ],
      'line-opacity': 1,
      'line-dasharray': [2, 3],
    },
  });
  // Merged lunar-node pairs on the OVERLAY: the dashed two-tone counterpart of the base
  // gradient pair (line-gradient can't combine with dashes, and overlay lines must stay
  // dashed). Two layers — North-node colour and South-node colour with complementary
  // (offset) dashes — interleave into alternating green/salmon dashes, so the fused node
  // line reads as both nodes while still reading as a derived overlay line. One pair of
  // layers covers all four angles via a data-driven width (MC widest, IC thinnest).
  map.addLayer({
    id: 'acg-lines-ov-pair-nn',
    source: 'acg-lines-ov',
    type: 'line',
    filter: ['==', ['get', 'pair'], true],
    paint: {
      'line-color': PLANET_COLORS.NorthNode,
      'line-width': [
        'case',
        ['==', ['get', 'lineType'], 'MC'],
        1.5,
        ['==', ['get', 'lineType'], 'IC'],
        0.8,
        1.1,
      ],
      'line-opacity': 1,
      'line-dasharray': [3, 3],
    },
  });
  map.addLayer({
    id: 'acg-lines-ov-pair-sn',
    source: 'acg-lines-ov',
    type: 'line',
    filter: ['==', ['get', 'pair'], true],
    paint: {
      'line-color': PLANET_COLORS.SouthNode,
      'line-width': [
        'case',
        ['==', ['get', 'lineType'], 'MC'],
        1.5,
        ['==', ['get', 'lineType'], 'IC'],
        0.8,
        1.1,
      ],
      'line-opacity': 1,
      // Leading 0 offsets these dashes into the North-node layer's gaps → alternating.
      'line-dasharray': [0, 3, 3],
    },
  });
  addArrowLayer(
    map,
    'acg-lines-ov-arrows-asc',
    'acg-lines-ov',
    ['all', lineTypeIs('ASC'), ['!=', ['get', 'pair'], true]] as unknown as ExpressionSpecification,
    '→',
  );
  addArrowLayer(
    map,
    'acg-lines-ov-arrows-dsc',
    'acg-lines-ov',
    ['all', lineTypeIs('DSC'), ['!=', ['get', 'pair'], true]] as unknown as ExpressionSpecification,
    '←',
  );
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
      // ~30% smaller than the original 4/6 dot, stroke scaled to match so it
      // shrinks evenly rather than reading as a heavy ring.
      'circle-radius': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        4.2,
        2.8,
      ],
      'circle-radius-transition': { duration: 150, delay: 0 },
      'circle-color': ['get', 'color'],
      'circle-stroke-color': haloColor || 'rgba(0,0,0,0.4)',
      'circle-stroke-width': 0.875,
    },
  });

  // ── Overlay zenith stamps: the same glyph discs as the natal zeniths below, but
  // for the active overlay's bodies. The App feeds this source points only while
  // Overlay ▸ Display ▸ Zenith is on (empty otherwise, so the stamps vanish). Added
  // BEFORE the natal stamps so a natal body stays on top where the two coincide, and
  // drawn a touch softer to read as the derived (dashed-line) layer. Like the natal
  // stamps they hover-grow and fly on click (zenithAtPoint hit-tests this layer too);
  // the click toggle is keyed by the overlay tag, so it's shared with the matching
  // overlay edge label.
  map.addSource('acg-zenith-ov', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
  map.addLayer({
    id: 'acg-zenith-ov-disc',
    source: 'acg-zenith-ov',
    type: 'circle',
    paint: {
      // Hover-only bloom (see the natal disc below): invisible at rest, it grows a
      // softer ring out from behind the overlay stamp on hover. Capped at 0.85 to
      // stay the derived (dashed-line) layer's lower weight.
      'circle-radius': ['case', ['boolean', ['feature-state', 'hover'], false], 18, 13],
      'circle-radius-transition': { duration: 150, delay: 0 },
      'circle-color': zenithFill,
      'circle-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.85, 0],
      'circle-opacity-transition': { duration: 150, delay: 0 },
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2.75, 0],
      'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.85, 0],
      'circle-stroke-opacity-transition': { duration: 150, delay: 0 },
    },
  });
  map.addLayer({
    id: 'acg-zenith-ov-layer',
    source: 'acg-zenith-ov',
    type: 'symbol',
    layout: {
      'icon-image': ['concat', ZENITH_GLYPH_PREFIX, ['get', 'planet']] as unknown as ExpressionSpecification,
      'icon-size': 1,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: {
      'icon-opacity': 0.85,
    },
  });

  // The overlay bodies' nadir (underfoot) stamps — the overlay twin of the natal
  // nadir layer below: the DIAMOND coin (NADIR_GLYPH_PREFIX), softer at rest and
  // brightening on hover, hit-tested (ZENITH_HIT_LAYERS) so it hovers + flies like a
  // zenith. Shares the overlay Zeniths/Nadirs toggle. Tucked BENEATH the overlay
  // zenith disc so a nadir coinciding with another overlay body's zenith draws under.
  map.addSource('acg-nadir-ov', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
  map.addLayer(
    {
      id: 'acg-nadir-ov-layer',
      source: 'acg-nadir-ov',
      type: 'symbol',
      layout: {
        'icon-image': ['concat', NADIR_GLYPH_PREFIX, ['get', 'planet']] as unknown as ExpressionSpecification,
        'icon-size': 1,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: {
        'icon-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.95, 0.7],
        'icon-opacity-transition': { duration: 150, delay: 0 },
      },
    },
    'acg-zenith-ov-disc',
  );

  // ── Zenith stamps: the planet glyph at each body's sub-planetary point (where
  // it is directly overhead) — on its MC line, at latitude = declination. Drawn
  // above the lines so the glyph reads on top of the meridian.
  map.addSource('acg-zenith', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
  // The disc + ring now live BAKED in the stamp sprite (acg-zenith-layer below), so
  // each stamp draws as one overlap-stacking coin. This circle is the hover-grow
  // ONLY: transparent at rest, on hover it blooms a larger ring out from BEHIND the
  // stamp (drawn under the symbol layer) — mirroring the badge hover lift without
  // re-introducing a separate always-on disc that split from its glyph. The rest
  // radius is kept at the disc size so the bloom grows from the coin's edge.
  map.addLayer({
    id: 'acg-zenith-disc',
    source: 'acg-zenith',
    type: 'circle',
    paint: {
      'circle-radius': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        18,
        13,
      ],
      'circle-radius-transition': { duration: 150, delay: 0 },
      'circle-color': zenithFill,
      'circle-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0],
      'circle-opacity-transition': { duration: 150, delay: 0 },
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-width': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        2.75,
        0,
      ],
      'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0],
      'circle-stroke-opacity-transition': { duration: 150, delay: 0 },
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

  // ── Nadir stamps: the antipodal sub-anti-planetary points (each body directly
  // underfoot), on the IC line. A DIAMOND coin (NADIR_GLYPH_PREFIX) — a distinct
  // shape from the zenith's circle. Softer at rest, BRIGHTENING on hover (a
  // feature-state cue, like the zenith disc's hover bloom); it's hit-tested too
  // (ZENITH_HIT_LAYERS), so a nadir hovers + flies-to-on-click like a zenith. Empty
  // unless the Zeniths/Nadirs filter is on. Inserted BENEATH the natal zenith stamps
  // (beforeId): a body's nadir is 180° from its OWN zenith, but it CAN coincide with
  // another body's zenith (an opposition) — drawing under keeps the zenith on top.
  map.addSource('acg-nadir', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
  map.addLayer(
    {
      id: 'acg-nadir-layer',
      source: 'acg-nadir',
      type: 'symbol',
      layout: {
        'icon-image': ['concat', NADIR_GLYPH_PREFIX, ['get', 'planet']] as unknown as ExpressionSpecification,
        'icon-size': 1,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: {
        'icon-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0.8],
        'icon-opacity-transition': { duration: 150, delay: 0 },
      },
    },
    'acg-zenith-disc',
  );

  // The greatest-eclipse (solar) / sub-lunar (lunar) maximum point is drawn as a
  // STYLED DOM marker — a corona / eclipsed-moon icon with a finite ping — rather
  // than a GL coin, so it's clearly distinct from the zenith stamps (see the
  // eclipse-marker effect below). The 'ge'/'sublunar' point features stay in the
  // eclipse source (just unrendered here) as that marker's position source.

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

// The FeatureCollection last pushed to each source (by object identity, keyed per
// map). Every collection arrives memoized from the App, so identity is a reliable
// change signal — and it lets pushData skip the sources whose data didn't change.
// Without this, the data effect re-fed ALL sources whenever ANY one collection
// changed, and each setData makes geojson-vt re-tile that source's full geometry:
// during timeline playback (~8 recomputes/s, only the overlay actually changing)
// that re-tiled the natal lines, aspect/midpoint overlays, parans etc. for nothing.
const lastPushed = new WeakMap<maplibregl.Map, Record<string, unknown>>();

// Identity-stable "nothing here" collection for the gated sources (a fresh
// `EMPTY_FC()` per call would look like new data and defeat the skip above).
const EMPTY_DATA: FeatureCollection = { type: 'FeatureCollection', features: [] };

// `freshSources` forces every push: pass it right after setupCustomLayers (initial
// load and theme/style reloads), where the just-recreated sources hold empty data
// regardless of what was pushed before.
function pushData(map: maplibregl.Map, data: MapData, freshSources = false, lsOnly = false) {
  if (freshSources || !lastPushed.has(map)) lastPushed.set(map, {});
  const prev = lastPushed.get(map)!;
  const push = (id: string, fc: Parameters<maplibregl.GeoJSONSource['setData']>[0]) => {
    if (prev[id] === fc) return;
    const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(fc);
    prev[id] = fc;
  };
  // Transparent (Local Space) export shows ONLY the local-space lines — empty every OTHER family
  // here (data-level, not a per-layer visibility flip), so the hidden lines never draw and never
  // reach the exported PNG. This INCLUDES the local-space × birth-chart crossing dots (acg-ls-cross):
  // they mark where an LS line meets a now-hidden natal line, so they'd be orphaned. Only the LS
  // lines themselves (active + overlay) below keep their real data.
  const pushGated = (id: string, fc: Parameters<maplibregl.GeoJSONSource['setData']>[0]) =>
    push(id, lsOnly ? EMPTY_DATA : fc);
  pushGated('acg-lines', data.lines);
  pushGated('angle-lines', data.angleLines);
  pushGated('parans', data.parans);
  pushGated('orb-bands', data.orbBands ?? EMPTY_DATA);
  pushGated('star-lines', data.starLines ?? EMPTY_DATA);
  pushGated('night-shade', data.nightShade ?? EMPTY_DATA);
  push('local-space', data.localSpace);
  pushGated('acg-ls-cross', data.localSpaceCross);
  pushGated('acg-zenith', data.zenith);
  pushGated('acg-nadir', data.nadir);
  pushGated('ecliptic', data.ecliptic ?? EMPTY_DATA);
  pushGated('eclipse', data.eclipse ?? EMPTY_DATA);

  const ov = data.overlay;
  pushGated('acg-lines-ov', ov ? ov.lines : EMPTY_DATA);
  pushGated('parans-ov', ov ? ov.parans : EMPTY_DATA);
  push('local-space-ov', ov ? ov.localSpace : EMPTY_DATA);
  // Overlay zenith stamps + the overlay ecliptic — already empty unless Overlay ▸
  // Display ▸ Zenith is on (the App gates ov.zenith / ov.ecliptic), so this just
  // mirrors the source data (and is emptied entirely in the LS-only transparent export).
  pushGated('acg-zenith-ov', ov ? ov.zenith : EMPTY_DATA);
  pushGated('acg-nadir-ov', ov ? ov.nadir : EMPTY_DATA);
  pushGated('ecliptic-ov', ov ? ov.ecliptic : EMPTY_DATA);
}

// Whether this browser will give us a WebGL context at all. MapLibre renders the
// entire map through WebGL with no 2D fallback, so without one the map surface is
// just a blank (dark) box — we use this to show a readable notice instead.
//
// Deliberately the lightest possible check: one throwaway 1x1 canvas, a single
// context request, no shaders and no `failIfMajorPerformanceCaveat`, then we hand
// the context straight back. We do NOT force a high-performance GPU or stress the
// driver — a flaky machine should be no worse off for having looked. Software
// rendering (e.g. SwiftShader) still counts as "supported": we'd rather let
// MapLibre try than pre-emptively lock out someone who could run, just slowly.
function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    if (!gl) return false;
    // Release the probe context immediately rather than leaving it for the GC, so
    // we never hold a second live GL context alongside the real map.
    (gl as WebGLRenderingContext)
      .getExtension('WEBGL_lose_context')
      ?.loseContext();
    return true;
  } catch {
    // Some privacy / anti-fingerprinting shields throw from getContext rather than
    // returning null. Treat any throw as "no WebGL".
    return false;
  }
}

// The caption band's height as a fraction of the frame WIDTH (so the text size stays
// consistent across aspect ratios). Deliberately small — it's a footer, not a banner.
// When the caption is on, the map view is inset by this much at the bottom so linework
// and edge labels render ABOVE the band rather than behind it; the same band carries
// the caption text and the (mandatory) watermark.
const CAPTURE_CAPTION_BAND_FRAC = 0.05;

// Generic AstroLina attribution stamped into every exported PNG's metadata — provenance that
// travels with a re-shared image, pointing back to the project (astrolina.org, matching the
// AGPL 7(b) watermark default). Brand/source only: NEVER the chart's birth data, which the
// user never sees in metadata. tEXt values are Latin-1 (the "·" is U+00B7, in range); the XMP
// packet (UTF-8) is what Google / Adobe / Pinterest read.
const CAPTURE_PNG_META = {
  Title: 'Astrocartography map · AstroLina',
  Author: 'AstroLina',
  Description:
    'Created with AstroLina, web-based astrocartography for curious minds. https://astrolina.org',
  Copyright: 'AstroLina (https://astrolina.org)',
  Software: 'AstroLina',
  Source: 'https://astrolina.org',
};
const CAPTURE_PNG_XMP =
  '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
  '<x:xmpmeta xmlns:x="adobe:ns:meta/">' +
  '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
  '<rdf:Description rdf:about=""' +
  ' xmlns:dc="http://purl.org/dc/elements/1.1/"' +
  ' xmlns:xmp="http://ns.adobe.com/xap/1.0/"' +
  ' xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/"' +
  ' xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/">' +
  '<dc:title><rdf:Alt><rdf:li xml:lang="x-default">Astrocartography map · AstroLina</rdf:li></rdf:Alt></dc:title>' +
  '<dc:creator><rdf:Seq><rdf:li>AstroLina</rdf:li></rdf:Seq></dc:creator>' +
  '<dc:description><rdf:Alt><rdf:li xml:lang="x-default">Created with AstroLina, web-based astrocartography for curious minds.</rdf:li></rdf:Alt></dc:description>' +
  '<dc:source>https://astrolina.org</dc:source>' +
  '<xmp:CreatorTool>AstroLina</xmp:CreatorTool>' +
  '<xmpRights:Marked>True</xmpRights:Marked>' +
  '<xmpRights:WebStatement>https://astrolina.org</xmpRights:WebStatement>' +
  '<photoshop:Credit>AstroLina</photoshop:Credit>' +
  '<photoshop:Source>https://astrolina.org</photoshop:Source>' +
  '</rdf:Description></rdf:RDF></x:xmpmeta>' +
  '<?xpacket end="r"?>';

export const Map = forwardRef<MapHandle, MapProps>(function Map({
  lines,
  angleLines,
  parans,
  orbBands,
  starLines,
  nightShade,
  localSpace,
  localSpaceCross,
  localSpaceOrigin,
  hideCompass,
  zenith,
  nadir,
  ecliptic,
  overlay,
  eclipse,
  eclipseTip,
  eclipseCard,
  lineCard,
  pin,
  pinType,
  distanceRef,
  initialCenter,
  initialView,
  bottomInset = 0,
  leftInset = 0,
  theme,
  projection,
  showRoads = true,
  showRivers = true,
  showLabels = true,
  hideBasemap = false,
  hideLsArrows = false,
  lsTransparent = false,
  lsLabelName = false,
  lsLineDeg = false,
  lsEdgeLabels = false,
  measureActive,
  measureSnap,
  measureColor,
  onMeasure,
  onMeasureCancel,
  slideActive,
  onSlide,
  onSlideCancel,
  frameActive,
  frameAspect,
  frameCaptionText,
  frameCaptionLines = [],
  frameExtras,
  noCaption,
  onFrameCancel,
  onMissionEvent,
  keepZoomOutVisible,
  onHover,
  onLeave,
  onPlacePin,
  onRightClick,
  onMapClick,
  onDetailZoomChange,
  overlayCtx,
  hiddenOverlayIds,
  spotlightActive,
  spotlightAiming,
  creditsOpen,
  setCreditsOpen,
  skyFollow = 'off',
  skyFollowHeld,
}: MapProps, ref) {
  const { t, labels } = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  // The Capture frame wraps the map canvas + its DOM overlays (edge
  // labels, pin, local-horizon wheel); insetting it shrinks the working view, and
  // it's the element `captureFrame` rasterises.
  const frameRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // Mirror of frameActive, read by computeBadges' HUD-dodge gate. While the Capture frame
  // is armed, edge badges ignore the HUD panels (incl. the Capture window) and hug only
  // the frame edges. Assigned during render so it's current before any badge recompute.
  const frameActiveRef = useRef(!!frameActive);
  frameActiveRef.current = !!frameActive;
  // One-slot "go back" view for the Location window: teleportTo() stashes the
  // pre-jump camera here; teleportBack() swaps current<->saved so the same button
  // toggles between the two locations (two-deep, like browser back/forward).
  const teleportBackRef = useRef<SavedView | null>(null);
  // The reserved left inset in a ref, so the stable (deps []) fly handlers read the
  // current reserved width at call time without re-creating.
  const leftInsetRef = useRef(leftInset);
  useEffect(() => {
    leftInsetRef.current = leftInset;
  }, [leftInset]);

  useImperativeHandle(ref, () => ({
    flyTo: (lat: number, lng: number, zoom?: number) => {
      const map = mapRef.current;
      if (!map) return;
      flyWithSidebarOffset(map, lng, lat, zoom ?? Math.max(map.getZoom(), 4), leftInsetRef.current);
    },
    getView: () => {
      const map = mapRef.current;
      if (!map) return null;
      const c = map.getCenter();
      return { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
    },
    teleportTo: (lat: number, lng: number, zoom?: number, duration?: number) => {
      const map = mapRef.current;
      if (!map) return null;
      // Remember where we are so "Go back" can return here.
      teleportBackRef.current = snapshotView(map);
      flyWithSidebarOffset(map, lng, lat, zoom ?? Math.max(map.getZoom(), 4), leftInsetRef.current, duration);
      // [lng, lat] -> {lat, lng}: the pre-jump centre "Go back" now targets.
      const c = teleportBackRef.current.center;
      return { lat: c[1], lng: c[0] };
    },
    teleportBack: () => {
      const map = mapRef.current;
      const saved = teleportBackRef.current;
      if (!map || !saved) return null;
      // Swap: stash the current view so a second press goes forward again.
      teleportBackRef.current = snapshotView(map);
      map.flyTo({
        center: saved.center,
        zoom: saved.zoom,
        bearing: saved.bearing,
        pitch: saved.pitch,
        essential: true,
      });
      // The just-stashed current view is what the NEXT press will fly to.
      const c = teleportBackRef.current.center;
      return { lat: c[1], lng: c[0] };
    },
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
    // Read at call time: the ref is populated only while the Slide tool's
    // effect is live, so these are safe no-ops whenever the tool is off.
    slideTo: (dtDays: number) => slideApiRef.current?.to(dtDays),
    slideBy: (deltaDays: number) => slideApiRef.current?.by(deltaDays),
    captureFrame: async () => {
      const map = mapRef.current;
      const frameEl = frameRef.current;
      if (!map || !frameEl) return null;
      const mapCanvas = map.getCanvas();
      const rect = frameEl.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.max(1, Math.round(rect.width * scale));
      const H = Math.max(1, Math.round(rect.height * scale));
      const out = document.createElement('canvas');
      out.width = W;
      out.height = H;
      const ctx = out.getContext('2d');
      if (!ctx) return null;

      // 0) Backdrop. In 3D globe mode the "space" void is a CSS background on the map
      //    container (the GL canvas is transparent there), so paint it first or the
      //    export would have a transparent void. In flat 2D the basemap is opaque and
      //    this is a harmless no-op (the container background is unset/transparent).
      //    While the basemap is hidden (Local Space ▸ "Hide map") stand down entirely:
      //    a transparent background IS the export — nothing may pre-fill the bitmap.
      //    (Read off the container class the hideBasemap effect maintains — the same
      //    signal the checkerboard CSS keys on — rather than a reactive prop ref.)
      if (!containerRef.current?.classList.contains('basemap-hidden')) {
        const containerBg = containerRef.current
          ? getComputedStyle(containerRef.current).backgroundColor
          : '';
        if (containerBg && containerBg !== 'rgba(0, 0, 0, 0)' && containerBg !== 'transparent') {
          ctx.fillStyle = containerBg;
          ctx.fillRect(0, 0, W, H);
        }
      }

      // 1) The map itself: draw the live WebGL canvas straight in. Reliable because
      //    the map is built with preserveDrawingBuffer, and far sturdier than asking
      //    html2canvas to rasterise a GL canvas. The map container is INSET within the
      //    frame — by the caption band (bottom, always reserved) and, when an Extras panel
      //    is shown, by that panel (left for landscape / top for square/portrait). So draw
      //    the canvas at its OWN position + size relative to the frame, not at the origin —
      //    otherwise the lines shift out from under the edge labels (which html2canvas
      //    captures at their real inset spots below) and bleed into the opaque panel/caption.
      const mapRect = mapCanvas.getBoundingClientRect();
      const mapX = Math.round((mapRect.left - rect.left) * scale);
      const mapY = Math.round((mapRect.top - rect.top) * scale);
      const mapW = Math.round(mapRect.width * scale);
      const mapH = Math.round(mapRect.height * scale);
      // Overdraw ~1px each side so the map tucks UNDER the (opaque) panel/caption and past
      // the frame edge — hiding any 1px rounding seam between this GL rect and the
      // html2canvas overlay. Guarded: a degenerate zero rect skips the draw rather than
      // smearing the whole backbuffer across the frame.
      if (mapW > 0 && mapH > 0) {
        // "Mask Lines": clip the map canvas to the same circle the live view uses (origin +
        // ~30%-over-compass radius), so the exported linework is a self-contained compass rose.
        // The DOM overlays below (compass, rim badges) are composited AFTER, unclipped.
        const os = originScreenRef.current;
        const doMask = lsTransparentRef.current && os && map.getZoom() >= COMPASS_ZOOM;
        if (doMask) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(
            mapX + os.x * scale,
            mapY + os.y * scale,
            maskRadiusAt(map.getZoom()) * scale,
            0,
            Math.PI * 2,
          );
          ctx.clip();
        }
        ctx.drawImage(mapCanvas, mapX - 1, mapY - 1, mapW + 2, mapH + 2);
        if (doMask) ctx.restore();
      }

      // 2) DOM overlays (pin, edge labels, local-horizon wheel, AND the caption band +
      //    watermark): html2canvas over the whole frame, with the GL canvas and UI
      //    chrome ignored, composited on top. The caption/watermark are real DOM inside
      //    the frame, so they're captured here at their on-screen positions (WYSIWYG).
      try {
        // If the brand declares custom display faces (a downstream build: the watermark wordmark and the
        // caption face), make sure they're all loaded before rasterising — otherwise
        // html2canvas would capture a fallback font. The core default has no fontSpecs (its
        // watermark + caption use the already-loaded system font).
        const brandFonts = getCaptureBrand().fontSpecs;
        if (brandFonts?.length) {
          try {
            await Promise.all(brandFonts.map((spec) => document.fonts.load(spec)));
          } catch {
            /* font API unavailable — html2canvas will use whatever is loaded */
          }
        }
        // The 2D glyph re-stamp below draws with ctx.fillText, which needs the bundled
        // symbol face actually loaded for the canvas — otherwise it falls back to a
        // colour-emoji font (e.g. the Sun renders as concentric rings). Preload it.
        try {
          await document.fonts.load('16px "Noto Sans Symbols"', '☉');
        } catch {
          /* font API unavailable — fillText will use whatever is loaded */
        }
        const { default: html2canvas } = await import('html2canvas-pro');
        const overlay = await html2canvas(frameEl, {
          backgroundColor: null,
          scale,
          useCORS: true,
          logging: false,
          ignoreElements: (el: Element) => {
            if (el === mapCanvas) return true;
            const cl = el.classList;
            if (cl?.contains('maplibregl-canvas')) return true;
            // Drop the zoom/compass control (top-right) — also hidden live via CSS while
            // framing. The attribution/credits control (bottom-right) is intentionally
            // KEPT: it's a real on-map disclosure the user composes with, so it belongs
            // in the exported image (WYSIWYG).
            if (
              cl?.contains('maplibregl-ctrl-top-right') ||
              el.closest?.('.maplibregl-ctrl-top-right')
            )
              return true;
            // Drop hover tooltips (a bare .ui-tip), but KEEP a .ui-tip that lives inside
            // a maplibre popup — those are the pinned line / eclipse interpretation cards
            // the user clicked open, which should appear in the export (WYSIWYG).
            if (
              (cl?.contains('ui-tip') || el.closest?.('.ui-tip')) &&
              !el.closest?.('.maplibregl-popup')
            )
              return true;
            // The location pin (a MapLibre marker SVG) is RE-DRAWN on the 2D canvas after
            // this pass — keep its whole subtree out of html2canvas, because a marker in the
            // tree can make the entire overlay pass fail (→ map-only "broken" export). Edge
            // labels stay (they're plain DOM and composite fine).
            if (
              cl?.contains('map-pin') ||
              el.closest?.('.map-pin') ||
              (cl?.contains('maplibregl-marker') && !!el.querySelector?.('.map-pin'))
            )
              return true;
            // The chart WHEEL (Details ▸ Wheel) is colour-styled via CSS vars + the bundled
            // glyph font, neither of which survive html2canvas's SVG-to-image serialisation.
            // It's rasterised separately below (styles inlined) and its glyphs re-stamped, so
            // keep the whole wheel subtree out of this pass.
            if (cl?.contains('wheel-svg') || el.closest?.('.wheel-svg')) return true;
            return false;
          },
          // Mutate only the CLONE (no live flash): drop the viewfinder ring/scrim so
          // they don't bleed in, and make the map container transparent. The container
          // carries an OPAQUE void background in 3D globe mode — left as-is, html2canvas
          // would repaint it over the globe we already drew in step 1. The void colour
          // is preserved by the backdrop fill in step 0.
          onclone: (_doc: Document, el: HTMLElement) => {
            el.style.outline = 'none';
            el.style.boxShadow = 'none';
            // Set with priority: the "Hide map" transparency checkerboard (Map.css,
            // .basemap-hidden) is an !important rule, which a plain inline style
            // would lose to — baking the checker into the export.
            el.querySelectorAll<HTMLElement>('.map-container').forEach((c) => {
              c.style.setProperty('background', 'transparent', 'important');
            });
            // html2canvas measures text a hair wider than the browser, so a caption that
            // fits on screen (no ellipsis) can lose a letter or two to its overflow:hidden +
            // text-overflow:ellipsis clip in the export. If the LIVE caption isn't actually
            // truncated (scrollWidth fits clientWidth), drop the clip on the clone so the full
            // text renders — it already fits its box, so it stays clear of the watermark.
            const liveCap = frameEl.querySelector('.capture-caption-text');
            if (liveCap && liveCap.scrollWidth <= liveCap.clientWidth + 1) {
              el.querySelectorAll<HTMLElement>('.capture-caption-text').forEach((c) => {
                c.style.setProperty('overflow', 'visible', 'important');
                c.style.setProperty('text-overflow', 'clip', 'important');
                c.style.setProperty('max-width', 'none', 'important');
              });
            }
            // A downstream brand may colour a letter of the watermark via
            // background-clip:text (a gradient), which html2canvas can't honour — it
            // would render that glyph transparent. Force any such element to a solid
            // fill of its own live computed colour, so the export is reliable and the
            // exact colour stays brand-owned (no hard-coded value in core).
            const liveBrandO = document.querySelector('.capture-watermark-o');
            const brandOColor = liveBrandO ? getComputedStyle(liveBrandO).color : '';
            if (brandOColor) {
              el.querySelectorAll<HTMLElement>('.capture-watermark-o').forEach((o) => {
                o.style.setProperty('background', 'none');
                o.style.setProperty('-webkit-text-fill-color', brandOColor);
                o.style.setProperty('color', brandOColor);
              });
            }
            // Hide every SYMBOL glyph (badge planet/aspect glyphs AND any in an open
            // interpretation card) in the clone: html2canvas mis-renders the Noto symbol
            // font's vertical baseline (the glyph floats high), so we stamp them back with
            // the 2D API below. Use !important so the span's COMPUTED visibility is actually
            // hidden (beats the .astro-glyph class — html2canvas-pro gates painting on
            // that), and neutralise any ink belt-and-braces. visibility:hidden keeps the
            // layout box, so surrounding sizing is unaffected.
            el.querySelectorAll<HTMLElement>('.astro-glyph').forEach((g) => {
              g.style.setProperty('visibility', 'hidden', 'important');
              g.style.setProperty('color', 'transparent', 'important');
              g.style.setProperty('text-shadow', 'none', 'important');
              g.style.setProperty('-webkit-text-stroke', '0', 'important');
            });
            // The popup close (✕) button is UI chrome, not part of the captured image.
            el.querySelectorAll<HTMLElement>('.maplibregl-popup-close-button').forEach(
              (b) => b.style.setProperty('display', 'none', 'important'),
            );
            // The wheel SVG is dropped from this pass (ignoreElements) and rasterised
            // separately onto the 2D canvas. But removing it from the clone collapses the
            // flex cluster, which would SHIFT the balance grid beside/below it into the
            // wheel's vacated space — while the grid's glyphs, re-stamped from the LIVE DOM,
            // stay put, so the grid's cell boxes/lines would land in the wrong spot. Pin the
            // wheel wrapper to its live size so the clone's layout (and the grid) is unchanged.
            const liveWrap = frameEl.querySelector('.wheel-svg-wrap');
            if (liveWrap) {
              const lw = liveWrap.getBoundingClientRect();
              el.querySelectorAll<HTMLElement>('.wheel-svg-wrap').forEach((w) => {
                w.style.setProperty('width', `${lw.width}px`, 'important');
                w.style.setProperty('height', `${lw.height}px`, 'important');
                w.style.setProperty('flex', '0 0 auto', 'important');
              });
            }
          },
        });
        ctx.drawImage(overlay, 0, 0, W, H);

        // Re-stamp the badge symbol glyphs (hidden in the clone above) at their real
        // on-screen positions. Read from the LIVE badges (the clone's hidden state
        // doesn't affect these rects). Pin the bundled symbol face with a QUOTED family
        // so canvas font matching picks the @font-face, not a colour-emoji fallback;
        // strip the U+FE0E text-presentation selector (unreliable in canvas); and centre
        // the measured INK, since the em-box centre sits a touch high for this font.
        const frameRect = frameEl.getBoundingClientRect();

        // 2.5) The chart WHEEL (Details ▸ Wheel) — kept out of html2canvas above. Rasterise it
        //      by cloning the live SVG, inlining every computed style (so the CSS-class + var
        //      colours resolve to concrete values the serialised SVG can render), stripping the
        //      glyph <text> (re-stamped with the others below, so the clone needs no symbol
        //      font), then drawImage at the wheel's frame-relative rect. Best-effort: a failure
        //      just leaves the wheel's shapes out, but the glyphs + grid still stamp.
        const liveWheel = frameEl.querySelector('svg.wheel-svg');
        if (liveWheel) {
          try {
            const wr = liveWheel.getBoundingClientRect();
            if (wr.width > 0 && wr.height > 0) {
              const clone = liveWheel.cloneNode(true) as SVGSVGElement;
              const liveEls = [liveWheel, ...liveWheel.querySelectorAll('*')];
              const cloneEls = [clone, ...clone.querySelectorAll('*')];
              const WHEEL_STYLE_PROPS = [
                'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity',
                'stroke-dasharray', 'stroke-linejoin', 'stroke-linecap', 'opacity', 'color',
                'font-size', 'font-weight', 'font-style', 'font-family', 'letter-spacing',
                'text-anchor', 'dominant-baseline', 'paint-order', 'visibility',
              ];
              const n = Math.min(liveEls.length, cloneEls.length);
              for (let i = 0; i < n; i++) {
                const cs = getComputedStyle(liveEls[i] as Element);
                const st = (cloneEls[i] as SVGElement).style;
                for (const pr of WHEEL_STYLE_PROPS) st.setProperty(pr, cs.getPropertyValue(pr));
              }
              // Glyphs (planet + sign) are re-stamped from the LIVE DOM below — drop them from
              // the clone so they don't double-draw (and the clone needs no embedded font).
              clone.querySelectorAll('.astro-glyph').forEach((g) => g.remove());
              clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
              clone.setAttribute('width', String(wr.width));
              clone.setAttribute('height', String(wr.height));
              const svgStr = new XMLSerializer().serializeToString(clone);
              const wheelImg = new Image();
              await new Promise<void>((resolve) => {
                wheelImg.onload = () => resolve();
                wheelImg.onerror = () => resolve();
                wheelImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
              });
              if (wheelImg.width > 0) {
                ctx.drawImage(
                  wheelImg,
                  (wr.left - frameRect.left) * scale,
                  (wr.top - frameRect.top) * scale,
                  wr.width * scale,
                  wr.height * scale,
                );
              }
            }
          } catch (e) {
            console.warn('[capture] wheel rasterise failed', e);
          }
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        frameEl
          .querySelectorAll<HTMLElement>('.astro-glyph')
          .forEach((g) => {
            const gr = g.getBoundingClientRect();
            if (gr.width <= 0 || gr.height <= 0) return;
            const char = (g.textContent ?? '').replace(/\uFE0E/g, '');
            if (!char) return;
            // The Extras panel clips overflow (overflow:hidden), so the live DOM hides glyphs
            // that spill past it (many bodies on a small frame). ctx.fillText ignores CSS
            // clipping, so skip any panel glyph whose centre is outside the panel \u2014 otherwise
            // it would land on the map, unlike what's shown on screen.
            const clip = g.closest('.capture-extras');
            if (clip) {
              const cr = clip.getBoundingClientRect();
              const mx = gr.left + gr.width / 2;
              const my = gr.top + gr.height / 2;
              if (mx < cr.left || mx > cr.right || my < cr.top || my > cr.bottom) return;
            }
            const cs = getComputedStyle(g);
            const px = parseFloat(cs.fontSize) || 11;
            ctx.font = `${px * scale}px "Noto Sans Symbols", sans-serif`;
            // The wheel's glyphs are SVG <text> (colour in `fill`); the list/badge glyphs are
            // HTML spans (colour in `color`). Source whichever this element uses.
            ctx.fillStyle =
              g.namespaceURI === 'http://www.w3.org/2000/svg' ? cs.fill : cs.color;
            const cx = (gr.left + gr.width / 2 - frameRect.left) * scale;
            const cyBox = (gr.top + gr.height / 2 - frameRect.top) * scale;
            // 'alphabetic' baseline: ink spans [cy − ascent, cy + descent]; shift the pen
            // so the ink midpoint lands on the box centre. Fall back to the box centre if
            // metrics are unavailable.
            const m = ctx.measureText(char);
            const asc = m.actualBoundingBoxAscent;
            const desc = m.actualBoundingBoxDescent;
            const cy =
              Number.isFinite(asc) && Number.isFinite(desc)
                ? cyBox + (asc - desc) / 2
                : cyBox;
            ctx.fillText(char, cx, cy);
          });

        // Re-stamp the location pin (kept out of html2canvas above): draw its teardrop at
        // the LIVE marker's screen rect, in the current state colours (gold custom / green
        // natal) read off the live SVG. The animated glow ring is transient decoration, so
        // the still export omits it. Pure 2D ops — can't taint or abort the overlay.
        // The transparent (local-space) export omits the pin entirely: the rose's lines
        // already converge on the origin, and the overlay is meant to sit on someone
        // else's backdrop — a teardrop marker there is clutter, not information.
        const pinBody = lsTransparentRef.current
          ? null
          : frameEl.querySelector('.map-pin-body');
        const pinShape = pinBody?.querySelector('.map-pin-shape');
        if (pinBody && pinShape) {
          const br = pinBody.getBoundingClientRect();
          if (br.width > 0 && br.height > 0) {
            const cs = getComputedStyle(pinShape);
            const dot = pinBody.querySelector('.map-pin-dot');
            const s = (br.width / 24) * scale; // the pin SVG viewBox is 0 0 24 24
            ctx.save();
            ctx.translate(
              (br.left - frameRect.left) * scale,
              (br.top - frameRect.top) * scale,
            );
            ctx.scale(s, s);
            const teardrop = new Path2D('M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z');
            ctx.fillStyle = cs.fill;
            ctx.fill(teardrop);
            ctx.lineJoin = 'round';
            ctx.lineWidth = parseFloat(cs.strokeWidth) || 1.75;
            ctx.strokeStyle = cs.stroke;
            ctx.stroke(teardrop);
            const hole = new Path2D();
            hole.arc(12, 10, 3, 0, Math.PI * 2);
            ctx.fillStyle = dot ? getComputedStyle(dot).fill : cs.stroke;
            ctx.fill(hole);
            ctx.restore();
          }
        }
      } catch (err) {
        // Overlay compositing is best-effort — a failure still yields the map image.
        console.warn('[capture] overlay capture failed; exporting map only', err);
      }

      const blob = await new Promise<Blob | null>((resolve) =>
        out.toBlob((b) => resolve(b), 'image/png'),
      );
      // Stamp generic AstroLina attribution into the PNG metadata so provenance travels with
      // a re-shared image (never the chart's birth data). Best-effort — addPngMetadata returns
      // the original blob if anything goes wrong, so it can't break the export. The tagged blob
      // flows to download AND the mobile share sheet; the clipboard carries it too where the OS
      // doesn't strip metadata on paste.
      return blob ? addPngMetadata(blob, CAPTURE_PNG_META, CAPTURE_PNG_XMP) : null;
    },
  }), []);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  // The greatest-eclipse / sub-lunar maximum marker (a styled DOM marker, distinct
  // from the GL zenith coins). `eclipseMarkerKey` tracks the rendered point so the
  // effect knows when to replay the finite ping.
  const eclipseMarkerRef = useRef<maplibregl.Marker | null>(null);
  const skyStampRef = useRef<maplibregl.Marker | null>(null);
  const eclipseMarkerKeyRef = useRef<string | null>(null);
  const onRightClickRef = useRef(onRightClick);
  const dataRef = useRef<MapData>({ lines, angleLines, parans, orbBands, starLines, nightShade, localSpace, localSpaceCross, localSpaceOrigin, zenith, nadir, ecliptic, overlay });
  // Slide active flag, read inside the data effect / badge anchoring while the tool
  // is on. The move handlers instead gate on slideDraggingRef (below): they suppress
  // edge-badge work only during an actual spin-drag (whose per-frame setCenter would
  // thrash them), but still re-anchor after a programmatic fly — e.g. a badge click.
  const slideActiveRef = useRef(!!slideActive);
  const slideDraggingRef = useRef(false);
  // True while the heavy secondary layers are dropped for a smooth spin (restored,
  // accurate, when motion settles). Read by the slide effect AND the data effect (so a
  // mid-spin bucket recompute re-tiles only the cage, not the hidden secondary).
  const secondaryHiddenRef = useRef(false);
  // Current spin angle (deg), mirrored out of the slide drag effect so a mid-spin
  // re-push of the cage geometry can re-assert the rotation rather than snap to anchor,
  // and so badge clicks / flies can shift their geographic target by the same θ.
  const spinDegRef = useRef(0);
  // One pending style-busy defer at a time (the data effect's `idle` fallback):
  // the callback reads the latest refs, so queueing more would only repeat it.
  const idleDeferRef = useRef(false);
  // Programmatic slide drive, populated by the slide effect while the tool is
  // active (null otherwise — MapHandle.slideTo/slideBy no-op then). Targets are
  // elapsed rotation TIME in days, the same unit onSlide reports.
  const slideApiRef = useRef<{ to(dtDays: number): void; by(deltaDays: number): void } | null>(
    null,
  );
  const themeRef = useRef(theme);
  // Current projection mode, read inside the once-bound load/style.load handlers
  // (setStyle resets projection, so it must be re-applied after each style load).
  const projectionRef = useRef(projection);
  // Read inside the (once-bound) load/style.load handlers so they always paint
  // the measure layers with the latest map-state accent.
  const measureColorRef = useRef(measureColor);
  // Current detail toggles, read inside the (once-bound) load/style.load handlers.
  const detailRef = useRef({ showRoads, showRivers, showLabels, hideBasemap });
  // Current local-space arrow visibility, read inside the same handlers (a style
  // reload rebuilds every custom layer visible, so it must be reasserted there).
  const hideLsArrowsRef = useRef(hideLsArrows);
  // Current LS label mode, read inside computeBadges (bound once, refs only).
  const lsEdgeLabelsRef = useRef(lsEdgeLabels);
  // Transparent-mode flag + the latest projected origin — read inside computeBadges (per-frame
  // circle clip + rim badges) and captureFrame (clip the exported canvas), both bound once via refs.
  const lsTransparentRef = useRef(lsTransparent);
  const originScreenRef = useRef<{ x: number; y: number } | null>(null);
  // The eclipse local-circumstances closures, read inside the long-lived hover
  // and click handlers (they change with each selected eclipse; refs avoid
  // re-binding).
  const eclipseTipRef = useRef(eclipseTip);
  const eclipseCardRef = useRef(eclipseCard);
  const lineCardRef = useRef(lineCard);
  const distanceRefRef = useRef(distanceRef);
  // Read inside the (once-bound) click / context / long-press handlers so they can suppress
  // their own side-effects while a line spotlight owns the gesture. `active` gates the pin
  // gestures (dbl-click drop, right-click remove) the whole time the spotlight is up; `aiming` gates
  // the SINGLE-click card/zenith side-effects only while placing (no centre yet), so once placed a
  // line click still pops its card.
  const spotlightActiveRef = useRef(false);
  const spotlightAimingRef = useRef(false);
  // Every clickable line collection, refreshed each commit (below). The click handler scans
  // these to find the clicked line's full geometry and measure its closest approach.
  const lineGeomRef = useRef<ClickableLineFC[]>([]);
  // The pinned local-circumstances card (one per map). Held in a ref so the
  // close-on-selection-change effect below can reach the instance the
  // long-lived click handler owns.
  const eclipseCardPopupRef = useRef<maplibregl.Popup | null>(null);
  // Same arrangement for the pinned line-interpretation card.
  const lineCardPopupRef = useRef<maplibregl.Popup | null>(null);
  // The map's load/style.load/click handlers are bound once and never rebound;
  // refresh these refs after each commit (not during render) so those async
  // handlers always read the latest props.
  useEffect(() => {
    onRightClickRef.current = onRightClick;
    dataRef.current = { lines, angleLines, parans, orbBands, starLines, nightShade, localSpace, localSpaceCross, localSpaceOrigin, zenith, nadir, ecliptic, overlay, eclipse };
    slideActiveRef.current = !!slideActive;
    spotlightActiveRef.current = !!spotlightActive;
    spotlightAimingRef.current = !!spotlightAiming;
    measureColorRef.current = measureColor;
    detailRef.current = { showRoads, showRivers, showLabels, hideBasemap };
    hideLsArrowsRef.current = hideLsArrows;
    lsEdgeLabelsRef.current = lsEdgeLabels;
    lsTransparentRef.current = lsTransparent;
    eclipseTipRef.current = eclipseTip;
    eclipseCardRef.current = eclipseCard;
    lineCardRef.current = lineCard;
    distanceRefRef.current = distanceRef;
    // Natal + overlay line collections whose features can open an interpretation card. Only
    // their geometry matters here; nullable/absent ones are dropped.
    const lineFcs: (ClickableLineFC | null | undefined)[] = [
      lines, angleLines, parans, localSpace, starLines, ecliptic,
      overlay?.lines, overlay?.parans, overlay?.localSpace, overlay?.ecliptic,
    ];
    lineGeomRef.current = lineFcs.filter((fc): fc is ClickableLineFC => !!fc);
  });

  // Edge badges: glyph + angle code per ACG line, anchored where the line exits
  // the viewport. Recomputed (rAF-throttled) on every map move + when data changes.
  const [badges, setBadges] = useState<LineBadge[]>([]);
  const [paranBadges, setParanBadges] = useState<ParanBadge[]>([]);
  const [localSpaceBadges, setLocalSpaceBadges] = useState<LocalSpaceBadge[]>([]);
  // True while the map camera is animating (pan / zoom / flyTo). The edge labels fade
  // out while moving — anchored to the screen edges, they read as detached from their
  // lines in motion — and fade back in, repositioned, once it settles.
  const [mapMoving, setMapMoving] = useState(false);
  // Flips true once the map style has loaded — re-renders so MapOverlayHost (which reads
  // the internal map ref, set in an effect that doesn't itself re-render) gets a live instance.
  const [mapReady, setMapReady] = useState(false);
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
    // While sliding, the linework is RENDERED translated by −θ to stay screen-pinned,
    // so shift the geographic target by the same −θ to land on the point as drawn
    // (badge clicks pass natal-frame coordinates).
    const lngAdj = slideActiveRef.current ? lng - spinDegRef.current : lng;
    flyWithSidebarOffset(map, lngAdj, lat, Math.max(map.getZoom(), 4), leftInsetRef.current);
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

  // Clicking an ACG line's label flies to that body's zenith (its sub-planetary
  // point); clicking the SAME zenith again returns to wherever you were when you
  // first flew there (a toggle, like the paran badges). Keyed by the zenith's
  // identity (overlay prefix + planet) and shared between the label badge and the
  // on-map stamp, so you can fly out by clicking the label and fly back by
  // re-clicking the label OR clicking the stamp now centred under you.
  const zenithReturnRef = useRef<(SavedView & { id: string }) | null>(null);
  const flyToZenith = useCallback(
    (id: string, lng: number, lat: number) => {
      const map = mapRef.current;
      if (!map) return;
      const saved = zenithReturnRef.current;
      if (saved && saved.id === id) {
        // Second click on the same zenith — fly back to the saved view.
        zenithReturnRef.current = null;
        map.flyTo({
          center: saved.center,
          zoom: saved.zoom,
          bearing: saved.bearing,
          pitch: saved.pitch,
          essential: true,
        });
        return;
      }
      zenithReturnRef.current = { id, ...snapshotView(map) };
      flyToPoint(lng, lat);
    },
    [flyToPoint],
  );

  // `reuseHudRects` is passed by the per-frame rAF path (scheduleBadges): the HUD
  // panels can't move during a pan/zoom — anything that CAN move them (a HUD drag,
  // a map resize) clears hudRectsRef first — so mid-move frames reuse the cached
  // rects instead of paying 9 querySelectorAll + getBoundingClientRect layouts per
  // frame. Every other caller (moveend, data pushes, theme reloads) reads fresh.
  const hudRectsRef = useRef<AvoidRect[] | null>(null);
  const computeBadges = useCallback((reuseHudRects = false) => {
    const map = mapRef.current;
    if (!map) return;
    const z = map.getZoom();
    // Rounded so an easing's trailing sub-0.01 zoom deltas can't defeat React's
    // same-value bailout; nothing reading `zoom` cares about finer granularity.
    setZoom(Math.round(z * 100) / 100);
    const data = dataRef.current;
    // While the Slide tool spins, the pinned natal sources are RENDERED translated by
    // −θ (to stay screen-fixed) but `data` here holds the un-translated props — so shift
    // the pinned feature sets (and the LS origin) by the same −θ to anchor badges onto
    // the rendered lines. Overlay/paran badges aren't shifted: overlay rides with the
    // basemap, and paran badges sit at the (live) centre longitude.
    const slideShift = slideActiveRef.current ? spinDegRef.current : 0;
    const pinShift = <F extends Feature>(feats: F[]): F[] =>
      slideShift
        ? (translateLng({ type: 'FeatureCollection', features: feats }, -slideShift)
            .features as F[])
        : feats;
    const cont = map.getContainer();
    // Edge badges are skipped while the camera is in motion: they fade out
    // within ~0.12s of movestart (.is-moving — in motion they'd float detached
    // from their lines) and the moveend pass re-anchors them before the fade-in,
    // so recomputing them per move frame is pure waste. It is also the heaviest
    // badge set by far — with the aspect/midpoint overlays on it anchors and
    // dodges hundreds of badges (they render at ALL zooms; an earlier zoom gate
    // was a render-cost mitigation this skip makes unnecessary). The paran and
    // local-space sections below still run per frame: the compass and paran
    // rows track the camera live and are far cheaper.
    if (!map.isMoving()) {
      // Tighter edge gap while framing (the exported still wants the labels hugging the edge).
      const inset = frameActiveRef.current ? CAPTURE_BADGE_INSET : BADGE_INSET;
      const natal = computeLineBadges(map, pinShift(data.lines.features), inset, false);
      const ov = data.overlay?.lines
        ? computeLineBadges(map, data.overlay.lines.features, inset, true)
        : [];
      // Aspect/midpoint lines ride the natal badge path (they're natal-derived);
      // their aspect/planetB props give them distinct group keys and badge faces.
      const ang = computeLineBadges(map, pinShift(data.angleLines.features), inset, false, 'ang');
      // While the Capture frame is armed, badges hug the frame edges and ignore the HUD
      // panels (Capture window etc.) — EXCEPT the on-map attribution disclosure, which is
      // in the exported image, so they still dodge that one.
      const hudRects = frameActiveRef.current
        ? readHudRects(map, CAPTURE_AVOID_SELECTORS)
        : reuseHudRects && hudRectsRef.current
          ? hudRectsRef.current
          : (hudRectsRef.current = readHudRects(map));
      let placed = dodgeBadges(
        natal.concat(ov, ang),
        hudRects,
        cont.clientWidth,
        cont.clientHeight,
        inset,
      );
      // While the Capture frame is armed, the export is a STILL — overlapping labels can't be
      // disambiguated by panning, so spread them apart for legibility. Measure each badge's
      // real box from the live DOM (keyed by data-bkey) so wide aspect/node labels separate
      // correctly; sizes are intrinsic, so this stays a fixed point (no measure→resize loop).
      if (frameActiveRef.current) {
        // `globalThis.Map`: in this file the bare name `Map` is the component itself.
        const sizes = new globalThis.Map<string, BadgeSize>();
        frameRef.current
          ?.querySelector('.acg-edge-badges')
          ?.querySelectorAll<HTMLElement>('.acg-badge[data-bkey]')
          .forEach((el) => {
            sizes.set(el.dataset.bkey as string, {
              hw: el.offsetWidth / 2,
              hh: el.offsetHeight / 2,
            });
          });
        placed = spreadBadges(
          placed,
          sizes,
          hudRects,
          cont.clientWidth,
          cont.clientHeight,
          inset,
        );
      }
      setBadges((cur) => (sameBadges(cur, placed) ? cur : placed));
    }

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
          // Tag prefix (overlay or promoted); empty for the natal chart's own parans.
          prefix: p.tag ?? '',
          targetLng: p.intersectionLng,
          targetLat: p.latitude,
        });
      });
    };
    pushParans(data.parans, false);
    if (data.overlay?.parans) pushParans(data.overlay.parans, true);
    setParanBadges((cur) => (sameBadges(cur, pbadges) ? cur : pbadges));

    // Local-space badges: one "LS + glyph" per planet, on a fixed-pixel ring around
    // the origin at the outward (toward-planet) azimuth — measured from the on-screen
    // north direction so it stays correct under rotation/tilt. Hidden when the origin
    // is on the globe's far side. (The Capture-time "Standard labels" mode swaps the
    // ring anchor for the line's outermost visible point — see edgeMode below.)
    const lsbadges: LocalSpaceBadge[] = [];
    // The LS lines + origin are pinned natal linework, so shift them by −θ too while
    // sliding (the lines converge at origin−θ on screen, matching the rendered source).
    const lsFeats = pinShift(data.localSpace.features);
    const origin =
      slideShift && data.localSpaceOrigin
        ? { ...data.localSpaceOrigin, lng: data.localSpaceOrigin.lng - slideShift }
        : data.localSpaceOrigin;
    if (
      origin &&
      lsFeats.length &&
      !isOccluded(map, origin.lng, origin.lat)
    ) {
      const oc = map.project([origin.lng, origin.lat]);
      setOriginScreen((cur) =>
        cur && cur.x === oc.x && cur.y === oc.y ? cur : { x: oc.x, y: oc.y },
      );
      originScreenRef.current = { x: oc.x, y: oc.y };
      // "Circle Mask": clip the GL CANVAS (the LS lines) to a circle ~30% wider than the compass,
      // centred on the origin — but only while the compass is actually shown (zoomed in enough).
      // Clip the canvas, NOT the container: the container also holds the bottom-right attribution /
      // credits control, which must stay visible (and captured) even while the linework is masked.
      const zoomNow = map.getZoom();
      const maskActive = lsTransparentRef.current && zoomNow >= COMPASS_ZOOM;
      const maskR = maskActive ? maskRadiusAt(zoomNow) : 0;
      const glCanvas = map.getCanvas();
      if (maskActive) {
        glCanvas.style.setProperty('clip-path', `circle(${maskR}px at ${oc.x}px ${oc.y}px)`);
      } else {
        glCanvas.style.removeProperty('clip-path');
      }
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
      // The mirror of lsPinwardEntry for the "Standard labels" mode: the OUTERMOST
      // visible point of a half-line walked from the pin outward — where it exits the
      // (inset) view, or its tip when fully visible. Anchoring there makes an LS badge
      // hug the frame edge exactly like the chart lines' edge badges.
      const lsOutermostVisible = (coords: number[][]): { x: number; y: number } | null => {
        let prev: { x: number; y: number } | null = null;
        let outermost: { x: number; y: number } | null = null;
        for (let i = 0; i < coords.length; i++) {
          const c = coords[i];
          const cur = isOccluded(map, c[0], c[1]) ? null : map.project([c[0], c[1]]);
          if (prev && cur) {
            const seg = clipSegmentToView(prev, cur, w, h, BADGE_INSET);
            if (seg) outermost = seg.far; // keeps advancing to the last visible point
          }
          prev = cur;
        }
        return outermost;
      };
      // Where this half-line's ACTUAL projected arc first crosses the mask rim, walking
      // from the pin outward. A great circle curves off the straight bearing ray — the
      // farther the rim reaches geographically (low zoom), the more — so anchoring on
      // the ray parks the badge BESIDE its line. Null when no crossing is found (e.g.
      // the arc leaves via the globe's far side); the caller falls back to the ray.
      const lsRimCrossing = (coords: number[][]): { x: number; y: number } | null => {
        let prev: { x: number; y: number } | null = null;
        for (let i = 0; i < coords.length; i++) {
          const c = coords[i];
          const cur = isOccluded(map, c[0], c[1]) ? null : map.project([c[0], c[1]]);
          if (prev && cur) {
            const dPrev = Math.hypot(prev.x - oc.x, prev.y - oc.y);
            const dCur = Math.hypot(cur.x - oc.x, cur.y - oc.y);
            if (dPrev <= maskR && dCur > maskR) {
              // Interpolate the crossing on the chord — segments are short enough that
              // the radial distance is near-linear across one.
              const t = (maskR - dPrev) / (dCur - dPrev);
              return {
                x: prev.x + (cur.x - prev.x) * t,
                y: prev.y + (cur.y - prev.y) * t,
              };
            }
          }
          prev = cur;
        }
        return null;
      };
      // Capture ▸ "Standard labels": anchor every LS badge at its line's outermost
      // visible point (edge-hugging, like the ACG badges) and blank the bearing off
      // its face, so LS lines read exactly like the rest of the chart's linework.
      const edgeMode = lsEdgeLabelsRef.current;
      const seen = new Set<string>();
      for (const f of lsFeats) {
        const lp = f.properties;
        const k = `${lp.planet}-${lp.direction}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const out = lp.direction === 'out';
        // 'out' runs toward the planet; 'in' is the opposite (nadir) half. The badge
        // sits at this screen bearing from the origin.
        const angle = north + (lp.azimuth * Math.PI) / 180 + (out ? 0 : Math.PI);
        // This half's bearing — geographic azimuth, 0° at North, clockwise (matches
        // the dial and the sidebar's coordinate table): out = toward the planet,
        // in = the reciprocal. Formatted as degrees + arcminutes.
        const bearingAzN = out ? lp.azimuth : (lp.azimuth + 180) % 360;
        let azWhole = Math.floor(bearingAzN);
        let azMin = Math.round((bearingAzN - azWhole) * 60);
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
        if (maskActive) {
          // On the mask rim, ON the line: where its projected arc crosses the clip
          // circle — falling back to the straight bearing ray only if no crossing shows.
          placed = lsRimCrossing(f.geometry.coordinates) ?? {
            x: oc.x + maskR * Math.sin(angle),
            y: oc.y - maskR * Math.cos(angle),
          };
        } else if (edgeMode) {
          placed = lsOutermostVisible(f.geometry.coordinates);
        } else if (inView(ringPt)) {
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
          // Standard-labels mode blanks the bearing so the face matches the ACG badges.
          azLabel: edgeMode ? '' : azLabel,
          // The always-present bearing, for the transparent "Degrees" along-the-line label.
          bearing: azLabel,
        });
      }
      // Per-badge half-extents for separation: in a capture STILL the export can't be panned to
      // disambiguate overlapping labels, so measure each pill's REAL box from the live DOM (keyed
      // by data-lskey) — the wide 'out' pills carry a bearing and would crowd at the nominal width
      // (exactly what the ACG edge badges do in capture). Live, the nominal pill size is fine; sizes
      // are intrinsic, so measuring stays a fixed point (no measure→resize loop).
      const lsSizes = new globalThis.Map<string, { hw: number; hh: number }>();
      if (frameActiveRef.current) {
        frameRef.current
          ?.querySelectorAll<HTMLElement>('.acg-badge[data-lskey]')
          .forEach((el) => {
            // A zero box means the pill isn't laid out yet — that's "no measurement",
            // not "zero size"; recording it would let badges pile up on each other.
            if (!el.offsetWidth || !el.offsetHeight) return;
            lsSizes.set(el.dataset.lskey as string, {
              hw: el.offsetWidth / 2,
              hh: el.offsetHeight / 2,
            });
          });
      }
      // De-overlap the badges. Only when the origin is on-screen — off-screen the rays don't define
      // a sensible centre, so the edge-hugged anchors stand as-is.
      const ocOnScreen = oc.x >= 0 && oc.x <= w && oc.y >= 0 && oc.y <= h;
      if (ocOnScreen && lsbadges.length > 1) {
        // Per-badge half-extents. A pill that PRINTS its bearing keeps the deliberately
        // over-wide floor even when measured — the long faces crowd at close azimuths and
        // must land fully clear of each other in a still (which also rides out the one
        // render where a face was measured before its bearing span re-appeared). A blank-
        // faced pill instead trusts its measured box: flooring it too would space a
        // glyph-only pill (name toggle off) as if it still carried its name, pushing
        // badges off their lines with no visible crowding to justify it — the narrow
        // floor only stands in while unmeasured. + LS_BADGE_GAP so neighbours clear by
        // a hair.
        const sized = lsbadges.map((b) => {
          const s = lsSizes.get(b.key);
          const hw =
            (b.out && b.azLabel
              ? Math.max(s?.hw ?? 0, LS_BADGE_OUT_HALF_W)
              : s
                ? s.hw
                : LS_BADGE_HALF_W) + LS_BADGE_GAP;
          const hh = (s?.hh ?? LS_BADGE_HALF_H) + LS_BADGE_GAP;
          return { b, hw, hh };
        });
        if (maskActive) {
          // On the rim (fixed radius): spread ANGULARLY so pills don't overlap, staying near each
          // line's bearing. (The radial spread below would slide them off the rim.)
          const items = sized.map(({ b, hw, hh }) => {
            const ang = Math.atan2(b.x - oc.x, -(b.y - oc.y));
            return { x: b.x, y: b.y, ang, ang0: ang, hw, hh, ref: b };
          });
          spreadLsBadgesAngular(items, oc.x, oc.y, maskR, 60);
          for (const it of items) {
            it.ref.x = it.x;
            it.ref.y = it.y;
          }
        } else {
          // Slide each label along its OWN line (the ray from oc through its anchor): fix the unit
          // direction and let only the radius move, so a crowded fan staggers in/out along its lines.
          const lsItems = sized.map(({ b, hw, hh }) => {
            const vx = b.x - oc.x;
            const vy = b.y - oc.y;
            const rad0 = Math.hypot(vx, vy) || 1; // rest radius: where this line meets the ring
            const dx = vx / rad0;
            const dy = vy / rad0;
            // Farthest radius along this ray that keeps the badge box inside the inset viewport, so a
            // label can slide all the way out to its line's edge but never off-screen (no extra clamp).
            let tx = Infinity;
            let ty = Infinity;
            if (dx > 1e-6) tx = (w - BADGE_INSET - hw - oc.x) / dx;
            else if (dx < -1e-6) tx = (BADGE_INSET + hw - oc.x) / dx;
            if (dy > 1e-6) ty = (h - BADGE_INSET - hh - oc.y) / dy;
            else if (dy < -1e-6) ty = (BADGE_INSET + hh - oc.y) / dy;
            const maxRad = Math.max(rad0, Math.min(tx, ty));
            const minRad = Math.min(rad0, LS_BADGE_MIN_RAD);
            return { x: b.x, y: b.y, dx, dy, rad: rad0, rad0, minRad, maxRad, hw, hh, ref: b };
          });
          spreadLsBadgesRadial(lsItems, oc.x, oc.y, 60);
          for (const it of lsItems) {
            it.ref.x = it.x;
            it.ref.y = it.y;
          }
        }
      }
      // Along-the-line "Degrees" anchor (transparent export): park each bearing just past its
      // badge's edge on the ray toward the origin, so it reads as that line's degree and clears
      // the (variable-width) name pill. Offset from the MEASURED half-extent — a fixed offset from
      // the pill centre would land on the name whenever the line runs toward it (horizontal lines).
      for (const b of lsbadges) {
        const vx = oc.x - b.x;
        const vy = oc.y - b.y;
        const len = Math.hypot(vx, vy) || 1;
        const dx = vx / len;
        const dy = vy / len;
        const s = lsSizes.get(b.key);
        const hw = s?.hw ?? LS_BADGE_HALF_W;
        const hh = s?.hh ?? LS_BADGE_HALF_H;
        // Distance from the pill centre to its box edge along (dx,dy) — whichever side the ray hits.
        const tEdge = Math.min(
          Math.abs(dx) > 1e-6 ? hw / Math.abs(dx) : Infinity,
          Math.abs(dy) > 1e-6 ? hh / Math.abs(dy) : Infinity,
        );
        const off = tEdge + LS_LINE_DEG_GAP;
        b.degX = b.x + dx * off;
        b.degY = b.y + dy * off;
      }
    } else {
      setOriginScreen(null);
      originScreenRef.current = null;
      map.getCanvas().style.removeProperty('clip-path');
    }
    setLocalSpaceBadges((cur) => (sameBadges(cur, lsbadges) ? cur : lsbadges));
  }, []);
  const scheduleBadges = useCallback(() => {
    if (badgeRafRef.current) return;
    badgeRafRef.current = requestAnimationFrame(() => {
      badgeRafRef.current = 0;
      // The rAF path fires per move frame — reuse the cached HUD rects (see
      // computeBadges; anything that moves a panel clears the cache first).
      computeBadges(true);
    });
  }, [computeBadges]);

  // The mount-once map effect below wires move/moveend/'astro:hud-moved' to these
  // badge callbacks through refs rather than listing them in its deps. In prod they
  // already have stable identity so it makes no difference; under dev hot-reload,
  // though, Fast Refresh hands them new identities each edit, and listing them would
  // re-run that effect and needlessly tear down + rebuild the whole map. The refs
  // also let an edit to the badge logic hot-apply without that rebuild.
  const computeBadgesRef = useRef(computeBadges);
  const scheduleBadgesRef = useRef(scheduleBadges);
  useEffect(() => {
    computeBadgesRef.current = computeBadges;
    scheduleBadgesRef.current = scheduleBadges;
  }, [computeBadges, scheduleBadges]);

  // Hover/focus tip for the MapLibre-rendered zoom + compass buttons (plain DOM,
  // so the portaled HoverTip is driven imperatively from the init effect below).
  const [ctrlTip, setCtrlTip] = useState<
    { pos: TipPos; title: string; hotkey?: string } | null
  >(null);
  // Same deal for the placed pin: it's a MapLibre Marker (plain DOM, not React),
  // so its tip is driven imperatively from the marker effect below — never a
  // native `title=` (which the app has retired in favour of the shared .ui-tip).
  const [pinTip, setPinTip] = useState<{ pos: TipPos; title: string } | null>(null);
  // Single-slot marker decoration (emblem in the head + tip override) — see
  // lib/extensions/pinAdornment. Null in the open core.
  const pinAdornment = usePinAdornment();
  // One-shot celebration counter (same module): replay the pulses / pop the emblem
  // when a downstream action on the pin completes. Static in the open core.
  const pinCelebrations = usePinCelebrations();
  // Pending removal of the marker's transient .celebrate class (see the marker
  // effect). Deliberately NOT cleared in effect cleanups — unrelated re-runs must
  // not strand the class; only a newer celebration replaces the timer.
  const celebrateTimerRef = useRef(0);
  // The "AstroLina" entry in the map attribution bar opens the credits / license
  // dialog (the secondary disclosures that needn't sit on the map at all times).
  // Open state is lifted to the app (creditsOpen / setCreditsOpen props) so the same
  // dialog can be opened from elsewhere; the attribution button + dialog stay here.
  // WebGL health. The map is WebGL-only, so probe support once during the initial
  // render (a lazy initializer — runs a single time, never on re-render): start in
  // 'unsupported' when the browser won't grant a context, so the fallback notice
  // paints on the first frame rather than after a flash of blank map. 'lost' is set
  // later if a live context drops at runtime (MapLibre tries to recover on its own).
  // Anything other than 'ok' swaps the blank canvas for a readable notice below.
  const [glStatus, setGlStatus] = useState<'ok' | 'unsupported' | 'lost'>(() =>
    detectWebGL() ? 'ok' : 'unsupported',
  );

  useEffect(() => {
    if (!containerRef.current) return;

    // WebGL was probed at mount (see glStatus's initial state). If the browser
    // wouldn't grant a context — hardware acceleration off, or a privacy shield
    // blocking/spoofing WebGL — never construct MapLibre: the fallback notice is
    // already on screen, and there's nothing for the map to render into.
    if (glStatus !== 'ok') return;

    // The probe passing doesn't fully guarantee construction succeeds (a context
    // can be granted then immediately lost), so guard the constructor too and fall
    // back the same way rather than letting an uncaught throw blank the app.
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        // Offline: the live OpenFreeMap styles/tiles need the network (the glass/dark STYLES are
        // remote too), so open on the self-contained offline style instead of a blank map.
        style: navigator.onLine
          ? BASEMAP_STYLE_URLS[themeRef.current]
          : offlineStyle(themeRef.current),
        // Open framed on a continental box centred on the active chart's birthplace
        // rather than the whole globe (see firstLoadBounds / DEFAULT_BOUNDS). Read
        // once at mount; fitBoundsOptions keeps the continent off the very edges and
        // clear of the +/− controls in the top-right corner. A restored share
        // link's exact camera (initialView) wins over the continental framing.
        ...(initialView
          ? { center: [initialView.lng, initialView.lat] as [number, number], zoom: initialView.zoom }
          : { bounds: firstLoadBounds(initialCenter), fitBoundsOptions: { padding: 24 } }),
        // MapLibre's hard ceiling. OpenFreeMap vector tiles only carry data to
        // z14, so past that the map overzooms (scales z14 tiles — blurrier) but
        // still lets you zoom right in for fine placement.
        maxZoom: 22,
        attributionControl: false,
        // Keep the WebGL back-buffer readable so the Capture tool can draw the
        // map canvas into an export bitmap (getCanvas().drawImage). The cost is a
        // small, one-time GPU memory bump — negligible for this app's frame rate.
        // (maplibre-gl v5 groups WebGL context flags under canvasContextAttributes.)
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
    } catch (err) {
      console.error('[map] MapLibre could not initialise WebGL', err);
      // Terminal one-shot error path: the map can't be built, so flip to the
      // fallback and bail. The set-state-in-effect guard is about cascading
      // re-renders from render-driven syncs; this runs at most once on a hard
      // construction failure and never loops, so the concern doesn't apply.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGlStatus('unsupported');
      return;
    }

    map.addControl(
      // The compass (resets bearing + tilt) stacks under +/−. It's hidden via CSS
      // in 2D (the `.proj-2d` container class) where the map is locked north-up.
      new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }),
      'top-right',
    );
    // The +/− zoom and compass buttons are MapLibre-rendered DOM (not React), so
    // they can't take the shared HoverTip's ref. Instead we drive the same tip
    // state imperatively and bind the shared long-press kernel (bindTouchTip with
    // pointer:true) so they get identical hover + hold-to-reveal behavior, with the
    // +/− hotkey callouts. Drop the native `title`, keep `aria-label` as the
    // accessible name; every listener is torn down with the map in this cleanup.
    const ctrlRoot = map.getContainer();
    const ctrlTipDefs: { sel: string; label: string; hotkey?: string }[] = [
      { sel: '.maplibregl-ctrl-zoom-in', label: t('map.ctrl.zoomIn'), hotkey: '+' },
      { sel: '.maplibregl-ctrl-zoom-out', label: t('map.ctrl.zoomOut'), hotkey: '−' },
      { sel: '.maplibregl-ctrl-compass', label: t('map.ctrl.resetBearing') },
    ];
    const ctrlTipCleanups: (() => void)[] = [];
    for (const def of ctrlTipDefs) {
      const el = ctrlRoot.querySelector(def.sel);
      if (!(el instanceof HTMLElement)) continue;
      el.removeAttribute('title');
      el.setAttribute('aria-label', def.label);
      const show = () =>
        setCtrlTip({
          pos: tipPosFor(el.getBoundingClientRect(), 'left'),
          title: def.label,
          hotkey: def.hotkey,
        });
      const { cleanup } = bindTouchTip(el, show, () => setCtrlTip(null), {
        pointer: true,
      });
      ctrlTipCleanups.push(cleanup);
    }
    map.addControl(
      new maplibregl.AttributionControl({
        compact: false,
        // The basemap style already credits OpenStreetMap (the one credit that
        // legally has to stay on the map, and which also covers the OSM-derived
        // geocoding — Photon forward, Nominatim reverse). Everything else — GeoNames, Swiss Ephemeris, the
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
    // The `proj-2d` CLASS is pure DOM though, so pre-set it here: waiting for the
    // load handler left the compass button visible for the style-load beat on
    // every flat-mode refresh before the CSS could hide it.
    map.getContainer().classList.toggle('proj-2d', projectionRef.current === '2d');
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
        themeRef.current,
      );
      applyDetailToggles(map, detailRef.current);
      applyLabelContrast(map, themeRef.current);
      setupCustomLayers(
        map,
        LABEL_HALO_COLORS[themeRef.current],
        measureColorRef.current,
        ZENITH_DISC_COLORS[themeRef.current],
        ECLIPSE_LABEL_HALO[themeRef.current],
      );
      applyLsArrowVisibility(map, hideLsArrowsRef.current);
      pushData(map, dataRef.current, true, lsTransparentRef.current);
      // Offline → draw the bundled world outline beneath the chart lines (the offline style has no
      // basemap of its own). A no-op online. The outline lands async, so re-run the
      // detail toggles after it: a live basemap blank must catch it too.
      if (!navigator.onLine)
        void installWorldFallback(map, themeRef.current).then(() => {
          if (mapRef.current === map) applyDetailToggles(map, detailRef.current);
        });
      computeBadgesRef.current();
      // The internal map ref is live now — let MapOverlayHost subscribe to a real instance.
      setMapReady(true);
    });

    // Edge labels fade out while the camera animates and fade back in once it settles
    // (see mapMoving). Positions are still recomputed every frame so the compass wheel
    // (placed off the same projection) keeps tracking; the labels are just hidden.
    // During a spin-DRAG the camera moves every frame; the slide effect hides + settles
    // the badges itself, so skip the per-frame move work here. A programmatic fly (badge
    // click) isn't a drag, so it falls through and re-anchors normally.
    map.on('movestart', () => {
      if (slideDraggingRef.current) return;
      setMapMoving(true);
    });
    // Re-anchor the edge badges on every pan/zoom (throttled to one rAF/frame).
    map.on('move', () => {
      if (slideDraggingRef.current) return;
      scheduleBadgesRef.current();
    });
    map.on('moveend', () => {
      if (slideDraggingRef.current) return;
      computeBadgesRef.current();
      setMapMoving(false);
    });
    // The timeline bar can be dragged anywhere; it dispatches 'astro:hud-moved'
    // when it moves, so re-dodge the labels off its new rect right away rather
    // than waiting for the next pan/zoom. A stable wrapper (created once with the
    // map) lets add/removeEventListener pair on the same reference. The drag has
    // invalidated the cached HUD rects, so drop them before the recompute.
    const onHudMoved = () => {
      hudRectsRef.current = null;
      scheduleBadgesRef.current();
    };
    window.addEventListener('astro:hud-moved', onHudMoved);
    // A container resize reflows the HUD panels too (and the rects are measured
    // in container coordinates), so the cache is stale the same way.
    map.on('resize', () => {
      hudRectsRef.current = null;
      // The flat-map zoom floor is width-dependent (log2(width/512)), so recompute
      // it whenever the container resizes or the phone rotates.
      applyMinZoom(map, projectionRef.current);
      scheduleBadgesRef.current();
    });

    // A live GL context can drop after a clean start — the GPU is reset, the tab is
    // backgrounded under memory pressure, a driver hiccups. MapLibre attempts its
    // own recovery; we listen on its map-level events (not the raw canvas, so we
    // don't fight that recovery) only to swap in a notice while the context is gone
    // and clear it again the moment it comes back.
    map.on('webglcontextlost', () => setGlStatus('lost'));
    map.on('webglcontextrestored', () => setGlStatus('ok'));

    mapRef.current = map;

    // Console / automation escape hatch for performance diagnosis (e.g. counting
    // 'render' events while idle). Always on in dev; in built output it is a
    // runtime opt-in via the sessionStorage flag — deliberately, so a deployed
    // build can be probed too. Exposes nothing devtools can't already reach.
    if (import.meta.env.DEV || sessionStorage.getItem('astro:perf-probe')) {
      (window as unknown as { __astroMap?: maplibregl.Map }).__astroMap = map;
    }

    return () => {
      if (badgeRafRef.current) cancelAnimationFrame(badgeRafRef.current);
      window.removeEventListener('astro:hud-moved', onHudMoved);
      ctrlRoot.removeEventListener('click', onCreditsClick);
      ctrlTipCleanups.forEach((fn) => fn());
      setCtrlTip(null);
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // Mount-once: create the map a single time, tear it down only on unmount, so the
    // dep array stays empty. `t` (used once for the nav-control tip labels) is
    // intentionally excluded so a locale change never recreates the map; the badge
    // callbacks are reached through refs for the same reason — and so dev hot-reload,
    // where Fast Refresh reassigns their identities, can't tear down and rebuild the
    // whole map. Prod is unaffected: both callbacks already had stable identity there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (themeRef.current === theme) return;
    themeRef.current = theme;
    map.setStyle(navigator.onLine ? BASEMAP_STYLE_URLS[theme] : offlineStyle(theme));
    map.once('style.load', async () => {
      applyProjection(map, projectionRef.current); // setStyle reset it; re-apply first
      await ensureGlyphImages(map, theme === 'dark' ? '' : LABEL_HALO_COLORS[theme], ZENITH_DISC_COLORS[theme], theme);
      applyDetailToggles(map, detailRef.current);
      applyLabelContrast(map, theme);
      setupCustomLayers(map, LABEL_HALO_COLORS[theme], measureColorRef.current, ZENITH_DISC_COLORS[theme], ECLIPSE_LABEL_HALO[theme]);
      applyLsArrowVisibility(map, hideLsArrowsRef.current);
      pushData(map, dataRef.current, true, lsTransparentRef.current);
      if (!navigator.onLine)
        void installWorldFallback(map, theme).then(() => {
          if (mapRef.current === map) applyDetailToggles(map, detailRef.current);
        });
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

  // Toggling transparent mode (which now carries the circle mask) doesn't move the camera, so
  // recompute the badges right away to apply / clear the clip + re-place the rim badges (a DIRECT
  // computeBadges, like the lsEdgeLabels effect — a deferred scheduleBadges rAF can be skipped /
  // cancelled, which is why the flip looked delayed). computeBadges reads lsTransparentRef, synced
  // by the commit effect that runs before this one. The trailing scheduleBadges settles the layout
  // one frame later: the direct pass measures pill faces that still show the PREVIOUS badge state
  // (the bearing span renders from that state, which the pass itself replaces), so a second pass
  // over the re-rendered faces is needed — sizes are content-driven, so it's a fixed point, and
  // without it the layout would only correct itself on the next camera move.
  useEffect(() => {
    if (!mapRef.current) return;
    if (!lsTransparent) mapRef.current.getCanvas().style.removeProperty('clip-path');
    computeBadgesRef.current();
    scheduleBadgesRef.current();
  }, [lsTransparent]);

  // Toggling the transparent "Label Name" changes each badge pill's width, so recompute the
  // layout right away — the de-overlap re-measures the live DOM boxes (now wider/narrower) and
  // re-spaces them. "Degrees" needs no recompute: those labels derive their position from the
  // badges at render time (origin + each badge's point), so React re-renders them on its own.
  useEffect(() => {
    if (!mapRef.current) return;
    computeBadgesRef.current();
  }, [lsLabelName]);

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
    let hoveredZenith: { source: string; id: string } | null = null;
    const zenithPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 22, // clear the stamp even at its enlarged hover size
      className: 'zenith-popup',
    });
    const clearZenith = () => {
      if (hoveredZenith) {
        map.setFeatureState(hoveredZenith, { hover: false });
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
    // The pinned eclipse local-circumstances card (click-to-open, ✕ to close).
    const eclipseCardPopup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      offset: 10,
      className: 'zenith-popup eclipse-popup',
      maxWidth: 'none',
    });
    eclipseCardPopupRef.current = eclipseCardPopup;
    // The pinned line-interpretation card (click a line to open, ✕ or an
    // empty-map click to close).
    const lineCardPopup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      offset: 10,
      className: 'zenith-popup line-card-popup',
      maxWidth: 'none',
    });
    lineCardPopupRef.current = lineCardPopup;
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
      if (
        hoveredZenith &&
        (hoveredZenith.source !== zen.source || hoveredZenith.id !== zen.id)
      ) {
        map.setFeatureState(hoveredZenith, { hover: false });
      }
      hoveredZenith = { source: zen.source, id: zen.id };
      map.setFeatureState({ source: zen.source, id: zen.id }, { hover: true });
      // Match the edge-label convention: an overlay OR promoted stamp leads with its
      // tag (e.g. "Tr Moon") so its tooltip is distinguishable from the natal body. The
      // tag rides on the zenith feature, so it shows on promoted (natal-path) stamps too.
      const tag = zen.tag ?? '';
      const base = labels.planet(zen.planet) ?? zen.planet;
      const name = tag ? `${tag} ${base}` : base;
      // Nadir stamps name themselves "underfoot"; zeniths "overhead".
      const titleKey = zen.nadir ? 'map.nadirTitle' : 'map.zenithTitle';
      const subKey = zen.nadir ? 'map.nadirSub' : 'map.zenithSub';
      zenithPopup
        .setLngLat([zen.lng, zen.lat])
        .setHTML(
          `<div class="ui-tip"><span class="ui-tip-title">${t(titleKey, { planet: name })}</span>` +
            `<span class="ui-tip-sub">${t(subKey, { planet: name })}</span></div>`,
        );
      // Add once, then just reposition/retitle on subsequent moves (no DOM churn).
      if (!zenithPopup.isOpen()) zenithPopup.addTo(map);
    };

    // While the measurement tool is active, the pointer drives the ruler. While the
    // Slide tool is DRAGGING (spinning), it drives the spin. Otherwise hover still names
    // lines / parans / zeniths as usual — but during a slide the cursor is left to the
    // slide tool ('grab'/'grabbing'), since its hover targets aren't click-able then.
    const handleMove = (e: maplibregl.MapMouseEvent) => {
      if (measureActive || slideDraggingRef.current) return;
      const setCursor = (c: string) => {
        if (!slideActiveRef.current) map.getCanvas().style.cursor = c;
      };
      // A zenith stamp under the cursor wins: animate it + show the tooltip;
      // otherwise fall back to the map's CSS grab cursor.
      const zen = zenithAtPoint(map, e.point);
      if (zen) {
        clearCross();
        clearLine();
        setCursor('pointer');
        showZenith(zen);
      } else {
        const cross = crossAtPoint(map, e.point);
        if (cross) {
          clearZenith();
          clearLine();
          setCursor('pointer');
          showCross(cross);
        } else {
          // A bare line under the cursor just names itself (hover tip); it isn't a
          // click target, so the cursor stays the map's default (no pointer).
          const line = lineAtPoint(map, e.point, t, labels);
          if (line) {
            // Eclipse curves add the LOCAL circumstances at the cursor ("63%
            // obscured at 18:14 UTC"). The id is salted with a coarse cursor
            // cell so the figure refreshes while sliding along the line without
            // re-setting the popup HTML on every pixel.
            if (line.id.startsWith('eclipse') && eclipseTipRef.current) {
              const sub = eclipseTipRef.current(e.lngLat.lat, e.lngLat.lng);
              if (sub) {
                line.html = line.html.replace(
                  '</div>',
                  `<span class="ui-tip-sub">${sub}</span></div>`,
                );
                line.id += `@${Math.round(e.lngLat.lat * 2)},${Math.round(e.lngLat.lng * 2)}`;
              }
            } else if (line.layerId.startsWith('parans')) {
              // Parans: a registered annotation (lib/extensions/paranAnnotation)
              // may add a line computed for the hovered position — the id is
              // salted with a quarter-degree longitude cell (≈ 1 clock minute)
              // so the figure refreshes while sliding along the latitude line
              // without re-setting the popup HTML on every pixel.
              const sub = getParanAnnotation()?.(
                line.props as unknown as ParanProps,
                { lat: e.lngLat.lat, lng: e.lngLat.lng },
              );
              if (sub) {
                line.html = line.html.replace(
                  '</div>',
                  `<span class="ui-tip-sub">${sub}</span></div>`,
                );
                line.id += `@${Math.round(e.lngLat.lng * 4)}`;
              }
            }
            clearZenith();
            clearCross();
            showLine(line, e.lngLat);
          } else {
            clearZenith();
            clearCross();
            clearLine();
          }
          setCursor('');
        }
      }
      onHover?.(e.lngLat.lat, e.lngLat.lng);
    };
    // Mousemove can fire well above the display rate (high-polling mice), and each
    // processed event pays three queryRenderedFeatures hit-tests plus the onHover
    // chain in the App — coalesce to at most one processed event per animation
    // frame, always handling the latest cursor position.
    let moveRaf = 0;
    let pendingMove: maplibregl.MapMouseEvent | null = null;
    const queueMove = (e: maplibregl.MapMouseEvent) => {
      pendingMove = e;
      if (moveRaf) return;
      moveRaf = requestAnimationFrame(() => {
        moveRaf = 0;
        const ev = pendingMove;
        pendingMove = null;
        if (ev) handleMove(ev);
      });
    };
    const handleLeave = () => {
      // Drop any queued move so a stale frame can't resurrect the tips just
      // after the cursor left the map.
      pendingMove = null;
      clearZenith();
      clearCross();
      clearLine();
      onLeave?.();
    };
    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (measureActive || slideActive) return;
      // Any map click can surface onboarding missions (the handler itself decides
      // whether anything is due).
      onMapClick?.();
      // Neutral broadcast of the clicked coordinate for any feature that wants tap-to-act
      // (e.g. an overlay's tap-to-tag). Fired for every plain click; listeners that don't
      // care ignore it. Pin placement stays a double-tap, so this never competes with it.
      window.dispatchEvent(
        new CustomEvent<MapClickDetail>(MAP_CLICK_EVENT, {
          detail: { lat: e.lngLat.lat, lng: e.lngLat.lng },
        }),
      );
      // While the tool is AIMING (picking a centre) it owns the single click (it confirms placement
      // off the MAP_CLICK_EVENT above) — skip the map's own single-click side-effects (fly-to-zenith,
      // eclipse / line-interpretation cards). Once a centre is placed this is false, so a click on a
      // revealed line pops its interpretation card as usual; the tool only owns the click while placing.
      if (spotlightAimingRef.current) return;
      // A click on (or near) a zenith stamp flies to it — and clicking the stamp
      // again flies back (the same toggle the label badge uses, sharing one key per
      // zenith). Natal stamps key off '' ; overlay stamps key off the overlay tag, so
      // a stamp shares its toggle with its overlay label. Pin placement is a
      // double-tap now, so a plain click no longer relocates the chart.
      const zen = zenithAtPoint(map, e.point);
      if (zen) {
        // Key by the routing prefix (the tag for overlay-path stamps, '' otherwise) so
        // the stamp shares one toggle with its label — a promoted stamp shares its tag
        // but keys '' like its natal-source label.
        const prefix = zen.overlay ? (zen.tag ?? '') : '';
        // A nadir keys distinctly from its planet's zenith so the two don't share
        // (and cancel) one fly-back toggle.
        const key = zenithKey(prefix, zen.planet) + (zen.nadir ? '|nadir' : '');
        flyToZenith(key, zen.lng, zen.lat);
        return;
      }
      // Eclipses mode (the App only supplies the card builder then): any other
      // click pins the local-circumstances card — contact times for the
      // clicked point, or a one-liner where the eclipse is invisible, so
      // clicks always respond. The ✕ closes it; so does changing eclipse.
      const card = eclipseCardRef.current;
      if (card) {
        const html = card(e.lngLat.lat, e.lngLat.lng);
        eclipseCardPopup
          .setLngLat(e.lngLat)
          .setHTML(html ?? `<div class="ui-tip">${t('map.eclipseCard.notVisible')}</div>`);
        if (!eclipseCardPopup.isOpen()) eclipseCardPopup.addTo(map);
      } else if (lineCardRef.current) {
        // Outside eclipses mode, a click on a line pins its interpretation
        // card; a click on empty map dismisses it.
        const hit = lineAtPoint(map, e.point, t, labels);
        // The clicked line's CLOSEST approach to the reference point (placed pin, or natal
        // default): pick the line-collection feature whose geometry runs nearest the click,
        // then measure that line's nearest great-circle distance to the reference.
        let dist: LineCardDistance | null = null;
        const ref = distanceRefRef.current;
        if (hit && ref) {
          let clicked: LineString | null = null;
          let nearestToClick = Infinity;
          for (const fc of lineGeomRef.current) {
            for (const f of fc.features) {
              const d = nearestApproachKm(e.lngLat.lat, e.lngLat.lng, f.geometry);
              if (d < nearestToClick) {
                nearestToClick = d;
                clicked = f.geometry;
              }
            }
          }
          if (clicked) {
            const km = nearestApproachKm(ref.lat, ref.lng, clicked);
            if (Number.isFinite(km)) dist = { km, type: ref.type };
          }
        }
        const html = hit ? lineCardRef.current(hit.layerId, hit.props, dist) : null;
        if (html) {
          lineCardPopup.setLngLat(e.lngLat).setHTML(html);
          if (!lineCardPopup.isOpen()) lineCardPopup.addTo(map);
        } else {
          lineCardPopup.remove();
        }
      }
    };
    const handleDoubleClick = (e: maplibregl.MapMouseEvent) => {
      if (measureActive || slideActive) return;
      // Neutral broadcast of the double-clicked point so a tool can treat a double-click as its own
      // gesture (e.g. re-placing a point on it). Fired for every dblclick; listeners ignore it if
      // they don't care. Sent BEFORE the spotlight guard so the tool still receives it.
      window.dispatchEvent(
        new CustomEvent<MapClickDetail>(MAP_DBLCLICK_EVENT, {
          detail: { lat: e.lngLat.lat, lng: e.lngLat.lng },
        }),
      );
      // A line spotlight owns the gesture — don't drop / move the pin underneath it.
      if (spotlightActiveRef.current) return;
      // Double-tap drops / moves the pin — but not on a zenith stamp, whose single
      // clicks already fly there, so the stamp stays a fly-to target.
      if (zenithAtPoint(map, e.point)) return;
      onPlacePin?.(e.lngLat.lat, e.lngLat.lng);
    };
    // Touch long-press = the right-click action (remove pin / drop natal). MapLibre
    // doesn't reliably emit `contextmenu` on a touch hold, so we time it ourselves: a
    // stationary single-finger hold fires onRightClick; a >10px move or a 2nd finger
    // cancels it, so panning/pinching are unaffected (listeners are passive).
    const lpCanvas = map.getCanvas();
    let lpTimer: ReturnType<typeof setTimeout> | null = null;
    let lpStart: { x: number; y: number } | null = null;
    let lpFiredAt = 0;
    const clearLp = () => {
      if (lpTimer != null) clearTimeout(lpTimer);
      lpTimer = null;
      lpStart = null;
    };
    const onLpStart = (e: TouchEvent) => {
      clearLp();
      // Measure/Slide own their gestures, so a hold there isn't a pin drop. The Capture
      // frame does NOT suppress it — a long-press drops/removes the pin as usual (the touch
      // twin of right-click), so you can compose a pin into the shot; Esc exits the tool.
      if (measureActive || slideActive) return;
      // A line spotlight uses the long-press / right-click to EXIT (its own listener); don't
      // also drop / remove the pin underneath it.
      if (spotlightActiveRef.current) return;
      if (e.touches.length !== 1) return; // 2nd finger = pan/zoom, not a hold
      const t0 = e.touches[0];
      lpStart = { x: t0.clientX, y: t0.clientY };
      lpTimer = setTimeout(() => {
        lpTimer = null;
        lpStart = null;
        lpFiredAt = Date.now();
        onRightClick?.();
      }, 450);
    };
    const onLpMove = (e: TouchEvent) => {
      const t0 = e.touches[0];
      if (!lpStart || !t0) return;
      if (Math.abs(t0.clientX - lpStart.x) > 10 || Math.abs(t0.clientY - lpStart.y) > 10) clearLp();
    };
    const onLpEnd = () => clearLp();
    const handleContext = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      // Measure/Slide consume right-click for their own cancel; the Capture frame does not,
      // so right-click drops/removes the pin as usual while composing (Esc exits the tool).
      if (measureActive || slideActive) return;
      // A line spotlight consumes right-click to exit (its own window listener) — don't
      // also remove the pin / drop the natal pin underneath it.
      if (spotlightActiveRef.current) return;
      // A touch long-press already fired the action; drop the synthesized contextmenu
      // some platforms emit right after, so it doesn't double-fire (remove → drop-natal).
      if (Date.now() - lpFiredAt < 700) return;
      // Remove the pin, or — with none placed — drop the natal pin.
      onRightClick?.();
    };
    map.on('mousemove', queueMove);
    map.on('mouseout', handleLeave);
    map.on('click', handleClick);
    map.on('dblclick', handleDoubleClick);
    map.on('contextmenu', handleContext);
    lpCanvas.addEventListener('touchstart', onLpStart, { passive: true });
    lpCanvas.addEventListener('touchmove', onLpMove, { passive: true });
    lpCanvas.addEventListener('touchend', onLpEnd);
    lpCanvas.addEventListener('touchcancel', onLpEnd);
    return () => {
      if (moveRaf) cancelAnimationFrame(moveRaf);
      clearLp();
      lpCanvas.removeEventListener('touchstart', onLpStart);
      lpCanvas.removeEventListener('touchmove', onLpMove);
      lpCanvas.removeEventListener('touchend', onLpEnd);
      lpCanvas.removeEventListener('touchcancel', onLpEnd);
      map.off('mousemove', queueMove);
      map.off('mouseout', handleLeave);
      map.off('click', handleClick);
      map.off('dblclick', handleDoubleClick);
      map.off('contextmenu', handleContext);
      clearZenith();
      clearCross();
      clearLine();
      eclipseCardPopup.remove();
      eclipseCardPopupRef.current = null;
      lineCardPopup.remove();
      lineCardPopupRef.current = null;
    };
  }, [onHover, onLeave, onPlacePin, onRightClick, onMapClick, measureActive, slideActive, frameActive, flyToZenith, t, labels]);

  // The pinned card describes ONE selection at one place — close it whenever
  // the selected eclipse changes or eclipses mode exits (the builder closure's
  // identity tracks both).
  useEffect(() => {
    eclipseCardPopupRef.current?.remove();
  }, [eclipseCard]);
  // Same contract for the line card: its builder's identity tracks the active
  // chart and overlay mode, so a stale reading can't outlive either.
  useEffect(() => {
    lineCardPopupRef.current?.remove();
  }, [lineCard]);

  // A persistent "snap to lines" toggle — the touch-reachable equivalent of holding
  // Shift. Kept in a ref so flipping it doesn't tear down the measure effect (which
  // would drop an in-progress segment); the live `update` reads the ref.
  const measureSnapRef = useRef(false);
  measureSnapRef.current = measureSnap ?? false;

  // ── Capture frame ─────────────────────────────────────────────────────
  // When the Capture tool is armed, inset the map view to a centred box of the chosen
  // aspect ratio (a margin all round leaves the HUD clear), so the framed region is
  // exactly what `captureFrame` exports. The map canvas AND its projected overlays
  // (edge labels, pin, local-horizon wheel) live inside .map-frame, so insetting
  // both confines the lines and keeps the overlays in register with the smaller view.
  // `cap` is the reserved caption-band height (css px); the map/badges are inset by it
  // at the bottom so they don't sit behind the caption.
  const [frameInset, setFrameInset] = useState<
    { l: number; t: number; r: number; b: number; cap: number; bandH: number; boxW: number } | null
  >(null);
  useEffect(() => {
    if (!frameActive || !frameAspect) {
      setFrameInset(null);
      return;
    }
    const compute = () => {
      const host = frameRef.current?.parentElement;
      if (!host) return;
      const { width: W, height: H } = host.getBoundingClientRect();
      if (W <= 0 || H <= 0) return;
      // Mobile uses the cramped screen more fully than the symmetric desktop margin: a PORTRAIT
      // screen drops the side margins so the frame spans the full width; a LANDSCAPE screen pins the
      // frame toward the bottom (below) so the top nav bar can't clip it. Desktop stays centred.
      const touch = isTouchLayout();
      const screenPortrait = H > W;
      const mx = touch && screenPortrait ? 0 : 0.1; // horizontal margin fraction
      const my = 0.1; // vertical margin fraction
      // A reserved left column (a docked panel that shrank the map) is unusable space:
      // the Capture frame itself ignores that inset, so fit + centre the frame in the
      // VISIBLE area to its right — the same "use the room you actually have" move as the
      // cramped mobile screen — so the whole frame stays on-screen instead of hiding
      // under the dock. availW collapses to the full width when nothing is docked.
      const availW = Math.max(0, W - leftInset);
      const usableW = availW * (1 - 2 * mx);
      const usableH = H * (1 - 2 * my);
      let boxW: number;
      let boxH: number;
      if (usableW / usableH > frameAspect) {
        boxH = usableH;
        boxW = boxH * frameAspect;
      } else {
        boxW = usableW;
        boxH = boxW / frameAspect;
      }
      // Horizontal insets from each host edge. With a reserved left column the frame
      // skews TOWARD the dock — a 25/75 padding split of the leftover width, not a
      // 50/50 centre — since sitting nearer the dock reads more naturally than floating
      // dead-centre in the visible strip. Plain centre (50/50) when nothing is docked.
      const freeW = availW - boxW;
      const leftPadFrac = leftInset > 0 ? 0.25 : 0.5;
      const il = Math.round(leftInset + freeW * leftPadFrac);
      const ir = Math.round(W - il - boxW);
      // Landscape mobile: pin the frame flush to the bottom (no margin — like the full-bleed
      // portrait sides) so it clears the top nav and uses the most space; else centre vertically.
      const bottomAlign = touch && !screenPortrait;
      const iyb = bottomAlign ? 0 : Math.round((H - boxH) / 2);
      const iy = bottomAlign ? Math.round(H - boxH - iyb) : Math.round((H - boxH) / 2);
      // The band is a fraction of the frame WIDTH; for wide (landscape ~16:9) frames
      // that reads too tall, so halve it there. Floored so it stays legible on small frames.
      const landscape = !!frameAspect && frameAspect >= 1.3;
      const bandFrac = landscape ? CAPTURE_CAPTION_BAND_FRAC * 0.5 : CAPTURE_CAPTION_BAND_FRAC;
      // The footer band is normally reserved while framing — it's the watermark's backdrop,
      // shown even when no caption field is enabled (so the caption text is just blank).
      // noCaption (gated Transparent mode) drops it entirely so the map fills to the edge.
      // The band height whether or not it's drawn. `cap` reserves it in the map inset only when a
      // band is shown; `bandH` is published regardless so the Transparent brand mark can size +
      // place itself exactly like the (band-bound) watermark even though no band is reserved there.
      const bandH = Math.max(Math.round(boxW * bandFrac), 22);
      const cap = noCaption ? 0 : bandH;
      // boxW is kept so the wheel view can size its wheel to a fraction of the frame width.
      setFrameInset({ l: il, t: iy, r: ir, b: iyb, cap, bandH, boxW: Math.round(boxW) });
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [frameActive, frameAspect, leftInset, noCaption]);

  // The Capture "Extras" panel (planet/angle positions) docks LEFT for landscape frames
  // and TOP otherwise; it measures its own content and reports the cross-axis px here, and
  // the framed map + edge badges inset by that much (via the --capture-extra-* vars below)
  // so the lines stay clear of it — exactly like the caption band. Scalar state, separate
  // from the frame box; reset to 0 whenever the panel isn't shown so the map re-fills.
  const captureLandscape = !!frameAspect && frameAspect >= 1.3;
  const showExtras = frameActive && !!frameExtras;
  const extraSide: 'left' | 'top' = captureLandscape ? 'left' : 'top';
  // Wheel-view diameter, derived from the fixed frame box (not the panel inset, so it can't
  // feed back into the measure→resize loop). Floored at 280px so the per-planet
  // degree·sign·minute readout ring has room to render (below ~280px it self-hides) and
  // capped so it can't dominate huge frames.
  //  • Square/portrait dock the panel as a roomy TOP band (not a narrow left rail), where
  //    the wheel reads cramped at the landscape size — so enlarge it ~40% there.
  //  • Landscape (16:9) docks a narrow LEFT rail. There the wheel scales down only HALF as
  //    fast as the frame narrows: 0.14·boxW + 230 rather than 0.28·boxW. The two meet at the
  //    460px cap (boxW ≈ 1643), so wide frames are unchanged, but on smaller laptop frames the
  //    wheel stays far larger — keeping the inner degree numbers legible instead of collapsing
  //    toward the 280px floor where the readout ring self-hides.
  const wheelSize = frameInset
    ? extraSide === 'top'
      ? Math.round(Math.min(460, Math.max(280, frameInset.boxW * 0.28)) * 1.4)
      : Math.round(Math.min(460, Math.max(280, frameInset.boxW * 0.14 + 230)))
    : extraSide === 'top'
      ? 420
      : 300;
  const [extraSize, setExtraSize] = useState(0);
  const onExtraMeasure = useCallback((px: number) => {
    // Round + equality-guard so a steady ResizeObserver tick can't loop with resize().
    const v = Math.round(px);
    setExtraSize((prev) => (prev === v ? prev : v));
  }, []);
  useEffect(() => {
    if (!showExtras) setExtraSize(0);
  }, [showExtras]);

  // Match the GL viewport to the inset container once it's laid out (layout effect so
  // there's no flash of the old size), and again when the frame, extras inset, or a
  // reserved bottom/left band changes. Both insets arrive as inline styles on the same
  // commit, so the container already has its final size when this measures it.
  useLayoutEffect(() => {
    mapRef.current?.resize();
  }, [frameInset, extraSize, bottomInset, leftInset]);

  // Esc exits whichever map tool is armed — the keyboard counterpart to the right-click
  // cancel that Measure/Slide already have, and Capture's primary exit. It calls each
  // tool's OWN cancel so Esc and right-click stay identical (Measure clears + records the
  // cancel, Slide resets the spin, Capture drops the frame). The window listener is live
  // only while a tool is armed; a future tool gets Esc-to-exit by adding its
  // (active flag, cancel) pair here, alongside where its right-click cancel is wired.
  useEffect(() => {
    if (!measureActive && !slideActive && !frameActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (measureActive) onMeasureCancel?.();
      else if (slideActive) onSlideCancel?.();
      else if (frameActive) onFrameCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [measureActive, slideActive, frameActive, onMeasureCancel, onSlideCancel, onFrameCancel]);

  // Bottom-right attribution while framing a capture. Normally maplibre shows
  // "AstroLina | <data credit>" (the AstroLina button opens the credits dialog + carries our
  // copyright). While composing an export we OWN this line — re-applied on every maplibre
  // rebuild via an observer, so no orphaned separator can linger:
  //   • basemap SHOWN (ordinary capture) — the export already brands itself via the caption
  //     watermark, so drop the AstroLina credit + its separator; ONLY the data credit remains.
  //   • basemap HIDDEN (Transparent mode) — the half-opacity brand mark (bottom-right, inside the
  //     frame) carries the attribution, and CSS hides this whole control (.map-frame.transparent),
  //     so it's not seen here; the BTN we still set below is just a failsafe if that CSS is absent.
  // Restores the normal "AstroLina | <data>" on exit. The data-credit markup is captured LIVE
  // from maplibre (never hard-coded), so a style / attribution change carries through untouched.
  const attribDataRef = useRef('');
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !frameActive) return;
    const inner = map
      .getContainer()
      .querySelector<HTMLElement>('.maplibregl-ctrl-attrib-inner');
    if (!inner) return;
    const BTN =
      '<button type="button" class="acg-credits-btn" aria-haspopup="dialog">AstroLina</button>';
    // Capture the data credit (everything but the AstroLina button + its joining separator) from
    // a CLONE, so it works whatever state the live markup is currently in.
    const clone = inner.cloneNode(true) as HTMLElement;
    const cbtn = clone.querySelector('.acg-credits-btn');
    if (cbtn) {
      const sep = cbtn.nextSibling;
      cbtn.remove();
      if (sep && sep.nodeType === 3) {
        sep.textContent = (sep.textContent ?? '').replace(/^\s*\|\s*/, '');
      }
    }
    const captured = clone.innerHTML.trim();
    if (captured) attribDataRef.current = captured;
    const dataCredit = attribDataRef.current;
    const want = hideBasemap ? BTN : dataCredit || BTN;
    // Guard on the browser-SERIALIZED result we last wrote (not `want`, which may differ by
    // attribute order / whitespace) so our own mutation is a no-op but a maplibre rebuild re-applies.
    let appliedHtml = '';
    const apply = () => {
      if (inner.innerHTML === appliedHtml) return;
      inner.innerHTML = want;
      appliedHtml = inner.innerHTML;
    };
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(inner, { childList: true, subtree: true, characterData: true });
    return () => {
      obs.disconnect();
      inner.innerHTML = `${BTN}${dataCredit ? ' | ' + dataCredit : ''}`;
    };
  }, [frameActive, hideBasemap]);

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
    const pointFor = (
      point: ScreenPt,
      lngLat: { lng: number; lat: number },
    ): { lng: number; lat: number } => snapToNearestLine(map, point) ?? lngLat;

    let origin: { lng: number; lat: number } | null = null;
    // Whether the current drag has drawn a non-zero segment yet — gates the "draw a line" mission
    // credit below, so a click/tap alone (origin only, 0 km) can never complete it.
    let drewLine = false;
    // Last cursor position during a drag, kept so a Shift press/release can re-run the
    // snap at the current spot WITHOUT a mouse move — otherwise the snap only updates
    // on the next mousemove, so Shift seems to do nothing until you wiggle the cursor.
    let lastPoint: ScreenPt | null = null;
    let lastLngLat: { lng: number; lat: number } | null = null;

    // Recompute the moving endpoint for a cursor position + Shift state. With Shift,
    // lock onto the hovered line (the point on it nearest the origin — the shortest hop
    // from the first point, the distance-to-this-line you usually want in ACG);
    // otherwise track the cursor, auto-snapping to a line it's right over.
    const update = (
      point: ScreenPt,
      lngLat: { lng: number; lat: number },
      shiftKey: boolean,
    ) => {
      if (!origin) return;
      let cur: { lng: number; lat: number };
      if (shiftKey || measureSnapRef.current) {
        const snapped = constrainToHoveredLine(map, point, origin);
        if (snapped) {
          cur = snapped;
          onMissionEvent?.('measure-snap'); // Shift actually locked onto a line
        } else {
          cur = pointFor(point, lngLat);
        }
      } else {
        cur = pointFor(point, lngLat);
      }
      const info = measureBetween(origin, cur);
      setSegment(origin, cur);
      onMeasure?.(info);
      // "Draw a line" mission: only credit a REAL drag — tick it off the first time the segment has
      // non-zero length, so a bare click/tap (0 km) can't beat it.
      if (!drewLine && info.km > 0) {
        drewLine = true;
        onMissionEvent?.('measure-point');
      }
    };

    const onDown = (e: maplibregl.MapMouseEvent) => {
      // Left button only — right-click is reserved for cancelling the tool.
      if (e.originalEvent.button !== 0) return;
      // Leave Shift+drag to MapLibre's box-zoom rather than starting a measurement.
      if (e.originalEvent.shiftKey) return;
      lastPoint = e.point;
      lastLngLat = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      origin = pointFor(e.point, lastLngLat);
      drewLine = false;
      setSegment(origin, origin);
      onMeasure?.(measureBetween(origin, origin));
    };
    const onMove = (e: maplibregl.MapMouseEvent) => {
      lastPoint = e.point;
      lastLngLat = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      update(e.point, lastLngLat, e.originalEvent.shiftKey);
    };
    // Pressing/releasing Shift mid-drag re-runs the snap at the last cursor spot, so it
    // engages (or releases) instantly without a mouse move. Skips keydown auto-repeat.
    const onShiftKey = (e: KeyboardEvent) => {
      if (e.key !== 'Shift' || e.repeat || !origin || !lastPoint || !lastLngLat) {
        return;
      }
      update(lastPoint, lastLngLat, e.type === 'keydown');
    };
    const onUp = () => {
      origin = null;
    };
    // Touch: single-finger tap-drag measures (no button/shift modifiers on touch).
    const onTouchStart = (e: maplibregl.MapTouchEvent) => {
      if (e.points.length !== 1) return;
      lastPoint = e.point;
      lastLngLat = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      origin = pointFor(e.point, lastLngLat);
      drewLine = false;
      setSegment(origin, origin);
      onMeasure?.(measureBetween(origin, origin));
    };
    const onTouchMove = (e: maplibregl.MapTouchEvent) => {
      if (e.points.length !== 1) return;
      lastPoint = e.point;
      lastLngLat = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      update(e.point, lastLngLat, false);
    };
    // Right-click anywhere on the map exits the measure tool (no context menu).
    const onContextMenu = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      origin = null;
      onMeasureCancel?.();
    };
    // Catch a release outside the canvas so it freezes the segment like an on-map up.
    const onWindowUp = () => onUp();

    map.dragPan.disable();
    map.getCanvas().style.cursor = 'crosshair';
    map.on('mousedown', onDown);
    map.on('mousemove', onMove);
    map.on('mouseup', onUp);
    map.on('contextmenu', onContextMenu);
    map.on('touchstart', onTouchStart);
    map.on('touchmove', onTouchMove);
    map.on('touchend', onUp);
    map.on('touchcancel', onUp);
    window.addEventListener('mouseup', onWindowUp);
    window.addEventListener('touchend', onWindowUp);
    // Shift is a keyboard event (not a map mouse event), so listen on the window to
    // catch it even when the cursor is idle over the map.
    window.addEventListener('keydown', onShiftKey);
    window.addEventListener('keyup', onShiftKey);

    return () => {
      map.off('mousedown', onDown);
      map.off('mousemove', onMove);
      map.off('mouseup', onUp);
      map.off('contextmenu', onContextMenu);
      map.off('touchstart', onTouchStart);
      map.off('touchmove', onTouchMove);
      map.off('touchend', onUp);
      map.off('touchcancel', onUp);
      window.removeEventListener('keydown', onShiftKey);
      window.removeEventListener('keyup', onShiftKey);
      window.removeEventListener('mouseup', onWindowUp);
      window.removeEventListener('touchend', onWindowUp);
      map.dragPan.enable();
      map.getCanvas().style.cursor = '';
      const src = map.getSource('measure') as
        | maplibregl.GeoJSONSource
        | undefined;
      src?.setData(EMPTY_FC());
      onMeasure?.(null);
    };
  }, [measureActive, onMeasure, onMeasureCancel, onMissionEvent]);

  // Slide tool: rotate EVERY line/band/point layer about the pole by −deg so they all
  // stay screen-pinned together while the camera (−deg) spins the basemap beneath them.
  // App keeps the whole line pipeline resampled at natal+Δt (via linePositions), so the
  // layers here are already mutually aligned — we just rotate them as one. Empty layers
  // translate to empty — cheap. Reads refs only, so it's stable.
  // `mode` for the heavy SECONDARY layers (everything but the cage + parans): 'translate'
  // keeps them pinned (full, accurate); 'empty' hides them; 'skip' leaves them as-is.
  // While a spin-drag is in motion we drop them to 'empty'/'skip' so only the light
  // cage + paran parallels re-tile per frame — each setData round-trips through the
  // geojson worker, and the orb-band / night-shade POLYGONS are the slowest to tile,
  // so they'd otherwise lag the camera. They (and the badges) snap back accurately
  // ~140 ms after motion settles.
  const spinPaint = useCallback(
    (deg: number, mode: 'translate' | 'empty' | 'skip' = 'translate') => {
      const map = mapRef.current;
      if (!map) return;
      const d = dataRef.current;
      const empty = EMPTY_FC();
      const set = (id: string, fc: FeatureCollection | null | undefined) => {
        const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
        src?.setData(translateLng((fc ?? empty) as FeatureCollection, -deg));
      };
      set('acg-lines', d.lines); // the cage always tracks the spin
      // Parans stay live through the spin too: they're cheap straight parallels,
      // and watching the ground turn against them is much of what the spin is FOR
      // (the daily rotation is those pairings' time dimension) — so they must not
      // vanish with the heavy layers mid-drag.
      set('parans', d.parans);
      if (mode === 'skip') return;
      // 'empty' → undefined, which `set` resolves to the empty collection (hides it).
      const sec = (id: string, fc: FeatureCollection | null | undefined) =>
        set(id, mode === 'empty' ? undefined : fc);
      sec('angle-lines', d.angleLines);
      sec('orb-bands', d.orbBands);
      sec('star-lines', d.starLines);
      sec('night-shade', d.nightShade);
      sec('local-space', d.localSpace);
      sec('acg-ls-cross', d.localSpaceCross);
      sec('acg-zenith', d.zenith);
      sec('acg-nadir', d.nadir);
      sec('ecliptic', d.ecliptic);
      sec('eclipse', d.eclipse);
      // The overlay (transit/progression) layers are NOT pinned to the natal cage —
      // they belong to a different moment, so they're left untranslated and ride with
      // the basemap as it spins (this feature only fixes the natal linework).
    },
    [],
  );

  // Slide tool (3D globe): drag east/west to spin the Earth about its polar axis under
  // the fixed natal line-cage. The cage is the celestial sphere projected onto Earth, so
  // holding it still while the ground turns is what a place experiences over a day — the
  // basis of parans. Every line layer is rotated rigidly by the spin angle θ (spinPaint)
  // AND the camera centre is counter-rotated by the same θ: the two cancel, so the lines
  // stay screen-pinned while the basemap rotates beneath them. App resamples the cage at
  // natal+Δt as θ grows, so it shows the bodies' real motion.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !slideActive) return;

    // Capture the un-spun view; bearing must be 0 so screen-west == geographic west
    // (otherwise the rigid longitude shift and the camera shift wouldn't cancel along
    // the screen axis). Restore it all on exit.
    const baseCenter = map.getCenter();
    // Re-based on each drag-start from the live camera (see onDown), so a fly between
    // drags — e.g. a badge click that navigates to a line/intersection — is absorbed
    // and the next spin continues from there instead of snapping back.
    let baseLng = baseCenter.lng;
    let baseLat = baseCenter.lat;
    const baseBearing = map.getBearing();
    const basePitch = map.getPitch();
    if (baseBearing !== 0) map.setBearing(0);
    if (basePitch !== 0) map.setPitch(0);
    map.dragPan.disable();
    map.dragRotate.disable();
    // Touch: keep pinch-ZOOM, but kill 2-finger rotate/pitch — a tilted/rotated frame
    // breaks the longitude cancellation that pins the cage.
    map.touchPitch.disable();
    map.touchZoomRotate.disableRotation();
    map.getCanvas().style.cursor = 'grab';

    let spinDeg = 0; // total rotation about the pole (unwrapped: may exceed ±360)
    let dragStartX: number | null = null;
    let spinAtDragStart = 0;
    // Grab-and-spin feel: dragging the full canvas width turns the globe a half-turn.
    let degPerPx = 180 / Math.max(map.getCanvas().clientWidth, 1);
    let raf = 0;
    let lastReport = 0;
    let settleTimer = 0;

    // θ → elapsed Earth-rotation time in DAYS (what App keys the ephemeris resample and
    // the drift readout off). App derives the angle/hours back out from this.
    const dtDaysOf = (deg: number) => deg / SIDEREAL_DEG_PER_HOUR / 24;

    // In motion: hide the badges (.is-moving) AND drop the heavy secondary layers to
    // empty, so only the light cage re-tiles per frame and the spin stays smooth. ~140 ms
    // after motion settles, restore the secondary at the true θ and re-anchor the badges
    // (computeBadges shifts the pinned sets by θ so the labels land back on the lines).
    // Settle is driven here because the per-frame setCenter emits no natural moveend.
    const markSpinning = () => {
      if (!secondaryHiddenRef.current) {
        secondaryHiddenRef.current = true;
        setMapMoving(true);
        spinPaint(spinDeg, 'empty');
      }
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        settleTimer = 0;
        secondaryHiddenRef.current = false;
        spinPaint(spinDegRef.current, 'translate');
        computeBadgesRef.current();
        setMapMoving(false);
      }, 140);
    };

    // Rotate every layer + the camera to the current spin. These run at the rAF rate
    // (smooth); the readout/resample callback is throttled (it triggers App renders and
    // the ephemeris recompute, neither of which needs per-frame fidelity since the cage
    // barely drifts within a frame).
    const apply = () => {
      raf = 0;
      spinDegRef.current = spinDeg;
      // Layers and camera both shift by −θ: their relative offset is unchanged, so the
      // cage holds its screen position while the basemap (camera-only) rotates by θ.
      map.setCenter([baseLng - spinDeg, baseLat]);
      // While the secondary layers are hidden (active spin), re-tile only the cage.
      spinPaint(spinDeg, secondaryHiddenRef.current ? 'skip' : 'translate');
      const now = performance.now();
      if (now - lastReport > 66) {
        lastReport = now;
        onSlide?.(dtDaysOf(spinDeg));
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };

    // Shared mouse/touch drag — `x` is the pointer's screen-x.
    const beginDrag = (x: number) => {
      if (dragStartX !== null) return; // already dragging (ignore touch↔synthetic-mouse dup)
      dragStartX = x;
      slideDraggingRef.current = true;
      spinAtDragStart = spinDeg;
      // Halt any in-flight camera animation (a badge-click fly, an ease) — otherwise
      // the animation keeps writing the camera every frame while apply() writes it
      // back, and the two fight in visible lurches. Stopping freezes the camera
      // wherever the fly reached; the re-base below continues the spin from there.
      map.stop();
      // Re-base from the live camera (centre = base − θ), so any camera move since the
      // last drag — a badge-click fly, a scroll-zoom recentre — is absorbed and this
      // drag continues smoothly instead of jumping back to the old base.
      const c = map.getCenter();
      baseLng = c.lng + spinDeg;
      baseLat = c.lat;
      degPerPx = 180 / Math.max(map.getCanvas().clientWidth, 1);
      map.getCanvas().style.cursor = 'grabbing';
    };
    const moveDrag = (x: number) => {
      if (dragStartX === null) return;
      // Drag right ⇒ spin east ⇒ time forward (continents flow rightward).
      spinDeg = spinAtDragStart + (x - dragStartX) * degPerPx;
      schedule();
      markSpinning();
    };
    const onDown = (e: maplibregl.MapMouseEvent) => {
      if (e.originalEvent.button !== 0) return; // left only (right-click cancels)
      beginDrag(e.point.x);
    };
    const onMove = (e: maplibregl.MapMouseEvent) => moveDrag(e.point.x);
    const onUp = () => {
      if (dragStartX === null) return;
      dragStartX = null;
      slideDraggingRef.current = false;
      map.getCanvas().style.cursor = 'grab';
      // Settle on the exact resting offset (the throttle may have skipped it).
      onSlide?.(dtDaysOf(spinDeg));
    };
    // Single-finger touch spins; a 2nd finger (pinch-zoom) aborts the spin drag.
    const onTouchStart = (e: maplibregl.MapTouchEvent) => {
      if (e.points.length === 1) beginDrag(e.point.x);
    };
    const onTouchMove = (e: maplibregl.MapTouchEvent) => {
      if (e.points.length !== 1) {
        onUp();
        return;
      }
      moveDrag(e.point.x);
    };
    // A mid-drag wheel zoom recentres the camera toward the cursor; without a re-base
    // the next apply() would snap the centre straight back to (base − θ) and undo it —
    // a visible jump. Folding the zoom's recentre into the base per zoom frame lets
    // zooming and spinning compose smoothly. (Between drags nothing fights the camera,
    // and beginDrag re-bases anyway.)
    const onZoomMidDrag = () => {
      if (dragStartX === null) return;
      const c = map.getCenter();
      baseLng = c.lng + spinDeg;
      baseLat = c.lat;
    };

    // Programmatic drive (MapHandle.slideTo/slideBy → readout nudges, keyboard,
    // a track's scrub): same motions as a drag, minus the pointer. A live drag
    // owns the spin (the next mousemove would overwrite anything set here), so
    // drives are ignored mid-drag. The throttled apply() report covers a rapid
    // stream (scrubbing); the trailing timer lands the exact resting value the
    // way onUp does for a drag.
    let driveReportTimer = 0;
    const driveTo = (targetDeg: number) => {
      if (dragStartX !== null) return;
      // Halt an in-flight camera animation and fold any camera drift since the
      // last apply into the base — the beginDrag treatment, for the same reasons.
      map.stop();
      const c = map.getCenter();
      baseLng = c.lng + spinDeg;
      baseLat = c.lat;
      spinDeg = targetDeg;
      schedule();
      markSpinning();
      if (driveReportTimer) clearTimeout(driveReportTimer);
      driveReportTimer = window.setTimeout(() => {
        driveReportTimer = 0;
        onSlide?.(dtDaysOf(spinDeg));
      }, 90);
    };
    slideApiRef.current = {
      to: (dtDays) => driveTo(dtDays * 24 * SIDEREAL_DEG_PER_HOUR),
      by: (deltaDays) => driveTo(spinDeg + deltaDays * 24 * SIDEREAL_DEG_PER_HOUR),
    };

    // Right-click resets to the natal frame and exits (mirrors the measure tool).
    const onContextMenu = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      dragStartX = null;
      slideDraggingRef.current = false;
      secondaryHiddenRef.current = false;
      spinDeg = 0;
      spinDegRef.current = 0;
      map.setCenter([baseLng, baseLat]);
      spinPaint(0, 'translate');
      onSlideCancel?.();
    };

    // A release OUTSIDE the canvas — the map's own up events only fire over it — would
    // otherwise leave the drag stuck (dragging=true kills hover tips). Catch it on window.
    const onWindowUp = () => onUp();
    map.on('mousedown', onDown);
    map.on('mousemove', onMove);
    map.on('mouseup', onUp);
    map.on('contextmenu', onContextMenu);
    map.on('touchstart', onTouchStart);
    map.on('touchmove', onTouchMove);
    map.on('touchend', onUp);
    map.on('touchcancel', onUp);
    map.on('zoom', onZoomMidDrag);
    window.addEventListener('mouseup', onWindowUp);
    window.addEventListener('touchend', onWindowUp);
    // Establish every layer at θ=0 immediately.
    schedule();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (settleTimer) clearTimeout(settleTimer);
      if (driveReportTimer) clearTimeout(driveReportTimer);
      slideApiRef.current = null;
      slideDraggingRef.current = false;
      secondaryHiddenRef.current = false;
      map.off('mousedown', onDown);
      map.off('mousemove', onMove);
      map.off('mouseup', onUp);
      map.off('contextmenu', onContextMenu);
      map.off('touchstart', onTouchStart);
      map.off('touchmove', onTouchMove);
      map.off('touchend', onUp);
      map.off('touchcancel', onUp);
      map.off('zoom', onZoomMidDrag);
      window.removeEventListener('mouseup', onWindowUp);
      window.removeEventListener('touchend', onWindowUp);
      map.dragPan.enable();
      if (projectionRef.current === '3d') {
        map.dragRotate.enable();
        map.touchPitch.enable();
        map.touchZoomRotate.enableRotation();
      }
      map.getCanvas().style.cursor = '';
      // Un-spin: restore the natal centre/bearing/pitch and re-push every layer
      // untranslated (freshSources forces it past the identity cache), then re-anchor
      // the badges at natal immediately (don't wait on the data effect's timing).
      map.setCenter([baseLng, baseLat]);
      if (baseBearing !== 0) map.setBearing(baseBearing);
      if (basePitch !== 0) map.setPitch(basePitch);
      pushData(map, dataRef.current, true, lsTransparentRef.current);
      spinDegRef.current = 0;
      setMapMoving(false);
      computeBadgesRef.current();
      onSlide?.(0);
    };
  }, [slideActive, onSlide, onSlideCancel, spinPaint]);

  // A 2D↔3D toggle MID-slide re-runs applyProjection, which re-enables dragRotate / touch
  // rotate+pitch in 3D — re-disable them while the slide owns the interaction. The slide
  // effect itself doesn't depend on `projection`, so it won't re-run to do this (and we
  // don't want it to: re-running would reset the in-progress spin).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !slideActive) return;
    map.dragRotate.disable();
    map.touchPitch.disable();
    map.touchZoomRotate.disableRotation();
  }, [slideActive, projection]);

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
    // Touch: a pinch is the box-zoom equivalent. The zoom event fires throughout a pinch
    // with the touchmove as originalEvent (2+ touches); fire pinch-zoom (idempotent). The
    // touches guard skips the zoom-out button, wheel, and programmatic flyTo (no touches).
    const onZoom = (e: { originalEvent?: unknown }) => {
      const oe = e.originalEvent as TouchEvent | undefined;
      if (oe && 'touches' in oe && oe.touches && oe.touches.length >= 2) {
        onMissionEvent?.('pinch-zoom');
      }
    };
    map.on('boxzoomend', onBoxZoom);
    map.on('rotatestart', onRotate);
    map.on('pitchstart', onRotate);
    map.on('zoom', onZoom);
    return () => {
      map.off('boxzoomend', onBoxZoom);
      map.off('rotatestart', onRotate);
      map.off('pitchstart', onRotate);
      map.off('zoom', onZoom);
    };
  }, [onMissionEvent]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded() && map.getSource('acg-lines')) {
      if (slideActiveRef.current) {
        // Slide owns the sources (rotated to the current spin) — re-apply at θ rather
        // than push natal positions, which would detach the layers from the spun cage.
        // While spinning, only the cage + parans are live (secondary hidden), so
        // re-tile just those.
        spinPaint(spinDegRef.current, secondaryHiddenRef.current ? 'skip' : 'translate');
      } else {
        pushData(map, { lines, angleLines, parans, orbBands, starLines, nightShade, localSpace, localSpaceCross, zenith, nadir, ecliptic, overlay, eclipse }, false, lsTransparentRef.current);
        computeBadges();
      }
    } else {
      // Style not ready — usually a transient: the sources are mid-update (isStyleLoaded() reads
      // false while a setData settles), NOT the pre-load case. Defer to the next `idle` (fires once
      // the map settles) rather than `load` — `load` only ever fires on the FIRST style load, so a
      // deferred push after that would be dropped, stranding whatever data was last set (e.g. the
      // filtered subset when a line spotlight clears). `dataRef.current` carries the latest props.
      // The deferred push must respect an active slide exactly like the live branch above: a
      // spin-drag keeps the style busy per frame, so its bucket resamples all land here — and the
      // map only goes idle AFTER the user releases, so a raw (untranslated) push would snap the
      // spun cage back to natal the moment they let go (and stacked defers would repeat it).
      if (idleDeferRef.current) return;
      idleDeferRef.current = true;
      map.once('idle', () => {
        idleDeferRef.current = false;
        if (slideActiveRef.current) {
          spinPaint(spinDegRef.current, secondaryHiddenRef.current ? 'skip' : 'translate');
        } else {
          pushData(map, dataRef.current, false, lsTransparentRef.current);
          computeBadges();
        }
      });
    }
  }, [lines, angleLines, parans, orbBands, starLines, nightShade, localSpace, localSpaceCross, localSpaceOrigin, zenith, nadir, ecliptic, overlay, eclipse, lsTransparent, slideActive, computeBadges, spinPaint]);

  // Toggle basemap road / river / foliage visibility — and the whole-basemap blank
  // (Local Space ▸ "Hide map") — live (theme reloads reapply via the style.load
  // handler above).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getContainer().classList.toggle('basemap-hidden', hideBasemap);
    // Deliberately NOT gated on isStyleLoaded(): that probe also reports false
    // during ordinary tile/source churn (which the chart's own data pushes cause),
    // so gating on it silently dropped toggles flipped mid-churn — e.g. the map
    // blank applied right after the Capture frame resizes the view. The apply
    // guards itself (parsed style or no-op) and the load handler covers pre-parse.
    applyDetailToggles(map, { showRoads, showRivers, showLabels, hideBasemap });
  }, [showRoads, showRivers, showLabels, hideBasemap]);

  // Toggle the local-space direction arrows live (the Local Space window's
  // Capture-time "Hide line arrows" option). Style reloads reapply via the
  // load/style.load handlers, which rebuild the arrow layers visible. Not gated
  // on isStyleLoaded() (false during ordinary tile/source churn — it would drop
  // mid-churn toggles); pre-parse, getLayer finds nothing and this no-ops.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyLsArrowVisibility(map, hideLsArrows);
  }, [hideLsArrows]);

  // Re-anchor the LS labels when the Capture-time "Standard labels" mode flips —
  // computeBadges reads the mode through lsEdgeLabelsRef (synced by the commit
  // effect above, which runs before this one), so a recompute is all it takes.
  // computeBadges is safe at any readiness (projection probes are guarded), so
  // no style gate — one would drop flips made during tile/source churn. The
  // trailing scheduleBadges settles the layout over the re-rendered pill faces
  // (the direct pass measures boxes whose bearing spans still show the previous
  // badge state) — see the transparent-mode effect for the full story.
  useEffect(() => {
    if (!mapRef.current) return;
    computeBadgesRef.current();
    scheduleBadgesRef.current();
  }, [lsEdgeLabels]);

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
      // The app's standard teardrop pin icon — the same SVG as the guide window and
      // the sidebar's relocated-chart readout — filled with the location-state colour
      // and rimmed in --tint so it stands out on the basemap (styled by .map-pin-body
      // in Map.css). The state colour stays at the SCREEN EDGES (the .map-edge-glow
      // vignette, recoloured per state) rather than glowing around the pin; a ring
      // still pings from the tip on placement; only the icon is clickable (transparent
      // gaps stay click-through).
      // The trailing ring + image pair is the (optional) emblem slot over the head
      // circle — hidden until an adornment provides a URL (lib/extensions/pinAdornment);
      // inside the SVG so it inherits the body's hover/drop motion and shadow for free.
      el.innerHTML =
        '<span class="map-pin-glow"></span>' +
        '<svg class="map-pin-body" viewBox="0 0 24 24" aria-hidden="true">' +
        '<path class="map-pin-shape" d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>' +
        '<circle class="map-pin-dot" cx="12" cy="10" r="3"/>' +
        '<circle class="map-pin-emblem-ring" cx="12" cy="10" r="5.9"/>' +
        // Drawn at 2× and statically halved in CSS: rasterized at the DRAWN size,
        // so animated upscales (the celebration pop, the body bounce) stay inside
        // the raster's headroom and the emblem never blurs mid-animation.
        '<image class="map-pin-emblem" x="1" y="-1" width="22" height="22" preserveAspectRatio="xMidYMid slice"/>' +
        '</svg>';
      // Right-click the pin to remove it (matches the map's right-click-to-remove).
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onRightClickRef.current?.();
      });
      // Broadcast clicks on the pin itself on a claimable channel (the marker cousin of
      // the map-click broadcast — see lib/extensions/pinAdornment): a listener that
      // treats the pin tap as its own gesture claims it, which keeps the click from
      // falling through to the map's own click handling (e.g. a line card under the
      // pin). Unclaimed clicks bubble exactly as before. State is read live off the
      // marker/DOM — this listener binds once, at marker creation.
      el.addEventListener('click', (e) => {
        const at = markerRef.current?.getLngLat();
        if (!at) return;
        let claimed = false;
        const detail: PinClickDetail = {
          lat: at.lat,
          lng: at.lng,
          natal: el.classList.contains('natal'),
          claim: () => {
            claimed = true;
          },
        };
        window.dispatchEvent(new CustomEvent<PinClickDetail>(PIN_CLICK_EVENT, { detail }));
        if (claimed) {
          e.preventDefault();
          e.stopPropagation();
        }
      });
      // Swallow double-clicks on the marker: the icon hangs ABOVE its anchor point, so
      // letting one through re-places the pin at the cursor and the pin creeps north by
      // its own height. Double-click stays a map gesture, not a marker one.
      el.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      // Stamp the mount-time celebration count so only LATER celebrations play (a
      // marker created mid-session must not celebrate history).
      el.dataset.celebrated = String(pinCelebrations);
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
      const prev = markerRef.current.getLngLat();
      const moved = prev.lng !== pin.lng || prev.lat !== pin.lat;
      markerRef.current.setLngLat([pin.lng, pin.lat]);
      // The placement pulses are finite (see Map.css — they'd otherwise keep the
      // compositor busy forever), so replay them when the pin relocates: swapping
      // each inert pulse span for a fresh clone restarts its CSS animation. The
      // glass body (and the listeners, which live on the marker root) stay put.
      // (Clones inherit classes, so shed a celebration's one-ping variant here —
      // a relocation replays the full placement sequence.)
      if (moved) {
        for (const span of markerRef.current
          .getElement()
          .querySelectorAll('.map-pin-glow')) {
          const clone = span.cloneNode(false) as HTMLElement;
          clone.classList.remove('celebrate-ping');
          span.replaceWith(clone);
        }
      }
    }
    const el = markerRef.current.getElement();
    el.classList.toggle('natal', pinType === 'natal');
    // Apply the single-slot adornment: show the emblem when a URL is provided.
    // Idempotent on purpose — re-setting even the SAME href on an SVG <image>
    // forces a re-decode, which blanks the emblem for a frame. Adornment
    // updates that only change the tip (a place name resolving late) must not
    // make the emblem blink.
    const emblemUrl = pinAdornment?.emblemUrl ?? '';
    const emblem = el.querySelector('.map-pin-emblem');
    if (emblem && (emblem.getAttribute('href') ?? '') !== emblemUrl) {
      if (emblemUrl) emblem.setAttribute('href', emblemUrl);
      else emblem.removeAttribute('href');
    }
    el.classList.toggle('has-emblem', emblemUrl !== '');
    // One-shot celebration (pinAdornment.celebratePin): a downstream action on the
    // pin just completed — replay the placement pulses and run the celebrate
    // flourish (icon bounce + emblem pop, Map.css) so it visibly lands.
    if (el.dataset.celebrated !== String(pinCelebrations)) {
      el.dataset.celebrated = String(pinCelebrations);
      // ONE ping, not the placement's four (Map.css .celebrate-ping): the later
      // pings of the full sequence land seconds after the flourish reads as over
      // and register as stray flashes.
      for (const span of el.querySelectorAll('.map-pin-glow')) {
        const clone = span.cloneNode(false) as HTMLElement;
        clone.classList.add('celebrate-ping');
        span.replaceWith(clone);
      }
      el.classList.remove('celebrate');
      void el.offsetWidth; // reflow, so a rapid re-celebration restarts the animation
      el.classList.add('celebrate');
      // Drop the flourish state once it has played out (the longest keyframe runs
      // 0.5 s). A lingering animation keeps the emblem on a composited layer whose
      // raster was captured mid-pop — it then renders distorted until an href swap
      // forces a fresh decode. Removing the class returns it to a plain element,
      // which re-rasterizes crisp. Firing against a detached marker is a no-op.
      window.clearTimeout(celebrateTimerRef.current);
      celebrateTimerRef.current = window.setTimeout(
        () => el.classList.remove('celebrate'),
        700,
      );
    }
    const label =
      pinAdornment?.tip ?? (pinType === 'natal' ? t('map.pin.natal') : t('map.pin.custom'));
    // The pin is plain MapLibre DOM, so it can't take the shared HoverTip's ref —
    // drive the portaled tip imperatively, exactly like the nav-control tips above
    // (NOT a native `title=`). `aria-label` stays as the accessible name; the shared
    // long-press kernel (bindTouchTip with pointer:true) gives hover + hold-to-reveal
    // on touch. Re-bound each run so the label tracks natal/custom; the returned
    // cleanup tears the listeners down (and clears any open tip) when the pin moves
    // type, is removed, or the map unmounts.
    el.setAttribute('aria-label', label);
    const show = () =>
      setPinTip({ pos: tipPosFor(el.getBoundingClientRect(), 'top'), title: label });
    const { cleanup } = bindTouchTip(el, show, () => setPinTip(null), {
      pointer: true,
    });
    return () => {
      cleanup();
      setPinTip(null);
    };
  }, [pin, pinType, t, pinAdornment, pinCelebrations]);

  // The Sky Times "follow the cursor" beacon: a clock stamp with a pulsing aura
  // marking where the sky clock is being read. In 'live' mode it rides the raw
  // pointer (the halo hugs the cursor, and hides while the cursor is off the map);
  // in 'held' mode it anchors on the parked spot and auto-tracks pan/zoom. It's
  // pointer-events:none, so it never intercepts a click/hover meant for the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (skyFollow === 'off') {
      skyStampRef.current?.remove();
      skyStampRef.current = null;
      return;
    }
    if (!skyStampRef.current) {
      const el = document.createElement('div');
      el.className = 'sky-follow-stamp';
      // Inline (beats MapLibre's own .maplibregl-marker rule regardless of stylesheet
      // order) so the beacon never swallows the park-click / hover meant for the map.
      el.style.pointerEvents = 'none';
      el.innerHTML =
        '<span class="sky-follow-aura"></span>' +
        '<span class="sky-follow-disc">' +
        '<svg class="sky-follow-clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg></span>';
      skyStampRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(map.getCenter())
        .addTo(map);
    }
    const marker = skyStampRef.current;
    const el = marker.getElement();
    const held = skyFollow === 'held';
    el.classList.toggle('is-held', held);
    if (held) {
      // Parked: sit on the clicked read point; the Marker keeps it there through pan/zoom.
      if (skyFollowHeld) {
        marker.setLngLat([skyFollowHeld.lng, skyFollowHeld.lat]);
        el.style.visibility = 'visible';
      } else {
        el.style.visibility = 'hidden';
      }
      return;
    }
    // Live: ride the raw pointer. Hidden until the cursor is over the map (and once it leaves),
    // so the beacon never lingers at a stale spot when following resumes.
    el.style.visibility = 'hidden';
    const onMove = (e: maplibregl.MapMouseEvent) => {
      marker.setLngLat(e.lngLat);
      el.style.visibility = 'visible';
    };
    const onOut = () => {
      el.style.visibility = 'hidden';
    };
    map.on('mousemove', onMove);
    map.on('mouseout', onOut);
    return () => {
      map.off('mousemove', onMove);
      map.off('mouseout', onOut);
    };
  }, [skyFollow, skyFollowHeld]);

  // The greatest-eclipse (solar) / sub-lunar (lunar) maximum marker — a styled DOM
  // marker tinted with the eclipse's own colour, with a finite ping that replays
  // whenever the point moves (a new eclipse is selected). Replaces the old GL coin
  // that read as a zenith stamp; the 'ge'/'sublunar' point lives in the eclipse data.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const feat = eclipse?.features.find(
      (f) => f.properties.kind === 'ge' || f.properties.kind === 'sublunar',
    );
    const pt =
      feat && feat.geometry.type === 'Point'
        ? (feat.geometry.coordinates as [number, number])
        : null;
    if (!feat || !pt) {
      eclipseMarkerRef.current?.remove();
      eclipseMarkerRef.current = null;
      eclipseMarkerKeyRef.current = null;
      return;
    }
    const solar = feat.properties.kind === 'ge';
    const color = feat.properties.color;
    // Skip a needless rebuild (which would restart the ping) when nothing changed.
    const key = `${solar ? 's' : 'l'}|${pt[0].toFixed(4)},${pt[1].toFixed(4)}|${color}`;
    if (eclipseMarkerKeyRef.current === key && eclipseMarkerRef.current) return;

    if (!eclipseMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'eclipse-marker';
      eclipseMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(pt)
        .addTo(map);
    } else {
      eclipseMarkerRef.current.setLngLat(pt);
    }
    const el = eclipseMarkerRef.current.getElement();
    el.classList.toggle('eclipse-marker--solar', solar);
    el.classList.toggle('eclipse-marker--lunar', !solar);
    el.style.color = color;
    // Rebuilding the inner markup restarts the ping's CSS animation, so the marker
    // re-pings each time you step to a different eclipse.
    el.innerHTML =
      '<span class="eclipse-marker-ping" aria-hidden="true"></span>' +
      (solar ? SOLAR_MARKER_SVG : LUNAR_MARKER_SVG);
    eclipseMarkerKeyRef.current = key;
  }, [eclipse]);

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
  // zenith points, which the App supplies (and the map draws as stamps) only when
  // Overlay ▸ Display ▸ Zenith is on — so when it's off this map is empty and the
  // overlay labels become non-clickable. Plain objects, not a Map — `Map` is this
  // component's own name here.
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
      {/* The Capture frame. Insetting it (when the Capture tool arms a
          frame) shrinks the working map view while the surrounding HUD stays put.
          It holds every map-projected layer — the GL canvas, the edge labels, the
          pin/markers, the local-horizon wheel — so they shrink and stay in register
          together, and so a single `captureFrame` rasterises them as one unit. */}
      <div
        ref={frameRef}
        className={`map-frame${frameActive ? ' framed' : ''}${frameInset?.cap ? ' has-caption' : ''}${lsTransparent ? ' transparent' : ''}`}
        style={
          frameInset
            ? ({
                left: frameInset.l,
                top: frameInset.t,
                right: frameInset.r,
                bottom: frameInset.b,
                '--capture-caption-h': `${frameInset.cap}px`,
                // The would-be band height, always set — the Transparent brand mark sizes + places
                // itself off this so it matches the non-transparent watermark exactly.
                '--capture-brand-h': `${frameInset.bandH}px`,
                '--capture-extra-left': `${showExtras && extraSide === 'left' ? extraSize : 0}px`,
                '--capture-extra-top': `${showExtras && extraSide === 'top' ? extraSize : 0}px`,
              } as CSSProperties)
            : bottomInset || leftInset
              ? // A reserved bottom and/or left layout band (e.g. a docked bar or a
                // left-docked panel): the whole frame — canvas, edge badges, markers,
                // attribution — lifts above / shrinks in from the reserved edge as one
                // unit, and the resize layout effect re-fits the GL viewport.
                {
                  bottom: bottomInset || undefined,
                  left: leftInset || undefined,
                }
              : undefined
        }
      >
      <div ref={containerRef} className="map-container" />
      {glStatus !== 'ok' && (
        // The map is WebGL-only, so a missing/lost context leaves the container a
        // blank dark box. Cover it with a plain-DOM notice (no WebGL, so it always
        // renders) that explains what happened and offers safe, reversible fixes.
        <div className="map-gl-fallback" role="alert">
          <div className="map-gl-fallback-card">
            {glStatus === 'unsupported' ? (
              <>
                <h2>{t('map.webgl.unsupportedTitle')}</h2>
                <p>{t('map.webgl.unsupportedBody')}</p>
                <p className="map-gl-fallback-heading">{t('map.webgl.tipsHeading')}</p>
                <ul>
                  <li>{t('map.webgl.tipAccel')}</li>
                  <li>{t('map.webgl.tipShield')}</li>
                  <li>{t('map.webgl.tipBrowser')}</li>
                </ul>
              </>
            ) : (
              <>
                <h2>{t('map.webgl.lostTitle')}</h2>
                <p>{t('map.webgl.lostBody')}</p>
              </>
            )}
            <button type="button" onClick={() => window.location.reload()}>
              {t('map.webgl.reload')}
            </button>
          </div>
        </div>
      )}
      {creditsOpen && <CreditsModal onClose={() => setCreditsOpen(false)} />}
      <HoverTip
        pos={ctrlTip?.pos ?? null}
        placement="left"
        title={ctrlTip?.title ?? ''}
        hotkey={ctrlTip?.hotkey}
      />
      <HoverTip
        pos={pinTip?.pos ?? null}
        placement="top"
        title={pinTip?.title ?? ''}
      />
      <div
        className={`acg-edge-badges${mapMoving ? ' is-moving' : ''}`}
        aria-hidden="true"
      >
        {/* The ACG / aspect / node edge badges label the non-LS lines — hidden in the transparent
            LS-only export (those lines are emptied at the source), so their labels go too. */}
        {!lsTransparent && badges.map((b) => {
          const text = badgeTextColor(b.color);
          // A merged lunar-node pair gets a two-tone fill (North Node colour → South Node
          // colour, matching the line) and a dual "NN MC / SN IC" label; every other
          // badge keeps its solid planet colour and single label.
          // Seam between the two node colours. 50% centres it for a natal pair, but an
          // OVERLAY pair leads with a 2-char tag ("Tr"/"Sp") that widens the North-node
          // half, so push the seam later (~60%) to keep it in the gap between the halves
          // rather than slicing through the glyphs.
          const seamPct = b.prefix ? 60 : 50;
          const bg = b.pair
            ? `linear-gradient(100deg, ${PLANET_COLORS.NorthNode} 0 ${seamPct}%, ${PLANET_COLORS.SouthNode} ${seamPct}% 100%)`
            : b.color;
          // Aspect/midpoint badges fly to their computed point's sub-point —
          // where the aspect-offset (or midpoint) ecliptic degree is directly
          // overhead, on the set's dashed MC line — the analog of a planet
          // badge's zenith. It rides the same fly-out / fly-back toggle, keyed
          // by the computed point so each aspect or pair toggles independently.
          const angleBadge = Boolean(b.aspect || b.planetB);
          // Aspect badges name the line by its true angle (its `branch`) — As/Ds/
          // Mc/Ic — matching the hover tip and line card, not the MC/ASC-convention
          // relabel in b.lineType. Falls back to that relabel if branch is absent;
          // null on non-aspect (pair / midpoint / plain) badges.
          const aspectFace = b.aspect
            ? aspectBranchReading(b.aspect, b.branch ?? b.lineType)
            : null;
          const zenithTarget = angleBadge
            ? b.targetLng !== undefined && b.targetLat !== undefined
              ? ([b.targetLng, b.targetLat] as [number, number])
              : undefined
            : b.overlay
              ? zenithByOverlayPlanet[b.planet]
              : zenithByPlanet[b.planet];
          // Key angle badges by their anchor COORDS, not just planet+aspect:
          // every (planet, aspect) family exists as two branches with antipodal
          // anchors (e.g. the two trine-MC meridians), and a midpoint pair has
          // near/far anchors — each badge must own its fly-out/fly-back toggle,
          // or clicking the second branch would "return" instead of flying.
          const flyId = angleBadge
            ? `ang|${b.planet}|${b.aspect ?? ''}|${b.planetB ?? ''}|${b.targetLng?.toFixed(3)}|${b.targetLat?.toFixed(3)}`
            : // Key by the routing prefix (the overlay tag for overlay-path
              // badges, '' otherwise) so the label shares one toggle with its
              // stamp — a promoted label shows "Tr" but keys '' like its
              // natal-source stamp.
              zenithKey(b.overlay ? b.prefix : '', b.planet);
          const flyTip = b.planetB
            ? t('map.flyToMidpoint', {
                planetA: labels.planet(b.planet),
                planetB: labels.planet(b.planetB),
              })
            : aspectFace
              ? t('map.flyToAspectPoint', {
                  planet: labels.planet(b.planet),
                  aspect: t(`map.aspectNames.${aspectFace.aspect}`),
                })
              : t('map.flyToZenith', {
                  prefix: b.prefix ? `${b.prefix} ` : '',
                  planet: labels.planet(b.planet),
                });
          const inner = b.pair ? (
            // No "/" separator — the two-tone fill splits North vs South node — but keep an
            // empty spacer so the two halves read as two groups and the colour seam falls
            // in the gap rather than through a glyph. The overlay tag (e.g. "Tr") still
            // leads, as on every other overlay badge.
            <>
              {b.prefix && <span className="acg-badge-prefix">{b.prefix}</span>}
              <PlanetGlyph planet={b.planet} size={11} color={text} />
              <span className="acg-badge-code">{ANGLE_CODE[b.lineType]}</span>
              <span className="acg-badge-sep" aria-hidden="true" />
              <PlanetGlyph planet="SouthNode" size={11} color={text} />
              <span className="acg-badge-code">
                {ANGLE_CODE[OPPOSITE_ANGLE[b.lineType]]}
              </span>
            </>
          ) : b.planetB ? (
            // Midpoint line: both bodies' glyphs, then the angle ("Su Mo MC").
            <>
              <PlanetGlyph planet={b.planet} size={11} color={text} />
              <PlanetGlyph planet={b.planetB} size={11} color={text} />
              <span className="acg-badge-code">{ANGLE_CODE[b.lineType]}</span>
            </>
          ) : aspectFace ? (
            // Aspect line: glyph, aspect symbol, the line's true angle ("Su □ Ds").
            // The symbol uses the bundled glyph font, like the planet glyph beside it.
            <>
              <PlanetGlyph planet={b.planet} size={11} color={text} />
              <span className="astro-glyph acg-badge-code">
                {ASPECT_GLYPHS[aspectFace.aspect]}
              </span>
              <span className="acg-badge-code">{ANGLE_CODE[aspectFace.angle]}</span>
            </>
          ) : (
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
              data-bkey={b.key}
              tabIndex={-1}
              className="acg-badge acg-badge-btn"
              style={{ translate: badgePos(b.x, b.y), background: bg, color: text }}
              onClick={() => flyToZenith(flyId, zenithTarget[0], zenithTarget[1])}
              placement="top"
              tip={flyTip}
            >
              {inner}
            </TipButton>
          ) : (
            <span
              key={b.key}
              data-bkey={b.key}
              className="acg-badge"
              style={{ translate: badgePos(b.x, b.y), background: bg, color: text }}
            >
              {inner}
            </span>
          );
        })}
        {/* Paran badges label the (non-LS) paran crossings — likewise hidden in the LS-only export. */}
        {!lsTransparent && paranBadges.map((b) => (
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
          // Transparent export enlarges the badges ~50% for the compass-rose look — but only the
          // OUTBOUND (toward-planet) half; the reciprocal INBOUND half stays regular size.
          const lgBadge = lsTransparent && b.out;
          return (
            // Clicking an LS label flies to the local-space origin — where the lines
            // converge (the pin). Both halves show LS + glyph; only the outgoing
            // (toward-planet) half also prints its bearing (degrees + arcminutes) —
            // blanked in the Capture "Standard labels" mode, whose faces match the
            // chart's edge badges.
            <TipButton
              type="button"
              key={b.key}
              data-lskey={b.key}
              tabIndex={-1}
              // Transparent export: glyph-only (drop the "LS" prefix), and ~50% larger on the
              // outbound half so the compass rose reads big on a floor-plan overlay.
              className={`acg-badge acg-badge-btn${lgBadge ? ' ls-badge-lg' : ''}`}
              style={{ translate: badgePos(b.x, b.y), background: b.color, color: text }}
              onClick={() =>
                localSpaceOrigin &&
                flyToPoint(localSpaceOrigin.lng, localSpaceOrigin.lat)
              }
              placement="top"
              tip={t('map.flyToLocalSpaceOrigin')}
            >
              {!lsTransparent && <span className="acg-badge-prefix">LS</span>}
              <PlanetGlyph planet={b.planet} size={lgBadge ? 17 : 11} color={text} />
              {/* Transparent "Label Name": the planet's name after the glyph (e.g. "♂ Mars"). */}
              {lsLabelName && (
                <span className="ls-badge-name">{labels.planet(b.planet)}</span>
              )}
              {b.out && b.azLabel && <span className="ls-deg">{b.azLabel}</span>}
            </TipButton>
          );
        })}
        {/* Transparent "Degrees": each line's bearing printed DOWN its line — a small label just
            past the badge toward the origin (where the rose converges). Kept separate from the pill
            so it never widens it; its anchor (degX/degY) is computed off the measured pill edge. */}
        {lsLineDeg &&
          localSpaceBadges.map((b) =>
            b.bearing && b.degX != null && b.degY != null ? (
              <span
                key={`${b.key}-deg`}
                className="ls-line-deg"
                style={{ translate: badgePos(b.degX, b.degY), color: b.color }}
              >
                {b.bearing}
              </span>
            ) : null,
          )}
      </div>
      {/* Registered map overlays (registerMapOverlay) — positioned DOM drawn inside the
          frame and re-projected on every camera move. Add-ons attach here with no edits to
          this file; rendered only when an overlay context is supplied. */}
      {overlayCtx && (
        <MapOverlayHost
          mapRef={mapRef}
          ready={mapReady}
          moving={mapMoving}
          hiddenIds={hiddenOverlayIds}
          ctx={overlayCtx}
        />
      )}
      {!hideCompass && compassP !== null && originScreen && (
        // The dial is placed at the origin's PROJECTED point, which is relative to the GL
        // canvas. While framing, the canvas + edge badges shift by the Extras-panel inset
        // (--capture-extra-*); this layer carries the dial so it shifts by the same amount
        // and stays centred on the origin (see .local-horizon-layer in Map.css).
        <div className="local-horizon-layer">
          <LocalHorizonWheel
            cx={originScreen.x}
            cy={originScreen.y}
            size={HORIZON_WHEEL_SIZE}
            scale={COMPASS_MIN_SCALE + (1 - COMPASS_MIN_SCALE) * compassP}
            opacity={
              mapMoving
                ? 0
                : COMPASS_MAX_OPACITY * Math.min(1, compassP / COMPASS_FADE_FRACTION)
            }
            bearing={originNorthDeg}
          />
        </div>
      )}
      {/* Capture "Extras" panel — opaque planet/angle positions; the map + edge badges
          inset to clear it (left for landscape, top otherwise). Self-measures → onExtraMeasure. */}
      {showExtras && frameExtras && (
        <CaptureExtras
          orientation={extraSide}
          data={frameExtras}
          wheelSize={wheelSize}
          onMeasure={onExtraMeasure}
        />
      )}
      {/* Capture footer — real DOM inside the frame, so it's captured WYSIWYG and
          the map/edge-labels are inset above the caption band rather than drawn over it.
          The band carries the watermark + optional caption text. `noCaption` (gated
          Transparent mode) drops it entirely for a clean see-through export. */}
      {frameActive && !noCaption && (
        <div className="capture-footer" aria-hidden="true">
          <div className="capture-caption">
            {frameCaptionText ? (
              <span className="capture-caption-text">{frameCaptionText}</span>
            ) : null}
          </div>
          {/* The export watermark. The open core stamps a plain "astrolina.org" credit;
              a downstream build swaps in its wordmark + font via setCaptureBrand. */}
          <span className="capture-watermark">{getCaptureBrand().render()}</span>
        </div>
      )}
      {/* Transparent export: no footer band, so the caption rides in the frame's TOP-LEFT
          instead — each enabled field on its own line, over the map (no band) with a halo for
          legibility. Real DOM inside the frame, so captureFrame rasterises it WYSIWYG. */}
      {frameActive && lsTransparent && frameCaptionLines.length > 0 && (
        <div className="capture-caption-tl" aria-hidden="true">
          {frameCaptionLines.map((line, i) => (
            <div key={i} className="capture-caption-tl-line">
              {line}
            </div>
          ))}
        </div>
      )}
      {/* Transparent export: no footer band + the credits/copyright control is hidden (CSS, keyed
          on .map-frame.transparent), so the brand stands alone bottom-right as a subtle half-opacity
          mark — which carries the attribution. Same brand seam + classes as the footer watermark, so
          the export's onclone recolours it and its font is awaited the same way. */}
      {frameActive && lsTransparent && (
        <span className="capture-watermark capture-watermark-transparent" aria-hidden="true">
          {getCaptureBrand().render()}
        </span>
      )}
      </div>
      {/* Subtle escape hatch once deeply zoomed in (LS labels at full radius): a
          low-opacity pill, brighter on hover, that eases back to a wide overview. Kept
          visible while the zoom guide is open so its click mission stays completable —
          but hidden entirely in the transparent LS export, whose deep zoom is deliberate
          framing, not the user exploring (App suppresses the matching guide too). */}
      {!lsTransparent && (zoom >= CLOSE_ZOOM || keepZoomOutVisible) && (
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
