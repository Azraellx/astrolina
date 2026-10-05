// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import {
  Fragment,
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
  VIEW_LOCK_PARKED_OVERLAYS,
  overlayBlockFor,
  type OverlayMode,
} from '../../lib/astro/timeline';
import { canonicalLng } from '../../lib/coordFormat';
import { getMapExtensions } from '../../lib/extensions/mapExtensions';
import { getToolExtensions } from '../../lib/extensions/toolExtensions';
import { getOverlayExtensions } from '../../lib/extensions/overlayExtensions';
import type { LineSystem } from '../../lib/ephemeris';
import { skyHeldFor } from '../../lib/skyHold';
import { usePinCelebrations } from '../../lib/extensions/pinAdornment';
import { useViewLock } from '../../lib/extensions/viewLock';
import { isViewRowClaimed } from '../../lib/extensions/viewRowClaims';
import { type PlanTier, tierMet, tierLabel, shouldShowTierBadge, tierOfEntitlement, shouldShowNudge, nudgeAction } from '../../lib/plan';
import type { StoredChart } from '../../lib/chartLibrary';
import { ChartSwitcher, type ChartQuickFlash } from '../ChartSwitcher/ChartSwitcher';
import { CycleHotkey } from '../ui/CycleHotkey';
import { HoverTip, TipButton, TipSpan } from '../ui/HoverTip';
import { useHoverTip } from '../ui/useHoverTip';
import { ClickIcon } from '../ui/ClickIcon';
import { DragIcon } from '../ui/DragIcon';
import { TapIcon } from '../ui/TapIcon';
import { PinchIcon } from '../ui/PinchIcon';
import { ZoomIcon } from '../ui/ZoomIcon';
import { useT } from '../../i18n';
import type { TFn } from '../../i18n';
import { useTouchLayout, useNarrowNav, isNarrowNav } from '../../lib/touch';
import { useIdentity } from '../../lib/discreet';
import {
  getReservedLeftInset,
  publishMapColumnNeed,
  subscribeLeftDock,
} from '../../lib/leftDock';
import { navColumn, fitToNavColumn, ZOOM_GAP } from './navColumn';
import { watchSettled } from '../../lib/hudSettled';
// Reuse the overlay bar's chrome (.timeline-hud + accent/mapstate vars); this bar
// is the same component language, docked at the top as a curved island.
import '../TimelineHud/TimelineHud.css';
import './TopNav.css';

// The on-map mapping tool, owned here now that the Tools dropdown lives in the
// top bar (was MappingToolsHud).
export type MapTool = 'off' | 'measure' | 'slide' | 'capture';

/** How much spare room the full bar needs before a compact one switches back (px). A dock
 *  dragged slowly across the exact fit would otherwise flip the bar on every pixel; with this,
 *  it goes compact at the fit and comes back only once there is clear room again. */
const NAV_HYSTERESIS = 32;

// ── Tool-readout hint pills ───────────────────────────────────────────────────
// The secondary bar's usage hints carry {token} placeholders that render as small yellow gesture
// pills — the same .ui-tip-hotkey chip the tooltips + mission gestures use, so a gesture reads the
// same everywhere. The pills are DEVICE-AWARE, mirroring the mission-guide swap: on a pointer the
// cursor glyph + "Click" (and a magnifying glass for "Zoom"); on touch the finger glyph + "Tap"
// (and a pinch glyph for "Zoom"). "Pan"/"Drag" share the 4-way glyph on both. The {escExit} /
// {rightExit} tokens add a "· Esc / Right-click to exit" tail wrapped in .topnav-hint-exit; being a
// keyboard/mouse shortcut it's CSS-hidden on a BARE touch device (no Esc / right button, via the
// has-keyboard rule the tooltip hotkey chips use) but kept on desktop and touch-with-keyboard. A
// plugin tool's readout (a plain tokenised string) flows through the same renderer for free.
function HintKey({ children }: { children: ReactNode }) {
  return <span className="ui-tip-hotkey mg-gesture topnav-hint-key">{children}</span>;
}
function hintPill(token: string, t: TFn, touch: boolean): ReactNode | null {
  const clickIcon = touch ? (
    <TapIcon className="topnav-hint-icon" />
  ) : (
    <ClickIcon className="topnav-hint-icon" />
  );
  const clickWord = touch ? t('topNav.tools.hintKey.tap') : t('topNav.tools.hintKey.click');
  switch (token) {
    case '{click}':
      return <HintKey>{clickIcon}<span>{clickWord}</span></HintKey>;
    case '{doubleClick}':
      return (
        <HintKey>
          <span>{t('topNav.tools.hintKey.double')}</span>
          {clickIcon}
          <span>{clickWord}</span>
        </HintKey>
      );
    case '{drag}':
      return (
        <HintKey>
          <DragIcon className="topnav-hint-icon" />
          <span>{t('topNav.tools.hintKey.drag')}</span>
        </HintKey>
      );
    case '{pan}':
      return (
        <HintKey>
          <DragIcon className="topnav-hint-icon" />
          <span>{t('topNav.tools.hintKey.pan')}</span>
        </HintKey>
      );
    case '{zoom}':
      return (
        <HintKey>
          {touch ? (
            <PinchIcon className="topnav-hint-icon" />
          ) : (
            <ZoomIcon className="topnav-hint-icon" />
          )}
          <span>{t('topNav.tools.hintKey.zoom')}</span>
        </HintKey>
      );
    // Exit tails: a keyboard/mouse shortcut, so the whole clause is wrapped in .topnav-hint-exit and
    // CSS-hidden on a bare touch device (no Esc / right button) — a touch device with a keyboard
    // keeps it. Desktop always shows it.
    case '{escExit}':
      return (
        <span className="topnav-hint-exit">
          {' · '}
          <HintKey><span>{t('topNav.tools.hintKey.esc')}</span></HintKey>{' '}
          {t('topNav.tools.hintKey.toExit')}
        </span>
      );
    case '{rightExit}':
      return (
        <span className="topnav-hint-exit">
          {' · '}
          <HintKey>
            <span>{t('topNav.tools.hintKey.right')}</span>
            <ClickIcon className="topnav-hint-icon" />
            <span>{t('topNav.tools.hintKey.click')}</span>
          </HintKey>{' '}
          {t('topNav.tools.hintKey.toExit')}
        </span>
      );
    default:
      return null;
  }
}
// Render a tool readout into the shared .topnav-toolbar-hint chrome: a tokenised string becomes text
// with device-aware pills swapped in for each {token}; a ready-made node (a plugin could pass one)
// renders as-is.
function ToolHintText({ text }: { text: ReactNode }) {
  const { t } = useT();
  const touch = useTouchLayout();
  if (typeof text !== 'string') {
    return <span className="topnav-toolbar-hint">{text}</span>;
  }
  return (
    <span className="topnav-toolbar-hint">
      {text.split(/(\{\w+\})/).map((part, i) => (
        <Fragment key={i}>{hintPill(part, t, touch) ?? part}</Fragment>
      ))}
    </span>
  );
}

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
  /** Tab quick-swap feedback for the bar's switcher (null while the expanded
   *  sidebar hosts it, and when idle). */
  chartFlash: ChartQuickFlash | null;

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
  /** Slide-tool readout (elapsed time, wall clock + date, rotation angle);
   *  non-null whenever the tool is armed with a chart (Δt 0 = natal). */
  slide: SlideInfo | null;
  /** Toggle the Slide tool. Arming is refused on a geodetic map, which has no sidereal
   *  time to turn (lib/skyHold); disarming never is. (Until 2026-10-02 arming switched the
   *  line system to Celestial first.) */
  onToggleSlide: () => void;
  /** False when Slide can't run (natal linework hidden / overlay promoted) — greys the item. */
  slideEnabled: boolean;
  /** Nudge the slid instant by signed HOURS (the readout's −1h/−4m/+4m/+1h). */
  onSlideNudge?: (dHours: number) => void;
  /** Return the spin to the natal sky (the readout's ⟲). */
  onSlideReset?: () => void;
  /** Jump to the previous/next angular event (rise/culmination/set/anti-culmination
   *  of any visible body at the active point) — the readout's ⏮/⏭. */
  onSlideStep?: (dir: 1 | -1) => void;
  /** False when event stepping can't work (no visible bodies) — disables ⏮/⏭. */
  slideStepEnabled?: boolean;
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
  showSkyTimes: boolean;
  setShowSkyTimes: (v: boolean) => void;
  showLocalSpace: boolean;
  setShowLocalSpace: (v: boolean) => void;
  /** The user's plan tier (src/lib/plan.ts). Gates the menu items by tier — Slide (Tools),
   *  Sky Times + Local Space (View) and Synastry (Overlay) need 'adv' (Eclipses and every
   *  technique overlay are baseline: ADVANCED_OVERLAY_MODES in lib/astro/timeline.ts is the
   *  source of truth); downstream items need 'gated'. Each is hidden until the tier is
   *  reached, and tier-badged when shown. */
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
  /** The EFFECTIVE line system (App's derived `lineSystem`), for what a geodetic map holds
   *  (lib/skyHold). Held rows grey with settings.inert.skyHeld and stay in the menu: the
   *  Overlay menu's Primary Directions row; the Sky Times and Local Space view rows and
   *  Slide; and any tool that declares `needsSiderealTime`, which also loses its readout
   *  while held. A held view or tool that is OPEN stays clickable, to close it. Absent
   *  reads as Celestial, which holds nothing. (Replaced `mundaneOnScreen` with the switch
   *  it warned of, 2026-10-02.) */
  lineSystem?: LineSystem;
  /** The active Overlay-menu extension id (registerOverlayExtension), or null. Mutually
   *  exclusive with the core overlayMode — selecting one clears the other. */
  activeOverlayExt: string | null;
  onSelectOverlayExt: (id: string) => void;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// "40.713°N, 74.006°W" — a measure endpoint as signed-hemisphere decimals. The
