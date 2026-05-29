import { useEffect, useState } from 'react';
import {
  PLANET_COLORS,
  PLANET_DISPLAY,
  PLANET_NAMES,
  type CoordSystem,
  type HouseSystem,
  type PlanetName,
} from '../../lib/ephemeris';
import type { LineType } from '../../lib/astro/lines';
import type { OverlayMode } from '../../lib/astro/timeline';
import type { StoredChart } from '../../lib/chartLibrary';
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
  theme: Theme;
  setTheme: (t: Theme) => void;
  overlayMode: OverlayMode;
  setOverlayMode: (m: OverlayMode) => void;
  targetDate: number;
  setTargetDate: (ms: number) => void;
  stepDays: number;
  setStepDays: (d: number) => void;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  partnerId: string | null;
  setPartnerId: (id: string | null) => void;
  charts: StoredChart[];
  currentId: string | null;
  overlayLabel: string | null;
}

const LINE_TYPES: { type: LineType; label: string; full: string }[] = [
  { type: 'MC', label: 'MC', full: 'Midheaven (career, public)' },
  { type: 'IC', label: 'IC', full: 'Imum Coeli (home, roots)' },
  { type: 'ASC', label: 'ASC', full: 'Ascendant (self, identity)' },
  { type: 'DSC', label: 'DSC', full: 'Descendant (relationships)' },
];

const OVERLAY_MODES: { mode: OverlayMode; label: string }[] = [
  { mode: 'off', label: 'Off' },
  { mode: 'transits', label: 'Transits' },
  { mode: 'progressed', label: 'Progressed' },
  { mode: 'solar-arc', label: 'Solar Arc' },
  { mode: 'synastry', label: 'Synastry' },
];

const STEP_OPTIONS: { days: number; label: string }[] = [
  { days: 1, label: 'Day' },
  { days: 7, label: 'Week' },
  { days: 30, label: 'Month' },
  { days: 365, label: 'Year' },
];

const YEAR_MS = 365.2425 * 86_400_000;

