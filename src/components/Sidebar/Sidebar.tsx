// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import {
  Fragment,
  type CSSProperties,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ASTEROID_NAMES,
  NODE_NAMES,
  PLANET_COLORS,
  POINTS,
  TRADITIONAL_PLANETS,
  type CoordSystem,
  type FortuneFormula,
  type HouseSystem,
  type LineSystem,
  type NodeType,
  type PlanetName,
} from '../../lib/ephemeris';
import type { LineType } from '../../lib/astro/lines';
import { overlayAuxBlocked } from '../../lib/astro/timeline';
import type {
  AngleProgression,
  OverlayMode,
  PrimaryRate,
} from '../../lib/astro/timeline';
import { LILITH_PANEL_GLYPH_EARTH, THEMES, type Theme } from '../../lib/theme';
import type { MapProjectionMode } from '../../lib/projection';
import { useViewLock } from '../../lib/extensions/viewLock';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import { ASPECT_GLYPHS, PLANET_GLYPHS } from '../../lib/astro/glyphChars';
import { ASPECT_NAMES, type AspectName, type AspectOrbs } from '../../lib/aspectPrefs';
import {
  orbZoneMax,
  paranOrbMax,
  PARAN_ORB_MIN,
  PARAN_ORB_STEP,
  type StarSetPref,
  type DistanceUnit,
} from '../../lib/overlayPrefs';
import type { ZodiacMode } from '../../lib/astro/ayanamsa';
import { planTierFor, tierMet, tierLabel, shouldShowNudge, nudgeAction, type PlanTier } from '../../lib/plan';
import { EyeIcon } from '../ui/EyeIcon';
import { CycleHotkey } from '../ui/CycleHotkey';
import {
  getSettingsSections,
  isEntitled,
} from '../../lib/extensions/settingsSection';
import { useHoverTip } from '../ui/useHoverTip';
import { glyphify } from '../ui/glyphify';
import { useT, LANGUAGES } from '../../i18n';
import type { Locale } from '../../i18n';
import { useTouchLayout } from '../../lib/touch';
import './Sidebar.css';

// The "Planets" filter group: the ten bodies + the two lunar nodes. Asteroids get
// their own section (and their own independent show/hide-all). The per-body display
// name + one-line theme now resolve from the catalog (planets.* via labels.*).
const PLANET_FILTERS: PlanetName[] = [...TRADITIONAL_PLANETS, ...NODE_NAMES];

