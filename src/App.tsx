import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection, LineString } from 'geojson';
import {
  Map,
  type MapHandle,
  type MeasureInfo,
  type OverlayData,
} from './components/Map/Map';
import { Sidebar } from './components/Sidebar/Sidebar';
import { TimelineHud } from './components/TimelineHud/TimelineHud';
import { TopNav, type MapTool } from './components/TopNav/TopNav';
import { ChartWheel } from './components/ChartWheel/ChartWheel';
import { ExpandedChartSidebar } from './components/ExpandedChartSidebar/ExpandedChartSidebar';
import { CoordReadout } from './components/CoordReadout/CoordReadout';
import { BirthDataForm } from './components/BirthDataForm/BirthDataForm';
import { ImportChartModal } from './components/ImportChartModal/ImportChartModal';
import { TEST_BIRTH } from './lib/birthData';
import {
  birthDataToJD,
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
import { generateLines, type LineProps, type LineType } from './lib/astro/lines';
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

const seedChart: StoredChart = {
  ...TEST_BIRTH,
  id: newChartId(),
  createdAt: Date.now(),
};

export default function App() {
  const [charts, setCharts] = useState<StoredChart[]>(() => {
    const loaded = loadCharts();
    return loaded.length > 0 ? loaded : [seedChart];
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
    return v === 'whole' || v === 'equal' ? v : 'placidus';
  });
  const [nodeType, setNodeType] = useState<NodeType>(() =>
    localStorage.getItem('astro:node-type:v1') === 'mean' ? 'mean' : 'true',
  );
  const [showRoads, setShowRoads] = useState(
    () => localStorage.getItem('astro:show-roads:v1') === '1',
  );
  const [showRivers, setShowRivers] = useState(
    () => localStorage.getItem('astro:show-rivers:v1') === '1',
  );
  const [hover, setHover] = useState<Point | null>(null);
  const [pinned, setPinned] = useState<Point | null>(null);
  const [wheelExpanded, setWheelExpanded] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => loadTheme());

  // View toggles (driven by the top bar's View menu). Both default on. The chart
  // panel shows compact or expanded per the last `wheelExpanded` choice.
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
    localStorage.setItem('astro:coord-system:v1', coordSystem);
  }, [coordSystem]);
  useEffect(() => {
    localStorage.setItem('astro:house-system:v1', houseSystem);
  }, [houseSystem]);
  useEffect(() => {
    localStorage.setItem('astro:node-type:v1', nodeType);
  }, [nodeType]);
  useEffect(() => {
    localStorage.setItem('astro:show-roads:v1', showRoads ? '1' : '0');
  }, [showRoads]);
  useEffect(() => {
    localStorage.setItem('astro:show-rivers:v1', showRivers ? '1' : '0');
  }, [showRivers]);
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
    () => toEclipticPositions(positions, jd, nodeType),
    [positions, jd, nodeType],
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
  const allLocalSpace = useMemo(
    () =>
      current
        ? generateLocalSpace(
            linePositions,
            gmst,
            current.birthplace.lat,
            current.birthplace.lng,
          )
        : EMPTY_FC,
    [linePositions, gmst, current],
  );

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
        ? toEclipticPositions(overlayLayer.positions, overlayLayer.jd, nodeType)
        : null,
    [overlayLayer, nodeType],
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

  const onHover = useCallback(
    (lat: number, lng: number) => {
      if (!pinned) setHover({ lat, lng });
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
        overlay={overlay}
        pin={pinned}
        pinType={isNatalPin ? 'natal' : pinned ? 'custom' : null}
        theme={theme}
        showRoads={showRoads}
        showRivers={showRivers}
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
          showRoads={showRoads}
          setShowRoads={setShowRoads}
          showRivers={showRivers}
          setShowRivers={setShowRivers}
        />
      )}
      <TopNav
        mapState={coordSource}
        pinned={pinned != null}
        onRecenterPin={onRecenterPin}
        onPinNatal={onPinNatal}
        current={current}
        charts={charts}
        currentId={current?.id ?? null}
        onSelectChart={(id) => setCurrentId(id)}
        onNewChart={() => setCreating(true)}
        onEditChart={(id) => setEditingId(id)}
        onDeleteChart={handleDelete}
        chartExpanded={wheelExpanded}
        onToggleExpand={() => setWheelExpanded((v) => !v)}
        tool={mapTool}
        setTool={setMapTool}
        measure={measure}
        overlayMode={overlayMode}
        setOverlayMode={setOverlayMode}
        partnerId={partnerId}
        setPartnerId={setPartnerId}
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
      {showChart &&
        (wheelExpanded ? (
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
            overlayPartner={overlayMode === 'synastry' ? partner : null}
            visiblePlanets={visiblePlanets}
            onClose={() => setWheelExpanded(false)}
            onRecenterPin={onRecenterPin}
            onSelectChart={(id) => setCurrentId(id)}
            onNewChart={() => setCreating(true)}
            onEditChart={(id) => setEditingId(id)}
            onDeleteChart={handleDelete}
          />
        ) : (
          <ChartWheel
            point={activePoint}
            pinned={pinned != null}
            isNatalPin={isNatalPin}
            angles={angles}
            planets={ecliptic}
          />
        ))}
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
