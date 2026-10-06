// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import {
  Fragment,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  MINOR_BODIES,
  PLANET_COLORS,
  POINT_BODIES,
  TRADITIONAL_PLANETS,
  type CoordSystem,
  type FortuneFormula,
  type HouseSystem,
  type LineSystem,
  type NodeType,
  type PlanetName,
} from '../../lib/ephemeris';
import { LINE_TYPE_LABEL, type LineType } from '../../lib/astro/lines';
import { overlayAuxBlocked } from '../../lib/astro/timeline';
import type { OverlayMode } from '../../lib/astro/timeline';
import { LILITH_PANEL_GLYPH_EARTH, THEMES, type Theme } from '../../lib/theme';
import type { MapProjectionMode } from '../../lib/projection';
import { useViewLock } from '../../lib/extensions/viewLock';
import { GEODETIC_HELD } from '../../lib/geodeticHold';
import { skyHeldFor } from '../../lib/skyHold';
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
import { setDiscreet, useDiscreet } from '../../lib/discreet';
import { watchSettled } from '../../lib/hudSettled';
import type { ZodiacMode } from '../../lib/astro/ayanamsa';
import type { RulershipScheme } from '../../lib/astro/dignities';
import { planTierFor, tierMet, tierLabel, shouldShowTierBadge, shouldShowNudge, nudgeAction, type PlanTier } from '../../lib/plan';
import { EyeIcon } from '../ui/EyeIcon';
import { SpyIcon } from '../ui/SpyIcon';
import { CycleHotkey } from '../ui/CycleHotkey';
import { SplitSelect } from '../ui/SplitSelect';
import {
  getSettingsSections,
  isEntitled,
} from '../../lib/extensions/settingsSection';
import { useHoverTip, useTipEdgeNudge, type TipPlacement } from '../ui/useHoverTip';
import { HoverTip } from '../ui/HoverTip';
import { tipMaxWidthStyle } from '../ui/tipWidth';
import { glyphify } from '../ui/glyphify';
import { useT, LANGUAGES } from '../../i18n';
import type { Locale } from '../../i18n';
import { useTouchLayout } from '../../lib/touch';
import './Sidebar.css';

// The body filter groups are the shared classes from lib/ephemeris —
// TRADITIONAL_PLANETS / POINT_BODIES / MINOR_BODIES — so this panel groups bodies
// the same way every other body-grouping surface does. Each section carries its own
// independent show/hide-all (shift-click). The per-body display name + one-line
// theme resolve from the catalog (planets.* via labels.*).

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
  /** The sixth button under Minor bodies — "More", which opens the Minor bodies
   *  window. `open` is the window's RAW open flag (App holds it, never clears it,
   *  while Advanced is off); `shown` / `held` are catalog bodies drawn / held by a
   *  closed source right now (derived, for the button's badges). */
  minorMore: { open: boolean; onToggle: () => void; shown: number; held: number };
  /** The PREFERENCE, not the drawn set: on a geodetic map the Vx/Avx buttons keep
   *  showing the reader's choice, greyed, while App masks the axis out of what is
   *  drawn (2026-10-02). */
  visibleLineTypes: Set<LineType>;
  toggleLineType: (t: LineType) => void;
  setAllLineTypes: (visible: boolean) => void;
  /** Advanced ▸ Lines ▸ Natal Lines — the RAW preference, so the row shows what the
   *  user chose even while Advanced masks it. */
  showNatalLines: boolean;
  setShowNatalLines: (v: boolean) => void;
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
  /** The DERIVED line system. It also decides the sky hold (lib/skyHold): on a
   *  geodetic map the controls for what reads the sky's turning grey with
   *  settings.inert.skyHeld, each still showing its stored choice (2026-10-02). */
  lineSystem: LineSystem;
  setLineSystem: (s: LineSystem) => void;
  /** Sidereal zodiac active (Advanced ▸ Zodiac ≠ tropical) — greys Geodetic,
   *  which is tropical-only by definition. */
  siderealActive: boolean;
  /** Calculation ▸ Geodetic grid (lib/astro/geodeticGrid). Each value is what its eye shows:
   *  the stored choice — except `asc`, which is the DERIVED state (the auto default resolved),
   *  while `setAsc` stores the reader's choice from then on. Absent: the block isn't drawn. */
  geoGrid?: {
    mc: boolean;
    setMc: (v: boolean) => void;
    asc: boolean;
    setAsc: (v: boolean) => void;
    zones: boolean;
    setZones: (v: boolean) => void;
    presentation: boolean;
    setPresentation: (v: boolean) => void;
  };
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
  /** Which school's rulerships the essential-dignity list reads. Its only consumer
   *  is that list, which is Advanced-only — hence the row's own gate below. */
  rulershipScheme: RulershipScheme;
  setRulershipScheme: (s: RulershipScheme) => void;
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

// Angle codes (AS/MC/DS/IC/Vx/Avx) are language-neutral button labels; the
// spelled-out tooltip resolves from the catalog (settings.lineType.*.hint via
// labels.lineTypeHint). In the display order AS, MC, DS, IC (2026-10-02), which the
// two-column grid lays out as the horizon pair on the left and the meridian pair on
// the right. The Vertex axis rows sit below them and default OFF. The labels are the
// lines' own (LINE_TYPE_LABEL), so a button and the line it filters say the same code.
const LINE_TYPES: { type: LineType; label: string }[] = (
  ['ASC', 'MC', 'DSC', 'IC', 'VX', 'AVX'] as const
).map((type) => ({ type, label: LINE_TYPE_LABEL[type] }));

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

// Oldest first, which is also narrowest first: Modern is the classical table
// plus the outer three, so it reads as an extension of the row above it.
const RULERSHIP_SCHEME_VALUES: RulershipScheme[] = ['traditional', 'modern'];

