// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

export interface BirthData {
  name: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  tzOffset: number;
  /**
   * False when the birth TIME is not actually known: hour/minute then hold a
   * local-noon placeholder (12:00) so the moment stays computable, and every
   * time-of-day-dependent layer (angles, houses, the angular map lines, parans,
   * local space…) must degrade honestly rather than render a confident noon
   * chart. Absent (or true) means the time is real — so every chart saved
   * before this field existed keeps meaning what it always did.
   */
  timeKnown?: boolean;
  birthplace: {
    label: string;
    lat: number;
    lng: number;
  };
}

/** True when a chart's birth TIME is unknown (see BirthData.timeKnown; absent = known). */
export function timeUnknown(b: BirthData | null | undefined): boolean {
  return !!b && b.timeKnown === false;
}

/**
 * A PROVISIONAL copy of a chart at `minutes` past local midnight — the record as
 * it WOULD be if that were the birth time.
 *
 * This exists so a feature can ask "what would the map look like at 04:12?"
 * without writing anything. The result is derived on every read and thrown away;
 * the stored chart is never touched, which is the whole point — a birth time
 * being tried on is a standing condition, not an event, and the record has to
 * still say "unknown" when the trying stops. Callers therefore hold the MINUTE
 * in state and derive the chart, never the reverse.
 *
 * `timeKnown` is dropped rather than set true: absent already means known (see
 * above), and leaving the explicit flag off keeps the provisional record
 * distinguishable from one somebody actually saved.
 *
 * Null `minutes` (or a chart with no moment of its own, i.e. a composite)
 * returns the input untouched, so the hypothesis is a no-op wherever it could
 * not mean anything.
 */
export function applyTimeHypothesis<T extends BirthData>(
  b: T | null,
  minutes: number | null,
): T | null {
  if (!b || minutes == null) return b;
  if ((b as { composite?: unknown }).composite) return b;
  const m = Math.max(0, Math.min(1439, Math.round(minutes)));
  const { timeKnown: _dropped, ...rest } = b;
  return { ...rest, hour: Math.floor(m / 60), minute: m % 60 } as T;
}

// The charts a fresh install starts with, in display order; the first is the
// selected one. Jim Lewis — who invented Astro*Carto*Graphy — is the lone, fitting
// default; with no second chart, the synastry bar offers an "Add person" prompt.
//
// Birth date + place are documented (Wikipedia / Astro-Databank); the 09:30
// birth time is the commonly-cited record (Astro-Seek). New York City observed
// daylight saving in summer 1941, so the zone is EDT (UTC−4).
export const SEED_BIRTHS: BirthData[] = [
  {
    name: 'Jim Lewis',
    year: 1941,
    month: 6,
    day: 5,
    hour: 9,
    minute: 30,
    tzOffset: -4,
    birthplace: {
      label: 'Yonkers, New York, United States',
      lat: 40.9312,
      lng: -73.8988,
    },
  },
];
