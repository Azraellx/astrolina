// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ASTEROID_NAMES,
  NODE_NAMES,
  PLANET_COLORS,
  PLANET_DISPLAY,
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
  TransitFrame,
} from '../../lib/astro/timeline';
import { THEMES, THEME_LABELS, type Theme } from '../../lib/theme';
import type { MapProjectionMode } from '../../lib/projection';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import './Sidebar.css';

// One-sentence astrological theme per body, for the Map-filters planet tips
// (novice-friendly flavour; purely descriptive, not used in any calculation).
const PLANET_THEMES: Record<PlanetName, string> = {
  Sun: 'Your core identity, vitality, and where you shine.',
  Moon: 'Emotions, instinct, and what makes you feel at home.',
  Mercury: 'The mind: how you think, learn, and communicate.',
  Venus: 'Love, beauty, pleasure, and what you value.',
  Mars: 'Drive, courage, and how you assert yourself and act.',
  Jupiter: 'Growth, luck, and where life expands and feels generous.',
  Saturn: 'Discipline, limits, and the hard-won lessons of maturity.',
  Uranus: 'Sudden change, freedom, and your spark of rebellion.',
  Neptune: 'Dreams, intuition, spirituality, and beautiful illusion.',
  Pluto: 'Power, intensity, and profound transformation and rebirth.',
  NorthNode: 'Your soul’s growth path and where you’re headed this life.',
  SouthNode: 'Familiar past-life gifts and patterns to grow beyond.',
  Lilith: 'Raw, untamed instinct and where you refuse to be tamed.',
  Chiron: 'The wounded healer: healing through your own deepest hurt.',
  Ceres: 'Nurturing, nourishment, and how you give and receive care.',
  Pallas: 'Wisdom, strategy, and bright creative problem-solving.',
  Juno: 'Commitment, partnership, and what you seek in a soulmate.',
  Vesta: 'Devotion, focus, and the inner flame you keep sacred.',
};

// The "Planets" filter group: the ten bodies + the two lunar nodes. Asteroids get
// their own section (and their own independent show/hide-all).
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
  showTimeline: boolean;
  setShowTimeline: (v: boolean) => void;
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

const LINE_TYPES: { type: LineType; label: string; full: string }[] = [
  { type: 'MC', label: 'MC', full: 'Midheaven (career, public)' },
  { type: 'IC', label: 'IC', full: 'Imum Coeli (home, roots)' },
  { type: 'ASC', label: 'As', full: 'Ascendant (self, identity)' },
  { type: 'DSC', label: 'Ds', full: 'Descendant (relationships)' },
];

