import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  minorStepMs,
  TIME_UNITS,
  type OverlayMode,
  type TimeUnit,
} from '../../lib/astro/timeline';
import type { StoredChart } from '../../lib/chartLibrary';
import {
  formatUtcOffset,
  offsetHoursAt,
  zoneLabelAt,
} from '../../lib/atlas/timezone';
import { useMovableHud } from '../../lib/useMovableHud';
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
}

const UNIT_OPTIONS: { unit: TimeUnit; label: string }[] = [
  { unit: 'minute', label: 'Minute' },
  { unit: 'hour', label: 'Hour' },
  { unit: 'day', label: 'Day' },
  { unit: 'week', label: 'Week' },
  { unit: 'month', label: 'Month' },
  { unit: 'year', label: 'Year' },
];

// Name shown on the draggable nub for each time-overlay mode.
const MODE_LABEL: Partial<Record<OverlayMode, string>> = {
  transits: 'Transits',
  progressed: 'Progressed',
  'solar-arc': 'Solar Arc',
  'primary-directions': 'Primary',
};

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

// Human description of one minor notch (= one default Step / one tick), for
// tooltips.
const MINOR_LABEL: Record<TimeUnit, string> = {
  minute: '1 min',
  hour: '10 min',
  day: '6 hours',
  week: '1 day',
  month: '5 days',
  year: '1 month',
};

// The base unit each scale's mini-notch is measured in, plus the default count
// of that base per mini-notch. The step-size box defaults to `count` and lets
// the user override how many base-units one Step press advances — purely the
// step increment; it doesn't redraw the ruler. (count × baseMs ≈ minorStepMs.)
const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const STEP_UNIT: Record<TimeUnit, { count: number; baseMs: number; label: string }> = {
  minute: { count: 1, baseMs: MIN_MS, label: 'min' },
  hour: { count: 10, baseMs: MIN_MS, label: 'min' },
  day: { count: 6, baseMs: HOUR_MS, label: 'h' },
  week: { count: 1, baseMs: DAY_MS, label: 'd' },
  month: { count: 5, baseMs: DAY_MS, label: 'd' },
  year: { count: 1, baseMs: 30 * DAY_MS, label: 'mo' },
};

const YEAR_MS = 365.2425 * 86_400_000;