// (The arc/angle and Pri.-directions Rate orderings used to live here and be exported,
// from when this panel drew those dropdowns. All three controls are on the timeline bar
// now, which is their only consumer, so the lists went with them — see TimelineHud.)

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
//
// The default is a default, not a rule. These controls are shared, and a surface
// docked against the OTHER edge needs the mirror — a card popping left there
// opens back across the panel, over the heading it belongs to and the rows under
// it. Such callers pass placement='right'; the anchor point and the card's
// transform both follow it, which is why the two travel together.

// The shared .ui-tip card (see index.css), portaled to <body> so the sidebar's
// overflow can't clip it. aria-hidden mirrors the timeline nub's hint: a sighted
// convenience, not the control's accessible name (the label carries that).
function ChoiceTip({
  pos,
  title,
  hint,
  note,
  hotkey,
  advanced,
  gated,
  unavailable,
  placement = 'left',
}: {
  pos: { left: number; top: number } | null;
  title: ReactNode;
  hint: string;
  /** A second line under the hint — why an unavailable control is unavailable
   *  (see .ui-inert), which ADDS to the control's normal explanation rather than
   *  replacing it. */
  note?: string;
  hotkey?: ReactNode;
  /** Show the "ADV" tag on the headline — marks the control as Advanced-only. */
  advanced?: boolean;
  /** Show the gated rung's tag (the label a downstream build gives its top rung)
   *  on the headline — the same mark the shared HoverTip puts on a gated control,
   *  so a row badged in the sidebar is badged in its tip too. */
  gated?: boolean;
  /** The control can't be clicked under the current settings: swap the hotkey
   *  chip for the grey .ui-hover badge. A key pill on a control that won't
   *  respond would be a lie, so the two never show together. */
  unavailable?: boolean;
  /** Which side of its trigger the card sits on. Defaults to LEFT, which is
   *  right for a panel docked against the right edge — the card opens into the
   *  map. A surface docked the other way wants the mirror, or the card opens
   *  back over the very rows it is explaining. Must match the placement the
   *  trigger's useHoverTip() was given: that decides the anchor POINT, this
   *  decides which way the card hangs off it. */
  placement?: TipPlacement;
}) {
  // Same edge-nudge every other tip card gets — the sidebar is docked right and
  // these cards pop LEFT, so a wide one near a narrow window's edge would other-
  // wise hang off it. (Hook first: it must run on every render, tip or no tip.)
  const cardRef = useTipEdgeNudge<HTMLSpanElement>(pos);
  if (!pos) return null;
  // Derived ONCE: the badge policy can suppress the tag, and a headline row laid out for a
  // tag that then doesn't render would be an empty row.
  const advTag = advanced && shouldShowTierBadge('adv');
  // Same policy check for the paid rung, plus the LABEL: a build that names no
  // gated tier would otherwise lay out a headline row around an empty tag.
  const gatedTag = gated && shouldShowTierBadge('gated') ? tierLabel('gated') : '';
  const hasHeadlineExtras = hotkey != null || advTag || !!gatedTag || unavailable;
  return createPortal(
    <span
      ref={cardRef}
      className={`ui-tip-box ui-tip choice-tip choice-tip-${placement}`}
      // Width scales with the copy (see tipWidth) — the settings hints run from
      // three words to a full paragraph, and one flat cap can't serve both.
      style={{ left: pos.left, top: pos.top, ...tipMaxWidthStyle(title, hint, note) }}
      aria-hidden="true"
    >
      {hasHeadlineExtras ? (
        // Title shares one row with the ADV tag and/or the shared yellow hotkey pill
        // (.ui-tip-adv / .ui-tip-hotkey, see HoverTip.css); the hint wraps below.
        <span className="ui-tip-headline">
          <span className="ui-tip-title">{title}</span>
          {advTag && <span className="ui-tip-adv">ADV</span>}
          {gatedTag && <span className="ui-tip-gated">{gatedTag}</span>}
          {unavailable ? (
            <span className="ui-hover">N/A</span>
          ) : (
            hotkey != null && <span className="ui-tip-hotkey">{hotkey}</span>
          )}
        </span>
      ) : (
        <span className="ui-tip-title">{title}</span>
      )}
      {/* Astro symbols in the hint copy render with the bundled glyph font. */}
      <span className="ui-tip-sub">{glyphify(hint)}</span>
      {note && <span className="ui-tip-sub ui-tip-note">{glyphify(note)}</span>}
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
  advanced,
  gated,
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
  /** THE standard unavailable state (see the .ui-inert utility): the current
   *  settings have switched this control off, so it can't be clicked. Dimmed +
   *  dashed, aria-disabled rather than natively disabled so the hover tip still
   *  fires, with `disabledHint` naming the setting to change and the grey N/A
   *  badge replacing the hotkey chip. */
  disabled?: boolean;
  disabledHint?: string;
  /** Tag the tip's headline "ADV" (the control needs Advanced reading mode). */
  advanced?: boolean;
  /** Tag the tip's headline with the gated rung's label (the control is on the
   *  paid rung). Pair it with the row's own badge so the two always agree. */
  gated?: boolean;
  children: ReactNode;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>();
  return (
    <li>
      <button
        ref={ref}
        type="button"
        className={disabled ? `${className} disabled ui-inert` : className}
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
        hint={hint}
        note={disabled ? disabledHint : undefined}
        hotkey={hotkey}
        advanced={advanced}
        gated={gated}
        unavailable={disabled}
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
  disabled,
  disabledHint,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  hint: string;
  /** Optional keyboard shortcut, shown as the yellow pill in the hover tip. */
  hotkey?: ReactNode;
  /** THE standard unavailable state (.ui-inert), forwarded to TipToggle: an option
   *  a choice list can't offer right now stays VISIBLE and says why, rather than
   *  disappearing and taking the explanation with it. `disabledHint` names the
   *  setting to change. */
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <TipToggle
      className={`theme-option ${selected ? 'active' : ''}`}
      onClick={onSelect}
      title={label}
      hint={hint}
      hotkey={hotkey}
      disabled={disabled}
      disabledHint={disabledHint}
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
  placement = 'left',
}: {
  title: string;
  hint: string;
  /** Tag the tip's headline with "ADV" (an Advanced-only control). */
  advanced?: boolean;
  /** Which side the card opens on. Left by default (the sidebar and the map
   *  tools are docked right); a left-docked surface passes 'right' so the card
   *  opens away from its own panel instead of across it. */
  placement?: TipPlacement;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLSpanElement>(placement);
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
      <ChoiceTip
        pos={pos}
        title={title}
        hint={hint}
        advanced={advanced}
        placement={placement}
      />
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
  header,
  note,
  tier,
  locked,
  triggerTip,
  listMaxHeight,
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
    /** Why a disabled option can't be picked — the tip's second line, with the grey
     *  N/A badge (the .ui-inert treatment), as on the other settings controls.
     *  (2026-10-02) */
    disabledHint?: string;
    /** A heading over this option and the ones after it — static text, not a
     *  row — where a long list falls into kinds (the chart form's time zones:
     *  the ways in, then the named zones; 2026-10-05). */
    section?: string;
  }[];
  /** A line above the options naming the question they answer. Static text, not a
   *  selectable row — use it where the option labels alone don't say what is being
   *  chosen between. */
  header?: string;
  note?: string;
  /** Hover tip on the CLOSED trigger (e.g. the current option's description,
   *  readable without opening). Owned by the menu — not a wrapper — because it
   *  must suppress itself while the panel is open: the panel is PORTALED, so to
   *  React's enter/leave logic the pointer never "leaves" an enclosing wrapper
   *  while browsing options, and a wrapper-owned tip sits stuck over the trigger
   *  on top of the options' own hints. */
  triggerTip?: { title: ReactNode; hint?: ReactNode; tipClassName?: string };
  /** The plan tier this WHOLE control belongs to — its badge renders on the
   *  trigger, exactly like the nav menus' plan-gated rows (see lib/plan). */
  tier?: PlanTier;
  /** Tier-locked teaser (the user hasn't reached `tier`): the trigger keeps its
   *  normal look (plus the badge) but a click routes to the nudge action (the
   *  account/upgrade flow) instead of opening the panel — so the control can't
   *  be opened or changed. Callers decide visibility (tierMet || shouldShowNudge),
   *  like the nav menus. A dropdown trigger is a button, and pressing one is an
   *  explicit ask, so it keeps the upgrade flow; it is the on/off SWITCHES that
   *  explain in place instead (ui/HoverTip's TipButton `locked`; seam L73). */
  locked?: boolean;
  /** A cap on the open list's height, in px, for a list long enough that
   *  filling the window would bury the form it belongs to (the chart form's
   *  ninety-odd time zones, 2026-10-05): it then opens beside its trigger like
   *  a native select and scrolls. Without one the list is capped only by the
   *  window, as before. */
  listMaxHeight?: number;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // The optional trigger tip's anchor shares the trigger element (merged ref below).
  const {
    ref: tipRef,
    pos: tipPos,
    show: tipShow,
    hide: tipHide,
  } = useHoverTip<HTMLButtonElement>('top');
  // The portaled panel is positioned by its top and always clamped fully within
  // the viewport (margins), capped to the room it has so it scrolls rather than
  // spilling off — or, on a screen too short for either side, fills the viewport.
  const [box, setBox] = useState<{
    left: number;
    width: number;
    top: number;
    maxHeight: number;
    maxWidth: number;
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
      // Never taller than the viewport (minus margins), nor than the caller's
      // cap; it scrolls past that.
      const height = Math.min(panelH, vh - margin * 2, listMaxHeight ?? Infinity);
      // Rows wider than the trigger widen the panel rightward from its left edge;
      // past the window's right margin they wrap instead (a phone-width form,
      // whose trigger already spans the width).
      const maxWidth = Math.max(r.width, window.innerWidth - r.left - margin);
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
        prev.maxHeight === height &&
        prev.maxWidth === maxWidth
          ? prev
          : { left: r.left, width: r.width, top, maxHeight: height, maxWidth },
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
    // Caught in the CAPTURE phase and stopped there (2026-10-05), as the chart
    // list's right-click menu does: Escape closes this panel and nothing else.
    // Heard in the bubble phase, the same press also reached whatever holds the
    // menu — inside My Charts it closed the whole window along with the list.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
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
    document.addEventListener('keydown', onKey, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, listMaxHeight]);

  // A list long enough to scroll opens on the chosen row, centred, as a native
  // select does — not at the top, a scroll away from what is chosen. Once per
  // opening, after the panel is placed (its maxHeight is what makes it scroll);
  // a list that fits has nowhere to scroll to, so short menus are unchanged.
  const scrolledOpen = useRef(false);
  useLayoutEffect(() => {
    if (!open) {
      scrolledOpen.current = false;
      return;
    }
    if (!box || scrolledOpen.current) return;
    scrolledOpen.current = true;
    const panel = panelRef.current;
    const on = panel?.querySelector<HTMLElement>('.navmenu-item.on');
    if (panel && on) panel.scrollTop = on.offsetTop - (panel.clientHeight - on.offsetHeight) / 2;
  }, [open, box]);

  return (
    <div className="calc-menu">
      <button
        ref={(el) => {
          triggerRef.current = el;
          tipRef.current = el;
        }}
        type="button"
        className={`thud-select calc-menu-trigger ${open ? 'open' : ''}`}
        onClick={() => {
          tipHide(); // opening replaces the trigger tip with the options' own hints
          if (locked) {
            nudgeAction(); // tier-locked teaser → the account/upgrade flow
            return;
          }
          setOpen((v) => !v);
        }}
        onMouseEnter={() => {
          if (triggerTip && !open) tipShow();
        }}
        onMouseLeave={tipHide}
        onFocus={() => {
          if (triggerTip && !open) tipShow();
        }}
        onBlur={tipHide}
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
        {tier && tier !== 'new' && tierLabel(tier) && shouldShowTierBadge(tier) && (
          <span className={`navmenu-tier tier-${tier}`}>{tierLabel(tier)}</span>
        )}
        <span className="thud-select-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {triggerTip && !open && (
        <HoverTip
          pos={tipPos}
          placement="top"
          title={triggerTip.title}
          hint={triggerTip.hint}
          className={triggerTip.tipClassName}
        />
      )}
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
              maxWidth: box?.maxWidth,
              maxHeight: box?.maxHeight,
              overflowY: 'auto',
              zIndex: 900,
              // Mounted before it's measured so the first open knows its real height;
              // kept hidden until placed so it never flashes at the top-left corner.
              visibility: box ? 'visible' : 'hidden',
            }}
          >
            {/* The QUESTION the options answer, above them. Worth its own line where a
                list of four calculations would otherwise leave the reader to infer what
                the arc is being applied to — which is exactly what one shared menu used
                to make them do. */}
            {header && <span className="navmenu-header">{header}</span>}
            {options.map((o) => (
              <Fragment key={o.value}>
                {o.section && <span className="navmenu-header is-section">{o.section}</span>}
                <HintMenuItem
                  label={o.label}
                  hint={o.hint}
                  glyph={o.glyph}
                  disabled={o.disabled}
                  disabledHint={o.disabledHint}
                  selected={o.value === value}
                  onSelect={() => {
                    if (o.disabled) return;
                    onChange(o.value);
                    setOpen(false);
                  }}
                />
              </Fragment>
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
  disabledHint,
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
  /** The reason, shown under the hint with the N/A badge. Without one the tip is the
   *  hint alone, as it always was. */
  disabledHint?: string;
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
      {hint && (
        <ChoiceTip
          pos={pos}
          title={label}
          hint={hint}
          note={disabled ? disabledHint : undefined}
          unavailable={disabled && !!disabledHint}
        />
      )}
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
  disabled = false,
  disabledHint,
  advanced,
}: {
  planet: PlanetName;
  on: boolean;
  onToggle: () => void;
  /** Shift+click handler — used for "show / hide all planets". */
  onShiftClick?: () => void;
  theme: Theme;
  /** The standard unavailable state (see .ui-inert and TipToggle's `disabled`):
   *  the current calculation settings can't place this body, so the switch can't
   *  be flipped either way — dimmed + dashed, with `disabledHint` naming the
   *  setting to change. The stored preference is untouched, so it returns exactly
   *  as the user had it once that setting changes. */
  disabled?: boolean;
  disabledHint?: string;
  /** Tag the tip's headline "ADV" — the body needs Advanced reading mode. */
  advanced?: boolean;
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
        className={`planet-toggle ${on ? 'on' : 'off'}${disabled ? ' ui-inert' : ''}`}
        onClick={(e) =>
          disabled ? undefined : e.shiftKey && onShiftClick ? onShiftClick() : onToggle()
        }
        aria-disabled={disabled || undefined}
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
            {labels.planetTipName(planet)}
          </span>
        }
        hint={labels.planetTheme(planet)}
        note={disabled ? disabledHint : undefined}
        // Shift+click can't "toggle all" through a dead switch either, so the
        // pill gives way to the grey N/A badge.
        hotkey={<ShiftTapTag />}
        advanced={advanced}
        unavailable={disabled}
      />
    </li>
  );
}

