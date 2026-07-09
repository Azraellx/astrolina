// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  getMapExtensions,
  isEntitled,
  type AllLines,
  type LineSpotlight,
  type MapExtensionContext,
} from './lib/extensions/mapExtensions';
import { filterWithinKm } from './lib/lineProximity';
import { getToolExtensions } from './lib/extensions/toolExtensions';
import { getOverlayExtensions } from './lib/extensions/overlayExtensions';
// Shared entitlement for the Tools + Overlay seams (see lib/extensions/entitlement).
import { isEntitled as isAddonEntitled } from './lib/extensions/entitlement';
import { type PlanTier, planTierFor, tierMet } from './lib/plan';
import type {
  Feature,
  FeatureCollection,
  Geometry,
  LineString,
  Point as GeoPoint,
} from 'geojson';
import {
  Map,
  type MapHandle,
  type MeasureInfo,
  type SlideInfo,
  type OverlayData,
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
import { getSkyBandTrack, isSkyBandTrackEntitled } from './lib/extensions/skyBandTrack';
import { getMapOverlays, MAP_CLICK_EVENT, type MapClickDetail } from './lib/extensions/mapOverlays';
import { publishBottomDock, retireBottomDock } from './lib/bottomDock';
import { getReservedLeftInset, subscribeReservedLeftInset } from './lib/leftDock';
import { LocalSpaceHud } from './components/LocalSpaceHud/LocalSpaceHud';
import { AspectLinesHud } from './components/AspectLinesHud/AspectLinesHud';
import { CaptureHud } from './components/CaptureHud/CaptureHud';
import { TopNav, type MapTool } from './components/TopNav/TopNav';
import { ChartWheel } from './components/ChartWheel/ChartWheel';
import { ExpandedChartSidebar } from './components/ExpandedChartSidebar/ExpandedChartSidebar';
import { CoordReadout } from './components/CoordReadout/CoordReadout';
import { ProfileWindow } from './components/ProfileWindow/ProfileWindow';
import { SynastryIcon } from './components/ui/SynastryIcon';
import { InfoBar } from './components/InfoBar/InfoBar';
import { ChartManager } from './components/ChartManager/ChartManager';
import { ImportChartModal } from './components/ImportChartModal/ImportChartModal';
import { MissionGuide } from './components/MissionGuide/MissionGuide';
import { useMissions } from './lib/useMissions';
import { isTouchLayout, useTouchLayout, usePhone } from './lib/touch';
import { useSafeAreaBottom } from './lib/safeArea';
// Type-only: erased at compile time, so the eclipses module itself still
// loads lazily (the value import lives in the dynamic-import effect below).
import type { EclipseCatalogRow, EclipseContact } from './lib/astro/eclipses';
import { SEED_BIRTHS, timeUnknown } from './lib/birthData';
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
import {
  offsetHoursAt,
  zoneLabelAt,
  formatUtcOffset,
} from './lib/atlas/timezone';
import { useReverseGeocode } from './lib/atlas/useReverseGeocode';
import { useNearestCityLabel } from './lib/atlas/useNearestCityLabel';
import { useCountryOf } from './lib/atlas/useCountryOf';
import {
  birthDataToJD,
  directedAngles,
  eclipticLonOfRA,
  eclipticToRaDec,
  ensureAsteroidEphemeris,
  fortunePosition,
  getAngleCoords,
  getEclipticPositions,
  getHorizontalCoords,
  getPlanetPositions,
  gmstRadians,
  isDayBirth,
  jdToCivil,
  needsAsteroidEphemeris,
  obliquity,
  partOfFortuneLon,
  PLANET_NAMES,
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
} from './lib/ephemeris';
// Eclipse machinery (the NASA catalog JSON + the Besselian-element fitting in
// eclipsePath) is dynamic-imported when eclipse mode first opens — see the
// eclipsesMod state below — so none of it weighs on the main bundle.
import {
  antipodeStamps,
  generateEcliptic,
  generateLines,
  generateZenithStamps,
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
import { generateParans, generateStarParans, type ParanProps } from './lib/astro/parans';
import { dailySkyEvents } from './lib/astro/riseSet';
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
  overlayBlockedFor,
  overlayAuxBlocked,
  type AngleProgression,
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
  solveCompositeFrameJd,
} from './lib/astro/composite';
import {
  ayanamsaRad,
  shiftAngles,
  shiftEclipticPositions,
  shiftEclipticPositionsPerBody,
} from './lib/astro/ayanamsa';
import { findReturn, type ReturnBody } from './lib/astro/returns';
import { buildLineCard, type LineCardDistance } from './lib/lineCard';
import { generateOrbBands } from './lib/astro/orbBands';
import { generateStarLines, starsOfDate } from './lib/astro/starLines';
import { generateNightShade } from './lib/astro/nightShade';
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
  loadAngleProgression,
  loadEclipseChart,
  loadEclipseMapLines,
  loadEclipseId,
  loadEclipseIsoStep,
  loadEclipseNatalLines,
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
  loadParanOrbVal,
  loadPrimaryRate,
  loadShowNightShade,
  loadShowOrbZones,
  loadShowStarLines,
  loadStarSet,
  loadTransitFrame,
  loadUserPrimaryRate,
  loadSynastryMethod,
  loadZodiacMode,
  saveZodiacMode,
  saveAngleProgression,
  saveEclipseChart,
  saveEclipseMapLines,
  saveEclipseId,
  saveEclipseIsoStep,
  saveEclipseNatalLines,
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
  saveParanOrbVal,
  savePrimaryRate,
  saveShowNightShade,
  saveShowOrbZones,
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
  saveCharts,
  saveCurrentId,
  type StoredChart,
} from './lib/chartLibrary';
import { fmtLat, fmtLng } from './lib/coordFormat';
import {
  applyTheme,
  loadTheme,
  MAP_LINE_COLOR_OVERRIDES,
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

const seedCharts: StoredChart[] = SEED_BIRTHS.map((b, i) => ({
  ...b,
  id: newChartId(),
  createdAt: Date.now() + i,
}));

export default function App() {
  const { t, labels, fmt } = useT();
  // A share link (?c=…) restores a chart + view. Consumed exactly once at boot
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
  const current = useMemo(
    () => charts.find((c) => c.id === currentId) ?? charts[0] ?? null,
    [charts, currentId],
  );
  // Birth TIME unknown (timeKnown === false): the stored 12:00 is a placeholder, so
  // every time-of-day-dependent layer below degrades — the angular linework, parans,
  // local space, star lines, houses and relocated angles all suppress; the date-robust
  // content (planets by sign, eclipse geometry, the transiting sky) stays.
  const noTime = timeUnknown(current);

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
  const [visiblePlanets, setVisiblePlanets] = useState<Set<PlanetName>>(() => {
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
    // Fortune (on by default so the Lot is discoverable — it shows on the wheel
    // always, and its map lines appear the moment the projection is In-Zodiaco).
    return new Set<PlanetName>([...TRADITIONAL_PLANETS, 'Fortune']);
  });
  useEffect(() => {
    localStorage.setItem(
      'astro:visible-planets:v1',
      JSON.stringify([...visiblePlanets]),
    );
  }, [visiblePlanets]);
  const [visibleLineTypes, setVisibleLineTypes] = useState<Set<LineType>>(
    () => new Set<LineType>(['MC', 'IC', 'ASC', 'DSC']),
  );
  const [showParans, setShowParans] = useState(false);
  // Local Space is its own View now (View ▸ Local Space, hotkey L): the window's mere
  // being-open draws the lines, so there's no separate on/off toggle. Persisted, off
  // by default for a fresh account.
  // Local Space is Advanced-only, so a stale "open + Advanced off" combo never restores:
  // require BOTH the open flag and the persisted Advanced flag (matches the runtime gating).
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
  const [lineSystem, setLineSystem] = useState<LineSystem>(() =>
    localStorage.getItem('astro:line-system:v1') === 'geodetic'
      ? 'geodetic'
      : 'celestial',
  );
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
  // The movable Teleport window (View ▸ Teleport, hotkey G) — search a place and fly
  // the camera there (no pin/relocate), with a two-deep back/forward. On-demand, so
  // it defaults OFF.
  const [showTeleport, setShowTeleport] = useState(
    () => localStorage.getItem('astro:view-teleport:v1') === '1',
  );
  // Sky Times (View ▸ Sky times): the day's rise/culminate/set clock at the
  // active point — the bottom sky band. On-demand, so it defaults OFF.
  const [showSkyTimes, setShowSkyTimes] = useState(
    () => localStorage.getItem('astro:view-skytimes:v1') === '1',
  );
  // The expanded wheel's Advanced reading mode (degree rim, aspect grid,
  // coordinate tables). Lifted here — same storage key the sidebar always
  // used — so the Info chip can gate its Advanced-tab items on it.
  const [advancedWheel, setAdvancedWheel] = useState(
    () => localStorage.getItem('astro:advanced:v1') === '1',
  );
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
  // Appearance ▸ Details ▸ Zenith/Nadirs: draw the NATAL bodies' zenith (overhead)
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

  const [overlayMode, setOverlayMode] = useState<OverlayMode>(() => {
    const m = loadOverlayMode();
    // Advanced-tier overlays don't restore while Advanced is off (see ADVANCED_OVERLAY_MODES).
    return ADVANCED_OVERLAY_MODES.has(m) &&
      localStorage.getItem('astro:advanced:v1') !== '1'
      ? 'off'
      : m;
  });
  // A composite chart can't carry a progression / direction / synastry overlay
  // (no real moment to advance — Q11), and an unknown-birth-time chart can't carry
  // any technique that advances its natal moment — so making such a chart active
  // resets a blocked mode to None. One guarded spot covers chart switch, generate,
  // import, and load-time restore; the menu + 'o'-cycle already hide these modes, so
  // this only fires on a stale combo, and the no-op updater bails when nothing needs
  // changing.
  useEffect(() => {
    const blocked = overlayBlockedFor(current);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOverlayMode((m) => (blocked(m) ? 'off' : m));
  }, [current]);
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
  const [angleProgression, setAngleProgression] = useState<AngleProgression>(() =>
    loadAngleProgression(),
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
  // Zodiac reading frame (Advanced ▸ Zodiac): tropical, or sidereal by
  // ayanamsa — a display-layer choice (see the sidereal block further down).
  const [zodiacMode, setZodiacMode] = useState(loadZodiacMode);
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
  const [showEclipseNatalLines, setShowEclipseNatalLines] = useState(() =>
    loadEclipseNatalLines(),
  );

  // Mapping tools (top bar). Transient — not persisted across reloads.
  const [mapTool, setMapTool] = useState<MapTool>('off');
  // Capture-frame aspect ratio (width / height), persisted. Only consulted
  // while the Capture tool is armed (mapTool === 'capture'); the CaptureHud picks the preset.
  const [captureAspect, setCaptureAspect] = useState<number>(() => {
    const n = parseFloat(localStorage.getItem('astro:capture-aspect:v1') ?? '');
    return Number.isFinite(n) && n > 0 ? n : 16 / 9; // default landscape 16:9
  });
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
  // The formatted value of every caption field, computed once. The caption joins the
  // ENABLED ones (below) and the download filename reuses the same values, so the two can
  // never drift. Date/time are formatted in UTC so the birth clock time isn't shifted by
  // the viewer's zone. Null with no chart.
  const captureFields = useMemo(() => {
    if (!current) return null;
    const dt = new Date(
      Date.UTC(current.year, current.month - 1, current.day, current.hour, current.minute),
    );
    return {
      name: displayName(current.name),
      date: new Intl.DateTimeFormat('en', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(dt),
      time: new Intl.DateTimeFormat('en', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: 'UTC',
      }).format(dt),
      // The birth-moment UTC offset (DST-aware), shown next to the time in the caption.
      tzLabel: formatUtcOffset(current.tzOffset),
      location: current.birthplace.label,
      // The birthplace's full latitude + longitude (DMS, same format as the corner readout).
      coordinates: `${fmtLat(current.birthplace.lat)} ${fmtLng(current.birthplace.lng)}`,
      calculations: captureCalcText,
    };
  }, [current, captureCalcText]);
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
      .map((k) => (k === 'time' ? `${captureFields.time} ${captureFields.tzLabel}` : captureFields[k]));
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
  const captureFileName = useMemo(() => {
    let slug = '';
    if (captureFields) {
      for (const k of ['name', 'date', 'time', 'location'] as const) {
        if (!captureCaptionFields[k]) continue;
        slug = captureFields[k]
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        if (slug) break;
      }
    }
    return `astrolina-${slug || 'capture'}.png`;
  }, [captureFields, captureCaptionFields]);
  const [measure, setMeasure] = useState<MeasureInfo | null>(null);
  const [measureSnap, setMeasureSnap] = useState(false);
  // Whether the Slide tool can run right now (kept in a ref so the early-declared
  // toggleSlide can read it; the value is derived far below, once promoted/eclipse
  // state exists, and synced into this ref).
  const slideAvailableRef = useRef(true);
  // Slide tool: elapsed Earth-rotation time (days, signed) the user has spun the
  // globe to. Drives the time-shifted line recompute + the readout; 0 = natal.
  const [slideDt, setSlideDt] = useState(0);
  // Toggle the Slide tool. It works in either projection (flat or globe); only the
  // geodetic line frame can't be spun (its lines carry no sidereal time), so turning
  // it ON switches that to celestial first.
  const toggleSlide = useCallback(() => {
    if (mapTool === 'slide') {
      setMapTool('off');
      return;
    }
    // No natal cage to spin when natal linework is hidden / an overlay is promoted
    // (slideAvailableRef, synced below). The hotkey routes here, so gate it too.
    if (!slideAvailableRef.current) return;
    if (lineSystem === 'geodetic') setLineSystem('celestial');
    // A playing timeline and a spinning globe fight over the camera/data — pause it.
    if (playing) setPlaying(false);
    setMapTool('slide');
  }, [mapTool, lineSystem, playing]);
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

  // Settings toggles that the global hotkeys below flip (Shift+S / N / O). Declared
  // here, ahead of the keydown effect that references their setters, so the shortcut
  // closures bind to live state. Their persistence effects and companions (starSet,
  // orb widths) stay with the rest of the map state further down.
  const [showStarLines, setShowStarLines] = useState(loadShowStarLines);
  const [showNightShade, setShowNightShade] = useState(loadShowNightShade);
  const [showOrbZones, setShowOrbZones] = useState(loadShowOrbZones);

  // ── Effective advanced settings ─────────────────────────────────────────────
  // Advanced mode is a master switch: while it's OFF the chart/map behave as if
  // these settings are at their defaults, but the raw values stay in state (and
  // still back the now-hidden Sidebar controls), so turning Advanced back on
  // restores exactly what the user had. Only the chart/map COMPUTATION reads
  // these effective values; the (hidden) Sidebar/InfoBar keep the raw ones.
  const effHouseSystem = advancedWheel ? houseSystem : 'placidus';
  const effZodiacMode = advancedWheel ? zodiacMode : 'tropical';
  const effFortuneFormula = advancedWheel ? fortuneFormula : 'sect';
  const effShowParans = advancedWheel && showParans;
  const effShowAspectLines = advancedWheel && showAspectLines;
  const effShowMidpointLines = advancedWheel && showMidpointLines;
  const effShowStarLines = advancedWheel && showStarLines;
  const effShowZenith = advancedWheel && showZenith;
  const effShowOrbZones = advancedWheel && showOrbZones;
  // Transits-bar ADVANCED-ONLY control: the positioning frame (Relative/Absolute switch in
  // the returns row). Default while Advanced is OFF (its UI is hidden then; see TimelineHud),
  // raw restored when on. (The drawer's Natal toggle is NOT gated — always available, reads
  // raw showNatal.)
  // With the birth time unknown there is no natal RAMC to hold, so the transit map
  // is forced to the absolute sky-of-the-moment frame (the only one that's real).
  const effTransitFrame: TransitFrame = noTime
    ? 'transit-moment'
    : advancedWheel
      ? transitFrame
      : 'relative-to-natal';
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
    ).filter((m) => !overlayBlockedFor(current)(m));
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
          mapRef.current?.flyTo(pinned.lat, pinned.lng);
          e.preventDefault();
        } else if (current) {
          const target = {
            lat: current.birthplace.lat,
            lng: current.birthplace.lng,
          };
          setPinned(target);
          setHover(null);
          mapRef.current?.flyTo(target.lat, target.lng);
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
          e.preventDefault();
        }
        return;
      }
      if (isTypingField(el)) return;
      // Shift+letter: Settings toggles (map-filter lines, Appearance details, and
      // projection mode). Kept on Shift so the plain letters stay free for the
      // view/tool hotkeys below; each is mirrored by a "Shift X" pill in the sidebar.
      // (Local space moved to the Location view — plain 'L'.)
      if (e.shiftKey) {
        switch (e.key.toLowerCase()) {
          // Advanced ▸ Lines toggles — gated on Advanced mode (no-op while off,
          // like the section that hosts them).
          case 'p': if (advancedWheel) setShowParans((v) => !v); break;
          case 'a': if (advancedWheel) setShowAspectLines((v) => !v); break;
          case 'm': if (advancedWheel) setShowMidpointLines((v) => !v); break;
          case 's': if (advancedWheel) setShowStarLines((v) => !v); break;
          // Appearance ▸ Details toggles (always available).
          case 'r':
            // Roads + rivers move together (one Details switch), so stay in sync.
            setShowRoads((v) => !v);
            setShowRivers((v) => !v);
            break;
          case 'l': setShowLabels((v) => !v); break;
          // Advanced ▸ Display toggles — gated on Advanced mode.
          case 'o': if (advancedWheel) setShowOrbZones((v) => !v); break;
          case 'z': if (advancedWheel) setShowZenith((v) => !v); break;
          // Night Shade lives in Appearance now, so it stays always available.
          case 'n': setShowNightShade((v) => !v); break;
          // Appearance ▸ Projection (absolute mode, not a toggle).
          // One key cycles the projection (flat ↔ globe), like 'o' cycles overlays.
          case 'f': setProjection((p) => (p === '2d' ? '3d' : '2d')); break;
          default: return;
        }
        e.preventDefault();
        return;
      }
      switch (e.key.toLowerCase()) {
        case 'm': setShowChart((v) => !v); break;
        case 'c': setShowCoords((v) => !v); break;
        case 's': setShowSettings((v) => !v); break;
        case 'g': setShowTeleport((v) => !v); break;
        // Sky Times is an 'adv'-tier view (matches its View-menu row).
        case 'h': if (advancedWheel) setShowSkyTimes((v) => !v); break;
        case 'l':
          // Local space isn't shown in Mundane (geodetic); opening it returns to the
          // celestial frame (matches the View-menu toggle + the slide tool).
          if (advancedWheel) {
            if (lineSystem === 'geodetic') setLineSystem('celestial');
            setShowLocalSpace((v) => !v);
          }
          break;
        case 'o':
          // Cycling into a core mode supersedes any active extension overlay.
          setActiveOverlayExt(null);
          setOverlayMode(
            (mode) =>
              overlayCycle[(overlayCycle.indexOf(mode) + 1) % overlayCycle.length],
          );
          break;
        case 'n': setActiveOverlayExt(null); setOverlayMode('off'); break;
        case 't': setMapTool((tl) => (tl === 'measure' ? 'off' : 'measure')); break;
        // Slide spins the globe under the fixed lines; toggleSlide switches into the
        // 3D globe / celestial frame first if the user isn't already there.
        case 'y': if (advancedWheel) toggleSlide(); break;
        // Capture — ungated, so no advanced-mode gate (unlike Slide).
        case 'e': setMapTool((tl) => (tl === 'capture' ? 'off' : 'capture')); break;
        case 'a': setCreating(true); break;
        case 'b': if (current) setWheelExpanded((v) => !v); break;
        default: {
          // A registered map-HUD extension may claim a plain-letter hotkey (its
          // `hotkey` field, also shown beside it in the View menu). Toggle it —
          // but only when the user is entitled, so a gated extension the user
          // can't reach stays a no-op (its HUD wouldn't render anyway).
          const ext = getMapExtensions().find(
            (x) => x.hotkey?.toLowerCase() === e.key.toLowerCase() && isEntitled(x),
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
    // toggleExtension / toggleTool / nudgeSlide are stable useCallbacks declared later in this
    // component; the keydown closure reads them lazily (post-commit), so they're intentionally
    // left out of the deps — listing them here would touch their temporal dead zone during render.
  }, [current, pinned, toggleSlide, advancedWheel, lineSystem, mapTool]);

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

  // Turning Advanced OFF deactivates any advanced-only feature that's active (Slide tool,
  // Local Space view, Synastry/Eclipses overlays) so nothing advanced-only lingers without
  // a menu control to turn it back off. Used in place of the raw setAdvancedWheel at every
  // Advanced toggle (the profile plan tag + the wheel-sidebar ADV label). Load-time stale
  // state is handled in the showLocalSpace / overlayMode initializers instead (an effect
  // that setState's on mount would cascade renders — see react-hooks/set-state-in-effect).
  const setAdvancedMode = useCallback((on: boolean) => {
    if (!on) {
      setMapTool((tl) => (tl === 'slide' ? 'off' : tl));
      setShowLocalSpace(false);
      setShowSkyTimes(false);
      setOverlayMode((m) => (ADVANCED_OVERLAY_MODES.has(m) ? 'off' : m));
    }
    setAdvancedWheel(on);
  }, []);

  // Mundane (geodetic) lines and the Local Space view are mutually exclusive: geodetic
  // is time-independent, while local space needs the specific birth moment (Solar Maps
  // withholds local space in geodetic mode for the same reason). Entering Mundane closes
  // the view (like turning Advanced off); opening the view drops back to the celestial
  // frame (mirrors the slide tool, which also can't run in geodetic — see toggleSlide).
  const setLineSystemSafe = useCallback(
    (next: LineSystem) => {
      // Geodetic (Mundane) maps the TROPICAL zodiac onto Earth's longitudes by
      // definition — there is no sidereal variant — so it is unavailable in
      // sidereal mode (mirrors how it is withheld alongside local space / slide).
      if (next === 'geodetic' && effZodiacMode !== 'tropical') return;
      if (next === 'geodetic') setShowLocalSpace(false);
      setLineSystem(next);
    },
    [effZodiacMode],
  );
  const setShowLocalSpaceSafe = useCallback(
    (v: boolean) => {
      if (v && lineSystem === 'geodetic') setLineSystem('celestial');
      setShowLocalSpace(v);
    },
    [lineSystem],
  );
  // Switching INTO sidereal while Mundane is active drops back to the celestial
  // frame (geodetic is tropical-only — see setLineSystemSafe).
  useEffect(() => {
    if (effZodiacMode !== 'tropical' && lineSystem === 'geodetic') setLineSystem('celestial');
  }, [effZodiacMode, lineSystem]);

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
    localStorage.setItem('astro:line-system:v1', lineSystem);
  }, [lineSystem]);
  useEffect(() => {
    localStorage.setItem('astro:show-aspect-lines:v1', showAspectLines ? '1' : '0');
  }, [showAspectLines]);
  useEffect(() => {
    localStorage.setItem('astro:show-midpoint-lines:v1', showMidpointLines ? '1' : '0');
  }, [showMidpointLines]);
  useEffect(() => {
    localStorage.setItem('astro:aspectlines-open:v1', showAspectLinesHud ? '1' : '0');
  }, [showAspectLinesHud]);
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
  const skyBandVisible = showSkyTimes && mapTool !== 'capture';
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
  const skyBandTrackShown = skyBandTrackAvailable && skyBandTrackOn;
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
  const skyBandTableOn = skyBandTable && !skyBandTrackShown;
  const skyBandH = phoneLayout
    ? SKY_BAND_H_PHONE +
      (skyBandTrackShown && skyBandTrackExt ? skyBandTrackExt.height : 0) +
      // Table mode: the 28px legend row grows to the table's height.
      (skyBandTableOn ? SKY_BAND_H_TABLE - SKY_BAND_H_COMPACT : 0) +
      safeBottom +
      SKY_BAND_PHONE_CUSHION
    : skyBandTrackShown && skyBandTrackExt
      ? skyBandTrackExt.height
      : skyBandTableOn
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
  const [skyHeld, setSkyHeld] = useState<Point | null>(null);
  const skyFollowActive = skyBandVisible && skyFollowOn && !phoneLayout;
  // Read by the (stable) onHover callback: push cursor points only while
  // following and not parked on a held spot.
  const skyFollowLiveRef = useRef(false);
  useEffect(() => {
    skyFollowLiveRef.current = skyFollowActive && !skyHeld;
  }, [skyFollowActive, skyHeld]);
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
    setSkyHeld(null);
  }, [skyFollowActive]);
  // The park/resume click, off the neutral map-click broadcast. A map tool owns
  // clicks while active (the same document signal overlays use to yield), so a
  // measure/scan click never parks the band.
  useEffect(() => {
    if (!skyFollowActive) return;
    const onClick = (e: Event) => {
      if (document.documentElement.hasAttribute('data-map-tool-active')) return;
      const { lat, lng } = (e as CustomEvent<MapClickDetail>).detail;
      setSkyHeld((h) => (h ? null : { lat, lng }));
    };
    window.addEventListener(MAP_CLICK_EVENT, onClick);
    return () => window.removeEventListener(MAP_CLICK_EVENT, onClick);
  }, [skyFollowActive]);
  const skyFollowPoint = skyFollowActive ? (skyHeld ?? skyHover) : null;
  // The widest RESERVED left dock (lib/leftDock) — a panel claiming its own column
  // rather than overlaying. Read into state (not the --es-width var) so the map's
  // inset arrives as a prop on the same commit as its resize (see lib/leftDock).
  const reservedLeftInset = useSyncExternalStore(subscribeReservedLeftInset, getReservedLeftInset);
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

  useEffect(() => saveOverlayMode(overlayMode), [overlayMode]);
  useEffect(() => saveOverlayDate(targetDate), [targetDate]);
  useEffect(() => saveOverlayPartner(partnerId), [partnerId]);
  useEffect(() => saveOverlayStep(stepUnit), [stepUnit]);
  useEffect(() => saveAngleProgression(angleProgression), [angleProgression]);
  useEffect(() => savePrimaryRate(primaryRate), [primaryRate]);
  useEffect(() => saveUserPrimaryRate(userPrimaryRate), [userPrimaryRate]);
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
    () => saveEclipseNatalLines(showEclipseNatalLines),
    [showEclipseNatalLines],
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
  const isTimeMode =
    overlayMode === 'transits' ||
    overlayMode === 'progressed' ||
    overlayMode === 'tertiary-progressed' ||
    overlayMode === 'solar-arc' ||
    overlayMode === 'primary-directions' ||
    overlayMode === 'cyclo';
  // Adjusted during render (not in an effect) so we never paint a frame that's
  // still "playing" after the overlay has left a time mode.
  if (!isTimeMode && playing) setPlaying(false);

  useEffect(() => {
    saveCharts(charts);
  }, [charts]);
  useEffect(() => {
    saveCurrentId(current?.id ?? null);
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
  // In-Zodiaco / Mundane ecliptic projection (projecting Pluto onto the ecliptic skews
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
    // Unknown birth time: no positions reach the line generators, so the angular
    // lines, parans, zenith stamps, aspect/midpoint lines and star parans all empty
    // in one stroke. The WHEEL keeps `positions`/`ecliptic` (planets by sign hold).
    if (noTime) return [];
    const jdEff = sliding && current ? jd + slideBucket * SLIDE_BUCKET_DAYS : jd;
    return lineSystem === 'geodetic' || coordSystem === 'zodiaco'
      ? projectOntoEcliptic(slidPositions, jdEff)
      : slidPositions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noTime, lineSystem, coordSystem, slidPositions, jd, sliding, slideBucket, current, ephemerisEpoch]);

  // Part of Fortune — a derived zodiacal point (the Ascendant plus the Moon–Sun
  // arc, sect-aware). It is not a sampled body, so it is injected here rather than
  // flowing from the Swiss sweep. It has no sky position, so it only appears in
  // In-Zodiaco (and geodetic); it needs the Ascendant, so it is absent when the
  // birth time is unknown; and it is a single-birth-moment idea, so composites are
  // out of scope. `fortuneDay` is the natal sect (Sun above the birthplace horizon).
  const fortuneDay = useMemo(
    () =>
      current && !current.composite && !noTime
        ? isDayBirth(ecliptic, gmst, eps, current.birthplace.lat, current.birthplace.lng)
        : null,
    [current, noTime, ecliptic, gmst, eps],
  );
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
  // independent of time. Injected into the line/zenith generators.
  const meridianLng = useMemo<MeridianLng>(
    () =>
      lineSystem === 'geodetic'
        ? (raM) => (eclipticLonOfRA(raM, eps) * 180) / Math.PI
        : (raM) => ((raM - gmst) * 180) / Math.PI,
    [lineSystem, eps, gmst],
  );

  // Fortune joins the angle-line generator ONLY (never `linePositions`), and only
  // In-Zodiaco/geodetic — so it draws its four angle lines without leaking into
  // mundo lines, parans, zenith stamps, or the aspect/midpoint families.
  const allLines = useMemo(() => {
    const inZodiaco = lineSystem === 'geodetic' || coordSystem === 'zodiaco';
    const src =
      fortuneMapPos && inZodiaco ? [...linePositions, fortuneMapPos] : linePositions;
    return generateLines(src, meridianLng);
  }, [linePositions, meridianLng, fortuneMapPos, lineSystem, coordSystem]);
  const allParans = useMemo(
    () => generateParans(linePositions, meridianLng),
    [linePositions, meridianLng],
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
  // Local space radiates from the placed pin (relocated local space) — or the
  // birthplace, either when nothing is pinned or when the Origin setting pins
  // it home explicitly. Also the anchor for the LS ring labels.
  const localSpaceOrigin = useMemo<Point | null>(
    () =>
      (lsOrigin === 'pin' ? pinned : null) ??
      (current ? current.birthplace : null),
    [lsOrigin, pinned, current],
  );
  // Fly-to helper shared by Teleport, Local Space's "fly to origin", and the transparent-export
  // toggle: hop the camera and stash the jump so it can be undone (Teleport window / Backspace).
  // `duration` (ms) is optional — omitted keeps MapLibre's default flyTo curve.
  const teleportToPoint = (
    lat: number,
    lng: number,
    zoom?: number,
    duration?: number,
  ) => {
    const target = mapRef.current?.teleportTo(lat, lng, zoom, duration);
    if (target) {
      setLocationReturn('back');
      setTeleportTarget(target);
    }
  };
  // Turning on the transparent export flies to the local-space origin at the compass's full-size
  // zoom, so the always-on circle mask has the horizon rose to frame. Same teleport hop as Local
  // Space's "fly to origin" (undoable the same way), but near-instant — this toggle wants the
  // frame ready right away, not a leisurely fly.
  const flyToLsOrigin = () => {
    if (localSpaceOrigin)
      teleportToPoint(localSpaceOrigin.lat, localSpaceOrigin.lng, CLOSE_ZOOM, 200);
  };
  const allLocalSpace = useMemo(
    () =>
      localSpaceOrigin && !noTime
        ? generateLocalSpace(
            slidPositions, // true-sky positions, never ecliptic-projected (Q3a)
            gmst,
            localSpaceOrigin.lat,
            localSpaceOrigin.lng,
          )
        : EMPTY_FC,
    [slidPositions, gmst, localSpaceOrigin, noTime],
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
      current && !noTime
        ? localSpaceCoordMap(
            generateLocalSpace(
              slidPositions,
              gmst,
              current.birthplace.lat,
              current.birthplace.lng,
            ),
          )
        : null,
    [current, noTime, slidPositions, gmst],
  );
  // Right dial: null when nothing is pinned, or the pin coincides with the
  // birthplace — the relocated frame would just clone the natal one, so the
  // sidebar leaves that slot empty rather than repeat it.
  const relocatedLocalSpaceCoords = useMemo(() => {
    if (!current || noTime || !pinned) return null;
    const atHome =
      Math.abs(pinned.lat - current.birthplace.lat) < 1e-4 &&
      Math.abs(pinned.lng - current.birthplace.lng) < 1e-4;
    if (atHome) return null;
    return localSpaceCoordMap(
      generateLocalSpace(slidPositions, gmst, pinned.lat, pinned.lng),
    );
  }, [current, noTime, pinned, slidPositions, gmst]);
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
  const allZenith = useMemo(
    () => generateZenithStamps(linePositions, meridianLng),
    [linePositions, meridianLng],
  );
  // The ecliptic great circle for the chart instant — a fixed reference (passes
  // through the Sun's zenith), independent of planet visibility, so not filtered.
  // (Named *Line to avoid colliding with the `ecliptic` projection-mode variable.)
  // Its geographic anchor is the chart minute's sidereal time, so it suppresses
  // with the rest of the linework when the birth time is unknown.
  const eclipticLine = useMemo(
    () => (noTime ? EMPTY_FC : generateEcliptic(jd, meridianLng)),
    [noTime, jd, meridianLng],
  );

  // Which bundled fixed-star set draws (the showStarLines toggle is declared up top
  // with the other hotkey-driven settings).
  const [starSet, setStarSet] = useState(loadStarSet);
  useEffect(() => saveShowStarLines(showStarLines), [showStarLines]);
  useEffect(() => saveStarSet(starSet), [starSet]);

  // Night-side shading persistence (the showNightShade toggle is declared up top
  // with the other hotkey-driven settings; the wash itself is computed below, after
  // the eclipse selection it keys its moment from is known).
  useEffect(() => saveShowNightShade(showNightShade), [showNightShade]);


  // Fixed-star lines (Filters ▸ Fixed Stars): proper-motion + precessed star
  // positions for the chart instant, through the same meridian mapping as the
  // planet lines (so they follow Celestial vs Mundane like everything else).
  const starLines = useMemo(() => {
    if (!effShowStarLines || !current || noTime) return EMPTY_FC;
    return generateStarLines(
      starsOfDate(jd, starSet),
      meridianLng,
      lineSystem === 'geodetic' ? eps : null,
      // The pale starlight gold washes out on the light basemaps; each theme
      // gets its own tint (and the baked star sprite matches).
      STAR_LINE_COLORS[theme],
    );
  }, [effShowStarLines, current, noTime, jd, starSet, meridianLng, lineSystem, eps, theme]);

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
        ...generateAspectLines(vis, meridianLng, effCoordSystem, eps).features.filter(
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
        ...generateMidpointLines(vis, meridianLng, effCoordSystem, eps).features,
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
  ]);

  const parans = useMemo(
    () =>
      effShowParans
        ? mergeNodeParans(filterParans(allParans, visiblePlanets), visiblePlanets)
        : EMPTY_FC,
    [allParans, visiblePlanets, effShowParans],
  );

  // Local Space is its own View now: the window being open IS the on switch, so the
  // lines render exactly while showLocalSpace is true (no separate toggle).
  const lsActive = showLocalSpace;
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
  // the zeniths under the one Zenith/Nadirs filter (showZenith), gated at the Map prop.
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
  const eclipseMapData = useMemo(
    () =>
      resolvedEclipse && eclipsesMod
        ? eclipsesMod.buildEclipseMap(
            resolvedEclipse,
            eclipseIsoStep,
            theme,
            `${resolvedEclipse.row.id} · ${t(`settings.eclipses.kind.${resolvedEclipse.row.kind}`)}`,
          )
        : null,
    [resolvedEclipse, eclipsesMod, eclipseIsoStep, theme, t],
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
  // have no second real instant to shade).
  const nightShade = useMemo(() => {
    if (!showNightShade || !current) return EMPTY_FC;
    const nightJd =
      overlayMode === 'eclipses' && resolvedEclipse
        ? resolvedEclipse.event.maximum
        : overlayMode === 'transits' || overlayMode === 'cyclo'
          ? epochMsToJD(targetDate)
          : jd;
    const style = NIGHT_SHADE_STYLE[theme];
    return generateNightShade(nightJd, style.color, style.opacity);
  }, [showNightShade, current, overlayMode, resolvedEclipse, targetDate, jd, theme]);

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
  const eclipseCard = useMemo(() => {
    if (overlayMode !== 'eclipses' || !resolvedEclipse || !eclipsesMod) return null;
    const title = `${resolvedEclipse.row.id} · ${t(`settings.eclipses.kind.${resolvedEclipse.row.kind}`)}`;
    // All values below are computed numbers/times and localized strings —
    // nothing user-authored reaches this HTML.
    const card = (rows: string, sub = '') =>
      `<div class="ui-tip"><span class="ui-tip-title">${title}</span>` +
      `<dl class="eclipse-card-rows">${rows}</dl>` +
      (sub ? `<span class="ui-tip-sub">${sub}</span>` : '') +
      `</div>`;
    const row = (label: string, value: string, dim = false) =>
      `<dt>${label}</dt><dd${dim ? ' class="eclipse-card-dim"' : ''}>${value}</dd>`;

    if (resolvedEclipse.body === 'lunar') {
      const geo = resolvedEclipse.geometry;
      return (lat: number, lng: number) => {
        const view = eclipsesMod.lunarLocalView(geo, lat, lng);
        if (!view) return null;
        // Phase contacts and any mid-eclipse moonrise/set, in time order; the
        // contacts the Moon misses stay listed but dimmed (that is the local
        // story: what this place catches and what it sleeps through).
        const entries = [
          ...view.phases.map((p) => ({
            jd: p.jd,
            html: row(
              t(`map.eclipseCard.phase.${p.phase}`),
              p.visible
                ? eclipsesMod.jdToUtcHms(p.jd)
                : t('map.eclipseCard.belowHorizon'),
              !p.visible,
            ),
          })),
          ...(view.moonrise !== null
            ? [{
                jd: view.moonrise,
                html: row(t('map.eclipseCard.moonrise'), eclipsesMod.jdToUtcHms(view.moonrise)),
              }]
            : []),
          ...(view.moonset !== null
            ? [{
                jd: view.moonset,
                html: row(t('map.eclipseCard.moonset'), eclipsesMod.jdToUtcHms(view.moonset)),
              }]
            : []),
        ].sort((a, b) => a.jd - b.jd);
        return card(entries.map((e) => e.html).join(''));
      };
    }

    const el = resolvedEclipse.elements;
    return (lat: number, lng: number) => {
      const c = eclipsesMod.localContacts(el, lat, lng);
      if (!c) return null;
      const annular = c.centralKind === 'annular';
      const time = (lc: { jd: number; atHorizon: boolean }, rise: boolean) =>
        eclipsesMod.jdToUtcHms(lc.jd) +
        (lc.atHorizon
          ? ` · ${t(rise ? 'map.eclipseCard.atSunrise' : 'map.eclipseCard.atSunset')}`
          : '');
      const rows = [
        c.c1 && row(t('map.eclipseCard.c1'), time(c.c1, true)),
        c.c2 && row(t(annular ? 'map.eclipseCard.c2Annular' : 'map.eclipseCard.c2'), time(c.c2, true)),
        row(t('map.eclipseCard.max'), eclipsesMod.jdToUtcHms(c.max.jd)),
        c.c3 && row(t(annular ? 'map.eclipseCard.c3Annular' : 'map.eclipseCard.c3'), time(c.c3, false)),
        c.c4 && row(t('map.eclipseCard.c4'), time(c.c4, false)),
        c.centralDurationSec !== null &&
          row(
            t('map.eclipseCard.duration'),
            `${Math.floor(c.centralDurationSec / 60)}m${String(Math.round(c.centralDurationSec % 60)).padStart(2, '0')}s`,
          ),
      ]
        .filter(Boolean)
        .join('');
      return card(
        rows,
        t('map.eclipseCard.maxValue', {
          mag: `${Math.round(c.max.magnitude * 100)}%`,
          obsc: `${Math.round(c.max.obscuration * 100)}%`,
        }),
      );
    };
  }, [overlayMode, resolvedEclipse, eclipsesMod, t]);

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
    ) => buildLineCard(layerId, props, t, dist);
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
    mapRef.current?.flyTo(lat, lng, 2.75);
  }, []);
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

  // Returns snap (timeline ▸ Returns, transits only): move the target date to
  // the chart's solar/lunar return and frame the lines by that instant's own
  // sidereal time — only 'transit-moment' positioning makes the snapped map the
  // return chart's astrocartography (the HUD tips disclose the switch). The flip
  // shows on the timeline bar's Positioning switch (in the Returns row) right beside
  // the snap that triggered it.
  const snapToReturn = useCallback(
    (body: ReturnBody, dir: -1 | 0 | 1) => {
      if (!current) return;
      const r = findReturn(current, body, targetDate, dir);
      if (!r) return;
      setPlaying(false);
      setTargetDate(r.ms);
      // Geodetic lines ignore sidereal time, so the frame flip would change nothing
      // there while silently rewriting a persisted pref whose switch isn't even shown
      // (it's gated to celestial) — only switch it where it has its documented effect.
      if (lineSystem === 'celestial') setTransitFrame('transit-moment');
    },
    [current, targetDate, lineSystem],
  );

  const overlayLayer = useMemo(() => {
    if (overlayMode === 'off' || !current) return null;
    // Belt-and-braces for the stale-mode reset effect above: a mode this chart can't
    // carry (composite / unknown birth time) never builds a layer. And a SYNASTRY
    // partner whose own birth time is unknown has no real angular sky to overlay —
    // their noon placeholder would draw confident lines — so that layer stays off too.
    if (overlayBlockedFor(current)(overlayMode)) return null;
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
    const ovMeridianLng: MeridianLng =
      lineSystem === 'geodetic'
        ? (raM) => (eclipticLonOfRA(raM, ovEps) * 180) / Math.PI
        : (raM) => ((raM - overlayLayer.gmst) * 180) / Math.PI;
    return {
      ovPositions,
      ovMeridianLng,
      ovEps,
      prefix: OVERLAY_LABEL_PREFIX[overlayLayer.kind],
      isCyclo: overlayLayer.kind === 'cyclo',
      jd: overlayLayer.jd,
    };
  }, [overlayLayer, coordSystem, lineSystem]);

  // One-frame rule: when an overlay is active the auxiliary families (aspect,
  // midpoint, paran, star) render from the OVERLAY's frame and the natal set is
  // hidden — never both. Independent of the Natal display toggle, which keeps
  // governing only the primary angle lines' dual display. Eclipses are excluded:
  // their map linework is a separate opt-in (showEclipseMapLines / hideNatalLinework).
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
        ...generateAspectLines(vis, ovMeridianLng, effCoordSystem, ovEps).features.filter(
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
        ...generateMidpointLines(vis, ovMeridianLng, effCoordSystem, ovEps).features,
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
    const ovMeridianLng: MeridianLng =
      lineSystem === 'geodetic'
        ? (raM) => (eclipticLonOfRA(raM, obliquity(overlayLayer.jd)) * 180) / Math.PI
        : (raM) => ((raM - overlayLayer.gmst) * 180) / Math.PI;
    return {
      lines: mergeNodePairs(
        withThemeLineColors(
          filterLines(
            isCyclo
              ? tagLabelsBy(generateLines(ovPositions, ovMeridianLng), (p) =>
                  cycloBodyTag(p.planet),
                )
              : tagLabels(generateLines(ovPositions, ovMeridianLng), prefix),
            visiblePlanets,
            visibleLineTypes,
          ),
          theme,
        ),
      ),
      // Parans are suppressed under Cyclocartography (no single sky-moment across its
      // two epochs); hidden here rather than drawn incoherent — see overlayAuxBlocked.
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
      // Zenith points for the overlay bodies. When the (shared) Zenith/Nadirs toggle is
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
      // Zenith/Nadirs gate as the zeniths above.
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
  }, [overlayLayer, visiblePlanets, visibleLineTypes, effShowParans, lsActive, hideLsInbound, effShowZenith, coordSystem, lineSystem, theme]);

  // The overlay layer as it reaches the MAP (and the plugin context). For every mode
  // it's just `overlay`, EXCEPT the eclipses mode, where the eclipse-time lines are
  // withheld from the map unless showEclipseMapLines is on (off by default, opt-in —
  // see the showEclipseMapLines state + the `astro:cheat` seam above). The wheel's
  // overlay ring is unaffected — it reads overlayLayer directly — so the eclipse chart
  // still shows in the wheel, just never on the map. Withheld from the plugin context
  // too, so a plugin can't act on lines no one can see.
  const mapOverlay =
    overlayMode === 'eclipses' && !showEclipseMapLines ? null : overlay;

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
  const isTimeOverlay =
    overlayMode === 'transits' ||
    overlayMode === 'progressed' ||
    overlayMode === 'tertiary-progressed' ||
    overlayMode === 'solar-arc' ||
    overlayMode === 'primary-directions' ||
    overlayMode === 'cyclo';
  const promoteOverlay = isTimeOverlay && !!overlayLayer && !showNatal;
  // Eclipses ▸ Display ▸ Natal Chart Lines: unlike the time overlays' Natal
  // toggle (which promotes the overlay to stand in for the chart), turning
  // this off simply clears the natal LINEWORK off the map — lines, derived
  // aspect/midpoint lines, parans, local space, zenith stamps, ecliptic — so
  // the eclipse path stands alone. The wheel and readouts keep the natal chart.
  const hideNatalLinework = overlayMode === 'eclipses' && !showEclipseNatalLines;

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
    const ovMeridianLng: MeridianLng =
      lineSystem === 'geodetic'
        ? (raM) => (eclipticLonOfRA(raM, obliquity(overlayLayer.jd)) * 180) / Math.PI
        : (raM) => ((raM - overlayLayer.gmst) * 180) / Math.PI;
    // Promoted CCG keeps the per-body source tags (see the overlay memo above).
    const isCyclo = overlayLayer.kind === 'cyclo';
    const pLines = mergeNodePairs(
      withThemeLineColors(
        filterLines(
          isCyclo
            ? tagLabelsBy(generateLines(ovPositions, ovMeridianLng), (p) =>
                cycloBodyTag(p.planet),
              )
            : tagLabels(generateLines(ovPositions, ovMeridianLng), prefix),
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
  ]);

  // The nadir stamps fed to the map: the natal nadirs, or — when an overlay is
  // promoted to BE the chart — the antipodes of that promoted chart's zeniths.
  const mapNadir = useMemo(
    () => (promoted ? antipodeStamps(promoted.zenith) : nadir),
    [promoted, nadir],
  );

  const orbBands = useMemo(() => {
    if (!effShowOrbZones) return null;
    const bandLines = hideNatalLinework ? EMPTY_FC : promoted ? promoted.lines : lines;
    const bandParans = hideNatalLinework ? EMPTY_FC : promoted ? promoted.parans : parans;
    return generateOrbBands(bandLines, bandParans, orbZoneKm, paranOrbKm);
  }, [effShowOrbZones, hideNatalLinework, promoted, lines, parans, orbZoneKm, paranOrbKm]);

  const activePoint = pinned ?? hover;
  const isNatalPin =
    !!pinned &&
    !!current &&
    Math.abs(pinned.lat - current.birthplace.lat) < 0.001 &&
    Math.abs(pinned.lng - current.birthplace.lng) < 0.001;
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
  // GeoNames data; the network geocoder is only ever touched for a PINNED point
  // with no nearby city (open ocean / remote wilderness):
  //  • NON-NATAL PIN → keeps the label you were hovering (the click lands on it, and
  //    hover stays frozen there, so it's usually identical), then the pin's own
  //    offline "City, Region, Country" (or, on a miss, the network result) fades in
  //    if it differs. `fadeLocation` gates the fade. No country-name flash between.
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
          ? (current?.birthplace.label ?? null)
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
  // capture extras) already has a null path.
  const birthAngles = useMemo(
    () =>
      current && !noTime
        ? current.composite
          ? compositeAngles(current.composite, effHouseSystem)
          : relocate(jd, current.birthplace.lat, current.birthplace.lng, effHouseSystem)
        : null,
    [jd, current, noTime, effHouseSystem],
  );
  const angles = useMemo(
    () =>
      activePoint && current && !current.composite && !noTime
        ? relocate(jd, activePoint.lat, activePoint.lng, effHouseSystem)
        : birthAngles,
    [jd, activePoint, current, noTime, birthAngles, effHouseSystem],
  );
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
  const overlayAngles = useMemo(() => {
    if (!overlayLayer || !current) return null;
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
  }, [overlayLayer, activePoint, current, effHouseSystem]);

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
  const angleCoords = useMemo(() => {
    const obs = activePoint ?? current?.birthplace;
    const a = promoteOverlay ? overlayAngles : angles;
    if (!a || !obs) return null;
    if (promoteOverlay && overlayLayer) {
      return getAngleCoords(a, overlayLayer.gmst, obliquity(overlayLayer.jd), obs.lat, obs.lng);
    }
    return getAngleCoords(a, gmst, eps, obs.lat, obs.lng);
  }, [promoteOverlay, overlayLayer, overlayAngles, angles, activePoint, current, gmst, eps]);

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
  const fortuneWheelPos = useMemo<EclipticPosition | null>(() => {
    if (fortuneDay == null || !angles || !current || current.composite) return null;
    const sun = ecliptic.find((p) => p.name === 'Sun');
    const moon = ecliptic.find((p) => p.name === 'Moon');
    if (!sun || !moon) return null;
    const lon = partOfFortuneLon(angles.asc, sun.lon, moon.lon, fortuneDay, effFortuneFormula);
    return shiftEclipticPositions([{ name: 'Fortune', lon, lat: 0 }], natalAyan)[0];
  }, [fortuneDay, angles, current, ecliptic, effFortuneFormula, natalAyan]);
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
  // Memoized so appending Fortune (a fresh array on the common natal path) doesn't
  // hand the wheel + capture memos a new reference every render.
  const wheelPlanets = useMemo(
    () =>
      noChart
        ? []
        : promoteOverlay && displayOverlayEcliptic
          ? displayOverlayEcliptic
          : fortuneWheelPos
            ? [...displayEcliptic, fortuneWheelPos]
            : displayEcliptic,
    [noChart, promoteOverlay, displayOverlayEcliptic, displayEcliptic, fortuneWheelPos],
  );
  const wheelAngles = noChart
    ? null
    : promoteOverlay && displayOverlayAngles
      ? displayOverlayAngles
      : displayAngles;
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
  const captureExtraAngles = useMemo(
    () =>
      wheelAngles
        ? visibleAngleSpecs(visibleLineTypes).map((s) => ({
            code: s.code,
            name: t(s.nameKey),
            lon: wheelAngles[s.key],
            color: s.color,
          }))
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
  // Transparent (Local Space) export mode is effectively ON only with Local Space up, the
  // Capture frame armed, the toggle set AND the plan at the gated rung. It strips the export to
  // a clean transparent image: forces the details view off, withholds every registered map
  // overlay (journal spots etc.), and drops the caption band + watermark — a bare see-through
  // PNG (the LS lines + compass) for laying over a floor plan, in whatever frame ratio you pick.
  const lsTransparent =
    showLocalSpace && mapTool === 'capture' && transparentMode && gatedTierMet;
  // Every registered map overlay id — withheld from the frame while lsTransparent (a clean
  // LS-only export). The registry is populated at startup, so the set is stable.
  const allCaptureOverlayIds = useMemo(() => new Set(getMapOverlays().map((o) => o.id)), []);
  // Details view is forced OFF (no panel) in transparent mode, and on phones.
  const captureViewEff: 'none' | 'wheel' | 'list' =
    capturePhone || lsTransparent ? 'none' : captureExtras.view;
  // Null (no panel, no inset) unless the Capture tool is armed. WHEEL view shows the wheel
  // whenever a chart exists (the planets are always drawn, angles/balance modulate the rest);
  // LIST view shows whenever there are planet rows (its baseline) or an enabled angles group.
  const captureFrameExtras: CaptureFrameExtras | null =
    mapTool !== 'capture' || captureViewEff === 'none'
      ? null
      : captureViewEff === 'wheel'
        ? wheelAngles
          ? {
              view: 'wheel',
              angles: wheelAngles,
              planets: captureWheelPlanets, // baseline of any view — no planets toggle
              visibleAngles: captureExtras.angles ? captureWheelAngles : emptyWheelAngles,
              balanceGrid: captureExtras.balance ? captureBalanceGrid : null,
            }
          : null
        : captureExtraPlanets.length > 0 ||
            (captureExtras.angles && captureExtraAngles.length > 0)
          ? {
              view: 'list',
              planets: captureExtraPlanets, // baseline — always shown in a chosen view
              angles: captureExtras.angles ? captureExtraAngles : [],
              balance: captureExtras.balance ? captureBalance : [],
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

  const toggleLineType = useCallback((t: LineType) => {
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
  const setAllLineTypes = useCallback((visible: boolean) => {
    setVisibleLineTypes(
      visible ? new Set<LineType>(['MC', 'IC', 'ASC', 'DSC']) : new Set(),
    );
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
      surfaceMissions();
      setPinned({ lat, lng });
      setHover({ lat, lng });
      recordMission('create-pin');
    },
    [surfaceMissions, recordMission],
  );
  const onRecenterPin = useCallback(() => {
    if (pinned) mapRef.current?.flyTo(pinned.lat, pinned.lng);
  }, [pinned]);
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
  // the tool is armed — see SkyBandTrackContext.slideTo).
  const slideToMs = useCallback(
    (ms: number) => {
      if (!current) return;
      mapRef.current?.slideTo((ms - chartUtcMs(current)) / MS_DAY);
    },
    [current],
  );
  // Jump to the previous/next ANGULAR EVENT — the nearest rise / culmination / set /
  // anti-culmination of any visible body at the active point (pin, else birthplace),
  // before/after the slid instant. Windows are anchored to the slid instant in
  // absolute time (dailySkyEvents clamps events into a fixed 24h span from any
  // start), so midnight and DST need no special casing; k reaches further only when
  // a window has no qualifying event (sparse visible sets).
  const stepSlideEvent = useCallback(
    (dir: 1 | -1) => {
      if (!current || visiblePlanets.size === 0) return;
      const point = pinned ?? current.birthplace;
      const base = chartUtcMs(current);
      const slidMs = base + slideDt * MS_DAY;
      const bodies = [...visiblePlanets];
      const EPS = 1000; // keep a just-snapped event from re-matching
      for (let k = 0; k < 3; k++) {
        const winStart = slidMs - MS_DAY / 2 + dir * k * MS_DAY;
        const days = dailySkyEvents(msToJD(winStart), point.lat, point.lng, bodies, nodeType);
        let best: number | null = null;
        for (const d of days) {
          for (const jd of [d.rise, d.culminate, d.set, d.anticulminate]) {
            if (jd === null) continue;
            const ms = jdToMs(jd);
            const ok = dir > 0 ? ms > slidMs + EPS : ms < slidMs - EPS;
            if (ok && (best === null || (dir > 0 ? ms < best : ms > best))) best = ms;
          }
        }
        if (best !== null) {
          const dt = (best - base) / MS_DAY;
          // Optimistic: land slideDt now so a fast second press steps from the
          // NEW instant instead of the throttled report's stale one.
          setSlideDt(dt);
          mapRef.current?.slideTo(dt);
          return;
        }
      }
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
  // Slide needs a natal cage to spin: not available when the natal linework is hidden
  // (eclipses-only) or an overlay is promoted (the cage is the overlay then, not the
  // resampled natal chart). Geodetic is handled by an auto-switch in toggleSlide.
  const slideAvailable = !hideNatalLinework && !promoted;
  useEffect(() => {
    slideAvailableRef.current = slideAvailable;
  }, [slideAvailable]);
  // Exit Slide if its preconditions break mid-spin (geodetic frame, or the cage stops
  // being shown). Un-spins via the Map cleanup → onSlide(0), which resets slideDt.
  useEffect(() => {
    if (mapTool === 'slide' && (lineSystem === 'geodetic' || !slideAvailable)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMapTool('off');
    }
  }, [mapTool, lineSystem, slideAvailable]);
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
  const canSnapLines = lines.features.length > 0;
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
  const closeMission = useCallback(() => {
    if (missionSet) {
      const allDone = missionSet.missions.every(
        (m) => missionProgress.has(m.id) || (m.only3d && !is3d),
      );
      if (allDone) completeMission(missionSet.id);
    }
    closeMissionGuide();
  }, [missionSet, missionProgress, is3d, completeMission, closeMissionGuide]);

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
  // toggle/set and, in Mundane mode, the same ecliptic projection.
  const starParans = useMemo(() => {
    // Natal star × planet parans; hidden while an overlay is active (one-frame rule —
    // these are the natal frame's own parans).
    if (!effShowStarLines || !current || overlayAux) return EMPTY_FC;
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
  }, [effShowStarLines, current, overlayAux, jd, starSet, lineSystem, eps, linePositions, visiblePlanets, meridianLng, theme]);

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
  // generic, per-storageKey persistence. The open core registers none.
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
  // Tools are mutually exclusive — one at a time, like the built-in Measure/Slide/Capture. Opening a
  // tool extension single-selects it (closes any other open extension) AND disarms any armed built-in
  // tool; the reverse (arming a built-in closes open extensions) is the effect below. Generic — works
  // for any registered tool, no per-tool wiring.
  const toggleTool = useCallback((id: string) => {
    const cur = openToolsRef.current;
    const nowOpen = !cur.has(id);
    if (nowOpen) setMapTool('off'); // opening a tool disarms any armed built-in tool
    const next = nowOpen ? new Set([id]) : new Set([...cur].filter((x) => x !== id));
    for (const ext of getToolExtensions()) {
      if (ext.storageKey) localStorage.setItem(ext.storageKey, next.has(ext.id) ? '1' : '0');
    }
    setOpenTools(next);
  }, []);

  // Force a tool extension OPEN (vs. the toggle above) — handed to extensions via the context as
  // openTool, e.g. one HUD launching a companion tool positioned at a chosen point. Single-select
  // (closes any other open tool) and disarms any armed built-in, mirroring toggleTool's open path.
  const openToolById = useCallback((id: string) => {
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
  useEffect(() => {
    const active = mapTool !== 'off' || getToolExtensions().some((ext) => openTools.has(ext.id));
    document.documentElement.toggleAttribute('data-map-tool-active', active);
  }, [mapTool, openTools]);

  // ── Overlay-menu extensions ───────────────────────────────────────────────
  // Single-select, mutually exclusive with the core overlayMode. selectOverlay is the
  // combined setter passed to the Overlay menu's core rows (it clears any active
  // extension as it sets the core mode); selectOverlayExt does the inverse.
  const selectOverlay = useCallback((mode: OverlayMode) => {
    setActiveOverlayExt(null);
    setOverlayMode(mode);
  }, []);
  const selectOverlayExt = useCallback((id: string) => {
    setOverlayMode('off');
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
  // ref access during render (the HUD calls it from its own event handlers).
  const extFlyTo = useCallback(
    (lat: number, lng: number, zoom?: number) => mapRef.current?.flyTo(lat, lng, zoom),
    [],
  );

  // Generate the COMPLETE, UNFILTERED line set — ignores visiblePlanets / visibleLineTypes AND the
  // Advanced family toggles (aspects/midpoints/parans/stars/local-space), so it's EVERYTHING the
  // chart (+ any active overlay) could draw. Reuses the same generators + framing as the drawn
  // linework, minus every filter/gate. Expensive (midpoints are quadratic), so it's a callback the
  // caller runs on demand (once per point query), never a per-render memo.
  const collectAllLines = useCallback((): AllLines => {
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
      };
    }
    const effCoordSystem: CoordSystem = lineSystem === 'geodetic' ? 'zodiaco' : coordSystem;
    // Natal: allLines / allParans / allLocalSpace are ALREADY unfiltered; aspects + midpoints are
    // regenerated here from the FULL body set (not the visible subset), all line types; star lines
    // are generated regardless of the Fixed Stars toggle. The aspect-line display
    // filters are intentionally NOT applied either — this is the everything set.
    const natalLines = withThemeLineColors(allLines, theme);
    const angleFeatures: Feature<LineString, AngleOverlayLineProps>[] = [
      ...generateAspectLines(linePositions, meridianLng, effCoordSystem, eps).features,
      ...generateMidpointLines(linePositions, meridianLng, effCoordSystem, eps).features,
    ];
    const natalAngleLines = withThemeLineColors(
      { type: 'FeatureCollection', features: angleFeatures },
      theme,
    );
    // Unknown birth time: the natal families above are already empty (linePositions
    // is emptied at the source), but the star lines generate from the catalog + jd
    // alone, so they need their own gate here.
    const natalStarLines = noTime
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
    // One-frame rule: when an overlay is active its auxiliary families REPLACE the
    // natal ones in the complete set, so a reveal/report reads the active frame.
    let angleLinesOut: FeatureCollection = natalAngleLines;
    let starLinesOut: FeatureCollection = natalStarLines;
    let paransOut: FeatureCollection = allParans;
    if (overlayLayer) {
      const prefix = OVERLAY_LABEL_PREFIX[overlayLayer.kind];
      const isCyclo = overlayLayer.kind === 'cyclo';
      const ovEps = obliquity(overlayLayer.jd);
      const ovPositions =
        lineSystem === 'geodetic' || coordSystem === 'zodiaco'
          ? projectOntoEcliptic(overlayLayer.positions, overlayLayer.jd)
          : overlayLayer.positions;
      const ovMeridianLng: MeridianLng =
        lineSystem === 'geodetic'
          ? (raM) => (eclipticLonOfRA(raM, ovEps) * 180) / Math.PI
          : (raM) => ((raM - overlayLayer.gmst) * 180) / Math.PI;
      overlayLines = withThemeLineColors(
        isCyclo
          ? tagLabelsBy(generateLines(ovPositions, ovMeridianLng), (p) => cycloBodyTag(p.planet))
          : tagLabels(generateLines(ovPositions, ovMeridianLng), prefix),
        theme,
      );
      // Parans suppressed under Cyclocartography (no single sky-moment across epochs).
      overlayParans = overlayAuxBlocked(overlayLayer.kind, 'paran')
        ? null
        : tagLabels(generateParans(ovPositions, ovMeridianLng), prefix);
      overlayLocalSpace = withThemeLineColors(
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
          ...generateAspectLines(ovPositions, ovMeridianLng, effCoordSystem, ovEps).features,
          ...(overlayAuxBlocked(overlayLayer.kind, 'midpoint')
            ? []
            : generateMidpointLines(ovPositions, ovMeridianLng, effCoordSystem, ovEps).features),
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
        starLinesOut = tagLabels(
          generateStarLines(
            starsOfDate(overlayLayer.jd, starSet),
            ovMeridianLng,
            lineSystem === 'geodetic' ? ovEps : null,
            STAR_LINE_COLORS[theme],
          ),
          isCyclo ? 'Tr' : prefix,
        );
        // Natal parans hidden while an overlay is active; the overlay's live in overlayParans.
        paransOut = EMPTY_FC;
      }
    }
    return {
      lines: natalLines,
      angleLines: angleLinesOut,
      parans: paransOut,
      starLines: starLinesOut,
      localSpace: allLocalSpace,
      overlayLines,
      overlayParans,
      overlayLocalSpace,
    };
  }, [
    current,
    lineSystem,
    coordSystem,
    allLines,
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
    noTime,
  ]);

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

  // ── Effective linework actually drawn, resolved once (the eclipse "hide natal lines" toggle +
  // the promoted-overlay swap) and shared by the <Map> props and the extension ctx. The ctx
  // exposes this FULL set so a consumer can measure every visible line and decide
  // proximity itself; the <Map> narrows each line family through the spotlight (applySpot) and
  // drops the non-line families while a spotlight is active, for a lines-only reveal on a dim map.
  const effLines = hideNatalLinework ? EMPTY_FC : promoted ? promoted.lines : lines;
  // Auxiliary families follow the ACTIVE FRAME (one-frame rule): the overlay's own
  // aspect/midpoint/star/paran set when an overlay is active, the natal set otherwise —
  // never both, and independent of the Natal display toggle (which the promoted swap
  // of the PRIMARY lines still honors). Eclipses keep the natal set (overlayAux false).
  const effAngleLines = hideNatalLinework
    ? EMPTY_FC
    : overlayAux
      ? overlayAngleLines
      : angleLines;
  const effStarLines = hideNatalLinework
    ? EMPTY_FC
    : overlayAux
      ? overlayStarLines
      : starLines;
  const effParans = hideNatalLinework
    ? EMPTY_FC
    : promoted
      ? promoted.parans
      : overlayAux
        ? EMPTY_FC
        : parans;
  const effLocalSpace = hideNatalLinework ? EMPTY_FC : promoted ? promoted.localSpace : localSpace;
  const effLocalSpaceCross = hideNatalLinework
    ? EMPTY_FC
    : promoted
      ? promoted.localSpaceCross
      : localSpaceCross;
  const effLocalSpaceOrigin =
    lsActive && !hideNatalLinework ? (promoted ? promoted.origin : localSpaceOrigin) : null;
  const effZenith =
    hideNatalLinework || !effShowZenith ? EMPTY_FC : promoted ? promoted.zenith : zenith;
  const effNadir = hideNatalLinework || !effShowZenith ? EMPTY_FC : mapNadir;
  const effEcliptic =
    hideNatalLinework || !effShowZenith ? null : promoted ? promoted.eclipticLine : eclipticLine;
  const effOverlayLines = promoted ? null : (mapOverlay?.lines ?? null);
  const effOverlayParans = promoted ? null : (mapOverlay?.parans ?? null);
  const effOverlayLocalSpace = promoted ? null : (mapOverlay?.localSpace ?? null);
  const effMapOverlay = promoted ? null : mapOverlay;

  // The spotlight-narrowed line FCs for the <Map>, MEMOIZED so their references stay stable when the
  // inputs (the spotlight + the effective linework) don't change. Without this, applySpot rebuilds a
  // fresh filtered FeatureCollection every render — which re-pushes to the map each render AND, on
  // tool EXIT, leaves the sources mid-update across the two-render teardown (openTools clears first,
  // then the spotlight), stranding the filtered subset instead of restoring the full set. `applySpot`
  // is stable per spotlight; each eff* is a stable ref per line memo.
  // Each family passes its EFFECTIVE FC plus the matching FULL family from the spotlight (when the
  // caller supplied one); applySpot reveals the full set within the radius, else the effective.
  const fullSet = lineSpotlight?.lines ?? null;
  const spotLines = useMemo(() => applySpot(effLines, fullSet?.lines), [applySpot, effLines, fullSet]);
  const spotAngleLines = useMemo(() => applySpot(effAngleLines, fullSet?.angleLines), [applySpot, effAngleLines, fullSet]);
  const spotParans = useMemo(() => applySpot(effParans, fullSet?.parans), [applySpot, effParans, fullSet]);
  const spotStarLines = useMemo(() => applySpot(effStarLines, fullSet?.starLines), [applySpot, effStarLines, fullSet]);
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
      jd,
      targetDate,
      pinned,
      pinnedLabel,
      visiblePlanets,
      nodeType,
      houseSystem,
      zodiacMode: effZodiacMode,
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
      flyTo: extFlyTo,
      setTargetDate,
      // The exclusion-aware setter (not the raw setOverlayMode) so an extension HUD that
      // drives a core overlay mode also clears any active extension overlay — preserving
      // the Overlay menu's single-select invariant.
      setOverlayMode: selectOverlay,
      openExtensionIds: openExtensions,
      openExtension: openExtensionById,
      openTool: openToolById,
      openCapture: openCaptureTool,
      setLineSpotlight,
      collectAllLines,
    }),
    [
      current,
      partner,
      jd,
      targetDate,
      pinned,
      pinnedLabel,
      visiblePlanets,
      nodeType,
      houseSystem,
      effZodiacMode,
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
      hideNatalLinework,
      extFlyTo,
      selectOverlay,
      openExtensions,
      openExtensionById,
      openToolById,
      openCaptureTool,
      collectAllLines,
    ],
  );

  return (
    <>
      <Map
        ref={mapRef}
        overlayCtx={extensionCtx}
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
        localSpace={spotLocalSpace}
        overlay={spotMapOverlay}
        // While a spotlight is active the reveal is lines-only on a dimmed map, so the non-line
        // families (orb bands, night shade, LS crossings/compass, zenith/nadir stamps, ecliptic,
        // eclipse paths) drop out; otherwise they pass through unchanged.
        orbBands={spotlightActive ? EMPTY_FC : orbBands}
        nightShade={spotlightActive ? EMPTY_FC : nightShade}
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
        nadir={spotlightActive ? EMPTY_FC : effNadir}
        ecliptic={spotlightActive ? null : effEcliptic}
        eclipse={spotlightActive ? null : eclipseMapData}
        eclipseTip={eclipseTip}
        eclipseCard={eclipseCard}
        lineCard={lineCard}
        pin={pinned}
        pinType={isNatalPin ? 'natal' : pinned ? 'custom' : null}
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
        frameExtras={captureFrameExtras}
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
      />
      <div className="map-edge-glow" data-state={coordSource} aria-hidden="true" />
      {!wheelExpanded && (
        <div className="top-left-stack">
          <ProfileWindow
            advancedWheel={advancedWheel}
            setAdvancedWheel={setAdvancedMode}
          />
          {showCoords && (
            <header className="app-header">
              {noTime && (
                <p className="tz-warning">{t('common.timeUnknownBanner')}</p>
              )}
              {current?.tzUncertain && (
                <p className="tz-warning">{t('common.tzWarning')}</p>
              )}
              <CoordReadout
                point={activePoint ?? (current ? current.birthplace : null)}
                angles={wheelAngles}
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
          visiblePlanets={visiblePlanets}
          togglePlanet={togglePlanet}
          setAllPlanets={setAllPlanets}
          visibleLineTypes={visibleLineTypes}
          toggleLineType={toggleLineType}
          setAllLineTypes={setAllLineTypes}
          showParans={showParans}
          setShowParans={setShowParans}
          showAspectLines={showAspectLines}
          setShowAspectLines={setShowAspectLines}
          showMidpointLines={showMidpointLines}
          setShowMidpointLines={setShowMidpointLines}
          overlayMode={overlayMode}
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
          coordSystem={coordSystem}
          setCoordSystem={setCoordSystem}
          fortuneFormula={fortuneFormula}
          setFortuneFormula={setFortuneFormula}
          houseSystem={houseSystem}
          setHouseSystem={setHouseSystem}
          zodiacMode={zodiacMode}
          setZodiacMode={setZodiacMode}
          nodeType={nodeType}
          setNodeType={setNodeType}
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
          setOpenSection={setSidebarSection}
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
        setShowSkyTimes={setShowSkyTimes}
        showLocalSpace={showLocalSpace}
        setShowLocalSpace={setShowLocalSpaceSafe}
        planTier={planTier}
        showGuides={showGuides}
        setShowGuides={toggleGuides}
        openExtensions={openExtensions}
        onToggleExtension={toggleExtension}
        openTools={openTools}
        onToggleTool={toggleTool}
        activeOverlayExt={activeOverlayExt}
        onSelectOverlayExt={selectOverlayExt}
      />
      {showInfo && (
        <InfoBar
          lineSystem={lineSystem}
          coordSystem={coordSystem}
          houseSystem={houseSystem}
          zodiacMode={zodiacMode}
          nodeType={nodeType}
          advancedMode={advancedWheel}
          onOpen={(section) => {
            setShowSettings(true);
            setSidebarSection(section);
          }}
        />
      )}
      {isTimeMode && (
        <TimelineHud
          overlayMode={overlayMode}
          mapState={coordSource}
          targetDate={targetDate}
          setTargetDate={setTargetDate}
          stepUnit={stepUnit}
          setStepUnit={setStepUnit}
          playing={playing}
          setPlaying={setPlaying}
          charts={charts}
          currentId={current?.id ?? null}
          overlayMeasure={overlayLayer?.measure ?? null}
          showTimeline={overlayExpanded}
          onToggleTimeline={toggleOverlayExpanded}
          onSnapReturn={snapToReturn}
          transitFrame={transitFrame}
          setTransitFrame={setTransitFrame}
          lineSystem={lineSystem}
          frameLocked={noTime}
          openExtensions={openExtensions}
          onToggleExtension={toggleExtension}
          advanced={advancedWheel}
          showNatal={showNatal}
          setShowNatal={setShowNatal}
          angleProgression={angleProgression}
          setAngleProgression={setAngleProgression}
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
          showNatalLines={showEclipseNatalLines}
          setShowNatalLines={setShowEclipseNatalLines}
          showChart={showEclipseChart}
          setShowChart={setShowEclipseChart}
          setShowMapLines={setShowEclipseMapLines}
          isoStep={eclipseIsoStep}
          setIsoStep={setEclipseIsoStep}
        />
      )}
      {showTeleport && (
        <TeleportHud
          onFlyTo={teleportToPoint}
          onGoBack={() => {
            const target = mapRef.current?.teleportBack();
            if (target) {
              setLocationReturn((d) => (d === 'forward' ? 'back' : 'forward'));
              setTeleportTarget(target);
            }
          }}
          backState={locationReturn}
          teleportTarget={teleportTarget}
          onClose={() => setShowTeleport(false)}
        />
      )}
      {skyBandVisible && (
        <SkyBand
          // The day clock reads at the followed cursor point (while follow mode
          // is on), else the placed pin, else the chart's birthplace.
          point={skyFollowPoint ?? pinned ?? (current ? current.birthplace : null)}
          placeLabel={
            skyFollowPoint
              ? (skyFollowCity ?? skyFollowCountry ?? t('common.locationFallbackOcean'))
              : pinned
                ? isNatalPin
                  ? (current?.birthplace.label ?? null)
                  : pinnedLabel
                : (current?.birthplace.label ?? null)
          }
          visiblePlanets={visiblePlanets}
          nodeType={nodeType}
          trackShown={skyBandTrackShown}
          onToggleTrack={() => setSkyBandTrackOn((v) => !v)}
          table={skyBandTable}
          onToggleTable={() => setSkyBandTable((v) => !v)}
          follow={!skyFollowOn || phoneLayout ? 'off' : skyHeld ? 'held' : 'live'}
          onToggleFollow={() => setSkyFollowOn((v) => !v)}
          // While the Slide tool spins the sky, the track's time cursor follows
          // the slid instant — the clock shifts with the spin. And while the
          // tool is ARMED, a registered track may scrub that instant back
          // through slideTo (absent otherwise — the affordance keys off it).
          slideMs={slide?.ms ?? null}
          slideTo={sliding ? slideToMs : undefined}
          onClose={() => setShowSkyTimes(false)}
        />
      )}
      {showLocalSpace && (
        <LocalSpaceHud
          onClose={() => setShowLocalSpaceSafe(false)}
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
          lines off, leaving Advanced, or a tier lapse closes it (the open pref
          persists for when the gates return). Raw aspectOrbs is correct here —
          the window can only exist while Advanced is on, where eff === raw. */}
      {effShowAspectLines && gatedTierMet && showAspectLinesHud && (
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
          // Share link: the chart + this camera + the pin as a ?c= URL. A composite
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
          // on showLocalSpace + Capture armed + gatedTierMet at the Map props above.
          localSpaceActive={showLocalSpace}
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
          the extension returns when the gating condition clears. */}
      {/* eslint-disable-next-line react-hooks/refs -- ctx.flyTo reads the map ref only when a HUD invokes it from its own event handlers, never during render */}
      {getMapExtensions().map((ext) =>
        openExtensions.has(ext.id) &&
        (ext.surface !== 'timeline-drawer' || isTimeMode) &&
        (!ext.reservesLeftColumn || !wheelExpanded) ? (
          <Fragment key={ext.id}>
            {isEntitled(ext)
              ? ext.render(extensionCtx, () => toggleExtension(ext.id))
              : null}
          </Fragment>
        ) : null,
      )}
      {/* Registered Tools-menu extensions (registerToolExtension) — toggled HUDs
          surfaced in the Tools dropdown. Entitled → the HUD. */}
      {/* eslint-disable-next-line react-hooks/refs -- ctx.flyTo reads the map ref only when a HUD invokes it from its own event handlers, never during render */}
      {getToolExtensions().map((ext) =>
        openTools.has(ext.id) ? (
          <Fragment key={ext.id}>
            {isAddonEntitled(ext)
              ? ext.render(extensionCtx, () => toggleTool(ext.id))
              : null}
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
          planets={wheelPlanets}
          planetsOnly={noTime}
          // CCG never rides as an overlay ring/caption either (no coherent chart to
          // show alongside the natal) — isCyclo drops it whether or not it's promoted.
          overlayPlanets={promoteOverlay || isCyclo ? null : displayOverlayEcliptic}
          overlayAngles={promoteOverlay || isCyclo ? null : displayOverlayAngles}
          overlayLabel={
            promoteOverlay || isCyclo ? null : (overlayLayer?.labelFull ?? null)
          }
          overlayMoment={
            promoteOverlay || isCyclo ? null : (overlayLayer?.moment ?? null)
          }
          overlayKind={overlayLayer?.kind ?? null}
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
          localSpaceRelocated={localSpaceRelocated}
          aspectOrbs={effAspectOrbs}
          advanced={advancedWheel}
          setAdvanced={setAdvancedMode}
          dualWheels={dualWheels}
          setDualWheels={setDualWheels}
          onClose={() => setWheelExpanded(false)}
          onResizingChange={onResizing}
          onSelectChart={selectChart}
          onNewChart={() => setCreating(true)}
          onEditChart={(id) => setEditingId(id)}
          onDeleteChart={handleDelete}
        />
      ) : (
        showChart && (
          <ChartWheel
            point={activePoint}
            pinned={pinned != null}
            isNatalPin={isNatalPin}
            angles={wheelAngles}
            planets={wheelPlanets}
            visiblePlanets={visiblePlanets}
            noChart={noChart}
            planetsOnly={noTime}
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
                  name: displayName(current?.name ?? ''),
                })
              : undefined
          }
          // …shown visually as a synastry icon + the name, in place of the words.
          heading={
            pickingPartner ? (
              <span className="cm-comparison-title">
                {t('chartManager.comparisonLabel')}
                <SynastryIcon />
                {displayName(current?.name ?? '')}
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
          onDelete={handleDelete}
          onImport={() => setImporting(true)}
          onClose={closeManager}
        />
      )}
      {importing && (
        <ImportChartModal
          onCancel={() => setImporting(false)}
          onImport={handleImport}
        />
      )}
      {/* The guides reference (View ▸ Guides) takes precedence over an onboarding pop-up,
          so only one card shows at a time; closing it lets any unfinished onboarding guide
          resurface on the next gesture. In reference mode the pager flips through the met
          guides — shown only when there's more than one (handled inside MissionGuide). */}
      {showGuides ? (
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
