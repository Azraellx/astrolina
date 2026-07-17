// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  PLANET_COLORS,
  birthDataToJD,
  obliquity,
  type AngleCoords,
  type EclipticPosition,
  type HorizontalCoords,
  type PlanetName,
  type RelocatedAngles,
} from '../../lib/ephemeris';
import type { StoredChart } from '../../lib/chartLibrary';
import { isTouchLayout, useNarrowNav, usePhone } from '../../lib/touch';
import type { LineType } from '../../lib/astro/lines';
import { ASPECT_GLYPHS } from '../../lib/astro/glyphChars';
import { fmtLat, fmtLng } from '../../lib/coordFormat';
import { formatUtcOffset } from '../../lib/atlas/timezone';
import { planTierFor, tierName } from '../../lib/plan';
import { getProfileSection } from '../../lib/extensions/profileSection';
import { ChartSwitcher } from '../ChartSwitcher/ChartSwitcher';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import { ZodiacGlyph } from '../ZodiacGlyph/ZodiacGlyph';
import {
  ARIES_FRAME,
  WheelSvg,
  computeAspects,
  computeAzimuthAspects,
  computeCrossAspects,
  computeDeclinationAspects,
  type Aspect,
  type AspectCategory,
} from '../Wheel/WheelSvg';
import { NoChartWheel } from '../Wheel/NoChartWheel';
import {
  LocalSpaceWheel,
  useLocalSpaceView,
  useLocalSpaceHover,
} from '../LocalSpaceWheel/LocalSpaceWheel';
import { LocalSpaceCompass } from '../LocalSpaceWheel/LocalSpaceCompass';
import { renderLocalSpaceGatedSlot } from '../../lib/extensions/localSpaceSlot';
import type { AspectOrbs } from '../../lib/aspectPrefs';
import {
  essentialDignity,
  signElement,
  signIndex,
  signModality,
  type Dignity,
} from '../../lib/astro/dignities';
import { ELEMENT_GLYPHS, MODALITY_GLYPHS } from '../../lib/astro/glyphChars';
import { lonToZodiac, planetRank, visibleAngleSpecs } from '../../lib/astro/format';
import { publishLeftDock, retireLeftDock } from '../../lib/leftDock';
import { HoverTip, TipButton, TipSpan } from '../ui/HoverTip';
import { useHoverTip } from '../ui/useHoverTip';
import { useT } from '../../i18n';
import type { Formatters } from '../../i18n';
import './ExpandedChartSidebar.css';

// (PLANET_ORDER / planetRank and the compact longitude format now live in
// lib/astro/format.ts — shared with the Capture extras panel so the two readouts
// can't drift.)

// "Out of bounds": declination past the Sun's maximum — the true obliquity of
// the chart's date, not a fixed 23°26′ (a fixed value would flag the SUN itself
// for a couple of days around each solstice whenever the real obliquity sits
// above it). The readout flags it in a single colour (the Glass theme paints it
// pink, the others dark pink; see the CSS).
function decClass(decRad: number, limitDeg: number): string {
  return Math.abs((decRad * 180) / Math.PI) > limitDeg ? 'es-dec-oob' : '';
}

const RAD2DEG = 180 / Math.PI;

// Degrees → "DD°MM'" (degrees + arcminutes), signed when asked. Used for every
// numeric column of the Advanced planet table (speed, latitude, RA, declination,
// azimuth, altitude). Azimuth/RA pass signed=false (they read 0–360).
function fmtDM(deg: number, signed = false): string {
  const abs = Math.abs(deg);
  let d = Math.floor(abs);
  let m = Math.round((abs - d) * 60);
  if (m === 60) { m = 0; d += 1; }
  if (d >= 360 && !signed) d -= 360; // 359°59.6' is "0°00'", not "360°00'"
  // A value rounding to zero shows unsigned (no "-0°00'").
  const sign = d === 0 && m === 0 ? '' : deg < 0 ? '-' : signed ? '+' : '';
  return `${sign}${d}°${pad2(m)}'`;
}

// Longitude readout for the planet/angle rows: "23°17'" (with arc-seconds in
// Advanced) followed by the sign glyph and full sign name — e.g. 23°17' ♑ Capricorn.
function Longitude({ lon, advanced }: { lon: number; advanced: boolean }) {
  const { labels } = useT();
  // Compact form (minute precision) is shared with the Capture extras panel via
  // lonToZodiac, so the two readouts can't disagree at this column's width cutoff.
  const compact = lonToZodiac(lon);
  let signIdx = compact.signIdx;
  let dms = compact.degMin;
  if (advanced) {
    const lonDeg = ((lon * 180) / Math.PI + 360) % 360;
    signIdx = Math.floor(lonDeg / 30);
    const inSign = lonDeg % 30;
    const d = Math.floor(inSign);
    const mFull = (inSign - d) * 60;
    const m = Math.floor(mFull);
    let dd = d;
    let mm = m;
    let ss = Math.round((mFull - m) * 60);
    if (ss === 60) { ss = 0; mm += 1; }
    if (mm === 60) { mm = 0; dd += 1; }
    // The seconds cascade can carry 29°59'59.6" up to a full 30°: that is 0° of
    // the NEXT sign, never "30°" of this one.
    if (dd === 30) { dd = 0; signIdx = (signIdx + 1) % 12; }
    dms = `${dd}°${pad2(mm)}'${pad2(ss)}"`;
  }
  return (
    <>
      {dms}{' '}
      <span className="es-lon-sign">
        <ZodiacGlyph sign={signIdx} size={12} />{' '}
        <span className="es-lon-sign-name">{labels.sign(signIdx)}</span>
      </span>
    </>
  );
}

// Compact zodiacal longitude for the Advanced table's narrow column: degree,
// sign glyph, arcminute — e.g. 23°♑17' (the conventional "23 Cap 17" notation).
function SignLon({ lon }: { lon: number }) {
  const lonDeg = ((lon * 180) / Math.PI + 360) % 360;
  let signIdx = Math.floor(lonDeg / 30);
  const inSign = lonDeg % 30;
  let d = Math.floor(inSign);
  let m = Math.round((inSign - d) * 60);
  if (m === 60) { m = 0; d += 1; }
  if (d === 30) { d = 0; signIdx = (signIdx + 1) % 12; }
  return (
    <>
      {d}°<ZodiacGlyph sign={signIdx} size={11} />{pad2(m)}&#39;
    </>
  );
}

