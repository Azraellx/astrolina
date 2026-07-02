// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  DateTimeFields,
  type DateTimeValue,
} from '../DateTimeFields/DateTimeFields';
import { useT } from '../../i18n';
import './TimelineDateModal.css';

// The timeline target is a UTC instant, but it's shown (and entered) in the active
// chart's zone — offsetMs is that shift. So the picker works in "display ms" (the
// chart-zone wall clock read as UTC), exactly like the field it replaces: components
// ⇄ display ms, then ± offsetMs to cross between display and the stored UTC instant.
function displayMsToValue(ms: number): DateTimeValue {
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

function valueToDisplayMs(v: DateTimeValue): number {
  // setUTCFullYear (not Date.UTC) so years 0–99 aren't remapped into the 1900s.
  const d = new Date(Date.UTC(2000, v.month - 1, v.day, v.hour, v.minute));
  d.setUTCFullYear(v.year);
  return d.getTime();
}

interface TimelineDateModalProps {
  /** Current target, as the stored UTC instant. */
  valueMs: number;
  /** Chart-zone shift applied for display (hours × 3.6e6). */
  offsetMs: number;
  /** Zone shown to the user (e.g. "EDT", "UTC") — for the caption only. */
  zoneLabel: string;
  /** Year clamp for the spinner (the slider's own range) — the only bound applied,
   *  matching the old field, which let any entered moment through unclamped. */
  yearMin: number;
  yearMax: number;
  /** Hide the time fields — for callers where only the DATE matters (a
   *  day-scale pick): the applied instant keeps the seeded time-of-day, and
   *  showing hour/minute boxes would just confuse. */
  dateOnly?: boolean;
  /** Header title override — defaults to the "Set date & time" string; a
   *  date-only caller passes its own (e.g. "Pick a date"). */
  title?: string;
  /** Receives the chosen moment as a stored UTC instant. */
  onApply: (ms: number) => void;
  onClose: () => void;
}

// A compact modal — same chrome and shared moment editor as the My Charts form — for
// setting the timeline's transit/progressed date precisely (the ruler stays for live
// scrubbing). Portaled to <body> so the draggable HUD's transforms can't trap it.
export function TimelineDateModal({
  valueMs,
  offsetMs,
  zoneLabel,
  yearMin,
  yearMax,
  dateOnly = false,
  title,
  onApply,
  onClose,
}: TimelineDateModalProps) {
  const { t } = useT();
  const [draft, setDraft] = useState<DateTimeValue>(() =>
    displayMsToValue(valueMs + offsetMs),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // No range clamp here (the year spinner already bounds the entry): honour the
    // entered moment exactly, like the field this replaced. The ruler still clamps
    // its own needle for display.
    onApply(valueToDisplayMs(draft) - offsetMs);
    onClose();
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="tdm-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        role="dialog"
        aria-label={title ?? t('timeline.datePicker.title')}
      >
        <header className="tdm-header">
          <h2>{title ?? t('timeline.datePicker.title')}</h2>
          <button
            type="button"
            className="tdm-close"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            ×
          </button>
        </header>

        <DateTimeFields
          value={draft}
          onChange={setDraft}
          yearMin={yearMin}
          yearMax={yearMax}
          timeSuffix={zoneLabel}
          dateOnly={dateOnly}
        />

        <p className="tdm-hint">
          <span className="ui-tip-hotkey">{t('timeline.datePicker.scrollKey')}</span>
          {t('timeline.datePicker.scrollHint')}
        </p>

        <footer className="tdm-footer">
          <button type="button" className="tdm-btn secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="tdm-btn primary">
            {t('timeline.datePicker.apply')}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
