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

declare module 'astronomia/data' {
  interface PlanetData {
    name: string;
    L: unknown;
    B: unknown;
    R: unknown;
  }
  const data: {
    vsop87Bearth: PlanetData;
    vsop87Bmercury: PlanetData;
    vsop87Bvenus: PlanetData;
    vsop87Bmars: PlanetData;
    vsop87Bjupiter: PlanetData;
    vsop87Bsaturn: PlanetData;
    vsop87Buranus: PlanetData;
    vsop87Bneptune: PlanetData;
  };
  export default data;
}