// Calculation ▸ Geodetic grid: the four switches, shown only while the DERIVED line system is
// Geodetic (see the comment where it is placed, under Line system).
function GeoGridControls({ grid }: { grid: NonNullable<SidebarProps['geoGrid']> }) {
  const { t } = useT();
  const row = (
    key: 'mc' | 'asc' | 'zones' | 'presentation',
    on: boolean,
    set: (v: boolean) => void,
    extra = '',
  ) => (
    <TipToggle
      className={`tech-toggle ${on ? 'on' : 'off'}${extra}`}
      onClick={() => set(!on)}
      ariaPressed={on}
      title={t(`settings.geoGrid.${key}.title`)}
      hint={t(`settings.geoGrid.${key}.hint`)}
    >
      <EyeIcon open={on} />
      <span className="name">{t(`settings.geoGrid.${key}.title`)}</span>
    </TipToggle>
  );
  return (
    <>
      <h2>{t('settings.headings.geoGrid')}</h2>
      <ul className="technique-list">
        {row('mc', grid.mc, grid.setMc)}
        {row('asc', grid.asc, grid.setAsc)}
        {row('zones', grid.zones, grid.setZones)}
        {row('presentation', grid.presentation, grid.setPresentation, ' geo-grid-sub')}
      </ul>
    </>
  );
}

