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
import type { MeasureInfo, SlideInfo } from '../Map/Map';
import type { MapState } from '../TimelineHud/TimelineHud';
import {
  OVERLAY_MODES,
  ADVANCED_OVERLAY_MODES,
  type OverlayMode,
} from '../../lib/astro/timeline';
import { getMapExtensions } from '../../lib/extensions/mapExtensions';
import { getToolExtensions } from '../../lib/extensions/toolExtensions';
import { getOverlayExtensions } from '../../lib/extensions/overlayExtensions';
import { type PlanTier, tierMet, tierLabel, tierOfEntitlement, shouldShowNudge } from '../../lib/plan';
import type { StoredChart } from '../../lib/chartLibrary';
import { ChartSwitcher } from '../ChartSwitcher/ChartSwitcher';
import { CycleHotkey } from '../ui/CycleHotkey';
import { HoverTip, TipButton, TipSpan } from '../ui/HoverTip';
import { useHoverTip } from '../ui/useHoverTip';
import { useT } from '../../i18n';
import { useTouchLayout } from '../../lib/touch';
// Reuse the overlay bar's chrome (.timeline-hud + accent/mapstate vars); this bar
// is the same component language, docked at the top as a curved island.
import '../TimelineHud/TimelineHud.css';
import './TopNav.css';

// The on-map mapping tool, owned here now that the Tools dropdown lives in the
// top bar (was MappingToolsHud).
export type MapTool = 'off' | 'measure' | 'slide';

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
  measureSnap?: boolean;
  setMeasureSnap?: (v: boolean) => void;
  /** Slide-tool readout (rotation angle + sidereal time); null until spun. */
  slide: SlideInfo | null;
  /** Toggle the Slide tool — switches the geodetic line frame to celestial first if needed. */
  onToggleSlide: () => void;
  /** False when Slide can't run (natal linework hidden / overlay promoted) — greys the item. */
  slideEnabled: boolean;
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
  showLocalSpace: boolean;
  setShowLocalSpace: (v: boolean) => void;
  /** The user's plan tier (src/lib/plan.ts). Gates the menu items by tier — Slide (Tools),
   *  Local Space (View), Synastry + Eclipses (Overlay) need 'adv'; downstream items need
   *  'gated'. Each is hidden until the tier is reached, and tier-badged when shown. */
  planTier: PlanTier;
  /** The guides reference (View ▸ Guides) — revisit the onboarding guides as a glossary.
   *  No hotkey: it's an occasional reference, not a frequently toggled HUD. */
  showGuides: boolean;
  setShowGuides: (v: boolean) => void;
  /** Open ids + toggle for registry-driven HUD extensions (registerMapExtension). */
  openExtensions: ReadonlySet<string>;
  onToggleExtension: (id: string) => void;
  /** Open ids + toggle for Tools-menu extensions (registerToolExtension). Each is a
   *  toggled HUD surfaced beneath the built-in tools. */
  openTools: ReadonlySet<string>;
  onToggleTool: (id: string) => void;
  /** The active Overlay-menu extension id (registerOverlayExtension), or null. Mutually
   *  exclusive with the core overlayMode — selecting one clears the other. */
  activeOverlayExt: string | null;
  onSelectOverlayExt: (id: string) => void;
}

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

// "+48.2° E · 18:42 EDT" — the Slide spin as a signed rotation about the pole (with
// hemisphere), then the resulting wall-clock time at the birthplace in the chart's zone.
function fmtSlide(s: SlideInfo): string {
  const sign = s.thetaDeg >= 0 ? '+' : '−';
  const dir = s.thetaDeg >= 0 ? 'E' : 'W';
  const deg = `${sign}${Math.abs(s.thetaDeg).toFixed(1)}° ${dir}`;
  return `${deg} · ${s.clock}`;
}

