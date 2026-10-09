// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { reverseGeocode, type GeocodeResult } from '../../lib/atlas/geocode';
import { fmtCoordPair } from '../../lib/coordFormat';
import { parseCoord } from '../../lib/import/fields';
import {
  folderName,
  isValidFolderName,
  loadLastFolder,
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_NAME,
  normalizeFolderPath,
  saveLastFolder,
  UNFILED,
} from '../../lib/chartFolders';
import { SOURCE_RATINGS, type SourceRating } from '../../lib/sourceRating';
import {
  NAME_HARD_LIMIT,
  NAME_SOFT_LIMIT,
  NOTES_HARD_LIMIT,
  newChartId,
  type ChartHome,
  type ChartTag,
  type StoredChart,
} from '../../lib/chartLibrary';
import { HintMenu } from '../Sidebar/Sidebar';
import { PlaceSearchField } from '../ui/PlaceSearchField';
import type { PlaceKind } from '../../lib/atlas/cityLookup';
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
import type { TFn } from '../../i18n';
import { TimeZoneField } from './TimeZoneField';
import { useZoneEntry } from './useZoneEntry';
import './BirthDataForm.css';

const approxEq = (a: number, b: number) => Math.abs(a - b) < 1e-5;

/** A typed latitude or longitude, or null: a decimal as before, and since
 *  2026-10-07 the DMS forms too (40°55'52"N, 40N55'52", 073°W53'56" — the
 *  summary's own form, so it can be copied back in), through the importer's
 *  reader, which refuses rather than guesses. A trailing degree sign on a
 *  decimal ("40.9312°") still reads, as it did when this was parseFloat. */
function readCoord(text: string, axis: 'lat' | 'lng'): number | null {
  const r = parseCoord(text, axis) ?? parseCoord(text.replace(/[°º]\s*$/, ''), axis);
  return r && !r.outOfRange ? r.value : null;
}

/** "9:30 am", "12:30 pm" for 12:30, "12:30 am" for 00:30 — the echo beside the
 *  time boxes. */
function twelveHour(hour: number, minute: number, t: TFn): string {
  const time = `${hour % 12 || 12}:${String(minute).padStart(2, '0')}`;
  return t(hour < 12 ? 'chartForm.timeEcho.am' : 'chartForm.timeEcho.pm', { time });
}

