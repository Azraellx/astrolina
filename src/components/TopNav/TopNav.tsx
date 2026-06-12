// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { MeasureInfo } from '../Map/Map';
import type { MapState } from '../TimelineHud/TimelineHud';
import type { OverlayMode } from '../../lib/astro/timeline';
import type { StoredChart } from '../../lib/chartLibrary';
import { ChartSwitcher } from '../ChartSwitcher/ChartSwitcher';
import { HoverTip, TipButton, TipSpan } from '../ui/HoverTip';
import { useHoverTip } from '../ui/useHoverTip';
import { useT } from '../../i18n';
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
  /** Reverse-geocoded name of the active map point (pin/hover); null while
   *  measuring or with no active point (then the bar shows the birth location). */
  locationLabel: string | null;
  /** Fade the location text on change — only while a non-natal pin resolves its
   *  full address; otherwise it swaps instantly. */
  fadeLocation: boolean;

  overlayMode: OverlayMode;
  setOverlayMode: (m: OverlayMode) => void;

  showChart: boolean;
  setShowChart: (v: boolean) => void;
  showCoords: boolean;
  setShowCoords: (v: boolean) => void;
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  showInfo: boolean;
  setShowInfo: (v: boolean) => void;
  showTeleport: boolean;
  setShowTeleport: (v: boolean) => void;
  /** The guides reference (View ▸ Guides) — revisit the onboarding guides as a glossary.
   *  No hotkey: it's an occasional reference, not a frequently toggled HUD. */
  showGuides: boolean;
  setShowGuides: (v: boolean) => void;
}

// Selectable overlay modes (no explicit "None"); clicking the active one again
// clears it back to 'off'. Single-select. Labels/descriptions live in the catalog
// (topNav.overlay.modes.*); status labels and the map-controls hint likewise.
const OVERLAY_MODES: Exclude<OverlayMode, 'off'>[] = [
  'transits',
  'progressed',
  'solar-arc',
  'primary-directions',
  'cyclo',
  'synastry',
  'eclipses',
];

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
  className,
  children,
}: {
  label: string;
  active?: boolean;
  /** Extra class on the trigger (e.g. 'navmenu-steady' to opt out of the
   *  map-state accent on open/active). */
  className?: string;
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
        className={`navmenu-trigger ${className ?? ''} ${active ? 'active' : ''} ${open ? 'open' : ''}`}
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

// The overlay-mode hotkey tag: "O" + a cycle glyph, since pressing O *cycles*
// through the overlay modes rather than jumping to a fixed one.
function CycleHotkey() {
  return (
    <span className="cycle-hotkey">
      O
      <svg
        className="cycle-hotkey-icon"
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
      </svg>
    </span>
  );
}

// A single-select row (radio dot). Its description + shortcut surface in a hover
// .ui-tip; the (longer) shortcut sits on its own row beneath the description.
function RadioItem({
  label,
  tipTitle,
  checked,
  onSelect,
  hint,
  hotkey,
}: {
  label: string;
  /** Fuller name shown as the hover-tip title when `label` is abbreviated. */
  tipTitle?: string;
  checked: boolean;
  onSelect: () => void;
  hint?: string;
  hotkey?: ReactNode;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>('left');
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`navmenu-item ${checked ? 'on' : ''}`}
        role="menuitemradio"
        aria-checked={checked}
        onClick={onSelect}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <span className="navmenu-marker">{checked ? '●' : '○'}</span>
        <span>{label}</span>
      </button>
      <HoverTip
        pos={pos}
        placement="left"
        title={tipTitle ?? label}
        hint={hint}
        hotkey={hotkey}
      />
    </>
  );
}