// A click-away popover: a trigger button plus an absolutely-positioned panel that
// closes on outside-click or Escape. Composed for each of Tools / Overlay / View.
function NavMenu({
  label,
  ariaLabel,
  active,
  className,
  children,
}: {
  /** Trigger content — text (Overlay/View) or an icon (Tools). */
  label: ReactNode;
  /** Accessible name when `label` is a bare icon with no text. */
  ariaLabel?: string;
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
        aria-label={ariaLabel}
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

// The Tools-menu trigger icon, swapped to the ARMED tool so the bar shows at a
// glance which tool is live: a ruler for Measure, a rotation glyph for Slide, and
// the neutral wrench when nothing is armed. The button + icon also pulse while a
// tool is on (see .topnav-tool.active in the CSS).
function ToolMenuIcon({ tool }: { tool: MapTool }) {
  return (
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
      {tool === 'measure' ? (
        <>
          {/* ruler */}
          <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" />
          <path d="m14.5 12.5 2-2" />
          <path d="m11.5 9.5 2-2" />
          <path d="m8.5 6.5 2-2" />
          <path d="m17.5 15.5 2-2" />
        </>
      ) : tool === 'slide' ? (
        <>
          {/* rotate-3d — spinning the globe under the linework */}
          <path d="M16.466 7.5C15.643 4.237 13.952 2 12 2 9.239 2 7 6.477 7 12s2.239 10 5 10c.342 0 .677-.069 1-.2" />
          <path d="m15.194 13.707 3.814 1.86-1.86 3.814" />
          <path d="M19 15.57c-1.804.885-4.274 1.43-7 1.43-5.523 0-10-2.239-10-5s4.477-5 10-5c4.838 0 8.873 1.718 9.8 4" />
        </>
      ) : (
        /* wrench — neutral "tools" affordance */
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      )}
    </svg>
  );
}

// The small tier badge on a plan-gated menu row (ADV / the gated tier) — see
// src/lib/plan.ts. It right-aligns and sits left of any hotkey key; NEW (or a gated tier
// whose downstream label is unset) renders nothing.
function TierBadge({ tier }: { tier?: PlanTier }) {
  if (!tier || tier === 'new') return null;
  const label = tierLabel(tier);
  return label ? <span className={`navmenu-tier tier-${tier}`}>{label}</span> : null;
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
  tier,
  disabled,
  locked,
}: {
  label: string;
  /** Fuller name shown as the hover-tip title when `label` is abbreviated. */
  tipTitle?: string;
  checked: boolean;
  onSelect: () => void;
  hint?: string;
  hotkey?: ReactNode;
  /** The plan tier this row belongs to — renders its tier badge (ADV / gated). */
  tier?: PlanTier;
  /** Greyed + click no-op'd (kept in the DOM so it's still a hoverable teaser). */
  disabled?: boolean;
  /** Tier-locked teaser (the user hasn't reached `tier`): suppress the shortcut, since the
   *  key does nothing until they upgrade. Distinct from `disabled`, which also covers a
   *  reached-but-temporarily-unavailable row whose shortcut still applies. */
  locked?: boolean;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>('left');
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`navmenu-item ${checked ? 'on' : ''} ${disabled ? 'disabled' : ''}`}
        role="menuitemradio"
        aria-checked={checked}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) onSelect();
        }}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <span className="navmenu-marker">{checked ? '●' : '○'}</span>
        <span>{label}</span>
        <TierBadge tier={tier} />
      </button>
      <HoverTip
        pos={pos}
        placement="left"
        title={tipTitle ?? label}
        hint={hint}
        hotkey={locked ? undefined : hotkey}
        advanced={tier === 'adv'}
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
  tier,
  disabled,
  locked,
  hint,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  hotkey?: string;
  /** The plan tier this row belongs to — renders its tier badge (ADV / gated). */
  tier?: PlanTier;
  /** Greyed + click no-op'd (kept in the DOM so it's still a hoverable teaser). */
  disabled?: boolean;
  /** Tier-locked teaser (the user hasn't reached `tier`): hide the shortcut badge — the key
   *  does nothing until they upgrade, so "L" on a greyed Local Space row only misleads. */
  locked?: boolean;
  /** Optional explainer. View rows normally have none, so they show NO tip; but if a row IS
   *  given a hint it surfaces on hover/focus like the other menus (with the ADV marker). */
  hint?: string;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>('left');
  const hasTip = !!hint;
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`navmenu-item navmenu-check ${checked ? 'on' : ''} ${disabled ? 'disabled' : ''}`}
        role="menuitemcheckbox"
        aria-checked={checked}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) onToggle();
        }}
        onMouseEnter={hasTip ? show : undefined}
        onMouseLeave={hasTip ? hide : undefined}
        onFocus={hasTip ? show : undefined}
        onBlur={hasTip ? hide : undefined}
      >
        <span className="navmenu-marker check">{checked ? '✓' : ''}</span>
        <span>{label}</span>
        <TierBadge tier={tier} />
        {hotkey && !locked && <span className="navmenu-key">{hotkey}</span>}
      </button>
      {hasTip && (
        <HoverTip pos={pos} placement="left" title={label} hint={hint} advanced={tier === 'adv'} />
      )}
    </>
  );
}

