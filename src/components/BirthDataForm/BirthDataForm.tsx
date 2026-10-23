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
  loadLastEventFolder,
  loadLastFolder,
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_NAME,
  normalizeFolderPath,
  saveLastEventFolder,
  saveLastFolder,
  UNFILED,
} from '../../lib/chartFolders';
import { formOpeningKind, kindField, type ChartKindOf } from '../../lib/eventCharts';
import type { ZodiacMode } from '../../lib/astro/ayanamsa';
import { formatUtcNotation } from '../../lib/atlas/zoneEntry';
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
import { homeLabelOf, mapPinSection } from '../ui/ChartHomeEditor';
import type { PlaceKind } from '../../lib/atlas/cityLookup';
import { TipButton, TipSpan } from '../ui/HoverTip';
import { SplitSelect } from '../ui/SplitSelect';
import { TagIcon } from '../ui/TagIcon';
import { nudgeAction } from '../../lib/plan';
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
import { zoneFixHolds, zoneFixStep, type FormInstant, type ZoneFix } from './zoneEntryModel';
import { foundEventOf, type FoundEvent } from '../../lib/astro/eventNaming';
import { EventFinder } from './EventFinder';
import {
  instantAnchor,
  instantOfFound,
  remembersFolder,
  shownFolder,
  shownName,
  typedAnchor,
} from './eventFinderModel';
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
  /** Put the cursor in the name field on mount. Off by default: the form usually opens
   *  beside a search box, which has the better claim. */
  autoFocusName?: boolean;
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
  /** Event charts are on offer (2026-10-20): the geodetic hold is lifted on this
   *  device, so the form shows the Person | Event switch. Omitted (false), the form is
   *  a person's exactly as before — and an event being edited still keeps its kind,
   *  which the save carries whether or not the switch is shown. */
  eventsOn?: boolean;
  /** Event charts locked below the ADV rung, the build nudging (2026-10-21): the switch
   *  still shows, its Event half wears the rung's badge, and pressing it runs the upgrade flow. */
  eventsTeaser?: boolean;
  /** The kind a NEW chart opens on while `eventsOn`: Event on a geodetic map, where the
   *  world's charts are the work, Person elsewhere. The caller derives it from the
   *  DERIVED line system; it is never stored. Omitted → Person. */
  defaultKind?: ChartKindOf;
  /** The EFFECTIVE zodiac (App's effZodiacMode), which a moment found for an event chart
   *  follows — an ingress in sidereal is a sidereal ingress. Omitted → tropical. */
  zodiac?: ZodiacMode;
  /** The placed map pin, offered in the Lives now box before anything is typed (ChartHomeEditor
   *  mapPinSection): the way in for a home no search finds. Null with no pin, or the natal one.
   *  (2026-10-23) */
  mapPin?: { lat: number; lng: number; label: string } | null;
}

