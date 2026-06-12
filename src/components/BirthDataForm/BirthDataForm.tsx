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
import {
  formatUtcOffset,
  listTimeZones,
  resolveBirthTimezone,
  resolveZoneInfo,
} from '../../lib/atlas/timezone';
import {
  NAME_HARD_LIMIT,
  NAME_SOFT_LIMIT,
  newChartId,
  type ChartTag,
  type StoredChart,
} from '../../lib/chartLibrary';
import { TipButton } from '../ui/HoverTip';
import { TagIcon } from '../ui/TagIcon';
import { jdToCivil } from '../../lib/ephemeris';
import { solveCompositeJd } from '../../lib/astro/composite';
import { DateTimeFields } from '../DateTimeFields/DateTimeFields';
import { useT } from '../../i18n';
import './BirthDataForm.css';

const approxEq = (a: number, b: number) => Math.abs(a - b) < 1e-5;
const validLat = (n: number) => Number.isFinite(n) && n >= -90 && n <= 90;
const validLng = (n: number) => Number.isFinite(n) && n >= -180 && n <= 180;

// IANA zones grouped by region (the part before the first "/") for the time-zone
// <select>'s optgroups. Built once from the canonical list; sorted for a scannable
// dropdown. A zone without a "/" (e.g. "UTC") lands in an "Other" group.
const ZONE_GROUPS: { region: string; zones: string[] }[] = (() => {
  const groups = new Map<string, string[]>();
  for (const z of listTimeZones()) {
    const region = z.includes('/') ? z.slice(0, z.indexOf('/')) : 'Other';
    const bucket = groups.get(region);
    if (bucket) bucket.push(z);
    else groups.set(region, [z]);
  }
  return [...groups.entries()]
    .map(([region, zones]) => ({ region, zones: zones.sort() }))
    .sort((a, b) => a.region.localeCompare(b.region));
})();

