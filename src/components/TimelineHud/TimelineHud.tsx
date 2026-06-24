// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  minorStepMs,
  OVERLAY_LABEL_PREFIX,
  TIME_UNITS,
  type AngleProgression,
  type OverlayMode,
  type PrimaryRate,
  type TimeUnit,
  type TransitFrame,
} from '../../lib/astro/timeline';
import type { LineSystem } from '../../lib/ephemeris';
import { findReturn, type ReturnBody } from '../../lib/astro/returns';
import type { StoredChart } from '../../lib/chartLibrary';
import { PLANET_GLYPHS } from '../../lib/astro/glyphChars';
import {
  formatUtcOffset,
  offsetHoursAt,
  zoneLabelAt,
} from '../../lib/atlas/timezone';
import { useMovableHud } from '../../lib/useMovableHud';
import { useTouchLayout } from '../../lib/touch';
import { useOverlayBarGap } from '../../lib/useOverlayBarGap';
import { TipButton, TipSpan } from '../ui/HoverTip';
import { EyeIcon } from '../ui/EyeIcon';
import { ClickIcon } from '../ui/ClickIcon';
import {
  HintMenu,
  StepperField,
  ANGLE_PROGRESSION_VALUES,
  PRIMARY_RATE_VALUES,
} from '../Sidebar/Sidebar';
import { TimelineDateModal } from '../TimelineDateModal/TimelineDateModal';
import { useT } from '../../i18n';
import './TimelineHud.css';

// Active map location state, shared with the map edge-glow — drives the HUD
// border color (blue hover / orange pinned / green natal-pinned).
export type MapState = 'natal' | 'hover' | 'pinned' | 'natal-pinned';

interface TimelineHudProps {
  /** Drives the slider range + birth anchor; the mode picker itself lives in the
   *  top bar now. Only time modes (transits/progressed/solar-arc) render this HUD. */
  overlayMode: OverlayMode;
  mapState: MapState;
  targetDate: number;
  setTargetDate: (ms: number) => void;
  stepUnit: TimeUnit;
  setStepUnit: (u: TimeUnit) => void;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  charts: StoredChart[];
  currentId: string | null;
  /** Dynamic measure for the readout ("Age 32.0" / "30.2°"); null hides it. */
  overlayMeasure: string | null;
  /** When false, collapse to just the draggable nub (no ruler / transport). */
  showTimeline: boolean;
  /** Toggle showTimeline — fired by the eye button on the nub's right edge (the
   *  bar's show/hide control lives here now rather than in Settings). */
  onToggleTimeline: () => void;
  /** Snap the target date to a solar/lunar return (dir 0 = nearest, ±1 = next/
   *  previous). Transits mode only — the Returns group hides otherwise. */
  onSnapReturn: (body: ReturnBody, dir: -1 | 0 | 1) => void;
  /** Transit framing (Relative-to-natal ↔ Absolute/transit-moment), flipped by the
   *  switch in the transits returns row. `lineSystem` gates that switch: framing only
   *  has an effect on Celestial lines, so it's hidden for Mundane/Geodetic. */
  transitFrame: TransitFrame;
  setTransitFrame: (f: TransitFrame) => void;
  lineSystem: LineSystem;
  /** The overlay's two display toggles, relocated from Settings ▸ Display into the
   *  bar's right-side drawer: the natal chart linework and this overlay's zenith
   *  stamps. (Synastry/eclipses don't render this HUD, so they keep their own UI.) */
  showNatal: boolean;
  setShowNatal: (v: boolean) => void;
  showOverlayZenith: boolean;
  setShowOverlayZenith: (v: boolean) => void;
  /** Chart-Angle method (Solar Arc / Progressed / Tertiary) and the Primary-Directions
   *  rate, relocated from the Calculations tab into this bar's bottom settings row —
   *  each shown only for the overlay that consumes it. */
  angleProgression: AngleProgression;
  setAngleProgression: (a: AngleProgression) => void;
  primaryRate: PrimaryRate;
  setPrimaryRate: (r: PrimaryRate) => void;
  userPrimaryRate: number;
  setUserPrimaryRate: (deg: number) => void;
  /** ADVANCED-ONLY master flag for this bar: when false the right-side display drawer
   *  (Natal/Zenith toggles) and the Relative/Absolute positioning control are HIDDEN, and
   *  their values default (App feeds eff* defaults to the map); when true they're restored. */
  advanced: boolean;
}

const UNIT_OPTIONS: TimeUnit[] = ['minute', 'hour', 'day', 'week', 'month', 'year'];