// The birth-details form body (name, date/time, birthplace), without modal chrome,
// so it can live inside the ChartManager's right pane for both add and edit. Owns
// its own field state; calls onSubmit with the built StoredChart.
export function BirthDataFields({
  initial,
  nameSeed,
  autoFocusName = false,
  submitLabel,
  onSubmit,
  onImport,
  folderOptions,
  folderSeed,
  eventsOn = false,
  eventsTeaser = false,
  defaultKind = 'person',
  // Until App hands the effective zodiac down (R3), a found ingress is a tropical one.
  zodiac = 'tropical',
  mapPin = null,
}: BirthDataFieldsProps) {
  const { t, fmt } = useT();
  // The name the READER gave, or null while they have given none (2026-10-20): the field
  // then shows the name a found moment suggests (`suggestion`, below), derived and never
  // written in, so a suggestion can never overwrite what was typed — and a field the reader
  // cleared stays empty, since '' is theirs too. An edited chart's name, and a name carried
  // over from the search box, are the reader's from the start.
  const [nameOwn, setNameOwn] = useState<string | null>(initial?.name ?? (nameSeed || null));
  // What the chart's moment is (2026-10-20): the FACT the record carries
  // (StoredChart.kind). An existing chart keeps its own — on a held device too, where
  // the switch isn't shown, so an event edited there is still an event; a new one opens
  // on the caller's derived default, and only while event charts are on offer.
  const [kind, setKind] = useState<ChartKindOf>(() => formOpeningKind(initial, eventsOn, defaultKind));
  // What the form SHOWS, which every label below reads: the hold presents an event
  // as a person, so a held device's form is exactly the person form it always was.
  const isEvent = eventsOn && kind === 'event';
  // The folder a NEW chart of a kind starts in: where the list was pointing, or failing
  // that where the last chart of that kind went (lib/chartFolders keeps the two runs
  // apart — an ingress saved a moment ago is no reason to file the next client there).
  // Derived from the kind, so switching it moves the default along.
  const kindFolder = useMemo(
    () => normalizeFolderPath(folderSeed || (kind === 'event' ? loadLastEventFolder() : loadLastFolder())),
    [kind, folderSeed],
  );
  // The folder the READER chose here, or null while they have chosen none (2026-10-20). An
  // existing chart keeps its own, as theirs. While it is null the chart is filed in a found
  // moment's suggested folder, if there is one, else in the kind's default — both derived
  // (`folder`, below), so neither a kind switch nor a suggestion ever overrides a pick.
  // Where it is filed, and what is known about where its data came from, both ride the
  // record; both are carried explicitly through submit below, for the reason stated there.
  const [folderOwn, setFolderOwn] = useState<string | null>(() =>
    initial ? normalizeFolderPath(initial.folder) : null,
  );
  const chooseKind = (k: ChartKindOf) => {
    if (k !== kind) setKind(k);
  };
  // A moment the form was handed rather than typed — the Now button, or (from the
  // panel that finds one) an ingress, a lunation… — or null. While set, the date and
  // time boxes SHOW it, read in the zone the form holds, and are derived from it on
  // every render (useZoneEntry `derived`): changing the zone or the place moves the
  // clock, never the moment. Typing in a box releases it (the DateTimeFields onChange
  // below). See zoneEntryModel's FormInstant for the rounding.
  const [instant, setInstant] = useState<FormInstant | null>(null);
  // The moment Find the moment last filled in, whose name and folder the form suggests
  // until the reader gives their own (nameOwn / folderOwn). Null after Now, which is a
  // moment but not an event anyone named.
  const [found, setFound] = useState<FoundEvent | null>(null);
  // The panel that finds one, open under the date (Event mode only).
  const [finderOpen, setFinderOpen] = useState(false);
  const finderId = useId();
  const findButtonId = useId();
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
  // The tab in force: an event has only its place (the Lives now tab is a person's), so
  // Event reads the birthplace target whatever the tab state says, and switching back
  // to Person finds the tab where it was.
  const target = isEvent ? 'birth' : placeTarget;
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
  // overwrites a date you've already started entering — and on there being no
  // instant, whose clock the boxes already show (2026-10-20).
  useEffect(() => {
    if (
      !selectedPlace ||
      instant != null ||
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
  }, [selectedPlace, instant, year, month, day, hour, minute]);

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
  const zone = useZoneEntry(initial, selectedPlace, year, month, day, effHour, effMinute, instant);
  // The moment the boxes SHOW, and the save writes: an instant's clock while one is
  // held (read through the zone field, so it is the clock its own save casts back to
  // the instant), else what was typed.
  const shown = zone.derived;
  const mYear = shown ? shown.year : year;
  const mMonth = shown ? shown.month : month;
  const mDay = shown ? shown.day : day;
  const mHour = shown ? shown.hour : hour;
  const mMinute = shown ? shown.minute : minute;
  // An EMPTY time is how an unknown birth time is entered: both boxes blank →
  // the chart saves timeKnown: false anchored at local noon, and every
  // time-of-day-dependent layer downstream degrades honestly. The list marks
  // such charts with the grey "?" tag (system-derived, like 'space'). An
  // instant always has a time.
  const noTime = mHour == null && mMinute == null;

  // What a found moment suggests (2026-10-20), only while the form is an event's: switch to
  // Person and the suggestion steps aside — it names an event — and comes back with Event.
  // Rebuilt in the language in force, so a language switch with the form open re-words it.
  const suggestion = useMemo(
    () => (found && isEvent ? foundEventOf({ jd: found.jd, detail: found.detail }, t, fmt) : null),
    [found, isEvent, t, fmt],
  );
  // The name and folder the form shows and saves: the reader's, else the suggestion — named
  // for the date the boxes SHOW, which in Melbourne can be a day past the UT date — else
  // the default (eventFinderModel shownName / shownFolder).
  const name = shownName(
    nameOwn,
    suggestion,
    mYear != null && mMonth != null && mDay != null ? { year: mYear, month: mMonth, day: mDay } : null,
  );
  const folder = shownFolder(folderOwn, suggestion, kindFolder);

  // Where Find the moment searches from: the instant the boxes show, exactly — or what was
  // typed, at the offset the zone field would save it with — or, with nothing entered, now.
  const finderAnchor =
    instant && shown
      ? instantAnchor(instant, shown)
      : typedAnchor({ year, month, day, hour, minute }, zone.toSave?.tzOffset ?? null, {
          min: BIRTH_YEAR_MIN,
          max: BIRTH_YEAR_MAX,
        });
  const finderShown = finderOpen && isEvent && !initial?.composite;
  // A found moment is the moment the reader asked for: the boxes show it (as an instant,
  // read in whichever zone the form holds), and its name and folder are suggested.
  const takeFound = (f: FoundEvent) => {
    setError(null);
    setInstant(instantOfFound(f));
    setFound(f);
  };

  // The hour that happens twice (2026-10-20). A moment handed to the form can fall in
  // the repeated autumn hour, where Automatic reads the clock as its FIRST occurrence;
  // the second can then only be cast by stating its offset. That is a precondition of
  // the moment the reader asked for (CLAUDE.md row B), so the form states it — once per
  // moment and place, through the zone field's own `choose` — and says why under the
  // zone field. A zone the reader changes afterwards is theirs: it is not stated again,
  // and the note says what would keep the moment instead.
  //
  // The statement lasts exactly as long as its moment and place (zoneEntryModel
  // zoneFixStep): when either goes — another moment found, Now, another place, or typing
  // that releases the instant — a zone still as the form stated it is given back as it
  // was before, so the next moment is never read on a stated zone that nothing on screen
  // explains any more. A zone the reader has changed since stays theirs.
  const fixKey =
    instant && selectedPlace
      ? `${instant.utMs}|${instant.round}|${selectedPlace.lat},${selectedPlace.lng}`
      : null;
  const [zoneFix, setZoneFix] = useState<ZoneFix | null>(null);
  useEffect(() => {
    const step = zoneFixStep(zoneFix, fixKey, zone.model, shown);
    if (!step) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (step.kind === 'release') {
      if (step.restore) zone.restore(step.restore);
      setZoneFix(null);
      return;
    }
    if (!fixKey) return;
    const before = zone.model;
    const after = zone.choose(step.pick);
    setZoneFix({ key: fixKey, before, after });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [fixKey, zoneFix, shown, zone]);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  // Why the zone reads as a manual choice: only while it is still the one the form stated
  // ('overlap'), or — once the reader has changed it — while the zone they chose reads the
  // clock as the other occurrence ('overlapUnfixed'). A zone of theirs that keeps the
  // moment needs no note, and the form did not set it.
  const fixHolds = zoneFixHolds(zoneFix, fixKey, zone.model);
  const overlapNote =
    shown && zoneFix && zoneFix.key === fixKey && (fixHolds || shown.ambiguous)
      ? t(fixHolds ? 'chartForm.instant.overlap' : 'chartForm.instant.overlapUnfixed', {
          time: `${pad2(shown.hour)}:${pad2(shown.minute)}`,
          offset: formatUtcNotation(Math.round(shown.offsetSeconds)),
        })
      : null;

  // The 12-hour echo beside the time boxes (Lina, 2026-10-06): someone reading
  // "9:30 PM" off a certificate can type 09:30 and cast a chart twelve hours
  // out with nothing on screen contradicting them. It replaces the UT readback
  // as the error catch at the moment the error can enter. Never stored, never
  // shown elsewhere; hidden while the time is empty (an unknown time has no
  // half of the day). A bare hour reads as :00, as the save does.
  const echoId = useId();
  const echo = mHour != null ? twelveHour(mHour, mMinute ?? 0, t) : null;

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
      setError(t(isEvent ? 'chartForm.errorNoPlaceEvent' : 'chartForm.errorNoPlace'));
      return;
    }
    if (!name.trim()) {
      setError(t('chartForm.errorNoName'));
      return;
    }
    // The moment as SHOWN (an instant's clock, or what was typed) — what the boxes say
    // is what is saved.
    const year = mYear;
    const month = mMonth;
    const day = mDay;
    const hour = mHour;
    const minute = mMinute;
    if (year == null || month == null || day == null) {
      setError(t(isEvent ? 'chartForm.errorNoDateEvent' : 'chartForm.errorNoDate'));
      return;
    }
    // The time is optional (empty = unknown), but minutes without an hour is an
    // incomplete entry, not a statement — block it with an explanation. An hour
    // without minutes reads as on-the-hour (:00), the way people say times.
    if (hour == null && minute != null) {
      setError(t(isEvent ? 'chartForm.errorPartialTimeEvent' : 'chartForm.errorPartialTime'));
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
      // The chart's kind, written every time (2026-10-20): only 'event' is ever
      // stored, so a person's record is unchanged — and an event edited on a held
      // device, where the switch isn't shown, keeps its kind from `initial`.
      kind: kindField(kind),
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
    // Remember where this went, so the next chart of its kind starts there. A folder the
    // reader picked here, the list's open folder, the record's own and the last one they
    // used are all theirs, and are written as they always were. A folder the form only
    // SUGGESTED (one named for a found moment, which nobody picked) is not, and is never
    // written (CLAUDE.md rule 1) — or an unchosen "Mundane/Lunations" would become the
    // next chart's default without anyone having picked it. Picking it in the menu makes
    // it theirs.
    if (remembersFolder(folderOwn, suggestion)) {
      if (kind === 'event') saveLastEventFolder(folder);
      else saveLastFolder(folder);
    }
    onSubmit(chart);
  };

  const pickSuggestion = (s: GeocodeResult) => {
    setSelectedPlace({ label: s.label, lat: s.lat, lng: s.lng });
    setLocationQuery(s.label);
    setLatText(String(s.lat));
    setLngText(String(s.lng));
  };

  // A relationship chart (a composite, a Davison) is two people's, never an event's.
  const kindSwitch = (eventsOn || eventsTeaser) && !initial?.composite && !initial?.davison && initial?.tag !== 'space';

  return (
    <form className="birth-form birth-fields" onSubmit={handleSubmit}>
        {/* What kind of moment this is (2026-10-20), first because it decides what the
            fields below are called. Shown only while event charts are on offer. */}
        {kindSwitch && (
          <SplitSelect<ChartKindOf>
            className="kind-switch"
            ariaLabel={t('chartForm.kind.aria')}
            value={eventsOn ? kind : 'person'}
            onSelect={(v) => (v === 'event' && !eventsOn ? nudgeAction() : chooseKind(v))}
            options={[
              {
                value: 'person',
                label: t('chartForm.kind.person'),
                tip: t('chartForm.kind.person'),
                hint: t('chartForm.kind.personHint'),
              },
              {
                value: 'event',
                label: t('chartForm.kind.event'),
                tip: t('chartForm.kind.event'),
                // Below the rung, its own locked note follows what it is. (It borrowed the theme
                // rows' note until 2026-10-23, which a build that tiers themes retunes to name them.)
                hint: eventsOn
                  ? t('chartForm.kind.eventHint')
                  : `${t('chartForm.kind.eventHint')} ${t('chartForm.kind.eventLockedNote')}`,
                // Below the rung the ADV badge follows the word, as a suffix, and the tip wears it
                // too (SplitSelectOption.tier; Salvatore, 2026-10-23: it led the word, low, and the
                // tip had none). The calendar mark leads once the rung is reached.
                icon: eventsOn ? <TagIcon tag="event" /> : undefined,
                tier: eventsOn ? undefined : 'adv',
              },
            ]}
          />
        )}
        <label>
          <span>{t('chartForm.name')}</span>
          <div className="name-field">
            <input
              type="text"
              value={name}
              maxLength={NAME_HARD_LIMIT}
              onChange={(e) => setNameOwn(e.target.value)}
              placeholder={t('chartForm.namePlaceholder')}
              autoFocus={autoFocusName}
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
          value={{ year: mYear, month: mMonth, day: mDay, hour: mHour, minute: mMinute }}
          yearHint={t('chartForm.yearRangeTip', {
            min: BIRTH_YEAR_MIN,
            max: BIRTH_YEAR_MAX,
          })}
          timeClearable
          timeHint={isEvent ? t('chartForm.timeInfo.hintBlankEvent') : undefined}
          onChange={(v) => {
            // Typing is the reader's own statement of the moment: it releases an
            // instant, keeping the clock it showed with this one change on top. And the
            // found event's suggestion with it, as Now does — the moment is no longer the
            // event's, and a dated name would re-date itself to whatever was typed.
            setInstant(null);
            setFound(null);
            setYear(v.year);
            setMonth(v.month);
            setDay(v.day);
            setHour(v.hour);
            setMinute(v.minute);
          }}
          timeSuffix={
            (echo || shown?.ut) && (
              <>
                {/* No place yet, so the instant's clock is Universal Time. */}
                {shown?.ut && <span className="moment-ut">{t('chartForm.instant.utSuffix')}</span>}
                {echo && (
                  <span className="time-echo" aria-hidden="true">
                    {echo}
                  </span>
                )}
                {/* What the time boxes are described by: the echo is a visual
                    check, so it is described rather than announced live. */}
                {echo && (
                  <span id={echoId} hidden>
                    {t('chartForm.timeEcho.aria', { echo })}
                  </span>
                )}
              </>
            )
          }
          timeDescribedBy={echo ? echoId : undefined}
        />
        {/* No Now button beside it: Lina dropped it on 21 Oct 2026 (§3) — No chart with the
            Transits overlay already shows this minute's sky, and a Now chart would fill
            libraries with moments nobody chose. */}
        {isEvent && !initial?.composite && (
          <div className="moment-actions">
            {/* Find the moment (2026-10-20): opens the panel below, which searches the sky
                for the event this chart is about and fills these boxes with it. */}
            <TipButton
              type="button"
              id={findButtonId}
              className={`moment-action${finderShown ? ' is-on' : ''}`}
              aria-expanded={finderShown}
              aria-controls={finderShown ? finderId : undefined}
              onClick={() => setFinderOpen((v) => !v)}
              placement="top"
              tip={t('eventFinder.openTip')}
              hint={t('eventFinder.openHint')}
            >
              {t('eventFinder.open')}
            </TipButton>
          </div>
        )}
        {finderShown && (
          <EventFinder
            id={finderId}
            anchor={finderAnchor}
            zodiac={zodiac}
            onFound={takeFound}
            onClose={() => {
              setFinderOpen(false);
              document.getElementById(findButtonId)?.focus();
            }}
          />
        )}
        {/* While the boxes show an instant: in UT until there is a place, then on the
            place's clock, which a zone change moves. One string each. */}
        {shown && (
          <p className="instant-note">
            {t(shown.ut ? 'chartForm.instant.utUntilPlace' : 'chartForm.instant.followsZone')}
          </p>
        )}
        {/* An EMPTY time means "birth time unknown" (never for a composite — its
            moment is synthesized). The note appears once the user has moved PAST
            the time — they've started on the birthplace with the boxes still
            blank — and says what will happen on save, so the grey "?" tag and the
            hidden lines never surprise anyone. */}
        {!initial?.composite &&
          noTime &&
          (selectedPlace != null || locationQuery.trim() !== '') && (
            <p className="time-unknown-note">
              {t(isEvent ? 'chartForm.timeUnknown.hintEvent' : 'chartForm.timeUnknown.hint')}
            </p>
          )}
        </fieldset>

        {/* Both of a chart's places — the birthplace, and where its subject
            lives NOW (optional; unset means "the birthplace") — share this one
            search box. The caption row doubles as the switch, and the `key`
            remounts the field on a switch so it opens on the new target's
            settled value with no half-typed draft carried across. */}
        <div className="location-field">
          {/* An event chart has one place, the event's (2026-10-20): "Lives now" is a
              person's, so its tab goes and the caption names the one place. The
              record's `home` is still carried through the save untouched, so a chart
              switched to Event and back keeps it. */}
          {isEvent ? (
            <div className="location-field-tabs">
              <span className="location-field-tab is-on is-caption">{t('chartForm.place')}</span>
            </div>
          ) : (
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
          )}
          {/* The shared place-search field: same box, same keys, same scopes as
              every other place search in the app. The birthplace target is
              restricted to cities — a birthplace is a settlement, never a whole
              region or country — while Home accepts any place kind, like the
              other surfaces that set it. The online reach (on by default)
              covers what the bundled index has not: small towns and older
              place names. Home adopts a pick's label so it shows settled, and a
              Clear empties the box. Home also offers, before anything is typed,
              the map pin and the reader's own places — the way in for a home no
              search finds (2026-10-23); a birthplace offers neither. So Home's
              box opens EMPTY, its stored value shown on the ✓ line under it: a
              box opened on the stored name would hide those rows from exactly
              the reader who set a town first and has since pinned the house. */}
          <PlaceSearchField
            key={target}
            className={`chartform-place${target === 'home' ? ' chartform-home' : ''}`}
            kinds={target === 'birth' ? BIRTHPLACE_KINDS : undefined}
            library={target === 'home'}
            sections={
              target === 'home'
                ? mapPinSection(mapPin, t('chartForm.homeMapPin'), (h) =>
                    setHome({ ...h, updatedAt: Date.now() }),
                  )
                : undefined
            }
            omitAt={target === 'home' ? home : undefined}
            missHint={target === 'home' ? t('chartForm.homeMissHintForm') : undefined}
            initialQuery={(target === 'birth' ? selectedPlace?.label : undefined) ?? ''}
            adoptQuery={target === 'birth' ? adoptedLabel : (home?.label ?? '')}
            // What a search here ranks toward: the place this target last held. For
            // the birthplace that is the coordinates, which typing over the box leaves
            // alone, so picking a town and then typing its street keeps the town in
            // view. Only a hint (`near`, not `bias`): the reader may be replacing
            // that place with one anywhere else.
            near={
              target === 'birth'
                ? summaryLat != null && summaryLng != null
                  ? { lat: summaryLat, lng: summaryLng }
                  : undefined
                : (home ?? undefined)
            }
            keepQueryOnPick
            autoFocus={placeTouched}
            onQueryChange={(q) => {
              if (target !== 'birth') return;
              setLocationQuery(q);
              // Typing over a resolved place unsettles it: submitting needs a
              // picked result, not a half-typed name.
              setSelectedPlace((p) => (p && p.label === q ? p : null));
            }}
            onPick={(s) =>
              target === 'birth'
                ? pickSuggestion(s)
                : setHome({ label: homeLabelOf(s), lat: s.lat, lng: s.lng, updatedAt: Date.now() })
            }
            placeholder={t(
              target === 'birth'
                ? 'chartForm.birthplacePlaceholder'
                : 'chartForm.homePlaceholder',
            )}
            ariaLabel={t(target === 'birth' ? (isEvent ? 'chartForm.place' : 'chartForm.birthplace') : 'chartForm.homeAria')}
            strings={placeSearchStrings}
          />
          {target === 'birth' && selectedPlace && (
            <p className="resolved">{t('chartForm.resolved', { label: selectedPlace.label })}</p>
          )}
          {target === 'home' && (
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
        <TimeZoneField zone={zone} hasPlace={!!selectedPlace} event={isEvent} />
        {/* Why the zone reads as a manual choice after a moment in the repeated autumn
            hour (the fix effect above) — or, once the reader has changed it, what would
            keep the moment. One string. */}
        {overlapNote && <p className="instant-note instant-note--zone">{overlapNote}</p>}

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
                      hint: t(isEvent ? 'chartForm.rating.unsetHintEvent' : 'chartForm.rating.unsetHint'),
                    },
                    // An event chart's X says "No time", not "No birth time" (2026-10-20).
                    ...SOURCE_RATINGS.map((code) => ({
                      value: code,
                      label: `${code} · ${t(
                        isEvent && code === 'X' ? 'chartForm.rating.XEvent' : (`chartForm.rating.${code}` as 'chartForm.rating.AA'),
                      )}`,
                      hint: t(
                        isEvent && code === 'X'
                          ? 'chartForm.ratingHint.XEvent'
                          : (`chartForm.ratingHint.${code}` as 'chartForm.ratingHint.AA'),
                      ),
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
              onChange={setFolderOwn}
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
