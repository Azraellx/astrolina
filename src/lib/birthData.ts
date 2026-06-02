export interface BirthData {
  name: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  tzOffset: number;
  birthplace: {
    label: string;
    lat: number;
    lng: number;
  };
}

export const TEST_BIRTH: BirthData = {
  name: 'Albert Einstein',
  year: 1879,
  month: 3,
  day: 14,
  hour: 11,
  minute: 30,
  tzOffset: 0.6166666666666667,
  birthplace: {
    label: 'Ulm, Germany',
    lat: 48.4011,
    lng: 9.9876,
  },
};

// The charts a fresh install starts with, in display order; the first is the
// selected one. Jim Lewis — who invented Astro*Carto*Graphy — is a fitting
// default; Einstein doubles as a ready-made synastry partner.
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
  TEST_BIRTH,
];