// A birthplace is a settlement — regions and countries aren't birthplaces, and
// offering them here only invites an imprecise chart. Module-level so the search
// field's memo sees a stable value.
const BIRTHPLACE_KINDS: readonly PlaceKind[] = ['city'];

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
  /** Folder paths that already exist, for the folder picker. Omitted (or empty)
   *  hides the row — there is nothing to file into yet. */
  folderOptions?: readonly string[];
  /** Folder a NEW chart should start in, e.g. the one open in the list. */
  folderSeed?: string;
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
  folderOptions,
  folderSeed,
}: BirthDataFieldsProps) {
  const { t } = useT();
  const [name, setName] = useState(initial?.name ?? nameSeed ?? '');
  // Where this chart is filed, and what is known about where its data came
  // from. Both ride the record; both are carried explicitly through submit
  // below, for the reason stated there.
  const [folder, setFolder] = useState(() =>
    normalizeFolderPath(
      // An existing chart keeps its own folder. A new one starts where the
      // list was pointing, or failing that where the last chart went.
      initial ? initial.folder : (folderSeed || loadLastFolder()),
    ),
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [sourceRating, setSourceRating] = useState<SourceRating | null>(
    () => initial?.sourceRating ?? null,
  );
  // Shown already when the chart HAS either — a chart that came in from an
  // import carries them, and leaving them behind a link nobody pressed would
  // read as having lost them.
  const [showNotes, setShowNotes] = useState(
    () => !!(initial?.notes || initial?.sourceRating),
  );
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const openedNotes = useRef(false);
  useEffect(() => {
    // Revealing the field is a request to type in it.
    if (showNotes && openedNotes.current) notesRef.current?.focus();
    openedNotes.current = showNotes;
  }, [showNotes]);
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
  // Which place the single search box edits — the birthplace, or Home. One box
  // serves both (the caption tabs above it switch the target), so the form
  // never shows two search inputs at once.
  const [placeTarget, setPlaceTarget] = useState<'birth' | 'home'>('birth');
  // True once the tabs have been used: from then on the search field takes
  // focus when a switch remounts it (switching means "now type"), without
  // stealing focus when the form first opens.
  const [placeTouched, setPlaceTouched] = useState(false);
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
  // raw lat/lng — the way many birth records / rectified charts are kept. They
  // hold decimals (exact; the DMS summary is rounded to the second) and read DMS
  // too (readCoord).
  const [latText, setLatText] = useState(
    initial ? String(initial.birthplace.lat) : '',
  );
  const [lngText, setLngText] = useState(
    initial ? String(initial.birthplace.lng) : '',
  );
  // Coordinates default to a read-only summary of the auto-chosen lat/lng; "Set
  // manually" reveals the editable inputs (for raw-coordinate / rectified charts).
  const [showCoordInputs, setShowCoordInputs] = useState(false);
  const summaryLat = readCoord(latText, 'lat');
  const summaryLng = readCoord(lngText, 'lng');
  const coordPair =
    summaryLat != null && summaryLng != null ? fmtCoordPair(summaryLat, summaryLng) : null;

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

  // Timezone: Auto (the zone detected from the birthplace, DST-aware) by default,
  // or a zone stated through TimeZoneField's radios (useZoneEntry; 2026-10-02,
  // radios since 2026-10-07).
  // Whichever way, the offset saved is the one value birthDataToJD subtracts to
  // get the UT birth instant, so accuracy here is load-bearing.
  // A DST-aware offset needs a whole moment, so detection waits for the DATE; an
  // empty TIME resolves at local noon — exactly the placeholder an unknown-time
  // chart stores, so what the field shows is what the chart math will use.
  const effHour = hour ?? 12;
  const effMinute = minute ?? 0;
  const zone = useZoneEntry(initial, selectedPlace, year, month, day, effHour, effMinute);

  // The 12-hour echo beside the time boxes (Lina, 2026-10-06): someone reading
  // "9:30 PM" off a certificate can type 09:30 and cast a chart twelve hours
  // out with nothing on screen contradicting them. It replaces the UT readback
  // as the error catch at the moment the error can enter. Never stored, never
  // shown elsewhere; hidden while the time is empty (an unknown time has no
  // half of the day). A bare hour reads as :00, as the save does.
  const echoId = useId();
  const echo = hour != null ? twelveHour(hour, minute ?? 0, t) : null;

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
    const lat = readCoord(latText, 'lat');
    const lng = readCoord(lngText, 'lng');
    if (lat == null || lng == null) return;
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
    // The zone fields as the field will save them (zoneEntryModel's toSave): a
    // record nobody's zone edit touched comes back verbatim, anything else as
    // resolved. A way in that has produced nothing yet, an offset box that
    // can't be read, or terms past ±15 h hold the save — saving would store the
    // previous way's number under the new way's name. (A composite's zone is
    // fixed and replaced below, so none of that applies to it.)
    const tz = zone.toSave;
    if (!initial?.composite && !tz) {
      setError(
        t(
          zone.error === 'offset'
            ? 'chartForm.tz.offsetUnread'
            : zone.error === 'direction'
              ? 'chartForm.tz.offsetDirection'
              : zone.error === 'range'
                ? 'chartForm.tz.errorRange'
                : 'chartForm.tz.errorPending',
        ),
      );
      return;
    }
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
      // tzOffset is the single value the chart math uses. tzManual records
      // whether the zone was given rather than detected, and tzEntry how it was
      // given where that is more than a zone name, so the editor reopens in the
      // same terms. All five carried explicitly, like everything below.
      tzOffset: tz?.tzOffset ?? 0,
      tzIana: tz?.tzIana,
      tzManual: tz?.tzManual ?? false,
      tzUncertain: tz?.tzUncertain ?? false,
      tzEntry: tz?.tzEntry,
      birthplace: selectedPlace,
      // Carried explicitly: this object REPLACES the stored record, so a field
      // the form forgets is a field the next edit silently drops.
      home,
      tag,
      folder: folder || undefined,
      notes: notes.trim() || undefined,
      sourceRating: sourceRating ?? undefined,
      // (saveLastFolder runs after the record is built — see below.)
      // A composite chart's parents survive an edit (renames, place tweaks):
      // the planet positions stay the midpoints.
      composite: initial?.composite,
      // So do a Davison chart's (2026-10-07): the header's "Derived from" line
      // reads them, and checks they still reproduce this moment and place.
      davison: initial?.davison,
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
        tzEntry: undefined,
      });
    }
    // Remember where this went, so the next chart starts there.
    saveLastFolder(folder);
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
          timeSuffix={
            echo && (
              <>
                <span className="time-echo" aria-hidden="true">
                  {echo}
                </span>
                {/* What the time boxes are described by: the echo is a visual
                    check, so it is described rather than announced live. */}
                <span id={echoId} hidden>
                  {t('chartForm.timeEcho.aria', { echo })}
                </span>
              </>
            )
          }
          timeDescribedBy={echo ? echoId : undefined}
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

        {/* Both of a chart's places — the birthplace, and where its subject
            lives NOW (optional; unset means "the birthplace") — share this one
            search box. The caption row doubles as the switch, and the `key`
            remounts the field on a switch so it opens on the new target's
            settled value with no half-typed draft carried across. */}
        <div className="location-field">
          <div
            className="location-field-tabs"
            role="radiogroup"
            aria-label={t('chartForm.placeTabsAria')}
          >
            {(['birth', 'home'] as const).map((tgt) => (
              <button
                key={tgt}
                type="button"
                role="radio"
                aria-checked={placeTarget === tgt}
                className={`location-field-tab${placeTarget === tgt ? ' is-on' : ''}`}
                onClick={() => {
                  if (placeTarget === tgt) return;
                  setPlaceTarget(tgt);
                  setPlaceTouched(true);
                }}
              >
                {t(tgt === 'birth' ? 'chartForm.birthplace' : 'chartForm.home')}
              </button>
            ))}
          </div>
          {/* The shared place-search field: same box, same keys, same scopes as
              every other place search in the app. The birthplace target is
              restricted to cities — a birthplace is a settlement, never a whole
              region or country — while Home accepts any place kind, like the
              other surfaces that set it. The online reach (on by default)
              covers what the bundled index has not: small towns and older
              place names. Home adopts its stored label so a pick shows settled
              and a Clear empties the box. */}
          <PlaceSearchField
            key={placeTarget}
            className="chartform-place"
            kinds={placeTarget === 'birth' ? BIRTHPLACE_KINDS : undefined}
            initialQuery={
              (placeTarget === 'birth' ? selectedPlace?.label : home?.label) ?? ''
            }
            adoptQuery={placeTarget === 'birth' ? adoptedLabel : (home?.label ?? '')}
            keepQueryOnPick
            autoFocus={placeTouched}
            onQueryChange={(q) => {
              if (placeTarget !== 'birth') return;
              setLocationQuery(q);
              // Typing over a resolved place unsettles it: submitting needs a
              // picked result, not a half-typed name.
              setSelectedPlace((p) => (p && p.label === q ? p : null));
            }}
            onPick={(s) =>
              placeTarget === 'birth'
                ? pickSuggestion(s)
                : setHome({ label: s.label, lat: s.lat, lng: s.lng, updatedAt: Date.now() })
            }
            placeholder={t(
              placeTarget === 'birth'
                ? 'chartForm.birthplacePlaceholder'
                : 'chartForm.homePlaceholder',
            )}
            ariaLabel={t(placeTarget === 'birth' ? 'chartForm.birthplace' : 'chartForm.homeAria')}
            strings={placeSearchStrings}
          />
          {placeTarget === 'birth' && selectedPlace && (
            <p className="resolved">{t('chartForm.resolved', { label: selectedPlace.label })}</p>
          )}
          {placeTarget === 'home' && (
            <>
              {home ? (
                <p className="resolved home-resolved">
                  {t('chartForm.resolved', { label: home.label })}
                  <button type="button" className="coord-edit-link" onClick={() => setHome(null)}>
                    {t('chartForm.homeClear')}
                  </button>
                </p>
              ) : (
                <p className="home-unset-note">{t('chartForm.homeUnset')}</p>
              )}
              {/* Trails the value, set or not: the tabs put this beside the
                  birthplace as an equal, so say plainly that it isn't one. */}
              <p className="home-hint">{t('chartForm.homeHint')}</p>
            </>
          )}
        </div>

        {/* Time zone, straight after the places and before the coordinates
            (Salvatore, 2026-10-09 — it sat beside the time from 2026-10-06,
            Lina's placement, and under the birthplace before that): the zone is
            detected from the birthplace, so it reads after it. The zone in force
            for the entered date, by name, with "Set manually" for the chooser —
            the coordinates' pattern. Locked until a birthplace and date exist. A
            composite's zone is fixed at UT. */}
        <TimeZoneField zone={zone} hasPlace={!!selectedPlace} />

        {/* Coordinates: a read-only summary of the auto-chosen lat/lng by default,
            in DMS with the longitude padded to three digits (2026-10-07: every
            other surface prints a chart's place so; it showed decimals); "Set
            manually" reveals the inputs to enter a chart by raw lat/lng (which
            reverse-geocodes a place + re-detects the zone). */}
        {showCoordInputs ? (
          <div className="row">
            <label>
              <span>{t('chartForm.latitude')}</span>
              <input
                type="text"
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
              <span className="coord-summary-label">{t('chartForm.coordinates')}</span>
              <span className="coord-summary-value">{coordPair ?? '—'}</span>
            </span>
            {/* Only worth offering once there are auto-chosen coords to refine. */}
            {coordPair && (
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

        {/* The chart's tag, on its own row since 2026-10-07 (it was a column
            beside the time boxes, which the 12-hour echo now needs; Lina's
            order puts it after the coordinates). Normally a Star toggle (the
            only user-ASSIGNABLE tag). A chart carrying a SYSTEM tag shows that
            here instead: 'shared' (a link-received chart) is highlighted and
            REMOVABLE — pressing clears it and the button reverts to the plain
            Star toggle — while 'space' (an app-generated chart) is a fixed
            mark, shown but not editable. */}
        <div className="tag-field">
          <span className="coord-summary-label">{t('chartForm.tag.caption')}</span>
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

        {/* Notes hold whatever came in with the record: the source, a rating,
            why a time is only remembered. That last is the part of an imported
            chart an astrologer would most mind losing — but it is wanted
            occasionally, not every time, so it costs one line of link until
            asked for. */}
        {showNotes ? (
          <div className="notes-row">
            <label className="notes-field">
              <span>{t('chartForm.notes')}</span>
              <textarea
                ref={notesRef}
                value={notes}
                rows={2}
                maxLength={NOTES_HARD_LIMIT}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('chartForm.notesPlaceholder')}
              />
            </label>
            {/* How far this birth data can be trusted. Beside the notes because
                it is the same question — where did this come from — answered
                once in prose and once in a form the app can reason about. */}
            <div className="rating-field">
              <span className="rating-label">{t('chartForm.sourceRating')}</span>
              {/* The app's own dropdown — the same one the Calculations settings
                  use — rather than a native <select>. A native one can only be
                  styled shut: the open list is drawn by the operating system and
                  looks nothing like the rest of the app. This also lets each
                  option carry its full meaning as a hover explanation, so the
                  labels can stay short enough to leave the notes box its width. */}
              <div className="calc-select">
                <HintMenu<SourceRating | ''>
                  value={sourceRating ?? ''}
                  onChange={(v) => setSourceRating(v === '' ? null : v)}
                  options={[
                    {
                      value: '' as const,
                      label: t('chartForm.rating.unset'),
                      hint: t('chartForm.rating.unsetHint'),
                    },
                    ...SOURCE_RATINGS.map((code) => ({
                      value: code,
                      label: `${code} · ${t(`chartForm.rating.${code}` as 'chartForm.rating.AA')}`,
                      hint: t(`chartForm.ratingHint.${code}` as 'chartForm.ratingHint.AA'),
                    })),
                  ]}
                />
              </div>
            </div>
          </div>
        ) : (
          <button type="button" className="notes-link" onClick={() => setShowNotes(true)}>
            {t('chartForm.addNotes')}
          </button>
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
            {/* Where this chart lands, chosen right where it is saved. Defaults
                to the folder the last chart went into, because charts arrive in
                runs — several clients, then some family — and re-choosing the
                same folder every time is the sort of small friction that stops
                people filing at all. */}
            <FolderPicker
              value={folder}
              options={folderOptions ?? []}
              onChange={setFolder}
              t={t}
            />
            <button type="submit" className="primary ui-sheen">
              {submitLabel}
            </button>
          </div>
        </footer>
    </form>
  );
}

/**
 * Where the chart being saved will land.
 *
 * Sits beside the submit button because that is the moment the question is
 * actually being asked. A menu of the folders that exist, plus a line to type
 * a new one — so a folder can be made without leaving the form, which is the
 * only way filing ever gets done in the middle of entering a chart.
 */
function FolderPicker({
  value,
  options,
  onChange,
  t,
}: {
  value: string;
  options: readonly string[];
  onChange: (path: string) => void;
  t: TFn;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const newRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  useEffect(() => {
    if (creating) newRef.current?.focus();
  }, [creating]);

  const choose = (path: string) => {
    onChange(path);
    setOpen(false);
    setCreating(false);
  };

  const commitNew = () => {
    const name = draft.trim();
    // A slash makes a subfolder, so the typed text is a PATH: validate the
    // last segment, which is the part being named.
    const path = normalizeFolderPath(name);
    if (path && isValidFolderName(folderName(path))) choose(path);
    else {
      setCreating(false);
      setDraft('');
    }
  };

  return (
    <div className="folder-picker" ref={ref}>
      <TipButton
        type="button"
        className={`folder-picker-trigger ${value ? 'is-filed' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        placement="top"
        tip={t('chartForm.folderPicker.tip')}
      >
        <FolderIcon />
        <span className="folder-picker-value">
          {value ? folderName(value) : t('chartForm.folderPicker.unfiled')}
        </span>
        <span className="folder-picker-caret" aria-hidden="true">
          ▾
        </span>
      </TipButton>

      {open && (
        <div className="folder-picker-menu" role="menu">
          <button
            type="button"
            className={`folder-picker-item ${value ? '' : 'is-current'}`}
            onClick={() => choose(UNFILED)}
          >
            {t('chartForm.folderPicker.unfiled')}
          </button>
          {options.map((path) => (
            <button
              key={path}
              type="button"
              className={`folder-picker-item ${path === value ? 'is-current' : ''}`}
              style={{ '--depth': path.split('/').length - 1 } as CSSProperties}
              onClick={() => choose(path)}
            >
              {folderName(path)}
            </button>
          ))}
          <div className="folder-picker-new">
            {creating ? (
              <input
                ref={newRef}
                type="text"
                value={draft}
                maxLength={MAX_FOLDER_NAME * MAX_FOLDER_DEPTH}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitNew();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    setCreating(false);
                    setDraft('');
                  }
                }}
                onBlur={commitNew}
                placeholder={t('chartForm.folderPicker.newPlaceholder')}
                aria-label={t('chartForm.folderPicker.new')}
              />
            ) : (
              <button
                type="button"
                className="folder-picker-item is-new"
                onClick={() => {
                  setDraft(value ? `${value}/` : '');
                  setCreating(true);
                }}
              >
                ＋ {t('chartForm.folderPicker.new')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FolderIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}
