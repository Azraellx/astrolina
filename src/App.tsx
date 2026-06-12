// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  type OverlayData,
} from './components/Map/Map';
import { Sidebar, type SidebarSection } from './components/Sidebar/Sidebar';
import { TimelineHud } from './components/TimelineHud/TimelineHud';
import { SynastryHud } from './components/SynastryHud/SynastryHud';
import { EclipseHud } from './components/EclipseHud/EclipseHud';
import { TeleportHud } from './components/TeleportHud/TeleportHud';
import { TopNav, type MapTool } from './components/TopNav/TopNav';
import { ChartWheel } from './components/ChartWheel/ChartWheel';
import { ExpandedChartSidebar } from './components/ExpandedChartSidebar/ExpandedChartSidebar';
import { CoordReadout } from './components/CoordReadout/CoordReadout';
import { InfoBar } from './components/InfoBar/InfoBar';
import { ChartManager } from './components/ChartManager/ChartManager';
import { ImportChartModal } from './components/ImportChartModal/ImportChartModal';
import { MissionGuide } from './components/MissionGuide/MissionGuide';
import { useMissions } from './lib/useMissions';
import { SEED_BIRTHS } from './lib/birthData';
import { useReverseGeocode } from './lib/atlas/useReverseGeocode';
import { useNearestCityLabel } from './lib/atlas/useNearestCityLabel';
import { countryOf } from './lib/atlas/countryOf';
import {
  birthDataToJD,
  eclipticLonOfRA,
  getAngleCoords,
  getEclipticPositions,
  getHorizontalCoords,
  getPlanetPositions,
  gmstRadians,
  jdToCivil,
  obliquity,
  PLANET_NAMES,
  projectOntoEcliptic,
  relocate,
  toEclipticPositions,
  TRADITIONAL_PLANETS,
  type CoordSystem,
  type HouseSystem,
  type LineSystem,
  type NodeType,
  type PlanetName,
} from './lib/ephemeris';
import {
  buildEclipseDetails,
  buildEclipseMap,
  jdToMs,
  loadEclipseCatalog,
  nearestEclipse,
  resolveEclipse,
} from './lib/astro/eclipses';
import { localCircumstances } from './lib/astro/eclipsePath';
import {
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
import { generateParans, type ParanProps } from './lib/astro/parans';
import { generateLocalSpace, type LocalSpaceProps } from './lib/astro/localSpace';
import { generateLocalSpaceCrossings } from './lib/astro/localSpaceCrossings';
import {
  buildOverlay,
  minorStepMs,
  OVERLAY_LABEL_PREFIX,
  tagLabels,
  type AngleProgression,
  type OverlayMode,
  type PrimaryRate,
  type RelationshipMethod,
  type TimeUnit,
  type TransitFrame,
} from './lib/astro/timeline';
import { buildDavison } from './lib/astro/relationship';
import {
  loadAngleProgression,
  loadEclipseChartLines,
  loadEclipseId,
  loadEclipseIsoStep,
  loadEclipseNatalLines,
  loadOverlayDate,
  loadOverlayMode,
  loadOverlayPartner,
  loadOverlayStep,
  loadPrimaryRate,
  loadTransitFrame,
  loadUserPrimaryRate,
  loadSynastryMethod,
  saveAngleProgression,
  saveEclipseChartLines,
  saveEclipseId,
  saveEclipseIsoStep,
  saveEclipseNatalLines,
  saveSynastryMethod,
  saveOverlayDate,
  saveOverlayMode,
  saveOverlayPartner,
  saveOverlayStep,
  savePrimaryRate,
  saveTransitFrame,
  saveUserPrimaryRate,
  type EclipseIsoStep,
} from './lib/overlayPrefs';
import {
  loadCharts,
  loadCurrentId,
  newChartId,
  saveCharts,
  saveCurrentId,
  type StoredChart,
} from './lib/chartLibrary';
import { applyTheme, loadTheme, MOON_LINE_DARK, saveTheme, type Theme } from './lib/theme';
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

// The Earth/Glass basemaps are light, so the Moon's pale gray barely shows. On those
// themes only, swap it for a darker slate (MOON_LINE_DARK, shared from lib/theme so the
// baked zenith glyph matches). The color is the single source the edge badges, hover
// tip, crossing-dot blends, AND the zenith disc/stamp all read, so they follow suit.
// Geometry-agnostic so it covers the line/local-space (LineString) and zenith (Point)
// sets. Midpoint lines carry a second body (planetB/colorB, read by their hover tip);
// a Moon there gets the same swap so "Sun/Moon" tips stay readable on light themes.
function withDarkMoon<G extends Geometry, P extends { planet: PlanetName; color: string }>(
  fc: FeatureCollection<G, P>,
  theme: Theme,
): FeatureCollection<G, P> {
  if (theme === 'dark') return fc;
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => {
      const p = f.properties as P & { planetB?: PlanetName; colorB?: string };
      if (p.planet !== 'Moon' && p.planetB !== 'Moon') return f;
      return {
        ...f,
        properties: {
          ...p,
          ...(p.planet === 'Moon' ? { color: MOON_LINE_DARK } : null),
          ...(p.planetB === 'Moon' ? { colorB: MOON_LINE_DARK } : null),
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
): FeatureCollection<LineString, LocalSpaceProps> {
  return {
    type: 'FeatureCollection',
    features: fc.features.filter((f) => planets.has(f.properties.planet)),
  };
}
function filterZenith(
  fc: FeatureCollection<GeoPoint, ZenithProps>,
  planets: Set<PlanetName>,
  lineTypes: Set<LineType>,
): FeatureCollection<GeoPoint, ZenithProps> {
  // The zenith stamp is the MC line's defining point, so it follows the MC toggle.
  if (!lineTypes.has('MC')) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: fc.features.filter((f) => planets.has(f.properties.planet)),
  };
}
// Stamp the overlay tag (e.g. "Tr") onto each zenith point — the on-map stamp's hover
// tooltip reads it, so an overlay (or promoted) zenith reads "Tr Moon" rather than
// being mistaken for the natal body. The natal chart's own zeniths are left untagged.
function tagZeniths(
  fc: FeatureCollection<GeoPoint, ZenithProps>,
  tag: string,
): FeatureCollection<GeoPoint, ZenithProps> {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => ({
      ...f,
      properties: { ...f.properties, tag },
    })),
  };
}

const seedCharts: StoredChart[] = SEED_BIRTHS.map((b, i) => ({
  ...b,
  id: newChartId(),
  createdAt: Date.now() + i,
}));

export default function App() {
  const { t } = useT();
  const [charts, setCharts] = useState<StoredChart[]>(() => {
    const loaded = loadCharts();
    return loaded.length > 0 ? loaded : seedCharts;
  });
  const [currentId, setCurrentId] = useState<string | null>(() => {
    const stored = loadCurrentId();
    return stored ?? charts[0]?.id ?? null;
  });
  const current = useMemo(
    () => charts.find((c) => c.id === currentId) ?? charts[0] ?? null,
    [charts, currentId],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
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
    return new Set(TRADITIONAL_PLANETS);
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
  const [showLocalSpace, setShowLocalSpace] = useState(false);
  // The "Aspects to angles" line sets — two independent overlays (they can
  // stack), persisted like the other map preferences below.
  const [showAspectLines, setShowAspectLines] = useState(
    () => localStorage.getItem('astro:show-aspect-lines:v1') === '1',
  );
  const [showMidpointLines, setShowMidpointLines] = useState(
    () => localStorage.getItem('astro:show-midpoint-lines:v1') === '1',
  );
  const [coordSystem, setCoordSystem] = useState<CoordSystem>(() =>
    localStorage.getItem('astro:coord-system:v1') === 'zodiaco'
      ? 'zodiaco'
      : 'mundo',
  );
  const [houseSystem, setHouseSystem] = useState<HouseSystem>(() => {
    const v = localStorage.getItem('astro:house-system:v1');
    const valid: HouseSystem[] = [
      'placidus', 'whole', 'equal', 'koch', 'regiomontanus', 'campanus', 'porphyry', 'alcabitus',
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
  const [pinned, setPinned] = useState<Point | null>(null);
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
  const [showSettings, setShowSettings] = useState(
    () => localStorage.getItem('astro:view-settings:v1') !== '0',
  );
  // The active-systems status chip (View ▸ Info), above the map attribution.
  // Off by default (like Teleport) — an opt-in detail, not always-on chrome.
  const [showInfo, setShowInfo] = useState(
    () => localStorage.getItem('astro:view-info:v1') === '1',
  );
  // The movable Teleport search window (View ▸ Teleport) — an on-demand tool, so
  // it defaults OFF (unlike the always-on readouts above).
  const [showTeleport, setShowTeleport] = useState(
    () => localStorage.getItem('astro:view-teleport:v1') === '1',
  );
  // The guides reference (View ▸ Guides): reopen the onboarding guides as a glossary.
  // Not persisted — it's an on-demand reference, so it shouldn't reappear on every load.
  // guideIndex is which met-guide the pager is showing (reset to the first on open).
  const [showGuides, setShowGuides] = useState(false);
  const [guideIndex, setGuideIndex] = useState(0);
  // Teleport "Go back" toggle state: 'none' until the first jump, then 'back'
  // (next press returns to where you were) <-> 'forward' (returns to the place you
  // jumped to). Held here so it survives the window closing/reopening.
  const [teleportReturn, setTeleportReturn] = useState<'none' | 'back' | 'forward'>(
    'none',
  );
  // Overlay ▸ Display ▸ Timeline: when off, the bottom timeline collapses to just
  // its draggable nub (no ruler/transport).
  const [showTimeline, setShowTimeline] = useState(
    () => localStorage.getItem('astro:show-timeline:v1') !== '0',
  );
  // Overlay ▸ Display ▸ Zenith: draw the overlay bodies' sub-planetary (zenith)
  // stamps on the map. Off by default. When off, the overlay edge labels also stop
  // being click-to-fly targets — their zenith point isn't shown, so there's nothing
  // to fly to (the App simply feeds the overlay zenith source no points).
  const [showOverlayZenith, setShowOverlayZenith] = useState(
    () => localStorage.getItem('astro:show-overlay-zenith:v1') === '1',
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
    if (v === 'theme' || v === 'filters' || v === 'calc' || v === 'overlay') {
      return v;
    }
    if (v === 'none') return null;
    return 'filters';
  });

  const [overlayMode, setOverlayMode] = useState<OverlayMode>(() =>
    loadOverlayMode(),
  );
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
  // Eclipses overlay: the selected catalog eclipse (by id), the magnitude-
  // isoline interval, and the "eclipse chart lines" display toggle.
  const [eclipseId, setEclipseId] = useState<string | null>(() =>
    loadEclipseId(),
  );
  const [eclipseIsoStep, setEclipseIsoStep] = useState<EclipseIsoStep>(() =>
    loadEclipseIsoStep(),
  );
  const [showEclipseChartLines, setShowEclipseChartLines] = useState(() =>
    loadEclipseChartLines(),
  );
  const [showEclipseNatalLines, setShowEclipseNatalLines] = useState(() =>
    loadEclipseNatalLines(),
  );

  // Mapping tools (top bar). Transient — not persisted across reloads.
  const [mapTool, setMapTool] = useState<MapTool>('off');
  const [measure, setMeasure] = useState<MeasureInfo | null>(null);
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

  // Global keyboard shortcuts. Space centers the map on the active pin (or drops
  // a natal pin and centers if none is set); 'b' toggles the chart sidebar; the
  // other letter keys toggle the View items / tools / add a chart. All are ignored
  // while typing in a field, and Space is left alone when a button/link is focused
  // so it keeps its native activation behavior there.
  useEffect(() => {
    // 'o' cycles through the overlays only (never lands on None); 'n' clears to None.
    // From None, indexOf is -1 so the first 'o' lands on the first overlay (transits).
    const overlayCycle: OverlayMode[] = [
      'transits', 'progressed', 'solar-arc', 'primary-directions', 'synastry',
      'eclipses',
    ];
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
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
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
      if (isTypingField(el)) return;
      // Shift+letter: the Map-filters technique toggles (Parans / Local Space /
      // Aspect Lines / Midpoint Lines). Kept on Shift so the plain letters stay
      // free for the view/tool hotkeys below.
      if (e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case 'p': setShowParans((v) => !v); break;
          case 'l': setShowLocalSpace((v) => !v); break;
          case 'a': setShowAspectLines((v) => !v); break;
          case 'm': setShowMidpointLines((v) => !v); break;
          default: return;
        }
        e.preventDefault();
        return;
      }
      switch (e.key.toLowerCase()) {
        case 'm': setShowChart((v) => !v); break;
        case 'c': setShowCoords((v) => !v); break;
        case 's': setShowSettings((v) => !v); break;
        case 'i': setShowInfo((v) => !v); break;
        case 'g': setShowTeleport((v) => !v); break;
        case 'o':
          setOverlayMode(
            (mode) =>
              overlayCycle[(overlayCycle.indexOf(mode) + 1) % overlayCycle.length],
          );
          break;
        case 'n': setOverlayMode('off'); break;
        case 't': setMapTool((tl) => (tl === 'measure' ? 'off' : 'measure')); break;
        case 'a': setCreating(true); break;
        case 'b': if (current) setWheelExpanded((v) => !v); break;
        default: return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current, pinned]);

  useEffect(() => {
    localStorage.setItem('astro:coord-system:v1', coordSystem);
  }, [coordSystem]);
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
    localStorage.setItem('astro:view-settings:v1', showSettings ? '1' : '0');
  }, [showSettings]);
  useEffect(() => {
    localStorage.setItem('astro:view-info:v1', showInfo ? '1' : '0');
  }, [showInfo]);
  useEffect(() => {
    localStorage.setItem('astro:view-teleport:v1', showTeleport ? '1' : '0');
  }, [showTeleport]);
  useEffect(() => {
    localStorage.setItem('astro:sidebar-section:v1', sidebarSection ?? 'none');
  }, [sidebarSection]);
  useEffect(() => {
    localStorage.setItem('astro:show-timeline:v1', showTimeline ? '1' : '0');
  }, [showTimeline]);
  useEffect(() => {
    localStorage.setItem(
      'astro:show-overlay-zenith:v1',
      showOverlayZenith ? '1' : '0',
    );
  }, [showOverlayZenith]);
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
  useEffect(
    () => saveEclipseChartLines(showEclipseChartLines),
    [showEclipseChartLines],
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
    overlayMode === 'solar-arc' ||
    overlayMode === 'primary-directions';
  // Adjusted during render (not in an effect) so we never paint a frame that's
  // still "playing" after the overlay has left a time mode.
  if (!isTimeMode && playing) setPlaying(false);

  useEffect(() => {
    saveCharts(charts);
  }, [charts]);
  useEffect(() => {
    saveCurrentId(current?.id ?? null);
  }, [current]);

  const jd = useMemo(
    () => (current ? birthDataToJD(current) : 0),
    [current],
  );
  const positions = useMemo(
    () => (current ? getPlanetPositions(jd, nodeType) : []),
    [current, jd, nodeType],
  );
  const ecliptic = useMemo(
    () => (current ? getEclipticPositions(jd, nodeType) : []),
    [current, jd, nodeType],
  );
  const gmst = useMemo(() => gmstRadians(jd), [jd]);
  const eps = useMemo(() => obliquity(jd), [jd]);

  // Positions feeding the map LINES. Geodetic mode and In-Zodiaco both project each
  // body onto the ecliptic first (geodetic needs the true zodiacal longitude even
  // for off-ecliptic bodies); In-Mundo keeps true sky positions. The wheel keeps
  // using `positions`/`ecliptic` (longitude is identical either way).
  const linePositions = useMemo(
    () =>
      lineSystem === 'geodetic' || coordSystem === 'zodiaco'
        ? projectOntoEcliptic(positions, jd)
        : positions,
    [lineSystem, coordSystem, positions, jd],
  );

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

  const allLines = useMemo(
    () => generateLines(linePositions, meridianLng),
    [linePositions, meridianLng],
  );
  const allParans = useMemo(
    () => generateParans(linePositions, gmst),
    [linePositions, gmst],
  );
  // Local space radiates from the placed pin (relocated local space) — or the
  // birthplace when nothing is pinned. Also the anchor for the LS ring labels.
  const localSpaceOrigin = useMemo<Point | null>(
    () => pinned ?? (current ? current.birthplace : null),
    [pinned, current],
  );
  const allLocalSpace = useMemo(
    () =>
      localSpaceOrigin
        ? generateLocalSpace(
            linePositions,
            gmst,
            localSpaceOrigin.lat,
            localSpaceOrigin.lng,
          )
        : EMPTY_FC,
    [linePositions, gmst, localSpaceOrigin],
  );
  const allZenith = useMemo(
    () => generateZenithStamps(linePositions, meridianLng),
    [linePositions, meridianLng],
  );
  // The ecliptic great circle for the chart instant — a fixed reference (passes
  // through the Sun's zenith), independent of planet visibility, so not filtered.
  // (Named *Line to avoid colliding with the `ecliptic` projection-mode variable.)
  const eclipticLine = useMemo(() => generateEcliptic(jd, meridianLng), [jd, meridianLng]);

  const lines = useMemo(
    () =>
      mergeNodePairs(
        withDarkMoon(filterLines(allLines, visiblePlanets, visibleLineTypes), theme),
      ),
    [allLines, visiblePlanets, visibleLineTypes, theme],
  );

  // The "Aspects to angles" overlay lines (aspect and/or midpoint sets — both
  // share one map source). Unlike the base lines this generates FROM the visible
  // set: the midpoint pair count is quadratic in it, and the node dedup below
  // depends on it. In geodetic mode the positions are already ecliptic-projected
  // (see linePositions), so the measuring frame is zodiacal regardless of the
  // (possibly stale, hidden) In-Mundo/In-Zodiaco radio.
  const angleLines = useMemo<
    FeatureCollection<LineString, AngleOverlayLineProps>
  >(() => {
    if ((!showAspectLines && !showMidpointLines) || !current) return EMPTY_FC;
    const effCoordSystem: CoordSystem =
      lineSystem === 'geodetic' ? 'zodiaco' : coordSystem;
    const vis = linePositions.filter((p) => visiblePlanets.has(p.name));
    const features: Feature<LineString, AngleOverlayLineProps>[] = [];
    if (showAspectLines) {
      // (The generator drops the South Node itself while the North Node is
      // visible — antipodal duplicate set, same spirit as mergeNodeParans.)
      features.push(
        ...generateAspectLines(vis, meridianLng, effCoordSystem, eps).features,
      );
    }
    if (showMidpointLines) {
      features.push(
        ...generateMidpointLines(vis, meridianLng, effCoordSystem, eps).features,
      );
    }
    return withDarkMoon(
      {
        type: 'FeatureCollection',
        features: features.filter((f) =>
          visibleLineTypes.has(f.properties.lineType),
        ),
      },
      theme,
    );
  }, [
    showAspectLines,
    showMidpointLines,
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
      showParans
        ? mergeNodeParans(filterParans(allParans, visiblePlanets), visiblePlanets)
        : EMPTY_FC,
    [allParans, visiblePlanets, showParans],
  );

  const localSpace = useMemo(
    () =>
      showLocalSpace
        ? withDarkMoon(filterLocalSpace(allLocalSpace, visiblePlanets), theme)
        : EMPTY_FC,
    [allLocalSpace, visiblePlanets, showLocalSpace, theme],
  );
  // Dots where the (visible) local-space lines cross the (visible) birth-chart
  // lines — only while local space is shown.
  const localSpaceCross = useMemo(
    () =>
      showLocalSpace ? generateLocalSpaceCrossings(localSpace, lines) : EMPTY_FC,
    [showLocalSpace, localSpace, lines],
  );
  const zenith = useMemo(
    () =>
      withDarkMoon(filterZenith(allZenith, visiblePlanets, visibleLineTypes), theme),
    [allZenith, visiblePlanets, visibleLineTypes, theme],
  );

  // ── Timeline / overlay: a second chart layer (transits, secondary
  // progressions, solar-arc directions, or a synastry partner) derived from the
  // current chart via buildOverlay, then run through the SAME generators and
  // visibility filters as the base.
  // A chart can't be its own synastry partner, so a partner that matches the active
  // chart resolves to none (the effect below also clears the stale selection).
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
  const eclipseCatalog = useMemo(() => loadEclipseCatalog(), []);
  const eclipseRow = useMemo(() => {
    if (overlayMode !== 'eclipses') return null;
    return (
      eclipseCatalog.find((r) => r.id === eclipseId) ??
      nearestEclipse(eclipseCatalog, targetDate)
    );
  }, [overlayMode, eclipseCatalog, eclipseId, targetDate]);
  // Pin the fallback selection: entering the mode with no (or a stale) saved id
  // lands on the eclipse nearest the overlay date; persist that id immediately
  // so timeline scrubbing in other modes can't silently change the selection.
  // Adjusted during render (the playing-pause precedent above), not an effect.
  if (eclipseRow && eclipseRow.id !== eclipseId) setEclipseId(eclipseRow.id);
  const resolvedEclipse = useMemo(
    () => (eclipseRow ? resolveEclipse(eclipseRow) : null),
    [eclipseRow],
  );
  const eclipseMapData = useMemo(
    () =>
      resolvedEclipse
        ? buildEclipseMap(
            resolvedEclipse,
            eclipseIsoStep,
            theme,
            `${resolvedEclipse.row.id} · ${t(`settings.eclipses.kind.${resolvedEclipse.row.kind}`)}`,
          )
        : null,
    [resolvedEclipse, eclipseIsoStep, theme, t],
  );
  const eclipseDetails = useMemo(
    () => (resolvedEclipse ? buildEclipseDetails(resolvedEclipse) : null),
    [resolvedEclipse],
  );
  // Local circumstances under the cursor, for the eclipse-curve hover tip.
  const eclipseTip = useMemo(() => {
    if (!resolvedEclipse) return null;
    const el = resolvedEclipse.elements;
    return (lat: number, lng: number) => {
      const lc = localCircumstances(el, lat, lng);
      if (!lc) return null;
      const civil = jdToCivil(lc.jd);
      const p = (n: number) => String(n).padStart(2, '0');
      return t('map.eclipse.localMax', {
        pct: `${Math.round(lc.obscuration * 100)}%`,
        time: `${p(civil.hour)}:${p(civil.minute)}`,
      });
    };
  }, [resolvedEclipse, t]);

  const overlayLayer = useMemo(() => {
    if (overlayMode === 'off' || !current) return null;
    if (overlayMode === 'eclipses') {
      // The optional "eclipse chart lines": planet/angle lines for the sky at
      // the eclipse maximum — a transit overlay pinned to that instant.
      if (!showEclipseChartLines || !resolvedEclipse) return null;
      return buildOverlay(
        current,
        'eclipses',
        jdToMs(resolvedEclipse.event.maximum),
        null,
        nodeType,
        angleProgression,
        primaryRate,
        userPrimaryRate,
        transitFrame,
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
      transitFrame,
      t,
    );
  }, [
    overlayMode,
    current,
    targetDate,
    partner,
    nodeType,
    angleProgression,
    primaryRate,
    userPrimaryRate,
    transitFrame,
    showEclipseChartLines,
    resolvedEclipse,
    t,
  ]);

  const overlay = useMemo<OverlayData | null>(() => {
    if (!overlayLayer) return null;
    const prefix = OVERLAY_LABEL_PREFIX[overlayLayer.kind];
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
        withDarkMoon(
          filterLines(
            tagLabels(generateLines(ovPositions, ovMeridianLng), prefix),
            visiblePlanets,
            visibleLineTypes,
          ),
          theme,
        ),
      ),
      parans: showParans
        ? mergeNodeParans(
            filterParans(
              tagLabels(generateParans(ovPositions, overlayLayer.gmst), prefix),
              visiblePlanets,
            ),
            visiblePlanets,
          )
        : EMPTY_FC,
      localSpace: showLocalSpace
        ? withDarkMoon(
            filterLocalSpace(
              generateLocalSpace(
                ovPositions,
                overlayLayer.gmst,
                overlayLayer.originLat,
                overlayLayer.originLng,
              ),
              visiblePlanets,
            ),
            theme,
          )
        : EMPTY_FC,
      // Zenith points for the overlay bodies. When Overlay ▸ Display ▸ Zenith is on
      // these are drawn as stamps AND each overlay label flies to its zenith on click
      // (same MC gating as natal). When off we feed no points: the stamps vanish and,
      // with no fly target, the overlay labels become non-clickable.
      zenith: showOverlayZenith
        ? tagZeniths(
            withDarkMoon(
              filterZenith(
                generateZenithStamps(ovPositions, ovMeridianLng),
                visiblePlanets,
                visibleLineTypes,
              ),
              theme,
            ),
            prefix,
          )
        : EMPTY_FC,
      // The overlay's ecliptic (zodiac) line — a dotted yellow companion to the natal
      // ecliptic, threading through the overlay Sun's zenith. Shown only when the
      // overlay zeniths are (same gate), since it's the zenith stamps' reference curve.
      ecliptic: showOverlayZenith
        ? generateEcliptic(overlayLayer.jd, ovMeridianLng)
        : EMPTY_FC,
    };
  }, [overlayLayer, visiblePlanets, visibleLineTypes, showParans, showLocalSpace, showOverlayZenith, coordSystem, lineSystem, theme]);

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
    overlayMode === 'solar-arc' ||
    overlayMode === 'primary-directions';
  const promoteOverlay = isTimeOverlay && !!overlayLayer && !showNatal;
  // Eclipses ▸ Display ▸ Natal Chart Lines: unlike the time overlays' Natal
  // toggle (which promotes the overlay to stand in for the chart), turning
  // this off simply clears the natal LINEWORK off the map — lines, derived
  // aspect/midpoint lines, parans, local space, zenith stamps, ecliptic — so
  // the eclipse path stands alone. The wheel and readouts keep the natal chart.
  const hideNatalLinework = overlayMode === 'eclipses' && !showEclipseNatalLines;

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
    const pLines = mergeNodePairs(
      withDarkMoon(
        filterLines(
          tagLabels(generateLines(ovPositions, ovMeridianLng), prefix),
          visiblePlanets,
          visibleLineTypes,
        ),
        theme,
      ),
    );
    const pLocalSpace = showLocalSpace
      ? withDarkMoon(
          filterLocalSpace(
            generateLocalSpace(
              ovPositions,
              overlayLayer.gmst,
              overlayLayer.originLat,
              overlayLayer.originLng,
            ),
            visiblePlanets,
          ),
          theme,
        )
      : EMPTY_FC;
    return {
      lines: pLines,
      parans: showParans
        ? mergeNodeParans(
            filterParans(
              tagLabels(generateParans(ovPositions, overlayLayer.gmst), prefix),
              visiblePlanets,
            ),
            visiblePlanets,
          )
        : EMPTY_FC,
      localSpace: pLocalSpace,
      localSpaceCross: showLocalSpace
        ? generateLocalSpaceCrossings(pLocalSpace, pLines)
        : EMPTY_FC,
      // Zeniths + ecliptic follow the Zenith toggle here too, so it still has an effect
      // while Natal is hidden: empty when off → the stamps/line vanish and the promoted
      // labels lose their fly target, just like a normal overlay with Zenith off.
      zenith: showOverlayZenith
        ? tagZeniths(
            withDarkMoon(
              filterZenith(
                generateZenithStamps(ovPositions, ovMeridianLng),
                visiblePlanets,
                visibleLineTypes,
              ),
              theme,
            ),
            prefix,
          )
        : EMPTY_FC,
      eclipticLine: showOverlayZenith
        ? generateEcliptic(overlayLayer.jd, ovMeridianLng)
        : EMPTY_FC,
      origin: { lat: overlayLayer.originLat, lng: overlayLayer.originLng } as Point,
    };
  }, [
    promoteOverlay,
    overlayLayer,
    visiblePlanets,
    visibleLineTypes,
    showParans,
    showLocalSpace,
    showOverlayZenith,
    coordSystem,
    lineSystem,
    theme,
  ]);

  const activePoint = pinned ?? hover;
  const isNatalPin =
    !!pinned &&
    !!current &&
    Math.abs(pinned.lat - current.birthplace.lat) < 0.001 &&
    Math.abs(pinned.lng - current.birthplace.lng) < 0.001;
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
  //  Suppressed while measuring.
  const pinnedLabel = useReverseGeocode(
    mapTool === 'measure' || isNatalPin ? null : pinned,
    detailZoom,
  );
  const hoverCity = useNearestCityLabel(mapTool === 'measure' ? null : hover);
  const hoverCountry = useMemo(
    () => (hover ? countryOf(hover.lat, hover.lng) : null),
    [hover],
  );
  // Once pinned, hover stays frozen on the clicked point (onHover/onLeave are gated
  // on !pinned), so this hovered-point label doubles as the pin's placeholder while
  // the reverse-geocode loads.
  // Over water there's no city and no country, so fall back to a plain "Ocean".
  const hoverLabel =
    mapTool === 'measure' || !hover
      ? null
      : (hoverCity ?? hoverCountry ?? t('common.locationFallbackOcean'));
  const locationLabel =
    mapTool === 'measure'
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
    !!pinned && !isNatalPin && pinnedLabel != null && pinnedLabel !== hoverLabel;
  // The Coordinates window names the active point. In the plain natal state (no
  // pin/hover) the top readout shows nothing, but the window should still name the
  // birthplace it's displaying — so fall back to it there.
  const coordLocation =
    locationLabel ??
    (coordSource === 'natal' ? (current?.birthplace.label ?? null) : null);

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

  const birthAngles = useMemo(
    () =>
      current
        ? relocate(jd, current.birthplace.lat, current.birthplace.lng, houseSystem)
        : null,
    [jd, current, houseSystem],
  );
  const angles = useMemo(
    () =>
      activePoint && current
        ? relocate(jd, activePoint.lat, activePoint.lng, houseSystem)
        : birthAngles,
    [jd, activePoint, current, birthAngles, houseSystem],
  );
  // The overlay chart's own MC/IC/AS/DS for the bi-wheel, at the same place as the natal
  // angles. Time-based overlays (transits / progressed / synastry) have a genuine second
  // moment → relocate(jd) at the active point. The directed overlays (solar-arc, primary)
  // have no such moment: their angles are the NATAL angles advanced by the arc, so we
  // relocate the natal angles to the active point and apply the overlay's directAngle
  // closure (same arc + frame the bodies use). See docs/calculation-methods.md
  // ("Directed-overlay angles").
  const overlayAngles = useMemo(() => {
    if (!overlayLayer || !current) return null;
    const lat = activePoint?.lat ?? current.birthplace.lat;
    const lng = activePoint?.lng ?? current.birthplace.lng;
    const base = relocate(overlayLayer.jd, lat, lng, houseSystem);
    const direct = overlayLayer.directAngle;
    if (!direct) return base; // transits / progressed / synastry
    const wrap = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const asc = direct(base.asc);
    const mc = direct(base.mc);
    return { ...base, asc, mc, dsc: wrap(asc + Math.PI), ic: wrap(mc + Math.PI) };
  }, [overlayLayer, activePoint, current, houseSystem]);

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

  // While promoting the overlay (Natal off), the wheel + coordinate readout read the
  // overlay's own planet positions / angles as the single chart; the natal ring is
  // dropped (see the overlay* props on the wheel below, nulled when promoting).
  const wheelPlanets = promoteOverlay && overlayEcliptic ? overlayEcliptic : ecliptic;
  const wheelAngles = promoteOverlay && overlayAngles ? overlayAngles : angles;

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
  }, [mapTool, canSnapLines, triggerMission]);

  // Surface the zoom/perspective guide the first time the user zooms past the detail
  // threshold (the "Zoom out" button appears → detailZoom true). `replace` shows it even
  // if another guide is still open (it would otherwise be lost — detailZoom won't flip
  // again until a zoom-out/in). The set re-surfaces on later zoom-in passes until done.
  useEffect(() => {
    if (detailZoom) triggerMission('zoom-threshold', true);
  }, [detailZoom, triggerMission]);

  // An only3d mission (e.g. "change perspective") is not applicable in 2D — it's never
  // recorded there, just shown as already satisfied. So persist a set once every mission
  // is either done OR not-applicable; the recordEvent path alone can't finish such a set.
  const is3d = projection === '3d';
  useEffect(() => {
    if (!missionSet) return;
    const allDone = missionSet.missions.every(
      (m) => missionProgress.has(m.id) || (m.only3d && !is3d),
    );
    if (allDone) completeMission(missionSet.id);
  }, [missionSet, missionProgress, is3d, completeMission]);

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
    // The saved chart becomes active — stamp its recency.
    const stamped = { ...chart, lastUsedAt: Date.now() };
    setCharts((prev) => {
      const exists = prev.some((c) => c.id === stamped.id);
      return exists
        ? prev.map((c) => (c.id === stamped.id ? stamped : c))
        : [...prev, stamped];
    });
    setCurrentId(stamped.id);
    setEditingId(null);
    setCreating(false);
    setPinned(null);
    setHover(null);
  };

  // Build a relationship chart from the active chart + its synastry partner using the
  // chosen method, make it the active chart, and clear the partner — the synastry view
  // stays on (its partner slot just empties for re-picking). Davison only for now;
  // Composite is gated off in the UI until its render path exists.
  const handleGenerateRelationship = () => {
    if (overlayMode !== 'synastry' || synastryMethod !== 'davison') return;
    if (!current || !partner) return;
    const now = Date.now();
    const chart: StoredChart = {
      ...buildDavison(current, partner),
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
    // A real import is the end of the flow — close the chart manager too (it stays
    // open behind the import modal so Cancel returns to it).
    closeManager();
    // The first imported chart becomes active — stamp its recency.
    const stamped = imported.map((c, i) =>
      i === 0 ? { ...c, lastUsedAt: Date.now() } : c,
    );
    setCharts((prev) => [...prev, ...stamped]);
    setCurrentId(stamped[0].id);
    setPinned(null);
    setHover(null);
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
  };

  return (
    <>
      <Map
        ref={mapRef}
        lines={hideNatalLinework ? EMPTY_FC : promoted ? promoted.lines : lines}
        // Natal-only by design; when the overlay is promoted the natal chart is
        // hidden, so its derived aspect/midpoint lines hide with it.
        angleLines={promoted || hideNatalLinework ? EMPTY_FC : angleLines}
        parans={hideNatalLinework ? EMPTY_FC : promoted ? promoted.parans : parans}
        localSpace={
          hideNatalLinework ? EMPTY_FC : promoted ? promoted.localSpace : localSpace
        }
        localSpaceCross={
          hideNatalLinework
            ? EMPTY_FC
            : promoted
              ? promoted.localSpaceCross
              : localSpaceCross
        }
        localSpaceOrigin={
          showLocalSpace && !hideNatalLinework
            ? (promoted ? promoted.origin : localSpaceOrigin)
            : null
        }
        zenith={hideNatalLinework ? EMPTY_FC : promoted ? promoted.zenith : zenith}
        ecliptic={
          hideNatalLinework ? null : promoted ? promoted.eclipticLine : eclipticLine
        }
        overlay={promoted ? null : overlay}
        eclipse={eclipseMapData}
        eclipseTip={eclipseTip}
        pin={pinned}
        pinType={isNatalPin ? 'natal' : pinned ? 'custom' : null}
        theme={theme}
        projection={projection}
        showRoads={showRoads}
        showRivers={showRivers}
        showLabels={showLabels}
        measureActive={mapTool === 'measure'}
        measureColor={measureColor}
        onMeasure={setMeasure}
        onMeasureCancel={stopMeasure}
        onMissionEvent={recordMission}
        keepZoomOutVisible={missionSet?.id === 'zoom-basics'}
        onHover={onHover}
        onLeave={onLeave}
        onPlacePin={onPlacePin}
        onRightClick={onRightClick}
        onMapClick={surfaceMissions}
        onDetailZoomChange={setDetailZoom}
      />
      <div className="map-edge-glow" data-state={coordSource} aria-hidden="true" />
      {!wheelExpanded && showCoords && (
        <header className="app-header">
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
      {showSettings && (
        <Sidebar
          visiblePlanets={visiblePlanets}
          togglePlanet={togglePlanet}
          setAllPlanets={setAllPlanets}
          visibleLineTypes={visibleLineTypes}
          toggleLineType={toggleLineType}
          setAllLineTypes={setAllLineTypes}
          showParans={showParans}
          setShowParans={setShowParans}
          showLocalSpace={showLocalSpace}
          setShowLocalSpace={setShowLocalSpace}
          showAspectLines={showAspectLines}
          setShowAspectLines={setShowAspectLines}
          showMidpointLines={showMidpointLines}
          setShowMidpointLines={setShowMidpointLines}
          lineSystem={lineSystem}
          setLineSystem={setLineSystem}
          coordSystem={coordSystem}
          setCoordSystem={setCoordSystem}
          houseSystem={houseSystem}
          setHouseSystem={setHouseSystem}
          nodeType={nodeType}
          setNodeType={setNodeType}
          overlayMode={overlayMode}
          transitFrame={transitFrame}
          setTransitFrame={setTransitFrame}
          synastryMethod={synastryMethod}
          setSynastryMethod={setSynastryMethod}
          onGenerateRelationship={handleGenerateRelationship}
          canGenerateRelationship={overlayMode === 'synastry' && !!partner}
          eclipseDetails={eclipseDetails}
          showEclipseNatalLines={showEclipseNatalLines}
          setShowEclipseNatalLines={setShowEclipseNatalLines}
          showEclipseChartLines={showEclipseChartLines}
          setShowEclipseChartLines={setShowEclipseChartLines}
          eclipseIsoStep={eclipseIsoStep}
          setEclipseIsoStep={setEclipseIsoStep}
          showTimeline={showTimeline}
          setShowTimeline={setShowTimeline}
          showOverlayZenith={showOverlayZenith}
          setShowOverlayZenith={setShowOverlayZenith}
          showNatal={showNatal}
          setShowNatal={setShowNatal}
          angleProgression={angleProgression}
          setAngleProgression={setAngleProgression}
          primaryRate={primaryRate}
          setPrimaryRate={setPrimaryRate}
          userPrimaryRate={userPrimaryRate}
          setUserPrimaryRate={setUserPrimaryRate}
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
        />
      )}
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
        locationLabel={locationLabel}
        fadeLocation={fadeLocation}
        overlayMode={overlayMode}
        setOverlayMode={setOverlayMode}
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
        showGuides={showGuides}
        setShowGuides={toggleGuides}
      />
      {showInfo && (
        <InfoBar
          lineSystem={lineSystem}
          coordSystem={coordSystem}
          houseSystem={houseSystem}
          nodeType={nodeType}
          onClick={() => {
            setShowSettings(true);
            setSidebarSection('calc');
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
          showTimeline={showTimeline}
        />
      )}
      {overlayMode === 'synastry' && (
        <SynastryHud
          partner={partner}
          charts={charts}
          currentId={current?.id ?? null}
          onSelectPartner={setPartnerId}
          onAddPerson={() => setCreating(true)}
        />
      )}
      {overlayMode === 'eclipses' && (
        <EclipseHud
          catalog={eclipseCatalog}
          selected={eclipseRow}
          onSelect={setEclipseId}
        />
      )}
      {showTeleport && (
        <TeleportHud
          onFlyTo={(lat, lng, zoom) => {
            mapRef.current?.teleportTo(lat, lng, zoom);
            setTeleportReturn('back');
          }}
          onGoBack={() => {
            mapRef.current?.teleportBack();
            setTeleportReturn((d) => (d === 'forward' ? 'back' : 'forward'));
          }}
          backState={teleportReturn}
          onClose={() => setShowTeleport(false)}
        />
      )}
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
          overlayPlanets={promoteOverlay ? null : overlayEcliptic}
          overlayAngles={promoteOverlay ? null : overlayAngles}
          overlayLabel={promoteOverlay ? null : (overlayLayer?.labelFull ?? null)}
          visiblePlanets={visiblePlanets}
          visibleLineTypes={visibleLineTypes}
          advancedCoords={advancedCoords}
          angleCoords={angleCoords}
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
          />
        )
      )}
      {(creating || editingId != null) && (
        <ChartManager
          charts={charts}
          currentId={current?.id ?? null}
          initialEditId={editingId}
          onSelect={(id) => {
            selectChart(id);
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
            onClose={closeMissionGuide}
          />
        )
      )}
    </>
  );
}
