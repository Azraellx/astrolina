// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The chart form's time-zone state, 2026-10-02: Auto plus four ways to state a
// zone in the terms a birth record uses — shown since 2026-10-05 as one list,
// and since 2026-10-07 as Lina's radios, both of which drive `choose`; the
// four ways' own controls are hidden, not gone.
// lib/atlas/zoneEntry.ts holds the arithmetic; zoneEntryModel.ts holds what the
// field shows and will save, as plain functions a verify script can drive; this
// only keeps it in React.

import { useMemo, useState } from 'react';
import type { StoredChart } from '../../lib/chartLibrary';
import type { DaylightCode, OffsetDirection, ZoneEntryMode, ZoneMoment } from '../../lib/atlas/zoneEntry';
import {
  initialModel,
  openZone,
  wallClockForInstant,
  zoneReduce,
  zoneView,
  type FormInstant,
  type InstantWallClock,
  type ZoneAction,
  type ZoneInputs,
  type ZoneModel,
  type ZonePick,
  type ZoneView,
} from './zoneEntryModel';

export interface ZoneEntryState extends ZoneView {
  setMode: (mode: ZoneEntryMode) => void;
  /** A catalogue id, or null for the unnamed imported standard offset. */
  pickStandard: (zoneId: string | null) => void;
  setDaylight: (code: DaylightCode) => void;
  typeOffset: (text: string) => void;
  setDirection: (dir: OffsetDirection) => void;
  takeLmt: () => void;
  takeUt: () => void;
  pickIana: (zone: string) => void;
  pickUtc: (hours: number) => void;
  /** The form's list: a way and its zone in one step. Returns the field's state it
   *  produced, for a caller that has to know later whether it is still in force. */
  choose: (pick: ZonePick) => ZoneModel;
  /** The field's own state, and a way to put an earlier one back — for the form's
   *  statement of a repeated hour's zone, which gives back what it replaced once its
   *  moment has gone (zoneEntryModel zoneFixStep, 2026-10-20). */
  model: ZoneModel;
  restore: (model: ZoneModel) => void;
  /** While the form holds an instant (2026-10-20): the date and time it shows, read
   *  in the zone this field holds (zoneEntryModel wallClockForInstant). The field's
   *  moment — `at`, and so `toSave` — is then THAT clock, not the arguments'. Null
   *  without an instant. */
  derived: InstantWallClock | null;
}

/**
 * `instant` (optional, 2026-10-20): a moment the form was handed (the Now button, a
 * moment found for an event chart). While it is set, the date and time arguments are
 * ignored and the field derives the clock from the instant instead — through the same
 * zoneView the save uses, so changing the zone here moves the clock and never the
 * moment. Omitted or null, the field is exactly what it was.
 */
export function useZoneEntry(
  initial: StoredChart | null | undefined,
  place: { lat: number; lng: number } | null,
  year: number | null,
  month: number | null,
  day: number | null,
  hour: number,
  minute: number,
  instant: FormInstant | null = null,
): ZoneEntryState {
  const [opened] = useState(() => openZone(initial));
  const [model, setModel] = useState(() => initialModel(opened, initial));

  const derived = useMemo(
    () => (instant ? wallClockForInstant(model, { initial, opened }, place, instant) : null),
    [model, initial, opened, place, instant],
  );
  const at = useMemo<ZoneMoment | null>(() => {
    if (derived) {
      // In UT (no place yet) there is no moment for a zone to be read at.
      return place && !derived.ut
        ? {
            lat: place.lat,
            lng: place.lng,
            year: derived.year,
            month: derived.month,
            day: derived.day,
            hour: derived.hour,
            minute: derived.minute,
          }
        : null;
    }
    return place && year != null && month != null && day != null
      ? { lat: place.lat, lng: place.lng, year, month, day, hour, minute }
      : null;
  }, [derived, place, year, month, day, hour, minute]);
  const inputs = useMemo<ZoneInputs>(() => ({ initial, opened, at }), [initial, opened, at]);
  const view = useMemo(() => zoneView(model, inputs), [model, inputs]);

  const dispatch = (action: ZoneAction) => {
    const next = zoneReduce(model, action, view, inputs);
    setModel(next);
    return next;
  };

  return {
    ...view,
    derived,
    model,
    restore: setModel,
    setMode: (mode) => dispatch({ type: 'mode', mode }),
    pickStandard: (zone) => dispatch({ type: 'standard', zone }),
    setDaylight: (code) => dispatch({ type: 'daylight', code }),
    typeOffset: (text) => dispatch({ type: 'type', text }),
    setDirection: (dir) => dispatch({ type: 'direction', dir }),
    takeLmt: () => dispatch({ type: 'lmt' }),
    takeUt: () => dispatch({ type: 'ut' }),
    pickIana: (zone) => dispatch({ type: 'iana', zone }),
    pickUtc: (hours) => dispatch({ type: 'utc', hours }),
    choose: (pick) => dispatch({ type: 'choose', pick }),
  };
}
