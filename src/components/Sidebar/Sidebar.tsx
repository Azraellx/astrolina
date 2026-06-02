import { useEffect, useState } from 'react';
import {
  PLANET_COLORS,
  PLANET_DISPLAY,
  PLANET_NAMES,
  type CoordSystem,
  type HouseSystem,
  type LineSystem,
  type NodeType,
  type PlanetName,
} from '../../lib/ephemeris';
import type { LineType } from '../../lib/astro/lines';
import type {
  AngleProgression,
  PrimaryRate,
} from '../../lib/astro/timeline';
import { THEMES, THEME_LABELS, type Theme } from '../../lib/theme';
import type { MapProjectionMode } from '../../lib/projection';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import './Sidebar.css';

interface SidebarProps {
  visiblePlanets: Set<PlanetName>;
  togglePlanet: (p: PlanetName) => void;
  visibleLineTypes: Set<LineType>;
  toggleLineType: (t: LineType) => void;
  showParans: boolean;
  setShowParans: (v: boolean) => void;
  showLocalSpace: boolean;
  setShowLocalSpace: (v: boolean) => void;
  lineSystem: LineSystem;
  setLineSystem: (s: LineSystem) => void;
  coordSystem: CoordSystem;
  setCoordSystem: (c: CoordSystem) => void;
  houseSystem: HouseSystem;
  setHouseSystem: (h: HouseSystem) => void;
  nodeType: NodeType;
  setNodeType: (n: NodeType) => void;
  angleProgression: AngleProgression;
  setAngleProgression: (a: AngleProgression) => void;
  primaryRate: PrimaryRate;
  setPrimaryRate: (r: PrimaryRate) => void;
  userPrimaryRate: number;
  setUserPrimaryRate: (deg: number) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  projection: MapProjectionMode;
  setProjection: (p: MapProjectionMode) => void;
  showRoads: boolean;
  setShowRoads: (v: boolean) => void;
  showRivers: boolean;
  setShowRivers: (v: boolean) => void;
  showLabels: boolean;
  setShowLabels: (v: boolean) => void;
}

const LINE_TYPES: { type: LineType; label: string; full: string }[] = [
  { type: 'MC', label: 'MC', full: 'Midheaven (career, public)' },
  { type: 'IC', label: 'IC', full: 'Imum Coeli (home, roots)' },
  { type: 'ASC', label: 'As', full: 'Ascendant (self, identity)' },
  { type: 'DSC', label: 'Ds', full: 'Descendant (relationships)' },
];

const COORD_SYSTEMS: { value: CoordSystem; label: string; hint: string }[] = [
  { value: 'mundo', label: 'In Mundo', hint: 'True sky position (RA / dec)' },
  { value: 'zodiaco', label: 'In Zodiaco', hint: 'Projected onto the ecliptic' },
];

// Internal ids stay 'celestial'/'geodetic'; the astrologer-facing labels are
// "Celestial" / "Mundane" (geodetic is named in the hover hint + description).
const LINE_SYSTEMS: { value: LineSystem; label: string; hint: string }[] = [
  { value: 'celestial', label: 'Celestial', hint: 'Standard astrocartography — angles placed by the sky (sidereal time)' },
  { value: 'geodetic', label: 'Mundane', hint: "Geodetic mapping — the zodiac mapped onto Earth's longitudes (Greenwich = 0° Aries), independent of birth time" },
];

const PROJECTIONS: { value: MapProjectionMode; label: string; hint: string }[] = [
  { value: '2d', label: 'Flat', hint: 'Classic flat Web-Mercator map' },
  { value: '3d', label: 'Globe', hint: 'Rotatable 3D globe — drag to spin & tilt' },
];

const HOUSE_SYSTEMS: { value: HouseSystem; label: string; hint: string }[] = [
  { value: 'placidus', label: 'Placidus', hint: 'Semi-arc time division (the common modern default)' },
  { value: 'koch', label: 'Koch', hint: 'Semi-arc on the birth latitude (GOH)' },
  { value: 'regiomontanus', label: 'Regiomontanus', hint: 'Equal divisions of the celestial equator' },
  { value: 'campanus', label: 'Campanus', hint: 'Equal divisions of the prime vertical' },
  { value: 'porphyry', label: 'Porphyry', hint: 'Each quadrant trisected in ecliptic longitude' },
  { value: 'alcabitus', label: 'Alcabitus', hint: 'Ancient semi-arc on the diurnal / nocturnal arcs' },
  { value: 'whole', label: 'Whole Sign', hint: 'Each house is a whole sign from the rising sign' },
  { value: 'equal', label: 'Equal', hint: '30° houses measured from the Ascendant' },
];

