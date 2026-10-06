// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import {
  forwardRef,
  Fragment,
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
  type LayerSpecification,
  type StyleSpecification,
} from 'maplibre-gl';
import type { Feature, FeatureCollection, Geometry, LineString, Point, Polygon } from 'geojson';
import type { LineProps, ZenithProps } from '../../lib/astro/lines';
import { getCaptureBrand } from '../../lib/captureBrand';
import { addPngMetadata } from '../../lib/pngMeta';
import { setCaptureFailure } from '../../lib/captureFailure';
import { cloneWithInlineStyles, svgToImage } from '../../lib/wheelRaster';
import { isPhone, isPhonePortrait, isTouchLayout, usePhone } from '../../lib/touch';
import {
  CaptureExtras,
  type CaptureFrameExtras,
} from '../CaptureExtras/CaptureExtras';
import type { OrbBandProps } from '../../lib/astro/orbBands';
import type { UncertaintyBandProps } from '../../lib/astro/uncertaintyBands';
import type { StarLineProps } from '../../lib/astro/starLines';
import type { MinorLineProps, MinorZenithProps } from '../../lib/astro/minorLines';
import type { NightShadeProps } from '../../lib/astro/nightShade';
import { aspectBranchReading, type AngleOverlayLineProps, type AspectKind } from '../../lib/astro/angleAspects';
import type { MinorParanProps, ParanProps } from '../../lib/astro/parans';
import type { LocalSpaceProps } from '../../lib/astro/localSpace';
import type { CrossingProps } from '../../lib/astro/localSpaceCrossings';
import type { EclipseMapData } from '../../lib/astro/eclipses';
import {
  geoZoneId,
  type GeoAscZones,
  type GeoGridLineProps,
  type GeoReadoutAngles,
  type GeoZoneProps,
} from '../../lib/astro/geodeticGrid';
import type { TruncZodiac } from '../../lib/astro/format';
import { canonicalLng, fmtLatDM, fmtLngDM } from '../../lib/coordFormat';
import {
  BASEMAP_STYLE_URLS,
  WORLD_FALLBACK_COLORS,
  LABEL_HALO_COLORS,
  ECLIPSE_LABEL_HALO,
  GEO_GRID_STYLE,
  ZENITH_DISC_COLORS,
  type Theme,
} from '../../lib/theme';
import { PROJECTION_SPEC, type MapProjectionMode } from '../../lib/projection';
import type { MissionEvent } from '../../lib/missions';
import {
  escapeHtml,
  minorMarkHtml,
  minorMarkText,
  minorNameHtml,
  type LineCardDistance,
} from '../../lib/lineCard';
import { minorDisplayLabel, minorDisplayParts } from '../../lib/minorBodies/naming';
import {
  isOccluded,
  projectVisible,
  screenAngleOfNorth,
} from '../../lib/mapProjection';
import { ensureGlyphImages, STAR_MARK_IMAGE, ZENITH_GLYPH_PREFIX, NADIR_GLYPH_PREFIX } from './glyphImages';
import {
  applyDetailToggles,
  applyLabelContrast,
  isChartSource,
  WORLD_FALLBACK_SOURCE,
} from './basemapStyle';
import { setLabelColliders } from './labelCollider';
// Importing it registers MapLibre's right-to-left text plugin, once per page (see the module).
import { ensureRtlTextPlugin } from './rtlTextPlugin';
import {
  BAND_SOURCE_OPTS,
  LINE_SOURCE_OPTS,
  PARAN_SOURCE_OPTS,
  WASH_SOURCE_OPTS,
  translateLng,
  wrapSpin,
} from './tiling';
import {
  boundedWait,
  createBasemapRecovery,
  LIVE_BASEMAP_WAIT_MS,
  transformBasemapRequest,
  watchLiveBasemap,
  type BasemapMode,
} from './basemapFallback';
import { MapOverlayHost } from './MapOverlayHost';
import {
  MAP_CLICK_EVENT,
  MAP_DBLCLICK_EVENT,
  type MapClickDetail,
} from '../../lib/extensions/mapOverlays';
import type { MapExtensionContext } from '../../lib/extensions/mapExtensions';
import {
  PIN_CLICK_EVENT,
  useHomeAdornment,
  usePinAdornment,
  usePinCelebrations,
  type PinClickDetail,
} from '../../lib/extensions/pinAdornment';
import { getParanAnnotation } from '../../lib/extensions/paranAnnotation';
import { HoverTip, TipButton } from '../ui/HoverTip';
import { bindTouchTip, tipPosFor, type TipPos } from '../ui/useHoverTip';
import {
  computeLineBadges,
  computeMinorBadges,
  dodgeBadges,
  placeMinorChips,
  spreadBadges,
  clipSegmentToView,
  type BadgeSize,
  type LineBadge,
  type MinorBadge,
} from './edgeAnchors';
import {
  CHIP_RANK,
  CHIP_SLIDE_CAP,
  ChipOccupancy,
  arcPath,
  arcPoint,
  chipStack,
  pathInRect,
  placeOnPath,
  type ArcPath,
  type AvoidRect,
  type ChipPt,
} from './chipOccupancy';
import {
  estimateParanChip,
  paranChipFace,
  placeParanChips,
  type ParanBadge,
} from './paranChips';
import { GEO_GRID_CHIP, placeGeoGridChips, type GeoGridBadge } from './geoGridLabels';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import { ZodiacGlyph } from '../ZodiacGlyph/ZodiacGlyph';
import { LocalHorizonWheel } from '../LocalHorizonWheel/LocalHorizonWheel';
import type { LineType } from '../../lib/astro/lines';
import { LINE_TYPE_LABEL, OPPOSITE_ANGLE } from '../../lib/astro/lines';
import { PLANET_COLORS, type PlanetName } from '../../lib/ephemeris';
import { useT } from '../../i18n';
import type { EnumLabels } from '../../i18n';
import type { TFn } from '../../i18n';
import { ASPECT_GLYPHS, PLANET_GLYPHS, SIGN_GLYPHS } from '../../lib/astro/glyphChars';
import { CreditsModal } from '../CreditsModal/CreditsModal';
import 'maplibre-gl/dist/maplibre-gl.css';
import './Map.css';

const EMPTY_FC = <T,>(): FeatureCollection<LineString, T> => ({
  type: 'FeatureCollection',
  features: [],
});

// The sources' tile options (LINE_ / PARAN_ / WASH_ / BAND_SOURCE_OPTS) and the Slide rotation
// (translateLng, wrapSpin) live in tiling.ts, where the slide check can tile them as the map does.

// Angle code shown in each line / paran badge: the ONE funnel (lines.ts LINE_TYPE_LABEL),
// not a copy of it, so a badge and the line's own label can't drift apart — AS, MC, DS, IC
// and Vx/Avx, as the wheel reads them (2026-10-02). Covers every line type — a paran's
// body A may sit on the MC/IC or the horizon.
const ANGLE_CODE: Record<LineType, string> = LINE_TYPE_LABEL;

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
  // The "Zoom out" pill (bottom-centre, from CLOSE_ZOOM in). Off this list until 2026-10-02 because
  // it mounts a render after the pass that crosses its zoom, so the cached rects never had it; it
  // has its own trigger now (zoomOutShown, in the component). It mattered once the Local Space
  // labels started keeping off the panels (L84): at close zoom they sit at full radius, which is
  // where the pill rests, and a phone's LS ♅ label was wholly under it — and under its tap.
  '.map-zoom-out',
  // The geodetic zone-shading legend (bottom-right, above the active-systems chip), 2026-10-02.
  '.geo-zone-legend',
];

// While the Capture frame is armed, badges ignore the HUD panels (Capture window, sidebar,
// etc.) and hug the frame edges — with ONE exception: the on-map attribution / credits
// disclosure (bottom-right), which is part of the exported image, so badges still dodge
// it so a label never sits on top of it.
const CAPTURE_AVOID_SELECTORS = ['.maplibregl-ctrl-bottom-right'];

// The markers a reader TAPS are places the line labels step off too — every kind of label, through
// the shared occupancy (chipOccupancy.ts) — so a label never sits on one and takes its tap. On a
// phone a chip is wide enough that a pin dropped near an edge had its head under one, and a tap
// there flew the map to the chip's zenith instead of saving the spot; the Pro hint tells readers to
// tap exactly there. The core's own two (the placed pin and the home marker) are PROJECTED each
// pass from their coordinates (markerRects in computeBadges), so their boxes are current on every
// frame and never caught mid-drop-animation. These are their tap targets around the point, from
// Map.css: each marker box is anchored on its bottom edge 2px below the point (offset [0, 2]) — the
// pin's 38×52 box with its 38×38 icon 15px down, home's 34×46 with a 34×34 icon 13px down. Change
// the CSS geometry and these with it — and the silhouettes in labelCollider.ts, which keep the
// basemap's own names out from under the same two markers.
const PIN_HIT = { hw: 19, up: 35, down: 3 };
const HOME_HIT = { hw: 17, up: 31, down: 3 };
// A marker layer a downstream build draws in the overlay track is read off the DOM instead, on
// every pass the camera is still (overlayMarkersRef in the component), and the labels re-placed
// when the host reports its markers have moved or changed (onOverlayPlaced). `.saved-pin-marker`
// is the Pro saved-pin layer's button, the class the capture path below already names; a ghost is
// its 0.34s exit, not a target.
const OVERLAY_MARKER_SELECTORS = ['.saved-pin-marker:not(.saved-pin-ghost)'];

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

// What a read of rects found, to the pixel — for telling whether markers have moved since the
// labels last stepped off them (onOverlayPlaced) without re-placing the labels to find out.
function rectsKey(rects: readonly AvoidRect[]): string {
  return rects
    .map((r) => `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`)
    .join('|');
}

// A core marker's tap target (PIN_HIT / HOME_HIT) in map-container coordinates, projected from
// where MapLibre itself places it; null when there is no marker or it is round the far side of
// the globe (MapLibre hides it there, so there is nothing to keep clear of).
function markerHitRect(
  map: maplibregl.Map,
  marker: maplibregl.Marker | null,
  hit: { hw: number; up: number; down: number },
): AvoidRect | null {
  if (!marker) return null;
  const ll = marker.getLngLat();
  if (isOccluded(map, ll.lng, ll.lat)) return null;
  const p = map.project(ll);
  return { left: p.x - hit.hw, top: p.y - hit.up, right: p.x + hit.hw, bottom: p.y + hit.down };
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

// Center-anchor a badge at screen (x, y) on the compositor rather than via left/top.
// left/top changes force a layout reflow each frame while panning; a transform is
// handled on the compositor (no reflow), so the labels track the map smoothly. The
// calc()s fold in the -50% / -50% centering (% is of the badge's own size), and a
// non-none transform still makes each badge a stacking context (the LS arrow's
// z-index:-1 relies on that).
//
// What this returns is a pair of CUSTOM PROPERTIES, not the transform itself — the
// stylesheet composes them (Map.css, .acg-badge / .ls-line-deg). Two reasons, both
// load-bearing:
//
//  1. This was the independent `translate` property until 2026-08-23, and
//     html2canvas-pro has no `translate` descriptor at all: it parses `transform`,
//     `transform-origin` and `rotate`, and nothing else. So a badge's position in an
//     export survived only because html2canvas re-measures the CLONED node inside its
//     hidden iframe, where the real engine applies `translate`. Placement was an
//     accident of that iframe laying out identically to the live page; when it did
//     not, the pills separated from their own glyphs — which are re-stamped from the
//     LIVE DOM with fillText and so never moved with them. Naming the offset in a
//     property the rasteriser actually reads removes the coincidence.
//
//  2. The hover lift has to compose the other way round. The individual transform
//     properties build the matrix as translate · rotate · scale · transform, so an
//     inline `transform: translate(...)` left alongside `scale: 1.07` on hover gives
//     S · T — the translation itself gets scaled, and a badge at x≈800px jumps ~56px
//     when you point at it. Letting the stylesheet own the whole `transform`
//     declaration keeps translate-then-scale inside one matrix, as it was.
function badgePos(x: number, y: number): CSSProperties {
  return {
    '--bx': `calc(${x}px - 50%)`,
    '--by': `calc(${y}px - 50%)`,
  } as CSSProperties;
}

// Everything an edge chip's WIDTH depends on, and nothing else — the key its measured size is
// cached under (chipSizesRef), and the chip's `data-bface`. Not the badge key: that is an index
// that shifts as lines come on and off screen, while "Tr ☉ As" is the same 47 px pill wherever
// it is. Mirrors the face the render below draws: prefix (plain and node-pair chips only), glyphs,
// the aspect symbol, and the angle code(s) — for an aspect, its true branch (aspectBranchReading).
function edgeChipFace(b: LineBadge): string {
  const prefix = b.aspect || b.planetB ? '' : b.prefix;
  const code = b.aspect ? (b.branch ?? b.lineType) : b.lineType;
  return `${prefix}|${b.planet}|${b.planetB ?? ''}|${b.aspect ?? ''}|${code}|${b.pair ? 1 : 0}`;
}

// A chip's size before it has ever been drawn (a face not yet in the cache): built up from what
// it holds, calibrated against measured chips (2026-10-01: 31–53 × 15 px; 12 px of padding, an
// 11 px glyph, ~6 px per code letter, ~4.5 per prefix letter, 3 px flex gaps). Within a few px,
// and only for the one placement before the chip is measured and the labels re-placed.
function estimateEdgeChip(b: LineBadge): BadgeSize {
  const angle = b.aspect ? aspectBranchReading(b.aspect, b.branch ?? b.lineType).angle : b.lineType;
  const glyphs = 1 + (b.planetB ? 1 : 0) + (b.aspect ? 1 : 0) + (b.pair ? 1 : 0);
  const codeChars =
    ANGLE_CODE[angle].length + (b.pair ? ANGLE_CODE[OPPOSITE_ANGLE[b.lineType]].length : 0);
  const prefixChars = b.aspect || b.planetB ? 0 : b.prefix.length;
  const items = glyphs + (b.pair ? 2 : 1) + (prefixChars ? 1 : 0) + (b.pair ? 1 : 0);
  const w = 12 + 11 * glyphs + 6 * codeChars + 4.5 * prefixChars + 3 * (items - 1);
  return { hw: w / 2, hh: 7.5 };
}

// A catalog minor body's edge chip (computeMinorBadges, #34), with the words it prints — resolved
// once a pass, where it is placed, so the face its size is cached under and what is drawn agree.
//
// What it prints: the body's mark, its name, its number, and the angle — "◆ Eros (433) MC",
// "⯰ Eris (136199) As", "◇ Zeus (hyp) MC". The default, 2026-10-01, with the house astrologer
// deferring on catalog-body calls as she does (recorded in the seams doc, L85, under the calls an
// expert might revisit):
//  - WORDS, not colour. A planet's chip names its line by glyph and colour; a catalog line's colour
//    is one of twelve picked by number (minorLineColor), so two bodies on one map can share it, and
//    only the chip's text can tell their lines apart.
//  - WITH THE NUMBER, which is the published naming rule, not a choice for this surface: the methods
//    page says a numbered minor planet "is always named with its number", and Help says the same —
//    it is what tells the asteroid Lilith (1181) from Black Moon Lilith, whose chip, "⚸ MC", can sit
//    beside it. So the words are lib/minorBodies/naming's, as on every other surface (a hypothetical
//    point "(hyp)", never a number). Without the number a chip would be some 20–40 px narrower,
//    and would name the asteroid exactly as that rule exists to prevent.
//  - THE MARK every other surface draws (minorMarkText, Lina's ruling of 2026-09-30): the body's own
//    symbol where it has one, else ◆, and ◇ for a hypothetical point — in the chip's text colour,
//    as a planet's glyph is on its chip.
//  - KEPT COMPACT within that: the number in the smaller, lighter type of an overlay tag, so the name
//    reads first; and a name longer than MINOR_CHIP_NAME_MAX cut from its end, keeping the number
//    whole — the Minor bodies window's own rule for a row too narrow (minorDisplayParts). No bundled
//    name or point reaches the cut (the longest, Persephone and Proserpina, are 10); it bounds a
//    catalog body's chip at about the width of an aspect line's.
interface MinorChip extends MinorBadge {
  /** On an overlay's catalog line (the 'minor-lines-ov' source): its fly-to reads the
   *  overlay's coins and keys by its tag, as an overlay planet's chip does. A promoted
   *  line's chip carries the tag too (`prefix`) but is the chart's source, so not this. */
  overlay?: boolean;
  /** The name as the chip prints it, cut to MINOR_CHIP_NAME_MAX ('' for a body known by number only). */
  label: string;
  /** What the label adds to the name: "(433)", "(hyp)" — or, with no name, the whole label. */
  tail: string;
}
const MINOR_CHIP_NAME_MAX = 12;
function minorChipText(b: MinorBadge, t: TFn): { label: string; tail: string } {
  const { before, own, after } = minorDisplayParts(b.n, b.name, t);
  const cps = Array.from(own);
  const cut =
    cps.length > MINOR_CHIP_NAME_MAX ? `${cps.slice(0, MINOR_CHIP_NAME_MAX - 1).join('')}…` : own;
  return { label: `${before}${cut}`.trim(), tail: after.trim() };
}
// Everything its width depends on (edgeChipFace's counterpart). No edge face starts with "◆", and
// no paran face does ("×").
function minorChipFace(b: MinorChip): string {
  return `◆|${b.prefix}|${minorMarkText(b.n).char}|${b.label}|${b.tail}|${b.lineType}`;
}
// Its size before it is first measured, on estimateEdgeChip's padding, gaps and codes, and the
// spans of drawn chips (2026-10-01, twelve bodies, 83–123 × 15 px): the bold 10 px name at up to
// ~5.4 px a character, the 9 px number at ~4.2, the mark 9.5 (◆), 12 (◇) or up to 11 (a symbol).
function estimateMinorChip(b: MinorChip): BadgeSize {
  const { cls } = minorMarkText(b.n);
  const mark = cls === 'minor-mark' ? 9.5 : cls ? 12 : 11;
  const items = 2 + (b.prefix ? 1 : 0) + (b.label ? 1 : 0) + (b.tail ? 1 : 0);
  const w =
    12 +
    mark +
    5.4 * Array.from(b.label).length +
    (b.label ? 4.2 : 5.4) * b.tail.length +
    6 * ANGLE_CODE[b.lineType].length +
    4.5 * b.prefix.length +
    3 * (items - 1);
  return { hw: w / 2, hh: 7.5 };
}

// Stacking value for a Local Space label the occupancy didn't place: the top of its rank
// (chipStack), so it still draws above every less important chip and under every more important
// one — a label with none would draw under all of them. That is the LS-only transparent still,
// which places its labels on its own (computeBadges), and the "Degrees" labels, which share this
// value and come after the pills in the DOM, so they still draw over them, as they always did.
// (The paran chips take theirs from the occupancy since 2026-10-01 — paranChips.ts — and the
// Local Space pills too, everywhere else, since the same day.)
const LS_CHIP_Z = chipStack(CHIP_RANK.localSpace);

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
// How long a capture will wait for `moveend` before giving up and shooting anyway. A
// liveness guard, not a tuning knob: the moveend handler early-returns while the slide
// tool owns the drag, so the event a capture waits on is not always coming.
const CAPTURE_SETTLE_TIMEOUT_MS = 1500;
// …and then for the motion fades to finish. Covers the longer of the two — the edge-badge
// layer's 0.12s (Map.css `.acg-edge-badges.is-moving`) and the horizon dial's 0.2s
// (LocalHorizonWheel.css) — plus a frame's grace. Raise it if either duration grows.
const CAPTURE_FADE_SETTLE_MS = 240;
// …and for the frame's content to finish drawing: the right-to-left text plugin, then every
// visible tile (see captureFrame). Liveness again: a tile request into a network that answers
// nothing never settles, and past this the shot is taken of what is there.
const CAPTURE_CONTENT_TIMEOUT_MS = 5000;

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
// The Local-Space "Circle Mask" in map-container CSS pixels, or null when it isn't up.
//
// ONE definition, because there are two consumers that MUST agree and cannot check each
// other: the live view clips the GL canvas with a CSS clip-path, and captureFrame re-cuts
// the same circle on the 2D composite (ctx.drawImage ignores CSS clipping, so the export
// has to redraw it by hand). Those were two separate expressions of the same formula, read
// at different instants — which is how the circle on screen and the circle in the exported
// PNG drift apart with nothing to attribute it to. The caller supplies the origin it has,
// so the live pass can pass its fresh projection and the export the ref that pass wrote.
function lsMaskCircle(
  origin: { x: number; y: number } | null | undefined,
  zoom: number,
  transparent: boolean,
): { cx: number; cy: number; r: number } | null {
  if (!transparent || !origin || zoom < COMPASS_ZOOM) return null;
  return { cx: origin.x, cy: origin.y, r: maskRadiusAt(zoom) };
}
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
// An LS pill's REAL half-extents, where the Capture pass hasn't measured it — for everything but
// the spacing between two LS labels: keeping the whole pill on screen, and clear of the panels, the
// tapped markers and the other kinds of label (the shared occupancy, which the kinds placed after
// it test against these too). The spread's own figures above are about twice the real pill
// (measured live 2026-10-01: 66–70 × 15 px with a bearing, 30–35 × 15 without) — right for spacing
// a crowded fan, but tested against a marker they'd shove every near-horizontal label off a pin
// it was nowhere near, and against the screen edge they'd hold every label ~30 px short of it.
const LS_PILL_HIT = { out: 36, bare: 18, hh: 8 };
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
  /** Where it stacks among the map's labels (chipStack, from the occupancy); LS_CHIP_Z where the
   *  occupancy didn't place it. */
  z?: number;
}

// Resolve crowding among the LS labels by sliding each one ALONG ITS OWN LINE (its `path`, out from
// the origin), never off it. Only how far along the line a label sits (`rad`, an arc length from the
// origin) changes, so it always sits ON its line — just nearer to or farther from the centre.
// Because the lines fan OUT from the origin, a bundle resolves by staggering radii: when two labels
// overlap, the outer one moves further out and the inner one further in, and since the lines diverge
// that offset clears them — the more labels pile up, the more line they use. A weak pull back toward
// each label's rest (rad0, where its line meets the ring) keeps uncrowded labels on the ring and
// stops the stagger from drifting. Each is bounded to [minRad, maxRad] so a label never piles on the
// origin nor slides off-screen. Writes the resulting screen x/y back onto each item.
//
// The path is the line AS DRAWN since 2026-10-01 — a great circle, which on the map bends away from
// the straight screen ray its bearing starts along, by roughly κr²/2: 25 px at the ring at a world
// view, and 165 px out at 540 px on a desktop at z 2.7. That was a straight ray until then, which was
// near enough while a label stayed by the ring; once a label could be sent out past a window (#28)
// it would have named a line it sat well away from. The LS-only still passes a straight ray through
// its anchor, as it always had: a two-point path.
//
// Those bounds are also what keeps a label off everything that isn't another Local Space label.
// The caller makes [minRad, maxRad] one stretch of the line that is clear of the panels and the
// tapped markers (ChipOccupancy.clearSpans), so nothing in here can push a label under any of them:
// those constraints are hard where the label-vs-label overlap is soft. Until 2026-10-01 the tapped
// markers were tested here instead, on every seat, and the panels not at all (#28).
function spreadLsBadgesRadial(
  items: {
    x: number;
    y: number;
    path: ArcPath;
    rad: number;
    rad0: number;
    minRad: number;
    maxRad: number;
    hw: number;
    hh: number;
  }[],
  iterations: number,
): void {
  const ATTRACT = 0.15; // fraction of the way back to the rest radius reclaimed each pass
  const seat = (it: (typeof items)[number]) => {
    it.rad = Math.min(Math.max(it.rad, it.minRad), it.maxRad);
    const p = arcPoint(it.path, it.rad);
    it.x = p.x;
    it.y = p.y;
  };
  for (const it of items) seat(it);
  for (let iter = 0; iter < iterations; iter++) {
    // Done once a round moves nothing — no pair overlapping and every label at its rest (or held
    // short of it by its bounds) to a hundredth of a px — since every round after would move
    // nothing either. This runs on every frame of a pan; an uncrowded fan is done in one round.
    let still = true;
    for (const it of items) {
      const was = it.rad;
      it.rad += (it.rad0 - it.rad) * ATTRACT;
      seat(it);
      if (Math.abs(it.rad - was) > 0.01) still = false;
    }
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const ox = a.hw + b.hw - Math.abs(b.x - a.x);
        const oy = a.hh + b.hh - Math.abs(b.y - a.y);
        if (ox <= 0 || oy <= 0) continue;
        still = false;
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
    if (still) break;
  }
}