const zoneInList = (iana: string) =>
  ZONE_GROUPS.some((g) => g.zones.includes(iana));

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
  const { t } = useT();
  const now = new Date();
  const [name, setName] = useState(initial?.name ?? nameSeed ?? '');
  const [year, setYear] = useState(initial?.year ?? now.getFullYear());
  const [month, setMonth] = useState(initial?.month ?? now.getMonth() + 1);
  const [day, setDay] = useState(initial?.day ?? now.getDate());
  const [hour, setHour] = useState(initial?.hour ?? 12);
  const [minute, setMinute] = useState(initial?.minute ?? 0);
  // Organizing tag. Only Star is user-assignable (a None ⇄ Star toggle); the system
  // 'space' tag is set by future in-app tools, never here.
  const [tag, setTag] = useState<ChartTag>(initial?.tag ?? 'none');

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
  // Coordinates default to a read-only summary of the auto-chosen lat/lng; "Enter
  // manually" reveals the editable inputs (for raw-coordinate / rectified charts).
  const [showCoordInputs, setShowCoordInputs] = useState(false);

  // Timezone: the user picks an IANA zone, which defaults to the one detected from
  // the birthplace. zoneOverride = null means "follow the detected zone"; a string is
  // a zone the user deliberately chose instead. Either way the offset we save is the
  // chosen zone's DST-aware offset at the birth moment — exactly what birthDataToJD
  // subtracts to get the UT birth instant, so accuracy here is load-bearing.
  const [zoneOverride, setZoneOverride] = useState<string | null>(
    initial?.tzManual ? (initial.tzIana ?? null) : null,
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
  // The zone actually in effect (override if set, else detected) and its resolved
  // offset/DST-confidence. Recomputing the override here keeps it DST-aware as the
  // date changes; on the detected path we reuse `detected` rather than resolve twice.
  const effective = useMemo(
    () =>
      zoneOverride
        ? resolveZoneInfo(zoneOverride, year, month, day, hour, minute)
        : detected,
    [zoneOverride, detected, year, month, day, hour, minute],
  );
  const effectiveZone = effective?.iana ?? null;
  const effectiveOffset = effective?.offsetHours ?? 0;

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
      setError(t('chartForm.errorNoPlace'));
      return;
    }
    if (!name.trim()) {
      setError(t('chartForm.errorNoName'));
      return;
    }
    // tzOffset is the single value the chart math uses: the DST-aware offset of the
    // effective zone (detected, or the user's pick) at the birth moment. tzManual just
    // records whether that zone was a deliberate override, so the editor reopens on it.
    const manual = zoneOverride != null;
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
      tzIana: effectiveZone ?? undefined,
      tzManual: manual,
      tzUncertain: effective?.uncertain ?? false,
      birthplace: selectedPlace,
      tag,
      // A composite chart's parents survive an edit (renames, place tweaks):
      // the planet positions stay the midpoints.
      composite: initial?.composite,
    };
    if (initial?.composite) {
      // The stored moment IS the composite's sidereal frame (the parents'
      // midpoint — see lib/astro/composite.ts). Re-solve it on every save so
      // no edit path can desync the frame from that documented convention;
      // the moment fields are disabled above to match.
      Object.assign(chart, jdToCivil(solveCompositeJd(initial.composite)), {
        tzOffset: 0,
        tzIana: 'UTC',
        tzManual: true,
        tzUncertain: false,
      });
    }
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
          <span>{t('chartForm.name')}</span>
          <div className="name-field">
            <input
              type="text"
              value={name}
              maxLength={NAME_HARD_LIMIT}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('chartForm.namePlaceholder')}
            />
            {/* Count appears only as you near the cap, faint and right-aligned. */}
            {name.length >= NAME_SOFT_LIMIT && (
              <span className="name-count" aria-hidden="true">
                {name.length}/{NAME_HARD_LIMIT}
              </span>
            )}
          </div>
        </label>

        {/* The birth moment: date and time, side by side (shared with the timeline
            date modal so the moment editor stays identical across the app). A
            composite chart's moment is its synthesized sidereal-frame anchor —
            locked here, and re-solved from the parents on save regardless. */}
        {initial?.composite && (
          <p className="composite-moment-note">{t('chartForm.compositeMoment')}</p>
        )}
        <fieldset
          className="moment-fieldset"
          disabled={!!initial?.composite}
        >
        <DateTimeFields
          value={{ year, month, day, hour, minute }}
          onChange={(v) => {
            setYear(v.year);
            setMonth(v.month);
            setDay(v.day);
            setHour(v.hour);
            setMinute(v.minute);
          }}
          trailing={
            // A "Tag" field to the right of the time inputs: a caption (aligned with the
            // Date / Time captions) over a Star toggle whose label sits inside the button.
            // Only Star is user-assignable; 'space' is never set here.
            <div className="tag-field">
              <span className="moment-caption">{t('chartForm.tag.caption')}</span>
              <TipButton
                type="button"
                className="tag-toggle"
                aria-pressed={tag === 'star'}
                onClick={() => setTag((prev) => (prev === 'star' ? 'none' : 'star'))}
                placement="top"
                tip={
                  <>
                    <TagIcon tag="star" className="tag-icon" />
                    {t('chartForm.tag.assignTitle')}
                  </>
                }
                hint={t('chartForm.tag.assignHint')}
              >
                <TagIcon tag="star" className="tag-toggle-icon" />
                <span className="tag-toggle-label">{t('chartForm.tag.label')}</span>
              </TipButton>
            </div>
          }
        />
        </fieldset>

        <label className="location-field">
          <span>{t('chartForm.birthplace')}</span>
          <input
            type="text"
            value={locationQuery}
            onChange={(e) => {
              setLocationQuery(e.target.value);
              setSelectedPlace(null);
            }}
            placeholder={t('chartForm.birthplacePlaceholder')}
            autoComplete="off"
          />
          {(suggestions.length > 0 || searching) && !selectedPlace && (
            <ul className="suggestions">
              {searching && <li className="hint">{t('chartForm.searching')}</li>}
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
            <p className="resolved">{t('chartForm.resolved', { label: selectedPlace.label })}</p>
          )}
        </label>

        {/* Time zone: locked until a location is set, then defaults to the zone
            detected from the birthplace. The dropdown lets you choose another zone;
            "Auto" snaps back to the detected default. The offset shown is what the
            chart math uses — DST-aware for the birth moment. */}
        <label className="tz-field">
          <span>{t('chartForm.timeZone')}</span>
          <div className="tz-control-row">
            <select
              className="tz-select"
              aria-label={t('chartForm.tz.selectLabel')}
              // A composite's anchor moment is UT by construction (and
              // re-solved on save), so its zone isn't editable either.
              disabled={!selectedPlace || !!initial?.composite}
              value={selectedPlace ? (effectiveZone ?? '') : ''}
              onChange={(e) => setZoneOverride(e.target.value || null)}
            >
              {!selectedPlace && (
                <option value="">{t('chartForm.tz.setPlace')}</option>
              )}
              {selectedPlace && effectiveZone && !zoneInList(effectiveZone) && (
                <option value={effectiveZone}>{effectiveZone}</option>
              )}
              {selectedPlace &&
                ZONE_GROUPS.map((g) => (
                  <optgroup key={g.region} label={g.region}>
                    {g.zones.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
            <TipButton
              type="button"
              className="tz-auto"
              disabled={!selectedPlace || zoneOverride == null}
              onClick={() => setZoneOverride(null)}
              placement="top"
              tip={
                detected
                  ? t('chartForm.tz.autoTip', { iana: detected.iana })
                  : t('chartForm.tz.setPlace')
              }
            >
              {t('chartForm.tz.auto')}
            </TipButton>
          </div>
          <p className="tz-note">
            {selectedPlace ? (
              <>
                {formatUtcOffset(effectiveOffset)}
                {effective?.uncertain && (
                  <span className="tz-warn"> · ⚠ {t('chartForm.tz.verifyDst')}</span>
                )}
              </>
            ) : (
              t('chartForm.tz.setPlace')
            )}
          </p>
        </label>

        {/* Coordinates: a read-only summary of the auto-chosen lat/lng by default;
            "Enter manually" reveals the inputs to enter a chart by raw lat/lng (which
            reverse-geocodes a place + re-detects the zone). */}
        {showCoordInputs ? (
          <div className="row">
            <label>
              <span>{t('chartForm.latitude')}</span>
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
              <span>{t('chartForm.longitude')}</span>
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
        ) : (
          <div className="coord-summary">
            <span className="coord-summary-item">
              <span className="coord-summary-label">{t('chartForm.latitude')}</span>
              <span className="coord-summary-value">{latText ? `${latText}°` : '—'}</span>
            </span>
            <span className="coord-summary-item">
              <span className="coord-summary-label">{t('chartForm.longitude')}</span>
              <span className="coord-summary-value">{lngText ? `${lngText}°` : '—'}</span>
            </span>
            {/* Only worth offering once there are auto-chosen coords to refine. */}
            {latText.trim() !== '' && lngText.trim() !== '' && (
              <button
                type="button"
                className="coord-edit-link"
                onClick={() => setShowCoordInputs(true)}
              >
                {t('chartForm.enterCoords')}
              </button>
            )}
          </div>
        )}

        {error && <p className="form-error">{error}</p>}

        <footer>
          <div className="footer-left">
            {onImport && !initial && (
              <button type="button" className="secondary" onClick={onImport}>
                {t('chartForm.import')}
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