const NODE_TYPES: { value: NodeType; label: string; hint: string }[] = [
  { value: 'true', label: 'True Node', hint: 'Osculating node — the Moon’s instantaneous orbit (desktop-tool default)' },
  { value: 'mean', label: 'Mean Node', hint: 'Smoothed long-term average node position' },
];

// "Progs/Dirns" — how a directed/progressed chart's angles advance (Solar Arc +
// Progressed overlays), and the time-key for the Primary Directions overlay.
const ANGLE_PROGRESSIONS: { value: AngleProgression; label: string; hint: string }[] = [
  { value: 'sa-long', label: 'SA in Longitude', hint: 'Solar arc in ecliptic longitude (the classic solar-arc default).' },
  { value: 'sa-ra', label: 'SA in RA', hint: 'Solar arc measured in right ascension.' },
  { value: 'naibod-long', label: 'Naibod in Long', hint: 'Mean solar rate 0.9856°/yr, applied in longitude.' },
  { value: 'naibod-ra', label: 'Naibod in RA', hint: 'Mean solar rate 0.9856°/yr, applied in right ascension.' },
  { value: 'mean-quotidian', label: 'Mean Quotidian', hint: 'Quotidian progressed angle (one day per year); on Solar Arc it matches SA in Longitude.' },
];

const PRIMARY_RATES: { value: PrimaryRate; label: string; hint: string }[] = [
  { value: 'ptolemy', label: 'Ptolemy (1°/yr)', hint: 'One year per degree.' },
  { value: 'naibod', label: 'Naibod (59′08″/yr)', hint: '0.985647° per year — the Sun’s mean motion.' },
  { value: 'cardan', label: 'Cardan (59′12″/yr)', hint: '0.986667° per year.' },
  { value: 'kepler-ra', label: 'Kepler — natal solar RA', hint: 'Natal Sun’s daily motion in right ascension × years.' },
  { value: 'solar-long', label: 'Natal solar — longitude', hint: 'Natal Sun’s daily motion in ecliptic longitude × years.' },
  { value: 'placidus-ra', label: 'Placidus — true SA in RA', hint: 'True secondary-progressed solar arc in RA (nonlinear).' },
  { value: 'user', label: 'User rate', hint: 'Enter your own degrees-per-year below.' },
];

// Sidebar sections behave as an accordion — at most one open at a time — so the
// panel never grows into a tall stack of expanded sections.
type SidebarSection = 'theme' | 'filters' | 'calc';
const SECTION_KEY = 'astro:sidebar-section:v1';

// Eye (shown) / eye-off (hidden) marker for the "Hide details" toggles.
function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="eye-icon"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {open ? (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      )}
    </svg>
  );
}

