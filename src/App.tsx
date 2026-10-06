// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  getMapExtensions,
  isAvailable,
  isEntitled,
  type AllLines,
  type LineSpotlight,
  type MapExtensionContext,
} from './lib/extensions/mapExtensions';
import { filterWithinKm } from './lib/lineProximity';
import { getToolExtensions } from './lib/extensions/toolExtensions';
import { getOverlayExtensions } from './lib/extensions/overlayExtensions';
import { getViewLock, useViewLock } from './lib/extensions/viewLock';
// Shared entitlement for the Tools + Overlay seams (see lib/extensions/entitlement).
import { isEntitled as isAddonEntitled } from './lib/extensions/entitlement';
import { type PlanTier, planTierFor, tierMet } from './lib/plan';
import type {
  Feature,
  FeatureCollection,
  Geometry,
  LineString,
  Point as GeoPoint,
  Polygon,
} from 'geojson';
import {
  Map,
  type MapHandle,
  type MeasureInfo,
  type SlideInfo,
  type OverlayData,
  type GeoReadout,
  SIDEREAL_DEG_PER_HOUR,
  CLOSE_ZOOM,
} from './components/Map/Map';
import { Sidebar, type SidebarSection } from './components/Sidebar/Sidebar';
import { SettingsNub } from './components/Sidebar/SettingsNub';
import { TimelineHud } from './components/TimelineHud/TimelineHud';
import { SynastryHud } from './components/SynastryHud/SynastryHud';
import { EclipseHud } from './components/EclipseHud/EclipseHud';
import { TeleportHud } from './components/TeleportHud/TeleportHud';
import {
  SkyBand,
  SKY_BAND_H_COMPACT,
  SKY_BAND_H_PHONE,
  SKY_BAND_H_TABLE,
  SKY_BAND_PHONE_CUSHION,
} from './components/SkyBand/SkyBand';
// What a geodetic map draws in place of the views and tools that read the sky's turning
// (lib/skyHold, 2026-10-02).
import { SkyBandHeld } from './components/SkyHeldNote/SkyBandHeld';
import { HeldHud } from './components/SkyHeldNote/HeldHud';
import { getSkyBandTrack, isSkyBandTrackEntitled } from './lib/extensions/skyBandTrack';
import { getMapOverlays, MAP_CLICK_EVENT, type MapClickDetail } from './lib/extensions/mapOverlays';
import {
  findLocalSpaceAnchor,
  getNoAnchor,
  subscribeNoAnchor,
} from './lib/extensions/localSpaceAnchors';
import { publishBottomDock, retireBottomDock } from './lib/bottomDock';
import { getReservedLeftInset, subscribeReservedLeftInset } from './lib/leftDock';
import { watchSettled } from './lib/hudSettled';
import { LocalSpaceHud } from './components/LocalSpaceHud/LocalSpaceHud';
import { AspectLinesHud } from './components/AspectLinesHud/AspectLinesHud';
import { CaptureHud } from './components/CaptureHud/CaptureHud';
import { TopNav, type MapTool } from './components/TopNav/TopNav';
import type { ChartQuickFlash } from './components/ChartSwitcher/ChartSwitcher';
import { ChartWheel } from './components/ChartWheel/ChartWheel';
import { ExpandedChartSidebar } from './components/ExpandedChartSidebar/ExpandedChartSidebar';
import { CoordReadout } from './components/CoordReadout/CoordReadout';
import { ProfileWindow } from './components/ProfileWindow/ProfileWindow';
import { SynastryIcon } from './components/ui/SynastryIcon';
import { InfoBar } from './components/InfoBar/InfoBar';
import { GeoZoneLegend } from './components/GeoZoneLegend/GeoZoneLegend';
import { ChartManager } from './components/ChartManager/ChartManager';
import { ImportChartModal } from './components/ImportChartModal/ImportChartModal';
import { MissionGuide } from './components/MissionGuide/MissionGuide';
import { useMissions } from './lib/useMissions';
import { AutoFlipNotice } from './components/AutoFlipNotice/AutoFlipNotice';
import { useAutoFlipNotice } from './lib/useAutoFlipNotice';
// The geodetic review hold — one boolean, masking a preference rather than
// rewriting it. See lib/geodeticHold for the whole of it and how to lift it.
import { GEODETIC_HELD } from './lib/geodeticHold';
// The sky hold: what a geodetic map can't show, keyed on the DERIVED line system. A third
// hold beside the one above, never folded into it (lib/skyHold says why).
import { skyHeldFor } from './lib/skyHold';
import { isTouchLayout, useTouchLayout, usePhone } from './lib/touch';
import { useSafeAreaBottom } from './lib/safeArea';
// Type-only: erased at compile time, so the eclipses module itself still
// loads lazily (the value import lives in the dynamic-import effect below).
import type { EclipseCatalogRow, EclipseContact } from './lib/astro/eclipses';
import { SEED_BIRTHS, applyTimeHypothesis, timeUnknown } from './lib/birthData';
import {
  buildShareUrl,
  consumeShareParam,
  matchesSharedChart,
} from './lib/shareState';
import { planetRank, visibleAngleSpecs, buildCaptureBalance, buildBalanceGrid } from './lib/astro/format';
import type {
  CaptureFrameExtras,
  CaptureWheelAngleKey,
} from './components/CaptureExtras/CaptureExtras';
import { ARIES_FRAME, type AspectCategory } from './components/Wheel/WheelSvg';
import {
  offsetHoursAt,
  zoneLabelAt,
  formatUtcOffset,
} from './lib/atlas/timezone';
import { useReverseGeocode } from './lib/atlas/useReverseGeocode';
import { useNearestCity, useNearestCityLabel } from './lib/atlas/useNearestCityLabel';
import { useCountryOf } from './lib/atlas/useCountryOf';
import {
  birthDataToJD,
  directedAngles,
  eclipticToRaDec,
  ensureAsteroidEphemeris,
  EPS_J2000,
  fortunePosition,
  geodeticAngles,
  geodeticFrame,
  getAngleCoords,
  getEclipticPositions,
  getHorizontalCoords,
  getMinorHorizontalCoords,
  getMinorPositions,
  getMinorSamples,
  getPlanetPositions,
  gmstRadians,
  isDayBirth,
  jdToCivil,
  minorLinePositionOf,
  needsAsteroidEphemeris,
  obliquity,
  partOfFortuneLon,
  PLANET_NAMES,
  projectMinorOntoEcliptic,
  projectOntoEcliptic,
  raDecToEclipticLon,
  relocate,
  toEclipticPositions,
  TRADITIONAL_PLANETS,
  type CoordSystem,
  type EclipticPosition,
  type FortuneFormula,
  type HouseSystem,
  type LineSystem,
  type NodeType,
  type PlanetName,
  type PlanetPosition,
} from './lib/ephemeris';
// Eclipse machinery (the NASA catalog JSON + the Besselian-element fitting in
// eclipsePath) is dynamic-imported when eclipse mode first opens — see the
// eclipsesMod state below — so none of it weighs on the main bundle. Only the
// small formatting module is static: the panel shares it, so it must be.
import {
  eclipseLongDate,
  eclipsePlaceClock,
  eclipseShortDate,
  formatEclipseDuration,
  formatEclipseMagnitude,
  jdToClock,
  type EclipseClock,
} from './lib/astro/eclipseFormat';
import {
  antipodeStamps,
  generateEcliptic,
  generateLines,
  generateZenithStamps,
  meridianLngFor,
  OPPOSITE_ANGLE,
  type LineProps,
  type LineType,
  type MeridianLng,
  type ZenithProps,
} from './lib/astro/lines';
import {
  generateAspectLines,
  generateMidpointLines,
  type AngleOverlayLineProps,
} from './lib/astro/angleAspects';
import {
  generateMinorParans,
  generateParans,
  generateStarParans,
  type MinorParanProps,
  type ParanProps,
} from './lib/astro/parans';
import { nextSkyEvent } from './lib/astro/riseSet';
import {
  generateLocalSpace,
  localSpaceCoordMap,
  type LocalSpaceProps,
} from './lib/astro/localSpace';
import { generateLocalSpaceCrossings } from './lib/astro/localSpaceCrossings';
import {
  buildOverlay,
  cycloBodyTag,
  epochMsToJD,
  minorStepMs,
  OVERLAY_LABEL_PREFIX,
  tagLabels,
  tagLabelsBy,
  OVERLAY_MODES,
  ADVANCED_OVERLAY_MODES,
  TIME_OVERLAY_MODES,
  VIEW_LOCK_PARKED_OVERLAYS,
  overlayBlockedFor,
  overlayAuxBlocked,
  overlayMinorLines,
  overlayMinorSamples,
  tagMinor,
  normalizeAngle,
  type AngleProgression,
  type ArcMethod,
  type ProgAngleFrame,
  type OverlayMinorSample,
  type OverlayMode,
  type PrimaryRate,
  type RelationshipMethod,
  type TimeUnit,
  type TransitFrame,
} from './lib/astro/timeline';
import { buildComposite, buildDavison } from './lib/astro/relationship';
import {
  compositeAngles,
  compositeEcliptic,
  compositeEquatorial,
  compositeMinorSamples,
  solveCompositeFrameJd,
} from './lib/astro/composite';
import {
  ayanamsaRad,
  shiftAngles,
  shiftEclipticPositions,
  shiftEclipticPositionsPerBody,
  type ZodiacMode,
} from './lib/astro/ayanamsa';
import { activeReturnBody, findReturn, type ReturnBody } from './lib/astro/returns';
import { buildLineCard, type LineCardDistance } from './lib/lineCard';
import type { RulershipScheme } from './lib/astro/dignities';
import { generateOrbBands } from './lib/astro/orbBands';
import { generateStarLines, starsOfDate } from './lib/astro/starLines';
import {
  generateMinorLines,
  generateMinorZenith,
  type MinorDecor,
} from './lib/astro/minorLines';
import { useMinorBodies } from './lib/minorBodies/useMinorBodies';
import { ensureMinorBodies, minorLoadState, retryMinorBody } from './lib/minorBodies/loader';
import {
  deriveMinorRows,
  minorChartContext,
  minorLoadRequests,
  minorReadyNumbers,
  minorRowHasLines,
  minorRowName,
  withMinorDrawGate,
} from './lib/minorBodies/status';
import { bundledMinorBody } from './lib/minorBodies/bundled';
import { loadMinorParansPref, saveMinorParansPref } from './lib/minorBodies/prefs';
import { buildWheelMinor, type WheelMinorBody } from './lib/minorBodies/wheel';
import { minorIconId } from './components/Map/glyphImages';
import { MinorBodiesHud } from './components/MinorBodiesHud/MinorBodiesHud';
import { generateNightShade } from './lib/astro/nightShade';
import {
  GEO_ZONE_OPACITY,
  buildGeoZones,
  geoGrid,
  geoReadoutAngles,
  type GeoZoneIsolate,
  type GeoZoneProps,
} from './lib/astro/geodeticGrid';
import { useGeoAscZones } from './lib/astro/useGeoAscZones';
import { TIMELESS_BAND_DEG, TIMELESS_RANGE_DEG } from './lib/astro/timeless';
import { generateUncertaintyBands } from './lib/astro/uncertaintyBands';
import {
  loadAspectOrbs,
  saveAspectOrbs,
  DEFAULT_ASPECT_ORBS,
  loadAspectLineFilters,
  saveAspectLineFilters,
  aspectLinePasses,
  DEFAULT_ASPECT_LINE_FILTERS,
} from './lib/aspectPrefs';
import {
  loadArcMethod,
  loadProgAngleFrame,
  loadProgAngleMethod,
  loadEclipseChart,
  loadEclipseMapLines,
  loadEclipseId,
  loadEclipseIsoStep,
  loadEclipseOtherLines,
  loadOverlayDate,
  loadOverlayMode,
  loadOverlayPartner,
  loadLsOrigin,
  loadLsHideInbound,
  loadLsHideCompass,
  loadCaptureHiddenOverlays,
  loadLsTransparent,
  loadLsLabelName,
  loadLsLineDeg,
  loadOverlayStep,
  loadOrbZoneUnit,
  loadOrbZoneVal,
  loadGeoGridAscPref,
  loadGeoGridMc,
  loadGeoZones,
  loadGeoZonesPresentation,
  loadParanOrbVal,
  loadPrimaryRate,
  loadShowNightShade,
  loadShowOrbZones,
  loadShowNatalLines,
  loadShowStarLines,
  loadStarSet,
  loadTransitFrame,
  loadUserPrimaryRate,
  loadSynastryMethod,
  loadZodiacMode,
  saveZodiacMode,
  saveArcMethod,
  saveProgAngleFrame,
  saveProgAngleMethod,
  saveEclipseChart,
  saveEclipseMapLines,
  saveEclipseId,
  saveEclipseIsoStep,
  saveEclipseOtherLines,
  saveSynastryMethod,
  saveOverlayDate,
  saveOverlayMode,
  saveOverlayPartner,
  saveLsOrigin,
  saveLsHideInbound,
  saveLsHideCompass,
  saveCaptureHiddenOverlays,
  saveLsTransparent,
  saveLsLabelName,
  saveLsLineDeg,
  saveOverlayStep,
  saveOrbZoneUnit,
  saveOrbZoneVal,
  convertOrbZoneVal,
  convertParanOrbVal,
  KM_PER_MI,
  saveGeoGridAscPref,
  saveGeoGridMc,
  saveGeoZones,
  saveGeoZonesPresentation,
  saveParanOrbVal,
  savePrimaryRate,
  saveShowNightShade,
  saveShowOrbZones,
  saveShowNatalLines,
  saveShowStarLines,
  saveStarSet,
  saveTransitFrame,
  saveUserPrimaryRate,
  type DistanceUnit,
  type EclipseIsoStep,
} from './lib/overlayPrefs';
import {
  displayName,
  loadCharts,
  loadCurrentId,
  newChartId,
  publishCurrentChart,
  recentShortlist,
  registerChartPatch,
  saveCharts,
  saveCurrentId,
  SEED_CHART_ID_PREFIX,
  type StoredChart,
} from './lib/chartLibrary';
import {
  buildFolderTree,
  flattenFolders,
  loadDeclaredFolders,
  pruneDeclaredFolders,
} from './lib/chartFolders';
import { toggleDiscreet, useIdentity } from './lib/discreet';
import { fmtLat, fmtLng } from './lib/coordFormat';
import {
  applyTheme,
  GEO_ZONE_COLORS,
  loadTheme,
  MAP_LINE_COLOR_OVERRIDES,
  minorLineColor,
  NIGHT_SHADE_STYLE,
  saveTheme,
  STAR_LINE_COLORS,
  type Theme,
} from './lib/theme';
import {
  loadProjection,
  saveProjection,
  type MapProjectionMode,
} from './lib/projection';
import { useT } from './i18n';

interface Point {
  lat: number;
  lng: number;
}

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] };
// The wheel's catalog set when it has none — one stable reference, so a wheel with no
// catalog bodies never re-runs its ring layout on a fresh empty array.
const NO_WHEEL_MINOR: readonly WheelMinorBody[] = [];
const NO_OVERLAY_MINOR: readonly OverlayMinorSample[] = [];
// Every angle a catalog body draws: the unfiltered complete set (collectAllLines).
const ALL_MINOR_ANGLES: ReadonlySet<LineType> = new Set<LineType>(['MC', 'IC', 'ASC', 'DSC']);
// The catalog parans' "none" — one stable reference, so an empty set never re-pushes its source.
const NO_MINOR_PARANS: FeatureCollection<LineString, MinorParanProps> = {
  type: 'FeatureCollection',
  features: [],
};
// The built-in bodies a catalog body pairs with on the map: the visible ones, with the South
// Node left out while the North Node is shown too — its rows coincide with the North's (the
// nodes are antipodes), which is mergeNodeParans' rule for the planets' own parans.
function minorParanPartners(
  positions: readonly PlanetPosition[],
  visible: ReadonlySet<PlanetName>,
): PlanetPosition[] {
  const bothNodes = visible.has('NorthNode') && visible.has('SouthNode');
  return positions.filter((p) => visible.has(p.name) && !(bothNodes && p.name === 'SouthNode'));
}

// Persists the active Overlay-menu extension id (registerOverlayExtension). A single
// key (not per-extension) since the Overlay menu is single-select; the core ships no
// overlay extensions, so this is unused here.
const OVERLAY_EXT_KEY = 'astro:overlay-ext:v1';

// Slide tool: quantize the time-shifted line recompute to TWO-MINUTE Δt steps. Even
// the fastest body (Moon, ~0.5°/h) moves only ~1 arcmin per step, so the cage no
// longer visibly pops while spinning zoomed in (the old 1-hour buckets stepped the
// Moon's lines ~0.5° at a time — a real jump at regional zoom). The cost stays
// bounded regardless of bucket size: the Map throttles the spin's readout callback
// (~15 Hz), so a drag can't trigger resamples faster than that — finer buckets only
// mean SLOW drags resample as often as fast ones always have.
const SLIDE_BUCKET_DAYS = 1 / 720;

const MS_DAY = 86_400_000;
const msToJD = (ms: number) => ms / MS_DAY + 2440587.5;
const jdToMs = (jd: number) => (jd - 2440587.5) * MS_DAY;
// The chart moment as a UT epoch — ONE formula shared by the slide readout, the
// programmatic scrub target and the event stepping, so they can never disagree.
const chartUtcMs = (c: StoredChart) =>
  Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute) - c.tzOffset * 3_600_000;

// The STORED line-system choice (see lineSystemPref in App).
const loadLineSystemPref = (): LineSystem =>
  localStorage.getItem('astro:line-system:v1') === 'geodetic' ? 'geodetic' : 'celestial';

// The line system ON SCREEN, from the three things that decide it: the stored choice, the
// zodiac, and Advanced — which is what lets a sidereal zodiac take effect at all. App's
// derived `lineSystem` is exactly this (the reasoning is there). It lives out here so that a
// setter about to change one of the three can ask what the line system is ABOUT to become,
// and act on the change as the event it is, rather than an effect chasing it afterwards.
function effectiveLineSystem(
  pref: LineSystem,
  zodiac: ZodiacMode,
  advanced: boolean,
): LineSystem {
  const effZodiac = advanced ? zodiac : 'tropical';
  return pref === 'geodetic' && (GEODETIC_HELD || effZodiac !== 'tropical')
    ? 'celestial'
    : pref;
}

// Whether a registered Tools-menu extension declares `needsSiderealTime` — the tools a
// geodetic map holds (lib/skyHold). Out here so App's stable tool openers can ask without a
// dependency. (2026-10-02)
const toolNeedsSky = (id: string): boolean =>
  !!getToolExtensions().find((e) => e.id === id)?.needsSiderealTime;

// Some bodies' PLANET_COLORS tint washes out against a light basemap, so the MAP draws
// their lines/zeniths in a per-theme override instead (MAP_LINE_COLOR_OVERRIDES from
// lib/theme — the Moon on both light themes, plus Mercury/Uranus on Earth; shared with
// the baked zenith glyph so stamps match). The color is the single source the edge
// badges, hover tip, crossing-dot blends, AND the zenith disc/stamp all read, so they
// follow suit. Geometry-agnostic so it covers the line/local-space (LineString) and
// zenith (Point) sets. Midpoint lines carry a second body (planetB/colorB, read by their
// hover tip); an overridden body there gets the same swap so a "Sun/Moon" tip stays
// readable on light themes.
function withThemeLineColors<G extends Geometry, P extends { planet: PlanetName; color: string }>(
  fc: FeatureCollection<G, P>,
  theme: Theme,
): FeatureCollection<G, P> {
  const overrides = MAP_LINE_COLOR_OVERRIDES[theme];
  // Dark (or any theme with no overrides) → nothing to rewrite.
  if (!Object.keys(overrides).length) return fc;
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => {
      const p = f.properties as P & { planetB?: PlanetName; colorB?: string };
      const a = overrides[p.planet];
      const b = p.planetB ? overrides[p.planetB] : undefined;
      if (!a && !b) return f;
      return {
        ...f,
        properties: {
          ...p,
          ...(a ? { color: a } : null),
          ...(b ? { colorB: b } : null),
        },
      };
    }),
  };
}

// Pure filter helpers shared by the base chart and the overlay, so the two
// can't drift apart in what the visibility toggles do.
function filterLines(
  fc: FeatureCollection<LineString, LineProps>,
  planets: Set<PlanetName>,
  lineTypes: Set<LineType>,
): FeatureCollection<LineString, LineProps> {
  return {
    type: 'FeatureCollection',
    features: fc.features.filter(
      (f) =>
        planets.has(f.properties.planet) &&
        lineTypes.has(f.properties.lineType),
    ),
  };
}
// The North and South nodes are exact antipodes, so each North Node line lies exactly on
// a South Node line with the angle swapped (North Node MC = South Node IC, and so on).
// When BOTH nodes are visible those coincident lines would draw twice (the overlap); so
// we keep the North Node feature, flag it `pair` (the map then draws it two-toned and the
// edge badge labels it "NN MC / SN IC"), and drop the South Node duplicate. With only one
// node visible there is no duplicate — nothing merges and that node's lines render as
// usual. Runs AFTER filterLines, so it also respects the per-angle (MC/IC/ASC/DSC) toggles:
// a pair only forms when both halves survived filtering.
function mergeNodePairs(
  fc: FeatureCollection<LineString, LineProps>,
): FeatureCollection<LineString, LineProps> {
  const nnTypes = new Set<LineType>();
  const snTypes = new Set<LineType>();
  for (const f of fc.features) {
    if (f.properties.planet === 'NorthNode') nnTypes.add(f.properties.lineType);
    else if (f.properties.planet === 'SouthNode') snTypes.add(f.properties.lineType);
  }
  if (nnTypes.size === 0 || snTypes.size === 0) return fc; // at most one node shown
  const features = fc.features.flatMap((f) => {
    const { planet, lineType } = f.properties;
    if (planet === 'NorthNode' && snTypes.has(OPPOSITE_ANGLE[lineType])) {
      return [{ ...f, properties: { ...f.properties, pair: true } }];
    }
    // The South Node duplicate is now carried by its North Node counterpart.
    if (planet === 'SouthNode' && nnTypes.has(OPPOSITE_ANGLE[lineType])) return [];
    return [f];
  });
  return { type: 'FeatureCollection', features };
}
function filterParans(
  fc: FeatureCollection<LineString, ParanProps>,
  planets: Set<PlanetName>,
): FeatureCollection<LineString, ParanProps> {
  return {
    type: 'FeatureCollection',
    features: fc.features.filter(
      (f) =>
        planets.has(f.properties.planetA) &&
        planets.has(f.properties.planetB),
    ),
  };
}
// When BOTH lunar nodes are shown, every South-Node paran coincides exactly with a North-
// Node one — the nodes are antipodes, so SN-on-MC = NN-on-IC, SN-rising = NN-setting, etc.
// — and would draw the same latitude line and label on top of each other. So we drop the
// South-Node duplicates (which also removes the degenerate node-to-node parans, since those
// involve SN), leaving each distinct nodal-axis paran drawn once and labelled by the North
// Node. With only one node shown there are no duplicates, so nothing is dropped. This is the
// parans counterpart of the two-tone node-LINE merge (mergeNodePairs).
function mergeNodeParans(
  fc: FeatureCollection<LineString, ParanProps>,
  planets: Set<PlanetName>,
): FeatureCollection<LineString, ParanProps> {
  if (!(planets.has('NorthNode') && planets.has('SouthNode'))) return fc;
  return {
    type: 'FeatureCollection',
    features: fc.features.filter(
      (f) =>
        f.properties.planetA !== 'SouthNode' && f.properties.planetB !== 'SouthNode',
    ),
  };
}
function filterLocalSpace(
  fc: FeatureCollection<LineString, LocalSpaceProps>,
  planets: Set<PlanetName>,
  // Drop the inbound (antipodal) half of each line when hiding inbound. Filtering
  // here covers natal, overlay, and promoted in one place — and because the crossing
  // dots derive from the filtered set, their inbound dots drop with the lines.
  hideInbound = false,
): FeatureCollection<LineString, LocalSpaceProps> {
  return {
    type: 'FeatureCollection',
    features: fc.features.filter(
      (f) =>
        planets.has(f.properties.planet) &&
        (!hideInbound || f.properties.direction !== 'in'),
    ),
  };
}
function filterZenith(
  fc: FeatureCollection<GeoPoint, ZenithProps>,
  planets: Set<PlanetName>,
  lineTypes: Set<LineType>,
  // The defining angle line: a zenith stamp sits on the MC line, its antipodal nadir
  // on the IC line — so each follows its own line's toggle.
  angle: LineType = 'MC',
): FeatureCollection<GeoPoint, ZenithProps> {
  if (!lineTypes.has(angle)) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: fc.features.filter((f) => planets.has(f.properties.planet)),
  };
}
// Stamp the overlay tag (e.g. "Tr") onto each zenith point — the on-map stamp's hover
// tooltip reads it, so an overlay (or promoted) zenith reads "Tr Moon" rather than
// being mistaken for the natal body. The natal chart's own zeniths are left untagged.
// A resolver tag (cyclo) names each body's own source instead of one mode tag.
function tagZeniths(
  fc: FeatureCollection<GeoPoint, ZenithProps>,
  tag: string | ((planet: PlanetName) => string),
): FeatureCollection<GeoPoint, ZenithProps> {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        tag: typeof tag === 'string' ? tag : tag(f.properties.planet),
      },
    })),
  };
}

// The seed-id prefix lives in lib/chartLibrary (with its reasoning), so a module that
// asks "is this an example chart?" needn't import App; re-exported for existing callers.
export { SEED_CHART_ID_PREFIX };

const seedCharts: StoredChart[] = SEED_BIRTHS.map((b, i) => ({
  ...b,
  id: `${SEED_CHART_ID_PREFIX}${i}`,
  createdAt: Date.now() + i,
}));

export default function App() {
  const { t, labels, fmt } = useT();
  // Discreet mode's masks. Used for what is on SCREEN; anything being produced
  // deliberately — a capture caption, an export, a share link — keeps the real
  // values, since hiding those from the person who asked for them would be a
  // bug rather than a courtesy.
  const identity = useIdentity();
  // A share link (#c=…) restores a chart + view. Consumed exactly once at boot
  // (the param is stripped from the address bar); malformed tokens decode to
  // null and the app boots normally. The chart lands in the library like an
  // import, carrying the system 'shared' tag (the red gift) so link-received
  // charts are marked and filterable — unless a chart with the EXACT same name +
  // birth data is already there, in which case that one is simply selected (no
  // duplicate).
  const [sharedBoot] = useState(() => consumeShareParam());
  const [charts, setCharts] = useState<StoredChart[]>(() => {
    const loaded = loadCharts();
    const base = loaded.length > 0 ? loaded : seedCharts;
    if (!sharedBoot) return base;
    const match = base.find((c) => matchesSharedChart(c, sharedBoot.chart));
    return match
      ? base
      : [
          { ...sharedBoot.chart, id: newChartId(), createdAt: Date.now(), tag: 'shared' },
          ...base,
        ];
  });
  const [currentId, setCurrentId] = useState<string | null>(() => {
    if (sharedBoot) {
      // The shared chart: the pre-existing twin, else the one just prepended.
      const match = charts.find((c) => matchesSharedChart(c, sharedBoot.chart));
      return match?.id ?? charts[0]?.id ?? null;
    }
    const stored = loadCurrentId();
    return stored ?? charts[0]?.id ?? null;
  });
  // A birth time being TRIED ON (minutes past local midnight), or null. Session
  // state only: it is never persisted and never written back onto the record —
  // see the derived `current` below and applyTimeHypothesis in lib/birthData.
  const [timeHypothesis, setTimeHypothesis] = useState<number | null>(null);
  const storedCurrent = useMemo(
    () => charts.find((c) => c.id === currentId) ?? charts[0] ?? null,
    [charts, currentId],
  );
  // The chart every consumer below reads. While a time is being tried on, this is
  // the STORED record with that minute substituted — so the angular linework,
  // houses, wheel and every downstream tool answer for the provisional time at
  // once, without a single one of them knowing a hypothesis exists.
  //
  // Derived, never written: the condition is a standing one (it lasts as long as
  // whatever is trying the time out), and the record has to still read "unknown"
  // when it ends. The persist effect below therefore writes `charts` — the stored
  // array, which the substitution deliberately happens OUTSIDE of — and must
  // never be pointed at `current`, which would save the guess.
  const current = useMemo(
    () => applyTimeHypothesis(storedCurrent, timeHypothesis),
    [storedCurrent, timeHypothesis],
  );
  // A provisional time is only ever announced, never assumed: while one stands the
  // header says so (below), and whatever set it is expected to say so too.
  const provisionalTime = timeHypothesis != null && current !== storedCurrent;
  // Birth TIME unknown (timeKnown === false): the stored 12:00 is a placeholder, so
  // every time-of-day-dependent layer below degrades — the angular linework, parans,
  // local space, star lines, houses and relocated angles all suppress; the date-robust
  // content (planets by sign, eclipse geometry, the transiting sky) stays.
  // Reads the DERIVED chart, so trying a time on lifts the degrade for as long as
  // it stands and restores it the moment it is dropped.
  const noTime = timeUnknown(current);
  // A hypothesis belongs to the chart it was reasoned about — switching charts
  // drops it rather than silently applying one record's guess to another.
  useEffect(() => {
    setTimeHypothesis(null);
  }, [currentId]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Open the regular chart browser to pick/add a synastry partner — the same
  // add/edit/select flow as the nav, with the active chart excluded and the choice
  // routed to the partner slot (vs. the normal flow driven by `creating`/`editingId`).
  const [pickingPartner, setPickingPartner] = useState(false);
  const [importing, setImporting] = useState(false);

  // Persisted planet filter (planets, nodes, and asteroids share one set), so
  // a narrowed set survives reloads alongside the persisted overlay toggles —
  // important for the quadratic midpoint overlay, which would otherwise come
  // back against the full default body set. Unknown names in a stale payload
  // are dropped; an empty array is an intentional "all hidden" and restores.
  // The user's PREFERENCE — what downstream actually shows is the derived
  // `visiblePlanets` below, which can park frame-dependent points (the Part of
  // Fortune In Mundo) without disturbing what's stored here.
  const [visiblePlanetsPref, setVisiblePlanets] = useState<Set<PlanetName>>(() => {
    try {
      const raw = localStorage.getItem('astro:visible-planets:v1');
      if (raw) {
        const arr: unknown = JSON.parse(raw);
        if (Array.isArray(arr)) {
          return new Set(
            arr.filter((p): p is PlanetName =>
              (PLANET_NAMES as string[]).includes(p as string),
            ),
          );
        }
      }
    } catch {
      // Corrupt payload — fall through to the default set.
    }
    // Default set for a fresh visitor: the traditional planets plus the Part of
    // Fortune (on by default so the Lot is discoverable — it shows wherever the
    // frame is zodiacal: wheel always, map lines the moment the projection is
    // In-Zodiaco).
    return new Set<PlanetName>([...TRADITIONAL_PLANETS, 'Fortune']);
  });
  useEffect(() => {
    localStorage.setItem(
      'astro:visible-planets:v1',
      JSON.stringify([...visiblePlanetsPref]),
    );
  }, [visiblePlanetsPref]);
  // The Angles filter's PREFERENCE. What draws is the derived `visibleLineTypes` below, which
  // masks the Vertex axis on a geodetic map (skyHeld) and leaves this as the reader set it.
  // Only the Sidebar's own buttons read it. (2026-10-02)
  const [visibleLineTypesPref, setVisibleLineTypes] = useState<Set<LineType>>(
    () => new Set<LineType>(['MC', 'IC', 'ASC', 'DSC']),
  );
  const [showParans, setShowParans] = useState(false);
  // Local Space is its own View now (View ▸ Local Space, hotkey L): the window's mere
  // being-open draws the lines, so there's no separate on/off toggle. Persisted, off
  // by default for a fresh account.
  // Local Space is Advanced-only, so a stale "open + Advanced off" combo never restores:
  // require BOTH the open flag and the persisted Advanced flag (matches the runtime gating).
  //
  // A geodetic boot restores it as stored, open included: the window shows the sky hold's
  // reason in place of its content (skyHeld below) and resumes on Celestial, so nothing has
  // to close for it — and this flag's persistence never writes '0' on the line system's
  // account. (Until 2026-10-02 it started closed there, for the retired switch.)
  const [showLocalSpace, setShowLocalSpace] = useState(
    () =>
      localStorage.getItem('astro:view-local-space:v1') === '1' &&
      localStorage.getItem('astro:advanced:v1') === '1',
  );
  // The "Aspects to angles" line sets — two independent overlays (they can
  // stack), persisted like the other map preferences below.
  const [showAspectLines, setShowAspectLines] = useState(
    () => localStorage.getItem('astro:show-aspect-lines:v1') === '1',
  );
  const [showMidpointLines, setShowMidpointLines] = useState(
    () => localStorage.getItem('astro:show-midpoint-lines:v1') === '1',
  );
  // The Aspect Lines window (Settings ▸ Advanced ▸ Lines ▸ Aspect Lines ▸ Filters
  // & orbs) — a gated-tier surface. Stale-restore guard like showLocalSpace: the
  // open flag only restores when the toggles it lives behind are also persisted on
  // (the render additionally gates on the plan tier below).
  const [showAspectLinesHud, setShowAspectLinesHud] = useState(
    () =>
      localStorage.getItem('astro:aspectlines-open:v1') === '1' &&
      localStorage.getItem('astro:show-aspect-lines:v1') === '1' &&
      localStorage.getItem('astro:advanced:v1') === '1',
  );
  // Display filters for the map's aspect lines (the window's Filters section).
  // The raw pref persists; the EFFECTIVE value (defaults unless the plan reaches
  // the gated rung) is derived below, next to the tier flag.
  const [aspectLineFilters, setAspectLineFilters] = useState(loadAspectLineFilters);
  // Stable close handler for the window (kept out of the render JSX).
  const closeAspectLinesHud = useCallback(() => setShowAspectLinesHud(false), []);
  // The reader's catalog minor bodies (433 Eros, 136199 Eris, …) — the preference and
  // its only writers; everything about whether each one draws is derived below, next
  // to the line pipeline.
  const minorApi = useMinorBodies();
  // The Minor bodies window (Map filters ▸ Minor bodies ▸ More, or '4'). Catalog bodies
  // are an Advanced reading, so this window is gated TWICE, the Aspect Lines window's
  // shape:
  //   · at LOAD, here — the open flag restores only with astro:advanced:v1 also on. This
  //     is CLAUDE.md's downstream-tier trap: a build that drives Advanced from an account
  //     tier writes that key and reloads, never passing through setAdvancedMode, so a
  //     reader who signed out with the window open boots into Basic with it closed, and
  //     signing in again doesn't pop it open by itself. (A closed window announces its
  //     own absence and reopens in one click — the reasoning recorded at setAdvancedMode
  //     for Local Space and Sky Times.)
  //   · at RENDER, below — within a session, Advanced going off hides the window and
  //     holds the flag, and turning Advanced back on (the reader's own gesture) brings
  //     it back where it was.
  const [showMinorHud, setShowMinorHud] = useState(
    () =>
      localStorage.getItem('astro:minor-bodies-open:v1') === '1' &&
      localStorage.getItem('astro:advanced:v1') === '1',
  );
  const closeMinorHud = useCallback(() => setShowMinorHud(false), []);
  const [coordSystem, setCoordSystem] = useState<CoordSystem>(() =>
    localStorage.getItem('astro:coord-system:v1') === 'zodiaco'
      ? 'zodiaco'
      : 'mundo',
  );
  const [fortuneFormula, setFortuneFormula] = useState<FortuneFormula>(() =>
    localStorage.getItem('astro:fortune-formula:v1') === 'ptolemaic'
      ? 'ptolemaic'
      : 'sect',
  );
  const [houseSystem, setHouseSystem] = useState<HouseSystem>(() => {
    const v = localStorage.getItem('astro:house-system:v1');
    const valid: HouseSystem[] = [
      'placidus', 'whole', 'equal', 'koch', 'regiomontanus', 'campanus', 'porphyry', 'alcabitus',
      'meridian', 'morinus',
    ];
    return valid.includes(v as HouseSystem) ? (v as HouseSystem) : 'placidus';
  });
  const [nodeType, setNodeType] = useState<NodeType>(() =>
    localStorage.getItem('astro:node-type:v1') === 'mean' ? 'mean' : 'true',
  );
  // Which rulership table the essential-dignity read uses (Settings ▸ Calculation ▸
  // Rulerships). 'modern' is the default because it is what the app did before this
  // was a choice — the modern scheme is the classical table PLUS the outer three,
  // which is exactly the merged table that shipped — so an existing install's
  // dignity list does not move under it. A plain preference: neither value is ever
  // invalid, so there is nothing here to derive or mask.
  const [rulershipScheme, setRulershipScheme] = useState<RulershipScheme>(() => {
    // Anything but 'traditional' resolves to 'modern' — the default doubles as the
    // fallback, so an unreadable or unrecognised stored value lands on the reading
    // the app has always given rather than silently switching schools.
    return localStorage.getItem('astro:rulership:v1') === 'traditional'
      ? 'traditional'
      : 'modern';
  });
  // The STORED line-system choice. Consumers read the derived `lineSystem` below, not
  // this — the geodetic mapping is tropical-only, so a sidereal zodiac masks it. Masking
  // rather than rewriting is the point: sidereal is a standing condition, and when it
  // ends the user's Geodetic choice has to still be here.
  const [lineSystemPref, setLineSystemPref] = useState<LineSystem>(loadLineSystemPref);
  // The expanded wheel's Advanced reading mode (degree rim, aspect grid, coordinate
  // tables). Lifted here — same storage key the sidebar always used — so the Info chip
  // can gate its Advanced-tab items on it.
  const [advancedWheel, setAdvancedWheel] = useState(
    () => localStorage.getItem('astro:advanced:v1') === '1',
  );
  // The same flag through a ref, for a gate that must see a setAdvancedMode made in
  // the SAME gesture: Help runs `setAdvancedMode(true)` and then `openView(...)` in one
  // handler, where the state value is still the old one. Written by setAdvancedMode
  // itself and synced after commit, which is before any other gesture can reach it.
  const advancedRef = useRef(advancedWheel);
  useEffect(() => {
    advancedRef.current = advancedWheel;
  }, [advancedWheel]);
  // Zodiac reading frame (Advanced ▸ Zodiac): tropical, or sidereal by ayanamsa — a
  // display-layer choice (see the sidereal block further down).
  const [zodiacMode, setZodiacMode] = useState(loadZodiacMode);
  // These three sit up here, ahead of the other eff* values, only because the derived
  // line system below needs them (the first two directly, the third in its setter) and
  // `visiblePlanets` (just under it) needs THAT.
  const effZodiacMode = advancedWheel ? zodiacMode : 'tropical';
  // The EFFECTIVE line system every consumer reads — the name stays `lineSystem` so the
  // ~80 read sites don't care that a preference sits behind it. The geodetic mapping is
  // the TROPICAL zodiac laid on Earth's longitudes by definition, with no sidereal
  // variant, so a sidereal zodiac masks it to celestial. Masked, never rewritten: the
  // Sidebar shows Geodetic present-but-unavailable with the reason, and reverting to
  // tropical brings the choice straight back with nothing to redo.
  //
  // TWO conditions mask it now. The second is the HOLD (lib/geodeticHold) — the
  // mapping is withheld while discrepancies in how it draws are worked through —
  // and it takes the same shape for the same reason: a hold is a standing state,
  // so the preference is masked and never rewritten, and a reader who had Geodetic
  // selected still has it the day the hold lifts.
  //
  // (The derivation itself is `effectiveLineSystem`, out at module scope, so the setters
  // further down can ask what it is about to become before they change one of its inputs.)
  const lineSystem: LineSystem = effectiveLineSystem(lineSystemPref, zodiacMode, advancedWheel);
  // The SKY HOLD (lib/skyHold): on a geodetic map, everything that reads the sky's turning
  // rather than a zodiacal degree is held — local space, parans and star parans, fixed-star
  // lines, the Vertex axis, zenith/nadir points and the ecliptic curve, night shade, the Sky
  // Times band, Slide, Primary Directions, and every tool that declares `needsSiderealTime`.
  // CLAUDE.md rule 2's shape throughout: no preference is written, each one is masked by a
  // derived value (the eff* flags, visibleLineTypes, lsActive, effTransitFrame, …), every
  // guard reads THIS, and switching back to Celestial hands everything back as it was left.
  // It replaced the 17 September switch, which rewrote the line system to Celestial to open
  // any of these (and closed them when Geodetic arrived); nothing changes the line system
  // on the reader's behalf now. Reads the DERIVED line system, so a geodetic choice masked
  // by a sidereal zodiac or the review hold holds nothing. (2026-10-02)
  const skyHeld = skyHeldFor(lineSystem);
  // The same value through a ref, for the stable openers and the keydown handler, and for a
  // gate that must see a line-system move made in the SAME gesture (Help can call
  // setAdvancedMode and then openView in one handler). Written synchronously by every setter
  // that can move the line system on screen — setLineSystemSafe, setAdvancedMode and
  // setZodiacModeSafe, through enterLineSystem; advancedRef's shape — and synced after commit.
  const skyHeldRef = useRef(skyHeld);
  useEffect(() => {
    skyHeldRef.current = skyHeld;
  }, [skyHeld]);
  // The Angles filter as drawn: the Vertex axis is masked on a geodetic map, which draws the
  // four angles only, while the stored choice stays as the reader left it (the Sidebar reads
  // visibleLineTypesPref). Same identity whenever nothing is masked. (2026-10-02)
  const visibleLineTypes = useMemo(
    () =>
      skyHeld && (visibleLineTypesPref.has('VX') || visibleLineTypesPref.has('AVX'))
        ? new Set([...visibleLineTypesPref].filter((lt) => lt !== 'VX' && lt !== 'AVX'))
        : visibleLineTypesPref,
    [skyHeld, visibleLineTypesPref],
  );
  // ...and at the generators, so the Vertex lines aren't built at all there, for the map or
  // for the complete set a plugin reads (buildAllLines). Passed to every planet, aspect and
  // midpoint generator call below; the catalog bodies never draw a Vertex. (2026-10-02)
  const lineOpts = useMemo(() => ({ vertex: !skyHeld }), [skyHeld]);
  // A chart with no birth time on a geodetic map. Such a map doesn't turn with the sky, so a
  // chart cast for its 12:00 placeholder still has lines there — the planets' zodiacal
  // degrees are all a geodetic line reads, and they are known to within the day (the fast
  // bodies' bands say how far). On a celestial map the lines ARE the sky's turning, which
  // the unknown hour decides, so none are drawn. Reads the DERIVED line system: a held or
  // sidereal-masked Geodetic choice draws as celestial and so keeps that empty state.
  // (2026-10-02)
  const timelessGeodetic = noTime && lineSystem === 'geodetic';
  // The natal families that read the sky's turning at the chart minute rather than a body's
  // degree: parans, zenith stamps (the planets' and the catalog bodies' coins), the fixed
  // stars' lines and parans, and the ecliptic, anchored at the minute's sidereal time. None
  // is drawn without a birth time, in either line system, and the timeless chart's geodetic
  // lines don't bring them back — nor on a geodetic map at all, which holds every one of
  // them (skyHeld above). Every one of those memos reads this ONE gate, so anything else
  // that comes to turn the same families off joins it here, never memo by memo.
  // verify-geodetic-chart §6 holds the memos to it. (2026-10-02)
  const skyFamiliesOff = noTime || skyHeld;
  // Acknowledgement for settings this app moves on the user's behalf (lib/autoFlipNotice).
  // Declared up here, ahead of the setters that announce. `announce` is only ever called
  // from event handlers.
  const {
    pending: autoFlipKind,
    announce: announceFlip,
    dismiss: dismissAutoFlip,
  } = useAutoFlipNotice();
  const [autoFlipSuppress, setAutoFlipSuppress] = useState(false);
  // The EFFECTIVE visible set every consumer reads (wheel, tables, line filters,
  // extensions, sky band). The Part of Fortune is a zodiacal-frame point: In
  // Mundo it has no map line (its lines exist In-Zodiaco/geodetic only), so
  // there it reads as toggled OFF everywhere — while the stored preference
  // above stays put, and the Lot returns exactly as set the moment the frame is
  // zodiacal again. The Sidebar's checkboxes read the raw preference.
  const visiblePlanets = useMemo(() => {
    const zodiacalFrame = lineSystem === 'geodetic' || coordSystem === 'zodiaco';
    if (zodiacalFrame || !visiblePlanetsPref.has('Fortune')) {
      return visiblePlanetsPref;
    }
    const s = new Set(visiblePlanetsPref);
    s.delete('Fortune');
    return s;
  }, [visiblePlanetsPref, lineSystem, coordSystem]);
  // Basemap detail layers default to shown; the "Details" section toggles them
  // off. (`!== '0'` so a brand-new visitor with no saved value gets them on.)
  const [showRoads, setShowRoads] = useState(
    () => localStorage.getItem('astro:show-roads:v1') !== '0',
  );
  const [showRivers, setShowRivers] = useState(
    () => localStorage.getItem('astro:show-rivers:v1') !== '0',
  );
  const [showLabels, setShowLabels] = useState(
    () => localStorage.getItem('astro:show-labels:v1') !== '0',
  );
  const [hover, setHover] = useState<Point | null>(null);
  // A restored share link re-places its pin (label resolves on the next hover).
  const [pinned, setPinned] = useState<Point | null>(() => sharedBoot?.pin ?? null);
  const [wheelExpanded, setWheelExpanded] = useState(false);
  // Tab quick-swap feedback: while set, the chart switcher (bar, or expanded
  // sidebar when open) flashes its menu with an arrow on the row landed on.
  // The ref is the keydown handler's synchronous copy (the state isn't in the
  // handler effect's deps): while the flash window is open, further Tab taps
  // CYCLE the frozen shortlist instead of starting a fresh swap.
  const [chartFlash, setChartFlash] = useState<ChartQuickFlash | null>(null);
  const chartFlashRef = useRef<ChartQuickFlash | null>(null);
  const chartFlashTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (chartFlashTimer.current) window.clearTimeout(chartFlashTimer.current);
    },
    [],
  );
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  // Flat Mercator ('2d') vs. 3D globe ('3d'); persisted, defaults to 2D.
  const [projection, setProjection] = useState<MapProjectionMode>(loadProjection);

  // View toggles (driven by the top bar's View menu), all default on. "Minimap"
  // (showChart) governs only the compact chart wheel; the expanded Sidebar opens
  // from its own top-bar button (wheelExpanded) and stays reachable even when the
  // minimap is hidden.
  const [showChart, setShowChart] = useState(
    () => localStorage.getItem('astro:view-chart:v1') !== '0',
  );
  const [showCoords, setShowCoords] = useState(
    () => localStorage.getItem('astro:view-coords:v1') !== '0',
  );
  // On touch the settings dock is a heavy full-height takeover, so don't auto-open it there —
  // always start closed regardless of the stored (desktop) preference; the user opens it via
  // the right-edge nub. Desktop keeps its remembered open/closed state.
  const [showSettings, setShowSettings] = useState(
    () => !isTouchLayout() && localStorage.getItem('astro:view-settings:v1') !== '0',
  );
  // The settings dock mounts on open. On touch it slides in/out (see Sidebar.css); to let the
  // CLOSE animation play, keep it mounted through the slide-out and unmount only when that
  // animation ends (Sidebar's onSlideOutEnd). On desktop there's no animation, so it unmounts
  // immediately when closed — exactly as before. `settingsTouch` is the reactive twin of the
  // isTouchLayout() used for the initial state above.
  const settingsTouch = useTouchLayout();
  const [settingsMounted, setSettingsMounted] = useState(showSettings);
  useEffect(() => {
    if (showSettings) setSettingsMounted(true);
    else if (!settingsTouch) setSettingsMounted(false);
    // touch + closing: stay mounted; onSlideOutEnd unmounts after the slide-out.
  }, [showSettings, settingsTouch]);
  // The active-systems status chip (View ▸ Info), above the map attribution.
  // Off by default (like the Location window) — an opt-in detail, not always-on chrome.
  const [showInfo, setShowInfo] = useState(
    () => localStorage.getItem('astro:view-info:v1') === '1',
  );
  // The credits / licenses dialog. Opened from the map's "AstroLina" attribution
  // button and, via the extension context (openCredits), from elsewhere in the app,
  // so the open state lives here; the Map renders the dialog itself.
  const [creditsOpen, setCreditsOpen] = useState(false);
  // The movable Teleport window (View ▸ Teleport, hotkey T) — search a place and fly
  // the camera there (no pin/relocate), with a two-deep back/forward. On-demand, so
  // it defaults OFF.
  const [showTeleport, setShowTeleport] = useState(
    () => localStorage.getItem('astro:view-teleport:v1') === '1',
  );
  // Sky Times (View ▸ Sky times): the day's rise/culminate/set clock at the
  // active point — the bottom sky band. On-demand, so it defaults OFF.
  // Advanced-gated at LOAD, the same way showLocalSpace is above — and for the same
  // reason, which is easy to miss because neither window is advanced-gated at RENDER.
  // The only thing that normally closes them is setAdvancedMode(false); a build that
  // instead drives 'astro:advanced:v1' straight from an account tier never calls it,
  // so a reader who drops back to the base tier with this open would land on a sky
  // band whose View row is tier-filtered away and whose hotkey is gated — visible,
  // and with nothing left to turn it off.
  const [showSkyTimes, setShowSkyTimes] = useState(
    () =>
      localStorage.getItem('astro:view-skytimes:v1') === '1' &&
      localStorage.getItem('astro:advanced:v1') === '1',
  );
  // The two View windows that read the sky's turning, through their one opener each: on a
  // geodetic map OPENING is refused (the menu row is greyed with the reason, and a hotkey or a
  // plugin's openView does nothing and writes nothing), CLOSING never is. One already open
  // stays open and shows the hold's reason in place of its content. Every route in — the View
  // menu, the L and S hotkeys, ctx.openView — comes through these, so the check lives in one
  // place rather than in each caller's memory. Read through skyHeldRef, so a line-system move
  // made earlier in the same gesture counts. (2026-10-02)
  const setShowLocalSpaceSafe = useCallback((v: boolean) => {
    if (v && skyHeldRef.current) return;
    setShowLocalSpace(v);
  }, []);
  const setShowSkyTimesSafe = useCallback((v: boolean) => {
    if (v && skyHeldRef.current) return;
    setShowSkyTimes(v);
  }, []);
  // The Planetary hours window — a module of the sky band, not a view: its only
  // opener is the chip at the head of the band, and the band renders it, so it
  // shows only while the band does. Whatever hides the band (its ✕, Capture, a view
  // lock, Advanced going off) hides the window and HOLDS this flag — reopening the
  // band, the reader's own gesture, brings the window back as it was left.
  //
  // It defaults OPEN — the first time a reader opens Sky Times, the hours come with
  // it (a product decision, 2026-09-28) — so the flag is stored ONLY when the reader
  // toggles it (the chip or the window's ✕, via togglePlanetaryHud below), never by
  // a mount-time effect: an absent key has to go on meaning "never chosen" for the
  // default to reach anyone. (That also keeps the default changeable later without a
  // key bump — nothing but a real choice is ever in storage; CLAUDE.md rule 6.)
  //
  // No Advanced check at load, unlike showSkyTimes above, and deliberately: the
  // downstream-tier trap is a surface left on screen with nothing to close it, and
  // this window can't be on screen without the band, which carries that check
  // itself. A load gate here would only CLEAR the default — a reader who turns
  // Advanced on mid-session would open Sky Times the first time to find it shut. If
  // the window ever becomes able to outlive the band, the check becomes load-bearing
  // and belongs back (showMinorHud's shape).
  //
  // :v2 because :v1 existed only in development builds, whose mount-time write
  // stored a '0' in every browser that loaded them — a closed "choice" nobody made,
  // which would hide the new default from exactly the people testing it.
  const [showPlanetaryHud, setShowPlanetaryHud] = useState(
    () => localStorage.getItem('astro:planetary-hours-open:v2') !== '0',
  );
  const togglePlanetaryHud = () => {
    const next = !showPlanetaryHud;
    localStorage.setItem('astro:planetary-hours-open:v2', next ? '1' : '0');
    setShowPlanetaryHud(next);
  };
  useEffect(() => {
    localStorage.setItem('astro:advanced:v1', advancedWheel ? '1' : '0');
  }, [advancedWheel]);
  // Overlay wheel layout (Advanced ▸ Wheel layout): the classic bi-wheel, or
  // two full stacked wheels.
  const [dualWheels, setDualWheels] = useState(
    () => localStorage.getItem('astro:wheel-layout:v1') === 'dual',
  );
  useEffect(() => {
    localStorage.setItem('astro:wheel-layout:v1', dualWheels ? 'dual' : 'bi-wheel');
  }, [dualWheels]);
  // Which aspect categories the wheel draws, toggled by the expanded sidebar's pills.
  // Lifted here — same storage key the sidebar always used — because more than one
  // surface now draws that wheel, and a second copy of this set would drift from the
  // pills the moment either one changed.
  const [visibleAspects, setVisibleAspects] = useState<Set<AspectCategory>>(() => {
    try {
      const raw = localStorage.getItem('astro:visible-aspects:v1');
      if (raw) return new Set(JSON.parse(raw) as AspectCategory[]);
    } catch {
      /* fall through */
    }
    return new Set<AspectCategory>(['harmonious', 'hard', 'conjunction']);
  });
  useEffect(() => {
    localStorage.setItem(
      'astro:visible-aspects:v1',
      JSON.stringify(Array.from(visibleAspects)),
    );
  }, [visibleAspects]);
  // The guides reference (View ▸ Guides): reopen the onboarding guides as a glossary.
  // Not persisted — it's an on-demand reference, so it shouldn't reappear on every load.
  // guideIndex is which met-guide the pager is showing (reset to the first on open).
  const [showGuides, setShowGuides] = useState(false);
  const [guideIndex, setGuideIndex] = useState(0);
  // Location "Go back" toggle state: 'none' until the first jump, then 'back'
  // (next press returns to where you were) <-> 'forward' (returns to the place you
  // jumped to). Held here so it survives the window closing/reopening.
  const [locationReturn, setLocationReturn] = useState<'none' | 'back' | 'forward'>(
    'none',
  );
  // The coordinate the next Go back / Return press would fly to — surfaced in the
  // Location view as a rough place name so the user sees where they're about to jump.
  const [teleportTarget, setTeleportTarget] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  // Shared "overlay bar expanded?" preference across ALL bottom overlay bars (timeline,
  // synastry, eclipses). The eye on any bar's nub toggles it, so collapsing one bar and then
  // cycling (O / dropdown) to another keeps the same collapsed-vs-expanded view. Collapsed =
  // just the draggable nub (no ruler/transport/picker). Persisted under the original key.
  const [overlayExpanded, setOverlayExpanded] = useState(
    () => localStorage.getItem('astro:show-timeline:v1') !== '0',
  );
  const toggleOverlayExpanded = () => setOverlayExpanded((v) => !v);
  // A bump counter, not a boolean: the status strip's frame item points at a control on
  // the timeline bar rather than at a settings tab, so "go there" has to mean expanding
  // the bar (it may be collapsed to its nub) and then MARKING the control, since the row
  // it lives on is dense. A counter re-fires the mark on every click; a boolean would
  // need clearing, and a second click before the clear would do nothing.
  const [flashFrameSeq, setFlashFrameSeq] = useState(0);
  const showFrameControl = useCallback(() => {
    setOverlayExpanded(true);
    setFlashFrameSeq((n) => n + 1);
  }, []);
  // Appearance ▸ Details ▸ Zeniths/Nadirs: draw the NATAL bodies' zenith (overhead)
  // stamps, their antipodal nadir (underfoot) stamps, and the ecliptic reference
  // curve through the Sun's zenith. On by default. This ONE toggle also governs the
  // active overlay's own zenith/nadir stamps + ecliptic — they ride the overlay's
  // primary lines, so they show whenever an overlay is up and this toggle is on (no
  // separate overlay-zenith control). When off, the overlay edge labels also lose
  // their click-to-fly target (no zenith point to fly to).
  const [showZenith, setShowZenith] = useState(
    () => localStorage.getItem('astro:show-zenith:v1') !== '0',
  );
  // Overlay ▸ Display ▸ Natal: on by default. When off (and a time overlay is
  // active), the natal chart is hidden and the overlay is promoted to BE the chart
  // temporarily — drawn solid through the natal path, with the wheel/readouts
  // reading the overlay's own positions/angles. Reverts the moment the overlay is
  // turned off or this is switched back on.
  const [showNatal, setShowNatal] = useState(
    () => localStorage.getItem('astro:show-natal:v1') !== '0',
  );
  // Which sidebar accordion section is open (owned here so the Info chip can open the
  // Calculation tab). Persisted; defaults to Map Filters.
  const [sidebarSection, setSidebarSection] = useState<SidebarSection | null>(() => {
    const v = localStorage.getItem('astro:sidebar-section:v1');
    if (
      v === 'theme' ||
      v === 'filters' ||
      v === 'calc' ||
      v === 'advanced'
    ) {
      return v;
    }
    if (v === 'none') return null;
    return 'filters';
  });

  // A registered surface owning the viewport (lib/extensions/viewLock) parks the
  // View-menu windows + their hotkeys; Settings stays available. Reactive here so
  // the window gates below re-render when the lock flips. Up here, ahead of the
  // derived overlay, because the lock masks two overlays too (below).
  const viewLock = useViewLock();
  const viewParked = viewLock !== null;

  // The STORED overlay technique. Consumers read the derived `overlayMode` below.
  // Restored raw — the conditions that can make a technique unreadable are all
  // resolved on the way out, not on the way in.
  const [overlayModePref, setOverlayModePref] = useState<OverlayMode>(loadOverlayMode);
  // The EFFECTIVE overlay every consumer reads. Two standing conditions can make a
  // stored technique unreadable, and NEITHER is allowed to rewrite it:
  //   · the active chart can't carry it — a composite has no real moment to advance
  //     (Q11), an unknown-birth-time chart can't advance its natal moment, and a
  //     Davison is already a two-person chart so it can't take a partner;
  //   · it's an Advanced-tier technique and Advanced is off.
  // Both end. Someone who opens a composite to glance at it, or turns Advanced off for
  // an afternoon, is not asking to forget the technique they work in — and writing
  // 'off' here used to mean exactly that, permanently, because the write persisted.
  // Masked instead: the menu shows the row unavailable with the reason, and the
  // technique is simply back the moment the chart or the tier allows it again.
  //
  // The map can't carry one either: Primary Directions advance the RAMC, the sky turning
  // over the place, which a geodetic map doesn't have (SKY_HELD_OVERLAYS, lib/skyHold).
  // overlayBlockedFor reads the chart's reasons first and the DERIVED line system after,
  // the same call the Overlay menu and the 'o' cycle make, so all three agree. (2026-10-02)
  //
  // And a surface owning the viewport can't carry Eclipses or Synastry, which are the map
  // itself (VIEW_LOCK_PARKED_OVERLAYS): they read off while the lock holds and come back
  // when it clears. That used to be a WRITE, by the owner on mount — which, once a held
  // tool (lib/skyHold) could stay open without mounting, turned the reader's switch back
  // to Celestial into a silent loss of an overlay picked meanwhile. The lock is a standing
  // state like the others, so it masks too. (2026-10-05)
  const overlayMode: OverlayMode =
    overlayBlockedFor(current, lineSystem)(overlayModePref) ||
    (!advancedWheel && ADVANCED_OVERLAY_MODES.has(overlayModePref)) ||
    (viewParked && VIEW_LOCK_PARKED_OVERLAYS.has(overlayModePref))
      ? 'off'
      : overlayModePref;
  // The active Overlay-menu EXTENSION (registerOverlayExtension), single-select and
  // mutually exclusive with overlayMode. Restored only if the id still matches a
  // registered extension, so a stale id from a removed plugin activates nothing. The
  // open core registers none, so this stays null here.
  const [activeOverlayExt, setActiveOverlayExt] = useState<string | null>(() => {
    const saved = localStorage.getItem(OVERLAY_EXT_KEY);
    return saved && getOverlayExtensions().some((e) => e.id === saved)
      ? saved
      : null;
  });
  const [targetDate, setTargetDate] = useState<number>(() => loadOverlayDate());
  const [partnerId, setPartnerId] = useState<string | null>(() =>
    loadOverlayPartner(),
  );
  const [stepUnit, setStepUnit] = useState<TimeUnit>(() => loadOverlayStep());
  const [playing, setPlaying] = useState(false);
  // Synastry ▸ Relationships: which derived-chart method the Generate button builds.
  const [synastryMethod, setSynastryMethod] = useState<RelationshipMethod>(() =>
    loadSynastryMethod(),
  );
  // Progressions & Directions ("Progs/Dirns") settings — drive the directed overlays.
  // Three values where there used to be one shared five-valued control: the arc
  // calculation for Solar Arc, and — for the progressed overlays — whether the angles
  // advance at all, plus which calculation they advance by when they do. See
  // overlayPrefs for why they are separate keys and how the old one migrates.
  const [arcMethod, setArcMethod] = useState<ArcMethod>(() => loadArcMethod());
  const [progAngleFrame, setProgAngleFrame] = useState<ProgAngleFrame>(() =>
    loadProgAngleFrame(),
  );
  const [progAngleMethod, setProgAngleMethod] = useState<ArcMethod>(() =>
    loadProgAngleMethod(),
  );
  const [primaryRate, setPrimaryRate] = useState<PrimaryRate>(() =>
    loadPrimaryRate(),
  );
  const [userPrimaryRate, setUserPrimaryRate] = useState<number>(() =>
    loadUserPrimaryRate(),
  );
  // Overlay positioning: 'relative-to-natal' (default) vs 'transit-moment'.
  const [transitFrame, setTransitFrame] = useState<TransitFrame>(() =>
    loadTransitFrame(),
  );
  // The returns BORROW. A return snap needs the moment's own frame — in the natal frame
  // the returning body is pinned to its birth degree by construction, so its lines would
  // never move from one return to the next. That used to be written straight into
  // `transitFrame`, which is PERSISTED: one press of the Solar button destroyed the
  // reader's real frame choice, in this session and every session after it, from a
  // control two steps away from the one that owns the preference.
  //
  // So the frame is BORROWED rather than taken (the shape CLAUDE.md rule 2 asks for, and
  // the same one lineSystemPref/overlayModePref use): the preference is never written, a
  // derived value masks it for as long as the reader is on a return, and the chip in the
  // timeline nub is both the record that it happened and the handle for giving it back.
  //
  // Deliberately NOT persisted. It is a fact about what the reader is doing right now, not
  // a preference; a reload lands back on their own frame, which is the honest default when
  // the chip that explains the hold isn't on screen to explain it.
  const [returnBorrow, setReturnBorrow] = useState<{
    body: ReturnBody;
    /** The return instant, for the chip's date — not re-derived from the cursor, which
     *  the return arrows move off the exact instant by rounding. */
    ms: number;
    /** Whose return. Scoping the borrow to the chart is what lets it be a pure
     *  derivation below: switching charts ends it without an effect or a clear at each
     *  of the four places a chart can change. */
    chartId: string | null;
  } | null>(null);
  const endReturnBorrow = useCallback(() => setReturnBorrow(null), []);
  // Every way of moving the timeline EXCEPT the returns controls ends the borrow. The
  // distinction that matters is which control moved the cursor, not where it ended up —
  // that keeps the return arrows walking returns without a tolerance window around the
  // return instant, and it means a reader who has gone somewhere else is not still being
  // shown a frame borrowed for a moment they have left.
  //
  // Wrapped in ONE place rather than at each call site: this is what the timeline bar and
  // the extension context are both handed, so a plugin's "jump to this date" exits by
  // construction and so does the next one somebody writes. `snapToReturn` is the sole
  // caller of the raw setter.
  const moveTimeline = useCallback((ms: number) => {
    setReturnBorrow(null);
    setTargetDate(ms);
  }, []);
  // Starting playback is a departure too: an animating return map is a line set spinning
  // around the globe, which is not a reading of anything. (Stopping isn't — pausing ON a
  // return should leave the reader looking at it.)
  const setPlayingUser = useCallback((v: boolean) => {
    if (v) setReturnBorrow(null);
    setPlaying(v);
  }, []);
  // Picking a frame by hand CANCELS the borrow rather than cashing it: once a deliberate
  // choice is made the app has no business holding one on the reader's behalf. So this
  // both writes the preference and drops the hold — otherwise the segment would refuse to
  // move, the mask outranking the very click meant to end it. Every route in goes through
  // here, including the Activations panel's "Use Natal angles" (via the context).
  const setTransitFrameByUser = useCallback((f: TransitFrame) => {
    setReturnBorrow(null);
    setTransitFrame(f);
  }, []);
  useEffect(() => saveZodiacMode(zodiacMode), [zodiacMode]);
  // Eclipses overlay: the selected catalog eclipse (by id), the magnitude-
  // isoline interval, and the "eclipse chart lines" display toggle.
  const [eclipseId, setEclipseId] = useState<string | null>(() =>
    loadEclipseId(),
  );
  const [eclipseIsoStep, setEclipseIsoStep] = useState<EclipseIsoStep>(() =>
    loadEclipseIsoStep(),
  );
  // The eclipse CHART: the overlay ring drawn in the chart wheel (ExpandedChartSidebar)
  // for the sky at the eclipse maximum. Toggled by a plain click on the HUD's eye.
  const [showEclipseChart, setShowEclipseChart] = useState(() =>
    loadEclipseChart(),
  );
  // The eclipse-time planet/angle LINES on the map. Decoupled from the chart above so a
  // plain click shows the wheel ring WITHOUT the map lines. Off by default and opt-in —
  // a fork can enable them (e.g. from a dev console via the `astro:cheat` event handled
  // below) or default them on. Turning the chart off clears these again.
  const [showEclipseMapLines, setShowEclipseMapLines] = useState(() =>
    loadEclipseMapLines(),
  );
  // Eclipses ▸ Display ▸ Other Lines: everything on the map that isn't the eclipse.
  // On by default; while it is off it OVERRIDES each of those families' own toggles,
  // which is the whole point — one press for a clean map, not a tour of the settings.
  const [showEclipseOtherLines, setShowEclipseOtherLines] = useState(() =>
    loadEclipseOtherLines(),
  );

  // Mapping tools (top bar). Transient — not persisted across reloads.
  const [mapTool, setMapTool] = useState<MapTool>('off');
  // The registered Tools-menu extensions that are open (registerToolExtension; toggled in the
  // Tools-menu extensions block further down, which explains the machinery). Declared up here
  // beside the built-in tool it is one-at-a-time with. A tool that declares
  // `needsSiderealTime` restores open on a geodetic map like any other: the host draws its
  // held card in its place (skyHeld), so nothing has to close for it. (2026-10-02)
  const [openTools, setOpenTools] = useState<Set<string>>(() => {
    const open = new Set<string>();
    for (const ext of getToolExtensions()) {
      const saved = ext.storageKey ? localStorage.getItem(ext.storageKey) : null;
      if (saved === '1' || (saved === null && ext.defaultOpen)) open.add(ext.id);
    }
    return open;
  });
  // Mirror openTools into a ref so toggleTool can stay STABLE — the once-bound global keydown handler
  // reads it lazily, and a tool's hotkey needs the CURRENT open-state to toggle right.
  const openToolsRef = useRef(openTools);
  useEffect(() => {
    openToolsRef.current = openTools;
  }, [openTools]);
  // Capture-frame aspect ratio (width / height), persisted. Only consulted
  // while the Capture tool is armed (mapTool === 'capture'); the CaptureHud picks the preset.
  const [captureAspect, setCaptureAspect] = useState<number>(() => {
    const n = parseFloat(localStorage.getItem('astro:capture-aspect:v1') ?? '');
    return Number.isFinite(n) && n > 0 ? n : 16 / 9; // default landscape 16:9
  });
  // What the capture frame is a picture OF, persisted alongside the ratio. 'map' — the
  // framed map, with the chart as an optional note docked beside it. 'chart' — the chart
  // alone, filling the frame. The ratio, caption and export actions serve both, which is
  // why this is its own axis rather than a fourth ratio preset.
  const [captureSubject, setCaptureSubject] = useState<'map' | 'chart'>(() =>
    localStorage.getItem('astro:capture-subject:v1') === 'chart' ? 'chart' : 'map',
  );
  const setCaptureSubjectPersist = useCallback((s: 'map' | 'chart') => {
    setCaptureSubject(s);
    try {
      localStorage.setItem('astro:capture-subject:v1', s);
    } catch {
      /* ignore */
    }
  }, []);
  // Capture caption fields, persisted. The pin, edge labels and watermark are now
  // always included (no toggles); only WHICH parts of the caption appear is configurable.
  // The caption fields are lifted here (not kept in CaptureHud) because the Map reserves a
  // footer band for the caption while the frame is armed.
  const [captureCaptionFields, setCaptureCaptionFields] = useState<{
    name: boolean;
    date: boolean;
    time: boolean;
    location: boolean;
    coordinates: boolean;
    calculations: boolean;
  }>(() => {
    try {
      const p = JSON.parse(localStorage.getItem('astro:capture-caption:v1') ?? '{}');
      return {
        name: p.name !== false,
        date: p.date !== false,
        time: p.time !== false,
        location: p.location !== false,
        // The full lat/long is a technical detail (the named place is the friendly form),
        // so it's off by default like the calculation systems below.
        coordinates: p.coordinates === true,
        // The calculation systems are off by default — they're a power-user detail.
        calculations: p.calculations === true,
      };
    } catch {
      return { name: true, date: true, time: true, location: true, coordinates: false, calculations: false };
    }
  });
  const toggleCaptureCaptionField = useCallback(
    (k: 'name' | 'date' | 'time' | 'location' | 'coordinates' | 'calculations') => {
      setCaptureCaptionFields((p) => {
        const next = { ...p, [k]: !p[k] };
        try {
          localStorage.setItem('astro:capture-caption:v1', JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [],
  );
  // Capture details: pick a view (none / wheel / list) and which optional groups it carries.
  // 'none' is the default — no details panel at all. Choosing a view ALWAYS shows the planets
  // (they're the baseline of any view — there's no planets toggle); angles + balance are the
  // optional adds. (v2 key; a stale `planets` field from earlier builds is just ignored here.)
  const [captureExtras, setCaptureExtras] = useState<{
    view: 'none' | 'wheel' | 'list';
    angles: boolean;
    balance: boolean;
  }>(() => {
    try {
      const p = JSON.parse(localStorage.getItem('astro:capture-extras:v2') ?? '{}');
      return {
        view: p.view === 'wheel' ? 'wheel' : p.view === 'list' ? 'list' : 'none',
        angles: p.angles === true,
        balance: p.balance === true,
      };
    } catch {
      return { view: 'none', angles: false, balance: false };
    }
  });
  const toggleCaptureExtra = useCallback((k: 'angles' | 'balance') => {
    setCaptureExtras((p) => {
      const next = { ...p, [k]: !p[k] };
      try {
        localStorage.setItem('astro:capture-extras:v2', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  const setCaptureView = useCallback((view: 'none' | 'wheel' | 'list') => {
    setCaptureExtras((p) => {
      if (p.view === view) return p;
      const next = { ...p, view };
      try {
        localStorage.setItem('astro:capture-extras:v2', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  // Capture ▸ per-overlay visibility: registered map overlays the user hides from
  // captures (MapOverlay.captureToggle — e.g. an add-on's plotted markers). The set
  // persists, but it reaches the Map ONLY while the tool is armed (see the Map's
  // hiddenOverlayIds below), so every overlay returns the moment Capture closes.
  const [captureHiddenOverlays, setCaptureHiddenOverlays] = useState(
    loadCaptureHiddenOverlays,
  );
  useEffect(
    () => saveCaptureHiddenOverlays(captureHiddenOverlays),
    [captureHiddenOverlays],
  );
  const toggleCaptureOverlay = useCallback((id: string) => {
    setCaptureHiddenOverlays((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  // The active calculation systems, exactly as the "Info" view (InfoBar) lists them —
  // for the optional "calculations" caption field.
  const captureCalcText = useMemo(() => {
    const parts = [labels.lineSystem(lineSystem)];
    if (lineSystem === 'celestial') parts.push(labels.coordSystem(coordSystem));
    if (advancedWheel) parts.push(labels.houseSystem(houseSystem));
    if (advancedWheel && zodiacMode !== 'tropical')
      parts.push(t(`settings.zodiac.${zodiacMode}.label`));
    parts.push(labels.nodeType(nodeType));
    return parts.join(' · ');
  }, [labels, t, lineSystem, coordSystem, houseSystem, zodiacMode, nodeType, advancedWheel]);
  // (The capture caption's fields are built further down, once the pin state they
  // name exists — see captureFields near the coordinates readout.)
  const [measure, setMeasure] = useState<MeasureInfo | null>(null);
  const [measureSnap, setMeasureSnap] = useState(false);
  // Whether the Slide tool can run right now (kept in a ref so the early-declared
  // toggleSlide can read it; the value is derived far below, once promoted/eclipse
  // state exists, and synced into this ref).
  const slideAvailableRef = useRef(true);
  // Slide tool: elapsed Earth-rotation time (days, signed) the user has spun the
  // globe to. Drives the time-shifted line recompute + the readout; 0 = natal.
  const [slideDt, setSlideDt] = useState(0);
  // Arm the Slide tool. It works in either projection (flat or globe); only the
  // geodetic line frame can't be spun (its lines carry no sidereal time), so on a
  // geodetic map arming is HELD — refused, with its menu row greyed and the reason on
  // it (lib/skyHold). It never switches the line system to get there (that was the 17
  // September switch, retired 2026-10-02). Idempotent while armed.
  //
  // EVERY route to an armed Slide comes through here — the menu row and the hotkey via
  // toggleSlide, an extension via ctx.openBuiltinTool. One arming Slide directly used to
  // skip the gates below and be disarmed again by the effect that guards it, in silence.
  const armSlide = useCallback(() => {
    // No natal cage to spin when natal linework is hidden / an overlay is promoted
    // (slideAvailableRef, synced below). The hotkey routes here, so gate it too.
    if (!slideAvailableRef.current) return;
    if (skyHeldRef.current) return;
    // A playing timeline and a spinning globe fight over the camera/data — pause it.
    if (playing) setPlaying(false);
    setMapTool('slide');
  }, [playing]);
  const toggleSlide = useCallback(() => {
    if (mapTool === 'slide') {
      setMapTool('off');
      return;
    }
    armSlide();
  }, [mapTool, armSlide]);
  // The current map-pin-state accent resolved to a concrete color, for the WebGL
  // measure layers (which can't read CSS vars). Kept in sync below.
  const [measureColor, setMeasureColor] = useState('#8b909c');
  // True once zoomed in to "detail" level (where the Map's Zoom-out button appears).
  // Gates the network reverse-geocoder to zooms where the exact town actually
  // matters, so most points resolve from the bundled city data with no request.
  const [detailZoom, setDetailZoom] = useState(false);

  const mapRef = useRef<MapHandle>(null);

  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    saveProjection(projection);
  }, [projection]);

  // Settings toggles that the global hotkeys below flip (Shift+N / S / D / O). Declared
  // here, ahead of the keydown effect that references their setters, so the shortcut
  // closures bind to live state. Their persistence effects and companions (starSet,
  // orb widths) stay with the rest of the map state further down.
  const [showStarLines, setShowStarLines] = useState(loadShowStarLines);
  // Advanced ▸ Lines ▸ Natal Lines (Shift+N) — the raw PREFERENCE. Nothing reads it
  // directly except its own control and the persistence effect; the map reads
  // `hideNatalAngles` further down, which masks it while Advanced is off.
  const [showNatalLines, setShowNatalLines] = useState(loadShowNatalLines);
  const [showNightShade, setShowNightShade] = useState(loadShowNightShade);
  // Calculation ▸ Geodetic grid (lib/astro/geodeticGrid). Each preference is written by its
  // own setter below, inside the reader's click — never by a persistence effect, so no mount
  // ever lands a value in storage (CLAUDE.md rule 6; overlayPrefs says more). The Ascendant
  // curves keep a TRI-STATE preference: null is "auto", resolved each render further down
  // (geoGridAscOn) and never written (rule 2). The legend's isolate is transient: a stored one
  // would bring the map back next session with most zones blank and nothing to say why.
  // (2026-10-02)
  const [geoGridMcOn, setGeoGridMcOn] = useState(loadGeoGridMc);
  const [geoGridAscPref, setGeoGridAscPref] = useState<boolean | null>(loadGeoGridAscPref);
  const [geoZonesOn, setGeoZonesOn] = useState(loadGeoZones);
  const [geoZonesPresentation, setGeoZonesPresentation] = useState(loadGeoZonesPresentation);
  const [geoZoneIsolate, setGeoZoneIsolate] = useState<GeoZoneIsolate>(null);
  const setGeoGridMc = useCallback((v: boolean) => {
    setGeoGridMcOn(v);
    saveGeoGridMc(v);
  }, []);
  const setGeoGridAsc = useCallback((v: boolean) => {
    setGeoGridAscPref(v);
    saveGeoGridAscPref(v);
  }, []);
  const setGeoZones = useCallback((v: boolean) => {
    setGeoZonesOn(v);
    saveGeoZones(v);
  }, []);
  const setGeoZonesPresentationPref = useCallback((v: boolean) => {
    setGeoZonesPresentation(v);
    saveGeoZonesPresentation(v);
  }, []);
  const [showOrbZones, setShowOrbZones] = useState(loadShowOrbZones);

  // ── Effective advanced settings ─────────────────────────────────────────────
  // Advanced mode is a master switch: while it's OFF the chart/map behave as if
  // these settings are at their defaults, but the raw values stay in state (and
  // still back the now-hidden Sidebar controls), so turning Advanced back on
  // restores exactly what the user had. Only the chart/map COMPUTATION reads
  // these effective values; the (hidden) Sidebar/InfoBar keep the raw ones.
  const effHouseSystem = advancedWheel ? houseSystem : 'placidus';
  // effZodiacMode belongs in this group but is resolved further up, where the derived
  // line system it feeds has to sit (see the comment there).
  const effFortuneFormula = advancedWheel ? fortuneFormula : 'sect';
  // Parans, fixed-star lines and the zenith/nadir stamps also stand down on a geodetic map
  // (skyHeld), masked the same way: the stored switch is untouched and shows on its greyed
  // control, and Celestial brings the family straight back. Each gates natal, overlay and
  // promoted draws alike, so one clause holds every frame — the zenith flag the ecliptic
  // curve and the catalog bodies' coins too. Their DATA empties; no layer is removed.
  // (2026-10-02)
  const effShowParans = advancedWheel && showParans && !skyHeld;
  const effShowAspectLines = advancedWheel && showAspectLines;
  const effShowMidpointLines = advancedWheel && showMidpointLines;
  const effShowStarLines = advancedWheel && showStarLines && !skyHeld;
  const effShowZenith = advancedWheel && showZenith && !skyHeld;
  const effShowOrbZones = advancedWheel && showOrbZones;
  // Minor bodies ▸ "Parans with the planets" (lib/minorBodies/prefs): the catalog bodies'
  // parans with the built-in bodies, OFF by default. `minorParansPref` is the stored choice,
  // written only by its own switch (setMinorParansPref, below) and never on mount; nothing
  // but that switch and the derivation reads it. The catalog rows are drawn wherever the
  // planets' parans are, so whatever holds THOSE holds these: map Parans off (or Advanced
  // off), the sky hold on a geodetic map, and Cyclocartography standing in for the chart
  // (paransOverlayBlocked, below). A standing state, so it derives rather than writes
  // (CLAUDE.md rule 2): the switch shows the stored value greyed, and the reader's choice is
  // still there when the hold ends. Guards and generators read the DERIVED `minorParansOn`.
  //
  // No time overlay draws parans of its own (timeline AUX_BLOCKED_OVERLAYS, 2026-10-06 —
  // Cyclo's two epochs share no sky-moment; the others have no paran reading). But the
  // chart's own parans stay on the map beside an overlay (see effParans), so the switch has
  // nothing left to show only while a time overlay is PROMOTED — the drawer's Natal Chart
  // eye off, the overlay standing in for the chart (promoteOverlay, further down, which this
  // restates in the terms readable up here: every paran-blocked mode is a time overlay). One
  // value for the map toggle, its hotkey, the Sidebar row and this hold, so they cannot
  // disagree.
  const paransOverlayBlocked = overlayAuxBlocked(overlayMode, 'paran') && !showNatal;
  const [minorParansPref, setMinorParansPrefState] = useState(loadMinorParansPref);
  const minorParansHeld = !effShowParans || paransOverlayBlocked;
  const minorParansOn = minorParansPref && !minorParansHeld;
  // The switch's own writer. Refuses while held, so the greyed switch is inert in fact and
  // can't store a choice the reader can't see take effect (CLAUDE.md, "a control that shows a
  // derived value must refuse writes while the mask is up").
  const setMinorParansPref = useCallback(
    (on: boolean) => {
      if (minorParansHeld) return;
      setMinorParansPrefState(on);
      saveMinorParansPref(on);
    },
    [minorParansHeld],
  );
  // Transits-bar positioning frame (the Relative/Absolute switch in the returns row): a free
  // display choice, shown and honored in every reading mode. Only celestial lines show its
  // effect (others ignore sidereal time; see TimelineHud posEnabled). Was gated to Advanced,
  // raw restored when on. (The drawer's Natal toggle is NOT gated — always available, reads
  // raw showNatal.)
  // With the birth time unknown there is no natal RAMC to hold, so the transit map
  // is forced to the absolute sky-of-the-moment frame (the only one that's real).
  //
  // A returns borrow masks it the same way, for as long as the reader is on the return
  // they snapped to (see returnBorrow). Both conditions are STANDING states rather than
  // events, so neither is written: the stored preference is untouched underneath and is
  // simply back when the condition ends.
  //
  // The two extra clauses are what make the borrow a pure derivation instead of something
  // an effect has to chase: it belongs to one chart, and it only means anything on the
  // overlay that has the frame control. (Leaving transits CLEARS it outright at the
  // setter — this clause is for the path where the mode is merely masked to None, e.g. a
  // chart that can't carry the technique.)
  //
  // And a geodetic map holds both angle controls at Natal angles, outranking the two
  // above: a place's angles there come from its coordinates, so there is no moving frame
  // to pick (settings.inert.anglesHeld). Masked like the others, never written — the
  // overlays still move the planets through the grid, and the reader's stored frames come
  // back on Celestial. (2026-10-02)
  const frameHeldForReturn =
    returnBorrow !== null &&
    returnBorrow.chartId === currentId &&
    overlayMode === 'transits' &&
    lineSystem === 'celestial' &&
    !noTime;
  const effTransitFrame: TransitFrame =
    lineSystem === 'geodetic'
      ? 'relative-to-natal'
      : noTime || frameHeldForReturn
        ? 'transit-moment'
        : transitFrame;
  // The progressed overlays' Angles control, held at Natal angles on a geodetic map for the
  // reason above. Feeds angleProgression, the extension context and the timeline bar; its
  // save effect persists the RAW preference (CLAUDE.md rule 2). (2026-10-02)
  const effProgAngleFrame: ProgAngleFrame = lineSystem === 'geodetic' ? 'natal' : progAngleFrame;
  // The single value the overlay builder and every downstream consumer still read, folded
  // back together from the three controls. Splitting the CONTROLS did not split the
  // calculation: 'mean-quotidian' remains what "hold the natal angles" resolves to, and
  // Solar Arc has never had a distinct natal-frame form, so its menu simply names the arc
  // it was always applying. Keeping the join here means plugins, the extension context and
  // the verify scripts all see exactly what they saw before.
  const angleProgression: AngleProgression =
    overlayMode === 'solar-arc'
      ? arcMethod
      : effProgAngleFrame === 'natal'
        ? 'mean-quotidian'
        : progAngleMethod;
  // The frame for the status strip: WHOSE ANGLES the drawn lines are measured against.
  // Only where that is a live question. Solar Arc, Primary Directions and cyclo are
  // natal-framed by construction and offer no choice, so naming a frame there would
  // report a decision nobody made; synastry and eclipses have no timeline at all.
  //
  // And only on CELESTIAL lines. The geodetic mapping places a meridian from zodiacal
  // longitude and never reads the overlay's sidereal time, so under it both frames draw
  // the identical LINES — and this strip reports what the map is drawing, so naming one
  // would assert a distinction that isn't on screen. (Both angle controls are held at Natal
  // angles there — effTransitFrame and effProgAngleFrame above. Until 2026-10-02 the
  // progressed pair stayed live for the bi-wheel's angle marks; a geodetic wheel's angles
  // are the place's own now, so it has nothing left to move.)
  const infoOverlayFrame: string | null =
    lineSystem !== 'celestial'
      ? null
      : overlayMode === 'transits'
        ? effTransitFrame === 'relative-to-natal'
          ? t('settings.positioning.relative-to-natal.label')
          : frameHeldForReturn
            ? t('settings.positioning.transit-moment.returnLabel')
            : t('settings.positioning.transit-moment.label')
        : overlayMode === 'progressed' || overlayMode === 'tertiary-progressed'
          ? t(`settings.progAngles.${effProgAngleFrame}.label`)
          : null;
  // The user's plan tier on the NEW < ADV < gated ladder (src/lib/plan.ts). Open core
  // derives it from the Advanced toggle (new ↔ adv); a downstream build installs a resolver
  // (setPlanTierResolver) to reach 'gated' when entitled. Drives the TopNav menus' per-tier
  // visibility + tier badges.
  const planTier: PlanTier = planTierFor(advancedWheel);
  // Whether the plan reaches the GATED rung — the tier the Local Space Capture
  // section and the Aspect Lines window belong to (lib/plan). Hoisted here so the
  // memos below can read it; also keeps tierMet calls out of the render JSX.
  const gatedTierMet = tierMet(planTier, 'gated');
  // Effective aspect-line filters: the stored pref applies only once the plan
  // reaches the gated rung — a stale pref can never hide lines below it.
  const effAspectLineFilters = gatedTierMet
    ? aspectLineFilters
    : DEFAULT_ASPECT_LINE_FILTERS;

  // Global keyboard shortcuts. Space centers the map on the active pin (or drops
  // a natal pin and centers if none is set); 'b' toggles the chart sidebar; the
  // other letter keys toggle the View items / tools / add a chart. All are ignored
  // while typing in a field, and Space is left alone when a button/link is focused
  // so it keeps its native activation behavior there.
  useEffect(() => {
    // 'o' cycles through the overlays only (never lands on None); 'n' clears to None.
    // From None, indexOf is -1 so the first 'o' lands on the first overlay (transits).
    // The 'o' cycle follows the Overlay menu order (OVERLAY_MODES); the advanced-tier
    // overlays are included only while Advanced is on, matching the menu's tier filter.
    const overlayCycle: OverlayMode[] = (
      advancedWheel ? OVERLAY_MODES : OVERLAY_MODES.filter((m) => !ADVANCED_OVERLAY_MODES.has(m))
    ).filter((m) => !overlayBlockedFor(current, lineSystem)(m));
    const isTypingField = (el: HTMLElement | null) =>
      !!el &&
      (el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT' ||
        el.isContentEditable);
    const isInteractive = (el: HTMLElement | null) =>
      isTypingField(el) ||
      (!!el &&
        (el.tagName === 'BUTTON' ||
          el.tagName === 'A' ||
          el.closest(
            'button, a, [role="button"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
          ) !== null));
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // Slide nudges — the ONLY pre-repeat-guard case: a held arrow must keep
      // stepping (auto-repeat), and Shift selects the coarse step so it can't
      // sit behind the modifier guard either. ← → = ±4 min (≈1° of turn),
      // Shift+← → = ±1 h. Inert unless the Slide tool is armed, so the arrows
      // stay free everywhere else.
      if (
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        if (mapTool === 'slide' && !isTypingField(el)) {
          nudgeSlide((e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : 4 / 60));
          e.preventDefault();
          return;
        }
      }
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      // Space → center the map on the active pin; if none is placed, drop a pin
      // on the natal birthplace and center on that. Skipped when a button/link/
      // field is focused (where Space has its own behavior).
      if (e.key === ' ' || e.code === 'Space') {
        if (isInteractive(el)) return;
        if (pinned) {
          jumpTo(pinned.lat, pinned.lng);
          e.preventDefault();
        } else if (current) {
          const target = {
            lat: current.birthplace.lat,
            lng: current.birthplace.lng,
          };
          setPinned(target);
          setHover(null);
          jumpTo(target.lat, target.lng);
          e.preventDefault();
        }
        return;
      }
      // Map zoom: plain +/− (Ctrl+/− is left to the browser, handled by the
      // modifier guard above). Allowed with Shift, since "+" is Shift+"=".
      if (e.key === '+' || e.key === '=') {
        if (!isTypingField(el)) {
          mapRef.current?.zoomIn();
          e.preventDefault();
        }
        return;
      }
      if (e.key === '-' || e.key === '_') {
        if (!isTypingField(el)) {
          mapRef.current?.zoomOut();
          e.preventDefault();
        }
        return;
      }
      // Backspace → Location ▸ Go back / Go forward, available anywhere (the Location
      // window needn't be open). It swaps between the current view and the one before
      // the last jump; teleportBack reports whether it actually moved, so an unused
      // Backspace falls through to the browser. Skipped while typing so text fields
      // keep their native delete.
      if (e.key === 'Backspace') {
        if (isTypingField(el)) return;
        const target = mapRef.current?.teleportBack();
        if (target) {
          setLocationReturn((d) => (d === 'forward' ? 'back' : 'forward'));
          setTeleportTarget(target);
          // Going back means the arrival is no longer where you are.
          setArrivalMark(null);
          e.preventDefault();
        }
        return;
      }
      if (isTypingField(el)) return;
      // Tab → swap to the previous chart; while the ~1s flash window stays
      // open, each further tap steps DEEPER down the frozen shortlist
      // (wrapping), so quick taps cycle the recent handful and a lone tap
      // bounces between the last two. The switcher menu flashes with an arrow
      // on the row landed on, in whichever host is visible. Claimed only for a
      // bare forward Tab with focus outside any control — Shift+Tab
      // everywhere, and Tab from a focused control, keep native traversal.
      if (e.key === 'Tab') {
        if (e.shiftKey || isInteractive(el)) return;
        let session = chartFlashRef.current;
        if (session) {
          session = { ids: session.ids, index: (session.index + 1) % session.ids.length };
        } else {
          // Same folder-scoped shortlist the switcher shows — Tab flashes that
          // menu, so cycling a different set would contradict what is on screen.
          const ids = recentShortlist(charts, current).map((c) => c.id);
          if (ids.length < 2) return; // one chart (or none): let Tab be Tab
          // Start from the active chart's slot (top, having just been used)
          // and step once — the previous chart.
          session = { ids, index: (ids.indexOf(current?.id ?? '') + 1) % ids.length };
        }
        chartFlashRef.current = session;
        setChartFlash(session);
        selectChart(session.ids[session.index]);
        if (chartFlashTimer.current) window.clearTimeout(chartFlashTimer.current);
        chartFlashTimer.current = window.setTimeout(() => {
          chartFlashRef.current = null;
          setChartFlash(null);
        }, 1200);
        e.preventDefault();
        return;
      }
      // Shift+letter: Settings toggles (map-filter lines, Appearance details, and
      // projection mode). Kept on Shift so the plain letters stay free for the
      // view/tool hotkeys below; each is mirrored by a "Shift X" pill in the sidebar.
      // (Local space moved to the Location view — plain 'L'.)
      if (e.shiftKey) {
        // While a registered surface owns the viewport (viewLock), every one of
        // these stands down: each mirrors a settings row that parks with the
        // lock — map-surface-only details/projection/zones/stamps/parans, plus
        // the aspect/midpoint families a viewport owner drops from its drape.
        const parked = getViewLock() !== null;
        // And on a geodetic map the four that switch a held family — parans, fixed stars,
        // zenith points, night shade — stand down in BOTH directions, as their greyed rows
        // do: a key that flipped the stored choice there would move it unseen, to surface
        // only on Celestial (lib/skyHold, 2026-10-02).
        const held = skyHeldRef.current;
        switch (e.key.toLowerCase()) {
          // Advanced ▸ Lines toggles — gated on Advanced mode (no-op while off,
          // like the section that hosts them). Each is its family's own first letter,
          // in the section's own order; that rule is what N cost Night Shade below.
          case 'n': if (advancedWheel && !parked) setShowNatalLines((v) => !v); break;
          // …and, as its greyed row, while Cyclocartography stands in for the chart.
          case 'p': if (advancedWheel && !parked && !held && !paransOverlayBlocked) setShowParans((v) => !v); break;
          case 'a': if (advancedWheel && !parked) setShowAspectLines((v) => !v); break;
          case 'm': if (advancedWheel && !parked) setShowMidpointLines((v) => !v); break;
          case 's': if (advancedWheel && !parked && !held) setShowStarLines((v) => !v); break;
          // Appearance ▸ Details toggles (always available).
          case 'r':
            if (parked) break;
            // Roads + rivers move together (one Details switch), so stay in sync.
            setShowRoads((v) => !v);
            setShowRivers((v) => !v);
            break;
          case 'l': if (!parked) setShowLabels((v) => !v); break;
          // Advanced ▸ Display toggles — gated on Advanced mode.
          case 'o': if (advancedWheel && !parked) setShowOrbZones((v) => !v); break;
          case 'z': if (advancedWheel && !parked && !held) setShowZenith((v) => !v); break;
          // Night Shade lives in Appearance now, so it stays always available
          // (outside a viewport lock, whose owner shades day/night itself). It held
          // Shift+N until 2026-08-19 and moved to D — for day/night — so the Lines
          // section above could keep its one-letter-per-family rule once Natal Lines
          // arrived. Both pills in the Sidebar say so, and the Help table is hand-kept.
          case 'd': if (!parked && !held) setShowNightShade((v) => !v); break;
          // Appearance ▸ Projection (absolute mode, not a toggle).
          // One key cycles the projection (flat ↔ globe), like 'o' cycles overlays.
          case 'f': if (!parked) setProjection((p) => (p === '2d' ? '3d' : '2d')); break;
          default: return;
        }
        e.preventDefault();
        return;
      }
      // While a time overlay's bar is up (Advanced mode shows its display drawer),
      // a drawer-surface extension claims its registered hotkey FIRST (V =
      // Activations), advertised in its toggle's hover tip. Otherwise every letter
      // keeps its base action in all modes — N turns the overlay off, A adds a
      // chart. The drawer's own Natal Chart eye stays click-only: it PROMOTES the
      // overlay rather than hiding anything, and the letter that would name it is
      // spoken for twice over (plain N, and Shift+N for Advanced ▸ Lines).
      if (advancedWheel && TIME_OVERLAY_MODES.has(overlayMode)) {
        const drawerExt = getMapExtensions().find(
          (x) =>
            x.surface === 'timeline-drawer' &&
            x.hotkey?.toLowerCase() === e.key.toLowerCase() &&
            isEntitled(x) &&
            // An unavailable extension releases its letter entirely — the key falls
            // through to whatever base action the switch below gives it.
            isAvailable(x),
        );
        if (drawerExt) {
          toggleExtension(drawerExt.id);
          e.preventDefault();
          return;
        }
      }
      switch (e.key.toLowerCase()) {
        // View-menu windows, on the digit row and on mnemonic letters (their menu
        // badges mirror these exactly). They stand down while a registered surface
        // owns the viewport (viewLock) — Settings ('3') stays, so users can keep
        // tuning what the owning surface shows.
        case '1': if (!getViewLock()) setShowCoords((v) => !v); break;
        case '2': if (!getViewLock()) setShowChart((v) => !v); break;
        case '3': setShowSettings((v) => !v); break;
        // The Minor bodies window — the digit row's next window, beside Settings, where
        // its More button lives. Catalog bodies are an Advanced reading (like 's').
        case '4': if (advancedWheel && !getViewLock()) setShowMinorHud((v) => !v); break;
        case 't': if (!getViewLock()) setShowTeleport((v) => !v); break;
        // Sky Times and Local Space are 'adv'-tier views (matching their View-menu rows),
        // and both read the sky's turning: through their Safe openers, so on a geodetic
        // map the key closes an open one and opens nothing (the hold check lives there).
        case 's': if (advancedWheel && !getViewLock()) setShowSkyTimesSafe(!showSkyTimes); break;
        case 'l': if (advancedWheel && !getViewLock()) setShowLocalSpaceSafe(!showLocalSpace); break;
        case 'o': {
          // Cycling into a core mode supersedes any active extension overlay.
          setActiveOverlayExt(null);
          // Overlays a viewport owner can't carry are skipped while one holds
          // the lock (their Overlay-menu rows hide too).
          const cycle = getViewLock()
            ? overlayCycle.filter((m) => !VIEW_LOCK_PARKED_OVERLAYS.has(m))
            : overlayCycle;
          // Steps from the VISIBLE mode, not the stored one: with a technique masked
          // (blocked chart / Advanced off) the bar reads None, so 'o' has to continue
          // from None — resuming from a mode the user can't currently see would skip
          // an entry for no reason they could observe.
          setReturnBorrow(null);
          setOverlayModePref(cycle[(cycle.indexOf(overlayMode) + 1) % cycle.length]);
          break;
        }
        // 'o' / 'n' are the hotkey twins of the Overlay menu rows, so they end a returns
        // borrow exactly as selectOverlay does (they predate it and set the pref direct).
        case 'n': setActiveOverlayExt(null); setReturnBorrow(null); setOverlayModePref('off'); break;
        case 'm': setMapTool((tl) => (tl === 'measure' ? 'off' : 'measure')); break;
        // Slide spins the globe under the fixed lines; toggleSlide arms it through armSlide,
        // which refuses on a geodetic map (and disarming always works).
        case 'e': if (advancedWheel) toggleSlide(); break;
        // Capture — ungated, so no advanced-mode gate (unlike Slide).
        case 'c': setMapTool((tl) => (tl === 'capture' ? 'off' : 'capture')); break;
        case 'a': setCreating(true); break;
        case 'b': if (current) setWheelExpanded((v) => !v); break;
        // Discreet mode: blank every name, date and place on screen. Deliberately
        // NOT parked under a view lock — a surface owning the viewport still
        // shows chart names, and this is wanted most in the second where someone
        // walks up, which is no time to be hunting for a button.
        case 'p': toggleDiscreet(); break;
        default: {
          // A registered map-HUD extension may claim a plain-letter hotkey (its
          // `hotkey` field, also shown beside it in the View menu — drawer-surface
          // extensions are handled above instead, only while their bar is up).
          // Toggle it — but only when the user is entitled, so a gated extension
          // the user can't reach stays a no-op (its HUD wouldn't render anyway).
          // Parked with the rest of the View menu while a surface owns the
          // viewport — except a modal-layer extension, which stacks above the
          // owning surface (like the chart browser does) and so keeps its key.
          const ext = getMapExtensions().find(
            (x) =>
              (x.surface ?? 'view') === 'view' &&
              (x.hotkey?.toLowerCase() === e.key.toLowerCase() ||
                x.hotkeyAlias?.toLowerCase() === e.key.toLowerCase()) &&
              isEntitled(x) &&
              isAvailable(x) && // unavailable → the letter is released, as in the drawer branch
              (!getViewLock() || x.layer === 'modal'),
          );
          if (ext) {
            toggleExtension(ext.id);
            break;
          }
          // Likewise a registered TOOL extension (Tools menu) may claim a hotkey — toggle it,
          // gated by the shared addon resolver. (Tools are mutually exclusive; toggleTool disarms
          // the others.)
          const tool = getToolExtensions().find(
            (x) => x.hotkey?.toLowerCase() === e.key.toLowerCase() && isAddonEntitled(x),
          );
          if (!tool) return;
          toggleTool(tool.id);
        }
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // toggleExtension / toggleTool / nudgeSlide / selectChart are stable useCallbacks declared
    // later in this component; the keydown closure reads them lazily (post-commit), so they're
    // intentionally left out of the deps — listing them here would touch their temporal dead
    // zone during render.
  }, [
    current,
    charts,
    pinned,
    toggleSlide,
    advancedWheel,
    lineSystem,
    mapTool,
    overlayMode,
    paransOverlayBlocked,
    showLocalSpace,
    showSkyTimes,
    setShowLocalSpaceSafe,
    setShowSkyTimesSafe,
  ]);

  // Optional opt-in seam for the eclipse-time map LINES (off by default). A fork can
  // dispatch `window.dispatchEvent(new CustomEvent('astro:cheat', { detail: { id:
  // 'eclipse-map-lines' } }))` — e.g. from a dev console — to reveal them. Reveal only;
  // to hide, a plain click on the Eclipse-Chart toggle (which clears the lines).
  useEffect(() => {
    const onCheat = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (id === 'eclipse-map-lines') {
        setShowEclipseChart(true);
        setShowEclipseMapLines(true);
      }
    };
    window.addEventListener('astro:cheat', onCheat);
    return () => window.removeEventListener('astro:cheat', onCheat);
  }, []);

  // Neutral seam: open My Charts — the same window the chart switcher's "Search + Add" and
  // the A key open. A downstream build's onboarding dispatches
  // `window.dispatchEvent(new Event('astro:open-my-charts'))` to take a new reader straight
  // to where a birth chart goes in, rather than through the quick-switch menu first.
  useEffect(() => {
    const onOpenMyCharts = () => setCreating(true);
    window.addEventListener('astro:open-my-charts', onOpenMyCharts);
    return () => window.removeEventListener('astro:open-my-charts', onOpenMyCharts);
  }, []);

  // Every setter below that can move the line system ON SCREEN calls this with what it is
  // about to become, before it changes anything: skyHeldRef learns now, for a gate later in
  // the same gesture (Help's setAdvancedMode → openView), and Slide — which can't spin a map
  // that doesn't turn — disarms in this same commit, so the geodetic lines are never drawn
  // spun for a render before its guard effect lets go (Map syncs its data ref in a layout
  // effect for exactly this; the guard stays as the backstop). Slide is a transient tool,
  // so nothing is written. (2026-10-02)
  const enterLineSystem = useCallback((next: LineSystem) => {
    skyHeldRef.current = skyHeldFor(next);
    if (skyHeldRef.current) setMapTool((tl) => (tl === 'slide' ? 'off' : tl));
  }, []);

  // Turning Advanced OFF deactivates any advanced-only feature that's active (Slide tool,
  // Local Space view, Synastry/Eclipses overlays) so nothing advanced-only lingers without
  // a menu control to turn it back off. Used in place of the raw setAdvancedWheel at every
  // Advanced toggle (the profile plan tag + the wheel-sidebar ADV label). Load-time stale
  // state is handled in the showLocalSpace / showSkyTimes / overlayMode initializers
  // instead (an effect that setState's on mount would cascade renders — see
  // react-hooks/set-state-in-effect).
  //
  // The two view-window writes below LOOK like the preference-destroying pattern the
  // overlay technique was just rescued from (they clear a persisted flag that doesn't
  // come back when Advanced returns), and they are deliberately left alone:
  //
  //   · Neither window is advanced-gated at RENDER, so the write is load-bearing — a
  //     derived value would need render gates added to both before it could replace it.
  //   · A closed window announces its own absence. You can see it isn't there and
  //     reopen it from the View menu in one click. That is the whole difference from a
  //     masked reading, which silently changes what the map COMPUTES while looking
  //     exactly the same — which is why those got derived and these did not.
  //   · This whole path is effectively open-core-only. A build that ties Advanced to an
  //     account tier writes 'astro:advanced:v1' directly and reloads, never calling this,
  //     so it already gets the derive-shaped behaviour by never taking this branch.
  //
  // If either window ever gains a render gate on advancedWheel, revisit: at that point
  // the write becomes redundant and rule 2 (CLAUDE.md) applies cleanly.
  //
  // Advanced also decides whether a stored sidereal zodiac takes effect, so it can move
  // the geodetic choice in both directions: OFF can hand a held Geodetic back, ON can hold
  // it (and says so, as the zodiac control does). Either way nothing else moves for it —
  // what reads the sky's turning is simply held while the map is geodetic (skyHeld) — beyond
  // what enterLineSystem does for any route there.
  const setAdvancedMode = useCallback(
    (on: boolean) => {
      const next = effectiveLineSystem(lineSystemPref, zodiacMode, on);
      enterLineSystem(next);
      if (!on) {
        setMapTool((tl) => (tl === 'slide' ? 'off' : tl));
        setShowLocalSpace(false);
        setShowSkyTimes(false);
        // An advanced-tier OVERLAY is not cleared here: the derived overlayMode masks it
        // while Advanced is off, so turning Advanced back on hands the technique straight
        // back — the same courtesy the house system, zodiac and orb settings already get.
      }
      announceFlip('line-system-held', lineSystem === 'geodetic' && next !== 'geodetic');
      advancedRef.current = on;
      setAdvancedWheel(on);
    },
    [lineSystem, lineSystemPref, zodiacMode, announceFlip, enterLineSystem],
  );

  // The Line system control's own setter. Choosing Geodetic closes nothing and switches
  // nothing else: what reads the sky's turning — local space, Slide, the Sky Times band,
  // a tool that declares `needsSiderealTime`, and the rest skyHeld lists — is HELD while the
  // map is geodetic, each greyed or replaced in place by the reason, and resumes on
  // Celestial as it was left. (From 17 September to 2 October 2026 choosing Geodetic closed
  // them and opening one switched back to Celestial; that switch is retired.)
  const setLineSystemSafe = useCallback(
    (next: LineSystem) => {
      // Geodetic maps the TROPICAL zodiac onto Earth's longitudes by definition — there
      // is no sidereal variant — so it is unavailable in sidereal mode. And it is
      // unavailable outright while the mapping is HELD, which is why the Sidebar's
      // Geodetic half is dimmed: this refusal is what makes that dimming true rather
      // than decorative.
      if (next === 'geodetic' && (GEODETIC_HELD || effZodiacMode !== 'tropical')) return;
      enterLineSystem(effectiveLineSystem(next, zodiacMode, advancedWheel));
      setLineSystemPref(next);
    },
    [effZodiacMode, zodiacMode, advancedWheel, enterLineSystem],
  );
  // Switching INTO sidereal doesn't rewrite the line system any more — it MASKS a
  // geodetic choice (see the derived lineSystem). Nothing is lost, but the Sidebar's
  // selection changes under the user, so the switch still owes them a word.
  //
  // And switching back OUT hands that choice back, with nothing to close for it: the sky
  // features are held on a geodetic map wherever it comes from (skyHeld).
  const setZodiacModeSafe = useCallback(
    (m: ZodiacMode) => {
      const next = effectiveLineSystem(lineSystemPref, m, advancedWheel);
      // 'line-system-held' says this path masks the geodetic choice rather than rewriting
      // it — a different fact about the reader's setting from a rewrite, so it has its own
      // message and its own dismissal (lib/autoFlipNotice).
      //
      // Judged on the line system ON SCREEN before and after, which is the only honest
      // test of "did the map change". Geodetic on screen now means a stored Geodetic choice
      // and no hold; not on screen after means this zodiac is what masks it. Reading the
      // stored choice alone also fired from one sidereal zodiac to another, and while
      // Advanced was off — both times with Geodetic already held, so a warning about a
      // no-op, which teaches people to dismiss warnings unread.
      announceFlip('line-system-held', lineSystem === 'geodetic' && next !== 'geodetic');
      enterLineSystem(next);
      setZodiacMode(m);
    },
    [lineSystem, lineSystemPref, advancedWheel, announceFlip, enterLineSystem],
  );
  // Opening the Calculation panel is the one moment the In Mundo default can be
  // explained to someone who hasn't yet been confused by it. Gated on the projection
  // actually being ON SCREEN and still at its default: a reader who has already moved
  // it knows the control exists, and under the geodetic mapping the control has no say
  // (everything is on the ecliptic there by construction). Fires once
  // — see the `once` flag in lib/autoFlipNotice.
  const openSidebarSection = useCallback(
    (section: SidebarSection | null) => {
      announceFlip(
        'line-projection',
        section === 'calc' && lineSystem === 'celestial' && coordSystem === 'mundo',
      );
      setSidebarSection(section);
    },
    [lineSystem, coordSystem, announceFlip],
  );
  // Open the settings sidebar, optionally at a section — the Info chip's jump, promoted to a
  // context action (openSettings) so any extension can deep-link a setting it documents or
  // depends on. Sits beside openSidebarSection because it goes THROUGH it: a deep link into
  // Calculation is someone's first arrival at that panel just as often as a click on the
  // accordion is, and it owes them the same notice.
  const openSettingsSection = useCallback(
    (section?: string) => {
      setShowSettings(true);
      if (section) openSidebarSection(section as SidebarSection);
    },
    // openSidebarSection is not stable — it closes over the projection settings its
    // notice tests. A frozen copy here would judge that against whatever they were
    // when this component first mounted.
    [openSidebarSection],
  );
  // (Switching INTO sidereal while Geodetic is active no longer WRITES the celestial
  // frame. Sidereal is a standing condition, not an event: the derived `lineSystem`
  // masks the geodetic choice for as long as it lasts and hands it straight back
  // afterwards, so a trip through sidereal can't cost the user a setting.)

  useEffect(() => {
    localStorage.setItem('astro:coord-system:v1', coordSystem);
  }, [coordSystem]);
  useEffect(() => {
    localStorage.setItem('astro:fortune-formula:v1', fortuneFormula);
  }, [fortuneFormula]);
  useEffect(() => {
    localStorage.setItem('astro:house-system:v1', houseSystem);
  }, [houseSystem]);
  useEffect(() => {
    localStorage.setItem('astro:node-type:v1', nodeType);
  }, [nodeType]);
  useEffect(() => {
    localStorage.setItem('astro:rulership:v1', rulershipScheme);
  }, [rulershipScheme]);
  // The PREFERENCE, never the derived value. Persisting the derived one would write
  // 'celestial' the moment a sidereal zodiac masks a geodetic choice — quietly
  // destroying it, and only visibly so in the NEXT session.
  useEffect(() => {
    localStorage.setItem('astro:line-system:v1', lineSystemPref);
  }, [lineSystemPref]);
  useEffect(() => {
    localStorage.setItem('astro:show-aspect-lines:v1', showAspectLines ? '1' : '0');
  }, [showAspectLines]);
  useEffect(() => {
    localStorage.setItem('astro:show-midpoint-lines:v1', showMidpointLines ? '1' : '0');
  }, [showMidpointLines]);
  useEffect(() => {
    localStorage.setItem('astro:aspectlines-open:v1', showAspectLinesHud ? '1' : '0');
  }, [showAspectLinesHud]);
  // The window's OWN open state — the raw flag, never the render-gated visibility.
  useEffect(() => {
    localStorage.setItem('astro:minor-bodies-open:v1', showMinorHud ? '1' : '0');
  }, [showMinorHud]);
  useEffect(() => saveAspectLineFilters(aspectLineFilters), [aspectLineFilters]);
  useEffect(() => {
    localStorage.setItem('astro:show-roads:v1', showRoads ? '1' : '0');
  }, [showRoads]);
  useEffect(() => {
    localStorage.setItem('astro:show-rivers:v1', showRivers ? '1' : '0');
  }, [showRivers]);
  useEffect(() => {
    localStorage.setItem('astro:show-labels:v1', showLabels ? '1' : '0');
  }, [showLabels]);
  useEffect(() => {
    localStorage.setItem('astro:view-chart:v1', showChart ? '1' : '0');
  }, [showChart]);
  useEffect(() => {
    localStorage.setItem('astro:view-coords:v1', showCoords ? '1' : '0');
  }, [showCoords]);
  useEffect(() => {
    // Touch always starts closed (above), so don't let it overwrite the desktop preference.
    if (isTouchLayout()) return;
    localStorage.setItem('astro:view-settings:v1', showSettings ? '1' : '0');
  }, [showSettings]);
  useEffect(() => {
    localStorage.setItem('astro:view-info:v1', showInfo ? '1' : '0');
  }, [showInfo]);
  useEffect(() => {
    localStorage.setItem('astro:view-teleport:v1', showTeleport ? '1' : '0');
  }, [showTeleport]);
  useEffect(() => {
    localStorage.setItem('astro:view-skytimes:v1', showSkyTimes ? '1' : '0');
  }, [showSkyTimes]);
  // The Sky Band occupies REAL layout space along the bottom (hidden while the
  // Capture tool owns the map-frame insets). Phones get the stacked layout —
  // two 28px rows plus the track while it shows — and the band pads itself by
  // the home-indicator inset, so the height computed here (and published as
  // --sky-band-h) is the band's TOTAL on phones, inset included; the shifted
  // furniture max()es the var against env() rather than adding. The map gets
  // the height as a PROP (inline style + resize land on one commit); the rest
  // of the bottom furniture shifts via the bottom-dock var, published here in
  // a LAYOUT effect so it moves in the same paint.
  const phoneLayout = usePhone();
  const safeBottom = useSafeAreaBottom();
  const skyBandVisible = showSkyTimes && mapTool !== 'capture' && !viewParked;
  // The band's expandable TRACK (a downstream build's registered center — see
  // lib/extensions/skyBandTrack.ts; the open core registers none, so its band
  // is always the compact row). The expanded/compact switch is owned here (not
  // in the band) because the reserved height — the map's bottomInset and the
  // furniture var — must track it. Entitlement-gated with no teaser.
  const [skyBandTrackOn, setSkyBandTrackOn] = useState(
    () => localStorage.getItem('astro:skyband-track:v1') !== '0',
  );
  useEffect(() => {
    localStorage.setItem('astro:skyband-track:v1', skyBandTrackOn ? '1' : '0');
  }, [skyBandTrackOn]);
  const skyBandTrackExt = getSkyBandTrack();
  const skyBandTrackAvailable = !!skyBandTrackExt && isSkyBandTrackEntitled(skyBandTrackExt);
  // Neither the track nor the table shows on a geodetic map: the band itself is held there
  // (SkyBandHeld draws in its place), and both switches keep the reader's choice for
  // Celestial. (2026-10-02)
  const skyBandTrackShown = skyBandTrackAvailable && skyBandTrackOn && !skyHeld;
  // Table layout for the band's legend (the inline times list is the default),
  // owned here like the track toggle: the table takes real height, so the
  // reserved height below must follow it. Persisted under the legacy density
  // key — a stored '2' meant "table"; anything else falls back to the list.
  const [skyBandTable, setSkyBandTable] = useState(
    () => localStorage.getItem('astro:sky-times-verbose:v1') === '2',
  );
  useEffect(() => {
    localStorage.setItem('astro:sky-times-verbose:v1', skyBandTable ? '2' : '1');
  }, [skyBandTable]);
  // The table layout only takes effect while no track shows (the expanded
  // track supersedes the legend layouts; the band suppresses them too).
  const skyBandTableOn = skyBandTable && !skyBandTrackShown && !skyHeld;
  // The held band reserves the table's height on a desktop, so the reason and its fix have
  // two lines to sit on rather than one cramped row; a phone keeps its stacked height,
  // which already has two. (2026-10-02)
  const skyBandH = phoneLayout
    ? SKY_BAND_H_PHONE +
      (skyBandTrackShown && skyBandTrackExt ? skyBandTrackExt.height : 0) +
      // Table mode: the 28px legend row grows to the table's height.
      (skyBandTableOn ? SKY_BAND_H_TABLE - SKY_BAND_H_COMPACT : 0) +
      safeBottom +
      SKY_BAND_PHONE_CUSHION
    : skyBandTrackShown && skyBandTrackExt
      ? skyBandTrackExt.height
      : skyBandTableOn || skyHeld
        ? SKY_BAND_H_TABLE
        : SKY_BAND_H_COMPACT;
  useLayoutEffect(() => {
    publishBottomDock('sky-band', skyBandVisible ? skyBandH : 0);
    return () => retireBottomDock('sky-band');
  }, [skyBandVisible, skyBandH]);
  // Follow-the-cursor (desktop only — no cursor on phones): while on, the band
  // reads live under the map cursor instead of the pin/birthplace; a plain map
  // click parks it on that spot (click again to resume). The cursor point is
  // throttled — the band re-solves a full day of rise/set events per point, so
  // per-frame pushes would burn the main thread on readouts nobody can read
  // that fast. Leaving the map HOLDS the last point (no snap-back flicker).
  const [skyFollowOn, setSkyFollowOn] = useState(
    () => localStorage.getItem('astro:skyband-follow:v1') === '1',
  );
  useEffect(() => {
    localStorage.setItem('astro:skyband-follow:v1', skyFollowOn ? '1' : '0');
  }, [skyFollowOn]);
  const [skyHover, setSkyHover] = useState<Point | null>(null);
  // The spot the band is parked on. Named `skyParked`, not `skyHeld`, since 2026-10-02: a
  // geodetic map's hold (lib/skyHold, skyHeldFor) is a boolean read in boolean gates, and a
  // Point under the same name type-checks in every one of them while meaning "parked".
  const [skyParked, setSkyParked] = useState<Point | null>(null);
  // Active on desktop AND touch now — "Time Stamp". Touch has no cursor, so it works as
  // tap-to-place (the held half); the live cursor-follow below stays desktop-only.
  // Off while the band is held on a geodetic map: the stamp marks where the band reads,
  // and a held band reads nowhere. The switch keeps its stored state. (2026-10-02)
  const skyFollowActive = skyBandVisible && skyFollowOn && !skyHeld;
  // Read by the (stable) onHover callback: push cursor points only while following, not
  // parked on a held spot, and only on desktop (touch has no hover to follow).
  const skyFollowLiveRef = useRef(false);
  useEffect(() => {
    skyFollowLiveRef.current = skyFollowActive && !skyParked && !phoneLayout;
  }, [skyFollowActive, skyParked, phoneLayout]);
  const skyHoverTimerRef = useRef<number | null>(null);
  const skyHoverPendingRef = useRef<Point | null>(null);
  useEffect(() => {
    if (skyFollowActive) return;
    if (skyHoverTimerRef.current !== null) {
      clearTimeout(skyHoverTimerRef.current);
      skyHoverTimerRef.current = null;
    }
    skyHoverPendingRef.current = null;
    setSkyHover(null);
    setSkyParked(null);
  }, [skyFollowActive]);
  // The park/resume click, off the neutral map-click broadcast. A map tool owns
  // clicks while active (the same document signal overlays use to yield), so a
  // measure/scan click never parks the band.
  useEffect(() => {
    if (!skyFollowActive) return;
    const onClick = (e: Event) => {
      if (document.documentElement.hasAttribute('data-map-tool-active')) return;
      const { lat, lng } = (e as CustomEvent<MapClickDetail>).detail;
      // Desktop toggles park/resume off each click. Touch has no live-follow to resume to,
      // so a tap always PLACES (and re-taps MOVE) the stamp; turn the toggle off to clear.
      setSkyParked((h) => (phoneLayout ? { lat, lng } : h ? null : { lat, lng }));
    };
    window.addEventListener(MAP_CLICK_EVENT, onClick);
    return () => window.removeEventListener(MAP_CLICK_EVENT, onClick);
  }, [skyFollowActive, phoneLayout]);
  const skyFollowPoint = skyFollowActive ? (skyParked ?? skyHover) : null;
  // The follow-beacon mode shared by the SkyBand's toggle label and the map stamp:
  // 'live' rides the cursor, 'held' is parked on the clicked spot, 'off' hides it.
  const skyFollowMode: 'off' | 'live' | 'held' = !skyFollowActive
    ? 'off'
    : skyParked
      ? 'held'
      : 'live';
  // The map beacon's mode. Same as skyFollowMode on desktop; on touch there's no cursor
  // to ride, so the beacon only appears once a spot is tapped (held), never in live-follow.
  const skyBeaconMode: 'off' | 'live' | 'held' = !skyFollowActive
    ? 'off'
    : phoneLayout
      ? skyParked
        ? 'held'
        : 'off'
      : skyFollowMode;
  // The widest RESERVED left dock (lib/leftDock) — a panel claiming its own column
  // rather than overlaying. Read into state (not the --es-width var) so the map's
  // inset arrives as a prop on the same commit as its resize (see lib/leftDock).
  const reservedLeftInset = useSyncExternalStore(subscribeReservedLeftInset, getReservedLeftInset);

  // Keep the top-left stack (profile strip + coordinates readout) clear of the
  // top bars: a docked left panel shifts the stack right (--es-width) while the
  // nav re-centres on the remaining map — on narrower remainders the two meet,
  // and the nav (z 25) would cover the stack (z 20). When their footprints
  // overlap HORIZONTALLY, drop the stack below the nav stack's bottom edge —
  // which includes the tool-readout bar (it lives inside .topnav-stack, so one
  // rect covers both). Written as a CSS var the stylesheet max()es into `top`,
  // so the coarse-pointer bottom-corner rules (top:auto) stay untouched.
  const topLeftStackRef = useRef<HTMLDivElement | null>(null);
  // Where the stack last came to rest, as announced to the map (watchSettled below).
  const topLeftSettledRef = useRef('');
  useEffect(() => {
    const stack = topLeftStackRef.current;
    if (!stack) return;
    const nav = document.querySelector<HTMLElement>('.topnav-stack');
    // The map dodges its edge labels off the profile strip and the coordinates readout
    // (HUD_SELECTORS), cached until `astro:hud-moved` — and the drop below works through
    // `--topnav-clear` and a 0.32 s `top` transition, which nobody announced: opening a dock
    // left labels under the strip until the next pan (video-QA #29). So say so once the stack
    // has come to rest somewhere new, after the transition and once per place (lib/hudSettled);
    // a box it grew or shrank to (the readout toggling) counts the same way.
    const settled = watchSettled([stack], ['top'], topLeftSettledRef);
    let raf = 0;
    const measure = () => {
      raf = 0;
      const navRect = nav?.getBoundingClientRect();
      const stackRect = stack.getBoundingClientRect();
      // Horizontal-interval test only — the clearance moves the stack DOWN,
      // which must not feed back into its own trigger.
      const overlaps =
        !!navRect &&
        navRect.width > 0 &&
        stackRect.width > 0 &&
        stackRect.right + 12 > navRect.left &&
        stackRect.left < navRect.right;
      const next = overlaps && navRect ? `${Math.round(navRect.bottom + 12)}px` : '';
      if (stack.style.getPropertyValue('--topnav-clear') !== next) {
        if (next) stack.style.setProperty('--topnav-clear', next);
        else stack.style.removeProperty('--topnav-clear');
      }
      settled.check();
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    // Triggers: either box resizing (readout bar appearing, coords toggling,
    // menu labels), the window, and the nav's left-recentre transition settling
    // (a dock change moves it over 0.32s — the rect is only final at the end).
    const ro = new ResizeObserver(schedule);
    ro.observe(stack);
    if (nav) ro.observe(nav);
    const onNavSettled = (e: TransitionEvent) => {
      if (e.propertyName === 'left') schedule();
    };
    nav?.addEventListener('transitionend', onNavSettled);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      ro.disconnect();
      nav?.removeEventListener('transitionend', onNavSettled);
      window.removeEventListener('resize', schedule);
      if (raf) cancelAnimationFrame(raf);
      settled.dispose();
    };
    // reservedLeftInset: a dock opening/closing/resizing moves both boxes.
    // wheelExpanded: the stack unmounts/remounts around the expanded sidebar.
  }, [reservedLeftInset, wheelExpanded]);

  useEffect(() => {
    localStorage.setItem('astro:view-local-space:v1', showLocalSpace ? '1' : '0');
  }, [showLocalSpace]);
  useEffect(() => {
    localStorage.setItem('astro:sidebar-section:v1', sidebarSection ?? 'none');
  }, [sidebarSection]);
  useEffect(() => {
    localStorage.setItem('astro:show-timeline:v1', overlayExpanded ? '1' : '0');
  }, [overlayExpanded]);
  useEffect(() => {
    localStorage.setItem('astro:show-zenith:v1', showZenith ? '1' : '0');
  }, [showZenith]);
  useEffect(() => {
    localStorage.setItem('astro:show-natal:v1', showNatal ? '1' : '0');
  }, [showNatal]);

  // The PREFERENCE, never the derived value — persisting the mask is what made a
  // glance at a composite chart cost the user their technique for good.
  useEffect(() => saveOverlayMode(overlayModePref), [overlayModePref]);
  useEffect(() => saveOverlayDate(targetDate), [targetDate]);
  useEffect(() => saveOverlayPartner(partnerId), [partnerId]);
  useEffect(() => saveOverlayStep(stepUnit), [stepUnit]);
  // The three CONTROLS, never the joined `angleProgression` above — persisting the join
  // would collapse "hold the natal angles" and the calculation the reader picked before
  // they held them into one value again, and lose whichever wasn't showing.
  useEffect(() => saveArcMethod(arcMethod), [arcMethod]);
  useEffect(() => saveProgAngleFrame(progAngleFrame), [progAngleFrame]);
  useEffect(() => saveProgAngleMethod(progAngleMethod), [progAngleMethod]);
  useEffect(() => savePrimaryRate(primaryRate), [primaryRate]);
  useEffect(() => saveUserPrimaryRate(userPrimaryRate), [userPrimaryRate]);
  // The PREFERENCE again, never effTransitFrame: a returns borrow (or an unknown birth
  // time) masks that value, and persisting the mask would write the borrowed frame into
  // storage and destroy the choice it is only holding — visible not now but in the NEXT
  // session, which is exactly how it went unnoticed before.
  useEffect(() => saveTransitFrame(transitFrame), [transitFrame]);
  useEffect(() => saveSynastryMethod(synastryMethod), [synastryMethod]);
  useEffect(() => saveEclipseId(eclipseId), [eclipseId]);
  useEffect(() => saveEclipseIsoStep(eclipseIsoStep), [eclipseIsoStep]);
  useEffect(() => saveEclipseChart(showEclipseChart), [showEclipseChart]);
  useEffect(
    () => saveEclipseMapLines(showEclipseMapLines),
    [showEclipseMapLines],
  );
  useEffect(
    () => saveEclipseOtherLines(showEclipseOtherLines),
    [showEclipseOtherLines],
  );

  // Animation: advance the target date one minor notch per tick while playing.
  // setData is cheap; the per-tick cost is one getPlanetPositions(). ~8 fps keeps
  // the sweep smooth without thrashing recompute.
  useEffect(() => {
    if (!playing) return;
    const tick = minorStepMs(stepUnit);
    const id = window.setInterval(() => setTargetDate((d) => d + tick), 120);
    return () => window.clearInterval(id);
  }, [playing, stepUnit]);

  // Pause if the overlay leaves a time mode (synastry/off have no scrubber).
  const isTimeMode = TIME_OVERLAY_MODES.has(overlayMode);
  // Adjusted during render (not in an effect) so we never paint a frame that's
  // still "playing" after the overlay has left a time mode.
  if (!isTimeMode && playing) setPlaying(false);

  useEffect(() => {
    // `charts` — the STORED array — never the derived `current`, which may be
    // carrying a birth time somebody is only trying on. Persisting that would
    // write the guess into the record and destroy the "unknown" the whole
    // degrade hangs off, and it would only show up in the NEXT session.
    saveCharts(charts);
    // A folder is remembered as "declared" only while it holds nothing. Once a
    // chart lands in it the path itself is the evidence, so the declaration is
    // dropped — otherwise the list would grow a stale entry for every folder
    // ever made, and a folder deleted on another device would come back.
    pruneDeclaredFolders(charts);
  }, [charts]);
  // Let an editor outside this tree write a field back onto a chart (the
  // patchChart channel). Merging through setCharts keeps the normal persist +
  // sync path; an unknown id falls through untouched. Declared BEFORE the
  // publish effect below so the handler is installed by the time the first
  // chart is announced — a listener that reacts to that announcement by writing
  // back would otherwise find no handler and be silently dropped.
  useEffect(() => {
    registerChartPatch((id, patch) => {
      setCharts((prev) =>
        prev.some((c) => c.id === id)
          ? prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
          : prev,
      );
    });
    return () => registerChartPatch(null);
  }, []);

  useEffect(() => {
    saveCurrentId(current?.id ?? null);
    // Mirror the resolved active chart where plain modules can read and follow
    // it (lib/chartLibrary) — per-chart stores key their data on it.
    publishCurrentChart(current);
  }, [current]);

  // The asteroid ephemeris file loads on demand (see ensureAsteroidEphemeris):
  // until it's in, Chiron/Ceres/Pallas/Juno/Vesta drop out of every sampling
  // call. This counter bumps once it lands, and sits in the position memos'
  // deps so the same chart instant resamples with the asteroid data present.
  const [ephemerisEpoch, setEphemerisEpoch] = useState(0);
  // Once loaded the data never goes away, so bump exactly once (the ref) — later
  // planet toggles must not re-trigger a resample that would find nothing new.
  const asteroidsLoadedRef = useRef(false);
  useEffect(() => {
    if (asteroidsLoadedRef.current) return;
    // The expanded sidebar's table lists every body unconditionally, so opening
    // it needs the data even when no asteroid is toggled visible on the map.
    if (!wheelExpanded && !needsAsteroidEphemeris(visiblePlanets)) return;
    let stale = false;
    ensureAsteroidEphemeris().then(
      () => {
        if (stale) return;
        asteroidsLoadedRef.current = true;
        setEphemerisEpoch((e) => e + 1);
      },
      (err: unknown) => {
        // Fetch failed (offline?) — asteroids stay absent, same as out-of-range
        // dates. ensureAsteroidEphemeris resets itself, so any later run of
        // this effect (a planet toggle, the wheel opening) retries; warn so the
        // silent absence is at least explained in the console.
        console.warn('[ephemeris] failed to load the asteroid data file', err);
      },
    );
    return () => {
      stale = true;
    };
  }, [visiblePlanets, wheelExpanded]);

  // For a composite the MAP frame is derived LIVE from the parents (the
  // MC-midpoint solve — see lib/astro/composite.ts), not read back from the
  // stored civil minute, so every composite (old or new — no data migration)
  // renders with the current method. Any other chart just uses its own moment.
  // (The wheel ANGLES are independent midpoints — see the birthAngles memo /
  // compositeAngles below.)
  const jd = useMemo(
    () =>
      current
        ? current.composite
          ? solveCompositeFrameJd(current.composite)
          : birthDataToJD(current)
        : 0,
    [current],
  );
  // A composite chart's positions are the parents' coordinate-wise midpoints
  // (lon/lat/RA/dec each averaged per body), not a cast of the stored moment
  // (which only anchors the sidereal frame — see lib/astro/composite.ts).
  // Everything downstream of these two memos follows automatically: lines,
  // parans, local space, zenith, aspect/midpoint lines, the wheel, eclipse
  // natal contacts, the advanced tables.
  const positions = useMemo(
    () => {
      if (!current) return [];
      return current.composite
        ? compositeEquatorial(current.composite, nodeType)
        : getPlanetPositions(jd, nodeType);
    },
    // ephemerisEpoch isn't read by the calc — it marks the deferred asteroid
    // file arriving, so the same jd resamples with the new data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, jd, nodeType, ephemerisEpoch],
  );
  const ecliptic = useMemo(
    () => {
      if (!current) return [];
      return current.composite
        ? compositeEcliptic(current.composite, nodeType)
        : getEclipticPositions(jd, nodeType);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, jd, nodeType, ephemerisEpoch],
  );
  const gmst = useMemo(() => gmstRadians(jd), [jd]);
  const eps = useMemo(() => obliquity(jd), [jd]);

  // Slide tool: while the user spins the globe, resample the LINE positions at natal+Δt
  // (bucketed, ~1-hour steps) so the WHOLE line pipeline — cage, parans, orb bands,
  // angle overlays, zenith, local space — recomputes together and stays mutually
  // aligned as the sky drifts. The frame (`meridianLng`) stays at the NATAL GMST, so
  // the lines sit at the un-spun anchor (only the bodies' own motion shows); the Map
  // then spins them by θ. 0 = natal. (Composite charts have time-independent midpoint
  // positions, so the cage doesn't morph though the readout time advances — expected.)
  const sliding = mapTool === 'slide';
  const slideBucket = sliding ? Math.round(slideDt / SLIDE_BUCKET_DAYS) : 0;

  // Raw TRUE-SKY positions (RA/dec) at the active instant (natal jd, or the slid date
  // while the slide tool drags a composite/real chart), sliding-aware. Local space reads
  // these directly: it's inherently a true-sky technique and must NOT inherit the
  // In-Zodiaco / Geodetic ecliptic projection (projecting Pluto onto the ecliptic skews
  // its bearing ~3.7°). The map LINES instead use `linePositions` below.
  const slidPositions = useMemo(() => {
    if (!(sliding && current)) return positions;
    // Composite midpoints are time-independent — reuse the memo (same array
    // identity) so a slide drag doesn't resample Swiss and rebuild every line
    // layer per bucket for byte-identical output.
    if (current.composite) return positions;
    const jdEff = jd + slideBucket * SLIDE_BUCKET_DAYS;
    return getPlanetPositions(jdEff, nodeType);
    // ephemerisEpoch marks deferred asteroid data arriving (resample with new data).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, sliding, slideBucket, current, jd, nodeType, ephemerisEpoch]);

  // Positions feeding the map LINES. Geodetic mode and In-Zodiaco both project each
  // body onto the ecliptic first (geodetic needs the true zodiacal longitude even
  // for off-ecliptic bodies); In-Mundo keeps true sky positions. The wheel keeps
  // using `positions`/`ecliptic` (longitude is identical either way).
  const linePositions = useMemo(() => {
    // Unknown birth time on a CELESTIAL map: no positions reach the line generators, so
    // the angular lines and aspect/midpoint lines empty in one stroke. The WHEEL keeps
    // `positions`/`ecliptic` (planets by sign hold). On a GEODETIC map they reach them,
    // read at the 12:00 placeholder (timelessGeodetic says why), and the fast bodies'
    // lines get their bands (uncertaintyBands below). The families that read the sky's
    // turning — parans, zenith stamps, star parans — read skyFamiliesOff rather than
    // leaning on this one, since on a geodetic map it no longer empties them. (2026-10-02)
    if (noTime && !timelessGeodetic) return [];
    const jdEff = sliding && current ? jd + slideBucket * SLIDE_BUCKET_DAYS : jd;
    return lineSystem === 'geodetic' || coordSystem === 'zodiaco'
      ? projectOntoEcliptic(slidPositions, jdEff)
      : slidPositions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noTime, timelessGeodetic, lineSystem, coordSystem, slidPositions, jd, sliding, slideBucket, current, ephemerisEpoch]);

  // Part of Fortune — a derived zodiacal point (the Ascendant plus the Moon–Sun
  // arc, sect-aware). It is not a sampled body, so it is injected here rather than
  // flowing from the Swiss sweep. It has no sky position, so it only appears in
  // In-Zodiaco (and geodetic); it needs an Ascendant; and it is a single-birth-moment
  // idea, so composites are out of scope. `fortuneSect` is the natal sect (Sun above
  // the birthplace horizon). The Lot is an ADVANCED feature (Advanced ▸ reading depth),
  // so it is gated on `advancedWheel`: with Advanced off, the sect is null and BOTH the
  // map line and the wheel glyph fall away (each downstream memo short-circuits on a
  // null sect) — the single choke point that keeps Fortune out of the view while
  // Advanced is off.
  //
  // Two values since 2026-10-02, because a chart with no birth time splits them. On a
  // geodetic map its WHEEL has an Ascendant — the place's own, which needs no minute —
  // so the wheel's Fortune returns, built from it at the 12:00 placeholder's sect and
  // printed as a span (TIMELESS_RANGE_DEG). Its MAP line does not: a Fortune built from
  // a place's own Ascendant has a different degree at every place, so there is no one
  // line to draw, and the map's Fortune needs the chart's own Ascendant, which needs the
  // minute. So `fortuneSect` feeds the wheel and `fortuneDay`, the map, has none without
  // a time.
  const fortuneSect = useMemo(
    () =>
      advancedWheel && current && !current.composite && (!noTime || lineSystem === 'geodetic')
        ? isDayBirth(ecliptic, gmst, eps, current.birthplace.lat, current.birthplace.lng)
        : null,
    [advancedWheel, current, noTime, lineSystem, ecliptic, gmst, eps],
  );
  const fortuneDay = noTime ? null : fortuneSect;
  // The MAP's Fortune is fixed to the NATAL Ascendant and drawn like a body: its
  // offset from the Ascendant is the Moon–Sun arc, so a relocated Fortune would
  // sit the same distance from the relocated Ascendant — the natal degree is the
  // only honest map treatment. (Natal Asc via the same relocate() birthAngles uses
  // below; recomputed locally to keep this before the line pipeline.)
  const fortuneMapPos = useMemo(() => {
    if (fortuneDay == null || !current || current.composite) return null;
    const sun = ecliptic.find((p) => p.name === 'Sun');
    const moon = ecliptic.find((p) => p.name === 'Moon');
    if (!sun || !moon) return null;
    const { asc } = relocate(
      jd,
      current.birthplace.lat,
      current.birthplace.lng,
      effHouseSystem,
    );
    const lon = partOfFortuneLon(asc, sun.lon, moon.lon, fortuneDay, effFortuneFormula);
    return fortunePosition(lon, eps);
  }, [fortuneDay, current, ecliptic, jd, effHouseSystem, effFortuneFormula, eps]);

  // Maps a meridian's RA to a geographic longitude (deg). Celestial: RA − GMST
  // (sidereal time). Geodetic: the body's zodiacal longitude (Greenwich = 0° Aries),
  // independent of time. Injected into the line/zenith generators. The one factory
  // every frame here takes its mapping from, so the geodetic grid and the lines
  // can't read two copies of it (2026-10-02).
  const meridianLng = useMemo<MeridianLng>(
    () => meridianLngFor(lineSystem, eps, gmst),
    [lineSystem, eps, gmst],
  );

  // Fortune joins the angle-line generator ONLY (never `linePositions`), and only
  // In-Zodiaco/geodetic — so it draws its four angle lines without leaking into
  // mundo lines, parans, zenith stamps, or the aspect/midpoint families.
  const allLines = useMemo(() => {
    const inZodiaco = lineSystem === 'geodetic' || coordSystem === 'zodiaco';
    const src =
      fortuneMapPos && inZodiaco ? [...linePositions, fortuneMapPos] : linePositions;
    return generateLines(src, meridianLng, lineOpts);
  }, [linePositions, meridianLng, fortuneMapPos, lineSystem, coordSystem, lineOpts]);
  // No birth time, no parans, in either line system: a paran is two bodies on angles at one
  // moment of the sky's turning, which the unknown hour decides. Gated here (skyFamiliesOff)
  // rather than by linePositions, which a geodetic map now fills for a timeless chart.
  // (2026-10-02)
  const allParans = useMemo(
    () => (skyFamiliesOff ? EMPTY_FC : generateParans(linePositions, meridianLng)),
    [skyFamiliesOff, linePositions, meridianLng],
  );
  // Local-space origin: follow the pin (default) or stay on the birthplace.
  const [lsOrigin, setLsOrigin] = useState(loadLsOrigin);
  useEffect(() => saveLsOrigin(lsOrigin), [lsOrigin]);
  // Local-space line/compass visibility (Location view). "Hide" polarity, default
  // false → inbound lines and compass both shown until the user hides them.
  const [hideLsInbound, setHideLsInbound] = useState(loadLsHideInbound);
  useEffect(() => saveLsHideInbound(hideLsInbound), [hideLsInbound]);
  const [hideLsCompass, setHideLsCompass] = useState(loadLsHideCompass);
  useEffect(() => saveLsHideCompass(hideLsCompass), [hideLsCompass]);
  // The Local Space window's CAPTURE section: a single "Transparent Mode" preset (a
  // gated-tier surface, lib/plan). Where it's applied to the Map, it's gated on the Local
  // Space window being OPEN, the Capture tool being ARMED, and the plan reaching the GATED
  // rung — dropping any of those restores the map instantly, so the transparent export
  // treatment can never "stick" past the framing session or a tier lapse (the pref persists
  // for the next capture). ON hides the line arrows, switches to standard (frame-edge)
  // labels, and blanks the basemap so the export keeps a transparent background.
  const [transparentMode, setTransparentMode] = useState(loadLsTransparent);
  useEffect(() => saveLsTransparent(transparentMode), [transparentMode]);
  // Transparent mode is a per-Capture treatment: whenever Capture isn't the armed tool (it was
  // just closed, or the user switched to another map tool), drop it so the next Capture session
  // starts clean rather than silently re-applying last time's transparent export. Fires on mount
  // too (tool starts 'off'), so any stale-persisted value clears then as well.
  useEffect(() => {
    if (mapTool !== 'capture') setTransparentMode(false);
  }, [mapTool]);
  // Transparent-export badge labels (Capture Details section, in place of the wheel/list picker):
  // print each LS planet's name after its glyph, and/or the line's bearing along the line. Both
  // gated to transparent mode where they're passed to the Map. Off by default (glyph-only rose).
  const [lsLabelName, setLsLabelName] = useState(loadLsLabelName);
  useEffect(() => saveLsLabelName(lsLabelName), [lsLabelName]);
  const [lsLineDeg, setLsLineDeg] = useState(loadLsLineDeg);
  useEffect(() => saveLsLineDeg(lsLineDeg), [lsLineDeg]);
  // Local space radiates from the placed pin (relocated local space), from a
  // downstream-registered anchor point (lib/extensions/localSpaceAnchors) when
  // one is the selected origin, or from the birthplace — which is also the
  // fallback whenever the chosen origin has nothing to offer (no pin placed /
  // anchor unset). Also the anchor for the LS ring labels. The anchor's point
  // is subscribed live, so editing it moves the lines immediately.
  const lsAnchor = useMemo(() => findLocalSpaceAnchor(lsOrigin), [lsOrigin]);
  const lsAnchorPoint = useSyncExternalStore(
    lsAnchor ? lsAnchor.subscribe : subscribeNoAnchor,
    lsAnchor ? lsAnchor.get : getNoAnchor,
  );
  const localSpaceOrigin = useMemo<Point | null>(() => {
    if (lsOrigin === 'pin' && pinned) return pinned;
    // Home: where the chart's subject lives now — a field on the chart, so it
    // travels with the person rather than the session.
    if (lsOrigin === 'home' && current?.home) return current.home;
    // Any origin with nothing to give falls through to the birthplace.
    return lsAnchorPoint ?? (current ? current.birthplace : null);
  }, [lsOrigin, pinned, lsAnchorPoint, current]);
  // Fly-to helper shared by Teleport, Local Space's "fly to origin", and the transparent-export
  // toggle: hop the camera and stash the jump so it can be undone (Teleport window / Backspace).
  // `duration` (ms) is optional — omitted keeps MapLibre's default flyTo curve.
  // Where the last jump was aimed, so an arrival at a bare coordinate is
  // attributable. Session state, never persisted: this is a fact about the view
  // right now, not a preference. `stamp` is a counter rather than a dedupe key —
  // arriving at the same point twice has to ping twice.
  const [arrivalMark, setArrivalMark] = useState<{
    lat: number;
    lng: number;
    label?: string;
    stamp: number;
  } | null>(null);
  const arrivalStampRef = useRef(0);
  const markArrival = useCallback((point: { lat: number; lng: number } | null, label?: string) => {
    if (!point) {
      setArrivalMark(null);
      return;
    }
    arrivalStampRef.current += 1;
    setArrivalMark({ ...point, label, stamp: arrivalStampRef.current });
  }, []);
  // Every PROGRAMMATIC jump retires the arrival mark. The mark answers "where did
  // I just land"; once the camera has been sent somewhere else it is answering
  // about a landing that is no longer the current one. A jump that wants its own
  // mark sets one immediately after — the two writes batch, so the mark wins.
  //
  // Deliberately NOT wired to the user's own pan or zoom: panning off the address
  // and coming back is exactly when the mark is still wanted. Route camera jumps
  // through here rather than reaching for mapRef directly, or the mark outlives
  // the arrival it describes. (The map's own label-click jumps can't come through
  // here — they start inside Map — so they report themselves via `onCameraJump`.)
  const clearArrivalMark = useCallback(() => setArrivalMark(null), []);
  const jumpTo = useCallback((lat: number, lng: number, zoom?: number) => {
    clearArrivalMark();
    mapRef.current?.flyTo(lat, lng, zoom);
  }, [clearArrivalMark]);
  // Memoized so the handlers built on it (the home marker's click) can be stable
  // themselves — Map withdraws those by identity to decide whether a marker is
  // clickable at all, and a fresh function every render would churn that. Every
  // dependency is already stable: a ref, two state setters, and markArrival.
  const teleportToPoint = useCallback(
    (
      lat: number,
      lng: number,
      zoom?: number,
      duration?: number,
      // Opt IN to marking the destination. Defaulting to "no mark" keeps the callers
      // that aren't searches — Local Space's fly-to-origin (which already draws its
      // compass rose there), the home marker (which IS the mark) and the
      // transparent-export re-frame (a framing gesture, not a destination) —
      // exactly as they were.
      mark?: { label?: string } | null,
    ) => {
      const target = mapRef.current?.teleportTo(lat, lng, zoom, duration);
      if (target) {
        setLocationReturn('back');
        setTeleportTarget(target);
      }
      markArrival(mark ? { lat, lng } : null, mark?.label);
    },
    [markArrival],
  );
  // Turning on the transparent export flies to the local-space origin at the compass's full-size
  // zoom, so the always-on circle mask has the horizon rose to frame. Same teleport hop as Local
  // Space's "fly to origin" (undoable the same way), but near-instant — this toggle wants the
  // frame ready right away, not a leisurely fly.
  const flyToLsOrigin = () => {
    if (localSpaceOrigin)
      teleportToPoint(localSpaceOrigin.lat, localSpaceOrigin.lng, CLOSE_ZOOM, 200);
  };
  // None on a geodetic map either (skyHeld): local space is the sky at the chart minute
  // seen from a place, which a map that doesn't turn has nothing to say about — so neither
  // these lines nor the two sidebar dials below are built there, for the map or for a
  // plugin's complete set. (2026-10-02)
  const allLocalSpace = useMemo(
    () =>
      localSpaceOrigin && !noTime && !skyHeld
        ? generateLocalSpace(
            slidPositions, // true-sky positions, never ecliptic-projected (Q3a)
            gmst,
            localSpaceOrigin.lat,
            localSpaceOrigin.lng,
          )
        : EMPTY_FC,
    [slidPositions, gmst, localSpaceOrigin, noTime, skyHeld],
  );
  // Per-body azimuth/altitude at the local-space origin, keyed by planet. The
  // wheel sidebar's horizon dial + aspect statuses read THIS (not advancedCoords,
  // whose observer is the active point) so they agree exactly with the map's
  // local-space lines — same origin pref, and same slid sky while sliding.
  const localSpaceCoords = useMemo(
    () => localSpaceCoordMap(allLocalSpace),
    [allLocalSpace],
  );
  // The sidebar's local-space pair shows two horizon frames side by side,
  // independent of the map's single-origin pref: natal (always, at the birthplace)
  // and relocated (at the placed pin). Same slid sky + method as the map lines —
  // only the observer's location changes between them.
  const natalLocalSpaceCoords = useMemo(
    () =>
      current && !noTime && !skyHeld
        ? localSpaceCoordMap(
            generateLocalSpace(
              slidPositions,
              gmst,
              current.birthplace.lat,
              current.birthplace.lng,
            ),
          )
        : null,
    [current, noTime, skyHeld, slidPositions, gmst],
  );
  // Right dial: null when nothing is pinned, or the pin coincides with the
  // birthplace — the relocated frame would just clone the natal one, so the
  // sidebar leaves that slot empty rather than repeat it.
  const relocatedLocalSpaceCoords = useMemo(() => {
    if (!current || noTime || skyHeld || !pinned) return null;
    const atHome =
      Math.abs(pinned.lat - current.birthplace.lat) < 1e-4 &&
      Math.abs(pinned.lng - current.birthplace.lng) < 1e-4;
    if (atHome) return null;
    return localSpaceCoordMap(
      generateLocalSpace(slidPositions, gmst, pinned.lat, pinned.lng),
    );
  }, [current, noTime, skyHeld, pinned, slidPositions, gmst]);
  // Whether the aspect-section's local-space frame (localSpaceCoords, the origin
  // pref) sits on a RELOCATED origin (a pin away from the birthplace) vs the natal
  // birthplace — so the sidebar's Compare table can label its Local-space column
  // for whichever dial it mirrors.
  const localSpaceRelocated = useMemo(
    () =>
      !!(
        localSpaceOrigin &&
        current &&
        (Math.abs(localSpaceOrigin.lat - current.birthplace.lat) > 1e-4 ||
          Math.abs(localSpaceOrigin.lng - current.birthplace.lng) > 1e-4)
      ),
    [localSpaceOrigin, current],
  );
  // No birth time, no zenith stamps, in either line system — where a body stands overhead
  // is the sky's turning at the chart minute; gated here as allParans is. (2026-10-02)
  const allZenith = useMemo(
    () => (skyFamiliesOff ? EMPTY_FC : generateZenithStamps(linePositions, meridianLng)),
    [skyFamiliesOff, linePositions, meridianLng],
  );
  // The ecliptic great circle for the chart instant — a fixed reference (passes
  // through the Sun's zenith), independent of planet visibility, so not filtered.
  // (Named *Line to avoid colliding with the `ecliptic` projection-mode variable.)
  // Its geographic anchor is the chart minute's sidereal time, so it suppresses
  // with the rest of the linework when the birth time is unknown.
  const eclipticLine = useMemo(
    () => (skyFamiliesOff ? EMPTY_FC : generateEcliptic(jd, meridianLng)),
    [skyFamiliesOff, jd, meridianLng],
  );

  // Which bundled fixed-star set draws (the showStarLines toggle is declared up top
  // with the other hotkey-driven settings).
  const [starSet, setStarSet] = useState(loadStarSet);
  useEffect(() => saveShowStarLines(showStarLines), [showStarLines]);
  useEffect(() => saveStarSet(starSet), [starSet]);
  // The natal-lines PREFERENCE, never the derived `hideNatalAngles`: that value reads
  // "shown" whenever Advanced is off or an overlay is promoted, so persisting it would
  // quietly overwrite a stored "hidden" — the bug L52 records for the line system,
  // invisible until the NEXT session.
  useEffect(() => saveShowNatalLines(showNatalLines), [showNatalLines]);

  // Night-side shading persistence (the showNightShade toggle is declared up top
  // with the other hotkey-driven settings; the wash itself is computed below, after
  // the eclipse selection it keys its moment from is known).
  useEffect(() => saveShowNightShade(showNightShade), [showNightShade]);


  // Fixed-star lines (Filters ▸ Fixed Stars): proper-motion + precessed star
  // positions for the chart instant, through the same meridian mapping as the
  // planet lines (so they follow Celestial vs Geodetic like everything else).
  const starLines = useMemo(() => {
    if (!effShowStarLines || !current || skyFamiliesOff) return EMPTY_FC;
    return generateStarLines(
      starsOfDate(jd, starSet),
      meridianLng,
      lineSystem === 'geodetic' ? eps : null,
      // The pale starlight gold washes out on the light basemaps; each theme
      // gets its own tint (and the baked star sprite matches).
      STAR_LINE_COLORS[theme],
    );
  }, [effShowStarLines, current, skyFamiliesOff, jd, starSet, meridianLng, lineSystem, eps, theme]);

  // ── Catalog minor bodies (lib/minorBodies/) ──────────────────────────────────
  // The reader's list is a PREFERENCE (minorApi.pref). Whether each body on it draws is
  // DERIVED here from standing states — Advanced off, its source closed to this reader,
  // the family switch, a file still loading or failed, a date outside its file — so none
  // of them ever rewrites the list: each clears by itself and the reader's choice is
  // still there (CLAUDE.md rule 2).
  const { pref: minorPref, loadVersion: minorLoadVer } = minorApi;
  // What should be fetched: switched on, family shown, source open, Advanced on. Built
  // per render because a source's gate() is per render by contract; the effect below
  // keys on the request SET, so an unchanged set never re-fires.
  const minorRequests = minorLoadRequests(minorPref, advancedWheel);
  const minorRequestKey = minorRequests.map((r) => `${r.n}@${r.source.id}`).join(',');
  useEffect(() => {
    // A composite fetches like any chart: its catalog bodies are the parents' midpoints,
    // sampled from the same files at the parents' moments (compositeMinorSamples).
    if (!current || minorRequests.length === 0) return;
    void ensureMinorBodies(minorRequests);
    // Keyed on the request set; minorLoadVer re-runs it after a retry clears a failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minorRequestKey, current, minorLoadVer]);
  // Loaded AND wanted: the only bodies ever sampled (a failed file is never sampled —
  // the engine's failure path is expensive, see lib/minorBodies/se1Header.ts).
  const minorNumbers = useMemo(
    () => (current ? minorReadyNumbers(minorPref, advancedWheel, minorLoadState) : []),
    // minorLoadVer: a file landing or failing changes the ready set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, minorPref, advancedWheel, minorLoadVer],
  );
  // At the chart's own moment, then at the slid instant for the lines — the same two
  // steps the planets take, so a Slide keeps catalog lines aligned with the cage. The
  // rows' "no data for this date" reads the SLID sample, the instant the lines are drawn
  // at (CLAUDE.md rule 5): read at the chart's moment, a Slide past the end of a body's
  // file left its row saying 'shown' over a map with none of its lines.
  //
  // ONE sample at the chart's moment, taken in full — both frames, the speed, and the
  // station bracket — because the chart wheel places these same bodies from it (see
  // wheelMinor below). The lines get it stripped to their own shape, so the wheel and
  // the map read one instant from one engine call per body rather than two samplings
  // that could only agree by coincidence.
  //
  // A composite's are the parents' midpoints instead, by the planets' own rule — no
  // speed, no station, and lon/lat of record, which minorLinePositionOf hands the lines
  // (the In-Zodiaco projection reads the longitude midpoint, as it does for the planets).
  const minorSamples = useMemo(
    () =>
      minorNumbers.length === 0
        ? []
        : current?.composite
          ? compositeMinorSamples(current.composite, minorNumbers)
          : getMinorSamples(jd, minorNumbers, true),
    [jd, minorNumbers, current],
  );
  const minorPositions = useMemo(() => minorSamples.map(minorLinePositionOf), [minorSamples]);
  const minorSlidPositions = useMemo(() => {
    if (!sliding || minorNumbers.length === 0) return minorPositions;
    // Midpoints are time-independent: the same reuse slidPositions makes.
    if (current?.composite) return minorPositions;
    return getMinorPositions(jd + slideBucket * SLIDE_BUCKET_DAYS, minorNumbers);
  }, [minorPositions, sliding, slideBucket, jd, minorNumbers, current]);
  // The planets' own frame rule (linePositions above): In-Zodiaco and geodetic project
  // onto the ecliptic, In-Mundo keeps the true sky; no birth time, no lines — but on a
  // geodetic map, where the placeholder's degrees are all a line reads. (No catalog body
  // moves far enough in 12 hours to want a band.) (2026-10-02)
  const minorLinePositions = useMemo(() => {
    if (noTime && !timelessGeodetic) return [];
    const jdEff = sliding && current ? jd + slideBucket * SLIDE_BUCKET_DAYS : jd;
    return lineSystem === 'geodetic' || coordSystem === 'zodiaco'
      ? projectMinorOntoEcliptic(minorSlidPositions, jdEff)
      : minorSlidPositions;
  }, [noTime, timelessGeodetic, lineSystem, coordSystem, minorSlidPositions, jd, sliding, slideBucket, current]);
  // Whether the Angles filter shows any of the four angles catalog bodies draw — a draw
  // gate on every catalog line, the chart's and an overlay's (the rows, below the overlay
  // memos, read it through minorChartContext).
  const minorAnglesOff = !(['MC', 'IC', 'ASC', 'DSC'] as const).some((a) => visibleLineTypes.has(a));
  // Each body's name, colour and sprite — named exactly as its row is (minorRowName), and
  // read off the list and the load state rather than the rows, which are derived further
  // down once the overlay beside the chart is known.
  const minorDecor = useMemo(() => {
    // A plain record: `Map` in this module is the map component.
    const names: Record<number, string> = {};
    for (const e of minorPref.list) names[e.n] = minorRowName(e, minorLoadState(e.n));
    return (n: number): MinorDecor => ({
      name: names[n] || bundledMinorBody(n)?.name || '',
      color: minorLineColor(n, theme),
      icon: minorIconId(n),
    });
    // minorLoadVer: a file landing can bring a name with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minorPref, minorLoadVer, theme]);
  const allMinorLines = useMemo(
    () => generateMinorLines(minorLinePositions, meridianLng, minorDecor),
    [minorLinePositions, meridianLng, minorDecor],
  );
  // The Angles filter applies to catalog bodies exactly as to the planets.
  const minorLines = useMemo(
    () => ({
      ...allMinorLines,
      features: allMinorLines.features.filter((f) => visibleLineTypes.has(f.properties.lineType)),
    }),
    [allMinorLines, visibleLineTypes],
  );
  // A zenith coin sits ON its body's MC line, so it follows the MC toggle in the Angles
  // filter exactly as the planets' stamps do (filterZenith) — with MC off, a coin left
  // standing would mark a line the reader switched off. No birth time, no coins, as for
  // the planets' stamps (allZenith): a timeless chart's lines on a geodetic map don't
  // bring them back. (2026-10-02)
  const minorZenith = useMemo(
    () =>
      generateMinorZenith(
        visibleLineTypes.has('MC') && !skyFamiliesOff ? minorLinePositions : [],
        meridianLng,
        minorDecor,
      ),
    [skyFamiliesOff, minorLinePositions, meridianLng, minorDecor, visibleLineTypes],
  );

  const lines = useMemo(
    () =>
      mergeNodePairs(
        withThemeLineColors(filterLines(allLines, visiblePlanets, visibleLineTypes), theme),
      ),
    [allLines, visiblePlanets, visibleLineTypes, theme],
  );

  // Slide readout (reuses the measure slot): the spin as a rotation angle about the
  // pole, plus the resulting WALL-CLOCK time + date at the birthplace in the chart's
  // zone. Spinning the globe by θ° advances Greenwich sidereal time by θ, i.e.
  // θ/15.041 SOLAR hours of real (clock) time — so the clock = birth moment + dtHours,
  // shown DST-aware in the chart's IANA zone (legacy zone-less charts fall back to
  // tzOffset). Non-null whenever the tool is ARMED with a chart (Δt 0 = the natal
  // moment): the readout's controls and any surface scrubbing the slid instant need
  // it live before the first spin.
  const slide = useMemo<SlideInfo | null>(() => {
    if (mapTool !== 'slide' || !current) return null;
    const dtHours = slideDt * 24;
    const birthUtcMs = chartUtcMs(current);
    const slidMs = birthUtcMs + dtHours * 3_600_000;
    const offH = current.tzIana
      ? offsetHoursAt(current.tzIana, slidMs)
      : current.tzOffset;
    const label = current.tzIana
      ? zoneLabelAt(current.tzIana, slidMs)
      : formatUtcOffset(current.tzOffset);
    // Wall-clock = instant + offset, read in UTC (the timeline bar uses the same trick).
    const wall = new Date(slidMs + offH * 3_600_000);
    const hh = String(wall.getUTCHours()).padStart(2, '0');
    const mm = String(wall.getUTCMinutes()).padStart(2, '0');
    // The date, with the year only when the spin left the chart's own year.
    const year = wall.getUTCFullYear();
    const date = `${wall.getUTCDate()} ${fmt.monthAbbr(wall.getUTCMonth() + 1)}${
      year !== current.year ? ` ${year}` : ''
    }`;
    return {
      thetaDeg: dtHours * SIDEREAL_DEG_PER_HOUR,
      dtHours,
      clock: `${hh}:${mm} ${label}`,
      date,
      ms: slidMs,
    };
  }, [mapTool, slideDt, current, fmt]);

  // The "Aspects to angles" overlay lines (aspect and/or midpoint sets — both
  // share one map source). Unlike the base lines this generates FROM the visible
  // set: the midpoint pair count is quadratic in it, and the node dedup below
  // depends on it. In geodetic mode the positions are already ecliptic-projected
  // (see linePositions), so the measuring frame is zodiacal regardless of the
  // (possibly stale, hidden) In-Mundo/In-Zodiaco radio.
  const angleLines = useMemo<
    FeatureCollection<LineString, AngleOverlayLineProps>
  >(() => {
    if ((!effShowAspectLines && !effShowMidpointLines) || !current) return EMPTY_FC;
    const effCoordSystem: CoordSystem =
      lineSystem === 'geodetic' ? 'zodiaco' : coordSystem;
    const vis = linePositions.filter((p) => visiblePlanets.has(p.name));
    const features: Feature<LineString, AngleOverlayLineProps>[] = [];
    if (effShowAspectLines) {
      // (The generator drops the South Node itself while the North Node is
      // visible — antipodal duplicate set, same spirit as mergeNodeParans.)
      // The display filters (the Aspect Lines window) apply HERE, at the push
      // site, so midpoint features below are never touched and everything
      // downstream (map layers, edge badges, hover tips) follows for free.
      features.push(
        ...generateAspectLines(vis, meridianLng, effCoordSystem, eps, lineOpts).features.filter(
          (f) =>
            aspectLinePasses(
              effAspectLineFilters,
              f.properties.aspect,
              f.properties.lineType,
            ),
        ),
      );
    }
    if (effShowMidpointLines) {
      features.push(
        ...generateMidpointLines(vis, meridianLng, effCoordSystem, eps, lineOpts).features,
      );
    }
    return withThemeLineColors(
      {
        type: 'FeatureCollection',
        features: features.filter((f) =>
          visibleLineTypes.has(f.properties.lineType),
        ),
      },
      theme,
    );
  }, [
    effShowAspectLines,
    effShowMidpointLines,
    effAspectLineFilters,
    current,
    lineSystem,
    coordSystem,
    linePositions,
    visiblePlanets,
    visibleLineTypes,
    meridianLng,
    eps,
    theme,
    lineOpts,
  ]);

  const parans = useMemo(
    () =>
      effShowParans
        ? mergeNodeParans(filterParans(allParans, visiblePlanets), visiblePlanets)
        : EMPTY_FC,
    [allParans, visiblePlanets, effShowParans],
  );
  // The catalog bodies' parans with the planets (Minor bodies ▸ "Parans with the planets"):
  // each body on the reader's list paired with the visible built-in bodies, never with
  // another catalog body (parans.ts says why). From EXACTLY what the two families' lines are
  // drawn from — minorLinePositions and linePositions, slid and projected alike, through the
  // one meridianLng, with the catalog lines' own decoration — so every row crosses the drawn
  // lines where it says it does (CLAUDE.md rule 5; verify-parans §7). No birth time, none, as
  // for the planets' (allParans: skyFamiliesOff).
  const minorParans = useMemo(
    () =>
      !minorParansOn || skyFamiliesOff || minorLinePositions.length === 0
        ? NO_MINOR_PARANS
        : generateMinorParans(
            minorLinePositions,
            minorParanPartners(linePositions, visiblePlanets),
            meridianLng,
            minorDecor,
          ),
    [minorParansOn, skyFamiliesOff, minorLinePositions, linePositions, visiblePlanets, meridianLng, minorDecor],
  );

  // Local Space is its own View now: the window being open IS the on switch, so the
  // lines render exactly while showLocalSpace is true (no separate toggle) — except on a
  // geodetic map, where the open window shows the hold's reason instead and draws nothing
  // (skyHeld). Everything that means "local space is ON" reads this, never the raw flag,
  // so the flag stays as the reader left it. (2026-10-02)
  const lsActive = showLocalSpace && !skyHeld;
  const localSpace = useMemo(
    () =>
      lsActive
        ? withThemeLineColors(
            filterLocalSpace(allLocalSpace, visiblePlanets, hideLsInbound),
            theme,
          )
        : EMPTY_FC,
    [allLocalSpace, visiblePlanets, lsActive, hideLsInbound, theme],
  );
  // Dots where the (visible) local-space lines cross the (visible) birth-chart
  // lines — only while local space is shown.
  const localSpaceCross = useMemo(
    () =>
      lsActive ? generateLocalSpaceCrossings(localSpace, lines) : EMPTY_FC,
    [lsActive, localSpace, lines],
  );
  const zenith = useMemo(
    () =>
      withThemeLineColors(filterZenith(allZenith, visiblePlanets, visibleLineTypes), theme),
    [allZenith, visiblePlanets, visibleLineTypes, theme],
  );
  // The nadir (sub-anti-planetary) stamps: the antipodes of the zeniths, on the IC
  // line — so they follow the IC toggle (the zeniths follow MC). Shown together with
  // the zeniths under the one Zeniths/Nadirs filter (showZenith), gated at the Map prop.
  const nadir = useMemo(
    () =>
      withThemeLineColors(
        filterZenith(antipodeStamps(allZenith), visiblePlanets, visibleLineTypes, 'IC'),
        theme,
      ),
    [allZenith, visiblePlanets, visibleLineTypes, theme],
  );

  // ── Timeline / overlay: a second chart layer (transits, secondary
  // progressions, solar-arc directions, or a synastry partner) derived from the
  // current chart via buildOverlay, then run through the SAME generators and
  // visibility filters as the base.
  // A chart can't be its own synastry partner, so a partner that matches the active
  // chart resolves to none here (the memo guard); selectChart/handleDelete clear the
  // stored partnerId in the cases that can cause such a self-match.
  const partner = useMemo(
    () =>
      partnerId && partnerId !== current?.id
        ? (charts.find((c) => c.id === partnerId) ?? null)
        : null,
    [charts, partnerId, current],
  );
  // ── Eclipses overlay ──────────────────────────────────────────────────────
  // Catalog → selected row → Swiss-resolved event + fitted Besselian elements →
  // the GeoJSON the map draws. Each link memoizes separately, so a display
  // tweak (isoline step, theme) never re-runs the ~20-call Swiss fit.
  //
  // The whole module (catalog JSON + eclipsePath fitting) code-splits behind
  // this state: it loads on the first entry into eclipse mode (or right away
  // when the persisted overlay mode restores to it) and every memo below
  // no-ops until it lands — the HUD simply lists an empty catalog for that
  // brief gap, the same state it shows for an unknown selection.
  const [eclipsesMod, setEclipsesMod] = useState<
    typeof import('./lib/astro/eclipses') | null
  >(null);
  useEffect(() => {
    if (overlayMode !== 'eclipses' || eclipsesMod) return;
    let stale = false;
    import('./lib/astro/eclipses').then(
      (m) => {
        if (!stale) setEclipsesMod(m);
      },
      (err: unknown) => {
        // Chunk fetch failed (offline, or a stale deploy's hash 404ing). The
        // mode keeps its empty-catalog state; leaving and re-entering eclipse
        // mode re-runs this effect and retries the import.
        console.warn('[eclipses] failed to load the eclipse module', err);
      },
    );
    return () => {
      stale = true;
    };
  }, [overlayMode, eclipsesMod]);
  // Idle warm-up for the same chunk: it sits in the PWA precache, so a few
  // seconds after boot this costs a local fetch + parse — and the first entry
  // into eclipse mode then opens with the catalog already in hand instead of a
  // collapsed beat while the import lands. The on-demand effect above stays as
  // the immediate path (and the retry path if this quiet attempt ever fails,
  // e.g. offline on an uncached first visit).
  useEffect(() => {
    if (eclipsesMod) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      import('./lib/astro/eclipses').then(
        (m) => {
          if (!cancelled) setEclipsesMod((cur) => cur ?? m);
        },
        () => {}, // quiet — the on-demand path owns error reporting + retry
      );
    }, 3500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [eclipsesMod]);
  const eclipseCatalog = useMemo(
    () => (eclipsesMod ? eclipsesMod.loadEclipseCatalog() : []),
    [eclipsesMod],
  );
  const eclipseRow = useMemo(() => {
    if (overlayMode !== 'eclipses' || !eclipsesMod) return null;
    return (
      eclipseCatalog.find((r) => r.id === eclipseId) ??
      eclipsesMod.nearestEclipse(eclipseCatalog, targetDate)
    );
  }, [overlayMode, eclipsesMod, eclipseCatalog, eclipseId, targetDate]);
  // Pin the fallback selection: entering the mode with no (or a stale) saved id
  // lands on the eclipse nearest the overlay date; persist that id immediately
  // so timeline scrubbing in other modes can't silently change the selection.
  // Adjusted during render (the playing-pause precedent above), not an effect.
  if (eclipseRow && eclipseRow.id !== eclipseId) setEclipseId(eclipseRow.id);
  const resolvedEclipse = useMemo(
    () => (eclipseRow && eclipsesMod ? eclipsesMod.resolveEclipse(eclipseRow) : null),
    [eclipseRow, eclipsesMod],
  );
  // The eclipse's name as every eclipse surface gives it: its long date and kind
  // ("8 April 2024 · Total") — the curves' hover label and the click card's title
  // here, the same date the panel's picker shows (lib/astro/eclipseFormat.ts).
  const eclipseTitle = useMemo(
    () =>
      resolvedEclipse
        ? `${eclipseLongDate(resolvedEclipse.row.id, fmt)} · ${t(`settings.eclipses.kind.${resolvedEclipse.row.kind}`)}`
        : '',
    [resolvedEclipse, fmt, t],
  );
  const eclipseMapData = useMemo(
    () =>
      resolvedEclipse && eclipsesMod
        ? eclipsesMod.buildEclipseMap(resolvedEclipse, eclipseIsoStep, theme, eclipseTitle)
        : null,
    [resolvedEclipse, eclipsesMod, eclipseIsoStep, theme, eclipseTitle],
  );
  const eclipseDetails = useMemo(
    () =>
      resolvedEclipse && eclipsesMod
        ? eclipsesMod.buildEclipseDetails(
            resolvedEclipse,
            // The eclipse degree readout shifts by the ayanamsa of the
            // ECLIPSE's own moment (sidereal frames ride the stars).
            ayanamsaRad(resolvedEclipse.event.maximum, effZodiacMode),
          )
        : null,
    [resolvedEclipse, eclipsesMod, effZodiacMode],
  );

  // Night-side shading (Filters ▸ Night Shading): the hemisphere where the Sun
  // is below the horizon, keyed to the moment the map is showing — the eclipse
  // maximum in Eclipses mode (a lunar eclipse is visible from exactly this
  // hemisphere), the target date under Transits/CCG (it sweeps with playback),
  // and the chart's own moment otherwise (symbolic overlays like progressions
  // have no second real instant to shade). Empty on a geodetic map (skyHeld): the wash is
  // the sky turning at a moment, and the stored switch keeps its choice. (2026-10-02)
  const nightShade = useMemo(() => {
    if (!showNightShade || !current || skyHeld) return EMPTY_FC;
    const nightJd =
      overlayMode === 'eclipses' && resolvedEclipse
        ? resolvedEclipse.event.maximum
        : overlayMode === 'transits' || overlayMode === 'cyclo'
          ? epochMsToJD(targetDate)
          : jd;
    const style = NIGHT_SHADE_STYLE[theme];
    return generateNightShade(nightJd, style.color, style.opacity);
  }, [showNightShade, current, skyHeld, overlayMode, resolvedEclipse, targetDate, jd, theme]);

  // Local circumstances under the cursor, for the eclipse-curve hover tip.
  const eclipseTip = useMemo(() => {
    if (!resolvedEclipse || !eclipsesMod) return null;
    if (resolvedEclipse.body === 'lunar') {
      // Lunar: how much of the eclipse this place catches — pure math on the
      // phase samples the geometry already holds (hover-rate cheap).
      const geo = resolvedEclipse.geometry;
      const present = eclipsesMod.LUNAR_PHASE_ORDER.filter((p) => geo.samples[p]);
      return (lat: number, lng: number) => {
        const vis = present.filter(
          (p) => eclipsesMod.moonSinAlt(geo.samples[p]!.sample, lat, lng) >= -0.01,
        ).length;
        if (vis === 0) return null;
        return vis === present.length
          ? t('map.eclipse.lunarAllVisible')
          : t('map.eclipse.lunarPartView', { n: vis, total: present.length });
      };
    }
    const el = resolvedEclipse.elements;
    return (lat: number, lng: number) => {
      const lc = eclipsesMod.localCircumstances(el, lat, lng);
      if (!lc) return null;
      const civil = jdToCivil(lc.jd);
      const p = (n: number) => String(n).padStart(2, '0');
      return t('map.eclipse.localMax', {
        pct: `${Math.round(lc.obscuration * 100)}%`,
        time: `${p(civil.hour)}:${p(civil.minute)}`,
      });
    };
  }, [resolvedEclipse, eclipsesMod, t]);

  // The click-card builder for eclipses mode: ready-made .ui-tip HTML with the
  // clicked point's full local circumstances. Its identity doubles as the
  // card's close signal (the Map removes the pinned popup when it changes).
  //
  // EVERY TIME IS GIVEN TWICE: on the clicked place's own civil clock, then in
  // UTC. Until 2026-09-30 the card printed bare UTC times under no label at all,
  // and a reader at Luxor read "Totality begins 10:03:48" as her own clock, three
  // hours out — the panel and the hover tip said UTC, the card never did. The
  // place's clock leads because a contact time at a place is something a person
  // there plans around; UTC stays beside it because published eclipse tables are
  // in UT, so it is the column a figure is checked against. The reason is on
  // docs/calculation-methods.md ("Eclipse times at a place").
  //
  // A clock column is read against the eclipse's own date (the title's): the
  // head adds a short date when the column's maximum falls on another day — an
  // evening lunar eclipse in the Americas is the day BEFORE its catalog date there
  // — and a single time that crosses midnight from that carries its own date.
  const eclipseCard = useMemo(() => {
    if (overlayMode !== 'eclipses' || !resolvedEclipse || !eclipsesMod) return null;
    const title = eclipseTitle;
    const maxJd = resolvedEclipse.event.maximum;
    const [eclY, eclM, eclD] = resolvedEclipse.row.id.split('-').map(Number);
    // All values below are computed numbers/times and localized strings (the
    // zone abbreviations come from the platform's time-zone data) — nothing
    // user-authored reaches this HTML.
    const card = (rows: string, twoClocks: boolean, sub = '') =>
      `<div class="ui-tip"><span class="ui-tip-title">${title}</span>` +
      `<dl class="eclipse-card-rows eclipse-card-clock${twoClocks ? '' : ' eclipse-card-one'}">${rows}</dl>` +
      (sub ? `<span class="ui-tip-sub">${sub}</span>` : '') +
      `</div>`;

    interface ClockColumn {
      read: (jd: number) => EclipseClock;
      head: string;
      utc: boolean;
      /** The clock's own name at one instant, for a clock whose name can change
       *  mid-eclipse — the place's, across a daylight-saving change. */
      zoneAt?: (jd: number) => string;
    }
    const sameDay = (a: EclipseClock, b: { year: number; month: number; day: number }) =>
      a.year === b.year && a.month === b.month && a.day === b.day;
    // The columns for one click: the place's clock and UTC — or UTC alone where
    // the place has no zone, or where its clock IS UTC for every time on the
    // card (a second column would only repeat the first).
    const columnsFor = (lat: number, lng: number, jds: number[]): ClockColumn[] => {
      const utc: ClockColumn = {
        read: (jd) => jdToClock(jd),
        head: t('map.eclipseCard.utc'),
        utc: true,
      };
      const place = eclipsePlaceClock(lat, lng);
      if (!place || [maxJd, ...jds].every((jd) => place(jd).offsetHours === 0)) return [utc];
      const zoneAt = (jd: number) => place(jd).zone ?? t('map.eclipseCard.lmt');
      return [
        {
          read: (jd) => jdToClock(jd, place(jd).offsetHours),
          head: zoneAt(maxJd),
          utc: false,
          zoneAt,
        },
        utc,
      ];
    };
    // The head row, a builder for a row's time cells, and one for a value that
    // is not a time (it spans both clock columns).
    const clockCells = (cols: ClockColumn[]) => {
      const refs = cols.map((c) => c.read(maxJd));
      const two = cols.length > 1;
      const utcClass = (c: ClockColumn) => (two && c.utc ? 'eclipse-card-utc' : '');
      const head =
        `<dt></dt>` +
        cols
          .map((c, i) => {
            const day = sameDay(refs[i], { year: eclY, month: eclM, day: eclD })
              ? ''
              : ` · ${eclipseShortDate(refs[i], fmt)}`;
            return `<dd class="eclipse-card-zone ${utcClass(c)}">${c.head}${day}</dd>`;
          })
          .join('');
      // A time on another day than its column's head carries that day; one read
      // under another zone name than the head's — a contact past a daylight-saving
      // change, each read at its own instant's offset — carries its own name, so a
      // CST time never sits silently under a "CDT" head.
      const times = (jd: number) =>
        cols
          .map((c, i) => {
            const at = c.read(jd);
            const zone = c.zoneAt?.(jd);
            const tags = [
              sameDay(at, refs[i]) ? '' : eclipseShortDate(at, fmt),
              zone && zone !== c.head ? zone : '',
            ].filter(Boolean);
            const tag = tags.length
              ? `<span class="eclipse-card-day">${tags.join(' ')}</span>`
              : '';
            const cls = utcClass(c);
            return `<dd${cls ? ` class="${cls}"` : ''}>${at.hms}${tag}</dd>`;
          })
          .join('');
      const value = (text: string, dim = false) => {
        const cls = [two ? 'eclipse-card-span' : '', dim ? 'eclipse-card-dim' : '']
          .filter(Boolean)
          .join(' ');
        return `<dd${cls ? ` class="${cls}"` : ''}>${text}</dd>`;
      };
      return { head, times, value, two };
    };

    if (resolvedEclipse.body === 'lunar') {
      const geo = resolvedEclipse.geometry;
      return (lat: number, lng: number) => {
        const view = eclipsesMod.lunarLocalView(geo, lat, lng);
        if (!view) return null;
        // Phase contacts and any mid-eclipse moonrise/set, in time order; the
        // contacts the Moon misses stay listed but dimmed (that is the local
        // story: what this place catches and what it sleeps through).
        const events = [
          ...view.phases.map((p) => ({
            jd: p.jd,
            label: t(`map.eclipseCard.phase.${p.phase}`),
            visible: p.visible,
          })),
          ...(view.moonrise !== null
            ? [{ jd: view.moonrise, label: t('map.eclipseCard.moonrise'), visible: true }]
            : []),
          ...(view.moonset !== null
            ? [{ jd: view.moonset, label: t('map.eclipseCard.moonset'), visible: true }]
            : []),
        ].sort((a, b) => a.jd - b.jd);
        const cells = clockCells(
          columnsFor(
            lat,
            lng,
            events.filter((e) => e.visible).map((e) => e.jd),
          ),
        );
        const rows = events
          .map(
            (e) =>
              `<dt>${e.label}</dt>` +
              (e.visible
                ? cells.times(e.jd)
                : cells.value(t('map.eclipseCard.belowHorizon'), true)),
          )
          .join('');
        return card(cells.head + rows, cells.two);
      };
    }

    const el = resolvedEclipse.elements;
    return (lat: number, lng: number) => {
      const c = eclipsesMod.localContacts(el, lat, lng);
      if (!c) return null;
      const annular = c.centralKind === 'annular';
      const cells = clockCells(
        columnsFor(
          lat,
          lng,
          [c.c1, c.c2, c.max, c.c3, c.c4].flatMap((lc) => (lc ? [lc.jd] : [])),
        ),
      );
      // A contact the horizon clips says so on its LABEL ("Partial begins · at
      // sunrise") rather than after its time, which keeps the clock columns tight.
      const contact = (
        label: string,
        lc: { jd: number; atHorizon: boolean } | null | undefined,
        rise: boolean,
      ) =>
        lc
          ? `<dt>${label}${
              lc.atHorizon
                ? ` · ${t(rise ? 'map.eclipseCard.atSunrise' : 'map.eclipseCard.atSunset')}`
                : ''
            }</dt>${cells.times(lc.jd)}`
          : '';
      const rows = [
        cells.head,
        contact(t('map.eclipseCard.c1'), c.c1, true),
        contact(t(annular ? 'map.eclipseCard.c2Annular' : 'map.eclipseCard.c2'), c.c2, true),
        `<dt>${t('map.eclipseCard.max')}</dt>${cells.times(c.max.jd)}`,
        contact(t(annular ? 'map.eclipseCard.c3Annular' : 'map.eclipseCard.c3'), c.c3, false),
        contact(t('map.eclipseCard.c4'), c.c4, false),
        c.centralDurationSec !== null
          ? `<dt>${t('map.eclipseCard.duration')}</dt>${cells.value(
              formatEclipseDuration(c.centralDurationSec),
            )}`
          : '',
      ].join('');
      return card(
        rows,
        cells.two,
        t('map.eclipseCard.maxValue', {
          mag: formatEclipseMagnitude(c.max.magnitude),
          obsc: `${Math.round(c.max.obscuration * 100)}%`,
        }),
      );
    };
  }, [overlayMode, resolvedEclipse, eclipsesMod, eclipseTitle, fmt, t]);

  // Whether the transit moment IS one of the chart's returns. A solar or lunar
  // return chart is transits cast for one particular instant — the same overlay,
  // the same maths — but it is a named chart an astrologer reads as its own thing,
  // so the wheel calls it by that name rather than "Transits". The timeline bar's
  // Returns row highlights off the same predicate, so the two can't disagree.
  const overlayReturn = useMemo<ReturnBody | null>(
    () =>
      overlayMode !== 'transits' || !current
        ? null
        : activeReturnBody(current, targetDate),
    [overlayMode, current, targetDate],
  );

  // Click-a-line interpretation card: a short reading for the clicked line
  // (planet on angle, aspect/midpoint/paran/local-space explainers). Off in
  // eclipses mode, whose clicks pin the local-circumstances card instead. The
  // builder's identity carries the active chart so a card can't outlive it.
  const lineCard = useMemo(() => {
    if (overlayMode === 'eclipses' || !current) return null;
    return (
      layerId: string,
      props: Record<string, unknown>,
      dist: LineCardDistance | null,
      extra: string | null,
    ) => buildLineCard(layerId, props, t, dist, extra);
    // lineSystem/coordSystem aren't read by the builder — they're deliberate
    // identity-bust deps: those settings move every line wholesale, and a
    // pinned card would float over empty map, so the change closes it (the
    // Map's close-on-identity effect).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayMode, current, lineSystem, coordSystem, t]);

  // Ease the camera to an eclipse's headline ground point (the catalog's
  // whole-degree coordinates are plenty at this zoom). Menu picks and the
  // HUD's ⌖ fly; ‹ › stepping deliberately never moves the camera.
  const flyToEclipse = useCallback((row: EclipseCatalogRow) => {
    const lat = row.body === 'solar' ? row.geLat : row.zenLat;
    const lng = row.body === 'solar' ? row.geLng : row.zenLng;
    jumpTo(lat, lng, 2.75);
  }, [jumpTo]);
  const onEclipseSelect = useCallback(
    (id: string, source: 'menu' | 'step') => {
      setEclipseId(id);
      if (source === 'menu') {
        const row = eclipseCatalog.find((r) => r.id === id);
        if (row) flyToEclipse(row);
      }
    },
    [eclipseCatalog, flyToEclipse],
  );

  // Returns snap (timeline ▸ Returns, transits only): move the target date to the
  // chart's solar/lunar return and frame the lines by that instant's own sidereal
  // time. This is not a preference nudge — in the natal frame the returning body is
  // pinned to its birth longitude BY CONSTRUCTION, so its lines would sit on the
  // natal ones and never move from one return to the next, whatever year you walked
  // to. Only 'transit-moment' makes the snapped map the return chart's
  // astrocartography.
  //
  // So the frame is BORROWED, not written (see returnBorrow): the stored preference
  // stays untouched underneath and comes back the moment the reader leaves the return.
  // Stepping with the arrows updates the borrow's date and keeps it — walking returns is
  // a returns-control action, not a departure.
  //
  // The borrow is only taken where it would actually mask something. Geodetic lines
  // ignore sidereal time and a time-unknown chart is already forced to the moment's own
  // sky, so on either the frame is what it was going to be anyway — and a chip claiming
  // to hold a setting that nothing is holding is a worse lie than saying nothing.
  const snapToReturn = useCallback(
    (body: ReturnBody, dir: -1 | 0 | 1) => {
      if (!current) return;
      const r = findReturn(current, body, targetDate, dir);
      if (!r) return;
      setPlaying(false);
      setTargetDate(r.ms);
      const holds = lineSystem === 'celestial' && !noTime;
      // `changed` reads the EFFECTIVE frame, not the stored one: on the second press of ›
      // the borrow is already up and the map does not move, and a card about a change
      // that didn't happen is how a notice becomes something people dismiss unread.
      announceFlip('overlay-frame-held', holds && effTransitFrame !== 'transit-moment');
      if (holds) setReturnBorrow({ body, ms: r.ms, chartId: current.id });
    },
    // effTransitFrame is a real dependency, not a formality: the announce above decides
    // whether anything CHANGED from it, and a stale copy would report a flip that
    // already happened — the one thing a notice must never do.
    [current, targetDate, lineSystem, noTime, effTransitFrame, announceFlip],
  );

  const overlayLayer = useMemo(() => {
    if (overlayMode === 'off' || !current) return null;
    // Belt-and-braces for the stale-mode reset effect above: a mode this chart can't
    // carry (composite / unknown birth time) never builds a layer. And a SYNASTRY
    // partner whose own birth time is unknown has no real angular sky to overlay —
    // their noon placeholder would draw confident lines — so that layer stays off too.
    if (overlayBlockedFor(current, lineSystem)(overlayMode)) return null;
    if (overlayMode === 'synastry' && timeUnknown(partner)) return null;
    // Tertiary Progressed is its own Overlay mode; map it to the tertiary day-clock
    // buildOverlay reads (every other mode resolves to the default secondary clock).
    const progressionType =
      overlayMode === 'tertiary-progressed' ? 'tertiary' : 'secondary';
    if (overlayMode === 'eclipses') {
      // The eclipse CHART: the sky at the eclipse maximum as a transit overlay pinned
      // to that instant. This layer feeds the bi-wheel's overlay ring; whether its
      // planet/angle lines also reach the MAP is gated separately (mapOverlay, below)
      // by the opt-in showEclipseMapLines flag. (resolvedEclipse non-null implies the
      // lazy eclipses module is in.)
      if (!showEclipseChart || !resolvedEclipse || !eclipsesMod) return null;
      return buildOverlay(
        current,
        'eclipses',
        eclipsesMod.jdToMs(resolvedEclipse.event.maximum),
        null,
        nodeType,
        angleProgression,
        primaryRate,
        userPrimaryRate,
        effTransitFrame,
        progressionType,
        t,
      );
    }
    return buildOverlay(
      current,
      overlayMode,
      targetDate,
      partner,
      nodeType,
      angleProgression,
      primaryRate,
      userPrimaryRate,
      effTransitFrame,
      progressionType,
      t,
    );
    // ephemerisEpoch resamples the overlay instant too when the deferred
    // asteroid file arrives (it isn't read by buildOverlay itself).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    overlayMode,
    current,
    lineSystem,
    targetDate,
    partner,
    nodeType,
    angleProgression,
    primaryRate,
    userPrimaryRate,
    effTransitFrame,
    showEclipseChart,
    resolvedEclipse,
    eclipsesMod,
    t,
    ephemerisEpoch,
  ]);

  // The active overlay's drawing frame — its bodies (ecliptic-projected in
  // zodiaco/geodetic, true-sky otherwise), the meridian mapping, its label prefix,
  // and its epoch's obliquity. One source shared by the overlay's auxiliary line
  // families (aspect/midpoint/star) so they can't drift from the base overlay lines.
  const overlayFrame = useMemo(() => {
    if (!overlayLayer) return null;
    const ovEps = obliquity(overlayLayer.jd);
    const ovPositions =
      lineSystem === 'geodetic' || coordSystem === 'zodiaco'
        ? projectOntoEcliptic(overlayLayer.positions, overlayLayer.jd)
        : overlayLayer.positions;
    const ovMeridianLng: MeridianLng = meridianLngFor(lineSystem, ovEps, overlayLayer.gmst);
    return {
      ovPositions,
      ovMeridianLng,
      ovEps,
      prefix: OVERLAY_LABEL_PREFIX[overlayLayer.kind],
      isCyclo: overlayLayer.kind === 'cyclo',
      jd: overlayLayer.jd,
    };
  }, [overlayLayer, coordSystem, lineSystem]);

  // ── Catalog minor bodies beside the overlay (lib/astro/timeline overlayMinorSamples) ──
  // The reader's catalog set placed by the overlay's own rule — sampled at its instant,
  // directed by its arc, or a composite partner's midpoints — in a memo of its own rather
  // than on the layer: a file landing re-runs this and never the planets' buildOverlay.
  // The directed rules shift the chart's own sample (minorSamples, taken at `jd`, which is
  // the layer's base instant), so they cost no engine call.
  //
  // Not deferred during playback. Measured (verify:minor-bodies §12g, 2026-10-05, Node): at
  // the cap of 20 bundled bodies a tick adds ~4 ms of sampling and ~1 ms of geometry, the
  // planets' share of the same tick being ~2 ms — about 4% of the 120 ms playback interval,
  // and ~2 ms for the ten hypothetical points. A useDeferredValue on the layer would buy
  // nothing at that size, and lines, rows and wheel marks stay on one instant without it.
  const overlayMinorSampled = useMemo<readonly OverlayMinorSample[]>(
    () =>
      overlayLayer && minorNumbers.length > 0
        ? overlayMinorSamples(overlayLayer.bodyRule, minorNumbers, { jd, samples: minorSamples })
        : NO_OVERLAY_MINOR,
    [overlayLayer, minorNumbers, jd, minorSamples],
  );
  // Their lines and zenith coins in the overlay's frame — the SAME derived line system,
  // projection, Angles filter and zenith gate the overlay's planet lines read (the overlay
  // memo below; CLAUDE.md rule 5), with the meridian and projection taken from the layer
  // inside overlayMinorLines exactly as that memo takes them. Tagged with the overlay's
  // prefix (Cyclo: Tr — catalog bodies ride its transiting side), never relabelled. Its
  // `positions` and `meridianLng` are what an overlay paran set pairs. Null with none
  // placed, so an empty set is one stable value rather than a fresh one every tick.
  const overlayMinor = useMemo(
    () =>
      overlayLayer && overlayMinorSampled.length > 0
        ? overlayMinorLines(overlayLayer, overlayMinorSampled, {
            lineSystem,
            coordSystem,
            visibleLineTypes,
            zenith: effShowZenith,
            decor: minorDecor,
          })
        : null,
    [overlayLayer, overlayMinorSampled, lineSystem, coordSystem, visibleLineTypes, effShowZenith, minorDecor],
  );
  // The overlay's catalog parans: its catalog bodies (overlayMinor's frame-projected positions
  // and meridian) paired with its visible planets as its own parans read them (overlayFrame's
  // ovPositions — the overlay memo's) — so they cross the overlay's drawn lines, as the
  // chart's cross the chart's (rule 5). Wherever the overlay's planet parans are drawn: held
  // with them by minorParansOn, and blocked on Cyclocartography as theirs are. Tagged as the
  // overlay's catalog lines are (tagMinor: tagLabels would overwrite the label the map's hover
  // keys on). Null with none.
  const overlayMinorParans = useMemo(
    () =>
      minorParansOn &&
      overlayLayer &&
      overlayMinor &&
      overlayFrame &&
      overlayMinor.positions.length > 0 &&
      !overlayAuxBlocked(overlayLayer.kind, 'paran')
        ? tagMinor(
            generateMinorParans(
              overlayMinor.positions,
              minorParanPartners(overlayFrame.ovPositions, visiblePlanets),
              overlayMinor.meridianLng,
              minorDecor,
            ),
            OVERLAY_LABEL_PREFIX[overlayLayer.kind],
          )
        : null,
    [minorParansOn, overlayLayer, overlayMinor, overlayFrame, visiblePlanets, minorDecor],
  );

  // One-frame rule: when an overlay is active the auxiliary families (aspect,
  // midpoint, star) render from the OVERLAY's frame and the natal set is hidden —
  // never both. Independent of the Natal display toggle, which keeps governing only
  // the primary angle lines' dual display. Eclipses are excluded: their map linework
  // is a separate opt-in (showEclipseMapLines / eclipseSolo).
  //
  // PARANS LEFT THIS RULE on 2026-10-06 (Salvatore, from a support report; seam L23's
  // addendum). A reader who turned Parans on with Transits running found only the transit
  // sky's rows, compared them with another program's natal parans, and concluded ours were
  // wrong. Now the chart's own parans stay on the map beside an overlay, following the
  // Natal Lines switch, and the time overlays draw none of their own (timeline
  // AUX_BLOCKED_OVERLAYS says why); a synastry partner's, and an eclipse's opt-in set,
  // are drawn beside the chart's, tagged. Pairing is untouched: a paran is still two
  // bodies of ONE chart, and no cross-chart row is drawn. See effParans/drawParans.
  const overlayAux = !!overlayLayer && overlayMode !== 'eclipses';

  // The overlay frame's aspect + midpoint lines — the overlay counterpart of the
  // natal `angleLines` memo, replacing it while an overlay is active. Tagged with the
  // overlay prefix (per-body Sp/Tr on Cyclocartography, whose aspect-to-angle lines
  // each have one well-defined source body). Midpoint lines are suppressed on
  // Cyclocartography — a midpoint would average two epochs into a single point.
  const overlayAngleLines = useMemo<
    FeatureCollection<LineString, AngleOverlayLineProps>
  >(() => {
    if (!overlayFrame || !overlayAux) return EMPTY_FC;
    if (!effShowAspectLines && !effShowMidpointLines) return EMPTY_FC;
    const { ovPositions, ovMeridianLng, ovEps, prefix, isCyclo } = overlayFrame;
    const effCoordSystem: CoordSystem =
      lineSystem === 'geodetic' ? 'zodiaco' : coordSystem;
    const vis = ovPositions.filter((p) => visiblePlanets.has(p.name));
    const features: Feature<LineString, AngleOverlayLineProps>[] = [];
    if (effShowAspectLines) {
      features.push(
        ...generateAspectLines(vis, ovMeridianLng, effCoordSystem, ovEps, lineOpts).features.filter(
          (f) =>
            aspectLinePasses(
              effAspectLineFilters,
              f.properties.aspect,
              f.properties.lineType,
            ),
        ),
      );
    }
    if (effShowMidpointLines && !overlayAuxBlocked(overlayMode, 'midpoint')) {
      features.push(
        ...generateMidpointLines(vis, ovMeridianLng, effCoordSystem, ovEps, lineOpts).features,
      );
    }
    const fc: FeatureCollection<LineString, AngleOverlayLineProps> = {
      type: 'FeatureCollection',
      features: features.filter((f) => visibleLineTypes.has(f.properties.lineType)),
    };
    return withThemeLineColors(
      isCyclo ? tagLabelsBy(fc, (p) => cycloBodyTag(p.planet)) : tagLabels(fc, prefix),
      theme,
    );
  }, [
    overlayFrame,
    overlayAux,
    overlayMode,
    effShowAspectLines,
    effShowMidpointLines,
    effAspectLineFilters,
    lineSystem,
    coordSystem,
    visiblePlanets,
    visibleLineTypes,
    theme,
    lineOpts,
  ]);

  // The overlay frame's fixed-star lines — star positions precessed to the overlay's
  // own epoch (the natal set uses the natal epoch). Replaces the natal star lines
  // while an overlay is active. Cyclocartography reads its bodies at the transit
  // instant, so its stars carry the 'Tr' epoch tag.
  const overlayStarLines = useMemo(() => {
    if (!overlayFrame || !overlayAux || !effShowStarLines) return EMPTY_FC;
    const { ovMeridianLng, ovEps, prefix, isCyclo, jd: ovJd } = overlayFrame;
    return tagLabels(
      generateStarLines(
        starsOfDate(ovJd, starSet),
        ovMeridianLng,
        lineSystem === 'geodetic' ? ovEps : null,
        STAR_LINE_COLORS[theme],
      ),
      isCyclo ? 'Tr' : prefix,
    );
  }, [overlayFrame, overlayAux, effShowStarLines, starSet, lineSystem, theme]);

  const overlay = useMemo<OverlayData | null>(() => {
    if (!overlayLayer) return null;
    const prefix = OVERLAY_LABEL_PREFIX[overlayLayer.kind];
    // CCG names each feature's actual source — Sp on the progressed personal
    // planets, Tr on the transiting outers — instead of one mode tag. (It draws no
    // parans or midpoint lines: its two epochs share no single sky-moment.)
    const isCyclo = overlayLayer.kind === 'cyclo';
    const ovPositions =
      lineSystem === 'geodetic' || coordSystem === 'zodiaco'
        ? projectOntoEcliptic(overlayLayer.positions, overlayLayer.jd)
        : overlayLayer.positions;
    // ε once per memo, not once per traced vertex (the old closure called Swiss's
    // obliquity inside the mapping). Same value, same float (2026-10-02).
    const ovEps = obliquity(overlayLayer.jd);
    const ovMeridianLng: MeridianLng = meridianLngFor(lineSystem, ovEps, overlayLayer.gmst);
    return {
      lines: mergeNodePairs(
        withThemeLineColors(
          filterLines(
            isCyclo
              ? tagLabelsBy(generateLines(ovPositions, ovMeridianLng, lineOpts), (p) =>
                  cycloBodyTag(p.planet),
                )
              : tagLabels(generateLines(ovPositions, ovMeridianLng, lineOpts), prefix),
            visiblePlanets,
            visibleLineTypes,
          ),
          theme,
        ),
      ),
      // A time overlay draws no parans of its own (Cyclo has no single sky-moment; the
      // rest no paran reading) — see overlayAuxBlocked. Synastry's and an eclipse's stay.
      parans: effShowParans && !overlayAuxBlocked(overlayLayer.kind, 'paran')
        ? mergeNodeParans(
            filterParans(
              tagLabels(generateParans(ovPositions, ovMeridianLng), prefix),
              visiblePlanets,
            ),
            visiblePlanets,
          )
        : EMPTY_FC,
      localSpace: lsActive
        ? withThemeLineColors(
            filterLocalSpace(
              generateLocalSpace(
                overlayLayer.positions, // true-sky, never ecliptic-projected (Q3a)
                overlayLayer.gmst,
                overlayLayer.originLat,
                overlayLayer.originLng,
              ),
              visiblePlanets,
              hideLsInbound,
            ),
            theme,
          )
        : EMPTY_FC,
      // Zenith points for the overlay bodies. When the (shared) Zeniths/Nadirs toggle is
      // on these are drawn as stamps AND each overlay label flies to its zenith on click
      // (same MC gating as natal). When off we feed no points: the stamps vanish and,
      // with no fly target, the overlay labels become non-clickable.
      zenith: effShowZenith
        ? tagZeniths(
            withThemeLineColors(
              filterZenith(
                generateZenithStamps(ovPositions, ovMeridianLng),
                visiblePlanets,
                visibleLineTypes,
              ),
              theme,
            ),
            isCyclo ? cycloBodyTag : prefix,
          )
        : EMPTY_FC,
      // The antipodal nadir stamps — antipodes of the overlay zeniths, filtered to the
      // IC line (so they follow the IC toggle, as natal nadirs do). Same overlay
      // Zeniths/Nadirs gate as the zeniths above.
      nadir: effShowZenith
        ? tagZeniths(
            withThemeLineColors(
              filterZenith(
                antipodeStamps(generateZenithStamps(ovPositions, ovMeridianLng)),
                visiblePlanets,
                visibleLineTypes,
                'IC',
              ),
              theme,
            ),
            isCyclo ? cycloBodyTag : prefix,
          )
        : EMPTY_FC,
      // The overlay's ecliptic (zodiac) line — a dotted yellow companion to the natal
      // ecliptic, threading through the overlay Sun's zenith. Shown only when the
      // overlay zeniths are (same gate), since it's the zenith stamps' reference curve.
      ecliptic: effShowZenith
        ? generateEcliptic(overlayLayer.jd, ovMeridianLng)
        : EMPTY_FC,
    };
  }, [overlayLayer, visiblePlanets, visibleLineTypes, effShowParans, lsActive, hideLsInbound, effShowZenith, coordSystem, lineSystem, theme, lineOpts]);

  // The overlay layer as it reaches the MAP (and the plugin context). For every mode
  // it's just `overlay`, EXCEPT the eclipses mode, where the eclipse-time lines are
  // withheld from the map unless showEclipseMapLines is on (off by default, opt-in —
  // see the showEclipseMapLines state + the `astro:cheat` seam above). The wheel's
  // overlay ring is unaffected — it reads overlayLayer directly — so the eclipse chart
  // still shows in the wheel, just never on the map. Withheld from the plugin context
  // too, so a plugin can't act on lines no one can see.
  //
  // The catalog bodies' lines and coins ride in the same bundle, so every gate on it —
  // the eclipse opt-in here, the promoted swap (effMapOverlay), the spotlight
  // (spotMapOverlay) — takes them with the planets'. Joined here rather than built in the
  // memo above, so a catalog file landing doesn't regenerate the planets' lines.
  const overlayWithMinor = useMemo<OverlayData | null>(
    () =>
      overlay && overlayMinor
        ? {
            ...overlay,
            minorLines: overlayMinor.lines,
            minorZenith: overlayMinor.zenith,
            minorParans: overlayMinorParans,
          }
        : overlay,
    [overlay, overlayMinor, overlayMinorParans],
  );
  const mapOverlay =
    overlayMode === 'eclipses' && !showEclipseMapLines ? null : overlayWithMinor;

  // Overlay planets in ecliptic coords for the bi-wheel. (For solar-arc the
  // speed/retrograde sampling is meaningless, but the wheel only reads `lon`.)
  const overlayEcliptic = useMemo(
    () =>
      overlayLayer
        ? toEclipticPositions(overlayLayer.positions, overlayLayer.jd)
        : null,
    [overlayLayer],
  );

  // Overlay ▸ Display ▸ Natal off, with a time overlay active → promote the overlay
  // to stand in for the natal chart. (Only the time overlays expose the Display
  // section that holds this toggle, so it can always be switched back; synastry and
  // "no overlay" leave the natal chart alone.)
  const isTimeOverlay = TIME_OVERLAY_MODES.has(overlayMode);
  const promoteOverlay = isTimeOverlay && !!overlayLayer && !showNatal;
  // Eclipses ▸ Display ▸ Other Lines: unlike the time overlays' Natal toggle
  // (which promotes the overlay to stand in for the chart), turning this off simply
  // clears every OTHER line off the map — the chart's angle lines, derived
  // aspect/midpoint lines, parans, fixed stars, local space, zenith stamps, ecliptic
  // — so the eclipse path stands alone. It overrides those families' own toggles for
  // as long as it is off. The wheel and readouts keep the natal chart.
  const eclipseSolo = overlayMode === 'eclipses' && !showEclipseOtherLines;
  // Advanced ▸ Lines ▸ Natal Lines. A DRAW-time hide: the lines are still generated,
  // still measured, and still handed to every panel through the extension context —
  // only the map stops drawing them. That is the difference from eclipseSolo above,
  // and it is deliberate: this switch exists to quiet the map while somebody reads one
  // thing, and a reader who has quieted the map has not stopped asking questions of it.
  //
  // MASKED while Advanced is off, never rewritten — the same shape as effShowParans
  // and its neighbours. That is also what keeps it clear of the showSkyTimes trap: a
  // downstream plan change writes astro:advanced:v1 directly without ever reaching
  // setAdvancedMode, and this derivation brings the lines back on its own, with no
  // cleanup to run and nothing left hidden behind a control that has gone.
  //
  // `!promoteOverlay` because a promoted overlay is NOT the natal chart: with the
  // drawer's Natal Chart eye off, the primary slot carries the overlay's own lines,
  // and putting down the natal set must not take those with it. The boolean rather
  // than the `promoted` memo it gates — which is built further down and is null on
  // exactly this condition — because this has to be readable up here, where orbBands
  // already reaches it.
  const hideNatalAngles = advancedWheel && !showNatalLines && !promoteOverlay;

  // Per-row status of the reader's catalog bodies — derived here, once the overlay is
  // known, with the draw gates known at this point folded in by minorChartContext: no
  // birth time and the Angles filter for the chart's lines; for an overlay, whether its
  // lines reach the map beside the chart's (the row's `overlay` side, present only then),
  // or whether it stands in for the chart (promoted: the overlay's set IS the chart's).
  // The natal-lines gates are resolved further down the pipeline and applied there
  // (minorRowsEff / minorRowsDrawn), so a row never reads 'shown' over a map with none of
  // its lines.
  //
  // Keyed on the overlay's placed SET and its mode, not on the layer: during playback the
  // layer is new every tick while the set almost never changes, and the window's rows
  // (and every panel reading them) then hold still.
  const overlayMinorKind = overlayLayer?.kind ?? null;
  const overlayMinorSet = overlayMinorSampled.map((s) => s.n).join(',');
  const overlayOnMap = mapOverlay !== null;
  const minorRows = useMemo(
    () =>
      deriveMinorRows(
        minorPref,
        minorLoadState,
        minorChartContext({
          advanced: advancedWheel,
          none: !current,
          // Whatever sampled where the lines are drawn — minorPositions itself when not
          // sliding (the same array), the slid instant's sample while sliding.
          chartSampled: new Set(minorSlidPositions.map((p) => p.n)),
          overlay: overlayMinorKind
            ? {
                sampled: new Set(overlayMinorSet ? overlayMinorSet.split(',').map(Number) : []),
                mode: overlayMinorKind,
              }
            : null,
          promoted: promoteOverlay,
          overlayOnMap,
          // The same no-birth-time rule as the lines (minorLinePositions): a geodetic map
          // draws them, so a row there says what the lines say. (2026-10-02)
          noTime: noTime && !timelessGeodetic,
          anglesOff: minorAnglesOff,
        }),
      ),
    // minorLoadVer: a file landing or failing changes a row (minorLoadState is a reader).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      minorPref,
      advancedWheel,
      current,
      minorSlidPositions,
      minorLoadVer,
      overlayMinorKind,
      overlayMinorSet,
      promoteOverlay,
      overlayOnMap,
      noTime,
      timelessGeodetic,
      minorAnglesOff,
    ],
  );

  // Orb-of-influence zones (Filters ▸ Orb Zones): bands around whatever line set
  // the map is actually drawing (natal, or the promoted overlay standing in for
  // it), so the zones always shadow the visible lines. The showOrbZones toggle is
  // declared up top with the other hotkey-driven settings; its widths live here.
  // The line-orb width is entered in the user's chosen unit (km or mi); the map needs km, so
  // `orbZoneKm` below converts. Switching the unit re-expresses the width (convert + snap to the
  // 25 grid), so 325 km ↔ 200 mi reads as the same band.
  const [orbZoneUnit, setOrbZoneUnit] = useState<DistanceUnit>(loadOrbZoneUnit);
  const [orbZoneVal, setOrbZoneVal] = useState(() => loadOrbZoneVal(loadOrbZoneUnit()));
  const orbZoneKm = orbZoneUnit === 'mi' ? orbZoneVal * KM_PER_MI : orbZoneVal;
  // The paran orb shares the line orb's unit toggle: it's also a distance, converted to km
  // here (then to a latitude band in generateOrbBands). Switching the unit re-expresses both.
  const [paranOrbVal, setParanOrbVal] = useState(() => loadParanOrbVal(loadOrbZoneUnit()));
  const paranOrbKm = orbZoneUnit === 'mi' ? paranOrbVal * KM_PER_MI : paranOrbVal;
  const changeOrbZoneUnit = useCallback((next: DistanceUnit) => {
    setOrbZoneVal((v) => convertOrbZoneVal(v, orbZoneUnit, next));
    setParanOrbVal((v) => convertParanOrbVal(v, orbZoneUnit, next));
    setOrbZoneUnit(next);
  }, [orbZoneUnit]);
  useEffect(() => saveShowOrbZones(showOrbZones), [showOrbZones]);
  useEffect(() => saveOrbZoneUnit(orbZoneUnit), [orbZoneUnit]);
  useEffect(() => saveOrbZoneVal(orbZoneVal), [orbZoneVal]);
  useEffect(() => saveParanOrbVal(paranOrbVal), [paranOrbVal]);

  // Per-aspect orb limits (Advanced ▸ Aspect orbs) for the wheel's aspect
  // grid, aspect lines, and cross-aspect lists.
  const [aspectOrbs, setAspectOrbs] = useState(loadAspectOrbs);
  useEffect(() => saveAspectOrbs(aspectOrbs), [aspectOrbs]);
  // Reset to the default orbs while Advanced is off (the wheel's aspect chords +
  // grid read these); the raw value is preserved for restore.
  const effAspectOrbs = advancedWheel ? aspectOrbs : DEFAULT_ASPECT_ORBS;

  // The promoted dataset: the overlay's bodies run through the SAME generators and
  // filters as the natal chart, so the map's natal rendering path draws them solid and
  // interactive, exactly as if they were the natal chart. They KEEP the overlay tag
  // (e.g. "Tr") on their labels so the user isn't misled into reading them as the
  // entered birth chart (and as a reminder the toggle is on); the zenith stamps +
  // ecliptic still follow the Zenith toggle. Null unless promoting.
  const promoted = useMemo(() => {
    if (!promoteOverlay || !overlayLayer) return null;
    const prefix = OVERLAY_LABEL_PREFIX[overlayLayer.kind];
    const ovPositions =
      lineSystem === 'geodetic' || coordSystem === 'zodiaco'
        ? projectOntoEcliptic(overlayLayer.positions, overlayLayer.jd)
        : overlayLayer.positions;
    // ε hoisted once per memo, as in the overlay memo above (2026-10-02).
    const ovEps = obliquity(overlayLayer.jd);
    const ovMeridianLng: MeridianLng = meridianLngFor(lineSystem, ovEps, overlayLayer.gmst);
    // Promoted CCG keeps the per-body source tags (see the overlay memo above).
    const isCyclo = overlayLayer.kind === 'cyclo';
    const pLines = mergeNodePairs(
      withThemeLineColors(
        filterLines(
          isCyclo
            ? tagLabelsBy(generateLines(ovPositions, ovMeridianLng, lineOpts), (p) =>
                cycloBodyTag(p.planet),
              )
            : tagLabels(generateLines(ovPositions, ovMeridianLng, lineOpts), prefix),
          visiblePlanets,
          visibleLineTypes,
        ),
        theme,
      ),
    );
    const pLocalSpace = lsActive
      ? withThemeLineColors(
          filterLocalSpace(
            generateLocalSpace(
              overlayLayer.positions, // true-sky, never ecliptic-projected (Q3a)
              overlayLayer.gmst,
              overlayLayer.originLat,
              overlayLayer.originLng,
            ),
            visiblePlanets,
            hideLsInbound,
          ),
          theme,
        )
      : EMPTY_FC;
    return {
      lines: pLines,
      // Parans suppressed under Cyclocartography (see the overlay memo above).
      parans: effShowParans && !overlayAuxBlocked(overlayLayer.kind, 'paran')
        ? mergeNodeParans(
            filterParans(
              tagLabels(generateParans(ovPositions, ovMeridianLng), prefix),
              visiblePlanets,
            ),
            visiblePlanets,
          )
        : EMPTY_FC,
      localSpace: pLocalSpace,
      localSpaceCross: lsActive
        ? generateLocalSpaceCrossings(pLocalSpace, pLines)
        : EMPTY_FC,
      // Zeniths + ecliptic follow the Zenith toggle here too, so it still has an effect
      // while Natal is hidden: empty when off → the stamps/line vanish and the promoted
      // labels lose their fly target, just like a normal overlay with Zenith off.
      zenith: effShowZenith
        ? tagZeniths(
            withThemeLineColors(
              filterZenith(
                generateZenithStamps(ovPositions, ovMeridianLng),
                visiblePlanets,
                visibleLineTypes,
              ),
              theme,
            ),
            isCyclo ? cycloBodyTag : prefix,
          )
        : EMPTY_FC,
      eclipticLine: effShowZenith
        ? generateEcliptic(overlayLayer.jd, ovMeridianLng)
        : EMPTY_FC,
      origin: { lat: overlayLayer.originLat, lng: overlayLayer.originLng } as Point,
    };
  }, [
    promoteOverlay,
    overlayLayer,
    visiblePlanets,
    visibleLineTypes,
    effShowParans,
    lsActive,
    hideLsInbound,
    effShowZenith,
    coordSystem,
    lineSystem,
    theme,
    lineOpts,
  ]);

  // The nadir stamps fed to the map: the natal nadirs, or — when an overlay is
  // promoted to BE the chart — the antipodes of that promoted chart's zeniths.
  const mapNadir = useMemo(
    () => (promoted ? antipodeStamps(promoted.zenith) : nadir),
    [promoted, nadir],
  );

  // The chart's parans as they reach everything but the map's own drawing: gone under the
  // eclipse clean-up, the overlay's own while it is promoted (it IS the chart then), and
  // otherwise the chart's — with an overlay up too, since 2026-10-06, when parans left the
  // one-frame rule (see overlayAux). A synastry partner's or an eclipse's own rows ride
  // beside them in the overlay's bundle (effOverlayParans); a time overlay has none. Resolved here rather than with the other eff* families further down
  // because the orb bands below need it.
  const effParans = eclipseSolo ? EMPTY_FC : promoted ? promoted.parans : parans;
  // The DRAW-only twin, for Advanced ▸ Lines ▸ Natal Lines — effLines/drawLines' split, and
  // for the same reason: a panel keeps reading what the map has stopped drawing. Only beside
  // an overlay — ANY overlay, Eclipses included (overlayLayer, not overlayAux), so the rule
  // has no exception to explain: there the switch is how a reader puts the chart's rows down
  // to read the overlay's alone, as it already did for the angle lines. With no overlay the
  // chart's parans stay with their own toggle, as before — hiding the natal lines on a plain
  // chart never took them, and nothing about this change asks it to.
  const drawParans = overlayLayer && hideNatalAngles ? EMPTY_FC : effParans;

  const orbBands = useMemo(() => {
    if (!effShowOrbZones) return null;
    // A band is a corridor around a LINE, so it goes when its line does — an empty
    // halo hugging nothing reads as a rendering fault. The paran bands follow the
    // DRAWN rows (drawParans), for the same reason. Until 2026-10-06 they were built from
    // the chart's parans while the one-frame rule hid those rows under an overlay, so a
    // transit map carried shaded bands around rows nobody could see.
    const bandLines =
      eclipseSolo || hideNatalAngles ? EMPTY_FC : promoted ? promoted.lines : lines;
    return generateOrbBands(bandLines, drawParans, orbZoneKm, paranOrbKm);
  }, [effShowOrbZones, eclipseSolo, hideNatalAngles, promoted, lines, drawParans, orbZoneKm, paranOrbKm]);

  const activePoint = pinned ?? hover;
  const isNatalPin =
    !!pinned &&
    !!current &&
    Math.abs(pinned.lat - current.birthplace.lat) < 0.001 &&
    Math.abs(pinned.lng - current.birthplace.lng) < 0.001;
  // The chart's home place, and whether the placed pin is standing on it — same
  // tolerance as the natal test above, and for the same reason: these coordinates
  // come from the same place searches and so match exactly or not at all, but one
  // that has been through storage and back deserves the epsilon.
  const chartHome = current?.home ?? null;
  const isHomePin =
    !!pinned &&
    !!chartHome &&
    Math.abs(pinned.lat - chartHome.lat) < 0.001 &&
    Math.abs(pinned.lng - chartHome.lng) < 0.001;
  // The standing home marker Map draws. Withheld while the pin is on the spot:
  // the pin wears home's colour there instead (pinType below), because two
  // teardrops on one coordinate is exactly the confusion this marker family
  // spends its colours avoiding. Discreet mode blanks the LABEL and not the
  // marker — where someone lives is what the mode is for, but a chart's own map
  // is not where you hide their home from them; the tip's title still says Home.
  //
  // MEMOIZED, and it has to be: Map's marker effect keys on this object, and its
  // cleanup tears down the hover tip. A fresh object per render would rebuild the
  // listeners — and blank the tip — on every mouse move across the map, since the
  // hover readout re-renders App continuously. Every input here is stable between
  // real changes (`current` is a stable reference, so `current.home` is too, and
  // `identity` is one of two module constants).
  const homeMark = useMemo(
    () =>
      chartHome && !isHomePin
        ? { lat: chartHome.lat, lng: chartHome.lng, label: identity.text(chartHome.label) }
        : null,
    [chartHome, isHomePin, identity],
  );
  // Reference point for the line-card "Distance from …" row: the placed custom pin if there
  // is one, otherwise the natal birthplace (the default). Map reads it per line-click.
  const distanceRef: { lat: number; lng: number; type: 'pin' | 'natal' } | null = current
    ? pinned && !isNatalPin
      ? { lat: pinned.lat, lng: pinned.lng, type: 'pin' }
      : { lat: current.birthplace.lat, lng: current.birthplace.lng, type: 'natal' }
    : null;
  const coordSource = isNatalPin
    ? 'natal-pinned'
    : pinned
      ? 'pinned'
      : activePoint
        ? 'hover'
        : 'natal';

  // Top-nav location readout — place names only (coordinates live in the optional
  // CoordReadout, top-left). Everything here resolves OFFLINE from the bundled
  // GeoNames data; the network geocoder is only ever touched for a PINNED point,
  // and only at detail zoom (see useReverseGeocode):
  //  • NON-NATAL PIN → keeps the label you were hovering (the click lands on it, and
  //    hover stays frozen there, so it's usually identical), then the pin's own
  //    offline "City, Region, Country" fades in if it differs — and, zoomed in, the
  //    boundary-accurate network name fades in after that, on the points where the
  //    nearest-centroid atlas named the wrong side of a town line (or where no city
  //    was in range at all). `fadeLocation` gates the fade. No country-name flash
  //    between.
  //  • NATAL PIN → the birthplace we already know (no fetch, no fade).
  //  • NATAL (gray) → nothing here; the "NATAL" status pill already shows it.
  //  • HOVER → the offline nearest CITY (no network), falling back to the offline
  //    country when no city is in range, then "Ocean" over open water; real-time.
  //  The top-nav readout is suppressed while a map tool is active (see `locationLabel`),
  //  but the pin's own reverse-geocode keeps resolving so the Coordinates window can
  //  still name a placed pin mid-measure.
  const pinnedLabel = useReverseGeocode(isNatalPin ? null : pinned, detailZoom);
  const hoverCity = useNearestCityLabel(mapTool === 'measure' ? null : hover);
  const hoverCountry = useCountryOf(hover);
  // The sky band's place label while follow-the-cursor is on: the offline
  // nearest city, falling back to the country, then "Ocean" — the hover
  // readout's chain, but on the band's own (throttled / held) point.
  const skyFollowCity = useNearestCityLabel(skyFollowPoint);
  const skyFollowCountry = useCountryOf(skyFollowPoint);
  // Once pinned, hover stays frozen on the clicked point (onHover/onLeave are gated
  // on !pinned), so this hovered-point label doubles as the pin's placeholder while
  // the reverse-geocode loads.
  // Over water there's no city and no country, so fall back to a plain "Ocean".
  // Any active map tool (measure OR slide) suppresses the location readout: in a
  // tool mode the cursor serves the tool, so the place under it isn't meaningful.
  const inToolMode = mapTool !== 'off';
  const hoverLabel =
    inToolMode || !hover
      ? null
      : (hoverCity ?? hoverCountry ?? t('common.locationFallbackOcean'));
  const locationLabel =
    inToolMode
      ? null
      : pinned
        ? isNatalPin
          ? // The natal pin's label IS the birthplace, so discreet mode blanks it
            // here the same way it blanks it in the sidebar and the corner readout.
            // Every other branch names wherever the cursor or a custom pin is —
            // a place the user chose to look at, not birth data — and reads on.
            (current ? identity.text(current.birthplace.label) : null)
          : (pinnedLabel ?? hoverLabel)
        : hoverLabel;
  // Fade the readout text only when a non-natal pin's reverse-geocode RESOLVES to a
  // place that differs from the label already on screen (the frozen hover label). If
  // the pin lands on the same text the cursor was already showing, nothing changes,
  // so we skip the fade and let it stay put.
  const fadeLocation =
    !inToolMode && !!pinned && !isNatalPin && pinnedLabel != null && pinnedLabel !== hoverLabel;
  // The Coordinates window names the active POINT — and unlike the top-nav readout it must
  // keep naming a placed PIN even while a map tool (measure / slide) is active: the window
  // names the fixed pin, not the cursor, so tool mode doesn't make it meaningless. A natal
  // pin uses the birthplace; a custom pin its reverse-geocoded label (frozen hover label as a
  // load-time placeholder). With no pin it follows the tool-suppressed hover readout, falling
  // back to the birthplace in the plain natal state.
  const coordLocation = isNatalPin
    ? (current?.birthplace.label ?? null)
    : pinned
      ? (pinnedLabel ?? hoverLabel)
      : (locationLabel ?? (coordSource === 'natal' ? (current?.birthplace.label ?? null) : null));

  // ── Capture caption ────────────────────────────────────────────────────────
  // Declared HERE, below the pin state, because the caption names the place the
  // captured chart is actually cast for — which a placed pin relocates.
  //
  // The place the caption speaks for. A pin relocates the chart, and the captured
  // wheel is drawn for the relocated angles, so a caption still naming the
  // birthplace would caption a chart that isn't in the image. A natal pin (or no
  // pin) IS the birthplace, so both collapse to the same thing.
  //
  // Follows the PIN only, never `hover` — even though the wheel's own activePoint is
  // `pinned ?? hover`. Two reasons, and the second is what makes this exact rather
  // than merely reasonable:
  //   • A caption is a fixed statement about an exported image; it must not rewrite
  //     itself as the cursor drifts across the map.
  //   • At the moment of export it CANNOT disagree with the wheel anyway. Reaching
  //     the export control means leaving the map canvas, which fires onLeave →
  //     setHover(null) (hover is only held frozen while a pin is placed), so by the
  //     time the image is taken activePoint has collapsed to exactly `pinned`.
  const captionPlace = useMemo(() => {
    if (!current) return null;
    if (pinned && !isNatalPin) {
      return {
        // pinnedLabel keeps resolving under a map tool (that's why the Coordinates
        // window can still name a pin mid-measure), so it is available during a
        // capture; hoverLabel is the frozen stand-in until it lands, and the raw
        // coordinates are the last resort so the field is never blank.
        label: pinnedLabel ?? hoverLabel ?? `${fmtLat(pinned.lat)} ${fmtLng(pinned.lng)}`,
        lat: pinned.lat,
        lng: pinned.lng,
        relocated: true,
      };
    }
    return {
      label: current.birthplace.label,
      lat: current.birthplace.lat,
      lng: current.birthplace.lng,
      relocated: false,
    };
  }, [current, pinned, isNatalPin, pinnedLabel, hoverLabel]);

  // The formatted value of every caption field, computed once. The caption joins the
  // ENABLED ones (below) and the download filename reuses the same values, so the two can
  // never drift. Date/time are formatted in UTC so the birth clock time isn't shifted by
  // the viewer's zone. Null with no chart.
  const captureFields = useMemo(() => {
    if (!current || !captionPlace) return null;
    const dt = new Date(
      Date.UTC(current.year, current.month - 1, current.day, current.hour, current.minute),
    );
    // Discreet mode blanks the caption too — in the PREVIEW and in the exported
    // image alike, because they are one and the same DOM (the export rasterises
    // this very band). Masking only the preview would hand back a file that says
    // more than the screen did, which is the one outcome worse than not masking
    // at all: what you see is what leaves the device. The place fields follow the
    // same rule as everywhere else — blanked while they name the birthplace, kept
    // when a pin has relocated the caption to somewhere the user chose.
    const blankPlace = identity.on && !captionPlace.relocated;
    const place = blankPlace ? identity.text : (v: string) => v;
    return {
      name: identity.on
        ? identity.name(current.name)
        : displayName(current.name),
      date: identity.date(
        new Intl.DateTimeFormat('en', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(dt),
      ),
      time: identity.time(
        new Intl.DateTimeFormat('en', {
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
          timeZone: 'UTC',
        }).format(dt),
      ),
      // The birth-moment UTC offset (DST-aware), shown next to the time in the caption.
      // Stays the BIRTH offset even when relocated: the date and time are the birth
      // moment, and that moment's clock reading doesn't change by looking from
      // elsewhere. Only the place fields below follow the pin. Blanked, it drops out
      // entirely rather than becoming a second run of dots after the blanked time —
      // one mask per fact reads as hidden, two reads as broken.
      tzLabel: identity.on ? '' : formatUtcOffset(current.tzOffset),
      location: place(captionPlace.label),
      // The captioned place's full latitude + longitude (DMS, same format as the
      // corner readout).
      coordinates: place(`${fmtLat(captionPlace.lat)} ${fmtLng(captionPlace.lng)}`),
      calculations: captureCalcText,
    };
  }, [current, captionPlace, captureCalcText, identity]);
  // Caption fields — only the enabled ones, in display order. The footer joins them into one
  // line; the Transparent export stacks them one-per-line in the frame's top-left. Empty with no
  // chart or no fields enabled (the footer then reserves no band, the top-left renders nothing).
  const captureCaptionLines = useMemo(() => {
    if (!captureFields) return [] as string[];
    return (['name', 'date', 'time', 'location', 'coordinates', 'calculations'] as const)
      .filter((k) => captureCaptionFields[k])
      // The time field carries its UTC offset alongside it (e.g. "09:30 UTC-04:00"); every
      // other field renders as-is. The offset is appended only here, so the filename — which
      // reads the bare value from captureFields — never picks it up.
      .map((k) =>
        k === 'time' && captureFields.tzLabel
          ? `${captureFields.time} ${captureFields.tzLabel}`
          : captureFields[k],
      );
  }, [captureFields, captureCaptionFields]);
  // Which of those lines the band keeps whole when a caption still overflows at two lines: the
  // coordinates, whose promise is the full figure (a longitude cut short reads as another place,
  // where a place name cut short still names the place). Same key order and filter as above, so
  // the index points at the same line; null when the field is off.
  const captureCaptionKeep = useMemo(() => {
    if (!captureFields) return null;
    const i = (['name', 'date', 'time', 'location', 'coordinates', 'calculations'] as const)
      .filter((k) => captureCaptionFields[k])
      .indexOf('coordinates');
    return i < 0 ? null : i;
  }, [captureFields, captureCaptionFields]);
  // The footer's single-line form: the enabled fields joined.
  const captureCaptionText = useMemo(
    () => captureCaptionLines.join('  ·  '),
    [captureCaptionLines],
  );
  // Download / share filename: track the FIRST shown caption field, walking the priority
  // order name → date → time → location (calculations is intentionally skipped — too verbose
  // for a filename). Keep walking past any field that slugs to nothing (e.g. a non-Latin
  // name); if none of the four are shown or yield a usable slug, use a generic name.
  //
  // A blanked field slugs to nothing and is walked past for free — except the NAME,
  // whose mask keeps initials so the chart list stays navigable. "L•••• G•••••"
  // would slug to "l-g", so discreet mode skips that field outright: initials are
  // the one thing this mode keeps on screen and the last thing it should write into
  // a filename, which outlives the screen and travels with the file.
  const captureFileName = useMemo(() => {
    let slug = '';
    if (captureFields) {
      for (const k of ['name', 'date', 'time', 'location'] as const) {
        if (!captureCaptionFields[k]) continue;
        if (k === 'name' && identity.on) continue;
        slug = captureFields[k]
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        if (slug) break;
      }
    }
    return `astrolina-${slug || 'capture'}.png`;
  }, [captureFields, captureCaptionFields, identity]);

  // Publish the pin state to <html> so the single --map-accent source (index.css)
  // recolors the map chrome, and resolve that accent to a concrete color for the
  // WebGL measure layers. Re-resolves on theme change too (the palette differs).
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-mapstate', coordSource);
    const resolved = getComputedStyle(root).getPropertyValue('--map-accent').trim();
    // Reading the resolved CSS variable needs the committed DOM, so this color
    // can't be derived during render — the effect + setState is the correct tool.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (resolved) setMeasureColor(resolved);
  }, [coordSource, theme]);

  // While the Capture frame is armed, flag the root so the floating HUD panels can go opaque
  // (see Map.css). Otherwise the frame's viewfinder scrim — a dim OUTSIDE the frame — bleeds
  // through the panels' frosted backdrop, reading as a fixed dark rectangle wherever a panel
  // overlaps the frame edge.
  useEffect(() => {
    const root = document.documentElement;
    if (mapTool === 'capture') root.setAttribute('data-capturing', '1');
    else root.removeAttribute('data-capturing');
    return () => root.removeAttribute('data-capturing');
  }, [mapTool]);

  // A composite's wheel angles are independent shorter-arc midpoints of the two
  // parents' own angles/cusps (à la Robert Hand) — so BOTH the Ascendant and the
  // Midheaven read as the exact midpoint, which the single MC-anchored map frame
  // can't do. They don't relocate (a midpoint construct has no frame to move), so
  // a composite ignores the active pin here; the MAP lines still follow jd/gmst.
  // With the birth time unknown both stay null — houses and angles are functions of
  // the exact minute, and every consumer (readouts, wheel, tables, eclipse radix,
  // capture extras) already has a null path. (Celestial only, for `angles`: on a
  // geodetic map it is the place's frame, which no birth minute enters — below.)
  const birthAngles = useMemo(
    () =>
      current && !noTime
        ? current.composite
          ? compositeAngles(current.composite, effHouseSystem)
          : relocate(jd, current.birthplace.lat, current.birthplace.lng, effHouseSystem)
        : null,
    [jd, current, noTime, effHouseSystem],
  );
  // On a geodetic map the chart is drawn inside a PLACE's own angles (geodeticFrame):
  // the pin, else the hover, else the chart's own place — composites included, since
  // on such a map there is one frame and it is the place's, not the chart's. No
  // birth-time check either, and deliberately: the angles come from the coordinates,
  // not the minute, so a chart with no birth time sits inside them like any other.
  // The planets stay the chart's own; only the frame they sit in belongs to the place.
  // birthAngles above stays the CELESTIAL radix on purpose — it is the eclipse
  // contacts' birth chart, which a map setting must not move. (2026-10-02)
  const angles = useMemo(() => {
    if (lineSystem === 'geodetic') {
      if (!current) return null;
      const at = activePoint ?? current.birthplace;
      return geodeticFrame(jd, at.lat, at.lng, effHouseSystem);
    }
    return activePoint && current && !current.composite && !noTime
      ? relocate(jd, activePoint.lat, activePoint.lng, effHouseSystem)
      : birthAngles;
  }, [lineSystem, jd, activePoint, current, noTime, birthAngles, effHouseSystem]);
  // Where the eclipse degree strikes the natal chart (conj/square/opp, 3°),
  // for the Sidebar's contacts list. Targets are the user's visible bodies
  // plus the RADIX angles — birthAngles, not the pin-relocated ones: the
  // contact doctrine reads the birth chart, and a relocated Asc would make
  // the list silently change as the pin moves. The list reads in the chart's
  // active zodiac, PER-EPOCH: the eclipse degree shifts by the ayanamsa at the
  // eclipse moment, the radix points by the ayanamsa at birth — they differ by
  // the inter-epoch precession, the same convention every other overlay uses
  // (tropical → both ayanamsas 0, so the list is byte-identical to before).
  const eclipseContactList = useMemo<EclipseContact[] | null>(() => {
    if (overlayMode !== 'eclipses' || !eclipseDetails || !resolvedEclipse || !eclipsesMod)
      return null;
    const eclipseAyan = ayanamsaRad(resolvedEclipse.event.maximum, effZodiacMode);
    const natalShift = ayanamsaRad(jd, effZodiacMode);
    const radix = birthAngles
      ? shiftAngles(birthAngles, natalShift, effHouseSystem === 'whole')
      : null;
    return eclipsesMod.eclipseContacts(
      eclipseDetails.lonRad - eclipseAyan,
      shiftEclipticPositions(
        ecliptic.filter((p) => visiblePlanets.has(p.name)),
        natalShift,
      ),
      radix ? { asc: radix.asc, mc: radix.mc } : null,
    );
  }, [
    overlayMode,
    eclipseDetails,
    resolvedEclipse,
    eclipsesMod,
    ecliptic,
    visiblePlanets,
    birthAngles,
    jd,
    effZodiacMode,
    effHouseSystem,
  ]);
  // The overlay chart's own MC/IC/AS/DS for the bi-wheel, at the same place as the natal
  // angles. Time-based overlays (transits / synastry) have a genuine second moment →
  // relocate(jd) at the active point. The directed overlays (solar-arc, primary,
  // progressed) have no such moment: their angles are the NATAL angles (angleJd, the
  // birth moment for progressed) advanced by the arc — directedAngles applies the same
  // arc + frame the map gmst uses (RAMC+arc for the …-in-RA / primary methods). See
  // docs/calculation-methods.md ("Directed-overlay angles").
  //
  // A COMPOSITE synastry partner is the exception to "relocate at the active point":
  // it takes the same midpoint angles it shows as the active chart (birthAngles
  // above), which don't relocate at all. Until 2026-09-30 it went through the
  // time-based path — relocate() at its solved frame moment — which agrees with the
  // midpoint MC only on the parents' midpoint meridian and never gives the midpoint
  // ASC, so one composite showed two different sets of angles depending on whether
  // it was the chart or the partner. (Its PLANETS were already its midpoints:
  // timeline.ts builds the synastry layer from compositeEquatorial.)
  //
  // On a geodetic map every overlay takes the place's own frame — `angles`, unchanged.
  // A place's geodetic angles don't move with time, so a transit, a progression or a
  // partner has no other set to show; the overlay still moves its PLANETS through
  // them. The bi-wheel's outer angle marks then repeat the inner ones, which is the
  // honest picture rather than a second, sky-turned frame. (2026-10-02)
  const overlayAngles = useMemo(() => {
    if (!overlayLayer || !current) return null;
    if (lineSystem === 'geodetic') return angles;
    if (overlayLayer.kind === 'synastry' && partner?.composite) {
      return compositeAngles(partner.composite, effHouseSystem);
    }
    const lat = activePoint?.lat ?? current.birthplace.lat;
    const lng = activePoint?.lng ?? current.birthplace.lng;
    const angleJd = overlayLayer.angleJd ?? overlayLayer.jd;
    const base = relocate(angleJd, lat, lng, effHouseSystem);
    return directedAngles(
      base,
      angleJd,
      lat,
      lng,
      effHouseSystem,
      overlayLayer.angleArc,
      overlayLayer.angleFrame,
    );
  }, [overlayLayer, activePoint, current, partner, effHouseSystem, lineSystem, angles]);

  // Per-body RA + azimuth/altitude for the Advanced planet table, computed for
  // the same observer location as the relocated angles (active point, else natal).
  const advancedCoords = useMemo(() => {
    // `Map` is the MapLibre component here, so lean on the helper (empty ecliptic
    // → empty result) rather than a `new Map()` literal for the no-chart case.
    const obs = activePoint ?? current?.birthplace;
    // Promoting the overlay → report the OVERLAY's bodies at the overlay's moment.
    if (promoteOverlay && overlayLayer) {
      return getHorizontalCoords(
        obs ? (overlayEcliptic ?? []) : [],
        overlayLayer.gmst,
        obliquity(overlayLayer.jd),
        obs?.lat ?? 0,
        obs?.lng ?? 0,
      );
    }
    return getHorizontalCoords(obs ? ecliptic : [], gmst, eps, obs?.lat ?? 0, obs?.lng ?? 0);
  }, [promoteOverlay, overlayLayer, overlayEcliptic, activePoint, current, ecliptic, gmst, eps]);

  // The same RA + declination + azimuth/altitude for the four chart angles (each
  // an ecliptic point), so the Advanced table can show real data instead of dashes.
  //
  // Geodetic: always the place's frame (`angles`, which a promoted overlay shares),
  // converted at the obliquity it was built with — eps, the chart's — so its RA and
  // declination are those of the very longitudes the rows print. (2026-10-02)
  const angleCoords = useMemo(() => {
    const obs = activePoint ?? current?.birthplace;
    const geo = lineSystem === 'geodetic';
    const a = promoteOverlay && !geo ? overlayAngles : angles;
    if (!a || !obs) return null;
    if (promoteOverlay && overlayLayer && !geo) {
      return getAngleCoords(a, overlayLayer.gmst, obliquity(overlayLayer.jd), obs.lat, obs.lng);
    }
    return getAngleCoords(a, gmst, eps, obs.lat, obs.lng);
  }, [promoteOverlay, overlayLayer, overlayAngles, angles, activePoint, current, gmst, eps, lineSystem]);

  // The same equatorial + horizon coordinates for the OVERLAY's bodies and
  // angles, at the overlay's own moment and the same observer, so the expanded
  // sidebar can print the overlay's positions table under the chart's.
  //
  // Only while the overlay rides ALONGSIDE the chart: promoted, it stands in for
  // the chart and advancedCoords/angleCoords above already report it — a second
  // table would be the same figures twice.
  //
  // Fed the TROPICAL overlayEcliptic for the same reason the natal pair is fed
  // tropical `ecliptic`: RA, declination and azimuth are frame-independent
  // physics, and a sidereally shifted input would corrupt them. The longitude
  // COLUMN comes from the display positions the sidebar already holds.
  const overlayAdvancedCoords = useMemo(() => {
    const obs = activePoint ?? current?.birthplace;
    if (promoteOverlay || !overlayLayer || !obs) return null;
    return getHorizontalCoords(
      overlayEcliptic ?? [],
      overlayLayer.gmst,
      obliquity(overlayLayer.jd),
      obs.lat,
      obs.lng,
    );
  }, [promoteOverlay, overlayLayer, overlayEcliptic, activePoint, current]);

  // Geodetic: overlayAngles IS `angles` (see overlayAngles), so its rows read what the
  // chart's rows read — the chart's own sidereal time and obliquity — and the two
  // tables print the same figures for the same four points. (2026-10-02)
  const overlayAngleCoords = useMemo(() => {
    const obs = activePoint ?? current?.birthplace;
    if (promoteOverlay || !overlayLayer || !overlayAngles || !obs) return null;
    if (lineSystem === 'geodetic') {
      return getAngleCoords(overlayAngles, gmst, eps, obs.lat, obs.lng);
    }
    return getAngleCoords(
      overlayAngles,
      overlayLayer.gmst,
      obliquity(overlayLayer.jd),
      obs.lat,
      obs.lng,
    );
  }, [promoteOverlay, overlayLayer, overlayAngles, activePoint, current, lineSystem, gmst, eps]);

  // Sidereal display layer (Advanced ▸ Zodiac). The map's line geometry is
  // zodiac-independent and never shifts; every WHEEL/READOUT longitude does,
  // each ring by ITS OWN epoch's ayanamsa (the sidereal frame rides the
  // stars, so the natal ring and a transit ring decades later shift by
  // slightly different amounts — standard sidereal practice). The equatorial
  // tables (advancedCoords/angleCoords) keep consuming the tropical
  // `ecliptic`/`angles` above — RA/dec/azimuth are frame-independent physics,
  // and shifted input would corrupt them — but the eclipse-contact list now
  // reads per-epoch in the active zodiac (it shifts its own inputs, above).
  const natalAyan = useMemo(() => ayanamsaRad(jd, effZodiacMode), [jd, effZodiacMode]);
  const overlayAyan = useMemo(
    () => (overlayLayer ? ayanamsaRad(overlayLayer.jd, effZodiacMode) : 0),
    [overlayLayer, effZodiacMode],
  );
  const displayEcliptic = useMemo(
    () => shiftEclipticPositions(ecliptic, natalAyan),
    [ecliptic, natalAyan],
  );
  // The WHEEL's Fortune is recomputed from the RELOCATED Ascendant (angles.asc) —
  // it moves as the map pin moves — but with the NATAL sect, so it never re-flips
  // at the sunrise line. Kept out of the shared `ecliptic` (so it stays out of the
  // Advanced equatorial table and eclipse contacts); shifted by the natal ayanamsa
  // like the rest of the ring. Plotted, not aspected (see WheelSvg `aspectable`).
  // Reads fortuneSect, not the map's fortuneDay: a timeless chart on a geodetic map has
  // a wheel Fortune but no map one (fortuneSect says why). (2026-10-02)
  const fortuneWheelPos = useMemo<EclipticPosition | null>(() => {
    if (fortuneSect == null || !angles || !current || current.composite) return null;
    const sun = ecliptic.find((p) => p.name === 'Sun');
    const moon = ecliptic.find((p) => p.name === 'Moon');
    if (!sun || !moon) return null;
    const lon = partOfFortuneLon(angles.asc, sun.lon, moon.lon, fortuneSect, effFortuneFormula);
    return shiftEclipticPositions<EclipticPosition>([{ name: 'Fortune', lon, lat: 0 }], natalAyan)[0];
  }, [fortuneSect, angles, current, ecliptic, effFortuneFormula, natalAyan]);
  const displayAngles = useMemo(
    () =>
      angles ? shiftAngles(angles, natalAyan, effHouseSystem === 'whole') : angles,
    [angles, natalAyan, effHouseSystem],
  );
  const displayOverlayEcliptic = useMemo(() => {
    if (!overlayEcliptic) return null;
    // A mixed-epoch layer (cyclo) carries per-body epochs: each progressed
    // body shifts by ITS epoch's ayanamsa, so its sidereal readout matches
    // the dedicated Progressed overlay's exactly.
    const byBody = overlayLayer?.bodyJd;
    if (byBody && effZodiacMode !== 'tropical') {
      return shiftEclipticPositionsPerBody(overlayEcliptic, (name) =>
        ayanamsaRad(byBody[name] ?? overlayLayer!.jd, effZodiacMode),
      );
    }
    return shiftEclipticPositions(overlayEcliptic, overlayAyan);
  }, [overlayEcliptic, overlayAyan, overlayLayer, effZodiacMode]);
  const displayOverlayAngles = useMemo(
    () =>
      overlayAngles
        ? shiftAngles(overlayAngles, overlayAyan, effHouseSystem === 'whole')
        : null,
    [overlayAngles, overlayAyan, effHouseSystem],
  );

  // While promoting the overlay (Natal off), the wheel + coordinate readout read the
  // overlay's own planet positions / angles as the single chart; the natal ring is
  // dropped (see the overlay* props on the wheel below, nulled when promoting).
  // EXCEPT Cyclo·cartography (CCG): it's a deliberately mixed layer (progressed personal
  // planets + transiting outers) with no single coherent chart, so we never wheel it.
  // With Natal visible we just drop its overlay ring (isCyclo on the overlay* props);
  // with Natal hidden there's nothing left to draw, so the wheel goes to an explicit
  // "NO CHART" empty state (noChart) — angles nulled here so the corners/toggles/coord
  // angles fall away with it.
  const isCyclo = overlayMode === 'cyclo';
  const noChart = promoteOverlay && isCyclo;
  // Whether the wheel's single chart IS the natal chart — ONE test, read by both the
  // planets and the catalog bodies below, so nothing natal can ride onto a wheel that
  // is standing in for another chart. False for the NO CHART state and for a promoted
  // overlay, whose bodies are another instant's: a catalog body sampled at the birth
  // moment has no place on a transit chart — the overlay's own catalog set goes there
  // instead (see wheelMinor).
  const wheelIsNatal = !noChart && !(promoteOverlay && displayOverlayEcliptic);
  // On a geodetic map the wheel's Fortune is built from the place's geodetic Ascendant
  // (fortuneWheelPos reads `angles`, which is the place's frame there), while the map's
  // Fortune line keeps the chart's own (fortuneMapPos). Two Fortunes a reader can meet
  // side by side, so the wheel's says which Ascendant it took: a line in its tip and a
  // GE tag on its row (bodyNotes). Natal wheel only, the one that carries a Fortune.
  // Keyed on whether there IS a wheel Fortune, not on its degree, so a hover moving it
  // hands the wheel the same map. (`Map` is the MapLibre component in this file, hence
  // globalThis.) (2026-10-02)
  const hasWheelFortune = fortuneWheelPos !== null;
  // With no birth time the sect is unknown too, and under the sect formula a night birth's
  // Fortune is the day one reflected across the Ascendant (partOfFortuneLon). So the span the
  // wheel prints (natalRanges) holds only for the sect taken at the 12:00 placeholder
  // (fortuneSect), and the note says which. The Ptolemaic formula is the day one at any hour,
  // and a timed chart knows its sect: both keep the plain note. (2026-10-02)
  const fortuneNoteKey =
    noTime && effFortuneFormula === 'sect'
      ? fortuneSect === false
        ? 'wheel.tip.fortuneGeodeticNight'
        : 'wheel.tip.fortuneGeodeticDay'
      : 'wheel.tip.fortuneGeodetic';
  const wheelBodyNotes = useMemo<ReadonlyMap<PlanetName, string> | null>(
    () =>
      lineSystem === 'geodetic' && hasWheelFortune && wheelIsNatal
        ? new globalThis.Map<PlanetName, string>([['Fortune', t(fortuneNoteKey)]])
        : null,
    [lineSystem, hasWheelFortune, wheelIsNatal, fortuneNoteKey, t],
  );
  // A chart with no birth time is cast for 12:00, and a body that moves far in a day is
  // printed as the span it may lie in rather than to the minute (lib/astro/timeless): the
  // Moon in either line system, and the Part of Fortune, which only a geodetic map's wheel
  // has (fortuneSect). The natal wheel's bodies only — an overlay promoted in its place has
  // a time of its own. A module constant, so the wheel and the panels get one reference.
  // (2026-10-02)
  const natalRanges = noTime && wheelIsNatal ? TIMELESS_RANGE_DEG : null;
  // Memoized so appending Fortune (a fresh array on the common natal path) doesn't
  // hand the wheel + capture memos a new reference every render.
  const wheelPlanets = useMemo(
    () =>
      wheelIsNatal
        ? fortuneWheelPos
          ? [...displayEcliptic, fortuneWheelPos]
          : displayEcliptic
        : noChart
          ? []
          : // Promoted: wheelIsNatal is false here only because this is set.
            (displayOverlayEcliptic ?? []),
    [wheelIsNatal, noChart, displayOverlayEcliptic, displayEcliptic, fortuneWheelPos],
  );
  const wheelAngles = noChart
    ? null
    : promoteOverlay && displayOverlayAngles
      ? displayOverlayAngles
      : displayAngles;
  // The Coordinates box's angles: the wheel's, except on a geodetic map with no chart
  // loaded. A place's geodetic angles need no chart, so the box still reads them for
  // the hovered or pinned point — at J2000's obliquity, the grid's own, because with
  // no chart there is no date to take one from. (2026-10-02)
  const coordAngles = useMemo(
    () =>
      lineSystem === 'geodetic' && !current && activePoint
        ? {
            ...geodeticAngles(activePoint.lng, activePoint.lat, EPS_J2000),
            geodetic: true as const,
          }
        : wheelAngles,
    [lineSystem, current, activePoint, wheelAngles],
  );
  // Discreet mode on a geodetic map: the angles are a function of the place alone (the
  // MC IS its longitude), so while they are the birthplace's — no pin and no hover, or
  // the pin standing on it — their figures are birth data and are masked wherever they
  // print, the capture card included. ONE predicate for every surface that needs it
  // (the box and the sidebar test the same two things through their own props). The
  // wheel still draws the marks and houses where they fall. The wheel's Fortune is
  // masked with them: it is built from this Ascendant (fortuneWheelPos), and beside
  // the Sun and Moon it would give the Ascendant back exactly. (2026-10-02)
  const maskGeAngleText =
    identity.on && lineSystem === 'geodetic' && (isNatalPin || !activePoint);
  // The catalog minor bodies the wheel's single chart places — every one that is wanted,
  // loaded and sampled at the chart's own moment (a composite's: its midpoints), moved into
  // the reader's zodiac by the natal ring's own ayanamsa. While a promoted overlay stands in
  // for the chart, ITS set instead — placed by the overlay's rule, moved by the overlay
  // ring's ayanamsa, as its planets are (displayOverlayEcliptic) — so the wheel and the
  // lines it now stands for read one instant. None in the NO CHART state.
  //
  // Deliberately NOT the map's drawn set. The holds that belong to a BODY apply here as
  // they do everywhere (its switch, Hide all, Advanced, a held source, a date outside its
  // file) — minorNumbers and the sample already carry them. The gates
  // that belong to the LINES do not: no birth time, the Angles filter, the natal lines
  // hidden, the eclipse clean-up. Each of those takes a body's lines off the map while
  // the body itself is still where it is, exactly as it does for the planets, whose
  // wheel set has never read a line switch either. So this must never read
  // drawMinorLines, effMinorLines, minorRowsEff, minorRowsDrawn or minorAnglesOff — a
  // wheel that followed them would lose a body every time a reader tidied the map.
  //
  // Two memos and a pick, so the natal set holds still through a playback tick that moves
  // only the overlay's.
  const natalWheelMinor = useMemo<readonly WheelMinorBody[]>(
    () =>
      wheelIsNatal && minorSamples.length > 0
        ? buildWheelMinor(minorSamples, {
            ayan: natalAyan,
            decor: minorDecor,
            t,
            list: minorPref.list,
          })
        : NO_WHEEL_MINOR,
    [wheelIsNatal, minorSamples, natalAyan, minorDecor, t, minorPref.list],
  );
  // Not natal and not NO CHART: the promoted overlay, the only other way here.
  const promotedWheelMinor = useMemo<readonly WheelMinorBody[]>(
    () =>
      !wheelIsNatal && !noChart && overlayMinorSampled.length > 0
        ? buildWheelMinor(overlayMinorSampled, {
            ayan: overlayAyan,
            decor: minorDecor,
            t,
            list: minorPref.list,
          })
        : NO_WHEEL_MINOR,
    [wheelIsNatal, noChart, overlayMinorSampled, overlayAyan, minorDecor, t, minorPref.list],
  );
  const wheelMinor = wheelIsNatal ? natalWheelMinor : promotedWheelMinor;
  // Hold the catalog ring while a wanted body's file is still on its way. A body with no
  // load state yet already reads 'loading', so the ring is held from the first paint —
  // without this the planet ring would draw, then step inward a moment later when the
  // files land. Only a REQUEST: the wheel takes the ring only where it draws one — a
  // single wheel from 600px (MINOR_RING_MIN in lib/wheelGeometry), never a bi-wheel — so
  // anywhere else this changes nothing.
  const wheelMinorReserve = wheelIsNatal && minorRows.some((r) => r.status.kind === 'loading');
  // Azimuth and altitude for the positions table's catalog rows, at the very observer
  // and sidereal time the planets' rows use (advancedCoords) — the overlay's own while a
  // promoted overlay is the chart. From the TROPICAL ra/dec each body was placed with —
  // horizon coordinates are frame-independent physics, and a zodiac-shifted input would
  // corrupt them. Null when the wheel has no catalog bodies.
  const minorCoords = useMemo(() => {
    const obs = activePoint ?? current?.birthplace;
    if (!obs || wheelMinor.length === 0) return null;
    const st = promoteOverlay && overlayLayer ? overlayLayer.gmst : gmst;
    return getMinorHorizontalCoords(wheelMinor, st, obs.lat, obs.lng);
  }, [activePoint, current, wheelMinor, gmst, promoteOverlay, overlayLayer]);
  // The same for the OVERLAY's ring, while it rides beside the chart: its catalog set,
  // placed by its rule and moved by its own ayanamsa — exactly as its planets are — for the
  // bi-wheel's overlay marks, the Dual layout's second wheel and the overlay's positions
  // table, with horizon figures at the overlay's own sidereal time (overlayAdvancedCoords'
  // observer and instant). The overlay ring's own gates and no others: none when promoted
  // (wheelMinor carries it then) and none for Cyclo, which is never wheeled.
  const overlayMinorWheel = useMemo<readonly WheelMinorBody[]>(
    () =>
      !promoteOverlay && !isCyclo && overlayMinorSampled.length > 0
        ? buildWheelMinor(overlayMinorSampled, {
            ayan: overlayAyan,
            decor: minorDecor,
            t,
            list: minorPref.list,
          })
        : NO_WHEEL_MINOR,
    [promoteOverlay, isCyclo, overlayMinorSampled, overlayAyan, minorDecor, t, minorPref.list],
  );
  const overlayMinorCoords = useMemo(() => {
    const obs = activePoint ?? current?.birthplace;
    if (!obs || !overlayLayer || overlayMinorWheel.length === 0) return null;
    return getMinorHorizontalCoords(overlayMinorWheel, overlayLayer.gmst, obs.lat, obs.lng);
  }, [activePoint, current, overlayLayer, overlayMinorWheel]);
  // Capture "Extras" rows: the SAME planet/angle readout the wheel sidebar shows, filtered
  // by the on-map planet + line-type toggles so the panel matches what's drawn. lonToZodiac
  // (in the panel) formats each from these longitudes, so the two readouts can't diverge.
  const captureExtraPlanets = useMemo(
    () =>
      wheelPlanets
        .filter((p) => visiblePlanets.has(p.name))
        .sort((a, b) => planetRank(a.name) - planetRank(b.name))
        .map((p) => ({ name: p.name, lon: p.lon })),
    [wheelPlanets, visiblePlanets],
  );
  // Finite values only: a geodetic frame carries no Vertex (NaN), and a NaN row would
  // print as "NaN°". A geodetic frame's rows truncate, as every readout of a place's
  // angles does (format.ts truncZodiac). (2026-10-02)
  const captureExtraAngles = useMemo(
    () =>
      wheelAngles
        ? visibleAngleSpecs(visibleLineTypes)
            .map((s) => ({
              code: s.code,
              name: t(s.nameKey),
              lon: wheelAngles[s.key],
              color: s.color,
              trunc: !!wheelAngles.geodetic,
            }))
            .filter((a) => Number.isFinite(a.lon))
        : [],
    [wheelAngles, visibleLineTypes, t],
  );
  // Balance: element + modality tally over the shown planets (same as the wheel sidebar).
  const captureBalance = useMemo(
    () => buildCaptureBalance(captureExtraPlanets, t),
    [captureExtraPlanets, t],
  );
  // Wheel view payload: the on-map-visible bodies as full positions (the wheel does its own
  // ordering/relaxation), the visible angle codes mapped to the wheel's keys, and the
  // element×modality grid — each gated by its toggle below.
  const captureWheelPlanets = useMemo(
    () => wheelPlanets.filter((p) => visiblePlanets.has(p.name)),
    [wheelPlanets, visiblePlanets],
  );
  const captureWheelAngles = useMemo<Set<CaptureWheelAngleKey>>(
    () => new Set(visibleAngleSpecs(visibleLineTypes).map((s) => s.code)),
    [visibleLineTypes],
  );
  const captureBalanceGrid = useMemo(
    () => buildBalanceGrid(captureExtraPlanets),
    [captureExtraPlanets],
  );
  const emptyWheelAngles = useMemo<Set<CaptureWheelAngleKey>>(() => new Set(), []);
  // Phones can't fit the wheel/list details in a phone-sized frame, so the details view is forced
  // to 'none' there (the CaptureHud hides the control + explains why). This EFFECTIVE view drives
  // the frame and the HUD without touching the stored preference, so a desktop 'wheel'/'list'
  // choice survives a detour through a phone.
  const capturePhone = usePhone();
  // The frame is a picture of the CHART rather than the map: the details fill it as a card,
  // and every map-flavoured option below steps aside.
  const captureChart = mapTool === 'capture' && captureSubject === 'chart';
  // How much room the frame can give the details, reported by the Map as the frame box
  // changes. Optimistic until the first report — the frame hasn't been measured yet, and
  // starting from "too small" would flash the picker into its blocked state on open.
  const [captureFit, setCaptureFit] = useState<{
    wheelPx: number;
    canWheel: boolean;
    clipped: boolean;
  }>({ wheelPx: 0, canWheel: true, clipped: false });
  const onCaptureFit = useCallback(
    (fit: { wheelPx: number; canWheel: boolean; clipped: boolean }) => setCaptureFit(fit),
    [],
  );
  // Transparent (Local Space) export mode is effectively ON only with Local Space up, the
  // Capture frame armed, the toggle set AND the plan at the gated rung. It strips the export to
  // a clean transparent image: forces the details view off, withholds every registered map
  // overlay (journal spots etc.), and drops the caption band + watermark — a bare see-through
  // PNG (the LS lines + compass) for laying over a floor plan, in whatever frame ratio you pick.
  // It describes a MAP export, so a chart card stands it down (the HUD hides its toggle there,
  // but a preset left on from a previous session would otherwise still apply). It reads
  // lsActive, so on a geodetic map, where local space draws nothing, it stands down too.
  const lsTransparent =
    lsActive &&
    mapTool === 'capture' &&
    !captureChart &&
    transparentMode &&
    gatedTierMet;
  // Every registered map overlay id — withheld from the frame while lsTransparent (a clean
  // LS-only export). The registry is populated at startup, so the set is stable.
  const allCaptureOverlayIds = useMemo(() => new Set(getMapOverlays().map((o) => o.id)), []);
  // The view actually drawn, which is never written back to the stored preference — so a
  // choice made where it fits survives a detour through a frame where it doesn't.
  //  • CHART card — there is no 'none' (the details ARE the picture), and the phone rule
  //    doesn't apply: a card is legible at phone size, which is exactly why the blocked
  //    map view offers it as the way out. A frame too cramped even for a card wheel (a
  //    16:9 strip on a phone) falls back to the LIST, which wraps to whatever room it has.
  //  • MAP frame — off in transparent mode and on phones, and off when the frame has no
  //    room to draw the wheel legibly (see fitCaptureWheel in Map).
  const captureViewEff: 'none' | 'wheel' | 'list' = captureChart
    ? captureExtras.view === 'list' || !captureFit.canWheel
      ? 'list'
      : 'wheel'
    : capturePhone || lsTransparent
      ? 'none'
      : captureExtras.view === 'wheel' && !captureFit.canWheel
        ? 'none'
        : captureExtras.view;
  // A card carries the chart as the sidebar draws it — the aspect web under the practitioner's
  // own filters, and the outer ring of a running time overlay. The docked panel leaves both
  // out: at rail/band size they crowd the wheel past reading. Same gate the sidebar uses —
  // a promoted overlay or CCG has no coherent second chart to ring.
  // The overlay chart's short name, as the sidebar's second wheel is titled with it
  // (ExpandedChartSidebar's overlayName, by the same rule) — what a card wheel's catalog
  // marks of that chart name themselves by.
  const overlayWheelName = overlayLayer
    ? overlayReturn
      ? t(`timeline.returns.${overlayReturn}.chartName` as 'timeline.returns.solar.chartName')
      : overlayLayer.kind === 'cyclo'
        ? 'CCG'
        : overlayLayer.labelFull.split('·')[0].trim()
    : null;
  const captureCardOverlay =
    captureChart && !promoteOverlay && !isCyclo && displayOverlayEcliptic
      ? displayOverlayEcliptic.filter((p) => visiblePlanets.has(p.name))
      : null;
  // Unknown birth time on a celestial map: there are no angles, but the bodies still read by
  // sign — so the card draws them planets-only on the neutral Aries frame, as the sidebar
  // does. (On a geodetic map wheelAngles is the place's frame, birth time or not.)
  const captureCardFrame = wheelAngles ?? (noTime ? ARIES_FRAME : null);
  // Null (no panel, no inset) unless the Capture tool is armed. WHEEL view shows the wheel
  // whenever a chart exists (the planets are always drawn, angles/balance modulate the rest);
  // LIST view shows whenever there are planet rows (its baseline) or an enabled angles group.
  //
  // The catalog bodies ride on BOTH wheels and in the list: they are the chart's bodies as
  // much as the planets are, and the list is promised to match the sidebar's readout. Top
  // level on the wheel payload rather than among the card's extras, because they are not a
  // crowding detail a rail wheel has to give up: they are rim marks at their degree, which
  // cost no room. (A wheel of 600px or more also seats them as coins in a ring of their
  // own, its size deciding as the sidebar's does; see MINOR_RING_MIN in lib/wheelGeometry.)
  const captureFrameExtras: CaptureFrameExtras | null =
    mapTool !== 'capture' || captureViewEff === 'none'
      ? null
      : captureViewEff === 'wheel'
        ? captureChart
          ? captureCardFrame
            ? {
                view: 'wheel',
                angles: captureCardFrame,
                planets: captureWheelPlanets,
                minorBodies: wheelMinor,
                visibleAngles: captureExtras.angles ? captureWheelAngles : emptyWheelAngles,
                balanceGrid: captureExtras.balance ? captureBalanceGrid : null,
                overlayPlanets: captureCardOverlay,
                // The overlay ring's catalog bodies beside its planets, under the same
                // gate (no ring, none of them).
                overlayMinorBodies: captureCardOverlay ? overlayMinorWheel : null,
                overlayName: captureCardOverlay ? overlayWheelName : null,
                overlayAngles:
                  promoteOverlay || isCyclo ? null : (displayOverlayAngles ?? null),
                visibleAspects,
                aspectOrbs: effAspectOrbs,
                advanced: advancedWheel,
                planetsOnly: noTime && !wheelAngles,
                maskAngleText: maskGeAngleText,
                // The natal wheel's spans and source notes, as the sidebar's wheel draws
                // them: a picture of a timeless chart must not print its Moon to the
                // minute either. (2026-10-02)
                ranges: natalRanges,
                bodyNotes: wheelBodyNotes,
              }
            : null
          : wheelAngles
            ? {
                view: 'wheel',
                angles: wheelAngles,
                planets: captureWheelPlanets, // baseline of any view — no planets toggle
                minorBodies: wheelMinor,
                visibleAngles: captureExtras.angles ? captureWheelAngles : emptyWheelAngles,
                balanceGrid: captureExtras.balance ? captureBalanceGrid : null,
                maskAngleText: maskGeAngleText,
                ranges: natalRanges,
                bodyNotes: wheelBodyNotes,
              }
            : null
        : captureExtraPlanets.length > 0 ||
            (captureExtras.angles && captureExtraAngles.length > 0)
          ? {
              view: 'list',
              planets: captureExtraPlanets, // baseline — always shown in a chosen view
              // After the planets, in the reader's own list order — the sidebar's order.
              minors: wheelMinor,
              angles: captureExtras.angles ? captureExtraAngles : [],
              // The tally stays the planets' own: the catalog bodies are placed, not
              // counted (captureBalance is built from captureExtraPlanets alone).
              balance: captureExtras.balance ? captureBalance : [],
              maskAngleText: maskGeAngleText,
              ranges: natalRanges,
              // The list's Fortune row is the wheel's (captureExtraPlanets comes from
              // wheelPlanets), so it carries the same source mark. (2026-10-02)
              bodyNotes: wheelBodyNotes,
            }
          : null;

  const togglePlanet = useCallback((p: PlanetName) => {
    setVisiblePlanets((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }, []);

  // The Vertex buttons are greyed on a geodetic map, where the axis is masked (skyHeld);
  // refusing here too keeps them inert in fact, whoever calls this, so a masked choice is
  // never moved unseen. (2026-10-02)
  const toggleLineType = useCallback((t: LineType) => {
    if ((t === 'VX' || t === 'AVX') && skyHeldRef.current) return;
    setVisibleLineTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);

  // Shift+click a planet / line toggle to apply that click to ALL of them at once
  // (show everything, or hide everything) — based on the state the clicked one
  // would flip to. Scoped to a body group (planets vs asteroids) so each filter
  // section's "show/hide all" is independent; bodies outside the group are left as-is.
  const setAllPlanets = useCallback((bodies: PlanetName[], visible: boolean) => {
    setVisiblePlanets((prev) => {
      const next = new Set(prev);
      for (const b of bodies) {
        if (visible) next.add(b);
        else next.delete(b);
      }
      return next;
    });
  }, []);
  // On a geodetic map the stored Vertex choices ride through untouched: the shift-click
  // can't see them (their buttons are greyed and masked), so it mustn't move them either.
  // (2026-10-02)
  const setAllLineTypes = useCallback((visible: boolean) => {
    setVisibleLineTypes((prev) => {
      const next = visible ? new Set<LineType>(['MC', 'IC', 'ASC', 'DSC']) : new Set<LineType>();
      if (skyHeldRef.current) {
        for (const v of ['VX', 'AVX'] as const) if (prev.has(v)) next.add(v);
      }
      return next;
    });
  }, []);

  // True while the expanded sidebar is being drag-resized — pauses map hover so
  // the cursor sweeping over the map mid-drag doesn't flicker the hover state.
  const resizingRef = useRef(false);
  const onResizing = useCallback((v: boolean) => {
    resizingRef.current = v;
    if (v) setHover(null);
  }, []);
  const onHover = useCallback(
    (lat: number, lng: number) => {
      // Sky-band follow mode: trailing ~200ms throttle (see the skyFollow block
      // for why), independent of the pin gating below — following works with a
      // pin placed.
      if (skyFollowLiveRef.current) {
        skyHoverPendingRef.current = { lat, lng };
        if (skyHoverTimerRef.current === null) {
          skyHoverTimerRef.current = window.setTimeout(() => {
            skyHoverTimerRef.current = null;
            if (skyFollowLiveRef.current && skyHoverPendingRef.current) {
              setSkyHover(skyHoverPendingRef.current);
            }
          }, 200);
        }
      }
      if (!pinned && !resizingRef.current) setHover({ lat, lng });
    },
    [pinned],
  );
  const onLeave = useCallback(() => {
    if (!pinned) setHover(null);
  }, [pinned]);
  // Gamified onboarding: the map gestures below double as "missions" the user clears
  // (recordEvent), and any map gesture surfaces the guide (trigger).
  const {
    openSet: missionSet,
    openProgress: missionProgress,
    recordEvent: recordMission,
    trigger: triggerMission,
    close: closeMissionGuide,
    dismiss: dismissMission,
    complete: completeMission,
    guideSets,
    progressFor: missionProgressFor,
  } = useMissions();
  // Toggle the guides reference, always (re)opening it at the first met-guide. guideIdx
  // also keeps the pager index in range as the met-guide list grows. (guideSets is never
  // empty — it falls back to the first set.)
  const toggleGuides = useCallback((open: boolean) => {
    setShowGuides(open);
    if (open) setGuideIndex(0);
  }, []);
  const guideIdx = Math.min(guideIndex, guideSets.length - 1);

  // Surface the onboarding guide on any map gesture (left/right/double click) — gated
  // on an active chart, since the natal-pin mission can't complete without one (so a
  // user who has deleted every chart isn't nagged by a guide that can never finish).
  const surfaceMissions = useCallback(() => {
    if (current) triggerMission('map-click');
  }, [current, triggerMission]);

  // Double-tap the map to drop or move the pin. Removal is right-click now, so this
  // always places (no same-spot toggle).
  const onPlacePin = useCallback(
    (lat: number, lng: number) => {
      // A globe click off the sphere yields non-finite coords; a 2D world-copy click yields a
      // longitude outside ±180. Drop the former, wrap the latter — so no downstream consumer
      // (the timezone lookup, which hard-throws; Local Space origin; geocoding; share links)
      // ever inherits an invalid pin.
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90) return;
      const wrappedLng = ((((lng + 180) % 360) + 360) % 360) - 180;
      surfaceMissions();
      setPinned({ lat, lng: wrappedLng });
      setHover({ lat, lng: wrappedLng });
      recordMission('create-pin');
    },
    [surfaceMissions, recordMission],
  );
  // Clicking the arrival crosshair adopts it as the placed pin. The mark has done
  // its job at that point — it answered "where did I land", and the answer is now
  // carried by the pin — so it retires rather than sitting under the teardrop
  // saying the same thing in a second colour. Straight through onPlacePin, so an
  // adopted arrival is a pin like any other: same coordinate hygiene, same hover
  // readout, same onboarding tick.
  const onArrivalClick = useCallback(
    (lat: number, lng: number) => {
      onPlacePin(lat, lng);
      setArrivalMark(null);
    },
    [onPlacePin],
  );
  // Clicking the home marker does the two things "go home" means, in the order
  // they read: the pin lands there (so the reading, the readouts and the
  // relocated-chart panel are all about home), then the camera snaps to it.
  // CLOSE_ZOOM, the same framing "fly to origin" uses — a region rather than a
  // rooftop, because what you came to see is which lines run near home, and a
  // street-level arrival (Teleport's, for an address the basemap can't name) would
  // put you inside the answer. Through onPlacePin like every other adopted point —
  // same coordinate hygiene, same hover readout, same onboarding tick — and
  // through teleportToPoint rather than jumpTo, so the hop registers a back-target
  // and Backspace returns you to where you were reading before.
  const onHomeClick = useCallback(
    (lat: number, lng: number) => {
      onPlacePin(lat, lng);
      teleportToPoint(lat, lng, CLOSE_ZOOM);
    },
    [onPlacePin, teleportToPoint],
  );
  const onRecenterPin = useCallback(() => {
    if (pinned) jumpTo(pinned.lat, pinned.lng);
  }, [pinned, jumpTo]);
  const onPinNatal = useCallback(() => {
    if (!current) return;
    setPinned({
      lat: current.birthplace.lat,
      lng: current.birthplace.lng,
    });
    setHover(null);
  }, [current]);
  // Right-click removes the pin if one is placed; with no pin it drops the green
  // natal pin instead. Each path also ticks off its onboarding mission, and the
  // gesture surfaces the guide too (so a right-click-first user still sees it).
  const onRightClick = useCallback(() => {
    surfaceMissions();
    if (pinned) {
      setPinned(null);
      recordMission('remove-pin');
    } else if (current) {
      onPinNatal();
      recordMission('place-natal');
    }
  }, [surfaceMissions, pinned, current, onPinNatal, recordMission]);
  // Stable so the measure effect (which depends on it) isn't torn down on every
  // re-render during a drag. Right-click cancel also clears the measure mission.
  const stopMeasure = useCallback(() => {
    setMapTool('off');
    recordMission('measure-cancel');
  }, [recordMission]);
  // Slide tool: right-click resets the spin to natal and exits. Stable so the Map's
  // slide effect (which depends on it) isn't torn down on every drag re-render.
  const stopSlide = useCallback(() => {
    setMapTool('off');
    setSlideDt(0);
  }, []);
  // Slide tool precision controls (the readout's buttons + the arrow keys): relative
  // nudges go through slideBy — computed Map-side against the LIVE spin, so rapid
  // repeats never race the throttled slideDt report back.
  const nudgeSlide = useCallback((dHours: number) => {
    mapRef.current?.slideBy(dHours / 24);
  }, []);
  const resetSlide = useCallback(() => {
    mapRef.current?.slideTo(0);
  }, []);
  // Scrub the slid instant to an absolute time (a band track may drive this while
  // the tool is armed — see SkyBandTrackContext.slideTo — and so do the band's own
  // Today and date picker).
  //
  // No range bound, deliberately (2026-09-30). The question came from a Paran Clock
  // press that slid a 1989 chart +13,736 days: the band was showing TODAY while the
  // tool sat at the natal moment, and the press landed on the shown day. That was
  // the band's day anchor, and it is fixed there — the band now shows the slid
  // instant's day, so every target it hands over is on that day, a day either side
  // of it, the present, or a date inside the picker's own year range. A bound here
  // would also make this path disagree with a drag on the map, which has never had
  // one, and a clamp would land the sky somewhere the caller didn't ask for without
  // saying so. Drawing at a large spin is the Map's job, not this function's. Only a
  // non-finite target is refused: a NaN would poison the spin for the session.
  const slideToMs = useCallback(
    (ms: number) => {
      if (!current || !Number.isFinite(ms)) return;
      mapRef.current?.slideTo((ms - chartUtcMs(current)) / MS_DAY);
    },
    [current],
  );
  // Turn the slid instant by whole days (the band's ‹ › while the tool is armed),
  // relative to the LIVE spin like the readout's nudges.
  const slideByDays = useCallback((deltaDays: number) => {
    mapRef.current?.slideBy(deltaDays);
  }, []);
  // Jump to the previous/next ANGULAR EVENT — the nearest rise / culmination / set /
  // anti-culmination of any visible body at the active point (pin, else birthplace),
  // after/before the slid instant: the next REAL one, every crossing solved on its
  // own (nextSkyEvent, riseSet.ts — searched a day at a time outward from the slid
  // instant in absolute time, so midnight and DST need no special casing; walked
  // against the full solve by verify:rise-set). The instant is the one the band
  // prints (the visible horizon for a rise or set), so a jump lands on the band's
  // time. (Until 2026-10-02 the windows came from the civil-day solve, which moved
  // out-of-window events by a sidereal day: a lunar step could land about an hour
  // from any moonrise.)
  const stepSlideEvent = useCallback(
    (dir: 1 | -1) => {
      if (!current || visiblePlanets.size === 0) return;
      const point = pinned ?? current.birthplace;
      const base = chartUtcMs(current);
      const slidJd = msToJD(base + slideDt * MS_DAY);
      // skipJd (1 s, the default) keeps a just-snapped event from re-matching.
      const next = nextSkyEvent(slidJd, dir, point.lat, point.lng, [...visiblePlanets], nodeType);
      if (next === null) return;
      const dt = (jdToMs(next) - base) / MS_DAY;
      // Optimistic: land slideDt now so a fast second press steps from the
      // NEW instant instead of the throttled report's stale one.
      setSlideDt(dt);
      mapRef.current?.slideTo(dt);
    },
    [current, pinned, visiblePlanets, nodeType, slideDt],
  );
  // Capture tool: right-click on the map exits the capture frame. Stable so the
  // Map's frame effect (which depends on it) isn't torn down on unrelated re-renders.
  const stopCapture = useCallback(() => {
    setMapTool('off');
  }, []);
  // Pick an aspect preset and remember it for next time.
  const setCaptureAspectPersist = useCallback((ratio: number) => {
    setCaptureAspect(ratio);
    try {
      localStorage.setItem('astro:capture-aspect:v1', String(ratio));
    } catch {
      /* ignore */
    }
  }, []);
  // Slide needs a natal cage to spin, and needs it DRAWN — the tool IS the sight of
  // those lines holding still while the world turns under them. So it stands down
  // whenever they are off the map: the eclipse clean-up, an overlay promoted into the
  // primary slot (the cage is the overlay then, not the resampled natal chart), or the
  // Natal Lines switch. A geodetic map is the sky hold's, not this: armSlide refuses there.
  const slideAvailable = !eclipseSolo && !promoted && !hideNatalAngles;
  useEffect(() => {
    slideAvailableRef.current = slideAvailable;
  }, [slideAvailable]);
  // Exit Slide if its preconditions break mid-spin: the cage stops being shown, or the map
  // turns geodetic (skyHeld), which has no sidereal time to spin. Un-spins via the Map
  // cleanup → onSlide(0), which resets slideDt. The geodetic half is a backstop: the setters
  // that bring a geodetic map disarm Slide in the same gesture (enterLineSystem). A
  // transient tool, not a preference, so disarming it is no write; its menu row is greyed
  // with the reason while held, and re-arming on Celestial is the reader's own gesture.
  // (2026-10-02)
  useEffect(() => {
    if (mapTool === 'slide' && (skyHeld || !slideAvailable)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMapTool('off');
    }
  }, [mapTool, skyHeld, slideAvailable]);
  // Switching the active chart drops any in-progress spin — a carried-over time offset
  // on a different chart reads as wrong. (Functional update: only touches the slide tool.)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMapTool((t) => (t === 'slide' ? 'off' : t));
  }, [current]);
  // Surface the measure-tool guide on the off→measure edge, but only when lines are
  // actually rendered (the snap mission has nothing to snap to otherwise, which would
  // nag forever). `replace` lets it show even if the map-basics guide is still open —
  // the user just chose the measure tool, and map-basics re-surfaces on the next map
  // gesture. Edge-only (prevMapToolRef) so toggling lines / switching charts mid-tool
  // doesn't re-pop a guide the user already dismissed.
  const prevMapToolRef = useRef<MapTool>(mapTool);
  // Whether anything the measure tool can SNAP to is drawn. The natal set is the usual
  // answer but never the only one: Map.tsx's SNAP_LINE_LAYERS also covers the overlay's own
  // lines, aspect and midpoint lines, parans, fixed stars, local space and the eclipse paths.
  //
  // So this deliberately keeps the raw-`lines` proxy for every state that existed before —
  // it was right in all of them, including the eclipse clean-up, whose paths are snappable —
  // and adds a second clause for the one state Natal Lines newly creates: the natal linework
  // gone with no other family drawn to snap to instead. Biased to fire, because showing the
  // guide in a thin state is a smaller error than withholding it from someone who wanted it.
  const canSnapLines =
    lines.features.length > 0 &&
    (!hideNatalAngles ||
      effShowParans ||
      effShowAspectLines ||
      effShowMidpointLines ||
      effShowStarLines ||
      lsActive ||
      !!overlayLayer ||
      overlayMode === 'eclipses');
  useEffect(() => {
    const wasMeasure = prevMapToolRef.current === 'measure';
    prevMapToolRef.current = mapTool;
    if (mapTool === 'measure' && !wasMeasure && canSnapLines) {
      triggerMission('measure-tool', true);
    }
    // Touch has no right-click to cancel the tool — exiting it (tapping Measure again)
    // is the touch equivalent, so tick off the cancel mission on the measure→off edge.
    if (wasMeasure && mapTool !== 'measure' && isTouchLayout()) {
      recordMission('measure-cancel');
    }
  }, [mapTool, canSnapLines, triggerMission, recordMission]);

  // Surface the zoom/perspective guide the first time the user zooms past the detail
  // threshold (the "Zoom out" button appears → detailZoom true). `replace` shows it even
  // if another guide is still open (it would otherwise be lost — detailZoom won't flip
  // again until a zoom-out/in). The set re-surfaces on later zoom-in passes until done.
  // Skipped in the transparent LS export: it flies deep to frame the compass, and that
  // deliberate zoom isn't the user exploring, so neither the guide nor its button appear.
  useEffect(() => {
    if (detailZoom && !lsTransparent) triggerMission('zoom-threshold', true);
  }, [detailZoom, lsTransparent, triggerMission]);

  const is3d = projection === '3d';
  // Close the live mission guide, persisting its set as complete when every mission is
  // done OR not-applicable in the current mode (an only3d mission — e.g. "change
  // perspective" — counts as satisfied in 2D, where it can't be performed). The
  // recordEvent path alone can't finish such a set, so this covers it.
  //
  // Deferred to CLOSE, not run eagerly the instant the 2D-applicable missions finish:
  // an early completion would lock the set, so if the user then switched to 3D — where
  // the perspective mission becomes applicable and the guide re-exposes it — recordEvent
  // would skip the already-completed set and the pitch-rotate could never tick it off.
  const closeMission = useCallback(
    (dontShowAgain?: boolean) => {
      if (missionSet) {
        if (dontShowAgain) {
          // Explicit opt-out — suppress this set's trigger for good (no completion).
          dismissMission(missionSet.id);
        } else {
          const allDone = missionSet.missions.every(
            (m) => missionProgress.has(m.id) || (m.only3d && !is3d),
          );
          if (allDone) completeMission(missionSet.id);
        }
      }
      closeMissionGuide();
    },
    [missionSet, missionProgress, is3d, completeMission, dismissMission, closeMissionGuide],
  );

  // Switch the active chart. If you switch TO the chart currently being compared in
  // synastry, drop it as the partner — you can't compare someone to themselves, and
  // the bar would otherwise show them as both the subject and the partner.
  const selectChart = useCallback((id: string) => {
    setCurrentId(id);
    setPartnerId((p) => (p === id ? null : p));
    // Bump recency so the chart switcher's "recent" shortlist tracks real usage.
    setCharts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, lastUsedAt: Date.now() } : c)),
    );
  }, []);

  const handleSaveChart = (chart: StoredChart) => {
    // Stamp recency on the saved chart.
    const stamped = { ...chart, lastUsedAt: Date.now() };
    setCharts((prev) => {
      const exists = prev.some((c) => c.id === stamped.id);
      return exists
        ? prev.map((c) => (c.id === stamped.id ? stamped : c))
        : [...prev, stamped];
    });
    if (pickingPartner) {
      // Saving from the synastry partner picker → the saved chart becomes the
      // comparison partner; the active chart (the synastry subject) is untouched.
      setPartnerId(stamped.id);
    } else {
      setCurrentId(stamped.id);
      setPinned(null);
      setHover(null);
    }
    setEditingId(null);
    setCreating(false);
    setPickingPartner(false);
  };

  /**
   * Fold several edited charts back in at once, leaving everything else alone.
   *
   * Filing works in bulk — renaming a folder rewrites every chart underneath it
   * — and one setCharts per chart would be one render and one persist each.
   * Unlike handleSaveChart this changes no selection and closes nothing: the
   * charts moved, the user did not.
   */
  // Every folder currently in use, offered as import destinations.
  const folderPaths = useMemo(
    () => flattenFolders(buildFolderTree(charts, loadDeclaredFolders())).map((n) => n.path),
    [charts],
  );

  const handleSaveCharts = (updated: StoredChart[]) => {
    if (!updated.length) return;
    // A plain record, not a Map: `Map` in this module is the map COMPONENT.
    const byId: Record<string, StoredChart> = {};
    for (const c of updated) byId[c.id] = c;
    setCharts((prev) => prev.map((c) => byId[c.id] ?? c));
  };

  // Build a relationship chart from the active chart + its synastry partner using the
  // chosen method, make it the active chart, and clear the partner — the synastry view
  // stays on (its partner slot just empties for re-picking).
  const handleGenerateRelationship = () => {
    if (overlayMode !== 'synastry') return;
    if (!current || !partner) return;
    const now = Date.now();
    const chart: StoredChart = {
      ...(synastryMethod === 'composite'
        ? buildComposite(current, partner)
        : buildDavison(current, partner)),
      id: newChartId(),
      createdAt: now,
      lastUsedAt: now,
      tzIana: 'UTC',
      tzManual: true,
      tag: 'space',
    };
    setCharts((prev) => [...prev, chart]);
    setCurrentId(chart.id);
    setPartnerId(null);
  };

  const handleImport = (imported: StoredChart[]) => {
    setImporting(false);
    if (imported.length === 0) return;
    // Capture the picker mode before closeManager() resets it.
    const toPartner = pickingPartner;
    // A real import is the end of the flow — close the chart manager too (it stays
    // open behind the import modal so Cancel returns to it).
    closeManager();
    // Stamp recency on the first imported chart.
    const stamped = imported.map((c, i) =>
      i === 0 ? { ...c, lastUsedAt: Date.now() } : c,
    );
    setCharts((prev) => [...prev, ...stamped]);
    if (toPartner) {
      // Imported from the synastry picker → the first chart becomes the partner;
      // the active chart (and its pin/hover) stay put.
      setPartnerId(stamped[0].id);
    } else {
      // The first imported chart becomes active.
      setCurrentId(stamped[0].id);
      setPinned(null);
      setHover(null);
    }
  };

  const handleDelete = (id: string) => {
    // Drop the comparison partner if it's the chart being deleted.
    setPartnerId((p) => (p === id ? null : p));
    setCharts((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (currentId === id) setCurrentId(next[0]?.id ?? null);
      return next;
    });
  };

  const closeManager = () => {
    setCreating(false);
    setEditingId(null);
    setPickingPartner(false);
  };

  // Fixed-star × planet parans — computed here and exposed to map-HUD extensions
  // via extensionCtx; the engine (generateStarParans) lives in lib/astro/parans.
  // Never drawn as map lines (the catalog × planet set is hundreds of latitude
  // rows; the conventional reading is a per-location list). Follows the star-lines
  // toggle/set and, in Geodetic mode, the same ecliptic projection.
  const starParans = useMemo(() => {
    // Natal star × planet parans; hidden while an overlay is active (one-frame rule —
    // these are the natal frame's own parans). None without a birth time, as for the
    // planets' parans (allParans): a geodetic map's timeless lines don't bring them back.
    // (2026-10-02)
    if (!effShowStarLines || !current || overlayAux || skyFamiliesOff) return EMPTY_FC;
    const stars = starsOfDate(jd, starSet).map((s) => {
      if (lineSystem !== 'geodetic') return s;
      const lon = raDecToEclipticLon(s.ra, s.dec, eps);
      return { ...s, ...eclipticToRaDec(lon, 0, eps) };
    });
    return generateStarParans(
      stars,
      linePositions.filter((p) => visiblePlanets.has(p.name)),
      meridianLng,
      STAR_LINE_COLORS[theme],
    );
  }, [effShowStarLines, current, overlayAux, skyFamiliesOff, jd, starSet, lineSystem, eps, linePositions, visiblePlanets, meridianLng, theme]);

  // ── Map-HUD extensions ────────────────────────────────────────────────────
  // Features registered via registerMapExtension() (e.g. add-ons in a downstream
  // build) get a View-menu toggle + HUD without editing this file.
  // Open/closed state is generic and persisted per the extension's storageKey.
  const [openExtensions, setOpenExtensions] = useState<Set<string>>(() => {
    const open = new Set<string>();
    for (const ext of getMapExtensions()) {
      const saved = ext.storageKey ? localStorage.getItem(ext.storageKey) : null;
      if (saved === '1' || (saved === null && ext.defaultOpen)) open.add(ext.id);
    }
    return open;
  });
  const toggleExtension = useCallback((id: string) => {
    // A left-column extension and the expanded chart panel both own the left edge —
    // opening one closes the other. Safe in both toggle directions: when closing this
    // extension the panel is already down (it couldn't have coexisted), so it's a no-op.
    const ext0 = getMapExtensions().find((e) => e.id === id);
    // An extension that has declared itself unavailable doesn't move in either
    // direction: nothing of it renders, so there is no open state worth flipping —
    // and leaving the stored one alone is what lets it come back as the user left it.
    if (ext0 && !isAvailable(ext0)) return;
    if (ext0?.reservesLeftColumn) setWheelExpanded(false);
    setOpenExtensions((prev) => {
      const next = new Set(prev);
      const nowOpen = !next.has(id);
      if (nowOpen) next.add(id);
      else next.delete(id);
      const ext = getMapExtensions().find((e) => e.id === id);
      if (ext?.storageKey) localStorage.setItem(ext.storageKey, nowOpen ? '1' : '0');
      return next;
    });
  }, []);
  // Extensions surfaced in the timeline bar's drawer show only WHILE the bar is
  // up — but their open state (and its persistence) survives, like the drawer's
  // other toggles: cycle overlays off and back on and the HUD returns as left.
  // The gate is applied where the HUDs render (below), not by closing them here.
  // Force a registered extension OPEN (vs. the toggle above) — handed to extensions via the
  // context as openExtension, e.g. a map overlay opening its companion HUD on a marker click.
  const openExtensionById = useCallback((id: string) => {
    const ext0 = getMapExtensions().find((e) => e.id === id);
    if (ext0 && !isAvailable(ext0)) return; // unavailable — see toggleExtension
    if (ext0?.reservesLeftColumn) setWheelExpanded(false); // left-column takeover — see toggleExtension
    setOpenExtensions((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      const ext = getMapExtensions().find((e) => e.id === id);
      if (ext?.storageKey) localStorage.setItem(ext.storageKey, '1');
      return next;
    });
  }, []);

  // ── Tools-menu extensions ─────────────────────────────────────────────────
  // Same machinery as the Map-HUD extensions above, surfaced in the Tools dropdown
  // instead of the View menu (registerToolExtension). Each is a toggled HUD with
  // generic, per-storageKey persistence. The open core registers none. (Their open
  // state, `openTools`, is declared up beside the built-in `mapTool`.)
  //
  // Tools are mutually exclusive — one at a time, like the built-in Measure/Slide/Capture. Opening a
  // tool extension single-selects it (closes any other open extension) AND disarms any armed built-in
  // tool; the reverse (arming a built-in closes open extensions) is the effect below. Generic — works
  // for any registered tool, no per-tool wiring.
  //
  // A tool that declares `needsSiderealTime` is HELD on a geodetic map (lib/skyHold): both
  // open paths below refuse to open it there — doing nothing and writing nothing, as its
  // greyed menu row says — and closing is never refused. One already open stays open, and
  // the render below draws the held card in its place. Read through skyHeldRef, so these
  // stay stable for the keydown handler. (Until 2026-10-02 opening one switched the line
  // system to Celestial instead.)
  const toggleTool = useCallback((id: string) => {
    const cur = openToolsRef.current;
    const nowOpen = !cur.has(id);
    if (nowOpen && skyHeldRef.current && toolNeedsSky(id)) return;
    if (nowOpen) setMapTool('off'); // opening a tool disarms any armed built-in tool
    const next = nowOpen ? new Set([id]) : new Set([...cur].filter((x) => x !== id));
    for (const ext of getToolExtensions()) {
      if (ext.storageKey) localStorage.setItem(ext.storageKey, next.has(ext.id) ? '1' : '0');
    }
    setOpenTools(next);
  }, []);

  // Force a tool extension OPEN (vs. the toggle above) — handed to extensions via the context as
  // openTool, e.g. one HUD launching a companion tool positioned at a chosen point. Single-select
  // (closes any other open tool) and disarms any armed built-in, mirroring toggleTool's open path
  // — the hold's refusal included.
  const openToolById = useCallback((id: string) => {
    if (skyHeldRef.current && toolNeedsSky(id)) return;
    setMapTool('off');
    setOpenTools((prev) => {
      if (prev.size === 1 && prev.has(id)) return prev; // already the only open tool
      const next = new Set([id]);
      for (const ext of getToolExtensions()) {
        if (ext.storageKey) localStorage.setItem(ext.storageKey, next.has(ext.id) ? '1' : '0');
      }
      return next;
    });
  }, []);

  // Arm the built-in capture tool — handed to extensions via the context as openCapture, e.g. a HUD
  // offering "grab the current map view" toward a registered capture destination. Idempotent while
  // armed; the effect below then closes any open tool extension, keeping the one-active-tool rule.
  const openCaptureTool = useCallback(() => setMapTool('capture'), []);

  // Arm one of the other built-in map tools — openCapture's generic twin, handed to extensions
  // via the context as openBuiltinTool, so a registered surface can arm the ruler/rotation tools
  // exactly like their menu rows do. Same one-active-tool effect applies.
  //
  // For Slide, "exactly like its menu row" means armSlide: the availability gate, the sky
  // hold (refused on a geodetic map), and pausing playback. This used to set the tool
  // directly, so Help's "Arm Slide" on a geodetic map armed it and had it disarmed again by
  // its own guard, in silence.
  const openBuiltinTool = useCallback(
    (tool: 'measure' | 'slide') => (tool === 'slide' ? armSlide() : setMapTool(tool)),
    [armSlide],
  );

  // Close a tool extension (the inverse of openToolById; no-op unless open) — handed to extensions
  // via the context as closeTool, e.g. releasing a viewport-owning tool before opening a map window
  // it parks. Mirrors toggleTool's close path, storage writes included.
  const closeToolById = useCallback((id: string) => {
    setOpenTools((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set([...prev].filter((x) => x !== id));
      for (const ext of getToolExtensions()) {
        if (ext.storageKey) localStorage.setItem(ext.storageKey, next.has(ext.id) ? '1' : '0');
      }
      return next;
    });
  }, []);

  // Force a BUILT-IN view window open — handed to extensions via the context as openView, the
  // built-ins' twin of openExtensionById ('charts' is the chart browser). Idempotent opens.
  // 'skyTimes' and 'localSpace' open regardless of the Advanced switch (callers flip
  // setAdvancedMode first so the menus stay honest — those windows have no render gate on
  // it). 'minorBodies' is different: its window RENDERS only with Advanced on, so opening it
  // with Advanced off would write a persisted open flag with nothing on screen, and the
  // window would then appear by itself the next time Advanced came on — a move nobody could
  // attribute (CLAUDE.md rule 4). So it opens only while Advanced is on, read through
  // advancedRef so a setAdvancedMode(true) earlier in the same gesture counts; otherwise the
  // call does nothing and writes nothing. A view lock doesn't block the state flip: the
  // window appears once the lock clears. 'skyTimes' and 'localSpace' go through their Safe
  // openers, so on a geodetic map the call is refused, as their greyed menu rows are.
  const openViewById = useCallback(
    (
      id:
        | 'coordinates'
        | 'minimap'
        | 'teleport'
        | 'skyTimes'
        | 'localSpace'
        | 'charts'
        | 'minorBodies',
    ) => {
      switch (id) {
        case 'minorBodies':
          if (advancedRef.current) setShowMinorHud(true);
          break;
        case 'coordinates':
          setShowCoords(true);
          break;
        case 'minimap':
          setShowChart(true);
          break;
        case 'teleport':
          setShowTeleport(true);
          break;
        case 'skyTimes':
          setShowSkyTimesSafe(true);
          break;
        case 'localSpace':
          setShowLocalSpaceSafe(true);
          break;
        case 'charts':
          setCreating(true);
          break;
      }
    },
    [setShowLocalSpaceSafe, setShowSkyTimesSafe],
  );

  // Show/hide a built-in reference surface (guides card / info chip) — the write half of the
  // context's viewFlags, for an extension that hosts those toggles after claiming their menu
  // rows (lib/extensions/viewRowClaims).
  const setViewFlag = useCallback(
    (id: 'guides' | 'info', open: boolean) => {
      if (id === 'guides') toggleGuides(open);
      else setShowInfo(open);
    },
    [toggleGuides],
  );

  // Arming a built-in tool closes any open tool extension, so only ONE tool is ever active. One-way
  // (clearing extensions can't re-arm a built-in), so it can't loop with toggleTool's disarm above.
  useEffect(() => {
    if (mapTool === 'off') return;
    setOpenTools((prev) => {
      if (prev.size === 0) return prev;
      for (const ext of getToolExtensions()) {
        if (prev.has(ext.id) && ext.storageKey) localStorage.setItem(ext.storageKey, '0');
      }
      return new Set<string>();
    });
  }, [mapTool]);

  // While ANY map tool is active (a built-in armed tool OR an open tool extension), tag the document
  // so click-catching map overlays can opt out — e.g. a marker overlay stops opening its window
  // on click, letting the tool own the gesture (the click falls through to that spot). Neutral signal.
  // A HELD tool (skyHeld; only its card is drawn) owns no gesture, so it doesn't count: map
  // clicks behave as they would with it closed. (2026-10-02)
  useEffect(() => {
    const active =
      mapTool !== 'off' ||
      getToolExtensions().some(
        (ext) => openTools.has(ext.id) && !(ext.needsSiderealTime && skyHeld),
      );
    document.documentElement.toggleAttribute('data-map-tool-active', active);
  }, [mapTool, openTools, skyHeld]);

  // ── Overlay-menu extensions ───────────────────────────────────────────────
  // Single-select, mutually exclusive with the core overlayMode. selectOverlay is the
  // combined setter passed to the Overlay menu's core rows (it clears any active
  // extension as it sets the core mode); selectOverlayExt does the inverse.
  // Leaving the transits overlay — including to None — ends a returns borrow: the
  // technique the return was being read under is no longer on screen. Done here rather
  // than derived, so coming back later doesn't resurrect a hold the reader walked away
  // from. (The 'o'/'n' hotkeys route through these two, as does the Overlay menu.)
  const selectOverlay = useCallback((mode: OverlayMode) => {
    setActiveOverlayExt(null);
    setReturnBorrow(null);
    setOverlayModePref(mode);
  }, []);
  const selectOverlayExt = useCallback((id: string) => {
    setOverlayModePref('off');
    setReturnBorrow(null);
    setActiveOverlayExt(id);
  }, []);
  const clearOverlayExt = useCallback(() => setActiveOverlayExt(null), []);
  useEffect(() => {
    if (activeOverlayExt) localStorage.setItem(OVERLAY_EXT_KEY, activeOverlayExt);
    else localStorage.removeItem(OVERLAY_EXT_KEY);
  }, [activeOverlayExt]);
  // The active overlay extension object (if any is selected and still registered).
  const activeOverlayExtension = useMemo(
    () =>
      activeOverlayExt
        ? (getOverlayExtensions().find((e) => e.id === activeOverlayExt) ?? null)
        : null,
    [activeOverlayExt],
  );

  // A stable fly-to that reads the map ref lazily, so the snapshot below holds no
  // ref access during render (the HUD calls it from its own event handlers). Goes
  // through jumpTo, so an extension jumping the camera retires any arrival mark
  // the same way the app's own jumps do — one that then wants its own mark calls
  // markArrival right after.
  const extFlyTo = useCallback(
    (lat: number, lng: number, zoom?: number) => jumpTo(lat, lng, zoom),
    [jumpTo],
  );

  // Generate the COMPLETE, UNFILTERED line set — ignores visiblePlanets / visibleLineTypes AND the
  // Advanced family toggles (aspects/midpoints/parans/stars/local-space), so it's EVERYTHING the
  // chart (+ any active overlay) could draw. Reuses the same generators + framing as the drawn
  // linework, minus every filter/gate. Expensive (midpoints are quadratic), so it runs on demand;
  // this is the raw builder — callers get the caching wrapper below, and this callback's identity
  // (it changes exactly when a dependency does) is that cache's invalidation key.
  const buildAllLines = useCallback((): AllLines => {
    if (!current) {
      return {
        lines: EMPTY_FC,
        angleLines: EMPTY_FC,
        parans: EMPTY_FC,
        starLines: EMPTY_FC,
        localSpace: EMPTY_FC,
        overlayLines: null,
        overlayParans: null,
        overlayLocalSpace: null,
        natalAngleLines: EMPTY_FC,
        natalParans: EMPTY_FC,
        natalStarLines: EMPTY_FC,
        minorLines: EMPTY_FC,
        overlayMinorLines: null,
        minorParans: EMPTY_FC,
        overlayMinorParans: null,
        skyHeld,
      };
    }
    const effCoordSystem: CoordSystem = lineSystem === 'geodetic' ? 'zodiaco' : coordSystem;
    // Natal: allLines / allParans / allLocalSpace are ALREADY unfiltered; aspects + midpoints are
    // regenerated here from the FULL body set (not the visible subset), all line types; star lines
    // are generated regardless of the Fixed Stars toggle. The aspect-line display
    // filters are intentionally NOT applied either — this is the everything set.
    const natalLines = withThemeLineColors(allLines, theme);
    const angleFeatures: Feature<LineString, AngleOverlayLineProps>[] = [
      ...generateAspectLines(linePositions, meridianLng, effCoordSystem, eps, lineOpts).features,
      ...generateMidpointLines(linePositions, meridianLng, effCoordSystem, eps, lineOpts).features,
    ];
    const natalAngleLines = withThemeLineColors(
      { type: 'FeatureCollection', features: angleFeatures },
      theme,
    );
    // Unknown birth time: on a celestial map the natal families above are already empty
    // (linePositions is emptied at the source). On a geodetic map the planet, aspect and
    // midpoint lines are drawn from the 12:00 placeholder, so they are here too — every
    // consumer of this set that lists lines for a timeless chart guards itself — while
    // allParans keeps its own gate (skyFamiliesOff). The star lines generate from the
    // catalog + jd alone, so they read that gate here too, in either system. (2026-10-02)
    //
    // On a geodetic map the whole set is built HELD (skyHeld, returned below so a listing
    // can say so): that gate empties the natal parans and star lines, allLocalSpace is
    // empty, every generator leaves the Vertex axis out (lineOpts), and the overlay's
    // parans, local space and star lines are left out below. (2026-10-02)
    const natalStarLines = skyFamiliesOff
      ? EMPTY_FC
      : generateStarLines(
          starsOfDate(jd, starSet),
          meridianLng,
          lineSystem === 'geodetic' ? eps : null,
          STAR_LINE_COLORS[theme],
        );
    // Overlay (transits / progressions / synastry / …), if one is active — the same generators on
    // the overlay's positions/frame, tagged, unfiltered. Mirrors the `overlay` memo below sans filters.
    let overlayLines: FeatureCollection | null = null;
    let overlayParans: FeatureCollection | null = null;
    let overlayLocalSpace: FeatureCollection | null = null;
    let overlayMinorAll: FeatureCollection | null = null;
    let overlayMinorParansAll: FeatureCollection | null = null;
    // The catalog bodies' parans with the planets, the chart's: only while the reader's
    // switch is in effect (minorParansOn — held with the map's parans, so a set that lists
    // them never lists rows the reader can't switch on), and, as allParans, none without a
    // birth time. Every built-in body for a partner — unfiltered, as allParans pairs every
    // body — from the lines' own positions, meridian and decoration.
    const natalMinorParans: FeatureCollection =
      minorParansOn && !skyFamiliesOff && minorLinePositions.length > 0
        ? generateMinorParans(minorLinePositions, linePositions, meridianLng, minorDecor)
        : EMPTY_FC;
    // One-frame rule: when an overlay is active its aspect/midpoint and star families
    // REPLACE the natal ones in the complete set, so a reveal/report reads the active frame.
    // The parans left that rule on 2026-10-06 (see overlayAux): the chart's stay in `parans`
    // beside an overlay, as they stay on the map, and the overlay's ride in `overlayParans`.
    let angleLinesOut: FeatureCollection = natalAngleLines;
    let starLinesOut: FeatureCollection = natalStarLines;
    if (overlayLayer) {
      const prefix = OVERLAY_LABEL_PREFIX[overlayLayer.kind];
      const isCyclo = overlayLayer.kind === 'cyclo';
      const ovEps = obliquity(overlayLayer.jd);
      const ovPositions =
        lineSystem === 'geodetic' || coordSystem === 'zodiaco'
          ? projectOntoEcliptic(overlayLayer.positions, overlayLayer.jd)
          : overlayLayer.positions;
      const ovMeridianLng: MeridianLng = meridianLngFor(lineSystem, ovEps, overlayLayer.gmst);
      overlayLines = withThemeLineColors(
        isCyclo
          ? tagLabelsBy(generateLines(ovPositions, ovMeridianLng, lineOpts), (p) =>
              cycloBodyTag(p.planet),
            )
          : tagLabels(generateLines(ovPositions, ovMeridianLng, lineOpts), prefix),
        theme,
      );
      // Parans suppressed under Cyclocartography (no single sky-moment across epochs), and
      // held on a geodetic map.
      overlayParans =
        skyHeld || overlayAuxBlocked(overlayLayer.kind, 'paran')
          ? null
          : tagLabels(generateParans(ovPositions, ovMeridianLng), prefix);
      // The catalog bodies beside it: the drawn set's samples and frame (overlayMinor),
      // every angle and no filter — what the natal minorLines below is for the chart.
      const ovMinor = overlayMinorLines(overlayLayer, overlayMinorSampled, {
        lineSystem,
        coordSystem,
        visibleLineTypes: ALL_MINOR_ANGLES,
        zenith: false,
        decor: minorDecor,
      });
      overlayMinorAll = ovMinor.lines;
      // …and their parans with the overlay's bodies, wherever its planet parans are in this
      // set (overlayParans), the switch in effect — tagged as its catalog lines are.
      overlayMinorParansAll =
        overlayParans && minorParansOn && ovMinor.positions.length > 0
          ? tagMinor(
              generateMinorParans(ovMinor.positions, ovPositions, ovMinor.meridianLng, minorDecor),
              prefix,
            )
          : null;
      overlayLocalSpace = skyHeld
        ? null
        : withThemeLineColors(
            generateLocalSpace(
              overlayLayer.positions,
              overlayLayer.gmst,
              overlayLayer.originLat,
              overlayLayer.originLng,
            ),
            theme,
          );
      if (overlayAux) {
        // Aspect + midpoint (midpoint dropped on Cyclo) + star, on the overlay frame.
        const ovAngleFeatures: Feature<LineString, AngleOverlayLineProps>[] = [
          ...generateAspectLines(ovPositions, ovMeridianLng, effCoordSystem, ovEps, lineOpts)
            .features,
          ...(overlayAuxBlocked(overlayLayer.kind, 'midpoint')
            ? []
            : generateMidpointLines(ovPositions, ovMeridianLng, effCoordSystem, ovEps, lineOpts)
                .features),
        ];
        const ovAngleFc: FeatureCollection<LineString, AngleOverlayLineProps> = {
          type: 'FeatureCollection',
          features: ovAngleFeatures,
        };
        angleLinesOut = withThemeLineColors(
          isCyclo
            ? tagLabelsBy(ovAngleFc, (p) => cycloBodyTag(p.planet))
            : tagLabels(ovAngleFc, prefix),
          theme,
        );
        starLinesOut = skyHeld
          ? EMPTY_FC
          : tagLabels(
              generateStarLines(
                starsOfDate(overlayLayer.jd, starSet),
                ovMeridianLng,
                lineSystem === 'geodetic' ? ovEps : null,
                STAR_LINE_COLORS[theme],
              ),
              isCyclo ? 'Tr' : prefix,
            );
      }
    }
    return {
      lines: natalLines,
      angleLines: angleLinesOut,
      parans: allParans,
      starLines: starLinesOut,
      localSpace: allLocalSpace,
      overlayLines,
      overlayParans,
      overlayLocalSpace,
      // The natal originals the one-frame rule chose between above, published
      // rather than discarded: they are already built, and a consumer reading
      // the natal promise while an overlay is active has no other way back to
      // them. (natalParans now equals `parans` — the parans left the rule on
      // 2026-10-06 — and is kept so the slot's readers need not change.)
      natalAngleLines,
      natalParans: allParans,
      natalStarLines,
      // Catalog bodies: the chart's own, every line type of the ones in play — and an
      // overlay's beside them, tagged, as the overlay's planet lines are. No one-frame rule
      // to choose between: catalog lines are angle lines, which an overlay draws beside
      // the chart's rather than in place of them.
      minorLines: allMinorLines,
      overlayMinorLines: overlayMinorAll,
      // Their parans with the planets, the chart's, beside an overlay too — as `parans`.
      minorParans: natalMinorParans,
      overlayMinorParans: overlayMinorParansAll,
      skyHeld,
    };
  }, [
    current,
    lineSystem,
    coordSystem,
    allLines,
    allMinorLines,
    overlayMinorSampled,
    minorDecor,
    minorParansOn,
    minorLinePositions,
    theme,
    linePositions,
    meridianLng,
    eps,
    jd,
    starSet,
    overlayLayer,
    overlayAux,
    allParans,
    allLocalSpace,
    skyFamiliesOff,
    skyHeld,
    lineOpts,
  ]);

  // The caching face of the builder above: the set is computed lazily ONCE per input
  // state and handed back to every caller — several consumers may each ask for the
  // complete set (repeated point queries, panels open side by side), and before this
  // cache each call re-ran every generator. The cache keys on the builder's identity,
  // so `collectAllLines` still changes identity exactly when the set's inputs do —
  // callers keep keying their own caches on it. The returned object is shared:
  // treat it as immutable.
  const allLinesCacheRef = useRef<{ build: () => AllLines; set: AllLines } | null>(null);
  const collectAllLines = useCallback((): AllLines => {
    const cur = allLinesCacheRef.current;
    if (cur && cur.build === buildAllLines) return cur.set;
    const set = buildAllLines();
    allLinesCacheRef.current = { build: buildAllLines, set };
    return set;
  }, [buildAllLines]);

  // A compact stamp of the STABLE inputs behind the line set: it changes exactly when the
  // regenerated geometry/labels/colours would — chart, framing systems, node type, late-loaded
  // ephemeris data, star catalog, theme, overlay KIND + its rate settings — while deliberately
  // EXCLUDING the overlay's moving instant (targetDate / an eclipse pick), so a consumer keying
  // a cache or a recompute effect on it is not re-triggered per animation tick while a timeline
  // plays. Read `targetDate` alongside it when the frame instant matters. (The local-space
  // origin is also excluded: a pin drag re-reads on the next real change.)
  const linesStamp = useMemo(
    () =>
      [
        current?.id ?? '',
        jd,
        nodeType,
        ephemerisEpoch,
        lineSystem,
        coordSystem,
        starSet,
        theme,
        overlayMode,
        overlayAux,
        partner?.id ?? '',
        angleProgression,
        primaryRate,
        userPrimaryRate,
        // The catalog bodies in play (switched on AND loaded): one landing or leaving
        // changes the complete set.
        minorNumbers.join(','),
        // …and whether their parans with the planets are in it (the switch, as derived).
        minorParansOn ? 'mp' : '',
      ].join('|'),
    [
      current,
      jd,
      nodeType,
      ephemerisEpoch,
      minorNumbers,
      minorParansOn,
      lineSystem,
      coordSystem,
      starSet,
      theme,
      overlayMode,
      overlayAux,
      partner,
      angleProgression,
      primaryRate,
      userPrimaryRate,
    ],
  );

  // The line "spotlight": when set, the <Map> dims and draws only the lines
  // within radiusKm of `center` (a null center = aiming: dim + hide all lines); null = the normal
  // map. The plugin drives it through setLineSpotlight on the extension ctx below.
  const [lineSpotlight, setLineSpotlight] = useState<LineSpotlight | null>(null);
  const spotlightActive = lineSpotlight != null;
  // Aiming = a spotlight is up but has no centre yet (the tool is picking a point). Gates the map's
  // single-click card/zenith suppression: while aiming a click PLACES the centre; once placed a
  // click on a revealed line pops its card as usual.
  const spotlightAiming = lineSpotlight != null && lineSpotlight.center == null;
  // Narrow one line family to the spotlight: passthrough when off, empty while aiming (null
  // centre), else only the features passing within radiusKm of the centre. Per-feature, so a
  // whole-line single feature reveals whole.
  // Narrow one line family to the spotlight. Off → passthrough (the effective linework). Aiming (a
  // null centre) → empty. Reveal → filter to the radius, preferring the FULL set the caller passes
  // (EVERYTHING, ignoring the user's filters + Advanced toggles) and falling back to the effective
  // linework when none was provided.
  const applySpot = useCallback(
    <P,>(
      eff: FeatureCollection<LineString, P>,
      full?: FeatureCollection | null,
    ): FeatureCollection<LineString, P> => {
      if (!lineSpotlight) return eff;
      const c = lineSpotlight.center;
      if (!c) return EMPTY_FC as FeatureCollection<LineString, P>;
      const source = (lineSpotlight.lines && full ? full : eff) as FeatureCollection<LineString, P>;
      return filterWithinKm(source, c.lat, c.lng, lineSpotlight.radiusKm);
    },
    [lineSpotlight],
  );

  // ── Effective linework actually drawn, resolved once (the eclipse clean-up toggle +
  // the promoted-overlay swap) and shared by the <Map> props and the extension ctx. The ctx
  // exposes this FULL set so a consumer can measure every visible line and decide
  // proximity itself; the <Map> narrows each line family through the spotlight (applySpot) and
  // drops the non-line families while a spotlight is active, for a lines-only reveal on a dim map.
  const effLines = eclipseSolo ? EMPTY_FC : promoted ? promoted.lines : lines;
  // The DRAW-only twin of effLines, for Advanced ▸ Lines ▸ Natal Lines. It forks here
  // rather than above it because the two hides answer different questions: eclipseSolo
  // asks "what is on the map", which a report must agree with, while this one asks only
  // "what am I looking at right now". So the ctx below keeps effLines and every panel
  // goes on reading, measuring and reporting the lines the map has stopped drawing.
  //
  // A spotlight still reveals them, as it already does through the planet and angle
  // filters: the reveal is a deliberate "show me everything near HERE", and a filter it
  // honoured would make the one gesture meant to find a line unable to find it.
  const drawLines = hideNatalAngles ? EMPTY_FC : effLines;
  // A timeless chart on a geodetic map draws its lines from the 12:00 placeholder; the
  // Moon's and Mercury's can be anywhere in a band either side by the real hour, so each of
  // their lines gets one, filled in its own colour (lib/astro/uncertaintyBands). Built from
  // drawLines, so a band goes wherever its line goes — the planet and Angles filters, the
  // natal-lines hide, the eclipse clean-up — and from the very positions, frame and
  // obliquity the lines were (CLAUDE.md rule 5). None while an overlay is promoted: its
  // lines are another moment's, which has a time. (2026-10-02)
  const uncertaintyBands = useMemo(
    () =>
      !timelessGeodetic || promoted
        ? EMPTY_FC
        : generateUncertaintyBands(drawLines, linePositions, TIMELESS_BAND_DEG, meridianLng, eps),
    [timelessGeodetic, promoted, drawLines, linePositions, meridianLng, eps],
  );
  // Auxiliary families follow the ACTIVE FRAME (one-frame rule): the overlay's own
  // aspect/midpoint/star/paran set when an overlay is active, the natal set otherwise —
  // never both, and independent of the Natal display toggle (which the promoted swap
  // of the PRIMARY lines still honors). Eclipses keep the natal set (overlayAux false).
  const effAngleLines = eclipseSolo
    ? EMPTY_FC
    : overlayAux
      ? overlayAngleLines
      : angleLines;
  const effStarLines = eclipseSolo
    ? EMPTY_FC
    : overlayAux
      ? overlayStarLines
      : starLines;
  // Catalog minor-body lines ride WITH the natal planet lines: gone under the eclipse
  // clean-up, swapped for the overlay's own catalog lines while it is promoted (tagged, in
  // the natal source, exactly as the promoted planet lines are), and — for DRAWING only —
  // under Natal Lines, exactly as effLines/drawLines above split it.
  const effMinorLines = eclipseSolo
    ? EMPTY_FC
    : promoted
      ? (overlayMinor?.lines ?? EMPTY_FC)
      : minorLines;
  const drawMinorLines = hideNatalAngles ? EMPTY_FC : effMinorLines;
  // The rows follow the same split, so a row reads 'shown' only while its lines are
  // there: the EFF rows (the extension context, beside effMinorLines — a panel that keeps
  // reading the natal lines under the Natal Lines hide keeps seeing these as shown) and
  // the DRAWN rows (the window and the More button's count, which describe the screen).
  // A promoted overlay is not a gate here: the rows already read its set (minorRows).
  const minorRowsEff = useMemo(
    () => withMinorDrawGate(minorRows, eclipseSolo ? 'natalOff' : null),
    [minorRows, eclipseSolo],
  );
  const minorRowsDrawn = useMemo(
    () => withMinorDrawGate(minorRowsEff, hideNatalAngles ? 'natalOff' : null),
    [minorRowsEff, hideNatalAngles],
  );
  // Their zenith coins follow the planets' stamps' gates (the MC filter, applied where
  // they're generated; Zeniths/Nadirs, Natal Lines, eclipse clean-up) and, like the
  // lines, are the overlay's while it is promoted.
  const effMinorZenith =
    eclipseSolo || hideNatalAngles || !effShowZenith
      ? EMPTY_FC
      : promoted
        ? (overlayMinor?.zenith ?? EMPTY_FC)
        : minorZenith;
  // (effParans and its draw twin drawParans are resolved above the orb bands, which read
  // them.) The catalog parans take the planets' parans' exact path: gone under the eclipse
  // clean-up, the overlay's own while it is promoted (tagged, in the chart's source, as the
  // promoted planet parans are), and otherwise the chart's, beside an overlay's too — whose
  // own ride in its bundle, effMapOverlay.minorParans. The draw twin takes the Natal Lines
  // hide beside an overlay, as drawParans does.
  const effMinorParans: FeatureCollection<LineString, MinorParanProps> = eclipseSolo
    ? NO_MINOR_PARANS
    : promoted
      ? (overlayMinorParans ?? NO_MINOR_PARANS)
      : minorParans;
  const drawMinorParans = overlayLayer && hideNatalAngles ? NO_MINOR_PARANS : effMinorParans;
  const effLocalSpace = eclipseSolo ? EMPTY_FC : promoted ? promoted.localSpace : localSpace;
  // The three below are map-only — nothing on the extension context carries them — so
  // they take the Natal Lines hide in place rather than needing a draw* twin. Each is a
  // mark ON a natal angle line (a crossing dot, a zenith circle or nadir diamond) or the
  // curve those stamps are read against, so each goes when the line under it does.
  const effLocalSpaceCross =
    eclipseSolo || hideNatalAngles
      ? EMPTY_FC
      : promoted
        ? promoted.localSpaceCross
        : localSpaceCross;
  const effLocalSpaceOrigin =
    lsActive && !eclipseSolo ? (promoted ? promoted.origin : localSpaceOrigin) : null;
  const effZenith =
    eclipseSolo || hideNatalAngles || !effShowZenith
      ? EMPTY_FC
      : promoted
        ? promoted.zenith
        : zenith;
  const effNadir =
    eclipseSolo || hideNatalAngles || !effShowZenith ? EMPTY_FC : mapNadir;
  const effEcliptic =
    eclipseSolo || hideNatalAngles || !effShowZenith
      ? null
      : promoted
        ? promoted.eclipticLine
        : eclipticLine;
  const effOverlayLines = promoted ? null : (mapOverlay?.lines ?? null);
  const effOverlayParans = promoted ? null : (mapOverlay?.parans ?? null);
  const effOverlayLocalSpace = promoted ? null : (mapOverlay?.localSpace ?? null);
  // An overlay's catalog lines beside the chart's, as the extension context hands them:
  // null exactly when effOverlayLines is (no overlay on the map, or promoted — its catalog
  // lines are then effMinorLines), and empty while it places none.
  const effOverlayMinorLines = promoted || !mapOverlay ? null : (mapOverlay.minorLines ?? EMPTY_FC);
  const effMapOverlay = promoted ? null : mapOverlay;

  // ── The geodetic grid (lib/astro/geodeticGrid) ──────────────────────────────────────────
  // Drawn only on a geodetic map: the DERIVED line system, so a sidereal zodiac and the hold
  // mask it with no clause of their own, and the reader's switches stay as they were for when
  // Geodetic comes back (CLAUDE.md rule 2). The grid reads no chart, so it draws the same with
  // or without one. (2026-10-02)
  const geoGridShown = lineSystem === 'geodetic';
  // "Body lines visible" for the Ascendant curves' auto default: every family of body line as
  // drawn — the planet lines (after the filters, the eclipse clean-up and the Natal Lines hide,
  // promoted overlay included), an overlay's, the catalog bodies', the aspect/midpoint lines,
  // the fixed stars' and the parans. A hold may empty the last two on a geodetic map; they are
  // counted all the same, because the rule is about what is drawn, not what is held.
  // Local space is not here: it never draws on a geodetic map, so never beside the grid.
  // The spotlight is not counted — it is a transient reveal, and the grid drops out under it
  // anyway. (2026-10-02)
  const bodyLinesDrawn =
    drawLines.features.length > 0 ||
    (effOverlayLines?.features.length ?? 0) > 0 ||
    drawMinorLines.features.length > 0 ||
    (effMapOverlay?.minorLines?.features.length ?? 0) > 0 ||
    effAngleLines.features.length > 0 ||
    effStarLines.features.length > 0 ||
    drawParans.features.length > 0 ||
    (effOverlayParans?.features.length ?? 0) > 0 ||
    drawMinorParans.features.length > 0 ||
    (effMapOverlay?.minorParans?.features.length ?? 0) > 0;
  // How many of the reader's catalog bodies have parans drawn on the map now, the chart's and
  // an overlay's beside it — handed to the sky band's track (SkyBandTrackContext), which reads
  // only the built-in bodies and says so while any catalog body has some (rule 5).
  const minorParanBodies = useMemo(() => {
    const drawn = new Set<number>();
    for (const fc of [drawMinorParans, effMapOverlay?.minorParans]) {
      for (const f of fc?.features ?? []) drawn.add(f.properties.number);
    }
    return drawn.size;
  }, [drawMinorParans, effMapOverlay]);
  const openMinorBodiesView = useCallback(() => openViewById('minorBodies'), [openViewById]);
  // The Ascendant curves: the reader's choice once they have made one, else on while no body
  // lines are drawn and off (but one click away) while any are. Derived every render, never
  // written: the line count is a standing state, not an event. (2026-10-02)
  const geoGridAscOn = geoGridAscPref ?? !bodyLinesDrawn;
  const geoZones = useMemo<FeatureCollection<Polygon, GeoZoneProps>>(
    () =>
      geoGridShown && geoZonesOn
        ? buildGeoZones(
            GEO_ZONE_COLORS[theme],
            geoZonesPresentation ? GEO_ZONE_OPACITY.presentation : GEO_ZONE_OPACITY.normal,
            geoZoneIsolate,
          )
        : EMPTY_FC,
    [geoGridShown, geoZonesOn, geoZonesPresentation, geoZoneIsolate, theme],
  );
  // The hover readout's place names: the bundled cities, loaded on first use of the grid.
  // (2026-10-02)
  const nearestCityFn = useNearestCity(geoGridShown);
  // Whenever any grid layer is drawn. The place is the nearest city's own name ("Toronto", not
  // "Toronto, Ontario, Canada"); null over open ground or water, where the map prints the
  // coordinates instead. The map hands over a canonical longitude on every world copy, which
  // the city lookup needs (it misses Toronto at 280.6°E). (2026-10-02)
  const geoReadout = useMemo(
    () =>
      geoGridShown && (geoGridMcOn || geoGridAscOn || geoZonesOn)
        ? (lat: number, lng: number): GeoReadout => {
            const city = nearestCityFn?.(lat, lng) ?? null;
            return {
              ...geoReadoutAngles(lat, lng),
              place: city ? city.label.split(',')[0].trim() || null : null,
            };
          }
        : null,
    [geoGridShown, geoGridMcOn, geoGridAscOn, geoZonesOn, nearestCityFn],
  );
  // The Ascendant zones the hover lights — everywhere the readout gives the AS sign under the
  // cursor — built in idle-time slices the first time any grid layer is drawn (the readout is
  // up from then, hovered or not), and from then on one module constant for the page. Until
  // they are built, the hover simply lights nothing; Zone shading does not gate them.
  // (2026-10-02)
  const geoAscZones = useGeoAscZones(geoReadout !== null);

  // The spotlight-narrowed line FCs for the <Map>, MEMOIZED so their references stay stable when the
  // inputs (the spotlight + the effective linework) don't change. Without this, applySpot rebuilds a
  // fresh filtered FeatureCollection every render — which re-pushes to the map each render AND, on
  // tool EXIT, leaves the sources mid-update across the two-render teardown (openTools clears first,
  // then the spotlight), stranding the filtered subset instead of restoring the full set. `applySpot`
  // is stable per spotlight; each eff* is a stable ref per line memo.
  // Each family passes its EFFECTIVE FC plus the matching FULL family from the spotlight (when the
  // caller supplied one); applySpot reveals the full set within the radius, else the effective.
  const fullSet = lineSpotlight?.lines ?? null;
  const spotLines = useMemo(() => applySpot(drawLines, fullSet?.lines), [applySpot, drawLines, fullSet]);
  const spotAngleLines = useMemo(() => applySpot(effAngleLines, fullSet?.angleLines), [applySpot, effAngleLines, fullSet]);
  const spotParans = useMemo(() => applySpot(drawParans, fullSet?.parans), [applySpot, drawParans, fullSet]);
  const spotStarLines = useMemo(() => applySpot(effStarLines, fullSet?.starLines), [applySpot, effStarLines, fullSet]);
  // A spotlight carrying its OWN set but no catalog family (a surface that doesn't
  // handle catalog bodies builds its set without them) reveals NO catalog lines —
  // falling back to the drawn set would slip lines that surface never measured into
  // its reveal. Hence `?? EMPTY_FC` rather than passing the optional field through.
  const spotMinorLines = useMemo(
    () => applySpot(drawMinorLines, fullSet ? (fullSet.minorLines ?? EMPTY_FC) : undefined),
    [applySpot, drawMinorLines, fullSet],
  );
  // The catalog parans on the same terms as their lines: a spotlight with its own set reveals
  // only the catalog parans that set carries.
  const spotMinorParans = useMemo(
    () => applySpot(drawMinorParans, fullSet ? (fullSet.minorParans ?? EMPTY_FC) : undefined),
    [applySpot, drawMinorParans, fullSet],
  );
  const spotLocalSpace = useMemo(() => applySpot(effLocalSpace, fullSet?.localSpace), [applySpot, effLocalSpace, fullSet]);
  // The overlay bundle for the <Map>: off → the effective overlay; aiming → hidden; reveal → the
  // overlay's FULL lines within the radius (or the effective overlay as a fallback), non-line
  // families dropped.
  const spotMapOverlay = useMemo<OverlayData | null>(() => {
    if (!lineSpotlight) return effMapOverlay;
    if (!lineSpotlight.center) return null;
    if (!fullSet?.overlayLines && !effMapOverlay) return null;
    return {
      lines: applySpot(effMapOverlay?.lines ?? (EMPTY_FC as OverlayData['lines']), fullSet?.overlayLines),
      parans: applySpot(effMapOverlay?.parans ?? (EMPTY_FC as OverlayData['parans']), fullSet?.overlayParans),
      localSpace: applySpot(
        effMapOverlay?.localSpace ?? (EMPTY_FC as OverlayData['localSpace']),
        fullSet?.overlayLocalSpace,
      ),
      // As spotMinorLines: a spotlight carrying its own set reveals only the catalog lines
      // that set carries — none when it was built without them.
      minorLines: applySpot(
        effMapOverlay?.minorLines ?? (EMPTY_FC as NonNullable<OverlayData['minorLines']>),
        fullSet ? (fullSet.overlayMinorLines ?? EMPTY_FC) : undefined,
      ),
      minorParans: applySpot(
        effMapOverlay?.minorParans ?? NO_MINOR_PARANS,
        fullSet ? (fullSet.overlayMinorParans ?? EMPTY_FC) : undefined,
      ),
      minorZenith: EMPTY_FC as NonNullable<OverlayData['minorZenith']>,
      zenith: EMPTY_FC as OverlayData['zenith'],
      nadir: EMPTY_FC as OverlayData['nadir'],
      ecliptic: EMPTY_FC as OverlayData['ecliptic'],
    };
  }, [lineSpotlight, effMapOverlay, fullSet, applySpot]);

  // The read-only snapshot + actions handed to each open HUD extension.
  const extensionCtx = useMemo<MapExtensionContext>(
    () => ({
      current,
      partner,
      // The provisional birth time, and its setter. Both useState halves: the
      // setter's identity is stable, so it doesn't belong in the deps below.
      timeHypothesis,
      setTimeHypothesis,
      jd,
      targetDate,
      pinned,
      pinnedLabel,
      // The useState setter — stable identity, so it doesn't belong in the deps below.
      placePin: setPinned,
      visiblePlanets,
      nodeType,
      houseSystem,
      zodiacMode: effZodiacMode,
      // The line frame, as the generators see it: geodetic is zodiacal by
      // construction, so the projection reads 'zodiaco' there regardless of the
      // stored preference (the Sidebar's control has no say there, for the same reason).
      coordSystem: lineSystem === 'geodetic' ? 'zodiaco' : coordSystem,
      lineSystem,
      // What the map holds (lib/skyHold): the families it reads the sky's turning for are
      // absent from every line field below BECAUSE held. (2026-10-02)
      skyHeld,
      // EFFECTIVE, for the same reason coordSystem is: a time-unknown chart has no
      // natal frame to hold, so the map draws the moment's own whatever is stored —
      // and a geodetic map holds Natal angles.
      transitFrame: effTransitFrame,
      setTransitFrame: setTransitFrameByUser,
      // EFFECTIVE too, since 2026-10-02: a geodetic map holds it at Natal angles. (The
      // conditions that mask effTransitFrame otherwise can't arise for this one — a chart
      // that can't carry a progressed technique has `overlayMode` masked off it entirely.)
      progAngleFrame: effProgAngleFrame,
      setProgAngleFrame,
      // Measured off the layer the map is actually drawing, so it is right for every
      // overlay without a table of which ones move their frame: the ones that hold the
      // natal RAMC report 0 because their gmst IS the natal one.
      frameOffsetDeg: overlayLayer
        ? Math.abs((normalizeAngle(overlayLayer.gmst - gmst) * 180) / Math.PI)
        : 0,
      // As drawn: night shade is held on a geodetic map, its switch untouched. (2026-10-02)
      nightShadeOn: showNightShade && !skyHeld,
      overlayMode,
      angleProgression,
      primaryRate,
      userPrimaryRate,
      // The FULL effective linework (NOT spotlight-narrowed): a consumer measures every
      // visible line and decides proximity itself; the spotlight only narrows the <Map> draw.
      lines: effLines,
      angleLines: effAngleLines,
      parans: effParans,
      starParans,
      overlayLines: effOverlayLines,
      overlayParans: effOverlayParans,
      localSpace: effLocalSpace,
      starLines: effStarLines,
      overlayLocalSpace: effOverlayLocalSpace,
      minorLines: effMinorLines,
      overlayMinorLines: effOverlayMinorLines,
      minorBodies: minorRowsEff,
      // DERIVED: the stored switch, held while the map's parans are (CLAUDE.md rule 2).
      minorParansOn,
      flyTo: extFlyTo,
      markArrival,
      // The borrow-ending setter, so a panel's "jump to this date" leaves the return
      // rather than dragging its frame along to an unrelated moment.
      setTargetDate: moveTimeline,
      // The exclusion-aware setter (not the raw setOverlayMode) so an extension HUD that
      // drives a core overlay mode also clears any active extension overlay — preserving
      // the Overlay menu's single-select invariant.
      setOverlayMode: selectOverlay,
      openExtensionIds: openExtensions,
      openExtension: openExtensionById,
      openTool: openToolById,
      openCapture: openCaptureTool,
      openBuiltinTool,
      setLineSpotlight,
      collectAllLines,
      linesStamp,
      advancedMode: advancedWheel,
      setAdvancedMode,
      openView: openViewById,
      openSettings: openSettingsSection,
      openCredits: () => setCreditsOpen(true),
      viewFlags: { guides: showGuides, info: showInfo },
      setViewFlag,
      openToolIds: openTools,
      mapTool,
      closeTool: closeToolById,
    }),
    [
      current,
      partner,
      timeHypothesis,
      jd,
      targetDate,
      pinned,
      pinnedLabel,
      visiblePlanets,
      nodeType,
      houseSystem,
      effZodiacMode,
      coordSystem,
      lineSystem,
      skyHeld,
      effTransitFrame,
      effProgAngleFrame,
      overlayLayer,
      gmst,
      overlayMode,
      angleProgression,
      primaryRate,
      userPrimaryRate,
      lines,
      angleLines,
      parans,
      starLines,
      overlayAux,
      overlayAngleLines,
      overlayStarLines,
      localSpace,
      starParans,
      mapOverlay,
      promoted,
      eclipseSolo,
      minorLines,
      overlayMinor,
      minorRowsEff,
      minorParansOn,
      extFlyTo,
      selectOverlay,
      openExtensions,
      openExtensionById,
      openToolById,
      openCaptureTool,
      openBuiltinTool,
      collectAllLines,
      linesStamp,
      showNightShade,
      advancedWheel,
      setAdvancedMode,
      openViewById,
      openSettingsSection,
      showGuides,
      showInfo,
      setViewFlag,
      openTools,
      mapTool,
      closeToolById,
    ],
  );

  return (
    <>
      <Map
        ref={mapRef}
        overlayCtx={extensionCtx}
        creditsOpen={creditsOpen}
        setCreditsOpen={setCreditsOpen}
        skyFollow={skyBeaconMode}
        skyFollowHeld={skyParked}
        arrivalMark={arrivalMark}
        onCameraJump={clearArrivalMark}
        // Withdrawn while another gesture owns map clicks — the same conditions the
        // map's own click handler bails on. Withdrawing the HANDLER rather than
        // guarding inside it is what makes the deferral honest: the mark drops its
        // affordance and its pointer events together, so the click lands on the map
        // and reaches the tool that was waiting for it (a spotlight picking a centre
        // confirms off the map-click broadcast) instead of being eaten by a crosshair
        // that still looked live. Measure and Slide own the surface outright.
        onArrivalClick={
          mapTool === 'measure' || sliding || spotlightAiming ? undefined : onArrivalClick
        }
        home={homeMark}
        // Withdrawn under the same conditions and for the same reason as the
        // crosshair's handler above — the house is a bigger target than the
        // crosshair, so a live one left over a tool's aiming click is worse here.
        onHomeClick={
          mapTool === 'measure' || sliding || spotlightAiming ? undefined : onHomeClick
        }
        // Registered-overlay hides apply only while the Capture tool is armed —
        // closing it always restores every overlay, whatever the persisted set says.
        hiddenOverlayIds={
          mapTool === 'capture'
            ? lsTransparent
              ? allCaptureOverlayIds // transparent mode: withhold every overlay (journal etc.)
              : captureHiddenOverlays
            : undefined
        }
        // Line families are narrowed to the spotlight (applySpot: passthrough when off, all
        // hidden while aiming, only the in-radius lines once a centre is set). The eff* values
        // already resolve the eclipse "hide natal" toggle + the promoted-overlay swap.
        lines={spotLines}
        angleLines={spotAngleLines}
        parans={spotParans}
        starLines={spotStarLines}
        minorLines={spotMinorLines}
        minorParans={spotMinorParans}
        localSpace={spotLocalSpace}
        overlay={spotMapOverlay}
        // While a spotlight is active the reveal is lines-only on a dimmed map, so the non-line
        // families (orb bands, night shade, LS crossings/compass, zenith/nadir stamps, ecliptic,
        // eclipse paths) drop out; otherwise they pass through unchanged.
        orbBands={spotlightActive ? EMPTY_FC : orbBands}
        nightShade={spotlightActive ? EMPTY_FC : nightShade}
        // The geodetic grid drops out under a spotlight like the other non-line families. Its
        // collections are module constants (geoGrid(), the Ascendant zones), so they tile once
        // and are only ever swapped for the empty one. The Ascendant zones go with the readout,
        // which lights them. (2026-10-02)
        geoGridMc={geoGridShown && geoGridMcOn && !spotlightActive ? geoGrid().mc : EMPTY_FC}
        geoGridAsc={geoGridShown && geoGridAscOn && !spotlightActive ? geoGrid().asc : EMPTY_FC}
        geoZones={spotlightActive ? EMPTY_FC : geoZones}
        geoAscZones={geoReadout && geoAscZones && !spotlightActive ? geoAscZones : EMPTY_FC}
        // A wash like the zones, so a spotlight's lines-only reveal drops it too. (2026-10-02)
        uncertaintyBands={spotlightActive ? EMPTY_FC : uncertaintyBands}
        geoReadout={spotlightActive ? null : geoReadout}
        localSpaceCross={spotlightActive ? EMPTY_FC : effLocalSpaceCross}
        localSpaceOrigin={spotlightActive ? null : effLocalSpaceOrigin}
        hideCompass={hideLsCompass}
        // Transparent (Local Space) — one gated preset driving all three export treatments
        // (hide basemap + hide arrows + standard labels). lsTransparent also strips the details
        // view + overlays + caption band (see its definition + the frame props below).
        hideBasemap={lsTransparent}
        hideLsArrows={lsTransparent}
        lsEdgeLabels={lsTransparent}
        zenith={spotlightActive ? EMPTY_FC : effZenith}
        minorZenith={spotlightActive ? EMPTY_FC : effMinorZenith}
        nadir={spotlightActive ? EMPTY_FC : effNadir}
        ecliptic={spotlightActive ? null : effEcliptic}
        eclipse={spotlightActive ? null : eclipseMapData}
        eclipseTip={eclipseTip}
        eclipseCard={eclipseCard}
        lineCard={lineCard}
        pin={pinned}
        // Natal wins when a chart's home and birthplace are the same place: that
        // point is the chart's own, and the green pin is the older, louder fact.
        pinType={isNatalPin ? 'natal' : isHomePin ? 'home' : pinned ? 'custom' : null}
        distanceRef={distanceRef}
        // First-load framing centres on the active chart's birthplace (read once
        // at mount inside Map); later chart switches recenter via their own flyTo.
        // A restored share link's exact camera wins over that framing.
        initialCenter={current ? current.birthplace : null}
        initialView={sharedBoot?.view ?? null}
        // The Sky Band reserves a bottom layout band — the GL frame lifts above it.
        bottomInset={skyBandVisible ? skyBandH : 0}
        // A docked panel that reserves a left column (lib/leftDock) — the GL frame
        // shrinks in from the left so the panel sits in its own space, not over the map.
        leftInset={reservedLeftInset}
        theme={theme}
        projection={projection}
        showRoads={showRoads}
        showRivers={showRivers}
        showLabels={showLabels}
        measureActive={mapTool === 'measure'}
        measureSnap={measureSnap}
        measureColor={measureColor}
        onMeasure={setMeasure}
        onMeasureCancel={stopMeasure}
        // Slide tool: spins the globe under the natal cage. While active the Map owns
        // every line/band/point source, rotating them all rigidly by the spin angle so
        // they stay pinned together while the basemap turns. App keeps the whole line
        // pipeline resampled at natal+Δt (via linePositions), so they morph as one.
        slideActive={sliding}
        onSlide={setSlideDt}
        onSlideCancel={stopSlide}
        // Capture: arm the capture frame (inset the working view to the chosen
        // aspect ratio); right-click exits. captureFrame (MapHandle) does the export.
        // When the caption is on, the Map reserves a footer band so labels clear it.
        frameActive={mapTool === 'capture'}
        frameAspect={mapTool === 'capture' ? captureAspect : null}
        frameCaptionText={captureCaptionText}
        // Transparent export: the same fields, unjoined, stacked in the frame's top-left.
        frameCaptionLines={captureCaptionLines}
        // …and the one of them that stays whole when a line still overflows (the coordinates).
        frameCaptionKeep={captureCaptionKeep}
        frameExtras={captureFrameExtras}
        // Chart subject: the details fill the frame as a card and the map stands down.
        frameSubject={captureChart ? 'chart' : 'map'}
        // The balance TOGGLE, not whether the drawn view happens to carry a grid — the fit
        // below decides which views are offered, so it must not depend on the one in use.
        frameWheelGrid={captureExtras.balance}
        // How much room the frame has for the details — drives the wheel's size, and tells
        // the tool when to decline the view rather than export something unreadable.
        onFrameFit={onCaptureFit}
        // Transparent mode drops the caption band + watermark for a clean see-through export.
        noCaption={lsTransparent}
        // Transparent export: clip the LS lines to a circle ~30% wider than the compass with their
        // badges on that rim, and render those badges glyph-only (no "LS") and ~50% larger.
        lsTransparent={lsTransparent}
        // Transparent badge labels (only meaningful there): planet name after the glyph, and the
        // line's bearing printed along the line toward the compass centre.
        lsLabelName={lsTransparent && lsLabelName}
        lsLineDeg={lsTransparent && lsLineDeg}
        onFrameCancel={stopCapture}
        onMissionEvent={recordMission}
        // Force the Zoom-out button to stay put while the zoom guide is up so the user
        // can still complete its click mission even after scrolling out manually — but
        // ONLY until that mission is done. Once clicked, drop back to the normal
        // zoom>=CLOSE_ZOOM rule so the button actually disappears (the click zooms out
        // below the threshold).
        keepZoomOutVisible={missionSet?.id === 'zoom-basics' && !missionProgress.has('zoom-out')}
        onHover={onHover}
        onLeave={onLeave}
        onPlacePin={onPlacePin}
        onRightClick={onRightClick}
        onMapClick={surfaceMissions}
        onDetailZoomChange={setDetailZoom}
        spotlightActive={spotlightActive}
        spotlightAiming={spotlightAiming}
        // An aspect or midpoint edge chip flies to the point where its degree stands
        // overhead — the sky at the chart minute, which a geodetic map holds. There they
        // stay plain labels; planet chips already have no zenith to fly to. (2026-10-02)
        overheadTargets={!skyHeld}
      />
      <div className="map-edge-glow" data-state={coordSource} aria-hidden="true" />
      {!wheelExpanded && (
        <div className="top-left-stack" ref={topLeftStackRef}>
          <ProfileWindow
            advancedWheel={advancedWheel}
            setAdvancedWheel={setAdvancedMode}
          />
          {showCoords && !viewParked && (
            <header className="app-header">
              {provisionalTime ? (
                // The stored record still says the time is unknown. Say which
                // minute the map is answering for, and that nothing was saved —
                // a map drawn from a guess must never look like one drawn from a
                // record.
                <p className="tz-warning">
                  {t('common.provisionalTimeBanner', {
                    time: `${String(current?.hour ?? 0).padStart(2, '0')}:${String(
                      current?.minute ?? 0,
                    ).padStart(2, '0')}`,
                  })}
                </p>
              ) : (
                noTime && <p className="tz-warning">{t('common.timeUnknownBanner')}</p>
              )}
              {current?.tzUncertain && (
                <p className="tz-warning">{t('common.tzWarning')}</p>
              )}
              <CoordReadout
                point={activePoint ?? (current ? current.birthplace : null)}
                angles={coordAngles}
                source={coordSource}
                location={coordLocation}
                fadeLocation={fadeLocation}
              />
            </header>
          )}
        </div>
      )}
      {/* Mount on `showSettings` DIRECTLY (not just settingsMounted) so the dock mounts in the
          SAME commit the nub flips to .is-open. settingsMounted is set in an effect — a render
          cycle LATER — so gating solely on it mounts the panel a frame after the nub starts
          gliding, and the two visibly desync (the nub detaches from the panel's edge mid-slide).
          settingsMounted still holds the panel mounted through the close slide-out. */}
      {(showSettings || settingsMounted) && (
        <Sidebar
          closing={!showSettings}
          onSlideOutEnd={() => setSettingsMounted(false)}
          // The RAW preference: the checkboxes show what the user chose even
          // while a frame parks a point (Fortune In Mundo) from the effective set.
          visiblePlanets={visiblePlanetsPref}
          togglePlanet={togglePlanet}
          setAllPlanets={setAllPlanets}
          minorMore={{
            open: showMinorHud,
            onToggle: () => setShowMinorHud((v) => !v),
            // Counted on the DRAWN rows: '+N' is bodies with lines on screen — the chart's
            // or an overlay's beside it (minorRowHasLines, the rows' own test).
            shown: minorRowsDrawn.filter(minorRowHasLines).length,
            held: minorRowsDrawn.filter((r) => r.status.kind === 'held').length,
          }}
          // The PREFERENCE, as the planets above: a Vertex button masked on a geodetic map
          // still shows the reader's choice, greyed. (2026-10-02)
          visibleLineTypes={visibleLineTypesPref}
          toggleLineType={toggleLineType}
          setAllLineTypes={setAllLineTypes}
          showNatalLines={showNatalLines}
          setShowNatalLines={setShowNatalLines}
          showParans={showParans}
          setShowParans={setShowParans}
          showAspectLines={showAspectLines}
          setShowAspectLines={setShowAspectLines}
          showMidpointLines={showMidpointLines}
          setShowMidpointLines={setShowMidpointLines}
          overlayMode={overlayMode}
          paransOverlayBlocked={paransOverlayBlocked}
          showOrbZones={showOrbZones}
          setShowOrbZones={setShowOrbZones}
          orbZoneVal={orbZoneVal}
          setOrbZoneVal={setOrbZoneVal}
          orbZoneUnit={orbZoneUnit}
          setOrbZoneUnit={changeOrbZoneUnit}
          paranOrbVal={paranOrbVal}
          setParanOrbVal={setParanOrbVal}
          aspectOrbs={aspectOrbs}
          setAspectOrbs={setAspectOrbs}
          aspectHudOpen={showAspectLinesHud}
          setAspectHudOpen={setShowAspectLinesHud}
          showAdvancedTab={advancedWheel}
          showStarLines={showStarLines}
          setShowStarLines={setShowStarLines}
          starSet={starSet}
          setStarSet={setStarSet}
          showNightShade={showNightShade}
          setShowNightShade={setShowNightShade}
          showZenith={showZenith}
          setShowZenith={setShowZenith}
          lineSystem={lineSystem}
          setLineSystem={setLineSystemSafe}
          siderealActive={effZodiacMode !== 'tropical'}
          // The grid's four switches (Sidebar greys them off a geodetic map, with the reason).
          // `asc` is the DERIVED state, so the eye shows what is drawn; the setter stores the
          // reader's choice from then on. (2026-10-02)
          geoGrid={{
            mc: geoGridMcOn,
            setMc: setGeoGridMc,
            asc: geoGridAscOn,
            setAsc: setGeoGridAsc,
            zones: geoZonesOn,
            setZones: setGeoZones,
            presentation: geoZonesPresentation,
            setPresentation: setGeoZonesPresentationPref,
          }}
          coordSystem={coordSystem}
          setCoordSystem={setCoordSystem}
          fortuneFormula={fortuneFormula}
          setFortuneFormula={setFortuneFormula}
          houseSystem={houseSystem}
          setHouseSystem={setHouseSystem}
          zodiacMode={zodiacMode}
          setZodiacMode={setZodiacModeSafe}
          nodeType={nodeType}
          setNodeType={setNodeType}
          rulershipScheme={rulershipScheme}
          setRulershipScheme={setRulershipScheme}
          theme={theme}
          setTheme={setTheme}
          projection={projection}
          setProjection={setProjection}
          showRoads={showRoads}
          setShowRoads={setShowRoads}
          showRivers={showRivers}
          setShowRivers={setShowRivers}
          showLabels={showLabels}
          setShowLabels={setShowLabels}
          openSection={sidebarSection}
          setOpenSection={openSidebarSection}
          onClose={() => setShowSettings(false)}
        />
      )}
      <SettingsNub open={showSettings} onToggle={() => setShowSettings((v) => !v)} />
      <TopNav
        mapState={coordSource}
        pinned={pinned != null}
        onRecenterPin={onRecenterPin}
        onPinNatal={onPinNatal}
        current={current}
        charts={charts}
        onSelectChart={selectChart}
        onNewChart={() => setCreating(true)}
        onEditChart={(id) => setEditingId(id)}
        onDeleteChart={handleDelete}
        chartFlash={wheelExpanded ? null : chartFlash}
        chartExpanded={wheelExpanded}
        onToggleExpand={() => setWheelExpanded((v) => !v)}
        tool={mapTool}
        setTool={setMapTool}
        measure={measure}
        measureSnap={measureSnap}
        setMeasureSnap={setMeasureSnap}
        slide={slide}
        onToggleSlide={toggleSlide}
        slideEnabled={slideAvailable}
        onSlideNudge={nudgeSlide}
        onSlideReset={resetSlide}
        onSlideStep={stepSlideEvent}
        slideStepEnabled={visiblePlanets.size > 0}
        locationLabel={locationLabel}
        fadeLocation={fadeLocation}
        overlayMode={overlayMode}
        setOverlayMode={selectOverlay}
        showChart={showChart}
        setShowChart={setShowChart}
        showCoords={showCoords}
        setShowCoords={setShowCoords}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        showInfo={showInfo}
        setShowInfo={setShowInfo}
        showTeleport={showTeleport}
        setShowTeleport={setShowTeleport}
        showSkyTimes={showSkyTimes}
        setShowSkyTimes={setShowSkyTimesSafe}
        showLocalSpace={showLocalSpace}
        setShowLocalSpace={setShowLocalSpaceSafe}
        planTier={planTier}
        showGuides={showGuides}
        setShowGuides={toggleGuides}
        openExtensions={openExtensions}
        onToggleExtension={toggleExtension}
        openTools={openTools}
        onToggleTool={toggleTool}
        // The EFFECTIVE line system, for what a geodetic map holds (lib/skyHold).
        lineSystem={lineSystem}
        activeOverlayExt={activeOverlayExt}
        onSelectOverlayExt={selectOverlayExt}
      />
      {/* The zone-shading legend, bottom-right above the active-systems chip: only while the
          shading is drawn. Its isolate is session state (geoZoneIsolate). (2026-10-02) */}
      {geoGridShown && geoZonesOn && !spotlightActive && !viewParked && (
        <GeoZoneLegend theme={theme} isolate={geoZoneIsolate} onIsolate={setGeoZoneIsolate} />
      )}
      {showInfo && !viewParked && (
        <InfoBar
          lineSystem={lineSystem}
          coordSystem={coordSystem}
          houseSystem={houseSystem}
          zodiacMode={zodiacMode}
          nodeType={nodeType}
          advancedMode={advancedWheel}
          overlayFrame={infoOverlayFrame}
          onOpen={(section) => {
            setShowSettings(true);
            openSidebarSection(section);
          }}
          onShowFrameControl={showFrameControl}
        />
      )}
      {isTimeMode && (
        <TimelineHud
          overlayMode={overlayMode}
          mapState={coordSource}
          targetDate={targetDate}
          // The borrow-ending setter — the ruler, the transport ‹ ›, Now and the date
          // picker all move the cursor through this one. The returns ‹ › do NOT: they
          // reach snapToReturn, which keeps the hold and updates its date.
          setTargetDate={moveTimeline}
          stepUnit={stepUnit}
          setStepUnit={setStepUnit}
          playing={playing}
          setPlaying={setPlayingUser}
          charts={charts}
          currentId={current?.id ?? null}
          overlayMeasure={overlayLayer?.measure ?? null}
          showTimeline={overlayExpanded}
          onToggleTimeline={toggleOverlayExpanded}
          onSnapReturn={snapToReturn}
          // The EFFECTIVE frame, so the segments mark what the map is actually drawing
          // rather than a stored preference a borrow (or an unknown birth time) is
          // masking — the guard reads the derived value, the persistence reads the pref.
          transitFrame={effTransitFrame}
          setTransitFrame={setTransitFrameByUser}
          lineSystem={lineSystem}
          frameLocked={noTime}
          returnHold={frameHeldForReturn ? returnBorrow : null}
          onEndReturnHold={endReturnBorrow}
          flashFrameSeq={flashFrameSeq}
          openExtensions={openExtensions}
          onToggleExtension={toggleExtension}
          showNatal={showNatal}
          setShowNatal={setShowNatal}
          arcMethod={arcMethod}
          setArcMethod={setArcMethod}
          // EFFECTIVE, like transitFrame: Natal angles while the map is geodetic, so the
          // pair marks what the map draws; the setter still writes the reader's own choice.
          progAngleFrame={effProgAngleFrame}
          setProgAngleFrame={setProgAngleFrame}
          progAngleMethod={progAngleMethod}
          setProgAngleMethod={setProgAngleMethod}
          primaryRate={primaryRate}
          setPrimaryRate={setPrimaryRate}
          userPrimaryRate={userPrimaryRate}
          setUserPrimaryRate={setUserPrimaryRate}
        />
      )}
      {overlayMode === 'synastry' && (
        <SynastryHud
          partner={partner}
          expanded={overlayExpanded}
          onToggleExpanded={toggleOverlayExpanded}
          onPickPartner={() => setPickingPartner(true)}
          method={synastryMethod}
          setMethod={setSynastryMethod}
          onGenerate={handleGenerateRelationship}
          // A composite can't parent another relationship chart: its midpoint
          // positions aren't reachable from the BirthData a Davison/composite
          // build would snapshot (and stacking midpoints is astrological soup).
          canGenerate={
            !!partner && !current?.composite && !partner.composite
          }
          generateBlock={
            current?.composite || partner?.composite
              ? 'composite'
              : partner
                ? null
                : 'partner'
          }
        />
      )}
      {overlayMode === 'eclipses' && (
        <EclipseHud
          catalog={eclipseCatalog}
          expanded={overlayExpanded}
          onToggleExpanded={toggleOverlayExpanded}
          selected={eclipseRow}
          onSelect={onEclipseSelect}
          onLocate={() => {
            if (eclipseRow) flyToEclipse(eclipseRow);
          }}
          details={eclipseDetails}
          contacts={eclipseContactList}
          showOtherLines={showEclipseOtherLines}
          setShowOtherLines={setShowEclipseOtherLines}
          showChart={showEclipseChart}
          setShowChart={setShowEclipseChart}
          setShowMapLines={setShowEclipseMapLines}
          isoStep={eclipseIsoStep}
          setIsoStep={setEclipseIsoStep}
        />
      )}
      {showTeleport && !viewParked && (
        <TeleportHud
          onFlyTo={teleportToPoint}
          onGoBack={() => {
            const target = mapRef.current?.teleportBack();
            if (target) {
              setLocationReturn((d) => (d === 'forward' ? 'back' : 'forward'));
              setTeleportTarget(target);
              // Going back means the arrival is no longer where you are.
              setArrivalMark(null);
            }
          }}
          backState={locationReturn}
          teleportTarget={teleportTarget}
          onClose={() => setShowTeleport(false)}
        />
      )}
      {/* On a geodetic map the band is HELD: SkyBandHeld draws in its place — the reason,
          its fix, the band's own ✕ — and the band (with its track and the Planetary hours
          window it hosts) isn't mounted at all. Its open flag stays as the reader left it,
          and Celestial brings the band back as it was. (2026-10-02) */}
      {skyBandVisible && (skyHeld ? (
        <SkyBandHeld
          onClose={() => setShowSkyTimes(false)}
          onFix={() => openSettingsSection('calc')}
        />
      ) : (
        <SkyBand
          // The day clock reads at the followed cursor point (while follow mode
          // is on), else the placed pin, else the chart's birthplace.
          point={skyFollowPoint ?? pinned ?? (current ? current.birthplace : null)}
          // Discreet mode blanks the two branches that fall back to the BIRTHPLACE;
          // a followed cursor point and a custom pin are places the user is looking
          // at, so they read on (the same rule the sidebar and caption follow).
          placeLabel={
            skyFollowPoint
              ? (skyFollowCity ?? skyFollowCountry ?? t('common.locationFallbackOcean'))
              : pinned
                ? isNatalPin
                  ? (current ? identity.text(current.birthplace.label) : null)
                  : pinnedLabel
                : (current ? identity.text(current.birthplace.label) : null)
          }
          visiblePlanets={visiblePlanets}
          nodeType={nodeType}
          trackShown={skyBandTrackShown}
          onToggleTrack={() => setSkyBandTrackOn((v) => !v)}
          table={skyBandTable}
          onToggleTable={() => setSkyBandTable((v) => !v)}
          follow={skyFollowMode}
          onToggleFollow={() => setSkyFollowOn((v) => !v)}
          planetaryOpen={showPlanetaryHud}
          onTogglePlanetary={togglePlanetaryHud}
          // While the Slide tool is armed the band shows the slid instant's day
          // (derived — its own paged day is kept for when the tool closes), the
          // track's time cursor follows that instant, and a registered track may
          // scrub it back through slideTo (absent otherwise — the affordance
          // keys off it). The band's own ‹ › / Today / date picker drive Slide
          // through slideBy / slideTo for as long as it is armed.
          slideMs={slide?.ms ?? null}
          slideTo={sliding ? slideToMs : undefined}
          slideBy={sliding ? slideByDays : undefined}
          // For a registered track only: the band reads the day's sky either way,
          // but without a birth time the chart has no parans of its own (allParans is
          // empty in either line system; an overlay can still draw its own).
          chartHasTime={!noTime}
          // For a registered track too: how many catalog bodies have parans on the map, and
          // the window that switches them — a track that rings only the built-in bodies'
          // parans says so while there are any.
          minorParanBodies={minorParanBodies}
          openMinorBodies={openMinorBodiesView}
          // The band's Fortune entry shows only while the map draws the Lot — the
          // same gate as its lines: in the visible set (a zodiacal frame), and
          // fortuneMapPos (Advanced on, a birth time, not a composite). Rule 5.
          fortuneOnMap={fortuneMapPos !== null}
          // The deferred asteroid file arriving: re-solve the shown day with it.
          ephemerisEpoch={ephemerisEpoch}
          onClose={() => setShowSkyTimes(false)}
        />
      ))}
      {showLocalSpace && !viewParked && (
        <LocalSpaceHud
          onClose={() => setShowLocalSpaceSafe(false)}
          // On a geodetic map the window stays, with its header, and shows the hold's
          // reason and fix in place of its content (lib/skyHold, 2026-10-02).
          held={skyHeld}
          onOpenCalc={() => openSettingsSection('calc')}
          // Fly-to-origin reuses the shared teleport hop (camera + the back/forward stash),
          // so a jump to the origin can be undone from the Teleport window / Backspace.
          onFlyTo={teleportToPoint}
          lsOrigin={lsOrigin}
          setLsOrigin={setLsOrigin}
          hideLsInbound={hideLsInbound}
          setHideLsInbound={setHideLsInbound}
          hideLsCompass={hideLsCompass}
          setHideLsCompass={setHideLsCompass}
          localSpaceOrigin={localSpaceOrigin}
        />
      )}
      {/* The Aspect Lines window (gated tier): opened from Settings ▸ Advanced ▸
          Lines ▸ Aspect Lines ▸ "Filters & orbs…". Gated on the aspect lines
          actually drawing AND the plan reaching the gated rung, so turning the
          lines off, leaving Advanced, a tier lapse, or a view lock parks it
          (the open pref persists for when the gates return). Raw aspectOrbs is
          correct here — the window can only exist while Advanced is on, where
          eff === raw. */}
      {/* The Minor bodies window (Map filters ▸ Minor bodies ▸ More, or '4'). Catalog
          bodies are an Advanced reading, so it renders only while Advanced is on — within
          a session the open flag is held, not cleared; across a reload into Basic its
          initializer closes it (see showMinorHud for both gates). The rows are the DRAWN
          twin, so a row reads 'shown' only while its lines are on screen. */}
      {advancedWheel && showMinorHud && !viewParked && (
        <MinorBodiesHud
          onClose={closeMinorHud}
          theme={theme}
          // The RAW built-in preference and its own toggle — the five main asteroids
          // here are the very same switches as in Map filters.
          visiblePlanets={visiblePlanetsPref}
          togglePlanet={togglePlanet}
          api={minorApi}
          rows={minorRowsDrawn}
          onRetry={retryMinorBody}
          // Whose dates a "no data" tip has to name: a composite's two parents, for the
          // chart's lines or a composite partner's beside them.
          composite={{
            chart: !!current?.composite,
            overlay: overlayLayer?.bodyRule.by === 'composite',
          }}
          // "Parans with the planets": the STORED choice, greyed while held, with the reason
          // that holds it and where to change it (CLAUDE.md row A) — the sky hold first, as on
          // the map's own Parans toggle, whose reason outranks Cyclocartography's. The window
          // only renders with Advanced on, so the held map toggle is always reachable.
          parans={{
            on: minorParansPref,
            heldNote: !minorParansHeld
              ? null
              : skyHeld
                ? t('settings.inert.paransHeldFull')
                : paransOverlayBlocked
                  ? t(overlayMode === 'cyclo' ? 'settings.parans.blockedCyclo' : 'settings.parans.blockedOverlay')
                  : t('minorBodies.hud.parans.held'),
            onChange: setMinorParansPref,
          }}
        />
      )}
      {effShowAspectLines && gatedTierMet && showAspectLinesHud && !viewParked && (
        <AspectLinesHud
          onClose={closeAspectLinesHud}
          filters={aspectLineFilters}
          setFilters={setAspectLineFilters}
          aspectOrbs={aspectOrbs}
          setAspectOrbs={setAspectOrbs}
        />
      )}
      {mapTool === 'capture' && (
        <CaptureHud
          onClose={() => setMapTool('off')}
          captureAspect={captureAspect}
          setCaptureAspect={setCaptureAspectPersist}
          // What the frame is a picture of — the map, or the chart on its own.
          subject={captureSubject}
          setSubject={setCaptureSubjectPersist}
          // False when this frame has no room to draw the wheel legibly: the picker
          // declines the view and points at the card instead of exporting a sliced one.
          canWheel={captureFit.canWheel}
          // The declined view is the one the user actually asked for — so the notice (and
          // its way out) appears for them, not for anyone who merely has a small frame.
          // A card can be refused too: a 16:9 strip on a phone has no room for a wheel
          // whoever it belongs to, and there the answer is a different ratio, not a
          // different subject.
          viewBlocked={
            !captureFit.canWheel &&
            (captureChart
              ? // A card draws the wheel unless the list was asked for, so anything but
                // 'list' means a wheel was wanted here.
                captureExtras.view !== 'list'
              : captureExtras.view === 'wheel' && !capturePhone && !lsTransparent)
          }
          // The panel's own report that it is cutting content off — the backstop behind
          // the fit arithmetic, and the only signal that covers the position list.
          detailsClipped={captureFit.clipped}
          captionFields={captureCaptionFields}
          onToggleCaptionField={toggleCaptureCaptionField}
          view={captureViewEff}
          onSetView={setCaptureView}
          extras={captureExtras}
          onToggleExtra={toggleCaptureExtra}
          hiddenOverlays={captureHiddenOverlays}
          onToggleOverlay={toggleCaptureOverlay}
          fileName={captureFileName}
          onCapture={() => mapRef.current?.captureFrame() ?? Promise.resolve(null)}
          // Share link: the chart + this camera + the pin as a #c= URL. A composite
          // isn't shareable (its planets are parent midpoints, not a castable
          // moment), so the button hides for one.
          shareLink={
            current && !current.composite
              ? () =>
                  buildShareUrl({
                    chart: current,
                    view: mapRef.current?.getView() ?? null,
                    pin: pinned ? { lat: pinned.lat, lng: pinned.lng } : null,
                  })
              : null
          }
          // Transparent (Local Space): the gated-tier preset, moved here from the Local
          // Space window. Scoped to LS (shown only while it's active); App gates its EFFECT
          // on lsActive + Capture armed + gatedTierMet at the Map props above. While local
          // space is open but held on a geodetic map, the preset shows the hold's reason
          // instead, its stored state kept. (2026-10-02)
          localSpaceActive={lsActive}
          localSpaceHeld={showLocalSpace && skyHeld}
          transparentMode={transparentMode}
          setTransparentMode={setTransparentMode}
          onFlyToOrigin={flyToLsOrigin}
          lsLabelName={lsLabelName}
          setLsLabelName={setLsLabelName}
          lsLineDeg={lsLineDeg}
          setLsLineDeg={setLsLineDeg}
          planTier={planTier}
        />
      )}
      {/* Registered HUD extensions (registerMapExtension) — add-ons attach here
          with no edits to this file. Entitled → the HUD (the menu hides it
          otherwise). A 'timeline-drawer'-surface extension renders only while a
          time overlay's bar is up; a left-column extension (reservesLeftColumn)
          yields while the expanded chart panel — the other left-edge owner — is
          up. Either way the OPEN state stays put (like the drawer's toggles), so
          the extension returns when the gating condition clears. A view lock
          parks map-layer HUDs only — a modal-layer takeover stacks above the
          viewport's owner, so it stays. */}
      {/* eslint-disable-next-line react-hooks/refs -- ctx.flyTo reads the map ref only when a HUD invokes it from its own event handlers, never during render */}
      {getMapExtensions().map((ext) =>
        openExtensions.has(ext.id) &&
        (!viewParked || ext.layer === 'modal') &&
        (ext.surface !== 'timeline-drawer' || isTimeMode) &&
        (!ext.reservesLeftColumn || !wheelExpanded) ? (
          <Fragment key={ext.id}>
            {isEntitled(ext) && isAvailable(ext)
              ? ext.render(extensionCtx, () => toggleExtension(ext.id))
              : null}
          </Fragment>
        ) : null,
      )}
      {/* Registered Tools-menu extensions (registerToolExtension) — toggled HUDs
          surfaced in the Tools dropdown. Entitled → the HUD. A tool that declares
          `needsSiderealTime` is HELD on a geodetic map: the host draws HeldHud in its
          place — its name, the reason and fix, and a close that really closes it — and
          never calls its render(), so it takes no view lock and parks nothing. Celestial
          puts the tool itself back where the card was (lib/skyHold, 2026-10-02). */}
      {/* eslint-disable-next-line react-hooks/refs -- ctx.flyTo reads the map ref only when a HUD invokes it from its own event handlers, never during render */}
      {getToolExtensions().map((ext) =>
        openTools.has(ext.id) ? (
          <Fragment key={ext.id}>
            {isAddonEntitled(ext) ? (
              ext.needsSiderealTime && skyHeld ? (
                <HeldHud
                  title={ext.label}
                  posKey="astro:held-tool-pos:v1"
                  onClose={() => toggleTool(ext.id)}
                  onFix={() => openSettingsSection('calc')}
                />
              ) : (
                ext.render(extensionCtx, () => toggleTool(ext.id))
              )
            ) : null}
          </Fragment>
        ) : null,
      )}
      {/* The active Overlay-menu extension (registerOverlayExtension), single-select.
          Its HUD while entitled; onClose clears the selection. Mapped over a 0/1-element
          list so it shares the ref-handling of the blocks above. */}
      {/* eslint-disable-next-line react-hooks/refs -- ctx.flyTo reads the map ref only when a HUD invokes it from its own event handlers, never during render */}
      {(activeOverlayExtension ? [activeOverlayExtension] : []).map((ext) => (
        <Fragment key={ext.id}>
          {isAddonEntitled(ext)
            ? ext.render(extensionCtx, clearOverlayExt)
            : null}
        </Fragment>
      ))}
      {/* The expanded Sidebar opens from its own top-bar button (wheelExpanded) and
          must stay reachable even when the compact Minimap (showChart) is hidden —
          so only the compact wheel is gated by showChart. */}
      {wheelExpanded ? (
        <ExpandedChartSidebar
          chart={current}
          charts={charts}
          point={activePoint}
          pointLabel={coordLocation}
          pinned={pinned != null}
          isNatalPin={isNatalPin}
          angles={wheelAngles}
          // The EFFECTIVE line system (a held or sidereal-masked choice reads
          // celestial), for what the panel says about the frame it shows. (2026-10-02)
          lineSystem={lineSystem}
          // The house system the frame's cusps were computed in, for the geodetic
          // header's "houses:" line — the effective one, Placidus with Advanced off.
          houseSystem={effHouseSystem}
          bodyNotes={wheelBodyNotes}
          // A timeless chart's Moon (and geodetic Fortune) as spans, not minutes. (2026-10-02)
          ranges={natalRanges}
          planets={wheelPlanets}
          // The natal chart's catalog bodies (empty unless the wheel IS the natal chart),
          // the ring held while their files load, and their rows' horizon figures.
          minorBodies={wheelMinor}
          minorReserve={wheelMinorReserve}
          minorCoords={minorCoords}
          planetsOnly={noTime}
          // CCG never rides as an overlay ring/caption either (no coherent chart to
          // show alongside the natal) — isCyclo drops it whether or not it's promoted.
          overlayPlanets={promoteOverlay || isCyclo ? null : displayOverlayEcliptic}
          // The overlay ring's catalog bodies and their horizon figures — empty under the
          // same two exclusions (overlayMinorWheel).
          overlayMinorBodies={overlayMinorWheel}
          overlayMinorCoords={overlayMinorCoords}
          overlayAngles={promoteOverlay || isCyclo ? null : displayOverlayAngles}
          overlayLabel={
            promoteOverlay || isCyclo ? null : (overlayLayer?.labelFull ?? null)
          }
          overlayMoment={
            promoteOverlay || isCyclo ? null : (overlayLayer?.moment ?? null)
          }
          overlayKind={overlayLayer?.kind ?? null}
          // The synastry partner's own record, so the second wheel's header can
          // introduce the partner as the panel header introduces the active chart —
          // their birth date and time and THEIR birthplace — rather than the label
          // string alone. Only while their wheel rides beside the chart (never
          // promoted, where the panel header above speaks for the one wheel there is).
          overlayPartner={
            overlayLayer?.kind === 'synastry' && !promoteOverlay ? partner : null
          }
          overlayReturn={promoteOverlay || isCyclo ? null : overlayReturn}
          // When promoted CCG leaves nothing to wheel, render the empty "NO CHART" state.
          noChart={noChart}
          // When the overlay is promoted (Natal hidden), the wheel's state title is
          // REPLACED by the overlay's own name — the same tag the timeline bar shows
          // ("Sec. Progressed", "Transits", …) — still coloured by the live hover/pin
          // state. This is the name half of labelFull ("Sec. Progressed · age 30.2" →
          // "Sec. Progressed"), matching the overlay caption in the wheel's other corner.
          // Cyclo keeps its "CCG" short form (its "Cyclo·carto·graphy" would split badly).
          promotedLabel={
            promoteOverlay && overlayLayer
              ? overlayLayer.kind === 'cyclo'
                ? 'CCG'
                : overlayLayer.labelFull.split('·')[0].trim()
              : null
          }
          visiblePlanets={visiblePlanets}
          visibleLineTypes={visibleLineTypes}
          advancedCoords={advancedCoords}
          angleCoords={angleCoords}
          overlayAdvancedCoords={overlayAdvancedCoords}
          overlayAngleCoords={overlayAngleCoords}
          // Horizon-frame data for the sidebar's local-space dial + aspect
          // statuses: only while the Local Space view is on and the gated tier
          // is met, and never against a promoted overlay (the wheel would be
          // showing the overlay's bodies at another moment — no coherent frame
          // to compare). This one condition is the entire gate.
          localSpaceCoords={
            lsActive && !promoteOverlay && gatedTierMet ? localSpaceCoords : null
          }
          natalLocalSpaceCoords={
            lsActive && !promoteOverlay && gatedTierMet
              ? natalLocalSpaceCoords
              : null
          }
          relocatedLocalSpaceCoords={
            lsActive && !promoteOverlay && gatedTierMet
              ? relocatedLocalSpaceCoords
              : null
          }
          // Same gate inverted: the view is on and would show the dials, but the gated
          // tier isn't met — hand the sidebar the signal so it can render a downstream
          // slot (a placeholder) in the dials' place. Nothing shows in the open core.
          // Read off the view's OPEN flag, not lsActive: on a geodetic map the slot says
          // the hold instead, but the tier still decides which local-space controls
          // exist to be held (the aspect list's Compare switch). (2026-10-05)
          localSpaceGated={showLocalSpace && !promoteOverlay && !gatedTierMet}
          // The view is open but HELD on a geodetic map: the slot the dials would take
          // shows the hold's reason and its fix instead (lib/skyHold). Same promoted-overlay
          // exclusion as the dials themselves. (2026-10-02)
          localSpaceHeld={showLocalSpace && skyHeld && !promoteOverlay}
          onOpenCalc={() => openSettingsSection('calc')}
          localSpaceRelocated={localSpaceRelocated}
          aspectOrbs={effAspectOrbs}
          rulershipScheme={rulershipScheme}
          advanced={advancedWheel}
          setAdvanced={setAdvancedMode}
          dualWheels={dualWheels}
          setDualWheels={setDualWheels}
          visibleAspects={visibleAspects}
          setVisibleAspects={setVisibleAspects}
          onClose={() => setWheelExpanded(false)}
          onResizingChange={onResizing}
          onSelectChart={selectChart}
          onNewChart={() => setCreating(true)}
          onEditChart={(id) => setEditingId(id)}
          onDeleteChart={handleDelete}
          chartFlash={chartFlash}
        />
      ) : (
        showChart &&
        !viewParked && (
          <ChartWheel
            point={activePoint}
            pinned={pinned != null}
            isNatalPin={isNatalPin}
            angles={wheelAngles}
            planets={wheelPlanets}
            minorBodies={wheelMinor}
            visiblePlanets={visiblePlanets}
            noChart={noChart}
            planetsOnly={noTime}
            maskAngleText={maskGeAngleText}
            ranges={natalRanges}
            // Second doorway to the sidebar wheel, beside the minimap's resize
            // control: the bar's toggle is easy to miss, and a small wheel gives
            // no hint that a fuller one exists. Opens only — the minimap is
            // replaced by the sidebar, so there is nothing here to close.
            onExpand={() => setWheelExpanded(true)}
          />
        )
      )}
      {(creating || editingId != null || pickingPartner) && (
        <ChartManager
          charts={charts}
          // The synastry picker reuses this browser to choose a comparison chart;
          // name the active chart it's being compared with ("Synastry with X").
          title={
            pickingPartner
              ? t('chartManager.comparisonTitle', {
                  name: identity.on
                    ? identity.name(current?.name ?? '')
                    : displayName(current?.name ?? ''),
                })
              : undefined
          }
          // …shown visually as a synastry icon + the name, in place of the words.
          heading={
            pickingPartner ? (
              <span className="cm-comparison-title">
                {t('chartManager.comparisonLabel')}
                <SynastryIcon />
                {identity.on
                  ? identity.name(current?.name ?? '')
                  : displayName(current?.name ?? '')}
              </span>
            ) : undefined
          }
          // In partner-pick mode highlight the chosen partner (not the active chart)
          // and drop the active chart from the list — it can't be its own partner.
          currentId={
            pickingPartner ? (partner?.id ?? null) : (current?.id ?? null)
          }
          excludeId={pickingPartner ? (current?.id ?? null) : null}
          initialEditId={editingId}
          onSelect={(id) => {
            if (pickingPartner) setPartnerId(id);
            else selectChart(id);
            closeManager();
          }}
          onSave={handleSaveChart}
          onSaveMany={handleSaveCharts}
          onDelete={handleDelete}
          onImport={() => setImporting(true)}
          onClose={closeManager}
        />
      )}
      {importing && (
        <ImportChartModal
          onCancel={() => setImporting(false)}
          onImport={handleImport}
          // So a re-dropped export can recognise what it already brought in,
          // and so imported charts can land straight in an existing folder.
          existing={charts}
          folderOptions={folderPaths}
        />
      )}
      {/* A setting this app changed on the user's behalf, said out loud. Parked while a
          registered surface owns the viewport, like every other floating window —
          `announce` checks the same lock and declines to consume the notice there, so
          it fires on the next occurrence instead. (The exception for a notice about the
          lock's own surface went with the line-system switch, 2026-10-02: no notice is
          about one now, and a held tool never takes the lock.) */}
      {autoFlipKind && !viewParked && (
        <AutoFlipNotice
          kind={autoFlipKind}
          suppress={autoFlipSuppress}
          onSuppressChange={setAutoFlipSuppress}
          onDismiss={() => {
            dismissAutoFlip(autoFlipSuppress);
            setAutoFlipSuppress(false);
          }}
        />
      )}
      {/* The guides reference (View ▸ Guides) takes precedence over an onboarding pop-up,
          so only one card shows at a time; closing it lets any unfinished onboarding guide
          resurface on the next gesture. In reference mode the pager flips through the met
          guides — shown only when there's more than one (handled inside MissionGuide). */}
      {showGuides && !viewParked ? (
        <MissionGuide
          reference
          set={guideSets[guideIdx]}
          completed={missionProgressFor(guideSets[guideIdx])}
          is3d={is3d}
          onClose={() => setShowGuides(false)}
          pager={{
            index: guideIdx,
            count: guideSets.length,
            onPrev: () => setGuideIndex((i) => Math.max(0, i - 1)),
            onNext: () =>
              setGuideIndex((i) => Math.min(guideSets.length - 1, i + 1)),
          }}
        />
      ) : (
        missionSet && (
          <MissionGuide
            set={missionSet}
            completed={missionProgress}
            is3d={is3d}
            onClose={closeMission}
          />
        )
      )}
    </>
  );
}
