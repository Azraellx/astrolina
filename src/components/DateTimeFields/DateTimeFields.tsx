// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../../i18n';
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

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

interface SpinInputProps {
  value: number;
  min: number;
  max: number;
  pad?: number;
  width?: string;
  ariaLabel: string;
  onChange: (v: number) => void;
}

// A bare numeric spinner: type a value, scroll/arrow to nudge (Shift = ×10), and it
// stays clamped to [min, max]. No native spin buttons — just a centred, tabular field.
export function SpinInput({
  value,
  min,
  max,
  pad = 0,
  width,
  ariaLabel,
  onChange,
}: SpinInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const delta = e.deltaY < 0 ? step : -step;
      const next = Math.max(min, Math.min(max, value + delta));
      if (next !== value) onChange(next);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [value, min, max, onChange]);

  const commitDraft = () => {
    if (draft == null) return;
    const n = Number(draft);
    if (!Number.isNaN(n) && draft.trim() !== '') {
      onChange(Math.max(min, Math.min(max, n)));
    }
    setDraft(null);
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      className="spin-input"
      style={width ? { width } : undefined}
      aria-label={ariaLabel}
      value={draft ?? (pad ? String(value).padStart(pad, '0') : String(value))}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d]/g, '');
        setDraft(raw);
        if (raw.length >= (pad || String(max).length)) {
          const n = Number(raw);
          if (!Number.isNaN(n) && n >= min && n <= max) {
            onChange(n);
            setDraft(null);
          }
        }
      }}
      onBlur={commitDraft}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          onChange(Math.max(min, Math.min(max, value + step)));
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          onChange(Math.max(min, Math.min(max, value - step)));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          commitDraft();
        }
      }}
      onFocus={(e) => e.currentTarget.select()}
    />
  );
}

interface DateTimeFieldsProps {
  value: DateTimeValue;
  onChange: (next: DateTimeValue) => void;
  /** Year clamp for the spinner (birth charts use 1800–2200; the timeline widens it). */
  yearMin?: number;
  yearMax?: number;
  /** Optional element rendered right after the minute input — e.g. a zone label. */
  timeSuffix?: ReactNode;
}

// Date (Y / M / D) and Time (local, 24h) side by side — the shared moment editor.
// Day is clamped whenever a month/year change shrinks the month (e.g. Jan 31 → Feb)
// so the emitted value is always a real calendar date.
export function DateTimeFields({
  value,
  onChange,
  yearMin = 1800,
  yearMax = 2200,
  timeSuffix,
}: DateTimeFieldsProps) {
  const { t } = useT();
  const { year, month, day, hour, minute } = value;
  const dayMax = daysInMonth(year, month);
  const patch = (p: Partial<DateTimeValue>) => onChange({ ...value, ...p });

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
            ariaLabel={t('chartForm.year')}
            onChange={(y) => patch({ year: y, day: Math.min(day, daysInMonth(y, month)) })}
          />
          <span className="sep">/</span>
          <SpinInput
            value={month}
            min={1}
            max={12}
            pad={2}
            width="40px"
            ariaLabel={t('chartForm.month')}
            onChange={(m) => patch({ month: m, day: Math.min(day, daysInMonth(year, m)) })}
          />
          <span className="sep">/</span>
          <SpinInput
            value={day}
            min={1}
            max={dayMax}
            pad={2}
            width="40px"
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
            ariaLabel={t('chartForm.minute')}
            onChange={(mi) => patch({ minute: mi })}
          />
          {timeSuffix != null && <span className="moment-tz">{timeSuffix}</span>}
        </div>
      </label>
    </div>
  );
}