// A toggle row (checkmark) with its single-key shortcut printed inline, as the
// yellow .navmenu-key badge (the same accent styling the hover tips use).
function CheckItem({
  label,
  checked,
  onToggle,
  hotkey,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  hotkey?: string;
}) {
  return (
    <button
      type="button"
      className={`navmenu-item navmenu-check ${checked ? 'on' : ''}`}
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onToggle}
    >
      <span className="navmenu-marker check">{checked ? '✓' : ''}</span>
      <span>{label}</span>
      {hotkey && <span className="navmenu-key">{hotkey}</span>}
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
  onSelectChart,
  onNewChart,
  onEditChart,
  onDeleteChart,
  chartExpanded,
  onToggleExpand,
  tool,
  setTool,
  measure,
  locationLabel,
  fadeLocation,
  overlayMode,
  setOverlayMode,
  showChart,
  setShowChart,
  showCoords,
  setShowCoords,
  showSettings,
  setShowSettings,
  showInfo,
  setShowInfo,
  showTeleport,
  setShowTeleport,
  showGuides,
  setShowGuides,
}: TopNavProps) {
  const { t } = useT();
  const overlayActive = overlayMode !== 'off';

  const measuring = tool === 'measure';
  const locationText = locationLabel ?? undefined;
  // Fade only while a non-natal pin upgrades to a NEW, more accurate address (App
  // sets `fadeLocation` only when the resolved label differs from the text already
  // shown). Keying the span by the text replays the fade on that change; same-text
  // resolves and plain hover swaps stay instant.
  const locationContent =
    fadeLocation && locationText ? (
      <span className="topnav-location-fade" key={locationText}>
        {locationText}
      </span>
    ) : (
      locationText
    );

  // Keep the centre status pill on the true screen centre even when the left side
  // (the chart name) is wider than the right. The row hugs its content, so we shift
  // the whole bar by half the left/right width difference (grid gaps cancel out).
  // Disabled while the sidebar is expanded — that layout is left-anchored, not centred.
  const barRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const left = bar.querySelector<HTMLElement>('.topnav-left');
    const right = bar.querySelector<HTMLElement>('.topnav-right');
    if (!left || !right) return;
    const recenter = () => {
      if (chartExpanded) {
        bar.style.transform = '';
        return;
      }
      const d =
        (right.getBoundingClientRect().width - left.getBoundingClientRect().width) /
        2;
      bar.style.transform = `translateX(${d}px)`;
    };
    recenter();
    const ro = new ResizeObserver(recenter);
    ro.observe(left);
    ro.observe(right);
    return () => ro.disconnect();
  }, [chartExpanded]);

  return (
    <div className={`topnav-stack ${chartExpanded ? 'chart-expanded' : ''}`}>
      <div ref={barRef} className="timeline-hud topnav" data-mapstate={mapState}>
        <div className="topnav-row">
          {/* Left: client name (the chart switcher) then the sidebar toggle, pinned
              flush-right against the centre pill. While the expanded sidebar is open
              the name drops out (the panel already shows it), but the toggle stays as
              a close button so the sidebar is dismissable from the bar too. */}
          <div className="topnav-left">
            <div className="topnav-chart">
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
            <TipButton
              type="button"
              className={`topnav-expand ${chartExpanded ? 'active' : ''}`}
              onClick={onToggleExpand}
              disabled={!current}
              aria-label={chartExpanded ? t('topNav.sidebarToggle.hideAria') : t('topNav.sidebarToggle.showAria')}
              aria-pressed={chartExpanded}
              tip={chartExpanded ? t('topNav.sidebarToggle.hideTip') : t('topNav.sidebarToggle.showTip')}
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
                {/* Chevron points out to open the panel, in to close it. */}
                <path d={chartExpanded ? 'm16 9-3 3 3 3' : 'm14 9 3 3-3 3'} />
              </svg>
            </TipButton>
          </div>

          {/* Center: the fixed-width status pill (reserves the widest "NATAL PIN"
              label so the bar never resizes). The 1fr/auto/1fr row keeps this on the
              bar's true centre, flush under the readout island below it. */}
          <div className="topnav-center">
            {pinned ? (
              <TipButton
                type="button"
                className="topnav-status pinned"
                onClick={onRecenterPin}
                tip={t('topNav.pin.centerTip')}
                hotkey="Space"
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4" />
                  <path
                    d="M8 1v3M8 12v3M1 8h3M12 8h3"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
                <span>{t(`topNav.status.${mapState}`)}</span>
              </TipButton>
            ) : mapState === 'natal' ? (
              <TipButton
                type="button"
                className="topnav-status"
                onClick={onPinNatal}
                tip={t('topNav.pin.pinNatalTip')}
                hotkey="Space"
              >
                {t(`topNav.status.${mapState}`)}
              </TipButton>
            ) : (
              <TipSpan
                className="topnav-status"
                tip={t('topNav.pin.controlsTip')}
              >
                {t(`topNav.status.${mapState}`)}
              </TipSpan>
            )}
          </div>

          {/* Right: the command controls. Tools is a single toggle for now (one
              tool); its contents live in the secondary bar below. */}
          <div className="topnav-right">
            <TipButton
              type="button"
              className={`navmenu-trigger topnav-tool ${measuring ? 'active' : ''}`}
              onClick={() => setTool(measuring ? 'off' : 'measure')}
              aria-label={t('topNav.tools.measure')}
              aria-pressed={measuring}
              tip={t('topNav.tools.measure')}
              hotkey="T"
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
            </TipButton>

            <NavMenu label={t('topNav.overlay.menuLabel')} active={overlayActive}>
              {(close) => (
                <>
                  {/* Explicit "None" row (selected whenever no overlay is shown) is
                      clearer than the old click-the-active-one-to-hide toggle, so
                      the mode rows now just select their mode — re-picking the
                      active one is a no-op. */}
                  <RadioItem
                    label={t('topNav.overlay.none.label')}
                    hint={t('topNav.overlay.none.hint')}
                    hotkey="N"
                    checked={overlayMode === 'off'}
                    onSelect={() => {
                      setOverlayMode('off');
                      close();
                    }}
                  />
                  {OVERLAY_MODES.map((mode) => (
                    <RadioItem
                      key={mode}
                      label={t(`topNav.overlay.modes.${mode}.label`)}
                      tipTitle={
                        mode === 'progressed'
                          ? t('topNav.overlay.modes.progressed.tipTitle')
                          : undefined
                      }
                      hint={t(`topNav.overlay.modes.${mode}.desc`)}
                      hotkey={<CycleHotkey />}
                      checked={overlayMode === mode}
                      onSelect={() => {
                        setOverlayMode(mode);
                        close();
                      }}
                    />
                  ))}
                </>
              )}
            </NavMenu>

            <NavMenu label={t('topNav.view.menuLabel')} className="navmenu-steady">
              <CheckItem
                label={t('topNav.view.coordinates')}
                hotkey="C"
                checked={showCoords}
                onToggle={() => setShowCoords(!showCoords)}
              />
              <CheckItem
                label={t('topNav.view.minimap')}
                hotkey="M"
                checked={showChart}
                onToggle={() => setShowChart(!showChart)}
              />
              <CheckItem
                label={t('topNav.view.settings')}
                hotkey="S"
                checked={showSettings}
                onToggle={() => setShowSettings(!showSettings)}
              />
              <CheckItem
                label={t('topNav.view.teleport')}
                hotkey="G"
                checked={showTeleport}
                onToggle={() => setShowTeleport(!showTeleport)}
              />
              <CheckItem
                label={t('topNav.view.info')}
                hotkey="I"
                checked={showInfo}
                onToggle={() => setShowInfo(!showInfo)}
              />
              {/* Guides reference — at the bottom and deliberately without a hotkey, since
                  it's an occasional glossary, not a frequently toggled HUD. */}
              <CheckItem
                label={t('topNav.view.guides')}
                checked={showGuides}
                onToggle={() => setShowGuides(!showGuides)}
              />
            </NavMenu>
          </div>
        </div>
      </div>

      {/* Secondary bar: the active tool's readout while a tool is on, otherwise
          the place name under the active map point (pin/hover), falling back to
          the chart's birth location. One reused island. The place name is hidden
          here while the Coordinates view is open — it moves into that window
          instead — but the measure readout always shows. */}
      {(measuring || (locationLabel && !showCoords)) && (
        <div className="timeline-hud topnav-toolbar" data-mapstate={mapState}>
          {measuring ? (
            measure ? (
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
                {t('topNav.tools.toolbarHint')}
              </span>
            )
          ) : pinned ? (
            <TipButton
              type="button"
              className="topnav-location topnav-location-btn"
              onClick={onRecenterPin}
              tip={t('topNav.pin.centerTip')}
              hotkey="Space"
            >
              <span className="topnav-dot" />
              <span className="topnav-location-text">
                {locationContent}
              </span>
            </TipButton>
          ) : (
            <TipSpan
              className="topnav-location"
              placement="bottom"
              tip={locationText}
            >
              <span className="topnav-dot" />
              <span className="topnav-location-text">
                {locationContent}
              </span>
            </TipSpan>
          )}
        </div>
      )}
    </div>
  );
}
