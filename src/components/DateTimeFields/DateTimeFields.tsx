// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../../i18n';
import { HoverTip } from '../ui/HoverTip';
import { tipPosFor, type TipPos } from '../ui/useHoverTip';
import './DateTimeFields.css';

// A calendar moment as plain civil fields — the shape every date/time picker in the
// app speaks (the birth-details form and the timeline's date modal), so they share
// one control and stay visually + behaviourally identical.
export interface DateTimeValue {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

// The same moment with any field possibly unset (null = empty box). The birth form
// uses this for a brand-new chart so the date/time start blank rather than "today";
// fully-populated callers (the timeline date modal) just pass a DateTimeValue.
export type PartialMoment = { [K in keyof DateTimeValue]: DateTimeValue[K] | null };

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// Birth-chart year range — the span of ephemeris data the app ships. The picker's
// default clamp and the form's validation + limit message all reference these.
export const BIRTH_YEAR_MIN = 1800;
export const BIRTH_YEAR_MAX = 2200;

interface SpinInputProps {
  /** null renders an empty box (showing the placeholder) — for unset fields. */
  value: number | null;
  min: number;
  max: number;
  pad?: number;
  width?: string;
  placeholder?: string;
  ariaLabel: string;
  /** When set, an out-of-range value is NOT clamped: it's kept as typed and the box
   *  flags invalid (red) with this text as a hover tooltip, so the limit is shown
   *  rather than silently corrected. (Arrows/wheel still nudge within range.) */
  outOfRangeHint?: string;
  onChange: (v: number) => void;
}

// A bare numeric spinner: type a value, scroll/arrow to nudge (Shift = ×10), and it
// stays clamped to [min, max]. No native spin buttons — just a centred, tabular field.
// A null value renders empty (with the placeholder); nudging an empty field from min.
export function SpinInput({
  value,
  min,
  max,
  pad = 0,
  width,
  placeholder,
  ariaLabel,
  outOfRangeHint,
  onChange,
}: SpinInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  // With outOfRangeHint set, typed values aren't clamped — flag (not fix) the limit.
  const invalid =
    !!outOfRangeHint && value != null && (value < min || value > max);
  // The out-of-range explanation shows as the shared .ui-tip card on hover/focus —
  // never a native title= (the app uses HoverTip everywhere). Positioned off the input.
  const [tipPos, setTipPos] = useState<TipPos | null>(null);
  const showTip = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setTipPos(tipPosFor(r, 'top'));
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const delta = e.deltaY < 0 ? step : -step;
      const next = Math.max(min, Math.min(max, (value ?? min) + delta));
      if (next !== value) onChange(next);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [value, min, max, onChange]);

  const commitDraft = () => {
    if (draft == null) return;
    const n = Number(draft);
    if (!Number.isNaN(n) && draft.trim() !== '') {
      onChange(outOfRangeHint ? n : Math.max(min, Math.min(max, n)));
    }
    setDraft(null);
  };

  return (
    <>
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      className={`spin-input${invalid ? ' invalid' : ''}`}
      style={width ? { width } : undefined}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      maxLength={pad || undefined}
      placeholder={placeholder}
      onMouseEnter={invalid ? showTip : undefined}
      onMouseLeave={() => setTipPos(null)}
      value={
        draft ??
        (value == null ? '' : pad ? String(value).padStart(pad, '0') : String(value))
      }
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d]/g, '');
        setDraft(raw);
        if (raw.length >= (pad || String(max).length)) {
          const n = Number(raw);
          if (!Number.isNaN(n) && (outOfRangeHint || (n >= min && n <= max))) {
            onChange(n);
            setDraft(null);
          }
        }
      }}
      onBlur={() => {
        commitDraft();
        setTipPos(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          onChange(Math.max(min, Math.min(max, (value ?? min) + step)));
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          onChange(Math.max(min, Math.min(max, (value ?? min) - step)));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          commitDraft();
        }
      }}
      onFocus={(e) => {
        e.currentTarget.select();
        if (invalid) showTip();
      }}
    />
    {invalid && (
      <HoverTip pos={tipPos} placement="top" title={outOfRangeHint} />
    )}
    </>
  );
}

