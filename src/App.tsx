// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection, LineString, Point as GeoPoint } from 'geojson';
import {
  Map,
  type MapHandle,
  type MeasureInfo,
  type OverlayData,
} from './components/Map/Map';
import { Sidebar, type SidebarSection } from './components/Sidebar/Sidebar';
import { TimelineHud } from './components/TimelineHud/TimelineHud';
import { SynastryHud } from './components/SynastryHud/SynastryHud';
import { TeleportHud } from './components/TeleportHud/TeleportHud';
import { TopNav, type MapTool } from './components/TopNav/TopNav';
import { ChartWheel } from './components/ChartWheel/ChartWheel';
import { ExpandedChartSidebar } from './components/ExpandedChartSidebar/ExpandedChartSidebar';
import { CoordReadout } from './components/CoordReadout/CoordReadout';
import { InfoBar } from './components/InfoBar/InfoBar';
import { ChartManager } from './components/ChartManager/ChartManager';
import { ImportChartModal } from './components/ImportChartModal/ImportChartModal';
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
  obliquity,
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
  generateEcliptic,
  generateLines,
  generateZenithStamps,
  type LineProps,
  type LineType,
  type MeridianLng,
  type ZenithProps,
} from './lib/astro/lines';
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
  type TimeUnit,
  type TransitFrame,
} from './lib/astro/timeline';
import {
  loadAngleProgression,
  loadOverlayDate,
  loadOverlayMode,
  loadOverlayPartner,
  loadOverlayStep,
  loadPrimaryRate,
  loadTransitFrame,
  loadUserPrimaryRate,
  saveAngleProgression,
  saveOverlayDate,
  saveOverlayMode,
  saveOverlayPartner,
  saveOverlayStep,
  savePrimaryRate,
  saveTransitFrame,
  saveUserPrimaryRate,
} from './lib/overlayPrefs';
import {
  loadCharts,
  loadCurrentId,
  newChartId,
  saveCharts,
  saveCurrentId,
  type StoredChart,
} from './lib/chartLibrary';
import { applyTheme, loadTheme, saveTheme, type Theme } from './lib/theme';
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