// Catalog keys for the draggable nub's per-mode name (timeline.nubMode.*).
const NUB_LABEL_KEY = {
  transits: 'timeline.nubMode.transits',
  progressed: 'timeline.nubMode.progressed',
  'tertiary-progressed': 'timeline.nubMode.tertiary-progressed',
  'solar-arc': 'timeline.nubMode.solar-arc',
  'primary-directions': 'timeline.nubMode.primary-directions',
  cyclo: 'timeline.nubMode.cyclo',
} as const;

// Midnight-UTC epoch ms of a chart's civil birth date — the timeline's birth
// anchor. Built via setUTCFullYear because Date.UTC()/new Date() remap years
// 0–99 to 1900–1999, which would fling an ancient chart (year 1+) ~1900 years
// forward and break the slider range, the age readout, and the directed chart.
function birthDateUTCms(c: { year: number; month: number; day: number }): number {
  const d = new Date(Date.UTC(2000, c.month - 1, c.day));
  d.setUTCFullYear(c.year);
  return d.getTime();
}

// Per-minor-notch pixel spacing (UI tuning). Major spacing = px × subdiv.
const RULER_PX: Record<TimeUnit, number> = {
  minute: 14,
  hour: 12,
  day: 16,
  week: 11,
  month: 14,
  year: 8,
};

// The human description of one minor notch (= one default Step / one tick) per
// scale now lives in the catalog (timeline.minorLabel.*).

// The base unit each scale's mini-notch is measured in, plus the default count
// of that base per mini-notch. The step-size box defaults to `count` and lets
// the user override how many base-units one Step press advances — purely the
// step increment; it doesn't redraw the ruler. (count × baseMs ≈ minorStepMs.)
const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
// `label` is the compact symbol shown in the step box; `unit` is the base unit's full
// key, used for the spelled-out word in the transport tooltips (timeline.stepWords.*).
const STEP_UNIT: Record<
  TimeUnit,
  { count: number; baseMs: number; label: string; unit: TimeUnit }
> = {
  minute: { count: 1, baseMs: MIN_MS, label: 'min', unit: 'minute' },
  hour: { count: 10, baseMs: MIN_MS, label: 'min', unit: 'minute' },
  day: { count: 6, baseMs: HOUR_MS, label: 'h', unit: 'hour' },
  week: { count: 1, baseMs: DAY_MS, label: 'd', unit: 'day' },
  month: { count: 5, baseMs: DAY_MS, label: 'd', unit: 'day' },
  year: { count: 1, baseMs: 30 * DAY_MS, label: 'mo', unit: 'month' },
};

const YEAR_MS = 365.2425 * 86_400_000;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Label for a major (labeled) notch, formatted to suit the granularity. Month names
// come from the active locale (fmt.monthAbbr), passed in since this isn't a component.
function fmtTick(
  ms: number,
  unit: TimeUnit,
  monthAbbr: (month1to12: number) => string,
): string {
  const d = new Date(ms);
  if (unit === 'minute')
    return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  if (unit === 'hour') return `${pad2(d.getUTCHours())}:00`;
  if (unit === 'year') return String(d.getUTCFullYear());
  if (unit === 'month')
    return `${monthAbbr(d.getUTCMonth() + 1)} ’${String(d.getUTCFullYear()).slice(2)}`;
  return `${d.getUTCDate()} ${monthAbbr(d.getUTCMonth() + 1)}`;
}

