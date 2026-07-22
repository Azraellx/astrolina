// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useMemo, useRef, useState } from 'react';
import { reverseGeocode, type GeocodeResult } from '../../lib/atlas/geocode';
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
  type ChartHome,
  type ChartTag,
  type StoredChart,
} from '../../lib/chartLibrary';
import { PlaceSearchField } from '../ui/PlaceSearchField';
import type { PlaceKind } from '../../lib/atlas/cityLookup';
import { ChartHomeEditor } from '../ui/ChartHomeEditor';
import { TipButton, TipSpan } from '../ui/HoverTip';
import { TagIcon } from '../ui/TagIcon';
import { jdToCivil } from '../../lib/ephemeris';
import { solveCompositeFrameJd } from '../../lib/astro/composite';
import {
  DateTimeFields,
  BIRTH_YEAR_MIN,
  BIRTH_YEAR_MAX,
} from '../DateTimeFields/DateTimeFields';
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

// A birthplace is a settlement — regions and countries aren't birthplaces, and
// offering them here only invites an imprecise chart. Module-level so the search
// field's memo sees a stable value.
const BIRTHPLACE_KINDS: readonly PlaceKind[] = ['city'];

// Whole-hour UTC offsets (−12 … +14) for the quick offset picker, each mapped to its
// fixed-offset Etc/GMT zone. Note the IANA sign flip — Etc/GMT+4 is UTC−4 — so a user
// who knows their offset can pick it without scrolling the full zone list; Luxon
// resolves these to a constant, DST-free offset.
const UTC_OFFSETS: number[] = Array.from({ length: 27 }, (_, i) => i - 12);
const etcZoneForOffset = (o: number): string =>
  o === 0 ? 'Etc/GMT' : `Etc/GMT${o > 0 ? '-' : '+'}${Math.abs(o)}`;

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
  const [name, setName] = useState(initial?.name ?? nameSeed ?? '');
  // A new chart starts with empty date/time fields (null) rather than "today" —
  // pre-filling a real-looking date reads as a half-entered chart you're editing.
  // Editing an existing chart loads its saved values — EXCEPT an unknown-time
  // chart's 12:00 placeholder, which reopens as the empty time it really is
  // (leaving the time empty is exactly how "unknown" is expressed here).
  const [year, setYear] = useState<number | null>(initial?.year ?? null);
  const [month, setMonth] = useState<number | null>(initial?.month ?? null);
  const [day, setDay] = useState<number | null>(initial?.day ?? null);
  const [hour, setHour] = useState<number | null>(
    initial ? (initial.timeKnown === false ? null : initial.hour) : null,
  );
  const [minute, setMinute] = useState<number | null>(
    initial ? (initial.timeKnown === false ? null : initial.minute) : null,
  );
  // Organizing tag. Only Star is user-assignable (a None ⇄ Star toggle); the system
  // 'space' tag is set by future in-app tools, never here.
  const [tag, setTag] = useState<ChartTag>(initial?.tag ?? 'none');
  // An EMPTY time is how an unknown birth time is entered: both boxes blank →
  // the chart saves timeKnown: false anchored at local noon, and every
  // time-of-day-dependent layer downstream degrades honestly. The list marks
  // such charts with the grey "?" tag (system-derived, like 'space').
  const noTime = hour == null && minute == null;

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
  // A label resolved by the COORDINATE path below (not typed) — handed to the
  // search field to adopt as a settled answer rather than a fresh query.
  const [adoptedLabel, setAdoptedLabel] = useState<string | undefined>(undefined);
  // Where this chart's subject lives now; absent = the birthplace.
  const [home, setHome] = useState<ChartHome | null>(initial?.home ?? null);
  const [error, setError] = useState<string | null>(null);
  // The search field takes its copy as props (it also mounts outside this i18n
  // tree elsewhere); both fields here share one translated set.
  const placeSearchStrings = useMemo(
    () => ({
      scopeLabel: t('placeSearch.scopeLabel'),
      noMatches: t('placeSearch.noMatches'),
      failed: t('placeSearch.failed'),
      scopeAria: t('placeSearch.scopeAria'),
      more: t('placeSearch.more'),
    }),
    [t],
  );

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

  // If a birthplace is chosen while the date is still blank, fill the DATE with
  // "today" so the time zone (which anchors at noon until a time is typed) is
  // editable straight away — the user can then adjust it. The TIME stays empty on
  // purpose: an empty time means "unknown", so pre-filling it would silently claim
  // a birth minute nobody entered. Guarded on every field being empty, so it never
  // overwrites a date you've already started entering.
  useEffect(() => {
    if (
      !selectedPlace ||
      year != null ||
      month != null ||
      day != null ||
      hour != null ||
      minute != null
    ) {
      return;
    }
    const now = new Date();
    /* eslint-disable react-hooks/set-state-in-effect */
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    setDay(now.getDate());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [selectedPlace, year, month, day, hour, minute]);

  // Timezone: the user picks an IANA zone, which defaults to the one detected from
  // the birthplace. zoneOverride = null means "follow the detected zone"; a string is
  // a zone the user deliberately chose instead. Either way the offset we save is the
  // chosen zone's DST-aware offset at the birth moment — exactly what birthDataToJD
  // subtracts to get the UT birth instant, so accuracy here is load-bearing.
  const [zoneOverride, setZoneOverride] = useState<string | null>(
    initial?.tzManual ? (initial.tzIana ?? null) : null,
  );
  // A DST-aware offset needs a whole moment, so detection waits for the DATE; an
  // empty TIME resolves at local noon — exactly the placeholder an unknown-time
  // chart stores, so what the picker shows is what the chart math will use.
  const effHour = hour ?? 12;
  const effMinute = minute ?? 0;
  const detected = useMemo(
    () =>
      selectedPlace && year != null && month != null && day != null
        ? resolveBirthTimezone(
            selectedPlace.lat,
            selectedPlace.lng,
            year,
            month,
            day,
            effHour,
            effMinute,
          )
        : null,
    [selectedPlace, year, month, day, effHour, effMinute],
  );
  // The zone actually in effect (override if set, else detected) and its resolved
  // offset/DST-confidence. Recomputing the override here keeps it DST-aware as the
  // date changes; on the detected path we reuse `detected` rather than resolve twice.
  // Picking the very zone that auto-detection chose counts as the detected path —
  // otherwise re-selecting the displayed zone would silently swap an LMT-era
  // birth from the birthplace's mean time to the zone reference city's.
  const effective = useMemo(
    () =>
      zoneOverride &&
      zoneOverride !== detected?.iana &&
      year != null &&
      month != null &&
      day != null
        ? resolveZoneInfo(zoneOverride, year, month, day, effHour, effMinute)
        : detected,
    [zoneOverride, detected, year, month, day, effHour, effMinute],
  );
  const effectiveZone = effective?.iana ?? null;
  const effectiveOffset = effective?.offsetHours ?? 0;
  // The tz controls are usable once a place is set AND the moment is complete (the
  // offset is DST-aware, so it needs the full date); until then they prompt for
  // what's missing rather than show a misleading UTC+00:00.
  const tzReady = !!selectedPlace && effective != null;
  // The quick UTC-offset picker mirrors the IANA dropdown's effective offset (both
  // write zoneOverride). A whole-hour offset maps to its standard Etc/GMT option; a
  // half-hour zone (e.g. +05:30) keeps an exact leading option.
  const offsetIsWholeHour = Number.isInteger(effectiveOffset);
  const utcSelectValue = offsetIsWholeHour
    ? etcZoneForOffset(effectiveOffset)
    : (effectiveZone ?? '');

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
      // The search box shows what the coordinates resolved to, without treating
      // it as something the user typed (which would search it straight back).
      setLocationQuery(place.label);
      setAdoptedLabel(place.label);
    }, 500);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [latText, lngText]);

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
    if (year == null || month == null || day == null) {
      setError(t('chartForm.errorNoDate'));
      return;
    }
    // The time is optional (empty = unknown), but minutes without an hour is an
    // incomplete entry, not a statement — block it with an explanation. An hour
    // without minutes reads as on-the-hour (:00), the way people say times.
    if (hour == null && minute != null) {
      setError(t('chartForm.errorPartialTime'));
      return;
    }
    // The year box doesn't auto-clamp to the data range (so a typo isn't silently
    // "corrected"); block submission instead, with the same range explanation.
    if (year < BIRTH_YEAR_MIN || year > BIRTH_YEAR_MAX) {
      setError(
        t('chartForm.errorYearRange', {
          min: BIRTH_YEAR_MIN,
          max: BIRTH_YEAR_MAX,
        }),
      );
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
      // An empty time saves the local-noon placeholder; a bare hour saves :00.
      hour: noTime ? 12 : (hour as number),
      minute: noTime ? 0 : (minute ?? 0),
      // Only ever stored as an explicit false — a known time stays an absent field,
      // so older records and this form mean the same thing (see lib/birthData.ts).
      timeKnown: noTime ? false : undefined,
      tzOffset: effectiveOffset,
      tzIana: effectiveZone ?? undefined,
      tzManual: manual,
      tzUncertain: effective?.uncertain ?? false,
      birthplace: selectedPlace,
      // Carried explicitly: this object REPLACES the stored record, so a field
      // the form forgets is a field the next edit silently drops.
      home,
      tag,
      // A composite chart's parents survive an edit (renames, place tweaks):
      // the planet positions stay the midpoints.
      composite: initial?.composite,
    };
    if (initial?.composite) {
      // The stored moment IS the composite's angle frame (the ASC-midpoint of
      // the parents — see lib/astro/composite.ts). Re-solve it on every save so
      // no edit path can desync the frame from that documented convention;
      // the moment fields are disabled above to match.
      Object.assign(chart, jdToCivil(solveCompositeFrameJd(initial.composite)), {
        tzOffset: 0,
        tzIana: 'UTC',
        tzManual: true,
        tzUncertain: false,
      });
    }
    onSubmit(chart);
  };

  const pickSuggestion = (s: GeocodeResult) => {
    setSelectedPlace({ label: s.label, lat: s.lat, lng: s.lng });
    setLocationQuery(s.label);
    setLatText(String(s.lat));
    setLngText(String(s.lng));
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
          yearHint={t('chartForm.yearRangeTip', {
            min: BIRTH_YEAR_MIN,
            max: BIRTH_YEAR_MAX,
          })}
          timeClearable
          onChange={(v) => {
            setYear(v.year);
            setMonth(v.month);
            setDay(v.day);
            setHour(v.hour);
            setMinute(v.minute);
          }}
          trailing={
            // A "Tag" field to the right of the time inputs: a caption (aligned with the
            // Date / Time captions) over the tag toggle. Normally a Star toggle (the only
            // user-ASSIGNABLE tag). A chart carrying a SYSTEM tag shows that here instead:
            // 'shared' (a link-received chart) is highlighted and REMOVABLE — pressing
            // clears it and the button reverts to the plain Star toggle — while 'space'
            // (an app-generated chart) is a fixed mark, shown but not editable.
            <div className="tag-field">
              <span className="moment-caption">{t('chartForm.tag.caption')}</span>
              {tag === 'shared' ? (
                <TipButton
                  type="button"
                  className="tag-toggle tag-toggle--shared"
                  aria-pressed={true}
                  onClick={() => setTag('none')}
                  placement="top"
                  tip={
                    <>
                      <TagIcon tag="shared" className="tag-icon" />
                      {t('chartForm.tag.removeSharedTitle')}
                    </>
                  }
                  hint={t('chartForm.tag.removeSharedHint')}
                >
                  <TagIcon tag="shared" className="tag-toggle-icon" />
                  <span className="tag-toggle-label">{t('chartForm.tag.sharedLabel')}</span>
                </TipButton>
              ) : tag === 'space' ? (
                <TipSpan
                  className="tag-toggle tag-toggle--space is-fixed"
                  placement="top"
                  tapReveal
                  tip={
                    <>
                      <TagIcon tag="space" className="tag-icon" />
                      {t('chartForm.tag.spaceTitle')}
                    </>
                  }
                  hint={t('chartForm.tag.spaceHint')}
                >
                  <TagIcon tag="space" className="tag-toggle-icon" />
                  <span className="tag-toggle-label">{t('chartForm.tag.spaceLabel')}</span>
                </TipSpan>
              ) : (
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
              )}
            </div>
          }
        />
        {/* An EMPTY time means "birth time unknown" (never for a composite — its
            moment is synthesized). The note appears once the user has moved PAST
            the time — they've started on the birthplace with the boxes still
            blank — and says what will happen on save, so the grey "?" tag and the
            hidden lines never surprise anyone. */}
        {!initial?.composite &&
          noTime &&
          (selectedPlace != null || locationQuery.trim() !== '') && (
            <p className="time-unknown-note">{t('chartForm.timeUnknown.hint')}</p>
          )}
        </fieldset>

        <div className="location-field">
          <span className="location-field-label">{t('chartForm.birthplace')}</span>
          {/* The shared place-search field: same box, same keys, same scopes as
              every other place search in the app. Restricted to cities — a
              birthplace is a settlement, never a whole region or country — and
              allowed to fall back to the online geocoder when the bundled index
              has nothing (small towns and older place names). */}
          <PlaceSearchField
            className="chartform-place"
            kinds={BIRTHPLACE_KINDS}
            onlineFallback
            initialQuery={initial?.birthplace.label ?? ''}
            adoptQuery={adoptedLabel}
            keepQueryOnPick
            onQueryChange={(q) => {
              setLocationQuery(q);
              // Typing over a resolved place unsettles it: submitting needs a
              // picked result, not a half-typed name.
              setSelectedPlace((p) => (p && p.label === q ? p : null));
            }}
            onPick={pickSuggestion}
            placeholder={t('chartForm.birthplacePlaceholder')}
            ariaLabel={t('chartForm.birthplace')}
            strings={placeSearchStrings}
          />
          {selectedPlace && (
            <p className="resolved">{t('chartForm.resolved', { label: selectedPlace.label })}</p>
          )}
        </div>

        {/* Where this person lives NOW. Optional, and unset simply means "the
            birthplace" — but a chart whose subject has moved carries both, so
            the direction-based views can radiate from the right one. */}
        <div className="location-field home-field">
          <span className="location-field-label">{t('chartForm.home')}</span>
          <ChartHomeEditor
            value={home}
            onChange={(h) => setHome(h ? { ...h, updatedAt: Date.now() } : null)}
            className="chartform-home"
            strings={{
              unset: t('chartForm.homeUnset'),
              set: t('chartForm.homeSet'),
              change: t('chartForm.homeChange'),
              cancel: t('chartForm.homeCancel'),
              clear: t('chartForm.homeClear'),
              placeholder: t('chartForm.homePlaceholder'),
              searchAria: t('chartForm.homeAria'),
            }}
            searchStrings={placeSearchStrings}
          />
        </div>

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
              disabled={!tzReady || !!initial?.composite}
              value={tzReady ? (effectiveZone ?? '') : ''}
              onChange={(e) => setZoneOverride(e.target.value || null)}
            >
              {!tzReady && (
                <option value="">
                  {selectedPlace
                    ? t('chartForm.tz.setDate')
                    : t('chartForm.tz.setPlace')}
                </option>
              )}
              {tzReady && effectiveZone && !zoneInList(effectiveZone) && (
                <option value={effectiveZone}>{effectiveZone}</option>
              )}
              {tzReady &&
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
            {/* Quick UTC-offset picker, synced with the IANA dropdown through the
                shared effective zone (both write zoneOverride): for users who know
                their offset and don't want to scroll the full list. Choosing one
                sets the matching fixed Etc/GMT zone. Hidden until a birthplace is
                chosen — there's no offset to show before then. */}
            {selectedPlace && (
              <select
                className="tz-select tz-utc-select"
                aria-label={t('chartForm.tz.utcLabel')}
                disabled={!tzReady || !!initial?.composite}
                value={tzReady ? utcSelectValue : ''}
                onChange={(e) => setZoneOverride(e.target.value || null)}
              >
                {!tzReady && <option value="">—</option>}
                {/* Labels keep the full "UTC±HH:MM" (acronym included); the box is
                    sized to fit it. */}
                {tzReady && !offsetIsWholeHour && (
                  <option value={effectiveZone ?? ''}>
                    {formatUtcOffset(effectiveOffset)}
                  </option>
                )}
                {tzReady &&
                  UTC_OFFSETS.map((o) => (
                    <option key={o} value={etcZoneForOffset(o)}>
                      {formatUtcOffset(o)}
                    </option>
                  ))}
              </select>
            )}
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
          {tzReady &&
            ((effective?.lmt && !zoneOverride) || effective?.uncertain) && (
              <p className="tz-note">
                {effective?.lmt && !zoneOverride && (
                  <span>{t('chartForm.tz.lmt')}</span>
                )}
                {effective?.lmt && !zoneOverride && effective?.uncertain && (
                  <span> · </span>
                )}
                {effective?.uncertain && (
                  <span className="tz-warn">⚠ {t('chartForm.tz.verifyDst')}</span>
                )}
              </p>
            )}
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
            <button type="submit" className="primary ui-sheen">
              {submitLabel}
            </button>
          </div>
        </footer>
    </form>
  );
}