// datetime-local <-> epoch ms, interpreting the control's value as UTC (to match
// buildOverlay, which treats the target moment as UTC).
function toDatetimeLocalUTC(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
function fromDatetimeLocalUTC(s: string): number {
  const ms = Date.parse(`${s}:00Z`);
  return Number.isNaN(ms) ? Date.now() : ms;
}

const COORD_SYSTEMS: { value: CoordSystem; label: string; hint: string }[] = [
  { value: 'mundo', label: 'In Mundo', hint: 'True sky position (RA / dec)' },
  { value: 'zodiaco', label: 'In Zodiaco', hint: 'Projected onto the ecliptic' },
];

const HOUSE_SYSTEMS: { value: HouseSystem; label: string; hint: string }[] = [
  { value: 'placidus', label: 'Placidus', hint: 'Semi-arc time division (Solar Fire default)' },
  { value: 'whole', label: 'Whole Sign', hint: 'Each house is a whole sign from the rising sign' },
  { value: 'equal', label: 'Equal', hint: '30° houses measured from the Ascendant' },
];

// Sidebar sections behave as an accordion — at most one open at a time — so the
// panel never grows into a tall stack of expanded sections.
type SidebarSection = 'theme' | 'filters' | 'overlay' | 'calc';
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
  theme,
  setTheme,
  overlayMode,
  setOverlayMode,
  targetDate,
  setTargetDate,
  stepDays,
  setStepDays,
  playing,
  setPlaying,
  partnerId,
  setPartnerId,
  charts,
  currentId,
  overlayLabel,
}: SidebarProps) {
  const [openSection, setOpenSection] = useState<SidebarSection | null>(() => {
    const v = localStorage.getItem(SECTION_KEY);
    if (v === 'theme' || v === 'filters' || v === 'overlay' || v === 'calc') {
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

  const isTimeMode =
    overlayMode === 'transits' ||
    overlayMode === 'progressed' ||
    overlayMode === 'solar-arc';

  const current = charts.find((c) => c.id === currentId) ?? null;
  const birthMs = current
    ? Date.UTC(current.year, current.month - 1, current.day)
    : Date.now();
  const sliderMin =
    overlayMode === 'transits' ? Date.now() - 50 * YEAR_MS : birthMs;
  const sliderMax =
    overlayMode === 'transits' ? Date.now() + 50 * YEAR_MS : birthMs + 100 * YEAR_MS;
  const otherCharts = charts
    .filter((c) => c.id !== currentId)
    .sort((a, b) => a.name.localeCompare(b.name));

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
        </div>
      )}

      <button
        type="button"
        className="sidebar-header"
        onClick={() => toggleSection('filters')}
        aria-expanded={openSection === 'filters'}
      >
        <span className="sidebar-title">Map Filters</span>
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

      <button
        type="button"
        className="sidebar-header"
        onClick={() => toggleSection('overlay')}
        aria-expanded={openSection === 'overlay'}
      >
        <span className="sidebar-title">Transits &amp; Overlays</span>
        <span className="sidebar-chevron">{openSection === 'overlay' ? '▾' : '▸'}</span>
      </button>

      {openSection === 'overlay' && (
        <div className="sidebar-section">
          <ul className="theme-list overlay-mode-list">
            {OVERLAY_MODES.map(({ mode, label }) => (
              <li key={mode}>
                <button
                  type="button"
                  className={`theme-option ${overlayMode === mode ? 'active' : ''}`}
                  onClick={() => setOverlayMode(mode)}
                >
                  <span className="radio">
                    {overlayMode === mode ? '●' : '○'}
                  </span>
                  <span className="label">{label}</span>
                </button>
              </li>
            ))}
          </ul>

          {isTimeMode && (
            <div className="timeline">
              <input
                type="datetime-local"
                className="timeline-datetime"
                value={toDatetimeLocalUTC(targetDate)}
                onChange={(e) =>
                  setTargetDate(fromDatetimeLocalUTC(e.target.value))
                }
              />
              <span className="timeline-utc-note">UTC</span>
              <input
                type="range"
                className="timeline-slider"
                min={sliderMin}
                max={sliderMax}
                step={stepDays * 86_400_000}
                value={Math.min(Math.max(targetDate, sliderMin), sliderMax)}
                onChange={(e) => setTargetDate(Number(e.target.value))}
              />
              <div className="timeline-controls">
                <button
                  type="button"
                  className={`tech-toggle ${playing ? 'on' : 'off'}`}
                  onClick={() => setPlaying(!playing)}
                >
                  <span className="check">{playing ? '❚❚' : '▶'}</span>
                  <span className="name">{playing ? 'Pause' : 'Play'}</span>
                </button>
              </div>
              <ul className="line-type-grid timeline-steps">
                {STEP_OPTIONS.map(({ days, label }) => (
                  <li key={days}>
                    <button
                      type="button"
                      className={`line-toggle ${stepDays === days ? 'on' : 'off'}`}
                      onClick={() => setStepDays(days)}
                      title={`Step by one ${label.toLowerCase()}`}
                    >
                      <span className="name">{label}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {overlayLabel && (
                <p className="timeline-readout">{overlayLabel}</p>
              )}
            </div>
          )}

          {overlayMode === 'synastry' && (
            <div className="timeline">
              {otherCharts.length === 0 ? (
                <p className="timeline-empty">
                  Add another chart to overlay it here.
                </p>
              ) : (
                <ul className="theme-list synastry-list">
                  {otherCharts.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className={`theme-option ${partnerId === c.id ? 'active' : ''}`}
                        onClick={() => setPartnerId(c.id)}
                      >
                        <span className="radio">
                          {partnerId === c.id ? '●' : '○'}
                        </span>
                        <span className="label">{c.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
            Sets the house cusps in the expanded wheel. The angles (ASC/MC/DSC/IC)
            are the same in every system.
          </p>
        </div>
      )}
    </aside>
  );
}