const MON = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Label for a major (labeled) notch, formatted to suit the granularity.
function fmtTick(ms: number, unit: TimeUnit): string {
  const d = new Date(ms);
  if (unit === 'minute')
    return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  if (unit === 'hour') return `${pad2(d.getUTCHours())}:00`;
  if (unit === 'year') return String(d.getUTCFullYear());
  if (unit === 'month')
    return `${MON[d.getUTCMonth()]} ’${String(d.getUTCFullYear()).slice(2)}`;
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

// datetime-local <-> epoch ms, interpreting the control's value as UTC (to match
// buildOverlay, which treats the target moment as UTC). The transit/progressed
// moment is entered and shown in UTC so it lines up 1:1 with the desktop tools when
// they're set to UT/GMT — no zone conversion to get wrong.
function toDatetimeLocalUTC(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}
function fromDatetimeLocalUTC(s: string): number {
  const ms = Date.parse(`${s}:00Z`);
  return Number.isNaN(ms) ? Date.now() : ms;
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
    ticks.push({ x, isMajor, label: isMajor ? fmtTick(tickValue, unit) : null });
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
      aria-label="Scrub date"
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
}: TimelineHudProps) {
  const current = charts.find((c) => c.id === currentId) ?? null;
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
  // shown moment; a manual offset is used fixed, exactly as the user set it. No
  // chart → UTC. offsetMs shifts the ruler/field into local wall-clock and back.
  const tzInstant = clamp(targetDate);
  const tzHours = !current
    ? 0
    : current.tzManual || !current.tzIana
      ? current.tzOffset
      : offsetHoursAt(current.tzIana, tzInstant);
  const offsetMs = tzHours * 3_600_000;
  const tzLabel = !current
    ? 'UTC'
    : current.tzManual || !current.tzIana
      ? formatUtcOffset(tzHours)
      : zoneLabelAt(current.tzIana, tzInstant);

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
  const minorDesc = MINOR_LABEL[stepUnit];
  const modeLabel = MODE_LABEL[overlayMode] ?? 'Overlay';

  // ── Draggable bar ──────────────────────────────────────────────────────
  // The nub is the move handle. Position is shared with the synastry bar (same
  // bottom slot) via useMovableHud, so flipping overlay modes keeps the bar
  // wherever it was dragged.
  const hudRef = useRef<HTMLDivElement>(null);
  const { pos, dragging, handleProps } = useMovableHud(hudRef);

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
          <span className="ui-tip-title">Drag to move</span>
          <span className="ui-tip-sub">Double-click to dock · snaps to centre</span>
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
          <button
            type="button"
            className="thud-step-btn"
            onClick={() => step(-1)}
            title={`Step back ${stepCount} ${stepBase.label}`}
            aria-label="Step back"
          >
            ‹
          </button>
          <button
            type="button"
            className={`thud-play ${playing ? 'on' : ''}`}
            onClick={() => setPlaying(!playing)}
            title={playing ? 'Pause' : 'Play'}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <button
            type="button"
            className="thud-step-btn"
            onClick={() => step(1)}
            title={`Step forward ${stepCount} ${stepBase.label}`}
            aria-label="Step forward"
          >
            ›
          </button>
          <span
            className="thud-stepsize"
            title={`Step amount, in ${stepBase.label}`}
          >
            <input
              type="number"
              className="thud-stepinput"
              min={1}
              step={1}
              value={Number.isFinite(stepCount) ? stepCount : ''}
              onChange={(e) => setStepCount(e.target.valueAsNumber)}
              aria-label={`Step amount in ${stepBase.label}`}
            />
            <span className="thud-stepunit">{stepBase.label}</span>
          </span>
        </div>

        <span className="thud-datewrap">
          {/* The browser renders this field in its own format (12h/24h, date order),
              but its VALUE is always ISO (YYYY-MM-DDTHH:MM). So we never parse the
              display — the toDatetimeLocalUTC / fromDatetimeLocalUTC pair is the single
              source of truth for the field <-> instant round-trip, with offsetMs the
              only zone shift (the active chart's zone). Correctness is format-agnostic. */}
          <input
            type="datetime-local"
            className="thud-date"
            value={toDatetimeLocalUTC(targetDate + offsetMs)}
            onChange={(e) => {
              // A datetime-local input reports an empty value string until EVERY
              // segment is filled. While the user types a date by hand the value
              // is briefly "", so skip those blanks — otherwise the target snapped
              // back to "now", overwriting their input and making manual typing
              // impossible (only the calendar picker, which fills all segments at
              // once, used to work). The field is in the chart's zone, so subtract
              // the offset back to the stored UTC instant.
              const v = e.target.value;
              if (v) setTargetDate(fromDatetimeLocalUTC(v) - offsetMs);
            }}
          />
          <button
            type="button"
            className="thud-now"
            onClick={() => setTargetDate(clamp(Date.now()))}
            title="Set to the current moment"
          >
            Now
          </button>
          <span
            className="thud-utc"
            title={
              current
                ? `Transit / progressed moment, in the chart’s time zone`
                : 'Transit / progressed moment, in UTC'
            }
          >
            {tzLabel}
          </span>
        </span>

        <label className="thud-mode thud-unit">
          <span className="thud-mode-label">Scale</span>
          <span className="thud-select-wrap">
            <select
              className="thud-select"
              value={stepUnit}
              onChange={(e) => setStepUnit(e.target.value as TimeUnit)}
              title={`Notch = 1 ${stepUnit}; mini-notch = ${minorDesc}`}
            >
              {UNIT_OPTIONS.map(({ unit, label }) => (
                <option key={unit} value={unit}>
                  {label}
                </option>
              ))}
            </select>
            <span className="thud-select-caret">▾</span>
          </span>
        </label>
      </div>
        </>
      )}
    </div>
  );
}