// A compass-style ruler scrubber: a fixed center needle with a grid of notches
// scrolling beneath it as you drag. Major (labeled) notches mark the selected
// unit; minor notches subdivide it. Notches sit on a stable epoch-anchored grid
// so they don't jitter; the needle floats freely for fine, dynamic scrubbing.
// Drag left → forward in time.
function TimeRuler({
  value,
  min,
  max,
  unit,
  onChange,
  onDragStart,
}: {
  value: number;
  min: number;
  max: number;
  unit: TimeUnit;
  onChange: (ms: number) => void;
  onDragStart: () => void;
}) {
  const { t, fmt } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const dragRef = useRef<{ startX: number; startVal: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e) setW(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { subdiv } = TIME_UNITS[unit];
  const minorMs = minorStepMs(unit);
  const px = RULER_PX[unit];
  const center = w / 2;
  const clamp = (ms: number) => Math.min(Math.max(ms, min), max);

  // Minor notches at k * minorMs (epoch-anchored). A notch is major when k is a
  // multiple of subdiv. Render those whose screen x lands within the strip.
  const valSteps = value / minorMs;
  const span = (center + 24) / px;
  const kStart = Math.floor(valSteps - span);
  const kEnd = Math.ceil(valSteps + span);
  const ticks: { x: number; isMajor: boolean; label: string | null }[] = [];
  for (let k = kStart; k <= kEnd; k++) {
    const tickValue = k * minorMs;
    if (tickValue < min - minorMs || tickValue > max + minorMs) continue;
    const x = center + (k - valSteps) * px;
    const isMajor = ((k % subdiv) + subdiv) % subdiv === 0;
    ticks.push({
      x,
      isMajor,
      label: isMajor ? fmtTick(tickValue, unit, fmt.monthAbbr) : null,
    });
  }

  const onDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startVal: value };
    onDragStart();
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    onChange(clamp(d.startVal - (dx / px) * minorMs));
  };
  const onUp = (e: ReactPointerEvent) => {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      className="thud-ruler"
      ref={ref}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={t('timeline.ruler.aria')}
    >
      {ticks.map((t, i) => (
        <div
          key={i}
          className={`thud-tick ${t.isMajor ? 'major' : ''}`}
          style={{ left: `${t.x}px` }}
        >
          {t.label && <span className="thud-tick-label">{t.label}</span>}
        </div>
      ))}
      <div className="thud-needle" />
    </div>
  );
}