export function Sidebar({
  visiblePlanets,
  togglePlanet,
  visibleLineTypes,
  toggleLineType,
  showParans,
  setShowParans,
  showLocalSpace,
  setShowLocalSpace,
  lineSystem,
  setLineSystem,
  coordSystem,
  setCoordSystem,
  houseSystem,
  setHouseSystem,
  nodeType,
  setNodeType,
  angleProgression,
  setAngleProgression,
  primaryRate,
  setPrimaryRate,
  userPrimaryRate,
  setUserPrimaryRate,
  theme,
  setTheme,
  projection,
  setProjection,
  showRoads,
  setShowRoads,
  showRivers,
  setShowRivers,
  showLabels,
  setShowLabels,
}: SidebarProps) {
  const [openSection, setOpenSection] = useState<SidebarSection | null>(() => {
    const v = localStorage.getItem(SECTION_KEY);
    if (v === 'theme' || v === 'filters' || v === 'calc') {
      return v;
    }
    if (v === 'none') return null;
    return 'filters'; // default: Map Filters open
  });

  useEffect(() => {
    localStorage.setItem(SECTION_KEY, openSection ?? 'none');
  }, [openSection]);

  const toggleSection = (s: SidebarSection) =>
    setOpenSection((prev) => (prev === s ? null : s));

  return (
    <aside className="sidebar">
      <button
        type="button"
        className="sidebar-header"
        onClick={() => toggleSection('theme')}
        aria-expanded={openSection === 'theme'}
      >
        <span className="sidebar-title">Theme</span>
        <span className="sidebar-chevron">{openSection === 'theme' ? '▾' : '▸'}</span>
      </button>

      {openSection === 'theme' && (
        <div className="sidebar-section theme-section">
          <ul className="theme-list">
            {THEMES.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  className={`theme-option ${theme === t ? 'active' : ''}`}
                  onClick={() => setTheme(t)}
                >
                  <span className="radio">{theme === t ? '●' : '○'}</span>
                  <span className={`swatch swatch-${t}`} />
                  <span className="label">{THEME_LABELS[t]}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="theme-detail">
            <h2>Details</h2>
            <ul className="technique-list">
              {(
                [
                  ['Roads', showRoads, setShowRoads],
                  ['Rivers', showRivers, setShowRivers],
                  ['Labels', showLabels, setShowLabels],
                ] as const
              ).map(([label, shown, setShown]) => (
                <li key={label}>
                  <button
                    type="button"
                    className={`tech-toggle ${shown ? 'on' : 'off'}`}
                    onClick={() => setShown(!shown)}
                    aria-pressed={shown}
                    title={`${label} ${shown ? 'shown — click to hide' : 'hidden — click to show'}`}
                  >
                    <EyeIcon open={shown} />
                    <span className="name">{label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="theme-detail">
            <h2>Projection</h2>
            <ul className="theme-list">
              {PROJECTIONS.map(({ value, label, hint }) => (
                <li key={value}>
                  <button
                    type="button"
                    className={`theme-option ${projection === value ? 'active' : ''}`}
                    onClick={() => setProjection(value)}
                    title={hint}
                  >
                    <span className="radio">{projection === value ? '●' : '○'}</span>
                    <span className="label">{label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <button
        type="button"
        className="sidebar-header"
        onClick={() => toggleSection('filters')}
        aria-expanded={openSection === 'filters'}
      >
        <span className="sidebar-title">Filters</span>
        <span className="sidebar-chevron">{openSection === 'filters' ? '▾' : '▸'}</span>
      </button>

      {openSection === 'filters' && (
        <div className="sidebar-section">
          <h2>Planets</h2>
          <ul className="planet-grid">
            {PLANET_NAMES.map((p) => {
              const on = visiblePlanets.has(p);
              return (
                <li key={p}>
                  <button
                    type="button"
                    className={`planet-toggle ${on ? 'on' : 'off'}`}
                    onClick={() => togglePlanet(p)}
                    title={PLANET_DISPLAY[p]}
                  >
                    <PlanetGlyph
                      planet={p}
                      size={14}
                      color={PLANET_COLORS[p]}
                      className="planet-toggle-icon"
                    />
                    <span className="name">{PLANET_DISPLAY[p]}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <h2>Lines</h2>
          <ul className="line-type-grid">
            {LINE_TYPES.map(({ type, label, full }) => {
              const on = visibleLineTypes.has(type);
              return (
                <li key={type}>
                  <button
                    type="button"
                    className={`line-toggle ${type.toLowerCase()} ${on ? 'on' : 'off'}`}
                    onClick={() => toggleLineType(type)}
                    title={full}
                  >
                    {type === 'ASC' ? (
                      <span className="line-arrow-swatch">→</span>
                    ) : type === 'DSC' ? (
                      <span className="line-arrow-swatch">←</span>
                    ) : (
                      <span className="line-swatch" />
                    )}
                    <span className="name">{label}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Parans / Local Space sit under Lines without their own heading. */}
          <ul className="technique-list">
            <li>
              <button
                type="button"
                className={`tech-toggle ${showParans ? 'on' : 'off'}`}
                onClick={() => setShowParans(!showParans)}
                aria-pressed={showParans}
                title={`Parans ${showParans ? 'shown — click to hide' : 'hidden — click to show'}`}
              >
                <EyeIcon open={showParans} />
                <span className="name">Parans</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`tech-toggle ${showLocalSpace ? 'on' : 'off'}`}
                onClick={() => setShowLocalSpace(!showLocalSpace)}
                aria-pressed={showLocalSpace}
                title={`Local space ${showLocalSpace ? 'shown — click to hide' : 'hidden — click to show'}`}
              >
                <EyeIcon open={showLocalSpace} />
                <span className="name">Local Space</span>
              </button>
            </li>
          </ul>
        </div>
      )}

      <button
        type="button"
        className="sidebar-header"
        onClick={() => toggleSection('calc')}
        aria-expanded={openSection === 'calc'}
      >
        <span className="sidebar-title">Calculation</span>
        <span className="sidebar-chevron">{openSection === 'calc' ? '▾' : '▸'}</span>
      </button>

      {openSection === 'calc' && (
        <div className="sidebar-section">
          {/* Primary paradigm: Celestial (standard ACG, by the sky) vs Mundane
              (geodetic, by Earth longitude). Title-less. The In-Mundo/In-Zodiaco
              "Line projection" below is a Celestial-only refinement, so it shows
              ONLY in Celestial — which also keeps "In Mundo" from ever appearing
              next to "Mundane". */}
          <ul className="theme-list">
            {LINE_SYSTEMS.map(({ value, label, hint }) => (
              <li key={value}>
                <button
                  type="button"
                  className={`theme-option ${lineSystem === value ? 'active' : ''}`}
                  onClick={() => setLineSystem(value)}
                  title={hint}
                >
                  <span className="radio">{lineSystem === value ? '●' : '○'}</span>
                  <span className="label">{label}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="calc-hint">
            {lineSystem === 'celestial'
              ? 'Standard astrocartography — angles placed by the sky (sidereal time).'
              : 'Mundane / geodetic — the zodiac mapped onto Earth’s longitudes (Greenwich = 0° Aries), independent of birth time.'}
          </p>

          {lineSystem === 'celestial' && (
            <>
              <h2>Line projection</h2>
              <ul className="theme-list">
                {COORD_SYSTEMS.map(({ value, label, hint }) => (
                  <li key={value}>
                    <button
                      type="button"
                      className={`theme-option ${coordSystem === value ? 'active' : ''}`}
                      onClick={() => setCoordSystem(value)}
                      title={hint}
                    >
                      <span className="radio">
                        {coordSystem === value ? '●' : '○'}
                      </span>
                      <span className="label">{label}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="calc-hint">
                {coordSystem === 'mundo'
                  ? 'Lines use each body’s true position in the sky. Most affects Pluto and the Moon.'
                  : 'Bodies are projected onto the ecliptic before drawing lines (a common ACG default).'}
              </p>
            </>
          )}

          <h2>Lunar node</h2>
          <ul className="theme-list">
            {NODE_TYPES.map(({ value, label, hint }) => (
              <li key={value}>
                <button
                  type="button"
                  className={`theme-option ${nodeType === value ? 'active' : ''}`}
                  onClick={() => setNodeType(value)}
                  title={hint}
                >
                  <span className="radio">{nodeType === value ? '●' : '○'}</span>
                  <span className="label">{label}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="calc-hint">
            {nodeType === 'true'
              ? 'True node follows the Moon’s instantaneous orbit; it oscillates ±~1.5° around the mean and can briefly turn direct.'
              : 'Mean node is the smoothed average; it always moves retrograde at a steady rate.'}
          </p>

          <h2>House system</h2>
          <span className="thud-select-wrap calc-select">
            <select
              className="thud-select"
              value={houseSystem}
              onChange={(e) => setHouseSystem(e.target.value as HouseSystem)}
            >
              {HOUSE_SYSTEMS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className="thud-select-caret">▾</span>
          </span>
          <p className="calc-hint">
            {HOUSE_SYSTEMS.find((h) => h.value === houseSystem)?.hint}
          </p>

          <h2>Chart angle progression</h2>
          <span className="thud-select-wrap calc-select">
            <select
              className="thud-select"
              value={angleProgression}
              onChange={(e) =>
                setAngleProgression(e.target.value as AngleProgression)
              }
            >
              {ANGLE_PROGRESSIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className="thud-select-caret">▾</span>
          </span>
          <p className="calc-hint">
            {ANGLE_PROGRESSIONS.find((a) => a.value === angleProgression)?.hint}{' '}
            Drives the Solar Arc and Progressed overlays.
          </p>

          <h2>Primary directions rate</h2>
          <span className="thud-select-wrap calc-select">
            <select
              className="thud-select"
              value={primaryRate}
              onChange={(e) => setPrimaryRate(e.target.value as PrimaryRate)}
            >
              {PRIMARY_RATES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className="thud-select-caret">▾</span>
          </span>
          <p className="calc-hint">
            {PRIMARY_RATES.find((r) => r.value === primaryRate)?.hint}
          </p>
          {primaryRate === 'user' && (
            <span className="thud-select-wrap calc-select">
              <input
                type="number"
                className="thud-select"
                step="0.01"
                min={0}
                value={Number.isFinite(userPrimaryRate) ? userPrimaryRate : ''}
                onChange={(e) => setUserPrimaryRate(e.target.valueAsNumber)}
                aria-label="User direction rate, degrees per year"
              />
            </span>
          )}
        </div>
      )}
    </aside>
  );
}
