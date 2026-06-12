// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ASTEROID_NAMES,
  NODE_NAMES,
  PLANET_COLORS,
  TRADITIONAL_PLANETS,
  type CoordSystem,
  type HouseSystem,
  type LineSystem,
  type NodeType,
  type PlanetName,
} from '../../lib/ephemeris';
import type { LineType } from '../../lib/astro/lines';
import type {
  AngleProgression,
  OverlayMode,
  PrimaryRate,
  RelationshipMethod,
  TransitFrame,
} from '../../lib/astro/timeline';
import { THEMES, type Theme } from '../../lib/theme';
import type { EclipseDetails } from '../../lib/astro/eclipses';
import type { EclipseIsoStep } from '../../lib/overlayPrefs';
import type { MapProjectionMode } from '../../lib/projection';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import { SIGN_GLYPHS } from '../../lib/astro/glyphChars';
import { TipButton } from '../ui/HoverTip';
import { glyphify } from '../ui/glyphify';
import { useT, LANGUAGES } from '../../i18n';
import type { Locale } from '../../i18n';
import './Sidebar.css';

// The "Planets" filter group: the ten bodies + the two lunar nodes. Asteroids get
// their own section (and their own independent show/hide-all). The per-body display
// name + one-line theme now resolve from the catalog (planets.* via labels.*).
const PLANET_FILTERS: PlanetName[] = [...TRADITIONAL_PLANETS, ...NODE_NAMES];

interface SidebarProps {
  visiblePlanets: Set<PlanetName>;
  togglePlanet: (p: PlanetName) => void;
  setAllPlanets: (bodies: PlanetName[], visible: boolean) => void;
  visibleLineTypes: Set<LineType>;
  toggleLineType: (t: LineType) => void;
  setAllLineTypes: (visible: boolean) => void;
  showParans: boolean;
  setShowParans: (v: boolean) => void;
  showLocalSpace: boolean;
  setShowLocalSpace: (v: boolean) => void;
  showAspectLines: boolean;
  setShowAspectLines: (v: boolean) => void;
  showMidpointLines: boolean;
  setShowMidpointLines: (v: boolean) => void;
  lineSystem: LineSystem;
  setLineSystem: (s: LineSystem) => void;
  coordSystem: CoordSystem;
  setCoordSystem: (c: CoordSystem) => void;
  houseSystem: HouseSystem;
  setHouseSystem: (h: HouseSystem) => void;
  nodeType: NodeType;
  setNodeType: (n: NodeType) => void;
  overlayMode: OverlayMode;
  transitFrame: TransitFrame;
  setTransitFrame: (f: TransitFrame) => void;
  synastryMethod: RelationshipMethod;
  setSynastryMethod: (m: RelationshipMethod) => void;
  onGenerateRelationship: () => void;
  canGenerateRelationship: boolean;
  /** The selected eclipse's details panel data (null outside eclipses mode). */
  eclipseDetails: EclipseDetails | null;
  showEclipseNatalLines: boolean;
  setShowEclipseNatalLines: (v: boolean) => void;
  /** Eclipse Chart Lines toggle wiring — currently UI-gated (no button shown;
   *  see the Display section comment), but kept in the contract so App's
   *  state/persistence and the Map rendering stay exercised. */
  showEclipseChartLines: boolean;
  setShowEclipseChartLines: (v: boolean) => void;
  eclipseIsoStep: EclipseIsoStep;
  setEclipseIsoStep: (s: EclipseIsoStep) => void;
  showTimeline: boolean;
  setShowTimeline: (v: boolean) => void;
  showOverlayZenith: boolean;
  setShowOverlayZenith: (v: boolean) => void;
  showNatal: boolean;
  setShowNatal: (v: boolean) => void;
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
  /** Which accordion section is open (owned by App), and its setter. */
  openSection: SidebarSection | null;
  setOpenSection: (s: SidebarSection | null) => void;
}

// Angle codes (As/Ds/MC/IC) are language-neutral button labels; the spelled-out
// tooltip resolves from the catalog (settings.lineType.*.hint via labels.lineTypeHint).
const LINE_TYPES: { type: LineType; label: string }[] = [
  { type: 'MC', label: 'MC' },
  { type: 'IC', label: 'IC' },
  { type: 'ASC', label: 'As' },
  { type: 'DSC', label: 'Ds' },
];

// The Shift+click affordance shown as the hotkey tag on each planet / line filter
// tip: "Shift" + a cursor/tap glyph. Shift+click toggles every item in the group at
// once (show vs hide follows the hovered one's state — the user infers it).
function ShiftTapTag() {
  const { t } = useT();
  return (
    <span className="shift-tap-tag">
      {t('settings.shiftTag')}
      <svg
        className="shift-tap-icon"
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
      </svg>
    </span>
  );
}

// Option VALUES only; each control resolves its label + hint from the shared
// settings.* catalog (via makeEnumLabels), the same maps the InfoBar chip reads. The
// arrays preserve display order. Proper-noun house eponyms stay verbatim in the catalog.
const COORD_SYSTEM_VALUES: CoordSystem[] = ['mundo', 'zodiaco'];

