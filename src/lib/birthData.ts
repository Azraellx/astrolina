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
