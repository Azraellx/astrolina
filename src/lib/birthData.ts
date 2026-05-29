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
