import { useEffect, useRef, useState } from 'react';
import { geocode, type GeocodeResult } from '../../lib/atlas/geocode';
import { resolveBirthTimezone } from '../../lib/atlas/timezone';
import { newChartId, type StoredChart } from '../../lib/chartLibrary';
import './BirthDataForm.css';

interface BirthDataFormProps {
  initial?: StoredChart | null;
  onSubmit: (chart: StoredChart) => void;
  onCancel: () => void;
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

export function BirthDataForm({
  initial,
  onSubmit,
  onCancel,
  onImport,
}: BirthDataFormProps) {
  const now = new Date();
  const [name, setName] = useState(initial?.name ?? '');
  const [year, setYear] = useState(initial?.year ?? now.getFullYear());
  const [month, setMonth] = useState(initial?.month ?? now.getMonth() + 1);
  const [day, setDay] = useState(initial?.day ?? now.getDate());
  const [hour, setHour] = useState(initial?.hour ?? 12);
  const [minute, setMinute] = useState(initial?.minute ?? 0);

  const dayMax = daysInMonth(year, month);
  useEffect(() => {
    if (day > dayMax) setDay(dayMax);
  }, [day, dayMax]);

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

  useEffect(() => {
    if (selectedPlace && locationQuery === selectedPlace.label) return;
    if (locationQuery.trim().length < 2) {
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
    const tz = resolveBirthTimezone(
      selectedPlace.lat,
      selectedPlace.lng,
      year,
      month,
      day,
      hour,
      minute,
    );
    const chart: StoredChart = {
      id: initial?.id ?? newChartId(),
      createdAt: initial?.createdAt ?? Date.now(),
      name: name.trim(),
      year,
      month,
      day,
      hour,
      minute,
      tzOffset: tz.offsetHours,
      tzIana: tz.iana,
      tzUncertain: tz.uncertain,
      birthplace: selectedPlace,
    };
    onSubmit(chart);
  };

  const pickSuggestion = (s: GeocodeResult) => {
    setSelectedPlace(s);
    setLocationQuery(s.label);
    setSuggestions([]);
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form
        className="birth-form"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <header>
          <h2>{initial ? 'Edit chart' : 'New chart'}</h2>
          <button
            type="button"
            className="close"
            onClick={onCancel}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <label>
          <span>Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Client or chart name"
            autoFocus
          />
        </label>

        <div className="row">
          <label>
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
          <label>
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
        </div>
        <p className="spin-hint">
          Scroll, type, or use ↑↓ (Shift+↑↓ for ±10).
        </p>

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
            <p className="resolved">
              ✓ {selectedPlace.lat.toFixed(3)}°,{' '}
              {selectedPlace.lng.toFixed(3)}°
            </p>
          )}
        </label>

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
            <button type="button" className="secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="primary">
              {initial ? 'Save' : 'Create chart'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
