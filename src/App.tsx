import { useCallback, useEffect, useMemo, useState } from 'react';
import { Map } from './components/Map/Map';
import { Sidebar } from './components/Sidebar/Sidebar';
import { ChartWheel } from './components/ChartWheel/ChartWheel';
import { ExpandedChartSidebar } from './components/ExpandedChartSidebar/ExpandedChartSidebar';
import { ChartSwitcher } from './components/ChartSwitcher/ChartSwitcher';
import { CoordReadout } from './components/CoordReadout/CoordReadout';
import { BirthDataForm } from './components/BirthDataForm/BirthDataForm';
import { TEST_BIRTH } from './lib/birthData';
import {
  birthDataToJD,
  getPlanetPositions,
  gmstRadians,
  relocate,
  toEclipticPositions,
  TRADITIONAL_PLANETS,
  type PlanetName,
} from './lib/ephemeris';
import { generateLines, type LineType } from './lib/astro/lines';
import { generateParans } from './lib/astro/parans';
import { generateLocalSpace } from './lib/astro/localSpace';
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

  const [visiblePlanets, setVisiblePlanets] = useState<Set<PlanetName>>(
    () => new Set(TRADITIONAL_PLANETS),
  );
  const [visibleLineTypes, setVisibleLineTypes] = useState<Set<LineType>>(
    () => new Set<LineType>(['MC', 'IC', 'ASC', 'DSC']),
  );
  const [showParans, setShowParans] = useState(false);
  const [showLocalSpace, setShowLocalSpace] = useState(false);
  const [hover, setHover] = useState<Point | null>(null);
  const [pinned, setPinned] = useState<Point | null>(null);
  const [wheelExpanded, setWheelExpanded] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => loadTheme());

  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
  }, [theme]);

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
    () => (current ? getPlanetPositions(jd) : []),
    [current, jd],
  );
  const ecliptic = useMemo(
    () => toEclipticPositions(positions, jd),
    [positions, jd],
  );
  const gmst = useMemo(() => gmstRadians(jd), [jd]);

  const allLines = useMemo(
    () => generateLines(positions, gmst),
    [positions, gmst],
  );
  const allParans = useMemo(
    () => generateParans(positions, gmst),
    [positions, gmst],
  );
  const allLocalSpace = useMemo(
    () =>
      current
        ? generateLocalSpace(
            positions,
            gmst,
            current.birthplace.lat,
            current.birthplace.lng,
          )
        : EMPTY_FC,
    [positions, gmst, current],
  );

  const lines = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: allLines.features.filter(
        (f) =>
          visiblePlanets.has(f.properties.planet) &&
          visibleLineTypes.has(f.properties.lineType),
      ),
    }),
    [allLines, visiblePlanets, visibleLineTypes],
  );

  const parans = useMemo(
    () =>
      showParans
        ? {
            type: 'FeatureCollection' as const,
            features: allParans.features.filter(
              (f) =>
                visiblePlanets.has(f.properties.planetA) &&
                visiblePlanets.has(f.properties.planetB),
            ),
          }
        : EMPTY_FC,
    [allParans, visiblePlanets, showParans],
  );


  const localSpace = useMemo(
    () =>
      showLocalSpace
        ? {
            type: 'FeatureCollection' as const,
            features: allLocalSpace.features.filter((f) =>
              visiblePlanets.has(f.properties.planet),
            ),
          }
        : EMPTY_FC,
    [allLocalSpace, visiblePlanets, showLocalSpace],
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
  const birthAngles = useMemo(
    () =>
      current
        ? relocate(jd, current.birthplace.lat, current.birthplace.lng)
        : null,
    [jd, current],
  );
  const angles = useMemo(
    () =>
      activePoint && current
        ? relocate(jd, activePoint.lat, activePoint.lng)
        : birthAngles,
    [jd, activePoint, current, birthAngles],
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
  const onPinNatal = useCallback(() => {
    if (!current) return;
    setPinned({
      lat: current.birthplace.lat,
      lng: current.birthplace.lng,
    });
    setHover(null);
  }, [current]);

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
        lines={lines}
        parans={parans}
        localSpace={localSpace}
        pin={pinned}
        pinType={isNatalPin ? 'natal' : pinned ? 'custom' : null}
        theme={theme}
        onHover={onHover}
        onLeave={onLeave}
        onClick={onClick}
        onPinNatal={onPinNatal}
      />
      {!wheelExpanded && (
        <header className="app-header">
          <ChartSwitcher
            current={current}
            charts={charts}
            onSelect={(id) => setCurrentId(id)}
            onNew={() => setCreating(true)}
            onEdit={(id) => setEditingId(id)}
            onDelete={handleDelete}
          />
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
      <Sidebar
        visiblePlanets={visiblePlanets}
        togglePlanet={togglePlanet}
        visibleLineTypes={visibleLineTypes}
        toggleLineType={toggleLineType}
        showParans={showParans}
        setShowParans={setShowParans}
        showLocalSpace={showLocalSpace}
        setShowLocalSpace={setShowLocalSpace}
        theme={theme}
        setTheme={setTheme}
      />
      {wheelExpanded ? (
        <ExpandedChartSidebar
          chart={current}
          charts={charts}
          point={activePoint}
          pinned={pinned != null}
          isNatalPin={isNatalPin}
          angles={angles}
          planets={ecliptic}
          onClose={() => setWheelExpanded(false)}
          onSelectChart={(id) => setCurrentId(id)}
          onNewChart={() => setCreating(true)}
          onEditChart={(id) => setEditingId(id)}
          onDeleteChart={handleDelete}
        />
      ) : (
        <ChartWheel
          chart={current}
          point={activePoint}
          pinned={pinned != null}
          isNatalPin={isNatalPin}
          angles={angles}
          planets={ecliptic}
          onExpand={() => setWheelExpanded(true)}
        />
      )}
      {(creating || editingChart) && (
        <BirthDataForm
          initial={editingChart}
          onSubmit={handleSaveChart}
          onCancel={() => {
            setCreating(false);
            setEditingId(null);
          }}
        />
      )}
    </>
  );
}
