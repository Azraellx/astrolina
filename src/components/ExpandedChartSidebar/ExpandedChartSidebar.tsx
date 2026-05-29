import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  PLANET_COLORS,
  PLANET_DISPLAY,
  type EclipticPosition,
  type PlanetName,
  type RelocatedAngles,
} from '../../lib/ephemeris';
import type { StoredChart } from '../../lib/chartLibrary';
import { ChartSwitcher } from '../ChartSwitcher/ChartSwitcher';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import {
  WheelSvg,
  fmtLon,
  computeAspects,
  computeCrossAspects,
  SIGNS,
  type AspectCategory,
} from '../Wheel/WheelSvg';
import './ExpandedChartSidebar.css';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function fmtChartDate(c: StoredChart): string {
  return `${c.day} ${MONTHS[c.month - 1]} ${c.year} · ${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
}

interface ExpandedChartSidebarProps {
  chart: StoredChart | null;
  charts: StoredChart[];
  point: { lat: number; lng: number } | null;
  pinned: boolean;
  isNatalPin: boolean;
  angles: RelocatedAngles | null;
  planets: EclipticPosition[];
  overlayPlanets?: EclipticPosition[] | null;
  overlayLabel?: string | null;
  /** Planets toggled on in the Map Filter; hidden ones are dropped everywhere. */
  visiblePlanets: Set<PlanetName>;
  onClose: () => void;
  onRecenterPin: () => void;
  onSelectChart: (id: string) => void;
  onNewChart: () => void;
  onEditChart: (id: string) => void;
  onDeleteChart: (id: string) => void;
}

const WIDTH_KEY = 'astro:expanded-sidebar-width:v1';
const ASPECTS_KEY = 'astro:visible-aspects:v1';
const ADVANCED_KEY = 'astro:advanced:v1';
// Shared with CoordReadout in the non-expanded view, so the Angles dropdown
// remembers its open/closed state across both layouts.
const SHOW_ANGLES_KEY = 'astro:coord-show-angles:v1';
const DEFAULT_WIDTH = 720;
const MIN_WIDTH = 480;

// Wheel sizing. The diameter fits the panel width, with MIN_WHEEL keeping it
// legible (never squished) even on narrow panels and MAX_WHEEL stopping it
// from ballooning on very wide ones.
const MIN_WHEEL = 280;
const MAX_WHEEL = 900;

const ASPECT_GLYPHS: Record<string, string> = {
  conjunction: '☌',
  opposition: '☍',
  trine: '△',
  square: '□',
  sextile: '⚹',
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Long-form longitude with arc-seconds: "23°45'12" Sag"
function fmtLonExact(lonRad: number): string {
  const lonDeg = ((lonRad * 180) / Math.PI + 360) % 360;
  const sign = SIGNS[Math.floor(lonDeg / 30)];
  const inSign = lonDeg % 30;
  const d = Math.floor(inSign);
  const mFull = (inSign - d) * 60;
  const m = Math.floor(mFull);
  let s = Math.round((mFull - m) * 60);
  let dd = d;
  let mm = m;
  if (s === 60) { s = 0; mm += 1; }
  if (mm === 60) { mm = 0; dd += 1; }
  return `${dd}°${pad2(mm)}'${pad2(s)}" ${sign}`;
}

// Signed declination, deg/min: "+12°34'" or "-05°02'"
function fmtDec(decRad: number): string {
  const decDeg = (decRad * 180) / Math.PI;
  const sign = decDeg >= 0 ? '+' : '-';
  const abs = Math.abs(decDeg);
  const d = Math.floor(abs);
  let m = Math.round((abs - d) * 60);
  let dd = d;
  if (m === 60) { m = 0; dd += 1; }
  return `${sign}${pad2(dd)}°${pad2(m)}'`;
}

// Speed in degrees/day, signed for retrograde, 2 decimals.
function fmtSpeed(degPerDay: number): string {
  return `${degPerDay >= 0 ? '+' : ''}${degPerDay.toFixed(2)}°/d`;
}

// Aspect orb as "0°12'" — seconds rarely meaningful for orbs.
function fmtOrb(orbDeg: number): string {
  const d = Math.floor(orbDeg);
  let m = Math.round((orbDeg - d) * 60);
  let dd = d;
  if (m === 60) { m = 0; dd += 1; }
  return `${dd}°${pad2(m)}'`;
}

