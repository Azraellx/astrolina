// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The chart form's time-zone state, 2026-10-02: Auto plus four ways to state a
// zone in the terms a birth record uses — shown since 2026-10-05 as one list,
// which drives `choose`; the four ways' own controls are hidden, not gone.
// lib/atlas/zoneEntry.ts holds the arithmetic; zoneEntryModel.ts holds what the
// field shows and will save, as plain functions a verify script can drive; this
// only keeps it in React.

import { useMemo, useState } from 'react';
import type { StoredChart } from '../../lib/chartLibrary';
import type { DaylightCode, OffsetDirection, ZoneEntryMode, ZoneMoment } from '../../lib/atlas/zoneEntry';
import {
  initialModel,
  openZone,
  zoneReduce,
  zoneView,
  type ZoneAction,
  type ZoneInputs,
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
  /** The form's list: a way and its zone in one step. */
  choose: (pick: ZonePick) => void;
}

export function useZoneEntry(
  initial: StoredChart | null | undefined,
  place: { lat: number; lng: number } | null,
  year: number | null,
  month: number | null,
  day: number | null,
  hour: number,
  minute: number,
): ZoneEntryState {
  const [opened] = useState(() => openZone(initial));
  const [model, setModel] = useState(() => initialModel(opened, initial));

  const at = useMemo<ZoneMoment | null>(
    () =>
      place && year != null && month != null && day != null
        ? { lat: place.lat, lng: place.lng, year, month, day, hour, minute }
        : null,
    [place, year, month, day, hour, minute],
  );
  const inputs = useMemo<ZoneInputs>(() => ({ initial, opened, at }), [initial, opened, at]);
  const view = useMemo(() => zoneView(model, inputs), [model, inputs]);

  const dispatch = (action: ZoneAction) => setModel(zoneReduce(model, action, view, inputs));

  return {
    ...view,
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