interface SidebarProps {
  /** Touch only: dismiss the settings takeover (there's no `S` hotkey on a touch screen). */
  onClose?: () => void;
  /** Touch only: true while the dock is sliding out (parent keeps it mounted through the
   *  close animation). Drives the `is-closing` slide-out keyframe; `onSlideOutEnd` fires
   *  when that animation finishes so the parent can unmount. */
  closing?: boolean;
  onSlideOutEnd?: () => void;
  visiblePlanets: Set<PlanetName>;
  togglePlanet: (p: PlanetName) => void;
  setAllPlanets: (bodies: PlanetName[], visible: boolean) => void;
  visibleLineTypes: Set<LineType>;
  toggleLineType: (t: LineType) => void;
  setAllLineTypes: (visible: boolean) => void;
  showParans: boolean;
  setShowParans: (v: boolean) => void;
  showAspectLines: boolean;
  setShowAspectLines: (v: boolean) => void;
  showMidpointLines: boolean;
  setShowMidpointLines: (v: boolean) => void;
  /** The active overlay mode — grays the Parans & Midpoint toggles on
   *  Cyclocartography, where those families have no single sky-moment (see
   *  overlayAuxBlocked). */
  overlayMode: OverlayMode;
  showOrbZones: boolean;
  setShowOrbZones: (v: boolean) => void;
  orbZoneVal: number;
  setOrbZoneVal: (v: number) => void;
  orbZoneUnit: DistanceUnit;
  setOrbZoneUnit: (u: DistanceUnit) => void;
  paranOrbVal: number;
  setParanOrbVal: (v: number) => void;
  aspectOrbs: AspectOrbs;
  setAspectOrbs: (o: AspectOrbs) => void;
  /** The Aspect Lines window's open state (a gated-tier surface — the sub-row
   *  that opens it renders per the plan ladder's visibility rules). */
  aspectHudOpen: boolean;
  setAspectHudOpen: (v: boolean) => void;
  showStarLines: boolean;
  setShowStarLines: (v: boolean) => void;
  starSet: StarSetPref;
  setStarSet: (s: StarSetPref) => void;
  showNightShade: boolean;
  setShowNightShade: (v: boolean) => void;
  showZenith: boolean;
  setShowZenith: (v: boolean) => void;
  lineSystem: LineSystem;
  setLineSystem: (s: LineSystem) => void;
  /** Sidereal zodiac active (Advanced ▸ Zodiac ≠ tropical) — hides Geodetic,
   *  which is tropical-only by definition. */
  siderealActive: boolean;
  coordSystem: CoordSystem;
  setCoordSystem: (c: CoordSystem) => void;
  fortuneFormula: FortuneFormula;
  setFortuneFormula: (f: FortuneFormula) => void;
  houseSystem: HouseSystem;
  setHouseSystem: (h: HouseSystem) => void;
  zodiacMode: ZodiacMode;
  setZodiacMode: (m: ZodiacMode) => void;
  /** Whether the Advanced settings tab is shown — true whenever the Advanced toggle
   *  is on (it no longer also requires the expanded chart sidebar to be open). */
  showAdvancedTab: boolean;
  nodeType: NodeType;
  setNodeType: (n: NodeType) => void;
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

// Angle codes (As/Ds/MC/IC/Vx/Avx) are language-neutral button labels; the
// spelled-out tooltip resolves from the catalog (settings.lineType.*.hint via
// labels.lineTypeHint). The Vertex axis rows sit below As/Ds and default OFF.
const LINE_TYPES: { type: LineType; label: string }[] = [
  { type: 'MC', label: 'MC' },
  { type: 'IC', label: 'IC' },
  { type: 'ASC', label: 'As' },
  { type: 'DSC', label: 'Ds' },
  { type: 'VX', label: 'Vx' },
  { type: 'AVX', label: 'Avx' },
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
const FORTUNE_FORMULA_VALUES: FortuneFormula[] = ['sect', 'ptolemaic'];

const LINE_SYSTEM_VALUES: LineSystem[] = ['celestial', 'geodetic'];

const PROJECTION_VALUES: MapProjectionMode[] = ['2d', '3d'];

const HOUSE_SYSTEM_VALUES: HouseSystem[] = [
  'placidus', 'koch', 'regiomontanus', 'campanus', 'porphyry', 'alcabitus', 'meridian', 'morinus', 'whole', 'equal',
];

const NODE_TYPE_VALUES: NodeType[] = ['true', 'mean'];

// Exported so the timeline bar can build the same dropdowns — the Chart Angle and
// Pri.-directions Rate controls were relocated there from the Calculations tab.
export const ANGLE_PROGRESSION_VALUES: AngleProgression[] = [
  'sa-long', 'sa-ra', 'naibod-long', 'naibod-ra', 'mean-quotidian',
];

export const PRIMARY_RATE_VALUES: PrimaryRate[] = [
  'ptolemy', 'naibod', 'cardan', 'kepler-ra', 'solar-long', 'placidus-ra', 'user',
];

// Sidebar sections behave as an accordion — at most one open at a time — so the
// panel never grows into a tall stack of expanded sections. The open section is
// owned by App (so the Info chip can open the Calculation tab from outside).
// The four core sections, plus any id a downstream build registers via the
// settings-section seam (lib/extensions/settingsSection). The (string & {}) keeps
// autocomplete for the core ids while still accepting extension ids.
export type SidebarSection =
  | 'theme'
  | 'filters'
  | 'calc'
  | 'advanced'
  | (string & {});

// Sidebar hints use the shared useHoverTip with its default 'left' placement: the
// sidebar is docked at the screen's right edge, so cards pop left onto the open
// map, centred on the row (coordinates viewport-relative — the card is position:
// fixed). Using the shared hook (rather than a local copy) also gives every
// sidebar tip the same touch long-press as the rest of the app.

// The shared .ui-tip card (see index.css), portaled to <body> so the sidebar's
// overflow can't clip it. aria-hidden mirrors the timeline nub's hint: a sighted
// convenience, not the control's accessible name (the label carries that).
function ChoiceTip({
  pos,
  title,
  hint,
  hotkey,
  advanced,
}: {
  pos: { left: number; top: number } | null;
  title: ReactNode;
  hint: string;
  hotkey?: ReactNode;
  /** Show the "ADV" tag on the headline — marks the control as Advanced-only. */
  advanced?: boolean;
}) {
  if (!pos) return null;
  const hasHeadlineExtras = hotkey != null || advanced;
  return createPortal(
    <span
      className="ui-tip-box ui-tip choice-tip"
      style={{ left: pos.left, top: pos.top }}
      aria-hidden="true"
    >
      {hasHeadlineExtras ? (
        // Title shares one row with the ADV tag and/or the shared yellow hotkey pill
        // (.ui-tip-adv / .ui-tip-hotkey, see HoverTip.css); the hint wraps below.
        <span className="ui-tip-headline">
          <span className="ui-tip-title">{title}</span>
          {advanced && <span className="ui-tip-adv">ADV</span>}
          {hotkey != null && <span className="ui-tip-hotkey">{hotkey}</span>}
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
  disabled = false,
  disabledHint,
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
  /** Grayed, non-toggling state that KEEPS its hover tip (aria-disabled, not the
   *  native attribute, so the tip still fires) — used to explain via `disabledHint`
   *  why a family is unavailable under the active overlay. */
  disabled?: boolean;
  disabledHint?: string;
  children: ReactNode;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>();
  return (
    <li>
      <button
        ref={ref}
        type="button"
        className={disabled ? `${className} disabled` : className}
        onClick={(e) =>
          disabled ? undefined : e.shiftKey && onShiftClick ? onShiftClick() : onClick()
        }
        aria-pressed={disabled ? undefined : ariaPressed}
        aria-disabled={disabled || undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </button>
      <ChoiceTip
        pos={pos}
        title={title}
        hint={disabled && disabledHint ? disabledHint : hint}
        hotkey={disabled ? undefined : hotkey}
      />
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
  hotkey,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  hint: string;
  /** Optional keyboard shortcut, shown as the yellow pill in the hover tip. */
  hotkey?: ReactNode;
}) {
  return (
    <TipToggle
      className={`theme-option ${selected ? 'active' : ''}`}
      onClick={onSelect}
      title={label}
      hint={hint}
      hotkey={hotkey}
    >
      <span className="radio">{selected ? '●' : '○'}</span>
      <span className="label">{label}</span>
    </TipToggle>
  );
}

// A small "(i)" info icon that reveals its explanation as the same .ui-tip card
// the rest of the settings use (ChoiceTip: title + hint, popped to the left), so
// its shape matches every other hover in the panel rather than the shared
// HoverTip's plainer, title-only box.
export function InfoTip({
  title,
  hint,
  advanced,
}: {
  title: string;
  hint: string;
  /** Tag the tip's headline with "ADV" (an Advanced-only control). */
  advanced?: boolean;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLSpanElement>();
  return (
    <span
      ref={ref}
      className="orb-info"
      tabIndex={0}
      aria-label={title}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6" />
        <path d="M12 7.5v.5" />
      </svg>
      <ChoiceTip pos={pos} title={title} hint={hint} advanced={advanced} />
    </span>
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
  tier,
  locked,
}: {
  value: V;
  onChange: (v: V) => void;
  options: {
    value: V;
    label: string;
    hint: string;
    /** Optional leading symbol (rendered in the bundled glyph font). */
    glyph?: string;
    disabled?: boolean;
  }[];
  note?: string;
  /** The plan tier this WHOLE control belongs to — its badge renders on the
   *  trigger, exactly like the nav menus' plan-gated rows (see lib/plan). */
  tier?: PlanTier;
  /** Tier-locked teaser (the user hasn't reached `tier`): the trigger keeps its
   *  normal look (plus the badge) but a click routes to the nudge action (the
   *  account/upgrade flow) instead of opening the panel — so the control can't
   *  be opened or changed. Callers decide visibility (tierMet || shouldShowNudge),
   *  like the nav menus. */
  locked?: boolean;
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
        onClick={() => {
          if (locked) {
            nudgeAction(); // tier-locked teaser → the account/upgrade flow
            return;
          }
          setOpen((v) => !v);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="calc-menu-value">
          {current?.glyph && (
            <span className="astro-glyph hintmenu-glyph" aria-hidden="true">
              {current.glyph}
            </span>
          )}
          {current?.label ?? ''}
        </span>
        {/* The nav menus' tier badge, on the trigger — nothing for the baseline
            tier, or a gated tier whose downstream label is unset. */}
        {tier && tier !== 'new' && tierLabel(tier) && (
          <span className={`navmenu-tier tier-${tier}`}>{tierLabel(tier)}</span>
        )}
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
                glyph={o.glyph}
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
  glyph,
  selected,
  onSelect,
  disabled = false,
}: {
  label: string;
  hint: string;
  glyph?: string;
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
      {glyph && (
        <span className="astro-glyph hintmenu-glyph" aria-hidden="true">
          {glyph}
        </span>
      )}
      <span>{label}</span>
      {hint && <ChoiceTip pos={pos} title={label} hint={hint} />}
    </button>
  );
}

// The settings tab's ONE numeric field: a glyph + spelled-out label on the
// left, and a fixed-width input (sized for "359.59") with themed step chevrons
// flush right. Free typing with clamping; the display re-formats to `decimals`
// only when not mid-edit, so typing stays free. Used by the Primary-rate User
// rate, the Advanced tab's orb rows, and the Filters' orb-zone widths.
// A compact km / mi switch shown in place of the orb-zone width field's label: two segments,
// the active unit highlighted. The field's input carries its own aria-label, so this is just a
// labelled button group.
export function UnitToggle({
  unit,
  onChange,
  label,
}: {
  unit: DistanceUnit;
  onChange: (u: DistanceUnit) => void;
  label: string;
}) {
  return (
    <span className="orb-unit-toggle" role="group" aria-label={label}>
      {(['km', 'mi'] as const).map((u) => (
        <button
          key={u}
          type="button"
          className={`orb-unit-opt${unit === u ? ' on' : ''}`}
          aria-pressed={unit === u}
          onClick={() => onChange(u)}
        >
          {u}
        </button>
      ))}
    </span>
  );
}

export function StepperField({
  id,
  glyph,
  label,
  labelControl,
  value,
  onChange,
  min = 0,
  max = Infinity,
  step,
  decimals,
  ariaLabel,
}: {
  id: string;
  glyph?: string;
  label?: string;
  /** Custom content rendered in the label slot INSTEAD of `label` (e.g. a unit toggle). It's
   *  not a <label> (so it can hold a button); the input's name then comes from `ariaLabel`. */
  labelControl?: ReactNode;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step: number;
  /** Fixed decimal places shown when not editing (omit → plain String). */
  decimals?: number;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display =
    draft ??
    (Number.isFinite(value)
      ? decimals !== undefined
        ? value.toFixed(decimals)
        : String(value)
      : '');
  const clamp = (n: number) => Math.min(Math.max(n, min), max);
  const bump = (dir: 1 | -1) => {
    // Step on a rounded grid to avoid float drift.
    const base = Number.isFinite(value) ? value : min;
    onChange(clamp(Math.round((base + dir * step) * 100) / 100));
    setDraft(null);
  };
  return (
    <div className="calc-user-rate">
      {labelControl !== undefined ? (
        <div className="calc-user-rate-label calc-user-rate-label-control">{labelControl}</div>
      ) : (
        <label className="calc-user-rate-label" htmlFor={id}>
          {glyph && (
            <span className="astro-glyph orb-field-glyph" aria-hidden="true">
              {glyph}
            </span>
          )}
          {label}
        </label>
      )}
      <input
        id={id}
        type="text"
        inputMode="decimal"
        className="thud-select calc-user-rate-input"
        value={display}
        aria-label={ariaLabel}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(clamp(n));
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
  theme,
}: {
  planet: PlanetName;
  on: boolean;
  onToggle: () => void;
  /** Shift+click handler — used for "show / hide all planets". */
  onShiftClick?: () => void;
  theme: Theme;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>();
  const { labels } = useT();
  // Lilith's muted purple is hard to read against Earth's dark-brown settings panel,
  // so its glyph in this list (only) uses a brighter lavender on Earth. Every other
  // body — and every theme but Earth — keeps its canonical PLANET_COLORS tint.
  const glyphColor =
    planet === 'Lilith' && theme === 'vintage'
      ? LILITH_PANEL_GLYPH_EARTH
      : PLANET_COLORS[planet];
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
          color={glyphColor}
          className="planet-toggle-icon"
        />
        <span className="name">{labels.planet(planet)}</span>
      </button>
      <ChoiceTip
        pos={pos}
        title={
          <span className="planet-tip-title">
            <PlanetGlyph planet={planet} size={14} color={glyphColor} />
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
export function Sidebar({
  visiblePlanets,
  togglePlanet,
  setAllPlanets,
  visibleLineTypes,
  toggleLineType,
  setAllLineTypes,
  showParans,
  setShowParans,
  showAspectLines,
  setShowAspectLines,
  showMidpointLines,
  setShowMidpointLines,
  overlayMode,
  showOrbZones,
  setShowOrbZones,
  orbZoneVal,
  setOrbZoneVal,
  orbZoneUnit,
  setOrbZoneUnit,
  paranOrbVal,
  setParanOrbVal,
  aspectOrbs,
  setAspectOrbs,
  aspectHudOpen,
  setAspectHudOpen,
  showStarLines,
  setShowStarLines,
  starSet,
  setStarSet,
  showNightShade,
  setShowNightShade,
  showZenith,
  setShowZenith,
  lineSystem,
  setLineSystem,
  siderealActive,
  coordSystem,
  setCoordSystem,
  fortuneFormula,
  setFortuneFormula,
  houseSystem,
  setHouseSystem,
  zodiacMode,
  setZodiacMode,
  showAdvancedTab,
  nodeType,
  setNodeType,
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
  onClose,
  closing,
  onSlideOutEnd,
}: SidebarProps) {
  const { t, labels, locale, setLocale } = useT();
  const touch = useTouchLayout();
  // Which orb the Advanced ▸ Aspect orbs editor currently shows: one dropdown
  // pick + one stepper, instead of seven stacked rows.
  const [orbPick, setOrbPick] = useState<AspectName | 'luminaries' | 'declination'>(
    'conjunction',
  );
  // The House-system / Primary-rate dropdowns need {value,label,hint} rows; build
  // them from the value lists + the shared catalog accessors.
  const houseSystemOptions = HOUSE_SYSTEM_VALUES.map((value) => ({
    value,
    label: labels.houseSystem(value),
    hint: labels.houseSystemHint(value),
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

  // (Every overlay now hosts its own controls on its bottom-center HUD — time
  // overlays' display drawer + positioning switch on the timeline bar, synastry's
  // relationship builder on the synastry bar, and the eclipse vitals/contacts/
  // toggles on the EclipseHud — so the Sidebar no longer has an "Overlay" tab.)

  // Roads and rivers now share one toggle: "on" if either basemap layer shows,
  // and clicking flips both together.
  const roadsRiversOn = showRoads || showRivers;

  // While a registered surface owns the viewport (lib/extensions/viewLock), the
  // rows that only affect the MAP surface park: basemap details, night shade,
  // projection, the map-drawn zones/stamps/line-family layers, and the aspect
  // orb editor those gate. Rows that shape what the owner drapes (planets/angles
  // filters, Fortune formula, calculation choices) stay.
  const viewParked = useViewLock() !== null;
  // The Advanced tab under that lock: Display, Lines and Aspect orbs all park,
  // leaving only the Fortune-formula choice — which exists in zodiacal frames
  // alone. When nothing at all would show, the TAB parks, heading included (the
  // empty-section rule, one level up). Keep in sync with the section conditions
  // in the tab body below.
  const advancedTabParked =
    viewParked && !(lineSystem === 'geodetic' || coordSystem === 'zodiaco');

  // The plan tier, derived from the Advanced flag exactly as App derives it (a
  // downstream resolver may lift it further — see lib/plan). Gates the Calculation
  // tab's House-system + Zodiac dropdowns (teased nav-menu-style below the tier)
  // and the Advanced tab's Aspect Lines window opener (gated rung).
  const planTier = planTierFor(showAdvancedTab);
  const advUnlocked = tierMet(planTier, 'adv');
  const gatedUnlocked = tierMet(planTier, 'gated');
  // The gated rung's compact badge — '' in builds that set no label, so guard renders.
  const gatedBadge = tierLabel('gated');

  return (
    <aside
      className={`sidebar${closing ? ' is-closing' : ''}`}
      onAnimationEnd={(e) => {
        // Only the dock's OWN slide-out should trigger the deferred unmount — ignore child
        // animations that bubble up (e.g. the Advanced shimmer) and the slide-in on open.
        if (closing && e.target === e.currentTarget) onSlideOutEnd?.();
      }}
    >
      {touch && (
        <button type="button" className="sidebar-close" onClick={() => onClose?.()} aria-label="Close settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
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
        <div className="sidebar-section">
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

          {/* The whole Details section is map-surface-only (basemap linework,
              basemap text, the map's night shading), so it parks AS A SECTION
              while a registered surface owns the viewport — an owner brings its
              own equivalents (e.g. a day/night layer of its own). */}
          {!viewParked && (
            <>
          <h2>{t('settings.headings.details')}</h2>
          <ul className="technique-list">
            {/* Roads and rivers share one switch — both are low-emphasis basemap
                linework, so a single toggle covers them. */}
            <TipToggle
              className={`tech-toggle ${roadsRiversOn ? 'on' : 'off'}`}
              onClick={() => {
                const next = !roadsRiversOn;
                setShowRoads(next);
                setShowRivers(next);
              }}
              ariaPressed={roadsRiversOn}
              title={t('settings.details.roadsRivers')}
              hotkey="Shift R"
              hint={t('settings.details.roadsRiversHint')}
            >
              <EyeIcon open={roadsRiversOn} />
              <span className="name">{t('settings.details.roadsRivers')}</span>
            </TipToggle>
            {/* "Names/Labels" hides basemap text (city / country names); named so
                it isn't mistaken for the ACG line-label badges. */}
            <TipToggle
              className={`tech-toggle ${showLabels ? 'on' : 'off'}`}
              onClick={() => setShowLabels(!showLabels)}
              ariaPressed={showLabels}
              title={t('settings.details.placeNames')}
              hotkey="Shift L"
              hint={t('settings.details.placeNamesHint')}
            >
              <EyeIcon open={showLabels} />
              <span className="name">{t('settings.details.placeNames')}</span>
            </TipToggle>
            {/* Night Shade — shades the night half of Earth. */}
            <TipToggle
              className={`tech-toggle ${showNightShade ? 'on' : 'off'}`}
              onClick={() => setShowNightShade(!showNightShade)}
              ariaPressed={showNightShade}
              title={t('settings.nightShade.title')}
              hotkey="Shift N"
              hint={t('settings.nightShade.hint')}
            >
              <EyeIcon open={showNightShade} />
              <span className="name">{t('settings.nightShade.title')}</span>
            </TipToggle>
          </ul>
            </>
          )}

          {!viewParked && (
            <>
              <h2>{t('settings.headings.projection')}</h2>
              <ul className="theme-list">
                {PROJECTION_VALUES.map((value) => (
                  <HintOption
                    key={value}
                    selected={projection === value}
                    onSelect={() => setProjection(value)}
                    label={labels.projection(value)}
                    hint={labels.projectionHint(value)}
                    hotkey={<CycleHotkey label="Shift F" />}
                  />
                ))}
              </ul>
            </>
          )}

          {/* Language sits last, below the map-facing detail + projection controls. */}
          <h2>{t('settings.headings.language')}</h2>
          <HintMenu<string>
            value={locale}
            onChange={(code) => setLocale(code as Locale)}
            options={languageOptions}
          />
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
                theme={theme}
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
                theme={theme}
              />
            ))}
          </ul>

          {/* Points (the Part of Fortune) — an advanced calculated Lot that draws
              lines only In-Zodiaco (and geodetic, which also projects onto the
              ecliptic). A Lot has no sky position, so In-Mundo can't place it —
              there the whole section (heading included) is hidden, keeping the
              filter list to what the current projection can actually draw. Because
              the section only appears where Fortune DOES draw, its (i) hint needn't
              explain the projection at all — just the Lot and its relocation. */}
          {(lineSystem === 'geodetic' || coordSystem === 'zodiaco') && (
            <>
              <h2 className="info-heading">
                {t('settings.headings.points')}
                <InfoTip
                  title={t('settings.headings.points')}
                  hint={t('settings.points.hint')}
                  advanced
                />
              </h2>
              <ul className="planet-grid">
                {POINTS.map((p) => (
                  <PlanetToggle
                    key={p}
                    planet={p}
                    on={visiblePlanets.has(p)}
                    onToggle={() => togglePlanet(p)}
                    onShiftClick={() => setAllPlanets(POINTS, !visiblePlanets.has(p))}
                    theme={theme}
                  />
                ))}
              </ul>
            </>
          )}

          <h2>{t('settings.headings.angles')}</h2>
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
            {LINE_SYSTEM_VALUES.filter(
              // Geodetic (Mundane) is tropical-only — hidden in sidereal mode
              // (mirrors how local space is withheld in geodetic mode).
              (value) => value !== 'geodetic' || !siderealActive,
            ).map((value) => (
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

          {/* House system + zodiac frame, relocated here from the Advanced tab —
              calculation choices belong together. Houses only shape the wheel's
              cusps and the zodiac is a display frame (neither moves a map line).
              BOTH dropdowns belong to the ADV rung: badged like the nav menus'
              plan-gated rows and LOCKED whole (the trigger won't open — a click
              routes to the account/upgrade flow) until the plan reaches it, or
              hidden entirely when the build doesn't nudge. While locked, the
              zodiac trigger also DISPLAYS tropical — the effective frame (App
              coerces the same way) — so a stale sidereal pref can't show as
              selected while it isn't actually applied. */}
          {(advUnlocked || shouldShowNudge('adv')) && (
            <>
              <h2>{t('settings.headings.houseSystem')}</h2>
              <HintMenu
                value={houseSystem}
                onChange={setHouseSystem}
                options={houseSystemOptions}
                tier="adv"
                locked={!advUnlocked}
              />

              <h2>{t('settings.headings.zodiac')}</h2>
              <HintMenu
                value={advUnlocked ? zodiacMode : 'tropical'}
                onChange={setZodiacMode}
                options={(['tropical', 'lahiri', 'fagan-bradley'] as const).map((m) => ({
                  value: m,
                  label: t(`settings.zodiac.${m}.label`),
                  hint: t(`settings.zodiac.${m}.hint`),
                }))}
                tier="adv"
                locked={!advUnlocked}
              />
            </>
          )}
        </div>
      )}

      {/* Advanced: the chart wheel's READING preferences — display toggles and
          aspect orbs. None of these move a single map line (orbs gate the aspect
          lists), which is the membership rule for this tab. (House system + zodiac
          frame moved to the Calculation tab, where the sidereal frames tease the
          ADV rung instead of hiding.) It appears whenever Advanced mode is on
          (showAdvancedTab), regardless of whether the expanded chart sidebar is open. */}
      {showAdvancedTab && !advancedTabParked && (
        <button
          type="button"
          className="sidebar-header sidebar-header-accent sidebar-accent-advanced"
          onClick={() => toggleSection('advanced')}
          aria-expanded={openSection === 'advanced'}
        >
          <span className="sidebar-title">{t('settings.sections.advanced')}</span>
          <span className="sidebar-chevron">{openSection === 'advanced' ? '▾' : '▸'}</span>
        </button>
      )}

      {showAdvancedTab && !advancedTabParked && openSection === 'advanced' && (
        <div className="sidebar-section sidebar-section-accent sidebar-accent-advanced">
          {/* Display + Lines overlay toggles, consolidated into Advanced from
              the Appearance and Map-filter sections. Their Shift-key shortcuts
              still work even while this section is collapsed/hidden. */}
          {/* The whole Display section draws on the map only (zenith/nadir
              stamps, orb zones), so while a surface owns the viewport it parks
              AS A SECTION — hiding every row but leaving the heading would
              read as a bug. */}
          {!viewParked && (
            <>
          <h2>{t('settings.headings.display')}</h2>
          <ul className="technique-list">
            {/* Zenith stamps (overhead, circle) + antipodal nadir stamps
                (underfoot, diamond) and the ecliptic reference curve. */}
            <TipToggle
              className={`tech-toggle ${showZenith ? 'on' : 'off'}`}
              onClick={() => setShowZenith(!showZenith)}
              ariaPressed={showZenith}
              title={t('settings.zenithNadir.title')}
              hotkey="Shift Z"
              hint={t('settings.zenithNadir.hint')}
            >
              <EyeIcon open={showZenith} />
              <span className="name">{t('settings.zenithNadir.title')}</span>
            </TipToggle>
            {/* Orb zones — the soft influence band around each line; its width
                steppers reveal when it's on. */}
            <TipToggle
              className={`tech-toggle ${showOrbZones ? 'on' : 'off'}`}
              onClick={() => setShowOrbZones(!showOrbZones)}
              ariaPressed={showOrbZones}
              title={t('settings.orbZones.title')}
              hotkey="Shift O"
              hint={t('settings.orbZones.hint')}
            >
              <EyeIcon open={showOrbZones} />
              <span className="name">{t('settings.orbZones.title')}</span>
            </TipToggle>
            {showOrbZones && (
              <li className="orb-zone-row orb-zone-steppers">
                <StepperField
                  id="orb-zone-width"
                  labelControl={
                    <UnitToggle
                      unit={orbZoneUnit}
                      onChange={setOrbZoneUnit}
                      label={t('settings.orbZones.unitAria')}
                    />
                  }
                  value={orbZoneVal}
                  onChange={setOrbZoneVal}
                  min={25}
                  max={orbZoneMax(orbZoneUnit)}
                  step={25}
                  ariaLabel={t('settings.orbZones.lineAria')}
                />
                <StepperField
                  id="orb-zone-paran"
                  label={`${t('settings.orbZones.paranLabel')} (${orbZoneUnit})`}
                  value={paranOrbVal}
                  onChange={setParanOrbVal}
                  min={PARAN_ORB_MIN}
                  max={paranOrbMax(orbZoneUnit)}
                  step={PARAN_ORB_STEP}
                  ariaLabel={t('settings.orbZones.paranAria')}
                />
              </li>
            )}
          </ul>
            </>
          )}

          {/* Under a view lock the WHOLE section parks, heading included:
              parans and fixed stars draw on the map only (a viewport owner
              shows its own named-star layer), and the aspect/midpoint families
              are illegible at that scale, so the owner drops them from its
              drape and their toggles follow. */}
          {!viewParked && (
            <>
          <h2>{t('settings.headings.lines')}</h2>
          <ul className="technique-list">
            <TipToggle
              className={`tech-toggle ${showParans ? 'on' : 'off'}`}
              onClick={() => setShowParans(!showParans)}
              ariaPressed={showParans}
              disabled={overlayAuxBlocked(overlayMode, 'paran')}
              disabledHint={t('settings.parans.blockedCyclo')}
              title={t('settings.parans.title')}
              hotkey="Shift P"
              hint={t('settings.parans.hint')}
            >
              <EyeIcon open={showParans} />
              <span className="name">{t('settings.parans.title')}</span>
            </TipToggle>
            <TipToggle
              className={`tech-toggle ${showStarLines ? 'on' : 'off'}`}
              onClick={() => setShowStarLines(!showStarLines)}
              ariaPressed={showStarLines}
              title={t('settings.starLines.title')}
              hotkey="Shift S"
              hint={t('settings.starLines.hint')}
            >
              <EyeIcon open={showStarLines} />
              <span className="name">{t('settings.starLines.title')}</span>
            </TipToggle>
            {showStarLines && (
              <li className="orb-zone-row">
                <HintMenu
                  value={starSet}
                  onChange={setStarSet}
                  options={[
                    {
                      value: 'bright',
                      label: t('settings.starLines.bright'),
                      hint: t('settings.starLines.brightHint'),
                    },
                    {
                      value: 'all',
                      label: t('settings.starLines.all'),
                      hint: t('settings.starLines.allHint'),
                    },
                  ]}
                />
              </li>
            )}
            <TipToggle
              className={`tech-toggle ${showMidpointLines ? 'on' : 'off'}`}
              onClick={() => setShowMidpointLines(!showMidpointLines)}
              ariaPressed={showMidpointLines}
              disabled={overlayAuxBlocked(overlayMode, 'midpoint')}
              disabledHint={t('settings.midpointLines.blockedCyclo')}
              title={t('settings.midpointLines.title')}
              hotkey="Shift M"
              hint={t('settings.midpointLines.hint')}
            >
              <EyeIcon open={showMidpointLines} />
              <span className="name">{t('settings.midpointLines.title')}</span>
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
            {/* The Aspect Lines window opener — reveals while the toggle is on
                (like the star-set row under Fixed Stars). A GATED-rung control
                (lib/plan): badged, shown once the plan reaches the rung or as a
                clickable upgrade teaser when the build nudges it, hidden
                otherwise. */}
            {showAspectLines && (gatedUnlocked || shouldShowNudge('gated')) && (
              <TipToggle
                className={`thud-select calc-menu-trigger aspect-hud-open ${gatedUnlocked && aspectHudOpen ? 'open' : ''}`}
                onClick={() => {
                  if (!gatedUnlocked) {
                    nudgeAction(); // tier-locked teaser → the account/upgrade flow
                    return;
                  }
                  setAspectHudOpen(!aspectHudOpen);
                }}
                ariaPressed={gatedUnlocked && aspectHudOpen}
                title={t('settings.aspectLines.openHud')}
                hint={t('settings.aspectLines.openHudHint')}
              >
                <span className="calc-menu-value">{t('settings.aspectLines.openHud')}</span>
                {gatedBadge && (
                  <span className="navmenu-tier tier-gated">{gatedBadge}</span>
                )}
              </TipToggle>
            )}
          </ul>
            </>
          )}

          {/* Part of Fortune formula: the sect-based (day/night) default vs the
              fixed Ptolemaic convention — a genuine historical divide whose two
              results can land on different continents, so the choice is explicit.
              Shown only where Fortune draws (In-Zodiaco / geodetic), matching its
              Points filter section, so it's absent when the Lot itself is. */}
          {(lineSystem === 'geodetic' || coordSystem === 'zodiaco') && (
            <>
              <h2>{t('settings.headings.fortuneFormula')}</h2>
              <ul className="theme-list">
                {FORTUNE_FORMULA_VALUES.map((value) => (
                  <HintOption
                    key={value}
                    selected={fortuneFormula === value}
                    onSelect={() => setFortuneFormula(value)}
                    label={labels.fortuneFormula(value)}
                    hint={labels.fortuneFormulaHint(value)}
                  />
                ))}
              </ul>
            </>
          )}

          {/* The compact orb editor stands down while the Aspects window is actually
              MOUNTED (toggle on + tier reached + open) — that window lays every orb
              out at once, so showing both would be two live editors of one store.
              It also parks under a view lock, with the aspect lines it gates. */}
          {!viewParked && !(showAspectLines && gatedUnlocked && aspectHudOpen) && (
            <>
          <h2 className="orb-heading">
            {t('settings.headings.aspectOrbs')}
            <InfoTip
              title={t('settings.headings.aspectOrbs')}
              hint={t('settings.aspectOrbs.hint')}
            />
          </h2>
          {/* One orb at a time: the dropdown picks WHICH orb, the stepper below
              edits the picked one (instead of seven stacked rows). */}
          <HintMenu
            value={orbPick}
            onChange={(v) => setOrbPick(v as typeof orbPick)}
            options={[
              ...ASPECT_NAMES.map((n) => ({
                value: n as string,
                label: t(`expandedSidebar.aspect.${n}.name`),
                hint: t(`expandedSidebar.aspect.${n}.desc`),
                glyph: ASPECT_GLYPHS[n],
              })),
              {
                value: 'luminaries',
                label: t('settings.aspectOrbs.lumLabel'),
                hint: t('settings.aspectOrbs.lumHint'),
                glyph: `${PLANET_GLYPHS.Sun}/${PLANET_GLYPHS.Moon}`,
              },
              {
                value: 'declination',
                label: t('settings.aspectOrbs.declinationLabel'),
                hint: t('expandedSidebar.aspect.parallel.desc'),
                glyph: '∥',
              },
            ]}
          />
          {orbPick === 'luminaries' ? (
            <StepperField
              id="aspect-orb-active"
              label={t('settings.aspectOrbs.setDegrees')}
              value={aspectOrbs.luminaryBonus}
              max={5}
              step={0.5}
              onChange={(v) => setAspectOrbs({ ...aspectOrbs, luminaryBonus: v })}
              ariaLabel={t('settings.aspectOrbs.lumAria')}
            />
          ) : orbPick === 'declination' ? (
            <StepperField
              id="aspect-orb-active"
              label={t('settings.aspectOrbs.setDegrees')}
              value={aspectOrbs.declinationOrb}
              max={3}
              step={0.25}
              onChange={(v) => setAspectOrbs({ ...aspectOrbs, declinationOrb: v })}
              ariaLabel={t('settings.aspectOrbs.declinationAria')}
            />
          ) : (
            <StepperField
              id="aspect-orb-active"
              label={t('settings.aspectOrbs.setDegrees')}
              value={aspectOrbs.orbs[orbPick]}
              max={15}
              step={0.5}
              onChange={(v) =>
                setAspectOrbs({
                  ...aspectOrbs,
                  orbs: { ...aspectOrbs.orbs, [orbPick]: v },
                })
              }
              ariaLabel={t('settings.aspectOrbs.orbAria', {
                aspect: t(`expandedSidebar.aspect.${orbPick}.name`),
              })}
            />
          )}
            </>
          )}
        </div>
      )}

      {/* Downstream-registered sections (settings-section seam) — a 5th+ tab added
          outside core. The header always shows; the body is the controls when
          entitled, else the gated CTA. Empty in the open core. */}
      {getSettingsSections().map((ext) => {
        // A conditional section (header included) stands down while its
        // visibility predicate says so — e.g. it configures a surface that
        // isn't currently active.
        if (ext.visible && !ext.visible()) return null;
        // A registered section opts into the coloured (Advanced-style) treatment by
        // supplying accentRgb; the shared --section-accent-rgb drives both header + body.
        const accentStyle = ext.accentRgb
          ? ({ '--section-accent-rgb': ext.accentRgb } as CSSProperties)
          : undefined;
        return (
          <Fragment key={ext.id}>
            <button
              type="button"
              className={ext.accentRgb ? 'sidebar-header sidebar-header-accent' : 'sidebar-header'}
              style={accentStyle}
              onClick={() => toggleSection(ext.id)}
              aria-expanded={openSection === ext.id}
            >
              <span className="sidebar-title">{ext.label}</span>
              <span className="sidebar-chevron">{openSection === ext.id ? '▾' : '▸'}</span>
            </button>
            {openSection === ext.id && (
              <div
                className={
                  ext.accentRgb ? 'sidebar-section sidebar-section-accent' : 'sidebar-section'
                }
                style={accentStyle}
              >
                {isEntitled(ext) ? ext.render() : null}
              </div>
            )}
          </Fragment>
        );
      })}
    </aside>
  );
}
