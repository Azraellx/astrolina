import { useEffect, useState } from 'react';
import {
  PLANET_COLORS,
  PLANET_DISPLAY,
  PLANET_NAMES,
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
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const LINE_TYPES: { type: LineType; label: string; full: string }[] = [
  { type: 'MC', label: 'MC', full: 'Midheaven (career, public)' },
  { type: 'IC', label: 'IC', full: 'Imum Coeli (home, roots)' },
  { type: 'ASC', label: 'ASC', full: 'Ascendant (self, identity)' },
  { type: 'DSC', label: 'DSC', full: 'Descendant (relationships)' },
];

const FILTERS_OPEN_KEY = 'astro:sidebar-open:v1';
const THEME_OPEN_KEY = 'astro:theme-open:v1';

export function Sidebar({
  visiblePlanets,
  togglePlanet,
  visibleLineTypes,
  toggleLineType,
  showParans,
  setShowParans,
  showLocalSpace,
  setShowLocalSpace,
  theme,
  setTheme,
}: SidebarProps) {
  const [themeOpen, setThemeOpen] = useState<boolean>(() => {
    return localStorage.getItem(THEME_OPEN_KEY) === '1';
  });
  const [filtersOpen, setFiltersOpen] = useState<boolean>(() => {
    const v = localStorage.getItem(FILTERS_OPEN_KEY);
    return v == null ? true : v === '1';
  });

  useEffect(() => {
    localStorage.setItem(THEME_OPEN_KEY, themeOpen ? '1' : '0');
  }, [themeOpen]);
  useEffect(() => {
    localStorage.setItem(FILTERS_OPEN_KEY, filtersOpen ? '1' : '0');
  }, [filtersOpen]);

  return (
    <aside className="sidebar">
      <button
        type="button"
        className="sidebar-header"
        onClick={() => setThemeOpen((v) => !v)}
        aria-expanded={themeOpen}
      >
        <span className="sidebar-title">Theme</span>
        <span className="sidebar-chevron">{themeOpen ? '▾' : '▸'}</span>
      </button>

      {themeOpen && (
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
        </div>
      )}

      <button
        type="button"
        className="sidebar-header"
        onClick={() => setFiltersOpen((v) => !v)}
        aria-expanded={filtersOpen}
      >
        <span className="sidebar-title">Map Filters</span>
        <span className="sidebar-chevron">{filtersOpen ? '▾' : '▸'}</span>
      </button>

      {filtersOpen && (
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
                    <span className="line-swatch" />
                    <span className="name">{label}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <h2>Techniques</h2>
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
    </aside>
  );
}
