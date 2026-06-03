import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  PLANET_COLORS,
  PLANET_DISPLAY,
  type EclipticPosition,
  type PlanetName,
  type RelocatedAngles,
} from '../../lib/ephemeris';
import type { StoredChart } from '../../lib/chartLibrary';
import { fmtLat, fmtLng } from '../../lib/coordFormat';
import { ChartSwitcher } from '../ChartSwitcher/ChartSwitcher';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import { ZodiacGlyph } from '../ZodiacGlyph/ZodiacGlyph';
import {
  WheelSvg,
  computeAspects,
  computeCrossAspects,
  type AspectCategory,
} from '../Wheel/WheelSvg';
import { HoverTip, TipButton } from '../ui/HoverTip';
import { useHoverTip } from '../ui/useHoverTip';
import './ExpandedChartSidebar.css';

const SIGN_NAMES = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

// Longitude readout for the planet/angle rows: "23°17'" (with arc-seconds in
// Advanced) followed by the sign glyph and full sign name — e.g. 23°17' ♑ Capricorn.
function Longitude({ lon, advanced }: { lon: number; advanced: boolean }) {
  const lonDeg = ((lon * 180) / Math.PI + 360) % 360;
  const signIdx = Math.floor(lonDeg / 30);
  const inSign = lonDeg % 30;
  const d = Math.floor(inSign);
  const mFull = (inSign - d) * 60;
  const m = Math.floor(mFull);
  let dd = d;
  let mm = m;
  let ss = Math.round((mFull - m) * 60);
  if (ss === 60) { ss = 0; mm += 1; }
  if (mm === 60) { mm = 0; dd += 1; }
  const dms = advanced
    ? `${dd}°${pad2(mm)}'${pad2(ss)}"`
    : `${d}°${pad2(m)}'`;
  return (
    <>
      {dms}{' '}
      <span className="es-lon-sign">
        <ZodiacGlyph sign={signIdx} size={12} /> {SIGN_NAMES[signIdx]}
      </span>
    </>
  );
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
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
  /** Fired while the panel is being drag-resized, so the map can pause hover. */
  onResizingChange?: (resizing: boolean) => void;
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
// The drag handle won't take the panel past ~70% of the viewport (leaving the map
// usable), and never beyond 1200px — the chart wheel has stopped growing by then,
// so extra width just wastes space.
function maxSidebarWidth(): number {
  return Math.min(window.innerWidth * 0.7, 1200);
}

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

// Daily motion, signed for retrograde, in degrees + arcminutes (matching the
// declination format above) so it never reads as a decimal/percentage. The Sun
// moves ~0°59'/day, the Moon ~13°11'/day.
function fmtSpeed(degPerDay: number): string {
  const sign = degPerDay < 0 ? '-' : '+';
  const abs = Math.abs(degPerDay);
  const d = Math.floor(abs);
  let m = Math.round((abs - d) * 60);
  let dd = d;
  if (m === 60) {
    m = 0;
    dd += 1;
  }
  return `${sign}${dd}°${pad2(m)}'/d`;
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
  desc: string;
}[] = [
  { key: 'harmonious', label: 'Trine / Sextile', cssClass: 'trine', desc: 'Flowing, supportive aspects: ease, talent, and opportunity.' },
  { key: 'hard', label: 'Square / Opp', cssClass: 'square', desc: 'Tense aspects: friction, challenge, and the drive to grow.' },
  { key: 'conjunction', label: 'Conj', cssClass: 'conj', desc: 'Two bodies fused at the same point, blending their energies.' },
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
  onResizingChange,
  onSelectChart,
  onNewChart,
  onEditChart,
  onDeleteChart,
}: ExpandedChartSidebarProps) {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    const base = saved && saved >= MIN_WIDTH ? saved : DEFAULT_WIDTH;
    // Rein in a width saved under the old (wider) cap, and fit a narrower viewport.
    return Math.max(MIN_WIDTH, Math.min(base, maxSidebarWidth()));
  });

  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(width));
  }, [width]);

  // Publish the live panel width so the map edge-glow insets its left edge to
  // the visible map area (right of this sidebar). Reset to 0 when collapsed.
  useEffect(() => {
    document.documentElement.style.setProperty('--es-width', `${width}px`);
    return () => {
      document.documentElement.style.setProperty('--es-width', '0px');
    };
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

  // Respect the Map Filter's planet toggles across every area of the expanded
  // view (planet list, wheel, aspects, overlay aspects). Order is preserved
  // from the incoming arrays (PLANET_NAMES order).
  const shownPlanets = planets.filter((p) => visiblePlanets.has(p.name));
  const shownOverlay =
    overlayPlanets?.filter((p) => visiblePlanets.has(p.name)) ?? null;

  // Bold state title for the wheel's top-left corner (always shown when a chart is
  // up). Coloured by the live map state via --map-accent — neutral natal, blue
  // hover, gold pinned, green natal-pin — so it tracks the same palette as the pin.
  const wheelTitle = isNatalPin
    ? 'NATAL CHART'
    : pinned
      ? 'PINNED CHART'
      : point
        ? 'HOVER CHART'
        : 'NATAL CHART';
  // Just the overlay's name for the wheel's top-right corner (the full label
  // "Name · details" lives in the timeline bar); the rest after the separator drops.
  const overlayName = overlayLabel ? overlayLabel.split('·')[0].trim() : null;

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
  // Mirrors draggingRef as state so we can toggle a class while resizing. The
  // wheel's pixel width trails the pane (it's driven by a ResizeObserver), so
  // mid-drag the SVG is briefly wider than the shrinking pane — which would
  // flash the pane's horizontal scrollbar. We suppress that overflow while
  // dragging (see .expanded-sidebar.dragging .es-wheel-pane).
  const [dragging, setDragging] = useState(false);
  // Latest callback, read inside the once-bound mouseup handler below. Refreshed
  // after each commit (not during render) so the handler sees the current prop.
  const onResizingChangeRef = useRef(onResizingChange);
  useEffect(() => {
    onResizingChangeRef.current = onResizingChange;
  });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const maxWidth = maxSidebarWidth();
      const newWidth = Math.max(
        MIN_WIDTH,
        Math.min(maxWidth, e.clientX + dragOffsetRef.current),
      );
      setWidth(newWidth);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      onResizingChangeRef.current?.(false);
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
    setDragging(true);
    onResizingChange?.(true);
    dragOffsetRef.current = width - e.clientX;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  const {
    ref: resizeTipRef,
    pos: resizeTipPos,
    show: showResizeTip,
    hide: hideResizeTip,
  } = useHoverTip<HTMLDivElement>('right');

  return (
    <aside
      className={`expanded-sidebar ${dragging ? 'dragging' : ''}`}
      style={{ width: `${width}px` }}
    >
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
              <TipButton
                type="button"
                className={`es-advanced-toggle ${advanced ? 'on' : 'off'}`}
                onClick={() => setAdvanced((v) => !v)}
                role="switch"
                aria-checked={advanced}
                placement="bottom"
                tip="Advanced"
                hint="Detailed natal data: declination, speed, retrograde, exact orbs, and the aspect grid."
              >
                <span className="es-toggle-label">Advanced</span>
                <span className="es-toggle-track">
                  <span className="es-toggle-thumb" />
                </span>
              </TipButton>
            )}
            <TipButton
              type="button"
              className="es-close-btn"
              onClick={onClose}
              aria-label="Hide expanded view"
              placement="bottom"
              tip="Hide sidebar"
              hotkey="B"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
                <path d="M16 15l-3-3 3-3" />
              </svg>
              <span>Hide</span>
            </TipButton>
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
          const hasPin = isNatalPin || pinned;
          const label = isNatalPin
            ? 'Pinned at natal'
            : pinned
              ? 'Pinned at'
              : point
                ? 'Relocated to'
                : 'Located at natal';
          return (
            <div className={`es-relocated ${stateClass}`}>
              <span className="es-relocated-text">
                {hasPin && (
                  <svg
                    className="es-pin-icon"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                )}
                {label} {fmtLat(displayPoint.lat)} {fmtLng(displayPoint.lng)}
              </span>
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
              <span className="es-angles-chevron">{anglesOpen ? '▾' : '▸'}</span>
            </button>
            {anglesOpen && (
              <ul className="es-angle-list">
                {/* Each angle gets the planet-row treatment: a colored code marker
                    (matching the wheel/map angle colours — As/Ds gold, Mc/Ic blue),
                    its full name, then the degree·sign longitude. */}
                {/* Two per row to save space: MC/IC on top, As/Ds below. */}
                {(
                  [
                    { code: 'MC', name: 'Midheaven', lon: angles.mc, color: 'var(--cool)' },
                    { code: 'IC', name: 'Imum Coeli', lon: angles.ic, color: 'var(--cool)' },
                    { code: 'As', name: 'Ascendant', lon: angles.asc, color: 'var(--accent)' },
                    { code: 'Ds', name: 'Descendant', lon: angles.dsc, color: 'var(--accent)' },
                  ] as const
                ).map(({ code, name, lon, color }) => (
                  <li key={code}>
                    <div className="es-row-main">
                      <span className="es-glyph es-angle-code" style={{ color }}>
                        {code}
                      </span>
                      <span className="es-name">{name}</span>
                      <span className="es-lon">
                        <Longitude lon={lon} advanced={advanced} />
                      </span>
                    </div>
                  </li>
                ))}
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
                <Longitude lon={p.lon} advanced={advanced} />
                {advanced && p.stationary ? (
                  <span className="es-station" title="Stationary">S</span>
                ) : advanced && p.retrograde ? (
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
        {/* Use the wheel's empty top corners: the chart-state title (left, always)
            and, when an overlay is on, its caption (right). */}
        {angles && (
          <div className="es-wheel-corner es-wheel-corner-left">
            <span className="es-wheel-title" style={{ color: 'var(--map-accent)' }}>
              {wheelTitle}
            </span>
          </div>
        )}
        {angles && overlayName && (
          <div className="es-wheel-corner es-wheel-corner-right">
            <span className="es-overlay-caption es-overlay-dashed">
              {overlayName}
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
              visibleAspects={visibleAspects}
              interactive
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
                <TipButton
                  key={t.key}
                  type="button"
                  className={`es-asp-toggle ${t.cssClass} ${on ? 'on' : 'off'}`}
                  onClick={() => toggleAspect(t.key)}
                  placement="right"
                  tip={t.label}
                  hint={t.desc}
                >
                  <span className="es-asp-swatch" />
                  <span className="es-asp-label">{t.label}</span>
                </TipButton>
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
        // Overlay-first ordering: the overlay body is the subject of the aspect
        // (e.g. "transiting Mars conjunct natal Sun"), so it's listed first and
        // the natal body second.
        const cross = computeCrossAspects(shownOverlay, shownPlanets)
          .filter((a) => visibleAspects.has(a.category))
          .sort((a, b) => a.orb - b.orb);
        if (cross.length === 0) return null;
        return (
          <section className="es-section es-section-aspects es-section-cross">
            <h3>Overlay aspects ({cross.length})</h3>
            <ul className="es-aspect-list">
              {cross.map((a, i) => (
                <li key={i} className={`asp asp-${a.category}`}>
                  <span
                    className="asp-planet asp-planet-overlay"
                    style={{ color: PLANET_COLORS[a.a as PlanetName] }}
                    title="Overlay body"
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
      </div>

      <div
        ref={resizeTipRef}
        className="es-drag-handle"
        onMouseDown={beginDrag}
        onMouseEnter={showResizeTip}
        onMouseLeave={hideResizeTip}
        role="separator"
        aria-orientation="vertical"
      >
        <div className="es-drag-grip" />
      </div>
      <HoverTip pos={resizeTipPos} placement="right" title="Drag to resize" />
    </aside>
  );
}
