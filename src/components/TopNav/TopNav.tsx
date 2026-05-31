import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { MeasureInfo } from '../Map/Map';
import type { MapState } from '../TimelineHud/TimelineHud';
import type { OverlayMode } from '../../lib/astro/timeline';
import type { StoredChart } from '../../lib/chartLibrary';
import { ChartSwitcher } from '../ChartSwitcher/ChartSwitcher';
// Reuse the overlay bar's chrome (.timeline-hud + accent/mapstate vars); this bar
// is the same component language, docked at the top as a curved island.
import '../TimelineHud/TimelineHud.css';
import './TopNav.css';

// The on-map mapping tool, owned here now that the Tools dropdown lives in the
// top bar (was MappingToolsHud).
export type MapTool = 'off' | 'measure';

interface TopNavProps {
  mapState: MapState;
  /** True when a location is pinned — turns the status pill into a recenter button. */
  pinned: boolean;
  onRecenterPin: () => void;
  /** Pin the natal location (green state) — fired by clicking the idle "Natal" pill. */
  onPinNatal: () => void;

  // Chart switcher (client name + add-person), moved into the bar from the
  // top-left window.
  current: StoredChart | null;
  charts: StoredChart[];
  currentId: string | null;
  onSelectChart: (id: string) => void;
  onNewChart: () => void;
  onEditChart: (id: string) => void;
  onDeleteChart: (id: string) => void;

  /** When the expanded chart sidebar is open it already shows the name + DOB, so
   *  the bar's chart switcher fades out. */
  chartExpanded: boolean;
  /** Toggle the expanded chart view (was the minimap's Expand button). */
  onToggleExpand: () => void;

  tool: MapTool;
  setTool: (t: MapTool) => void;
  measure: MeasureInfo | null;

  overlayMode: OverlayMode;
  setOverlayMode: (m: OverlayMode) => void;
  partnerId: string | null;
  setPartnerId: (id: string | null) => void;

  showChart: boolean;
  setShowChart: (v: boolean) => void;
  showCoords: boolean;
  setShowCoords: (v: boolean) => void;
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
}

// Selectable overlay modes (no explicit "None"); clicking the active one again
// clears it back to 'off'. Single-select.
const OVERLAY_MODES: { mode: Exclude<OverlayMode, 'off'>; label: string }[] = [
  { mode: 'transits', label: 'Transits' },
  { mode: 'progressed', label: 'Progressed' },
  { mode: 'solar-arc', label: 'Solar Arc' },
  { mode: 'synastry', label: 'Synastry' },
];