const LINE_SYSTEM_VALUES: LineSystem[] = ['celestial', 'geodetic'];

const PROJECTION_VALUES: MapProjectionMode[] = ['2d', '3d'];

const HOUSE_SYSTEM_VALUES: HouseSystem[] = [
  'placidus', 'koch', 'regiomontanus', 'campanus', 'porphyry', 'alcabitus', 'whole', 'equal',
];

const NODE_TYPE_VALUES: NodeType[] = ['true', 'mean'];

const POSITIONING_VALUES: TransitFrame[] = ['relative-to-natal', 'transit-moment'];

const ANGLE_PROGRESSION_VALUES: AngleProgression[] = [
  'sa-long', 'sa-ra', 'naibod-long', 'naibod-ra', 'mean-quotidian',
];

const PRIMARY_RATE_VALUES: PrimaryRate[] = [
  'ptolemy', 'naibod', 'cardan', 'kepler-ra', 'solar-long', 'placidus-ra', 'user',
];

// Sidebar sections behave as an accordion — at most one open at a time — so the
// panel never grows into a tall stack of expanded sections. The open section is
// owned by App (so the Info chip can open the Calculation tab from outside).
export type SidebarSection = 'theme' | 'filters' | 'calc' | 'overlay';

// Where a hover/focus hint pops, relative to its trigger. The sidebar is docked
// at the screen's right edge, so the card pops left onto the open map, centred on
// the row. Coordinates are viewport-relative (the card is position: fixed).
function useHoverTip<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left - 8, top: r.top + r.height / 2 });
  };
  const hide = () => setPos(null);
  return { ref, pos, show, hide };
}

// The shared .ui-tip card (see index.css), portaled to <body> so the sidebar's
// overflow can't clip it. aria-hidden mirrors the timeline nub's hint: a sighted
// convenience, not the control's accessible name (the label carries that).
function ChoiceTip({
  pos,
  title,
  hint,
  hotkey,
}: {
  pos: { left: number; top: number } | null;
  title: ReactNode;
  hint: string;
  hotkey?: ReactNode;
}) {
  if (!pos) return null;
  return createPortal(
    <span
      className="ui-tip-box ui-tip choice-tip"
      style={{ left: pos.left, top: pos.top }}
      aria-hidden="true"
    >
      {hotkey ? (
        // Title + the shared yellow hotkey pill (.ui-tip-hotkey, see HoverTip.css)
        // share one row; the hint wraps below.
        <span className="ui-tip-headline">
          <span className="ui-tip-title">{title}</span>
          <span className="ui-tip-hotkey">{hotkey}</span>
        </span>
      ) : (
        <span className="ui-tip-title">{title}</span>
      )}
      {/* Astro symbols in the hint copy render with the bundled glyph font. */}
      <span className="ui-tip-sub">{glyphify(hint)}</span>
    </span>,
    document.body,
  );
}