// The Earth/Glass basemaps are light, so the Moon's pale gray line barely shows. On
// those themes only, swap it for a darker slate. The line color is the single source
// the edge badges, hover tip, and crossing-dot blends all read, so they follow suit.
const MOON_LINE_DARK = '#5b6480';
function withDarkMoon<P extends { planet: PlanetName; color: string }>(
  fc: FeatureCollection<LineString, P>,
  theme: Theme,
): FeatureCollection<LineString, P> {
  if (theme === 'dark') return fc;
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) =>
      f.properties.planet === 'Moon'
        ? { ...f, properties: { ...f.properties, color: MOON_LINE_DARK } }
        : f,
    ),
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

  const [visiblePlanets, setVisiblePlanets] = useState<Set<PlanetName>>(
    () => new Set(TRADITIONAL_PLANETS),
  );
  const [visibleLineTypes, setVisibleLineTypes] = useState<Set<LineType>>(
    () => new Set<LineType>(['MC', 'IC', 'ASC', 'DSC']),
  );
  const [showParans, setShowParans] = useState(false);
  const [showLocalSpace, setShowLocalSpace] = useState(false);
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
      if (e.shiftKey || isTypingField(el)) return;
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
        case 'p': setShowParans((v) => !v); break;
        case 'l': setShowLocalSpace((v) => !v); break;
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

  useEffect(() => saveOverlayMode(overlayMode), [overlayMode]);
  useEffect(() => saveOverlayDate(targetDate), [targetDate]);
  useEffect(() => saveOverlayPartner(partnerId), [partnerId]);
  useEffect(() => saveOverlayStep(stepUnit), [stepUnit]);
  useEffect(() => saveAngleProgression(angleProgression), [angleProgression]);
  useEffect(() => savePrimaryRate(primaryRate), [primaryRate]);
  useEffect(() => saveUserPrimaryRate(userPrimaryRate), [userPrimaryRate]);
  useEffect(() => saveTransitFrame(transitFrame), [transitFrame]);

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
    () => withDarkMoon(filterLines(allLines, visiblePlanets, visibleLineTypes), theme),
    [allLines, visiblePlanets, visibleLineTypes, theme],
  );

  const parans = useMemo(
    () => (showParans ? filterParans(allParans, visiblePlanets) : EMPTY_FC),
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
    () => filterZenith(allZenith, visiblePlanets, visibleLineTypes),
    [allZenith, visiblePlanets, visibleLineTypes],
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
  const overlayLayer = useMemo(() => {
    if (overlayMode === 'off' || !current) return null;
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
      lines: withDarkMoon(
        filterLines(
          tagLabels(generateLines(ovPositions, ovMeridianLng), prefix),
          visiblePlanets,
          visibleLineTypes,
        ),
        theme,
      ),
      parans: showParans
        ? filterParans(
            tagLabels(generateParans(ovPositions, overlayLayer.gmst), prefix),
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
      // Zenith points for the overlay bodies — not drawn as stamps, only used so an
      // overlay label flies to its zenith on click (same gating as natal: needs MC).
      zenith: filterZenith(
        generateZenithStamps(ovPositions, ovMeridianLng),
        visiblePlanets,
        visibleLineTypes,
      ),
    };
  }, [overlayLayer, visiblePlanets, visibleLineTypes, showParans, showLocalSpace, coordSystem, lineSystem, theme]);

  // Overlay planets in ecliptic coords for the bi-wheel. (For solar-arc the
  // speed/retrograde sampling is meaningless, but the wheel only reads `lon`.)
  const overlayEcliptic = useMemo(
    () =>
      overlayLayer
        ? toEclipticPositions(overlayLayer.positions, overlayLayer.jd)
        : null,
    [overlayLayer],
  );

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
  // The overlay chart's own MC/IC/AS/DS for the bi-wheel, at the same place as the
  // natal angles. Only the time-based overlays have a genuine second moment we can
  // turn into angles via relocate(jd): the directed overlays (solar-arc, primary)
  // advance the RAMC frame, which our ephemeris wrapper can't convert to angles (no
  // ARMC-based houses), so we skip their marks rather than draw the natal ones.
  // See docs/calculation-methods.md ("Directed-overlay angles").
  const overlayAngles = useMemo(() => {
    if (!overlayLayer || !current) return null;
    if (
      overlayLayer.kind === 'solar-arc' ||
      overlayLayer.kind === 'primary-directions'
    ) {
      return null;
    }
    const lat = activePoint?.lat ?? current.birthplace.lat;
    const lng = activePoint?.lng ?? current.birthplace.lng;
    return relocate(overlayLayer.jd, lat, lng, houseSystem);
  }, [overlayLayer, activePoint, current, houseSystem]);

  // Per-body RA + azimuth/altitude for the Advanced planet table, computed for
  // the same observer location as the relocated angles (active point, else natal).
  const advancedCoords = useMemo(() => {
    // `Map` is the MapLibre component here, so lean on the helper (empty ecliptic
    // → empty result) rather than a `new Map()` literal for the no-chart case.
    const obs = activePoint ?? current?.birthplace;
    return getHorizontalCoords(obs ? ecliptic : [], gmst, eps, obs?.lat ?? 0, obs?.lng ?? 0);
  }, [activePoint, current, ecliptic, gmst, eps]);

  // The same RA + declination + azimuth/altitude for the four chart angles (each
  // an ecliptic point), so the Advanced table can show real data instead of dashes.
  const angleCoords = useMemo(() => {
    const obs = activePoint ?? current?.birthplace;
    if (!angles || !obs) return null;
    return getAngleCoords(angles, gmst, eps, obs.lat, obs.lng);
  }, [angles, activePoint, current, gmst, eps]);

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
  // Double-tap the map to drop or move the pin. Removal is right-click now, so this
  // always places (no same-spot toggle).
  const onPlacePin = useCallback((lat: number, lng: number) => {
    setPinned({ lat, lng });
    setHover({ lat, lng });
  }, []);
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
  // natal pin instead.
  const onRightClick = useCallback(() => {
    if (pinned) setPinned(null);
    else onPinNatal();
  }, [pinned, onPinNatal]);
  // Stable so the measure effect (which depends on it) isn't torn down on every
  // re-render during a drag.
  const stopMeasure = useCallback(() => setMapTool('off'), []);

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
        lines={lines}
        parans={parans}
        localSpace={localSpace}
        localSpaceCross={localSpaceCross}
        localSpaceOrigin={showLocalSpace ? localSpaceOrigin : null}
        zenith={zenith}
        ecliptic={eclipticLine}
        overlay={overlay}
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
        onHover={onHover}
        onLeave={onLeave}
        onPlacePin={onPlacePin}
        onRightClick={onRightClick}
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
            angles={angles}
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
          showTimeline={showTimeline}
          setShowTimeline={setShowTimeline}
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
          pinned={pinned != null}
          isNatalPin={isNatalPin}
          angles={angles}
          planets={ecliptic}
          overlayPlanets={overlayEcliptic}
          overlayAngles={overlayAngles}
          overlayLabel={overlayLayer?.labelFull ?? null}
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
            angles={angles}
            planets={ecliptic}
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
    </>
  );
}
