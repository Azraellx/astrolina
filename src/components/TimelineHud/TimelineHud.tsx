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
} from 'react';
import {
  minorStepMs,
  TIME_UNITS,
  type OverlayMode,
  type ProgressionType,
  type TimeUnit,
} from '../../lib/astro/timeline';
import { findReturn, type ReturnBody } from '../../lib/astro/returns';
import type { StoredChart } from '../../lib/chartLibrary';
import { PLANET_GLYPHS } from '../../lib/astro/glyphChars';
import {
  formatUtcOffset,
  offsetHoursAt,
  zoneLabelAt,
} from '../../lib/atlas/timezone';
import { useMovableHud } from '../../lib/useMovableHud';
import { TipButton, TipSpan } from '../ui/HoverTip';
import { ClickIcon } from '../ui/ClickIcon';
import { HintMenu } from '../Sidebar/Sidebar';
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
  /** Snap the target date to a solar/lunar return (dir 0 = nearest, ±1 = next/
   *  previous). Transits mode only — the Returns group hides otherwise. */
  onSnapReturn: (body: ReturnBody, dir: -1 | 0 | 1) => void;
  /** Which progression clock drives the Progressed overlay — retitles the nub
   *  ("Sec." vs "Tert. Progressed"). */
  progressionType: ProgressionType;
}

const UNIT_OPTIONS: TimeUnit[] = ['minute', 'hour', 'day', 'week', 'month', 'year'];

// Catalog keys for the draggable nub's per-mode name (timeline.nubMode.*).
const NUB_LABEL_KEY = {
  transits: 'timeline.nubMode.transits',
  progressed: 'timeline.nubMode.progressed',
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
  onSnapReturn,
  progressionType,
}: TimelineHudProps) {
  const { t, fmt } = useT();
  const current = charts.find((c) => c.id === currentId) ?? null;
  const [pickerOpen, setPickerOpen] = useState(false);
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
    overlayMode === 'progressed' && progressionType === 'tertiary'
      ? t('timeline.nubMode.tertiary')
      : overlayMode in NUB_LABEL_KEY
        ? t(NUB_LABEL_KEY[overlayMode as keyof typeof NUB_LABEL_KEY])
        : t('timeline.nubFallback');

  // ── Draggable bar ──────────────────────────────────────────────────────
  // The nub is the move handle. Position is shared with the synastry bar (same
  // bottom slot) via useMovableHud, so flipping overlay modes keeps the bar
  // wherever it was dragged.
  const hudRef = useRef<HTMLDivElement>(null);
  const { pos, dragging, handleProps } = useMovableHud(hudRef);

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

  return (
    <div
      className={`timeline-hud${dragging ? ' thud-dragging' : ''}${
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
        <div className="thud-row thud-returns-row">
          <div className="thud-returns">
            {returnGroup('solar')}
            <span className="thud-mode-label">{t('timeline.returns.label')}</span>
            {returnGroup('lunar')}
          </div>
        </div>
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