// How far radius r lies from span k of a flat [from, to, …] list (ChipOccupancy.clearSpans): 0
// inside it.
function spanGap(spans: readonly number[], k: number, r: number): number {
  return r < spans[k] ? spans[k] - r : r > spans[k + 1] ? r - spans[k + 1] : 0;
}
// How far along `path` (which starts at the origin c) the line first reaches distance r from c —
// where it meets the ring — or the whole path's length if it leaves the screen before that.
function ringArc(path: ArcPath, c: ChipPt, r: number): number {
  const { pts, cum } = path;
  for (let i = 0; i + 1 < pts.length; i++) {
    const fx = pts[i].x - c.x;
    const fy = pts[i].y - c.y;
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const a = dx * dx + dy * dy;
    if (!(a > 0)) continue;
    const k = fx * fx + fy * fy - r * r;
    if (k >= 0) return cum[i];
    const bq = fx * dx + fy * dy;
    const t = (-bq + Math.sqrt(bq * bq - a * k)) / a;
    if (t <= 1) return cum[i] + t * Math.sqrt(a);
  }
  return cum[cum.length - 1];
}
// The span nearest radius r (the inner one on a tie), or -1 when there are none.
function nearestSpan(spans: readonly number[], r: number): number {
  let pick = -1;
  let pickD = Infinity;
  for (let k = 0; k < spans.length; k += 2) {
    const d = spanGap(spans, k, r);
    if (d < pickD) {
      pick = k;
      pickD = d;
    }
  }
  return pick;
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
  /** The catalog minor bodies' angle lines beside the overlay's planets — placed by the
   *  overlay's rule, tagged with its prefix — on a source of their own ('minor-lines-ov'),
   *  so a playback tick re-tiles them without touching the chart's catalog lines. Riding
   *  in this bundle, they take every gate the overlay's planet lines take. Absent = none. */
  minorLines?: FeatureCollection<LineString, MinorLineProps> | null;
  /** Their zenith coins, under the overlay's own Zeniths gate (empty otherwise). */
  minorZenith?: FeatureCollection<Point, MinorZenithProps> | null;
  /** Their parans with the overlay's planets (parans.ts MinorParanProps), wherever the
   *  overlay's own parans are drawn and the reader's switch is on; tagged. A source of their
   *  own ('minor-parans-ov'), dashed as the overlay's parans are. Absent = none. */
  minorParans?: FeatureCollection<LineString, MinorParanProps> | null;
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
  // Catalog minor-body lines, on the same terms: the line layer is the geometry, the
  // coin beads along it are not snapped to. Empty source when none are drawn. An
  // overlay's catalog lines are two layers (one per dash pattern), both snapped to.
  'minor-lines-layer',
  'minor-lines-ov-meridian',
  'minor-lines-ov-horizon',
  'parans-layer',
  'parans-ov-layer',
  // The catalog bodies' parans, with the planets' (empty unless their switch is on).
  'minor-parans-layer',
  'minor-parans-ov-layer',
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
// The catalog minor bodies' zenith coins join the same hit-test (see MINOR_ZENITH_LAYER
// below): they hover, name themselves and fly on click like a planet's stamp, but reach
// that path as their own `kind` of hit, never as a PlanetName.
const MINOR_ZENITH_LAYER = 'minor-zenith-layer';
// …and an overlay's catalog coins, the overlay twin, on a source of their own.
const MINOR_ZENITH_OV_LAYER = 'minor-zenith-ov-layer';
const ZENITH_HIT_LAYERS = ['acg-zenith-layer', 'acg-zenith-ov-layer', 'acg-nadir-layer', 'acg-nadir-ov-layer', MINOR_ZENITH_LAYER, MINOR_ZENITH_OV_LAYER] as const;

// Each hit-testable stamp layer → the GeoJSON source its features live in (so a
// hover/click feature-state targets the right source; ids collide across sources).
const ZENITH_SOURCE_BY_LAYER: Record<string, string> = {
  'acg-zenith-layer': 'acg-zenith',
  'acg-zenith-ov-layer': 'acg-zenith-ov',
  'acg-nadir-layer': 'acg-nadir',
  'acg-nadir-ov-layer': 'acg-nadir-ov',
  [MINOR_ZENITH_LAYER]: 'minor-zenith',
  [MINOR_ZENITH_OV_LAYER]: 'minor-zenith-ov',
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
/** The camera-arrival mark: a surveyor's crosshair, deliberately NOT a teardrop —
 *  a second pin-shaped thing on the map would compete with the reading point for
 *  the same meaning. Ticks that stop short of the centre leave the exact spot
 *  unobscured, which is the whole question it answers. */
const ARRIVAL_MARK_SVG =
  '<svg class="arrival-mark-icon" viewBox="0 0 28 28" aria-hidden="true">' +
  '<g stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
  '<line x1="14" y1="1.6" x2="14" y2="6.2"/><line x1="14" y1="21.8" x2="14" y2="26.4"/>' +
  '<line x1="1.6" y1="14" x2="6.2" y2="14"/><line x1="21.8" y1="14" x2="26.4" y2="14"/>' +
  '</g>' +
  '<circle cx="14" cy="14" r="6.4" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
  '<circle cx="14" cy="14" r="2.4" fill="currentColor"/>' +
  '</svg>';
/** The standing home marker. The SAME teardrop as the placed pin and as any
 *  marker layer a downstream build draws — a home IS a place on the map, so it
 *  belongs to the pin family and only its colour and its head separate it. (The
 *  arrival crosshair above goes the other way for the opposite reason: it marks
 *  a camera, not a place.) The house sits exactly where a pin's centre dot and
 *  its optional emblem sit, and `evenodd` cuts the door out of the silhouette —
 *  one filled path, which is also all the capture compositor can redraw. */
const HOME_MARK_SVG =
  '<svg class="map-home-body" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path class="map-home-shape" d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>' +
  '<path class="map-home-glyph" fill-rule="evenodd" ' +
  // Sized to the head, not to the box: the far corner sits ~5.95 from the head's
  // centre (12,10), inside the teardrop's r≈7.1 inner edge, and the glyph's own
  // centre of mass lands on (12,10) — the slot the pin's dot and an adornment's
  // emblem both occupy. Roof, walls and base are one subpath; the door is a
  // second, cut out by fill-rule rather than painted over.
  'd="M12 5.8 16.4 9.6 15 9.6 15 14 9 14 9 9.6 7.6 9.6Z' +
  'M11 11.3 13 11.3 13 14 11 14Z"/>' +
  // A corner badge (lib/extensions/pinAdornment → HomeAdornment), for when a downstream
  // marker layer's own marker stands on this exact coordinate and hands its identity
  // over rather than stacking a second teardrop here. Deliberately NOT the head itself:
  // the house is what says this marker is home, and a badge naming what else is here
  // must not evict it. Centre (18.6, 4.9) puts it 8.34 from the head's centre, just
  // outside the teardrop's ~8 rim — far enough that it clears the roofline (at 7.5 it
  // sat on the roof) and close enough to still read as one marker rather than two.
  // Empty until adorned, which is what .has-badge (Map.css) reveals.
  '<image class="map-home-badge" x="14.4" y="0.7" width="8.4" height="8.4" ' +
  'preserveAspectRatio="xMidYMid slice"/>' +
  '<circle class="map-home-badge-ring" cx="18.6" cy="4.9" r="4.6"/>' +
  '</svg>';

interface ZenithHitBase {
  id: string;
  /** The GeoJSON source the stamp lives in — 'acg-zenith' (natal) or 'acg-zenith-ov'
   *  (overlay) — so its hover feature-state targets the right one (each source keys its
   *  features by planet name via promoteId, so the ids collide across sources). */
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
  lng: number;
  lat: number;
}

// A hit is either a built-in body's stamp (named by PlanetName) or a catalog minor
// body's coin (named by its `mp:<n>` id, with the raw props for its label). Split by
// `kind` so a catalog coin can never reach a PlanetName-keyed table: every consumer
// has to say which one it is handling.
type ZenithHit =
  | (ZenithHitBase & { kind: 'planet'; planet: PlanetName })
  | (ZenithHitBase & { kind: 'minor'; body: string; props: Record<string, unknown> });

function zenithAtPoint(
  map: maplibregl.Map,
  pt: ScreenPt,
  tol: number = ZENITH_HIT_TOLERANCE_PX,
): ZenithHit | null {
  const layers = ZENITH_HIT_LAYERS.filter((id) => map.getLayer(id));
  if (layers.length === 0) return null;
  const t = tol;
  const feats = map.queryRenderedFeatures(
    [
      [pt.x - t, pt.y - t],
      [pt.x + t, pt.y + t],
    ],
    { layers: layers as unknown as string[] },
  );
  // Nearest stamp, not the top-most: a finger-sized box can take in two stamps (a body's
  // natal and overlay zeniths sit close when the overlay is near its natal place).
  const f = nearestFeature(map, pt, feats);
  if (!f || f.id == null || !f.properties || f.geometry.type !== 'Point') {
    return null;
  }
  if (f.layer.id === MINOR_ZENITH_LAYER || f.layer.id === MINOR_ZENITH_OV_LAYER) {
    // The source promotes `body` to the feature id (see 'minor-zenith' in
    // setupCustomLayers), so f.id IS the `mp:<n>` string the hover state keys on. An
    // overlay's coin (or a promoted one, in the chart's source) carries the overlay's tag,
    // which the tip leads with; an overlay coin's fly-to toggle keys by it too.
    const [mlng, mlat] = f.geometry.coordinates as [number, number];
    return {
      kind: 'minor',
      id: String(f.id),
      source: ZENITH_SOURCE_BY_LAYER[f.layer.id],
      overlay: f.layer.id === MINOR_ZENITH_OV_LAYER,
      nadir: false,
      tag: typeof f.properties.tag === 'string' ? f.properties.tag : undefined,
      body: String(f.id),
      props: f.properties,
      lng: mlng,
      lat: mlat,
    };
  }
  const overlay =
    f.layer.id === 'acg-zenith-ov-layer' || f.layer.id === 'acg-nadir-ov-layer';
  const nadir =
    f.layer.id === 'acg-nadir-layer' || f.layer.id === 'acg-nadir-ov-layer';
  const [lng, lat] = f.geometry.coordinates as [number, number];
  return {
    kind: 'planet',
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

function crossAtPoint(
  map: maplibregl.Map,
  pt: ScreenPt,
  tol: number = CROSS_HIT_TOLERANCE_PX,
): CrossHit | null {
  if (!map.getLayer(CROSS_HIT_LAYER)) return null;
  const t = tol;
  const feats = map.queryRenderedFeatures(
    [
      [pt.x - t, pt.y - t],
      [pt.x + t, pt.y + t],
    ],
    { layers: [CROSS_HIT_LAYER] },
  );
  const f = nearestFeature(map, pt, feats);
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
// Also the set whose click opens an interpretation card (handleClick → lineAtPoint →
// the lineCard builder), so a layer listed here is clickable too.
const LINE_HIT_LAYERS = [
  'star-lines-layer',
  // Catalog minor bodies: named "Eros (433) MC" on hover, and carded on click — an
  // overlay's ("Tr Eros (433) MC") too, by its two dash layers.
  'minor-lines-layer',
  'minor-lines-ov-meridian',
  'minor-lines-ov-horizon',
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
  // A catalog body × planet paran: "Eros (433) MC × Saturn AS" on hover, carded on click —
  // never through the 'parans' branches, which read planetA/planetB (its layer name is
  // chosen not to start with 'parans' for exactly that).
  'minor-parans-layer',
  'minor-parans-ov-layer',
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

// A fingertip is not a cursor. The reaches above are sized for a mouse, which lands where
// it's aimed; a tap lands somewhere under a pad about 7–10 mm across, and the browser
// reports one point of it. A paran line is drawn 0.7 px wide, so at 3 px a tap had to fall
// inside a target about 6.7 CSS px tall — and a miss doesn't just do nothing, it closes
// whatever card was open. So a touch layout reaches further. Lines get the most help
// (they're hairlines); the stamps and dots less, because they already have a body to hit
// and widening them further would let them swallow taps meant for the line they sit on.
// On a touch layout every "hover" is itself a tap (the browser's compatibility mousemove
// just before the click), so the move handler takes the same reach as the click — the tip
// a tap raises and the card it opens can't then name two different lines.
const TAP_LINE_TOLERANCE_PX = 11;
const TAP_ZENITH_TOLERANCE_PX = 8;
const TAP_CROSS_TOLERANCE_PX = 10;

/** The hit-test reach per target kind, for a mouse or for a finger. */
function hitReach(touch: boolean): { line: number; zenith: number; cross: number } {
  return touch
    ? { line: TAP_LINE_TOLERANCE_PX, zenith: TAP_ZENITH_TOLERANCE_PX, cross: TAP_CROSS_TOLERANCE_PX }
    : { line: LINE_HIT_TOLERANCE_PX, zenith: ZENITH_HIT_TOLERANCE_PX, cross: CROSS_HIT_TOLERANCE_PX };
}

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
  if (layerId.startsWith('acg-lines') || layerId.startsWith('minor-lines')) {
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
  } else if (layerId.startsWith('minor-lines')) {
    // Catalog minor body: its mark (own symbol, else the shared diamond — as its map
    // coin draws it) in the line colour, then "Eros (433)" and the angle, like the
    // planet rows. Named by number + name, never through props.planet (it has none).
    // An overlay's (or a promoted) line leads with its tag, as the planets' do.
    row =
      pre +
      minorMarkHtml(props, 'cross-tip-glyph') +
      `${minorNameHtml(props, t)} ${tagHtml(ANGLE_CODE[props.lineType as LineType])}`;
  } else if (layerId.startsWith('minor-parans')) {
    // A catalog body × built-in body paran, in side order (`side` 'A': the catalog body holds
    // angleA): the body's mark and name on its angle, the partner's glyph and name on the
    // other — the planet paran row's shape, with the catalog side named as its lines are.
    const partner = props.partner as PlanetName;
    const own = minorMarkHtml(props, 'cross-tip-glyph') + minorNameHtml(props, t);
    const other = glyphHtml(partner, PLANET_COLORS[partner]) + labels.planet(partner);
    const [first, second] = props.side === 'A' ? [own, other] : [other, own];
    // The tag leads both sides, as on the planet rows: both bodies are the overlay's.
    row =
      pre +
      `${first} ${tagHtml(ANGLE_CODE[props.angleA as LineType])}` +
      `<span class="cross-tip-x">×</span>` +
      pre +
      `${second} ${tagHtml(ANGLE_CODE[props.angleB as LineType])}`;
  } else if (layerId.startsWith('local-space')) {
    const planet = props.planet as PlanetName;
    row = tagHtml('LS') + glyphHtml(planet, props.color as string) + labels.planet(planet);
  } else if (layerId.startsWith('parans')) {
    const pa = props.planetA as PlanetName;
    const pb = props.planetB as PlanetName;
    // The tag leads BOTH bodies, as on the chip: an overlay's paran pairs two of its own.
    row =
      pre +
      glyphHtml(pa, PLANET_COLORS[pa]) +
      `${labels.planet(pa)} ${tagHtml(ANGLE_CODE[props.angleA as LineType])}` +
      `<span class="cross-tip-x">×</span>` +
      pre +
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
  // past the line's crest the AS/DS reading flips (see POLAR_LAT).
  const polar =
    Math.abs(hoverLatDeg) > POLAR_LAT && isHorizonLine(layerId, props)
      ? `<span class="ui-tip-sub">${t('map.polarNote')}</span>`
      : '';
  return `<div class="ui-tip"><span class="cross-tip-row">${row}</span>${polar}</div>`;
}

// A clickable line collection, as the closest-approach row needs it: the full geometry, and
// the properties that let a clicked feature be found again (see sameFeatureProps). Minimal
// and structural, so every family's collection fits without naming its prop type.
type ClickableLineFC = { features: { geometry: LineString; properties: unknown }[] };

// Whether a source feature is the one a hit-test handed back. The click needs the clicked
// line's FULL geometry for its closest-approach row, and the rendered feature can't supply
// it: queryRenderedFeatures returns the geometry cut to its tile. Rendered properties are
// the source's own values passed through the tiler — primitives verbatim (doubles stay
// doubles), objects re-encoded as JSON strings, nulls dropped — so the test is that every
// primitive the source feature carries comes back unchanged. That names one line: the
// generators already give each line a distinct primitive identity, because the hover tip
// and the edge badge needed one (planet + angle + tag, an aspect branch's targetLng, a
// paran's pairing and latitude). A line cut into pieces (at the antimeridian, or where a
// horizon curve breaks) matches on every piece, which is right: the row is about the LINE.
function sameFeatureProps(source: unknown, rendered: Record<string, unknown>): boolean {
  if (!source || typeof source !== 'object') return false;
  let compared = false;
  for (const [k, v] of Object.entries(source)) {
    if (v === null || v === undefined || typeof v === 'object') continue;
    if (typeof v === 'number' && Number.isNaN(v)) continue;
    if (rendered[k] !== v) return false;
    compared = true;
  }
  if (compared) return true;
  // Nothing to compare — the natal ecliptic's empty bag, the one line in its source. It is
  // the feature whose rendered twin carries nothing either.
  return !Object.values(rendered).some((v) => v !== null && v !== undefined);
}

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

// nearestApproachKm over any GeoJSON geometry a hit-test can return: a rendered line can
// come back as a MultiLineString (a feature split across a tile seam), a stamp as a Point.
// Points are measured as points, rings as closed lines. Infinity for anything unmeasurable,
// which the rankers below read as "keep the stacking order".
function distToGeometryKm(lat: number, lng: number, g: Geometry | null | undefined): number {
  if (!g) return Infinity;
  const line = (coordinates: number[][]): number =>
    coordinates.length ? nearestApproachKm(lat, lng, { type: 'LineString', coordinates }) : Infinity;
  switch (g.type) {
    case 'Point':
      return line([g.coordinates]);
    case 'MultiPoint':
      return Math.min(Infinity, ...g.coordinates.map((c) => line([c])));
    case 'LineString':
      return line(g.coordinates);
    case 'MultiLineString':
      return Math.min(Infinity, ...g.coordinates.map(line));
    case 'Polygon':
      return Math.min(Infinity, ...g.coordinates.map(line));
    case 'MultiPolygon':
      return Math.min(Infinity, ...g.coordinates.flat().map(line));
    case 'GeometryCollection':
      return Math.min(Infinity, ...g.geometries.map((c) => distToGeometryKm(lat, lng, c)));
    default:
      return Infinity;
  }
}

// The candidate nearest the pointer, among everything a hit box returned. queryRenderedFeatures
// orders by STACKING (top-most first), which is the wrong question once the box is wider than
// the gap between two lines: an ACG line drawn over a paran won the tap even when the finger
// was squarely on the paran. Measured on the sphere from the pointer's own coordinate — at
// this range that ranks exactly as screen distance does (both projections are conformal
// locally), and unlike projecting the feature back to the screen it can't be fooled by a
// world copy on the flat map. Ties, and anything unmeasurable, keep the stacking order.
function nearestFeature<F extends maplibregl.MapGeoJSONFeature>(
  map: maplibregl.Map,
  pt: ScreenPt,
  feats: F[],
): F | undefined {
  if (feats.length < 2) return feats[0];
  const at = map.unproject([pt.x, pt.y]);
  let best = feats[0];
  let bestKm = Infinity;
  for (const f of feats) {
    const km = distToGeometryKm(at.lat, at.lng, f.geometry);
    if (km < bestKm) {
      bestKm = km;
      best = f;
    }
  }
  return best;
}

function lineAtPoint(
  map: maplibregl.Map,
  pt: ScreenPt,
  t: TFn,
  labels: EnumLabels,
  tol: number = LINE_HIT_TOLERANCE_PX,
): { id: string; html: string; layerId: string; source: string; props: Record<string, unknown> } | null {
  const layers = LINE_HIT_LAYERS.filter((l) => map.getLayer(l));
  if (!layers.length) return null;
  const feats = map.queryRenderedFeatures(
    [
      [pt.x - tol, pt.y - tol],
      [pt.x + tol, pt.y + tol],
    ],
    { layers },
  );
  // Nearest first, so a tap names the line under the finger rather than the top-most line
  // in the box — hover and click both come through here, so the tip and the card agree.
  const f = nearestFeature(map, pt, feats);
  if (!f || !f.properties) return null;
  const hoverLat = map.unproject([pt.x, pt.y]).lat;
  const html = lineLabelHtml(f.layer.id, f.properties, t, labels, hoverLat);
  if (!html) return null;
  // Stable id so the popup HTML is only re-set when the hovered line changes.
  // The polar-zone flag joins it so the caveat appears/disappears as the hover
  // crosses the polar circle along one line.
  const polarKey = Math.abs(hoverLat) > POLAR_LAT ? 'p' : '';
  const pr = f.properties;
  return {
    // targetLng joins the id so the popup re-renders when the hover moves between
    // an aspect's two same-label branches (e.g. the two square-MC meridians an
    // in-mundo aspect draws), which share label/planet but sit at different points.
    // The bodies and angles join it because a label does not always name the line: an
    // overlay's planet and paran lines carry the overlay's tag AS their label (tagLabels),
    // so every one in a layer had one id — a tip moved straight from one to the next kept
    // the first's text, and a card open on one silenced the tips of all the others.
    id: [
      f.layer.id,
      pr.label ?? '',
      // A catalog feature names its body here (and a catalog paran its partner): two
      // catalog bodies can share a name.
      pr.body ?? '',
      pr.planet ?? pr.planetA ?? pr.partner ?? '',
      pr.planetB ?? '',
      pr.lineType ?? pr.angleA ?? '',
      pr.angleB ?? '',
      pr.targetLng ?? '',
      polarKey,
    ].join('|'),
    html,
    layerId: f.layer.id,
    // The GeoJSON source the line was drawn from — what the click's distance row looks the
    // line's FULL geometry up by (the rendered geometry is cut to its tile).
    source: f.source,
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

/** The geodetic grid's hover readout for one point (the host's geoReadout prop): the angles
 *  from geoReadoutAngles, and the nearest city's own name, or null over open ground. */
export type GeoReadout = GeoReadoutAngles & { place: string | null };

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
  /** Catalog minor-body angle lines (lib/astro/minorLines) — a family of their own,
   *  never mixed into `lines`: their features carry no `planet`, so nothing here that
   *  reads one (edge badges, crossings, orb bands) can meet them. Empty/absent when
   *  no catalog body is drawn. */
  minorLines?: FeatureCollection<LineString, MinorLineProps> | null;
  /** Their zenith coins, on each body's MC line at latitude = declination. The host
   *  passes them under the same gates as `zenith` (empty otherwise). */
  minorZenith?: FeatureCollection<Point, MinorZenithProps> | null;
  /** Their parans with the built-in bodies (parans.ts MinorParanProps) — the reader's own
   *  switch, off by default — on a source of their own ('minor-parans'), drawn just beneath
   *  the planets' parans. Never mixed into `parans`: a row carries no planetA/planetB, and
   *  everything that reads those (the paran hover tip, card and annotation, all keyed on a
   *  layer id starting 'parans') would misread one. Empty/absent when none. */
  minorParans?: FeatureCollection<LineString, MinorParanProps> | null;
  /** Night-side wash (Filters ▸ Night Shading); empty when off. */
  nightShade?: FeatureCollection<Polygon, NightShadeProps> | null;
  /** The geodetic grid (lib/astro/geodeticGrid): the twelve MC meridians and the twelve
   *  Ascendant curves. Module-constant collections (geoGrid()), so they tile once; the host
   *  passes them only on a geodetic map with that layer on, and an empty collection otherwise.
   *  Their features carry no `planet`, and their layers are on no hit or snap list. */
  geoGridMc?: FeatureCollection<LineString, GeoGridLineProps> | null;
  geoGridAsc?: FeatureCollection<LineString, GeoGridLineProps> | null;
  /** The MC zone fills (Zone shading); empty while it is off. */
  geoZones?: FeatureCollection<Polygon, GeoZoneProps> | null;
  /** The twelve Ascendant zones (geoAscZones): never filled, except the one under the cursor —
   *  the zone of the readout's own AS sign, lit by feature-state while the cursor is over it.
   *  A module constant once built, so it tiles once; the host passes it while the readout is
   *  up, whether or not Zone shading is on, and an empty collection otherwise. */
  geoAscZones?: GeoAscZones | null;
  /** On a geodetic map, a chart with no birth time: the span each fast body's line can occupy
   *  across the unknown time of day, filled in the body's own colour (the Moon's and
   *  Mercury's; lib/astro/uncertaintyBands). The layer reads only each feature's colour and
   *  opacity. Drawn above the zone fills and beneath every line. Empty/absent otherwise. */
  uncertaintyBands?: FeatureCollection<Polygon, UncertaintyBandProps> | null;
  /** The grid's hover readout for a point: the place's geodetic AS and MC, and its name.
   *  Null when no grid layer is on. Read through a ref inside the hover handler, so it may
   *  change freely. Always called with a canonical longitude (−180…180], whichever world copy
   *  the cursor is over — so a host's own lookups (the nearest city) need no folding. */
  geoReadout?: ((lat: number, lng: number) => GeoReadout | null) | null;
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
   *  eclipse card is armed (eclipses mode owns clicks there). `extra` is a plain-text
   *  line the map computed for the clicked POSITION — today a paran's registered
   *  annotation (lib/extensions/paranAnnotation) — for the builder to set as a sub-line
   *  (buildLineCard's `extra`); null when there is none. */
  lineCard?:
    | ((
        layerId: string,
        props: Record<string, unknown>,
        dist: LineCardDistance | null,
        extra: string | null,
      ) => string | null)
    | null;
  pin?: { lat: number; lng: number } | null;
  pinType?: 'custom' | 'natal' | 'home' | null;
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
  /** Index into `frameCaptionLines` of a field that stays whole when a caption line still
   *  overflows at two lines: another field on its line gives way first, and it ellipsizes
   *  only if it is alone there. The host names its figures here — a latitude cut short
   *  reads as a different place, where a place name cut short still names the place.
   *  Absent (or out of range): the widest field on the line gives way, whatever it is. */
  frameCaptionKeep?: number | null;
  /** Drop the caption band + watermark from the frame (and its reserved height): a caption-free
   *  export. Set only by the gated Transparent (Local Space) mode for a clean see-through PNG;
   *  the watermark is otherwise the mandatory AGPL-7(b) attribution, so this stays gated. */
  noCaption?: boolean;
  /** Optional "Details" overlay drawn inside the frame — the position LIST or the chart
   *  WHEEL (+ balance grid), docked left for landscape, top for square/portrait. Null = no
   *  panel (and no inset). */
  frameExtras?: CaptureFrameExtras | null;
  /** What the frame is a picture OF. 'map' — the framed map, with frameExtras as an
   *  optional docked annotation. 'chart' — the details alone, filling the frame as a card
   *  over an opaque backdrop; the basemap and everything projected onto it stand down. */
  frameSubject?: 'map' | 'chart';
  /** Whether the balance grid is switched ON — which shares the wheel's box, so the fit
   *  below has to reserve its room. Taken from the TOGGLE rather than read off
   *  `frameExtras`, deliberately: the fit decides whether the wheel view is offered at all,
   *  so if it also depended on which view is currently drawn, declining the wheel would
   *  remove the grid, which would make the wheel fit, which would offer it again — a loop
   *  with no fixed point. The toggle is the same either way. */
  frameWheelGrid?: boolean;
  /** How much room the frame can actually give the details, recomputed with the frame box.
   *  `wheelPx` is the diameter the wheel will be drawn at; `canWheel` is false when that
   *  came out too small to read, so the tool can decline the view before it produces an
   *  unreadable file; `clipped` is the panel's own measurement of overflowing content —
   *  the backstop behind the arithmetic. Must be STABLE. */
  onFrameFit?: (fit: { wheelPx: number; canWheel: boolean; clipped: boolean }) => void;
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
  /** Whether an aspect or midpoint edge chip flies to its "overhead" target — the spot where
   *  its computed degree stands at the zenith at the chart minute. Default true. False on a
   *  geodetic map (lib/skyHold), which holds the sky's turning: there those chips are plain
   *  labels, as planet chips already are once the zenith stamps are empty. (2026-10-02) */
  overheadTargets?: boolean;
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
  /** Where the last camera jump was AIMED, marked so the arrival is attributable.
   *  A jump to a settlement needs nothing — the basemap has already drawn and named
   *  it — but a jump to a bare coordinate lands on tiles that name nothing, and the
   *  destination isn't even at screen centre (see `flyWithSidebarOffset`). Hosts
   *  pass this only for precise points; `label` names the spot on a chip that fades
   *  once you've read it, leaving the mark itself. `stamp` is a monotonic counter,
   *  not a dedupe key: re-picking the SAME point must replay the ping, so the
   *  markup is rebuilt whenever it changes. Null clears the mark. */
  arrivalMark?: { lat: number; lng: number; label?: string; stamp: number } | null;
  /** Fired when the MAP ITSELF sends the camera somewhere (a paran or local-space
   *  label click) rather than the app driving it. The host uses it to retire
   *  view state tied to where the camera last was — {@link arrivalMark} above.
   *  Not fired for the user's own pan or zoom, which move the view without
   *  choosing a new subject for it. */
  onCameraJump?: () => void;
  /** The viewer clicked the arrival mark itself. Map only reports the gesture and
   *  the point it happened on — what a click MEANS is the host's to decide (the
   *  app adopts it as the placed pin). The coordinate is read live off the marker
   *  rather than closed over, so a render the listener never saw can't send a
   *  stale one. Omit it and the mark stays a passive crosshair. */
  onArrivalClick?: (lat: number, lng: number) => void;
  /** The active chart's HOME place, drawn as a standing marker for as long as it
   *  is set. Unlike {@link arrivalMark} this answers a question nobody had to ask
   *  — where this chart lives is true whether or not you just flew there — so it
   *  neither pings nor expires. `label` names the place in its hover tip; hosts
   *  that mask personal detail pass an already-masked string (Map never sees the
   *  raw one). Null while unset, and null while the placed PIN sits on the same
   *  spot: the pin takes the identity over there (`pinType: 'home'`) rather than
   *  stacking two teardrops on one coordinate. */
  home?: { lat: number; lng: number; label?: string } | null;
  /** The viewer clicked the home marker. Like {@link onArrivalClick}, Map reports
   *  the gesture and the point and leaves the meaning to the host. Withdraw it
   *  (rather than ignoring the call) whenever another gesture owns map clicks —
   *  the marker then drops its pointer events with its affordance. */
  onHomeClick?: (lat: number, lng: number) => void;
}

interface MapData {
  lines: FeatureCollection<LineString, LineProps>;
  angleLines: FeatureCollection<LineString, AngleOverlayLineProps>;
  parans: FeatureCollection<LineString, ParanProps>;
  orbBands?: FeatureCollection<Polygon, OrbBandProps> | null;
  starLines?: FeatureCollection<LineString, StarLineProps> | null;
  minorLines?: FeatureCollection<LineString, MinorLineProps> | null;
  minorZenith?: FeatureCollection<Point, MinorZenithProps> | null;
  minorParans?: FeatureCollection<LineString, MinorParanProps> | null;
  nightShade?: FeatureCollection<Polygon, NightShadeProps> | null;
  geoGridMc?: FeatureCollection<LineString, GeoGridLineProps> | null;
  geoGridAsc?: FeatureCollection<LineString, GeoGridLineProps> | null;
  geoZones?: FeatureCollection<Polygon, GeoZoneProps> | null;
  geoAscZones?: GeoAscZones | null;
  uncertaintyBands?: FeatureCollection<Polygon, UncertaintyBandProps> | null;
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
  opacity = 1,
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
      // Only an overlay's catalog arrows are softened (see 'minor-lines-ov'); every other
      // arrow layer keeps the paint it always had.
      ...(opacity !== 1 ? { 'text-opacity': opacity } : {}),
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
// connection — or one that answers nothing, which navigator.onLine can't see (basemapFallback.ts) —
// the map is on a self-contained style (a plain ocean) and draws the bundled coarse world outline
// (Natural Earth 1:110m — the same data the offline country lookup already ships and precaches) on
// top, so continents + borders still show beneath the chart lines.
const WF_SOURCE = WORLD_FALLBACK_SOURCE;
const WF_FILL = 'world-fallback-fill';
const WF_LINE = 'world-fallback-line';

// A style with NO external sources/sprite, so it loads with zero network. It keeps the live glyphs
// URL only so chart-line TEXT can reuse the SW-cached font PBFs when present — each with a bounded
// wait, so a network that answers nothing can't hold the chart lines back (basemapFallback.ts);
// the outline's fills/lines need no glyphs, so even a cold cache still shows continents + borders.
function offlineStyle(theme: Theme): StyleSpecification {
  return {
    version: 8,
    glyphs: boundedWait('https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'),
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

// The world outline's module, imported once. It is dynamic-imported, so it stays off the start-up
// path; an offline START finds it in the service worker's precache (a Pro install).
//
// But a connection lost MID-session needs it at the moment the network has gone, and on a session
// that hasn't loaded it yet — the open core and dev have no service worker, and an installed app
// may not have one installed yet — the import then fails (net::ERR_INTERNET_DISCONNECTED): the
// light watch swapped a drawn live basemap for a bare ocean, worse than leaving it (measured
// 2026-10-01). So it is warmed while the network is still there, once the live basemap has drawn
// its first tile and the browser is idle (warmWorldOutline). The cost is small: the 145-byte
// chunk, and the countries data it shares with the hover readout's country lookup (countryOf),
// which a desktop session loads at its first hover anyway. A failed import is let go, so a later
// one can try again.
let worldOutlineModule: Promise<typeof import('../../lib/worldFallback')> | null = null;
function loadWorldOutline(): Promise<typeof import('../../lib/worldFallback')> {
  worldOutlineModule ??= import('../../lib/worldFallback').catch((err: unknown) => {
    worldOutlineModule = null;
    throw err;
  });
  return worldOutlineModule;
}
function warmWorldOutline(): void {
  const go = () => void loadWorldOutline().catch(() => {});
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(go, { timeout: 5000 });
  } else {
    window.setTimeout(go, 2000);
  }
}

// Draw the world outline into the current (offline) style, just above the background so it sits
// BENEATH the chart lines (added by setupCustomLayers before this async load resolves).
async function installWorldFallback(map: maplibregl.Map, theme: Theme): Promise<void> {
  if (!map.getStyle() || map.getLayer(WF_FILL)) return;
  let worldOutline: () => GeoJSON.FeatureCollection;
  try {
    ({ worldOutline } = await loadWorldOutline());
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

// The geodetic grid's layers, bottom to top, each pinned by an explicit `before` rather than by
// where its addLayer sits — so a layer added later can't land between them, or between them
// and the lines (2026-10-02). Everything else in setupCustomLayers stacks by insertion order:
//   - the zone fills sit on the night wash (the two never show together: night shade is held
//     on a geodetic map) and under the body-coloured orb bands;
//   - the Ascendant zone the hover lights, directly over the zone fills so it lifts them too,
//     and under the orb bands like them;
//   - the uncertainty bands (a chart with no birth time: its Moon's and Mercury's) above the
//     zone fills, so a reader zoomed in sees the band in the body's colour, not a lone edge;
//   - the MC meridians and the Ascendant curves above both, and under 'ecliptic-layer', which
//     sits under every line family — so every body line draws over the grid.
// 'ecliptic-layer' must therefore always be added, even where nothing feeds it: it is the
// anchor. The DEV assert at the end of setupCustomLayers says so if it ever isn't, and also if
// any layer on the hover or snap lists — every body line — has come to sit beneath the grid.
const GEO_GRID_STACK = [
  { id: 'geo-zones-layer', before: 'orb-bands-layer' },
  { id: 'geo-asc-zones-layer', before: 'orb-bands-layer' },
  { id: 'uncertainty-bands-layer', before: 'ecliptic-layer' },
  { id: 'geo-grid-mc-layer', before: 'ecliptic-layer' },
  { id: 'geo-grid-asc-layer', before: 'ecliptic-layer' },
] as const;

function setupCustomLayers(
  map: maplibregl.Map,
  haloColor: string,
  measureColor: string,
  zenithFill: string,
  eclipseLabelHalo: { color: string; width: number },
  geoGridStyle: { line: string; opacity: number; width: number; hover: number },
) {
  // Night-side shading (Filters ▸ Night Shading): the very bottom of the
  // custom stack — an environment wash that everything astrological draws over.
  // No tile buffer: see WASH_SOURCE_OPTS (a buffered z0 tile shaded a band twice on the globe).
  map.addSource('night-shade', { type: 'geojson', data: EMPTY_FC(), ...WASH_SOURCE_OPTS });
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
  // (paran latitude bands run fainter than line bands). BAND_SOURCE_OPTS: no
  // simplification, because that source includes the flat paran latitude bands, which
  // simplification would collapse at the antimeridian (see PARAN_SOURCE_OPTS); and no
  // tile buffer, for the night shade's reason (WASH_SOURCE_OPTS).
  map.addSource('orb-bands', { type: 'geojson', data: EMPTY_FC(), ...BAND_SOURCE_OPTS });
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
  // Its two washes (the solar umbral band, the lunar visibility hemisphere) ride a source of
  // their own, `eclipse-fill`, unbuffered like the night shade (WASH_SOURCE_OPTS: a buffered
  // hemisphere at z0 shaded a band of the globe twice); the curves and labels keep the line
  // buffer their joins need. pushData splits the one collection the App hands over
  // (splitEclipse). No buffer means a fill edge on every tile edge, so neither wash draws the
  // antialiased outline — the band has its limit lines over that edge anyway, and the
  // hemisphere is too faint for its edge to show stepping.
  map.addSource('eclipse-fill', { type: 'geojson', data: EMPTY_FC(), ...WASH_SOURCE_OPTS });
  map.addSource('eclipse', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
  map.addLayer({
    id: 'eclipse-band-fill',
    source: 'eclipse-fill',
    type: 'fill',
    filter: ['==', ['get', 'kind'], 'band'],
    paint: {
      'fill-color': ['get', 'color'],
      'fill-opacity': 0.16,
      'fill-antialias': false,
    },
  });
  // The Moon-above-horizon hemisphere at a lunar eclipse's maximum — a wash
  // even fainter than the umbral band (it spans half the planet).
  map.addLayer({
    id: 'eclipse-lunar-vis-fill',
    source: 'eclipse-fill',
    type: 'fill',
    filter: ['==', ['get', 'kind'], 'lunar-vis'],
    paint: {
      'fill-color': ['get', 'color'],
      'fill-opacity': 0.12,
      'fill-antialias': false,
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

  // The catalog bodies' parans with the planets (their own switch in the Minor bodies window):
  // just BENEATH the planets' parans, a step thinner, in the catalog body's own colour — the
  // same subordination their angle lines take beside the planets'. Their own source, because
  // a row carries no planetA/planetB; the layer name must not start with 'parans' (every
  // paran branch here keys on that prefix and reads those props).
  map.addSource('minor-parans', { type: 'geojson', data: EMPTY_FC(), ...PARAN_SOURCE_OPTS });
  map.addLayer({
    id: 'minor-parans-layer',
    source: 'minor-parans',
    type: 'line',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 0.6,
      'line-opacity': 1,
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
  // Paran labels are DOM chips in one column at the centre meridian, the ranked rows that fit
  // (paranChips.ts, drawn in the paran-badge overlay in the Map component), not repeated along the
  // line.

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

  // ── Catalog minor bodies (lib/astro/minorLines): the numbered minor planets picked
  // in the Minor bodies window. A source of their own, never merged into acg-lines —
  // their features carry no `planet`, so the planets' edge badges, the local-space
  // crossings and every other PlanetName-keyed reader of the planets' source can't meet
  // them. (Their own edge chips, since 2026-10-01, read them on purpose: computeMinorBadges.)
  // Stacked above the fixed stars and below the planets, which keep visual priority.
  //
  // SOLID, like the planets' own lines, because that is what they are: a real body's
  // natal angle lines. Dashes are reserved for overlays and dots for the derived
  // families (aspect/midpoint lines, fixed stars), so either would claim the wrong
  // kinship. What sets a catalog line apart is weight — a step thinner on every angle,
  // keeping the planets' order (MC heaviest, then ASC/DSC, then IC, the Vertex axis
  // lightest) — and its coin beaded along it (below).
  map.addSource('minor-lines', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
  map.addLayer({
    id: 'minor-lines-layer',
    source: 'minor-lines',
    type: 'line',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': [
        'case',
        ['==', ['get', 'lineType'], 'MC'],
        1.4,
        ['in', ['get', 'lineType'], ['literal', ['ASC', 'DSC']]],
        1.1,
        ['==', ['get', 'lineType'], 'IC'],
        0.9,
        0.8, // VX / AVX
      ],
      'line-opacity': 1,
    },
  });
  // Rising vs setting, told the way the planets' horizon lines tell it (→ ASC, ← DSC),
  // a size smaller to match the lighter line. Like the planets, catalog lines also name
  // the angle on their edge chip (since 2026-10-01) — but only where a chip is, at the
  // screen's edges, so mid-map these are still what tells the two horizon lines of one
  // body apart short of hovering each.
  addArrowLayer(map, 'minor-lines-arrows-asc', 'minor-lines', lineTypeIs('ASC'), '→', 12);
  addArrowLayer(map, 'minor-lines-arrows-dsc', 'minor-lines', lineTypeIs('DSC'), '←', 12);
  // The body's coin (its own symbol, or the shared diamond, on its palette ring — see
  // glyphImages' minor coins), beaded along each of its lines. This is what makes a
  // catalog line identifiable at a glance: a palette colour alone repeats every twelve
  // bodies, and the edge chip that names it (since 2026-10-01) is only at the screen's
  // edges, and only where it finds room — the least important label, placed last.
  // Spaced far wider than the star sparks (a coin is a label, not a texture) and
  // baked-stamp sprites drawn at 0.4 — ~12px, enough to read the symbol without
  // crowding the line. Upright (viewport
  // rotation) for the same reason as the star sparks, and decorative placement, so a
  // bead never suppresses or collides with anything else. Hit-testing stays on the
  // line layer; the beads are not a target.
  map.addLayer({
    id: 'minor-lines-marks',
    source: 'minor-lines',
    type: 'symbol',
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': 0.4,
      'symbol-placement': 'line',
      'symbol-spacing': 220,
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

  // An overlay's catalog parans, beneath its planets' as the chart's are, on the overlay
  // parans' own dash so a dash pattern keeps meaning one thing on this map.
  map.addSource('minor-parans-ov', { type: 'geojson', data: EMPTY_FC(), ...PARAN_SOURCE_OPTS });
  map.addLayer({
    id: 'minor-parans-ov-layer',
    source: 'minor-parans-ov',
    type: 'line',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 0.6,
      'line-opacity': 1,
      'line-dasharray': [2, 3],
    },
  });
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
  // Overlay paran labels are the same DOM chips (paranChips.ts), not drawn along the line.

  // ── An overlay's catalog minor bodies: the reader's catalog set placed by the overlay's
  // rule (transits at the target, a direction by its arc, a partner at their moment), on a
  // source of its own so a playback tick never re-tiles the chart's catalog lines. Just
  // under the overlay's planet lines, which keep priority as the chart's planets do over
  // its catalog lines. Told apart from the chart's catalog lines the way every overlay line
  // is told apart from the chart's: dashed, on the overlay planets' own patterns ([3,3] on
  // the meridians, [2,3] on the horizon lines) so a dash pattern means one thing on this
  // map, at the catalog lines' own lighter weights, with their arrows and coin beads
  // softened to the overlay stamps' 0.85.
  map.addSource('minor-lines-ov', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
  map.addLayer({
    id: 'minor-lines-ov-meridian',
    source: 'minor-lines-ov',
    type: 'line',
    filter: ['in', ['get', 'lineType'], ['literal', ['MC', 'IC']]],
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['case', ['==', ['get', 'lineType'], 'MC'], 1.4, 0.9],
      'line-opacity': 1,
      'line-dasharray': [3, 3],
    },
  });
  map.addLayer({
    id: 'minor-lines-ov-horizon',
    source: 'minor-lines-ov',
    type: 'line',
    filter: ['in', ['get', 'lineType'], ['literal', ['ASC', 'DSC']]],
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 1.1,
      'line-opacity': 1,
      'line-dasharray': [2, 3],
    },
  });
  addArrowLayer(map, 'minor-lines-ov-arrows-asc', 'minor-lines-ov', lineTypeIs('ASC'), '→', 12, 0.85);
  addArrowLayer(map, 'minor-lines-ov-arrows-dsc', 'minor-lines-ov', lineTypeIs('DSC'), '←', 12, 0.85);
  map.addLayer({
    id: 'minor-lines-ov-marks',
    source: 'minor-lines-ov',
    type: 'symbol',
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': 0.4,
      'symbol-placement': 'line',
      'symbol-spacing': 220,
      'icon-rotation-alignment': 'viewport',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-padding': 0,
    },
    paint: {
      'icon-opacity': 0.85,
    },
  });

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

  // ── Catalog minor-body zenith coins: each body's sub-point, on its MC line at
  // latitude = declination, as its baked coin (props.icon) at the planets' stamp size
  // (the coins are baked on the same canvas, disc and ring as the planet stamps, so
  // icon-size 1 is the same on-map size). Added BELOW every planet stamp (overlay and
  // natal, zenith and nadir, all added after this), so a planet wins where the two
  // coincide — the hit-test takes the topmost, so it wins the hover and click too.
  //
  // Interactive like a planet's stamp: it hovers, names itself and flies on click
  // (zenithAtPoint → the `kind: 'minor'` hit). promoteId is what makes the hover state
  // land: GeoJSON feature ids reach the tiles only as integers (a string id like
  // `mp:433` is parsed to NaN on the way and decodes as 0 for every feature), so the
  // `body` property — the same `mp:<n>` string — is promoted to the id instead.
  // Feature-state then keys on it directly, one body per id.
  map.addSource('minor-zenith', {
    type: 'geojson',
    data: EMPTY_FC(),
    ...LINE_SOURCE_OPTS,
    promoteId: 'body',
  });
  // Hover-only bloom behind the coin — the planets' acg-zenith-disc treatment, exactly.
  map.addLayer({
    id: 'minor-zenith-disc',
    source: 'minor-zenith',
    type: 'circle',
    paint: {
      'circle-radius': ['case', ['boolean', ['feature-state', 'hover'], false], 18, 13],
      'circle-radius-transition': { duration: 150, delay: 0 },
      'circle-color': zenithFill,
      'circle-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0],
      'circle-opacity-transition': { duration: 150, delay: 0 },
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2.75, 0],
      'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0],
      'circle-stroke-opacity-transition': { duration: 150, delay: 0 },
    },
  });
  map.addLayer({
    id: MINOR_ZENITH_LAYER,
    source: 'minor-zenith',
    type: 'symbol',
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': 1,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });
  // An overlay's catalog coins: the same coin, a touch softer as the overlay planets'
  // stamps are (0.85), and like them beneath every planet stamp. Interactive on the same
  // terms (zenithAtPoint's `kind: 'minor'` hit, overlay true), promoting `body` for the
  // same reason. Beneath the chart's own coins, so the chart's wins where two coincide.
  map.addSource('minor-zenith-ov', {
    type: 'geojson',
    data: EMPTY_FC(),
    ...LINE_SOURCE_OPTS,
    promoteId: 'body',
  });
  map.addLayer(
    {
      id: 'minor-zenith-ov-disc',
      source: 'minor-zenith-ov',
      type: 'circle',
      paint: {
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
    },
    'minor-zenith-disc',
  );
  map.addLayer(
    {
      id: MINOR_ZENITH_OV_LAYER,
      source: 'minor-zenith-ov',
      type: 'symbol',
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-size': 1,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: {
        'icon-opacity': 0.85,
      },
    },
    'minor-zenith-disc',
  );

  // ── Overlay zenith stamps: the same glyph discs as the natal zeniths below, but
  // for the active overlay's bodies. The App feeds this source points only while
  // Overlay ▸ Display ▸ Zenith is on (empty otherwise, so the stamps vanish). Added
  // BEFORE the natal stamps so a natal body stays on top where the two coincide, and
  // drawn a touch softer to read as the derived (dashed-line) layer. Like the natal
  // stamps they hover-grow and fly on click (zenithAtPoint hit-tests this layer too);
  // the click toggle is keyed by the overlay tag, so it's shared with the matching
  // overlay edge label.
  // promoteId: see the natal 'acg-zenith' source below — the same fix, the same reason.
  map.addSource('acg-zenith-ov', {
    type: 'geojson',
    data: EMPTY_FC(),
    ...LINE_SOURCE_OPTS,
    promoteId: 'planet',
  });
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
  map.addSource('acg-nadir-ov', {
    type: 'geojson',
    data: EMPTY_FC(),
    ...LINE_SOURCE_OPTS,
    promoteId: 'planet',
  });
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
  //
  // promoteId makes the hover bloom actually land. The stamps are named by planet, and
  // MapLibre keeps a GeoJSON feature id only when it is a number (or a numeric string):
  // a name like 'Sun' reaches the tiles as 0 for EVERY stamp, so setFeatureState({id:
  // 'Sun'}) matched nothing and the bloom below never showed, on any stamp, while the
  // tooltip and click (which read properties, not the id) worked as if nothing were
  // wrong. Promoting `planet` makes the name the id. One stamp per body per source, so
  // it is unique within each; the four stamp sources (natal/overlay × zenith/nadir)
  // each promote it, and the catalog coins promote `body` the same way.
  map.addSource('acg-zenith', {
    type: 'geojson',
    data: EMPTY_FC(),
    ...LINE_SOURCE_OPTS,
    promoteId: 'planet',
  });
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
  // promoteId: see 'acg-zenith' above.
  map.addSource('acg-nadir', {
    type: 'geojson',
    data: EMPTY_FC(),
    ...LINE_SOURCE_OPTS,
    promoteId: 'planet',
  });
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

  // ── The geodetic grid (lib/astro/geodeticGrid), added LAST and placed by GEO_GRID_STACK's
  // explicit anchors. None of these is on LINE_HIT_LAYERS or SNAP_LINE_LAYERS: a grid line has
  // no tip and no card of its own (the hover readout names the PLACE under the cursor instead),
  // and the measure tool does not snap to it.
  //
  // The zone fills: BAND_SOURCE_OPTS like the orb zones — tolerance 0, because a zone's edges
  // are straight meridians and flat ±90 caps, which simplification would strip to a few
  // vertices and mis-handle at the ±180° seam the Libra and Virgo zones meet on; and no tile
  // buffer, for the night shade's reason (WASH_SOURCE_OPTS). Colour and opacity come with each
  // feature (buildGeoZones), so a theme or the Presentation switch is new data.
  map.addSource('geo-zones', { type: 'geojson', data: EMPTY_FC(), ...BAND_SOURCE_OPTS });
  // The Ascendant zones, tiled like the MC zones: no buffer, and no simplification, so the
  // twelve keep the edges they share and still tile. `zone` (1…12) is promoted to the feature
  // id the hover's feature-state keys on (the readout's own AS sign, in the hover handler).
  map.addSource('geo-asc-zones', {
    type: 'geojson',
    data: EMPTY_FC(),
    ...BAND_SOURCE_OPTS,
    promoteId: 'zone',
  });
  // The uncertainty bands, per-feature like the orb bands and tiled like the zones: a wash, so
  // no buffer, and a band about an MC line has straight meridian edges, so no simplification.
  map.addSource('uncertainty-bands', { type: 'geojson', data: EMPTY_FC(), ...BAND_SOURCE_OPTS });
  // The grid lines tile like the planets' MC lines (LINE_SOURCE_OPTS).
  map.addSource('geo-grid-mc', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
  map.addSource('geo-grid-asc', { type: 'geojson', data: EMPTY_FC(), ...LINE_SOURCE_OPTS });
  const gridLine = {
    'line-color': geoGridStyle.line,
    'line-width': geoGridStyle.width,
    'line-opacity': geoGridStyle.opacity,
  };
  const geoLayers: Record<(typeof GEO_GRID_STACK)[number]['id'], LayerSpecification> = {
    'geo-zones-layer': {
      id: 'geo-zones-layer',
      source: 'geo-zones',
      type: 'fill',
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': ['get', 'opacity'],
        'fill-antialias': false,
      },
    },
    // Unfilled but for the zone under the cursor: the grid's own ink, faint (theme.ts).
    'geo-asc-zones-layer': {
      id: 'geo-asc-zones-layer',
      source: 'geo-asc-zones',
      type: 'fill',
      paint: {
        'fill-color': geoGridStyle.line,
        'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], geoGridStyle.hover, 0],
        'fill-antialias': false,
      },
    },
    'uncertainty-bands-layer': {
      id: 'uncertainty-bands-layer',
      source: 'uncertainty-bands',
      type: 'fill',
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': ['get', 'opacity'],
        'fill-antialias': false,
      },
    },
    'geo-grid-mc-layer': {
      id: 'geo-grid-mc-layer',
      source: 'geo-grid-mc',
      type: 'line',
      paint: gridLine,
    },
    'geo-grid-asc-layer': {
      id: 'geo-grid-asc-layer',
      source: 'geo-grid-asc',
      type: 'line',
      layout: { 'line-join': 'round' },
      paint: gridLine,
    },
  };
  for (const { id, before } of GEO_GRID_STACK) map.addLayer(geoLayers[id], before);
  if (import.meta.env.DEV) {
    const order = map.getLayersOrder();
    const at = (id: string) => order.indexOf(id);
    const want = [
      'night-shade-layer',
      'geo-zones-layer',
      'geo-asc-zones-layer',
      'orb-bands-layer',
      'uncertainty-bands-layer',
      'geo-grid-mc-layer',
      'geo-grid-asc-layer',
      'ecliptic-layer',
    ];
    console.assert(
      want.every((id, i) => at(id) >= 0 && (i === 0 || at(want[i - 1]) < at(id))),
      'geodetic grid layers out of order (GEO_GRID_STACK):',
      want.map((id) => `${id}@${at(id)}`).join(' '),
    );
    // And the property the stack exists for: every body line over the grid. The order above
    // would stay silent for a line family added later and anchored beneath 'ecliptic-layer',
    // so every layer on the hover or snap list that exists by now must sit above the top grid
    // layer.
    const top = at('geo-grid-asc-layer');
    const lineIds = [...new Set([...LINE_HIT_LAYERS, ...SNAP_LINE_LAYERS])].filter((id) => at(id) >= 0);
    const under = lineIds.filter((id) => at(id) < top);
    console.assert(
      lineIds.length > 0 && under.length === 0,
      'body-line layers beneath the geodetic grid:',
      under.join(' ') || '(no line layers found)',
    );
  }
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

// Whether the chart's own sources are mid-update — a setData still tiling — which is when the
// data effect holds a push back, so a burst of changes lands as one. Only the chart's sources are
// asked (basemapStyle.isChartSource, the same split the basemap toggles make): GeoJSON the app adds
// itself, less the offline world outline — GeoJSON too, but ground. Counted, the outline held every
// push back while it tiled (at each new zoom, and after each fallback swap): the basemap wait this
// probe exists to avoid, in a smaller form. The probe this replaced, isStyleLoaded(), also
// reads false while BASEMAP tiles load, so on a slow link any change of chart — and, once the
// first build stopped waiting for `load`, the chart's own first lines whenever they were computed
// after the style landed — waited for every visible tile. Reached through the layers rather than
// getStyle(), which would serialize every chart source's GeoJSON. No style yet reads as busy.
function chartSourcesBusy(map: maplibregl.Map): boolean {
  try {
    const ids = new Set(map.getLayersOrder().map((id) => map.getLayer(id)?.source));
    return [...ids].some(
      (id) => !!id && isChartSource(id, map.getSource(id)?.type) && !map.isSourceLoaded(id),
    );
  } catch {
    return true;
  }
}

// The eclipse overlay's washes and its curves, for their two sources (see the `eclipse-fill`
// source in setupCustomLayers). Memoized per collection, so the identity-based push skip
// (lastPushed) still sees an unchanged eclipse as unchanged — and spinPaint, which re-splits on
// every spin frame, costs nothing extra.
const ECLIPSE_FILL_KINDS: ReadonlySet<unknown> = new Set(['band', 'lunar-vis']);
const eclipseParts = new WeakMap<FeatureCollection, { fills: FeatureCollection; curves: FeatureCollection }>();
function splitEclipse(fc: FeatureCollection | null | undefined): { fills: FeatureCollection; curves: FeatureCollection } {
  if (!fc || fc.features.length === 0) return { fills: EMPTY_DATA, curves: EMPTY_DATA };
  let parts = eclipseParts.get(fc);
  if (!parts) {
    const isFill = (f: Feature) => ECLIPSE_FILL_KINDS.has(f.properties?.kind);
    parts = {
      fills: { type: 'FeatureCollection', features: fc.features.filter(isFill) },
      curves: { type: 'FeatureCollection', features: fc.features.filter((f) => !isFill(f)) },
    };
    eclipseParts.set(fc, parts);
  }
  return parts;
}

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
  // Catalog minor bodies: natal-frame linework, so the LS-only export empties them too.
  pushGated('minor-lines', data.minorLines ?? EMPTY_DATA);
  pushGated('minor-zenith', data.minorZenith ?? EMPTY_DATA);
  pushGated('minor-parans', data.minorParans ?? EMPTY_DATA);
  pushGated('night-shade', data.nightShade ?? EMPTY_DATA);
  // The geodetic grid and the uncertainty bands, gated like every other family so the LS-only
  // export drops them. Deliberately NOT in spinPaint: Slide is held on a geodetic map, and the
  // grid draws only there, so nothing ever spins them. If Slide were ever allowed with the grid
  // up, the grid would stand still while the cage turned — add them there first.
  pushGated('geo-zones', data.geoZones ?? EMPTY_DATA);
  pushGated('geo-asc-zones', data.geoAscZones ?? EMPTY_DATA);
  pushGated('uncertainty-bands', data.uncertaintyBands ?? EMPTY_DATA);
  pushGated('geo-grid-mc', data.geoGridMc ?? EMPTY_DATA);
  pushGated('geo-grid-asc', data.geoGridAsc ?? EMPTY_DATA);
  push('local-space', data.localSpace);
  pushGated('acg-ls-cross', data.localSpaceCross);
  pushGated('acg-zenith', data.zenith);
  pushGated('acg-nadir', data.nadir);
  pushGated('ecliptic', data.ecliptic ?? EMPTY_DATA);
  const eclipse = splitEclipse(data.eclipse);
  pushGated('eclipse', eclipse.curves);
  pushGated('eclipse-fill', eclipse.fills);

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
  // The overlay's catalog lines and coins: overlay linework like the rest, so the LS-only
  // export empties them too. Identity-skipped on their own source, so a change to the
  // chart's catalog lines never re-tiles these, nor a tick these the chart's.
  pushGated('minor-lines-ov', ov?.minorLines ?? EMPTY_DATA);
  pushGated('minor-zenith-ov', ov?.minorZenith ?? EMPTY_DATA);
  pushGated('minor-parans-ov', ov?.minorParans ?? EMPTY_DATA);
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

// The caption text size for a band of one-line height `unit` — Map.css's
// `clamp(10px, unit * 0.42, 19px)` on .capture-caption, restated because the frame
// geometry needs it before anything renders. Change both together.
function captionFontPx(unit: number): number {
  return Math.min(19, Math.max(10, unit * 0.42));
}
// A band carrying more than one caption line, in caption-font ems: each line at the 1.25
// line height `.capture-caption.is-two-line` sets, plus about half an em above and below —
// the one-line band's breathing room, in proportion to its text. Two lines: 3.4em.
const CAPTION_LINE_EM = 1.25;
const CAPTION_BAND_PAD_EM = 0.9;
// The most lines the band grows to. Two is the norm. A THIRD only where two can't hold the
// fields even with every field that may give cut to its floor (CAPTION_FIELD_FLOOR_EM): a
// 4:5 or 1:1 frame on a landscape phone with Coordinates on, 230–260 px wide, where the
// coordinates alone nearly fill a line and the four fields before them can't share the other.
const CAPTION_MAX_LINES = 3;
// Between two caption fields on a line: the App's one-line join ("  ·  ") as it rendered —
// its runs of spaces collapsed to one each side. Non-breaking, because here the separator
// is its own flex item, where ordinary edge spaces would be trimmed away entirely.
const CAPTION_FIELD_SEP = ' · ';
// The least a caption field that gives way keeps, in caption-font ems: a few characters and
// the ellipsis ("12:3…", "Rom…"), so a cut field still shows it was there.
const CAPTION_FIELD_FLOOR_EM = 3;

/** Where a caption of fields `widths` (px, separated by `sep`) breaks into lines — the index of
 *  the first field on each line after the first, empty for one line. A line fits when its
 *  fields and separators come to no more than `room`; it CAN fit when they would with every
 *  field that may give cut to `floor` (the `keep` field gives only alone on its line).
 *
 *  The fewest lines on which nothing is cut, up to two. Failing that, two lines, split where
 *  the least has to be cut in all — if two can fit at all. Only where they can't, three, the
 *  same way (CAPTION_MAX_LINES). And past that, three lines cut as little as they can be,
 *  with the line clipping the rest. Among equal splits the later break wins, line one carrying
 *  the most, as the greedy fill this replaced did. A handful of fields, so every split is
 *  simply tried. */
function chooseCaptionBreaks(
  widths: number[],
  sep: number,
  { room, floor, keep }: { room: number; floor: number; keep: number | null },
): number[] {
  const n = widths.length;
  const line = (a: number, b: number) => {
    let natural = (b - a - 1) * sep;
    let least = natural;
    for (let i = a; i < b; i++) {
      natural += widths[i];
      least += i === keep && b - a > 1 ? widths[i] : Math.min(widths[i], floor);
    }
    return { cut: Math.max(0, natural - room), canFit: least <= room };
  };
  type Split = { brks: number[]; cut: number; canFit: boolean };
  const best = (lines: number): Split | null => {
    let pick: Split | null = null;
    const tryBreaks = (brks: number[]) => {
      const starts = [0, ...brks];
      let cut = 0;
      let canFit = true;
      starts.forEach((a, i) => {
        const l = line(a, starts[i + 1] ?? n);
        cut += l.cut;
        canFit &&= l.canFit;
      });
      // Strictly better, or as good: the later breaks come later in this enumeration.
      if (
        !pick ||
        (canFit && !pick.canFit) ||
        (canFit === pick.canFit && cut <= pick.cut)
      ) {
        pick = { brks, cut, canFit };
      }
    };
    if (lines === 1) tryBreaks([]);
    else if (lines === 2) for (let a = 1; a < n; a++) tryBreaks([a]);
    else for (let a = 1; a < n - 1; a++) for (let b = a + 1; b < n; b++) tryBreaks([a, b]);
    return pick;
  };
  const one = best(1);
  if (!one || one.cut === 0 || n < 2) return [];
  const two = best(2)!;
  if (two.cut === 0 || two.canFit || n < 3 || CAPTION_MAX_LINES < 3) return two.brks;
  const three = best(3)!;
  return three.canFit || three.cut < two.cut ? three.brks : two.brks;
}

// The clear air between the top bars and a portrait phone's capture frame, which sits just
// under them (the frame geometry effect) — the same 8 px the bars leave between themselves.
const FRAME_NAV_GAP = 8;

/** The capture frame's geometry: insets from each host edge, the reserved caption band,
 *  and the box's own dimensions (which the details panel sizes itself against). */
interface CaptureFrameBox {
  l: number;
  t: number;
  r: number;
  b: number;
  /** Caption-band height reserved in the map inset — 0 when no band is drawn. One line's
   *  height (`bandH`) normally; taller when the caption needs more lines. */
  cap: number;
  /** How many caption lines `cap` was sized for: 0 (no band), 1, 2 or (rarely) 3. The band
   *  draws its extra lines only once the geometry has made room for them, so a break that has
   *  been measured but not yet laid out never spills lines out of a shorter band. */
  capLines: number;
  /** The band's ONE-LINE height, whether or not it's drawn (a caption-free export still
   *  places its brand mark as if the band were there). Everything that scales with the
   *  band — the caption and watermark text, the details panel's type — scales off this,
   *  not off `cap`, so a second caption line adds height without enlarging anything. */
  bandH: number;
  boxW: number;
  boxH: number;
}

/* ── Sizing the details wheel ──────────────────────────────────────────────────
 * The wheel is a fixed atom in a clipping box: unlike the position list, which wraps
 * into more columns when it runs out of room, a wheel that doesn't fit is simply cut.
 * So its diameter is chosen against the room the frame actually has in BOTH axes, and
 * when that room can't hold a legible wheel the caller is told so rather than handed a
 * number that will produce a sliced picture.
 *
 * Every input is a property of the frame box, never of the rendered panel — the panel
 * measures itself and insets the map by the result, so reading its size back here would
 * close a measure→resize→measure loop.
 */
/** `.capture-extras` padding (7px 9px), both edges. */
const EXTRAS_PAD_X = 18;
const EXTRAS_PAD_Y = 14;
/** `.capture-extras-fill` padding (12px), both edges — a card breathes wider than a rail. */
const CARD_PAD = 24;
/** The share of the frame a docked panel may occupy on its cross axis. Matches the CSS
 *  cap on the list, so a wheel and a list claim the frame on the same terms. */
const EXTRAS_MAX_FRAC = 0.46;
/* Two floors, because a docked wheel and a card wheel are asked for different things.
 *
 * DOCKED — a note beside the map: planets, angle marks, whatever of the readout ring
 * fits, and nothing else. Near 280px the wheel starts shedding that ring itself to keep
 * the aspect hub its share of the radius (lib/wheelGeometry), and how much it sheds
 * depends on Advanced: a 300px docked wheel gets degree·sign with Advanced OFF and no
 * readout at all with it ON, because the cusp rim is drawn outside the rim and never
 * sheds. 300 is the floor for the wheel being worth exporting at all, not a promise
 * that the ring survives there.
 *
 * CARD — the picture itself, drawn as the sidebar draws it: the aspect web AND, under a
 * running time overlay, a second ring. Those need real diameter, and the wheel names the
 * size: the bi-wheel ring only appears at 420. Below that a card quietly stops drawing
 * things it was asked for — a wheel that has lost its overlay ring without saying so is
 * worse than one the tool declined. 440 clears that mark with room to spare, and sits
 * well above the size at which the wheel volunteers its degree ring unprompted (330).
 *
 * A PHONE card is held to the docked floor instead. Every other frame is a choice — a
 * wider ratio, a bigger window — so it can be held to the standard the wheel sets. A
 * phone frame is already as large as it will ever get, and refusing there would leave
 * nothing where this card is precisely the export that does fit.
 */
const WHEEL_MIN_LEGIBLE = 300;
const WHEEL_MIN_CARD = 440;
/** Ceiling for a DOCKED wheel, so it can't dominate a huge frame — the map is the
 *  subject there. A wheel that IS the subject gets the card ceiling instead. */
const WHEEL_MAX_DOCKED = 460;
/** Ceiling for a card wheel, matching the expanded sidebar's own maximum: past this the
 *  wheel gains no detail, only pixels. */
const WHEEL_MAX_CARD = 900;
/** Room to keep for the balance grid when it's shown. It's a fixed 5-row table sized off
 *  the caption band's one-line height (CaptureBalanceGrid.css: `clamp(8px, unit * 0.34, 12px)`, cells
 *  at `min-height: 1.7em`, 1px gaps, a 1px border and a 6px top margin), so its extent is
 *  DERIVED rather than measured — measuring it would reintroduce the feedback loop above.
 *  Deliberately a shade generous: a crowded cell wraps its glyphs onto a second line, and
 *  over-reserving costs a few pixels of wheel where under-reserving costs the bottom of
 *  the grid. CaptureExtras reports actual overflow, which catches whatever drifts anyway. */
function balanceGridReserve(cap: number, axis: 'row' | 'column'): number {
  const font = Math.min(12, Math.max(8, cap * 0.34));
  return axis === 'column'
    ? Math.round(5 * font * 1.95 + 14)
    // Beside the wheel: a narrow glyph column, then three carrying a spelled-out
    // modality name ("Cardinal") at 0.82em.
    : Math.round(font * 21);
}

/** The wheel diameter a frame can actually carry, and whether that is enough to be worth
 *  drawing. `side` is where the panel sits (a rail, a band, or the whole frame) and
 *  `gridAxis` which way the balance grid stacks — passed in rather than re-derived, so the
 *  arithmetic and the layout can't disagree about where the grid's room comes from.
 *  `phone` relaxes a card back to the docked floor (see the floors above). */
function fitCaptureWheel(
  box: CaptureFrameBox | null,
  side: 'left' | 'top' | 'fill',
  grid: boolean,
  gridAxis: 'row' | 'column',
  phone: boolean,
): { wheelPx: number; canWheel: boolean } {
  const floor = side === 'fill' && !phone ? WHEEL_MIN_CARD : WHEEL_MIN_LEGIBLE;
  // No frame box yet (the first render, before the effect measures): fall back to the
  // historical defaults rather than blocking the view on a transient null.
  if (!box) {
    const px = side === 'fill' ? 560 : side === 'top' ? 420 : 300;
    return { wheelPx: px, canWheel: true };
  }
  const { boxW, boxH, cap } = box;
  // The grid's type scales off the band's ONE-line height (--capture-caption-unit), the
  // room it leaves off the whole band: a two-line caption takes height, not type size.
  const unit = cap > 0 ? box.bandH : 0;
  // The grid takes width when it sits beside the wheel, height when it stacks below.
  const gridW = grid && gridAxis === 'row' ? balanceGridReserve(unit, 'row') : 0;
  const gridH = grid && gridAxis === 'column' ? balanceGridReserve(unit, 'column') : 0;
  let availW: number;
  let availH: number;
  let wanted: number;
  if (side === 'fill') {
    // A card: the wheel takes everything above the caption band. No docked-panel share to
    // respect — the chart IS the picture here.
    availW = boxW - CARD_PAD - gridW;
    availH = boxH - cap - CARD_PAD - gridH;
    wanted = WHEEL_MAX_CARD;
  } else if (side === 'top') {
    // A band across the top: height is the binding constraint. Square/portrait frames dock
    // a roomy band rather than a narrow rail, where the rail's size reads cramped — hence
    // the ~40% enlargement.
    availW = boxW - EXTRAS_PAD_X - gridW;
    availH = boxH * EXTRAS_MAX_FRAC - EXTRAS_PAD_Y;
    wanted = Math.min(WHEEL_MAX_DOCKED, Math.max(280, boxW * 0.28)) * 1.4;
  } else {
    // A rail down the side: width binds. The wheel scales down only HALF as fast as the
    // frame narrows (0.14·boxW + 230 rather than 0.28·boxW), so smaller laptop frames keep
    // the inner degree numbers legible instead of collapsing toward the floor.
    availW = boxW * EXTRAS_MAX_FRAC - EXTRAS_PAD_X;
    availH = boxH - cap - EXTRAS_PAD_Y - gridH;
    wanted = Math.min(WHEEL_MAX_DOCKED, Math.max(280, boxW * 0.14 + 230));
  }
  const wheelPx = Math.floor(Math.min(wanted, availW, availH));
  return { wheelPx: Math.max(0, wheelPx), canWheel: wheelPx >= floor };
}

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

/** Context to attach to a capture warning or failure.
 *
 *  Diagnostics ONLY. Nothing in the render path branches on any of it — this codebase
 *  deliberately carries no user-agent sniffing anywhere near drawing, and a capability
 *  probe is always the better answer (see canShareImageFiles, canExport). It exists
 *  because a capture failure always arrives as a screenshot taken on someone else's
 *  machine, and the things that actually decide what the rasteriser does — the pixel
 *  ratio, the layout viewport, the engine — are exactly what a screenshot cannot show. */
function captureEnv(extra?: Record<string, unknown>): Record<string, unknown> {
  const nav = navigator as Navigator & {
    userAgentData?: { brands?: { brand: string; version: string }[]; platform?: string };
  };
  return {
    engine:
      nav.userAgentData?.brands?.map((b) => `${b.brand} ${b.version}`).join(', ') ??
      navigator.userAgent,
    platform: nav.userAgentData?.platform,
    dpr: window.devicePixelRatio,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    ...extra,
  };
}

/** Can this source still be read back after being drawn?
 *
 *  Canvas TAINT is only observable at READ time: drawing a cross-origin source
 *  succeeds silently, and the SecurityError surfaces much later at toBlob — by
 *  which point the composite is finished and there is nothing left to attribute
 *  it to. That is why a composite whose parts are documented as best-effort has
 *  to probe each foreign source BEFORE it contaminates the destination, rather
 *  than catching a failure afterwards: afterwards is too late to drop the part
 *  that caused it.
 *
 *  Works for a WebGL canvas too, which cannot be probed directly (it already
 *  holds a gl context, so getContext('2d') returns null) — drawing one pixel of
 *  it into a scratch 2D canvas asks the same question. */

function canExport(src: CanvasImageSource): boolean {
  try {
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    const p = probe.getContext('2d');
    if (!p) return false;
    p.drawImage(src, 0, 0, 1, 1);
    p.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

export const Map = forwardRef<MapHandle, MapProps>(function Map({
  lines,
  angleLines,
  parans,
  orbBands,
  starLines,
  minorLines,
  minorZenith,
  minorParans,
  nightShade,
  geoGridMc,
  geoGridAsc,
  geoZones,
  geoAscZones,
  uncertaintyBands,
  geoReadout,
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
  frameCaptionKeep = null,
  frameExtras,
  frameSubject = 'map',
  frameWheelGrid = false,
  onFrameFit,
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
  overheadTargets = true,
  creditsOpen,
  setCreditsOpen,
  skyFollow = 'off',
  skyFollowHeld,
  arrivalMark,
  onCameraJump,
  onArrivalClick,
  home,
  onHomeClick,
}: MapProps, ref) {
  const { t, labels } = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  // The Capture frame wraps the map canvas + its DOM overlays (edge
  // labels, pin, local-horizon wheel); insetting it shrinks the working view, and
  // it's the element `captureFrame` rasterises.
  const frameRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // The frame is a picture of the CHART, not the map — the details fill it as a card and
  // the basemap stands down. Declared up here rather than with the rest of the frame
  // geometry because the pointer-gesture effect below depends on it, and a dependency
  // array is evaluated where it is written.
  const chartSubject = frameSubject === 'chart';
  // A phone frame is as large as it will ever get, which relaxes the card's wheel floor
  // (see fitCaptureWheel) — every other frame can be widened or the window enlarged.
  const capturePhone = usePhone();
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
      setCaptureFailure(null);
      const map = mapRef.current;
      const frameEl = frameRef.current;
      if (!map || !frameEl) {
        setCaptureFailure('no-frame');
        return null;
      }

      // ── Let the camera stop before anything is sampled. ──
      //
      // This function reads the frame at two very different instants: the GL canvas is
      // copied synchronously below, then several awaits later html2canvas clones the DOM
      // overlays. Nothing used to sit between the click and that first copy, and the map
      // stays interactive while the Capture tool is armed — composing the shot IS panning
      // and zooming — so a click landing inside drag inertia, a flyTo, or a wheel-zoom ease
      // produced a basemap from one camera and overlays from another: the local-space rose
      // converging on one point with its compass drawn around another.
      //
      // Motion also drives two FADES. The edge-badge layer takes `.is-moving` (opacity 0,
      // 0.12s) and the horizon dial's opacity is forced to 0 (0.2s) for the duration of any
      // camera move — both baked into the clone at whatever value they hold, which is how a
      // mid-motion capture lost its badge pills while their glyphs, re-stamped from the live
      // DOM afterwards, still printed. So this waits out the transitions too, not just the
      // camera.
      //
      // Only pays when the map is actually moving or has just stopped, which is exactly
      // when the user has moved it and will not notice the beat.
      await new Promise<void>((resolve) => {
        if (!map.isMoving()) return resolve();
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          window.clearTimeout(timer);
          map.off('moveend', finish);
          resolve();
        };
        const timer = window.setTimeout(finish, CAPTURE_SETTLE_TIMEOUT_MS);
        map.on('moveend', finish);
      });
      // ── …and let what the camera shows finish drawing. ──
      //
      // The chart is built when the style arrives, not when the last basemap tile does (a slow
      // link used to hold every line back behind every tile), so the lines can be on screen over
      // a basemap still filling in — and a pan or zoom just before the click leaves new tiles in
      // flight the same way. Shooting then printed lines over bare background. The right-to-left
      // text plugin is the other thing still arriving early in a session: until it registers,
      // Arabic and Hebrew labels are laid out unshaped, and its registration re-tiles every source
      // — so wait for it first, then for the tiles (its re-tile included). One budget for both; a
      // map with everything loaded passes straight through.
      const contentDeadline = Date.now() + CAPTURE_CONTENT_TIMEOUT_MS;
      await Promise.race([
        ensureRtlTextPlugin(),
        new Promise<void>((r) => window.setTimeout(r, CAPTURE_CONTENT_TIMEOUT_MS)),
      ]);
      if (!map.areTilesLoaded()) {
        await new Promise<void>((resolve) => {
          const finish = () => {
            window.clearTimeout(timer);
            map.off('idle', finish);
            resolve();
          };
          const timer = window.setTimeout(finish, Math.max(0, contentDeadline - Date.now()));
          map.on('idle', finish);
        });
      }
      // Two frames: one for React to commit `mapMoving = false` and drop `.is-moving`, one
      // for the badge re-anchor riding the same commit. Then whatever is left of the fades,
      // measured from when the camera actually stopped — so a click landing a few
      // milliseconds after a drag ends waits out the remainder instead of shooting into a
      // half-faded layer.
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      const sinceSettle = Date.now() - lastSettleAtRef.current;
      if (sinceSettle < CAPTURE_FADE_SETTLE_MS) {
        await new Promise<void>((r) => window.setTimeout(r, CAPTURE_FADE_SETTLE_MS - sinceSettle));
      }

      const mapCanvas = map.getCanvas();
      const rect = frameEl.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.max(1, Math.round(rect.width * scale));
      const H = Math.max(1, Math.round(rect.height * scale));
      const out = document.createElement('canvas');
      out.width = W;
      out.height = H;
      const ctx = out.getContext('2d');
      if (!ctx) {
        setCaptureFailure('no-canvas');
        return null;
      }

      // The camera as it stands right now, which is the view the GL canvas below is blitted
      // from. The settle wait above covers motion BEFORE this point; NOTHING covered the gap
      // after it, and that gap is long — two awaited font loads and a dynamic import stand
      // between the blit and the DOM clone. A flyTo landing in there (Transparent mode arms
      // one on its way in) leaves the map from one view and every DOM layer from another:
      // the documented "rose converging on one point with its compass drawn around another",
      // arriving with nothing to attribute it to. Re-read after the overlay pass.
      const cameraSig = () => {
        const c = map.getCenter();
        return [
          c.lng.toFixed(6),
          c.lat.toFixed(6),
          map.getZoom().toFixed(4),
          map.getBearing().toFixed(3),
          map.getPitch().toFixed(3),
        ].join('/');
      };

      // A chart-subject export is a picture of the CARD, not of the map: the card covers
      // the frame, so every map-derived layer below stands down. Skipping them rather than
      // relying on the card to hide them matters for the two that ignore z-order entirely
      // — the glyph and pin re-stamps draw wherever the live DOM says, over anything.
      //
      // The mounted card IS the signal, rather than a mirror of the subject prop. It says
      // precisely what this function needs to know — something opaque is covering the
      // frame — and it can't disagree with what will be drawn. A chart with nothing to
      // wheel (a promoted overlay leaving no coherent chart) mounts no card, and there an
      // export that skipped the map would have produced an empty frame.
      const cardEl = frameEl.querySelector('.capture-extras-fill');
      const chartOnly = !!cardEl;

      // Layers 0 and 1 together: the backdrop fill and the GL blit, both of which read the
      // camera as it is WHEN CALLED. Kept re-runnable rather than left inline because the
      // camera can move across the long async gap before the overlay pass (see cameraSig),
      // and the only honest answer to that is to paint the map again from where it actually
      // is — not to ship a composite whose halves disagree. Returns false when the basemap
      // cannot be exported at all, which aborts the whole capture.
      const paintMapLayer = (): boolean => {
        // 0) Backdrop. In 3D globe mode the "space" void is a CSS background on the map
        //    container (the GL canvas is transparent there), so paint it first or the
        //    export would have a transparent void. In flat 2D the basemap is opaque and
        //    this is a harmless no-op (the container background is unset/transparent).
        //    While the basemap is hidden (Local Space ▸ "Hide map") stand down entirely:
        //    a transparent background IS the export — nothing may pre-fill the bitmap.
        //    (Read off the container class the hideBasemap effect maintains — the same
        //    signal the checkerboard CSS keys on — rather than a reactive prop ref.)
        //    For a chart card the backdrop is the CARD's own colour, read off the live
        //    element: html2canvas paints the card over this anyway, but a failure of that
        //    layer should cost the export its labels, not leave it a transparent hole.
        if (chartOnly) {
          const bg = getComputedStyle(cardEl!).backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, W, H);
          }
        } else if (!containerRef.current?.classList.contains('basemap-hidden')) {
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
        // smearing the whole backbuffer across the frame. A chart card has no map in it at
        // all, which also puts the cross-origin abort below out of its way: a tainted
        // basemap can't stop an export that never touches the basemap.
        if (!chartOnly && mapW > 0 && mapH > 0) {
          // "Mask Lines": clip the map canvas to the same circle the live view uses (origin +
          // ~30%-over-compass radius), so the exported linework is a self-contained compass rose.
          // The DOM overlays below (compass, rim badges) are composited AFTER, unclipped.
          const mask = lsMaskCircle(
            originScreenRef.current,
            map.getZoom(),
            lsTransparentRef.current,
          );
          if (mask) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(
              mapX + mask.cx * scale,
              mapY + mask.cy * scale,
              mask.r * scale,
              0,
              Math.PI * 2,
            );
            ctx.clip();
          }
          if (!canExport(mapCanvas)) {
            console.error(
              '[capture] the basemap canvas cannot be exported (cross-origin content was drawn ' +
                'into it without CORS). Every export path fails on this, not just one — check the ' +
                'active basemap style: its sprite and raster sources must send ' +
                'access-control-allow-origin.',
              captureEnv(),
            );
            setCaptureFailure('taint-basemap');
            return false;
          }
          ctx.drawImage(mapCanvas, mapX - 1, mapY - 1, mapW + 2, mapH + 2);
          if (mask) ctx.restore();
        }
        return true;
      };
      if (!paintMapLayer()) return null;
      const cameraAtBlit = cameraSig();

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
        // Everything this composite draws EXCEPT the layer below measures the live DOM:
        // the GL blit, the wheel raster, the glyph stamps and the pins all read
        // getBoundingClientRect() off this page. html2canvas instead clones the document
        // into a hidden iframe and measures THERE. The export is only right while those two
        // layouts agree, and nothing used to check that they did — so when they didn't
        // (reported on Edge, 2026-08) the badge pills came out away from their own glyphs,
        // which had been stamped from the live DOM and so hadn't moved. Read the live
        // reference now; the clone compares itself against it at the end of onclone, after
        // its own mutations have settled.
        const liveFrameRect = frameEl.getBoundingClientRect();
        // Frame-RELATIVE, so the clone iframe's own viewport offset cancels out and only a
        // real layout difference survives. Any badge does; the first one is as good as any.
        const probeOffset = (probe: Element | null, frame: DOMRect) => {
          if (!probe) return null;
          const r = probe.getBoundingClientRect();
          return { x: r.left - frame.left, y: r.top - frame.top };
        };
        const liveProbe = probeOffset(frameEl.querySelector('.acg-badge'), liveFrameRect);
        // PINNED to an exact version in package.json, here and in the app that vendors this
        // — not a caret range. The two manifests both said ^2.2.0 and resolved differently
        // (2.2.0 in the app that ships, 2.3.9 in this repo), so `dev:core` rasterised with a
        // build no user had and a fault reproduced in one could be absent in the other. The
        // box-shadow compensation in onclone below is calibrated against THIS build's
        // behaviour; re-measure it before moving the pin. So is the filter strip.
        //
        // One html2canvas pass over the frame, run at most twice (see the judging loop after
        // it). `hardened` is the retry: every filter in the clone goes, not only the
        // drop-shadows known to taint — the retry exists for the fault nobody has measured
        // yet, and filters are the class that has already cost an export. The import sits
        // inside so a chunk that failed to load is retried too, and judged like any failure.
        const runOverlay = async (hardened: boolean): Promise<HTMLCanvasElement> => {
          const { default: html2canvas } = await import('html2canvas-pro');
          return html2canvas(frameEl, {
            backgroundColor: null,
            scale,
            useCORS: true,
            logging: false,
            // Pin the clone to THIS viewport. Left unset, html2canvas falls back to its own
            // reading of the window and re-derives the element box inside the iframe — so a
            // media query, a viewport unit or a scrollbar resolving differently there moves
            // this whole layer relative to every live-measured one above. Stating it is the
            // cheap half of the guarantee the assertion at the end of onclone checks.
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            scrollX: window.scrollX,
            scrollY: window.scrollY,
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
              // Pin markers (MapLibre marker SVGs) are RE-DRAWN on the 2D canvas after this
              // pass — keep their whole subtrees out of html2canvas, because a marker in the
              // tree can make the entire overlay pass fail (→ map-only "broken" export). A
              // marker carrying an <image> is a second, sharper reason: html2canvas would have
              // to resolve that href, and a single unresolvable one taints its canvas — which
              // does not surface until toBlob, far too late to attribute. Edge labels stay
              // (they're plain DOM and composite fine).
              // The HOME marker belongs on this list for both reasons and was missing from it
              // until 2026-09-29: drawPin below already redrew it, so it was painted twice, and
              // its drop-shadow filter taints this pass outright (see the filter strip in
              // onclone) — every export with a home place set lost its caption and labels.
              if (
                cl?.contains('map-pin') ||
                el.closest?.('.map-pin') ||
                cl?.contains('map-home-mark') ||
                el.closest?.('.map-home-mark') ||
                cl?.contains('saved-pin-marker') ||
                el.closest?.('.saved-pin-marker') ||
                (cl?.contains('maplibregl-marker') &&
                  !!el.querySelector?.('.map-pin, .saved-pin-marker'))
              )
                return true;
              // The chart WHEEL (Details ▸ Wheel) is colour-styled via CSS vars + the bundled
              // glyph font, neither of which survive html2canvas's SVG-to-image serialisation.
              // It's rasterised separately below (styles inlined) and its glyphs re-stamped, so
              // keep the whole wheel subtree out of this pass.
              if (cl?.contains('wheel-svg') || el.closest?.('.wheel-svg')) return true;
              // The LOCAL-HORIZON dial is deliberately NOT given the same treatment, though
              // it looks like it should be: it is an SVG whose every colour is a CSS custom
              // property, which is the wheel's exact complaint. Excluding it and rasterising
              // it separately was tried on 2026-08-22 and reverted the same day. Its N/E/S/W
              // cardinals and its whole degree scale are HTML <span>s SIBLING to the <svg>
              // (LocalHorizonWheel.tsx), so an exclusion wide enough to catch the wrapper
              // drops them from the export and an svgToImage pass cannot put them back —
              // measured before and after: the labels were there, then they were gone.
              // html2canvas renders this dial acceptably as it stands, because the parts that
              // need the vars resolved are the HTML ones, which it reads via getComputedStyle.
              return false;
            },
            // Mutate only the CLONE (no live flash): drop the viewfinder ring/scrim so
            // they don't bleed in, and make the map container transparent. The container
            // carries an OPAQUE void background in 3D globe mode — left as-is, html2canvas
            // would repaint it over the globe we already drew in step 1. The void colour
            // is preserved by the backdrop fill in step 0.
            onclone: async (cloneDoc: Document, el: HTMLElement) => {
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
              // Element by element: a caption is one or two lines, each a row of fields of
              // which one may ellipsize, and each clipping box is judged on its own live
              // twin (a long place name may truly be cut while everything else fits).
              for (const sel of ['.capture-caption-text', '.capture-caption-field']) {
                const lives = frameEl.querySelectorAll(sel);
                el.querySelectorAll<HTMLElement>(sel).forEach((c, i) => {
                  const live = lives[i];
                  if (!live || live.scrollWidth > live.clientWidth + 1) return;
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
              // html2canvas-pro paints a box-shadow OVER its element instead of behind
              // it, so every badge came out at its own colour times (1 − the shadow's
              // alpha): `.acg-badge`'s `0 1px 3px rgba(0,0,0,0.38)` darkened each pill to
              // 62% of itself, uniformly, on every export. Measured rather than inferred —
              // live (245,184,61) against exported (154,115,38), with the map pixels around
              // it identical, and full colour restored the moment the shadow is dropped
              // here (2026-08-22).
              //
              // Dropping it costs the export a subtle 1px lift; keeping it cost every badge
              // 38% of its brightness, which is what a reader actually notices. If the
              // shadow is ever wanted back, it has to be drawn on the 2D canvas UNDER this
              // whole layer, not left to the clone.
              //
              // Scoped to badges because that is where it was measured. Any other shadowed
              // element inside the frame will have the same fault — to check one, drop its
              // shadow in this block and compare a flat interior pixel before and after.
              el.querySelectorAll<HTMLElement>('.acg-badge').forEach((b) => {
                b.style.setProperty('box-shadow', 'none', 'important');
              });
              // A drop-shadow FILTER is worse than the box-shadow above: it doesn't dim the
              // export, it destroys it. html2canvas-pro's filter translation keeps only
              // lengths, numbers and idents, so `drop-shadow(0 1.5px 1.5px rgba(0,0,0,.5))`
              // reaches the canvas as a drop-shadow with NO colour — and Chrome (measured on
              // 154) taints a canvas drawn under a colourless drop-shadow, whatever is drawn.
              // canExport then refuses this whole layer: caption, watermark, panel background
              // and every badge pill. That was Lina's export of 2026-09-29, via the home marker
              // (excluded above since); the eclipse and arrival marks carry the same filter,
              // and anything that gains one later would do it again. So strip drop-shadow() off
              // every node in the clone, keeping any other filter it carries. The shadow is
              // lost in the export, as the badge box-shadow already is. The retry pass
              // (`hardened`) drops every filter outright.
              const cloneView = cloneDoc.defaultView;
              if (cloneView) {
                const nodes = [el, ...el.querySelectorAll<HTMLElement | SVGElement>('*')];
                for (const n of nodes) {
                  if (hardened) {
                    n.style.setProperty('filter', 'none', 'important');
                    n.style.setProperty('backdrop-filter', 'none', 'important');
                    continue;
                  }
                  const f = cloneView.getComputedStyle(n).filter;
                  if (!f || !f.includes('drop-shadow(')) continue;
                  // One level of nesting is enough: the colour's rgba()/color() is the only
                  // function a drop-shadow argument list holds.
                  const rest = f
                    .replace(/drop-shadow\((?:[^()]|\([^()]*\))*\)/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                  n.style.setProperty('filter', rest || 'none', 'important');
                }
              }
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
              // The font waits before this call resolve against THIS document. The clone is a
              // separate document in its own iframe with its own font set, and text measured
              // against a fallback face is a different width — which, for a badge centred by a
              // percentage of its own size, moves the pill without moving the glyph stamped
              // beside it. Wait for the clone's copies too. html2canvas awaits this callback,
              // so the delay is honoured.
              try {
                await cloneDoc.fonts.load('16px "Noto Sans Symbols"', '☉');
                if (brandFonts?.length) {
                  await Promise.all(brandFonts.map((spec) => cloneDoc.fonts.load(spec)));
                }
                await cloneDoc.fonts.ready;
              } catch {
                /* clone document may not expose the font API — fall through to the check */
              }
              // Does the clone lay out like the live page? Measured LAST, so it reflects the
              // mutations above rather than the state they started from. A warning here is the
              // difference between "the export is broken" and "the clone laid out N pixels off,
              // and here is the environment it happened in".
              const cloneFrameRect = el.getBoundingClientRect();
              if (
                Math.abs(cloneFrameRect.width - liveFrameRect.width) > 1 ||
                Math.abs(cloneFrameRect.height - liveFrameRect.height) > 1
              ) {
                console.warn(
                  '[capture] the cloned frame is a different SIZE from the live one, so this ' +
                    'overlay layer will not line up with the map, the glyph stamps or the pins. ' +
                    `live ${Math.round(liveFrameRect.width)}×${Math.round(liveFrameRect.height)}, ` +
                    `clone ${Math.round(cloneFrameRect.width)}×${Math.round(cloneFrameRect.height)}`,
                  captureEnv(),
                );
              }
              const cloneProbe = probeOffset(el.querySelector('.acg-badge'), cloneFrameRect);
              if (liveProbe && cloneProbe) {
                const dx = cloneProbe.x - liveProbe.x;
                const dy = cloneProbe.y - liveProbe.y;
                if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                  console.warn(
                    '[capture] the first map badge sits somewhere else in the clone than it does ' +
                      'on screen, so its pill will be drawn away from its glyph (which is stamped ' +
                      `from the live DOM). Off by ${dx.toFixed(1)}, ${dy.toFixed(1)} px.`,
                    captureEnv(),
                  );
                }
              }
            },
          });
        };

        // Judge a pass BEFORE anything composites it. html2canvas-pro 2.2.0 can resolve with
        // a dead layer three ways: a 0×0 canvas (the clone root had no box), a tainted one
        // (an unreadable image or paint op — the filter strip in onclone is the measured
        // case, and taint does not throw until toBlob), or a readable canvas with nothing on
        // it (the root failed its visibility test in the clone). Each of them used to ship
        // as a "successful" export with no caption, no badge labels and no panel — worse
        // than no export, because whoever holds it can't tell it is wrong until someone
        // else reads it. So a dead pass is retried once, hardened, and a second dead pass
        // fails the export with a reason instead of handing back half a picture.
        type OverlayFault = 'threw' | 'empty' | 'tainted' | 'blank';
        const faultText: Record<OverlayFault, string> = {
          threw: 'with an error',
          empty: 'empty (0×0: the cloned frame had no box)',
          tainted:
            'tainted (unreadable: a cross-origin image without CORS, or a paint op the ' +
            'browser treats as one, such as a colourless drop-shadow filter)',
          blank: 'blank (readable, but the band that must be opaque holds no ink)',
        };
        const judgeOverlay = (c: HTMLCanvasElement): OverlayFault | null => {
          if (c.width === 0 || c.height === 0) return 'empty';
          if (!canExport(c)) return 'tainted';
          // The blank test needs something that MUST be opaque in a good pass: the caption
          // band (Map.css: "fully opaque so the band reads solidly") or, with no band, the
          // details panel, on the same solid background. Neither → no test: Transparent
          // Local Space draws only translucent ink, where finding none proves nothing.
          const band = ['.capture-caption', '.capture-extras']
            .map((sel) => frameEl.querySelector(sel)?.getBoundingClientRect())
            .find((r) => r && r.width >= 8 && r.height >= 2);
          if (!band) return null;
          // One row across the band's middle, in the pass's own pixels (its size comes
          // from the clone, so scale by it rather than by `scale`), clear of the ends.
          const kx = c.width / liveFrameRect.width;
          const ky = c.height / liveFrameRect.height;
          const x0 = Math.max(0, Math.floor((band.left - liveFrameRect.left + 3) * kx));
          const x1 = Math.min(c.width, Math.ceil((band.right - liveFrameRect.left - 3) * kx));
          const y = Math.round((band.top + band.height / 2 - liveFrameRect.top) * ky);
          if (x1 <= x0 || y < 0 || y >= c.height) return null;
          const row = c.getContext('2d')?.getImageData(x0, y, x1 - x0, 1).data;
          if (!row) return null;
          let opaque = 0;
          for (let i = 3; i < row.length; i += 4) if (row[i] >= 250) opaque++;
          // Half, not all: this catches a DEAD layer, not an imperfect one.
          return opaque < row.length / 8 ? 'blank' : null;
        };
        let overlay: HTMLCanvasElement | null = null;
        for (const hardened of [false, true]) {
          let pass: HTMLCanvasElement | null = null;
          let fault: OverlayFault | null;
          let cause: unknown;
          try {
            pass = await runOverlay(hardened);
            fault = judgeOverlay(pass);
          } catch (e) {
            fault = 'threw';
            cause = e;
          }
          if (!fault) {
            overlay = pass;
            break;
          }
          (hardened ? console.error : console.warn)(
            `[capture] the DOM overlay pass (caption, labels, panel) came back ${faultText[fault]}` +
              (hardened
                ? ' on the hardened retry too — failing the export rather than shipping it without them.'
                : ' — retrying once with every filter removed.'),
            captureEnv({
              attempt: hardened ? 2 : 1,
              overlay: pass ? `${pass.width}×${pass.height}` : null,
              frame: `${W}×${H}`,
              ...(cause !== undefined ? { cause } : {}),
            }),
          );
        }
        if (!overlay) {
          setCaptureFailure('overlay');
          return null;
        }
        // The camera may have moved while the fonts loaded, the chunk arrived and the clone
        // rendered — see cameraSig. The map already on the canvas would then be a different
        // view from everything measured since, so repaint it from where the map actually is
        // rather than composite the mismatch. Only layers 0 and 1 are down at this point, so
        // clearing is safe and exact.
        if (cameraSig() !== cameraAtBlit) {
          console.warn(
            '[capture] the camera moved between the map blit and the overlay pass — ' +
              'repainting the map so the layers agree.',
            captureEnv({ from: cameraAtBlit, to: cameraSig() }),
          );
          ctx.clearRect(0, 0, W, H);
          if (!paintMapLayer()) return null;
        }
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
              // Style-inlining + glyph-stripping live in lib/wheelRaster, shared
              // with the standalone wheel rasteriser — the two subtleties (CSS
              // vars don't survive serialisation, the symbol font isn't loaded
              // in an <img> document) are solved in one place. Placement stays
              // here because only this path composites into a larger frame; the
              // glyphs are re-stamped with the rest of the frame's below.
              const clone = cloneWithInlineStyles(liveWheel as SVGSVGElement);
              // Serialise at the OUTPUT size, not the layout size, and draw 1:1. The clone
              // keeps its viewBox, so widening it scales the whole coordinate system —
              // strokes and label type included — and the drawing is rasterised once, at
              // the resolution it lands at. Decoding at layout size and letting drawImage
              // enlarge it leaves the sharpness to whether the browser re-rasterises an
              // SVG <img> at the destination size, which not all of them do.
              const wheelImg = await svgToImage(clone, wr.width * scale, wr.height * scale);
              if (wheelImg) {
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

        // The line labels' glyphs go down in the order their pills are PAINTED, and none prints
        // over a pill painted after its own. Every label carries a stacking value since
        // 2026-10-01 (chipStack: the more important on top where two still meet), which the
        // pills above already honour, and that order is not the DOM's (the edge chips: natal,
        // overlay, nodes, aspect lines; then the catalog, paran and Local Space chips).
        // Stamped in DOM order over everything, a glyph from the label underneath printed on
        // the pill drawn over it: an aspect line's glyph on a natal chip, an LS glyph on an
        // overlay's. So each is stamped in paint order (z, then DOM order, which is how the
        // layer stacks two equal values) and clipped out of every later pill it meets. Every
        // other glyph (the wheel, the Extras panel) draws over the label layer, which is the
        // frame's first child, and keeps its DOM order after these.
        const labelLayer = frameEl.querySelector('.acg-edge-badges');
        const pills = labelLayer
          ? [...labelLayer.querySelectorAll<HTMLElement>('.acg-badge')].map((el, i) => ({
              el,
              z: parseInt(el.style.zIndex, 10) || 0,
              i,
              r: el.getBoundingClientRect(),
            }))
          : [];
        const pillOf = new globalThis.Map(pills.map((p) => [p.el, p]));
        const painted = (a: (typeof pills)[number], b: (typeof pills)[number]) => a.z - b.z || a.i - b.i;
        const stamps = [...frameEl.querySelectorAll<HTMLElement>('.astro-glyph')].map((g, i) => {
          const el = labelLayer?.contains(g) ? g.closest<HTMLElement>('.acg-badge') : null;
          return { g, i, pill: el ? pillOf.get(el) : undefined };
        });
        stamps.sort((a, b) =>
          a.pill && b.pill
            ? painted(a.pill, b.pill) || a.i - b.i
            : a.pill
              ? -1
              : b.pill
                ? 1
                : a.i - b.i,
        );
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        stamps.forEach(({ g, pill }) => {
          const gr = g.getBoundingClientRect();
          if (gr.width <= 0 || gr.height <= 0) return;
          const char = (g.textContent ?? '').replace(/\uFE0E/g, '');
          if (!char) return;
          // The pills painted over this one that reach its glyph: cut out of the stamp.
          const over = pill
            ? pills.filter(
                (p) =>
                  painted(p, pill) > 0 &&
                  p.r.left < gr.right + 2 &&
                  p.r.right > gr.left - 2 &&
                  p.r.top < gr.bottom + 2 &&
                  p.r.bottom > gr.top - 2,
              )
            : [];
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
          // The geodetic grid's sign glyphs are haloed on screen (.geo-grid-badge's two
          // text-shadows in --geo-halo), and the clone strips that with every glyph's shadow —
          // which lost the dark grid ink on the dark basemap in the PNG. Paint the same two
          // shadows under the stamp, and only the shadows: the glyph goes two canvas-widths off
          // the left edge and its shadow is offset back onto the spot (headless Chrome paints it),
          // so the ink below is laid down once, as on screen. Grid glyphs never sit in a pill,
          // so no clip applies to them. (2026-10-02)
          const gridBadge = g.closest<HTMLElement>('.geo-grid-badge');
          const halo = gridBadge ? getComputedStyle(gridBadge).getPropertyValue('--geo-halo').trim() : '';
          if (halo) {
            ctx.save();
            ctx.shadowColor = halo;
            ctx.shadowOffsetX = 2 * W;
            for (const blur of [2, 1]) {
              ctx.shadowBlur = blur * scale;
              ctx.fillText(char, cx - 2 * W, cy);
            }
            ctx.restore();
          }
          if (!over.length) {
            ctx.fillText(char, cx, cy);
            return;
          }
          // Each clip intersects the last, so the stamp keeps what lies outside all of them.
          ctx.save();
          for (const p of over) {
            ctx.beginPath();
            ctx.rect(0, 0, W, H);
            ctx.rect(
              (p.r.left - frameRect.left) * scale,
              (p.r.top - frameRect.top) * scale,
              p.r.width * scale,
              p.r.height * scale,
            );
            ctx.clip('evenodd');
          }
          ctx.fillText(char, cx, cy);
          ctx.restore();
        });

        // Re-stamp the location pin (kept out of html2canvas above): draw its teardrop at
        // the LIVE marker's screen rect, in the current state colours (gold custom / green
        // natal) read off the live SVG. The animated glow ring is transient decoration, so
        // the still export omits it. Pure 2D ops — can't taint or abort the overlay.
        // The transparent (local-space) export omits the pin entirely: the rose's lines
        // already converge on the origin, and the overlay is meant to sit on someone
        // else's backdrop — a teardrop marker there is clutter, not information.
        // A chart card omits it for a harder reason: the marker is still mounted on the
        // map behind the card, and this stamp draws at its live screen rect — so without
        // the guard a teardrop would land in the middle of the wheel.
        if (!lsTransparentRef.current && !chartOnly) {
          // Same-origin emblem art, loaded once per capture however many pins share a
          // flag. Same-origin, so this cannot taint what the markers themselves might
          // have — which is the whole reason they are drawn here instead of composited.
          // A plain record, not a `new Map()`: `Map` is this component's own name in
          // this file, so the global constructor is shadowed here.
          const emblems: Record<string, Promise<HTMLImageElement | null>> = {};
          const emblem = (url: string): Promise<HTMLImageElement | null> => {
            const hit = emblems[url];
            if (hit) return hit;
            const load = new Promise<HTMLImageElement | null>((resolve) => {
              const img = document.createElement('img');
              img.onload = () => resolve(img);
              img.onerror = () => resolve(null);
              img.src = url;
            });
            emblems[url] = load;
            return load;
          };

          /** One teardrop marker, in its live on-screen state colours. The SVG viewBox is
           *  0 0 24 24 for every pin kind, so one routine draws them all. */
          const drawPin = async (body: Element, shape: Element) => {
            const br = body.getBoundingClientRect();
            if (br.width <= 0 || br.height <= 0) return;
            // In frame, or not drawn at all. The canvas would clip a stray pin anyway,
            // but a marker parked off-viewport by MapLibre still has a rect, and half a
            // teardrop bleeding in from outside the composition is not what was framed.
            if (
              br.right <= frameRect.left ||
              br.left >= frameRect.right ||
              br.bottom <= frameRect.top ||
              br.top >= frameRect.bottom
            )
              return;
            const cs = getComputedStyle(shape);
            const dot = body.querySelector('.map-pin-dot, .saved-pin-dot');
            const flag = body.querySelector<SVGImageElement>('.saved-pin-flag');
            const ring = body.querySelector('.saved-pin-flag-ring');
            // The home marker's corner badge is drawn separately, below: it sits
            // ALONGSIDE whatever occupies the head rather than competing for it, so it
            // can't ride the head's one-of-three branch.
            const badge = body.querySelector<SVGImageElement>('.map-home-badge');
            const badgeRing = body.querySelector('.map-home-badge-ring');
            const badgeHref = badge?.getAttribute('href') ?? '';
            const badgeArt = badgeHref ? await emblem(badgeHref) : null;
            // A head that carries a drawn glyph instead of an emblem or a dot
            // (the home marker's house). Read as a path so the shape lives in ONE
            // place — the SVG constant — rather than being restated in canvas ops
            // that would then drift from it.
            const glyph = body.querySelector('.map-home-glyph');
            const href = flag?.getAttribute('href') ?? '';
            const art = href ? await emblem(href) : null;
            const s = (br.width / 24) * scale;
            ctx.save();
            ctx.translate((br.left - frameRect.left) * scale, (br.top - frameRect.top) * scale);
            ctx.scale(s, s);
            const teardrop = new Path2D('M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z');
            ctx.fillStyle = cs.fill;
            ctx.fill(teardrop);
            ctx.lineJoin = 'round';
            ctx.lineWidth = parseFloat(cs.strokeWidth) || 1.75;
            ctx.strokeStyle = cs.stroke;
            ctx.stroke(teardrop);
            if (art) {
              // The flag art is already circle-masked, so it seats straight into the
              // slot the centre dot would occupy — same geometry as the live marker.
              ctx.drawImage(art, 6.5, 4.5, 11, 11);
              if (ring) {
                const rs = getComputedStyle(ring);
                ctx.beginPath();
                ctx.arc(12, 10, 5.9, 0, Math.PI * 2);
                ctx.lineWidth = parseFloat(rs.strokeWidth) || 1;
                ctx.strokeStyle = rs.stroke;
                ctx.stroke();
              }
            } else if (glyph) {
              // evenodd, matching the SVG's own fill-rule: the door is a second
              // subpath cut out of the house, not a shape drawn over it.
              ctx.fillStyle = getComputedStyle(glyph).fill;
              ctx.fill(new Path2D(glyph.getAttribute('d') ?? ''), 'evenodd');
            } else {
              const hole = new Path2D();
              hole.arc(12, 10, 3, 0, Math.PI * 2);
              ctx.fillStyle = dot ? getComputedStyle(dot).fill : cs.stroke;
              ctx.fill(hole);
            }
            // On TOP of the head, whatever took it — the badge is an addition to this
            // marker's identity, not a replacement. Geometry mirrors HOME_MARK_SVG's.
            if (badgeArt) {
              ctx.drawImage(badgeArt, 14.4, 0.7, 8.4, 8.4);
              if (badgeRing) {
                const bs = getComputedStyle(badgeRing);
                ctx.beginPath();
                ctx.arc(18.6, 4.9, 4.6, 0, Math.PI * 2);
                ctx.lineWidth = parseFloat(bs.strokeWidth) || 0.9;
                ctx.strokeStyle = bs.stroke;
                ctx.stroke();
              }
            }
            ctx.restore();
          };

          // The standing markers first — the home place and any marker layer a
          // downstream build draws — then the active pin, which is the thing being
          // composed around and so wins any overlap. One query for both: every
          // teardrop here shares the 0 0 24 24 viewBox, which is what lets one
          // routine draw them all.
          for (const body of frameEl.querySelectorAll('.map-home-body, .saved-pin-body')) {
            const shape = body.querySelector('.map-home-shape, .saved-pin-shape');
            if (shape) await drawPin(body, shape);
          }
          const pinBody = frameEl.querySelector('.map-pin-body');
          const pinShape = pinBody?.querySelector('.map-pin-shape');
          if (pinBody && pinShape) await drawPin(pinBody, pinShape);
        }
      } catch (err) {
        // The DOM pass never reaches here — it is judged, retried and failed above. What
        // does is one of the layers stamped after it (wheel raster, glyphs, pins), which
        // stay best-effort: a failure there costs the export that layer, not the export.
        console.warn('[capture] a layer after the DOM pass failed; exporting without it', err);
      }

      const blob = await new Promise<Blob | null>((resolve) =>
        out.toBlob((b) => resolve(b), 'image/png'),
      );
      // Stamp generic AstroLina attribution into the PNG metadata so provenance travels with
      // a re-shared image (never the chart's birth data). Best-effort — addPngMetadata returns
      // the original blob if anything goes wrong, so it can't break the export. The tagged blob
      // flows to download AND the mobile share sheet; the clipboard carries it too where the OS
      // doesn't strip metadata on paste.
      if (!blob) {
        // toBlob handing back null is the encoder refusing the bitmap — in practice its
        // size. Distinct from the taint abort above and worth saying so: the way out is a
        // smaller frame, not a different basemap.
        setCaptureFailure('encode');
        return null;
      }
      return addPngMetadata(blob, CAPTURE_PNG_META, CAPTURE_PNG_XMP);
    },
  }), []);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  // The greatest-eclipse / sub-lunar maximum marker (a styled DOM marker, distinct
  // from the GL zenith coins). `eclipseMarkerKey` tracks the rendered point so the
  // effect knows when to replay the finite ping.
  const eclipseMarkerRef = useRef<maplibregl.Marker | null>(null);
  // The camera-arrival mark (a DOM marker like the two above, so MapLibre keeps it
  // pinned to its coordinate without a React render per frame).
  const arrivalMarkerRef = useRef<maplibregl.Marker | null>(null);
  // The standing home marker — the same kind of DOM marker, and the only one of
  // them that isn't a response to something the viewer just did.
  const homeMarkerRef = useRef<maplibregl.Marker | null>(null);
  const skyStampRef = useRef<maplibregl.Marker | null>(null);
  const eclipseMarkerKeyRef = useRef<string | null>(null);
  const onRightClickRef = useRef(onRightClick);
  // Its marker's click listener binds once at creation, so the live prop comes
  // through a ref (refreshed in the post-commit effect below, beside onRightClick).
  const onArrivalClickRef = useRef(onArrivalClick);
  const onHomeClickRef = useRef(onHomeClick);
  const dataRef = useRef<MapData>({ lines, angleLines, parans, orbBands, starLines, minorLines, minorZenith, minorParans, nightShade, geoGridMc, geoGridAsc, geoZones, geoAscZones, uncertaintyBands, localSpace, localSpaceCross, localSpaceOrigin, zenith, nadir, ecliptic, overlay });
  // The translator, for computeBadges (bound once, refs only): a catalog chip's words decide its
  // size, so they are resolved where it is placed (minorChipText).
  const tRef = useRef(t);
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
  // One pending sources-busy defer at a time (the data effect's fallback, run when the
  // chart's sources settle or at `idle`): the callback reads the latest refs, so queueing
  // more would only repeat it.
  const idleDeferRef = useRef(false);
  // Programmatic slide drive, populated by the slide effect while the tool is
  // active (null otherwise — MapHandle.slideTo/slideBy no-op then). Targets are
  // elapsed rotation TIME in days, the same unit onSlide reports.
  const slideApiRef = useRef<{ to(dtDays: number): void; by(deltaDays: number): void } | null>(
    null,
  );
  const themeRef = useRef(theme);
  // Put the map on the basemap for themeRef's theme through the one style-swap path, which lives
  // with the map in the mount effect (the theme effect is its caller from outside).
  const restyleRef = useRef<() => void>(() => {});
  // spinPaint (the Slide tool's, below), for that style path: a style that lands while Slide is
  // on must be painted at the current spin, as the data effect does.
  const spinPaintRef = useRef<(deg: number, mode?: 'translate' | 'empty' | 'skip') => void>(() => {});
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
  // The geodetic grid's readout, read the same way: it changes as grid layers come and go.
  const geoReadoutRef = useRef(geoReadout);
  // The Ascendant zone the hover has lit (its feature-state id), or null. Component-level so
  // the hover handler and the zone-data effect below can both clear it.
  const hoveredZoneRef = useRef<number | null>(null);
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
  // Every clickable line collection, keyed by the GeoJSON source that draws it and refreshed
  // each commit (below). The click handler looks the clicked line up here by its source and
  // properties, for the full geometry its closest-approach row is measured on.
  const lineGeomRef = useRef<Record<string, ClickableLineFC>>({});
  // The pinned local-circumstances card (one per map). Held in a ref so the
  // close-on-selection-change effect below can reach the instance the
  // long-lived click handler owns.
  const eclipseCardPopupRef = useRef<maplibregl.Popup | null>(null);
  // Same arrangement for the pinned line-interpretation card.
  const lineCardPopupRef = useRef<maplibregl.Popup | null>(null);
  // The map's load/style.load/click handlers are bound once and never rebound;
  // refresh these refs after each commit (not during render) so those async
  // handlers always read the latest props.
  //
  // A LAYOUT effect, and that is load-bearing. Passive effects clean up before any of
  // them re-run, so a passive sync here is still holding the PREVIOUS commit's props
  // when another effect's cleanup reads it — and the Slide teardown does exactly that:
  // it re-pushes `dataRef.current` untranslated as the tool closes. When Slide closes
  // in the same commit as a new line set (Advanced off with Local Space open; a geodetic
  // map arriving while it spins), that push was the OLD set, and it stayed — the closed
  // window's local-space lines left on the map, measured still there after 8 s.
  // Layout effects all run before the passive cleanups of the same commit, so every
  // teardown reads this commit's props.
  useLayoutEffect(() => {
    onRightClickRef.current = onRightClick;
    onArrivalClickRef.current = onArrivalClick;
    onHomeClickRef.current = onHomeClick;
    dataRef.current = { lines, angleLines, parans, orbBands, starLines, minorLines, minorZenith, minorParans, nightShade, geoGridMc, geoGridAsc, geoZones, geoAscZones, uncertaintyBands, localSpace, localSpaceCross, localSpaceOrigin, zenith, nadir, ecliptic, overlay, eclipse };
    tRef.current = t;
    slideActiveRef.current = !!slideActive;
    spotlightActiveRef.current = !!spotlightActive;
    spotlightAimingRef.current = !!spotlightAiming;
    measureColorRef.current = measureColor;
    detailRef.current = { showRoads, showRivers, showLabels, hideBasemap };
    hideLsArrowsRef.current = hideLsArrows;
    lsEdgeLabelsRef.current = lsEdgeLabels;
    lsTransparentRef.current = lsTransparent;
    eclipseTipRef.current = eclipseTip;
    geoReadoutRef.current = geoReadout;
    eclipseCardRef.current = eclipseCard;
    lineCardRef.current = lineCard;
    distanceRefRef.current = distanceRef;
    // Natal + overlay line collections whose features can open an interpretation card, under
    // the source ids pushData() feeds them to — a hit-test reports the source, so the two
    // tables must agree. Nullable/absent ones are dropped.
    const lineFcs: Record<string, ClickableLineFC | null | undefined> = {
      'acg-lines': lines,
      'angle-lines': angleLines,
      parans,
      'local-space': localSpace,
      'star-lines': starLines,
      'minor-lines': minorLines,
      'minor-parans': minorParans,
      ecliptic,
      'acg-lines-ov': overlay?.lines,
      'minor-lines-ov': overlay?.minorLines,
      'parans-ov': overlay?.parans,
      'minor-parans-ov': overlay?.minorParans,
      'local-space-ov': overlay?.localSpace,
      'ecliptic-ov': overlay?.ecliptic,
    };
    const geom: Record<string, ClickableLineFC> = {};
    for (const [source, fc] of Object.entries(lineFcs)) if (fc) geom[source] = fc;
    lineGeomRef.current = geom;
  });

  // Edge badges: glyph + angle code per ACG line, anchored where the line exits
  // the viewport. Recomputed (rAF-throttled) on every map move + when data changes.
  const [badges, setBadges] = useState<LineBadge[]>([]);
  // …and the catalog minor bodies' (#34), placed last of all the labels.
  const [minorBadges, setMinorBadges] = useState<MinorChip[]>([]);
  const [paranBadges, setParanBadges] = useState<ParanBadge[]>([]);
  // …and the geodetic grid's sign glyphs, placed after every other label (geoGridLabels.ts).
  const [geoGridBadges, setGeoGridBadges] = useState<GeoGridBadge[]>([]);
  const [localSpaceBadges, setLocalSpaceBadges] = useState<LocalSpaceBadge[]>([]);
  // True while the map camera is animating (pan / zoom / flyTo). The edge labels fade
  // out while moving — anchored to the screen edges, they read as detached from their
  // lines in motion — and fade back in, repositioned, once it settles.
  const [mapMoving, setMapMoving] = useState(false);
  // When the camera last came to rest. Read by captureFrame to wait out the motion fades;
  // stamped wherever motion ends, so every settle path feeds it.
  const lastSettleAtRef = useRef(0);
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

  // Through a ref so the jump helper below keeps its empty dep list — its identity
  // feeds the badge handlers, which must not churn every time the host re-renders.
  const onCameraJumpRef = useRef(onCameraJump);
  onCameraJumpRef.current = onCameraJump;

  // Ease the map to a lng/lat, keeping the target clear of the left-docked expanded
  // sidebar (same offset as the recenter button). Used by paran + LS label clicks.
  const flyToPoint = useCallback((lng: number, lat: number) => {
    const map = mapRef.current;
    if (!map) return;
    // A label click chooses a new subject for the view, so the host can retire what
    // it was showing about the old one.
    onCameraJumpRef.current?.();
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
      // A catalog row's body and side join the id: Sun × Eros and Sun × Zeus are otherwise one
      // id, and a click on the second would fly back instead of to it.
      const id = `${b.prefix}|${b.planetA}|${b.angleA}|${b.planetB}|${b.angleB}|${b.minorN ?? ''}|${b.minorSide ?? ''}`;
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
  // a map resize, the nav, the top-left stack or the zoom control coming to rest
  // somewhere new — lib/hudSettled and the control's own transitionend, which until
  // 2026-10-01 nothing announced, so a dock opening left labels under them until the
  // next pan; and a projection flip, which shows or hides the control's compass)
  // clears hudRectsRef first — so mid-move
  // frames reuse the cached rects instead of paying 9 querySelectorAll +
  // getBoundingClientRect layouts per frame. Every other caller (moveend, data
  // pushes, theme reloads) reads fresh.
  const hudRectsRef = useRef<AvoidRect[] | null>(null);
  // A downstream layer's markers (OVERLAY_MARKER_SELECTORS) are NOT cached with the panels:
  // they move with the camera — and without it, re-projected a commit after a projection
  // switch — and come and go with the layer's own state (a journal sync, a delete, the layer
  // shown or hidden), none of which clears a HUD cache. Cached with the panels until 2026-10-01,
  // which left labels on saved pins after Shift+F (17 edge chips on 192 seeded pins) and after
  // any marker came or went, until the next pan. So every pass the camera isn't moving in reads
  // them fresh (one querySelectorAll); a pass mid-move reuses the last read, stale in a way
  // nothing shows — the label layer is faded out in motion. `key` is what the last read found,
  // for onOverlayPlaced below to tell whether the markers have moved since.
  const overlayMarkersRef = useRef<{ rects: AvoidRect[]; key: string }>({ rects: [], key: '' });
  // Each edge chip's rendered half-extents, by face (edgeChipFace), for the placement to pack
  // them by their real size. Filled after the chips are drawn (the measuring effect below the
  // scheduler) rather than read here: computeBadges runs per move frame and at every settle, and
  // a chip it is about to place may not have been drawn yet. A face is measured once and stays
  // valid — a pill's width is its content's — so after the first settle this is all cache hits.
  const chipSizesRef = useRef(new globalThis.Map<string, BadgeSize>());
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
    // basemap, and a paran row is a whole parallel, which a shift in longitude leaves
    // where it was — its chip is placed along it from the (live) centre longitude.
    const slideShift = slideActiveRef.current ? spinDegRef.current : 0;
    const pinShift = <F extends Feature>(feats: F[]): F[] =>
      slideShift
        ? (translateLng({ type: 'FeatureCollection', features: feats }, -slideShift)
            .features as F[])
        : feats;
    const cont = map.getContainer();
    const framing = frameActiveRef.current;
    // What the labels keep clear of, read at most once a pass and only by a section that
    // places labels (a mid-move frame with no Local Space on reads nothing). While the Capture
    // frame is armed, badges hug the frame edges and ignore the HUD panels (Capture window etc.)
    // — EXCEPT the on-map attribution disclosure, which is in the exported image, so they still
    // dodge that one.
    let avoidRead: AvoidRect[] | null = null;
    const avoid = () =>
      (avoidRead ??= framing
        ? readHudRects(map, CAPTURE_AVOID_SELECTORS)
        : reuseHudRects && hudRectsRef.current
          ? hudRectsRef.current
          : (hudRectsRef.current = readHudRects(map)));
    // The tapped markers every label steps off (PIN_HIT): the core's two projected now, a
    // downstream layer's read off the DOM (fresh unless the camera is moving — see
    // overlayMarkersRef). Framing too, since the export draws its markers OVER the labels (the
    // pin stamp in captureFrame) — except an LS-only transparent still, which draws no marker
    // at all, so its labels have nothing there to clear. The downstream read happens even then,
    // so the record onOverlayPlaced compares against is never left behind.
    let markersRead: AvoidRect[] | null = null;
    const markerRects = (): AvoidRect[] => {
      if (markersRead) return markersRead;
      let overlay = overlayMarkersRef.current.rects;
      if (framing || !map.isMoving()) {
        overlay = readHudRects(map, OVERLAY_MARKER_SELECTORS);
        overlayMarkersRef.current = { rects: overlay, key: rectsKey(overlay) };
      }
      return (markersRead =
        framing && lsTransparentRef.current
          ? []
          : [
              markerHitRect(map, markerRef.current, PIN_HIT),
              markerHitRect(map, homeMarkerRef.current, HOME_HIT),
            ]
              .filter((r): r is AvoidRect => r !== null)
              .concat(overlay));
    };
    // Where the labels may not go this pass — the panels, the markers, and every label placed so
    // far (chipOccupancy). One per pass, made by the first section that places through it, so a
    // pass that places nothing reads nothing. Every kind that places through it does so in
    // CHIP_RANK order, so a chip only ever steps aside for a more important one.
    let occ: ChipOccupancy | null = null;
    const occupancy = () =>
      (occ ??= new ChipOccupancy(
        cont.clientWidth,
        cont.clientHeight,
        avoid().concat(markerRects()),
      ));
    // Tighter edge gap while framing (the exported still wants the labels hugging the edge).
    const inset = framing ? CAPTURE_BADGE_INSET : BADGE_INSET;
    const w = cont.clientWidth;
    const h = cont.clientHeight;
    // Each chip at its real size (measured per face, an estimate for a face not yet drawn).
    const sizes = chipSizesRef.current;
    const sizeOf = (b: LineBadge) => sizes.get(edgeChipFace(b)) ?? estimateEdgeChip(b);
    const paranSizeOf = (b: ParanBadge) => sizes.get(paranChipFace(b)) ?? estimateParanChip(b);
    const minorSizeOf = (b: MinorChip) => sizes.get(minorChipFace(b)) ?? estimateMinorChip(b);
    // Labels are skipped while the camera is in motion: the whole label layer fades
    // out within ~0.12s of movestart (.is-moving — in motion they'd float detached
    // from their lines) and the moveend pass re-anchors them before the fade-in,
    // so placing them per move frame is pure waste. The edge chips are also the
    // heaviest set by far — with the aspect/midpoint overlays on it anchors and
    // dodges hundreds of badges (they render at ALL zooms; an earlier zoom gate
    // was a render-cost mitigation this skip makes unnecessary). What the Local Space
    // section DOES keep per frame is what is drawn outside that layer — the compass's
    // origin and north, and the canvas mask — so the dial tracks the camera live.
    // The paran and Local Space chips were placed per frame too until 2026-10-02,
    // into the same faded layer: 0.3–0.6 ms a frame for LS and 0.4 for the parans
    // (measured 2026-10-01), plus a React commit of both lists, for nothing on screen.
    const moving = map.isMoving();
    let edgePlaced: LineBadge[] | null = null;
    if (!moving) {
      const natal = computeLineBadges(map, pinShift(data.lines.features), inset, false);
      const ov = data.overlay?.lines
        ? computeLineBadges(map, data.overlay.lines.features, inset, true)
        : [];
      // Aspect/midpoint lines ride the natal badge path (they're natal-derived);
      // their aspect/planetB props give them distinct group keys and badge faces.
      const ang = computeLineBadges(map, pinShift(data.angleLines.features), inset, false, 'ang');
      // Every edge chip on its own line, clear of the panels, the markers and each other where
      // the slide cap allows, in CHIP_RANK order (dodgeBadges) — the chart's own and an overlay's
      // here; the nodes and the aspect lines below, once the kinds ranked between them are placed
      // (the Local Space chips above the nodes, the parans above the aspect lines).
      edgePlaced = dodgeBadges(
        natal.concat(ov, ang),
        occupancy(),
        sizeOf,
        inset,
        CHIP_RANK.natal,
        CHIP_RANK.overlay,
      );
    }
    // The Local Space chips' real boxes, as placed below — for the Capture spread to keep the
    // edge and paran chips off them.
    const lsBoxes: AvoidRect[] = [];

    // Local-space badges: one "LS + glyph" per planet, on a fixed-pixel ring around
    // the origin at the outward (toward-planet) azimuth — measured from the on-screen
    // north direction so it stays correct under rotation/tilt. Hidden when the origin
    // is on the globe's far side. (The Capture-time "Standard labels" mode swaps the
    // ring anchor for the line's outermost visible point — see edgeMode below.)
    const lsbadges: LocalSpaceBadge[] = [];
    // …and the ones drawn: those that found somewhere to go (all of them in the LS-only still).
    let lsShown = lsbadges;
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
      const glCanvas = map.getCanvas();
      const mask = lsMaskCircle({ x: oc.x, y: oc.y }, map.getZoom(), lsTransparentRef.current);
      // The badge placement below anchors to the same rim (lsRimCrossing, the angular
      // spread), so it reads the circle from here rather than re-testing the zoom.
      const maskActive = mask != null;
      const maskR = mask?.r ?? 0;
      if (mask) {
        glCanvas.style.setProperty(
          'clip-path',
          `circle(${mask.r}px at ${mask.cx}px ${mask.cy}px)`,
        );
      } else {
        glCanvas.style.removeProperty('clip-path');
      }
      const north = screenAngleOfNorth(map, origin.lng, origin.lat);
      setOriginNorthDeg((north * 180) / Math.PI);
      // The labels themselves wait for the settle (`moving`, above): none are built in motion, so
      // nothing below places anything (or reads a panel) then, and the drawn ones are left as
      // they were, faded out with their layer.
      const r = lsBadgeRadius(map.getZoom());
      // The flat map has no far side, and MapLibre's test for one allocates (the edge chips skip
      // it there too) — this walk runs for every line on every frame while the origin is off screen.
      const flatMap = map.getProjection()?.type !== 'globe';
      // Anchor an off-screen LS label on its ACTUAL projected arc (a great circle that
      // curves away from a straight ring ray the farther out it runs): walk from the
      // pin outward and return where the line first enters the view — its pin-ward end.
      const lsPinwardEntry = (coords: number[][]): { x: number; y: number } | null => {
        let prev: { x: number; y: number } | null = null;
        for (let i = 0; i < coords.length; i++) {
          const c = coords[i];
          const cur =
            !flatMap && isOccluded(map, c[0], c[1]) ? null : map.project([c[0], c[1]]);
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
      // Each label's line, for the labels the occupancy places along it (below), and which of them
      // were anchored at their ring point — on the straight bearing ray, which the drawn line bends
      // away from.
      const lsCoords = new globalThis.Map<string, number[][]>();
      const lsAtRing = new Set<string>();
      for (const f of moving ? [] : lsFeats) {
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
          lsAtRing.add(k);
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
        lsCoords.set(k, f.geometry.coordinates);
      }
      // A label's line as drawn, projected from the origin out to the end of its first run across
      // the screen — the run its label sits on — or to where it goes round the globe. Projected for
      // the labels the occupancy places, which slide along it (below).
      const lsDrawnRun = (key: string): ChipPt[] => {
        const run: ChipPt[] = [];
        let entered = false;
        for (const c of lsCoords.get(key) ?? []) {
          const p = flatMap ? map.project([c[0], c[1]]) : projectVisible(map, c[0], c[1]);
          if (!p) {
            if (run.length) break;
            continue;
          }
          const prev = run[run.length - 1];
          run.push({ x: p.x, y: p.y });
          if (!prev) continue;
          if (clipSegmentToView(prev, p, w, h, 0)) entered = true;
          else if (entered) break;
        }
        return run;
      };
      // Per-badge half-extents for separation: in a capture STILL the export can't be panned to
      // disambiguate overlapping labels, so measure each pill's REAL box from the live DOM (keyed
      // by data-lskey) — the wide 'out' pills carry a bearing and would crowd at the nominal width
      // (exactly what the ACG edge badges do in capture). Live, the nominal pill size is fine; sizes
      // are intrinsic, so measuring stays a fixed point (no measure→resize loop).
      const lsSizes = new globalThis.Map<string, { hw: number; hh: number }>();
      if (frameActiveRef.current && lsbadges.length) {
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
      // Per-badge half-extents. `hw`/`hh` space two LS labels apart: a pill that PRINTS its
      // bearing keeps the deliberately over-wide floor even when measured — the long faces crowd
      // at close azimuths and must land fully clear of each other in a still (which also rides out
      // the one render where a face was measured before its bearing span re-appeared). A blank-
      // faced pill instead trusts its measured box: flooring it too would space a glyph-only pill
      // (name toggle off) as if it still carried its name, pushing badges off their lines with no
      // visible crowding to justify it — the narrow floor only stands in while unmeasured.
      // + LS_BADGE_GAP so neighbours clear by a hair. `mhw`/`mhh` are the real box (measured while
      // framing, else LS_PILL_HIT), for everything else: the screen edge, the panels, the markers
      // and the other kinds of label.
      const sized = lsbadges.map((b) => {
        const s = lsSizes.get(b.key);
        const hw =
          (b.out && b.azLabel
            ? Math.max(s?.hw ?? 0, LS_BADGE_OUT_HALF_W)
            : s
              ? s.hw
              : LS_BADGE_HALF_W) + LS_BADGE_GAP;
        const hh = (s?.hh ?? LS_BADGE_HALF_H) + LS_BADGE_GAP;
        const mhw = s?.hw ?? (b.out && b.azLabel ? LS_PILL_HIT.out : LS_PILL_HIT.bare);
        const mhh = s?.hh ?? LS_PILL_HIT.hh;
        return { b, hw, hh, mhw, mhh };
      });
      // Through the shared occupancy (chipOccupancy.ts), like every other kind of label, since
      // 2026-10-01 (#28). Until then this pass knew only the screen's inset: on a phone the labels
      // slid under the top bar and under the docked Local Space window, which covers the lower half
      // of its own ring; a label hidden there still shoved visible ones about in the de-overlap; and
      // one anchored at the screen edge kept its centre on the inset line, half its pill cut off.
      // Now a label only goes where its whole REAL pill is on screen and clear of the panels and the
      // tapped markers (the placed pin above all, which so often IS the origin); and it steps off
      // the chart's and an overlay's edge chips, placed before it, as far as the slide cap allows,
      // overlapping under them past that — CHIP_RANK puts Local Space under those and over the
      // nodes, the parans and the aspect lines, which are placed after it and step off it in turn.
      // The geometry stays its own: a label moves only along its own line. A label with nowhere on
      // its line clear of the panels isn't drawn — it would be under one or off screen anyway, and
      // leaving it out is what keeps it from pushing the others.
      //
      // Not in the LS-only transparent still (the rim, or Standard labels): it has no other labels
      // to make room for, its own placement is what the mode is for, and while the frame is armed
      // there are no panels in the picture to clear.
      const dodge = !maskActive && !edgeMode;
      const ocOnScreen = oc.x >= 0 && oc.x <= w && oc.y >= 0 && oc.y <= h;
      if (maskActive) {
        // On the rim (fixed radius): spread ANGULARLY so pills don't overlap, staying near each
        // line's bearing. (The radial spread below would slide them off the rim.) No markers to
        // step off here: the rim exists only in the transparent LS-only still, which draws none
        // (markerRects is empty while it is armed).
        if (ocOnScreen && lsbadges.length > 1) {
          const items = sized.map(({ b, hw, hh }) => {
            const ang = Math.atan2(b.x - oc.x, -(b.y - oc.y));
            return { x: b.x, y: b.y, ang, ang0: ang, hw, hh, ref: b };
          });
          spreadLsBadgesAngular(items, oc.x, oc.y, maskR, 60);
          for (const it of items) {
            it.ref.x = it.x;
            it.ref.y = it.y;
          }
        }
      } else if (ocOnScreen && lsbadges.length) {
        // Slide each label along its OWN line, out from the origin: only how far along it a label
        // sits changes, so a crowded fan staggers in/out along its lines.
        const lsItems: (Parameters<typeof spreadLsBadgesRadial>[0][number] & {
          mhw: number;
          mhh: number;
          ref: LocalSpaceBadge;
        })[] = [];
        for (const { b, hw, hh, mhw, mhh } of sized) {
          let path: ArcPath;
          let rad0: number;
          if (dodge) {
            // Its line as drawn, and its rest where that line first meets the ring — or, with the
            // ring off screen, where the line leaves it.
            path = arcPath(lsDrawnRun(b.key));
            rad0 = ringArc(path, oc, r);
          } else {
            // The LS-only still: the straight ray from the origin through its anchor, as it always
            // was there.
            const vx = b.x - oc.x;
            const vy = b.y - oc.y;
            rad0 = Math.hypot(vx, vy) || 1;
            const far = 2 * (w + h);
            path = arcPath([
              { x: oc.x, y: oc.y },
              { x: oc.x + (vx / rad0) * far, y: oc.y + (vy / rad0) * far },
            ]);
          }
          // The stretch of the line on which the label's real pill is wholly on screen inside the
          // inset, and no nearer the origin than the clear zone round it. Measured with the real
          // pill, not the spacing box, and never widened to the anchor: until 2026-10-01 this was
          // max(rad0, …) of the spacing box's fit, which let a label anchored where its line leaves
          // the screen keep its centre on the inset line (#28: bearings cut at the left edge at
          // close zoom), while holding an uncrowded one ~30 px short of an edge it could reach.
          const fit = pathInRect(path, inset + mhw, inset + mhh, w - inset - mhw, h - inset - mhh);
          const f = nearestSpan(fit, rad0);
          let minRad = f >= 0 ? Math.max(fit[f], Math.min(rad0, LS_BADGE_MIN_RAD)) : Infinity;
          let maxRad = f >= 0 ? fit[f + 1] : -Infinity;
          if (dodge) {
            const occ = occupancy();
            // …and of that, the stretch clear of the panels and the tapped markers nearest the
            // rest: inside it nothing can push the label under one. A label whose line has none is
            // left out before the stagger, so it moves nobody.
            const open = occ.clearSpans(path, mhw, mhh, minRad, maxRad, 'panels');
            const k = nearestSpan(open, rad0);
            if (k < 0) continue;
            minRad = open[k];
            maxRad = open[k + 1];
            // Inside that, the stretch clear of the labels placed before it (the chart's and an
            // overlay's edge chips) nearest its rest, if it is within CHIP_SLIDE_CAP — as far as
            // any label slides to make room. Past that it overlaps one, drawn under it, as an edge
            // chip does: overlapped is still partly read, where a panel hides it outright.
            const rest = Math.min(Math.max(rad0, minRad), maxRad);
            const free = occ.clearSpans(path, mhw, mhh, minRad, maxRad, 'chips');
            const j = nearestSpan(free, rest);
            if (j >= 0 && spanGap(free, j, rest) <= CHIP_SLIDE_CAP) {
              minRad = free[j];
              maxRad = free[j + 1];
            }
          } else if (!(maxRad >= minRad)) {
            // The still has no room on this line for the whole pill (the origin hard by the frame
            // edge, the line leaving through it): it stays near its anchor, as it always did.
            minRad = Math.min(rad0, LS_BADGE_MIN_RAD);
            maxRad = rad0;
          }
          lsItems.push({ x: b.x, y: b.y, path, rad: rad0, rad0, minRad, maxRad, hw, hh, mhw, mhh, ref: b });
        }
        spreadLsBadgesRadial(lsItems, 60);
        for (const it of lsItems) {
          it.ref.x = it.x;
          it.ref.y = it.y;
        }
        if (dodge) {
          // Into the occupancy, so the kinds ranked under Local Space step off them: the outward
          // halves first, which carry the bearing, each in the chart's body order.
          //
          // Two LS labels never overlap on the live map (2026-10-02, L86's open call). The stagger
          // spaces a fan only as far as each label's bounds let it, and with the LS window docked at
          // the bottom of a phone, the lower half of the ring had about 54 px above the window for
          // nine lines: 15 overlapping LS pairs on a 432×768 phone, 21 with the origin under the top
          // bar (measured 2026-10-02). So, taken in that same order, a label that overlaps one
          // already kept moves to the nearest spot within its bounds that clears the kept ones by
          // CHIP_GAP, at most CHIP_SLIDE_CAP along its line, and failing that is left out. An inward
          // half goes before an outward one, a later body before an earlier one, and nothing already
          // kept is moved. The line stays drawn, and hover and a tap still name it. A label that is
          // only closer than CHIP_GAP stays where the stagger put it, as it always did: it still
          // reads as its own pill. Not in a Capture still: it can't be hovered, so a label left out
          // there would leave its line unnamed, where an overlapped one is still partly read.
          const occ = occupancy();
          const lsOnly = framing ? null : new ChipOccupancy(w, h, []);
          const kept = new Set<LocalSpaceBadge>();
          for (const out of [true, false]) {
            for (const it of lsItems) {
              if (it.ref.out !== out) continue;
              if (lsOnly?.crowded(it.x, it.y, it.mhw, it.mhh, 0)) {
                const free = lsOnly.clearSpans(it.path, it.mhw, it.mhh, it.minRad, it.maxRad, 'chips');
                const j = nearestSpan(free, it.rad);
                if (j < 0 || spanGap(free, j, it.rad) > CHIP_SLIDE_CAP) continue;
                it.rad = Math.min(Math.max(it.rad, free[j]), free[j + 1]);
                const p = arcPoint(it.path, it.rad);
                it.x = it.ref.x = p.x;
                it.y = it.ref.y = p.y;
              }
              lsOnly?.add(it.x, it.y, it.mhw, it.mhh, CHIP_RANK.localSpace);
              it.ref.z = occ.add(it.x, it.y, it.mhw, it.mhh, CHIP_RANK.localSpace);
              lsBoxes.push({ left: it.x - it.mhw, top: it.y - it.mhh, right: it.x + it.mhw, bottom: it.y + it.mhh });
              kept.add(it.ref);
            }
          }
          lsShown = lsItems.filter((it) => kept.has(it.ref)).map((it) => it.ref);
        }
      } else if (dodge && lsbadges.length) {
        // The origin off screen: no centre for a fan to stagger round, so the anchors (where each
        // line enters the view, or its ring point) are each placed on their own, as an edge chip
        // is: along its own projected line to the nearest spot clear of the panels, the markers and
        // the labels already placed, sliding at most CHIP_SLIDE_CAP to get off another label and
        // overlapping past that (placeOnPath). The outward halves first, which carry the bearing.
        // The line is projected only for a ring-point anchor, or one that isn't clear already. Left
        // out when no stretch of its line on screen is clear of the panels, and, live, when the
        // spot it falls back to past the cap overlaps another LS label (the rule above, 2026-10-02).
        const occ = occupancy();
        const lsOnly = framing ? null : new ChipOccupancy(w, h, []);
        const kept = new Set<LocalSpaceBadge>();
        for (const { b, mhw, mhh } of [...sized].sort((p, q) => Number(q.b.out) - Number(p.b.out))) {
          // A ring-point anchor moves onto the line as drawn, where it meets the ring; the pin-ward
          // entry is on it already.
          let run: ChipPt[] | null = null;
          let anchor: ChipPt = b;
          if (lsAtRing.has(b.key)) {
            run = lsDrawnRun(b.key);
            const ap = arcPath(run);
            anchor = arcPoint(ap, ringArc(ap, oc, r));
          }
          let spot: ChipPt | null = anchor;
          if (
            anchor.x - mhw < inset ||
            anchor.x + mhw > w - inset ||
            anchor.y - mhh < inset ||
            anchor.y + mhh > h - inset ||
            occ.blocked(anchor.x, anchor.y, mhw, mhh) ||
            occ.crowded(anchor.x, anchor.y, mhw, mhh)
          ) {
            spot = placeOnPath(occ, run ?? lsDrawnRun(b.key), anchor, mhw, mhh, inset);
          }
          if (!spot || lsOnly?.crowded(spot.x, spot.y, mhw, mhh, 0)) continue;
          lsOnly?.add(spot.x, spot.y, mhw, mhh, CHIP_RANK.localSpace);
          b.x = spot.x;
          b.y = spot.y;
          b.z = occ.add(b.x, b.y, mhw, mhh, CHIP_RANK.localSpace);
          lsBoxes.push({ left: b.x - mhw, top: b.y - mhh, right: b.x + mhw, bottom: b.y + mhh });
          kept.add(b);
        }
        lsShown = lsbadges.filter((b) => kept.has(b));
      }
      // Along-the-line "Degrees" anchor (transparent export): park each bearing just past its
      // badge's edge on the ray toward the origin, so it reads as that line's degree and clears
      // the (variable-width) name pill. Offset from the MEASURED half-extent — a fixed offset from
      // the pill centre would land on the name whenever the line runs toward it (horizontal lines).
      for (const b of lsShown) {
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
    const lsDrawn = lsShown;
    if (!moving) setLocalSpaceBadges((cur) => (sameBadges(cur, lsDrawn) ? cur : lsDrawn));

    // The lunar nodes' edge chips, which rank under Local Space's.
    if (edgePlaced) {
      edgePlaced = dodgeBadges(
        edgePlaced,
        occupancy(),
        sizeOf,
        inset,
        CHIP_RANK.node,
        CHIP_RANK.node,
      );
    }

    // Paran chips: one column where the rows cross the centre meridian, never moved from it; rows
    // walked in PARAN_RANK order, and a row whose spot is taken (a panel, a marker, a label placed
    // above, a higher-ranked paran chip) gets none (paranChips.ts; #23). At a settle, with the rest
    // (`moving`, above). Not in the LS-only transparent still, which draws none.
    let pbadges =
      moving || lsTransparentRef.current
        ? []
        : placeParanChips(
            map,
            // Each set's catalog rows (the reader's "Parans with the planets") come after its
            // own planet rows, and PARAN_RANK.pair labels them only once every built-in row of
            // their set has its chance.
            [
              { fc: data.parans, overlay: false },
              ...(data.minorParans?.features.length ? [{ fc: data.minorParans, overlay: false }] : []),
              ...(data.overlay?.parans ? [{ fc: data.overlay.parans, overlay: true }] : []),
              ...(data.overlay?.minorParans?.features.length
                ? [{ fc: data.overlay.minorParans, overlay: true }]
                : []),
            ],
            occupancy,
            paranSizeOf,
            inset,
            w,
            h,
          );

    if (edgePlaced) {
      edgePlaced = dodgeBadges(
        edgePlaced,
        occupancy(),
        sizeOf,
        inset,
        CHIP_RANK.paran + 1,
        CHIP_RANK.aspect,
      );
      // The catalog minor bodies' chips, last of all (CHIP_RANK.catalog; #34): on their own lines
      // like a planet's, stepping off every label placed above, and drawn under them where the
      // slide cap runs out. At a settle only, with the edge chips (whose motion fade they share).
      // The pinned set, shifted by the Slide's −θ like the chart's own lines: catalog lines are
      // natal linework (spinPaint holds them screen-fixed through a drag). Not in the LS-only
      // still, which empties their lines at the source.
      //
      // An overlay's catalog lines get theirs here too, placed with the chart's in one pass —
      // NOT shifted (overlay linework rides with the basemap through a Slide, as the overlay
      // planets' chips do) and keyed apart, so a body's chart chip and its overlay chip are
      // two chips, as a planet's are.
      const minorFeats = lsTransparentRef.current ? [] : (data.minorLines?.features ?? []);
      const minorOvFeats = lsTransparentRef.current ? [] : (data.overlay?.minorLines?.features ?? []);
      let minorPlaced: MinorChip[] = [];
      if (minorFeats.length || minorOvFeats.length) {
        const tr = tRef.current;
        const chips = (feats: typeof minorFeats, overlay: boolean): MinorChip[] =>
          feats.length === 0
            ? []
            : computeMinorBadges(map, overlay ? feats : pinShift(feats), inset).map((b) => ({
                ...b,
                ...(overlay ? { key: `ov-${b.key}`, overlay: true } : {}),
                ...minorChipText(b, tr),
              }));
        minorPlaced = placeMinorChips(
          [...chips(minorFeats, false), ...chips(minorOvFeats, true)],
          occupancy(),
          minorSizeOf,
          inset,
        );
      }
      // The geodetic grid's sign glyphs, after everything (CHIP_RANK.grid; geoGridLabels.ts): the
      // band tops while the meridians or the zone shading are drawn, the curves' glyphs while the
      // curves are — read off what was pushed, so a glyph never names a line that isn't there.
      // Never moved by the Capture spread below; a glyph a spread chip lands on is dropped there
      // instead, as one with no clear spot is here. Not in the LS-only still, which empties the
      // grid at the source.
      const drawn = (fc: FeatureCollection | null | undefined) => (fc?.features.length ?? 0) > 0;
      let gridPlaced: GeoGridBadge[] = lsTransparentRef.current
        ? []
        : placeGeoGridChips(
            map,
            {
              bands: drawn(data.geoGridMc) || drawn(data.geoZones),
              curves: drawn(data.geoGridAsc),
            },
            occupancy,
            inset,
          );
      // While the Capture frame is armed, the export is a STILL — it can't be panned or hovered,
      // so the overlaps the slide cap left are relaxed apart too, off the lines if need be
      // (spreadBadges: the one step the live map doesn't take). The paran chips go through it with
      // the edge chips, every visible row's, but only ALONG their rows: sideways on the flat map,
      // not at all on the globe (spreadBadges' `axisOf` says why). So do the catalog chips. The
      // Local Space chips stay out of it — their fan is spaced by its own stagger, on its own
      // lines — and are in its avoid-rects instead, so nothing the spread moves lands on one.
      if (framing) {
        const n = edgePlaced.length;
        const np = n + pbadges.length;
        const paranAxis = map.getProjection()?.type === 'globe' ? 'none' : 'x';
        const spread = spreadBadges<LineBadge | ParanBadge | MinorChip>(
          [...edgePlaced, ...pbadges, ...minorPlaced],
          (b) => ('planetA' in b ? paranSizeOf(b) : 'body' in b ? minorSizeOf(b) : sizeOf(b)),
          lsBoxes.length ? occupancy().obstacles.concat(lsBoxes) : occupancy().obstacles,
          w,
          h,
          inset,
          (b) => ('planetA' in b ? paranAxis : 'xy'),
        );
        edgePlaced = spread.slice(0, n) as LineBadge[];
        pbadges = spread.slice(n, np) as ParanBadge[];
        minorPlaced = spread.slice(np) as MinorChip[];
        if (gridPlaced.length) {
          const { hw, hh } = GEO_GRID_CHIP;
          const boxes = spread.map((b) => {
            const s = 'planetA' in b ? paranSizeOf(b) : 'body' in b ? minorSizeOf(b) : sizeOf(b);
            return { l: b.x - s.hw, t: b.y - s.hh, r: b.x + s.hw, b: b.y + s.hh };
          });
          gridPlaced = gridPlaced.filter(
            (g) => !boxes.some((o) => g.x + hw > o.l && g.x - hw < o.r && g.y + hh > o.t && g.y - hh < o.b),
          );
        }
      }
      const edge = edgePlaced;
      setBadges((cur) => (sameBadges(cur, edge) ? cur : edge));
      const minor = minorPlaced;
      setMinorBadges((cur) => (sameBadges(cur, minor) ? cur : minor));
      const grid = gridPlaced;
      setGeoGridBadges((cur) => (sameBadges(cur, grid) ? cur : grid));
    }
    const parans = pbadges;
    if (!moving) setParanBadges((cur) => (sameBadges(cur, parans) ? cur : parans));
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

  // The "Zoom out" pill is one of the panels the labels keep off (HUD_SELECTORS), but it comes and
  // goes with the zoom a pass has just set (setZoom), so it mounts a render AFTER the pass that read
  // the panels — a settle landing past CLOSE_ZOOM placed the labels as if it weren't there. Nothing
  // else announces it (it doesn't move by itself the way the nav does: lib/hudSettled), so its own
  // arrival and departure drop the cached rects and re-place the labels, a frame later, with it in.
  const zoomOutShown = !lsTransparent && (zoom >= CLOSE_ZOOM || !!keepZoomOutVisible);
  useEffect(() => {
    hudRectsRef.current = null;
    scheduleBadges();
  }, [zoomOutShown, scheduleBadges]);

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

  // Measure the edge chips once they are drawn, one per face (chipSizesRef), and re-place the
  // labels if a face turned out a different size from what the placement used — a face drawn
  // for the first time (an overlay or the aspect lines just switched on), or a pill that changed
  // width under it (the symbol font arriving). A passive effect, normally run after the paint
  // that already laid the chips out, so the reads add no layout of their own. It ends itself:
  // the re-place uses the sizes just recorded, and the commit it causes finds them unchanged.
  // Only when the edge chips change, which is only at a settle (they are not recomputed in
  // motion). The paran chips on screen then are re-checked with them (they carry a data-bface
  // too); a paran face never measured before is the next effect's. The catalog minor bodies'
  // chips are placed at a settle too, so their own change is a trigger as well (a body switched
  // on can leave the planets' chips exactly where they were).
  useEffect(() => {
    if (!badges.length && !minorBadges.length) return;
    const sizes = chipSizesRef.current;
    const seen = new Set<string>();
    let changed = false;
    frameRef.current
      ?.querySelector('.acg-edge-badges')
      ?.querySelectorAll<HTMLElement>('.acg-badge[data-bface]')
      .forEach((el) => {
        const face = el.dataset.bface as string;
        if (seen.has(face)) return;
        seen.add(face);
        // A zero box isn't laid out (hidden), which is "no measurement", not "no size".
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        if (!w || !h) return;
        const s = sizes.get(face);
        if (s && s.hw * 2 === w && s.hh * 2 === h) return;
        sizes.set(face, { hw: w / 2, hh: h / 2 });
        changed = true;
      });
    if (changed) scheduleBadgesRef.current();
  }, [badges, minorBadges]);

  // A paran chip's face the first time it is drawn — a row newly on screen, or the parans just
  // switched on. The paran chips are re-placed at every settle, so this reads the DOM only when
  // some chip on screen has a face never measured (a check over the state, no DOM, otherwise):
  // after a row's first appearance it costs nothing. A changed size of a face already measured is
  // caught by the settle's pass above, with the edge chips'.
  useEffect(() => {
    const sizes = chipSizesRef.current;
    if (paranBadges.every((b) => sizes.has(paranChipFace(b)))) return;
    let changed = false;
    frameRef.current
      ?.querySelector('.acg-edge-badges')
      ?.querySelectorAll<HTMLElement>('.paran-badge[data-bface]')
      .forEach((el) => {
        const face = el.dataset.bface as string;
        if (sizes.has(face)) return;
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        if (!w || !h) return;
        sizes.set(face, { hw: w / 2, hh: h / 2 });
        changed = true;
      });
    if (changed) scheduleBadgesRef.current();
  }, [paranBadges]);

  // The overlay host reports every commit and every change to the DOM in its track
  // (MapOverlayHost onPlaced). While the camera is still, a downstream layer's markers that are
  // no longer where the labels last stepped off them (overlayMarkersRef) re-place the labels:
  // a projection switch re-projects them a commit AFTER the projection effect's pass; a settle
  // that rotated or tilted re-projects them a frame after moveend's (the track's pan correction
  // can't follow a rotation, so moveend read them where they had been); and a layer re-rendering
  // on its own state — a saved pin added, deleted or synced in, the layer hidden — tells nobody
  // else. One read a frame at most, and a re-place only when something moved, which is also what
  // ends it: the re-place records what it read, and the commit it causes finds the same. Mid-
  // move it waits — moveend re-places, and the host's settle commit comes back here after it.
  const overlayCheckRafRef = useRef(0);
  const onOverlayPlaced = useCallback(() => {
    if (overlayCheckRafRef.current) return;
    overlayCheckRafRef.current = requestAnimationFrame(() => {
      overlayCheckRafRef.current = 0;
      const map = mapRef.current;
      if (!map || map.isMoving()) return;
      const now = rectsKey(readHudRects(map, OVERLAY_MARKER_SELECTORS));
      if (now !== overlayMarkersRef.current.key) computeBadgesRef.current();
    });
  }, []);
  // Zeroed as well as cancelled (the mount effect's cleanup says why): a non-zero ref reads as
  // "a check is already booked", and StrictMode's remount would otherwise start with a dead one.
  useEffect(
    () => () => {
      cancelAnimationFrame(overlayCheckRafRef.current);
      overlayCheckRafRef.current = 0;
    },
    [],
  );

  // Hover/focus tip for the MapLibre-rendered zoom + compass buttons (plain DOM,
  // so the portaled HoverTip is driven imperatively from the init effect below).
  const [ctrlTip, setCtrlTip] = useState<
    { pos: TipPos; title: string; hotkey?: string } | null
  >(null);
  // Same deal for the placed pin: it's a MapLibre Marker (plain DOM, not React),
  // so its tip is driven imperatively from the marker effect below — never a
  // native `title=` (which the app has retired in favour of the shared .ui-tip).
  const [pinTip, setPinTip] = useState<{ pos: TipPos; title: string } | null>(null);
  // And the standing home marker's — its own slot, not the pin's: the two can be
  // on screen together, and a shared one would blank whichever you left first.
  const [homeTip, setHomeTip] = useState<
    { pos: TipPos; title: string; hint: string } | null
  >(null);
  // Single-slot marker decoration (emblem in the head + tip override) — see
  // lib/extensions/pinAdornment. Null in the open core.
  const pinAdornment = usePinAdornment();
  // The standing home marker's own slot (same module). Set when a downstream marker
  // layer's marker stands on the home coordinate and hands its identity over rather
  // than stacking a second teardrop there. Null in the open core.
  const homeAdornment = useHomeAdornment();
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

    // Which basemap the map is on or loading. Offline: the live OpenFreeMap styles/tiles need the
    // network (the glass/dark STYLES are remote too), so open on the self-contained offline style
    // instead of a blank map. After that it moves only when a live load demonstrably fails or the
    // tile host answers again (basemapFallback.ts).
    let mode: BasemapMode = navigator.onLine ? 'live' : 'offline';

    // The probe passing doesn't fully guarantee construction succeeds (a context
    // can be granted then immediately lost), so guard the constructor too and fall
    // back the same way rather than letting an uncaught throw blank the app.
    // Right-to-left label shaping: registered by the first map, never at import (rtlTextPlugin.ts
    // says why). Before the map, so a tile that meets RTL text finds the registration under way.
    void ensureRtlTextPlugin();
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: mode === 'live' ? BASEMAP_STYLE_URLS[themeRef.current] : offlineStyle(themeRef.current),
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
        // The live style's sprite and glyph ranges go through a wait that gives up on silence:
        // MapLibre never does, and a hung sprite held `load` and `idle` — and the tiles with icons —
        // for as long as it hung (basemapFallback.ts, PATIENT).
        transformRequest: transformBasemapRequest,
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

    // ── The one path every style takes ──
    // `installed` is the style last handed to MapLibre; `building`, the chart build running on it;
    // `wanted`, a swap waiting for that build to finish. A swap must not land mid-build: the build
    // would carry on into the new style and that style's own build would then add every layer twice.
    let installed = { mode, theme: themeRef.current };
    let landedOnce = false;
    let building: Promise<void> | null = null;
    let wanted: { deadline: boolean } | null = null;
    let onStyleLoad: (() => void) | null = null;
    let stopWatch = () => {};

    // Everything the app draws, built on each style that lands (a swap drops every source, layer
    // and image the app added) — the first load and every swap after it alike.
    const build = async ({ mode: styleMode, theme }: typeof installed, first: boolean) => {
      // Apply the persisted projection first (before the async glyph load): setStyle resets it,
      // and a 3D reload mustn't briefly flash the flat map.
      applyProjection(map, projectionRef.current);
      await ensureGlyphImages(
        map,
        theme === 'dark' ? '' : LABEL_HALO_COLORS[theme],
        ZENITH_DISC_COLORS[theme],
        theme,
      );
      applyDetailToggles(map, detailRef.current);
      applyLabelContrast(map, theme);
      setupCustomLayers(
        map,
        LABEL_HALO_COLORS[theme],
        measureColorRef.current,
        ZENITH_DISC_COLORS[theme],
        ECLIPSE_LABEL_HALO[theme],
        // The grid's one neutral colour is per theme, and only a rebuild re-applies it: this
        // is the one path every style lands on (first load, theme change, basemap fallback).
        GEO_GRID_STYLE[theme],
      );
      // The swap dropped every feature-state with the sources: no zone is lifted any more, so
      // the next move must lift one afresh rather than think it already has.
      hoveredZoneRef.current = null;
      applyLsArrowVisibility(map, hideLsArrowsRef.current);
      pushData(map, dataRef.current, true, lsTransparentRef.current);
      // A running Slide owns the sources, rotated to its spin (see the data effect). A style that
      // lands mid-Slide — a theme change, or the basemap falling back or coming back by itself —
      // must paint at that spin too, or the lines leave the spun cage for their natal places while
      // the camera stays turned. Mid-drag the secondary layers stay empty, as the drag keeps them.
      if (slideActiveRef.current)
        spinPaintRef.current(spinDegRef.current, secondaryHiddenRef.current ? 'empty' : 'translate');
      computeBadgesRef.current();
      // The internal map ref is live now — let MapOverlayHost subscribe to a real instance.
      if (first) setMapReady(true);
      // Offline → draw the bundled world outline beneath the chart lines (the offline style has no
      // basemap of its own). The outline lands async, so re-run the detail toggles after it: a
      // live basemap blank must catch it too.
      if (styleMode === 'offline') {
        await installWorldFallback(map, theme);
        if (mapRef.current === map) applyDetailToggles(map, detailRef.current);
      }
    };
    const runBuild = (first: boolean) => {
      const done: Promise<void> = build(installed, first).finally(() => {
        if (building !== done) return;
        building = null;
        applyWanted();
      });
      building = done;
    };

    // While on the live style, watch it — its load closely, then lightly for as long as it stays, so
    // a connection lost mid-session falls back too; while on the offline one, look for the way back.
    const recovery = createBasemapRecovery({
      styleUrl: () => BASEMAP_STYLE_URLS[themeRef.current],
      onBack: () => swapBasemap('live', false),
    });
    const watch = (deadline: boolean) => {
      stopWatch();
      stopWatch = () => {};
      if (mode === 'offline') return recovery.start();
      recovery.stop();
      const styleUrl = BASEMAP_STYLE_URLS[installed.theme];
      stopWatch = watchLiveBasemap(map, deadline ? LIVE_BASEMAP_WAIT_MS : null, styleUrl, {
        ok: () => {
          recovery.landed();
          // The outline the light watch's swap will need, fetched while it still can be.
          warmWorldOutline();
          // The live style's credit arrives with its tile source, after the build placed the edge
          // badges around the shorter one it replaced (or, on the first load, around none): place
          // them again, clear of it.
          if (landedOnce) computeBadgesRef.current();
        },
        fail: () => swapBasemap('offline', false),
      });
    };
    // `deadline` false after a probe the tile host answered: a load that is merely slow then isn't
    // swapped away again — only a failed request can send it back.
    const swapBasemap = (next: BasemapMode, deadline: boolean) => {
      mode = next;
      wanted = { deadline };
      applyWanted();
    };
    const applyWanted = () => {
      if (!wanted || building || mapRef.current !== map) return;
      const { deadline } = wanted;
      wanted = null;
      const from = installed.mode;
      installed = { mode, theme: themeRef.current };
      watch(deadline);
      if (onStyleLoad) map.off('style.load', onStyleLoad);
      onStyleLoad = null;
      // Before the first style lands there is nothing to rebuild: the first-build handler below
      // builds on whichever style that is. After it, the handler goes on BEFORE setStyle — a JSON
      // style can diff in, and fire style.load, inside that call.
      if (landedOnce) {
        const handler = () => {
          onStyleLoad = null;
          runBuild(false);
        };
        onStyleLoad = handler;
        map.once('style.load', handler);
      }
      // Between the live and the offline style, replace rather than diff: the old style's requests
      // go with it, where a diff keeps a hung sprite request that holds back `load` and `idle` until
      // its bounded wait gives up on it. A theme change keeps the diff it always had.
      map.setStyle(
        mode === 'live' ? BASEMAP_STYLE_URLS[installed.theme] : offlineStyle(installed.theme),
        from === mode ? undefined : { diff: false },
      );
    };
    restyleRef.current = () => swapBasemap(navigator.onLine ? mode : 'offline', true);

    // The first build rides the first style to land, exactly as every swap's does — not MapLibre's
    // `load`, which waits for every visible basemap tile too. On a slow link that held the whole
    // chart back behind the basemap: on DevTools' "3G" preset the installed app's first tile came
    // at 22.7 s and the lines at about 40 s (2026-09-30). So on a healthy start the lines can now
    // appear a moment before the tiles fill in beneath them — the chart is what the reader opened
    // the app for, and a slow link shows that order anyway. Capture waits for the tiles itself
    // (captureFrame), and a data push isn't held behind them either (chartSourcesBusy).
    map.once('style.load', () => {
      landedOnce = true;
      runBuild(true);
    });
    watch(true);

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
      lastSettleAtRef.current = Date.now();
      setMapMoving(false);
    });
    // The timeline bar can be dragged anywhere; it dispatches 'astro:hud-moved'
    // when it moves, so re-dodge the labels off its new rect right away rather
    // than waiting for the next pan/zoom. So do the windows (useMovableHud), and the
    // nav and the top-left stack once they settle after moving by themselves
    // (lib/hudSettled). A stable wrapper (created once with the
    // map) lets add/removeEventListener pair on the same reference. The drag has
    // invalidated the cached HUD rects, so drop them before the recompute.
    const onHudMoved = () => {
      hudRectsRef.current = null;
      scheduleBadgesRef.current();
    };
    window.addEventListener('astro:hud-moved', onHudMoved);
    // The +/− control is one of those panels (HUD_SELECTORS) and moves by itself too: it eases
    // its own `top` over 0.32 s (Map.css) when the nav's published corner drops it under the bar
    // or lets it back up. The nav's announcement can land while it is still on its way — at
    // 560×820, toggling the readout, the first one came ~8 ms into its drop, and only a second,
    // from the top-left stack settling on the same curve, happened to catch it at rest (none where
    // the stack doesn't move, or isn't mounted). So its own transition's end re-places the labels.
    // Its own `top` only: transitionend bubbles from its buttons' colour fades.
    const ctrlCorner = ctrlRoot.querySelector<HTMLElement>('.maplibregl-ctrl-top-right');
    const onCtrlSettled = (e: TransitionEvent) => {
      if (e.target === ctrlCorner && e.propertyName === 'top') onHudMoved();
    };
    ctrlCorner?.addEventListener('transitionend', onCtrlSettled);
    ctrlCorner?.addEventListener('transitioncancel', onCtrlSettled);
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
      // Zeroed as well as cancelled: scheduleBadges takes a non-zero ref to mean "a frame is
      // already booked" and returns. StrictMode's mount → cleanup → mount hit it on every dev
      // load — the transparent-mode effect below books a frame on the first pass, this cancelled
      // it and left its id behind, and every later move, `astro:hud-moved` and resize then found
      // the ref set and did nothing for the rest of the session (the badges only moved on
      // moveend). Production mounts once and never saw it.
      if (badgeRafRef.current) cancelAnimationFrame(badgeRafRef.current);
      badgeRafRef.current = 0;
      window.removeEventListener('astro:hud-moved', onHudMoved);
      ctrlCorner?.removeEventListener('transitionend', onCtrlSettled);
      ctrlCorner?.removeEventListener('transitioncancel', onCtrlSettled);
      ctrlRoot.removeEventListener('click', onCreditsClick);
      ctrlTipCleanups.forEach((fn) => fn());
      setCtrlTip(null);
      markerRef.current?.remove();
      markerRef.current = null;
      // Every OTHER DOM marker cached in a ref has to go the same way, and for a
      // reason that is easy to miss: `map.remove()` destroys the container and every
      // marker element inside it, but a ref still holding that Marker survives. Each
      // marker's own effect then reads its ref, takes the "already exists" branch, and
      // calls setLngLat on an object whose element died with the previous map — so it
      // is never re-added, and the marker is gone for the rest of the session.
      //
      // HOME is the one that actually bit: it is the only marker that can already be
      // non-null on first paint (it comes from the stored chart rather than from
      // something the viewer just did), so it is the only one that exists during
      // StrictMode's mount → cleanup → mount, and it vanished for good on any load of a
      // chart that had a home. The others are created in response to a later gesture
      // and so happened to survive; they are listed here because the hazard is the
      // ref, not the marker, and the next one added would inherit it.
      homeMarkerRef.current?.remove();
      homeMarkerRef.current = null;
      eclipseMarkerRef.current?.remove();
      eclipseMarkerRef.current = null;
      arrivalMarkerRef.current?.remove();
      arrivalMarkerRef.current = null;
      skyStampRef.current?.remove();
      skyStampRef.current = null;
      // The same hazard in a flag: a data push deferred on THIS map waits on its events, and a
      // removed map never fires them — so a flag left set here refuses every later defer on the
      // next map, and any data change that lands while its sources are busy is dropped until
      // some unrelated change finds them settled. StrictMode's mount → cleanup → mount hit it on
      // every dev load (a line switched on stayed undrawn until the next toggle, because its
      // ephemeris file arrived a moment after the first push).
      idleDeferRef.current = false;
      // The basemap watch and probes answer to this map only; a swap still waiting for a build
      // is dropped by applyWanted's own map check.
      stopWatch();
      recovery.stop();
      restyleRef.current = () => {};
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
    // The same basemap in the new theme — the offline one if the browser is offline or the live
    // one has fallen back — rebuilt through the mount effect's style path.
    restyleRef.current();
  }, [theme]);

  // Switch projection on demand (2D ↔ 3D). To 2D snaps flat north-up; to 3D leaves
  // the camera where it is (free rotate/tilt). Overlays recompute for the new view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || projectionRef.current === projection) return;
    projectionRef.current = projection;
    // Before a style has landed setProjection throws, and the build that style gets applies
    // projectionRef.current itself. NOT gated on isStyleLoaded(): that also reads false while
    // tiles load — the first ones included, now that the chart is built before them — and a
    // toggle dropped there stays dropped: the control saying 3D over a flat map.
    try {
      applyProjection(map, projection);
    } catch {
      return;
    }
    // The flip resizes one of the panels the labels keep clear of: the corner control gains or
    // loses its compass (the `proj-2d` class, toggled just now), so the cached panel rects are
    // stale. This pass reused them until 2026-10-01 and nothing re-read them before the next pan:
    // at 1440×810, 2D → 3D left two transit DSC lines' chips 5 and 594 px off their own lines.
    hudRectsRef.current = null;
    scheduleBadges();
  }, [projection, scheduleBadges]);

  // Toggling transparent mode (which now carries the circle mask) doesn't move the camera, so
  // recompute the badges right away to apply / clear the clip + re-place the rim badges (a DIRECT
  // computeBadges, like the lsEdgeLabels effect, so the clip lands in the same frame as the
  // toggle rather than one later). This comment used to say a deferred pass "can be skipped /
  // cancelled" and that this was why the flip looked delayed. A booked frame is never skipped in
  // production; in development every deferred pass WAS a no-op for the whole session — the dead
  // scheduleBadges guard fixed in the mount effect's cleanup above — so a flip tried under
  // `npm run dev` waited for the next camera move. computeBadges reads lsTransparentRef, synced
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
    // Which line the open card is ABOUT. Both popups anchor on the same click
    // coordinate, so without this the hover tip lands on top of the card the
    // click just asked for — and it names the line the card's own title already
    // names, so it is pure duplication there. That includes a paran's computed
    // line ("Returns to the angles today · …"): the card carries it too, for the
    // spot that was clicked, so the way to read another spot along the same line
    // is to click there — the card moves and re-reads. Cleared on every close
    // path (the ✕, an empty-map click's remove(), and the [lineCard] identity
    // effect below) by the one listener — and set early, while a tap's card is
    // still pending (below), so the tip the tap raised doesn't flash up first.
    let cardLine: string | null = null;
    lineCardPopup.on('close', () => {
      cardLine = null;
    });
    // On a touch layout a line card waits a beat before it opens. A pin is placed by
    // a DOUBLE tap, and the first tap of one is an ordinary click — so with a finger's
    // reach a pin dropped anywhere near a line used to pop that line's card as a side
    // effect, left open over the pin it had nothing to do with. The wait is about one
    // double-tap interval; a second tap inside it re-arms with its own card (it may
    // be aimed elsewhere), and the double-click that follows cancels whatever is
    // pending. A mouse has a real click/double-click distinction and opens at once.
    const TAP_CARD_DELAY_MS = 300;
    let pendingCard: ReturnType<typeof setTimeout> | null = null;
    let tapCardOpenedAt = 0;
    const cancelPendingCard = () => {
      if (pendingCard == null) return;
      clearTimeout(pendingCard);
      pendingCard = null;
      // The early claim was only for the pending card; an open one keeps its own.
      if (!lineCardPopup.isOpen()) cardLine = null;
    };
    const clearLine = () => {
      hoveredLine = null;
      linePopup.remove();
    };
    // The geodetic grid's readout: the place under the cursor, then its geodetic AS and MC to
    // the minute, the sign glyph between degree and minute as in the Coordinates box. The
    // lowest-ranked tip — a zenith, a crossing or a line under the cursor names itself instead
    // — and driven off the cursor here rather than off the app's hover, which a placed pin
    // freezes. Its HTML is re-set only when the text changes; it moves on every frame.
    const geoPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 14,
      className: 'zenith-popup geo-readout-popup',
      maxWidth: '260px',
    });
    let geoHtml: string | null = null;
    const clearGeo = () => {
      geoHtml = null;
      geoPopup.remove();
    };
    const geoAngle = (label: string, z: TruncZodiac) =>
      `<span class="geo-readout-angle">${label} ${String(z.deg).padStart(2, '0')}°` +
      `<span class="astro-glyph">${SIGN_GLYPHS[z.signIdx]}</span>${String(z.min).padStart(2, '0')}'</span>`;
    const showGeo = (r: GeoReadout, at: maplibregl.LngLat) => {
      const head = r.place
        ? t('map.geoReadout.place', { place: escapeHtml(r.place) })
        : t('map.geoReadout.coords', { lat: fmtLatDM(at.lat), lng: fmtLngDM(at.lng) });
      const angles = (r.as ? [geoAngle(t('map.geoReadout.as'), r.as)] : [])
        .concat(geoAngle(t('map.geoReadout.mc'), r.mc))
        .join(' · ');
      // Past the polar circle the map's own polar caution: some degrees never rise there, and
      // the Ascendant can jump half the zodiac between neighbouring places.
      const html =
        `<div class="ui-tip geo-readout"><span class="ui-tip-title">${head}</span>` +
        `<span class="geo-readout-angles">${angles}</span>` +
        (r.polar ? `<span class="ui-tip-sub geo-readout-caution">${t('map.polarNote')}</span>` : '') +
        `</div>`;
      geoPopup.setLngLat(at);
      if (html !== geoHtml) {
        geoHtml = html;
        geoPopup.setHTML(html);
      }
      if (!geoPopup.isOpen()) geoPopup.addTo(map);
    };
    // The Ascendant zone under the cursor, lit by feature-state: the zone of the readout's OWN
    // AS sign (truncZodiac's rule), never a polygon hit-test — so the highlight and the readout
    // can't disagree anywhere, the polar caps included, where neighbouring places can rise half
    // the zodiac apart. Null clears it.
    const setZoneHover = (id: number | null) => {
      const prev = hoveredZoneRef.current;
      if (prev === id) return;
      hoveredZoneRef.current = id;
      // No source mid style swap (the swap drops every feature-state with it); and on unmount
      // this teardown runs after map.remove(), when the map has no style left to ask.
      let live: boolean;
      try {
        live = !!map.getSource('geo-asc-zones');
      } catch {
        return;
      }
      if (!live) return;
      if (prev != null) map.setFeatureState({ source: 'geo-asc-zones', id: prev }, { hover: false });
      if (id != null) map.setFeatureState({ source: 'geo-asc-zones', id }, { hover: true });
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
      // A catalog coin names itself "Eros (433)" (escaped — a catalog name is the one
      // string here that isn't ours); a planet stamp through the enum labels.
      const base =
        zen.kind === 'minor' ? minorNameHtml(zen.props, t) : (labels.planet(zen.planet) ?? zen.planet);
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
    // A chart-subject capture stands hover down entirely: the card covers the map, so
    // there is nothing under the cursor to name — and hover RELOCATES the chart, which
    // would leave the wheel on the card changing with a coastline nobody can see.
    const handleMove = (e: maplibregl.MapMouseEvent) => {
      if (measureActive || slideDraggingRef.current || chartSubject) return;
      const setCursor = (c: string) => {
        if (!slideActiveRef.current) map.getCanvas().style.cursor = c;
      };
      // A mouse hovers at a mouse's reach; on a touch layout this event is the tap's
      // own compatibility mousemove, so it takes the finger's reach the click does
      // (see hitReach).
      const reach = hitReach(isTouchLayout());
      // The geodetic readout for the point under the cursor (null off a geodetic map, or with
      // every grid layer off), and the Ascendant-zone highlight that follows it, Zone shading
      // on or off — the highlight whatever tip wins below, the readout only where none does.
      // Within 0.01° of a pole the readout has no AS, and nothing is lit. The longitude is
      // folded first: e.lngLat is unwrapped over a repeated world copy, and the host's
      // nearest-city lookup missed Toronto at 280.6°E that it finds at 79.4°W (review,
      // 2026-10-02).
      const geo = geoReadoutRef.current?.(e.lngLat.lat, canonicalLng(e.lngLat.lng)) ?? null;
      const ascZonesDrawn = (dataRef.current.geoAscZones?.features.length ?? 0) > 0;
      setZoneHover(geo?.as && ascZonesDrawn ? geoZoneId(geo.as.signIdx) : null);
      // A zenith stamp under the cursor wins: animate it + show the tooltip;
      // otherwise fall back to the map's CSS grab cursor.
      const zen = zenithAtPoint(map, e.point, reach.zenith);
      if (zen) {
        clearCross();
        clearLine();
        clearGeo();
        setCursor('pointer');
        showZenith(zen);
      } else {
        const cross = crossAtPoint(map, e.point, reach.cross);
        if (cross) {
          clearZenith();
          clearLine();
          clearGeo();
          setCursor('pointer');
          showCross(cross);
        } else {
          // A bare line under the cursor just names itself (hover tip); it isn't a
          // click target, so the cursor stays the map's default (no pointer).
          //
          // Except the one line an open interpretation card is about: the card
          // titles itself with that name and sits on the same coordinate, so the
          // tip would only cover the reading it was clicked for. Tested on the
          // RAW id, before the eclipse/paran salting below appends a cursor cell
          // to it. Any other line still names itself as usual. A tap's card that
          // is still pending counts as open: its tip would show for the wait and
          // then be swept away by the card it announced.
          //
          // The eclipse card the same way, for the eclipse's own curves: the card is
          // the full reading for its spot (every contact, the magnitude, the
          // obscuration) and the curve's tip is a one-line slice of the same thing,
          // so while it is open the tip only covers it. On a phone that was every
          // tap near the central line — the tap's own mousemove raises the tip at
          // the finger's reach (hitReach), and the card it opens sat under it. As
          // with a line card, reading another spot is a click there: the card moves.
          const line = lineAtPoint(map, e.point, t, labels, reach.line);
          if (
            line &&
            !((lineCardPopup.isOpen() || pendingCard != null) && line.id === cardLine) &&
            !(eclipseCardPopup.isOpen() && line.id.startsWith('eclipse'))
          ) {
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
                // Plain text by the seam's contract — escaped here as on the card.
                line.html = line.html.replace(
                  '</div>',
                  `<span class="ui-tip-sub">${escapeHtml(sub)}</span></div>`,
                );
                line.id += `@${Math.round(e.lngLat.lng * 4)}`;
              }
            }
            clearZenith();
            clearCross();
            clearGeo();
            showLine(line, e.lngLat);
          } else {
            clearZenith();
            clearCross();
            clearLine();
            // The readout only over no line at all: a line whose tip is held down for its own
            // open card is still a line, and the readout there would sit on that card instead.
            if (geo && !line) showGeo(geo, e.lngLat);
            else clearGeo();
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
      clearGeo();
      setZoneHover(null);
      onLeave?.();
    };
    const handleClick = (e: maplibregl.MapMouseEvent) => {
      // Same reasoning as hover: on a chart card every click lands on a map the user
      // cannot see, and its side-effects (fly-to-zenith, an overlay's tap-to-tag, a
      // pinned card) would all be things they did not aim at. Right-click still exits
      // the tool — that gesture is about the TOOL, not about a place on the map.
      if (measureActive || slideActive || chartSubject) return;
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
      //
      // A finger reaches further than a cursor (hitReach), here and for the lines below.
      const touch = isTouchLayout();
      const reach = hitReach(touch);
      const zen = zenithAtPoint(map, e.point, reach.zenith);
      if (zen) {
        if (zen.kind === 'minor') {
          // A catalog coin keys by its `mp:<n>` id — an id no PlanetName can collide with —
          // behind the routing prefix a planet's stamp keys by: '' on the chart's source
          // (natal or promoted), the overlay's tag on an overlay's coin. Its edge chips use
          // the same key (since 2026-10-01), so the chip and the coin share one fly-out /
          // fly-back toggle, as a planet's do.
          flyToZenith(zenithKey(zen.overlay ? (zen.tag ?? '') : '', zen.body), zen.lng, zen.lat);
          return;
        }
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
        // A curve's tip already up on this coordinate would sit over the card; handleMove
        // keeps the curves' tips down while the card stays open.
        if (hoveredLine?.startsWith('eclipse')) clearLine();
      } else if (lineCardRef.current) {
        // Outside eclipses mode, a click on a line pins its interpretation
        // card; a click on empty map dismisses it.
        //
        // Every tap supersedes the one before it, including a card still waiting
        // to open (see TAP_CARD_DELAY_MS).
        cancelPendingCard();
        if (touch) {
          // A crossing dot has no card of its own — only the tip its hover shows,
          // and a finger has no hover. So a tap on one shows that tip (the same
          // reach as the tap's own mousemove, so the two agree) rather than opening
          // the card of whichever of its two lines happened to rank first; and any
          // other tap takes a tip a previous tap left up.
          const cross = crossAtPoint(map, e.point, reach.cross);
          if (cross) {
            lineCardPopup.remove();
            clearLine();
            showCross(cross);
            return;
          }
          clearCross();
        }
        const hit = lineAtPoint(map, e.point, t, labels, reach.line);
        // The clicked line's CLOSEST approach to the reference point (placed pin, or natal
        // default), measured on THAT line's full geometry: found again by its source and
        // properties (sameFeatureProps), since the hit-test's own copy is cut to its tile.
        // It used to be whichever line in any collection ran nearest the click, which at a
        // crossing could be the other line. No match → no row, never a borrowed number.
        let dist: LineCardDistance | null = null;
        const ref = distanceRefRef.current;
        const fc = hit ? lineGeomRef.current[hit.source] : undefined;
        if (hit && ref && fc) {
          let km = Infinity;
          for (const f of fc.features) {
            if (sameFeatureProps(f.properties, hit.props)) {
              km = Math.min(km, nearestApproachKm(ref.lat, ref.lng, f.geometry));
            }
          }
          if (Number.isFinite(km)) dist = { km, type: ref.type };
        }
        // A paran's registered annotation, for the CLICKED spot — the same line the hover
        // tip adds (lib/extensions/paranAnnotation). The tip was its only home, so a finger,
        // which has no hover, could never read it; and a mouse lost it the moment it clicked,
        // because the card takes the tip down. The card carries it now.
        const extra =
          hit && hit.layerId.startsWith('parans')
            ? (getParanAnnotation()?.(hit.props as unknown as ParanProps, {
                lat: e.lngLat.lat,
                lng: e.lngLat.lng,
              }) ?? null)
            : null;
        const builder = lineCardRef.current;
        const html = hit ? builder(hit.layerId, hit.props, dist, extra) : null;
        if (html && hit) {
          const at = e.lngLat;
          const open = () => {
            lineCardPopup.setLngLat(at).setHTML(html);
            if (!lineCardPopup.isOpen()) lineCardPopup.addTo(map);
            // Remember the line, and take its hover tip down: the tip is already
            // open on this very coordinate (the click didn't move the cursor), so
            // it would sit over the card. handleMove keeps it down for this line
            // while the card stays open — see the guard there.
            cardLine = hit.id;
            clearLine();
          };
          if (touch) {
            // Claim the line now, so the tap's own tip stays down for the wait.
            cardLine = hit.id;
            pendingCard = setTimeout(() => {
              pendingCard = null;
              // A chart switch or overlay change inside the wait retires the builder
              // (and closes cards — the [lineCard] effect); don't open a stale reading.
              if (lineCardRef.current !== builder) {
                if (!lineCardPopup.isOpen()) cardLine = null;
                return;
              }
              open();
              tapCardOpenedAt = Date.now();
            }, TAP_CARD_DELAY_MS);
          } else {
            open();
          }
        } else {
          lineCardPopup.remove();
        }
      }
    };
    const handleDoubleClick = (e: maplibregl.MapMouseEvent) => {
      // A chart card hides the map, and moving the pin would silently recast the very
      // wheel it is showing — the worst of the invisible-gesture cases.
      if (measureActive || slideActive || chartSubject) return;
      // Neutral broadcast of the double-clicked point so a tool can treat a double-click as its own
      // gesture (e.g. re-placing a point on it). Fired for every dblclick; listeners ignore it if
      // they don't care. Sent BEFORE the spotlight guard so the tool still receives it.
      window.dispatchEvent(
        new CustomEvent<MapClickDetail>(MAP_DBLCLICK_EVENT, {
          detail: { lat: e.lngLat.lat, lng: e.lngLat.lng },
        }),
      );
      // A double-tap is a pin gesture, not a reading: the card its first tap armed
      // never opens, and one that opened anyway (a slow double-tap outlasting the
      // wait) is taken back down — a card it was never asked for, over the pin.
      cancelPendingCard();
      if (tapCardOpenedAt && Date.now() - tapCardOpenedAt < 2 * TAP_CARD_DELAY_MS) {
        lineCardPopup.remove();
      }
      tapCardOpenedAt = 0;
      // A line spotlight owns the gesture — don't drop / move the pin underneath it.
      if (spotlightActiveRef.current) return;
      // Double-tap drops / moves the pin — but not on a zenith stamp, whose single
      // clicks already fly there, so the stamp stays a fly-to target. Measured at the
      // same reach the click used, or a tap that flew to a stamp could also pin.
      if (zenithAtPoint(map, e.point, hitReach(isTouchLayout()).zenith)) return;
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
      // A tap's card still waiting must not open into a map whose handlers are being
      // rebound for a tool (Measure, Slide) that owns the clicks now.
      cancelPendingCard();
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
      clearGeo();
      setZoneHover(null);
      eclipseCardPopup.remove();
      eclipseCardPopupRef.current = null;
      lineCardPopup.remove();
      lineCardPopupRef.current = null;
    };
  }, [onHover, onLeave, onPlacePin, onRightClick, onMapClick, measureActive, slideActive, frameActive, chartSubject, flyToZenith, t, labels]);

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
  // aspect ratio (a margin all round leaves the HUD clear; a phone held upright lifts the
  // box to just under the top bars instead — see the placement below), so the framed region is
  // exactly what `captureFrame` exports. The map canvas AND its projected overlays
  // (edge labels, pin, local-horizon wheel) live inside .map-frame, so insetting
  // both confines the lines and keeps the overlays in register with the smaller view.
  // `cap` is the reserved caption-band height (css px); the map/badges are inset by it
  // at the bottom so they don't sit behind the caption.
  const [frameInset, setFrameInset] = useState<CaptureFrameBox | null>(null);
  // Where the caption breaks onto further lines: the index of the first field on each line
  // after the first, empty when every field fits on one. Measured from the live band (the
  // caption-fit effect below) and read here, so the band grows in the same geometry as the
  // inset and the watermark that follow it. Only the NUMBER of lines reaches this effect —
  // not the indices, which move nothing here.
  const [captionBreaks, setCaptionBreaks] = useState<number[]>([]);
  const captionLineCount = captionBreaks.length + 1;
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
      let iyb = bottomAlign ? 0 : Math.round((H - boxH) / 2);
      let iy = bottomAlign ? Math.round(H - boxH - iyb) : Math.round((H - boxH) / 2);
      // A phone held upright lifts the frame to just under the top bars instead of centring
      // it, so the room it frees is one piece BELOW the frame — where the Capture window docks
      // as a full-width sheet (CaptureHud's phoneCeiling) and the frame, its caption and the
      // controls that change them are all on screen at once. Centred, a 432×768 phone put the
      // frame at y 263–505 and the window, docked at the bottom, at 198–680: right over the
      // caption it was there to adjust.
      //
      // Only the vertical PLACE moves. The box keeps the size the centred layout gives it, to
      // the pixel (the frame's height is taken from the centred insets, rounding and all),
      // because the export is the frame's own size: lifting it changes where the picture is
      // composed on the screen, never what it is. And the camera's centre stays the canvas
      // centre through the resize, so whatever sat mid-screen when Capture armed sits
      // mid-frame — the frame comes to the view, the view isn't left behind under it.
      //
      // "The top bars" is the whole nav stack, the tool readout under the bar included (it
      // carries the compose hint while Capture is armed). Measured, not assumed: its height
      // follows the chart name, the readout's wrap and a notch's safe area (the stack's own top
      // is max(edge, safe-area-inset-top)). With no stack to measure, the centred layout stands.
      if (isPhonePortrait()) {
        const nav = document.querySelector<HTMLElement>('.topnav-stack')?.getBoundingClientRect();
        if (nav && nav.height > 0) {
          const frameH = H - iy - iyb;
          const below = Math.round(nav.bottom - host.getBoundingClientRect().top) + FRAME_NAV_GAP;
          // A frame too tall to fit under the bars keeps its foot on the screen's bottom edge
          // and laps the bars instead — as a centred one already did.
          iy = Math.max(0, Math.min(below, H - frameH));
          iyb = H - iy - frameH;
        }
      }
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
      // A caption too long for one line grows the band to two rather than ellipsizing what
      // the reader asked for. It was one nowrap line, so on a phone (a 22 px band, 10 px
      // type, ~326 px of room) turning on Coordinates added "· 48°N…" and the export kept
      // the same cut — the one field whose whole point is the full figure. The growth is
      // in HEIGHT only: the type stays sized off the one-line band, and the inset and the
      // watermark read `cap`, so the map lifts clear of the second line and the mark
      // re-centres beside both, in this same pass.
      const capLines = noCaption ? 0 : captionLineCount;
      const multiH = Math.max(
        bandH,
        Math.round(captionFontPx(bandH) * (capLines * CAPTION_LINE_EM + CAPTION_BAND_PAD_EM)),
      );
      const cap = capLines === 0 ? 0 : capLines === 1 ? bandH : multiH;
      // The box dimensions are kept so the details panel can size its wheel to the room
      // the frame actually has — in BOTH axes (see fitCaptureWheel).
      const next: CaptureFrameBox = {
        l: il,
        t: iy,
        r: ir,
        b: iyb,
        cap,
        capLines,
        bandH,
        boxW: Math.round(boxW),
        boxH: Math.round(boxH),
      };
      // Equality-guarded: the nav observer below re-runs this on every change of the bars'
      // size, most of which move nothing here — and a fresh object would resize the GL map
      // (the layout effect on frameInset) for each of them.
      setFrameInset((prev) =>
        prev &&
        (Object.keys(next) as (keyof CaptureFrameBox)[]).every((k) => prev[k] === next[k])
          ? prev
          : next,
      );
    };
    compute();
    window.addEventListener('resize', compute);
    // On a phone the frame's top follows the nav stack (above), which changes height without
    // the window resizing — the readout swapping in the compose hint as Capture arms, a long
    // chart name, the hint re-wrapping. Watched only where it's read; a desktop never reads it.
    const nav = isPhone() ? document.querySelector('.topnav-stack') : null;
    const navRo = nav ? new ResizeObserver(compute) : null;
    if (nav) navRo?.observe(nav);
    return () => {
      window.removeEventListener('resize', compute);
      navRo?.disconnect();
    };
  }, [frameActive, frameAspect, leftInset, noCaption, captionLineCount]);

  // Caption fit: does the enabled caption fit the band on one line, and if not, where does
  // it break? Measured on the LIVE band, because the face is not ours to assume — a
  // downstream build sets its own on .capture-caption-text (and loads it late), so a canvas
  // measure in the core's system font would break in the wrong place. A throwaway probe
  // carrying that same class is filled with each candidate first line and measured, then
  // removed: off-flow and hidden, so measuring never moves the band, and independent of
  // the split currently drawn, so the answer can't feed back on itself.
  //
  // A break is at a FIELD boundary — a field is never cut in half across the lines (a
  // latitude on one line, its longitude on the next, reads as two places) — and the split is
  // chosen by chooseCaptionBreaks: one line if everything fits on it, else two, the split
  // that cuts least; a third only where two can't hold the fields at all (CAPTION_MAX_LINES).
  // It used to be greedy, line one taking all it could: that is the best split while
  // everything fits, and not once something has to give — the line it overloads could need
  // more cut than its fields had, while line one sat half empty.
  //
  // Where even two lines can't hold everything, the WIDEST field on the overflowing line
  // is the one that gives way (`is-shrink`), not whichever came last. A plain line
  // ellipsis cut from the end, and on a phone the end of line two is usually Coordinates:
  // "San Francisco, California, United States" pushed "37°46'N 122°25'W" off the band,
  // the field whose whole point is the full figure. The widest field is nearly always a
  // place name or the Calculations line — the ones that still read with their tail cut.
  // It gives down to a floor of a few characters (CAPTION_FIELD_FLOOR_EM), and then the
  // next widest gives too (`caps`, below): on a narrow frame — up to about 312 px, a 4:5 or
  // 1:1 on a landscape phone — line two could need more than the widest field had, and the
  // whole of it went: the time cut to "12:…", then "..", then nothing, with a separator
  // left standing in front of the coordinates (2026-10-01).
  //
  // The room is the band less the watermark's reserve on the right: 22% of the band, or —
  // where that is less than the mark itself, as on the same narrow frames (a 72 px wordmark
  // against 63 px of reserve at 288 px) — the mark's measured width, with the half-unit
  // inset it stands at and as much again clear of the text. Before that the caption's box
  // ran under the mark there, and its last characters were drawn beneath it.
  const captionRef = useRef<HTMLDivElement>(null);
  // Each field's natural width, the separator's and the line's room (px), measured with the
  // break; they pick the field that shrinks and how far each gives. Null until measured —
  // the last field shrinks then, as a plain line would.
  const [captionFit, setCaptionFit] = useState<{
    widths: number[];
    sep: number;
    avail: number;
  } | null>(null);
  // Bumped when a web font finishes loading, so a caption measured in the fallback face
  // is measured again in the real one.
  const [captionFontEpoch, setCaptionFontEpoch] = useState(0);
  useEffect(() => {
    if (!frameActive || typeof document === 'undefined' || !document.fonts) return;
    const bump = () => setCaptionFontEpoch((n) => n + 1);
    document.fonts.addEventListener('loadingdone', bump);
    return () => document.fonts.removeEventListener('loadingdone', bump);
  }, [frameActive]);
  const captionKey = frameCaptionLines.join('\u0000');
  useLayoutEffect(() => {
    const band = captionRef.current;
    const fields = frameCaptionLines;
    if (!band || fields.length === 0 || !frameInset) {
      setCaptionBreaks((prev) => (prev.length ? [] : prev));
      return;
    }
    // The watermark's reserve (see above), set on the band BEFORE its room is read, so the
    // read is of the band as it will be drawn. Written straight onto the element — this div
    // takes no style prop, so React leaves it alone — and on the band rather than the
    // frame, whose style attribute CaptureHud watches for the frame moving. The export's
    // clone carries it with the band. The mark is sized off the one-line unit, so it moves
    // with bandH, and with the brand's face loading (captionFontEpoch).
    const mark = band.parentElement?.querySelector<HTMLElement>('.capture-watermark');
    const markW = mark ? mark.getBoundingClientRect().width : 0;
    const reserve = markW > 0 ? `${Math.ceil(markW + frameInset.bandH)}px` : '';
    if (band.style.getPropertyValue('--capture-caption-mark') !== reserve) {
      if (reserve) band.style.setProperty('--capture-caption-mark', reserve);
      else band.style.removeProperty('--capture-caption-mark');
    }
    const cs = getComputedStyle(band);
    const avail = band.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const probe = document.createElement('span');
    probe.className = 'capture-caption-text capture-caption-probe';
    probe.setAttribute('aria-hidden', 'true');
    band.appendChild(probe);
    const measure = (text: string): number => {
      probe.textContent = text;
      return probe.getBoundingClientRect().width;
    };
    // Each field and the separator on their own, as the band lays them out (each its own flex
    // item); a line is the sum.
    const widths = fields.map(measure);
    const sep = measure(CAPTION_FIELD_SEP);
    probe.remove();
    const brks = chooseCaptionBreaks(widths, sep, {
      // A pixel of slack: the export rasteriser measures text a hair wider than the browser.
      room: avail - 1,
      floor: CAPTION_FIELD_FLOOR_EM * captionFontPx(frameInset.bandH),
      keep: frameCaptionKeep,
    });
    setCaptionBreaks((prev) =>
      prev.length === brks.length && prev.every((b, i) => b === brks[i]) ? prev : brks,
    );
    const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
    setCaptionFit((prev) =>
      prev &&
      prev.widths.length === widths.length &&
      prev.widths.every((w, i) => near(w, widths[i])) &&
      near(prev.sep, sep) &&
      near(prev.avail, avail)
        ? prev
        : { widths, sep, avail },
    );
    // captionKey stands in for the fields (a fresh array each App render); frameInset's
    // width and one-line height are what the room and the type size come from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captionKey, frameInset?.boxW, frameInset?.bandH, noCaption, frameActive, captionFontEpoch]);
  // The band's fields, line by line, each line naming the field that gives way if it
  // overflows (`shrink`, an index into that line). More than one line only once the geometry
  // has sized the band for them (capLines), and only for breaks that still index the
  // current fields — between a field toggle and its re-measure the old breaks can point
  // past the end, and the old widths can belong to other fields (then: the last shrinks).
  //
  // "Widest" alone isn't enough to keep the figures whole: the coordinates are wider than
  // a short place, so a long name that pushes the date onto line two can leave
  // "Jun 5, 1941 · 09:30 UTC+01:00 · Rome, Italy · 41°N53'36" 12°E…" — the latitude kept,
  // the longitude cut, on the one field whose promise is the full figure. So the field the
  // host names in `frameCaptionKeep` is passed over while its line has another to give.
  //
  // `caps` (per field, px or null) is how far each field gives when the line is measured to
  // overflow: the shrinking field first, down to the floor, then the next widest that may
  // give, and so on — so no field is cut to nothing, which is what left a separator dangling.
  // Only once the band is drawn the way it was measured (one line, or two the geometry has
  // made room for): in the pass between a break and its taller band, a one-line row would
  // cut several fields for a frame. Past every floor the line still clips, the last resort.
  const captionRows: { fields: string[]; shrink: number; caps: (number | null)[] }[] = (() => {
    const all = frameCaptionLines.length ? [...frameCaptionLines] : frameCaptionText ? [frameCaptionText] : [];
    const n = all.length;
    if (n === 0) return [];
    const fit = captionFit && captionFit.widths.length === n ? captionFit : null;
    const widths = fit?.widths ?? null;
    const usable = captionBreaks.every((b, i) => b > (i ? captionBreaks[i - 1] : 0) && b < n);
    const split = captionBreaks.length > 0 && usable && frameInset?.capLines === captionBreaks.length + 1;
    const settled = captionBreaks.length === 0 || split;
    const floor = CAPTION_FIELD_FLOOR_EM * captionFontPx(frameInset?.bandH ?? 0);
    // The keep index points into frameCaptionLines; the joined fallback has no fields.
    const keep = frameCaptionLines.length ? frameCaptionKeep : null;
    const row = (from: number, to: number) => {
      const mayGive = (i: number) => i !== keep || to - from === 1;
      // The last field that may give way (a plain line ellipsis cuts from the end), then
      // the widest of them once measured.
      let shrink = to - 1;
      while (shrink > from && !mayGive(shrink)) shrink--;
      if (widths) {
        for (let i = from; i < to; i++) if (mayGive(i) && widths[i] > widths[shrink]) shrink = i;
      }
      const caps: (number | null)[] = Array.from({ length: to - from }, () => null);
      if (fit && settled) {
        // How far the line runs past its room, with the same pixel of slack the break took.
        let over = (to - from - 1) * fit.sep - (fit.avail - 1);
        for (let i = from; i < to; i++) over += fit.widths[i];
        // The shrinking field first, then the rest that may give, widest first.
        const rest: number[] = [];
        for (let i = from; i < to; i++) if (i !== shrink && mayGive(i)) rest.push(i);
        rest.sort((a, b) => fit.widths[b] - fit.widths[a]);
        for (const i of [shrink, ...rest]) {
          if (over <= 0) break;
          const give = Math.min(over, fit.widths[i] - Math.min(fit.widths[i], floor));
          if (give <= 0) continue;
          caps[i - from] = Math.floor(fit.widths[i] - give);
          over -= give;
        }
      }
      return { fields: all.slice(from, to), shrink: shrink - from, caps };
    };
    if (split) {
      const starts = [0, ...captionBreaks];
      return starts.map((a, i) => row(a, starts[i + 1] ?? n));
    }
    return [row(0, n)];
  })();

  // The Capture "Extras" panel (planet/angle positions) docks LEFT for landscape frames
  // and TOP otherwise; it measures its own content and reports the cross-axis px here, and
  // the framed map + edge badges inset by that much (via the --capture-extra-* vars below)
  // so the lines stay clear of it — exactly like the caption band. Scalar state, separate
  // from the frame box; reset to 0 whenever the panel isn't shown so the map re-fills.
  // With the chart as the export's subject the panel FILLS the frame instead, covering the
  // map rather than docking beside it — so it reports no inset and both vars stay 0.
  const captureLandscape = !!frameAspect && frameAspect >= 1.3;
  const showExtras = frameActive && !!frameExtras;
  // A chart card covers the frame instead of docking beside the map, so it insets nothing.
  const extraSide: 'left' | 'top' | 'fill' = chartSubject
    ? 'fill'
    : captureLandscape
      ? 'left'
      : 'top';
  // The wheel and its balance grid stack down where the spare room is vertical (a rail, a
  // portrait/square card) and sit side by side where it's horizontal (a band, a wide card).
  const clusterAxis: 'row' | 'column' = chartSubject
    ? captureLandscape
      ? 'row'
      : 'column'
    : extraSide === 'top'
      ? 'row'
      : 'column';
  // Cheap pure arithmetic over the frame box, and deliberately blind to which view is
  // currently drawn — see frameWheelGrid. A phone card is held to the lower floor, since
  // its frame can't be made any bigger (see the floors beside fitCaptureWheel).
  const wheelFit = fitCaptureWheel(
    frameInset,
    extraSide,
    frameWheelGrid,
    clusterAxis,
    capturePhone,
  );
  const wheelSize = wheelFit.wheelPx;
  const canWheel = wheelFit.canWheel;
  const [extraSize, setExtraSize] = useState(0);
  // The panel's own measurement of whether it is cutting content off (see CaptureExtras).
  const [extraClipped, setExtraClipped] = useState(false);
  const onExtraMeasure = useCallback((px: number, clipped: boolean) => {
    // Round + equality-guard so a steady ResizeObserver tick can't loop with resize().
    const v = Math.round(px);
    setExtraSize((prev) => (prev === v ? prev : v));
    setExtraClipped((prev) => (prev === clipped ? prev : clipped));
  }, []);
  useEffect(() => {
    if (!showExtras) {
      setExtraSize(0);
      setExtraClipped(false);
    }
  }, [showExtras]);
  // Publish the fit so the tool can offer or decline the wheel view BEFORE an export —
  // the whole point of working it out here rather than letting the user discover a sliced
  // wheel in the saved file. Depends on the three scalars, not on the object holding them,
  // so a resize tick that lands on the same numbers doesn't re-notify.
  useEffect(() => {
    onFrameFit?.({ wheelPx: wheelSize, canWheel, clipped: extraClipped });
  }, [onFrameFit, wheelSize, canWheel, extraClipped]);

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
  //   • NO basemap in the frame at all (a chart-subject capture) — same as above: CSS hides the
  //     control (.map-frame.chart-only), and the failsafe must be the BTN rather than the data
  //     credit, since crediting a basemap's sources on a frame that shows no basemap would be
  //     a claim about the picture that isn't true.
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
    const want = hideBasemap || chartSubject ? BTN : dataCredit || BTN;
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
  }, [frameActive, hideBasemap, chartSubject]);

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
  // `mode` for the heavy SECONDARY layers (everything but the cage — the planets' and
  // the catalog minor bodies' angle lines — and the parans): 'translate'
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
        // `deg` arrives wrapped (wrapSpin); `true` also brings each feature back within the tiler's
        // fold — see translateLng.
        src?.setData(translateLng((fc ?? empty) as FeatureCollection, -deg, true));
      };
      set('acg-lines', d.lines); // the cage always tracks the spin
      // Parans stay live through the spin too: they're cheap straight parallels,
      // and watching the ground turn against them is much of what the spin is FOR
      // (the daily rotation is those pairings' time dimension) — so they must not
      // vanish with the heavy layers mid-drag.
      set('parans', d.parans);
      // Catalog minor-body lines ARE cage: natal angle lines of real bodies, resampled
      // at natal+Δt with the planets' (App's minor positions follow the same moment), so
      // they hold their screen position through a drag rather than blinking out with the
      // secondary layers. Capped at 20 bodies, their per-frame re-tile is of the order
      // of the planets' own; empty (the common case) costs nothing.
      set('minor-lines', d.minorLines);
      // Their parans with the planets stay live with the planets' parans, for the same
      // reason the parans do (above).
      set('minor-parans', d.minorParans);
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
      // …and their zenith coins travel with the planets' stamps: hidden mid-drag,
      // restored translated when the spin settles.
      sec('minor-zenith', d.minorZenith);
      sec('ecliptic', d.ecliptic);
      const eclipse = splitEclipse(d.eclipse);
      sec('eclipse', eclipse.curves);
      sec('eclipse-fill', eclipse.fills);
      // The overlay (transit/progression) layers are NOT pinned to the natal cage —
      // they belong to a different moment, so they're left untranslated and ride with
      // the basemap as it spins (this feature only fixes the natal linework).
    },
    [],
  );
  useEffect(() => {
    spinPaintRef.current = spinPaint;
  }, [spinPaint]);

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

    // The spin, UNWRAPPED: it is the elapsed time (dtDaysOf), and a slide of several days is a
    // real reading. Everything the map RENDERS takes it folded to one turn (wrapSpin) — the
    // camera centre and every rotated source — because the tiler silently drops geometry more
    // than a world copy out (see translateLng): fed the raw angle, the pinned lines thinned out
    // after a day or so of slide and were gone by two, over a basemap that kept drawing.
    // spinDegRef carries the folded angle to everything else that renders at the spin (badges,
    // flies, the Local Space origin, a style landing mid-slide).
    let spinDeg = 0;
    let dragStartX: number | null = null;
    let spinAtDragStart = 0;
    // A TRUE GRAB: the ground under the pointer when a drag begins stays under it, at any zoom
    // on any screen. (It used to be a fixed half-turn per canvas width, which matched the
    // pointer at one zoom per screen size and otherwise ran ahead of it — 1.3× on a desktop, 4×
    // on a phone, the grabbed city sliding out from under the finger.) The spin moves only the
    // camera's longitude, bearing and pitch held at 0, so what a drag needs is how many degrees
    // east of the camera centre the pointer's column lies:
    //   flat  — linear: the world is 512·2^zoom px wide (MapLibre's tile size), so a degree is
    //           1/360 of that at every column;
    //   globe — not linear, the sphere foreshortening toward its limb, so it's read off the
    //           projection (globeOffset). Turning the globe about its axis shifts every pixel's
    //           longitude by the same amount, so that offset doesn't depend on how far the spin
    //           has got — only on the zoom, which is why a mid-drag zoom re-anchors (grabAt).
    //           Off the globe's edge there is no ground to hold, and the drag carries on at the
    //           flat rate — which is the true grab at the globe's centre, MapLibre scaling the
    //           globe to match the flat map there.
    // Zoomed in, a stroke therefore covers little time; the readout's minute and hour nudges are
    // the way to cover more without zooming out.
    let degPerPx = 0;
    let grabRow = 0; // globe: the screen row the drag began on
    let grabOffset: number | null = null; // globe: degrees east of centre at the grab; null = flat rate
    let lastX = 0;
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
        spinPaint(spinDegRef.current, 'empty');
      }
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        settleTimer = 0;
        secondaryHiddenRef.current = false;
        spinPaint(spinDegRef.current, 'translate');
        computeBadgesRef.current();
        lastSettleAtRef.current = Date.now();
        setMapMoving(false);
      }, 140);
    };

    // Rotate every layer + the camera to the current spin. These run at the rAF rate
    // (smooth); the readout/resample callback is throttled (it triggers App renders and
    // the ephemeris recompute, neither of which needs per-frame fidelity since the cage
    // barely drifts within a frame).
    const apply = () => {
      raf = 0;
      // θ modulo a turn: the same picture as the unwrapped spin, inside the range the tiler keeps.
      const shown = wrapSpin(spinDeg);
      spinDegRef.current = shown;
      // Layers and camera both shift by −θ: their relative offset is unchanged, so the
      // cage holds its screen position while the basemap (camera-only) rotates by θ.
      map.setCenter([baseLng - shown, baseLat]);
      // While the secondary layers are hidden (active spin), re-tile only the cage.
      spinPaint(shown, secondaryHiddenRef.current ? 'skip' : 'translate');
      const now = performance.now();
      if (now - lastReport > 66) {
        lastReport = now;
        onSlide?.(dtDaysOf(spinDeg));
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };

    // Degrees east of the camera centre at screen column `x` on the grab's row, on the globe —
    // null in flat view, and where that pixel misses the sphere (MapLibre then answers with the
    // nearest point on the horizon, which no longer moves with the pointer).
    const globeOffset = (x: number): number | null => {
      if (projectionRef.current !== '3d') return null;
      const ll = map.unproject([x, grabRow]);
      const back = map.project(ll);
      if (Math.abs(back.x - x) > 1 || Math.abs(back.y - grabRow) > 1) return null;
      return wrapSpin(ll.lng - map.getCenter().lng);
    };
    // (Re-)anchor the grab at the pointer: on drag start, and after a zoom, which changes how many
    // degrees a pixel holds.
    const grabAt = (x: number, y: number) => {
      dragStartX = x;
      lastX = x;
      grabRow = y;
      spinAtDragStart = spinDeg;
      degPerPx = 360 / (512 * 2 ** map.getZoom());
      grabOffset = globeOffset(x);
    };

    // Shared mouse/touch drag — `x`, `y` are the pointer's screen position.
    const beginDrag = (x: number, y: number) => {
      if (dragStartX !== null) return; // already dragging (ignore touch↔synthetic-mouse dup)
      slideDraggingRef.current = true;
      // Halt any in-flight camera animation (a badge-click fly, an ease) — otherwise
      // the animation keeps writing the camera every frame while apply() writes it
      // back, and the two fight in visible lurches. Stopping freezes the camera
      // wherever the fly reached; the re-base below continues the spin from there.
      map.stop();
      // Re-base from the live camera (centre = base − θ, θ as last RENDERED — spinDegRef — which
      // is what the camera holds even while an apply is still pending), so any camera move since
      // the last drag — a badge-click fly, a scroll-zoom recentre — is absorbed and this drag
      // continues smoothly instead of jumping back to the old base.
      const c = map.getCenter();
      baseLng = c.lng + spinDegRef.current;
      baseLat = c.lat;
      grabAt(x, y);
      map.getCanvas().style.cursor = 'grabbing';
    };
    const moveDrag = (x: number) => {
      if (dragStartX === null) return;
      // Drag right ⇒ spin east ⇒ time forward (continents flow rightward).
      const off = grabOffset === null ? null : globeOffset(x);
      if (grabOffset !== null && off !== null) {
        spinDeg = spinAtDragStart + wrapSpin(off - grabOffset);
      } else {
        if (grabOffset !== null) {
          // Off the globe's edge: nothing left to hold. Carry on from the last pointer
          // position that had ground under it, at the flat rate.
          dragStartX = lastX;
          spinAtDragStart = spinDeg;
          grabOffset = null;
        }
        spinDeg = spinAtDragStart + (x - dragStartX) * degPerPx;
      }
      lastX = x;
      schedule();
      markSpinning();
    };
    const onDown = (e: maplibregl.MapMouseEvent) => {
      if (e.originalEvent.button !== 0) return; // left only (right-click cancels)
      beginDrag(e.point.x, e.point.y);
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
      if (e.points.length === 1) beginDrag(e.point.x, e.point.y);
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
    // and beginDrag re-bases anyway.) The grab re-anchors too: the zoom changed how many
    // degrees a pixel holds, so the old anchor would map the pointer to the wrong place —
    // a jump on the next move instead.
    const onZoomMidDrag = () => {
      if (dragStartX === null) return;
      const c = map.getCenter();
      baseLng = c.lng + spinDegRef.current;
      baseLat = c.lat;
      grabAt(lastX, grabRow);
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
      baseLng = c.lng + spinDegRef.current;
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
    if (map.getSource('acg-lines') && !chartSourcesBusy(map)) {
      if (slideActiveRef.current) {
        // Slide owns the sources (rotated to the current spin) — re-apply at θ rather
        // than push natal positions, which would detach the layers from the spun cage.
        // While spinning, only the cage + parans are live (secondary hidden), so
        // re-tile just those.
        spinPaint(spinDegRef.current, secondaryHiddenRef.current ? 'skip' : 'translate');
      } else {
        pushData(map, { lines, angleLines, parans, orbBands, starLines, minorLines, minorZenith, minorParans, nightShade, geoGridMc, geoGridAsc, geoZones, geoAscZones, uncertaintyBands, localSpace, localSpaceCross, zenith, nadir, ecliptic, overlay, eclipse }, false, lsTransparentRef.current);
        computeBadges();
      }
    } else {
      // Not ready — usually a transient: the chart's sources are mid-update (a setData still
      // tiling; see chartSourcesBusy), or a style swap hasn't rebuilt them yet. Defer until the
      // chart's sources settle, with `idle` as the backstop, rather than `load` — `load` only ever
      // fires on the FIRST style load, so a deferred push after that would be dropped, stranding
      // whatever data was last set (e.g. the filtered subset when a line spotlight clears).
      // `dataRef.current` carries the latest props. Not `idle` alone: it also waits for every
      // basemap tile, which on a slow link held each change of chart back for as long as the
      // tiles took. The deferred push must respect an active slide exactly like the live branch
      // above: a spin-drag re-tiles the cage every frame, so its bucket resamples land here, and a
      // raw (untranslated) push would snap the spun cage back to natal (and stacked defers would
      // repeat it).
      if (idleDeferRef.current) return;
      idleDeferRef.current = true;
      const run = () => {
        map.off('idle', run);
        map.off('sourcedata', onSourceData);
        idleDeferRef.current = false;
        if (slideActiveRef.current) {
          spinPaint(spinDegRef.current, secondaryHiddenRef.current ? 'skip' : 'translate');
        } else {
          pushData(map, dataRef.current, false, lsTransparentRef.current);
          computeBadges();
        }
      };
      const onSourceData = () => {
        if (map.getSource('acg-lines') && !chartSourcesBusy(map)) run();
      };
      map.on('idle', run);
      map.on('sourcedata', onSourceData);
    }
  }, [lines, angleLines, parans, orbBands, starLines, minorLines, minorZenith, minorParans, nightShade, geoGridMc, geoGridAsc, geoZones, geoAscZones, uncertaintyBands, localSpace, localSpaceCross, localSpaceOrigin, zenith, nadir, ecliptic, overlay, eclipse, lsTransparent, slideActive, computeBadges, spinPaint]);

  // New Ascendant-zone data (the readout coming or going, the zones finishing their build)
  // drops the highlight: feature-state outlives setData, so a zone lit when the collection
  // emptied would come back lit with it, under no cursor. The next move lights the zone under
  // the cursor afresh.
  useEffect(() => {
    const map = mapRef.current;
    const id = hoveredZoneRef.current;
    if (!map || id == null) return;
    hoveredZoneRef.current = null;
    if (map.getSource('geo-asc-zones')) map.setFeatureState({ source: 'geo-asc-zones', id }, { hover: false });
  }, [geoAscZones]);

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
    // The pin standing ON the home place wears home's colour: the house marker
    // stands down under it (the host passes no `home` then), and without this the
    // spot would silently lose its identity the moment you read the chart there.
    el.classList.toggle('home', pinType === 'home');
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
      pinAdornment?.tip ??
      (pinType === 'natal'
        ? t('map.pin.natal')
        : pinType === 'home'
          ? t('map.pin.home')
          : t('map.pin.custom'));
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

  // Where the last camera jump landed. A jump to a named settlement needs nothing —
  // the basemap has drawn and labelled it already — but a jump to a bare coordinate
  // arrives on tiles that name nothing, at a point that isn't even screen centre
  // (flyWithSidebarOffset nudges it), so the viewer is left to guess which rooftop
  // was meant. The mark answers that and keeps answering it while they pan around;
  // the label chip answers "which one was it" and then gets out of the way.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!arrivalMark) {
      arrivalMarkerRef.current?.remove();
      arrivalMarkerRef.current = null;
      return;
    }
    const { lat, lng, label } = arrivalMark;
    if (!arrivalMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'arrival-mark';
      // Adopt the arrival. Once a host has given the click a meaning it is the
      // mark's OWN gesture, so it is stopped here rather than offered on a
      // claimable channel the way a pin click is: markers sit inside the canvas
      // container, so anything left to bubble reaches MapLibre's own click
      // handling and would open a line card under the crosshair the viewer just
      // aimed at. The host withdraws the handler when it wants the click to pass
      // through instead — and no handler means no stopPropagation, which is why
      // this returns BEFORE stopping rather than after.
      // Read the coordinate off the MARKER, never the effect's closure — this
      // listener binds once and outlives every later arrival.
      el.addEventListener('click', (e) => {
        const at = arrivalMarkerRef.current?.getLngLat();
        if (!at || !onArrivalClickRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        onArrivalClickRef.current(at.lat, at.lng);
      });
      // Swallow double-clicks, as the pin marker does: one that reaches the map
      // re-places the pin at the CURSOR, which is the aimed point only by luck. A
      // host whose click RETIRES the mark (the app's does) never gets here — the
      // element is gone before the second click lands — but one that leaves the
      // mark up would, and the two-click misfire is silent when it happens.
      el.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      arrivalMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);
    } else {
      arrivalMarkerRef.current.setLngLat([lng, lat]);
    }
    const el = arrivalMarkerRef.current.getElement();
    // Rebuilding the markup is what replays the animations — toggling a class on
    // the same nodes would not. `stamp` changes on every jump, so arriving at the
    // SAME point twice pings twice.
    el.classList.remove('is-arrived');
    el.innerHTML =
      '<span class="arrival-mark-ping" aria-hidden="true"></span>' + ARRIVAL_MARK_SVG;
    if (label) {
      const chip = document.createElement('span');
      chip.className = 'arrival-mark-label';
      // textContent, never innerHTML — this string comes from a search provider.
      chip.textContent = label;
      el.appendChild(chip);
    }
    // The ping fires on ARRIVAL, not on the pick: a flight's duration scales with
    // its distance, so a long one would burn the pulse off-screen before anyone
    // saw it. The mark itself flies in with the camera. A gesture that interrupts
    // the flight ends it too, which is the behaviour we want — the viewer has
    // arrived, however they got there.
    const arrive = () => el.classList.add('is-arrived');
    if (map.isMoving()) map.once('moveend', arrive);
    else arrive();
    return () => {
      map.off('moveend', arrive);
    };
  }, [arrivalMark]);

  // Claim pointer events only where a click actually MEANS something. Its own
  // effect, not a line in the one above: a host withdraws the handler the moment
  // another gesture owns map clicks, and rebuilding the markup to reflect that
  // would replay the arrival ping every time a tool opened. While withdrawn the
  // mark is inert AND click-through — no pointer cursor, no hover swell, and the
  // click reaches the map, so the tool waiting on it is not quietly robbed.
  useEffect(() => {
    arrivalMarkerRef.current?.getElement().classList.toggle('is-clickable', !!onArrivalClick);
  }, [onArrivalClick, arrivalMark]);

  // The standing HOME marker: where the active chart's subject lives now, drawn
  // for as long as that is set. It is the one marker here that answers a question
  // nobody asked — so it never pings, never expires, and is built once and moved
  // rather than rebuilt (rebuilt markup is how the other markers replay their
  // animations, which is exactly what this one must not do).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!home) {
      homeMarkerRef.current?.remove();
      homeMarkerRef.current = null;
      return;
    }
    if (!homeMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'map-home-mark';
      el.innerHTML = HOME_MARK_SVG;
      // Same contract as the arrival mark's click: stopped here rather than
      // offered on a claimable channel, because markers live inside the canvas
      // container and anything left to bubble reaches MapLibre's own click
      // handling — which would open a line card under the house just tapped. The
      // early return before preventDefault is load-bearing: with no handler the
      // click must pass through untouched, so a tool waiting on it still gets it.
      // Coordinates come off the MARKER, never this closure — bound once, outlives
      // every later home.
      el.addEventListener('click', (e) => {
        const at = homeMarkerRef.current?.getLngLat();
        if (!at || !onHomeClickRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        onHomeClickRef.current(at.lat, at.lng);
      });
      // Swallowed, both of them. A double-click through to the map re-places the
      // pin at the CURSOR, and the icon hangs above its anchor — so the pin creeps
      // north by a marker's height. A right-click through to the map removes the
      // placed pin, which is nowhere near what someone aiming at the house meant.
      el.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      homeMarkerRef.current = new maplibregl.Marker({
        element: el,
        // The tip marks the point, as on the pin — the house floats above it.
        anchor: 'bottom',
        offset: [0, 2],
      })
        .setLngLat([home.lng, home.lat])
        .addTo(map);
    } else {
      homeMarkerRef.current.setLngLat([home.lng, home.lat]);
    }
    const el = homeMarkerRef.current.getElement();
    // Apply the single-slot adornment (lib/extensions/pinAdornment → HomeAdornment).
    // Idempotent on the href for the same reason the pin's is: re-setting even the
    // SAME href on an SVG <image> forces a re-decode, which blanks the image for a
    // frame — and this effect re-runs whenever the tip text changes, which must not
    // make the badge blink.
    const badgeUrl = homeAdornment?.badgeUrl ?? '';
    const badge = el.querySelector('.map-home-badge');
    if (badge && (badge.getAttribute('href') ?? '') !== badgeUrl) {
      if (badgeUrl) badge.setAttribute('href', badgeUrl);
      else badge.removeAttribute('href');
    }
    // Reveals the badge. The house is untouched — it keeps the head either way.
    el.classList.toggle('has-badge', badgeUrl !== '');
    // Title first, place second: the title is the fact, and the place is what a
    // host masks under a discreet/present-to-others mode — so the tip still says
    // something when the label is blanked. Driven imperatively like the pin's
    // (plain MapLibre DOM, and never a native `title=`); bindTouchTip's pointer
    // mode gives hover on a mouse and hold-to-reveal on touch.
    //
    // An adornment overrides only the TITLE. The hint keeps the place label and the
    // home wording, so a merged marker still says it is home and still names where —
    // absorbing another marker's identity must not cost the marker its own.
    const title = homeAdornment?.tip ?? t('map.home.tip');
    const hint = home.label ? `${home.label} · ${t('map.home.hint')}` : t('map.home.hint');
    el.setAttribute('aria-label', home.label ? `${title} — ${home.label}` : title);
    const show = () =>
      setHomeTip({ pos: tipPosFor(el.getBoundingClientRect(), 'top'), title, hint });
    const { cleanup } = bindTouchTip(el, show, () => setHomeTip(null), { pointer: true });
    return () => {
      cleanup();
      setHomeTip(null);
    };
  }, [home, t, homeAdornment]);

  // Pointer events only where the click means something — its own effect for the
  // same reason the arrival mark's is: a host withdraws the handler the moment
  // another gesture owns map clicks, and this must not disturb the marker itself.
  useEffect(() => {
    homeMarkerRef.current?.getElement().classList.toggle('is-clickable', !!onHomeClick);
  }, [onHomeClick, home]);

  // The basemap's own place names leave the space under the pin and the home marker
  // (labelCollider.ts): both are DOM, which MapLibre's label collision can't see, so the pin
  // sat on the very name it marked. Re-added on every style by the module itself.
  useEffect(() => {
    const map = mapRef.current;
    if (map) setLabelColliders(map, { pin, home });
  }, [pin, home]);

  // The placed pin and the home marker are places the labels step off (PIN_HIT), and neither
  // one appearing, moving or going is a camera move — so re-place the labels when it happens,
  // or a pin dropped beside an edge sits under the label it should have pushed aside until the
  // next pan. A downstream marker that hides on the pin's spot and comes back when the pin leaves
  // it needs nothing more: the deferred pass reads those fresh, and if the layer only re-renders
  // after it, the host says so (onOverlayPlaced).
  const pinAt = pin ? `${pin.lat},${pin.lng}` : '';
  const homeAt = home ? `${home.lat},${home.lng}` : '';
  useEffect(() => {
    if (!mapRef.current) return;
    scheduleBadgesRef.current();
  }, [pinAt, homeAt]);

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
  // …and a catalog body's chip flies to its zenith coin, by the body's id — the coin's own
  // key. Empty when the coins aren't drawn (MC off in the Angles filter, say), and a chip
  // then stays a plain label, as a planet's does.
  const zenithByMinor: Record<string, [number, number]> = {};
  for (const f of minorZenith?.features ?? []) {
    const c = f.geometry.coordinates;
    zenithByMinor[f.properties.body] = [c[0], c[1]];
  }
  // An overlay's catalog chips read the overlay's own coins, as its planets' read its stamps.
  const zenithByOverlayMinor: Record<string, [number, number]> = {};
  for (const f of overlay?.minorZenith?.features ?? []) {
    const c = f.geometry.coordinates;
    zenithByOverlayMinor[f.properties.body] = [c[0], c[1]];
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
        className={`map-frame${frameActive ? ' framed' : ''}${frameInset?.cap ? ' has-caption' : ''}${lsTransparent ? ' transparent' : ''}${frameActive && chartSubject ? ' chart-only' : ''}`}
        style={
          frameInset
            ? ({
                left: frameInset.l,
                top: frameInset.t,
                right: frameInset.r,
                bottom: frameInset.b,
                '--capture-caption-h': `${frameInset.cap}px`,
                // The band's ONE-line height while a band is drawn (0 when not, like the
                // var above): what its type and the details panel's scale off, so a second
                // caption line adds height to the band and nothing else.
                '--capture-caption-unit': `${frameInset.cap ? frameInset.bandH : 0}px`,
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
      {/* Every edge badge labels a line on the map, so a chart-subject export drops the lot:
          the card covers the map, and the export re-stamps badge glyphs from the live DOM
          with no z-order to respect — badges left mounted underneath would print on top of
          the chart.

          FIRST in the frame, before the map container, on purpose: the placed pin (a MapLibre
          marker inside that container) stands on this layer's rung, z 8, and wins the tie by
          coming later in the DOM — the one way to put it over the labels without lifting it
          over Galaxy (8) or the offer banner (9) as well. Map.css `.map-pin` has the ladder. */}
      <div
        className={`acg-edge-badges${mapMoving ? ' is-moving' : ''}`}
        aria-hidden="true"
      >
        {/* The ACG / aspect / node edge badges label the non-LS lines — hidden in the transparent
            LS-only export (those lines are emptied at the source), so their labels go too. */}
        {!chartSubject && !lsTransparent && badges.map((b) => {
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
          // Aspect badges name the line by its true angle (its `branch`) — AS/MC/
          // DS/IC — matching the hover tip and line card, not the MC/ASC-convention
          // relabel in b.lineType. Falls back to that relabel if branch is absent;
          // null on non-aspect (pair / midpoint / plain) badges.
          const aspectFace = b.aspect
            ? aspectBranchReading(b.aspect, b.branch ?? b.lineType)
            : null;
          // No overhead target where the host holds the sky (overheadTargets false, a
          // geodetic map): the chip is then a plain label, with no fly-out.
          const zenithTarget = angleBadge
            ? overheadTargets && b.targetLng !== undefined && b.targetLat !== undefined
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
          // The key its measured size is cached under (chipSizesRef); `z` is where it stacks
          // among all the labels (dodgeBadges), the more important on top where two still meet.
          // (`data-bkey`, on this and the catalog and paran chips, only names the chip, for
          // tooling: nothing in the app reads it since the Capture spread stopped measuring chips
          // by it — computeBadges hands spreadBadges the chips, and their sizes come from the
          // `data-bface` cache.)
          const face = edgeChipFace(b);
          // Natal AND overlay labels fly to their body's zenith (a clickable,
          // hover-lifting button); only labels without a zenith (e.g. the nodes, or
          // when MC is hidden) stay plain, non-interactive spans.
          return zenithTarget ? (
            <TipButton
              type="button"
              key={b.key}
              data-bkey={b.key}
              data-bface={face}
              tabIndex={-1}
              className="acg-badge acg-badge-btn"
              style={{ ...badgePos(b.x, b.y), background: bg, color: text, zIndex: b.z }}
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
              data-bface={face}
              className="acg-badge"
              style={{ ...badgePos(b.x, b.y), background: bg, color: text, zIndex: b.z }}
            >
              {inner}
            </span>
          );
        })}
        {/* The catalog minor bodies' chips (#34; minorChipText says what they print, and why) — in
            the pill's line colour like a planet's, the mark in its text colour, the number in the
            smaller type of an overlay tag. A body known by its number only prints that as its
            name. Clicking flies to its zenith coin and back again, sharing the coin's own toggle.
            Gone with the other line labels from the LS-only still and a chart-subject export. */}
        {!chartSubject && !lsTransparent && minorBadges.map((b) => {
          const text = badgeTextColor(b.color);
          const mark = minorMarkText(b.n);
          const zen = b.overlay ? zenithByOverlayMinor[b.body] : zenithByMinor[b.body];
          const inner = (
            <>
              {b.prefix && <span className="acg-badge-prefix">{b.prefix}</span>}
              <span className={mark.cls ? `astro-glyph ${mark.cls}` : 'astro-glyph'}>{mark.char}</span>
              {b.label ? (
                <>
                  <span>{b.label}</span>
                  {b.tail && <span className="acg-badge-num">{b.tail}</span>}
                </>
              ) : (
                <span>{b.tail}</span>
              )}
              <span className="acg-badge-code">{ANGLE_CODE[b.lineType]}</span>
            </>
          );
          const style = { ...badgePos(b.x, b.y), background: b.color, color: text, zIndex: b.z };
          return zen ? (
            <TipButton
              type="button"
              key={b.key}
              data-bkey={b.key}
              data-bface={minorChipFace(b)}
              tabIndex={-1}
              className="acg-badge acg-badge-btn minor-badge"
              style={style}
              // Keyed by the routing prefix, as the coin's own click is: the overlay's tag on an
              // overlay chip, '' on the chart's source (a promoted chip shows its tag but keys '').
              onClick={() => flyToZenith(zenithKey(b.overlay ? b.prefix : '', b.body), zen[0], zen[1])}
              placement="top"
              tip={t('map.flyToZenith', {
                prefix: b.prefix ? `${b.prefix} ` : '',
                planet: minorDisplayLabel(b.n, b.name, t),
              })}
            >
              {inner}
            </TipButton>
          ) : (
            <span
              key={b.key}
              data-bkey={b.key}
              data-bface={minorChipFace(b)}
              className="acg-badge minor-badge"
              style={style}
            >
              {inner}
            </span>
          );
        })}
        {/* Paran badges label the (non-LS) paran crossings — likewise hidden in the LS-only export.
            The ranked rows that fit the centre column carry one (paranChips.ts); `z` is where each
            stacks among all the labels, and its face is the key its measured size is cached under. */}
        {!chartSubject && !lsTransparent && paranBadges.map((b) => {
          // A catalog row's chip draws the body's mark (its own symbol, or the diamond — hollow
          // for a hypothetical point) in its line colour on the side it holds; the partner's
          // glyph on the other, as a planet row draws both.
          const mark = b.minorN !== undefined ? minorMarkText(b.minorN) : null;
          const side = (s: 'A' | 'B', planet: PlanetName) =>
            mark && b.minorSide === s ? (
              <span
                className={mark.cls ? `astro-glyph ${mark.cls}` : 'astro-glyph'}
                style={{ color: b.minorColor }}
              >
                {mark.char}
              </span>
            ) : (
              <PlanetGlyph planet={planet} size={11} color={paranText} />
            );
          return (
            <TipButton
              type="button"
              key={b.key}
              data-bkey={b.key}
              data-bface={paranChipFace(b)}
              tabIndex={-1}
              className="acg-badge paran-badge acg-badge-btn"
              style={{
                ...badgePos(b.x, b.y),
                background: zenithFill,
                color: paranText,
                zIndex: b.z,
              }}
              onClick={() => onParanClick(b)}
              placement="top"
              tip={t('map.flyToParan')}
            >
              {/* An overlay's tag goes on BOTH bodies: both are the overlay's (a paran never
                  pairs across frames). One tag in front read as "transiting ♀ × natal ♆" — a
                  transit-to-natal paran, which is never drawn (2026-10-06). */}
              {b.prefix && <span className="acg-badge-prefix">{b.prefix}</span>}
              {side('A', b.planetA)}
              <span className="acg-badge-code">{ANGLE_CODE[b.angleA]}</span>
              <span className="paran-badge-x">×</span>
              {b.prefix && <span className="acg-badge-prefix">{b.prefix}</span>}
              {side('B', b.planetB)}
              <span className="acg-badge-code">{ANGLE_CODE[b.angleB]}</span>
            </TipButton>
          );
        })}
        {/* The geodetic grid's sign glyphs (geoGridLabels.ts) — the Coordinates box's own glyphs,
            in the grid's one neutral colour, with no pill: they label a reference, not a reading,
            and take no clicks. The halo is the eclipse digits' (ECLIPSE_LABEL_HALO), whose Earth
            entry is a light parchment for exactly this case — dark ink on a pale basemap. Gone
            with the other labels from the LS-only still and a chart-subject export. */}
        {!chartSubject && !lsTransparent && geoGridBadges.map((b) => (
          <span
            key={b.key}
            data-bkey={b.key}
            className="geo-grid-badge"
            aria-hidden="true"
            style={
              {
                ...badgePos(b.x, b.y),
                color: GEO_GRID_STYLE[theme].label,
                zIndex: b.z,
                '--geo-halo': ECLIPSE_LABEL_HALO[theme].color,
              } as CSSProperties
            }
          >
            <ZodiacGlyph sign={b.sign} size={12} />
          </span>
        ))}
        {!chartSubject && localSpaceBadges.map((b) => {
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
              style={{
                ...badgePos(b.x, b.y),
                background: b.color,
                color: text,
                zIndex: b.z ?? LS_CHIP_Z,
              }}
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
                style={{ ...badgePos(b.degX, b.degY), color: b.color, zIndex: LS_CHIP_Z }}
              >
                {b.bearing}
              </span>
            ) : null,
          )}
      </div>
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
      {creditsOpen && (
        <CreditsModal
          onClose={() => setCreditsOpen(false)}
          // The dialog has no extension context of its own; this is the one action its
          // notice tail may take, lent from the context the map already holds. The
          // dialog closes first — anything opened this way is a takeover of its own,
          // and returning to a stale credits dialog behind it would read as a bug.
          noticeActions={
            overlayCtx
              ? {
                  openExtension: (id) => {
                    setCreditsOpen(false);
                    overlayCtx.openExtension(id);
                  },
                }
              : undefined
          }
        />
      )}
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
      <HoverTip
        pos={homeTip?.pos ?? null}
        placement="top"
        title={homeTip?.title ?? ''}
        hint={homeTip?.hint}
      />
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
          onPlaced={onOverlayPlaced}
        />
      )}
      {!hideCompass && !chartSubject && compassP !== null && originScreen && (
        // The dial is placed at the origin's PROJECTED point, which is relative to the GL
        // canvas. While framing, the canvas + edge badges shift by the Extras-panel inset
        // (--capture-extra-*); this layer carries the dial so it shifts by the same amount
        // and stays centred on the origin (see .local-horizon-layer in Map.css).
        // Stands down entirely for a chart-subject export: the card covers the map, and the
        // export's glyph pass draws from the live DOM, which has no z-order to respect —
        // a dial left mounted underneath would stamp its marks onto the card.
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
          inset to clear it (left for landscape, top otherwise), or the whole frame when the
          chart is the subject. Self-measures → onExtraMeasure. */}
      {showExtras && frameExtras && (
        <CaptureExtras
          orientation={extraSide}
          clusterAxis={clusterAxis}
          data={frameExtras}
          wheelSize={wheelSize}
          onMeasure={onExtraMeasure}
        />
      )}
      {/* Capture footer — real DOM inside the frame, so it's captured WYSIWYG and
          the map/edge-labels are inset above the caption band rather than drawn over it.
          The band carries the watermark + optional caption text. `noCaption` (gated
          Transparent mode) drops it entirely for a clean see-through export.
          One line, or two (rarely three) where the fields don't fit (the caption-fit
          effect) — each line its own element, so the export rasteriser can't re-wrap them
          differently. `is-two-line` means more than one. */}
      {frameActive && !noCaption && (
        <div className="capture-footer" aria-hidden="true">
          <div
            ref={captionRef}
            className={`capture-caption${captionRows.length > 1 ? ' is-two-line' : ''}`}
          >
            {captionRows.map((row, i) => (
              <span key={i} className="capture-caption-text">
                {row.fields.map((field, j) => (
                  <Fragment key={j}>
                    {j > 0 && <span className="capture-caption-sep">{CAPTION_FIELD_SEP}</span>}
                    {/* A field that gives a measured amount is held at that width: flex
                        shrinking would share the overflow out again, floors and all. */}
                    <span
                      className={`capture-caption-field${j === row.shrink || row.caps[j] !== null ? ' is-shrink' : ''}`}
                      style={row.caps[j] !== null ? { maxWidth: row.caps[j]!, flex: 'none' } : undefined}
                    >
                      {field}
                    </span>
                  </Fragment>
                ))}
              </span>
            ))}
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
      {zoomOutShown && (
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