function fmtChartDate(c: StoredChart, fmt: Formatters): string {
  return `${c.day} ${fmt.monthName(c.month)} ${c.year} · ${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
}

interface ExpandedChartSidebarProps {
  chart: StoredChart | null;
  charts: StoredChart[];
  point: { lat: number; lng: number } | null;
  /** The active point's resolved place name (live hover / pin location), shown with the
   *  relocated coordinates so the name tracks the point the way the coordinates do. This
   *  is the sidebar's only place line; the caller falls it back to the birthplace when
   *  nothing is pinned, so it doubles as the birthplace label in the plain natal view. */
  pointLabel?: string | null;
  pinned: boolean;
  isNatalPin: boolean;
  angles: RelocatedAngles | null;
  planets: EclipticPosition[];
  overlayPlanets?: EclipticPosition[] | null;
  overlayAngles?: RelocatedAngles | null;
  overlayLabel?: string | null;
  /** The overlay's instant "YYYY-MM-DD HH:MM" (UTC) — shown with the overlay name over the
   *  wheel so the date/time reads without the timeline bar. null when there's none. */
  overlayMoment?: string | null;
  /** The active overlay's kind, used to label the wheel caption by tag — cyclo shows
   *  as "CCG" (its label "Cyclo·carto·graphy" would otherwise truncate to "Cyclo" at
   *  the first middot). */
  overlayKind?: string | null;
  /** When the Natal toggle is off and a time overlay is promoted to stand in for the
   *  chart, the overlay's own name ("Sec. Progressed"/"Transits"/"CCG"/…). It REPLACES
   *  the chart-state title above the wheel — the title's live hover/pin colour still
   *  conveys the state, so the text is freed to name the promoted overlay outright
   *  (rather than tagging "Sp" onto "HOVER CHART"). Null otherwise. */
  promotedLabel?: string | null;
  /** A promoted overlay with no coherent chart (Cyclo·cartography, Natal hidden): the
   *  wheel shows an empty "NO CHART" ring instead of a chart. `angles` is null then, so
   *  the state title, overlay caption, and aspect toggles fall away with it. */
  noChart?: boolean;
  /** Birth time unknown: `angles` is null (there are none), but the planets still read
   *  by sign — the wheel renders planets-only on the neutral Aries frame, the angle
   *  list rows stay away, and a note in the wheel corner says why. */
  planetsOnly?: boolean;
  /** Planets toggled on in the Map Filter; hidden ones are dropped everywhere. */
  visiblePlanets: Set<PlanetName>;
  /** Line-type toggles from the Map Filter; gate which angles show in the wheel + list. */
  visibleLineTypes: Set<LineType>;
  /** Per-body RA + azimuth/altitude for the Advanced table, keyed by planet. */
  advancedCoords: Map<PlanetName, HorizontalCoords>;
  /** RA + declination + azimuth/altitude for the angles (ecliptic points). */
  angleCoords: Record<'asc' | 'mc' | 'dsc' | 'ic' | 'vertex' | 'antivertex', AngleCoords> | null;
  /** Per-body azimuth/altitude (degrees) at the local-space origin — non-null only
   *  while the Local Space view is on and the caller's tier gate passes. Drives the
   *  aspect list's frame statuses (the local-space pair uses the two props below). */
  localSpaceCoords?: Map<PlanetName, { az: number; alt: number }> | null;
  /** Local space at the BIRTHPLACE — the left dial of the local-space pair, always
   *  shown when the pair is active. Same gating as `localSpaceCoords`. */
  natalLocalSpaceCoords?: Map<PlanetName, { az: number; alt: number }> | null;
  /** Local space at the placed pin (relocated) — the right dial. Null when there is
   *  no relocation, or it coincides with the birthplace: the slot is left empty
   *  rather than cloning the natal dial. */
  relocatedLocalSpaceCoords?: Map<PlanetName, { az: number; alt: number }> | null;
  /** Whether the aspect list's local-space frame (`localSpaceCoords`) sits on a
   *  relocated origin (pin ≠ birthplace) vs the natal birthplace — labels the
   *  Compare table's Local-space column for whichever dial it mirrors. */
  localSpaceRelocated?: boolean;
  /** The Local Space view is on but the coord props above are held back by the caller's
   *  tier gate, so the real dials won't draw. When set, the sidebar renders whatever a
   *  downstream build has installed in the gated local-space slot (lib/extensions/
   *  localSpaceSlot) in the dials' place — the open core installs nothing, so nothing
   *  shows. Mutually exclusive with the coord props being populated. */
  localSpaceGated?: boolean;
  /** Per-aspect orb limits (Advanced ▸ Aspect orbs) for the grid + wheel lines. */
  aspectOrbs: AspectOrbs;
  /** The Advanced reading mode (degree rim, aspect grid, coordinate tables). The
   *  NEW/ADV cue below the Hide button toggles it (the profile plan tag does too). */
  advanced: boolean;
  setAdvanced: (v: boolean) => void;
  /** Overlay wheel layout (the Dual toggle in this header): true splits the
   *  bi-wheel into two full stacked wheels whenever an overlay ring exists. */
  dualWheels: boolean;
  setDualWheels: (v: boolean) => void;
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
const FRAMES_KEY = 'astro:aspect-frames:v1';
const LS_MODE_KEY = 'astro:ls-wheel-3d:v1'; // local-space dials: '3d' globe vs 2D compass

// Frame-table vocabulary (the aspects section's Separate view): every pair's
// fate across the natal → local-space frames, plus the sortable columns.
const FRAME_STATUSES = ['retained', 'changed', 'lost', 'new'] as const;
type FrameStatus = (typeof FRAME_STATUSES)[number];
type FrameSortKey = 'pair' | 'natal' | 'ls' | 'delta' | 'status';
const DEFAULT_WIDTH = 720;
const MIN_WIDTH = 480;
// Touch screens (usually a narrower landscape phone) get a lower floor than the desktop
// minimum, so the panel can tuck into a smaller slice of the screen and leave more map.
const MIN_WIDTH_TOUCH = 380;
const minSidebarWidth = (): number => (isTouchLayout() ? MIN_WIDTH_TOUCH : MIN_WIDTH);
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

// Aspect symbols come from the shared glyph catalog (lib/astro/glyphChars.ts),
// rendered with the bundled glyph font via .astro-glyph below.

// Per-aspect exact-angle for the Advanced aspect tips (language-neutral numeric).
// The name + description copy is resolved from the catalog (expandedSidebar.aspect.*).
// Values are language-neutral degree figures; the declination pair resolves
// its parenthetical through the catalog instead (see AspectGlyph).
const ASPECT_ANGLES: Record<string, string> = {
  conjunction: '0°',
  opposition: '180°',
  trine: '120°',
  square: '90°',
  sextile: '60°',
};
const ASPECT_KEYS = new Set([
  'conjunction',
  'opposition',
  'trine',
  'square',
  'sextile',
  'parallel',
  'contraparallel',
]);
// Declination aspects have no astrological symbol in the bundled glyph font;
// the math marks ∥ / ∦ read naturally and fall back to the system font.
const DECLINATION_MARKS: Record<string, string> = {
  parallel: '∥',
  contraparallel: '∦',
};

// A glyph in the Advanced aspect lists that reveals an explanation as the shared
// .ui-tip on hover — portaled, so the sidebar's overflow can't clip it, and popped
// to the right onto the open map. Used for the aspect symbols and the overlay mark.
function TipGlyph({
  className,
  color,
  title,
  hint,
  children,
}: {
  className?: string;
  color?: string;
  title: ReactNode;
  hint?: string;
  children: ReactNode;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLSpanElement>('right', { tapReveal: true });
  return (
    <>
      <span
        ref={ref}
        className={className}
        style={color ? { color } : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {children}
      </span>
      <HoverTip pos={pos} placement="right" title={title} hint={hint} />
    </>
  );
}

// A list row that explains itself as a .ui-tip on hover — for rows whose STATE
// is carried by row styling alone (no badge to hover). The whole <li> is the
// trigger, but it yields to the tip-bearing glyphs inside it: the row tip only
// shows while the pointer rests on the row's plain parts. Mouse yield lives
// here (mouseover/mouseout against the kernel's ui-tip-tap marker); touch
// yield is the kernel's own nested-trigger rule.
function TipRow({
  className,
  title,
  hint,
  children,
}: {
  className: string;
  title: ReactNode;
  hint?: string;
  children: ReactNode;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLLIElement>('right', { tapReveal: true });
  return (
    <li
      ref={ref}
      className={className}
      onMouseOver={(e) => {
        const nested = (e.target as Element).closest('.ui-tip-tap');
        if (nested && nested !== ref.current) hide();
        else show();
      }}
      onMouseOut={(e) => {
        const to = e.relatedTarget as Node | null;
        if (!to || !ref.current?.contains(to)) hide();
      }}
    >
      {children}
      <HoverTip pos={pos} placement="right" title={title} hint={hint} />
    </li>
  );
}

// The aspect symbol (☌ ☍ △ □ ⚹) plus its hover tip: the symbol + name (with the
// exact angle), and the description beneath.
function AspectGlyph({ type, color }: { type: string; color: string }) {
  const { t } = useT();
  const known = ASPECT_KEYS.has(type);
  const glyph =
    DECLINATION_MARKS[type] ??
    (known ? ASPECT_GLYPHS[type as keyof typeof ASPECT_GLYPHS] : type);
  return (
    <TipGlyph
      className="asp-glyph astro-glyph"
      color={color}
      title={
        <span className="es-tip-title">
          <span className="astro-glyph" style={{ color }}>{glyph}</span>
          {known
            ? `${t(`expandedSidebar.aspect.${type}.name` as 'expandedSidebar.aspect.conjunction.name')} (${
                ASPECT_ANGLES[type] ?? t('expandedSidebar.aspect.byDeclination')
              })`
            : type}
        </span>
      }
      hint={known ? t(`expandedSidebar.aspect.${type}.desc` as 'expandedSidebar.aspect.conjunction.desc') : undefined}
    >
      {glyph}
    </TipGlyph>
  );
}

// A planet glyph below the wheel (list, table, or aspect rows) that names itself
// as a .ui-tip on hover: the glyph + display name, plus an optional suffix such as
// "(overlay)". No description — the name is the whole point.
function PlanetTipGlyph({
  planet,
  size = 13,
  className = 'es-glyph',
  suffix,
}: {
  planet: PlanetName;
  size?: number;
  className?: string;
  suffix?: string;
}) {
  const { labels } = useT();
  return (
    <TipGlyph
      className={className}
      color={PLANET_COLORS[planet]}
      title={
        <span className="es-tip-title">
          <PlanetGlyph planet={planet} size={14} color={PLANET_COLORS[planet]} />
          {labels.planet(planet)}
          {suffix ? ` ${suffix}` : ''}
        </span>
      }
    >
      <PlanetGlyph planet={planet} size={size} />
    </TipGlyph>
  );
}

// A coordinate-column header that explains itself as the shared .ui-tip on hover —
// the abbreviations (Rt.Asc., Decl., Azi…) aren't obvious to a newcomer, so the
// tip's title spells out the full word (`title`), defaulting to the column label.
function AdvHeader({
  label,
  title,
  hint,
}: {
  label: string;
  title?: string;
  hint: string;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLTableCellElement>('right', { tapReveal: true });
  return (
    <th
      ref={ref}
      className="es-adv-num"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {label}
      <HoverTip pos={pos} placement="right" title={title ?? label} hint={hint} />
    </th>
  );
}

// A section heading (Aspects, Overlay aspects) that explains the section as the
// shared .ui-tip on hover. The ref sits on an inline span hugging the text — not
// the full-width <h3> — so the tip anchors beside the heading rather than out at
// the section's right edge (where the drag handle is).
function TipHeading({
  tip,
  hint,
  children,
}: {
  tip: ReactNode;
  hint: string;
  children: ReactNode;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLSpanElement>('right', { tapReveal: true });
  return (
    <h3>
      <span
        ref={ref}
        className="es-h3-tip"
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {children}
      </span>
      <HoverTip pos={pos} placement="right" title={tip} hint={hint} />
    </h3>
  );
}

// One balance row: a category (element or modality) and the actual bodies that
// fall in it, each drawn as its own planet glyph — a unit chart, so you read both
// the tally and *which* bodies make it up. The whole row is tinted by the
// category colour (the --cat custom property on its cls). The category badge and
// each body glyph are TipSpans, so hovering reveals the shared .ui-tip card
// (category → name + blurb; body → its name) just like the aspect/planet glyphs
// elsewhere. role="img" + aria-label gives the figure a spoken form; an empty
// category stays visible (dimmed) since a missing element/modality is real info.
function BalanceRow({
  seg,
}: {
  seg: {
    label: string;
    glyph: string;
    cls: string;
    hint: string;
    bodies: EclipticPosition[];
  };
}) {
  const { labels } = useT();
  const count = seg.bodies.length;
  const aria =
    count > 0
      ? `${seg.label}: ${count} — ${seg.bodies
          .map((p) => labels.planet(p.name))
          .join(', ')}`
      : `${seg.label}: 0`;
  return (
    <div
      className={`es-balance-row2 ${seg.cls}${count === 0 ? ' es-balance-row2--empty' : ''}`}
      role="img"
      aria-label={aria}
    >
      <TipSpan
        className="es-balance-cat"
        placement="top"
        tapReveal
        tip={
          <span className="es-tip-title">
            <span className="astro-glyph">{seg.glyph}</span> {seg.label}
          </span>
        }
        hint={seg.hint}
      >
        <span className="astro-glyph es-balance-cat-glyph">{seg.glyph}</span>
        <span className="es-balance-name">
          {seg.label} <span className="es-balance-num">({count})</span>
        </span>
      </TipSpan>
      <span className="es-balance-bodies">
        {seg.bodies.map((p) => (
          <TipSpan
            key={p.name}
            className="es-balance-body"
            placement="top"
            tapReveal
            tip={
              <span className="es-tip-title">
                <PlanetGlyph planet={p.name} size={13} /> {labels.planet(p.name)}
              </span>
            }
          >
            <PlanetGlyph planet={p.name} size={14} />
          </TipSpan>
        ))}
      </span>
    </div>
  );
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Aspect orb as "0°12'" — seconds rarely meaningful for orbs.
function fmtOrb(orbDeg: number): string {
  const d = Math.floor(orbDeg);
  let m = Math.round((orbDeg - d) * 60);
  let dd = d;
  if (m === 60) { m = 0; dd += 1; }
  return `${dd}°${pad2(m)}'`;
}

