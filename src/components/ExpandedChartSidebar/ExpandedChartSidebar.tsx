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
  POINTS,
  birthDataToJD,
  obliquity,
  type AngleCoords,
  type EclipticPosition,
  type HorizontalCoords,
  type HouseSystem,
  type LineSystem,
  type PlanetName,
  type RelocatedAngles,
} from '../../lib/ephemeris';
import { displayName, type StoredChart } from '../../lib/chartLibrary';
import { timeUnknown } from '../../lib/birthData';
import { skyHeldFor } from '../../lib/skyHold';
import { isPhone, isTouchLayout, usePhone } from '../../lib/touch';
import type { LineType } from '../../lib/astro/lines';
import { ASPECT_GLYPHS } from '../../lib/astro/glyphChars';
import { fmtLat, fmtLng } from '../../lib/coordFormat';
import { formatUtcOffset } from '../../lib/atlas/timezone';
import { MASK_DATE, MASK_TIME, useIdentity } from '../../lib/discreet';
import { planTierFor, tierName } from '../../lib/plan';
import { getProfileSection } from '../../lib/extensions/profileSection';
import { ChartSwitcher, type ChartQuickFlash } from '../ChartSwitcher/ChartSwitcher';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import { ZodiacGlyph } from '../ZodiacGlyph/ZodiacGlyph';
import { ZodiacRange } from '../ZodiacGlyph/ZodiacRange';
import { MinorMark } from '../MinorMark/MinorMark';
import type { WheelMinorBody } from '../../lib/minorBodies/wheel';
import {
  ARIES_FRAME,
  WheelSvg,
  computeAspects,
  computeAzimuthAspects,
  computeCrossAspects,
  planetMeaning,
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
import { SkyHeldNote } from '../SkyHeldNote/SkyHeldNote';
import { renderLocalSpaceGatedSlot } from '../../lib/extensions/localSpaceSlot';
import type { AspectOrbs } from '../../lib/aspectPrefs';
import {
  essentialDignity,
  signElement,
  signIndex,
  signModality,
  type DignityResult,
  type RulershipScheme,
} from '../../lib/astro/dignities';
import { ELEMENT_GLYPHS, MODALITY_GLYPHS } from '../../lib/astro/glyphChars';
import {
  ANGLE_LABEL,
  lonToZodiac,
  planetRank,
  truncZodiac,
  visibleAngleSpecs,
  type AngleCode,
} from '../../lib/astro/format';
import {
  getLeftDockMax,
  publishLeftDock,
  retireLeftDock,
  useLeftDockMax,
} from '../../lib/leftDock';
import { HintMenu } from '../Sidebar/Sidebar';
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
//
// `trunc` is a geodetic frame's angle: a place's degree is quoted truncated and its
// sign is the place's zone, so it reads through format.ts truncZodiac — the same rule
// the capture list and the wheel use for it — and never rounds into the next sign.
// (2026-10-02)
function Longitude({
  lon,
  advanced,
  trunc = false,
}: {
  lon: number;
  advanced: boolean;
  trunc?: boolean;
}) {
  const { labels } = useT();
  // Compact form (minute precision) is shared with the Capture extras panel via
  // lonToZodiac, so the two readouts can't disagree at this column's width cutoff.
  const compact = lonToZodiac(lon);
  let signIdx = compact.signIdx;
  let dms = compact.degMin;
  if (trunc) {
    const z = truncZodiac(lon, advanced ? 'sec' : 'min');
    signIdx = z.signIdx;
    dms = z.text;
  } else if (advanced) {
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
// `trunc` as for Longitude above: a geodetic angle truncates. (2026-10-02)
function SignLon({ lon, trunc = false }: { lon: number; trunc?: boolean }) {
  const lonDeg = ((lon * 180) / Math.PI + 360) % 360;
  let signIdx = Math.floor(lonDeg / 30);
  const inSign = lonDeg % 30;
  let d = Math.floor(inSign);
  let m = Math.round((inSign - d) * 60);
  if (m === 60) { m = 0; d += 1; }
  if (d === 30) { d = 0; signIdx = (signIdx + 1) % 12; }
  if (trunc) {
    const z = truncZodiac(lon, 'min');
    signIdx = z.signIdx;
    d = z.deg;
    m = z.min;
  }
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
  /** The map's EFFECTIVE line system. Whether a frame is geodetic is read off the
   *  frame itself (`angles.geodetic`); this is for what the panel says about the map
   *  around it. (2026-10-02) */
  lineSystem?: LineSystem;
  /** The house system the frame's cusps were computed in — the EFFECTIVE one (Placidus
   *  whenever Advanced is off), so the geodetic header's "houses:" line names what the
   *  wheel draws, not a setting it is not reading. Read only by that line, which is
   *  left out without it. (2026-10-02) */
  houseSystem?: HouseSystem;
  /** A line per natal body saying where its figure comes from — today only the Part of
   *  Fortune on a geodetic map, "From the geodetic Ascendant". The natal wheels print
   *  it in the body's tip (WheelSvg bodyNotes), and the positions list tags the row GE
   *  with it as the tag's tip. (2026-10-02) */
  bodyNotes?: ReadonlyMap<PlanetName, string> | null;
  /** Natal bodies known only to a span, with its half-width in degrees — a chart with no
   *  birth time (lib/astro/timeless): the Moon, and on a geodetic map the Part of Fortune.
   *  The natal wheels draw the span (WheelSvg ranges), and the positions list and table
   *  print it (2°♉–18°♉) where they would print the degree to the minute. (2026-10-02) */
  ranges?: ReadonlyMap<PlanetName, number> | null;
  planets: EclipticPosition[];
  /** The natal chart's catalog minor bodies (lib/minorBodies/wheel): placed on the
   *  natal wheel, and listed in the positions table after the built-in bodies in the
   *  reader's own list order. Never on the overlay's wheel, and never in an aspect
   *  list, the balance or the local-space dials — placed, not aspected or counted.
   *  Empty (or absent) whenever the wheel is not the natal chart. */
  minorBodies?: readonly WheelMinorBody[];
  /** Hold the natal wheel's catalog ring while their files load (see WheelSvg) — no
   *  effect while the ring is switched off (MINOR_RING_ENABLED). */
  minorReserve?: boolean;
  /** Azimuth + altitude for the table's catalog rows, by MPC number — the same observer
   *  and instant as `advancedCoords`. */
  minorCoords?: ReadonlyMap<number, { az: number; alt: number }> | null;
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
  /** The synastry partner's own record while their wheel rides beside the chart
   *  (null otherwise, and null while the overlay is promoted). The Dual layout's
   *  second header introduces the partner from it the way the panel header
   *  introduces the active chart: birth date and time, and THEIR birthplace — then,
   *  apart, the place their wheel is actually cast for, which is the active
   *  point's, not theirs. Before this the second header borrowed the panel header's
   *  place lines and, laid out and coloured as a birth record, read as the
   *  partner's birthplace (2026-09-30). */
  overlayPartner?: StoredChart | null;
  /** Set when the transit moment IS one of the chart's returns ('solar' | 'lunar').
   *  A return chart is transits cast for one instant — same overlay, same maths —
   *  but it is a named chart in its own right, so the wheel calls it one. */
  overlayReturn?: 'solar' | 'lunar' | null;
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
   *  list rows stay away, and a note in the wheel corner says why. On a geodetic map
   *  `angles` is the place's frame, which needs no birth minute, so only the note is
   *  left to say it (timeUnknownShown). (2026-10-02) */
  planetsOnly?: boolean;
  /** Planets toggled on in the Map Filter; hidden ones are dropped everywhere. */
  visiblePlanets: Set<PlanetName>;
  /** Line-type toggles from the Map Filter; gate which angles show in the wheel + list. */
  visibleLineTypes: Set<LineType>;
  /** Per-body RA + azimuth/altitude for the Advanced table, keyed by planet. */
  advancedCoords: Map<PlanetName, HorizontalCoords>;
  /** RA + declination + azimuth/altitude for the angles (ecliptic points). */
  angleCoords: Record<'asc' | 'mc' | 'dsc' | 'ic' | 'vertex' | 'antivertex', AngleCoords> | null;
  /** The same two, for the OVERLAY's bodies and angles at the overlay's own moment
   *  — what the overlay's own positions table is printed from. Null when nothing
   *  rides alongside the chart, and null while the overlay is PROMOTED (the pair
   *  above is already reporting it, so a second table would repeat itself). */
  overlayAdvancedCoords?: Map<PlanetName, HorizontalCoords> | null;
  overlayAngleCoords?: Record<
    'asc' | 'mc' | 'dsc' | 'ic' | 'vertex' | 'antivertex',
    AngleCoords
  > | null;
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
   *  shows. Mutually exclusive with the coord props being populated. Still set while
   *  the view is held on a geodetic map (`localSpaceHeld`, which outranks it in the
   *  slot), so a control the tier withholds is not shown held either. (2026-10-05) */
  localSpaceGated?: boolean;
  /** The Local Space view is on but HELD on a geodetic map (lib/skyHold): the coord props
   *  above arrive null, and the slot the dials would take shows the hold's reason with its
   *  fix (`onOpenCalc`) instead. Absent reads as not held. (2026-10-02) */
  localSpaceHeld?: boolean;
  /** The held reason's fix: open Settings ▸ Calculation, where the line system is. */
  onOpenCalc?: () => void;
  /** Per-aspect orb limits (Advanced ▸ Aspect orbs) for the grid + wheel lines. */
  aspectOrbs: AspectOrbs;
  /** Which rulership table the essential-dignity list reads (Settings ▸ Calculation
   *  ▸ Rulerships). Under 'modern' the three signs with a ruler from each era label
   *  their rows with the era — see the list below. */
  rulershipScheme: RulershipScheme;
  /** The Advanced reading mode (degree rim, aspect grid, coordinate tables). The
   *  NEW/ADV cue below the Hide button toggles it (the profile plan tag does too). */
  advanced: boolean;
  setAdvanced: (v: boolean) => void;
  /** Overlay wheel layout (the Dual toggle in this header): true splits the
   *  bi-wheel into two full stacked wheels whenever an overlay ring exists. */
  dualWheels: boolean;
  setDualWheels: (v: boolean) => void;
  /** Which aspect categories the wheel draws and the aspect list keeps, toggled by the
   *  pills in this panel. Held by the caller (and persisted there) because other
   *  surfaces draw the same wheel and must not read a second, drifting copy. */
  visibleAspects: Set<AspectCategory>;
  setVisibleAspects: (v: Set<AspectCategory>) => void;
  onClose: () => void;
  /** Fired while the panel is being drag-resized, so the map can pause hover. */
  onResizingChange?: (resizing: boolean) => void;
  onSelectChart: (id: string) => void;
  onNewChart: () => void;
  onEditChart: (id: string) => void;
  onDeleteChart: (id: string) => void;
  /** Tab quick-swap feedback for the panel's switcher (null when idle). */
  chartFlash?: ChartQuickFlash | null;
}

/** No catalog minor bodies — one stable reference for the prop's default. */
const NO_MINOR: readonly WheelMinorBody[] = [];

const WIDTH_KEY = 'astro:expanded-sidebar-width:v1';
const FRAMES_KEY = 'astro:aspect-frames:v1';
const LS_MODE_KEY = 'astro:ls-wheel-3d:v1'; // local-space dials: '3d' globe vs 2D compass

// The Compare view's OWN orb, in degrees. Written on mount, so this key can
// never have its default changed in place — the old value is already in every
// existing install's storage. A different default needs a :v2 and a note here
// saying why the old figures are abandoned rather than migrated.
const COMPARE_ORB_KEY = 'astro:compare-orb:v1';
// Wider than the app's 7° table on purpose. The table exists to show what the
// horizon frame DOES to a pair, and the interesting case is the one that moves
// a long way: a trine 9° wide at birth that closes to 2° here. Computed at the
// app's own orb, that pair is simply absent from the natal column and reads
// "new" — the finding disappears into a status that means the opposite. The
// figure stays the reader's: this is a default, not a fixed rule.
const COMPARE_ORB_DEFAULT = 10;
const COMPARE_ORBS = [5, 7, 8, 10, 12, 15] as const;

// Frame-table vocabulary (the aspects section's Separate view): every pair's
// fate across the natal → local-space frames, plus the sortable columns.
const FRAME_STATUSES = ['retained', 'changed', 'lost', 'new'] as const;
type FrameStatus = (typeof FRAME_STATUSES)[number];
type FrameSortKey = 'pair' | 'natal' | 'ls' | 'delta' | 'status';

// Every other sortable list in the panel. `null` is a real state — the list's
// own natural order, which for the positions table is the astrological one
// (luminaries first, angles after) and for the aspect lists is tightest-orb
// first. Session-only throughout, like the frame table's: a sort is a way of
// looking at one chart, not a standing preference.
type SortState<K extends string> = { key: K; dir: 1 | -1 } | null;
type PosSortKey = 'point' | 'lon' | 'speed' | 'lat' | 'ra' | 'dec' | 'az' | 'alt';
type AspectSortKey = 'pair' | 'type' | 'orb';
// Canonical aspect order for the type column — the order the app lists them in
// everywhere else (by exact angle, then the declination pair, which has no
// angle). Anything unrecognised sorts last rather than throwing the row away.
const ASPECT_TYPE_RANK: Record<string, number> = {
  conjunction: 0,
  opposition: 1,
  trine: 2,
  square: 3,
  sextile: 4,
  parallel: 5,
  contraparallel: 6,
};
const aspectTypeRank = (type: string): number => ASPECT_TYPE_RANK[type] ?? 99;
const DEFAULT_WIDTH = 720;
const MIN_WIDTH = 480;
// THREE floors, because "touch" is two different amounts of screen and one figure could
// only ever suit one of them.
//
// A phone gets the lowest: the panel has to tuck into a slice of a short landscape screen
// and leave some map, and 380 is most of an iPhone SE’s 667pt as it is. A TABLET has room
// and reads badly down there — the floor was written for the phone case ("usually a
// narrower landscape phone", it said) and tablets inherited it for no better reason than
// sharing a pointer type. Raised ~15%, which is where the panel stops feeling cramped on an
// iPad without eating the map: 440 still leaves 304px of it on the narrowest tablet
// viewport in portrait (744pt, capped at 70%).
//
// isPhone() is small-in-EITHER-orientation, so it catches a landscape phone — the case this
// floor exists for — and no tablet in either. See lib/touch.
const MIN_WIDTH_PHONE = 380;
const MIN_WIDTH_TABLET = 440;
const minSidebarWidth = (): number => {
  const floor = isTouchLayout() ? (isPhone() ? MIN_WIDTH_PHONE : MIN_WIDTH_TABLET) : MIN_WIDTH;
  // A floor above the CAP is incoherent, and quietly so: it pins the panel wider than the
  // cap allows and freezes the handle, because the drag clamps to [floor, cap] and the two
  // have crossed. Raising the tablet floor put a real device in reach of that — a small
  // portrait tablet at 601pt caps at 421 — so the cap wins. (Desktop could already reach it
  // on a window under 686px wide, where the panel took 75% of it with a dead handle. Same
  // line fixes both; there was never a reason for the floor to outrank the cap.)
  return Math.min(floor, maxSidebarWidth());
};
// The drag handle won't take the panel past ~70% of the viewport (leaving the map
// usable), and never beyond 1200px — the chart wheel has stopped growing by then,
// so extra width just wastes space.
function maxSidebarWidth(): number {
  return Math.min(window.innerWidth * 0.7, 1200);
}
/** The width the panel is DRAWN at: the reader's, inside [floor, cap], where the cap is also
 *  `navMax` — the window less the column the top nav needs to stay on ONE row beside the panel
 *  (lib/leftDock `useLeftDockMax`, measured and published by TopNav). Measured: at its 70% the
 *  panel left the nav's one-row form too little column on a 1100 or 1024 window, and the menus
 *  wrapped under the toggle. Unlike the 70% cap, this one does NOT outrank the floor: on a
 *  window too narrow for both the panel keeps its floor and the nav wraps to its two-row form —
 *  a panel squeezed under its floor loses its own labels, while the two-row nav is a designed
 *  state with every control whole (TopNav.css). There the range is the floor alone and the
 *  handle holds still, as it already did wherever the 70% cap had crossed the floor — on a
 *  portrait tablet now, and a desktop window under ~883 px.
 *
 *  Whole pixels: the 70% cap is fractional (1440 × 0.7 = 1007.9999999999999), and a drag that
 *  ended on it stored that string. */
function sidebarWidthFor(pref: number, navMax: number): number {
  return Math.round(Math.max(minSidebarWidth(), Math.min(pref, maxSidebarWidth(), navMax)));
}
/** How far the pointer travels from the press before the edge follows it (useMovableHud's
 *  figure, for its reason: a press jitters, and must not be saved as a width). */
const DRAG_SLOP = 3;

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
// "(overlay)" — and the body's one-line keyword gloss beneath.
//
// The gloss used to be the WHEEL's hover, where it competed with the thing a wheel
// is actually consulted for (where the body sits), and repeated itself in every
// chart. Down here it is doing the job it is good at: these rows name a body and
// nothing else, so someone reading "Chiron ☍ Saturn" in the aspect list has
// somewhere to ask what Chiron is. One tip, every surface below the wheel — the
// positions table, both aspect lists, the frame table.
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
  const { t, labels } = useT();
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
      hint={planetMeaning(t, planet)}
    >
      <PlanetGlyph planet={planet} size={size} />
    </TipGlyph>
  );
}

// A catalog minor planet's mark below the wheel (the positions list or table) that
// names itself on hover. The name matters more here than a planet's does: most catalog
// bodies share one diamond, told apart only by colour, and a compact panel hides the
// name column beside it. The gloss under the name says why the body has a row here and
// none in the aspect lists or the balance — and, for a hypothetical point (the hollow
// diamond), what one is, since "a minor planet" would be false of it.
function MinorTipGlyph({ m }: { m: WheelMinorBody }) {
  const { t } = useT();
  return (
    <TipGlyph
      className="es-glyph"
      title={
        <span className="es-tip-title">
          <MinorMark color={m.color} glyph={m.glyph} hollow={m.hypothetical} size={14} />
          {m.label}
        </span>
      }
      hint={t(m.hypothetical ? 'expandedSidebar.minorHintHyp' : 'expandedSidebar.minorHint')}
    >
      <MinorMark color={m.color} glyph={m.glyph} hollow={m.hypothetical} size={13} />
    </TipGlyph>
  );
}

// An angle's code below the wheel (the positions list or table) that explains
// itself on hover: the code and its full name, with a one-line gloss of what the
// angle MEANS underneath.
//
// That gloss used to be the wheel's own hover for the angle marks, which now give
// the position instead — the same move the bodies made, for the same reason. What
// the Midheaven signifies does not change from chart to chart; where it falls
// does, and the wheel is where a particular chart is read.
function AngleTipGlyph({
  code,
  name,
  color,
}: {
  code: AngleCode;
  name: string;
  color: string;
}) {
  const { t } = useT();
  // The code keys the catalog; the reader sees its label (AS, MC, DS, IC). (2026-10-02)
  const label = ANGLE_LABEL[code];
  return (
    <TipGlyph
      className="es-glyph es-angle-code"
      color={color}
      title={
        <span className="es-tip-title">
          <span className="es-angle-code" style={{ color }}>
            {label}
          </span>
          {name}
        </span>
      }
      hint={t(`wheel.angles.${code}.sub` as 'wheel.angles.As.sub')}
    >
      {label}
    </TipGlyph>
  );
}

// The "this column sorts" cue, worn by both tables' headers (see .es-sort-cue).
// Both carets at once — either direction is available from here — against the
// single ▴/▾ the ACTIVE column shows, which means "sorted this way". Rendered
// always and revealed by CSS on hover/focus (and kept up at rest where there is
// no hover to reveal it), so nothing about the resting desktop table changes.
//
// It exists because a header that takes its cell's own type is what makes the
// table read like a table, and is also what makes the sort gesture invisible
// until someone happens to press one. aria-hidden: the header's aria-sort carries
// the state, and the button being a button carries the affordance.
function SortCue() {
  return (
    <span className="es-sort-cue" aria-hidden="true">
      <span>▴</span>
      <span>▾</span>
    </span>
  );
}

// The clickable label inside a sortable column header, shared by every table and
// list in the panel that sorts. Same three-state gesture throughout: a new column
// opens ascending, a second press on the active one flips it, a third hands the
// list back to its natural order (which for the positions table is the
// astrological one, and is not otherwise recoverable).
function SortLabel<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  className?: string;
}) {
  const on = sort?.key === sortKey;
  return (
    <button
      type="button"
      className={`es-ft-sort${className ? ` ${className}` : ''}${on ? ' on' : ''}`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      {on && <span className="es-ft-arrow">{sort.dir === 1 ? '▴' : '▾'}</span>}
      <SortCue />
    </button>
  );
}

/** `aria-sort` for a header, or undefined when the column isn't the active one. */
const ariaSort = <K extends string>(
  sort: SortState<K>,
  key: K,
): 'ascending' | 'descending' | undefined =>
  sort?.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined;

/** The three-state cycle behind every SortLabel: → ascending → descending → off. */
function nextSort<K extends string>(sort: SortState<K>, key: K): SortState<K> {
  if (sort?.key !== key) return { key, dir: 1 };
  return sort.dir === 1 ? { key, dir: -1 } : null;
}

// The sort control for a list that cannot carry column headers. The aspect lists
// lay their rows out TWO-up — .es-aspect-list is a pair of columns OF ROWS, each
// row its own little grid — so there is no single set of columns for a header row
// to sit above. A strip of chips above the list does the same job in one line.
function SortStrip<K extends string>({
  label,
  options,
  sort,
  onSort,
}: {
  label: string;
  options: { key: K; label: string; hint: string }[];
  sort: SortState<K>;
  onSort: (key: K) => void;
}) {
  return (
    <div className="es-sort-strip">
      <span className="es-sort-strip-label">{label}</span>
      {options.map((o) => {
        const on = sort?.key === o.key;
        return (
          <TipButton
            key={o.key}
            type="button"
            className={`es-ft-sort es-sort-chip${on ? ' on' : ''}`}
            placement="bottom"
            tip={o.label}
            hint={o.hint}
            aria-pressed={on}
            onClick={() => onSort(o.key)}
          >
            {o.label}
            {on && <span className="es-ft-arrow">{sort.dir === 1 ? '▴' : '▾'}</span>}
          </TipButton>
        );
      })}
    </div>
  );
}

/** One aspect row's value on a sort column. Shared by both aspect lists — they
 *  differ in what a row MEANS (natal pair vs overlay-to-natal contact), not in
 *  how it sorts. */
function aspectSortVal(a: Aspect, key: AspectSortKey): number {
  switch (key) {
    case 'pair':
      return planetRank(a.a as PlanetName) * 100 + planetRank(a.b as PlanetName);
    case 'type':
      return aspectTypeRank(a.type);
    case 'orb':
      return a.orb;
  }
}

/** Sort a list of aspect rows in place-safe fashion; `null` keeps the caller's
 *  own order (tightest orb first in both lists today). Ties break on orb, so a
 *  pair- or type-sorted list still reads tightest-first inside each group. */
function sortAspects<T extends Aspect>(rows: T[], sort: SortState<AspectSortKey>): T[] {
  if (!sort) return rows;
  return [...rows].sort(
    (x, y) =>
      sort.dir * (aspectSortVal(x, sort.key) - aspectSortVal(y, sort.key)) ||
      x.orb - y.orb,
  );
}

// A coordinate-column header that explains itself as the shared .ui-tip on hover —
// the abbreviations (Rt.Asc., Decl., Azi…) aren't obvious to a newcomer, so the
// tip's title spells out the full word (`title`), defaulting to the column label.
// The label is also the sort control: the tip stays on the CELL so hovering
// anywhere in the header still explains the column, while the click target is the
// label itself.
//
// Which is exactly why the tip is hold-to-reveal (the shared default) and NOT
// tapReveal. tapReveal is for INERT triggers — it swallows the release-click by
// design, so on a touch screen it turned every tap on a header into "explain this
// column" and the table could not be sorted by finger at all. A header holds an
// action, so it takes the same bargain every other button in the app takes: a tap
// acts, a hold explains.
//
// `held` is the reason a column has nothing to show (the sky hold: azimuth and altitude
// on a geodetic map). The header stays, dimmed, with the reason as its tip in place of
// the explanation and the grey N/A badge; its label stops being a sort control, since
// every cell under it is an em-dash and sorting by it would only seem to do something.
// (2026-10-02)
function AdvHeader({
  label,
  title,
  hint,
  sortKey,
  sort,
  onSort,
  cellClass = 'es-adv-num',
  held,
}: {
  label: string;
  title?: string;
  hint: string;
  sortKey: PosSortKey;
  sort: SortState<PosSortKey>;
  onSort: (key: PosSortKey) => void;
  cellClass?: string;
  held?: string;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLTableCellElement>('right');
  return (
    <th
      ref={ref}
      className={held ? `${cellClass} is-held` : cellClass}
      aria-sort={held ? undefined : ariaSort(sort, sortKey)}
      aria-disabled={held ? true : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {held ? (
        <span className="es-adv-sort">{label}</span>
      ) : (
        <SortLabel
          label={label}
          sortKey={sortKey}
          sort={sort}
          onSort={onSort}
          className="es-adv-sort"
        />
      )}
      <HoverTip
        pos={pos}
        placement="right"
        title={title ?? label}
        hint={held ?? hint}
        unavailable={!!held}
      />
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
  const { t, labels } = useT();
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
            hint={planetMeaning(t, p.name)}
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
  lineSystem = 'celestial',
  houseSystem,
  bodyNotes = null,
  ranges = null,
  planets,
  minorBodies = NO_MINOR,
  minorReserve = false,
  minorCoords = null,
  overlayPlanets,
  overlayAngles,
  overlayLabel,
  overlayMoment,
  overlayKind,
  overlayPartner = null,
  overlayReturn,
  promotedLabel,
  noChart = false,
  planetsOnly = false,
  visiblePlanets,
  visibleLineTypes,
  advancedCoords,
  angleCoords,
  overlayAdvancedCoords,
  overlayAngleCoords,
  localSpaceCoords,
  natalLocalSpaceCoords,
  relocatedLocalSpaceCoords,
  localSpaceGated = false,
  localSpaceHeld = false,
  onOpenCalc,
  localSpaceRelocated,
  aspectOrbs,
  rulershipScheme,
  advanced,
  setAdvanced,
  dualWheels,
  setDualWheels,
  visibleAspects,
  setVisibleAspects,
  onClose,
  onResizingChange,
  onSelectChart,
  onNewChart,
  onEditChart,
  onDeleteChart,
  chartFlash = null,
}: ExpandedChartSidebarProps) {
  const { t, fmt, labels } = useT();
  // Discreet mode's masks — this header carries the chart's birth moment and, in
  // the plain natal state, its birthplace, which is the whole of what the mode
  // exists to blank. The wheel and every position below it stay as they are.
  const id = useIdentity();
  // The reader's width and the drawn width are two values (CLAUDE.md rule 2): both caps are
  // standing states — the window's size and the column the top nav needs — so the drawn width
  // is derived at render and the stored one is never rewritten to fit them. A width dragged on
  // a wide monitor comes back there instead of being shaved to what the last small window
  // allowed. Only the reader's drag writes it (onUp below). `useLeftDockMax` re-renders on a
  // window resize as well as a change of the nav's claim, which is also what keeps the
  // innerWidth read inside sidebarWidthFor current.
  const [widthPref, setWidthPref] = useState(() => {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    return saved && saved >= minSidebarWidth() ? saved : DEFAULT_WIDTH;
  });
  const navMax = useLeftDockMax();
  const width = sidebarWidthFor(widthPref, navMax);

  // A LANDSCAPE phone has the same problem by a different route: the panel stays resizable, but
  // its cap (70% of an already-short viewport) sits under the 640px column cutoff, so dragging can
  // never reveal Azimuth/Altitude either. usePhone() catches a phone in BOTH orientations (and no
  // tablets) — the columns force on and the table scrolls sideways there too (matching CSS).
  const phone = usePhone();

  // Publish the live panel width so the map edge-glow insets its left edge to
  // the visible map area (right of this sidebar). Through the left-dock
  // registry (lib/leftDock.ts) rather than a raw --es-width write, so another
  // docked panel can be open at the same time without the two fighting over
  // the var; retiring on unmount recomputes it from whatever remains.
  useEffect(() => {
    publishLeftDock('expanded-sidebar', width);
    return () => retireLeftDock('expanded-sidebar');
  }, [width]);

  // Aspect-frame view while horizon data is in: combined (default — one merged
  // list) vs separate (two matched columns). Persisted like the pills above.
  const [splitFrames, setSplitFrames] = useState(
    () => localStorage.getItem(FRAMES_KEY) === 'separate',
  );
  useEffect(() => {
    localStorage.setItem(FRAMES_KEY, splitFrames ? 'separate' : 'combined');
  }, [splitFrames]);
  // The orb the Compare table is computed at — its own, never the app's. A
  // methodological choice rather than an exploratory one, so unlike the sort and
  // the status pills it persists. It reaches NOTHING else: Settings ▸ Aspect
  // orbs still governs the wheel, the combined list and every other reading.
  const [compareOrb, setCompareOrb] = useState<number>(() => {
    const saved = Number(localStorage.getItem(COMPARE_ORB_KEY));
    return COMPARE_ORBS.includes(saved as (typeof COMPARE_ORBS)[number])
      ? saved
      : COMPARE_ORB_DEFAULT;
  });
  useEffect(() => {
    localStorage.setItem(COMPARE_ORB_KEY, String(compareOrb));
  }, [compareOrb]);
  // Frame-table controls (Separate view): active sort column/direction and
  // the status pills' filter. Session-only — the table is exploratory.
  const [frameSort, setFrameSort] = useState<{
    key: FrameSortKey;
    dir: 1 | -1;
  }>({ key: 'status', dir: 1 });
  const [frameStatuses, setFrameStatuses] = useState<Set<FrameStatus>>(
    () => new Set(FRAME_STATUSES),
  );
  // The other three sortable readings, each with its own state so sorting the
  // positions table by declination doesn't reorder the aspects underneath it.
  // `null` = the list's own order, which every one of them opens in.
  const [posSort, setPosSort] = useState<SortState<PosSortKey>>(null);
  // The overlay's own table sorts separately from the chart's above it: reading
  // the transits by declination should not reorder the birth chart beside them.
  const [ovPosSort, setOvPosSort] = useState<SortState<PosSortKey>>(null);
  // Shut until asked for. The overlay's figures are a second reading of a second
  // set of bodies — wanted often enough to be one press away, not often enough to
  // push the aspects and the balance a screen further down by default.
  const [ovPosOpen, setOvPosOpen] = useState(false);
  const [aspectSort, setAspectSort] = useState<SortState<AspectSortKey>>(null);
  const [crossSort, setCrossSort] = useState<SortState<AspectSortKey>>(null);
  // The second chart's own readings, below the first chart's in each section.
  // Shut by default for the same reason the positions fold above is: they are a
  // second reading of a second set of bodies, wanted often enough to be one
  // press away and not often enough to push everything below them off screen.
  // Session state only — nothing here is persisted, so there is no storage key
  // and no stale default in an existing install.
  const [ovBalOpen, setOvBalOpen] = useState(false);
  const [ovAspOpen, setOvAspOpen] = useState(false);
  // Its own sort, like every other list in this panel: ordering the overlay's
  // aspects must not reorder the chart's above them.
  const [ovAspSort, setOvAspSort] = useState<SortState<AspectSortKey>>(null);


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
  // The corner's "Birth time unknown" note speaks for the NATAL wheel of a chart with no
  // birth time. On a celestial map that is the wheel with no angles (a promoted overlay
  // brings its own). On a geodetic map the angles come from the place, so the natal
  // wheel has a full frame whatever the birth time — there it is the unpromoted wheel,
  // and the note stays, or a noon placeholder would read as a timed chart. (2026-10-02)
  //
  // The geodetic header's first line says it too ("birth time unknown, noon used"), and
  // the note is kept anyway: it belongs to the WHEEL, and goes where the wheel goes — a
  // header scrolled out of view, the Dual layout's second wheel under it — and the same
  // chart's wheel then says the same thing in both line systems. The celestial header
  // still prints 12:00, so there the note is the only place it is said. (2026-10-02)
  const timeUnknownShown =
    planetsOnly && (!angles || (!!angles.geodetic && !promotedLabel));
  // The panel header's geodetic data block (see geoLines). Its first line follows the
  // DERIVED line system; the lines about the frame follow the frame itself
  // (`angles.geodetic`), so a state with no frame (NO CHART) never names a place it
  // is cast for. (2026-10-02)
  const geoMap = lineSystem === 'geodetic';
  const geoFrame = !!angles?.geodetic;
  // `chart` is the derived chart, so a time being tried on (lib/birthData) lifts it.
  const timeless = !!chart && timeUnknown(chart);
  // The sky hold (lib/skyHold), derived here from the one line-system prop rather than
  // passed as a second boolean that could disagree with it. In this panel it holds the
  // Advanced table's azimuth and altitude — where a body stands in a place's sky is the
  // sky's turning — for every row, bodies and angles alike; RA and Dec stay, being the
  // body's own. (Local space, the other held thing here, arrives as `localSpaceHeld`.)
  // (2026-10-02)
  const skyHeld = skyHeldFor(lineSystem);
  const skyHeldWhy = skyHeld ? t('settings.inert.skyHeld') : undefined;

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
  // which angle marks (AS/MC/DS/IC) the wheel draws.
  const visibleAngles = new Set<'As' | 'Ds' | 'Mc' | 'Ic' | 'Vx' | 'Avx'>();
  if (visibleLineTypes.has('ASC')) visibleAngles.add('As');
  if (visibleLineTypes.has('DSC')) visibleAngles.add('Ds');
  if (visibleLineTypes.has('MC')) visibleAngles.add('Mc');
  if (visibleLineTypes.has('IC')) visibleAngles.add('Ic');
  // The Vertex axis follows its own line-type toggles (the Vx/Avx buttons in
  // the Lines filter), so map lines and wheel/readout marks move together.
  if (visibleLineTypes.has('VX')) visibleAngles.add('Vx');
  if (visibleLineTypes.has('AVX')) visibleAngles.add('Avx');

  // The same visible angles as list rows, in the display order AS, MC, DS, IC
  // (the Vertex axis after them). They tack onto the end of the planet
  // list below (no separate heading), so the readout still lists them even
  // though they now also live in the wheel — every row gated by the same
  // line-type toggles as its map line.
  //
  // A geodetic frame's rows carry `geodetic`: they truncate (Longitude's `trunc`), and
  // Discreet masks them while they are the birthplace's (castBlank, below). Rows are
  // finite values only, because a geodetic frame has no Vertex (NaN) and a NaN row
  // would print "NaN°" whatever the Vx toggle says. (2026-10-02)
  const angleRowsOf = (set: RelocatedAngles) =>
    visibleAngleSpecs(visibleLineTypes)
      .map((s) => ({
        code: s.code,
        key: s.key,
        name: t(s.nameKey),
        lon: set[s.key],
        color: s.color,
        geodetic: !!set.geodetic,
      }))
      .filter((r) => Number.isFinite(r.lon));
  const shownAngleRows = angles ? angleRowsOf(angles) : [];

  // The overlay's angles as the same row shape, gated by the same line-type
  // toggles — so the overlay's table lists AS/MC/DS/IC for ITS frame exactly as
  // the chart's does for the natal one.
  const shownOverlayAngleRows = overlayAngles ? angleRowsOf(overlayAngles) : [];

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
  // A solar or lunar return is transits at one particular instant, so the overlay
  // still calls itself "Transits" everywhere it is a MODE. Here it is naming a
  // CHART, and the chart an astrologer has in front of them at that moment is the
  // return — so the wheel says so. Only the wheel's caption: the timeline bar,
  // which is showing the mode and the date being scrubbed, is unchanged.
  const overlayName = overlayLabel
    ? overlayReturn
      ? t(`timeline.returns.${overlayReturn}.chartName` as 'timeline.returns.solar.chartName')
      : overlayKind === 'cyclo'
        ? 'CCG'
        : overlayLabel.split('·')[0].trim()
    : null;
  // Synastry's second chart is a PERSON, not a moment: it has no instant at all
  // (timeline.ts leaves `moment` null for it), so the slot every other overlay
  // fills with its date is where the partner's name goes. Taken off the label's
  // detail half — "Synastry · Jane Doe" — from the FIRST middot only, so a name
  // that contains one survives whole.
  //
  // MASKED HERE, once, rather than at the two places it renders (the bi-wheel's
  // corner caption and the dual header). The name arrives already baked into
  // `overlayLabel` — lib/astro/timeline builds "Synastry · {name}" from
  // `partner.name` raw — so this derivation is the only point between the
  // timeline and the screen where Discreet can catch it. It was not caught, and
  // the panel printed a partner's real name in the one mode whose whole purpose
  // is hiding who a chart is, while the SynastryHud and the chart switcher two
  // inches away masked the same string (2026-08-24).
  //
  // Emptiness is tested BEFORE masking, not after: maskName('') returns three
  // dots rather than '', so `id.name(raw) || null` can never be null and an
  // overlay label with an empty detail half would grow a phantom name line.
  const overlaySubjectRaw =
    overlayKind === 'synastry' && overlayLabel && overlayLabel.includes('·')
      ? overlayLabel.slice(overlayLabel.indexOf('·') + 1).trim()
      : '';
  const overlaySubject = overlaySubjectRaw ? id.name(overlaySubjectRaw) : null;
  // The overlay's date/time (UTC) to show alongside its name over the wheel, so the moment
  // reads even without the timeline bar in view. A middot splits date · time (matching the
  // bar's separator convention); "UTC" is kept explicit as the labelFull captions do.
  const momentText = overlayMoment
    ? `${overlayMoment.replace(' ', ' · ')} UTC`
    : overlaySubject;

  // Built from the current prop rather than an updater callback: the set lives with the
  // caller now, and one pill click per commit needs no queued form.
  const toggleAspect = (cat: AspectCategory) => {
    const next = new Set(visibleAspects);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setVisibleAspects(next);
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

  // The width the current drag last set (null until it moves past the slop) — what onUp stores;
  // and what the press started from: where, the reader's width, and the width drawn from it
  // (they differ whenever a cap is holding the panel in).
  const draggedRef = useRef<number | null>(null);
  const dragStartRef = useRef({ x: 0, pref: 0, width: 0 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      // Inside the slop it is a press, not a drag. Stored, a press's jitter would replace the
      // reader's width with the CAPPED one (1200 kept, 1008 drawn at 1440).
      const start = dragStartRef.current;
      if (draggedRef.current == null && Math.abs(e.clientX - start.x) < DRAG_SLOP) return;
      // Clamped by the same rule the panel is drawn by, so the handle stops dead at the cap
      // (no stretch past it that snaps back), and what gets stored is a width the reader saw.
      const newWidth = sidebarWidthFor(e.clientX + dragOffsetRef.current, getLeftDockMax());
      draggedRef.current = newWidth;
      setWidthPref(newWidth);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      // The one place the stored width is written: the reader's own drag — and only one that
      // changed what is drawn. A drag that ends where it began hands back the width it started
      // from, which may be wider than the cap and is still the reader's.
      const start = dragStartRef.current;
      const dragged = draggedRef.current;
      if (dragged != null && dragged !== start.width) localStorage.setItem(WIDTH_KEY, String(dragged));
      else if (dragged != null) setWidthPref(start.pref);
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
    draggedRef.current = null;
    dragStartRef.current = { x: e.clientX, pref: widthPref, width };
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
  // touch drag range — [380, ~70% of the viewport] on a phone, [440, same] on a tablet — so
  // widening back past it restores the labels live. (Desktop can't go below MIN_WIDTH, so it's
  // never compact — labels always show there. The old DEFAULT_WIDTH threshold was unreachable
  // on a phone, so it stuck compact.)
  const compact = isTouchLayout() && width < MIN_WIDTH;

  // The positions readout, for ONE chart: the compact two-column list, or the
  // Advanced table of coordinate columns. Written once and called twice — the
  // active chart, and the overlay riding with it — because the two are the same
  // reading of two different sets of bodies, and a second copy would be a second
  // place for a column to drift.
  //
  // Everything it needs is an argument: the bodies, their horizon coordinates,
  // the angle rows and theirs, and the sort state (each table sorts on its own,
  // so ordering the overlay by declination does not disturb the chart above it).
  // The catalog minor bodies and their horizon figures come last and default to
  // none: only the natal chart has them (there is no sample at an overlay's instant).
  // So do the source notes (bodyNotes) and the spans (ranges), which are the natal
  // wheel's too.
  const positionsBlock = (
    bodies: EclipticPosition[],
    coords: Map<PlanetName, HorizontalCoords>,
    angleRows: typeof shownAngleRows,
    aCoords: Record<string, AngleCoords> | null | undefined,
    sort: SortState<PosSortKey>,
    onSortCol: (key: PosSortKey) => void,
    minors: readonly WheelMinorBody[] = NO_MINOR,
    mCoords: ReadonlyMap<number, { az: number; alt: number }> | null = null,
    notes: ReadonlyMap<PlanetName, string> | null = null,
    spans: ReadonlyMap<PlanetName, number> | null = null,
  ): ReactNode => {
    // A body with a source note — the Part of Fortune on a geodetic map, built from the
    // place's Ascendant — is tagged GE beside its name, with the note as the tag's tip,
    // in the list and the table alike. The tag names a source, not a degree, so it stays
    // where Discreet blanks the figure (maskPoint). (2026-10-02)
    const noteTag = (name: PlanetName) => {
      const note = notes?.get(name);
      return note ? (
        <TipGlyph className="es-ge-tag" title={<span className="es-tip-title">{note}</span>}>
          {t('expandedSidebar.geodetic.ge')}
        </TipGlyph>
      ) : null;
    };
    // Simple view: planets, then the catalog bodies, then angles in one row-by-row
    // two-column grid (even index → left, odd → right), so each group flows straight
    // on from the last. (Catalog bodies are an Advanced reading, so in practice they
    // reach the table below rather than this list — but a list promised to carry
    // every body in the chart should not depend on that.)
    const planetItems = bodies.map((p) => ({ kind: 'planet' as const, p }));
    const minorItems = minors.map((m) => ({ kind: 'minor' as const, m }));
    const angleItems = angleRows.map((a) => ({ kind: 'angle' as const, ...a }));
    const rows = [...planetItems, ...minorItems, ...angleItems];
    const leftCol = rows.filter((_, i) => i % 2 === 0);
    const rightCol = rows.filter((_, i) => i % 2 === 1);
    // A body known only to a span — a chart with no birth time — prints the span where
    // its degree would print to the minute (or the second), in the list and the table
    // alike. A masked Lot stays masked: its span would give the masked Ascendant back to
    // within a few degrees. (2026-10-02)
    const spanText = (p: EclipticPosition, size: number) => {
      const half = spans?.get(p.name);
      return half === undefined ? null : <ZodiacRange lon={p.lon} halfDeg={half} size={size} />;
    };
    const renderRow = (row: (typeof rows)[number]) =>
      row.kind === 'planet' ? (
        <li key={`p-${row.p.name}`}>
          <div className="es-row-main">
            <PlanetTipGlyph planet={row.p.name} size={13} />
            <span className="es-name">
              {labels.planet(row.p.name)}
              {noteTag(row.p.name)}
            </span>
            <span className="es-lon">
              {maskPoint(row.p.name)
                ? id.text(advanced ? '00°00\'00"' : '00°00\'')
                : (spanText(row.p, 12) ?? <Longitude lon={row.p.lon} advanced={advanced} />)}
            </span>
          </div>
        </li>
      ) : row.kind === 'minor' ? (
        <li key={row.m.id}>
          <div className="es-row-main">
            <MinorTipGlyph m={row.m} />
            <span className="es-name">{row.m.label}</span>
            <span className="es-lon">
              <Longitude lon={row.m.lon} advanced={advanced} />
            </span>
          </div>
        </li>
      ) : (
        <li key={`a-${row.code}`}>
          <div className="es-row-main">
            <AngleTipGlyph code={row.code} name={row.name} color={row.color} />
            <span className="es-name">{row.name}</span>
            <span className="es-lon">
              {maskAngle(row) ? (
                id.text(advanced ? '00°00\'00"' : '00°00\'')
              ) : (
                <Longitude lon={row.lon} advanced={advanced} trunc={row.geodetic} />
              )}
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
    // the cutoff by dragging — where the table scrolls sideways instead.
    const advExtraCols = width >= 640 || phone;
    // The ℞ / S badge after a body's name, and the declination cell with its
    // out-of-bounds flag — one copy each, for the built-in rows and the catalog rows
    // alike, so the two kinds of body can never flag the same state differently.
    const motionBadge = (b: { stationary?: boolean; retrograde?: boolean }) =>
      b.stationary ? (
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
      ) : b.retrograde ? (
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
      ) : null;
    const decCell = (decRad: number | undefined) => {
      const decCls = decRad !== undefined ? decClass(decRad, oobLimitDeg) : '';
      const dec = decRad !== undefined ? fmtDM(decRad * RAD2DEG, true) : '—';
      return (
        <td className={`es-adv-num ${decCls}`}>
          {decCls ? (
            <TipGlyph
              title={
                <span className="es-tip-title">
                  <span className="es-dec-oob es-dec-dot" />
                  {t('expandedSidebar.outOfBounds', {
                    dir: (decRad ?? 0) > 0 ? t('expandedSidebar.north') : t('expandedSidebar.south'),
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
      );
    };
    // Advanced view: one planet per row across labelled coordinate columns.
    // Geocentric columns come straight off the body; RA/Azimuth/Altitude come
    // from coords (computed for the relocated observer).
    const renderAdvRow = (p: EclipticPosition) => {
      const hc = coords.get(p.name);
      return (
        <tr key={p.name}>
          <td className="es-adv-point">
            <PlanetTipGlyph planet={p.name} size={13} />
            <span className="es-name">{labels.planet(p.name)}</span>
            {motionBadge(p)}
            {noteTag(p.name)}
          </td>
          <td className="es-adv-num es-adv-lon">
            {/* A masked Lot (maskPoint) loses only this cell: it has no equatorial or
                horizon figures to hide — App keeps it out of the coordinate tables. */}
            {maskPoint(p.name)
              ? id.text('00°00\'')
              : (spanText(p, 11) ??
                (advFullSign ? <Longitude lon={p.lon} advanced={false} /> : <SignLon lon={p.lon} />))}
          </td>
          <td className="es-adv-num">
            {p.speed !== undefined ? fmtDM(p.speed, true) : '—'}
          </td>
          <td className="es-adv-num">
            {p.lat !== undefined ? fmtDM(p.lat * RAD2DEG, true) : '—'}
          </td>
          <td className="es-adv-num">{hc ? fmtDM(hc.ra * RAD2DEG) : '—'}</td>
          {decCell(p.dec)}
          {advExtraCols && (
            <>
              <td className="es-adv-num">{hc && !skyHeld ? fmtDM(hc.az * RAD2DEG) : '—'}</td>
              <td className="es-adv-num">
                {hc && !skyHeld ? fmtDM(hc.alt * RAD2DEG, true) : '—'}
              </td>
            </>
          )}
        </tr>
      );
    };
    // A catalog minor planet's row: the same columns, every figure off the one sample
    // the wheel placed it from — longitude in the reader's zodiac, speed, latitude, and
    // the tropical RA and declination of record — with azimuth and altitude from
    // mCoords, at the planets' own observer. The ℞ / S badges and the out-of-bounds
    // flag are the built-ins' own.
    const renderAdvMinorRow = (m: WheelMinorBody) => {
      const hc = mCoords?.get(m.n);
      return (
        <tr key={m.id}>
          <td className="es-adv-point">
            <MinorTipGlyph m={m} />
            <span className="es-name">{m.label}</span>
            {motionBadge(m)}
          </td>
          <td className="es-adv-num es-adv-lon">
            {advFullSign ? (
              <Longitude lon={m.lon} advanced={false} />
            ) : (
              <SignLon lon={m.lon} />
            )}
          </td>
          <td className="es-adv-num">{fmtDM(m.speed, true)}</td>
          <td className="es-adv-num">{fmtDM(m.lat * RAD2DEG, true)}</td>
          <td className="es-adv-num">{fmtDM(m.ra * RAD2DEG)}</td>
          {decCell(m.dec)}
          {advExtraCols && (
            <>
              <td className="es-adv-num">{hc && !skyHeld ? fmtDM(hc.az * RAD2DEG) : '—'}</td>
              <td className="es-adv-num">
                {hc && !skyHeld ? fmtDM(hc.alt * RAD2DEG, true) : '—'}
              </td>
            </>
          )}
        </tr>
      );
    };
    // Advanced mode lists the angles in the same table, right after the
    // planets. Each angle is an ecliptic point, so latitude is 0 and RA / Decl
    // / Azimuth / Altitude come from aCoords (same observer as the planets);
    // Speed has no meaning for an angle, so that cell stays an em-dash.
    const renderAdvAngleRow = (a: (typeof angleRows)[number]) => {
      const ac = aCoords?.[a.key];
      // Masked (Discreet, a birthplace's geodetic angles): the longitude and every
      // figure computed from it — the two equatorial and the two horizon ones — each
      // blanked to a fixed width so not even a figure's length is left to read.
      // Azimuth and altitude are read at the birthplace from the very angle the row
      // hides, so leaving them would leave the row half-readable. (2026-10-02)
      const masked = maskAngle(a);
      return (
        <tr key={`a-${a.code}`}>
          <td className="es-adv-point">
            <AngleTipGlyph code={a.code} name={a.name} color={a.color} />
            <span className="es-name">{a.name}</span>
          </td>
          <td className="es-adv-num es-adv-lon">
            {masked ? (
              id.text('00°00\'')
            ) : advFullSign ? (
              <Longitude lon={a.lon} advanced={false} trunc={a.geodetic} />
            ) : (
              <SignLon lon={a.lon} trunc={a.geodetic} />
            )}
          </td>
          <td className="es-adv-num">—</td>
          <td className="es-adv-num">{ac ? fmtDM(ac.lat * RAD2DEG, true) : '—'}</td>
          <td className="es-adv-num">
            {ac ? (masked ? id.text('000°00\'') : fmtDM(ac.ra * RAD2DEG)) : '—'}
          </td>
          <td className="es-adv-num">
            {ac ? (masked ? id.text('+00°00\'') : fmtDM(ac.dec * RAD2DEG, true)) : '—'}
          </td>
          {/* The sky hold outranks the Discreet mask: on a geodetic map these two are
              '—' for every row, so a masked row's placeholder never shows there.
              (2026-10-02) */}
          {advExtraCols && (
            <>
              <td className="es-adv-num">
                {ac && !skyHeld ? (masked ? id.text('000°00\'') : fmtDM(ac.az * RAD2DEG)) : '—'}
              </td>
              <td className="es-adv-num">
                {ac && !skyHeld
                  ? masked
                    ? id.text('+00°00\'')
                    : fmtDM(ac.alt * RAD2DEG, true)
                  : '—'}
              </td>
            </>
          )}
        </tr>
      );
    };
    // Planets and angles sort as ONE list. An angle is an ecliptic point with
    // a real longitude, latitude, right ascension and declination, so leaving
    // the four of them out of a declination sort would answer the question
    // wrongly rather than narrowly. Only Speed has nothing to say for an
    // angle — and the rule below sinks every empty cell to the bottom, in
    // both directions, so an em-dash never heads a sorted column.
    //
    // The catalog bodies join the same list, between the two: after every built-in
    // body, in the reader's own list order, and before the angles.
    type PosRow =
      | { kind: 'planet'; p: EclipticPosition }
      | { kind: 'minor'; m: WheelMinorBody }
      | { kind: 'angle'; a: (typeof angleRows)[number] };
    const posRows: PosRow[] = [
      ...bodies.map((p): PosRow => ({ kind: 'planet', p })),
      ...minors.map((m): PosRow => ({ kind: 'minor', m })),
      ...angleRows.map((a): PosRow => ({ kind: 'angle', a })),
    ];
    // Every value in the units the CELL is computed from, so a column sorts by
    // exactly what it prints: longitudes and speed in degrees, the rest in
    // radians (both sides of each column share one unit, which is all a
    // comparison needs).
    const posVal = (r: PosRow, key: PosSortKey): number | null => {
      // Held columns (the sky hold) sort as empty cells for every row, as they print.
      // (2026-10-02)
      if (skyHeld && (key === 'az' || key === 'alt')) return null;
      if (r.kind === 'minor') {
        const mc = mCoords?.get(r.m.n);
        switch (key) {
          // Past every built-in body's rank and short of the angles' 1000, in the
          // reader's own list order — so a Point sort ascending reproduces the
          // table's natural order here too.
          case 'point': return 500 + r.m.rank;
          case 'lon': return r.m.lon;
          case 'speed': return r.m.speed;
          case 'lat': return r.m.lat;
          case 'ra': return r.m.ra;
          case 'dec': return r.m.dec;
          case 'az': return mc?.az ?? null;
          case 'alt': return mc?.alt ?? null;
        }
      }
      if (r.kind === 'angle') {
        const ac = aCoords?.[r.a.key];
        // A masked angle sorts as an empty cell in the columns it hides: ranked among
        // the planets, its place in the order would say roughly what the mask hides.
        // (2026-10-02)
        const hidden = maskAngle(r.a);
        switch (key) {
          // The angles keep their display order (AS, MC, DS, IC, Vx, Avx) and
          // sit after every body, so a Point sort ascending reproduces the
          // table's own natural order exactly.
          case 'point': return 1000 + angleRows.indexOf(r.a);
          case 'lon': return hidden ? null : r.a.lon;
          case 'speed': return null;
          case 'lat': return ac?.lat ?? null;
          case 'ra': return hidden ? null : (ac?.ra ?? null);
          case 'dec': return hidden ? null : (ac?.dec ?? null);
          case 'az': return hidden ? null : (ac?.az ?? null);
          case 'alt': return hidden ? null : (ac?.alt ?? null);
        }
      }
      const p = r.p;
      const hc = coords.get(p.name);
      switch (key) {
        case 'point': return planetRank(p.name);
        // A masked Lot, likewise (maskPoint). (2026-10-02)
        case 'lon': return maskPoint(p.name) ? null : p.lon;
        case 'speed': return p.speed ?? null;
        case 'lat': return p.lat ?? null;
        case 'ra': return hc?.ra ?? null;
        case 'dec': return p.dec ?? null;
        case 'az': return hc?.az ?? null;
        case 'alt': return hc?.alt ?? null;
      }
    };
    const sortedPosRows = sort
      ? [...posRows].sort((x, y) => {
          const a = posVal(x, sort.key);
          const b = posVal(y, sort.key);
          if (a == null || b == null) {
            return a == null ? (b == null ? 0 : 1) : -1;
          }
          // Ties fall back to the natural order, so equal values still read
          // luminaries-first rather than in whatever order sort() leaves them.
          return sort.dir * (a - b) || posRows.indexOf(x) - posRows.indexOf(y);
        })
      : posRows;
    return (
      <>
        <div className="es-planets-col">
          {advanced ? (
            <div className="es-adv-scroll">
              <table className="es-adv-table">
                <thead>
                  <tr>
                    <AdvHeader cellClass="es-adv-point" sortKey="point" sort={sort} onSort={onSortCol} label={t('expandedSidebar.table.point')} hint={t('expandedSidebar.table.pointHint')} />
                    <AdvHeader sortKey="lon" sort={sort} onSort={onSortCol} label={t('expandedSidebar.table.longitude')} hint={t('expandedSidebar.table.longitudeHint')} />
                    <AdvHeader sortKey="speed" sort={sort} onSort={onSortCol} label={t('expandedSidebar.table.speed')} hint={t('expandedSidebar.table.speedHint')} />
                    <AdvHeader sortKey="lat" sort={sort} onSort={onSortCol} label={t('expandedSidebar.table.latitude')} hint={t('expandedSidebar.table.latitudeHint')} />
                    <AdvHeader sortKey="ra" sort={sort} onSort={onSortCol} label={t('expandedSidebar.table.raLabel')} title={t('expandedSidebar.table.raTitle')} hint={t('expandedSidebar.table.raHint')} />
                    <AdvHeader sortKey="dec" sort={sort} onSort={onSortCol} label={t('expandedSidebar.table.decLabel')} title={t('expandedSidebar.table.decTitle')} hint={t('expandedSidebar.table.decHint')} />
                    {advExtraCols && (
                      <>
                        <AdvHeader sortKey="az" sort={sort} onSort={onSortCol} label={t('expandedSidebar.table.aziLabel')} title={t('expandedSidebar.table.aziTitle')} hint={t('expandedSidebar.table.aziHint')} held={skyHeldWhy} />
                        <AdvHeader sortKey="alt" sort={sort} onSort={onSortCol} label={t('expandedSidebar.table.altLabel')} title={t('expandedSidebar.table.altTitle')} hint={t('expandedSidebar.table.altHint')} held={skyHeldWhy} />
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedPosRows.map((r) =>
                    r.kind === 'planet'
                      ? renderAdvRow(r.p)
                      : r.kind === 'minor'
                        ? renderAdvMinorRow(r.m)
                        : renderAdvAngleRow(r.a),
                  )}
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
      </>
    );
  };


  // The balance readout, for ONE chart: the element and modality constellations,
  // and (Advanced only) the essential-dignity list under them. Written once and
  // called twice, exactly like positionsBlock above — the second wheel is a
  // chart too, and "how is THAT chart weighted" had no answer in this panel
  // before 2026-08-24. A second copy would be a second place for an element
  // grouping to drift.
  const balanceBlock = (bodies: EclipticPosition[]): ReactNode => {
    // Group the bodies by element and by modality (every body has exactly one of
    // each). We keep the bodies themselves, not just a count, so the balance can
    // be drawn as a constellation of their glyphs.
    const elementBodies: Record<'fire' | 'earth' | 'air' | 'water', EclipticPosition[]> = {
      fire: [],
      earth: [],
      air: [],
      water: [],
    };
    const modalityBodies: Record<'cardinal' | 'fixed' | 'mutable', EclipticPosition[]> = {
      cardinal: [],
      fixed: [],
      mutable: [],
    };
    for (const p of bodies) {
      const idx = signIndex(p.lon);
      elementBodies[signElement(idx)].push(p);
      modalityBodies[signModality(idx)].push(p);
    }
    // Dignities stay gated to Advanced; skip the lookup entirely otherwise so
    // the always-on constellation costs nothing extra.
    const dignified = advanced
      ? bodies
          .map((p) => ({
            p,
            d: essentialDignity(p.name, signIndex(p.lon), rulershipScheme),
          }))
          .filter((x): x is typeof x & { d: DignityResult } => x.d !== null)
      : [];
    // Only Modern can attribute a row to an era (Traditional has no modern claim
    // to distinguish it from), and only then do the rows need the extra width.
    const attributed = dignified.some((x) => x.d.from !== null);
    const elementSegs = (['fire', 'earth', 'air', 'water'] as const).map((e) => ({
      key: e,
      label: t(`expandedSidebar.element.${e}`),
      glyph: ELEMENT_GLYPHS[e],
      cls: `es-el-${e}`,
      hint: t(`expandedSidebar.elementDesc.${e}`),
      bodies: elementBodies[e],
    }));
    const modalitySegs = (['cardinal', 'fixed', 'mutable'] as const).map((m) => ({
      key: m,
      label: t(`expandedSidebar.modality.${m}`),
      glyph: MODALITY_GLYPHS[m],
      cls: `es-mod-${m}`,
      hint: t(`expandedSidebar.modalityDesc.${m}`),
      bodies: modalityBodies[m],
    }));
    return (
      <>
        <div className="es-balance-groups">
          <div className="es-balance-group">
            {elementSegs.map((seg) => (
              <BalanceRow key={seg.key} seg={seg} />
            ))}
          </div>
          <div className="es-balance-group">
            {modalitySegs.map((seg) => (
              <BalanceRow key={seg.key} seg={seg} />
            ))}
          </div>
        </div>
        {dignified.length > 0 && (
          <ul className={`es-dignity-list${attributed ? ' is-attributed' : ''}`}>
            {dignified.map(({ p, d }) => {
              const term = t(`expandedSidebar.dignity.${d.dignity}`);
              const from = d.from ? t(`expandedSidebar.dignityFrom.${d.from}`) : null;
              return (
                <li key={p.name}>
                  <PlanetTipGlyph planet={p.name} size={12} className="asp-planet" />
                  <span className="es-dignity-planet">{labels.planet(p.name)}</span>
                  <TipSpan
                    className={`es-dignity es-dignity-${d.dignity}`}
                    placement="top"
                    tapReveal
                    tip={term.charAt(0).toUpperCase() + term.slice(1)}
                    hint={t(`expandedSidebar.dignityDesc.${d.dignity}`)}
                  >
                    {term}
                  </TipSpan>
                  {/* Which school granted it — shown only where the two disagree,
                      which is only possible under the Both scheme. Without it Mars
                      and Pluto both read a bare "rulership" in Scorpio, which is
                      the confusion the scheme choice exists to answer; with it, a
                      reader who wants one school knows which row to ignore (and
                      which setting removes it). */}
                  {d.from && from && (
                    <TipSpan
                      className="es-dignity-from"
                      placement="top"
                      tapReveal
                      tip={from.charAt(0).toUpperCase() + from.slice(1)}
                      hint={t(`expandedSidebar.dignityFromDesc.${d.from}`)}
                    >
                      {`(${from})`}
                    </TipSpan>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </>
    );
  };

  // The point both wheels are cast for, and how its lines are coloured and
  // masked — shared by the panel header's place lines and the partner header's
  // "Cast for" line below, which name the same place and must say it alike.
  const castPoint =
    point ?? (chart ? { lat: chart.birthplace.lat, lng: chart.birthplace.lng } : null);
  const castState = isNatalPin
    ? 'natal-pinned'
    : pinned
      ? 'pinned'
      : point
        ? ''
        : 'natal';
  // Blanked only while the line is speaking for the BIRTHPLACE — the natal pin, or
  // the plain natal state that falls back to it. A hovered or custom pin is a
  // place the user chose to look at, not birth data, so it reads normally: the
  // mode hides who the chart is, not where you are working.
  const castBlank = id.on && (isNatalPin || !point);
  // The same line, drawn through the ANGLES on a geodetic map: there they are a
  // function of the place alone (the MC is its longitude), so while the place is the
  // birthplace they are birth data too — masked in the rows (longitude and every
  // coordinate computed from it: RA, declination, azimuth, altitude) and in the wheels'
  // degree text. A chart's own celestial angles are the work, and stay. Per row,
  // because the overlay's table on a geodetic map lists the same place's frame.
  // (2026-10-02)
  const maskAngle = (row: { geodetic: boolean }) => castBlank && row.geodetic;
  const maskGeAngles = castBlank && !!angles?.geodetic;
  // A Lot on that wheel is built from the same frame's Ascendant — the Part of Fortune
  // is AS + Moon − Sun, or the reverse — so printed beside the Sun and Moon it hands the
  // masked Ascendant back to the arc-minute. Its figure goes with the angles'. Only the
  // natal chart's bodies carry a Lot (App's fortuneWheelPos), so the chart-level test is
  // exact for the one table that can hold one. (2026-10-02)
  const maskPoint = (name: PlanetName) => maskGeAngles && POINTS.includes(name);

  // The place line and its coordinates — the panel header's, and the overlay
  // wheel's below it, because they are the same fact about both: the angles on
  // either wheel are cast for this point. Rendered from one function so the two
  // cannot drift into saying it differently. (A synastry partner's wheel is the
  // exception: a partner has a birthplace of their own, so theirs is partnerLines.)
  const relocatedLines = (): ReactNode => {
    const displayPoint = castPoint;
    if (!displayPoint) return null;
    const stateClass = castState;
    const hasPin = isNatalPin || pinned;
    const blankPlace = castBlank;
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
    // On a geodetic map the same two facts are ONE line of the header's data block,
    // "Cast for [place] · [coordinates]": there the wheel's angles and houses are the
    // place's own, so the place is what the frame is cast for, not just where the map
    // is pointing. One row that never wraps — the name ellipsizes, and its box is always
    // rendered — so a hover swapping the name still cannot move the header (the nbsp
    // note below). State colour and Discreet's blanking are the two-line form's. The
    // FRAME decides, as in partnerLines: no frame, no "cast for". (2026-10-02)
    if (geoFrame) {
      const named = blankPlace || !!pointLabel?.trim();
      return (
        <div className={`es-relocated es-geo-cast ${stateClass}`}>
          {hasPin && pinIcon}
          <span className="es-cast-for-label">{t('expandedSidebar.partnerHead.castFor')}</span>
          <span className="es-relocated-name">
            {blankPlace ? id.text(pointLabel || 'birthplace') : pointLabel || ' '}
          </span>
          {named && (
            <span className="es-geo-sep" aria-hidden="true">
              ·
            </span>
          )}
          <span className="es-relocated-text">
            {blankPlace
              ? `${id.text('00°00′N')} ${id.text('000°00′E')}`
              : `${fmtLat(displayPoint.lat)} ${fmtLng(displayPoint.lng)}`}
          </span>
        </div>
      );
    }
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
        {/* The pin marker and the name are a ROW, stated as one. The marker used
            to be an inline SVG in front of a bare text node, which reads correctly
            only while the line has room to spare — put the same markup in a
            narrower box and the name drops below the marker instead of sitting
            beside it. The name keeps the ellipsis, so it needs a box of its own to
            ellipsize inside. */}
        <span className="es-relocated-place">
          {hasPin && pinIcon}
          <span className="es-relocated-name">
            {blankPlace ? id.text(pointLabel || 'birthplace') : pointLabel || ' '}
          </span>
        </span>
        <span className="es-relocated-text">
          {blankPlace
            ? `${id.text('00°00′N')} ${id.text('000°00′E')}`
            : `${fmtLat(displayPoint.lat)} ${fmtLng(displayPoint.lng)}`}
        </span>
      </div>
    );
  };

  // The rest of the geodetic data block, under "Cast for" (relocatedLines): the place's
  // AS and MC, to the minute by the one truncation rule (truncZodiac) — the Coordinates
  // box's figures, sign glyph between degrees and minutes as there, labelled as the
  // grid's hover readout labels them (map.geoReadout) — and then where the wheel's
  // planets and houses come from. The house system named is the one the cusps
  // were computed in: Porphyry wherever the frame fell back to it (the corner's
  // houseFallback says why). Discreet blanks the two figures, sign and all, exactly
  // where it blanks the angle rows (maskGeAngles); the planets line names no place.
  // Panel header only — the Dual layout's second header repeats the place line, but
  // this describes the chart the panel is open on. (2026-10-02)
  const geoLines = (): ReactNode => {
    if (!geoFrame || !angles) return null;
    const ge = (lon: number): ReactNode => {
      if (maskGeAngles) return id.text('00°00\'');
      const z = truncZodiac(lon, 'min');
      return (
        <>
          {pad2(z.deg)}°<ZodiacGlyph sign={z.signIdx} size={11} />
          {pad2(z.min)}&#39;
        </>
      );
    };
    const system = houseSystem
      ? labels.houseSystem(angles.fallback ? 'porphyry' : houseSystem)
      : null;
    // Whose planets: a promoted overlay's bodies are another instant's, a composite's
    // are the composite's own; otherwise they are the chart's natal positions.
    const planetsLine = !system
      ? null
      : promotedLabel
        ? t('expandedSidebar.geodetic.planetsPromoted', { overlay: promotedLabel, system })
        : chart?.composite
          ? t('expandedSidebar.geodetic.planetsComposite', { system })
          : t('expandedSidebar.geodetic.planets', { system });
    return (
      <div className="es-geo-lines">
        <span className="es-geo-ge">
          <span className="es-geo-ge-tag">{t('expandedSidebar.geodetic.ge')}</span>
          {' · '}
          {t('map.geoReadout.as')} <span className="es-geo-val">{ge(angles.asc)}</span>
          {' · '}
          {t('map.geoReadout.mc')} <span className="es-geo-val">{ge(angles.mc)}</span>
        </span>
        {planetsLine && <span className="es-geo-planets">{planetsLine}</span>}
      </div>
    );
  };

  // The Dual layout's header over a synastry PARTNER's wheel: under the partner's
  // name (the line above, from overlaySubject), their own birth record in the panel
  // header's form — date · time with its UTC offset, then their birthplace and
  // coordinates in the natal colour — and then, set apart, the place their wheel is
  // cast for.
  //
  // That last line is the honest half. A partner's angles and houses are cast at
  // the active point — pin, else hover, else the ACTIVE chart's birthplace — not
  // at their own birthplace (docs/calculation-methods.md), so the header used to
  // show that point in the birth-record styling, and "Amara / Vienna" read as
  // Amara's birthplace when Vienna was Elena's (2026-09-30). Now the birth record
  // is the partner's, and where the wheel is cast gets its own line, coloured like the panel header's place
  // line — the same place, in the same colour — and shown only when it differs
  // from the partner's birthplace.
  //
  // A COMPOSITE partner has no "cast for": its angles are the midpoints of its two
  // parents' own angles and don't relocate (App's overlayAngles), so that line says
  // that instead. Its date line is the composite's stored moment, exactly as the
  // panel header shows a composite that is the active chart.
  //
  // Except on a geodetic map (2026-10-02). There every wheel is cast in the place's
  // own geodetic frame — App hands a composite partner `angles` like any other — so
  // the midpoint line would be false of the wheel drawn under it. The FRAME decides,
  // not the chart kind: a geodetic overlay frame takes the "Cast for" line, composite
  // or not.
  //
  // Discreet mode masks every field of the record — it is a second person's birth
  // data, which is what the mode exists for — with the panel header's own masks
  // (and the 2026-08-24 lesson above: mask where the value is rendered, all of it).
  // The "Cast for" place follows the panel header's place-line rule (castBlank).
  const partnerLines = (p: StoredChart): ReactNode => {
    const bp = p.birthplace;
    const wrapLng = (v: number) => ((((v + 180) % 360) + 360) % 360) - 180;
    const midpointFrame = !!p.composite && !overlayAngles?.geodetic;
    const castElsewhere =
      !midpointFrame &&
      !!castPoint &&
      (Math.abs(castPoint.lat - bp.lat) > 1e-4 ||
        Math.abs(wrapLng(castPoint.lng - bp.lng)) > 1e-4);
    const castCoords = castPoint ? `${fmtLat(castPoint.lat)} ${fmtLng(castPoint.lng)}` : '';
    // pointLabel can be momentarily empty while a hover geocode resolves; the
    // coordinates stand in, so the line never blinks out (header geometry, as above).
    const castPlace = castBlank
      ? id.text(pointLabel || 'birthplace')
      : pointLabel?.trim() || castCoords;
    return (
      <>
        <div className="es-meta">
          <span className="es-meta-when">
            {id.on ? `${MASK_DATE} · ${MASK_TIME}` : fmtChartDate(p, fmt)}
            {!id.on && <span className="es-meta-tz">{formatUtcOffset(p.tzOffset)}</span>}
            {p.tzUncertain && (
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
        <div className="es-relocated natal">
          <span className="es-relocated-place">
            <span className="es-relocated-name">
              {id.on ? id.text(bp.label || 'birthplace') : bp.label || ' '}
            </span>
          </span>
          <span className="es-relocated-text">
            {id.on
              ? `${id.text('00°00′N')} ${id.text('000°00′E')}`
              : `${fmtLat(bp.lat)} ${fmtLng(bp.lng)}`}
          </span>
        </div>
        {midpointFrame ? (
          <div className="es-cast-for">
            <span className="es-cast-for-label">
              {t('expandedSidebar.partnerHead.midpointAngles')}
            </span>
          </div>
        ) : (
          // The line carries its own explanation: both wheels are cast for this one
          // place, and choosing a point moves them (Salvatore, 2026-10-02 — the
          // fallback stays, so long as the reader is told they can cast elsewhere).
          // It names no place, so Discreet mode has nothing to mask in it. Inert, so a
          // tap reveals it; tabIndex lets keyboard focus reach it too. Mounted with
          // the line, so the hint never shows without it.
          castElsewhere && (
            <TipSpan
              className={`es-cast-for es-cast-for-tip ${castState}`}
              tabIndex={0}
              tapReveal
              tip={t('expandedSidebar.partnerHead.castForTip')}
              hint={t('expandedSidebar.partnerHead.castForHint')}
            >
              <span className="es-cast-for-label">
                {t('expandedSidebar.partnerHead.castFor')}
              </span>
              <span className="es-cast-for-place">{castPlace}</span>
            </TipSpan>
          )
        )}
      </>
    );
  };

  // The overlay's instant in the header's own date form ("10 Aug 2026 · 04:43"),
  // rather than the raw "YYYY-MM-DD HH:MM" the timeline hands over. The overlay is
  // always given in UTC — it has no birth zone of its own to be offset from — so
  // that stands where the chart's UTC offset does above.
  //
  // Synastry has no instant, and its partner's NAME takes the line instead (see
  // overlaySubject) — which is not a time, so it carries no UTC mark.
  const overlayWhen = (() => {
    const m = overlayMoment?.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) return overlayMoment ?? overlaySubject;
    return `${Number(m[3])} ${fmt.monthName(Number(m[2]))} ${m[1]} · ${m[4]}:${m[5]}`;
  })();

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
              flash={chartFlash}
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
          // On a geodetic map this is the first line of the data block (the rest is
          // relocatedLines and geoLines): GEODETIC · name · date · time. The name is here
          // as well as in the switcher above because the block is a record of what the
          // wheel is, read as one. A chart with no birth time says so in the time's place
          // — its planets are read at 12:00, and "12:00" would read as a recorded time —
          // and drops the UTC offset with it; a recorded time keeps its offset, as it is
          // the time's own qualifier and the ⚠ below is about it. The celestial header is
          // unchanged. (2026-10-02)
          <div className={`es-meta${geoMap ? ' es-geo-head' : ''}`}>
            <span className="es-meta-when">
              {geoMap && (
                <>
                  <b className="es-geo-title">{t('expandedSidebar.geodetic.title')}</b>
                  {' · '}
                  {id.on ? id.name(chart.name) : displayName(chart.name)}
                  {' · '}
                </>
              )}
              {/* Masked as date · time rather than through id.date() alone: this one
                  string carries both, and keeping the shape says "two things hidden
                  here" where a lone date mask would read as the time being absent. */}
              {id.on
                ? `${MASK_DATE} · ${MASK_TIME}`
                : geoMap && timeless
                  ? `${chart.day} ${fmt.monthName(chart.month)} ${chart.year} · ${t(
                      'expandedSidebar.timeUnknownNoon',
                    )}`
                  : fmtChartDate(chart, fmt)}
              {/* The offset drops out entirely while masked instead of trailing a
                  second run of dots — one mask per fact reads as hidden, two reads
                  as broken. */}
              {!id.on && !(geoMap && timeless) && (
                <span className="es-meta-tz">{formatUtcOffset(chart.tzOffset)}</span>
              )}
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
        {relocatedLines()}
        {geoLines()}

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
                  <div className="es-dial-caption">
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
                  <div className="es-dial-caption">
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
          // HELD on a geodetic map (lib/skyHold; the coord props then arrive null, so
          // lsPair is too): the slot keeps its caption, so the reason has a subject, and
          // says it with its fix in place of the dials. It outranks the tease, since no
          // upgrade would draw a dial on a geodetic map. The dials come back on Celestial
          // with nothing to redo. (2026-10-02)
          const lsHeld = localSpaceHeld ? (
            <>
              <div className="es-ls-head">
                <span className="es-overlay-caption">
                  {t('expandedSidebar.localSpace.caption')}
                </span>
              </div>
              <SkyHeldNote className="es-ls-held" onFix={onOpenCalc} />
            </>
          ) : null;
          const lsSlot = lsPair || lsHeld || lsTease;
          return (
            <>
              {/* Use the wheel's empty top corners: the chart-state title (left,
                  always) and, when an overlay is on, its caption (right — in
                  Dual Wheels the overlay is a chart in its own right and gets a
                  header of its own below, so this corner stays the natal one). */}
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
                  {timeUnknownShown && (
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
                  // Synastry has no moment and puts its partner's name on that line
                  // instead — same slot, so the layout is unchanged.
                  className={`es-wheel-corner es-wheel-corner-right${
                    momentText ? ' es-overlay-corner' : ''
                  }`}
                >
                  {momentText && (
                    <span
                      className={`es-overlay-moment${
                        overlayMoment ? '' : ' es-overlay-subject'
                      }`}
                    >
                      {momentText}
                    </span>
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
                  showDual || lsSlot ? ' es-wheel-pane-dual' : ''
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
                        minorBodies={minorBodies}
                        minorReserve={minorReserve}
                        detailed={true}
                        advanced={advanced}
                        aspectOrbs={aspectOrbs}
                        visibleAspects={visibleAspects}
                        visibleAngles={visibleAngles}
                        interactive
                        planetsOnly={planetsOnly && !angles}
                        maskAngleText={maskGeAngles}
                        bodyNotes={bodyNotes}
                        ranges={ranges}
                      />
                      {/* The overlay wheel is introduced the way the natal one is:
                          the same three header lines — instant, place, coordinates
                          — and then its own name in its top-left corner where the
                          chart-state title sits above. The two wheels are separate
                          charts in this layout, and the second was getting a
                          middot-joined caption where the first got a header.
                          Everything but the name is the SECOND chart's own: its
                          instant rather than the birth moment, and the place both
                          are cast for (which is a fact about this wheel's angles,
                          not a repetition of the one above). A synastry partner
                          is the one second chart with a birth record and a place
                          of its own, so it is introduced from that record, with
                          the cast-for place on a line apart (partnerLines). */}
                      <div className="es-overlay-head">
                        {overlayWhen && (
                          <div className="es-meta">
                            {/* When this line is a NAME rather than an instant it
                                is the second chart's name, and a chart's name is
                                the thing an astrologer reads first — so it takes
                                the weight the natal chart's own name has at the
                                top of the panel, instead of the quiet form a
                                date wants. */}
                            <span
                              className={`es-meta-when${
                                overlayMoment ? '' : ' es-overlay-chart-name'
                              }`}
                            >
                              {overlayWhen}
                              {/* Only a time is marked UTC. Synastry puts its
                                  partner's name on this line, and a name has no
                                  zone. */}
                              {overlayMoment && (
                                <span className="es-meta-tz">
                                  {t('expandedSidebar.utc')}
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                        {/* A partner is a person with a birthplace of their own,
                            so their header is their record (partnerLines); every other
                            second chart is a moment with no place, cast where the
                            first one is, and repeats the panel header's lines. */}
                        {overlayPartner ? partnerLines(overlayPartner) : relocatedLines()}
                      </div>
                      <div className="es-wheel-slot">
                        {overlayName && (
                          <div className="es-wheel-corner es-wheel-corner-left">
                            <span
                              className="es-wheel-title"
                              style={{ color: 'var(--map-accent)' }}
                            >
                              {overlayName}
                            </span>
                          </div>
                        )}
                        {/* No catalog bodies on this wheel: theirs were sampled at the
                            birth moment, and this chart is another instant's. */}
                        <WheelSvg
                          size={wheelSize}
                          angles={overlayAngles!}
                          planets={shownOverlay!}
                          detailed={true}
                          advanced={advanced}
                          aspectOrbs={aspectOrbs}
                          visibleAspects={visibleAspects}
                          visibleAngles={visibleAngles}
                          interactive
                          maskAngleText={castBlank && !!overlayAngles?.geodetic}
                        />
                      </div>
                      {lsSlot}
                    </>
                  ) : (
                    <>
                      <WheelSvg
                        size={wheelSize}
                        angles={frame}

                        planets={shownPlanets}
                        minorBodies={minorBodies}
                        minorReserve={minorReserve}
                        detailed={true}
                        advanced={advanced}
                        aspectOrbs={aspectOrbs}
                        overlayPlanets={shownOverlay}
                        overlayAngles={overlayAngles}
                        visibleAspects={visibleAspects}
                        visibleAngles={visibleAngles}
                        interactive
                        planetsOnly={planetsOnly && !angles}
                        maskAngleText={maskGeAngles}
                        bodyNotes={bodyNotes}
                        ranges={ranges}
                      />
                      {lsSlot}
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
          first, then the catalog minor bodies, then the visible angles (Mc, Ic,
          As, Ds) tack onto the end of the same list. The angles also render in
          the wheel above. */}
      {frame &&
        (shownPlanets.length > 0 || minorBodies.length > 0 || shownAngleRows.length > 0) && (
        <section className="es-section es-section-details">
          {positionsBlock(
            shownPlanets,
            advancedCoords,
            shownAngleRows,
            angleCoords,
            posSort,
            (key) => setPosSort((s) => nextSort(s, key)),
            minorBodies,
            minorCoords,
            bodyNotes,
            ranges,
          )}
          {/* The overlay's own positions, one press away. Same block, same
              columns, same sort gesture — the overlay is a chart too, and the
              question "where is transiting Mars, exactly" had no answer in this
              panel before. Folded shut by default so it costs nothing until it
              is wanted. */}
          {overlayAdvancedCoords && shownOverlay && shownOverlay.length > 0 && (
            <div className="es-overlay-positions">
              <button
                type="button"
                className={`es-disclosure${ovPosOpen ? ' open' : ''}`}
                aria-expanded={ovPosOpen}
                onClick={() => setOvPosOpen((v) => !v)}
              >
                <span className="es-disclosure-caret" aria-hidden="true">
                  ▸
                </span>
                {t('expandedSidebar.overlayPositions', {
                  overlay: overlayName ?? t('expandedSidebar.overlaySuffix'),
                })}
              </button>
              {ovPosOpen &&
                positionsBlock(
                  shownOverlay,
                  overlayAdvancedCoords,
                  shownOverlayAngleRows,
                  overlayAngleCoords,
                  ovPosSort,
                  (key) => setOvPosSort((s) => nextSort(s, key)),
                )}
            </div>
          )}
        </section>
      )}

      {frame && shownPlanets.length > 0 && (
        <section className="es-section es-section-balance">
          <TipHeading
            tip={t('expandedSidebar.balanceTip')}
            hint={t('expandedSidebar.balanceHint')}
          >
            {t('expandedSidebar.balanceHeading')}
          </TipHeading>
          {/* The built-in bodies only. The catalog minor bodies are placed in the
              chart but not counted: with them in, the tallies would measure how many
              bodies are switched on rather than the chart (calculation-methods.md). */}
          {balanceBlock(shownPlanets)}
          {/* The SECOND chart's balance, one press away. Same block, same
              groupings, its own bodies — the overlay is a chart too, and "how is
              that one weighted" had no answer in this panel before. Folded shut
              by default, like the overlay's positions table above it, so it costs
              nothing until it is wanted (2026-08-24). */}
          {shownOverlay && shownOverlay.length > 0 && (
            <div className="es-overlay-balance">
              <button
                type="button"
                className={`es-disclosure${ovBalOpen ? ' open' : ''}`}
                aria-expanded={ovBalOpen}
                onClick={() => setOvBalOpen((v) => !v)}
              >
                <span className="es-disclosure-caret" aria-hidden="true">
                  ▸
                </span>
                {t('expandedSidebar.overlayBalance', {
                  overlay: overlayName ?? t('expandedSidebar.overlaySuffix'),
                })}
              </button>
              {ovBalOpen && balanceBlock(shownOverlay)}
            </div>
          )}
        </section>
      )}

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
        // The SECOND chart's OWN aspects — the web the overlay wheel draws for
        // itself, which nothing below the wheel listed before 2026-08-24. Three
        // different questions live in a row here and each gets its own list: this
        // chart's aspects (below), the overlay's aspects (the fold under them),
        // and the contacts BETWEEN the two (the section after).
        const ownOverlay = shownOverlay
          ? computeAspects(shownOverlay, aspectOrbs)
              .filter(vis)
              .sort((x, y) => x.orb - y.orb)
          : [];
        // ownOverlay counts here too: a chart with no aspects of its own must not
        // take the overlay's list down with it.
        if (lonAspects.length + decAspects.length + azOnly.length + ownOverlay.length === 0) {
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
          // BOTH frames are recomputed at the table's own orb (see
          // COMPARE_ORB_DEFAULT) — comparing two frames only works if the same
          // orb was asked of each, and the whole question is what a pair does
          // between them, which a narrow orb answers by dropping one side. Only
          // the five aspect orbs move; the luminary widener is the reader's and
          // rides along, and the declination orb is untouched because
          // declination pairs sit this table out. Nothing else in the app sees
          // this table: the combined list above still reads the app's own orbs.
          const cmpOrbs: AspectOrbs = {
            ...aspectOrbs,
            orbs: {
              conjunction: compareOrb,
              opposition: compareOrb,
              trine: compareOrb,
              square: compareOrb,
              sextile: compareOrb,
            },
          };
          const natCmp = computeAspects(shownPlanets, cmpOrbs);
          const azCmp = computeAzimuthAspects(shownPlanets, lsAzimuths!, cmpOrbs);
          // One row per PAIR: fold each pair's two frames onto one line. The
          // statuses read off presence + type equality; the Δ column is the
          // signed orb change (negative = closer to exact in local space).
          const pairKey = (a: Aspect) => [a.a, a.b].sort().join('|');
          const natPairs = new Map(natCmp.map((a) => [pairKey(a), a] as const));
          const azPairs = new Map(azCmp.map((a) => [pairKey(a), a] as const));
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
                {/* Same cue the positions table's headers wear. This table's sort
                    is never off — one column is always active — so the cue marks
                    the four columns you could move to. */}
                <SortCue />
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
                {/* Rides at the far right of the pills row rather than in a row
                    of its own — the panel is a column of readings and a control
                    strip per table would crowd them out. */}
                <span className="es-compare-orb">
                  <HintMenu
                    value={String(compareOrb)}
                    onChange={(v) => setCompareOrb(Number(v))}
                    options={COMPARE_ORBS.map((o) => ({
                      value: String(o),
                      label: t('expandedSidebar.localSpace.orbValue', { deg: o }),
                      hint:
                        o === COMPARE_ORB_DEFAULT
                          ? t('expandedSidebar.localSpace.orbDefaultHint')
                          : t('expandedSidebar.localSpace.orbOptionHint', { deg: o }),
                    }))}
                    triggerTip={{
                      title: (
                        <span className="es-tip-title">
                          {t('expandedSidebar.localSpace.orbTip')}
                        </span>
                      ),
                      hint: t('expandedSidebar.localSpace.orbHint'),
                    }}
                  />
                </span>
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
          const sortedRows = sortAspects(rows, aspectSort);
          body = (
            <>
              <SortStrip
                label={t('expandedSidebar.sortBy')}
                sort={aspectSort}
                onSort={(key) => setAspectSort((s) => nextSort(s, key))}
                options={[
                  { key: 'pair', label: t('expandedSidebar.sort.pair'), hint: t('expandedSidebar.sort.pairHint') },
                  { key: 'type', label: t('expandedSidebar.sort.type'), hint: t('expandedSidebar.sort.typeHint') },
                  { key: 'orb', label: t('expandedSidebar.sort.orb'), hint: t('expandedSidebar.sort.orbHint') },
                ]}
              />
              <ul className="es-aspect-list">
                {sortedRows.map((a, i) => {
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
            </>
          );
        }

        return (
          <section className="es-section es-section-aspects">
            {/* The chart's own heading and list appear only when it HAS aspects.
                A narrow body filter can leave this chart with none while the
                overlay still has some (two charts, two geometries), and the
                section then exists to hold the fold below — "Aspects (0)" over an
                empty list and a live sort strip would be furniture claiming a
                reading. */}
            {count > 0 && (
              <>
              <div className="es-aspect-head">
                <TipHeading
                  tip={t('expandedSidebar.aspectsTip')}
                  hint={t('expandedSidebar.aspectsHint')}
                >
                  {t('expandedSidebar.aspectsCount', { count })}
                </TipHeading>
                {/* Held with Local Space on a geodetic map (lib/skyHold): the frames
                    arrive empty, so the switch would otherwise vanish with them. It
                    stays, greyed with the reason and showing the stored choice, and
                    a click does nothing; the table is back on Celestial. Not where the
                    tier withholds it (localSpaceGated): Celestial wouldn't show it
                    either. (2026-10-05) */}
                {(azByKey || (localSpaceHeld && !localSpaceGated)) && (
                  <TipButton
                    type="button"
                    className={`es-advanced-toggle es-frames-toggle ${splitFrames ? 'on' : 'off'}${localSpaceHeld ? ' is-held' : ''}`}
                    onClick={localSpaceHeld ? undefined : () => setSplitFrames(!splitFrames)}
                    role="switch"
                    aria-checked={splitFrames}
                    aria-disabled={localSpaceHeld || undefined}
                    placement="bottom"
                    gated
                    tip={t('expandedSidebar.localSpace.compareTip')}
                    hint={t('expandedSidebar.localSpace.compareHint')}
                    note={localSpaceHeld ? t('settings.inert.skyHeld') : undefined}
                    unavailable={localSpaceHeld}
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
              </>
            )}
            {/* The overlay's own aspects, one press away — same rows, same sort
                gesture, its own bodies. Both glyphs carry the "(overlay)" suffix,
                because every pair in this list is overlay-to-overlay; the section
                below, where only the FIRST glyph carries it, is the one that
                crosses the two charts. */}
            {ownOverlay.length > 0 && (
              <div className="es-overlay-aspects">
                {/* A TipButton rather than a bare disclosure, unlike the balance
                    and positions folds: this label and the heading of the section
                    directly below it both name the overlay, and only the hover
                    says which of them crosses the two charts. */}
                <TipButton
                  type="button"
                  className={`es-disclosure${ovAspOpen ? ' open' : ''}`}
                  aria-expanded={ovAspOpen}
                  onClick={() => setOvAspOpen((v) => !v)}
                  placement="top"
                  tip={t('expandedSidebar.overlayOwnAspectsTip')}
                  hint={t('expandedSidebar.overlayOwnAspectsHint')}
                >
                  <span className="es-disclosure-caret" aria-hidden="true">
                    ▸
                  </span>
                  {t('expandedSidebar.overlayOwnAspects', {
                    overlay: overlayName ?? t('expandedSidebar.overlaySuffix'),
                    count: ownOverlay.length,
                  })}
                </TipButton>
                {ovAspOpen && (
                  <>
                    <SortStrip
                      label={t('expandedSidebar.sortBy')}
                      sort={ovAspSort}
                      onSort={(key) => setOvAspSort((so) => nextSort(so, key))}
                      options={[
                        { key: 'pair', label: t('expandedSidebar.sort.pair'), hint: t('expandedSidebar.sort.pairHint') },
                        { key: 'type', label: t('expandedSidebar.sort.type'), hint: t('expandedSidebar.sort.typeHint') },
                        { key: 'orb', label: t('expandedSidebar.sort.orb'), hint: t('expandedSidebar.sort.orbHint') },
                      ]}
                    />
                    <ul className="es-aspect-list">
                      {sortAspects(ownOverlay, ovAspSort).map((a, i) => (
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
                            className="asp-planet asp-planet-overlay"
                            suffix={t('expandedSidebar.overlaySuffix')}
                          />
                          <span className="asp-type">{a.type}</span>
                          <span className="asp-orb">{fmtOrb(a.orb)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
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
            {/* Same strip as the list above, with its own state: sorting the
                contacts should not disturb the natal aspects, and the two are
                read against each other. 'Pair' groups by the OVERLAY body here —
                the subject of the contact, and the column the list leads with. */}
            <SortStrip
              label={t('expandedSidebar.sortBy')}
              sort={crossSort}
              onSort={(key) => setCrossSort((s) => nextSort(s, key))}
              options={[
                { key: 'pair', label: t('expandedSidebar.sort.pair'), hint: t('expandedSidebar.sort.crossPairHint') },
                { key: 'type', label: t('expandedSidebar.sort.type'), hint: t('expandedSidebar.sort.typeHint') },
                { key: 'orb', label: t('expandedSidebar.sort.orb'), hint: t('expandedSidebar.sort.orbHint') },
              ]}
            />
            <ul className="es-aspect-list">
              {sortAspects(cross, crossSort).map((a, i) => (
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
