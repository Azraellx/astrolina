declare module 'astronomia' {
  export const julian: {
    CalendarGregorian: new (year: number, month: number, day: number) => {
      toJD(): number;
    };
  };

  interface PlanetData {
    name: string;
    L: unknown;
    B: unknown;
    R: unknown;
  }

  interface SphericalCoord {
    lon: number;
    lat: number;
    range: number;
  }

  interface EquatorialCoord {
    ra: number;
    dec: number;
  }

  export const planetposition: {
    Planet: new (data: PlanetData) => {
      position(jde: number): SphericalCoord;
      position2000(jde: number): SphericalCoord;
    };
  };

  type PlanetInstance = InstanceType<typeof planetposition.Planet>;

  export const elliptic: {
    position(planet: PlanetInstance, earth: PlanetInstance, jde: number): EquatorialCoord;
  };

  export const solar: {
    apparentEquatorialVSOP87(earth: PlanetInstance, jde: number): EquatorialCoord & { range: number };
  };

  export const moonposition: {
    position(jde: number): SphericalCoord;
  };

  export const pluto: {
    astrometric(jde: number, earth: PlanetInstance): EquatorialCoord;
  };

  export const sidereal: {
    mean(jd: number): number;
    apparent(jd: number): number;
  };

  export const nutation: {
    nutation(jd: number): [number, number];
    meanObliquity(jd: number): number;
  };

  export const coord: {
    Ecliptic: new (lon: number, lat: number) => {
      lon: number;
      lat: number;
      toEquatorial(epsilon: number): EquatorialCoord;
    };
  };

}

interface Vsop87PlanetData {
  name: string;
  L: unknown;
  B: unknown;
  R: unknown;
}

declare module 'astronomia/data/vsop87Bearth' {
  const d: Vsop87PlanetData;
  export default d;
}
declare module 'astronomia/data/vsop87Bmercury' {
  const d: Vsop87PlanetData;
  export default d;
}
declare module 'astronomia/data/vsop87Bvenus' {
  const d: Vsop87PlanetData;
  export default d;
}
declare module 'astronomia/data/vsop87Bmars' {
  const d: Vsop87PlanetData;
  export default d;
}
declare module 'astronomia/data/vsop87Bjupiter' {
  const d: Vsop87PlanetData;
  export default d;
}
declare module 'astronomia/data/vsop87Bsaturn' {
  const d: Vsop87PlanetData;
  export default d;
}
declare module 'astronomia/data/vsop87Buranus' {
  const d: Vsop87PlanetData;
  export default d;
}
declare module 'astronomia/data/vsop87Bneptune' {
  const d: Vsop87PlanetData;
  export default d;
}