// The Shift+click affordance shown as the hotkey tag on each planet / line filter
// tip: "Shift" + a cursor/tap glyph. Shift+click toggles every item in the group at
// once (show vs hide follows the hovered one's state — the user infers it).
function ShiftTapTag() {
  return (
    <span className="shift-tap-tag">
      Shift
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

const COORD_SYSTEMS: { value: CoordSystem; label: string; hint: string }[] = [
  { value: 'mundo', label: 'In Mundo', hint: 'Lines use each body’s true position in the sky (RA / dec). Most affects Pluto and the Moon.' },
  { value: 'zodiaco', label: 'In Zodiaco', hint: 'Bodies are projected onto the ecliptic before drawing lines (a common ACG default).' },
];

// Internal ids stay 'celestial'/'geodetic'; the astrologer-facing labels are
// "Celestial" / "Mundane" (geodetic is named in the hover hint + description).
const LINE_SYSTEMS: { value: LineSystem; label: string; hint: string }[] = [
  { value: 'celestial', label: 'Celestial', hint: 'Standard astrocartography: angles placed by the sky (sidereal time)' },
  { value: 'geodetic', label: 'Mundane', hint: "Geodetic mapping: the zodiac mapped onto Earth's longitudes (Greenwich = 0° Aries), independent of birth time" },
];

const PROJECTIONS: { value: MapProjectionMode; label: string; hint: string }[] = [
  { value: '2d', label: 'Flat', hint: 'Classic Web-Mercator map' },
  { value: '3d', label: 'Globe', hint: 'Rotatable 3D globe' },
];

const HOUSE_SYSTEMS: { value: HouseSystem; label: string; hint: string }[] = [
  { value: 'placidus', label: 'Placidus', hint: 'Semi-arc time division (the common modern default)' },
  { value: 'koch', label: 'Koch', hint: 'Semi-arc on the birth latitude (GOH)' },
  { value: 'regiomontanus', label: 'Regiomontanus', hint: 'Equal divisions of the celestial equator' },
  { value: 'campanus', label: 'Campanus', hint: 'Equal divisions of the prime vertical' },
  { value: 'porphyry', label: 'Porphyry', hint: 'Each quadrant trisected in ecliptic longitude' },
  { value: 'alcabitus', label: 'Alcabitus', hint: 'Ancient semi-arc on the diurnal / nocturnal arcs' },
  { value: 'whole', label: 'Whole Sign', hint: 'Each house is a whole sign from the rising sign' },
  { value: 'equal', label: 'Equal', hint: '30° houses measured from the Ascendant' },
];

const NODE_TYPES: { value: NodeType; label: string; hint: string }[] = [
  { value: 'true', label: 'True Node', hint: 'True (osculating) node follows the Moon’s instantaneous orbit; oscillates ±~1.5° around the mean and can briefly turn direct (desktop-tool default).' },
  { value: 'mean', label: 'Mean Node', hint: 'The smoothed long-term average; always moves retrograde at a steady rate.' },
];

// How an overlay's angle lines are framed. "Relative" holds the natal angles fixed
// (radix-relative), "Absolute" uses the overlay moment's own sidereal time. Mainly
// shapes the Transits map (the directed overlays use Chart Angle below).
const POSITIONINGS: { value: TransitFrame; label: string; hint: string }[] = [
  { value: 'relative-to-natal', label: 'Relative', hint: 'Frame the overlay against your natal chart’s angles (radix-relative); the lines drift slowly with the planets’ own motion. The default most astrologers work with.' },
  { value: 'transit-moment', label: 'Absolute', hint: 'Place the overlay at its own moment in the sky (that instant’s sidereal time); the lines sweep about 15° per hour with Earth’s rotation. Standard transit astrocartography.' },
];

// "Progs/Dirns" — how a directed/progressed chart's angles advance (Solar Arc +
// Progressed overlays), and the time-key for the Primary Directions overlay.
const ANGLE_PROGRESSIONS: { value: AngleProgression; label: string; hint: string }[] = [
  { value: 'sa-long', label: 'SA in Longitude', hint: 'Solar arc in ecliptic longitude (the classic solar-arc default).' },
  { value: 'sa-ra', label: 'SA in RA', hint: 'Solar arc measured in right ascension.' },
  { value: 'naibod-long', label: 'Naibod in Long', hint: 'Mean solar rate 0.9856°/yr, applied in longitude.' },
  { value: 'naibod-ra', label: 'Naibod in RA', hint: 'Mean solar rate 0.9856°/yr, applied in right ascension.' },
  { value: 'mean-quotidian', label: 'Mean Quotidian', hint: 'Quotidian progressed angle (one day per year); on Solar Arc it matches SA in Longitude.' },
];

const PRIMARY_RATES: { value: PrimaryRate; label: string; hint: string }[] = [
  { value: 'ptolemy', label: 'Ptolemy (1°/yr)', hint: 'One year per degree.' },
  { value: 'naibod', label: 'Naibod (59′08″/yr)', hint: '0.985647° per year, the Sun’s mean motion.' },
  { value: 'cardan', label: 'Cardan (59′12″/yr)', hint: '0.986667° per year.' },
  { value: 'kepler-ra', label: 'Kepler: Natal Solar RA', hint: 'Natal Sun’s daily motion in right ascension × years.' },
  { value: 'solar-long', label: 'Natal Solar: Longitude', hint: 'Natal Sun’s daily motion in ecliptic longitude × years.' },
  { value: 'placidus-ra', label: 'Placidus: True SA in RA', hint: 'True secondary-progressed solar arc in RA (nonlinear).' },
  { value: 'user', label: 'User rate', hint: 'Enter your own degrees-per-year below.' },
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
      <span className="ui-tip-sub">{hint}</span>
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
function HintMenu<V extends string>({
  value,
  onChange,
  options,
  note,
}: {
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: string; hint: string }[];
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

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const margin = 8; // keep this clear of the viewport edges
      const gap = 6; // gap between the trigger and the panel
      const vh = window.innerHeight;
      // Estimate before the panel mounts; once it has, use its true height (the
      // rAF below re-runs this so the final position is exact).
      const panelH = panelRef.current?.scrollHeight ?? 240;
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
      setBox({ left: r.left, width: r.width, top, maxHeight: height });
    };
    place();
    // Re-place once the panel has mounted so the flip uses its real height.
    const raf = requestAnimationFrame(place);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // Keep the portaled panel pinned to the trigger as the sidebar scrolls.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', place, true);
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
        box &&
        createPortal(
          <div
            ref={panelRef}
            className="navmenu-panel"
            role="listbox"
            style={{
              position: 'fixed',
              left: box.left,
              top: box.top,
              minWidth: box.width,
              maxHeight: box.maxHeight,
              overflowY: 'auto',
              zIndex: 900,
            }}
          >
            {options.map((o) => (
              <HintMenuItem
                key={o.value}
                label={o.label}
                hint={o.hint}
                selected={o.value === value}
                onSelect={() => {
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
}: {
  label: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>();
  return (
    <button
      ref={ref}
      type="button"
      className={`navmenu-item ${selected ? 'on' : ''}`}
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <span className="navmenu-marker">{selected ? '●' : '○'}</span>
      <span>{label}</span>
      <ChoiceTip pos={pos} title={label} hint={hint} />
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
        Degrees per year
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
        <span className="name">{PLANET_DISPLAY[planet]}</span>
      </button>
      <ChoiceTip
        pos={pos}
        title={
          <span className="planet-tip-title">
            <PlanetGlyph planet={planet} size={14} color={PLANET_COLORS[planet]} />
            {PLANET_DISPLAY[planet]}
          </span>
        }
        hint={PLANET_THEMES[planet]}
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
  showTimeline,
  setShowTimeline,
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
  const toggleSection = (s: SidebarSection) =>
    setOpenSection(openSection === s ? null : s);

  // The settings groups the active overlay exposes in its Overlay tab. Each is its
  // own flag, and the tab is shown only when at least one is on — so an overlay
  // with nothing to configure (Synastry today) simply gets no tab, with no
  // per-mode special-casing. If Synastry gains a setting later, flip its flag and
  // the tab returns on its own.

  // The bottom timeline only exists for the time-scrub overlays (not synastry), so
  // the Display ▸ Timeline toggle is shown only then.
  const isTimeMode =
    overlayMode === 'transits' ||
    overlayMode === 'progressed' ||
    overlayMode === 'solar-arc' ||
    overlayMode === 'primary-directions';
  // Positioning (radix-relative vs the overlay moment's own sidereal time) shapes
  // where the overlaid angle lines fall — meaningful for every overlay except
  // Synastry, whose partner chart has no single moment to frame against.
  const showPositioning = overlayMode !== 'off' && overlayMode !== 'synastry';
  // The Chart Angle control is for the directed overlays only.
  const showChartAngle =
    overlayMode === 'progressed' || overlayMode === 'solar-arc';
  // Show the Overlay tab only when the active overlay actually has a setting to
  // toggle; otherwise its header isn't rendered (and any saved open-state for it
  // just reads as "nothing open").
  const showOverlayTab = isTimeMode || showPositioning || showChartAngle;

  return (
    <aside className="sidebar">
      <button
        type="button"
        className="sidebar-header"
        onClick={() => toggleSection('theme')}
        aria-expanded={openSection === 'theme'}
      >
        <span className="sidebar-title">Appearance</span>
        <span className="sidebar-chevron">{openSection === 'theme' ? '▾' : '▸'}</span>
      </button>

      {openSection === 'theme' && (
        <div className="sidebar-section theme-section">
          <h2>Theme</h2>
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
            <h2>Details</h2>
            <ul className="technique-list">
              {(
                [
                  ['Roads', showRoads, setShowRoads],
                  ['Rivers', showRivers, setShowRivers],
                  ['Labels', showLabels, setShowLabels],
                ] as const
              ).map(([label, shown, setShown]) => (
                <li key={label}>
                  <button
                    type="button"
                    className={`tech-toggle ${shown ? 'on' : 'off'}`}
                    onClick={() => setShown(!shown)}
                    aria-pressed={shown}
                  >
                    <EyeIcon open={shown} />
                    <span className="name">{label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="theme-detail">
            <h2>Projection</h2>
            <ul className="theme-list">
              {PROJECTIONS.map(({ value, label, hint }) => (
                <HintOption
                  key={value}
                  selected={projection === value}
                  onSelect={() => setProjection(value)}
                  label={label}
                  hint={hint}
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
        <span className="sidebar-title">Map filters</span>
        <span className="sidebar-chevron">{openSection === 'filters' ? '▾' : '▸'}</span>
      </button>

      {openSection === 'filters' && (
        <div className="sidebar-section">
          <h2>Planets</h2>
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

          <h2>Asteroids</h2>
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

          <h2>Lines</h2>
          <ul className="line-type-grid">
            {LINE_TYPES.map(({ type, label, full }) => {
              const on = visibleLineTypes.has(type);
              return (
                <TipToggle
                  key={type}
                  className={`line-toggle ${type.toLowerCase()} ${on ? 'on' : 'off'}`}
                  onClick={() => toggleLineType(type)}
                  onShiftClick={() => setAllLineTypes(!on)}
                  title={label}
                  hint={full}
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
              title="Parans"
              hotkey="P"
              hint="Latitudes where two bodies are angular at the same moment, one rising as another culminates, and so on. Drawn as horizontal lines across the map."
            >
              <EyeIcon open={showParans} />
              <span className="name">Parans</span>
            </TipToggle>
            <TipToggle
              className={`tech-toggle ${showLocalSpace ? 'on' : 'off'}`}
              onClick={() => setShowLocalSpace(!showLocalSpace)}
              ariaPressed={showLocalSpace}
              title="Local Space"
              hotkey="L"
              hint="Directional lines radiating from the birthplace, each pointing to a planet’s compass bearing in the local sky."
            >
              <EyeIcon open={showLocalSpace} />
              <span className="name">Local Space</span>
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
        <span className="sidebar-title">Calculation</span>
        <span className="sidebar-chevron">{openSection === 'calc' ? '▾' : '▸'}</span>
      </button>

      {openSection === 'calc' && (
        <div className="sidebar-section">
          {/* Primary paradigm: Celestial (standard ACG, by the sky) vs Mundane
              (geodetic, by Earth longitude). The In-Mundo/In-Zodiaco
              "Line projection" below is a Celestial-only refinement, so it shows
              ONLY in Celestial — which also keeps "In Mundo" from ever appearing
              next to "Mundane". */}
          <h2>Line system</h2>
          <ul className="theme-list">
            {LINE_SYSTEMS.map(({ value, label, hint }) => (
              <HintOption
                key={value}
                selected={lineSystem === value}
                onSelect={() => setLineSystem(value)}
                label={label}
                hint={hint}
              />
            ))}
          </ul>

          {lineSystem === 'celestial' && (
            <>
              <h2>Line projection</h2>
              <ul className="theme-list">
                {COORD_SYSTEMS.map(({ value, label, hint }) => (
                  <HintOption
                    key={value}
                    selected={coordSystem === value}
                    onSelect={() => setCoordSystem(value)}
                    label={label}
                    hint={hint}
                  />
                ))}
              </ul>
            </>
          )}

          <h2>Lunar node</h2>
          <ul className="theme-list">
            {NODE_TYPES.map(({ value, label, hint }) => (
              <HintOption
                key={value}
                selected={nodeType === value}
                onSelect={() => setNodeType(value)}
                label={label}
                hint={hint}
              />
            ))}
          </ul>

          <h2>House system</h2>
          <HintMenu
            value={houseSystem}
            onChange={setHouseSystem}
            options={HOUSE_SYSTEMS}
          />

          <h2>Primary directions rate</h2>
          <HintMenu
            value={primaryRate}
            onChange={setPrimaryRate}
            options={PRIMARY_RATES}
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
            <span className="sidebar-title">Overlay</span>
            <span className="sidebar-chevron">
              {openSection === 'overlay' ? '▾' : '▸'}
            </span>
          </button>
          {openSection === 'overlay' && (
            <div className="sidebar-section">
              {isTimeMode && (
                <>
                  <h2>Display</h2>
                  <ul className="technique-list">
                    <li>
                      <button
                        type="button"
                        className={`tech-toggle ${showTimeline ? 'on' : 'off'}`}
                        onClick={() => setShowTimeline(!showTimeline)}
                        aria-pressed={showTimeline}
                      >
                        <EyeIcon open={showTimeline} />
                        <span className="name">Timeline bar</span>
                      </button>
                    </li>
                  </ul>
                </>
              )}

              {showPositioning && (
                <>
                  <h2>Positioning</h2>
                  <ul className="theme-list">
                    {POSITIONINGS.map(({ value, label, hint }) => (
                      <HintOption
                        key={value}
                        selected={transitFrame === value}
                        onSelect={() => setTransitFrame(value)}
                        label={label}
                        hint={hint}
                      />
                    ))}
                  </ul>
                </>
              )}

              {showChartAngle && (
                <>
                  <h2>Chart Angle</h2>
                  <ul className="theme-list">
                    {ANGLE_PROGRESSIONS.map(({ value, label, hint }) => (
                      <HintOption
                        key={value}
                        selected={angleProgression === value}
                        onSelect={() => setAngleProgression(value)}
                        label={label}
                        hint={hint}
                      />
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </>
      )}
    </aside>
  );
}