// longitude is resolved to its canonical meridian first, so an endpoint picked on
// a repeated world copy reads as the real meridian, not its ±360° wrap.
function fmtLatLng(p: { lat: number; lng: number }): string {
  const lngDeg = canonicalLng(p.lng);
  const lat = `${Math.abs(p.lat).toFixed(3)}°${p.lat >= 0 ? 'N' : 'S'}`;
  const lng = `${Math.abs(lngDeg).toFixed(3)}°${lngDeg >= 0 ? 'E' : 'W'}`;
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

// "+48.2° E" — the Slide spin as a signed rotation about the pole (with hemisphere).
// De-emphasized beside the elapsed-time chip: time is what astrologers reason in.
function fmtSlideAngle(s: SlideInfo): string {
  const sign = s.thetaDeg >= 0 ? '+' : '−';
  const dir = s.thetaDeg >= 0 ? 'E' : 'W';
  return `${sign}${Math.abs(s.thetaDeg).toFixed(1)}° ${dir}`;
}

// "+3h 12m" / "−1d 4h 07m" — the slid time as a signed elapsed reading, days
// appearing past 24h. Minutes pad to two digits whenever a larger unit leads.
function fmtSlideElapsed(dtHours: number): string {
  const sign = dtHours < 0 ? '−' : '+';
  let mins = Math.round(Math.abs(dtHours) * 60);
  const d = Math.floor(mins / 1440);
  mins -= d * 1440;
  const h = Math.floor(mins / 60);
  const m = mins - h * 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  parts.push(`${parts.length > 0 ? pad2(m) : m}m`);
  return sign + parts.join(' ');
}

// A click-away popover: a trigger button plus an absolutely-positioned panel that
// closes on outside-click or Escape. Composed for each of Tools / Overlay / View.
function NavMenu({
  label,
  ariaLabel,
  active,
  className,
  disabledTip,
  tip,
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
  /** When set, the menu can't open: the trigger renders inert (aria-disabled,
   *  not `disabled` — a disabled button drops the hover events the tip needs)
   *  with this text as its hover tip explaining why. */
  disabledTip?: string;
  /** A hover tip naming the menu, for a trigger whose label has collapsed to an icon (the
   *  compact nav). Hidden while the panel is open, so it never sits over the rows. */
  tip?: string;
  // Plain content, or a render-prop given a `close()` so items can dismiss the
  // menu on selection (Tools and Overlay always; View on narrow/touch layouts).
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const {
    ref: tipRef,
    pos: tipPos,
    show: showTip,
    hide: hideTip,
  } = useHoverTip<HTMLButtonElement>('bottom');
  // A menu disabled while open snaps shut.
  useEffect(() => {
    if (disabledTip != null) setOpen(false);
  }, [disabledTip]);
  // Keep the opened panel inside the map column (navColumn.ts) — before paint, so it never
  // flashes off the edge first. The phone layout anchors its panels in CSS instead.
  useLayoutEffect(() => {
    if (open && panelRef.current && !isNarrowNav()) fitToNavColumn(panelRef.current);
  }, [open]);

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

  if (disabledTip != null) {
    return (
      <div className="navmenu" ref={ref}>
        <TipButton
          type="button"
          className={`navmenu-trigger navmenu-disabled ${className ?? ''}`}
          tip={ariaLabel ?? label}
          hint={disabledTip}
          aria-disabled="true"
          aria-label={ariaLabel}
        >
          <span>{label}</span>
          <span className="navmenu-caret">▾</span>
        </TipButton>
      </div>
    );
  }

  return (
    <div className="navmenu" ref={ref}>
      <button
        ref={tipRef}
        type="button"
        className={`navmenu-trigger ${className ?? ''} ${active ? 'active' : ''} ${open ? 'open' : ''}`}
        onClick={() => {
          setOpen((v) => !v);
          hideTip();
        }}
        onMouseEnter={tip != null && !open ? showTip : undefined}
        onMouseLeave={hideTip}
        onFocus={tip != null && !open ? showTip : undefined}
        onBlur={hideTip}
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span>{label}</span>
        <span className="navmenu-caret">▾</span>
      </button>
      {tip != null && <HoverTip pos={tipPos} placement="bottom" title={tip} />}
      {open && (
        <div ref={panelRef} className="navmenu-panel" role="menu">
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
      ) : tool === 'capture' ? (
        <>
          {/* crop frame — the Capture capture region */}
          <path d="M6 2v14a2 2 0 0 0 2 2h14" />
          <path d="M18 22V8a2 2 0 0 0-2-2H2" />
        </>
      ) : (
        /* wrench — neutral "tools" affordance */
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      )}
    </svg>
  );
}

// Overlay & View triggers show a text label on roomy viewports and collapse to an
// icon-only button on a narrow (phone-width) screen or in the compact nav — both are always
// in the DOM and CSS swaps which one shows (the `@media (max-width: 600px)` rules and
// `.topnav-compact`). Keeping both in the DOM is also what lets the layout pass measure the
// full bar's width while it shows the compact one (see TopNav's layout effect).
function NavMenuLabel({ text, icon }: { text: string; icon: ReactNode }) {
  return (
    <>
      <span className="navmenu-label-text">{text}</span>
      <span className="navmenu-label-icon" aria-hidden="true">
        {icon}
      </span>
    </>
  );
}

// Stacked sheets — the Overlay menu (synastry / eclipses / transits layered on the map).
function OverlayIcon() {
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
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </svg>
  );
}

// Eye — the View menu (what's shown on the map: coordinates, minimap, guides, info…).
function ViewIcon() {
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
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// The small tier badge on a plan-gated menu row (ADV / the gated tier) — see
// src/lib/plan.ts. It right-aligns and sits left of any hotkey key; NEW (or a gated tier
// whose downstream label is unset) renders nothing.
function TierBadge({ tier }: { tier?: PlanTier }) {
  if (!tier || tier === 'new' || !shouldShowTierBadge(tier)) return null;
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
  /** Tier-locked teaser (the user hasn't reached `tier`): suppress the shortcut (the key does
   *  nothing until they upgrade) AND route a click to the nudge action (open the account/upgrade
   *  flow) rather than the real handler. Distinct from `disabled`, which also covers a reached-
   *  but-temporarily-unavailable row whose shortcut still applies and whose click stays a no-op. */
  locked?: boolean;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>('left');
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`navmenu-item ${checked ? 'on' : ''} ${disabled && !locked ? 'disabled' : ''} ${locked ? 'locked' : ''}`}
        role="menuitemradio"
        aria-checked={checked}
        aria-disabled={(disabled && !locked) || undefined}
        onClick={() => {
          if (locked) {
            nudgeAction(); // tier-locked teaser → open the account/upgrade flow
            return;
          }
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
        gated={tier === 'gated'}
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
  note,
  unavailable,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  hotkey?: string;
  /** The plan tier this row belongs to — renders its tier badge (ADV / gated). */
  tier?: PlanTier;
  /** Greyed + click no-op'd (kept in the DOM so it's still a hoverable teaser). */
  disabled?: boolean;
  /** Tier-locked teaser (the user hasn't reached `tier`): hide the shortcut badge (the key does
   *  nothing until they upgrade — an "L" on the Local Space teaser would only mislead) AND route
   *  a click to the nudge action (open the account/upgrade flow). */
  locked?: boolean;
  /** Optional explainer. View rows normally have none, so they show NO tip; but if a row IS
   *  given a hint it surfaces on hover/focus like the other menus (with the ADV marker). */
  hint?: string;
  /** A second line under the hint (HoverTip's `note`): why the row can't be used right now,
   *  where that isn't its tier — a hold's reason (lib/skyHold). Until 2026-10-02 it carried
   *  the retired line-system switch's warning. */
  note?: string;
  /** The row can't be used right now (pair it with `disabled` and a `note`): the inline
   *  shortcut badge goes and the tip shows the grey N/A badge in place of the key, since
   *  the key is refused too. (2026-10-02) */
  unavailable?: boolean;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>('left');
  const hasTip = !!hint || !!note;
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`navmenu-item navmenu-check ${checked ? 'on' : ''} ${disabled && !locked ? 'disabled' : ''} ${locked ? 'locked' : ''}`}
        role="menuitemcheckbox"
        aria-checked={checked}
        aria-disabled={(disabled && !locked) || undefined}
        onClick={() => {
          if (locked) {
            nudgeAction(); // tier-locked teaser → open the account/upgrade flow
            return;
          }
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
        {hotkey && !locked && !unavailable && <span className="navmenu-key">{hotkey}</span>}
      </button>
      {hasTip && (
        <HoverTip
          pos={pos}
          placement="left"
          title={label}
          hint={hint}
          note={note}
          // Show the shortcut chip in the tip too (like the Tools/Overlay tips); locked teasers
          // suppress it, since their key does nothing until the tier is reached.
          hotkey={locked ? undefined : hotkey}
          advanced={tier === 'adv'}
          gated={tier === 'gated'}
          unavailable={unavailable}
        />
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
  note,
  unavailable,
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
  /** Tier-locked teaser (the user hasn't reached `tier`): suppress the shortcut (the key does
   *  nothing until they upgrade) AND route a click to the nudge action (open the account/upgrade
   *  flow). Distinct from `disabled`, which a reached tool also sets when temporarily unavailable
   *  (e.g. Slide with no natal linework) — its key still applies and its click stays a no-op. */
  locked?: boolean;
  hint?: string;
  /** A second line under the hint (HoverTip's `note`): why the tool can't be armed right
   *  now, where that isn't its tier — a hold's reason (lib/skyHold). Until 2026-10-02 it
   *  carried the retired line-system switch's warning. */
  note?: string;
  /** Held, not merely disabled: its key is refused too, so the inline shortcut badge goes
   *  and the tip shows the grey N/A badge in its place (as CheckItem). (2026-10-02) */
  unavailable?: boolean;
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
        className={`navmenu-item ${checked ? 'on' : ''} ${disabled && !locked ? 'disabled' : ''} ${locked ? 'locked' : ''}`}
        role="menuitemcheckbox"
        aria-checked={checked}
        aria-disabled={(disabled && !locked) || undefined}
        onClick={() => {
          if (locked) {
            nudgeAction(); // tier-locked teaser → open the account/upgrade flow
            return;
          }
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
        {hotkey && !locked && !unavailable && <span className="navmenu-key">{hotkey}</span>}
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
        note={note}
        hotkey={locked ? undefined : hotkey}
        advanced={tier === 'adv'}
        gated={tier === 'gated'}
        unavailable={unavailable}
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
  chartFlash,
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
  onSlideNudge,
  onSlideReset,
  onSlideStep,
  slideStepEnabled = true,
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
  showSkyTimes,
  setShowSkyTimes,
  showLocalSpace,
  setShowLocalSpace,
  planTier,
  showGuides,
  setShowGuides,
  openExtensions,
  onToggleExtension,
  openTools,
  onToggleTool,
  lineSystem = 'celestial',
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
  // A registered surface owning the viewport parks the View menu (see
  // lib/extensions/viewLock) — the trigger disables with the provider's reason.
  const viewLock = useViewLock();
  // The sky hold (lib/skyHold), on the EFFECTIVE line system: the rows below that read the
  // sky's turning grey with its one sentence on a geodetic map — never leave the menu — and
  // App's openers refuse them there, closing excepted. (2026-10-02)
  const skyHeld = skyHeldFor(lineSystem);
  const skyHeldWhy = t('settings.inert.skyHeld');
  const viewItems: {
    id: string;
    label: string;
    checked: boolean;
    onToggle: () => void;
    hotkey?: string;
    tier?: PlanTier;
    /** One-line description shown in the row's hover .ui-tip, like the Tools/Overlay menus. */
    hint?: string;
    /** Registered but not yet usable (MapExtension.unavailable): the row stays, inert,
     *  with this reason in place of its hint. Only extensions can be in this state. */
    unavailable?: string;
    /** Held by the sky hold (lib/skyHold): the reason is the tip's second line, and the
     *  row is greyed — N/A, no key — while the view is SHUT. An open held view stays a
     *  live row, so it can still be closed from here. (Replaced a free-text `note`, which
     *  carried the retired line-system switch's warning, 2026-10-02.) */
    held?: boolean;
  }[] = [
    // Built-in windows, on the digit row (1-3) and on mnemonic letters
    // (T = Teleport, S = Sky Times, L = Local Space). Badges mirror App's
    // keydown switch exactly.
    { id: 'coordinates', label: t('topNav.view.coordinates'), hint: t('topNav.view.coordinatesHint'), hotkey: '1', checked: showCoords, onToggle: () => setShowCoords(!showCoords) },
    { id: 'minimap', label: t('topNav.view.minimap'), hint: t('topNav.view.minimapHint'), hotkey: '2', checked: showChart, onToggle: () => setShowChart(!showChart) },
    { id: 'settings', label: t('topNav.view.settings'), hint: t('topNav.view.settingsHint'), hotkey: '3', checked: showSettings, onToggle: () => setShowSettings(!showSettings) },
    // (The Minor bodies window has the digit row's '4' but deliberately NO row here —
    // a product call to keep this menu short. It opens from Map filters ▸ Minor bodies ▸
    // More, which carries the key pill, and from the key itself; see App's showMinorHud.)
    { id: 'teleport', label: t('topNav.view.teleport'), hint: t('topNav.view.teleportHint'), hotkey: 'T', checked: showTeleport, onToggle: () => setShowTeleport(!showTeleport) },
    { id: 'skyTimes', label: t('topNav.view.skyTimes'), hint: t('topNav.view.skyTimesHint'), hotkey: 'S', tier: 'adv', checked: showSkyTimes, onToggle: () => setShowSkyTimes(!showSkyTimes), held: skyHeld },
    { id: 'localSpace', label: t('topNav.view.localSpace'), hint: t('topNav.view.localSpaceHint'), hotkey: 'L', tier: 'adv', checked: showLocalSpace, onToggle: () => setShowLocalSpace(!showLocalSpace), held: skyHeld },
    { id: 'guides', label: t('topNav.view.guides'), hint: t('topNav.view.guidesHint'), checked: showGuides, onToggle: () => setShowGuides(!showGuides) },
    { id: 'info', label: t('topNav.view.info'), hint: t('topNav.view.infoHint'), checked: showInfo, onToggle: () => setShowInfo(!showInfo) },
    ...getMapExtensions()
      // Only 'view'-surface extensions get a View-menu row; 'timeline-drawer'
      // ones toggle from the time-overlay bar's display drawer instead.
      .filter((ext) => (ext.surface ?? 'view') === 'view')
      .map((ext) => ({
        id: ext.id,
        label: ext.label,
        hotkey: ext.hotkey,
        // An add-on carries its own description (MapExtension.hint); undefined ones just
        // show no tip, as before.
        hint: ext.hint,
        tier: tierOfEntitlement(ext.tier),
        checked: openExtensions.has(ext.id),
        unavailable: ext.unavailable,
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
    // A registered extension may claim a built-in row to host it inside its own
    // surface (lib/extensions/viewRowClaims) — a claimed row leaves the menu.
    .filter((i) => !isViewRowClaimed(i.id))
    // A row above the user's tier survives only as an upgrade teaser — which an
    // unavailable feature must never be, since upgrading wouldn't produce it. So an
    // unavailable row shows to those who could already use it, and to nobody else.
    .filter(
      (i) =>
        tierMet(planTier, i.tier ?? 'new') ||
        (!i.unavailable && shouldShowNudge(i.tier ?? 'new')),
    );

  const measuring = tool === 'measure';
  const sliding = tool === 'slide';
  // Slide held (reached tier only — a locked teaser says nothing about opening): greyed
  // while shut; armed, it would still disarm from its row. (2026-10-02)
  const slideHeld = skyHeld && tierMet(planTier, 'adv') && !sliding;
  const framing = tool === 'capture';
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

  // The nav's layout pass — four jobs, one measurement, because each feeds the next:
  //
  //  1. FULL OR COMPACT. The labelled bar is content-sized (≈577 px with a typical name), and a
  //     docked panel can leave a map column narrower than that — 420 px beside the Reports dock
  //     at its default 860 on a 1280 screen. So the bar measures the room it actually has (the
  //     column between the widest left dock and the zoom control, less its gutters; navColumn.ts)
  //     against its own NATURAL width, and switches to the compact variant (TopNav.css
  //     `.topnav-compact`: icon menus, initials over the year) when the full one won't fit. By
  //     measurement, not a media query: the same window is roomy with the dock closed and cramped
  //     with it open, and the dock's width is the reader's to drag. The natural width is measured
  //     even while compact, by lifting the class for one synchronous read — every compact form is
  //     a CSS twin of its full form (NavMenuLabel, ChartSwitcher), so lifting the class IS the full
  //     bar, and the browser never paints the in-between. Hysteresis (NAV_HYSTERESIS) so a dock
  //     dragged across the boundary doesn't flap the bar on every pixel.
  //  2. PILL RECENTRING. The row hugs its content, so with a wider left side (the chart name) the
  //     status pill would sit off-centre; the bar shifts by half the left/right difference (grid
  //     gaps cancel out), as far as the column has room for — never into the zoom corner. Not while the sidebar is expanded (that layout is left-anchored), not on
  //     the phone layout (it spans the viewport — the shift would push it off-screen), and not
  //     when compact (its row can wrap, and then there is no left/right to balance).
  //  3. PLACEMENT. The stylesheet's formula (TopNav.css) centres the stack on the map column; it
  //     stays in charge wherever the bar fits there, which is every roomy layout. Only when one of
  //     the bar's ends would cross the column — under the dock or sidebar on the left, into the
  //     zoom control on the right — does this pass override it (`--topnav-left`), because only
  //     here are the bar's real width, its pill nudge and the readout under it all known. The
  //     left bound wins if both bind: the chart name and status pill stay visible, and the zoom
  //     control drops below the bar instead (Map.css reads `--topnav-right`/`--topnav-bottom`).
  //  4. PUBLISH what other chrome reads: `--topnav-width` (the bottom overlay bars size to it ×2
  //     on touch — TimelineHud/EclipseHud CSS), `--topnav-right` and `--topnav-bottom` (the zoom
  //     control's drop), and, on the stack, `--topnav-room` / `--topnav-col` (how wide the readout
  //     bar and the dropdowns may grow).
  const narrow = useNarrowNav();
  const stackRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  // Content that changes the bar's NATURAL width without necessarily resizing anything while the
  // bar is compact (the full name is display:none then): re-measure when it changes.
  const discreetOn = useIdentity().on;
  // Where the nav last came to rest, as announced to the map (watchSettled below). Outlives the
  // layout effect's re-runs, so a full↔compact flip that leaves the bar where it was says nothing.
  const navSettledRef = useRef('');
  useLayoutEffect(() => {
    const stack = stackRef.current;
    const bar = barRef.current;
    if (!stack || !bar) return;
    const row = bar.querySelector<HTMLElement>('.topnav-row');
    const left = bar.querySelector<HTMLElement>('.topnav-left');
    const center = bar.querySelector<HTMLElement>('.topnav-center');
    const right = bar.querySelector<HTMLElement>('.topnav-right');
    if (!row || !left || !center || !right) return;
    const root = document.documentElement;
    const setVar = (el: HTMLElement, name: string, value: string | null) => {
      // Only on change: navWatch (Pro) and others observe these style attributes.
      if (el.style.getPropertyValue(name) === (value ?? '')) return;
      if (value == null) el.style.removeProperty(name);
      else el.style.setProperty(name, value);
    };
    const layout = () => {
      // 1. Natural width — with the compact class lifted for this one read if it's on.
      const isCompact = stack.classList.contains('topnav-compact');
      if (isCompact) stack.classList.remove('topnav-compact');
      const fullW = bar.offsetWidth;
      if (isCompact) stack.classList.add('topnav-compact');

      if (narrow) {
        // The phone layout: full width, media-query driven, nothing measured — and no claim on
        // the docks' width (the bar spans the screen here, not a column).
        if (isCompact) setCompact(false);
        publishMapColumnNeed(0);
        bar.style.transform = '';
        setVar(stack, '--topnav-left', null);
        setVar(stack, '--topnav-room', null);
        setVar(stack, '--topnav-col', null);
        const sr = stack.getBoundingClientRect();
        setVar(root, '--topnav-width', `${bar.offsetWidth}px`);
        setVar(root, '--topnav-right', `${Math.round(sr.right)}px`);
        setVar(root, '--topnav-bottom', `${Math.round(sr.bottom)}px`);
        return;
      }

      const col = navColumn();

      // 1b. The compact bar's ONE-ROW width, published as the column no dock may take
      // (leftDock.ts publishMapColumnNeed; the Reports dock and the expanded sidebar cap their
      // width by it). It is what keeps this bar on one row however far a dock is dragged —
      // Salvatore, 1 Oct: "it should stay on one row" — and the cap is measured, not a number in
      // the docks, because this width moves with the chart's initials and year, the language and
      // the font. Read in whatever form the bar is in now: the class goes on for one synchronous
      // read if it's off (the step-1 trick in reverse; the browser never paints it), and
      // `chart-expanded` comes off for the same read if the sidebar has hidden the name. With
      // the name INCLUDED even then, so the figure doesn't move as the sidebar opens and closes
      // — a dock changing width because a different panel opened is a move nobody could
      // attribute. It does still follow the chart itself (and Discreet, and the language): a
      // dock held at the cap moves when the reader switches to a chart with wider initials —
      // measured 2 px, EM → WM — on a gesture of their own, against a bar that would otherwise
      // wrap for that chart. Summed from the row's parts, not read off the bar: the compact bar
      // is capped at --topnav-room and may be wrapped right now. Fractional widths, rounded up
      // on publish, so a column that fits exactly never wraps on a sub-pixel.
      if (bar.offsetWidth > 0) {
        const hidName = stack.classList.contains('chart-expanded');
        if (!isCompact) stack.classList.add('topnav-compact');
        if (hidName) stack.classList.remove('chart-expanded');
        const rs = getComputedStyle(row);
        const g = parseFloat(rs.columnGap) || 0;
        const chrome =
          parseFloat(rs.paddingLeft) + parseFloat(rs.paddingRight) + (bar.offsetWidth - bar.clientWidth);
        const w = (el: HTMLElement) => el.getBoundingClientRect().width;
        const oneRowW = w(left) + g + w(center) + g + w(right) + chrome;
        if (hidName) stack.classList.add('chart-expanded');
        if (!isCompact) stack.classList.remove('topnav-compact');
        // In from the screen's right edge: the zoom control and its gutter, the gap the bar
        // keeps from it, the bar, and the bar's own gutter from the dock.
        publishMapColumnNeed(col.right - col.zoomLeft + ZOOM_GAP + oneRowW + col.edge);
      }

      const room = col.zoomLeft - ZOOM_GAP - (col.left + col.edge);
      const wantCompact = isCompact ? fullW + NAV_HYSTERESIS > room : fullW > room;
      if (wantCompact !== isCompact) {
        // The class flips on the re-render; this effect depends on `compact`, so it runs again
        // then — before paint — and places the bar in its new form.
        setCompact(wantCompact);
        return;
      }
      // How wide the bar may grow (the compact row wraps at this; the readout bar is capped by it
      // too): the room beside the zoom control — but never narrower than the compact bar's
      // TWO-row form, the name and status pill over the three menus. Below that the row would
      // break into three or four rows to keep clear of a control that can simply step down
      // instead (Map.css drops it under the nav whenever --topnav-right reaches it). Since the
      // docks cap themselves by step 1b's figure, the row only wraps where a dock's own minimum
      // outranks that cap: a window under ~963 px beside the Reports dock (its 560 + ~403 of
      // nav and zoom corner). Never wider than the column itself, though — off the screen is
      // worse than tall.
      const colW = col.right - col.left - 2 * col.edge;
      let cap = room;
      if (isCompact) {
        const rs = getComputedStyle(row);
        const g = parseFloat(rs.columnGap) || 0;
        const chrome =
          parseFloat(rs.paddingLeft) + parseFloat(rs.paddingRight) + (bar.offsetWidth - bar.clientWidth);
        const twoRow =
          Math.max(left.offsetWidth + g + center.offsetWidth, right.offsetWidth) + chrome;
        cap = Math.min(colW, Math.max(room, Math.ceil(twoRow)));
      }
      setVar(stack, '--topnav-room', `${Math.max(0, Math.floor(cap))}px`);
      setVar(stack, '--topnav-col', `${Math.max(0, Math.floor(colW))}px`);

      // 2. Pill recentring. Cosmetic, so it takes only the room the bar leaves: the nudge widens
      // the extent placement has to fit (the stack's width, then |d| beyond it), and step 1
      // compared the bar's width alone — so a bar that fits with up to |d| to spare (and |d|
      // runs to ~35 px with a long name) would otherwise be pushed into the zoom corner by its
      // own centring, dropping the control under a nav that fits. Capped, the pill sits a little
      // off-centre in a tight column instead. (Offsets don't see the transform, so the widths
      // read here are the unshifted ones whether or not a nudge is on.)
      const bW = bar.offsetWidth;
      const sW = stack.offsetWidth;
      let d = 0;
      if (!chartExpanded && !isCompact) {
        d = (right.getBoundingClientRect().width - left.getBoundingClientRect().width) / 2;
        // Within the stack's own slack (a wider readout bar) the nudge widens nothing.
        const spare = Math.max(0, (sW - bW) / 2, room - (sW + bW) / 2);
        if (Math.abs(d) > spare) d = Math.sign(d) * spare;
      }
      bar.style.transform = d ? `translateX(${d}px)` : '';

      // 3. Placement. `left` is the stack's centre (translateX(-50%)), in its containing block's
      // coordinates; the column bounds are viewport x. The stack is as wide as its widest bar,
      // the main bar centred in it and then nudged by d, the readout bar centred and not.
      const cb = (stack.offsetParent as HTMLElement | null)?.getBoundingClientRect();
      const cbLeft = cb?.left ?? 0;
      const cbWidth = cb?.width ?? window.innerWidth;
      const c0 = cbLeft + cbWidth / 2 + col.left / 4 + getReservedLeftInset() / 4;
      const halfL = Math.max(sW / 2, bW / 2 - d);
      const halfR = Math.max(sW / 2, bW / 2 + d);
      const lo = col.left + col.edge + halfL;
      const hi = col.zoomLeft - ZOOM_GAP - halfR;
      const cx = Math.max(lo, Math.min(c0, hi));
      setVar(stack, '--topnav-left', Math.abs(cx - c0) < 0.5 ? null : `${Math.round(cx - cbLeft)}px`);

      // 4. Publish. The target position, not the mid-transition one: the stack eases `left`
      // over 0.32s and the zoom control eases its drop over the same curve.
      setVar(root, '--topnav-width', `${bW}px`);
      setVar(root, '--topnav-right', `${Math.round(cx + halfR)}px`);
      setVar(root, '--topnav-bottom', `${Math.round(stack.getBoundingClientRect().bottom)}px`);
    };
    // After every pass: TELL THE MAP once the nav has come to rest somewhere new — a re-centre
    // (`--topnav-left` or the CSS formula, eased over 0.32 s), the pill nudge (0.2 s), a
    // full↔compact flip, a readout bar appearing under it. The map dodges its edge labels off
    // this bar's rect, cached until `astro:hud-moved`, and nothing that moves the bar here
    // dispatched it, so opening a dock left labels under the compacted bar until the next pan
    // (video-QA #29). After the transition, not during it; once per resting place
    // (lib/hudSettled), which is also why a re-dodge can't bring it back round in a loop.
    //
    // The readout bar under it is measured too (it carries `.timeline-hud`, so the labels dodge
    // it), and needs its own observer: it changes width with its text — the place name under the
    // pointer, a tool's live readout — and while it is narrower than the bar that resizes neither
    // the bar nor the stack, so nothing above heard of it and labels sat under a widened readout
    // until the next pan (QA, 2026-10-01: 1–5 MC/IC chips at 10 of 14 spots, no dispatch). Its
    // resize only asks for a look, not a layout pass: nothing step 1 measures depends on it until
    // it outgrows the bar, and then the stack's own resize runs one.
    const readoutOf = () => stack.querySelectorAll<HTMLElement>(':scope > .topnav-toolbar');
    const settled = watchSettled([stack, bar], ['left', 'transform'], navSettledRef, readoutOf);
    const readoutRo = new ResizeObserver(() => settled.check());
    let readout: HTMLElement | null = null;
    const pass = () => {
      layout();
      // It mounts and unmounts with what it shows, and either one resizes the stack (it sits
      // under the bar), which runs this pass — the moment to follow it to its new element.
      const now = readoutOf()[0] ?? null;
      if (now !== readout) {
        if (readout) readoutRo.unobserve(readout);
        readout = now;
        if (now) readoutRo.observe(now);
      }
      settled.check();
    };
    pass();
    // What changes the room or the bar: the window, a dock opening/closing/being dragged (either
    // kind — subscribeLeftDock fires for both), and the bar or the readout under it resizing
    // (a name change, a tool's readout appearing). A resize the layout itself causes settles on
    // the next pass: the natural width it measures doesn't change with the mode.
    //
    // The window and the dock registry are read once a frame, not per event: a docked panel that
    // republishes from an effect retires itself in the cleanup first, so a listener called on
    // every event sees the dock gone for an instant on each step of a drag — which flipped the
    // bar to full and back at every pixel, hysteresis or not. (ReportsPanel no longer does this;
    // the expanded sidebar still does, and so may the next panel.) By the frame, the registry
    // holds what the panel meant. The ResizeObserver already reports once a frame.
    let raf = 0;
    const schedule = () => {
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          pass();
        });
      }
    };
    const ro = new ResizeObserver(pass);
    ro.observe(left);
    ro.observe(right);
    ro.observe(bar);
    ro.observe(stack);
    window.addEventListener('resize', schedule);
    const unsubDock = subscribeLeftDock(schedule);
    return () => {
      ro.disconnect();
      readoutRo.disconnect();
      window.removeEventListener('resize', schedule);
      unsubDock();
      cancelAnimationFrame(raf);
      settled.dispose();
    };
  }, [chartExpanded, narrow, compact, current, discreetOn, t]);
  // Withdraw the docks' cap on unmount only — not in the layout effect's cleanup, which runs before
  // every re-run and would read to a dock as the nav vanishing for an instant (the flap that split
  // ReportsPanel's publish/retire into two effects; seam L78).
  useEffect(() => () => publishMapColumnNeed(0), []);

  // The single active tool EXTENSION, if any. Tools are mutually exclusive (App enforces it), so at
  // most one is open — it drives the Tools trigger's pulse AND its icon, so a plugin tool shows its
  // glyph like a built-in. Generic: no per-tool wiring, auto-covers any future tool extension.
  const openToolExt = getToolExtensions().find((ext) => openTools.has(ext.id));
  // A tool extension can also fill the secondary readout bar (below) with a usage hint / live
  // readout — the same slot the built-in tools use. Null when none is open or it provides none.
  // Null too while the open tool is HELD (it declares `needsSiderealTime` and the map is
  // geodetic): App draws a held card in its place and never renders the tool, so its readout
  // would be coaching for a view that isn't there (lib/skyHold, 2026-10-02).
  const extReadout =
    openToolExt && !(openToolExt.needsSiderealTime && skyHeld)
      ? (openToolExt.readout ?? null)
      : null;

  // One-shot flourish on the centre status pill when a downstream action completes on
  // the placed pin (lib/extensions/pinAdornment celebratePin) — diffed against the
  // mount value so a bar mounting mid-session never celebrates history.
  const pinCelebrations = usePinCelebrations();
  const [statusCelebrating, setStatusCelebrating] = useState(false);
  const celebratedRef = useRef(pinCelebrations);
  useEffect(() => {
    if (celebratedRef.current === pinCelebrations) return;
    celebratedRef.current = pinCelebrations;
    setStatusCelebrating(true);
    const timer = window.setTimeout(() => setStatusCelebrating(false), 850);
    return () => window.clearTimeout(timer);
  }, [pinCelebrations]);

  return (
    <div
      ref={stackRef}
      className={`topnav-stack${chartExpanded ? ' chart-expanded' : ''}${compact ? ' topnav-compact' : ''}`}
    >
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
                flash={chartFlash}
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
                className={`topnav-status pinned${statusCelebrating ? ' celebrate' : ''}`}
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
              // The trigger shows the armed built-in tool's icon, else the open tool extension's own
              // icon (a registered tool's own), else the neutral wrench — so it swaps to the active tool
              // like the built-ins do. And it pulses while any tool (built-in or extension) is active.
              label={
                tool !== 'off' ? (
                  <ToolMenuIcon tool={tool} />
                ) : (
                  (openToolExt?.icon ?? <ToolMenuIcon tool="off" />)
                )
              }
              ariaLabel={t('topNav.tools.menuLabel')}
              // Compact: every trigger is an icon, so each names itself on hover. (Tools is an
              // icon in the full bar too, but there it sits beside two labelled menus.)
              tip={compact ? t('topNav.tools.menuLabel') : undefined}
              active={tool !== 'off' || !!openToolExt}
              className="topnav-tool navmenu-mapstate"
            >
              {(close) => (
                <>
                  {/* Capture — first in the menu. Ungated (available to everyone,
                      like Measure): frames the map view and exports a PNG client-side. */}
                  <ToolItem
                    label={t('topNav.tools.captureItem')}
                    icon={<ToolMenuIcon tool="capture" />}
                    hint={t('topNav.tools.captureHint')}
                    hotkey="C"
                    checked={framing}
                    onToggle={() => {
                      setTool(framing ? 'off' : 'capture');
                      close();
                    }}
                  />
                  <ToolItem
                    label={t('topNav.tools.measureItem')}
                    icon={<ToolMenuIcon tool="measure" />}
                    hint={t('topNav.tools.measureHint')}
                    hotkey="M"
                    checked={measuring}
                    onToggle={() => {
                      setTool(measuring ? 'off' : 'measure');
                      close();
                    }}
                  />
                  {/* Slide needs the 'adv' tier: hidden below it (or a disabled teaser if the
                      build nudges), tier-badged at/above it. When un-reached it's greyed; once
                      reached it disables when Slide can't run (no natal linework), and is HELD
                      on a geodetic map, which has no sidereal time to turn: greyed with the sky
                      sentence, its key refused (App's armSlide). Disarming is never held, and
                      App disarms it as the map turns geodetic anyway. (2026-10-02) */}
                  {(tierMet(planTier, 'adv') || shouldShowNudge('adv')) && (
                    <ToolItem
                      label={t('topNav.tools.slideItem')}
                      icon={<ToolMenuIcon tool="slide" />}
                      hint={
                        slideEnabled
                          ? t('topNav.tools.slideHint')
                          : t('topNav.tools.slideUnavailable')
                      }
                      note={slideHeld ? skyHeldWhy : undefined}
                      unavailable={slideHeld}
                      hotkey="E"
                      tier="adv"
                      checked={sliding}
                      disabled={!tierMet(planTier, 'adv') || !slideEnabled || slideHeld}
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
                      tier — no teaser. A tool that declares `needsSiderealTime` is held on
                      a geodetic map like Slide: greyed with the sky sentence while shut,
                      a live row while open so it can be closed (App draws a held card in
                      its place meanwhile). (2026-10-02) */}
                  {getToolExtensions()
                    .filter((ext) => {
                      const req = tierOfEntitlement(ext.tier);
                      return tierMet(planTier, req) || shouldShowNudge(req);
                    })
                    .map((ext) => {
                      const req = tierOfEntitlement(ext.tier);
                      const reached = tierMet(planTier, req);
                      const open = openTools.has(ext.id);
                      const held = reached && !!ext.needsSiderealTime && skyHeld;
                      return (
                        <ToolItem
                          key={ext.id}
                          label={ext.label}
                          icon={ext.icon}
                          hint={ext.hint}
                          note={held ? skyHeldWhy : undefined}
                          unavailable={held && !open}
                          hotkey={ext.hotkey}
                          tier={req}
                          disabled={!reached || (held && !open)}
                          locked={!reached}
                          checked={open}
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

            <NavMenu
              label={<NavMenuLabel text={t('topNav.overlay.menuLabel')} icon={<OverlayIcon />} />}
              ariaLabel={t('topNav.overlay.menuLabel')}
              tip={compact ? t('topNav.overlay.menuLabel') : undefined}
              active={overlayActive}
              className="navmenu-mapstate"
            >
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
                  {/* Synastry needs the 'adv' tier: filtered out below it (or a disabled
                      teaser if the build nudges), tier-badged at/above it (see ADVANCED_OVERLAY_MODES). */}
                  {OVERLAY_MODES.filter((mode) => {
                    // Overlays a viewport owner can't carry HIDE while one holds the
                    // lock — a visible row would only offer a dead selection (the 'o'
                    // cycle skips them too; see VIEW_LOCK_PARKED_OVERLAYS).
                    if (viewLock != null && VIEW_LOCK_PARKED_OVERLAYS.has(mode)) return false;
                    const req = ADVANCED_OVERLAY_MODES.has(mode) ? 'adv' : 'new';
                    return tierMet(planTier, req) || shouldShowNudge(req);
                  }).map((mode) => {
                    const advMode = ADVANCED_OVERLAY_MODES.has(mode);
                    // Some charts can't carry every technique — a composite has no real
                    // moment to progress/direct (Q11), an unknown-birth-time chart has no
                    // natal moment to advance, and a Davison is already a two-person
                    // chart. The row stays VISIBLE and says which of those it is: a
                    // technique that vanishes from the menu takes its explanation with
                    // it, and the reader is left wondering what they did. Same predicate
                    // as the 'o' cycle and the effective overlay mode, so all three agree.
                    const block = overlayBlockFor(current, lineSystem)(mode);
                    const tierLocked = advMode && !tierMet(planTier, 'adv');
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
                        // A geodetic hold says the one sky sentence every held control
                        // says (lib/skyHold), not a technique-specific line. (2026-10-02)
                        hint={
                          block === 'geodetic'
                            ? t('settings.inert.skyHeld')
                            : block
                              ? t(`topNav.overlay.blocked.${block}`)
                              : t(`topNav.overlay.modes.${mode}.desc`)
                        }
                        hotkey={<CycleHotkey label="O" />}
                        tier={advMode ? 'adv' : undefined}
                        // A tier lock is a teaser (clicking opens the upgrade flow); a
                        // chart block is simply not applicable, so it disables WITHOUT
                        // locking — there is nothing to buy that would make it work.
                        disabled={tierLocked || block != null}
                        locked={tierLocked}
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

            <NavMenu
              label={<NavMenuLabel text={t('topNav.view.menuLabel')} icon={<ViewIcon />} />}
              ariaLabel={t('topNav.view.menuLabel')}
              tip={compact ? t('topNav.view.menuLabel') : undefined}
              className="navmenu-steady"
              // While a registered surface owns the viewport its windows are
              // parked — the whole menu disables, with the provider's reason as
              // the tip (Settings stays reachable via its own hotkey).
              disabledTip={viewLock?.reason}
            >
              {/* Built-ins + add-on extensions, hotkey items first then hotkey-less
                  ones (see orderedViewItems).
                  On a phone-width or touch layout a row also CLOSES the menu as it
                  toggles: there the window it opens can land on the still-open panel
                  (windows layer above the nav — TopNav.css — so the panel's other rows
                  stuck out around the window's edges), and closing a menu takes a
                  second tap on the map, not a flick of the pointer away. A desktop keeps
                  the menu open, so several views can be flipped in one visit. */}
              {(close) =>
                orderedViewItems.map((it) => {
                  const reached = tierMet(planTier, it.tier ?? 'new');
                  // Held (lib/skyHold): the reason rides as the note whether the view is
                  // open or shut — an open one shows the reason in place of its content,
                  // and the row says why. Greyed only while SHUT: the key is refused
                  // then, but closing never is. A locked teaser opens nothing (its click
                  // is the upgrade nudge), so it says nothing about being held. (2026-10-02)
                  const held = !!it.held && reached && !it.unavailable;
                  const heldShut = held && !it.checked;
                  return (
                    <CheckItem
                      key={it.id}
                      label={it.label}
                      // Unavailable: the reason stands in for the description, the row
                      // can't read as checked (nothing is running), the shortcut chip
                      // goes (the key is released), and the click is a no-op — never a
                      // nudge, which would be selling an unfinished feature.
                      hint={it.unavailable ?? it.hint}
                      note={held ? skyHeldWhy : undefined}
                      hotkey={it.unavailable ? undefined : it.hotkey}
                      unavailable={heldShut}
                      checked={it.checked && !it.unavailable}
                      tier={it.tier}
                      disabled={!!it.unavailable || !reached || heldShut}
                      locked={!it.unavailable && !reached}
                      onToggle={() => {
                        it.onToggle();
                        if (narrow || touch) close();
                      }}
                    />
                  );
                })
              }
            </NavMenu>
          </div>
        </div>
      </div>

      {/* Secondary bar: the active tool's readout while a tool is on, otherwise
          the place name under the active map point (pin/hover), falling back to
          the chart's birth location. One reused island. The place name is hidden
          here while the Coordinates view is open — it moves into that window
          instead — but the measure readout always shows. */}
      {(measuring || sliding || framing || extReadout || (locationLabel && !showCoords)) && (
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
                <ToolHintText text={t('topNav.tools.toolbarHint')} />
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
              // The Slide control cluster: event steps ⏮/⏭ on the outside,
              // −1h/−4m/+4m/+1h nudges inward, the readout (elapsed · clock ·
              // date · angle) in the centre — or the usage hint while still at
              // the natal moment — and ⟲ back to natal on the far right.
              <div className="topnav-slide">
                <span className="topnav-dot" />
                <TipButton
                  type="button"
                  className="topnav-slide-btn"
                  placement="bottom"
                  onClick={() => onSlideStep?.(-1)}
                  disabled={!slideStepEnabled}
                  tip={t('topNav.tools.slidePrevEvent')}
                >
                  ⏮
                </TipButton>
                <TipButton
                  type="button"
                  className="topnav-slide-btn"
                  placement="bottom"
                  onClick={() => onSlideNudge?.(-1)}
                  tip={t('topNav.tools.slideNudgeBack1h')}
                  hotkey="Shift ←"
                >
                  −1h
                </TipButton>
                <TipButton
                  type="button"
                  className="topnav-slide-btn"
                  placement="bottom"
                  onClick={() => onSlideNudge?.(-4 / 60)}
                  tip={t('topNav.tools.slideNudgeBack4m')}
                  hotkey="←"
                >
                  −4m
                </TipButton>
                {slide.dtHours === 0 ? (
                  <ToolHintText text={t('topNav.tools.slideToolbarHint')} />
                ) : (
                  <>
                    <TipSpan
                      className="topnav-slide-chip"
                      placement="bottom"
                      tip={t('topNav.tools.slideElapsedTip')}
                    >
                      {fmtSlideElapsed(slide.dtHours)}
                    </TipSpan>
                    <TipSpan
                      className="topnav-slide-clock"
                      placement="bottom"
                      tip={t('topNav.tools.slideClockTip')}
                    >
                      {slide.clock} · {slide.date}
                    </TipSpan>
                    <TipSpan
                      className="topnav-slide-angle"
                      placement="bottom"
                      tip={t('topNav.tools.slideAngleTip')}
                    >
                      {fmtSlideAngle(slide)}
                    </TipSpan>
                  </>
                )}
                <TipButton
                  type="button"
                  className="topnav-slide-btn"
                  placement="bottom"
                  onClick={() => onSlideNudge?.(4 / 60)}
                  tip={t('topNav.tools.slideNudgeFwd4m')}
                  hotkey="→"
                >
                  +4m
                </TipButton>
                <TipButton
                  type="button"
                  className="topnav-slide-btn"
                  placement="bottom"
                  onClick={() => onSlideNudge?.(1)}
                  tip={t('topNav.tools.slideNudgeFwd1h')}
                  hotkey="Shift →"
                >
                  +1h
                </TipButton>
                <TipButton
                  type="button"
                  className="topnav-slide-btn"
                  placement="bottom"
                  onClick={() => onSlideStep?.(1)}
                  disabled={!slideStepEnabled}
                  tip={t('topNav.tools.slideNextEvent')}
                >
                  ⏭
                </TipButton>
                <TipButton
                  type="button"
                  className="topnav-slide-btn"
                  placement="bottom"
                  onClick={() => onSlideReset?.()}
                  disabled={slide.dtHours === 0}
                  tip={t('topNav.tools.slideReset')}
                >
                  ⟲
                </TipButton>
              </div>
            ) : (
              <ToolHintText text={t('topNav.tools.slideToolbarHint')} />
            )
          ) : framing ? (
            <ToolHintText text={t('topNav.tools.captureToolbarHint')} />
          ) : extReadout ? (
            <ToolHintText text={extReadout} />
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