// The aspect-category pill toggles. The structural fields (catalog key, CSS class)
// stay here; the compact label, full tip label, and description copy are resolved from
// the catalog (expandedSidebar.toggle.<tipKey>.*) inside the component.
const ASPECT_TOGGLES: {
  key: AspectCategory;
  /** Catalog sub-key under expandedSidebar.toggle for this toggle's copy. */
  tipKey: 'harmonious' | 'hard' | 'conjunction';
  cssClass: string;
}[] = [
  { key: 'harmonious', tipKey: 'harmonious', cssClass: 'trine' },
  { key: 'hard', tipKey: 'hard', cssClass: 'square' },
  { key: 'conjunction', tipKey: 'conjunction', cssClass: 'conj' },
];

export function ExpandedChartSidebar({
  chart,
  charts,
  point,
  pointLabel,
  pinned,
  isNatalPin,
  angles,
  planets,
  overlayPlanets,
  overlayAngles,
  overlayLabel,
  overlayMoment,
  overlayKind,
  promotedLabel,
  noChart = false,
  planetsOnly = false,
  visiblePlanets,
  visibleLineTypes,
  advancedCoords,
  angleCoords,
  localSpaceCoords,
  natalLocalSpaceCoords,
  relocatedLocalSpaceCoords,
  localSpaceGated = false,
  localSpaceRelocated,
  aspectOrbs,
  advanced,
  setAdvanced,
  dualWheels,
  setDualWheels,
  onClose,
  onResizingChange,
  onSelectChart,
  onNewChart,
  onEditChart,
  onDeleteChart,
}: ExpandedChartSidebarProps) {
  const { t, fmt, labels } = useT();
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    const min = minSidebarWidth();
    const base = saved && saved >= min ? saved : DEFAULT_WIDTH;
    // Rein in a width saved under the old (wider) cap, and fit a narrower viewport.
    return Math.max(min, Math.min(base, maxSidebarWidth()));
  });

  // Portrait phones pin this sidebar to the full viewport width and drop the resize handle (see the
  // CSS), so the width-gated Azimuth/Altitude columns could never be revealed by dragging it wider.
  // Force them on in that mode and let the advanced table scroll sideways instead (the CSS switches
  // .es-adv-table to max-content there so it overflows into the existing .es-adv-scroll).
  const narrow = useNarrowNav();
  const fixedFullWidth = isTouchLayout() && narrow;
  // A LANDSCAPE phone has the same problem by a different route: the panel stays resizable, but
  // its cap (70% of an already-short viewport) sits under the 640px column cutoff, so dragging can
  // never reveal Azimuth/Altitude either. usePhone() catches a phone in BOTH orientations (and no
  // tablets) — the columns force on and the table scrolls sideways there too (matching CSS).
  const phone = usePhone();

  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(width));
  }, [width]);

  // Publish the live panel width so the map edge-glow insets its left edge to
  // the visible map area (right of this sidebar). Through the left-dock
  // registry (lib/leftDock.ts) rather than a raw --es-width write, so another
  // docked panel can be open at the same time without the two fighting over
  // the var; retiring on unmount recomputes it from whatever remains.
  useEffect(() => {
    publishLeftDock('expanded-sidebar', width);
    return () => retireLeftDock('expanded-sidebar');
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

  // Aspect-frame view while horizon data is in: combined (default — one merged
  // list) vs separate (two matched columns). Persisted like the pills above.
  const [splitFrames, setSplitFrames] = useState(
    () => localStorage.getItem(FRAMES_KEY) === 'separate',
  );
  useEffect(() => {
    localStorage.setItem(FRAMES_KEY, splitFrames ? 'separate' : 'combined');
  }, [splitFrames]);
  // Frame-table controls (Separate view): active sort column/direction and
  // the status pills' filter. Session-only — the table is exploratory.
  const [frameSort, setFrameSort] = useState<{
    key: FrameSortKey;
    dir: 1 | -1;
  }>({ key: 'status', dir: 1 });
  const [frameStatuses, setFrameStatuses] = useState<Set<FrameStatus>>(
    () => new Set(FRAME_STATUSES),
  );


  // Respect the Map Filter's planet toggles across every area of the expanded
  // view (planet list, wheel, aspects, overlay aspects), and present them in the
  // conventional luminary-first order (Moon, Sun, Mercury, …).
  const shownPlanets = planets
    .filter((p) => visiblePlanets.has(p.name))
    .sort((a, b) => planetRank(a.name) - planetRank(b.name));
  const shownOverlay =
    overlayPlanets?.filter((p) => visiblePlanets.has(p.name)) ?? null;
  // Whether a drawable overlay ring exists — the Dual toggle (and the dual
  // layout it controls) only mean anything when there's a second wheel to split.
  const hasOverlay = !!shownOverlay && shownOverlay.length > 0 && !!overlayAngles;
  // The frame the wheel renders on: real angles, or — when the birth time is
  // unknown and there are none — the neutral Aries frame (planets-only wheel).
  // Everything that shows angle VALUES keeps reading `angles` (null → hidden).
  const frame = angles ?? (planetsOnly ? ARIES_FRAME : null);

  // Horizon-frame (local-space) data, shared by the dial below the wheel stack
  // and the aspect list's frame statuses. Null while the view is off (or the
  // caller's gate holds it back) — everything downstream then renders as if
  // the feature didn't exist.
  const lsCoords =
    localSpaceCoords && localSpaceCoords.size > 0 ? localSpaceCoords : null;
  const lsAzimuths = lsCoords
    ? new Map(Array.from(lsCoords, ([n, c]) => [n, c.az]))
    : null;
  const azAspects = lsAzimuths
    ? computeAzimuthAspects(shownPlanets, lsAzimuths, aspectOrbs)
    : null;

  // The local-space PAIR of dials: natal (birthplace) and relocated (pin). Each
  // plots its own bodies and azimuth-aspect chords; the relocated dial is null when
  // it would only duplicate the natal one (the caller leaves that slot empty then).
  const toAz = (
    m: Map<PlanetName, { az: number; alt: number }>,
  ): Map<PlanetName, number> =>
    new Map(Array.from(m, ([n, cc]) => [n, cc.az] as [PlanetName, number]));
  const lsNatal =
    natalLocalSpaceCoords && natalLocalSpaceCoords.size > 0
      ? natalLocalSpaceCoords
      : null;
  const lsReloc =
    relocatedLocalSpaceCoords && relocatedLocalSpaceCoords.size > 0
      ? relocatedLocalSpaceCoords
      : null;
  const lsNatalAspects = lsNatal
    ? computeAzimuthAspects(shownPlanets, toAz(lsNatal), aspectOrbs)
    : null;
  const lsRelocAspects = lsReloc
    ? computeAzimuthAspects(shownPlanets, toAz(lsReloc), aspectOrbs)
    : null;

  // The four chart angles, gated by the Map Filter's line-type toggles. Drives
  // which angle marks (As/Ds/Mc/Ic) the wheel draws.
  const visibleAngles = new Set<'As' | 'Ds' | 'Mc' | 'Ic' | 'Vx' | 'Avx'>();
  if (visibleLineTypes.has('ASC')) visibleAngles.add('As');
  if (visibleLineTypes.has('DSC')) visibleAngles.add('Ds');
  if (visibleLineTypes.has('MC')) visibleAngles.add('Mc');
  if (visibleLineTypes.has('IC')) visibleAngles.add('Ic');
  // The Vertex axis follows its own line-type toggles (the Vx/Avx buttons in
  // the Lines filter), so map lines and wheel/readout marks move together.
  if (visibleLineTypes.has('VX')) visibleAngles.add('Vx');
  if (visibleLineTypes.has('AVX')) visibleAngles.add('Avx');

  // The same visible angles as list rows, in the conventional Mc, Ic, As, Ds
  // order (the Vertex axis after them). They tack onto the end of the planet
  // list below (no separate heading), so the readout still lists them even
  // though they now also live in the wheel — every row gated by the same
  // line-type toggles as its map line.
  const shownAngleRows = angles
    ? visibleAngleSpecs(visibleLineTypes).map((s) => ({
        code: s.code,
        key: s.key,
        name: t(s.nameKey),
        lon: angles[s.key],
        color: s.color,
      }))
    : [];

  // The out-of-bounds limit IS the Sun's maximum declination — the true
  // obliquity at the chart's moment (~23°26'; drifts ~47" per century). Epoch
  // differences to any overlay rows are arcseconds and don't matter here.
  const oobLimitDeg = useMemo(
    () => (chart ? obliquity(birthDataToJD(chart)) * RAD2DEG : 23.44),
    [chart],
  );

  // Bold state title for the wheel's top-left corner (always shown when a chart is
  // up). Coloured by the live map state via --map-accent — neutral natal, blue
  // hover, gold pinned, green natal-pin — so it tracks the same palette as the pin.
  const baseTitle = isNatalPin
    ? t('expandedSidebar.wheelTitle.natal')
    : pinned
      ? t('expandedSidebar.wheelTitle.pinned')
      : point
        ? t('expandedSidebar.wheelTitle.hover')
        : t('expandedSidebar.wheelTitle.natal');
  // When a time overlay is promoted (Natal toggle off, so it stands in for the chart),
  // the wheel's state title is REPLACED by the overlay's own name ("Sec. Progressed",
  // "Transits", "CCG", …) rather than "NATAL/HOVER/PINNED CHART": the live --map-accent
  // colour (applied below) already conveys the hover/pin state, so the text is freed to
  // name the promoted overlay outright.
  const wheelTitle = promotedLabel ?? baseTitle;
  // Just the overlay's name for the wheel's top-right corner (the full label
  // "Name · details" lives in the timeline bar); the rest after the separator drops.
  // Cyclo is special-cased to "CCG": its name "Cyclo·carto·graphy" contains middots,
  // so the generic split would truncate it to "Cyclo".
  const overlayName = overlayLabel
    ? overlayKind === 'cyclo'
      ? 'CCG'
      : overlayLabel.split('·')[0].trim()
    : null;
  // The overlay's date/time (UTC) to show alongside its name over the wheel, so the moment
  // reads even without the timeline bar in view. A middot splits date · time (matching the
  // bar's separator convention); "UTC" is kept explicit as the labelFull captions do.
  const momentText = overlayMoment ? `${overlayMoment.replace(' ', ' · ')} UTC` : null;

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
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const maxWidth = maxSidebarWidth();
      const newWidth = Math.max(
        minSidebarWidth(),
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
    // Pointer Events cover mouse + touch + pen in one path (mirrors useMovableHud);
    // pointercancel ends a drag the OS interrupts. The handle takes pointer capture on
    // down, so moves keep arriving even after the finger/cursor leaves it.
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
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
  // Shared camera for the local-space globe pair: dragging either dial rotates
  // both (kept aligned for natal-vs-relocated comparison). An external store, so a
  // spin re-renders only the two globes — not this whole sidebar. Session-only; a
  // double-click on a globe resets it to the default vantage.
  const lsViewStore = useLocalSpaceView();
  // Shared hovered body: hovering a glyph on one globe lights the same body's tip on
  // the sibling globe too (same store-not-state reasoning as the camera).
  const lsHoverStore = useLocalSpaceHover();
  // Local-space dial style: the rotatable 3D globe (default) vs the flat 2D compass.
  // Persisted like the other sidebar prefs.
  const [ls3d, setLs3d] = useState(() => localStorage.getItem(LS_MODE_KEY) !== '2d');
  useEffect(() => {
    localStorage.setItem(LS_MODE_KEY, ls3d ? '3d' : '2d');
  }, [ls3d]);

  const beginDrag = (e: ReactPointerEvent) => {
    if (e.button !== 0) return; // primary button / single touch contact only
    draggingRef.current = true;
    setDragging(true);
    onResizingChange?.(true);
    dragOffsetRef.current = width - e.clientX;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    // Capture the pointer so moves route here (then bubble to the window listeners)
    // even when it slides off the thin handle; with touch-action:none this also stops
    // the browser turning the drag into a scroll/zoom.
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const {
    ref: resizeTipRef,
    pos: resizeTipPos,
    show: showResizeTip,
    hide: hideResizeTip,
  } = useHoverTip<HTMLDivElement>('right');

  // Touch + dragged below the desktop minimum width (MIN_WIDTH): too narrow to spell every label
  // out, so the glyphs carry the rows (`es-compact`, see the CSS). The threshold sits INSIDE the
  // touch drag range [MIN_WIDTH_TOUCH, ~70% of the viewport], so widening back past it restores
  // the labels live. (Desktop can't go below MIN_WIDTH, so it's never compact — labels always
  // show there. The old DEFAULT_WIDTH threshold was unreachable on a phone, so it stuck compact.)
  const compact = isTouchLayout() && width < MIN_WIDTH;
  return (
    <aside
      className={`expanded-sidebar ${dragging ? 'dragging' : ''}${compact ? ' es-compact' : ''}`}
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
            {frame && hasOverlay && (
              <TipButton
                type="button"
                className={`es-advanced-toggle ${dualWheels ? 'on' : 'off'}`}
                onClick={() => setDualWheels(!dualWheels)}
                role="switch"
                aria-checked={dualWheels}
                placement="bottom"
                tip={t('expandedSidebar.dual.tip')}
                hint={t('expandedSidebar.dual.hint')}
              >
                <span className="es-toggle-label">{t('expandedSidebar.dual.label')}</span>
                <span className="es-toggle-track">
                  <span className="es-toggle-thumb" />
                </span>
              </TipButton>
            )}
            <TipButton
              type="button"
              className="es-close-btn"
              onClick={onClose}
              aria-label={t('expandedSidebar.close.aria')}
              placement="bottom"
              tip={t('expandedSidebar.close.tip')}
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
              <span>{t('expandedSidebar.close.label')}</span>
            </TipButton>
            {/* Plan-tag cue mirroring the profile strip: shows the rung on the plan
                ladder and shares its click. Absolutely positioned just below the
                Hide button so it adds no header height. Open core flips Advanced;
                a downstream build's onPlanTag (e.g. open a plan screen) takes over
                when installed, so the two tags stay in lockstep. */}
            <TipButton
              type="button"
              className={`es-plan-tag tier-${planTierFor(advanced)}`}
              onClick={() => {
                const { onPlanTag } = getProfileSection();
                if (onPlanTag) onPlanTag({ advanced, setAdvanced });
                else setAdvanced(!advanced);
              }}
              role="switch"
              aria-checked={advanced}
              placement="left"
              tip={t(advanced ? 'profile.planTag.tipBasic' : 'profile.planTag.tip')}
              hint={t(advanced ? 'profile.planTag.hintBasic' : 'profile.planTag.hint')}
            >
              {tierName(planTierFor(advanced))}
            </TipButton>
          </div>
        </div>
        {chart && (
          <div className="es-meta">
            <span className="es-meta-when">
              {fmtChartDate(chart, fmt)}
              <span className="es-meta-tz">{formatUtcOffset(chart.tzOffset)}</span>
              {chart.tzUncertain && (
                <TipGlyph
                  className="es-meta-warn"
                  title={
                    <span className="es-tip-title">
                      <span className="es-meta-warn">⚠</span> {t('expandedSidebar.tzUncertain')}
                    </span>
                  }
                  hint={t('expandedSidebar.tzUncertainHint')}
                >
                  ⚠
                </TipGlyph>
              )}
            </span>
          </div>
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
          // The pin marker, shown whenever a pin is placed. It sits beside the place
          // name when there is one; if the name line is hidden (e.g. the measure tool
          // nulls it) it falls back beside the coordinates, so a placed pin is never
          // left unmarked.
          const pinIcon = (
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
          );
          // The chart-state name (NATAL CHART / PINNED CHART / …) already shows in
          // the wheel's top-left corner, so here we show the place name (marked with a
          // pin when one's placed) above its coordinates.
          return (
            <div className={`es-relocated ${stateClass}`}>
              {/* The active point's place name — the chart's only location line (the
                  fixed birthplace line was removed to avoid showing the place twice).
                  Falls back to the birthplace when nothing is pinned, so it's never
                  blank; null only in transient states (e.g. the measure tool). When a
                  pin is placed, the pin marker sits beside the name (the place IS the
                  pin's location). */}
              {/* ALWAYS rendered (nbsp while there's no name): the hover
                  geocode resolves per mouse move, so a line that mounts/
                  unmounts — or re-wraps between 1 and 2 lines — changes the
                  header's height on every move, and the scroll container then
                  "self-scrolls" to compensate whenever the user has scrolled
                  down (scroll anchoring; see .es-scroll). A permanent one-line
                  box (ellipsized in CSS) keeps the header geometry still. The
                  pin marker lives here in every case, so a placed pin is
                  never left unmarked. */}
              <span className="es-relocated-place">
                {hasPin && pinIcon}
                {pointLabel || '\u00A0'}
              </span>
              <span className="es-relocated-text">
                {fmtLat(displayPoint.lat)} {fmtLng(displayPoint.lng)}
              </span>
            </div>
          );
        })()}

      </section>

      <section className="es-section es-section-wheel">
        {(() => {
          // Dual Wheels (Advanced ▸ Wheel layout): split the bi-wheel into two
          // full wheels — natal, then the overlay as a standalone chart with
          // its own internal aspect chords. Bi-wheel is the default.
          const showDual = dualWheels && hasOverlay;
          // Local space as a PAIR of half-width horizon dials at the bottom of the
          // wheel stack while the Local Space view is on: natal (birthplace) on the
          // left — always — and relocated (pin) on the right, or an empty slot when
          // the relocated frame would merely repeat the natal one. Each ~46% of the
          // pane so both sit on one row with room for the rim labels between them.
          const lsSize = Math.floor(wheelSize * 0.46);
          // One dial — the flat 2D compass (default) or the rotatable 3D globe, per
          // the toggle. The 2D compass ignores the camera store; both share the
          // hover store so hovering a glyph lights the same body on the sibling dial.
          const lsDial = (
            cd: Map<PlanetName, { az: number; alt: number }>,
            asp: Aspect[] | null,
          ) =>
            ls3d ? (
              <LocalSpaceWheel
                size={lsSize}
                planets={shownPlanets}
                coords={cd}
                aspects={asp ?? undefined}
                visibleAspects={visibleAspects}
                viewStore={lsViewStore}
                hoverStore={lsHoverStore}
              />
            ) : (
              <LocalSpaceCompass
                size={lsSize}
                planets={shownPlanets}
                coords={cd}
                aspects={asp ?? undefined}
                visibleAspects={visibleAspects}
                hoverStore={lsHoverStore}
              />
            );
          const lsPair = lsNatal && (
            <>
              <div className="es-ls-head">
                <span className="es-overlay-caption">
                  {t('expandedSidebar.localSpace.caption')}
                </span>
                <TipButton
                  type="button"
                  // The toggle reads "Flat": OFF is the default 3D globe, ON the 2D
                  // compass — so its on/off + aria track !ls3d.
                  className={`es-advanced-toggle ${!ls3d ? 'on' : 'off'}`}
                  onClick={() => setLs3d(!ls3d)}
                  role="switch"
                  aria-checked={!ls3d}
                  placement="left"
                  gated
                  tip={t('expandedSidebar.localSpace.flatTip')}
                  hint={t('expandedSidebar.localSpace.flatHint')}
                >
                  <span className="es-toggle-label">
                    {t('expandedSidebar.localSpace.flat')}
                  </span>
                  <span className="es-toggle-track">
                    <span className="es-toggle-thumb" />
                  </span>
                </TipButton>
              </div>
              <div className="es-ls-pair">
                <div className="es-ls-col">
                  <div className="es-dual-caption">
                    <TipSpan
                      className="es-overlay-caption"
                      tapReveal
                      tip={t('expandedSidebar.localSpace.natalWheel')}
                      hint={t('expandedSidebar.localSpace.natalWheelHint')}
                    >
                      {t('expandedSidebar.localSpace.natalWheel')}
                    </TipSpan>
                  </div>
                  {lsDial(lsNatal, lsNatalAspects)}
                </div>
                <div className="es-ls-col">
                  <div className="es-dual-caption">
                    <TipSpan
                      className="es-overlay-caption"
                      tapReveal
                      tip={t('expandedSidebar.localSpace.relocatedWheel')}
                      hint={t('expandedSidebar.localSpace.relocatedWheelHint')}
                    >
                      {t('expandedSidebar.localSpace.relocatedWheel')}
                    </TipSpan>
                  </div>
                  {lsReloc ? (
                    lsDial(lsReloc, lsRelocAspects)
                  ) : (
                    <TipSpan
                      className="es-ls-empty"
                      style={{ width: lsSize, height: lsSize }}
                      tapReveal
                      tip={t('expandedSidebar.localSpace.relocatedEmpty')}
                      hint={t('expandedSidebar.localSpace.relocatedEmptyHint')}
                    >
                      {t('expandedSidebar.localSpace.relocatedEmpty')}
                    </TipSpan>
                  )}
                </div>
              </div>
            </>
          );
          // Dials held back by the tier gate (so lsPair is null): render whatever a
          // downstream build put in the local-space slot in their place — nothing in the
          // open core; a placeholder in a gated build (lib/extensions/localSpaceSlot).
          const lsTease = localSpaceGated ? renderLocalSpaceGatedSlot(lsSize) : null;
          return (
            <>
              {/* Use the wheel's empty top corners: the chart-state title (left,
                  always) and, when an overlay is on, its caption (right — in
                  Dual Wheels the caption sits between the wheels instead). */}
              {frame && (
                <div className="es-wheel-corner es-wheel-corner-left">
                  <span className="es-wheel-title" style={{ color: 'var(--map-accent)' }}>
                    {wheelTitle}
                  </span>
                  {frame.fallback && (
                    <TipSpan
                      className="es-house-fallback es-house-fallback-info"
                      tip={t('expandedSidebar.houseFallback')}
                      hint={t('expandedSidebar.houseFallbackHint')}
                      tapReveal
                    >
                      {t('expandedSidebar.houseFallback')}
                      <svg
                        className="es-info-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 11v4.5" />
                        <path d="M12 7.75h.01" />
                      </svg>
                    </TipSpan>
                  )}
                  {planetsOnly && !angles && (
                    <span className="es-house-fallback">
                      {t('expandedSidebar.timeUnknownNote')}
                    </span>
                  )}
                </div>
              )}
              {frame && overlayName && !showDual && (
                <div
                  // When the overlay moment is shown it stacks ABOVE the name as a
                  // right-aligned column (es-overlay-corner); the corner is absolutely
                  // positioned over the wheel, so this never adds sidebar height.
                  className={`es-wheel-corner es-wheel-corner-right${
                    momentText ? ' es-overlay-corner' : ''
                  }`}
                >
                  {momentText && (
                    <span className="es-overlay-moment">{momentText}</span>
                  )}
                  <span className="es-overlay-caption es-overlay-dashed">
                    {overlayName}
                  </span>
                </div>
              )}
              <div
                // The dual modifier stacks the pane's children in a column —
                // needed whenever more than one wheel renders, so the horizon
                // dial (or its locked teaser) lands BELOW the wheel(s) rather
                // than beside them.
                className={`es-wheel-pane${
                  showDual || lsPair || lsTease ? ' es-wheel-pane-dual' : ''
                }`}
                ref={wheelPaneRef}
              >
                {frame ? (
                  showDual ? (
                    <>
                      <WheelSvg
                        size={wheelSize}

                        angles={frame}
                        planets={shownPlanets}
                        detailed={true}
                        advanced={advanced}
                        aspectOrbs={aspectOrbs}
                        visibleAspects={visibleAspects}
                        visibleAngles={visibleAngles}
                        readouts={fixedFullWidth}
                        interactive
                        planetsOnly={planetsOnly && !angles}
                      />
                      {overlayName && (
                        <div className="es-dual-caption">
                          {/* Dual layout has room, so the moment is appended INLINE after
                              the name with a middot separator (only the name keeps the
                              dotted underline that echoes the map's overlay lines). */}
                          <span className="es-overlay-caption es-overlay-inline">
                            <span className="es-overlay-dashed">{overlayName}</span>
                            {momentText && (
                              <span className="es-overlay-moment"> · {momentText}</span>
                            )}
                          </span>
                        </div>
                      )}
                      <WheelSvg
                        size={wheelSize}
                        angles={overlayAngles!}
                        planets={shownOverlay!}
                        detailed={true}
                        advanced={advanced}
                        aspectOrbs={aspectOrbs}
                        visibleAspects={visibleAspects}
                        visibleAngles={visibleAngles}
                        readouts={fixedFullWidth}
                        interactive
                      />
                      {lsPair || lsTease}
                    </>
                  ) : (
                    <>
                      <WheelSvg
                        size={wheelSize}
                        angles={frame}

                        planets={shownPlanets}
                        detailed={true}
                        advanced={advanced}
                        aspectOrbs={aspectOrbs}
                        overlayPlanets={shownOverlay}
                        overlayAngles={overlayAngles}
                        visibleAspects={visibleAspects}
                        visibleAngles={visibleAngles}
                        // Portrait phone: the panel can't be dragged wider, so the wheel never reaches
                        // READOUT_MIN — force the per-point degree·sign·minute readouts on (still
                        // geometry-guarded), which also draws the house ring in tighter to fit them.
                        readouts={fixedFullWidth}
                        interactive
                        planetsOnly={planetsOnly && !angles}
                      />
                      {lsPair || lsTease}
                    </>
                  )
                ) : noChart ? (
                  // A promoted overlay with no coherent chart (CCG, Natal hidden) — an
                  // empty wheel reading "NO CHART", sized to the pane.
                  <NoChartWheel
                    size={wheelSize}
                    label={t('expandedSidebar.noChart')}
                    note={t('expandedSidebar.noChartNote')}
                  />
                ) : (
                  <div className="es-empty">{t('expandedSidebar.empty')}</div>
                )}
              </div>
            </>
          );
        })()}
        {frame && (
          <div className="es-aspect-toggles">
            {ASPECT_TOGGLES.map((tg) => {
              const on = visibleAspects.has(tg.key);
              return (
                <TipButton
                  key={tg.key}
                  type="button"
                  className={`es-asp-toggle ${tg.cssClass} ${on ? 'on' : 'off'}`}
                  onClick={() => toggleAspect(tg.key)}
                  placement="right"
                  tip={t(`expandedSidebar.toggle.${tg.tipKey}.tipLabel` as 'expandedSidebar.toggle.harmonious.tipLabel')}
                  hint={t(`expandedSidebar.toggle.${tg.tipKey}.desc` as 'expandedSidebar.toggle.harmonious.desc')}
                >
                  <span className="es-asp-swatch" />
                  <span className="es-asp-label">{t(`expandedSidebar.toggle.${tg.tipKey}.label` as 'expandedSidebar.toggle.harmonious.label')}</span>
                </TipButton>
              );
            })}
          </div>
        )}
      </section>

      {/* Planet + angle readout below the wheel — no heading. Planets come
          first, then the visible angles (Mc, Ic, As, Ds) tack onto the end of
          the same list. The angles also render in the wheel above. */}
      {frame && (shownPlanets.length > 0 || shownAngleRows.length > 0) && (() => {
        // Simple view: planets then angles in one row-by-row two-column grid
        // (even index → left, odd → right), so the angles flow straight on from
        // the last planet.
        const planetItems = shownPlanets.map((p) => ({ kind: 'planet' as const, p }));
        const angleItems = shownAngleRows.map((a) => ({ kind: 'angle' as const, ...a }));
        const rows = [...planetItems, ...angleItems];
        const leftCol = rows.filter((_, i) => i % 2 === 0);
        const rightCol = rows.filter((_, i) => i % 2 === 1);
        const renderRow = (row: (typeof rows)[number]) =>
          row.kind === 'planet' ? (
            <li key={`p-${row.p.name}`}>
              <div className="es-row-main">
                <span className="es-glyph" style={{ color: PLANET_COLORS[row.p.name] }}>
                  <PlanetGlyph planet={row.p.name} size={13} />
                </span>
                <span className="es-name">{labels.planet(row.p.name)}</span>
                <span className="es-lon">
                  <Longitude lon={row.p.lon} advanced={advanced} />
                </span>
              </div>
            </li>
          ) : (
            <li key={`a-${row.code}`}>
              <div className="es-row-main">
                <span className="es-glyph es-angle-code" style={{ color: row.color }}>
                  {row.code}
                </span>
                <span className="es-name">{row.name}</span>
                <span className="es-lon">
                  <Longitude lon={row.lon} advanced={advanced} />
                </span>
              </div>
            </li>
          );
        // Two width-driven cutoffs keep the table fitting (it fills the panel, so
        // it must never need to scroll). Past the first, the Longitude column shows
        // the full sign name (e.g. "21°38' ♉ Taurus") instead of the compact glyph
        // form; past the second, the Azimuth + Altitude columns also fit. Below a
        // cutoff the heavier content drops back so a narrow panel still fits.
        const advFullSign = width >= 530;
        // Past 640px the Azimuth + Altitude columns fit; OR force them on phones — portrait pins
        // the panel full-width, landscape caps it at 70% of a short viewport, so NEITHER can reach
        // the cutoff by dragging — where the table scrolls sideways instead (usePhone also covers
        // fixedFullWidth's portrait case).
        const advExtraCols = width >= 640 || phone;
        // Advanced view: one planet per row across labelled coordinate columns.
        // Geocentric columns come straight off the body; RA/Azimuth/Altitude come
        // from advancedCoords (computed for the relocated observer).
        const renderAdvRow = (p: EclipticPosition) => {
          const hc = advancedCoords.get(p.name);
          const decCls = p.dec !== undefined ? decClass(p.dec, oobLimitDeg) : '';
          const dec = p.dec !== undefined ? fmtDM(p.dec * RAD2DEG, true) : '—';
          return (
            <tr key={p.name}>
              <td className="es-adv-point">
                <span className="es-glyph" style={{ color: PLANET_COLORS[p.name] }}>
                  <PlanetGlyph planet={p.name} size={13} />
                </span>
                <span className="es-name">{labels.planet(p.name)}</span>
                {p.stationary ? (
                  <TipGlyph
                    className="es-station"
                    title={
                      <span className="es-tip-title">
                        <span style={{ color: '#c79a17' }}>S</span> {t('expandedSidebar.stationary')}
                      </span>
                    }
                    hint={t('expandedSidebar.stationaryHint')}
                  >
                    S
                  </TipGlyph>
                ) : p.retrograde ? (
                  <TipGlyph
                    className="es-rx"
                    title={
                      <span className="es-tip-title">
                        <span style={{ color: 'var(--danger)' }}>℞</span> {t('expandedSidebar.retrograde')}
                      </span>
                    }
                    hint={t('expandedSidebar.retrogradeHint')}
                  >
                    ℞
                  </TipGlyph>
                ) : null}
              </td>
              <td className="es-adv-num es-adv-lon">
                {advFullSign ? (
                  <Longitude lon={p.lon} advanced={false} />
                ) : (
                  <SignLon lon={p.lon} />
                )}
              </td>
              <td className="es-adv-num">
                {p.speed !== undefined ? fmtDM(p.speed, true) : '—'}
              </td>
              <td className="es-adv-num">
                {p.lat !== undefined ? fmtDM(p.lat * RAD2DEG, true) : '—'}
              </td>
              <td className="es-adv-num">{hc ? fmtDM(hc.ra * RAD2DEG) : '—'}</td>
              <td className={`es-adv-num ${decCls}`}>
                {decCls ? (
                  <TipGlyph
                    title={
                      <span className="es-tip-title">
                        <span className="es-dec-oob es-dec-dot" />
                        {t('expandedSidebar.outOfBounds', {
                          dir: (p.dec ?? 0) > 0 ? t('expandedSidebar.north') : t('expandedSidebar.south'),
                        })}
                      </span>
                    }
                    hint={t('expandedSidebar.outOfBoundsHint')}
                  >
                    {dec}
                  </TipGlyph>
                ) : (
                  dec
                )}
              </td>
              {advExtraCols && (
                <>
                  <td className="es-adv-num">{hc ? fmtDM(hc.az * RAD2DEG) : '—'}</td>
                  <td className="es-adv-num">
                    {hc ? fmtDM(hc.alt * RAD2DEG, true) : '—'}
                  </td>
                </>
              )}
            </tr>
          );
        };
        // Advanced mode lists the angles in the same table, right after the
        // planets. Each angle is an ecliptic point, so latitude is 0 and RA / Decl
        // / Azimuth / Altitude come from angleCoords (same observer as the planets);
        // Speed has no meaning for an angle, so that cell stays an em-dash.
        const renderAdvAngleRow = (a: (typeof shownAngleRows)[number]) => {
          const ac = angleCoords?.[a.key];
          return (
            <tr key={`a-${a.code}`}>
              <td className="es-adv-point">
                <span className="es-glyph es-angle-code" style={{ color: a.color }}>
                  {a.code}
                </span>
                <span className="es-name">{a.name}</span>
              </td>
              <td className="es-adv-num es-adv-lon">
                {advFullSign ? (
                  <Longitude lon={a.lon} advanced={false} />
                ) : (
                  <SignLon lon={a.lon} />
                )}
              </td>
              <td className="es-adv-num">—</td>
              <td className="es-adv-num">{ac ? fmtDM(ac.lat * RAD2DEG, true) : '—'}</td>
              <td className="es-adv-num">{ac ? fmtDM(ac.ra * RAD2DEG) : '—'}</td>
              <td className="es-adv-num">{ac ? fmtDM(ac.dec * RAD2DEG, true) : '—'}</td>
              {advExtraCols && (
                <>
                  <td className="es-adv-num">{ac ? fmtDM(ac.az * RAD2DEG) : '—'}</td>
                  <td className="es-adv-num">{ac ? fmtDM(ac.alt * RAD2DEG, true) : '—'}</td>
                </>
              )}
            </tr>
          );
        };
        return (
          <section className="es-section es-section-details">
            <div className="es-planets-col">
              {advanced ? (
                <div className="es-adv-scroll">
                  <table className="es-adv-table">
                    <thead>
                      <tr>
                        <th className="es-adv-point">{t('expandedSidebar.table.point')}</th>
                        <AdvHeader label={t('expandedSidebar.table.longitude')} hint={t('expandedSidebar.table.longitudeHint')} />
                        <AdvHeader label={t('expandedSidebar.table.speed')} hint={t('expandedSidebar.table.speedHint')} />
                        <AdvHeader label={t('expandedSidebar.table.latitude')} hint={t('expandedSidebar.table.latitudeHint')} />
                        <AdvHeader label={t('expandedSidebar.table.raLabel')} title={t('expandedSidebar.table.raTitle')} hint={t('expandedSidebar.table.raHint')} />
                        <AdvHeader label={t('expandedSidebar.table.decLabel')} title={t('expandedSidebar.table.decTitle')} hint={t('expandedSidebar.table.decHint')} />
                        {advExtraCols && (
                          <>
                            <AdvHeader label={t('expandedSidebar.table.aziLabel')} title={t('expandedSidebar.table.aziTitle')} hint={t('expandedSidebar.table.aziHint')} />
                            <AdvHeader label={t('expandedSidebar.table.altLabel')} title={t('expandedSidebar.table.altTitle')} hint={t('expandedSidebar.table.altHint')} />
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {shownPlanets.map(renderAdvRow)}
                      {shownAngleRows.map(renderAdvAngleRow)}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="es-planet-cols">
                  <ul className="es-planet-list">{leftCol.map(renderRow)}</ul>
                  {rightCol.length > 0 && (
                    <ul className="es-planet-list">{rightCol.map(renderRow)}</ul>
                  )}
                </div>
              )}
            </div>
          </section>
        );
      })()}

      {frame && shownPlanets.length > 0 && (() => {
        // Element/modality tallies (always shown) + essential dignities (Advanced
        // only — domicile/detriment/etc. is a denser read) over the SHOWN bodies
        // (the map filter decides what counts, like every list in this panel).
        // Group the SHOWN bodies by element and by modality (every body has
        // exactly one of each). We keep the bodies themselves, not just a count,
        // so the balance can be drawn as a constellation of their glyphs.
        const elementBodies: Record<
          'fire' | 'earth' | 'air' | 'water',
          EclipticPosition[]
        > = { fire: [], earth: [], air: [], water: [] };
        const modalityBodies: Record<
          'cardinal' | 'fixed' | 'mutable',
          EclipticPosition[]
        > = { cardinal: [], fixed: [], mutable: [] };
        for (const p of shownPlanets) {
          const idx = signIndex(p.lon);
          elementBodies[signElement(idx)].push(p);
          modalityBodies[signModality(idx)].push(p);
        }
        // Dignities stay gated to Advanced; skip the lookup entirely otherwise so
        // the always-on constellation costs nothing extra.
        const dignified = advanced
          ? shownPlanets
              .map((p) => ({ p, d: essentialDignity(p.name, signIndex(p.lon)) }))
              .filter((x): x is typeof x & { d: Dignity } => x.d !== null)
          : [];
        const elementSegs = (['fire', 'earth', 'air', 'water'] as const).map(
          (e) => ({
            key: e,
            label: t(`expandedSidebar.element.${e}`),
            glyph: ELEMENT_GLYPHS[e],
            cls: `es-el-${e}`,
            hint: t(`expandedSidebar.elementDesc.${e}`),
            bodies: elementBodies[e],
          }),
        );
        const modalitySegs = (['cardinal', 'fixed', 'mutable'] as const).map(
          (m) => ({
            key: m,
            label: t(`expandedSidebar.modality.${m}`),
            glyph: MODALITY_GLYPHS[m],
            cls: `es-mod-${m}`,
            hint: t(`expandedSidebar.modalityDesc.${m}`),
            bodies: modalityBodies[m],
          }),
        );
        return (
          <section className="es-section es-section-balance">
            <TipHeading
              tip={t('expandedSidebar.balanceTip')}
              hint={t('expandedSidebar.balanceHint')}
            >
              {t('expandedSidebar.balanceHeading')}
            </TipHeading>
            <div className="es-balance-groups">
              <div className="es-balance-group">
                {elementSegs.map((s) => (
                  <BalanceRow key={s.key} seg={s} />
                ))}
              </div>
              <div className="es-balance-group">
                {modalitySegs.map((s) => (
                  <BalanceRow key={s.key} seg={s} />
                ))}
              </div>
            </div>
            {dignified.length > 0 && (
              <ul className="es-dignity-list">
                {dignified.map(({ p, d }) => {
                  const term = t(`expandedSidebar.dignity.${d}`);
                  return (
                    <li key={p.name}>
                      <PlanetGlyph
                        planet={p.name}
                        size={12}
                        className="asp-planet"
                        color={PLANET_COLORS[p.name]}
                      />
                      <span className="es-dignity-planet">{labels.planet(p.name)}</span>
                      <TipSpan
                        className={`es-dignity es-dignity-${d}`}
                        placement="top"
                        tapReveal
                        tip={term.charAt(0).toUpperCase() + term.slice(1)}
                        hint={t(`expandedSidebar.dignityDesc.${d}`)}
                      >
                        {term}
                      </TipSpan>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })()}

      {angles && advanced && (() => {
        // Longitude aspects plus the declination pairs (parallel reads with the
        // conjunction toggle, contraparallel with the hard-aspect toggle).
        // While horizon-frame data is in (azAspects), the section offers two
        // views (the Separate switch beside the heading, shown only then):
        //   • combined (default) — one merged list: each zodiacal aspect is
        //     tagged 'both' (same pair + same type also holds between azimuths;
        //     capsule + orb-shift marker) or 'lost' (dimmed + ⊘), and
        //     azimuth-only aspects append as 'only' rows. Declination pairs
        //     stay untagged (no horizon analogue).
        //   • separate — a frame TABLE, one row per pair: natal aspect,
        //     local-space aspect, signed orb change, and a status — retained /
        //     changed (the pair holds in both frames but as different types) /
        //     lost / new. Headers sort, the status pills filter. Statuses are
        //     computed BEFORE the category pills so they never lie; a row then
        //     shows while either of its aspects passes the pills. Declination
        //     pairs sit the table out (combined view only).
        const vis = (a: Aspect) => visibleAspects.has(a.category);
        const lonAll = computeAspects(shownPlanets, aspectOrbs);
        const lonAspects = lonAll.filter(vis);
        const decAspects = computeDeclinationAspects(
          shownPlanets,
          aspectOrbs,
        ).filter(vis);
        const k = (a: Aspect) => `${[a.a, a.b].sort().join('|')}|${a.type}`;
        const azByKey =
          azAspects && new Map(azAspects.map((a) => [k(a), a] as const));
        const natKeys = new Set(lonAll.map(k));
        const azOnly = (azAspects ?? [])
          .filter(vis)
          .filter((a) => !natKeys.has(k(a)));
        if (lonAspects.length + decAspects.length + azOnly.length === 0) {
          return null;
        }
        const byOrb = (x: Aspect, y: Aspect) => x.orb - y.orb;

        // How the horizon frame moved a kept aspect relative to natal:
        // ▾ tighter (closer to exact) / ▴ wider. Sub-arcminute drift reads
        // as equal (no marker).
        const orbShift = (nat: Aspect, ls: Aspect) => {
          const d = ls.orb - nat.orb;
          if (Math.abs(d) < 1 / 60) return null;
          const tighter = d < 0;
          return (
            <TipGlyph
              className={`es-orb-shift ${tighter ? 'es-orb-tighter' : 'es-orb-wider'}`}
              title={
                <span className="es-tip-title">
                  {t(
                    tighter
                      ? 'expandedSidebar.localSpace.tighter'
                      : 'expandedSidebar.localSpace.wider',
                  )}
                </span>
              }
              hint={t(
                tighter
                  ? 'expandedSidebar.localSpace.tighterHint'
                  : 'expandedSidebar.localSpace.widerHint',
                { delta: fmtOrb(Math.abs(d)) },
              )}
            >
              {tighter ? '▾' : '▴'}
            </TipGlyph>
          );
        };

        // One aspect's five cells; extras slot INTO the type / orb cells
        // (badges, orb-shift) so the row grid stays five columns.
        const cells = (
          a: Aspect,
          typeExtra?: ReactNode,
          orbExtra?: ReactNode,
        ) => (
          <>
            <PlanetTipGlyph
              planet={a.a as PlanetName}
              size={12}
              className="asp-planet"
            />
            <AspectGlyph type={a.type} color={a.color} />
            <PlanetTipGlyph
              planet={a.b as PlanetName}
              size={12}
              className="asp-planet"
            />
            <span className="asp-type">
              {a.type}
              {typeExtra}
            </span>
            <span className="asp-orb">
              {fmtOrb(a.orb)}
              {orbExtra}
            </span>
          </>
        );

        const lostBadge = (
          <TipGlyph
            className="es-ls-lost"
            title={
              <span className="es-tip-title">
                <span style={{ color: 'var(--danger)' }}>⊘</span>{' '}
                {t('expandedSidebar.localSpace.lost')}
              </span>
            }
            hint={t('expandedSidebar.localSpace.lostHint')}
          >
            ⊘
          </TipGlyph>
        );
        const newBadge = (glyph: string, className: string) => (
          <TipGlyph
            className={className}
            title={
              <span className="es-tip-title">
                {t('expandedSidebar.localSpace.only')}
              </span>
            }
            hint={t('expandedSidebar.localSpace.onlyHint')}
          >
            {glyph}
          </TipGlyph>
        );

        const split = azByKey != null && splitFrames;

        let count: number;
        let body: ReactNode;
        if (split) {
          // One row per PAIR: fold each pair's two frames onto one line. The
          // statuses read off presence + type equality; the Δ column is the
          // signed orb change (negative = closer to exact in local space).
          const pairKey = (a: Aspect) => [a.a, a.b].sort().join('|');
          const natPairs = new Map(lonAll.map((a) => [pairKey(a), a] as const));
          const azPairs = new Map(
            azAspects!.map((a) => [pairKey(a), a] as const),
          );
          type FrameRow = {
            nat: Aspect | null;
            ls: Aspect | null;
            delta: number | null;
            status: FrameStatus;
          };
          const rows: FrameRow[] = [];
          for (const [key, nat] of natPairs) {
            const ls = azPairs.get(key) ?? null;
            rows.push({
              nat,
              ls,
              delta: ls ? ls.orb - nat.orb : null,
              status: !ls ? 'lost' : ls.type === nat.type ? 'retained' : 'changed',
            });
          }
          for (const [key, ls] of azPairs) {
            if (!natPairs.has(key)) {
              rows.push({ nat: null, ls, delta: null, status: 'new' });
            }
          }
          count = rows.length;
          const counts: Record<FrameStatus, number> = {
            retained: 0,
            changed: 0,
            lost: 0,
            new: 0,
          };
          for (const r of rows) counts[r.status] += 1;
          const shownRows = rows.filter(
            (r) =>
              frameStatuses.has(r.status) &&
              ((r.nat != null && vis(r.nat)) || (r.ls != null && vis(r.ls))),
          );
          const statusRank: Record<FrameStatus, number> = {
            retained: 0,
            changed: 1,
            lost: 2,
            new: 3,
          };
          const sortVal = (r: FrameRow): number => {
            switch (frameSort.key) {
              case 'pair': {
                const x = (r.nat ?? r.ls)!;
                return (
                  planetRank(x.a as PlanetName) * 100 +
                  planetRank(x.b as PlanetName)
                );
              }
              case 'natal':
                return r.nat?.orb ?? Infinity;
              case 'ls':
                return r.ls?.orb ?? Infinity;
              case 'delta':
                return r.delta ?? Infinity;
              case 'status':
                return statusRank[r.status];
            }
          };
          const tightest = (r: FrameRow) =>
            Math.min(r.nat?.orb ?? Infinity, r.ls?.orb ?? Infinity);
          shownRows.sort(
            (x, y) =>
              frameSort.dir * (sortVal(x) - sortVal(y)) ||
              tightest(x) - tightest(y),
          );

          const statusName = (s: FrameStatus) =>
            t(
              `expandedSidebar.localSpace.status.${s}` as 'expandedSidebar.localSpace.status.retained',
            );
          const statusHint = (s: FrameStatus) =>
            t(
              `expandedSidebar.localSpace.statusHint.${s}` as 'expandedSidebar.localSpace.statusHint.retained',
            );
          const header = (key: FrameSortKey, label: string, hint: string) => (
            <th
              aria-sort={
                frameSort.key === key
                  ? frameSort.dir === 1
                    ? 'ascending'
                    : 'descending'
                  : undefined
              }
            >
              <TipButton
                type="button"
                className={`es-ft-sort${frameSort.key === key ? ' on' : ''}`}
                placement="bottom"
                tip={label}
                hint={hint}
                onClick={() =>
                  setFrameSort((s) =>
                    s.key === key
                      ? { key, dir: s.dir === 1 ? -1 : 1 }
                      : { key, dir: 1 },
                  )
                }
              >
                {label}
                {frameSort.key === key && (
                  <span className="es-ft-arrow">
                    {frameSort.dir === 1 ? '▴' : '▾'}
                  </span>
                )}
              </TipButton>
            </th>
          );
          const aspCell = (a: Aspect | null) =>
            a ? (
              <>
                <AspectGlyph type={a.type} color={a.color} />
                <span className="es-ft-type">{a.type}</span>
                <span className="es-ft-orb">{fmtOrb(a.orb)}</span>
              </>
            ) : (
              <span className="es-ft-none">—</span>
            );
          body = (
            <>
              <div className="es-status-pills">
                {FRAME_STATUSES.map((s) => (
                  <TipButton
                    key={s}
                    type="button"
                    className={`es-status-pill es-st-${s}${frameStatuses.has(s) ? ' on' : ''}`}
                    aria-pressed={frameStatuses.has(s)}
                    placement="bottom"
                    tip={statusName(s)}
                    hint={statusHint(s)}
                    onClick={() =>
                      setFrameStatuses((prev) => {
                        const next = new Set(prev);
                        if (next.has(s)) next.delete(s);
                        else next.add(s);
                        return next;
                      })
                    }
                  >
                    {statusName(s)}
                    <span className="es-status-count">{counts[s]}</span>
                  </TipButton>
                ))}
              </div>
              <table className="es-frames-table">
                <thead>
                  <tr>
                    {header(
                      'pair',
                      t('expandedSidebar.localSpace.pairCol'),
                      t('expandedSidebar.localSpace.pairColHint'),
                    )}
                    {header(
                      'natal',
                      t('expandedSidebar.localSpace.natalCol'),
                      t('expandedSidebar.localSpace.natalColHint'),
                    )}
                    {header(
                      'ls',
                      t(
                        localSpaceRelocated
                          ? 'expandedSidebar.localSpace.lsColReloc'
                          : 'expandedSidebar.localSpace.lsColNatal',
                      ),
                      t('expandedSidebar.localSpace.lsColHint'),
                    )}
                    {header(
                      'delta',
                      t('expandedSidebar.localSpace.deltaCol'),
                      t('expandedSidebar.localSpace.deltaColHint'),
                    )}
                    {header(
                      'status',
                      t('expandedSidebar.localSpace.statusCol'),
                      t('expandedSidebar.localSpace.statusColHint'),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((r, i) => {
                    const x = (r.nat ?? r.ls)!;
                    return (
                      <tr key={i}>
                        <td>
                          <span className="es-ft-pair">
                            <PlanetTipGlyph
                              planet={x.a as PlanetName}
                              size={12}
                              className="asp-planet"
                            />
                            <PlanetTipGlyph
                              planet={x.b as PlanetName}
                              size={12}
                              className="asp-planet"
                            />
                          </span>
                        </td>
                        <td>{aspCell(r.nat)}</td>
                        <td>{aspCell(r.ls)}</td>
                        <td className="es-ft-num">
                          {r.delta == null || Math.abs(r.delta) < 1 / 60 ? (
                            <span className="es-ft-none">—</span>
                          ) : (
                            <span
                              className={
                                r.delta < 0 ? 'es-orb-tighter' : 'es-orb-wider'
                              }
                            >
                              {r.delta < 0 ? '−' : '+'}
                              {fmtOrb(Math.abs(r.delta))}
                            </span>
                          )}
                        </td>
                        <td>
                          <TipGlyph
                            className={`es-st-${r.status}`}
                            title={
                              <span className="es-tip-title">
                                {statusName(r.status)}
                              </span>
                            }
                            hint={statusHint(r.status)}
                          >
                            {statusName(r.status)}
                          </TipGlyph>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          );
        } else {
          type Row = Aspect & { ls: 'both' | 'lost' | 'only' | null };
          const rows: Row[] = [
            ...lonAspects.map(
              (a): Row => ({
                ...a,
                ls: azByKey ? (azByKey.has(k(a)) ? 'both' : 'lost') : null,
              }),
            ),
            ...decAspects.map((a): Row => ({ ...a, ls: null })),
            ...azOnly.map((a): Row => ({ ...a, ls: 'only' })),
          ]
            // One metric across frames: zodiacal and azimuth orbs interleave.
            .sort(byOrb);
          count = rows.length;
          body = (
            <ul className="es-aspect-list">
              {rows.map((a, i) => {
                const rowCls = `asp asp-${a.category}${
                  a.ls === 'lost' ? ' asp-ls-lost' : ''
                }${a.ls === 'both' ? ' asp-ls-both' : ''}`;
                // Frame badges ride in the type cell, right after the aspect
                // name, so they read at a glance; a kept row's orb carries the
                // orb-shift marker against its horizon counterpart.
                const rowCells = cells(
                  a,
                  a.ls === 'lost'
                    ? lostBadge
                    : a.ls === 'only'
                      ? newBadge('LS', 'es-ls-tag')
                      : undefined,
                  a.ls === 'both'
                    ? orbShift(a, azByKey!.get(k(a))!)
                    : undefined,
                );
                // A both-frames row has no badge — its capsule styling is the
                // whole cue — so the row itself explains it on hover.
                return a.ls === 'both' ? (
                  <TipRow
                    key={i}
                    className={rowCls}
                    title={
                      <span className="es-tip-title">
                        {t('expandedSidebar.localSpace.both')}
                      </span>
                    }
                    hint={t('expandedSidebar.localSpace.bothHint')}
                  >
                    {rowCells}
                  </TipRow>
                ) : (
                  <li key={i} className={rowCls}>
                    {rowCells}
                  </li>
                );
              })}
            </ul>
          );
        }

        return (
          <section className="es-section es-section-aspects">
            <div className="es-aspect-head">
              <TipHeading
                tip={t('expandedSidebar.aspectsTip')}
                hint={t('expandedSidebar.aspectsHint')}
              >
                {t('expandedSidebar.aspectsCount', { count })}
              </TipHeading>
              {azByKey && (
                <TipButton
                  type="button"
                  className={`es-advanced-toggle es-frames-toggle ${splitFrames ? 'on' : 'off'}`}
                  onClick={() => setSplitFrames(!splitFrames)}
                  role="switch"
                  aria-checked={splitFrames}
                  placement="bottom"
                  gated
                  tip={t('expandedSidebar.localSpace.compareTip')}
                  hint={t('expandedSidebar.localSpace.compareHint')}
                >
                  <span className="es-toggle-label">
                    {t('expandedSidebar.localSpace.compare')}
                  </span>
                  <span className="es-toggle-track">
                    <span className="es-toggle-thumb" />
                  </span>
                </TipButton>
              )}
            </div>
            {body}
          </section>
        );
      })()}

      {angles && advanced && shownOverlay && shownOverlay.length > 0 && (() => {
        // Overlay-first ordering: the overlay body is the subject of the aspect
        // (e.g. "transiting Mars conjunct natal Sun"), so it's listed first and
        // the natal body second.
        const cross = computeCrossAspects(shownOverlay, shownPlanets, aspectOrbs)
          .filter((a) => visibleAspects.has(a.category))
          .sort((a, b) => a.orb - b.orb);
        if (cross.length === 0) return null;
        return (
          <section className="es-section es-section-aspects es-section-cross">
            <TipHeading
              tip={t('expandedSidebar.overlayAspectsTip')}
              hint={t('expandedSidebar.overlayAspectsHint')}
            >
              {t('expandedSidebar.overlayAspectsCount', { count: cross.length })}
            </TipHeading>
            <ul className="es-aspect-list">
              {cross.map((a, i) => (
                <li key={i} className={`asp asp-${a.category}`}>
                  <PlanetTipGlyph
                    planet={a.a as PlanetName}
                    size={12}
                    className="asp-planet asp-planet-overlay"
                    suffix={t('expandedSidebar.overlaySuffix')}
                  />
                  <AspectGlyph type={a.type} color={a.color} />
                  <PlanetTipGlyph
                    planet={a.b as PlanetName}
                    size={12}
                    className="asp-planet"
                  />
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
        onPointerDown={beginDrag}
        onMouseEnter={showResizeTip}
        onMouseLeave={hideResizeTip}
        role="separator"
        aria-orientation="vertical"
      >
        <div className="es-drag-grip" />
      </div>
      <HoverTip pos={resizeTipPos} placement="right" title={t('expandedSidebar.resize')} />
    </aside>
  );
}
