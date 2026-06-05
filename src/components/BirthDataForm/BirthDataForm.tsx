// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  geocode,
  reverseGeocode,
  type GeocodeResult,
} from '../../lib/atlas/geocode';
import { formatUtcOffset, resolveBirthTimezone } from '../../lib/atlas/timezone';
import {
  NAME_HARD_LIMIT,
  NAME_SOFT_LIMIT,
  newChartId,
  type StoredChart,
} from '../../lib/chartLibrary';
import { TipButton } from '../ui/HoverTip';
import './BirthDataForm.css';

const approxEq = (a: number, b: number) => Math.abs(a - b) < 1e-5;
const validLat = (n: number) => Number.isFinite(n) && n >= -90 && n <= 90;
const validLng = (n: number) => Number.isFinite(n) && n >= -180 && n <= 180;

interface BirthDataFieldsProps {
  /** Chart being edited, or null/undefined to create a new one. */
  initial?: StoredChart | null;
  /** Initial name for a NEW chart (e.g. carried over from the search box). */
  nameSeed?: string;
  /** Submit-button label, e.g. "Add chart" / "Save changes". */
  submitLabel: string;
  onSubmit: (chart: StoredChart) => void;
  /** Opens the import flow; only shown when creating (not editing). */
  onImport?: () => void;
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

function SpinInput({
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

// The birth-details form body (name, date/time, birthplace), without modal chrome,
// so it can live inside the ChartManager's right pane for both add and edit. Owns
// its own field state; calls onSubmit with the built StoredChart.
export function BirthDataFields({
  initial,
  nameSeed,
  submitLabel,
  onSubmit,
  onImport,
}: BirthDataFieldsProps) {
  const now = new Date();
  const [name, setName] = useState(initial?.name ?? nameSeed ?? '');
  const [year, setYear] = useState(initial?.year ?? now.getFullYear());
  const [month, setMonth] = useState(initial?.month ?? now.getMonth() + 1);
  const [day, setDay] = useState(initial?.day ?? now.getDate());
  const [hour, setHour] = useState(initial?.hour ?? 12);
  const [minute, setMinute] = useState(initial?.minute ?? 0);

  const dayMax = daysInMonth(year, month);
  // Clamp the day when a month/year change shrinks the month (e.g. Jan 31 → Feb).
  // Done during render so an out-of-range day never reaches a paint.
  if (day > dayMax) setDay(dayMax);

  const [locationQuery, setLocationQuery] = useState(
    initial?.birthplace.label ?? '',
  );
  const [selectedPlace, setSelectedPlace] = useState<{
    label: string;
    lat: number;
    lng: number;
  } | null>(
    initial
      ? {
          label: initial.birthplace.label,
          lat: initial.birthplace.lat,
          lng: initial.birthplace.lng,
        }
      : null,
  );
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Manual coordinate drafts (kept as text so partial typing works). Editing them
  // reverse-geocodes a label and re-detects the zone, so a chart can be entered by
  // raw lat/lng — the way many birth records / rectified charts are kept.
  const [latText, setLatText] = useState(
    initial ? String(initial.birthplace.lat) : '',
  );
  const [lngText, setLngText] = useState(
    initial ? String(initial.birthplace.lng) : '',
  );

  // Timezone: null = auto (the offset detected from coords + date, DST-aware); a
  // number = a manual UTC offset (hours, east-positive) the user set, which is then
  // authoritative and round-trips untouched. Accuracy here is load-bearing — it's
  // exactly what birthDataToJD subtracts to get the UT birth instant.
  const [offsetOverride, setOffsetOverride] = useState<number | null>(
    initial?.tzManual ? (initial.tzOffset ?? null) : null,
  );
  const detected = useMemo(
    () =>
      selectedPlace
        ? resolveBirthTimezone(
            selectedPlace.lat,
            selectedPlace.lng,
            year,
            month,
            day,
            hour,
            minute,
          )
        : null,
    [selectedPlace, year, month, day, hour, minute],
  );
  const effectiveOffset = offsetOverride ?? detected?.offsetHours ?? 0;
  const stepOffset = (delta: number) =>
    setOffsetOverride(
      Math.max(-12, Math.min(14, Math.round((effectiveOffset + delta) * 4) / 4)),
    );

  // Latest selected place, read by the reverse-geocode effect below WITHOUT being
  // one of its triggers (declared first so it syncs before that effect runs).
  const selectedPlaceRef = useRef(selectedPlace);
  useEffect(() => {
    selectedPlaceRef.current = selectedPlace;
  }, [selectedPlace]);

  // Manual lat/lng → reverse-geocode a label (offline-first, online on a miss).
  // Keys ONLY off the coordinate text: clearing the place (e.g. typing a fresh
  // birthplace into the field) must NOT reverse-geocode the still-stale coords and
  // overwrite what's being typed. Skips when the coords already match the selected
  // place (e.g. just after a forward-search pick) so it never loops or fires
  // redundant lookups.
  useEffect(() => {
    const lat = parseFloat(latText);
    const lng = parseFloat(lngText);
    if (!validLat(lat) || !validLng(lng)) return;
    const current = selectedPlaceRef.current;
    if (current && approxEq(current.lat, lat) && approxEq(current.lng, lng)) {
      return;
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      let label: string | null = null;
      try {
        const { nearestCity } = await import('../../lib/atlas/cityLookup');
        if (ctrl.signal.aborted) return;
        label = nearestCity(lat, lng)?.label ?? null;
        if (!label) label = await reverseGeocode(lat, lng, ctrl.signal);
      } catch {
        /* offline miss / aborted — fall back to the bare coordinates */
      }
      if (ctrl.signal.aborted) return;
      const place = {
        label: label ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        lat,
        lng,
      };
      setSelectedPlace(place);
      setLocationQuery(place.label);
    }, 500);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [latText, lngText]);

  useEffect(() => {
    if (selectedPlace && locationQuery === selectedPlace.label) return;
    if (locationQuery.trim().length < 2) {
      // Clearing stale suggestions belongs in this debounce/abort effect (it owns
      // the async search lifecycle); it can't be derived during render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setSearching(true);
      try {
        // Offline-first: resolve birthplaces from the bundled GeoNames cities;
        // the online provider is queried only when the local set has no match.
        const { searchCity } = await import('../../lib/atlas/cityLookup');
        if (ctrl.signal.aborted) return;
        const offline = searchCity(locationQuery, 8);
        const results = offline.length
          ? offline
          : await geocode(locationQuery, ctrl.signal);
        if (!ctrl.signal.aborted) {
          setSuggestions(results);
          setSearching(false);
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setSearching(false);
      }
    }, 500);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [locationQuery, selectedPlace]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedPlace) {
      setError('Choose a birthplace from the dropdown.');
      return;
    }
    if (!name.trim()) {
      setError('Add a name.');
      return;
    }
    // tzOffset is the single value the chart math uses — either the user's manual
    // offset (authoritative, never re-derived) or the DST-aware detection.
    const manual = offsetOverride != null;
    const chart: StoredChart = {
      id: initial?.id ?? newChartId(),
      createdAt: initial?.createdAt ?? Date.now(),
      name: name.trim(),
      year,
      month,
      day,
      hour,
      minute,
      tzOffset: effectiveOffset,
      tzIana: detected?.iana,
      tzManual: manual,
      tzUncertain: manual ? false : (detected?.uncertain ?? false),
      birthplace: selectedPlace,
    };
    onSubmit(chart);
  };

  const pickSuggestion = (s: GeocodeResult) => {
    setSelectedPlace(s);
    setLocationQuery(s.label);
    setLatText(String(s.lat));
    setLngText(String(s.lng));
    setSuggestions([]);
  };

  return (
    <form className="birth-form birth-fields" onSubmit={handleSubmit}>
        <label>
          <span>Name</span>
          <div className="name-field">
            <input
              type="text"
              value={name}
              maxLength={NAME_HARD_LIMIT}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a chart name"
            />
            {/* Count appears only as you near the cap, faint and right-aligned. */}
            {name.length >= NAME_SOFT_LIMIT && (
              <span className="name-count" aria-hidden="true">
                {name.length}/{NAME_HARD_LIMIT}
              </span>
            )}
          </div>
        </label>

        {/* The birth moment, grouped together: date → time → zone. */}
        <div className="moment-row">
          <label className="moment-date">
            <span>Date (Y / M / D)</span>
            <div className="spin-group">
              <SpinInput
                value={year}
                min={1800}
                max={2200}
                pad={4}
                width="62px"
                ariaLabel="Year"
                onChange={setYear}
              />
              <span className="sep">/</span>
              <SpinInput
                value={month}
                min={1}
                max={12}
                pad={2}
                width="40px"
                ariaLabel="Month"
                onChange={setMonth}
              />
              <span className="sep">/</span>
              <SpinInput
                value={day}
                min={1}
                max={dayMax}
                pad={2}
                width="40px"
                ariaLabel="Day"
                onChange={setDay}
              />
            </div>
          </label>
          {/* Time + Zone stay glued on one row (Zone to the right of Time). */}
          <div className="moment-tz-pair">
          <label className="moment-time">
            <span>Time (local, 24h)</span>
            <div className="spin-group">
              <SpinInput
                value={hour}
                min={0}
                max={23}
                pad={2}
                width="40px"
                ariaLabel="Hour"
                onChange={setHour}
              />
              <span className="sep">:</span>
              <SpinInput
                value={minute}
                min={0}
                max={59}
                pad={2}
                width="40px"
                ariaLabel="Minute"
                onChange={setMinute}
              />
            </div>
          </label>
          <label className="moment-zone tz-field">
            <span>Time zone</span>
            <div className="tz-control-row">
            <div className="tz-control">
              <button
                type="button"
                className="tz-step"
                onClick={() => stepOffset(-0.25)}
                aria-label="Decrease offset 15 minutes"
              >
                −
              </button>
              <span className="tz-offset">{formatUtcOffset(effectiveOffset)}</span>
              <button
                type="button"
                className="tz-step"
                onClick={() => stepOffset(0.25)}
                aria-label="Increase offset 15 minutes"
              >
                +
              </button>
            </div>
            <p className="tz-note">
              {offsetOverride != null ? (
                detected ? (
                  <>
                    Manual ·{' '}
                    <TipButton
                      type="button"
                      className="tz-reset-link"
                      onClick={() => setOffsetOverride(null)}
                      placement="top"
                      tip={`Use detected ${detected.iana}`}
                    >
                      use detected
                    </TipButton>
                  </>
                ) : (
                  'Manual offset'
                )
              ) : detected ? (
                `Auto · ${detected.iana}${detected.uncertain ? ' · verify DST' : ''}`
              ) : (
                'Set a place to detect'
              )}
            </p>
            </div>
          </label>
          </div>
        </div>

        <label className="location-field">
          <span>Birthplace</span>
          <input
            type="text"
            value={locationQuery}
            onChange={(e) => {
              setLocationQuery(e.target.value);
              setSelectedPlace(null);
            }}
            placeholder="City, country"
            autoComplete="off"
          />
          {(suggestions.length > 0 || searching) && !selectedPlace && (
            <ul className="suggestions">
              {searching && <li className="hint">searching…</li>}
              {suggestions.map((s, i) => (
                <li key={i}>
                  <button type="button" onClick={() => pickSuggestion(s)}>
                    <span className="place-label">{s.label}</span>
                    <span className="place-coords">
                      {s.lat.toFixed(3)}, {s.lng.toFixed(3)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedPlace && (
            <p className="resolved">✓ {selectedPlace.label}</p>
          )}
        </label>

        <div className="row">
          <label>
            <span>Latitude</span>
            <input
              type="text"
              inputMode="decimal"
              value={latText}
              onChange={(e) => setLatText(e.target.value)}
              placeholder="48.4011"
              autoComplete="off"
            />
          </label>
          <label>
            <span>Longitude</span>
            <input
              type="text"
              inputMode="decimal"
              value={lngText}
              onChange={(e) => setLngText(e.target.value)}
              placeholder="9.9876"
              autoComplete="off"
            />
          </label>
        </div>

        {error && <p className="form-error">{error}</p>}

        <footer>
          <div className="footer-left">
            {onImport && !initial && (
              <button type="button" className="secondary" onClick={onImport}>
                Import
              </button>
            )}
          </div>
          <div className="footer-actions">
            <button type="submit" className="primary">
              {submitLabel}
            </button>
          </div>
        </footer>
    </form>
  );
}