// A toggle button — radio choice, line filter, or paran / local-space switch —
// that reveals its explanation as the shared .ui-tip card on hover/focus.
function TipToggle({
  className,
  onClick,
  onShiftClick,
  title,
  hint,
  hotkey,
  ariaPressed,
  children,
}: {
  className: string;
  onClick: () => void;
  /** Shift+click handler — used by the line filters for "toggle all". */
  onShiftClick?: () => void;
  title: string;
  hint: string;
  /** Optional keyboard shortcut, shown as the yellow pill in the tip. */
  hotkey?: ReactNode;
  ariaPressed?: boolean;
  children: ReactNode;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>();
  return (
    <li>
      <button
        ref={ref}
        type="button"
        className={className}
        onClick={(e) => (e.shiftKey && onShiftClick ? onShiftClick() : onClick())}
        aria-pressed={ariaPressed}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </button>
      <ChoiceTip pos={pos} title={title} hint={hint} hotkey={hotkey} />
    </li>
  );
}

// A radio-style choice (theme-option): its label is the card title, its hint the
// explanation.
function HintOption({
  selected,
  onSelect,
  label,
  hint,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  hint: string;
}) {
  return (
    <TipToggle
      className={`theme-option ${selected ? 'active' : ''}`}
      onClick={onSelect}
      title={label}
      hint={hint}
    >
      <span className="radio">{selected ? '●' : '○'}</span>
      <span className="label">{label}</span>
    </TipToggle>
  );
}

// A dropdown for the Calc settings that mirrors the top-nav "Overlay" menu: a
// full-width trigger showing the current value, opening a panel of option rows.
// The panel is portaled to <body> so the sidebar's overflow can't clip it, and —
// unlike a native <select> — each row reveals its explanation as a hover .ui-tip.
// Exported so the timeline-bar scale picker reuses the same dropdown styling as the
// Calc settings (rather than a separate native <select>).
export function HintMenu<V extends string>({
  value,
  onChange,
  options,
  note,
}: {
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: string; hint: string; disabled?: boolean }[];
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // The portaled panel is positioned by its top and always clamped fully within
  // the viewport (margins), capped to the room it has so it scrolls rather than
  // spilling off — or, on a screen too short for either side, fills the viewport.
  const [box, setBox] = useState<{
    left: number;
    width: number;
    top: number;
    maxHeight: number;
  } | null>(null);
  const current = options.find((o) => o.value === value);

  useLayoutEffect(() => {
    if (!open) return;
    // The panel re-measures and re-places below before the browser paints, so a
    // reopen never shows a stale position even though `box` keeps its last value.
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const margin = 8; // keep this clear of the viewport edges
      const gap = 6; // gap between the trigger and the panel
      const vh = window.innerHeight;
      // The panel is mounted (hidden) before this layout effect runs, so its real
      // height is available on the very first open. Measure the FULL outer height:
      // scrollHeight is content + padding but EXCLUDES the border, and the panel is
      // border-box, so using scrollHeight alone makes maxHeight a couple of pixels too
      // short — the border then overflows and shows a scrollbar even when every row is
      // visible. (offsetHeight − clientHeight) adds the border back; +1 absorbs
      // sub-pixel rounding so it never under-shoots.
      const el = panelRef.current;
      const panelH = el
        ? el.scrollHeight + (el.offsetHeight - el.clientHeight) + 1
        : 240;
      // Never taller than the viewport (minus margins); it scrolls past that.
      const height = Math.min(panelH, vh - margin * 2);
      const spaceBelow = vh - r.bottom - gap - margin;
      const spaceAbove = r.top - gap - margin;
      let top: number;
      if (height <= spaceBelow) {
        top = r.bottom + gap; // fits below the trigger
      } else if (height <= spaceAbove) {
        top = r.top - gap - height; // flip: fits above the trigger
      } else {
        // Too tall for either side (a short screen): fill the viewport, hugging
        // whichever side has more room, so the whole list stays reachable.
        top = spaceAbove > spaceBelow ? margin : vh - margin - height;
      }
      // Skip the update when nothing changed, so the ResizeObserver below can't
      // ping-pong with its own re-render.
      setBox((prev) =>
        prev &&
        prev.left === r.left &&
        prev.width === r.width &&
        prev.top === top &&
        prev.maxHeight === height
          ? prev
          : { left: r.left, width: r.width, top, maxHeight: height },
      );
    };
    place();
    // Re-measure if the panel's own size settles after mount (e.g. fallback fonts
    // for non-Latin labels loading in).
    const panel = panelRef.current;
    const ro = panel ? new ResizeObserver(place) : null;
    if (panel) ro?.observe(panel);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // Re-pin to the trigger when the SIDEBAR (page) scrolls, but ignore scrolling
    // *inside* the panel — that's the user scrolling the list, and re-placing on it
    // made the panel visibly jump and the scrollbar flicker.
    const onScroll = (e: Event) => {
      if (panel && e.target instanceof Node && panel.contains(e.target)) return;
      place();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      ro?.disconnect();
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="calc-menu">
      <button
        ref={triggerRef}
        type="button"
        className={`thud-select calc-menu-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="calc-menu-value">{current?.label ?? ''}</span>
        <span className="thud-select-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="navmenu-panel"
            role="listbox"
            style={{
              position: 'fixed',
              left: box?.left ?? 0,
              top: box?.top ?? 0,
              minWidth: box?.width,
              maxHeight: box?.maxHeight,
              overflowY: 'auto',
              zIndex: 900,
              // Mounted before it's measured so the first open knows its real height;
              // kept hidden until placed so it never flashes at the top-left corner.
              visibility: box ? 'visible' : 'hidden',
            }}
          >
            {options.map((o) => (
              <HintMenuItem
                key={o.value}
                label={o.label}
                hint={o.hint}
                disabled={o.disabled}
                selected={o.value === value}
                onSelect={() => {
                  if (o.disabled) return;
                  onChange(o.value);
                  setOpen(false);
                }}
              />
            ))}
            {note && <span className="navmenu-hint">{note}</span>}
          </div>,
          document.body,
        )}
    </div>
  );
}

// One selectable row in a HintMenu, revealing its explanation as a hover .ui-tip.
function HintMenuItem({
  label,
  hint,
  selected,
  onSelect,
  disabled = false,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
  /** A listed-but-unavailable option: grayed, non-selecting, but still shows its tip
   *  on hover (so we use aria-disabled, not the native `disabled` attribute, which
   *  would suppress the pointer events the tip needs). */
  disabled?: boolean;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>();
  return (
    <button
      ref={ref}
      type="button"
      className={`navmenu-item ${selected ? 'on' : ''}${disabled ? ' disabled' : ''}`}
      role="option"
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onSelect}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <span className="navmenu-marker">{selected ? '●' : '○'}</span>
      <span>{label}</span>
      {hint && <ChoiceTip pos={pos} title={label} hint={hint} />}
    </button>
  );
}

// The "User rate" field: a small degrees/year input that always shows two decimals
// (formatting only when not mid-edit, so typing stays free), with custom themed step
// chevrons in place of the browser's default number spinners.
function UserRateInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (deg: number) => void;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? (Number.isFinite(value) ? value.toFixed(2) : '');

  const bump = (dir: 1 | -1) => {
    // Step on the 0.01 grid the display rounds to; round again to avoid float drift.
    const base = Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
    onChange(Math.max(0, Math.round((base + dir * 0.01) * 100) / 100));
    setDraft(null);
  };

  return (
    <div className="calc-user-rate">
      <label className="calc-user-rate-label" htmlFor="user-primary-rate">
        {t('settings.userRate.label')}
      </label>
      <input
        id="user-primary-rate"
        type="text"
        inputMode="decimal"
        className="thud-select calc-user-rate-input"
        value={display}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n) && n >= 0) onChange(n);
        }}
        onBlur={() => setDraft(null)}
      />
      <span className="calc-user-rate-steppers" aria-hidden="true">
        <button
          type="button"
          tabIndex={-1}
          className="calc-rate-step"
          onClick={() => bump(1)}
        >
          ▴
        </button>
        <button
          type="button"
          tabIndex={-1}
          className="calc-rate-step"
          onClick={() => bump(-1)}
        >
          ▾
        </button>
      </span>
    </div>
  );
}

// A Map-filters planet toggle whose hover/focus tip shows the body's glyph (in
// its own colour) and a one-line astrological theme.
function PlanetToggle({
  planet,
  on,
  onToggle,
  onShiftClick,
}: {
  planet: PlanetName;
  on: boolean;
  onToggle: () => void;
  /** Shift+click handler — used for "show / hide all planets". */
  onShiftClick?: () => void;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>();
  const { labels } = useT();
  return (
    <li>
      <button
        ref={ref}
        type="button"
        className={`planet-toggle ${on ? 'on' : 'off'}`}
        onClick={(e) => (e.shiftKey && onShiftClick ? onShiftClick() : onToggle())}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <PlanetGlyph
          planet={planet}
          size={14}
          color={PLANET_COLORS[planet]}
          className="planet-toggle-icon"
        />
        <span className="name">{labels.planet(planet)}</span>
      </button>
      <ChoiceTip
        pos={pos}
        title={
          <span className="planet-tip-title">
            <PlanetGlyph planet={planet} size={14} color={PLANET_COLORS[planet]} />
            {labels.planet(planet)}
          </span>
        }
        hint={labels.planetTheme(planet)}
        hotkey={<ShiftTapTag />}
      />
    </li>
  );
}

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
  setAllPlanets,
  visibleLineTypes,
  toggleLineType,
  setAllLineTypes,
  showParans,
  setShowParans,
  showLocalSpace,
  setShowLocalSpace,
  showAspectLines,
  setShowAspectLines,
  showMidpointLines,
  setShowMidpointLines,
  lineSystem,
  setLineSystem,
  coordSystem,
  setCoordSystem,
  houseSystem,
  setHouseSystem,
  nodeType,
  setNodeType,
  overlayMode,
  transitFrame,
  setTransitFrame,
  synastryMethod,
  setSynastryMethod,
  onGenerateRelationship,
  canGenerateRelationship,
  eclipseDetails,
  showEclipseNatalLines,
  setShowEclipseNatalLines,
  eclipseIsoStep,
  setEclipseIsoStep,
  showTimeline,
  setShowTimeline,
  showOverlayZenith,
  setShowOverlayZenith,
  showNatal,
  setShowNatal,
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
  openSection,
  setOpenSection,
}: SidebarProps) {
  const { t, labels, locale, setLocale } = useT();
  // The House-system / Primary-rate dropdowns need {value,label,hint} rows; build
  // them from the value lists + the shared catalog accessors.
  const houseSystemOptions = HOUSE_SYSTEM_VALUES.map((value) => ({
    value,
    label: labels.houseSystem(value),
    hint: labels.houseSystemHint(value),
  }));
  const primaryRateOptions = PRIMARY_RATE_VALUES.map((value) => ({
    value,
    label: labels.primaryRate(value),
    hint: labels.primaryRateHint(value),
  }));
  // The Language dropdown lists the top astrology-community languages; only the ones
  // with a catalog (English today) are selectable — the rest are grayed with a tip.
  const languageOptions = LANGUAGES.map((lang) => ({
    value: lang.code,
    label: lang.autonym,
    hint: lang.available ? '' : t('settings.languageUnavailable'),
    disabled: !lang.available,
  }));
  const toggleSection = (s: SidebarSection) =>
    setOpenSection(openSection === s ? null : s);

  // Hover tip on the eclipse-degree value: names the sign behind the glyph
  // ("♐ Sagittarius") for readers who don't keep the twelve glyphs memorized.
  const {
    ref: eclipseSignRef,
    pos: eclipseSignPos,
    show: showEclipseSign,
    hide: hideEclipseSign,
  } = useHoverTip<HTMLElement>();

  // The settings groups the active overlay exposes in its Overlay tab. Each is its
  // own flag, and the tab is shown only when at least one is on — so an overlay with
  // nothing to configure simply gets no tab, with no per-mode special-casing.

  // The bottom timeline only exists for the time-scrub overlays (not synastry), so
  // the Display ▸ Timeline toggle is shown only then.
  const isTimeMode =
    overlayMode === 'transits' ||
    overlayMode === 'progressed' ||
    overlayMode === 'solar-arc' ||
    overlayMode === 'primary-directions';
  // Positioning (radix-relative vs the transit moment's own sidereal time) only changes
  // the TRANSITS overlay, and only in the Celestial line system: the directed overlays
  // (progressed / solar arc / primary directions) are natal-framed by construction, and
  // Mundane/Geodetic lines key off zodiacal longitude with no sidereal-time reference —
  // so the toggle would do nothing in those cases and isn't shown.
  const showPositioning =
    overlayMode === 'transits' && lineSystem === 'celestial';
  // The Chart Angle control is for the directed overlays only.
  const showChartAngle =
    overlayMode === 'progressed' || overlayMode === 'solar-arc';
  // Synastry's own section: pick a relationship method and generate that derived
  // chart. Synastry-only (the other overlays have no second chart to combine).
  const showRelationships = overlayMode === 'synastry';
  // Eclipses' own section: the selected eclipse's details, the chart-lines
  // toggle, and the magnitude-isoline interval.
  const showEclipses = overlayMode === 'eclipses';
  // Show the Overlay tab only when the active overlay actually has a setting to
  // toggle; otherwise its header isn't rendered (and any saved open-state for it
  // just reads as "nothing open").
  const showOverlayTab =
    isTimeMode ||
    showPositioning ||
    showChartAngle ||
    showRelationships ||
    showEclipses;

  return (
    <aside className="sidebar">
      <button
        type="button"
        className="sidebar-header"
        onClick={() => toggleSection('theme')}
        aria-expanded={openSection === 'theme'}
      >
        <span className="sidebar-title">{t('settings.sections.appearance')}</span>
        <span className="sidebar-chevron">{openSection === 'theme' ? '▾' : '▸'}</span>
      </button>

      {openSection === 'theme' && (
        <div className="sidebar-section theme-section">
          <h2>{t('settings.headings.theme')}</h2>
          <ul className="theme-list">
            {THEMES.map((th) => (
              <li key={th}>
                <button
                  type="button"
                  className={`theme-option ${theme === th ? 'active' : ''}`}
                  onClick={() => setTheme(th)}
                >
                  <span className="radio">{theme === th ? '●' : '○'}</span>
                  <span className={`swatch swatch-${th}`} />
                  <span className="label">{labels.theme(th)}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="theme-detail">
            <h2>{t('settings.headings.language')}</h2>
            <HintMenu<string>
              value={locale}
              onChange={(code) => setLocale(code as Locale)}
              options={languageOptions}
            />
          </div>

          <div className="theme-detail">
            <h2>{t('settings.headings.details')}</h2>
            <ul className="technique-list">
              {(
                [
                  ['roads', showRoads, setShowRoads],
                  ['rivers', showRivers, setShowRivers],
                  ['labels', showLabels, setShowLabels],
                ] as const
              ).map(([key, shown, setShown]) => (
                <li key={key}>
                  <button
                    type="button"
                    className={`tech-toggle ${shown ? 'on' : 'off'}`}
                    onClick={() => setShown(!shown)}
                    aria-pressed={shown}
                  >
                    <EyeIcon open={shown} />
                    <span className="name">{t(`settings.details.${key}`)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="theme-detail">
            <h2>{t('settings.headings.projection')}</h2>
            <ul className="theme-list">
              {PROJECTION_VALUES.map((value) => (
                <HintOption
                  key={value}
                  selected={projection === value}
                  onSelect={() => setProjection(value)}
                  label={labels.projection(value)}
                  hint={labels.projectionHint(value)}
                />
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
        <span className="sidebar-title">{t('settings.sections.mapFilters')}</span>
        <span className="sidebar-chevron">{openSection === 'filters' ? '▾' : '▸'}</span>
      </button>

      {openSection === 'filters' && (
        <div className="sidebar-section">
          <h2>{t('settings.headings.planets')}</h2>
          <ul className="planet-grid">
            {PLANET_FILTERS.map((p) => (
              <PlanetToggle
                key={p}
                planet={p}
                on={visiblePlanets.has(p)}
                onToggle={() => togglePlanet(p)}
                onShiftClick={() =>
                  setAllPlanets(PLANET_FILTERS, !visiblePlanets.has(p))
                }
              />
            ))}
          </ul>

          <h2>{t('settings.headings.asteroids')}</h2>
          <ul className="planet-grid">
            {ASTEROID_NAMES.map((p) => (
              <PlanetToggle
                key={p}
                planet={p}
                on={visiblePlanets.has(p)}
                onToggle={() => togglePlanet(p)}
                onShiftClick={() =>
                  setAllPlanets(ASTEROID_NAMES, !visiblePlanets.has(p))
                }
              />
            ))}
          </ul>

          <h2>{t('settings.headings.lines')}</h2>
          <ul className="line-type-grid">
            {LINE_TYPES.map(({ type, label }) => {
              const on = visibleLineTypes.has(type);
              return (
                <TipToggle
                  key={type}
                  className={`line-toggle ${type.toLowerCase()} ${on ? 'on' : 'off'}`}
                  onClick={() => toggleLineType(type)}
                  onShiftClick={() => setAllLineTypes(!on)}
                  title={label}
                  hint={labels.lineTypeHint(type)}
                  hotkey={<ShiftTapTag />}
                >
                  {type === 'ASC' ? (
                    <span className="line-arrow-swatch">→</span>
                  ) : type === 'DSC' ? (
                    <span className="line-arrow-swatch">←</span>
                  ) : (
                    <span className="line-swatch" />
                  )}
                  <span className="name">{label}</span>
                </TipToggle>
              );
            })}
          </ul>

          {/* Parans / Local Space sit under Lines without their own heading. */}
          <ul className="technique-list">
            <TipToggle
              className={`tech-toggle ${showParans ? 'on' : 'off'}`}
              onClick={() => setShowParans(!showParans)}
              ariaPressed={showParans}
              title={t('settings.parans.title')}
              hotkey="Shift P"
              hint={t('settings.parans.hint')}
            >
              <EyeIcon open={showParans} />
              <span className="name">{t('settings.parans.title')}</span>
            </TipToggle>
            <TipToggle
              className={`tech-toggle ${showLocalSpace ? 'on' : 'off'}`}
              onClick={() => setShowLocalSpace(!showLocalSpace)}
              ariaPressed={showLocalSpace}
              title={t('settings.localSpace.title')}
              hotkey="Shift L"
              hint={t('settings.localSpace.hint')}
            >
              <EyeIcon open={showLocalSpace} />
              <span className="name">{t('settings.localSpace.title')}</span>
            </TipToggle>
            <TipToggle
              className={`tech-toggle ${showAspectLines ? 'on' : 'off'}`}
              onClick={() => setShowAspectLines(!showAspectLines)}
              ariaPressed={showAspectLines}
              title={t('settings.aspectLines.title')}
              hotkey="Shift A"
              hint={t('settings.aspectLines.hint')}
            >
              <EyeIcon open={showAspectLines} />
              <span className="name">{t('settings.aspectLines.title')}</span>
            </TipToggle>
            <TipToggle
              className={`tech-toggle ${showMidpointLines ? 'on' : 'off'}`}
              onClick={() => setShowMidpointLines(!showMidpointLines)}
              ariaPressed={showMidpointLines}
              title={t('settings.midpointLines.title')}
              hotkey="Shift M"
              hint={t('settings.midpointLines.hint')}
            >
              <EyeIcon open={showMidpointLines} />
              <span className="name">{t('settings.midpointLines.title')}</span>
            </TipToggle>
          </ul>
        </div>
      )}

      <button
        type="button"
        className="sidebar-header"
        onClick={() => toggleSection('calc')}
        aria-expanded={openSection === 'calc'}
      >
        <span className="sidebar-title">{t('settings.sections.calculation')}</span>
        <span className="sidebar-chevron">{openSection === 'calc' ? '▾' : '▸'}</span>
      </button>

      {openSection === 'calc' && (
        <div className="sidebar-section">
          {/* Primary paradigm: Celestial (standard ACG, by the sky) vs Mundane
              (geodetic, by Earth longitude). The In-Mundo/In-Zodiaco
              "Line projection" below is a Celestial-only refinement, so it shows
              ONLY in Celestial — which also keeps "In Mundo" from ever appearing
              next to "Mundane". */}
          <h2>{t('settings.headings.lineSystem')}</h2>
          <ul className="theme-list">
            {LINE_SYSTEM_VALUES.map((value) => (
              <HintOption
                key={value}
                selected={lineSystem === value}
                onSelect={() => setLineSystem(value)}
                label={labels.lineSystem(value)}
                hint={labels.lineSystemHint(value)}
              />
            ))}
          </ul>

          {lineSystem === 'celestial' && (
            <>
              <h2>{t('settings.headings.lineProjection')}</h2>
              <ul className="theme-list">
                {COORD_SYSTEM_VALUES.map((value) => (
                  <HintOption
                    key={value}
                    selected={coordSystem === value}
                    onSelect={() => setCoordSystem(value)}
                    label={labels.coordSystem(value)}
                    hint={labels.coordSystemHint(value)}
                  />
                ))}
              </ul>
            </>
          )}

          <h2>{t('settings.headings.lunarNode')}</h2>
          <ul className="theme-list">
            {NODE_TYPE_VALUES.map((value) => (
              <HintOption
                key={value}
                selected={nodeType === value}
                onSelect={() => setNodeType(value)}
                label={labels.nodeType(value)}
                hint={labels.nodeTypeHint(value)}
              />
            ))}
          </ul>

          <h2>{t('settings.headings.houseSystem')}</h2>
          <HintMenu
            value={houseSystem}
            onChange={setHouseSystem}
            options={houseSystemOptions}
          />

          <h2>{t('settings.headings.primaryRate')}</h2>
          <HintMenu
            value={primaryRate}
            onChange={setPrimaryRate}
            options={primaryRateOptions}
          />
          {primaryRate === 'user' && (
            <UserRateInput value={userPrimaryRate} onChange={setUserPrimaryRate} />
          )}
        </div>
      )}

      {showOverlayTab && (
        <>
          <button
            type="button"
            className="sidebar-header"
            onClick={() => toggleSection('overlay')}
            aria-expanded={openSection === 'overlay'}
          >
            <span className="sidebar-title">{t('settings.sections.overlay')}</span>
            <span className="sidebar-chevron">
              {openSection === 'overlay' ? '▾' : '▸'}
            </span>
          </button>
          {openSection === 'overlay' && (
            <div className="sidebar-section">
              {isTimeMode && (
                <>
                  <h2>{t('settings.headings.display')}</h2>
                  <ul className="technique-list">
                    <TipToggle
                      className={`tech-toggle ${showNatal ? 'on' : 'off'}`}
                      onClick={() => setShowNatal(!showNatal)}
                      ariaPressed={showNatal}
                      title={t('settings.natal.title')}
                      hint={t('settings.natal.hint')}
                    >
                      <EyeIcon open={showNatal} />
                      <span className="name">{t('settings.natal.title')}</span>
                    </TipToggle>
                    <TipToggle
                      className={`tech-toggle ${showTimeline ? 'on' : 'off'}`}
                      onClick={() => setShowTimeline(!showTimeline)}
                      ariaPressed={showTimeline}
                      title={t('settings.timelineBar.title')}
                      hint={t('settings.timelineBar.hint')}
                    >
                      <EyeIcon open={showTimeline} />
                      <span className="name">{t('settings.timelineBar.title')}</span>
                    </TipToggle>
                    <TipToggle
                      className={`tech-toggle ${showOverlayZenith ? 'on' : 'off'}`}
                      onClick={() => setShowOverlayZenith(!showOverlayZenith)}
                      ariaPressed={showOverlayZenith}
                      title={t('settings.overlayZenith.title')}
                      hint={t('settings.overlayZenith.hint')}
                    >
                      <EyeIcon open={showOverlayZenith} />
                      <span className="name">{t('settings.overlayZenith.title')}</span>
                    </TipToggle>
                  </ul>
                </>
              )}

              {showPositioning && (
                <>
                  <h2>{t('settings.headings.positioning')}</h2>
                  <ul className="theme-list">
                    {POSITIONING_VALUES.map((value) => (
                      <HintOption
                        key={value}
                        selected={transitFrame === value}
                        onSelect={() => setTransitFrame(value)}
                        label={labels.positioning(value)}
                        hint={labels.positioningHint(value)}
                      />
                    ))}
                  </ul>
                </>
              )}

              {showChartAngle && (
                <>
                  <h2>{t('settings.headings.chartAngle')}</h2>
                  <ul className="theme-list">
                    {ANGLE_PROGRESSION_VALUES.map((value) => (
                      <HintOption
                        key={value}
                        selected={angleProgression === value}
                        onSelect={() => setAngleProgression(value)}
                        label={labels.chartAngle(value)}
                        hint={labels.chartAngleHint(value)}
                      />
                    ))}
                  </ul>
                </>
              )}

              {showRelationships && (
                <>
                  <h2>{t('settings.headings.relationships')}</h2>
                  <ul className="theme-list">
                    <HintOption
                      selected={synastryMethod === 'davison'}
                      onSelect={() => setSynastryMethod('davison')}
                      label={t('settings.relationships.davison.label')}
                      hint={t('settings.relationships.davison.hint')}
                    />
                    <HintOption
                      selected={synastryMethod === 'composite'}
                      onSelect={() => setSynastryMethod('composite')}
                      label={t('settings.relationships.composite.label')}
                      hint={t('settings.relationships.composite.hint')}
                    />
                  </ul>
                  <TipButton
                    type="button"
                    className={`relationship-generate${
                      !canGenerateRelationship || synastryMethod === 'composite'
                        ? ' is-disabled'
                        : ''
                    }`}
                    aria-disabled={
                      !canGenerateRelationship || synastryMethod === 'composite'
                    }
                    onClick={() => {
                      if (canGenerateRelationship && synastryMethod === 'davison')
                        onGenerateRelationship();
                    }}
                    placement="top"
                    tip={t('settings.relationships.generate.title')}
                    hint={
                      synastryMethod === 'composite'
                        ? t('settings.relationships.generate.comingSoon')
                        : !canGenerateRelationship
                          ? t('settings.relationships.generate.needPartner')
                          : t('settings.relationships.generate.hint')
                    }
                  >
                    {t('settings.relationships.generate.title')}
                  </TipButton>
                </>
              )}

              {showEclipses && eclipseDetails && (
                <>
                  <h2>{t('settings.headings.eclipse')}</h2>
                  {/* The selected eclipse's vitals — catalog metadata (NASA) plus
                      the Swiss-derived maximum instant and eclipse degree. */}
                  <dl className="eclipse-details">
                    <div>
                      <dt>{t('settings.eclipses.details.maximum')}</dt>
                      <dd>{eclipseDetails.maxUtc}</dd>
                    </div>
                    <div>
                      <dt>{t('settings.eclipses.details.type')}</dt>
                      <dd>
                        {t(`settings.eclipses.kind.${eclipseDetails.row.kind}`)}
                        {eclipseDetails.row.kind !== 'partial' &&
                          ` · ${t(
                            eclipseDetails.row.central
                              ? 'settings.eclipses.details.central'
                              : 'settings.eclipses.details.nonCentral',
                          )}`}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('settings.eclipses.details.sunPosition')}</dt>
                      <dd
                        ref={eclipseSignRef}
                        className="eclipse-degree"
                        onMouseEnter={showEclipseSign}
                        onMouseLeave={hideEclipseSign}
                      >
                        {glyphify(eclipseDetails.sunZodiac)}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('settings.eclipses.details.magnitude')}</dt>
                      <dd>{eclipseDetails.row.magnitude.toFixed(4)}</dd>
                    </div>
                    <div>
                      <dt>{t('settings.eclipses.details.gamma')}</dt>
                      <dd>{eclipseDetails.row.gamma.toFixed(4)}</dd>
                    </div>
                    <div>
                      <dt>{t('settings.eclipses.details.hemisphere')}</dt>
                      <dd>
                        {t(
                          eclipseDetails.row.gamma >= 0
                            ? 'settings.eclipses.details.north'
                            : 'settings.eclipses.details.south',
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('settings.eclipses.details.saros')}</dt>
                      <dd>{eclipseDetails.row.saros}</dd>
                    </div>
                    <div>
                      <dt>{t('settings.eclipses.details.lunation')}</dt>
                      <dd>{eclipseDetails.row.lunation}</dd>
                    </div>
                    {eclipseDetails.row.durationSec !== null && (
                      <div>
                        <dt>{t('settings.eclipses.details.duration')}</dt>
                        <dd>
                          {Math.floor(eclipseDetails.row.durationSec / 60)}m{' '}
                          {eclipseDetails.row.durationSec % 60}s
                        </dd>
                      </div>
                    )}
                    {eclipseDetails.row.widthKm !== null && (
                      <div>
                        <dt>{t('settings.eclipses.details.width')}</dt>
                        <dd>{eclipseDetails.row.widthKm} km</dd>
                      </div>
                    )}
                  </dl>

                  <h2>{t('settings.headings.display')}</h2>
                  <ul className="technique-list">
                    <TipToggle
                      className={`tech-toggle ${showEclipseNatalLines ? 'on' : 'off'}`}
                      onClick={() =>
                        setShowEclipseNatalLines(!showEclipseNatalLines)
                      }
                      ariaPressed={showEclipseNatalLines}
                      title={t('settings.eclipses.natalLines.title')}
                      hint={t('settings.eclipses.natalLines.hint')}
                    >
                      <EyeIcon open={showEclipseNatalLines} />
                      <span className="name">
                        {t('settings.eclipses.natalLines.title')}
                      </span>
                    </TipToggle>
                    {/* Eclipse Chart Lines: feature-complete but not ready to
                        ship — UI-gated only, so all state/props/render logic
                        stays wired. Restore the TipToggle (same shape as Natal
                        Chart above, props showEclipseChartLines /
                        setShowEclipseChartLines, strings under
                        settings.eclipses.chartLines.*) to re-enable. */}
                  </ul>

                  <h2>{t('settings.headings.magnitudeSteps')}</h2>
                  <ul className="theme-list">
                    {([10, 20, 25] as const).map((step) => (
                      <HintOption
                        key={step}
                        selected={eclipseIsoStep === step}
                        onSelect={() => setEclipseIsoStep(step)}
                        label={t(`settings.eclipses.isoStep.${step}.label`)}
                        hint={t(`settings.eclipses.isoStep.${step}.hint`)}
                      />
                    ))}
                  </ul>

                  <ChoiceTip
                    pos={eclipseSignPos}
                    title={glyphify(
                      `${SIGN_GLYPHS[eclipseDetails.sunSignIndex]} ${labels.sign(eclipseDetails.sunSignIndex)}`,
                    )}
                    hint={t('settings.eclipses.details.sunPositionTip', {
                      sign: labels.sign(eclipseDetails.sunSignIndex),
                    })}
                  />
                </>
              )}
            </div>
          )}
        </>
      )}
    </aside>
  );
}