export function TimelineHud({
  overlayMode,
  mapState,
  targetDate,
  setTargetDate,
  stepUnit,
  setStepUnit,
  playing,
  setPlaying,
  charts,
  currentId,
  overlayMeasure,
  showTimeline,
  onToggleTimeline,
  onSnapReturn,
  transitFrame,
  setTransitFrame,
  lineSystem,
  showNatal,
  setShowNatal,
  showOverlayZenith,
  setShowOverlayZenith,
  angleProgression,
  setAngleProgression,
  primaryRate,
  setPrimaryRate,
  userPrimaryRate,
  setUserPrimaryRate,
  advanced,
}: TimelineHudProps) {
  const { t, fmt, labels } = useT();
  const current = charts.find((c) => c.id === currentId) ?? null;
  // Dropdowns relocated from the Calculations tab into the bottom settings row
  // (each shown per-overlay below): Chart Angle for the directed sets, Rate for primaries.
  const chartAngleOptions = ANGLE_PROGRESSION_VALUES.map((value) => ({
    value,
    label: labels.chartAngle(value),
    hint: labels.chartAngleHint(value),
  }));
  const primaryRateOptions = PRIMARY_RATE_VALUES.map((value) => ({
    value,
    label: labels.primaryRate(value),
    hint: labels.primaryRateHint(value),
  }));
  const [pickerOpen, setPickerOpen] = useState(false);
  // The right-side display drawer (Natal + Zenith toggles) — closed by default. On TOUCH the same
  // drawer (chevron tab + toggles) is reused INLINE on the settings/returns row (see
  // displayDrawerInline) so the toggles populate in the bar; this one drawerOpen drives both.
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The drawer animates open by transitioning its width 0 → the toggles' natural
  // width, which we measure here. (A shrink-to-fit absolutely-positioned box can't
  // use the pure-CSS grid 0fr→1fr trick: 1fr has no free space to expand into, so it
  // stays collapsed.) Re-measured when the toggle labels change — e.g. the overlay's
  // Zenith prefix (Tr/Sp/CCG…) — so the open width always fits.
  const drawerTogglesRef = useRef<HTMLDivElement>(null);
  const [drawerWidth, setDrawerWidth] = useState(0);
  // useLayoutEffect (not useEffect) so the width is committed before the first paint —
  // the first open then animates and can't race a click. getBoundingClientRect →
  // Math.ceil avoids offsetWidth's integer truncation shaving ~1px off the last toggle.
  useLayoutEffect(() => {
    const el = drawerTogglesRef.current;
    if (!el) return;
    // Ignore zero readings (e.g. while the drawer is display:none — hidden when the
    // bar is collapsed) so the last good width is kept and a reopen animates at once.
    const measure = () => {
      const next = Math.ceil(el.getBoundingClientRect().width);
      if (next > 0) setDrawerWidth(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Read "now" once at mount: calling Date.now() during render makes render
  // impure, and a ±50-year slider doesn't care about sub-second drift.
  const [nowMs] = useState(() => Date.now());
  const birthMs = current ? birthDateUTCms(current) : nowMs;
  const sliderMin =
    overlayMode === 'transits' ? nowMs - 50 * YEAR_MS : birthMs;
  const sliderMax =
    overlayMode === 'transits'
      ? nowMs + 50 * YEAR_MS
      : birthMs + 100 * YEAR_MS;

  const clamp = (ms: number) => Math.min(Math.max(ms, sliderMin), sliderMax);

  // Show the bar in the ACTIVE chart's time zone (targetDate itself stays the UTC
  // instant — this is display-only). DST-aware via the chart's IANA zone at the
  // shown moment; only a zone-less legacy chart falls back to its fixed offset. No
  // chart → UTC. offsetMs shifts the ruler/field into local wall-clock and back.
  const tzInstant = clamp(targetDate);
  const tzHours = !current
    ? 0
    : current.tzIana
      ? offsetHoursAt(current.tzIana, tzInstant)
      : current.tzOffset;
  const offsetMs = tzHours * 3_600_000;
  const tzLabel = !current
    ? 'UTC'
    : current.tzIana
      ? zoneLabelAt(current.tzIana, tzInstant)
      : formatUtcOffset(current.tzOffset);

  // The date button's readout, in the chart's zone (display ms = target + offset,
  // read in UTC) — e.g. "5 Jun 1941, 09:30". The picker modal does the inverse.
  const dispDate = new Date(targetDate + offsetMs);
  const dateLabel = `${dispDate.getUTCDate()} ${fmt.monthAbbr(
    dispDate.getUTCMonth() + 1,
  )} ${dispDate.getUTCFullYear()}, ${pad2(dispDate.getUTCHours())}:${pad2(
    dispDate.getUTCMinutes(),
  )}`;
  // Year clamp for the picker's spinner, from the slider's own range.
  const yearMin = new Date(sliderMin).getUTCFullYear();
  const yearMax = new Date(sliderMax).getUTCFullYear();

  // Step increment: defaults to the scale's mini-notch (count × baseMs), but the
  // user can override the count in the box next to the step buttons. Reset to the
  // unit's default whenever the scale changes. The override only affects the step
  // amount — the ruler still draws its fixed mini-notches.
  const stepBase = STEP_UNIT[stepUnit];
  const [stepCount, setStepCount] = useState(stepBase.count);
  // Reset the override to the scale's default when the unit changes. Tracked
  // during render (comparing the previous unit) rather than in an effect, so
  // there's no extra commit with a stale count.
  const [countUnit, setCountUnit] = useState(stepUnit);
  if (countUnit !== stepUnit) {
    setCountUnit(stepUnit);
    setStepCount(stepBase.count);
  }
  const stepMs =
    Number.isFinite(stepCount) && stepCount > 0
      ? stepCount * stepBase.baseMs
      : minorStepMs(stepUnit);
  const step = (dir: 1 | -1) => setTargetDate(clamp(targetDate + dir * stepMs));

  // The readout shows only the dynamic measure (Age / arc°). Transits passes null
  // — its state is already clear from the date field.
  const readout = overlayMeasure;
  // The spelled-out base unit for the transport tooltips ("Step forward 5 days" /
  // "1 month"), pluralized by the count — the compact step box keeps the symbol.
  const stepWord = (n: number) =>
    t(`timeline.stepWords.${stepBase.unit}.${n === 1 ? 'one' : 'other'}`);
  const modeLabel =
    overlayMode in NUB_LABEL_KEY
      ? t(NUB_LABEL_KEY[overlayMode as keyof typeof NUB_LABEL_KEY])
      : t('timeline.nubFallback');
  // The zenith toggle names the ACTIVE overlay's zenith — "Tr Zenith", "Sp Zenith",
  // "CCG Zenith" … — using the same two-letter map tag, except cyclo spells out as
  // "CCG" (its 'Cy' tag is reserved for mixed-source parans). (Moved here verbatim
  // from the old Settings ▸ Display toggle.)
  const zenithLabel = (
    `${
      overlayMode === 'off'
        ? ''
        : overlayMode === 'cyclo'
          ? 'CCG'
          : OVERLAY_LABEL_PREFIX[overlayMode]
    } ${t('settings.overlayZenith.title')}`
  ).trim();

  // ── Draggable bar ──────────────────────────────────────────────────────
  // The nub is the move handle. Position is shared with the synastry bar (same
  // bottom slot) via useMovableHud, so flipping overlay modes keeps the bar
  // wherever it was dragged.
  const hudRef = useRef<HTMLDivElement>(null);
  const { pos, dragging, handleProps } = useMovableHud(hudRef);
  // Publish this bar's height so the map's zoom-out pill lifts above it on touch.
  useOverlayBarGap(hudRef);

  // Highlight the Solar / Lunar snap button when the selected date sits ON that
  // luminary's return — a snap lands exactly on it, and a one-minute window keeps the
  // cue while you're effectively there. Transits only (the Returns row hides otherwise).
  const activeReturn = useMemo<ReturnBody | null>(() => {
    if (overlayMode !== 'transits' || !current) return null;
    return (
      (['solar', 'lunar'] as const).find((body) => {
        const r = findReturn(current, body, targetDate, 0);
        return r != null && Math.abs(r.ms - targetDate) <= 60_000;
      }) ?? null
    );
  }, [overlayMode, current, targetDate]);

  // One luminary's return controls: ‹ prev · the named snap button · next ›. Shared by
  // the Solar (left) and Lunar (right) groups that flank the centred "Returns" label.
  const returnGroup = (body: ReturnBody) => (
    <span key={body} className="thud-return-group">
      <TipButton
        type="button"
        className="thud-step-btn"
        onClick={() => onSnapReturn(body, -1)}
        aria-label={t(`timeline.returns.${body}.prevAria`)}
        placement="top"
        tip={t(`timeline.returns.${body}.prev`)}
      >
        ‹
      </TipButton>
      <TipButton
        type="button"
        className={`thud-return-btn${activeReturn === body ? ' active' : ''}`}
        onClick={() => onSnapReturn(body, 0)}
        aria-label={t(`timeline.returns.${body}.snapAria`)}
        placement="top"
        tip={t(`timeline.returns.${body}.snap`)}
      >
        <span className="astro-glyph" aria-hidden="true">
          {PLANET_GLYPHS[body === 'solar' ? 'Sun' : 'Moon']}
        </span>
        {t(`timeline.returns.${body}.name`)}
      </TipButton>
      <TipButton
        type="button"
        className="thud-step-btn"
        onClick={() => onSnapReturn(body, 1)}
        aria-label={t(`timeline.returns.${body}.nextAria`)}
        placement="top"
        tip={t(`timeline.returns.${body}.next`)}
      >
        ›
      </TipButton>
    </span>
  );

  const touch = useTouchLayout();
  // Modes that render a settings/returns second row — on touch the display toggles ride on the
  // RIGHT of that row rather than spawning a separate third row. Cyclo (and any future mode with
  // no second row) falls back to a dedicated toggle row below.
  const hasSettingsRow =
    overlayMode === 'transits' ||
    overlayMode === 'solar-arc' ||
    overlayMode === 'progressed' ||
    overlayMode === 'tertiary-progressed' ||
    overlayMode === 'primary-directions';
  // The two display toggles (Natal linework + this overlay's Zenith stamps). On desktop they
  // live in the right-side slide-out drawer; on touch we drop that drawer and lay these inline
  // in a bottom row of the bar (there's room now the bar is wider) — same buttons either way.
  const displayToggles = (
    <>
      <TipButton
        type="button"
        className={`thud-drawer-toggle ${showNatal ? 'on' : 'off'}`}
        placement="top"
        tip={t('settings.natal.title')}
        hint={t('settings.natal.hint')}
        aria-label={t('settings.natal.title')}
        aria-pressed={showNatal}
        onClick={() => setShowNatal(!showNatal)}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <EyeIcon open={showNatal} />
        <span className="thud-drawer-toggle-name">{t('settings.natal.title')}</span>
      </TipButton>
      {/* ADVANCED-ONLY: the overlay Zenith toggle is hidden when Advanced is off; its value
          defaults via effShowOverlayZenith. The Natal toggle above is always available. */}
      {advanced && (
        <TipButton
          type="button"
          className={`thud-drawer-toggle ${showOverlayZenith ? 'on' : 'off'}`}
          placement="top"
          advanced
          tip={zenithLabel}
          hint={t('settings.overlayZenith.hint')}
          aria-label={zenithLabel}
          aria-pressed={showOverlayZenith}
          onClick={() => setShowOverlayZenith(!showOverlayZenith)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <EyeIcon open={showOverlayZenith} />
          <span className="thud-drawer-toggle-name">{zenithLabel}</span>
        </TipButton>
      )}
    </>
  );
  // Touch: reuse the desktop display drawer INLINE — used ONLY on the transits returns row, whose
  // returns + positioning already fill the row, so showing the toggles there would push them onto
  // a THIRD row. The chevron tab keeps the bar two rows until tapped, then the same toggles
  // populate IN the bar beside it. (Other modes have a roomy second row, so they just show the
  // toggles inline with no chevron — see below.) Shares drawerOpen with the desktop slide-out.
  const displayDrawerInline = (
    <div className={`thud-drawer-inline${drawerOpen ? ' is-open' : ''}`}>
      <TipButton
        type="button"
        className="thud-drawer-tab"
        placement="top"
        tip={t(drawerOpen ? 'timeline.drawer.hide' : 'timeline.drawer.show')}
        aria-label={t(drawerOpen ? 'timeline.drawer.hide' : 'timeline.drawer.show')}
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen((o) => !o)}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="thud-drawer-chevron" aria-hidden="true">
          {drawerOpen ? '‹' : '›'}
        </span>
      </TipButton>
      {drawerOpen && <div className="thud-drawer-toggles">{displayToggles}</div>}
    </div>
  );
  return (
    <div
      className={`timeline-hud thud-bar${dragging ? ' thud-dragging' : ''}${
        showTimeline ? '' : ' thud-collapsed'
      }`}
      data-mode={overlayMode}
      data-mapstate={mapState}
      ref={hudRef}
      style={
        pos
          ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', transform: 'none' }
          : undefined
      }
    >
      {/* The overlay-mode nub protrudes from the top of the bar. It names the
          active mode (and shows its dynamic measure, if any) and is the move
          handle: grab to float the bar, release near home to snap back. */}
      {/* Not a button: drag/dock is a sighted-only pointer convenience (the
          overlay mode is independently set/shown in the top bar), so we leave the
          element's accessible name as its visible readout — "Transits", "Age 32.0"
          — rather than overriding it with a drag instruction AT users can't act on. */}
      <div className="thud-measure" {...handleProps}>
        <span className="hud-grip" aria-hidden="true" />
        <span className="thud-measure-label">{modeLabel}</span>
        {readout && <span className="thud-measure-value">{readout}</span>}
        {/* Show/hide the ruler + transport (the bar's old Settings toggle, moved
            here so it's reachable while the bar is collapsed). stopPropagation keeps
            a tap/double-tap on the eye from starting a nub drag or re-centre. */}
        <TipButton
          type="button"
          className="thud-eye"
          placement="top"
          tip={t(showTimeline ? 'timeline.barToggle.hide' : 'timeline.barToggle.show')}
          hint={t('timeline.barToggle.hint')}
          aria-label={t(showTimeline ? 'timeline.barToggle.hide' : 'timeline.barToggle.show')}
          aria-pressed={showTimeline}
          onClick={onToggleTimeline}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <EyeIcon open={showTimeline} />
        </TipButton>
        <span className="hud-move-hint ui-tip-box ui-tip" aria-hidden="true">
          <span className="ui-tip-title">{t('common.hud.dragToMove')}</span>
          <span className="ui-tip-sub hud-dock-line">
            <span className="ui-tip-hotkey hud-dock-key">
              {t('common.hud.dockKey')}
              <ClickIcon className="hud-dock-icon" />
            </span>
            {t('common.hud.dockHint')}
          </span>
        </span>
      </div>

      {/* Right-side display drawer (DESKTOP only): the overlay's Natal Chart + Zenith toggles,
          relocated here from Settings ▸ Display. The edge chevron opens/closes a compartment
          that slides out with a quick width animation; `inert` while closed so its toggles
          aren't focusable then. On TOUCH the drawer is dropped entirely — the same toggles
          appear inline in a bottom row of the bar (see below), now that the wider bar has room. */}
      {!touch && (
        <div className={`thud-drawer${drawerOpen ? ' is-open' : ''}`}>
          <TipButton
            type="button"
            className="thud-drawer-tab"
            placement="top"
            tip={t(drawerOpen ? 'timeline.drawer.hide' : 'timeline.drawer.show')}
            aria-label={t(drawerOpen ? 'timeline.drawer.hide' : 'timeline.drawer.show')}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((o) => !o)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className="thud-drawer-chevron" aria-hidden="true">
              {drawerOpen ? '‹' : '›'}
            </span>
          </TipButton>
          <div
            className="thud-drawer-compartment"
            inert={!drawerOpen || undefined}
            // Fall back to max-content if the width hasn't been measured yet (0): the
            // open drawer must never collapse to nothing. That first open won't animate;
            // every subsequent one uses the measured px width and does.
            style={{ width: drawerOpen ? drawerWidth || 'max-content' : 0 }}
          >
            <div className="thud-drawer-toggles" ref={drawerTogglesRef}>
              {displayToggles}
            </div>
          </div>
        </div>
      )}

      {/* Ruler + transport: hidden when Display ▸ Timeline is off (only the nub
          stays). */}
      {showTimeline && (
        <>
      <TimeRuler
        value={clamp(targetDate) + offsetMs}
        min={sliderMin + offsetMs}
        max={sliderMax + offsetMs}
        unit={stepUnit}
        onChange={(disp) => setTargetDate(disp - offsetMs)}
        onDragStart={() => playing && setPlaying(false)}
      />

      <div className="thud-row">
        <div className="thud-transport">
          <TipButton
            type="button"
            className="thud-step-btn"
            onClick={() => step(-1)}
            aria-label={t('timeline.transport.stepBackAria')}
            placement="top"
            tip={t('timeline.transport.stepBack', {
              count: stepCount,
              unit: stepWord(stepCount),
            })}
          >
            ‹
          </TipButton>
          <TipButton
            type="button"
            className={`thud-play ${playing ? 'on' : ''}`}
            onClick={() => setPlaying(!playing)}
            aria-label={playing ? t('timeline.transport.pause') : t('timeline.transport.play')}
            placement="top"
            tip={playing ? t('timeline.transport.pause') : t('timeline.transport.play')}
          >
            {playing ? '❚❚' : '▶'}
          </TipButton>
          <TipButton
            type="button"
            className="thud-step-btn"
            onClick={() => step(1)}
            aria-label={t('timeline.transport.stepForwardAria')}
            placement="top"
            tip={t('timeline.transport.stepForward', {
              count: stepCount,
              unit: stepWord(stepCount),
            })}
          >
            ›
          </TipButton>
          <TipSpan
            className="thud-stepsize"
            placement="top"
            tip={t('timeline.transport.stepAmount', { unit: stepWord(2) })}
          >
            <input
              type="number"
              className="thud-stepinput"
              min={1}
              step={1}
              value={Number.isFinite(stepCount) ? stepCount : ''}
              onChange={(e) => setStepCount(e.target.valueAsNumber)}
              aria-label={t('timeline.transport.stepAmountAria', { unit: stepWord(2) })}
            />
            <span className="thud-stepunit">{stepBase.label}</span>
          </TipSpan>
        </div>

        <span className="thud-datewrap">
          {/* The date is a button that opens the shared moment picker (same control as
              My Charts), keeping date entry consistent across the app. The readout +
              picker share the toDisplay/fromDisplay round-trip, with offsetMs the only
              zone shift (the active chart's zone). */}
          <TipButton
            type="button"
            className="thud-date"
            onClick={() => {
              if (playing) setPlaying(false);
              setPickerOpen(true);
            }}
            placement="top"
            tip={t('timeline.datePicker.open')}
          >
            {dateLabel}
          </TipButton>
          <TipButton
            type="button"
            className="thud-now"
            onClick={() => setTargetDate(clamp(Date.now()))}
            placement="top"
            tip={t('timeline.now.tip')}
          >
            {t('timeline.now.label')}
          </TipButton>
          <TipSpan
            className="thud-utc"
            placement="top"
            tip={
              current
                ? t('timeline.dateField.tipChartZone')
                : t('timeline.dateField.tipUtc')
            }
          >
            {tzLabel}
          </TipSpan>
        </span>

        {/* The scale picker reuses the shared HintMenu dropdown (same styling as the
            Calc settings) rather than a native select. Empty hints → no row tips, so
            hovering the scale shows nothing. */}
        <div className="thud-mode thud-unit">
          <span className="thud-mode-label">{t('timeline.scale.label')}</span>
          <HintMenu
            value={stepUnit}
            onChange={setStepUnit}
            options={UNIT_OPTIONS.map((unit) => ({
              value: unit,
              label: t(`timeline.units.${unit}`),
              hint: '',
            }))}
          />
        </div>
      </div>

      {/* Returns snap on its OWN row (transits only), so the main transport row
          keeps the same width as the other overlay bars. Clicking the luminary
          snaps the target date to the nearest solar/lunar return; ‹ › walk whole
          returns. The snap also switches Positioning to "Transit moment" (App
          side) — only that framing makes the snapped map the return chart's
          astrocartography — which the tips disclose. */}
      {overlayMode === 'transits' && (
        <div
          className={`thud-row thud-returns-row${advanced ? '' : ' thud-returns-row--solo'}`}
        >
          <div className="thud-returns">
            {returnGroup('solar')}
            <span className="thud-mode-label">{t('timeline.returns.label')}</span>
            {returnGroup('lunar')}
          </div>
          {/* ADVANCED-ONLY: the positioning frame + its separator. Hidden when Advanced is
              off (the returns then centre alone via thud-returns-row--solo); ADV-tagged on. */}
          {advanced && <span className="thud-returns-divider" aria-hidden="true" />}
          {/* Positioning, relocated from Settings: a flip-switch (Relative ↔ Absolute).
              Framing only affects Celestial lines — Mundane/Geodetic key off zodiacal
              longitude — so on those it's shown DISABLED, reading "—" (not the stored
              frame, which would be meaningless here) with a tip explaining why, rather
              than hidden. The button is floored to one width (see .thud-positioning-btn)
              so toggling Relative↔Absolute can't nudge the bar wider. */}
          {advanced && (() => {
            const posEnabled = lineSystem === 'celestial';
            return (
              <div className="thud-positioning">
                <span className="thud-mode-label">{t('settings.headings.positioning')}</span>
                <TipButton
                  type="button"
                  className={`thud-positioning-btn${posEnabled ? '' : ' is-disabled'}`}
                  aria-disabled={!posEnabled}
                  placement="top"
                  // ADV tag only on "Absolute" (transit-moment) — Relative-to-natal is the
                  // default, so it isn't flagged as an advanced choice.
                  advanced={posEnabled && transitFrame === 'transit-moment'}
                  // Enabled: tip names the CURRENT framing + its meaning. Disabled
                  // (non-Celestial lines): explain why framing has no effect here.
                  tip={
                    posEnabled
                      ? t(`settings.positioning.${transitFrame}.label`)
                      : t('settings.headings.positioning')
                  }
                  hint={
                    posEnabled
                      ? t(`settings.positioning.${transitFrame}.hint`)
                      : t('timeline.positioning.disabled')
                  }
                  aria-label={
                    posEnabled
                      ? `${t('settings.headings.positioning')}: ${t(
                          `settings.positioning.${transitFrame}.label`,
                        )}`
                      : t('settings.headings.positioning')
                  }
                  onClick={() => {
                    if (posEnabled)
                      setTransitFrame(
                        transitFrame === 'relative-to-natal'
                          ? 'transit-moment'
                          : 'relative-to-natal',
                      );
                  }}
                >
                  {posEnabled ? t(`settings.positioning.${transitFrame}.label`) : '—'}
                </TipButton>
              </div>
            );
          })()}
          {touch && displayDrawerInline}
        </div>
      )}

      {/* Chart-Angle method — relocated from the Calculations tab. Shown for the
          directed overlays that read it (Solar Arc / Secondary / Tertiary), centred. */}
      {(overlayMode === 'solar-arc' ||
        overlayMode === 'progressed' ||
        overlayMode === 'tertiary-progressed') && (
        <div className="thud-row thud-setting-row">
          <div className="thud-mode thud-setting">
            <span className="thud-mode-label">{t('settings.headings.chartAngle')}</span>
            <HintMenu
              value={angleProgression}
              onChange={setAngleProgression}
              options={chartAngleOptions}
            />
          </div>
          {/* Roomy second row — toggles sit inline (no chevron); only transits needs the drawer. */}
          {touch && displayToggles}
        </div>
      )}

      {/* Primary-Directions rate — relocated from the Calculations tab into its own
          bottom row, labelled "Rate". Its dropdown is wider (longer option strings);
          the user-rate stepper rides alongside when "User rate" is picked. */}
      {overlayMode === 'primary-directions' && (
        <div className="thud-row thud-setting-row">
          <div className="thud-mode thud-setting thud-rate">
            <span className="thud-mode-label">{t('timeline.rate.label')}</span>
            <HintMenu
              value={primaryRate}
              onChange={setPrimaryRate}
              options={primaryRateOptions}
            />
            {primaryRate === 'user' && (
              <StepperField
                id="user-primary-rate"
                label={t('settings.userRate.label')}
                value={userPrimaryRate}
                onChange={setUserPrimaryRate}
                step={0.01}
                decimals={2}
              />
            )}
          </div>
          {/* Roomy second row — toggles sit inline (no chevron); only transits needs the drawer. */}
          {touch && displayToggles}
        </div>
      )}

      {/* Touch fallback: for modes WITHOUT a settings/returns second row (e.g. cyclo) the
          toggles get their own row here. Every other mode puts them on its existing second row
          (above) — no separate third row. The slide-out drawer is desktop-only. */}
      {touch && !hasSettingsRow && (
        <div className="thud-row thud-display-row">{displayToggles}</div>
      )}

      {pickerOpen && (
        <TimelineDateModal
          valueMs={targetDate}
          offsetMs={offsetMs}
          zoneLabel={tzLabel}
          yearMin={yearMin}
          yearMax={yearMax}
          onApply={(ms) => setTargetDate(ms)}
          onClose={() => setPickerOpen(false)}
        />
      )}
        </>
      )}
    </div>
  );
}