// Eye (shown) / eye-off (hidden) marker for the "Hide details" toggles.
export function Sidebar({
  visiblePlanets,
  togglePlanet,
  setAllPlanets,
  minorMore,
  visibleLineTypes,
  toggleLineType,
  setAllLineTypes,
  showNatalLines,
  setShowNatalLines,
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
  geoGrid,
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
  rulershipScheme,
  setRulershipScheme,
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
  const discreet = useDiscreet();
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
  // overlays' display drawer + frame control on the timeline bar, synastry's
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
  // (The Advanced tab itself never parks whole: Display, Lines and Aspect orbs
  // park under the lock, but the Fortune-formula choice always stays — it shapes
  // what the owner drapes — so the tab is never left empty.)

  // The plan tier, derived from the Advanced flag exactly as App derives it (a
  // downstream resolver may lift it further — see lib/plan). Gates the Calculation
  // tab's House-system + Zodiac dropdowns (teased nav-menu-style below the tier)
  // and the Advanced tab's Aspect Lines window opener (gated rung).
  const planTier = planTierFor(showAdvancedTab);
  const advUnlocked = tierMet(planTier, 'adv');
  const gatedUnlocked = tierMet(planTier, 'gated');
  // The gated rung's compact badge — '' in builds that set no label, or when the badge
  // policy suppresses this rung, so guard renders.
  const gatedBadge = shouldShowTierBadge('gated') ? tierLabel('gated') : '';

  // Why the Part of Fortune filter is unavailable right now — or undefined when
  // it works. A Lot is a point on the ecliptic with no position in the sky, so
  // only a zodiacal frame can place it; and it belongs to Advanced reading mode,
  // which App's own gate enforces. Either way the switch goes dead rather than
  // pretending, while the stored preference is untouched (App parks the Lot out
  // of the EFFECTIVE visible set, never out of the pref) — so it comes back
  // exactly as set the moment the blocking setting changes. The standard
  // unavailable treatment: see the .ui-inert utility.
  const fortuneBlocked = !advUnlocked
    ? t('settings.inert.fortuneAdvanced')
    : lineSystem !== 'geodetic' && coordSystem !== 'zodiaco'
      ? t('settings.inert.fortuneMundo')
      : undefined;

  // The sky hold (lib/skyHold), on the DERIVED line system: on a geodetic map nothing
  // turns, so the switches for what reads the turning — night shade, the Vertex axis,
  // zenith points, parans, fixed stars, the line projection — grey with the one
  // sentence and its fix. Each keeps showing the STORED choice, which App masks only
  // out of what is drawn, so Celestial brings every one back as it was; the hotkeys
  // are refused in App while held, so nothing here can move a choice unseen.
  // (2026-10-02)
  const skyHeld = skyHeldFor(lineSystem);
  const skyHeldWhy = skyHeld ? t('settings.inert.skyHeld') : undefined;

  // TELL THE MAP when this panel arrives, changes size, and leaves. The map keeps its line labels
  // off every panel's rect (HUD_SELECTORS there lists `.sidebar`), cached until `astro:hud-moved`,
  // and nothing here said so: opening it left labels under it, and closing it left the ones that
  // had stepped off it where they had stepped to — a catalog chip 630 px down its own line, beside
  // the chip for the line's other end — until the next pan (QA, 2026-10-01: 12 chips at 1440×810
  // on a fresh profile, which opens with the panel up; 34 on a phone opening it). Announced once
  // the box has come to REST (lib/hudSettled): after the slide-in on touch, which is an animation
  // rather than a transition, so it is the hold-still rule that waits it out; after a section
  // opens or closes, which changes its height. And when it goes, from the unmount — on touch that
  // is after the slide-out, and the panel is out of the DOM by the time the map reads the panels.
  const asideRef = useRef<HTMLElement>(null);
  const settledRef = useRef('');
  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    const settled = watchSettled([el], [], settledRef);
    const ro = new ResizeObserver(() => settled.check());
    ro.observe(el);
    settled.check();
    return () => {
      ro.disconnect();
      settled.dispose();
      window.dispatchEvent(new Event('astro:hud-moved'));
    };
  }, []);

  return (
    <aside
      ref={asideRef}
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
        <span className={`sidebar-chevron${openSection === 'theme' ? ' is-open' : ''}`}>▸</span>
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
            {/* Night Shade — shades the night half of Earth. Held on a geodetic map:
                day and night are the sky's turning. (2026-10-02) */}
            <TipToggle
              className={`tech-toggle ${showNightShade ? 'on' : 'off'}`}
              onClick={() => setShowNightShade(!showNightShade)}
              ariaPressed={showNightShade}
              disabled={skyHeld}
              disabledHint={skyHeldWhy}
              title={t('settings.nightShade.title')}
              hotkey="Shift D"
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
              {/* The (i) carries the one thing neither option label can: that this
                  choice is about the picture and not the positions. It belongs on
                  the heading rather than in both option hints — the fact is shared,
                  and stating it twice is how one copy goes stale. */}
              <h2 className="info-heading">
                {t('settings.headings.projection')}
                <InfoTip
                  title={t('settings.headings.projection')}
                  hint={t('settings.projection.hint')}
                />
              </h2>
              <SplitSelect
                ariaLabel={t('settings.headings.projection')}
                value={projection}
                onSelect={setProjection}
                options={PROJECTION_VALUES.map((value) => ({
                  value,
                  label: labels.projection(value),
                  tip: labels.projection(value),
                  hint: labels.projectionHint(value),
                  hotkey: <CycleHotkey label="Shift F" />,
                }))}
              />
            </>
          )}

          {/* Discreet mode, below the map-facing controls it has nothing to do with —
              it hides chart identity rather than anything on the map. Deliberately
              OUTSIDE both parking guards above: a surface owning the viewport still
              shows the chart's name, so this is exactly when it must stay reachable. */}
          <h2>{t('settings.headings.privacy')}</h2>
          <ul className="technique-list">
            <TipToggle
              className={`tech-toggle ${discreet ? 'on' : 'off'}`}
              onClick={() => setDiscreet(!discreet)}
              ariaPressed={discreet}
              title={t('settings.discreet.title')}
              hotkey="P"
              hint={t('settings.discreet.hint')}
            >
              {/* The spy, not the eye every other row toggles with — this one
                  changes what the whole app will say out loud, not whether a
                  layer is drawn, and it should not look like its neighbours. */}
              <SpyIcon />
              <span className="name">{t('settings.discreet.title')}</span>
            </TipToggle>
          </ul>

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
        <span className={`sidebar-chevron${openSection === 'filters' ? ' is-open' : ''}`}>▸</span>
      </button>

      {openSection === 'filters' && (
        <div className="sidebar-section">
          <h2>{t('settings.headings.planets')}</h2>
          <ul className="planet-grid">
            {TRADITIONAL_PLANETS.map((p) => (
              <PlanetToggle
                key={p}
                planet={p}
                on={visiblePlanets.has(p)}
                onToggle={() => togglePlanet(p)}
                onShiftClick={() =>
                  setAllPlanets(TRADITIONAL_PLANETS, !visiblePlanets.has(p))
                }
                theme={theme}
              />
            ))}
          </ul>

          {/* Points — the calculated positions: the lunar nodes, the lunar apogee,
              and the Lots. The section is unconditional: every option stays listed
              whatever the calculation settings are, and an option those settings
              can't place goes dead-but-visible instead of vanishing (see
              fortuneBlocked above and the .ui-inert utility). A filter list that
              silently loses rows leaves nothing to explain the absence. */}
          <h2>{t('settings.headings.points')}</h2>
          <ul className="planet-grid">
            {POINT_BODIES.map((p) => (
              <PlanetToggle
                key={p}
                planet={p}
                on={visiblePlanets.has(p)}
                onToggle={() => togglePlanet(p)}
                // "Toggle all" skips a body the settings have switched off — a
                // bulk action mustn't reach through a dead switch and rewrite the
                // preference its own row refuses to change.
                onShiftClick={() =>
                  setAllPlanets(
                    fortuneBlocked
                      ? POINT_BODIES.filter((b) => b !== 'Fortune')
                      : POINT_BODIES,
                    !visiblePlanets.has(p),
                  )
                }
                theme={theme}
                disabled={p === 'Fortune' && fortuneBlocked != null}
                disabledHint={p === 'Fortune' ? fortuneBlocked : undefined}
                advanced={p === 'Fortune' && !advUnlocked}
              />
            ))}
          </ul>

          <h2>{t('settings.headings.minorBodies')}</h2>
          <ul className="planet-grid">
            {MINOR_BODIES.map((p) => (
              <PlanetToggle
                key={p}
                planet={p}
                on={visiblePlanets.has(p)}
                onToggle={() => togglePlanet(p)}
                // Show/hide-all stays with these five: the catalog bodies behind
                // "More" have their own family switch in the window, and a bulk
                // action here reaching into that preference would be a write from
                // someone else's control (CLAUDE.md, rule 1).
                onShiftClick={() =>
                  setAllPlanets(MINOR_BODIES, !visiblePlanets.has(p))
                }
                theme={theme}
              />
            ))}
            {/* The sixth: "More" opens the Minor bodies window (also '4' — the window
                has no View-menu row, by choice, so this button is where it lives) —
                search and toggle every minor body, these five included. The wider set
                is an Advanced reading, so below that rung the button is one of two
                things, by the build's nudge policy (lib/plan):
                  • NUDGED (a downstream build that sells the rung — for a guest, say):
                    a clickable upgrade teaser, like the Aspect Lines opener below. Not
                    greyed, ADV-tagged in its tip, no key chip (the key does nothing
                    until the rung is reached — the app's rule for every locked
                    teaser), and a click runs nudgeAction(), the build's account /
                    upgrade flow. That stays, though locked switches now explain in
                    place (TipButton's `locked`): this is a bordered button that opens
                    a window, not an on/off chip like the five beside it, so pressing
                    it is an explicit ask for the feature.
                  • NOT NUDGED (the open core, where Advanced is a free switch): the
                    standard unavailable state, exactly like Fortune above — visible,
                    ADV-tagged, dead to the click, its tip naming the setting to change
                    (.ui-inert).
                Either way the list is never cleared, and within a session neither is
                the window's open flag, so both return with Advanced (a reload into
                Basic closes the window — see App's showMinorHud). Its lit state reads
                open AND Advanced: the window only renders with Advanced on, and a
                button lit for a window nobody can see would claim something that
                isn't on screen.

                It parks with the map-surface rows under a view lock: the window
                doesn't render while a registered surface owns the viewport (and
                '4' stands down), so the button would open nothing.

                On touch, OPENING the window also dismisses this dock: the dock is a
                full-height takeover on the right edge, above every floating window,
                and the window opens centred — on a phone the dock would cover half
                of it, row actions included. Both moves come from the one tap, and
                the dock reopens from its nub as always. */}
            {!viewParked && (
              <TipToggle
                className={`planet-toggle minor-more${minorMore.open && advUnlocked ? ' is-open' : ''}`}
                onClick={() => {
                  if (!advUnlocked) {
                    nudgeAction(); // tier-locked teaser → the account/upgrade flow
                    return;
                  }
                  const opening = !minorMore.open;
                  minorMore.onToggle();
                  if (touch && opening) onClose?.();
                }}
                ariaPressed={minorMore.open && advUnlocked}
                title={t('minorBodies.more.title')}
                hint={t('minorBodies.more.hint')}
                hotkey={advUnlocked ? '4' : undefined}
                disabled={!advUnlocked && !shouldShowNudge('adv')}
                disabledHint={t('minorBodies.more.advancedHint')}
                advanced={!advUnlocked}
              >
                <svg
                  className="planet-toggle-icon minor-more-icon"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <span className="name">{t('minorBodies.more.label')}</span>
                {/* Catalog bodies drawn right now, and any a closed source is
                    holding — derived counts, so they read 0 (and hide) while
                    Advanced is off, when nothing is drawn or held. */}
                {minorMore.shown > 0 && (
                  <span className="minor-more-badge">
                    {t('minorBodies.more.count', { n: minorMore.shown })}
                  </span>
                )}
                {minorMore.held > 0 && (
                  <span className="minor-more-badge is-held">
                    {t('minorBodies.more.held', { n: minorMore.held })}
                  </span>
                )}
              </TipToggle>
            )}
          </ul>

          <h2>{t('settings.headings.angles')}</h2>
          <ul className="line-type-grid">
            {LINE_TYPES.map(({ type, label }) => {
              const on = visibleLineTypes.has(type);
              // A geodetic map draws the four angles only, so the Vertex axis is held
              // (the stored choice shows, greyed). The other four stay live, and their
              // Shift+click leaves the held pair as stored (App's setAllLineTypes).
              // (2026-10-02)
              const held = skyHeld && (type === 'VX' || type === 'AVX');
              return (
                <TipToggle
                  key={type}
                  className={`line-toggle ${type.toLowerCase()} ${on ? 'on' : 'off'}`}
                  onClick={() => toggleLineType(type)}
                  onShiftClick={() => setAllLineTypes(!on)}
                  disabled={held}
                  disabledHint={skyHeldWhy}
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
        <span className={`sidebar-chevron${openSection === 'calc' ? ' is-open' : ''}`}>▸</span>
      </button>

      {openSection === 'calc' && (
        <div className="sidebar-section">
          {/* Primary paradigm: Celestial (standard ACG, by the sky) vs Geodetic
              (the zodiac by Earth longitude). The In-Mundo/In-Zodiaco "Line
              projection" below is a Celestial-only refinement: on a geodetic map it
              is greyed with In Zodiaco marked, which is what that map draws.
              (2026-10-02) */}
          <h2>{t('settings.headings.lineSystem')}</h2>
          {/* Named so the auto-flip notice can point here when it reports the line
              system held by a sidereal zodiac and this panel happens to be open
              (lib/autoFlipNotice). A styling hook would be wrong — this is an
              identity, and it must survive a reskin. */}
          {/* Geodetic can be unavailable for TWO reasons, and they get
              different words because they are different facts.

              • It is tropical-only, so a sidereal zodiac makes it unavailable — that
                one names the setting to change, and changing it brings Geodetic back.
              • It is HELD while the mapping is under review (lib/geodeticHold) — that
                one has no setting to name, so it says what it is and that the choice
                is kept.

              The HOLD OUTRANKS the sidereal reason where both apply: telling someone
              to set the zodiac back to Tropical when that will not re-enable Geodetic
              is worse than saying nothing.

              Shown INERT rather than filtered out, in both cases. Removing it left a
              user who had Geodetic selected watching it vanish with nothing to read
              and no way back; the dimmed half explains itself, and the stored choice
              is only masked, so it returns with nothing to redo.
              (The half never reads as SELECTED while blocked: `lineSystem` here is
              the derived value, which is already 'celestial' under either.) */}
          <SplitSelect
            // Named so the auto-flip notice can point here when it reports the
            // line system held and this panel happens to be open (lib/autoFlipNotice).
            data-autoflip="line-system"
            ariaLabel={t('settings.headings.lineSystem')}
            value={lineSystem}
            onSelect={setLineSystem}
            options={LINE_SYSTEM_VALUES.map((value) => {
              const held = value === 'geodetic' && GEODETIC_HELD;
              const sidereal = value === 'geodetic' && siderealActive;
              return {
                value,
                label: labels.lineSystem(value),
                tip: labels.lineSystem(value),
                hint: labels.lineSystemHint(value),
                disabled: held || sidereal,
                disabledHint: held
                  ? t('settings.inert.geodeticHeld')
                  : sidereal
                    ? t('settings.inert.geodeticSidereal')
                    : undefined,
              };
            })}
          />

          {/* The geodetic grid: the zodiac laid on the Earth (lib/astro/geodeticGrid), drawn only
              on a geodetic map — so its four switches sit under the control that makes one, and
              appear only while the DERIVED line system is Geodetic (so not while the review hold
              or a sidereal zodiac masks a Geodetic choice). This is the deliberate exception to
              "grey, never hide" (Salvatore, 2026-10-05): that rule is for a feature the reader
              chose and can't use on this map, which needs its reason in view. These are options
              OF the Geodetic choice — with Celestial chosen there is nothing for them to apply
              to, as Line projection once showed only under Celestial. Hiding writes nothing: the
              four prefs keep their values and return with Geodetic. Presentation is indented
              under Zone shading, which it strengthens, and is live with the others (it can be set
              before the shading is turned on). (2026-10-02; shown-only-on-Geodetic 2026-10-05) */}
          {geoGrid && lineSystem === 'geodetic' && <GeoGridControls grid={geoGrid} />}

          {/* ALWAYS rendered. It used to show only in Celestial; on a geodetic map it
              now stays, greyed with the sky sentence, because a control that vanishes
              takes its explanation with it. The mark follows the EFFECTIVE value —
              In Zodiaco, which is how a geodetic map places every body — while the
              stored choice is kept and comes back marked on Celestial. (2026-10-02) */}
          <h2>{t('settings.headings.lineProjection')}</h2>
          {/* Named so the first-open notice can point here (lib/autoFlipNotice) —
              this app's In Mundo default is the one that routinely reads as a bug
              to someone cross-checking against another program. */}
          <ul className="theme-list" data-autoflip="line-projection">
            {COORD_SYSTEM_VALUES.map((value) => (
              <HintOption
                key={value}
                selected={(skyHeld ? 'zodiaco' : coordSystem) === value}
                onSelect={() => setCoordSystem(value)}
                label={labels.coordSystem(value)}
                hint={labels.coordSystemHint(value)}
                disabled={skyHeld}
                disabledHint={skyHeldWhy}
              />
            ))}
          </ul>

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

          {/* Rulerships: whether the outer three are read as rulers of Scorpio,
              Aquarius and Pisces beside the classical seven. An ordinary two-row
              list, like Lunar node above it — the capsule is reserved for elsewhere.
              It belongs on this tab because that is what it is — a school, like the
              house system above it — but it does NOT tease the ADV rung the way
              those two do. Its
              only consumer is the essential-dignity list in the expanded wheel, which
              isn't drawn below that rung at all, so a nudge here would advertise a
              control whose effect the reader still couldn't see after taking it. The
              stored preference is left alone either way; nothing masks it, because no
              combination of settings makes a scheme invalid.
              No ADV tag on the (i): the row only exists above the rung, so it would
              state the obvious — the same reason the Advanced tab's Fortune (i) has
              none, inverted. */}
          {advUnlocked && (
            <>
              <h2 className="info-heading">
                {t('settings.headings.rulerships')}
                <InfoTip
                  title={t('settings.headings.rulerships')}
                  hint={t('settings.rulership.hint')}
                />
              </h2>
              <ul className="theme-list">
                {RULERSHIP_SCHEME_VALUES.map((value) => (
                  <HintOption
                    key={value}
                    selected={rulershipScheme === value}
                    onSelect={() => setRulershipScheme(value)}
                    label={t(`settings.rulership.${value}.label`)}
                    hint={t(`settings.rulership.${value}.hint`)}
                  />
                ))}
              </ul>
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
      {showAdvancedTab && (
        <button
          type="button"
          className="sidebar-header sidebar-header-accent sidebar-accent-advanced"
          onClick={() => toggleSection('advanced')}
          aria-expanded={openSection === 'advanced'}
        >
          <span className="sidebar-title">{t('settings.sections.advanced')}</span>
          <span className={`sidebar-chevron${openSection === 'advanced' ? ' is-open' : ''}`}>▸</span>
        </button>
      )}

      {showAdvancedTab && openSection === 'advanced' && (
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
                (underfoot, diamond) and the ecliptic reference curve. Held on a
                geodetic map: "overhead" is a moment of the turning sky. (2026-10-02) */}
            <TipToggle
              className={`tech-toggle ${showZenith ? 'on' : 'off'}`}
              onClick={() => setShowZenith(!showZenith)}
              ariaPressed={showZenith}
              disabled={skyHeld}
              disabledHint={skyHeldWhy}
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
            {/* First, because it is the layer the rest are drawn against — and the one
                somebody puts down in order to read any of them on their own. Hiding is
                a DRAW-time thing: every reading, report and reveal still has them. */}
            <TipToggle
              className={`tech-toggle ${showNatalLines ? 'on' : 'off'}`}
              onClick={() => setShowNatalLines(!showNatalLines)}
              ariaPressed={showNatalLines}
              title={t('settings.natalLines.title')}
              hotkey="Shift N"
              hint={t('settings.natalLines.hint')}
            >
              <EyeIcon open={showNatalLines} />
              <span className="name">{t('settings.natalLines.title')}</span>
            </TipToggle>
            {/* Parans and fixed stars are held on a geodetic map (lib/skyHold). The
                hold's reason outranks Cyclocartography's for parans: switching the
                overlay would not bring them back there, the line system would.
                (2026-10-02) */}
            <TipToggle
              className={`tech-toggle ${showParans ? 'on' : 'off'}`}
              onClick={() => setShowParans(!showParans)}
              ariaPressed={showParans}
              disabled={skyHeld || overlayAuxBlocked(overlayMode, 'paran')}
              disabledHint={skyHeldWhy ?? t('settings.parans.blockedCyclo')}
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
              disabled={skyHeld}
              disabledHint={skyHeldWhy}
              title={t('settings.starLines.title')}
              hotkey="Shift S"
              hint={t('settings.starLines.hint')}
            >
              <EyeIcon open={showStarLines} />
              <span className="name">{t('settings.starLines.title')}</span>
            </TipToggle>
            {showStarLines && (
              <li className="orb-zone-row">
                {/* The set follows its switch: held options can't be picked, so the
                    stored set can't move while nothing star-shaped is drawn.
                    (2026-10-02) */}
                <HintMenu
                  value={starSet}
                  onChange={setStarSet}
                  options={[
                    {
                      value: 'bright',
                      label: t('settings.starLines.bright'),
                      hint: t('settings.starLines.brightHint'),
                      disabled: skyHeld,
                      disabledHint: skyHeldWhy,
                    },
                    {
                      value: 'all',
                      label: t('settings.starLines.all'),
                      hint: t('settings.starLines.allHint'),
                      disabled: skyHeld,
                      disabledHint: skyHeldWhy,
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
                otherwise. The teaser keeps the upgrade flow — it is a button that
                opens a window, and pressing it asks for the feature; only on/off
                switches explain in place (TipButton's `locked`; seam L73). */}
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
                // The row already wears the rung's badge; the tip carries it too,
                // like every other gated control's tip does.
                gated
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
              Always shown, like its Points filter row: the convention is a stored
              preference worth setting whether or not the current frame draws the
              Lot. Its (i) carries what the Lot IS, how relocation treats it, and
              which frames place it — the one explanation for both surfaces. */}
          {/* No ADV tag on this (i): the whole tab is Advanced, so it would state the
              obvious. The tag earns its place on the Map-filters Fortune row, which
              sits in a tab that is NOT Advanced-only. */}
          <h2 className="info-heading">
            {t('settings.headings.fortuneFormula')}
            <InfoTip
              title={t('settings.headings.fortuneFormula')}
              hint={t('settings.fortuneFormula.hint')}
            />
          </h2>
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
              <span className={`sidebar-chevron${openSection === ext.id ? ' is-open' : ''}`}>▸</span>
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