// A tool toggle for the Tools menu: a checkmark when active, the single-key shortcut
// as the yellow badge, and a hover .ui-tip (always shown — it explains the tool, and
// when disabled, why it's unavailable). Disabled rows grey out and don't fire.
function ToolItem({
  label,
  icon,
  hotkey,
  checked,
  disabled,
  locked,
  hint,
  onToggle,
  tier,
}: {
  label: string;
  /** The tool's glyph, shown beside the label and in its hover tip. Optional —
   *  registered tools without an icon just show the label. */
  icon?: ReactNode;
  /** Single-key shortcut badge; omitted by registered tools shipped without one. */
  hotkey?: string;
  checked: boolean;
  disabled?: boolean;
  /** Tier-locked teaser (the user hasn't reached `tier`): suppress the shortcut, since the
   *  key does nothing until they upgrade. Distinct from `disabled`, which a reached tool also
   *  sets when temporarily unavailable (e.g. Slide with no natal linework) — its key still
   *  applies, so we keep it. */
  locked?: boolean;
  hint?: string;
  onToggle: () => void;
  /** The plan tier this row belongs to — renders its tier badge (ADV / gated). */
  tier?: PlanTier;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>('left');
  // Disabled rows stay enabled at the DOM level (greyed via .disabled, click
  // no-op'd) so they remain hoverable — a `disabled` <button> wouldn't fire the
  // hover that surfaces the "why it's unavailable" tip.
  return (
    <>
      {/* Tools are left-aligned (icon → label, flush): no checkmark column. The
          active tool is signalled by the accent tint (.navmenu-item.on) — plus the
          armed-tool trigger icon + the readout bar — and stays a checkbox for a11y. */}
      <button
        ref={ref}
        type="button"
        className={`navmenu-item ${checked ? 'on' : ''} ${disabled ? 'disabled' : ''}`}
        role="menuitemcheckbox"
        aria-checked={checked}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) onToggle();
        }}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {icon && (
          <span className="navmenu-item-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <span>{label}</span>
        <TierBadge tier={tier} />
        {hotkey && !locked && <span className="navmenu-key">{hotkey}</span>}
      </button>
      <HoverTip
        pos={pos}
        placement="left"
        title={
          icon ? (
            <span className="navmenu-tip-title">
              <span className="navmenu-tip-icon" aria-hidden="true">
                {icon}
              </span>
              {label}
            </span>
          ) : (
            label
          )
        }
        hint={hint}
        hotkey={locked ? undefined : hotkey}
        advanced={tier === 'adv'}
      />
    </>
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
  measureSnap,
  setMeasureSnap,
  slide,
  onToggleSlide,
  slideEnabled,
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
  showLocalSpace,
  setShowLocalSpace,
  planTier,
  showGuides,
  setShowGuides,
  openExtensions,
  onToggleExtension,
  openTools,
  onToggleTool,
  activeOverlayExt,
  onSelectOverlayExt,
}: TopNavProps) {
  const { t } = useT();
  // The Overlay trigger reads as active for either a core mode or an extension overlay.
  const overlayActive = overlayMode !== 'off' || activeOverlayExt != null;

  // View-menu items: the built-ins, then any registry (add-on) extensions. We then
  // float every item that HAS a hotkey above the ones that don't, so any hotkey-less
  // option (e.g. an add-on shipped without a shortcut) collects at the bottom. The
  // partition is stable, so each group keeps its declared order (e.g. Guides stays
  // above Info).
  const touch = useTouchLayout();
  const viewItems: {
    id: string;
    label: string;
    checked: boolean;
    onToggle: () => void;
    hotkey?: string;
    tier?: PlanTier;
  }[] = [
    { id: 'coordinates', label: t('topNav.view.coordinates'), hotkey: 'C', checked: showCoords, onToggle: () => setShowCoords(!showCoords) },
    { id: 'minimap', label: t('topNav.view.minimap'), hotkey: 'M', checked: showChart, onToggle: () => setShowChart(!showChart) },
    { id: 'settings', label: t('topNav.view.settings'), hotkey: 'S', checked: showSettings, onToggle: () => setShowSettings(!showSettings) },
    { id: 'teleport', label: t('topNav.view.teleport'), hotkey: 'G', checked: showTeleport, onToggle: () => setShowTeleport(!showTeleport) },
    { id: 'localSpace', label: t('topNav.view.localSpace'), hotkey: 'L', tier: 'adv', checked: showLocalSpace, onToggle: () => setShowLocalSpace(!showLocalSpace) },
    { id: 'guides', label: t('topNav.view.guides'), checked: showGuides, onToggle: () => setShowGuides(!showGuides) },
    { id: 'info', label: t('topNav.view.info'), checked: showInfo, onToggle: () => setShowInfo(!showInfo) },
    ...getMapExtensions().map((ext) => ({
      id: ext.id,
      label: ext.label,
      hotkey: ext.hotkey,
      tier: tierOfEntitlement(ext.tier),
      checked: openExtensions.has(ext.id),
      onToggle: () => onToggleExtension(ext.id),
    })),
  ];
  // Items above the user's tier (e.g. Local Space needs 'adv') normally drop out of the menu —
  // unless the build's nudge policy opts to show them as a disabled upgrade teaser (then they
  // stay, greyed, with their tier badge). The open core nudges nothing, so they still drop.
  const orderedViewItems = [
    ...viewItems.filter((i) => i.hotkey),
    ...viewItems.filter((i) => !i.hotkey),
  ]
    // On touch the coordinates + minimap are hidden (they track the mouse-hover
    // point, which a finger can't produce), so drop their View-menu rows too —
    // toggling them would be a confusing no-op.
    .filter((i) => !(touch && (i.id === 'coordinates' || i.id === 'minimap')))
    .filter((i) => tierMet(planTier, i.tier ?? 'new') || shouldShowNudge(i.tier ?? 'new'));

  const measuring = tool === 'measure';
  const sliding = tool === 'slide';
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
      // Expose the nav island's rendered width so the bottom overlay bars (timeline / eclipse)
      // can size themselves to it ×2 on touch, instead of a fixed viewport %. offsetWidth is the
      // layout width (ignores the centring translateX below). See TimelineHud/EclipseHud CSS.
      document.documentElement.style.setProperty('--topnav-width', `${bar.offsetWidth}px`);
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

          {/* Right: the command controls. Tools groups the on-map tools (Measure,
              Slide); the active tool's readout shows in the secondary bar below. */}
          <div className="topnav-right">
            <NavMenu
              label={<ToolMenuIcon tool={tool} />}
              ariaLabel={t('topNav.tools.menuLabel')}
              active={tool !== 'off'}
              className="topnav-tool navmenu-mapstate"
            >
              {(close) => (
                <>
                  <ToolItem
                    label={t('topNav.tools.measureItem')}
                    icon={<ToolMenuIcon tool="measure" />}
                    hint={t('topNav.tools.measureHint')}
                    hotkey="T"
                    checked={measuring}
                    onToggle={() => {
                      setTool(measuring ? 'off' : 'measure');
                      close();
                    }}
                  />
                  {/* Slide needs the 'adv' tier: hidden below it (or a disabled teaser if the
                      build nudges), tier-badged at/above it. When un-reached it's greyed; once
                      reached it disables only when Slide can't run (no natal linework). */}
                  {(tierMet(planTier, 'adv') || shouldShowNudge('adv')) && (
                    <ToolItem
                      label={t('topNav.tools.slideItem')}
                      icon={<ToolMenuIcon tool="slide" />}
                      hint={
                        slideEnabled
                          ? t('topNav.tools.slideHint')
                          : t('topNav.tools.slideUnavailable')
                      }
                      hotkey="Y"
                      tier="adv"
                      checked={sliding}
                      disabled={!tierMet(planTier, 'adv') || !slideEnabled}
                      locked={!tierMet(planTier, 'adv')}
                      onToggle={() => {
                        onToggleSlide();
                        close();
                      }}
                    />
                  )}
                  {/* Registered Tools-menu extensions (registerToolExtension) — add-on
                      tools attach here with no edits to this file. The checkmark mirrors
                      their open state. Tier-filtered like the View menu (and the core
                      tools above): a gated tool stays hidden until the user reaches its
                      tier — no teaser. */}
                  {getToolExtensions()
                    .filter((ext) => {
                      const req = tierOfEntitlement(ext.tier);
                      return tierMet(planTier, req) || shouldShowNudge(req);
                    })
                    .map((ext) => {
                      const req = tierOfEntitlement(ext.tier);
                      return (
                        <ToolItem
                          key={ext.id}
                          label={ext.label}
                          hint={ext.hint}
                          hotkey={ext.hotkey}
                          tier={req}
                          disabled={!tierMet(planTier, req)}
                          locked={!tierMet(planTier, req)}
                          checked={openTools.has(ext.id)}
                          onToggle={() => {
                            onToggleTool(ext.id);
                            close();
                          }}
                        />
                      );
                    })}
                </>
              )}
            </NavMenu>

            <NavMenu label={t('topNav.overlay.menuLabel')} active={overlayActive} className="navmenu-mapstate">
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
                    checked={overlayMode === 'off' && activeOverlayExt == null}
                    onSelect={() => {
                      // setOverlayMode is the App's combined setter — it clears any
                      // active extension overlay as it sets the core mode to 'off'.
                      setOverlayMode('off');
                      close();
                    }}
                  />
                  {/* Synastry + Eclipses need the 'adv' tier: filtered out below it (or a disabled
                      teaser if the build nudges), tier-badged at/above it (see ADVANCED_OVERLAY_MODES). */}
                  {OVERLAY_MODES.filter((mode) => {
                    const req = ADVANCED_OVERLAY_MODES.has(mode) ? 'adv' : 'new';
                    return tierMet(planTier, req) || shouldShowNudge(req);
                  }).map((mode) => {
                    const advMode = ADVANCED_OVERLAY_MODES.has(mode);
                    return (
                      <RadioItem
                        key={mode}
                        label={t(`topNav.overlay.modes.${mode}.label`)}
                        tipTitle={
                          mode === 'progressed'
                            ? t('topNav.overlay.modes.progressed.tipTitle')
                            : mode === 'tertiary-progressed'
                              ? t('topNav.overlay.modes.tertiary-progressed.tipTitle')
                              : mode === 'cyclo'
                                ? t('topNav.overlay.modes.cyclo.tipTitle')
                                : undefined
                        }
                        hint={t(`topNav.overlay.modes.${mode}.desc`)}
                        hotkey={<CycleHotkey label="O" />}
                        tier={advMode ? 'adv' : undefined}
                        disabled={advMode && !tierMet(planTier, 'adv')}
                        locked={advMode && !tierMet(planTier, 'adv')}
                        checked={overlayMode === mode}
                        onSelect={() => {
                          setOverlayMode(mode);
                          close();
                        }}
                      />
                    );
                  })}
                  {/* Registered Overlay-menu extensions (registerOverlayExtension) —
                      single-select rows beneath the built-in modes. Selecting one clears
                      the core mode (App's onSelectOverlayExt). Tier-filtered like the View
                      menu: a gated overlay stays hidden until the user reaches its tier. */}
                  {getOverlayExtensions()
                    .filter((ext) => {
                      const req = tierOfEntitlement(ext.tier);
                      return tierMet(planTier, req) || shouldShowNudge(req);
                    })
                    .map((ext) => {
                      const req = tierOfEntitlement(ext.tier);
                      return (
                        <RadioItem
                          key={ext.id}
                          label={ext.label}
                          tipTitle={ext.tipTitle}
                          hint={ext.hint}
                          hotkey={ext.hotkey}
                          tier={req}
                          disabled={!tierMet(planTier, req)}
                          locked={!tierMet(planTier, req)}
                          checked={activeOverlayExt === ext.id}
                          onSelect={() => {
                            onSelectOverlayExt(ext.id);
                            close();
                          }}
                        />
                      );
                    })}
                </>
              )}
            </NavMenu>

            <NavMenu label={t('topNav.view.menuLabel')} className="navmenu-steady">
              {/* Built-ins + add-on extensions, hotkey items first then hotkey-less
                  ones (see orderedViewItems). */}
              {orderedViewItems.map((it) => (
                <CheckItem
                  key={it.id}
                  label={it.label}
                  hotkey={it.hotkey}
                  checked={it.checked}
                  tier={it.tier}
                  disabled={!tierMet(planTier, it.tier ?? 'new')}
                  locked={!tierMet(planTier, it.tier ?? 'new')}
                  onToggle={it.onToggle}
                />
              ))}
            </NavMenu>
          </div>
        </div>
      </div>

      {/* Secondary bar: the active tool's readout while a tool is on, otherwise
          the place name under the active map point (pin/hover), falling back to
          the chart's birth location. One reused island. The place name is hidden
          here while the Coordinates view is open — it moves into that window
          instead — but the measure readout always shows. */}
      {(measuring || sliding || (locationLabel && !showCoords)) && (
        <div className="timeline-hud topnav-toolbar" data-mapstate={mapState}>
          {measuring ? (
            <>
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
                  {t('topNav.tools.toolbarHint')}
                </span>
              )}
              {/* Persistent snap toggle — TOUCH ONLY: the finger-reachable stand-in for
                  holding Shift to lock the endpoint onto a chart line. Desktop keeps the
                  Shift shortcut, so the button is unnecessary clutter there. */}
              {touch && (
                <button
                  type="button"
                  className={`topnav-snap${measureSnap ? ' on' : ''}`}
                  onClick={() => setMeasureSnap?.(!measureSnap)}
                  aria-pressed={measureSnap}
                  title="Snap the endpoint to chart lines (or hold Shift)"
                >
                  <span className="topnav-snap-dot" />
                  Snap
                </button>
              )}
            </>
          ) : sliding ? (
            slide ? (
              <div className="topnav-measure">
                <span className="topnav-measure-endpoints">
                  <span className="topnav-dot" />
                  {fmtSlide(slide)}
                </span>
              </div>
            ) : (
              <span className="topnav-toolbar-hint">
                {t('topNav.tools.slideToolbarHint')}
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