interface DateTimeFieldsProps<V extends PartialMoment> {
  value: V;
  onChange: (next: V) => void;
  /** Year clamp for the spinner (birth charts use 1800–2200; the timeline widens it). */
  yearMin?: number;
  yearMax?: number;
  /** When set, a year outside [yearMin, yearMax] isn't clamped — it's kept and the
   *  year box flags invalid with this hint (used by the birth form's date entry). */
  yearHint?: string;
  /** Optional element rendered right after the minute input — e.g. a zone label. */
  timeSuffix?: ReactNode;
  /** Optional column rendered to the right of the time inputs (e.g. the birth form's
   *  Star toggle). The timeline date modal omits it. */
  trailing?: ReactNode;
}

// Date (Y / M / D) and Time (local, 24h) side by side — the shared moment editor.
// Day is clamped whenever a month/year change shrinks the month (e.g. Jan 31 → Feb)
// so the emitted value is always a real calendar date. Generic over the value shape:
// the timeline passes a full DateTimeValue (all numbers), while the birth form passes
// a PartialMoment whose fields can be null (empty) for a brand-new chart.
export function DateTimeFields<V extends PartialMoment>({
  value,
  onChange,
  yearMin = BIRTH_YEAR_MIN,
  yearMax = BIRTH_YEAR_MAX,
  yearHint,
  timeSuffix,
  trailing,
}: DateTimeFieldsProps<V>) {
  const { t } = useT();
  const { year, month, day, hour, minute } = value;
  // A clamp is only meaningful once both year and month are known; an empty date
  // can't be clamped, so it's left until the fields are filled.
  const dayMax = year != null && month != null ? daysInMonth(year, month) : 31;
  const clampDay = (d: number | null, yr: number | null, mo: number | null) =>
    d != null && yr != null && mo != null ? Math.min(d, daysInMonth(yr, mo)) : d;
  const patch = (p: Partial<PartialMoment>) => onChange({ ...value, ...p } as V);

  return (
    <div className="moment-row">
      <label className="moment-date">
        <span className="moment-caption">{t('chartForm.dateLabel')}</span>
        <div className="spin-group">
          <SpinInput
            value={year}
            min={yearMin}
            max={yearMax}
            pad={4}
            width="62px"
            placeholder="YYYY"
            outOfRangeHint={yearHint}
            ariaLabel={t('chartForm.year')}
            onChange={(y) => patch({ year: y, day: clampDay(day, y, month) })}
          />
          <span className="sep">/</span>
          <SpinInput
            value={month}
            min={1}
            max={12}
            pad={2}
            width="40px"
            placeholder="MM"
            ariaLabel={t('chartForm.month')}
            onChange={(m) => patch({ month: m, day: clampDay(day, year, m) })}
          />
          <span className="sep">/</span>
          <SpinInput
            value={day}
            min={1}
            max={dayMax}
            pad={2}
            width="40px"
            placeholder="DD"
            ariaLabel={t('chartForm.day')}
            onChange={(d) => patch({ day: d })}
          />
        </div>
      </label>
      <label className="moment-time">
        <span className="moment-caption">{t('chartForm.timeLabel')}</span>
        <div className="spin-group">
          <SpinInput
            value={hour}
            min={0}
            max={23}
            pad={2}
            width="40px"
            placeholder="HH"
            ariaLabel={t('chartForm.hour')}
            onChange={(h) => patch({ hour: h })}
          />
          <span className="sep">:</span>
          <SpinInput
            value={minute}
            min={0}
            max={59}
            pad={2}
            width="40px"
            placeholder="MM"
            ariaLabel={t('chartForm.minute')}
            onChange={(mi) => patch({ minute: mi })}
          />
          {timeSuffix != null && <span className="moment-tz">{timeSuffix}</span>}
        </div>
      </label>
      {trailing}
    </div>
  );
}