const ASPECT_TOGGLES: {
  key: AspectCategory;
  label: string;
  cssClass: string;
}[] = [
  { key: 'harmonious', label: 'Trine / Sextile', cssClass: 'trine' },
  { key: 'hard', label: 'Square / Opp', cssClass: 'square' },
  { key: 'conjunction', label: 'Conj', cssClass: 'conj' },
];

export function ExpandedChartSidebar({
  chart,
  charts,
  point,
  pinned,
  isNatalPin,
  angles,
  planets,
  overlayPlanets,
  overlayLabel,
  visiblePlanets,
  onClose,
  onRecenterPin,
  onSelectChart,
  onNewChart,
  onEditChart,
  onDeleteChart,
}: ExpandedChartSidebarProps) {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    return saved && saved >= MIN_WIDTH ? saved : DEFAULT_WIDTH;
  });

  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(width));
  }, [width]);

  const [visibleAspects, setVisibleAspects] = useState<Set<AspectCategory>>(
    () => {
      try {
        const raw = localStorage.getItem(ASPECTS_KEY);
        if (raw) return new Set(JSON.parse(raw) as AspectCategory[]);
      } catch {
        /* fall through */
      }
      return new Set<AspectCategory>(['harmonious', 'hard', 'conjunction']);
    },
  );

  useEffect(() => {
    localStorage.setItem(
      ASPECTS_KEY,
      JSON.stringify(Array.from(visibleAspects)),
    );
  }, [visibleAspects]);

  const [advanced, setAdvanced] = useState<boolean>(
    () => localStorage.getItem(ADVANCED_KEY) === '1',
  );
  useEffect(() => {
    localStorage.setItem(ADVANCED_KEY, advanced ? '1' : '0');
  }, [advanced]);

  // Angles dropdown shares its boolean with the non-expanded CoordReadout.
  const [anglesOpen, setAnglesOpen] = useState<boolean>(
    () => localStorage.getItem(SHOW_ANGLES_KEY) === '1',
  );
  useEffect(() => {
    localStorage.setItem(SHOW_ANGLES_KEY, anglesOpen ? '1' : '0');
  }, [anglesOpen]);

  // Longitude formatter shared by the header angles and the planet rows.
  const fmt = advanced ? fmtLonExact : fmtLon;

  // Respect the Map Filter's planet toggles across every area of the expanded
  // view (planet list, wheel, aspects, overlay aspects). Order is preserved
  // from the incoming arrays (PLANET_NAMES order).
  const shownPlanets = planets.filter((p) => visiblePlanets.has(p.name));
  const shownOverlay =
    overlayPlanets?.filter((p) => visiblePlanets.has(p.name)) ?? null;

  const toggleAspect = (cat: AspectCategory) => {
    setVisibleAspects((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const draggingRef = useRef(false);
  // Cursor-to-edge offset captured at mousedown, so grabbing the handle (which
  // sits a few px inside the right edge) doesn't make the width jump.
  const dragOffsetRef = useRef(0);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const maxWidth = Math.min(window.innerWidth - 120, 1200);
      const newWidth = Math.max(
        MIN_WIDTH,
        Math.min(maxWidth, e.clientX + dragOffsetRef.current),
      );
      setWidth(newWidth);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The wheel diameter fits the panel width (the sidebar scrolls vertically,
  // so width is the constraint), floored at MIN_WHEEL so it never gets squished.
  const wheelPaneRef = useRef<HTMLDivElement>(null);
  const [paneWidth, setPaneWidth] = useState(400);

  useEffect(() => {
    if (!wheelPaneRef.current) return;
    const observe = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setPaneWidth(entry.contentRect.width);
    });
    observe.observe(wheelPaneRef.current);
    return () => observe.disconnect();
  }, []);

  const wheelSize = Math.floor(
    Math.max(MIN_WHEEL, Math.min(MAX_WHEEL, paneWidth)),
  );

  const beginDrag = (e: ReactMouseEvent) => {
    draggingRef.current = true;
    dragOffsetRef.current = width - e.clientX;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <aside className="expanded-sidebar" style={{ width: `${width}px` }}>
      <div className="es-scroll">
      <section className="es-section es-section-header">
        <div className="es-header-row">
          <div className="es-switcher">
            <ChartSwitcher
              current={chart}
              charts={charts}
              onSelect={onSelectChart}
              onNew={onNewChart}
              onEdit={onEditChart}
              onDelete={onDeleteChart}
            />
          </div>
          <div className="es-header-actions">
            {angles && (
              <button
                type="button"
                className={`es-advanced-toggle ${advanced ? 'on' : 'off'}`}
                onClick={() => setAdvanced((v) => !v)}
                title="Toggle detailed natal data (dec, speed, ℞, exact orbs, aspect grid)"
                role="switch"
                aria-checked={advanced}
              >
                <span className="es-toggle-label">Advanced</span>
                <span className="es-toggle-track">
                  <span className="es-toggle-thumb" />
                </span>
              </button>
            )}
            <button
              type="button"
              className="es-close-btn"
              onClick={onClose}
              title="Collapse (Esc)"
              aria-label="Close expanded view"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Collapse</span>
            </button>
          </div>
        </div>
        {chart && (
          <p className="es-meta">
            {fmtChartDate(chart)} · {chart.birthplace.label}
          </p>
        )}
        {(() => {
          const displayPoint =
            point ??
            (chart
              ? { lat: chart.birthplace.lat, lng: chart.birthplace.lng }
              : null);
          if (!displayPoint) return null;
          const stateClass = isNatalPin
            ? 'natal-pinned'
            : pinned
              ? 'pinned'
              : point
                ? ''
                : 'natal';
          const label = isNatalPin
            ? '📌 Pinned at natal'
            : pinned
              ? '📌 Pinned at'
              : point
                ? 'Relocated to'
                : 'Located at natal';
          return (
            <div className={`es-relocated ${stateClass}`}>
              <span className="es-relocated-text">
                {label} {displayPoint.lat.toFixed(3)}°,{' '}
                {displayPoint.lng.toFixed(3)}°
              </span>
              {pinned && (
                <button
                  type="button"
                  className="es-recenter-btn"
                  onClick={onRecenterPin}
                  title="Center map on pin"
                  aria-label="Center map on pin"
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M8 1.5c-2.5 0-4.5 2-4.5 4.5 0 3.2 4.5 8.5 4.5 8.5s4.5-5.3 4.5-8.5c0-2.5-2-4.5-4.5-4.5z"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                    <circle cx="8" cy="6" r="1.6" fill="currentColor" />
                  </svg>
                  <span>Center</span>
                </button>
              )}
            </div>
          );
        })()}

        {angles && (
          <div className="es-angles">
            <button
              type="button"
              className="es-angles-toggle"
              onClick={() => setAnglesOpen((v) => !v)}
              aria-expanded={anglesOpen}
            >
              <span>Angles</span>
              <span className="es-angles-chevron">{anglesOpen ? '▴' : '▾'}</span>
            </button>
            {anglesOpen && (
              <ul className="es-angle-list">
                <li>
                  <span className="es-name">ASC</span>
                  <span className="es-lon">{fmt(angles.asc)}</span>
                </li>
                <li>
                  <span className="es-name">MC</span>
                  <span className="es-lon">{fmt(angles.mc)}</span>
                </li>
                <li>
                  <span className="es-name">DSC</span>
                  <span className="es-lon">{fmt(angles.dsc)}</span>
                </li>
                <li>
                  <span className="es-name">IC</span>
                  <span className="es-lon">{fmt(angles.ic)}</span>
                </li>
              </ul>
            )}
          </div>
        )}
      </section>

      {angles && shownPlanets.length > 0 && (() => {
        // Fill the two columns row-by-row: item 0 top-left, item 1 top-right,
        // item 2 left (row 2), item 3 right (row 2)… So even indices go left,
        // odd go right. Stays balanced and compact as planets are toggled off.
        const leftCol = shownPlanets.filter((_, i) => i % 2 === 0);
        const rightCol = shownPlanets.filter((_, i) => i % 2 === 1);
        const renderRow = (p: EclipticPosition) => (
          <li key={p.name} className={advanced ? 'advanced' : ''}>
            <div className="es-row-main">
              <span
                className="es-glyph"
                style={{ color: PLANET_COLORS[p.name] }}
              >
                <PlanetGlyph planet={p.name} size={13} />
              </span>
              <span className="es-name">{PLANET_DISPLAY[p.name]}</span>
              <span className="es-lon">
                {fmt(p.lon)}
                {advanced && p.retrograde ? (
                  <span className="es-rx" title="Retrograde">℞</span>
                ) : null}
              </span>
            </div>
            {advanced && p.dec !== undefined && p.speed !== undefined && (
              <div className="es-row-extra">
                dec {fmtDec(p.dec)} · {fmtSpeed(p.speed)}
              </div>
            )}
          </li>
        );
        return (
        <section className="es-section es-section-details">
          <div className="es-planets-col">
            <h3>Planets</h3>
            <div className="es-planet-cols">
              <ul className="es-planet-list">{leftCol.map(renderRow)}</ul>
              {rightCol.length > 0 && (
                <ul className="es-planet-list">{rightCol.map(renderRow)}</ul>
              )}
            </div>
          </div>
        </section>
        );
      })()}

      <section className="es-section es-section-wheel">
        {angles && overlayLabel && (
          <div className="es-overlay-bar">
            <span className="es-overlay-caption">
              <span className="es-overlay-dot" /> {overlayLabel}
            </span>
          </div>
        )}
        <div className="es-wheel-pane" ref={wheelPaneRef}>
          {angles ? (
            <WheelSvg
              size={wheelSize}
              angles={angles}
              planets={shownPlanets}
              detailed={true}
              advanced={advanced}
              overlayPlanets={shownOverlay}
              overlayDetailed={advanced}
              visibleAspects={visibleAspects}
            />
          ) : (
            <div className="es-empty">No chart selected</div>
          )}
        </div>
        {angles && (
          <div className="es-aspect-toggles">
            {ASPECT_TOGGLES.map((t) => {
              const on = visibleAspects.has(t.key);
              return (
                <button
                  key={t.key}
                  type="button"
                  className={`es-asp-toggle ${t.cssClass} ${on ? 'on' : 'off'}`}
                  onClick={() => toggleAspect(t.key)}
                  title={`Toggle ${t.label}`}
                >
                  <span className="es-asp-swatch" />
                  <span className="es-asp-label">{t.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {angles && advanced && (() => {
        const aspects = computeAspects(shownPlanets)
          .filter((a) => visibleAspects.has(a.category))
          .sort((a, b) => a.orb - b.orb);
        if (aspects.length === 0) return null;
        return (
          <section className="es-section es-section-aspects">
            <h3>Aspects ({aspects.length})</h3>
            <ul className="es-aspect-list">
              {aspects.map((a, i) => (
                <li key={i} className={`asp asp-${a.category}`}>
                  <span
                    className="asp-planet"
                    style={{ color: PLANET_COLORS[a.a as PlanetName] }}
                  >
                    <PlanetGlyph planet={a.a as PlanetName} size={12} />
                  </span>
                  <span className="asp-glyph" style={{ color: a.color }}>
                    {ASPECT_GLYPHS[a.type] ?? a.type}
                  </span>
                  <span
                    className="asp-planet"
                    style={{ color: PLANET_COLORS[a.b as PlanetName] }}
                  >
                    <PlanetGlyph planet={a.b as PlanetName} size={12} />
                  </span>
                  <span className="asp-type">{a.type}</span>
                  <span className="asp-orb">{fmtOrb(a.orb)}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })()}

      {angles && advanced && shownOverlay && shownOverlay.length > 0 && (() => {
        const cross = computeCrossAspects(shownPlanets, shownOverlay)
          .filter((a) => visibleAspects.has(a.category))
          .sort((a, b) => a.orb - b.orb);
        if (cross.length === 0) return null;
        return (
          <section className="es-section es-section-aspects es-section-cross">
            <h3>
              Overlay aspects ({cross.length})
              <span className="es-cross-hint">natal ↔ overlay</span>
            </h3>
            <ul className="es-aspect-list">
              {cross.map((a, i) => (
                <li key={i} className={`asp asp-${a.category}`}>
                  <span
                    className="asp-planet"
                    style={{ color: PLANET_COLORS[a.a as PlanetName] }}
                  >
                    <PlanetGlyph planet={a.a as PlanetName} size={12} />
                  </span>
                  <span className="asp-glyph" style={{ color: a.color }}>
                    {ASPECT_GLYPHS[a.type] ?? a.type}
                  </span>
                  <span
                    className="asp-planet asp-planet-overlay"
                    style={{ color: PLANET_COLORS[a.b as PlanetName] }}
                    title="Overlay body"
                  >
                    <PlanetGlyph planet={a.b as PlanetName} size={12} />
                  </span>
                  <span className="asp-type">{a.type}</span>
                  <span className="asp-orb">{fmtOrb(a.orb)}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })()}
      </div>

      <div
        className="es-drag-handle"
        onMouseDown={beginDrag}
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
      >
        <div className="es-drag-grip" />
      </div>
    </aside>
  );
}
