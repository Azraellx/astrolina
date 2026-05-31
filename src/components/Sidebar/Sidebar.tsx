import { useEffect, useState } from 'react';
import {
  PLANET_COLORS,
  PLANET_DISPLAY,
  PLANET_NAMES,
  type CoordSystem,
  type HouseSystem,
  type NodeType,
  type PlanetName,
} from '../../lib/ephemeris';
import type { LineType } from '../../lib/astro/lines';
import { THEMES, THEME_LABELS, type Theme } from '../../lib/theme';
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
  coordSystem: CoordSystem;
  setCoordSystem: (c: CoordSystem) => void;
  houseSystem: HouseSystem;
  setHouseSystem: (h: HouseSystem) => void;
  nodeType: NodeType;
  setNodeType: (n: NodeType) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  showRoads: boolean;
  setShowRoads: (v: boolean) => void;
  showRivers: boolean;
  setShowRivers: (v: boolean) => void;
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

const HOUSE_SYSTEMS: { value: HouseSystem; label: string; hint: string }[] = [
  { value: 'placidus', label: 'Placidus', hint: 'Semi-arc time division (Solar Fire default)' },
  { value: 'whole', label: 'Whole Sign', hint: 'Each house is a whole sign from the rising sign' },
  { value: 'equal', label: 'Equal', hint: '30° houses measured from the Ascendant' },
];

const NODE_TYPES: { value: NodeType; label: string; hint: string }[] = [
  { value: 'true', label: 'True Node', hint: 'Osculating node — the Moon’s instantaneous orbit (desktop-tool default)' },
  { value: 'mean', label: 'Mean Node', hint: 'Smoothed long-term average node position' },
];

// Sidebar sections behave as an accordion — at most one open at a time — so the
// panel never grows into a tall stack of expanded sections.
type SidebarSection = 'theme' | 'filters' | 'calc';
const SECTION_KEY = 'astro:sidebar-section:v1';

export function Sidebar({
  visiblePlanets,
  togglePlanet,
  visibleLineTypes,
  toggleLineType,
  showParans,
  setShowParans,
  showLocalSpace,
  setShowLocalSpace,
  coordSystem,
  setCoordSystem,
  houseSystem,
  setHouseSystem,
  nodeType,
  setNodeType,
  theme,
  setTheme,
  showRoads,
  setShowRoads,
  showRivers,
  setShowRivers,
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
            <h2>Map detail</h2>
            <ul className="technique-list">
              <li>
                <button
                  type="button"
                  className={`tech-toggle ${showRoads ? 'on' : 'off'}`}
                  onClick={() => setShowRoads(!showRoads)}
                >
                  <span className="check">{showRoads ? '✓' : ''}</span>
                  <span className="name">Roads</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={`tech-toggle ${showRivers ? 'on' : 'off'}`}
                  onClick={() => setShowRivers(!showRivers)}
                >
                  <span className="check">{showRivers ? '✓' : ''}</span>
                  <span className="name">Rivers</span>
                </button>
              </li>
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
              >
                <span className="check">{showParans ? '✓' : ''}</span>
                <span className="name">Parans</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`tech-toggle ${showLocalSpace ? 'on' : 'off'}`}
                onClick={() => setShowLocalSpace(!showLocalSpace)}
              >
                <span className="check">{showLocalSpace ? '✓' : ''}</span>
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
              : 'Bodies are projected onto the ecliptic before drawing lines (Solar Maps’ default).'}
          </p>

          <h2>House system</h2>
          <ul className="theme-list">
            {HOUSE_SYSTEMS.map(({ value, label, hint }) => (
              <li key={value}>
                <button
                  type="button"
                  className={`theme-option ${houseSystem === value ? 'active' : ''}`}
                  onClick={() => setHouseSystem(value)}
                  title={hint}
                >
                  <span className="radio">
                    {houseSystem === value ? '●' : '○'}
                  </span>
                  <span className="label">{label}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="calc-hint">
            Sets the house cusps in the expanded wheel. The angles are the same in every system.
          </p>

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
        </div>
      )}
    </aside>
  );
}