const STATUS_LABEL: Record<MapState, string> = {
  natal: 'NATAL',
  hover: 'HOVER',
  pinned: 'PINNED',
  'natal-pinned': 'NATAL PIN',
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// "40.713°N, 74.006°W" — a measure endpoint as signed-hemisphere decimals.
function fmtLatLng(p: { lat: number; lng: number }): string {
  const lat = `${Math.abs(p.lat).toFixed(3)}°${p.lat >= 0 ? 'N' : 'S'}`;
  const lng = `${Math.abs(p.lng).toFixed(3)}°${p.lng >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lng}`;
}

// "12°34′ · 1395 km · 867 mi" — central angle (deg·min) then both distance units.
function fmtMeasure(m: MeasureInfo): string {
  let deg = Math.floor(m.angleDeg);
  let min = Math.round((m.angleDeg - deg) * 60);
  if (min === 60) {
    min = 0;
    deg += 1;
  }
  const km = m.km < 100 ? m.km.toFixed(1) : Math.round(m.km).toLocaleString();
  const mi =
    m.miles < 100 ? m.miles.toFixed(1) : Math.round(m.miles).toLocaleString();
  return `${deg}°${pad2(min)}′ · ${km} km · ${mi} mi`;
}

// A click-away popover: a trigger button plus an absolutely-positioned panel that
// closes on outside-click or Escape. Composed for each of Tools / Overlay / View.
function NavMenu({
  label,
  active,
  children,
}: {
  label: string;
  active?: boolean;
  // Plain content, or a render-prop given a `close()` so items can dismiss the
  // menu on selection (used by Overlay).
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="navmenu" ref={ref}>
      <button
        type="button"
        className={`navmenu-trigger ${active ? 'active' : ''} ${open ? 'open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{label}</span>
        <span className="navmenu-caret">▾</span>
      </button>
      {open && (
        <div className="navmenu-panel" role="menu">
          {typeof children === 'function'
            ? children(() => setOpen(false))
            : children}
        </div>
      )}
    </div>
  );
}

// A single-select row (radio dot).
function RadioItem({
  label,
  checked,
  onSelect,
}: {
  label: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`navmenu-item ${checked ? 'on' : ''}`}
      role="menuitemradio"
      aria-checked={checked}
      onClick={onSelect}
    >
      <span className="navmenu-marker">{checked ? '●' : '○'}</span>
      <span>{label}</span>
    </button>
  );
}

// A toggle row (checkmark).
function CheckItem({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`navmenu-item ${checked ? 'on' : ''}`}
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onToggle}
    >
      <span className="navmenu-marker check">{checked ? '✓' : ''}</span>
      <span>{label}</span>
    </button>
  );
}

export function TopNav({
  mapState,
  pinned,
  onRecenterPin,
  onPinNatal,
  current,
  charts,
  currentId,
  onSelectChart,
  onNewChart,
  onEditChart,
  onDeleteChart,
  chartExpanded,
  onToggleExpand,
  tool,
  setTool,
  measure,
  overlayMode,
  setOverlayMode,
  partnerId,
  setPartnerId,
  showChart,
  setShowChart,
  showCoords,
  setShowCoords,
  showSettings,
  setShowSettings,
}: TopNavProps) {
  const overlayActive = overlayMode !== 'off';
  const otherCharts = charts
    .filter((c) => c.id !== currentId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const measuring = tool === 'measure';

  return (
    <div className={`topnav-stack ${chartExpanded ? 'chart-expanded' : ''}`}>
      <div className="timeline-hud topnav" data-mapstate={mapState}>
        <div className="topnav-row">
          {/* Left: client name + add-person (the chart switcher). Fades out when
              the expanded sidebar — which shows the same name + DOB — is open. */}
          <div className="topnav-left">
            <ChartSwitcher
              current={current}
              charts={charts}
              onSelect={onSelectChart}
              onNew={onNewChart}
              onEdit={onEditChart}
              onDelete={onDeleteChart}
              compact
            />
          </div>

          {/* Center: expand/collapse + separator + the fixed-width status pill
              (reserves the widest "NATAL PIN" label so the bar never resizes). */}
          <div className="topnav-center">
            <button
              type="button"
              className={`topnav-expand ${chartExpanded ? 'active' : ''}`}
              onClick={onToggleExpand}
              disabled={!current}
              title={chartExpanded ? 'Hide chart sidebar' : 'Show chart sidebar'}
              aria-label="Toggle chart sidebar"
              aria-pressed={chartExpanded}
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
                {/* Chevron points into the panel to close, out to open — the
                    traditional sidebar-toggle convention. */}
                <path d={chartExpanded ? 'm16 15-3-3 3-3' : 'm14 9 3 3-3 3'} />
              </svg>
              <span>Sidebar</span>
            </button>
            <span className="topnav-divider" />
            {pinned ? (
              <button
                type="button"
                className="topnav-status pinned"
                onClick={onRecenterPin}
                title="Center map on pin"
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M8 1.5c-2.5 0-4.5 2-4.5 4.5 0 3.2 4.5 8.5 4.5 8.5s4.5-5.3 4.5-8.5c0-2.5-2-4.5-4.5-4.5z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                  <circle cx="8" cy="6" r="1.6" fill="currentColor" />
                </svg>
                <span>{STATUS_LABEL[mapState]}</span>
              </button>
            ) : mapState === 'natal' ? (
              <button
                type="button"
                className="topnav-status"
                onClick={onPinNatal}
                title="Pin the natal location"
              >
                {STATUS_LABEL[mapState]}
              </button>
            ) : (
              <span className="topnav-status">{STATUS_LABEL[mapState]}</span>
            )}
          </div>

          {/* Right: the command controls. Tools is a single toggle for now (one
              tool); its contents live in the secondary bar below. */}
          <div className="topnav-right">
            <button
              type="button"
              className={`navmenu-trigger topnav-tool ${measuring ? 'active' : ''}`}
              onClick={() => setTool(measuring ? 'off' : 'measure')}
              title="Measure distance"
              aria-label="Measure distance"
              aria-pressed={measuring}
            >
              <svg
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
                <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z" />
                <path d="m14.5 12.5 2-2" />
                <path d="m11.5 9.5 2-2" />
                <path d="m8.5 6.5 2-2" />
                <path d="m17.5 15.5 2-2" />
              </svg>
            </button>

            <NavMenu label="Overlay" active={overlayActive}>
              {(close) => (
                <>
                  {OVERLAY_MODES.map(({ mode, label }) => (
                    <RadioItem
                      key={mode}
                      label={label}
                      checked={overlayMode === mode}
                      onSelect={() => {
                        const next = overlayMode === mode ? 'off' : mode;
                        setOverlayMode(next);
                        // Keep the menu open when turning Synastry on, so the
                        // partner picker it reveals is immediately reachable.
                        if (next !== 'synastry') close();
                      }}
                    />
                  ))}

                  {overlayMode === 'synastry' && (
                    <div className="navmenu-partner">
                      {otherCharts.length === 0 ? (
                        <span className="navmenu-hint">Add another chart to overlay it</span>
                      ) : (
                        <span className="thud-select-wrap">
                          <select
                            className="thud-select"
                            value={partnerId ?? ''}
                            onChange={(e) => {
                              setPartnerId(e.target.value || null);
                              if (e.target.value) close();
                            }}
                          >
                            <option value="">Select chart…</option>
                            {otherCharts.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <span className="thud-select-caret">▾</span>
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}
            </NavMenu>

            <NavMenu label="View">
              <CheckItem
                label="Chart"
                checked={showChart}
                onToggle={() => setShowChart(!showChart)}
              />
              <CheckItem
                label="Coordinates"
                checked={showCoords}
                onToggle={() => setShowCoords(!showCoords)}
              />
              <CheckItem
                label="Settings"
                checked={showSettings}
                onToggle={() => setShowSettings(!showSettings)}
              />
            </NavMenu>
          </div>
        </div>
      </div>

      {/* Secondary bar: holds the active tool's controls/readout, keeping the
          main bar compact. One bar per active tool. */}
      {measuring && (
        <div className="timeline-hud topnav-toolbar" data-mapstate={mapState}>
          {measure ? (
            <div className="topnav-measure">
              <span className="topnav-measure-endpoints">
                <span className="topnav-dot" />
                {fmtLatLng(measure.start)}
                <span className="topnav-measure-arrow">→</span>
                {fmtLatLng(measure.end)}
              </span>
              <span className="topnav-measure-dist">{fmtMeasure(measure)}</span>
            </div>
          ) : (
            <span className="topnav-toolbar-hint">
              Click and drag on the map to measure
            </span>
          )}
        </div>
      )}
    </div>
  );
}
