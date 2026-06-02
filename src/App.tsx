import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection, LineString, Point as GeoPoint } from 'geojson';
import {
  Map,
  type MapHandle,
  type MeasureInfo,
  type OverlayData,
} from './components/Map/Map';
import { Sidebar } from './components/Sidebar/Sidebar';
import { TimelineHud } from './components/TimelineHud/TimelineHud';
import { SynastryHud } from './components/SynastryHud/SynastryHud';
import { TopNav, type MapTool } from './components/TopNav/TopNav';
import { ChartWheel } from './components/ChartWheel/ChartWheel';
import { ExpandedChartSidebar } from './components/ExpandedChartSidebar/ExpandedChartSidebar';
import { CoordReadout } from './components/CoordReadout/CoordReadout';
import { BirthDataForm } from './components/BirthDataForm/BirthDataForm';
import { ImportChartModal } from './components/ImportChartModal/ImportChartModal';
import { SEED_BIRTHS } from './lib/birthData';
import { useReverseGeocode } from './lib/atlas/useReverseGeocode';
import { useNearestCityLabel } from './lib/atlas/useNearestCityLabel';
import { countryOf } from './lib/atlas/countryOf';
import {
  birthDataToJD,
  getEclipticPositions,
  getPlanetPositions,
  gmstRadians,
  projectOntoEcliptic,
  relocate,
  toEclipticPositions,
  TRADITIONAL_PLANETS,
  type CoordSystem,
  type HouseSystem,
  type NodeType,
  type PlanetName,
} from './lib/ephemeris';
import {
  generateEcliptic,
  generateLines,
  generateZenithStamps,
  type LineProps,
  type LineType,
  type ZenithProps,
} from './lib/astro/lines';
import { generateParans, type ParanProps } from './lib/astro/parans';
import { generateLocalSpace, type LocalSpaceProps } from './lib/astro/localSpace';
import {
  buildOverlay,
  minorStepMs,
  OVERLAY_LABEL_PREFIX,
  tagLabels,
  type OverlayMode,
  type TimeUnit,
} from './lib/astro/timeline';
import {
  loadOverlayDate,
  loadOverlayMode,
  loadOverlayPartner,
  loadOverlayStep,
  saveOverlayDate,
  saveOverlayMode,
  saveOverlayPartner,
  saveOverlayStep,
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

interface Point {
  lat: number;
  lng: number;
}

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] };

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
  // Basemap detail layers default to shown; the "Details" section toggles them
  // off. (`!== '0'` so a brand-new visitor with no saved value gets them on.)
  const [showRoads, setShowRoads] = useState(
    () => localStorage.getItem('astro:show-roads:v2') !== '0',
  );
  const [showRivers, setShowRivers] = useState(
    () => localStorage.getItem('astro:show-rivers:v2') !== '0',
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

  const [overlayMode, setOverlayMode] = useState<OverlayMode>(() =>
    loadOverlayMode(),
  );
  const [targetDate, setTargetDate] = useState<number>(() => loadOverlayDate());
  const [partnerId, setPartnerId] = useState<string | null>(() =>
    loadOverlayPartner(),
  );
  const [stepUnit, setStepUnit] = useState<TimeUnit>(() => loadOverlayStep());
  const [playing, setPlaying] = useState(false);

  // Mapping tools (top bar). Transient — not persisted across reloads.
  const [mapTool, setMapTool] = useState<MapTool>('off');
  const [measure, setMeasure] = useState<MeasureInfo | null>(null);
  // The current map-pin-state accent resolved to a concrete color, for the WebGL
  // measure layers (which can't read CSS vars). Kept in sync below.
  const [measureColor, setMeasureColor] = useState('#8b909c');

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
    const overlayCycle: OverlayMode[] = [
      'off', 'transits', 'progressed', 'solar-arc', 'synastry',
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
        case 'o':
          setOverlayMode(
            (mode) =>
              overlayCycle[(overlayCycle.indexOf(mode) + 1) % overlayCycle.length],
          );
          break;
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
    localStorage.setItem('astro:show-roads:v2', showRoads ? '1' : '0');
  }, [showRoads]);
  useEffect(() => {
    localStorage.setItem('astro:show-rivers:v2', showRivers ? '1' : '0');
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

  useEffect(() => saveOverlayMode(overlayMode), [overlayMode]);
  useEffect(() => saveOverlayDate(targetDate), [targetDate]);
  useEffect(() => saveOverlayPartner(partnerId), [partnerId]);
  useEffect(() => saveOverlayStep(stepUnit), [stepUnit]);

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
    overlayMode === 'solar-arc';
  useEffect(() => {
    if (!isTimeMode && playing) setPlaying(false);
  }, [isTimeMode, playing]);

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

  // Positions feeding the map LINES: in-zodiaco projects each body onto the
  // ecliptic first; in-mundo uses the true sky positions. The wheel keeps using
  // `positions`/`ecliptic` (longitude is identical either way).
  const linePositions = useMemo(
    () => (coordSystem === 'zodiaco' ? projectOntoEcliptic(positions, jd) : positions),
    [coordSystem, positions, jd],
  );

  const allLines = useMemo(
    () => generateLines(linePositions, gmst),
    [linePositions, gmst],
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
    () => generateZenithStamps(linePositions, gmst),
    [linePositions, gmst],
  );
  // The ecliptic great circle for the chart instant — a fixed reference (passes
  // through the Sun's zenith), independent of planet visibility, so not filtered.
  // (Named *Line to avoid colliding with the `ecliptic` projection-mode variable.)
  const eclipticLine = useMemo(() => generateEcliptic(jd, gmst), [jd, gmst]);

  const lines = useMemo(
    () => filterLines(allLines, visiblePlanets, visibleLineTypes),
    [allLines, visiblePlanets, visibleLineTypes],
  );

  const parans = useMemo(
    () => (showParans ? filterParans(allParans, visiblePlanets) : EMPTY_FC),
    [allParans, visiblePlanets, showParans],
  );

  const localSpace = useMemo(
    () =>
      showLocalSpace ? filterLocalSpace(allLocalSpace, visiblePlanets) : EMPTY_FC,
    [allLocalSpace, visiblePlanets, showLocalSpace],
  );
  const zenith = useMemo(
    () => filterZenith(allZenith, visiblePlanets, visibleLineTypes),
    [allZenith, visiblePlanets, visibleLineTypes],
  );

  // ── Timeline / overlay: a second chart layer (transits, secondary
  // progressions, solar-arc directions, or a synastry partner) derived from the
  // current chart via buildOverlay, then run through the SAME generators and
  // visibility filters as the base.
  const partner = useMemo(
    () => (partnerId ? (charts.find((c) => c.id === partnerId) ?? null) : null),
    [charts, partnerId],
  );
  const overlayLayer = useMemo(() => {
    if (overlayMode === 'off' || !current) return null;
    return buildOverlay(current, overlayMode, targetDate, partner, nodeType);
  }, [overlayMode, current, targetDate, partner, nodeType]);

  const overlay = useMemo<OverlayData | null>(() => {
    if (!overlayLayer) return null;
    const prefix = OVERLAY_LABEL_PREFIX[overlayLayer.kind];
    const ovPositions =
      coordSystem === 'zodiaco'
        ? projectOntoEcliptic(overlayLayer.positions, overlayLayer.jd)
        : overlayLayer.positions;
    return {
      lines: filterLines(
        tagLabels(generateLines(ovPositions, overlayLayer.gmst), prefix),
        visiblePlanets,
        visibleLineTypes,
      ),
      parans: showParans
        ? filterParans(
            tagLabels(generateParans(ovPositions, overlayLayer.gmst), prefix),
            visiblePlanets,
          )
        : EMPTY_FC,
      localSpace: showLocalSpace
        ? filterLocalSpace(
            generateLocalSpace(
              ovPositions,
              overlayLayer.gmst,
              overlayLayer.originLat,
              overlayLayer.originLng,
            ),
            visiblePlanets,
          )
        : EMPTY_FC,
    };
  }, [overlayLayer, visiblePlanets, visibleLineTypes, showParans, showLocalSpace, coordSystem]);

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
  //    country when no city is in range; real-time and snappy, nothing over ocean.
  //  Suppressed while measuring.
  const pinnedLabel = useReverseGeocode(
    mapTool === 'measure' || isNatalPin ? null : pinned,
  );
  const hoverCity = useNearestCityLabel(mapTool === 'measure' ? null : hover);
  const hoverCountry = useMemo(
    () => (hover ? countryOf(hover.lat, hover.lng) : null),
    [hover],
  );
  // Once pinned, hover stays frozen on the clicked point (onHover/onLeave are gated
  // on !pinned), so this hovered-point label doubles as the pin's placeholder while
  // the reverse-geocode loads.
  const hoverLabel =
    mapTool === 'measure' || !hover ? null : (hoverCity ?? hoverCountry);
  const locationLabel =
    mapTool === 'measure'
      ? null
      : pinned
        ? isNatalPin
          ? (current?.birthplace.label ?? null)
          : (pinnedLabel ?? hoverLabel)
        : hoverLabel;
  const fadeLocation = !!pinned && !isNatalPin;

  // Publish the pin state to <html> so the single --map-accent source (index.css)
  // recolors the map chrome, and resolve that accent to a concrete color for the
  // WebGL measure layers. Re-resolves on theme change too (the palette differs).
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-mapstate', coordSource);
    const resolved = getComputedStyle(root).getPropertyValue('--map-accent').trim();
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
  const onClick = useCallback((lat: number, lng: number) => {
    setPinned((prev) =>
      prev && Math.abs(prev.lat - lat) < 0.01 && Math.abs(prev.lng - lng) < 0.01
        ? null
        : { lat, lng },
    );
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
  // Stable so the measure effect (which depends on it) isn't torn down on every
  // re-render during a drag.
  const stopMeasure = useCallback(() => setMapTool('off'), []);

  const handleSaveChart = (chart: StoredChart) => {
    setCharts((prev) => {
      const exists = prev.some((c) => c.id === chart.id);
      return exists
        ? prev.map((c) => (c.id === chart.id ? chart : c))
        : [...prev, chart];
    });
    setCurrentId(chart.id);
    setEditingId(null);
    setCreating(false);
    setPinned(null);
    setHover(null);
  };

  const handleImport = (imported: StoredChart[]) => {
    setImporting(false);
    if (imported.length === 0) return;
    setCharts((prev) => [...prev, ...imported]);
    setCurrentId(imported[0].id);
    setPinned(null);
    setHover(null);
  };

  const handleDelete = (id: string) => {
    setCharts((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (currentId === id) setCurrentId(next[0]?.id ?? null);
      return next;
    });
  };

  const editingChart =
    editingId != null ? (charts.find((c) => c.id === editingId) ?? null) : null;

  return (
    <>
      <Map
        ref={mapRef}
        lines={lines}
        parans={parans}
        localSpace={localSpace}
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
        onClick={onClick}
        onPinNatal={onPinNatal}
      />
      <div className="map-edge-glow" data-state={coordSource} aria-hidden="true" />
      {!wheelExpanded && showCoords && (
        <header className="app-header">
          {current?.tzUncertain && (
            <p className="tz-warning">
              ⚠ Pre-1970 timezone outside US/EU — verify DST against an atlas
            </p>
          )}
          <CoordReadout
            point={activePoint ?? (current ? current.birthplace : null)}
            angles={angles}
            source={coordSource}
          />
        </header>
      )}
      {showSettings && (
        <Sidebar
          visiblePlanets={visiblePlanets}
          togglePlanet={togglePlanet}
          visibleLineTypes={visibleLineTypes}
          toggleLineType={toggleLineType}
          showParans={showParans}
          setShowParans={setShowParans}
          showLocalSpace={showLocalSpace}
          setShowLocalSpace={setShowLocalSpace}
          coordSystem={coordSystem}
          setCoordSystem={setCoordSystem}
          houseSystem={houseSystem}
          setHouseSystem={setHouseSystem}
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
        />
      )}
      <TopNav
        mapState={coordSource}
        pinned={pinned != null}
        onRecenterPin={onRecenterPin}
        onPinNatal={onPinNatal}
        current={current}
        charts={charts}
        onSelectChart={(id) => setCurrentId(id)}
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
      />
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
        />
      )}
      {overlayMode === 'synastry' && (
        <SynastryHud
          partner={partner}
          charts={charts}
          currentId={current?.id ?? null}
          onSelectPartner={setPartnerId}
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
          overlayLabel={overlayLayer?.labelFull ?? null}
          visiblePlanets={visiblePlanets}
          onClose={() => setWheelExpanded(false)}
          onResizingChange={onResizing}
          onSelectChart={(id) => setCurrentId(id)}
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
      {(creating || editingChart) && (
        <BirthDataForm
          initial={editingChart}
          onSubmit={handleSaveChart}
          onCancel={() => {
            setCreating(false);
            setEditingId(null);
          }}
          onImport={() => {
            setCreating(false);
            setImporting(true);
          }}
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
